// The Evidence Desk page. It renders the workspace state from /api/state and sends each change to the API with the
// version of the file it was shown; when a file changed on disk meanwhile, the change is refused and the page reloads.
// Everything authored in the workspace is rendered as text, never as HTML.
let S = null;
let tab = location.hash.slice(1).split('/')[0] || 'overview';
let detail = decodeURIComponent(location.hash.split('/')[1] || '');

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    // The rendered value is also the field's default, so an unsaved edit is the difference between the two.
    else if (k === 'value') { if ('defaultValue' in el) el.defaultValue = String(v); el.value = v; }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const pill = (text, kind = '') => h('span', { class: `pill ${kind}` }, text);
const notice = (text, ok) => { const n = document.getElementById('notice'); n.textContent = text; n.className = ok ? 'ok' : 'bad'; n.hidden = false; clearTimeout(notice.t); notice.t = setTimeout(() => { n.hidden = true; }, ok ? 3500 : 9000); };
const people = () => (S.registers.people?.rows ?? []).map((r) => r.id);
const personName = (id) => (S.registers.people?.rows ?? []).find((r) => r.id === id)?.name || id;
const go = (t, d = '') => { location.hash = d ? `${t}/${encodeURIComponent(d)}` : t; };

async function load() {
  const r = await fetch('/api/state');
  S = await r.json();
  render();
}
// A framework decision, told as the workspace recorded it: what changed, what it replaced, or that nothing did.
async function decided(payload) { const r = await post('/api/framework/decide', payload, null); if (r) notice(r.result, true); return r; }
async function post(path, payload, okText) {
  const view = document.getElementById('view');
  const holder = (trigger instanceof Element ? trigger : document.activeElement)?.closest?.('form, .card');
  const box = holder && view.contains(holder) ? [...view.querySelectorAll('form, .card')].indexOf(holder) : -1;
  trigger = null;
  let r, j;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    j = await r.json();
  } catch {
    notice('Not saved: Evidence Desk is not reachable. Start it again with evidence-desk serve, then retry; your edits are still on this page.', false);
    return null;
  }
  if (!r.ok) {
    notice(j.conflict ? `Not saved: ${j.error}. The page now shows what is on disk.` : `Not saved: ${j.error}`, false);
    if (j.conflict) await load();
    return null;
  }
  S = j.state;
  if (okText) notice(okText, true);
  savedBox = box;
  render();
  return j;
}

window.addEventListener('hashchange', () => { tab = location.hash.slice(1).split('/')[0] || 'overview'; detail = decodeURIComponent(location.hash.split('/')[1] || ''); render(); window.scrollTo(0, 0); });
document.getElementById('tabs').addEventListener('click', (e) => { const t = e.target.closest('button')?.dataset.tab; if (t) go(t); });

// Unsaved edits survive a re-render of the same page: every save re-renders the whole view from the workspace, and a
// value typed into another field would otherwise be lost. A field is carried over only where the value it started from
// is unchanged on disk, so what was saved (or changed elsewhere) always wins over a stale edit.
function fieldsOf(view) {
  const seen = new Map();
  return [...view.querySelectorAll('input, textarea, select')].filter((el) => el.type !== 'file').map((el) => {
    const holder = el.closest('form, .card');
    const box = holder ? [...view.querySelectorAll('form, .card')].indexOf(holder) : -1;
    const base = `${box}|${el.name || el.id || el.tagName}`;
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    return { key: `${base}|${n}`, el };
  });
}
const initial = (el) => el.type === 'checkbox' || el.type === 'radio' ? el.defaultChecked : el.tagName === 'SELECT' ? [...el.options].map((o) => o.defaultSelected).join() : el.defaultValue;
const current = (el) => el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.tagName === 'SELECT' ? [...el.options].map((o) => o.selected).join() : el.value;
const apply = (el, v) => { if (el.type === 'checkbox' || el.type === 'radio') el.checked = v; else if (el.tagName === 'SELECT') v.split(',').forEach((x, i) => { if (el.options[i]) el.options[i].selected = x === 'true'; }); else el.value = v; };
let rendered = '';
// The form (or card) whose save caused the next render: its fields show what was saved, never the text just sent.
let savedBox = null;
// What started a save: the element clicked or the form submitted, captured before any handler runs. Browsers differ on
// whether a clicked button takes focus, so document.activeElement cannot say which form saved.
let trigger = null;
document.addEventListener('click', (e) => { trigger = e.target; }, true);
document.addEventListener('submit', (e) => { trigger = e.target; }, true);

function render() {
  if (!S) return;
  document.getElementById('org').textContent = S.organization;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  const view = document.getElementById('view');
  const page = `${tab}/${detail}`;
  const edits = page === rendered ? fieldsOf(view).filter(({ key, el }) => current(el) !== initial(el) && !key.startsWith(`${savedBox}|`)).map(({ key, el }) => ({ key, from: initial(el), value: current(el) })) : [];
  savedBox = null;
  rendered = page;
  view.replaceChildren(({ overview, sign: signView, scope, controls, policies, registers, evidence, people: peopleView, obligations, access, incidents, oa: openAutonomy, checks: checksView, audit: auditView, trust: trustView, frameworks: frameworksView })[tab]?.() ?? overview());
  if (edits.length) { const now = new Map(fieldsOf(view).map((f) => [f.key, f.el])); for (const e of edits) { const el = now.get(e.key); if (el && initial(el) === e.from) apply(el, e.value); } }
}

function statusPill(c) {
  if (!c.applicable) return pill('excluded');
  return pill(c.status.replace('-', ' '), c.status === 'implemented' ? 'ok' : c.status === 'in-progress' ? 'warn' : '');
}

// Frameworks (docs/decisions/0002-frameworks-are-targets.md): the page that owns choosing what the program aims at and,
// for each framework, how far it is, the steps still open, and what makes it done: an auditor's or certifying body's
// document recorded here, or the organization's own self-attestation, positioned and signed here.
const OUTCOME = { 'audit report': 'an audit report', certificate: 'a certificate', 'self-attestation': 'a self-attestation you sign' };
const docsFor = (f) => S.certifications.filter((c) => c.for === f.id);
const documentsError = () => S.documentsError ? h('p', { style: 'color:var(--bad)' }, `The documents held and what they claim cannot be worked out, so nothing is claimed: ${S.documentsError}`) : null;
// The document that stands for a framework today, as the badge says it; null when there is none.
function docPill(f) {
  const c = docsFor(f).find((x) => x.current);
  return c ? pill(c.kind === 'self-attestation' ? `self-attested ${c.issued_on}` : c.kind === 'certificate' ? `certified until ${c.valid_until}` : `audited ${c.issued_on}`, c.kind === 'self-attestation' ? '' : 'ok') : null;
}
function readinessOf(id) {
  if (id === 'soc2') { const g = S.gaps.summary; return { ready: g.controls_ready, of: g.controls_applicable, unit: 'controls' }; }
  const st = S.frameworkStates?.[id];
  return st ? { ready: st.summary.ready, of: st.summary.requirements - st.summary.excluded, unit: 'requirements' } : null;
}
function frameworksView() {
  if (detail) return frameworkPage(S.frameworkCatalog.find((f) => f.id === detail));
  return h('div', {},
    h('h1', {}, 'Frameworks'),
    documentsError(),
    h('p', { class: 'lead' }, 'Choose what the program aims at. SOC 2 is always a target; every other framework reuses the same controls, policies and evidence, so targeting one adds only what it needs beyond them. A framework becomes done only with its document: an auditor\'s report, a certifying body\'s certificate, or a self-attestation you sign here.'),
    h('table', {}, h('tr', {}, h('th', {}, 'Framework'), h('th', {}, 'Becomes'), h('th', {}, 'Readiness'), h('th', {}, 'Document'), h('th', {}, '')),
      S.frameworkCatalog.map((f) => {
        const targeted = S.frameworks.includes(f.id);
        const r = targeted ? readinessOf(f.id) : null;
        return h('tr', {},
          h('td', {}, targeted ? h('a', { href: `#frameworks/${f.id}` }, f.title) : f.title),
          h('td', {}, `${OUTCOME[f.outcome]}${f.outcome === 'self-attestation' ? '' : ` from ${f.issuer}`}`),
          h('td', {}, r ? `${r.ready} / ${r.of} ${r.unit} ready` : h('span', { class: 'muted' }, 'not a target')),
          h('td', {}, docPill(f) ?? h('span', { class: 'muted' }, 'none yet')),
          h('td', {}, f.id === 'soc2' ? h('span', { class: 'muted' }, 'always a target')
            : targeted ? h('button', { class: 'secondary', onclick: () => post('/api/frameworks/drop', { id: f.id }, `${f.title} is no longer a target; its evidence stays.`) }, 'Drop')
            : h('button', { class: 'primary', onclick: () => post('/api/frameworks/target', { id: f.id }, `${f.title} is now a target.`) }, 'Target')));
      })));
}
function frameworkPage(f) {
  if (!f) return h('p', {}, 'That framework is not one Evidence Desk maps.');
  const back = h('a', { class: 'back', href: '#frameworks' }, '← Frameworks');
  if (!S.frameworks.includes(f.id)) return h('div', {}, back, h('h1', {}, f.title), h('p', {}, `${f.title} is not a target.`), h('button', { class: 'primary', onclick: () => post('/api/frameworks/target', { id: f.id }, `${f.title} is now a target.`) }, 'Target it'));
  const docs = docsFor(f);
  const heldCard = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Documents held'),
    docs.length ? h('table', {}, h('tr', {}, h('th', {}, 'Document'), h('th', {}, 'Issued'), h('th', {}, 'State')),
      docs.map((c) => h('tr', {}, h('td', {}, h('a', { href: `/files/${c.file}` }, `${c.kind}: ${c.framework}`), ` by ${c.issuer}`), h('td', {}, c.issued_on), h('td', {}, !c.intact ? pill('altered since recorded', 'bad') : !c.fits ? pill('not a document this framework can have', 'bad') : c.current ? pill('current', 'ok') : pill('lapsed or not yet valid')))))
      : h('p', { class: 'muted' }, 'None yet. Until one is held, the trust center and the badges show readiness.'));
  if (f.id === 'soc2') return h('div', {}, back, h('h1', {}, 'SOC 2'), h('p', { class: 'lead' }, 'SOC 2\'s criteria and their state are on the Overview; the audit engagement and its package are under Audit. It becomes an audit report from an independent CPA firm.'),
    h('p', {}, h('a', { href: '#overview' }, 'Readiness by criterion →'), ' · ', h('a', { href: '#audit' }, 'Audit →')), heldCard, recordCard(f));
  const st = S.frameworkStates[f.id], sm = st.summary;
  const selfAttest = f.outcome === 'self-attestation';
  const open = st.requirements.filter((r) => !r.optional && r.status !== 'ready' && r.status !== 'excluded');
  const unpositioned = st.requirements.filter((r) => !r.optional && !r.position);
  const groups = {};
  for (const r of st.requirements) (groups[r.group] ??= []).push(r);
  const kind = { ready: 'ok', gaps: 'warn', excluded: '', unaddressed: 'bad' };
  const positionForm = (r) => {
    const form = h('form', { class: 'row', style: 'margin-top:6px', onsubmit: (e) => { e.preventDefault();
      const pos = form.position.value;
      decided(pos ? { id: f.id, requirement: r.id, position: pos, statement: form.statement.value } : { id: f.id, requirement: r.id, clear: true }); } },
      h('select', { name: 'position' }, h('option', { value: '' }, 'No position'), ['partial', 'not met'].map((v) => h('option', { value: v, selected: r.position === v && !!r.statement }, v === 'partial' ? 'Partly met' : 'Not met'))),
      h('input', { type: 'text', name: 'statement', value: r.statement ?? '', placeholder: 'What is in place and what is not', style: 'flex:1' }),
      h('button', { class: 'secondary', type: 'submit' }, 'Save'));
    return form;
  };
  const signBy = personSelect('by', '', 'Who signs');
  // What stands between a requirement and ready, as acts: each mapped control's own gaps, or that no control addresses it.
  const byControl = new Map(S.gaps.controls.map((c) => [c.id, c]));
  const stepsFor = (r) => r.status === 'unaddressed' ? h('p', { class: 'muted' }, 'No control addresses it: map a control of yours to it, exclude it with a reason, or state your position.')
    : h('div', {}, r.controls.filter((id) => byControl.get(id)?.gaps.length).map((id) => h('div', {}, h('a', { href: `#controls/${id}` }, `${id} ${byControl.get(id).title}`), h('ul', { class: 'gaps' }, byControl.get(id).gaps.map((x) => h('li', {}, x))))));
  const excludeForm = (r) => {
    const form = h('form', { class: 'row', style: 'margin-top:6px', onsubmit: (e) => { e.preventDefault(); decided({ id: f.id, requirement: r.id, exclude: form.reason.value }); } },
      h('input', { type: 'text', name: 'reason', placeholder: 'Or exclude it: why it does not apply', style: 'flex:1' }), h('button', { class: 'secondary', type: 'submit' }, 'Exclude'));
    return form;
  };
  // Every requirement still without a position, stated not met in one act: it claims less, never more, and the signed
  // document lists each one.
  const bulk = h('form', { class: 'row', onsubmit: (e) => { e.preventDefault();
    if (!bulk.statement.value.trim()) return notice('Say what is in place for them, or that nothing is yet.', false);
    (async () => { const res = await post('/api/framework/not-met', { id: f.id, requirements: unpositioned.map((r) => r.id), statement: bulk.statement.value }, null);
      if (res) notice(`Stated not met on ${res.result.stated.length} requirement${res.result.stated.length === 1 ? '' : 's'}${res.result.stated.length < unpositioned.length ? '; the others had been given a position or excluded meanwhile, and were left as they are' : ''}.`, true); })(); } },
    h('input', { type: 'text', name: 'statement', placeholder: 'Statement for all of them, for example "Not yet in place."', style: 'flex:1' }),
    h('button', { class: 'secondary', type: 'submit' }, `State not met on the ${unpositioned.length} without a position`));
  return h('div', {}, back,
    h('h1', {}, f.title),
    h('p', { class: 'lead' }, `Becomes ${OUTCOME[f.outcome]}${selfAttest ? '' : ` from ${f.issuer}`}. Its requirements map onto the same controls as SOC 2; excluding a requirement, mapping another control to it, or stating a position is recorded in frameworks/${f.id}.json.${st.requirements.some((r) => r.id.startsWith('A.')) ? ' Its statement of applicability: evidence-desk soa --framework ' + f.id + '.' : ''}`),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, `${sm.ready} / ${sm.requirements - sm.excluded}`), h('span', {}, sm.optional ? `requirements ready (${sm.optional} optional listed apart)` : 'requirements ready')),
      h('div', { class: 'stat' }, h('b', {}, open.length), h('span', {}, 'steps still open')),
      h('div', { class: 'stat' }, h('b', {}, sm.excluded), h('span', {}, 'excluded, with reasons')),
      h('div', { class: 'stat' }, h('b', {}, sm.shared_evidence), h('span', {}, 'evidence records also serving SOC 2'))),
    selfAttest ? h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Sign the self-attestation'),
      h('p', { class: 'muted' }, 'A requirement is met when it is ready, excluded with a reason, or given a position below (partly met or not met, with what is in place). The signed document discloses every requirement; its badge says self-attested and lasts a year.'),
      unpositioned.length ? [h('p', {}, pill(`${unpositioned.length} ${unpositioned.length === 1 ? 'requirement still needs' : 'requirements still need'} a position`, 'warn')), bulk] : h('p', {}, pill('every required requirement has a position', 'ok')),
      h('div', { class: 'row' }, h('div', { style: 'flex:1' }, signBy), h('button', { class: 'primary', disabled: unpositioned.length > 0, onclick: async () => {
        const r = await post('/api/frameworks/attest', { id: f.id, by: signBy.value }, null);
        if (r) notice(`Signed: ${r.result.counts.met} met, ${r.result.counts.excluded} excluded, ${r.result.counts.partial} partly met, ${r.result.counts['not met']} not met. Merge it through your own pull request so attribution can check it.`, true); } }, 'Sign'))) : recordCard(f),
    heldCard,
    h('h2', {}, `Steps still open: ${open.length}`),
    open.length ? h('table', {}, h('tr', {}, h('th', {}, 'Requirement'), h('th', {}, 'Why it is not ready'), selfAttest ? h('th', {}, 'Your position') : null),
      open.map((r) => h('tr', {}, h('td', {}, h('b', {}, r.id.replace('clause-', 'Clause ')), ' ', r.title),
        h('td', {}, stepsFor(r), excludeForm(r)),
        selfAttest ? h('td', {}, positionForm(r)) : null)))
      : h('p', { class: 'muted' }, 'None: every required requirement is ready or excluded.'),
    h('details', {}, h('summary', {}, `All ${st.requirements.length} requirements`),
      Object.entries(groups).map(([g, list]) => [h('h3', {}, `${g}: ${list.filter((r) => !r.optional && r.status === 'ready').length} of ${list.filter((r) => !r.optional && r.status !== 'excluded').length} ready`),
        h('table', {}, h('tr', {}, h('th', {}, 'Requirement'), h('th', {}, 'Controls'), h('th', {}, 'State')),
          list.map((r) => h('tr', {}, h('td', {}, h('b', {}, r.id.replace('clause-', 'Clause ')), ' ', r.title, r.optional ? h('span', { class: 'muted' }, ' (optional, not counted)') : null),
            h('td', {}, r.controls.map((id, i) => [i ? ', ' : '', h('a', { href: `#controls/${id}` }, id)])),
            h('td', {}, pill(r.status === 'unaddressed' ? 'not addressed' : r.status, kind[r.status]), r.position && r.position !== 'met' && r.position !== 'excluded' ? h('div', {}, pill(r.position, 'warn'), ' ', r.statement,
              r.status === 'ready' ? h('span', { class: 'muted' }, ' It is ready now; the self-attestation says what you stated until you clear it.') : null, ' ',
              h('button', { class: 'secondary', onclick: () => decided({ id: f.id, requirement: r.id, clear: true }) }, 'Clear')) : null, r.reason ? h('div', { class: 'muted' }, r.reason) : null,
              st.exclusions?.[r.id] ? h('button', { class: 'secondary', onclick: () => decided({ id: f.id, requirement: r.id, include: true }) }, 'Include again') : null))))])));
}
// Recording the document an auditor or certifying body issued: the only ground for saying audited or certified.
function recordCard(f) {
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const file = form.file.files[0]; if (!file) return notice('Choose the document.', false);
    const r = await post('/api/certifications/add', { framework: form.framework.value, kind: f.outcome, issuer: form.issuer.value, issued_on: form.issued_on.value,
      period_start: form.period_start?.value ?? '', period_end: form.period_end?.value ?? '', valid_until: form.valid_until?.value ?? '', target: f.id, by: form.by.value,
      filename: file.name, data: await fileToBase64(file) }, null);
    if (r) notice(`Recorded ${r.result.id}. The trust center and the badges now claim it while it is current.`, true);
  } },
    h('h2', { style: 'margin-top:0' }, f.outcome === 'certificate' ? 'Record the certificate' : 'Record the audit report'),
    h('p', { class: 'muted' }, `Upload the document ${f.issuer} issued. It is kept with its hash; the page claims only what an intact, current document says.`),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Framework, as the document names it'), h('input', { type: 'text', name: 'framework', required: true, value: f.id === 'soc2' ? 'SOC 2 Type 2' : f.title })),
      h('div', {}, h('label', {}, 'Issued by'), h('input', { type: 'text', name: 'issuer', required: true })),
      h('div', {}, h('label', {}, 'Issued on'), h('input', { type: 'date', name: 'issued_on', required: true })),
      f.outcome === 'certificate' ? h('div', {}, h('label', {}, 'Valid until'), h('input', { type: 'date', name: 'valid_until', required: true }))
        : h('div', {}, h('label', {}, 'Period covered'), h('div', { class: 'row' }, h('input', { type: 'date', name: 'period_start' }), h('input', { type: 'date', name: 'period_end' })))),
    h('label', {}, 'The document'), h('input', { type: 'file', name: 'file', required: true }),
    h('label', {}, 'Recorded by'), personSelect('by', '', 'Choose a person'),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Record')));
  return form;
}

function overview() {
  const g = S.gaps, s = g.summary;
  const byCat = {};
  for (const c of g.criteria) (byCat[c.category] ??= []).push(c);
  return h('div', {},
    h('h1', {}, 'Readiness'),
    h('p', { class: 'lead' }, `As of ${g.as_of}. Everything here is read from the workspace folder ${S.root}. Below: SOC 2 by criterion. Every target's readiness and its steps are under Frameworks.`),
    S.frameworks.length > 1 ? h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Targets'), h('ul', {}, S.frameworks.map((id) => { const f = S.frameworkCatalog.find((x) => x.id === id); const r = readinessOf(id);
      return h('li', {}, h('a', { href: `#frameworks/${id}` }, f?.title ?? id), ' ', f ? docPill(f) : null, r ? ` ${r.ready} / ${r.of} ${r.unit} ready` : ''); }))) : null,
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, `${s.controls_ready} / ${s.controls_applicable}`), h('span', {}, 'controls ready')),
      h('div', { class: 'stat' }, h('b', {}, `${s.criteria_ready} / ${s.criteria_in_scope}`), h('span', {}, 'criteria in scope ready')),
      h('div', { class: 'stat' }, h('b', {}, s.controls_excluded), h('span', {}, 'controls excluded, with reasons')),
      h('div', { class: 'stat' }, h('b', {}, s.problems), h('span', {}, 'validation errors'))),
    g.program.length ? h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Program'), h('ul', { class: 'gaps' }, g.program.map((x) => h('li', {}, x)))) : null,
    S.problems.length ? h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'File problems'),
      h('ul', { class: 'gaps' }, S.problems.map((p) => h('li', {}, `${p.severity}: ${p.file}: ${p.message}`)))) : null,
    Object.entries(byCat).map(([cat, list]) => [
      h('h2', {}, `${cat}: ${list.filter((c) => c.ready).length} of ${list.length} ready`),
      h('table', {}, h('tr', {}, h('th', {}, 'Criterion'), h('th', {}, 'Controls'), h('th', {}, 'State')),
        list.map((c) => h('tr', {},
          h('td', {}, h('b', {}, c.id), ' ', c.title),
          h('td', {}, c.controls.length ? c.controls.map((id, i) => [i ? ', ' : '', h('a', { href: `#controls/${id}` }, id)]) : h('span', { class: 'muted' }, c.excluded.length ? `excluded: ${c.excluded.map((x) => x.id).join(', ')}` : 'none')),
          h('td', {}, c.ready ? pill('ready', 'ok') : [pill(`${c.gaps.length} gap${c.gaps.length === 1 ? '' : 's'}`, 'warn'), h('ul', { class: 'gaps' }, c.gaps.map((x) => h('li', {}, x)))]))))
    ]));
}

function scope() {
  if (!S.scope) return h('p', {}, 'scope.json is missing or invalid; see Overview for the problem.');
  const answers = { ...S.scope.answers };
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const out = {};
    for (const q of S.questions) {
      if (q.type === 'boolean') { const v = form.querySelector(`input[name="${q.id}"]:checked`)?.value; if (v !== undefined) out[q.id] = v === 'yes'; }
      else out[q.id] = form.querySelector(`[name="${q.id}"]`).value.trim();
    }
    await post('/api/scope', { answers: out, version: S.scope.version }, 'Scope saved.');
  } },
    S.questions.map((q) => h('div', {},
      h('label', { for: q.id }, q.prompt, q.required ? '' : ' (optional)', S.scope.sources[q.id] ? h('small', { class: 'source' }, `Filled from ${S.scope.sources[q.id]}`) : null),
      q.type === 'boolean'
        ? h('div', { class: 'radio' }, ['yes', 'no'].map((v) => h('label', {}, h('input', { type: 'radio', name: q.id, value: v, checked: answers[q.id] === (v === 'yes') }), v === 'yes' ? 'Yes' : 'No')))
        : h('input', { type: 'text', id: q.id, name: q.id, value: answers[q.id] ?? '' }))),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save answers')));
  const missing = S.questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ''));
  return h('div', {},
    h('h1', {}, 'Scope'),
    h('p', { class: 'lead' }, 'These answers decide which Trust Services Criteria are in scope and which controls apply. Security is always in scope.'),
    form,
    h('div', { class: 'card' },
      h('h2', { style: 'margin-top:0' }, 'Control set'),
      h('p', { class: 'muted' }, S.controls.length ? `${S.gaps.summary.controls_applicable} controls apply and ${S.gaps.summary.controls_excluded} are excluded with a reason. Adopt again after changing answers; owners, statuses and edited policies are kept.` : 'No controls adopted yet.'),
      missing.length ? h('p', { class: 'muted' }, `Answer ${missing.length} more question(s) to adopt the control set.`) : null,
      h('button', { class: 'primary', disabled: missing.length > 0, onclick: async () => {
        const r = await post('/api/adopt', {}, null);
        if (r) notice(`Adopted: ${r.result.created.length} controls created, ${r.result.changed.length} changed, ${r.result.policies.length} policies created.`, true);
      } }, S.controls.length ? 'Adopt again' : 'Adopt the control set')));
}

function personSelect(name, value, blank = 'Unassigned') {
  return h('select', { name }, h('option', { value: '' }, blank), people().map((p) => h('option', { value: p, selected: p === value }, `${personName(p)} (${p})`)));
}

function controls() {
  if (detail) return controlDetail(S.controls.find((c) => c.id === detail));
  const gaps = new Map(S.gaps.controls.map((c) => [c.id, c]));
  return h('div', {},
    h('h1', {}, 'Controls'),
    h('p', { class: 'lead' }, 'Each control is a file in controls/. Select one to assign an owner, record its status or change whether it applies.'),
    S.controls.length ? h('table', {}, h('tr', {}, h('th', {}, 'Control'), h('th', {}, 'Owner'), h('th', {}, 'Status'), h('th', {}, 'Gaps')),
      // The program's controls, and those that do not apply (so one can be re-included); a control no target needs is not listed.
      S.controls.filter((c) => S.needed.includes(c.id) || !c.applicable).map((c) => h('tr', { class: 'clickable', onclick: () => go('controls', c.id) },
        h('td', {}, h('b', {}, c.id), ' ', c.title),
        h('td', {}, c.owner ? personName(c.owner) : h('span', { class: 'muted' }, 'unassigned')),
        h('td', {}, statusPill(c)),
        h('td', {}, c.applicable ? (gaps.get(c.id)?.gaps.length ? pill(String(gaps.get(c.id).gaps.length), 'warn') : pill('ready', 'ok')) : '')))) : h('p', {}, 'No controls yet. Answer the scope questions and adopt the control set.'));
}

function controlDetail(c) {
  if (!c) return h('p', {}, 'That control does not exist.');
  const g = S.gaps.controls.find((x) => x.id === c.id);
  const ev = S.evidence.filter((e) => e.controls.includes(c.id));
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const applies = form.querySelector('[name=applies]:checked').value === 'yes';
    const patch = { owner: form.owner.value, status: form.status.value, notes: form.notes.value, applicable: applies };
    if (!applies) patch.exclusion_reason = form.reason.value;
    await post('/api/control', { id: c.id, patch, version: c.version }, `${c.id} saved.`);
  } },
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Owner'), personSelect('owner', c.owner)),
      h('div', {}, h('label', {}, 'Status'), h('select', { name: 'status' }, ['not-started', 'in-progress', 'implemented'].map((s) => h('option', { value: s, selected: s === c.status }, s.replace('-', ' ')))))),
    h('label', {}, 'Does this control apply?'),
    h('div', { class: 'radio' }, ['yes', 'no'].map((v) => h('label', {}, h('input', { type: 'radio', name: 'applies', value: v, checked: c.applicable === (v === 'yes') }), v === 'yes' ? 'Applies' : 'Excluded'))),
    h('label', {}, 'Reason for exclusion', h('small', {}, 'Required when excluded. Auditors read this.')),
    h('input', { type: 'text', name: 'reason', value: c.exclusion_reason ?? '' }),
    h('label', {}, 'Notes'), h('input', { type: 'text', name: 'notes', value: c.notes ?? '' }),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save')));
  return h('div', {},
    h('a', { class: 'back', href: '#controls' }, '← All controls'),
    h('h1', {}, `${c.id} ${c.title}`),
    h('p', { class: 'lead' }, c.description),
    h('div', { class: 'card' },
      h('div', {}, h('b', {}, 'Criteria: '), c.criteria.join(', ')),
      h('div', {}, h('b', {}, 'Operates: '), c.frequency),
      h('div', {}, h('b', {}, 'Policies: '), c.policies.map((p, i) => [i ? ', ' : '', h('a', { href: `#policies/${p}` }, p)])),
      h('div', {}, h('b', {}, 'Evidence an auditor will expect: '), c.evidence_expected.join('; ')),
      c.applicable && g ? h('div', { style: 'margin-top:8px' }, g.gaps.length ? [h('b', {}, 'Gaps:'), h('ul', { class: 'gaps' }, g.gaps.map((x) => h('li', {}, x)))] : pill('ready', 'ok')) : null),
    form,
    h('h2', {}, `Evidence (${ev.length})`),
    ev.length ? evidenceTable(ev) : h('p', { class: 'muted' }, 'None recorded yet.'),
    h('div', { class: 'row' }, h('button', { class: 'secondary', onclick: () => go('evidence', `new:${c.id}`) }, 'Record evidence for this control')));
}

// ── To sign ─────────────────────────────────────────────────────────────────────────────────────────────────
// Everything waiting for one person's read-and-sign, as one queue: policies to approve, risk treatments to decide,
// forms due, access reviews to sign off and self-attestations ready to sign. Each item is read on its own screen with
// its whole text shown; the queue on the left says how far the person has got. Nothing here is stored: the queue is
// worked out from the workspace each time, and each act is the existing one (a policy approval, a register row, …).
let signer = '';
function signQueue(person) {
  const items = [];
  // A policy with no owner waits in everyone's queue until someone owns or approves it.
  for (const p of S.policies.filter((x) => x.owner === person || !x.owner)) {
    const last = p.versions.at(-1);
    if (!last || last.sha256 !== p.textVersion) items.push({ key: `policy:${p.id}`, kind: 'policy', title: p.owner ? p.title : `${p.title} (no owner)`, p, again: Boolean(last) });
  }
  for (const r of (S.registers.risks?.rows ?? []).filter((x) => x.owner === person && x.treatment === 'undecided')) items.push({ key: `risk:${r.id}`, kind: 'risk', title: `Risk: ${r.title}`, r });
  for (const o of S.gaps.obligations.filter((x) => x.kind === 'person' && x.who === person && x.state !== 'done')) {
    const f = S.forms.find((x) => x.title === o.what);
    if (f) items.push({ key: `form:${f.id}`, kind: 'form', title: f.title, f, o });
  }
  for (const a of S.accessReviews.filter((x) => x.reviewer === person && x.status === 'open')) items.push({ key: `access:${a.id}`, kind: 'access', title: `Access review: ${a.system}`, a });
  for (const f of S.frameworkCatalog.filter((x) => x.outcome === 'self-attestation' && S.frameworks.includes(x.id))) {
    const st = S.frameworkStates?.[f.id];
    if (st && st.requirements.every((r) => r.optional || r.position) && !docsFor(f).some((c) => c.current)) items.push({ key: `attest:${f.id}`, kind: 'attest', title: `Self-attestation: ${f.title}`, f });
  }
  return items;
}

// A policy's Markdown as read: headings, list items and paragraphs, one block per line so each carries its mark. The
// catalog's drafting comment is shown as a note, not hidden.
function readable(lines) {
  const out = [];
  for (const l of lines) {
    if (l.mark === 'blank') continue;
    const t = l.text.trim();
    const cls = l.mark === 'yours' ? 'line yours' : 'line';
    const c = /^<!--\s*([\s\S]*?)\s*-->$/.exec(t);
    if (c) { out.push(h('p', { class: 'drafting' }, `Drafting note from the template: ${c[1]}`)); continue; }
    const hd = /^(#{1,4})\s+(.*)$/.exec(t);
    if (hd) { out.push(h(hd[1].length <= 2 ? 'h3' : 'h4', { class: cls }, hd[2])); continue; }
    const li = /^[-*]\s+(.*)$/.exec(t);
    if (li) { out.push(h('p', { class: `${cls} bullet` }, `• ${li[1].replace(/\*\*/g, '')}`)); continue; }
    out.push(h('p', { class: cls }, t.replace(/\*\*/g, '')));
  }
  return out;
}

function signView() {
  const people = S.registers.people?.rows ?? [];
  if (!signer || !people.some((p) => p.id === signer)) signer = people[0]?.id ?? '';
  const items = signer ? signQueue(signer) : [];
  const at = items.find((i) => i.key === detail) ?? items[0];
  const pick = h('select', { onchange: (e) => { signer = e.target.value; go('sign'); } }, people.map((p) => h('option', { value: p.id, selected: p.id === signer }, `${p.name} (${p.id})`)));
  const rail = h('div', { class: 'rail' },
    h('p', { class: 'muted', style: 'margin:0 0 8px' }, items.length ? `${items.length} waiting` : 'Nothing waiting'),
    items.map((i, n) => h('a', { class: `railitem${i === at ? ' on' : ''}`, href: `#sign/${encodeURIComponent(i.key)}` }, h('span', { class: 'n' }, n + 1), i.title)));
  const next = at ? items[items.indexOf(at) + 1] : null;
  const nextBtn = next ? h('a', { class: 'secondary btnlink', href: `#sign/${encodeURIComponent(next.key)}` }, `Next: ${next.title} →`) : null;
  return h('div', {},
    h('h1', {}, 'To sign'),
    h('p', { class: 'lead' }, 'Everything waiting for one person\'s reading and signature, one item at a time. Each act is recorded under that person\'s name.'),
    h('div', { class: 'row', style: 'margin:0 0 16px' }, h('label', { style: 'margin:0' }, 'Signing as'), pick),
    items.length ? h('div', { class: 'reader' }, rail, h('div', { class: 'page' }, signItem(at, nextBtn))) : h('div', { class: 'card' }, h('p', { style: 'margin:0' }, 'Nothing is waiting for this person\'s signature.')));
}

function signItem(i, nextBtn) {
  const org = S.organization || 'the organization';
  if (i.kind === 'policy') {
    const p = i.p, r = p.reading;
    const confirm = h('input', { type: 'checkbox', id: 'adapted' });
    const approve = h('button', { class: 'primary', disabled: r.unfilled.length > 0, onclick: async () => {
      if (r.template && !confirm.checked) return notice(`Confirm the text is true of how ${org} operates, or change it first.`, false);
      const res = await post('/api/policy/approve', { id: p.id, by: signer, textVersion: p.textVersion, version: p.version, ...(r.template ? { asIs: true } : {}) }, null);
      if (res) notice(`${p.title} approved by ${personName(signer)}.`, true);
    } }, 'Approve');
    return h('div', {},
      h('h2', { style: 'margin-top:0' }, p.title),
      h('p', { class: 'muted' }, `About ${Math.max(1, Math.round(r.words / 200))} min to read · ${i.again ? 'changed since its last approved version' : 'never approved'}`),
      r.commitments.length ? h('div', { class: 'commit' }, h('b', {}, `Signing this commits ${org} to:`),
        h('ul', {}, r.commitments.map((c) => h('li', {}, `${c.title} (${c.control}), ${c.every}`, c.owner ? h('span', { class: 'muted' }, ` · ${personName(c.owner)}`) : null)))) : null,
      r.template ? h('div', { class: 'callout' }, `This is still Evidence Desk's template text. Read it as a description of how ${org} works: change what is not true in the editor, or confirm below that it is true.`) : null,
      r.unfilled.length ? h('div', { class: 'callout bad' }, `Fill in ${r.unfilled.map((x) => `{{${x}}}`).join(', ')} before this can be approved.`) : null,
      h('p', { class: 'legend' }, h('span', { class: 'line yours' }, 'Highlighted'), ' lines are your organization\'s own; the rest is Evidence Desk\'s template text, shown in full.'),
      h('div', { class: 'doc' }, readable(r.lines)),
      h('div', { class: 'act' },
        r.template ? h('label', { class: 'check', for: 'adapted' }, confirm, ` I have read this and it is true of how ${org} operates`) : null,
        h('div', { class: 'row' }, approve, h('a', { class: 'secondary btnlink', href: `#policies/${p.id}` }, 'Needs a change: edit it'), nextBtn)));
  }
  if (i.kind === 'risk') {
    const r = i.r;
    const choice = h('select', {}, h('option', { value: '' }, 'Choose a treatment'), [['mitigate', 'Mitigate: act to reduce it'], ['accept', 'Accept it as it is'], ['transfer', 'Transfer it (insurance, contract)'], ['avoid', 'Avoid it: stop the activity']].map(([v, t]) => h('option', { value: v }, t)));
    return h('div', {},
      h('h2', { style: 'margin-top:0' }, r.title),
      h('p', {}, r.description),
      h('p', { class: 'muted' }, `Likelihood ${r.likelihood} of 5 · impact ${r.impact} of 5 · controls ${r.controls || 'none'} · review due ${r.review_due || 'unset'}`),
      h('div', { class: 'act' }, h('label', { style: 'margin-top:0' }, 'Your treatment decision'),
        h('div', { class: 'row' }, choice, h('button', { class: 'primary', onclick: async () => {
          if (!choice.value) return notice('Choose a treatment first.', false);
          const reg = S.registers.risks;
          const res = await post('/api/register', { name: 'risks', row: { ...r, treatment: choice.value, description: `${r.description.replace(/^Draft for owner review\.\s*/, '')} Treatment decided (${choice.value}) by ${personName(signer)} on ${new Date().toISOString().slice(0, 10)}.` }, version: reg.version, replaceId: r.id }, null);
          if (res) notice(`Risk ${r.id}: ${choice.value}.`, true);
        } }, 'Decide'), nextBtn)));
  }
  const open = { form: [`#people/form:${i.f?.id}:${signer}`, `Complete it: ${i.f?.title}`, `Due ${i.o?.due}${i.o?.state === 'overdue' ? ' (overdue)' : ''}.`],
    access: [`#access/${i.a?.id}`, 'Open the review', `Review of ${i.a?.system} for ${i.a?.period.start} to ${i.a?.period.end}.`],
    attest: [`#frameworks/${i.f?.id}`, 'Open it to sign', 'Every requirement has a position; the attestation can be signed.'] }[i.kind];
  return h('div', {}, h('h2', { style: 'margin-top:0' }, i.title), h('p', {}, open[2]), h('div', { class: 'row' }, h('a', { class: 'primary btnlink', href: open[0] }, open[1]), nextBtn));
}

function policies() {
  if (detail) return policyDetail(S.policies.find((p) => p.id === detail));
  return h('div', {},
    h('h1', {}, 'Policies'),
    h('p', { class: 'lead' }, 'Each policy is Markdown in policies/. Approving freezes the exact text as a new version under policies/archive/.'),
    S.policies.length ? h('table', {}, h('tr', {}, h('th', {}, 'Policy'), h('th', {}, 'Owner'), h('th', {}, 'Approved')),
      S.policies.map((p) => {
        const last = p.versions.at(-1);
        return h('tr', { class: 'clickable', onclick: () => go('policies', p.id) },
          h('td', {}, h('b', {}, p.title), h('div', { class: 'muted' }, p.id)),
          h('td', {}, p.owner ? personName(p.owner) : h('span', { class: 'muted' }, 'unassigned')),
          h('td', {}, last ? [pill(`v${last.version}`, last.sha256 === p.textVersion ? 'ok' : 'warn'), ' ', last.sha256 === p.textVersion ? `by ${personName(last.approved_by)} on ${last.approved_at.slice(0, 10)}` : 'edited since approval'] : pill('not approved', 'bad')));
      })) : h('p', {}, 'No policies yet. Adopt the control set first.'));
}

function policyDetail(p) {
  if (!p) return h('p', {}, 'That policy does not exist.');
  const shownVersion = p.textVersion;
  const ta = h('textarea', { value: p.text });
  const ownerForm = h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); await post('/api/policy/owner', { id: p.id, owner: ownerForm.owner.value, version: p.version }, 'Owner saved.'); } },
    h('div', { style: 'flex:1' }, personSelect('owner', p.owner)), h('button', { class: 'secondary', type: 'submit' }, 'Save owner'));
  const approver = personSelect('approver', '', 'Choose who approves');
  const last = p.versions.at(-1);
  return h('div', {},
    h('a', { class: 'back', href: '#policies' }, '← All policies'),
    h('h1', {}, p.title),
    h('p', { class: 'lead' }, `policies/${p.id}.md`, last ? ` · version ${last.version} approved by ${personName(last.approved_by)} on ${last.approved_at.slice(0, 10)}${last.sha256 === p.textVersion ? '' : ' · the text has changed since'}` : ' · never approved'),
    h('div', { class: 'card' }, h('label', { style: 'margin-top:0' }, 'Owner'), ownerForm),
    h('div', { class: 'card' },
      h('label', { style: 'margin-top:0' }, 'Text', h('small', {}, 'Fill in every {{placeholder}} and adapt the template to how you actually operate.')),
      ta,
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => post('/api/policy/text', { id: p.id, text: ta.value, version: shownVersion }, 'Policy text saved.') }, 'Save text'))),
    h('div', { class: 'card' },
      h('label', { style: 'margin-top:0' }, 'Approve this text', h('small', {}, 'Save any edits first. Approval freezes the saved text as the next version.')),
      h('div', { class: 'row', style: 'margin-top:0' }, h('div', { style: 'flex:1' }, approver),
        h('button', { class: 'primary', onclick: () => {
          if (ta.value !== p.text) return notice('Save the text before approving it.', false);
          if (!approver.value) return notice('Choose who approves.', false);
          post('/api/policy/approve', { id: p.id, by: approver.value, textVersion: shownVersion, version: p.version }, 'Approved.');
        } }, 'Approve'))),
    p.versions.length ? h('div', {}, h('h2', {}, 'Approved versions'),
      h('table', {}, h('tr', {}, h('th', {}, 'Version'), h('th', {}, 'Approved by'), h('th', {}, 'When'), h('th', {}, 'Text')),
        p.versions.slice().reverse().map((v) => h('tr', {}, h('td', {}, v.version), h('td', {}, personName(v.approved_by)), h('td', {}, v.approved_at.replace('T', ' ').replace('Z', ' UTC')),
          h('td', {}, h('a', { href: `/files/${encodeURIComponent(v.archived)}`, target: '_blank' }, v.archived)))))) : null);
}

const REG_TITLES = { people: 'People', systems: 'Systems', vendors: 'Vendors', risks: 'Risks', vulnerabilities: 'Vulnerabilities' };
function registers() {
  const name = REG_TITLES[detail?.split(':')[0]] ? detail.split(':')[0] : 'people';
  const editing = detail?.split(':')[1];
  const reg = S.registers[name];
  const sub = h('div', { class: 'row', style: 'margin:0 0 16px' }, Object.entries(REG_TITLES).map(([k, t]) => h('button', { class: k === name ? 'primary' : 'secondary', onclick: () => go('registers', k) }, t)));
  if (!reg) return h('div', {}, h('h1', {}, 'Registers'), sub, h('p', {}, `registers/${name}.csv could not be read; see Overview for the problem.`));
  const row = editing && editing !== 'new' ? reg.rows.find((r) => r.id === editing) : null;
  const field = (c) => {
    const v = row?.[c] ?? '';
    if (reg.enums[c]) return h('select', { name: c }, h('option', { value: '' }, ''), reg.enums[c].map((o) => h('option', { value: o, selected: o === v }, o)));
    return h('input', { type: 'text', name: c, value: v });
  };
  const form = editing ? h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const out = {};
    for (const c of reg.columns) out[c] = form.querySelector(`[name="${c}"]`).value;
    const r = await post('/api/register', { name, row: out, version: reg.version, ...(row ? { replaceId: row.id } : {}) }, 'Saved.');
    if (r) go('registers', name);
  } },
    h('h2', { style: 'margin-top:0' }, row ? `Edit ${row.id}` : `Add to ${REG_TITLES[name].toLowerCase()}`),
    h('div', { class: 'grid2' }, reg.columns.map((c) => h('div', {}, h('label', {}, c, reg.required.includes(c) ? ' *' : ''), field(c)))),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save'), h('button', { class: 'secondary', type: 'button', onclick: () => go('registers', name) }, 'Cancel'))) : null;
  return h('div', {},
    h('h1', {}, 'Registers'),
    h('p', { class: 'lead' }, `registers/${name}.csv. Open it in a spreadsheet if you prefer; this page rereads it every time.`),
    sub, form,
    h('table', {}, h('tr', {}, reg.columns.map((c) => h('th', {}, c))),
      reg.rows.map((r) => h('tr', { class: 'clickable', onclick: () => go('registers', `${name}:${r.id}`) }, reg.columns.map((c) => h('td', {}, r[c]))))),
    editing ? null : h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go('registers', `${name}:new`) }, `Add ${name === 'people' ? 'a person' : name === 'risks' ? 'a risk' : name === 'vulnerabilities' ? 'a vulnerability' : name.slice(0, -1)}`)));
}

function evidenceTable(list) {
  return h('table', {}, h('tr', {}, h('th', {}, 'Record'), h('th', {}, 'Controls'), h('th', {}, 'Collected'), h('th', {}, 'Period'), h('th', {}, 'Files')),
    list.map((e) => h('tr', {},
      h('td', {}, h('b', {}, e.title), h('div', { class: 'muted' }, `${e.id} · ${e.source.kind}${e.source.name ? ` (${e.source.name})` : ''} · by ${personName(e.recorded_by)}`)),
      h('td', {}, e.controls.map((c, i) => [i ? ', ' : '', h('a', { href: `#controls/${c}` }, c)])),
      h('td', {}, e.collected_at.slice(0, 10)),
      h('td', {}, e.period ? `${e.period.start} to ${e.period.end}` : ''),
      h('td', {}, e.files.map((f) => h('div', {}, h('a', { href: `/files/${encodeURIComponent(f.path)}`, target: '_blank' }, f.path.split('/').pop())))))));
}

function evidence() {
  const adding = detail?.startsWith('new');
  const preset = detail?.split(':')[1];
  const applicable = S.controls.filter((c) => S.needed.includes(c.id));
  const form = adding ? h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const file = form.file.files[0];
    if (!file) return notice('Choose a file.', false);
    const controls = [...form.controls.selectedOptions].map((o) => o.value);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const period = form.start.value && form.end.value ? { start: form.start.value, end: form.end.value } : undefined;
    const r = await post('/api/evidence', { title: form.title.value, controls, by: form.by.value, filename: file.name, data: btoa(bin), period, notes: form.notes.value }, 'Evidence recorded.');
    if (r) go('evidence');
  } },
    h('h2', { style: 'margin-top:0' }, 'Record evidence'),
    h('label', {}, 'What is it?'), h('input', { type: 'text', name: 'title' }),
    h('label', {}, 'Which controls does it support?', h('small', {}, 'Hold Ctrl or ⌘ to choose several.')),
    h('select', { name: 'controls', multiple: true, size: 8 }, applicable.map((c) => h('option', { value: c.id, selected: c.id === preset }, `${c.id} ${c.title}`))),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Recorded by'), personSelect('by', '', 'Choose a person')),
      h('div', {}, h('label', {}, 'File'), h('input', { type: 'file', name: 'file', required: true }))),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Covers the period from', h('small', {}, 'Optional')), h('input', { type: 'date', name: 'start' })),
      h('div', {}, h('label', {}, 'to'), h('input', { type: 'date', name: 'end' }))),
    h('label', {}, 'Notes'), h('input', { type: 'text', name: 'notes' }),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Record'), h('button', { class: 'secondary', type: 'button', onclick: () => go('evidence') }, 'Cancel'))) : null;
  return h('div', {},
    h('h1', {}, 'Evidence'),
    h('p', { class: 'lead' }, 'Each record in evidence/records/ names its controls, when it was collected and the SHA-256 of every file, so a later change to a file is visible.'),
    form,
    S.evidence.length ? evidenceTable(S.evidence) : h('p', { class: 'muted' }, 'No evidence recorded yet.'),
    adding ? null : h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go('evidence', 'new') }, 'Record evidence')));
}

const statePill = (st) => pill(st, st === 'done' ? 'ok' : st === 'overdue' ? 'bad' : 'warn');
const fileToBase64 = async (file) => { const buf = new Uint8Array(await file.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(bin); };

function obligationTable(list, showWho = true) {
  return h('table', {}, h('tr', {}, h('th', {}, 'State'), h('th', {}, 'Due'), showWho ? h('th', {}, 'Who') : null, h('th', {}, 'What'), h('th', {}, 'Controls')),
    list.map((o) => h('tr', {}, h('td', {}, statePill(o.state)), h('td', {}, o.due, o.done_on ? h('div', { class: 'muted' }, `done ${o.done_on}`) : null),
      showWho ? h('td', {}, o.who ? personName(o.who) : h('span', { class: 'muted' }, 'unassigned')) : null, h('td', {}, o.what),
      h('td', {}, o.controls.map((c, i) => [i ? ', ' : '', h('a', { href: `#controls/${c}` }, c)])))));
}

function obligations() {
  const list = S.gaps.obligations;
  const open = list.filter((o) => o.state !== 'done');
  return h('div', {},
    h('h1', {}, 'Obligations'),
    h('p', { class: 'lead' }, 'What is owed and when, derived from the controls, people, vendors, risks, vulnerabilities and incidents in the workspace.'),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, list.filter((o) => o.state === 'overdue').length), h('span', {}, 'overdue')),
      h('div', { class: 'stat' }, h('b', {}, list.filter((o) => o.state === 'due').length), h('span', {}, 'due')),
      h('div', { class: 'stat' }, h('b', {}, list.filter((o) => o.state === 'done').length), h('span', {}, 'done and current'))),
    open.length ? obligationTable(open) : h('p', {}, 'Nothing is due.'),
    h('h2', {}, 'Done and current'), obligationTable(list.filter((o) => o.state === 'done')));
}

function peopleView() {
  if (detail?.startsWith('form:')) return formView(detail.split(':')[1], detail.split(':')[2]);
  const rows = S.registers.people?.rows ?? [];
  return h('div', {},
    h('h1', {}, 'People'),
    h('p', { class: 'lead' }, 'Each person\'s onboarding and recurring obligations. People are added in Registers → People.'),
    rows.length ? rows.map((p) => {
      const mine = S.gaps.obligations.filter((o) => (o.who === p.id || o.subject === p.id) && ['person'].includes(o.kind));
      const forms = S.forms.filter((f) => mine.some((o) => o.what === f.title));
      return h('div', { class: 'card' },
        h('h2', { style: 'margin-top:0' }, `${p.name} (${p.id})`, p.end_date ? h('span', { class: 'source' }, ` · left ${p.end_date}`) : p.start_date ? h('span', { class: 'source' }, ` · started ${p.start_date}`) : null),
        mine.length ? obligationTable(mine, mine.some((o) => o.who !== p.id)) : h('p', { class: 'muted' }, 'Nothing owed.'),
        forms.length ? h('div', { class: 'row' }, forms.map((f) => h('button', { class: 'secondary', onclick: () => go('people', `form:${f.id}:${p.id}`) }, `Complete: ${f.title}`))) : null);
    }) : h('p', {}, 'No people yet.'));
}

function formView(id, person) {
  const f = S.forms.find((x) => x.id === id);
  if (!f) return h('p', {}, 'That form does not exist.');
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const answers = {};
    for (const q of f.questions) {
      answers[q.id] = q.type === 'text' ? form.querySelector(`[name="${q.id}"]`).value : (form.querySelector(`input[name="${q.id}"]:checked`)?.value ?? '');
    }
    const r = await post('/api/respond', { form: f.id, person: form.person.value, answers, version: f.version }, null);
    if (r) {
      const mine = S.responses.filter((x) => x.form === f.id && x.person === form.person.value).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).at(-1);
      notice(mine?.passed ? `Recorded and passed${mine.score !== undefined ? ` (${mine.score}%)` : ''}.` : `Recorded, but not passed${mine?.score !== undefined ? ` (${mine.score}%)` : ''}. Review and submit again.`, !!mine?.passed);
      if (mine?.passed) go('people');
    }
  } },
    h('label', { style: 'margin-top:0' }, 'Who is completing this?', h('small', {}, 'The response is recorded under this person.')), personSelect('person', person, 'Choose a person'),
    f.questions.map((q, n) => h('div', {},
      h('label', {}, `${n + 1}. ${q.prompt}`),
      q.type === 'text' ? h('input', { type: 'text', name: q.id })
        : h('div', { class: 'radio', style: 'flex-direction:column;gap:4px' }, (q.type === 'choice' ? q.options : ['yes', 'no']).map((o) => h('label', {}, h('input', { type: 'radio', name: q.id, value: o }), o === 'yes' ? 'Yes' : o === 'no' ? 'No' : o))))),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Submit'), h('button', { class: 'secondary', type: 'button', onclick: () => go('people') }, 'Cancel')));
  return h('div', {},
    h('a', { class: 'back', href: '#people' }, '← People'),
    h('h1', {}, f.title),
    h('p', { class: 'lead' }, f.intro ?? '', f.acknowledges_policies ? ` Policies in force: ${S.policies.filter((p) => p.versions.length).map((p) => `${p.title} v${p.versions.at(-1).version}`).join(', ') || 'none approved yet'}.` : ''),
    form);
}

function access() {
  const r = detail ? S.accessReviews.find((x) => x.id === detail) : null;
  if (detail === 'new') {
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      const file = form.listing.files[0];
      if (!file) return notice('Attach the user listing.', false);
      const res = await post('/api/access-review/start', { system: form.system.value, reviewer: form.reviewer.value, start: form.start.value, end: form.end.value,
        generated_by: form.generated_by.value, filename: file.name, data: await fileToBase64(file) }, 'Review started.');
      if (res) go('access', res.id);
    } },
      h('h2', { style: 'margin-top:0' }, 'Start an access review'),
      h('div', { class: 'grid2' },
        h('div', {}, h('label', {}, 'System'), h('select', { name: 'system' }, (S.registers.systems?.rows ?? []).map((x) => h('option', { value: x.id }, x.name)))),
        h('div', {}, h('label', {}, 'Reviewer'), personSelect('reviewer', '', 'Choose the reviewer'))),
      h('div', { class: 'grid2' },
        h('div', {}, h('label', {}, 'Period from'), h('input', { type: 'date', name: 'start' })),
        h('div', {}, h('label', {}, 'to'), h('input', { type: 'date', name: 'end' }))),
      h('label', {}, 'User listing', h('small', {}, 'A CSV export of the system\'s accounts with an "account" or "user" column, or one account per line.')), h('input', { type: 'file', name: 'listing' }),
      h('label', {}, 'How was the listing produced?', h('small', {}, 'The query, export path or screen, so an auditor can check the listing is complete.')), h('input', { type: 'text', name: 'generated_by' }),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Start'), h('button', { class: 'secondary', type: 'button', onclick: () => go('access') }, 'Cancel')));
    return h('div', {}, h('h1', {}, 'Access reviews'), form);
  }
  if (r) {
    const done = r.status === 'signed-off';
    const signer = personSelect('by', r.reviewer, 'Who signs off');
    return h('div', {},
      h('a', { class: 'back', href: '#access' }, '← All access reviews'),
      h('h1', {}, `Access review: ${r.system}`),
      h('p', { class: 'lead' }, `${r.period.start} to ${r.period.end} · reviewer ${personName(r.reviewer)} · listing ${r.listing.path} (${r.listing.generated_by})`),
      h('table', {}, h('tr', {}, h('th', {}, 'Account'), h('th', {}, 'Person'), h('th', {}, 'Privileged'), h('th', {}, 'Decision'), h('th', {}, 'Done on')),
        r.accounts.map((a) => {
          const row = h('tr', {},
            h('td', {}, a.account),
            h('td', {}, personSelect('person', a.person ?? '', 'Not a person')),
            h('td', {}, h('input', { type: 'checkbox', name: 'privileged', checked: !!a.privileged })),
            h('td', {}, h('select', { name: 'decision' }, ['pending', 'keep', 'remove', 'modify'].map((d) => h('option', { value: d, selected: d === a.decision }, d)))),
            h('td', {}, h('input', { type: 'date', name: 'done_on', value: a.done_on ?? '' })));
          if (done) for (const el of row.querySelectorAll('select,input')) el.disabled = true;
          else row.addEventListener('change', () => post('/api/access-review/decide', { id: r.id, version: r.version, account: a.account, patch: {
            decision: row.querySelector('[name=decision]').value, person: row.querySelector('[name=person]').value || undefined,
            privileged: row.querySelector('[name=privileged]').checked, done_on: row.querySelector('[name=done_on]').value || undefined } }, `${a.account} saved.`));
          return row;
        })),
      done ? h('p', {}, pill('signed off', 'ok'), ` ${r.signed_off_at.replace('T', ' ').replace('Z', ' UTC')}`)
        : h('div', { class: 'row' }, h('div', {}, signer), h('button', { class: 'primary', onclick: () => post('/api/access-review/sign-off', { id: r.id, version: r.version, by: signer.value }, 'Signed off and recorded as evidence.') }, 'Sign off')));
  }
  return h('div', {},
    h('h1', {}, 'Access reviews'),
    h('p', { class: 'lead' }, 'Review each in-scope system\'s accounts, decide which stay, remove the rest, and sign off. A signed-off review becomes evidence for the access review controls.'),
    S.accessReviews.length ? h('table', {}, h('tr', {}, h('th', {}, 'System'), h('th', {}, 'Period'), h('th', {}, 'Reviewer'), h('th', {}, 'Status')),
      S.accessReviews.map((x) => h('tr', { class: 'clickable', onclick: () => go('access', x.id) }, h('td', {}, x.system), h('td', {}, `${x.period.start} to ${x.period.end}`), h('td', {}, personName(x.reviewer)),
        h('td', {}, x.status === 'signed-off' ? pill('signed off', 'ok') : pill(`${x.accounts.filter((a) => a.decision === 'pending').length} pending`, 'warn'))))) : h('p', { class: 'muted' }, 'No access reviews yet.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go('access', 'new') }, 'Start an access review')));
}

function incidents() {
  const inc = detail && detail !== 'new' ? S.incidents.find((x) => x.id === detail) : null;
  if (detail === 'new') {
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      const r = await post('/api/incident/open', { title: form.title.value, severity: form.severity.value, by: form.by.value, owner: form.owner.value, note: form.note.value }, 'Incident opened.');
      if (r) go('incidents', r.id);
    } },
      h('h2', { style: 'margin-top:0' }, 'Report an incident'),
      h('label', {}, 'What happened?'), h('input', { type: 'text', name: 'title' }),
      h('div', { class: 'grid2' },
        h('div', {}, h('label', {}, 'Severity'), h('select', { name: 'severity' }, ['low', 'medium', 'high', 'critical'].map((x) => h('option', { value: x }, x)))),
        h('div', {}, h('label', {}, 'Reported by'), personSelect('by', '', 'Choose a person'))),
      h('label', {}, 'Owner'), personSelect('owner', ''),
      h('label', {}, 'First note'), h('input', { type: 'text', name: 'note' }),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Open'), h('button', { class: 'secondary', type: 'button', onclick: () => go('incidents') }, 'Cancel')));
    return h('div', {}, h('h1', {}, 'Incidents'), form);
  }
  if (inc) {
    const closed = inc.status === 'closed';
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault();
      await post('/api/incident/update', { id: inc.id, version: inc.version, by: form.by.value, note: form.note.value, status: form.status.value,
        customer_impact: form.customer_impact.value, notification: form.notification.value, review: form.review.value }, 'Incident updated.');
    } },
      h('h2', { style: 'margin-top:0' }, 'Add an update'),
      h('div', { class: 'grid2' }, h('div', {}, h('label', {}, 'By'), personSelect('by', inc.owner ?? '', 'Choose a person')),
        h('div', {}, h('label', {}, 'Status'), h('select', { name: 'status' }, ['open', 'contained', 'resolved', 'closed'].map((x) => h('option', { value: x, selected: x === inc.status }, x))))),
      h('label', {}, 'Update'), h('input', { type: 'text', name: 'note' }),
      h('label', {}, 'Customer impact'), h('input', { type: 'text', name: 'customer_impact', value: inc.customer_impact ?? '' }),
      h('label', {}, 'Notification', h('small', {}, 'Who was notified and when, or why no notification was required. Needed to close.')), h('input', { type: 'text', name: 'notification', value: inc.notification ?? '' }),
      h('label', {}, 'Post-incident review', h('small', {}, 'Cause, what worked, follow-ups. Needed to close.')), h('textarea', { name: 'review', style: 'min-height:120px', value: inc.review ?? '' }),
      h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save update')));
    return h('div', {},
      h('a', { class: 'back', href: '#incidents' }, '← All incidents'),
      h('h1', {}, inc.title),
      h('p', { class: 'lead' }, `${inc.id} · ${inc.severity} · detected ${inc.detected_at.slice(0, 10)} · `, pill(inc.status, closed ? 'ok' : 'warn')),
      h('table', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Who'), h('th', {}, 'Note')),
        inc.timeline.map((t) => h('tr', {}, h('td', {}, t.at.replace('T', ' ').replace('Z', '')), h('td', {}, personName(t.by)), h('td', {}, t.note)))),
      closed ? h('div', { class: 'card', style: 'margin-top:16px' }, h('b', {}, 'Review: '), inc.review, h('div', {}, h('b', {}, 'Notification: '), inc.notification)) : form);
  }
  return h('div', {},
    h('h1', {}, 'Incidents'),
    h('p', { class: 'lead' }, 'Every security incident, from report to closing review. A closed incident becomes evidence for incident handling.'),
    S.incidents.length ? h('table', {}, h('tr', {}, h('th', {}, 'Incident'), h('th', {}, 'Severity'), h('th', {}, 'Detected'), h('th', {}, 'Status')),
      S.incidents.map((x) => h('tr', { class: 'clickable', onclick: () => go('incidents', x.id) }, h('td', {}, x.title), h('td', {}, x.severity), h('td', {}, x.detected_at.slice(0, 10)),
        h('td', {}, pill(x.status, x.status === 'closed' ? 'ok' : 'warn'))))) : h('p', { class: 'muted' }, 'No incidents recorded.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => go('incidents', 'new') }, 'Report an incident')));
}

function openAutonomy() {
  const o = S.openAutonomy;
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const r = await post('/api/open-autonomy/import', { repo: form.repo.value, commit: form.commit.value, by: form.by.value }, null);
    if (r) notice(`Read ${r.report.commit.slice(0, 12)}. ${r.report.added.length ? `Filled: ${r.report.added.join(', ')}.` : 'Nothing new to fill.'} ${r.report.changed.concat(r.report.conflicts).join(' ')}`, true);
  } },
    h('h2', { style: 'margin-top:0' }, o ? 'Read the project again' : 'Read an Open Autonomy project'),
    h('p', { class: 'muted' }, 'Evidence Desk reads the committed roster, agent setup, seams and deploy rules at one commit. What they establish fills empty answers and registers; anything that disagrees with what people entered is reported, never overwritten.'),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Project checkout folder'), h('input', { type: 'text', name: 'repo', value: o?.snapshot.repository_path ?? '' })),
      h('div', {}, h('label', {}, 'Commit', h('small', {}, 'Blank for the current commit')), h('input', { type: 'text', name: 'commit' }))),
    h('label', {}, 'Recorded by'), personSelect('by', '', 'Choose a person'),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Read')));
  if (!o) return h('div', {}, h('h1', {}, 'Open Autonomy'), form);
  // What the project's agents did, from the platform: sessions, metered calls, the pause history and roadmap revisions,
  // as evidence for the AI controls while an AI framework is a target.
  const collect = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const r = await post('/api/open-autonomy/collect', { account: collect.account.value, start: collect.start.value, end: collect.end.value, by: collect.by.value }, null);
    const what = { sessions: 'agent sessions', calls: 'metered calls', oversight: 'operating-state records', 'roadmap-revisions': 'roadmap revisions' };
    if (r) notice(`Read ${Object.entries(r.result.counts).map(([k, n]) => `${n} ${what[k] ?? k}`).join(', ')}; ${r.result.evidence.length} evidence record${r.result.evidence.length === 1 ? '' : 's'} added for the controls your targets need.`, true);
  } },
    h('h2', { style: 'margin-top:0' }, 'Collect the agents\' activity'),
    h('p', { class: 'muted' }, 'Reads the project\'s sessions, metered calls, pause history and roadmap revisions for a period from the platform, on the project\'s own key, as evidence for the AI family\'s records, limits, oversight and change controls.'),
    S.openAutonomyKey ? null : h('p', {}, pill('Start Evidence Desk with OPEN_AUTONOMY_BASE_URL and OPEN_AUTONOMY_KEY in its environment to collect', 'warn')),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, 'Project'), h('input', { type: 'text', name: 'account', value: o.snapshot.account })),
      h('div', {}, h('label', {}, 'Period'), h('div', { class: 'row' }, h('input', { type: 'date', name: 'start' }), h('input', { type: 'date', name: 'end' })))),
    h('label', {}, 'Recorded by'), personSelect('by', '', 'Choose a person'),
    h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit', disabled: !S.openAutonomyKey }, 'Collect')));
  const s = o.snapshot;
  const lastCheck = (a) => o.checks.filter((c) => c.vendor === a.vendor && c.account === a.account).sort((x, y) => x.checked_at.localeCompare(y.checked_at)).at(-1);
  return h('div', {},
    h('h1', {}, `Open Autonomy: ${s.account}`),
    h('p', { class: 'lead' }, `Read at commit ${s.commit.slice(0, 12)} on ${s.read_at.slice(0, 10)}${s.kit ? ` · kit ${s.kit.skew} ${s.kit.version}` : ''}`),
    o.findings.length ? h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Findings'), h('ul', { class: 'gaps' }, o.findings.map((f) => h('li', {}, f)))) : null,
    h('h2', {}, 'Where people act'),
    s.seams ? h('table', {}, h('tr', {}, h('th', {}, 'Seam'), h('th', {}, 'Who'), h('th', {}, 'Door'), h('th', {}, 'Record')),
      s.seams.map((x) => h('tr', {}, h('td', {}, x.id), h('td', {}, x.scope), h('td', {}, ['commit', 'code-host-gate', 'platform-key'].includes(x.door) ? pill(x.door, 'ok') : pill(x.door, 'bad')), h('td', {}, x.record)))) : h('p', {}, 'No seams declared.'),
    h('h2', {}, 'People and their authority'),
    h('table', {}, h('tr', {}, h('th', {}, 'Person'), h('th', {}, 'Scopes'), h('th', {}, 'Accounts')),
      s.team.map((m) => h('tr', {}, h('td', {}, `${m.name} (${m.id})`), h('td', {}, m.scopes.join(', ') || 'none'), h('td', {}, [m.github ? `GitHub ${m.github}` : '', m.discord ? `Discord ${m.discord}` : ''].filter(Boolean).join(' · '))))),
    h('h2', {}, 'Is the roster everyone?'),
    h('table', {}, h('tr', {}, h('th', {}, 'Account'), h('th', {}, 'Last checked'), h('th', {}, 'Administrators outside the roster')),
      s.vendor_accounts.map((a) => { const c = lastCheck(a); return h('tr', {}, h('td', {}, `${a.vendor} ${a.account}`), h('td', {}, c ? c.checked_at.slice(0, 10) : pill('never', 'warn')),
        h('td', {}, !c ? '' : c.outside.length ? pill(c.outside.join(', '), 'bad') : pill('none', 'ok'))); })),
    h('h2', {}, 'Agents'),
    h('table', {}, h('tr', {}, h('th', {}, 'Profile'), h('th', {}, 'Models'), h('th', {}, 'Scheduled work')),
      s.agents.map((g) => h('tr', {}, h('td', {}, g.profile), h('td', {}, g.models.map((m) => `${m.model} (${m.provider}${m.credential ? `, key ${m.credential}` : ''})`).join('; ')), h('td', {}, g.jobs.map((j) => `${j.name}: ${j.schedule}`).join('; ') || 'none')))),
    h('h2', {}, 'How changes reach production'),
    h('div', { class: 'card' },
      h('div', {}, 'Changes land through reviewed pull requests: ', s.rules.pr_landing ? pill('yes', 'ok') : pill('no', 'bad')),
      s.rules.production_deploy ? h('div', {}, `Production deploys from ${s.rules.production_deploy.workflow}, triggered by ${s.rules.production_deploy.tag_trigger ?? 'no tag'} through the ${s.rules.production_deploy.environment} environment; egress limited to ${s.rules.production_deploy.egress.join(', ') || 'nothing declared'}.`) : h('div', {}, pill('no production deploy workflow found', 'warn'))),
    collect, form);
}

function checksView() {
  const A = S.automation;
  const latest = new Map();
  for (const run of [...A.runs].reverse()) for (const r of run.results) latest.set(r.check, { ...r, at: run.started_at });
  const statusPill = (st) => pill(st, st === 'pass' ? 'ok' : st === 'fail' ? 'bad' : 'warn');
  const runner = personSelect('by', '', 'Who is running the checks');
  return h('div', {},
    h('h1', {}, 'Checks'),
    h('p', { class: 'lead' }, 'Collectors read your systems with your own read-only credentials and check them against the controls. Every run is kept in checks/runs/, and what it collected is recorded as evidence.'),
    A.collectors.map((c) => {
      const form = h('form', { class: 'card', onsubmit: async (e) => {
        e.preventDefault();
        const params = Object.fromEntries(c.params.map((p) => [p.name, form.querySelector(`[name="${p.name}"]`).value.trim()]));
        await post('/api/collectors', { id: c.id, enabled: form.enabled.checked, params }, `${c.title} saved.`);
      } },
        h('h2', { style: 'margin-top:0' }, c.title),
        h('label', { style: 'font-weight:400' }, h('input', { type: 'checkbox', name: 'enabled', checked: !!c.settings?.enabled }), ' Enabled'),
        h('div', { class: 'grid2' }, c.params.map((p) => h('div', {}, h('label', {}, p.prompt), h('input', { type: 'text', name: p.name, value: c.settings?.params?.[p.name] ?? '' })))),
        h('p', { class: 'muted' }, `Credentials read from the environment: ${c.credentials.join(', ')} `, c.credentialsPresent ? pill('present', 'ok') : pill('missing', 'bad')),
        h('div', { class: 'row' }, h('button', { class: 'primary', type: 'submit' }, 'Save')),
        h('table', { style: 'margin-top:12px' }, h('tr', {}, h('th', {}, 'Check'), h('th', {}, 'Controls'), h('th', {}, 'Latest'), h('th', {}, 'Detail')),
          c.checks.map((k) => { const r = latest.get(k.id); return h('tr', {}, h('td', {}, k.title), h('td', {}, k.controls.map((x, i) => [i ? ', ' : '', h('a', { href: `#controls/${x}` }, x)])),
            h('td', {}, r ? [statusPill(r.status), h('div', { class: 'muted' }, r.at.slice(0, 16).replace('T', ' '))] : pill('never run', 'warn')), h('td', {}, r?.detail ?? '')); })));
      return form;
    }),
    h('div', { class: 'card' },
      h('h2', { style: 'margin-top:0' }, 'Run now'),
      h('div', { class: 'row', style: 'margin-top:0' }, h('div', { style: 'flex:1' }, runner),
        h('button', { class: 'primary', onclick: async () => {
          if (!runner.value) return notice('Choose who is running the checks.', false);
          notice('Running the checks… this reads each enabled system and can take a little while.', true);
          const r = await post('/api/run', { by: runner.value }, null);
          if (r) notice(`Run ${r.run.id}: ${r.run.results.filter((x) => x.status === 'pass').length} passed, ${r.run.results.filter((x) => x.status === 'fail').length} failed, ${r.run.results.filter((x) => x.status === 'error').length} could not decide.`, !r.run.results.some((x) => x.status === 'fail'));
        } }, 'Run the checks'))),
    h('h2', {}, 'Recent runs'),
    A.runs.length ? h('table', {}, h('tr', {}, h('th', {}, 'Run'), h('th', {}, 'By'), h('th', {}, 'Passed'), h('th', {}, 'Failed'), h('th', {}, 'Could not decide')),
      A.runs.map((r) => h('tr', {}, h('td', {}, r.started_at.slice(0, 16).replace('T', ' ')), h('td', {}, personName(r.by)),
        ...['pass', 'fail', 'error'].map((st) => h('td', {}, String(r.results.filter((x) => x.status === st).length)))))) : h('p', { class: 'muted' }, 'No runs yet.'));
}

function auditView() {
  const [eid, rid] = (detail || '').split(':');
  const A = S.audits.find((x) => x.engagement.id === eid) ?? (S.audits.length === 1 ? S.audits[0] : null);
  if (!A) return h('div', {}, h('h1', {}, 'Audit'), S.audits.length ? h('table', {}, h('tr', {}, h('th', {}, 'Engagement'), h('th', {}, 'Firm'), h('th', {}, 'Status')),
    S.audits.map((a) => h('tr', { class: 'clickable', onclick: () => go('audit', a.engagement.id) }, h('td', {}, a.engagement.id), h('td', {}, a.engagement.firm), h('td', {}, a.engagement.status))))
    : h('p', { class: 'muted' }, 'No engagement yet. Create one with evidence-desk audit <folder> new <id> --type type1|type2 --firm <name>.'));
  const e = A.engagement;
  const statusKind = { open: 'warn', submitted: '', accepted: 'ok', returned: 'bad' };
  const req = rid ? A.requests.find((r) => r.id === rid) : null;
  if (req) {
    const evOptions = S.evidence.map((x) => h('option', { value: x.id }, `${x.id} ${x.title}`));
    const form = h('form', { class: 'card', onsubmit: async (ev) => {
      ev.preventDefault();
      const payload = { engagement: e.id, id: req.id, version: req.version, by: form.by.value, text: form.text.value, status: ev.submitter?.value === 'submit' ? 'submitted' : '',
        evidence: [...form.evidence.selectedOptions].map((o) => o.value), population: form.population?.value || '' };
      await post('/api/audit/request', payload, ev.submitter?.value === 'submit' ? 'Submitted to the firm.' : 'Saved.');
    } },
      h('h2', { style: 'margin-top:0' }, 'Respond'),
      h('div', { class: 'grid2' }, h('div', {}, h('label', {}, 'You are'), personSelect('by', '', 'Choose a person')),
        req.kind !== 'document' ? h('div', {}, h('label', {}, 'Population', h('small', {}, 'The evidence record holding the full list')), h('select', { name: 'population' }, h('option', { value: '' }, req.population ? `keep ${req.population}` : 'none'), evOptions.map((o) => o.cloneNode(true)))) : h('div', {})),
      h('label', {}, 'Attach evidence', h('small', {}, 'Hold Ctrl or ⌘ to choose several.')), h('select', { name: 'evidence', multiple: true, size: 5 }, evOptions),
      h('label', {}, 'Message to the firm'), h('input', { type: 'text', name: 'text' }),
      h('div', { class: 'row' }, h('button', { class: 'secondary', type: 'submit', value: 'save' }, 'Save'), h('button', { class: 'primary', type: 'submit', value: 'submit' }, 'Submit to the firm')));
    return h('div', {},
      h('a', { class: 'back', href: `#audit/${e.id}` }, `← ${e.id}`),
      h('h1', {}, `${req.id}: ${req.title}`),
      h('p', { class: 'lead' }, `${req.kind} · controls ${req.controls.join(', ') || 'none'} · `, pill(req.status, statusKind[req.status])),
      req.evidence.length || req.population ? h('div', { class: 'card' }, h('b', {}, 'Attached: '), [...(req.population ? [`population ${req.population}`] : []), ...req.evidence].join(', ')) : null,
      req.kind === 'sample' ? h('div', {}, h('h2', {}, 'Samples the firm selected'), (req.samples ?? []).length ? h('table', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Status'), h('th', {}, 'Evidence'), h('th', {}, '')),
        req.samples.map((sm) => { const sel = h('select', {}, S.evidence.map((x) => h('option', { value: x.id }, `${x.id} ${x.title}`)));
          return h('tr', {}, h('td', {}, sm.item), h('td', {}, pill(sm.status, sm.status === 'exception' ? 'bad' : sm.status === 'provided' ? 'ok' : 'warn'), sm.note ? h('div', { class: 'muted' }, sm.note) : null), h('td', {}, (sm.evidence ?? []).join(', ') || sel),
            h('td', {}, sm.status === 'pending' ? h('button', { class: 'secondary', onclick: () => { const by = document.querySelector('select[name=by]')?.value; if (!by) return notice('Choose who you are above.', false);
              post('/api/audit/request', { engagement: e.id, id: req.id, version: req.version, by, sample: { item: sm.item, status: 'provided', evidence: [sel.value] } }, `Sample ${sm.item} answered.`); } }, 'Provide') : '')); }))
        : h('p', { class: 'muted' }, 'The firm has not selected samples yet.')) : null,
      h('h2', {}, 'Conversation'),
      req.thread.length ? h('table', {}, req.thread.map((m) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, m.at.slice(0, 16).replace('T', ' ')), h('td', {}, pill(m.side, m.side === 'firm' ? 'warn' : '')), h('td', {}, m.side === 'client' ? personName(m.by) : m.by), h('td', {}, m.text))))
        : h('p', { class: 'muted' }, 'Nothing yet.'),
      form);
  }
  const outInput = h('input', { type: 'text', placeholder: 'Folder to write the package to (new or empty)' });
  const retInput = h('input', { type: 'text', placeholder: 'Folder of the package the firm returned' });
  return h('div', {},
    h('h1', {}, `Audit ${e.id}`),
    h('p', { class: 'lead' }, `${e.type === 'type1' ? `Type 1 as of ${e.as_of}` : `Type 2, ${e.period.start} to ${e.period.end}`} · ${e.firm} · ${e.status}. Evidence Desk records requests, answers and exceptions; the opinion is the firm's.`),
    h('table', {}, h('tr', {}, h('th', {}, 'Request'), h('th', {}, 'Kind'), h('th', {}, 'Status'), h('th', {}, 'Samples')),
      A.requests.map((r) => h('tr', { class: 'clickable', onclick: () => go('audit', `${e.id}:${r.id}`) }, h('td', {}, h('b', {}, r.id), ' ', r.title), h('td', {}, r.kind), h('td', {}, pill(r.status, statusKind[r.status])),
        h('td', {}, (r.samples ?? []).map((sm) => pill(`${sm.item}: ${sm.status}`, sm.status === 'exception' ? 'bad' : sm.status === 'provided' ? 'ok' : 'warn')))))),
    h('h2', {}, 'Drafts'),
    h('div', { class: 'card' },
      A.drafts.length ? h('ul', {}, A.drafts.map((d) => h('li', {}, h('a', { href: `/files/${encodeURIComponent(d)}`, target: '_blank' }, d)))) : h('p', { class: 'muted' }, 'None yet.'),
      h('div', { class: 'row' }, ['description', 'assertion', 'bridge'].filter((k) => !A.drafts.some((d) => d.endsWith(`/${k}.md`))).map((k) =>
        h('button', { class: 'secondary', onclick: () => post('/api/audit/draft', { engagement: e.id, kind: k }, `Drafted the ${k}. Open it, fill every [bracketed] item and remove the drafting comment.`) }, `Draft the ${k === 'description' ? 'system description' : k === 'assertion' ? 'management assertion' : 'bridge letter'}`)))),
    h('h2', {}, 'Exchange with the firm'),
    h('div', { class: 'card' },
      h('label', { style: 'margin-top:0' }, 'Export a package', h('small', {}, 'Exactly what the requests point at, with a SHA-256 for every file. Nothing else leaves the workspace.')),
      h('div', { class: 'row', style: 'margin-top:0' }, h('div', { style: 'flex:1' }, outInput), h('button', { class: 'primary', onclick: async () => { const r = await post('/api/audit/export', { engagement: e.id, out: outInput.value }, null); if (r) notice(`Exported ${r.result.files} files.`, true); } }, 'Export')),
      h('label', {}, 'Bring in the firm\'s responses', h('small', {}, 'Messages, samples and statuses are merged; anything that changed here since the export is reported, not overwritten.')),
      h('div', { class: 'row', style: 'margin-top:0' }, h('div', { style: 'flex:1' }, retInput), h('button', { class: 'primary', onclick: async () => { const r = await post('/api/audit/import-return', { engagement: e.id, dir: retInput.value }, null); if (r) notice(`Updated ${r.result.updated.length}, added ${r.result.added.length}.${r.result.conflicts.length ? ` Kept for review: ${r.result.conflicts.join(' ')}` : ''}`, !r.result.conflicts.length); } }, 'Import'))));
}

function trustView() {
  if (detail) return questionnaireView(S.questionnaires.find((q) => q.id === detail));
  const out = h('input', { type: 'text', placeholder: 'Folder to write the site to' });
  const qfile = h('input', { type: 'file', accept: '.csv,.xlsx' });
  const qname = h('input', { type: 'text', placeholder: 'Who sent it, for example "BigCo vendor review"' });
  const t = S.trust;
  return h('div', {},
    h('h1', {}, 'Trust'),
    h('p', { class: 'lead' }, 'What you tell customers, drawn only from the workspace: a trust center you host yourself, and answers to their security questionnaires.'),
    h('div', { class: 'card' },
      h('h2', { style: 'margin-top:0' }, 'Trust center'),
      t ? h('div', {}, h('p', {}, t.headline), h('p', { class: 'muted' }, 'Publishes: ', [t.publish.categories && 'categories in scope', t.publish.report && 'audits, certifications and readiness', (t.publish.policies ?? []).length && `${t.publish.policies.length} policy titles`,
        t.publish.subprocessors && 'subprocessors', (t.publish.documents ?? []).length && `${t.publish.documents.length} documents on request`].filter(Boolean).join(', ') || 'only the headline and security contact', '. Change what is published in trust.json.'))
        : h('p', { class: 'muted' }, 'Create trust.json in the workspace to choose what the trust center publishes; nothing is published otherwise.'),
      h('div', { class: 'row' }, h('div', { style: 'flex:1' }, out), h('button', { class: 'primary', disabled: !t, onclick: async () => { const r = await post('/api/trust/build', { out: out.value }, null); if (r) notice(`Built index.html publishing ${r.result.published.join(', ') || 'the headline and contact'}. Host the folder anywhere.`, true); } }, 'Build the site'))),
    badgesCard(),
    h('div', { class: 'card' },
      h('h2', { style: 'margin-top:0' }, 'Security questionnaires'),
      h('p', { class: 'muted' }, 'Upload a CSV or Excel (.xlsx) file with a question column. Each answer is drafted by quoting the workspace records it cites; a person reviews it, and reviewed answers are reused until a fact they cite changes.'),
      h('div', { class: 'grid2' }, h('div', {}, qname), h('div', {}, qfile)),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: async () => {
        const f = qfile.files[0]; if (!f) return notice('Choose the CSV.', false);
        const r = await post('/api/questionnaire/import', { name: qname.value, filename: f.name, data: await fileToBase64(f) }, null);
        if (r) { notice(`Imported: ${r.result.fromLibrary} reused, ${r.result.drafted} drafted, ${r.result.unanswered} with nothing to draft from.`, true); go('trust', r.result.id); }
      } }, 'Import and draft')),
      S.questionnaires.length ? h('table', { style: 'margin-top:12px' }, h('tr', {}, h('th', {}, 'Questionnaire'), h('th', {}, 'Imported'), h('th', {}, 'Reviewed')),
        S.questionnaires.map((q) => h('tr', { class: 'clickable', onclick: () => go('trust', q.id) }, h('td', {}, q.name), h('td', {}, q.imported_at.slice(0, 10)), h('td', {}, `${q.questions.filter((x) => x.status === 'reviewed').length} of ${q.questions.length}`)))) : null));
}

// What the organization says about audits and certifications, as badges: a document held (green for an auditor's or
// certifying body's, blue for a self-attestation) or readiness (grey), each with the day it stops standing. The trust
// center writes them; publishing sends them to the Open Autonomy project as its "Compliance" row and README badge row.
let published = null;
function badgesCard() {
  const r = S.report;
  const tone = { positive: 'ok', info: '', neutral: '' };
  return h('div', { class: 'card' },
    h('h2', { style: 'margin-top:0' }, 'Badges'),
    documentsError(),
    h('p', { class: 'muted' }, 'What the trust center and a published statement say for each target: the document held, or readiness. A badge stands until its date and then lapses, so a claim cannot outlive its document.'),
    r ? h('table', {}, h('tr', {}, h('th', {}, 'Framework'), h('th', {}, 'Says'), h('th', {}, 'Until')),
      r.badges.map((b) => h('tr', {}, h('td', {}, b.label), h('td', {}, pill(b.message, tone[b.tone])), h('td', {}, b.until)))) : h('p', { class: 'muted' }, 'Nothing to show yet.'),
    r && r.status.length ? h('p', { class: 'muted' }, r.status.join(' ')) : null,
    h('h3', {}, 'On the Open Autonomy project'),
    S.openAutonomyKey
      ? h('div', {}, h('p', { class: 'muted' }, 'Publishing sends these badges, and the section\'s text, to the project as the owner\'s "Compliance" statement: a row on its dashboard and a badge row its README can show. Publish again when anything changes, and at least monthly while readiness is shown.'),
          h('div', { class: 'row' }, h('button', { class: 'primary', disabled: !S.trust?.publish?.report, onclick: async () => {
            const res = await post('/api/trust/publish', {}, null);
            if (res) { published = res.result; render(); notice(res.result.unchanged ? 'Published: nothing changed since the last time.' : `Published revision ${res.result.revision?.revision}.`, true); } } }, 'Publish to Open Autonomy')),
          published?.page ? h('div', {}, h('p', {}, 'It shows on ', h('a', { href: published.page, target: '_blank', rel: 'noopener' }, 'the project\'s dashboard'), published.readme ? ' under "Stated by the owner".' : ' under "Stated by the owner", to those the project lets see it.',
              published.readme ? ' To show the badge row in the project\'s README, add this line; each badge leaves it when its date passes:' : ' Its README cannot show the badge row: its badge image did not answer signed out (a README\'s images are fetched signed out), usually because the project\'s .open-autonomy/config.yaml keeps statements from the public (dashboard: visibility private, or a statements role other than public).'),
            published.readme ? h('pre', { style: 'white-space:pre-wrap;word-break:break-all' }, published.readme) : null) : null,
          S.trust?.publish?.report ? null : h('p', { class: 'muted' }, 'trust.json does not publish the audits and certifications section, so there is nothing to publish.'))
      : h('p', { class: 'muted' }, 'To publish to the Open Autonomy project, start Evidence Desk with OPEN_AUTONOMY_BASE_URL and OPEN_AUTONOMY_KEY (the project\'s steer key, kept with the workspace, never in the project) in its environment.'));
}

function questionnaireView(q) {
  if (!q) return h('p', {}, 'That questionnaire does not exist.');
  const who = personSelect('by', '', 'Who is reviewing');
  const kind = { reviewed: 'ok', draft: 'warn', 'needs-review': 'bad', unanswered: 'bad' };
  return h('div', {},
    h('a', { class: 'back', href: '#trust' }, '← Trust'),
    h('h1', {}, q.name),
    h('p', { class: 'lead' }, `${q.questions.filter((x) => x.status === 'reviewed').length} of ${q.questions.length} reviewed. Only reviewed answers are exported; drafts quote the records they cite and must be rewritten as your answer.`),
    h('div', { class: 'row', style: 'margin:0 0 16px' }, h('div', { style: 'flex:1' }, who), h('a', { class: 'secondary', href: `/questionnaire/${encodeURIComponent(q.id)}`, style: 'padding:8px 14px;border:1px solid var(--accent);border-radius:6px;text-decoration:none' }, 'Download answers (CSV)')),
    q.questions.map((x) => {
      const ta = h('textarea', { style: 'min-height:90px', value: x.answer });
      return h('div', { class: 'card' },
        h('div', {}, h('b', {}, `${x.id}. ${x.question} `), pill(x.status, kind[x.status])),
        x.sources.length ? h('div', { class: 'muted' }, 'Sources: ', x.sources.map((s, i) => [i ? ', ' : '', h('a', { href: `/files/${encodeURIComponent(s.path)}`, target: '_blank' }, s.path)])) : null,
        ta,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => { if (!who.value) return notice('Choose who is reviewing.', false); post('/api/questionnaire/answer', { id: q.id, version: q.version, question: x.id, answer: ta.value, by: who.value }, `Question ${x.id} reviewed.`); } }, 'Save as reviewed')));
    }));
}

load();
