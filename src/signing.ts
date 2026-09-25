// What a person reads before signing a policy, worked out from the workspace and the library alone (nothing here is
// stored): each line of the text marked as Evidence Desk's template or the organization's own, and what signing it
// commits the organization to, the controls that rest on the policy with how often each is owed. Approving attests to
// the whole text, so every line is shown; the marks only say where the organization's own words are.
import { library } from './catalog.ts';
import { stillTemplate, templateLines } from './actions.ts';
import { neededControls } from './targets.ts';
import type { Workspace } from './workspace.ts';

export type PolicyReading = {
  lines: { text: string; mark: 'template' | 'yours' | 'blank' }[];
  template: boolean; // the text is still the catalog template (stillTemplate): approving it needs the approver's confirmation
  unfilled: string[]; // placeholders left to fill before it can be approved
  commitments: { control: string; title: string; every: string; owner: string }[];
  words: number;
};

const EVERY: Record<string, string> = {
  continuous: 'continuously', 'per-event': 'each time it happens', daily: 'every day', weekly: 'every week', monthly: 'every month',
  quarterly: 'every quarter', semiannual: 'every six months', annual: 'every year',
};

export function policyReading(ws: Workspace, id: string, text: string): PolicyReading {
  const answers = ws.scope?.data.answers ?? {};
  const known = templateLines(id, answers);
  const lines = text.split('\n').map((l) => ({ text: l, mark: !l.trim() ? 'blank' as const : known.has(l.trim()) ? 'template' as const : 'yours' as const }));
  const needed = neededControls(ws);
  const commitments = ws.controls.filter((c) => needed.has(c.data.id) && c.data.applicable)
    .map((c) => ({ c: c.data, lib: library.find((l) => l.id === c.data.id) }))
    .filter(({ lib }) => lib?.policies.includes(id))
    .map(({ c, lib }) => ({ control: c.id, title: c.title, every: EVERY[lib!.frequency] ?? lib!.frequency, owner: c.owner }));
  return {
    lines, template: stillTemplate(id, text, answers),
    unfilled: [...new Set([...text.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]))],
    commitments, words: text.replace(/<!--[\s\S]*?-->/g, '').split(/\s+/).filter(Boolean).length,
  };
}
