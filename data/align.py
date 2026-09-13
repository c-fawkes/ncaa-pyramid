import json, math, random, os
import numpy as np
from scipy.optimize import linear_sum_assignment
from teams import FBS, FCS, RIVALRIES

random.seed(11); np.random.seed(11)
RW_CONF = 150000.0

def proj(lat, lon):
    lat0, lon0 = 37.5, -96.0
    la, lo = math.radians(lat), math.radians(lon)
    la0, lo0 = math.radians(lat0), math.radians(lon0)
    p1, p2 = math.radians(29.5), math.radians(45.5)
    n = 0.5*(math.sin(p1)+math.sin(p2)); C = math.cos(p1)**2 + 2*n*math.sin(p1)
    rho = math.sqrt(C - 2*n*math.sin(la))/n; rho0 = math.sqrt(C - 2*n*math.sin(la0))/n
    th = n*(lo-lo0)
    return rho*math.sin(th)*6371, (rho0 - rho*math.cos(th))*6371

def mk(rows, tier):
    out=[]
    for i,(nm,city,st,lat,lon,rt,oc) in enumerate(rows):
        clat, clon = (34.0,-124.5) if st=="HI" else (lat,lon)
        x,y = proj(clat, clon)
        out.append(dict(id=f"{tier}{i}", name=nm, city=city, st=st, lat=lat, lon=lon,
                        rating=rt, tier=tier, x=x, y=y))
    return out

fbs, fcs = mk(FBS,"d1"), mk(FCS,"d2")
allt = fbs+fcs
byname = {t["name"]: t for t in allt}

# ---------- one rival per team, biggest games claimed first ----------
RIVAL = {}
for a,b in RIVALRIES:
    if a in byname and b in byname and a not in RIVAL and b not in RIVAL:
        RIVAL[a]=b; RIVAL[b]=a
PAIRS = {frozenset((a,b)) for a,b in RIVAL.items()}
print(f"rival pairs kept: {len(PAIRS)}; teams with a rival: {len(RIVAL)}/{len(allt)}")

# ---------- capacitated geographic clustering ----------
def capassign(pts, centers, caps):
    slots, owner = [], []
    for ci,c in enumerate(caps):
        for _ in range(c): slots.append(centers[ci]); owner.append(ci)
    cost = np.zeros((len(pts), len(slots)))
    for i,p in enumerate(pts):
        for j,s in enumerate(slots):
            cost[i,j] = (p[0]-s[0])**2 + (p[1]-s[1])**2
    r,c = linear_sum_assignment(cost)
    lab=[0]*len(pts)
    for i,j in zip(r,c): lab[i]=owner[j]
    return lab

def kmeans_caps(pts, caps, iters=60):
    k=len(caps); cen=[pts[i] for i in np.random.choice(len(pts),k,replace=False)]
    lab=None
    for _ in range(iters):
        lab=capassign(pts,cen,caps)
        new=[]
        for ci in range(k):
            mem=[pts[i] for i in range(len(pts)) if lab[i]==ci]
            new.append((sum(m[0] for m in mem)/len(mem), sum(m[1] for m in mem)/len(mem)))
        if all(abs(a[0]-b[0])<1e-6 and abs(a[1]-b[1])<1e-6 for a,b in zip(cen,new)): break
        cen=new
    return lab,cen

def natural_kmeans(pts,k,iters=100):
    cen=[pts[i] for i in np.random.choice(len(pts),k,replace=False)]
    for _ in range(iters):
        lab=[min(range(k), key=lambda c:(p[0]-cen[c][0])**2+(p[1]-cen[c][1])**2) for p in pts]
        new=[]
        for c in range(k):
            mem=[pts[i] for i in range(len(pts)) if lab[i]==c] or [cen[c]]
            new.append((sum(m[0] for m in mem)/len(mem), sum(m[1] for m in mem)/len(mem)))
        if new==cen: break
        cen=new
    return lab,cen

P=[(t["x"],t["y"]) for t in fbs]
best=None
for _ in range(40):
    nl,_ = natural_kmeans(P,4)
    counts=[nl.count(c) for c in range(4)]
    order=sorted(range(4), key=lambda c:-counts[c])
    caps=[0]*4
    for rank,c in enumerate(order): caps[c]= 35 if rank<2 else 34
    lab,cen=kmeans_caps(P,caps)
    cost=sum((P[i][0]-cen[lab[i]][0])**2+(P[i][1]-cen[lab[i]][1])**2 for i in range(len(P)))
    if best is None or cost<best[0]: best=(cost,lab,cen)
_,lab,cen = best

rem=list(range(4)); names={}
pac=min(rem,key=lambda c:cen[c][0]); names[pac]="Western"; rem.remove(pac)
nor=max(rem,key=lambda c:cen[c][1]); names[nor]="Northeast"; rem.remove(nor)
a,b=sorted(rem,key=lambda c:cen[c][0]); names[a]="Central"; names[b]="Southeast"
for i,t in enumerate(fbs): t["conf"]=names[lab[i]]
CONFS=["Northeast","Southeast","Central","Western"]

# keep rival pairs inside one conference where geography allows
def spread(ts):
    cx=sum(t["x"] for t in ts)/len(ts); cy=sum(t["y"] for t in ts)/len(ts)
    return sum((t["x"]-cx)**2+(t["y"]-cy)**2 for t in ts)
def conf_cost(pool):
    g={}
    for t in pool: g.setdefault(t["conf"],[]).append(t)
    cm={t["name"]:t["conf"] for t in pool}
    broken=sum(1 for p in PAIRS for x,y in [tuple(p)] if x in cm and y in cm and cm[x]!=cm[y])
    return sum(spread(v) for v in g.values()) + RW_CONF*broken
def refine_conf(pool, rounds=6):
    cur=conf_cost(pool)
    for _ in range(rounds):
        moved=False
        for i in range(len(pool)):
            for j in range(i+1,len(pool)):
                x,y=pool[i],pool[j]
                if x["conf"]==y["conf"]: continue
                x["conf"],y["conf"]=y["conf"],x["conf"]
                nc=conf_cost(pool)
                if nc<cur-1e-9: cur=nc; moved=True
                else: x["conf"],y["conf"]=y["conf"],x["conf"]
        if not moved: break
refine_conf(fbs)

# Division II conferences follow the same four footprints
conf_cen={c:(sum(t["x"] for t in fbs if t["conf"]==c)/sum(1 for t in fbs if t["conf"]==c),
             sum(t["y"] for t in fbs if t["conf"]==c)/sum(1 for t in fbs if t["conf"]==c))
          for c in CONFS}
l2=capassign([(t["x"],t["y"]) for t in fcs],[conf_cen[c] for c in CONFS],[32]*4)
for i,t in enumerate(fcs): t["conf"]=CONFS[l2[i]]
refine_conf(fcs, rounds=5)

# ---------- divisions: split each conference into equally strong halves ----------
import statistics as st

def shape_cost(A,B):
    """Match the halves on centre AND spread, not just the mean."""
    ra=[t["rating"] for t in A]; rb=[t["rating"] for t in B]
    c  = 6.0*abs(st.mean(ra)-st.mean(rb))
    c += 9.0*abs(st.pstdev(ra)-st.pstdev(rb))
    c += 0.6*(abs(max(ra)-max(rb)) + abs(min(ra)-min(rb)))
    allr=sorted(ra+rb, reverse=True); n=len(allr)
    for k in range(1,10):                      # deciles, not quartiles
        cut=allr[min(n-1, max(0, n*k//10 - 1))]
        c += abs(sum(1 for x in ra if x>=cut) - sum(1 for x in rb if x>=cut))
    q=max(1,n//4); hi=allr[q-1]; lo=allr[-q]
    c += 2.0*abs(sum(1 for x in ra if x>=hi) - sum(1 for x in rb if x>=hi))
    c += 2.0*abs(sum(1 for x in ra if x<=lo) - sum(1 for x in rb if x<=lo))
    return c

def split_conf(pool, nA):
    """Snake the sorted list in adjacent pairs so each half gets one team from
    every rung of the ladder, then polish with swaps."""
    ts=sorted(pool, key=lambda t:-t["rating"]); n=len(ts)
    lab=[]
    for i in range(0, n, 2):
        pair = ("A","B") if (i//2) % 2 == 0 else ("B","A")
        lab.append(pair[0])
        if i+1 < n: lab.append(pair[1])
    # nudge the labels until the halves are the right size
    while lab.count("A") > nA:
        for i in range(n-1, -1, -1):
            if lab[i]=="A": lab[i]="B"; break
    while lab.count("A") < nA:
        for i in range(n-1, -1, -1):
            if lab[i]=="B": lab[i]="A"; break
    base=(  [t for t,l in zip(ts,lab) if l=="A"],
            [t for t,l in zip(ts,lab) if l=="B"] )

    def polish(A,B):
        cur=shape_cost(A,B)
        for _ in range(400):
            moved=False
            for i in range(len(A)):
                for j in range(len(B)):
                    A[i],B[j]=B[j],A[i]
                    nc=shape_cost(A,B)
                    if nc < cur-1e-9: cur=nc; moved=True
                    else: A[i],B[j]=B[j],A[i]
            if not moved: break
        return cur,A,B

    best=polish(list(base[0]), list(base[1]))
    # a few jittered restarts, since the pairwise search settles into local dips
    for _ in range(14):
        A=list(base[0]); B=list(base[1])
        for _ in range(random.randint(2,5)):
            i=random.randrange(len(A)); j=random.randrange(len(B))
            A[i],B[j]=B[j],A[i]
        got=polish(A,B)
        if got[0] < best[0]: best=got
    return best[1], best[2]

for pool,label in ((fbs,"D1"),(fcs,"D2")):
    for c in CONFS:
        mem=[t for t in pool if t["conf"]==c]
        n=len(mem); nA = n-n//2
        A,B=split_conf(mem,nA)
        for t in A: t["div"]=c+" A"
        for t in B: t["div"]=c+" B"
        ra=[t["rating"] for t in A]; rb=[t["rating"] for t in B]
        allr=sorted(ra+rb, reverse=True); q=max(1,len(allr)//4)
        hi=allr[q-1]; lo=allr[-q]
        def prof(r):
            return (f"n={len(r):2d} avg={st.mean(r):5.2f} sd={st.pstdev(r):5.2f} "
                    f"min={min(r):2d} max={max(r):2d} "
                    f"top{q}={sum(1 for x in r if x>=hi):2d} bot{q}={sum(1 for x in r if x<=lo):2d}")
        print(f"{label} {c} A: {prof(ra)}")
        print(f"{label} {c} B: {prof(rb)}")

DIVS=[c+" "+s for c in CONFS for s in ("A","B")]
for t in allt:
    t["rival"]=RIVAL.get(t["name"])
    t["rivals"]=[t["rival"]] if t["rival"] else []
    del t["x"]; del t["y"]

same_conf=sum(1 for p in PAIRS for x,y in [tuple(p)] if byname[x]["conf"]==byname[y]["conf"])
same_div=sum(1 for p in PAIRS for x,y in [tuple(p)] if byname[x]["div"]==byname[y]["div"])
print(f"rival pairs sharing a conference: {same_conf}/{len(PAIRS)}; sharing a division: {same_div}")

import pathlib
json.dump({"d1":fbs,"d2":fcs,"divs":DIVS,"confs":CONFS},
          open(pathlib.Path(__file__).parent/"align.json","w"), indent=0)
for d in DIVS:
    m=[t for t in fbs if t["div"]==d]
    print(f"\n== {d} ({len(m)}) ==\n" + ", ".join(sorted(t['name'] for t in m)))
