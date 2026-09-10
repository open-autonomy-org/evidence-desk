# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## community-current-source: Answer from pinned main without disturbing worker workspaces

Dispatch: fleet

PM priority: repair a demonstrated source-freshness risk before another product expansion. The
`summary-selection` outcome is complete in [PR #65](https://github.com/open-autonomy-org/evidence-desk/pull/65),
`e3745b560152c080e09a9515ef30715b8d16d686`, independently accepted in
[run 20](hermes:task/t_5362d9cb); it is retired, not queued again. The latest
[public community run](hermes:session/cron_0538d914b691_20260910_071856), message 2108, nevertheless
read the older `workspace-first`/`Release decision: accumulate` roadmap. PM reproduced that content
in the preserved root checkout at `af24783ee915d4371fe4432d206bb9b89610c1f0`, while pinned main
`59a9fbf4ed4b902bae511f4f524ec21c3497aa08` contains the fixed ready proposal below.
Fetching main alone does not update a worker checkout. No erroneous human reply was found in that
silent run, but stale source reads could misstate priorities or readiness.

The active default-profile community skill now instructs fetch, full-SHA pinning and `git show`
reads, an immediate PM procedural mitigation recorded in
[this public scrum](hermes:session/cron_cbe439e4782f_20260910_073256). Repository persistence,
independent verification and observation of a subsequent scheduled run remain outstanding.
This is PM coordination under the constitutional sourced-planning invariant, not new owner direction
or authorization to reconfigure the gateway. One bounded fleet task should persist and exercise the
skill correction; PM separately observes scheduled adoption before retiring this outcome.

Completion:
- Update only `hermes/skills/open-autonomy/community/SKILL.md` to require fetching current main,
  pinning its full SHA, and reading roster/roadmap/changelog/constitution and relevant code/docs with
  `git show <SHA>:<path>`. Do not infer updated working-tree files from fetch or switch/reset/clean
  worker workspaces. Explain failed-fetch freshness gaps and keep current-main evidence distinct from
  a fixed release candidate. Preserve public-source boundaries, authority checks and existing reply rules.
- Reconcile that committed skill with the already patched active default-profile skill using supported
  skill tooling; preserve unrelated instructions and do not change other profiles, schedules, hooks,
  gateway configuration, protected files or credentials. Record exact scope and version/provenance.
- Exercise the documented reads from a deliberately older disposable Git checkout using actual Git
  commands. Demonstrate that pinned main supplies the current roadmap and roster while HEAD, branch,
  tracked/untracked synthetic scratch bytes and inventory stay unchanged. Demonstrate a bounded
  unavailable-remote case that records a freshness gap rather than claiming a successful current read.
  Do not retrieve confidential sessions, modify the real worker checkout, post test messages or mark
  community cursors as part of rehearsal. Save exact commands/results in the native handoff, not a journal.
- Pass unchanged World-attached `bun run check` under thirty seconds and `git diff --check` before
  pushing the signed task branch; independent native review verifies every task acceptance line.
  Execution acceptance proves the bounded skill repair, not deployment or the behavior of a future run.
- PM then inspects the next ordinary community run for pinned-main document reads and successful
  completion/delivery (or intentional silence), retaining this adoption gate if not yet observed.

Dependencies: no overlapping open PR, active board execution or accepted volunteer commitment was found
in the reviewed sources. Keep product feature expansion out of this repair. No asset rebuild, product
version bump, changed release proposal, repeated review ask, tag, approval, publication or deployment.
The preview below remains fixed; newer summary features accumulate independently beyond its assets.

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
