// A workspace as it is on disk: every record with its path and version, and every problem found reading it.
// Nothing here writes. Each load rereads the folder, so edits made by people or other tools are always seen.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, schema } from './schema.ts';
import { parseCsv, type Table } from './csv.ts';
import { fileHash, readVersioned } from './files.ts';
import { criterionCategory, frameworkCatalogs, type FormTemplate } from './catalog.ts';
import { neededControls } from './targets.ts';
import type { Snapshot } from './open-autonomy.ts';

export type Versioned<T> = { path: string; version: string; data: T };
export type Control = {
  schema: string; id: string; title: string; description: string; criteria: string[]; frequency: string; policies: string[];
  evidence_expected: string[]; applicable: boolean; exclusion_reason?: string; owner: string; status: string; catalog?: string; notes?: string;
};
export type PolicyVersion = { version: number; approved_by: string; approved_at: string; sha256: string; archived: string };
export type Policy = { schema: string; id: string; title: string; owner: string; versions: PolicyVersion[] };
export type Evidence = {
  schema: string; id: string; title: string; controls: string[]; source: { kind: string; name?: string; query?: string; commit?: string };
  collected_at: string; period?: { start: string; end: string }; subject?: string; files: { path: string; sha256: string; bytes?: number }[]; recorded_by: string; notes?: string;
};
export type Form = FormTemplate;
export type Response = {
  schema: string; id: string; form: string; form_sha256: string; person: string; submitted_at: string; answers: Record<string, string>;
  score?: number; passed: boolean; policies?: { id: string; version: number; sha256: string }[]; identity: string;
};
export type AccessReview = {
  schema: string; id: string; system: string; period: { start: string; end: string }; reviewer: string;
  listing: { path: string; sha256: string; generated_by: string };
  accounts: { account: string; person?: string; privileged?: boolean; decision: 'pending' | 'keep' | 'remove' | 'modify'; note?: string; done_on?: string }[];
  status: 'open' | 'signed-off'; signed_off_at?: string;
};
export type Incident = {
  schema: string; id: string; title: string; severity: string; detected_at: string; status: 'open' | 'contained' | 'resolved' | 'closed'; owner?: string;
  timeline: { at: string; by: string; note: string }[]; customer_impact?: string; notification?: string; review?: string; closed_at?: string;
};
export type CheckRun = {
  schema: string; id: string; started_at: string; finished_at: string; by: string;
  collectors: { id: string; status: string; error?: string; snapshot?: string; evidence?: string }[];
  results: { check: string; collector: string; controls: string[]; status: 'pass' | 'fail' | 'error'; detail: string }[];
};
export type Scope = { schema: string; answers: Record<string, string | boolean>; sources?: Record<string, string> };
export type Manifest = { schema: string; organization: string; created_at: string; frameworks: string[] };
export type Problem = { severity: 'error' | 'warning'; file: string; message: string };

export const REGISTERS = ['people', 'systems', 'vendors', 'risks', 'vulnerabilities'] as const;
export type RegisterName = typeof REGISTERS[number];
export const MANIFEST = 'evidence-desk.json';

export type Workspace = {
  root: string;
  manifest: Versioned<Manifest> | null;
  scope: Versioned<Scope> | null;
  controls: Versioned<Control>[];
  policies: (Versioned<Policy> & { text: { path: string; version: string; body: string } | null })[];
  evidence: Versioned<Evidence>[];
  forms: Versioned<Form>[];
  responses: Versioned<Response>[];
  accessReviews: Versioned<AccessReview>[];
  incidents: Versioned<Incident>[];
  runs: Versioned<CheckRun>[];
  // The Open Autonomy project as last imported (sources/open-autonomy/latest.json), when it reads as a snapshot.
  openAutonomy: Versioned<Snapshot> | null;
  registers: Record<RegisterName, Versioned<Table> | null>;
  problems: Problem[];
};

export function readJson<T>(root: string, rel: string, schemaName: string, problems: Problem[]): Versioned<T> | null {
  const r = readVersioned(root, rel);
  if (!r) return null;
  let data: unknown;
  try { data = JSON.parse(r.text); } catch (e) { problems.push({ severity: 'error', file: rel, message: `not valid JSON: ${(e as Error).message}` }); return null; }
  // A record the code cannot read (not an object; a field missing, or an object, list or text that is something else)
  // is reported and left out, so the rest of the workspace still loads; so is one with a yes/no written otherwise,
  // which would read as yes ("false" is a text, and true). One whose values are merely wrong (a format, a choice, a
  // number written otherwise) stays, reported, so no view loses it.
  const wrong = check(schema(schemaName), data);
  const unreadable = typeof data !== 'object' || data === null || Array.isArray(data) || wrong.some((m) => /: must be (object|array|string|boolean)( or \w+)*, found \w+$|: is required$/.test(m));
  for (const m of wrong) problems.push({ severity: 'error', file: rel, message: unreadable ? `${m} (left out until fixed)` : m });
  if (unreadable) return null;
  return { path: rel, version: r.version, data: data as T };
}

const list = (root: string, dir: string, ext: string): string[] =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort().map((f) => `${dir}/${f}`) : [];

export function loadWorkspace(root: string): Workspace {
  const problems: Problem[] = [];
  if (!existsSync(join(root, MANIFEST))) throw new Error(`${root} is not an Evidence Desk workspace: ${MANIFEST} is missing`);
  const manifest = readJson<Manifest>(root, MANIFEST, 'workspace', problems);
  const scope = readJson<Scope>(root, 'scope.json', 'scope', problems);
  if (!scope && !existsSync(join(root, 'scope.json'))) problems.push({ severity: 'error', file: 'scope.json', message: 'is missing' });

  const controls = list(root, 'controls', '.json').map((f) => readJson<Control>(root, f, 'control', problems)).filter((c) => c !== null);
  const policies = list(root, 'policies', '.json').map((f) => readJson<Policy>(root, f, 'policy', problems)).filter((p) => p !== null).map((p) => {
    const t = readVersioned(root, `policies/${p.data.id}.md`);
    return { ...p, text: t ? { path: `policies/${p.data.id}.md`, version: t.version, body: t.text } : null };
  });
  const evidence = list(root, 'evidence/records', '.json').map((f) => readJson<Evidence>(root, f, 'evidence', problems)).filter((e) => e !== null);
  const forms = list(root, 'forms', '.json').map((f) => readJson<Form>(root, f, 'form', problems)).filter((x) => x !== null);
  const responses = list(root, 'forms/responses', '.json').map((f) => readJson<Response>(root, f, 'response', problems)).filter((x) => x !== null);
  const accessReviews = list(root, 'reviews/access', '.json').map((f) => readJson<AccessReview>(root, f, 'access-review', problems)).filter((x) => x !== null);
  const incidents = list(root, 'incidents', '.json').map((f) => readJson<Incident>(root, f, 'incident', problems)).filter((x) => x !== null);
  const runs = list(root, 'checks/runs', '.json').map((f) => readJson<CheckRun>(root, f, 'check-run', problems)).filter((x) => x !== null);

  const registers = {} as Workspace['registers'];
  for (const name of REGISTERS) {
    const rel = `registers/${name}.csv`;
    const r = readVersioned(root, rel);
    if (!r) { registers[name] = null; problems.push({ severity: 'error', file: rel, message: 'is missing' }); continue; }
    try {
      const table = parseCsv(r.text, rel);
      const s = schema(`register-${name}`);
      for (const col of s.required ?? []) if (!table.columns.includes(col)) problems.push({ severity: 'error', file: rel, message: `column ${col} is required` });
      table.rows.forEach((row, i) => { for (const m of check(s, row)) problems.push({ severity: 'error', file: rel, message: `row ${i + 2}: ${m}` }); });
      registers[name] = { path: rel, version: r.version, data: table };
    } catch (e) { registers[name] = null; problems.push({ severity: 'error', file: rel, message: (e as Error).message }); }
  }

  // Records no view needs loaded are still validated, so `validate` covers every file Evidence Desk defines.
  for (const [rel, name] of [['trust.json', 'trust'], ['answers.json', 'answer-library'], ['collectors.json', 'collectors']] as const) readJson(root, rel, name, problems);
  for (const f of list(root, 'questionnaires', '.json')) readJson(root, f, 'questionnaire', problems);
  for (const f of list(root, 'certifications', '.json')) readJson(root, f, 'certification', problems);
  for (const f of list(root, 'sources/open-autonomy/completeness', '.json')) readJson(root, f, 'completeness', problems);
  const openAutonomy = readJson<Snapshot>(root, 'sources/open-autonomy/latest.json', 'open-autonomy', problems);
  for (const f of list(root, 'frameworks', '.json')) {
    const r = readJson<{ framework: string }>(root, f, 'framework-settings', problems);
    if (r && (!frameworkCatalogs.has(r.data.framework) || f !== `frameworks/${r.data.framework}.json`)) problems.push({ severity: 'error', file: f, message: `${r.data.framework} is not a framework Evidence Desk maps with its own settings, or this file is not frameworks/${r.data.framework}.json` });
  }
  if (existsSync(join(root, 'audits'))) for (const d of readdirSync(join(root, 'audits'))) {
    if (!existsSync(join(root, 'audits', d, 'engagement.json'))) continue;
    readJson(root, `audits/${d}/engagement.json`, 'engagement', problems);
    for (const f of list(root, `audits/${d}/requests`, '.json')) readJson(root, f, 'audit-request', problems);
  }
  syncConflicts(root, problems);
  const ws: Workspace = { root, manifest, scope, controls, policies, evidence, forms, responses, accessReviews, incidents, runs, openAutonomy, registers, problems };
  crossCheck(ws);
  return ws;
}

// A workspace kept in a synced folder (Dropbox, Google Drive, iCloud, Syncthing, Nextcloud) can grow a conflict copy
// beside a record when two people change it at once. The copy is never read, so its changes would be silently lost: each
// is an error naming the record it copies. Only names beside an existing original count, so an ordinary file is not
// mistaken for one. Evidence files and audit packages are not records and are left alone.
const CONFLICT = [/^(.*) \([^)]*conflicted copy[^)]*\)(\.[^.]+)$/i, /^(.*) \(\d+\)(\.[^.]+)$/, /^(.*) \d+(\.[^.]+)$/, /^(.*)\.sync-conflict-[0-9-]+-[A-Za-z0-9]+(\.[^.]+)$/];
function syncConflicts(root: string, problems: Problem[]): void {
  const audits = existsSync(join(root, 'audits')) ? readdirSync(join(root, 'audits')).flatMap((d) => [`audits/${d}`, `audits/${d}/requests`]) : [];
  const dirs = ['', 'controls', 'policies', 'registers', 'forms', 'forms/responses', 'reviews/access', 'incidents', 'evidence/records', 'checks/runs', 'questionnaires', 'frameworks', 'sources', 'sources/open-autonomy', 'sources/github', ...audits];
  for (const dir of dirs) {
    if (!existsSync(join(root, dir))) continue;
    const names = new Set(readdirSync(join(root, dir)));
    for (const f of names) for (const re of CONFLICT) {
      const m = re.exec(f);
      if (m && names.has(`${m[1]}${m[2]}`)) { problems.push({ severity: 'error', file: dir ? `${dir}/${f}` : f, message: `looks like a sync conflict copy of ${dir ? `${dir}/` : ''}${m[1]}${m[2]}: merge any change it holds into that file, then delete it` }); break; }
    }
  }
}

// References between records: ids match file names, owners are people, links point at records that exist,
// and evidence files still hold the bytes that were recorded.
function crossCheck(ws: Workspace): void {
  const p = ws.problems;
  const people = new Set((ws.registers.people?.data.rows ?? []).map((r) => r.id));
  const policyIds = new Set(ws.policies.map((x) => x.data.id));
  const controlIds = new Set(ws.controls.map((x) => x.data.id));
  // A control's policies must exist once the targets need it; one that is not needed yet has not been adopted into work.
  const needed = neededControls(ws);
  // Every target and every framework's settings name a framework Evidence Desk maps.
  const known = new Set(['soc2', ...frameworkCatalogs.keys()]);
  for (const f of ws.manifest?.data.frameworks ?? []) if (!known.has(f)) p.push({ severity: 'error', file: 'evidence-desk.json', message: `${f} is not a framework Evidence Desk maps; available: ${[...known].join(', ')}` });
  const same = (v: Versioned<{ id: string }>, dir: string) => {
    if (v.path !== `${dir}/${v.data.id}.json`) p.push({ severity: 'error', file: v.path, message: `id ${v.data.id} does not match the file name` });
  };
  for (const name of REGISTERS) {
    const seen = new Set<string>();
    for (const r of ws.registers[name]?.data.rows ?? []) {
      if (seen.has(r.id)) p.push({ severity: 'error', file: `registers/${name}.csv`, message: `id ${r.id} appears more than once` });
      seen.add(r.id);
    }
  }
  for (const c of ws.controls) {
    same(c, 'controls');
    if (c.data.owner && !people.has(c.data.owner)) p.push({ severity: 'error', file: c.path, message: `owner ${c.data.owner} is not in registers/people.csv` });
    if (needed.has(c.data.id)) for (const pol of c.data.policies ?? []) if (!policyIds.has(pol)) p.push({ severity: 'error', file: c.path, message: `policy ${pol} does not exist` });
    for (const cr of c.data.criteria ?? []) if (!criterionCategory.has(cr)) p.push({ severity: 'error', file: c.path, message: `criterion ${cr} is not a SOC 2 criterion` });
    if (c.data.applicable === false && !c.data.exclusion_reason?.trim()) p.push({ severity: 'error', file: c.path, message: 'an excluded control needs an exclusion_reason' });
  }
  for (const pol of ws.policies) {
    same(pol, 'policies');
    if (pol.data.owner && !people.has(pol.data.owner)) p.push({ severity: 'error', file: pol.path, message: `owner ${pol.data.owner} is not in registers/people.csv` });
    if (!pol.text) p.push({ severity: 'error', file: pol.path, message: `its text policies/${pol.data.id}.md is missing` });
    for (const v of pol.data.versions ?? []) {
      let h: ReturnType<typeof fileHash> = null;
      try { h = fileHash(ws.root, v.archived); } catch (err) { p.push({ severity: 'error', file: pol.path, message: (err as Error).message }); continue; }
      if (!h) p.push({ severity: 'error', file: pol.path, message: `approved version ${v.version} archive ${v.archived} is missing` });
      else if (h.sha256 !== v.sha256) p.push({ severity: 'error', file: pol.path, message: `approved version ${v.version} archive ${v.archived} no longer matches its approval` });
    }
  }
  for (const e of ws.evidence) {
    same(e, 'evidence/records');
    for (const c of e.data.controls ?? []) if (!controlIds.has(c)) p.push({ severity: 'error', file: e.path, message: `control ${c} does not exist` });
    for (const f of e.data.files ?? []) {
      let h: ReturnType<typeof fileHash> = null;
      try { h = fileHash(ws.root, f.path); } catch (err) { p.push({ severity: 'error', file: e.path, message: (err as Error).message }); continue; }
      if (!h) p.push({ severity: 'error', file: e.path, message: `file ${f.path} is missing` });
      else if (h.sha256 !== f.sha256) p.push({ severity: 'warning', file: e.path, message: `file ${f.path} changed since it was recorded; record it again if the new content is the evidence` });
    }
  }
  const formIds = new Set(ws.forms.map((f) => f.data.id));
  const systems = new Set((ws.registers.systems?.data.rows ?? []).map((r) => r.id));
  const person = (file: string, id: string | undefined, what: string) => { if (id && !people.has(id)) p.push({ severity: 'error', file, message: `${what} ${id} is not in registers/people.csv` }); };
  for (const f of ws.forms) {
    same(f, 'forms');
    for (const c of f.data.controls) if (!controlIds.has(c)) p.push({ severity: 'error', file: f.path, message: `control ${c} does not exist` });
  }
  for (const r of ws.responses) {
    same(r, 'forms/responses');
    if (!formIds.has(r.data.form)) p.push({ severity: 'error', file: r.path, message: `form ${r.data.form} does not exist` });
    person(r.path, r.data.person, 'person');
  }
  for (const a of ws.accessReviews) {
    same(a, 'reviews/access');
    if (!systems.has(a.data.system)) p.push({ severity: 'error', file: a.path, message: `system ${a.data.system} is not in registers/systems.csv` });
    person(a.path, a.data.reviewer, 'reviewer');
    const h = (() => { try { return fileHash(ws.root, a.data.listing.path); } catch { return null; } })();
    if (!h) p.push({ severity: 'error', file: a.path, message: `user listing ${a.data.listing.path} is missing` });
    else if (h.sha256 !== a.data.listing.sha256) p.push({ severity: 'warning', file: a.path, message: `user listing ${a.data.listing.path} changed since the review started` });
  }
  for (const i of ws.incidents) { same(i, 'incidents'); person(i.path, i.data.owner, 'owner'); }
  for (const e of ws.evidence) person(e.path, e.data.subject, 'subject');
  for (const r of ws.registers.risks?.data.rows ?? []) {
    for (const c of (r.controls ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
      if (!controlIds.has(c)) p.push({ severity: 'error', file: 'registers/risks.csv', message: `risk ${r.id} names control ${c}, which does not exist` });
    }
  }
}
