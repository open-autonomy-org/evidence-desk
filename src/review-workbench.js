// Local review forms and disclosure preview. All authored content stays inert text.
const $ = id => document.getElementById(id);
const node = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };
let selectedRequest;
let exportPreview;
let returnPreview;
let act, request, notice, imported;
const values = form => Object.fromEntries(new FormData(form));
function choose(r) {
  selectedRequest = r.id;
  $("event-form").reset();
  $("event-request").textContent = `Request ${r.id} · Latest submission ${r.latestSubmissionId ?? "none"}`;
  $("event-form").elements.submissionId.value = r.latestSubmissionId ?? "";
  $("event-form").scrollIntoView();
}
export function renderReview(loaded) {
  exportPreview = returnPreview = null;
  $("export-confirm").disabled = $("return-confirm").disabled = true;
  $("exchange-preview").textContent = "Preview selected disclosure or returned changes before committing.";
  $("review-enable").hidden = !!loaded.review;
  $("review-enabled").hidden = !loaded.review;
  if (!loaded.review) return;
  $("review-rules").textContent = loaded.review.rules;
  const controls = $("request-controls"); controls.replaceChildren(node("legend", "Requested existing controls"));
  for (const c of loaded.readiness.controls) {
    const label = node("label", c.id); const box = document.createElement("input"); box.type = "checkbox"; box.value = c.id; label.prepend(box); controls.append(label);
  }
  const list = $("request-list"); list.replaceChildren();
  const selection = $("export-selection"); selection.replaceChildren(node("legend", "Select only requests to disclose (linked controls/items and full referenced files follow)"));
  for (const r of loaded.review.requests) {
    const label = node("label", r.id); const box = document.createElement("input"); box.type = "checkbox"; box.value = r.id; label.prepend(box); selection.append(label);
    const card = node("article", ""); card.className = "card";
    card.append(node("h3", `${r.id} — ${r.title}`), node("p", `${r.state} · Requester label: ${r.requester} · Contributor label: ${r.contributor} · Period ${r.period.start} to ${r.period.end} · Controls ${r.controlIds.join(", ")}`));
    card.append(node("p", r.currentBytesReviewed ? "Current bytes match the submission named by authored closure. Not an audit opinion or authenticated approval." : "No current-byte reviewed claim. Inspect history and file warnings below."));
    for (const e of r.events) {
      const detail = node("details", ""); detail.open = true;
      detail.append(node("summary", `${e.kind === "submit" ? "Contributor submission" : e.kind === "close" || e.kind === "changes" ? "Reviewer disposition: " + e.kind : "Discussion"} · ${e.author} · ${e.at}`), node("p", e.message), node("p", `Event ${e.id}${e.submissionId ? " · Submission " + e.submissionId : ""}`));
      for (const t of e.transfers ?? []) detail.append(node("p", `Deliberately imported at ${t.at} · Original paths: ${t.originalPaths.join(", ") || "no submission files"}; authored provenance, not verified identity.`));
      for (const f of e.files ?? []) detail.append(node("p", `${f.path} · Submitted SHA256 ${f.sha256} · Current SHA256 ${f.currentSha256 ?? "unavailable"} · Source ${f.source || "missing"} · Collected ${f.collectedAt || "missing"} · Period ${f.period ? f.period.start + " to " + f.period.end : "missing"} · ${[f.changed && "CHANGED BYTES", f.unavailable && "MISSING/UNREADABLE FILE", f.stale && "STALE PERIOD", f.futureCollection && "FUTURE COLLECTION", f.missing.length && "Missing: " + f.missing.join(", ")].filter(Boolean).join("; ") || "No listed metadata/change flags; not sufficiency."}`));
      card.append(detail);
    }
    for (const a of r.associations) card.append(node("p", `Shared recorded path ${a.path}: ${a.requests.map(other => other.id + " → " + other.controlIds.join(", ")).join("; ")}. Reuse does not establish sufficiency.`));
    const b = node("button", "Respond / review this request"); b.type = "button"; b.onclick = () => choose(r); card.append(b); list.append(card);
  }
  if (!loaded.review.requests.length) list.append(node("p", "No requests yet. Create one for an existing scoped control."));
  if (selectedRequest) {
    const r = loaded.review.requests.find(r => r.id === selectedRequest);
    if (r) { $("event-request").textContent = `Request ${r.id} · Latest submission ${r.latestSubmissionId ?? "none"}`; $("event-form").elements.submissionId.value = r.latestSubmissionId ?? ""; }
  }
}
export function setupReview(callbacks) {
  ({ act, request, notice, imported } = callbacks);
  $("review-enable").onclick = () => {
    if (confirm("Upgrade this explicitly selected readiness file to v2 in place? Keep your own backup first. Older readiness-v1 tools will refuse it. Unknown fields are preserved; an existing requests extension refuses upgrade.")) act("review-enable", undefined, { confirm: "upgrade selected readiness to v2" });
  };
  $("request-form").onsubmit = event => {
    event.preventDefault(); const data = values(event.target);
    data.controlIds = [...$("request-controls").querySelectorAll("input:checked")].map(box => box.value);
    data.period = { start: data.start, end: data.end }; delete data.start; delete data.end;
    act("request-create", undefined, data);
  };
  $("event-form").onsubmit = event => {
    event.preventDefault(); if (!selectedRequest) { notice("Choose Respond / review on a request first.", true); return; }
    const data = values(event.target);
    const input = { kind: data.kind, author: data.author, message: data.message };
    if (data.kind === "submit") input.files = [{ path: data.path, source: data.source, collectedAt: data.collectedAt, period: data.start || data.end ? { start: data.start, end: data.end } : null }];
    if (["changes", "close"].includes(data.kind)) input.submissionId = data.submissionId;
    act("request-event", selectedRequest, input);
  };
  const selectedIds = () => [...$("export-selection").querySelectorAll("input:checked")].map(box => box.value);
  const run = async action => { try { await action(); } catch (e) { notice(e.message, true); } };
  $("export-preview").onclick = () => run(async () => {
    exportPreview = null; $("export-confirm").disabled = true;
    const ids = selectedIds(); const preview = await request("/api/exchange", { operation: "preview-export", ids });
    exportPreview = { ids, token: preview.token };
    $("exchange-preview").textContent = JSON.stringify(preview, null, 2); $("export-confirm").disabled = false;
    notice("Review the full record/file inventory below and inspect original file contents. Nothing exported yet.");
  });
  $("export-confirm").onclick = () => run(async () => {
    if (!exportPreview || JSON.stringify(exportPreview.ids) !== JSON.stringify(selectedIds())) throw new Error("Selection changed; preview again.");
    const result = await request("/api/exchange", { operation: "export", ...exportPreview, destination: $("export-destination").value });
    $("export-confirm").disabled = true; exportPreview = null; notice(`Exported point-in-time package to ${result.destination}. Inspect offline before delivering; copies cannot be revoked.`);
  });
  $("return-preview").onclick = () => run(async () => {
    returnPreview = null; $("return-confirm").disabled = true;
    const folder = $("return-folder").value; const preview = await request("/api/exchange", { operation: "preview-return", folder });
    returnPreview = { folder, token: preview.token }; $("exchange-preview").textContent = JSON.stringify(preview, null, 2); $("return-confirm").disabled = false;
    notice("Inspect all returned authored events and evidence inventory. Nothing imported yet.");
  });
  $("return-confirm").onclick = () => run(async () => {
    if (!returnPreview || returnPreview.folder !== $("return-folder").value) throw new Error("Returned folder changed; preview again.");
    const result = await request("/api/exchange", { operation: "import-return", ...returnPreview });
    imported(result); notice("Imported new authored history and copied evidence without replacing local files. Reloaded current sources; no authenticated identity or audit approval implied.");
  });
}
