// The calendar of what is owed and when, derived from the workspace: periodic controls, each person's onboarding,
// annual and offboarding obligations, vendor reviews, risk reviews, vulnerability deadlines and open incidents.
import type { Workspace } from './workspace.ts';
import { clockDate } from './clock.ts';
import { neededControls } from './targets.ts';
import { INTERVAL_DAYS } from './catalog.ts';

export type Obligation = { kind: 'control' | 'person' | 'vendor' | 'risk' | 'vulnerability' | 'incident'; what: string; controls: string[]; who: string; subject?: string; due: string; state: 'done' | 'due' | 'overdue'; done_on?: string };

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dateOf = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function computeObligations(ws: Workspace, asOf = clockDate()): Obligation[] {
  const today = asOf.getTime();
  const out: Obligation[] = [];
  const state = (due: number): Obligation['state'] => (due < today - DAY ? 'overdue' : 'due');
  const needed = neededControls(ws);
  const applicable = new Map(ws.controls.filter((c) => needed.has(c.data.id)).map((c) => [c.data.id, c.data]));
  const byForm = new Map<string, typeof ws.responses>();
  for (const r of ws.responses) if (r.data.passed) (byForm.get(r.data.form) ?? byForm.set(r.data.form, []).get(r.data.form)!).push(r);

  // Periodic controls not otherwise tracked below: due one interval after their latest evidence.
  const tracked = new Set(ws.forms.flatMap((f) => f.data.controls));
  for (const c of applicable.values()) {
    const days = INTERVAL_DAYS[c.frequency];
    if (!days || tracked.has(c.id)) continue;
    const last = ws.evidence.filter((e) => e.data.controls.includes(c.id)).map((e) => Date.parse(e.data.collected_at)).sort((a, b) => b - a)[0];
    const due = last === undefined ? today : last + days * DAY;
    out.push({ kind: 'control', what: `${c.id} ${c.title}`, controls: [c.id], who: c.owner, due: iso(due), state: last !== undefined && due >= today ? 'done' : state(due), ...(last !== undefined ? { done_on: iso(last) } : {}) });
  }

  for (const p of ws.registers.people?.data.rows ?? []) {
    const left = p.end_date && dateOf(p.end_date) <= today;
    if (!left) {
      const start = p.start_date ? dateOf(p.start_date) : today;
      for (const f of ws.forms) {
        const form = f.data;
        const controls = form.controls.filter((c) => applicable.has(c));
        if (!controls.length) continue;
        const mine = (byForm.get(form.id) ?? []).filter((r) => r.data.person === p.id).map((r) => Date.parse(r.data.submitted_at)).sort((a, b) => b - a);
        const last = mine[0];
        let due: number;
        if (last === undefined) due = start + form.due_within_days * DAY;
        else if (form.recurrence === 'onboarding') { out.push({ kind: 'person', what: form.title, controls, who: p.id, due: iso(last), state: 'done', done_on: iso(last) }); continue; }
        else due = last + 366 * DAY;
        const done = last !== undefined && due >= today;
        out.push({ kind: 'person', what: form.title, controls, who: p.id, due: iso(due), state: done ? 'done' : state(due), ...(last !== undefined ? { done_on: iso(last) } : {}) });
      }
      if (applicable.has('HR-01')) {
        const ev = ws.evidence.find((e) => e.data.subject === p.id && e.data.controls.includes('HR-01'));
        const due = p.start_date ? dateOf(p.start_date) : today;
        out.push({ kind: 'person', what: `Background check: ${p.id}`, controls: ['HR-01'], who: applicable.get('HR-01')!.owner, subject: p.id, due: iso(due), state: ev ? 'done' : state(due), ...(ev ? { done_on: ev.data.collected_at.slice(0, 10) } : {}) });
      }
    } else if (applicable.has('HR-04')) {
      const ev = ws.evidence.find((e) => e.data.subject === p.id && e.data.controls.includes('HR-04'));
      const due = dateOf(p.end_date) + DAY;
      // Owed by whoever owns offboarding, never by the person leaving, whose access is what gets removed.
      out.push({ kind: 'person', what: `Offboarding ${p.id}: remove access to every in-scope system`, controls: ['HR-04'], who: applicable.get('HR-04')!.owner, subject: p.id, due: iso(due), state: ev ? 'done' : state(due), ...(ev ? { done_on: ev.data.collected_at.slice(0, 10) } : {}) });
    }
  }

  for (const v of ws.registers.vendors?.data.rows ?? []) {
    if (v.criticality === 'low') continue;
    const last = v.last_review ? dateOf(v.last_review) : undefined;
    const due = last === undefined ? today : last + 366 * DAY;
    out.push({ kind: 'vendor', what: `Vendor review: ${v.name}`, controls: ['VND-02'].filter((c) => applicable.has(c)), who: v.owner, due: iso(due), state: last !== undefined && due >= today ? 'done' : state(due), ...(last !== undefined ? { done_on: v.last_review } : {}) });
  }
  for (const r of ws.registers.risks?.data.rows ?? []) {
    if (r.status === 'closed' || !r.review_due) continue;
    out.push({ kind: 'risk', what: `Risk review: ${r.title}`, controls: ['RISK-02'].filter((c) => applicable.has(c)), who: r.owner, due: r.review_due, state: state(dateOf(r.review_due)) });
  }
  for (const v of ws.registers.vulnerabilities?.data.rows ?? []) {
    const fixed = v.fixed_on ? dateOf(v.fixed_on) : undefined;
    const due = dateOf(v.due_on);
    const controls = ['MON-03'].filter((c) => applicable.has(c));
    if (fixed !== undefined) out.push({ kind: 'vulnerability', what: `Fix vulnerability: ${v.title}${fixed > due ? ' (fixed after its deadline: an exception to report)' : ''}`, controls, who: v.owner, due: v.due_on, state: 'done', done_on: v.fixed_on });
    else out.push({ kind: 'vulnerability', what: `Fix vulnerability: ${v.title} (${v.severity})`, controls, who: v.owner, due: v.due_on, state: state(due) });
  }
  for (const i of ws.incidents) {
    if (i.data.status === 'closed') continue;
    out.push({ kind: 'incident', what: `Close incident ${i.data.id}: ${i.data.title}`, controls: ['OPS-03'].filter((c) => applicable.has(c)), who: i.data.owner ?? '', due: iso(Date.parse(i.data.detected_at)), state: 'due' });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
