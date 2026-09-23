# Evidence Desk

The open-source, local-first alternative to SOC 2 compliance SaaS: your whole compliance program in a folder you own.

Evidence Desk keeps a company's SOC 2 program as ordinary files: controls and evidence records as JSON, registers as
CSV, policies as Markdown, evidence as whatever files you have. It scopes the program from a short interview, adopts a
control set and policy templates, shows exactly what stands between you and readiness, and never needs an account, a
database or a hosted service. People use the local app, spreadsheets or a text editor; coding agents such as Claude Code
or Codex work on the same files. Keep the folder anywhere, including in Git.

Customer workspaces never belong in this public repository or its public development sessions. Use synthetic data for
development, issues and pull requests.

## Use it

Evidence Desk runs on [Bun](https://bun.sh) 1.3.10 or newer. From a checkout:

```bash
bun install --frozen-lockfile
bun src/cli.ts init ~/acme-soc2 --org "Acme"      # a new or empty folder
bun src/cli.ts serve ~/acme-soc2                    # then open http://127.0.0.1:4870/
```

In the app, answer the scoping questions and adopt the control set, then work through the Overview: assign owners,
adapt and approve policies, fill the registers and record evidence. People complete their onboarding quizzes,
acknowledgments and attestations on the People page; Obligations shows what is owed by whom and when; access reviews
and incidents each have their own page. Everything the app does is also a command:

```bash
bun src/cli.ts scope ~/acme-soc2 --set services="Hosted webhook inbox" availability=true ...
bun src/cli.ts adopt ~/acme-soc2
bun src/cli.ts register ~/acme-soc2 people --add id=ana name="Ana Ortiz" role="Security owner"
bun src/cli.ts control ~/acme-soc2 AC-03 --owner ana --status in-progress
bun src/cli.ts policy ~/acme-soc2 access-control --approve --by ana
bun src/cli.ts evidence ~/acme-soc2 --add --control AC-03 --file review.csv --title "Q3 access review" --by ana --period 2026-07-01..2026-09-30
bun src/cli.ts respond ~/acme-soc2 code-of-conduct --person ana --answer read=yes
bun src/cli.ts access-review ~/acme-soc2 start --system github --reviewer ana --period 2026-07-01..2026-09-30 --listing members.csv --generated-by "gh api orgs/acme/members"
bun src/cli.ts incident ~/acme-soc2 new --title "Lost laptop" --severity medium --by ben --note "Reported at 09:10"
bun src/cli.ts obligations ~/acme-soc2
bun src/cli.ts gaps ~/acme-soc2
bun src/cli.ts validate ~/acme-soc2
```

With an [Open Autonomy](https://github.com/open-autonomy-org/open-autonomy) project, much of the program is read from
what the project already declares instead of asked:

```bash
bun src/cli.ts open-autonomy ~/acme-soc2 import --repo ~/acme-inbox --by ana
bun src/cli.ts open-autonomy ~/acme-soc2 completeness --account github --by ana
GITHUB_TOKEN=... bun src/cli.ts collect ~/acme-soc2 github-changes --repo acme/inbox --period 2026-07-01..2026-09-30 --by ana
bun src/cli.ts collect ~/acme-soc2 roster-history --repo ~/acme-inbox --period 2026-07-01..2026-09-30 --by ana
bun src/cli.ts collect ~/acme-soc2 seam-records --repo ~/acme-inbox --period 2026-07-01..2026-09-30 --by ana
```

Checks run against your own systems with your own read-only credentials, from the Checks page or the command line,
and can run every day in the workspace's own repository:

```bash
bun src/cli.ts collectors ~/acme-soc2 github --enable --set org=acme repos=acme/inbox
GITHUB_TOKEN=... bun src/cli.ts run ~/acme-soc2 --by ana
bun src/cli.ts ci-template ~/acme-soc2
```

An audit runs between the workspace and the CPA firm without either side hosting anything:

```bash
bun src/cli.ts audit ~/acme-soc2 new q3 --type type2 --firm "Example & Co" --period 2026-07-01..2026-09-30
bun src/cli.ts audit ~/acme-soc2 q3 requests --import requests.csv
bun src/cli.ts audit ~/acme-soc2 q3 draft description
bun src/cli.ts audit ~/acme-soc2 q3 export --out ~/q3-package          # send the folder to the firm
bun src/cli.ts audit package-serve ~/q3-package                         # the firm answers in its browser
bun src/cli.ts audit ~/acme-soc2 q3 import-return ~/q3-package         # bring the answers back
bun src/cli.ts firm ~/firm/firm.json --serve                            # the firm's view across its clients
```

Answer customers from the same facts, and publish a trust center you host yourself:

```bash
bun src/cli.ts questionnaire ~/acme-soc2 import bigco.csv --name "BigCo vendor review"
bun src/cli.ts trust ~/acme-soc2 build --out ~/acme-trust
```

The same program covers ISO 27001, reusing its controls and evidence:

```bash
bun src/cli.ts frameworks ~/acme-soc2 enable iso27001
bun src/cli.ts soa ~/acme-soc2 --out soa.md
```

Add `--json` to any command for machine-readable output. `bun src/cli.ts --help` lists every command.

The folder's structure is documented in [docs/workspace-format.md](docs/workspace-format.md) with JSON Schemas in
[schemas/](schemas). The workspace carries its own `AGENTS.md`, so a coding agent opened in it knows the rules.
Edits made outside Evidence Desk are validated, and Evidence Desk refuses to overwrite a file that changed since it
was read.

## What ships

- [catalog/criteria.json](catalog/criteria.json): SOC 2 Trust Services Criteria identifiers with short titles written
  by this project. The AICPA's criterion text and points of focus are not included.
- [catalog/frameworks/iso27001.json](catalog/frameworks/iso27001.json): ISO/IEC 27001:2022 clause and Annex A identifiers
  mapped onto the controls.
- [catalog/controls.json](catalog/controls.json): 59 controls in this project's own words, mapped to criteria, with
  frequency, policies, the evidence an auditor expects, and when each applies.
- [catalog/forms/](catalog/forms): a security awareness quiz, policy and code-of-conduct acknowledgments, a
  confidentiality agreement and a device and account attestation.
- [catalog/policies/](catalog/policies): 18 policy templates, adapted from the CC0
  [Tailscale security policies](https://github.com/tailscale/security-policies) or written here.

Readiness is a statement about the workspace, not an audit opinion. A SOC 2 report still comes from a licensed CPA firm.

## Project and development

Evidence Desk belongs to the [Open Autonomy organization](https://github.com/open-autonomy-org). Its public
coordination channel is [#evidence-desk in the shared organization Discord](https://discord.com/channels/1544906154868744202/1546981849979682916).

- [Constitution](CONSTITUTION.md): the product agreement and its sources.
- [Roadmap](ROADMAP.md): the plan toward parity with SOC 2 compliance SaaS, and what is outstanding.
- [Changelog](CHANGELOG.md): notable changes on main.
- [Contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md): how work is built and verified.
- [Project branding](branding/README.md): the shared identity for this project's integrations.

## Local verification

For contributors on this project's development host. Before any application, installation or check command, follow
[AGENTS.md](AGENTS.md): commands run through the machine's World `evidence-desk`. From the checkout:

```bash
(cd .open-autonomy && bun install --frozen-lockfile)
D=${OPEN_AUTONOMY_DATA:-/Users/yueranyuan/.local/state/open-autonomy/open-autonomy-org/evidence-desk/data}
W="$PWD/.open-autonomy/node_modules/.bin/volter-world"
"$W" doctor evidence-desk --root "$D"
# Only if it is down:
# "$W" up "$D/evidence-desk-pilot/world.config.json" --name evidence-desk --env-file "$D/evidence-desk-pilot/app.env" --root "$D"
bun() { "$W" attach evidence-desk --root "$D" -- bun "$@"; }
bun install --frozen-lockfile
bun run check
```

Exercise changes on synthetic workspaces under `$D/artifact-verification/`, including edits made outside the app.
Other machines establish their own World with the kit's `volter-world init` and a data root outside the checkout.
