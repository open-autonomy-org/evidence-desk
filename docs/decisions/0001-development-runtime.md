# ADR 0001: Keep development connections and reporting on the host

Status: Proposed; requires independent constitution review and merge before activation.

## Context and sources

Evidence Desk already runs native Hermes in a World-managed executor with its development connections
and SDK reporter on the host. Open Autonomy's conflicting “plain Hermes” instruction concerned the
Codex login path but also removed container host startup. The owner resolved that conflict in the
September 10–11, 2026 coding conversation: keep the existing valve/reporter, use the current computer
Codex login without copies, and simplify container execution; then “okay yea so make it happen.” That
conversation has no public permalink available to this author.

[OA PR597](https://github.com/open-autonomy-org/open-autonomy/pull/597) contains the upstream runtime
decision, code and manual evidence; acceptance there is not a substitute for Evidence Desk review.
This adoption consolidates [PR86](https://github.com/open-autonomy-org/evidence-desk/pull/86)'s pending
authentication fixes and [PR87](https://github.com/open-autonomy-org/evidence-desk/pull/87)'s ADR policy.
No earlier accepted Evidence Desk ADR is superseded; this records a reviewed decision rather than
inventing retrospective approval of the existing runtime.

## Decision and alternatives

Keep the host-installed OA valve and SDK reporter. World owns the executor's lifecycle; native Hermes
and its tools run inside it. The existing start entrypoint owns the gateway execution connection and
its child services; the machine's service manager handles restarts. Supercode's SDK reads native state
inside the executor; OA's SDK publishes it from the host. Container helpers remain kit internals.

The installed host Codex owns its current login and refresh. The valve obtains transient access through
the native app-server protocol. Hermes's native provider holds stand-ins, not copied subscription
credentials. Twin-model configuration bypasses real authentication. No new scheduler, reporting parser,
public container-management API, customer integration or product dependency is introduced.

Bare startup remains available for synthetic rehearsals or a deployment with an OS user boundary;
it does not itself provide credential isolation. Importing the CLI login into Hermes would create an
independent session and expose refresh credentials. Moving reporting and credentials inside Docker
would violate the agreed boundary. Restoring a whole historical PR would add unrelated changes.

## Consequences and constitutional fit

- **Private evidence stays outside public development / files are the data:** this changes the development
  fleet, not customer workspace storage. Use only synthetic fixtures; product code, format version,
  customer integrations and access remain unchanged.
- **Development is accountable:** preserve the committed fleet identity/model choice and SDK reporting;
  project-funded spending still uses OA's metered rails, and the explicitly selected operator subscription
  uses the operator's allowance. No copied login or estimated subscription cost is introduced.
- **Planning is carefully sourced:** PM reconciles this decision and the ordinary PR history; the coding
  agent does not rewrite the product roadmap. Agent-authored GitHub messages under the owner's account
  do not establish independent human authorship or supersede accepted decisions.
- **Human commitments and release authority are explicit:** normal independent agent review gates merge;
  the fixed alpha candidate and human release hold remain unchanged. No release/deployment is authorized.
- **Done is demonstrated / no automated tests:** manual upstream startup and cleanup observations apply
  to the same generated runtime code. Verify the actual reviewed trusted install before activation;
  record evidence in the adoption PR, not permanent test code. Unrelated rehearsal-harness changes from
  newer kit history are excluded from this focused adoption.

Host installation is separate from the agent-writable checkout. Preserve active work, home state,
existing volumes, configured integrations and protected credentials. An upgrade does not delete old
credential files or automatically replace the running trusted installation. Readiness requires the
actual SDK event and configured connections; it is not inferred from elapsed time. Review must confirm
both this constitution assessment and implementation alignment before accepting the decision.
