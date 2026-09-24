// What the program aims at, and what that asks of each control (docs/decisions/0002-frameworks-are-targets.md).
// `applicable` is the scoping decision alone: a control applies unless one of its own scoping conditions fails. What SOC
// 2's report covers, and what the targets need, are worked out here from the files when read, never stored:
// - a control is in SOC 2's scope when it applies and one of its criteria's categories is in scope (Security always);
// - a control is needed when it is in SOC 2's scope (SOC 2 is always a target), or a targeted framework maps one of its
//   requirements to it (with the organization's own mappings) and that framework's settings do not exclude it.
// SOC 2's deliverables act on controls in SOC 2's scope; the program's work acts on needed controls; a framework's view
// acts on its own requirements' controls.
import type { Workspace } from './workspace.ts';
import { categoryAnswer, criterionCategory, frameworkCatalogs } from './catalog.ts';
import { readVersioned } from './files.ts';

type ControlLike = { id: string; criteria: string[]; applicable: boolean; exclusion_reason?: string };
export const targetsOf = (ws: Workspace): string[] => ws.manifest?.data.frameworks ?? ['soc2'];

export function inSoc2Scope(ws: Workspace, c: ControlLike): boolean {
  if (!c.applicable) return false;
  const answers = ws.scope?.data.answers ?? {};
  return c.criteria.some((cr) => { const cat = criterionCategory.get(cr); return cat === 'CC' || (cat !== undefined && answers[categoryAnswer[cat]] === true); });
}

// Why SOC 2's report leaves a control out, or null when it is in scope. A control that does not apply keeps the reason
// its file gives, whoever wrote it; one excluded only by a category answer gets the text adoption used to write.
export function soc2Exclusion(ws: Workspace, c: ControlLike): string | null {
  if (!c.applicable) return c.exclusion_reason ?? '';
  if (inSoc2Scope(ws, c)) return null;
  return `Its criteria (${c.criteria.join(', ')}) are outside the categories in scope.`;
}

// A control of SOC 2's: one that carries a SOC 2 criterion. Only these appear in SOC 2's deliverables.
export const isSoc2Control = (c: ControlLike): boolean => c.criteria.length > 0;

// The organization's own decisions for a framework: exclusions and extra mappings. An unreadable file adds nothing here;
// validation reports it.
export function settingsOf(root: string, id: string): { exclusions: Record<string, string>; mappings: Record<string, string[]> } {
  try {
    const r = readVersioned(root, `frameworks/${id}.json`);
    const d = r ? JSON.parse(r.text) : {};
    return { exclusions: d.exclusions ?? {}, mappings: d.mappings ?? {} };
  } catch { return { exclusions: {}, mappings: {} }; }
}

export function neededControls(ws: Workspace): Set<string> {
  const out = new Set<string>();
  for (const c of ws.controls) if (inSoc2Scope(ws, c.data)) out.add(c.data.id);
  const applies = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  for (const t of targetsOf(ws)) {
    const cat = frameworkCatalogs.get(t);
    if (!cat) continue;
    const s = settingsOf(ws.root, t);
    for (const r of cat.requirements) {
      if (s.exclusions[r.id]) continue;
      for (const id of [...r.controls, ...(s.mappings[r.id] ?? [])]) if (applies.has(id)) out.add(id);
    }
  }
  return out;
}

// The same rule for a library control that has no file yet: whether adoption should write it.
export function libraryNeeded(ws: Workspace, id: string): boolean {
  for (const t of targetsOf(ws)) {
    const cat = frameworkCatalogs.get(t);
    if (!cat) continue;
    const s = settingsOf(ws.root, t);
    if (cat.requirements.some((r) => !s.exclusions[r.id] && [...r.controls, ...(s.mappings[r.id] ?? [])].includes(id))) return true;
  }
  return false;
}
