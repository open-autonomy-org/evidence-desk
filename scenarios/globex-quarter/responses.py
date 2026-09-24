# responses.py <workspace> <exceptions register as JSON>: management's response to each exception, citing the workspace files behind it
import csv,glob,json,os,subprocess,sys
W,X=sys.argv[1],sys.argv[2]
rel=lambda p: os.path.relpath(p,W)
def one(pat): m=sorted(glob.glob(os.path.join(W,pat))); return rel(m[-1]) if m else None
chg_csv=one('evidence/files/populations/github-changes-*.csv'); chg_raw=one('evidence/files/populations/github-changes-*.raw.json')
dep_csv=one('evidence/files/populations/github-deployments-*.csv'); dep_raw=one('evidence/files/populations/github-deployments-*.raw.json')
inc_hist=one('evidence/files/populations/incidents-*.history.txt')
cf_changes=one('evidence/files/populations/cloudflare-changes-*.csv'); rule_changes=one('evidence/files/populations/github-rule-changes-*.csv')
snap=lambda day,c: one(f'evidence/files/collected/{c}/RUN-{day.replace("-","")}T*.json')
roster='sources/open-autonomy/latest.json'
S=("The production-deploy seam is declared for the owner scope, which only Maya holds. Sam (release-review) and Lee "
   "(direction only) started deployments anyway, and Globex relied on the environment approval by someone other than the "
   "starter, given on the deployment's own run (approved_by, commit_match). We accept this departure from the declared "
   "design. From Q4, deploys are started by Maya only, until the seam is declared otherwise.")
R={}
glass=one('evidence/files/populations/break-glass-*.history.txt'); glass_csv=one('evidence/files/populations/break-glass-*.csv')
workers=one('evidence/files/populations/cloudflare-worker-deployments-*.csv')
audits=one('evidence/files/populations/internal-audits-*.csv'); restores=one('evidence/files/populations/restore-tests-*.csv')
for r in json.load(open(X)):
    k=r['key']
    if k.startswith('unmatched-deploy:'):
        R[k]=("Sam deployed the relay Worker from a laptop at 18:20 UTC on 2026-09-10 with a personal Cloudflare token, to raise the replay limit "
              "for a customer whose replay backlog was failing. It bypassed the pull request and the production environment's approval. Sam "
              "recorded it as a break-glass change on 2026-09-11 (records/break-glass/2026-09-10-replay-limit.json), and the same change was "
              "merged through review and deployed as deploy-v6 at 11:00 UTC that day, so unreviewed code ran for about 17 hours. We accept it as "
              "a deviation from the change path. Reducing Sam's personal Cloudflare access to read-only is a Q4 action (management review of "
              "2026-09-25), not yet done.",[workers,glass_csv,glass])
    elif k.startswith('check:cloudflare-change-actors'):
        R[k]=("This reading is Sam's deploy of the relay Worker from a laptop at 18:20 UTC on 2026-09-10, made with his personal Cloudflare "
              "token; the Cloudflare deployments population lists the same deploy, and management's response to that deployment's exception "
              "gives what happened and what follows. No one acknowledged the failing reading before Sam's break-glass record of 2026-09-11.",
              [cf_changes,snap('2026-09-10','cloudflare'),glass])
    elif k.startswith('release-self-approved:'):
        R[k]=(f"The release approval of {r['item']} was {r['detail']}: the second stage was not independent of the author. Each of "
              "those changes had an approving review by an account other than its author's before it merged, a person's or the review "
              "agent's (review/change-releases.csv lists which). We "
              "accept it as a deviation. From Q4 a release is approved by someone who wrote none of its code.",[chg_csv,dep_csv])
    elif k.startswith('personal-token:'):
        R[k]=(f"{r['item']} is a personal Cloudflare token, live at the period's end, that made no deploy in the period. We accept "
              "that a person held a live token on the production account; reviewing every personal token in the quarterly access "
              "review, and revoking those not needed, is a Q4 action.",[one('evidence/files/populations/cloudflare-tokens-*.csv')])
    elif k.startswith('personal-deploy-token:'):
        R[k]=(f"{r['item']} is Sam's personal Cloudflare token, the one the laptop deploy was made with; it was still live at the "
              "period's end, and Sam still held Cloudflare Administrator. We accept it as a deviation: revoking the token and reducing "
              "Sam's personal access to read-only are Q4 actions, so that only the deploy service account can deploy.",
              [one('evidence/files/populations/cloudflare-tokens-*.csv'),workers])
    elif k.startswith('unacknowledged:'):
        R[k]=("No escalation record answers the failing reading of 2026-09-10: no one acknowledged it, and Sam's break-glass record of "
              "2026-09-11 is the first record the organization made of the deploy. We accept it as a deviation from alert handling; from "
              "Q4 the owner of a failing daily check acknowledges it the same day as an escalation record.",
              [one('evidence/files/populations/escalations-*.csv'),snap('2026-09-10','cloudflare'),glass])
    elif k.startswith('check:cloudflare-https'):
        R[k]=("Sam turned Always Use HTTPS off on relay.globex.test at 16:00 UTC on 2026-08-19 while testing a redirect, and Maya turned it back "
              "on at 10:00 UTC on 2026-08-21 (the account audit log in the configuration-changes population). The daily check found it on 08-19, and Maya "
              "acknowledged the alert at 08:30 UTC on 2026-08-20 and chose to leave the setting off until Sam fixed the redirect loop, so it stayed off for a further 25.5 hours (escalation record); the minimum TLS version stayed 1.2 throughout. The change went through no change record, which we accept as a deviation. We have "
              "no evidence either way about plain-HTTP traffic in the window.",[cf_changes,snap('2026-08-19','cloudflare'),snap('2026-08-21','cloudflare'),one('evidence/files/populations/escalations-*.csv')])
    elif k.startswith('out-of-path-change:'):
        R[k]=(f"{r['item']}: a production setting changed by hand, with no change record or break-glass record. We accept it as a "
              "deviation from the change path; from Q4 a production setting is changed only through a reviewed pull request or a "
              "recorded break-glass change.",[cf_changes,glass_csv])
    elif k.startswith('kept-after-exception:'):
        R[k]=(f"{r['item']}: {r['detail']}. The reviewer kept the access without recording a reason. We accept it as a deviation "
              "from the access review; reducing Sam's personal Cloudflare access to read-only is a Q4 action.",[r['file']])
    elif k.startswith('seam-authority:'):
        R[k]=(f"{r['item']}: {r['detail']}. Sam recorded the break-glass change himself; the owner did not approve it before or "
              "after. We accept it as a deviation from the break-glass procedure.",[glass_csv])
    elif k.startswith('audit-finding:'):
        on=k.split(':')[1][:10]
        R[k]=(f"The internal audit of {on} found no restore test recorded yet this quarter for the payload store, as each weekly audit did "
              "until one existed. Maya ran and recorded one on 2026-08-20 (passed), and the audit of 2026-08-24 found C6 passing.",[audits,restores])
    elif k.startswith('incident:'):
        R[k]=("Incident replay-headers: from 2026-08-12 23:05 UTC (deploy-v3) to 2026-08-26 12:30 UTC (deploy-v4), replayed requests could carry "
              "another tenant's headers. The signature-header hotfix changed the cache key; it was reviewed and approved, and no test covered "
              "tenant isolation. The affected customers were told on 2026-08-26. It was closed on 2026-08-27 after the fix, a tenant-isolation "
              "regression test in the CI test job and a rotation of the deploy service account's token; its record's history shows each step.",
              [inc_hist, one('evidence/files/populations/incidents-*.csv')])
    elif k.startswith('config-actor:') or k.startswith('weakened:'):
        R[k]=("The vendor's log names no one for this change, and management has not identified who made it; it stays open as an exception.",[cf_changes if 'cloudflare' in k else rule_changes])
    else: print('UNHANDLED',k,file=sys.stderr)
for k,(t,c) in R.items():
    args=['bun','src/cli.ts','audit',W,'q3','exception',k,'--response',t,'--by','maya']
    for x in c:
        if x: args+=['--cite',x]
    print('\x1f'.join(args))
