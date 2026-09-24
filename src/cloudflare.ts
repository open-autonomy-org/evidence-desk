// Reads from Cloudflare's API v4 with the owner's own read-only token (CLOUDFLARE_API_TOKEN). Nothing is sent to
// Cloudflare but reads. Every request is recorded in the caller's query list so what was read can be shown.
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
