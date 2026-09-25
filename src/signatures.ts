// Signatures on GitHub (docs/decisions/0003-git-is-the-backend.md). Where the workspace is a clone of a GitHub repository
// and its default branch is checked out, an act a person signs (a policy approval, a form response, an access review's
// sign-off, an incident's closing, a risk's treatment, a vendor's review, a self-attestation) does not land on that branch
// directly: Evidence Desk, as the preparer, makes the change in a separate worktree, pushes it as a branch
// `sign/<the signer's GitHub login>/…` and opens a pull request with the preparer's token (EVIDENCE_DESK_SIGNING_TOKEN,
// never the signer's own: a host does not let an author approve their own pull request), asking the signer to review
// it. Its description is the packet: what each act is and, for a policy, the whole text. The signer's Approve on GitHub
// is the signature; the workflow `signing-template` writes merges the pull request once its signer approves its exact
// head, and `collect attribution` checks the approval again from GitHub's own record. A change that records no signed
// act is committed to the branch as any other.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitTouched, git, takeTouched, githubRepoOf, repoOf, statusOf, syncWorkspace, type Status } from './git.ts';
import { readVersioned } from './files.ts';
import { actDigest, readAct, signedActs, UNREADABLE } from './github.ts';
import { loadWorkspace } from './workspace.ts';
import { policyReading } from './signing.ts';
import type { Snapshot } from './open-autonomy.ts';

const API = 'https://api.github.com';
const TOKEN = 'EVIDENCE_DESK_SIGNING_TOKEN';
async function api(method: string, path: string, body?: unknown): Promise<any> {
  const token = process.env[TOKEN];
  if (!token) throw new Error(`${TOKEN} is not set: signing on GitHub needs the token of the identity that prepares the pull requests`);
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error(`${method} ${path} answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

// Every signed act in the workspace, by key: whom it names and a digest of the act as its file holds it.
type ActState = { digest: string; person: string; label: string; kind: string; file: string };
function actsOf(root: string): Map<string, ActState> {
  const out = new Map<string, ActState>();
  for (const a of signedActs(root)) {
    const v = readAct(a.file, readVersioned(root, a.file)?.text);
    out.set(a.key, { digest: v === UNREADABLE ? 'unreadable' : actDigest(a.extract(v)), person: a.person, label: a.label, kind: a.kind, file: a.file });
  }
  return out;
}

// The GitHub account the Open Autonomy roster gives a person: the account whose approval is their signature.
function loginOf(root: string, person: string): string {
  const latest = readVersioned(root, 'sources/open-autonomy/latest.json');
  const login = latest ? (JSON.parse(latest.text) as Snapshot).team.find((m) => m.id === person)?.github : undefined;
  if (!login) throw new Error(`${person} has no GitHub account on the imported Open Autonomy roster: a signature on GitHub is that account's approval`);
  return login;
}

// Where signing on GitHub applies: a preparer's token, a GitHub origin, and the repository's default branch checked out
// and tracking it. Anywhere else a signed act is committed where the person works (their own branch and pull request, or
// a workspace with no remote).
async function signingTarget(root: string): Promise<{ repo: string; branch: string; status: Status } | null> {
  if (!process.env[TOKEN]) return null;
  const repo = githubRepoOf(root), status = statusOf(root);
  if (!repo || !status?.upstream) return null;
  const branch = (await api('GET', `/repos/${repo}`) as { default_branch: string }).default_branch;
  return status.branch === branch && status.upstream === `origin/${branch}` ? { repo, branch, status } : null;
}

export type Prepared = { number: number; url: string; person: string; login: string; acts: { key: string; label: string }[] };
const MARK = /<!-- evidence-desk:sign (\{.*?\}) -->/;

// Runs a change as a signature to prepare. Returns null where signing on GitHub does not apply (the caller makes the
// change as usual); otherwise the change's result and the pull request prepared, or none when it recorded no signed act
// (then it is committed to the default branch like any change).
export async function prepareSignature<T>(root: string, message: string, change: (root: string) => T | Promise<T>): Promise<{ result: T; prepared: Prepared | null } | null> {
  const target = await signingTarget(root);
  if (!target) return null;
  const { repo, branch } = target;
  if (target.status.uncommitted.length) throw new Error(`the workspace has edits not yet committed (${target.status.uncommitted.slice(0, 3).join(', ')}): a signature is prepared from the committed workspace, so commit or discard them first`);
  syncWorkspace(root);
  const { top, prefix } = repoOf(root)!;
  const wt = mkdtempSync(join(tmpdir(), 'evidence-desk-sign-'));
  git(top, 'worktree', 'add', '-q', '--detach', wt, 'HEAD');
  try {
    const at = join(wt, prefix);
    const before = actsOf(root);
    const result = await change(at);
    const sha = commitTouched(at, message);
    if (!sha) return { result, prepared: null };
    const changed = [...actsOf(at)].filter(([k, v]) => before.get(k)?.digest !== v.digest);
    if (!changed.length) {
      git(root, 'merge', '-q', '--ff-only', sha);
      syncWorkspace(root);
      return { result, prepared: null };
    }
    const persons = [...new Set(changed.map(([, v]) => v.person))];
    if (persons.length !== 1 || !persons[0]) throw new Error(`a signature is one person's; this change records acts of ${persons.map((p) => p || 'no one').join(' and ')}: make them one at a time`);
    const person = persons[0], login = loginOf(root, person);
    const head = `sign/${login}/${changed[0][0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${sha.slice(0, 7)}`;
    // The preparer's token authenticates this one push; it travels in the environment, never in the command line.
    execFileSync('git', ['-C', wt, 'push', '-q', `https://github.com/${repo}.git`, `HEAD:refs/heads/${head}`], { stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env[TOKEN]}`).toString('base64')}` } });
    const acts = changed.map(([key, v]) => ({ key, label: v.label, kind: v.kind, file: v.file }));
    const title = acts.length === 1 ? `Sign: ${acts[0].label}` : `Sign: ${acts.length} acts`;
    const pr = await api('POST', `/repos/${repo}/pulls`, { title, head, base: branch, body: packet(root, at, person, sha, acts) }) as { number: number; html_url: string };
    // Asking for the signer's review puts the pull request in their GitHub review queue; the packet stands without it.
    await api('POST', `/repos/${repo}/pulls/${pr.number}/requested_reviewers`, { reviewers: [login] }).catch(() => null);
    return { result, prepared: { number: pr.number, url: pr.html_url, person, login, acts: acts.map(({ key, label }) => ({ key, label })) } };
  } finally {
    takeTouched(join(wt, prefix));
    try { git(top, 'worktree', 'remove', '--force', wt); } catch { rmSync(wt, { recursive: true, force: true }); git(top, 'worktree', 'prune'); }
  }
}

// The pull request's description: who is asked to sign what, and for a policy its whole text as signed. Whether the text
// is still the catalog template is read from the workspace before the change (approving removes the drafting note).
function packet(before: string, root: string, person: string, sha: string, acts: { key: string; label: string; kind: string; file: string }[]): string {
  const ws = loadWorkspace(root), prior = loadWorkspace(before);
  const org = ws.manifest?.data.organization || 'the organization';
  const name = (ws.registers.people?.data.rows ?? []).find((r) => r.id === person)?.name || person;
  const out = [`**${name}**, this is prepared for your signature.`, '',
    `Read it here and under **Files changed**. **Approve** this pull request to sign it: GitHub records your approval of this exact commit (${sha.slice(0, 12)}), and the workspace's signing workflow then merges it. If anything is not true, choose **Request changes** and say what; it will be prepared again.`, ''];
  for (const a of acts) {
    out.push(`## ${a.label[0].toUpperCase()}${a.label.slice(1)}`, '');
    const id = a.kind === 'policy-approval' ? a.key.split(':')[1] : '';
    const text = id ? readVersioned(root, `policies/${id}.md`)?.text : undefined;
    if (!id || text === undefined) { out.push(`The act is recorded in \`${a.file}\`; **Files changed** shows exactly what you sign.`, ''); continue; }
    const r = policyReading(prior, id, readVersioned(before, `policies/${id}.md`)?.text ?? text);
    const version = ws.policies.find((p) => p.data.id === id)?.data.versions.at(-1);
    if (r.template) out.push(`> **This is Evidence Desk's catalog template, unchanged.** Signing confirms it is true of how ${org} operates. If it is not, request changes.`, '');
    if (r.commitments.length) out.push(`Signing this commits ${org} to:`, '', ...r.commitments.map((c) => `- ${c.title} (${c.control}), ${c.every}`), '');
    out.push(`The text you sign, \`policies/${id}.md\`${version ? `, SHA-256 \`${version.sha256}\`` : ''}:`, '', '<blockquote>', '', text.trim(), '', '</blockquote>', '');
  }
  out.push(`<!-- evidence-desk:sign ${JSON.stringify({ person, acts: acts.map(({ key, kind, file, label }) => ({ key, kind, file, label })) })} -->`);
  const body = out.join('\n');
  return body.length <= 60000 ? body : `${body.slice(0, 59000)}\n\n…the rest is under **Files changed**.\n\n${out.at(-1)}`;
}

// What waits for signatures on GitHub: every open pull request Evidence Desk prepared, with whom it asks and for what.
// Reading it first brings the workspace level with GitHub, so a signature merged there shows here.
export type Pending = { number: number; url: string; person: string; login: string; acts: { key: string; kind: string; file: string; label: string }[]; approved: boolean };
export async function pendingSignatures(root: string): Promise<{ repo: string | null; status: Status | null; pending: Pending[]; error: string | null }> {
  let status: Status | null = null, error: string | null = null;
  try { status = syncWorkspace(root); } catch (e) { status = statusOf(root); error = (e as Error).message; }
  const repo = githubRepoOf(root);
  if (!repo || !process.env[TOKEN]) return { repo, status, pending: [], error };
  try {
    const pulls = await api('GET', `/repos/${repo}/pulls?state=open&per_page=100`) as { number: number; html_url: string; body: string | null; head: { ref: string; sha: string } }[];
    const pending: Pending[] = [];
    for (const p of pulls.filter((x) => x.head.ref.startsWith('sign/'))) {
      const m = MARK.exec(p.body ?? '');
      if (!m) continue;
      const mark = JSON.parse(m[1]) as { person: string; acts: Pending['acts'] };
      const login = p.head.ref.split('/')[1];
      const reviews = await api('GET', `/repos/${repo}/pulls/${p.number}/reviews?per_page=100`) as { user?: { login?: string }; state: string; commit_id?: string }[];
      const last = reviews.filter((r) => r.user?.login?.toLowerCase() === login.toLowerCase() && r.state !== 'COMMENTED').at(-1);
      pending.push({ number: p.number, url: p.html_url, person: mark.person, login, acts: mark.acts, approved: last?.state === 'APPROVED' && last.commit_id === p.head.sha });
    }
    return { repo, status, pending, error };
  } catch (e) { return { repo, status, pending: [], error: (e as Error).message }; }
}

// The workflow that lands a signature: a pull request Evidence Desk prepared for a person (branch sign/<login>/…) is merged
// once that GitHub account approves its exact head commit, with a merge commit, so the history keeps the pull request.
export function signingWorkflow(): string {
  return `name: Evidence Desk signatures
# Merges a pull request Evidence Desk prepared for a person's signature (a branch sign/<their GitHub login>/...) once that
# person approves its exact head commit. The approval is the signature; evidence-desk collect attribution checks it again
# from GitHub's record. Written by evidence-desk signing-template.
on:
  pull_request_review:
    types: [submitted]
permissions:
  contents: write
  pull-requests: write
jobs:
  land:
    if: >-
      github.event.review.state == 'approved' &&
      github.event.review.commit_id == github.event.pull_request.head.sha &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, format('sign/{0}/', github.event.review.user.login))
    runs-on: ubuntu-latest
    steps:
      - name: Merge the signed pull request
        env:
          GH_TOKEN: \${{ github.token }}
          PR: \${{ github.event.pull_request.number }}
          REPO: \${{ github.repository }}
          SHA: \${{ github.event.review.commit_id }}
        run: gh pr merge "$PR" --repo "$REPO" --merge --match-head-commit "$SHA" --delete-branch
`;
}
