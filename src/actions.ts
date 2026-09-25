// Every change Evidence Desk makes to a workspace. The CLI and the local UI both call these, so they validate and
// refuse the same way. Each edit names the version of the file it read; a file changed since is a conflict.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { writeCsv } from './csv.ts';
import { fileHash, readVersioned, writeVersioned, inside, sha256 } from './files.ts';
import { formTemplates, library, policyTemplates, questions } from './catalog.ts';
import { libraryNeeded, neededControls } from './targets.ts';
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

// Why a library control does not apply to the organization under these answers, or null when it does: its own scoping
// conditions only. Which SOC 2 categories the report covers is SOC 2's scope, worked out when read (targets.ts).
function exclusion(c: (typeof library)[number], answers: Scope['answers']): string | null {
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

// Brings the workspace in line with the library for the current scope and targets. Every library control that carries a
// SOC 2 criterion has a file, so SOC 2's deliverables can name it even when excluded; a control with none gets one only
// once a target needs it. The policies and forms that needed controls name are created. An existing control only has its
// applicability updated; owners, statuses, notes and edited text are never touched, and no file is ever deleted.
// `createOnly` is what a change of targets runs: targets decide what is needed, never what applies, so it only creates
// the files, policies and forms that became needed and leaves every control's applicability, and a person's own
// exclusion, as it is.
export function adopt(root: string, opts: { createOnly?: boolean } = {}): { created: string[]; changed: string[]; policies: string[]; forms: string[] } {
  const ws = loadWorkspace(root);
  if (!ws.scope) throw new Error('scope.json is missing or invalid');
  const missing = unanswered(ws.scope.data);
  if (missing.length) throw new Error(`answer the scoping questions first: ${missing.join(', ')}`);
  const answers = ws.scope.data.answers;
  const out = { created: [] as string[], changed: [] as string[], policies: [] as string[], forms: [] as string[] };
  for (const lib of library) {
    const reason = exclusion(lib, answers);
    const rel = `controls/${lib.id}.json`;
    const existing = ws.controls.find((c) => c.data.id === lib.id);
    if (!existing) {
      if (!lib.criteria.length && (reason || !libraryNeeded(ws, lib.id))) continue;
      const c: Control = { schema: 'evidence-desk.control/1', id: lib.id, title: lib.title, description: lib.description, criteria: lib.criteria,
        frequency: lib.frequency, policies: lib.policies, evidence_expected: lib.evidence, applicable: !reason, owner: '', status: 'not-started', catalog: lib.id };
      if (reason) c.exclusion_reason = reason;
      valid('control', c, rel);
      writeVersioned(root, rel, pretty(c), null);
      out.created.push(lib.id);
      continue;
    }
    if (existing.data.catalog !== lib.id || opts.createOnly) continue;
    const wantApplicable = !reason;
    if (existing.data.applicable !== wantApplicable || (reason && existing.data.exclusion_reason !== reason)) {
      const c = { ...existing.data, applicable: wantApplicable };
      if (reason) c.exclusion_reason = reason; else delete c.exclusion_reason;
      writeVersioned(root, rel, pretty(c), existing.version);
      out.changed.push(lib.id);
    }
  }
  // What the program's work needs, from the controls as they now stand.
  const after = loadWorkspace(root);
  const inPlay = neededControls(after);
  const needed = new Set(after.controls.filter((c) => inPlay.has(c.data.id)).flatMap((c) => c.data.policies));
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
    if (!f.controls.some((c) => inPlay.has(c)) || ws.forms.some((x) => x.data.id === f.id)) continue;
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

// A policy text that is still Evidence Desk's catalog template: it carries the catalog's drafting comment, or it is the
// template word for word. The one test the approval gate and the To sign page share.
const DRAFTING = /^<!--\s*Template adapted from[\s\S]*?-->\n\n?/m;
const norm = (t: string) => t.replace(DRAFTING, '').replace(/\s+/g, ' ').trim();
// The catalog template as the scope's answers fill it in now. Every catalog template carries the drafting comment, which
// only an edit or an as-is confirmation removes; comparing with the filled-in template is the backstop for a copy adopted
// before its template had the comment. A line naming the organization otherwise (after a rename) is not the template.
// Where the text still carries the drafting note, the note names the organization the template was filled in for ("how
// Acme, Inc. actually operates"), and the text is compared with the template filled in under that name, so a rename
// since does not make an untouched template look adapted.
const filledFor = (text: string, answers: Record<string, unknown>): Record<string, unknown> => {
  const named = /<!--\s*Template adapted from[\s\S]*?how ([\s\S]+?) actually operates before approving it\.\s*-->/.exec(text)?.[1];
  return named ? { ...answers, organization: named } : answers;
};
const filledTemplate = (id: string, answers: Record<string, unknown>): string | null => {
  const tpl = policyTemplates.find((t) => t.id === id);
  return tpl ? render(tpl.text, answers as Scope['answers']) : null;
};
// The text is the catalog template word for word, filled in under the name its drafting note gives, or else the scope's
// answers now.
export function unchangedTemplate(id: string, text: string, answers: Record<string, unknown>): boolean {
  const t = filledTemplate(id, filledFor(text, answers));
  return t !== null && norm(t) === norm(text);
}
// The filled-in template's lines, for marking which lines of a text are the template's.
export function templateLines(id: string, text: string, answers: Record<string, unknown>): Set<string> {
  return new Set((filledTemplate(id, filledFor(text, answers)) ?? '').split('\n').map((l) => l.trim()).filter(Boolean));
}
// Still the catalog template: it carries the catalog's drafting comment, or it is the template unchanged.
export function stillTemplate(id: string, text: string, answers: Record<string, unknown>): boolean { return DRAFTING.test(text) || unchangedTemplate(id, text, answers); }

// Freezes the current text as the next approved version. `textVersion` is the version of the text the approver read.
// A text that is still the catalog template is approved only when its approver confirms it is true of how the
// organization operates (`asIs`); the catalog's drafting comment is then removed in the same act, and the approval's
// evidence says the template was approved as is. Every check runs before anything is written.
// Everything an approval checks, before anything is written: the texts as read, the approver, placeholders, the template
// gate. Returns what the approval would write.
function approvalPlan(root: string, id: string, approvedBy: string, textVersion: string, recordVersion: string, asIs: boolean) {
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
  if (left.length) throw new Error(`fill in ${left.map((p) => `{{${p}}}`).join(', ')} in policies/${id}.md before approving`);
  const answers = loadWorkspace(root).scope?.data.answers ?? {};
  const template = stillTemplate(id, text.text, answers);
  const unchanged = unchangedTemplate(id, text.text, answers);
  if (template && !asIs) throw new Error(`policies/${id}.md is still the catalog template: adapt it to how the organization operates, or confirm it is true of how the organization operates as it stands (--as-is on the command line, the confirmation in the app)`);
  const body = text.text.replace(DRAFTING, '');
  const bodyVersion = sha256(body);
  const last = rec.data.versions.at(-1);
  if (last && last.sha256 === bodyVersion) throw new Error(`version ${last.version} of ${id} already approved this exact text`);
  const version = (last?.version ?? 0) + 1;
  const archived = `policies/archive/${id}.v${version}.md`;
  const next = { ...rec.data, versions: [...rec.data.versions, { version, approved_by: approvedBy, approved_at: now(), sha256: bodyVersion, archived }] };
  valid('policy', next, rel);
  return { id, rel, rec, text, body, version, archived, next, template, unchanged, approvedBy };
}

function writeApproval(root: string, p: ReturnType<typeof approvalPlan>): void {
  if (p.body !== p.text.text) writeVersioned(root, `policies/${p.id}.md`, p.body, p.text.version);
  writeVersioned(root, p.archived, p.body, null);
  writeVersioned(root, p.rel, pretty(p.next), p.rec.version);
  // The approval is GOV-04's evidence, as a passed form response is its form's.
  if (neededControls(loadWorkspace(root)).has('GOV-04')) addEvidence(root, {
    title: `Policy ${p.id} version ${p.version} approved by ${p.approvedBy}${p.unchanged ? ', the catalog template confirmed as is' : p.template ? ', adapted from the catalog template' : ''}`, controls: ['GOV-04'], files: [p.archived], recorded_by: p.approvedBy,
    source: { kind: 'evidence-desk', name: 'policy-approval' }, collected_at: p.next.versions.at(-1)!.approved_at,
  });
}

export function approvePolicy(root: string, id: string, approvedBy: string, textVersion: string, recordVersion: string, asIs = false): number {
  const p = approvalPlan(root, id, approvedBy, textVersion, recordVersion, asIs);
  writeApproval(root, p);
  return p.version;
}

// Several policies approved in one change, as one signature: every one is checked before any is written.
export function approvePolicies(root: string, ids: string[], approvedBy: string, asIs = false): { id: string; version: number }[] {
  if (new Set(ids).size !== ids.length) throw new Error('a policy is named twice');
  const plans = ids.map((id) => {
    const text = readVersioned(root, `policies/${id}.md`), rec = readVersioned(root, `policies/${id}.json`);
    if (!text || !rec) throw new Error(`policy ${id} does not exist`);
    return approvalPlan(root, id, approvedBy, text.version, rec.version, asIs);
  });
  for (const p of plans) writeApproval(root, p);
  return plans.map((p) => ({ id: p.id, version: p.version }));
}

export function saveRegisterRow(root: string, name: RegisterName, row: Record<string, string>, version: string, replaceId?: string): void {
  saveRegisterRows(root, name, [replaceId === undefined ? { add: row } : { update: replaceId, set: row }], version);
}

// Several rows in one change: each addition or update is applied in turn to the register as the earlier ones left it,
// every row checked, and the file written once, so a mistake anywhere leaves the register as it was.
export type RegisterChange = { add: Record<string, string> } | { update: string; set: Record<string, string> };
export function saveRegisterRows(root: string, name: RegisterName, changes: RegisterChange[], version: string): void {
  if (!REGISTERS.includes(name)) throw new Error(`${name} is not a register`);
  const ws = loadWorkspace(root);
  const reg = ws.registers[name];
  if (!reg) throw new Error(`registers/${name}.csv could not be read`);
  if (reg.version !== version) throw new Error(`registers/${name}.csv changed on disk since it was read; reload it and apply the change again`);
  const rows = [...reg.data.rows];
  const columns = [...reg.data.columns];
  for (const c of changes) {
    const at = 'update' in c ? rows.findIndex((r) => r.id === c.update) : -1;
    if ('update' in c && at < 0) throw new Error(`${c.update} is not in registers/${name}.csv`);
    const clean = Object.fromEntries(Object.entries({ ...(at >= 0 ? rows[at] : {}), ...('add' in c ? c.add : c.set) }).map(([k, v]) => [k, String(v ?? '').trim()]));
    const errs = check(schema(`register-${name}`), clean);
    if (errs.length) throw new Error(`${'update' in c ? `${c.update}: ` : ''}the row is invalid: ${errs.join('; ')}`);
    if (rows.some((r, i) => r.id === clean.id && i !== at)) throw new Error(`${clean.id} is already in registers/${name}.csv`);
    for (const k of Object.keys(clean)) if (!columns.includes(k)) columns.push(k);
    if (at >= 0) rows[at] = clean; else rows.push(clean);
  }
  writeVersioned(root, `registers/${name}.csv`, writeCsv({ columns, rows }), version);
}

// The controls a collector's evidence will support, settled before it reads anything: when the workspace has none of
// them yet (its scoping unanswered, the controls not adopted, or no target needing them) the collector refuses at once,
// rather than after every page of its source has been read and written.
export function evidencing(root: string, what: string, ids: string[]): string[] {
  const ws = loadWorkspace(root);
  const needed = neededControls(ws);
  const present = new Set(ws.controls.map((c) => c.data.id));
  const use = ids.filter((c) => needed.has(c) && present.has(c));
  if (!use.length) throw new Error(`${what} is evidence for ${ids.join(', ')}, and this workspace has none of them yet: answer the scoping questions and run adopt, or target a framework that needs them, then collect`);
  return use;
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
    // A workspace file that keeps changing (a register, a policy's current text, a top-level settings file) is captured
    // as it stands: the evidence is that version, and the file may be edited afterwards without breaking it.
    const living = !isOutside && (f.startsWith('registers/') || !f.includes('/') || /^policies\/[^/]+\.md$/.test(f));
    if (living) {
      const rel = `evidence/files/${id}/${basename(f)}`;
      writeVersioned(root, rel, readFileSync(join(root, f)), null);
      return { path: rel, ...fileHash(root, rel)! };
    }
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

