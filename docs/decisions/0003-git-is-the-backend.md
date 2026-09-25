# ADR 0003: Git is the backend

Status: Accepted by the owner ("let's really think it through and then do it", September 25, 2026). Its first part lands
with this record; the later parts named under Consequences land each with its own review.

## Context and sources

Evidence Desk keeps a workspace as a folder of JSON, CSV and Markdown files (CONSTITUTION: "The files are the data").
`evidence-desk serve` runs a local HTTP server (`src/server.ts`) whose routes read and write those files through
`files.ts`, which guards each write with the version of the file it replaces. A signed act (a policy approval, a form
response, an access review's sign-off, an incident's closing, a risk's treatment, a vendor's review, a
self-attestation) is a record naming its signer; where the workspace is a Git repository on GitHub, `collect
attribution` checks that the person opened the pull request that brought the act to the default branch (ADR 0002, and
docs/workspace-format.md). The daily workflow `ci-template` writes already commits collector results to the workspace's
repository. A workspace was not required to be a Git repository, and Evidence Desk's own was not.

Most of what the server adds on top of the files is Git reinvented: per-file versions against lost updates, an
audit trail spread across record fields, attribution checked after the fact, hashes proving a text did not change.

Source of authorization: the owner's coding conversation, September 25, 2026. On signing: "shouldn't this part be like
docusign - and after I sign, my digital signature is committed?"; "in the gh that is"; asked how the signed commit
should land, "PR yes, but I just approve it right? Consider it like a secretary preparing my documents". Then: "what if
we made it so that evidence desk has no backend and only works on git as a backend? That would be cool"; "my main
thinking here is what if evidence desk only had a git backend so that it's just a bunch of docs and records with memory
and change attribution/approval logs. Wouldn't that simplify everything"; and "okay let's really think it through and
then do it". The owner chose a private repository in `open-autonomy-org` for Evidence Desk's own workspace.

Where the owner's words stop: they ask for Git as the only backend (documents and records whose history is the memory,
the attribution and the approval log), for a signature committed on GitHub, and for the signer's act to be approving a
pull request someone else prepared. Everything below past that is this author's design: Git rather than GitHub as the
store, how a change becomes a commit, when a signed act becomes a pull request, the landing workflow, the attribution
rule, and the parts deferred.

## Decision

**The workspace is a Git repository, and Git is its store.** A workspace is a repository, or a folder inside one (a
project may keep it beside its code). Every change Evidence Desk makes, from the app or the command line, ends in one
commit of exactly the files it wrote, whose message says what changed and, where the people register gives an email,
whose author is the person who acted. Files someone else is editing are never swept into it. The first change to a
folder that is in no repository makes it one, committing the folder as it stood. The history is the audit trail: who
changed what, when, and who signed it. Per-file versions stay as the check against a concurrent edit within a session.

**Git, not GitHub, is the store.** A local repository is the whole workspace; a remote (GitHub, any Git host, or none) is
the owner's choice. `sync` brings the branch level with its remote: it takes the remote's commits (a fast-forward, or the
local commits replayed on top) and pushes what the remote lacks, with the machine's own Git credentials.

**A signature is an approval of the exact commit, prepared by someone else.** Where the workspace is a clone of a GitHub
repository with its default branch checked out, and Evidence Desk holds a preparer's token
(`EVIDENCE_DESK_SIGNING_TOKEN`: an identity other than the signer's, since a host does not let an author approve their
own pull request), a change that records a signed act does not land on the default branch. Evidence Desk makes it in a
separate worktree at the committed head, commits it, pushes it as `sign/<the signer's GitHub login>/…`, opens a pull
request whose description is the packet (what each act is; for a policy, its whole text, whether it is the catalog
template unchanged, and what signing it commits the organization to), and asks the signer to review it. The signer
reads it and approves on GitHub; GitHub records the approval against the exact head commit. The workflow
`signing-template` writes merges the pull request, with a merge commit, once the account the branch names approves its
current head. A change that records no signed act (a register edit that decides nothing) is committed to the default
branch like any other. One pull request is one person's signature; a change recording acts of two people is refused.
Which change records a signed act is worked out, not declared: the acts the workspace holds before and after it are
compared (`signedActs`, the set attribution checks).

**Attribution checks the signature from GitHub's record.** `collect attribution` finds, as before, the merge commit that
brought each act to the default branch and its pull request. The act is verified if the person's GitHub account on the
Open Autonomy roster approved that pull request at the head commit that was merged (their latest verdict on it being
that approval), or opened it themselves (the earlier door, kept for a person who records an act in a pull request of
their own). Each row says which (`via`). An approval binds the exact commit, so it lacks the earlier door's residual,
where a collaborator pushing to the person's branch is not told apart from them.

**Elsewhere a signed act is committed where the person works.** Without a preparer's token, on a branch other than the
default, or with no GitHub remote, the act is committed to the current branch: the person opens their own pull request,
or the workspace keeps its history on this machine alone.

## Alternatives and tradeoffs

- **GitHub as the store.** Rejected: GitHub cannot become a prerequisite for core readiness work (CONSTITUTION); pull
  requests, approvals and workflows are the remote's enhancements to a store that is ordinary Git.
- **Keep the server as the store and add signed commits alongside.** Rejected: two stores disagree, and the server's
  records carry no signature.
- **Commit at every file write instead of every change.** Rejected: one change writes several files (an approval writes
  the policy record, its archived text and the evidence record); a commit per file splits one act across commits.
- **Sweep every modified file into the commit.** Rejected: it would commit someone else's unfinished edit under
  Evidence Desk's message.
- **The server lands approved pull requests itself (polling).** Rejected: a signature would land only while Evidence
  Desk runs; the workflow lands it the moment the signer approves.
- **One pull request for many documents.** Not the default: an approval covers everything in it, so one objection
  would hold every other document back; a pull request per change keeps each signature separable.
- **An e-signature service (DocuSign).** Rejected: a third party holding the signatures, and a subscription, against the
  constitution's first invariant.
- **Signatures in files (a detached signature per approval).** Rejected: Git's own signing and the host's approval
  already bind the whole change, are checked by every host, and need no format of Evidence Desk's.
- **Large evidence in Git.** A tradeoff, not decided here: ordinary files up to the host's limit in the repository,
  larger ones through Git LFS or by reference with their hash. Decided when the first large evidence meets it.

## Consequences

Landing with this record:

- `files.ts` makes a folder a repository before its first write and notes each file written; `git.ts` commits them.
  The server commits after each change and the command line after each command, including the part of a change that
  stopped with an error, so no write is left outside the history. Commits are dated by Evidence Desk's clock.
- `signatures.ts` prepares a signature (worktree, branch, pull request, review request) and lists what waits on
  GitHub; `signing-template` writes the landing workflow at the top of the repository; `sync` and the app's Sync
  button bring the workspace level with its remote.
- The To sign page shows, for each item already prepared, its pull request to open and approve on GitHub; its acts,
  where the workspace signs on GitHub, prepare pull requests instead of recording.
- `collect attribution` accepts the approval, and its rows carry `via`.
- Evidence Desk's own workspace moves into the private repository `open-autonomy-org/evidence-desk-compliance`, with
  the ED GitHub App as the preparer.

Later parts, each with its own review:

- The local signature for a workspace with no remote: the signer's own signed commit (Git's SSH or GPG signing), and
  attribution verifying it against the signer's published key.
- The validation the server enforces (schemas, the template gate, who may approve), packaged as a check the repository
  runs on every change (a pre-commit hook; the host's check on a pull request), so a hand edit cannot bypass it.
- The app as a static page reading and writing the repository through the host's API on the person's own login, with
  `evidence-desk serve` reduced to serving files and committing; collectors that need a secret the person does not hold
  running as the host's scheduled job and proposing their evidence as a pull request.

## Constitution review

- *The workspace belongs to its owner; core work runs locally.* Preserved: a local repository is the whole workspace;
  no host is needed to open, understand or keep it.
- *The files are the data.* Preserved: the same files; Git adds history, not a format.
- *External editing is supported; validate edits and surface conflicts.* Preserved: people and agents edit and commit
  directly; Evidence Desk commits only what it wrote, and a sync that meets conflicting lines stops and says so.
- *Storage and synchronization are the owner's choice.* Amended with the owner's agreement: the workspace is a Git
  repository; whether it has a remote, and which, stays the owner's choice, and GitHub stays optional.
- *Private evidence stays outside public development.* Preserved: the workspace's repository is the owner's and private;
  the public repository holds only code.
- Out of scope, *a mandatory hosted control plane or proprietary evidence store*: nothing here is mandatory or
  proprietary; a host is optional and holds ordinary Git.
