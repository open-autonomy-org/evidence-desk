# After the period: collections (2 October), the engagement, drafts, responses, and the package (5 October).
source ${0:A:h}/lib.sh
W=$D/compliance; Q=2026-07-01..2026-09-30; OUT=${PACKAGE_OUT:-$STATE/package}
asmaya() { (cd $ED && timeout 180 $V attach evidence-desk-oa --root $RT -- env GITHUB_TOKEN=$(tok maya-gx) bun src/cli.ts "$@" 2>&1 | grep -v WARN); }
# The external monitor's September export, taken once the month is over.
clock 2026-10-01T09:00:00Z; evdoc maya maya-gx sam-gx OPS-06 uptime-2026-09.csv "Relay availability, September 2026 (external monitor export)" "month,checks,failed,availability,longest_outage_minutes
2026-09,43200,3,99.993%,1"
clock 2026-10-02T10:00:00Z; git -C $W checkout -q main
asmaya collect $W github-changes --repo globex/relay --period $Q --by maya
asmaya collect $W github-deployments --repo globex/relay --environment production --period $Q --by maya
asmaya collect $W github-rule-changes --repo globex/relay --period $Q --by maya
ed collect $W cloudflare-deployments --account eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee --script relay --period $Q --by maya
asmaya collect $W nonhuman-access --repo globex/relay --org globex --by maya
ed collect $W cloudflare-changes --account eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee --period $Q --by maya
ed collect $W cloudflare-tokens --account eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee --period $Q --by maya
ed collect $W access-changes --period $Q --by maya
ed collect $W roster-history --repo $D/relay --period $Q --by maya
ed collect $W seam-records --repo $D/relay --period $Q --by maya
ed open-autonomy $W import --repo $D/relay --by maya | tail -1
asmaya collect $W attribution --repo globex/compliance --by maya | head -6
ed audit $W new q3 --type type2 --firm "Example & Co" --period $Q | tail -1
ed audit $W q3 requests --import $S/requests/${REQUESTS:-pbc-r5}.csv | tail -1
python3 $S/attach.py $W $S/requests/${REQUESTS:-pbc-r5}.csv > $STATE/attach.txt
while read r kind ids extra; do
  if [ "$kind" = none ]; then ed audit $W q3 request $r --side client --by maya --text "No evidence is recorded for these controls in the period; see the control matrix (review/controls-matrix.csv)." | grep -i "error\|evidence-desk:"
  elif [ "$kind" = population ]; then ed audit $W q3 request $r --side client --by maya --text "The population for the period, with the query that produced it and its raw responses${extra:+, and the populations that reconcile it}." --population $ids ${extra:+--evidence} ${extra} | grep -i "error\|evidence-desk:"
  else ed audit $W q3 request $r --side client --by maya --text "Attached from the workspace; review/index.html lists each item with its source." --evidence $ids | grep -i "error\|evidence-desk:"; fi
  ed audit $W q3 request $r --side client --by maya --status submitted | grep -i "error\|evidence-desk:"
done < $STATE/attach.txt
ed audit $W q3 draft description | tail -1; ed audit $W q3 draft assertion | tail -1
ed audit $W q3 exceptions --json > $STATE/exceptions-draft.json
python3 $S/fill.py $W/audits/q3/drafts/description.md $W/audits/q3/drafts/assertion.md $STATE/exceptions-draft.json
git -C $W add -A; gcommit $W maya "Q3 engagement: collections, requests answered, drafts"; gpush $W main
# The owner reviews the drafted description against the system before it goes to the firm.
clock 2026-10-03T10:00:00Z; evdoc maya maya-gx sam-gx GOV-08 description-review-2026-10-03.md "System description reviewed against the system" "# System description review, 2026-10-03
The owner read the drafted description (audits/q3/drafts/description.md) against the repository at main, the accepted ADRs and the vendor list; changes since the last review: the deploy service account, the tenant-isolation test, the restore-test seam."
echo POST-DONE
