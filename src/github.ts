// Populations and administrator lists read from GitHub's REST API with the owner's own token (GITHUB_TOKEN).
// Each result is written into the workspace with the exact requests that produced it and how completeness was
// established, then recorded as evidence. Nothing is sent to GitHub but reads.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseCsv, writeCsv } from './csv.ts';
import { CF_ADMIN_ROLES, cfAccount, cfAll, cfIsAdmin } from './cloudflare.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence, evidencing } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { memberOf, type Snapshot } from './open-autonomy.ts';
import { clockDate, now } from './clock.ts';
import { neededControls } from './targets.ts';
import { certifications } from './certifications.ts';
import { frameworkDescriptions } from './catalog.ts';

const API = 'https://api.github.com';

// Every request a collection makes, with the time GitHub answered and GitHub's own id for the request, so the firm can
// ask GitHub about any response in the raw file.
let requests: { path: string; status: number; date: string; request_id: string }[] = [];

async function get(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set; export a read-only token for the account');
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  requests.push({ path, status: r.status, date: r.headers.get('date') ?? '', request_id: r.headers.get('x-github-request-id') ?? '' });
  if (!r.ok) throw new Error(`GET ${path} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Starts a collection's request log and names whose token reads: the account the firm should expect behind every
// response.
async function provenance(): Promise<Record<string, unknown>> {
  requests = [];
  const me = await get('/user') as { login?: string };
  return { api: API, token_owner: me.login ?? '', collected_at: now(), requests };
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
const applicableOf = (root: string, ids: string[]) => { const a = neededControls(loadWorkspace(root)); return ids.filter((c) => a.has(c)); };

type Pull = { number: number; title: string; user?: { login?: string }; created_at?: string; merged_at: string | null; merged_by?: { login?: string } | null };
type Review = { user?: { login?: string }; state: string; submitted_at?: string; commit_id?: string };

// Changes that reached the default branch in the period, from the system of record: every merged pull request with its
// approvals, reconciled against every commit on the default branch in the period. A commit no merged pull request
// carries (a push straight to the branch) is a row of its own with no approval, so the population cannot hide it. The
// raw responses are kept beside the table so the derivation can be re-performed.
// The areas a change touched: the pipeline (workflow files), the organization's records (records/), documents, or code.
const areas = (paths: string[]) => [...new Set(paths.map((f) => f.startsWith('.github/workflows/') ? 'pipeline' : f.startsWith('records/') ? 'records' : /\.md$|^docs\//.test(f) ? 'docs' : 'code'))].sort().join(';');

export async function collectChanges(root: string, input: { repo: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unknown: number; notIndependent: number; direct: number }> {
  const controls = evidencing(root, 'github-changes', ['CHG-01', 'CHG-02']);
  const source = await provenance();
  const meta = await get(`/repos/${input.repo}`) as { default_branch: string };
  const branch = meta.default_branch;
  const pulls = await all<Pull & { merge_commit_sha?: string | null; base?: { ref?: string } }>(`/repos/${input.repo}/pulls?state=closed&sort=created&direction=asc`);
  const intoBranch = pulls.items.filter((p) => p.merged_at && (p.base?.ref ?? branch) === branch);
  // What each account is: a person on the project's roster, an agent account the organization declares in its systems
  // register, or neither. An approval by an agent is recorded as such, so the firm sees who reviewed what.
  const rosterSnap = readVersioned(root, 'sources/open-autonomy/latest.json');
  const rosterLogins = new Set((rosterSnap ? (JSON.parse(rosterSnap.text) as Snapshot).team.map((m) => m.github ?? '') : []).filter(Boolean).map((x) => x.toLowerCase()));
  const agentLogins = new Set((loadWorkspace(root).registers.systems?.data.rows ?? []).filter((x) => /agent/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()));
  const kindOf = (l: string) => !l ? '' : rosterLogins.has(l.toLowerCase()) ? 'person' : agentLogins.has(l.toLowerCase()) ? 'agent' : 'not on the roster';
  const merged = intoBranch.filter((p) => inPeriod(p.merged_at, input.start, input.end));
  const raw: Record<string, unknown> = { provenance: source, repository: meta, pulls: pulls.items, pull_details: {}, reviews: {}, pull_commits: {}, check_runs: {} };
  const rows: Record<string, string>[] = [];
  // Every commit any merged pull request into the branch carries, whenever it merged: a pull request merged after the
  // period can carry commits dated inside it.
  const carried = new Set<string>();
  const capped: number[] = [];
  for (const p of intoBranch.filter((x) => !merged.includes(x))) {
    const commits = (await all<{ sha: string }>(`/repos/${input.repo}/pulls/${p.number}/commits`)).items;
    (raw.pull_commits as Record<string, unknown>)[p.number] = commits;
    for (const c of commits) carried.add(c.sha);
    if (p.merge_commit_sha) carried.add(p.merge_commit_sha);
    if (commits.length >= 250) capped.push(p.number);
  }
  for (const p of merged) {
    // The list omits who merged; the pull request itself says.
    const detail = await get(`/repos/${input.repo}/pulls/${p.number}`) as Pull & { head?: { sha?: string } };
    (raw.pull_details as Record<string, unknown>)[p.number] = detail;
    const reviews = (await all<Review>(`/repos/${input.repo}/pulls/${p.number}/reviews`)).items;
    const commits = (await all<{ sha: string }>(`/repos/${input.repo}/pulls/${p.number}/commits`)).items;
    (raw.reviews as Record<string, unknown>)[p.number] = reviews; (raw.pull_commits as Record<string, unknown>)[p.number] = commits;
    // What the change touched, so the firm can sample code apart from the records the organization commits.
    const touched = (await all<{ filename: string }>(`/repos/${input.repo}/pulls/${p.number}/files`)).items.map((f) => f.filename);
    ((raw.pull_files ??= {}) as Record<string, unknown>)[p.number] = touched;
    for (const c of commits) carried.add(c.sha);
    if (p.merge_commit_sha) carried.add(p.merge_commit_sha);
    if (commits.length >= 250) capped.push(p.number);
    const approvals = reviews.filter((r) => r.state === 'APPROVED');
    const author = p.user?.login ?? '';
    const approvers = [...new Set(approvals.map((r) => r.user?.login ?? ''))];
    const independent = !approvals.length ? 'no' : !author || approvers.some((a) => !a || a === 'twin') ? 'unknown' : approvers.some((a) => a !== author) ? 'yes' : 'no';
    // An approval given before a later push approved something other than what merged.
    const head = detail.head?.sha ?? '';
    const onFinal = !approvals.length ? '' : !head ? 'unknown' : approvals.some((r) => r.commit_id === head && r.user?.login !== author) ? 'yes' : 'no';
    const approvedAt = approvals.map((r) => r.submitted_at ?? '').sort().at(-1) ?? '';
    // The checks that ran on the commit that merged: what verified the change before it reached the branch.
    const runs = head ? ((await get(`/repos/${input.repo}/commits/${head}/check-runs`)) as { check_runs?: { name: string; status: string; conclusion: string | null }[] }).check_runs ?? [] : [];
    (raw.check_runs as Record<string, unknown>)[p.number] = runs;
    const checks = runs.map((c) => `${c.name}:${c.status === 'completed' ? c.conclusion : c.status}`).join(';');
    const checksPassed = !runs.length ? 'none' : runs.every((c) => c.status === 'completed' && ['success', 'neutral', 'skipped'].includes(c.conclusion ?? '')) ? 'yes' : 'no';
    rows.push({ kind: 'pull request', number: String(p.number), commit: p.merge_commit_sha ?? '', title: p.title, author, opened_at: detail.created_at ?? '', approved_at: approvedAt, merged_at: p.merged_at ?? '', merged_by: detail.merged_by?.login ?? '',
      approvals: String(approvals.length), approvers: approvers.join(';'), author_kind: kindOf(author), approver_kinds: approvers.map(kindOf).join(';'), approval_on_merged_head: onFinal, checks, checks_passed: checksPassed, independent_approval: independent, touches: areas(touched), files: String(touched.length) });
  }
  const onBranch = (await all<{ sha: string; commit?: { message?: string; author?: { name?: string; date?: string }; committer?: { date?: string } }; author?: { login?: string } | null }>(
    `/repos/${input.repo}/commits?sha=${encodeURIComponent(branch)}&since=${input.start}T00:00:00Z&until=${input.end}T23:59:59Z`)).items;
  raw.branch_commits = onBranch;
  // A commit no listed pull request carries is asked about once more: GitHub associates rebased and squashed commits with
  // the pull request that produced them. Only a commit with no merged pull request into the branch is a direct push.
  const lookups: Record<string, unknown> = {};
  raw.commit_pulls = lookups;
  const unmatched: typeof onBranch = [];
  for (const c of onBranch.filter((x) => !carried.has(x.sha))) {
    const found = await get(`/repos/${input.repo}/commits/${c.sha}/pulls`) as { merged_at: string | null; base?: { ref?: string } }[];
    lookups[c.sha] = found;
    if (!found.some((p) => p.merged_at && (p.base?.ref ?? branch) === branch)) unmatched.push(c);
  }
  for (const c of unmatched) {
    rows.push({ kind: 'direct push', number: '', commit: c.sha, title: (c.commit?.message ?? '').split('\n')[0], author: c.author?.login ?? c.commit?.author?.name ?? '', opened_at: '', approved_at: '', merged_at: c.commit?.committer?.date ?? '', merged_by: '', approvals: '0', approvers: '', author_kind: kindOf(c.author?.login ?? ''), approver_kinds: '', approval_on_merged_head: '', checks: '', checks_passed: '', independent_approval: 'no', touches: '', files: '' });
  }
  const stem = `evidence/files/populations/github-changes-${input.repo.replace('/', '-')}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['kind', 'number', 'commit', 'title', 'author', 'opened_at', 'approved_at', 'merged_at', 'merged_by', 'approvals', 'approvers', 'author_kind', 'approver_kinds', 'approval_on_merged_head', 'checks', 'checks_passed', 'independent_approval', 'touches', 'files'], rows }), null);
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify(raw, null, 2) + '\n', null);
  const query = `GET /repos/${input.repo}/pulls?state=closed (all ${pulls.pages} page(s)), keeping those merged into ${branch} ${input.start}..${input.end}; GET /repos/${input.repo}/pulls/{n}, /reviews, /commits and /files for each, and /commits/{head}/check-runs for the commit that merged; GET /repos/${input.repo}/commits?sha=${branch}&since&until for the period, reconciling every commit against every merged pull request into ${branch} and, for any left, GET /repos/${input.repo}/commits/{sha}/pulls`;
  const unknown = rows.filter((r) => r.independent_approval === 'unknown').length;
  const notIndependent = rows.filter((r) => r.independent_approval === 'no').length;
  const direct = rows.filter((r) => r.kind === 'direct push').length;
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} changes to ${input.repo}'s ${branch}, ${input.start} to ${input.end}`, controls: controls, files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'github', query },
    notes: `Complete: every page of closed pull requests and of the branch's commits in the period was read, and every commit is either carried by a merged pull request or listed as a direct push (${direct})${capped.length ? `; GitHub lists at most 250 commits of a pull request, and #${capped.join(', #')} reached that cap, so their later commits were matched through the per-commit lookup` : ''}. ${notIndependent} reached the branch without an approval from someone other than the author; independence could not be established for ${unknown}; ${rows.filter((r) => r.approval_on_merged_head === 'no').length} were approved only on an earlier commit than the one merged. Raw responses, with GitHub's request id and answer time for each and the account whose token read them (${source.token_owner}): ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length, unknown, notIndependent, direct };
}

type Deployment = { id: number; ref: string; sha: string; environment: string; created_at: string; creator?: { login?: string } };
type Status = { state: string; created_at: string; creator?: { login?: string }; log_url?: string; target_url?: string };
type Approval = { state: string; user?: { login?: string }; environments?: { name?: string }[] };

// Production deployments with the gate that let each through: a deployment made by an Actions run links to it from
// its statuses, and the run's approvals are the environment's required reviewers acting. An approval by someone other
// than the person who started the run is independent.
export async function collectDeployments(root: string, input: { repo: string; environment: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unapproved: number }> {
  const controls = evidencing(root, 'github-deployments', ['CHG-03']);
  const source = await provenance();
  // Who may act at the two production seams an Open Autonomy project declares: starting a deploy and approving the
  // environment. Each is a scope on the roster; a person acting without it acted outside the declared design.
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const snap = latest ? JSON.parse(latest.text) as Snapshot : null;
  const holders = (seamId: string): Set<string> | null => {
    const seam = snap?.seams?.find((x) => x.id === seamId);
    return seam ? new Set(snap!.team.filter((m) => m.scopes.includes(seam.scope) && m.github).map((m) => m.github!.toLowerCase())) : null;
  };
  const deployers = holders('production-deploy'), releasers = holders('release-approval');
  const holds = (set: Set<string> | null, logins: string[]) => !set || !logins.length ? '' : logins.every((l) => set.has(l.toLowerCase())) ? 'yes' : 'no';
  const deps = await all<Deployment>(`/repos/${input.repo}/deployments?environment=${encodeURIComponent(input.environment)}`);
  const rows: Record<string, string>[] = [];
  // The gate as configured when read: the environment's protection rules (required reviewers, branch and tag policy) and
  // the repository's tag rulesets, beside the deployments they gated.
  const environment = await get(`/repos/${input.repo}/environments/${encodeURIComponent(input.environment)}`).catch((e: Error) => ({ unavailable: e.message.slice(0, 120) }));
  const rulesets = await (get(`/repos/${input.repo}/rulesets`) as Promise<{ id: number; target?: string }[]>).catch(() => []);
  const tagRulesets = await Promise.all(rulesets.filter((r) => r.target === 'tag').map((r) => get(`/repos/${input.repo}/rulesets/${r.id}`)));
  const raw: Record<string, unknown> = { provenance: source, environment, tag_rulesets: tagRulesets, deployments: deps.items, statuses: {}, runs: {}, approvals: {} };
  // The trigger the project declares for production (a deploy-v* tag, pushed or dispatched from) against how each run
  // actually started, and
  // whether any active tag ruleset restricts who may create such a tag.
  const declared = snap?.rules.production_deploy?.tag_trigger ?? null;
  const glob = (pat: string, x: string) => new RegExp(`^${pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(x);
  const tagRule = !declared ? '' : (tagRulesets as { enforcement?: string; conditions?: { ref_name?: { include?: string[] } } }[]).some((r) => r.enforcement === 'active' && (r.conditions?.ref_name?.include ?? []).some((p) => p === '~ALL' || glob(p.replace(/^refs\/tags\//, ''), declared) || p.replace(/^refs\/tags\//, '') === declared)) ? 'configured' : 'not configured';
  for (const d of deps.items.filter((x) => inPeriod(x.created_at, input.start, input.end))) {
    const statuses = (await all<Status>(`/repos/${input.repo}/deployments/${d.id}/statuses`)).items;
    (raw.statuses as Record<string, unknown>)[d.id] = statuses;
    const last = statuses[0];
    const runID = statuses.map((x) => /\/actions\/runs\/(\d+)/.exec(x.log_url ?? x.target_url ?? '')?.[1]).find(Boolean) ?? '';
    let startedBy = '', approvedBy = '', runFound = false, runSha = '', runEvent = '', runConclusion = '';
    if (runID) {
      // A run deleted or past retention is not an error for the population: its approval is unknown.
      type RunDoc = { actor?: { login?: string } | null; triggering_actor?: { login?: string } | null; head_sha?: string; event?: string; status?: string; conclusion?: string | null };
      const run = await (get(`/repos/${input.repo}/actions/runs/${runID}`) as Promise<RunDoc>).catch((e: Error): RunDoc | null => { if (/answered 404/.test(e.message)) return null; throw e; });
      if (run) {
        runFound = true;
        (raw.runs as Record<string, unknown>)[runID] = run;
        startedBy = [...new Set([run.actor?.login, run.triggering_actor?.login].filter(Boolean))].join(';');
        runSha = run.head_sha ?? ''; runEvent = run.event ?? ''; runConclusion = run.status === 'completed' ? run.conclusion ?? '' : run.status ?? '';
        const approvals = await get(`/repos/${input.repo}/actions/runs/${runID}/approvals`) as Approval[];
        (raw.approvals as Record<string, unknown>)[runID] = approvals;
        approvedBy = [...new Set(approvals.filter((a) => a.state === 'approved' && (a.environments ?? []).some((e) => e.name === input.environment)).map((a) => a.user?.login ?? ''))].join(';');
      }
    }
    const approvers = approvedBy ? approvedBy.split(';') : [];
    const starters = startedBy ? startedBy.split(';') : [];
    // Independent when someone other than whoever started or re-ran the run approved it, and the run approved is the one
    // that built the commit deployed: an approval of a run on another commit does not cover this deployment.
    const shaMatch = !runFound ? '' : runSha === d.sha ? 'yes' : 'no';
    const independent = !runFound ? 'unknown' : !approvers.length || shaMatch === 'no' ? 'no' : !starters.length || approvers.some((a) => !a) ? 'unknown' : approvers.some((a) => !starters.includes(a)) ? 'yes' : 'no';
    rows.push({ id: String(d.id), ref: d.ref, sha: d.sha, created_at: d.created_at, creator: d.creator?.login ?? '', final_state: last?.state ?? 'none', final_at: last?.created_at ?? '',
      run: runID, run_event: runEvent, trigger_as_declared: !declared || !runFound ? '' : (runEvent === 'push' || runEvent === 'workflow_dispatch') && glob(declared, d.ref) ? 'yes' : 'no', declared_tag_rule: tagRule, run_commit: runSha, commit_match: shaMatch, run_conclusion: runConclusion, started_by: startedBy, starter_holds_seam: holds(deployers, starters), approved_by: approvedBy, approver_holds_seam: holds(releasers, approvers), independent_approval: independent });
  }
  const stem = `evidence/files/populations/github-deployments-${input.repo.replace('/', '-')}-${input.environment}-${input.start}-${input.end}-${Date.now()}`;
  const rel = `${stem}.csv`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify(raw, null, 2) + '\n', null);
  writeVersioned(root, rel, writeCsv({ columns: ['id', 'ref', 'sha', 'created_at', 'creator', 'final_state', 'final_at', 'run', 'run_event', 'trigger_as_declared', 'declared_tag_rule', 'run_commit', 'commit_match', 'run_conclusion', 'started_by', 'starter_holds_seam', 'approved_by', 'approver_holds_seam', 'independent_approval'], rows }), null);
  const unapproved = rows.filter((r) => r.independent_approval !== 'yes').length;
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} deployments of ${input.repo} to ${input.environment}, ${input.start} to ${input.end}`, controls: controls, files: [rel, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'github', query: `GET /repos/${input.repo}/deployments?environment=${input.environment} (all ${deps.pages} page(s)); GET /repos/${input.repo}/deployments/{id}/statuses for each; GET /repos/${input.repo}/actions/runs/{run} and /approvals for the run each status links; GET /repos/${input.repo}/environments/${input.environment} and its tag rulesets` },
    notes: `Complete: every page of deployments to the environment was read. ${unapproved} without an independent approval of the ${input.environment} environment (no linked run, no approval, a run on another commit than the one deployed, or approved only by the person who started it); ${rows.filter((r) => r.run && r.run_conclusion !== 'success').length} whose run did not conclude successfully${snap ? `; against ${snap.account}'s declared seams at ${snap.commit.slice(0, 12)} (production-deploy started by members holding its scope, release-approval given by members holding its), ${rows.filter((r) => r.starter_holds_seam === 'no').length} started and ${rows.filter((r) => r.approver_holds_seam === 'no').length} approved by someone without the scope` : ''}. Raw responses, with GitHub's request id and answer time for each and the account whose token read them (${source.token_owner}): ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length, unapproved };
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
  } else if (acct.vendor === 'cloudflare') {
    const queries: string[] = [];
    const account = await cfAccount(acct.account, queries);
    admins = (await cfAll(`/accounts/${account.id}/members`, queries)).filter(cfIsAdmin).map((m) => String(m.user?.email ?? m.email));
    query = `${queries.join('; ')} (all pages), keeping members with ${CF_ADMIN_ROLES.join(' or ')}`;
  } else throw new Error(`${acct.vendor} administrators cannot be read automatically yet; export the list and pass --file`);
  const known = new Set(snap.team.flatMap((m) => [m.github, m.discord, m.id].filter(Boolean).map((x) => String(x).toLowerCase())));
  const emails = new Set((loadWorkspace(root).registers.people?.data.rows ?? []).filter((p, _, all) => !!memberOf(snap.team, p.id, all.map((x) => x.id))).map((p) => p.email.toLowerCase()).filter(Boolean));
  const outside = admins.filter((a) => !known.has(a.toLowerCase()) && !emails.has(a.toLowerCase()));
  const id = `${acct.id}-${clockDate().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const rel = `sources/open-autonomy/completeness/${id}.json`;
  const rec = { schema: 'evidence-desk.completeness/1', id, account: acct.account, vendor: acct.vendor, checked_at: now(), query, commit: snap.commit, admins, outside };
  writeVersioned(root, rel, JSON.stringify(rec, null, 2) + '\n', null);
  // The check stands on its own record; it is evidence only where AC-04 is in play.
  if (!outside.length && applicableOf(root, ['AC-04']).length) addEvidence(root, {
    title: `Every administrator of ${acct.vendor} ${acct.account} is on the roster`, controls: applicableOf(root, ['AC-04']), files: [rel], recorded_by: input.by,
    source: { kind: 'collector', name: acct.vendor, query },
  });
  return { record: rel, outside };
}

// Whether each act a person signs in the workspace was signed by that person on GitHub (docs/decisions/0003): the
// workspace is a Git repository on GitHub, and an act reaches its default branch through a pull request that either the
// person's GitHub account approved at the exact commit merged (the pull request Evidence Desk prepares for their
// signature, signatures.ts), or that the person opened themselves. An act is part of a file: a form response (the whole
// file), an access review's sign-off, a policy's latest approval, an incident's closing review. The commit on the
// default branch that brought the act to its present content must come from a pull request merged into that branch,
// signed in one of those two ways by the person's GitHub account on the Open Autonomy roster, and the working file must
// hold the act as merged. Residual, for a pull request the person opened: a collaborator who pushes to its branch is not
// told apart from them; an approval binds the exact commit, so it has no such residual.
export type Act = { key: string; kind: 'response' | 'access-review' | 'policy-approval' | 'incident-closure' | 'risk-decision' | 'vendor-review' | 'attestation'; file: string; person: string; label: string; extract: (record: any) => unknown; personAt?: (record: any) => string };
// A file as an act reads it: JSON records parsed, CSV registers as their rows; unreadable is null.
export const UNREADABLE = Symbol('unreadable');
export const readAct = (file: string, text: string | null | undefined): unknown => {
  if (text == null) return null;
  try { return file.endsWith('.csv') ? parseCsv(text, file).rows : JSON.parse(text); } catch { return UNREADABLE; }
};
const rowOf = (rows: any, id: string) => (Array.isArray(rows) ? rows.find((r: any) => r.id === id) : undefined);
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
  // Register rows a person decides: a risk's treatment and a vendor's review. The act is the decision alone (a re-score
  // or a new owner is not a new decision), and the person who made it is the row's owner as the row stood when the
  // decision was made, so reassigning the row later neither takes the decision over nor asks the new owner to remake it.
  for (const r of ws.registers.risks?.data.rows ?? []) if (r.treatment && r.treatment !== 'undecided') acts.push({ key: `risk-decision:${r.id}`, kind: 'risk-decision', file: 'registers/risks.csv', person: r.owner ?? '', label: `treatment of risk ${r.id} (${r.title})`,
    extract: (rows) => { const x = rowOf(rows, r.id); return x && x.treatment && x.treatment !== 'undecided' ? { risk: r.id, treatment: x.treatment } : null; }, personAt: (rows) => rowOf(rows, r.id)?.owner ?? '' });
  for (const v of ws.registers.vendors?.data.rows ?? []) if (v.last_review) acts.push({ key: `vendor-review:${v.id}`, kind: 'vendor-review', file: 'registers/vendors.csv', person: v.owner ?? '', label: `review of vendor ${v.id} on ${v.last_review}`,
    extract: (rows) => { const x = rowOf(rows, v.id); return x?.last_review ? { vendor: v.id, last_review: x.last_review } : null; }, personAt: (rows) => rowOf(rows, v.id)?.owner ?? '' });
  // A self-attestation Evidence Desk rendered (it names its target): the act of the person it records as signing, bound to
  // the document by its hash.
  for (const c of certifications(root)) if (c.kind === 'self-attestation' && c.target && frameworkDescriptions.find((f) => f.id === c.target)?.outcome === 'self-attestation') acts.push({ key: `attestation:${c.id}`, kind: 'attestation', file: `certifications/${c.id}.json`, person: c.recorded_by,
    label: `${c.framework} self-attestation of ${c.issued_on}`, extract: (x) => x?.sha256 ? { target: x.target, issued_on: x.issued_on, recorded_by: x.recorded_by, sha256: x.sha256 } : null });
  return acts;
}
export type AttributionStatus = 'verified' | 'names no one' | 'no GitHub account on the roster' | 'not on the default branch' | 'changed since merged'
  | 'not on GitHub' | 'no merged pull request' | 'recorded by someone else' | 'history unreadable';
// \`via\` says how a verified act was signed: \`approved\` (the person approved the pull request at its merged head; \`signed_at\`
// is when) or \`opened\` (the person opened it). A record's own date is when the act was prepared, which can be earlier.
export type Attribution = { key: string; kind: Act['kind']; file: string; person: string; label: string; value_sha256: string; commit: string; committed_at: string; pull: string; author: string; expected: string; via: '' | 'approved' | 'opened'; signed_at: string; status: AttributionStatus };
export const actDigest = (v: unknown) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex');
const writeCsvFile = (root: string, rel: string, rows: Attribution[]) => writeVersioned(root, rel, writeCsv({ columns: ['key', 'kind', 'file', 'person', 'label', 'value_sha256', 'commit', 'committed_at', 'pull', 'author', 'expected', 'via', 'signed_at', 'status'], rows }), null);
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
  const at = (commit: string, file: string): unknown => { try { return readAct(file, execFileSync('git', ['-C', root, 'show', `${commit}:${prefix}${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); } catch { return null; } };
  type Merged = Pull & { base?: { ref?: string }; head?: { sha?: string } };
  const pullsOf = async (sha: string): Promise<Merged[] | null> => {
    try { return await get(`/repos/${input.repo}/commits/${sha}/pulls`) as Merged[]; }
    catch (e) { if (/answered (404|422)/.test((e as Error).message)) return null; throw e; }
  };
  const rows: Attribution[] = [];
  const peopleIds = (loadWorkspace(root).registers.people?.data.rows ?? []).map((r) => r.id);
  for (const act of signedActs(root)) {
    const now = readAct(act.file, readVersioned(root, act.file)?.text);
    const current = now === UNREADABLE ? null : act.extract(now);
    const row: Attribution = { key: act.key, kind: act.kind, file: act.file, person: act.person, label: act.label, value_sha256: actDigest(current), commit: '', committed_at: '', pull: '', author: '', expected: '', via: '', signed_at: '', status: 'verified' };
    rows.push(row);
    const holds = (c: string): boolean | undefined => { const v = at(c, act.file); return v === UNREADABLE ? undefined : actDigest(act.extract(v)) === row.value_sha256; };
    // The default branch's own line (first parents), newest first: the act was introduced by the newest commit whose
    // first parent did not hold it. A merge commit maps to the pull request it merged; a pull request's branch commits
    // are never walked, so another pull request touching the same file cannot be mistaken for the act's. A version of
    // the file that cannot be read ends the walk: whether it held the act is unknown, so nothing is concluded past it.
    const commits = git('log', '--first-parent', '--no-renames', '--format=%H', ref, '--', act.file).split('\n').filter(Boolean);
    const tip = at(ref, act.file);
    if (!commits.length || tip === null || (tip !== UNREADABLE && actDigest(act.extract(tip)) === actDigest(null))) { row.status = 'not on the default branch'; continue; }
    if (holds(ref) === undefined) { row.status = 'history unreadable'; continue; }
    if (!holds(ref)) { row.status = 'changed since merged'; continue; }
    let intro = '', unreadable = false;
    for (const c of commits) {
      const here = holds(c);
      if (here === undefined) { unreadable = true; break; }
      if (!here) break;
      intro = c;
      const before = holds(`${c}^1`);
      if (before === undefined) { unreadable = true; break; }
      if (!before) break;
    }
    if (unreadable) { row.status = 'history unreadable'; continue; }
    row.commit = intro; row.committed_at = git('show', '-s', '--format=%cI', intro);
    // Who the act names: for a register row, its owner as the row stood at the commit that made the decision.
    if (act.personAt) { const v = at(intro, act.file); row.person = v === UNREADABLE ? '' : act.personAt(v); }
    row.expected = memberOf(snap.team, row.person, peopleIds)?.github ?? '';
    if (!row.person) { row.status = 'names no one'; continue; }
    if (!row.expected) { row.status = 'no GitHub account on the roster'; continue; }
    const found = await pullsOf(intro);
    if (!found) { row.status = 'not on GitHub'; continue; }
    const into = found.filter((p) => p.merged_at && p.base?.ref === branch);
    if (!into.length) { row.status = 'no merged pull request'; continue; }
    const is = (login: string | undefined) => (login ?? '').toLowerCase() === row.expected.toLowerCase();
    // The person's signature on a pull request: their latest verdict on it (an approval, a request for changes, or a
    // dismissed review) is an approval of the head commit that was merged.
    // An approval signs the act as it stood at the head approved: the act merged must be that one, not a merge of it
    // with another change to the same record.
    const approvedBy = async (p: Merged) => {
      if (!p.head?.sha || holds(p.head.sha) !== true) return null;
      const verdicts = (await all<Review>(`/repos/${input.repo}/pulls/${p.number}/reviews`)).items.filter((r) => is(r.user?.login) && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state));
      const last = verdicts.at(-1);
      return !!last && last.state === 'APPROVED' && !!p.head?.sha && last.commit_id === p.head.sha ? last.submitted_at ?? '' : null;
    };
    let pr: Merged | undefined;
    for (const p of into) { const at = await approvedBy(p); if (at !== null) { pr = p; row.via = 'approved'; row.signed_at = at; break; } }
    if (!pr) { pr = into.find((p) => is(p.user?.login)); if (pr) row.via = 'opened'; }
    pr ??= into[0];
    row.pull = String(pr.number); row.author = pr.user?.login ?? '';
    if (!row.via) row.status = 'recorded by someone else';
  }
  const rel = 'sources/github/attribution.json';
  const record = { schema: 'evidence-desk.attribution/1', repo: input.repo, branch, workspace_path: prefix, checked_at: now(), roster_commit: snap.commit,
    hashing: 'value_sha256 is the SHA-256 of JSON.stringify of the act as extracted from its file: a form response is the whole parsed file; an access review {status, signed_off_at, accounts}; a policy approval its version entry; an incident closure {status, review, closed_at, closed_by}; a risk decision {risk, treatment}; a vendor review {vendor, last_review}; an attestation {target, issued_on, recorded_by, sha256}',
    rows };
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
  const horizon = new Date((input.asOf ?? clockDate()).getTime() + input.within * 864e5).toISOString().slice(0, 10);
  const obligations = computeObligations(ws, input.asOf);
  const owed = obligations.filter((o) => o.state === 'overdue' || (o.state === 'due' && o.due <= horizon));
  const marker = (o: { kind: string; what: string; who: string }) => `<!-- evidence-desk:obligation ${createHash('sha256').update(`${o.kind}|${o.what}|${o.who}`).digest('hex').slice(0, 16)} -->`;
  // Only an overdue item carries its date: one never done is due as of each day, and a daily date would retitle it daily.
  const title = (o: (typeof owed)[number]) => `${o.state === 'overdue' ? `Overdue since ${o.due}` : 'Due'}: ${o.what} (${o.who})`;
  // Every open issue, not only labelled ones: an issue someone unlabelled still carries its marker and must not be doubled.
  const open = (await all<{ number: number; title: string; body?: string | null; pull_request?: unknown }>(`/repos/${input.repo}/issues?state=open`)).items.filter((i) => !i.pull_request && /<!-- evidence-desk:obligation [0-9a-f]{16} -->/.test(i.body ?? ''));
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
    const login = memberOf(team, o.who, (ws.registers.people?.data.rows ?? []).map((r) => r.id))?.github;
    const body = [`${o.what} is ${o.state === 'overdue' ? `overdue since ${o.due}` : 'due'}, owed by ${o.who}.`,
      o.controls.length ? `Controls: ${o.controls.join(', ')}.` : '', 'Record it in the workspace in a pull request of your own; this issue closes once the workspace no longer shows it owed.', m].filter(Boolean).join('\n\n');
    await upsert(m, title(o), body, login);
  }
  return result;
}

// Who changed the default branch's rules in the period, from each ruleset's version history: every version written in
// the period with its author (GitHub names the actor by account id; the account names the login) and what changed from
// the version before. A version that lets more people bypass, drops a required review or protection, or stops enforcing
// weakens the rules. A change by an account not on the roster is marked.
export async function collectRuleChanges(root: string, input: { repo: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; weakening: number }> {
  const controls = evidencing(root, 'github-rule-changes', ['CHG-01', 'OPS-04']);
  const source = await provenance();
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const roster = new Set((latest ? (JSON.parse(latest.text) as Snapshot).team.map((m) => m.github ?? '') : []).filter(Boolean).map((x) => x.toLowerCase()));
  type Version = { version_id: number; actor?: { id?: number | null; type?: string }; updated_at: string };
  type State = { name?: string; enforcement?: string; bypass_actors?: { actor_type?: string; actor_id?: number | null; bypass_mode?: string }[]; rules?: { type: string; parameters?: { required_approving_review_count?: number } }[] };
  const rulesets = await get(`/repos/${input.repo}/rulesets`) as { id: number; name: string }[];
  const raw: Record<string, unknown> = { provenance: source, rulesets, history: {}, versions: {}, actors: {} };
  const names = new Map<number, string>();
  const login = async (id: number | null | undefined) => {
    if (id == null) return '';
    if (!names.has(id)) { const u = await (get(`/user/${id}`) as Promise<{ login?: string }>).catch(() => ({ login: '' })); names.set(id, u.login ?? ''); (raw.actors as Record<string, unknown>)[id] = u; }
    return names.get(id)!;
  };
  const describe = (s: State | null) => ({ enforcement: s?.enforcement ?? '', bypass: (s?.bypass_actors ?? []).filter((b) => (b.bypass_mode ?? 'always') === 'always').map((b) => `${b.actor_type}${b.actor_id != null ? ` ${b.actor_id}` : ''}`).sort(),
    review: Math.max(0, ...(s?.rules ?? []).filter((r) => r.type === 'pull_request').map((r) => r.parameters?.required_approving_review_count ?? 0)), protections: (s?.rules ?? []).map((r) => r.type).filter((t) => t !== 'pull_request').sort() });
  const rows: Record<string, string>[] = [];
  for (const rs of rulesets) {
    const history = (await all<Version>(`/repos/${input.repo}/rulesets/${rs.id}/history`)).items.sort((a, b) => a.version_id - b.version_id);
    (raw.history as Record<string, unknown>)[rs.id] = history;
    let before: ReturnType<typeof describe> | null = null;
    for (const v of history) {
      const full = await get(`/repos/${input.repo}/rulesets/${rs.id}/history/${v.version_id}`) as Version & { state: State };
      (raw.versions as Record<string, unknown>)[`${rs.id}:${v.version_id}`] = full;
      const now = describe(full.state);
      if (inPeriod(v.updated_at, input.start, input.end)) {
        const changes: string[] = [];
        if (!before) changes.push('created');
        else {
          if (before.enforcement !== now.enforcement) changes.push(`enforcement ${before.enforcement} → ${now.enforcement}`);
          if (before.bypass.join(',') !== now.bypass.join(',')) changes.push(`always-bypass ${before.bypass.join(', ') || 'none'} → ${now.bypass.join(', ') || 'none'}`);
          if (before.review !== now.review) changes.push(`required approvals ${before.review} → ${now.review}`);
          if (before.protections.join(',') !== now.protections.join(',')) changes.push(`protections ${before.protections.join(', ') || 'none'} → ${now.protections.join(', ') || 'none'}`);
        }
        const weakens = !!before && ((before.enforcement === 'active' && now.enforcement !== 'active') || now.bypass.some((b) => !before!.bypass.includes(b)) || now.review < before.review || before.protections.some((p) => !now.protections.includes(p)));
        const who = await login(v.actor?.id);
        rows.push({ ruleset: rs.name, ruleset_id: String(rs.id), version: String(v.version_id), at: v.updated_at, actor: who, actor_on_roster: !who ? 'unknown' : roster.has(who.toLowerCase()) ? 'yes' : 'no', change: changes.join('; ') || 'no rule change', weakens: weakens ? 'yes' : 'no' });
      }
      before = now;
    }
  }
  const stem = `evidence/files/populations/github-rule-changes-${input.repo.replace('/', '-')}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify(raw, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['ruleset', 'ruleset_id', 'version', 'at', 'actor', 'actor_on_roster', 'change', 'weakens'], rows }), null);
  const weakening = rows.filter((r) => r.weakens === 'yes').length;
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} changes to ${input.repo}'s rulesets, ${input.start} to ${input.end}`, controls: controls, files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'github', query: `GET /repos/${input.repo}/rulesets; for each, GET .../rulesets/{id}/history (all pages) and .../history/{version_id}; GET /user/{account_id} for each author` },
    notes: `Complete: every version of every ruleset the repository has, from GitHub's own history; ${weakening} weakened the rules (more people may always bypass, fewer approvals, a protection dropped, or no longer enforced). Raw responses (${source.token_owner}'s token): ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length, weakening };
}

// The non-human identities with access to production, as GitHub and the project's declarations list them now: deploy
// keys, repository and environment secrets (with when each was last set), the organization's app installations, and
// the Open Autonomy project's agents with their models. The subjects an access review of machines covers.
export async function collectNonHumanAccess(root: string, input: { repo: string; org: string; environment: string; by: string }): Promise<{ evidence: string; rows: number }> {
  const controls = evidencing(root, 'nonhuman-access', ['AC-03', 'AC-05']);
  const source = await provenance();
  const raw: Record<string, unknown> = { provenance: source };
  const tryGet = async (path: string) => { try { return await get(path); } catch (e) { return { unavailable: (e as Error).message.slice(0, 160) }; } };
  const rows: Record<string, string>[] = [];
  const keys = await tryGet(`/repos/${input.repo}/keys`) as any; raw.deploy_keys = keys;
  if (Array.isArray(keys)) for (const k of keys) rows.push({ kind: 'deploy key', name: String(k.title ?? k.id), scope: input.repo, access: k.read_only ? 'read' : 'write', created_at: String(k.created_at ?? ''), last_set: '', detail: '' });
  const secrets = await tryGet(`/repos/${input.repo}/actions/secrets`) as any; raw.repository_secrets = secrets;
  for (const s of secrets?.secrets ?? []) rows.push({ kind: 'repository secret', name: s.name, scope: input.repo, access: 'every workflow', created_at: String(s.created_at ?? ''), last_set: String(s.updated_at ?? ''), detail: '' });
  const envSecrets = await tryGet(`/repos/${input.repo}/environments/${encodeURIComponent(input.environment)}/secrets`) as any; raw.environment_secrets = envSecrets;
  for (const s of envSecrets?.secrets ?? []) rows.push({ kind: 'environment secret', name: s.name, scope: `${input.repo} ${input.environment}`, access: `jobs approved into ${input.environment}`, created_at: String(s.created_at ?? ''), last_set: String(s.updated_at ?? ''), detail: '' });
  const installs = await tryGet(`/orgs/${input.org}/installations`) as any; raw.app_installations = installs;
  for (const i of installs?.installations ?? []) rows.push({ kind: 'app installation', name: String(i.app_slug ?? i.id), scope: `${input.org} (${i.repository_selection ?? ''})`, access: Object.entries(i.permissions ?? {}).map(([k, v]) => `${k}:${v}`).join(' '), created_at: String(i.created_at ?? ''), last_set: String(i.updated_at ?? ''), detail: '' });
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  if (latest) { const snap = JSON.parse(latest.text) as Snapshot; raw.agents = snap.agents;
    for (const a of snap.agents) rows.push({ kind: 'agent', name: a.profile, scope: snap.account, access: 'the project repository through the landing workflow', created_at: '', last_set: '', detail: `models ${a.models.map((m) => `${m.provider} ${m.model}`).join(', ') || 'none'}; jobs ${a.jobs.map((j) => j.name).join(', ') || 'none'}` }); }
  const stem = `evidence/files/listings/nonhuman-access-${input.repo.replace('/', '-')}-${clockDate().toISOString().slice(0, 10)}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify(raw, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['kind', 'name', 'scope', 'access', 'created_at', 'last_set', 'detail'], rows }), null);
  const unread = ['deploy_keys', 'repository_secrets', 'environment_secrets', 'app_installations'].filter((k) => (raw[k] as { unavailable?: string })?.unavailable);
  const evidence = addEvidence(root, {
    title: `Non-human access to ${input.repo} as of ${clockDate().toISOString().slice(0, 10)}: ${rows.length} identities`, controls: controls, files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    source: { kind: 'collector', name: 'github', query: `GET /repos/${input.repo}/keys, /actions/secrets, /environments/${input.environment}/secrets; GET /orgs/${input.org}/installations; the project's agents from its declarations` },
    notes: `A listing as of its date, not a population over a period.${unread.length ? ` Not readable with the token: ${unread.join(', ')}.` : ''} Secret values are never read; last_set is when each was last written. Raw responses: ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length };
}
