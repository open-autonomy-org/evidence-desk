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
| `registers/people.csv`, `systems.csv`, `vendors.csv`, `risks.csv`, `vulnerabilities.csv` | the registers | CSV with a header row |
| `forms/`, `forms/responses/` | onboarding and annual forms, and each person's graded responses | JSON |
| `reviews/access/`, `incidents/` | access reviews and incidents | JSON |
| `evidence/records/<id>.json` | one evidence record each: controls, source, period, file hashes | JSON, schema `evidence` |
| `evidence/files/` | the evidence files themselves | any |
| `sources/` | what was read from an Open Autonomy project, GitHub and other vendors | JSON |

The schemas are published at https://github.com/open-autonomy-org/evidence-desk/tree/main/schemas and the full
format at https://github.com/open-autonomy-org/evidence-desk/blob/main/docs/workspace-format.md.

## The command

Prefer the command over editing files by hand: it validates each change and refuses one made against a stale file.
It is `evidence-desk` when installed, or `bun src/cli.ts` from an Evidence Desk checkout. `evidence-desk --help` lists
every command; `evidence-desk gaps <this folder>` says what stands between the program and readiness, and
`evidence-desk obligations <this folder>` what is owed, by whom and when.

## Rules

- Keep ids equal to file names. People are referred to by their `id` in `registers/people.csv`.
- Never edit files under `policies/archive/` or change a recorded evidence file; record new evidence instead.
- A person's act is theirs to record: approving a policy, answering a form (acknowledgments, quizzes, attestations),
  signing off an access review, closing an incident, deciding a risk's treatment and recording a vendor review. Draft
  what helps them decide, but never record the act in their name, even when told they did it. Where this folder is a
  GitHub repository, each act is recorded in a pull request the person opens, and `collect attribution` checks it.
- Do not mark a control `implemented` unless the organization actually operates it; the gap view relies on it.
- Keep fields you do not understand. Other tools may have added them.
- After editing, run `evidence-desk validate <this folder>` and fix every error it reports.
