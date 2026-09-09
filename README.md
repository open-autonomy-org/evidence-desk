# Evidence Desk

Local-first SOC2 readiness for CPA firms and clients, with evidence in portable files you own.

Evidence Desk is being built as an open-source workbench around a local folder of JSON, CSV, Markdown
and evidence files. Either the firm or the client can own the folder. People and their own AI coding
tools should be able to inspect and edit it directly, with optional Git or cloud-drive synchronization.
There is no usable readiness application yet; this repository currently contains the development starter.

Customer workspaces are separate from this public code repository and its public development sessions.
Use synthetic evidence for development. Do not submit real customer records in issues, PRs or fleet chats.

## Project and development

Evidence Desk belongs to the [Open Autonomy organization](https://github.com/open-autonomy-org).
Its public coordination channel is [#evidence-desk in the shared organization Discord](https://discord.com/channels/1544906154868744202/1546981849979682916).
The project has its own bot identity, credentials, budget and planning; bot activation is still pending.

- [Constitution](CONSTITUTION.md): the product agreement and its sources.
- [Roadmap](ROADMAP.md): notable plans and outstanding outcomes, maintained by Hermes PM.
- [Changelog](CHANGELOG.md): notable changes consolidated into main.
- [Contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md): how work is built and verified.
- [Project branding](branding/README.md): the shared identity for this project's integrations.

Hermes is the planned development coordinator. PM reconciles contributions, queues work and contacts
the owner for decisions and release review. Setup must finish before the fleet starts. Initial model
and budget values from the starter are provisional until the owner selects the arrangement.

The [Open Autonomy project page](https://open-autonomy.org/p/open-autonomy-org%2Fevidence-desk) will carry
the funded development stream after its platform connection is established. A link to that page is
not evidence of funding or an active fleet.

## Local verification

The starter uses TypeScript and Bun 1.3.10 or newer. Its `src/index.ts` is a placeholder. Follow
[AGENTS.md](AGENTS.md) to attach commands to the local World environment, install dependencies with
`bun install`, then use the generated lockfile with `bun install --frozen-lockfile` on subsequent runs.
Run `bun run check` in that same environment before each push. This initially checks the starter's types;
it does not demonstrate a SOC2 readiness workflow.

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

Application behavior will be verified with disposable synthetic workspace folders. PM will establish
an application entry point and document its actual run command here as implementation lands.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point starts the fleet only after its host, model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
