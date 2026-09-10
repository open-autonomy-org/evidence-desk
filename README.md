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
have resumed. See the [current roadmap](ROADMAP.md#release-next-first-portable-workspace-preview).
Operator tests are not human release approval; earlier watchdog failures remain historical evidence limits.

The [Open Autonomy project page](https://open-autonomy.org/p/open-autonomy-org%2Fevidence-desk) carries
the public development stream. This installation uses local compute and the operator’s subscription;
platform model or hosting funds have not been used.

## Source preview installation

`0.1.0-alpha.1` is a proposed experimental source preview, not a published release or stable API.
When a human-approved Release exists, obtain its three named assets (`.tar.gz`, `.sha256`, and
`.provenance.json`) from this repository's GitHub Releases, not the automatic GitHub source archive.
For local preparation use the same files from the build output. With Bun exactly 1.3.10 installed,
run from the directory containing those assets:

```bash
sha256sum -c evidence-desk-0.1.0-alpha.1-source.tar.gz.sha256
tar -xzf evidence-desk-0.1.0-alpha.1-source.tar.gz
cd evidence-desk-0.1.0-alpha.1-source
bun install --frozen-lockfile
scratch=$(mktemp -d)
bun run src/index.ts workspace create "$scratch/example"
mkdir "$scratch/example/context" "$scratch/example/evidence"
printf '# Synthetic review\n' > "$scratch/example/context/review.md"
printf 'Synthetic evidence\n' > "$scratch/example/evidence/review.txt"
printf '%s\n' '{"id":"REVIEW-1","owner":"Example","status":"todo","context":"context/review.md","evidence":["evidence/review.txt"]}' | bun run src/index.ts workspace item-create "$scratch/example" --stdin
printf '%s\n' '{"status":"complete"}' | bun run src/index.ts workspace item-update "$scratch/example" REVIEW-1 --stdin
bun run src/index.ts workspace open "$scratch/example"
bun run src/index.ts workspace validate "$scratch/example"
```

No Git checkout or fleet configuration is needed to use the extracted CLI. Registry access (or cached
packages) is needed for installation; the archive does not bundle dependencies or Bun. Extract and
install on an execution-enabled filesystem: a `noexec` location can prevent the installed compiler
runner from launching. Fleet extraction follows [the verification prerequisite](CONTRIBUTING.md).
The verified environment is Linux aarch64, Bun 1.3.10 on local ext4. macOS, Windows and network/cloud-drive
filesystems have not been verified; the shell examples require Unix tools. Folder format portability is
not a guarantee of identical locking, rename or symlink semantics on every filesystem.
There is no GUI, sync, hosted service, automatic evidence authoring or conflict merging. Association is
to existing files only. Writes use cooperating locks, not atomic compare-and-swap against arbitrary
external writers; keep reference topology quiescent. Manifest aliases and lossy JSON numeric writes are
refused, and crash leftovers require manual recovery. Read the full
[write limitations](docs/workspace-format.md#item-writes-and-concurrency) before using external editors.
Product SemVer and workspace format version 1 are separate; see [compatibility policy](CONTRIBUTING.md#source-preview-policy-proposed-not-a-release).

## Read-only readiness summary (development source)

From the current repository checkout, after creating the synthetic example below:

```bash
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example"
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --json
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --owner Reviewer
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --status complete --json
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --needs-follow-up
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --owner Reviewer --status complete --needs-follow-up --json
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --owner '' --json
volter-world attach evidence-desk --root /opt/data -- bun run src/index.ts workspace summary "$scratch/example" --owner '  ' --json
```

Outside the fleet, run `bun run src/index.ts workspace summary /path/to/workspace`
or `bun run src/index.ts workspace summary /path/to/workspace --json`.
This addition is after the fixed proposed preview candidate; it is not in that candidate's assets.
Both views report all four status counts, incomplete, unassigned-owner and no-evidence-reference
counts, plus every item's ID, owner, status, paths and warnings (including complete items).
They omit Markdown bodies and evidence contents. Counts can overlap; they are not a readiness
score, evidence-sufficiency assessment, SOC2 coverage claim or audit judgment.
Selectors intersect and owner matching is exact/case-sensitive, without trimming (empty differs from
whitespace). Follow-up means incomplete status or any existing warning, including complete-with-warnings.
Selection still validates the entire workspace; excluded invalid items fail, while no matches succeeds.
Filtered output labels whole-workspace and selected counts and lists only selected item facts.
The [derived report contract](docs/workspace-format.md#derived-summary-report) defines unfiltered JSON
schema 1, filtered schema 2, option/error semantics and the quiescent-folder boundary. No workspace files
are written. For an owner starting with `--`, use `--owner=--example`; folder names starting with `--`
must be qualified (for example `./--example`).

## Local verification

The CLI uses TypeScript and Bun exactly 1.3.10. Follow [AGENTS.md](AGENTS.md) to attach commands
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
Writes refuse manifest-alias context/evidence references (including internal symlinks and untouched
items), and JSON numbers that would lose value during reserialization. Read-only version 1 validation
is unchanged; see the write contract below for precision limits and external-editor recovery.
The writer reads and validates the manifest before printing `Ready` to stderr and reading stdin until
EOF (Ctrl-D interactively). For a read/edit/write session, wait for `Ready` before composing your JSON.
A precomposed pipe is applied against the manifest read at command start, not an earlier editor view.
External manifest edits after `Ready` cause a conflict: reopen and reconsider your patch before retrying.
See the [write and concurrency contract](docs/workspace-format.md#item-writes-and-concurrency) for
cooperating locks, deterministic conflict reproduction and failure/crash limits.
Open prints incomplete items as well as complete ones; missing evidence produces actionable errors.
Open/validate are read-only and return exit code 1 on invalid input. No hosted service, customer
credentials or AI provider is needed. Source packaging is preparation only; no release is published by a build.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point starts the fleet only after its host, model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
