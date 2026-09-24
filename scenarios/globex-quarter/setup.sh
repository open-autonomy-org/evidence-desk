# Globex from nothing: a fresh World, the organization, Cloudflare, the project and the workspace (15-22 June).
source ${0:A:h}/lib.sh
# The World's config names the twins in TWIN_CHECKOUT; an empty env file when the machine has none.
mkdir -p $RT/evidence-desk-oa; sed "s|\${TWIN_CHECKOUT}|${TWIN_CHECKOUT:?set TWIN_CHECKOUT to a volter-ai/twin checkout}|g" $S/world.config.json > $RT/evidence-desk-oa/world.config.json; touch $RT/evidence-desk-oa/app.env
timeout 60 $V down evidence-desk-oa --root $RT 2>&1 | tail -1
timeout 90 $V up $RT/evidence-desk-oa/world.config.json --name evidence-desk-oa --env-file $RT/evidence-desk-oa/app.env --root $RT --owner globex-quarter 2>&1 | tail -1
clock 2026-06-15T09:00:00Z; seed - org; for u in maya-gx sam-gx lee-gx globex-dev globex-review; do seed - token $u > $STATE/tok-$u; done
seed - member globex-dev member; seed - member globex-review member
seed - cf; for u in maya sam deploy; do seed - cftoken $u@globex.test > $STATE/cftok-$u@globex.test; done
cfas maya@globex.test min_tls_version 1.2; cfas maya@globex.test always_use_https on
rm -rf $D && mkdir -p $D
# The project from the published kit, as anyone creates one; its setup source supplies the deploy workflow.
KIT=create-open-autonomy@${KIT_VERSION:-3.3.0}
[ -f $STATE/$KIT/package/src/setup.ts ] || { mkdir -p $STATE/$KIT && curl -sL $(npm view $KIT dist.tarball) | tar xz -C $STATE/$KIT; }
# KIT_CHECKOUT builds from an open-autonomy checkout instead (a template not yet published).
if [ -n "$KIT_CHECKOUT" ]; then KITSRC=$KIT_CHECKOUT/packages/kit-hermes/src; timeout 120 bun $KITSRC/cli.ts create $D/relay --project relay --account globex/relay --skew soc2 | head -1
else KITSRC=$STATE/$KIT/package/src; timeout 120 bunx $KIT create $D/relay --project relay --account globex/relay --skew soc2 | head -1; fi
[ -f $D/relay/.open-autonomy/config.yaml ] || { echo "error: $KIT did not create the relay project"; exit 1; }
python3 - $D/relay $KITSRC/setup.ts <<'PY'
import json,re,sys,os
R,src=sys.argv[1],sys.argv[2]
p=R+'/.open-autonomy/config.yaml'; s=open(p).read()
team={"members":[{"id":"maya","name":"Maya Chen","github":{"id":"2001","login":"maya-gx"},"scopes":["owner","direction","release-review"],"source":"owner"},
 {"id":"sam","name":"Sam Okafor","github":{"id":"2002","login":"sam-gx"},"scopes":["direction","release-review"],"source":"maya"}]}
s=re.sub(r'^team: .*$', 'team: '+json.dumps(team), s, count=1, flags=re.M)
m=re.search(r'^seams: (.*)$', s, re.M); d=json.loads(m.group(1))
d['vendor_accounts']=[{"id":"github","vendor":"github","account":"globex"},{"id":"cloudflare","vendor":"cloudflare","account":"e"*32}]
s=s[:m.start(1)]+json.dumps(d)+s[m.end(1):]; open(p,'w').write(s)
t=open(src).read(); a=t.index("const DEPLOY_YML = `")+len("const DEPLOY_YML = `"); b=t.index("`;\n",a)
os.makedirs(R+'/.github/workflows',exist_ok=True)
open(R+'/.github/workflows/deploy.yml','w').write(t[a:b].replace('\\${','${').replace('\\`','`').replace('__PROJECT__','relay'))
open(R+'/wrangler.toml','w').write('name = "relay"\nmain = "src/index.ts"\ncompatibility_date = "2026-06-01"\n')
PY
# Relay's first decision of its own: where customer payloads live, answering the SOC 2 checklist.
[ -f $D/relay/docs/decisions/SOC2-CHECKLIST.md ] && cat > $D/relay/docs/decisions/0002-payload-store.md <<'ADR'
# 0002: Customer payloads in Durable Objects

Status: Accepted

## Context

Relay stores each customer's webhooks for 30 days so they can be replayed.

## Decision

Payloads live in Cloudflare Durable Objects, one object per customer inbox, with a 30-day expiry alarm.

## Alternatives

A hosted Postgres (another vendor, another credential) and R2 (no per-inbox consistency) were rejected.

## Consequences

Cloudflare becomes the store's subservice organization; restores go through Cloudflare's backup export.

## SOC 2 checklist

- C1 Change path: unchanged; the store ships through the reviewed flow and the deploy-v* path.
- C2 Credentials: no new credential; the Worker's binding needs none, and the deploy token stays the service account's.
- C3 Vendors: Cloudflare, already declared; no new egress.
- C4 Data: payloads and headers are confidential, encrypted at rest by Cloudflare, kept 30 days, deleted by the expiry alarm.
- C5 Availability: served by the relay Worker's health endpoint and its external monitor.
- C6 Backup and restore: a daily backup export; a restore test each quarter under records/restore-tests/.
- C7 Logging and alerting: store errors go to Workers logs; the monitor alerts Maya.
- C8 Access: only the Worker and the two engineers with Cloudflare access can read payloads.
- C9 Incidents and emergency changes: a data exposure is an incident under records/incidents/.
- C10 Evidence: the restore-test records, the monitor's monthly export and the TLS checks.
ADR
git -C $D/relay init -q -b main && git -C $D/relay add -A && gcommit $D/relay maya "Relay from the Open Autonomy soc2 template: roster, seams, production door"
U=$($V url evidence-desk-oa github --root $RT); git -C $D/relay remote add origin $U/globex/relay.git && gpush $D/relay main
seed maya-gx protect | sed -n 's/^env //p' > $STATE/env-id; echo "env $(cat $STATE/env-id)"
seed maya-gx secret CLOUDFLARE_API_TOKEN
clock 2026-06-22T10:00:00Z; W=$D/compliance
ed init $W --org "Globex" | head -1; ed open-autonomy $W import --repo $D/relay --by maya | tail -1
ed scope $W --set services="Relay: receives customers' webhooks, stores them for 30 days and replays them on request" infrastructure="Cloudflare Workers and Durable Objects (global)" security_contact=security@globex.test availability=true confidentiality=true processing_integrity=false privacy=false hosts_customer_data=true has_office=false background_checks_required=false | tail -1
ed adopt $W | tail -1; ed open-autonomy $W import --repo $D/relay --by maya | tail -1
ed register $W people --update maya email=maya@globex.test start_date=2026-06-01 | grep -i error; ed register $W people --update sam email=sam@globex.test start_date=2026-06-01 | grep -i error
ed register $W systems --add id=agent-dev name="globex-dev" kind="agent account" description="The development agent's GitHub account: opens pull requests, never merges without an independent review" data="none" in_scope=yes | grep -i error
ed register $W systems --add id=agent-review name="globex-review" kind="agent account" description="The review agent's GitHub account: reviews and lands pull requests" data="none" in_scope=yes | grep -i error
ed register $W systems --add id=deploy-account name="deploy@globex.test" kind="service account" description="The Cloudflare account the deploy workflow's token belongs to (Workers Admin): its login is kept in the owner's password manager, used only to issue the token the deploy workflow holds" data="none" in_scope=yes | grep -i error
ed register $W systems --add id=cloudflare-account name="Cloudflare account (globex-cloudflare)" kind="hosting and edge" description="Runs the Relay workers and holds customer payloads" data="customer webhook payloads" in_scope=yes | grep -i error
git -C $W init -q -b main && git -C $W add -A && gcommit $W maya "Globex compliance workspace: scoped and adopted"
git -C $W remote add origin $U/globex/compliance.git && gpush $W main
[ -f $W/evidence-desk.json ] || { echo "error: the compliance workspace was not created"; exit 1; }
echo SETUP-DONE
