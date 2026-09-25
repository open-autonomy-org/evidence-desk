// What an Open Autonomy project's agents did in a period, read from the platform that meters and publishes them: every
// session, every metered call, every request and report of the operating state (who paused the agent, why, and what it
// answered), and every revision of the roadmap. Each is a population of the period, collected through the platform's own
// read doors on the project's key (so a project whose page is private reads too), with the answers kept as provenance.
// They evidence the AI family's records, limits, oversight and change controls while an AI framework needs them.
import { writeVersioned } from './files.ts';
import { writeCsv } from './csv.ts';
import { addEvidence } from './actions.ts';
import { loadWorkspace } from './workspace.ts';
import { neededControls } from './targets.ts';
import { now } from './clock.ts';

type Answer = { url: string; status: number; items: number; next?: string };

// Every page of one list, newest first, until it reaches before the period. A full page with no cursor means the
// platform cannot page this list, and a population read from it could be incomplete: refused, never guessed.
// `enough` says when what is read reaches far enough back; by default, once any item predates the period.
async function pages<T>(base: string, key: string, path: string, field: string, limit: number, at: (x: T) => string, start: string, answers: Answer[], enough?: (all: T[]) => boolean): Promise<T[]> {
  const out: T[] = [];
  let before: string | undefined;
  for (;;) {
    const url = `${base}${path}${path.includes('?') ? '&' : '?'}limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.status !== 200) throw new Error(`GET ${url.replace(base, '')} answered ${res.status} ${JSON.stringify(body.error ?? '')}`);
    const items = (body[field] ?? []) as T[];
    const next = typeof body.next === 'string' ? body.next : undefined;
    answers.push({ url: url.replace(base, ''), status: res.status, items: items.length, ...(next ? { next } : {}) });
    out.push(...items);
    if (items.length === limit && !next) throw new Error(`${path} returned a full page and no cursor: this platform cannot page it, so the period's population cannot be shown complete (it needs the paging of Open Autonomy's ADR 0003 amendment)`);
    if (!next || (enough ? enough(out) : items.some((x) => at(x).slice(0, 10) < start))) return out;
    before = next;
  }
}

export async function collectOpenAutonomyActivity(root: string, input: { account: string; start: string; end: string; by: string }): Promise<{ evidence: string[]; counts: Record<string, number> }> {
  const base = (process.env.OPEN_AUTONOMY_BASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.OPEN_AUTONOMY_KEY ?? '';
  if (!base || !key) throw new Error('collecting from Open Autonomy needs OPEN_AUTONOMY_BASE_URL (the platform, ending in /v1) and OPEN_AUTONOMY_KEY (a key of the project) in the environment');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(input.account)) throw new Error('--account is the project, owner/name');
  const ws = loadWorkspace(root);
  const needed = neededControls(ws);
  const wanted = ['AI-03', 'AI-05', 'AI-07', 'AI-10'].filter((c) => needed.has(c));
  if (!wanted.length) throw new Error('no targeted framework needs what this collects (the AI family): target iso42001 or aiuc1 first');
  const acct = `/accounts/${encodeURIComponent(input.account)}`;
  const inPeriod = (t: string) => t.slice(0, 10) >= input.start && t.slice(0, 10) <= input.end;
  const tag = `${input.account.replace('/', '-')}-${input.start}-${input.end}-${Date.now()}`;
  const evidence: string[] = [];
  const counts: Record<string, number> = {};

  const population = (name: string, title: string, controls: string[], path: string, columns: string[], rows: Record<string, unknown>[], answers: Answer[], notes: string) => {
    const use = controls.filter((c) => needed.has(c));
    counts[name] = rows.length;
    if (!use.length) return;
    const stem = `evidence/files/populations/open-autonomy-${name}-${tag}`;
    writeVersioned(root, `${stem}.raw.json`, JSON.stringify({ provenance: { api: base, collected_at: now(), requests: answers } }, null, 2) + '\n', null);
    writeVersioned(root, `${stem}.csv`, writeCsv({ columns, rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] === undefined || r[c] === null ? '' : String(r[c])]))) }), null);
    evidence.push(addEvidence(root, {
      title: `Population: ${rows.length} ${title} of ${input.account}, ${input.start} to ${input.end}`, controls: use, files: [`${stem}.csv`, `${stem}.raw.json`], recorded_by: input.by,
      period: { start: input.start, end: input.end }, source: { kind: 'collector', name: 'open autonomy', query: `${path} (every page, newest first, back past ${input.start})` }, notes,
    }));
  };

  let answers: Answer[] = [];
  type Session = { key: string; kind: string; source?: string; item_id?: string; started_at: string; ended_at?: string; status: string; outcome?: string; model_provider?: string; turn_count: number; tool_calls: number; calls: number; usd_cents?: number; commit_sha?: string };
  const sessions = (await pages<Session>(base, key, `${acct}/sessions`, 'sessions', 100, (x) => x.started_at, input.start, answers)).filter((x) => inPeriod(x.started_at));
  population('sessions', 'agent sessions', ['AI-05'], `${acct}/sessions`, ['key', 'kind', 'source', 'item_id', 'started_at', 'ended_at', 'status', 'outcome', 'model_provider', 'turn_count', 'tool_calls', 'calls', 'usd_cents', 'commit_sha'], sessions, answers,
    'Every session the project published that started in the period: runs of its schedule and conversations, with their outcome, calls and cost as the platform metered them.');

  answers = [];
  type Call = { ts: string; request_id: string; rail: string; session?: string; model?: string; item?: string; input_tokens?: number; output_tokens?: number; usd_cents?: number; outcome?: string; merchant?: string; partner?: string };
  const calls = (await pages<Call>(base, key, `${acct}/calls`, 'calls', 200, (x) => x.ts, input.start, answers)).filter((x) => inPeriod(x.ts));
  population('calls', 'metered calls', ['AI-05', 'AI-10'], `${acct}/calls`, ['ts', 'request_id', 'rail', 'session', 'model', 'item', 'input_tokens', 'output_tokens', 'usd_cents', 'outcome', 'merchant', 'partner'], calls, answers,
    'Every call the platform metered for the project in the period (model calls, cards, partner charges), each within the limits the owner set; a call refused at a limit carries its outcome.');

  answers = [];
  type Control = { kind: string; state: string; at: string; by?: string; reason?: string; note?: string; from?: string; unchanged?: boolean; backfilled?: boolean };
  // Back until a request and a report before the period are both in hand, or the history ends.
  const before = (all: Control[], k: string) => all.some((x) => x.kind === k && x.at.slice(0, 10) < input.start);
  const history = await pages<Control>(base, key, `${acct}/state/history`, 'history', 200, (x) => x.at, input.start, answers, (all) => before(all, 'request') && before(all, 'report'));
  // The word in force when the period began: the latest request and the latest report before it.
  const earlier = history.filter((x) => x.at.slice(0, 10) < input.start);
  const inForce = ['request', 'report'].map((k) => earlier.filter((x) => x.kind === k).sort((a, b) => b.at.localeCompare(a.at))[0]).filter(Boolean).map((x) => ({ ...x, in_force_at_start: 'yes' }));
  const control = [...inForce, ...history.filter((x) => inPeriod(x.at))].sort((a, b) => a.at.localeCompare(b.at));
  population('oversight', 'requests and reports of the agent\'s operating state', ['AI-03'], `${acct}/state/history`, ['at', 'kind', 'state', 'by', 'from', 'reason', 'note', 'unchanged', 'backfilled', 'in_force_at_start'], control, answers,
    'Every request of the owner\'s word (running or paused: who, when, why; an org\'s marked from the org) and every change of state the automation reported in the period, with the request and report in force when it began. A record marked backfilled was already true when the platform began keeping the history.');

  answers = [];
  type Revision = { revision: number; ts: string; source: string; by?: string; changes?: unknown[] };
  const revisions = (await pages<Revision>(base, key, `${acct}/roadmap/revisions`, 'revisions', 100, (x) => x.ts, input.start, answers)).filter((x) => inPeriod(x.ts));
  population('roadmap-revisions', 'roadmap revisions', ['AI-07'], `${acct}/roadmap/revisions`, ['revision', 'ts', 'source', 'by', 'changes'], revisions.map((r) => ({ ...r, changes: (r.changes ?? []).length })), answers,
    'Every revision of the project\'s roadmap in the period: what the agent was set to work on, when it changed, from which source and by whom.');

  return { evidence, counts };
}
