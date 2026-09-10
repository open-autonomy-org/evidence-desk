// Local CLI for creating and inspecting portable Evidence Desk workspaces.
import { resolve } from "node:path";
import { createWorkspace, inspectWorkspace } from "./workspace";
import { writeItem } from "./item-write";
import { failedSummary, parseSummaryOptions, printSummary, summarizeWorkspace, type Selection } from "./summary";

const [group, operation, destination, ...extra] = process.argv.slice(2);
const usage = "Usage: bun run src/index.ts workspace <create|open|inspect|validate> <folder> OR workspace summary <folder> [--owner <exact-string>] [--status <todo|in-progress|blocked|complete>] [--needs-follow-up] [--json] OR workspace item-create <folder> --stdin OR workspace item-update <folder> <existing-id> --stdin";
const jsonSummary = group === "workspace" && operation === "summary" && process.argv.slice(4).includes("--json");
let selection: Selection | undefined;

try {
  const creatingItem = operation === "item-create" && extra.length === 1 && extra[0] === "--stdin";
  const updatingItem = operation === "item-update" && extra.length === 2 && extra[1] === "--stdin";
  const summary = operation === "summary";
  if (group !== "workspace" || !destination ||
      !(creatingItem || updatingItem || summary || (!extra.length && ["create", "open", "inspect", "validate"].includes(operation)))) {
    throw new Error(usage);
  }
  if (operation === "summary") {
    if (destination.startsWith("--")) throw new Error(`Missing folder; ${usage}`);
    const options = parseSummaryOptions(extra);
    if (Object.keys(options.selection).length) selection = options.selection;
    printSummary(summarizeWorkspace(destination, selection), options.json);
  } else if (operation === "item-create" || operation === "item-update") {
    writeItem(destination, operation, updatingItem ? extra[0] : undefined);
  } else if (operation === "create") {
    createWorkspace(destination);
    console.log(`Created workspace: ${resolve(destination)}`);
  } else {
    const result = inspectWorkspace(destination);
    if (operation !== "validate") {
      console.log(`Workspace: ${resolve(destination)}`);
      for (const item of result.items) {
        console.log(`\n${item.id} [${item.status}] Owner: ${item.owner || "(unassigned)"}`);
        console.log(`Context: ${item.context}\n${item.markdown}`);
        console.log(`Evidence: ${item.evidence.length ? item.evidence.join(", ") : "(none)"}`);
      }
      console.log(`\n${result.items.length} item(s); ${result.items.filter(item => item.status !== "complete").length} incomplete.`);
    }
    for (const warning of result.warnings) console.log(`Warning: ${warning}`);
    for (const error of result.errors) console.error(`Error: ${error}`);
    if (result.errors.length) {
      console.error(`Validation failed: ${result.errors.length} error(s).`);
      process.exitCode = 1;
    } else {
      console.log(`Valid workspace (format 1): ${result.items.length} item(s).`);
    }
  }
} catch (error) {
  if (jsonSummary) {
    printSummary(failedSummary([error instanceof Error ? error.message : String(error)], selection), true);
  } else {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
}
