// A workspace as it is on disk: every record with its path and version, and every problem found reading it.
// Nothing here writes. Each load rereads the folder, so edits made by people or other tools are always seen.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check, schema } from './schema.ts';
import { parseCsv, type Table } from './csv.ts';
import { fileHash, readVersioned } from './files.ts';
import { criterionCategory } from './catalog.ts';

export type Versioned<T> = { path: string; version: string; data: T };
export type Control = {
  schema: string; id: string; title: string; description: string; criteria: string[]; frequency: string; policies: string[];
  evidence_expected: string[]; applicable: boolean; exclusion_reason?: string; owner: string; status: string; catalog?: string; notes?: string;
};
export type PolicyVersion = { version: number; approved_by: string; approved_at: string; sha256: string; archived: string };
export type Policy = { schema: string; id: string; title: string; owner: string; versions: PolicyVersion[] };
export type Evidence = {
  schema: string; id: string; title: string; controls: string[]; source: { kind: string; name?: string; query?: string; commit?: string };
  collected_at: string; period?: { start: string; end: string }; files: { path: string; sha256: string; bytes?: number }[]; recorded_by: string; notes?: string;
};
export type Scope = { schema: string; answers: Record<string, string | boolean>; sources?: Record<string, string> };
export type Manifest = { schema: string; organization: string; created_at: string; frameworks: string[] };
export type Problem = { severity: 'error' | 'warning'; file: string; message: string };

export const REGISTERS = ['people', 'systems', 'vendors', 'risks'] as const;
export type RegisterName = typeof REGISTERS[number];
export const MANIFEST = 'evidence-desk.json';

export type Workspace = {
  root: string;
  manifest: Versioned<Manifest> | null;
  scope: Versioned<Scope> | null;
  controls: Versioned<Control>[];
  policies: (Versioned<Policy> & { text: { path: string; version: string; body: string } | null })[];
  evidence: Versioned<Evidence>[];
  registers: Record<RegisterName, Versioned<Table> | null>;
  problems: Problem[];
};

function readJson<T>(root: string, rel: string, schemaName: string, problems: Problem[]): Versioned<T> | null {
  const r = readVersioned(root, rel);
  if (!r) return null;
  let data: unknown;
  try { data = JSON.parse(r.text); } catch (e) { problems.push({ severity: 'error', file: rel, message: `not valid JSON: ${(e as Error).message}` }); return null; }
  for (const m of check(schema(schemaName), data)) problems.push({ severity: 'error', file: rel, message: m });
  return { path: rel, version: r.version, data: data as T };
}

const list = (root: string, dir: string, ext: string): string[] =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort().map((f) => `${dir}/${f}`) : [];

export function loadWorkspace(root: string): Workspace {
  const problems: Problem[] = [];
  if (!existsSync(join(root, MANIFEST))) throw new Error(`${root} is not an Evidence Desk workspace: ${MANIFEST} is missing`);
  const manifest = readJson<Manifest>(root, MANIFEST, 'workspace', problems);
  const scope = readJson<Scope>(root, 'scope.json', 'scope', problems);
  if (!scope) problems.push({ severity: 'error', file: 'scope.json', message: 'is missing' });

  const controls = list(root, 'controls', '.json').map((f) => readJson<Control>(root, f, 'control', problems)).filter((c) => c !== null);
  const policies = list(root, 'policies', '.json').map((f) => readJson<Policy>(root, f, 'policy', problems)).filter((p) => p !== null).map((p) => {
    const t = readVersioned(root, `policies/${p.data.id}.md`);
    return { ...p, text: t ? { path: `policies/${p.data.id}.md`, version: t.version, body: t.text } : null };
  });
  const evidence = list(root, 'evidence/records', '.json').map((f) => readJson<Evidence>(root, f, 'evidence', problems)).filter((e) => e !== null);

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

  const ws: Workspace = { root, manifest, scope, controls, policies, evidence, registers, problems };
  crossCheck(ws);
  return ws;
}

// References between records: ids match file names, owners are people, links point at records that exist,
// and evidence files still hold the bytes that were recorded.
function crossCheck(ws: Workspace): void {
  const p = ws.problems;
  const people = new Set((ws.registers.people?.data.rows ?? []).map((r) => r.id));
  const policyIds = new Set(ws.policies.map((x) => x.data.id));
  const controlIds = new Set(ws.controls.map((x) => x.data.id));
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
    if (c.data.applicable) for (const pol of c.data.policies ?? []) if (!policyIds.has(pol)) p.push({ severity: 'error', file: c.path, message: `policy ${pol} does not exist` });
    for (const cr of c.data.criteria ?? []) if (!criterionCategory.has(cr)) p.push({ severity: 'error', file: c.path, message: `criterion ${cr} is not a SOC 2 criterion` });
    if (c.data.applicable === false && !c.data.exclusion_reason?.trim()) p.push({ severity: 'error', file: c.path, message: 'an excluded control needs an exclusion_reason' });
  }
  for (const pol of ws.policies) {
    same(pol, 'policies');
    if (pol.data.owner && !people.has(pol.data.owner)) p.push({ severity: 'error', file: pol.path, message: `owner ${pol.data.owner} is not in registers/people.csv` });
    if (!pol.text) p.push({ severity: 'error', file: pol.path, message: `its text policies/${pol.data.id}.md is missing` });
    for (const v of pol.data.versions ?? []) {
      const h = fileHash(ws.root, v.archived);
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
  for (const r of ws.registers.risks?.data.rows ?? []) {
    for (const c of (r.controls ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
      if (!controlIds.has(c)) p.push({ severity: 'error', file: 'registers/risks.csv', message: `risk ${r.id} names control ${c}, which does not exist` });
    }
  }
}
