# The Pyramid

College football restructured as a two-tier league with promotion and relegation, plus a
simulator for it. Single-file HTML output, no runtime dependencies, no build step for the
end user — open `dist/college-football-pyramid.html` in a browser.

Real 2026 membership: 138 FBS teams in Tier I, 128 FCS teams in Tier II.

## The structure

**Four conferences, drawn on geography.** Northeast, Southeast, Central and Western, produced
by capacitated k-means over an Albers equal-area projection of every campus. Equal conference
size is enforced, which is what pushes Iowa and Illinois into Central and Minnesota and
Nebraska into Western — the Southeast has about 41 teams competing for 35 seats.

**Two divisions per conference, drawn on strength.** Each conference splits into an A and a B
half built to match on centre *and* spread. A snake draft over adjacent rating pairs gives each
half one team from every rung of the ladder; a local search then polishes against a cost that
weights standard deviation, decile counts, quartile extremes and the mean. At the opening
alignment the halves differ by at most 0.02 in standard deviation.

Tier II uses the same four footprints, so a team that changes tier never changes region.

## Schedules

Twelve games across a fourteen-week calendar, with at least one bye for every team.

- **7 or 8 division games**, alternating across the two seasons of a cycle
- **3 crossover games** against the other half of the conference, rotating yearly
- **the rest non-conference**, matched on rating and nudged to level out schedule strength

The division slate is a full round robin split in half by circulant offsets: one season takes
the low offsets, the next takes the rest. Together they cover every pairing, so every team
plays its entire division once per cycle. Everyone in a division plays the same number of
division games.

**Rivalries** are one per team, claimed by the biggest games first (232 of 266 teams get one).
A rivalry runs three years in four with the off year staggered per pairing. If the pair already
meet on the slate, that is the game; if not it is added on top and spends an outside slot, so
nobody's division allotment moves.

## Postseason

Twenty-four teams: eight division winners and sixteen at-large.

1. Four conference championships and eight at-large play-in games
2. Seeds 1–4 to conference champions, 5–8 to the teams they beat, 9–16 to play-in winners
3. A fixed sixteen-team bracket through to the final

The full real bowl slate is in rotation. The six majors rotate — two host semifinals, four host
quarterfinals, and which is which shifts annually. Sixteen more rotate into the play-in and
round of 16. The leftovers host the best teams that missed the field. Conference championships
move around the membership one campus a year; the title game rotates through twenty NFL
buildings.

## Promotion and relegation

Every second season the table settles. The first cycle is relegation only — ten teams drop so
Tier I lands on 128 — and after that it is one down and one up per division.

**Relegation** takes the worst combined two-year record. Ties break on conference record, head
to head, point differential capped at ±21 a game, strength of schedule, playoff ranking, then a
draw. The cap exists so a team cannot bury weak opponents to buy its way clear.

**Promotion** scores each Tier II team over the cycle: 60% two-year record, 20% playoff run,
10% strength of schedule, 10% ranking. The playoff share is measured against a perfect run, not
against whoever went furthest in that division.

Because divisions are balanced on strength rather than geography, each reshuffle also makes the
fewest swaps needed to bring a conference's halves back within 1.5 rating points.

## Layout

```
data/teams.py      138 + 128 teams: city, coordinates, rating, rivalry list
data/align.py      conference clustering, division balancing, rivalry matching -> align.json
data/mkmap.py      US state outlines -> projected SVG paths -> map.json
src/shell.html     markup and styles, with an __APP__ placeholder
src/app.js         simulation and UI, with a __DATA__ placeholder
build.py           injects data and app into the shell -> dist/
test/smoke.js      headless checks on schedules, cycles, brackets and rendering
```

## Build

```sh
pip install numpy scipy
python3 data/align.py      # only when teams or the balancing rules change
python3 data/mkmap.py      # only when the projection changes
python3 build.py           # always — writes dist/college-football-pyramid.html
```

`align.py` and `mkmap.py` write JSON into `data/`, which is committed, so a plain `build.py`
is enough for most changes.

## Test

```sh
npm install jsdom
node test/smoke.js
```

Checks that every team plays exactly twelve games, that division allotments are equal within a
division, that a cycle covers the full division round robin, that the calendar closes in
fourteen weeks with no double-booking, that the bracket has the right shape, and that tier
sizes hold at 128 and 138 across cycles.

## Notes

Ratings are a blunt instrument reflecting rough present-day strength. Games are decided by the
rating gap plus home field and a good deal of noise. Read the output as a shape, not a forecast.
