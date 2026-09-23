# Contributing to Evidence Desk

How code is written here, for people and for the agent alike. The bar every diff is reviewed against, beside
the constitution's invariants. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun.
- **Workspace integrity.** Use synthetic data. Exercise changes against disposable workspace folders,
  including edits made outside the application. Preserve evidence files and provenance, make formats
  explicit, and report invalid input or conflicting edits without silently overwriting the owner's work.
- **Verification environment.** Run the application, dependency installation and checks through the
  local World environment described in `AGENTS.md` and README's Local verification section, using synthetic
  workspaces under `$OPEN_AUTONOMY_DATA/artifact-verification`. Customer credentials are never needed.
- **Content rights.** Ship Trust Services Criteria identifiers with this project's own wording, never AICPA criterion
  text or points of focus. Policy templates come from CC0 or Apache-2.0 sources or are written here, and say so.
- **Shape.** Small modules with one job each, named for what they hold. No layer that exists only to forward.
- **Manual feature verification belongs to each develop agent.** Follow the no-automated-tests invariant
  in `CONSTITUTION.md`. Exercise the feature being added or changed through REPL-style manual usage,
  inspect the actual results and relevant failure cases, and report what happened in the handoff or PR.
  Do not write permanent test code, add test suites or commit tests to main. Reviewers verify this evidence
  and reject test code in the diff. Never invoke automated tests indirectly through checks or hooks.
- **Errors.** Fail loudly with the cause in the message. No silent fallbacks.
- **Docs.** Keep durable project documentation, maintained in place; no rehearsal journals, session reports
  or temporary planning documents. Put change-specific verification evidence in the PR. A file's header says
  what it is for. The README says how to run it. Nothing else is documented twice.
- **Dependencies.** Add one only when writing it would be more code than reading it. Pin what you add.
- **History.** One change per commit, the task id first in the subject, signed as the agent.
