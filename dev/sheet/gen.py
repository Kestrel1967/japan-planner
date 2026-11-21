# Builds Code.gs (and Code_v27.gs for the migration tests) from the template + the tab definitions.
# Run from this folder:  python3 gen.py   then copy Code.gs to the repo root.
import json
for tpl, d, out in [('Code.tpl.gs', 'def.json', 'Code.gs'), ('Code_v27.tpl.gs', 'def_v27.json', 'Code_v27.gs')]:
    open(out, 'w').write(open(tpl).read().replace('__DEF__', json.dumps(json.load(open(d)), ensure_ascii=False)))
