// The firm's own read of the populations. The collectors run again, with the firm's read-only GitHub and Cloudflare
// tokens, against a scratch copy of the package's workspace (they need its registers and roster), and each population
// is compared row by row with the one the client packaged: a row the client left out, a row that is not there to be
// read, or a row whose fields differ. Nothing is written into the package.
import { appendFileSync, cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCsv } from './csv.ts';
import { inside } from './files.ts';
import { collectChanges, collectDeployments } from './github.ts';
import { collectCloudflareChanges, collectCloudflareTokens, collectWorkerDeployments } from './cloudflare.ts';

export type Recollection = { population: string; packaged_file: string; packaged: number; recollected: number; only_packaged: string[]; only_recollected: string[]; differing: string[] };

// Each population by its file stem, and the column that identifies a row in it.
const POPULATIONS: { stem: string; key: (r: Record<string, string>) => string }[] = [
  { stem: 'github-changes', key: (r) => r.number ? `#${r.number}` : r.commit },
  { stem: 'github-deployments', key: (r) => r.id },
  { stem: 'cloudflare-worker-deployments', key: (r) => r.deployment },
  { stem: 'cloudflare-changes', key: (r) => r.id },
  { stem: 'cloudflare-tokens', key: (r) => r.token },
];

const newest = (dir: string, stem: string, not?: string) => existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${stem}-`) && f.endsWith('.csv') && f !== not).sort().at(-1) : undefined;

export async function recollect(pkg: string, input: { repo?: string; environment?: string; account?: string; script?: string }): Promise<Recollection[]> {
  const ws = join(pkg, 'workspace');
  if (lstatSync(ws).isSymbolicLink()) throw new Error(`${ws} is a link, not the package's workspace folder`);
  const audits = readdirSync(join(ws, 'audits'));
  // Read from the package only as regular files inside it: a link is not followed.
  const own = (rel: string) => { const f = inside(ws, rel); if (!lstatSync(f).isFile()) throw new Error(`${rel} is not a regular file in the package`); return f; };
  const e = JSON.parse(readFileSync(own(`audits/${audits[0]}/engagement.json`), 'utf8')) as { period?: { start: string; end: string } };
  if (!e.period) throw new Error('recollect needs a Type 2 engagement with a period');
  const { start, end } = e.period;
  // Its real path: on macOS the temporary directory is reached through a symbolic link.
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'recollect-')));
  try {
    // Only the package's own files and folders: a link in a received package is left out, so nothing written to the
    // scratch copy (the firm's roster line below, the collections) can reach a file outside it.
    cpSync(ws, tmp, { recursive: true, filter: (src) => !lstatSync(src).isSymbolicLink() });
    // The package carries the workspace's contents, not its marker; the scratch copy gets one from the manifest.
    const mf = inside(pkg, 'manifest.json');
    if (!lstatSync(mf).isFile()) throw new Error('manifest.json is not a regular file in the package');
    const manifest = JSON.parse(readFileSync(mf, 'utf8')) as { organization?: string; created_at?: string };
    if (!existsSync(join(tmp, 'evidence-desk.json'))) writeFileSync(join(tmp, 'evidence-desk.json'), JSON.stringify({ schema: 'evidence-desk.workspace/1', organization: manifest.organization ?? '', created_at: manifest.created_at ?? '', frameworks: ['soc2'] }, null, 2) + '\n');
    // The firm records what it collects under its own name.
    appendFileSync(join(tmp, 'registers', 'people.csv'), 'firm,The audit firm,,auditor,,,re-collection of the client\'s populations\n');
    const by = 'firm';
    if (input.repo) {
      if (!process.env.GITHUB_TOKEN) throw new Error('set GITHUB_TOKEN to the firm\'s read-only GitHub token');
      await collectChanges(tmp, { repo: input.repo, start, end, by });
      if (input.environment) await collectDeployments(tmp, { repo: input.repo, environment: input.environment, start, end, by });
    }
    if (input.account) {
      if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error('set CLOUDFLARE_API_TOKEN to the firm\'s read-only Cloudflare token');
      if (input.script) await collectWorkerDeployments(tmp, { account: input.account, script: input.script, start, end, by });
      await collectCloudflareChanges(tmp, { account: input.account, start, end, by });
      await collectCloudflareTokens(tmp, { account: input.account, start, end, by });
    }
    const pop = (root: string) => join(root, 'evidence', 'files', 'populations');
    const out: Recollection[] = [];
    for (const p of POPULATIONS) {
      const packagedFile = newest(pop(ws), p.stem);
      const recollectedFile = newest(pop(tmp), p.stem, packagedFile);
      if (!packagedFile || !recollectedFile) continue;
      const read = (f: string) => parseCsv(readFileSync(f, 'utf8'), f).rows;
      const a = new Map(read(own(`evidence/files/populations/${packagedFile}`)).map((r) => [p.key(r), r]));
      const b = new Map(read(join(pop(tmp), recollectedFile)).map((r) => [p.key(r), r]));
      out.push({ population: p.stem, packaged_file: `evidence/files/populations/${packagedFile}`, packaged: a.size, recollected: b.size,
        only_packaged: [...a.keys()].filter((k) => !b.has(k)), only_recollected: [...b.keys()].filter((k) => !a.has(k)),
        differing: [...a.keys()].filter((k) => b.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))) });
    }
    return out;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
