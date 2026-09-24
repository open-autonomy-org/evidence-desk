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

export type Certification = { schema: string; id: string; framework: string; kind: 'audit report' | 'certificate' | 'self-attestation'; issuer: string; issued_on: string;
  period?: { start: string; end: string }; valid_until?: string; file: string; sha256: string; recorded_by: string; recorded_at: string };

const DIR = 'certifications';

export function recordCertification(root: string, input: { framework: string; kind: Certification['kind']; issuer: string; issued_on: string; period?: { start: string; end: string }; valid_until?: string; file: string; by: string }): Certification {
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
    ...(input.period ? { period: input.period } : {}), ...(input.valid_until ? { valid_until: input.valid_until } : {}), file, sha256, recorded_by: input.by, recorded_at: now() };
  const errs = check(schema('certification'), record);
  if (errs.length) throw new Error(`the certification record is invalid: ${errs.join('; ')}`);
  const rel = `${DIR}/${id}.json`;
  writeVersioned(root, rel, JSON.stringify(record, null, 2) + '\n', readVersioned(root, rel)?.version ?? null);
  return record;
}

// Every record whose document is still the file it was recorded with; a certificate past its date is not current.
export function certifications(root: string, today = now().slice(0, 10)): (Certification & { current: boolean; intact: boolean })[] {
  const dir = join(root, DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Certification).map((c) => {
    const intact = existsSync(join(root, c.file)) && createHash('sha256').update(readFileSync(join(root, c.file))).digest('hex') === c.sha256;
    return { ...c, intact, current: intact && (!c.valid_until || c.valid_until >= today) };
  }).sort((a, b) => b.issued_on.localeCompare(a.issued_on));
}

// How one record may be stated publicly.
export function claimOf(c: Certification): string {
  if (c.kind === 'self-attestation') return `${c.framework}: self-attested by ${c.issuer} on ${c.issued_on}`;
  if (c.kind === 'certificate') return `${c.framework} certificate issued by ${c.issuer} on ${c.issued_on}, valid until ${c.valid_until}`;
  return `${c.framework} report${c.period ? ` for ${c.period.start} to ${c.period.end}` : ''}, issued by ${c.issuer} on ${c.issued_on}; available on request under a confidentiality agreement`;
}
