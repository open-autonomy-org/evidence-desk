// The content Evidence Desk ships: criteria identifiers with this project's own titles, the control library,
// the scoping questions and the policy templates. Read-only; adoption copies from it into a workspace.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Criterion = { id: string; category: string; title: string };
export type LibraryControl = {
  id: string; title: string; description: string; criteria: string[]; frequency: string; policies: string[];
  evidence: string[]; when?: { answer: string; equals: unknown }[];
};
export type Question = { id: string; type: 'text' | 'boolean'; required: boolean; prompt: string };
export type PolicyTemplate = { id: string; title: string; text: string };

const dir = join(import.meta.dirname, '..', 'catalog');
const json = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;

export const criteriaDoc = json<{ categories: Record<string, string>; criteria: Criterion[] }>('criteria.json');
export const criteria = criteriaDoc.criteria;
export const categories = criteriaDoc.categories;
export const library = json<{ controls: LibraryControl[] }>('controls.json').controls;
export const questions = json<{ questions: Question[] }>('scope-questions.json').questions;

export const policyTemplates: PolicyTemplate[] = readdirSync(join(dir, 'policies')).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const text = readFileSync(join(dir, 'policies', f), 'utf8');
  const title = /^# (.+)$/m.exec(text)?.[1] ?? f;
  return { id: f.replace(/\.md$/, ''), title, text };
});

// The scope answer that brings each optional category into scope; Security (CC) is always in scope.
export const categoryAnswer: Record<string, string> = { A: 'availability', C: 'confidentiality', PI: 'processing_integrity', P: 'privacy' };
export const criterionCategory = new Map(criteria.map((c) => [c.id, c.category]));

export type FormQuestion = { id: string; prompt: string; type: 'choice' | 'yes-no' | 'text' | 'attest'; options?: string[]; correct?: string; required_answer?: string };
export type FormTemplate = {
  schema: string; id: string; title: string; kind: 'quiz' | 'survey' | 'acknowledgment'; intro?: string; controls: string[];
  recurrence: 'onboarding' | 'annual' | 'onboarding-and-annual'; due_within_days: number; pass_score?: number; acknowledges_policies?: boolean; questions: FormQuestion[];
};
export const formTemplates: FormTemplate[] = readdirSync(join(dir, 'forms')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(dir, 'forms', f), 'utf8')) as FormTemplate);

// The frameworks a program can target (docs/decisions/0002-frameworks-are-targets.md). SOC 2 keeps its own model (the
// criteria above, the mapping inside each control); every other framework is a catalog in catalog/frameworks/ whose
// requirements name the controls that address them. `outcome` is what a framework can become with its document.
export type Outcome = 'audit report' | 'certificate' | 'self-attestation';
// `optional`: a requirement the framework lists as supplemental; shown with its status, not counted toward readiness.
export type FrameworkRequirement = { id: string; group: string; title: string; controls: string[]; annex_a?: boolean; optional?: boolean };
export type FrameworkCatalog = { schema: string; id: string; title: string; version: string; outcome: Outcome; issuer: string; source: { name: string; url?: string }; note?: string; requirements: FrameworkRequirement[] };
export type FrameworkDescription = Omit<FrameworkCatalog, 'schema' | 'requirements' | 'note'>;
export const frameworkCatalogs = new Map(readdirSync(join(dir, 'frameworks')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => json<FrameworkCatalog>(join('frameworks', f))).map((c) => [c.id, c] as const));
export const SOC2: FrameworkDescription = { id: 'soc2', title: 'SOC 2', version: 'Trust Services Criteria', outcome: 'audit report', issuer: 'an independent CPA firm',
  source: { name: "AICPA's Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality and Privacy" } };
// Every framework Evidence Desk maps, SOC 2 first.
export const frameworkDescriptions: FrameworkDescription[] = [SOC2, ...[...frameworkCatalogs.values()].map(({ schema: _s, requirements: _r, note: _n, ...d }) => d)];

// How often a control's evidence is due, by its frequency: the one table gaps and obligations both read, so a frequency
// cannot be known to one and missing from the other. Continuous and per-event controls have no interval.
export const INTERVAL_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 31, quarterly: 92, semiannual: 184, annual: 366 };
