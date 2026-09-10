# Changelog

Hermes PM distills notable changes consolidated into main here, with commit or merged-PR sources.
Group related changes by their effect; omit routine activity and planning-only edits. Landed does not mean
released: keep changes under Unreleased until release evidence supports a version and date.
Outstanding release, adoption or verification outcomes stay in [ROADMAP.md](ROADMAP.md).

## Unreleased

- Added local readiness-item creation/update with ID renaming and existing Markdown/evidence associations,
  preserving unknown values and untouched files. A cooperating-writer lock and stale-manifest check
  refuse detected external conflicts; this is not atomic compare-and-swap against arbitrary writers.
  Writes also refuse manifest-alias references and lossy numeric reserialization without narrowing
  read-only format version 1. Native review accepted the rework at
  `af24783ee915d4371fe4432d206bb9b89610c1f0`, independently exercising workflow, conflict/failure recovery
  and 60 byte-preserving refusals; its unchanged check passed in 1.641s. Crash leftovers require inspected
  manual recovery; packaging and human release review remain outstanding.
  ([PR #56](https://github.com/open-autonomy-org/evidence-desk/pull/56),
  [PR #57](https://github.com/open-autonomy-org/evidence-desk/pull/57),
  [native acceptance, run 10](hermes:task/t_23847d50))
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

- Added the first local workspace CLI and version 1 JSON/Markdown file contract: create a new or empty
  workspace, reopen externally authored readiness items, inspect incomplete work, and validate records
  and evidence references. Read operations preserve unknown data and evidence bytes; occupied destinations,
  unsupported formats and unsafe references are rejected. Native review independently verified synthetic
  workflows through the World and passed the check in 0.674s. Item editing and bounded stale-write
  refusal subsequently landed as described above. ([PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38),
  [native acceptance](hermes:task/t_669122cc))
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
