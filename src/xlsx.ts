// Reads the first worksheet of an .xlsx workbook as CSV text, with node: APIs only: an .xlsx file is a zip archive of
// XML parts. Cells hold shared strings, inline strings or numbers; formulas are read by their cached value. Enough for a
// questionnaire a customer sends as a spreadsheet; anything the reader cannot place is refused, never guessed.
import { inflateRawSync } from 'node:zlib';
import { writeCsv } from './csv.ts';

function unzip(buf: Buffer): Map<string, Buffer> {
  // The end-of-central-directory record is within the last 64 KiB plus its fixed 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`${name} uses zip method ${method}, which is not supported`);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, e, d, x) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(d ? Number(d) : parseInt(x, 16)));
// The text of every <t> in a string item, in order (rich text splits one string across runs).
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const column = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export function xlsxToCsv(buf: Buffer, file: string): string {
  const parts = unzip(buf);
  const part = (name: string) => parts.get(name)?.toString('utf8');
  // The first sheet in workbook order, through the workbook's relationships.
  const workbook = part('xl/workbook.xml'), rels = part('xl/_rels/workbook.xml.rels');
  const rid = workbook && /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = rid && rels ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined;
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheet = part(sheetPath);
  if (!sheet) throw new Error(`${file} has no readable first worksheet`);
  const shared = [...(part('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
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
  const rows = grid.filter((r) => r.some((x) => x.trim()));
  if (!rows.length) throw new Error(`${file}'s first worksheet is empty`);
  const width = Math.max(...rows.map((r) => r.length));
  const columns = rows[0].concat(Array(width - rows[0].length).fill('')).map((c, i) => c.trim() || `column ${i + 1}`);
  return writeCsv({ columns, rows: rows.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) });
}

// A questionnaire file as CSV text: an .xlsx workbook's first sheet, or the file itself as UTF-8.
export const questionnaireText = (buf: Buffer, file: string) => (file.toLowerCase().endsWith('.xlsx') || buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ? xlsxToCsv(buf, file) : buf.toString('utf8'));
