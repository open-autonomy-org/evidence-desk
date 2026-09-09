# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## development-ready: Complete the development installation

Status: persistent runtime and supervised PM accepted; full development-loop acceptance pending.
Dispatch: hold

The [landed operational evidence](https://github.com/open-autonomy-org/evidence-desk/pull/33)
records healthy World admission, persistent native launchd supervision, running kit 2.8.2, and a
completed gateway-owned PM run whose 90 turns and final report reached the public stream and whose
planning changes landed in [PR #32](https://github.com/open-autonomy-org/evidence-desk/pull/32).
The earlier interrupted run recovered under supervision; its original termination cause is unverified.
The [current setup agreement](https://github.com/open-autonomy-org/evidence-desk/blob/8de5088d33e8515a125ac16b7b7b82127c8d6fda/.open-autonomy/setup.json)
authorizes one ready product slice to demonstrate the remaining native development loop under the
owner's standing direction. That first task does not depend on an already-completed worker cycle.
The setup operator observes acceptance; recurring PM/community schedules stay paused during this
bounded exercise. Runtime startup and a completed PM run alone do not establish full-loop acceptance.

Completion:
- Preserve the evidenced persistent runtime and supervised PM acceptance.
- Demonstrate the queued product slice through worker verification, native reviewer acceptance,
  landing on main and subsequent PM reconciliation; retain the task, handoff, PR and check sources.
- Application commands and the required check can run through the machine's World from planning
  and worker workspaces, using disposable synthetic folders.
- The agreed public channel supports original-author history reads and verified scheduled delivery;
  native restart/version reporting is established without losing work or source checkpoints.

Dependencies: the current [setup agreement](https://github.com/open-autonomy-org/evidence-desk/blob/8de5088d33e8515a125ac16b7b7b82127c8d6fda/.open-autonomy/setup.json)
and [communication policy](hermes/skills/project-communications/SKILL.md). No human implementation
commitment or new infrastructure assignment is implied.

## workspace-first: Demonstrate readiness work in a portable local folder

Status: first bounded create/open/validate slice ready for the development-loop exercise.
Dispatch: fleet

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

Dependencies: runtime startup and supervised PM acceptance are evidenced in
[PR #33](https://github.com/open-autonomy-org/evidence-desk/pull/33). Dispatch at most one fleet task
for the versioned folder contract and runnable create/open/validate slice under that setup agreement.
It must document the actual application command, safely initialize a new workspace, reopen an
externally authored synthetic item with relative evidence references, and validate unsupported formats,
malformed records and unsafe or missing paths without modifying existing files. Read-only operations
must preserve unknown data and unrelated evidence; initialization must refuse an occupied destination.
Worker operation through the World and native review provide evidence for development-ready.
Reconcile that task's verification and landing before queueing item editing and conflict handling;
the full workspace-first outcome remains incomplete until all completion criteria above are met.
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
Readiness evidence: The starter remains a placeholder; https://github.com/open-autonomy-org/evidence-desk/pull/33 accepts runtime startup and supervised PM operation while retaining full-loop acceptance and human release review.
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
