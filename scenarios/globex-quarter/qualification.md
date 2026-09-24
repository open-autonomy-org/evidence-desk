The matters are:

(a) On 2026-09-10, Sam deployed the relay Worker from a laptop with a personal Cloudflare token (Cloudflare deployment {{laptop_deploy}}), outside the reviewed change path and without the production environment's approval. Sam recorded it as a break-glass change the next day, and the same change was merged through review on 2026-09-11. Personal Cloudflare tokens lost the Workers edit permission on 2026-09-26.

(b) The zone's HTTPS-only setting (cloudflare-https) was off from 2026-08-19 to 2026-08-21, a configuration change Sam made while testing, outside the change path. The daily check found it; Maya turned it back on.
