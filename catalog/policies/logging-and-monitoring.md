# Logging and monitoring policy

<!-- Template adapted from Evidence Desk's policy library. Adapt it to how {{organization}} actually operates before approving it. -->

## Purpose

This policy sets what {{organization}} logs, how long it keeps logs, and how it notices and acts on security events.

## Logging

- In-scope systems log authentication events, administrative actions, access to confidential data where feasible, and changes to configuration and code.
- Logs record the time, the actor and the action, and are protected from alteration by the people whose actions they record.
- Logs are retained for at least one year unless a commitment or law requires otherwise.

## Monitoring and alerting

- Security-relevant events generate alerts that reach a named person or rotation.
- Alerts are triaged promptly. An alert that indicates a possible incident is handled under the incident response policy.
- Availability of the service is monitored against the commitments made to customers.

## Review

The security owner reviews logging coverage and alert handling at least quarterly, and records the review.
