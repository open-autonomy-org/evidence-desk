# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## development-ready: Complete the development installation

Status: awaiting setup acceptance.
Dispatch: hold

The [latest setup adoption](https://github.com/open-autonomy-org/evidence-desk/pull/26)
records native Git, Discord and a bounded model turn, but leaves persistent host startup and the
complete PM/kanban/worker/reporting loop outstanding. Completing that installation belongs to the
setup agent. A scheduled PM invocation alone does not establish its acceptance.

Completion:
- Setup records the persistent project runtime and a successful native development/review loop.
- Application commands and the required check can run through the machine's World from planning
  and worker workspaces, using disposable synthetic folders.
- The agreed public channel supports original-author history reads and verified scheduled delivery;
  native restart/version reporting is established without losing work or source checkpoints.

Dependencies: the existing [setup agreement](https://github.com/open-autonomy-org/evidence-desk/blob/3ddb5574e695cb497d1c56c1c006e3347f67f589/.open-autonomy/setup.json)
and [communication policy](hermes/skills/project-communications/SKILL.md). No human implementation
commitment or new infrastructure assignment is implied.

## workspace-first: Demonstrate readiness work in a portable local folder

Status: PM implementation proposal; release the hold after development-ready is evidenced.
Dispatch: hold

Build the first usable slice of the [constitutional product](https://github.com/open-autonomy-org/evidence-desk/blob/417f7f9334c460b03c95eaa4e51ca5d9cb66a5dd/CONSTITUTION.md):
create a workspace, record a readiness item, associate evidence, and inspect what remains incomplete.
PM proposes a local command-line entry point first to demonstrate the file contract before adding
a larger interface. This sequencing is a PM inference from the portable-folder and external-editing
requirements, not a new owner commitment. The [starter](https://github.com/open-autonomy-org/evidence-desk/pull/1)
already supplies its introductory README and reports a successful frozen install and World check;
its historical hello intention needs no duplicate task.

Completion:
- Document a versioned folder format and actual application command in durable project docs.
- Create and reopen a synthetic workspace containing a readiness item with an ID, owner, status,
  Markdown context and explicit relative references to ordinary evidence files.
- Show incomplete items and missing references with actionable validation errors; reject unsupported
  formats and unsafe paths without modifying the workspace.
- Demonstrate external file edits being read on reopening, preservation of unrelated evidence and
  unknown data, and refusal of conflicting writes without silent data loss.
- Run the workflow on disposable synthetic folders through the World, recording the exact command
  and results in the implementation PR; `bun run check` passes in under thirty seconds.

Dependencies: development-ready. Start with one bounded fleet task for the folder contract and runnable
create/open/validate slice, then reconcile its evidence before queueing item editing and conflict handling.
Optional cloud synchronization and customer AI integrations remain future product choices; core use
requires no hosted account or customer credentials.

## release-next: First portable-workspace preview

Dispatch: hold
Release decision: accumulate
Target version: 0.1.0-alpha.1, proposed pending the artifact/version policy
Target window: 2026-09-16 through 2026-09-18, America/New_York; provisional forecast
Review by: 2026-09-15, America/New_York; proposed review target, subject to reviewer availability
Candidate: not selected
Scope: workspace-first and a documented, reproducible local preview artifact
Readiness: pending
Readiness evidence: The starter remains a placeholder; https://github.com/open-autonomy-org/evidence-desk/pull/26 records setup acceptance still outstanding.
Rationale: Accumulate a complete portable-folder workflow before proposing publication; allow roughly one week for the first slice and at least a day for human review.
Version rationale: A first prerelease communicates an experimental file contract; no tags or GitHub releases were returned by the project API during this initial reconciliation, and package.json has no product version.

This is PM's initial forecast under the [local-application release procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications),
not an accepted deadline or a review request. Propose a source archive with pinned Bun dependencies
and documented local commands as the first artifact; establish its version policy and distribution
destination in CONTRIBUTING.md before preparing a candidate. Reassess the forecast when setup acceptance
and the first running slice arrive; unresolved dependencies move the target rather than waive readiness.

Readiness requires development-ready and workspace-first, a landed artifact/version policy, a full landed
candidate SHA, inspected artifact contents, and candidate-specific installation/workflow/check evidence.
PM then lands the exact proposal and seeks candidate-specific review from the currently authorized reviewer
through [#evidence-desk](https://discord.com/channels/1544906154868744202/1546981849979682916).
Publication remains a human action. Installation complexity, file-preservation defects, incomplete setup,
and reviewer availability are the principal risks. No reviewer commitment is recorded.
