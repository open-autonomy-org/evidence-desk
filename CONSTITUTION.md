# Evidence Desk — constitution

Evidence Desk is an open-source, local-first SOC2 readiness workbench for CPA firms and their clients.
It helps them organize readiness work and supporting evidence in a folder they own, using documented
JSON, CSV, Markdown and ordinary evidence files. Either the firm or the client can own that workspace.
The ambition is the best SOC2 app in the world, matching or exceeding competing products while keeping
the underlying information directly usable by people, other software and the customer's own AI tools.

This constitution defines the product and binds every task. The owner sets its direction; changing
these constraints requires the owner's agreement. Strategy develops roadmap scope under the owner's
mandate; PM manages delivery and sequencing. Check this constitution at conception and against the
implementation at merge; compatibility with it alone never authorizes additional scope.

## Invariants

- **The workspace belongs to its owner.** Core readiness work runs locally. A hosted account, proprietary
  database or subscription is not required to open, understand or retain the workspace.
- **The files are the data.** Structured records use documented, versioned JSON, CSV or Markdown formats;
  supporting evidence remains ordinary files with explicit references. Preserve provenance and make
  changes inspectable. Any indexes or caches must be reconstructible from the workspace.
- **External editing is a supported workflow.** People and tools such as Claude Code or Codex can work
  directly on the files. Validate edits and surface conflicts without silently discarding information.
  Using Evidence Desk does not require entrusting evidence to an AI service chosen by the project.
- **Storage and synchronization are the owner's choice.** A workspace can be kept locally or tracked
  in Git. Optional GitHub, Google Drive, Dropbox or other sync must preserve the portable folder and
  cannot become a prerequisite for core readiness work. Specific integrations are future product choices.
- **Private evidence stays outside public development.** The open-source code and development stream
  are public. The fleet uses synthetic workspaces and evidence only. It receives no permission to read
  customer folders, customer repositories, cloud drives or confidential human discussions.
- **Planning is carefully sourced.** Hermes PM maintains notable current and future intentions in
  `ROADMAP.md` within authorized scope, and distills notable changes consolidated into main into
  `CHANGELOG.md`. Strategy adds and reprioritizes outcomes under the sourced owner mandate in the
  project-communications skill. PM always captures explicit authorized user requests. PM discovers
  ordinary code, PRs, issues and conversations, resolves contradictions and queues ready fleet work.
  Contributors do not need to edit planning documents or produce handoff journals.
- **Human commitments and release authority are explicit.** Assign implementation to a human only
  after they accept it. PM proposes release timing, scope and version, contacts the agreed reviewer,
  and tracks the response. Each release requires candidate-specific human review; commits do not
  automatically become production releases. The owner can redirect priorities.
- **Development is accountable.** The fleet's identity, skills and schedule are committed in `hermes/`.
  Project-funded calls and purchases are metered and published through Open Autonomy. An explicitly
  selected operator subscription uses that operator's allowance; customer AI usage is separate.
- **Done is demonstrated.** Acceptance must hold in the running local system using synthetic data.
  The complete automated check finishes within thirty seconds. Verify material behavior by operating
  the application in its world, including preservation of files written by external tools.

## Out of scope

- Issuing audit opinions, guaranteeing an audit result or replacing the CPA's professional judgment.
- Requiring customers to upload evidence to Open Autonomy or the public development repository.
- A mandatory hosted control plane, proprietary evidence store or project-selected AI service for core use.
- Provisioning real customer integrations during development-fleet setup.

## Founding direction

This is the setup agent's distillation of the owner's founding conversation, continued on 2026-09-08.
The owner requested an open-source SOC2 readiness product, specifying that it could be "completely
local" and "store data as pure json, csv, markdown etc. in a known format," so customers could use
their own coding agents. The owner described an owned folder that could be synced through GitHub,
Google Drive or Dropbox, and clarified that its owner could be "the firm OR the client."
The owner subsequently accepted the working name Evidence Desk and the public repository
`open-autonomy-org/evidence-desk` with public development logs.

The original conversation has no supplied public permalink. These product constraints come from that
owner direction; the initial setup PR makes this distillation reviewable before fleet activation.
The owner subsequently directed autonomous strategy toward the best SOC2 app in the world and parity
with all competitors on 2026-09-10; the project-communications skill records that mandate and its source.
Strategy owns product scope and priority under it. PM manages implementation, sequencing and release
proposals, subject to this constitution and later sourced owner decisions.
