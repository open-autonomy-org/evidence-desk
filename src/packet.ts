// The review views of an audit package: what a firm reads first, derived from the files the package carries so every
// line traces to one of them. A control matrix, an exceptions register with management's responses, each automated
// check's history across the period, and one readable page (index.html) that links to the files. Nothing here is new
// evidence; it is an index over the evidence, hashed in the manifest like everything else.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import type { Workspace } from './workspace.ts';
import type { AuditRequest, Engagement } from './audit.ts';

// occurred: when the deviation happened (a merge, a deployment, the first failing reading); detected: when a collector or
// check found it.
export type PacketException = { key: string; source: string; controls: string; item: string; detail: string; occurred: string; detected: string; resolved: string; response: string; responded_by: string; file: string };
type Responses = Record<string, { text: string; by: string; at: string }>;

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
  const add = (x: Omit<PacketException, 'response' | 'responded_by'>) => { const r = responses[x.key]; exceptions.push({ ...x, response: r?.text ?? '', responded_by: r ? `${r.by} ${r.at}` : '' }); };

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
      if (t.columns.includes('run_conclusion')) for (const r of t.rows.filter((r) => r.run && r.run_conclusion !== 'success'))
        add({ ...base, key: `run:${ev.data.controls.join('+')}:${itemOf(r)}`, item: itemOf(r), detail: `the run ${r.run} that deployed it ended ${r.run_conclusion || 'without a conclusion'}, yet the deployment reads ${r.final_state}`, occurred: at(r) });
    }
    // Only a population can be read early: an act over a period (an access review) is dated by its sign-off.
    if (ev.data.period && ev.data.files.some((f) => f.path.includes('/populations/')) && day(ev.data.collected_at) <= ev.data.period.end) add({ key: `interim:${ev.data.id}`, occurred: day(ev.data.collected_at), source: ev.data.title, controls: ev.data.controls.join(';'), item: 'read before its period ended', detail: `collected ${day(ev.data.collected_at)} for a period ending ${ev.data.period.end}: rows after the collection are missing; collect again after the period ends`, detected: day(ev.data.collected_at), resolved: '', file: ev.path });
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
      add({ key, occurred: day(c.checked_at), source: `roster completeness, ${c.vendor} ${c.account}`, controls: 'AC-04', item: o, detail: 'administrator not on the roster', detected: day(c.checked_at), resolved: later ? day(later.c.checked_at) : '', file: p });
    }
  });
  // Each automated check across the period: every reading, and each run of failing readings as one exception with
  // the reading that ended it.
  const runs = ws.runs.filter((r) => inside(r.data.started_at, period)).sort((a, b) => a.data.started_at.localeCompare(b.data.started_at) || a.path.localeCompare(b.path));
  // Each reading names the collector snapshot it was decided from, with that snapshot's hash, so a pass is traceable to
  // what the vendor answered that day.
  const hashOf = (p: string) => existsSync(join(root, p)) ? createHash('sha256').update(readFileSync(join(root, p))).digest('hex') : 'missing';
  const history = new Map<string, { at: string; status: string; detail: string; controls: string[]; run: string; snapshot: string; snapshot_sha256: string }[]>();
  for (const r of runs) for (const res of r.data.results) {
    const snap = r.data.collectors.find((c) => c.id === res.collector)?.snapshot ?? '';
    (history.get(res.check) ?? history.set(res.check, []).get(res.check)!).push({ at: r.data.started_at, status: res.status, detail: res.detail, controls: res.controls, run: r.path, snapshot: snap, snapshot_sha256: snap ? hashOf(snap) : '' });
  }
  for (const [check, rows] of history) {
    let streak: typeof rows = [];
    const close = (end?: { at: string }) => { if (!streak.length) return; add({ key: `check:${check}:${streak[0].run.split('/').pop()!.replace(/\.json$/, '')}`, occurred: day(streak[0].at), source: `automated check ${check}`, controls: streak[0].controls.join(';'), item: `${streak.length} failing reading(s)`, detail: streak.at(-1)!.detail, detected: day(streak[0].at), resolved: end ? day(end.at) : '', file: streak[0].run }); streak = []; };
    for (const row of rows) { if (row.status === 'fail') streak.push(row); else if (row.status === 'pass') close(row); }
    close();
  }

  const views = new Map<string, string>();
  views.set('review/exceptions.csv', writeCsv({ columns: ['key', 'source', 'controls', 'item', 'detail', 'occurred', 'detected', 'resolved', 'response', 'responded_by', 'file'], rows: exceptions }));
  const days = (() => { const out: string[] = []; for (let t = Date.parse(`${period.start}T00:00:00Z`); t <= Date.parse(`${period.end}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; })();
  const coverage = new Map<string, { days: number; pass: number; fail: number; error: number }>();
  for (const [check, rows] of history) {
    views.set(`review/check-history/${check}.csv`, writeCsv({ columns: ['at', 'status', 'detail', 'run', 'snapshot', 'snapshot_sha256'], rows: rows.map((r) => ({ at: r.at, status: r.status, detail: r.detail, run: r.run, snapshot: r.snapshot, snapshot_sha256: r.snapshot_sha256 })) }));
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
    const held = ws.evidence.filter((x) => x.data.controls.includes(d.id) && (x.data.period ? x.data.period.start <= period.end && x.data.period.end >= period.start : inside(x.data.collected_at, period))).length;
    return { control: d.id, title: d.title, criteria: d.criteria.join(';'), frequency: d.frequency, owner: d.owner, status: d.status, applicable: d.applicable ? 'yes' : 'no', exclusion_reason: d.exclusion_reason ?? '',
      requests: reqs.filter((r) => r.data.controls.includes(d.id)).map((r) => r.data.id).join(';'), evidence: ids.join(';'), check_history: checks.join('; '),
      evidence_in_period: d.applicable ? (held || checks.length ? `${held} record(s)${checks.length ? ` and ${checks.length} check(s)` : ''}` : 'none') : '',
      exceptions: String(exceptions.filter((x) => x.controls.split(';').includes(d.id)).length) };
  });
  views.set('review/controls-matrix.csv', writeCsv({ columns: ['control', 'title', 'criteria', 'frequency', 'owner', 'status', 'applicable', 'exclusion_reason', 'requests', 'evidence', 'check_history', 'evidence_in_period', 'exceptions'], rows: matrix }));

  // The readable page.
  const href = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  const link = (p: string, text = p) => `<a href="../workspace/${esc(href(p))}">${esc(text)}</a>`;
  const controlPath = new Map(ws.controls.map((c) => [c.data.id, c.path]));
  const controlLink = (id: string, text = id) => { const p = controlPath.get(id); return p && packaged.has(p) ? link(p, text) : esc(text); };
  const interim = day(createdAt) <= period.end && e.type === 'type2';
  const byId = new Map(evidence.map((x) => [x.data.id, x]));
  const evRow = (id: string) => { const x = byId.get(id); if (!x) return `<li>${esc(id)} (not in the package)</li>`; const d = x.data;
    return `<li><b>${esc(d.id)}</b> ${esc(d.title)}<br><small>${esc(d.source?.kind ?? '')}${d.source?.name ? ` · ${esc(d.source.name)}` : ''} · collected ${esc(d.collected_at)}${d.period ? ` · period ${esc(d.period.start)} to ${esc(d.period.end)}` : ''}</small>${d.source?.query ? `<br><small>Query: <code>${esc(d.source.query)}</code></small>` : ''}${d.notes ? `<br><small>${esc(d.notes)}</small>` : ''}<br>${d.files.map((f) => link(f.path)).join(' · ')}</li>`; };
  const reqHtml = reqs.map(({ data: r }) => `<section id="${esc(r.id)}"><h3>${esc(r.id)} ${esc(r.title)} <span class="pill">${esc(r.kind)}</span> <span class="pill">${esc(r.status)}</span></h3>
<p>Controls: ${r.controls.map((c) => `<a href="#ctl-${esc(c)}">${esc(c)}</a>`).join(', ')} · Exceptions: ${exceptions.filter((x) => x.controls.split(';').some((c) => r.controls.includes(c))).length}</p>
${r.population ? `<p>Population: <b>${esc(r.population)}</b></p><ul>${evRow(r.population)}</ul>` : ''}${r.evidence.length ? `<p>Evidence</p><ul>${r.evidence.map(evRow).join('')}</ul>` : ''}
${r.thread.length ? `<details><summary>Thread (${r.thread.length})</summary><ul>${r.thread.map((m) => `<li><b>${esc(m.side)}</b> ${esc(m.by)} ${esc(m.at)}: ${esc(m.text)}</li>`).join('')}</ul></details>` : ''}</section>`).join('\n');
  const excluded = ws.controls.filter((c) => !c.data.applicable);
  views.set('review/index.html', `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ws.manifest?.data.organization)} — ${esc(e.id)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1b1f24}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top;font-size:13px}th{background:#f6f8fa}.pill{font-size:11px;border:1px solid #8c959f;border-radius:10px;padding:1px 7px;font-weight:normal}.none td{background:#ffebe9}.warn{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px;margin:8px 0}code{font-size:12px}small{color:#57606a}</style></head><body>
<h1>${esc(ws.manifest?.data.organization)}: SOC 2 ${e.type === 'type2' ? 'Type II' : 'Type I'}, engagement ${esc(e.id)}</h1>
<p>${e.type === 'type2' ? `Period ${esc(period.start)} to ${esc(period.end)}` : `As of ${esc(e.as_of)}`} · Firm ${esc(e.firm)} · Package created ${esc(createdAt)} · ${reqs.length} requests · ${evidence.length} evidence records · ${exceptions.length} exceptions</p>
${interim ? `<div class="warn">This package was created on or before the last day of the period: populations and check histories may not cover the period's end. Exceptions list each population read early.</div>` : ''}
<p>Every file below is under <code>workspace/</code> and hashed in <code>manifest.json</code>; these views were derived from those files when the package was made and are hashed too; each line names the file it comes from. Tables: <a href="controls-matrix.csv">controls-matrix.csv</a> · <a href="exceptions.csv">exceptions.csv</a> · <a href="check-history/">check-history/</a>. Drafts: ${['description', 'assertion', 'bridge'].filter((k) => existsSync(join(root, 'audits', e.id, 'drafts', `${k}.md`))).map((k) => link(`audits/${e.id}/drafts/${k}.md`, k)).join(', ') || 'none'}.</p>
<h2>Exceptions</h2>${exceptions.length ? `<table><tr><th>Item</th><th>Source</th><th>Controls</th><th>Detail</th><th>Occurred</th><th>Detected</th><th>Resolved</th><th>Management response</th></tr>${exceptions.map((x) => `<tr><td>${esc(x.item)}</td><td>${link(x.file, x.source)}</td><td>${esc(x.controls)}</td><td>${esc(x.detail)}</td><td>${esc(x.occurred)}</td><td>${esc(x.detected)}</td><td>${esc(x.resolved)}</td><td>${esc(x.response) || '<small>none recorded</small>'}</td></tr>`).join('')}</table>` : '<p>None found in the package.</p>'}
<h2>Automated checks across the period</h2>${history.size ? `<table><tr><th>Check</th><th>Days with a reading</th><th>Pass</th><th>Fail</th><th>Could not decide</th><th>Latest</th></tr>${[...history.entries()].map(([k, rows]) => { const c = coverage.get(k)!; const last = rows.at(-1)!; return `<tr><td><a href="check-history/${esc(href(k))}.csv">${esc(k)}</a></td><td>${c.days} of ${days.length}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.error}</td><td>${esc(last.status)} ${esc(day(last.at))}: ${esc(last.detail)}</td></tr>`; }).join('')}</table>` : '<p>No check ran during the period.</p>'}
<h2>Requests</h2>${reqHtml}
<h2>Control matrix</h2>${(() => { const none = matrix.filter((m) => m.evidence_in_period === 'none'); return none.length ? `<div class="warn">${none.length} applicable control(s) have no evidence and no check in the period: ${none.map((m) => esc(m.control)).join(', ')}.</div>` : ''; })()}<table><tr><th>Control</th><th>Criteria</th><th>Frequency</th><th>Owner</th><th>Status</th><th>Requests</th><th>Evidence in package</th><th>Checks</th><th>In the period</th><th>Exceptions</th></tr>${matrix.filter((m) => m.applicable === 'yes').map((m) => `<tr id="ctl-${esc(m.control)}"${m.evidence_in_period === 'none' ? ' class="none"' : ''}><td>${controlLink(m.control)} ${esc(m.title)}</td><td>${esc(m.criteria)}</td><td>${esc(m.frequency)}</td><td>${esc(m.owner)}</td><td>${esc(m.status)}</td><td>${esc(m.requests)}</td><td>${esc(m.evidence)}</td><td>${esc(m.check_history)}</td><td>${esc(m.evidence_in_period)}</td><td>${esc(m.exceptions)}</td></tr>`).join('')}</table>
<h2>Out of scope</h2>${excluded.length ? `<ul>${excluded.map((c) => `<li>${esc(c.data.id)} ${esc(c.data.title)}: ${esc(c.data.exclusion_reason ?? '')}</li>`).join('')}</ul>` : '<p>No control is excluded.</p>'}
<p><small>Applicable controls no request names are in the matrix with their evidence; the firm may ask for any of them.</small></p>
</body></html>
`);
  return views;
}
