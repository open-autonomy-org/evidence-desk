// The review views of an audit package: what a firm reads first, derived from the files the package carries so every
// line traces to one of them. A control matrix, an exceptions register with management's responses, each automated
// check's history across the period, and one readable page (index.html) that links to the files. Nothing here is new
// evidence; it is an index over the evidence, hashed in the manifest like everything else.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, writeCsv } from './csv.ts';
import type { Workspace } from './workspace.ts';
import type { AuditRequest, Engagement } from './audit.ts';

export type PacketException = { key: string; source: string; controls: string; item: string; detail: string; detected: string; resolved: string; response: string; responded_by: string; file: string };
type Responses = Record<string, { text: string; by: string; at: string }>;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const day = (iso: string) => iso.slice(0, 10);
const inside = (iso: string, p: { start: string; end: string }) => !!iso && day(iso) >= p.start && day(iso) <= p.end;

export function readResponses(root: string, id: string): Responses {
  const f = join(root, 'audits', id, 'exceptions.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { responses: Responses }).responses : {};
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
      if (t.columns.includes('independent_approval')) for (const r of t.rows.filter((r) => r.independent_approval !== 'yes')) {
        const item = r.kind === 'direct push' ? `direct push ${r.commit.slice(0, 12)}` : r.number ? `#${r.number}` : r.id ? `deployment ${r.id} (${r.ref})` : r.commit;
        add({ key: `${ev.data.id}:${item}`, source: ev.data.title, controls: ev.data.controls.join(';'), item, detail: `independent approval: ${r.independent_approval}${r.title ? ` — ${r.title}` : ''}${r.author || r.started_by ? `; by ${r.author || r.started_by}` : ''}`, detected: day(ev.data.collected_at), resolved: '', file: f.path });
      }
    }
    if (ev.data.period && day(ev.data.collected_at) < ev.data.period.end) add({ key: `interim:${ev.data.id}`, source: ev.data.title, controls: ev.data.controls.join(';'), item: 'read before its period ended', detail: `collected ${day(ev.data.collected_at)} for a period ending ${ev.data.period.end}; collect again after the period ends`, detected: day(ev.data.collected_at), resolved: '', file: ev.path });
  }
  // Signed acts not recorded by their own person.
  if (packaged.has('sources/github/attribution.json')) {
    const a = JSON.parse(readFileSync(join(root, 'sources/github/attribution.json'), 'utf8')) as { checked_at: string; rows: { key: string; person: string; label: string; status: string; author: string }[] };
    for (const r of a.rows.filter((r) => r.status !== 'verified')) add({ key: `attribution:${r.key}`, source: 'attribution check', controls: '', item: `${r.person || '(no one)'}: ${r.label}`, detail: `${r.status}${r.author ? ` (${r.author})` : ''}`, detected: day(a.checked_at), resolved: '', file: 'sources/github/attribution.json' });
  }
  // Administrators outside the roster, as each completeness check found them.
  for (const p of [...packaged].filter((p) => p.startsWith('sources/open-autonomy/completeness/'))) {
    const c = JSON.parse(readFileSync(join(root, p), 'utf8')) as { account: string; vendor: string; checked_at: string; outside: string[] };
    for (const o of c.outside) add({ key: `completeness:${c.vendor}:${o}:${day(c.checked_at)}`, source: `roster completeness, ${c.vendor} ${c.account}`, controls: 'AC-04', item: o, detail: 'administrator not on the roster', detected: day(c.checked_at), resolved: '', file: p });
  }
  // Each automated check across the period: every reading, and each run of failing readings as one exception with
  // the reading that ended it.
  const runs = ws.runs.filter((r) => inside(r.data.started_at, period)).sort((a, b) => a.data.started_at.localeCompare(b.data.started_at));
  const history = new Map<string, { at: string; status: string; detail: string; controls: string[]; run: string }[]>();
  for (const r of runs) for (const res of r.data.results) (history.get(res.check) ?? history.set(res.check, []).get(res.check)!).push({ at: r.data.started_at, status: res.status, detail: res.detail, controls: res.controls, run: r.path });
  for (const [check, rows] of history) {
    let streak: typeof rows = [];
    const close = (end?: { at: string }) => { if (!streak.length) return; add({ key: `check:${check}:${streak[0].at}`, source: `automated check ${check}`, controls: streak[0].controls.join(';'), item: `${streak.length} failing reading(s)`, detail: streak.at(-1)!.detail, detected: day(streak[0].at), resolved: end ? day(end.at) : '', file: streak[0].run }); streak = []; };
    for (const row of rows) { if (row.status === 'fail') streak.push(row); else if (row.status === 'pass') close(row); }
    close();
  }

  const views = new Map<string, string>();
  views.set('review/exceptions.csv', writeCsv({ columns: ['key', 'source', 'controls', 'item', 'detail', 'detected', 'resolved', 'response', 'responded_by', 'file'], rows: exceptions }));
  const days = (() => { const out: string[] = []; for (let t = Date.parse(`${period.start}T00:00:00Z`); t <= Date.parse(`${period.end}T00:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; })();
  const coverage = new Map<string, { days: number; pass: number; fail: number; error: number }>();
  for (const [check, rows] of history) {
    views.set(`review/check-history/${check}.csv`, writeCsv({ columns: ['at', 'status', 'detail', 'run'], rows: rows.map((r) => ({ at: r.at, status: r.status, detail: r.detail, run: r.run })) }));
    const seen = new Set(rows.map((r) => day(r.at)));
    coverage.set(check, { days: days.filter((d) => seen.has(d)).length, pass: rows.filter((r) => r.status === 'pass').length, fail: rows.filter((r) => r.status === 'fail').length, error: rows.filter((r) => r.status === 'error').length });
  }
  // The control matrix: every control, whether it applies, where it is asked for and what evidence the package holds.
  const matrix = ws.controls.map((c) => {
    const d = c.data;
    const ids = evidence.filter((x) => x.data.controls.includes(d.id)).map((x) => x.data.id);
    const checks = [...history.entries()].filter(([, rows]) => rows[0]?.controls.includes(d.id)).map(([k]) => `${k} ${coverage.get(k)!.days}/${days.length} days`);
    return { control: d.id, title: d.title, criteria: d.criteria.join(';'), frequency: d.frequency, owner: d.owner, status: d.status, applicable: d.applicable ? 'yes' : 'no', exclusion_reason: d.exclusion_reason ?? '',
      requests: reqs.filter((r) => r.data.controls.includes(d.id)).map((r) => r.data.id).join(';'), evidence: ids.join(';'), check_history: checks.join('; '),
      exceptions: String(exceptions.filter((x) => x.controls.split(';').includes(d.id)).length) };
  });
  views.set('review/controls-matrix.csv', writeCsv({ columns: ['control', 'title', 'criteria', 'frequency', 'owner', 'status', 'applicable', 'exclusion_reason', 'requests', 'evidence', 'check_history', 'exceptions'], rows: matrix }));

  // The readable page.
  const link = (p: string, text = p) => `<a href="../workspace/${esc(p)}">${esc(text)}</a>`;
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
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1b1f24}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top;font-size:13px}th{background:#f6f8fa}.pill{font-size:11px;border:1px solid #8c959f;border-radius:10px;padding:1px 7px;font-weight:normal}.warn{background:#fff8c5;border:1px solid #d4a72c;padding:8px 12px;margin:8px 0}code{font-size:12px}small{color:#57606a}</style></head><body>
<h1>${esc(ws.manifest?.data.organization)}: SOC 2 ${e.type === 'type2' ? 'Type II' : 'Type I'}, engagement ${esc(e.id)}</h1>
<p>${e.type === 'type2' ? `Period ${esc(period.start)} to ${esc(period.end)}` : `As of ${esc(e.as_of)}`} · Firm ${esc(e.firm)} · Package created ${esc(createdAt)} · ${reqs.length} requests · ${evidence.length} evidence records · ${exceptions.length} exceptions</p>
${interim ? `<div class="warn">This package was created on or before the last day of the period: populations and check histories may not cover the period's end. Exceptions list each population read early.</div>` : ''}
<p>Every file below is under <code>workspace/</code> and hashed in <code>manifest.json</code>; these views are derived from those files and hashed too. Tables: <a href="controls-matrix.csv">controls-matrix.csv</a> · <a href="exceptions.csv">exceptions.csv</a> · <a href="check-history/">check-history/</a>. Drafts: ${['description', 'assertion', 'bridge'].filter((k) => existsSync(join(root, 'audits', e.id, 'drafts', `${k}.md`))).map((k) => link(`audits/${e.id}/drafts/${k}.md`, k)).join(', ') || 'none'}.</p>
<h2>Exceptions</h2>${exceptions.length ? `<table><tr><th>Item</th><th>Source</th><th>Controls</th><th>Detail</th><th>Detected</th><th>Resolved</th><th>Management response</th></tr>${exceptions.map((x) => `<tr><td>${esc(x.item)}</td><td>${link(x.file, x.source)}</td><td>${esc(x.controls)}</td><td>${esc(x.detail)}</td><td>${esc(x.detected)}</td><td>${esc(x.resolved)}</td><td>${esc(x.response) || '<small>none recorded</small>'}</td></tr>`).join('')}</table>` : '<p>None found in the package.</p>'}
<h2>Automated checks across the period</h2>${history.size ? `<table><tr><th>Check</th><th>Days with a reading</th><th>Pass</th><th>Fail</th><th>Could not decide</th><th>Latest</th></tr>${[...history.entries()].map(([k, rows]) => { const c = coverage.get(k)!; const last = rows.at(-1)!; return `<tr><td><a href="check-history/${esc(k)}.csv">${esc(k)}</a></td><td>${c.days} of ${days.length}</td><td>${c.pass}</td><td>${c.fail}</td><td>${c.error}</td><td>${esc(last.status)} ${esc(day(last.at))}: ${esc(last.detail)}</td></tr>`; }).join('')}</table>` : '<p>No check ran during the period.</p>'}
<h2>Requests</h2>${reqHtml}
<h2>Control matrix</h2><table><tr><th>Control</th><th>Criteria</th><th>Frequency</th><th>Owner</th><th>Status</th><th>Requests</th><th>Evidence</th><th>Checks</th><th>Exceptions</th></tr>${matrix.filter((m) => m.applicable === 'yes').map((m) => `<tr id="ctl-${esc(m.control)}"><td>${link(`controls/${m.control}.json`, m.control)} ${esc(m.title)}</td><td>${esc(m.criteria)}</td><td>${esc(m.frequency)}</td><td>${esc(m.owner)}</td><td>${esc(m.status)}</td><td>${esc(m.requests)}</td><td>${esc(m.evidence)}</td><td>${esc(m.check_history)}</td><td>${esc(m.exceptions)}</td></tr>`).join('')}</table>
<h2>Out of scope</h2>${excluded.length ? `<ul>${excluded.map((c) => `<li>${esc(c.data.id)} ${esc(c.data.title)}: ${esc(c.data.exclusion_reason ?? '')}</li>`).join('')}</ul>` : '<p>No control is excluded.</p>'}
<p><small>Applicable controls no request names are in the matrix with their evidence; the firm may ask for any of them.</small></p>
</body></html>
`);
  return views;
}
