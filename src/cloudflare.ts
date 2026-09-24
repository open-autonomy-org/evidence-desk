// Reads from Cloudflare's API v4 with the owner's own read-only token (CLOUDFLARE_API_TOKEN). Nothing is sent to
// Cloudflare but reads. Every request is recorded in the caller's query list so what was read can be shown.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace, type Workspace } from './workspace.ts';
import type { Snapshot } from './open-autonomy.ts';
import { now } from './clock.ts';
const API = 'https://api.cloudflare.com/client/v4';

// Each answer's status, Date and cf-ray (Cloudflare's id for the request), for a caller that keeps them with what it read.
export const cfAnswers: { path: string; status: number; date: string; cf_ray: string }[] = [];

export async function cf(path: string, queries: string[]): Promise<{ status: number; result: any; info?: any }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set; export a read-only token for the account');
  queries.push(`GET ${path}`);
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  cfAnswers.push({ path, status: r.status, date: r.headers.get('date') ?? '', cf_ray: r.headers.get('cf-ray') ?? '' });
  const body = await r.json().catch(() => null) as { result?: unknown; result_info?: unknown } | null;
  return { status: r.status, result: body?.result ?? null, info: body?.result_info };
}

// Every page of a list; the page count is part of the completeness basis.
export async function cfAll(path: string, queries: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await cf(`${path}${path.includes('?') ? '&' : '?'}per_page=50&page=${page}`, queries);
    if (r.status !== 200 || !Array.isArray(r.result)) throw new Error(`GET ${path} answered ${r.status}`);
    out.push(...r.result);
    const pages = Number(r.info?.total_pages);
    if (Number.isInteger(pages) ? page >= pages : r.result.length < 50) return out;
  }
  throw new Error(`${path} has more than 5,000 results`);
}

// An account named by its id, or by its name as the project declares it.
export async function cfAccount(account: string, queries: string[]): Promise<{ id: string; name: string; settings?: { enforce_twofactor?: boolean } }> {
  if (/^[a-f0-9]{32}$/.test(account)) {
    const r = await cf(`/accounts/${account}`, queries);
    if (r.status !== 200) throw new Error(`GET /accounts/${account} answered ${r.status}`);
    return r.result;
  }
  const found = (await cfAll(`/accounts?name=${encodeURIComponent(account)}`, queries)).filter((a) => a.name === account);
  if (found.length !== 1) throw new Error(`${found.length ? 'more than one' : 'no'} Cloudflare account named ${account} is visible to the token`);
  return found[0];
}

// Roles that administer the account: they can change its configuration or its members. A member granted access through
// member policies instead of roles is counted too: the policies' scope is not read, so completeness errs toward naming them.
export const CF_ADMIN_ROLES = ['Super Administrator - All Privileges', 'Administrator'];
export const cfIsAdmin = (m: any) => (m.roles ?? []).some((r: any) => CF_ADMIN_ROLES.includes(r.name)) || (!(m.roles ?? []).length && (m.policies ?? []).length > 0);

// Who may change the account: the people on the roster (the Open Autonomy team, where the workspace reads one) by their
// addresses, and the service accounts the systems register declares (kind "service account", named by the account's
// email), which are known actors but not people: the deploy pipeline's credential acts as one.
export function cloudflareRoster(root: string, ws: Workspace): { people: string[]; service_accounts: string[] } {
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const team = latest ? (JSON.parse(latest.text) as Snapshot).team.map((m) => m.id) : [];
  return { people: (ws.registers.people?.data.rows ?? []).filter((p) => !team.length || team.includes(p.id)).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean),
    service_accounts: (ws.registers.systems?.data.rows ?? []).filter((x) => /service account/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()).filter(Boolean) };
}

// Configuration changes to a Cloudflare account in the period, from its audit log: every entry, with who made it (the
// user whose API token or session it was), what it changed and the old and new value. A change by someone not on the
// roster, or by no one Cloudflare can name, is marked.
export async function collectCloudflareChanges(root: string, input: { account: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unnamed: number }> {
  const queries: string[] = [];
  cfAnswers.length = 0;
  const account = await cfAccount(input.account, queries);
  const entries = await cfAll(`/accounts/${account.id}/audit_logs?since=${input.start}T00:00:00Z&before=${nextDay(input.end)}T00:00:00Z&direction=asc`, queries);
  const ws = loadWorkspace(root);
  const roster = cloudflareRoster(root, ws);
  const emails = new Set(roster.people), services = new Set(roster.service_accounts);
  const val = (v: unknown) => v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  const rows = entries.map((x: any) => ({ at: String(x.when ?? ''), actor: String(x.actor?.email ?? ''), actor_on_roster: !x.actor?.email ? 'unknown' : emails.has(String(x.actor.email).toLowerCase()) ? 'yes' : services.has(String(x.actor.email).toLowerCase()) ? 'service account' : 'no',
    action: String(x.action?.type ?? ''), resource: `${x.resource?.type ?? ''} ${x.resource?.id ?? ''}`.trim(), zone: String(x.metadata?.zone_name ?? ''), old_value: val(x.oldValue), new_value: val(x.newValue), id: String(x.id ?? '') }));
  const stem = `evidence/files/populations/cloudflare-changes-${account.id.slice(0, 8)}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: 'https://api.cloudflare.com/client/v4', collected_at: now(), requests: [...cfAnswers] }, account, entries }, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['at', 'actor', 'actor_on_roster', 'action', 'resource', 'zone', 'old_value', 'new_value', 'id'], rows }), null);
  const unnamed = rows.filter((r) => r.actor_on_roster === 'no' || r.actor_on_roster === 'unknown').length;
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} configuration changes to Cloudflare account ${account.name}, ${input.start} to ${input.end}`, controls: ['OPS-04', 'AC-02'].filter((c) => applicable.has(c)), files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'cloudflare', query: `${queries.join('; ')} (all pages)` },
    notes: `Complete: every page of the account's audit log for the period. ${unnamed} made by someone not on the roster or not named. Raw responses: ${stem}.raw.json${cfAnswers.every((x) => x.cf_ray) ? ", with each answer's Date and cf-ray" : ", with each answer's Date; Cloudflare sent no cf-ray on some"}.`,
  });
  return { evidence, rows: rows.length, unnamed };
}
// Every API token the account's audit log records, from the log's first entry to the period's end: whose it is, who
// created and who revoked it, whether it was live at the period's end, and how many Worker deploys its owner made in the
// period. A token belongs to a user, and Cloudflare attributes what it does to that user, so a person's live token and
// a person's deploys are the credential that could reach production outside the pipeline.
export async function collectCloudflareTokens(root: string, input: { account: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; personal: number }> {
  const queries: string[] = [];
  cfAnswers.length = 0;
  const account = await cfAccount(input.account, queries);
  const entries = await cfAll(`/accounts/${account.id}/audit_logs?before=${nextDay(input.end)}T00:00:00Z&direction=asc`, queries);
  const ws = loadWorkspace(root);
  const roster = cloudflareRoster(root, ws);
  const kind = (email: string) => !email ? 'unknown' : roster.service_accounts.includes(email) ? 'service account' : roster.people.includes(email) ? 'person' : 'not on the roster';
  const owner = (x: any) => String((x.action?.type === 'delete' ? x.oldValue : x.newValue)?.owner ?? x.actor?.email ?? '').toLowerCase();
  const tokens = new Map<string, { token: string; owner: string; created_at: string; created_by: string; revoked_at: string; revoked_by: string }>();
  for (const x of entries.filter((x: any) => x.resource?.type === 'token')) {
    const id = String(x.resource.id);
    const t = tokens.get(id) ?? { token: id, owner: owner(x), created_at: '', created_by: '', revoked_at: '', revoked_by: '' };
    if (x.action?.type === 'create') { t.created_at = String(x.when); t.created_by = String(x.actor?.email ?? ''); }
    if (x.action?.type === 'delete') { t.revoked_at = String(x.when); t.revoked_by = String(x.actor?.email ?? ''); }
    tokens.set(id, t);
  }
  const deploys = (email: string) => entries.filter((x: any) => x.resource?.type === 'script' && String(x.actor?.email ?? '').toLowerCase() === email && String(x.when).slice(0, 10) >= input.start && String(x.when).slice(0, 10) <= input.end).length;
  const rows = [...tokens.values()].map((t) => ({ ...t, owner_kind: kind(t.owner), live_at_period_end: t.revoked_at && t.revoked_at.slice(0, 10) <= input.end ? 'no' : 'yes', owner_worker_deploys_in_period: String(deploys(t.owner)) }));
  const stem = `evidence/files/populations/cloudflare-tokens-${account.id.slice(0, 8)}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: 'https://api.cloudflare.com/client/v4', collected_at: now(), requests: [...cfAnswers] }, account, entries: entries.filter((x: any) => x.resource?.type === 'token' || x.resource?.type === 'script') }, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['token', 'owner', 'owner_kind', 'created_at', 'created_by', 'revoked_at', 'revoked_by', 'live_at_period_end', 'owner_worker_deploys_in_period'], rows }), null);
  const personal = rows.filter((r) => r.owner_kind !== 'service account' && r.live_at_period_end === 'yes').length;
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} Cloudflare API tokens of account ${account.name}, to ${input.end}`, controls: ['AC-05', 'AC-04'].filter((c) => applicable.has(c)), files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'cloudflare', query: `${queries.join('; ')} (all pages, from the log's first entry)` },
    notes: `Complete as far as the account's audit log reaches: every token created or revoked in it. ${personal} live at the period's end belong to someone other than a service account. Raw responses: ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length, personal };
}
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// What reached production on Cloudflare: every deployment of a Worker in the period, with who made it and the commit its
// version was built from (wrangler's workers/tag annotation, set to the commit by the deploy workflow), matched to the
// period's GitHub deployments by commit. A Cloudflare deployment no approved GitHub deployment accounts for reached
// production by another route; a GitHub deployment with no Cloudflare deployment never reached it.
export async function collectWorkerDeployments(root: string, input: { account: string; script: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unmatched: number }> {
  const queries: string[] = [];
  cfAnswers.length = 0;
  const account = await cfAccount(input.account, queries);
  const r = await cf(`/accounts/${account.id}/workers/scripts/${encodeURIComponent(input.script)}/deployments`, queries);
  if (r.status !== 200) throw new Error(`GET the deployments of Worker ${input.script} answered ${r.status}`);
  const deployments = ((r.result?.deployments ?? []) as any[]).filter((d) => { const at = String(d.created_on ?? '').slice(0, 10); return at >= input.start && at <= input.end; });
  const versions: Record<string, unknown> = {};
  for (const d of deployments) for (const v of d.versions ?? []) if (!versions[v.version_id]) {
    const got = await cf(`/accounts/${account.id}/workers/scripts/${encodeURIComponent(input.script)}/versions/${v.version_id}`, queries);
    versions[v.version_id] = got.status === 200 ? got.result : { unavailable: got.status };
  }
  // The period's GitHub deployments population, found by its collector's file.
  const ws = loadWorkspace(root);
  const gh = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/github-deployments-') && f.path.endsWith('.csv')) && x.data.period && x.data.period.start <= input.start && x.data.period.end >= input.end)
    .sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const ghCsv = gh?.data.files.find((f) => f.path.endsWith('.csv'));
  const ghRows = ghCsv ? parseCsv(readFileSync(join(root, ghCsv.path), 'utf8'), ghCsv.path).rows : [];
  const rows = deployments.map((d) => {
    const live = [...(d.versions ?? [])].sort((a: any, b: any) => b.percentage - a.percentage)[0];
    const v = versions[live?.version_id] as { annotations?: Record<string, string> } | undefined;
    const commit = v?.annotations?.['workers/tag'] ?? '';
    const match = commit ? ghRows.find((g) => g.sha === commit || g.sha.startsWith(commit)) : undefined;
    return { deployment: String(d.id), at: String(d.created_on ?? ''), author: String(d.author_email ?? ''), source: String(d.source ?? ''), version: String(live?.version_id ?? ''), commit, message: v?.annotations?.['workers/message'] ?? '',
      github_deployment: match?.id ?? '', github_ref: match?.ref ?? '', github_approved: match?.independent_approval ?? '', matched: !commit ? 'no commit recorded' : match ? 'yes' : 'no' };
  });
  const unshipped = ghRows.filter((g) => !rows.some((x) => x.commit && (g.sha === x.commit || g.sha.startsWith(x.commit))));
  const stem = `evidence/files/populations/cloudflare-worker-deployments-${input.script}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: 'https://api.cloudflare.com/client/v4', collected_at: now(), requests: [...cfAnswers] }, account, deployments, versions, github_population: gh?.data.id ?? null }, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['deployment', 'at', 'author', 'source', 'version', 'commit', 'message', 'github_deployment', 'github_ref', 'github_approved', 'matched'], rows }), null);
  const unmatched = rows.filter((x) => x.matched !== 'yes').length;
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} deployments of Worker ${input.script} on Cloudflare, ${input.start} to ${input.end}`, controls: ['CHG-03'].filter((c) => applicable.has(c)), files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'cloudflare', query: `${queries.slice(0, 2).join('; ')}; GET .../versions/{version_id} for each deployed version` },
    notes: `Complete: every deployment Cloudflare lists for the Worker in the period, matched by commit to ${gh ? `the GitHub deployments in ${gh.data.id}` : 'no GitHub deployments population (collect github-deployments first)'}. ${unmatched} reached production with no matching GitHub deployment; ${unshipped.length} GitHub deployment(s) (${unshipped.map((g) => g.ref).join(', ') || 'none'}) have no Cloudflare deployment. Raw responses: ${stem}.raw.json.`,
  });
  return { evidence, rows: rows.length, unmatched };
}
