// Validates records against the JSON Schemas in schemas/, which are the single source of each record's contract.
// Supports the subset those schemas use: type, const, enum, required, properties, additionalProperties (schema form),
// items, pattern, minLength and format date-time. Unknown fields are allowed everywhere, so extensions survive.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Schema = {
  type?: string; const?: unknown; enum?: unknown[]; required?: string[]; properties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean; items?: Schema; pattern?: string; minLength?: number; format?: string;
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
    const t = typeOf(v);
    const ok = t === s.type || (s.type === 'number' && t === 'integer');
    if (!ok) return [`${at}: must be ${s.type}, found ${t}`];
  }
  const out: string[] = [];
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.trim().length < s.minLength) out.push(`${at}: must not be empty`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) out.push(`${at}: ${JSON.stringify(v)} does not match ${s.pattern}`);
    if (s.format === 'date-time' && !DATE_TIME.test(v)) out.push(`${at}: must be an ISO date-time`);
  }
  if (Array.isArray(v) && s.items) v.forEach((item, i) => out.push(...check(s.items!, item, `${path}[${i}]`)));
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
