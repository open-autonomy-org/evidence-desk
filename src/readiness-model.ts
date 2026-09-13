// Explicitly selected readiness version 1; these are authored records, never an official catalog.
import { statuses, validateManifest } from "./workspace";
export const categories = ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"];
export const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nonempty = (v: unknown) => text(v) && !!v.trim();
export function date(v: unknown): boolean {
  return text(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "0001-01-01" &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function emptyReadiness() {
  return { readinessVersion: 1, engagement: { systemBoundary: "", categories: [], type: "", start: "", end: "" }, controls: [], followUps: [] };
}
export function validateReadiness(root: string, manifest: any, data: any) {
  const inspection = validateManifest(root, manifest);
  if (inspection.errors.length) throw new Error(inspection.errors.join("\n"));
  if (!object(data) || data.readinessVersion !== 1) throw new Error("Selected readiness file requires readinessVersion: 1; no migration or ownership inference is performed.");
  const e = data.engagement;
  if (!object(e) || !text(e.systemBoundary) || !Array.isArray(e.categories) ||
      !e.categories.every((v: unknown) => categories.includes(v as string)) || new Set(e.categories).size !== e.categories.length ||
      !["", "Type I", "Type II"].includes(e.type) || !text(e.start) || !text(e.end) ||
      ((e.start !== "" || e.end !== "") && (!date(e.start) || !date(e.end) || e.start > e.end))) {
    throw new Error("Invalid engagement: use boundary text, unique SOC2 category names, blank/Type I/Type II and either two blank dates or a valid ordered YYYY-MM-DD period.");
  }
  if (!Array.isArray(data.controls) || !Array.isArray(data.followUps)) throw new Error("Readiness controls and followUps must be arrays.");
  const items = new Set(inspection.items.map(i => i.id));
  const ids = new Set<string>();
  for (const c of data.controls) {
    if (!object(c) || ![c.id, c.title, c.framework, c.version, c.source].every(nonempty) ||
        !["included", "excluded"].includes(c.applicability) || !nonempty(c.rationale) ||
        !Array.isArray(c.itemIds) || !c.itemIds.every((id: unknown) => text(id) && items.has(id)) ||
        new Set(c.itemIds).size !== c.itemIds.length || ids.has(c.id)) {
      throw new Error("Invalid control: require unique stable ID, title, framework/version/source, included/excluded with rationale, and unique existing itemIds.");
    }
    ids.add(c.id);
  }
  const followed = new Set<string>();
  for (const f of data.followUps) {
    if (!object(f) || !items.has(f.itemId) || followed.has(f.itemId) || !(f.dueDate === "" || date(f.dueDate))) {
      throw new Error("Invalid follow-up: require unique existing itemId and blank or valid YYYY-MM-DD dueDate.");
    }
    followed.add(f.itemId);
  }
  return inspection;
}
function fields(input: unknown, allowed: string[]) {
  if (!object(input) || !Object.keys(input).length || Object.keys(input).some(k => !allowed.includes(k))) {
    throw new Error(`Supply an object containing only: ${allowed.join(", ")}.`);
  }
  return input;
}
export function editItem(manifest: any, operation: string, id: string | undefined, input: unknown) {
  const patch = fields(input, ["id", "owner", "status", "context", "evidence"]);
  if (operation === "item-create") manifest.items.push(patch);
  else {
    const index = manifest.items.findIndex((i: any) => i.id === id);
    if (index < 0) throw new Error("Choose an existing item ID.");
    manifest.items[index] = { ...manifest.items[index], ...patch };
  }
}
export function editReadiness(data: any, operation: string, id: string | undefined, input: unknown) {
  if (operation === "engagement") Object.assign(data.engagement, fields(input, ["systemBoundary", "categories", "type", "start", "end"]));
  else if (operation === "due-date") {
    const patch = fields(input, ["dueDate"]);
    const current = data.followUps.find((f: any) => f.itemId === id);
    if (current) Object.assign(current, patch);
    else data.followUps.push({ itemId: id, ...patch });
  } else if (operation === "control-create" || operation === "control-update") {
    const patch = fields(input, ["id", "title", "framework", "version", "source", "applicability", "rationale", "itemIds"]);
    if (operation === "control-create") data.controls.push(patch);
    else {
      const current = data.controls.find((c: any) => c.id === id);
      if (!current) throw new Error("Choose an existing control ID.");
      if (patch.id !== undefined && patch.id !== id) throw new Error("Control IDs are stable; they cannot be renamed.");
      Object.assign(current, patch);
    }
  } else throw new Error("Unknown readiness edit operation.");
}
export function readinessReport(manifest: any, data: any) {
  const today = new Date().toISOString().slice(0, 10);
  return { reportSchemaVersion: 1, selectedReadinessVersion: 1, today,
    meaning: "Authored mappings and status only. Not official coverage, evidence sufficiency or an audit opinion.",
    engagement: data.engagement, controls: data.controls,
    gaps: [!data.engagement.systemBoundary.trim() && "System boundary missing", !data.engagement.categories.length && "No categories chosen",
      !data.engagement.type && "Engagement type missing", !data.engagement.start && "Period missing", !data.controls.length && "No authored controls"].filter(Boolean),
    items: manifest.items.map((i: any) => {
      const dueDate = data.followUps.find((f: any) => f.itemId === i.id)?.dueDate ?? "";
      return { id: i.id, owner: i.owner, status: i.status, context: i.context, evidence: i.evidence, dueDate,
        unassigned: !i.owner.trim(), incomplete: i.status !== "complete", missingEvidence: !i.evidence.length,
        overdue: !!dueDate && dueDate < today && i.status !== "complete",
        controls: data.controls.filter((c: any) => c.itemIds.includes(i.id)).map((c: any) => c.id),
        sharedEvidence: i.evidence.map((path: string) => ({ path, itemIds: manifest.items.filter((other: any) => other.evidence.includes(path)).map((other: any) => other.id) })) };
    }), statuses };
}
