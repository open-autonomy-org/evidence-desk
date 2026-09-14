// One-file commits under the existing workspace writer lock; both selected sources are guarded.
import { closeSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { localFile } from "./workspace";
import { parseWriteJson } from "./write-json";
import { editItem, editReadiness, emptyReadiness, validateReadiness } from "./readiness-model";
import { editReview } from "./review-model";

export type Selected = { root: string; relative: string; path: string };
export function selectReadiness(folder: string, relative: string): Selected {
  const root = realpathSync(resolve(folder));
  if (!relative || /[\\:\x00-\x1f\x7f]/.test(relative) || relative.split("/").some(p => !p || p === "." || p === ".." || p.startsWith(".evidence-desk-") || p.endsWith(".evidence-desk-lock")) || relative === "workspace.json") {
    throw new Error("Select a safe workspace-relative readiness path, distinct from workspace.json and writer protocol paths.");
  }
  const path = join(root, relative);
  let parent = root;
  for (const part of relative.split("/").slice(0, -1)) {
    parent = join(parent, part);
    const info = lstatSync(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Readiness parent components must be existing real directories, not aliases.");
  }
  return { root, relative, path };
}
function source(path: string) {
  const info = lstatSync(path, { bigint: true });
  if (!info.isFile() || info.nlink !== 1n) throw new Error(`${path}: selected operations require independent regular non-symlink sources; aliases refused.`);
  const bytes = readFileSync(path);
  const signature = [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(":");
  const revision = createHash("sha256").update(signature).update(bytes).digest("hex");
  return { bytes, revision, mode: Number(info.mode & 0o777n) };
}
function references(selected: Selected, manifest: any, data: any) {
  const manifestPath = realpathSync(join(selected.root, "workspace.json"));
  let readinessPath = selected.path;
  try { readinessPath = realpathSync(selected.path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  for (const i of manifest.items) for (const ref of [i.context, ...i.evidence]) {
    const target = realpathSync(localFile(selected.root, ref, "Reference"));
    if (target === readinessPath || target === manifestPath) throw new Error("Selected source aliases a context/evidence reference; nothing committed.");
  }
  if (data.readinessVersion === 2) for (const request of data.requests) for (const event of request.events) {
    if (event.kind !== "submit") continue;
    for (const file of event.files) {
      if (file.path === "workspace.json" || file.path === selected.relative) throw new Error("Submission aliases an authoritative source; nothing committed.");
      let target: string;
      try { target = realpathSync(localFile(selected.root, file.path, "Submission")); }
      catch { continue; } // Unavailable historical evidence remains an observation, not a load failure.
      if (target === readinessPath || target === manifestPath) throw new Error("Submission aliases an authoritative source; nothing committed.");
    }
  }
}
export function loadReadiness(selected: Selected) {
  selectReadiness(selected.root, selected.relative); // Recheck parent topology on every operation.
  if (realpathSync(selected.path) === realpathSync(join(selected.root, "workspace.json"))) throw new Error("Selected readiness path aliases workspace.json; nothing committed.");
  const manifestSource = source(join(selected.root, "workspace.json"));
  const readinessSource = source(selected.path);
  const manifest = parseWriteJson(manifestSource.bytes.toString("utf8"), "workspace.json");
  const data = parseWriteJson(readinessSource.bytes.toString("utf8"), selected.relative);
  validateReadiness(selected.root, manifest, data);
  references(selected, manifest, data);
  const revision = `${manifestSource.revision}:${readinessSource.revision}`;
  if (revision !== currentRevision(selected)) throw new Error("Conflict: a source changed during validation. Explicitly reload and revalidate.");
  return { manifest, data, revision, manifestSource, readinessSource };
}
function currentRevision(s: Selected) {
  selectReadiness(s.root, s.relative);
  return `${source(join(s.root, "workspace.json")).revision}:${source(s.path).revision}`;
}
function locked<T>(s: Selected, action: () => T): T {
  const acquired: string[] = [];
  try {
    for (const path of [join(s.root, ".evidence-desk-write.lock"), `${s.path}.evidence-desk-lock`]) {
      try { mkdirSync(path); acquired.push(path); }
      catch { throw new Error(`Cannot acquire ${path}. Wait for cooperating writers; inspect sources and abandoned protocol files before manual lock recovery.`); }
    }
    return action();
  } finally {
    for (const path of acquired.reverse()) rmdirSync(path);
  }
}
export function createReadiness(s: Selected) {
  return locked(s, () => {
    selectReadiness(s.root, s.relative);
    // Even invalid/unrelated files, dangling symlinks and directories are collisions, not imports.
    try { lstatSync(s.path); throw new Error("Create refused: selected path already exists. No existing content was modified."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const before = source(join(s.root, "workspace.json"));
    const manifest = parseWriteJson(before.bytes.toString("utf8"), "workspace.json");
    const data = emptyReadiness();
    validateReadiness(s.root, manifest, data);
    references(s, manifest, data);
    if (source(join(s.root, "workspace.json")).revision !== before.revision) throw new Error("Conflict: manifest changed before readiness creation.");
    const fd = openSync(s.path, "wx", 0o600);
    try { writeFileSync(fd, JSON.stringify(data, null, 2) + "\n"); fsyncSync(fd); }
    finally { closeSync(fd); }
    // Exclusive creation is not a two-file transaction; interrupted creation may need manual recovery.
  });
}
export function saveReadiness(s: Selected, expected: string, operation: string, id: string | undefined, input: unknown, transform?: (loaded: ReturnType<typeof loadReadiness>) => void) {
  return locked(s, () => {
    let revision: string;
    try { revision = currentRevision(s); }
    catch { throw new Error("Conflict: a source disappeared, changed topology or became unreadable. Nothing saved; explicitly reload/revalidate."); }
    if (expected !== revision) throw new Error("Conflict: workspace.json or selected readiness file changed since load. Nothing saved. Explicitly reload/revalidate, then reapply your edit.");
    const loaded = loadReadiness(s);
    if (expected !== loaded.revision) throw new Error("Conflict: workspace.json or selected readiness file changed since load. Nothing saved. Explicitly reload/revalidate, then reapply your edit.");
    const isItem = operation === "item-create" || operation === "item-update";
    if (operation === "item-update" && input && typeof input === "object" && "id" in input && input.id !== id &&
        (loaded.data.controls.some((c: any) => c.itemIds.includes(id)) || loaded.data.followUps.some((f: any) => f.itemId === id))) {
      throw new Error("Item-ID change would dangle selected control/follow-up associations. Correct those explicitly first; no two-file rewrite is performed.");
    }
    if (transform) transform(loaded);
    else if (["review-enable", "request-create", "request-event"].includes(operation)) editReview(s.root, loaded.data, operation, id, input);
    else if (isItem) editItem(loaded.manifest, operation, id, input);
    else editReadiness(loaded.data, operation, id, input);
    validateReadiness(s.root, loaded.manifest, loaded.data);
    references(s, loaded.manifest, loaded.data);
    const target = isItem ? join(s.root, "workspace.json") : s.path;
    const value = isItem ? loaded.manifest : loaded.data;
    const mode = isItem ? loaded.manifestSource.mode : loaded.readinessSource.mode;
    const temporary = join(dirname(target), `.evidence-desk-write-${randomUUID()}.tmp`);
    let created = false;
    try {
      const fd = openSync(temporary, "wx", 0o600); created = true;
      try { writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fchmodSync(fd, mode); fsyncSync(fd); }
      finally { closeSync(fd); }
      if (currentRevision(s) !== expected) throw new Error("Conflict: a source changed before commit. Nothing saved; explicitly reload.");
      renameSync(temporary, target); created = false;
    } finally { if (created) unlinkSync(temporary); }
    return loadReadiness(s);
  });
}
