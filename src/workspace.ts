// Version 1 folder creation and read-only validation; no indexes or vendor calls.
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

type Item = { id: string; owner: string; status: string; context: string; evidence: string[]; markdown: string };
type Inspection = { items: Item[]; errors: string[]; warnings: string[] };
const statuses = ["todo", "in-progress", "blocked", "complete"];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function createWorkspace(destination: string): void {
  const root = resolve(destination);
  let exists = true;
  try {
    const info = lstatSync(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${root}: destination must be a real directory.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    exists = false;
  }
  if (exists && readdirSync(root).length) throw new Error(`${root}: destination is occupied; choose a new or empty folder. Nothing was changed.`);
  if (!exists) mkdirSync(root); // Parent must already exist; never create a tree implicitly.
  writeFileSync(join(root, "workspace.json"), JSON.stringify({ formatVersion: 1, items: [] }, null, 2) + "\n", { flag: "wx" });
}

// Check every component before reading: even an intermediate symlink must stay inside root.
function localFile(root: string, value: unknown, label: string): string {
  if (typeof value !== "string" || !value || /[\\:\x00-\x1f\x7f]/.test(value) ||
      isAbsolute(value) || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`${label}: use a workspace-relative path with / separators, no absolute path, traversal, backslash, colon or empty segment.`);
  }
  let path = root;
  for (const part of value.split("/")) {
    path = join(path, part);
    let canonical: string;
    try { canonical = realpathSync(path); }
    catch (error) { throw new Error(`${label}: cannot resolve ${JSON.stringify(value)}; add the missing file or correct the reference (${message(error)}).`); }
    const offset = relative(root, canonical);
    if (isAbsolute(offset) || offset === ".." || offset.startsWith(`..${sep}`)) {
      throw new Error(`${label}: ${JSON.stringify(value)} escapes the workspace through a symlink; use a file inside the workspace.`);
    }
  }
  if (!statSync(path).isFile()) throw new Error(`${label}: ${JSON.stringify(value)} must reference a regular file.`);
  return path;
}

export function inspectWorkspace(destination: string): Inspection {
  const result: Inspection = { items: [], errors: [], warnings: [] };
  const root = realpathSync(resolve(destination));
  let manifest: unknown;
  try { manifest = JSON.parse(readFileSync(localFile(root, "workspace.json", "workspace.json"), "utf8")); }
  catch (error) { throw new Error(`workspace.json: ${message(error)}`); }
  if (!record(manifest)) throw new Error("workspace.json: expected a JSON object.");
  if (manifest.formatVersion !== 1) throw new Error(`workspace.json: unsupported formatVersion ${JSON.stringify(manifest.formatVersion)}; this CLI supports numeric version 1.`);
  if (!Array.isArray(manifest.items)) throw new Error("workspace.json: items must be an array.");
  const ids = new Set<string>();
  for (const [index, data] of manifest.items.entries()) {
    const label = `workspace.json items[${index}]`;
    if (!record(data)) { result.errors.push(`${label}: expected an item object.`); continue; }
    let valid = true;
    const reject = (cause: string) => { result.errors.push(`${label}: ${cause}`); valid = false; };
    if (typeof data.id !== "string" || !data.id.trim()) reject("id must be a nonempty string.");
    else if (ids.has(data.id)) reject(`duplicate id ${JSON.stringify(data.id)}; use a unique item ID.`);
    else ids.add(data.id);
    if (typeof data.owner !== "string") reject("owner must be a string (empty means unassigned).");
    if (typeof data.status !== "string" || !statuses.includes(data.status)) reject(`status must be one of: ${statuses.join(", ")}.`);
    if (typeof data.context !== "string" || !data.context.endsWith(".md")) reject("context must reference a Markdown .md file relative to the workspace.");
    if (!Array.isArray(data.evidence) || !data.evidence.every(path => typeof path === "string")) reject("evidence must be an array of workspace-relative file paths.");
    if (!valid) continue;
    const item: Item = { id: data.id as string, owner: data.owner as string, status: data.status as string,
      context: data.context as string, evidence: data.evidence as string[], markdown: "" };
    try { item.markdown = readFileSync(localFile(root, item.context, `${label} context`), "utf8"); }
    catch (error) { result.errors.push(message(error)); }
    for (const [refIndex, path] of item.evidence.entries()) {
      try { localFile(root, path, `${label} evidence[${refIndex}]`); }
      catch (error) { result.errors.push(message(error)); }
    }
    if (!item.owner.trim()) result.warnings.push(`${label} (${item.id}): owner is unassigned; set owner in workspace.json.`);
    if (!item.markdown.trim()) result.warnings.push(`${label} (${item.id}): Markdown context is empty or unavailable.`);
    if (!item.evidence.length) result.warnings.push(`${label} (${item.id}): no evidence references; add paths when available.`);
    result.items.push(item);
  }
  return result;
}
