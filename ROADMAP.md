# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## workspace-first: Demonstrate readiness work in a portable local folder

Status: create/open/validate landed and accepted; item editing and conflicting-write protection are ready for implementation.
Dispatch: fleet

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

Dependencies: the first slice's implementation and native review prerequisite is satisfied. The
[landed setup reconciliation](https://github.com/open-autonomy-org/evidence-desk/blob/a7d6bb119735ad964c8f020c2d888627279d8619/.open-autonomy/setup.json)
in [PR #52](https://github.com/open-autonomy-org/evidence-desk/pull/52) concludes the temporary operator
observation and records owner-authorized resumption of recurring jobs and successor development after
native shell/intake acceptance. The current scrum exercised the corrected terminal, World doctor and PM
poll, and verified the previous PM run completed and its
[final report was delivered](https://discord.com/channels/1544906154868744202/1546981849979682916/1547400673287602237).
The fulfilled development-ready outcome is retired; historical source-coverage and incident pointers stay
in native PM working memory, not as a new setup or implementation gate. This supersedes the temporary
hold in [PR #51](https://github.com/open-autonomy-org/evidence-desk/pull/51), not the human release gate.

PM selects item editing with conflicting-write protection as the next coherent fleet slice, inferred
from the constitutional external-editing invariant and accepted CLI's explicit write/concurrency limits.
Queue one successor, not a duplicate of t_669122cc; no human implementation commitment is recorded.
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
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish the running create/open/validate slice and native review; https://github.com/open-autonomy-org/evidence-desk/pull/52 resolves the setup hold. Item editing/conflict handling, artifact/version policy and candidate-specific release verification remain outstanding.
Rationale: Retain the provisional window after setup acceptance enables the next product slice; a complete portable-folder workflow and reviewable artifact still need preparation. The forecast allows implementation followed by human review, but supplies neither a reviewer commitment nor publication authority.
Version rationale: Retain proposed 0.1.0-alpha.1 for an experimental file contract; the project API still returns no tags or GitHub releases, and package.json has no product version. Artifact/version policy must land before candidate selection.

This remains PM's forecast under the [local-application release procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications),
not an accepted deadline or a review request. Propose a source archive with pinned Bun dependencies
and documented local commands as the first artifact; establish its version policy and distribution
destination in CONTRIBUTING.md before preparing a candidate. Sequence that preparation after the bounded
item-editing handoff so packaging reflects the verified workflow. Reassess the forecast when that slice
is verified; unresolved dependencies move the target rather than waive readiness.

Readiness requires workspace-first, a landed artifact/version policy, a full landed candidate SHA,
inspected artifact contents, and candidate-specific installation/workflow/check evidence.
PM then lands the exact proposal and seeks candidate-specific review from the currently authorized reviewer
through [#evidence-desk](https://discord.com/channels/1544906154868744202/1546981849979682916).
Publication remains a human action. Installation complexity, file-preservation defects and reviewer
availability are the principal risks. No reviewer commitment or independent human release approval is recorded.
