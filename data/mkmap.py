import json, math
def proj(lat, lon):
    lat0, lon0 = 37.5, -96.0
    la, lo = math.radians(lat), math.radians(lon)
    la0, lo0 = math.radians(lat0), math.radians(lon0)
    p1, p2 = math.radians(29.5), math.radians(45.5)
    n = 0.5*(math.sin(p1)+math.sin(p2)); C = math.cos(p1)**2 + 2*n*math.sin(p1)
    rho = math.sqrt(C - 2*n*math.sin(la))/n; rho0 = math.sqrt(C - 2*n*math.sin(la0))/n
    th = n*(lo-lo0)
    return rho*math.sin(th)*6371, (rho0 - rho*math.cos(th))*6371

import pathlib
HERE=pathlib.Path(__file__).parent
g = json.load(open(HERE/'us-states.json'))
SKIP = {"Alaska","Hawaii","Puerto Rico"}
def rings(geom):
    if geom['type']=='Polygon': return [geom['coordinates'][0]]
    return [p[0] for p in geom['coordinates']]

def simplify(pts, tol):
    out=[pts[0]]
    for p in pts[1:]:
        if (p[0]-out[-1][0])**2+(p[1]-out[-1][1])**2 > tol*tol: out.append(p)
    if out[-1]!=pts[0]: out.append(pts[0])
    return out

xs=[];ys=[];raw={}
for f in g['features']:
    nm=f['properties']['name']
    if nm in SKIP: continue
    rs=[]
    for r in rings(f['geometry']):
        pr=[proj(c[1],c[0]) for c in r]
        if len(pr)<4: continue
        pr=simplify(pr, 9)
        if len(pr)<4: continue
        rs.append(pr); xs+= [p[0] for p in pr]; ys+=[p[1] for p in pr]
    raw[nm]=rs

minx,maxx,miny,maxy=min(xs),max(xs),min(ys),max(ys)
W,H=960,600; pad=14
sc=min((W-2*pad)/(maxx-minx),(H-2*pad)/(maxy-miny))
ox=pad+((W-2*pad)-(maxx-minx)*sc)/2; oy=pad+((H-2*pad)-(maxy-miny)*sc)/2
def T(x,y): return (ox+(x-minx)*sc, oy+(maxy-y)*sc)   # flip: y north-positive -> screen down

paths={}
for nm,rs in raw.items():
    d=[]
    for r in rs:
        pts=[T(*p) for p in r]
        d.append("M"+ " ".join(f"{a:.1f},{b:.1f}" for a,b in pts)+"Z")
    paths[nm]="".join(d)

meta=dict(minx=minx,maxy=maxy,sc=sc,ox=ox,oy=oy,W=W,H=H)
json.dump({"paths":paths,"meta":meta}, open(HERE/"map.json","w"))
print(len(paths), "states;", sum(len(v) for v in paths.values()), "path chars")
print("meta", meta)
