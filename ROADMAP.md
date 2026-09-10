# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## summary-selection: Find an owner's work and follow-up items without hiding workspace errors

Dispatch: fleet

PM priority: extend the accepted read-only summary with bounded owner/status/follow-up selection.
[PR #63](https://github.com/open-autonomy-org/evidence-desk/pull/63), implementation
`89637675fa407946d32ac13ad66be3b76005c8be`, and [independent native review run 18](hermes:task/t_1f2de365)
complete the previous `readiness-summary` outcome; it is retired, not queued again. The current
[summary implementation](https://github.com/open-autonomy-org/evidence-desk/blob/89637675fa407946d32ac13ad66be3b76005c8be/src/summary.ts)
always lists every item. A firm or client coordinating an owned folder can next isolate one owner's
work or items needing follow-up, while retaining visible whole-workspace context and validation.
This is PM inference under the [constitution](https://github.com/open-autonomy-org/evidence-desk/blob/5033b0de7f1affa807be5c7982a3a6ea838a9efa/CONSTITUTION.md),
not a named owner feature request or human commitment. The operator-forwarded continue request in
[the prior public scrum](hermes:session/cron_cbe439e4782f_20260910_054655) and
[current reconciliation](hermes:session/cron_cbe439e4782f_20260910_062455) prompt sequencing, not release approval.

Completion:
- Extend `workspace summary <folder>` with optional `--owner <exact-string>`, `--status <status>` and
  `--needs-follow-up`, combinable with `--json`. One value per owner/status flag; reject repeated,
  unknown or missing options and unsupported statuses with actionable nonzero errors. Owner comparison
  is exact and case-sensitive (including an explicitly empty string); do not normalize stored values.
  Different selectors intersect. Follow-up means status is not complete OR the existing report has
  any warning, including complete items with warnings; this is not evidence sufficiency or audit advice.
- Validate the entire workspace before selection. An invalid record or missing/unsafe reference outside
  the selected subset must still fail the command. Never hide problems by filtering malformed records.
  Reuse format 1 and existing warning definitions; no persistence, migration, cache or service dependency.
- Preserve the existing unfiltered human output and JSON report schema 1 contract. Filtered JSON uses
  an explicitly documented derived report schema 2 with the applied selectors, whole-workspace counts,
  selected counts and selected item facts in manifest order. Distinguish absent selectors from empty
  owner. Human output clearly labels selection and both count scopes, agrees with JSON, and safely quotes
  owner-authored strings. A zero-match selection succeeds with zero selected counts, not an error.
  Failure emits no partial counts/items; `--json` failures remain a single machine-readable object with
  no mixed prose. Document schema choice for usage failures and keep it deterministic. Update README
  with exact runnable examples and the existing workspace-format document with the selection/report contract.
- Reread external edits each invocation and preserve all bytes, unknown fields, evidence, context and
  unrelated files on success/refusal. No report files, locks or caches in the workspace. Keep the
  quiescent-folder/no-concurrent-snapshot limitation, no bodies/evidence contents, scoring or audit claims.
- Exercise actual CLI commands through World on synthetic folders: empty/no-match, every status,
  exact/case-sensitive/empty/whitespace/control-character owners, each selector and intersections,
  incomplete items without warnings, complete items with/without warnings, repeated/missing/invalid
  options and external edits. Include malformed/duplicate/unsupported records and missing/unsafe/symlink
  references excluded by the requested selection to prove whole-workspace refusal. Programmatically
  reconcile selected IDs, both count scopes and human/JSON facts; compare deterministic repeated output
  and exact workspace bytes/inventory before/after successes and refusals. Recheck unfiltered schema 1
  and existing create/item-create/item-update/open/inspect/validate behavior. Record commands, outputs,
  exits, full SHA and limitations; pass unchanged World-attached `bun run check` under thirty seconds
  before pushing, followed by independent native review of every completion line.

Dependencies: [t_1f2de365](hermes:task/t_1f2de365) is done and landed. One successor fleet execution;
no overlapping volunteer commitment or open PR was found in the reviewed public sources/current board.
Scope excludes export, new write operations, GUI, catalogs/mappings, due dates, sync, AI, evidence
interpretation and release preparation. Maintain the explicit source allowlist if modules are added.
No product version bump or fixed-asset rebuild; this development accumulates beyond the preview below.
Publication is not a dependency. Preserve its exact candidate, version, assets, forecast and human gate.

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
