# Changelog

Hermes PM distills notable changes consolidated into main here, with commit or merged-PR sources.
Group related changes by their effect; omit routine activity and planning-only edits. Landed does not mean
released: keep changes under Unreleased until release evidence supports a version and date.
Outstanding release, adoption or verification outcomes stay in [ROADMAP.md](ROADMAP.md).

## Unreleased

- Added ordered manual interrupted-write recovery guidance and a runnable synthetic demonstration:
  account for writers, preserve an independent quiescent copy, inspect current data, validate/reopen,
  and remove only confirmed-abandoned protocol paths before choosing a new edit. Independent native
  review repeated the documented sequence in a fresh World folder, verifying live-writer refusal,
  owned-child interruption, exact lock cleanup, unknown/external-value and evidence preservation,
  backup independence and a deliberate successful edit. The unchanged check passed in 4.397 seconds.
  This is documentation acceptance on Linux aarch64/local ext4 with Bun 1.3.10, not power-loss durability,
  automatic repair, customer adoption or publication; the fixed preview assets are unchanged.
  ([PR #74](https://github.com/open-autonomy-org/evidence-desk/pull/74),
  `2f9a6f2cf95fc277fd40909557244f9bf9fa3fdc`, [native acceptance, run 30](hermes:task/t_366259d0),
  [independent execution](hermes:session/20260910_121629_940590))

- Consolidated README into an ordered fresh-source synthetic walkthrough: setup precedes summaries,
  ordinary-user commands are separate from fleet prerequisites, and external editing, invalid-reference
  correction and safe Markdown sharing form one runnable handoff. The fixed unpublished preview remains
  explicitly distinct. Independent native review operated two fresh-clone World rehearsals, reconciled
  report facts and full read/refusal preservation, and passed the unchanged check in 2.085 seconds.
  This is documentation acceptance, not customer adoption or publication.
  ([PR #71](https://github.com/open-autonomy-org/evidence-desk/pull/71),
  `2a5dcc8caf2dedbd987e229aa699a5d80a29a815`, [native acceptance, run 26](hermes:task/t_f78cbdd0))

- Corrected community source reads to pin current main and read committed documents without changing
  a preserved worker checkout. Active and committed community skills match at 2.3.1; independent native
  review verified full synthetic workspace preservation and an honest failed-fetch freshness gap.
  PM subsequently verified adoption in the next ordinary scheduled run and its delivered report.
  This is a development-fleet correction, not a product release or exhaustive source-coverage claim.
  ([PR #67](https://github.com/open-autonomy-org/evidence-desk/pull/67),
  `5e856eba9a6ce106bea340a4de351e3cc2d25958`, [native acceptance, run 22](hermes:task/t_2615f453),
  [observed run](hermes:session/cron_0538d914b691_20260910_075056),
  [delivery](https://discord.com/channels/1544906154868744202/1546981849979682916/1547514909796073512))

- Added read-only `workspace summary` in human and deterministic JSON views: all status counts,
  overlapping follow-up counts, item paths and warnings without context/evidence bodies or audit claims.
  Invalid workspaces fail without partial totals; external edits are reread and workspace bytes preserved.
  The report schema is independent of workspace format 1, and the source allowlist includes the new module.
  Owner/status/follow-up selectors now intersect without hiding invalid excluded records. Unfiltered
  schema 1 remains unchanged; filtered schema 2 labels whole-workspace and selected counts, including
  empty/no-match results and safely quoted user strings. Native review accepted selection after its
  independent 166-command rehearsal and separate 38-command probe; unchanged check passed in 1.667s.
  Standalone `--markdown` now presents the same facts and selectors with inert, reversible authored
  strings, explicit derived-report limitations and no partial document on workspace-validation failure.
  Independent native review exercised 245 World invocations, 14 Markdown/JSON reconciliations and
  12 refusal scenarios with source preservation; unchanged check passed in 1.649s.
  These summary features are after, and absent from, the fixed `0.1.0-alpha.1` candidate and review assets.
  ([PR #63](https://github.com/open-autonomy-org/evidence-desk/pull/63),
  `89637675fa407946d32ac13ad66be3b76005c8be`, [native acceptance, run 18](hermes:task/t_1f2de365);
  [PR #65](https://github.com/open-autonomy-org/evidence-desk/pull/65),
  `e3745b560152c080e09a9515ef30715b8d16d686`, [native acceptance, run 20](hermes:task/t_5362d9cb);
  [PR #69](https://github.com/open-autonomy-org/evidence-desk/pull/69),
  `3c3d9ce1607dfdd9f55e7a1e01c48912db60f4ef`, [native acceptance, run 24](hermes:task/t_0f8efb43))

- Added reproducible, allowlisted source-archive preparation from a full committed SHA, with checksum,
  provenance and pinned toolchain metadata; documented extracted installation, experimental SemVer
  compatibility and human-only publication. The private product version is proposed as `0.1.0-alpha.1`,
  separate from workspace format 1. Native review reproduced the archive and extracted CLI/preservation
  workflow. The extracted development-check discrepancy was subsequently resolved as a `noexec`
  filesystem prerequisite, without product/check changes; candidate-specific executable-directory
  verification passed in [native review run 15](hermes:task/t_a488f630). Historical failures remain failed;
  human review/publication are still pending.
  ([PR #59](https://github.com/open-autonomy-org/evidence-desk/pull/59),
  `cbef9a2137908df60f298443cb4cebc340f5c3a1`, [native acceptance, run 12](hermes:task/t_4116639b))

- Added local readiness-item creation/update with ID renaming and existing Markdown/evidence associations,
  preserving unknown values and untouched files. A cooperating-writer lock and stale-manifest check
  refuse detected external conflicts; this is not atomic compare-and-swap against arbitrary writers.
  Writes also refuse manifest-alias references and lossy numeric reserialization without narrowing
  read-only format version 1. Native review accepted the rework at
  `af24783ee915d4371fe4432d206bb9b89610c1f0`, independently exercising workflow, conflict/failure recovery
  and 60 byte-preserving refusals; its unchanged check passed in 1.641s. Crash leftovers require inspected
  manual recovery. Source preparation subsequently landed as described above; human release review
  and publication remain outstanding.
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
