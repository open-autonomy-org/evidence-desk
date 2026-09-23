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
