// Acts done in the linked Runhuman workspace (runhuman-2 ADR 0038 §12; Open Autonomy ADR 0019). An obligation whose seam
// names a routine — a policy approval (`policy-approval`), a person's own form (`onboarding`) — is filed as a run of that
// routine, with the obligation's packet as its variables (for a policy, its exact text and hash) and its sponsor the
// person who owes it, matched to their Runhuman principal through the Volter identity on their roster entry. Acts the
// project's owner owes are held: they are filed only once the project's release is requested, and listed on its open
// Release pull request, so the owner meets them in the one contact a release already is. `collect rh2-tasks` reads each
// run's Task back and records the act — the approval, the response — only when the principal who answered is the
// roster member's and the packet is the one filed; RH2's answer is kept whole beside it as provenance.
//
// RH2_BASE_URL, RH2_SESSION_TOKEN and RH2_ORGANIZATION name the workspace: the Runhuman origin, the token of the
// automation Evidence Desk acts as there (it reads only what its runs did), and the organization its routines are in.
import { readVersioned, sha256, writeVersioned } from './files.ts';
import { loadWorkspace } from './workspace.ts';
import { computeObligations, type Obligation } from './obligations.ts';
import { approvePolicy, DRAFTING } from './actions.ts';
import { submitResponse } from './operations.ts';
import { memberOf, readSnapshot, type Snapshot } from './open-autonomy.ts';
import { clockDate, now } from './clock.ts';
import { repoName } from './github.ts';

const RUNS = 'sources/rh2/runs.json';
/** The seam each obligation's act is done at: a policy approval, or a person's own form. */
const SEAM_OF: Partial<Record<Obligation['kind'], string>> = { policy: 'policy-approval', person: 'onboarding' };
const RELEASE_READY = '<!-- open-autonomy:release-ready -->';
const OWNER_ACTS = '<!-- evidence-desk:owner-acts -->';

export type Rh2Run = {
  key: string; seam: string; routine: string; kind: Obligation['kind']; what: string; who: string; subject: string; principal: string;
  form?: string; policy?: string; packet_sha256: string; session: string; filed_at: string;
  collected?: { at: string; task: string; answered_by: string; status: 'recorded' | 'not-the-member' | 'packet-changed' | 'declined'; file: string };
};
type Runs = { schema: 'evidence-desk.rh2-runs/1'; runs: Rh2Run[] };
type Person = { principalId: string; displayName: string; identities?: { issuer: string; subject: string }[]; consolidatedInto?: string | null };

function workspace(): { base: string; token: string; org: string } {
  const base = (process.env.RH2_BASE_URL ?? '').replace(/\/$/, '');
  const token = process.env.RH2_SESSION_TOKEN ?? '';
  const org = process.env.RH2_ORGANIZATION ?? '';
  if (!base || !token || !org) throw new Error('acts in Runhuman need RH2_BASE_URL, RH2_SESSION_TOKEN (the token of the automation Evidence Desk acts as there) and RH2_ORGANIZATION in the environment');
  return { base, token, org };
}

async function rh2<T>(path: string): Promise<{ body: T }> {
  const { base, token, org } = workspace();
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}`, 'x-rh2-organization': org, accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return { body: JSON.parse(text) as T };
}

/** Starts a run of a routine through the model door and lets its stream go: the run goes on in Runhuman (the person may
 * take days), and its session is what `collect rh2-tasks` follows. */
async function startRun(model: string, sponsor: string, content: string): Promise<string> {
  const { base, token, org } = workspace();
  const res = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-rh2-organization': org, 'x-runhuman-sponsor': sponsor, 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 1024, stream: true, messages: [{ role: 'user', content }] }) });
  const session = res.headers.get('x-runhuman-session');
  if (!res.ok || !session) { const text = await res.text().catch(() => ''); throw new Error(`Runhuman answered ${res.status}${session ? '' : ' and named no session'}: ${text.slice(0, 300)}`); }
  await res.body?.cancel();
  return session;
}

function readRuns(root: string): { runs: Runs; version: string | null } {
  const r = readVersioned(root, RUNS);
  return r ? { runs: JSON.parse(r.text) as Runs, version: r.version } : { runs: { schema: 'evidence-desk.rh2-runs/1', runs: [] }, version: null };
}

async function people(): Promise<Person[]> {
  const { org } = workspace();
  return (await rh2<{ data: { people: Person[] } }>(`/api/v3/organizations/${encodeURIComponent(org)}/people`)).body.data.people;
}

/** The person a principal is: themselves, or for someone a bridge observed, whom they proved to be. */
const proven = (all: Person[], principal: string): Person | undefined => {
  const p = all.find((x) => x.principalId === principal);
  return p?.consolidatedInto ? all.find((x) => x.principalId === p.consolidatedInto) : p;
};

/** An obligation's packet: what its routine is given, and the hash of what the person is shown. */
function packet(root: string, o: Obligation, principal: string): { vars: Record<string, unknown>; sha: string } {
  const ws = loadWorkspace(root);
  if (o.policy) {
    const p = ws.policies.find((x) => x.data.id === o.policy);
    if (!p?.text) throw new Error(`policy ${o.policy} has no text`);
    const text = p.text.body.replace(DRAFTING, '');
    const sha = sha256(text);
    return { vars: { person: principal, policy: p.data.id, title: p.data.title, text, sha256: sha }, sha };
  }
  const f = ws.forms.find((x) => x.data.id === o.form);
  if (!f) throw new Error(`form ${o.form} does not exist`);
  const policies = f.data.acknowledges_policies ? ws.policies.filter((p) => p.data.versions.length).map((p) => { const v = p.data.versions.at(-1)!; return { id: p.data.id, version: v.version, sha256: v.sha256 }; }) : [];
  const vars = { person: principal, form: f.data.id, title: f.data.title, ...(f.data.intro ? { intro: f.data.intro } : {}), questions: f.data.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, ...(q.options ? { options: q.options } : {}) })), policies };
  return { vars, sha: f.version };
}

const keyOf = (o: Obligation) => `${o.kind}|${o.policy ?? o.form ?? ''}|${o.who}|${o.due}`;
const isOwner = (snap: Snapshot, who: string, ids: string[]) => !!memberOf(snap.team, who, ids)?.scopes.includes('owner');

/** The project's Release pull request when its release has been requested (PM's package posted on it), else null. */
async function requestedRelease(repo: string): Promise<{ number: number; url: string } | null> {
  repoName(repo, '--release');
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('reading the Release pull request needs GITHUB_TOKEN');
  const gh = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'evidence-desk', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(`${method} ${repo}${path} answered ${res.status}`);
    return await res.json() as T;
  };
  const [owner] = repo.split('/');
  const open = await gh<{ number: number; html_url: string }[]>(`/pulls?state=open&base=prod&head=${owner}:main`);
  if (!open[0]) return null;
  const comments = await gh<{ body?: string }[]>(`/issues/${open[0].number}/comments?per_page=100`);
  return comments.some((c) => (c.body ?? '').includes(RELEASE_READY)) ? { number: open[0].number, url: open[0].html_url } : null;
}

async function postOwnerActs(repo: string, release: number, runs: Rh2Run[]): Promise<void> {
  const token = process.env.GITHUB_TOKEN!;
  const { base } = workspace();
  const gh = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'evidence-desk', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!res.ok) throw new Error(`${method} ${repo}${path} answered ${res.status}`);
    return await res.json() as T;
  };
  const body = [`Compliance acts the owner owes, held for this release. Each waits in Runhuman (${base}/console), signed in with your Volter identity:`, '', ...runs.map((r) => `- ${r.what}`), '', OWNER_ACTS].join('\n');
  const existing = (await gh<{ id: number; body?: string }[]>(`/issues/${release}/comments?per_page=100`)).find((c) => (c.body ?? '').includes(OWNER_ACTS));
  if (existing) { if (existing.body !== body) await gh(`/issues/comments/${existing.id}`, 'PATCH', { body }); }
  else await gh(`/issues/${release}/comments`, 'POST', { body });
}

export type FileReport = { filed: string[]; held: string[]; kept: number; unlinked: string[]; release: string | null };

/** Files each owed obligation whose seam names a routine as a run of it; the owner's wait for a requested release. */
export async function fileRuns(root: string, input: { within: number; asOf?: Date; release?: string }): Promise<FileReport> {
  const snap = readSnapshot(root);
  if (!snap) throw new Error('import the Open Autonomy project first (open-autonomy import): its seams name the routines');
  const { org } = workspace();
  const routineOf = (seam: string) => { const r = snap.seams?.find((s) => s.id === seam)?.routine; return r === undefined ? undefined : r.startsWith('routine:') ? r : `routine:${org}/${r}`; };
  const ws = loadWorkspace(root);
  const ids = (ws.registers.people?.data.rows ?? []).map((r) => r.id);
  const horizon = new Date((input.asOf ?? clockDate()).getTime() + input.within * 864e5).toISOString().slice(0, 10);
  const owed = computeObligations(ws, input.asOf).filter((o) => (o.state === 'overdue' || (o.state === 'due' && o.due <= horizon)) && SEAM_OF[o.kind] && routineOf(SEAM_OF[o.kind]!) && (o.policy || o.form));
  const report: FileReport = { filed: [], held: [], kept: 0, unlinked: [], release: null };
  if (!owed.length) return report;
  const { runs, version } = readRuns(root);
  const all = await people();
  const release = input.release ? await requestedRelease(input.release) : null;
  report.release = release?.url ?? null;
  const ownerRuns: Rh2Run[] = [];
  for (const o of owed) {
    const key = keyOf(o);
    const known = runs.runs.find((r) => r.key === key);
    if (known) { report.kept++; if (isOwner(snap, o.who, ids)) ownerRuns.push(known); continue; }
    const member = memberOf(snap.team, o.who, ids);
    const person = member?.volter ? all.find((p) => !p.consolidatedInto && p.identities?.some((i) => i.subject === member.volter)) : undefined;
    if (!member?.volter || !person) { report.unlinked.push(`${o.who || '(no one)'}: ${o.what}`); continue; }
    if (isOwner(snap, o.who, ids) && !release) { report.held.push(`${o.who}: ${o.what}`); continue; }
    const seam = SEAM_OF[o.kind]!, routine = routineOf(seam)!;
    const { vars, sha } = packet(root, o, person.principalId);
    const session = await startRun(routine, person.principalId, `${o.what}\n\n\`\`\`runhuman-vars\n${JSON.stringify(vars)}\n\`\`\``).catch((e: Error) => { throw new Error(`filing ${o.what} for ${o.who}: ${e.message}`); });
    const run: Rh2Run = { key, seam, routine, kind: o.kind, what: o.what, who: o.who, subject: member.volter, principal: person.principalId, ...(o.form ? { form: o.form } : {}), ...(o.policy ? { policy: o.policy } : {}), packet_sha256: sha, session, filed_at: now() };
    runs.runs.push(run);
    report.filed.push(`${o.who}: ${o.what}`);
    if (isOwner(snap, o.who, ids)) ownerRuns.push(run);
  }
  if (report.filed.length) writeVersioned(root, RUNS, JSON.stringify(runs, null, 2) + '\n', version);
  if (release && input.release && ownerRuns.some((r) => !r.collected)) await postOwnerActs(input.release, release.number, ownerRuns.filter((r) => !r.collected));
  return report;
}

/** Whether an obligation's act runs through a routine (its seam names one): reminders leave it to its run. */
export function hasRoutine(snap: Snapshot | null, o: Obligation): boolean {
  const seam = SEAM_OF[o.kind];
  return !!seam && !!(o.policy || o.form) && !!snap?.seams?.some((s) => s.id === seam && s.routine);
}

export type CollectReport = { recorded: string[]; refused: string[]; waiting: number };

/** Each filed run's Task, read back: the act recorded when its answerer is the roster member's and its packet the one filed. */
export async function collectRh2Tasks(root: string, input: { by: string }): Promise<CollectReport> {
  const ws = loadWorkspace(root);
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === input.by)) throw new Error(`${input.by || '(none)'} is not in registers/people.csv`);
  const { runs, version } = readRuns(root);
  const report: CollectReport = { recorded: [], refused: [], waiting: 0 };
  const open = runs.runs.filter((r) => !r.collected);
  if (!open.length) return report;
  const all = await people();
  for (const run of open) {
    const observed = (await rh2<{ state: { roomId: string | null } }>(`/v1/sessions/${encodeURIComponent(run.session)}/events?after=0`)).body;
    const roomId = observed.state.roomId;
    if (!roomId) { report.waiting++; continue; }
    type Task = { taskId: string; fields?: Record<string, unknown>; answer?: { principalId: string; value: unknown } | null };
    const tasks = (await rh2<{ data: { tasks: Task[] } }>(`/api/v3/rooms/${encodeURIComponent(roomId)}/tasks`)).body.data.tasks;
    const task = tasks.find((t) => t.answer && (run.policy ? t.fields?.policy === run.policy : t.fields?.form === run.form));
    if (!task?.answer) { report.waiting++; continue; }
    const answerer = proven(all, task.answer.principalId);
    const file = `sources/rh2/answers/${run.session}.json`;
    writeVersioned(root, file, JSON.stringify({ schema: 'evidence-desk.rh2-answer/1', read_at: now(), read_by: input.by, run, room: roomId, task, answered_by: answerer ?? null }, null, 2) + '\n', readVersioned(root, file)?.version ?? null);
    const done = (status: NonNullable<Rh2Run['collected']>['status']) => { run.collected = { at: now(), task: task.taskId, answered_by: task.answer!.principalId, status, file }; };
    if (!answerer?.identities?.some((i) => i.subject === run.subject)) { done('not-the-member'); report.refused.push(`${run.who}: ${run.what}: answered by someone other than ${run.who}`); continue; }
    if (run.policy) {
      const p = loadWorkspace(root).policies.find((x) => x.data.id === run.policy);
      const rec = readVersioned(root, `policies/${run.policy}.json`);
      if (!p?.text || !rec || task.fields?.sha256 !== run.packet_sha256 || sha256(p.text.body.replace(DRAFTING, '')) !== run.packet_sha256) { done('packet-changed'); report.refused.push(`${run.who}: ${run.what}: the policy changed since it was shown`); continue; }
      if (task.answer.value !== true) { done('declined'); report.refused.push(`${run.who}: ${run.what}: declined`); continue; }
      approvePolicy(root, run.policy, run.who, p.text.version, rec.version, true);
    } else {
      const f = loadWorkspace(root).forms.find((x) => x.data.id === run.form);
      if (!f || f.version !== run.packet_sha256) { done('packet-changed'); report.refused.push(`${run.who}: ${run.what}: the form changed since it was shown`); continue; }
      submitResponse(root, { form: f.data.id, person: run.who, answers: Object.fromEntries(Object.entries((task.answer.value ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])), formVersion: f.version, identity: `runhuman ${task.answer.principalId} (Volter ${run.subject}), task ${task.taskId}` });
    }
    done('recorded');
    report.recorded.push(`${run.who}: ${run.what}`);
  }
  writeVersioned(root, RUNS, JSON.stringify(runs, null, 2) + '\n', version);
  return report;
}
