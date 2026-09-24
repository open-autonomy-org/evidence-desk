# The Globex quarter, day by day on the World clock: each day's events, then that day's daily check run.
source ${0:A:h}/lib.sh
W=$D/compliance; ENV=$(cat $STATE/env-id); n_deploy=0
pr_relay() { local n=$(seed $1 pr relay $2 "$3"); seed - ci relay $n >/dev/null; [ -n "$4" ] && seed $4 approve relay $n >/dev/null; seed ${5:-$4} merge relay $n >/dev/null; git -C $D/relay checkout -q main && timeout 30 git -C $D/relay pull -q --no-rebase origin main 2>&1 | grep -v "no common"; echo "relay PR $n by $1 ${4:+approved by $4}"; }
deploy() { n_deploy=$((n_deploy+1)); local t=$(now); GIT_COMMITTER_DATE="$t" git -C $D/relay -c user.name=$1 -c user.email=$1@globex.test tag -a -m "deploy-v$n_deploy" deploy-v$n_deploy && gpush $D/relay deploy-v$n_deploy; (cd $ED && timeout 60 $V attach evidence-desk-oa --root $RT -- env CF_AS=$(cat $STATE/cftok-deploy@globex.test) bun $S/seed.ts deploy $(tok $2) deploy-v$n_deploy $(tok $3) $ENV 2>&1 | grep -v WARN); }
record() { # record <person> <login> <approver> <file under records/> <json> <message>
  git -C $D/relay checkout -q main && git -C $D/relay checkout -q -b rec-$(date +%s%N); mkdir -p $(dirname $D/relay/records/$4); printf '%s\n' "$5" > $D/relay/records/$4; git -C $D/relay add records; gcommit $D/relay $1 "$6"; local b=$(git -C $D/relay branch --show-current); gpush $D/relay $b; git -C $D/relay checkout -q main; pr_relay $2 $b "$6" $3; }
# evdoc <person> <login> <approver> <controls> <file name> <title> <text>: a document a person keeps as evidence, added
# to the workspace in their own pull request
evdoc() { git -C $W checkout -q main && git -C $W checkout -q -b $1/ev-$(date +%s%N); mkdir -p $STATE/docs; printf '%s\n' "$7" > $STATE/docs/$5
  ed evidence $W --add --control $4 --file $STATE/docs/$5 --title "$6" --by $1 | grep -i error; git -C $W add -A; gcommit $W $1 "$6"; wspr $2 $(git -C $W branch --show-current) "$6" $3 >/dev/null; echo "evidence: $6"; }
# audit <date> <findings JSON array>: the internal-audit job's weekly run, landed by the agent through the reviewed flow
audit() { local id=$1-internal-audit f=$2 items=''; for c in 1 2 3 4 5 6 7 8 9 10; do local st=pass; [[ "$f" == *"C$c:"* ]] && st=finding; items+="{\"item\":\"C$c\",\"status\":\"$st\",\"detail\":\"checked against main\"},"; done
  clock ${1}T07:00:00Z; git -C $D/relay checkout -q main && timeout 30 git -C $D/relay pull -q --no-rebase origin main 2>&1 | grep -v "no common"; git -C $D/relay checkout -q -b audit-$1; mkdir -p $D/relay/records/internal-audits
  printf '{"kind":"internal-audit","id":"%s","at":"%sT07:00:00Z","commit":"%s","items":[%s],"findings":%s}\n' $id $1 $(git -C $D/relay rev-parse main) "${items%,}" "$f" > $D/relay/records/internal-audits/$id.json
  git -C $D/relay add records; gcommit $D/relay globex-dev "Internal audit $1"; gpush $D/relay audit-$1; git -C $D/relay checkout -q main; pr_relay globex-dev audit-$1 "Internal audit $1" globex-review >/dev/null; echo "audit $1"; }
completeness() { ed open-autonomy $W completeness --account github --by maya | tail -1; ed open-autonomy $W completeness --account cloudflare --by maya | tail -1; git -C $W add -A; gcommit $W maya "Roster completeness, $(now | cut -c1-10)"; gpush $W main; }
day_events() {
  case $1 in
    2026-07-01) clock ${1}T10:00:00Z; completeness ;;
    2026-07-02) clock ${1}T11:00:00Z; change sam feat/retry-backoff "Exponential backoff on replay retries"; pr_relay sam-gx feat/retry-backoff "Exponential backoff on replay retries" maya-gx ;;
    2026-07-03) clock ${1}T14:00:00Z; deploy maya maya-gx sam-gx ;;
    2026-07-08) clock ${1}T10:00:00Z
      evdoc maya maya-gx sam-gx VND-02,VND-03 vendor-assurance-2026-07-08.md "Vendor assurance review: Cloudflare and GitHub" "# Vendor assurance review, 2026-07-08
Cloudflare: SOC 2 Type II report for 2025-04-01 to 2026-03-31 reviewed, no exceptions affecting Workers or Durable Objects; bridge letter to 2026-06-30 obtained; complementary user entity controls mapped: two-factor for members (checked daily), least-privilege API tokens, TLS settings (checked daily). GitHub: SOC 2 Type II report for the same period reviewed, no exceptions affecting repositories or Actions; CUECs: two-factor (checked daily), branch rules (checked daily). DPAs in place with both."
      evdoc maya maya-gx sam-gx GOV-07,GOV-06 customer-commitments.md "Customer commitments and the security reporting channel" "# Customer commitments
Terms of Service and the Data Processing Addendum (published at relay.globex.test/legal): TLS 1.2+ and HTTPS only; payloads kept 30 days; 99.9% monthly availability; incident notification within 72 hours of confirmation. Reporting channel: security@globex.test and SECURITY.md in the relay repository, answered through the community bot and recorded under records/escalations/."
      evdoc maya maya-gx sam-gx HR-06 roles-and-responsibilities.md "Security roles and responsibilities" "# Roles
Maya Chen, owner: security program, policies, production deploys, access and vendor reviews. Sam Okafor, engineer: release review, change review, access review of Maya's accounts. Lee Park (from 2026-08-03), engineer: direction. Agents: development and the weekly internal audit, through reviewed pull requests only." ;;
    2026-07-10) clock ${1}T14:00:00Z; git -C $W checkout -q main && git -C $W checkout -q -b maya/risk-assessment-q3
      ed evidence $W --add --control RISK-01,RISK-02 --file registers/risks.csv --title "Quarterly risk assessment: register reviewed, treatments confirmed" --by maya --period 2026-07-01..2026-09-30 | grep -i error
      git -C $W add -A; gcommit $W maya "Q3 risk assessment"; wspr maya-gx maya/risk-assessment-q3 "Q3 risk assessment" sam-gx ;;
    2026-07-15) clock ${1}T10:30:00Z; change maya feat/payload-size "Reject payloads over 1 MB with 413"; pr_relay maya-gx feat/payload-size "Reject payloads over 1 MB with 413" sam-gx ;;
    2026-07-16) clock ${1}T09:00:00Z; deploy maya maya-gx sam-gx ;;
    2026-07-22) clock ${1}T15:00:00Z; evdoc maya maya-gx sam-gx OPS-02 ir-tabletop-2026-07-22.md "Incident response tabletop: leaked customer API key" "# Incident response tabletop, 2026-07-22
Participants: Maya Chen, Sam Okafor. Scenario: a customer's API key is posted publicly. Walked the incident runbook: detection via the community bot, containment (revoke the key, rotate the customer's keys), notification within 72 hours, record under records/incidents/. Gaps found: no template for the customer notice (added to the runbook the same day). Duration 50 minutes." ;;
    2026-07-29) clock ${1}T11:00:00Z; evdoc maya maya-gx sam-gx CONF-01,CONF-02 data-handling.md "Data classification and retention for Relay" "# Data classification and retention
Customer webhook payloads and their headers: confidential; stored in Durable Objects, encrypted at rest by Cloudflare; retained 30 days, then deleted by the expiry alarm (payload-store ADR). Inbox configuration: internal. API keys: stored hashed. Account contact emails: confidential, kept while the account is open and deleted 30 days after closure." ;;
    2026-07-31) clock ${1}T18:00:00Z; evdoc maya maya-gx sam-gx OPS-06 uptime-2026-07.csv "Relay availability, July 2026 (external monitor export)" "month,checks,failed,availability,longest_outage_minutes
2026-07,44640,4,99.991%,2" ;;
    2026-08-03) clock ${1}T09:30:00Z
      git -C $D/relay checkout -q main && git -C $D/relay checkout -q -b roster/lee
      python3 - $D/relay/.open-autonomy/config.yaml <<'PY'
import json,re,sys
p=sys.argv[1]; s=open(p).read(); m=re.search(r'^team: (.*)$', s, re.M); t=json.loads(m.group(1))
t['members'].append({"id":"lee","name":"Lee Park","github":{"id":"2003","login":"lee-gx"},"scopes":["direction"],"source":"maya"})
open(p,'w').write(s[:m.start(1)]+json.dumps(t)+s[m.end(1):])
PY
      git -C $D/relay add .open-autonomy/config.yaml; gcommit $D/relay maya "Roster: Lee Park joins as an engineer"; gpush $D/relay roster/lee; pr_relay maya-gx roster/lee "Roster: Lee Park joins" sam-gx
      git -C $W checkout -q main && git -C $W checkout -q -b maya/lee-joins; ed register $W people --add id=lee name="Lee Park" role="Engineer" email=lee@globex.test start_date=2026-08-03 | grep -i error; ed open-autonomy $W import --repo $D/relay --by maya | tail -1; git -C $W add -A; gcommit $W maya "Lee Park joins"; wspr maya-gx maya/lee-joins "Lee Park joins" sam-gx ;;
    2026-08-07) clock ${1}T10:00:00Z; evdoc sam sam-gx maya-gx AC-08,AC-07 network-and-disposal.md "Network boundary and disposal" "# Network boundary and disposal
Relay has no servers or office network: requests reach it only through Cloudflare's edge (zone relay.globex.test), where TLS 1.2+ and HTTPS-only are enforced and checked daily. Outbound calls from the deploy workflow are limited to its egress allow-list. There is no company hardware holding customer data; engineers' laptops hold none (device attestations). Customer data is disposed of by the 30-day expiry and on account closure." ;;
    2026-08-05) zsh $S/onboard.sh lee lee-gx maya-gx ${1}T13:00:00Z "MacBook Air 13 (macOS 26)" | tail -1
      # GitHub access once the agreements are signed.
      clock ${1}T14:00:00Z; seed - member lee-gx member ;;
    2026-08-12) clock ${1}T22:40:00Z; change sam fix/signature-header "Hotfix: accept the legacy signature header"; clock ${1}T22:50:00Z; pr_relay sam-gx fix/signature-header "Hotfix: accept the legacy signature header" maya-gx
      clock ${1}T23:05:00Z; deploy maya maya-gx sam-gx ;;
    2026-08-14) clock ${1}T10:00:00Z; evdoc maya maya-gx sam-gx AC-11 customer-data-access.md "Who can read customer data" "# Customer data access, 2026-08-14
Customer payloads are readable only through Relay's API with the customer's own key, and by the two engineers with Cloudflare account access (Maya Chen, Sam Okafor) for support and incident response. The deploy service account (deploy@globex.test) can deploy Workers but has no data access. Agents have no Cloudflare access." ;;
    2026-08-19) clock ${1}T16:00:00Z; cfas sam@globex.test always_use_https off ;;
    2026-08-20) clock ${1}T15:00:00Z; record maya maya-gx sam-gx restore-tests/2026-08-20-payload-store.json '{"kind":"restore-test","id":"payload-store-2026-08-20","at":"2026-08-20T15:00:00Z","by":"maya","store":"payload Durable Objects","backup_taken_at":"2026-08-20T00:00:00Z","restored_to":"a scratch namespace","result":"passed","duration_minutes":34,"notes":"1,000 sampled payloads compared byte for byte"}' "Restore test: payload store" ;;
    2026-08-21) clock ${1}T10:00:00Z; cfas maya@globex.test always_use_https on ;;
    2026-08-26) clock ${1}T08:40:00Z
      record maya maya-gx sam-gx incidents/2026-08-26-replay-headers.json '{"kind":"incident","id":"replay-headers","detected_at":"2026-08-26T08:10:00Z","severity":"high","status":"open","summary":"Replay requests can return another customer'"'"'s request headers (never bodies): the replay cache key omits the tenant","notification":"","review":""}' "Incident replay-headers: opened"
      record maya maya-gx sam-gx escalations/2026-08-26-replay-headers.json '{"kind":"escalation","id":"replay-headers-report","received_at":"2026-08-26T08:05:00Z","responded_at":"2026-08-26T08:12:00Z","channel":"community bot","summary":"A customer reported seeing an unfamiliar header in a replayed request"}' "Escalation: replay-headers report answered"
      clock ${1}T12:00:00Z; change maya fix/replay-cache "Key the replay cache on tenant and request id"; pr_relay maya-gx fix/replay-cache "Key the replay cache on tenant and request id" sam-gx
      clock ${1}T12:30:00Z; deploy maya maya-gx sam-gx ;;
    2026-08-27) clock ${1}T09:30:00Z; change sam test/tenant-isolation "Regression test: replays never cross tenants"; pr_relay sam-gx test/tenant-isolation "Regression test: replays never cross tenants" maya-gx
      clock ${1}T09:50:00Z; seed - cftoken deploy@globex.test > $STATE/cftok-deploy@globex.test; seed maya-gx secret CLOUDFLARE_API_TOKEN
      clock ${1}T10:00:00Z; record maya maya-gx sam-gx credentials/2026-08-27-deploy-token.json '{"kind":"credential","id":"deploy-token","at":"2026-08-27T09:50:00Z","by":"maya","custody_name":"CLOUDFLARE_API_TOKEN","action":"rotated","reason":"Rotated after incident replay-headers as a precaution: a new token for the deploy@globex.test service account replaced its previous one"}' "Credential: deploy token rotated"
      clock ${1}T11:00:00Z
      record maya maya-gx sam-gx incidents/2026-08-26-replay-headers.json '{"kind":"incident","id":"replay-headers","detected_at":"2026-08-26T08:10:00Z","severity":"high","status":"closed","summary":"Replay requests could return another customer'"'"'s request headers (never bodies) because the replay cache key omitted the tenant; introduced by the signature-header hotfix (reviewed and approved by Maya after hours), deployed 2026-08-12 23:05 UTC (deploy-v3); fixed by the replay-cache change, deployed 2026-08-26 12:30 UTC (deploy-v4)","notification":"Replay logs for 2026-08-12 23:05 to 2026-08-26 12:30 show 3 customers whose replayed requests carried another tenant'"'"'s headers, and 2 tenants whose headers were exposed; all 5 were told on 2026-08-26 at 15:00 UTC with the window and the headers involved","review":"Cause: the hotfix changed the cache key and no test covered tenant isolation; review did not catch it. Exposure: 13.5 days. Done before closing: the cache keys on tenant and request id (deploy-v4), a regression test for tenant isolation runs in the CI test job (merged 2026-08-27), and the deploy service account'"'"'s token was rotated."}' "Incident replay-headers: closed with review" ;;
    2026-08-28) clock ${1}T10:00:00Z; git -C $W checkout -q main && git -C $W checkout -q -b maya/risk-r3-rescore
      ed register $W risks --update R-3 likelihood=3 description="Two engineers review each other; the 2026-08-12 hotfix passed review with a tenant-isolation bug (incident replay-headers). A tenant-isolation regression test now runs in CI." | grep -i error
      git -C $W add -A; gcommit $W maya "R-3 re-rated after incident replay-headers"; wspr maya-gx maya/risk-r3-rescore "R-3 re-rated after incident replay-headers" sam-gx ;;
    2026-08-31) clock ${1}T18:00:00Z; evdoc maya maya-gx sam-gx OPS-06 uptime-2026-08.csv "Relay availability, August 2026 (external monitor export)" "month,checks,failed,availability,longest_outage_minutes
2026-08,44640,9,99.980%,4" ;;
    2026-09-02) clock ${1}T11:00:00Z; change lee feat/replay-filter "Filter replays by status code"; pr_relay lee-gx feat/replay-filter "Filter replays by status code" sam-gx ;;
    2026-09-03) clock ${1}T10:00:00Z; deploy maya maya-gx sam-gx ;;
    2026-09-05) clock ${1}T16:00:00Z; evdoc maya maya-gx sam-gx MON-02 pentest-2026-09.md "Penetration test of Relay, September 2026 (summary)" "# Penetration test summary
Tester: Northwind Security (independent). Window: 2026-08-31 to 2026-09-04. Scope: Relay API and webhook intake at relay.globex.test. Findings: 0 critical, 0 high, 1 medium (verbose error on malformed signature header; fixed before the retest), 2 low (accepted: rate-limit headers disclose limits; missing security.txt expiry). Retest of the medium finding passed 2026-09-12." ;;
    2026-09-08) clock ${1}T14:00:00Z; evdoc sam sam-gx maya-gx OPS-07 dr-exercise-2026-09-08.md "Disaster recovery exercise: loss of the payload namespace" "# Disaster recovery exercise, 2026-09-08
Scenario: the payload Durable Objects namespace is deleted. Steps: restore from the latest backup into a new namespace (per the 2026-08-20 restore test), point a scratch copy of the Worker at it and replay a day of test traffic; production was not touched. Recovery time 48 minutes against a 4-hour objective; data loss up to the last backup (objective 24 hours). Follow-up: none." ;;
    2026-09-10) clock ${1}T18:20:00Z; (cd $ED && timeout 60 $V attach evidence-desk-oa --root $RT -- env CF_AS=$(cat $STATE/cftok-sam@globex.test) bun $S/seed.ts wrangler - "raise the replay limit (from Sam's laptop)" 2>&1 | grep -v WARN) ;;
    2026-09-11) clock ${1}T10:00:00Z; change sam fix/replay-limit "Raise the replay limit (the change deployed from a laptop on 2026-09-10)"; pr_relay sam-gx fix/replay-limit "Raise the replay limit (the change deployed from a laptop on 2026-09-10)" maya-gx
      clock ${1}T11:00:00Z; deploy maya maya-gx sam-gx
      clock ${1}T11:30:00Z; record sam sam-gx maya-gx break-glass/2026-09-10-replay-limit.json '{"kind":"break-glass","id":"replay-limit","at":"2026-09-10T18:20:00Z","by":"sam","change":"Raised the replay limit by deploying the relay Worker from a laptop with a personal Cloudflare token","reason":"A customer'"'"'s replay backlog was failing and the next deploy window was a day away","reviewed_after":"the pull request Raise the replay limit, merged 2026-09-11, which carries the same change through review, deployed as deploy-v6 at 11:00 UTC"}' "Break-glass: replay limit deployed from a laptop" ;;
    2026-09-15) clock ${1}T10:00:00Z; completeness
      mkdir -p $W/evidence/files/listings
      { echo "account,role"; seed - ghmembers; } > $STATE/github-all.csv; { echo "account,role"; seed - cfmembers; } > $STATE/cloudflare-all.csv
      # Each reviewer decides everyone's access but their own; the other owner reviews the reviewer's own accounts.
      for sys in repository:github cloudflare-account:cloudflare; do s=${sys%%:*}; v=${sys#*:}
        for who in sam maya; do git -C $W checkout -q main; git -C $W checkout -q $who/access-review-q3 2>/dev/null || git -C $W checkout -q -b $who/access-review-q3
          l=evidence/files/listings/$v-members-2026-09-15-for-$who.csv; mkdir -p $W/evidence/files/listings
          if [ $who = sam ]; then { head -1 $STATE/$v-all.csv; tail -n +2 $STATE/$v-all.csv | grep -v "^sam"; } > $W/$l; how="the full member list, less the reviewer's own accounts (reviewed by maya)"
          else { head -1 $STATE/$v-all.csv; tail -n +2 $STATE/$v-all.csv | grep "^sam"; } > $W/$l; how="the reviewer sam's own accounts from the full member list"; fi
          id=$(ed access-review $W start --system $s --reviewer $who --period 2026-07-01..2026-09-30 --listing $l --generated-by "$([ $s = repository ] && echo 'GET /orgs/globex/members?role=all and ?role=admin, all pages' || echo 'GET /accounts/{id}/members, all pages'): $how" | grep -o 'AR-[0-9a-f-]*')
          args=(); for acct in $(tail -n +2 $W/$l | cut -d, -f1); do p=${${acct%%-gx}%%@globex.test}; case $p in maya|sam|lee) ;; *) p= ;; esac; args+=(--decide $acct=keep); [ -n "$p" ] && args+=(--person $acct=$p); done
          ed access-review $W $id ${args[@]} | tail -1; ed access-review $W $id --sign-off --by $who | tail -1
          git -C $W add -A; gcommit $W $who "Q3 access review of $v by $who"
        done; done
      # Each reviewer's sign-offs land in their own pull request.
      wspr sam-gx sam/access-review-q3 "Q3 access reviews by sam" maya-gx; wspr maya-gx maya/access-review-q3 "Q3 access review of sam's accounts" sam-gx ;;
    2026-09-25) clock ${1}T15:00:00Z; evdoc maya maya-gx sam-gx GOV-03,MON-01 management-review-2026-09-25.md "Quarterly management review of the security program" "# Management review, 2026-09-25
Attendees: Maya Chen (owner), Sam Okafor. Reviewed: the thirteen internal audits of the quarter and their one finding (C6, closed by the 2026-08-20 restore test); incident replay-headers and its corrective actions; the break-glass deploy of 2026-09-10; daily check failures (HTTPS-only off 2026-08-19 to 2026-08-21); availability 99.98%; the penetration test. Decisions for Q4: Sam's personal Cloudflare access to be reduced to read-only, so that only the deploy service account can deploy; next restore test due by 2026-11-20." ;;
    2026-09-29) clock ${1}T11:00:00Z; evdoc maya maya-gx sam-gx GOV-08 description-review-2026-09-29.md "System description reviewed against the system" "# System description review, 2026-09-29
The owner read the draft description against the repository at main, the accepted ADRs and the vendor list; changes since the last review: the deploy service account, the tenant-isolation test, the restore-test seam." ;;
    2026-09-30) clock ${1}T18:00:00Z; evdoc maya maya-gx sam-gx OPS-06 uptime-2026-09.csv "Relay availability, September 2026 (external monitor export)" "month,checks,failed,availability,longest_outage_minutes
2026-09,43200,3,99.993%,1" ;;
  esac
}
d=2026-06-26
while [ "$d" != "2026-10-01" ]; do
  day_events $d
  # The internal audit runs every Monday; the 2026-08-17 run finds no restore test yet this quarter.
  if [ "$(python3 -c "import datetime;print(datetime.date.fromisoformat('$d').weekday())")" = 0 ]; then
    [ $d = 2026-08-17 ] && audit $d '["C6: no restore test is recorded this quarter for the payload store"]' || audit $d '[]'; fi
  clock ${d}T23:30:00Z; (cd $ED && timeout 120 $V attach evidence-desk-oa --root $RT -- env GITHUB_TOKEN=$(tok maya-gx) bun src/cli.ts run $W --by maya 2>&1 | grep -v WARN | grep -E "fail|error" | sed "s/^/$d /")
  # The daily workflow commits each run to the workspace's main on its day, as the workspace's scheduled job does.
  git -C $W checkout -q main; git -C $W add checks evidence; gcommit $W maya "Daily checks $d" && gpush $W main
  d=$(python3 -c "import datetime;print((datetime.date.fromisoformat('$d')+datetime.timedelta(days=1)).isoformat())")
done
git -C $W checkout -q main; git -C $W add -A; gcommit $W maya "Daily checks through 2026-09-30"; gpush $W main
echo QUARTER-DONE
