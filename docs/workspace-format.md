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
time may change on reads. This first slice assumes a quiescent local folder: concurrent edits or hostile
symlink replacement during a command are not isolated by a snapshot or locking protocol.

Creation requires a new destination whose parent exists, or an existing empty directory (including
no hidden entries). It refuses occupied destinations before writing. The manifest uses exclusive
creation, preventing replacement of an existing manifest. An I/O failure can leave a new directory or
partial manifest; inspect it before retrying. No overwrite, migration, item editing, synchronization
or conflict-resolution operations are included.

## Inspection and validation

Open and inspect are aliases: they print structurally valid items, owner, status, Markdown context,
evidence references and an incomplete count. Items with missing/unsafe references still display with
validation errors. Malformed item records are reported and omitted from the displayed count; an invalid
top-level manifest prevents inspection. Validate performs the same checks without printing item bodies.
Errors name the file, item array index and reference field where applicable, with a cause and repair hint.

All commands exit `0` on success and `1` for usage, filesystem or validation errors. Warnings and
incomplete statuses alone do not fail validation. `complete` is an owner-authored status, not an audit
judgment; even a complete item may have warnings. See [README](../README.md#local-verification) for
exact runnable commands.
