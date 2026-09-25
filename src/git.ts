// The workspace's store is Git (docs/decisions/0003-git-is-the-backend.md). A workspace is a Git repository, or a folder
// inside one; the first write to a workspace folder that is in none makes it one, committing the folder as it stood. Only
// a folder opened as a workspace (keepHistory) becomes one: a received audit package or a scratch copy does not. Every change
// Evidence Desk makes is one commit of exactly the files it wrote, so the history says who changed what and when; a file
// someone else is editing is never swept into Evidence Desk's commit. Commits are dated by the clock Evidence Desk
// records by (clock.ts), and name the person who acted as their author where the people register gives an email.
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseCsv } from './csv.ts';
import { now } from './clock.ts';

const env = () => ({ ...process.env, GIT_TERMINAL_PROMPT: '0' });
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env() }).trimEnd();
const tryGit = (cwd: string, ...args: string[]): string | null => { try { return git(cwd, ...args); } catch { return null; } };
// Paths Evidence Desk names to Git are names, never patterns: a file called note[12].md must not also take note1.md.
const literal = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...env(), GIT_LITERAL_PATHSPECS: '1' } }).trimEnd();

// The repository holding the workspace: its top level and the workspace's path inside it ('' or 'dir/').
export function repoOf(root: string): { top: string; prefix: string } | null {
  if (!existsSync(root)) return null;
  const top = tryGit(root, 'rev-parse', '--show-toplevel');
  return top === null ? null : { top, prefix: git(root, 'rev-parse', '--show-prefix') };
}

// Files a workspace keeps out of its history: the operating system's litter and environment files that may hold keys.
const IGNORE = '.DS_Store\n.env\n.env.*\n';
const known = new Set<string>();
const workspaces = new Set<string>();
// The folder is a workspace whose history Evidence Desk keeps: the command line's and the app's workspace.
export function keepHistory(root: string): void { workspaces.add(resolve(root)); }
// Called before every write: a workspace that is in no repository becomes one, its existing files the first commit.
export function ensureRepo(root: string): void {
  const key = resolve(root);
  if (known.has(key) || !workspaces.has(key) || !existsSync(root)) return;
  if (!repoOf(root)) {
    git(root, 'init', '-q', '-b', 'main');
    if (!existsSync(join(root, '.gitignore'))) writeFileSync(join(root, '.gitignore'), IGNORE);
    if (readdirSync(root).some((f) => f !== '.git' && f !== '.gitignore')) {
      git(root, 'add', '-A');
      commit(root, ['-m', 'The workspace as it stood when Evidence Desk began keeping its history']);
    } else track(root, '.gitignore', null);
  }
  known.add(key);
}

// The files each workspace has written since its last commit, by workspace root, each with the SHA-256 of the bytes
// written (null where there is nothing to hold it to). A change the app makes runs in its own record (inChange), so two
// requests in flight never commit each other's files; the command line makes one change.
type Touched = Map<string, Map<string, string | null>>;
const changes = new AsyncLocalStorage<Touched>();
const process_: Touched = new Map();
const current = () => changes.getStore() ?? process_;
export const inChange = <T>(fn: () => T): T => changes.run(new Map(), fn);
export function track(root: string, rel: string, sha256: string | null): void {
  const key = resolve(root), touched = current();
  if (!touched.has(key)) touched.set(key, new Map());
  touched.get(key)!.set(rel, sha256);
}
// A change's own writes, and any a failed commit left behind (kept in the process's record, so the next change in the
// app takes them).
export function takeTouched(root: string): [string, string | null][] {
  const key = resolve(root), touched = current();
  const out = new Map([...(process_.get(key) ?? []), ...(touched.get(key) ?? [])]);
  touched.delete(key); process_.delete(key);
  return [...out];
}

// A commit made as Evidence Desk: the machine's own Git identity where it has one, otherwise Evidence Desk's.
function commit(cwd: string, args: string[], author?: string): void {
  const identity = tryGit(cwd, 'config', 'user.email') ? [] : ['-c', 'user.name=Evidence Desk', '-c', 'user.email=evidence-desk@localhost'];
  const at = now();
  execFileSync('git', ['-C', cwd, ...identity, 'commit', '-q', ...(author ? ['--author', author] : []), ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...env(), GIT_LITERAL_PATHSPECS: '1', GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
}

// The person as a Git author: "Name <email>" from the people register, or none.
function authorOf(root: string, person: string | undefined): string | undefined {
  if (!person) return undefined;
  const file = join(root, 'registers', 'people.csv');
  if (!existsSync(file)) return undefined;
  try {
    const row = parseCsv(readFileSync(file, 'utf8'), 'registers/people.csv').rows.find((r) => r.id === person);
    return row?.email && /^[^<>\s]+@[^<>\s]+$/.test(row.email) ? `${(row.name || person).replace(/[<>\n]/g, '')} <${row.email}>` : undefined;
  } catch { return undefined; }
}

// Commits the files the workspace wrote, with a message saying what changed. Returns the commit, or null when nothing
// was written or the bytes written were already the committed ones.
// Each file must still hold the bytes Evidence Desk wrote: one edited outside it since is left to whoever edited it, not
// committed under Evidence Desk's name, and the commit says so.
// A commit that fails (a file changed since, a hook refuses it, signing fails) keeps its files noted, so the app's next
// change takes them; a command that fails says so, and its files wait for git.
export function commitTouched(root: string, message: string, person?: string): string | null {
  const written = takeTouched(root);
  const repo = repoOf(root);
  if (!written.length || !repo) return null;
  const moved = written.filter(([r, sha]) => sha !== null && (!existsSync(join(root, r)) || createHash('sha256').update(readFileSync(join(root, r))).digest('hex') !== sha)).map(([r]) => r);
  const kept = written.filter(([r]) => !moved.includes(r));
  if (moved.length) message += `\n\nNot committed: ${moved.join(', ')} changed on disk after Evidence Desk wrote ${moved.length === 1 ? 'it' : 'them'}.`;
  if (!kept.length) return null;
  const paths = kept.map(([r]) => `${repo.prefix}${r}`);
  try {
    literal(repo.top, 'add', '--', ...paths);
    if (!literal(repo.top, 'diff', '--cached', '--name-only', '--', ...paths)) return null;
    commit(repo.top, ['-m', message, '--', ...paths], authorOf(root, person));
  } catch (e) {
    const key = resolve(root);
    if (!process_.has(key)) process_.set(key, new Map());
    for (const [r, sha] of kept) process_.get(key)!.set(r, sha);
    throw new Error(`the change was written but not committed: ${(e as Error).message.split('\n').find((l) => l.trim()) ?? 'git refused it'}`);
  }
  return git(repo.top, 'rev-parse', 'HEAD');
}

// The branch, its upstream and how far apart they are, from what was last fetched; nothing here uses the network.
export type Status = { branch: string; upstream: string | null; ahead: number; behind: number; uncommitted: string[] };
export function statusOf(root: string): Status | null {
  const repo = repoOf(root);
  if (!repo) return null;
  const branch = tryGit(root, 'symbolic-ref', '--short', '-q', 'HEAD') ?? '';
  const upstream = tryGit(root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  const [ahead, behind] = upstream ? git(root, 'rev-list', '--left-right', '--count', 'HEAD...@{u}').split(/\s+/).map(Number) : [0, 0];
  const uncommitted = git(root, 'status', '--porcelain', '--untracked-files=all', '--', '.').split('\n').filter(Boolean).map((l) => l.slice(3));
  return { branch, upstream, ahead, behind, uncommitted };
}

// Brings the workspace's branch level with its upstream: fetches, takes what the remote has (a fast-forward, or the local
// commits replayed on top of it) and pushes what it lacks, with the machine's own Git credentials. A branch with no
// upstream is left as it is.
export function syncWorkspace(root: string): Status | null {
  const before = statusOf(root);
  if (!before?.upstream) return before;
  const remote = before.upstream.split('/')[0];
  git(root, 'fetch', '-q', remote);
  // The remote's default branch as it is now, so a renamed one is known (signatures.ts reads it).
  tryGit(root, 'remote', 'set-head', remote, '--auto');
  let s = statusOf(root)!;
  if (s.behind && !s.ahead) git(root, 'merge', '-q', '--ff-only', '@{u}');
  else if (s.behind && s.ahead) {
    const dirty = git(repoOf(root)!.top, 'status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).map((l) => l.slice(3));
    if (dirty.length) throw new Error(`the repository has edits not yet committed (${dirty.slice(0, 3).join(', ')}${dirty.length > 3 ? ', …' : ''}): commit or discard them, then sync again`);
    try { git(root, 'rebase', '-q', '@{u}'); }
    catch (e) { tryGit(root, 'rebase', '--abort'); throw new Error(`this workspace's commits could not be replayed on ${s.upstream} (usually both changed the same lines); resolve it with git (git pull --rebase), then sync again: ${(e as Error).message.split('\n').find((l) => l.trim()) ?? ''}`); }
  }
  s = statusOf(root)!;
  if (s.ahead) git(root, 'push', '-q', remote, `HEAD:${s.upstream!.slice(remote.length + 1)}`);
  return statusOf(root);
}

// A sync that may fail without failing the change it follows (the network is not needed to change the workspace): its
// error, or null.
export function trySync(root: string): string | null {
  try { syncWorkspace(root); return null; } catch (e) { return (e as Error).message; }
}

// The GitHub repository the workspace's origin names, as owner/name, or null.
export function githubRepoOf(root: string): string | null {
  const url = tryGit(root, 'remote', 'get-url', 'origin');
  const m = url ? /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url) : null;
  return m ? m[1] : null;
}
