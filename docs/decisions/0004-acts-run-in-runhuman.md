# ADR 0004: Acts whose seam names a routine are filed as Runhuman runs and collected from their Tasks

Status: Proposed with its first implementation, under runhuman-2 ADR 0038 §12 (locked by the owner, RFC 0017) and
Open Autonomy ADR 0019.

## Context and sources

Open Autonomy ADR 0019 lets a seam name the routine its act runs through, records each roster member's Volter identity
from their own sign-in, and holds the owner's acts for the Release. runhuman-2 ADR 0038 §12: "each obligation whose seam
names a routine becomes a run of it, with the obligation as its variables; ED prepares the packet (for a policy, its text
and hash). ED is an automation, so it sets the run's sponsor to the obligation's owner (owner accepted, 2026-09-30).
Other obligations keep `remind` and PR signing"; "`collect rh2-tasks` reads each run's Task answers through a read-only
grant and attributes an act when the principal is the roster member's and the packet hash matches; RH2's answers are kept
whole as provenance". Its proof rows 10, 12 and 16.

## Decision

1. **`file-runs`** files each owed obligation (overdue, or due within `--within` days) whose seam names a routine: a policy
   approval at `policy-approval`, a person's own form at `onboarding`. The packet is the policy's text and its sha256
   (as an approval hashes it), or the form's questions and the version and hash of every policy in force. The run is
   started through Runhuman's model door with Evidence Desk's automation token, its sponsor the Runhuman principal whose
   Volter identity is on the member's roster entry. The routines are this repository's (`routines/`), published to the
   linked workspace with `rh2 v3 routine publish`.
2. **The owner's acts wait for the Release.** An obligation owed by a member holding `owner` is not filed until
   `--release <project>` finds the open Release pull request carrying PM's release-ready marker; then it is filed and
   listed on that pull request, one comment kept current.
3. **`collect rh2-tasks`** reads each run's Task. The act is recorded (the policy approved as-is at the text shown, the
   form response submitted and graded) only when the principal who answered, or the person an observed principal was
   consolidated into, carries the member's Volter subject, and the packet hash is the one filed and still current.
   Every answer read is written whole under `sources/rh2/answers/`.
4. **`remind`** leaves an obligation whose seam names a routine to its run. A member with no Volter identity on the
   roster is reported by `file-runs` as unlinked.
5. **Reached where they are** (RFC 0017 §9). A member whose people row carries a `slack` profile link is reached in
   Slack: the run is given it as `reach`, the routine opens its Conversation linked to their direct messages through the
   channel bridge, and Runhuman's companion relays the line they type there as their answer, that line its consent. A
   member Runhuman does not know yet (no person with their Volter subject) is filed for all the same, asked whoever
   answers in their direct messages; the act is recorded once their Volter sign-in is consolidated with the Slack person
   they wrote as. The answer file keeps the consent: its message, who relayed it, and Slack's proof (workspace, user,
   channel, message timestamp), which the recorded response names. A policy is approved by answering `approve`.

## Consequences

- The workspace needs RH2_BASE_URL, RH2_SESSION_TOKEN and RH2_ORGANIZATION to file and collect; nothing changes for a
  project whose seams name no routine.
- Evidence from here on: a decline, an answer by someone else, or a packet that changed since it was shown is recorded
  as refused in `sources/rh2/runs.json`, and the obligation stays owed.
