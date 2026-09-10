// Standalone Markdown presentation of validated summary facts, never workspace contents.
import type { summarizeWorkspace } from "./summary";

type Report = ReturnType<typeof summarizeWorkspace>;

// ASCII-only JSON string inside a code span: no authored delimiter, HTML or invisible Unicode.
// Process UTF-16 code units (not code points) so even lone surrogates round-trip exactly.
function literal(value: string): string {
  const quoted = JSON.stringify(value).replace(/[^a-zA-Z0-9 /._\-"\\]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `\`${quoted}\``;
}

function countsLines(counts: NonNullable<Report["counts"]>): string[] {
  return [
    `- Total: ${counts.total}`,
    ...Object.entries(counts.statuses).map(([status, count]) => `- ${status}: ${count}`),
    `- Incomplete: ${counts.incomplete}`,
    `- Unassigned owner: ${counts.unassignedOwner}`,
    `- No evidence references: ${counts.noEvidenceReferences}`,
  ];
}

export function renderMarkdown(report: Report): string {
  if (!report.ok || !report.counts) throw new Error("Markdown requires a fully validated summary.");
  const lines = ["# Evidence Desk readiness summary", "", "Derived report — read-only follow-up facts, not an import format or live snapshot.", "",
    "## Applied selectors", ""];
  if ("selection" in report && report.selection) {
    const selection = report.selection;
    if (selection.owner !== undefined) lines.push(`- Owner (exact): ${literal(selection.owner)}`);
    if (selection.status !== undefined) lines.push(`- Status: ${literal(selection.status)}`);
    if (selection.needsFollowUp) lines.push("- Needs follow-up: true (incomplete or any warning)");
  } else lines.push("None; all items included.");
  lines.push("", "## Whole-workspace counts", "",
    ...countsLines("workspaceCounts" in report && report.workspaceCounts ? report.workspaceCounts : report.counts));
  if ("selection" in report) lines.push("", "## Selected counts", "", ...countsLines(report.counts));
  lines.push("", "## Items (manifest order)", "");
  if (!report.items.length) lines.push("No items in this report.");
  for (const [index, item] of report.items.entries()) {
    lines.push(`### Item ${index + 1}`, "", `- ID: ${literal(item.id)}`, `- Owner: ${literal(item.owner)}`,
      `- Status: ${item.status}`, `- Context path: ${literal(item.context)}`, `- Evidence references: ${item.evidence.length}`);
    for (const path of item.evidence) lines.push(`- Evidence path: ${literal(path)}`);
    if (!item.warnings.length) lines.push("- Warnings: none");
    for (const warning of item.warnings) lines.push(`- Warning: ${warning}`);
    lines.push("");
  }
  lines.push("## Meanings and limitations", "",
    "Counts overlap: incomplete means status other than complete; unassigned owner means empty or whitespace-only; no evidence references means an empty reference array, not missing files. Status counts partition total.", "",
    "Warnings mean an unassigned owner, empty/whitespace-only Markdown context, or no evidence references, in that order. Complete items can still have warnings. Complete is the owner's self-reported status.", "",
    "Strings are ASCII-only JSON literals in code spans; Unicode and punctuation use JSON escapes. Empty and whitespace strings remain distinct. Paths are workspace-relative; no Markdown bodies or evidence contents are included.", "",
    "Derived from format 1 validation of the whole workspace before selection. No readiness score, evidence-sufficiency assessment, SOC2 coverage claim or audit judgment. Keep the folder quiescent: concurrent edits and symlink replacement are not isolated. Reads may change access times. Verified platform: Linux aarch64/local ext4; other platforms and network/cloud filesystems are unverified.");
  return lines.join("\n");
}
