# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## Direction

The owner zero-based this plan on 2026-09-23: Evidence Desk is to be the open-source alternative to the SOC2
compliance SaaS, and the roadmap is rebuilt from scratch to reach parity with them
([owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114)). Everything
previously planned is retired, including the unpublished `0.1.0-alpha.1` proposal. The shipped workspace
format 1 (generic items with evidence paths) is not a SOC2 domain model; the first outcome below replaces it
and removes it from the product, its docs and its release tooling entirely.

Parity is measured against the whole buyer journey, from "we need SOC2" through a passed Type II audit and
the security reviews that follow, for both the company and the CPA firm. It is not measured by integration
count. The table below is the denominator. **Headline: 0 of 16 parity capabilities demonstrated.**
A row counts only when its owning outcome demonstrates it in the running local product on synthetic data.

| # | Capability (table stakes unless marked) | Owning outcome |
|---|---|---|
| 1 | SOC2 control set mapped to the Trust Services Criteria, scoping, gap view | `soc2-program` |
| 2 | Policy library: templates, editing, versioned approval | `soc2-program` |
| 3 | Registers: systems/assets, people, vendors, risks with treatment | `soc2-program` |
| 4 | Operable by the customer's own coding agent and by a nontechnical admin | `soc2-program` |
| 5 | Automated evidence collection from cloud, identity, HRIS, code and devices | `evidence-automation` |
| 6 | Continuous control checks with visible failures and alerting | `evidence-automation` |
| 7 | Onboarding/offboarding, policy acknowledgment, training, background checks | `program-operations` |
| 8 | Periodic access reviews with reviewer sign-off (near table stakes) | `program-operations` |
| 9 | Vendor reviews, risk assessment, incidents, vulnerability SLAs | `program-operations` |
| 10 | Audit engagement: Type I date / Type II period, auditor request lists | `audit-cycle` |
| 11 | Populations with their generating query, sample evidence, exceptions | `audit-cycle` |
| 12 | DC 200 system description, management assertion, bridge letter | `audit-cycle` |
| 13 | CPA firm operating many client engagements | `audit-cycle` |
| 14 | Trust center | `trust-and-questionnaires` |
| 15 | Security questionnaire answering from sourced facts | `trust-and-questionnaires` |
| 16 | Second framework (ISO 27001) reusing controls and evidence | `multi-framework` |

Evidence behind the table (reviewed 2026-09-23; vendor statements, not operated products). Commercial table
stakes across Vanta, Drata, Secureframe, Sprinto, Thoropass and Hyperproof: built-in SOC2/ISO 27001 with
cross-mapped controls, integrations that collect evidence automatically, continuous monitoring, policies,
risk register, vendor questionnaires, trust center, AI questionnaire answering, an auditor workspace and
an agent layer ([Vanta pricing](https://www.vanta.com/pricing), [Drata integrations](https://drata.com/products/integrations),
[Secureframe pricing](https://secureframe.com/pricing), [Hyperproof](https://hyperproof.io/)). The
open-source field ([Comp AI](https://github.com/trycompai/comp), [Probo](https://github.com/getprobo/probo),
[CISO Assistant](https://github.com/intuitem/ciso-assistant-community), [Openlane](https://github.com/theopenlane/core))
covers much of that as database-backed web servers; read from their source trees, none keeps its system of
record as owner-held files, uses Git as the audit trail, runs as a local folder application, or produces an
auditor package verifiable without the vendor's server. Rows 1–16 come from that evidence and from auditor-side
requirements ([population completeness](https://keitercpa.com/blog/soc-2-challenges-population-completeness-va-cpa-firm/),
[DC 200](https://linfordco.com/blog/what-are-soc-2-description-criteria/)).

Open Autonomy is the second half of the direction: Evidence Desk works in conjunction with it, reading a
company's controls out of the automation it already runs instead of surveying people about them
([owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114)). An Open Autonomy
project declares that automation in its repository: `.open-autonomy/agent.json`, the agent-setup package in the
Supercode IR, holds its profiles, scheduled jobs and models, with one manager per field and a live change the
repository did not make reported as a conflict ([ADR 0007](https://github.com/open-autonomy-org/open-autonomy/blob/ee4bb46a4588abbdbf62ef6af321c05b73b7f01e/docs/decisions/0007-the-kit-ships-an-agent-setup.md));
the `team` roster holds its humans, their verified accounts and authority scopes ([team codec](https://github.com/open-autonomy-org/open-autonomy/blob/ee4bb46a4588abbdbf62ef6af321c05b73b7f01e/packages/sdk/src/team.ts)).
Its operation leaves records: board tasks with attempts, handoffs and review verdicts, reviewed pull requests,
candidate-specific release reviews and metered model calls on public books. This ingestion is optional: core use
never requires Open Autonomy.
**Differentiator D1, not counted in the parity headline:** controls, authority and operating evidence ingested
from an Open Autonomy project, owned by `open-autonomy-ingestion`.

**Extrapolation starts here.** The outcome boundaries, sequence and the design choices inside each outcome
are the owner-side agent's judgment, not measured user research. Differentiation hypothesis: the same
capabilities, held as a Git-tracked folder the customer's own agent can operate, with evidence whose
provenance an auditor can check offline, beat hosted peers on trust, cost and lock-in.

Content rule for every outcome: ship Trust Services Criteria IDs and category names with the project's own
control wording; never ship AICPA criterion text or points of focus. A customer may import their own
licensed AICPA copy locally. Policy templates come from CC0/Apache sources
([Tailscale security-policies, CC0](https://github.com/tailscale/security-policies),
[strongdm/comply, Apache-2.0](https://github.com/strongdm/comply)); SCF and CIS content are not redistributable.

Sequence: `soc2-program` first (every other outcome writes into its formats), then `open-autonomy-ingestion`
(the differentiator, and the first source to exercise the evidence record), then `evidence-automation` and
`program-operations`, then `audit-cycle`, then `trust-and-questionnaires` and `multi-framework`.

## soc2-program: A company's whole SOC2 program as a folder it owns

Status: planned
Dispatch: fleet

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 1–4.

A startup with no compliance program creates a workspace, answers a scoping interview (services, systems,
subservice providers, in-scope criteria) and gets a tailored SOC2 control set, a policy set and registers,
all as documented, versioned files. It sees what is missing per control, and edits in the local UI, the CLI
or with its own coding agent, with the same validation either way. This replaces format 1 and its code.

Completion:
- A versioned, documented workspace format with published JSON Schemas for scope, controls, policies, systems/assets, people, vendors, risks and evidence records; evidence records carry source, collection time, period and content hash. Every Security (CC) criterion ID is covered by at least one control in the project's own words.
- A policy library of at least 15 policies adapted from CC0/Apache sources, each with owner, version, approval record and mapped controls; approving a new version preserves the previous one.
- A local UI a nontechnical admin can drive end to end: scoping interview, control and policy review, registers, and a gap view per control and per criterion; the CLI reaches the same operations with JSON output.
- The workspace ships its own agent instructions so the customer's Claude Code or Codex can operate it; an externally edited file is validated and conflicts are surfaced, never silently overwritten.
- Format 1, its CLI, workbench, README sections, ADR0002, alpha.1 packaging and version metadata are removed entirely; README documents the new run command.
- Demonstrated on a synthetic startup workspace in the World: create, scope, adopt controls and policies, fill registers, agent edit, gap view.

## open-autonomy-ingestion: Read the program out of the automation that runs it

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); [ADR 0007](https://github.com/open-autonomy-org/open-autonomy/blob/ee4bb46a4588abbdbf62ef6af321c05b73b7f01e/docs/decisions/0007-the-kit-ships-an-agent-setup.md); differentiator D1. Waits on `soc2-program`, and on Open Autonomy specifying its human seams ([proposed ADR 0008](https://github.com/open-autonomy-org/open-autonomy/blob/adr/0008-human-seams/docs/decisions/0008-human-seams.md)): the seam inventory reads that declaration once it exists.

The target is a small project that runs on Open Autonomy: agents do the work, and people plug in at a few
controlled seams (direction, release review, the production deploy approval and tag, credential custody,
roster changes, moderation, and administration of the vendor accounts the project runs on). Evidence Desk points
at the project's repository and reads, without a questionnaire, what its declarations establish: which humans
hold which authority, which agents run on which schedules and models with which credentials by custody name,
how a change to the automation is made and how drift from it is caught, and which vendors it depends on. Over a
period its durable records (reviewed and merged changes, deployments with their approvals, the roster's history)
become populations with the query that produced them. Records are read through Open Autonomy's own interfaces
(its SDK and the published Supercode orchestrator package the kit pins), never by parsing a harness's private state.

For such a project the SOC2 program shrinks to the seams: every person at a seam is a person in scope, and the
human controls (identity and MFA, onboarding and removal, policy acknowledgment, training, periodic access review,
risk and incident review) apply to that small set. What the automation does not cover (the service's runtime,
data handling, availability) stays on the ordinary evidence paths, and the gap view says which facts came from where.

Completion:
- A read-only source that reads a project at a named commit: `agent.json` profiles, jobs and models, the `team` roster with scopes, the landing and production rules, and the vendors named by its dependencies and deploy egress; each fact carries that commit as provenance and maps to the controls and criteria it evidences.
- A seam inventory: every place a human acts, who may act there, and where the act is recorded. Seams whose acts are not durably recorded (a release approval given in chat, a board verdict held only in an agent's home) are shown as gaps, not counted as evidence.
- A completeness reconciliation: the roster compared with the people who actually hold admin or deploy rights in the vendor accounts the project runs on (imported or collected); anyone with rights outside the roster is a finding.
- Scoping answers those declarations determine are filled from them and marked as such; a later change surfaces as a changed design fact, never a silent overwrite.
- Period populations only from durable records (merged changes with reviews, production deployments with approvals, roster history), each with its generating query and completeness basis, ready for `audit-cycle` sampling.
- Demonstrated in the World on a synthetic project created with the current Open Autonomy kit against its twins, with synthetic history spanning a period and at least one out-of-roster admin found; no real project is read.

## evidence-automation: Evidence collects itself, and controls are checked continuously

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 5–6. Waits on `soc2-program` formats.

Owner-operated collectors pull evidence from the company's systems with the company's own credentials,
run on demand locally or on a schedule in the workspace repository's own CI, and write dated,
provenance-bearing snapshots into the folder. Checks evaluate snapshots against controls and record
pass/fail history; a failure is visible in the UI and fails the owner's scheduled run so their usual
notification reaches them. No hosted control plane.

Completion:
- A collector contract (inputs, credential source, output snapshot format, provenance including the generating query) documented so a customer or their agent can write a new collector.
- Collectors for the startup core, each developed against a vendor twin: AWS, GitHub, Google Workspace, Okta, one HRIS and one MDM. Each has a check library covering the controls it evidences.
- A scheduled-run template for the workspace repository's CI and a local on-demand run; failures, stale evidence and collector errors are visible per control.
- Demonstrated end to end in the World against the twins, including a failing check, its remediation and the recorded history.

## program-operations: Run the recurring obligations auditors test

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 7–9. Waits on `soc2-program`.

The obligations that recur through an audit period become tracked, evidenced work: hires and leavers with
onboarding/offboarding steps, policy acknowledgment and training, background checks, quarterly access
reviews, vendor reviews, the annual risk assessment, incidents and vulnerability remediation SLAs.
Acknowledgments and sign-offs arrive through channels the owner chooses (their identity provider, HRIS,
e-signature export, Git), not a project-hosted portal; how employees without repository access
acknowledge policies is a design decision this outcome must make and document.

Completion:
- A calendar of obligations derived from the adopted controls, with due, overdue and done states and the evidence each produced.
- An access review cycle: user listings per system (from collectors or import), reviewer decisions, removals and sign-off, all recorded in the folder.
- People lifecycle: synthetic hires and leavers reconcile to acknowledgment, training, background-check and access-removal evidence with timeliness shown.
- Demonstrated over a simulated quarter in the World on a synthetic workspace.

## audit-cycle: Take the program through a Type I and Type II audit

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 10–13. Waits on `soc2-program`, `open-autonomy-ingestion`, `evidence-automation`, `program-operations`.

A company and its CPA firm run an engagement: Type I as of a date or Type II over a period, the firm's request
list, populations with the query or parameters that generated them, samples the auditor selects, evidence per
sample, exceptions and responses. The company drafts its DC 200 system description, management assertion
and later bridge letter from workspace facts. Exchange is a deliberate, point-in-time package the firm can
verify offline and return, not shared access to the whole folder. A firm manages many client engagements.
Evidence Desk never issues opinions or performs audit testing conclusions.

Completion:
- Engagement records for Type I and Type II with period boundaries; evidence outside the period is flagged, not silently used.
- Population export per control with generating query and timestamp; auditor sample selection recorded; sample evidence and exceptions tracked to closure.
- Generated DC 200 description covering DC1–DC9, management assertion and bridge letter drafts, each traceable to the facts they cite.
- An exported package whose contents, hashes and omissions a recipient verifies offline; a returned package reconciles without discarding intervening edits.
- A firm view across at least two isolated synthetic client engagements with no cross-client disclosure.
- Demonstrated with a synthetic company and synthetic firm through a Type II request, sample, exception and closure cycle.

## trust-and-questionnaires: Answer customers' security reviews from sourced facts

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 14–15. Waits on `audit-cycle`.

The company publishes a trust center generated from the workspace as a static site it hosts where it likes,
and answers incoming security questionnaires (spreadsheet in, spreadsheet out) with answers drafted from
workspace facts, each citing its source, reviewed before export. Drafting works without AI through
retrieval over the folder, and better with the customer's own agent; no project-selected AI service.

Completion:
- A static trust center build: selected policies, controls, subprocessors and report availability, with documents gated behind the owner's own request process.
- Questionnaire import, drafted answers with citations to workspace records, review states and export back to the original format.
- A reusable answer library that updates when its cited facts change.
- Demonstrated on synthetic questionnaires in the World.

## multi-framework: Reuse one program for ISO 27001

Status: planned
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity row 16. Waits on `soc2-program`.

Add ISO 27001 as a second framework mapped onto the same controls and evidence, IDs with the project's own
wording under the same content rule, with a statement of applicability and a cross-framework gap view.

Completion:
- ISO 27001 Annex A mapping onto existing controls; shared evidence counted once, gaps shown per framework.
- A statement of applicability generated from the workspace.
- Demonstrated on the synthetic startup workspace.

## release-next: First release of the rebuilt product

Dispatch: hold
Release decision: accumulate
Readiness: pending

No candidate exists. PM proposes version, window and scope once `soc2-program` lands, under the
[release procedure](.open-autonomy/PRODUCTION.md). Each release still requires candidate-specific human review.
