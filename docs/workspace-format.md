# Evidence Desk workspace format, version 1

This is the portable file contract for the local CLI. Files are the source of truth; there is no
index, database, hosted account or AI dependency. Use UTF-8 JSON and Markdown. Supporting evidence
can be any ordinary file; validation checks references, not evidence contents or audit sufficiency.

## Layout and records

`workspace.json` is required at the workspace root. Creation writes only this file, containing
`{"formatVersion": 1, "items": []}`. Add records and files with your own editor. For example:

```text
workspace.json
context/access-review.md
evidence/access-review.csv
```

```json
{
  "formatVersion": 1,
  "items": [
    {
      "id": "ACCESS-01",
      "owner": "Synthetic Example Owner",
      "status": "in-progress",
      "context": "context/access-review.md",
      "evidence": ["evidence/access-review.csv"],
      "customNotes": { "source": "externally authored synthetic fixture" }
    }
  ],
  "customWorkspaceData": { "team": "Synthetic Example Firm" }
}
```

`context/access-review.md` is an ordinary Markdown file, for example:

```markdown
# Access review
Waiting for the synthetic reviewer to record follow-up actions.
```

Every item requires these fields:

| Field | Contract |
| --- | --- |
| `id` | Nonblank string, unique within the workspace (case-sensitive). |
| `owner` | String; an empty/whitespace-only string means unassigned and produces a warning. |
| `status` | `todo`, `in-progress`, `blocked`, or `complete`. All except `complete` count as incomplete. |
| `context` | Workspace-relative path to an existing regular UTF-8 Markdown `.md` file. Empty contents produce a warning. |
| `evidence` | Array of workspace-relative paths to existing regular files. An empty array produces a warning. |

The top level must be an object with numeric `formatVersion: 1` and an `items` array. Other versions,
missing required fields, wrong types, duplicate IDs and unknown statuses fail validation. Unknown
fields at the workspace and item levels are allowed. Unreferenced files are allowed and not scanned.
JSON uses the runtime's standard parser; avoid duplicate object keys (the last occurrence is read).

## Paths and preservation

References start at the workspace root, even when the record's context lives in a subdirectory.
Use `/` separators; absolute paths, `.`/`..` components, empty components, backslashes, colons and
control characters are rejected. URLs and Windows drive/UNC paths are not references. Symlinks within
the workspace are allowed only when every traversed component resolves inside its canonical root;
escaping and dangling links fail. References must end at regular files, not directories or devices.
The workspace root itself may be opened through a symlink; creation refuses a symlink destination.
Symlink portability depends on the destination filesystem.

Open/inspect and validate never write files, normalize records, repair data or cache results. Each
invocation rereads disk, so external edits are immediately visible. Unknown fields, unrelated files,
Markdown and evidence bytes remain untouched. Evidence is not opened or interpreted. Filesystem access
time may change on reads. Read-only inspection assumes a quiescent local folder: concurrent edits or hostile
symlink replacement during a command are not isolated by a snapshot or locking protocol.

Creation requires a new destination whose parent exists, or an existing empty directory (including
no hidden entries). It refuses occupied destinations before writing. The manifest uses exclusive
creation, preventing replacement of an existing manifest. An I/O failure can leave a new directory or
partial manifest; inspect it before retrying. No migration, synchronization or automatic conflict merging
is included.

## Item writes and concurrency

`workspace item-create <folder> --stdin` reads one JSON object with all five required item fields.
`workspace item-update <folder> <existing-id> --stdin` reads a nonempty partial object of those same
fields. A supplied ID renames the item; a supplied evidence array replaces the entire array. Other input
keys are errors, not extensions to the patch API. Omitted fields and existing unknown root/item fields
are retained as JSON values, as are untouched items. The manifest is reserialized with two-space
indentation and a trailing newline: whitespace, numeric spelling and duplicate-key spelling are not
preserved. Version 1 and its existing validation rules are unchanged. An invalid existing workspace
must be corrected externally before item writes; commands do not silently repair it.

Write-only preservation restrictions do not change read-only version 1 validation. Before editing,
the writer checks every JSON number token, including nested unknown root/item data and untouched
items. It refuses if parsing and reserialization would change its exact decimal value (for example
`1e400`, `9007199254740993`, underflow or excess fractional precision), or erase negative zero.
Equivalent numeric spelling such as `1.00e2` may become `100`. No numeric value is silently rounded
or converted to null: use an external precision-preserving editor, or explicitly choose a string
representation for extension data before retrying. This is a decimal round-trip check, not an
arbitrary-precision arithmetic API.

Context and evidence must already exist and pass the shared validator. Item operations never author,
truncate, delete or overwrite Markdown/evidence files, even when changing a context association to an
existing path shared by another item. Author Markdown with your own editor before the command. Missing
new context refuses the manifest update, so ordinary failures cannot leave a reference to context the
CLI failed to create. Unrelated files remain untouched except the transient protocol files below.
Writes refuse if any existing or proposed context/evidence reference resolves to `workspace.json`,
including internal symlink aliases and references on untouched items. Otherwise replacing the manifest
would also replace referenced evidence/context bytes. Read-only commands still accept these references;
use an external editor to associate an independent file before retrying. Even a patch removing the
offending reference is refused when the existing manifest has one. Hard-linked manifests are refused
as described below.

The writer exclusively creates `.evidence-desk-write.lock` at the canonical workspace root, reads and
validates `workspace.json`, prints `Ready` to stderr, then reads JSON on stdin through EOF. Hold this
session open while composing the edit for a defined read/edit/write boundary. Another CLI writer fails
immediately while the lock exists; cooperating external writers must acquire this same directory
exclusively before reading, hold it throughout editing/writing, and remove it only when finished.
Read-only commands do not acquire this lock. Do not remove a live writer's lock.

After validating the proposed manifest, the CLI exclusively creates a random
`.evidence-desk-write-<uuid>.tmp` in the root, writes and fsyncs it, then compares the manifest's exact
bytes, device/inode and modification/change timestamps with the original read. A detected change,
replacement, deletion or unreadability refuses the write with `Conflict` and a reread/retry instruction.
On success the temporary file is renamed over the manifest. Writes require a regular non-symlink,
single-link manifest; inspection still supports the version 1 internal-symlink contract. Permission bits
are retained, but inode, ownership and extended metadata are not guaranteed to survive replacement.

This serializes cooperating local writers, NOT arbitrary writers: the final comparison and rename are
separate operations, not atomic compare-and-swap. A noncooperating writer can race after the comparison;
hostile path/symlink swaps are not isolated. Keep reference files and directory topology quiescent during
writes. Context/evidence bytes are not snapshotted or conflict-protected, and a noncooperating deletion
can invalidate references after validation. Network/cloud filesystem lock and rename semantics are not
guaranteed. No general concurrent-writer safety, reference snapshot or automatic merging is claimed.

To reproduce a conflict, run item-update interactively, wait for `Ready`, then in another terminal edit
`workspace.json` (for example change the owner's string). Back in the first terminal send
`{"status":"complete"}` and EOF. It exits 1 with `Conflict`; reopen to see the external owner's change
and the old status. A precomposed patch piped later is a new read, not a retry token from this session.

Malformed input, duplicates, invalid references and I/O errors exit 1. Before rename, refusal leaves the
existing manifest intact; ordinary unwinding removes this invocation's temporary file and lock. A cleanup
failure is reported and may leave them behind. Errors after rename (including lock cleanup failure)
can mean the update committed: reopen before retrying. EOF with incomplete JSON refuses the update.
An interrupt/kill or machine crash can leave a lock and temporary file: stop writers, inspect the manifest
and leftovers, then manually remove only abandoned protocol files. Never automatically restore an old
manifest over external changes. The temporary file is fsynced but the containing directory is not; no
power-loss durability guarantee is made. Rename provides whole-manifest visibility on a supporting local
filesystem, not a multi-file transaction. No evidence or context rollback is performed.

## Derived summary report

`workspace summary <folder>` and `workspace summary <folder> --json` reuse the same format 1
validator as inspection. They reread disk every invocation and never write reports, locks, caches,
manifest changes or other workspace files. Unknown fields and all file bytes are preserved on success
and refusal. As with inspection, access times may change; a quiescent folder is required, with no
snapshot guarantee against concurrent external edits or symlink replacement.

Without selectors, JSON stdout is exactly one object with these fields, in this order:

- `reportSchemaVersion: 1`: the derived report schema, independent of product and workspace versions.
- `ok`: boolean validation success. Warnings and incomplete statuses alone succeed (exit 0).
- `counts`: on success, `{total, statuses: {todo, "in-progress", blocked, complete}, incomplete,
  unassignedOwner, noEvidenceReferences}`; every value is an integer count of items.
- `items`: on success, every item in manifest array order, including complete items without warnings.
  Each object has `{id, owner, status, context, evidence, warnings}`. Strings/paths are retained exactly;
  evidence array order is retained. Markdown bodies, evidence contents and unknown fields are omitted.
- `errors`: empty on success. On any usage, filesystem or validation failure it contains diagnostic
  strings, `ok` is false, `counts` is null and `items` is empty (exit 1). No partial totals are reported.
  Validation diagnostics retain validator traversal order and identify item indices/fields where applicable.
  JSON errors also go only to stdout, with no mixed console prose.

`incomplete` counts every status other than `complete`. `unassignedOwner` counts empty or whitespace-only
owners. `noEvidenceReferences` counts empty evidence arrays, not missing files (missing references fail).
These three counts overlap: one item may contribute to all three, regardless of status. The four status
counts partition total. An empty workspace succeeds with all counts zero and empty items/errors arrays.
Per-item warnings appear in fixed order: unassigned owner, empty/whitespace-only Markdown context,
no evidence references. Complete items are not exempt. Warnings describe follow-up facts, not sufficiency.

Human output uses the same report: total, the four statuses in the order above, incomplete, unassigned
owner and no-evidence-reference counts, then every item's facts/warnings in manifest order. Owner-authored
strings and evidence arrays are JSON-quoted to keep embedded control characters from forging lines.
Failure prints diagnostics and no totals. There are no timestamps or generated IDs; unchanged inputs
produce deterministic reports on the same filesystem/runtime. Neither view interprets evidence,
computes a readiness score, establishes SOC2 coverage nor issues an audit judgment. `complete` remains
the owner's self-reported status. Exact commands are in [README](../README.md#read-only-readiness-summary-development-source).

### Selection and derived report schema 2

Optional `--owner <exact-string>`, `--status <status>` and `--needs-follow-up` selectors intersect.
Owner matching is exact and case-sensitive, including empty, whitespace and control-character strings;
no trimming or normalization occurs. Status must be one of the four format 1 statuses. Follow-up means
status other than `complete` OR at least one of the existing warnings above. Incomplete items without
warnings are included; complete items without warnings are excluded. This does not assess evidence.

Each flag (including `--json` and `--markdown`) may appear only once, in any order after the folder. Missing values,
unknown options, extra positional arguments and unsupported statuses exit 1 with repair instructions.
A separate value beginning with `--` is treated as a missing value; use `--owner=<exact-string>` to
represent such owners (also accepted for any other owner, including empty). Both owner spellings count
as the same flag for repeat detection. No other equals-form is supported. Qualify a folder beginning
with `--` as `./--name`. Shell quoting is necessary to preserve spaces, empty strings and controls;
OS argument strings cannot contain NUL.

A successfully parsed invocation with any selector uses schema 2, even if it matches all or no items.
Its fields in order are `reportSchemaVersion: 2`, `ok`, `selection`, `workspaceCounts`, `counts`, `items`,
`errors`. `selection` contains only applied keys in fixed order: `owner` (exact string), `status` (exact
status), `needsFollowUp: true`. Absent owner is omitted, not `""` or null. `workspaceCounts` has the schema 1
count shape over all items; `counts` has that same shape over selected items. `items` has the unchanged
schema 1 item shape, in manifest order, restricted to the intersection. Zero matches succeeds with zero
selected counts and empty items. Human output prints JSON-quoted `Selection`, `Whole workspace counts`,
then `Selected counts`, followed by only the selected facts, using the schema 1 count/item rendering.

Validation always precedes selection, across every record and reference. On filesystem/validation
failure schema 2 retains the parsed `selection`, sets both count scopes to null and items to `[]`;
errors contain diagnostics and exit is 1. No partial data is emitted. Usage failures always use schema 1
(no partially parsed selectors), independent of option order. For summary usage errors, a literal
`--json` argument anywhere after `workspace summary` requests the single JSON failure object on stdout;
otherwise diagnostics go to stderr. Successfully parsed invocations use the actual `--json` flag.
Unfiltered success and validation failure remain schema 1. Selection changes no persisted format,
warnings, bytes, files or the read-only/quiescent-folder and platform limitations above.

### Standalone Markdown view

`workspace summary <folder> --markdown` renders the same fully validated facts and accepts the same
selectors. It changes neither format 1 nor JSON schemas 1/2. A deterministic standalone document on
stdout labels itself a derived read-only report. It shows applied selectors (or none), whole-workspace
counts, then selected counts only when filtered, and selected item facts in manifest order. Evidence
paths retain array order. Empty workspaces and zero matches succeed with explicit no-items text.
Fixed warning meanings and concise limitations accompany every document. No timestamp, absolute
workspace location, unknown fields, Markdown body or evidence contents are emitted in a successful
document. This is not a readiness score, sufficiency judgment, audit claim, import format or live snapshot.

Every authored ID, owner and path (including selector owners) is represented as an ASCII-only JSON
string inside a single-backtick code span. Start with JSON string quoting; escape every remaining
character except ASCII letters, digits, space, `/`, `.`, `_`, `-`, double quote and backslash as a
lowercase four-hex-digit `\uXXXX` UTF-16 code unit. JSON's existing quote/backslash/control escapes
are retained. Non-BMP characters use surrogate pairs; lone surrogates remain distinguishable.
There is no Unicode normalization. For example empty owner is `""`, two spaces is `"  "`, a pipe is
`"\u007c"`, a backtick is `"\u0060"`, and an actual line feed is `"\n"`, distinct from literal
backslash-n `"\\n"`. Quotes bound the spaces, preventing Markdown code-span edge-space trimming.
Decoding the code span as a JSON string recovers the exact string; this representation is not a new
workspace import interface. No authored backtick, raw HTML delimiter, pipe, newline, control or
non-ASCII character can break the span or forge document structure, links, images or rows. This
assumes ordinary Markdown code-span semantics; do not decode escapes then reinterpret them as markup.

`--json` and `--markdown` are mutually exclusive. Option parsing reports the first left-to-right
unknown/repeated/missing/unsupported option error, then checks mixed formats after parsing. Usage
errors retain the existing precedence: any literal `--json` argument after `workspace summary`
selects a schema 1 JSON failure on stdout, even alongside `--markdown`, independent of order; no
partially parsed selectors are emitted. Without that literal token, errors use stderr and stdout is
empty. Valid Markdown invocations that fail filesystem or full-workspace validation emit only stderr,
never a partial or successful-looking document. Successfully parsed invocations use actual flags, so
an owner supplied as `--owner=--json` does not select JSON. Existing human and JSON views are unchanged.

Each invocation rereads external edits and writes nothing in the workspace, on success or refusal.
Optional shell redirection is the caller's operation, not a file-writing CLI option. Use a new file
outside the workspace and check exit status: the shell may create/truncate a destination even when
validation fails. See README for exact commands. Access times may change on reads; all existing
quiescent-folder, symlink and platform limitations apply (Linux aarch64/local ext4 verified; macOS,
Windows and network/cloud filesystem behavior unverified).

## Inspection and validation

Open and inspect are aliases: they print structurally valid items, owner, status, Markdown context,
evidence references and an incomplete count. Items with missing/unsafe references still display with
validation errors. Malformed item records are reported and omitted from the displayed count; an invalid
top-level manifest prevents inspection. Validate performs the same checks without printing item bodies.
Errors name the file, item array index and reference field where applicable, with a cause and repair hint.

All commands exit `0` on success and `1` for usage, filesystem or validation errors. Warnings and
incomplete statuses alone do not fail validation. `complete` is an owner-authored status, not an audit
judgment; even a complete item may have warnings. See [README](../README.md#development-source-walkthrough) for
exact runnable commands.
