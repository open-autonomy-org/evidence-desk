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
      const raw = buf.subarray(dataAt, dataAt + e.size);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return inflateRawSync(raw, { maxOutputLength: PART_LIMIT });
      throw new Error(`${name} uses zip method ${e.method}, which is not supported`);
    },
  };
}

const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, e, d, x) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(d ? Number(d) : parseInt(x, 16)));
// The text of every <t> in a string item, in order (rich text splits one string across runs).
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const column = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
function rowsOf(sheet: string, shared: string[]): string[][] {
  const grid: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const type = /\bt="([^"]+)"/.exec(c[1])?.[1];
      const body = c[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? textOf(body) : v !== undefined ? decode(v) : '';
      const i = ref ? column(ref) : cells.length;
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
  const rels = new Map([...(part('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => rels.get(attr(m[0], 'r:id')))
    .filter((t): t is string => !!t).map((t) => (t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`));
  const shared = [...(part('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? ''));
  for (const path of sheets.length ? sheets : ['xl/worksheets/sheet1.xml']) {
    const sheet = part(path);
    if (!sheet) continue;
    const rows = rowsOf(sheet, shared);
    // The header: a cell that is just "Question(s)", or a heading asking a question in a row of several headings. A
    // title ("Vendor Security Questionnaire", CSA's "…Initiative Questionnaire" beside its version stamp) names a
    // questionnaire, not a question, and is passed over; so is a sheet with nothing under its question column.
    // Every header row is tried in order, so a heading row with nothing under it gives way to a later one on the sheet.
    const isHeader = (r: string[]) => r.some((x) => /^\s*questions?\s*$/i.test(x)) || (r.filter((x) => x.trim()).length >= 2 && r.some(isQuestionColumn));
    // A header's questions run to the next header row: a later heading is not an answer to an earlier one.
    const heads = rows.map((r, i) => (isHeader(r) ? i : -1)).filter((i) => i >= 0);
    const at = heads.find((i, k) => { const q = rows[i].indexOf(questionColumn(rows[i])!); return rows.slice(i + 1, heads[k + 1] ?? rows.length).some((b) => (b[q] ?? '').trim()); }) ?? -1;
    if (at < 0) continue;
    const body = rows.slice(at);
    const width = Math.max(...body.map((r) => r.length));
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
