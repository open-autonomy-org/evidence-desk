# Evidence Desk workspace format

A workspace is a folder that holds one organization's SOC 2 program. Its files are the data: there is no database,
index or account. Every structured file has a JSON Schema in [`schemas/`](../schemas), and `evidence-desk validate`
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
| `collectors.json` | which collectors are enabled and their parameters (never credentials) | `collectors` |
| `checks/runs/<id>.json` | one run of the enabled collectors and every check result | `check-run` |
| `evidence/files/collected/<collector>/<run>.json` | what a collector read in a run, with the requests it made | JSON |
| `audits/<id>/engagement.json` | one audit engagement: Type 1 as of a date or Type 2 over a period | `engagement` |
| `audits/<id>/requests/<request>.json` | one of the firm's requests, its answers, samples and conversation | `audit-request` |
| `audits/<id>/drafts/*.md` | the system description, management assertion and bridge letter drafts | Markdown |
| `evidence/records/<id>.json` | one evidence record | `evidence` |
| `evidence/files/` | evidence files | any |
| `AGENTS.md`, `CLAUDE.md` | instructions for a coding agent working in the folder | Markdown |

Registers are RFC 4180 CSV with a header row; open them in any spreadsheet. Multi-valued cells (a risk's `controls`)
separate values with semicolons. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC.

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
annual forms; a background check by the start date when required; access removal the day after a person's `end_date`;
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

`evidence-desk collect` writes populations under `evidence/files/populations/` with the requests that produced them:
merged pull requests with their approvals and whether an approval came from someone other than the author (`unknown`
when the source does not identify both), production deployments with their final state, and every change to the roster
from git history.

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
secret-scanning alerts.

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

## Readiness

`evidence-desk gaps` derives readiness from the files each time. An applicable control is ready when it has an owner,
its status is `implemented`, each of its policies has an owner and an approved current text with no unfilled
`{{placeholders}}`, and it has evidence that is not older than its frequency allows and whose files are unchanged. A
criterion is ready when at least one applicable control addresses it and all of them are ready. Readiness is a
statement about the workspace, not an audit opinion.
