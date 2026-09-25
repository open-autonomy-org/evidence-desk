// Signatures on GitHub (docs/decisions/0003-git-is-the-backend.md). A workspace kept on GitHub signs there when its
// repository carries the signing workflow (`signing-template`) and its default branch is checked out. Then an act a
// person signs (a policy approval, a form response, an access review's sign-off, an incident's closing, a risk's
// treatment, a vendor's review, a self-attestation) does not land on the default branch: Evidence Desk, as the preparer,
// makes the change in a separate worktree and pushes it, with the machine's own Git credentials, as a branch
// `sign/<the signer's GitHub login>/…` whose head commit's message is the packet (what each act is and, for a policy, its
// whole text). The repository's workflow opens the pull request from it as the repository's own bot, so the signer is
// never its author, and asks the signer to review it. The signer's Approve on GitHub is the signature; the workflow
// merges the pull request once that account approves its exact head, and `collect attribution` checks the approval
// again from GitHub's record. A change that records no signed act is committed to the default branch like any other.
// Evidence Desk itself speaks only Git: no token of its own is needed to prepare or to list what waits.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitTouched, git, githubRepoOf, repoOf, statusOf, syncWorkspace, takeTouched, trySync, type Status } from './git.ts';
import { readVersioned } from './files.ts';
import { actDigest, readAct, signedActs, UNREADABLE } from './github.ts';
import { loadWorkspace } from './workspace.ts';
import { policyReading } from './signing.ts';
import { unchangedTemplate } from './actions.ts';
import { memberOf, type Snapshot } from './open-autonomy.ts';

export const SIGNING_WORKFLOW = '.github/workflows/evidence-desk-signatures.yml';
const tryGit = (cwd: string, ...args: string[]): string | null => { try { return git(cwd, ...args); } catch { return null; } };

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
  const login = latest ? memberOf((JSON.parse(latest.text) as Snapshot).team, person, (loadWorkspace(root).registers.people?.data.rows ?? []).map((r) => r.id))?.github : undefined;
  if (!login) throw new Error(`${person} has no GitHub account on the imported Open Autonomy roster: a signature on GitHub is that account's approval`);
  if (!/^[A-Za-z0-9-]+$/.test(login)) throw new Error(`${login} is not a GitHub login`);
  return login;
}

// Whether the workspace signs on GitHub, from what is on this machine: a GitHub origin whose default branch (as last
// fetched) is the branch checked out and tracked, and the signing workflow in the commit checked out.
export function signsOnGitHub(root: string): { repo: string; branch: string; status: Status } | null {
  const repo = githubRepoOf(root), status = statusOf(root), top = repoOf(root)?.top;
  if (!repo || !top || !status?.upstream) return null;
  const head = tryGit(root, 'symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD');
  const branch = head?.startsWith('origin/') ? head.slice('origin/'.length) : null;
  if (!branch || status.branch !== branch || status.upstream !== `origin/${branch}`) return null;
  return tryGit(top, 'cat-file', '-e', `HEAD:${SIGNING_WORKFLOW}`) === null ? null : { repo, branch, status };
}

export type Prepared = { branch: string; url: string; person: string; login: string; acts: { key: string; label: string }[] };
const MARK = /<!-- evidence-desk:sign (\{.*?\}) -->/;
const pullsOf = (repo: string, branch: string) => `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr head:${branch}`)}`;

// Runs a change as a signature to prepare. Returns null where the workspace does not sign on GitHub (the caller makes the
// change as usual); otherwise the change's result and what was prepared, or none when it recorded no signed act (then it
// is committed to the default branch like any change, as the person who made it). Only pushing a signature needs the
// remote: the workspace is brought level with it first where it can be, and a change that signs nothing never waits on it.
export async function prepareSignature<T>(root: string, message: string, person: string | undefined, change: (root: string) => T | Promise<T>): Promise<{ result: T; prepared: Prepared | null; syncError: string | null } | null> {
  const target = signsOnGitHub(root);
  if (!target) return null;
  const { repo } = target;
  if (target.status.uncommitted.length) throw new Error(`the workspace has edits not yet committed (${target.status.uncommitted.slice(0, 3).join(', ')}): a signature is prepared from the committed workspace, so commit or discard them first`);
  let syncError = trySync(root);
  const { top, prefix } = repoOf(root)!;
  const wt = mkdtempSync(join(tmpdir(), 'evidence-desk-sign-'));
  const at = join(wt, prefix);
  git(top, 'worktree', 'add', '-q', '--detach', wt, 'HEAD');
  try {
    const before = actsOf(root);
    const result = await change(at);
    const changed = [...actsOf(at)].filter(([k, v]) => before.get(k)?.digest !== v.digest);
    if (!changed.length) {
      const sha = commitTouched(at, message, person);
      if (sha) { git(root, 'merge', '-q', '--ff-only', sha); syncError = trySync(root); }
      return { result, prepared: null, syncError };
    }
    const persons = [...new Set(changed.map(([, v]) => v.person))];
    if (persons.length !== 1 || !persons[0]) throw new Error(`a signature is one person's; this change records acts of ${persons.map((p) => p || 'no one').join(' and ')}: make them one at a time`);
    const signer = persons[0], login = loginOf(root, signer);
    const acts = changed.map(([key, v]) => ({ key, label: v.label, kind: v.kind, file: v.file }));
    // The packet is the head commit's message: the workflow opens the pull request with it, and the history keeps it
    // beside the change it describes.
    const KIND: Record<string, string> = { 'policy-approval': 'policy approvals', 'risk-decision': 'risk treatments', 'vendor-review': 'vendor reviews', response: 'form responses', 'access-review': 'access review sign-offs', 'incident-closure': 'incident closures', attestation: 'self-attestations' };
    const kinds = [...new Set(acts.map((x) => x.kind))];
    const title = acts.length === 1 ? `Sign: ${acts[0].label}` : `Sign: ${kinds.length === 1 ? `${acts.length} ${KIND[kinds[0]] ?? 'acts'}` : `${acts.length} acts`}`;
    if (!commitTouched(at, unskippable(`${title}\n\n${packet(root, at, signer, acts, prefix)}`))) return { result, prepared: null, syncError };
    const head = `sign/${login}/${acts[0].key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${git(wt, 'rev-parse', '--short=7', 'HEAD')}`;
    try { git(wt, 'push', '-q', 'origin', `HEAD:refs/heads/${head}`); }
    catch (e) { throw new Error(`a signature is prepared on GitHub, and origin could not be reached; nothing was recorded, so try again when it can: ${(e as Error).message.split('\n').find((l) => l.trim()) ?? ''}`); }
    return { result, prepared: { branch: head, url: pullsOf(repo, head), person: signer, login, acts: acts.map(({ key, label }) => ({ key, label })) }, syncError };
  } finally {
    takeTouched(at);
    try { git(top, 'worktree', 'remove', '--force', wt); } catch { rmSync(wt, { recursive: true, force: true }); tryGit(top, 'worktree', 'prune'); }
  }
}

// The packet: who is asked to sign what, and for a policy its whole text as signed. Whether the text is still the
// catalog template is read from the workspace before the change (approving removes the drafting note).
// GitHub skips a push's workflows when its head commit's message carries a skip directive ([skip ci] and its kin, or a
// skip-checks trailer), and the packet quotes policy text that may name one: a word joiner inside each keeps it from
// being read as one, and it reads the same.
const unskippable = (message: string) => message
  .replace(/\[(skip ci|ci skip|no ci|skip actions|actions skip)\]/gi, (m) => `[\u2060${m.slice(1)}`)
  .replace(/^(\s*skip-checks)(\s*:)/gim, '$1\u2060$2');

function packet(before: string, root: string, person: string, acts: { key: string; label: string; kind: string; file: string }[], workspace: string): string {
  const ws = loadWorkspace(root), prior = loadWorkspace(before);
  const org = ws.manifest?.data.organization || 'the organization';
  const name = (ws.registers.people?.data.rows ?? []).find((r) => r.id === person)?.name || person;
  const out = [`**${name}**, this is prepared for your signature.`, '',
    `Read it here and under **Files changed**. **Approve** this pull request to sign it: GitHub records your approval of its exact head commit, and the workspace's signing workflow then merges it. If anything is not true, choose **Request changes** and say what: whoever prepared it withdraws it, changes it and prepares it again for you. The dates in the records are when it was prepared; your signature's time is your approval's.`, ''];
  for (const a of acts) {
    out.push(`## ${a.label[0].toUpperCase()}${a.label.slice(1)}`, '');
    const id = a.kind === 'policy-approval' ? a.key.split(':')[1] : '';
    const text = id ? readVersioned(root, `policies/${id}.md`)?.text : undefined;
    if (!id || text === undefined) { out.push(`The act is recorded in \`${a.file}\`; **Files changed** shows exactly what you sign.`, ''); continue; }
    const r = policyReading(prior, id, readVersioned(before, `policies/${id}.md`)?.text ?? text);
    const version = ws.policies.find((p) => p.data.id === id)?.data.versions.at(-1);
    const was = readVersioned(before, `policies/${id}.md`)?.text ?? text;
    if (unchangedTemplate(id, was, prior.scope?.data.answers ?? {})) out.push(`> **This is Evidence Desk's catalog template, unchanged.** Signing confirms it is true of how ${org} operates. If it is not, request changes.`, '');
    else if (r.template) out.push(`> **This is adapted from Evidence Desk's catalog template.** Signing confirms it is true of how ${org} operates. If it is not, request changes.`, '');
    if (r.commitments.length) out.push(`Signing this commits ${org} to:`, '', ...r.commitments.map((c) => `- ${c.title} (${c.control}), ${c.every}`), '');
    out.push(`The text you sign, \`policies/${id}.md\`${version ? `, SHA-256 \`${version.sha256}\`` : ''}:`, '', '<blockquote>', '', text.trim(), '', '</blockquote>', '');
  }
  out.push(`<!-- evidence-desk:sign ${JSON.stringify({ workspace, person, acts: acts.map(({ key, kind, file, label }) => ({ key, kind, file, label })) })} -->`);
  const body = out.join('\n');
  return body.length <= 60000 ? body : `${body.slice(0, 59000)}\n\n…the rest is under **Files changed**.\n\n${out.at(-1)}`;
}

// What waits for signatures: every `sign/` branch on the remote, read from its head commit's packet. Reading it first
// brings the workspace level with its remote, so a signature merged there shows here; the workflow deletes a branch once
// its pull request is merged or closed.
// \`merges\` is false when the branch no longer merges cleanly into the default branch (another signature changed the same
// lines first): its approval could not land, so it is withdrawn and prepared again.
export type Pending = { branch: string; url: string; person: string; login: string; acts: { key: string; kind: string; file: string; label: string }[]; merges: boolean };
export function pendingSignatures(root: string): { repo: string | null; status: Status | null; pending: Pending[]; error: string | null } {
  let status: Status | null = null, error: string | null = null;
  const repo = githubRepoOf(root);
  try {
    status = syncWorkspace(root);
    if (repo) git(root, 'fetch', '-q', '--prune', 'origin', '+refs/heads/sign/*:refs/remotes/origin/sign/*');
  } catch (e) { status = statusOf(root); error = (e as Error).message; }
  if (!repo) return { repo, status, pending: [], error };
  // A repository may hold more than one workspace: only this one's signatures are its own.
  const prefix = repoOf(root)?.prefix ?? '';
  const pending: Pending[] = [];
  for (const ref of (tryGit(root, 'for-each-ref', '--format=%(refname:strip=3)', 'refs/remotes/origin/sign/') ?? '').split('\n').filter(Boolean)) {
    const m = MARK.exec(tryGit(root, 'log', '-1', '--format=%B', `refs/remotes/origin/${ref}`) ?? '');
    if (!m) continue;
    try {
      const mark = JSON.parse(m[1]) as { workspace?: string; person: string; acts: Pending['acts'] };
      if ((mark.workspace ?? '') !== prefix) continue;
      const base = tryGit(root, 'symbolic-ref', '-q', 'refs/remotes/origin/HEAD');
      // Exit status 1 is a conflict; any other failure (a Git too old for --write-tree) says nothing either way.
      const merges = !base || spawnSync('git', ['-C', root, 'merge-tree', '--write-tree', base, `refs/remotes/origin/${ref}`], { stdio: 'ignore' }).status !== 1;
      pending.push({ branch: ref, url: pullsOf(repo, ref), person: mark.person, login: ref.split('/')[1], acts: mark.acts, merges });
    } catch { /* a packet that cannot be read is not listed */ }
  }
  return { repo, status, pending, error };
}

// Withdraws a signature not yet given: deletes its branch on the remote, which closes its pull request, so the act can be
// changed and prepared again.
export function withdrawSignature(root: string, branch: string): void {
  if (!/^sign\/[A-Za-z0-9-]+\/[a-z0-9-]+$/.test(branch)) throw new Error(`${branch} is not a branch Evidence Desk prepared for a signature`);
  // Only a signature this workspace prepared: its packet names the workspace's place in the repository.
  const m = MARK.exec(tryGit(root, 'log', '-1', '--format=%B', `refs/remotes/origin/${branch}`) ?? '');
  const mark = m ? (() => { try { return JSON.parse(m[1]) as { workspace?: string }; } catch { return null; } })() : null;
  if (!mark || (mark.workspace ?? '') !== (repoOf(root)?.prefix ?? '')) throw new Error(`${branch} is not a signature waiting in this workspace`);
  git(root, 'push', '-q', 'origin', '--delete', branch);
  tryGit(root, 'fetch', '-q', '--prune', 'origin', '+refs/heads/sign/*:refs/remotes/origin/sign/*');
}

// The workflow that carries a signature on GitHub: it opens the pull request for a pushed `sign/<login>/…` branch as the
// repository's bot (its title and description the head commit's message) and asks that login to review it; it merges
// the pull request, with a merge commit so the history keeps it, once that login approves its current head; and it
// deletes the branch of one closed unsigned.
export function signingWorkflow(): string {
  return `name: Evidence Desk signatures
# Carries a signature Evidence Desk prepared: a pushed branch sign/<the signer's GitHub login>/... becomes a pull request
# opened by this repository's bot (so the signer is never its author) with its head commit's message as the packet, and
# the signer is asked to review it. When that account approves the pull request's current head, it is merged: the
# approval is the signature, and evidence-desk collect attribution checks it again from GitHub's record. A pull request
# closed without merging has its branch deleted. Written by evidence-desk signing-template; it needs the repository
# setting that lets GitHub Actions create pull requests.
on:
  push:
    branches: ['sign/**']
  pull_request_review:
    types: [submitted]
  pull_request:
    types: [closed]
permissions:
  contents: write
  pull-requests: write
jobs:
  open:
    if: github.event_name == 'push' && !github.event.deleted
    runs-on: ubuntu-latest
    steps:
      - name: Open the pull request for the signer
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
          OWNER: \${{ github.repository_owner }}
          BRANCH: \${{ github.ref_name }}
          SHA: \${{ github.sha }}
          BASE: \${{ github.event.repository.default_branch }}
        run: |
          if [ "$(gh api "repos/$REPO/pulls?state=open&head=$OWNER:$BRANCH" --jq length)" != 0 ]; then exit 0; fi
          gh api "repos/$REPO/commits/$SHA" --jq .commit.message > message.txt
          title=$(head -n 1 message.txt)
          tail -n +3 message.txt > body.md
          number=$(gh api "repos/$REPO/pulls" -f title="$title" -f head="$BRANCH" -f base="$BASE" -F body=@body.md --jq .number)
          login=$(printf '%s' "$BRANCH" | cut -d/ -f2)
          gh api "repos/$REPO/pulls/$number/requested_reviewers" -f "reviewers[]=$login" > /dev/null || echo "could not request a review from $login"
  land:
    if: >-
      github.event_name == 'pull_request_review' &&
      github.event.review.state == 'approved' &&
      github.event.review.commit_id == github.event.pull_request.head.sha &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, format('sign/{0}/', github.event.review.user.login))
    runs-on: ubuntu-latest
    steps:
      - name: Merge the signed pull request
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
          PR: \${{ github.event.pull_request.number }}
          SHA: \${{ github.event.review.commit_id }}
          BRANCH: \${{ github.event.pull_request.head.ref }}
        run: |
          if ! gh api -X PUT "repos/$REPO/pulls/$PR/merge" -f merge_method=merge -f sha="$SHA" > /dev/null 2> error.txt; then
            gh api "repos/$REPO/issues/$PR/comments" -f body="Signed, but this could not be merged: $(head -c 300 error.txt). Usually another signature changed the same lines first. Withdraw it in Evidence Desk, prepare it again and sign the new pull request." > /dev/null
            exit 1
          fi
          gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" > /dev/null || true
  close:
    if: >-
      github.event_name == 'pull_request' &&
      !github.event.pull_request.merged &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      startsWith(github.event.pull_request.head.ref, 'sign/')
    runs-on: ubuntu-latest
    steps:
      - name: Delete the branch of a pull request closed unsigned
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
          BRANCH: \${{ github.event.pull_request.head.ref }}
        run: gh api -X DELETE "repos/$REPO/git/refs/heads/$BRANCH" > /dev/null || true
`;
}
