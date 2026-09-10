// Derived read-only report; validation remains the version 1 workspace contract.
import { inspectWorkspace, statuses } from "./workspace";

export type Selection = { owner?: string; status?: string; needsFollowUp?: true };
export function parseSummaryOptions(args: string[]) {
  const selection: Selection = {};
  const seen = new Set<string>();
  let json = false;
  let markdown = false;
  for (let i = 0; i < args.length; i++) {
    const inlineOwner = args[i].startsWith("--owner=");
    const flag = inlineOwner ? "--owner" : args[i];
    if (!["--owner", "--status", "--needs-follow-up", "--json", "--markdown"].includes(flag)) {
      throw new Error(`Unknown summary option ${JSON.stringify(flag)}; use --owner <exact-string>, --status <status>, --needs-follow-up, --json or --markdown.`);
    }
    if (seen.has(flag)) throw new Error(`Repeated ${flag}; supply each summary option once.`);
    seen.add(flag);
    if (flag === "--json") json = true;
    else if (flag === "--markdown") markdown = true;
    else if (flag === "--needs-follow-up") selection.needsFollowUp = true;
    else {
      const value = inlineOwner ? args[i].slice("--owner=".length) : args[++i];
      if (value === undefined || (!inlineOwner && value.startsWith("--"))) throw new Error(`Missing value for ${flag}; supply one value (use --owner=<exact-string> for an owner starting with --).`);
      if (flag === "--owner") selection.owner = value;
      else {
        if (!statuses.includes(value)) throw new Error(`Unsupported status ${JSON.stringify(value)}; use one of: ${statuses.join(", ")}.`);
        selection.status = value;
      }
    }
  }
  if (json && markdown) throw new Error("Cannot combine --json and --markdown; choose one output format.");
  return { selection: {
    ...(selection.owner === undefined ? {} : { owner: selection.owner }),
    ...(selection.status === undefined ? {} : { status: selection.status }),
    ...(selection.needsFollowUp ? { needsFollowUp: true as const } : {}),
  }, json, markdown };
}

export function failedSummary(errors: string[], selection?: Selection) {
  if (selection) return { reportSchemaVersion: 2, ok: false, selection,
    workspaceCounts: null, counts: null, items: [], errors };
  return { reportSchemaVersion: 1, ok: false, counts: null, items: [], errors };
}

export function summarizeWorkspace(destination: string, selection?: Selection) {
  const inspection = inspectWorkspace(destination);
  // Never expose partial totals or records from a workspace that failed validation.
  if (inspection.errors.length) return failedSummary(inspection.errors, selection);
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
  if (selection) {
    const selected = items.filter(item =>
      (selection.owner === undefined || item.owner === selection.owner) &&
      (selection.status === undefined || item.status === selection.status) &&
      (!selection.needsFollowUp || item.status !== "complete" || item.warnings.length > 0));
    const selectedCounts = { total: selected.length,
      statuses: { todo: 0, "in-progress": 0, blocked: 0, complete: 0 },
      incomplete: 0, unassignedOwner: 0, noEvidenceReferences: 0 };
    for (const item of selected) {
      selectedCounts.statuses[item.status as keyof typeof selectedCounts.statuses]++;
      if (item.status !== "complete") selectedCounts.incomplete++;
      if (!item.owner.trim()) selectedCounts.unassignedOwner++;
      if (!item.evidence.length) selectedCounts.noEvidenceReferences++;
    }
    return { reportSchemaVersion: 2, ok: true, selection, workspaceCounts: counts,
      counts: selectedCounts, items: selected, errors: [] };
  }
  return { reportSchemaVersion: 1, ok: true, counts, items, errors: [] };
}

export function printSummary(report: ReturnType<typeof summarizeWorkspace>, json: boolean): void {
  if (json) console.log(JSON.stringify(report, null, 2));
  else if (!report.ok) {
    for (const error of report.errors) console.error(`Error: ${error}`);
    console.error("Summary refused; no whole-workspace totals available.");
  } else if (report.counts) {
    if ("selection" in report) {
      console.log(`Selection: ${JSON.stringify(report.selection)}`);
      console.log("Whole workspace counts:");
      if (report.workspaceCounts) printCounts(report.workspaceCounts);
      console.log("Selected counts:");
    }
    printCounts(report.counts);
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

function printCounts(counts: NonNullable<ReturnType<typeof summarizeWorkspace>["counts"]>): void {
  console.log(`Total: ${counts.total}`);
  for (const [status, count] of Object.entries(counts.statuses)) console.log(`${status}: ${count}`);
  console.log(`Incomplete: ${counts.incomplete}\nUnassigned owner: ${counts.unassignedOwner}\nNo evidence references: ${counts.noEvidenceReferences}`);
}
