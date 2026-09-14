// Deliberate selected folder exchange. No network, directory scanning or overwriting returned evidence.
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { localFile } from "./workspace";
import { loadReadiness, saveReadiness, selectReadiness, type Selected } from "./readiness-store";
import { object, validateReadiness } from "./readiness-model";
import { digest, fingerprint, reviewReport } from "./review-model";
import { parseWriteJson } from "./write-json";
const pick = (v: any, keys: string[]) => Object.fromEntries(keys.map(k => [k, v[k]]));
const fileRecord = (f: any) => ({ ...pick(f, ["path", "sha256", "source", "collectedAt"]), period: f.period && pick(f.period, ["start", "end"]) });
const eventRecord = (e: any) => ({ ...pick(e, ["id", "at", "kind", "author", "message"]), ...(e.kind === "submit" ? { files: e.files.map(fileRecord) } : e.kind !== "comment" ? { submissionId: e.submissionId } : {}), ...(e.transfers ? { transfers: e.transfers.map((t: any) => pick(t, ["at", "originalPaths"])) } : {}) });
export const requestRecord = (r: any): any => ({ ...pick(r, ["id", "title", "requester", "contributor", "controlIds"]), period: pick(r.period, ["start", "end"]), events: r.events.map(eventRecord) });
const controlRecord = (c: any) => pick(c, ["id", "title", "framework", "version", "source", "applicability", "rationale", "itemIds"]);
const itemRecord = (i: any) => pick(i, ["id", "owner", "status", "context", "evidence"]);
const PACKAGE_READINESS = "package-readiness.json";
const reserved = ["workspace.json", PACKAGE_READINESS, "exchange.json", "PACKAGE.txt"];
const instructions = `Evidence Desk selected exchange version 1\n\nThis folder contains only the previewed records and complete referenced files, not a redacted view of their contents. Open JSON and ordinary evidence offline with trusted tools. Do not execute evidence or treat names, metadata, hashes, baselines or feedback as authenticated truth. No audit opinion or access control is supplied. Delivered copies cannot be revoked.\n\nWith Evidence Desk installed locally, run: bun run src/readiness.ts serve /absolute/path/to/this-folder --readiness-open package-readiness.json\nUse request history to comment, submit replacement ordinary files, request changes or close readiness work. Preserve exchange.json unchanged. Return this entire folder deliberately; do not re-export it as a fresh baseline. The origin owner previews and explicitly imports only new events. Origin records and evidence are never replaced. Conflicting request or selected control/item edits refuse import; retain both folders and resolve deliberately. Unknown extensions are omitted from selected export; never assume a selected file itself has been redacted.\n`;
function selectedRecords(loaded: ReturnType<typeof loadReadiness>, ids: unknown) {
  if (loaded.data.readinessVersion !== 2 || !Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === "string") || new Set(ids).size !== ids.length) throw new Error("Select unique existing request IDs in readiness v2.");
  const requests = ids.map(id => { const r = loaded.data.requests.find((r: any) => r.id === id); if (!r) throw new Error(`Unknown selected request: ${id}`); return requestRecord(r); });
  const controls = loaded.data.controls.filter((c: any) => requests.some(r => r.controlIds.includes(c.id))).map(controlRecord);
  const items = loaded.manifest.items.filter((i: any) => controls.some((c: any) => c.itemIds.includes(i.id))).map(itemRecord);
  return { requests, controls, items };
}
function readFiles(root: string, paths: string[], forbidden: string[] = []) {
  const files: { path: string; bytes: Buffer; sha256: string; size: number }[] = [];
  let total = 0;
  for (const path of [...new Set(paths)].sort()) {
    if (reserved.includes(path) || path.split("/").some(p => p.startsWith(".evidence-desk-") || p.endsWith(".evidence-desk-lock"))) throw new Error(`Package/protocol path collision: ${path}`);
    const full = localFile(root, path, "Exchange reference");
    if (forbidden.includes(realpathSync(full))) throw new Error("Exchange reference aliases an authoritative source.");
    const info = lstatSync(full);
    if (!info.isFile() || info.nlink !== 1) throw new Error("Exchange requires independent regular reference files; aliases refused.");
    if (info.size + total > 64 * 1024 * 1024) throw new Error("Selected exchange exceeds the 64 MiB evidence limit; narrow selection.");
    const bytes = readFileSync(full); total += bytes.length;
    if (total > 64 * 1024 * 1024) throw new Error("Selected bytes grew beyond 64 MiB; retry after quiescing writers.");
    files.push({ path, bytes, sha256: digest(bytes), size: bytes.length });
  }
  // Catch mutations during collection. This is not a filesystem-wide atomic snapshot.
  for (const f of files) if (digest(readFileSync(localFile(root, f.path, "Exchange reference"))) !== f.sha256) throw new Error("Conflict: evidence changed during collection.");
  return files;
}
const pathsFor = (records: any) => [...records.items.flatMap((i: any) => [i.context, ...i.evidence]), ...records.requests.flatMap((r: any) => r.events.flatMap((e: any) => e.kind === "submit" ? e.files.map((f: any) => f.path) : []))];
function exportSnapshot(s: Selected, ids: unknown) {
  const loaded = loadReadiness(s);
  const base = selectedRecords(loaded, ids);
  const files = readFiles(s.root, pathsFor(base), [realpathSync(s.path), realpathSync(join(s.root, "workspace.json"))]);
  const manifest = { formatVersion: 1, items: base.items };
  const data = { readinessVersion: 2, engagement: pick(loaded.data.engagement, ["systemBoundary", "categories", "type", "start", "end"]), controls: base.controls,
    followUps: loaded.data.followUps.filter((f: any) => base.items.some((i: any) => i.id === f.itemId)).map((f: any) => pick(f, ["itemId", "dueDate"])), requests: base.requests };
  if (loadReadiness(s).revision !== loaded.revision) throw new Error("Conflict: selected sources changed during export preview.");
  const preview = { exchangeVersion: 1, records: { manifest, readiness: data }, files: files.map(({ path, sha256, size }) => ({ path, sha256, size })),
    review: reviewReport(s.root, data), warning: "Includes complete file contents, names, engagement boundary and selected history. Unknown extensions and unselected records are omitted, not embedded-file secrets. Inspect each file before sharing. Copies cannot be revoked." };
  for (const f of files) if (digest(readFileSync(localFile(s.root, f.path, "Exchange reference"))) !== f.sha256) throw new Error("Conflict: evidence changed while deriving preview observations.");
  return { preview, token: fingerprint(preview), files, base, manifest, data };
}
export function previewExport(s: Selected, ids: unknown) { const p = exportSnapshot(s, ids); return { ...p.preview, token: p.token }; }
function newOutsideFolder(root: string, destination: string) {
  if (typeof destination !== "string" || !isAbsolute(destination)) throw new Error("Choose a new absolute destination outside the workspace; its parent must exist.");
  const target = join(realpathSync(dirname(destination)), resolve(destination).split(sep).at(-1)!);
  const offset = relative(root, target);
  if (!offset || (!isAbsolute(offset) && offset !== ".." && !offset.startsWith(`..${sep}`))) throw new Error("Export must be outside the source workspace.");
  mkdirSync(target, { mode: 0o700 }); // Exclusive; partial folders remain inspectable after failures.
  return target;
}
function writeOrdinary(root: string, path: string, bytes: Buffer | string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
}
export function exportPackage(s: Selected, ids: unknown, token: unknown, destination: string) {
  const p = exportSnapshot(s, ids);
  if (token !== p.token) throw new Error("Conflict: preview changed. Preview again and reconsider disclosure before exporting.");
  const target = newOutsideFolder(s.root, destination);
  try {
    for (const f of p.files) writeOrdinary(target, f.path, f.bytes);
    for (const [path, value] of [["workspace.json", p.manifest], [PACKAGE_READINESS, p.data], ["exchange.json", { exchangeVersion: 1, exportedAt: new Date().toISOString(), base: p.base, previewToken: p.token, files: p.preview.files }]] as const) writeOrdinary(target, path, JSON.stringify(value, null, 2) + "\n");
    writeOrdinary(target, "PACKAGE.txt", instructions);
    loadReadiness(selectReadiness(target, PACKAGE_READINESS));
  } catch (cause) { throw new Error(`Export failed; do not share partial folder ${target}. Inspect and choose a new destination: ${cause}`); }
  return { destination: target, token: p.token, files: p.preview.files, meaning: "Point-in-time copy of previewed bytes; no publication or synchronization performed." };
}
function returnedSnapshot(s: Selected, folder: string) {
  const current = loadReadiness(s);
  if (current.data.readinessVersion !== 2) throw new Error("Return import requires explicitly selected readiness v2.");
  const incomingSelection = selectReadiness(folder, PACKAGE_READINESS);
  if (incomingSelection.root === s.root) throw new Error("Choose the separate returned package folder.");
  const incoming = loadReadiness(incomingSelection);
  const envelope = parseWriteJson(readFileSync(localFile(incomingSelection.root, "exchange.json", "Exchange manifest"), "utf8"), "exchange.json");
  if (!object(envelope) || envelope.exchangeVersion !== 1 || !object(envelope.base) || !Array.isArray(envelope.base.requests) || !envelope.base.requests.length || !Array.isArray(envelope.base.controls) || !Array.isArray(envelope.base.items)) throw new Error("Invalid exchange v1 baseline.");
  const base = envelope.base;
  const ids = base.requests.map((r: any) => r.id);
  const local = selectedRecords(current, ids);
  if (fingerprint(local) !== fingerprint(base)) throw new Error("Conflict: origin request history or selected control/item records differ from the exported baseline. Nothing imported; preserve both folders and resolve deliberately.");
  const returned = selectedRecords(incoming, ids);
  if (fingerprint(returned.controls) !== fingerprint(base.controls) || fingerprint(returned.items) !== fingerprint(base.items)) throw new Error("Returned scope/item edits are not imported. Restore exported mappings or resolve them separately.");
  const additions = returned.requests.map((r: any, index: number) => {
    const before = base.requests[index];
    if (fingerprint({ ...r, events: r.events.slice(0, before.events.length) }) !== fingerprint(before)) throw new Error("Returned request rewrites baseline metadata/history; import refused.");
    return { id: r.id, events: r.events.slice(before.events.length) };
  });
  if (!additions.some((r: any) => r.events.length)) throw new Error("No new request events to import.");
  const paths = additions.flatMap((r: any) => r.events.flatMap((e: any) => e.kind === "submit" ? e.files.map((f: any) => f.path) : []));
  const files = readFiles(incomingSelection.root, paths, [realpathSync(incomingSelection.path)]);
  // Also refuse missing references anywhere in selected returned history, not just new submissions.
  readFiles(incomingSelection.root, pathsFor(returned), [realpathSync(incomingSelection.path)]);
  if (loadReadiness(incomingSelection).revision !== incoming.revision || loadReadiness(s).revision !== current.revision) throw new Error("Conflict: sources changed during return preview.");
  const preview = { additions, files: files.map(({ path, sha256, size }) => ({ path, sha256, size })), originRevision: current.revision,
    warning: "Untrusted authored events only. Import preserves local records and copies new-event evidence under a unique local return folder; it does not authenticate reviewers, overwrite files, import scope edits or establish audit sufficiency." };
  return { current, additions, files, preview, token: fingerprint(preview) };
}
export function previewReturn(s: Selected, folder: string) { const p = returnedSnapshot(s, folder); return { ...p.preview, token: p.token }; }
export function importReturn(s: Selected, folder: string, token: unknown) {
  const p = returnedSnapshot(s, folder);
  if (token !== p.token) throw new Error("Conflict: return preview changed. Preview again before importing.");
  const prefix = `returned-${randomUUID()}`;
  let created = false;
  try {
    return saveReadiness(s, p.current.revision, "return-import", undefined, null, loaded => {
      if (p.files.length) { mkdirSync(join(s.root, prefix), { mode: 0o700 }); created = true; }
      for (const f of p.files) writeOrdinary(join(s.root, prefix), f.path, f.bytes);
      for (const addition of p.additions) {
        const r = loaded.data.requests.find((r: any) => r.id === addition.id);
        for (const event of addition.events) {
          const imported = structuredClone(event);
          if (imported.kind === "submit") for (const f of imported.files) f.path = `${prefix}/${f.path}`;
          r.events.push({ ...imported, transfers: [...(imported.transfers ?? []), { at: new Date().toISOString(), originalPaths: event.kind === "submit" ? event.files.map((f: any) => f.path) : [] }] });
        }
      }
      validateReadiness(s.root, loaded.manifest, loaded.data);
    });
  } catch (cause) { throw new Error(`${cause}${created ? `; copied evidence remains in ${join(s.root, prefix)}. No existing evidence was overwritten; inspect possible orphan copies before any cleanup.` : ""}`); }
}
