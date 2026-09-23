// What stands between the workspace and readiness: per control, per in-scope criterion, and for the program as a
// whole. Derived on every call from the files; nothing is cached.
import { categories, categoryAnswer, criteria, questions } from './catalog.ts';
import { placeholders, unanswered } from './actions.ts';
import type { Workspace } from './workspace.ts';

const INTERVAL_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 31, quarterly: 92, annual: 366 };

export type ControlGaps = { id: string; title: string; owner: string; status: string; gaps: string[]; evidence: number; last_evidence: string | null };
export type CriterionGaps = { id: string; title: string; category: string; controls: string[]; excluded: { id: string; reason: string }[]; ready: boolean; gaps: string[] };
export type Gaps = {
  as_of: string;
  summary: { controls_applicable: number; controls_ready: number; controls_excluded: number; criteria_in_scope: number; criteria_ready: number; program_gaps: number; problems: number };
  program: string[];
  controls: ControlGaps[];
  criteria: CriterionGaps[];
};

export function computeGaps(ws: Workspace, asOf = new Date()): Gaps {
  const program: string[] = [];
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

  const changedFiles = new Set(ws.problems.filter((p) => p.severity === 'warning' && p.file.startsWith('evidence/records/')).map((p) => p.file));
  const controls: ControlGaps[] = ws.controls.filter((c) => c.data.applicable).map((c) => {
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
    return { id: d.id, title: d.title, owner: d.owner, status: d.status, gaps: g, evidence: ev.length, last_evidence: last };
  });
  const byId = new Map(controls.map((c) => [c.id, c]));

  const inScope = (cat: string) => cat === 'CC' || scope?.answers[categoryAnswer[cat]] === true;
  const crit: CriterionGaps[] = criteria.filter((c) => inScope(c.category)).map((c) => {
    const mapped = ws.controls.filter((x) => x.data.criteria.includes(c.id));
    const applicable = mapped.filter((x) => x.data.applicable).map((x) => x.data.id);
    const excluded = mapped.filter((x) => !x.data.applicable).map((x) => ({ id: x.data.id, reason: x.data.exclusion_reason ?? '' }));
    const g: string[] = [];
    if (!applicable.length) g.push(excluded.length ? 'every mapped control is excluded; confirm the exclusions are justified or carved out to a subservice organization' : 'no control addresses this criterion');
    for (const id of applicable) if (byId.get(id)!.gaps.length) g.push(`${id} is not ready`);
    return { id: c.id, title: c.title, category: categories[c.category], controls: applicable, excluded, ready: applicable.length > 0 && g.length === 0, gaps: g };
  });

  return {
    as_of: asOf.toISOString().slice(0, 10),
    summary: {
      controls_applicable: controls.length, controls_ready: controls.filter((c) => !c.gaps.length).length,
      controls_excluded: ws.controls.filter((c) => !c.data.applicable).length,
      criteria_in_scope: crit.length, criteria_ready: crit.filter((c) => c.ready).length, program_gaps: program.length, problems: errors.length,
    },
    program, controls, criteria: crit,
  };
}
