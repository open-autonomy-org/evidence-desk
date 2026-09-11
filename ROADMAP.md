# evidence-desk roadmap

Notable present/future intentions and outstanding outcomes, carefully maintained by the Hermes PM scrum. The owner sets direction; the fleet builds by default.
Sources support decisions and claims. Ideas and unanswered requests are not commitments or dispatch orders.
See the [PM skill](hermes/skills/open-autonomy/pm/SKILL.md) for the reconciliation cycle.

## readiness-product: From a portable folder to a complete CPA/client workbench

Dispatch: hold
Decision: authorized strategy direction; landing and delivery readiness pending

Authority: the owner's [autonomous competitive-parity mandate](hermes/skills/project-communications/SKILL.md#autonomous-strategy-mandate),
committed in [PR #80](https://github.com/open-autonomy-org/evidence-desk/pull/80), authorizes strategy to
select outcomes for the best SOC2 app across CPA and client workflows. This decision uses that delegation,
not the constitution or an empty board as permission. It does not need per-feature human approval.
The constitution still excludes audit opinions, mandatory hosting and compelled evidence/AI uploads.

Product judgment: prioritize a guided, local visual readiness workflow over successive standalone CLI
reports. A client should be able to define scope, understand requested work, supply evidence, respond to
review and hand over a bounded package; a CPA should be able to review that work and repeat it across
engagements. Current main provides generic items and derived summaries, not this complete experience
([baseline README](https://github.com/open-autonomy-org/evidence-desk/blob/dbb0427/README.md)).
The hypothesis is that connected workflows provide more value to nontechnical participants than another
isolated report. This is strategic inference, not observed customer research or a measured usability result.

Primary competitive evidence reviewed 2026-09-10 (vendor statements, not independently operated products):
- [Vanta Audit](https://www.vanta.com/products/audit): automated collection, scoped sharing, evidence
  requests/statuses, contextual comments and evidence reuse across audits.
- [Drata Audit Hub](https://drata.com/product/audit-hub): framework/period setup, auditor samples and
  requests, threaded responses, point-in-time downloadable packages and agreed sample/package freezing.
- [Secureframe Auditor Partner Console](https://support.secureframe.com/hc/en-us/articles/38955364460947-Auditor-Dashboard-Guide):
  multiple client engagements, assigned auditors, customer-initiated linking/consent and unlinking.
- [Sprinto](https://sprinto.com/): scoping, control mapping, ongoing monitoring/evidence refresh, risk,
  vendor diligence, AI governance, trust center and questionnaire workflows.
- [Hyperproof](https://hyperproof.io/): common controls linked to risks, request-linked evidence,
  policy approvals, third-party risk, trust workflows and integrations.
- [Fieldguide](https://www.fieldguide.io/): CPA engagement workflows, client requests, evidence review
  and AI-assisted testing; [Thoropass](https://thoropass.com/): combined readiness, evidence management,
  auditor interaction and audit services. Their audit execution/service claims are not authority for
  Evidence Desk to issue opinions or replace professional judgment.

This discovery deliberately includes CPA practice software and broader GRC alternatives, not only the
initial automation vendors. It is not an exhaustive competitor inventory or proof of parity. Integration
breadth, permissions, accessibility, import/export fidelity, performance and real end-to-end operation
remain unverified. Refresh discovery during daily strategy; research other relevant alternatives,
including Optro/AuditBoard and open-source local/self-hosted tools, before claiming category coverage.

Sequence and tradeoffs:
1. `guided-readiness`: scoped controls and client-facing local visual workbench. Highest immediate
   coherence/value; medium-to-high uncertainty in content rights, UX and compatibility, so deliver a thin
   complete journey before a large catalog. Existing CLI remains a supported companion, not the ceiling.
2. `evidence-review-cycle`: requests, period-aware evidence and CPA feedback through a deliberate handoff.
   Depends on scope/control identity; higher integrity/sharing complexity, but necessary to close the loop.
3. `continuous-firm-readiness`: recurring readiness and multi-client practice operation, then optional
   collection and trust workflows. High breadth/integration cost; keep later choices provisional rather
   than treating a connector inventory or AI layer as the first milestone.

PM reconciliation: preserve the unlanded `evidence-reference-index` draft and its original provenance
([PM report](https://discord.com/channels/1544906154868744202/1546981849979682916/1547726195536433293)).
The constitution-only rationale does not independently authorize dispatch. Strategy authorizes association
traceability within the outcomes below, not a prerequisite standalone CLI expansion. PM should reconcile
that draft as an optional bounded component of the end-to-end workflow, without discarding its work or
claiming the old inference was owner direction. No implementation task or human assignment is made here.
The fixed `release-next` proposal, target dates, assets and human review gate below remain unchanged.

## guided-readiness: Scope a SOC2 engagement and work through it visually, locally

Dispatch: hold
Decision: authorized outcome under `readiness-product`; PM readiness/decomposition pending
Priority: first product milestone after the existing portable-workspace foundation

Outcome: a CPA or client can open/create their own folder in a local graphical workbench, record the
system boundary, chosen SOC2 categories and engagement period/type, define controls and rationale-backed
applicability, and navigate from a control to owned readiness work and supporting files. A nontechnical
client can see what to do next and record progress without editing JSON or invoking the CLI.
Why now: the baseline lacks a scoped SOC2 model and visual workflow, while Vanta, Drata and Sprinto tie
work to controls and engagements. Item completion alone must not be presented as SOC2 coverage.

Observable success:
- Operate a synthetic scope-to-control-to-task-to-evidence journey in the actual local UI, including
  owner/due-date follow-up, gaps and justified exclusions; reopen it from the same portable folder.
- Distinguish authored status, mapped coverage and unresolved work from evidence sufficiency or an audit
  opinion. Framework/version references and mapping provenance are visible; no invented official checklist.
- External file edits appear after revalidation; invalid edits/conflicts are surfaced without lost unknown
  data or evidence. CLI and UI operate the same documented files, with no opaque authoritative database.
- Core workflow works without a hosted account, network dependency or chosen AI service. Untrusted file
  content renders inertly; local access boundaries and supported platforms are explicit, not implied RBAC.

Dependencies/fit: existing file-preservation contract; an explicit compatible extension or user-chosen,
versioned migration if needed; lawful framework references and content sourcing before bundled catalogs.
Use synthetic controls and user-authored references until redistribution rights are established. Do not
copy vendor policies or licensed standards. PM defines bounded execution acceptance and actual launch
instructions; operated synthetic UX proves functionality, not customer adoption. Accessibility and
fresh-start usability belong to this experience, not a future cosmetic phase. Sources and authority:
`readiness-product`, especially Drata framework/period setup and Sprinto scoping/control mapping.

## evidence-review-cycle: Close client evidence requests with a traceable CPA handoff

Dispatch: hold
Decision: authorized outcome under `readiness-product`; depends on guided-readiness

Outcome: a firm requests evidence for a scoped control and period; a client supplies ordinary files;
a reviewer records feedback, requests a revision and closes the readiness request with a visible record
of who said what and which version was reviewed. The owner deliberately exports only selected records
and evidence for another participant to inspect and return, without giving access to the entire folder.
Why next: Vanta's contextual requests/reuse and Drata's period packages/freezing connect collection to
review; the current Markdown status report is not an evidence package or collaborative review workflow.

Observable success:
- Run a synthetic request, submission, return-for-change, replacement and closure cycle. Preserve prior
  submission provenance and discussion, distinguish contributor declarations from reviewer dispositions,
  and make shared evidence/control associations inspectable without claiming sufficiency from reuse.
- Record evidence source, collection time and relevant period; expose missing or stale information with
  explicit rules rather than infer dates from filenames. A changed file cannot silently retain a claim
  that its current bytes are the reviewed version. Hashes detect change, not identity or truth.
- Preview/export a point-in-time, documented portable package; the recipient can inspect its selected
  scope, references and evidence offline. Demonstrate omission of unrelated synthetic client information,
  missing-reference refusal and non-destructive reconciliation of returned work against intervening edits.
- Retain local solo operation. Shared folders and authored reviewer names are not authenticated identities
  or access-control enforcement. Define provenance/trust limits; no mandatory hosted portal or automatic
  synchronization. Explicit sharing cannot revoke copies already delivered.

Dependencies/fit: stable engagement/control identities, preservation-safe versioned records, selection
and disclosure review, and a bounded transport-independent exchange design. Start with deliberate file
handoff before live collaboration. This authorizes readiness review support, not audit testing conclusions,
CPA sign-off automation, a tamper-proof ledger or publication. PM owns slicing and operational verification.
Sources and authority: `readiness-product`, Vanta Audit and Drata Audit Hub.

## continuous-firm-readiness: Sustain readiness across periods and client engagements

Dispatch: hold
Decision: authorized later intention; specific implementation choices remain provisional

Outcome: a firm can deliberately register separate client folders, see scoped follow-ups without accidental
cross-client disclosure, roll readiness into a new period without silently accepting stale evidence, and
maintain linked policies, risks, vendors and recurring people/access-review obligations. Later, optional
owner-operated collectors reduce repeated evidence work, while reviewed disclosure/questionnaire outputs
reuse sourced readiness facts instead of inventing assurances.
Why later: Secureframe demonstrates the multi-client journey; Sprinto/Hyperproof expose ongoing control,
risk, policy and trust breadth. Those gaps cannot be closed by polishing the initial CLI indefinitely,
but integration automation before stable provenance would amplify unreliable records.

Success direction: operate two isolated synthetic client engagements, a new-period review preserving
history, and a recurring obligation through remediation. Subsequently demonstrate an explicitly enabled
collector with reproducible provenance, visible failures and a manual/offline fallback, and a reviewed
shareable answer linked to its sources. Collector/vendor selection and detailed acceptance require a
later sourced strategy refinement, not a speculative connector backlog.

Dependencies/constitutional boundaries: guided workflow and evidence review first; explicit storage/OS
permission model before multi-user access claims; vendor twins and synthetic API seeds for development.
Optional sync and customer-selected AI must leave portable records and non-AI core operation intact.
Hosted trust-center convenience, enforced remote permissions and autonomous evidence testing are unresolved
parity questions, not features claimed achieved. Research owner-controlled alternatives; any solution
requiring proprietary storage, compelled uploads or audit opinions stays held for owner direction.
No authorization to access customer systems, provide audit services, or expand into unrelated financial
statement audit/AI-governance products merely because a competitor sells them.

## release-next: First portable-workspace preview

Dispatch: hold
Release decision: request-review
Target version: 0.1.0-alpha.1
Target window: 2026-09-16 through 2026-09-18, America/New_York; provisional forecast
Review by: 2026-09-15, America/New_York; proposed review target, subject to reviewer availability
Candidate: 569fd47de242d20c47fccb89bb1caffdea4630a1
Scope: portable-workspace create/open/validate and item create/update CLI, format 1, reproducible source archive; no GUI, sync, hosted service or bundled executable
Readiness: ready-for-review
Readiness evidence: https://github.com/open-autonomy-org/evidence-desk/pull/38 and hermes:task/t_669122cc establish create/open/validate; https://github.com/open-autonomy-org/evidence-desk/pull/57 and hermes:task/t_23847d50 review run 10 establish bounded item editing/conflict/preservation acceptance; https://github.com/open-autonomy-org/evidence-desk/pull/59 and hermes:task/t_4116639b review run 12 establish packaging. hermes:task/t_a488f630 independent run 15 verifies this exact full candidate; PM repeated its inspected World-attached rehearsal in cron_cbe439e4782f_20260910_032143, confirming identical artifacts and complete workflow/check acceptance.
Rationale: Request review of the coherent first local folder workflow now that candidate-specific verification is complete, while retaining the existing forecast and human review lead time. The resolved filesystem prerequisite requires no product repair or isolation relaxation; this is a deliberate PM decision, not a merge/date trigger. Later planning/documentation commits accumulate independently and do not move this candidate.
Version rationale: First experimental CLI source preview under the private 0.1.0-alpha.1 SemVer policy landed in PR #59; GitHub releases/tags were empty at this reconciliation. Workspace format 1 is distinct and unchanged. No stable API, npm publication or released version is implied.

The completed `candidate-check` outcome is retired following [t_a488f630](hermes:task/t_a488f630),
independent review run 15. The original extracted failures remain failed: `/tmp` is mounted `noexec`,
and direct installed compiler launch raised EACCES. The operator authorized disposable extraction under
`/opt/data/artifact-verification` outside Git checkouts; unchanged declared checks then passed without
product/toolchain code changes, compiler substitution or runtime policy changes. Predecessor evidence is preserved.

Fixed review asset: `evidence-desk-0.1.0-alpha.1-source.tar.gz` with adjacent `.tar.gz.sha256` and
`.tar.gz.provenance.json`. SHA256: `6f5f46530a8e622f6edd374aeb3672afdc8a9bbb0375a96f21bd4f0e75e57b89`.
Independent-review evidence and assets remain under `/opt/data/artifact-verification/t_a488f630-s4__iyfw/`;
PM's fresh equivalent builds and exact command/output evidence are under
`/opt/data/artifact-verification/t_a488f630-v4zb1tye/` (`evidence.json`, `commands.json`, `a/`, `b/`).
These local paths are review evidence, not public download URLs or published assets.

Verification: reviewer repository/extracted `bun run check` exited 0 in 2.538s/1.906s;
PM's rerun exited 0 in 1.992s/0.959s. Two builds were byte-identical and matched the reviewer archive.
Full allowlist, committed file bytes, tar commit header, checksum/provenance, frozen installation and
extracted create/item-create/item-update/open/validate passed. Deterministic stale-write refusal
preserved the exact external manifest, Markdown, binary evidence, unrelated file and unknown extensions.
Only Linux aarch64, local ext4, Bun 1.3.10, Git 2.47.3 and gzip 1.13 were verified.

Completion and remaining gates:
- The fixed proposal landed in [PR #61](https://github.com/open-autonomy-org/evidence-desk/pull/61).
  Native Discord history verifies delivery of the [candidate-specific request](https://discord.com/channels/1544906154868744202/1546981849979682916/1547449011466801202)
  and [publication instructions](https://discord.com/channels/1544906154868744202/1546981849979682916/1547449012586545203)
  to the authorized owner Aaron Yuan (GitHub `yueranyuan`, ID `2255943`; Discord ID `605505624226136074`).
  Await the original human response in that conversation; no approval or accepted deadline is recorded.
  Continued development is not candidate-specific approval and does not supersede this request.
- The human reviews scope, full SHA, exact assets, verification and limitations; approves, rejects or
  redirects this concrete proposal. Follow [human-only publication](CONTRIBUTING.md#human-only-publication)
  and the [local-application procedure](.open-autonomy/PRODUCTION.md#packages-and-local-applications).
  After approval, only a human creates `v0.1.0-alpha.1` at the fixed SHA, marks the GitHub Release a
  prerelease, and uploads the reviewed archive and both sidecars. Verify required GitHub permissions/gates
  at that step: the fleet valve denies ruleset/collaborator-permission reads, so this scrum cannot attest
  to their current effective state. No service deployment or new publishing credentials are needed.
- PM verifies the actual release record and downloaded version/provenance/checksum before moving
  product changes out of Unreleased. A changed candidate, version or artifact needs renewed review.

Risks and review notes: executable installation/extraction filesystem required; fleet `/tmp` remains
unsuitable for the declared compiler check. The candidate's bundled docs predate the explicit executable-
filesystem clarification now in main; provide that clarification in release notes, not by silently changing
reviewed bytes. Registry/cache access and a separately installed Bun are needed. macOS, Windows,
network/cloud filesystems are unverified. Existing-file association only, cooperating locks (not arbitrary-
writer atomic compare-and-swap), quiescent reference topology, numeric/manifest-alias refusals and manual
crash recovery remain limitations. Reviewer availability and publication permissions remain dependencies;
unresolved gates move the forecast rather than waive review. No human implementation commitment is assumed.
Optional cloud sync and customer AI integration remain future choices, not dependencies of core use.
