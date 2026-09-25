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

**A signature is an approval of the exact commit, prepared by someone else.** A workspace on GitHub signs there when
its repository carries the signing workflow (`signing-template` writes it) and its default branch is checked out. A
change that records a signed act then does not land on the default branch. Evidence Desk, the preparer, makes it in a
separate worktree at the committed head and pushes it, with the machine's own Git credentials, as a branch
`sign/<the signer's GitHub login>/…` whose head commit's message is the packet: what each act is and, for a policy, its
whole text, whether it is the catalog template unchanged, and what signing it commits the organization to. The
repository's workflow opens the pull request from that branch as the repository's own bot, so the signer is never its
author (a host does not let an author approve their own pull request), and asks the signer to review it. The signer
reads it and approves on GitHub; GitHub records the approval against the exact head commit, and the workflow merges the
pull request, with a merge commit, once the account the branch names approves its current head; where it cannot (another
signature changed the same lines first), it says so on the pull request, and Evidence Desk shows the signature as no
longer merging. A signature not yet given can be withdrawn (its branch deleted, which closes the pull request) and
prepared again; a pull request closed without merging has its branch deleted. Only pushing a signature needs the
remote: a change that signs nothing is committed locally and synced where the remote can be reached. Evidence Desk
speaks only Git: it needs no token to prepare a signature, and
lists what waits from the `sign/` branches on the remote. A change that records no signed act (a register edit that
decides nothing) is committed to the default branch like any other. One pull request is one person's signature; a
change recording acts of two people is refused. Which change records a signed act is worked out, not declared: the acts
the workspace holds before and after it are compared (`signedActs`, the set attribution checks).

**Attribution checks the signature from GitHub's record.** `collect attribution` finds, as before, the merge commit that
brought each act to the default branch and its pull request. The act is verified if the person's GitHub account on the
Open Autonomy roster approved that pull request at the head commit that was merged (their latest verdict on it being
that approval). A pull request the person only opened no longer counts (the independent security reviews of
2026-09-25): anyone who can push to its branch can change it after it was opened. The roster is read from the Open
Autonomy project's repository when the check is given it, so a writer of the workspace cannot remap who signs for whom. An approval counts only where the approved head
commit can be read in the workspace's clone and holds the act as merged: a merge commit keeps it, and a squash-merged
pull request's approval counts only if its branch was fetched.

A record's own date (an approval's `approved_at`, a response's `submitted_at`) is when the act was prepared; the
signature's time is the approval's, which attribution records (`signed_at`). A residual the workflow does not remove: a
collaborator with write access can push a `sign/<their own login>/…` branch and approve it, landing a change on the
default branch without anyone else's review; any act in it that names someone else is still not verified, since
attribution requires that person's approval.

**Elsewhere a signed act is committed where the person works.** Without the signing workflow, on a branch other than
the default, or with no GitHub remote, the act is committed to the current branch: someone else opens a pull request with
it for the person to approve, or the workspace keeps its history on this machine alone (unsigned until the local
signature lands).

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
- **Evidence Desk opens the pull request with a preparer's token** (a GitHub App's or a bot's). Rejected: every
  organization would have to make and keep a second identity and give Evidence Desk its key, and Evidence Desk would
  speak GitHub's API where Git suffices; the repository's own workflow is already an identity other than the signer's.
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

- `files.ts` makes a workspace folder a repository before its first write and notes each file written; `git.ts`
  commits them. A received audit package or a scratch copy is not made one. The server commits after each change (each
  in its own record of what it wrote, so changes in flight together never take each other's files) and the command line
  after each command, including the part of a change that
  stopped with an error; a commit Git refuses (a hook, a file edited meanwhile) is reported, and its files are taken by
  the app's next change. Commits are dated by Evidence Desk's clock.
- `signatures.ts` prepares a signature (worktree, packet, `sign/` branch) and lists what waits from the remote's `sign/`
  branches; `signing-template` writes the workflow (open the pull request, request the review, merge on approval,
  delete a branch closed unsigned) at the top of the repository; `sync` and the app's Sync
  button bring the workspace level with its remote.
- The To sign page shows, for each item already prepared, its pull request to open and approve on GitHub; its acts,
  where the workspace signs on GitHub, prepare pull requests instead of recording.
- `collect attribution` accepts the approval, and its rows carry `via`.
- Evidence Desk's own workspace moves into the private repository `open-autonomy-org/evidence-desk-compliance`, which
  carries the signing workflow and lets GitHub Actions create pull requests.

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
