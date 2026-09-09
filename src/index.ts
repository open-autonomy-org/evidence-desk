// Local CLI for creating and inspecting portable Evidence Desk workspaces.
import { resolve } from "node:path";
import { createWorkspace, inspectWorkspace } from "./workspace";

const [group, operation, destination, ...extra] = process.argv.slice(2);
const usage = "Usage: bun run src/index.ts workspace <create|open|inspect|validate> <folder>";

try {
  if (group !== "workspace" || !destination || extra.length ||
      !["create", "open", "inspect", "validate"].includes(operation)) {
    throw new Error(usage);
  }
  if (operation === "create") {
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
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
