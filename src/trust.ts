// What the organization tells its customers. The trust center is a static site built from the workspace, publishing
// only what trust.json lists. Questionnaires are answered from workspace facts: each drafted answer quotes and cites
// the records it came from, a person reviews it, and reviewed answers are kept for reuse until a fact they cite changes.
// Drafting needs no AI service; a customer's own coding agent can refine drafts by editing the files.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { isIdColumn, questionColumn, questionnaireText } from './xlsx.ts';
import { parseCsv, writeCsv } from './csv.ts';
import { fileHash, readVersioned, writeVersioned } from './files.ts';
import { categories, categoryAnswer, frameworkDescriptions } from './catalog.ts';
import { loadWorkspace, type Workspace } from './workspace.ts';
import { badgeSvg, badgesOf, certifications, claimOf, type Badge } from './certifications.ts';
import { frameworkState } from './frameworks.ts';
import { computeGaps } from './gaps.ts';
import { clockDate, now } from './clock.ts';
import { neededControls, targetsOf } from './targets.ts';

type Source = { path: string; sha256: string };
export type Question = { id: string; question: string; answer: string; sources: Source[]; status: 'unanswered' | 'draft' | 'reviewed' | 'needs-review'; reviewed_by?: string; reviewed_at?: string; from_library?: string };
export type Questionnaire = { schema: string; id: string; name: string; source?: string; imported_at: string; questions: Question[] };
type LibraryAnswer = { id: string; question: string; answer: string; sources: Source[]; reviewed_by: string; reviewed_at: string };

const pretty = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
function valid(name: string, data: unknown, what: string) { const e = check(schema(name), data); if (e.length) throw new Error(`${what} is invalid: ${e.join('; ')}`); }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// A contact becomes a link only as an email address (mailto) or an http(s) address; anything else stays plain text.
function link(contact: string, subject?: string): string | null {
  if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(contact)) return `mailto:${contact}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
  if (/^https?:\/\/[^\s<>"]+$/.test(contact)) return contact;
  return null;
}

// ── Trust center ────────────────────────────────────────────────────────────────────────────────────────────────
// What the organization may say about audits and certifications, the one source of the trust page's section, its badges
// and a statement published elsewhere. A claim of being audited or certified rests on a document an independent auditor
// or certifying body issued, held in certifications/ with its hash; a self-attestation says it is one. Without such a
// document it is readiness: how far the program is, and an audit under way only where an engagement records one.
export function reportOf(root: string): { claims: string[]; status: string[]; badges: Badge[] } {
  const ws = loadWorkspace(root);
  const held = certifications(root).filter((c) => c.current);
  const dir = join(root, 'audits');
  const open = (existsSync(dir) ? readdirSync(dir) : []).filter((d) => existsSync(join(dir, d, 'engagement.json'))).map((d) => JSON.parse(readFileSync(join(dir, d, 'engagement.json'), 'utf8')))
    .filter((e) => e.status !== 'closed');
  const g = computeGaps(ws);
  const readiness = `Readiness: evidence for ${g.summary.controls_ready} of ${g.summary.controls_applicable} applicable controls; ${g.summary.criteria_ready} of ${g.summary.criteria_in_scope} criteria in scope ready.`;
  const underway = open.map((e) => `An audit by ${e.firm} ${e.type === 'type1' ? `as of ${e.as_of}` : `covering ${e.period?.start} to ${e.period?.end}`} is under way.`);
  // Readiness for each target (docs/decisions/0002-frameworks-are-targets.md) that no document covers.
  const readinessOf = targetsOf(ws).map((f: string) => {
    const d = frameworkDescriptions.find((x) => x.id === f)!;
    if (f === 'soc2') return { id: f, outcome: d.outcome, framework: 'SOC 2', ready: g.summary.controls_ready, of: g.summary.controls_applicable, unit: 'controls' };
    const st = frameworkState(ws, f);
    return { id: f, outcome: d.outcome, framework: st.title, ready: st.summary.ready, of: st.summary.requirements - st.summary.excluded, unit: 'requirements' };
  });
  return { claims: held.map(claimOf), status: [...(held.some((c) => c.kind !== 'self-attestation') ? [] : ['No audit report or certificate is held yet.']), ...underway, readiness],
    badges: badgesOf(held, readinessOf, now().slice(0, 10)) };
}

// The same words as the trust page's section, published as the owner's statement on an Open Autonomy project page (its
// ADR 0012): the badges, and the section's text as the body. Only what trust.json publishes: without the report
// section there is nothing to publish. The key is the project's steer key, which the owner mints and keeps.
export async function publishStatement(root: string, input: { baseUrl: string; key: string }): Promise<{ status: number; body: Record<string, unknown>; badges: Badge[]; page?: string; readme?: string; readmeClosed?: boolean }> {
  const t = readVersioned(root, 'trust.json');
  if (!t) throw new Error('trust.json is missing; it lists what may be published (see docs/workspace-format.md)');
  const cfg = JSON.parse(t.text);
  valid('trust', cfg, 'trust.json');
  if (!cfg.publish.report) throw new Error('trust.json does not publish the audits and certifications section, so there is nothing to publish');
  const r = reportOf(root);
  const statement = { id: 'compliance', title: 'Compliance', source: { name: 'Evidence Desk', url: 'https://github.com/open-autonomy-org/evidence-desk' }, as_of: now().slice(0, 10),
    badges: r.badges.map((b) => ({ label: b.label, message: b.message, tone: b.tone, until: b.until })),
    body_md: [...r.claims.map((c) => `- ${c}`), ...(r.claims.length ? [''] : []), r.status.join(' ')].join('\n') };
  const base = input.baseUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/agent/statement`, { method: 'POST', headers: { authorization: `Bearer ${input.key}`, 'content-type': 'application/json' }, body: JSON.stringify(statement) });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status !== 200) return { status: res.status, body, badges: r.badges };
  // Where it now shows: the statement's page on the project's dashboard, and the line a README embeds for its badge row
  // (the one the platform's page offers). The key names its project.
  const me = await fetch(`${base}/keys`, { headers: { authorization: `Bearer ${input.key}` } }).then((x) => x.json()).catch(() => ({})) as { account?: string };
  if (!me.account) return { status: res.status, body, badges: r.badges };
  const origin = base.replace(/\/v1$/, '');
  const svg = `${origin}/v1/accounts/${encodeURIComponent(me.account)}/statements/${statement.id}/badges.svg`;
  // A README's image is fetched signed out (GitHub's proxy): offered only if the public can read it, which the project's
  // `dashboard:` word decides (a statements panel not open to the public answers 404).
  const open = await fetch(svg).then((x) => x.ok).catch(() => false);
  return { status: res.status, body, badges: r.badges, page: `${origin}/${me.account}/dashboard/statements/${statement.id}`,
    ...(open ? { readme: `![${statement.title}](${svg})` } : { readmeClosed: true }) };
}

export function buildTrustCenter(root: string, out: string): { published: string[]; badges: Badge[] } {
  const t = readVersioned(root, 'trust.json');
  if (!t) throw new Error('trust.json is missing; it lists what the trust center may publish (see docs/workspace-format.md)');
  const cfg = JSON.parse(t.text);
  valid('trust', cfg, 'trust.json');
  const ws = loadWorkspace(root);
  const org = ws.manifest?.data.organization ?? '';
  const a = ws.scope?.data.answers ?? {};
  const contact = String(a.security_contact ?? '');
  const published: string[] = [];
  const sections: string[] = [];
  let badges: Badge[] = [];
  if (cfg.publish.categories) {
    const inScope = ['CC', ...Object.entries(categoryAnswer).filter(([, q]) => a[q] === true).map(([c]) => c)];
    sections.push(`<section><h2>What our program covers</h2><ul>${inScope.map((c) => `<li>${esc(categories[c])}</li>`).join('')}</ul></section>`);
    published.push('categories in scope');
  }
  if (cfg.publish.report) {
    const r = reportOf(root);
    sections.push(`<section><h2>Audits and certifications</h2>${r.claims.length ? `<ul>${r.claims.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}<p>${esc(r.status.join(' '))}</p></section>`);
    published.push('audits, certifications and readiness');
    badges = r.badges;
  }
  const pol = (cfg.publish.policies ?? []) as string[];
  if (pol.length) {
    const rows = pol.map((id) => {
      const p = ws.policies.find((x) => x.data.id === id);
      if (!p) throw new Error(`trust.json lists policy ${id}, which does not exist`);
      const v = p.data.versions.at(-1);
      if (!v) throw new Error(`trust.json lists policy ${id}, which has no approved version`);
      return `<li>${esc(p.data.title)}, version ${v.version}, approved ${esc(v.approved_at.slice(0, 10))}</li>`;
    });
    sections.push(`<section><h2>Policies</h2><ul>${rows.join('')}</ul><p class="muted">Copies are available on request.</p></section>`);
    published.push(`${pol.length} policy titles`);
  }
  if (cfg.publish.subprocessors) {
    const subs = (ws.registers.vendors?.data.rows ?? []).filter((v) => v.criticality === 'high');
    sections.push(`<section><h2>Subprocessors</h2><table><tr><th>Company</th><th>Service</th></tr>${subs.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.service)}</td></tr>`).join('')}</table></section>`);
    published.push(`${subs.length} subprocessors`);
  }
  const docs = (cfg.publish.documents ?? []) as { title: string; description?: string }[];
  if (docs.length) {
    if (!contact) throw new Error('documents are offered on request, which needs the scoping answer security_contact');
    sections.push(`<section><h2>Documents on request</h2><ul>${docs.map((d) => { const h = link(contact, `Request: ${d.title}`);
      return `<li>${h ? `<a href="${esc(h)}">${esc(d.title)}</a>` : `${esc(d.title)} (ask ${esc(contact)})`}${d.description ? ` — ${esc(d.description)}` : ''}</li>`; }).join('')}</ul></section>`);
    published.push(`${docs.length} documents offered on request`);
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(org)} trust center</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1d2433}h1{margin-bottom:4px}section{border-top:1px solid #dde2ea;padding:12px 0}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px;border-bottom:1px solid #dde2ea}.muted{color:#5d6679}</style></head>
<body><h1>${esc(org)} trust center</h1><p>${esc(cfg.headline)}</p>${cfg.overview ? `<p>${esc(cfg.overview)}</p>` : ''}${sections.join('\n')}
${contact ? `<section><h2>Security contact</h2><p>${link(contact) ? `<a href="${esc(link(contact)!)}">${esc(contact)}</a>` : esc(contact)}</p></section>` : ''}
<p class="muted">Updated ${now().slice(0, 10)}.</p></body></html>
`;
  // The site is written into the folder named, which may be anywhere but the workspace itself. Only its own files are
  // written, never through a link, and a badge the last build published that this one does not is removed with it: a
  // withdrawn claim must not stay at its public address.
  const full = resolve(out), home = resolve(root);
  if (full === home || full.startsWith(home + sep)) throw new Error(`build the trust center outside the workspace, not in ${out}`);
  mkdirSync(full, { recursive: true });
  const own = (rel: string, kind: 'file' | 'dir') => {
    const at = join(full, rel);
    const st = lstatSync(at, { throwIfNoEntry: false });
    if (st && (kind === 'file' ? !st.isFile() : !st.isDirectory())) throw new Error(`${at} is not a plain ${kind === 'file' ? 'file' : 'folder'}; the trust center writes only its own files`);
    return at;
  };
  for (const b of badges) if (!/^[A-Za-z0-9._-]+$/.test(b.id) || b.id.startsWith('.')) throw new Error(`badge ${JSON.stringify(b.id)} is not a name a file can take`);
  const before = (() => { try { return (JSON.parse(readFileSync(own('badges.json', 'file'), 'utf8')).badges ?? []) as { svg?: string }[]; } catch { return []; } })();
  const svgs = new Set(badges.map((b) => `badges/${b.id}.svg`));
  const stale = before.map((b) => b.svg ?? '').filter((f) => /^badges\/[A-Za-z0-9._-]+\.svg$/.test(f) && !svgs.has(f));
  writeFileSync(own('index.html', 'file'), html);
  if (badges.length) {
    mkdirSync(own('badges', 'dir'), { recursive: true });
    for (const b of badges) writeFileSync(own(`badges/${b.id}.svg`, 'file'), badgeSvg(b));
    writeFileSync(own('badges.json', 'file'), pretty({ schema: 'evidence-desk.badges/1', organization: org, as_of: now().slice(0, 10), badges: badges.map((b) => ({ ...b, svg: `badges/${b.id}.svg` })) }));
    published.push(`${badges.length} badges`);
  } else if (before.length || existsSync(join(full, 'badges.json'))) rmSync(own('badges.json', 'file'), { force: true });
  if (lstatSync(join(full, 'badges'), { throwIfNoEntry: false })?.isDirectory()) for (const f of stale) rmSync(own(f, 'file'), { force: true });
  if (stale.length) published.push(`${stale.length} withdrawn badge${stale.length === 1 ? '' : 's'} removed`);
  return { published, badges };
}

// ── Questionnaires ──────────────────────────────────────────────────────────────────────────────────────────────
const STOP = new Set('a an and are as at be by do does for from has have how if in is it its of on or our that the this to we what when where which who will with you your any all can there their been being'.split(' '));
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '')));
function score(q: Set<string>, text: string): number {
  const t = tokens(text);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return q.size ? hit / q.size : 0;
}

type Passage = { path: string; text: string; label: string };
function passages(ws: Workspace): Passage[] {
  const out: Passage[] = [];
  // Passages from the program's controls, and from controls that do not apply (which may truthfully say so); a control no
  // target needs is not a passage at all.
  const needed = neededControls(ws);
  for (const c of ws.controls.filter((x) => needed.has(x.data.id))) out.push({ path: c.path, label: `control ${c.data.id}`, text: `${c.data.title}. ${c.data.description}${c.data.status === 'implemented' ? '' : ' [status: ' + c.data.status + ']'}` });
  for (const c of ws.controls.filter((x) => !x.data.applicable)) out.push({ path: c.path, label: `control ${c.data.id} (excluded)`, text: `${c.data.title}: does not apply. ${c.data.exclusion_reason ?? ''}` });
  for (const p of ws.policies) {
    const v = p.data.versions.at(-1);
    if (!v) continue;
    const text = readFileSync(join(ws.root, v.archived), 'utf8');
    for (const part of text.split(/\n(?=#{2,3} )/)) {
      const body = part.replace(/<!--[\s\S]*?-->/g, '').trim();
      if (body.length > 40) out.push({ path: v.archived, label: `${p.data.title} v${v.version}`, text: body.slice(0, 700) });
    }
  }
  return out;
}

function sourcesFor(root: string, paths: string[]): Source[] {
  return [...new Set(paths)].map((p) => ({ path: p, sha256: fileHash(root, p)!.sha256 }));
}
const readLibrary = (root: string) => { const r = readVersioned(root, 'answers.json'); return { lib: (r ? JSON.parse(r.text).answers : []) as LibraryAnswer[], version: r?.version ?? null }; };
const stale = (root: string, sources: Source[]) => sources.some((s) => fileHash(root, s.path)?.sha256 !== s.sha256);

// Imports a questionnaire (CSV with a question column, and optionally an id column) and drafts every answer.
export function importQuestionnaireText(root: string, text: string, file: string, name: string): { id: string; fromLibrary: number; drafted: number; unanswered: number } {
  const table = parseCsv(text, file);
  // The question and its id by their headings (isQuestionColumn, isIdColumn: the sheet picker's own test).
  const qcol = questionColumn(table.columns);
  if (!qcol) throw new Error(`${file} needs a question column: a heading such as "Question" or "Question text" (not only "Question ID")`);
  const idcol = table.columns.find(isIdColumn);
  const ws = loadWorkspace(root);
  const corpus = passages(ws);
  const { lib } = readLibrary(root);
  const asked = table.rows.filter((r) => r[qcol]?.trim());
  if (!asked.length) throw new Error(`${file} has no questions under its "${qcol}" column`);
  const questions: Question[] = asked.map((r, i) => {
    const text = r[qcol].trim();
    const q = tokens(text);
    const bestLib = lib.map((a) => ({ a, s: score(q, a.question) })).sort((x, y) => y.s - x.s)[0];
    const id = idcol ? r[idcol] || String(i + 1) : String(i + 1);
    if (bestLib && bestLib.s >= 0.75) {
      const changed = stale(root, bestLib.a.sources);
      return { id, question: text, answer: bestLib.a.answer, sources: bestLib.a.sources, status: changed ? 'needs-review' : 'reviewed', from_library: bestLib.a.id,
        ...(changed ? {} : { reviewed_by: bestLib.a.reviewed_by, reviewed_at: bestLib.a.reviewed_at }) };
    }
    const hits = corpus.map((p) => ({ p, s: score(q, p.text) })).filter((x) => x.s >= 0.5).sort((x, y) => y.s - x.s).slice(0, 2);
    if (!hits.length) return { id, question: text, answer: '', sources: [], status: 'unanswered' };
    return { id, question: text, answer: `[Draft from ${hits.map((h) => h.p.label).join(' and ')}; confirm before sending] ${hits.map((h) => h.p.text.replace(/\s+/g, ' ')).join(' ')}`,
      sources: sourcesFor(root, hits.map((h) => h.p.path)), status: 'draft' };
  });
  const id = `Q-${clockDate().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(2).toString('hex')}`;
  const doc: Questionnaire = { schema: 'evidence-desk.questionnaire/1', id, name, source: basename(file), imported_at: now(), questions };
  valid('questionnaire', doc, 'the questionnaire');
  writeVersioned(root, `questionnaires/${id}.json`, pretty(doc), null);
  return { id, fromLibrary: questions.filter((q) => q.from_library).length, drafted: questions.filter((q) => q.status === 'draft').length, unanswered: questions.filter((q) => q.status === 'unanswered').length };
}

export function importQuestionnaire(root: string, file: string, name: string) { return importQuestionnaireText(root, questionnaireText(readFileSync(resolve(file)), file), file, name); }

export function questionnaireCsv(root: string, id: string): string {
  const r = readVersioned(root, `questionnaires/${id}.json`);
  if (!r) throw new Error(`questionnaire ${id} does not exist`);
  const doc = JSON.parse(r.text) as Questionnaire;
  return writeCsv({ columns: ['id', 'question', 'answer', 'status'], rows: doc.questions.map((q) => {
    const current = q.status === 'reviewed' && !stale(root, q.sources);
    return { id: q.id, question: q.question, answer: current ? q.answer : '', status: current ? 'reviewed' : q.status === 'reviewed' ? 'needs-review' : q.status };
  }) }, { spreadsheet: true });
}

// A person writes or approves an answer. Reviewing it records who and when, and keeps it in the library for reuse.
export function reviewAnswer(root: string, id: string, version: string, qid: string, input: { answer: string; by: string; sources?: string[] }): void {
  const rel = `questionnaires/${id}.json`;
  const cur = readVersioned(root, rel);
  if (!cur) throw new Error(`questionnaire ${id} does not exist`);
  if (cur.version !== version) throw new Error(`${rel} changed since it was read; reload it and try again`);
  const ws = loadWorkspace(root);
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === input.by)) throw new Error(`${input.by || '(none)'} is not in registers/people.csv`);
  const doc = JSON.parse(cur.text) as Questionnaire;
  const q = doc.questions.find((x) => x.id === qid);
  if (!q) throw new Error(`question ${qid} is not in this questionnaire`);
  const answer = input.answer.trim();
  if (!answer) throw new Error('write the answer');
  if (/^\[Draft from /.test(answer)) throw new Error('remove the draft marker and state the answer before reviewing it');
  const sources = input.sources ? sourcesFor(root, input.sources.filter((p) => { if (!fileHash(root, p)) throw new Error(`${p} is not a file in the workspace`); return true; })) : q.sources.filter((s) => fileHash(root, s.path));
  Object.assign(q, { answer, sources, status: 'reviewed', reviewed_by: input.by, reviewed_at: now() });
  valid('questionnaire', doc, rel);
  writeVersioned(root, rel, pretty(doc), version);
  const { lib, version: lv } = readLibrary(root);
  const existing = lib.find((a) => a.id === q.from_library) ?? lib.find((a) => a.question.toLowerCase() === q.question.toLowerCase());
  const entry: LibraryAnswer = { id: existing?.id ?? `A-${randomBytes(3).toString('hex')}`, question: q.question, answer, sources: q.sources, reviewed_by: input.by, reviewed_at: q.reviewed_at! };
  const next = { schema: 'evidence-desk.answer-library/1', answers: [...lib.filter((a) => a.id !== entry.id), entry] };
  valid('answer-library', next, 'answers.json');
  writeVersioned(root, 'answers.json', pretty(next), lv);
}

// Library answers whose cited facts changed since they were reviewed.
export function staleLibrary(root: string): LibraryAnswer[] { return readLibrary(root).lib.filter((a) => stale(root, a.sources)); }

// Writes the answered questionnaire back out as CSV. Only reviewed answers are filled in; every row says its status.
export function exportQuestionnaire(root: string, id: string, out: string): { reviewed: number; blank: number } {
  const csv = questionnaireCsv(root, id);
  writeFileSync(resolve(out), csv);
  const rows = parseCsv(csv, out).rows;
  return { reviewed: rows.filter((x) => x.status === 'reviewed').length, blank: rows.filter((x) => x.status !== 'reviewed').length };
}
