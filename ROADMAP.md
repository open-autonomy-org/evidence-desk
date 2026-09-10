# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## workspace-relocation: Verify the folder handoff across local locations

Dispatch: fleet

PM priority: verify portability of the integrated current-source workflow before extending product
surface. The [format contract](https://github.com/open-autonomy-org/evidence-desk/blob/c3c512356cd8a0f9dd7c9f1dbe0e132612223b42/docs/workspace-format.md#paths-and-preservation)
anchors references at the workspace root, and the [constitution](https://github.com/open-autonomy-org/evidence-desk/blob/c3c512356cd8a0f9dd7c9f1dbe0e132612223b42/CONSTITUTION.md)
makes owned portable folders fundamental. The accepted walkthrough exercises fresh folders but not
moving an already-populated folder and continuing work from another location. This is a bounded PM
verification priority, not an observed defect, customer adoption claim or human commitment.

`guided-workflow` is complete in [PR #71](https://github.com/open-autonomy-org/evidence-desk/pull/71),
`2a5dcc8caf2dedbd987e229aa699a5d80a29a815`, following [native review run 26](hermes:task/t_f78cbdd0).
PM inspected the diff, review records, preservation/fact verifier and two fresh-clone rehearsal results
in [the review session](hermes:session/20260910_100342_63d111). Do not repeat that documentation task.

Completion:
- Pin fresh main and operate the existing CLI through World in unique disposable synthetic folders.
  Create a populated format-1 workspace with all statuses, shared context/evidence references, binary
  evidence, unknown root/item fields, unrelated files, and names with spaces/Unicode. Record full source
  SHA, toolchain/platform, exact commands, outputs and exits in native handoff, not a committed journal.
- Move the entire quiescent folder to a different parent/name outside the source checkout, leaving its
  old location absent. Without editing manifest references, run open/inspect/validate, human/JSON/Markdown
  summaries and intersected owner/status/follow-up selection from a different working directory using
  the absolute source entry point. Reconcile item facts, counts and ordering against the original;
  location-bearing diagnostics may differ, derived JSON/Markdown facts must not depend on the old root.
- Continue item-create/item-update and a cooperating external edit in the moved folder. Verify reread
  behavior, unknown values and unrelated source preservation. Make a separate complete local copy and
  verify it independently; changes in the copy must not mutate the original. Do not use customer folders,
  remote storage, a sync service or hard links as a substitute for an independent copy.
- Exercise relative internal symlinks separately on the verified Linux filesystem, plus a dangling or
  escaping reference after relocation. Valid internal references retain their meaning; invalid references
  fail whole-workspace validation even when excluded by selectors. Markdown validation failure emits no
  partial report. Compare complete bytes and inventory across successful read/refusal operations and
  untouched files across intended writes. Record symlink/filesystem limitations, not a universal portability claim.
- Independently review every acceptance line and repeat a fresh move/copy/read/edit/refusal workflow.
  Run unchanged World-attached `bun run check` under thirty seconds and `git diff --check`. This is
  evidence-only: no product code, dependency, format, test/check, documentation or version change is
  required, and no empty commit is needed. If a material defect is found, preserve the minimal reproduction
  and report the unfulfilled criterion for PM-scoped repair; do not silently weaken acceptance or expand scope.

Dependencies: accepted [guided workflow](hermes:task/t_f78cbdd0). Queue one evidence-only successor;
no overlapping open issue/PR or accepted volunteer commitment found in reviewed public sources.
Native review alone completes execution. Preserve existing scratch, workspaces and leases. Exclude
Git/cloud sync, catalogs, GUI, new export/import commands and release preparation. This current-source
verification neither changes nor re-verifies the fixed preview below; its candidate, assets, forecast and
human-review gate remain unchanged. Never tag, approve, publish, deploy or repeat the existing release ask.

## release-next: First portable-workspace preview

Dispatch: hold
Release decision: request-review
Target version: 0.1.0-alpha.1
Target window: 2026-09-16 through 2026-09-18, America/New_York; provisional forecast
Review by: 2026-09-15, America/New_York; proposed review target, subject to reviewer availability
Candidate: 569fd47de242d20c47fccb89bb1caffdea4630a1
Scope: portable-workspace create/open/validate and item create/update CLI, format 1, reproducible source archive; no GUI, sync, hosted service or bundled executable
Readiness: ready-for-review
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish create/open/validate; https://github.com/open-autonomy-org/evidence-desk/pull/57 and hermes:task/t_23847d50 review run 10 establish bounded item editing/conflict/preservation acceptance; https://github.com/open-autonomy-org/evidence-desk/pull/59 and hermes:task/t_4116639b review run 12 establish packaging. hermes:task/t_a488f630 independent run 15 verifies this exact full candidate; PM repeated its inspected World-attached rehearsal in cron_cbe439e4782f_20260910_032143, confirming identical artifacts and complete workflow/check acceptance.
Rationale: Request review of the coherent first local folder workflow now that candidate-specific verification is complete, while retaining the existing forecast and human review lead time. The resolved filesystem prerequisite requires no product repair or isolation relaxation; this is a deliberate PM decision, not a merge/date trigger. Later planning/documentation commits accumulate independently and do not move this candidate.
Version rationale: First experimental CLI source preview under the private 0.1.0-alpha.1 SemVer policy landed in PR #59; GitHub releases/tags were empty at this reconciliation. Workspace format 1 is distinct and unchanged. No stable API, npm publication or released version is implied.

The completed `candidate-check` outcome is retired following [t_a488f630](hermes:task/t_a488f630),
independent review run 15. The original extracted failures remain failed: `/tmp` is mounted `noexec`,
and direct installed compiler launch raised EACCES. The operator authorized disposable extraction under
`/opt/data/artifact-verification` outside Git checkouts; unchanged declared checks then passed without
product/toolchain code changes, compiler substitution or runtime policy changes. Predecessor evidence is preserved.

Fixed review asset: `evidence-desk-0.1.0-alpha.1-source.tar.gz` with adjacent `.tar.gz.sha256` and
`.tar.gz.provenance.json`. SHA256: `6f5f46530a8e622f6edd374aeb3672afdc8a9bbb0375a96f21bd4f0e75e57b89`.
Independent-review evidence and assets remain under `/opt/data/artifact-verification/t_a488f630-s4__iyfw/`;
PM's fresh equivalent builds and exact command/output evidence are under
`/opt/data/artifact-verification/t_a488f630-v4zb1tye/` (`evidence.json`, `commands.json`, `a/`, `b/`).
These local paths are review evidence, not public download URLs or published assets.

Verification: reviewer repository/extracted `bun run check` exited 0 in 2.538s/1.906s;
PM's rerun exited 0 in 1.992s/0.959s. Two builds were byte-identical and matched the reviewer archive.
Full allowlist, committed file bytes, tar commit header, checksum/provenance, frozen installation and
extracted create/item-create/item-update/open/validate passed. Deterministic stale-write refusal
preserved the exact external manifest, Markdown, binary evidence, unrelated file and unknown extensions.
Only Linux aarch64, local ext4, Bun 1.3.10, Git 2.47.3 and gzip 1.13 were verified.

Completion and remaining gates:
- The fixed proposal landed in [PR #61](https://github.com/open-autonomy-org/evidence-desk/pull/61).
  Native Discord history verifies delivery of the [candidate-specific request](https://discord.com/channels/1544906154868744202/1546981849979682916/1547449011466801202)
  and [publication instructions](https://discord.com/channels/1544906154868744202/1546981849979682916/1547449012586545203)
  to the authorized owner Aaron Yuan (GitHub `yueranyuan`, ID `2255943`; Discord ID `605505624226136074`).
  Await the original human response in that conversation; no approval or accepted deadline is recorded.
  Continued development is not candidate-specific approval and does not supersede this request.
- The human reviews scope, full SHA, exact assets, verification and limitations; approves, rejects or
  redirects this concrete proposal. Follow [human-only publication](CONTRIBUTING.md#human-only-publication)
  and the [local-application procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications).
  After approval, only a human creates `v0.1.0-alpha.1` at the fixed SHA, marks the GitHub Release a
  prerelease, and uploads the reviewed archive and both sidecars. Verify required GitHub permissions/gates
  at that step: the fleet valve denies ruleset/collaborator-permission reads, so this scrum cannot attest
  to their current effective state. No service deployment or new publishing credentials are needed.
- PM verifies the actual release record and downloaded version/provenance/checksum before moving
  product changes out of Unreleased. A changed candidate, version or artifact needs renewed review.

Risks and review notes: executable installation/extraction filesystem required; fleet `/tmp` remains
unsuitable for the declared compiler check. The candidate's bundled docs predate the explicit executable-
filesystem clarification now in main; provide that clarification in release notes, not by silently changing
reviewed bytes. Registry/cache access and a separately installed Bun are needed. macOS, Windows,
network/cloud filesystems are unverified. Existing-file association only, cooperating locks (not arbitrary-
writer atomic compare-and-swap), quiescent reference topology, numeric/manifest-alias refusals and manual
crash recovery remain limitations. Reviewer availability and publication permissions remain dependencies;
unresolved gates move the forecast rather than waive review. No human implementation commitment is assumed.
Optional cloud sync and customer AI integration remain future choices, not dependencies of core use.
