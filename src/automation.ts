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

export type CollectorSettings = { id: 'github'; enabled: boolean; params: Record<string, string> };
type Snapshot = { data: Record<string, unknown>; queries: string[] };
type Result = { check: string; collector: string; controls: string[]; status: 'pass' | 'fail' | 'error'; detail: string };
export type Run = { schema: string; id: string; started_at: string; finished_at: string; by: string;
  collectors: { id: string; status: 'ok' | 'error'; error?: string; snapshot?: string; evidence?: string }[]; results: Result[] };

type CheckDef = { id: string; title: string; controls: string[]; evaluate(d: Record<string, any>): { status: Result['status']; detail: string } };
type CollectorDef = { id: CollectorSettings['id']; title: string; params: { name: string; prompt: string }[]; credentials: string[]; collect(p: Record<string, string>): Promise<Snapshot>; checks: CheckDef[] };

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// ── GitHub ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function gh(path: string, queries: string[]): Promise<{ status: number; body: any }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  queries.push(`GET ${path}`);
  const r = await fetch(`https://api.github.com${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' } });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
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

const github: CollectorDef = {
  id: 'github', title: 'GitHub organization and repositories', credentials: ['GITHUB_TOKEN'],
  params: [{ name: 'org', prompt: 'Organization login' }, { name: 'repos', prompt: 'Repositories to check, comma-separated owner/name' }],
  async collect(p) {
    const queries: string[] = [];
    if (!p.org) throw new Error('set the org parameter');
    const org = (await gh(`/orgs/${p.org}`, queries)).body;
    const admins = (await ghAll(`/orgs/${p.org}/members?role=admin`, queries)).map((m) => m.login);
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
      repos[repo] = { default_branch: branch, protection: protection.status === 200 ? protection.body : null, rulesets: rules,
        dependabot: dependabot.status === 200 ? dependabot.body : { unavailable: dependabot.status }, secret_scanning: secrets.status === 200 ? secrets.body : { unavailable: secrets.status } };
    }
    return { data: { org: { login: org?.login, two_factor_requirement_enabled: org?.two_factor_requirement_enabled }, admins, repos }, queries };
  },
  checks: [
    { id: 'github-org-2fa', title: 'The organization requires two-factor authentication', controls: ['AC-01'], evaluate: (d) =>
      d.org.two_factor_requirement_enabled === undefined ? { status: 'error', detail: 'GitHub did not report the two-factor requirement; the token needs organization owner read access' }
        : d.org.two_factor_requirement_enabled ? { status: 'pass', detail: 'required' } : { status: 'fail', detail: 'members may use accounts without two-factor authentication' } },
    { id: 'github-change-review', title: 'The default branch requires an approving review', controls: ['CHG-01'], evaluate: (d) => {
      const bad = Object.entries(d.repos as Record<string, any>).filter(([, r]) => {
        const classic = (r.protection?.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1;
        const ruled = (r.rulesets as any[]).some((rs) => rs.enforcement === 'active' && (rs.rules ?? []).some((x: any) => x.type === 'pull_request' && (x.parameters?.required_approving_review_count ?? 0) >= 1));
        return !classic && !ruled;
      }).map(([k]) => k);
      return bad.length ? { status: 'fail', detail: `no required approving review on the default branch of ${bad.join(', ')}` } : { status: 'pass', detail: 'every checked repository requires an approving review' };
    } },
    { id: 'github-history-protected', title: 'The default branch cannot be force-pushed or deleted', controls: ['CHG-03', 'OPS-04'], evaluate: (d) => {
      const bad = Object.entries(d.repos as Record<string, any>).filter(([, r]) => {
        const classic = r.protection && r.protection.allow_force_pushes?.enabled !== true && r.protection.allow_deletions?.enabled !== true;
        const ruled = (r.rulesets as any[]).some((rs) => rs.enforcement === 'active' && ['non_fast_forward', 'deletion'].every((t) => (rs.rules ?? []).some((x: any) => x.type === t)));
        return !classic && !ruled;
      }).map(([k]) => k);
      return bad.length ? { status: 'fail', detail: `history of the default branch can be rewritten or deleted in ${bad.join(', ')}` } : { status: 'pass', detail: 'protected' };
    } },
    { id: 'github-dependabot', title: 'No critical or high dependency alert is open for more than 30 days', controls: ['CHG-05', 'MON-03'], evaluate: (d) => {
      const late: string[] = [];
      for (const [repo, r] of Object.entries(d.repos as Record<string, any>)) {
        if (!Array.isArray(r.dependabot)) return { status: 'error', detail: `dependency alerts for ${repo} are not available (${r.dependabot.unavailable}); enable Dependabot alerts or grant the token access` };
        for (const a of r.dependabot) {
          const sev = a.security_advisory?.severity ?? a.security_vulnerability?.severity ?? a.severity;
          if ((sev === 'critical' || sev === 'high') && Date.parse(a.created_at) < Date.now() - 30 * 864e5) late.push(`${repo}#${a.number} (${sev}, open since ${String(a.created_at).slice(0, 10)})`);
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

export const COLLECTORS: CollectorDef[] = [github];

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
  const id = `RUN-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${randomBytes(2).toString('hex')}`;
  const run: Run = { schema: 'evidence-desk.check-run/1', id, started_at: now(), finished_at: '', by, collectors: [], results: [] };
  for (const s of enabled) {
    const def = COLLECTORS.find((c) => c.id === s.id)!;
    let snap: Snapshot;
    try { snap = await def.collect(s.params); }
    catch (e) {
      run.collectors.push({ id: s.id, status: 'error', error: (e as Error).message });
      for (const c of def.checks) run.results.push({ check: c.id, collector: s.id, controls: c.controls, status: 'error', detail: `the collector could not run: ${(e as Error).message}` });
      continue;
    }
    const rel = `evidence/files/collected/${s.id}/${id}.json`;
    writeVersioned(root, rel, JSON.stringify({ collector: s.id, params: s.params, collected_at: now(), queries: snap.queries, data: snap.data }, null, 2) + '\n', null);
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
# (a GitHub token as EVIDENCE_DESK_GITHUB_TOKEN: GitHub reserves the GITHUB_ prefix).
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.10
      - name: Fetch Evidence Desk at the commit that wrote this workflow
        run: |
          git init -q "$RUNNER_TEMP/evidence-desk"
          git -C "$RUNNER_TEMP/evidence-desk" fetch -q --depth 1 https://github.com/open-autonomy-org/evidence-desk.git ${commit}
          git -C "$RUNNER_TEMP/evidence-desk" checkout -q FETCH_HEAD
      - name: Run the checks
        id: run
        continue-on-error: true
        env:
${secrets.map((s) => `          ${s}: \${{ secrets.${secretName(s)} }}`).join('\n')}
        run: bun "$RUNNER_TEMP/evidence-desk/src/cli.ts" run . --by "\${{ vars.EVIDENCE_DESK_RECORDER }}"
      - name: Commit the results
        run: |
          git config user.name "Evidence Desk checks"
          git config user.email "evidence-desk@users.noreply.github.com"
          git add checks evidence
          git diff --cached --quiet || git commit -m "Evidence Desk checks"
          git push
      - name: Fail when a check failed
        if: steps.run.outcome == 'failure'
        run: exit 1
`;
}
