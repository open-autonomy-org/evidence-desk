# Changelog

Hermes PM distills notable changes consolidated into main here, with commit or merged-PR sources.
Group related changes by their effect; omit routine activity and planning-only edits. Landed does not mean
released: keep changes under Unreleased until release evidence supports a version and date.
Outstanding release, adoption or verification outcomes stay in [ROADMAP.md](ROADMAP.md).

## Unreleased

- A failing daily check no escalation record answers is an exception: the alert reached no one. A claim is evidenced
  only by a line that records one of the acts it states (a table row by its columns), not just its date and subject.
- A deploy outside the change path is found the day it happens: the daily Cloudflare check reads the last day of the
  account's audit log and fails on a change by no one it can name or no one on the roster, and on a Worker deployed by
  a person rather than the pipeline's service account. The package is not exported while an exception has no
  management response; `audit <dir> <id> exceptions` lists the register and which rows are answered. A Cloudflare token is paired with its revocation by the owner the vendor records on it, and an
  incident's exception is dated by its record's detection. A response sentence that names nothing of its own is
  evidenced only by a line naming its exception's subject, and an account the package names is a claim's subject.
  Twin: volter-ai/twin a064847c.
- Evidence is labelled by where it came from (vendor record, client record, client narrative) instead of
  "system-evidenced", and a claim needs a line naming its subject, not just its date. Access changes come from the
  daily snapshots of GitHub and Cloudflare membership. A recurring internal-audit finding is one exception. Changes
  record whether a person or an agent account wrote and approved them. The production timeline ends with the changes
  merged but not deployed by the period's end. A Cloudflare token created without a revocation is an exception.
  Client documents and registers carry their history; a document dated after its own contents is an exception.
- A package no longer carries claims its evidence does not support: `review/claims.csv` ties every dated claim in the
  description, assertion and management responses to the packaged files that record that date, and checks every count
  against its population; an unsupported or contradicted claim stops the export, as does an open exception the
  assertion does not name. Incidents are exceptions; a deployment outside the change path closes when an approved one
  replaces it. `review/identities.csv` lists every identity seen acting with the access review that covered it, and
  `review/production-timeline.csv` what ran in production and what it shipped. The package carries every in-window
  record of each applicable control. An import reads the project's ADRs and whether each answers the soc2 checklist;
  restore tests and internal audits are record populations. Branch-rule checks read only default-branch rulesets.
- What reached production is reconciled: `collect cloudflare-deployments` matches every Worker deployment to the GitHub
  deployments by commit, and a deploy no approved GitHub deployment accounts for is an exception. `collect
  nonhuman-access` lists deploy keys, secrets, app installations and agents; a recorded credential rotation the secret's
  own date does not show is an exception. Coverage tells a control backed only by an automated check from one with an
  evidence record. Twin: volter-ai/twin 399be247.
- Configuration changes are populations: `collect github-rule-changes` reads each ruleset's version history (who changed
  the rules, what changed, whether it weakened them) and `collect cloudflare-changes` the Cloudflare account's audit log
  (who changed what, old and new value). A change by someone not on the roster or not named is an exception. The package
  manifest names the workspace commit it was exported from and where that commit is published. The Globex quarter runs
  as a repeatable scenario (`scenarios/globex-quarter/`). Twin: volter-ai/twin 0570d603, 2554c085.
- An audit package is built for a firm to test from rather than to take on trust. `review/index.html` and its tables
  (a control matrix flagging applicable controls with no evidence in the period, an exceptions register with when each
  deviation occurred, was found and was resolved and management's response, and every automated check's reading on
  every day of the period with the collector snapshot and hash it was decided from) are derived from the packaged files
  and hashed with them, as is the README. Populations come from the system of record with their raw responses (GitHub's
  request id and answer time for each, and whose token read them): every commit on the default branch reconciled to a
  merged pull request or listed as a direct push, with who merged and whether the approval covered the merged commit;
  each deployment's approved run matched to the commit deployed, its conclusion, and whether its starter and approver
  hold the declared seams' scopes; each seam record with its full history. A daily check reports every bypass of the
  default branch's rules. Cited files travel with what cites them, and a cited file the workspace lacks is listed in
  the manifest. Drafts refuse export until filled and name the deviations found, a catalog template cannot be approved
  as policy, and an access reviewer deciding their own account is an exception. Shaped by blind reviews of a
  quarter run in the World against the GitHub and Cloudflare twins
  ([volter-ai/twin 5349b9b5, bbebcc63](https://github.com/volter-ai/twin/commits/main)).

## 0.1.0 - 2026-09-24

Released as [v0.1.0](https://github.com/open-autonomy-org/evidence-desk/releases/tag/v0.1.0) at 873506f.

- A project with several workflows gated on its production environment (release, deploy, administration) is read
  whole: the deploy-v* one is the production deploy, every one's egress names vendors, and the system description names
  them all. Found reading Open Autonomy's own repository, where only the last such workflow had been kept.
- Questionnaires import from Excel (.xlsx) workbooks as well as CSV (the first worksheet, read with no dependency).
  Unsaved edits on a page survive another form on it being saved. Sync-service conflict copies beside a record are
  validation errors naming the record. A new workspace's `AGENTS.md` names the command and holds an agent to leaving a
  person's act for that person to record; a headless coding-agent session asked to record a colleague's training
  declined and said what the colleague had to do.
- Added a Cloudflare collector: two-factor authentication for every member, and each zone's minimum TLS version and
  HTTPS-only redirect; roster completeness reads a Cloudflare account's administrators from the API. The deployment
  population follows each deployment to its Actions run for who started it and who approved the environment, and
  whether that approval was independent. `collect attribution` also covers a risk's treatment and a vendor's review, and
  an act that names no one is a finding. The daily workflow reads an imported Open Autonomy project again, and the system
  description draft states how the project builds and runs the system. An import says which vendors the project stopped
  naming. Verified in the World against the GitHub and Cloudflare twins
  ([volter-ai/twin 3cc17d00, 5259999c, 3aa85aaf](https://github.com/volter-ai/twin/commits/main)).
- Demonstrated a project on Open Autonomy's `soc2` template end to end, which fixed: egress hosts of one vendor
  (`codeload.github.com`, `objects.githubusercontent.com`) are that vendor, not vendors of their own; roster history walks
  the branch's first-parent line and dates each change by when it reached the branch, so no change is lost to a history
  whose dates are not monotonic (git's `--since` stops at the first older commit) or to a rebase across the period's
  start; `remind` takes `--within <days>` so an obligation due next year is not owed today (the daily
  workflow uses 30), and an issue whose obligation moves outside the window closes as not planned; importing a project before adopting controls says to import again, and the gap view says so until
  the declarations are recorded as evidence.
- Added `collect attribution`: in a workspace kept as a GitHub repository, each act a person signs (a form response, an
  access review sign-off, a policy's latest approval, an incident's closing update) must have been brought to its present
  content by a pull request merged into the default branch and opened by that person's GitHub account on the Open
  Autonomy roster, and be unchanged since; a roster member's act that fails this is a gap finding. Added `remind`, which
  keeps one issue per owned due or overdue obligation in the workspace repository, assigned to its owner, and closes it
  once met; the daily workflow runs both. Verified in the World against the GitHub twin, whose personal tokens now own
  their writes and whose commit-to-pull-request lookup follows GitHub's default-branch rule
  ([volter-ai/twin d88ec450](https://github.com/volter-ai/twin/commit/d88ec450)). Background checks and offboarding are
  now owed by the owner of HR-01 and HR-04, never by the person joining or leaving. The daily workflow no longer writes
  an empty `env:` when no collector is enabled.
- Added `collect seam-records`: each commit seam an Open Autonomy project records under `records/` (the `soc2`
  template's incidents, break-glass changes, credential lifecycle and escalations) becomes a period population with
  the commit and author that added each record, as evidence for its controls. A closed incident without a review, a
  break-glass change without a later review, an escalation without a response and a declared seam never collected are
  gap findings. Importing a project now refreshes the people rows it wrote from the roster, and records the roster's
  scopes and seams for HR-06 (defined responsibilities). Approving a policy version records it as evidence for GOV-04. Verified in the World against the GitHub twin on a synthetic
  project created from Open Autonomy's `soc2` template
  ([open-autonomy#715](https://github.com/open-autonomy-org/open-autonomy/pull/715)).
- Added ISO/IEC 27001:2022 on the same program. Its clauses 4 to 10 and 93 Annex A controls map onto the control
  library (identifiers with this project's titles, no ISO text), so controls, policies and evidence serve both
  frameworks. Requirements are ready, have gaps, are excluded (with the reasons of excluded controls or the
  organization's own) or are not addressed; the organization's exclusions and extra mappings live in
  `frameworks/iso27001.json`. `soa` writes the statement of applicability, and the Overview switches between frameworks.
  Added control MON-04, an annual internal audit of the program. Verified on a synthetic company through the CLI and the
  Overview in Chrome.

- Added the trust center and security questionnaires. A static trust center is built from the workspace, publishing
  only what `trust.json` lists (categories, report availability, policy titles, subprocessors, documents on request),
  with every value escaped and only email or http(s) contacts linked. Questionnaires import from CSV; each answer is reused
  from reviewed answers whose cited facts are unchanged, or drafted by quoting and citing matching controls, exclusion
  reasons and approved policy text, or left unanswered. A person replaces the draft and marks it reviewed; only reviewed,
  current answers export, and a reviewed answer whose cited file changes returns to review. The Open Autonomy import now
  records each known vendor's service. Verified on a synthetic company through the CLI and the Trust page in Chrome.

- Added the audit cycle. An engagement (Type 1 as of a date, Type 2 over a period) imports the firm's request list;
  the client attaches evidence and populations, answers the samples the firm selects from them and submits; the firm
  marks exceptions and accepts or returns requests; every act is kept in each request's conversation. The system
  description (DC1 to DC9), management assertion and bridge letter are drafted from workspace facts with their sources.
  A package holds exactly what the requests point at, hashed in a manifest, is refused when a referenced file is missing
  or changed, verifies offline, and comes back with the firm's answers merged without overwriting what changed since.
  The firm has a page for answering a package and a dashboard across its clients, each read separately. Verified on
  synthetic companies through the CLI and every page in Chrome, including a full round trip.

- Added collectors and checks. Collectors read a vendor with the owner's own read-only credentials from the
  environment; a run records what each read as evidence and every check's result in `checks/runs/`, and the gap view
  shows failing checks (dated from the first failing run), checks that could not decide, never ran or went stale. The
  GitHub collector checks two-factor enforcement, required approving review and protected history on default branches,
  overdue critical and high Dependabot alerts and open secret-scanning alerts. `ci-template` writes a daily GitHub
  Actions workflow for the workspace's repository, pinned to an Evidence Desk commit, that gates nothing. The local app
  has a Checks page. Verified against the GitHub twin through a failing run, remediation and a passing run, from the CLI
  and from the page.

- Added reading an Open Autonomy project. `open-autonomy import` reads the committed roster, agent setup (ADR 0007),
  seams (ADR 0008), kit record and landing and production workflows at one commit, fills the scoping answers and
  registers they determine with the commit as source, reports what people entered that the project contradicts, and
  names declarations that changed between commits. Seams outside the three doors, and administrators of declared vendor
  accounts who are not on the roster, are gaps. `collect` records populations of merged pull requests with approvals and
  their independence, production deployments and roster history, each with the requests that produced it. The local app
  has an Open Autonomy page. Verified in the World on a synthetic kit 3.2.3 project against the GitHub twin; against the
  twin, approval independence reads as unknown because it does not identify authors and reviewers.

- Added the operation of the program. Forms (a security awareness quiz, policy and code-of-conduct acknowledgments, a
  confidentiality agreement and a device and account attestation) are adopted with their controls; a person's response is
  graded, recorded with the form version and the approved policy versions it acknowledges, and becomes evidence only when
  it passes. Access reviews start from a user listing with how it was produced, need a decision per account and a done
  date per removal, and are signed off only by their reviewer. Incidents keep a timeline and close only with a review and
  a notification record. A vulnerability register tracks due and fixed dates. An obligations calendar derives what is owed
  from periodic controls, people's start and end dates, vendors, risks, vulnerabilities and incidents, and overdue items
  become gaps on their controls. The CLI and the local app (People, Obligations, Access reviews, Incidents) share the
  same actions. Verified by hand in the World on a synthetic company through the CLI and the app's own controls in Chrome.

- Added the SOC 2 program as a folder the organization owns.
  A scoping interview decides the categories in scope and adopts 58 controls written in this
  project's own words and mapped to Trust Services Criteria identifiers (no AICPA text), with justified exclusions, and
  18 policy templates adapted from CC0 sources or written here. Controls, policies with versioned approvals frozen under
  `policies/archive/`, CSV registers for people, systems, vendors and risks, and hash-bound evidence records are validated
  against published JSON Schemas. The gap view derives readiness per control and criterion from ownership, status,
  approved policy text, placeholders and evidence freshness. A CLI with JSON output and a loopback local app share one
  set of actions; every write names the version it read and refuses a file changed on disk. The workspace ships its own
  agent instructions. Verified by hand in the World on a synthetic company: CLI refusals, external edits (evidence file,
  policy text, invalid and extended control records, tampered archive), staleness, re-scoping that keeps owners and
  edits, and the app's own controls in Chrome, including a refused stale save. No coding-agent run yet; macOS arm64 and
  Bun 1.3.10 only.

- Adopted the shared host fleet entrypoint, separated SDK readiness from historical transcript replay,
  and excluded rehearsal cache links from dirty-checkout detection. Subscription forwarding now obtains
  the host's current login through installed Codex rather than maintaining a project login copy; Codex
  owns refresh. These are setup/operator contributions, not Hermes product tasks or a product release.
  PR #79 reports installed host activation and a completed executor model response; its landing check
  passed. Recurring-run completion and report delivery remain separate operational verification.
  ([PR #76](https://github.com/open-autonomy-org/evidence-desk/pull/76),
  [PR #77](https://github.com/open-autonomy-org/evidence-desk/pull/77),
  [PR #78](https://github.com/open-autonomy-org/evidence-desk/pull/78),
  [PR #79](https://github.com/open-autonomy-org/evidence-desk/pull/79),
  `3676a69b5d5079fe94c2cc16c8102f3fd9cd033c`)
- Corrected community source reads to pin current main and read committed documents without changing
  a preserved worker checkout. Active and committed community skills match at 2.3.1; independent native
  review verified full synthetic workspace preservation and an honest failed-fetch freshness gap.
  PM subsequently verified adoption in the next ordinary scheduled run and its delivered report.
  This is a development-fleet correction, not a product release or exhaustive source-coverage claim.
  ([PR #67](https://github.com/open-autonomy-org/evidence-desk/pull/67),
  `5e856eba9a6ce106bea340a4de351e3cc2d25958`, [native acceptance, run 22](hermes:task/t_2615f453),
  [observed run](hermes:session/cron_0538d914b691_20260910_075056),
  [delivery](https://discord.com/channels/1544906154868744202/1546981849979682916/1547514909796073512))
- Enabled native file tools within the product checkout while retaining unrelated-path and credential
  restrictions. This setup/operator contribution unblocked the existing task; it was not a separate
  Hermes product execution. ([PR #55](https://github.com/open-autonomy-org/evidence-desk/pull/55))
- Corrected first-poll GitHub discovery and activated the native Hermes Python environment in terminal
  shells; exposed World tooling to login shells and preserved project-owned runtime instructions across
  kit upgrades. Setup/operator acceptance records completed recurring PM/community runs and public
  publication, concluding the temporary development hold, not approving a product release.
  ([PR #52](https://github.com/open-autonomy-org/evidence-desk/pull/52),
  [PR #53](https://github.com/open-autonomy-org/evidence-desk/pull/53),
  [PM delivery](https://discord.com/channels/1544906154868744202/1546981849979682916/1547400673287602237))
- Replaced the development fleet's Codex app-server bridge with Hermes's native agent loop and
  host-owned subscription forwarding; request bodies now support known-length forwarding and replay
  after credential refresh. These are setup/operator contributions, not new product features or Hermes
  task executions. ([PR #49](https://github.com/open-autonomy-org/evidence-desk/pull/49),
  [PR #50](https://github.com/open-autonomy-org/evidence-desk/pull/50))
- Updated World/core dependencies for attachment markers and sealed-client request guards, and adopted
  reporting recovery that preserves native worker completion. The setup record documents installed
  verification; subsequent activation acceptance is recorded in PR #52 above.
  ([PR #43](https://github.com/open-autonomy-org/evidence-desk/pull/43),
  [PR #44](https://github.com/open-autonomy-org/evidence-desk/pull/44),
  [PR #45](https://github.com/open-autonomy-org/evidence-desk/pull/45),
  [PR #46](https://github.com/open-autonomy-org/evidence-desk/pull/46))
- Established the TypeScript/Bun development starter, portable-workspace product documentation and
  project branding. ([PR #1](https://github.com/open-autonomy-org/evidence-desk/pull/1))
- Added the development runtime's host supervision, project-scoped Git forwarding and committed
  Hermes configuration refresh while preserving unfinished work and native state. The first complete
  development loop subsequently passed as task t_669122cc and PM reconciliation in PR #40.
  ([PR #22](https://github.com/open-autonomy-org/evidence-desk/pull/22),
  [PR #23](https://github.com/open-autonomy-org/evidence-desk/pull/23),
  [PR #26](https://github.com/open-autonomy-org/evidence-desk/pull/26))
- Simplified local fleet startup to one executor and the existing host entry point, and made
  public reporting follow native completion with acknowledged publication and resumable checkpoints.
  ([PR #29](https://github.com/open-autonomy-org/evidence-desk/pull/29),
  [PR #30](https://github.com/open-autonomy-org/evidence-desk/pull/30))
- Supplied pinned World tooling, documented isolated starter verification, and recorded the running
  host kit version for native maintenance. ([PR #31](https://github.com/open-autonomy-org/evidence-desk/pull/31))
- Established persistent native launchd operation and verified a supervised PM run, public session
  completion and planning landing. ([PR #33](https://github.com/open-autonomy-org/evidence-desk/pull/33))
- Kept optional background reflection off the unsupported HTTP path while retaining native task review;
  improved roadmap source-link change detection and channel-qualified report delivery configuration.
  ([PR #35](https://github.com/open-autonomy-org/evidence-desk/pull/35))
