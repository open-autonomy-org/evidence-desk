# attach.py <workspace> <requests.csv>: what the client attaches to each request. A population request gets the latest
# population whose kind its controls name; any other request gets each of its controls' evidence (of the daily
# collector records, only the latest). A request nothing answers prints "none".
import csv, glob, json, sys
W, requests = sys.argv[1], sys.argv[2]
ev = [json.load(open(f)) for f in glob.glob(W + '/evidence/records/*.json')]
def latest(pred):
    m = sorted([e for e in ev if pred(e)], key=lambda e: e['collected_at'])
    return m[-1]['id'] if m else None
seam = lambda n: (lambda e: e.get('source', {}).get('name') == n)
# Collector populations by their file name: several titles say "changes to".
stem = lambda t: (lambda e: any(t in f['path'] and f['path'].endswith('.csv') for f in e['files']))
# The first of a request's controls that has a population decides which one it is.
by_control = [('CHG-04', seam('break-glass seam')), ('CHG-03', stem('/github-deployments-')), ('CHG-01', stem('/github-changes-')),
              ('OPS-03', seam('incidents seam')), ('AC-05', seam('credentials seam')), ('OPS-01', seam('escalations seam')),
              ('GOV-06', seam('escalations seam')), ('HR-03', stem('/access-changes-')), ('AC-02', stem('/access-changes-')), ('HR-04', stem('/access-changes-'))]
for r in csv.DictReader(open(requests)):
    controls = r['controls'].split(';')
    if r['kind'] == 'population':
        pick = next((p for c in controls for k, p in by_control if k == c), None)
        found = latest(pick) if pick else None
        print(r['id'], 'population' if found else 'none', found or '')
        continue
    ids = []
    for c in controls:
        # Change populations (who changed the rules or the configuration) answer a document request about that
        # configuration; the transaction populations answer population requests.
        # So do the records the organization keeps under records/ (restore tests, internal audits) for a request about
        # that control.
        is_config = lambda e: e['title'].startswith('Population:') and ('rulesets' in e['title'] or 'configuration changes' in e['title'] or e.get('source', {}).get('name', '').endswith(' seam'))
        cand = sorted([e for e in ev if c in e['controls'] and (not e['title'].startswith('Population:') or is_config(e))], key=lambda e: e['collected_at'])
        daily = [e for e in cand if e.get('source', {}).get('kind') == 'collector' and 'collected by run' in e['title']]
        for e in [e for e in cand if e not in daily] + daily[-1:]:
            if e['id'] not in ids: ids.append(e['id'])
    print(r['id'], 'evidence' if ids else 'none', ','.join(ids))
