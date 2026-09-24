// Collectors and checks. A collector reads one vendor with the owner's own credentials and returns a snapshot plus
// the requests that produced it; a check evaluates a snapshot for the controls it speaks to and passes, fails, or
// reports that it could not decide. A run executes every enabled collector, writes each snapshot as evidence, and
// records every check result in checks/runs/, which is the history the gap view reads. Nothing here writes to a vendor.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { check as validate, schema } from './schema.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { cf, cfAccount, cfAll, cfAnswers, cfIsAdmin, cloudflareRoster } from './cloudflare.ts';
import { clockDate, now } from './clock.ts';

export type CollectorSettings = { id: 'github' | 'cloudflare'; enabled: boolean; params: Record<string, string> };
type Snapshot = { data: Record<string, unknown>; queries: string[]; responses?: { path: string; status: number; date: string; request_id: string }[] };
type Result = { check: string; collector: string; controls: string[]; status: 'pass' | 'fail' | 'error'; detail: string };
export type Run = { schema: string; id: string; started_at: string; finished_at: string; by: string;
  collectors: { id: string; status: 'ok' | 'error'; error?: string; snapshot?: string; evidence?: string }[]; results: Result[] };

// Who the organization says may act: its people's addresses and the service accounts its systems register declares.
// A collector that judges who acted records the roster it judged against in its snapshot.
type Roster = { people: string[]; service_accounts: string[]; since?: string };
type CheckDef = { id: string; title: string; controls: string[]; evaluate(d: Record<string, any>): { status: Result['status']; detail: string } };
type CollectorDef = { id: CollectorSettings['id']; title: string; params: { name: string; prompt: string }[]; credentials: string[]; collect(p: Record<string, string>, roster: Roster): Promise<Snapshot>; checks: CheckDef[] };

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ── GitHub ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Each GitHub answer's status, Date, x-github-request-id and body, kept in the snapshot so any reading can be re-derived
// from the vendor's own answer and raised with GitHub.
let ghAnswers: { path: string; status: number; date: string; request_id: string; body: unknown }[] = [];
async function gh(path: string, queries: string[]): Promise<{ status: number; body: any }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  queries.push(`GET ${path}`);
  const r = await fetch(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  ghAnswers.push({ path, status: r.status, date: r.headers.get('date') ?? '', request_id: r.headers.get('x-github-request-id') ?? '', body });
  return { status: r.status, body };
}
async function ghAll(path: string, queries: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, queries);
    if (r.status !== 200) throw new Error(`GET ${path} answered ${r.status}`);
    out.push(...r.body);
    if (r.body.length < 100) return out;
  }
  throw new Error(`${path} has more than 10,000 results`);
}

// A ruleset governs the default branch only if it targets branches and its ref_name condition covers the default branch:
// a tag ruleset (the kit's deploy-tags-admin-only) says nothing about main.
const onDefaultBranch = (rs: any, branch: string) => (rs.target ?? 'branch') === 'branch' && ((rs.conditions?.ref_name?.include ?? []) as string[]).some((p) => p === '~ALL' || p === '~DEFAULT_BRANCH' || p === `refs/heads/${branch}`)
  && !((rs.conditions?.ref_name?.exclude ?? []) as string[]).some((p) => p === '~DEFAULT_BRANCH' || p === `refs/heads/${branch}`);

const github: CollectorDef = {
  id: 'github', title: 'GitHub organization and repositories', credentials: ['GITHUB_TOKEN'],
  params: [{ name: 'org', prompt: 'Organization login' }, { name: 'repos', prompt: 'Repositories to check, comma-separated owner/name' }],
  async collect(p) {
    const queries: string[] = [];
    ghAnswers = [];
    if (!p.org) throw new Error('set the org parameter');
    const org = (await gh(`/orgs/${p.org}`, queries)).body;
    const admins = (await ghAll(`/orgs/${p.org}/members?role=admin`, queries)).map((m) => m.login);
    // Every member with their role, day by day: the population of access changes is the difference between days.
    const members = (await ghAll(`/orgs/${p.org}/members?role=all`, queries)).map((m) => ({ login: m.login, role: admins.includes(m.login) ? 'admin' : 'member' }));
    const repos: Record<string, unknown> = {};
    for (const repo of list(p.repos)) {
      const meta = await gh(`/repos/${repo}`, queries);
      if (meta.status !== 200) throw new Error(`GET /repos/${repo} answered ${meta.status}`);
      const branch = meta.body.default_branch ?? 'main';
      const protection = await gh(`/repos/${repo}/branches/${branch}/protection`, queries);
      const rulesets = await gh(`/repos/${repo}/rulesets`, queries);
      const rules = await Promise.all(((rulesets.status === 200 ? rulesets.body : []) as any[]).map(async (rs) => (await gh(`/repos/${repo}/rulesets/${rs.id}`, queries)).body));
      const dependabot = await gh(`/repos/${repo}/dependabot/alerts?state=open&per_page=100`, queries);
      const secrets = await gh(`/repos/${repo}/secret-scanning/alerts?state=open&per_page=100`, queries);
      // GitHub keeps rule insights for a month and filters them by a window back from now: a daily run reads the last
      // day, so consecutive runs cover every bypass of the repository's rules.
      const bypasses = await gh(`/repos/${repo}/rulesets/rule-suites?time_period=day&rule_suite_result=bypass&per_page=100`, queries);
      repos[repo] = { default_branch: branch, protection: protection.status === 200 ? protection.body : null, rulesets: rules,
        rule_bypasses: bypasses.status === 200 ? bypasses.body : { unavailable: bypasses.status },
        dependabot: dependabot.status === 200 ? dependabot.body : { unavailable: dependabot.status }, secret_scanning: secrets.status === 200 ? secrets.body : { unavailable: secrets.status } };
    }
    return { data: { org: { login: org?.login, two_factor_requirement_enabled: org?.two_factor_requirement_enabled }, admins, members, repos }, queries, responses: ghAnswers };
  },
  checks: [
    { id: 'github-org-2fa', title: 'The organization requires two-factor authentication', controls: ['AC-01'], evaluate: (d) =>
      d.org.two_factor_requirement_enabled === undefined ? { status: 'error', detail: 'GitHub did not report the two-factor requirement; the token needs organization owner read access' }
        : d.org.two_factor_requirement_enabled ? { status: 'pass', detail: 'required' } : { status: 'fail', detail: 'members may use accounts without two-factor authentication' } },
    { id: 'github-change-review', title: 'The default branch requires an approving review', controls: ['CHG-01'], evaluate: (d) => {
      const bad = Object.entries(d.repos as Record<string, any>).filter(([, r]) => {
        const classic = (r.protection?.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1;
        const ruled = (r.rulesets as any[]).some((rs) => rs.enforcement === 'active' && onDefaultBranch(rs, r.default_branch) && (rs.rules ?? []).some((x: any) => x.type === 'pull_request' && (x.parameters?.required_approving_review_count ?? 0) >= 1));
        return !classic && !ruled;
      }).map(([k]) => k);
      // A review someone may always skip is not required of them: a ruleset listing bypass actors in "always" mode fails
      // the check, naming who may bypass; "pull_request" mode (bypass only by opening a pull request) does not.
      const always = Object.entries(d.repos as Record<string, any>).flatMap(([k, r]) => (r.rulesets as any[]).filter((rs) => rs.enforcement === 'active' && onDefaultBranch(rs, r.default_branch) && (rs.rules ?? []).some((x: any) => x.type === 'pull_request'))
        .flatMap((rs) => (rs.bypass_actors ?? []).filter((b: any) => (b.bypass_mode ?? 'always') === 'always').map((b: any) => `${k} ruleset ${rs.name}: ${b.actor_type}${b.actor_id != null ? ` ${b.actor_id}` : ''}`)));
      return bad.length ? { status: 'fail', detail: `no required approving review on the default branch of ${bad.join(', ')}` }
        : always.length ? { status: 'fail', detail: `the required review can always be bypassed by ${always.join('; ')}` }
        : { status: 'pass', detail: 'every checked repository requires an approving review that no one may always bypass' };
    } },
    { id: 'github-rule-bypass', title: 'No one bypassed the default branch rules in the last day', controls: ['CHG-01'], evaluate: (d) => {
      const seen: string[] = [];
      for (const [repo, r] of Object.entries(d.repos as Record<string, any>)) {
        if (!r.rule_bypasses) continue;
        if (!Array.isArray(r.rule_bypasses)) return { status: 'error', detail: `rule insights for ${repo} are not available (${r.rule_bypasses.unavailable}); the token needs repository administration read access` };
        for (const x of r.rule_bypasses) seen.push(`${repo} ${String(x.ref).replace('refs/heads/', '')} by ${x.actor_name} at ${x.pushed_at} (rule suite ${x.id}, ${String(x.after_sha ?? '').slice(0, 12)})`);
      }
      return seen.length ? { status: 'fail', detail: `bypassed: ${seen.join('; ')}` } : { status: 'pass', detail: 'no bypass' };
    } },
    { id: 'github-history-protected', title: 'The default branch cannot be force-pushed or deleted', controls: ['CHG-03', 'OPS-04'], evaluate: (d) => {
      const bad = Object.entries(d.repos as Record<string, any>).filter(([, r]) => {
        const classic = r.protection && r.protection.allow_force_pushes?.enabled !== true && r.protection.allow_deletions?.enabled !== true;
        const ruled = (r.rulesets as any[]).some((rs) => rs.enforcement === 'active' && onDefaultBranch(rs, r.default_branch) && ['non_fast_forward', 'deletion'].every((t) => (rs.rules ?? []).some((x: any) => x.type === t)));
        return !classic && !ruled;
      }).map(([k]) => k);
      // As with review, a rule someone may always bypass does not bind them.
      const always = Object.entries(d.repos as Record<string, any>).flatMap(([k, r]) => (r.rulesets as any[]).filter((rs) => rs.enforcement === 'active' && onDefaultBranch(rs, r.default_branch) && (rs.rules ?? []).some((x: any) => x.type === 'non_fast_forward' || x.type === 'deletion'))
        .flatMap((rs) => (rs.bypass_actors ?? []).filter((b: any) => (b.bypass_mode ?? 'always') === 'always').map((b: any) => `${k} ruleset ${rs.name}: ${b.actor_type}${b.actor_id != null ? ` ${b.actor_id}` : ''}`)));
      return bad.length ? { status: 'fail', detail: `history of the default branch can be rewritten or deleted in ${bad.join(', ')}` }
        : always.length ? { status: 'fail', detail: `force-push and deletion protection can always be bypassed by ${always.join('; ')}` } : { status: 'pass', detail: 'protected, with no one who may always bypass it' };
    } },
    { id: 'github-dependabot', title: 'No critical or high dependency alert is open for more than 30 days', controls: ['CHG-05', 'MON-03'], evaluate: (d) => {
      const late: string[] = [];
      for (const [repo, r] of Object.entries(d.repos as Record<string, any>)) {
        if (!Array.isArray(r.dependabot)) return { status: 'error', detail: `dependency alerts for ${repo} are not available (${r.dependabot.unavailable}); enable Dependabot alerts or grant the token access` };
        for (const a of r.dependabot) {
          const sev = a.security_advisory?.severity ?? a.security_vulnerability?.severity ?? a.severity;
          if ((sev === 'critical' || sev === 'high') && Date.parse(a.created_at) < clockDate().getTime() - 30 * 864e5) late.push(`${repo}#${a.number} (${sev}, open since ${String(a.created_at).slice(0, 10)})`);
        }
      }
      return late.length ? { status: 'fail', detail: late.join('; ') } : { status: 'pass', detail: 'none overdue' };
    } },
    { id: 'github-secret-scanning', title: 'No secret-scanning alert is open', controls: ['AC-05'], evaluate: (d) => {
      const open: string[] = [];
      for (const [repo, r] of Object.entries(d.repos as Record<string, any>)) {
        if (!Array.isArray(r.secret_scanning)) return { status: 'error', detail: `secret scanning for ${repo} is not available (${r.secret_scanning.unavailable})` };
        for (const a of r.secret_scanning) open.push(`${repo}#${a.number} (${a.secret_type ?? 'secret'})`);
      }
      return open.length ? { status: 'fail', detail: `open: ${open.join('; ')}` } : { status: 'pass', detail: 'none open' };
    } },
  ],
};

// ── Cloudflare ─────────────────────────────────────────────────────────────────────────────────────────────────
const TLS_ORDER = ['1.0', '1.1', '1.2', '1.3'];
const cloudflare: CollectorDef = {
  id: 'cloudflare', title: 'Cloudflare account and zones', credentials: ['CLOUDFLARE_API_TOKEN'],
  params: [{ name: 'account', prompt: 'Account id or name' }, { name: 'zones', prompt: 'Zones to check, comma-separated names (all of the account\'s zones when empty)' }],
  async collect(p, roster) {
    const queries: string[] = [];
    cfAnswers.length = 0;
    if (!p.account) throw new Error('set the account parameter');
    const account = await cfAccount(p.account, queries);
    const members = (await cfAll(`/accounts/${account.id}/members`, queries)).map((m) => ({ email: m.user?.email ?? m.email, status: m.status, roles: (m.roles ?? []).map((r: any) => r.name), admin: cfIsAdmin(m), two_factor: m.user?.two_factor_authentication_enabled === true }));
    const wanted = list(p.zones);
    const zones = (await cfAll(`/zones?account.id=${account.id}`, queries)).filter((z) => !wanted.length || wanted.includes(z.name));
    const missing = wanted.filter((n) => !zones.some((z) => z.name === n));
    if (missing.length) throw new Error(`zones not found in the account: ${missing.join(', ')}`);
    const settings: Record<string, Record<string, string | null>> = {};
    for (const z of zones) {
      settings[z.name] = {};
      for (const s of ['min_tls_version', 'always_use_https']) { const r = await cf(`/zones/${z.id}/settings/${s}`, queries); settings[z.name][s] = r.status === 200 ? String(r.result?.value) : null; }
    }
    // The account's audit log for the last day: consecutive daily runs cover every change, so a change made outside the
    // change path is found the day it is made, not when the audit package is built.
    // From the last run that happened, so a day without a run leaves no gap in what is read; a first run reads a day.
    const since = roster.since ?? new Date(clockDate().getTime() - 86_400_000).toISOString();
    const changes = (await cfAll(`/accounts/${account.id}/audit_logs?since=${since}&direction=asc`, queries)).map((x) => ({ at: String(x.when ?? ''), actor: String(x.actor?.email ?? '').toLowerCase(), action: String(x.action?.type ?? ''), resource: `${x.resource?.type ?? ''} ${x.resource?.id ?? ''}`.trim() }));
    return { data: { account: { id: account.id, name: account.name, enforce_twofactor: account.settings?.enforce_twofactor === true }, members, zones: settings, changes_since: since, changes, roster }, queries, responses: cfAnswers.map((x) => ({ path: x.path, status: x.status, date: x.date, request_id: x.cf_ray, body: x.body })) };
  },
  checks: [
    { id: 'cloudflare-2fa', title: 'Every Cloudflare member uses two-factor authentication', controls: ['AC-01'], evaluate: (d) => {
      if (d.account.enforce_twofactor) return { status: 'pass', detail: 'the account enforces two-factor authentication' };
      const without = (d.members as any[]).filter((m) => m.status === 'accepted' && !m.two_factor).map((m) => m.email);
      return without.length ? { status: 'fail', detail: `the account does not enforce it, and these members have none: ${without.join(', ')}` } : { status: 'pass', detail: 'every accepted member has two-factor authentication (the account does not enforce it)' };
    } },
    { id: 'cloudflare-tls', title: 'Zones accept only TLS 1.2 or later', controls: ['AC-09'], evaluate: (d) => {
      const zones = Object.entries(d.zones as Record<string, any>);
      if (!zones.length) return { status: 'error', detail: 'no zone was read' };
      const unread = zones.filter(([, s]) => s.min_tls_version === null).map(([z]) => z);
      if (unread.length) return { status: 'error', detail: `the minimum TLS version of ${unread.join(', ')} could not be read` };
      const weak = zones.filter(([, s]) => TLS_ORDER.indexOf(s.min_tls_version) < TLS_ORDER.indexOf('1.2')).map(([z, s]) => `${z} (${s.min_tls_version})`);
      return weak.length ? { status: 'fail', detail: `older TLS accepted by ${weak.join(', ')}` } : { status: 'pass', detail: 'TLS 1.2 or later everywhere' };
    } },
    { id: 'cloudflare-https', title: 'Zones redirect every request to HTTPS', controls: ['AC-09'], evaluate: (d) => {
      const zones = Object.entries(d.zones as Record<string, any>);
      if (!zones.length) return { status: 'error', detail: 'no zone was read' };
      const unread = zones.filter(([, s]) => s.always_use_https === null).map(([z]) => z);
      if (unread.length) return { status: 'error', detail: `the HTTPS redirect of ${unread.join(', ')} could not be read` };
      const off = zones.filter(([, s]) => s.always_use_https !== 'on').map(([z, s]) => `${z} (${s.always_use_https})`);
      return off.length ? { status: 'fail', detail: `plain HTTP served by ${off.join(', ')}` } : { status: 'pass', detail: 'always HTTPS' };
    } },
    { id: 'cloudflare-change-actors', title: 'Every Cloudflare change since the last run was made by someone on the roster, and every Worker deploy and setting change by a service account', controls: ['CHG-03', 'OPS-04'], evaluate: (d) => {
      if (!Array.isArray(d.changes)) return { status: 'error', detail: 'the account audit log was not read' };
      const services = new Set<string>(d.roster.service_accounts), known = new Set<string>([...d.roster.people, ...services]);
      const found = (d.changes as { at: string; actor: string; action: string; resource: string }[]).flatMap((c) =>
        !c.actor ? [`${c.at} ${c.action} ${c.resource} by no one the log names`]
        : !known.has(c.actor) ? [`${c.at} ${c.action} ${c.resource} by ${c.actor}, who is not on the roster`]
        : c.resource.startsWith('script ') && !services.has(c.actor) ? [`${c.at} Worker ${c.resource.slice(7)} deployed by ${c.actor}, a person, not the pipeline's service account`]
        // A production setting a person changed by hand has no reviewed change behind it, whoever the person is.
        : c.resource.startsWith('zone_setting ') && !services.has(c.actor) ? [`${c.at} setting ${c.resource.slice(13)} changed by hand by ${c.actor}`] : []);
      return found.length ? { status: 'fail', detail: found.join('; ') } : { status: 'pass', detail: `${d.changes.length} change(s) since ${d.changes_since}, each by someone on the roster; Worker deploys only by a service account` };
    } },
  ],
};

export const COLLECTORS: CollectorDef[] = [github, cloudflare];

export function readSettings(root: string): { settings: CollectorSettings[]; version: string | null } {
  const r = readVersioned(root, 'collectors.json');
  if (!r) return { settings: [], version: null };
  const doc = JSON.parse(r.text);
  const errs = validate(schema('collectors'), doc);
  if (errs.length) throw new Error(`collectors.json is invalid: ${errs.join('; ')}`);
  return { settings: doc.collectors, version: r.version };
}

export function configureCollector(root: string, id: string, input: { enabled?: boolean; params?: Record<string, string> }): void {
  const def = COLLECTORS.find((c) => c.id === id);
  if (!def) throw new Error(`${id} is not a collector; choose one of ${COLLECTORS.map((c) => c.id).join(', ')}`);
  for (const k of Object.keys(input.params ?? {})) if (!def.params.some((p) => p.name === k)) throw new Error(`${id} has no parameter ${k}; it takes ${def.params.map((p) => p.name).join(', ')}`);
  const { settings, version } = readSettings(root);
  const cur = settings.find((s) => s.id === id) ?? { id: def.id, enabled: false, params: {} };
  const next = { ...cur, enabled: input.enabled ?? cur.enabled, params: { ...cur.params, ...(input.params ?? {}) } };
  const doc = { schema: 'evidence-desk.collectors/1', collectors: [...settings.filter((s) => s.id !== id), next] };
  writeVersioned(root, 'collectors.json', JSON.stringify(doc, null, 2) + '\n', version);
}

// Runs every enabled collector (or one), records snapshots as evidence and every check result, and returns the run.
export async function runChecks(root: string, by: string, only?: string): Promise<Run> {
  const ws = loadWorkspace(root);
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === by)) throw new Error(`${by || '(none)'} is not in registers/people.csv`);
  const enabled = readSettings(root).settings.filter((s) => s.enabled && (!only || s.id === only));
  if (!enabled.length) throw new Error(only ? `${only} is not enabled` : 'no collector is enabled; configure one with `evidence-desk collectors`');
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const last = ws.runs.map((r) => r.data.started_at).sort().at(-1);
  const roster: Roster = { ...cloudflareRoster(root, ws), ...(last ? { since: last } : {}) };
  const id = `RUN-${clockDate().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${randomBytes(2).toString('hex')}`;
  const run: Run = { schema: 'evidence-desk.check-run/1', id, started_at: now(), finished_at: '', by, collectors: [], results: [] };
  for (const s of enabled) {
    const def = COLLECTORS.find((c) => c.id === s.id)!;
    let snap: Snapshot;
    try { snap = await def.collect(s.params, roster); }
    catch (e) {
      run.collectors.push({ id: s.id, status: 'error', error: (e as Error).message });
      for (const c of def.checks) run.results.push({ check: c.id, collector: s.id, controls: c.controls, status: 'error', detail: `the collector could not run: ${(e as Error).message}` });
      continue;
    }
    const rel = `evidence/files/collected/${s.id}/${id}.json`;
    writeVersioned(root, rel, JSON.stringify({ collector: s.id, params: s.params, collected_at: now(), queries: snap.queries, ...(snap.responses ? { responses: snap.responses } : {}), data: snap.data }, null, 2) + '\n', null);
    const controls = [...new Set(def.checks.flatMap((c) => c.controls))].filter((c) => applicable.has(c));
    const evidence = controls.length ? addEvidence(root, { title: `${def.title}: collected by run ${id}`, controls, files: [rel], recorded_by: by,
      source: { kind: 'collector', name: s.id, query: snap.queries.join('; ') } }) : undefined;
    run.collectors.push({ id: s.id, status: 'ok', snapshot: rel, ...(evidence ? { evidence } : {}) });
    for (const c of def.checks) {
      let r: { status: Result['status']; detail: string };
      try { r = c.evaluate(snap.data); } catch (e) { r = { status: 'error', detail: `the check failed to evaluate: ${(e as Error).message}` }; }
      run.results.push({ check: c.id, collector: s.id, controls: c.controls, ...r });
    }
  }
  run.finished_at = now();
  const errs = validate(schema('check-run'), run);
  if (errs.length) throw new Error(`the run record is invalid: ${errs.join('; ')}`);
  writeVersioned(root, `checks/runs/${id}.json`, JSON.stringify(run, null, 2) + '\n', null);
  return run;
}

export function checkTitle(id: string): string { return COLLECTORS.flatMap((c) => c.checks).find((c) => c.id === id)?.title ?? id; }

// The GitHub Actions workflow that runs the checks daily in the workspace's own repository. It blocks nothing:
// a failing check fails the run, and GitHub's own notification reaches the owner.
// GitHub reserves the GITHUB_ prefix for its own secrets, so a credential named GITHUB_* is stored as EVIDENCE_DESK_GITHUB_*.
const secretName = (cred: string) => (cred.startsWith('GITHUB_') ? `EVIDENCE_DESK_${cred}` : cred);

export function ciWorkflow(settings: CollectorSettings[]): string {
  const secrets = [...new Set(settings.filter((s) => s.enabled).flatMap((s) => COLLECTORS.find((c) => c.id === s.id)!.credentials))];
  let commit = '';
  try { commit = execFileSync('git', ['-C', join(import.meta.dirname, '..'), 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { commit = ''; }
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('the Evidence Desk checkout has no commit to pin the workflow to; run ci-template from a git checkout of Evidence Desk');
  return `name: Evidence Desk checks
# Runs the workspace's enabled collectors and checks every day and commits the results. A failing check fails this
# run so GitHub notifies you; it gates nothing. Store each credential below as a repository secret with read-only access
# (a GitHub token as EVIDENCE_DESK_GITHUB_TOKEN: GitHub reserves the GITHUB_ prefix). With an imported Open Autonomy
# project it reads the project's public repository again (the repository named in sources/open-autonomy/latest.json;
# whoever can change this repository can change which project is read), so a changed roster, seam or vendor shows the next
# day, and a project that cannot be read fails the run. It checks who recorded each
# signed act (with an imported Open Autonomy roster) and keeps one issue per due or overdue obligation, assigned to the
# person who owes it, using this repository's own workflow token.
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
permissions:
  contents: write
  issues: write
  pull-requests: read
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.10
      - name: Fetch Evidence Desk at the commit that wrote this workflow
        run: |
          git init -q "$RUNNER_TEMP/evidence-desk"
          git -C "$RUNNER_TEMP/evidence-desk" fetch -q --depth 1 https://github.com/open-autonomy-org/evidence-desk.git ${commit}
          git -C "$RUNNER_TEMP/evidence-desk" checkout -q FETCH_HEAD
${settings.some((x) => x.enabled) ? `      - name: Run the checks
        id: run
        continue-on-error: true
${secrets.length ? `        env:\n${secrets.map((s) => `          ${s}: \${{ secrets.${secretName(s)} }}`).join('\n')}\n` : ''}        run: bun "$RUNNER_TEMP/evidence-desk/src/cli.ts" run . --by "\${{ vars.EVIDENCE_DESK_RECORDER }}"
` : ''}      - name: Read the Open Autonomy project again
        id: reread
        if: hashFiles('sources/open-autonomy/latest.json') != ''
        continue-on-error: true
        run: |
          account=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('sources/open-autonomy/latest.json', 'utf8')).account)")
          git clone -q "https://github.com/$account.git" "$RUNNER_TEMP/project"
          bun "$RUNNER_TEMP/evidence-desk/src/cli.ts" open-autonomy . import --repo "$RUNNER_TEMP/project" --by "\${{ vars.EVIDENCE_DESK_RECORDER }}"
      - name: Check who recorded each signed act
        if: hashFiles('sources/open-autonomy/latest.json') != ''
        continue-on-error: true
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: bun "$RUNNER_TEMP/evidence-desk/src/cli.ts" collect . attribution --repo "\${{ github.repository }}" --by "\${{ vars.EVIDENCE_DESK_RECORDER }}"
      - name: Commit the results
        run: |
          git config user.name "Evidence Desk checks"
          git config user.email "evidence-desk@users.noreply.github.com"
          for p in checks evidence sources registers scope.json; do if [ -e "$p" ]; then git add "$p"; fi; done
          git diff --cached --quiet || git commit -m "Evidence Desk checks"
          git push
      - name: Remind people of what they owe
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: bun "$RUNNER_TEMP/evidence-desk/src/cli.ts" remind . --repo "\${{ github.repository }}" --within 30
      - name: Fail when a check failed or the project could not be read
        if: steps.run.outcome == 'failure' || steps.reread.outcome == 'failure'
        run: exit 1
`;
}
