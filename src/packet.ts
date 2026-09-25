// The review views of an audit package: what a firm reads first, derived from the files the package carries so every
// line traces to one of them. A control matrix, an exceptions register with management's responses, each automated
// check's history across the period, and one readable page (index.html) that links to the files. Nothing here is new
// evidence; it is an index over the evidence, hashed in the manifest like everything else.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import type { Workspace } from './workspace.ts';
import { categories, categoryAnswer, criteria } from './catalog.ts';
import type { AuditRequest, Engagement } from './audit.ts';
import { inSoc2Scope, isSoc2Control, soc2Exclusion } from './targets.ts';

// occurred: when the deviation happened (a merge, a deployment, the first failing reading); detected: when a collector or
// check found it.
// closed_by says what ended an exception: a later reading passing again (not proof of remediation), a later completeness
// check no longer finding the administrator; empty while nothing has.
export type PacketException = { key: string; source: string; controls: string; item: string; detail: string; occurred: string; detected: string; resolved: string; closed_by?: string; found_by?: string; response: string; responded_by: string; response_cites?: string; file: string };
// Checks that report events (something happened in the last day) rather than a standing state: a later passing reading
// means only that it did not happen again, so it never closes the exception.
const EVENT_CHECKS = new Set(['github-rule-bypass', 'cloudflare-change-actors']);
type Responses = Record<string, { text: string; by: string; at: string; cites?: string[] }>;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const day = (iso: string) => iso.slice(0, 10);
const inside = (iso: string, p: { start: string; end: string }) => !!iso && day(iso) >= p.start && day(iso) <= p.end;

// Access changes from the systems themselves: each daily collector snapshot lists the GitHub organization's members and
// the Cloudflare account's members with their roles, so a member added, removed or given another role shows on the day
// the next snapshot saw it. Complete for what the daily snapshots saw: a change undone within a day does not show.
export function accessChanges(root: string, ws: Workspace, period: { start: string; end: string }): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const runs = ws.runs.filter((r) => r.data.started_at.slice(0, 10) <= period.end).sort((a, b) => a.data.started_at.localeCompare(b.data.started_at));
  for (const system of ['github', 'cloudflare'] as const) {
    let before: Map<string, string> | null = null;
    for (const r of runs) {
      const snap = r.data.collectors.find((c) => c.id === system)?.snapshot;
      if (!snap || !existsSync(join(root, snap))) continue;
      const d = (JSON.parse(readFileSync(join(root, snap), 'utf8')) as { data?: { members?: { login?: string; email?: string; role?: string; roles?: string[] }[] } }).data;
      if (!d?.members) continue;
      const now = new Map(d.members.map((m) => [String(m.login ?? m.email), String(m.role ?? (m.roles ?? []).join(' + '))]));
      const at = r.data.started_at;
      if (before && at.slice(0, 10) >= period.start) {
        for (const [who, role] of now) if (!before.has(who)) out.push({ at, system, account: who, change: 'added', role, snapshot: snap });
          else if (before.get(who) !== role) out.push({ at, system, account: who, change: `role ${before.get(who)} → ${role}`, role, snapshot: snap });
        for (const [who, role] of before) if (!now.has(who)) out.push({ at, system, account: who, change: 'removed', role, snapshot: snap });
      }
      before = now;
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

const latestSnapOf = (root: string) => existsSync(join(root, 'sources/open-autonomy/latest.json')) ? JSON.parse(readFileSync(join(root, 'sources/open-autonomy/latest.json'), 'utf8')) as { team?: { github?: string }[] } : null;

export function readResponses(root: string, id: string): Responses {
  const f = join(root, 'audits', id, 'exceptions.json');
  return existsSync(f) ? ((JSON.parse(readFileSync(f, 'utf8')) as { responses?: Responses }).responses ?? {}) : {};
}

export function buildViews(root: string, ws: Workspace, e: Engagement, reqs: { data: AuditRequest }[], packaged: Set<string>, createdAt: string): Map<string, string> {
  const period = e.period ?? { start: e.as_of ?? day(createdAt), end: e.as_of ?? day(createdAt) };
  const responses = readResponses(root, e.id);
  const evidence = ws.evidence.filter((x) => packaged.has(x.path));
  const exceptions: PacketException[] = [];
  // When the package's collection read a file: the date a finding the package made from it was found.
  const collectedOf = (path: string | undefined) => day(evidence.find((x) => x.data.files.some((f) => f.path === path))?.data.collected_at ?? createdAt);
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
      // A record under records/ made by someone who does not hold its seam's scope: the act the record describes was not
      // theirs to take, or to record.
      const seamOf = /\/(incidents|break-glass|credentials|escalations|restore-tests)-/.exec(f.path)?.[1];
      if (seamOf && t.columns.includes('added_by') && existsSync(join(root, 'sources/open-autonomy/latest.json'))) {
        const snap = JSON.parse(readFileSync(join(root, 'sources/open-autonomy/latest.json'), 'utf8')) as { team?: { id: string; name?: string; scopes: string[] }[]; seams?: { id: string; scope: string }[] };
        const scope = snap.seams?.find((x) => x.id === seamOf)?.scope;
        const holders = (snap.team ?? []).filter((m) => scope && m.scopes.includes(scope)).map((m) => m.id);
        if (scope) for (const r of t.rows) {
          const who = (r.by || /^([^<]+)/.exec(r.added_by ?? '')?.[1] || '').trim().toLowerCase();
          if (who && !holders.includes(who)) add({ ...base, key: `seam-authority:${seamOf}:${r.id}`, controls: ev.data.controls.join(';'), item: `${seamOf} record ${r.id} by ${who}`, detail: `the ${seamOf} seam is held by ${scope} (${holders.join(', ') || 'no one'}); ${who} does not hold it`, occurred: day(r.at || r.added_at || '') });
        }
      }
      // A token created in the period while the same owner's earlier token was never revoked: a rotation that left the
      // old credential live.
      if (f.path.includes('/cloudflare-changes-')) {
        // A token's owner is the one the vendor records on the token, not whoever acted: a token can revoke itself.
        const ownerOf = (r: Record<string, string>) => { try { return String(JSON.parse(r.action === 'delete' ? r.old_value : r.new_value)?.owner ?? '') || r.actor; } catch { return r.actor; } };
        const tokens = t.rows.filter((r) => /^token\b/.test(r.resource));
        for (const owner of new Set(tokens.map(ownerOf))) {
          const made = tokens.filter((r) => ownerOf(r) === owner && r.action === 'create'), gone = tokens.filter((r) => ownerOf(r) === owner && r.action === 'delete');
          const madeIn = made.filter((r) => inside(r.at, period)), goneIn = gone.filter((r) => inside(r.at, period));
          if (madeIn.length > goneIn.length)
            add({ ...base, key: `token-not-revoked:${owner}`, controls: 'AC-05', item: `${owner}: ${madeIn.length} token(s) created, ${goneIn.length} revoked in the period`, detail: `more tokens were created (${madeIn.map((r) => day(r.at)).join(', ')}) than revoked: a rotation that left an older token live, or a new token to account for`, occurred: day(madeIn.at(-1)!.at) });
        }
      }
      // A person's own token still live at the period's end is a credential a person holds on the production account; one
      // whose owner deployed Workers with it in the period reached production outside the pipeline.
      if (t.columns.includes('owner_worker_deploys_in_period')) for (const r of t.rows.filter((r) => r.owner_kind !== 'service account' && r.live_at_period_end === 'yes')) {
        const deployed = Number(r.owner_worker_deploys_in_period) > 0;
        add({ ...base, key: `${deployed ? 'personal-deploy-token' : 'personal-token'}:${r.token}`, controls: deployed ? 'AC-05;CHG-03' : 'AC-05', item: `${r.owner}'s token ${r.token}`, detail: `a person's API token live at the period's end (created ${day(r.created_at)})${deployed ? `; its owner deployed Workers ${r.owner_worker_deploys_in_period} time(s) in the period, outside the pipeline's service account` : ''}`, occurred: day(r.created_at), resolved: '' });
      }
      // A production setting a person changed by hand is a change outside the change path unless a break-glass record
      // covers it that day.
      if (t.columns.includes('actor_on_roster')) {
        const bgFile = evidence.flatMap((x) => x.data.files).find((x) => x.path.includes('/break-glass-') && x.path.endsWith('.csv'));
        const glass = bgFile ? parseCsv(readFileSync(join(root, bgFile.path), 'utf8'), bgFile.path).rows : [];
        // A change that puts back the value an earlier hand-made change took away is its remedy, not a second deviation.
        const byHand = t.rows.filter((r) => r.actor_on_roster === 'yes' && r.resource.startsWith('zone_setting') && !glass.some((g) => day(g.at) === day(r.at)));
        const restores = (r: Record<string, string>) => byHand.some((x) => x.at < r.at && x.resource === r.resource && x.zone === r.zone && x.old_value === r.new_value);
        for (const r of byHand.filter((r) => !restores(r))) {
          // The later change that put the value back, itself made by hand, closes it and is named in it.
          const back = byHand.find((x) => x.at > r.at && x.resource === r.resource && x.zone === r.zone && x.new_value === r.old_value);
          add({ ...base, key: `out-of-path-change:${r.id}`, controls: 'OPS-04;CHG-04', item: `${r.resource}${r.zone ? ` on ${r.zone}` : ''} changed ${r.old_value || '(unset)'} → ${r.new_value} by ${r.actor}`, detail: `a production setting changed by hand at ${r.at}, outside the reviewed change path, with no break-glass record that day${bgFile ? ` (${bgFile.path})` : ''}${back ? `; put back to ${back.new_value} by hand by ${back.actor} at ${back.at}, also with no change record` : ''}`, occurred: day(r.at), ...(back ? { resolved: day(back.at), closed_by: `restored by ${back.actor} at ${back.at} (${back.id}), by hand` } : {}) });
        }
      }
      if (t.columns.includes('actor_on_roster')) for (const r of t.rows.filter((r) => r.actor_on_roster === 'no' || r.actor_on_roster === 'unknown'))
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
      // A deployment outside the change path stays live until a later deployment replaces it; when that one is approved,
      // production is back on reviewed code.
      const wsorted = t.columns.includes('github_deployment') ? [...t.rows].sort((a, b) => a.at.localeCompare(b.at)) : [];
      if (t.columns.includes('github_deployment')) for (const r of t.rows.filter((r) => r.matched !== 'yes')) {
        const next = wsorted.find((x) => x.at > r.at);
        const back = next && next.matched === 'yes' ? next : undefined;
        add({ ...base, resolved: back ? day(back.at) : '', closed_by: back ? `replaced in production by ${back.deployment.slice(0, 8)}, the approved GitHub deployment ${back.github_ref} (${back.at})` : next ? `replaced by ${next.deployment.slice(0, 8)}, itself outside the change path` : '', key: `unmatched-deploy:${r.deployment}`, item: `Cloudflare deployment ${r.deployment.slice(0, 8)}${r.commit ? ` of ${r.commit.slice(0, 12)}` : ''}`, detail: `reached production ${r.matched === 'no' ? 'with no matching GitHub deployment' : 'with no commit recorded, so it matches no GitHub deployment'}; made by ${r.author || 'no one named'} from ${r.source || 'an unknown source'}${r.message ? ` (${r.message})` : ''}${r.same_content_as ? `; its script ${r.same_content_as === 'no approved release' ? 'matches no approved release' : `is identical to the approved ${r.same_content_as}`} (Cloudflare's content hash)` : ''}`, occurred: day(r.at) });
      }
      // A restore that did not pass, an internal audit's findings, and the audit's cadence across the period.
      // Every incident in the period is an exception in its own right, resolved when its record closed.
      if (f.path.includes('/incidents-')) for (const r of t.rows)
        add({ ...base, key: `incident:${r.id}`, controls: ev.data.controls.join(';'), item: `incident ${r.id} (${r.severity})`, detail: r.summary, occurred: day(r.detected_at), detected: day(r.detected_at), resolved: r.status === 'closed' ? day(r.last_changed_at || r.detected_at) : '', closed_by: r.status === 'closed' ? `closed with its review (${r.file})` : '' });
      if (t.columns.includes('result') && f.path.includes('/restore-tests-')) for (const r of t.rows.filter((r) => r.result !== 'passed'))
        add({ ...base, key: `restore-failed:${r.id}`, item: `restore test ${r.id} (${r.store})`, detail: `result ${r.result || 'not recorded'}`, occurred: day(r.at) });
      if (f.path.includes('/internal-audits-')) {
        // A finding is resolved by the first later audit in which its item passes.
        const runs = [...t.rows].sort((a, b) => a.at.localeCompare(b.at));
        const statusOf = (r: Record<string, string>, item: string) => { try { return (JSON.parse(r.items || '[]') as { item: string; status: string }[]).find((x) => x.item === item)?.status ?? ''; } catch { return ''; } };
        // One matter, one exception: a finding the audits raise week after week is one row, from the first audit that
        // raised it to the audit that found its item passing again.
        const open = new Map<string, { first: Record<string, string>; last: Record<string, string>; text: string; n: number }>();
        const close = (item: string, by?: Record<string, string>) => { const m = open.get(item); if (!m) return; open.delete(item);
          add({ ...base, key: `audit-finding:${m.first.id}:${item}`, item: `internal audit finding ${item}`, detail: `${m.text} (raised by ${m.n} audit(s), ${day(m.first.at)} to ${day(m.last.at)})`, occurred: day(m.first.at), detected: day(m.first.at), resolved: by ? day(by.at) : '', closed_by: by ? `the internal audit ${by.id} found ${item} passing` : '' }); };
        for (const r of runs) { let found: string[] = []; try { found = JSON.parse(r.findings || '[]'); } catch { found = r.findings ? [r.findings] : []; }
          const raised = new Map(found.map((x) => [/^C\d+/.exec(x)?.[0] ?? x, x]));
          for (const item of [...open.keys()]) if (!raised.has(item) && statusOf(r, item) === 'pass') close(item, r);
          for (const [item, text] of raised) { const m = open.get(item); if (m) { m.last = r; m.n += 1; } else open.set(item, { first: r, last: r, text, n: 1 }); } }
        for (const item of [...open.keys()]) close(item);
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
  // request number or commit) is an exception of its own. Where the package shows the branch is only a release candidate,
  // a merge without review is the review lapse the changes population already lists, not an emergency change: what
  // reaches production is then judged at the deployment (its approval, in the deployments population and the
  // change-releases view). The package shows it with, for the whole period: the deployments of the same repository to
  // the production environment the project declares, each started from the release tag its production workflow declares
  // (so a push to the branch deploys nothing), and the Worker deployments population with every production deployment
  // matched to a GitHub deployment, so nothing reached production another way.
  const covers = (x: (typeof evidence)[number]) => !!x.data.period && x.data.period.start <= period.start && x.data.period.end >= period.end;
  const prod = (latestSnapOf(root) as { rules?: { production_deploy?: { environment?: string | null; tag_trigger?: string | null } | null } } | null)?.rules?.production_deploy;
  const prodEnv = prod?.tag_trigger ? prod.environment ?? null : null;
  const rowsOf = (x: (typeof evidence)[number]) => x.data.files.filter((f) => f.path.endsWith('.csv')).flatMap((f) => parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path).rows);
  const changeRepos = [...new Set(evidence.filter((x) => x.data.controls.includes('CHG-01')).map((x) => /^Population: \d+ changes to (\S+?)'s /.exec(x.data.title)?.[1]).filter(Boolean))];
  const workerPop = evidence.filter((x) => covers(x) && x.data.files.some((f) => f.path.includes('/cloudflare-worker-deployments-') && f.path.endsWith('.csv')));
  const prodPops = prodEnv ? changeRepos.map((repo) => evidence.filter((x) => covers(x) && new RegExp(`^Population: \\d+ deployments of ${repo!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} to ${prodEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, `).test(x.data.title))) : [];
  // A Worker deployment counts as matched only to one of those production deployments, not to another environment's.
  const prodIds = new Set(prodPops.flat().flatMap(rowsOf).map((r) => r.id));
  const releaseGated = !!prodEnv && changeRepos.length > 0
    && prodPops.every((pops) => pops.length > 0 && pops.every((x) => rowsOf(x).every((r) => r.trigger_as_declared === 'yes')))
    && workerPop.length > 0 && workerPop.every((x) => rowsOf(x).every((r) => r.matched === 'yes' && prodIds.has(r.github_deployment)));
  const glass = ws.evidence.filter((x) => x.data.source?.name === 'break-glass seam').sort((a, b) => a.data.collected_at.localeCompare(b.data.collected_at)).at(-1);
  const glassText = glass ? glass.data.files.map((f) => existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), 'utf8') : '').join('\n') : '';
  for (const ev of evidence.filter((x) => !releaseGated && x.data.controls.includes('CHG-01'))) for (const f of ev.data.files.filter((f) => f.path.endsWith('.csv') && f.path.includes('/populations/'))) {
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
  // A day of the period no check run read the systems: whatever happened that day went unchecked, however the next run
  // reads it. Consecutive days are one exception.
  if (runs.length) {
    const ran = new Set(runs.map((r) => day(r.data.started_at)));
    const controls = [...new Set(runs.flatMap((r) => r.data.results.flatMap((x) => x.controls)))].join(';');
    const first = day(runs[0].data.started_at) > period.start ? day(runs[0].data.started_at) : period.start;
    let gap: string[] = [];
    const close = () => { if (!gap.length) return; const next = runs.find((r) => day(r.data.started_at) > gap.at(-1)!);
      add({ key: `missed-run:${gap[0]}`, source: 'daily checks (checks/runs/)', controls, item: `no daily check run on ${gap[0]}${gap.length > 1 ? ` to ${gap.at(-1)}` : ''}`, detail: `the daily checks read nothing on ${gap.length} day(s); ${next ? `the next run (${next.path}) read from the run before` : 'no run followed in the period'}`, occurred: gap[0], detected: next ? day(next.data.started_at) : '', resolved: next ? day(next.data.started_at) : '', closed_by: next ? `the run of ${day(next.data.started_at)}` : '', found_by: 'this package, comparing the period\'s days with its check runs', file: next?.path ?? runs.at(-1)!.path }); gap = []; };
    for (let d = first; d <= period.end; d = new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10)) { if (ran.has(d)) close(); else gap.push(d); }
    close();
  }
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
  // A failing check reaches a person: an escalation record names the check and was received on or after its first
  // failing reading. Where the package holds the escalations population, a failure no record answers is an exception.
  const escFile = evidence.flatMap((x) => x.data.files).find((f) => f.path.includes('/escalations-') && f.path.endsWith('.csv'));
  const escalations = escFile ? parseCsv(readFileSync(join(root, escFile.path), 'utf8'), escFile.path).rows : null;
  for (const [check, rows] of history) {
    let streak: typeof rows = [];
    const answeredBy = (from: string) => escalations?.find((x) => `${x.channel} ${x.summary}`.includes(check) && day(x.received_at) >= day(from));
    const unacknowledged = () => { if (!escalations || !streak.length || answeredBy(streak[0].at)) return;
      add({ key: `unacknowledged:${check}:${streak[0].run.split('/').pop()!.replace(/\.json$/, '')}`, occurred: day(streak[0].at), source: `automated check ${check}`, controls: 'OPS-01;MON-01', item: `check ${check} failing from ${day(streak[0].at)}`, detail: `no escalation record names the check on or after its first failing reading (${escFile!.path})`, detected: collectedOf(escFile!.path), resolved: '', found_by: `this package, comparing the check's readings with the escalations population (${escFile!.path})`, file: escFile!.path }); };
    const close = (end?: { at: string; run: string }) => { if (!streak.length) return; add({ key: `check:${check}:${streak[0].run.split('/').pop()!.replace(/\.json$/, '')}`, occurred: day(streak[0].at), source: `automated check ${check}`, controls: streak[0].controls.join(';'), item: `${streak.length} failing reading(s)`, detail: streak.at(-1)!.detail, detected: day(streak[0].at), resolved: end && !EVENT_CHECKS.has(check) ? day(end.at) : '', closed_by: !end ? '' : EVENT_CHECKS.has(check) ? `not closed by a reading: the check reports events, and ${day(end.at)}'s reading found none new` : `the reading of ${day(end.at)} passed again (${end.run}); remediation is management's to show`, file: streak[0].run }); streak = []; };
    for (const row of rows) { if (row.status === 'fail') streak.push(row); else if (row.status === 'pass') { unacknowledged(); close(row); } }
    unacknowledged(); close();
  }

  // Every identity seen acting in the package's populations, what kind it is, and whether an access review in the
  // package covered it. One that acted in the period and no review covered is an exception.
  const people = ws.registers.people?.data.rows ?? [];
  const latestSnap = existsSync(join(root, 'sources/open-autonomy/latest.json')) ? JSON.parse(readFileSync(join(root, 'sources/open-autonomy/latest.json'), 'utf8')) as { team?: { id: string; github?: string }[]; agents?: { profile: string }[] } : {};
  const services = new Set((ws.registers.systems?.data.rows ?? []).filter((x) => /service account/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()));
  const agentAccounts = new Set((ws.registers.systems?.data.rows ?? []).filter((x) => /agent/i.test(x.kind ?? '')).map((x) => (x.name ?? '').toLowerCase()));
  const kindOf = (a: string) => { const l = a.toLowerCase();
    const person = (latestSnap.team ?? []).find((m) => (m.github ?? '').toLowerCase() === l)?.id ?? people.find((p) => (p.email ?? '').toLowerCase() === l)?.id;
    return person ? `person (${person})` : services.has(l) ? 'service account' : agentAccounts.has(l) ? 'agent' : 'unknown'; };
  const reviewed = new Map<string, string>();
  for (const a of ws.accessReviews.filter((x) => packaged.has(`reviews/access/${x.data.id}.json`))) for (const acct of a.data.accounts) reviewed.set(acct.account.toLowerCase(), `${a.data.id} (${a.data.reviewer}: ${acct.decision})`);
  const seen = new Map<string, { roles: Set<string>; first: string; file: string }>();
  const note = (actor: string, role: string, at: string, file: string) => { for (const a of actor.split(';').map((x) => x.trim()).filter(Boolean)) { const e = seen.get(a) ?? { roles: new Set<string>(), first: at, file }; e.roles.add(role); if (at && (!e.first || at < e.first)) e.first = at; seen.set(a, e); } };
  for (const ev of evidence) for (const f of ev.data.files.filter((f) => f.path.endsWith('.csv') && f.path.includes('/populations/'))) {
    const rows = parseCsv(readFileSync(join(root, f.path), 'utf8'), f.path).rows;
    if (f.path.includes('/github-changes-')) for (const r of rows) { note(r.author, 'authored changes', r.merged_at, f.path); note(r.approvers, 'approved changes', r.merged_at, f.path); note(r.merged_by, 'merged changes', r.merged_at, f.path); }
    if (f.path.includes('/github-deployments-')) for (const r of rows) { note(r.started_by, 'started deployments', r.created_at, f.path); note(r.approved_by, 'approved deployments', r.created_at, f.path); }
    if (f.path.includes('/cloudflare-worker-deployments-')) for (const r of rows) note(r.author, 'deployed Workers', r.at, f.path);
    if (f.path.includes('/cloudflare-changes-')) for (const r of rows) note(r.actor, 'changed Cloudflare configuration', r.at, f.path);
  }
  const identities = [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([actor, e]) => ({ identity: actor, kind: kindOf(actor), acted_as: [...e.roles].join('; '), first_seen: e.first, access_review: reviewed.get(actor.toLowerCase()) ?? '' }));
  for (const i of identities.filter((x) => !x.access_review && inside(x.first_seen, period)))
    add({ key: `unreviewed-identity:${i.identity}`, source: 'identity inventory (review/identities.csv)', controls: 'AC-03', item: i.identity, detail: `${i.kind} that ${i.acted_as} in the period, in no access review in the package`, occurred: day(i.first_seen), detected: day(createdAt), resolved: '', file: seen.get(i.identity)!.file });

  // Client-written documents: each file's history in the workspace repository (who committed it and when, every
  // revision), and any date in its content later than the day it was recorded, which means it was written or edited
  // after the fact.
  const git = (...a: string[]) => { try { return execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return ''; } };
  const provenance: Record<string, string>[] = [];
  for (const x of evidence.filter((y) => (y.data.source?.kind ?? 'manual') === 'manual')) for (const f of x.data.files) {
    const log = git('log', '--format=%h %cI %an', '--', f.path).split('\n').filter(Boolean);
    const body = existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), 'utf8') : '';
    const recorded = day(x.data.collected_at);
    const later = [...new Set([...body.matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)].map((m) => m[1]))].filter((d) => d > recorded && d <= day(createdAt)).sort();
    provenance.push({ evidence: x.data.id, file: f.path, recorded_by: x.data.recorded_by, recorded: recorded, revisions: String(log.length), history: log.join('; '), dates_after_recorded: later.join(';') });
    if (later.length) add({ key: `document-dated-after:${x.data.id}`, source: `client document ${x.data.id}`, controls: x.data.controls.join(';'), item: f.path.split('/').pop()!, detail: `recorded ${recorded} but describes ${later.join(', ')}: written or edited after the day it claims (revisions: ${log.length})`, occurred: recorded, detected: day(createdAt), resolved: '', file: f.path });
  }
  for (const reg of [...packaged].filter((p) => p.startsWith('registers/'))) {
    const log = git('log', '--format=%h %cI %an %s', '--', reg).split('\n').filter(Boolean);
    provenance.push({ evidence: 'register', file: reg, recorded_by: '', recorded: '', revisions: String(log.length), history: log.join('; '), dates_after_recorded: '' });
  }
  const views = new Map<string, string>();
  views.set('review/evidence-provenance.csv', writeCsv({ columns: ['evidence', 'file', 'recorded_by', 'recorded', 'revisions', 'history', 'dates_after_recorded'], rows: provenance }));
  views.set('review/access-changes.csv', writeCsv({ columns: ['at', 'system', 'account', 'change', 'role', 'snapshot'], rows: accessChanges(root, ws, period) }));
  views.set('review/identities.csv', writeCsv({ columns: ['identity', 'kind', 'acted_as', 'first_seen', 'access_review'], rows: identities }));
  const days = (() => { const out: string[] = []; for (let t = Date.parse(`${period.start}T00:00:00Z`); t <= Date.parse(`${period.end}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; })();
  const coverage = new Map<string, { days: number; pass: number; fail: number; error: number }>();
  for (const [check, rows] of history) {
    views.set(`review/check-history/${check}.csv`, writeCsv({ columns: ['at', 'answered_at', 'status', 'detail', 'run', 'snapshot', 'snapshot_sha256'], rows: rows.map((r) => ({ at: r.at, answered_at: r.answered_at, status: r.status, detail: r.detail, run: r.run, snapshot: r.snapshot, snapshot_sha256: r.snapshot_sha256 })) }));
    const seen = new Set(rows.map((r) => day(r.at)));
    coverage.set(check, { days: days.filter((d) => seen.has(d)).length, pass: rows.filter((r) => r.status === 'pass').length, fail: rows.filter((r) => r.status === 'fail').length, error: rows.filter((r) => r.status === 'error').length });
  }
  // The control matrix: every SOC 2 control, whether SOC 2's scope takes it, where it is asked for and what evidence the
  // package holds. SOC 2's scope and its exclusions are worked out from the scoping answers (targets.ts).
  const matrix = ws.controls.filter((c) => isSoc2Control(c.data)).map((c) => {
    const d = c.data;
    const ids = evidence.filter((x) => x.data.controls.includes(d.id)).map((x) => x.data.id);
    // How strong the packaged evidence is: a vendor's own answer (a collector, or a daily check decided from one), a
    // record the organization made in its repository, or a document it wrote.
    const kinds = evidence.filter((x) => x.data.controls.includes(d.id)).map((x) => x.data.source?.kind === 'collector' ? 0 : x.data.source?.kind === 'manual' ? 2 : 1);
    const checks = [...history.entries()].filter(([, rows]) => rows[0]?.controls.includes(d.id)).map(([k]) => `${k} ${coverage.get(k)!.days}/${days.length} days`);
    // What the workspace holds for the control in the period, packaged or not: an applicable control with none has no
    // evidence of operating, which the firm should see without asking.
    // An annual control's evidence counts from the twelve months before the period's end: a policy approved in June is in
    // force for a July-to-September period.
    const since = d.frequency === 'annual' ? new Date(Date.parse(`${period.end}T00:00:00Z`) - 365 * 864e5).toISOString().slice(0, 10) : period.start;
    const window = { start: since < period.start ? since : period.start, end: period.end };
    const held = ws.evidence.filter((x) => x.data.controls.includes(d.id) && (x.data.period ? x.data.period.start <= window.end && x.data.period.end >= window.start : inside(x.data.collected_at, window))).length;
    return { control: d.id, title: d.title, criteria: d.criteria.join(';'), frequency: d.frequency, owner: d.owner, status: d.status, applicable: inSoc2Scope(ws, d) ? 'yes' : 'no', exclusion_reason: soc2Exclusion(ws, d) ?? '',
      requests: reqs.filter((r) => r.data.controls.includes(d.id)).map((r) => r.data.id).join(';'), evidence_in_package: ids.join(';'), evidence_basis: ['vendor record', 'client record', 'client narrative'][Math.min(...kinds, checks.length ? 0 : 3)] ?? '', check_history: checks.join('; '),
      workspace_evidence_in_window: inSoc2Scope(ws, d) ? (held ? `${held} record(s)${window.start < period.start ? ` since ${window.start}` : ''}${checks.length ? ` and ${checks.length} check(s)` : ''}` : checks.length ? `check only (${checks.length}), no evidence record` : 'none') : '',
      records_in_window: String(held),
      exceptions: String(exceptions.filter((x) => x.controls.split(';').includes(d.id)).length) };
  });
  const matrixColumns = ['control', 'title', 'criteria', 'frequency', 'owner', 'status', 'applicable', 'exclusion_reason', 'requests', 'evidence_in_package', 'evidence_basis', 'check_history', 'workspace_evidence_in_window', 'records_in_window', 'exceptions'];
  views.set('review/controls-matrix.csv', writeCsv({ columns: matrixColumns, rows: matrix }));

  // Coverage by criterion: each criterion of the categories in scope, the applicable controls that address it, and whether
  // any of them has evidence or a check in its window. A criterion in scope with none is the first thing a firm asks about.
  const inScope = new Set(['CC', ...Object.entries(categoryAnswer).filter(([, q]) => ws.scope?.data.answers?.[q] === true).map(([c]) => c)]);
  // A criterion whose every control the organization excluded, with its reason, is carved out rather than uncovered.
  const excludedFor = (id: string) => ws.controls.filter((x) => x.data.criteria.includes(id) && !inSoc2Scope(ws, x.data) && soc2Exclusion(ws, x.data)).map((x) => `${x.data.id}: ${soc2Exclusion(ws, x.data)}`);
  const byCriterion = criteria.filter((c) => inScope.has(c.category)).map((c) => {
    const ctl = matrix.filter((m) => m.applicable === 'yes' && m.criteria.split(';').includes(c.id));
    // A control counts as evidenced by a record in this package that names it; one covered only by an automated check is
    // shown apart, and one whose records stayed in the workspace is not provided.
    const held = ctl.filter((m) => m.evidence_in_package !== '');
    const narrativeOnly = held.length > 0 && held.every((m) => m.evidence_basis === 'client narrative');
    const checkOnly = ctl.filter((m) => m.evidence_in_package === '' && m.check_history !== '');
    const withheld = ctl.filter((m) => m.evidence_in_package === '' && m.check_history === '' && Number(m.records_in_window) > 0);
    // Evidence existing says nothing about whether it shows the control working: the exceptions against these controls
    // stand beside it.
    const open = exceptions.filter((x) => x.controls.split(';').some((id) => ctl.some((m) => m.control === id))).length;
    return { criterion: c.id, category: categories[c.category] ?? c.category, title: c.title, controls: ctl.map((m) => m.control).join(';'), controls_with_evidence: held.map((m) => m.control).join(';'),
      requested: [...new Set(ctl.flatMap((m) => m.requests ? m.requests.split(';') : []))].join(';'), exceptions: String(open), check_only: checkOnly.map((m) => m.control).join(';'), not_provided: withheld.map((m) => m.control).join(';'),
      status: !ctl.length ? (excludedFor(c.id).length ? `excluded: ${excludedFor(c.id).join(' ')}` : 'no applicable control') : !held.length ? (checkOnly.length ? 'automated check only' : withheld.length ? 'held in the workspace, not provided' : 'no evidence') : `evidence for ${held.length} of ${ctl.length} control(s)${narrativeOnly ? ' (client narrative only)' : ''}${checkOnly.length ? `, check only for ${checkOnly.length}` : ''}${withheld.length ? `, not provided for ${withheld.length}` : ''}${open ? `, ${open} exception(s)` : ', no exception'}` };
  });
  // What ran in production: for each Worker deployment in the package, the span it was live, what it was built from and
  // the approved GitHub deployment and pull requests behind it.
  const worker = evidence.flatMap((x) => x.data.files.filter((f) => f.path.includes('/cloudflare-worker-deployments-') && f.path.endsWith('.csv'))).at(-1);
  if (worker) {
    const wr = parseCsv(readFileSync(join(root, worker.path), 'utf8'), worker.path).rows.sort((a, b) => a.at.localeCompare(b.at));
    const chg = evidence.flatMap((x) => x.data.files.filter((f) => f.path.includes('/github-changes-') && f.path.endsWith('.csv'))).at(-1);
    const merged = chg ? parseCsv(readFileSync(join(root, chg.path), 'utf8'), chg.path).rows.filter((r) => r.kind === 'pull request') : [];
    let shippedUpTo = '';
    const timeline = wr.map((r, i) => {
      const until = wr[i + 1]?.at ?? `${period.end}T23:59:59Z`;
      const prs = r.matched === 'yes' ? merged.filter((m) => m.merged_at > shippedUpTo && m.merged_at <= r.at) : [];
      if (r.matched === 'yes') shippedUpTo = r.at;
      return { from: r.at, until, days: String(Math.round((Date.parse(until) - Date.parse(r.at)) / 864e5 * 10) / 10), deployment: r.deployment, author: r.author, commit: r.commit, github_deployment: r.github_deployment, ref: r.github_ref, approved: r.github_approved,
        change_path: r.matched === 'yes' ? 'reviewed and approved' : 'outside the change path', pull_requests: prs.map((m) => `#${m.number}`).join(';') };
    });
    // Changes merged after the last approved deployment never reached production in the period.
    const undeployed = merged.filter((m) => m.merged_at > shippedUpTo && m.merged_at.slice(0, 10) <= period.end);
    if (undeployed.length) timeline.push({ from: undeployed[0].merged_at, until: `${period.end}T23:59:59Z`, days: '', deployment: '', author: '', commit: '', github_deployment: '', ref: '', approved: '', change_path: 'merged, not deployed by the period end', pull_requests: undeployed.map((m) => `#${m.number}`).join(';') });
    // Change control as the project runs it: agents review each change, and a person's approval of the release covers
    // every change the release ships. Each merged change, the release that shipped it and who approved that release;
    // one that shipped in a release no person approved is an exception.
    const ghDep = evidence.flatMap((x) => x.data.files.filter((f) => f.path.includes('/github-deployments-') && f.path.endsWith('.csv'))).at(-1);
    const approvals = new Map((ghDep ? parseCsv(readFileSync(join(root, ghDep.path), 'utf8'), ghDep.path).rows : []).map((r) => [r.id, r]));
    const rosterLogins = new Set(((latestSnapOf(root)?.team ?? []) as { github?: string }[]).map((m) => (m.github ?? '').toLowerCase()).filter(Boolean));
    const releases = merged.map((m) => {
      const shipped = timeline.find((t) => t.deployment && t.from >= m.merged_at && t.change_path === 'reviewed and approved');
      const dep = shipped ? approvals.get(shipped.github_deployment) : undefined;
      const by = dep?.approved_by ?? '';
      const human = by.split(';').some((x) => rosterLogins.has(x.toLowerCase()));
      return { number: m.number, title: m.title, touches: m.touches ?? '', author: m.author, author_kind: m.author_kind ?? '', approvers: m.approvers, approver_kinds: m.approver_kinds ?? '', merged_at: m.merged_at,
        released_in: shipped?.ref ?? '', released_at: shipped?.from ?? '', release_approved_by: by, release_approved_by_person: shipped ? (human ? 'yes' : 'no') : '',
        // A release approval is independent of a change only when its approver did not write it.
        release_approver_wrote_it: shipped ? (by.split(';').some((x) => x && x.toLowerCase() === (m.author ?? '').toLowerCase()) ? 'yes' : 'no') : '' };
    });
    views.set('review/change-releases.csv', writeCsv({ columns: ['number', 'title', 'touches', 'author', 'author_kind', 'approvers', 'approver_kinds', 'merged_at', 'released_in', 'released_at', 'release_approved_by', 'release_approved_by_person', 'release_approver_wrote_it'], rows: releases }));
    for (const r of releases.filter((x) => x.release_approved_by_person === 'no'))
      add({ key: `release-without-person:#${r.number}`, source: 'change releases (review/change-releases.csv)', controls: 'CHG-01;CHG-03', item: `#${r.number} in ${r.released_in}`, detail: `shipped in a release no person on the roster approved (${r.release_approved_by || 'no approver'})`, occurred: day(r.released_at), detected: day(r.released_at), resolved: '', file: ghDep?.path ?? worker.path });
    // Releases whose approver wrote code or pipeline changes they ship: the second stage approved its own work. One
    // exception for the pattern, listing each release: it is how release approval was designed, not a lapse per release.
    const selfApproved = new Map<string, typeof releases>();
    for (const r of releases.filter((x) => x.release_approver_wrote_it === 'yes' && /code|pipeline/.test(x.touches))) selfApproved.set(r.released_in, [...(selfApproved.get(r.released_in) ?? []), r]);
    const shipped = new Set(releases.map((r) => r.released_in).filter(Boolean));
    if (selfApproved.size) { const first = [...selfApproved.values()].map((rs) => rs[0]).sort((a, b) => a.released_at.localeCompare(b.released_at))[0];
      add({ key: 'release-self-approved', source: 'change releases (review/change-releases.csv)', controls: 'CHG-03', item: `${selfApproved.size} of ${shipped.size} releases approved by an author of their code`, detail: [...selfApproved].map(([rel, rs]) => `${rel} approved by ${rs[0].release_approved_by}, who wrote ${rs.map((r) => `#${r.number}`).join(', ')}`).join('; '), occurred: day(first.released_at), detected: collectedOf(ghDep?.path ?? worker.path), resolved: '', found_by: `this package, comparing each release's approver with the authors of the changes it ships`, file: ghDep?.path ?? worker.path }); }
    views.set('review/production-timeline.csv', writeCsv({ columns: ['from', 'until', 'days', 'deployment', 'author', 'commit', 'github_deployment', 'ref', 'approved', 'change_path', 'pull_requests'], rows: timeline }));
  }
  // A report that states findings (a penetration test, a scan) the vulnerability register never took in: the findings
  // have no owner, due date or fix to test.
  const vulns = (ws.registers.vulnerabilities?.data.rows ?? []).filter((r) => !r.found_on || inside(r.found_on, period));
  const WORD: Record<string, number> = { no: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  for (const ev of evidence.filter((x) => inside(x.data.collected_at, { start: period.start, end: day(createdAt) }))) for (const f of ev.data.files.filter((x) => /\.(md|txt)$/.test(x.path))) {
    const text = existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), 'utf8') : '';
    const counts = [...text.matchAll(/\b(\d+|no|zero|one|two|three|four|five|six) (critical|high|medium|low)\b/gi)].map((m) => ({ n: /^\d+$/.test(m[1]) ? Number(m[1]) : WORD[m[1].toLowerCase()] ?? 0, sev: m[2].toLowerCase() })).filter((c) => c.n > 0);
    if (!counts.length || !/finding/i.test(text) || vulns.length) continue;
    add({ key: `findings-unregistered:${ev.data.id}`, source: `evidence ${ev.data.id} (${ev.data.title})`, controls: ev.data.controls.join(';'), item: `${counts.map((c) => `${c.n} ${c.sev}`).join(', ')} finding(s) in ${ev.data.id}`, detail: `the report states findings and the vulnerability register (registers/vulnerabilities.csv) records none found in the period`, occurred: day(ev.data.collected_at), detected: collectedOf(f.path), resolved: '', found_by: 'this package, comparing reports that state findings with the vulnerability register', file: f.path });
  }
  // Management's own record stating that no independent review exists: a gap in the design, admitted in writing.
  for (const ev of evidence.filter((x) => inside(x.data.collected_at, { start: period.start, end: day(createdAt) }) && x.data.controls.some((c) => /^(GOV|MON)-/.test(c)))) for (const f of ev.data.files.filter((x) => /\.(md|txt)$/.test(x.path))) {
    const text = existsSync(join(root, f.path)) ? readFileSync(join(root, f.path), 'utf8') : '';
    const said = /[^.\n]*\b(?:no (?:\w+ ){0,4}independent|not independent|nobody independent|no one independent)\b[^.\n]*/i.exec(text)?.[0].trim();
    if (said) add({ key: `admitted-gap:${ev.data.id}`, source: `evidence ${ev.data.id} (${ev.data.title})`, controls: ev.data.controls.join(';'), item: `management's own record states there is no independent review (${ev.data.id})`, detail: `"${said}"`, occurred: day(ev.data.collected_at), detected: collectedOf(f.path), resolved: '', found_by: 'this package, reading management\'s own records', file: f.path });
  }
  // The internal audit passing a checklist item while a deviation of that item's controls stood: the audit looked and did
  // not see it. The items' controls are the SOC 2 checklist's own table, as the latest import read it.
  const latestCommit = String((latestSnapOf(root) as { commit?: string } | null)?.commit ?? '').slice(0, 12);
  const checklistFile = join(root, 'sources/open-autonomy', latestCommit, 'docs/decisions/SOC2-CHECKLIST.md');
  const auditFile = evidence.flatMap((x) => x.data.files).find((f) => f.path.includes('/internal-audits-') && f.path.endsWith('.csv'));
  if (latestCommit && existsSync(checklistFile) && auditFile) {
    const itemControls = new Map([...readFileSync(checklistFile, 'utf8').matchAll(/^\| (C\d+) [^|]*\|[^|]*\| ([^|]+) \|/gm)].map((m) => [m[1], m[2].split(',').map((c) => c.trim())]));
    const audits = parseCsv(readFileSync(join(root, auditFile.path), 'utf8'), auditFile.path).rows.filter((r) => inside(r.at, period));
    const missed = new Map<string, { audits: string[]; keys: Set<string> }>();
    for (const a of audits) for (const it of (JSON.parse(a.items || '[]') as { item: string; status: string }[]).filter((x) => x.status === 'pass')) {
      const ctl = itemControls.get(it.item) ?? [];
      const standing = exceptions.filter((x) => !x.key.startsWith('audit-') && x.occurred && x.occurred <= day(a.at) && (!x.resolved || x.resolved > day(a.at)) && x.controls.split(';').some((c) => ctl.includes(c)));
      if (!standing.length) continue;
      const m = missed.get(it.item) ?? { audits: [], keys: new Set<string>() };
      m.audits.push(a.id); standing.forEach((x) => m.keys.add(x.key)); missed.set(it.item, m);
    }
    for (const [item, m] of missed) add({ key: `audit-passed-over:${item}`, source: `internal audits (${auditFile.path})`, controls: 'MON-04', item: `internal audit passed ${item} ${m.audits.length} time(s) while deviations of its controls stood`, detail: `${m.audits.join(', ')} passed ${item} (${(itemControls.get(item) ?? []).join(', ')}) while these stood: ${[...m.keys].join(', ')}`, occurred: m.audits[0].slice(0, 10), detected: collectedOf(auditFile.path), resolved: '', found_by: 'this package, comparing each internal audit\'s passes with the exceptions standing at its date', file: auditFile.path });
  }
  // One event, one exception, for hand-made settings too: the change check's failing reading of the day a person changed
  // a setting (or put it back), and its unacknowledged sibling, belong to that setting's out-of-path exception.
  for (const u of exceptions.filter((x) => x.key.startsWith('out-of-path-change:'))) {
    const days = [u.occurred, u.resolved].filter(Boolean);
    for (const c of exceptions.filter((x) => x.key.startsWith('check:cloudflare-change-actors:') && days.includes(x.occurred) && /setting \S+ changed by hand/.test(x.detail))) {
      const run = c.key.split(':').slice(2).join(':');
      const ack = exceptions.find((x) => x.key === `unacknowledged:cloudflare-change-actors:${run}`);
      u.detail += `; the daily change check failed on it on ${c.occurred}${ack ? ', and no escalation named that check' : ''}`;
      if (c.occurred === u.occurred) { u.detected = c.detected; u.found_by = `the organization's daily check cloudflare-change-actors, on ${c.detected} (${c.file})`; }
      exceptions.splice(exceptions.indexOf(c), 1);
      if (ack) exceptions.splice(exceptions.indexOf(ack), 1);
    }
  }
  // One event, one exception: a deploy no approved GitHub deployment accounts for, which the daily change-actors check
  // already failed on (the same day, the same account), is that check's finding, dated when the check made it.
  for (const u of exceptions.filter((x) => x.key.startsWith('unmatched-deploy:'))) {
    const actor = /made by ([\w.+-]+@[\w.-]+\.[a-z]+)/i.exec(u.detail)?.[1];
    const c = actor ? exceptions.find((x) => x.key.startsWith('check:cloudflare-change-actors:') && x.occurred === u.occurred && x.detail.includes(actor)) : undefined;
    if (!c) continue;
    u.detected = c.detected;
    u.found_by = `the organization's daily check cloudflare-change-actors, on ${c.detected} (${c.file})`;
    exceptions.splice(exceptions.indexOf(c), 1);
  }
  // An access review that kept an account an earlier exception names: the review saw the account and let it stand.
  for (const a of ws.accessReviews.filter((x) => packaged.has(`reviews/access/${x.data.id}.json`) && x.data.status === 'signed-off' && inside(x.data.signed_off_at ?? '', period)))
    for (const acct of a.data.accounts.filter((x) => x.decision === 'keep')) {
      // Only what the organization knew by the review: an exception found later could not have informed the decision.
      const named = exceptions.filter((x) => x.detected && x.detected <= day(a.data.signed_off_at ?? '') && `${x.item} ${x.detail}`.toLowerCase().includes(acct.account.toLowerCase()));
      if (named.length) add({ key: `kept-after-exception:${a.data.id}:${acct.account}`, source: `access review ${a.data.id} (${a.data.system})`, controls: 'AC-03;AC-04', item: `${acct.account} kept by ${a.data.reviewer}`, detail: `kept on ${day(a.data.signed_off_at ?? '')}, after ${named.map((x) => x.key).join(', ')} named the account`, occurred: day(a.data.signed_off_at ?? ''), detected: collectedOf(`reviews/access/${a.data.id}.json`), resolved: '', found_by: 'this package, comparing each access review with the exceptions before it', file: `reviews/access/${a.data.id}.json` });
    }
  // The matrix and coverage count what the register holds once every view has raised its exceptions.
  for (const m of matrix) m.exceptions = String(exceptions.filter((x) => x.controls.split(';').includes(m.control)).length);
  views.set('review/controls-matrix.csv', writeCsv({ columns: matrixColumns, rows: matrix }));
  for (const c of byCriterion) {
    const n = exceptions.filter((x) => x.controls.split(';').some((id) => c.controls.split(';').includes(id))).length;
    c.exceptions = String(n);
    c.status = c.status.replace(/, (?:\d+ exception\(s\)|no exception)$/, n ? `, ${n} exception(s)` : ', no exception');
  }
  // A deviation is of design when what it shows stood through the period (a person's live credential, a ruleset
  // weakened, a declared trigger never used, the same self-approval release after release), and of operation when a
  // designed control failed on an occasion. The assertion qualifies the two separately.
  const natureOf = (x: PacketException) => /^(personal-token|personal-deploy-token|weakened|trigger|admitted-gap):/.test(x.key) || x.key === 'release-self-approved' ? 'design' : 'operating';
  // Written after every view that can raise an exception.
  views.set('review/exceptions.csv', writeCsv({ columns: ['key', 'nature', 'source', 'controls', 'item', 'detail', 'occurred', 'detected', 'resolved', 'closed_by', 'open_at_period_end', 'found_by', 'response', 'responded_by', 'response_cites', 'file'], rows: exceptions.map((x) => ({ ...x, nature: natureOf(x), closed_by: x.closed_by ?? '', open_at_period_end: !x.resolved || x.resolved > period.end ? 'yes' : 'no',
      found_by: x.found_by ?? (x.key.startsWith('check:') ? `the organization's daily check, on ${x.detected}` : x.key.startsWith('audit-finding:') ? `the organization's internal audit, on ${x.occurred}` : x.key.startsWith('incident:') ? 'the organization (its incident record)' : `this package's collection, on ${x.detected}`), response_cites: x.response_cites ?? '' })) }));
  const coverageColumns = ['criterion', 'category', 'title', 'controls', 'controls_with_evidence', 'check_only', 'not_provided', 'requested', 'exceptions', 'status'];
  views.set('review/coverage.csv', writeCsv({ columns: coverageColumns, rows: byCriterion }));

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
  const excluded = ws.controls.filter((c) => isSoc2Control(c.data) && !inSoc2Scope(ws, c.data));
  views.set('review/index.html', `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ws.manifest?.data.organization)} — ${esc(e.id)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1b1f24}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top;font-size:13px}th{background:#f6f8fa}.pill{font-size:11px;border:1px solid #8c959f;border-radius:10px;padding:1px 7px;font-weight:normal}.none td{background:#ffebe9}.memo{background:#f6f8fa;border-left:3px solid #8c959f;padding:4px 8px}.warn{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px;margin:8px 0}code{font-size:12px}small{color:#57606a}</style></head><body>
<h1>${esc(ws.manifest?.data.organization)}: SOC 2 ${e.type === 'type2' ? 'Type II' : 'Type I'}, engagement ${esc(e.id)}</h1>
<p>${e.type === 'type2' ? `Period ${esc(period.start)} to ${esc(period.end)}` : `As of ${esc(e.as_of)}`} · Firm ${esc(e.firm)} · Package created ${esc(createdAt)} · ${reqs.length} requests · ${evidence.length} evidence records · ${exceptions.length} exceptions</p>
${interim ? `<div class="warn">This package was created on or before the last day of the period: populations and check histories may not cover the period's end. Exceptions list each population read early.</div>` : ''}
<p>Every file below is under <code>workspace/</code> and hashed in <code>manifest.json</code>; these views were derived from those files when the package was made and are hashed too; each line names the file it comes from. Tables: <a href="coverage.csv">coverage.csv</a> · <a href="claims.csv">claims.csv</a> · <a href="evidence-provenance.csv">evidence-provenance.csv</a> · <a href="identities.csv">identities.csv</a>${views.has('review/change-releases.csv') ? ' · <a href="change-releases.csv">change-releases.csv</a>' : ''} · <a href="access-changes.csv">access-changes.csv</a>${views.has('review/production-timeline.csv') ? ' · <a href="production-timeline.csv">production-timeline.csv</a>' : ''} · <a href="controls-matrix.csv">controls-matrix.csv</a> · <a href="exceptions.csv">exceptions.csv</a> · <a href="check-history/">check-history/</a> · <a href="workspace-history.txt">workspace-history.txt</a>${existsSync(join(root, 'audits', e.id, 'drafts', 'description.md')) ? ' · <a href="description-lint.csv">description-lint.csv</a>' : ''}. Drafts: ${['description', 'assertion', 'bridge'].filter((k) => existsSync(join(root, 'audits', e.id, 'drafts', `${k}.md`))).map((k) => link(`audits/${e.id}/drafts/${k}.md`, k)).join(', ') || 'none'}.</p>
<h2>Coverage</h2>${(() => { const gaps = byCriterion.filter((c) => c.status === 'no evidence' || c.status === 'no applicable control' || c.status.startsWith('held in the workspace')); const none = matrix.filter((m) => m.workspace_evidence_in_window === 'none');
  return `<p>${byCriterion.length} criteria in scope: ${byCriterion.filter((c) => c.status.startsWith('evidence') && c.exceptions === '0').length} with evidence and no exception, ${byCriterion.filter((c) => c.status.startsWith('evidence') && c.exceptions !== '0').length} with evidence and exceptions against their controls, ${byCriterion.filter((c) => c.status === 'automated check only').length} backed only by an automated check, ${byCriterion.filter((c) => c.status.startsWith('excluded')).length} excluded by the organization with its reason, ${gaps.length} with no evidence or no applicable control (<a href="coverage.csv">coverage.csv</a>).</p>${gaps.length ? `<div class="warn"><b>No evidence in the window:</b> ${gaps.map((c) => `${esc(c.criterion)} ${esc(c.title)}${c.controls ? ` (${esc(c.controls.replaceAll(';', ', '))})` : ' (no applicable control)'}`).join('; ')}. Applicable controls without evidence: ${none.map((m) => esc(m.control)).join(', ') || 'none'}.</div>` : ''}`; })()}
<h2>Exceptions</h2>${exceptions.length ? `<table><tr><th>Item</th><th>Source</th><th>Controls</th><th>Detail</th><th>Occurred</th><th>Detected</th><th>Closed</th><th>Management response</th></tr>${exceptions.map((x) => `<tr><td>${esc(x.item)}</td><td>${link(x.file, x.source)}</td><td>${esc(x.controls)}</td><td>${esc(x.detail)}</td><td>${esc(x.occurred)}</td><td>${esc(x.detected)}</td><td>${esc(x.resolved)}${x.closed_by ? `<br><small>${esc(x.closed_by)}</small>` : ''}</td><td>${esc(x.response) || '<small>none recorded</small>'}${x.response ? `<br><small>${x.response_cites ? `Cites: ${x.response_cites.split(';').map((c) => link(c)).join(', ')}` : '<b>Cites no evidence</b>'}</small>` : ''}</td></tr>`).join('')}</table>` : '<p>None found in the package.</p>'}
<h2>Automated checks across the period</h2>${history.size ? `<table><tr><th>Check</th><th>Days with a reading</th><th>Pass</th><th>Fail</th><th>Could not decide</th><th>Latest</th></tr>${[...history.entries()].map(([k, rows]) => { const c = coverage.get(k)!; const last = rows.at(-1)!; return `<tr><td><a href="check-history/${esc(href(k))}.csv">${esc(k)}</a></td><td>${c.days} of ${days.length}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.error}</td><td>${esc(last.status)} ${esc(day(last.at))}: ${esc(last.detail)}</td></tr>`; }).join('')}</table>` : '<p>No check ran during the period.</p>'}
<h2>Requests</h2>${reqHtml}
<h2>Control matrix</h2>${(() => { const none = matrix.filter((m) => m.workspace_evidence_in_window === 'none'); return none.length ? `<div class="warn">${none.length} applicable control(s) have no evidence and no check in the period: ${none.map((m) => esc(m.control)).join(', ')}.</div>` : ''; })()}<table><tr><th>Control</th><th>Criteria</th><th>Frequency</th><th>Owner</th><th>Status</th><th>Requests</th><th>Evidence in package</th><th>Checks</th><th>In the period</th><th>Exceptions</th></tr>${matrix.filter((m) => m.applicable === 'yes').map((m) => `<tr id="ctl-${esc(m.control)}"${m.workspace_evidence_in_window === 'none' ? ' class="none"' : ''}><td>${controlLink(m.control)} ${esc(m.title)}</td><td>${esc(m.criteria)}</td><td>${esc(m.frequency)}</td><td>${esc(m.owner)}</td><td>${esc(m.status)}</td><td>${esc(m.requests)}</td><td>${esc(m.evidence_in_package)}</td><td>${esc(m.check_history)}</td><td>${esc(m.workspace_evidence_in_window)}</td><td>${esc(m.exceptions)}</td></tr>`).join('')}</table>
<h2>Out of scope</h2>${excluded.length ? `<ul>${excluded.map((c) => `<li>${esc(c.data.id)} ${esc(c.data.title)}: ${esc(soc2Exclusion(ws, c.data) ?? '')}</li>`).join('')}</ul>` : '<p>No control is excluded.</p>'}
<p><small>Applicable controls no request names are in the matrix with their evidence; the firm may ask for any of them.</small></p>
</body></html>
`);
  return views;
}
