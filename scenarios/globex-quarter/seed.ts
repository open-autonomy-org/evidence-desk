import { readFileSync } from 'node:fs';
// Seeds the GitHub and Cloudflare twins for the Globex quarter, through each vendor's API (and the twins' constructs
// for what vendors set only in their UI: personal tokens, the org two-factor setting, Cloudflare's bootstrap).
// Usage: bun seed.ts <step> <token|-> [args...]
const gh = 'https://api.github.com', cf = 'https://api.cloudflare.com/client/v4';
const ACCOUNT = 'e'.repeat(32), ZONE = 'f'.repeat(32);
async function call(method: string, path: string, body?: unknown, token = process.env.GITHUB_TOKEN) {
  const r = await fetch(gh + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/vnd.github+json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
// A Cloudflare call as a person (CF_AS holds their user API token) or with the World's shared token.
async function cfcall(method: string, path: string, body?: unknown) {
  const r = await fetch(cf + path, { method, headers: { authorization: `Bearer ${process.env.CF_AS || process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json() as any;
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j.errors)}`);
  return j.result;
}
const [step, token, a, b, c] = process.argv.slice(2);
// What wrangler deploy sends: the Worker's metadata (with wrangler's tag and message annotations) and its module.
async function wrangler(tag: string, message: string) {
  const form = new FormData();
  form.append('metadata', JSON.stringify({ main_module: 'index.js', compatibility_date: '2026-06-01', annotations: { ...(tag ? { 'workers/tag': tag } : {}), 'workers/message': message } }));
  // The module is what was built: the relay's source at the deployed commit, or whatever the deployer's checkout held.
  const module = process.env.WORKER_MODULE ? readFileSync(process.env.WORKER_MODULE, 'utf8') : 'export default { fetch() { return new Response("relay"); } };';
  form.append('index.js', new Blob([module], { type: 'application/javascript+module' }), 'index.js');
  const r = await fetch(`${cf}/accounts/${ACCOUNT}/workers/scripts/relay`, { method: 'PUT', headers: { authorization: `Bearer ${process.env.CF_AS || process.env.CLOUDFLARE_API_TOKEN}` }, body: form });
  if (!r.ok) throw new Error(`wrangler deploy ${r.status} ${(await r.text()).slice(0, 200)}`);
}
const T = token === '-' ? undefined : token;
if (step === 'org') {
  // Maya created the organization on github.com (the twin's door stands in for that page, which has no API).
  await call('POST', '/_twin/orgs', { login: 'globex', name: 'Globex', owner: 'maya-gx' });
  for (const [login, role] of [['maya-gx', 'admin'], ['sam-gx', 'admin']]) await call('PUT', `/orgs/globex/memberships/${login}`, { role });
  for (const name of ['relay', 'compliance']) await call('POST', '/orgs/globex/repos', { name, private: name === 'compliance' });
  await call('PUT', '/_twin/orgs/globex/two-factor-requirement', { enabled: true });
  console.log('org globex');
} else if (step === 'member') { // member <login> <role>
  await call('PUT', `/orgs/globex/memberships/${a}`, { role: b }); console.log('member', a, b);
} else if (step === 'token') {
  console.log((await call('POST', `/_twin/users/${a}/tokens`, {})).token);
} else if (step === 'protect') { // the ruleset and gated production environment the kit's setup would make
  await call('POST', '/repos/globex/relay/rulesets', { name: 'main-protected', target: 'branch', enforcement: 'active', conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    bypass_actors: [],
    rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'pull_request', parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false } },
      { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: 'test' }] } }] }, T);
  // The kit's tag rule: only an organization administrator creates, moves or deletes a deploy tag.
  await call('POST', '/repos/globex/relay/rulesets', { name: 'deploy-tags-admin-only', target: 'tag', enforcement: 'active', conditions: { ref_name: { include: ['refs/tags/deploy-v*'], exclude: [] } },
    bypass_actors: [{ actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' }], rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }] }, T);
  await call('PUT', '/repos/globex/relay/actions/workflows/deploy.yml', { name: 'Deploy relay', path: '.github/workflows/deploy.yml' }, T);
  const env = await call('PUT', '/repos/globex/relay/environments/production', { reviewers: [{ type: 'User', reviewer: { login: 'maya-gx' } }, { type: 'User', reviewer: { login: 'sam-gx' } }] }, T);
  console.log('env', env.id);
} else if (step === 'pr') { // pr <token> <repo> <branch> <title>
  const pr = await call('POST', `/repos/globex/${a}/pulls`, { title: c, head: b, base: 'main' }, T); console.log(pr.number);
} else if (step === 'approve') { await call('POST', `/repos/globex/${a}/pulls/${b}/reviews`, { event: 'APPROVE' }, T); console.log('approved', b);
} else if (step === 'merge') { console.log((await call('PUT', `/repos/globex/${a}/pulls/${b}/merge`, { merge_method: 'merge' }, T)).merged);
} else if (step === 'deploy') { // deploy <token of starter> <ref> <approver token> <env id>: the tag's run, its approval, the deployment it makes
  await call('POST', '/repos/globex/relay/actions/workflows/deploy.yml/dispatches', { ref: a }, T);
  const runs = (await call('GET', '/repos/globex/relay/actions/runs')).workflow_runs as any[];
  const run = runs.sort((x, y) => y.run_number - x.run_number)[0];
  await call('POST', `/repos/globex/relay/actions/runs/${run.id}/pending_deployments`, { environment_ids: [Number(c)], state: 'approved', comment: 'candidate verified' }, b);
  await call('POST', `/_twin/repos/globex/relay/actions/runs/${run.id}/complete`, { conclusion: 'success' });
  const d = await call('POST', '/repos/globex/relay/deployments', { ref: a, environment: 'production', auto_merge: false, required_contexts: [] }, T);
  await call('POST', `/repos/globex/relay/deployments/${d.id}/statuses`, { state: 'success', log_url: `https://github.com/globex/relay/actions/runs/${run.id}` }, T);
  // The run's job: wrangler deploy with the environment's Cloudflare token (Maya's, CF_AS), tagged with the commit.
  await wrangler(d.sha, a);
  console.log('deploy', a, run.id, d.sha.slice(0, 12));
} else if (step === 'cf') {
  const r = await fetch(`${process.env.CLOUDFLARE_TWIN_URL}/client/v4/twin/bootstrap`, { method: 'POST', headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({
    accounts: [{ id: ACCOUNT, name: 'globex-cloudflare', settings: { enforce_twofactor: true } }], zones: [{ id: ZONE, account_id: ACCOUNT, name: 'relay.globex.test' }],
    members: [{ account_id: ACCOUNT, email: 'maya@globex.test', roles: ['Super Administrator - All Privileges'], two_factor: true }, { account_id: ACCOUNT, email: 'sam@globex.test', roles: ['Administrator'], two_factor: true },
      // The deploy workflow's service account: it deploys Workers and administers nothing else.
      { account_id: ACCOUNT, email: 'deploy@globex.test', roles: ['Workers Admin'], two_factor: true }] }) });
  console.log('cloudflare', r.status);
} else if (step === 'ci') { // ci - <repo> <pr number>: the CI workflow's test job on the pull request's head
  const pr = await call('GET', `/repos/globex/${a}/pulls/${b}`);
  await call('POST', `/repos/globex/${a}/check-runs`, { name: 'test', head_sha: pr.head.sha, status: 'completed', conclusion: 'success', output: { title: 'test', summary: 'bun test: all passed' } });
  console.log('ci', b, pr.head.sha.slice(0, 12));
} else if (step === 'wrangler') { // wrangler - <message>: a deploy straight from someone's laptop, CF_AS their token, no commit tag
  await wrangler('', a); console.log('wrangler', a);
} else if (step === 'secret') { // secret <token> <name>: the production environment's secret set (or rotated) by that person
  await call('PUT', `/repos/globex/relay/environments/production/secrets/${a}`, { encrypted_value: Buffer.from(`${a}:${Date.now()}`).toString('base64'), key_id: 'twin' }, T);
  console.log('secret', a);
} else if (step === 'cfrevoke') { // cfrevoke -: revoke the token in CF_AS, as its owner does in the dashboard
  const id = String(process.env.CF_AS).slice(0, 12);
  await cfcall('DELETE', `/user/tokens/${id}`); console.log('revoked', id);
} else if (step === 'cftoken') { // cftoken - <email>: a person's Cloudflare API token, minted as in the dashboard
  console.log((await cfcall('POST', `/twin/users/${a}/tokens`)).token);
} else if (step === 'cfset') { console.log(a, (await cfcall('PATCH', `/zones/${ZONE}/settings/${a}`, { value: b })).value);
} else if (step === 'cfmembers') { for (const m of await cfcall('GET', `/accounts/${ACCOUNT}/members?per_page=50`)) console.log(`${m.user.email},${m.roles.map((r: any) => r.name).join(' + ')}`);
} else if (step === 'ghmembers') { const admins = new Set((await call('GET', '/orgs/globex/members?role=admin')).map((m: any) => m.login)); for (const m of await call('GET', '/orgs/globex/members?role=all')) console.log(`${m.login},${admins.has(m.login) ? 'admin' : 'member'}`);
} else if (step === 'nobypass') { // the ruleset's bypass list emptied: no one merges past the required review
  const rs = (await call('GET', '/repos/globex/relay/rulesets')).find((x: any) => x.name === 'main-protected');
  await call('PUT', `/repos/globex/relay/rulesets/${rs.id}`, { bypass_actors: [] }, T); console.log('bypass removed', rs.id);
} else throw new Error(`unknown step ${step}`);
