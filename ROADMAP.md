# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## guided-workflow: Make the local follow-up handoff runnable from a fresh start

Dispatch: fleet

PM priority: consolidate the existing workflow before adding more product surface. The
[current README](https://github.com/open-autonomy-org/evidence-desk/blob/693b63e0441b555e130784bd530665078718358b/README.md#read-only-readiness-summary-development-source)
places summary commands before the synthetic setup they require, mixes fleet-specific commands with
ordinary-user examples, and uses placeholder report destinations. Its commands describe accepted features,
but a new reader must assemble the end-to-end handoff. This is a documentation/usability deduction from
source, not an observed customer failure, human commitment or owner feature request. The constitutional
[portable-files and external-editing workflow](https://github.com/open-autonomy-org/evidence-desk/blob/693b63e0441b555e130784bd530665078718358b/CONSTITUTION.md)
supports one bounded documentation task rather than another formatter.

`summary-markdown` is complete in [PR #69](https://github.com/open-autonomy-org/evidence-desk/pull/69),
`3c3d9ce1607dfdd9f55e7a1e01c48912db60f4ef`, independently accepted by
[native run 24](hermes:task/t_0f8efb43). PM inspected its full diff, rehearsal script, actual command
records and [review-session outputs](hermes:session/20260910_085711_10d41f), including messages 2530/2534.
The completed implementation is not queued again and remains outside the fixed preview below.

Completion:
- Maintain README in place with one clearly ordered, copy-runnable development-source walkthrough
  from a fresh checkout with Bun 1.3.10 and frozen dependency installation. Distinguish current source
  from the fixed unpublished alpha.1 archive; do not make summary commands appear available in that
  archive. Separate ordinary-user commands from the fleet World invocation prerequisite without requiring
  users to install fleet tooling. Retain the actual application run command and existing installation policy.
- Use only a newly created disposable synthetic workspace outside the checkout. Define all variables
  and create context/evidence files before referencing them. Demonstrate create, item-create, item-update,
  open/validate, then human/JSON/Markdown summaries and an owner/follow-up selection with meaningful
  matching data. Explain complete-with-warnings and overlapping counts without inventing readiness scores,
  evidence sufficiency or SOC2 mappings. No real customer examples, credentials, service or AI dependency.
- Demonstrate a quiescent external edit followed by validation and a changed summary, preserving unrelated
  fields/files. Document a useful invalid-reference refusal and safe correction without blind retry,
  automatic repair or silent discard. Link to the existing format/concurrency contract rather than copying
  it; retain cooperating-lock, no live snapshot, numeric/alias and platform limitations.
- Show Markdown redirection to a new concrete destination outside the workspace with no-clobber and
  explicit exit-status handling. Explain shell-created/truncated files on failure, escaped authored strings,
  derived rather than import/live data, and reviewing report contents before sharing. Do not imply the
  application writes reports or that synthetic operational verification establishes customer adoption.
- Independently execute the documented sequence in its stated order through World using fresh synthetic
  folders, without hidden fixture preparation or prior shell variables. Capture exact documented commands,
  World mapping, outputs/exits and source SHA in native handoff, not a committed rehearsal journal.
  Programmatically verify expected JSON facts/selection and Markdown agreement; compare complete bytes
  and inventory across read/refusal operations and preserve unrelated sources across intended edits.
  A second clean rehearsal must not depend on the first workspace. Do not claim untested platforms.
- Limit repository changes to README and, only if needed to fix a link or clarify existing behavior,
  docs/workspace-format.md. Consolidate redundant examples instead of appending a second manual.
  No product code, dependencies, formats, automated tests/check changes or new CLI features. Pass
  unchanged World-attached `bun run check` under thirty seconds and `git diff --check` before pushing
  the signed task branch. Independent native review reads the pinned roadmap, constitution and
  contributing rules, verifies every acceptance line and operates the documented walkthrough itself.

Dependencies: accepted [Markdown execution](hermes:task/t_0f8efb43); no overlapping open issue/PR or
accepted volunteer commitment found in reviewed public sources. One fleet documentation successor;
no human assignment. Preserve all worker scratch and review evidence. No version bump, archive rebuild,
changed release candidate/window, repeated review request, tag, approval, publication or deployment.
This work accumulates independently beyond the fixed preview assets.

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
