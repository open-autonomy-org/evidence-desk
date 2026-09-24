// Populations and administrator lists read from GitHub's REST API with the owner's own token (GITHUB_TOKEN).
// Each result is written into the workspace with the exact requests that produced it and how completeness was
// established, then recorded as evidence. Nothing is sent to GitHub but reads.
import { execFileSync } from 'node:child_process';
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

// Whether each onboarding response was recorded by the member it names, through a seam's door (ADR 0008): the
// workspace is a Git repository on GitHub, a member records a response in a pull request of their own, and GitHub
// says who opened it. Every commit on the default branch that touched a response file must have come from a pull
// request merged into that branch and opened by the member's GitHub account on the Open Autonomy roster, and the file
// must be as merged. Residual: a collaborator who pushes to a member's open pull request branch is not told apart.
export type AttributionStatus = 'verified' | 'no GitHub account on the roster' | 'not on the default branch' | 'changed since merged'
  | 'not on GitHub' | 'no merged pull request' | 'changed by someone else';
export type Attribution = { response: string; person: string; form: string; sha256: string; commits: string; pulls: string; author: string; expected: string; status: AttributionStatus };
export async function collectOnboardingAttribution(root: string, input: { repo: string; by: string }): Promise<{ record: string; evidence: string | null; rows: Attribution[] }> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(input.repo)) throw new Error('--repo names the workspace\'s own GitHub repository as owner/name');
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  if (!latest) throw new Error('import the Open Autonomy project first (evidence-desk open-autonomy import): its roster holds each member\'s GitHub account');
  const snap = JSON.parse(latest.text) as Snapshot;
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try { git('rev-parse', '--show-toplevel'); } catch { throw new Error('the workspace is not a Git repository; responses are recorded through pull requests to it'); }
  if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('the workspace is a shallow clone; fetch its full history (git fetch --unshallow) so every change to a response can be traced');
  const branch = (await get(`/repos/${input.repo}`) as { default_branch: string }).default_branch;
  const ref = `origin/${branch}`;
  try { git('rev-parse', '--verify', '--quiet', ref); } catch { throw new Error(`${ref} is not in the workspace; fetch it (git fetch origin ${branch})`); }
  const prefix = git('rev-parse', '--show-prefix');
  const pullsOf = async (sha: string): Promise<(Pull & { base?: { ref?: string } })[] | null> => {
    try { return await get(`/repos/${input.repo}/commits/${sha}/pulls`) as (Pull & { base?: { ref?: string } })[]; }
    catch (e) { if (/answered (404|422)/.test((e as Error).message)) return null; throw e; }
  };
  const ws = loadWorkspace(root);
  const rows: Attribution[] = [];
  for (const r of ws.responses) {
    const d = r.data;
    const file = `forms/responses/${d.id}.json`;
    const expected = snap.team.find((m) => m.id === d.person)?.github ?? '';
    const row: Attribution = { response: d.id, person: d.person, form: d.form, sha256: r.version, commits: '', pulls: '', author: '', expected, status: 'verified' };
    rows.push(row);
    if (!expected) { row.status = 'no GitHub account on the roster'; continue; }
    const commits = git('log', '--no-renames', '--format=%H', ref, '--', file).split('\n').filter(Boolean);
    row.commits = commits.join(' ');
    if (!commits.length) { row.status = 'not on the default branch'; continue; }
    let merged: string;
    try { merged = execFileSync('git', ['-C', root, 'show', `${ref}:${prefix}${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { row.status = 'not on the default branch'; continue; }
    if (merged !== readVersioned(root, file)?.text) { row.status = 'changed since merged'; continue; }
    const pulls: string[] = [], authors: string[] = [];
    for (const sha of commits) {
      const found = await pullsOf(sha);
      if (!found) { row.status = 'not on GitHub'; break; }
      const into = found.filter((p) => p.merged_at && p.base?.ref === branch);
      const pr = into.find((p) => (p.user?.login ?? '').toLowerCase() === expected.toLowerCase()) ?? into[0];
      if (!pr) { row.status = 'no merged pull request'; break; }
      pulls.push(String(pr.number)); authors.push(pr.user?.login ?? '');
      if ((pr.user?.login ?? '').toLowerCase() !== expected.toLowerCase()) { row.status = 'changed by someone else'; break; }
    }
    row.pulls = [...new Set(pulls)].join(' ');
    row.author = [...new Set(authors)].join(' ');
  }
  const rel = 'sources/github/onboarding-attribution.json';
  const record = { schema: 'evidence-desk.onboarding-attribution/1', repo: input.repo, branch, workspace_path: prefix, checked_at: now(), roster_commit: snap.commit, rows };
  writeVersioned(root, rel, JSON.stringify(record, null, 2) + '\n', readVersioned(root, rel)?.version ?? null);
  const verified = rows.filter((x) => x.status === 'verified');
  const forms = new Map(ws.forms.map((f) => [f.data.id, f.data.controls]));
  const controls = applicableOf(root, [...new Set(verified.flatMap((x) => forms.get(x.form) ?? []))]);
  const csv = `evidence/files/populations/onboarding-attribution-${Date.now()}.csv`;
  writeVersioned(root, csv, writeCsv({ columns: ['response', 'person', 'form', 'sha256', 'commits', 'pulls', 'author', 'expected', 'status'], rows }), null);
  const evidence = controls.length ? addEvidence(root, {
    title: `${verified.length} of ${rows.length} onboarding responses recorded by the member's own GitHub account`, controls, files: [csv], recorded_by: input.by,
    source: { kind: 'collector', name: 'github', query: `git log --no-renames ${ref} for each forms/responses file; GET /repos/${input.repo}/commits/{sha}/pulls for every commit, requiring a pull request merged into ${branch} and opened by the member on the roster at ${snap.commit.slice(0, 12)}` },
  }) : null;
  return { record: rel, evidence, rows };
}
