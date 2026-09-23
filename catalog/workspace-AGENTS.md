# This folder is an Evidence Desk workspace

It holds a SOC 2 compliance program as ordinary files. People, spreadsheets, the Evidence Desk app and coding
agents such as Claude Code or Codex can all edit it. These instructions are for an agent working here.

## What is where

| Path | What it holds | Format |
|---|---|---|
| `evidence-desk.json` | the workspace manifest | JSON, schema `workspace` |
| `scope.json` | answers to the scoping questions | JSON, schema `scope` |
| `controls/<id>.json` | one control each: criteria, owner, status, applicability | JSON, schema `control` |
| `policies/<id>.md` | a policy's current text | Markdown |
| `policies/<id>.json` | the policy's owner and its approved versions | JSON, schema `policy` |
| `policies/archive/<id>.v<n>.md` | the exact text of each approved version | Markdown, never edit |
| `registers/people.csv`, `systems.csv`, `vendors.csv`, `risks.csv` | the registers | CSV with a header row |
| `evidence/records/<id>.json` | one evidence record each: controls, source, period, file hashes | JSON, schema `evidence` |
| `evidence/files/` | the evidence files themselves | any |

The schemas are published at https://github.com/open-autonomy-org/evidence-desk/tree/main/schemas and the full
format at https://github.com/open-autonomy-org/evidence-desk/blob/main/docs/workspace-format.md.

## Rules

- Keep ids equal to file names. People are referred to by their `id` in `registers/people.csv`.
- Never edit files under `policies/archive/` or change a recorded evidence file; record new evidence instead.
- Approving a policy is a person's decision. Draft and edit policy text, but leave approval to a person.
- Do not mark a control `implemented` unless the organization actually operates it; the gap view relies on it.
- Keep fields you do not understand. Other tools may have added them.
- After editing, run `evidence-desk validate <this folder>` and fix every error it reports.
