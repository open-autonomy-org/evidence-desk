# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## summary-markdown: Share a readable local follow-up report without copying evidence

Dispatch: fleet

PM priority: build a bounded Markdown view of the accepted summary and selectors for firm/client
handoffs. The [current summary](https://github.com/open-autonomy-org/evidence-desk/blob/23aa12956a388180ad29c971a68fe83ed6c1d3b1/src/summary.ts)
provides console prose and JSON, but no Markdown document. A locally redirected report makes existing
follow-up facts usable in an owner's ordinary documents without a service or evidence upload.
This is PM inference under the [portable-files constitution](https://github.com/open-autonomy-org/evidence-desk/blob/23aa12956a388180ad29c971a68fe83ed6c1d3b1/CONSTITUTION.md),
not a human feature request, volunteered commitment or release decision.

The prior `community-current-source` outcome is retired: [PR #67](https://github.com/open-autonomy-org/evidence-desk/pull/67),
`5e856eba9a6ce106bea340a4de351e3cc2d25958`, and [independent run 22](hermes:task/t_2615f453)
complete its bounded repair. PM verified full pinned-main roster/planning/constitution output in
[the next ordinary community run](hermes:session/cron_0538d914b691_20260910_075056), messages 2297/2300,
and [actual report delivery](https://discord.com/channels/1544906154868744202/1546981849979682916/1547514909796073512).
That establishes this adoption gate, not exhaustive source coverage or product publication.

Completion:
- Add `workspace summary <folder> --markdown`, combinable with existing owner/status/follow-up
  selectors. Emit a deterministic standalone Markdown document to stdout, with an explicit derived-report
  label, existing counts, item facts and warning meanings. Filtered reports label applied selectors,
  whole-workspace counts and selected counts separately, preserving manifest order and zero-match success.
- Preserve existing human output and JSON schemas 1/2. Reject repeated/unknown/missing options and
  mixed `--json`/`--markdown` with useful nonzero diagnostics; document deterministic error-format precedence.
  Reuse complete workspace validation before filtering/rendering. Invalid or unsupported workspaces,
  including invalid excluded records or references, emit no successful/partial Markdown report to stdout.
- Render all user-authored IDs, owners and paths as inert literal data: no injected headings, HTML,
  links/images, broken fences or forged rows via punctuation, newlines, control characters or Unicode.
  Document the chosen escaping/representation and preserve exact string distinctions, including empty
  versus whitespace owners. Do not print Markdown bodies, evidence contents, absolute workspace locations,
  readiness scores, sufficiency judgments or audit claims. Include a concise limitations statement.
- Reread external edits on each call. Do not write reports, caches, locks or other files in the workspace;
  preserve all source bytes/inventory on success and refusal. Output is derived, not an import format or
  live snapshot. README documents exact commands and optional shell redirection to a new file outside
  the workspace, warning that shell redirection may truncate a destination even when validation fails.
  Update the existing format document; retain format 1 and quiescent-folder/platform limitations.
- Exercise the actual CLI through World using synthetic empty, all-status, warning-overlap, selected,
  no-match and externally edited workspaces. Programmatically reconcile Markdown facts/count scopes/order
  against JSON; demonstrate deterministic repeats and inert hostile strings (including HTML, image/link
  syntax, pipes, backticks/fences, CR/LF, tabs and Unicode). Show whole-workspace refusal for malformed,
  duplicate, unsupported and missing/unsafe/symlink-escaping excluded references; prove stdout is empty
  on Markdown validation failure and exact bytes/inventory remain unchanged. Recheck option errors,
  existing human/JSON behavior and create/item-create/item-update/open/inspect/validate.
- Record exact commands, outputs/exits, full implementation SHA and limitations in the native handoff.
  Run unchanged World-attached `bun run check` under thirty seconds and `git diff --check` before pushing
  the signed task branch. Independent native review verifies every acceptance line and exercises behavior;
  only that review completes execution. Add any product module to the explicit source allowlist.

Dependencies: accepted summary selection [t_5362d9cb](hermes:task/t_5362d9cb) and source-read repair
[t_2615f453](hermes:task/t_2615f453). No overlapping open PR or volunteered implementation was found in
reviewed public sources. Queue one successor, not duplicate accepted work. Exclude CSV, file-writing
export options, import, GUI, catalogs, due dates, sync, AI and release preparation. No version bump,
fixed-asset rebuild, changed candidate, repeated review ask, tag, approval, publication or deployment.
The preview below remains fixed; this work accumulates independently beyond its assets.

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
