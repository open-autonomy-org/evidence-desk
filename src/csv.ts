// RFC 4180 CSV for the registers: a header row, then one record per row. Quoted fields may hold commas,
// quotes and newlines. Unknown columns are kept in order, so a spreadsheet's extra columns survive a write.

export type Table = { columns: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string, file: string): Table {
  const records: string[][] = [];
  let field = '', row: string[] = [], quoted = false, i = 0;
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r' && src[i + 1] === '\n') i++;
    if (c === '\n' || c === '\r') { row.push(field); records.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (quoted) throw new Error(`${file}: a quoted field is not closed`);
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ''));
  if (!nonEmpty.length) throw new Error(`${file}: the header row is missing`);
  const [columns, ...body] = nonEmpty;
  if (new Set(columns).size !== columns.length) throw new Error(`${file}: duplicate column names in the header`);
  const rows = body.map((r, n) => {
    if (r.length > columns.length) throw new Error(`${file}: row ${n + 2} has ${r.length} fields but the header has ${columns.length}`);
    return Object.fromEntries(columns.map((c, k) => [c, r[k] ?? '']));
  });
  return { columns, rows };
}

const cell = (v: string): string => /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
// A file for a spreadsheet (one sent to someone who opens it in one) keeps every cell text: a spreadsheet reads a cell
// that begins = + - @, a tab or a carriage return as a formula, so such a cell is written after an apostrophe. Records
// the workspace keeps are written exactly.
const text = (v: string): string => /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
// A table the workspace wrote, made safe to open in a spreadsheet the same way.
export const spreadsheetCsv = (csv: string, file: string): string => writeCsv(parseCsv(csv, file), { spreadsheet: true });
export function writeCsv(t: Table, opts: { spreadsheet?: boolean } = {}): string {
  const out = opts.spreadsheet ? (v: string) => cell(text(v)) : cell;
  return [t.columns, ...t.rows.map((r) => t.columns.map((c) => r[c] ?? ''))].map((r) => r.map(out).join(',')).join('\n') + '\n';
}
