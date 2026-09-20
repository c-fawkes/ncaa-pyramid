const DATA = __DATA__;
const CONFS = DATA.confs, DIVS = DATA.divs;
const CC = {Northeast:'#b388ff', Southeast:'#ff6fa3', Central:'#f9c74f', Western:'#4cc9f0'};
// Two hue-adjacent shades per conference: the halves read as siblings, not strangers.
const DC = {'Northeast A':'#b388ff','Northeast B':'#7b6cf6',
            'Southeast A':'#ff6fa3','Southeast B':'#e94bc6',
            'Central A':'#f9c74f','Central B':'#f3903f',
            'Western A':'#4cc9f0','Western B':'#35d0b0'};
const dcol = d => DC[d] || CC[d.split(' ')[0]] || '#87a292';
const M = DATA.map.meta;

const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e;};
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Put the tooltip beside the thing it describes, never on top of it. Near the
// right edge it flips to the left of the marker rather than being pushed back
// over it; only when neither side fits does it go above or below instead.
function placeTip(tip,x,y){
  const pad=10, gap=14;
  const w=tip.offsetWidth||230, h=tip.offsetHeight||60;
  let left=null, top;
  if(x+gap+w <= innerWidth-pad) left=x+gap;
  else if(x-gap-w >= pad) left=x-gap-w;
  if(left===null){                       // too narrow for either side
    left=Math.max(pad, Math.min(innerWidth-pad-w, x-w/2));
    top = (y-gap-h >= pad) ? y-gap-h : y+gap;
  }else{
    top = y-56;
  }
  tip.style.left=left+'px';
  tip.style.top=Math.max(pad, Math.min(innerHeight-pad-h, top))+'px';
  tip.style.opacity=1;
}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function group(arr,k){const o={};for(const x of arr){(o[x[k]]=o[x[k]]||[]).push(x)}return o;}
const pct = t => t.w+t.l ? t.w/(t.w+t.l) : 0;

function proj(lat,lon){
  const R=Math.PI/180, la=lat*R, lo=lon*R, la0=37.5*R, lo0=-96*R;
  const p1=29.5*R,p2=45.5*R, n=.5*(Math.sin(p1)+Math.sin(p2));
  const C=Math.cos(p1)**2+2*n*Math.sin(p1);
  const rho=Math.sqrt(C-2*n*Math.sin(la))/n, rho0=Math.sqrt(C-2*n*Math.sin(la0))/n;
  const th=n*(lo-lo0);
  return [rho*Math.sin(th)*6371,(rho0-rho*Math.cos(th))*6371];
}
function screenXY(t){
  if(t.st==='HI') return [64,512];
  const [x,y]=proj(t.lat,t.lon);
  return [M.ox+(x-M.minx)*M.sc, M.oy+(M.maxy-y)*M.sc];
}

/* ---------- state ---------- */
// Everything the promotion and relegation rules need, accumulated across the
// two seasons of a cycle rather than read off a single year.
function blankCycle(){
  return {cw:0,cl:0, ccw:0,ccl:0, cpd:0, copp:0,cgm:0, crk:0,crkN:0, cpo:0, ch2h:{}};
}
const PD_CAP=21;                        // margin credited per game, so nobody
                                        // escapes the drop by burying cupcakes
const cycPct  = t => t.cw+t.cl ? t.cw/(t.cw+t.cl) : 0;
const confPct = t => t.ccw+t.ccl ? t.ccw/(t.ccw+t.ccl) : 0;
const cycSos  = t => t.cgm ? t.copp/t.cgm : 0;
const cycRank = t => t.crkN ? t.crk/t.crkN : 999;
let S;
function boot(){
  const mk = r => Object.assign({}, r, {base:r.rating, w:0,l:0,dw:0,dl:0,pf:0,pa:0,opps:[]}, blankCycle());
  S = {season:2027, inCycle:0, cycle:1, phase:'pre', teams:[...DATA.d1,...DATA.d2].map(mk),
       snaps:[], view:0, moves:[]};
}
boot();
const byId = () => Object.fromEntries(S.teams.map(t=>[t.id,t]));
const tierTeams = tr => S.teams.filter(t=>t.tier===tr);
const sizeOf = tr => tierTeams(tr).length;
const snap = () => S.snaps[S.view];
// The opening preseason is built down in the wiring, not here: drawing up a
// schedule needs WEEKS and the schedule builder, which are defined further down.

/* ---------- schedule building ---------- */
// A rivalry is played three years in four. Which year it sits out depends on
// the pairing, so the league is never short of rivalry weekends all at once.
function rivalOn(a,b,year){
  const k=(a.id<b.id?a.id+b.id:b.id+a.id);
  let h=0; for(let i=0;i<k.length;i++) h=(h*31+k.charCodeAt(i))>>>0;
  return (year+h)%4 !== 0;
}
function divisionOrder(list,year){
  const pool=[...list].sort((a,b)=>a.lon-b.lon);
  const out=[], used=new Set();
  let cur=pool[0];
  while(out.length<pool.length){
    out.push(cur); used.add(cur.id);
    let nxt=null;
    if(cur.rival){
      const c=pool.find(t=>t.name===cur.rival && !used.has(t.id));
      if(c && rivalOn(cur,c,year)) nxt=c;
    }
    if(!nxt) nxt=pool.find(t=>!used.has(t.id));
    if(!nxt) break;
    cur=nxt;
  }
  return out;
}
// A division's full slate is split across the two seasons of a cycle using
// circulant offsets. Offsets 1..m each pair every team with two others; when the
// division has an even size, offset n/2 is a perfect matching worth one game.
// Season A takes the low offsets, season B the rest, so together they cover the
// complete round robin: every team plays every division mate once per cycle.
function divSlate(n, half){
  const even = n%2===0, m = even ? n/2-1 : (n-1)/2;
  const aN = Math.ceil(m/2);
  const offs = [];
  for(let o=1;o<=m;o++) if((o<=aN)===(half===0)) offs.push(o);
  let match = false;
  if(even){
    const degA = 2*aN, degB = 2*(m-aN);
    match = (degA<=degB ? 0 : 1) === half;
  }
  return {offs, match, deg: 2*offs.length + (match?1:0)};
}
function buildSchedule(tier,year,half){
  const teams=tierTeams(tier), byDiv=group(teams,'div');
  const seen=new Set(), games=[], cnt={}, home={}, dc={}, xc={}, dcap={};
  teams.forEach(t=>{cnt[t.id]=0;home[t.id]=0;dc[t.id]=0;xc[t.id]=0;});
  const slate={};
  for(const d of Object.keys(byDiv)){
    slate[d]=divSlate(byDiv[d].length, half);
    for(const t of byDiv[d]) dcap[t.id]=slate[d].deg;
  }
  const key=(a,b)=> a.id<b.id ? a.id+'|'+b.id : b.id+'|'+a.id;
  const bucket=(a,b)=> a.div===b.div ? 'div' : (a.conf===b.conf ? 'cross' : 'nc');
  function add(a,b,type,force){
    if(a===b) return false;
    const k=key(a,b); if(seen.has(k)) return false;
    if(cnt[a.id]>=12||cnt[b.id]>=12) return false;
    const bk=bucket(a,b);
    // the allotment is a hard ceiling; a rivalry rematch is the one thing that
    // may sit on top of it, and it spends an outside slot to do so
    if(bk==='div' && type!=='rivalry' && (dc[a.id]>=dcap[a.id]||dc[b.id]>=dcap[b.id])) return false;
    if(!force && bk==='cross' && (xc[a.id]>=3||xc[b.id]>=3)) return false;
    seen.add(k); cnt[a.id]++; cnt[b.id]++;
    if(bk==='div'){ if(type!=='rivalry'){dc[a.id]++;dc[b.id]++;} }
    else if(bk==='cross'){xc[a.id]++;xc[b.id]++;}
    const hA = home[a.id]<=home[b.id];
    const h = hA?a:b, v = hA?b:a; home[h.id]++;
    games.push({h,v,type:type||bk}); return true;
  }
  for(const d of Object.keys(byDiv)){
    // order has to stay put across the cycle or the two halves stop dovetailing
    const o=[...byDiv[d]].sort((a,b)=>a.id<b.id?-1:1), n=o.length, sl=slate[d];
    for(const off of sl.offs) for(let i=0;i<n;i++) add(o[i],o[(i+off)%n],null);
    if(sl.match) for(let i=0;i<n/2;i++) add(o[i],o[i+n/2],null);
  }
  // Rivalries come next, ahead of every other outside game. If the pair already
  // met on the slate this is a no-op; otherwise the game is purely additive and
  // spends an outside slot, which is how a rivalry survives back-to-back years
  // without anyone's division allotment moving.
  for(const t of teams){
    if(!t.rival) continue;
    const r=teams.find(x=>x.name===t.rival);
    if(!r || t.id>r.id) continue;
    if(rivalOn(t,r,year)) add(t,r,'rivalry');
  }
  for(const c of CONFS){
    const ds=DIVS.filter(x=>x.indexOf(c+' ')===0);
    const A=byDiv[ds[0]]||[], B=byDiv[ds[1]]||[];
    if(!A.length||!B.length) continue;
    for(let k=0;k<3;k++){const off=year*3+k;
      for(let i=0;i<A.length;i++) add(A[i],B[(i+off)%B.length],'cross');}
    for(let k=0;k<3;k++){const off=year*3+k;
      for(let i=0;i<B.length;i++) add(B[i],A[(i+off)%A.length],'cross');}
  }
  // Two division mates can end up needing one more game each with nobody legal
  // left: everyone outside their division is full, and the one pairing they
  // have left is with each other, which their division allotment forbids. So
  // take a game between two teams neither of them has met and split it — c
  // plays a, d plays b. c and d stay on twelve and both of these reach it.
  function rescue(a,b){
    if(!a||!b||a===b) return false;
    const pairOK=(x,y)=> x!==y && bucket(x,y)!=='div' && !seen.has(key(x,y)) && cnt[y.id]>=12;
    for(const g of games){
      const c=g.h, d=g.v;
      if(c===a||c===b||d===a||d===b) continue;
      // never rob the division slate or a rivalry: one is the round robin the
      // cycle has to cover, the other is the game people came for
      if(bucket(c,d)==='div' || g.type==='rivalry') continue;
      let x=null,y=null;
      if(pairOK(a,c)&&pairOK(b,d)) { x=c; y=d; }
      else if(pairOK(a,d)&&pairOK(b,c)) { x=d; y=c; }
      else continue;
      // unpick the donor game, giving its two teams a slot back each
      games.splice(games.indexOf(g),1);
      seen.delete(key(c,d));
      cnt[c.id]--; cnt[d.id]--; home[g.h.id]--;
      if(bucket(c,d)==='cross'){ xc[c.id]--; xc[d.id]--; }
      add(a,x,null,true); add(b,y,null,true);
      return true;
    }
    return false;
  }
  const mean=teams.reduce((s,t)=>s+t.rating,0)/teams.length;
  const oppSum={}; teams.forEach(t=>oppSum[t.id]=0);
  for(const g of games){oppSum[g.h.id]+=g.v.rating; oppSum[g.v.id]+=g.h.rating;}
  const dev=(t,addR)=>Math.abs((oppSum[t.id]+addR)/12-mean);
  let guard=0;
  while(guard++<6000){
    const open=teams.filter(t=>cnt[t.id]<12);
    if(open.length<2) break;
    open.sort((a,b)=>(12-cnt[b.id])-(12-cnt[a.id])||b.rating-a.rating);
    const a=open[0];
    let best=null;
    const eligible = b => b!==a && !seen.has(key(a,b)) &&
      !(bucket(a,b)==='div' && (dc[a.id]>=dcap[a.id]||dc[b.id]>=dcap[b.id]));
    for(const b of open){
      if(!eligible(b)) continue;
      const sc=Math.abs(a.rating-b.rating)+2.2*(dev(a,b.rating)+dev(b,a.rating))+(b.conf===a.conf?26:0);
      if(!best||sc<best.sc) best={b,sc};
    }
    if(!best){
      // Nothing new left for this team. Rather than send it out against someone
      // it has already played, take a game off two teams that are full and
      // split it, which finds fresh opponents for both of the teams still short.
      if(rescue(a,open.find(x=>x!==a))) continue;
      // only if even that fails: a replay outside the division beats a hole
      const b=open.find(x=>x!==a && bucket(a,x)!=='div');
      if(!b){ cnt[a.id]=12; continue; }
      seen.delete(key(a,b)); add(a,b,null,true); continue;
    }
    oppSum[a.id]+=best.b.rating; oppSum[best.b.id]+=a.rating;
    add(a,best.b,null,true);
  }
  assignWeeks(games, teams);
  return games;
}

// Spread the finished slate across a fourteen-week calendar: each week takes a
// maximal set of games whose teams are both free, teams carrying the most games
// left going first. Division games stop clumping at the front and everybody ends
// up with at least one open Saturday.
const WEEKS=14;
const BYE_GAP=5;                        // a team's two byes sit at least this
                                        // far apart, so never within four weeks
function assignWeeks(games, teams){
  const busy={}, left={};
  teams.forEach(t=>{ busy[t.id]=new Map(); left[t.id]=0; });
  for(const g of games){ left[g.h.id]++; left[g.v.id]++; }
  let rest=games.slice();
  for(let i=rest.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=rest[i]; rest[i]=rest[j]; rest[j]=t; }
  const place=(g,wk)=>{ g.week=wk; busy[g.h.id].set(wk,g); busy[g.v.id].set(wk,g); };
  const lift=g=>{ busy[g.h.id].delete(g.week); busy[g.v.id].delete(g.week); g.week=null; };
  const freeWeek=(g,skip)=>{
    for(let wk=1;wk<=WEEKS;wk++)
      if(wk!==skip && !busy[g.h.id].has(wk) && !busy[g.v.id].has(wk)) return wk;
    return 0;
  };
  // Work the weeks in random order rather than first to last, or the early
  // Saturdays fill solid and every bye lands in November.
  const order=[]; for(let k=1;k<=WEEKS;k++) order.push(k);
  for(let i=order.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=order[i]; order[i]=order[j]; order[j]=t; }
  for(const wk of order){
    if(!rest.length) break;
    rest.sort((a,b)=>(left[b.h.id]+left[b.v.id])-(left[a.h.id]+left[a.v.id]));
    const used=new Set(), next=[];
    for(const g of rest){
      if(!used.has(g.h.id) && !used.has(g.v.id)){
        place(g,wk); used.add(g.h.id); used.add(g.v.id);
        left[g.h.id]--; left[g.v.id]--;
      } else next.push(g);
    }
    rest=next;
  }
  const freeList=id=>{ const f=[]; for(let wk=1;wk<=WEEKS;wk++) if(!busy[id].has(wk)) f.push(wk); return f; };
  // Last resort for a game whose two teams share no open Saturday. Weeks are
  // colors on a graph of games: pick a week a that u has open and a week b that
  // v has open, then walk the chain of games out of v that alternates a, b, a...
  // No team owns more than one game a week, so that chain is a simple path and
  // swapping a for b along the whole of it leaves every other team just as
  // legal as before — but frees week a at v. It fails only if the chain runs all
  // the way to u, so try it from both ends and over every pair of open weeks.
  // With twelve games a team, a pairing met at most twice and fourteen weeks,
  // Vizing's bound says a valid calendar always exists; this is what finds it.
  const kempe=g=>{
    for(const [u,v] of [[g.h.id,g.v.id],[g.v.id,g.h.id]]){
      for(const a of freeList(u)) for(const b of freeList(v)){
        if(a===b){ place(g,a); return true; }
        const chain=[], seen=new Set(); let node=v, want=a;
        for(;;){
          const e=busy[node].get(want);
          if(!e || seen.has(e)) break;      // ends, or closes a cycle
          seen.add(e);
          chain.push({e, to: want===a?b:a});
          node = e.h.id===node ? e.v.id : e.h.id;
          want = want===a ? b : a;
        }
        if(node===u) continue;          // chain reaches the other team; try another pair
        for(const c of chain) lift(c.e);
        for(const c of chain) place(c.e,c.to);
        place(g,a); return true;
      }
    }
    return false;
  };
  // anything still homeless: take a free week, or bump a game that has one
  const stuck=[];
  for(const g of rest){
    const wk=freeWeek(g);
    if(wk){ place(g,wk); continue; }
    let done=false;
    for(let w=1; w<=WEEKS && !done; w++){
      for(const side of [g.h.id, g.v.id]){
        const other = side===g.h.id ? g.v.id : g.h.id;
        if(busy[side].has(w) || !busy[other].has(w)) continue;
        const blocker=busy[other].get(w);
        lift(blocker);
        const alt=freeWeek(blocker,w);
        if(alt){ place(blocker,alt); place(g,w); done=true; break; }
        place(blocker,w);
      }
    }
    if(!done && kempe(g)) done=true;
    if(!done) stuck.push(g);
  }
  // Twelve games in fourteen weeks leaves everyone two Saturdays off, and two
  // of them close together means one long grind either side of a fortnight's
  // rest. To move a bye off week b to week a, walk the chain of games out of the
  // team alternating between those two weeks and swap them along it: the team
  // ends up playing in b and idle in a. Everyone in the middle of the chain
  // holds a game in both weeks, so their byes do not move at all — only the far
  // end of the chain trades one for the other, and if that crowds it the swap
  // goes back.
  const byesOf=id=>{ const b=[]; for(let wk=1;wk<=WEEKS;wk++) if(!busy[id].has(wk)) b.push(wk); return b; };
  const tight=id=>{ const b=byesOf(id); return b.length===2 && b[1]-b[0]<BYE_GAP; };
  const walk=(from,a,b2)=>{
    const chain=[], seen=new Set(); let node=from, want=b2;
    for(;;){
      const e=busy[node].get(want);
      if(!e || seen.has(e)) break;          // ends, or closes a cycle
      seen.add(e);
      chain.push({e, from:want, to: want===a?b2:a});
      node = e.h.id===node ? e.v.id : e.h.id;
      want = want===a ? b2 : a;
    }
    return {chain, end:node};
  };
  const shift=(chain,back)=>{
    for(const c of chain) lift(c.e);
    for(const c of chain) place(c.e, back?c.from:c.to);
  };
  // Two rounds. The first only takes swaps that leave nobody worse off. If any
  // team is still boxed in after that, the second lets the problem be handed to
  // the far end of the chain instead, which is usually easier to place from
  // there; a team can only be handed it twice, so this cannot ring around
  // forever.
  const spoiled={};
  for(let round=0;round<2;round++){
    const trade=round===1;
    for(let pass=0;pass<60;pass++){
      const bad=teams.filter(t=>tight(t.id));
      if(!bad.length) break;
      let moved=false;
      for(const t of bad){
        if(!tight(t.id)) continue;
        const b=byesOf(t.id);
        let done=false;
        for(const target of b){
          const keep = target===b[0] ? b[1] : b[0];
          for(let w=1;w<=WEEKS && !done;w++){
            if(!busy[t.id].has(w)) continue;            // already a bye
            if(Math.abs(w-keep)<BYE_GAP) continue;      // would not settle it
            const {chain,end}=walk(t.id,target,w);
            if(!chain.length || end===t.id) continue;
            const endWas=tight(end);
            shift(chain,false);
            const spoils=tight(end)&&!endWas;
            const ok = !tight(t.id) && (!spoils || (trade && (spoiled[end]||0)<2));
            if(!ok){ shift(chain,true); continue; }
            if(spoils) spoiled[end]=(spoiled[end]||0)+1;
            done=true; moved=true;
          }
          if(done) break;
        }
      }
      if(!moved) break;
    }
  }
  let over=WEEKS;
  for(const g of stuck){ over++; place(g,over); }
  return over;
}

/* ---------- simulation ---------- */
function simGame(g){
  const m=(g.h.rating-g.v.rating)*.52+2.6+gauss()*13;
  const tot=46+(g.h.rating+g.v.rating-100)*.07+gauss()*10;
  let hs=Math.max(0,Math.round((tot+m)/2)), vs=Math.max(0,Math.round((tot-m)/2));
  if(hs===vs){ if(m>=0) hs+=3; else vs+=3; }
  g.hs=hs; g.vs=vs;
  const W=hs>vs?g.h:g.v, L=hs>vs?g.v:g.h;
  W.w++; L.l++; W.cw++; L.cl++;
  if(g.h.conf===g.v.conf){ W.ccw++; L.ccl++; }
  const mg=Math.min(PD_CAP, Math.abs(hs-vs));
  W.cpd+=mg; L.cpd-=mg;
  W.ch2h[L.id]=(W.ch2h[L.id]||0)+1; L.ch2h[W.id]=(L.ch2h[W.id]||0)-1;
  g.h.copp+=g.v.rating; g.h.cgm++; g.v.copp+=g.h.rating; g.v.cgm++;
  g.h.pf+=hs; g.h.pa+=vs; g.v.pf+=vs; g.v.pa+=hs;
  g.h.opps.push(g.v.rating); g.v.opps.push(g.h.rating);
  if(g.h.div===g.v.div){W.dw++; L.dl++;}   // label may say 'rivalry'; the division still counts it
  return g;
}
const sos = t => t.opps.length ? t.opps.reduce((a,b)=>a+b,0)/t.opps.length : 50;
const cscore = t => t.w*100+(t.pf-t.pa)*.4+sos(t)*1.5+t.rating*.8;

function h2h(games,a,b){
  const g=games.find(x=>(x.h===a&&x.v===b)||(x.h===b&&x.v===a));
  if(!g) return 0;
  return (g.hs>g.vs?g.h:g.v)===a ? -1 : 1;
}
function standings(tier,games){
  const out={};
  for(const d of DIVS){
    const list=tierTeams(tier).filter(t=>t.div===d);
    if(!list.length) continue;
    list.sort((a,b)=>{
      const pa=a.dw+a.dl?a.dw/(a.dw+a.dl):0, pb=b.dw+b.dl?b.dw/(b.dw+b.dl):0;
      if(pb!==pa) return pb-pa;
      const h=h2h(games,a,b); if(h) return h;
      if(pct(b)!==pct(a)) return pct(b)-pct(a);
      return cscore(b)-cscore(a);
    });
    out[d]=list;
  }
  return out;
}
function playoff(tier,tbl,year){
  const dws=[], rest=[];
  for(const d of DIVS){const l=tbl[d]; if(!l) continue; dws.push(l[0]); rest.push(...l.slice(1));}
  if(dws.length<8) return null;
  const at=rest.sort((a,b)=>cscore(b)-cscore(a)).slice(0,16);
  const neutral=g=>{
    const m=(g.h.rating-g.v.rating)*.52+gauss()*13;
    const tot=46+(g.h.rating+g.v.rating-100)*.07+gauss()*10;
    let hs=Math.max(0,Math.round((tot+m)/2)),vs=Math.max(0,Math.round((tot-m)/2));
    if(hs===vs){m>=0?hs+=3:vs+=3;}
    g.hs=hs;g.vs=vs;g.win=hs>vs?g.h:g.v;g.lose=hs>vs?g.v:g.h;return g;};
  // conference title games move around the membership, one campus a year
  const ccg=CONFS.map(c=>{
    const pair=dws.filter(t=>t.conf===c).sort((x,y)=>cscore(y)-cscore(x));
    const mem=tierTeams(tier).filter(t=>t.conf===c).sort((a,b)=>a.id<b.id?-1:1);
    const host=mem[year%Math.max(1,mem.length)];
    return neutral({h:pair[0],v:pair[1],label:c+' championship',
      city:host?host.city+', '+host.st:''});});
  const champs=ccg.map(g=>g.win).sort((a,b)=>cscore(b)-cscore(a));
  const runners=ccg.map(g=>g.lose).sort((a,b)=>cscore(b)-cscore(a));
  const BW=bowlPlan(tier,year);
  const pin=[]; for(let i=0;i<8;i++) pin.push(neutral({h:at[i],v:at[15-i],label:'Play-in',
    bowl:BW.pin[i][0], city:BW.pin[i][1]}));
  const pw=pin.map(g=>g.win).sort((a,b)=>cscore(b)-cscore(a));
  const seeds=[...champs,...runners,...pw];
  const order=[1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11];
  let live=order.map(s=>seeds[s-1]);
  const rounds=[], names=['Round of 16','Quarterfinals','Semifinals','Championship'];
  const pools=[BW.r16,BW.qf,BW.sf,null];
  const site=NFL_SITES[year%NFL_SITES.length];
  for(let r=0;r<4;r++){
    const gs=[];
    for(let i=0;i<live.length;i+=2)
      gs.push(neutral({h:live[i],v:live[i+1],label:names[r],
        bowl: pools[r] ? pools[r][i/2][0] : 'National Championship',
        city: pools[r] ? pools[r][i/2][1] : site[0]+' \u2014 '+site[1]}));
    rounds.push({name:names[r],games:gs});
    live=gs.map(g=>g.win);
  }
  // whatever the playoff did not claim still gets played
  const inField=new Set([...dws,...at].map(t=>t.id));
  const spare=tierTeams(tier).filter(t=>!inField.has(t.id) && t.w>=6)   // real bowl eligibility
    .sort((a,b)=>cscore(b)-cscore(a));
  const bowls=[];
  for(let i=0;i+1<spare.length && bowls.length<BW.extra.length;i+=2){
    const bw=BW.extra[bowls.length];
    bowls.push(neutral({h:spare[i],v:spare[i+1],label:'Bowl game',bowl:bw[0],city:bw[1]}));
  }
  return {ccg,pin,seeds,rounds,champion:live[0],at,bowls};
}

/* ---------- bowls ---------- */
// The six majors rotate: two host semifinals and four host quarterfinals, and
// which is which shifts every year. The rest of the slate rotates too — sixteen
// are pulled into the play-in and round of 16, and whatever is left over hosts
// the teams that missed the field.
const BOWLSETS = {
  d1:{
    major:[
      ['Rose Bowl','Pasadena, CA'],['Sugar Bowl','New Orleans, LA'],
      ['Orange Bowl','Miami Gardens, FL'],['Cotton Bowl','Arlington, TX'],
      ['Fiesta Bowl','Glendale, AZ'],['Peach Bowl','Atlanta, GA']
    ],
    minor:[
      ['Citrus Bowl','Orlando, FL'],['Alamo Bowl','San Antonio, TX'],
      ['ReliaQuest Bowl','Tampa, FL'],['Gator Bowl','Jacksonville, FL'],
      ['Music City Bowl','Nashville, TN'],['Holiday Bowl','San Diego, CA'],
      ['Las Vegas Bowl','Las Vegas, NV'],['Sun Bowl','El Paso, TX'],
      ['Pinstripe Bowl','Bronx, NY'],['Texas Bowl','Houston, TX'],
      ['Liberty Bowl','Memphis, TN'],["Duke's Mayo Bowl",'Charlotte, NC'],
      ['Pop-Tarts Bowl','Orlando, FL'],['Armed Forces Bowl','Fort Worth, TX'],
      ['Military Bowl','Annapolis, MD'],['Birmingham Bowl','Birmingham, AL'],
      ['First Responder Bowl','Dallas, TX'],['Fenway Bowl','Boston, MA'],
      ['Rate Bowl','Phoenix, AZ'],['GameAbove Sports Bowl','Detroit, MI'],
      ['Independence Bowl','Shreveport, LA'],['Arizona Bowl','Tucson, AZ'],
      ['New Mexico Bowl','Albuquerque, NM'],['Frisco Bowl','Frisco, TX'],
      ['Boca Raton Bowl','Boca Raton, FL'],['New Orleans Bowl','New Orleans, LA'],
      ['Cure Bowl','Orlando, FL'],['Gasparilla Bowl','Tampa, FL'],
      ['Myrtle Beach Bowl','Conway, SC'],['LA Bowl','Inglewood, CA'],
      ['Hawaii Bowl','Honolulu, HI'],['Idaho Potato Bowl','Boise, ID'],
      ['68 Ventures Bowl','Mobile, AL'],['Salute to Veterans Bowl','Montgomery, AL'],
      ['Bahamas Bowl','Nassau, Bahamas'],['Celebration Bowl','Atlanta, GA']
    ]
  },
  d2:{
    major:[
      ['Heartland Bowl','Des Moines, IA'],['Tidewater Bowl','Norfolk, VA'],
      ['Cascade Bowl','Eugene, OR'],['Ozark Bowl','Springfield, MO'],
      ['Piedmont Bowl','Greensboro, NC'],['Bayou Bowl','Lafayette, LA']
    ],
    minor:[
      ['Prairie Bowl','Lincoln, NE'],['Granite Bowl','Manchester, NH'],
      ['Redwood Bowl','Eureka, CA'],['Delta Bowl','Greenville, MS'],
      ['Badlands Bowl','Rapid City, SD'],['Sandhills Bowl','Pinehurst, NC'],
      ['Blue Ridge Bowl','Asheville, NC'],['Rio Grande Bowl','Las Cruces, NM'],
      ['Foothills Bowl','Boulder, CO'],['Lakeshore Bowl','Erie, PA'],
      ['Copper Bowl','Butte, MT'],['Harvest Bowl','Fargo, ND'],
      ['Ironwood Bowl','Duluth, MN'],['Pine Belt Bowl','Hattiesburg, MS'],
      ['Salt Flats Bowl','Ogden, UT'],['Tallgrass Bowl','Topeka, KS'],
      ['Cypress Bowl','Lake Charles, LA'],['Driftwood Bowl','Wilmington, NC'],
      ['Chinook Bowl','Spokane, WA'],['Mesa Bowl','Flagstaff, AZ'],
      ['Timberline Bowl','Missoula, MT'],['Bluegrass Bowl','Lexington, KY'],
      ['Cobblestone Bowl','Providence, RI'],['Lighthouse Bowl','Portland, ME'],
      ['Riverbend Bowl','Chattanooga, TN'],['Sagebrush Bowl','Reno, NV'],
      ['Windward Bowl','Corpus Christi, TX'],['Quarry Bowl','Bloomington, IN'],
      ['Sandstone Bowl','St. George, UT'],['Foundry Bowl','Youngstown, OH']
    ]
  }
};

// The title game moves between NFL buildings.
const NFL_SITES = [
  ['Hard Rock Stadium','Miami Gardens, FL'],['AT&T Stadium','Arlington, TX'],
  ['SoFi Stadium','Inglewood, CA'],['Mercedes-Benz Stadium','Atlanta, GA'],
  ['Lucas Oil Stadium','Indianapolis, IN'],['NRG Stadium','Houston, TX'],
  ['State Farm Stadium','Glendale, AZ'],['Caesars Superdome','New Orleans, LA'],
  ['Allegiant Stadium','Las Vegas, NV'],['Ford Field','Detroit, MI'],
  ['U.S. Bank Stadium','Minneapolis, MN'],["Levi's Stadium",'Santa Clara, CA'],
  ['MetLife Stadium','East Rutherford, NJ'],['Lumen Field','Seattle, WA'],
  ['Bank of America Stadium','Charlotte, NC'],['Raymond James Stadium','Tampa, FL'],
  ['Nissan Stadium','Nashville, TN'],['Arrowhead Stadium','Kansas City, MO'],
  ['Empower Field','Denver, CO'],['Lincoln Financial Field','Philadelphia, PA']
];

function bowlPlan(tier,year){
  const set=BOWLSETS[tier]||BOWLSETS.d1;
  const rot=(arr,k)=>arr.slice(k%arr.length).concat(arr.slice(0,k%arr.length));
  const maj=rot(set.major, year);
  const min=rot(set.minor, (year*16)%set.minor.length);
  return {sf:maj.slice(0,2), qf:maj.slice(2,6),
          pin:min.slice(0,8), r16:min.slice(8,16), extra:min.slice(16)};
}

/* ---------- season ---------- */
function makePre(){
  const sn={kind:'pre', season:S.season, weeks:WEEKS, teams:{}, rank:{}, sched:{},
    tiers:{}, quota:{}, fixtures:{}};
  for(const t of S.teams) sn.teams[t.id]={name:t.name,city:t.city,st:t.st,conf:t.conf,
    div:t.div,tier:t.tier,rival:t.rival,rating:Math.round(t.rating)};
  for(const tr of ['d1','d2']){
    const ranked=tierTeams(tr).slice().sort((a,b)=>b.rating-a.rating);
    ranked.forEach((t,i)=>{sn.rank[t.id]=i+1;});
    const divs={};
    for(const d of DIVS){
      const ids=ranked.filter(t=>t.div===d).map(t=>t.id);
      if(ids.length) divs[d]=ids;
    }
    sn.tiers[tr]={divs:divs, at:[], seedOf:{}, po:null};
  }
  // The season is drawn up now rather than at kickoff, so the preseason can show
  // what everyone actually plays. playSeason takes these same games, so the
  // fixtures on screen are the ones that get played, not a preview of them.
  const yr=S.season-2027;
  const push=(id,o)=>{(sn.sched[id]=sn.sched[id]||[]).push(o);};
  for(const tr of ['d1','d2']){
    const games=buildSchedule(tr,yr,S.inCycle%2);
    sn.fixtures[tr]=games;
    for(const g of games){
      push(g.h.id,{o:g.v.id,home:true,t:g.type,wk:g.week});
      push(g.v.id,{o:g.h.id,home:false,t:g.type,wk:g.week});
    }
  }
  return sn;
}
function advance(){
  if(S.phase!=='done' || S.inCycle>=2) return;
  if($('#driftBox').checked){
    for(const t of S.teams){
      const mean=t.tier==='d1'?60:20;
      t.rating=Math.max(1,Math.min(99,t.rating+gauss()*3.4-(t.rating-mean)*.045));
    }
  }
  S.season++; S.phase='pre';
  S.snaps.push(makePre());
  S.view=S.snaps.length-1;
}
function playSeason(){
  for(const t of S.teams){t.w=t.l=t.dw=t.dl=t.pf=t.pa=0;t.opps=[];}
  const yr=S.season-2027, res={};
  const pre=S.snaps[S.snaps.length-1];
  const drawn = pre && pre.kind==='pre' && pre.season===S.season && pre.fixtures;
  for(const tr of ['d1','d2']){
    const games = drawn ? pre.fixtures[tr] : buildSchedule(tr,yr,S.inCycle%2);
    games.forEach(simGame);
    const tbl=standings(tr,games);
    res[tr]={games,tbl,po:playoff(tr,tbl,yr)};
  }
  S.inCycle++;
  const sn0=makeSnap(res);
  for(const t of S.teams){ if(sn0.rank[t.id]){ t.crk+=sn0.rank[t.id]; t.crkN++; } }
  for(const tr of ['d1','d2']){
    const po=res[tr].po; if(!po) continue;
    const seenT=new Set();
    for(const g of [...po.ccg,...po.pin,...po.rounds.flatMap(r=>r.games)]){
      for(const t of [g.h,g.v]) if(!seenT.has(t.id)){ seenT.add(t.id); t.cpo+=1; }
      g.win.cpo+=1;
    }   // po.bowls are consolation games and earn nothing
  }
  S.snaps.push(sn0);
  S.view=S.snaps.length-1;
  S.phase='done';
}
const fg = g => ({h:g.h.id,v:g.v.id,hs:g.hs,vs:g.vs,label:g.label,bowl:g.bowl||null,city:g.city||null});
function makeSnap(res){
  const sn={kind:'season', season:S.season, weeks:WEEKS, inCycle:S.inCycle, cycle:S.cycle,
    tiers:{}, rank:{}, teams:{}, sched:{},
    quota:Object.fromEntries(DIVS.map(d=>[d,quotaFor(d)]))};
  for(const t of S.teams){
    sn.teams[t.id]={name:t.name,city:t.city,st:t.st,conf:t.conf,div:t.div,tier:t.tier,
      rival:t.rival,rating:Math.round(t.rating),w:t.w,l:t.l,dw:t.dw,dl:t.dl,pf:t.pf,pa:t.pa,
      cw:t.cw,cl:t.cl,sos:Math.round(sos(t)),cs:Math.round(cscore(t))};
  }
  for(const tr of ['d1','d2']){
    const ranked=tierTeams(tr).slice().sort((a,b)=>cscore(b)-cscore(a));
    ranked.forEach((t,i)=>sn.rank[t.id]=i+1);
    tierTeams(tr).slice().sort((a,b)=>sos(b)-sos(a))
      .forEach((t,i)=>{sn.teams[t.id].sosRank=i+1;});
    const po=res[tr].po;
    sn.tiers[tr]={
      divs:Object.fromEntries(DIVS.filter(d=>res[tr].tbl[d]).map(d=>[d,res[tr].tbl[d].map(t=>t.id)])),
      at:po?po.at.map(t=>t.id):[],
      seedOf:po?Object.fromEntries(po.seeds.map((t,i)=>[t.id,i+1])):{},
      po:po?{ccg:po.ccg.map(fg),pin:po.pin.map(fg),bowls:po.bowls.map(fg),
        rounds:po.rounds.map(r=>({name:r.name,games:r.games.map(fg)})),
        champion:po.champion.id}:null
    };
  }
  const push=(id,o)=>{(sn.sched[id]=sn.sched[id]||[]).push(o);};
  for(const tr of ['d1','d2']){
    for(const g of res[tr].games){
      push(g.h.id,{o:g.v.id,home:true,f:g.hs,a:g.vs,t:g.type,wk:g.week});
      push(g.v.id,{o:g.h.id,home:false,f:g.vs,a:g.hs,t:g.type,wk:g.week});
    }
    const po=res[tr].po; if(!po) continue;
    for(const g of [...po.ccg,...po.pin,...po.rounds.flatMap(r=>r.games)]){
      push(g.h.id,{o:g.v.id,home:null,f:g.hs,a:g.vs,t:g.label,b:g.bowl||null,c:g.city||null,ps:1});
      push(g.v.id,{o:g.h.id,home:null,f:g.vs,a:g.hs,t:g.label,b:g.bowl||null,c:g.city||null,ps:1});
    }
    for(const g of po.bowls){
      push(g.h.id,{o:g.v.id,home:null,f:g.hs,a:g.vs,t:g.label,b:g.bowl,c:g.city,ps:1,x:1});
      push(g.v.id,{o:g.h.id,home:null,f:g.vs,a:g.hs,t:g.label,b:g.bowl,c:g.city,ps:1,x:1});
    }
  }
  return sn;
}

/* ---------- promotion & relegation ---------- */
const quotaFor = d => S.cycle>1 ? 1 : Math.max(0,tierTeams('d1').filter(t=>t.div===d).length-16);

// Relegation: worst combined two-year record, then down the ladder.
const REL_STEPS=[
  ['two-year record',      (a,b)=> cycPct(a)-cycPct(b),   (t)=> t.cw+'-'+t.cl],
  ['conference record',    (a,b)=> confPct(a)-confPct(b), (t)=> t.ccw+'-'+t.ccl],
  ['head to head',         (a,b)=> (a.ch2h[b.id]||0),     (t,o)=> {const n=t.ch2h[o.id]||0; return n>0?'won '+n:(n<0?'lost '+(-n):'split');}],
  ['point differential',   (a,b)=> a.cpd-b.cpd,           (t)=> (t.cpd>0?'+':'')+t.cpd],
  ['strength of schedule', (a,b)=> cycSos(a)-cycSos(b),   (t)=> cycSos(t).toFixed(1)],
  ['playoff ranking',      (a,b)=> cycRank(b)-cycRank(a), (t)=> '#'+cycRank(t).toFixed(0)],
  ['random draw',          ()=> Math.random()-0.5,        ()=> 'drawn']
];
const REL_FMT = Object.fromEntries(REL_STEPS.map(x=>[x[0],x[2]]));
function relCompare(a,b){
  for(const st of REL_STEPS){
    const v=st[1](a,b);
    if(v>1e-9||v<-1e-9) return {v:v, why:st[0]};
  }
  return {v:0, why:'random draw'};
}

// Promotion: a weighted two-year score, so a soft schedule and a gaudy record
// is not by itself a ticket up.
const PRO_W={record:.60, playoff:.20, sos:.10, rank:.10};
// A season is worth one point for reaching the field and one per win, and the
// deepest possible run is five games, so six is a perfect playoff season.
// Scoring against that rather than against the division's best run means a
// division where nobody went far hands out a low playoff score to everybody.
const PO_PERFECT=6;
function promotionScores(pool){
  const n=pool.length||1;
  const sosV=pool.map(cycSos), lo=Math.min(...sosV), hi=Math.max(...sosV);
  const out=new Map();
  for(const t of pool){
    const rec=cycPct(t);
    const po=Math.min(1, t.cpo/(PO_PERFECT*Math.max(1,t.crkN)));
    const sos=hi>lo ? (cycSos(t)-lo)/(hi-lo) : .5;
    const rk=Math.max(0, Math.min(1, (n-cycRank(t))/Math.max(1,n-1)));
    out.set(t.id,{rec:rec, po:po, sos:sos, rank:rk,
      score: PRO_W.record*rec + PRO_W.playoff*po + PRO_W.sos*sos + PRO_W.rank*rk});
  }
  return out;
}

function settle(){
  const moves=[];
  for(const d of DIVS){
    const pool=tierTeams('d1').filter(t=>t.div===d);
    const ordered=[...pool].sort((a,b)=>relCompare(a,b).v);
    const q=quotaFor(d);
    const down=ordered.slice(0,q);
    const WORST=['worst','second worst','third worst','fourth worst'];
    for(let i=0;i<down.length;i++){
      const t=down[i], next=ordered[i+1];   // whoever sat immediately above it
      t.tier='d2'; t.rating=Math.max(2,t.rating-4);
      const place=WORST[i]||(i+1)+'th worst';
      moves.push({id:t.id,name:t.name,dir:'down',div:d,rec:t.cw+'-'+t.cl,
        why: next ? place+' on '+relCompare(t,next).why : place+' record'});
    }
    // the two who came closest to going with them
    const lastDown=down[down.length-1];
    if(lastDown) for(let k=q;k<Math.min(q+2,ordered.length);k++){
      const t=ordered[k], c=relCompare(t,lastDown), f=REL_FMT[c.why];
      moves.push({id:t.id,name:t.name,dir:'nearDown',pos:k-q+1,div:d,rec:t.cw+'-'+t.cl,
        why:'stayed up over '+lastDown.name+' on '+c.why+
            ' ('+f(t,lastDown)+' to '+f(lastDown,t)+')'});
    }
    if(S.cycle>1){
      const up=tierTeams('d2').filter(t=>t.div===d && down.indexOf(t)<0);
      if(up.length){
        const sc=promotionScores(up);
        up.sort((a,b)=>sc.get(b.id).score-sc.get(a.id).score);
        const parts=c=>'rec '+c.rec.toFixed(2)+', playoff '+c.po.toFixed(2)+
          ', sched '+c.sos.toFixed(2)+', rank '+c.rank.toFixed(2);
        const win=up[0], wc=sc.get(win.id);
        win.tier='d1'; win.rating=Math.min(97,win.rating+4);
        moves.push({id:win.id,name:win.name,dir:'up',div:d,rec:win.cw+'-'+win.cl,
          why:'score '+wc.score.toFixed(3)+' ('+parts(wc)+')'});
        for(let k=1;k<Math.min(3,up.length);k++){
          const t=up[k], c=sc.get(t.id);
          moves.push({id:t.id,name:t.name,dir:'nearUp',pos:k,div:d,rec:t.cw+'-'+t.cl,
            why:'score '+c.score.toFixed(3)+' ('+parts(c)+'), short of '+win.name+
                ' by '+(wc.score-c.score).toFixed(3)});
        }
      }
    }
  }
  // settle runs while the second season of the cycle is still the current one,
  // so that season is the one the cycle closed after — no need to step back
  S.moves.unshift({cycle:S.cycle,season:S.season,moves});
  rebalance(moves);
  // stamp the season that closed the cycle so its standings can show the fallout
  const last=S.snaps[S.snaps.length-1];
  if(last && last.kind==='season'){
    const note={};
    for(const m of moves) if(m.id) note[m.id]={dir:m.dir, why:m.why, rec:m.rec, pos:m.pos};
    const ids=k=>moves.filter(m=>m.dir===k).map(m=>m.id);
    last.moves={up:ids('up'), down:ids('down'),
                nearUp:ids('nearUp'), nearDown:ids('nearDown'), note:note};
  }
  S.cycle++; S.inCycle=0;
  for(const t of S.teams) Object.assign(t, blankCycle());
  renderAll();
  return moves;
}

// Divisions are strength-balanced, not geographic, so after teams move up and
// down the halves are nudged back level with the fewest swaps that will do it.
function rebalance(moves){
  for(const c of CONFS){
    const ds=DIVS.filter(x=>x.indexOf(c+' ')===0);
    for(let pass=0;pass<2;pass++){
      const A=tierTeams('d1').filter(t=>t.div===ds[0]), B=tierTeams('d1').filter(t=>t.div===ds[1]);
      if(!A.length||!B.length) break;
      const avg=l=>l.reduce((s,t)=>s+t.rating,0)/l.length;
      const gap=Math.abs(avg(A)-avg(B));
      if(gap<=1.5) break;
      let best=null;
      for(const a of A) for(const b of B){
        const na=avg(A)+(b.rating-a.rating)/A.length, nb=avg(B)+(a.rating-b.rating)/B.length;
        const g=Math.abs(na-nb);
        if(g<gap-1e-9 && (!best||g<best.g)) best={a,b,g};
      }
      if(!best) break;
      best.a.div=ds[1]; best.b.div=ds[0];
      moves.push({name:best.a.name,dir:'swap',div:ds[0]+' \u2192 '+ds[1],rec:'balance'});
      moves.push({name:best.b.name,dir:'swap',div:ds[1]+' \u2192 '+ds[0],rec:'balance'});
    }
  }
}

/* ---------- schedule detail ---------- */
// Southeast A -> SECA: the conference initials, C for conference, then the division half.
const CONFAB = {Northeast:'NEC', Southeast:'SEC', Central:'CC', Western:'WC'};
const confAbbr = c => CONFAB[c] || c.slice(0,1).toUpperCase()+'C';
const divAbbr = d => { const i=d.lastIndexOf(' ');
  return confAbbr(d.slice(0,i))+d.slice(i+1); };

function ord(n){const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
function schedHTML(id){
  const sn=snap();
  if(!sn.sched[id]) return '<p class="note" style="margin:6px 2px">'+
    'This team did not play in '+sn.season+'.</p>';
  const g=sn.sched[id], T=sn.teams, R=sn.rank, pre=sn.kind==='pre';
  const reg=g.filter(x=>!x.ps), post=g.filter(x=>x.ps&&!x.x), extraB=g.filter(x=>x.x);
  // the yellow tag already says "rivalry", so this column names the bucket the
  // game actually falls in rather than repeating it
  const PSABBR={'Play-in':'PI','Round of 16':'R16','Quarterfinals':'QF',
                'Semifinals':'SF','Championship':'NCG','Bowl game':'Bowl'};
  const stage=x=> /championship$/.test(x.t) ? 'CCG' : (PSABBR[x.t]||'PS');
  const kind=x=>{
    const o=T[x.o], m=T[id];
    return o.div===m.div ? 'division' : (o.conf===m.conf ? 'crossover' : 'non-conference');
  };
  const line=(x,lab)=>{
    const win=x.f>x.a, o=T[x.o];
    const rv = x.t==='rivalry' ? '<span class="rivtag">rivalry</span>' : '';
    const me2=T[id], outside = o.conf!==me2.conf || o.div!==me2.div;
    const out = o.conf!==me2.conf
      ? '<span class="cdot" style="background:'+CC[o.conf]+'" title="'+esc(o.conf)+'"></span>'
      : (outside
        ? '<span class="cdot" style="background:'+dcol(o.div)+'" title="'+esc(o.div)+' \u00b7 crossover"></span>' : '');
    const tag = outside ? '<span class="conftag" title="'+esc(o.div)+'">- '+esc(divAbbr(o.div))+'</span>' : '';
    return '<tr'+(x.ps?' class="ps"':'')+'><td class="n" style="color:var(--muted)">'+
      (x.ps?'<span class="stage">'+lab+'</span>':lab)+'</td>'+
      '<td>'+out+'<span class="rk">#'+R[x.o]+'</span>'+(x.home===false?'at ':(x.ps?'vs ':''))+
        esc(o.name)+tag+rv+'</td>'+
      '<td class="hidesm" style="color:var(--muted)">'+
        esc(x.ps?((x.b||x.t)+(x.c?' \u00b7 '+x.c:'')):kind(x))+'</td>'+
      (pre ? '<td class="n" style="color:var(--muted)">\u2013</td></tr>'
           : '<td class="n" style="color:'+(win?'var(--up)':'var(--down)')+'">'+
             (win?'W':'L')+' '+x.f+'\u2013'+x.a+'</td></tr>');
  };
  const me=T[id], w=reg.filter(x=>x.f>x.a).length;
  const avgRk=Math.round(reg.reduce((s,x)=>s+R[x.o],0)/reg.length);
  const avgRt=Math.round(reg.reduce((s,x)=>s+T[x.o].rating,0)/reg.length);
  const tierOf=t=>t.tier==='d1'?'Tier I':'Tier II';
  // Say where the rivalry stands: on the slate, sitting out its off year, or
  // lapsed because one of the two has moved tier.
  const rivalNote=(()=>{
    if(!me.rival) return '';
    const rid=Object.keys(T).find(k=>T[k].name===me.rival), r=rid?T[rid]:null;
    if(!r) return ' Rival: '+esc(me.rival)+'.';
    if(r.tier!==me.tier)
      return ' Rival: '+esc(me.rival)+', in '+tierOf(r)+' this season \u2014 the game is off '+
             'until the two are back in the same tier.';
    return ' Rival: '+esc(me.rival)+(reg.some(x=>x.o===rid)
      ? (pre?' \u2014 on the schedule this year.':' \u2014 played this year.')
      : ' \u2014 not on the schedule this year; the fixture runs three years in four.');
  })();
  // the dot key lives at the top of the league now, since it reads the same on
  // every team's schedule
  const twoYear = sn.inCycle>=2 && me.cw+me.cl
    ? ' Two-year record '+me.cw+'\u2013'+me.cl+', with the cycle now complete.' : '';
  const mix={division:0,crossover:0,'non-conference':0};
  reg.forEach(x=>{mix[kind(x)]++;});
  let head = pre
    ? esc(me.name)+' opens '+sn.season+' in '+tierOf(me)+', ranked #'+R[id]+' by rating. '+
      reg.length+' games across '+(sn.weeks||WEEKS)+' weeks: '+mix.division+' in division, '+
      mix.crossover+' crossover, '+mix['non-conference']+' non-conference. Opponents average '+
      'rank #'+avgRk+' and rating '+avgRt+'.'+rivalNote
    : esc(me.name)+' finished '+w+'\u2013'+(reg.length-w)+', ranked #'+R[id]+' in '+
      tierOf(me)+'. Opponents averaged rank #'+avgRk+' and rating '+avgRt+
      ', the '+ord(me.sosRank)+' hardest schedule in the tier.'+twoYear+rivalNote;
  if(post.length){
    const pw=post.filter(x=>x.f>x.a).length;
    head += pw===post.length ? ' Won the title, '+pw+'\u20130 in the playoff.'
      : ' Went '+pw+'\u2013'+(post.length-pw)+' in the playoff, out in the '+esc(post[post.length-1].t.toLowerCase())+'.';
  }else if(extraB.length){
    const b=extraB[0];
    head += ' Missed the field and '+(b.f>b.a?'won':'lost')+' the '+esc(b.b)+'.';
  }
  let verdict='';
  const mv = sn.moves && sn.moves.note && sn.moves.note[id];
  if(mv){
    const ord2 = mv.pos===1 ? 'Closest' : 'Second closest';
    const L={up:['vup','Promoted to Tier I','Best promotion score in its division \u2014 '],
             down:['vdown','Relegated to Tier II','Finished '],
             nearDown:['vnear','Survived the drop',ord2+' to the drop \u2014 '],
             nearUp:['vnear','Missed promotion',(mv.pos===1?'Runner-up':'Third')+' on score \u2014 ']}[mv.dir];
    const tail = mv.dir==='down' ? L[2]+esc(mv.why)+' in its division over the cycle.'
               : L[2]+esc(mv.why)+'.';
    verdict='<p class="verdict '+L[0]+'">'+L[1]+' after this season. Two-year record '+
      esc(mv.rec)+'. '+tail+'</p>';
  }
  const byWk={}; let maxWk=0;
  for(const x of reg){ const k=x.wk||0; byWk[k]=x; if(k>maxWk) maxWk=k; }
  const total=Math.max(sn.weeks||maxWk, maxWk);
  const rows=[];
  for(let wk=1; wk<=total; wk++){
    rows.push(byWk[wk] ? line(byWk[wk],wk)
      : '<tr class="bye"><td class="n">'+wk+'</td><td colspan="3">bye</td></tr>');
  }
  const bar='<div class="schedhead"><b>'+esc(me.name)+'</b><span>'+
    (pre ? reg.length+' games' : w+'\u2013'+(reg.length-w))+
    ' \u00b7 #'+R[id]+' \u00b7 '+esc(me.div)+'</span></div>';
  return '<div class="sched">'+bar+verdict+'<p class="note" style="margin:2px 2px 6px">'+head+'</p><table>'+
    rows.join('')+
    (post.length?'<tr class="pshead"><td colspan="4">Playoff</td></tr>'+post.map(x=>line(x,stage(x))).join(''):'')+
    (extraB.length?'<tr class="pshead"><td colspan="4">Bowl</td></tr>'+extraB.map(x=>line(x,stage(x))).join(''):'')+
    '</table></div>';
}
// Name and badges sit side by side while they fit; when they don't, the badges
// drop as a block to a second line under the name rather than squeezing the
// numbers out of the row.
const teamCell = (name,tags) => '<div class="lgteam"><span class="nm">'+name+'</span>'+
  (tags ? '<span class="tags">'+tags+'</span>' : '')+'</div>';
function expandable(row,id,cols){
  row.classList.add('clickrow'); row.tabIndex=0;
  const go=()=>{
    const nx=row.nextElementSibling;
    if(nx&&nx.dataset.sched===id){nx.remove();row.classList.remove('open');return;}
    row.parentNode.querySelectorAll('tr[data-sched]').forEach(r=>{
      if(r.previousElementSibling) r.previousElementSibling.classList.remove('open');
      r.remove();});
    const r=el('tr','schedrow'); r.dataset.sched=id;
    r.innerHTML='<td colspan="'+cols+'">'+schedHTML(id)+'</td>';
    row.after(r); row.classList.add('open');
  };
  row.onclick=go;
  row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};
}

/* ---------- chrome ---------- */
const TABS=[['league','League'],['playoff','Playoff'],['map','Map'],['move','Up & down'],['ratings','Ratings']];
// The selected tab is in front and the rest fall away from it on both sides, so
// the two ends of the strip are the furthest back whichever tab is open.
function stackTabs(){
  const bs=[...$('#tabs').children];
  const sel=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');
  bs.forEach((b,i)=>{ b.style.zIndex=String(bs.length-Math.abs(i-sel)); });
}
// The strip scrolls sideways when the tabs outrun the screen, so a tab picked
// at the edge gets pulled fully into view. The pad clears the overlap, or the
// neighbor stacked over it would still cut the corner off.
function revealTab(b){
  const n=$('#tabs');
  if(!n.scrollBy || !n.getBoundingClientRect) return;
  const nr=n.getBoundingClientRect(), br=b.getBoundingClientRect(), pad=14;
  const smooth=!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const opt=d=>smooth?{left:d,behavior:'smooth'}:{left:d};
  if(br.left-pad < nr.left) n.scrollBy(opt(br.left-pad-nr.left));
  else if(br.right+pad > nr.right) n.scrollBy(opt(br.right+pad-nr.right));
}
function buildTabs(){
  const n=$('#tabs');
  TABS.forEach(function(pair,i){
    const b=el('button',null,pair[1]);
    b.setAttribute('role','tab'); b.setAttribute('aria-selected',i===0?'true':'false');
    b.onclick=()=>{
      n.querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected','false'));
      b.setAttribute('aria-selected','true');
      stackTabs(); revealTab(b);
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
      $('#p-'+pair[0]).classList.add('on');
    };
    n.appendChild(b);
  });
  stackTabs();
}
function renderDeck(){
  $('#s-d1').textContent=sizeOf('d1');
  $('#s-d2').textContent=sizeOf('d2');
  const togo = 2-S.inCycle;   // the count reads white, like the tier counts
  $('#s-cycle').innerHTML = S.inCycle>=2 ? 'Reshuffle ready'
    : '<b>'+togo+'</b>season'+(togo===1?'':'s')+' to reshuffle';
  const pending = S.phase==='done' && S.inCycle>=2;
  const archive = S.view !== S.snaps.length-1;
  // where the league actually stands, which is what leaving the archive returns to
  const nowAt = pending ? 'the '+S.season+' reshuffle'
              : S.season+(S.phase==='pre' ? ' preseason' : ' postseason');
  const sel=$('#yearSel'); sel.innerHTML='';
  const live=S.snaps.length-1;
  S.snaps.forEach((sn,i)=>{
    // every season but the current one is an archive, and says so where it is read
    const o=el('option',null,sn.season+(sn.kind==='pre'?' preseason':' postseason')+
      (i===live?'':' \u2014 archive'));
    o.value=String(i); sel.appendChild(o);
  });
  sel.value=String(S.view);
  // the label just says what the box is; whether it is an archive is written on
  // the season itself, and where the league stands is the Back button's job
  document.querySelector('.seasonrow').classList.toggle('archive',archive);
  // One button walks the league forward: play the season, advance to the next
  // preseason, and when two seasons are in the books, settle the table. Off in
  // the archive there is nothing to walk forward, so it becomes the way back.
  const btn=$('#actBtn');
  btn.disabled=false;
  btn.title='';
  if(archive){
    btn.textContent='Back to '+nowAt;
    btn.className='btn arch';
    btn.title='Leave the archive and return to where the league stands';
    btn.onclick=()=>{S.view=S.snaps.length-1;renderViews();renderDeck();};
  }else if(pending){
    btn.textContent='Send them up and down';
    btn.className='btn go';
    btn.onclick=settle;
  }else if(S.phase==='pre'){
    btn.textContent='Play the '+S.season+' season';
    btn.className='btn';
    btn.onclick=()=>{playSeason();renderAll();};
  }else{
    btn.textContent='Advance to '+(S.season+1)+' preseason';
    btn.className='btn ghost';
    btn.onclick=()=>{advance();renderAll();};
  }
  $('#deckHint').textContent = pending && !archive
    ? 'Two seasons are in the books. Settle the table before moving on.' : '';
}

/* ---------- map pan and zoom ---------- */
// The map is one SVG, so zooming is just a narrower viewBox and panning is
// sliding it. Both render paths mount into #mapHost, so the view survives a
// re-render and the same handlers serve the season map and the focus map.
const MAXZ=8;
const MINDIST=9;
let mapView=null, mapDragged=false, mapLaidOutAt=1;
// Markers grow at half the rate of the zoom, so the gap they need shrinks the
// same way. Zooming therefore thins the clumps out and shortens the stems
// instead of magnifying a fan that was laid out for the whole-country view.
const markerK = () => mapView ? Math.sqrt(mapView.w/M.W) : 1;
const mapMinDist = () => MINDIST*markerK();
const mapSvg = () => { const h=$('#mapHost'); return h && h.querySelector('svg.map'); };
const mapZoomed = () => !!mapView && mapView.w < M.W-0.5;
function mapApply(){
  const svg=mapSvg(); if(!svg||!mapView) return;
  mapView.x=Math.min(M.W-mapView.w, Math.max(0, mapView.x));
  mapView.y=Math.min(M.H-mapView.h, Math.max(0, mapView.y));
  svg.setAttribute('viewBox',mapView.x+' '+mapView.y+' '+mapView.w+' '+mapView.h);
  svg.classList.toggle('zoomed',mapZoomed());
  // At 1:1 a finger swipe should still scroll the page, since there is nothing
  // to pan; once zoomed the map takes the gesture and drags instead.
  svg.style.touchAction = mapZoomed() ? 'none' : 'pan-y';
  svg.style.setProperty('--mk',markerK().toFixed(4));
  const r=$('#zReset'); if(r) r.disabled=!mapZoomed();
}
function mapZoomAt(cx,cy,f){
  const svg=mapSvg(); if(!svg) return;
  const r=svg.getBoundingClientRect();
  const fx=(cx-r.left)/r.width, fy=(cy-r.top)/r.height;
  const px=mapView.x+fx*mapView.w, py=mapView.y+fy*mapView.h;
  mapView.w=Math.min(M.W, Math.max(M.W/MAXZ, mapView.w/f));
  mapView.h=mapView.w*M.H/M.W;
  mapView.x=px-fx*mapView.w; mapView.y=py-fy*mapView.h;
  mapApply();
}
function mapZoomStep(f){
  const svg=mapSvg(); if(!svg) return;
  const r=svg.getBoundingClientRect();
  mapZoomAt(r.left+r.width/2, r.top+r.height/2, f);
}
function mapResetZoom(){ mapView={x:0,y:0,w:M.W,h:M.H}; mapApply(); mapRelayout(); }
// Redraw the markers when the zoom has moved enough that the clumps would fan
// differently. Only between gestures — rebuilding the svg mid-pinch would drop
// the pointer capture the drag is riding on.
function mapRelayout(){
  const k=markerK();
  if(Math.abs(k-mapLaidOutAt)/mapLaidOutAt < 0.12) return;
  mapLaidOutAt=k;
  renderMap();
}
function attachMapZoom(){
  const svg=mapSvg(); if(!svg) return;
  if(!mapView) mapView={x:0,y:0,w:M.W,h:M.H};
  mapApply();
  // Listeners live on the SVG, which every render replaces, so nothing leaks.
  // Pointer capture keeps a drag alive past the edge of the map.
  const pts=new Map();
  let g=null;
  const panFrom=p=>({mode:'pan',cx:p.x,cy:p.y,x:mapView.x,y:mapView.y});
  svg.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{ svg.setPointerCapture(e.pointerId); }catch(_){}
    mapDragged=false;
    if(pts.size===2){
      const [a,b]=[...pts.values()];
      g={mode:'pinch', d:Math.hypot(a.x-b.x,a.y-b.y), w:mapView.w,
         cx:(a.x+b.x)/2, cy:(a.y+b.y)/2};
    }else if(pts.size===1 && mapZoomed()){
      g=panFrom({x:e.clientX,y:e.clientY});
    }
  });
  svg.addEventListener('pointermove',e=>{
    if(!pts.has(e.pointerId)||!g) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const r=svg.getBoundingClientRect();
    if(g.mode==='pan'){
      if(Math.abs(e.clientX-g.cx)+Math.abs(e.clientY-g.cy)>4) mapDragged=true;
      mapView.x=g.x-(e.clientX-g.cx)/r.width*mapView.w;
      mapView.y=g.y-(e.clientY-g.cy)/r.height*mapView.h;
      mapApply(); e.preventDefault();
    }else if(g.mode==='pinch'&&pts.size>=2&&g.d>0){
      const [a,b]=[...pts.values()];
      mapDragged=true;
      const w=Math.min(M.W, Math.max(M.W/MAXZ, g.w*g.d/Math.hypot(a.x-b.x,a.y-b.y)));
      const fx=(g.cx-r.left)/r.width, fy=(g.cy-r.top)/r.height;
      const px=mapView.x+fx*mapView.w, py=mapView.y+fy*mapView.h;
      mapView.w=w; mapView.h=w*M.H/M.W;
      mapView.x=px-fx*mapView.w; mapView.y=py-fy*mapView.h;
      mapApply(); e.preventDefault();
    }
  });
  const lift=e=>{
    pts.delete(e.pointerId);
    const left=[...pts.values()];
    g = left.length===1 && mapZoomed() ? panFrom(left[0]) : null;
    if(!pts.size) mapRelayout();
  };
  svg.addEventListener('pointerup',lift);
  svg.addEventListener('pointercancel',lift);
  // a trackpad pinch arrives as ctrl+wheel; a plain wheel still scrolls the page
  let wheelIdle=0;
  svg.addEventListener('wheel',e=>{
    if(!e.ctrlKey&&!e.metaKey) return;
    e.preventDefault();
    mapZoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*0.01));
    clearTimeout(wheelIdle);
    wheelIdle=setTimeout(mapRelayout,160);   // once the gesture settles
  },{passive:false});
}

/* ---------- map ---------- */
let mapGroup='conf';
let mapFilter=new Set(CONFS);
let mapFocus=null;
const groupKeys = () => mapGroup==='conf' ? CONFS : DIVS;
const groupOf = t => mapGroup==='conf' ? t.conf : t.div;
const groupCol = k => mapGroup==='conf' ? CC[k] : dcol(k);
// A team's tier/division/conference/rating as of the season being viewed, not
// wherever it's landed since — a reshuffle mutates the live team in place, so
// without this a postseason map would show teams on the tier they're moving
// to rather than the one they just finished playing in.
const periodTeam = (sn,id) => { const p=sn.teams[id]; return p ? Object.assign({},byId()[id],p) : byId()[id]; };
// Northeast -> NEC, Northeast A -> NECA; the full name stays on hover
const groupLabel = k => mapGroup==='conf' ? confAbbr(k) : divAbbr(k);
const showingAll = () => mapFilter.size===groupKeys().length && !mapFocus && !mapZoomed();
function mapShowAll(){
  mapFilter=new Set(groupKeys()); mapFocus=null; mapResetZoom();
  renderChips(); renderMap(); $('#mapPick').innerHTML='';
}
function renderChips(){
  const c=$('#mapChips'); c.innerHTML='';
  groupKeys().forEach(k=>{
    const b=el('button','chip','<i></i>'+esc(groupLabel(k)));
    b.title=k; b.setAttribute('aria-label',k);
    b.dataset.on=mapFilter.has(k)?'1':'0';
    if(mapFilter.has(k)) b.style.color=groupCol(k);
    b.onclick=()=>{mapFilter.has(k)?mapFilter.delete(k):mapFilter.add(k);renderChips();renderMap();};
    c.appendChild(b);
  });
  // always there so the row does not reflow, but grayed out with nothing to undo
  const r=el('button','chip showall','Show all');
  r.disabled=showingAll();
  r.title=r.disabled ? 'Everything is already showing'
                     : 'Show every team, unfiltered and unzoomed';
  r.onclick=mapShowAll;
  c.appendChild(r);
}
function starPoints(cx,cy,R,r){
  const p=[];
  for(let i=0;i<10;i++){
    const a=-Math.PI/2 + i*Math.PI/5, rad = i%2 ? r : R;
    p.push((cx+rad*Math.cos(a)).toFixed(1)+','+(cy+rad*Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
}
// An invisible disc under every marker: the dots are small, so what you tap is
// wider than what you see. It sits inside the marker's group, so it scales with
// the marker and moves with it when a crowded clump fans out.
const HITR=10;
const hit=(x,y)=>'<circle class="hit" cx="'+x+'" cy="'+y+'" r="'+HITR+'"/>';
function markerSVG(x,y,shape,fill,ring){
  if(shape==='square') return '<rect x="'+(x-5)+'" y="'+(y-5)+'" width="10" height="10" rx="1.5" fill="'+fill+'" stroke="'+ring+'" stroke-width="2"/>';
  if(shape==='diamond') return '<polygon points="'+x+','+(y-6.6)+' '+(x+6.6)+','+y+' '+x+','+(y+6.6)+' '+(x-6.6)+','+y+'" fill="'+fill+'" stroke="'+ring+'" stroke-width="2"/>';
  return '<circle cx="'+x+'" cy="'+y+'" r="5.5" fill="'+fill+'" stroke="'+ring+'" stroke-width="2"/>';
}
const WIN='#7ee787', LOSS='#ff7b72';
function renderMapFocus(sn){
  const me=periodTeam(sn,mapFocus), games=sn.sched[mapFocus];
  let s='<svg class="map" viewBox="0 0 '+M.W+' '+M.H+'" role="img" aria-label="Season map for '+esc(me.name)+'">';
  for(const k in DATA.map.paths) s+='<path class="st" d="'+DATA.map.paths[k]+'"/>';
  s+='<rect class="inset" x="30" y="486" width="86" height="52" rx="6"/><text class="insetlbl" x="36" y="500">Hawaii</text>';
  const c0=screenXY(me);
  const raw=[{i:-1,x:c0[0],y:c0[1]}];
  games.forEach((g,i)=>{ const o=periodTeam(sn,g.o); if(o){ const p=screenXY(o); raw.push({i,x:p[0],y:p[1]}); } });
  const byIdx=Object.fromEntries(declutter(raw,mapMinDist()).map(p=>[p.i,p]));
  const mp=byIdx[-1], mx=mp.x.toFixed(1), my=mp.y.toFixed(1);
  const stem=p=> (p.x!==p.ox||p.y!==p.oy) ? '<line x1="'+p.ox.toFixed(1)+'" y1="'+p.oy.toFixed(1)+'" x2="'+p.x.toFixed(1)+'" y2="'+p.y.toFixed(1)+
    '" stroke="var(--muted)" stroke-width="1" stroke-opacity=".6"/>' : '';
  s+=stem(mp);
  games.forEach((g,i)=>{
    const p=byIdx[i]; if(!p) return;
    const win=g.f>g.a;
    s+='<line x1="'+mx+'" y1="'+my+'" x2="'+p.x.toFixed(1)+'" y2="'+p.y.toFixed(1)+'" stroke="'+
       (win?WIN:LOSS)+'" stroke-width="1.3" stroke-opacity=".42"'+(g.ps?' stroke-dasharray="4 3"':'')+'/>';
  });
  games.forEach((g,i)=>{
    const o=periodTeam(sn,g.o), p=byIdx[i]; if(!o||!p) return;
    const win=g.f>g.a;
    const shape = g.ps?'diamond':(g.home?'circle':'square');
    s+=stem(p)+'<g class="dot" data-id="'+o.id+'" data-g="'+i+'">'+
       hit(+p.x.toFixed(1),+p.y.toFixed(1))+
       markerSVG(+p.x.toFixed(1),+p.y.toFixed(1),shape,dcol(o.div),win?WIN:LOSS)+'</g>';
  });
  s+='<g class="dot" data-id="'+me.id+'" data-g="-1">'+hit(mx,my)+
     '<circle cx="'+mx+'" cy="'+my+'" r="9.5" fill="none" stroke="#eef4ec" stroke-width="1.6" stroke-opacity=".8"/>'+
     '<circle cx="'+mx+'" cy="'+my+'" r="5.5" fill="'+dcol(me.div)+'" stroke="#eef4ec" stroke-width="1.8"/></g>';
  $('#mapHost').innerHTML=s+'</svg>';
  attachMapZoom();
  const tip=$('#tip');
  $('#mapHost').querySelectorAll('.dot').forEach(el2=>{
    const gi=+el2.dataset.g, t=periodTeam(sn,el2.dataset.id);
    const showTip=e=>{
      const p=e.touches?e.touches[0]:e;
      let body;
      if(gi<0) body='<small>'+esc(t.city)+', '+t.st+'<br>'+esc(t.div)+' \u00b7 ranked #'+sn.rank[t.id]+'</small>';
      else{
        const g=games[gi], win=g.f>g.a;
        const where=g.ps?'neutral site':(g.home?'at home':'on the road');
        const num=g.ps?esc(g.t):'game '+(gi+1);
        body='<small>#'+sn.rank[t.id]+' \u00b7 '+esc(t.div)+'<br>'+num+', '+where+
             '<br><b style="color:'+(win?WIN:LOSS)+'">'+(win?'W':'L')+' '+g.f+'\u2013'+g.a+'</b></small>';
      }
      tip.innerHTML='<b>'+esc(t.name)+'</b>'+body;
      placeTip(tip,p.clientX,p.clientY);
    };
    el2.addEventListener('mousemove',showTip);
    el2.addEventListener('mouseleave',()=>{tip.style.opacity=0;});
    el2.addEventListener('click',e=>{
      if(mapDragged) return;          // that was a pan, not a pick
      showTip(e);
      if(gi>=0){mapFocus=t.id;renderMap();}
      pickTeam(t);
      setTimeout(()=>{tip.style.opacity=0;},1800);
    });
  });
}
// When two or more markers would land within minDist px of each other, fan
// them out around their shared spot and hand back the true (ox,oy) each came
// from, so the caller can draw a thin stem back to where it actually sits.
// Runs a few relaxation passes since spreading one cluster can nudge a
// marker into a new collision with an unrelated point nearby.
function declutter(points,minDist){
  // ox/oy are each point's true, unmoved spot — fixed for good up front, never
  // recomputed from an already-nudged position, so a cluster's fan keeps one
  // stable layout across passes instead of re-rotating as it is re-evaluated.
  let pts=points.map(p=>Object.assign({},p,{ox:p.x,oy:p.y}));
  for(let iter=0;iter<12;iter++){
    const seen=new Array(pts.length).fill(false), next=new Array(pts.length);
    let moved=false;
    for(let i=0;i<pts.length;i++){
      if(seen[i]) continue;
      // Whole connected clump, not just what sits near the first marker: two
      // overlapping pairs side by side have to fan as one four, or each pair
      // picks its own directions and their stems run parallel and cross.
      const group=[i]; seen[i]=true;
      for(let q=0;q<group.length;q++){
        const a=group[q];
        for(let j=0;j<pts.length;j++){
          if(seen[j]) continue;
          if(Math.hypot(pts[j].x-pts[a].x,pts[j].y-pts[a].y)<minDist){ group.push(j); seen[j]=true; }
        }
      }
      if(group.length===1){ next[i]=pts[i]; continue; }
      moved=true;
      let cx=0,cy=0; for(const k of group){cx+=pts[k].x;cy+=pts[k].y;} cx/=group.length; cy/=group.length;
      const n=group.length;
      const bearing=k=>{
        const dx=pts[k].ox-cx, dy=pts[k].oy-cy;
        return (Math.abs(dx)<1e-9&&Math.abs(dy)<1e-9) ? null : Math.atan2(dy,dx);
      };
      // Rings rather than one big circle: a crowded region would otherwise put
      // twenty markers on one huge ring and fling them halfway across the map.
      // Each ring is one marker-width further out and holds as many as fit, so
      // nobody travels further than the clump actually needs.
      const rings=[];
      for(let left=n, r=1; left>0; r++){
        const R=minDist*0.95*r;
        const take=Math.min(left, Math.max(1, Math.floor(2*Math.PI*R/(minDist*1.02))));
        rings.push({R, take}); left-=take;
      }
      // innermost ring goes to the markers already nearest the middle, so the
      // ones on the edge of the clump are the ones that travel
      const byDist=[...group].sort((a,b)=>
        Math.hypot(pts[a].ox-cx,pts[a].oy-cy)-Math.hypot(pts[b].ox-cx,pts[b].oy-cy));
      let at=0;
      rings.forEach((ring,ri)=>{
        const mine=byDist.slice(at,at+ring.take); at+=ring.take;
        const step=2*Math.PI/mine.length;
        // Each marker takes its own slice, so no two in a ring set off the same
        // way, and each leaves radially from the shared center, which is what
        // keeps the stems from crossing. The ring is then turned to best fit
        // where the markers truly lie — a circular mean of what each one's own
        // bearing implies — so a marker heads out roughly the way it already
        // sits and neighboring clumps do not all fan alike. Rings are offset
        // from each other so an inner and an outer marker never line up.
        const order=[...mine].sort((a,b)=>{
          const A=bearing(a), B=bearing(b);
          if(A===null&&B===null) return a-b;
          if(A===null) return 1;
          if(B===null) return -1;
          return A-B;
        });
        let sx=0, sy=0, have=0;
        order.forEach((k,slot)=>{
          const a=bearing(k);
          if(a===null) return;
          sx+=Math.cos(a-slot*step); sy+=Math.sin(a-slot*step); have++;
        });
        const base=(have?Math.atan2(sy,sx):(cx*0.7+cy*1.3))+ri*step/2;
        order.forEach((k,slot)=>{
          const ang=base+slot*step;
          next[k]=Object.assign({},pts[k],{x:cx+ring.R*Math.cos(ang),y:cy+ring.R*Math.sin(ang)});
        });
      });
    }
    pts=next;
    if(!moved) break;
  }
  // The ring passes place each clump on its own, so two clumps can still leave a
  // pair touching across the gap between them. Push any such pair straight
  // apart — a sub-pixel correction in practice, and it cannot undo a fan.
  for(let pass=0;pass<24;pass++){
    let clear=true;
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      let dx=pts[j].x-pts[i].x, dy=pts[j].y-pts[i].y, d=Math.hypot(dx,dy);
      if(d>=minDist) continue;
      clear=false;
      if(d<1e-6){ dx=Math.cos(i*2.3999); dy=Math.sin(i*2.3999); d=1; }   // exactly stacked
      const push=(minDist-d)/2+0.05;
      pts[i]=Object.assign({},pts[i],{x:pts[i].x-dx/d*push, y:pts[i].y-dy/d*push});
      pts[j]=Object.assign({},pts[j],{x:pts[j].x+dx/d*push, y:pts[j].y+dy/d*push});
    }
    if(clear) break;
  }
  return pts;
}
function renderMap(){
  renderChips();
  const sn=snap();
  $('#mapNote').textContent = sn.kind==='pre' ? sn.season+' preseason.' : sn.season+' results.';
  if(mapFocus && sn.sched[mapFocus]) return renderMapFocus(sn);
  mapFocus=null;
  const tier=$('#mapTier').value;
  const show=S.teams.map(t=>periodTeam(sn,t.id)).filter(t=>(tier==='all'||t.tier===tier)&&mapFilter.has(groupOf(t)));
  let s='<svg class="map" viewBox="0 0 '+M.W+' '+M.H+'" role="img" aria-label="Conference footprints">';
  for(const k in DATA.map.paths) s+='<path class="st" d="'+DATA.map.paths[k]+'"/>';
  s+='<rect class="inset" x="30" y="486" width="86" height="52" rx="6"/><text class="insetlbl" x="36" y="500">Hawaii</text>';
  const winners=new Set(), champs=new Set();
  if(sn.kind==='season') for(const tr2 of ['d1','d2']){
    const tin=sn.tiers[tr2]; if(!tin) continue;
    for(const dd in tin.divs) if(tin.divs[dd].length) winners.add(tin.divs[dd][0]);
    if(tin.po) champs.add(tin.po.champion);
  }
  const rank2=t=> champs.has(t.id)?3 : winners.has(t.id)?2 : (t.tier==='d2'?0:1);
  const ordered=[...show].sort((a,b)=>rank2(a)-rank2(b));
  const placed=declutter(ordered.map(t=>{const xy=screenXY(t); return {t,x:xy[0],y:xy[1]};}),mapMinDist());
  for(const pt of placed){
    const t=pt.t, c=dcol(t.div), X=+pt.x.toFixed(1), Y=+pt.y.toFixed(1);
    const fill = t.tier==='d1' ? c : '#0c2318';
    if(pt.x!==pt.ox||pt.y!==pt.oy) s+='<line x1="'+pt.ox.toFixed(1)+'" y1="'+pt.oy.toFixed(1)+'" x2="'+X+'" y2="'+Y+
      '" stroke="var(--muted)" stroke-width="1" stroke-opacity=".6"/>';
    s+='<g class="dot" data-id="'+t.id+'">'+hit(X,Y);
    if(champs.has(t.id)){
      s+='<circle cx="'+X+'" cy="'+Y+'" r="10.5" fill="none" stroke="'+c+'" stroke-width="1.5" stroke-opacity=".85"/>'+
         '<polygon points="'+starPoints(X,Y,8,3.5)+'" fill="'+fill+'" stroke="'+c+'" stroke-width="1.6" stroke-linejoin="round"/>';
    }else if(winners.has(t.id)){
      s+='<polygon points="'+starPoints(X,Y,6.6,2.9)+'" fill="'+fill+'" stroke="'+c+'" stroke-width="1.5" stroke-linejoin="round"/>';
    }else{
      s+= t.tier==='d1'
        ? '<circle cx="'+X+'" cy="'+Y+'" r="5" fill="'+c+'" stroke="'+c+'" stroke-width="1.4"/>'
        : '<circle cx="'+X+'" cy="'+Y+'" r="3.4" fill="#0c2318" stroke="'+c+'" stroke-width="1.8"/>';
    }
    s+='</g>';
  }
  $('#mapHost').innerHTML=s+'</svg>';
  attachMapZoom();
  const tip=$('#tip'), ix=Object.fromEntries(ordered.map(t=>[t.id,t]));
  $('#mapHost').querySelectorAll('.dot').forEach(g=>{
    const t=ix[g.dataset.id];
    const showTip=e=>{
      const p=e.touches?e.touches[0]:e;
      const rk=sn.rank[t.id]?' \u00b7 #'+sn.rank[t.id]:'';
      const crown = champs.has(t.id)?'<br><b style="color:var(--central)">\u2605 national champion</b>'
                  : winners.has(t.id)?'<br><b style="color:var(--central)">\u2605 division winner</b>':'';
      tip.innerHTML='<b>'+esc(t.name)+'</b><small>'+esc(t.city)+', '+t.st+' \u00b7 '+esc(t.div)+
        '<br>'+(t.tier==='d1'?'Tier I':'Tier II')+' \u00b7 rating '+Math.round(t.rating)+rk+crown+'</small>';
      placeTip(tip,p.clientX,p.clientY);
    };
    g.addEventListener('mousemove',showTip);
    g.addEventListener('mouseleave',()=>{tip.style.opacity=0;});
    g.addEventListener('click',e=>{
      if(mapDragged) return;          // that was a pan, not a pick
      showTip(e);pickTeam(t);setTimeout(()=>{tip.style.opacity=0;},1800);});
  });
}
function pickTeam(t){
  const sn=snap(), rk=sn.rank[t.id], canFocus=!!sn.sched[t.id];
  const focused = mapFocus===t.id;
  const legend = focused ? '<div class="legend">'+
      '<span><svg width="16" height="16"><circle cx="8" cy="8" r="5" fill="var(--muted)" stroke="var(--chalk)" stroke-width="2"/></svg>home</span>'+
      '<span><svg width="16" height="16"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="var(--muted)" stroke="var(--chalk)" stroke-width="2"/></svg>away</span>'+
      '<span><svg width="16" height="16"><polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="var(--muted)" stroke="var(--chalk)" stroke-width="2"/></svg>playoff</span>'+
      '<span><i style="background:'+WIN+'"></i>won</span>'+
      '<span><i style="background:'+LOSS+'"></i>lost</span>'+
      '<span>fill is the opponent\u2019s conference</span></div>' : '';
  $('#mapPick').innerHTML='<div class="divblock"><div class="divhead" style="--c:'+dcol(t.div)+'">'+
    '<h3>'+esc(t.name)+'</h3><span>'+esc(t.city)+', '+t.st+'</span></div><div class="divbody">'+
    '<p class="note">'+(t.tier==='d1'?'Tier I':'Tier II')+' \u00b7 '+esc(t.div)+
    ' \u00b7 rating '+Math.round(t.rating)+(rk?' \u00b7 ranked #'+rk:'')+'</p>'+
    (canFocus?'<p><button class="btn '+(focused?'':'ghost')+'" id="focusBtn">'+
      (focused?'Show every team again':'Show this season on the map')+'</button></p>':'')+
    legend+schedHTML(t.id)+'</div></div>';
  const fb=$('#focusBtn');
  if(fb) fb.onclick=()=>{ mapFocus = focused?null:t.id; renderMap(); pickTeam(t);
    const mb=document.querySelector('.mapbox'); if(mb&&mb.scrollIntoView) mb.scrollIntoView({block:'nearest'}); };
}

/* ---------- league ---------- */
function renderLeague(){
  const host=$('#league'), pick=$('#lgTier').value, sortBy=$('#lgSort').value, sn=snap();
  const pre = sn.kind==='pre';
  host.innerHTML='';
  $('#lgNote').textContent = (pre
    ? sn.season+' preseason. Rank is by rating; no games played yet.'
    : sn.season+' results. Rank is across the whole tier.'+
      (sn.moves ? ' This season closed a cycle \u2014 promotions and relegations are marked.' : ''))+
    ' Tap a team for its schedule, where a dot marks an opponent from outside its division '+
    '\u2014 in the conference color for a non-conference game, in the other half\u2019s shade '+
    'for a crossover.';
  const M=sn.moves||{};
  const upS=new Set(M.up||[]), dnS=new Set(M.down||[]);
  const nuS=new Set(M.nearUp||[]), ndS=new Set(M.nearDown||[]);
  const moveTag = id => dnS.has(id) ? '<span class="tag reltag">relegated</span>'
                     : upS.has(id) ? '<span class="tag protag">promoted</span>'
                     : ndS.has(id) ? '<span class="tag neartag">stayed up</span>'
                     : nuS.has(id) ? '<span class="tag neartag">just missed</span>' : '';
  const tiers = pick==='all'?['d1','d2']:[pick];
  const get = id => sn.teams[id];
  if($('#lgView').value==='list') return renderFlat(sn,pre,tiers,get,sortBy,host);
  for(const tr of tiers){
    if(pick==='all') host.appendChild(el('h2','sec',tr==='d1'?'Tier I':'Tier II'));
    const cb=champBox(sn,tr); if(cb) host.appendChild(cb);
    const tin=sn.tiers[tr];
    const atl=new Set(tin.at), seedOf=tin.seedOf;
    const champId=tin.po?tin.po.champion:null;
    for(const c of CONFS) for(const d of DIVS.filter(x=>x.indexOf(c+' ')===0)){
      const ids=tin.divs[d]||[];
      if(!ids.length) continue;
      let order=[...ids];
      if(sortBy==='name') order.sort((a,b)=>get(a).name.localeCompare(get(b).name));
      else if(sortBy==='rating') order.sort((a,b)=>get(b).rating-get(a).rating);
      const q=(!pre&&tr==='d1')?Math.max(sn.quota[d]||0,1):0;
      const drop=q?ids.slice(ids.length-q):[];
      const box=el('div','divblock');
      const avg=(ids.reduce((a,id)=>a+get(id).rating,0)/ids.length).toFixed(1);
      box.innerHTML='<div class="divhead" style="--c:'+dcol(d)+'"><h3>'+esc(d)+'</h3><span>'+
        (pre?ids.length+' teams \u00b7 avg '+avg:'winner '+esc(get(ids[0]).name)+' \u00b7 avg '+avg)+
        '</span></div><div class="divbody"></div>';
      const tb=el('table');
      tb.innerHTML='<thead><tr><th class="n">Rk</th><th>Team</th><th class="n">Rtg</th>'+
        (pre?'<th class="hidesm">Home</th>':'<th class="n">Div</th><th class="n">W-L</th><th class="n">SOS</th>')+
        '</tr></thead>';
      const body=el('tbody');
      for(const id of order){
        const t=get(id), row=el('tr');
        if(!pre){
          if(dnS.has(id)) row.className='rel';
          else if(upS.has(id)) row.className='pro';
          else if(id===champId) row.className='ch';
          else if(ndS.has(id)||nuS.has(id)) row.className='near';
          else if(id===ids[0]) row.className='dw';
          else if(atl.has(id)) row.className='atl';
          else if(!sn.moves && drop.indexOf(id)>=0) row.className='rel';
        }
        const crown = (!pre&&id===champId)?'<span class="tag chtag">\u2605 champion</span>':'';
        const tag = !pre ? (id===ids[0]?'<span class="tag dwtag">wins division</span>'
                  : (atl.has(id)?'<span class="tag atltag">at-large</span>':'')) : '';
        const sd = seedOf[id]?'<span class="tag sdtag">seed '+seedOf[id]+'</span>':'';
        row.innerHTML='<td class="n" style="color:var(--muted)">'+sn.rank[id]+'</td>'+
          '<td>'+teamCell(esc(t.name),moveTag(id)+crown+tag+sd)+'</td><td class="n">'+t.rating+'</td>'+
          (pre?'<td class="hidesm">'+esc(t.city)+', '+t.st+'</td>'
             :'<td class="n">'+t.dw+'-'+t.dl+'</td><td class="n">'+t.w+'-'+t.l+'</td>'+
              '<td class="n">'+t.sos+'<span class="sosrk">'+t.sosRank+'</span></td>');
        expandable(row,id,pre?4:6);
        body.appendChild(row);
      }
      tb.appendChild(body); box.querySelector('.divbody').appendChild(tb); host.appendChild(box);
    }
  }
}

function renderFlat(sn,pre,tiers,get,sortBy,host){
  const M=sn.moves||{};
  const upS=new Set(M.up||[]), dnS=new Set(M.down||[]);
  const nuS=new Set(M.nearUp||[]), ndS=new Set(M.nearDown||[]);
  const moveTag = id => dnS.has(id) ? '<span class="tag reltag">relegated</span>'
                     : upS.has(id) ? '<span class="tag protag">promoted</span>'
                     : ndS.has(id) ? '<span class="tag neartag">stayed up</span>'
                     : nuS.has(id) ? '<span class="tag neartag">just missed</span>' : '';
  for(const tr of tiers){
    const tin=sn.tiers[tr];
    const ids=[].concat.apply([],Object.values(tin.divs));
    if(!ids.length) continue;
    const atl=new Set(tin.at), seedOf=tin.seedOf;
    const champId=tin.po?tin.po.champion:null;
    const winners=new Set(Object.values(tin.divs).map(l=>l[0]));
    let order=[...ids];
    if(sortBy==='name') order.sort((a,b)=>get(a).name.localeCompare(get(b).name));
    else if(sortBy==='rating') order.sort((a,b)=>get(b).rating-get(a).rating);
    else order.sort((a,b)=>sn.rank[a]-sn.rank[b]);
    const cbf=champBox(sn,tr); if(cbf) host.appendChild(cbf);
    const box=el('div','divblock');
    box.innerHTML='<div class="divhead" style="--c:var(--chalk)"><h3>'+
      (tr==='d1'?'Tier I':'Tier II')+'</h3><span>'+ids.length+' teams, one table</span></div>'+
      '<div class="divbody"></div>';
    const idx=el('div','divindex');
    for(const c of CONFS) for(const d of DIVS.filter(x=>x.indexOf(c+' ')===0)){
      const list=tin.divs[d]||[];
      if(!list.length) continue;
      const avg=(list.reduce((a,id)=>a+get(id).rating,0)/list.length).toFixed(1);
      idx.insertAdjacentHTML('beforeend','<span><i style="background:'+dcol(d)+'"></i>'+
        esc(d)+' <em>'+list.length+' \u00b7 avg '+avg+'</em></span>');
    }
    const tb=el('table');
    tb.innerHTML='<thead><tr><th class="n">Rk</th><th>Team</th><th class="hidesm">Division</th>'+
      '<th class="n">Rtg</th>'+(pre?'':'<th class="n">W-L</th><th class="n">SOS</th>')+'</tr></thead>';
    const body=el('tbody');
    for(const id of order){
      const t=get(id), row=el('tr');
      if(!pre){
        if(dnS.has(id)) row.className='rel';
        else if(upS.has(id)) row.className='pro';
        else if(id===champId) row.className='ch';
        else if(ndS.has(id)||nuS.has(id)) row.className='near';
        else if(winners.has(id)) row.className='dw';
        else if(atl.has(id)) row.className='atl';
      }
      const crown = (!pre&&id===champId)?'<span class="tag chtag">\u2605 champion</span>':'';
      const tag = (!pre&&winners.has(id))?'<span class="tag dwtag">wins division</span>'
                : (!pre&&atl.has(id))?'<span class="tag atltag">at-large</span>':'';
      const sd = seedOf[id]?'<span class="tag sdtag">seed '+seedOf[id]+'</span>':'';
      row.innerHTML='<td class="n" style="color:var(--muted)">'+sn.rank[id]+'</td>'+
        '<td>'+teamCell('<span class="tdot" style="background:'+dcol(t.div)+'" title="'+esc(t.div)+
          '"></span>'+esc(t.name), moveTag(id)+crown+tag+sd)+
        '</td><td class="hidesm">'+esc(t.div)+'</td>'+
        '<td class="n">'+t.rating+'</td>'+
        (pre?'':'<td class="n">'+t.w+'-'+t.l+'</td><td class="n">'+t.sos+
          '<span class="sosrk">'+t.sosRank+'</span></td>');
      expandable(row,id,pre?4:6);
      body.appendChild(row);
    }
    tb.appendChild(body);
    const bd=box.querySelector('.divbody');
    bd.appendChild(idx); bd.appendChild(tb);
    host.appendChild(box);
  }
}

/* ---------- playoff ---------- */
function renderDivLegend(){
  $('#divLegend').innerHTML = DIVS.map(d=>
    '<span><i style="background:'+dcol(d)+'"></i>'+esc(d)+'</span>').join('');
}
function renderPlayoff(){
  const host=$('#playoffOut'), tr=$('#poTier').value, sn=snap();
  if(sn.kind==='pre'){host.innerHTML='<div class="empty">No bracket for the '+sn.season+
    ' preseason. Play the season, or pick a results year above.</div>';return;}
  const po=sn.tiers[tr].po, T=sn.teams, R=sn.rank, seedOf=sn.tiers[tr].seedOf;
  if(!po){host.innerHTML='<div class="empty">Not enough divisions to seed a bracket.</div>';return;}
  host.innerHTML='';
  host.appendChild(champBox(sn,tr));
  // In the first round nobody is seeded yet — the games are what decide it — so
  // those lines lead with the team's ranking and carry the seed it went on to
  // earn at the end. Later rounds just show the seed, which is by then its name.
  const side=(id,cls,score,rankFirst)=>{
    const d=T[id].div, c=dcol(d);
    const lead=rankFirst||!seedOf[id] ? '#'+R[id] : seedOf[id];
    const earned = rankFirst&&seedOf[id]
      ? '<span class="tag sdtag">seed '+seedOf[id]+'</span>' : '';
    return '<div class="'+cls+'" style="border-left:3px solid '+c+'">'+
      '<span><span class="cdot" style="background:'+c+'" data-div="'+esc(d)+'"></span>'+
      '<span class="sd">'+lead+'</span>'+
      '<span class="tname">'+esc(T[id].name)+'</span>'+
      '<span class="conftag" title="'+esc(d)+'">- '+esc(divAbbr(d))+'</span>'+earned+'</span>'+
      '<span>'+score+'</span></div>';
  };
  const line=(g,rankFirst)=>{
    const hw=g.hs>g.vs;
    return '<div class="mt">'+side(g.h,hw?'w':'l',g.hs,rankFirst)+
           side(g.v,hw?'l':'w',g.vs,rankFirst)+'</div>';
  };
  const cap=g=>{
    const n=g.bowl||g.label, c=g.city?'<span class="venue">'+esc(g.city)+'</span>':'';
    return '<div class="bowl">'+esc(n)+c+'</div>';
  };
  const sec=(title,note,games,bowls,rankFirst)=>{
    const d=el('div','divblock');
    const body=games.map(g=>(bowls?cap(g):'')+line(g,rankFirst)).join('');
    d.innerHTML='<div class="divhead" style="--c:var(--line)"><h3>'+title+'</h3><span>'+note+'</span></div>'+
      '<div class="divbody">'+body+'</div>';
    return d;
  };
  const ccgBox=sec('Conference championships',
    'host campus rotates yearly; winners take seeds 1\u20134, the teams they beat 5\u20138',
    po.ccg,true,true);
  host.appendChild(ccgBox);
  host.appendChild(sec('At-large play-in','eight winners take seeds 9\u201316',po.pin,true,true));
  const COLW=216, GAP=46, MH=72, SLOT=92;
  const pos=[];
  po.rounds.forEach((rd,r)=>{
    pos[r]=rd.games.map((g,i)=> r===0 ? i*SLOT : (pos[r-1][2*i]+pos[r-1][2*i+1])/2);
  });
  const H=po.rounds[0].games.length*SLOT, W=po.rounds.length*COLW+(po.rounds.length-1)*GAP;
  let svg='<svg class="brlines" width="'+W+'" height="'+H+'" aria-hidden="true">';
  for(let r=1;r<po.rounds.length;r++){
    po.rounds[r].games.forEach((g,i)=>{
      const tx=r*(COLW+GAP), ty=pos[r][i]+MH/2;
      [2*i,2*i+1].forEach(f=>{
        const fx=(r-1)*(COLW+GAP)+COLW, fy=pos[r-1][f]+MH/2, mx=fx+GAP/2;
        svg+='<path d="M'+fx+' '+fy+' H'+mx+' V'+ty+' H'+tx+'" fill="none" stroke="var(--line)" stroke-width="1.5"/>';
      });
    });
  }
  svg+='</svg>';
  let heads='', boxes='';
  po.rounds.forEach((rd,r)=>{
    heads+='<div class="brhead" style="left:'+(r*(COLW+GAP))+'px;width:'+COLW+'px">'+rd.name+'</div>';
    rd.games.forEach((g,i)=>{
      boxes+='<div class="brmatch" style="left:'+(r*(COLW+GAP))+'px;top:'+pos[r][i]+'px;width:'+COLW+'px">'+
        cap(g)+line(g)+'</div>';
    });
  });
  const br=el('div','bracket','<div class="brwrap" style="width:'+W+'px;height:'+(H+26)+'px">'+
    heads+'<div class="brinner" style="height:'+H+'px">'+svg+boxes+'</div></div>');
  const wrap=el('div','divblock');
  wrap.innerHTML='<div class="divhead" style="--c:var(--chalk)"><h3>Main bracket</h3>'+
    '<span>16 teams, fixed seeding</span></div>';
  const bd=el('div','divbody'); bd.appendChild(br); wrap.appendChild(bd); host.appendChild(wrap);
  if(po.bowls && po.bowls.length)
    host.appendChild(sec('Bowl season','the rest of the slate, for teams that missed the field',po.bowls,true));
}

// The champion banner, shared by the playoff tab and the head of each league
// table. Null in a preseason, or before a bracket has been seeded.
function champBox(sn,tr){
  const tin=sn.tiers[tr], po=tin&&tin.po;
  if(!po) return null;
  const ch=sn.teams[po.champion];
  if(!ch) return null;
  const b=el('div','champ','<b>'+esc(ch.name)+'</b><span class="note">'+
    (tr==='d1'?'Tier I':'Tier II')+' champion, '+sn.season+' \u00b7 '+ch.w+'-'+ch.l+
    ' \u00b7 '+esc(ch.div)+'</span>');
  b.style.borderColor=CC[ch.conf];
  b.style.background='color-mix(in srgb, '+CC[ch.conf]+' 10%, transparent)';
  return b;
}

/* ---------- movement ---------- */
function renderMove(){
  const host=$('#moveOut'); host.innerHTML='';
  $('#moveIntro').innerHTML='<p>Every second season the table settles. '+
    'The first cycle is relegation only: each Tier I division sheds enough teams to reach 16, trimming '+
    'the tier from '+DATA.d1.length+' to 128. After that it is one down and one up per division, always inside '+
    'the same footprint, so a team never changes region just because it changed tiers. Cycle standing uses '+
    'the combined record across both seasons.</p>'+
    '<p><b>Relegation</b> takes the worst two-year record in each division. Ties run through '+
    'conference record, head to head over the two years, point differential capped at \u00b1'+PD_CAP+
    ' a game, strength of schedule, playoff ranking, then a draw. The cap is there so a team cannot '+
    'bury weak opponents to buy its way clear.</p>'+
    '<p><b>Promotion</b> scores every Tier II team over the cycle: '+
    Math.round(PRO_W.record*100)+'% two-year record, '+Math.round(PRO_W.playoff*100)+'% playoff run, '+
    Math.round(PRO_W.sos*100)+'% strength of schedule, '+Math.round(PRO_W.rank*100)+'% ranking. '+
    'The playoff share is measured against a perfect run \u2014 reaching the field and winning out \u2014 '+
    'not against whoever went furthest in that division, so a weak field scores low across the board. '+
    'Going unbeaten against nobody does not get you up.</p>';
  if(S.inCycle>=2){
    const n=S.cycle===1?(sizeOf('d1')-128):8;
    const box=el('div','champ');
    box.innerHTML='<b>The table is settled</b><p class="note" style="margin:6px 0 10px">'+
      (S.cycle===1 ? 'First cycle is relegation only. '+n+' teams drop so Tier I lands on 128.'
        : 'Each Tier I division relegates its worst team; each Tier II division promotes its best.')+'</p>';
    const b=el('button','btn go','Send them up and down'); b.onclick=settle;
    box.appendChild(b); host.appendChild(box);
  }
  if(!S.moves.length){
    host.appendChild(el('div','empty','Nothing has moved yet. Play two seasons, then settle the table.'));
    return;
  }
  const LABEL={
    up:   ['up to Tier I','var(--up)','pro'],
    down: ['down to Tier II','var(--down)','rel'],
    nearDown:['stayed up','var(--central)','near'],
    nearUp:  ['just missed','var(--central)','near'],
    swap: ['rebalanced','var(--muted)','']
  };
  const table=(rows,cols)=>{
    const tb=el('table');
    tb.innerHTML='<thead><tr><th>Team</th><th>'+cols+'</th><th class="n">Two-year</th>'+
      '<th class="n">Outcome</th></tr></thead>';
    const body=el('tbody');
    rows.forEach(mv=>{
      const L=LABEL[mv.dir];
      const row=el('tr',L[2]);
      row.innerHTML='<td>'+esc(mv.name)+'</td><td>'+esc(mv.div)+'</td>'+
        '<td class="n">'+esc(mv.rec)+'</td>'+
        '<td class="n" style="color:'+L[1]+'">'+L[0]+'</td>';
      body.appendChild(row);
      if(mv.why){
        const wr=el('tr','whyrow');
        wr.innerHTML='<td colspan="4">'+esc(mv.why)+'</td>';
        body.appendChild(wr);
      }
    });
    tb.appendChild(body);
    return tb;
  };
  const bySort=(x,y)=>x.div.localeCompare(y.div)||x.dir.localeCompare(y.dir);
  // one collapsible block, whichever way the moves are grouped
  const block=(title,note,open,fill)=>{
    const box=el('details','divblock cyc');
    box.open=open;
    box.innerHTML='<summary class="divhead" style="--c:var(--chalk)"><h3>'+esc(title)+'</h3>'+
      '<span>'+esc(note)+'</span></summary><div class="divbody"></div>';
    fill(box.querySelector('.divbody'));
    host.appendChild(box);
  };
  const groups=(bd,rows)=>{
    const pick=k=>rows.filter(x=>k.indexOf(x.dir)>=0).sort(bySort);
    const moved=pick(['down','up']);
    if(moved.length){
      bd.appendChild(el('h4','movehead','Changed tier'));
      bd.appendChild(table(moved,'Division'));
    }
    const near=pick(['nearDown','nearUp']);
    if(near.length){
      bd.appendChild(el('h4','movehead','Closest calls \u2014 nobody moved'));
      bd.appendChild(table(near,'Division'));
    }
    const swaps=pick(['swap']);
    if(swaps.length){
      bd.appendChild(el('h4','movehead','Division rebalancing \u2014 same tier'));
      bd.appendChild(table(swaps,'Moved between'));
    }
  };

  if($('#moveSort').value==='conf'){
    // split by footprint, then kept in cycles inside it, newest first, so a
    // conference reads as its own history rather than one undated pile
    CONFS.forEach((c,i)=>{
      const per=S.moves
        .map(m=>({cycle:m.cycle, season:m.season,
                  rows:m.moves.filter(x=>x.div.indexOf(c+' ')===0)}))
        .filter(g=>g.rows.length);
      if(!per.length) return;
      const moved=per.reduce((n,g)=>n+g.rows.filter(x=>x.dir==='down'||x.dir==='up').length,0);
      const total=per.reduce((n,g)=>n+g.rows.length,0);
      block(c, per.length+' cycle'+(per.length===1?'':'s')+' \u00b7 '+moved+' moved, '+
        (total-moved)+' other', i===0, bd=>{
          per.forEach(g=>{
            bd.appendChild(el('h4','cyclehead','Cycle '+g.cycle+' \u00b7 after '+g.season));
            groups(bd,g.rows);
          });
        });
    });
    return;
  }

  S.moves.forEach((m,idx)=>{
    const nMoved=m.moves.filter(x=>x.dir==='down'||x.dir==='up').length;
    const nNear=m.moves.filter(x=>x.dir==='nearDown'||x.dir==='nearUp').length;
    block('Cycle '+m.cycle, 'after '+m.season+' \u00b7 '+nMoved+' moved, '+nNear+' near misses',
      idx===0, bd=>groups(bd,m.moves));   // newest cycle open, the rest folded
  });
}

/* ---------- ratings ---------- */
function renderRatings(){
  const q=$('#rateSearch').value.trim().toLowerCase(), host=$('#ratings');
  host.innerHTML='';
  const list=S.teams.filter(t=>!q||t.name.toLowerCase().indexOf(q)>=0||t.city.toLowerCase().indexOf(q)>=0)
    .sort((a,b)=>b.rating-a.rating).slice(0,180);
  for(const t of list){
    const r=el('div','rate','<div>'+esc(t.name)+' <em>'+(t.tier==='d1'?'I':'II')+' \u00b7 '+esc(t.div)+'</em></div>');
    const inp=el('input'); inp.type='range'; inp.min=1; inp.max=99; inp.step=1;
    inp.value=Math.round(t.rating); inp.setAttribute('aria-label','Rating for '+t.name);
    const num=el('div','n',String(Math.round(t.rating))); num.style.textAlign='right';
    inp.oninput=()=>{t.rating=+inp.value;num.textContent=inp.value;};
    r.appendChild(inp); r.appendChild(num); host.appendChild(r);
  }
  if(!list.length) host.appendChild(el('div','empty','No team by that name.'));
}

function renderAll(){renderDeck();renderLeague();renderMap();renderPlayoff();renderMove();renderRatings();
  measureSticky();}
function renderViews(){renderLeague();mapFocus=null;$('#mapPick').innerHTML='';renderMap();renderPlayoff();
  measureSticky();}

/* ---------- info sheet ---------- */
let lastFocus=null;
function openInfo(){
  lastFocus=document.activeElement;
  $('#infoWrap').hidden=false;
  $('#infoClose').focus();
  document.body.style.overflow='hidden';
}
function closeInfo(){
  $('#infoWrap').hidden=true;
  document.body.style.overflow='';
  if(lastFocus&&lastFocus.focus) lastFocus.focus();
}
$('#infoBtn').onclick=openInfo;
$('#infoClose').onclick=closeInfo;
$('#infoWrap').addEventListener('click',e=>{ if(e.target===$('#infoWrap')) closeInfo(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#infoWrap').hidden) closeInfo(); });

/* ---------- wiring ---------- */
S.snaps.push(makePre()); S.view=0;
buildTabs(); renderChips(); renderDivLegend();
// Section headers stick below the season bar, whose height moves with wrapping.
function measureSticky(){
  const R=document.documentElement.style;
  const bar=document.querySelector('.stickybar');
  if(bar) R.setProperty('--barh',(bar.offsetHeight||0)+'px');
  const dh=document.querySelector('.divhead');
  if(dh&&dh.offsetHeight) R.setProperty('--divh',dh.offsetHeight+'px');
  // tier headings only exist in the both-tiers league view, so the offset they
  // add is scoped to that list rather than every sticky header on the page
  const lg=$('#league'), sec=lg&&lg.querySelector('h2.sec');
  if(lg) lg.style.setProperty('--sech',(sec&&sec.offsetHeight?sec.offsetHeight:0)+'px');
}
(()=>{
  const bar=document.querySelector('.stickybar');
  measureSticky();
  if(window.ResizeObserver) new ResizeObserver(measureSticky).observe(bar);
  else window.addEventListener('resize',measureSticky);
})();
(()=>{
  const host=$('#playoffOut'), tip=$('#tip');
  const showDotTip=e=>{
    const dot=e.target.closest('.cdot[data-div]');
    if(!dot){ tip.style.opacity=0; return; }
    const p=e.touches?e.touches[0]:e;
    tip.innerHTML='<b>'+esc(dot.dataset.div)+'</b>';
    placeTip(tip,p.clientX,p.clientY);
  };
  host.addEventListener('mousemove',showDotTip);
  host.addEventListener('mouseleave',()=>{tip.style.opacity=0;});
  host.addEventListener('click',e=>{
    if(!e.target.closest('.cdot[data-div]')) return;
    showDotTip(e);
    setTimeout(()=>{tip.style.opacity=0;},1800);
  });
})();
$('#mapTier').onchange=()=>{mapFocus=null;renderMap();};
$('#mapGroup').onchange=e=>{mapGroup=e.target.value;mapFilter=new Set(groupKeys());mapFocus=null;
  renderChips();renderMap();$('#mapPick').innerHTML='';};
$('#zIn').onclick=()=>{mapZoomStep(1.6);mapRelayout();};
$('#zOut').onclick=()=>{mapZoomStep(1/1.6);mapRelayout();};
$('#zReset').onclick=mapResetZoom;
// tier headings appear and vanish with these, and the sticky stack is offset by them
const relist=()=>{renderLeague();measureSticky();};
$('#lgTier').onchange=relist;
$('#lgView').onchange=relist;
$('#lgSort').onchange=relist;
$('#poTier').onchange=renderPlayoff;
$('#moveSort').onchange=renderMove;
$('#moveInfoBtn').onclick=()=>{
  const box=$('#moveIntro'), show=box.hidden;
  box.hidden=!show;
  $('#moveInfoBtn').setAttribute('aria-expanded',String(show));
};
$('#yearSel').onchange=e=>{S.view=+e.target.value;renderViews();renderDeck();};
$('#rateSearch').oninput=renderRatings;
$('#rateReset').onclick=()=>{
  for(const t of S.teams) t.rating=t.base;
  if(S.phase==='pre'){ S.snaps[S.snaps.length-1]=makePre(); }
  renderAll();
};
$('#play2Btn').onclick=()=>{
  let guard=0;
  while(guard++<12 && !(S.phase==='done'&&S.inCycle>=2)){
    if(S.phase==='pre') playSeason(); else advance();
  }
  settle();
};
$('#resetBtn').onclick=()=>{
  if(confirm('Start over from the 2027 preseason? This clears everything you’ve played so far.')) location.reload();
};
renderAll();
