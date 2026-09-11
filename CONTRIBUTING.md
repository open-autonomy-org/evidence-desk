# Contributing to Evidence Desk

How code is written here, for people and for the agent alike. The bar every diff is reviewed against, beside
the constitution's invariants. Short on purpose; the reviewer reads it whole.

- **Language and tooling.** TypeScript on Bun.
- **Workspace integrity.** Use synthetic data. Exercise changes against disposable workspace folders,
  including edits made outside the application. Preserve evidence files and provenance, make formats
  explicit, and report invalid input or conflicting edits without silently overwriting the owner's work.
- **Verification environment.** Run the application, dependency installation and checks through the
  local World environment described in `AGENTS.md`. Real development-fleet credentials are distinct
  from synthetic application integrations; customer credentials are never needed for a development check.
  Extract/install runnable dependencies on an execution-enabled filesystem outside Git checkouts, not a
  `noexec` mount. This fleet's operator-authorized disposable root is `/opt/data/artifact-verification`;
  use a unique subdirectory there through the existing World. `/tmp` remains `noexec`: installed compiler
  execution there can fail with EACCES or a silent Bun runner exit. Preserve the failure, do not substitute
  another command for missing manual feature verification, and never remount or relax isolation.
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

## Source preview policy (proposed, not a release)

The first product version is proposed as `0.1.0-alpha.1`. Use SemVer: increment the alpha
sequence for subsequent experimental previews; PM must explicitly propose later minor/major or
stable versions and explain compatibility. Pre-1.0 CLI interfaces may change between previews;
release notes must describe changes. No stable API or cross-platform filesystem guarantee is implied.
Product versions are distinct from persisted workspace `formatVersion: 1`. Incompatible persisted-data
changes require a new format version, documented compatibility and an explicit user-chosen migration
path; never silently migrate or reinterpret old data. Keep `package.json` private: this is not npm publication.

The proposed asset is `evidence-desk-<version>-source.tar.gz`, with a single matching top-level folder.
Its explicit file allowlist lives in `src/prepare-source.ts`: CLI and builder source, package metadata,
pinned Bun version and lockfile, TypeScript configuration, LICENSE, README, this policy, constitution
and workspace-format documentation. No Git internals, node_modules, fleet/runtime configuration,
scratch workspaces or secrets are selected or read. Add product files deliberately, not by globbing.
LICENSE is copied unchanged. Repository-only links in these documents refer to the public source
repository; fleet tooling is intentionally not shipped.

From a Git checkout containing the full committed input, use Bun exactly 1.3.10, Git, GNU tar and
GNU gzip. Execute the builder from that commit, not a dirty local copy (the output parent must exist;
the output directory must not). For example, replacing the placeholder with the full 40-character SHA:

```bash
sha=<full-committed-SHA>
driver=$(mktemp --suffix=.ts)
git show "$sha:src/prepare-source.ts" > "$driver"
volter-world attach evidence-desk --root /opt/data -- bun run "$driver" "$sha" /tmp/preview-build-a
volter-world attach evidence-desk --root /opt/data -- bun run "$driver" "$sha" /tmp/preview-build-b
cmp /tmp/preview-build-a/evidence-desk-0.1.0-alpha.1-source.tar.gz /tmp/preview-build-b/evidence-desk-0.1.0-alpha.1-source.tar.gz
```

The builder reads only committed allowlisted regular files, normalizes archive modes through Git,
uses the commit timestamp and gzip `-n -9`, and refuses an inventory mismatch or existing output.
Reproducibility is for the same input and builder/toolchain (verified on Linux aarch64 with Bun 1.3.10,
Git 2.47.3 and GNU gzip 1.13); other versions/platforms need verification. Adjacent `.sha256` and
`.provenance.json` files record the archive hash, full source SHA, tool versions and complete inventory.
They are outside the archive to avoid circular self-hashing; the tar's Git commit header also identifies
the input. Checksums detect changes, not publisher identity. Frozen installation needs registry access
or a populated cache; dependencies and a Bun executable are not bundled.

### Human-only publication

Local preparation and native execution review do not select or authorize a release candidate.
PM first reconciles the landed policy, fixes a full landed SHA and version in a ready ROADMAP proposal,
and verifies that exact candidate's two builds, inventory, extracted installation/workflow, preservation,
checks and limitations. The human review package must include those commands/results, asset checksum,
source SHA, scope, risks and proposed target/review window under the repository's production procedure.

Only the owner or currently delegated human reviewer may authorize publication. After candidate-specific
approval, a human opens this repository's GitHub Releases page, creates tag `v0.1.0-alpha.1` at the
approved full SHA (not moving main), marks the Release as a prerelease, describes scope/limitations,
and uploads the exact reviewed `.tar.gz`, `.sha256` and `.provenance.json` assets. For later previews use
their approved version consistently. Required GitHub permissions/gates must be satisfied by the human;
agents never create tags, approve, publish, or add publishing credentials/workflows. Any change to SHA,
version or bytes requires renewed review. PM then downloads the published assets and verifies version,
provenance and checksum before recording an actual release in CHANGELOG; publication remains pending
until there is a verified release record. Do not treat GitHub's automatic source zip/tar as these assets.

## Architecture decisions

Material architecture decisions require an Architecture Decision Record (ADR) in
`docs/decisions/NNNN-short-title.md`: runtime topology, trust and credential boundaries, durable data
formats, service responsibilities, or major dependency choices. Consult the existing records before
changing those decisions. Keep records concise and decision-specific; routine implementation details
belong in code and the PR.

Each ADR records its status (Proposed, Accepted, Rejected or Superseded), context and decision,
alternatives and tradeoffs, consequences, original decision/evidence sources, and a constitution review
that cites the relevant clauses and explains compatibility. Link any records it supersedes.

The author links the ADR from the architecture-changing PR; the record and implementation may share
that PR. An independent agent reviews the decision against the current constitution and authorized
scope, then checks that the implementation follows it. Record that reasoning in the PR verdict. An
ADR becomes accepted only after that review and merge; an Accepted label in an unmerged file confers
no authority. Missing records, unresolved contradictions or constitutional violations require changes.
An ADR cannot amend or waive the constitution; a needed amendment follows the constitution's owner
authority before the proposal is reviewed again. Human release approval remains separate.

Preserve accepted decisions and their rationale. A change in direction proposes a new ADR, with links
between it and the superseded record; acceptance of the replacement supersedes the earlier decision.
Chat, agent instructions and PR comments supply evidence for that proposal, not a silent replacement
for the reviewed record. PM coordinates conflicting proposals and holds dependent work while the
conflict is unresolved; independent authorized work continues. Roadmap items link decisions rather
than duplicate them, and the changelog records notable landed outcomes. Do not invent retrospective
approval for existing architecture: distinguish observed history from a newly reviewed decision.
