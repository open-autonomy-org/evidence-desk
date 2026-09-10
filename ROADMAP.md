# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## readiness-summary: See outstanding readiness work without reading every item body

Dispatch: fleet

PM priority: implement one bounded read-only summary of the existing version 1 workspace next.
The [constitution](https://github.com/open-autonomy-org/evidence-desk/blob/fe1aedb75662a662f41c752b01f5ff2b39d2cdab/CONSTITUTION.md#invariants)
calls for locally usable readiness information and customer-owned tools. The accepted
[folder contract and inspection](https://github.com/open-autonomy-org/evidence-desk/pull/38) and
[item editing](https://github.com/open-autonomy-org/evidence-desk/pull/57) already supply status, owner,
context and evidence references. Current [CLI inspection](https://github.com/open-autonomy-org/evidence-desk/blob/fe1aedb75662a662f41c752b01f5ff2b39d2cdab/src/index.ts)
prints every Markdown body and only an overall incomplete count; it offers no concise grouped summary
or documented machine-readable report. A firm/client can use a summary to find follow-up work without
scanning those bodies, and its own tools can consume the same facts without parsing console prose.
This is PM inference and sequencing within existing direction, not a named owner feature request or
human implementation commitment. The operator-forwarded request to continue in
[the current public scrum](hermes:session/cron_cbe439e4782f_20260910_054655) prompted reassessment;
it neither changes the constitution nor supplies release approval.

Completion:
- Add `workspace summary <folder>` and `workspace summary <folder> --json`, with exact runnable
  examples in README and the derived report contract in the existing workspace-format documentation.
  Reuse version 1 validation; no persisted-format changes, migration, index, service or AI dependency.
- For a valid workspace, report total items and counts for all four existing statuses, incomplete items,
  unassigned owners and items with no evidence references. Provide concise per-item follow-up facts
  (ID, owner, status, context/evidence paths and relevant warnings), without Markdown bodies or evidence
  contents. Include complete items with warnings; do not confuse self-reported completion or reference
  existence with evidence sufficiency, SOC2 coverage, an audit opinion or a readiness score.
- JSON mode emits one documented report object on stdout, with a report schema version distinct from
  workspace format/product version, deterministic ordering and no console prose mixed in. Define
  overlapping counts and empty-workspace semantics. Human and JSON views must agree on the same facts.
- Invalid or unsupported manifests, malformed/duplicate records and missing/unsafe/symlink-escaping
  references produce actionable diagnostics and nonzero exit. JSON failures remain machine-readable;
  never present totals from omitted malformed records as a successful complete workspace report.
  Warnings alone do not fail. Preserve the existing open/inspect/validate and write behavior.
- Each invocation rereads external edits and is read-only: no report files, locks or caches in the
  workspace, no mutation of unknown fields, manifest, context, evidence or unrelated files. Retain the
  quiescent-folder concurrency limitation; do not imply a snapshot against concurrent external writers.
- Demonstrate the actual CLI through World on disposable synthetic folders: empty workspace, all
  statuses, overlapping follow-up reasons, complete-with-warnings, externally edited data, malformed
  records, unsupported version, missing files and unsafe/symlink references. Compare parsed JSON with
  human facts and byte-compare workspace contents before/after successful and refused commands.
  Record exact commands, exits, outputs and limitations in the implementation PR/native handoff;
  pass the unchanged `bun run check` under thirty seconds and obtain independent native acceptance.

Dependencies: accepted [t_669122cc](hermes:task/t_669122cc) and
[t_23847d50](hermes:task/t_23847d50); both are done. No human publication dependency or volunteer overlap
is known from the current board/open PRs. Keep one fleet execution, followed by native review.
Scope excludes filters, CSV/Markdown export, control catalogs/mappings, due dates, evidence interpretation,
GUI, sync and new writing operations. If source modules are added, maintain the existing explicit source
archive allowlist; this does not authorize building a replacement review asset. No version bump or new
release proposal is needed for this implementation. Accumulate accepted changes after the fixed preview
candidate; preserve its version, assets, schedule and human gate below.

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
