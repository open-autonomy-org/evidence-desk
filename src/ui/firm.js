// The firm's pages: a dashboard of client engagements, and the response page for one received audit package.
// Everything shown comes from the files; the firm's responses are written into the package's request files.
const page = document.body.dataset.page;
let S = null;
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === undefined || v === null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'value') el.value = v; else el.setAttribute(k, v === true ? '' : String(v)); }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const pill = (t, k = '') => h('span', { class: `pill ${k}` }, t);
const notice = (t, ok) => { const n = document.getElementById('notice'); n.textContent = t; n.className = ok ? 'ok' : 'bad'; n.hidden = false; };
async function load() { S = await (await fetch('/api/state')).json(); render(); }

function render() {
  const view = document.getElementById('view');
  if (page === 'firm') {
    view.replaceChildren(h('div', {}, h('h1', {}, S.firm), h('p', { class: 'lead' }, 'Each client\'s workspace is read separately; nothing from one client appears beside another\'s records.'),
      S.clients.map((c) => h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, c.name, c.organization ? h('span', { class: 'source' }, ` · ${c.organization}`) : null),
        c.error ? h('p', {}, pill('cannot be read', 'bad'), ' ', c.error) : [h('p', { class: 'muted' }, c.readiness),
          c.engagements.length ? h('table', {}, h('tr', {}, h('th', {}, 'Engagement'), h('th', {}, 'Period'), h('th', {}, 'Status'), h('th', {}, 'Requests'), h('th', {}, 'Exceptions')),
            c.engagements.map((e) => h('tr', {}, h('td', {}, `${e.id} (${e.type})`), h('td', {}, e.period), h('td', {}, e.status), h('td', {}, Object.entries(e.requests).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'), h('td', {}, e.exceptions ? pill(String(e.exceptions), 'bad') : '0'))))
            : h('p', { class: 'muted' }, 'No engagement.')]))));
    return;
  }
  const e = S.engagement;
  const by = h('input', { type: 'text', placeholder: 'Your name and firm' });
  view.replaceChildren(h('div', {},
    h('h1', {}, `${S.organization}: engagement ${e.id}`),
    h('p', { class: 'lead' }, `${e.type === 'type1' ? `Type 1 as of ${e.as_of}` : `Type 2, ${e.period.start} to ${e.period.end}`} · package created ${S.created_at.slice(0, 10)} · `,
      S.verification.ok ? pill('every file matches its hash', 'ok') : pill(`${S.verification.problems.length} file(s) differ from the manifest`, 'warn')),
    !S.verification.ok ? h('div', { class: 'card' }, h('ul', { class: 'gaps' }, S.verification.problems.map((p) => h('li', {}, p))), h('p', { class: 'muted' }, 'Request files change as you respond; any other difference means a file changed after the client exported it.')) : null,
    h('div', { class: 'card' }, h('label', { style: 'margin-top:0' }, 'Responding as'), by),
    S.drafts.length ? h('div', { class: 'card' }, h('b', {}, 'Drafts from the client: '), S.drafts.map((d, i) => [i ? ', ' : '', h('a', { href: `/files/${encodeURIComponent(d)}`, target: '_blank' }, d.split('/').pop())])) : null,
    S.requests.map((r) => {
      const text = h('input', { type: 'text', placeholder: 'Message to the client' });
      const act = async (extra) => {
        if (!by.value.trim()) return notice('Enter your name first.', false);
        const res = await fetch('/api/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, version: r.version, by: by.value, text: text.value, ...extra }) });
        const j = await res.json();
        if (!res.ok) { notice(`Not saved: ${j.error}`, false); if (j.conflict) load(); return; }
        const name = by.value; S = j.state; render(); document.querySelector('input[placeholder="Your name and firm"]').value = name; notice(`${r.id} saved.`, true);
      };
      const ev = (id) => S.evidence[id] ? h('div', {}, `${id}: ${S.evidence[id].title} `, S.evidence[id].files.map((f) => h('a', { href: `/files/${encodeURIComponent(f)}`, target: '_blank', style: 'margin-right:8px' }, f.split('/').pop())), S.evidence[id].source?.query ? h('div', { class: 'muted' }, `Produced by: ${S.evidence[id].source.query}`) : null) : h('div', {}, id);
      const pick = h('input', { type: 'text', placeholder: 'Items to sample, comma-separated' });
      return h('div', { class: 'card' },
        h('h2', { style: 'margin-top:0' }, `${r.id}: ${r.title} `, pill(r.status, r.status === 'accepted' ? 'ok' : r.status === 'returned' ? 'bad' : r.status === 'submitted' ? '' : 'warn')),
        r.population ? h('div', {}, h('b', {}, 'Population: '), ev(r.population)) : null,
        r.evidence.length ? h('div', {}, h('b', {}, 'Evidence: '), r.evidence.map(ev)) : null,
        r.kind === 'sample' ? h('div', {}, h('b', {}, 'Samples: '), (r.samples ?? []).map((sm) => h('span', { style: 'margin-right:6px' }, pill(`${sm.item}: ${sm.status}`, sm.status === 'exception' ? 'bad' : sm.status === 'provided' ? 'ok' : 'warn'),
          sm.status !== 'exception' ? h('button', { class: 'secondary', style: 'margin-left:4px;padding:2px 8px', onclick: () => act({ exception: { item: sm.item, note: text.value || undefined } }) }, 'Exception') : null)),
          r.population ? h('div', { class: 'row' }, h('div', { style: 'flex:1' }, pick), h('button', { class: 'secondary', onclick: () => act({ select: pick.value.split(',').map((x) => x.trim()).filter(Boolean) }) }, 'Select samples')) : null) : null,
        h('table', { style: 'margin-top:8px' }, r.thread.map((m) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, m.at.slice(0, 16).replace('T', ' ')), h('td', {}, pill(m.side)), h('td', {}, m.by), h('td', {}, m.text)))),
        h('div', { class: 'row' }, h('div', { style: 'flex:1' }, text),
          h('button', { class: 'secondary', onclick: () => act({}) }, 'Send message'), h('button', { class: 'secondary', onclick: () => act({ status: 'returned' }) }, 'Return'), h('button', { class: 'primary', onclick: () => act({ status: 'accepted' }) }, 'Accept')));
    }),
    h('p', { class: 'muted' }, 'When you are done, send this folder back to the client. Each file listed in manifest.json keeps its hash; the request files are where your responses live.')));
}
load();
