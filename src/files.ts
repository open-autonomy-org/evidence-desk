// Reading and writing workspace files. Every read returns a version (the SHA-256 of the bytes read); every write
// names the version it replaces and refuses if the file changed since, so an edit made outside Evidence Desk is
// never silently overwritten. Writes go to a temporary file in the same directory and are renamed into place. Each write
// is noted for the commit that ends the change it belongs to (git.ts): the workspace is a Git repository.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ensureRepo, track } from './git.ts';

export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

export class ConflictError extends Error {
  constructor(public file: string) { super(`${file} changed on disk since it was read; reload it and apply the change again`); }
}

// A workspace-relative path using forward slashes, refused if it could leave the workspace.
export function inside(root: string, rel: string): string {
  if (!rel || isAbsolute(rel) || rel.includes('\\') || rel.split('/').some((p) => p === '..' || p === '.' || p === '')) {
    throw new Error(`${JSON.stringify(rel)} is not a workspace-relative path`);
  }
  const full = resolve(root, rel);
  // A path not yet written is judged by its deepest existing folder, resolved like the root is: a root reached through a
  // symbolic link (macOS's /var and /tmp are) must not make every new file look outside it.
  let probe = full, rest: string[] = [];
  while (!existsSync(probe) && dirname(probe) !== probe) { rest = [basename(probe), ...rest]; probe = dirname(probe); }
  const real = join(realpathSync(probe), ...rest);
  const base = realpathSync(root);
  if (real !== base && !real.startsWith(base + sep)) throw new Error(`${rel} resolves outside the workspace`);
  return full;
}

export type Read = { text: string; version: string };
export function readVersioned(root: string, rel: string): Read | null {
  const full = inside(root, rel);
  if (!existsSync(full)) return null;
  const bytes = readFileSync(full);
  return { text: bytes.toString('utf8'), version: sha256(bytes) };
}

// `expected` is the version read before editing, or null when the file must not exist yet.
export function writeVersioned(root: string, rel: string, text: string | Buffer, expected: string | null): string {
  const full = inside(root, rel);
  const current = existsSync(full) ? sha256(readFileSync(full)) : null;
  if (current !== expected) throw new ConflictError(rel);
  ensureRepo(root);
  mkdirSync(dirname(full), { recursive: true });
  const tmp = join(dirname(full), `.${randomUUID()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, full);
  const written = sha256(typeof text === 'string' ? Buffer.from(text) : text);
  track(root, rel, written);
  return written;
}

export function fileHash(root: string, rel: string): { sha256: string; bytes: number } | null {
  const full = inside(root, rel);
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  const b = readFileSync(full);
  return { sha256: sha256(b), bytes: b.length };
}

export const toRel = (root: string, full: string): string => relative(root, full).split(sep).join('/');
