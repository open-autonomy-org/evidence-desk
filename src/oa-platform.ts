// What an Open Autonomy project's agents did in a period, read from the platform that meters and publishes them: every
// session, every metered call, every request and report of the operating state (who paused the agent, why, and what it
// answered), and every revision of the roadmap. Each is a population of the period, collected through the platform's own
// read doors on the project's own key or its org's (so a private project reads too, and no figure is withheld), with the platform's
// answers kept whole as provenance. They evidence the AI family's records, limits, oversight and change controls while
// an AI framework needs them. All four lists are read before anything is written, so a failure records nothing.
import { writeVersioned } from './files.ts';
import { writeCsv } from './csv.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { neededControls } from './targets.ts';
import { now } from './clock.ts';

type Answer = { url: string; status: number; body: unknown };

async function get(base: string, key: string, path: string, answers: Answer[]): Promise<Record<string, unknown>> {
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  answers.push({ url: path, status: res.status, body });
  if (res.status !== 200) throw new Error(`GET ${path} answered ${res.status} ${JSON.stringify(body.error ?? '')}`);
  return body;
}

// Every page of one list, newest first, until `enough` holds for what has been read (by default, once an item predates
// `start`). The limit is the platform's maximum for the list, so a full page with no cursor means the platform cannot
// page it and a population read from it could be incomplete: refused, never guessed.
async function pages<T>(base: string, key: string, path: string, field: string, limit: number, at: (x: T) => string, start: string, answers: Answer[], enough?: (all: T[]) => boolean): Promise<{ items: T[]; pages: number }> {
  const out: T[] = [];
  let before: string | undefined;
  for (let n = 1; ; n++) {
    const body = await get(base, key, `${path}?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`, answers);
    const items = (body[field] ?? []) as T[];
    const next = typeof body.next === 'string' ? body.next : undefined;
    out.push(...items);
    if (items.length === limit && !next) throw new Error(`${path} returned a full page and no cursor: this platform cannot page it, so the period's population cannot be shown complete (it needs the paging of Open Autonomy's ADR 0003 amendment)`);
    if (!next || (enough ? enough(out) : items.some((x) => at(x) < start))) return { items: out, pages: n };
    before = next;
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function collectOpenAutonomyActivity(root: string, input: { account: string; start: string; end: string; by: string }): Promise<{ evidence: string[]; counts: Record<string, number> }> {
  const base = (process.env.OPEN_AUTONOMY_BASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.OPEN_AUTONOMY_KEY ?? '';
  if (!base || !key) throw new Error('collecting from Open Autonomy needs OPEN_AUTONOMY_BASE_URL (the platform, ending in /v1) and OPEN_AUTONOMY_KEY (a key of the project) in the environment');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(input.account)) throw new Error('--account is the project, owner/name');
  if (!DAY.test(input.start) || !DAY.test(input.end) || input.start > input.end) throw new Error('collect needs --period <start>..<end>, two dates in order');
  const ws = loadWorkspace(root);
  if (!(ws.registers.people?.data.rows ?? []).some((r) => r.id === input.by)) throw new Error(`${input.by || '(none)'} is not in registers/people.csv`);
  const needed = neededControls(ws);
  if (!['AI-03', 'AI-05', 'AI-07', 'AI-10'].some((c) => needed.has(c))) throw new Error('no targeted framework needs what this collects (the AI family): target iso42001 or aiuc1 first');
  const acct = `/accounts/${encodeURIComponent(input.account)}`;
  // Timestamps are UTC ISO strings: the period runs from the start day's first instant to the end day's last.
  const from = `${input.start}T00:00:00.000Z`, to = `${input.end}T23:59:59.999Z`;
  const inPeriod = (t: string) => t >= from && t <= to;

  // Who is reading: the project's own key, or its org's (ADR 0010: an org's key reads its projects as their own does), reads
  // every panel and every figure. Any other key reads the public's view, with panels closed and money withheld, and its
  // populations could not be shown complete.
  const identity: Answer[] = [];
  const me = await get(base, key, '/keys', identity);
  const reader = String(me.account ?? '').toLowerCase();
  if (reader !== input.account.toLowerCase() && reader !== `@${input.account.split('/')[0].toLowerCase()}`) throw new Error(`OPEN_AUTONOMY_KEY is a key of ${String(me.account ?? 'no account')}, which reads ${input.account} only as the public does: collect with the project's own key or its org's`);

  // Sessions that ran in the period: started in it, or started up to a day before it and not ended before it began. A
  // run that began more than a day before the period is not read.
  const reachBack = new Date(Date.parse(from) - 864e5).toISOString();
  type Session = { key: string; kind: string; source?: string; item_id?: string; started_at: string; ended_at?: string; status: string; outcome?: string; model_provider?: string; turn_count: number; tool_calls: number; calls: number; usd_cents?: number; commit_sha?: string; report?: string };
  const sA: Answer[] = [];
  const s = await pages<Session>(base, key, `${acct}/sessions`, 'sessions', 100, (x) => x.started_at, reachBack, sA);
  const sessions = s.items.filter((x) => x.started_at <= to && (x.started_at >= from || (x.started_at >= reachBack && (!x.ended_at || x.ended_at >= from))));

  type Call = { ts: string; request_id: string; rail: string; session?: string; model?: string; route?: string; item?: string; input_tokens?: number; output_tokens?: number; usd_cents?: number; outcome?: string; merchant?: string; category?: string; partner?: string; unit?: string; quantity?: number; reference?: string };
  const cA: Answer[] = [];
  const c = await pages<Call>(base, key, `${acct}/calls`, 'calls', 200, (x) => x.ts, from, cA);
  const calls = c.items.filter((x) => inPeriod(x.ts));

  // The operating state's history, with the words in force when the period began: the project's latest request, its
  // org's latest (the project is paused if either is, ADR 0010), and the automation's latest report.
  type Control = { kind: string; state: string; at: string; by?: string; reason?: string; note?: string; from?: string; unchanged?: boolean; backfilled?: boolean };
  const hA: Answer[] = [];
  const kinds: ((x: Control) => boolean)[] = [(x) => x.kind === 'request' && !x.from, (x) => x.kind === 'request' && !!x.from, (x) => x.kind === 'report'];
  const h = await pages<Control>(base, key, `${acct}/state/history`, 'history', 200, (x) => x.at, from, hA, (all) => kinds.every((is) => all.some((x) => is(x) && x.at < from)));
  const earlier = h.items.filter((x) => x.at < from);
  const inForce = kinds.map((is) => earlier.filter(is).sort((a, b) => b.at.localeCompare(a.at))[0]).filter(Boolean).map((x) => ({ ...x, in_force_at_start: 'yes' }));
  const control = [...inForce, ...h.items.filter((x) => inPeriod(x.at))].sort((a, b) => a.at.localeCompare(b.at));

  type Revision = { revision: number; ts: string; source: string; by?: string; changes?: unknown[] };
  const rA: Answer[] = [];
  const r = await pages<Revision>(base, key, `${acct}/roadmap/revisions`, 'revisions', 100, (x) => x.ts, from, rA);
  const revisions = r.items.filter((x) => inPeriod(x.ts));

  // Everything is read; now the records.
  const tag = `${input.account.replace('/', '-')}-${input.start}-${input.end}-${Date.now()}`;
  const evidence: string[] = [];
  const counts: Record<string, number> = {};
  const cell = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const population = (name: string, title: string, controls: string[], path: string, columns: string[], rows: Record<string, unknown>[], answers: Answer[], pagesRead: number, notes: string) => {
    counts[name] = rows.length;
    const use = controls.filter((x) => needed.has(x));
    if (!use.length) return;
    const stem = `evidence/files/populations/open-autonomy-${name}-${tag}`;
    writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: base, collected_at: now(), read_as: String(me.account), requests: [...identity, ...answers] } }, null, 2) + '\n', null);
    writeVersioned(root, `${stem}.csv`, writeCsv({ columns, rows: rows.map((row) => Object.fromEntries(columns.map((k) => [k, cell(row[k])]))) }), null);
    evidence.push(addEvidence(root, {
      title: `Population: ${rows.length} ${title} of ${input.account}, ${input.start} to ${input.end}`, controls: use, files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
      period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'open autonomy', query: `GET ${path}, ${pagesRead} page(s), newest first, back past the period's start, on the key of ${String(me.account)}` },
      notes: `${notes} The platform's answers, every page whole, are in ${stem}.raw.json.`,
    }));
  };
  population('sessions', 'agent sessions', ['AI-05'], `${acct}/sessions`, ['key', 'kind', 'source', 'item_id', 'started_at', 'ended_at', 'status', 'outcome', 'model_provider', 'turn_count', 'tool_calls', 'calls', 'usd_cents', 'commit_sha', 'report'], sessions, sA, s.pages,
    'Complete for sessions that started in the period, or up to a day before it and still running when it began: the platform lists every session the project published by start time, and every page back to a day before the period was read.');
  population('calls', 'metered calls', ['AI-05', 'AI-10'], `${acct}/calls`, ['ts', 'request_id', 'rail', 'session', 'model', 'route', 'item', 'input_tokens', 'output_tokens', 'usd_cents', 'outcome', 'merchant', 'category', 'partner', 'unit', 'quantity', 'reference'], calls, cA, c.pages,
    'Complete: the platform meters every model call, card and partner charge on the project\'s account, and every page back past the period\'s start was read. A call the platform refused carries its outcome.');
  population('oversight', 'requests and reports of the agent\'s operating state', ['AI-03'], `${acct}/state/history`, ['at', 'kind', 'state', 'by', 'from', 'reason', 'note', 'unchanged', 'backfilled', 'in_force_at_start'], control, hA, h.pages,
    'Complete: the platform keeps every request of the owner\'s word (who, when, why; an org\'s marked from the org, which governs the project with its own: paused if either is) and every change of state the automation reported, and the history was read back until the project\'s request, the org\'s and the report in force when the period began were in hand (marked in_force_at_start). A record marked backfilled was already true when the platform began keeping the history.');
  population('roadmap-revisions', 'roadmap revisions', ['AI-07'], `${acct}/roadmap/revisions`, ['revision', 'ts', 'source', 'by', 'changes'], revisions, rA, r.pages,
    'Complete: the platform keeps every revision of the project\'s roadmap, and every page back past the period\'s start was read. Each row carries the revision\'s changes; the whole roadmap of each revision is in the raw answers.');
  return { evidence, counts };
}
