#!/usr/bin/env bun
// The evidence-desk command. Each subcommand reads the workspace fresh, calls one action and prints the result,
// as text for people or as JSON with --json for scripts and agents.
import { resolve } from 'node:path';
import { addEvidence, adopt, approvePolicy, initWorkspace, saveRegisterRow, setPolicyOwner, setScope, unanswered, updateControl } from './actions.ts';
import { computeGaps } from './gaps.ts';
import { readVersioned } from './files.ts';
import { loadWorkspace, REGISTERS, type RegisterName } from './workspace.ts';
import { questions } from './catalog.ts';
import { serve } from './server.ts';

const USAGE = `evidence-desk <command> <workspace> [options]

  init <dir> --org <name>                 create a workspace in a new or empty folder
  scope <dir> [--set key=value ...]       show or answer the scoping questions (booleans: true/false)
  adopt <dir>                             create the controls and policies the scope calls for
  controls <dir>                          list controls with owner, status and applicability
  control <dir> <id> [--owner <person>] [--status not-started|in-progress|implemented]
                     [--notes <text>] [--exclude <reason>] [--include]
  policies <dir>                          list policies and their approved versions
  policy <dir> <id> [--owner <person>] [--approve --by <person>]
  register <dir> <people|systems|vendors|risks> [--add key=value ...] [--update <id> key=value ...]
  evidence <dir> [--add --control <id>[,<id>] --file <path> --title <text> --by <person>
                 [--period <start>..<end>] [--source <kind>] [--source-name <name>] [--query <text>]]
  gaps <dir> [--as-of YYYY-MM-DD]         what stands between the workspace and readiness
  validate <dir>                          check every file against its schema and references
  serve <dir> [--port <n>]                open the local app on 127.0.0.1

  --json   print JSON instead of text`;

type Args = { pos: string[]; flags: Map<string, string[]> };
function parse(argv: string[]): Args {
  const pos: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    const vals = flags.get(key) ?? [];
    if (['set', 'add', 'update'].includes(key)) {
      while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) vals.push(argv[++i]);
    } else if (!['json', 'approve', 'include', 'help'].includes(key)) {
      if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
      vals.push(argv[++i]);
    }
    flags.set(key, vals);
  }
  return { pos, flags };
}
const one = (a: Args, k: string): string | undefined => a.flags.get(k)?.at(-1);
const pairs = (vals: string[]): Record<string, string> => Object.fromEntries(vals.map((v) => {
  const i = v.indexOf('=');
  if (i < 1) throw new Error(`${v} is not key=value`);
  return [v.slice(0, i), v.slice(i + 1)];
}));

function out(json: boolean, data: unknown, text: () => string): void {
  console.log(json ? JSON.stringify(data, null, 2) : text());
}

function main(argv: string[]): number {
  const a = parse(argv);
  const [cmd, dirArg, ...rest] = a.pos;
  if (!cmd || a.flags.has('help')) { console.log(USAGE); return cmd ? 0 : 2; }
  if (!dirArg) throw new Error(`${cmd} needs a workspace folder\n\n${USAGE}`);
  const dir = resolve(dirArg);
  const json = a.flags.has('json');

  switch (cmd) {
    case 'init': {
      const org = one(a, 'org');
      if (!org) throw new Error('init needs --org <name>');
      initWorkspace(dir, org);
      out(json, { created: dir }, () => `Created a workspace for ${org} in ${dir}.\nNext: evidence-desk scope ${dirArg} --set key=value ... (run it without --set to see the questions)`);
      return 0;
    }
    case 'scope': {
      const sets = a.flags.get('set');
      if (sets) {
        const cur = readVersioned(dir, 'scope.json');
        if (!cur) throw new Error('scope.json is missing');
        const answers: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(pairs(sets))) {
          const q = questions.find((x) => x.id === k);
          answers[k] = q?.type === 'boolean' ? (v === 'true' ? true : v === 'false' ? false : v) : v;
        }
        setScope(dir, answers, cur.version);
      }
      const ws = loadWorkspace(dir);
      const answers = ws.scope?.data.answers ?? {};
      const left = ws.scope ? unanswered(ws.scope.data) : questions.map((q) => q.id);
      out(json, { answers, unanswered: left }, () => questions.map((q) =>
        `${q.id.padEnd(27)} ${answers[q.id] === undefined || answers[q.id] === '' ? '(unanswered)' : JSON.stringify(answers[q.id])}\n${''.padEnd(28)}${q.prompt}`).join('\n') +
        (left.length ? `\n\n${left.length} required question(s) unanswered.` : `\n\nAll questions answered. Next: evidence-desk adopt ${dirArg}`));
      return 0;
    }
    case 'adopt': {
      const r = adopt(dir);
      out(json, r, () => `Controls created: ${r.created.length}. Applicability changed: ${r.changed.length}${r.changed.length ? ` (${r.changed.join(', ')})` : ''}. Policies created: ${r.policies.length}.`);
      return 0;
    }
    case 'controls': {
      const ws = loadWorkspace(dir);
      const rows = ws.controls.map((c) => c.data);
      out(json, rows, () => rows.map((c) => `${c.id.padEnd(9)} ${(c.applicable ? c.status : 'excluded').padEnd(12)} ${(c.owner || '-').padEnd(12)} ${c.title}`).join('\n') || 'No controls yet.');
      return 0;
    }
    case 'control': {
      const id = rest[0];
      if (!id) throw new Error('control needs an id');
      const rel = `controls/${id}.json`;
      const cur = readVersioned(dir, rel);
      if (!cur) throw new Error(`${rel} does not exist`);
      const patch: Record<string, unknown> = {};
      for (const k of ['owner', 'status', 'notes']) if (a.flags.has(k)) patch[k] = one(a, k);
      if (a.flags.has('exclude')) { patch.applicable = false; patch.exclusion_reason = one(a, 'exclude'); }
      if (a.flags.has('include')) patch.applicable = true;
      if (Object.keys(patch).length) updateControl(dir, id, patch, cur.version);
      const c = JSON.parse(readVersioned(dir, rel)!.text);
      out(json, c, () => JSON.stringify(c, null, 2));
      return 0;
    }
    case 'policies': {
      const ws = loadWorkspace(dir);
      const rows = ws.policies.map((p) => ({ id: p.data.id, title: p.data.title, owner: p.data.owner, approved: p.data.versions.at(-1) ?? null,
        changed_since_approval: !!p.data.versions.length && p.text?.version !== p.data.versions.at(-1)!.sha256 }));
      out(json, rows, () => rows.map((p) => `${p.id.padEnd(26)} ${(p.owner || '-').padEnd(12)} ${p.approved ? `v${p.approved.version} by ${p.approved.approved_by}${p.changed_since_approval ? ' (edited since)' : ''}` : 'not approved'}`).join('\n'));
      return 0;
    }
    case 'policy': {
      const id = rest[0];
      if (!id) throw new Error('policy needs an id');
      if (a.flags.has('owner')) setPolicyOwner(dir, id, one(a, 'owner')!, readVersioned(dir, `policies/${id}.json`)!.version);
      if (a.flags.has('approve')) {
        const by = one(a, 'by');
        if (!by) throw new Error('--approve needs --by <person>');
        const text = readVersioned(dir, `policies/${id}.md`);
        const rec = readVersioned(dir, `policies/${id}.json`);
        if (!text || !rec) throw new Error(`policy ${id} does not exist`);
        const v = approvePolicy(dir, id, by, text.version, rec.version);
        out(json, { id, version: v }, () => `Approved ${id} version ${v} (text sha256 ${text.version}).`);
        return 0;
      }
      const rec = readVersioned(dir, `policies/${id}.json`);
      if (!rec) throw new Error(`policy ${id} does not exist`);
      out(json, JSON.parse(rec.text), () => rec.text.trim());
      return 0;
    }
    case 'register': {
      const name = rest[0] as RegisterName;
      if (!REGISTERS.includes(name)) throw new Error(`register needs one of: ${REGISTERS.join(', ')}`);
      const version = () => readVersioned(dir, `registers/${name}.csv`)!.version;
      if (a.flags.has('add')) saveRegisterRow(dir, name, pairs(a.flags.get('add')!), version());
      if (a.flags.has('update')) {
        const [target, ...kv] = a.flags.get('update')!;
        const ws = loadWorkspace(dir);
        const row = ws.registers[name]?.data.rows.find((r) => r.id === target);
        if (!row) throw new Error(`${target} is not in registers/${name}.csv`);
        saveRegisterRow(dir, name, { ...row, ...pairs(kv) }, version(), target);
      }
      const t = loadWorkspace(dir).registers[name];
      out(json, t?.data.rows ?? [], () => t ? [t.data.columns.join(' | '), ...t.data.rows.map((r) => t.data.columns.map((c) => r[c]).join(' | '))].join('\n') : 'unreadable');
      return 0;
    }
    case 'evidence': {
      if (a.flags.has('add')) {
        const period = one(a, 'period');
        const [start, end] = period ? period.split('..') : [];
        if (period && (!start || !end)) throw new Error('--period is <start>..<end>, for example 2026-07-01..2026-09-30');
        const kind = one(a, 'source') ?? 'manual';
        const id = addEvidence(dir, {
          title: one(a, 'title') ?? '', controls: (one(a, 'control') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
          files: a.flags.get('file') ?? [], recorded_by: one(a, 'by') ?? '', period: period ? { start, end } : undefined,
          source: { kind, ...(one(a, 'source-name') ? { name: one(a, 'source-name') } : {}), ...(one(a, 'query') ? { query: one(a, 'query') } : {}) },
          notes: one(a, 'notes'),
        });
        out(json, { id }, () => `Recorded ${id}.`);
        return 0;
      }
      const ws = loadWorkspace(dir);
      const rows = ws.evidence.map((e) => e.data);
      out(json, rows, () => rows.map((e) => `${e.id}  ${e.collected_at.slice(0, 10)}  ${e.controls.join(',').padEnd(16)} ${e.title}`).join('\n') || 'No evidence recorded.');
      return 0;
    }
    case 'gaps': {
      const asOf = one(a, 'as-of');
      const g = computeGaps(loadWorkspace(dir), asOf ? new Date(`${asOf}T23:59:59Z`) : new Date());
      out(json, g, () => {
        const s = g.summary;
        const lines = [`As of ${g.as_of}: ${s.controls_ready}/${s.controls_applicable} controls ready (${s.controls_excluded} excluded), ${s.criteria_ready}/${s.criteria_in_scope} criteria ready.`];
        if (g.program.length) lines.push('', 'Program:', ...g.program.map((x) => `  - ${x}`));
        for (const c of g.controls.filter((c) => c.gaps.length)) lines.push('', `${c.id} ${c.title}:`, ...c.gaps.map((x) => `  - ${x}`));
        return lines.join('\n');
      });
      return 0;
    }
    case 'validate': {
      const ws = loadWorkspace(dir);
      const errors = ws.problems.filter((p) => p.severity === 'error');
      out(json, ws.problems, () => ws.problems.length ? ws.problems.map((p) => `${p.severity}: ${p.file}: ${p.message}`).join('\n') : 'Valid.');
      return errors.length ? 1 : 0;
    }
    case 'serve': {
      loadWorkspace(dir);
      serve(dir, Number(one(a, 'port') ?? 4870));
      return -1;
    }
    default:
      throw new Error(`unknown command ${cmd}\n\n${USAGE}`);
  }
}

try {
  const code = main(process.argv.slice(2));
  if (code >= 0) process.exit(code);
} catch (e) {
  console.error(`evidence-desk: ${(e as Error).message}`);
  process.exit(1);
}
