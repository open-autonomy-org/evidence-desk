// Populations and administrator lists read from GitHub's REST API with the owner's own token (GITHUB_TOKEN).
// Each result is written into the workspace with the exact requests that produced it and how completeness was
// established, then recorded as evidence. Nothing is sent to GitHub but reads.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeCsv } from './csv.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import type { Snapshot } from './open-autonomy.ts';

const API = 'https://api.github.com';
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

async function get(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set; export a read-only token for the account');
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  if (!r.ok) throw new Error(`GET ${path} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Every page until an empty or short one; the page count is part of the completeness basis.
async function all<T>(path: string): Promise<{ items: T[]; pages: number }> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const batch = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`) as T[];
    items.push(...batch);
    if (batch.length < 100) return { items, pages: page };
    if (page >= 100) throw new Error(`${path} has more than 10,000 results; narrow the period`);
  }
}

const inPeriod = (at: string | null | undefined, start: string, end: string) => !!at && at.slice(0, 10) >= start && at.slice(0, 10) <= end;
const applicableOf = (root: string, ids: string[]) => { const a = new Set(loadWorkspace(root).controls.filter((c) => c.data.applicable).map((c) => c.data.id)); return ids.filter((c) => a.has(c)); };

type Pull = { number: number; title: string; user?: { login?: string }; merged_at: string | null; merged_by?: { login?: string } };
type Review = { user?: { login?: string }; state: string; submitted_at?: string };

export async function collectChanges(root: string, input: { repo: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unknown: number; notIndependent: number }> {
  const pulls = await all<Pull>(`/repos/${input.repo}/pulls?state=closed&sort=created&direction=asc`);
  const merged = pulls.items.filter((p) => inPeriod(p.merged_at, input.start, input.end));
  const rows: Record<string, string>[] = [];
  for (const p of merged) {
    const reviews = (await all<Review>(`/repos/${input.repo}/pulls/${p.number}/reviews`)).items;
    const approvals = reviews.filter((r) => r.state === 'APPROVED');
    const author = p.user?.login ?? '';
    const approvers = [...new Set(approvals.map((r) => r.user?.login ?? ''))];
    const independent = !approvals.length ? 'no' : !author || approvers.some((a) => !a || a === 'twin') ? 'unknown' : approvers.some((a) => a !== author) ? 'yes' : 'no';
    rows.push({ number: String(p.number), title: p.title, author, merged_at: p.merged_at ?? '', merged_by: p.merged_by?.login ?? '', approvals: String(approvals.length), approvers: approvers.join(';'), independent_approval: independent });
  }
  const rel = `evidence/files/populations/github-changes-${input.repo.replace('/', '-')}-${input.start}-${input.end}-${Date.now()}.csv`;
  writeVersioned(root, rel, writeCsv({ columns: ['number', 'title', 'author', 'merged_at', 'merged_by', 'approvals', 'approvers', 'independent_approval'], rows }), null);
  const query = `GET /repos/${input.repo}/pulls?state=closed (all ${pulls.pages} page(s), ${pulls.items.length} closed pull requests), keeping those merged ${input.start}..${input.end}; GET /repos/${input.repo}/pulls/{n}/reviews for each`;
  const unknown = rows.filter((r) => r.independent_approval === 'unknown').length;
  const notIndependent = rows.filter((r) => r.independent_approval === 'no').length;
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} changes merged to ${input.repo}, ${input.start} to ${input.end}`, controls: applicableOf(root, ['CHG-01', 'CHG-02']), files: [rel], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'github', query },
    notes: `Complete: every page of closed pull requests was read. ${notIndependent} merged without an approval from someone other than the author; independence could not be established for ${unknown} (the approver or author is not identified by the source).`,
  });
  return { evidence, rows: rows.length, unknown, notIndependent };
}

type Deployment = { id: number; ref: string; sha: string; environment: string; created_at: string; creator?: { login?: string } };
type Status = { state: string; created_at: string; creator?: { login?: string } };

export async function collectDeployments(root: string, input: { repo: string; environment: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number }> {
  const deps = await all<Deployment>(`/repos/${input.repo}/deployments?environment=${encodeURIComponent(input.environment)}`);
  const rows: Record<string, string>[] = [];
  for (const d of deps.items.filter((x) => inPeriod(x.created_at, input.start, input.end))) {
    const statuses = (await all<Status>(`/repos/${input.repo}/deployments/${d.id}/statuses`)).items;
    const last = statuses[0];
    rows.push({ id: String(d.id), ref: d.ref, sha: d.sha, created_at: d.created_at, creator: d.creator?.login ?? '', final_state: last?.state ?? 'none', final_at: last?.created_at ?? '' });
  }
  const rel = `evidence/files/populations/github-deployments-${input.repo.replace('/', '-')}-${input.environment}-${input.start}-${input.end}-${Date.now()}.csv`;
  writeVersioned(root, rel, writeCsv({ columns: ['id', 'ref', 'sha', 'created_at', 'creator', 'final_state', 'final_at'], rows }), null);
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} deployments of ${input.repo} to ${input.environment}, ${input.start} to ${input.end}`, controls: applicableOf(root, ['CHG-03']), files: [rel], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'github', query: `GET /repos/${input.repo}/deployments?environment=${input.environment} (all ${deps.pages} page(s)); GET /repos/${input.repo}/deployments/{id}/statuses for each` },
    notes: 'Complete: every page of deployments to the environment was read.',
  });
  return { evidence, rows: rows.length };
}

// Compares a vendor account's administrators with the project's roster. The list comes from GitHub for a GitHub
// organization, or from an exported file (one login or email per line, or a CSV with an account column) otherwise.
export async function checkCompleteness(root: string, input: { account: string; by: string; file?: string; generated_by?: string }): Promise<{ record: string; outside: string[] }> {
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  if (!latest) throw new Error('import the Open Autonomy project first (evidence-desk open-autonomy import)');
  const snap = JSON.parse(latest.text) as Snapshot;
  const acct = snap.vendor_accounts.find((a) => a.id === input.account);
  if (!acct) throw new Error(`${input.account} is not a vendor account the project declares (${snap.vendor_accounts.map((a) => a.id).join(', ') || 'none'})`);
  let admins: string[];
  let query: string;
  if (input.file) {
    const text = readVersioned(root, input.file);
    if (!text) throw new Error(`${input.file} is not a file in the workspace`);
    if (!input.generated_by?.trim()) throw new Error('say how the administrator list was exported, so its completeness can be checked');
    const lines = text.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().split(',');
    const col = ['account', 'login', 'email', 'user'].map((c) => header.indexOf(c)).find((i) => i >= 0) ?? -1;
    admins = (col >= 0 ? lines.slice(1).map((l) => l.split(',')[col].trim()) : lines).filter(Boolean);
    query = `${input.generated_by} (file ${input.file})`;
  } else if (acct.vendor === 'github') {
    admins = (await all<{ login: string }>(`/orgs/${acct.account}/members?role=admin`)).items.map((m) => m.login);
    query = `GET /orgs/${acct.account}/members?role=admin (all pages)`;
  } else throw new Error(`${acct.vendor} administrators cannot be read automatically yet; export the list and pass --file`);
  const known = new Set(snap.team.flatMap((m) => [m.github, m.discord, m.id].filter(Boolean).map((x) => String(x).toLowerCase())));
  const emails = new Set((loadWorkspace(root).registers.people?.data.rows ?? []).filter((p) => snap.team.some((m) => m.id === p.id)).map((p) => p.email.toLowerCase()).filter(Boolean));
  const outside = admins.filter((a) => !known.has(a.toLowerCase()) && !emails.has(a.toLowerCase()));
  const id = `${acct.id}-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const rel = `sources/open-autonomy/completeness/${id}.json`;
  const rec = { schema: 'evidence-desk.completeness/1', id, account: acct.account, vendor: acct.vendor, checked_at: now(), query, commit: snap.commit, admins, outside };
  writeVersioned(root, rel, JSON.stringify(rec, null, 2) + '\n', null);
  if (!outside.length) addEvidence(root, {
    title: `Every administrator of ${acct.vendor} ${acct.account} is on the roster`, controls: applicableOf(root, ['AC-04']), files: [rel], recorded_by: input.by,
    source: { kind: 'collector', name: acct.vendor, query },
  });
  return { record: rel, outside };
}

// Whether each act a person signs in the workspace was recorded by that person, through a seam's door (ADR 0008): the
// workspace is a Git repository on GitHub, a person records an act in a pull request of their own, and GitHub says who
// opened it. An act is part of a file: a form response (the whole file), an access review's sign-off, a policy's
// latest approval, an incident's closing review. The commit on the default branch that brought the act to its present
// content must come from a pull request merged into that branch and opened by the person's GitHub account on the Open
// Autonomy roster, and the working file must hold the act as merged. Residual: a collaborator who pushes to a person's
// open pull request branch is not told apart from them.
export type Act = { key: string; kind: 'response' | 'access-review' | 'policy-approval' | 'incident-closure'; file: string; person: string; label: string; extract: (record: any) => unknown };
export function signedActs(root: string): Act[] {
  const ws = loadWorkspace(root);
  const titles = new Map(ws.forms.map((f) => [f.data.id, f.data.title]));
  const acts: Act[] = [];
  for (const r of ws.responses) acts.push({ key: `response:${r.data.id}`, kind: 'response', file: `forms/responses/${r.data.id}.json`, person: r.data.person, label: `${titles.get(r.data.form) ?? r.data.form} (${r.data.id})`, extract: (x) => x });
  for (const a of ws.accessReviews) if (a.data.status === 'signed-off') acts.push({ key: `access-review:${a.data.id}`, kind: 'access-review', file: `reviews/access/${a.data.id}.json`, person: a.data.reviewer, label: `sign-off of access review ${a.data.id} (${a.data.system})`,
    extract: (x) => x?.status === 'signed-off' ? { status: x.status, signed_off_at: x.signed_off_at, accounts: x.accounts } : null });
  for (const p of ws.policies) { const v = p.data.versions.at(-1); if (v) acts.push({ key: `policy-approval:${p.data.id}:${v.version}`, kind: 'policy-approval', file: `policies/${p.data.id}.json`, person: v.approved_by, label: `approval of policy ${p.data.id} version ${v.version}`,
    extract: (x) => (x?.versions ?? []).find((y: any) => y.version === v.version) ?? null }); }
  // An incident's closing is the act of whoever recorded the closing update: the timeline entry at closed_at.
  const closer = (x: any) => (x?.timeline ?? []).find((t: any) => t.at === x?.closed_at) ?? (x?.timeline ?? []).at(-1) ?? null;
  for (const i of ws.incidents) if (i.data.status === 'closed') acts.push({ key: `incident-closure:${i.data.id}`, kind: 'incident-closure', file: `incidents/${i.data.id}.json`, person: closer(i.data)?.by ?? '', label: `closing review of incident ${i.data.id}`,
    extract: (x) => x?.status === 'closed' ? { status: x.status, review: x.review, closed_at: x.closed_at, closed_by: closer(x) } : null });
  return acts;
}
export type AttributionStatus = 'verified' | 'no GitHub account on the roster' | 'not on the default branch' | 'changed since merged'
  | 'not on GitHub' | 'no merged pull request' | 'recorded by someone else';
export type Attribution = { key: string; kind: Act['kind']; file: string; person: string; label: string; value_sha256: string; commit: string; pull: string; author: string; expected: string; status: AttributionStatus };
export const actDigest = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex');
const writeCsvFile = (root: string, rel: string, rows: Attribution[]) => writeVersioned(root, rel, writeCsv({ columns: ['key', 'kind', 'file', 'person', 'label', 'value_sha256', 'commit', 'pull', 'author', 'expected', 'status'], rows }), null);
export async function collectAttribution(root: string, input: { repo: string; by: string }): Promise<{ record: string; file: string; evidence: null; rows: Attribution[] }> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repo)) throw new Error('--repo names the workspace\'s own GitHub repository as owner/name');
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  if (!latest) throw new Error('import the Open Autonomy project first (evidence-desk open-autonomy import): its roster holds each person\'s GitHub account');
  const snap = JSON.parse(latest.text) as Snapshot;
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try { git('rev-parse', '--show-toplevel'); } catch { throw new Error('the workspace is not a Git repository; acts are recorded through pull requests to it'); }
  if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('the workspace is a shallow clone; fetch its full history (git fetch --unshallow) so every change to an act can be traced');
  const branch = (await get(`/repos/${input.repo}`) as { default_branch: string }).default_branch;
  const ref = `origin/${branch}`;
  try { git('rev-parse', '--verify', '--quiet', ref); } catch { throw new Error(`${ref} is not in the workspace; fetch it (git fetch origin ${branch})`); }
  const prefix = git('rev-parse', '--show-prefix');
  const at = (commit: string, file: string): unknown => { try { return JSON.parse(execFileSync('git', ['-C', root, 'show', `${commit}:${prefix}${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch { return null; } };
  const pullsOf = async (sha: string): Promise<(Pull & { base?: { ref?: string } })[] | null> => {
    try { return await get(`/repos/${input.repo}/commits/${sha}/pulls`) as (Pull & { base?: { ref?: string } })[]; }
    catch (e) { if (/answered (404|422)/.test((e as Error).message)) return null; throw e; }
  };
  const rows: Attribution[] = [];
  for (const act of signedActs(root)) {
    const current = act.extract(JSON.parse(readVersioned(root, act.file)!.text));
    const expected = snap.team.find((m) => m.id === act.person)?.github ?? '';
    const row: Attribution = { key: act.key, kind: act.kind, file: act.file, person: act.person, label: act.label, value_sha256: actDigest(current), commit: '', pull: '', author: '', expected, status: 'verified' };
    rows.push(row);
    if (!expected) { row.status = 'no GitHub account on the roster'; continue; }
    // The default branch's own line (first parents), newest first: the act was introduced by the newest commit whose
    // first parent did not hold it. A merge commit maps to the pull request it merged; a pull request's branch commits
    // are never walked, so another pull request touching the same file cannot be mistaken for the act's.
    const commits = git('log', '--first-parent', '--no-renames', '--format=%H', ref, '--', act.file).split('\n').filter(Boolean);
    const same = (c: string) => actDigest(act.extract(at(c, act.file))) === row.value_sha256;
    if (!commits.length || actDigest(act.extract(at(ref, act.file))) === actDigest(null)) { row.status = 'not on the default branch'; continue; }
    if (!same(ref)) { row.status = 'changed since merged'; continue; }
    let intro = '';
    for (const c of commits) { if (!same(c)) break; intro = c; if (!same(`${c}^1`)) break; }
    row.commit = intro;
    const found = await pullsOf(intro);
    if (!found) { row.status = 'not on GitHub'; continue; }
    const into = found.filter((p) => p.merged_at && p.base?.ref === branch);
    const pr = into.find((p) => (p.user?.login ?? '').toLowerCase() === expected.toLowerCase()) ?? into[0];
    if (!pr) { row.status = 'no merged pull request'; continue; }
    row.pull = String(pr.number); row.author = pr.user?.login ?? '';
    if (row.author.toLowerCase() !== expected.toLowerCase()) row.status = 'recorded by someone else';
  }
  const rel = 'sources/github/attribution.json';
  const record = { schema: 'evidence-desk.attribution/1', repo: input.repo, branch, workspace_path: prefix, checked_at: now(), roster_commit: snap.commit, rows };
  writeVersioned(root, rel, JSON.stringify(record, null, 2) + '\n', readVersioned(root, rel)?.version ?? null);
  // The check's rows are kept as a file for the audit, not recorded as evidence of the acts' controls: evidence dates
  // decide when a periodic control is next due, and a daily check would make a year-old review look current.
  const csv = `evidence/files/populations/attribution-${Date.now()}.csv`;
  writeCsvFile(root, csv, rows);
  const evidence = null;
  return { record: rel, file: csv, evidence, rows };
}

// Reminders for what people owe, as issues in the workspace's own repository: one open issue per owned obligation that
// is due or overdue, assigned to the owner's GitHub account on the Open Autonomy roster when they have one, retitled when
// it becomes overdue and closed once the obligation is met; obligations no one owns share one issue. The workspace's obligations say what is owed and when; this
// only carries them to where people already work. Issue titles and bodies name the obligation, never its evidence.
async function send(method: string, path: string, body: unknown): Promise<any> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set; the reminders need a token that can write issues in the workspace repository');
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}
const LABEL = 'evidence-desk';
export async function syncReminders(root: string, input: { repo: string; asOf?: Date; within: number }): Promise<{ opened: string[]; retitled: string[]; closed: string[]; kept: number }> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repo)) throw new Error('--repo names the workspace\'s own GitHub repository as owner/name');
  const { computeObligations } = await import('./obligations.ts');
  const ws = loadWorkspace(root);
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const team = latest ? (JSON.parse(latest.text) as Snapshot).team : [];
  // What is overdue, and what falls due within the window the workspace's workflow names (--within): a review due next
  // year is not owed today.
  const horizon = new Date((input.asOf ?? new Date()).getTime() + input.within * 864e5).toISOString().slice(0, 10);
  const obligations = computeObligations(ws, input.asOf);
  const owed = obligations.filter((o) => o.state === 'overdue' || (o.state === 'due' && o.due <= horizon));
  const marker = (o: { kind: string; what: string; who: string }) => `<!-- evidence-desk:obligation ${createHash('sha256').update(`${o.kind}|${o.what}|${o.who}`).digest('hex').slice(0, 16)} -->`;
  // Only an overdue item carries its date: one never done is due as of each day, and a daily date would retitle it daily.
  const title = (o: (typeof owed)[number]) => `${o.state === 'overdue' ? `Overdue since ${o.due}` : 'Due'}: ${o.what} (${o.who})`;
  const open = (await all<{ number: number; title: string; body?: string | null }>(`/repos/${input.repo}/issues?state=open&labels=${LABEL}`)).items;
  const result = { opened: [] as string[], retitled: [] as string[], closed: [] as string[], kept: 0 };
  const unowned = owed.filter((o) => !o.who);
  const unownedMarker = marker({ kind: 'unowned', what: '', who: '' });
  const wanted = new Set([...owed.filter((o) => o.who).map(marker), ...(unowned.length ? [unownedMarker] : [])]);
  const later = new Set(obligations.filter((o) => o.state !== 'done' && o.who).map(marker));
  // Close first, so an error on a later write never leaves a met obligation's issue open.
  for (const i of open) {
    const m = /<!-- evidence-desk:obligation [0-9a-f]{16} -->/.exec(i.body ?? '')?.[0];
    // Completed when the obligation is met or gone; not planned when it is still owed but now falls outside the window.
    if (m && !wanted.has(m)) { await send('PATCH', `/repos/${input.repo}/issues/${i.number}`, { state: 'closed', state_reason: later.has(m) ? 'not_planned' : 'completed' }); result.closed.push(i.title); }
  }
  const upsert = async (m: string, t: string, body: string, login?: string) => {
    const existing = open.find((i) => (i.body ?? '').includes(m));
    if (existing) {
      if (existing.title !== t || existing.body !== body) { await send('PATCH', `/repos/${input.repo}/issues/${existing.number}`, { title: t, body }); result.retitled.push(t); } else result.kept++;
      return;
    }
    // GitHub refuses an assignee who cannot be assigned in the repository (not a collaborator): open it unassigned.
    try { await send('POST', `/repos/${input.repo}/issues`, { title: t, body, labels: [LABEL], ...(login ? { assignees: [login] } : {}) }); }
    catch (e) {
      if (!login || !/answered 422/.test((e as Error).message)) throw e;
      await send('POST', `/repos/${input.repo}/issues`, { title: t, body: body.replace(m, `${login} cannot be assigned in this repository.\n\n${m}`), labels: [LABEL] });
    }
    result.opened.push(t);
  };
  // Obligations no one owns share one issue that lists them, so a new workspace does not open one issue per control.
  if (unowned.length) await upsert(unownedMarker, `${unowned.length} obligation${unowned.length === 1 ? ' has' : 's have'} no one assigned`,
    ['Assign an owner in the workspace for each of these; each then gets its own reminder.', unowned.map((o) => `- ${o.what}${o.state === 'overdue' ? ` (overdue since ${o.due})` : ''}`).join('\n'), unownedMarker].join('\n\n'));
  for (const o of owed.filter((x) => x.who)) {
    const m = marker(o);
    const login = team.find((t) => t.id === o.who)?.github;
    const body = [`${o.what} is ${o.state === 'overdue' ? `overdue since ${o.due}` : 'due'}, owed by ${o.who}.`,
      o.controls.length ? `Controls: ${o.controls.join(', ')}.` : '', 'Record it in the workspace in a pull request of your own; this issue closes once the workspace no longer shows it owed.', m].filter(Boolean).join('\n\n');
    await upsert(m, title(o), body, login);
  }
  return result;
}
