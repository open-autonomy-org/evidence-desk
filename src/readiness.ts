// Explicit readiness CLI and graphical launcher; never entered by ordinary format-1 commands.
import { readFileSync } from "node:fs";
import { createWorkspace } from "./workspace";
import { createReadiness, loadReadiness, saveReadiness, selectReadiness } from "./readiness-store";
import { readinessReport } from "./readiness-model";
import { parseWriteJson } from "./write-json";
import { serveWorkbench } from "./workbench-server";
import { reviewReport } from "./review-model";

try {
  const [operation, folder, mode, path, ...args] = process.argv.slice(2);
  const edits = ["item-create", "item-update", "engagement", "control-create", "control-update", "due-date", "review-enable", "request-create", "request-event"];
  if (!folder || !path || !["--readiness-create", "--readiness-open"].includes(mode) ||
      !["init", "validate", "summary", "serve", ...edits].includes(operation)) {
    throw new Error("Usage: bun run src/readiness.ts <init|validate|summary|serve|engagement|control-create|control-update|due-date|item-create|item-update|review-enable|request-create|request-event> <folder> <--readiness-create|--readiness-open> <exact-relative-path> [existing-id] [--stdin] [--new-workspace (serve only)]");
  }
  const needsId = ["item-update", "control-update", "due-date", "request-event"].includes(operation);
  const editing = edits.includes(operation);
  if (editing ? (args.length !== (needsId ? 2 : 1) || args.at(-1) !== "--stdin") :
      (args.length > 0 && !(operation === "serve" && args.length === 1 && args[0] === "--new-workspace"))) throw new Error("Unexpected arguments; writes require --stdin and update/due-date requires an existing ID.");
  if (mode === "--readiness-create" && !["init", "serve"].includes(operation)) throw new Error("Create readiness is a separate action: use init or serve. Other commands require deliberate --readiness-open.");
  if (operation === "init" && mode !== "--readiness-create") throw new Error("init requires --readiness-create; opening is not ownership/provenance verification.");
  if (args[0] === "--new-workspace") {
    if (mode !== "--readiness-create") throw new Error("A new workspace requires create-new readiness selection, not open-existing.");
    createWorkspace(folder);
  }
  const selected = selectReadiness(folder, path);
  if (mode === "--readiness-create") createReadiness(selected);
  const loaded = loadReadiness(selected);
  if (operation === "serve") serveWorkbench(selected);
  else if (editing) {
    console.error("Ready: both selected sources validated; send JSON on stdin, then EOF. Neither file committed yet.");
    const input = parseWriteJson(readFileSync(0, "utf8"), "stdin");
    saveReadiness(selected, loaded.revision, operation, needsId ? args[0] : undefined, input);
    console.log(`Committed ${operation}; one authoritative file changed.`);
  } else if (operation === "summary") console.log(JSON.stringify({ ...readinessReport(loaded.manifest, loaded.data), ...(loaded.data.readinessVersion === 2 ? { review: reviewReport(selected.root, loaded.data) } : {}) }, null, 2));
  else console.log(`Valid format-1 workspace and explicitly selected readiness v${loaded.data.readinessVersion}: ${selected.relative}. Selection is not proof of provenance or prior ownership.`);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
