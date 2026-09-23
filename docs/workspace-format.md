# Evidence Desk workspace format

A workspace is a folder that holds one organization's SOC 2 program. Its files are the data: there is no database,
index or account. Every structured file has a JSON Schema in [`schemas/`](../schemas), and `evidence-desk validate`
checks a folder against them and against the references between files. Unknown fields and unknown CSV columns are
allowed everywhere and kept when Evidence Desk writes a file, so other tools can extend records.

## Layout

| Path | Holds | Schema |
|---|---|---|
| `evidence-desk.json` | the manifest: `schema: "evidence-desk.workspace/1"`, organization, creation time, frameworks | `workspace` |
| `scope.json` | answers to the scoping questions, and optionally the source of an answer that was not typed by a person | `scope` |
| `controls/<id>.json` | one control | `control` |
| `policies/<id>.md` | a policy's current text | Markdown |
| `policies/<id>.json` | a policy's owner and approved versions | `policy` |
| `policies/archive/<id>.v<n>.md` | the exact text approved as version n | Markdown |
| `registers/people.csv` | people: `id,name,email,role,start_date,end_date,notes` | `register-people` (per row) |
| `registers/systems.csv` | systems: `id,name,kind,owner,description,data,in_scope` | `register-systems` |
| `registers/vendors.csv` | vendors: `id,name,service,data_access,criticality,assurance,last_review,owner` | `register-vendors` |
| `registers/risks.csv` | risks: `id,title,description,likelihood,impact,treatment,controls,owner,status,review_due` | `register-risks` |
| `evidence/records/<id>.json` | one evidence record | `evidence` |
| `evidence/files/` | evidence files | any |
| `AGENTS.md`, `CLAUDE.md` | instructions for a coding agent working in the folder | Markdown |

Registers are RFC 4180 CSV with a header row; open them in any spreadsheet. Multi-valued cells (a risk's `controls`)
separate values with semicolons. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC.

## References and identity

- A record's `id` equals its file name. People are referred to by their `id` in `registers/people.csv`: a control's
  or policy's `owner`, a policy approval's `approved_by` and an evidence record's `recorded_by` must name a person.
- A control's `criteria` are SOC 2 Trust Services Criteria identifiers (`CC6.1`, `A1.2`, ...). An applicable control's
  `policies` must exist. An excluded control (`applicable: false`) carries an `exclusion_reason`.
- An evidence record names the controls it supports and each file with its SHA-256. When a file's bytes change, the
  record no longer describes it: validation warns and the gap view shows the control's evidence as changed. Record
  the new content as new evidence rather than editing the old record.
- A policy version names the archive file and the SHA-256 of the text approved. An archive that no longer matches is
  an error. Text edited after approval is shown as unapproved changes until someone approves a new version.

## Scope and adoption

`scope.json` answers the questions in [`catalog/scope-questions.json`](../catalog/scope-questions.json). Security is
always in scope; Availability, Confidentiality, Processing Integrity and Privacy are in scope when their question is
answered `true`. Adoption copies the [control library](../catalog/controls.json) into `controls/`: a control applies
when one of its criteria's categories is in scope and every `when` condition matches the answers; otherwise it is
written as excluded with the reason. Adopting again after the answers change updates only `applicable` and
`exclusion_reason` on controls that came from the library (`catalog`), and adds policies newly needed. Owners,
statuses, notes and policy text are never changed by adoption.

The control library and criteria titles are this project's own wording. The AICPA's criterion text and points of
focus are not included. Policy templates are adapted from CC0 sources or written here; see each template's header.

## Writing safely

Evidence Desk reads a file, remembers the SHA-256 of what it read, and refuses to write if the file changed in the
meantime. Writes go to a temporary file in the same folder and are renamed into place. Two people or tools editing
the same file therefore never lose each other's work silently; the second writer is told to reload. This protects
cooperating writers only; it is not a lock against a tool that ignores it.

## Readiness

`evidence-desk gaps` derives readiness from the files each time. An applicable control is ready when it has an owner,
its status is `implemented`, each of its policies has an owner and an approved current text with no unfilled
`{{placeholders}}`, and it has evidence that is not older than its frequency allows and whose files are unchanged. A
criterion is ready when at least one applicable control addresses it and all of them are ready. Readiness is a
statement about the workspace, not an audit opinion.
