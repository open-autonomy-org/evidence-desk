// The review views of an audit package: what a firm reads first, derived from the files the package carries so every
// line traces to one of them. A control matrix, an exceptions register with management's responses, each automated
// check's history across the period, and one readable page (index.html) that links to the files. Nothing here is new
// evidence; it is an index over the evidence, hashed in the manifest like everything else.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import type { Workspace } from './workspace.ts';
import { categories, categoryAnswer, criteria } from './catalog.ts';
import type { AuditRequest, Engagement } from './audit.ts';

// occurred: when the deviation happened (a merge, a deployment, the first failing reading); detected: when a collector or
// check found it.
// closed_by says what ended an exception: a later reading passing again (not proof of remediation), a later completeness
// check no longer finding the administrator; empty while nothing has.
export type PacketException = { key: string; source: string; controls: string; item: string; detail: string; occurred: string; detected: string; resolved: string; closed_by?: string; response: string; responded_by: string; response_cites?: string; file: string };
// Checks that report events (something happened in the last day) rather than a standing state: a later passing reading
// means only that it did not happen again, so it never closes the exception.
const EVENT_CHECKS = new Set(['github-rule-bypass']);
type Responses = Record<string, { text: string; by: string; at: string; cites?: string[] }>;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const day = (iso: string) => iso.slice(0, 10);
const inside = (iso: string, p: { start: string; end: string }) => !!iso && day(iso) >= p.start && day(iso) <= p.end;

export function readResponses(root: string, id: string): Responses {
  const f = join(root, 'audits', id, 'exceptions.json');
  return existsSync(f) ? ((JSON.parse(readFileSync(f, 'utf8')) as { responses?: Responses }).responses ?? {}) : {};
}

export function buildViews(root: string, ws: Workspace, e: Engagement, reqs: { data: AuditRequest }[], packaged: Set<string>, createdAt: string): Map<string, string> {
  const period = e.period ?? { start: e.as_of ?? day(createdAt), end: e.as_of ?? day(createdAt) };
  const responses = readResponses(root, e.id);
  const evidence = ws.evidence.filter((x) => packaged.has(x.path));
  const exceptions: PacketException[] = [];
  const add = (x: Omit<PacketException, 'response' | 'responded_by'>) => { const r = responses[x.key]; exceptions.push({ ...x, response: r?.text ?? '', responded_by: r ? `${r.by} ${r.at}` : '', response_cites: (r?.cites ?? []).join(';') }); };

  // Populations: a row without an independent approval, and a population read before the period ended.
  for (const ev of evidence) {
    for (const f of ev.data.files.filter((f) => f.path.endsWith('.csv') && f.path.includes('/populations/'))) {
      const t = parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path);
      const itemOf = (r: Record<string, string>) => r.kind === 'direct push' ? `direct push ${r.commit.slice(0, 12)}` : r.number ? `#${r.number}` : r.id ? `deployment ${r.id} (${r.ref})` : r.commit;
      const base = { source: ev.data.title, controls: ev.data.controls.join(';'), detected: day(ev.data.collected_at), resolved: '', file: f.path };
      const at = (r: Record<string, string>) => day(r.merged_at || r.created_at || '');
      if (t.columns.includes('independent_approval')) for (const r of t.rows.filter((r) => r.independent_approval !== 'yes')) {
        const item = itemOf(r);
        const why = r.commit_match === 'no' ? `; the approved run ${r.run} built ${r.run_commit.slice(0, 12)}, not the deployed ${r.sha.slice(0, 12)}` : '';
        add({ ...base, key: `population:${ev.data.controls.join('+')}:${item}`, item, detail: `independent approval: ${r.independent_approval}${r.title ? ` — ${r.title}` : ''}${r.author || r.started_by ? `; by ${r.author || r.started_by}` : ''}${why}`, occurred: at(r) });
      }
      // An approval that predates the commit merged, and a deployment whose run did not succeed, are deviations of their
      // own even where someone else approved.
      if (t.columns.includes('approval_on_merged_head')) for (const r of t.rows.filter((r) => r.approval_on_merged_head === 'no' && r.independent_approval === 'yes'))
        add({ ...base, key: `stale-approval:${ev.data.controls.join('+')}:${itemOf(r)}`, item: itemOf(r), detail: `approved (${r.approvers}) only on an earlier commit than the one merged — ${r.title}`, occurred: at(r) });
      for (const [col, seam] of [['starter_holds_seam', 'production-deploy'], ['approver_holds_seam', 'release-approval']] as const) if (t.columns.includes(col)) for (const r of t.rows.filter((r) => r[col] === 'no'))
        add({ ...base, key: `seam:${seam}:${itemOf(r)}`, item: itemOf(r), detail: `${col === 'starter_holds_seam' ? `started by ${r.started_by}` : `approved by ${r.approved_by}`}, who does not hold the ${seam} seam's scope on the roster`, occurred: at(r) });
      // The declared trigger, once per population: how many deployments did not start from it, and whether the tag rule
      // that would restrict it exists.
      if (t.columns.includes('trigger_as_declared')) { const off = t.rows.filter((r) => r.trigger_as_declared === 'no'); const unruled = t.rows.some((r) => r.declared_tag_rule === 'not configured');
        if (off.length || unruled) add({ ...base, key: `trigger:${ev.data.controls.join('+')}:${f.path.split('/').pop()}`, item: `${off.length} of ${t.rows.length} deployments`, detail: `${off.length ? `not started from the declared tag (${off.map((r) => `${r.ref} by ${r.run_event}`).join(', ')})` : 'every deployment started from the declared tag'}${unruled ? '; no active tag ruleset restricts who may create the declared tag' : ''}`, occurred: day(t.rows.map((r) => r.created_at).sort()[0] ?? '') }); }
      // A configuration change made by someone not on the roster, or by no one the vendor can name, and a rules change
      // that weakened the rules.
      if (t.columns.includes('actor_on_roster')) for (const r of t.rows.filter((r) => r.actor_on_roster !== 'yes'))
        add({ ...base, key: `config-actor:${f.path.split('/').pop()!.replace(/-\d+\.csv$/, '')}:${r.id || `${r.ruleset_id}:${r.version}`}`, item: r.change || `${r.resource} ${r.old_value} → ${r.new_value}`, detail: r.actor ? `changed by ${r.actor}, who is not on the roster` : 'changed by no one the vendor names (a token without a user)', occurred: day(r.at) });
      if (t.columns.includes('weakens')) for (const r of t.rows.filter((r) => r.weakens === 'yes'))
        add({ ...base, key: `weakened:${r.ruleset_id}:${r.version}`, item: `ruleset ${r.ruleset} version ${r.version}`, detail: `${r.change}, by ${r.actor || 'no one named'}`, occurred: day(r.at) });
      // The deploys the pipeline made (those matching an approved GitHub deployment) should run on a credential no person
      // holds; one made with a person's own Cloudflare account puts a human key in the pipeline.
      if (t.columns.includes('github_deployment')) {
        const people = new Set((ws.registers.people?.data.rows ?? []).map((p) => (p.email ?? '').toLowerCase()).filter(Boolean));
        const personal = t.rows.filter((r) => r.matched === 'yes' && people.has(r.author.toLowerCase()));
        if (personal.length) add({ ...base, key: `personal-pipeline-credential:${f.path.split('/').pop()!.replace(/-\d+\.csv$/, '')}`, controls: 'AC-05', item: `${personal.length} pipeline deploy(s) by ${[...new Set(personal.map((r) => r.author))].join(', ')}`, detail: `the deploy workflow's Cloudflare credential belongs to a person (${[...new Set(personal.map((r) => r.author))].join(', ')}), not to a service account`, occurred: day(personal.map((r) => r.at).sort()[0]) });
        // What the account's audit log should hold: each Worker deployment in the same period.
        const cfLog = evidence.filter((x) => x.data.files.some((g) => g.path.includes('/cloudflare-changes-') && g.path.endsWith('.csv'))).at(-1);
        const logCsv = cfLog?.data.files.find((g) => g.path.endsWith('.csv'));
        if (logCsv) {
          const logged = parseCsv(readFileSync(join(root, logCsv.path), 'utf8'), logCsv.path).rows;
          const unlogged = t.rows.filter((r) => !logged.some((l) => l.resource.includes('script') && Math.abs(Date.parse(l.at) - Date.parse(r.at)) < 6e4));
          if (unlogged.length) add({ ...base, key: `audit-log-gap:${logCsv.path.split('/').pop()!.replace(/-\d+\.csv$/, '')}`, controls: 'OPS-04', item: `${unlogged.length} of ${t.rows.length} Worker deployment(s) missing from the account audit log`, detail: `${cfLog!.data.id} is complete for what Cloudflare's audit log returned, but the log lacks deployments ${unlogged.map((r) => r.deployment.slice(0, 8)).join(', ')} that the Workers API lists; the log is not a complete record of changes`, occurred: day(unlogged[0].at), file: logCsv.path });
        }
      }
      if (t.columns.includes('github_deployment')) for (const r of t.rows.filter((r) => r.matched !== 'yes'))
        add({ ...base, key: `unmatched-deploy:${r.deployment}`, item: `Cloudflare deployment ${r.deployment.slice(0, 8)}${r.commit ? ` of ${r.commit.slice(0, 12)}` : ''}`, detail: `reached production ${r.matched === 'no' ? 'with no matching GitHub deployment' : 'with no commit recorded, so it matches no GitHub deployment'}; made by ${r.author || 'no one named'} from ${r.source || 'an unknown source'}${r.message ? ` (${r.message})` : ''}`, occurred: day(r.at) });
      // A restore that did not pass, an internal audit's findings, and the audit's cadence across the period.
      if (t.columns.includes('result') && f.path.includes('/restore-tests-')) for (const r of t.rows.filter((r) => r.result !== 'passed'))
        add({ ...base, key: `restore-failed:${r.id}`, item: `restore test ${r.id} (${r.store})`, detail: `result ${r.result || 'not recorded'}`, occurred: day(r.at) });
      if (f.path.includes('/internal-audits-')) {
        for (const r of t.rows) { let found: string[] = []; try { found = JSON.parse(r.findings || '[]'); } catch { found = r.findings ? [r.findings] : []; }
          found.forEach((x, i) => add({ ...base, key: `audit-finding:${r.id}:${i + 1}`, item: `internal audit ${r.id}`, detail: x, occurred: day(r.at) })); }
        const at = t.rows.map((r) => Date.parse(r.at)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
        const edges = [Date.parse(`${period.start}T00:00:00Z`), ...at, Date.parse(`${period.end}T23:59:59Z`)];
        const gaps = edges.slice(1).map((x, i) => [edges[i], x]).filter(([a, b]) => b - a > 8 * 864e5);
        if (gaps.length) add({ ...base, key: `audit-cadence:${f.path.split('/').pop()!.replace(/-\d+\.csv$/, '')}`, controls: 'MON-04', item: `${gaps.length} gap(s) of more than 8 days between internal audits`, detail: gaps.map(([a, b]) => `${new Date(a).toISOString().slice(0, 10)} to ${new Date(b).toISOString().slice(0, 10)}`).join('; '), occurred: new Date(gaps[0][0]).toISOString().slice(0, 10) });
      }
      // A change merged without its pre-merge checks passing is unverified (CHG-02).
      if (t.columns.includes('checks_passed')) {
        for (const r of t.rows.filter((r) => r.checks_passed === 'no')) add({ ...base, key: `unverified-change:${itemOf(r)}`, controls: 'CHG-02', item: itemOf(r), detail: `merged with checks ${r.checks}`, occurred: at(r) });
        if (t.rows.length && t.rows.every((r) => r.checks_passed === 'none')) add({ ...base, key: `no-checks:${f.path.split('/').pop()!.replace(/-\d+\.csv$/, '')}`, controls: 'CHG-02', item: `${t.rows.length} change(s)`, detail: 'no change carries a check run: nothing verifies a change before it merges', occurred: at(t.rows[0]) });
      }
      if (t.columns.includes('run_conclusion')) for (const r of t.rows.filter((r) => r.run && r.run_conclusion !== 'success'))
        add({ ...base, key: `run:${ev.data.controls.join('+')}:${itemOf(r)}`, item: itemOf(r), detail: `the run ${r.run} that deployed it ended ${r.run_conclusion || 'without a conclusion'}, yet the deployment reads ${r.final_state}`, occurred: at(r) });
    }
    // Only a population can be read early: an act over a period (an access review) is dated by its sign-off.
    if (ev.data.period && ev.data.files.some((f) => f.path.includes('/populations/')) && day(ev.data.collected_at) <= ev.data.period.end) add({ key: `interim:${ev.data.id}`, occurred: day(ev.data.collected_at), source: ev.data.title, controls: ev.data.controls.join(';'), item: 'read before its period ended', detail: `collected ${day(ev.data.collected_at)} for a period ending ${ev.data.period.end}: rows after the collection are missing; collect again after the period ends`, detected: day(ev.data.collected_at), resolved: '', file: ev.path });
  }
  // A change that reached the branch without an independent approval is an emergency change unless shown otherwise, and
  // an emergency change needs its break-glass record: each one the latest break-glass population does not name (by pull
  // request number or commit) is an exception of its own.
  const glass = ws.evidence.filter((x) => x.data.source?.name === 'break-glass seam').sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const glassText = glass ? glass.data.files.map((f) => existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), 'utf8') : '').join('\n') : '';
  for (const ev of evidence.filter((x) => x.data.controls.includes('CHG-01'))) for (const f of ev.data.files.filter((f) => f.path.endsWith('.csv') && f.path.includes('/populations/'))) {
    const t = parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path);
    if (!t.columns.includes('independent_approval') || !t.columns.includes('merged_at')) continue;
    for (const r of t.rows.filter((r) => r.independent_approval !== 'yes')) {
      const ref = r.number ? `#${r.number}` : r.commit.slice(0, 12);
      if (glassText && (glassText.includes(ref) || (r.commit && glassText.includes(r.commit.slice(0, 12))))) continue;
      add({ key: `unrecorded-emergency:${ref}`, source: ev.data.title, controls: 'CHG-04', item: ref, detail: `reached the branch without an independent approval and has no break-glass record${glass ? ` in ${glass.data.id}` : ' (no break-glass population was collected)'}`, occurred: day(r.merged_at), detected: day(ev.data.collected_at), resolved: '', file: f.path });
    }
  }
  // A recorded credential rotation, checked against the vendor: the latest non-human access listing says when the secret
  // of that custody name was last set. A rotation the secret's own date does not show, or a custody name no secret has,
  // is an exception.
  const listing = ws.evidence.filter((x) => x.data.files.some((f) => f.path.includes('/nonhuman-access-') && f.path.endsWith('.csv'))).sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const listingCsv = listing?.data.files.find((f) => f.path.endsWith('.csv'));
  const secrets = listingCsv && packaged.has(listingCsv.path) ? parseCsv(readFileSync(join(root, listingCsv.path), 'utf8'), listingCsv.path).rows.filter((r) => r.kind.endsWith('secret')) : null;
  if (secrets) for (const ev of evidence.filter((x) => x.data.source?.name === 'credentials seam')) for (const f of ev.data.files.filter((f) => f.path.endsWith('.csv'))) {
    for (const r of parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path).rows.filter((r) => r.action === 'rotated' && r.custody_name)) {
      const s = secrets.filter((x) => x.name === r.custody_name);
      const shown = s.some((x) => x.last_set && Math.abs(Date.parse(x.last_set) - Date.parse(r.at)) <= 864e5 || (x.last_set && x.last_set > r.at));
      if (!shown) add({ key: `rotation-unconfirmed:${r.id}`, source: ev.data.title, controls: 'AC-05', item: `${r.custody_name} rotated ${day(r.at)}`, detail: s.length ? `the secret ${r.custody_name} was last set ${s.map((x) => x.last_set || 'at an unknown time').join(', ')}, which does not show the recorded rotation` : `no secret named ${r.custody_name} is in the non-human access listing (${listing!.data.id})`, occurred: day(r.at), detected: day(listing!.data.collected_at), resolved: '', file: listingCsv!.path });
    }
  }
  // An access review whose reviewer decided on their own account: the one decision a review cannot make independently.
  for (const a of ws.accessReviews.filter((x) => packaged.has(`reviews/access/${x.data.id}.json`) && x.data.status === 'signed-off' && inside(x.data.signed_off_at ?? '', period)))
    for (const acct of a.data.accounts.filter((x) => x.person && x.person === a.data.reviewer))
      add({ key: `self-review:${a.data.id}:${acct.account}`, source: `access review ${a.data.id} (${a.data.system})`, controls: 'AC-03', item: acct.account, detail: `the reviewer ${a.data.reviewer} decided on their own access (${acct.decision})`, occurred: day(a.data.signed_off_at ?? ''), detected: day(a.data.signed_off_at ?? ''), resolved: '', file: `reviews/access/${a.data.id}.json` });
  // Signed acts not recorded by their own person.
  if (packaged.has('sources/github/attribution.json')) {
    const a = JSON.parse(readFileSync(join(root, 'sources/github/attribution.json'), 'utf8')) as { checked_at: string; rows: { key: string; person: string; label: string; status: string; author: string; at?: string; committed_at?: string }[] };
    for (const r of a.rows.filter((r) => r.status !== 'verified')) add({ key: `attribution:${r.key}`, occurred: day(r.committed_at || r.at || ''), source: 'attribution check', controls: '', item: `${r.person || '(no one)'}: ${r.label}`, detail: `${r.status}${r.author ? ` (${r.author})` : ''}`, detected: day(a.checked_at), resolved: '', file: 'sources/github/attribution.json' });
  }
  // Administrators outside the roster, as the period's completeness checks of each account found them: one exception per
  // account and administrator, resolved on the first later check of that account that no longer finds them.
  const checksOf = [...packaged].filter((p) => p.startsWith('sources/open-autonomy/completeness/'))
    .map((p) => ({ p, c: JSON.parse(readFileSync(join(root, p), 'utf8')) as { account: string; vendor: string; checked_at: string; outside: string[] } }))
    .filter(({ c }) => inside(c.checked_at, period)).sort((a, b) => a.c.checked_at.localeCompare(b.c.checked_at) || a.p.localeCompare(b.p));
  const seenOutside = new Set<string>();
  checksOf.forEach(({ p, c }, i) => {
    for (const o of c.outside) {
      const key = `completeness:${c.vendor}:${c.account}:${o}`;
      if (seenOutside.has(key)) continue;
      seenOutside.add(key);
      const later = checksOf.slice(i + 1).find((x) => x.c.vendor === c.vendor && x.c.account === c.account && !x.c.outside.includes(o));
      add({ key, occurred: day(c.checked_at), source: `roster completeness, ${c.vendor} ${c.account}`, controls: 'AC-04', item: o, detail: 'administrator not on the roster', detected: day(c.checked_at), resolved: later ? day(later.c.checked_at) : '', closed_by: later ? `a later completeness check (${later.p}) no longer finds them` : '', file: p });
    }
  });
  // Each automated check across the period: every reading, and each run of failing readings as one exception with
  // the reading that ended it.
  const runs = ws.runs.filter((r) => inside(r.data.started_at, period)).sort((a, b) => a.data.started_at.localeCompare(b.data.started_at) || a.path.localeCompare(b.path));
  // Each reading names the collector snapshot it was decided from, with that snapshot's hash, so a pass is traceable to
  // what the vendor answered that day.
  const hashOf = (p: string) => existsSync(join(root, p)) ? createHash('sha256').update(readFileSync(join(root, p))).digest('hex') : 'missing';
  // When the vendor answered, from the snapshot's response headers: a reading the vendor answered far from its run
  // (a cached or replayed answer, a wrong clock) is not a reading of that day.
  const answeredAt = new Map<string, string>();
  const answered = (p: string) => { if (!answeredAt.has(p)) { let d = ''; try { const r = (JSON.parse(readFileSync(join(root, p), 'utf8')) as { responses?: { date?: string }[] }).responses ?? []; const t = r.map((x) => Date.parse(x.date ?? '')).filter((x) => !Number.isNaN(x)); d = t.length ? new Date(Math.min(...t)).toISOString() : ''; } catch { /* missing snapshot */ } answeredAt.set(p, d); } return answeredAt.get(p)!; };
  const history = new Map<string, { at: string; status: string; detail: string; controls: string[]; run: string; snapshot: string; snapshot_sha256: string; answered_at: string }[]>();
  for (const r of runs) for (const res of r.data.results) {
    const snap = r.data.collectors.find((c) => c.id === res.collector)?.snapshot ?? '';
    (history.get(res.check) ?? history.set(res.check, []).get(res.check)!).push({ at: r.data.started_at, status: res.status, detail: res.detail, controls: res.controls, run: r.path, snapshot: snap, snapshot_sha256: snap ? hashOf(snap) : '', answered_at: snap ? answered(snap) : '' });
  }
  for (const [check, rows] of history) {
    const off = rows.filter((x) => x.answered_at && Math.abs(Date.parse(x.answered_at) - Date.parse(x.at)) > 864e5);
    if (off.length) add({ key: `answered-off:${check}`, occurred: day(off[0].at), source: `automated check ${check}`, controls: off[0].controls.join(';'), item: `${off.length} reading(s)`, detail: `the vendor's answer is dated more than a day from the run (first: run ${off[0].at}, answered ${off[0].answered_at}); those readings do not show the day they claim`, detected: day(off[0].at), resolved: '', file: off[0].snapshot });
  }
  for (const [check, rows] of history) {
    let streak: typeof rows = [];
    const close = (end?: { at: string; run: string }) => { if (!streak.length) return; add({ key: `check:${check}:${streak[0].run.split('/').pop()!.replace(/\.json$/, '')}`, occurred: day(streak[0].at), source: `automated check ${check}`, controls: streak[0].controls.join(';'), item: `${streak.length} failing reading(s)`, detail: streak.at(-1)!.detail, detected: day(streak[0].at), resolved: end && !EVENT_CHECKS.has(check) ? day(end.at) : '', closed_by: !end ? '' : EVENT_CHECKS.has(check) ? `not closed by a reading: the check reports events, and ${day(end.at)}'s reading found none new` : `the reading of ${day(end.at)} passed again (${end.run}); remediation is management's to show`, file: streak[0].run }); streak = []; };
    for (const row of rows) { if (row.status === 'fail') streak.push(row); else if (row.status === 'pass') close(row); }
    close();
  }

  const views = new Map<string, string>();
  views.set('review/exceptions.csv', writeCsv({ columns: ['key', 'source', 'controls', 'item', 'detail', 'occurred', 'detected', 'resolved', 'closed_by', 'open_at_period_end', 'response', 'responded_by', 'response_cites', 'file'], rows: exceptions.map((x) => ({ ...x, closed_by: x.closed_by ?? '', open_at_period_end: !x.resolved || x.resolved > period.end ? 'yes' : 'no', response_cites: x.response_cites ?? '' })) }));
  const days = (() => { const out: string[] = []; for (let t = Date.parse(`${period.start}T00:00:00Z`); t <= Date.parse(`${period.end}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; })();
  const coverage = new Map<string, { days: number; pass: number; fail: number; error: number }>();
  for (const [check, rows] of history) {
    views.set(`review/check-history/${check}.csv`, writeCsv({ columns: ['at', 'answered_at', 'status', 'detail', 'run', 'snapshot', 'snapshot_sha256'], rows: rows.map((r) => ({ at: r.at, answered_at: r.answered_at, status: r.status, detail: r.detail, run: r.run, snapshot: r.snapshot, snapshot_sha256: r.snapshot_sha256 })) }));
    const seen = new Set(rows.map((r) => day(r.at)));
    coverage.set(check, { days: days.filter((d) => seen.has(d)).length, pass: rows.filter((r) => r.status === 'pass').length, fail: rows.filter((r) => r.status === 'fail').length, error: rows.filter((r) => r.status === 'error').length });
  }
  // The control matrix: every control, whether it applies, where it is asked for and what evidence the package holds.
  const matrix = ws.controls.map((c) => {
    const d = c.data;
    const ids = evidence.filter((x) => x.data.controls.includes(d.id)).map((x) => x.data.id);
    const checks = [...history.entries()].filter(([, rows]) => rows[0]?.controls.includes(d.id)).map(([k]) => `${k} ${coverage.get(k)!.days}/${days.length} days`);
    // What the workspace holds for the control in the period, packaged or not: an applicable control with none has no
    // evidence of operating, which the firm should see without asking.
    // An annual control's evidence counts from the twelve months before the period's end: a policy approved in June is in
    // force for a July-to-September period.
    const since = d.frequency === 'annual' ? new Date(Date.parse(`${period.end}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10) : period.start;
    const window = { start: since < period.start ? since : period.start, end: period.end };
    const held = ws.evidence.filter((x) => x.data.controls.includes(d.id) && (x.data.period ? x.data.period.start <= window.end && x.data.period.end >= window.start : inside(x.data.collected_at, window))).length;
    return { control: d.id, title: d.title, criteria: d.criteria.join(';'), frequency: d.frequency, owner: d.owner, status: d.status, applicable: d.applicable ? 'yes' : 'no', exclusion_reason: d.exclusion_reason ?? '',
      requests: reqs.filter((r) => r.data.controls.includes(d.id)).map((r) => r.data.id).join(';'), evidence_in_package: ids.join(';'), check_history: checks.join('; '),
      workspace_evidence_in_window: d.applicable ? (held ? `${held} record(s)${window.start < period.start ? ` since ${window.start}` : ''}${checks.length ? ` and ${checks.length} check(s)` : ''}` : checks.length ? `check only (${checks.length}), no evidence record` : 'none') : '',
      records_in_window: String(held),
      exceptions: String(exceptions.filter((x) => x.controls.split(';').includes(d.id)).length) };
  });
  views.set('review/controls-matrix.csv', writeCsv({ columns: ['control', 'title', 'criteria', 'frequency', 'owner', 'status', 'applicable', 'exclusion_reason', 'requests', 'evidence_in_package', 'check_history', 'workspace_evidence_in_window', 'records_in_window', 'exceptions'], rows: matrix }));

  // Coverage by criterion: each criterion of the categories in scope, the applicable controls that address it, and whether
  // any of them has evidence or a check in its window. A criterion in scope with none is the first thing a firm asks about.
  const inScope = new Set(['CC', ...Object.entries(categoryAnswer).filter(([, q]) => ws.scope?.data.answers?.[q] === true).map(([c]) => c)]);
  const byCriterion = criteria.filter((c) => inScope.has(c.category)).map((c) => {
    const ctl = matrix.filter((m) => m.applicable === 'yes' && m.criteria.split(';').includes(c.id));
    // A control counts as evidenced by a record that names it; one covered only by an automated check is shown apart.
    const held = ctl.filter((m) => Number(m.records_in_window) > 0);
    const checkOnly = ctl.filter((m) => Number(m.records_in_window) === 0 && m.workspace_evidence_in_window.startsWith('check only'));
    // Evidence existing says nothing about whether it shows the control working: the exceptions against these controls
    // stand beside it.
    const open = exceptions.filter((x) => x.controls.split(';').some((id) => ctl.some((m) => m.control === id))).length;
    return { criterion: c.id, category: categories[c.category] ?? c.category, title: c.title, controls: ctl.map((m) => m.control).join(';'), controls_with_evidence: held.map((m) => m.control).join(';'),
      requested: [...new Set(ctl.flatMap((m) => m.requests ? m.requests.split(';') : []))].join(';'), exceptions: String(open), check_only: checkOnly.map((m) => m.control).join(';'),
      status: !ctl.length ? 'no applicable control' : !held.length ? (checkOnly.length ? 'automated check only' : 'no evidence') : `evidence for ${held.length} of ${ctl.length} control(s)${checkOnly.length ? `, check only for ${checkOnly.length}` : ''}${open ? `, ${open} exception(s)` : ', no exception'}` };
  });
  views.set('review/coverage.csv', writeCsv({ columns: ['criterion', 'category', 'title', 'controls', 'controls_with_evidence', 'check_only', 'requested', 'exceptions', 'status'], rows: byCriterion }));

  // The readable page.
  const href = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  const link = (p: string, text = p) => `<a href="../workspace/${esc(href(p))}">${esc(text)}</a>`;
  const controlPath = new Map(ws.controls.map((c) => [c.data.id, c.path]));
  const controlLink = (id: string, text = id) => { const p = controlPath.get(id); return p && packaged.has(p) ? link(p, text) : esc(text); };
  const interim = day(createdAt) <= period.end && e.type === 'type2';
  const byId = new Map(evidence.map((x) => [x.data.id, x]));
  const evRow = (id: string) => { const x = byId.get(id); if (!x) return `<li>${esc(id)} (not in the package)</li>`; const d = x.data;
    return `<li><b>${esc(d.id)}</b> ${esc(d.title)}<br><small>${esc(d.source?.kind ?? '')}${d.source?.name ? ` · ${esc(d.source.name)}` : ''} · collected ${esc(d.collected_at)}${d.period ? ` · period ${esc(d.period.start)} to ${esc(d.period.end)}` : ''}</small>${d.source?.query ? `<br><small>Query: <code>${esc(d.source.query)}</code></small>` : ''}${d.notes ? `<br><small>${esc(d.notes)}</small>` : ''}<br>${d.files.map((f) => link(f.path)).join(' · ')}</li>`; };
  // A test memo for a population: how its completeness is established and how many items it holds, so the sample is
  // chosen from the right basis.
  const memo = (id: string) => { const x = byId.get(id); if (!x) return ''; const csv = x.data.files.find((f) => f.path.endsWith('.csv'));
    const n = csv && existsSync(join(root, csv.path)) ? parseCsv(readFileSync(join(root, csv.path), 'utf8'), csv.path).rows.length : 0;
    const basis = x.data.source?.kind === 'collector' ? `read from the system of record (${esc(x.data.source.name ?? '')}), every page, with its raw responses` : x.data.source?.kind === 'open-autonomy' ? 'read from records the organization commits itself; an unrecorded event is not in it, and the exceptions reconcile it with what the collectors saw' : 'recorded by hand';
    return `<p class="memo">Test memo: ${n} item(s), ${basis}. ${n < 25 ? 'Test every item.' : 'Sample from it; it is complete for its basis.'}</p>`; };
  const reqHtml = reqs.map(({ data: r }) => `<section id="${esc(r.id)}"><h3>${esc(r.id)} ${esc(r.title)} <span class="pill">${esc(r.kind)}</span> <span class="pill">${esc(r.status)}</span></h3>
<p>Controls: ${r.controls.map((c) => `<a href="#ctl-${esc(c)}">${esc(c)}</a>`).join(', ')} · Exceptions: ${exceptions.filter((x) => x.controls.split(';').some((c) => r.controls.includes(c))).length}</p>
${r.population ? `<p>Population: <b>${esc(r.population)}</b></p>${memo(r.population)}<ul>${evRow(r.population)}</ul>` : ''}${r.evidence.length ? `<p>Evidence</p><ul>${r.evidence.map(evRow).join('')}</ul>` : ''}
${r.thread.length ? `<details><summary>Thread (${r.thread.length})</summary><ul>${r.thread.map((m) => `<li><b>${esc(m.side)}</b> ${esc(m.by)} ${esc(m.at)}: ${esc(m.text)}</li>`).join('')}</ul></details>` : ''}</section>`).join('\n');
  const excluded = ws.controls.filter((c) => !c.data.applicable);
  views.set('review/index.html', `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ws.manifest?.data.organization)} — ${esc(e.id)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1b1f24}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top;font-size:13px}th{background:#f6f8fa}.pill{font-size:11px;border:1px solid #8c959f;border-radius:10px;padding:1px 7px;font-weight:normal}.none td{background:#ffebe9}.memo{background:#f6f8fa;border-left:3px solid #8c959f;padding:4px 8px}.warn{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px;margin:8px 0}code{font-size:12px}small{color:#57606a}</style></head><body>
<h1>${esc(ws.manifest?.data.organization)}: SOC 2 ${e.type === 'type2' ? 'Type II' : 'Type I'}, engagement ${esc(e.id)}</h1>
<p>${e.type === 'type2' ? `Period ${esc(period.start)} to ${esc(period.end)}` : `As of ${esc(e.as_of)}`} · Firm ${esc(e.firm)} · Package created ${esc(createdAt)} · ${reqs.length} requests · ${evidence.length} evidence records · ${exceptions.length} exceptions</p>
${interim ? `<div class="warn">This package was created on or before the last day of the period: populations and check histories may not cover the period's end. Exceptions list each population read early.</div>` : ''}
<p>Every file below is under <code>workspace/</code> and hashed in <code>manifest.json</code>; these views were derived from those files when the package was made and are hashed too; each line names the file it comes from. Tables: <a href="coverage.csv">coverage.csv</a> · <a href="controls-matrix.csv">controls-matrix.csv</a> · <a href="exceptions.csv">exceptions.csv</a> · <a href="check-history/">check-history/</a> · <a href="workspace-history.txt">workspace-history.txt</a>${existsSync(join(root, 'audits', e.id, 'drafts', 'description.md')) ? ' · <a href="description-lint.csv">description-lint.csv</a>' : ''}. Drafts: ${['description', 'assertion', 'bridge'].filter((k) => existsSync(join(root, 'audits', e.id, 'drafts', `${k}.md`))).map((k) => link(`audits/${e.id}/drafts/${k}.md`, k)).join(', ') || 'none'}.</p>
<h2>Coverage</h2>${(() => { const gaps = byCriterion.filter((c) => c.status === 'no evidence' || c.status === 'no applicable control'); const none = matrix.filter((m) => m.workspace_evidence_in_window === 'none');
  return `<p>${byCriterion.length} criteria in scope: ${byCriterion.filter((c) => c.status.startsWith('evidence') && c.exceptions === '0').length} with evidence and no exception, ${byCriterion.filter((c) => c.status.startsWith('evidence') && c.exceptions !== '0').length} with evidence and exceptions against their controls, ${byCriterion.filter((c) => c.status === 'automated check only').length} backed only by an automated check, ${gaps.length} with no evidence or no applicable control (<a href="coverage.csv">coverage.csv</a>).</p>${gaps.length ? `<div class="warn"><b>No evidence in the window:</b> ${gaps.map((c) => `${esc(c.criterion)} ${esc(c.title)}${c.controls ? ` (${esc(c.controls.replaceAll(';', ', '))})` : ' (no applicable control)'}`).join('; ')}. Applicable controls without evidence: ${none.map((m) => esc(m.control)).join(', ') || 'none'}.</div>` : ''}`; })()}
<h2>Exceptions</h2>${exceptions.length ? `<table><tr><th>Item</th><th>Source</th><th>Controls</th><th>Detail</th><th>Occurred</th><th>Detected</th><th>Closed</th><th>Management response</th></tr>${exceptions.map((x) => `<tr><td>${esc(x.item)}</td><td>${link(x.file, x.source)}</td><td>${esc(x.controls)}</td><td>${esc(x.detail)}</td><td>${esc(x.occurred)}</td><td>${esc(x.detected)}</td><td>${esc(x.resolved)}${x.closed_by ? `<br><small>${esc(x.closed_by)}</small>` : ''}</td><td>${esc(x.response) || '<small>none recorded</small>'}${x.response ? `<br><small>${x.response_cites ? `Cites: ${x.response_cites.split(';').map((c) => link(c)).join(', ')}` : '<b>Cites no evidence</b>'}</small>` : ''}</td></tr>`).join('')}</table>` : '<p>None found in the package.</p>'}
<h2>Automated checks across the period</h2>${history.size ? `<table><tr><th>Check</th><th>Days with a reading</th><th>Pass</th><th>Fail</th><th>Could not decide</th><th>Latest</th></tr>${[...history.entries()].map(([k, rows]) => { const c = coverage.get(k)!; const last = rows.at(-1)!; return `<tr><td><a href="check-history/${esc(href(k))}.csv">${esc(k)}</a></td><td>${c.days} of ${days.length}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.error}</td><td>${esc(last.status)} ${esc(day(last.at))}: ${esc(last.detail)}</td></tr>`; }).join('')}</table>` : '<p>No check ran during the period.</p>'}
<h2>Requests</h2>${reqHtml}
<h2>Control matrix</h2>${(() => { const none = matrix.filter((m) => m.workspace_evidence_in_window === 'none'); return none.length ? `<div class="warn">${none.length} applicable control(s) have no evidence and no check in the period: ${none.map((m) => esc(m.control)).join(', ')}.</div>` : ''; })()}<table><tr><th>Control</th><th>Criteria</th><th>Frequency</th><th>Owner</th><th>Status</th><th>Requests</th><th>Evidence in package</th><th>Checks</th><th>In the period</th><th>Exceptions</th></tr>${matrix.filter((m) => m.applicable === 'yes').map((m) => `<tr id="ctl-${esc(m.control)}"${m.workspace_evidence_in_window === 'none' ? ' class="none"' : ''}><td>${controlLink(m.control)} ${esc(m.title)}</td><td>${esc(m.criteria)}</td><td>${esc(m.frequency)}</td><td>${esc(m.owner)}</td><td>${esc(m.status)}</td><td>${esc(m.requests)}</td><td>${esc(m.evidence_in_package)}</td><td>${esc(m.check_history)}</td><td>${esc(m.workspace_evidence_in_window)}</td><td>${esc(m.exceptions)}</td></tr>`).join('')}</table>
<h2>Out of scope</h2>${excluded.length ? `<ul>${excluded.map((c) => `<li>${esc(c.data.id)} ${esc(c.data.title)}: ${esc(c.data.exclusion_reason ?? '')}</li>`).join('')}</ul>` : '<p>No control is excluded.</p>'}
<p><small>Applicable controls no request names are in the matrix with their evidence; the firm may ask for any of them.</small></p>
</body></html>
`);
  return views;
}
