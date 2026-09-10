# Evidence Desk

Local-first SOC2 readiness for CPA firms and clients, with evidence in portable files you own.

Evidence Desk is being built as an open-source workbench around a local folder of JSON, CSV, Markdown
and evidence files. Either the firm or the client can own the folder. People and their own AI coding
tools should be able to inspect and edit it directly, with optional Git or cloud-drive synchronization.
The local CLI creates, edits, inspects and validates workspaces. Readiness items use the portable
[version 1 folder format](docs/workspace-format.md), also editable with your own tools.

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
cycle has landed its planning reconciliation. The first worker implementation and independent native review
completed in [PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38). The fleet now uses
Hermes's native agent loop with host-owned subscription forwarding, and the public operator test
verified inbound identity handling. The [landed setup acceptance](https://github.com/open-autonomy-org/evidence-desk/pull/52)
concludes the temporary observation hold: recurring PM/community and autonomous product development
have resumed. See the [current roadmap](ROADMAP.md#workspace-first-demonstrate-readiness-work-in-a-portable-local-folder).
Operator tests are not human release approval; earlier watchdog failures remain historical evidence limits.

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
its parent must exist. Create Markdown context and evidence with your own editor first, then associate
those existing files (their bytes are never overwritten):

```bash
mkdir "$scratch/example/context" "$scratch/example/evidence"
printf '# Synthetic access review\n' > "$scratch/example/context/access.md"
printf 'reviewer,result\nExample,pending\n' > "$scratch/example/evidence/access.csv"
printf '%s\n' '{"id":"ACCESS-01","owner":"Example","status":"todo","context":"context/access.md","evidence":["evidence/access.csv"]}' | volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace item-create "$scratch/example" --stdin
printf '%s\n' '{"id":"ACCESS-02","owner":"Reviewer","status":"complete"}' | volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace item-update "$scratch/example" ACCESS-01 --stdin
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace open "$scratch/example"
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace validate "$scratch/example"
```

Creation requires all five item fields; update applies only supplied fields and can rename the ID.
To change context or evidence, supply `"context":"context/other.md"` or an entire replacement
`"evidence":["evidence/other.csv"]` array, with files already present. An empty evidence array is allowed.
Unknown input keys are refused; existing unknown record fields are preserved.
The writer reads and validates the manifest before printing `Ready` to stderr and reading stdin until
EOF (Ctrl-D interactively). For a read/edit/write session, wait for `Ready` before composing your JSON.
A precomposed pipe is applied against the manifest read at command start, not an earlier editor view.
External manifest edits after `Ready` cause a conflict: reopen and reconsider your patch before retrying.
See the [write and concurrency contract](docs/workspace-format.md#item-writes-and-concurrency) for
cooperating locks, deterministic conflict reproduction and failure/crash limits.
Open prints incomplete items as well as complete ones; missing evidence produces actionable errors.
Open/validate are read-only and return exit code 1 on invalid input. No hosted service, customer
credentials or AI provider is needed. This slice has no sync, packaging or release.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point starts the fleet only after its host, model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
