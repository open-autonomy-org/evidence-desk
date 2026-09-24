# onboard.sh <person> <login> <approver-login> <iso>: a person's five onboarding forms in their own pull request
source ${0:A:h}/lib.sh
W=$D/compliance; who=$1; login=$2; approver=$3
clock $4
git -C $W checkout -q main && git -C $W checkout -q -b $who/onboarding
# The quiz answered correctly, from the form's own definition.
[ -f $W/forms/security-awareness.json ] || { echo "error: the workspace has no security-awareness form"; exit 1; }
Q=(); for x in "${(@f)$(python3 -c "import json;print('\\n'.join(f\"{q['id']}={q['correct']}\" for q in json.load(open('$W/forms/security-awareness.json'))['questions'] if q.get('correct')))")}"; do Q+=(--answer "$x"); done
ed respond $W code-of-conduct --person $who --answer read=yes
ed respond $W confidentiality-agreement --person $who --answer agree=yes
ed respond $W policy-acknowledgment --person $who --answer read=yes
ed respond $W device-and-account-attestation --person $who --answer disk=yes --answer lock=yes --answer updates=yes --answer mfa=yes --answer pm=yes --answer "devices=$5"
ed respond $W security-awareness --person $who "${Q[@]}"
git -C $W add forms/responses evidence && gcommit $W $who "$who: onboarding"
wspr $login $who/onboarding "$who onboarding" $approver
