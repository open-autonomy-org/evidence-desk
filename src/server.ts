// The local app: a loopback HTTP server over one workspace. It serves the page and a JSON API whose every change
// goes through actions.ts. Requests must name this server as Host, and changes must come from its own page.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { addEvidenceUpload, adopt, approvePolicy, savePolicyText, saveRegisterRow, setPolicyOwner, setScope, updateControl } from './actions.ts';
import { categories, criteria, questions } from './catalog.ts';
import { ConflictError, inside, readVersioned, writeVersioned } from './files.ts';
import { computeGaps } from './gaps.ts';
import { importOpenAutonomy, seamFindings, type Snapshot } from './open-autonomy.ts';
import { existsSync, readdirSync } from 'node:fs';
import { COLLECTORS, checkTitle, configureCollector, readSettings, runChecks } from './automation.ts';
import { actOnRequest, draft, exportPackage, importReturn, listRequests, readEngagement } from './audit.ts';
import { questionnaireText } from './xlsx.ts';
import { buildTrustCenter, importQuestionnaireText, questionnaireCsv, reviewAnswer } from './trust.ts';
import { frameworkState } from './frameworks.ts';
import { decideAccount, openIncident, signOffAccessReview, startAccessReview, submitResponse, updateIncident } from './operations.ts';
import { schema } from './schema.ts';
import { loadWorkspace, REGISTERS, type RegisterName } from './workspace.ts';

const UI = join(import.meta.dirname, 'ui');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function state(root: string) {
  const ws = loadWorkspace(root);
  return {
    root,
    organization: ws.manifest?.data.organization ?? '',
    scope: ws.scope ? { answers: ws.scope.data.answers, sources: ws.scope.data.sources ?? {}, version: ws.scope.version } : null,
    questions, criteria, categories,
    controls: ws.controls.map((c) => ({ ...c.data, version: c.version })),
    policies: ws.policies.map((p) => ({ ...p.data, version: p.version, text: p.text?.body ?? '', textVersion: p.text?.version ?? null })),
    registers: Object.fromEntries(REGISTERS.map((n) => [n, ws.registers[n] ? {
      columns: ws.registers[n]!.data.columns, rows: ws.registers[n]!.data.rows, version: ws.registers[n]!.version,
      required: schema(`register-${n}`).required ?? [], enums: Object.fromEntries(Object.entries(schema(`register-${n}`).properties ?? {}).filter(([, s]) => s.enum).map(([k, s]) => [k, s.enum])),
    } : null])),
    evidence: ws.evidence.map((e) => e.data),
    forms: ws.forms.map((f) => ({ ...f.data, version: f.version })),
    responses: ws.responses.map((r) => r.data),
    accessReviews: ws.accessReviews.map((r) => ({ ...r.data, version: r.version })),
    incidents: ws.incidents.map((r) => ({ ...r.data, version: r.version })),
    problems: ws.problems,
    gaps: computeGaps(ws),
    frameworks: ws.manifest?.data.frameworks ?? ['soc2'],
    iso27001: (ws.manifest?.data.frameworks ?? []).includes('iso27001') ? frameworkState(ws, 'iso27001') : null,
    trust: (() => { const t = readVersioned(root, 'trust.json'); return t ? JSON.parse(t.text) : null; })(),
    questionnaires: (existsSync(join(root, 'questionnaires')) ? readdirSync(join(root, 'questionnaires')).filter((f) => f.endsWith('.json')).sort() : []).map((f) => {
      const r = readVersioned(root, `questionnaires/${f}`)!; return { ...JSON.parse(r.text), version: r.version }; }),
    audits: (() => {
      const dir = join(root, 'audits');
      return (existsSync(dir) ? readdirSync(dir) : []).filter((d) => existsSync(join(dir, d, 'engagement.json'))).map((d) => ({
        engagement: readEngagement(root, d).data, requests: listRequests(root, d).map((r) => ({ ...r.data, version: r.version })),
        drafts: existsSync(join(dir, d, 'drafts')) ? readdirSync(join(dir, d, 'drafts')).map((f) => `audits/${d}/drafts/${f}`) : [] }));
    })(),
    automation: (() => {
      let settings: ReturnType<typeof readSettings>['settings'] = [];
      try { settings = readSettings(root).settings; } catch { settings = []; }
      const runs = [...ws.runs].sort((a, b) => b.data.started_at.localeCompare(a.data.started_at)).slice(0, 20).map((r) => r.data);
      return { collectors: COLLECTORS.map((c) => ({ id: c.id, title: c.title, params: c.params, credentials: c.credentials, checks: c.checks.map((k) => ({ id: k.id, title: k.title, controls: k.controls })),
        settings: settings.find((x) => x.id === c.id) ?? null, credentialsPresent: c.credentials.every((k) => !!process.env[k]) })), runs, titles: Object.fromEntries(COLLECTORS.flatMap((c) => c.checks.map((k) => [k.id, checkTitle(k.id)]))) };
    })(),
    openAutonomy: (() => {
      const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
      if (!latest) return null;
      const snap = JSON.parse(latest.text) as Snapshot;
      const dir = join(root, 'sources/open-autonomy/completeness');
      const checks = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readVersioned(root, `sources/open-autonomy/completeness/${f}`)!.text)) : [];
      return { snapshot: snap, findings: seamFindings(snap), checks };
    })(),
  };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 50 * 1024 * 1024) throw new Error('request is larger than 50 MB'); chunks.push(c as Buffer); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const send = (res: ServerResponse, status: number, data: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
};

export function serve(root: string, port: number): void {
  const origin = `http://127.0.0.1:${port}`;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const server = createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host ?? '')) return send(res, 421, { error: 'unexpected Host' });
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return send(res, 200, state(root));
        if (url.pathname.startsWith('/questionnaire/')) {
          res.setHeader('content-disposition', 'attachment; filename="answers.csv"');
          return send(res, 200, questionnaireCsv(root, decodeURIComponent(url.pathname.slice('/questionnaire/'.length))), 'text/csv; charset=utf-8');
        }
        if (url.pathname.startsWith('/files/')) {
          const rel = decodeURIComponent(url.pathname.slice('/files/'.length));
          return send(res, 200, readFileSync(inside(root, rel)), 'application/octet-stream');
        }
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!/^[a-z-]+\.(html|js|css)$/.test(file)) return send(res, 404, { error: 'not found' });
        return send(res, 200, readFileSync(join(UI, file)), TYPES[extname(file)]);
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      const from = req.headers.origin;
      if (from !== `http://${req.headers.host}`) return send(res, 403, { error: 'changes must come from this app' });
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, { error: 'send JSON' });
      const b = await body(req);
      const s = (k: string) => String(b[k] ?? '');
      switch (url.pathname) {
        case '/api/scope': setScope(root, b.answers as Record<string, unknown>, s('version')); break;
        case '/api/adopt': return send(res, 200, { result: adopt(root), state: state(root) });
        case '/api/control': updateControl(root, s('id'), b.patch as Record<string, unknown>, s('version')); break;
        case '/api/policy/text': savePolicyText(root, s('id'), s('text'), s('version')); break;
        case '/api/policy/owner': setPolicyOwner(root, s('id'), s('owner'), s('version')); break;
        case '/api/policy/approve': approvePolicy(root, s('id'), s('by'), s('textVersion'), s('version')); break;
        case '/api/register': {
          const name = s('name') as RegisterName;
          saveRegisterRow(root, name, b.row as Record<string, string>, s('version'), b.replaceId === undefined ? undefined : s('replaceId'));
          break;
        }
        case '/api/evidence': addEvidenceUpload(root, {
          title: s('title'), controls: (b.controls as string[]) ?? [], recorded_by: s('by'), filename: s('filename'),
          bytes: Buffer.from(s('data'), 'base64'), period: b.period as { start: string; end: string } | undefined, notes: s('notes') || undefined,
        }); break;
        case '/api/respond': submitResponse(root, { form: s('form'), person: s('person'), answers: b.answers as Record<string, string>, formVersion: s('version'), identity: 'local-app-selection' }); break;
        case '/api/access-review/start': {
          const listing = `evidence/files/listings/${Date.now()}-${s('filename').replace(/[^A-Za-z0-9._-]/g, '_') || 'listing.csv'}`;
          if (!s('generated_by').trim()) throw new Error('say how the user listing was produced, so its completeness can be checked');
          writeVersioned(root, listing, Buffer.from(s('data'), 'base64'), null);
          const id = startAccessReview(root, { system: s('system'), reviewer: s('reviewer'), start: s('start'), end: s('end'), listing, generated_by: s('generated_by') });
          return send(res, 200, { id, state: state(root) });
        }
        case '/api/access-review/decide': decideAccount(root, s('id'), s('version'), s('account'), b.patch as { decision: string }); break;
        case '/api/access-review/sign-off': signOffAccessReview(root, s('id'), s('version'), s('by')); break;
        case '/api/incident/open': return send(res, 200, { id: openIncident(root, { title: s('title'), severity: s('severity'), by: s('by'), note: s('note'), owner: s('owner') || undefined }), state: state(root) });
        case '/api/incident/update': updateIncident(root, s('id'), s('version'), { by: s('by'), note: s('note'), status: (s('status') || undefined) as never,
          customer_impact: s('customer_impact') || undefined, notification: s('notification') || undefined, review: s('review') || undefined }); break;
        case '/api/audit/request': actOnRequest(root, s('engagement'), s('id'), s('version'), { by: s('by'), side: 'client', text: s('text') || undefined, status: (s('status') || undefined) as never,
          evidence: (b.evidence as string[] | undefined)?.length ? b.evidence as string[] : undefined, population: s('population') || undefined, sample: b.sample as never }); break;
        case '/api/audit/draft': draft(root, s('engagement'), s('kind') as 'description', s('to') || undefined); break;
        case '/api/audit/export': return send(res, 200, { result: exportPackage(root, s('engagement'), s('out')), state: state(root) });
        case '/api/audit/import-return': return send(res, 200, { result: importReturn(root, s('engagement'), s('dir')), state: state(root) });
        case '/api/trust/build': return send(res, 200, { result: buildTrustCenter(root, s('out')), state: state(root) });
        case '/api/questionnaire/import': return send(res, 200, { result: importQuestionnaireText(root, questionnaireText(Buffer.from(s('data'), 'base64'), s('filename')), s('filename'), s('name')), state: state(root) });
        case '/api/questionnaire/answer': reviewAnswer(root, s('id'), s('version'), s('question'), { answer: s('answer'), by: s('by') }); break;
        case '/api/collectors': configureCollector(root, s('id'), { enabled: b.enabled as boolean, params: b.params as Record<string, string> }); break;
        case '/api/run': { const run = await runChecks(root, s('by')); return send(res, 200, { run, state: state(root) }); }
        case '/api/open-autonomy/import': return send(res, 200, { report: importOpenAutonomy(root, s('repo'), s('commit') || 'HEAD', s('by')), state: state(root) });
        default: return send(res, 404, { error: 'not found' });
      }
      return send(res, 200, { state: state(root) });
    } catch (e) {
      const conflict = e instanceof ConflictError || /changed (on disk )?since/.test((e as Error).message);
      return send(res, conflict ? 409 : 400, { error: (e as Error).message, conflict });
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Evidence Desk is open at ${origin}/ for ${root}\nPress Ctrl-C to stop.`));
}
