// Additional frameworks on the same program. A framework's requirements map onto the workspace's controls, so one
// control, one policy and one piece of evidence serve every framework that maps to it. The organization's own decisions
// (a requirement excluded with a reason, or an extra control mapped to it) live in frameworks/<framework>.json.
import { check, schema } from './schema.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { computeGaps } from './gaps.ts';
import type { Workspace } from './workspace.ts';
import { clockDate } from './clock.ts';
import { frameworkCatalogs, type FrameworkCatalog, type FrameworkRequirement } from './catalog.ts';
import { inSoc2Scope } from './targets.ts';
import { adopt, unanswered } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { targetsOf } from './targets.ts';
import { recordCertification } from './certifications.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Requirement = FrameworkRequirement;
export type Position = { position: 'partial' | 'not met'; statement: string; stated_at?: string };
export type Settings = { schema: string; framework: string; exclusions?: Record<string, string>; mappings?: Record<string, string[]>; positions?: Record<string, Position> };
// The frameworks mapped onto the control set by a catalog; SOC 2 keeps its own model and is always a target.
export const FRAMEWORKS = [...frameworkCatalogs.keys()];

export function framework(id: string): FrameworkCatalog {
  const c = frameworkCatalogs.get(id);
  if (!c) throw new Error(`${id} is not a framework Evidence Desk maps; available: ${['soc2', ...FRAMEWORKS].join(', ')}`);
  return c;
}

export function readSettings(root: string, id: string): { data: Settings; version: string | null } {
  const r = readVersioned(root, `frameworks/${id}.json`);
  if (!r) return { data: { schema: 'evidence-desk.framework-settings/1', framework: id }, version: null };
  const data = JSON.parse(r.text);
  const errs = check(schema('framework-settings'), data);
  if (errs.length) throw new Error(`frameworks/${id}.json is invalid: ${errs.join('; ')}`);
  return { data, version: r.version };
}

// Targets (docs/decisions/0002-frameworks-are-targets.md): the frameworks the program aims at. Adding or dropping one
// changes the list; once the control set is adopted, the files, policies and forms that became needed are created
// (applicability is scoping's, so no control's is touched). Nothing is deleted: a dropped framework's settings and
// evidence stay for when it is targeted again.
function setTargets(root: string, next: (current: string[]) => string[]): { targets: string[]; created: string[]; policies: string[]; forms: string[] } {
  const m = readVersioned(root, 'evidence-desk.json');
  if (!m) throw new Error('evidence-desk.json is missing');
  const doc = JSON.parse(m.text);
  const targets = next(doc.frameworks ?? ['soc2']);
  const none = { targets, created: [], policies: [], forms: [] };
  if (targets.join() === (doc.frameworks ?? []).join()) return none;
  // Refuse before writing anything when the adoption the change needs could not run.
  const ws = loadWorkspace(root);
  const adopted = ws.controls.length > 0;
  const broken = ws.problems.filter((x) => x.severity === 'error' && x.file.startsWith('controls/'));
  if (adopted && broken.length) throw new Error(`fix the control files first: ${broken.map((x) => `${x.file}: ${x.message}`).join('; ')}`);
  if (adopted && (!ws.scope || unanswered(ws.scope.data).length)) throw new Error(`answer the scoping questions first: ${ws.scope ? unanswered(ws.scope.data).join(', ') : 'scope.json is missing'}`);
  doc.frameworks = targets;
  writeVersioned(root, 'evidence-desk.json', JSON.stringify(doc, null, 2) + '\n', m.version);
  if (!adopted) return none;
  const r = adopt(root, { createOnly: true });
  return { targets, created: r.created, policies: r.policies, forms: r.forms };
}
export function targetFramework(root: string, id: string): ReturnType<typeof setTargets> {
  if (id !== 'soc2') framework(id);
  return setTargets(root, (t) => (t.includes(id) ? t : [...t, id]));
}
export function dropFramework(root: string, id: string): ReturnType<typeof setTargets> {
  if (id === 'soc2') throw new Error('SOC 2 is always a target: Evidence Desk is the program for companies pursuing SOC 2 (docs/decisions/0002-frameworks-are-targets.md)');
  return setTargets(root, (t) => t.filter((x) => x !== id));
}

// One act on one requirement, said as it happened: a word that replaced another says so, and an act that changed nothing
// says that and writes nothing.
export function decide(root: string, id: string, requirement: string, input: { exclude?: string; include?: boolean; controls?: string[]; position?: Position; clearPosition?: boolean }, known: string[]): string {
  const fw = framework(id);
  // Nothing is written for a framework the program does not target.
  const ws = loadWorkspace(root);
  if (!targetsOf(ws).includes(id)) throw new Error(`${id} is not a target of this workspace`);
  const req = fw.requirements.find((r) => r.id === requirement);
  if (!req) throw new Error(`${requirement} is not a requirement of ${fw.title}`);
  const acts = [input.exclude !== undefined, Boolean(input.include), input.controls !== undefined, Boolean(input.position), Boolean(input.clearPosition)].filter(Boolean).length;
  if (acts !== 1) throw new Error('decide one thing at a time: exclude, include, map, a position or clear');
  const { data, version } = readSettings(root, id);
  const position = data.positions?.[requirement], exclusion = data.exclusions?.[requirement];
  const said = (() => {
    const named = (p: string) => (p === 'partial' ? 'partly met' : 'not met');
    if (input.exclude !== undefined) {
      const reason = input.exclude.trim();
      if (!reason) throw new Error('an exclusion needs its reason');
      if (exclusion === reason) return null;
      data.exclusions = { ...(data.exclusions ?? {}), [requirement]: reason };
      // An exclusion and a stated position cannot both stand: the newer word replaces the older.
      const { [requirement]: _was, ...others } = data.positions ?? {}; data.positions = others;
      return `Excluded ${requirement}${exclusion ? '; this replaces its earlier reason' : ''}${position ? `; this replaces its stated position (${named(position.position)})` : ''}.`;
    }
    if (input.include) {
      if (!exclusion) return null;
      const { [requirement]: _gone, ...rest } = data.exclusions ?? {}; data.exclusions = rest;
      return `Included ${requirement} again.`;
    }
    if (input.controls !== undefined) {
      if (!input.controls.length) throw new Error('say which controls to map: --controls <id>,...');
      for (const c of input.controls) if (!known.includes(c)) throw new Error(`control ${c} is not in this workspace`);
      const had = new Set([...req.controls, ...(data.mappings?.[requirement] ?? [])]);
      const added = [...new Set(input.controls)].filter((c) => !had.has(c));
      if (!added.length) return null;
      data.mappings = { ...(data.mappings ?? {}), [requirement]: [...(data.mappings?.[requirement] ?? []), ...added] };
      return `Mapped ${added.join(', ')} to ${requirement}.`;
    }
    if (input.position) {
      // A stated position on a requirement not met: partial or not met, with what is and is not in place.
      if (input.position.position !== 'partial' && input.position.position !== 'not met') throw new Error('a stated position is partial or not met; met and excluded come from the records');
      const statement = input.position.statement.trim();
      if (!statement) throw new Error('a position needs its statement: what is in place and what is not');
      if (position && position.position === input.position.position && position.statement === statement) return null;
      data.positions = { ...(data.positions ?? {}), [requirement]: { position: input.position.position, statement, stated_at: clockDate().toISOString().slice(0, 10) } };
      const { [requirement]: _was, ...others } = data.exclusions ?? {}; data.exclusions = others;
      return `Stated ${requirement} ${named(input.position.position)}${position ? `; this replaces its stated position (${named(position.position)})` : ''}${exclusion ? '; this replaces its exclusion' : ''}.`;
    }
    if (!position) return null;
    const { [requirement]: _gone, ...rest } = data.positions ?? {}; data.positions = rest;
    return `Cleared the position on ${requirement}.`;
  })();
  if (said === null) {
    // Nothing changed: say why, the one case needing care being an exclusion that follows from the mapped controls.
    if (input.include) {
      // Shown as excluded without an exclusion of its own when every control mapped to it is not applicable.
      const mapped = [...new Set([...req.controls, ...(data.mappings?.[requirement] ?? [])])].map((c) => ws.controls.find((x) => x.data.id === c)?.data).filter((c) => c !== undefined);
      return mapped.length && mapped.every((c) => !c.applicable)
        ? `${requirement} is excluded because its controls do not apply (${mapped.map((c) => c.id).join(', ')}); to include it, include one of those controls or change the scoping answer that excludes them. Nothing changed.`
        : `${requirement} is not excluded; nothing changed.`;
    }
    if (input.clearPosition) return `${requirement} had no stated position; nothing changed.`;
    if (input.controls) { const named = [...new Set(input.controls)]; return `${named.join(', ')} already map${named.length === 1 ? 's' : ''} to ${requirement}; nothing changed.`; }
    return `${requirement} already says that; nothing changed.`;
  }
  writeVersioned(root, `frameworks/${id}.json`, JSON.stringify(data, null, 2) + '\n', version);
  return said;
}

// Not met, stated in one write on each of the given requirements that has neither a stated position nor an exclusion in
// the file as it is now: a word stated meanwhile, from the command line or another page, is never overwritten.
export function stateNotMet(root: string, id: string, requirements: string[], statement: string): string[] {
  const fw = framework(id);
  if (!targetsOf(loadWorkspace(root)).includes(id)) throw new Error(`${id} is not a target of this workspace`);
  if (!statement.trim()) throw new Error('a position needs its statement: what is in place and what is not');
  for (const r of requirements) if (!fw.requirements.some((x) => x.id === r)) throw new Error(`${r} is not a requirement of ${fw.title}`);
  const { data, version } = readSettings(root, id);
  const stated = requirements.filter((r) => !data.positions?.[r] && !data.exclusions?.[r]);
  if (!stated.length) return stated;
  const stated_at = clockDate().toISOString().slice(0, 10);
  data.positions = { ...(data.positions ?? {}), ...Object.fromEntries(stated.map((r) => [r, { position: 'not met' as const, statement: statement.trim(), stated_at }])) };
  writeVersioned(root, `frameworks/${id}.json`, JSON.stringify(data, null, 2) + '\n', version);
  return stated;
}

// `position`: the organization's position on the requirement, what a self-attestation discloses: met (ready), excluded (with
// its reason), or a stated partial or not met; absent while none is stated for a requirement that is not ready.
export type RequirementState = { id: string; group: string; title: string; controls: string[]; optional?: boolean; position?: 'met' | 'excluded' | 'partial' | 'not met'; statement?: string; stated_at?: string; status: 'ready' | 'gaps' | 'excluded' | 'unaddressed'; reason?: string; gaps: string[]; evidence: string[]; implementation: 'implemented' | 'partial' | 'not implemented' | 'not applicable' };

export function frameworkState(ws: Workspace, id: string, asOf = clockDate()) {
  const fw = framework(id);
  const settings = readSettings(ws.root, id).data;
  const soc2 = computeGaps(ws, asOf);
  const byControl = new Map(soc2.controls.map((c) => [c.id, c]));
  const controls = new Map(ws.controls.map((c) => [c.data.id, c.data]));
  // The organization's stated position governs downward: a requirement it says is only partly met, or not met, is shown
  // so even when its mapped controls are ready or excluded. Otherwise ready is met and excluded is excluded.
  const stated = (r: RequirementState): RequirementState => {
    const p = settings.positions?.[r.id];
    // A stated position governs over what is derived, including an exclusion that follows from excluded controls.
    if (p) return { ...r, position: p.position, statement: p.statement, ...(p.stated_at ? { stated_at: p.stated_at } : {}) };
    if (r.status === 'ready') return { ...r, position: 'met' };
    if (r.status === 'excluded') return { ...r, position: 'excluded' };
    return r;
  };
  const requirements: RequirementState[] = fw.requirements.map((r): RequirementState => {
    const mapped = [...new Set([...r.controls, ...(settings.mappings?.[r.id] ?? [])])].filter((c) => controls.has(c));
    const applicable = mapped.filter((c) => controls.get(c)!.applicable);
    const evidence = [...new Set(ws.evidence.filter((e) => e.data.controls.some((c) => applicable.includes(c))).map((e) => e.data.id))];
    const base = { id: r.id, group: r.group, title: r.title, controls: applicable, evidence, ...(r.optional ? { optional: true } : {}) };
    if (settings.exclusions?.[r.id]) return { ...base, status: 'excluded' as const, reason: settings.exclusions[r.id], gaps: [], implementation: 'not applicable' as const };
    if (!applicable.length && mapped.length) return { ...base, status: 'excluded' as const, reason: mapped.map((c) => `${c}: ${controls.get(c)!.exclusion_reason ?? 'excluded without a reason'}`).join(' '), gaps: [], implementation: 'not applicable' as const };
    if (!applicable.length) return { ...base, status: 'unaddressed' as const, gaps: ['no control addresses this requirement: map a control to it, or exclude it with a reason'], implementation: 'not implemented' as const };
    const gaps = applicable.filter((c) => (byControl.get(c)?.gaps.length ?? 1) > 0).map((c) => `${c} is not ready`);
    const done = applicable.filter((c) => controls.get(c)!.status === 'implemented').length;
    return { ...base, status: gaps.length ? 'gaps' as const : 'ready' as const, gaps, implementation: done === applicable.length ? 'implemented' as const : done ? 'partial' as const : 'not implemented' as const };
  }).map(stated);
  // Evidence that also serves SOC 2: SOC 2's own count, over the controls in its scope.
  const socEvidence = new Set(ws.evidence.filter((e) => e.data.controls.some((c) => { const x = controls.get(c); return x ? inSoc2Scope(ws, x) : false; })).map((e) => e.data.id));
  const shared = new Set(requirements.flatMap((r) => r.evidence).filter((e) => socEvidence.has(e)));
  // Readiness counts what the framework requires; an optional requirement is listed with its status but not counted.
  const counted = requirements.filter((r) => !r.optional);
  return { framework: id, title: fw.title, requirements, exclusions: settings.exclusions ?? {}, summary: {
    requirements: counted.length, ready: counted.filter((r) => r.status === 'ready').length, excluded: counted.filter((r) => r.status === 'excluded').length,
    unaddressed: counted.filter((r) => r.status === 'unaddressed').length, optional: requirements.length - counted.length, shared_evidence: shared.size } };
}

// The statement of applicability: every Annex A control, whether it is included and why, how far it is implemented,
// and the evidence behind it.
// For a framework whose catalog marks its Annex A controls (ISO/IEC 27001, ISO/IEC 42001), which certification asks for.
export function statementOfApplicability(ws: Workspace, id: string): { title: string; columns: string[]; rows: Record<string, string>[] } {
  const annex = new Set(framework(id).requirements.filter((r) => r.annex_a).map((r) => r.id));
  if (!annex.size) throw new Error(`${framework(id).title} has no Annex A controls, so it has no statement of applicability`);
  const st = frameworkState(ws, id);
  return { title: st.title, columns: ['control', 'title', 'included', 'justification', 'implementation', 'addressed_by', 'evidence'], rows: st.requirements.filter((r) => annex.has(r.id)).map((r) => ({
    control: r.id, title: r.title, included: r.status === 'excluded' ? 'no' : 'yes',
    justification: r.status === 'excluded' ? r.reason ?? '' : r.status === 'unaddressed' ? 'Included by default; no control addresses it yet' : `Addressed by ${r.controls.join(', ')}`,
    implementation: r.implementation, addressed_by: r.controls.join(';'), evidence: r.evidence.join(';') })) };
}

// A self-attestation (docs/decisions/0002-frameworks-are-targets.md): the organization's own signed statement against a
// framework whose outcome is a self-attestation. It is refused while any required requirement has no position; a person
// on the roster signs; the document is rendered from the program's own records (every requirement, its position and
// statement, the controls and evidence behind a met one) and recorded in certifications/ with its hash and its target.
// It says only what is true: every requirement not met is disclosed in it.
export function attest(root: string, id: string, by: string): { certification: string; file: string; counts: Record<string, number> } {
  const fw = framework(id);
  if (fw.outcome !== 'self-attestation') throw new Error(`${fw.title} becomes ${fw.outcome === 'audit report' ? 'an audit report' : 'a certificate'} from ${fw.issuer}, not a self-attestation: record that document with certifications add`);
  const ws = loadWorkspace(root);
  if (!targetsOf(ws).includes(id)) throw new Error(`${id} is not a target; run: evidence-desk frameworks <dir> target ${id}`);
  const person = (ws.registers.people?.data.rows ?? []).find((r) => r.id === by);
  if (!person) throw new Error(`${by || '(none)'} is not in registers/people.csv`);
  const st = frameworkState(ws, id);
  const open = st.requirements.filter((r) => !r.optional && !r.position);
  if (open.length) throw new Error(`${open.length} requirement(s) have no position; make each ready, exclude it with a reason, or state its position (framework <dir> ${id} position <requirement> --partial|--not-met --statement <text>): ${open.map((r) => r.id).join(', ')}`);
  const org = ws.manifest?.data.organization ?? '';
  const day = clockDate().toISOString().slice(0, 10);
  // Every requirement is shown; an optional one without a position says so.
  const shown = st.requirements;
  const counts: Record<string, number> = { met: 0, excluded: 0, partial: 0, 'not met': 0 };
  for (const r of shown) if (!r.optional && r.position) counts[r.position]++;
  const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const basis = (r: RequirementState) => !r.position ? 'No position stated (optional)' : r.stated_at && (r.position === 'partial' || r.position === 'not met') ? `${r.statement ?? ''} (stated ${r.stated_at})` : r.position === 'met' ? `Controls ${r.controls.join(', ')}; evidence ${r.evidence.join(', ') || 'none recorded'}` : r.position === 'excluded' ? r.reason ?? '' : r.statement ?? '';
  const groups = [...new Set(shown.map((r) => r.group))];
  const text = [`# ${fw.title}: self-attestation of ${org}`, '',
    `${person.name || by} (${by}) attests for ${org} on ${day} that the position stated below for each requirement of ${fw.title} (${fw.version}) is true. This is the organization's own statement, made from its compliance records; it is not an audit or a certification.`, '',
    `Summary: ${counts.met} met, ${counts.excluded} excluded, ${counts.partial} partly met, ${counts['not met']} not met${st.summary.optional ? `; optional requirements are listed too, and not counted` : ''}. Source: ${fw.source.name}${fw.source.url ? `, ${fw.source.url}` : ''}.`, '',
    ...groups.flatMap((g) => [`## ${g}`, '', '| Requirement | Position | Basis |', '|---|---|---|',
      ...shown.filter((r) => r.group === g).map((r) => `| ${r.id} ${cell(r.title)}${r.optional ? ' (optional)' : ''} | ${r.position ?? 'none'} | ${cell(basis(r))} |`), '']),
    `Signed: ${person.name || by} (${by}), ${day}.`, ''].join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'attest-'));
  const tmp = join(dir, `${id}-attestation.md`);
  writeFileSync(tmp, text);
  try {
    const c = recordCertification(root, { framework: fw.title, kind: 'self-attestation', issuer: org || 'the organization', issued_on: day, target: id, file: tmp, by, rendered: true });
    return { certification: c.id, file: c.file, counts };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
