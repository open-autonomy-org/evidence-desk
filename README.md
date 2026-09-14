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
decisions and release review. The owner migrated the fleet to the local host in
[issue101](https://github.com/open-autonomy-org/evidence-desk/issues/101); retired executor-container
instructions do not describe the current application World. The first worker implementation and independent native review
completed in [PR #38](https://github.com/open-autonomy-org/evidence-desk/pull/38). The fleet now uses
Hermes's native agent loop with host-owned subscription forwarding, and the public operator test
verified inbound identity handling. The [landed setup acceptance](https://github.com/open-autonomy-org/evidence-desk/pull/52)
concludes the temporary observation hold: recurring PM/community and autonomous product development
have resumed. See the [current roadmap](ROADMAP.md#release-next-first-portable-workspace-preview).
Operator tests are not human release approval; earlier watchdog failures remain historical evidence limits.

The [Open Autonomy project page](https://open-autonomy.org/open-autonomy-org/evidence-desk) carries
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

## Local graphical workbench (development source, not the fixed alpha.1 archive)

From this checkout, install the pinned dependencies with `bun install --frozen-lockfile`.
Core operation needs no network, hosted account, CDN or AI service after installation. Run:

```bash
# Select ONE new folder explicitly; its parent must exist. Pick your own unused relative sidecar path.
bun run src/readiness.ts serve /absolute/path/new-client --readiness-create my-readiness.json --new-workspace
# Reopen an existing folder and deliberately select its existing readiness records every launch:
bun run src/readiness.ts serve /absolute/path/new-client --readiness-open my-readiness.json
```

Copy the printed `http://127.0.0.1:<port>/#<session>` URL into your local browser. Stop with Ctrl-C.
Do not run both examples simultaneously. The session URL authorizes that local process, not other
people; keep it private. Loopback is not multi-user authentication/RBAC. No workspace/evidence bytes
are served. Native page reload retains this launch's session; reopening the process requires its new URL.
To add readiness to an existing format-1 workspace, omit `--new-workspace` and deliberately choose
`--readiness-create` at an absent path. Existing files/directories/aliases are collisions, never adopted.
`--readiness-open` validates exactly the chosen file; it is not proof of provenance or prior ownership.
No filename, root key, remembered path or directory scan activates readiness. After relocating a folder,
repeat the folder and relative sidecar selection. Ordinary `src/index.ts` commands remain format-1 only.

In the UI:
1. Record system boundary, SOC2 category names, engagement type and period; Save engagement.
2. Create controls with stable IDs, framework/version/source references and applicability rationale.
   Exclusions require rationale too. No official criteria or catalog are bundled.
3. Create/update owned items and authored states. Associate context `.md` and evidence files already
   present in the folder; create those ordinary files with your preferred editor first. No JSON editing
   or CLI is needed to record progress. Link existing items from controls and follow their navigation.
4. Save item due dates separately. Filter follow-up work by exact owner, state, due cutoff, unassigned,
   incomplete, overdue or missing references; inspect shared recorded evidence paths and mapping gaps.
5. Each Save changes only one authoritative file and refreshes forms. Work on one form at a time.
   Reload/revalidate explicitly to see external edits; stale saves refuse and retain form input. Reload
   discards unsaved forms. Malformed records/references require explicit external correction, not repair.

Status and mappings are authored claims, not official coverage, evidence sufficiency or an audit opinion.
Dates use YYYY-MM-DD; overdue compares today's UTC date and ignores authored complete work.

Matching selected CLI operations use the same whole-workspace/readiness validation as the UI:

```bash
bun run src/readiness.ts init /absolute/path/client --readiness-create my-readiness.json
bun run src/readiness.ts validate /absolute/path/client --readiness-open my-readiness.json
bun run src/readiness.ts summary /absolute/path/client --readiness-open my-readiness.json
printf '%s' '{"owner":"Avery","status":"in-progress"}' | bun run src/readiness.ts item-update /absolute/path/client --readiness-open my-readiness.json ITEM-1 --stdin
printf '%s' '{"dueDate":"2026-09-30"}' | bun run src/readiness.ts due-date /absolute/path/client --readiness-open my-readiness.json ITEM-1 --stdin
```

`item-create`, `engagement`, `control-create` take `--stdin` without an existing ID; `item-update`,
`control-update`, `due-date` require an existing ID before `--stdin`. See the
[selected format contract](docs/workspace-format.md#explicit-readiness-version-1) for fields and refusal
rules. Updates retain unknown values. CLI prints Ready after reading both sources and before stdin;
edits made afterward cause conflict. Selected item-ID changes cannot dangle control/follow-up records.
Ordinary CLI/external edits do not validate an unselected sidecar and can require explicit correction
before selected mode is usable. There is no two-file transaction, automatic migration or repair.

Development UI/CLI manually operated on macOS 26.4 arm64 with Bun 1.3.10 and local storage; the older
fixed preview's Linux-only evidence remains separate. Windows, network/cloud-drive filesystems and
multi-user operation are not verified. Reference topology must remain quiescent during writes.

## Evidence requests and deliberate exchange (development source)

Open the local workbench as above, then use section 5. No hosted account or AI service is needed.
Keep an independent backup first, then explicitly confirm upgrading the selected readiness file to v2.
Older readiness-v1 tools cannot open v2; ordinary format-1 CLI use remains separate. Existing unknown
`requests` data refuses upgrade rather than being adopted. Nothing upgrades merely on open.

1. Create a request for existing scoped controls and a requested period, with requester/contributor labels.
2. Choose Respond / review. Record discussion or submit an existing ordinary file, its declared source,
   collection instant and evidence period. Blank metadata remains visibly missing. For replacements use
   a new path to retain earlier bytes; each submission appends history rather than erasing it.
3. Record reviewer requests for changes, then a replacement and readiness closure against the latest
   submission. Contributor declarations and reviewer dispositions are distinct. Inspect full discussion,
   prior versions, transfer provenance and shared request/control associations. Reuse is not sufficiency.
4. Reload after external file edits. Byte observations are snapshots, not a live watcher. Changed/missing
   bytes remove the current reviewed-version claim, not the historical closure. A new disposition refuses
   changed bytes until a replacement is submitted. Missing/stale rules appear in the UI and
   [format contract](docs/workspace-format.md#explicit-readiness-version-2-request-history); filenames
   never imply dates. Authored names, times and hashes are not authenticated truth or audit opinions.
5. Select only the requests to disclose, Preview selected package, and inspect the record/file inventory
   and the original complete files. Linked controls/items, engagement boundary, context and historical
   submission references are included; unrelated records and unknown extensions are not. Contents within
   selected files are not redacted. Choose a new absolute destination outside the source (parent exists),
   then Export exactly previewed selection. Any change requires a new preview. Maximum selected bytes:
   64 MiB. Existing destinations and missing references refuse; never share partial failed output.
6. The recipient inspects PACKAGE.txt, JSON and ordinary evidence offline. With the app installed, run
   `bun run src/readiness.ts serve /absolute/package --readiness-open package-readiness.json`.
   Append responses and replacement files locally, then deliberately return the entire folder with
   exchange.json unchanged. Do not re-export a fresh baseline as a return.
7. At the origin, Preview returned work and conflicts, inspect the new authored events/files, then Import.
   Selected request/control/item conflicts refuse rather than overwriting intervening edits. Unrelated
   local edits and unknown extensions survive. Only new history and unique local evidence copies are
   imported; scope/item changes are not. After success, replay refuses; make a fresh export for another
   exchange. Preserve both folders for deliberate resolution of any conflict. A failed import may leave
   orphan copies in the named return directory; inspect sources before any manual recovery.

Sharing is a deliberate external handoff, not upload, publication, sync, authentication or access control.
The same person may operate the entire workflow locally. Reviewer labels do not enforce roles; delivered
copies cannot be revoked. Treat received files/claims as untrusted and never execute evidence.
The documented [exchange contract](docs/workspace-format.md#selected-exchange-version-1) and proposed
[ADR0003](docs/decisions/0003-deliberate-evidence-exchange.md) define selection, preservation and trust limits.

CLI companions use the same selected v2 source and stdin/revision boundary:
`review-enable` takes the explicit confirmation object from the format contract; `request-create` takes
request fields without events; `request-event` requires an existing request ID and accepts a files array
for multi-file submissions. `summary` reports history and byte/metadata observations. Export/import are
available through the visual preview/confirm flow, not the ordinary format-1 CLI. Fleet execution always
uses the World mapping in Local verification below. This is unreleased development, not a changed fixed
alpha.1 candidate, CPA sign-off or a competitive-parity claim.

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

This section is for fleet contributors, not a user installation requirement. Before any application,
installation or check command, follow [AGENTS.md](AGENTS.md). The owner's
[current host instructions](https://github.com/open-autonomy-org/evidence-desk/issues/101#issuecomment-5656802952)
replace the retired container paths. Preserve the prepared World `evidence-desk`, its 2048 MiB
memory/storage limits, lifecycle, leases and schedules; do not relax isolation or start an alternate runtime.
From the checkout in the same Bash shell:

```bash
D=${OPEN_AUTONOMY_DATA:-/Users/yueranyuan/.local/state/open-autonomy/open-autonomy-org/evidence-desk/data}
W="$PWD/.open-autonomy/node_modules/.bin/volter-world"
"$W" doctor evidence-desk --root "$D"
# Only if the existing instance is down, use its configured scenario; never read app.env:
# "$W" up "$D/evidence-desk-pilot/world.config.json" --name evidence-desk --env-file "$D/evidence-desk-pilot/app.env" --root "$D"
```

Use a unique directory under the execution-enabled synthetic scratch root, not `/tmp`, and map every
ordinary Bun invocation, including external JSON editing and the graphical launcher, through World:

```bash
mkdir -p "$D/artifact-verification"
export TMPDIR="$D/artifact-verification"
bun() { "$W" attach evidence-desk --root "$D" -- bun "$@"; }
```

Run all walkthrough blocks in that same shell. The function preserves stdin, arguments and exit codes;
World attaches in the current checkout with those same absolute synthetic paths. Ordinary users omit
this function entirely. Other developer machines establish their own World using their machine's
instructions: initialize World with the kit's `volter-world init` and a data root outside the checkout.
This World has no external product services; add vendor twins if dependencies emerge.
From the worktree being pushed, install frozen dependencies and run the unchanged check through World:

```bash
bun install --frozen-lockfile
bun run check
git diff --check
```

The check typechecks source and must finish under thirty seconds before each push. Behavior is verified
by operating fresh synthetic folders, not by the check alone. Use the installed `agent-browser` on this
host for loopback UI operation; do not use customer browser profiles. Current development manual evidence
includes macOS arm64/Bun 1.3.10; Windows and network/cloud-drive semantics remain unverified. Fixed
alpha.1 packaging retains its historical Linux-only evidence, not a rebuilt or newly approved candidate.

For fleet administration, follow the [agent-led setup guide](.open-autonomy/SETUP.md). The project uses
the Open Autonomy Hermes kit; `create-open-autonomy check .` checks kit-owned files. The container
entry point is historical; current host setup starts the fleet only after its model, credentials, human contact and review gates
are verified. Product deployment and customer integrations are separate later activations.
