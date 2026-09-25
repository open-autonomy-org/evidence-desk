# For the audit firm

This page is for a CPA firm engaged by an organization that keeps its SOC 2 program in Evidence Desk, and in particular
one whose system is an [Open Autonomy](https://github.com/open-autonomy-org/open-autonomy) project on its `soc2`
template. It says what you receive, how each kind of evidence was produced, how to test it, and what stays outside.

## What you receive

The organization exports an audit package: a folder holding exactly the files your request list points at, the
engagement and its requests, the drafts (system description, assertion, bridge letter), the controls and approved policy
texts the requests name, the latest attribution check, and a `manifest.json` of every file with its SHA-256. Verify it
on receipt, before answering: `evidence-desk audit verify <folder>` checks every file against the manifest offline (your
answers change the request files, so it no longer matches afterwards); you answer each request (accept, return, select samples, mark an exception) in the
package's own page (`evidence-desk audit package-serve <folder>`), and the organization imports your answers back.

Start with `review/index.html`. It and the tables beside it are derived from the packaged files and hashed in the
manifest's `derived` list (the README too), and every line names the file it comes from:

- `review/exceptions.csv`: every deviation the package's files show (a change or deployment without an independent
  approval, an approval given before the commit that merged, a deployment whose run did not succeed or whose approved
  run built another commit, a deploy started or approved by someone without the declared seam's scope, a failing
  streak of a daily check, an administrator outside the roster, an act recorded by someone other than its person, an
  access reviewer deciding their own account, a population read before the period ended), with when it occurred, was
  detected and was resolved, and management's response.
- `review/check-history/<check>.csv`: each daily reading with the collector snapshot it was decided from and that
  snapshot's SHA-256; the snapshots are in the package.
- `review/controls-matrix.csv`: every control, where it is requested, the evidence in the package, and, for an
  applicable control, what the workspace holds for it in its window (the period, or the twelve months before the
  period's end for an annual control); one with none is flagged.
- `review/coverage.csv`: each criterion of the categories in scope with its applicable controls and which of them have
  evidence; the page opens with the criteria that have none.
- `review/description-lint.csv`: the system description's claims about incidents, reviewed changes and how deployments
  start, checked against the populations. A contradiction stops the export, so a package never carries one.

- `review/workspace-history.txt`: the workspace repository's own history, so a register edit or an attribution row
  traces to the commit that made it.

Each population in `index.html` carries a test memo: how many items it holds and whether its completeness comes from
the system of record or from records the organization keeps itself. A change merged without an independent approval
is an exception. Where the package holds, for the whole period, the repository's deployments to the production
environment the project declares, each started from its declared release tag and independently approved, and the Worker
deployments population
with every production deployment matched to a GitHub deployment, the default branch is shown to be only a release
candidate: such a change is a review lapse (a Worker deployed some other way, with no population of its own, is not
seen), and whether
anything reached production without a person's approval is judged at the deployment (CHG-03). Otherwise a change merged
without an independent approval that no break-glass record names is an emergency change without its record, an
exception of its own (CHG-04). A management response lists the workspace files it
cites; one citing nothing says so. The package is not exported while any exception or request has no response; `audit <dir> <id>
exceptions` lists the register the package will carry and which rows are answered.

- `review/claims.csv`: every dated claim in the description, the assertion and management's responses, tied to the
  packaged line that records its date, names its subject and records its act (a claim whose stated time, pull request
  or release no such line carries is `partly supported`), and graded by where that line came from: a vendor's own
  answer (vendor record), a record the organization made (client record: it shows what was recorded, not that it
  happened) or a document it wrote (client narrative). Sentences dated only by the period are judgments. A claim no
  line supports, or a count its population contradicts, stops the export.
- `review/change-releases.csv`: change review in an Open Autonomy project is two-staged. Agents review and merge
  each change, and a person's approval of a release covers every change it ships. The view lists each merged change
  with the release that shipped it and who approved that release; a change shipped in a release no person on the
  roster approved is an exception.
- `review/access-changes.csv`: who was added to, removed from or given another role in the GitHub organization and
  the Cloudflare account, day by day, from the daily snapshots.
- `review/evidence-provenance.csv`: each client document's and register's history in the workspace repository; a
  document describing dates after it was recorded is an exception.
- `review/identities.csv`: every identity seen acting in the populations (person, service account, agent account)
  and the access review that covered it; one that acted in the period with no review is an exception.
- `review/production-timeline.csv`: what ran in production and for how long, each deployment with its commit, its
  approved GitHub deployment and the pull requests it shipped.

The package carries every in-window record of each applicable control, whether a request names it or not; coverage
counts only what the package holds.

An exception's `closed_by` says what ended it: a later passing reading (which shows the condition stopped, not that
anyone remediated it) or a later completeness check. A check that reports events, such as a bypass of the branch
rules or a Worker deployed by a person, is never closed by a quiet day. A day of the period with no check run is an exception of its own. Where the package holds the escalations
population, a failing check that no escalation record names on or after its first failing reading is an exception of
its own: the failure reached no one. A production setting a person changed with no break-glass record that day, an access review that kept an account
an earlier exception names, and a record made by someone without its seam's scope are exceptions. A release whose
approver wrote code it ships is an exception (`review/change-releases.csv`,
`release_approver_wrote_it`). `review/description-lint.csv` fails when the assertion does not name an exception open at
the period's end, or any incident, by what identifies it, or does not say when a system created inside the period began operating.

The package carries no copy of the workspace's Git history: it would hold every file the package leaves out. The
manifest names the commit and where it is published, and `review/workspace-history.txt` lists who committed what; the
firm checks a file against the published repository where it can read it. `audit verify` opens only regular files inside
the package, so a manifest naming a path outside it, or a link, is reported rather than followed.
`audit recollect <package> --repo <owner/name> --environment <name> --account <id> --script <worker>` reads the
change, deployment, Worker deployment, Cloudflare configuration and token populations again with the firm's own
read-only `GITHUB_TOKEN` and `CLOUDFLARE_API_TOKEN`, and lists every row only the package has, every row it lacks,
and every row whose fields differ; nothing in the package is changed.
The control matrix's `evidence_basis` is the strongest kind of evidence the package holds for each control: a vendor
record (a collector's answer or a daily check), a client record, or a client narrative; coverage marks a criterion whose
evidence is client narrative only.

The manifest's `workspace` names the workspace repository's commit at export, its origin and the remote branches
holding it: the hosted repository's history dates every record independently of the package. A file a packaged file
cites travels with it; one the workspace does not hold is listed in the manifest's `omitted`
with the file that cites it.

## How the evidence was produced

Every evidence record names its source and hashes its files; what a collector or an import recorded also names the
query that produced it (evidence a person added by hand says so).

- **Populations** (merged changes, production deployments, roster changes, incidents, break-glass changes, credential
  rotations, escalations) each state their completeness basis: every page of a vendor's list was read (merged changes are
  merged pull requests; a push straight to the default branch is not in that population, and the protected-history and
  required-review checks show whether one is possible), or every commit on the repository's first-parent line touching a
  file was walked, or every record file committed to a folder was read (a record never committed is not there). The
  author shown for a roster change or a record is the git commit author, which git does not verify. Each row carries what you would sample on: for a change,
  its author, approvers and whether an approval came from someone else; for a deployment, who started the run that made
  it, who approved the production environment, and whether that approval was independent.
- **The design of an Open Autonomy project** is read from its public repository at a named commit: who is in scope and
  what each may authorize (`.open-autonomy/config.yaml` `team`), every place a person acts and where that act is
  recorded (`seams`), the vendor accounts whose administrators are people in scope, and the workflows that land changes
  and reach production. That changes land through reviewed pull requests is tested by the daily required-review check
  on the default branch, not taken from the workflow's name. Agents do the development work; people act only at those seams, through one of three doors: a
  commit to a declared file merged under review, the code host's gate with a named reviewer (an environment approval, a
  protected tag), or a platform key no agent holds. A chat message is never the record of an act.
- **A person's own acts** (a policy's latest approval, acknowledgments, quizzes and attestations, access review sign-off,
  incident closing, a risk's treatment, a vendor's review, a self-attestation) must reach the organization's private
  workspace repository through a pull request that person signed: approved at the exact commit merged (Evidence Desk
  prepares such a pull request for them, from a branch `sign/<their GitHub login>/…`), or opened themselves. The
  attribution check reports every act that was not (pushed without a pull request, signed by no one it names, changed
  since merged) as a finding in the gap view. It traces each act to the commit on the default branch that brought it to
  its present content, and to the merged pull request GitHub associates with that commit, and reads that pull request's
  reviews and author against the person's GitHub account on the roster; each row says which (`via`) and, for an
  approval, when it was given (`signed_at`; the record's own date is when the act was prepared). An approval binds
  the commit it was given on; where an act rests on the person having opened the pull request, a collaborator who
  pushes to its branch is not told apart from them.
- **Completeness of people in scope**: each declared vendor account's administrators, read from the vendor (GitHub and
  Cloudflare) or from an export whose production is recorded, compared with the roster.
- **Raw responses** sit beside each GitHub population (`*.raw.json`) with the account whose token read them and, for
  every request, GitHub's `x-github-request-id` and the time GitHub answered, so any response can be raised with GitHub.
  A deployment row is independently approved only when someone other than whoever started the run approved the
  environment on the run that built the commit deployed.
- **Configuration changes**: who changed the default branch's rules, from each ruleset's version history on GitHub
  (with what changed and whether it weakened them), and who changed the Cloudflare account, from its audit log (with
  the old and new value). A change by someone not on the roster, or by no one the vendor names, is an exception.
- **What reached production on Cloudflare**: every deployment of the Worker, with who made it and the commit its
  version was tagged with, matched to the GitHub deployments; one no approved GitHub deployment accounts for is an
  exception.
- **Non-human access**: deploy keys, repository and environment secrets (with when each was last set), app installations
  and the project's agents, as of the collection. A recorded credential rotation the secret's own date does not show is
  an exception.
- **Access changes** (`collect access-changes`): every account added to, removed from or re-roled on the GitHub
  organization and the Cloudflare account, from the daily member snapshots compared day over day, with the Cloudflare
  audit log's exact time and actor where it records the event, and each person's register start and end dates beside
  the system's date. The roster's own history is a separate population of who holds authority in the project.
- **Cloudflare API tokens** (`collect cloudflare-tokens`): every token the account's audit log records, from its first
  entry to the period's end, with its owner, who created and revoked it, whether it was live at the end, and how many
  Worker deploys its owner made in the period. Every person's token live at the end is an exception, marked for its
  owner's deploys.
- **Seam records** (incidents, break-glass changes, credentials, escalations) are listed with each record's full git
  history (`*.history.txt`): a record edited after it was added shows every change with its author and dates.
- **Continuous checks** (two-factor enforcement, required review and protected history, bypasses of the default
  branch's rules, dependency and secret-scanning alerts, TLS and HTTPS settings, and who made each change in the
  Cloudflare account's audit log since the last run, with every Worker deploy and setting change made by a service
  account) run daily in the workspace
  repository;
  each result, the snapshot it was decided from and its first failure date are kept.

## What to test, and how

- Re-perform a population's query: every record names it.
- Sample from a population, then trace each sample to the vendor: the pull request, its reviews, the Actions run and its
  approvals.
- For a signed act, open the pull request the attribution check names, and confirm that the person the act names
  approved it at its final commit (the review shows the commit it was given on), or authored it, and that the file's
  content matches.
- Compare the declared seams with the project's workflows and repository rules at the commit read: nothing a person
  does should fall outside them.

## What stays outside

Evidence Desk and Open Autonomy do not establish: state held only in vendor consoles beyond the collectors (data
handling, backups and restores, network configuration outside Cloudflare's zone settings), facts about people and their
devices beyond their own attestations, the organization's judgments (the risk assessment, management's review, the
signed assertion), vendors' own assurance reports, the penetration test, and agreements with customers. The gap view
the organization shares names each of these per control.
