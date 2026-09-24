// Access changes on the in-scope systems as a population: every account added to, removed from or re-roled on the
// GitHub organization and the Cloudflare account, from the daily snapshots of their member lists (the vendors' own
// answers), each with the exact time and actor the Cloudflare audit log records where it has one, and joined to the
// person the people register names, so onboarding and offboarding timing can be tested against it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import { writeVersioned } from './files.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { accessChanges } from './packet.ts';

export function collectAccessChanges(root: string, input: { start: string; end: string; by: string }): { evidence: string; rows: number } {
  const ws = loadWorkspace(root);
  const people = ws.registers.people?.data.rows ?? [];
  const latest = existsSync(join(root, 'sources/open-autonomy/latest.json')) ? JSON.parse(readFileSync(join(root, 'sources/open-autonomy/latest.json'), 'utf8')) as { team?: { id: string; github?: string }[] } : {};
  const services = new Set((ws.registers.systems?.data.rows ?? []).filter((x) => /service account/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()));
  const agents = new Set((ws.registers.systems?.data.rows ?? []).filter((x) => /agent/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()));
  const personOf = (account: string) => { const l = account.toLowerCase();
    return (latest.team ?? []).find((m) => (m.github ?? '').toLowerCase() === l)?.id ?? people.find((p) => (p.email ?? '').toLowerCase() === l)?.id; };
  // The Cloudflare audit log's member events, from the latest configuration-changes population covering the period.
  const cfEv = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/cloudflare-changes-') && f.path.endsWith('.csv')) && x.data.period && x.data.period.start <= input.start && x.data.period.end >= input.end)
    .sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const cfFile = cfEv?.data.files.find((f) => f.path.includes('/cloudflare-changes-') && f.path.endsWith('.csv'));
  const memberEvents = cfFile ? parseCsv(readFileSync(join(root, cfFile.path), 'utf8'), cfFile.path).rows.filter((r) => r.resource.startsWith('member ')) : [];
  const rows = accessChanges(root, ws, input).map((c) => {
    const who = personOf(c.account);
    const p = who ? people.find((x) => x.id === who) : undefined;
    const kind = who ? `person (${who})` : services.has(c.account.toLowerCase()) ? 'service account' : agents.has(c.account.toLowerCase()) ? 'agent' : 'unknown';
    // The audit log's event for this change: the latest member event naming the account at or before the snapshot.
    const logged = c.system === 'cloudflare' ? memberEvents.filter((r) => r.at <= c.at && `${r.old_value} ${r.new_value}`.toLowerCase().includes(c.account.toLowerCase())).at(-1) : undefined;
    const day = (logged?.at ?? c.at).slice(0, 10);
    return { seen_at: c.at, system: c.system, account: c.account, kind, change: c.change, role: c.role,
      audit_log_at: logged?.at ?? '', audit_log_actor: logged?.actor ?? '',
      person_start: p?.start_date ?? '', person_end: p?.end_date ?? '',
      // Granted on or after the person's start, and removed on or after their end: the register's dates against the
      // system's. A person with no register dates, or an account that is not a person, is left for the firm.
      within_employment: !p ? '' : c.change === 'removed' ? (p.end_date ? (day >= p.end_date ? 'yes' : 'no') : 'no end date') : (p.start_date ? (day >= p.start_date ? 'yes' : 'no') : 'no start date'),
      snapshot: c.snapshot };
  });
  const rel = `evidence/files/populations/access-changes-${input.start}-${input.end}-${Date.now()}.csv`;
  writeVersioned(root, rel, writeCsv({ columns: ['seen_at', 'system', 'account', 'kind', 'change', 'role', 'audit_log_at', 'audit_log_actor', 'person_start', 'person_end', 'within_employment', 'snapshot'], rows }), null);
  const applicable = new Set(ws.controls.filter((x) => x.data.applicable).map((x) => x.data.id));
  const evidence = addEvidence(root, {
    title: `Population: ${rows.length} access changes on GitHub and Cloudflare, ${input.start} to ${input.end}`, controls: ['AC-02', 'HR-03', 'HR-04'].filter((x) => applicable.has(x)), files: [rel], recorded_by: input.by,
    period: { start: input.start, end: input.end },
    source: { kind: 'collector', name: 'access changes', query: `the daily snapshots of the GitHub organization's members and the Cloudflare account's members, each compared with the day before${cfFile ? `; the member events of ${cfFile.path} for the exact time and actor` : ''}` },
    notes: 'Complete to the day: each daily run lists every member, so every change that lasted past a run is here, seen_at being that run. Access granted and removed between two runs is not; the Cloudflare audit log (audit_log_at) records the exact time where it has the event.',
  });
  return { evidence, rows: rows.length };
}
