# The Pyramid

College football restructured as a two-tier league with promotion and relegation, plus a
simulator for it.

Real 2026 membership: **138 FBS teams in Tier I, 128 FCS teams in Tier II**. Four
geography-drawn conferences, two strength-balanced divisions apiece, a twelve-game schedule
with rivalries preserved, a twenty-four-team playoff over the real bowl slate, and a table
that settles every second season to send teams up and down.

The whole thing builds to one self-contained HTML file — no runtime dependencies, no server,
no build step for whoever you hand it to.

## Quick start

```sh
git clone https://github.com/c-fawkes/ncaa-pyramid.git
cd ncaa-pyramid
python3 build.py                                  # writes dist/college-football-pyramid.html
open dist/college-football-pyramid.html           # any browser
```

The committed `dist/college-football-pyramid.html` is current, so you can skip the build and
just open it. Pushes to `main` also publish it to GitHub Pages at
**https://c-fawkes.github.io/ncaa-pyramid/**.

## Using the simulator

Play a season, or run straight through to the next reshuffle, from the buttons at the top.
Five tabs:

| Tab | What's in it |
|---|---|
| **League** | Standings by division or as one list, either tier or both, ordered by standing, rating or name. Tap a team for its full schedule — drawn up in the preseason, so you can read it before a ball is kicked |
| **Map** | Every campus on a projected US map — filled markers Tier I, hollow Tier II, two shades per conference for its A and B halves. Tap a marker for a team and its schedule; stars mark division winners, the circled star the national champion |
| **Playoff** | The twenty-four-team bracket for either tier, with the bowl hosting each round |
| **Up & down** | Who is relegated, who is promoted, and the numbers behind each call, grouped by cycle or by conference |
| **Ratings** | Search and hand-edit any team's rating; turn season-to-season drift off |

`Reset league` puts you back at the 2027 preseason.

## The structure

**Four conferences, drawn on geography.** Northeast, Southeast, Central and Western, produced
by capacitated k-means over an Albers equal-area projection of every campus. Equal conference
size is enforced, which is what pushes Iowa and Illinois into Central and Minnesota and
Nebraska into Western — the Southeast has about 41 teams competing for 35 seats.

**Two divisions per conference, drawn on strength.** Each conference splits into an A and a B
half built to match on center *and* spread. A snake draft over adjacent rating pairs gives each
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

**Rivalries** are one per team, and every team has one. The real games are claimed by the
biggest first, which covers 232 of the 266; the rest are paired off once the divisions are
settled, each with the nearest team in its own division where there is one. A rivalry runs three
years in four with the off year staggered per pairing. If the pair already meet on the slate,
that is the game; if not it is added on top and spends an outside slot, so nobody's division
allotment moves.

A rivalry needs both teams in the same tier. When one is promoted or relegated the fixture
lapses, and it is not played again until they are back together.

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
data/rivals.py     pairs off whoever the real rivalry list left out
data/mkmap.py      US state outlines -> projected SVG paths -> map.json
src/shell.html     markup and styles, with an __APP__ placeholder
src/app.js         simulation and UI, with a __DATA__ placeholder
build.py           injects data and app into the shell -> dist/
test/smoke.js      headless checks on schedules, cycles, brackets and rendering
```

`build.py` is a text substitution: the slimmed team data goes into `app.js` at `__DATA__`, and
the result goes into `shell.html` at `__APP__`. That is the entire pipeline.

## Build

```sh
pip install numpy scipy
python3 data/align.py      # only when teams or the balancing rules change
python3 data/rivals.py     # fills in missing rivals without re-clustering
python3 data/mkmap.py      # only when the projection changes
python3 build.py           # always — writes dist/college-football-pyramid.html
```

`align.py` and `mkmap.py` write JSON into `data/`, which is committed, so a plain `build.py`
is enough for most changes. numpy and scipy are only needed for those two scripts, never at
runtime.

## Test

```sh
npm install
npm test
```

`test/smoke.js` checks that every team plays exactly twelve games, that division allotments are
equal within a division, that a cycle covers the full division round robin, that the calendar
closes in fourteen weeks with no double-booking, that the bracket has the right shape, and that
tier sizes hold at 128 and 138 across cycles.

`test/calendar.js` runs the calendar alone across seeded leagues. Games are edges and weeks are
colors: with twelve games a team, a pairing met at most twice and fourteen weeks, Vizing's
bound for multigraphs says a valid calendar always exists, so a fifteenth week is a scheduler
bug rather than bad luck. It builds 256 calendars and checks every one closes in fourteen weeks
with nobody booked twice. The seeds it ships with are ones that used to overflow.

## Notes

Ratings are a blunt instrument reflecting rough present-day strength. Games are decided by the
rating gap plus home field and a good deal of noise. Read the output as a shape, not a forecast.
