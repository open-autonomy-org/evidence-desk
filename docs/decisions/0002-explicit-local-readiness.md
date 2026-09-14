# ADR 0002: Explicit readiness sidecar and loopback workbench

Status: Accepted with [PR #105](https://github.com/open-autonomy-org/evidence-desk/pull/105), following
[independent exact-head review](https://github.com/open-autonomy-org/evidence-desk/pull/105#pullrequestreview-5192776521)
of `ee67878dc953590b26a02b40a02068a0ae2767d5` and observed merge
`1175015970ea73a4cbcc04d90b00a273d900e724` (native task t_8c1c52e4, review run 13).
This does not adopt or supersede PR88's proposed runtime ADR0001.

## Authority and context

[ROADMAP guided-readiness](../../ROADMAP.md#guided-readiness-scope-a-soc2-engagement-and-work-through-it-visually-locally)
and verified owner [issue101](https://github.com/open-autonomy-org/evidence-desk/issues/101) authorize
one complete local scope/control/item/evidence workflow. The outcome explicitly requires format-1
compatibility, per-invocation selection, one-file writes, local browser operation and no official catalog.
Existing `workspace.ts`, `item-write.ts`, `write-json.ts` and `docs/workspace-format.md` define the
accepted manifest, reference validation, cooperating lock, decimal-preservation and quiescent-topology
constraints. Those sources, not speculative competitor implementation details, ground this design.

## Decision

Keep the format-1 CLI and its owned fields unchanged. Add a separate readiness CLI which requires an
explicit create-new or open-existing path on every invocation/launch. Store engagement, controls and
item due dates in an independently versioned JSON file. No reserved filename, manifest key, scan or
activation registry selects it. Open-existing is a user decision, not an ownership or provenance claim.
The optional sidecar contract and command forms are in the existing format document and README.

Selected validation covers both complete files and referenced paths. A snapshot revision includes both
sources' bytes and filesystem identity/timestamps. Both writers use the existing workspace lock; selected
writers additionally acquire a lock beside the sidecar. Manifest item edits and sidecar edits are distinct
actions, never a two-file transaction. A rename that would dangle selected associations is refused.
Unknown values survive edits; precision-loss numbers and source aliases are refused before writes.

Use Node's HTTP server API on Bun, bound explicitly to 127.0.0.1 with an OS-selected port. Serve fixed
bundled HTML/JS/CSS only, not workspace files. A fresh random session capability in the launch URL
fragment authorizes API requests; exact Host and Origin checks and a custom request header prevent
cross-site mutation. The fragment is not sent in HTTP requests and is not an activation registry.
Authored text is inserted using textContent/value; restrictive CSP and no external assets keep core
work local. Existing Bun/Node dependencies suffice; no UI framework, server package or CDN is added.

## Alternatives considered

- Manifest root extension: would acquire unknown format-1 fields and violate explicit non-activation.
- Automatically discovered fixed sidecar: filename/shape is not consent or provenance. Rejected.
- Database/native desktop shell: extra authoritative storage or packaging complexity without benefit
  to this outcome. A native shell could be reconsidered for later supported-platform outcomes.
- Hosted portal or framework/CDN app: account/network dependency conflicts with local core operation.
- Two-file auto-repair/migration: would misrepresent atomicity and risk owner data; explicit correction
  and one-file actions preserve the existing concurrency contract.
- Storing due dates in unknown item fields: would reinterpret legacy data. Sidecar followUps owns only
  explicitly selected records instead.

## Consequences and constitutional review

Workspace ownership, documented portable data and external edits remain intact (Constitution invariants
1–3). No customer integration, AI, hosting or sync is required (invariants 4–5). All verification uses
synthetic disposable World folders and actual manual UI/CLI operation; no automated tests or harness
(invariants “Done is demonstrated” and “No automated tests”). Outputs distinguish authored progress from
evidence sufficiency and never issue an audit opinion (Out of scope).

Limits: no OS-user authentication/RBAC, network-filesystem concurrency guarantee, hostile local-process
isolation, arbitrary-writer compare-and-swap or two-file crash rollback. Local processes able to read the
launch URL or workspace already inhabit the trust boundary. Keep reference topology quiescent and
follow manual interrupted-write recovery. Date edits and item edits use separate Saves; the UI explains
this rather than silently committing two files. No context/evidence contents are served.

Independent review must compare the actual diff and manual observations to these claims and every
roadmap acceptance line before accepting. Fixed alpha.1 candidate/assets/window and human release
review are unchanged; this ADR and feature are unreleased development, not operational deployment.
