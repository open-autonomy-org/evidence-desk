# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## candidate-check: Resolve extracted verification and prepare candidate evidence

Status: ready for bounded runner diagnosis and candidate-verification preparation; release readiness blocked.
Dispatch: fleet

Source-preview preparation is implemented in [PR #59](https://github.com/open-autonomy-org/evidence-desk/pull/59)
at `cbef9a2137908df60f298443cb4cebc340f5c3a1`, independently accepted by
[t_4116639b](hermes:task/t_4116639b), review run 12. Its completed preview-artifact intention is retired.
The allowlisted source archive, proposed private `0.1.0-alpha.1`, compatibility/publication policy,
two byte-identical builds, extracted install/CLI workflow and preservation evidence are accepted for
that execution scope. This does not imply candidate readiness or human release approval.

Review run 12 additionally recorded extracted-folder `bun run check` exit 1 without compiler diagnostics
in `.review-evidence/check.json`; direct TypeScript and the extracted user workflow passed, and the
repository check passed in 2.238s. PM reproduced the extracted check failure through World in
[the task's PM reconciliation comment](hermes:task/t_4116639b): direct Node and Bun
invocations of installed TypeScript passed, but `bunx --bun tsc --noEmit` also exited 1 silently.
This narrows the discrepancy to runner invocation, not a demonstrated TypeScript error; it does not yet
establish whether Bun resolution/toolchain or World/runtime behavior causes it. Do not waive it.

Completion:
- Preserve implementation and independent-review worktrees, drivers, artifacts and failure logs from
  t_4116639b. Diagnose in a separate disposable workspace with the pinned Bun 1.3.10 and frozen lockfile.
  Record exact executable resolution, cwd, commands, outputs and exits; vary one relevant factor at a
  time to distinguish product/toolchain from World/runtime behavior. All application/dependency/check
  runs remain World-attached; do not bypass isolation or alter host/World policy to obtain green.
- Fix only an evidenced product/toolchain cause within repository scope, preserving the complete check's
  TypeScript coverage and thirty-second bound. Do not replace a failed check with a passing direct
  compiler result. If the cause is outside fleet modification authority, hand off the minimal reproducer
  and exact required operator action and retain the capability hold; no speculative runtime changes.
- Demonstrate `bun run check` succeeds in both the repository and a fresh extracted source archive,
  with actual outputs/timings and no checkout dependency. Document any justified command/policy change
  in place; never silently narrow verification or claim the historical failed run passed.
- From a full committed input containing any necessary fix, build twice, compare bytes/checksums,
  inspect the entire allowlisted inventory and provenance, frozen-install into a new disposable folder,
  and operate create/item-create/item-update/open/validate, deterministic stale-write refusal and exact
  external/evidence/unrelated-file preservation. Record the full input SHA, artifact/checksum/sidecars,
  commands, platform and limitations in native handoff/PR for independent execution review.
- Work through develop and native review, preserving existing accepted task scopes. PM subsequently
  reconciles landing and fixes the final candidate in a ready release proposal; this task cannot select,
  approve, tag or publish a release. No product feature expansion or duplicate packaging implementation.

Dependencies: accepted local workflow in [PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38),
[PR #56](https://github.com/open-autonomy-org/evidence-desk/pull/56),
[PR #57](https://github.com/open-autonomy-org/evidence-desk/pull/57) and preparation above.
Retain documented existing-file association, cooperating locks (not arbitrary-writer atomic compare-and-swap),
quiescent reference topology, numeric/manifest-alias refusals and manual crash recovery limitations.

## release-next: First portable-workspace preview

Dispatch: hold
Release decision: prepare
Target version: 0.1.0-alpha.1
Target window: 2026-09-16 through 2026-09-18, America/New_York; provisional forecast
Review by: 2026-09-15, America/New_York; proposed review target, subject to reviewer availability
Candidate: not selected
Scope: accepted portable-workspace CLI and source preview; candidate-check resolution required; no GUI, sync or hosted service
Readiness: pending
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish create/open/validate; https://github.com/open-autonomy-org/evidence-desk/pull/57 and hermes:task/t_23847d50 review run 10 establish item editing and bounded preservation/conflict acceptance; https://github.com/open-autonomy-org/evidence-desk/pull/59 and hermes:task/t_4116639b review run 12 establish source-preview preparation but retain the extracted check discrepancy. Candidate-check and final fixed-candidate verification remain outstanding.
Rationale: Continue preparation after accepted packaging, without treating its merge as readiness. Retain the forecast and human review lead time while resolving the runner discrepancy rather than expediting or waiving verification.
Version rationale: Adopt the private 0.1.0-alpha.1 metadata and experimental SemVer policy landed in PR #59 for the first CLI source preview. GitHub releases/tags remain empty at this reconciliation; persisted workspace format 1 remains distinct. No published version is implied.

This is PM's forecast, not an accepted human deadline or a review request. Resolve candidate-check before
landing a ready full-SHA proposal and seeking candidate-specific human review in
[#evidence-desk](https://discord.com/channels/1544906154868744202/1546981849979682916).
Follow the landed [human-only source publication policy](CONTRIBUTING.md#human-only-publication) and
[local-application procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications).
Human publication and subsequent published version/provenance/checksum verification remain separate gates.
No human implementation commitment or candidate-specific approval is recorded. Runner resolution,
installation complexity, filesystem/concurrency limits and reviewer availability remain risks;
unresolved dependencies move the forecast rather than waive readiness. Optional cloud synchronization
and customer AI integrations remain future choices; core use requires neither hosted accounts nor customer credentials.
