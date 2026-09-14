# ADR 0003: Authored request history and deliberate selected folder exchange

Status: Proposed; requires independent review of the actual feature diff and manual observations.

## Authority and context

[ROADMAP evidence-review-cycle](../../ROADMAP.md#evidence-review-cycle-close-client-evidence-requests-with-a-traceable-cpa-handoff)
is the whole outcome authorized by strategy PR84 and sequenced by PM PR107 after guided-readiness
acceptance. Owner [issue101](https://github.com/open-autonomy-org/evidence-desk/issues/101) requires
whole-outcome execution, not feature slices. The competitive workflow sources and delegated authority
are recorded in that roadmap. This is readiness support, not audit conclusions or authenticated approval.
[ADR0002](0002-explicit-local-readiness.md) supplies explicit per-launch selection, local UI and one-file
source writes. Its acceptance does not imply acceptance of this exchange design.

## Decision

Explicitly upgrade the selected readiness sidecar from v1 to v2 only after the user's confirmation.
Refuse if v1 already has an unknown requests field; preserve other unknown values. Do not infer activation
from filenames or migrate on read. Ordinary format-1 operation remains separate; v1 can still be opened
and edited without requests. Older readiness tools refuse v2. Backup and recovery remain owner decisions.

V2 adds requests tied to stable existing control IDs and an explicit requested period. Append authored
submission, discussion and reviewer-disposition events. Submission versions name ordinary paths, SHA256
of observed bytes and declared source, collection instant and period. Replacement appends rather than
rewriting previous declarations. The UI and report compare bytes afresh when loaded; old closure remains
history but never establishes a current-version claim after a mismatch or missing file. Hashes and
names do not prove identity, accuracy, sufficiency or immutability. External edits remain supported and
can rewrite history; this is not a ledger. Prefer new paths for replacements to retain old bytes.

Export deliberately selected requests, their linked controls/items, engagement metadata and the entire
referenced ordinary files into a new external folder. Use known-field projection to omit unrelated
records and unknown extensions, not a copy of the whole source. Preview the exact records, file inventory,
byte hashes and disclosure warnings first. A digest binds export to that preview; changed selection or
bytes require renewed preview. No archive extraction, executable preview, upload or network transport is
introduced. The package is inspectable offline as JSON/text/files and openable by the same local UI.

A documented exchange.json baseline supports an explicit return preview. Accept only new event suffixes
for existing exported requests whose known origin request/control/item records still match the baseline.
Refuse rewrites and overlapping intervening edits; retain both copies for deliberate resolution. Preserve
unrelated local edits and unknown local extensions. Copy new-event evidence under a new unique local
return directory and append history in a single readiness-source write under the existing dual-source
locks/revision checks. Remap copied file paths and retain authored transfer times/original paths across
further exports. Never overwrite existing evidence, import scope edits or automatically synchronize.

## Alternatives and tradeoffs

- Hosted portal/remote collaboration: conflicts with local core independence and introduces unauthorized
  customer integration/permission scope. Deliberate transport-independent copies are sufficient here.
- Whole-folder copy: exposes unrelated engagements, extension records and evidence without bounded
  selection. Known-field projection plus full-file disclosure preview makes the boundary inspectable.
- Automatic three-way text merge or last-writer-wins: cannot safely infer intent or evidence equivalence.
  Conservative conflict refusal is less convenient but preserves owner work and provenance.
- Embedded base64 evidence/database: harder direct file inspection and storage lock-in. Ordinary files
  preserve customer tools and make the exchanged result useful without this application.
- Immutable evidence vault: not needed for authored version observations and would imply stronger
  integrity than owner-editable files provide. Historical bytes require retaining their ordinary files.
- Request keys silently added to v1: would acquire unknown data and change the persisted interpretation.
  An explicit, incompatible v2 upgrade keeps that change visible.

## Consequences, limits and constitutional review

Constitution invariants “The workspace belongs to its owner”, “The files are the data”, “External editing
is a supported workflow” and “Storage and synchronization are the owner's choice” constrain the format,
selection, external-editor conflicts and deliberate copies. No account, proprietary store, subscription,
AI upload, sync service, customer credentials or audit opinion is added. Authored reviewer labels do not
establish roles or permissions. Shared copies cannot be revoked. Package contents must be inspected as
untrusted files, never executed. Unknown data is retained locally but intentionally not disclosed.

The existing filesystem limitations remain: cooperating locks, not arbitrary-writer CAS; quiescent
reference topology; no power-loss or multi-file transaction guarantee. Failed export can leave a partial
new folder; failed import can leave new orphan evidence copies. Errors identify the folder, and existing
files are not cleaned up or overwritten. Inspect both sources after any post-commit error before retrying.
Baseline/token integrity is change detection, not sender authentication or resistance to forged local
history. Returned scope/item changes are not accepted. A new baseline is required for another exchange
after a successful import. Evidence collection is bounded to 64 MiB per selection; larger packages must
be narrowed. This does not claim broad performance, accessibility or cross-platform acceptance.

“Private evidence stays outside public development”, “Done is demonstrated” and “No automated tests”
require disposable synthetic World operation and recorded actual observations, with no test code or
permanent harness. Independent review must assess every observable roadmap criterion, projection and
path safety, preservation, conflict semantics and these limits against the actual diff. Source archive
allowlisting includes the new product modules/docs; that does not select a release. The fixed alpha.1
candidate and human release gate remain unchanged.
