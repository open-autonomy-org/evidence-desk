# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## evidence-reference-index: See which readiness items share recorded evidence

Dispatch: hold

Proposal status: preserved PM-inferred scope, not authorized standalone dispatch. The owner's
[role correction in PR #80](https://github.com/open-autonomy-org/evidence-desk/pull/80) supersedes
constitution-only feature inference. The [separate strategy decision](hermes:session/cron_2af471468131_20260910_232625),
locally committed as `86fb10a534d385784b18891befe39fea8003fb05` but not yet landed, prioritizes a guided
local CPA/client workbench and places association traceability within that workflow. Reconcile this
preserved option after strategy landing; it is not a prerequisite standalone CLI expansion. The
completion sketch below is provisional, not worker acceptance or permission to queue. Any eventual
execution follows the current no-automated-tests policy: REPL-style manual observations in the handoff,
no automated suites or persistent verification harnesses, and no test-running checks or hooks.

Original PM rationale (historical inference, not current strategic priority): make evidence associations inspectable in the reverse direction, without copying or
interpreting evidence. The [current summary](https://github.com/open-autonomy-org/evidence-desk/blob/cd5cee4dca8994164d4a1108b5c8d7e6c4fe49de/src/summary.ts)
is item-oriented; finding all items that reference a shared path currently requires assembling that
view externally. The [format contract](https://github.com/open-autonomy-org/evidence-desk/blob/cd5cee4dca8994164d4a1108b5c8d7e6c4fe49de/docs/workspace-format.md#layout-and-records)
already records explicit evidence paths. Under the [constitution's inspectable, owned-file workflow](https://github.com/open-autonomy-org/evidence-desk/blob/cd5cee4dca8994164d4a1108b5c8d7e6c4fe49de/CONSTITUTION.md),
a small reverse-reference view helps a firm or client review associations before external edits.
This is PM implementation/sequencing inference, not an owner feature request, observed customer defect,
audit-coverage claim or human commitment. Accepted summaries, relocation and recovery guidance are not
queued again. The fixed preview below remains pending human review; that does not pause independent work.

Completion:
- Add `workspace evidence <folder>` and `workspace evidence <folder> --json` as read-only derived views.
  Reuse complete format-1 workspace validation before reporting. Group evidence references by exact
  recorded relative-path string, in first-encounter manifest/evidence-array order. For each path list
  distinct referring items in manifest order with ID, owner and status; repeated references within one
  item must not duplicate that item. Define counts explicitly: total items, distinct recorded evidence
  paths, distinct item/path associations, paths shared by multiple items, and items with no references.
  Include the IDs of items without references; empty workspaces succeed with zero counts.
- Document one deterministic versioned JSON report contract, distinct from persisted workspace and
  existing summary schemas. Human output and JSON must agree; JSON stdout contains only one object.
  Invalid/unsupported workspaces emit useful nonzero diagnostics, no partial index or successful counts;
  JSON refusals use a documented failure object with null counts and empty result arrays. Reject unknown,
  repeated and extra options/arguments; document error-format precedence. No selectors or Markdown/CSV
  output in this slice. Preserve all existing command behavior and summary schemas.
- Treat paths as recorded associations, not unique physical files: do not merge symlink/hard-link aliases,
  canonicalize displayed paths, hash/read evidence contents or scan unreferenced files. Continue shared
  validator reference checks and existing context validation. State that identical bytes at different paths
  are separate records and that neither existence nor sharing proves sufficiency, freshness or SOC2 coverage.
  Human-rendered authored strings must be quoted inert data, preserving exact distinctions and preventing
  forged lines/control sequences. Do not print context bodies, evidence contents or absolute workspace roots
  in successful reports. JSON escaping preserves original strings.
- Reread external edits on each invocation; write no index, report, cache, lock or workspace files.
  Preserve complete bytes and inventory on success/refusal, including unknown fields and unrelated files.
  Retain quiescent-folder, no live snapshot and filesystem/symlink limitations. Update README in place with
  exact runnable synthetic examples and the existing format document with grouping/count/error semantics.
  Add any new product module to the explicit source allowlist, without preparing or replacing an archive.
- Operate the actual CLI through World against fresh synthetic empty, all-status, shared-path, repeated-
  reference, no-reference, Unicode/space and hostile ID/owner fixtures. Reconcile all counts, grouping and
  order programmatically against manifest associations and existing summary JSON. Demonstrate deterministic
  repeats, reread after external edits, safe internal aliases kept distinct, and entire-workspace refusal for
  malformed/duplicate/unsupported records and missing/unsafe/escaping references, even in an otherwise
  unrelated item. Compare full source bytes/inventory across every read/refusal; exercise existing
  create/item-create/item-update/open/inspect/validate and all summary formats for regressions.
- Record full source SHA, exact commands/stdout/stderr/exits, platform and limitations in native handoff,
  not a committed rehearsal journal. Run unchanged World-attached `bun run check` under thirty seconds
  and `git diff --check` before a signed task-first branch push. Independent native review reads this
  complete outcome, CONSTITUTION.md and CONTRIBUTING.md, verifies every acceptance line against the actual
  handoff and repeats representative shared-reference, external-edit and refusal workflows. Only native
  review completes execution; merge alone is not operational acceptance.

Dependencies: accepted [summary](hermes:task/t_1f2de365), [selection](hermes:task/t_5362d9cb) and
[Markdown view](hermes:task/t_0f8efb43). Reviewed public open issues/PRs contain no overlap or accepted
volunteer commitment at original drafting. If later selected, use one bounded fleet task; none is
currently authorized or queued for this standalone proposal. No human assignment. Use a fresh separate task worktree and
unique synthetic scratch, preserving prior review artifacts, worker checkouts and native leases. All app,
install and check commands use `volter-world attach evidence-desk --root /opt/data -- <command>` with the
prepared World; admission failures require capability recovery, not weaker isolation or deletion of evidence.
Exclude persistence, content inspection, orphan-file discovery, deletion/repair, import, catalogs, GUI, sync,
AI and release preparation. No version bump, candidate/window change, archive rebuild, repeated release
ask, tag, approval, publication or deployment. This outcome accumulates after the fixed alpha.1 candidate.

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
  at that step: [PR #82](https://github.com/open-autonomy-org/evidence-desk/pull/82) restored read-only
  main-rule inspection, and PM observed one required approval, stale-approval dismissal and no code-owner
  review. This verifies development review rules, not human publication permissions or release approval.
  No service deployment or new publishing credentials are needed.
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
