The matters are:

(a) From the start of the period to 2026-08-27, the default branch's ruleset let organization administrators (two of the three staff) always bypass the required review, so the change-approval control was not suitably designed for them. On 2026-08-12 one of them merged a change (PR #4) that way, without an independent approval, and it caused the incident described in DC4. The bypass was removed on 2026-08-27, and every later change has an independent approval.

(b) The zone's HTTPS-only redirect was off from 2026-08-19 to 2026-08-21.

(c) Three of the five production deployments were started by people who do not hold the production-deploy scope the project declares (Sam holds release-review, and Lee holds neither). The deploy-v* tag trigger and administrator-only tag rule the project declares were never configured: every run was started by hand. The environment approval by someone other than the starter was the only gate, and it passed the unreviewed change in (a).

(d) In the 2026-09-15 access reviews, the reviewer decided on their own access.

(e) Two register decisions made before the period were recorded by an account other than their owner's: risk R-3's treatment and the npm vendor review.
