// Reads an Open Autonomy project at a named commit and brings what its declarations establish into the workspace:
// the humans and their authority (the team roster), the agents, their schedules and models (agent.json), where
// people act (the seams declared under ADR 0008), how changes land and reach production (the landing and deploy
// workflows), and the vendors the project depends on. Only committed files are read, through `git show`, so a
// fact always names the commit it came from; nothing of a harness's private state is read.
import { execFileSync } from 'node:child_process';
import { check, schema } from './schema.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence, saveRegisterRow, setScope } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { now } from './clock.ts';
import { neededControls } from './targets.ts';

declare const Bun: { YAML: { parse(text: string): unknown } };

export type Seam = { id: string; scope: string; door: string; record: string };
export type Snapshot = {
  schema: string; repository: string; repository_path?: string; remote_url?: string; remote_branches?: string[];
  // The project's architecture decision records, and whether each answers the soc2 template's checklist.
  decisions?: { file: string; title: string; status: string; checklist: 'complete' | 'incomplete' | 'none' }[]; commit: string; read_at: string; account: string; kit: { skew: string; version: string } | null;
  team: { id: string; name: string; github?: string; discord?: string; scopes: string[] }[];
  agents: { profile: string; models: { name: string; provider: string; model: string; credential?: string }[]; jobs: { name: string; schedule: string; skills: string[] }[] }[];
  seams: Seam[] | null; vendor_accounts: { id: string; vendor: string; account: string }[];
  rules: { pr_landing: boolean; production_deploy: { workflow: string; tag_trigger: string | null; environment: string | null; egress: string[] } | null; production_workflows?: { workflow: string; tag_trigger: string | null; environment: string | null; egress: string[] }[] };
  spend_limits: string[];
  vendors: string[];
};

const DOORS = ['commit', 'code-host-gate', 'platform-key'];
const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const show = (repo: string, commit: string, path: string): string | null => { try { return git(repo, 'show', `${commit}:${path}`); } catch { return null; } };

const VENDOR_OF: Record<string, string> = {
  'api.github.com': 'GitHub', 'github.com': 'GitHub', 'registry.npmjs.org': 'npm', 'api.cloudflare.com': 'Cloudflare',
  'openai-codex': 'OpenAI', 'open-autonomy.org': 'Open Autonomy platform (model valve and books)',
};

// A host's vendor by its registrable domain: every GitHub host (codeload, objects.githubusercontent.com) is GitHub.
const VENDOR_OF_DOMAIN: Record<string, string> = { 'github.com': 'GitHub', 'githubusercontent.com': 'GitHub', 'npmjs.org': 'npm', 'cloudflare.com': 'Cloudflare', 'open-autonomy.org': VENDOR_OF['open-autonomy.org'] };
const vendorOfHost = (host: string) => VENDOR_OF[host] ?? Object.entries(VENDOR_OF_DOMAIN).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1] ?? host;

export function readProject(repo: string, commitish = 'HEAD'): Snapshot {
  const commit = git(repo, 'rev-parse', commitish).trim();
  const configText = show(repo, commit, '.open-autonomy/config.yaml');
  if (!configText) throw new Error(`${repo} at ${commit.slice(0, 12)} has no .open-autonomy/config.yaml; it is not an Open Autonomy project`);
  const config = Bun.YAML.parse(configText) as Record<string, any>;
  const agentText = show(repo, commit, '.open-autonomy/agent.json');
  if (!agentText) throw new Error(`${repo} at ${commit.slice(0, 12)} has no .open-autonomy/agent.json (the agent-setup package of ADR 0007)`);
  const agent = JSON.parse(agentText) as { profiles: Record<string, any> };
  const kit = show(repo, commit, '.open-autonomy/kit.json');

  const team = ((config.team?.members ?? []) as any[]).map((m) => ({
    id: String(m.id), name: String(m.name), scopes: (m.scopes ?? []) as string[],
    ...(m.github ? { github: String(m.github.login) } : {}), ...(m.discord ? { discord: String(m.discord.name) } : {}),
  }));
  const agents = Object.entries(agent.profiles).map(([profile, p]) => ({
    profile,
    models: Object.entries(p.inference?.models ?? {}).map(([name, m]: [string, any]) => ({ name, provider: String(m.provider), model: String(m.model), ...(m.credential ? { credential: String(m.credential) } : {}) })),
    jobs: Object.entries(p.jobs ?? {}).map(([name, j]: [string, any]) => ({
      name, skills: j.skills ?? [],
      schedule: j.schedule?.kind === 'interval' ? `every ${j.schedule.minutes} minutes` : j.schedule?.kind === 'cron' ? `cron ${j.schedule.expr}` : JSON.stringify(j.schedule),
    })),
  }));

  const workflows = (git(repo, 'ls-tree', '--name-only', commit, '.github/workflows/').split('\n').filter(Boolean));
  // Every workflow gated on the production environment (a project may release, deploy and administer through it); the
  // one a deploy-v* tag starts is the production deploy, and every one's egress names vendors.
  const gated: NonNullable<Snapshot['rules']['production_deploy']>[] = [];
  for (const w of workflows) {
    const text = show(repo, commit, w) ?? '';
    if (!/environment:\s*production/.test(text)) continue;
    const egress: string[] = [];
    const lines = text.split('\n');
    const at = lines.findIndex((l) => /allowed-endpoints:/.test(l));
    if (at >= 0) for (const l of lines.slice(at + 1)) { const m = /^\s+([A-Za-z0-9.-]+):\d+\s*$/.exec(l); if (!m) break; egress.push(m[1]); }
    gated.push({ workflow: w, tag_trigger: /tags:\s*\[\s*'([^']+)'/.exec(text)?.[1] ?? null, environment: 'production', egress });
  }
  const production = gated.find((g) => g.tag_trigger?.startsWith('deploy')) ?? gated.find((g) => g.tag_trigger) ?? gated[0] ?? null;
  const vendors = new Set<string>(['GitHub']);
  for (const a of agents) for (const m of a.models) vendors.add(VENDOR_OF[m.provider] ?? (m.provider === 'custom' || m.provider.endsWith('-valve') ? VENDOR_OF['open-autonomy.org'] : m.provider));
  if (config.platform) vendors.add(VENDOR_OF['open-autonomy.org']);
  for (const host of gated.flatMap((g) => g.egress)) vendors.add(vendorOfHost(host));

  const seamsDoc = config.seams as { seams?: Seam[]; vendor_accounts?: Snapshot['vendor_accounts'] } | undefined;
  // Where the checkout came from: the remote it tracks and which of the remote's branches hold the commit read, so a
  // reader can fetch the same commit from the code host rather than trust the local folder.
  let remote = '';
  try { remote = git(repo, 'remote', 'get-url', 'origin').trim(); } catch { /* a checkout with no origin */ }
  const remoteBranches = remote ? git(repo, 'branch', '-r', '--contains', commit, '--format=%(refname:short)').split('\n').map((x) => x.trim()).filter((x) => x.startsWith('origin/') && x !== 'origin/HEAD') : [];
  const decisions = git(repo, 'ls-tree', '--name-only', commit, 'docs/decisions/').split('\n').filter((f) => /\/\d{4}-[^/]*\.md$/.test(f)).map((f) => {
    const text = show(repo, commit, f) ?? '';
    const section = /^## SOC 2 checklist\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1];
    const answered = section ? Array.from({ length: 10 }, (_, i) => `C${i + 1}`).every((c) => new RegExp(`^\\s*[-*]?\\s*${c}\\b[^:\\n]*:\\s*\\S`, 'm').test(section)) : false;
    return { file: f, title: /^#\s+(.*)$/m.exec(text)?.[1] ?? f, status: /^Status:\s*(.*)$/m.exec(text)?.[1]?.trim() ?? '', checklist: (!section ? 'none' : answered ? 'complete' : 'incomplete') as 'complete' | 'incomplete' | 'none' };
  });
  const snap: Snapshot = {
    schema: 'evidence-desk.open-autonomy/1', ...(decisions.length ? { decisions } : {}), repository: String(config.account ?? repo), repository_path: repo, remote_url: remote.replace(/\/\/[^/@]*@/, '//'), remote_branches: remoteBranches, commit, read_at: now(), account: String(config.account ?? ''),
    kit: kit ? (({ skew, version }) => ({ skew, version }))(JSON.parse(kit)) : null,
    team, agents, seams: seamsDoc?.seams ?? null, vendor_accounts: seamsDoc?.vendor_accounts ?? [],
    rules: { pr_landing: workflows.some((w) => /land\.ya?ml$/.test(w)), production_deploy: production, production_workflows: gated },
    spend_limits: ((config.spend?.limits ?? []) as any[]).map((l) => Object.entries(l).map(([k, v]) => `${k} ${v}`).join(', ')),
    vendors: [...vendors].sort(),
  };
  const errs = check(schema('open-autonomy'), snap);
  if (errs.length) throw new Error(`the project's declarations could not be read: ${errs.join('; ')}`);
  return snap;
}

// Problems with the seams themselves: each must use one of ADR 0008's three doors, name a scope some roster member
// holds, and leave a record outside chat.
export function seamFindings(s: Snapshot): string[] {
  if (!s.seams) return ['The project declares no seams (ADR 0008): where people act, and where their acts are recorded, is unknown'];
  const scopes = new Set(s.team.flatMap((m) => m.scopes));
  const out: string[] = [];
  for (const seam of s.seams) {
    if (!DOORS.includes(seam.door)) out.push(`Seam ${seam.id} acts through "${seam.door}", which is not one of the three doors (${DOORS.join(', ')}); its acts are not durably recorded`);
    if (!scopes.has(seam.scope)) out.push(`Seam ${seam.id} needs scope ${seam.scope}, which no roster member holds`);
  }
  if (!s.vendor_accounts.length) out.push('The seams declaration names no vendor accounts, so the roster cannot be checked for completeness');
  return out;
}

export function diffSnapshots(before: Snapshot | null, after: Snapshot): string[] {
  if (!before) return [];
  const out: string[] = [];
  const key = (x: unknown) => JSON.stringify(x);
  const cmp = (what: string, a: unknown, b: unknown) => { if (key(a) !== key(b)) out.push(`${what} changed between ${before.commit.slice(0, 12)} and ${after.commit.slice(0, 12)}`); };
  cmp('The team roster', before.team, after.team);
  cmp('The agents, models or schedules', before.agents, after.agents);
  cmp('The seams', before.seams, after.seams);
  cmp('The vendor accounts', before.vendor_accounts, after.vendor_accounts);
  // A snapshot read before production_workflows existed is compared without it, so an upgrade alone reports no change.
  const rules = (r: Snapshot['rules']) => ('production_workflows' in before.rules ? r : { ...r, production_workflows: undefined });
  cmp('The landing and production rules', rules(before.rules), rules(after.rules));
  // A vendor the project stops naming keeps its register row (removing it is a person's decision), so say so.
  for (const v of before.vendors.filter((x) => !after.vendors.includes(x))) out.push(`The project no longer names ${v} as a vendor; its row in registers/vendors.csv stays until someone removes it`);
  return out;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

// The controls a project's declarations evidence: the program and its roles, change and deployment rules, credential
// custody by name, vendors and the agents' configuration; and of the AI family, the inventory, oversight, change and
// limits controls, recorded only while an AI framework is targeted, since only then are those controls needed.
export const DECLARATION_CONTROLS = ['GOV-01', 'CHG-01', 'CHG-03', 'AC-05', 'VND-01', 'OPS-04', 'HR-06', 'AI-02', 'AI-03', 'AI-07', 'AI-10'];

export type ImportReport = { commit: string; snapshot: string; changed: string[]; seams: string[]; added: string[]; conflicts: string[]; evidence: string | null; evidence_existing?: boolean };

// Records the snapshot, fills what it determines and is still empty, reports what differs from what people entered,
// and records the design facts as evidence for the controls they speak to.
export function importOpenAutonomy(root: string, repo: string, commitish = 'HEAD', by: string): ImportReport {
  const snap = readProject(repo, commitish);
  const ws = loadWorkspace(root);
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === by) && !snap.team.some((m) => m.id === by)) throw new Error(`recorder ${by} is not in registers/people.csv or the project's roster`);
  const latestRel = 'sources/open-autonomy/latest.json';
  const prevText = readVersioned(root, latestRel);
  const prev = prevText ? JSON.parse(prevText.text) as Snapshot : null;
  const report: ImportReport = { commit: snap.commit, snapshot: `sources/open-autonomy/${snap.commit.slice(0, 12)}.json`, changed: diffSnapshots(prev, snap), seams: seamFindings(snap), added: [], conflicts: [], evidence: null };

  const snapText = pretty(snap);
  if (!readVersioned(root, report.snapshot)) writeVersioned(root, report.snapshot, snapText, null);
  // The documents that define what the project must keep true and what its internal audit checks, as they stood at the
  // commit read: the architecture decisions, the SOC 2 checklist, and the internal-audit job's instructions.
  const docs = git(repo, 'ls-tree', '-r', '--name-only', snap.commit, 'docs/decisions/', 'hermes/skills/open-autonomy/internal-audit/').split('\n').filter((f) => f.endsWith('.md'));
  for (const f of docs) { const rel = `sources/open-autonomy/${snap.commit.slice(0, 12)}/${f}`; if (!readVersioned(root, rel)) writeVersioned(root, rel, git(repo, 'show', `${snap.commit}:${f}`) + '\n', null); }
  writeVersioned(root, latestRel, snapText, prevText?.version ?? null);

  const source = `Open Autonomy ${snap.account} at ${snap.commit.slice(0, 12)}`;
  const scope = readVersioned(root, 'scope.json')!;
  const answers = (JSON.parse(scope.text) as { answers: Record<string, unknown>; sources?: Record<string, string> });
  const determined: Record<string, unknown> = {
    develops_software: true,
    subservice_organizations: snap.vendors.join('; '),
  };
  const fill: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(determined)) {
    const cur = answers.answers[k];
    const fromUs = answers.sources?.[k]?.startsWith('Open Autonomy ');
    if (cur === undefined || cur === '' || fromUs) { if (cur !== v || !fromUs) fill[k] = v; }
    else if (cur !== v) report.conflicts.push(`Scope answer ${k} is ${JSON.stringify(cur)}; the project's declarations say ${JSON.stringify(v)}`);
  }
  if (Object.keys(fill).length) { setScope(root, fill, scope.version, source); report.added.push(...Object.keys(fill).map((k) => `scope ${k}`)); }

  const register = (name: 'people' | 'vendors' | 'systems', row: Record<string, string>) => {
    const reg = loadWorkspace(root).registers[name];
    if (!reg) throw new Error(`registers/${name}.csv could not be read`);
    const existing = reg.data.rows.find((r) => r.id === row.id);
    if (!existing) { saveRegisterRow(root, name, row, reg.version); report.added.push(`${name} ${row.id}`); return; }
    // A row this import wrote from the roster follows the roster; a row a person wrote is theirs.
    if (existing.notes?.startsWith('From the team roster at ')) {
      if (Object.entries(row).some(([k, v]) => k !== 'notes' && existing[k] !== v)) { saveRegisterRow(root, name, row, reg.version, row.id); report.added.push(`${name} ${row.id} (refreshed from the roster)`); }
      return;
    }
    for (const [k, v] of Object.entries(row)) if (k === 'name' && v && existing[k] && existing[k] !== v) report.conflicts.push(`${name} ${row.id}: ${k} is "${existing[k]}" in the register and "${v}" in the project`);
  };
  for (const m of snap.team) register('people', { id: m.id, name: m.name, role: `Open Autonomy scopes: ${m.scopes.join(', ') || 'none'}`, notes: `From the team roster at ${snap.commit.slice(0, 12)}${m.github ? `; GitHub ${m.github}` : ''}` });
  const SERVICE: Record<string, string> = { GitHub: 'Source code hosting, change review and deployment automation', Cloudflare: 'Hosting of the production service',
    npm: 'Package registry for dependencies', OpenAI: 'Model provider for development agents', [VENDOR_OF['open-autonomy.org']]: 'Model access and metering for development agents' };
  for (const v of snap.vendors) register('vendors', { id: v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: v, service: SERVICE[v] ?? 'Named in the project\'s configuration; describe the service', criticality: 'high', owner: '' });
  register('systems', { id: 'repository', name: `${snap.account} source repository`, kind: 'source code and automation', description: 'Code and the agent setup, changed only through reviewed pull requests', in_scope: 'yes' });

  const applicable = neededControls(loadWorkspace(root));
  const controls = DECLARATION_CONTROLS.filter((c) => applicable.has(c));
  // Evidence of the declarations is recorded when they change, not each time they are read: the daily workflow reads a
  // project whose agents commit constantly, and a fresh record each day would date a governance or vendor control as newly
  // evidenced, since evidence dates decide when it is next due. Unchanged declarations reuse the latest record.
  const recorded = loadWorkspace(root).evidence.filter((e) => e.data.source?.kind === 'open-autonomy' && e.data.source?.name === snap.account && controls.every((c) => e.data.controls.includes(c)))
    .sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at));
  const already = prev && !report.changed.length ? recorded.at(-1) : recorded.find((e) => e.data.source?.commit === snap.commit);
  if (already) { report.evidence = already.data.id; report.evidence_existing = true; }
  else if (controls.length) report.evidence = addEvidence(root, {
    title: `Open Autonomy declarations at ${snap.commit.slice(0, 12)}: roster, agents, seams, landing and production rules`, controls, files: [report.snapshot], recorded_by: by,
    source: { kind: 'open-autonomy', name: snap.account, commit: snap.commit, query: `git show ${snap.commit}:.open-autonomy/config.yaml .open-autonomy/agent.json .github/workflows/` },
  });
  return report;
}

// The roster's history as a population: every commit that changed `team` in the period, with who made it and which
// people or scopes it added or removed. Complete by construction: git log lists every commit touching the file.
export function collectRosterHistory(root: string, input: { repo: string; start: string; end: string; by: string }): { evidence: string; rows: number } {
  // The branch's own line (first parents), each change dated by when it reached the branch (the committer date of the
  // commit on that line, a merge commit for a merged pull request), filtered by date here: git's --since stops walking
  // at the first older commit, so a history whose dates are not monotonic would silently lose changes.
  const inPeriod = (at: string) => { const d = new Date(at).toISOString().slice(0, 10); return d >= input.start && d <= input.end; };
  const log = git(input.repo, 'log', '--first-parent', '--format=%H%x09%an%x09%ae%x09%cI%x09%s', '--', '.open-autonomy/config.yaml')
    .split('\n').filter(Boolean).map((l) => { const [sha, name, email, at, subject] = l.split('\t'); return { sha, name, email, at, subject }; }).filter((c) => inPeriod(c.at));
  const teamAt = (ref: string): Map<string, string[]> => {
    const text = show(input.repo, ref, '.open-autonomy/config.yaml');
    const members = text ? ((Bun.YAML.parse(text) as any).team?.members ?? []) as any[] : [];
    return new Map(members.map((m) => [String(m.id), (m.scopes ?? []) as string[]]));
  };
  const rows: Record<string, string>[] = [];
  for (const c of log.reverse()) {
    let parent: string | null = null;
    try { parent = git(input.repo, 'rev-parse', `${c.sha}^1`).trim(); } catch { parent = null; }
    const before = parent ? teamAt(parent) : new Map<string, string[]>();
    const after = teamAt(c.sha);
    const changes: string[] = [];
    for (const [id, scopes] of after) {
      const was = before.get(id);
      if (!was) changes.push(`added ${id} (${scopes.join(', ') || 'no scopes'})`);
      else { const plus = scopes.filter((x) => !was.includes(x)), minus = was.filter((x) => !scopes.includes(x)); if (plus.length || minus.length) changes.push(`${id}: ${[...plus.map((x) => `+${x}`), ...minus.map((x) => `-${x}`)].join(' ')}`); }
    }
    for (const id of before.keys()) if (!after.has(id)) changes.push(`removed ${id}`);
    if (changes.length) rows.push({ commit: c.sha, committed_at: c.at, author: `${c.name} <${c.email}>`, subject: c.subject, changes: changes.join('; ') });
  }
  const rel = `evidence/files/populations/roster-history-${input.start}-${input.end}-${Date.now()}.csv`;
  writeVersioned(root, rel, ['commit,committed_at,author,subject,changes', ...rows.map((r) => [r.commit, r.committed_at, r.author, r.subject, r.changes].map((v) => /[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v).join(','))].join('\n') + '\n', null);
  const applicable = neededControls(loadWorkspace(root));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} changes to who holds authority, ${input.start} to ${input.end}`, controls: ['AC-02', 'HR-03', 'HR-04'].filter((x) => applicable.has(x)), files: [rel], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'open-autonomy', name: 'team roster', query: `git log --first-parent -- .open-autonomy/config.yaml, keeping commits that reached the branch ${input.start}..${input.end} (UTC committer date), comparing team at each commit and its first parent` },
    notes: 'Complete by construction: every commit on the branch\'s first-parent line that changed the roster file and reached the branch in the period is listed.',
  });
  return { evidence, rows: rows.length };
}

// The acts people record through commit seams (records/ in the Open Autonomy soc2 template: incidents, break-glass
// changes, credential lifecycle, escalations) as one population per seam: every record file whose date falls in the
// period, with the commit that added it and its author. Complete by construction for what the repository holds: the
// folder at the named commit is listed whole. What each kind speaks to follows its seam's id.
export const RECORD_KINDS: Record<string, { date: string; columns: string[]; controls: string[]; finding: (r: Record<string, unknown>) => string | null }> = {
  incidents: { date: 'detected_at', columns: ['id', 'detected_at', 'severity', 'status', 'summary', 'notification', 'review'], controls: ['OPS-03', 'OPS-02'],
    finding: (r) => r.status === 'closed' && !r.review ? `incident ${r.id} is closed without a review` : null },
  'break-glass': { date: 'at', columns: ['id', 'at', 'by', 'change', 'reason', 'reviewed_after'], controls: ['CHG-04'],
    finding: (r) => r.reviewed_after ? null : `break-glass change ${r.id} has no review after the fact` },
  credentials: { date: 'at', columns: ['id', 'at', 'by', 'custody_name', 'action', 'reason'], controls: ['AC-05'], finding: () => null },
  escalations: { date: 'received_at', columns: ['id', 'received_at', 'responded_at', 'channel', 'summary'], controls: ['OPS-01', 'GOV-07'],
    finding: (r) => r.responded_at ? null : `escalation ${r.id} has no recorded response` },
  'restore-tests': { date: 'at', columns: ['id', 'at', 'by', 'store', 'backup_taken_at', 'restored_to', 'result', 'duration_minutes', 'notes'], controls: ['OPS-05', 'OPS-07'],
    finding: (r) => r.result === 'passed' ? null : `restore test ${r.id} of ${r.store} did not pass (${r.result ?? 'no result'})` },
  // The internal audit's own runs (the soc2 template's internal-audit job): not a person's seam, but recorded the same way.
  'internal-audits': { date: 'at', columns: ['id', 'at', 'commit', 'items', 'findings'], controls: ['MON-04', 'MON-01'],
    finding: (r) => Array.isArray(r.findings) && r.findings.length ? `internal audit ${r.id} found: ${(r.findings as string[]).join('; ')}` : null },
};
// Folders the template records that are no person's seam: read whenever the project has them.
const PROGRAM_RECORDS = ['internal-audits'];
export type SeamRecordsReport = { commit: string; populations: { seam: string; folder: string; file: string; evidence: string | null; rows: number; findings: string[] }[] };
export function collectSeamRecords(root: string, input: { repo: string; start: string; end: string; by: string; commit?: string }): SeamRecordsReport {
  const snap = readProject(input.repo, input.commit ?? 'HEAD');
  const seams = [...(snap.seams ?? []).filter((s) => s.door === 'commit' && /^records\/[a-z0-9-]+\/?$/.test(s.record) && RECORD_KINDS[s.id]),
    ...PROGRAM_RECORDS.filter((id) => git(input.repo, 'ls-tree', '--name-only', snap.commit, '--', `records/${id}/`).trim()).map((id) => ({ id, scope: 'the internal-audit job', door: 'commit' as const, record: `records/${id}/` }))];
  if (!seams.length) throw new Error(`${snap.account} at ${snap.commit.slice(0, 12)} declares no commit seam recorded under records/ (the soc2 template's incidents, break-glass, credentials, escalations)`);
  const applicable = neededControls(loadWorkspace(root));
  const csv = (v: unknown) => { const t = v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; };
  const report: SeamRecordsReport = { commit: snap.commit, populations: [] };
  for (const seam of seams) {
    const kind = RECORD_KINDS[seam.id];
    const folder = seam.record.replace(/\/?$/, '/');
    const files = git(input.repo, 'ls-tree', '-r', '--name-only', snap.commit, '--', folder).split('\n').filter((f) => f.endsWith('.json'));
    const rows: string[] = [];
    const findings: string[] = [];
    // Each record's whole history on the named commit's line: a record edited after it was added (a timeline written
    // after the fact, a severity lowered) shows every change with its author and both dates.
    const history: string[] = [];
    for (const f of files) {
      let r: Record<string, unknown>;
      try { r = JSON.parse(show(input.repo, snap.commit, f) ?? ''); } catch { findings.push(`${f} is not a JSON record`); continue; }
      const when = String(r[kind.date] ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) { findings.push(`${f} has no ${kind.date}`); continue; }
      if (when < input.start || when > input.end) continue;
      const added = git(input.repo, 'log', '--diff-filter=A', '--format=%H%x09%an <%ae>%x09%aI', snap.commit, '--', f).trim().split('\n').pop()!.split('\t');
      const changes = git(input.repo, 'log', '--format=%H%x09%cI', snap.commit, '--', f).trim().split('\n').filter(Boolean);
      history.push(`=== ${f}\n${git(input.repo, 'log', '-p', '--format=commit %H%nauthor %an <%ae> %aI%ncommitter %cn <%ce> %cI%n%n    %s%n', snap.commit, '--', f).trim()}\n`);
      const finding = kind.finding(r);
      if (finding) findings.push(finding);
      rows.push([f, ...kind.columns.map((c) => r[c]), added[0], added[1], added[2], changes[0]?.split('\t')[1] ?? '', changes.length].map(csv).join(','));
    }
    const stem = `evidence/files/populations/${seam.id}-${input.start}-${input.end}-${Date.now()}`;
    const rel = `${stem}.csv`;
    writeVersioned(root, rel, [['file', ...kind.columns, 'added_commit', 'added_by', 'added_at', 'last_changed_at', 'changes'].join(','), ...rows].join('\n') + '\n', null);
    writeVersioned(root, `${stem}.history.txt`, `${snap.account} at ${snap.commit}: git log -p ${snap.commit} -- <file> for each ${seam.id} record in the period\n\n${history.join('\n')}`, null);
    const controls = kind.controls.filter((x) => applicable.has(x));
    const evidence = !controls.length ? null : addEvidence(root, {
      title: `Population: ${rows.length} ${seam.id} records, ${input.start} to ${input.end}`, controls, files: [rel, `${stem}.history.txt`], recorded_by: input.by,
      period: { start: input.start, end: input.end }, source: { kind: 'open-autonomy', name: `${seam.id} seam`, commit: snap.commit, query: `git ls-tree ${snap.commit} -- ${folder}; each file's ${kind.date} in the period, with the commit that added it, and git log -p ${snap.commit} -- <file> for its full history` },
      notes: `Complete for what ${folder} holds at ${snap.commit.slice(0, 12)}: every record file there is read, but an event no one recorded is not in it; the package's exceptions reconcile it against what the collectors saw (an unapproved change with no break-glass record is one). The seam is held by scope ${seam.scope}.${findings.length ? ` Findings: ${findings.join('; ')}.` : ''}`,
    });
    const latest = `sources/open-autonomy/seam-records/${seam.id}.json`;
    writeVersioned(root, latest, pretty({ seam: seam.id, commit: snap.commit, period: { start: input.start, end: input.end }, collected_at: now(), rows: rows.length, file: rel, evidence, findings }), readVersioned(root, latest)?.version ?? null);
    report.populations.push({ seam: seam.id, folder, file: rel, evidence, rows: rows.length, findings });
  }
  return report;
}

