#!/usr/bin/env bun
// The evidence-desk command. Each subcommand reads the workspace fresh, calls one action and prints the result,
// as text for people or as JSON with --json for scripts and agents.
import { basename, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { addEvidence, adopt, approvePolicy, initWorkspace, saveRegisterRow, setPolicyOwner, setScope, unanswered, updateControl } from './actions.ts';
import { computeGaps } from './gaps.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { loadWorkspace, REGISTERS, type RegisterName } from './workspace.ts';
import { questions } from './catalog.ts';
import { serve } from './server.ts';
import { serveFirm } from './firm-server.ts';
import { decide, enableFramework, frameworkState, statementOfApplicability } from './frameworks.ts';
import { writeCsv } from './csv.ts';
import { buildTrustCenter, exportQuestionnaire, importQuestionnaire, reviewAnswer, staleLibrary } from './trust.ts';
import { decideAccount, openIncident, signOffAccessReview, startAccessReview, submitResponse, updateIncident } from './operations.ts';
import { computeObligations } from './obligations.ts';
import { collectAccessChanges } from './access.ts';
import { certifications, claimOf, recordCertification } from './certifications.ts';
import { recollect } from './recollect.ts';
import { collectRosterHistory, collectSeamRecords, importOpenAutonomy, readProject, seamFindings } from './open-autonomy.ts';
import { checkCompleteness, collectChanges, collectDeployments, collectAttribution, collectNonHumanAccess, collectRuleChanges, syncReminders } from './github.ts';
import { collectCloudflareChanges, collectCloudflareTokens, collectWorkerDeployments } from './cloudflare.ts';
import { COLLECTORS, checkTitle, ciWorkflow, configureCollector, readSettings, runChecks } from './automation.ts';
import { exceptionsRegister, respondToException, actOnRequest, createEngagement, draft, exportPackage, firmSummary, importRequests, importReturn, listRequests, readEngagement, verifyPackage } from './audit.ts';
import { clockDate } from './clock.ts';

const USAGE = `evidence-desk <command> <workspace> [options]

  init <dir> --org <name>                 create a workspace in a new or empty folder
  scope <dir> [--set key=value ...]       show or answer the scoping questions (booleans: true/false)
  adopt <dir>                             create the controls and policies the scope calls for
  controls <dir>                          list controls with owner, status and applicability
  control <dir> <id> [--owner <person>] [--status not-started|in-progress|implemented]
                     [--notes <text>] [--exclude <reason>] [--include]
  policies <dir>                          list policies and their approved versions
  policy <dir> <id> [--owner <person>] [--approve --by <person>]
  register <dir> <people|systems|vendors|risks|vulnerabilities> [--add key=value ...] [--update <id> key=value ...]
  evidence <dir> [--add --control <id>[,<id>] --file <path> --title <text> --by <person>
                 [--period <start>..<end>] [--subject <person>] [--source <kind>] [--source-name <name>] [--query <text>]]
  forms <dir>                             list the forms people complete
  form <dir> <id>                         show a form's questions
  respond <dir> <form> --person <id> --answer <question>=<answer> ...
                                          record a person's answers (graded; passing responses become evidence)
  obligations <dir> [--person <id>] [--as-of YYYY-MM-DD]   what is owed, by whom and when
  remind <dir> --repo <owner/name> --within <days>
                                          keep one issue per obligation overdue or due within the days, in the workspace's repository
  access-review <dir> start --system <id> --reviewer <person> --period <start>..<end> --listing <file> --generated-by <how>
  access-review <dir> <id> [--decide <account>=keep|remove|modify ...] [--done <account>=<date> ...]
                     [--person <account>=<person> ...] [--privileged <account>] [--sign-off --by <person>]
  access-reviews <dir>                    list access reviews
  incident <dir> new --title <text> --severity low|medium|high|critical --by <person> --note <text> [--owner <person>]
  incident <dir> <id> --by <person> --note <text> [--status open|contained|resolved|closed]
                     [--impact <text>] [--notification <text>] [--review <text>]
  incidents <dir>                         list incidents
  open-autonomy <dir> import --repo <checkout> [--commit <sha>] --by <person>
                                          read an Open Autonomy project's roster, agents, seams and rules at a commit
  open-autonomy <dir> completeness --account <id> --by <person> [--file <export> --generated-by <how>]
                                          compare a declared vendor account's administrators with the roster
  collect <dir> github-changes --repo <owner/name> --period <start>..<end> --by <person>
  collect <dir> github-deployments --repo <owner/name> --environment <name> --period <start>..<end> --by <person>
  collect <dir> github-rule-changes --repo <owner/name> --period <start>..<end> --by <person>
                                          populations from GitHub with their queries (needs GITHUB_TOKEN)
  collect <dir> cloudflare-tokens --account <id or name> --period <start>..<end> --by <person>
                                          every API token the audit log records: owner, created, revoked, live at the end
  collect <dir> cloudflare-changes --account <id or name> --period <start>..<end> --by <person>
                                          the account's audit log: who changed what (needs CLOUDFLARE_API_TOKEN)
  collect <dir> cloudflare-deployments --account <id or name> --script <worker> --period <start>..<end> --by <person>
                                          what reached production on Cloudflare, matched to the GitHub deployments
  collect <dir> access-changes --period <start>..<end> --by <person>
                                          accounts added, removed or re-roled on GitHub and Cloudflare, day by day
  collect <dir> roster-history --repo <checkout> --period <start>..<end> --by <person>
                                          every change to the Open Autonomy roster, from git
  collect <dir> seam-records --repo <checkout> --period <start>..<end> --by <person>
                                          the acts an Open Autonomy project records under records/, from git
  collect <dir> nonhuman-access --repo <owner/name> --org <org> [--environment <name>] --by <person>
                                          deploy keys, secrets, app installations and agents with access (needs GITHUB_TOKEN)
  collect <dir> attribution --repo <owner/name of the workspace's repository> --by <person>
                                          whether each signed act was merged from its person's own GitHub pull request
  collectors <dir> [<id> [--enable|--disable] [--set key=value ...]]
                                          show or configure the collectors (github)
  run <dir> --by <person> [--collector <id>]  collect from each enabled collector and run its checks; exits 3 if a check fails
  checks <dir>                            the latest result of every check
  ci-template <dir>                       write .github/workflows/evidence-desk.yml to run the checks daily
  audit <dir> new <id> --type type1|type2 --firm <name> (--as-of <date> | --period <start>..<end>)
  audit <dir> <id>                        the engagement and its requests
  audit <dir> <id> requests --import <csv>   the firm's request list (id, title, kind, controls)
  audit <dir> <id> request <request> --side client|firm --by <who> [--text <message>] [--status <status>]
                     [--evidence <id>,...] [--population <evidence id>] [--select <item>,...]
                     [--sample <item>=provided|exception] [--sample-evidence <item>=<evidence id>]
  audit <dir> <id> draft description|assertion|bridge [--to <date>]
  audit <dir> <id> exceptions              the exceptions register the package will carry, and which are answered
  audit <dir> <id> exception <key> --response <text> --by <person> [--cite <workspace file> ...]
                                          management's response to an exception the package lists
  audit <dir> <id> export --out <folder>  a package of exactly what the requests point at, with hashes
  audit <dir> <id> import-return <folder> bring the firm's responses in from a returned package
  audit verify <package folder>           check a package's files against its manifest, offline
  audit recollect <package folder> [--repo <owner/name> [--environment <name>]] [--account <id> [--script <worker>]]
                                          read the populations again with the firm's own GITHUB_TOKEN and
                                          CLOUDFLARE_API_TOKEN, and compare them row by row with the package's
  firm <firm.json> [--serve [--port <n>]] each client's engagements, requests and readiness, client by client
  audit package-serve <package folder> [--port <n>]   the firm's page for answering a received package
  trust <dir> build --out <folder>        build the static trust center from what trust.json allows
  questionnaire <dir> import <csv> --name <name>   draft answers from workspace facts, citing them
  questionnaire <dir> <id>                the questions, answers, sources and review state
  questionnaire <dir> <id> answer <question> --answer <text> --by <person> [--source <path>,...]
  questionnaire <dir> <id> export --out <csv>   reviewed answers filled in, every row with its status
  answers <dir> [--stale]                 the library of reviewed answers (--stale: those whose facts changed)
  certifications <dir> [add --framework <name> --kind "audit report"|certificate|self-attestation --issuer <name>
                 --issued-on <date> [--period <start>..<end>] [--valid-until <date>] --file <document> --by <person>]
                                          the attested documents the organization holds: the only ground for
                                          saying it was audited or certified
  frameworks <dir> [enable iso27001]      the frameworks the program follows
  framework <dir> iso27001                each requirement: ready, with gaps, excluded, or not addressed
  framework <dir> iso27001 exclude <requirement> --reason <text> | include <requirement> | map <requirement> --controls <id>,...
  soa <dir> --out <file.csv|file.md>      the ISO 27001 statement of applicability
  gaps <dir> [--as-of YYYY-MM-DD]         what stands between the workspace and readiness
  validate <dir>                          check every file against its schema and references
  serve <dir> [--port <n>]                open the local app on 127.0.0.1

  --json   print JSON instead of text`;

type Args = { pos: string[]; flags: Map<string, string[]> };
function parse(argv: string[]): Args {
  const pos: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    const vals = flags.get(key) ?? [];
    if (['set', 'add', 'update'].includes(key)) {
      while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) vals.push(argv[++i]);
    } else if (!['json', 'approve', 'include', 'help', 'sign-off', 'enable', 'disable', 'serve', 'stale'].includes(key)) {
      if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
      vals.push(argv[++i]);
    }
    flags.set(key, vals);
  }
  return { pos, flags };
}
const one = (a: Args, k: string): string | undefined => a.flags.get(k)?.at(-1);
const pairs = (vals: string[]): Record<string, string> => Object.fromEntries(vals.map((v) => {
  const i = v.indexOf('=');
  if (i < 1) throw new Error(`${v} is not key=value`);
  return [v.slice(0, i), v.slice(i + 1)];
}));

function out(json: boolean, data: unknown, text: () => string): void {
  console.log(json ? JSON.stringify(data, null, 2) : text());
}

async function main(argv: string[]): Promise<number> {
  const a = parse(argv);
  const [cmd, dirArg, ...rest] = a.pos;
  if (!cmd || a.flags.has('help')) { console.log(USAGE); return cmd ? 0 : 2; }
  if (!dirArg) throw new Error(`${cmd} needs a workspace folder\n\n${USAGE}`);
  const dir = resolve(dirArg);
  const json = a.flags.has('json');

  switch (cmd) {
    case 'init': {
      const org = one(a, 'org');
      if (!org) throw new Error('init needs --org <name>');
      initWorkspace(dir, org);
      out(json, { created: dir }, () => `Created a workspace for ${org} in ${dir}.\nNext: evidence-desk scope ${dirArg} --set key=value ... (run it without --set to see the questions)`);
      return 0;
    }
    case 'scope': {
      const sets = a.flags.get('set');
      if (sets) {
        const cur = readVersioned(dir, 'scope.json');
        if (!cur) throw new Error('scope.json is missing');
        const answers: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(pairs(sets))) {
          const q = questions.find((x) => x.id === k);
          answers[k] = q?.type === 'boolean' ? (v === 'true' ? true : v === 'false' ? false : v) : v;
        }
        setScope(dir, answers, cur.version);
      }
      const ws = loadWorkspace(dir);
      const answers = ws.scope?.data.answers ?? {};
      const left = ws.scope ? unanswered(ws.scope.data) : questions.map((q) => q.id);
      out(json, { answers, unanswered: left }, () => questions.map((q) =>
        `${q.id.padEnd(27)} ${answers[q.id] === undefined || answers[q.id] === '' ? '(unanswered)' : JSON.stringify(answers[q.id])}\n${''.padEnd(28)}${q.prompt}`).join('\n') +
        (left.length ? `\n\n${left.length} required question(s) unanswered.` : `\n\nAll questions answered. Next: evidence-desk adopt ${dirArg}`));
      return 0;
    }
    case 'adopt': {
      const r = adopt(dir);
      out(json, r, () => `Controls created: ${r.created.length}. Applicability changed: ${r.changed.length}${r.changed.length ? ` (${r.changed.join(', ')})` : ''}. Policies created: ${r.policies.length}. Forms created: ${r.forms.length}.`);
      return 0;
    }
    case 'controls': {
      const ws = loadWorkspace(dir);
      const rows = ws.controls.map((c) => c.data);
      out(json, rows, () => rows.map((c) => `${c.id.padEnd(9)} ${(c.applicable ? c.status : 'excluded').padEnd(12)} ${(c.owner || '-').padEnd(12)} ${c.title}`).join('\n') || 'No controls yet.');
      return 0;
    }
    case 'control': {
      const id = rest[0];
      if (!id) throw new Error('control needs an id');
      const rel = `controls/${id}.json`;
      const cur = readVersioned(dir, rel);
      if (!cur) throw new Error(`${rel} does not exist`);
      const patch: Record<string, unknown> = {};
      for (const k of ['owner', 'status', 'notes']) if (a.flags.has(k)) patch[k] = one(a, k);
      if (a.flags.has('exclude')) { patch.applicable = false; patch.exclusion_reason = one(a, 'exclude'); }
      if (a.flags.has('include')) patch.applicable = true;
      if (Object.keys(patch).length) updateControl(dir, id, patch, cur.version);
      const c = JSON.parse(readVersioned(dir, rel)!.text);
      out(json, c, () => JSON.stringify(c, null, 2));
      return 0;
    }
    case 'policies': {
      const ws = loadWorkspace(dir);
      const rows = ws.policies.map((p) => ({ id: p.data.id, title: p.data.title, owner: p.data.owner, approved: p.data.versions.at(-1) ?? null,
        changed_since_approval: !!p.data.versions.length && p.text?.version !== p.data.versions.at(-1)!.sha256 }));
      out(json, rows, () => rows.map((p) => `${p.id.padEnd(26)} ${(p.owner || '-').padEnd(12)} ${p.approved ? `v${p.approved.version} by ${p.approved.approved_by}${p.changed_since_approval ? ' (edited since)' : ''}` : 'not approved'}`).join('\n'));
      return 0;
    }
    case 'policy': {
      const id = rest[0];
      if (!id) throw new Error('policy needs an id');
      if (a.flags.has('owner')) setPolicyOwner(dir, id, one(a, 'owner')!, readVersioned(dir, `policies/${id}.json`)!.version);
      if (a.flags.has('approve')) {
        const by = one(a, 'by');
        if (!by) throw new Error('--approve needs --by <person>');
        const text = readVersioned(dir, `policies/${id}.md`);
        const rec = readVersioned(dir, `policies/${id}.json`);
        if (!text || !rec) throw new Error(`policy ${id} does not exist`);
        const v = approvePolicy(dir, id, by, text.version, rec.version);
        out(json, { id, version: v }, () => `Approved ${id} version ${v} (text sha256 ${text.version}).`);
        return 0;
      }
      const rec = readVersioned(dir, `policies/${id}.json`);
      if (!rec) throw new Error(`policy ${id} does not exist`);
      out(json, JSON.parse(rec.text), () => rec.text.trim());
      return 0;
    }
    case 'register': {
      const name = rest[0] as RegisterName;
      if (!REGISTERS.includes(name)) throw new Error(`register needs one of: ${REGISTERS.join(', ')}`);
      const version = () => readVersioned(dir, `registers/${name}.csv`)!.version;
      if (a.flags.has('add')) saveRegisterRow(dir, name, pairs(a.flags.get('add')!), version());
      if (a.flags.has('update')) {
        const [target, ...kv] = a.flags.get('update')!;
        const ws = loadWorkspace(dir);
        const row = ws.registers[name]?.data.rows.find((r) => r.id === target);
        if (!row) throw new Error(`${target} is not in registers/${name}.csv`);
        saveRegisterRow(dir, name, { ...row, ...pairs(kv) }, version(), target);
      }
      const t = loadWorkspace(dir).registers[name];
      out(json, t?.data.rows ?? [], () => t ? [t.data.columns.join(' | '), ...t.data.rows.map((r) => t.data.columns.map((c) => r[c]).join(' | '))].join('\n') : 'unreadable');
      return 0;
    }
    case 'evidence': {
      if (a.flags.has('add')) {
        const period = one(a, 'period');
        const [start, end] = period ? period.split('..') : [];
        if (period && (!start || !end)) throw new Error('--period is <start>..<end>, for example 2026-07-01..2026-09-30');
        const kind = one(a, 'source') ?? 'manual';
        const id = addEvidence(dir, {
          title: one(a, 'title') ?? '', controls: (one(a, 'control') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          files: a.flags.get('file') ?? [], recorded_by: one(a, 'by') ?? '', period: period ? { start, end } : undefined,
          source: { kind, ...(one(a, 'source-name') ? { name: one(a, 'source-name') } : {}), ...(one(a, 'query') ? { query: one(a, 'query') } : {}) },
          notes: one(a, 'notes'), subject: one(a, 'subject'),
        });
        out(json, { id }, () => `Recorded ${id}.`);
        return 0;
      }
      const ws = loadWorkspace(dir);
      const rows = ws.evidence.map((e) => e.data);
      out(json, rows, () => rows.map((e) => `${e.id}  ${e.collected_at.slice(0, 10)}  ${e.controls.join(',').padEnd(16)} ${e.title}`).join('\n') || 'No evidence recorded.');
      return 0;
    }
    case 'forms': {
      const ws = loadWorkspace(dir);
      const rows = ws.forms.map((f) => ({ id: f.data.id, title: f.data.title, kind: f.data.kind, recurrence: f.data.recurrence, controls: f.data.controls }));
      out(json, rows, () => rows.map((f) => `${f.id.padEnd(32)} ${f.kind.padEnd(15)} ${f.recurrence.padEnd(22)} ${f.title}`).join('\n') || 'No forms yet. Adopt the control set first.');
      return 0;
    }
    case 'form': {
      const f = loadWorkspace(dir).forms.find((x) => x.data.id === rest[0]);
      if (!f) throw new Error(`form ${rest[0]} does not exist`);
      out(json, f.data, () => [f.data.title, f.data.intro ?? '', ...f.data.questions.map((q) => `  ${q.id}: ${q.prompt}${q.options ? `\n    options: ${q.options.join(' | ')}` : q.type === 'text' ? '' : ' (yes/no)'}`)].filter(Boolean).join('\n'));
      return 0;
    }
    case 'respond': {
      const form = rest[0];
      const person = one(a, 'person');
      if (!form || !person) throw new Error('respond needs a form id and --person');
      const f = loadWorkspace(dir).forms.find((x) => x.data.id === form);
      if (!f) throw new Error(`form ${form} does not exist`);
      const r = submitResponse(dir, { form, person, answers: pairs(a.flags.get('answer') ?? []), formVersion: f.version, identity: 'cli' });
      out(json, r, () => `Recorded ${r.id}: ${r.passed ? 'passed' : 'not passed'}${r.score !== undefined ? ` (${r.score}%)` : ''}.`);
      return 0;
    }
    case 'obligations': {
      const asOf = one(a, 'as-of');
      const who = one(a, 'person');
      const list = computeObligations(loadWorkspace(dir), asOf ? new Date(`${asOf}T23:59:59Z`) : clockDate()).filter((o) => !who || o.who === who);
      out(json, list, () => list.map((o) => `${o.state.padEnd(8)} ${o.due}  ${(o.who || '-').padEnd(10)} ${o.what}${o.controls.length ? ` [${o.controls.join(', ')}]` : ''}`).join('\n') || 'Nothing owed.');
      return 0;
    }
    case 'access-review': {
      if (rest[0] === 'start') {
        const [start, end] = (one(a, 'period') ?? '').split('..');
        let listing = one(a, 'listing') ?? '';
        if (!start || !end || !listing) throw new Error('start needs --period <start>..<end> and --listing <file>');
        if (!(one(a, 'generated-by') ?? '').trim()) throw new Error('say how the user listing was produced (--generated-by: a query, an export or a screenshot), so its completeness can be checked');
        if (!existsSync(`${dir}/${listing}`)) {
          const rel = `evidence/files/listings/${Date.now()}-${basename(listing)}`;
          writeVersioned(dir, rel, readFileSync(resolve(listing)), null);
          listing = rel;
        }
        const id = startAccessReview(dir, { system: one(a, 'system') ?? '', reviewer: one(a, 'reviewer') ?? '', start, end, listing, generated_by: one(a, 'generated-by') ?? '' });
        out(json, { id }, () => `Started ${id}.`);
        return 0;
      }
      const id = rest[0];
      const rel = `reviews/access/${id}.json`;
      const version = () => { const v = readVersioned(dir, rel); if (!v) throw new Error(`${rel} does not exist`); return v.version; };
      for (const [acct, decision] of Object.entries(pairs(a.flags.get('decide') ?? []))) decideAccount(dir, id, version(), acct, { decision });
      for (const [acct, done_on] of Object.entries(pairs((a.flags.get('done') ?? [])))) decideAccount(dir, id, version(), acct, { decision: JSON.parse(readVersioned(dir, rel)!.text).accounts.find((x: { account: string }) => x.account === acct)?.decision, done_on });
      for (const [acct, person] of Object.entries(pairs(a.flags.get('person') ?? []))) decideAccount(dir, id, version(), acct, { decision: JSON.parse(readVersioned(dir, rel)!.text).accounts.find((x: { account: string }) => x.account === acct)?.decision, person });
      for (const acct of a.flags.get('privileged') ?? []) decideAccount(dir, id, version(), acct, { decision: JSON.parse(readVersioned(dir, rel)!.text).accounts.find((x: { account: string }) => x.account === acct)?.decision, privileged: true });
      if (a.flags.has('sign-off')) signOffAccessReview(dir, id, version(), one(a, 'by') ?? '');
      const r = JSON.parse(readVersioned(dir, rel)!.text);
      out(json, r, () => `${r.id} ${r.system} ${r.status}\n` + r.accounts.map((x: { account: string; decision: string; done_on?: string }) => `  ${x.account.padEnd(24)} ${x.decision}${x.done_on ? ` (done ${x.done_on})` : ''}`).join('\n'));
      return 0;
    }
    case 'access-reviews': {
      const rows = loadWorkspace(dir).accessReviews.map((r) => r.data);
      out(json, rows, () => rows.map((r) => `${r.id}  ${r.system.padEnd(16)} ${r.period.start}..${r.period.end}  ${r.status}`).join('\n') || 'No access reviews yet.');
      return 0;
    }
    case 'incident': {
      if (rest[0] === 'new') {
        const id = openIncident(dir, { title: one(a, 'title') ?? '', severity: one(a, 'severity') ?? '', by: one(a, 'by') ?? '', note: one(a, 'note') ?? '', owner: one(a, 'owner') });
        out(json, { id }, () => `Opened ${id}.`);
        return 0;
      }
      const id = rest[0];
      const cur = readVersioned(dir, `incidents/${id}.json`);
      if (!cur) throw new Error(`incidents/${id}.json does not exist`);
      updateIncident(dir, id, cur.version, { by: one(a, 'by') ?? '', note: one(a, 'note') ?? '', status: one(a, 'status') as never,
        customer_impact: one(a, 'impact'), notification: one(a, 'notification'), review: one(a, 'review') });
      const r = JSON.parse(readVersioned(dir, `incidents/${id}.json`)!.text);
      out(json, r, () => `${r.id} ${r.status}: ${r.title}`);
      return 0;
    }
    case 'incidents': {
      const rows = loadWorkspace(dir).incidents.map((r) => r.data);
      out(json, rows, () => rows.map((r) => `${r.id}  ${r.severity.padEnd(8)} ${r.status.padEnd(9)} ${r.title}`).join('\n') || 'No incidents recorded.');
      return 0;
    }
    case 'open-autonomy': {
      if (rest[0] === 'import') {
        const repo = one(a, 'repo');
        if (!repo) throw new Error('import needs --repo <path to the project checkout>');
        const r = importOpenAutonomy(dir, resolve(repo), one(a, 'commit') ?? 'HEAD', one(a, 'by') ?? '');
        out(json, r, () => [`Read ${r.commit.slice(0, 12)} into ${r.snapshot}.`,
          r.added.length ? `Filled: ${r.added.join(', ')}.` : 'Nothing new to fill.',
          ...r.changed.map((c) => `Changed: ${c}`), ...r.conflicts.map((c) => `Differs: ${c}`), ...r.seams.map((c) => `Seam: ${c}`),
          r.evidence ? (r.evidence_existing ? `The declarations are unchanged since ${r.evidence} recorded them.` : `Recorded ${r.evidence}.`) : 'None of the controls the declarations evidence is adopted yet, so they are not recorded as evidence: import again after adopt.'].filter(Boolean).join('\n'));
        return 0;
      }
      if (rest[0] === 'completeness') {
        const r = await checkCompleteness(dir, { account: one(a, 'account') ?? '', by: one(a, 'by') ?? '', file: one(a, 'file'), generated_by: one(a, 'generated-by') });
        out(json, r, () => r.outside.length ? `Outside the roster: ${r.outside.join(', ')} (${r.record}).` : `Every administrator is on the roster (${r.record}).`);
        return 0;
      }
      if (rest[0] === 'show') {
        const snap = readProject(resolve(one(a, 'repo') ?? '.'), one(a, 'commit') ?? 'HEAD');
        out(json, snap, () => [`${snap.account} at ${snap.commit.slice(0, 12)}`, ...snap.team.map((m) => `  person ${m.id}: ${m.scopes.join(', ') || 'no scopes'}`),
          ...snap.agents.map((g) => `  agent ${g.profile}: ${g.models.map((m) => m.model).join(', ')}; jobs ${g.jobs.map((j) => `${j.name} (${j.schedule})`).join(', ') || 'none'}`),
          ...(snap.seams ?? []).map((x) => `  seam ${x.id}: ${x.scope} via ${x.door} → ${x.record}`), ...seamFindings(snap).map((f) => `  finding: ${f}`)].join('\n'));
        return 0;
      }
      throw new Error('open-autonomy needs import, completeness or show');
    }
    case 'remind': {
      const asOf = one(a, 'as-of');
      const within = Number(one(a, 'within'));
      if (!Number.isInteger(within) || within < 0) throw new Error('remind needs --within <days>: how far ahead an obligation is worth a reminder');
      const r = await syncReminders(dir, { repo: one(a, 'repo') ?? '', within, ...(asOf ? { asOf: new Date(`${asOf}T00:00:00Z`) } : {}) });
      out(json, r, () => [`Reminders: ${r.opened.length} opened, ${r.retitled.length} retitled, ${r.closed.length} closed, ${r.kept} unchanged.`, ...r.opened.map((t) => `  opened: ${t}`), ...r.retitled.map((t) => `  retitled: ${t}`), ...r.closed.map((t) => `  closed: ${t}`)].join('\n'));
      return 0;
    }
    case 'collect': {
      if (rest[0] === 'attribution') {
        const r = await collectAttribution(dir, { repo: one(a, 'repo') ?? '', by: one(a, 'by') ?? '' });
        const bad = r.rows.filter((x) => x.status !== 'verified');
        out(json, r, () => [`${r.rows.length - bad.length} of ${r.rows.length} signed acts recorded by the person's own GitHub account (${r.record}, ${r.file}).`, ...bad.map((x) => `  ${x.person || '(no one)'}: ${x.label}: ${x.status}${x.author ? ` (${x.author})` : ''}`)].join('\n'));
        return 0;
      }
      if (rest[0] === 'nonhuman-access') {
        const r = await collectNonHumanAccess(dir, { repo: one(a, 'repo') ?? '', org: one(a, 'org') ?? '', environment: one(a, 'environment') ?? 'production', by: one(a, 'by') ?? '' });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} non-human identities.`);
        return 0;
      }
      const [start, end] = (one(a, 'period') ?? '').split('..');
      if (!start || !end) throw new Error('collect needs --period <start>..<end>');
      const by = one(a, 'by') ?? '';
      const repo = one(a, 'repo') ?? '';
      if (rest[0] === 'github-changes') {
        const r = await collectChanges(dir, { repo, start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} changes (${r.direct} direct pushes); ${r.notIndependent} without an independent approval; independence unknown for ${r.unknown}.`);
        return 0;
      }
      if (rest[0] === 'github-deployments') {
        const r = await collectDeployments(dir, { repo, environment: one(a, 'environment') ?? 'production', start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} deployments; ${r.unapproved} without an independent approval of the environment.`);
        return 0;
      }
      if (rest[0] === 'access-changes') {
        const r = collectAccessChanges(dir, { start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} access changes on GitHub and Cloudflare.`);
        return 0;
      }
      if (rest[0] === 'roster-history') {
        const r = collectRosterHistory(dir, { repo: resolve(one(a, 'repo') ?? '.'), start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} roster changes.`);
        return 0;
      }
      if (rest[0] === 'seam-records') {
        const r = collectSeamRecords(dir, { repo: resolve(one(a, 'repo') ?? '.'), start, end, by });
        out(json, r, () => r.populations.map((p) => `${p.evidence ? `Recorded ${p.evidence}` : `Wrote ${p.file} (no applicable control; adopt the controls first)`}: ${p.rows} ${p.seam} records${p.findings.length ? `; ${p.findings.join('; ')}` : ''}.`).join('\n'));
        return 0;
      }
      if (rest[0] === 'github-rule-changes') {
        const r = await collectRuleChanges(dir, { repo, start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} ruleset changes; ${r.weakening} weakened the rules.`);
        return 0;
      }
      if (rest[0] === 'cloudflare-tokens') {
        const r = await collectCloudflareTokens(dir, { account: one(a, 'account') ?? '', start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} Cloudflare API tokens; ${r.personal} live at the period's end belong to someone other than a service account.`);
        return 0;
      }
      if (rest[0] === 'cloudflare-changes') {
        const r = await collectCloudflareChanges(dir, { account: one(a, 'account') ?? '', start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} Cloudflare configuration changes; ${r.unnamed} by someone not on the roster or not named.`);
        return 0;
      }
      if (rest[0] === 'cloudflare-deployments') {
        const r = await collectWorkerDeployments(dir, { account: one(a, 'account') ?? '', script: one(a, 'script') ?? '', start, end, by });
        out(json, r, () => `Recorded ${r.evidence}: ${r.rows} Worker deployments; ${r.unmatched} with no matching GitHub deployment.`);
        return 0;
      }
      throw new Error('collect needs github-changes, github-deployments, github-rule-changes, cloudflare-changes, cloudflare-tokens, cloudflare-deployments, access-changes, roster-history, seam-records or attribution');
    }
    case 'collectors': {
      if (rest[0]) configureCollector(dir, rest[0], { ...(a.flags.has('enable') ? { enabled: true } : a.flags.has('disable') ? { enabled: false } : {}), ...(a.flags.has('set') ? { params: pairs(a.flags.get('set')!) } : {}) });
      const { settings } = readSettings(dir);
      const rows = COLLECTORS.map((c) => ({ id: c.id, title: c.title, enabled: settings.find((s) => s.id === c.id)?.enabled ?? false, params: settings.find((s) => s.id === c.id)?.params ?? {},
        takes: c.params.map((p) => p.name), credentials: c.credentials, checks: c.checks.map((k) => k.id) }));
      out(json, rows, () => rows.map((r) => `${r.id.padEnd(8)} ${r.enabled ? 'enabled ' : 'disabled'} ${r.title}\n         params: ${r.takes.map((t) => `${t}=${r.params[t] ?? ''}`).join(' ')}\n         credentials: ${r.credentials.join(', ')}\n         checks: ${r.checks.join(', ')}`).join('\n'));
      return 0;
    }
    case 'run': {
      const r = await runChecks(dir, one(a, 'by') ?? '', one(a, 'collector'));
      out(json, r, () => [`Run ${r.id}:`, ...r.collectors.map((c) => `  ${c.id}: ${c.status}${c.error ? ` (${c.error})` : ''}`), ...r.results.map((x) => `  ${x.status.padEnd(5)} ${checkTitle(x.check)}: ${x.detail}`)].join('\n'));
      return r.results.some((x) => x.status === 'fail') ? 3 : 0;
    }
    case 'checks': {
      const ws = loadWorkspace(dir);
      const latest = new Map<string, { status: string; detail: string; at: string }>();
      for (const run of [...ws.runs].sort((x, y) => x.data.started_at.localeCompare(y.data.started_at))) for (const x of run.data.results) latest.set(x.check, { status: x.status, detail: x.detail, at: run.data.started_at });
      const rows = [...latest].map(([check, v]) => ({ check, title: checkTitle(check), ...v }));
      out(json, rows, () => rows.map((r) => `${r.status.padEnd(5)} ${r.at.slice(0, 16)}  ${r.title}: ${r.detail}`).join('\n') || 'No checks have run.');
      return 0;
    }
    case 'ci-template': {
      const rel = '.github/workflows/evidence-desk.yml';
      writeVersioned(dir, rel, ciWorkflow(readSettings(dir).settings), readVersioned(dir, rel)?.version ?? null);
      out(json, { written: rel }, () => `Wrote ${rel}. Add the secrets it names to the workspace repository and set its EVIDENCE_DESK_RECORDER variable to a person id.`);
      return 0;
    }
    case 'audit': {
      if (dirArg && rest.length === 0 && existsSync(resolve(dirArg, 'manifest.json')) && !existsSync(resolve(dirArg, 'evidence-desk.json'))) throw new Error('to check a package, run: evidence-desk audit verify <package folder>');
      if (dirArg === 'package-serve') { serveFirm('package', resolve(rest[0] ?? ''), Number(one(a, 'port') ?? 4880)); return -1; }
      if (cmd === 'audit' && dirArg === 'recollect') {
        const r = await recollect(resolve(rest[0] ?? ''), { repo: one(a, 'repo'), environment: one(a, 'environment'), account: one(a, 'account'), script: one(a, 'script') });
        out(json, r, () => r.map((x) => `${x.population}: packaged ${x.packaged}, read again ${x.recollected}${x.only_packaged.length ? `; only in the package: ${x.only_packaged.join(', ')}` : ''}${x.only_recollected.length ? `; missing from the package: ${x.only_recollected.join(', ')}` : ''}${x.differing.length ? `; different: ${x.differing.join(', ')}` : ''}${!x.only_packaged.length && !x.only_recollected.length && !x.differing.length ? '; identical' : ''}`).join('\n') || 'Nothing to compare: name --repo and/or --account.');
        return r.some((x) => x.only_packaged.length || x.only_recollected.length || x.differing.length) ? 1 : 0;
      }
      if (cmd === 'audit' && dirArg === 'verify') {
        const r = verifyPackage(resolve(rest[0] ?? ''));
        out(json, r, () => r.ok ? `Verified: all ${r.files} files match the manifest, and nothing unlisted is present.\nPackage digest (SHA-256 of manifest.json): ${r.digest}` : `Does not verify:\n  ${r.problems.join('\n  ')}`);
        return r.ok ? 0 : 1;
      }
      const [id, action, ...more] = rest;
      if (id === 'new') {
        const [start, end] = (one(a, 'period') ?? '').split('..');
        createEngagement(dir, { id: action ?? '', type: (one(a, 'type') ?? '') as 'type1' | 'type2', firm: one(a, 'firm') ?? '', as_of: one(a, 'as-of'), start, end, contact: one(a, 'contact') });
        out(json, { id: action }, () => `Created engagement ${action}.`);
        return 0;
      }
      if (!id) throw new Error('audit needs an engagement id, new, or verify');
      if (!action) {
        const e = readEngagement(dir, id).data;
        const reqs = listRequests(dir, id).map((r) => r.data);
        out(json, { engagement: e, requests: reqs }, () => [`${e.id}: ${e.type === 'type1' ? `Type 1 as of ${e.as_of}` : `Type 2, ${e.period!.start} to ${e.period!.end}`}, ${e.firm}, ${e.status}`,
          ...reqs.map((r) => `  ${r.id.padEnd(10)} ${r.status.padEnd(9)} ${r.kind.padEnd(10)} ${r.title}${r.samples?.length ? ` [${r.samples.map((x) => `${x.item}:${x.status}`).join(', ')}]` : ''}`)].join('\n'));
        return 0;
      }
      if (action === 'exceptions') {
        const rows = exceptionsRegister(dir, id);
        out(json, rows, () => rows.map((x) => `${x.response ? 'answered  ' : 'UNANSWERED'} ${x.key}\n           ${x.item}: ${x.detail}`).join('\n') || 'No exceptions.');
        return 0;
      }
      if (action === 'exception') {
        const key = rest[2];
        if (!key) throw new Error('exception needs the exception key from the package\'s review/exceptions.csv');
        const r = respondToException(dir, id, key, one(a, 'response') ?? '', one(a, 'by') ?? '', a.flags.get('cite') ?? []);
        out(json, r, () => `Recorded management's response to ${key} in ${r.file}.`);
        return 0;
      }
      if (action === 'requests') {
        const f = one(a, 'import');
        if (!f) throw new Error('requests needs --import <csv>');
        const r = importRequests(dir, id, f);
        out(json, r, () => `Imported ${r.added.length} request(s)${r.skipped.length ? `; ${r.skipped.length} already present (${r.skipped.join(', ')})` : ''}.`);
        return 0;
      }
      if (action === 'request') {
        const rid = more[0];
        const cur = readVersioned(dir, `audits/${id}/requests/${rid}.json`);
        if (!cur) throw new Error(`request ${rid} does not exist`);
        const sample = one(a, 'sample');
        const sampleEv = one(a, 'sample-evidence');
        let sampleChange: { item: string; status: 'pending' | 'provided' | 'exception'; evidence?: string[] } | undefined;
        if (sample || sampleEv) {
          const [item, st] = (sample ?? sampleEv!.split('=')[0] + '=provided').split('=');
          sampleChange = { item, status: st as 'provided' | 'exception', ...(sampleEv ? { evidence: [sampleEv.split('=')[1]] } : {}) };
        }
        actOnRequest(dir, id, rid, cur.version, { by: one(a, 'by') ?? '', side: (one(a, 'side') ?? '') as 'client' | 'firm', text: one(a, 'text'), status: one(a, 'status') as never,
          evidence: one(a, 'evidence')?.split(',').map((x) => x.trim()).filter(Boolean), population: one(a, 'population'), select: one(a, 'select')?.split(',').map((x) => x.trim()).filter(Boolean), sample: sampleChange });
        const r = JSON.parse(readVersioned(dir, `audits/${id}/requests/${rid}.json`)!.text);
        out(json, r, () => `${r.id} ${r.status}: ${r.thread.at(-1).text}`);
        return 0;
      }
      if (action === 'draft') {
        const rel = draft(dir, id, (more[0] ?? '') as 'description' | 'assertion' | 'bridge', one(a, 'to'));
        out(json, { draft: rel }, () => `Drafted ${rel}. Review it, fill every [bracketed] item, and remove the drafting comment.`);
        return 0;
      }
      if (action === 'export') {
        const o = one(a, 'out');
        if (!o) throw new Error('export needs --out <folder>');
        const r = exportPackage(dir, id, resolve(o));
        out(json, r, () => `Exported ${r.files} files to ${resolve(o)}.\nPackage digest (SHA-256 of manifest.json): ${r.digest}; give it to the firm by a channel of its own.`);
        return 0;
      }
      if (action === 'import-return') {
        const r = importReturn(dir, id, resolve(more[0] ?? ''));
        out(json, r, () => [`Updated ${r.updated.length} request(s)${r.updated.length ? ` (${r.updated.join(', ')})` : ''}; added ${r.added.length}.`, ...r.conflicts.map((c) => `Kept for review: ${c}`)].join('\n'));
        return 0;
      }
      throw new Error(`unknown audit action ${action}`);
    }
    case 'firm': {
      if (a.flags.has('serve')) { firmSummary(dir); serveFirm('firm', dir, Number(one(a, 'port') ?? 4881)); return -1; }
      const r = firmSummary(dir);
      out(json, r, () => [`${r.firm}`, ...r.clients.map((c) => c.error ? `  ${c.name}: cannot be read (${c.error})` : [`  ${c.name} (${c.organization}): ${c.readiness}`,
        ...c.engagements.map((e) => `    ${e.id} ${e.type} ${e.period}, ${e.status}: ${Object.entries(e.requests).map(([k, v]) => `${v} ${k}`).join(', ') || 'no requests'}${e.exceptions ? `; ${e.exceptions} exception(s)` : ''}`)].join('\n'))].join('\n'));
      return 0;
    }
    case 'trust': {
      if (rest[0] !== 'build' || !one(a, 'out')) throw new Error('trust needs build --out <folder>');
      const r = buildTrustCenter(dir, resolve(one(a, 'out')!));
      out(json, r, () => `Built ${resolve(one(a, 'out')!)}/index.html publishing: ${r.published.join(', ') || 'only the headline and contact'}.`);
      return 0;
    }
    case 'questionnaire': {
      if (rest[0] === 'import') {
        const r = importQuestionnaire(dir, rest[1] ?? '', one(a, 'name') ?? '');
        out(json, r, () => `Imported ${r.id}: ${r.fromLibrary} from reviewed answers, ${r.drafted} drafted from workspace facts, ${r.unanswered} with nothing to draft from.`);
        return 0;
      }
      const [id, action, qid] = rest;
      const rel = `questionnaires/${id}.json`;
      const cur = readVersioned(dir, rel);
      if (!cur) throw new Error(`questionnaire ${id} does not exist`);
      if (action === 'answer') {
        reviewAnswer(dir, id, cur.version, qid ?? '', { answer: one(a, 'answer') ?? '', by: one(a, 'by') ?? '', sources: one(a, 'source')?.split(',').map((x) => x.trim()).filter(Boolean) });
        out(json, { id, question: qid }, () => `Reviewed ${qid}; kept in the answer library.`);
        return 0;
      }
      if (action === 'export') {
        const r = exportQuestionnaire(dir, id, one(a, 'out') ?? '');
        out(json, r, () => `Wrote ${r.reviewed} reviewed answer(s); ${r.blank} left blank with their status.`);
        return 0;
      }
      const doc = JSON.parse(cur.text);
      out(json, doc, () => [doc.name, ...doc.questions.map((q: { id: string; status: string; question: string; answer: string; sources: { path: string }[] }) => `  ${q.id} [${q.status}] ${q.question}\n      ${q.answer.slice(0, 200) || '(no answer)'}${q.sources.length ? `\n      sources: ${q.sources.map((x) => x.path).join(', ')}` : ''}`)].join('\n'));
      return 0;
    }
    case 'answers': {
      const stale = a.flags.has('stale') ? staleLibrary(dir) : null;
      const lib = stale ?? JSON.parse(readVersioned(dir, 'answers.json')?.text ?? '{"answers":[]}').answers;
      out(json, lib, () => lib.map((x: { id: string; question: string; reviewed_by: string; reviewed_at: string }) => `${x.id}  ${x.reviewed_at.slice(0, 10)} ${x.reviewed_by}  ${x.question}`).join('\n') || (stale ? 'No reviewed answer cites a fact that changed.' : 'No reviewed answers yet.'));
      return 0;
    }
    case 'certifications': {
      if (rest[0] === 'add') {
        const kind = one(a, 'kind') ?? '';
        if (!['audit report', 'certificate', 'self-attestation'].includes(kind)) throw new Error('--kind is "audit report", "certificate" or "self-attestation"');
        const pr = one(a, 'period');
        const period = pr ? { start: pr.split('..')[0], end: pr.split('..')[1] } : undefined;
        const c = recordCertification(dir, { framework: one(a, 'framework') ?? '', kind: kind as 'audit report', issuer: one(a, 'issuer') ?? '', issued_on: one(a, 'issued-on') ?? '',
          ...(period ? { period } : {}), ...(one(a, 'valid-until') ? { valid_until: one(a, 'valid-until') } : {}), file: resolve(one(a, 'file') ?? ''), by: one(a, 'by') ?? '' });
        out(json, c, () => `Recorded ${c.id}: ${claimOf(c)}.`);
        return 0;
      }
      if (rest[0]) throw new Error('certifications takes: add --framework <name> --kind <kind> --issuer <name> --issued-on <date> --file <document> --by <person>');
      const list = certifications(dir);
      out(json, list, () => list.map((c) => `${c.current ? 'current  ' : c.intact ? 'expired  ' : 'ALTERED  '} ${c.id}: ${claimOf(c)}`).join('\n') || 'No audit report, certificate or self-attestation is held.');
      return 0;
    }
    case 'frameworks': {
      if (rest[0] === 'enable') enableFramework(dir, rest[1] ?? '');
      else if (rest[0]) throw new Error('frameworks takes: enable <framework>');
      const m = loadWorkspace(dir).manifest?.data;
      out(json, m?.frameworks ?? [], () => `Frameworks: ${(m?.frameworks ?? []).join(', ')}`);
      return 0;
    }
    case 'framework': {
      const [id, act, req] = rest;
      if (!id) throw new Error('framework needs a framework id');
      if (act) {
        const known = loadWorkspace(dir).controls.map((c) => c.data.id);
        if (act === 'exclude') decide(dir, id, req ?? '', { exclude: one(a, 'reason') ?? '' }, known);
        else if (act === 'include') decide(dir, id, req ?? '', { include: true }, known);
        else if (act === 'map') decide(dir, id, req ?? '', { controls: (one(a, 'controls') ?? '').split(',').map((x) => x.trim()).filter(Boolean) }, known);
        else throw new Error('framework actions are exclude, include and map');
      }
      const ws = loadWorkspace(dir);
      if (!(ws.manifest?.data.frameworks ?? []).includes(id)) throw new Error(`${id} is not enabled; run: evidence-desk frameworks ${dirArg} enable ${id}`);
      const st = frameworkState(ws, id);
      out(json, st, () => { const s = st.summary; return [`${st.title}: ${s.ready}/${s.requirements - s.excluded} requirements ready, ${s.excluded} excluded, ${s.unaddressed} not addressed; ${s.shared_evidence} evidence records also serve SOC 2.`,
        ...st.requirements.filter((r) => r.status !== 'ready').map((r) => `  ${r.id.padEnd(11)} ${r.status.padEnd(11)} ${r.title}${r.reason ? ` (${r.reason.slice(0, 90)})` : ''}`)].join('\n'); });
      return 0;
    }
    case 'soa': {
      const o = one(a, 'out');
      if (!o) throw new Error('soa needs --out <file.csv or file.md>');
      const ws = loadWorkspace(dir);
      if (!(ws.manifest?.data.frameworks ?? []).includes('iso27001')) throw new Error(`ISO 27001 is not enabled; run: evidence-desk frameworks ${dirArg} enable iso27001`);
      const t = statementOfApplicability(ws);
      const text = o.endsWith('.md') ? [`# Statement of applicability: ${ws.manifest?.data.organization ?? ''}`, '', `Generated ${clockDate().toISOString().slice(0, 10)} from the workspace. ISO/IEC 27001:2022 Annex A identifiers with this project's titles.`, '',
        '| Control | Title | Included | Justification | Implementation | Evidence |', '|---|---|---|---|---|---|', ...t.rows.map((r) => `| ${r.control} | ${r.title} | ${r.included} | ${r.justification.replaceAll('|', '/')} | ${r.implementation} | ${r.evidence.split(';').filter(Boolean).length} |`)].join('\n') + '\n'
        : writeCsv(t);
      writeFileSync(resolve(o), text);
      out(json, { rows: t.rows.length }, () => `Wrote ${t.rows.length} Annex A controls to ${resolve(o)}.`);
      return 0;
    }
    case 'gaps': {
      const asOf = one(a, 'as-of');
      const g = computeGaps(loadWorkspace(dir), asOf ? new Date(`${asOf}T23:59:59Z`) : clockDate());
      out(json, g, () => {
        const s = g.summary;
        const lines = [`As of ${g.as_of}: ${s.controls_ready}/${s.controls_applicable} controls ready (${s.controls_excluded} excluded), ${s.criteria_ready}/${s.criteria_in_scope} criteria ready.`];
        if (g.program.length) lines.push('', 'Program:', ...g.program.map((x) => `  - ${x}`));
        for (const c of g.controls.filter((c) => c.gaps.length)) lines.push('', `${c.id} ${c.title}:`, ...c.gaps.map((x) => `  - ${x}`));
        return lines.join('\n');
      });
      return 0;
    }
    case 'validate': {
      const ws = loadWorkspace(dir);
      const errors = ws.problems.filter((p) => p.severity === 'error');
      out(json, ws.problems, () => ws.problems.length ? ws.problems.map((p) => `${p.severity}: ${p.file}: ${p.message}`).join('\n') : 'Valid.');
      return errors.length ? 1 : 0;
    }
    case 'serve': {
      loadWorkspace(dir);
      serve(dir, Number(one(a, 'port') ?? 4870));
      return -1;
    }
    default:
      throw new Error(`unknown command ${cmd}\n\n${USAGE}`);
  }
}

main(process.argv.slice(2)).then((code) => { if (code >= 0) process.exit(code); }, (e: Error) => {
  console.error(`evidence-desk: ${e.message}`);
  process.exit(1);
});
