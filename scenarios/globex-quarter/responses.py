# responses.py <workspace> <dry package>: management's response to each exception, citing the workspace files behind it
import csv,glob,json,os,subprocess,sys
W,D=sys.argv[1],sys.argv[2]
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
for r in csv.DictReader(open(os.path.join(D,'review/exceptions.csv'))):
    k=r['key']
    if k.startswith('unmatched-deploy:'):
        R[k]=("Sam deployed the relay Worker from a laptop at 18:20 UTC on 2026-09-10 with a personal Cloudflare token, to raise the replay limit "
              "for a customer whose replay backlog was failing. It bypassed the pull request and the production environment's approval. Sam "
              "recorded it as a break-glass change on 2026-09-11 (records/break-glass/2026-09-10-replay-limit.json), and the same change was "
              "merged through review and deployed as deploy-v6 at 11:00 UTC that day, so unreviewed code ran for about 17 hours. We accept it as "
              "a deviation from the change path. Reducing Sam's personal Cloudflare access to read-only is a Q4 action (management review of "
              "2026-09-25), not yet done.",[workers,glass_csv,glass])
    elif k.startswith('check:cloudflare-https'):
        R[k]=("Sam turned Always Use HTTPS off on relay.globex.test at 16:00 UTC on 2026-08-19 while testing a redirect, and Maya turned it back "
              "on at 10:00 UTC on 2026-08-21 (the account audit log in the configuration-changes population). The daily check found it on 08-19, and Maya "
              "acknowledged the alert at 08:30 UTC on 2026-08-20 (escalation record); the minimum TLS version stayed 1.2 throughout. The change went through no change record, which we accept as a deviation. We have "
              "no evidence either way about plain-HTTP traffic in the window.",[cf_changes,snap('2026-08-19','cloudflare'),snap('2026-08-21','cloudflare')])
    elif k.startswith('audit-finding:'):
        R[k]=("The internal audit of 2026-08-17 found no restore test recorded yet this quarter for the payload store. Maya ran and recorded one on "
              "2026-08-20 (passed), and the audit of 2026-08-24 found C6 passing.",[audits,restores])
    elif k.startswith('incident:'):
        R[k]=("Incident replay-headers: from 2026-08-12 23:05 UTC (deploy-v3) to 2026-08-26 12:30 UTC (deploy-v4), replayed requests could carry "
              "another tenant's headers. The signature-header hotfix changed the cache key; it was reviewed and approved, and no test covered "
              "tenant isolation. The affected customers were told on 2026-08-26. It was closed on 2026-08-27 after the fix, a tenant-isolation "
              "regression test in the CI test job and a rotation of the deploy service account's token; its record's history shows each step.",
              [inc_hist, one('evidence/files/populations/incidents-*.csv')])
    elif k.startswith('config-actor:') or k.startswith('weakened:'):
        R[k]=("This change is in the collected change history; management reviewed it at the quarterly review of 2026-09-25.",[cf_changes if 'cloudflare' in k else rule_changes])
    else: print('UNHANDLED',k,file=sys.stderr)
for k,(t,c) in R.items():
    args=['bun','src/cli.ts','audit',W,'q3','exception',k,'--response',t,'--by','maya']
    for x in c:
        if x: args+=['--cite',x]
    print('\x1f'.join(args))
