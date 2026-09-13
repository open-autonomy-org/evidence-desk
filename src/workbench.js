// Authored content goes only through textContent/value. No HTML interpolation, remote code or persistence.
const $ = id => document.getElementById(id);
const token = location.hash.slice(1);
let loaded;
let controlId;
let itemId;
let busy = false;
const engagement = $("engagement-form"), control = $("control-form"), item = $("item-form"), due = $("due-form");
const field = (form, name) => form.elements.namedItem(name);
const node = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };
function notice(text, error = false) { const el = $("message"); el.textContent = text; el.className = error ? "error" : ""; el.focus(); }
function button(text, action) { const b = node("button", text); b.type = "button"; b.onclick = action; return b; }
function options(container, values, checked = []) {
  const legend = container.querySelector("legend"); container.replaceChildren(legend);
  for (const value of values) {
    const label = node("label", ""); const box = document.createElement("input"); box.type = "checkbox"; box.value = value; box.checked = checked.includes(value);
    label.append(box, document.createTextNode(value)); container.append(label);
  }
  if (!values.length) container.append(node("p", "No items yet. Create an item below, then link it here."));
}
function checked(id) { return [...$(id).querySelectorAll("input:checked")].map(i => i.value); }
function resetControl(c) {
  if (!loaded) return;
  controlId = c?.id; control.reset();
  for (const name of ["id", "title", "framework", "version", "source", "applicability", "rationale"]) field(control, name).value = c?.[name] ?? (name === "applicability" ? "included" : "");
  field(control, "id").readOnly = !!c;
  $("control-heading").textContent = c ? `Edit control: ${c.id}` : "Create a control";
  options($("item-links"), loaded.report.items.map(i => i.id), c?.itemIds ?? []);
}
function resetItem(i) {
  itemId = i?.id; item.reset();
  for (const name of ["id", "owner", "status", "context"]) field(item, name).value = i?.[name] ?? (name === "status" ? "todo" : "");
  field(item, "evidence").value = i?.evidence.join("\n") ?? "";
  $("item-heading").textContent = i ? `Edit item: ${i.id}` : "Create an item";
  if (i) { field(due, "itemId").value = i.id; field(due, "dueDate").value = i.dueDate; }
}
function navigateItem(id) {
  resetItem(loaded.report.items.find(i => i.id === id));
  $("item").scrollIntoView(); field(item, "owner").focus();
}
function renderItems() {
  if (!loaded) return;
  const owner = $("filter-owner").value, state = $("filter-state").value, before = $("filter-due").value, follow = $("filter-follow").value;
  const items = loaded.report.items.filter(i => (!owner || i.owner === owner) && (!state || i.status === state) && (!before || (i.dueDate && i.dueDate <= before)) && (!follow || i[follow]));
  const list = $("item-list"); list.replaceChildren();
  if (!items.length) list.append(node("p", loaded.report.items.length ? "No work matches these filters. Clear filters to see all items." : "No readiness items yet. Create an item using existing context/evidence files below."));
  for (const i of items) {
    const card = node("article", ""); card.className = "card";
    card.append(node("h3", i.id), node("p", `Owner: ${i.owner || "Unassigned"} · Authored state: ${i.status} · Due: ${i.dueDate || "Not set"}`));
    card.append(node("p", [i.unassigned && "Unassigned", i.incomplete && "Incomplete", i.overdue && "Overdue", i.missingEvidence && "Missing evidence references", !i.controls.length && "No mapped controls"].filter(Boolean).join(" · ") || "No listed follow-up flags; not a sufficiency assessment."));
    card.append(node("p", `Context reference: ${i.context}`));
    for (const e of i.sharedEvidence) card.append(node("p", `Evidence reference: ${e.path} · Recorded by: ${e.itemIds.join(", ")}`));
    card.append(button("Edit item and references", () => navigateItem(i.id)));
    list.append(card);
  }
}
function render() {
  $("location").textContent = `Folder: ${loaded.folder} · Selected readiness file: ${loaded.selectedPath}`;
  const e = loaded.readiness.engagement;
  for (const name of ["systemBoundary", "type", "start", "end"]) field(engagement, name).value = e[name];
  options($("categories"), ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"], e.categories);
  const gaps = $("gaps"); gaps.replaceChildren();
  const messages = [...loaded.report.gaps];
  for (const c of loaded.report.controls) {
    if (c.applicability === "included" && !c.itemIds.length) messages.push(`${c.id}: included control has no linked work`);
    if (c.applicability === "excluded") messages.push(`${c.id}: excluded — ${c.rationale}`);
  }
  for (const i of loaded.report.items) if (i.unassigned || i.incomplete || i.missingEvidence || i.overdue) messages.push(`${i.id}: ${[i.unassigned && "assign owner", i.incomplete && "resolve incomplete work", i.missingEvidence && "record evidence references", i.overdue && "follow up overdue date"].filter(Boolean).join("; ")}`);
  for (const m of messages.length ? messages : ["No listed gaps. Authored completion does not demonstrate evidence sufficiency or an audit result."]) gaps.append(node("li", m));
  const controls = $("control-list"); controls.replaceChildren();
  if (!loaded.report.controls.length) controls.append(node("p", "No authored controls. Define your first control and cite its mapping source below."));
  for (const c of loaded.report.controls) {
    const card = node("article", ""); card.className = "card";
    card.append(node("h3", `${c.id} — ${c.title}`), node("p", `${c.framework} / ${c.version} · Source: ${c.source}`), node("p", `${c.applicability}: ${c.rationale}`));
    card.append(node("p", `Authored mapped work: ${c.itemIds.length ? c.itemIds.join(", ") : "None (mapping gap)"}. This is not demonstrated coverage.`));
    card.append(button("Edit control", () => { resetControl(c); field(control, "title").focus(); }));
    for (const id of c.itemIds) card.append(button(`Open item ${id}`, () => navigateItem(id)));
    controls.append(card);
  }
  const select = field(due, "itemId"); select.replaceChildren();
  for (const i of loaded.report.items) { const o = node("option", i.id); o.value = i.id; select.append(o); }
  field(due, "dueDate").value = loaded.report.items[0]?.dueDate ?? "";
  resetControl(); resetItem(); renderItems();
}
async function request(path, body) {
  const res = await fetch(path, { method: body ? "POST" : "GET", headers: { "X-Evidence-Session": token, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error); return data;
}
async function act(operation, id, input) {
  if (busy || !loaded) return;
  busy = true;
  try { loaded = await request("/api/save", { revision: loaded.revision, operation, id, input }); render(); notice(`Saved ${operation}. One authoritative file changed; both sources revalidated.`); }
  catch (error) { notice(`${error.message}\nYour form input is retained. Reload and revalidate explicitly before retrying an external conflict.`, true); }
  finally { busy = false; }
}
async function reload() {
  if (busy) return; busy = true;
  try { const next = await request("/api/load"); loaded = next; render(); notice("Both selected files revalidated. External edits are now visible."); }
  catch (error) { notice(`Revalidation refused: ${error.message}. No data saved. Correct the files externally, then explicitly reload.`, true); }
  finally { busy = false; }
}
engagement.onsubmit = event => { event.preventDefault(); const data = Object.fromEntries(new FormData(engagement)); data.categories = checked("categories"); act("engagement", undefined, data); };
control.onsubmit = event => { event.preventDefault(); const data = Object.fromEntries(new FormData(control)); data.itemIds = checked("item-links"); act(controlId ? "control-update" : "control-create", controlId, data); };
item.onsubmit = event => { event.preventDefault(); const data = Object.fromEntries(new FormData(item)); data.evidence = data.evidence.split("\n").filter(p => p !== ""); act(itemId ? "item-update" : "item-create", itemId, data); };
due.onsubmit = event => { event.preventDefault(); act("due-date", field(due, "itemId").value, { dueDate: field(due, "dueDate").value }); };
field(due, "itemId").onchange = () => { field(due, "dueDate").value = loaded?.report.items.find(i => i.id === field(due, "itemId").value)?.dueDate ?? ""; };
$("new-control").onclick = () => { resetControl(); field(control, "id").focus(); };
$("new-item").onclick = () => { resetItem(); field(item, "id").focus(); };
$("reload").onclick = reload;
// Section navigation must not replace this launch's capability fragment (including on page reload).
for (const link of document.querySelectorAll("nav a")) link.onclick = event => {
  event.preventDefault();
  const section = document.querySelector(link.getAttribute("href"));
  section.tabIndex = -1; section.focus(); section.scrollIntoView();
};
for (const name of ["filter-owner", "filter-state", "filter-due", "filter-follow"]) {
  $(name).oninput = renderItems;
  $(name).onchange = renderItems;
}
reload();
