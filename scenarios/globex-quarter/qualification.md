The matters are:

(a) On 2026-09-10, Sam deployed the relay Worker from a laptop with a personal Cloudflare token (Cloudflare deployment {{laptop_deploy}}), outside the reviewed change path and without the production environment's approval. The change ran in production from 18:20 UTC on 2026-09-10 until 11:00 UTC on 2026-09-11, when the same change, merged through review, was deployed as deploy-v6. Sam recorded it as a break-glass change the next day, after the approved redeploy. Reducing Sam's personal Cloudflare access to read-only is a Q4 action, not yet done.

(b) The zone's HTTPS-only setting (cloudflare-https) was off from 2026-08-19 to 2026-08-21, a configuration change Sam made while testing, outside the change path. The daily check found it; Maya turned it back on.
