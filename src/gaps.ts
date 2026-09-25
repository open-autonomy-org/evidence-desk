// What stands between the workspace and readiness: per control, per in-scope criterion, and for the program as a
// whole. Derived on every call from the files; nothing is cached.
import { categories, categoryAnswer, criteria, questions } from './catalog.ts';
import { placeholders, unanswered } from './actions.ts';
import { readJson, type Workspace } from './workspace.ts';
import { computeObligations, type Obligation } from './obligations.ts';
import { DECLARATION_CONTROLS, RECORD_KINDS, seamFindings } from './open-autonomy.ts';
import { actDigest, readAct, signedActs, UNREADABLE } from './github.ts';
import { readVersioned } from './files.ts';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkTitle, readSettings, COLLECTORS } from './automation.ts';
import { clockDate } from './clock.ts';
import { inSoc2Scope, isSoc2Control, neededControls, soc2Exclusion } from './targets.ts';
import { INTERVAL_DAYS } from './catalog.ts';


export type ControlGaps = { id: string; title: string; owner: string; status: string; gaps: string[]; evidence: number; last_evidence: string | null };
export type CriterionGaps = { id: string; title: string; category: string; controls: string[]; excluded: { id: string; reason: string }[]; ready: boolean; gaps: string[] };
export type Gaps = {
  as_of: string;
  obligations: Obligation[];
  summary: { controls_applicable: number; controls_ready: number; controls_excluded: number; criteria_in_scope: number; criteria_ready: number; program_gaps: number; problems: number };
  program: string[];
  controls: ControlGaps[];
  criteria: CriterionGaps[];
};

export function computeGaps(ws: Workspace, asOf = clockDate()): Gaps {
  const program: string[] = [];
  // The program's work is on needed controls; SOC 2's criteria and counts on controls in SOC 2's scope (targets.ts).
  const needed = neededControls(ws);
  const scope = ws.scope?.data;
  if (!scope) program.push('scope.json is missing or invalid');
  else for (const q of unanswered(scope)) program.push(`Scoping question not answered: ${questions.find((x) => x.id === q)!.prompt}`);
  if (!ws.controls.length) program.push('No controls adopted yet: answer the scoping questions, then adopt the control set');
  const people = ws.registers.people?.data.rows ?? [];
  if (!people.length) program.push('The people register is empty');
  if (!(ws.registers.systems?.data.rows ?? []).some((r) => r.in_scope === 'yes')) program.push('No in-scope system is listed in the systems register');
  if (!(ws.registers.vendors?.data.rows ?? []).length) program.push('The vendor register is empty');
  if (!(ws.registers.risks?.data.rows ?? []).length) program.push('The risk register is empty');
  for (const r of ws.registers.risks?.data.rows ?? []) if (r.treatment === 'undecided' && r.status === 'open') program.push(`Risk ${r.id} has no treatment decision`);
  // A collected record, when it has the shape its readers need: null when it has not been collected, undefined (and a
  // finding) when it cannot be read, so one damaged file is reported instead of taking every other gap with it.
  const collected = <T>(rel: string, shaped: (x: Record<string, unknown>) => boolean): T | null | undefined => {
    const got = readVersioned(ws.root, rel);
    if (!got) return null;
    try { const x = JSON.parse(got.text); if (x && typeof x === 'object' && shaped(x)) return x as T; } catch { /* reported below */ }
    program.push(`${rel} cannot be read: collect it again`);
    return undefined;
  };
  const oa = ws.openAutonomy;
  if (oa) {
    const snap = oa.data;
    program.push(...seamFindings(snap).map((f) => `Open Autonomy: ${f}`));
    // Every needed control the declarations evidence must be on a record of them at this commit; a target added since the
    // last import leaves some off, and importing again records them.
    const declared = DECLARATION_CONTROLS.filter((c) => needed.has(c));
    const covered = new Set(ws.evidence.filter((e) => e.data.source?.kind === 'open-autonomy' && e.data.source?.commit === snap.commit).flatMap((e) => e.data.controls));
    const missing = declared.filter((c) => !covered.has(c));
    if (missing.length) program.push(`Open Autonomy: the declarations at ${snap.commit.slice(0, 12)} are not recorded as evidence for ${missing.join(', ')} (open-autonomy import again)`);
    const dir = join(ws.root, 'sources/open-autonomy/completeness');
    const checks = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => readJson<{ account: string; vendor: string; checked_at: string; outside: string[] }>(ws.root, `sources/open-autonomy/completeness/${f}`, 'completeness', [])?.data).filter((c) => c !== undefined) : [];
    for (const acct of snap.vendor_accounts) {
      const last = checks.filter((c) => c.vendor === acct.vendor && c.account === acct.account).sort((a, b) => a.checked_at.localeCompare(b.checked_at)).at(-1);
      if (!last) program.push(`Open Autonomy: the administrators of ${acct.vendor} ${acct.account} have not been compared with the roster`);
      else for (const o of last.outside) program.push(`Open Autonomy: ${o} administers ${acct.vendor} ${acct.account} but is not on the roster`);
    }
    for (const seam of (snap.seams ?? []).filter((x) => x.door === 'commit' && x.record.startsWith('records/') && RECORD_KINDS[x.id])) {
      const rel = `sources/open-autonomy/seam-records/${seam.id}.json`;
      const got = collected<{ findings: string[] }>(rel, (x) => Array.isArray(x.findings));
      if (!got) { if (got === null) program.push(`Open Autonomy: the ${seam.id} records in ${seam.record} have not been collected (collect seam-records)`); continue; }
      for (const f of got.findings) program.push(`Open Autonomy: ${f}`);
    }
  }
  // Every signed act must have been recorded by its person's own GitHub account on the roster: each person's latest
  // passed response per form, each access review sign-off, each policy's latest approval, each incident's closing. A
  // signer who is not on the roster has no account to check, which is itself the finding.
  const record = collected<{ roster_commit: string; roster_source?: { read_from?: string; repo?: string; commit?: string }; rows: { key: string; value_sha256: string; status: string; via?: string; author: string; person: string }[] }>(
    'sources/github/attribution.json', (x) => typeof x.roster_commit === 'string' && Array.isArray(x.rows)) ?? null;
  // A check that read the roster from the project's repository is compared with nothing here (its commit is the
  // project's, recorded); one that read the workspace's copy says so, and is compared with the copy now held.
  const fromProject = record?.roster_source?.read_from === 'the project repository';
  if (record && !fromProject) program.push('Open Autonomy: signed acts were checked against the workspace\'s copy of the roster, which anyone who writes to the workspace can change (collect attribution --roster <the project\'s repository>)');
  const snap = oa?.data ?? null;
  if (record && !fromProject && snap && record.roster_commit !== snap.commit) program.push(`Open Autonomy: signed acts were checked against the roster at ${record.roster_commit.slice(0, 12)}, not ${snap.commit.slice(0, 12)} (collect attribution)`);
  const latestResponse = new Map<string, { id: string; at: string }>();
  for (const r of ws.responses) if (r.data.passed) {
    const k = `${r.data.person} ${r.data.form}`;
    if ((latestResponse.get(k)?.at ?? '') < r.data.submitted_at) latestResponse.set(k, { id: r.data.id, at: r.data.submitted_at });
  }
  const latestIds = new Set([...latestResponse.values()].map((x) => `response:${x.id}`));
  const acts = signedActs(ws.root).filter((a) => a.kind !== 'response' || latestIds.has(a.key));
  // Only a workspace that signs on GitHub is checked: one with the project's roster imported or an attribution record. A
  // workspace kept on this machine alone has no account to check its acts against.
  if (!oa && !record) { /* nothing to check against */ }
  else if (acts.length && !record) program.push('Open Autonomy: signed acts (onboarding, access review sign-offs, policy approvals, incident closures, risk decisions, vendor reviews, attestations) have not been checked against the people\'s GitHub accounts (collect attribution)');
  else for (const a of acts) {
    const parsed = readAct(a.file, readVersioned(ws.root, a.file)?.text);
    const value = actDigest(parsed === UNREADABLE ? null : a.extract(parsed));
    const row = record!.rows.find((x) => x.key === a.key && x.value_sha256 === value);
    if (!row) program.push(`Open Autonomy: ${a.person || '(no one)'}'s ${a.label} has not been checked against their GitHub account`);
    else if (row.status !== 'verified') program.push(`Open Autonomy: ${row.person || '(no one)'}'s ${a.label} is not signed by their own GitHub account: ${row.status}${row.author ? ` (${row.author})` : ''}`);
    // A check made before opening a pull request stopped counting as a signature recorded "verified" for it: only an
    // approval of the commit merged signs.
    else if (row.via !== 'approved') program.push(`Open Autonomy: ${row.person || '(no one)'}'s ${a.label} was recorded as signed only because they opened its pull request; run collect attribution again`);
  }
  const errors = ws.problems.filter((p) => p.severity === 'error');
  if (errors.length) program.push(`${errors.length} validation error(s): run validate to see them`);

  const policies = new Map(ws.policies.map((p) => [p.data.id, p]));
  const policyGaps = new Map<string, string[]>();
  for (const [id, p] of policies) {
    const g: string[] = [];
    const last = p.data.versions.at(-1);
    if (!p.data.owner) g.push(`policy ${id} has no owner`);
    if (!last) g.push(`policy ${id} has never been approved`);
    else if (p.text && p.text.version !== last.sha256) g.push(`policy ${id} has changes since version ${last.version} was approved`);
    else if (last && Date.parse(last.approved_at) < asOf.getTime() - 366 * 864e5) g.push(`policy ${id} was last approved over a year ago`);
    if (p.text && placeholders(p.text.body).length) g.push(`policy ${id} has unfilled placeholders: ${placeholders(p.text.body).map((x) => `{{${x}}}`).join(', ')}`);
    policyGaps.set(id, g);
  }

  const obligations = computeObligations(ws, asOf);
  const owed = new Map<string, string[]>();
  for (const o of obligations) if (o.state === 'overdue' && o.kind !== 'control') for (const c of o.controls) {
    (owed.get(c) ?? owed.set(c, []).get(c)!).push(`overdue since ${o.due}: ${o.what}${o.who ? ` (${o.who})` : ''}`);
  }
  // The latest result of each check of an enabled collector: failing, erroring, never run or not run in two days.
  const checkGaps = new Map<string, string[]>();
  const addCheckGap = (controls: string[], text: string) => { for (const c of controls) (checkGaps.get(c) ?? checkGaps.set(c, []).get(c)!).push(text); };
  let enabled: string[] = [];
  try { enabled = readSettings(ws.root).settings.filter((x) => x.enabled).map((x) => x.id); } catch (e) { program.push((e as Error).message); }
  const runs = [...ws.runs].sort((a, b) => a.data.started_at.localeCompare(b.data.started_at));
  for (const col of COLLECTORS.filter((c) => enabled.includes(c.id))) for (const chk of col.checks) {
    const history = runs.flatMap((r) => r.data.results.filter((x) => x.check === chk.id).map((x) => ({ ...x, at: r.data.started_at })));
    const last = history.at(-1);
    if (!last) { addCheckGap(chk.controls, `check "${chk.title}" has never run`); continue; }
    if (last.status === 'fail') {
      let since = last.at;
      for (const h of [...history].reverse()) { if (h.status !== 'fail') break; since = h.at; }
      addCheckGap(chk.controls, `check "${checkTitle(chk.id)}" failing since ${since.slice(0, 10)}: ${last.detail}`);
    } else if (last.status === 'error') addCheckGap(chk.controls, `check "${checkTitle(chk.id)}" could not decide on ${last.at.slice(0, 10)}: ${last.detail}`);
    else if (Date.parse(last.at) < asOf.getTime() - 2 * 864e5) addCheckGap(chk.controls, `check "${checkTitle(chk.id)}" last ran ${last.at.slice(0, 10)}`);
  }
  const changedFiles = new Set(ws.problems.filter((p) => p.severity === 'warning' && p.file.startsWith('evidence/records/')).map((p) => p.file));
  const controls: ControlGaps[] = ws.controls.filter((c) => needed.has(c.data.id)).map((c) => {
    const d = c.data;
    const g: string[] = [];
    if (!d.owner) g.push('no owner');
    if (d.status !== 'implemented') g.push(`status is ${d.status}`);
    for (const p of d.policies) g.push(...(policyGaps.get(p) ?? [`policy ${p} does not exist`]));
    const ev = ws.evidence.filter((e) => e.data.controls.includes(d.id));
    const last = ev.map((e) => e.data.collected_at).sort().at(-1) ?? null;
    if (!ev.length) g.push('no evidence recorded');
    else if (INTERVAL_DAYS[d.frequency] && last && Date.parse(last) < asOf.getTime() - INTERVAL_DAYS[d.frequency] * 864e5) {
      g.push(`evidence is stale: last recorded ${last.slice(0, 10)}, expected ${d.frequency}`);
    }
    for (const e of ev) if (changedFiles.has(e.path)) g.push(`evidence ${e.data.id} has a file that changed since it was recorded`);
    g.push(...(owed.get(d.id) ?? []));
    g.push(...(checkGaps.get(d.id) ?? []));
    return { id: d.id, title: d.title, owner: d.owner, status: d.status, gaps: g, evidence: ev.length, last_evidence: last };
  });
  const byId = new Map(controls.map((c) => [c.id, c]));

  const inScope = (cat: string) => cat === 'CC' || scope?.answers[categoryAnswer[cat]] === true;
  const crit: CriterionGaps[] = criteria.filter((c) => inScope(c.category)).map((c) => {
    const mapped = ws.controls.filter((x) => x.data.criteria.includes(c.id));
    const applicable = mapped.filter((x) => inSoc2Scope(ws, x.data)).map((x) => x.data.id);
    const excluded = mapped.filter((x) => !inSoc2Scope(ws, x.data)).map((x) => ({ id: x.data.id, reason: soc2Exclusion(ws, x.data) ?? '' }));
    const g: string[] = [];
    if (!applicable.length) g.push(excluded.length ? 'every mapped control is excluded; confirm the exclusions are justified or carved out to a subservice organization' : 'no control addresses this criterion');
    for (const id of applicable) if (byId.get(id)!.gaps.length) g.push(`${id} is not ready`);
    return { id: c.id, title: c.title, category: categories[c.category], controls: applicable, excluded, ready: applicable.length > 0 && g.length === 0, gaps: g };
  });

  const soc2 = controls.filter((c) => inSoc2Scope(ws, ws.controls.find((x) => x.data.id === c.id)!.data));
  return {
    as_of: asOf.toISOString().slice(0, 10),
    summary: {
      controls_applicable: soc2.length, controls_ready: soc2.filter((c) => !c.gaps.length).length,
      controls_excluded: ws.controls.filter((c) => isSoc2Control(c.data) && !inSoc2Scope(ws, c.data)).length,
      criteria_in_scope: crit.length, criteria_ready: crit.filter((c) => c.ready).length, program_gaps: program.length, problems: errors.length,
    },
    program, obligations, controls, criteria: crit,
  };
}
