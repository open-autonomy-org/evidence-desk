// Loopback-only capability session. No evidence serving, URL-to-filesystem mapping or external dependencies.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadReadiness, saveReadiness, type Selected } from "./readiness-store";
import { object, readinessReport } from "./readiness-model";
import { parseWriteJson } from "./write-json";
import { reviewReport } from "./review-model";
import { previewExport, exportPackage, previewReturn, importReturn } from "./review-exchange";

export function serveWorkbench(selected: Selected) {
  const token = randomBytes(32).toString("hex");
  const assets: Record<string, { type: string; bytes: Buffer }> = {
    "/": { type: "text/html; charset=utf-8", bytes: readFileSync(new URL("./workbench.html", import.meta.url)) },
    "/workbench.js": { type: "text/javascript; charset=utf-8", bytes: readFileSync(new URL("./workbench.js", import.meta.url)) },
    "/review-workbench.js": { type: "text/javascript; charset=utf-8", bytes: readFileSync(new URL("./review-workbench.js", import.meta.url)) },
    "/workbench.css": { type: "text/css; charset=utf-8", bytes: readFileSync(new URL("./workbench.css", import.meta.url)) },
  };
  let origin = "";
  const view = (loaded: ReturnType<typeof loadReadiness>) => ({ revision: loaded.revision, readiness: loaded.data,
    report: readinessReport(loaded.manifest, loaded.data), review: reviewReport(selected.root, loaded.data), folder: selected.root, selectedPath: selected.relative });
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const reply = (code: number, value: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== origin.slice("http://".length) ||
        (req.headers.origin !== undefined && req.headers.origin !== origin) ||
        req.headers["sec-fetch-site"] === "cross-site") { reply(403, { error: "Unexpected Host/Origin or cross-site request." }); return; }
    const path = req.url ?? "";
    if (req.method === "GET" && Object.hasOwn(assets, path)) {
      const a = assets[path]; res.writeHead(200, { "Content-Type": a.type }); res.end(a.bytes); return;
    }
    if (!["/api/load", "/api/save", "/api/exchange"].includes(path)) { reply(404, { error: "No such route. Workspace/evidence bytes are never served." }); return; }
    if (req.headers["x-evidence-session"] !== token || (req.method === "POST" && req.headers.origin !== origin)) {
      reply(403, { error: "Session authorization required; use this launch's URL on the same origin." }); return;
    }
    try {
      if (path === "/api/load" && req.method === "GET") { reply(200, view(loadReadiness(selected))); return; }
      if (req.method !== "POST") { reply(405, { error: "Unsupported method." }); return; }
      if (req.headers["content-type"] !== "application/json") { reply(415, { error: "Use application/json." }); return; }
      const chunks: Buffer[] = []; let length = 0;
      for await (const part of req) {
        length += part.length;
        if (length > 1024 * 1024) { reply(413, { error: "Edit exceeds 1 MiB." }); return; }
        chunks.push(Buffer.from(part));
      }
      const input = parseWriteJson(Buffer.concat(chunks).toString("utf8"), "Request");
      if (path === "/api/exchange") {
        if (!object(input)) throw new Error("Invalid exchange envelope.");
        if (input.operation === "preview-export") reply(200, previewExport(selected, input.ids));
        else if (input.operation === "export") reply(200, exportPackage(selected, input.ids, input.token, input.destination));
        else if (input.operation === "preview-return") reply(200, previewReturn(selected, input.folder));
        else if (input.operation === "import-return") reply(200, view(importReturn(selected, input.folder, input.token)));
        else throw new Error("Unknown exchange operation.");
        return;
      }
      if (!object(input) || typeof input.revision !== "string" || typeof input.operation !== "string" || (input.id !== undefined && typeof input.id !== "string")) throw new Error("Invalid edit envelope.");
      reply(200, view(saveReadiness(selected, input.revision, input.operation, input.id, input.input)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply(message.startsWith("Conflict:") ? 409 : 422, { error: message });
    }
  });
  server.requestTimeout = 15000;
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No loopback listener address.");
    origin = `http://127.0.0.1:${address.port}`;
    console.log(`Open local workbench: ${origin}/#${token}`);
    console.log(`Folder: ${selected.root}\nExplicit readiness selection: ${selected.relative}\nStop with Ctrl-C. Loopback is not multi-user authentication/RBAC. No evidence bytes are served.`);
  });
}
