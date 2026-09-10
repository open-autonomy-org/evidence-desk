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
bun run src/index.ts workspace create "$scratch/preview-example"
bun run src/index.ts workspace validate "$scratch/preview-example"
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
For interrupted writes, follow the ordered [manual recovery procedure](docs/workspace-format.md#manual-interrupted-write-recovery):
account for all writers, preserve an independent quiescent copy, inspect and reopen before exact-path cleanup
or a deliberate new edit. A failed write or an empty lock is not proof of abandonment.
Product SemVer and workspace format version 1 are separate; see [compatibility policy](CONTRIBUTING.md#source-preview-policy-proposed-not-a-release).

## Development-source walkthrough

This is one ordered synthetic handoff, not an audit assessment. Use a fresh checkout of current main,
not the fixed unpublished `0.1.0-alpha.1` archive: summary and selection commands landed after that
candidate and are **not available in its assets**. No customer data, credentials, hosted service or AI
provider is needed. Ordinary users need Git, Bash, Unix tools and Bun exactly 1.3.10, not fleet tooling.
Installation still needs registry access or cached packages and an execution-enabled filesystem.

Run the following blocks in order in the same Bash shell, stopping on unexpected failure. `set -e`
stops the walkthrough; expected refusals below are handled explicitly. All temporary folders are newly
created outside the checkout. Fleet contributors first apply the separate [World prerequisite](#local-verification).

```bash
set -euo pipefail
source_root=$(mktemp -d)
git clone https://github.com/open-autonomy-org/evidence-desk.git "$source_root/evidence-desk"
cd "$source_root/evidence-desk"
git rev-parse HEAD
test "$(bun --version)" = 1.3.10
bun install --frozen-lockfile
scratch=$(mktemp -d)
workspace="$scratch/example"
reports="$scratch/reports"
mkdir "$reports"
bun run src/index.ts workspace create "$workspace"
mkdir "$workspace/context" "$workspace/evidence"
printf '# Synthetic access review\n' > "$workspace/context/access.md"
printf 'reviewer,result\nExample,pending\n' > "$workspace/evidence/access.csv"
printf 'Unrelated synthetic note: retain me.\n' > "$workspace/notes.txt"
printf '%s\n' '{"id":"ACCESS-01","owner":"Example","status":"todo","context":"context/access.md","evidence":["evidence/access.csv"]}' | bun run src/index.ts workspace item-create "$workspace" --stdin
printf '%s\n' '{"status":"complete","owner":"Reviewer","evidence":[]}' | bun run src/index.ts workspace item-update "$workspace" ACCESS-01 --stdin
printf '%s\n' '{"id":"FOLLOW-02","owner":"","status":"todo","context":"context/access.md","evidence":[]}' | bun run src/index.ts workspace item-create "$workspace" --stdin
bun run src/index.ts workspace open "$workspace"
bun run src/index.ts workspace validate "$workspace"
```

Create requires a new or empty folder with an existing parent. `workspace inspect` aliases `open`.
Item creation requires all five fields; updates apply only supplied fields, with an evidence array
replacing the entire association list. Context/evidence must already exist; their bytes are not written
by the CLI. Unknown patch keys are refused, but existing unknown record fields are retained.

### Read-only readiness summary (development source)

```bash
bun run src/index.ts workspace summary "$workspace"
bun run src/index.ts workspace summary "$workspace" --json
bun run src/index.ts workspace summary "$workspace" --markdown
bun run src/index.ts workspace summary "$workspace" --owner Reviewer --needs-follow-up --json
bun run src/index.ts workspace summary "$workspace" --owner Reviewer --needs-follow-up --markdown
```

Expect two items: one `todo`, one `complete`, one incomplete, one unassigned owner and two without
evidence references. These counts overlap: FOLLOW-02 contributes to all three follow-up counts.
ACCESS-01 is complete-with-warnings and still matches Reviewer/follow-up because its evidence list is
empty. Complete is self-reported; neither it nor these counts establish evidence sufficiency, a readiness
score, SOC2 coverage/mappings or an audit judgment. Warnings and incomplete work succeed with exit 0.

All views show the same facts, not evidence contents, context bodies or extension data. Owner matching
is exact/case-sensitive without trimming (empty differs from whitespace). Selectors intersect;
`--status complete` can further narrow this selection. Validation covers even excluded items; zero
matches succeeds. The [derived report contract](docs/workspace-format.md#derived-summary-report)
defines JSON schemas 1/2, escaping and option/error semantics. `--json` and `--markdown` cannot be
combined. Qualify folder names starting with `--` (such as `./--example`); use `--owner=--example`
for such an owner.

### External edit, validation and a safe correction

Stop other editors/writers and keep the folder and reference topology quiescent. This external edit
uses Bun only as a local JSON editor, not a new CLI feature. It acquires the cooperating lock before
reading, changes FOLLOW-02's owner/status and adds synthetic extension data without replacing other
fields or files. The trap removes only the lock this block successfully acquired. Do not remove a
live writer's lock. This small-number synthetic example is not a precision-preserving general editor.

```bash
(
  mkdir "$workspace/.evidence-desk-write.lock"
  trap 'rmdir "$workspace/.evidence-desk-write.lock"' EXIT
  bun -e 'const fs = require("node:fs"); const p = process.argv[1]; const data = JSON.parse(fs.readFileSync(p, "utf8")); const item = data.items.find(item => item.id === "FOLLOW-02"); item.owner = "Reviewer"; item.status = "blocked"; item.customNotes = {source: "Synthetic external edit"}; data.customWorkspaceData = {team: "Synthetic Example Firm"}; fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");' "$workspace/workspace.json"
)
bun run src/index.ts workspace validate "$workspace"
bun run src/index.ts workspace summary "$workspace" --json
bun run src/index.ts workspace summary "$workspace" --owner Reviewer --needs-follow-up --json
```

Now both items match Reviewer/follow-up; the whole workspace has one blocked, one complete, one
incomplete, zero unassigned and two without evidence references. Each invocation rereads disk.

Try an association to an absent file, handling the expected exit 1 explicitly:

```bash
if printf '%s\n' '{"evidence":["evidence/missing.csv"]}' | bun run src/index.ts workspace item-update "$workspace" ACCESS-01 --stdin; then
  printf 'Unexpected success; stop and inspect the workspace.\n' >&2
  exit 1
else
  status=$?
  printf 'Invalid-reference exit: %s (expected 1)\n' "$status"
  test "$status" -eq 1
fi
bun run src/index.ts workspace validate "$workspace"
```

Read the diagnostic: `evidence/missing.csv` does not exist. The refused patch leaves the manifest and
sources unchanged; validation still succeeds. Do not blindly retry or invent evidence to satisfy it.
For this synthetic example the intended file was the already-created `evidence/access.csv`. Inspect
its contents, then explicitly correct the association, preserving the external extension data:

```bash
cat "$workspace/evidence/access.csv"
printf '%s\n' '{"evidence":["evidence/access.csv"]}' | bun run src/index.ts workspace item-update "$workspace" ACCESS-01 --stdin
bun run src/index.ts workspace validate "$workspace"
bun run src/index.ts workspace summary "$workspace" --json
bun run src/index.ts workspace summary "$workspace" --owner Reviewer --needs-follow-up --json
```

Only FOLLOW-02 now matches; ACCESS-01 is complete without warnings. Whole-workspace no-evidence
count is one. Nothing has assessed the CSV's sufficiency. If instead an external edit invalidates the
stored manifest, validate and correct that specific source externally before any CLI item write;
the CLI will not automatically repair or silently discard it.

Writes use cooperating locks, not atomic compare-and-swap against arbitrary writers. The CLI prints
`Ready` before reading stdin; a precomposed pipe applies to the manifest read at command start, not
an earlier editor view. A detected external change after `Ready` refuses: reopen and reconsider the
patch. Manifest aliases and lossy JSON numeric writes are refused; manual crash recovery and platform
limits remain. Read the [format/concurrency contract](docs/workspace-format.md#item-writes-and-concurrency),
including numeric/alias recovery, rather than treating this sequential example as concurrent safety.
Read operations acquire no lock and provide no live snapshot.

### Save and review the handoff

The concrete destination below is new and outside the workspace. No-clobber refuses an existing
file. Check the command's exit status before opening or sharing the report:

```bash
report="$reports/reviewer-follow-up.md"
if (set -C; bun run src/index.ts workspace summary "$workspace" --owner Reviewer --needs-follow-up --markdown > "$report"); then
  printf 'Report exit: 0; review %s before sharing\n' "$report"
  cat "$report"
else
  status=$?
  printf 'Report failed (exit %s); do not share %s. Inspect the diagnostic and destination.\n' "$status" "$report" >&2
  exit "$status"
fi
```

The CLI only emits stdout; the shell creates the report, not the application. Redirection can create
an empty file before failed validation (or truncate an existing file without no-clobber). Never redirect
onto workspace sources. After failure inspect any destination before deliberately choosing a new one;
do not share or blindly overwrite it. Markdown failure stdout is empty and diagnostics use stderr.
Authored IDs, owners and paths are ASCII-only JSON string literals in code spans, with Unicode and
punctuation escaped against active Markdown/HTML. Do not decode then reinterpret them as markup.
Review the contents, including names and paths, before sharing: escaping is not confidentiality.
This is derived data, not an import format or live snapshot. Synthetic operational verification is
not customer adoption. Keep or remove these disposable folders yourself after reviewing them.

## Local verification

This section is for fleet contributors, not a user installation requirement. Before running any Bun
command above, follow [AGENTS.md](AGENTS.md) and the machine's World instructions. This executor's
prepared World is `evidence-desk`; preserve its host lifecycle, limits, leases and schedules and the
Docker `--init` prerequisite. Do not start an alternate service or relax isolation. If it is stopped,
the configured start command is:

```bash
export PATH=/opt/agent/.open-autonomy/node_modules/.bin:$PATH
volter-world up /opt/data/evidence-desk-pilot/world.config.json --root /opt/data --env-file /opt/data/evidence-desk-pilot/app.env
```

For the walkthrough in this fleet, use the existing execution-enabled disposable root (not noexec
`/tmp`) and map every ordinary `bun` invocation, including the external JSON editor, through World:

```bash
volter-world doctor evidence-desk --root /opt/data
export TMPDIR=/opt/data/artifact-verification
bun() { volter-world attach evidence-desk --root /opt/data -- bun "$@"; }
```

Run all walkthrough blocks in that same shell. The function preserves stdin, arguments and exit codes;
World attaches in the current checkout with those same absolute synthetic paths. Ordinary users omit
this function entirely. Other developer machines establish their own World using their machine's
instructions. This World has no external product services; add vendor twins if dependencies emerge.
From the worktree being pushed, install frozen dependencies and run the unchanged check through World:

```bash
volter-world attach evidence-desk --root /opt/data -- bun install --frozen-lockfile
volter-world attach evidence-desk --root /opt/data -- bun run check
git diff --check
```

The check typechecks source and must finish under thirty seconds before each push. Behavior is verified
by operating fresh synthetic folders, not by the check alone. Only Linux aarch64/local ext4 with Bun
1.3.10 is verified; macOS, Windows and network/cloud-drive filesystems are untested. Source packaging
is preparation only, never release approval, publication or deployment.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point starts the fleet only after its host, model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
