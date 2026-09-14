// Authored request history and byte-version observations; neither identities nor audit conclusions.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { localFile } from "./workspace";
import { date, object } from "./readiness-model";
export const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const fingerprint = (value: unknown) => digest(JSON.stringify(value));
const text = (v: unknown): v is string => typeof v === "string";
const nonempty = (v: unknown) => text(v) && !!v.trim();
const period = (v: any) => object(v) && date(v.start) && date(v.end) && v.start <= v.end;
const instant = (v: unknown) => text(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const unique = (values: any[]) => new Set(values).size === values.length;
export function validateReview(data: any) {
  if (!Array.isArray(data.requests)) throw new Error("Readiness v2 requires requests array.");
  const ids = new Set();
  for (const r of data.requests) {
    if (!object(r) || ![r.id, r.title, r.requester, r.contributor].every(nonempty) || !period(r.period) ||
      !Array.isArray(r.controlIds) || !r.controlIds.length || !unique(r.controlIds) || !r.controlIds.every((id: string) => data.controls.some((c: any) => c.id === id)) ||
      !Array.isArray(r.events) || ids.has(r.id)) throw new Error("Invalid request: unique ID, title, requester/contributor labels, ordered period and existing control IDs required.");
    ids.add(r.id);
    let latest: any;
    const eventIds = new Set();
    for (const e of r.events) {
      if (!object(e) || !nonempty(e.id) || eventIds.has(e.id) || !nonempty(e.author) || !nonempty(e.message) || !instant(e.at) ||
        !["comment", "submit", "changes", "close"].includes(e.kind)) throw new Error("Invalid authored request event.");
      eventIds.add(e.id);
      if (e.transfers !== undefined && (!Array.isArray(e.transfers) || !e.transfers.every((t: any) => object(t) && instant(t.at) && Array.isArray(t.originalPaths) && t.originalPaths.every(text)))) throw new Error("Invalid authored transfer provenance.");
      if (e.kind === "submit") {
        if (!Array.isArray(e.files) || !e.files.length || !unique(e.files.map((f: any) => f.path))) throw new Error("Submission needs unique evidence paths.");
        for (const f of e.files) {
          if (!object(f) || !nonempty(f.path) || !/^[a-f0-9]{64}$/.test(f.sha256) || !text(f.source) || !(f.collectedAt === "" || instant(f.collectedAt)) ||
            !(f.period === null || period(f.period))) throw new Error("Invalid submitted file metadata/hash. Use ISO UTC collection time, ordered dates or explicit missing values.");
        }
        latest = e;
      } else if (e.kind !== "comment" && (!latest || e.submissionId !== latest.id)) throw new Error("Reviewer disposition must reference the latest submission ID.");
    }
  }
}
export function fileObservation(root: string, f: any, r: any) {
  let currentSha256: string | null = null;
  let error: string | null = null;
  try { currentSha256 = digest(readFileSync(localFile(root, f.path, "Submission"))); }
  catch (cause) { error = String(cause); }
  const missing = [!f.source.trim() && "source", !f.collectedAt && "collection time", !f.period && "period"].filter(Boolean);
  const stale = !!f.period && (f.period.start > r.period.start || f.period.end < r.period.end);
  return { ...f, currentSha256, changed: currentSha256 !== null && currentSha256 !== f.sha256, unavailable: error,
    missing, stale, futureCollection: !!f.collectedAt && f.collectedAt > new Date().toISOString() };
}
export function reviewReport(root: string, data: any) {
  if (data.readinessVersion !== 2) return null;
  return { rules: "Missing source/time/period are explicit flags. Stale means submitted period does not contain the entire request period. Future collection time is flagged. File hashes detect bytes only; metadata and names are declarations. Closure is readiness feedback, not sufficiency or an audit opinion.",
    requests: data.requests.map((r: any) => {
      const latest = r.events.filter((e: any) => e.kind === "submit").at(-1);
      const disposition = r.events.filter((e: any) => ["changes", "close"].includes(e.kind) && e.submissionId === latest?.id).at(-1);
      const files = latest?.files.map((f: any) => fileObservation(root, f, r)) ?? [];
      return { ...r, events: r.events.map((e: any) => e.kind === "submit" ? { ...e, files: e.files.map((f: any) => fileObservation(root, f, r)) } : e),
        latestSubmissionId: latest?.id ?? null, disposition: disposition?.kind ?? null,
        state: !latest ? "requested" : disposition?.kind === "changes" ? "changes-requested" : disposition?.kind === "close" ? "closed (authored)" : "submitted (contributor declaration)",
        currentBytesReviewed: disposition?.kind === "close" && files.every((f: any) => !f.unavailable && !f.changed),
        associations: latest?.files.map((f: any) => ({ path: f.path, requests: data.requests.filter((other: any) => other.events.some((e: any) => e.kind === "submit" && e.files.some((v: any) => v.path === f.path))).map((v: any) => ({ id: v.id, controlIds: v.controlIds })) })) ?? [] };
    }) };
}
function only(input: unknown, keys: string[]) {
  if (!object(input) || Object.keys(input).some(k => !keys.includes(k))) throw new Error(`Use only: ${keys.join(", ")}.`);
  return input;
}
export function editReview(root: string, data: any, operation: string, id: string | undefined, input: unknown) {
  if (operation === "review-enable") {
    if (data.readinessVersion !== 1 || Object.hasOwn(data, "requests")) throw new Error("Upgrade requires v1 without an existing requests extension; no unknown data is adopted or overwritten.");
    if (!object(input) || input.confirm !== "upgrade selected readiness to v2") throw new Error("Explicit v2 upgrade confirmation required. Older readiness tools cannot open v2.");
    data.readinessVersion = 2; data.requests = []; return;
  }
  if (data.readinessVersion !== 2) throw new Error("Explicitly enable readiness v2 before review operations.");
  if (operation === "request-create") {
    const p = only(input, ["id", "title", "requester", "contributor", "controlIds", "period"]);
    data.requests.push({ ...p, events: [] }); return;
  }
  if (operation !== "request-event") throw new Error("Unknown review operation.");
  const p = only(input, ["kind", "author", "message", "files", "submissionId"]);
  const r = data.requests.find((r: any) => r.id === id);
  if (!r) throw new Error("Choose an existing request ID.");
  const event: any = { id: randomUUID(), at: new Date().toISOString(), kind: p.kind, author: p.author, message: p.message };
  if (p.kind === "submit") {
    if (!Array.isArray(p.files)) throw new Error("Submission requires files.");
    event.files = p.files.map((input: unknown) => {
      const f = only(input, ["path", "source", "collectedAt", "period"]);
      return { ...f, sha256: digest(readFileSync(localFile(root, f.path, "Submission"))) };
    });
  } else if (["close", "changes"].includes(p.kind)) {
    const latest = r.events.filter((e: any) => e.kind === "submit").at(-1);
    if (!latest || p.submissionId !== latest.id) throw new Error("Explicitly select the latest submission ID for reviewer feedback.");
    if (latest.files.some((f: any) => { const observation = fileObservation(root, f, r); return observation.changed || observation.unavailable; })) throw new Error("Submitted bytes changed or disappeared. Record a replacement submission before disposition.");
    event.submissionId = latest.id;
  }
  r.events.push(event);
}
