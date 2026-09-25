// An audit engagement run between the company and its CPA firm. The firm's requests live beside the evidence that
// answers them; the company drafts its system description, assertion and bridge letter from workspace facts; and the two
// sides exchange a point-in-time package the firm can verify offline and return. Evidence Desk never forms an opinion:
// it records requests, answers, samples, exceptions and who said what.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { parseCsv, spreadsheetCsv, writeCsv } from './csv.ts';
import { fileHash, inside, readVersioned, sha256, writeVersioned } from './files.ts';
import { categories, categoryAnswer, criteria } from './catalog.ts';
import { computeGaps } from './gaps.ts';
import { loadWorkspace, readJson, type Workspace } from './workspace.ts';
import { accessChanges, buildViews } from './packet.ts';
import { now } from './clock.ts';
import { inSoc2Scope, soc2Exclusion } from './targets.ts';
import { readSnapshot } from './open-autonomy.ts';

export type Engagement = { schema: string; id: string; type: 'type1' | 'type2'; as_of?: string; period?: { start: string; end: string }; firm: string; contact?: string; status: string; created_at: string };
export type Sample = { item: string; status: 'pending' | 'provided' | 'exception'; evidence?: string[]; note?: string };
export type Message = { at: string; by: string; side: 'client' | 'firm'; text: string };
export type AuditRequest = { schema: string; id: string; title: string; kind: 'document' | 'population' | 'sample'; controls: string[]; status: 'open' | 'submitted' | 'accepted' | 'returned'; evidence: string[]; population?: string; samples?: Sample[]; thread: Message[] };

const pretty = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
function valid(name: string, data: unknown, what: string) { const e = check(schema(name), data); if (e.length) throw new Error(`${what} is invalid: ${e.join('; ')}`); }
const base = (id: string) => `audits/${id}`;
// Every file under a workspace folder, as workspace paths.
const listUnder = (root: string, dir: string): string[] => existsSync(join(root, dir)) ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap((x) => x.isDirectory() ? listUnder(root, `${dir}/${x.name}`) : [`${dir}/${x.name}`]) : [];

export function readEngagement(root: string, id: string): { data: Engagement; version: string } {
  const r = readVersioned(root, `${base(id)}/engagement.json`);
  if (!r) throw new Error(`engagement ${id} does not exist`);
  const e = readJson<Engagement>(root, `${base(id)}/engagement.json`, 'engagement', []);
  if (!e) throw new Error(`${base(id)}/engagement.json cannot be read: run validate and fix it`);
  return { data: e.data, version: e.version };
}
export function listRequests(root: string, id: string): { data: AuditRequest; version: string; path: string }[] {
  const dir = join(root, base(id), 'requests');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const path = `${base(id)}/requests/${f}`;
    // A request that cannot be read is left out here; validate reports it.
    const r = readJson<AuditRequest>(root, path, 'audit-request', []);
    return r ? [{ data: r.data, version: r.version, path }] : [];
  }).flat();
}

export function createEngagement(root: string, input: { id: string; type: 'type1' | 'type2'; firm: string; as_of?: string; start?: string; end?: string; contact?: string }): void {
  const e: Engagement = { schema: 'evidence-desk.engagement/1', id: input.id, type: input.type, firm: input.firm, status: 'planning', created_at: now() };
  if (input.type === 'type1') { if (!input.as_of) throw new Error('a Type 1 engagement needs the date it describes the design as of (--as-of)'); e.as_of = input.as_of; }
  else { if (!input.start || !input.end) throw new Error('a Type 2 engagement needs its observation period (--period <start>..<end>)'); if (input.start >= input.end) throw new Error('the period must end after it starts'); e.period = { start: input.start, end: input.end }; }
  if (input.contact) e.contact = input.contact;
  valid('engagement', e, 'the engagement');
  writeVersioned(root, `${base(input.id)}/engagement.json`, pretty(e), null);
}

// Imports the firm's request list: a CSV with id, title, kind (document, population or sample) and controls (semicolons).
export function importRequests(root: string, id: string, file: string): { added: string[]; skipped: string[] } {
  readEngagement(root, id);
  const text = readFileSync(resolve(file), 'utf8');
  const table = parseCsv(text, file);
  for (const c of ['id', 'title']) if (!table.columns.includes(c)) throw new Error(`${file} needs an ${c} column`);
  const known = new Set(loadWorkspace(root).controls.map((c) => c.data.id));
  const out = { added: [] as string[], skipped: [] as string[] };
  for (const row of table.rows) {
    const rel = `${base(id)}/requests/${row.id}.json`;
    if (readVersioned(root, rel)) { out.skipped.push(row.id); continue; }
    const controls = (row.controls ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    for (const c of controls) if (!known.has(c)) throw new Error(`request ${row.id} names control ${c}, which is not in this workspace`);
    const req: AuditRequest = { schema: 'evidence-desk.audit-request/1', id: row.id, title: row.title, kind: (row.kind || 'document') as AuditRequest['kind'], controls, status: 'open', evidence: [], thread: [] };
    if (req.kind === 'sample') req.samples = [];
    valid('audit-request', req, `request ${row.id}`);
    writeVersioned(root, rel, pretty(req), null);
    out.added.push(row.id);
  }
  return out;
}

type RequestChange = { by: string; side: 'client' | 'firm'; text?: string; status?: AuditRequest['status']; evidence?: string[]; population?: string; select?: string[]; sample?: { item: string; status: Sample['status']; evidence?: string[]; note?: string } };

// One act on a request by one side. The client submits evidence and answers samples; the firm selects samples and
// accepts or returns the request. Each act can carry a message, and every act is kept in the thread.
export function actOnRequest(root: string, id: string, requestId: string, version: string, change: RequestChange): void {
  const rel = `${base(id)}/requests/${requestId}.json`;
  const cur = readVersioned(root, rel);
  if (!cur) throw new Error(`request ${requestId} does not exist`);
  if (cur.version !== version) throw new Error(`${rel} changed since it was read; reload it and try again`);
  const req = JSON.parse(cur.text) as AuditRequest;
  const ws = loadWorkspace(root);
  if (!change.by.trim()) throw new Error('say who is acting');
  if (change.side === 'client' && !(ws.registers.people?.data.rows ?? []).some((r) => r.id === change.by)) throw new Error(`${change.by} is not in registers/people.csv`);
  const evidenceIds = new Set(ws.evidence.map((e) => e.data.id));
  // Evidence answers a request only if it speaks to one of the request's controls: attaching a record about something
  // else is refused rather than left for the firm to find.
  const fits = (id: string) => { const x = ws.evidence.find((y) => y.data.id === id)!; if (req.controls.length && !x.data.controls.some((c) => req.controls.includes(c))) throw new Error(`evidence ${id} (${x.data.controls.join(', ') || 'no control'}) speaks to none of ${req.id}'s controls (${req.controls.join(', ')})`); };
  const notes: string[] = [];
  if (change.evidence) {
    if (change.side !== 'client') throw new Error('evidence is submitted by the client');
    for (const e of change.evidence) if (!evidenceIds.has(e)) throw new Error(`evidence ${e} does not exist`);
    for (const e of change.evidence) fits(e);
    req.evidence = [...new Set([...req.evidence, ...change.evidence])];
    notes.push(`attached ${change.evidence.join(', ')}`);
  }
  if (change.population) {
    if (!evidenceIds.has(change.population)) throw new Error(`evidence ${change.population} does not exist`);
    fits(change.population);
    req.population = change.population;
    notes.push(`population ${change.population}`);
  }
  if (change.select) {
    if (change.side !== 'firm') throw new Error('samples are selected by the firm');
    if (req.kind !== 'sample') throw new Error('only a sample request has samples');
    if (!req.population) throw new Error('attach the population before the firm selects samples from it');
    const pop = ws.evidence.find((e) => e.data.id === req.population)!;
    const rows = pop.data.files.flatMap((f) => { try { return parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path).rows; } catch { return []; } });
    const keys = new Set(rows.map((r) => Object.values(r)[0]));
    for (const s of change.select) if (keys.size && !keys.has(s)) throw new Error(`${s} is not an item of the population in ${req.population}`);
    const have = new Set((req.samples ?? []).map((s) => s.item));
    req.samples = [...(req.samples ?? []), ...change.select.filter((s) => !have.has(s)).map((item) => ({ item, status: 'pending' as const }))];
    notes.push(`selected ${change.select.join(', ')}`);
  }
  if (change.sample) {
    if (change.side !== 'client' && change.sample.status !== 'exception') throw new Error('the client answers a sample; the firm can mark one an exception');
    const s = (req.samples ?? []).find((x) => x.item === change.sample!.item);
    if (!s) throw new Error(`${change.sample.item} is not a selected sample`);
    for (const e of change.sample.evidence ?? []) if (!evidenceIds.has(e)) throw new Error(`evidence ${e} does not exist`);
    s.status = change.sample.status;
    if (change.sample.evidence?.length) s.evidence = [...new Set([...(s.evidence ?? []), ...change.sample.evidence])];
    if (change.sample.note) s.note = change.sample.note;
    notes.push(`sample ${s.item}: ${s.status}`);
  }
  if (change.status) {
    const firmOnly = change.status === 'accepted' || change.status === 'returned';
    if (firmOnly && change.side !== 'firm') throw new Error(`only the firm marks a request ${change.status}`);
    if (change.status === 'submitted') {
      if (change.side !== 'client') throw new Error('the client submits a request');
      if (!req.evidence.length && !req.population) throw new Error('attach evidence before submitting');
      if (req.kind === 'sample' && (req.samples ?? []).some((s) => s.status === 'pending')) throw new Error('answer every selected sample before submitting');
    }
    req.status = change.status;
    notes.push(`status ${change.status}`);
  }
  const text = [change.text?.trim(), notes.length ? `(${notes.join('; ')})` : ''].filter(Boolean).join(' ');
  if (!text) throw new Error('nothing to record');
  req.thread.push({ at: now(), by: change.by, side: change.side, text });
  valid('audit-request', req, rel);
  writeVersioned(root, rel, pretty(req), version);
}

// ── Drafts ──────────────────────────────────────────────────────────────────────────────────────────────────────
const inPeriod = (at: string, e: Engagement) => e.type === 'type2' ? at.slice(0, 10) >= e.period!.start && at.slice(0, 10) <= e.period!.end : at.slice(0, 10) <= e.as_of!;

// How an Open Autonomy project builds and runs the system, from its declarations at the commit last read: the agents and
// their schedules, where people act and who may, and how a change lands and reaches production.
// The latest population a GitHub collector recorded for the engagement's period, with its rows.
// Identified by the collector's file name, never by title words: several populations are "changes to" something.
function periodPopulation(ws: Workspace, e: Engagement, kind: 'changes to' | 'deployments of' | 'configuration of') {
  const stem = kind === 'changes to' ? '/github-changes-' : kind === 'deployments of' ? '/github-deployments-' : '/cloudflare-changes-';
  const ev = ws.evidence.filter((x) => x.data.source?.kind === 'collector' && x.data.files.some((f) => f.path.includes(stem) && f.path.endsWith('.csv')) && x.data.period && e.period && x.data.period.start <= e.period.start && x.data.period.end >= e.period.end)
    .sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const csv = ev?.data.files.find((f) => f.path.includes(stem) && f.path.endsWith('.csv'));
  return ev && csv ? { id: ev.data.id, rows: parseCsv(readFileSync(join(ws.root, csv.path), 'utf8'), csv.path).rows } : null;
}
const tally = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, n]) => `${k || '(unknown)'} ${n}`).join(', ');

function openAutonomySection(ws: Workspace, e: Engagement): string {
  if (!ws.openAutonomy) return '';
  const snap = ws.openAutonomy.data;
  const holders = (scope: string) => snap.team.filter((m) => m.scopes.includes(scope)).map((m) => m.name).join(', ') || '[no one holds it]';
  const prod = snap.rules.production_deploy;
  return `
How the system is built and operated (the Open Autonomy project ${snap.account} at ${snap.commit.slice(0, 12)}):

The project declares these agents, each on a schedule with its models, and the decisions below that only people make.
${snap.agents.map((a) => `- Agent profile ${a.profile}: ${a.jobs.map((j) => `${j.name} (${j.schedule})`).join(', ') || 'no scheduled jobs'}; models ${a.models.map((m) => `${m.provider} ${m.model}`).join(', ') || 'none'}`).join('\n')}

${snap.decisions?.length ? `Architecture decisions (${snap.decisions.length}), each answering the SOC 2 checklist of the soc2 template (${snap.decisions.filter((d) => d.checklist === 'complete').length} complete):
${snap.decisions.map((d) => `- ${d.title} (${d.status || 'no status'}; checklist ${d.checklist})`).join('\n')}

` : ''}Where people act:
${(snap.seams ?? []).map((x) => `- ${x.id}: made by those holding ${x.scope} (${holders(x.scope)}); recorded in ${x.record.charAt(0).toLowerCase()}${x.record.slice(1)}`).join('\n') || '- [the project declares no decisions reserved to people]'}

Change review is declared in two stages: each change is approved in its pull request by an account other than its author's (a person, or the review agent), and a person holding release-review approves each release, an approval that covers every change the release ships. What operated is stated below (review/change-releases.csv lists each change with the release that shipped it and who approved that release). The project declares its change and release design: ${snap.rules.pr_landing ? 'changes land through pull requests by the project\'s landing workflow' : '[describe how changes land]'}; ${prod ? `production is to be deployed by ${prod.workflow}${prod.tag_trigger ? ` from a ${prod.tag_trigger} tag` : ''} through the ${prod.environment} environment's required reviewers, with outbound access limited to ${prod.egress.join(', ') || '[none listed]'}` : '[describe how a change reaches production]'}.${(snap.rules.production_workflows ?? []).length > 1 ? ` Every run of ${snap.rules.production_workflows!.map((g) => `${g.workflow}${g.tag_trigger ? ` (${g.tag_trigger})` : ''}`).join(', ')} passes the same environment's review.` : ''}
${(() => { const c = e.period ? periodPopulation(ws, e, 'changes to') : null; const d = e.period ? periodPopulation(ws, e, 'deployments of') : null; if (!c && !d) return '';
  const lines: string[] = [];
  if (c) { const prs = c.rows.filter((r) => r.kind === 'pull request'); const bad = c.rows.filter((r) => r.independent_approval !== 'yes');
    lines.push(`- ${c.rows.length} change(s) reached the default branch (${c.id}): ${prs.length} through pull requests, opened by ${tally(prs.map((r) => r.author))}; ${c.rows.length - prs.length} pushed directly; ${bad.length ? `${bad.length} without an independent approval (${bad.map((r) => r.number ? `#${r.number}` : r.commit.slice(0, 12)).join(', ')})` : prs.every((r) => (r.approver_kinds || '').split(';').includes('person')) ? 'each approved by a person other than its author' : 'each approved by an account other than its author\'s'}.`);
    if (prs.some((r) => r.approver_kinds)) lines.push(`- Approvals by kind of account: ${tally(prs.flatMap((r) => (r.approver_kinds || '').split(';').filter(Boolean)))}; ${prs.filter((r) => r.author_kind === 'agent' && (r.approver_kinds || '').split(';').every((k) => k === 'agent')).length} change(s) were written and approved only by agent accounts.`); }
  if (d) { lines.push(`- ${d.rows.length} production deployment(s) (${d.id}), their runs started by ${tally(d.rows.map((r) => r.run_event))}${d.rows.every((r) => /^deploy-v/.test(r.ref)) ? ' on a deploy-v* tag' : `, on ${tally(d.rows.map((r) => r.ref))}`}${d.rows.some((r) => r.commit_match === 'no') ? `; ${d.rows.filter((r) => r.commit_match === 'no').length} approved on a run of another commit` : ''}; started by ${tally(d.rows.map((r) => r.started_by))}; ${d.rows.filter((r) => r.independent_approval === 'yes').length} approved by someone other than the starter.`); }
  // What the register shows operated differently from the design above.
  const ex = knownExceptions(ws, e); const n = (k: string) => ex.filter((x) => x.key.startsWith(k)).length;
  const selfApproved = ex.find((x) => x.key === 'release-self-approved');
  if (selfApproved) lines.push(`- ${selfApproved.item} (the exceptions register, release-self-approved)`);
  if (n('unmatched-deploy:') || n('out-of-path-change:')) lines.push(`- ${n('unmatched-deploy:') + n('out-of-path-change:')} change(s) reached production outside the change path: ${n('unmatched-deploy:')} Worker deployment(s) no approved GitHub deployment accounts for, ${n('out-of-path-change:')} setting(s) changed by hand`);
  // A Worker created inside the period is a system that began operating then, not at the period's start.
  const cfg = e.period ? periodPopulation(ws, e, 'configuration of') : null;
  for (const r of cfg?.rows.filter((r) => r.action === 'create' && r.resource.startsWith('script ')) ?? []) lines.push(`- Worker ${r.resource.slice(7)} was created on ${r.at.slice(0, 10)} by ${r.actor || 'no one the log names'} (${cfg!.id}): it began operating within the period, not at its start`);
  return `As operated in the period:\n${lines.join('\n')}\n`; })()}
Subservice organizations: ${snap.vendors.join(', ')}.

Sources: sources/open-autonomy/${snap.commit.slice(0, 12)}.json (the project's .open-autonomy/config.yaml, agent.json and workflows).
`;
}

// Incidents an Open Autonomy project recorded in its own records/ (collected as the incidents seam's population), every
// severity, so the description names what the program knows about rather than only what the workspace recorded.
function latestPopulation(ws: Workspace, seam: string) {
  return ws.evidence.filter((x) => x.data.source?.kind === 'open-autonomy' && x.data.source?.name === `${seam} seam`).sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
}
function projectIncidents(ws: Workspace, e: Engagement): string {
  const ev = latestPopulation(ws, 'incidents');
  if (!ev) return '';
  const rows = parseCsv(readFileSync(join(ws.root, ev.data.files[0].path), 'utf8'), ev.data.files[0].path).rows.filter((r) => inPeriod(r.detected_at, e));
  return rows.length ? `\nIncidents recorded during the period, every severity (the project's records/incidents/):\n${rows.map((r) => `- ${r.detected_at.slice(0, 10)} ${r.id} (${r.severity}, ${r.status}): ${r.summary}${r.notification ? `. Notification: ${r.notification}` : ''}${r.review ? `. Review: ${r.review}` : ''}`).join('\n')}\n` : '';
}

// Every file an exception can be derived from, as if the whole workspace were packaged.
const derivable = (ws: Workspace) => new Set([...ws.evidence.flatMap((x) => [x.path, ...x.data.files.map((f) => f.path)]), ...listUnder(ws.root, 'sources'), ...ws.runs.map((r) => r.path)]);
// The deviations the workspace already knows about in the engagement's period, as the package's exceptions register
// would list them: a draft names them so management decides what to disclose rather than asserting past them.
function knownExceptions(ws: Workspace, e: Engagement) {
  const csv = buildViews(ws.root, ws, e, [], derivable(ws), now()).get('review/exceptions.csv')!;
  return parseCsv(csv, 'exceptions').rows.filter((x) => !x.key.startsWith('interim:'));
}
// A check's exception is named by its check: its item alone ("1 failing reading(s)") says nothing of which.
const deviationList = (ex: Record<string, string>[]) => ex.map((x) => `- ${x.occurred || x.detected} ${x.key.startsWith('check:') ? `${x.source}, ` : ''}${x.item}: ${x.detail}${x.controls ? ` (${x.controls.replaceAll(';', ', ')})` : ''}${x.resolved ? `; resolved ${x.resolved}` : ''}`).join('\n');

function description(ws: Workspace, e: Engagement): string {
  const a = ws.scope?.data.answers ?? {};
  const org = ws.manifest?.data.organization ?? '';
  const inScope = ['CC', ...Object.entries(categoryAnswer).filter(([, q]) => a[q] === true).map(([c]) => c)];
  // SOC 2's deliverable: the controls in SOC 2's scope, and its exclusions as the scoping answers make them (targets.ts).
  const controls = ws.controls.filter((c) => inSoc2Scope(ws, c.data)).map((c) => c.data);
  const excludedCriteria = criteria.filter((c) => inScope.includes(c.category)).filter((c) => { const m = ws.controls.filter((x) => x.data.criteria.includes(c.id)); return m.length > 0 && m.every((x) => !inSoc2Scope(ws, x.data)); });
  const rows = (name: 'people' | 'systems' | 'vendors') => ws.registers[name]?.data.rows ?? [];
  const incidents = ws.incidents.filter((i) => inPeriod(i.data.detected_at, e) && (i.data.severity === 'high' || i.data.severity === 'critical'));
  const approvals = ws.policies.flatMap((p) => p.data.versions.filter((v) => inPeriod(v.approved_at, e)).map((v) => `${p.data.title} version ${v.version} approved ${v.approved_at.slice(0, 10)}`));
  // The same period the assertion covers: from the day a system created inside the period began operating.
  const cfgD = e.type === 'type2' ? periodPopulation(ws, e, 'configuration of') : null;
  const bornD = (cfgD?.rows ?? []).filter((r) => r.action === 'create' && r.resource.startsWith('script ')).map((r) => r.at.slice(0, 10)).sort()[0];
  const when = e.type === 'type1' ? `as of ${e.as_of}` : bornD && bornD > e.period!.start ? `from ${bornD}, when the system began operating, to ${e.period!.end}` : `for the period ${e.period!.start} to ${e.period!.end}`;
  return `# Description of ${org}'s system ${when}

<!-- Drafted by Evidence Desk from the workspace on ${now().slice(0, 10)}. Each section names its sources. Review every section,
fill each [bracketed] item, and remove this comment before giving it to the firm. This is management's description;
the firm's opinion is its own. -->

## DC1 Services provided

${a.services || '[Describe the services provided to customers.]'}

Sources: scope.json (services).

## DC2 Principal service commitments and system requirements

[State the security, availability and confidentiality commitments made to customers in contracts, terms and the SLA,
and the system requirements that follow from them.]

Sources: controls/GOV-07.json and its evidence.

## DC3 Components of the system

Infrastructure: ${a.infrastructure || '[describe]'}.

Software and systems in scope:
${rows('systems').filter((s) => s.in_scope === 'yes').map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ''}${s.data ? ` (data: ${s.data})` : ''}`).join('\n') || '- [none listed]'}

People and roles:
${rows('people').filter((p) => !p.end_date).map((p) => `- ${p.name}${p.role ? `, ${p.role}` : ''}`).join('\n') || '- [none listed]'}

Procedures: the organization's approved policies:
${ws.policies.filter((p) => p.data.versions.length).map((p) => `- ${p.data.title}, version ${p.data.versions.at(-1)!.version}`).join('\n') || '- [no policy approved yet]'}

Data: ${rows('systems').filter((s) => s.data && !/^none$/i.test(s.data.trim())).map((s) => `${s.name}: ${s.data}`).join('; ') || '[describe the data the system holds]'}.

Sources: scope.json, registers/systems.csv, registers/people.csv, policies/.
${openAutonomySection(ws, e)}
## DC4 System incidents

${incidents.length ? incidents.map((i) => `- ${i.data.detected_at.slice(0, 10)} ${i.data.title} (${i.data.severity}, ${i.data.status})${i.data.review ? `: ${i.data.review}` : ''}`).join('\n') : projectIncidents(ws, e) ? '' : 'No incident is recorded for this period, in the workspace or in the project\'s records.'}
${projectIncidents(ws, e)}${(() => { const ex = knownExceptions(ws, e); return ex.length ? `
The package's exceptions register (review/exceptions.csv) holds ${ex.length} deviation(s) of the period, ${ex.filter((x) => x.nature === 'design').length} of design and ${ex.filter((x) => x.nature !== 'design').length} of operation; management's assertion describes each.

[State which of these deviations are incidents to disclose here, with the effect and resolution of each.]
` : ''; })()}
Sources: incidents/${projectIncidents(ws, e) ? `, ${latestPopulation(ws, 'incidents')!.data.files[0].path}` : ''}.

## DC5 Applicable trust services criteria and related controls

Categories in scope: ${inScope.map((c) => categories[c]).join(', ')}.

${controls.map((c) => `- ${c.id} ${c.title} (${c.criteria.join(', ')}): ${c.description}`).join('\n')}

Sources: scope.json, controls/.

## DC6 Complementary user entity controls

[List the controls the service assumes its customers operate, for example managing their own users' access to the
service and protecting the credentials it issues them.]

## DC7 Subservice organizations

The organization uses these subservice organizations and presents them using the carve-out method:
${(String(a.subservice_organizations ?? '')).split(';').map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}: [the controls the organization expects it to operate, and how the organization monitors them]`).join('\n') || '- [none listed]'}

Critical vendors on record: ${rows('vendors').filter((v) => v.criticality === 'high').map((v) => v.name).join(', ') || 'none'}.

Sources: scope.json (subservice_organizations), registers/vendors.csv.

## DC8 Criteria not relevant to the system

${excludedCriteria.length ? excludedCriteria.map((c) => `- ${c.id} ${c.title}: ${ws.controls.filter((x) => x.data.criteria.includes(c.id)).map((x) => soc2Exclusion(ws, x.data)).join(' ')}`).join('\n') : 'Every criterion in scope is addressed by at least one applicable control.'}

Sources: controls/ (exclusion reasons).
${e.type === 'type2' ? `
## DC9 Significant changes during the period

${approvals.length ? approvals.map((x) => `- ${x}`).join('\n') : '- No policy version was approved during the period.'}
- [Add significant changes to the system, its people or its controls.]

Sources: policies/*.json (approved versions).
` : ''}`;
}

function assertion(ws: Workspace, e: Engagement): string {
  const org = ws.manifest?.data.organization ?? '';
  // A system that began operating inside the period is asserted on from that day, not from the period's start.
  const cfg = e.type === 'type2' ? periodPopulation(ws, e, 'configuration of') : null;
  const born = (cfg?.rows ?? []).filter((r) => r.action === 'create' && r.resource.startsWith('script ')).map((r) => r.at.slice(0, 10)).sort()[0];
  const when = e.type === 'type1' ? `as of ${e.as_of}` : born && born > e.period!.start ? `from ${born}, when the system began operating, to ${e.period!.end}` : `throughout the period ${e.period!.start} to ${e.period!.end}`;
  return `# Management's assertion

<!-- Drafted by Evidence Desk. Management reviews, adapts and signs it; the firm may provide its own required wording. -->

We have prepared the accompanying description of ${org}'s system ${e.type === 'type1' ? 'as of' : 'for the period'} ${e.type === 'type1' ? e.as_of : `${e.period!.start} to ${e.period!.end}`}
based on the criteria for a description of a service organization's system. We confirm, to the best of our knowledge
and belief, that:

1. The description presents the system that was designed and implemented ${when} in accordance with those criteria.
2. The controls stated in the description were suitably designed ${when} to provide reasonable assurance that our
   service commitments and system requirements would be achieved if the controls operated effectively${e.type === 'type2' ? ', and they operated effectively throughout that period' : ''}.
${(() => { const ex = e.type === 'type2' ? knownExceptions(ws, e) : []; return ex.length ? `
[The workspace found ${ex.length} deviation(s) during the period, listed below and in the package's review/exceptions.csv.
Unless management concludes that none prevented a service commitment from being achieved, end point 2 with "except for
the matters described in the following paragraph" and describe them there. A deviation of design (what stood through
the period) qualifies "suitably designed"; one of operation qualifies "operated effectively".]
${ex.some((x) => x.nature === 'design') ? `Of design:\n${deviationList(ex.filter((x) => x.nature === 'design'))}\nOf operation:\n${deviationList(ex.filter((x) => x.nature !== 'design'))}` : deviationList(ex)}
` : ''; })()}
Signed by: [Name, title]
Signature: [Signature]
Date: [Date]
`;
}

function bridge(ws: Workspace, e: Engagement, to: string): string {
  const org = ws.manifest?.data.organization ?? '';
  const from = e.type === 'type2' ? e.period!.end : e.as_of!;
  const incidents = ws.incidents.filter((i) => i.data.detected_at.slice(0, 10) > from && i.data.detected_at.slice(0, 10) <= to);
  return `# Bridge letter

<!-- Drafted by Evidence Desk. Management reviews and signs it; it is not an audit opinion. -->

To our customers:

${org}'s most recent SOC 2 ${e.type === 'type1' ? 'Type 1' : 'Type 2'} report, issued by ${e.firm}, covered ${e.type === 'type1' ? `the design of controls as of ${e.as_of}` : `the period ${e.period!.start} to ${e.period!.end}`}.
For the period from ${from} to ${to}, management confirms that:

- there have been no material changes to the system or its controls, except: [none, or describe];
- ${incidents.length ? `the following incidents occurred: ${incidents.map((i) => `${i.data.title} (${i.data.severity})`).join('; ')}` : 'no significant security incident has been identified'};
- the next report is expected to cover a period ending [date].

This letter is management's statement and is not an opinion of ${e.firm}.

Signed by: [Name, title]
Signature: [Signature]
Date: [Date]
`;
}

export function draft(root: string, id: string, kind: 'description' | 'assertion' | 'bridge', to?: string): string {
  const e = readEngagement(root, id).data;
  const ws = loadWorkspace(root);
  const text = kind === 'description' ? description(ws, e) : kind === 'assertion' ? assertion(ws, e) : bridge(ws, e, to ?? now().slice(0, 10));
  const rel = `${base(id)}/drafts/${kind}.md`;
  const cur = readVersioned(root, rel);
  if (cur) throw new Error(`${rel} already exists; it may hold management's edits. Rename or remove it to draft again`);
  writeVersioned(root, rel, text, null);
  return rel;
}

// ── Packages ────────────────────────────────────────────────────────────────────────────────────────────────────
// Exports exactly what the engagement's requests point at, plus the engagement, its drafts, and the controls and
// approved policy texts those requests name. Refuses when a referenced file is missing or no longer matches its record.
// Claims a description commonly makes that the packaged populations can refute. Each rule reads the final text; a
// contradiction stops the export, and every rule's outcome is a row of review/description-lint.csv.
// The assertion is read beside the description: an open exception management has not disclosed in either is an omission.
function lintDescription(ws: Workspace, e: Engagement, text: string, assertionText = ''): { rule: string; status: 'pass' | 'contradiction' | 'not applicable'; detail: string }[] {
  const out: ReturnType<typeof lintDescription> = [];
  const prose = text.replace(/```[\s\S]*?```/g, '');
  const both = `${prose}\n${assertionText}`;
  const inc = latestPopulation(ws, 'incidents');
  const incRows = inc ? parseCsv(readFileSync(join(ws.root, inc.data.files[0].path), 'utf8'), inc.data.files[0].path).rows.filter((r) => inPeriod(r.detected_at, e)) : [];
  const serious = incRows.filter((r) => r.severity === 'high' || r.severity === 'critical');
  const noneClaim = /\bno incident is recorded\b/i.test(prose), noSerious = /\bno high or critical incident\b/i.test(prose);
  out.push(!noneClaim && !noSerious ? { rule: 'incidents', status: 'not applicable', detail: 'the description makes no claim that no incident occurred' }
    : (noneClaim && incRows.length) || (noSerious && serious.length) ? { rule: 'incidents', status: 'contradiction', detail: `the description says no ${noSerious ? 'high or critical ' : ''}incident is recorded; the incidents population (${inc!.data.id}) holds ${(noSerious ? serious : incRows).map((r) => `${r.id} (${r.severity})`).join(', ')}` }
    : { rule: 'incidents', status: 'pass', detail: `consistent with ${inc ? inc.data.id : 'no incidents population'}` });
  const c = e.period ? periodPopulation(ws, e, 'changes to') : null;
  // A claim that every change is reviewed, against the changes population (a merge without an independent review) and
  // the Cloudflare deployments no approved GitHub deployment accounts for.
  const worker = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/cloudflare-worker-deployments-') && f.path.endsWith('.csv')) && x.data.period && e.period && x.data.period.start <= e.period.start && x.data.period.end >= e.period.end).sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const workerCsv = worker?.data.files.find((f) => f.path.endsWith('.csv'));
  const offBook = workerCsv ? parseCsv(readFileSync(join(ws.root, workerCsv.path), 'utf8'), workerCsv.path).rows.filter((r) => r.matched !== 'yes').map((r) => r.deployment.slice(0, 8)) : [];
  const unapproved = [...(c?.rows ?? []).filter((r) => r.independent_approval !== 'yes').map((r) => r.number ? `#${r.number}` : r.commit.slice(0, 12)), ...offBook];
  // A claim that changes are reviewed ("every change is reviewed", "pull requests are always reviewed", "all code is
  // reviewed before it lands"), not a claim about releases ("changes reach production only after the owner reviews the
  // release"): a mention of releases, production or deploying before the review makes it one about the release.
  const reviewClaim = [...prose.matchAll(/\bonly\s+(?:[\w-]+\s+)?(?:\w+-)?reviewed\s+(?:code\s+)?(?:changes?|pull requests?|PRs?|merges?|code)\b()|\b(?:(?:every|each|all)\s+(?:code\s+)?(?:changes?|pull requests?|PRs?|merges?|code)\b|(?:changes?|pull requests?|PRs?|merges?|code)\b(?=(?:[^.\n]|\.(?=\S))*\b(?:only|always)\b))((?:[^.\n]|\.(?=\S))*?)\breview/gi)]
    .find((m) => !/\b(release|production|deploy)/i.test(m[1] ?? m[2] ?? ''));
  out.push(!reviewClaim || !c ? { rule: 'changes reviewed', status: 'not applicable', detail: reviewClaim ? 'no changes population for the period' : 'the description makes no claim that every change is reviewed' }
    : unapproved.every((x) => prose.includes(x)) ? { rule: 'changes reviewed', status: 'pass', detail: `"${reviewClaim[0]}"; ${unapproved.length ? `the description names ${unapproved.join(', ')}` : 'every change in the population was independently approved'} (${c.id})` }
    : { rule: 'changes reviewed', status: 'contradiction', detail: `"${reviewClaim[0]}", but ${unapproved.filter((x) => !prose.includes(x)).join(', ')} in ${c.id} had no independent approval and the description does not name them` });
  const d = e.period ? periodPopulation(ws, e, 'deployments of') : null;
  // A sentence runs to a full stop followed by a space; a path's dots (deploy.yml) stay inside it.
  // A claim that production deploys from a tag is a claim about what happened, unless the sentence says it is the declared
  // design; then the operated trigger must be stated too.
  const tagClaims = [...prose.matchAll(/[^.\n]*(?:\.(?=\S)[^.\n]*)*\bdeploy(?:s|ed)?\b(?:[^.\n]|\.(?=\S))*\b(?:from|on) an? \S+ tag\b[^.\n]*/gi)].map((m) => m[0]);
  const events = [...new Set((d?.rows ?? []).map((r) => r.run_event).filter((x) => x && x !== 'push'))];
  const flat = tagClaims.filter((x) => !/\bdeclare/i.test(x));
  out.push(!tagClaims.length || !d ? { rule: 'deployment trigger', status: 'not applicable', detail: tagClaims.length ? 'no deployments population for the period' : 'the description names no deploy trigger' }
    : flat.length && events.length ? { rule: 'deployment trigger', status: 'contradiction', detail: `"${flat[0].trim()}", but runs in ${d.id} were started by ${tally(d.rows.map((r) => r.run_event))}` }
    : events.length && !events.every((x) => prose.includes(x)) ? { rule: 'deployment trigger', status: 'contradiction', detail: `the declared tag trigger is stated, but not that runs in ${d.id} were started by ${tally(d.rows.map((r) => r.run_event))}` }
    : { rule: 'deployment trigger', status: 'pass', detail: `${flat.length ? 'every run started from the tag' : 'the declared trigger and the operated one are both stated'}; runs in ${d.id}: ${tally(d.rows.map((r) => r.run_event))}` });
  // Every exception still open at the period's end is named in the assertion management signs, by what identifies it:
  // a date alone names whatever else happened that day.
  const ident = (x: Record<string, string>) => /#\d+|deploy-v\d+|\b[0-9a-f]{8}(?=[0-9a-f-]*\b)|\bR-\d+\b|[\w.+-]+@[\w-]+\.[\w.-]+|AR-\d{8}-[0-9a-f]{6}/.exec(x.item)?.[0] ?? x.key.split(':')[1] ?? x.key;
  // Every deviation the register holds, resolved or not: the assertion's "except for" is management's account of each.
  const open = knownExceptions(ws, e);
  const signed = assertionText || both;
  // Named means the row's own item (release deploy-v6, sam@globex.test's token cf-…) or its register key, which a matter
  // covering several rows of one event cites: an id alone can appear in another matter about something else.
  // A key cited in a matter counts only where that matter also carries the deviation's date: a key pasted under another
  // event's matter is not a disclosure of this one.
  const citedWithDate = (x: Record<string, string>) => signed.split('\n').some((l) => l.includes(x.key) && (!x.occurred || l.includes(x.occurred)));
  const missing = open.filter((x) => !signed.includes(x.item) && !citedWithDate(x));
  out.push(!open.length ? { rule: 'open exceptions disclosed', status: 'not applicable', detail: 'the register holds no deviation' }
    : missing.length ? { rule: 'open exceptions disclosed', status: 'contradiction', detail: `${missing.length} deviation(s) the assertion does not name: ${missing.map((x) => `${ident(x)} (${x.key})`).join('; ')}` }
    : { rule: 'open exceptions disclosed', status: 'pass', detail: `the assertion names each of the ${open.length} deviation(s) in the register` });
  // A system created inside the period did not operate from its start: the assertion says when it began.
  const cfg = e.period ? periodPopulation(ws, e, 'configuration of') : null;
  const born = (cfg?.rows ?? []).filter((r) => r.action === 'create' && r.resource.startsWith('script ')).map((r) => r.at.slice(0, 10)).sort()[0];
  out.push(!born || !e.period || born <= e.period.start ? { rule: 'operating period', status: 'not applicable', detail: 'no in-scope Worker was created inside the period' }
    : signed.includes(born) ? { rule: 'operating period', status: 'pass', detail: `the assertion states ${born}, when the Worker was created (${cfg!.id})` }
    : { rule: 'operating period', status: 'contradiction', detail: `the Worker was created on ${born} (${cfg!.id}), after the period's start; the assertion does not say so` });
  return out;
}

// Every dated claim in the drafts and in management's responses, against the package, line by line. A claim is
// evidenced only by a packaged line that carries one of its dates and names one of its subjects (an id such as
// deploy-v6 or replay-headers, a person, an account, a kind of act); the line's file says what kind of evidence it is: a
// vendor's own answer (vendor record), a record the organization made (client record), or a document it wrote (client
// narrative). A client record shows what was recorded, not that it happened. Daily check runs and their snapshots, which exist for every day,
// are not evidence of a particular day's act. A sentence whose only dates bound the period is a judgment, left to the
// firm. A future date is a plan. A count must match the population it names.
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const ACT_WORDS = ['told', 'notified', 'customer', 'joined', 'left', 'restore', 'audit', 'incident', 'deploy', 'deployment', 'rotat', 'token', 'review', 'test', 'merge', 'approv', 'break-glass', 'escalation', 'notif', 'backup', 'onboard', 'access', 'https', 'tls', 'bypass', 'ruleset', 'monitor', 'uptime', 'tabletop', 'exercise', 'penetration'];
export type Claim = { source: string; claim: string; status: 'vendor record' | 'client record' | 'client narrative' | 'partly supported' | 'unsupported' | 'contradiction' | 'judgment'; detail: string };
function claimsLedger(root: string, ws: Workspace, e: Engagement, id: string, packaged: Set<string>, today: string): Claim[] {
  const kindOfFile = new Map<string, 'vendor record' | 'client record' | 'client narrative'>();
  for (const x of ws.evidence.filter((y) => packaged.has(y.path) && !/collected by run/.test(y.data.title))) {
    // Where the evidence came from decides what it can show: a vendor's API answer (vendor record), a record the
    // organization made in its own repository or workspace (client record: it shows what the organization recorded,
    // not that it happened), or a document the organization wrote (client narrative).
    const k = x.data.source?.kind === 'collector' ? 'vendor record' : x.data.source?.kind === 'manual' ? 'client narrative' : 'client record';
    for (const f of x.data.files) if (!kindOfFile.has(f.path)) kindOfFile.set(f.path, k);
  }
  for (const p of packaged) if (!kindOfFile.has(p) && /^(sources\/|reviews\/|policies\/|forms\/responses\/|registers\/)/.test(p)) kindOfFile.set(p, p.startsWith('sources/github/') || p.startsWith('sources/open-autonomy/completeness/') ? 'vendor record' : 'client record');
  // A table row's acts are named by its columns (merged_at, approvers), so a row carries its header as \`acts\`.
  const lines: { file: string; n: number; text: string; acts?: string; kind: 'vendor record' | 'client record' | 'client narrative' }[] = [];
  for (const [p, kind] of kindOfFile) {
    if (!/\.(csv|json|md|txt)$/.test(p) || p.endsWith('.raw.json') || !existsSync(join(root, p))) continue;
    // A table's unit is its row; a document's (and a record's history) is the whole file, whose date may sit in its
    // heading and its facts below.
    const body = readFileSync(join(root, p), 'utf8');
    if (/\.(md|txt)$/.test(p)) { if (/20\d\d-\d\d-\d\d/.test(body)) lines.push({ file: p, n: 1, text: body.toLowerCase(), kind }); }
    else { const rows = body.split('\n'); const header = p.endsWith('.csv') ? rows[0].toLowerCase().replace(/_/g, ' ') : ''; rows.forEach((text, i) => { if (/20\d\d-\d\d-\d\d/.test(text)) lines.push({ file: p, n: i + 1, text: text.toLowerCase(), acts: header, kind }); }); }
  }
  const period = e.period ?? { start: e.as_of ?? '', end: e.as_of ?? '' };
  // The access changes the daily snapshots show are system evidence of their day.
  for (const c of accessChanges(root, ws, period)) lines.push({ file: `review/access-changes.csv (${c.snapshot})`, n: 0, text: `${c.at} ${c.system} ${c.account} ${c.change} ${c.role} access`.toLowerCase(), kind: 'vendor record' });
  const names = (ws.registers.people?.data.rows ?? []).flatMap((p) => [p.id, (p.name ?? '').split(' ')[0], p.email].filter(Boolean).map((x) => String(x).toLowerCase()));
  const count = (stem: string) => { const ev = ws.evidence.filter((x) => packaged.has(x.path) && x.data.files.some((f) => f.path.includes(stem) && f.path.endsWith('.csv'))).at(-1);
    const f = ev?.data.files.find((x) => x.path.includes(stem) && x.path.endsWith('.csv')); return f ? parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path).rows : null; };
  const counted: [RegExp, () => number | null][] = [
    [/internal audits?/, () => count('/internal-audits-')?.filter((r) => r.at.slice(0, 10) >= period.start && r.at.slice(0, 10) <= period.end).length ?? null],
    [/production deployments?|deployments? (?:to|of) production/, () => count('/github-deployments-')?.length ?? null],
    [/restore tests?/, () => count('/restore-tests-')?.length ?? null],
    [/incidents?/, () => count('/incidents-')?.length ?? null],
    // A count of what the assertion describes is the number of its matters.
    [/(?:control )?(?:deviations?|matters?) (?:are |is )?(?:described|listed|named) in the assertion/, () => { const a = assertionOf(root, id); return a ? (a.match(/^\([a-z]\) /gm) ?? []).length : null; }],
  ];
  // The day a system created inside the period began operating bounds what the assertion covers, as the period's own
  // days do.
  const goLive = (e.period ? periodPopulation(ws, e, 'configuration of')?.rows ?? [] : []).filter((r) => r.action === 'create' && r.resource.startsWith('script ')).map((r) => r.at.slice(0, 10)).sort()[0] ?? '';
  const texts: { source: string; text: string; about?: string[] }[] = [];
  for (const k of ['description', 'assertion']) { const f = join(root, base(id), 'drafts', `${k}.md`); if (existsSync(f)) texts.push({ source: k, text: readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '') }); }
  const ex = join(root, base(id), 'exceptions.json');
  if (existsSync(ex)) for (const [key, r] of Object.entries((JSON.parse(readFileSync(ex, 'utf8')) as { responses?: Record<string, { text: string }> }).responses ?? {})) texts.push({ source: `response to ${key}`, text: r.text, about: key.toLowerCase().split(':').slice(1) });
  const rank = { 'vendor record': 0, 'client record': 1, 'client narrative': 2 } as const;
  const out: Claim[] = [];
  // A sentence ends at a full stop or a line; a semicolon inside a line (the drafter's deviation lines) does not end one.
  // A drafted line that restates a row of the exceptions register (its date and its item) is what the register derived
  // from the package: it is graded by the file the exception was raised from. A daily check's reading was decided from
  // the vendor's answer that day.
  const register = parseCsv(buildViews(root, ws, e, [], packaged, now()).get('review/exceptions.csv')!, 'exceptions.csv').rows;
  for (const t of texts) for (const sentence of t.text.split(/(?<=\.)\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (/^Sources?:/i.test(sentence)) continue;
    // A line that is only a date, or the signature block's lines, states nothing to evidence.
    if (!/[a-z]/i.test(sentence.replace(/\b20\d\d-\d\d-\d\d\b/g, '')) || /^(Signed by|Signature|Date):/.test(sentence)) continue;
    const row = register.find((x) => x.item && sentence.includes(x.item) && sentence.includes(x.occurred || x.detected));
    if (row) { out.push({ source: t.source, claim: sentence, status: row.key.startsWith('check:') ? 'vendor record' : kindOfFile.get(row.file) ?? 'client record', detail: `the exceptions register's row ${row.key}, raised from ${row.file}` }); continue; }
    for (const [re, n] of counted) {
      // A count stands alone: the 17 of 2026-08-17 or the 04 of MON-04 is not one.
      const m = new RegExp(`(?<![\\w-])(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:${re.source})\\b`, 'i').exec(sentence);
      if (!m) continue;
      const said = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
      const is = n();
      if (is !== null && said !== is) out.push({ source: t.source, claim: sentence, status: 'contradiction', detail: `says ${said} ${m[0].slice(m[1].length).trim()}; the package's population holds ${is}` });
    }
    const dates = [...new Set([...sentence.matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)].map((m) => m[1]))].filter((d) => d <= today);
    if (!dates.length) continue;
    const eventDates = dates.filter((d) => d !== period.start && d !== period.end && d !== goLive);
    if (!eventDates.length) { out.push({ source: t.source, claim: sentence, status: 'judgment', detail: 'its only dates bound the period: a statement for the firm to judge, not a dated fact' }); continue; }
    const low = sentence.toLowerCase();
    // An id is a hyphenated token the package itself uses (replay-headers, deploy-v6); an ordinary hyphenated word
    // (read-only) is not one.
    const ids = [...new Set([...low.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b|\bc\d{1,2}\b/g)].map((m) => m[0]))].filter((x) => !/^20\d\d-\d\d-\d\d$/.test(x) && !/^\d/.test(x) && !/^[a-z]{2,5}-\d+$/.test(x) && !ACT_WORDS.includes(x) && lines.some((l) => l.text.includes(x)));
    const people = names.filter((x) => new RegExp(`\\b${x.replace(/[.@+]/g, '\\$&')}\\b`).test(low));
    // An account the package names (deploy@globex.test) is as specific as an id.
    for (const m of low.matchAll(/[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]+/g)) if (!ids.includes(m[0]) && !names.includes(m[0]) && lines.some((l) => l.text.includes(m[0]))) ids.push(m[0]);
    // A response's sentence that names nothing of its own ("this change") is about its exception: it is evidenced only
    // by a line that names the exception's subject.
    if (!ids.length && !people.length && t.about) ids.push(...t.about.filter((x) => lines.some((l) => l.text.includes(x))));
    const subjects = [...new Set([...ids, ...people, ...ACT_WORDS.filter((w) => low.includes(w))])];
    const acts = ACT_WORDS.filter((w) => new RegExp(`\\b${w}`).test(low)).map((w) => new RegExp(`\\b${w.replace(/-/g, '\\-')}`));
    const found: string[] = []; const support: string[] = []; let worst: Claim['status'] = 'vendor record'; const missing: string[] = [];
    for (const d of eventDates) {
      // Among qualifying lines, the one naming more of the claim's ids wins (a vendor row that merely shares the date and a
      // person must not stand for the record that states the fact); between lines naming as many, a vendor's record over
      // the client's (a long document names many subjects), then the one naming most of its other subjects.
      const idScore = (l: typeof lines[number]) => ids.filter((x) => l.text.includes(x)).length;
      const score = (l: typeof lines[number]) => ids.filter((x) => l.text.includes(x)).length * 3 + subjects.filter((x) => l.text.includes(x)).length;
      // Lines with the date that name one of the claim's ids; failing those, lines naming at least two of its subjects.
      // A line evidences the claim's fact, not only its subject: it records one of the acts the claim states.
      const onDay = lines.filter((l) => l.text.includes(d) && (!acts.length || acts.some((w) => w.test(l.text) || w.test(l.acts ?? ''))));
      const withId = ids.length ? onDay.filter((l) => ids.some((x) => l.text.includes(x))) : [];
      // A person named on the day is as specific as an id.
      const withPerson = people.length ? onDay.filter((l) => people.some((x) => l.text.includes(x))) : [];
      const hits = (withId.length ? withId : withPerson.length ? withPerson : onDay.filter((l) => subjects.filter((x) => l.text.includes(x)).length >= Math.min(2, subjects.length || 2)))
        .sort((a, b) => idScore(b) - idScore(a) || rank[a.kind] - rank[b.kind] || score(b) - score(a));
      if (!hits.length) { missing.push(d); continue; }
      support.push(...hits.map((l) => `${l.text} ${l.acts ?? ''}`));

      found.push(`${d}: ${hits[0].file}:${hits[0].n} (${hits[0].kind})`);
      if (rank[hits[0].kind] > rank[worst as keyof typeof rank]) worst = hits[0].kind;
    }
    // A line that carries the claim's date, subject and act corroborates when and who; the specific facts the claim
    // states (a time of day, a pull request, a release) are supported only if a supporting line carries them too.
    const facts = [...new Set([...sentence.matchAll(/\b\d{1,2}:\d{2}\b|#\d+\b|\bdeploy-v\d+\b/g)].map((m) => m[0].toLowerCase()))];
    const unconfirmed = missing.length ? [] : facts.filter((f) => !support.some((x) => x.includes(f.length === 4 ? `0${f}` : f) || x.includes(f)));
    if (unconfirmed.length) { out.push({ source: t.source, claim: sentence, status: 'partly supported', detail: `${found.join('; ')}; no supporting line states ${unconfirmed.join(', ')}` }); continue; }
    out.push(missing.length ? { source: t.source, claim: sentence, status: 'unsupported', detail: `no packaged line records ${missing.join(', ')} together with ${subjects.slice(0, 6).join(', ') || 'any subject of the claim'}` }
      : { source: t.source, claim: sentence, status: worst, detail: found.join('; ') });
  }
  return out;
}

const assertionOf = (root: string, id: string) => { const f = join(root, base(id), 'drafts', 'assertion.md'); return existsSync(f) ? readFileSync(f, 'utf8') : ''; };

// The package's own README, hashed in the manifest with the other derived views.
const readme = (organization: string, engagement: string, created: string, id: string, dangling: number) => `# SOC 2 audit package: ${organization}, engagement ${engagement}

Created ${created}. Start with \`review/index.html\`: the exceptions register, each automated check across the
period, every request with its evidence, and the control matrix, each line linked to the file it comes from
(\`review/*.csv\` hold the same tables). The views were derived from \`workspace/\` when the package was made; the
manifest shows they are unchanged since, not that they were derived correctly: every line names its source file. \`manifest.json\` lists every file under \`workspace/\` and \`review/\` with its SHA-256. Check it with
\`evidence-desk audit verify <this folder>\`, or compare the hashes with any SHA-256 tool. To respond, edit the request
files under \`workspace/${base(id)}/requests/\` (add to each thread with side "firm", set status "accepted" or "returned",
add sample items) and send the folder back. A hash shows that a file is unchanged; it does not show who made it.
The manifest names the workspace's commit and where it is published; \`review/workspace-history.txt\` lists who
committed each change. Where the firm can read the workspace's repository, \`git log\` any file there at that commit to
see who committed it and when, and that the file here is the one committed.
The package's digest is the SHA-256 of \`manifest.json\`; \`audit verify\` prints it. Record it when the package
arrives, by a channel the client does not control, and any later change to any file will show against it.
\`audit recollect <this folder>\` reads the change, deployment, Cloudflare and token populations again with the firm's
own read-only tokens and compares them row by row with the ones here.
\`manifest.json\` lists what stays in the workspace under \`omitted\`${dangling ? `, including ${dangling} file(s) a packaged file cites that the workspace does not hold` : ''}. This README is hashed with the views.
`;

export function exportPackage(root: string, id: string, out: string): { files: number; omitted: string[]; digest: string } {
  const e = readEngagement(root, id);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`${out} is not empty`);
  const ws = loadWorkspace(root);
  // A package is the whole record for its period: one that would silently lack a record the workspace could not read
  // is not made.
  const left = [...new Set(ws.problems.filter((p) => p.message.endsWith('(left out until fixed)')).map((p) => p.file))];
  if (left.length) throw new Error(`these records cannot be read, so the package would leave them out: ${left.join(', ')}. Fix them (evidence-desk validate) and export again`);
  const reqs = listRequests(root, id);
  const problems: string[] = [];
  // Only a regular file inside the workspace joins the package, and it is checked as it joins: a record naming a path
  // outside the workspace, or a link, is a problem and nothing of it is read.
  const paths = new (class extends Set<string> {
    add(p: string) { if (this.has(p)) return this; try { if (lstatSync(inside(root, p)).isFile()) return super.add(p); problems.push(`${p} is not a regular file in the workspace`); } catch (e) { problems.push(`${p}: ${(e as Error).message}`); } return this; }
  })([`${base(id)}/engagement.json`, ...reqs.map((r) => r.path)]);
  const draftDir = join(root, base(id), 'drafts');
  // Drafts go to the firm only once management has finished them, and every source a draft cites travels with it.
  // A cited path must stay inside the workspace; a folder the draft cites that is empty or absent backs a "none".
  if (existsSync(draftDir)) for (const f of readdirSync(draftDir, { withFileTypes: true }).filter((x) => x.isFile()).map((x) => x.name)) {
    const rel = `${base(id)}/drafts/${f}`;
    const text = readFileSync(join(root, rel), 'utf8');
    const prose = text.replace(/```[\s\S]*?```/g, '');
    if (text.includes('<!-- Drafted by Evidence Desk') || /\[[^\]]{3,}\](?![(\[])/.test(prose)) problems.push(`${rel} still has its drafting comment or a [bracketed] item to fill`);
    paths.add(rel);
    for (const line of prose.split('\n').filter((l) => /^\s*(?:[-*]\s*)?\**Sources:?\**:?/.test(l))) {
      for (const raw of line.replace(/^\s*(?:[-*]\s*)?\**Sources:?\**:?/, '').replace(/\([^)]*\)/g, '').split(/[,;]/)) {
        const tok = raw.trim().replace(/\.$/, '');
        if (!(tok.includes('/') || /\.(json|csv|md)$/.test(tok)) || /\s/.test(tok)) continue;
        const folder = tok.endsWith('/') || tok.includes('*');
        const dir = tok.replace(/\*.*$/, '').replace(/\/$/, '');
        try { inside(root, dir); } catch { problems.push(`${rel} cites ${tok}, which is not a path inside the workspace`); continue; }
        const globbed = folder ? listUnder(root, dir).filter((x) => !tok.includes('*') || new RegExp(`^${tok.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*')}$`).test(x)) : [tok];
        if (folder && !globbed.length) continue;
        if (!globbed.length || globbed.some((x) => !existsSync(join(root, x)))) problems.push(`${rel} cites ${tok}, which is not in the workspace`);
        else for (const x of globbed) paths.add(x);
      }
    }
  }
  const evidenceIds = new Set(reqs.flatMap((r) => [...r.data.evidence, ...(r.data.population ? [r.data.population] : []), ...(r.data.samples ?? []).flatMap((s) => s.evidence ?? [])]));
  for (const eid of evidenceIds) {
    const rec = ws.evidence.find((x) => x.data.id === eid);
    if (!rec) { problems.push(`evidence ${eid} is referenced but does not exist`); continue; }
    paths.add(rec.path);
    for (const f of rec.data.files) {
      const h = fileHash(root, f.path);
      if (!h) problems.push(`${f.path} (evidence ${eid}) is missing`);
      else if (h.sha256 !== f.sha256) problems.push(`${f.path} (evidence ${eid}) changed since it was recorded`);
      else paths.add(f.path);
    }
  }
  // Evidence no request names still travels when it speaks to an applicable control in the engagement's window: the
  // firm sees everything the organization holds for the period, not only what its request list happened to ask for.
  // The daily collector records are left out; their snapshots travel with the check runs.
  const win = e.data.period ?? { start: e.data.as_of ?? '', end: e.data.as_of ?? '' };
  const applicable = new Set(ws.controls.filter((c) => inSoc2Scope(ws, c.data)).map((c) => c.data.id));
  const yearBefore = new Date(Date.parse(`${win.end}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10);
  for (const rec of ws.evidence.filter((x) => x.data.controls.some((c) => applicable.has(c)) && !/collected by run/.test(x.data.title))) {
    // A record made after the period and before the package (the description's review, a subsequent event) is part of
    // what the firm tests the period with.
    const upTo = now().slice(0, 10) > win.end ? now().slice(0, 10) : win.end;
    const inWindow = rec.data.period ? rec.data.period.start <= win.end && rec.data.period.end >= win.start : rec.data.collected_at.slice(0, 10) >= yearBefore && rec.data.collected_at.slice(0, 10) <= upTo;
    if (!inWindow || paths.has(rec.path)) continue;
    const ok = rec.data.files.every((f) => fileHash(root, f.path)?.sha256 === f.sha256);
    if (!ok) continue;
    paths.add(rec.path); for (const f of rec.data.files) paths.add(f.path);
  }
  // The latest attribution check travels with every package: it names the pull request behind each person's act, which
  // the firm traces, and it is a record of the program rather than evidence of any one control.
  if (readVersioned(root, 'sources/github/attribution.json')) paths.add('sources/github/attribution.json');
  // A packaged GitHub deployments population travels with the Worker deployments matched against it: what reached
  // production on Cloudflare is the other half of that population's completeness.
  for (const g of ws.evidence.filter((x) => paths.has(x.path) && x.data.files.some((f) => f.path.includes('/github-deployments-')))) {
    const partner = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/cloudflare-worker-deployments-')) && (x.data.notes ?? '').includes(g.data.id))
      .sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
    if (partner) { paths.add(partner.path); for (const f of partner.data.files) if (existsSync(join(root, f.path))) paths.add(f.path); }
  }
  // So does the latest listing of non-human access: the machines an access review covers, and what a recorded credential
  // rotation is checked against.
  const machines = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/nonhuman-access-'))).sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  if (machines) { paths.add(machines.path); for (const f of machines.data.files) if (existsSync(join(root, f.path))) paths.add(f.path); }
  // What a firm reconciles against: the registers, every control the included evidence cites, the checks run during the
  // period, the project's declarations and each roster completeness check.
  for (const f of listUnder(root, 'registers')) paths.add(f);
  if (existsSync(join(root, base(id), 'exceptions.json'))) paths.add(`${base(id)}/exceptions.json`);
  const period = e.data.period ?? { start: e.data.as_of ?? '', end: e.data.as_of ?? '' };
  // Each run travels with what it decided from: every collector's snapshot and the evidence it recorded, so a daily
  // reading in a check's history traces to the vendor's answer that day.
  const evidenceById = new Map(ws.evidence.map((x) => [x.data.id, x]));
  for (const r of ws.runs) if (r.data.started_at.slice(0, 10) >= period.start && r.data.started_at.slice(0, 10) <= period.end) {
    paths.add(r.path);
    for (const c of r.data.collectors) {
      if (c.snapshot) { if (existsSync(join(root, c.snapshot))) paths.add(c.snapshot); else problems.push(`${c.snapshot} (run ${r.data.id}) is missing`); }
      const rec = c.evidence ? evidenceById.get(c.evidence) : undefined;
      if (rec) { paths.add(rec.path); for (const f of rec.data.files) if (existsSync(join(root, f.path))) paths.add(f.path); }
    }
  }
  // The latest import travels with the documents it read: the decisions, the SOC 2 checklist, the internal audit's job.
  const latestCommit = (readSnapshot(root)?.commit ?? '').slice(0, 12);
  for (const f of ['sources/open-autonomy/latest.json', ...listUnder(root, 'sources/open-autonomy/completeness'), ...(latestCommit ? listUnder(root, `sources/open-autonomy/${latestCommit}`) : [])]) if (existsSync(join(root, f))) paths.add(f);
  const cited = new Set([...reqs.flatMap((r) => r.data.controls), ...ws.evidence.filter((x) => paths.has(x.path)).flatMap((x) => x.data.controls)]);
  for (const cid of cited) {
    const c = ws.controls.find((x) => x.data.id === cid);
    if (!c) { problems.push(`control ${cid} does not exist`); continue; }
    paths.add(c.path);
    for (const pid of c.data.policies) {
      const p = ws.policies.find((x) => x.data.id === pid);
      const v = p?.data.versions.at(-1);
      if (p && v) { paths.add(p.path); paths.add(v.archived); }
    }
  }
  // Every workspace file a packaged file cites travels with it (a form's definition, the snapshot a description names,
  // a record an exception points to), until nothing new is cited; a cited file the workspace does not hold is listed in
  // the manifest's omissions with what cites it, so the firm never meets a dangling reference unexplained.
  const cites = /(?<![\w/.:@-])((?:evidence|sources|checks|forms|reviews|incidents|policies|registers|controls|audits)\/[\w.@+-]+(?:\/[\w.@+-]+)*\.(?:json|csv|md|txt|pdf|xlsx|yaml|yml|png|jpe?g))/g;
  const absent = new Map<string, string>();
  for (let scanned = new Set<string>(), round = 0; round < 10; round++) {
    const fresh = [...paths].filter((p) => !scanned.has(p) && /\.(json|md|csv|txt)$/.test(p) && !p.endsWith('.raw.json'));
    if (!fresh.length) break;
    for (const p of fresh) {
      scanned.add(p);
      const text = readFileSync(join(root, p), 'utf8');
      // An evidence record cited by id travels too, with its files.
      for (const m of text.matchAll(/\bEV-\d{8}-[0-9a-f]{6}\b/g)) {
        const rec = ws.evidence.find((x) => x.data.id === m[0]);
        if (rec) { paths.add(rec.path); for (const f of rec.data.files) if (existsSync(join(root, f.path))) paths.add(f.path); }
        else if (!absent.has(m[0])) absent.set(m[0], p);
      }
      for (const m of text.matchAll(cites)) {
        const ref = m[1];
        try { inside(root, ref); } catch { continue; }
        if (existsSync(join(root, ref))) paths.add(ref); else if (!absent.has(ref)) absent.set(ref, p);
      }
    }
  }
  // A path that is not a regular file inside the workspace stops the export here, before the claims, the description and
  // the views read anything a record names.
  if (problems.length) throw new Error(`the package cannot be exported:\n  ${problems.join('\n  ')}`);
  // A dated claim nothing in the package records, or a count its population contradicts, stops the export: the firm
  // should never be the first to find it.
  for (const c of claimsLedger(root, ws, e.data, id, paths, now().slice(0, 10)).filter((x) => x.status === 'unsupported' || x.status === 'contradiction')) problems.push(`${c.source} makes a claim the package does not support (${c.status}): "${c.claim.slice(0, 160)}" — ${c.detail}`);
  const draftDescription = join(root, base(id), 'drafts', 'description.md');
  if (existsSync(draftDescription)) for (const l of lintDescription(ws, e.data, readFileSync(draftDescription, 'utf8'), assertionOf(root, id)).filter((x) => x.status === 'contradiction')) problems.push(`the description contradicts the evidence (${l.rule}): ${l.detail}`);
  // A packaged response travels with its form's definition (the questions and correct answers it was graded against).
  for (const r of ws.responses) if (paths.has(`forms/responses/${r.data.id}.json`)) { const f = ws.forms.find((x) => x.data.id === r.data.form); if (f) paths.add(f.path); }
  // The assertion goes out signed: a signer, a signature and a date, not left to the firm to chase.
  const assertionFile = join(root, base(id), 'drafts', 'assertion.md');
  if (existsSync(assertionFile)) { const a = readFileSync(assertionFile, 'utf8');
    if (!/^Signed by: \S/m.test(a) || !/^Signature: \S/m.test(a) || !/^Date: 20\d\d-\d\d-\d\d\b/m.test(a)) problems.push(`${base(id)}/drafts/assertion.md is not signed (Signed by, Signature and Date lines)`);
    // A signature dated after the commit that holds it was written before its day: it is pre-dated.
    const signed = /^Date: (20\d\d-\d\d-\d\d)/m.exec(a)?.[1];
    try { const committed = execFileSync('git', ['-C', root, 'log', '-1', '--format=%cI', '--', `${base(id)}/drafts/assertion.md`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().slice(0, 10);
      if (signed && committed && signed > committed) problems.push(`${base(id)}/drafts/assertion.md is signed ${signed} in a commit of ${committed}: a signature is dated the day it is given`); } catch { /* not a Git repository */ } }
  // Every request goes out answered: an open one the client never responded to is the firm's to chase, not to receive.
  for (const r of reqs.filter((x) => x.data.status === 'open')) problems.push(`request ${r.data.id} (${r.data.title}) has no response from the client`);
  // Every exception the package raises goes out with management's response: the firm should never receive a
  // deviation the client has not answered.
  const created = now();
  const views = buildViews(root, ws, e.data, reqs, paths, created);
  for (const x of parseCsv(views.get('review/exceptions.csv')!, 'exceptions.csv').rows.filter((x) => !x.response.trim())) problems.push(`exception ${x.key} (${x.item}) has no management response (record one: ed audit <workspace> ${id} exception ${x.key} --response <text> --by <person>)`);
  // Every file goes out only if it is a regular file inside the workspace: a record naming a path outside it, or a
  // link, stops the export before anything is written.
  for (const p of paths) {
    try { if (!lstatSync(inside(root, p)).isFile()) problems.push(`${p} is not a regular file in the workspace`); }
    catch (e) { problems.push(`${p}: ${(e as Error).message}`); }
  }
  if (problems.length) throw new Error(`the package cannot be exported:\n  ${problems.join('\n  ')}`);
  mkdirSync(out, { recursive: true });
  const files = [...paths].sort().map((p) => {
    const dest = join(out, 'workspace', p);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(inside(root, p), dest);
    const h = fileHash(join(out, 'workspace'), p)!;
    return { path: p, sha256: h.sha256, bytes: h.bytes };
  });
  const omitted = ['Evidence outside the engagement window and evidence of excluded controls stay in the workspace; the control matrix lists every control with its evidence ids, and the firm may ask for any of it.',
    ...[...absent].sort(([a], [b]) => a.localeCompare(b)).map(([ref, by]) => `${ref}: cited by ${by}, and not in the workspace`),
    // Each committed file the package leaves out, by name, so the firm need not diff the history to find it.
    ...(() => { try { return execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter((f) => f && !paths.has(f))
      .map((f) => `${f}: ${f.startsWith('evidence/') ? 'evidence outside the window or of an excluded control' : f.startsWith('checks/runs/') ? 'a check run outside the period' : f.startsWith('.github/') || f === 'collectors.json' || f === 'trust.json' || f === 'evidence-desk.json' ? 'the workspace\'s own configuration' : 'not cited by any packaged file'}`); } catch { return []; } })()];
  const described = existsSync(join(root, base(id), 'drafts', 'description.md')) ? readFileSync(join(root, base(id), 'drafts', 'description.md'), 'utf8') : null;
  // The workspace's own history on its default line: who merged each change to the program's records and when, so a
  // register edit or an attribution row can be traced to the commit and pull request that made it.
  try {
    const log = execFileSync('git', ['-C', root, 'log', '--first-parent', '--format=%H %cI %an <%ae>%n    %s', 'HEAD', '--', '.'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    views.set('review/workspace-history.txt', `git log --first-parent HEAD -- . in the workspace repository at ${created}\n\n${log}`);
  } catch { /* a workspace that is not a Git repository has no history to ship */ }
  views.set('review/claims.csv', writeCsv({ columns: ['source', 'status', 'claim', 'detail'], rows: claimsLedger(root, ws, e.data, id, paths, created.slice(0, 10)) }));
  if (described) views.set('review/description-lint.csv', writeCsv({ columns: ['rule', 'status', 'detail'], rows: lintDescription(ws, e.data, described, assertionOf(root, id)) }));
  views.set('README.md', readme(ws.manifest?.data.organization ?? '', e.data.id, created, id, absent.size));
  const derived = [...views].sort(([a], [b]) => a.localeCompare(b)).map(([p, text]) => {
    const dest = join(out, p);
    mkdirSync(dirname(dest), { recursive: true });
    // The review tables are for a spreadsheet: text from third parties (a pull request's title) opens as text there.
    // Evidence files are copied exactly.
    const body = p.endsWith('.csv') ? spreadsheetCsv(text, p) : text;
    writeFileSync(dest, body);
    return { path: p, sha256: sha256(Buffer.from(body)), bytes: Buffer.byteLength(body) };
  });
  // The workspace's commit and where it is published: the hosted repository's history dates every record independently
  // of this package, so the firm can check that a file here is the file committed there, and when.
  let workspace: Record<string, unknown> = {};
  try {
    const g = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const head = g('rev-parse', 'HEAD');
    const remote = (() => { try { return g('remote', 'get-url', 'origin').replace(/\/\/[^/@]*@/, '//'); } catch { return ''; } })();
    const pushed = remote ? g('branch', '-r', '--contains', head, '--format=%(refname:short)').split('\n').filter((x) => x && x !== 'origin/HEAD') : [];
    workspace = { commit: head, committed_at: g('show', '-s', '--format=%cI', head), remote, remote_branches: pushed, uncommitted: g('status', '--porcelain', '--', '.') ? 'yes' : 'no' };
  } catch { /* not a Git repository */ }
  const manifest = { schema: 'evidence-desk.audit-package/1', engagement: e.data.id, organization: ws.manifest?.data.organization ?? '', created_at: created, ...(Object.keys(workspace).length ? { workspace } : {}), files, derived,
    omitted,
    request_versions: Object.fromEntries(reqs.map((r) => [r.data.id, r.version])) };
  valid('audit-package', manifest, 'the package manifest');
  writeFileSync(join(out, 'manifest.json'), pretty(manifest));
  // The package's digest: the SHA-256 of its manifest, which hashes every other file. The firm records it on receipt, by
  // its own channel, and any later change to any file shows against a value the client does not hold.
  return { files: files.length, omitted: manifest.omitted, digest: sha256(Buffer.from(pretty(manifest))) };
}

// A file a received package names, opened only if it is a regular file inside the package folder given: a path that
// leaves it, or a link, is refused before anything is read.
function packaged(baseDir: string, rel: string): string | { problem: string } {
  try {
    // The folder a path is resolved in must itself be a real folder of the package, not a link to somewhere else.
    if (lstatSync(baseDir).isSymbolicLink()) return { problem: `${baseDir} is a link, not a folder of the package` };
    const full = inside(baseDir, rel);
    if (!existsSync(full)) return { problem: 'listed but missing' };
    return lstatSync(full).isFile() ? full : { problem: 'not a regular file in the package' };
  } catch (e) { return { problem: (e as Error).message }; }
}
// The package's workspace folder, refused if it is a link rather than a folder of the package.
export function packageWorkspace(dir: string): string {
  const ws = join(dir, 'workspace');
  if (!existsSync(ws) || lstatSync(ws).isSymbolicLink() || !lstatSync(ws).isDirectory()) throw new Error(`${ws} is not a folder of the package`);
  return ws;
}
export const packagedFile = (baseDir: string, rel: string): string => { const f = packaged(baseDir, rel); if (typeof f !== 'string') throw new Error(`${rel}: ${f.problem}`); return f; };

export function verifyPackage(dir: string): { ok: boolean; problems: string[]; files: number; digest?: string } {
  const manifest = JSON.parse(readFileSync(packagedFile(dir, 'manifest.json'), 'utf8'));
  const errs = check(schema('audit-package'), manifest);
  if (errs.length) return { ok: false, problems: errs, files: 0 };
  const problems: string[] = [];
  const listed = new Set<string>();
  for (const f of manifest.files as { path: string; sha256: string }[]) {
    listed.add(f.path);
    const full = packaged(join(dir, 'workspace'), f.path);
    if (typeof full !== 'string') problems.push(`${f.path}: ${full.problem}`);
    else if (sha256(readFileSync(full)) !== f.sha256) problems.push(`${f.path} does not match the manifest`);
  }
  const walk = (d: string, rel = ''): string[] => readdirSync(join(d, rel), { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(d, join(rel, x.name)) : [join(rel, x.name).split('\\').join('/')]);
  for (const f of walk(join(dir, 'workspace'))) if (!listed.has(f)) problems.push(`${f} is in the package but not in the manifest`);
  const views = new Set<string>();
  for (const f of (manifest.derived ?? []) as { path: string; sha256: string }[]) {
    views.add(f.path);
    const full = packaged(dir, f.path);
    if (typeof full !== 'string') problems.push(`${f.path}: ${full.problem}`);
    else if (sha256(readFileSync(full)) !== f.sha256) problems.push(`${f.path} does not match the manifest`);
  }
  if (existsSync(join(dir, 'review'))) for (const f of walk(join(dir, 'review'))) if (!views.has(`review/${f}`)) problems.push(`review/${f} is in the package but not in the manifest`);
  return { ok: !problems.length, problems, files: manifest.files.length, digest: sha256(readFileSync(packagedFile(dir, 'manifest.json'))) };
}

// Brings the firm's side of a returned package into the workspace. Messages are merged, samples the firm added are
// added, and the firm's status is taken unless the client also changed the request since export; then both are kept
// in view and the difference is reported, never overwritten.
export function importReturn(root: string, id: string, dir: string): { updated: string[]; added: string[]; conflicts: string[] } {
  const manifest = JSON.parse(readFileSync(packagedFile(dir, 'manifest.json'), 'utf8'));
  if (manifest.engagement !== id) throw new Error(`the package is for engagement ${manifest.engagement}, not ${id}`);
  const out = { updated: [] as string[], added: [] as string[], conflicts: [] as string[] };
  const reqDir = join(dir, 'workspace', base(id), 'requests');
  for (const f of existsSync(reqDir) ? readdirSync(reqDir).filter((x) => x.endsWith('.json')) : []) {
    const file = packaged(join(dir, 'workspace'), `${base(id)}/requests/${f}`);
    if (typeof file !== 'string') { out.conflicts.push(`${f} in the package: ${file.problem}`); continue; }
    const theirs = JSON.parse(readFileSync(file, 'utf8')) as AuditRequest;
    const errs = check(schema('audit-request'), theirs);
    if (errs.length) { out.conflicts.push(`${f} in the package is invalid: ${errs.join('; ')}`); continue; }
    const rel = `${base(id)}/requests/${theirs.id}.json`;
    const cur = readVersioned(root, rel);
    if (!cur) {
      if (theirs.thread.some((m) => m.side === 'client')) { out.conflicts.push(`request ${theirs.id} is new in the package but carries client messages; not imported`); continue; }
      writeVersioned(root, rel, pretty(theirs), null); out.added.push(theirs.id); continue;
    }
    const mine = JSON.parse(cur.text) as AuditRequest;
    const clientChanged = cur.version !== manifest.request_versions?.[theirs.id];
    const key = (m: Message) => `${m.at}|${m.by}|${m.side}|${m.text}`;
    const seen = new Set(mine.thread.map(key));
    const newMsgs = theirs.thread.filter((m) => !seen.has(key(m)));
    if (newMsgs.some((m) => m.side === 'client')) out.conflicts.push(`request ${theirs.id}: the package carries client messages that are not in the workspace; only firm messages were imported`);
    const next: AuditRequest = { ...mine, thread: [...mine.thread, ...newMsgs.filter((m) => m.side === 'firm')].sort((a, b) => a.at.localeCompare(b.at)) };
    const have = new Set((mine.samples ?? []).map((s) => s.item));
    const addedSamples = (theirs.samples ?? []).filter((s) => !have.has(s.item)).map((s) => ({ item: s.item, status: 'pending' as const, ...(s.note ? { note: s.note } : {}) }));
    if (addedSamples.length) next.samples = [...(mine.samples ?? []), ...addedSamples];
    for (const s of theirs.samples ?? []) if (s.status === 'exception') { const m = next.samples?.find((x) => x.item === s.item); if (m && m.status !== 'exception') { m.status = 'exception'; if (s.note) m.note = s.note; } }
    if (theirs.status !== mine.status && (theirs.status === 'accepted' || theirs.status === 'returned')) {
      if (clientChanged && mine.status !== 'submitted') out.conflicts.push(`request ${theirs.id}: the firm marked it ${theirs.status}, but it changed here since export (now ${mine.status}); kept ${mine.status}`);
      else next.status = theirs.status;
    }
    if (JSON.stringify(next) !== JSON.stringify(mine)) {
      valid('audit-request', next, rel);
      writeVersioned(root, rel, pretty(next), cur.version);
      out.updated.push(theirs.id);
    }
  }
  return out;
}

// ── The firm's view ─────────────────────────────────────────────────────────────────────────────────────────────
// Reads each client workspace the firm lists and reports, per client, only its own engagements, request counts and
// readiness. Nothing from one client is shown beside another client's records.
export function firmSummary(firmFile: string): { firm: string; clients: { name: string; organization: string; engagements: { id: string; type: string; period: string; status: string; requests: Record<string, number>; exceptions: number }[]; readiness: string; error?: string }[] } {
  const doc = JSON.parse(readFileSync(firmFile, 'utf8'));
  const errs = check(schema('firm'), doc);
  if (errs.length) throw new Error(`${firmFile} is invalid: ${errs.join('; ')}`);
  return { firm: doc.firm, clients: (doc.clients as { name: string; path: string }[]).map((c) => {
    const path = resolve(dirname(firmFile), c.path);
    try {
      const ws = loadWorkspace(path);
      const g = computeGaps(ws);
      const dir = join(path, 'audits');
      const engagements = (existsSync(dir) ? readdirSync(dir) : []).filter((d) => existsSync(join(dir, d, 'engagement.json'))).map((d) => {
        const e = readEngagement(path, d).data;
        const reqs = listRequests(path, d).map((r) => r.data);
        const requests: Record<string, number> = {};
        for (const r of reqs) requests[r.status] = (requests[r.status] ?? 0) + 1;
        return { id: e.id, type: e.type === 'type1' ? 'Type 1' : 'Type 2', period: e.type === 'type1' ? `as of ${e.as_of}` : `${e.period!.start} to ${e.period!.end}`, status: e.status, requests,
          exceptions: reqs.flatMap((r) => r.samples ?? []).filter((s) => s.status === 'exception').length };
      });
      return { name: c.name, organization: ws.manifest?.data.organization ?? '', engagements, readiness: `${g.summary.controls_ready}/${g.summary.controls_applicable} controls ready` };
    } catch (err) { return { name: c.name, organization: '', engagements: [], readiness: '', error: (err as Error).message }; }
  }) };
}

export const newId = () => randomBytes(3).toString('hex');

// The firm's side of a received package: one act on one request file inside the package. The firm can add a message,
// select samples from the attached population, mark a sample an exception, and accept or return the request.
export function respondInPackage(dir: string, requestId: string, version: string, change: { by: string; text?: string; status?: 'accepted' | 'returned'; select?: string[]; exception?: { item: string; note?: string } }): void {
  const manifest = JSON.parse(readFileSync(packagedFile(dir, 'manifest.json'), 'utf8'));
  const wsDir = packageWorkspace(dir);
  const rel = `${base(manifest.engagement)}/requests/${requestId}.json`;
  packagedFile(wsDir, rel);
  const cur = readVersioned(wsDir, rel);
  if (!cur) throw new Error(`request ${requestId} is not in this package`);
  if (cur.version !== version) throw new Error(`${rel} changed since it was read; reload it and try again`);
  if (!change.by.trim()) throw new Error('say who is responding');
  const req = JSON.parse(cur.text) as AuditRequest;
  const notes: string[] = [];
  if (change.select?.length) {
    if (req.kind !== 'sample' || !req.population) throw new Error('samples are selected from the population attached to a sample request');
    const pop = JSON.parse(readFileSync(packagedFile(wsDir, `evidence/records/${req.population}.json`), 'utf8'));
    const keys = new Set((pop.files as { path: string }[]).flatMap((f) => parseCsv(readFileSync(packagedFile(wsDir, f.path), 'utf8'), f.path).rows.map((r) => Object.values(r)[0])));
    for (const s of change.select) if (!keys.has(s)) throw new Error(`${s} is not an item of the population`);
    const have = new Set((req.samples ?? []).map((s) => s.item));
    req.samples = [...(req.samples ?? []), ...change.select.filter((s) => !have.has(s)).map((item) => ({ item, status: 'pending' as const }))];
    notes.push(`selected ${change.select.join(', ')}`);
  }
  if (change.exception) {
    const s = (req.samples ?? []).find((x) => x.item === change.exception!.item);
    if (!s) throw new Error(`${change.exception.item} is not a selected sample`);
    s.status = 'exception';
    if (change.exception.note) s.note = change.exception.note;
    notes.push(`sample ${s.item}: exception`);
  }
  if (change.status) { req.status = change.status; notes.push(`status ${change.status}`); }
  const text = [change.text?.trim(), notes.length ? `(${notes.join('; ')})` : ''].filter(Boolean).join(' ');
  if (!text) throw new Error('nothing to record');
  req.thread.push({ at: now(), by: change.by, side: 'firm', text });
  valid('audit-request', req, rel);
  writeVersioned(wsDir, rel, pretty(req), version);
}

export function packageState(dir: string) {
  const manifest = JSON.parse(readFileSync(packagedFile(dir, 'manifest.json'), 'utf8'));
  const wsDir = packageWorkspace(dir);
  const e = JSON.parse(readFileSync(packagedFile(wsDir, `${base(manifest.engagement)}/engagement.json`), 'utf8')) as Engagement;
  const reqDir = join(wsDir, base(manifest.engagement), 'requests');
  const requests = readdirSync(reqDir).filter((f) => f.endsWith('.json')).sort().map((f) => { packagedFile(wsDir, `${base(manifest.engagement)}/requests/${f}`); const r = readVersioned(wsDir, `${base(manifest.engagement)}/requests/${f}`)!; return { ...(JSON.parse(r.text) as AuditRequest), version: r.version }; });
  const drafts = existsSync(join(wsDir, base(manifest.engagement), 'drafts')) ? readdirSync(join(wsDir, base(manifest.engagement), 'drafts')).map((f) => `${base(manifest.engagement)}/drafts/${f}`) : [];
  const evidence = Object.fromEntries((manifest.files as { path: string }[]).filter((f) => f.path.startsWith('evidence/records/')).map((f) => { const r = JSON.parse(readFileSync(packagedFile(wsDir, f.path), 'utf8')); return [r.id, { title: r.title, files: r.files.map((x: { path: string }) => x.path), source: r.source, period: r.period ?? null, collected_at: r.collected_at }]; }));
  return { organization: manifest.organization, created_at: manifest.created_at, engagement: e, requests, drafts, evidence, verification: verifyPackage(dir) };
}

// Management's response to an exception the package derives (review/exceptions.csv names each by key): what happened,
// what was done and by when. It is a person's statement, kept beside the engagement and shown with the exception.
// A response names the workspace files behind its claims (--cite); each must exist, and it travels in the package.
// The exceptions register as the package will list it, with each response recorded so far: management answers every
// row before the package can be exported.
export function exceptionsRegister(root: string, id: string): Record<string, string>[] {
  const ws = loadWorkspace(root);
  const e = readEngagement(root, id).data;
  return parseCsv(buildViews(root, ws, e, listRequests(root, id), derivable(ws), now()).get('review/exceptions.csv')!, 'exceptions.csv').rows;
}

export function respondToException(root: string, id: string, key: string, text: string, by: string, cites: string[] = []): { file: string } {
  readEngagement(root, id);
  if (!text.trim()) throw new Error('the response needs --response <text>');
  const ws = loadWorkspace(root);
  const e = readEngagement(root, id).data;
  const known = parseCsv(buildViews(root, ws, e, listRequests(root, id), derivable(ws), now()).get('review/exceptions.csv')!, 'exceptions.csv').rows.map((r) => r.key);
  if (!known.includes(key)) throw new Error(`${key} is not an exception the workspace derives for engagement ${id}; take the key from review/exceptions.csv`);
  if (!(loadWorkspace(root).registers.people?.data.rows ?? []).some((r) => r.id === by)) throw new Error(`${by || '(none)'} is not in registers/people.csv`);
  const rel = `${base(id)}/exceptions.json`;
  const cur = readVersioned(root, rel);
  for (const c of cites) { inside(root, c); if (!existsSync(join(root, c))) throw new Error(`${c} is not a file in the workspace`); }
  const doc = cur ? JSON.parse(cur.text) as { responses: Record<string, { text: string; by: string; at: string; cites?: string[] }> } : { responses: {} };
  // The same response recorded again keeps when and by whom it was first given: a response's date is evidence too.
  const prev = doc.responses[key];
  if (prev && prev.text === text.trim() && prev.by === by && (prev.cites ?? []).join(';') === cites.join(';')) return { file: rel };
  doc.responses[key] = { text: text.trim(), by, at: now(), ...(cites.length ? { cites } : {}) };
  writeVersioned(root, rel, pretty(doc), cur?.version ?? null);
  return { file: rel };
}

