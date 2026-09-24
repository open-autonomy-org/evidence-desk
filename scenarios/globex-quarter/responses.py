# responses.py <workspace> <dry package>: management's response to each exception, citing the workspace files behind it
import csv,glob,json,os,subprocess,sys
W,D=sys.argv[1],sys.argv[2]
rel=lambda p: os.path.relpath(p,W)
def one(pat): m=sorted(glob.glob(os.path.join(W,pat))); return rel(m[-1]) if m else None
chg_csv=one('evidence/files/populations/github-changes-*.csv'); chg_raw=one('evidence/files/populations/github-changes-*.raw.json')
dep_csv=one('evidence/files/populations/github-deployments-*.csv'); dep_raw=one('evidence/files/populations/github-deployments-*.raw.json')
inc_hist=one('evidence/files/populations/incidents-*.history.txt')
snap=lambda day,c: one(f'evidence/files/collected/{c}/RUN-{day.replace("-","")}T*.json')
roster='sources/open-autonomy/latest.json'
S=("The production-deploy seam is declared for the owner scope, which only Maya holds. Sam (release-review) and Lee "
   "(direction only) started deployments anyway, and Globex relied on the environment approval by someone other than the "
   "starter, given on the deployment's own run (approved_by, commit_match). We accept this departure from the declared "
   "design. From Q4, deploys are started by Maya only, until the seam is declared otherwise.")
R={}
for r in csv.DictReader(open(os.path.join(D,'review/exceptions.csv'))):
    k=r['key']
    if k.startswith('seam:'):
        t=S+(" Deploy-v3 shipped the unreviewed PR #4, and Maya's approval did not catch the missing review." if 'deploy-v3' in k else "")
        R[k]=(t,[dep_csv,roster])
    elif k.startswith('trigger:'):
        R[k]=("The declared trigger is a deploy-v* tag from an organization administrator. Globex never configured a tag ruleset, "
              "and every run was started by workflow_dispatch naming the tag. The environment approval was the only gate. "
              "A tag ruleset restricting deploy-v* to administrators is configured for Q4.",[dep_raw,roster])
    elif k.startswith('population:') or k.startswith('unrecorded-emergency:'):
        R[k]=("Control failure, accepted. Sam opened PR #4 at 22:40 UTC on 2026-08-12 and merged it with no approving review, as an "
              "organization administrator bypassing the ruleset's required review (rule suite 1). No break-glass record was made, "
              "and the after-the-fact review the change policy requires was not done. It shipped in deploy-v3 at 23:05 and caused "
              "incident replay-headers. The bypass list was emptied on 2026-08-27, and every later change has an independent approval "
              "on the merged commit.",[chg_csv,chg_raw,inc_hist,snap('2026-08-12','github'),snap('2026-08-27','github')])
    elif k.startswith('check:github-change-review') or k.startswith('check:github-history-protected'):
        R[k]=("Design deficiency, accepted. From the start of the period the ruleset main-protected let organization administrators "
              "(Maya and Sam) always bypass its rules, and the daily check said so every day. No one acted until after incident "
              "replay-headers. The bypass list was emptied on 2026-08-27; the snapshot of that day shows bypass_actors empty.",
              [snap('2026-08-26','github'),snap('2026-08-27','github')])
    elif k.startswith('check:github-rule-bypass'):
        R[k]=("The only bypass in the period is PR #4's merge (rule suite 1). The check failed that night, and no one acted on the alert "
              "until a customer report on 2026-08-26. No other bypass was reported in the period.",[snap('2026-08-12','github'),chg_csv])
    elif k.startswith('check:cloudflare-https'):
        R[k]=("Always Use HTTPS was off on relay.globex.test from 2026-08-19 to 2026-08-21. The daily check failed on 08-19 and 08-20 "
              "and passes from 08-21. The minimum TLS version stayed 1.2 throughout. The change has no record, and we cannot name who "
              "made it without Cloudflare's audit log, which is not in the package. We have no evidence either way about plain-HTTP "
              "traffic during the window.",[snap('2026-08-19','cloudflare'),snap('2026-08-21','cloudflare')])
    elif k.startswith('self-review:'):
        f=one(f"reviews/access/{k.split(':')[1]}.json")
        R[k]=("Sam reviewed this system and kept Sam's own access; no one else reviewed it in Q3. From Q4, Maya reviews Sam's accounts "
              "and Sam reviews Maya's.",[f])
    elif k.startswith('attribution:'):
        R[k]=("Maya recorded this decision of Sam's while setting up the workspace on 2026-06-23, before the period. It was recorded "
              "by the wrong account, and we do not claim otherwise."+(" Sam re-rated R-3 on 2026-08-28 in a pull request from Sam's own "
              "account (review/workspace-history.txt)." if 'R-3' in k else ""),['sources/github/attribution.json'])
    else: print('UNHANDLED',k,file=sys.stderr)
for k,(t,c) in R.items():
    args=['bun','src/cli.ts','audit',W,'q3','exception',k,'--response',t,'--by','maya']
    for x in c:
        if x: args+=['--cite',x]
    print('\x1f'.join(args))
