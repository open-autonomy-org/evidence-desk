# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## preview-artifact: Prepare a reproducible local source preview

Status: ready for bounded artifact/version preparation.
Dispatch: fleet

The portable-folder workflow is implemented and independently accepted in
[PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38),
[PR #56](https://github.com/open-autonomy-org/evidence-desk/pull/56) and
[PR #57](https://github.com/open-autonomy-org/evidence-desk/pull/57):
[t_669122cc](hermes:task/t_669122cc) covers create/open/validate and
[t_23847d50](hermes:task/t_23847d50), review run 10, accepts item creation/update and stale-write refusal
at `af24783ee915d4371fe4432d206bb9b89610c1f0`. The completed workspace-first intention is retired;
release-specific installation and artifact verification are not implied by that execution acceptance.

PM now selects the previously sequenced source-preview preparation under the
[local-application procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications).
Use a minimal product source archive for human publication as a GitHub Release asset in this repository,
not an npm package, hosted service or bundled executable. This is PM's packaging proposal, not publication
authorization. Retain package.json's private flag. Propose SemVer prereleases starting at
`0.1.0-alpha.1`, separate from workspace format version 1; explicitly document compatibility expectations
and require a format version change for incompatible persisted-data changes, with no silent migration.
No human has volunteered implementation; dispatch one fleet preparation task, not duplicate item work.

Completion:
- Establish artifact contents, naming, deterministic build command, version/compatibility policy and
  human-only GitHub Release publication procedure in CONTRIBUTING.md. Keep exact user installation and
  runnable CLI commands in README. Pin the supported Bun toolchain and dependencies.
- Add the proposed product version and a minimal reproducible source-archive preparation command.
  Include required source, lockfile, package/toolchain metadata, license and user format documentation;
  exclude Git metadata, installed dependencies, fleet/runtime configuration, scratch evidence and secrets.
  Derive contents from a specified full committed SHA, not dirty or untracked working-tree contents;
  record provenance and an archive checksum without circular self-hashing.
- Build twice from the same committed input and compare bytes/checksums; inspect the complete archive
  inventory. Extract into a disposable folder and install frozen dependencies through the World, then
  drive create/item-create/item-update/open/validate, a deterministic stale-write refusal and preservation
  checks using synthetic files. Demonstrate the extracted artifact works without the repository checkout.
- Record exact commands, full input SHA, artifact path/checksum/inventory, toolchain, outputs and limits
  in the PR/native handoff. Pass unchanged `bun run check` through the World in under thirty seconds
  before push, and obtain independent native execution review. Do not tag, publish, approve or select
  the final release candidate; PM reconciles the landed preparation before candidate-specific verification.

Dependencies: accepted workflow above and setup acceptance in
[PR #52](https://github.com/open-autonomy-org/evidence-desk/pull/52) are satisfied. Packaging must expose,
not conceal, the [write limitations](https://github.com/open-autonomy-org/evidence-desk/blob/af24783ee915d4371fe4432d206bb9b89610c1f0/docs/workspace-format.md#item-writes-and-concurrency):
existing-file association only, cooperating-writer locking rather than atomic compare-and-swap,
quiescent reference topology, lossy-number/manifest-alias refusals and manual crash-leftover recovery.
No GUI, sync, automatic conflict merging, customer integration or general concurrent-writer guarantee
is added to this preview scope.

## release-next: First portable-workspace preview

Dispatch: hold
Release decision: prepare
Target version: 0.1.0-alpha.1, proposed pending the landed artifact/version policy
Target window: 2026-09-16 through 2026-09-18, America/New_York; provisional forecast
Review by: 2026-09-15, America/New_York; proposed review target, subject to reviewer availability
Candidate: not selected
Scope: accepted portable-workspace CLI and preview-artifact; no GUI, sync or hosted service
Readiness: pending
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish create/open/validate; https://github.com/open-autonomy-org/evidence-desk/pull/57 and hermes:task/t_23847d50 review run 10 establish item editing, preservation safeguards and bounded conflict/failure acceptance. Artifact/version policy and candidate-specific artifact/install verification remain outstanding.
Rationale: Move from accumulation to preparation after independent acceptance of the complete bounded folder workflow. Retain the existing forecast to allow reproducible artifact preparation and human review rather than treating the early merge as a release trigger.
Version rationale: Retain proposed 0.1.0-alpha.1 for the first experimental CLI preview; GitHub tags/releases remain empty and package.json has no product version at 90c9e493c017abab0bee1b6182f8c9a5b820c164. Land the proposed prerelease policy before candidate selection; workspace format 1 remains distinct.

This is PM's forecast, not an accepted human deadline or a review request. Completion of preview-artifact
must precede selection of a full landed candidate SHA and inspection/rehearsal of that candidate's exact
artifact. PM then lands a ready, fixed proposal and seeks candidate-specific human review in
[#evidence-desk](https://discord.com/channels/1544906154868744202/1546981849979682916).
Human publication and subsequent verification of the published version/checksum remain separate gates.
No reviewer commitment or independent human release approval is recorded. Installation complexity,
archive reproducibility, documented filesystem/concurrency limits and reviewer availability are risks;
unresolved dependencies move the forecast rather than waive readiness. Optional cloud synchronization
and customer AI integrations remain future choices; core use needs neither hosted accounts nor customer credentials.
