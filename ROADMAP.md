# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## interrupted-write-guide: Make manual write recovery actionable without automatic repair

Dispatch: fleet

PM priority: consolidate recoverability before adding more product surface. The current
[write/concurrency contract](https://github.com/open-autonomy-org/evidence-desk/blob/477c0063ed133040ecd46f70a049c49530dfeabb/docs/workspace-format.md#item-writes-and-concurrency)
describes abandoned locks, temporary files and potentially committed updates after errors, but its
manual recovery advice is a short paragraph rather than an ordered operator procedure. Under the
[external-editing and preservation invariants](https://github.com/open-autonomy-org/evidence-desk/blob/477c0063ed133040ecd46f70a049c49530dfeabb/CONSTITUTION.md),
make that existing contract usable without adding an unlock/repair command. This is PM inference from
documentation, not a newly observed defect, customer incident or human implementation commitment.

`workspace-relocation` is retired following [native independent review run 28](hermes:task/t_7280443e)
at `477c0063ed133040ecd46f70a049c49530dfeabb`. PM inspected the independent driver, recorded commands,
result and [actual review execution](hermes:session/20260910_110634_1a5626), message 2939: local moves,
continued edits, independent copies and internal/unsafe symlink behavior passed with preservation;
the unchanged World check passed in 2.102 seconds. This evidence-only work changed no product files
and establishes only Linux aarch64/local ext4 behavior with Bun 1.3.10, not publication or adoption.

Completion:
- Improve the existing format document in place with an ordered manual recovery procedure and link it
  from README. Distinguish an active writer, ordinary pre-rename refusal, abandoned lock/temp files,
  and an error that may occur after commit. Explain how to stop and account for all writers, preserve
  an independent quiescent copy outside the workspace, inspect the current manifest and exact leftovers,
  and validate/reopen before deciding whether any patch is still needed. Unknown writer ownership or
  uncertain filesystem state means stop, not infer abandonment from age, an empty lock or a failed write.
- Give concrete commands for a disposable synthetic demonstration with all variables and files prepared;
  distinguish ordinary-user commands from fleet World prerequisites. Remove only explicitly inspected,
  confirmed-abandoned protocol paths, never broad globs/recursive cleanup or an active writer's lock.
  Never automatically restore a temp/old manifest, discard external edits or prescribe blind patch retry.
  A malformed manifest requires explicit owner-chosen correction from preserved data, not claimed recovery.
- Operate a fresh synthetic World-attached writer held at its real Ready boundary. Show a second writer
  refusing while the first is live, with no manual unlock; then deliberately terminate only the task-owned
  synthetic writer, confirm its exit, inspect its actual leftovers and follow the documented recovery.
  Preserve exact commands/stdout/stderr/exits and before/after bytes/inventory. If demonstrating a temp
  leftover or post-commit cleanup error requires a staged fixture, label it as staged, not an observed crash
  or proof of power-loss durability. Do not kill fleet workers, leases, unrelated processes or the World.
- Verify read/refusal preservation, current external/unknown values and unrelated Markdown/binary evidence
  across recovery, followed by a deliberate successful edit and fresh validation/summary. Manual cleanup
  must remove only the confirmed protocol leftovers; verify preserved backup independence. Repeat the
  documented sequence from a second fresh synthetic folder during independent native review. Retain
  cooperating-writer, quiescent-topology, metadata, symlink, platform and no-power-loss-guarantee limits.
- Limit changes to docs/workspace-format.md and README; consolidate existing prose rather than create
  a second manual. No product code, dependencies, format, tests/check changes or new CLI commands.
  Record full source SHA and evidence in the native handoff, not a committed rehearsal journal. Run
  unchanged World-attached bun run check under thirty seconds and git diff --check before the signed
  task-branch push. Independent native review reads every pinned completion line and policies, verifies
  actual behavior and alone completes execution. A material defect gets a preserved reproduction and
  unfulfilled criterion for PM-scoped repair, not an out-of-scope product fix.

Dependencies: accepted [relocation verification](hermes:task/t_7280443e); no overlapping open issue/PR
or volunteered implementation found in reviewed public sources. Queue one bounded documentation task;
no human assignment. Preserve prior scratch, worker checkouts and exact fixed preview assets. No version
bump, candidate/window change, archive rebuild, repeated review ask, tag, approval, publication or deployment.
This current-source documentation accumulates independently beyond the fixed preview below.

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
