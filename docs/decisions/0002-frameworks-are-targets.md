# ADR 0002: Frameworks are targets the owner selects, beside SOC 2

Status: Proposed. Accepted only upon independent review against the constitution and merge of this record and its
implementation.

## Context and sources

A workspace holds one control set, adopted from `catalog/controls.json` (59 controls, each carrying the SOC 2 criteria
it meets) and filtered by the scoping answers: a control that a SOC 2 category out of scope does not need, or whose
scoping condition fails, is written `applicable: false` with an `exclusion_reason` (`actions.ts` `exclusion()`), and
the program acts on applicable controls (about forty call sites across fifteen files). Other frameworks map onto that
set: `catalog/frameworks/iso27001.json` lists ISO/IEC 27001's requirements, each naming the controls that address it;
`frameworkState` works each requirement's status out when read, and `frameworks/<id>.json` holds the organization's own
exclusions and extra mappings. `frameworks <dir> enable iso27001` adds it to `evidence-desk.json`'s `frameworks`. There is
no way to drop one, the web view names ISO 27001 directly, and nothing helps produce a self-attestation: an uploaded
document is recorded in `certifications/` like an auditor's, and matched to a framework by a pattern on its free-text
name (`trust.ts`).

Source of authorization: the owner's coding conversation, September 24, 2026: "list all the ones we want to support
because some 'readiness' and some 'self-attested' are good as a mix"; on which of them Open Autonomy helps with, the AI
frameworks first; "we should be able to select which ones we want to target so we don't HAVE to do all of them
together"; "let's think about it properly". Earlier the same day: "compliant or certified requires the doc"; "for
self-attestations, we can make those". The conversation has no public permalink; these quotations record scope, not
independent approval. Everything past them (the commands, file shapes, the attestation rule, the catalog content rule,
keeping SOC 2 a target) is this author's extrapolation.

## Decision

**Targets.** `evidence-desk.json`'s `frameworks` lists the frameworks the program aims at. SOC 2 is always one of them:
the constitution defines Evidence Desk as the program for companies pursuing SOC 2, and the owner's words above do not
say a program may leave it out. Every other framework is the owner's choice.

- `frameworks <dir>` lists the targets, each with what it can become and its readiness; `frameworks <dir> available`
  lists every framework Evidence Desk maps.
- `frameworks <dir> target <id>` adds one; `frameworks <dir> drop <id>` removes one; `drop soc2` is refused, naming
  this record. The schema requires `soc2` in the list, so a hand edit that removes it fails validation.
- A framework not targeted is not counted, shown, checked or reminded about. Dropping one deletes nothing: its
  settings, positions and every piece of evidence stay, and targeting it again resumes where it was.

**Whether a control is in play is worked out, not stored.** `applicable` keeps its one meaning, the scoping decision,
and adoption keeps writing it from the scoping answers alone. What the targets need is derived when read, the way
`frameworkState` already derives requirement status: a control is *needed* when it carries a SOC 2 criterion (SOC 2 is
always a target) or a targeted framework maps a requirement to it (with the organization's own `mappings`). Each call
site that acts on applicable controls is one of three kinds, and the implementation classifies every one of them:

| kind | acts on | examples |
|---|---|---|
| SOC 2's deliverables | applicable controls carrying a SOC 2 criterion | the audit packet and its control matrix, the drafted system description, SOC 2's criteria in the gaps view, SOC 2's readiness |
| the program's work | applicable controls that are needed | checks and their runs, obligations and reminders, collectors, owners and statuses in the gaps view |
| a framework's view | its own requirements' controls, through `frameworkState` | ISO/IEC 27001's view and statement of applicability, every new framework's readiness |

Today every control carries a SOC 2 criterion, so needed and applicable coincide and nothing changes until the first
control that meets no SOC 2 criterion exists.

**Every framework has the same description.** `catalog/frameworks/<id>.json` has `id`, `title`, `version`, `outcome`,
`issuer`, `source` and `requirements` (each an `id`, a `group`, a short `title` and the `controls` that address it);
`iso27001.json` gains the fields it lacks. SOC 2 keeps its own model (its criteria, its mapping inside each control,
its readiness from `computeGaps`); the framework registry describes it with the same fields so every target lists,
badges and publishes alike, and SOC 2's badge keeps counting controls. `outcome` says what a framework can become:

| outcome | badge with the document | the document |
|---|---|---|
| `audit report` | green, audited by the firm | an independent auditor's report (SOC 2) |
| `certificate` | green, certified until its date | a certifying body's certificate (ISO/IEC 27001, ISO/IEC 42001, AIUC-1) |
| `self-attestation` | blue, self-attested | the organization's own signed attestation (CSA STAR Level 1, CSA STAR for AI Level 1, NIST AI RMF, NIST CSF 2.0) |

A record in `certifications/` gains an optional `target`, the framework id it is the document for; badges match a
record to its target by that id, and fall back to the name only for records made before it.

Until its document is held, a target shows readiness: its requirements ready of those in scope, and the steps still
open (each requirement not ready and its next act). Publicly the steps stay counts unless `trust.json` opts in,
because a list of controls not yet ready discloses security gaps.

**A self-attestation is made here, and says only what is true.** Each requirement of a self-attestation target has a
position: *met* (the requirement is ready, worked out as today), *excluded* (the organization's existing exclusion,
with its reason), or a stated one the organization writes in `frameworks/<id>.json` under `positions`: `partial` or
`not met`, each with a statement of what is and is not in place. `frameworks <dir> attest <id> --by <person>` is
refused while any requirement has no position; a person on the roster signs; Evidence Desk renders the attestation as
Markdown (every requirement, its position and statement, the controls and evidence behind a met one) and records it in
`certifications/` with `kind: self-attestation`, `target: <id>` and its hash. The badge says "self-attested" and never
more; the rendered document discloses every requirement not met. A scheme with its own form (CSA's questionnaires for
the STAR Registry) takes the same positions, and filing it with the scheme is the organization's own act outside
Evidence Desk. An attestation is a signed act like a policy approval: `collect attribution` checks that the person who
signed it merged it from their own pull request, as it does the other acts. It lapses a year after it is made.

**Catalog content is ours.** A catalog holds identifiers and short titles written for Evidence Desk, never a standard's
requirement text, except text in the public domain (NIST's). Each names its source, version and where to read the
standard. `iso27001.json` already follows this.

**Controls for AI.** The AI frameworks need controls the SOC 2 set lacks: an AI policy, an AI system inventory, AI risk
and impact assessment, human oversight of agents, records of agent activity, model evaluation and adversarial testing.
They join `catalog/controls.json` as their own family with no SOC 2 criteria, so they are needed only while an AI target
maps them, and never enter SOC 2's deliverables. Their evidence comes from Open Autonomy where a project runs on it: the
import's declarations (agents, seams, schedules) evidence the inventory and oversight controls as well as the SOC 2
ones they serve today, and a platform collector reads the project's sessions, metered calls, pause history and roadmap
revisions as populations of a period, on the project's own key, like the GitHub and Cloudflare collectors. Before the
collector can read a whole period, the platform must page those lists and keep the pause history (Open Autonomy PR
#748).

**What ships first**, in the owner's order: AIUC-1 and ISO/IEC 42001 as readiness targets; NIST AI RMF and CSA STAR for
AI Level 1 as self-attestations; CSA STAR Level 1 and NIST CSF 2.0 on the SOC 2 mapping; then the conditional set
(ISO/IEC 27701, HITRUST, PCI DSS, the EU-U.S. Data Privacy Framework, an accessibility conformance report, HIPAA), each
only when targeted.

## Alternatives and tradeoffs

- **Write "not targeted" as `applicable: false`**, reusing scoping's exclusion. Rejected on review: `applicable` is read
  as "does not apply" by the questionnaire drafts and the statement of applicability, and as scoping by SOC 2's
  deliverables, so the conflation would tell customers that controls do not apply and put AI controls in a SOC 2
  description; it would also need a stored record of whose exclusion is whose and when a target was dropped.
- **A stored "targeted" flag on each control.** Rejected: the targets and the catalogs already say it; storing it again
  is a second record to drift.
- **Let SOC 2 be dropped.** Not decided here. It changes what the constitution says the product is for, which is the
  owner's to change; if the owner does, a later record supersedes the one line that refuses `drop soc2`.
- **Generate SOC 2 as a catalog like the others.** Rejected: `frameworkState` and `computeGaps` count SOC 2 differently,
  and a second copy of its mapping would publish a second readiness number.
- **Self-attest only by uploading a document**, as today. Kept for a document made elsewhere, but not the only door:
  an attestation rendered from the program's own positions can be refused while a requirement has none.
- **Reproduce the standards' text.** Rejected: ISO, AIUC and CSA text is licensed; identifiers and mappings are what
  the program needs.

## Consequences

- `evidence-desk.json`: `frameworks` must contain `soc2` and at least one entry. Existing workspaces (`['soc2']`,
  `['soc2', 'iso27001']`) read unchanged. `frameworks … enable` becomes `target`; the old verb is removed, and
  `README.md` and `docs/workspace-format.md` change with it.
- `framework-settings`: `framework` accepts any catalog id; `positions` is added.
- `certification`: an optional `target`.
- `framework(id)` reads any catalog; `server.ts`, the served app and `trust.ts` iterate the targets instead of naming
  ISO 27001; the gaps view gains a section per target beside SOC 2's.
- Every applicable-control call site is classified as the table says; the implementation lists the classification in
  its pull request.
- A pre-existing fault this touches: the statement of applicability reports an ISO requirement as "not included" when
  its only controls are excluded by a SOC 2 category answer (for example Confidentiality). A SOC 2 scoping exclusion is
  not an ISO decision, so such a requirement becomes *unaddressed*, with the reason shown, until the organization
  excludes it for ISO or maps another control.
- Audit engagements, the system description and `audit export` are SOC 2's and are unchanged, since SOC 2 is always a
  target.

## Constitution review

- *Evidence Desk is the alternative to SOC 2 compliance SaaS, for companies pursuing SOC 2.* Preserved: SOC 2 is always
  a target and its deliverables are unchanged; other frameworks join it under the parity mandate, as ISO/IEC 27001 did.
- *The files are the data.* Preserved: targets are a list in `evidence-desk.json`, positions are JSON beside a
  framework's settings, an attestation is a Markdown document with its hash; what is needed is derived from files, not
  stored.
- *External editing is a supported workflow.* Preserved: targets and positions may be edited by hand and are validated.
- *Private evidence stays outside public development.* Preserved: catalogs are public; attestations and positions stay
  in the owner's workspace.
- *Human commitments are explicit.* An attestation is signed by a person on the roster and checked like other signed
  acts.
- *Done is demonstrated.* Each target, drop, position and attestation is verified by operating the application in its
  world on a synthetic workspace.
- *Out of scope: issuing audit opinions or replacing the CPA's judgment.* Preserved: a self-attestation is labelled the
  organization's own; green needs an auditor's or certifying body's document.

This record cannot amend the constitution and does not need to.
