# Evidence Desk

Local-first SOC2 readiness for CPA firms and clients, with evidence in portable files you own.

Evidence Desk is being built as an open-source workbench around a local folder of JSON, CSV, Markdown
and evidence files. Either the firm or the client can own the folder. People and their own AI coding
tools should be able to inspect and edit it directly, with optional Git or cloud-drive synchronization.
The first local CLI creates, inspects and validates workspaces. Author readiness items directly in the
[version 1 folder format](docs/workspace-format.md); application item editing remains future work.

Customer workspaces are separate from this public code repository and its public development sessions.
Use synthetic evidence for development. Do not submit real customer records in issues, PRs or fleet chats.

## Project and development

Evidence Desk belongs to the [Open Autonomy organization](https://github.com/open-autonomy-org).
Its public coordination channel is [#evidence-desk in the shared organization Discord](https://discord.com/channels/1544906154868744202/1546981849979682916).
The project has its own bot identity, credentials, budget and planning.

- [Constitution](CONSTITUTION.md): the product agreement and its sources.
- [Roadmap](ROADMAP.md): notable plans and outstanding outcomes, maintained by Hermes PM.
- [Changelog](CHANGELOG.md): notable changes consolidated into main.
- [Contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md): how work is built and verified.
- [Project branding](branding/README.md): the shared identity for this project's integrations.

Hermes coordinates development. PM reconciles contributions, queues work and contacts the owner for
decisions and release review. The local runtime uses the operator’s installed Codex subscription, with
an isolated executor container and a host sidecar supervised by native launchd. The first supervised PM
cycle has landed its planning reconciliation. The first worker exercise is blocked by the pinned Hermes
transport’s post-tool silence watchdog; recurring schedules remain paused until that native failure is
resolved and the worker/review/landing cycle is verified. The existing setup record retains the evidence.

The [Open Autonomy project page](https://open-autonomy.org/p/open-autonomy-org%2Fevidence-desk) carries
the public development stream. This installation uses local compute and the operator’s subscription;
platform model or hosting funds have not been used.

## Local verification

The CLI uses TypeScript and Bun 1.3.10 or newer. Follow [AGENTS.md](AGENTS.md) to attach commands
to the local World environment. Install pinned dependencies with `bun install --frozen-lockfile` and
run `bun run check` in that environment before each push. The check typechecks the source; behavior
is verified by operating the CLI against disposable synthetic folders.

The fleet executor has a prepared World named `evidence-desk`, with its configuration and synthetic
workspace outside the checkout. Start it when needed, then attach checks from the current worktree:

```bash
export PATH=/opt/agent/.open-autonomy/node_modules/.bin:$PATH
volter-world up /opt/data/evidence-desk-pilot/world.config.json --root /opt/data --env-file /opt/data/evidence-desk-pilot/app.env
volter-world attach evidence-desk --root /opt/data -- bun install --frozen-lockfile
volter-world attach evidence-desk --root /opt/data -- bun run check
```

This initial World has no external product services. Add vendor twins when product dependencies emerge.
Other developer machines establish their own World using their machine's World instructions.

From the repository root, create a disposable synthetic folder and run the CLI:

```bash
scratch=$(mktemp -d)
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace create "$scratch/example"
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace open "$scratch/example"
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace validate "$scratch/example"
```

`workspace inspect` is an alias for `workspace open`. Create accepts only a new or empty folder;
its parent must exist. Use an editor to add the synthetic item, Markdown context and evidence shown
in the [folder format](docs/workspace-format.md), then repeat open and validate to see the edits.
Open prints incomplete items as well as complete ones; missing evidence produces actionable errors.
Open/validate are read-only and return exit code 1 on invalid input. No hosted service, customer
credentials or AI provider is needed. This slice has no item-write command, sync, packaging or release.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point starts the fleet only after its host, model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
