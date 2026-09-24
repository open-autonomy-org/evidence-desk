// Every change Evidence Desk makes to a workspace. The CLI and the local UI both call these, so they validate and
// refuse the same way. Each edit names the version of the file it read; a file changed since is a conflict.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { writeCsv } from './csv.ts';
import { fileHash, readVersioned, writeVersioned, inside } from './files.ts';
import { categoryAnswer, criterionCategory, formTemplates, library, policyTemplates, questions } from './catalog.ts';
import { loadWorkspace, MANIFEST, REGISTERS, type Control, type Evidence, type Policy, type RegisterName, type Scope } from './workspace.ts';
import { clockDate, now } from './clock.ts';

const pretty = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
function valid(schemaName: string, data: unknown, what: string): void {
  const errs = check(schema(schemaName), data);
  if (errs.length) throw new Error(`${what} is invalid: ${errs.join('; ')}`);
}

export function initWorkspace(root: string, organization: string): void {
  if (!organization.trim()) throw new Error('an organization name is required');
  if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty; choose a new or empty folder`);
  mkdirSync(root, { recursive: true });
  const manifest = { schema: 'evidence-desk.workspace/1', organization, created_at: now(), frameworks: ['soc2'] };
  writeVersioned(root, MANIFEST, pretty(manifest), null);
  writeVersioned(root, 'scope.json', pretty({ schema: 'evidence-desk.scope/1', answers: { organization } }), null);
  for (const name of REGISTERS) {
    const columns = schema(`register-${name}`)['x-columns']!;
    writeVersioned(root, `registers/${name}.csv`, writeCsv({ columns, rows: [] }), null);
  }
  const guide = readFileSync(join(import.meta.dirname, '..', 'catalog', 'workspace-AGENTS.md'), 'utf8');
  writeVersioned(root, 'AGENTS.md', guide, null);
  writeVersioned(root, 'CLAUDE.md', 'Read AGENTS.md: it describes this Evidence Desk workspace and how to change it safely.\n', null);
  for (const d of ['controls', 'policies/archive', 'evidence/records', 'evidence/files', 'forms/responses', 'reviews/access', 'incidents']) mkdirSync(join(root, d), { recursive: true });
}

export function setScope(root: string, answers: Record<string, unknown>, version: string, source?: string): void {
  const cur = readVersioned(root, 'scope.json');
  if (!cur) throw new Error('scope.json is missing');
  const scope = JSON.parse(cur.text) as Scope;
  for (const [k, v] of Object.entries(answers)) {
    const q = questions.find((x) => x.id === k);
    if (!q) throw new Error(`${k} is not a scoping question`);
    if (q.type === 'boolean' && typeof v !== 'boolean') throw new Error(`${k} must be true or false`);
    if (q.type === 'text' && typeof v !== 'string') throw new Error(`${k} must be text`);
    scope.answers[k] = v as string | boolean;
    if (source) (scope.sources ??= {})[k] = source;
    else if (scope.sources) delete scope.sources[k];
  }
  valid('scope', scope, 'scope.json');
  writeVersioned(root, 'scope.json', pretty(scope), version);
}

export const unanswered = (scope: Scope): string[] => questions.filter((q) => q.required && (scope.answers[q.id] === undefined || scope.answers[q.id] === '')).map((q) => q.id);

// Why a library control does not apply under these answers, or null when it does.
function exclusion(c: (typeof library)[number], answers: Scope['answers']): string | null {
  const inScope = c.criteria.some((cr) => { const cat = criterionCategory.get(cr)!; return cat === 'CC' || answers[categoryAnswer[cat]] === true; });
  if (!inScope) return `Its criteria (${c.criteria.join(', ')}) are outside the categories in scope.`;
  for (const w of c.when ?? []) {
    if (answers[w.answer] !== w.equals) {
      const q = questions.find((x) => x.id === w.answer);
      return `Scoping answer "${q?.prompt ?? w.answer}" is ${JSON.stringify(answers[w.answer])}.`;
    }
  }
  return null;
}

export const render = (text: string, answers: Scope['answers']): string =>
  text.replace(/\{\{(organization|security_contact)\}\}/g, (m, k: string) => (typeof answers[k] === 'string' && answers[k] ? String(answers[k]) : m));

// Brings the workspace in line with the library for the current scope. New controls and policies are created;
// an existing control only has its applicability updated. Owners, statuses, notes and edited text are never touched.
export function adopt(root: string): { created: string[]; changed: string[]; policies: string[]; forms: string[] } {
  const ws = loadWorkspace(root);
  if (!ws.scope) throw new Error('scope.json is missing or invalid');
  const missing = unanswered(ws.scope.data);
  if (missing.length) throw new Error(`answer the scoping questions first: ${missing.join(', ')}`);
  const answers = ws.scope.data.answers;
  const out = { created: [] as string[], changed: [] as string[], policies: [] as string[], forms: [] as string[] };
  const applicable = new Set<string>();
  const needed = new Set<string>();
  for (const lib of library) {
    const reason = exclusion(lib, answers);
    if (!reason) { lib.policies.forEach((p) => needed.add(p)); applicable.add(lib.id); }
    const rel = `controls/${lib.id}.json`;
    const existing = ws.controls.find((c) => c.data.id === lib.id);
    if (!existing) {
      const c: Control = { schema: 'evidence-desk.control/1', id: lib.id, title: lib.title, description: lib.description, criteria: lib.criteria,
        frequency: lib.frequency, policies: lib.policies, evidence_expected: lib.evidence, applicable: !reason, owner: '', status: 'not-started', catalog: lib.id };
      if (reason) c.exclusion_reason = reason;
      valid('control', c, rel);
      writeVersioned(root, rel, pretty(c), null);
      out.created.push(lib.id);
      continue;
    }
    if (existing.data.catalog !== lib.id) continue;
    const wantApplicable = !reason;
    if (existing.data.applicable !== wantApplicable || (reason && existing.data.exclusion_reason !== reason)) {
      const c = { ...existing.data, applicable: wantApplicable };
      if (reason) c.exclusion_reason = reason; else delete c.exclusion_reason;
      writeVersioned(root, rel, pretty(c), existing.version);
      out.changed.push(lib.id);
    }
  }
  for (const id of needed) {
    if (ws.policies.some((p) => p.data.id === id)) continue;
    const t = policyTemplates.find((x) => x.id === id);
    if (!t) throw new Error(`the library names policy ${id}, which has no template`);
    const rec: Policy = { schema: 'evidence-desk.policy/1', id, title: t.title, owner: '', versions: [] };
    writeVersioned(root, `policies/${id}.md`, render(t.text, answers), null);
    writeVersioned(root, `policies/${id}.json`, pretty(rec), null);
    out.policies.push(id);
  }
  for (const f of formTemplates) {
    if (!f.controls.some((c) => applicable.has(c)) || ws.forms.some((x) => x.data.id === f.id)) continue;
    writeVersioned(root, `forms/${f.id}.json`, pretty(f), null);
    out.forms.push(f.id);
  }
  return out;
}

function readRecord<T>(root: string, rel: string): { data: T; version: string } {
  const r = readVersioned(root, rel);
  if (!r) throw new Error(`${rel} does not exist`);
  return { data: JSON.parse(r.text) as T, version: r.version };
}

const CONTROL_EDITABLE = ['owner', 'status', 'notes', 'applicable', 'exclusion_reason'] as const;
export function updateControl(root: string, id: string, patch: Record<string, unknown>, version: string): void {
  const rel = `controls/${id}.json`;
  const cur = readRecord<Control>(root, rel);
  const next = { ...cur.data } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (!(CONTROL_EDITABLE as readonly string[]).includes(k)) throw new Error(`${k} cannot be changed here; edit ${rel} directly if you mean to`);
    next[k] = v;
  }
  if (next.applicable === true) delete next.exclusion_reason;
  valid('control', next, rel);
  const people = loadWorkspace(root).registers.people?.data.rows.map((r) => r.id) ?? [];
  if (next.owner && !people.includes(String(next.owner))) throw new Error(`owner ${next.owner} is not in registers/people.csv`);
  if (next.applicable === false && !String(next.exclusion_reason ?? '').trim()) throw new Error('excluding a control needs an exclusion_reason');
  writeVersioned(root, rel, pretty(next), version);
}

export function setPolicyOwner(root: string, id: string, owner: string, version: string): void {
  const rel = `policies/${id}.json`;
  const cur = readRecord<Policy>(root, rel);
  const people = loadWorkspace(root).registers.people?.data.rows.map((r) => r.id) ?? [];
  if (owner && !people.includes(owner)) throw new Error(`owner ${owner} is not in registers/people.csv`);
  writeVersioned(root, rel, pretty({ ...cur.data, owner }), version);
}

export function savePolicyText(root: string, id: string, text: string, version: string): void {
  if (!existsSync(join(root, 'policies', `${id}.json`))) throw new Error(`policy ${id} does not exist`);
  writeVersioned(root, `policies/${id}.md`, text, version);
}

export const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]))];

// Freezes the current text as the next approved version. `textVersion` is the version of the text the approver read.
export function approvePolicy(root: string, id: string, approvedBy: string, textVersion: string, recordVersion: string): number {
  const rel = `policies/${id}.json`;
  const rec = readRecord<Policy>(root, rel);
  if (rec.version !== recordVersion) throw new Error(`${rel} changed on disk since it was read; reload it and approve again`);
  const text = readVersioned(root, `policies/${id}.md`);
  if (!text) throw new Error(`policies/${id}.md is missing`);
  if (text.version !== textVersion) throw new Error(`policies/${id}.md changed since you read it; review the current text before approving`);
  if (!approvedBy.trim()) throw new Error('the approver is required');
  const people = loadWorkspace(root).registers.people?.data.rows.map((r) => r.id) ?? [];
  if (!people.includes(approvedBy)) throw new Error(`approver ${approvedBy} is not in registers/people.csv`);
  const left = placeholders(text.text);
  if (left.length) throw new Error(`fill in ${left.map((p) => `{{${p}}}`).join(', ')} before approving`);
  // A template's own drafting comment says it is not yet the organization's policy.
  if (/<!--\s*Template adapted from/.test(text.text)) throw new Error(`policies/${id}.md is still the catalog template: adapt it to how the organization operates and remove its drafting comment before approving`);
  const last = rec.data.versions.at(-1);
  if (last && last.sha256 === text.version) throw new Error(`version ${last.version} already approved this exact text`);
  const version = (last?.version ?? 0) + 1;
  const archived = `policies/archive/${id}.v${version}.md`;
  writeVersioned(root, archived, text.text, null);
  const next = { ...rec.data, versions: [...rec.data.versions, { version, approved_by: approvedBy, approved_at: now(), sha256: text.version, archived }] };
  valid('policy', next, rel);
  writeVersioned(root, rel, pretty(next), rec.version);
  // The approval is GOV-04's evidence, as a passed form response is its form's.
  if (loadWorkspace(root).controls.some((c) => c.data.id === 'GOV-04' && c.data.applicable)) addEvidence(root, {
    title: `Policy ${id} version ${version} approved by ${approvedBy}`, controls: ['GOV-04'], files: [archived], recorded_by: approvedBy,
    source: { kind: 'evidence-desk', name: 'policy-approval' }, collected_at: next.versions.at(-1)!.approved_at,
  });
  return version;
}

export function saveRegisterRow(root: string, name: RegisterName, row: Record<string, string>, version: string, replaceId?: string): void {
  if (!REGISTERS.includes(name)) throw new Error(`${name} is not a register`);
  const ws = loadWorkspace(root);
  const reg = ws.registers[name];
  if (!reg) throw new Error(`registers/${name}.csv could not be read`);
  if (reg.version !== version) throw new Error(`registers/${name}.csv changed on disk since it was read; reload it and apply the change again`);
  const clean = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '').trim()]));
  const errs = check(schema(`register-${name}`), clean);
  if (errs.length) throw new Error(`the row is invalid: ${errs.join('; ')}`);
  const rows = [...reg.data.rows];
  const at = replaceId === undefined ? -1 : rows.findIndex((r) => r.id === replaceId);
  if (replaceId !== undefined && at < 0) throw new Error(`${replaceId} is not in registers/${name}.csv`);
  if (rows.some((r, i) => r.id === clean.id && i !== at)) throw new Error(`${clean.id} is already in registers/${name}.csv`);
  const columns = [...reg.data.columns];
  for (const k of Object.keys(clean)) if (!columns.includes(k)) columns.push(k);
  if (at >= 0) rows[at] = { ...rows[at], ...clean }; else rows.push(clean);
  writeVersioned(root, `registers/${name}.csv`, writeCsv({ columns, rows }), version);
}

// Records evidence. Each file is either already inside the workspace (a relative path) or copied in from outside;
// a copied file lands under evidence/files/<record id>/ and is never overwritten.
export function addEvidence(root: string, input: {
  title: string; controls: string[]; files: string[]; recorded_by: string; period?: { start: string; end: string };
  source?: Evidence['source']; notes?: string; collected_at?: string; subject?: string;
}): string {
  const ws = loadWorkspace(root);
  const ids = new Set(ws.controls.map((c) => c.data.id));
  for (const c of input.controls) if (!ids.has(c)) throw new Error(`control ${c} does not exist`);
  if (!input.controls.length) throw new Error('name at least one control this evidence supports');
  if (!input.files.length) throw new Error('name at least one file');
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === input.recorded_by)) throw new Error(`recorder ${input.recorded_by} is not in registers/people.csv`);
  const id = `EV-${clockDate().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex')}`;
  const files = input.files.map((f) => {
    const outside = resolve(f);
    const isOutside = f.startsWith('/') || f.startsWith('.') || !existsSync(join(root, f));
    if (!isOutside) { const h = fileHash(root, f); if (!h) throw new Error(`${f} is not a file`); return { path: f, ...h }; }
    if (!existsSync(outside)) throw new Error(`${f} does not exist`);
    const rel = `evidence/files/${id}/${basename(outside)}`;
    inside(root, rel);
    writeVersioned(root, rel, readFileSync(outside), null);
    return { path: rel, ...fileHash(root, rel)! };
  });
  const rec: Evidence = { schema: 'evidence-desk.evidence/1', id, title: input.title, controls: input.controls, source: input.source ?? { kind: 'manual' },
    collected_at: input.collected_at ?? now(), files, recorded_by: input.recorded_by };
  if (input.period) rec.period = input.period;
  if (input.notes) rec.notes = input.notes;
  if (input.subject) rec.subject = input.subject;
  valid('evidence', rec, 'the evidence record');
  writeVersioned(root, `evidence/records/${id}.json`, pretty(rec), null);
  return id;
}

// Stores a file uploaded through the local UI, then records it.
export function addEvidenceUpload(root: string, input: Omit<Parameters<typeof addEvidence>[1], 'files'> & { filename: string; bytes: Buffer }): string {
  const name = basename(input.filename).replace(/[^A-Za-z0-9._-]/g, '_') || 'upload';
  const staging = `evidence/files/uploads/${Date.now()}-${randomBytes(3).toString('hex')}-${name}`;
  writeVersioned(root, staging, input.bytes, null);
  return addEvidence(root, { ...input, files: [staging] });
}

