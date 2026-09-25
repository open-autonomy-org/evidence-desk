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
import { attest, decide, dropFramework, frameworkState, stateNotMet, targetFramework } from './frameworks.ts';
import { certifications, recordCertification, type Certification } from './certifications.ts';
import { publishStatement, reportOf } from './trust.ts';
import { collectOpenAutonomyActivity } from './oa-platform.ts';
import { frameworkDescriptions, frameworkOf } from './catalog.ts';
import { policyReading } from './signing.ts';
import { pendingSignatures, prepareSignature, signsOnGitHub } from './signatures.ts';
import { commitTouched, statusOf, syncWorkspace } from './git.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { neededControls, targetsOf } from './targets.ts';
import { decideAccount, openIncident, signOffAccessReview, startAccessReview, submitResponse, updateIncident } from './operations.ts';
import { schema } from './schema.ts';
import { loadWorkspace, REGISTERS, type RegisterName } from './workspace.ts';

const UI = join(import.meta.dirname, 'ui');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function state(root: string) {
  const ws = loadWorkspace(root);
  return {
    root,
    // The workspace's Git state: its branch, how far it is from its remote as last fetched, and edits not yet committed.
    git: statusOf(root),
    // Whether signed acts are prepared as pull requests on GitHub (signatures.ts).
    signingOnGitHub: signsOnGitHub(root) !== null,
    organization: ws.manifest?.data.organization ?? '',
    scope: ws.scope ? { answers: ws.scope.data.answers, sources: ws.scope.data.sources ?? {}, version: ws.scope.version } : null,
    questions, criteria, categories,
    controls: ws.controls.map((c) => ({ ...c.data, version: c.version })),
    policies: ws.policies.map((p) => ({ ...p.data, version: p.version, text: p.text?.body ?? '', textVersion: p.text?.version ?? null, reading: policyReading(ws, p.data.id, p.text?.body ?? '') })),
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
    frameworks: targetsOf(ws),
    // Each target other than SOC 2, as its view shows it; and the controls the targets need (docs/decisions/0002).
    frameworkStates: Object.fromEntries(targetsOf(ws).filter((f) => f !== 'soc2').map((f) => [f, frameworkState(ws, f)])),
    needed: [...neededControls(ws)],
    // Every framework Evidence Desk maps and what it can become; the documents held; what the trust center and a
    // published statement would say (the badges); and whether this server may publish to or read from Open Autonomy,
    // which needs the project's key in its own environment (never in the page).
    frameworkCatalog: frameworkDescriptions,
    // Each document with the framework it is for (frameworkOf, the rule the badges use). A record that cannot be read is
    // reported, not allowed to take the rest of the app down; the badges then say nothing until it is fixed.
    ...(() => { try { return { certifications: certifications(root).map((c) => ({ ...c, for: frameworkOf(c) ?? null })), report: reportOf(root), documentsError: null }; }
      catch (e) { return { certifications: [], report: null, documentsError: (e as Error).message }; } })(),
    openAutonomyKey: Boolean(process.env.OPEN_AUTONOMY_BASE_URL && process.env.OPEN_AUTONOMY_KEY),
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

// What a change says in the workspace's history, and whose it is.
function describe(pathname: string, b: Record<string, unknown>): { message: string; person: string } {
  const s = (k: string) => String(b[k] ?? '');
  const person = s('by') || s('person') || s('reviewer');
  const what: Record<string, () => string> = {
    '/api/scope': () => 'Answer the scoping questions',
    '/api/adopt': () => 'Adopt the controls and policies the scope calls for',
    '/api/control': () => `Update control ${s('id')}`,
    '/api/policy/text': () => `Edit the text of policy ${s('id')}`,
    '/api/policy/owner': () => `Make ${s('owner') || 'no one'} the owner of policy ${s('id')}`,
    '/api/policy/approve': () => `Approve policy ${s('id')}${b.asIs === true ? ', the catalog template confirmed as is' : ''}`,
    '/api/register': () => `${b.replaceId === undefined ? 'Add to' : `Update ${s('replaceId')} in`} the ${s('name')} register`,
    '/api/evidence': () => `Add evidence: ${s('title')}`,
    '/api/respond': () => `Answer form ${s('form')}`,
    '/api/access-review/start': () => `Start an access review of ${s('system')}`,
    '/api/access-review/decide': () => `Decide account ${s('account')} in access review ${s('id')}`,
    '/api/access-review/sign-off': () => `Sign off access review ${s('id')}`,
    '/api/incident/open': () => `Open an incident: ${s('title')}`,
    '/api/incident/update': () => `Update incident ${s('id')}${s('status') ? ` (${s('status')})` : ''}`,
    '/api/audit/request': () => `Act on audit request ${s('id')} of ${s('engagement')}`,
    '/api/audit/draft': () => `Draft the ${s('kind')} for ${s('engagement')}`,
    '/api/audit/import-return': () => `Bring in the firm's responses for ${s('engagement')}`,
    '/api/frameworks/target': () => `Target ${s('id')}`,
    '/api/frameworks/drop': () => `Stop targeting ${s('id')}`,
    '/api/framework/decide': () => `Decide requirement ${s('requirement')} of ${s('id')}`,
    '/api/framework/not-met': () => `State requirements of ${s('id')} as not met`,
    '/api/frameworks/attest': () => `Sign the ${s('id')} self-attestation`,
    '/api/certifications/add': () => `Record a document: ${s('framework')} ${s('kind')}`,
    '/api/trust/publish': () => 'Publish the statement',
    '/api/open-autonomy/collect': () => `Collect ${s('account')}'s activity on Open Autonomy`,
    '/api/questionnaire/import': () => `Import questionnaire ${s('name') || s('filename')}`,
    '/api/questionnaire/answer': () => `Review answer ${s('question')} of questionnaire ${s('id')}`,
    '/api/collectors': () => `Configure collector ${s('id')}`,
    '/api/run': () => 'Run the collectors and checks',
    '/api/open-autonomy/import': () => 'Import the Open Autonomy project',
  };
  return { message: `${(what[pathname] ?? (() => pathname))()}${person ? ` (by ${person})` : ''}`, person };
}

// The changes that can record an act a person signs; where the workspace signs on GitHub they are prepared as pull
// requests for the signer (signatures.ts).
const SIGNABLE = new Set(['/api/policy/approve', '/api/respond', '/api/access-review/sign-off', '/api/incident/update', '/api/register', '/api/frameworks/attest']);

// One change, made on the workspace at `root` (the served one, or the separate worktree a signature is prepared in):
// its result for the page, or null for a route that does not exist.
async function handle(root: string, pathname: string, b: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const s = (k: string) => String(b[k] ?? '');
  switch (pathname) {
    case '/api/scope': setScope(root, b.answers as Record<string, unknown>, s('version')); break;
    case '/api/adopt': return { result: adopt(root) };
    case '/api/control': updateControl(root, s('id'), b.patch as Record<string, unknown>, s('version')); break;
    case '/api/policy/text': savePolicyText(root, s('id'), s('text'), s('version')); break;
    case '/api/policy/owner': setPolicyOwner(root, s('id'), s('owner'), s('version')); break;
    case '/api/policy/approve': approvePolicy(root, s('id'), s('by'), s('textVersion'), s('version'), b.asIs === true); break;
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
      return { id };
    }
    case '/api/access-review/decide': decideAccount(root, s('id'), s('version'), s('account'), b.patch as { decision: string }); break;
    case '/api/access-review/sign-off': signOffAccessReview(root, s('id'), s('version'), s('by')); break;
    case '/api/incident/open': return { id: openIncident(root, { title: s('title'), severity: s('severity'), by: s('by'), note: s('note'), owner: s('owner') || undefined }) };
    case '/api/incident/update': updateIncident(root, s('id'), s('version'), { by: s('by'), note: s('note'), status: (s('status') || undefined) as never,
      customer_impact: s('customer_impact') || undefined, notification: s('notification') || undefined, review: s('review') || undefined }); break;
    case '/api/audit/request': actOnRequest(root, s('engagement'), s('id'), s('version'), { by: s('by'), side: 'client', text: s('text') || undefined, status: (s('status') || undefined) as never,
      evidence: (b.evidence as string[] | undefined)?.length ? b.evidence as string[] : undefined, population: s('population') || undefined, sample: b.sample as never }); break;
    case '/api/audit/draft': draft(root, s('engagement'), s('kind') as 'description', s('to') || undefined); break;
    case '/api/audit/export': return { result: exportPackage(root, s('engagement'), s('out')) };
    case '/api/audit/import-return': return { result: importReturn(root, s('engagement'), s('dir')) };
    case '/api/frameworks/target': { const r = targetFramework(root, s('id')); return { result: r }; }
    case '/api/frameworks/drop': { const r = dropFramework(root, s('id')); return { result: r }; }
    case '/api/framework/decide': {
      const known = loadWorkspace(root).controls.map((c) => c.data.id);
      const input = b.exclude !== undefined ? { exclude: s('exclude') } : b.include ? { include: true } : b.clear ? { clearPosition: true }
        : b.position ? { position: { position: s('position') as 'partial' | 'not met', statement: s('statement') } } : null;
      if (!input) throw new Error('say what to decide: exclude, include, a position or clear');
      return { result: decide(root, s('id'), s('requirement'), input, known) };
    }
    case '/api/framework/not-met': {
      const reqs = Array.isArray(b.requirements) ? b.requirements.map(String) : [];
      return { result: { stated: stateNotMet(root, s('id'), reqs, s('statement')) } };
    }
    case '/api/frameworks/attest': return { result: attest(root, s('id'), s('by')) };
    case '/api/certifications/add': {
      // The uploaded document goes through the same door as the CLI's: recorded with its hash, the gate for a
      // self-attestation framework included.
      // Every document recorded here is for a framework on the page it was uploaded from.
      if (!s('target')) throw new Error('say which framework the document is for (target)');
      const dir = mkdtempSync(join(tmpdir(), 'upload-'));
      try {
        // Only the extension is kept: the record names the stored copy itself.
        const file = join(dir, `document${(/\.[A-Za-z0-9]{1,8}$/.exec(s('filename'))?.[0] ?? '.pdf').toLowerCase()}`);
        writeFileSync(file, Buffer.from(s('data'), 'base64'));
        const period = s('period_start') && s('period_end') ? { start: s('period_start'), end: s('period_end') } : undefined;
        const c = recordCertification(root, { framework: s('framework'), kind: s('kind') as Certification['kind'], issuer: s('issuer'), issued_on: s('issued_on'), ...(period ? { period } : {}),
          ...(s('valid_until') ? { valid_until: s('valid_until') } : {}), ...(s('target') ? { target: s('target') } : {}), file, by: s('by') });
        return { result: c };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    case '/api/trust/publish': {
      const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL, key = process.env.OPEN_AUTONOMY_KEY;
      if (!baseUrl || !key) throw new Error('publishing needs OPEN_AUTONOMY_BASE_URL and OPEN_AUTONOMY_KEY in the environment Evidence Desk was started in');
      const r = await publishStatement(root, { baseUrl, key });
      if (r.status !== 200) throw new Error(`the platform refused the statement (${r.status}): ${JSON.stringify((r.body as { error?: unknown }).error ?? r.body)}`);
      return { result: { ...r.body, page: r.page, readme: r.readme, readmeClosed: r.readmeClosed } };
    }
    case '/api/open-autonomy/collect': return { result: await collectOpenAutonomyActivity(root, { account: s('account'), start: s('start'), end: s('end'), by: s('by') }) };
    case '/api/trust/build': return { result: buildTrustCenter(root, s('out')) };
    case '/api/questionnaire/import': return { result: importQuestionnaireText(root, questionnaireText(Buffer.from(s('data'), 'base64'), s('filename')), s('filename'), s('name')) };
    case '/api/questionnaire/answer': reviewAnswer(root, s('id'), s('version'), s('question'), { answer: s('answer'), by: s('by') }); break;
    case '/api/collectors': configureCollector(root, s('id'), { enabled: b.enabled as boolean, params: b.params as Record<string, string> }); break;
    case '/api/run': { const run = await runChecks(root, s('by')); return { run }; }
    case '/api/open-autonomy/import': return { report: importOpenAutonomy(root, s('repo'), s('commit') || 'HEAD', s('by')) };
    default: return null;
  }
  return {};
}

export function serve(root: string, port: number): void {
  const origin = `http://127.0.0.1:${port}`;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const server = createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host ?? '')) return send(res, 421, { error: 'unexpected Host' });
      const url = new URL(req.url ?? '/', origin);
      if (req.method === 'GET') {
        if (url.pathname === '/api/state') return send(res, 200, state(root));
        // What waits for signatures on GitHub; reading it brings the workspace level with its remote first.
        if (url.pathname === '/api/signing') { const p = pendingSignatures(root); return send(res, 200, { ...p, state: state(root) }); }
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
      if (url.pathname === '/api/sync') { const status = syncWorkspace(root); return send(res, 200, { result: status, state: state(root) }); }
      const { message, person } = describe(url.pathname, b);
      if (SIGNABLE.has(url.pathname)) {
        const signed = await prepareSignature(root, message, (at) => handle(at, url.pathname, b));
        if (signed) return send(res, 200, { ...(signed.result ?? {}), prepared: signed.prepared, state: state(root) });
      }
      let result: Record<string, unknown> | null;
      try { result = await handle(root, url.pathname, b); }
      // Whatever a change wrote before it stopped is committed as such, so no write is left outside the history.
      catch (e) { commitTouched(root, `${message}: stopped with an error (${(e as Error).message.split('\n')[0].slice(0, 120)})`, person); throw e; }
      if (!result) return send(res, 404, { error: 'not found' });
      commitTouched(root, message, person);
      return send(res, 200, { ...result, state: state(root) });
    } catch (e) {
      const conflict = e instanceof ConflictError || /changed (on disk )?since/.test((e as Error).message);
      return send(res, conflict ? 409 : 400, { error: (e as Error).message, conflict });
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Evidence Desk is open at ${origin}/ for ${root}\nPress Ctrl-C to stop.`));
}
