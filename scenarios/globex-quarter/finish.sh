# Management's cited responses to the exceptions the workspace derives, then the package as exported on 5 October.
source ${0:A:h}/lib.sh
W=$D/compliance; OUT=${PACKAGE_OUT:-$STATE/package}
ed audit $W q3 exceptions --json > $STATE/exceptions.json
python3 $S/responses.py $W $STATE/exceptions.json > $STATE/responses.txt || exit 1
while IFS= read -r line; do (cd $ED && timeout 120 $V attach evidence-desk-oa --root $RT -- "${(@ps:\x1f:)line}" 2>&1 | grep -v WARN | tail -1); done < $STATE/responses.txt
git -C $W add -A; gcommit $W maya "Q3: management responses with their evidence"; gpush $W main
clock 2026-10-05T09:00:00Z; rm -rf $OUT; ed audit $W q3 export --out $OUT | tail -1; ed audit verify $OUT | tail -1
echo "FINISHED $OUT"
