# For the audit firm

This page is for a CPA firm engaged by an organization that keeps its SOC 2 program in Evidence Desk, and in particular
one whose system is an [Open Autonomy](https://github.com/open-autonomy-org/open-autonomy) project on its `soc2`
template. It says what you receive, how each kind of evidence was produced, how to test it, and what stays outside.

## What you receive

The organization exports an audit package: a folder holding exactly the files your request list points at, the
engagement and its requests, the drafts of the system description and assertion, the approved policy texts the
requests name, and a `manifest.json` of every file with its SHA-256. `evidence-desk audit verify <folder>` checks every
file against the manifest offline; you answer each request (accept, return, select samples, mark an exception) in the
package's own page (`evidence-desk audit package-serve <folder>`), and the organization imports your answers back.

## How the evidence was produced

Every evidence record names its source and the exact query that produced it, and hashes its files.

- **Populations** (merged changes, production deployments, roster changes, incidents, credential rotations,
  escalations) are complete by construction and say how: every page of a vendor's list was read, or every commit on the
  repository's first-parent line touching a file was walked. Each row carries what you would sample on: for a change,
  its author, approvers and whether an approval came from someone else; for a deployment, who started the run that made
  it, who approved the production environment, and whether that approval was independent.
- **The design of an Open Autonomy project** is read from its public repository at a named commit: who is in scope and
  what each may authorize (`.open-autonomy/config.yaml` `team`), every place a person acts and where that act is
  recorded (`seams`), the vendor accounts whose administrators are people in scope, and the workflows that land changes
  and reach production. Agents do the development work; people act only at those seams, through one of three doors: a
  commit to a declared file merged under review, the code host's gate with a named reviewer (an environment approval, a
  protected tag), or a platform key no agent holds. A chat message is never the record of an act.
- **A person's own acts** (policy approval, acknowledgments, quizzes and attestations, access review sign-off,
  incident closing, a risk's treatment, a vendor's review) are recorded in the organization's private workspace
  repository through a pull request that person opened. The attribution check traces each act to the commit on the
  default branch that brought it to its present content, and to the merged pull request GitHub associates with that
  commit, and compares that pull request's author with the person's GitHub account on the roster. A collaborator who
  pushes to someone's open pull request branch is not told apart from them.
- **Completeness of people in scope**: each declared vendor account's administrators, read from the vendor (GitHub and
  Cloudflare) or from an export whose production is recorded, compared with the roster.
- **Continuous checks** (two-factor enforcement, required review and protected history, dependency and secret-scanning
  alerts, TLS and HTTPS settings) run daily in the workspace repository; each result and its first failure date are kept.

## What to test, and how

- Re-perform a population's query: every record names it.
- Sample from a population, then trace each sample to the vendor: the pull request, its reviews, the Actions run and its
  approvals.
- For a signed act, open the pull request the attribution check names, and confirm its author is the person the act
  names and that the file's content matches.
- Compare the declared seams with the project's workflows and repository rules at the commit read: nothing a person
  does should fall outside them.

## What stays outside

Evidence Desk and Open Autonomy do not establish: state held only in vendor consoles beyond the collectors (data
handling, backups and restores, network configuration outside Cloudflare's zone settings), facts about people and their
devices beyond their own attestations, the organization's judgments (the risk assessment, management's review, the
signed assertion), vendors' own assurance reports, the penetration test, and agreements with customers. The gap view
the organization shares names each of these per control.
