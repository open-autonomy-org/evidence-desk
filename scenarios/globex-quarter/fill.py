# fill.py <description.md> <assertion.md>: Globex management completes the drafts
import re,sys
d,a=sys.argv[1],sys.argv[2]
s=open(d).read()
s=re.sub(r'<!-- Drafted by Evidence Desk.*?-->\n\n', '', s, flags=re.S)
s=re.sub(r"\[State the security, availability and confidentiality commitments.*?\]", """Globex commits to its customers in its Terms of Service and Data Processing Addendum: webhook payloads are
encrypted in transit (TLS 1.2 or later, HTTPS only) and at rest by its hosting provider; stored payloads are deleted
after 30 days; customer data is reachable only by the engineers on the roster, for support and incident response;
Relay is available 99.9% of each month, measured at the edge; a security incident affecting a customer's data is
notified to that customer within 72 hours of confirmation. These commitments require individually attributable access
with two-factor authentication, reviewed and approved changes and deployments, a monitored hosting provider, and a
documented incident process.""", s, flags=re.S)
s=s.replace("Data: [describe the data the system holds].","Data: customers' webhook payloads and their headers (retained 30 days), inbox configuration, API keys (stored hashed) and account contact emails.")
s=s.replace(" [confirm review with the daily required-review check]"," (a required approving review on the default branch, tested daily by the required-review check)")
s=re.sub(r"\[List the controls the service assumes its customers operate.*?\]", """- Customers decide which of their users may view and replay their payloads, and remove users who leave.
- Customers keep the API keys Globex issues them secret and rotate a key they suspect is exposed.
- Customers do not send payloads containing data they may not share with a processor.""", s, flags=re.S)
subs={'Cloudflare':'hosts and serves Relay (Workers and Durable Objects), terminates TLS, encrypts stored data and keeps its data centers physically secure (CSOC: physical and environmental security, infrastructure availability, encryption at rest). Globex reviews its SOC 2 Type II report each year and checks the zone TLS and HTTPS settings and account two-factor daily',
 'GitHub':'hosts the source and runs the deployment workflows, and enforces the repository rules and environment approvals Globex configures (CSOC: logical access to its platform, integrity of the rules it enforces). Globex reviews its SOC 2 Type II report each year and checks review, protection and organization two-factor daily',
 'Open Autonomy platform (model valve and books)':'meters and routes the development agents\' model use and keeps their spending books; it holds no customer data (CSOC: none relied on for customer data). Globex reviews its security overview each year',
 'npm':'serves the dependencies the build installs, pinned by lockfile (CSOC: package integrity). Globex monitors dependency alerts daily'}
for k,v in subs.items(): s=s.replace(f"- {k}: [the controls the organization expects it to operate, and how the organization monitors them]", f"- {k}: {v}.")
s=s.replace("- [Add significant changes to the system, its people or its controls.]","- Lee Park joined as an engineer on 2026-08-03 (GitHub access from 2026-08-05, after the agreements).\n- On 2026-08-27, after incident replay-headers, a tenant-isolation regression test joined the CI test job and the deploy service account's token (deploy@globex.test) was rotated.\n- On 2026-09-10 a break-glass deploy from a laptop reached production outside the change path (see the assertion).\n- On 2026-09-11 the laptop change was deployed through review as deploy-v6.")
import os,glob,csv as _csv
here=os.path.dirname(os.path.abspath(__file__))
# The laptop deploy's Cloudflare id, as collected: the one deployment no approved GitHub deployment accounts for.
_w=sorted(glob.glob(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(d)))),'evidence/files/populations/cloudflare-worker-deployments-*.csv')))
_laptop=next((r['deployment'][:8] for r in _csv.DictReader(open(_w[-1])) if r['matched']!='yes'),'') if _w else ''
_sub=lambda t: t.replace('{{laptop_deploy}}',_laptop)
dc4=_sub(open(here+'/dc4.md').read().strip()) if os.path.exists(here+'/dc4.md') else None
if dc4: s=re.sub(r"\[State which of these deviations are incidents to disclose here.*?\]", dc4, s, flags=re.S)
open(d,'w').write(s)
t=open(a).read()
t=re.sub(r'<!-- Drafted by Evidence Desk.*?-->\n\n', '', t, flags=re.S)
qual=_sub(open(here+'/qualification.md').read().strip()) if os.path.exists(here+'/qualification.md') else None
if qual: t=re.sub(r"\[The workspace found \d+ deviation\(s\).*?\]\n(- .*\n)+", qual+'\n', t, flags=re.S); t=t.replace('and they operated effectively throughout that period.', 'and they operated effectively throughout that period, except for the matters described in the following paragraph.') if qual else t
# Management names each exception still open at the period's end that its matters do not already name, from the
# register the package will carry, and says when the system began operating if that was inside the period.
if len(sys.argv)>3 and os.path.exists(sys.argv[3]):
    import json as _json
    add=[x for x in _json.load(open(sys.argv[3])) if (x.get('open_at_period_end')=='yes' or x['key'].startswith('incident:')) and x['item'] not in t]
    letters=re.findall(r'^\(([a-z])\) ', t, flags=re.M); n=ord(max(letters))+1 if letters else ord('a')
    for x in add:
        t=t.rstrip('\n')+f"\n\n({chr(n)}) {x['item']}: {x['detail']}.\n"; n+=1
born=re.search(r'Worker (\S+) was created on (\d{4}-\d\d-\d\d) by (\S+)', s)
if born and born.group(2) not in t:
    t=t.replace('The matters are:', f"Relay began operating on {born.group(2)}, when {born.group(3)} created the {born.group(1)} Worker; these statements cover it from then.\n\nThe matters are:")
t=t.replace('[Name, title]','Maya Chen, Chief Executive Officer').replace('[Signature]','/s/ Maya Chen').replace('[Date]','2026-10-05')
open(a,'w').write(t)
left=re.findall(r'\[[^\]]{3,}\](?![(\[])', s+t)
print('placeholders left:', left)
