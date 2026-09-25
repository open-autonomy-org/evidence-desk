// Reads the questions of an .xlsx workbook as CSV text, with node: APIs only: an .xlsx file is a zip archive of XML
// parts. Cells hold shared strings, inline strings or numbers (read as stored); formulas are read by their cached value.
// Enough for a questionnaire a customer sends as a spreadsheet; anything the reader cannot place is refused, never guessed.
import { inflateRawSync } from 'node:zlib';
import { writeCsv } from './csv.ts';

// The archive's directory, and a reader that inflates one named part on demand, bounded: a workbook is small, and an
// archive whose parts would expand past the bound (a zip bomb) is refused rather than exhausting memory.
const PART_LIMIT = 32 * 1024 * 1024;
function unzip(buf: Buffer): { names: Set<string>; read(name: string): Buffer | undefined } {
  // The end-of-central-directory record is within the last 64 KiB plus its fixed 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, { method: number; size: number; full: number; local: number }>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    entries.set(buf.subarray(at + 46, at + 46 + nameLen).toString('utf8'), { method: buf.readUInt16LE(at + 10), size: buf.readUInt32LE(at + 20), full: buf.readUInt32LE(at + 24), local: buf.readUInt32LE(at + 42) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: new Set(entries.keys()),
    read(name) {
      const e = entries.get(name);
      if (!e) return undefined;
      if (e.full > PART_LIMIT) throw new Error(`${name} expands to more than ${PART_LIMIT / 1048576} MiB`);
      const dataAt = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      if (dataAt + e.size > buf.length) throw new Error(`${name} runs past the end of the archive`);
      const raw = buf.subarray(dataAt, dataAt + e.size);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return inflateRawSync(raw, { maxOutputLength: PART_LIMIT });
      throw new Error(`${name} uses zip method ${e.method}, which is not supported`);
    },
  };
}

// The elements named tag, in order, found by scanning forward once: a part whose tags never close is read to its end
// once, not once per opening tag as a lazy regular expression would. Elements of this format do not nest in themselves.
function* elements(xml: string, tag: string): Generator<{ attrs: string; body: string | undefined }> {
  const open = `<${tag}`, close = `</${tag}>`;
  for (let at = 0; ;) {
    const i = xml.indexOf(open, at);
    if (i < 0) return;
    at = i + open.length;
    if (!/[\s/>]/.test(xml[at] ?? '')) continue;
    const gt = xml.indexOf('>', at);
    if (gt < 0) return;
    const attrs = xml.slice(at, gt);
    if (attrs.endsWith('/')) { yield { attrs: attrs.slice(0, -1), body: undefined }; at = gt + 1; continue; }
    const end = xml.indexOf(close, gt);
    if (end < 0) return;
    yield { attrs, body: xml.slice(gt + 1, end) };
    at = end + close.length;
  }
}
// The part without the named elements (phonetic runs), in one forward scan.
function without(xml: string, tag: string): string {
  let out = '', at = 0;
  for (const open = `<${tag}`, close = `</${tag}>`; ;) {
    const i = xml.indexOf(open, at);
    if (i < 0) return out + xml.slice(at);
    out += xml.slice(at, i);
    const end = xml.indexOf(close, i);
    if (end < 0) return out;
    at = end + close.length;
  }
}

const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, e, d, x) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(d ? Number(d) : parseInt(x, 16)));
// The text of every <t> in a string item, in order (rich text splits one string across runs).
const textOf = (xml: string) => [...elements(without(xml, 'rPh'), 't')].map((t) => decode(t.body ?? '')).join('');
// A cell's column from its reference; the format ends at column XFD (16,384), and a reference past it is refused
// rather than allocated.
const COLUMNS = 16384;
const column = (ref: string) => {
  let n = 0; for (const ch of ref.replace(/\d+$/, '')) { n = n * 26 + (ch.charCodeAt(0) - 64); if (n > COLUMNS) throw new Error(`cell ${ref} is past the last column a spreadsheet can have`); }
  return n - 1;
};
// Cells a sheet may spread over, counting the empty ones placed before a cell: far more than any questionnaire.
const CELLS = 2_000_000;

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
function rowsOf(sheet: string, shared: string[]): string[][] {
  const grid: string[][] = [];
  let budget = CELLS;
  for (const row of elements(sheet, 'row')) {
    const cells: string[] = [];
    // A cell with no reference follows the one before it, whether or not that one was placed.
    let next = 0;
    for (const c of elements(row.body ?? '', 'c')) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c.attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(c.attrs)?.[1];
      const body = c.body ?? '';
      const v = elements(body, 'v').next().value?.body;
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(body) : v !== undefined ? decode(v) : '';
      const i = ref ? column(ref) : next;
      next = i + 1;
      // An empty cell placed by reference (formatting, often far to the right) takes no room: only a value is placed.
      if (!value) continue;
      budget -= Math.max(1, i + 1 - cells.length);
      if (budget < 0) throw new Error(`the sheet spreads over more than ${CELLS.toLocaleString('en')} cells, far more than a questionnaire`);
      while (cells.length < i) cells.push('');
      cells[i] = value;
    }
    grid.push(cells);
  }
  return grid.filter((r) => r.some((x) => x.trim()));
}

// The questions: the first worksheet, in workbook order, with a row naming a question column; that row is the header.
// Questionnaires often open with an instructions sheet or title rows, which are passed over.
// A questionnaire's columns by their headings, the one test the sheet picker and the importer share. A heading is read
// as words (camelCase, underscores and digits split: "QuestionText", "question_text", "Question1"), and it names a
// question when "question(s)" is one of them: a title naming the questionnaire ("…Questionnaire") does not. A heading
// that names the question's id, number or reference identifies it rather than asking it.
const words = (h: string) => h.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\d]+/g, ' ');
const namesQuestion = (h: string) => /\bquestions?\b/i.test(words(h));
// "No" is a number only on its own: a "(Yes/No)" heading asks a question.
const namesId = (h: string) => /#/.test(h) || /\b(id|no|nr|num|number|ref|reference)\b/i.test(words(h).replace(/\byes\s*\/\s*no\b/gi, ''));
export const isQuestionColumn = (h: string) => namesQuestion(h) && !namesId(h);
export const isIdColumn = (h: string) => /^\s*(id|number|#|ref)\s*$/i.test(h) || (namesQuestion(h) && namesId(h));
// "Question(s)" alone first, else the first heading asking a question.
export const questionColumn = (headings: string[]) => headings.find((c) => /^\s*questions?\s*$/i.test(c)) ?? headings.find(isQuestionColumn);

export function xlsxToCsv(buf: Buffer, file: string): string {
  const zip = unzip(buf);
  const part = (name: string) => zip.read(name)?.toString('utf8');
  const workbook = part('xl/workbook.xml') ?? '';
  const rels = new Map([...elements(part('xl/_rels/workbook.xml.rels') ?? '', 'Relationship')].map((m) => [attr(m.attrs, 'Id'), attr(m.attrs, 'Target')]));
  const sheets = [...elements(workbook, 'sheet')].map((m) => rels.get(attr(m.attrs, 'r:id')))
    .filter((t): t is string => !!t).map((t) => (t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`));
  const shared = [...elements(part('xl/sharedStrings.xml') ?? '', 'si')].map((m) => textOf(m.body ?? ''));
  for (const path of sheets.length ? sheets : ['xl/worksheets/sheet1.xml']) {
    const sheet = part(path);
    if (!sheet) continue;
    const rows = rowsOf(sheet, shared);
    // The header: a cell that is just "Question(s)", or a heading asking a question in a row of several headings. A
    // title ("Vendor Security Questionnaire", CSA's "…Initiative Questionnaire" beside its version stamp) names a
    // questionnaire, not a question, and is passed over.
    const isHeader = (r: string[]) => r.some((x) => /^\s*questions?\s*$/i.test(x)) || (r.filter((x) => x.trim()).length >= 2 && r.some(isQuestionColumn));
    const qOf = (r: string[]) => r.indexOf(questionColumn(r)!);
    let at = rows.findIndex(isHeader);
    // A heading row with nothing under it gives way to the header below it: when the first cell filled under its question
    // column reads as a column's name (a bare "Question", or an id heading such as "Question ID", with no "?"), that row
    // is the header. A question mentioning a question's id ("Is each question given a reference ID?") asks, and stays.
    for (;;) {
      if (at < 0) break;
      const q = qOf(rows[at]);
      const next = rows.findIndex((r, i) => i > at && (r[q] ?? '').trim());
      if (next < 0) { at = -1; break; }
      const cell = rows[next][q];
      if (isHeader(rows[next]) && !cell.includes('?') && (/^\s*questions?\s*$/i.test(cell) || isIdColumn(cell))) at = next; else break;
    }
    if (at < 0) continue;
    const body = rows.slice(at);
    const width = Math.max(...body.map((r) => r.length));
    if (width * body.length > CELLS) throw new Error(`the sheet spreads over more than ${CELLS.toLocaleString('en')} cells, far more than a questionnaire`);
    const seen = new Map<string, number>();
    const columns = body[0].concat(Array(width - body[0].length).fill('')).map((c, i) => {
      const base = c.trim() || `column ${i + 1}`;
      const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
      return n === 1 ? base : `${base} (${n})`;
    });
    return writeCsv({ columns, rows: body.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) });
  }
  throw new Error(`${file} has no worksheet with a question column: a heading such as "Question" or "Question text" (not only "Question ID") with questions under it`);
}

// A questionnaire file as CSV text: an .xlsx workbook's question sheet, or the file itself as UTF-8.
export const questionnaireText = (buf: Buffer, file: string) => (file.toLowerCase().endsWith('.xlsx') || buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ? xlsxToCsv(buf, file) : buf.toString('utf8'));
