# ADR 0002: Frameworks are targets the owner selects

Status: Proposed. Accepted only upon independent review against the constitution and merge of this record and its
implementation.

## Context and sources

A workspace holds one control set, adopted from `catalog/controls.json` (59 controls, each carrying the SOC 2 criteria
it meets) and filtered by the scoping answers: a control a category out of scope does not need is written with
`applicable: false` and an `exclusion_reason`, and every part of the program (gaps, checks, collectors, the audit
packet, the trust center; about forty call sites) acts only on applicable controls. Other frameworks map onto that set:
`catalog/frameworks/iso27001.json` lists ISO/IEC 27001's requirements, each naming the controls that address it, and
`frameworks <dir> enable iso27001` adds it to `evidence-desk.json`'s `frameworks`. SOC 2 is the default entry, cannot
be removed, and is structurally different: its mapping lives inside each control. There is no way to drop a framework,
and the web view names ISO 27001 directly (`server.ts`).

The trust center and the Open Autonomy statement show, per listed framework, readiness until a document is held
(`certifications/`), a document's claim once it is. Self-attestations are recorded the same way but nothing helps
produce one.

Source of authorization: the owner's coding conversation, September 24, 2026: "list all the ones we want to support
because some 'readiness' and some 'self-attested' are good as a mix"; on which Open Autonomy actually helps with, the
AI frameworks first; "we should be able to select which ones we want to target so we don't HAVE to do all of them
together"; "let's think about it properly". The conversation has no public permalink; these quotations record scope,
not independent approval. The owner's earlier ruling in the same conversation stands: "compliant or certified requires
the doc"; "for self-attestations, we can make those". Everything below past those words (the file shapes, the command
names, the attestation rule, the catalog content rule) is this author's extrapolation.

## Decision

**A framework is a target.** `evidence-desk.json`'s `frameworks` lists the owner's targets, any of them, SOC 2
included. Nothing about a framework not targeted is counted, shown, checked or reminded.

- `frameworks <dir>` lists the targets, each with what it can become and its readiness; `frameworks <dir> available`
  lists every framework Evidence Desk maps.
- `frameworks <dir> target <id>` adds one; `frameworks <dir> drop <id>` removes one. A workspace with no target
  refuses the last drop: a program with nothing to aim at is not a program.
- Both are acts on the files: each re-runs adoption, so the change is the controls' own files, inspectable in Git.

**One control set serves every target.** A control is adopted as applicable when the scoping answers do not exclude
it *and* at least one target maps a requirement to it. A control no target needs is written `applicable: false` with
the reason naming why ("No selected framework needs this control; SOC 2 was dropped on 2026-09-24"), the mechanism
scoping already uses, so every call site that acts on applicable controls needs no change. Dropping a target deletes
nothing: evidence, records and history stay on the controls, and targeting it again later makes them applicable again
with everything they already hold. A control a person excluded by hand with a reason of their own is left as they set
it; today adoption re-derives every catalog control's applicability and would undo that exclusion, which this change
ends. The scoping rule itself is SOC 2's (a control is in scope when one of its criteria's categories is), so it
applies to controls that carry SOC 2 criteria; a control meeting no SOC 2 criterion (the AI family) is excluded by
scoping only through its own scoping conditions.

**Every framework has the same shape.** `catalog/frameworks/<id>.json`: `id`, `title`, `version`, `outcome`, `issuer`,
`source` and `requirements`, each requirement an `id`, a `group`, a short `title` and the `controls` that address it.
SOC 2 becomes one of them, generated from `criteria.json` and the controls' own `criteria` when read, so its mapping
keeps one home. `outcome` says what the framework can become:

| outcome | badge with the document | the document |
|---|---|---|
| `audit report` | green, audited by the firm | an independent auditor's report (SOC 2) |
| `certificate` | green, certified until its date | a certifying body's certificate (ISO/IEC 27001, ISO/IEC 42001, AIUC-1) |
| `self-attestation` | blue, self-attested or self-assessed | the organization's own signed attestation (CSA STAR Level 1, CSA STAR for AI Level 1, NIST AI RMF, NIST CSF 2.0) |

Until its document is held, every target shows readiness: requirements ready of those in scope, and the steps still
open (the requirements not ready, each with its next act). Publicly the steps stay counts unless `trust.json` opts in,
because a list of controls not yet ready discloses security gaps.

**A self-attestation is made here, and only when it is true.** `frameworks <dir> attest <id> --by <person>` is refused
while any requirement of the target is unaddressed or not ready without a stated position; a person on the roster
signs; Evidence Desk renders the attestation (each requirement, its position, the controls and the evidence behind it)
as a Markdown document and records it in `certifications/` as a `self-attestation`, hashed like any other document.
Where a scheme has its own form (CSA's questionnaires for the STAR Registry), the same answers fill that form; filing it
with the scheme is the organization's own act outside Evidence Desk. A self-attestation lapses a year after it is made,
as the badges already say.

**Catalog content is ours.** A catalog reproduces identifiers and short titles written for Evidence Desk, never a
standard's requirement text, except where the text is in the public domain (NIST's). Each catalog names its source,
version and where to read the standard itself.

**What ships first**, in the owner's order: AIUC-1 and ISO/IEC 42001 as readiness targets; NIST AI RMF and CSA STAR for
AI Level 1 as self-attestations; then CSA STAR Level 1 and NIST CSF 2.0 on the SOC 2 mapping; then the conditional
set (ISO/IEC 27701, HITRUST, PCI DSS, the EU-U.S. Data Privacy Framework, an accessibility conformance report, HIPAA),
each only when targeted. The AI frameworks need controls the SOC 2 set lacks (an AI policy, an AI system inventory,
AI risk and impact assessment, human oversight of agents, agent activity records, model evaluation and adversarial
testing); they join `catalog/controls.json` as their own family, meeting no SOC 2 criterion, applicable only while a
target needs them.

## Alternatives and tradeoffs

- **A separate "targeted" state on each control**, leaving `applicable` to scoping alone. Cleaner in meaning, but it
  is a new state on the kernel object that every one of the forty call sites must learn, and it changes behaviour
  automatically rather than through an act on the files. Rejected: the owner's act writes the reason, the files carry
  it, and nothing downstream changes.
- **Separate control sets per framework.** Rejected: the same evidence would be collected and reviewed once per
  framework, the cost the owner asked to avoid, and competitors' common-control model is what customers expect.
- **Keep SOC 2 mandatory.** Rejected by the owner's word: a company may aim at AIUC-1 and ISO/IEC 42001 alone.
- **Self-attest by uploading any document**, as today. Kept for a document made elsewhere, but not the only door: an
  attestation Evidence Desk renders from its own records can be refused while untrue, which an upload cannot.
- **Reproduce the standards' text** so the catalog reads as the standard. Rejected: ISO, AIUC and CSA text is
  licensed; the identifiers and the mapping are what the program needs.

## Consequences

- `evidence-desk.json`'s `frameworks` keeps its shape; a workspace listing `['soc2']` or `['soc2', 'iso27001']` reads as
  before. `enable` becomes `target`, the old verb removed rather than aliased.
- `framework(id)` reads any catalog, SOC 2's generated; `server.ts` and `trust.ts` iterate the targets instead of
  naming ISO 27001; the gaps view gains one section per target.
- `adopt` takes the targets into account; `target` and `drop` call it.
- The audit packet (`audit export`) is SOC 2's and refuses while SOC 2 is not a target.
- New files: one catalog per framework, the AI control family, and `certifications/` attestations rendered by `attest`.
- Evidence for the AI family comes largely from Open Autonomy: its declarations, already imported, and its platform's
  records (sessions, metered calls, the owner's pause, roadmap revisions), which a collector reads through the
  platform's read doors on the project's own key. That collector follows the GitHub and Cloudflare collectors and is
  not an architectural change.

## Constitution review

- *The constitution's opening names Evidence Desk the alternative to SOC 2 compliance SaaS, for companies pursuing
  SOC 2.* That remains the product's lead and its default target. The invariants bind files, ownership, editing,
  storage, private evidence, planning, releases, accountability and demonstration, and none limits which frameworks a
  program aims at; ISO/IEC 27001 was added under the same parity mandate. A workspace aimed at AIUC-1 alone is a use
  the owner directed on 2026-09-24. Whether the opening sentence should say more is the owner's to change; this record
  does not need it changed.
- *The files are the data.* Preserved: targets are a list in `evidence-desk.json`, adoption writes each control's file,
  catalogs are documented JSON, an attestation is a Markdown document with its hash.
- *External editing is a supported workflow.* Preserved: a person may edit `frameworks` by hand; the next adoption
  reconciles the controls and reports what it changed.
- *Private evidence stays outside public development.* Preserved: catalogs are public content; attestations are
  rendered in the owner's workspace.
- *Done is demonstrated.* Each target, drop and attestation is verified by operating the application in its world on a
  synthetic workspace.
- *Out of scope: issuing audit opinions or replacing the CPA's judgment.* Preserved: a self-attestation is the
  organization's own, labelled as such; green needs an auditor's or certifying body's document.

This record cannot amend the constitution and does not need to.
