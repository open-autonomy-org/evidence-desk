# Evidence Desk workspace format

A workspace is a folder that holds one organization's SOC 2 program. Its files are the data: there is no database,
index or account. The folder is a Git repository, or a folder inside one, and its history is the record of who changed
and signed what ([ADR 0003](decisions/0003-git-is-the-backend.md)): every change Evidence Desk makes is one commit of
exactly the files it wrote, and the first change to a folder in no repository makes it one. Every structured file has a JSON Schema in [`schemas/`](../schemas), and `evidence-desk validate`
checks a folder against them and against the references between files. Unknown fields and unknown CSV columns are
allowed everywhere and kept when Evidence Desk writes a file, so other tools can extend records.

## Layout

| Path | Holds | Schema |
|---|---|---|
| `evidence-desk.json` | the manifest: `schema: "evidence-desk.workspace/1"`, organization, creation time, frameworks | `workspace` |
| `scope.json` | answers to the scoping questions, and optionally the source of an answer that was not typed by a person | `scope` |
| `controls/<id>.json` | one control | `control` |
| `policies/<id>.md` | a policy's current text | Markdown |
| `policies/<id>.json` | a policy's owner and approved versions | `policy` |
| `policies/archive/<id>.v<n>.md` | the exact text approved as version n | Markdown |
| `registers/people.csv` | people: `id,name,email,role,start_date,end_date,notes` | `register-people` (per row) |
| `registers/systems.csv` | systems: `id,name,kind,owner,description,data,in_scope` | `register-systems` |
| `registers/vendors.csv` | vendors: `id,name,service,data_access,criticality,assurance,last_review,owner` | `register-vendors` |
| `registers/risks.csv` | risks: `id,title,description,likelihood,impact,treatment,controls,owner,status,review_due` | `register-risks` |
| `registers/vulnerabilities.csv` | vulnerabilities: `id,title,severity,system,source,found_on,due_on,fixed_on,owner` | `register-vulnerabilities` |
| `forms/<id>.json` | a quiz, survey or acknowledgment people complete | `form` |
| `forms/responses/<id>.json` | one person's graded response | `response` |
| `reviews/access/<id>.json` | one access review of one system | `access-review` |
| `incidents/<id>.json` | one incident from report to closing review | `incident` |
| `sources/open-autonomy/<commit>.json`, `latest.json` | what an Open Autonomy project declared at a commit | `open-autonomy` |
| `sources/open-autonomy/completeness/<id>.json` | one vendor account's administrators compared with the roster | `completeness` |
| `sources/open-autonomy/seam-records/<seam>.json` | the latest collection of one commit seam's records, with its findings | none |
| `sources/github/attribution.json` | the latest check of who recorded each signed act | none |
| `collectors.json` | which collectors are enabled and their parameters (never credentials) | `collectors` |
| `checks/runs/<id>.json` | one run of the enabled collectors and every check result | `check-run` |
| `evidence/files/collected/<collector>/<run>.json` | what a collector read in a run, with the requests it made | JSON |
| `audits/<id>/engagement.json` | one audit engagement: Type 1 as of a date or Type 2 over a period | `engagement` |
| `audits/<id>/requests/<request>.json` | one of the firm's requests, its answers, samples and conversation | `audit-request` |
| `audits/<id>/drafts/*.md` | the system description, management assertion and bridge letter drafts | Markdown |
| `trust.json` | what the trust center may publish; nothing else is published | `trust` |
| `certifications/<id>.json` and the document beside it | an audit report, certificate or self-attestation the organization holds, with the document's SHA-256 | `certification` |
| `questionnaires/<id>.json` | one security questionnaire, its answers, sources and review state | `questionnaire` |
| `answers.json` | reviewed answers kept for reuse, with the facts they cite | `answer-library` |
| `frameworks/<framework>.json` | the organization's exclusions and extra mappings for an additional framework | `framework-settings` |
| `evidence/records/<id>.json` | one evidence record | `evidence` |
| `evidence/files/` | evidence files | any |
| `AGENTS.md`, `CLAUDE.md` | instructions for a coding agent working in the folder | Markdown |

Registers are RFC 4180 CSV with a header row; open them in any spreadsheet. Multi-valued cells (a risk's `controls`)
separate values with semicolons. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC.

A workspace may live in a synced folder. When two people change a record at once, the sync service may leave a
conflict copy beside it (Dropbox's "conflicted copy", Google Drive's "(1)", iCloud's " 2", Syncthing's
".sync-conflict-"); the copy is never read, so each is a validation error naming the record it copies, until its changes
are merged into that record and the copy is deleted. Every write replaces a file whole (written beside it, then
renamed), so a reader never sees a half-written record.

## References and identity

- A record's `id` equals its file name. People are referred to by their `id` in `registers/people.csv`: a control's
  or policy's `owner`, a policy approval's `approved_by` and an evidence record's `recorded_by` must name a person.
- A control's `criteria` are SOC 2 Trust Services Criteria identifiers (`CC6.1`, `A1.2`, ...). An applicable control's
  `policies` must exist. An excluded control (`applicable: false`) carries an `exclusion_reason`.
- An evidence record names the controls it supports and each file with its SHA-256. When a file's bytes change, the
  record no longer describes it: validation warns and the gap view shows the control's evidence as changed. Record
  the new content as new evidence rather than editing the old record.
- A policy version names the archive file and the SHA-256 of the text approved. An archive that no longer matches is
  an error. Text edited after approval is shown as unapproved changes until someone approves a new version.

## Scope and adoption

`scope.json` answers the questions in [`catalog/scope-questions.json`](../catalog/scope-questions.json). Security is
always in scope; Availability, Confidentiality, Processing Integrity and Privacy are in scope when their question is
answered `true`. Adoption copies the [control library](../catalog/controls.json) into `controls/`: a control applies
when one of its criteria's categories is in scope and every `when` condition matches the answers; otherwise it is
written as excluded with the reason. Adopting again after the answers change updates only `applicable` and
`exclusion_reason` on controls that came from the library (`catalog`), and adds policies newly needed. Owners,
statuses, notes and policy text are never changed by adoption.

The control library and criteria titles are this project's own wording. The AICPA's criterion text and points of
focus are not included. Policy templates are adapted from CC0 sources or written here; see each template's header.

## Writing safely

Evidence Desk reads a file, remembers the SHA-256 of what it read, and refuses to write if the file changed in the
meantime. Writes go to a temporary file in the same folder and are renamed into place. Two people or tools editing
the same file therefore never lose each other's work silently; the second writer is told to reload. This protects
cooperating writers only; it is not a lock against a tool that ignores it.

## Operating the program

Forms are adopted with the controls they support. A response names the form version it answered (by SHA-256), the
person, how the person was identified (`identity`), the answers, a quiz score and whether it passed; an acknowledgment
of policies also records the approved version of every policy in force. A passing response is recorded as evidence for
the form's controls with the person as `subject`. A failed response is kept but proves nothing.

An access review starts from a user listing file in the workspace and says how the listing was produced, so its
completeness can be checked. Every account gets a decision; removals and changes carry the date they were done; only
the named reviewer signs off. A signed-off review becomes evidence for the access review controls (and privileged access
when a privileged account was reviewed). An incident keeps a timeline; closing it requires a post-incident review and a
record of who was notified or why no one needed to be. A closed incident becomes evidence for incident handling.

Evidence about one person (a background check, an offboarding) names them as `subject`.

`evidence-desk obligations` derives what is owed from the files: periodic controls one interval after their latest
evidence; each current person's forms within the form's `due_within_days` of their start date and yearly after for
annual forms; a background check by the start date when required and access removal the day after a person's
`end_date`, both owed by the owner of that control and naming the person as `subject`;
yearly reviews of medium and high criticality vendors; risk `review_due` dates; vulnerability `due_on` dates; and open
incidents. An overdue obligation is a gap on its controls. A vulnerability fixed after its due date is shown as done and
flagged as an exception to report.

## Open Autonomy projects

`evidence-desk open-autonomy import` reads an Open Autonomy project's committed files at one commit (through
`git show`; nothing else is read): the `team` roster and `seams` declaration in `.open-autonomy/config.yaml`, the agent
setup in `.open-autonomy/agent.json`, the kit record, and the landing and production workflows. The snapshot names the
commit. A scoping answer those files determine is filled when it is empty or was filled from the project before, and its
`sources` entry names the project and commit; an answer a person gave that the project contradicts is reported, not
changed. People, vendors and the repository are added to the registers when absent; a differing name is reported.
Reading a later commit reports which declarations changed.

A seam is expected to use one of ADR 0008's three doors (`commit`, `code-host-gate`, `platform-key`) and a scope some
roster member holds; anything else is a finding in the gap view. Each declared vendor account's administrators are
compared with the roster, from GitHub for a GitHub organization or from an exported list otherwise; an administrator
outside the roster is a finding until a later check no longer finds them.

A commit seam recorded under `records/<folder>/` whose id is `incidents`, `break-glass`, `credentials` or `escalations`
(the layout of Open Autonomy's `soc2` template) is read by `collect seam-records` as a population per seam: every JSON
record whose date (`detected_at` for incidents, `at` for break-glass and credentials, `received_at` for
escalations) falls in the period, with the commit that added it and its
author, recorded as evidence for the kind's controls. A closed incident without a review, a break-glass change without
a later review and an escalation without a response are findings in the gap view until a later collection no longer
finds them; a declared seam never collected is a finding too.

Signed acts at a seam: the workspace is kept in a private GitHub repository the roster members can review, and each
person signs the acts the workspace names them in (a form response, an access review's sign-off, a policy's latest
approval, the update that closed an incident, a risk's treatment decided by its owner, a vendor's review recorded by
its owner, a self-attestation) by approving the pull request that records them. Where the workspace's default branch is
checked out and Evidence Desk holds a preparer's token (`EVIDENCE_DESK_SIGNING_TOKEN`, an identity other than the
signer's), such a change is prepared as a pull request from a branch `sign/<the signer's GitHub login>/…`, its
description the packet (for a policy, its whole text and what signing it commits the organization to), and the signer
is asked to review it; `signing-template` writes the workflow that merges it, with a merge commit, once that account
approves its current head. Elsewhere the act is committed to the current branch, and the person may open the pull
request themselves. A register row's decision names the row's owner as the row
stood when the decision was made, so reassigning the row later does not move the decision. `collect attribution`
finds, on the default branch's first-parent line (`git log --first-parent origin/<default>`), the commit that brought
each act to its present content, and requires GitHub to associate it with a pull request merged into the default branch that the person's GitHub
account on the roster approved at the head commit merged (their latest verdict on it), or opened; each row's `via` says
which (`approved` or `opened`). The working file must hold the act as merged. A shallow clone is refused. A
roster member's act that fails this (for responses, their latest passed one per form), or changed after the check, is a
finding in the gap view, as is a check made against an earlier roster. A collaborator who pushes a commit to a person's
open pull request branch is not told apart from them where the act rests on the person having opened it; an approval
binds the exact commit. A signer
who is not on the roster is a finding. The rows are written under `evidence/files/populations/` for the audit and are
not recorded as evidence of any control: evidence dates decide when a periodic control is next due.

`remind --within <days>` keeps one issue labelled `evidence-desk` in the workspace repository for each owned obligation
that is overdue or due within those days, assigned to the owner's GitHub account on the roster (unassigned when GitHub refuses the assignee), updated when
it becomes overdue and closed once the workspace no longer shows it owed (met, or its owner or title changed, which opens
its successor); obligations no one owns share one issue that lists them. The daily workflow that `ci-template` writes runs
the attribution check (where an Open Autonomy roster was imported) and the reminders with the repository's own token.

`evidence-desk collect` writes populations under `evidence/files/populations/` with the requests that produced them:
merged pull requests with their approvals and whether an approval came from someone other than the author (`unknown`
when the source does not identify both), production deployments with their final state and, through the Actions run each
deployment's status links, who started the run, who approved the environment and whether that approval was independent,
and every change to the roster from git history.

## Collectors and checks

A collector reads one vendor with credentials taken from the environment, never from the workspace, and makes only
read requests. `evidence-desk run` executes every enabled collector, writes what each read (with the requests) under
`evidence/files/collected/` as evidence for the controls its checks cover, and records every check's result (`pass`,
`fail`, or `error` when it could not decide) in `checks/runs/`. The gap view uses each check's latest result: a failing
check is a gap on its controls, dated from the first run of the current failure; a check that could not decide, never
ran, or last ran more than two days ago is also a gap. `run` exits with status 3 when a check fails, so a scheduled
job fails and its platform notifies the owner. `evidence-desk ci-template` writes a GitHub Actions workflow for the
workspace's own repository that runs the checks daily at a pinned Evidence Desk commit and commits the results; it
gates nothing.

The GitHub collector covers two-factor enforcement for the organization, a required approving review and protected
history on each checked repository's default branch, overdue critical and high Dependabot alerts, and open
secret-scanning alerts. The Cloudflare collector (`CLOUDFLARE_API_TOKEN`, an account id or name and optionally zone
names) covers two-factor authentication for every accepted member (or the account enforcing it), and each zone's minimum
TLS version (1.2 or later) and HTTPS-only redirect. Roster completeness reads a Cloudflare account's administrators
(members with an administrator role, or granted access by member policies) from the same API and matches them by email
against the people register, whose emails the owner fills in (the roster names GitHub accounts, not emails).

With an imported Open Autonomy project, the daily workflow clones the project's public repository (the one named in
`sources/open-autonomy/latest.json`) and imports it again, committing what changed; the declarations are recorded as
evidence when they change, not each time they are read, so a daily read does not date the controls they evidence as
freshly reviewed, and a project
that cannot be read fails the run; the system description draft (`audit … draft description`) then states how the project builds
and runs the system: its agents and schedules, where people act and who may, and how a change reaches production.

## Audits

An engagement's requests come from the firm's request list (CSV: `id`, `title`, `kind` of `document`, `population` or
`sample`, and `controls` separated by semicolons). Each act on a request is recorded in its thread with who acted and on
which side. The client attaches evidence, attaches the population a sample is drawn from, answers each sample and
submits; the firm selects samples from the attached population, marks a sample an exception, and accepts or returns the
request. A request cannot be submitted without evidence or with a sample unanswered.

Drafts are generated once from the workspace (scope, registers, policies, controls, exclusions, incidents and approvals
in the period), name their sources, and mark with brackets what only management can write. They are never
regenerated over an existing file.

`audit export` writes a package: `manifest.json` (schema `audit-package`) lists every file under `workspace/` with its
SHA-256, and holds exactly what the engagement's requests point at, with the engagement, drafts, named controls and the
approved text of their policies. It refuses when a referenced record or file is missing or changed. `audit verify`
checks a package offline. The firm answers in the package's request files (by hand or with `audit package-serve`), and
`audit import-return` brings its messages, samples, exceptions and statuses back; a request the client changed since the
export keeps the client's status and the difference is reported. A hash shows that a file is unchanged, not who made it.

A firm keeps `firm.json` (schema `firm`) listing its clients' workspace folders. `evidence-desk firm` reports each
client's engagements, request counts, exceptions and readiness separately.

## Trust center and questionnaires

`evidence-desk trust build` writes a static `index.html` from the workspace, publishing only what `trust.json` lists:
the categories in scope, the organization's audits and certifications, titles and approval dates of named policies, high-criticality vendors as subprocessors, and documents offered on request through the
security contact. The organization hosts the folder wherever it likes.

**Audited or certified only with the document.** The page says the organization was audited or certified only where
`certifications/` holds the document that says so: an independent auditor's report (SOC 2, SOC 3) or a certifying
body's certificate (ISO/IEC 27001, ISO/IEC 42001, AIUC-1), uploaded with `evidence-desk certifications <dir> add` and
held with its SHA-256. A document whose hash no longer matches, or a certificate past its `valid_until`, is not
claimed. A self-attestation (such as CSA STAR Level 1) is the organization's own and is always shown as self-attested.
Without an auditor's document the page shows readiness instead: evidence for how many applicable controls, how many
criteria in scope are ready, and an audit under way only where an engagement records one.

**Badges.** The same statements are written as images for a README or a project page: `badges/<id>.svg`, one per
current document (green for an auditor's report or certificate, blue and labelled self-attested for a
self-attestation), and a grey readiness badge for each framework in `evidence-desk.json` that no auditor's document
covers ("SOC 2: readiness 23/46 controls", ISO/IEC 27001 counted in requirements). `badges.json` lists them with
their message, tone, colour, the document each rests on, the day each stops standing (`until`) and the date built.
They are written only when `trust.json` publishes the report section, and say nothing the page does not.

**On an Open Autonomy project page.** `evidence-desk trust <dir> publish` sends the same badges, with the section's
text as the body, to an Open Autonomy project as the owner's statement "Compliance" (Open Autonomy's ADR 0012): a row
in the dashboard's rail under "Stated by the owner", its page, and a README badge row the platform serves. It needs
`OPEN_AUTONOMY_BASE_URL` (the platform, ending in `/v1`) and `OPEN_AUTONOMY_KEY`, the project's steer key, which the
owner mints and keeps with the workspace, never in the project's repository. Each badge stands until its `until`: a
certificate's expiry; an audit report's period end plus one year (the usual reliance window, after which customers ask
for a bridge letter), or its issue date plus one year where it records no period; a self-attestation's issue date plus
one year; readiness 30 days after it was counted. Publish again when anything changes, and at least monthly while
readiness is shown; an unchanged publication is not a new revision there.

A questionnaire is imported from a CSV, or the first worksheet of an Excel (.xlsx) workbook, with a question column. Each question is first matched against the answer
library; a reviewed answer whose cited files are unchanged is reused as reviewed, and one whose facts changed is marked
`needs-review`. Otherwise the answer is drafted by quoting the applicable controls, the reasons for excluded ones, and
approved policy text that match the question, each cited with its file and SHA-256; a question with no matching fact is
left `unanswered`. A draft carries a marker and cannot be marked reviewed until a person replaces it with their answer.
Only reviewed, current answers are exported. Drafting uses no AI service; a customer's own coding agent may refine
drafts in the files.

## Targets

The manifest's `frameworks` lists the frameworks the program targets; SOC 2 is always one
([decision 0002](decisions/0002-frameworks-are-targets.md)), and a list without `soc2` fails validation.
`evidence-desk frameworks <dir>` lists the targets with what each can become (an audit report, a certificate, or a
self-attestation) and how far the program is; `frameworks <dir> available` lists every framework Evidence Desk maps;
`frameworks <dir> target <id>` and `drop <id>` add and remove one, and adoption then runs again. Dropping deletes
nothing: settings and evidence stay for when it is targeted again.

What applies and what is needed are separate. A control's `applicable` is the scoping decision alone: it applies unless
one of its own scoping conditions fails. Which SOC 2 categories the report covers is SOC 2's scope, worked out when
read, so a control excluded only by a category answer is applicable and simply not in SOC 2's scope. A control is
*needed* when it is in SOC 2's scope or a target's requirement (not excluded in its settings) maps to it; the program's
work (checks, obligations, collectors, the controls list, gaps) is on needed controls, and SOC 2's deliverables (the
audit packet, the system description) on controls in SOC 2's scope, with the same exclusions and reasons as before.
Adoption writes a file for every control that carries a SOC 2 criterion, and for any other only once a target needs it.

A document in `certifications/` may name its `target` (`--target <id>`); a current document for a target replaces its
readiness badge, and a self-attestation lapses a year after it is made.

### ISO/IEC 27001

`evidence-desk frameworks <dir> target iso27001` adds ISO/IEC 27001:2022 to the targets. Its clauses 4 to
10 and 93 Annex A controls ([catalog/frameworks/iso27001.json](../catalog/frameworks/iso27001.json), identifiers with this
project's titles and no ISO text) map onto the same controls, so one piece of evidence serves both frameworks. A
requirement whose mapped controls are all excluded is excluded with their reasons; one no control addresses stays open
until it is mapped to a control or excluded with a reason in `frameworks/iso27001.json`. `evidence-desk soa` writes the
statement of applicability as CSV or Markdown.

### AI frameworks: ISO/IEC 42001 and AIUC-1

`frameworks <dir> target iso42001` adds ISO/IEC 42001:2023, the AI management system standard: its clauses 4 to 10
(with the AI system impact assessment of 6.1.4) and its 38 Annex A controls, identifiers with this project's titles
([catalog/frameworks/iso42001.json](../catalog/frameworks/iso42001.json)). `frameworks <dir> target aiuc1` adds AIUC-1,
the standard for AI agents: its 51 current requirements across data and privacy, security, safety, reliability,
accountability and society ([catalog/frameworks/aiuc1.json](../catalog/frameworks/aiuc1.json)). AIUC-1's terms forbid
reproducing its text, so the catalog holds only its identifiers and this project's titles; read the standard at its
source. Its eight supplemental requirements are marked `optional`: listed with their status, not counted toward
readiness. Certification against it is yearly, with quarterly retests. `soa <dir> --framework iso42001` writes ISO/IEC 42001's statement of applicability, its 38 Annex A controls
included or not and why.

Both map onto the AI family of controls (AI-01 to AI-12: the AI governance policy, the AI system inventory, human
oversight, risk and impact assessment, activity records, testing before release and each quarter, controlled change,
data for AI, transparency, limits on agents, safeguards on inputs and outputs, and AI failure plans), and onto the
security controls they share with SOC 2. The AI family meets no SOC 2 criterion, so it is adopted only when an AI
framework is targeted, with the `ai-governance` policy, and never appears in SOC 2's deliverables. For an Open Autonomy
project, the import's declarations also evidence the inventory, oversight, change and limits controls (AI-02, AI-03,
AI-07, AI-10) while they are needed.

`evidence-desk collect <dir> open-autonomy --account <owner/project> --period <start>..<end> --by <person>` reads
what the project's agents did in the period from the Open Autonomy platform, on the project's own key or its org's
(`OPEN_AUTONOMY_BASE_URL`, `OPEN_AUTONOMY_KEY`; any other key is refused, since it would read the public's view with
panels closed and money withheld), and records four populations with the platform's answers kept whole as provenance:
the agent sessions that started in the period, or up to a day before it and were still running when it began (AI-05); every metered call
(AI-05, AI-10); every request and report of the agent's operating state, with the project's request, its org's and
the report in force when the period began (AI-03); and every revision of the roadmap with its changes (AI-07). It reads
every page back past the period's start and refuses a list the platform cannot page, since a population read from one
page could be incomplete. It reads all four before writing anything, so a failure records nothing, and it records
nothing while no targeted framework needs the AI family.

### Self-attestations: NIST AI RMF and NIST CSF 2.0

A framework whose outcome is a self-attestation has no certifying body: the organization signs its own statement.
`frameworks <dir> target nist-ai-rmf` adds the NIST AI Risk Management Framework 1.0: its 72 subcategories under Govern,
Map, Measure and Manage ([catalog/frameworks/nist-ai-rmf.json](../catalog/frameworks/nist-ai-rmf.json)), mapped onto the
AI family and the security controls. `frameworks <dir> target nist-csf2` adds the NIST Cybersecurity Framework 2.0: its
106 subcategories under Govern, Identify, Protect, Detect, Respond and Recover
([catalog/frameworks/nist-csf2.json](../catalog/frameworks/nist-csf2.json)), mapped onto the same controls as SOC 2.
Where no control genuinely covers a subcategory, it maps to none and the organization states its position on it.

Each requirement has a position: *met* when it is ready, *excluded* when the organization excludes it with a reason,
or a position the organization states in `frameworks/<id>.json` under `positions`:
`framework <dir> <id> position <requirement> --partial|--not-met --statement <text>` (and `--clear`).
`frameworks <dir> attest <id> --by <person>` is refused while a required requirement has no position; otherwise it
renders the attestation from the records (every requirement, its position, and the controls and evidence behind a met
one, the reason behind an exclusion, the statement behind the rest) and records it in `certifications/` as a
`self-attestation` with its `target` and hash. The badge says self-attested; the document discloses everything not met.
An attestation is a signed act: merge it through your own pull request, and `collect attribution` checks it like a
policy approval. It lapses a year after it is signed.

## Readiness

`evidence-desk gaps` derives readiness from the files each time. An applicable control is ready when it has an owner,
its status is `implemented`, each of its policies has an owner and an approved current text with no unfilled
`{{placeholders}}`, and it has evidence that is not older than its frequency allows and whose files are unchanged. A
criterion is ready when at least one applicable control addresses it and all of them are ready. Readiness is a
statement about the workspace, not an audit opinion.
