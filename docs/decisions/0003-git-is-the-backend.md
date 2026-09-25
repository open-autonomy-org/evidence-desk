# ADR 0003: Git is the backend

Status: Proposed, for the owner's reading. Accepted only upon the owner's agreement, independent review against the
constitution, and merge of this record; its implementation lands in parts, each reviewed.

## Context and sources

Evidence Desk keeps a workspace as a folder of JSON, CSV and Markdown files (CONSTITUTION: "The files are the data").
`evidence-desk serve` runs a local HTTP server (`src/server.ts`): it serves the app's page and about 35 routes that read
and write those files, enforce the schemas, versions and who may approve, hash documents, parse spreadsheets and run
the collectors with tokens from its environment. Writes are guarded by per-file versions (`files.ts` `writeVersioned`);
a signed act (a policy approval, an attestation) is a record naming its signer, and `collect attribution` checks, where
the workspace is a Git repository, that the signer opened the pull request that added it (ADR 0002). A workspace is
not required to be a Git repository, and the one Evidence Desk's own project keeps is not.

Source of authorization: the owner's coding conversation, September 25, 2026. On signing: "shouldn't this part be like
docusign - and after I sign, my digital signature is committed?"; "in the gh that is"; asked how the signed commit
should land, "PR yes, but I just approve it right? Consider it like a secretary preparing my documents". Then: "what if
we made it so that evidence desk has no backend and only works on git as a backend? That would be cool". The owner
chose a private repository in `open-autonomy-org` for Evidence Desk's own workspace.

Where the owner's words stop: they ask for signatures committed in GitHub, for the owner's act to be approving a
prepared pull request, and for Git to replace the backend. Everything below past that (Git rather than GitHub as the
backend, the local signed commit as the base signature, the browser client, where collectors run) is this author's
extrapolation, reconciled with the constitution.

## Decision

**The workspace is a Git repository, and Git is its only store.** Every change is a commit; the history is the audit
trail: who changed what, when, and who signed it. Evidence Desk writes no state anywhere else. A workspace that is not
yet a repository is made one by `init` (existing folders by `git init` and a first commit).

**Git, not GitHub, is the backend.** The constitution keeps the workspace local and makes any remote optional
("Storage and synchronization are the owner's choice"; GitHub "cannot become a prerequisite for core readiness work").
A local repository is complete on its own; a remote (GitHub, or any Git host) adds sharing, review and the stronger
signature below.

**A signature is a signed commit, and with a remote, an approval of the exact commit.**
- Locally: the signer's own commit, signed with their own key (Git's SSH or GPG signing), carrying the approval records
  and the exact text signed. Its signature is verifiable offline against the signer's public key.
- With a remote (the owner's "secretary preparing my documents"): Evidence Desk, as the preparer, commits the documents
  and the approval records naming the signer on a branch and opens a pull request under its own identity (never the
  signer's: a host does not let an author approve their own pull request). The pull request's description is the
  signing packet: each document, its hash, what signing it commits the organization to. The signer's act is the host's
  Approve on that pull request, which binds to the exact commit; the pull request then merges.
- `collect attribution` checks either form: the signer signed the commit, or approved the pull request at its merged
  head. ADR 0002's "the person who signed it opened the pull request that added it" is replaced by this.

**The server becomes a client of the repository.** The checks it enforces (schemas, versions, the template gate, who may
approve) move into the code every client runs before it commits, and into a validation the repository runs on every
change (a pre-commit hook locally; the host's check on a pull request), so a hand edit cannot bypass them. The app is a
static page reading and writing the repository: through the local folder (`evidence-desk serve` reduced to serving
files and committing), or, where the workspace has a remote, through the host's API in the browser on the person's own
login. The CLI and coding agents keep working on a clone, as today.

**Collectors commit their evidence like anyone else.** A collector reading only what the person's login can read runs
where the person is (CLI or browser) and commits its population. One that needs a secret the person does not hold runs
where that secret is kept (a scheduled job of the repository's host, with the secret in the host's secret store) and
proposes its evidence as a pull request, which is reviewed like any change.

## Alternatives and tradeoffs

- **GitHub as the backend.** Rejected: it would make GitHub a prerequisite, which the constitution forbids; the
  GitHub-specific parts (pull requests, approvals, Actions) are the remote's enhancements, not the store.
- **Keep the server as the store and add signed commits alongside.** Rejected as the end state: two stores disagree, and
  the server's records would carry no signature. It is the transition: the server's writes become commits first.
- **Signatures in files (a detached signature per approval).** Kept only as what a signed commit already is: Git's own
  signing covers the whole change, is checked by every host, and needs no format of Evidence Desk's.
- **An e-signature service (DocuSign).** Rejected: a third party holding the signatures, and a subscription, against the
  constitution's first invariant.
- **Large evidence in Git.** A tradeoff, not decided here: ordinary files up to a size limit in the repository, larger
  ones through Git LFS or by reference with their hash. Decided when the first large evidence meets it.

## Consequences

- `init` creates a repository; existing workspaces get a migration that commits them as they stand.
- Every write path (`writeVersioned` and its callers) ends in a commit with a message saying what changed; per-file
  versions stay as the optimistic check within a session.
- The signing flow: the To sign page prepares the pull request (with a remote) or the signer's signed commit (without
  one); `collect attribution` learns to verify both.
- The validation the server enforced is packaged as a check the repository runs.
- The browser client and host-run collectors are later parts, each with its own review.
- The first workspace to move is Evidence Desk's own, in the private repository `open-autonomy-org/evidence-desk-compliance`.

## Constitution review

- *The workspace belongs to its owner; core work runs locally.* Preserved and strengthened: a local repository is the
  whole workspace; no host is needed to open, understand or keep it.
- *The files are the data.* Preserved: the same files; Git adds history, not a format.
- *External editing is supported; validate edits.* Preserved: people and agents commit directly; the repository's own
  check validates every change, which today only the server does.
- *Storage and synchronization are the owner's choice.* Preserved: the remote, and which host, is the owner's choice;
  GitHub is one.
- *Private evidence stays outside public development.* Preserved: the workspace's repository is the owner's and private;
  the public repository holds only code.
- Out of scope, *a mandatory hosted control plane or proprietary evidence store*: nothing here is mandatory or
  proprietary; a host is optional and holds ordinary Git.

This record cannot amend the constitution and does not need to.
