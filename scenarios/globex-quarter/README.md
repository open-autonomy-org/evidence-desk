# The Globex quarter

A synthetic company run through one SOC 2 Type II quarter (2026-07-01 to 2026-09-30) in the World, against the GitHub
and Cloudflare twins, ending in the audit package Evidence Desk exports for it. It exists to measure that package: run
it, hand the package to a blind reviewer, change the product, run it again.

Globex is three people: Maya (owner), Sam and Lee. Relay, its product, is an Open Autonomy project on the `soc2`
template, and its compliance workspace is a second repository. The quarter holds the deviations a real first audit
finds:
- a hotfix merged by an administrator who bypassed the required review;
- the incident that hotfix caused, with its escalation and a credential rotation;
- two days with HTTPS-only turned off;
- deployments started by people the project did not authorize to deploy;
- an access reviewer deciding on their own access;
- two decisions recorded under someone else's account.

Globex also departs from the template on purpose, to give the package something to find: it lets administrators
bypass the ruleset and never configures the tag rule. What it lacks (a penetration test, backups, continuity tests)
stays missing.

## Running it

It needs:
- the machine's World tooling (`.open-autonomy/node_modules/.bin/volter-world`, installed as the top-level README
  says);
- a checkout of [volter-ai/twin](https://github.com/volter-ai/twin) at main, because the published twins predate
  rulesets that refuse unapproved merges, rule suites, runners completing runs and request ids;
- network access to npm, whose published `create-open-autonomy` (3.3.0, or `KIT_VERSION`) creates the project.

```bash
export OPEN_AUTONOMY_DATA=<the World data root>
export TWIN_CHECKOUT=<volter-ai/twin checkout>
zsh scenarios/globex-quarter/run.sh          # about 45 minutes; ends with FINISHED <package folder>
```

- **Where it writes.** `run.sh` brings up the World `evidence-desk-oa`, seeds the twins through their APIs, and plays
  the quarter day by day with the World clock. Each day ends with the workspace's daily checks.
- **The engagement.** After the period, it collects the populations and opens the engagement, answering a request
  list from `requests/` (`REQUESTS=pbc-r3`; default `pbc-r5`).
- **Drafts and responses.** It fills the drafts from `dc4.md` and `qualification.md`, and records management's
  responses, each citing its evidence (`responses.py`).
- **The package.** It exports on 5 October to `$PACKAGE_OUT` (default under
  `$OPEN_AUTONOMY_DATA/artifact-verification/globex-state/`) and verifies it.
- **One step at a time.** The steps (`setup.sh`, `phase1b.sh`, `onboard.sh`, `quarter.sh`, `post.sh`, `finish.sh`)
  run on their own too. The World keeps running afterwards: `volter-world down evidence-desk-oa --root "$OPEN_AUTONOMY_DATA"`.

Each request list is a different auditor's framing. A change aimed at one list's wording should be checked against
another.

## The blind review

Copy the package into a folder of its own, and give a fresh agent only that folder and this brief:

> You are an experienced audit senior at a CPA firm, Example & Co. You have run many SOC 2 Type II engagements, and you
> have received PBC packets exported from Vanta, Drata and Secureframe. Your client, Globex, has sent you its audit
> packet for a SOC 2 Type II covering 2026-07-01 to 2026-09-30. Today is 2026-10-05. The packet is the folder
> `<folder>`. Read only files inside it.
>
> This is a dry run. GitHub's and Cloudflare's responses come from a high-fidelity simulator of those services. Do not
> score the simulator's own markers: `_twin` fields, synthetic `node_id` values, localhost URLs, `@localhost` or
> `github-twin` identities. The simulated clock advances once per business event, so the open, approval and merge
> times of one change can coincide. Everything else is in scope.
>
> 1. **Integrity.** Recompute every hash in `manifest.json`.
> 2. **Each request.** Give a verdict: sufficient to test, or insufficient with exactly what you would send back.
>    Trace your samples to raw responses, snapshots and record histories.
> 3. **Findings about the client.** Include whether management's responses are supported by the files they cite, the
>    description's defects, and whether the assertion is supportable.
> 4. **Scores.** Score the packet 1 to 10 on: provenance and integrity, population completeness and sampling
>    readiness, traceability, reviewer effort, description quality, and out-of-scope clarity. Give an overall score,
>    and say whether it is better or worse than the best competitor packet you have seen, and why. Keep the client's
>    failures separate from the packet's quality.
> 5. **Top 10 changes.** Rank the ten changes to the packet or the tool that would most reduce your effort or raise
>    your confidence.

Five such reviews shaped the package. They scored it 4, 4.5, 6, 6.5 and 6.5, and the last two judged it better than the
best competitor packet their reviewer had seen. Their remaining asks are in the roadmap.
