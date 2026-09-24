// What the organization tells its customers. The trust center is a static site built from the workspace, publishing
// only what trust.json lists. Questionnaires are answered from workspace facts: each drafted answer quotes and cites
// the records it came from, a person reviews it, and reviewed answers are kept for reuse until a fact they cite changes.
// Drafting needs no AI service; a customer's own coding agent can refine drafts by editing the files.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { check, schema } from './schema.ts';
import { questionnaireText } from './xlsx.ts';
import { parseCsv, writeCsv } from './csv.ts';
import { fileHash, readVersioned, writeVersioned } from './files.ts';
import { categories, categoryAnswer } from './catalog.ts';
import { loadWorkspace, type Workspace } from './workspace.ts';

type Source = { path: string; sha256: string };
export type Question = { id: string; question: string; answer: string; sources: Source[]; status: 'unanswered' | 'draft' | 'reviewed' | 'needs-review'; reviewed_by?: string; reviewed_at?: string; from_library?: string };
export type Questionnaire = { schema: string; id: string; name: string; source?: string; imported_at: string; questions: Question[] };
type LibraryAnswer = { id: string; question: string; answer: string; sources: Source[]; reviewed_by: string; reviewed_at: string };

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
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
export function buildTrustCenter(root: string, out: string): { published: string[] } {
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
  if (cfg.publish.categories) {
    const inScope = ['CC', ...Object.entries(categoryAnswer).filter(([, q]) => a[q] === true).map(([c]) => c)];
    sections.push(`<section><h2>What our program covers</h2><ul>${inScope.map((c) => `<li>${esc(categories[c])}</li>`).join('')}</ul></section>`);
    published.push('categories in scope');
  }
  if (cfg.publish.report) {
    const dir = join(root, 'audits');
    const engagements = (existsSync(dir) ? readdirSync(dir) : []).filter((d) => existsSync(join(dir, d, 'engagement.json'))).map((d) => JSON.parse(readFileSync(join(dir, d, 'engagement.json'), 'utf8')))
      .filter((e) => e.status === 'closed').sort((x, y) => String(x.period?.end ?? x.as_of).localeCompare(String(y.period?.end ?? y.as_of)));
    const last = engagements.at(-1);
    sections.push(`<section><h2>Audit report</h2><p>${last ? esc(`Our SOC 2 ${last.type === 'type1' ? 'Type 1 report as of ' + last.as_of : 'Type 2 report for ' + last.period.start + ' to ' + last.period.end}, issued by ${last.firm}, is available on request under a confidentiality agreement.`) : 'Our SOC 2 audit is in progress.'}</p></section>`);
    published.push('audit report availability');
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
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  return { published };
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
  for (const c of ws.controls.filter((x) => x.data.applicable)) out.push({ path: c.path, label: `control ${c.data.id}`, text: `${c.data.title}. ${c.data.description}${c.data.status === 'implemented' ? '' : ' [status: ' + c.data.status + ']'}` });
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
  const qcol = table.columns.find((c) => /question/i.test(c));
  if (!qcol) throw new Error(`${file} needs a column whose name contains "question"`);
  const idcol = table.columns.find((c) => /^(id|number|#|ref)$/i.test(c.trim()));
  const ws = loadWorkspace(root);
  const corpus = passages(ws);
  const { lib } = readLibrary(root);
  const questions: Question[] = table.rows.filter((r) => r[qcol]?.trim()).map((r, i) => {
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
  const id = `Q-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(2).toString('hex')}`;
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
  }) });
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
