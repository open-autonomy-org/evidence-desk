// Manifest-only edits: exclusive cooperating-writer lock and optimistic stale-read refusal.
import { closeSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { localFile, validateManifest } from "./workspace";
import { parseWriteJson } from "./write-json";

export function writeItem(destination: string, operation: "item-create" | "item-update", id?: string): void {
  const root = realpathSync(resolve(destination));
  const path = join(root, "workspace.json");
  const lock = join(root, ".evidence-desk-write.lock");
  try { mkdirSync(lock); }
  catch (error) {
    throw new Error(`Cannot acquire ${lock}: another writer or interrupted write may hold it. Wait for the writer; if abandoned, inspect workspace.json and temporary files before manually removing the empty lock directory. (${String(error)})`);
  }
  let temporary: string | undefined;
  let failure: unknown;
  let committed = false;
  try {
    localFile(root, "workspace.json", "workspace.json");
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile()) throw new Error("workspace.json: item writes require a regular non-symlink manifest; edit the canonical workspace instead.");
    if (before.nlink !== 1n) throw new Error("workspace.json: item writes refuse hard-linked manifests; use an independent regular manifest.");
    const original = readFileSync(path);
    const manifest = parseWriteJson(original.toString("utf8"), "workspace.json");
    const requireValid = (value: unknown) => {
      const result = validateManifest(root, value);
      if (result.errors.length) throw new Error(result.errors.join("\n"));
      // Check both the original and proposed manifest, including untouched items.
      for (const item of result.items) {
        for (const reference of [item.context, ...item.evidence]) {
          if (realpathSync(localFile(root, reference, `Item ${item.id} reference`)) === path) {
            throw new Error(`Item ${JSON.stringify(item.id)} reference ${JSON.stringify(reference)} resolves to workspace.json. Item writes refuse to overwrite referenced context/evidence; use an external editor to associate an independent file before retrying. Nothing committed.`);
          }
        }
      }
    };
    requireValid(manifest);
    console.error("Ready: workspace.json read; send one JSON item/patch on stdin, then EOF. No files committed yet.");
    const input: unknown = parseWriteJson(readFileSync(0, "utf8"), "stdin");
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Input must be a JSON item/patch object.");
    const fields = Object.keys(input);
    if (!fields.length || fields.some(key => !["id", "owner", "status", "context", "evidence"].includes(key))) {
      throw new Error("Input must contain only item fields: id, owner, status, context, evidence; supply at least one.");
    }
    if (operation === "item-create") manifest.items.push(input);
    else {
      const index = manifest.items.findIndex((item: { id: string }) => item.id === id);
      if (index < 0) throw new Error(`No item with ID ${JSON.stringify(id)}; reopen the workspace and choose an existing ID.`);
      manifest.items[index] = { ...manifest.items[index], ...input };
    }
    requireValid(manifest);
    const candidate = join(root, `.evidence-desk-write-${randomUUID()}.tmp`);
    const fd = openSync(candidate, "wx", 0o600);
    temporary = candidate;
    try {
      writeFileSync(fd, JSON.stringify(manifest, null, 2) + "\n");
      fchmodSync(fd, Number(before.mode & 0o777n));
      fsyncSync(fd);
    } finally { closeSync(fd); }
    // Not an atomic compare-and-swap against writers ignoring the lock; see the format contract.
    let unchanged = false;
    try {
      const now = lstatSync(path, { bigint: true });
      unchanged = now.isFile() && now.dev === before.dev && now.ino === before.ino &&
        now.mtimeNs === before.mtimeNs && now.ctimeNs === before.ctimeNs && readFileSync(path).equals(original);
    } catch { /* Disappearance or unreadability is also a conflict, never permission to replace. */ }
    if (!unchanged) throw new Error("Conflict: workspace.json changed since read. Nothing committed; reopen/reread and retry the edit against the external change.");
    renameSync(temporary, path);
    temporary = undefined;
    committed = true;
    console.log(`Committed ${operation}: ${path}`);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cleanup: string[] = [];
    try { if (temporary) unlinkSync(temporary); }
    catch (error) { cleanup.push(String(error)); }
    try { rmdirSync(lock); }
    catch (error) { cleanup.push(String(error)); }
    if (cleanup.length) throw new Error(`${failure ? `${String(failure)}\n` : ""}Cleanup failed: ${cleanup.join("; ")}. ${committed ? "Manifest committed" : "Manifest not committed"}; inspect the workspace and remove only abandoned protocol files before retrying.`);
  }
}
