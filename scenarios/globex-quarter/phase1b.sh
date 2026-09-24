source ${0:A:h}/lib.sh
W=$D/compliance
clock 2026-06-23T09:30:00Z
git -C $W checkout -q -b maya/program-setup
for c in $(python3 -c "
import json,glob
for f in sorted(glob.glob('$W/controls/*.json')):
  d=json.load(open(f))
  if d.get('applicable'): print(d['id'])"); do
  case $c in CHG-*|AC-03|AC-04|MON-03) o=sam;; *) o=maya;; esac
  ed control $W $c --owner $o --status implemented | grep -i error
done
for p in $(ls $W/policies/*.md | xargs -n1 basename | sed 's/\.md$//'); do
  ed policy $W $p --owner maya | grep -i error
  # Maya adapts each template to Globex: the drafting comment goes, and the "Security team" is the two people who are it.
  python3 - $W/policies/$p.md <<'PY'
import re,sys
f=sys.argv[1]; t=open(f).read()
t=re.sub(r'<!-- Template adapted from[^>]*-->\n?', '', t)
t=re.sub(r'\b[Tt]he Security [Tt]eam\b', 'the security owners (Maya Chen and Sam Okafor)', t)
t=re.sub(r'\bSecurity [Tt]eam\b', 'security owners', t)
open(f,'w').write(t)
PY
  ed policy $W $p --approve --by maya | grep -iv "^Approved"
done
ed register $W risks --add id=R-1 title="A leaked API key exposes customer payloads" description="Keys are issued per customer; a leaked key reads that customer's stored payloads" likelihood=2 impact=4 treatment=mitigate "controls=AC-05;AC-11" owner=maya status=treated review_due=2027-06-23 | grep -i error
ed register $W risks --add id=R-2 title="A Cloudflare outage stops webhook intake" description="Intake depends on one provider" likelihood=2 impact=3 treatment=accept "controls=OPS-07" owner=maya status=treated review_due=2027-06-23 | grep -i error
ed register $W risks --add id=R-3 title="An unreviewed change reaches production" description="Two engineers; a hotfix could skip review" likelihood=2 impact=4 treatment=mitigate "controls=CHG-01;CHG-03" owner=maya status=treated review_due=2027-06-23 | grep -i error
ed register $W vendors --update cloudflare owner=maya criticality=high data_access="customer webhook payloads" assurance="SOC 2 Type II report 2025-04-01 to 2026-03-31, reviewed; no exceptions relevant to Relay" last_review=2026-06-23 | grep -i error
ed register $W vendors --update github owner=maya criticality=high data_access="source code; no customer data" assurance="SOC 2 Type II report 2025-04-01 to 2026-03-31, reviewed" last_review=2026-06-23 | grep -i error
ed register $W vendors --update open-autonomy-platform-model-valve-and-books owner=maya criticality=medium data_access="none; meters development agents' model use" assurance="security overview reviewed" last_review=2026-06-23 | grep -i error
ed register $W vendors --update npm owner=maya criticality=low data_access="none; serves pinned dependencies" assurance="public registry; dependencies pinned by lockfile" last_review=2026-06-23 | grep -i error
ed evidence $W --add --control VND-01,VND-02 --file registers/vendors.csv --title "Annual vendor reviews: criticality, data access and assurance of each vendor" --by maya | grep -i error
ed collectors $W github --enable --set org=globex repos=globex/relay | grep -i error
ed collectors $W cloudflare --enable --set account=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee | grep -i error
ed validate $W | tail -1
git -C $W add -A && gcommit $W maya "Program setup: owners, approved policies, risk assessment, vendor reviews, collectors"
wspr maya-gx maya/program-setup "Program setup" sam-gx
echo PHASE1B-DONE
