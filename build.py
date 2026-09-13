#!/usr/bin/env python3
"""Inject the team data and the app into the HTML shell -> dist/."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
KEEP = ("id","name","city","st","lat","lon","rating","conf","div","tier","rival","rivals")

align = json.loads((ROOT/"data"/"align.json").read_text())
amap  = json.loads((ROOT/"data"/"map.json").read_text())

slim = lambda t: {k: t[k] for k in KEEP}
data = {"d1":[slim(t) for t in align["d1"]],
        "d2":[slim(t) for t in align["d2"]],
        "divs":align["divs"], "confs":align["confs"], "map":amap}

js   = (ROOT/"src"/"app.js").read_text().replace("__DATA__", json.dumps(data, separators=(",",":")))
html = (ROOT/"src"/"shell.html").read_text().replace("__APP__", js)

out = ROOT/"dist"/"college-football-pyramid.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(f"wrote {out.relative_to(ROOT)}  ({len(html)/1024:.1f} KB)")
