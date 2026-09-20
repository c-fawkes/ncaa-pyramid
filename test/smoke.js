/* Headless checks on the built page. Run: node test/smoke.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'dist', 'college-football-pyramid.html');
const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'), { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const E = s => w.eval(s);
const $ = s => d.querySelector(s);

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail ? '  — ' + detail : ''));
  if (!ok) failed++;
}
function section(t) { console.log('\n' + t); }

const snap = i => JSON.parse(E(`JSON.stringify(S.snaps[${i}])`));
const latest = () => E('S.snaps.length-1');
const pending = () => E("S.phase") === 'done' && E('S.inCycle') >= 2;
const step = () => $('#actBtn').click();   // play -> advance -> settle, in turn
function playCycle() {
  while (!pending()) step();
  step();
}

section('alignment');
check('tier sizes', E('S.teams.filter(t=>t.tier==="d1").length') === 138 &&
                    E('S.teams.filter(t=>t.tier==="d2").length') === 128);
check('eight divisions', JSON.parse(E('JSON.stringify(DIVS)')).length === 8);
{
  const bad = [];
  for (const dv of JSON.parse(E('JSON.stringify(DIVS)'))) {
    const half = dv.slice(-1), conf = dv.slice(0, -2);
    const r = n => E(`S.teams.filter(t=>t.tier==="d1"&&t.div===${JSON.stringify(conf + ' ' + n)}).map(t=>t.rating)`);
    if (half !== 'A') continue;
    const a = r('A'), b = r('B');
    const m = x => x.reduce((p, q) => p + q, 0) / x.length;
    const sd = x => Math.sqrt(x.reduce((p, q) => p + (q - m(x)) ** 2, 0) / x.length);
    if (Math.abs(m(a) - m(b)) > 0.5 || Math.abs(sd(a) - sd(b)) > 0.5) bad.push(conf);
  }
  check('A and B halves match on mean and spread', bad.length === 0, bad.join(', '));
}

section('season one');
step();
{
  const sn = snap(latest());
  const games = id => sn.sched[id].filter(x => !x.ps);
  const ids = Object.keys(sn.sched);
  check('every team plays twelve or thirteen games',
    ids.every(id => { const n = games(id).length; return n === 12 || n === 13; }));
  const perDiv = {};
  for (const id of ids) {
    const me = sn.teams[id];
    const slate = games(id).filter(x => sn.teams[x.o].div === me.div && x.t !== 'rivalry').length;
    (perDiv[me.tier + ' ' + me.div] = perDiv[me.tier + ' ' + me.div] || new Set()).add(slate);
  }
  check('division slate is equal within every division',
    Object.values(perDiv).every(s => s.size === 1));
  let clash = 0, noBye = 0, lastWk = 0;
  for (const id of ids) {
    const seen = new Set();
    for (const g of games(id)) { if (seen.has(g.wk)) clash++; seen.add(g.wk); lastWk = Math.max(lastWk, g.wk); }
    if (seen.size >= 14) noBye++;
  }
  check('no team double-booked in a week', clash === 0, clash + ' conflicts');
  check('calendar closes by week 14', lastWk <= 14, 'last week ' + lastWk);
  check('every team gets a bye', noBye === 0, noBye + ' without');
  const po = sn.tiers.d1.po;
  check('bracket shape', po.ccg.length === 4 && po.pin.length === 8 &&
    po.rounds.map(r => r.games.length).join(',') === '8,4,2,1');
  check('every playoff game has a venue',
    [...po.ccg, ...po.pin, ...po.rounds.flatMap(r => r.games)].every(g => g.city));
  check('consolation bowls scheduled', po.bowls.length > 0, po.bowls.length + ' games');
}

section('a full cycle');
{
  const before = snap(latest());
  step(); step();
  const after = snap(latest());
  const T = after.teams;
  let full = 0, total = 0;
  for (const id of Object.keys(before.sched)) {
    if (T[id].tier !== 'd1' || !after.sched[id]) continue;
    const opp = s => s.sched[id].filter(x => !x.ps && s.teams[x.o].div === s.teams[id].div).map(x => x.o);
    const n = after.tiers.d1.divs[T[id].div].length;
    total++;
    if (new Set([...opp(before), ...opp(after)]).size >= n - 1) full++;
  }
  check('cycle covers the full division round robin', full === total, full + '/' + total);
}

section('promotion and relegation');
playCycle();
check('Tier I trims to 128', E('S.teams.filter(t=>t.tier==="d1").length') === 128);
check('Tier II absorbs them', E('S.teams.filter(t=>t.tier==="d2").length') === 138);
check('every division at 16', JSON.parse(E('JSON.stringify(DIVS)'))
  .every(dv => E(`S.teams.filter(t=>t.tier==="d1"&&t.div===${JSON.stringify(dv)}).length`) === 16));
check('relegations carry a reason',
  JSON.parse(E('JSON.stringify(S.moves[0].moves)')).filter(m => m.dir === 'down').every(m => m.why));
playCycle();
check('steady state holds after a second cycle',
  E('S.teams.filter(t=>t.tier==="d1").length') === 128 &&
  E('S.teams.filter(t=>t.tier==="d2").length') === 138);
{
  const mv = JSON.parse(E('JSON.stringify(S.moves[0].moves)'));
  check('one up and one down per division',
    mv.filter(m => m.dir === 'up').length === 8 && mv.filter(m => m.dir === 'down').length === 8);
  check('promotions carry a score', mv.filter(m => m.dir === 'up').every(m => /score \d/.test(m.why)));
}

section('rendering');
$('#tabs').children[0].click();
check('league tables render', d.querySelectorAll('#league .divblock').length === 8);
$('#lgView').value = 'list'; w.eval('renderLeague()');
check('one-list view renders with a division index',
  d.querySelectorAll('#league tbody tr').length >= 128 && d.querySelectorAll('.divindex span').length === 8);
$('#lgView').value = 'divisions'; w.eval('renderLeague()');
$('#tabs').children[1].click();
check('map draws a marker per team', d.querySelectorAll('#mapHost .dot').length === 128);
$('#tabs').children[2].click();
check('bracket draws 15 matches and 14 connectors',
  d.querySelectorAll('.brmatch').length === 15 && d.querySelectorAll('.brlines path').length === 14);
$('#tabs').children[3].click();
check('cycles are collapsible', d.querySelectorAll('#moveOut details.cyc').length >= 2);
$('#infoBtn').click();
check('info sheet opens', w.getComputedStyle($('#infoWrap')).display === 'flex');
$('#infoClose').click();
check('info sheet closes', w.getComputedStyle($('#infoWrap')).display === 'none');

console.log('\n' + (failed ? failed + ' failing' : 'all checks passed'));
process.exit(failed ? 1 : 0);
