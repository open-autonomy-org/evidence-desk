# Changelog

Hermes PM distills notable changes consolidated into main here, with commit or merged-PR sources.
Group related changes by their effect; omit routine activity and planning-only edits. Landed does not mean
released: keep changes under Unreleased until release evidence supports a version and date.
Outstanding release, adoption or verification outcomes stay in [ROADMAP.md](ROADMAP.md).

## Unreleased

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
