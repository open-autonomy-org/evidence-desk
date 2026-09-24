// The recurring work people do: completing forms, reviewing access and handling incidents. Each completed act is
// written as its own record and as an evidence record for the controls it supports, so readiness sees it the same
// way it sees any other evidence.
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace, type AccessReview, type Incident, type Response } from './workspace.ts';
import { clockDate, now } from './clock.ts';

const pretty = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const newId = (prefix: string) => `${prefix}-${clockDate().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex')}`;
function valid(name: string, data: unknown, what: string): void {
  const errs = check(schema(name), data);
  if (errs.length) throw new Error(`${what} is invalid: ${errs.join('; ')}`);
}
function requirePerson(root: string, id: string, what: string): void {
  if (!(loadWorkspace(root).registers.people?.data.rows ?? []).some((r) => r.id === id)) throw new Error(`${what} ${id || '(none)'} is not in registers/people.csv`);
}

// Grades and records one person's response. `formVersion` is the version of the form the person was shown.
export function submitResponse(root: string, input: { form: string; person: string; answers: Record<string, string>; formVersion: string; identity: string }): Response {
  const ws = loadWorkspace(root);
  const form = ws.forms.find((f) => f.data.id === input.form);
  if (!form) throw new Error(`form ${input.form} does not exist`);
  if (form.version !== input.formVersion) throw new Error(`forms/${input.form}.json changed since it was shown; reload it and answer again`);
  requirePerson(root, input.person, 'person');
  const f = form.data;
  const answers: Record<string, string> = {};
  let correct = 0, graded = 0, failed = false;
  for (const q of f.questions) {
    const a = String(input.answers[q.id] ?? '').trim();
    if (!a) throw new Error(`answer "${q.prompt}"`);
    if (q.type === 'choice' && !q.options?.includes(a)) throw new Error(`"${a}" is not an option for "${q.prompt}"`);
    if ((q.type === 'yes-no' || q.type === 'attest') && a !== 'yes' && a !== 'no') throw new Error(`answer "${q.prompt}" with yes or no`);
    answers[q.id] = a;
    if (q.correct !== undefined) { graded++; if (a === q.correct) correct++; }
    if (q.required_answer !== undefined && a !== q.required_answer) failed = true;
  }
  const score = graded ? Math.round((correct / graded) * 100) : undefined;
  const passed = !failed && (score === undefined || score >= (f.pass_score ?? 100));
  const id = newId('R');
  const rec: Response = { schema: 'evidence-desk.response/1', id, form: f.id, form_sha256: form.version, person: input.person, submitted_at: now(), answers, passed, identity: input.identity };
  if (score !== undefined) rec.score = score;
  if (f.acknowledges_policies) {
    rec.policies = ws.policies.filter((p) => p.data.versions.length).map((p) => {
      const v = p.data.versions.at(-1)!;
      return { id: p.data.id, version: v.version, sha256: v.sha256 };
    });
    if (!rec.policies.length) throw new Error('no policy has an approved version to acknowledge yet');
  }
  valid('response', rec, 'the response');
  const rel = `forms/responses/${id}.json`;
  writeVersioned(root, rel, pretty(rec), null);
  if (passed) {
    const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
    const controls = f.controls.filter((c) => applicable.has(c));
    if (controls.length) addEvidence(root, {
      title: `${f.title}: ${input.person}${score !== undefined ? ` (${score}%)` : ''}`, controls, files: [rel], recorded_by: input.person, subject: input.person,
      source: { kind: 'evidence-desk', name: 'form-response' }, collected_at: rec.submitted_at,
    });
  }
  return rec;
}

// Starts a review of one system's accounts from a user listing already in the workspace.
export function startAccessReview(root: string, input: { system: string; reviewer: string; start: string; end: string; listing: string; generated_by: string }): string {
  const ws = loadWorkspace(root);
  if (!(ws.registers.systems?.data.rows ?? []).some((r) => r.id === input.system)) throw new Error(`system ${input.system} is not in registers/systems.csv`);
  requirePerson(root, input.reviewer, 'reviewer');
  if (!input.generated_by.trim()) throw new Error('say how the user listing was produced (a query, an export or a screenshot), so its completeness can be checked');
  const listing = readVersioned(root, input.listing);
  if (!listing) throw new Error(`${input.listing} is not a file in the workspace`);
  const lines = listing.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines[0]?.toLowerCase().split(',') ?? [];
  const col = header.indexOf('account') >= 0 ? header.indexOf('account') : header.indexOf('user') >= 0 ? header.indexOf('user') : -1;
  const accounts = (col >= 0 ? lines.slice(1).map((l) => l.split(',')[col]?.trim()) : lines).filter(Boolean).map((account) => ({ account: account!, decision: 'pending' as const }));
  if (!accounts.length) throw new Error(`${input.listing} lists no accounts`);
  const id = newId('AR');
  const rec: AccessReview = { schema: 'evidence-desk.access-review/1', id, system: input.system, period: { start: input.start, end: input.end }, reviewer: input.reviewer,
    listing: { path: input.listing, sha256: listing.version, generated_by: input.generated_by }, accounts, status: 'open' };
  valid('access-review', rec, 'the access review');
  writeVersioned(root, `reviews/access/${id}.json`, pretty(rec), null);
  return id;
}

export function decideAccount(root: string, id: string, version: string, account: string, patch: { decision: string; person?: string; privileged?: boolean; note?: string; done_on?: string }): void {
  const rel = `reviews/access/${id}.json`;
  const cur = readVersioned(root, rel);
  if (!cur) throw new Error(`${rel} does not exist`);
  const rec = JSON.parse(cur.text) as AccessReview;
  if (rec.status === 'signed-off') throw new Error('this review is signed off; start a new review to change decisions');
  const a = rec.accounts.find((x) => x.account === account);
  if (!a) throw new Error(`${account} is not in this review`);
  Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')));
  if (a.person) requirePerson(root, a.person, 'person');
  valid('access-review', rec, rel);
  writeVersioned(root, rel, pretty(rec), version);
}

// Signs off a review whose every account is decided and every removal or change is done, then records it as evidence.
export function signOffAccessReview(root: string, id: string, version: string, by: string): void {
  const rel = `reviews/access/${id}.json`;
  const cur = readVersioned(root, rel);
  if (!cur) throw new Error(`${rel} does not exist`);
  const rec = JSON.parse(cur.text) as AccessReview;
  if (by !== rec.reviewer) throw new Error(`only the reviewer, ${rec.reviewer}, signs off this review`);
  const pending = rec.accounts.filter((a) => a.decision === 'pending').map((a) => a.account);
  if (pending.length) throw new Error(`decide every account first: ${pending.join(', ')}`);
  const undone = rec.accounts.filter((a) => (a.decision === 'remove' || a.decision === 'modify') && !a.done_on).map((a) => a.account);
  if (undone.length) throw new Error(`record when each removal or change was done: ${undone.join(', ')}`);
  rec.status = 'signed-off';
  rec.signed_off_at = now();
  writeVersioned(root, rel, pretty(rec), version);
  const ws = loadWorkspace(root);
  const applicable = new Set(ws.controls.filter((c) => c.data.applicable).map((c) => c.data.id));
  const controls = ['AC-03', ...(rec.accounts.some((a) => a.privileged) ? ['AC-04'] : [])].filter((c) => applicable.has(c));
  if (controls.length) addEvidence(root, {
    title: `Access review of ${rec.system}, ${rec.period.start} to ${rec.period.end}`, controls, files: [rel, rec.listing.path], recorded_by: by,
    period: rec.period, source: { kind: 'evidence-desk', name: 'access-review', query: rec.listing.generated_by }, collected_at: rec.signed_off_at,
  });
}

export function openIncident(root: string, input: { title: string; severity: string; by: string; note: string; detected_at?: string; owner?: string }): string {
  requirePerson(root, input.by, 'reporter');
  if (input.owner) requirePerson(root, input.owner, 'owner');
  const id = newId('INC');
  const rec: Incident = { schema: 'evidence-desk.incident/1', id, title: input.title, severity: input.severity, detected_at: input.detected_at ?? now(), status: 'open',
    timeline: [{ at: now(), by: input.by, note: input.note }] };
  if (input.owner) rec.owner = input.owner;
  valid('incident', rec, 'the incident');
  writeVersioned(root, `incidents/${id}.json`, pretty(rec), null);
  return id;
}

export function updateIncident(root: string, id: string, version: string, input: { by: string; note: string; status?: Incident['status']; customer_impact?: string; notification?: string; review?: string }): void {
  const rel = `incidents/${id}.json`;
  const cur = readVersioned(root, rel);
  if (!cur) throw new Error(`${rel} does not exist`);
  requirePerson(root, input.by, 'person');
  const rec = JSON.parse(cur.text) as Incident;
  if (rec.status === 'closed') throw new Error('this incident is closed');
  if (!input.note.trim()) throw new Error('describe the update');
  rec.timeline.push({ at: now(), by: input.by, note: input.note });
  for (const k of ['customer_impact', 'notification', 'review'] as const) if (input[k]) rec[k] = input[k];
  if (input.status) {
    if (input.status === 'closed') {
      if (!rec.review?.trim()) throw new Error('write the post-incident review before closing');
      if (!rec.notification?.trim()) throw new Error('record who was notified, or why no notification was required, before closing');
      rec.closed_at = now();
    }
    rec.status = input.status;
  }
  valid('incident', rec, rel);
  writeVersioned(root, rel, pretty(rec), version);
  if (rec.status === 'closed') {
    const ws = loadWorkspace(root);
    if (ws.controls.some((c) => c.data.id === 'OPS-03' && c.data.applicable)) addEvidence(root, {
      title: `Incident ${rec.id}: ${rec.title}`, controls: ['OPS-03'], files: [rel], recorded_by: input.by,
      source: { kind: 'evidence-desk', name: 'incident' }, collected_at: rec.closed_at,
    });
  }
}
