// Reads from Cloudflare's API v4 with the owner's own read-only token (CLOUDFLARE_API_TOKEN). Nothing is sent to
// Cloudflare but reads. Every request is recorded in the caller's query list so what was read can be shown.
import { writeCsv } from './csv.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
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

// Configuration changes to a Cloudflare account in the period, from its audit log: every entry, with who made it (the
// user whose API token or session it was), what it changed and the old and new value. A change by someone not on the
// roster, or by no one Cloudflare can name, is marked.
export async function collectCloudflareChanges(root: string, input: { account: string; start: string; end: string; by: string }): Promise<{ evidence: string; rows: number; unnamed: number }> {
  const queries: string[] = [];
  cfAnswers.length = 0;
  const account = await cfAccount(input.account, queries);
  const entries = await cfAll(`/accounts/${account.id}/audit_logs?since=${input.start}T00:00:00Z&before=${nextDay(input.end)}T00:00:00Z&direction=asc`, queries);
  const ws = loadWorkspace(root);
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const team = latest ? (JSON.parse(latest.text) as Snapshot).team.map((m) => m.id) : [];
  const emails = new Set((ws.registers.people?.data.rows ?? []).filter((p) => !team.length || team.includes(p.id)).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean));
  const val = (v: unknown) => v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  const rows = entries.map((x: any) => ({ at: String(x.when ?? ''), actor: String(x.actor?.email ?? ''), actor_on_roster: !x.actor?.email ? 'unknown' : emails.has(String(x.actor.email).toLowerCase()) ? 'yes' : 'no',
    action: String(x.action?.type ?? ''), resource: `${x.resource?.type ?? ''} ${x.resource?.id ?? ''}`.trim(), zone: String(x.metadata?.zone_name ?? ''), old_value: val(x.oldValue), new_value: val(x.newValue), id: String(x.id ?? '') }));
  const stem = `evidence/files/populations/cloudflare-changes-${account.id.slice(0, 8)}-${input.start}-${input.end}-${Date.now()}`;
  writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: 'https://api.cloudflare.com/client/v4', collected_at: now(), requests: [...cfAnswers] }, account, entries }, null, 2) + '\n', null);
  writeVersioned(root, `${stem}.csv`, writeCsv({ columns: ['at', 'actor', 'actor_on_roster', 'action', 'resource', 'zone', 'old_value', 'new_value', 'id'], rows }), null);
  const unnamed = rows.filter((r) => r.actor_on_roster !== 'yes').length;
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} configuration changes to Cloudflare account ${account.name}, ${input.start} to ${input.end}`, controls: ['OPS-04', 'AC-02'].filter((c) => applicable.has(c)), files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
    period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'cloudflare', query: `${queries.join('; ')} (all pages)` },
    notes: `Complete: every page of the account's audit log for the period. ${unnamed} made by someone not on the roster or not named. Raw responses: ${stem}.raw.json${cfAnswers.every((x) => x.cf_ray) ? ", with each answer's Date and cf-ray" : ", with each answer's Date; Cloudflare sent no cf-ray on some"}.`,
  });
  return { evidence, rows: rows.length, unnamed };
}
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
