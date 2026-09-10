// Derived read-only report; validation remains the version 1 workspace contract.
import { inspectWorkspace } from "./workspace";

export function failedSummary(errors: string[]) {
  return { reportSchemaVersion: 1, ok: false, counts: null, items: [], errors };
}

export function summarizeWorkspace(destination: string) {
  const inspection = inspectWorkspace(destination);
  // Never expose partial totals or records from a workspace that failed validation.
  if (inspection.errors.length) return failedSummary(inspection.errors);
  const counts = {
    total: inspection.items.length,
    statuses: { todo: 0, "in-progress": 0, blocked: 0, complete: 0 },
    incomplete: 0, unassignedOwner: 0, noEvidenceReferences: 0,
  };
  const items = inspection.items.map(item => {
    const warnings: string[] = [];
    if (!item.owner.trim()) { counts.unassignedOwner++; warnings.push("Owner is unassigned; set owner in workspace.json."); }
    if (!item.markdown.trim()) warnings.push("Markdown context is empty; add context when available.");
    if (!item.evidence.length) { counts.noEvidenceReferences++; warnings.push("No evidence references; add paths when available."); }
    counts.statuses[item.status as keyof typeof counts.statuses]++;
    if (item.status !== "complete") counts.incomplete++;
    return { id: item.id, owner: item.owner, status: item.status, context: item.context,
      evidence: item.evidence, warnings };
  });
  return { reportSchemaVersion: 1, ok: true, counts, items, errors: [] };
}

export function printSummary(report: ReturnType<typeof summarizeWorkspace>, json: boolean): void {
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (!report.ok) {
    for (const error of report.errors) console.error(`Error: ${error}`);
    console.error("Summary refused; no whole-workspace totals available.");
  } else if (report.counts) {
    const counts = report.counts;
    console.log(`Total: ${counts.total}`);
    for (const [status, count] of Object.entries(counts.statuses)) console.log(`${status}: ${count}`);
    console.log(`Incomplete: ${counts.incomplete}\nUnassigned owner: ${counts.unassignedOwner}\nNo evidence references: ${counts.noEvidenceReferences}`);
    for (const item of report.items) {
      // Quote owner-authored strings so newlines/control characters cannot forge report lines.
      console.log(`\nItem: ${JSON.stringify(item.id)}`);
      console.log(`Owner: ${JSON.stringify(item.owner)}\nStatus: ${item.status}`);
      console.log(`Context: ${JSON.stringify(item.context)}\nEvidence: ${JSON.stringify(item.evidence)}`);
      for (const warning of item.warnings) console.log(`Warning: ${warning}`);
    }
  }
  if (!report.ok) process.exitCode = 1;
}
