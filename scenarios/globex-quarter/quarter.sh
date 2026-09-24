# The Globex quarter, day by day on the World clock: each day's events, then that day's daily check run.
source ${0:A:h}/lib.sh
W=$D/compliance; ENV=$(cat $STATE/env-id); n_deploy=0
pr_relay() { local n=$(seed $1 pr relay $2 "$3"); [ -n "$4" ] && seed $4 approve relay $n >/dev/null; seed ${5:-$4} merge relay $n >/dev/null; git -C $D/relay checkout -q main && timeout 30 git -C $D/relay pull -q --no-rebase origin main 2>&1 | grep -v "no common"; echo "relay PR $n by $1 ${4:+approved by $4}"; }
deploy() { n_deploy=$((n_deploy+1)); local t=$(now); GIT_COMMITTER_DATE="$t" git -C $D/relay -c user.name=$1 -c user.email=$1@globex.test tag -a -m "deploy-v$n_deploy" deploy-v$n_deploy && gpush $D/relay deploy-v$n_deploy; seed $2 deploy deploy-v$n_deploy $(tok $3) $ENV; }
record() { # record <person> <login> <approver> <file under records/> <json> <message>
  git -C $D/relay checkout -q main && git -C $D/relay checkout -q -b rec-$(date +%s%N); mkdir -p $(dirname $D/relay/records/$4); printf '%s\n' "$5" > $D/relay/records/$4; git -C $D/relay add records; gcommit $D/relay $1 "$6"; local b=$(git -C $D/relay branch --show-current); gpush $D/relay $b; git -C $D/relay checkout -q main; pr_relay $2 $b "$6" $3; }
completeness() { ed open-autonomy $W completeness --account github --by maya | tail -1; ed open-autonomy $W completeness --account cloudflare --by maya | tail -1; git -C $W add -A; gcommit $W maya "Roster completeness, $(now | cut -c1-10)"; gpush $W main; }
day_events() {
  case $1 in
    2026-07-01) clock ${1}T10:00:00Z; completeness ;;
    2026-07-02) clock ${1}T11:00:00Z; change sam feat/retry-backoff "Exponential backoff on replay retries"; pr_relay sam-gx feat/retry-backoff "Exponential backoff on replay retries" maya-gx ;;
    2026-07-03) clock ${1}T14:00:00Z; deploy sam sam-gx maya-gx ;;
    2026-07-10) clock ${1}T14:00:00Z; git -C $W checkout -q main && git -C $W checkout -q -b maya/risk-assessment-q3
      ed evidence $W --add --control RISK-01,RISK-02 --file registers/risks.csv --title "Quarterly risk assessment: register reviewed, treatments confirmed" --by maya --period 2026-07-01..2026-09-30 | grep -i error
      git -C $W add -A; gcommit $W maya "Q3 risk assessment"; wspr maya-gx maya/risk-assessment-q3 "Q3 risk assessment" sam-gx ;;
    2026-07-15) clock ${1}T10:30:00Z; change maya feat/payload-size "Reject payloads over 1 MB with 413"; pr_relay maya-gx feat/payload-size "Reject payloads over 1 MB with 413" sam-gx ;;
    2026-07-16) clock ${1}T09:00:00Z; deploy maya maya-gx sam-gx ;;
    2026-08-03) clock ${1}T09:30:00Z
      git -C $D/relay checkout -q main && git -C $D/relay checkout -q -b roster/lee
      python3 - $D/relay/.open-autonomy/config.yaml <<'PY'
import json,re,sys
p=sys.argv[1]; s=open(p).read(); m=re.search(r'^team: (.*)$', s, re.M); t=json.loads(m.group(1))
t['members'].append({"id":"lee","name":"Lee Park","github":{"id":"2003","login":"lee-gx"},"scopes":["direction"],"source":"maya"})
open(p,'w').write(s[:m.start(1)]+json.dumps(t)+s[m.end(1):])
PY
      git -C $D/relay add .open-autonomy/config.yaml; gcommit $D/relay maya "Roster: Lee Park joins as an engineer"; gpush $D/relay roster/lee; pr_relay maya-gx roster/lee "Roster: Lee Park joins" sam-gx
      seed - member lee-gx member
      git -C $W checkout -q main && git -C $W checkout -q -b maya/lee-joins; ed register $W people --add id=lee name="Lee Park" role="Engineer" email=lee@globex.test start_date=2026-08-03 | grep -i error; ed open-autonomy $W import --repo $D/relay --by maya | tail -1; git -C $W add -A; gcommit $W maya "Lee Park joins"; wspr maya-gx maya/lee-joins "Lee Park joins" sam-gx ;;
    2026-08-05) zsh $S/onboard.sh lee lee-gx maya-gx ${1}T13:00:00Z "MacBook Air 13 (macOS 26)" | tail -1 ;;
    2026-08-12) clock ${1}T22:40:00Z; change sam fix/signature-header "Hotfix: accept the legacy signature header"; pr_relay sam-gx fix/signature-header "Hotfix: accept the legacy signature header" "" sam-gx
      clock ${1}T23:05:00Z; deploy sam sam-gx maya-gx ;;
    2026-08-19) clock ${1}T16:00:00Z; cfas sam@globex.test always_use_https off ;;
    2026-08-21) clock ${1}T10:00:00Z; cfas maya@globex.test always_use_https on ;;
    2026-08-26) clock ${1}T08:40:00Z
      record maya maya-gx sam-gx incidents/2026-08-26-replay-headers.json '{"kind":"incident","id":"replay-headers","detected_at":"2026-08-26T08:10:00Z","severity":"high","status":"open","summary":"Replay requests can return another customer'"'"'s request headers (never bodies): the replay cache key omits the tenant","notification":"","review":""}' "Incident replay-headers: opened"
      record maya maya-gx sam-gx escalations/2026-08-26-replay-headers.json '{"kind":"escalation","id":"replay-headers-report","received_at":"2026-08-26T08:05:00Z","responded_at":"2026-08-26T08:12:00Z","channel":"community bot","summary":"A customer reported seeing an unfamiliar header in a replayed request"}' "Escalation: replay-headers report answered"
      clock ${1}T12:00:00Z; change maya fix/replay-cache "Key the replay cache on tenant and request id"; pr_relay maya-gx fix/replay-cache "Key the replay cache on tenant and request id" sam-gx
      clock ${1}T12:30:00Z; deploy maya maya-gx sam-gx
      clock ${1}T16:30:00Z
      record maya maya-gx sam-gx incidents/2026-08-26-replay-headers.json '{"kind":"incident","id":"replay-headers","detected_at":"2026-08-26T08:10:00Z","severity":"high","status":"closed","summary":"Replay requests could return another customer'"'"'s request headers (never bodies) because the replay cache key omitted the tenant; introduced by PR #4, deployed 2026-08-12 23:05 UTC (deploy-v3), fixed by PR #7, deployed 2026-08-26 12:30 UTC (deploy-v4)","notification":"Replay logs for 2026-08-12 23:05 to 2026-08-26 12:30 show 3 customers whose replays returned another tenant'"'"'s headers; each was told on 2026-08-26 at 15:00 UTC with the window and the headers involved","review":"Cause: PR #4, a hotfix Sam merged after hours on 2026-08-12 as an organization administrator, bypassing the required review, dropped the tenant from the cache key. Exposure: 13.5 days. Corrective actions: the ruleset'"'"'s administrator bypass is removed (2026-08-27), so every change needs an approving review; the cache keys on tenant and request id; the deploy token is rotated as a precaution."}' "Incident replay-headers: closed with review" ;;
    2026-08-27) clock ${1}T09:30:00Z; seed maya-gx nobypass
      clock ${1}T10:00:00Z; record maya maya-gx sam-gx credentials/2026-08-27-deploy-token.json '{"kind":"credential","id":"deploy-token","at":"2026-08-27T09:50:00Z","by":"maya","custody_name":"CLOUDFLARE_API_TOKEN","action":"rotated","reason":"Rotated after incident replay-headers as a precaution"}' "Credential: deploy token rotated" ;;
    2026-08-28) clock ${1}T10:00:00Z; git -C $W checkout -q main && git -C $W checkout -q -b sam/risk-r3-rescore
      ed register $W risks --update R-3 likelihood=4 description="Two engineers; the 2026-08-12 hotfix bypassed review and caused incident replay-headers. Administrator bypass removed 2026-08-27." | grep -i error
      git -C $W add -A; gcommit $W sam "R-3 re-rated after incident replay-headers"; wspr sam-gx sam/risk-r3-rescore "R-3 re-rated after incident replay-headers" maya-gx ;;
    2026-09-02) clock ${1}T11:00:00Z; change lee feat/replay-filter "Filter replays by status code"; pr_relay lee-gx feat/replay-filter "Filter replays by status code" sam-gx ;;
    2026-09-03) clock ${1}T10:00:00Z; deploy lee lee-gx maya-gx ;;
    2026-09-15) clock ${1}T10:00:00Z; completeness
      git -C $W checkout -q main && git -C $W checkout -q -b sam/access-review-q3; mkdir -p $W/evidence/files/listings
      { echo "account,role"; seed - ghmembers; } > $W/evidence/files/listings/github-globex-members-2026-09-15.csv
      { echo "account,role"; seed - cfmembers; } > $W/evidence/files/listings/cloudflare-members-2026-09-15.csv
      for sys in repository:github-globex-members cloudflare-account:cloudflare-members; do s=${sys%%:*}; l=${sys#*:}
        id=$(ed access-review $W start --system $s --reviewer sam --period 2026-07-01..2026-09-30 --listing evidence/files/listings/$l-2026-09-15.csv --generated-by "$([ $s = repository ] && echo 'GET /orgs/globex/members?role=all and ?role=admin, all pages' || echo 'GET /accounts/{id}/members, all pages')" | grep -o 'AR-[0-9a-f-]*')
        args=(); for acct in $(tail -n +2 $W/evidence/files/listings/$l-2026-09-15.csv | cut -d, -f1); do args+=(--decide $acct=keep --person $acct=${${acct%%-gx}%%@globex.test}); done
        ed access-review $W $id ${args[@]} | tail -1; ed access-review $W $id --sign-off --by sam | tail -1; done
      git -C $W add -A; gcommit $W sam "Q3 access reviews: GitHub organization and Cloudflare account"; wspr sam-gx sam/access-review-q3 "Q3 access reviews" maya-gx ;;
  esac
}
d=2026-06-26
while [ "$d" != "2026-10-01" ]; do
  day_events $d
  clock ${d}T23:30:00Z; (cd $ED && timeout 120 $V attach evidence-desk-oa --root $RT -- env GITHUB_TOKEN=$(tok maya-gx) bun src/cli.ts run $W --by maya 2>&1 | grep -v WARN | grep -E "fail|error" | sed "s/^/$d /")
  # The daily workflow commits each run to the workspace's main on its day, as the workspace's scheduled job does.
  git -C $W checkout -q main; git -C $W add checks evidence; gcommit $W maya "Daily checks $d" && gpush $W main
  d=$(python3 -c "import datetime;print((datetime.date.fromisoformat('$d')+datetime.timedelta(days=1)).isoformat())")
done
git -C $W checkout -q main; git -C $W add -A; gcommit $W maya "Daily checks through 2026-09-30"; gpush $W main
echo QUARTER-DONE
