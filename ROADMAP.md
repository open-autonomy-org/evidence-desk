# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## Direction

The owner zero-based this plan on 2026-09-23: Evidence Desk is to be the open-source alternative to the SOC2
compliance SaaS, and the roadmap was rebuilt from scratch to reach parity with them
([owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114)).

Parity is measured against the whole buyer journey, from "we need SOC2" through a passed Type II audit and
the security reviews that follow, for both the company and the CPA firm. It is not measured by integration
count. The table below is the denominator. **Headline: 15 of 16 parity capabilities demonstrated** (all but row 5, where GitHub and Cloudflare collection have landed).
A row counts only when its owning outcome demonstrates it in the running local product on synthetic data.

| # | Capability (table stakes unless marked) | Owning outcome |
|---|---|---|
| 1 | SOC2 control set mapped to the Trust Services Criteria, scoping, gap view | demonstrated |
| 2 | Policy library: templates, editing, versioned approval | demonstrated |
| 3 | Registers: systems/assets, people, vendors, risks with treatment | demonstrated |
| 4 | Operable by the customer's own coding agent and by a nontechnical admin | demonstrated (a headless Claude Code session worked a workspace from its shipped instructions) |
| 5 | Automated evidence collection from cloud, identity, HRIS, code and devices | `evidence-automation` (GitHub and Cloudflare landed) |
| 6 | Continuous control checks with visible failures and alerting | demonstrated |
| 7 | Onboarding/offboarding, policy acknowledgment, training, background checks | demonstrated |
| 8 | Periodic access reviews with reviewer sign-off (near table stakes) | demonstrated |
| 9 | Vendor reviews, risk assessment, incidents, vulnerability SLAs | demonstrated |
| 10 | Audit engagement: Type I date / Type II period, auditor request lists | demonstrated |
| 11 | Populations with their generating query, sample evidence, exceptions | demonstrated |
| 12 | DC 200 system description, management assertion, bridge letter | demonstrated |
| 13 | CPA firm operating many client engagements | demonstrated |
| 14 | Trust center | demonstrated |
| 15 | Security questionnaire answering from sourced facts | demonstrated |
| 16 | Second framework (ISO 27001) reusing controls and evidence | demonstrated |

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
Its operation leaves records: reviewed pull requests, production deployments with their approvals, candidate
release reviews and metered model calls on public books.

The aim: Open Autonomy's `soc2` template is SOC2 ready out of the box, with Evidence Desk as its compliance program;
other templates are not required to be ([owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114#issuecomment-5802291630)).
The end state, locked by the owner: a project created from it can engage a CPA almost immediately, for a Type I
once its policies, seams and onboarding exist, and with Type II observation running from launch. What remains
outside the product is the CPA firm, a penetration tester, an independent second person for the few reviews the
sole owner cannot perform on themselves, vendors' own assurance reports, and the observation period itself.
Agents do the work; people act at a few controlled seams that Open Autonomy specifies exactly
([ADR 0008](https://github.com/open-autonomy-org/open-autonomy/blob/6e7a769f45236ac010f135695226dfa7f735fddd/docs/decisions/0008-human-seams.md)); the people at those seams complete onboarding quizzes and surveys. The template's
declarations and seams supply the controls and evidence that automation can; the humans supply the rest. This
integration is optional: core use never requires Open Autonomy.
**Differentiator D1, not counted in the parity headline:** a project on Open Autonomy's `soc2` template reaches SOC2
readiness out of the box, owned by `open-autonomy-soc2-ready` (landed and demonstrated end to end; kit 3.3.0 published as `create-open-autonomy@3.3.0` on 2026-09-24).

**Extrapolation starts here.** The outcome boundaries, sequence and the design choices inside each outcome
are the owner-side agent's judgment, not measured user research. Differentiation hypothesis: the same
capabilities, held as a Git-tracked folder the customer's own agent can operate, with evidence whose
provenance an auditor can check offline, beat hosted peers on trust, cost and lock-in.

Content rule for every outcome: ship Trust Services Criteria IDs and category names with the project's own
control wording; never ship AICPA criterion text or points of focus. A customer may import their own
licensed AICPA copy locally. Policy templates come from CC0/Apache sources
([Tailscale security-policies, CC0](https://github.com/tailscale/security-policies),
[strongdm/comply, Apache-2.0](https://github.com/strongdm/comply)); SCF and CIS content are not redistributable.

The remaining outcomes are `Dispatch: hold`: each waits on work outside this repository (twins for further
collectors, the human release steps).

Sequence: `open-autonomy-soc2-ready` (demonstrated; the published twin package lags), then
`evidence-automation` (further collectors wait on twins). The workspace
format, control library, policy templates, CLI and local app, the operation of the program, reading Open Autonomy
projects, collectors and checks, the audit cycle, the trust center and questionnaires, and ISO 27001 have landed; see [CHANGELOG.md](CHANGELOG.md) and
[docs/workspace-format.md](docs/workspace-format.md).

## open-autonomy-soc2-ready: A project on Open Autonomy's soc2 template is SOC2 ready out of the box

Status: active; demonstrated end to end on the published kit (kit 3.3.0), except on the published twin packages
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114#issuecomment-5802291630); [ADR 0007](https://github.com/open-autonomy-org/open-autonomy/blob/ee4bb46a4588abbdbf62ef6af321c05b73b7f01e/docs/decisions/0007-the-kit-ships-an-agent-setup.md); [ADR 0008](https://github.com/open-autonomy-org/open-autonomy/blob/6e7a769f45236ac010f135695226dfa7f735fddd/docs/decisions/0008-human-seams.md); differentiator D1. Open Autonomy's `soc2` template implements ADR 0008 ([open-autonomy#715](https://github.com/open-autonomy-org/open-autonomy/pull/715)).

A small project created from Open Autonomy's `soc2` template gets an Evidence Desk workspace as part of the project:
agents do the work, and people act only at declared seams (direction, release and deploy approval, credential
custody, roster changes, vendor account administration). Evidence Desk reads what the project's declarations
establish, with no questionnaire: which humans hold which authority, which agents run on which schedules and
models with which credentials by custody name, how a change to the automation is made and drift caught, which
vendors it depends on, and where each seam's acts are recorded. Over a period the durable records (reviewed and
merged changes, production deployments with their approvals, the roster's history) become populations with the
query that produced them. Records are read through Open Autonomy's own interfaces (its SDK and the published
Supercode orchestrator package the kit pins), never by parsing a harness's private state.

The people at the seams are the people in scope, and the human controls apply to them: each completes onboarding
through Evidence Desk's forms (policy acknowledgment, a security-awareness quiz, attestations such as MFA on the
accounts that reach their seam) and the recurring reviews that are a person's decision (access, risk, incidents). Each
completion is recorded through a seam's own door, attributable to that person's verified account. The project's
code states its design, including its commitments, SLA and escalation policy, data handling and infrastructure,
and its durable records show the process operating. What neither can show stays on the ordinary evidence paths:
state held in vendor consoles, whether production matches the code (stored data, backups and restores, retention),
facts about people and their devices (including the host that runs the agents), judgment acts such as the risk
assessment and the signed assertion, vendors' own assurance reports, external tests, and agreements executed with
customers. The gap view says which facts came from where.

Landed: Open Autonomy's `soc2` template (kit 3.3.0), which is self-build with the seams declared in `config.yaml`,
releases approved only by the code host's gate, direction bound only as an issue, comment or commit by a verified
roster member, `records/` for people's acts and `COMPLIANCE.md` for the program; the kit's `check` refuses a seam no
roster member can act at. In Evidence Desk: reading a project at a commit with scope and register filling that reports
rather than overwrites; the seam inventory; roster completeness against each declared vendor account; populations of
merged changes with approval independence, production deployments with their creator, roster history and each
`records/` seam; every act a person signs attributed to that person's own merged pull request; obligations as issues
assigned to their owners.

Demonstrated end to end in the World against the GitHub twin, following the template's `COMPLIANCE.md` on a synthetic
project with the kit's production workflow and a quarter of history (three merged changes, one without an independent
approval; two tag deployments): two roster members onboarded through their own pull requests, the owner's approvals and
risk assessment and the reviewer's access review attributed (28 of 28 signed acts), an administrator outside the roster
found and then removed by the access review, and the change-review, protected-history, dependency and secret-scanning
checks passing. The gap view's program section is empty. What remains per control is people's statements and acts
(each control's status, management and internal reviews, the system description, vendor due diligence) and what no
repository holds: infrastructure and data handling in vendor consoles (AC-07 to AC-09, AC-11, CONF-01, CONF-02,
OPS-05 to OPS-07), the penetration test and the CPA firm.

Kit 3.3.0 is published (`npm create open-autonomy@3.3.0 -- --skew soc2`). Outstanding: the
published twin package (0.1.2) predates the twin fixes this demonstration used. Since the demonstration: risk decisions
and vendor reviews are attributed like every other signed act, and the organization two-factor check passes against the
twin with an owner's token.

Completion:
- The published twin packages the demonstration uses (`@volter/twin-github` is 0.1.2 on npm) carry its fixes, and the demonstration passes again on them.

## evidence-automation: Evidence collects itself, and controls are checked continuously

Status: active
Dispatch: hold

Source: [owner direction, issue #114](https://github.com/open-autonomy-org/evidence-desk/issues/114); parity rows 5–6. 

Owner-operated collectors pull evidence from the company's systems with the company's own credentials,
run on demand locally or on a schedule in the workspace repository's own CI, and write dated,
provenance-bearing snapshots into the folder. Checks evaluate snapshots against controls and record
pass/fail history; a failure is visible in the UI and fails the owner's scheduled run so their usual
notification reaches them. No hosted control plane.

Landed: the collector and check framework (settings in `collectors.json`, runs and results in `checks/runs/`, collected
data as evidence, failures and errors as gaps with their history, a daily GitHub Actions template pinned to a commit
that gates nothing, a Checks page) and the GitHub collector with five checks, demonstrated against the GitHub twin
through a failing run, remediation and a passing run.

Landed since: the Cloudflare collector (member two-factor, minimum TLS, HTTPS-only; administrators for roster
completeness), demonstrated against the Cloudflare twin through failing checks, remediation through Cloudflare's API and
passing checks; production deployments with the environment approval of the run that made each.

Outstanding, each blocked on a twin first: identity (Google Workspace directory, Okta), an HR system, a device manager,
and cloud posture on AWS (the AWS twin covers S3 and data services but not IAM or CloudTrail).

Completion:
- A collector contract (inputs, credential source, output snapshot format, provenance including the generating query) documented so a customer or their agent can write a new collector.
- Collectors for the startup core, each developed against a vendor twin: AWS, GitHub, Google Workspace, Okta, one HRIS and one MDM. Each has a check library covering the controls it evidences.
- Demonstrated end to end in the World against the twins, including a failing check, its remediation and the recorded history.

## release-next: The auditor packet

Dispatch: hold
Release decision: accumulate
Target version: 0.2.0
Scope: CHANGELOG.md's Unreleased section (the audit package a firm can test from)
Readiness: pending

0.1.0 was published on 2026-09-24 as [v0.1.0](https://github.com/open-autonomy-org/evidence-desk/releases/tag/v0.1.0) at 873506f.
