# ADR 0002: Frameworks are targets the owner selects, beside SOC 2

Status: Proposed. Accepted only upon independent review against the constitution and merge of this record and its
implementation. Implemented in two parts: targets, the scoping split, the framework registry and the documents' targets
with this record; positions and `attest` with the first self-attestation catalog, where they can be exercised.

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
frameworks first; to the author's proposed order (AIUC-1 and ISO/IEC 42001, then NIST AI RMF and CSA STAR for AI Level 1,
then CSA STAR Level 1 and NIST CSF 2.0, then the conditional set), "okay good, so now we have our priorities right";
"we should be able to select which ones we want to target so we don't HAVE to do all of them together"; "let's think
about it properly". Earlier the same day: "compliant or certified requires the doc"; "for
self-attestations, we can make those". The conversation has no public permalink; these quotations record scope, not
independent approval. The list of frameworks, which are readiness and which self-attested, and the order were the
author's proposal, which the owner accepted in those words. Everything else past them (the commands, file shapes, the
split of scoping, the attestation rule, the catalog content rule, keeping SOC 2 a target) is this author's
extrapolation.

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

**Scoping says what applies; SOC 2's categories say what its report covers.** Today one test decides both: a control
is written `applicable: false` when a scoping condition fails (`when`, such as having no office) *or* when none of its
criteria's SOC 2 categories is in scope (`actions.ts` `exclusion()`). The second is SOC 2's audit scope, not a fact about
the organization: it would exclude every control that meets no SOC 2 criterion, and it makes an ISO/IEC 27001
requirement whose only controls are confidentiality or privacy ones depend on what the SOC 2 report covers. So the two
are separated:

- `applicable` is written by adoption from the scoping conditions alone. A control is applicable unless one of its own
  `when` conditions fails. The category answers no longer write it.
- SOC 2's scope is worked out when read: a control is in SOC 2's scope when it is applicable and one of its criteria's
  categories is in scope. One function gives SOC 2's exclusion of a control: its stored `exclusion_reason` whenever it is
  not applicable (whoever wrote it, adoption or a person), otherwise today's text for categories out of scope ("Its
  criteria (…) are outside the categories in scope."); and every SOC 2
  deliverable that prints an exclusion uses it: the packet's control matrix and out-of-scope list, the drafted system
  description's excluded criteria, SOC 2's criteria in the gaps view. For library controls, their output for an
  existing workspace is unchanged.
- Re-running adoption on an existing workspace rewrites the controls excluded only by a category answer as applicable,
  with their reason removed; that is the one visible file change, and SOC 2's deliverables still exclude them.

**Whether the targets need a control is worked out, not stored.** An applicable control is *needed* when it is in SOC
2's scope (SOC 2 is always a target), or a targeted framework maps one of its requirements to it (with the
organization's own `mappings`) and that framework's settings file does not exclude the requirement. A control that is
not applicable is never needed. The rule reads only files (the controls, the scope, the targets, the catalogs, the
settings), so it does not depend on readiness. Each part of the program acts on one of three sets, and the implementation classifies
every call site that reads `applicable`:

| kind | acts on | examples |
|---|---|---|
| SOC 2's deliverables | controls in SOC 2's scope | the audit packet and its control matrix, the drafted system description, the evidence `audit export` sends without a request, SOC 2's criteria and the `computeGaps` summary counts (applicable, ready, excluded) wherever they are read (the gaps view, the CLI, the web app, the trust center and its badge, the firm's portfolio), the "also serve SOC 2" evidence count of a framework's view |
| the program's work | needed controls | adoption's policies and forms; validation that a control's policies exist; checks and their runs; obligations and reminders; collectors; owners and statuses in the gaps view; the Open Autonomy declarations gap; evidence tagged to controls by forms, access reviews, incidents and the security review, and the evidence form's control picker |
| a framework's view | its own requirements' controls, through `frameworkState` | ISO/IEC 27001's view and statement of applicability, every new framework's readiness |

`computeGaps` works out every needed control's gaps (not only SOC 2's), so `frameworkState` finds each control it
asks about; its summary counts stay SOC 2's. The controls list in the CLI and the web app shows needed controls and
controls that are not applicable (so a person can still re-include one); a control that is applicable but not needed
is not listed. The questionnaire library drafts from needed controls and from controls that are not applicable, which
it may truthfully say do not apply; a control that is merely not needed is not a passage at all. `target` and
`drop` re-run adoption. Adoption creates a file for every library control that carries a SOC 2 criterion, as today
(whether or not scoping excludes it, so SOC 2's deliverables can name it as excluded), and for a control with no SOC 2
criterion only when it is needed (so the AI family appears only once an AI target maps it); it creates the policies
and forms needed controls name, and it never deletes a file. A control
file that exists but is not needed is not validated for its policies, is not listed as work, and is never shown as
ready.

For a workspace targeting only SOC 2, the needed library controls are exactly SOC 2's scope, which is exactly today's
applicable set. A control written by hand with no SOC 2 criterion (the schema allows it) is needed only if a target
maps it, and is not part of SOC 2's deliverables.

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
record to its target by that id, and fall back to the name only for records made before it. A document held for a
framework that is not a target is still claimed while current: it is a true statement about the organization, and
targets decide only what readiness is shown.

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
signed it opened the pull request that added it, as it does the other acts (a new act kind; the attestation's record
names its signer and its hash binds the document). It lapses a year after it is made: a self-attestation is not current past that day, on the trust center as on
the badges. While a target's self-attestation is current, it replaces that target's readiness badge.

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

**What ships first**, in the order the owner accepted: AIUC-1 and ISO/IEC 42001 as readiness targets; NIST AI RMF and CSA STAR for
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
  `README.md` and `docs/workspace-format.md` change with it. A hand-edited list without `soc2` (`[]`, or `["iso27001"]`), which validated before, now fails
  validation naming this rule; add `soc2` back to the list.
- `framework-settings`: `framework` accepts any catalog id; `positions` is added.
- `certification`: an optional `target`.
- `framework(id)` reads any catalog; `server.ts`, the served app and `trust.ts` iterate the targets instead of naming
  ISO 27001; the gaps view gains a section per target beside SOC 2's.
- Every applicable-control call site is classified as the table says; the implementation lists the classification in
  its pull request.
- A pre-existing fault this ends: the statement of applicability reported an ISO requirement as not included, with a
  SOC 2 category as its reason, when its only controls were excluded by a SOC 2 category answer (for example
  Confidentiality for A.5.12, which maps to CONF-01). After the split those controls are applicable, so with ISO/IEC
  27001 targeted the requirement is included and addressed by them, and their policies and obligations appear as the
  program's work.
- Visible changes for an existing workspace on its next adoption: controls excluded only by a category answer are
  rewritten applicable, with their reason removed; they leave the controls list (to bring one back, answer its
  category in scope or target a framework that maps it), and the questionnaire library no longer offers them as "does
  not apply" passages. For library controls, SOC 2's deliverables are unchanged.
- Audit engagements, the system description and `audit export` are SOC 2's and are unchanged, since SOC 2 is always a
  target.
- A policy created because another target needs it (the privacy policy, for ISO/IEC 27001's A.5.34) is, once approved,
  among the policies the SOC 2 system description lists and a GOV-04 record `audit export` sends: true statements about
  the program, not a change in what SOC 2 covers.
- Changing targets never changes a control's applicability, so a person's own exclusion survives `target` and `drop`;
  they only create what became needed. A plain `adopt` re-derives applicability from the scoping answers, as before.

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
