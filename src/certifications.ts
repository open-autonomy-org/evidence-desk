// What the organization may claim. A claim of being audited or certified rests on the document an independent auditor or
// certifying body issued (a SOC 2 report, an ISO/IEC 27001 or 42001 certificate, an AIUC-1 certificate), uploaded and
// held here with its hash; a self-attestation is the organization's own and is always shown as such. Without a
// document, what the organization shows is its readiness.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { check, schema } from './schema.ts';
import { readVersioned, writeVersioned } from './files.ts';
import { loadWorkspace } from './workspace.ts';
import { now } from './clock.ts';
import { frameworkDescriptions, type Outcome } from './catalog.ts';

export type Certification = { schema: string; id: string; framework: string; kind: 'audit report' | 'certificate' | 'self-attestation'; issuer: string; issued_on: string;
  period?: { start: string; end: string }; valid_until?: string; target?: string; file: string; sha256: string; recorded_by: string; recorded_at: string };

const DIR = 'certifications';

export function recordCertification(root: string, input: { framework: string; kind: Certification['kind']; issuer: string; issued_on: string; period?: { start: string; end: string }; valid_until?: string; target?: string; file: string; by: string; rendered?: boolean }): Certification {
  if (input.target && !frameworkDescriptions.some((f) => f.id === input.target)) throw new Error(`${input.target} is not a framework Evidence Desk maps; available: ${frameworkDescriptions.map((f) => f.id).join(', ')}`);
  // A self-attestation for a framework that becomes one is made by attest, which refuses while a requirement has no
  // position; an uploaded document cannot stand in for it (docs/decisions/0002-frameworks-are-targets.md).
  // A framework that becomes a self-attestation has no auditor and no certifying body: its only document is the one attest
  // renders, and no other kind may be recorded for it.
  if (input.target && frameworkDescriptions.find((f) => f.id === input.target)?.outcome === 'self-attestation' && !(input.rendered && input.kind === 'self-attestation'))
    throw new Error(`${input.target} has no audit or certificate; its self-attestation is signed with: evidence-desk frameworks <dir> attest ${input.target} --by <person>`);
  if (!(loadWorkspace(root).registers.people?.data.rows ?? []).some((r) => r.id === input.by)) throw new Error(`${input.by || '(none)'} is not in registers/people.csv`);
  if (!existsSync(input.file)) throw new Error(`${input.file} does not exist`);
  if (input.kind === 'certificate' && !input.valid_until) throw new Error('a certificate needs --valid-until, the date it expires');
  const bytes = readFileSync(input.file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const id = `${input.framework.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${input.issued_on}`;
  const ext = (/\.[a-z0-9]+$/i.exec(input.file)?.[0] ?? '.pdf').toLowerCase();
  const file = `${DIR}/${id}${ext}`;
  writeVersioned(root, file, bytes, readVersioned(root, file)?.version ?? null);
  const record: Certification = { schema: 'evidence-desk.certification/1', id, framework: input.framework, kind: input.kind, issuer: input.issuer, issued_on: input.issued_on,
    ...(input.period ? { period: input.period } : {}), ...(input.valid_until ? { valid_until: input.valid_until } : {}), ...(input.target ? { target: input.target } : {}), file, sha256, recorded_by: input.by, recorded_at: now() };
  const errs = check(schema('certification'), record);
  if (errs.length) throw new Error(`the certification record is invalid: ${errs.join('; ')}`);
  const rel = `${DIR}/${id}.json`;
  writeVersioned(root, rel, JSON.stringify(record, null, 2) + '\n', readVersioned(root, rel)?.version ?? null);
  return record;
}

// Every record whose document is still the file it was recorded with; a document dated after today, a certificate past its
// date, or a self-attestation more than a year old is not current.
export function certifications(root: string, today = now().slice(0, 10)): (Certification & { current: boolean; intact: boolean })[] {
  const dir = join(root, DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Certification).map((c) => {
    const intact = existsSync(join(root, c.file)) && createHash('sha256').update(readFileSync(join(root, c.file))).digest('hex') === c.sha256;
    return { ...c, intact, current: intact && c.issued_on <= today && (!c.valid_until || c.valid_until >= today) && (c.kind !== 'self-attestation' || plusYear(c.issued_on) >= today) };
  }).sort((a, b) => b.issued_on.localeCompare(a.issued_on));
}

// How one record may be stated publicly.
export function claimOf(c: Certification): string {
  if (c.kind === 'self-attestation') return `${c.framework}: self-attested by ${c.issuer} on ${c.issued_on}`;
  if (c.kind === 'certificate') return `${c.framework} certificate issued by ${c.issuer} on ${c.issued_on}, valid until ${c.valid_until}`;
  return `${c.framework} report${c.period ? ` for ${c.period.start} to ${c.period.end}` : ''}, issued by ${c.issuer} on ${c.issued_on}; available on request under a confidentiality agreement`;
}

// ── Badges ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The same statements as images, for a README or a project page: one per document held, and a readiness badge for a
// framework no auditor's document covers. A badge never says more than the trust center does. Each carries its tone
// and the day it stops standing (`until`), so a copy published elsewhere (an Open Autonomy project page) lapses on its
// own: a certificate at its expiry; an audit report a year after its period ends (the usual reliance window, after
// which customers ask for a bridge letter), or after it was issued where it records no period; a self-attestation a
// year after it was made; readiness 30 days after it was counted, so a publisher that stops leaves no stale count.
export type Tone = 'positive' | 'info' | 'neutral';
export type Badge = { id: string; label: string; message: string; tone: Tone; until: string; color: string; basis: string };
const COLOR: Record<Tone, string> = { positive: '#2f855a', info: '#2b6cb0', neutral: '#718096' };
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const plusYear = (day: string) => `${Number(day.slice(0, 4)) + 1}${day.slice(4)}`.replace(/-02-29$/, '-02-28');
// Short enough for any badge row: a label of 40 characters and a message of 60.
const fit = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

// A readiness entry is one target: its id, what it can become, and a name pattern for records made before `target` existed.
export function badgesOf(held: Certification[], readiness: { id: string; outcome: Outcome; framework: string; matches: RegExp; ready: number; of: number; unit: string }[], asOf: string): Badge[] {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const badge = (id: string, label: string, message: string, tone: Tone, until: string, basis: string): Badge => ({ id: slug(id), label: fit(label, 40), message: fit(message, 60), tone, until, color: COLOR[tone], basis });
  const out: Badge[] = held.map((c) => c.kind === 'certificate' ? badge(`${c.framework}-${c.kind}`, c.framework, `certified until ${c.valid_until}`, 'positive', c.valid_until!, c.file)
    : c.kind === 'audit report' ? badge(`${c.framework}-${c.kind}`, c.framework, `audited by ${c.issuer}, ${c.issued_on}`.length <= 60 ? `audited by ${c.issuer}, ${c.issued_on}` : `audited ${c.issued_on}`, 'positive', plusYear(c.period?.end ?? c.issued_on), c.file)
    : badge(`${c.framework}-${c.kind}`, c.framework, `self-attested ${c.issued_on}`, 'info', plusYear(c.issued_on), c.file));
  for (const r of readiness) {
    // A document for the target replaces its readiness: an auditor's or certifying body's always, the organization's own
    // self-attestation when that is what the framework becomes. A record without a target is matched by its name.
    // For a framework that becomes a self-attestation, only its attest-signed self-attestation (by exact target) does.
    const replaces = (c: Certification) => r.outcome === 'self-attestation' ? c.kind === 'self-attestation' && c.target === r.id
      : (c.target ? c.target === r.id : r.matches.test(c.framework)) && c.kind !== 'self-attestation';
    if (held.some(replaces)) continue;
    out.push(badge(`${r.framework}-readiness`, r.framework, `readiness ${r.ready}/${r.of} ${r.unit}`, 'neutral', plusDays(asOf, 30), 'readiness'));
  }
  return out;
}

// A flat badge in the common shields style; widths follow the text's length.
export function badgeSvg(b: Badge): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const w = (s: string) => Math.round(s.length * 6.2 + 12);
  const lw = w(b.label), mw = w(b.message), total = lw + mw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${esc(`${b.label}: ${b.message}`)}"><title>${esc(`${b.label}: ${b.message}`)}</title>`
    + `<rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${b.color}"/>`
    + `<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="14" text-anchor="middle">${esc(b.label)}</text><text x="${lw + mw / 2}" y="14" text-anchor="middle">${esc(b.message)}</text></g></svg>\n`;
}
