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
import { adopt } from './actions.ts';
import { loadWorkspace } from './workspace.ts';

export type Requirement = FrameworkRequirement;
export type Settings = { schema: string; framework: string; exclusions?: Record<string, string>; mappings?: Record<string, string[]> };
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
// changes the list; once the control set is adopted, adoption runs again so the needed controls' files, policies and
// forms exist. Nothing is deleted: a dropped framework's settings and evidence stay for when it is targeted again.
function setTargets(root: string, next: (current: string[]) => string[]): string[] {
  const m = readVersioned(root, 'evidence-desk.json');
  if (!m) throw new Error('evidence-desk.json is missing');
  const doc = JSON.parse(m.text);
  const targets = next(doc.frameworks ?? ['soc2']);
  if (targets.join() === (doc.frameworks ?? []).join()) return targets;
  doc.frameworks = targets;
  writeVersioned(root, 'evidence-desk.json', JSON.stringify(doc, null, 2) + '\n', m.version);
  if (loadWorkspace(root).controls.length) adopt(root);
  return targets;
}
export function targetFramework(root: string, id: string): string[] {
  if (id !== 'soc2') framework(id);
  return setTargets(root, (t) => (t.includes(id) ? t : [...t, id]));
}
export function dropFramework(root: string, id: string): string[] {
  if (id === 'soc2') throw new Error('SOC 2 is always a target: Evidence Desk is the program for companies pursuing SOC 2 (docs/decisions/0002-frameworks-are-targets.md)');
  return setTargets(root, (t) => t.filter((x) => x !== id));
}

export function decide(root: string, id: string, requirement: string, input: { exclude?: string; include?: boolean; controls?: string[] }, known: string[]): void {
  const fw = framework(id);
  if (!fw.requirements.some((r) => r.id === requirement)) throw new Error(`${requirement} is not a requirement of ${fw.title}`);
  const { data, version } = readSettings(root, id);
  if (input.exclude !== undefined) {
    if (!input.exclude.trim()) throw new Error('an exclusion needs its reason');
    data.exclusions = { ...(data.exclusions ?? {}), [requirement]: input.exclude.trim() };
  }
  if (input.include) { const { [requirement]: _gone, ...rest } = data.exclusions ?? {}; data.exclusions = rest; }
  if (input.controls) {
    for (const c of input.controls) if (!known.includes(c)) throw new Error(`control ${c} is not in this workspace`);
    data.mappings = { ...(data.mappings ?? {}), [requirement]: [...new Set([...(data.mappings?.[requirement] ?? []), ...input.controls])] };
  }
  writeVersioned(root, `frameworks/${id}.json`, JSON.stringify(data, null, 2) + '\n', version);
}

export type RequirementState = { id: string; group: string; title: string; controls: string[]; status: 'ready' | 'gaps' | 'excluded' | 'unaddressed'; reason?: string; gaps: string[]; evidence: string[]; implementation: 'implemented' | 'partial' | 'not implemented' | 'not applicable' };

export function frameworkState(ws: Workspace, id: string, asOf = clockDate()) {
  const fw = framework(id);
  const settings = readSettings(ws.root, id).data;
  const soc2 = computeGaps(ws, asOf);
  const byControl = new Map(soc2.controls.map((c) => [c.id, c]));
  const controls = new Map(ws.controls.map((c) => [c.data.id, c.data]));
  const requirements: RequirementState[] = fw.requirements.map((r) => {
    const mapped = [...new Set([...r.controls, ...(settings.mappings?.[r.id] ?? [])])].filter((c) => controls.has(c));
    const applicable = mapped.filter((c) => controls.get(c)!.applicable);
    const evidence = [...new Set(ws.evidence.filter((e) => e.data.controls.some((c) => applicable.includes(c))).map((e) => e.data.id))];
    const base = { id: r.id, group: r.group, title: r.title, controls: applicable, evidence };
    if (settings.exclusions?.[r.id]) return { ...base, status: 'excluded' as const, reason: settings.exclusions[r.id], gaps: [], implementation: 'not applicable' as const };
    if (!applicable.length && mapped.length) return { ...base, status: 'excluded' as const, reason: mapped.map((c) => `${c}: ${controls.get(c)!.exclusion_reason}`).join(' '), gaps: [], implementation: 'not applicable' as const };
    if (!applicable.length) return { ...base, status: 'unaddressed' as const, gaps: ['no control addresses this requirement: map a control to it, or exclude it with a reason'], implementation: 'not implemented' as const };
    const gaps = applicable.filter((c) => (byControl.get(c)?.gaps.length ?? 1) > 0).map((c) => `${c} is not ready`);
    const done = applicable.filter((c) => controls.get(c)!.status === 'implemented').length;
    return { ...base, status: gaps.length ? 'gaps' as const : 'ready' as const, gaps, implementation: done === applicable.length ? 'implemented' as const : done ? 'partial' as const : 'not implemented' as const };
  });
  // Evidence that also serves SOC 2: SOC 2's own count, over the controls in its scope.
  const socEvidence = new Set(ws.evidence.filter((e) => e.data.controls.some((c) => { const x = controls.get(c); return x ? inSoc2Scope(ws, x) : false; })).map((e) => e.data.id));
  const shared = new Set(requirements.flatMap((r) => r.evidence).filter((e) => socEvidence.has(e)));
  return { framework: id, title: fw.title, requirements, summary: {
    requirements: requirements.length, ready: requirements.filter((r) => r.status === 'ready').length, excluded: requirements.filter((r) => r.status === 'excluded').length,
    unaddressed: requirements.filter((r) => r.status === 'unaddressed').length, shared_evidence: shared.size } };
}

// The statement of applicability: every Annex A control, whether it is included and why, how far it is implemented,
// and the evidence behind it.
export function statementOfApplicability(ws: Workspace): { columns: string[]; rows: Record<string, string>[] } {
  const st = frameworkState(ws, 'iso27001');
  return { columns: ['control', 'title', 'included', 'justification', 'implementation', 'addressed_by', 'evidence'], rows: st.requirements.filter((r) => r.id.startsWith('A.')).map((r) => ({
    control: r.id, title: r.title, included: r.status === 'excluded' ? 'no' : 'yes',
    justification: r.status === 'excluded' ? r.reason ?? '' : r.status === 'unaddressed' ? 'Included by default; no control addresses it yet' : `Addressed by ${r.controls.join(', ')}`,
    implementation: r.implementation, addressed_by: r.controls.join(';'), evidence: r.evidence.join(';') })) };
}
