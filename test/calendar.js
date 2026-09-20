/* The calendar must always close inside WEEKS. Games are edges and weeks are
   colors: with 12 games a team, a pairing met at most twice and 14 weeks,
   Vizing's bound for multigraphs (max degree + multiplicity = 14) says a valid
   calendar always exists, so an overflow week is a scheduler bug, never bad luck.
   Seeded so a regression reproduces exactly. Run: node test/calendar.js */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'dist', 'college-football-pyramid.html');
const HTML = fs.readFileSync(FILE, 'utf8');
// 5, 9, 10, 13, 18 and 19 each overflowed before the chain swap went in; 1 and
// 2 are controls that always fit. Pass a comma-separated list to try others.
const SEEDS = process.argv[2] ? process.argv[2].split(',').map(Number)
                              : [5, 9, 10, 13, 18, 19, 1, 2];
const STEPS = 40;

function run(seed) {
  const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window, E = s => w.eval(s), $ = s => w.document.querySelector(s);
  E(`Math.random = (function(a){ return function(){
       a |= 0; a = a + 0x6D2B79F5 | 0;
       var t = Math.imul(a ^ a >>> 15, 1 | a);
       t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
       return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(${seed});`);
  // assignWeeks returns the last week it used: WEEKS when everything fit. The
  // chain swap rewrites weeks under other games, so re-check the whole calendar
  // it hands back: one game a team a week, and every game actually placed.
  E(`window.__weeks = []; window.__bad = [];
     const _aw = assignWeeks;
     assignWeeks = function(g, tt){
       const r = _aw(g, tt);
       const seen = {}, weeks = {};
       for(const x of g){
         if(!x.week){ window.__bad.push('unplaced game'); continue; }
         for(const id of [x.h.id, x.v.id]){
           const k = id + '@' + x.week;
           if(seen[k]) window.__bad.push(id + ' booked twice in week ' + x.week);
           seen[k] = 1;
           (weeks[id] = weeks[id] || []).push(x.week);
         }
       }
       // Nobody meets the same opponent twice in one regular season.
       const met = {};
       for(const x of g){
         const k = [x.h.id, x.v.id].sort().join('|');
         if(met[k]) window.__bad.push(x.h.name + ' meets ' + x.v.name + ' twice');
         met[k] = 1;
       }
       // Nobody is left a game short: a team that runs out of legal opponents
       // has to be rescued, not quietly written off with eleven.
       for(const t of tt){
         const n = (weeks[t.id] || []).length;
         if(n !== 12) window.__bad.push(t.name + ' plays ' + n + ' games');
       }
       // A team's two byes have to sit BYE_GAP weeks apart or more, so nobody
       // gets a fortnight off and then plays every week to the end.
       for(const id in weeks){
         const on = new Set(weeks[id]), bye = [];
         for(let w = 1; w <= WEEKS; w++) if(!on.has(w)) bye.push(w);
         if(bye.length === 2 && bye[1] - bye[0] < BYE_GAP)
           window.__bad.push(id + ' byes in weeks ' + bye.join(' and '));
       }
       window.__weeks.push(r); return r;
     };`);
  for (let i = 0; i < STEPS; i++) $('#actBtn').click();
  const weeks = JSON.parse(E('JSON.stringify(window.__weeks)'));
  const bad = JSON.parse(E('JSON.stringify(window.__bad)'));
  const cap = E('WEEKS');
  dom.window.close();
  return { runs: weeks.length, over: weeks.filter(x => x > cap), bad, cap };
}

let failed = 0, totalRuns = 0, totalOver = 0;
for (const seed of SEEDS) {
  const r = run(seed);
  totalRuns += r.runs; totalOver += r.over.length;
  const ok = r.over.length === 0 && r.bad.length === 0;
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + 'seed ' + seed +
    '  — ' + r.runs + ' calendars, ' + r.over.length + ' past week ' + r.cap +
    (r.over.length ? ' (weeks used: ' + r.over.join(', ') + ')' : '') +
    (r.bad.length ? ' [' + r.bad.slice(0, 3).join('; ') + ']' : ''));
}
console.log('\n' + totalRuns + ' calendars built, ' + totalOver + ' overflowed');
console.log(failed ? '\n' + failed + ' failing' : '\nall checks passed');
process.exit(failed ? 1 : 0);
