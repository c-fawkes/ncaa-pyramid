#!/usr/bin/env python3
"""Give every team a rival.

The real rivalry list in teams.py covers most of the league, but it leaves
teams over: some have no traditional rival, and some lose theirs to a pairing
claimed earlier. Those leftovers are matched here so nobody goes without.

Run after the conferences and divisions are settled, because that is what the
matching leans on: a leftover pairs inside its own tier, preferring a team from
its own division, then its own conference, then anyone, and among equals the
nearest one. A rival in the other tier is never played while they are apart, so
pairing inside the tier is what makes the fixture worth having.

Imported by align.py during a full rebuild; run directly to fill in an existing
align.json without re-clustering the league:

    python3 data/rivals.py
"""
import json, math, pathlib, sys


def _miles(a, b):
    """Rough great-circle distance. Only the ordering matters here."""
    la = math.radians((a["lat"] + b["lat"]) / 2)
    dx = (a["lon"] - b["lon"]) * math.cos(la) * 69.0
    dy = (a["lat"] - b["lat"]) * 69.0
    return math.hypot(dx, dy)


def _rank(a, b):
    """Lower is a better match: same division, then same conference, then any."""
    if a.get("div") and a.get("div") == b.get("div"):
        return 0
    if a.get("conf") and a.get("conf") == b.get("conf"):
        return 1
    return 2


def _pair_off(free, rival, made):
    """Greedily marry the closest, best-matched pair until fewer than two remain."""
    while len(free) > 1:
        best = None
        for i in range(len(free)):
            for j in range(i + 1, len(free)):
                key = (_rank(free[i], free[j]), _miles(free[i], free[j]))
                if best is None or key < best[0]:
                    best = (key, i, j)
        _, i, j = best
        a, b = free[i], free[j]
        rival[a["name"]] = b["name"]
        rival[b["name"]] = a["name"]
        made.append((a["name"], b["name"]))
        free = [t for k, t in enumerate(free) if k not in (i, j)]
    return free


def fill(teams, rival):
    """Pair up every team in `teams` that `rival` has not already spoken for.

    `rival` is a name -> name dict, mutated in place. Returns the pairs made.
    """
    made, odd = [], []
    for tier in sorted({t["tier"] for t in teams}):
        free = [t for t in teams if t["tier"] == tier and t["name"] not in rival]
        odd += _pair_off(free, rival, made)
    # A tier with an odd number left over has one team still on its own; those
    # singles pair with each other, across tiers if that is all that is left.
    _pair_off(odd, rival, made)
    return made


def main():
    path = pathlib.Path(__file__).with_name("align.json")
    data = json.loads(path.read_text())
    teams = data["d1"] + data["d2"]
    rival = {t["name"]: t["rival"] for t in teams if t.get("rival")}
    before = len(rival)
    made = fill(teams, rival)
    for t in teams:
        t["rival"] = rival.get(t["name"])
        t["rivals"] = [t["rival"]] if t["rival"] else []
    unpaired = [t["name"] for t in teams if not t["rival"]]
    path.write_text(json.dumps(data, separators=(",", ":")))
    same_div = sum(1 for a, b in made
                   if next(t for t in teams if t["name"] == a)["div"]
                   == next(t for t in teams if t["name"] == b)["div"])
    print(f"had a rival: {before}/{len(teams)}")
    print(f"pairs made:  {len(made)} ({same_div} inside a division)")
    print(f"still without: {len(unpaired)}" + (f" {unpaired}" if unpaired else ""))
    return 1 if unpaired else 0


if __name__ == "__main__":
    sys.exit(main())
