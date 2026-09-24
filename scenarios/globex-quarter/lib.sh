# The Globex quarter: helpers every step sources. Run from anywhere; nothing here names a machine.
#   OPEN_AUTONOMY_DATA      the World data root (holds evidence-desk-oa/ and artifact-verification/)
#   TWIN_CHECKOUT           a checkout of volter-ai/twin at main (the published twins predate what this needs)
#   KIT_VERSION             the published create-open-autonomy that creates the soc2 project (default 3.3.0)
S=${${(%):-%x}:A:h}
ED=${S:h:h}
RT=${OPEN_AUTONOMY_DATA:?set OPEN_AUTONOMY_DATA to the World data root}
D=$RT/artifact-verification/globex
STATE=$RT/artifact-verification/globex-state; mkdir -p $STATE
V=$ED/.open-autonomy/node_modules/.bin/volter-world
clock() { $V clock evidence-desk-oa set "$1" --root $RT >/dev/null && echo "clock $1"; }
now() { cat $RT/.volter/worlds/evidence-desk-oa/clock 2>/dev/null; }
tok() { cat $STATE/tok-$1; }
seed() { local u=$1; shift; local step=$1; shift; local t=-; [ "$u" != "-" ] && t=$(tok $u); (cd $ED && timeout 60 $V attach evidence-desk-oa --root $RT -- bun $S/seed.ts $step $t "$@" 2>&1 | grep -v WARN); }
# cfas <email> <setting> <value>: a zone setting changed by that person with their own Cloudflare token
cfas() { (cd $ED && timeout 60 $V attach evidence-desk-oa --root $RT -- env CF_AS=$(cat $STATE/cftok-$1) bun $S/seed.ts cfset - $2 $3 2>&1 | grep -v WARN); }
ed() { (cd $ED && timeout 120 $V attach evidence-desk-oa --root $RT -- bun src/cli.ts "$@" 2>&1 | grep -v WARN); }
# gcommit <dir> <name> <message>: commit what is staged, dated by the World clock
gcommit() { local t=$(now); GIT_AUTHOR_DATE="$t" GIT_COMMITTER_DATE="$t" git -C "$1" -c user.name="$2" -c user.email="$2@globex.test" commit -qm "$3"; }
gpush() { timeout 60 git -C "$1" push -q origin "$2" 2>&1 | grep -v "^$"; }
# change <user> <branch> <title>: a commit on a branch of relay, pushed
change() { git -C $D/relay checkout -q main && timeout 30 git -C $D/relay pull -q --no-rebase origin main 2>&1 | grep -v "no common"; git -C $D/relay checkout -q -b $2; echo "// $3" >> $D/relay/src/index.ts; git -C $D/relay add src/index.ts; gcommit $D/relay $1 "$3"; gpush $D/relay $2; git -C $D/relay checkout -q main; }
# wspr <user> <branch> <title> <approver>: the workspace's current branch as a pull request, approved and merged
wspr() { gpush $D/compliance $2; local n=$(seed $1 pr compliance $2 "$3"); seed $4 approve compliance $n >/dev/null; seed $4 merge compliance $n >/dev/null; git -C $D/compliance checkout -q main && timeout 30 git -C $D/compliance pull -q --no-rebase origin main 2>&1 | grep -v "no common"; echo "compliance PR $n merged"; }
# A document management adds as evidence, through a pull request the other person approves.
evdoc() { git -C $W checkout -q main && git -C $W checkout -q -b $1/ev-$(date +%s%N); mkdir -p $STATE/docs; printf '%s\n' "$7" > $STATE/docs/$5
  ed evidence $W --add --control $4 --file $STATE/docs/$5 --title "$6" --by $1 | grep -i error; git -C $W add -A; gcommit $W $1 "$6"; wspr $2 $(git -C $W branch --show-current) "$6" $3 >/dev/null; echo "evidence: $6"; }
