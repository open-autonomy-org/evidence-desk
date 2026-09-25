// Validates records against the JSON Schemas in schemas/, which are the single source of each record's contract.
// Supports the subset those schemas use: type (one, or a list such as ["string", "null"]), const, enum, required, properties, additionalProperties (schema form),
// items, contains, pattern, minLength and format date-time. Unknown fields are allowed everywhere, so extensions survive.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Schema = {
  type?: string | string[]; const?: unknown; enum?: unknown[]; required?: string[]; properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean; items?: Schema; contains?: Schema; pattern?: string; minLength?: number; format?: string;
  title?: string; 'x-columns'?: string[];
};

const root = join(import.meta.dirname, '..', 'schemas');
const cache = new Map<string, Schema>();
export function schema(name: string): Schema {
  let s = cache.get(name);
  if (!s) { s = JSON.parse(readFileSync(join(root, `${name}.schema.json`), 'utf8')) as Schema; cache.set(name, s); }
  return s;
}

const typeOf = (v: unknown): string => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Returns every problem as "path: message"; an empty list means valid.
export function check(s: Schema, v: unknown, path = ''): string[] {
  const at = path || '(record)';
  if (s.const !== undefined && v !== s.const) return [`${at}: must be ${JSON.stringify(s.const)}`];
  if (s.enum && !s.enum.includes(v)) return [`${at}: must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}`];
  if (s.type) {
    const t = typeOf(v), types = [s.type].flat();
    const ok = types.some((x) => t === x || (x === 'number' && t === 'integer'));
    if (!ok) return [`${at}: must be ${types.join(' or ')}, found ${t}`];
  }
  const out: string[] = [];
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.trim().length < s.minLength) out.push(`${at}: must not be empty`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${JSON.stringify(v)} does not match ${s.pattern}`);
    if (s.format === 'date-time' && !DATE_TIME.test(v)) out.push(`${at}: must be an ISO date-time`);
  }
  if (Array.isArray(v) && s.items) v.forEach((item, i) => out.push(...check(s.items!, item, `${path}[${i}]`)));
  if (Array.isArray(v) && s.contains && !v.some((item) => !check(s.contains!, item).length)) out.push(`${at}: must contain ${s.contains.const !== undefined ? JSON.stringify(s.contains.const) : 'a matching item'}`);
  if (typeOf(v) === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) out.push(`${path ? path + '.' : ''}${k}: is required`);
    for (const [k, val] of Object.entries(o)) {
      const sub = s.properties?.[k] ?? (typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined);
      if (sub) out.push(...check(sub, val, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

// Where a value is not of the kind its readers take: a field missing, a value of another JSON type (a text where a
// number or yes/no belongs, null where a text belongs), or a choice of another type than its options. A value of the
// right kind that is merely wrong (a date's format, a text outside its choices, a pattern) is not listed: code reads it
// safely, and check reports it. Each entry is the value's path and the type it must have.
export function shapeErrors(s: Schema, v: unknown, path = ''): { path: string; expected: string }[] {
  const t = typeOf(v);
  if (s.enum && !s.enum.includes(v)) return s.enum.some((e) => typeOf(e) === t || (typeOf(e) === 'integer' && t === 'number')) ? [] : [{ path, expected: [...new Set(s.enum.map(typeOf))].join(' or ') }];
  if (s.const !== undefined) return typeOf(s.const) === t ? [] : [{ path, expected: typeOf(s.const) }];
  if (s.type) {
    const types = [s.type].flat();
    if (!types.some((x) => t === x || (x === 'number' && t === 'integer'))) return [{ path, expected: types.join(' or ') }];
  }
  const out: { path: string; expected: string }[] = [];
  if (Array.isArray(v) && s.items) v.forEach((item, i) => out.push(...shapeErrors(s.items!, item, `${path}[${i}]`)));
  if (t === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) out.push({ path: path ? `${path}.${k}` : k, expected: 'present' });
    for (const [k, val] of Object.entries(o)) {
      const sub = s.properties?.[k] ?? (typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined);
      if (sub) out.push(...shapeErrors(sub, val, path ? `${path}.${k}` : k));
    }
  }
  return out;
}
