# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## development-ready: Complete the development installation

Status: first worker/reviewer/landing cycle evidenced and reconciled; overall setup acceptance remains held.
Dispatch: hold

The [landed operational evidence](https://github.com/open-autonomy-org/evidence-desk/pull/33)
records healthy World admission, persistent native launchd supervision, running kit 2.8.2, and a
completed gateway-owned PM run whose 90 turns and final report reached the public stream and whose
planning changes landed in [PR #32](https://github.com/open-autonomy-org/evidence-desk/pull/32).
The earlier interrupted run recovered under supervision; its original termination cause is unverified.
The authorized first slice has now landed in [PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38)
at `34955578c23b07564b96768148aa0336b0ddec0f`. [Native task t_669122cc](hermes:task/t_669122cc)
records run 4 requesting review of `6b07216cc97ffcec757ce16e2a71503d44176108` and run 5 independently
verifying and completing it. The worker and reviewer drove disposable synthetic folders through the
World; their checks passed in 0.794s and 0.674s respectively. The
[landing check](https://github.com/open-autonomy-org/evidence-desk/actions/runs/34345598303/job/102446326737)
also succeeded. This reconciliation accounts for that completed task without treating its acceptance
as human approval or completion of the larger product outcome.

The [setup evidence and diagnosis](https://github.com/open-autonomy-org/evidence-desk/pull/37)
retain the earlier watchdog failures and unresolved cause; later successful runs do not explain those
failures or establish the failed attempts' public terminal attribution. The reviewer also recorded
that installed World attachment omits the documented `VOLTER_WORLD` marker, despite successful
attached execution, doctor and coverage checks. Keep that tooling discrepancy for setup reconciliation.
The [scheduled report readback](https://discord.com/channels/1544906154868744202/1546981849979682916/1547199081451888650)
proves bot delivery; human-authored inbound handling remains unverified. The setup operator retains
acceptance ownership. Under the [bounded reconciliation instruction](hermes:session/cron_1afde51fbc2c_20260909_113316),
recurring schedules stay paused and no successor implementation is queued.

Completion:
- The setup operator assesses the complete worker/reviewer/landing/reconciliation evidence, preserving
  earlier failures and the World marker discrepancy without inferring their resolution.
- Demonstrate human-authored inbound handling through the agreed public channel with original-author
  provenance; bot messages and the roster alone do not satisfy this criterion.
- Preserve verified World execution, runtime/version reporting and source checkpoints when the
  operator concludes the exercise; recurring operation and delivery still need observation after resumption.

Dependencies: the current [setup agreement](https://github.com/open-autonomy-org/evidence-desk/blob/8de5088d33e8515a125ac16b7b7b82127c8d6fda/.open-autonomy/setup.json)
and [communication policy](hermes/skills/project-communications/SKILL.md). No human implementation
commitment or new infrastructure assignment is implied.

## workspace-first: Demonstrate readiness work in a portable local folder

Status: create/open/validate landed and accepted; item editing and conflicting-write protection remain.
Dispatch: hold

Build the first usable slice of the [constitutional product](https://github.com/open-autonomy-org/evidence-desk/blob/417f7f9334c460b03c95eaa4e51ca5d9cb66a5dd/CONSTITUTION.md):
create a workspace, record a readiness item, associate evidence, and inspect what remains incomplete.
PM proposes a local command-line entry point first to demonstrate the file contract before adding
a larger interface. This sequencing is a PM inference from the portable-folder and external-editing
requirements, not a new owner commitment. The [starter](https://github.com/open-autonomy-org/evidence-desk/pull/1)
already supplies its introductory README and reports a successful frozen install and World check;
its historical hello intention needs no duplicate task.

[PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38) delivers the documented
[version 1 file contract](https://github.com/open-autonomy-org/evidence-desk/blob/6b07216cc97ffcec757ce16e2a71503d44176108/docs/workspace-format.md)
and runnable create/open/inspect/validate commands. Native review in
[t_669122cc](hermes:task/t_669122cc) verified externally authored items and edits, incomplete counts,
malformed/unsupported input, unsafe and missing references, occupied-destination refusal, and preservation
of unknown data and evidence bytes. The CLI assumes quiescent folders and supplies no item-write command;
read-only preservation is not evidence of safe conflicting writes.

Remaining completion / next slice:
- Add local item creation and updates for ID, owner, status, Markdown-context and existing evidence
  references using the landed format; preserve unknown fields and unrelated files.
- Define and demonstrate conflicting-write refusal: an external change since the application's read
  must produce an actionable conflict without silently replacing that change. Document the supported
  concurrency boundary and failure behavior before claiming safe writes.
- Drive the full create/item-edit/reopen/validate workflow, external-edit conflicts and byte preservation
  through the World on disposable folders; record exact commands and results in the implementation
  PR/native handoff, with `bun run check` passing in under thirty seconds.

Dependencies: the first slice's implementation and native review prerequisite is satisfied. PM assesses
item editing with conflicting-write protection as the next coherent fleet slice, inferred from the
constitutional external-editing invariant and the accepted CLI's explicit write/concurrency limits.
It is scoped for later dispatch, with no human implementation commitment. The
[current bounded exercise](hermes:session/cron_1afde51fbc2c_20260909_113316) holds new tasks until the
setup operator concludes its observation; no duplicate of t_669122cc is needed.
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
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish the running create/open/validate slice and native review; item editing/conflict handling, setup acceptance, artifact/version policy and candidate-specific release verification remain outstanding.
Rationale: Retain the provisional window after the first slice landed; a complete portable-folder workflow and reviewable artifact still need preparation. The remaining week is a forecast with setup and human-review dependencies, not authority to dispatch or publish.
Version rationale: Retain proposed 0.1.0-alpha.1 for an experimental file contract; the project API still returns no tags or GitHub releases, and package.json has no product version. Artifact/version policy must land before candidate selection.

This remains PM's forecast under the [local-application release procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications),
not an accepted deadline or a review request. Propose a source archive with pinned Bun dependencies
and documented local commands as the first artifact; establish its version policy and distribution
destination in CONTRIBUTING.md before preparing a candidate. Reassess the forecast when setup observation
concludes and the item-editing slice is verified; unresolved dependencies move the target rather than waive readiness.

Readiness requires development-ready and workspace-first, a landed artifact/version policy, a full landed
candidate SHA, inspected artifact contents, and candidate-specific installation/workflow/check evidence.
PM then lands the exact proposal and seeks candidate-specific review from the currently authorized reviewer
through [#evidence-desk](https://discord.com/channels/1544906154868744202/1546981849979682916).
Publication remains a human action. Installation complexity, file-preservation defects, incomplete setup,
and reviewer availability are the principal risks. No reviewer commitment is recorded.
