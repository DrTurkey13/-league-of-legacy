const LEAGUE_ID = '1312063787448139776';
const API = 'https://api.sleeper.app/v1';
let state = { league:null, users:[], rosters:[], players:{}, transactions:[], ownerByRoster:{}, nflState:null, currentMatchups:[], previous:null };

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function go(route){
  $$('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${route}`));
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
  $('#nav').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-route]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.route)));
$('#menu-button').addEventListener('click',()=>$('#nav').classList.toggle('open'));

async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
function teamName(user, rosterId){ return user?.metadata?.team_name || user?.display_name || user?.username || `Team ${rosterId}`; }
function pts(settings,key){ return Number(`${settings?.[key]||0}.${String(settings?.[`${key}_decimal`]||0).padStart(2,'0')}`); }
function playerName(id){ const p=state.players[id]; return p ? `${p.first_name||''} ${p.last_name||''}`.trim() || p.full_name || id : `Player ${id}`; }
function fmtDate(ms){ return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(ms)); }

async function loadPlayers(){
  try{
    const cache=JSON.parse(localStorage.getItem('sleeper_players_nfl')||'null');
    if(cache && Date.now()-cache.at < 86400000){ state.players=cache.data; return; }
  }catch{}
  try{ state.players=await getJSON(`${API}/players/nfl`); localStorage.setItem('sleeper_players_nfl',JSON.stringify({at:Date.now(),data:state.players})); }catch(e){ console.warn('Player index unavailable',e); }
}

async function loadLeague(){
  const [league,users,rosters] = await Promise.all([
    getJSON(`${API}/league/${LEAGUE_ID}`), getJSON(`${API}/league/${LEAGUE_ID}/users`), getJSON(`${API}/league/${LEAGUE_ID}/rosters`)
  ]);
  state.league=league; state.users=users; state.rosters=rosters;
  const byUser=Object.fromEntries(users.map(u=>[u.user_id,u]));
  state.ownerByRoster=Object.fromEntries(rosters.map(r=>[r.roster_id,byUser[r.owner_id]]));
  const name='League of Legacy'; $('#league-name').textContent=name; $('#hero-title').textContent=name; $('#footer-league').textContent=name; $('#stat-teams').textContent=league.total_rosters||rosters.length;
}

async function loadTransactions(){
  const weeks=[...Array(19)].map((_,i)=>i); // include preseason/leg 0 through week 18
  const results=await Promise.all(weeks.map(w=>getJSON(`${API}/league/${LEAGUE_ID}/transactions/${w}`).catch(()=>[])));
  const map=new Map(); results.flat().forEach(t=>map.set(t.transaction_id,t));
  state.transactions=[...map.values()].filter(t=>t.status==='complete').sort((a,b)=>(b.status_updated||b.created)-(a.status_updated||a.created));
}


function rosterLabel(ownerMap, rosterId){
  const u=ownerMap?.[rosterId];
  return { team: teamName(u,rosterId), owner: u?.display_name||u?.username||'' };
}

function placementFromBrackets(winners=[], losers=[], placement){
  const all=[...(winners||[]),...(losers||[])];
  const game=all.find(m=>Number(m.p)===Number(placement));
  if(!game || game.w==null) return null;
  if(Number(placement)%2===1){
    return { [placement]: game.w, [placement+1]: game.l };
  }
  return null;
}

async function loadLegacy(){
  const prevId=state.league?.previous_league_id;
  if(!prevId || prevId==='0'){ renderLegacyFallback(); return; }
  try{
    const [league,users,rosters,winners,losers] = await Promise.all([
      getJSON(`${API}/league/${prevId}`),
      getJSON(`${API}/league/${prevId}/users`),
      getJSON(`${API}/league/${prevId}/rosters`),
      getJSON(`${API}/league/${prevId}/winners_bracket`).catch(()=>[]),
      getJSON(`${API}/league/${prevId}/losers_bracket`).catch(()=>[])
    ]);
    const byUser=Object.fromEntries(users.map(u=>[u.user_id,u]));
    const ownerMap=Object.fromEntries(rosters.map(r=>[r.roster_id,byUser[r.owner_id]]));
    state.previous={league,users,rosters,winners,losers,ownerMap};
    $('#legacy-season').textContent=`${league.season||'Last'} season`;

    const champGame=placementFromBrackets(winners,losers,1);
    const lastGame=placementFromBrackets(winners,losers,11);
    if(champGame?.[1]){
      const x=rosterLabel(ownerMap,champGame[1]);
      $('#reigning-champ').textContent=x.team;
      $('#reigning-champ-owner').textContent=x.owner?`${x.owner} · ${league.season} Champion`:`${league.season} Champion`;
    }else{
      $('#reigning-champ').textContent='Not available yet';
      $('#reigning-champ-owner').textContent='Sleeper has not posted a completed championship result.';
    }
    if(lastGame?.[12]){
      const x=rosterLabel(ownerMap,lastGame[12]);
      $('#last-place').textContent=x.team;
      $('#last-place-owner').textContent=x.owner?`${x.owner} · 12th place`:'12th place';
    }else{
      $('#last-place').textContent='Not available yet';
      $('#last-place-owner').textContent='No completed 11th/12th-place bracket result found.';
    }
  }catch(e){
    console.warn('Legacy data unavailable',e);
    renderLegacyFallback();
  }
}

function renderLegacyFallback(){
  $('#reigning-champ').textContent='Awaiting history';
  $('#reigning-champ-owner').textContent='Previous-season Sleeper history is unavailable.';
  $('#last-place').textContent='Awaiting history';
  $('#last-place-owner').textContent='Previous-season Sleeper history is unavailable.';
}

async function loadWeeklyScore(){
  try{
    state.nflState=await getJSON(`${API}/state/nfl`);
    const week=Math.max(1,Number(state.nflState?.week||1));
    $('#high-score-label').textContent=`WEEK ${week} HIGH SCORE`;
    const matchups=await getJSON(`${API}/league/${LEAGUE_ID}/matchups/${week}`).catch(()=>[]);
    state.currentMatchups=matchups;
    const scored=matchups.filter(m=>Number(m.points)>0);
    if(!scored.length){
      $('#weekly-high-score').textContent='No score yet';
      $('#weekly-high-score-sub').textContent='The violence has not started.';
      return;
    }
    const best=scored.reduce((a,b)=>Number(b.points)>Number(a.points)?b:a);
    const x=rosterLabel(state.ownerByRoster,best.roster_id);
    $('#weekly-high-score').innerHTML=`${esc(x.team)} <span class="score-points">${Number(best.points).toFixed(2)}</span>`;
    $('#weekly-high-score-sub').textContent=x.owner?`${x.owner} currently owns the week.`:'Currently owns the week.';
  }catch(e){
    console.warn('Weekly score unavailable',e);
    $('#weekly-high-score').textContent='Unavailable';
    $('#weekly-high-score-sub').textContent='Could not load the current matchup board.';
  }
}

function sortedRosters(){
  return [...state.rosters].sort((a,b)=>{
    const A=a.settings||{},B=b.settings||{};
    return (B.wins||0)-(A.wins||0) || (A.losses||0)-(B.losses||0) || pts(B,'fpts')-pts(A,'fpts');
  });
}

function renderRankings(){
  const rows=sortedRosters();
  $('#home-rankings').innerHTML=rows.slice(0,5).map((r,i)=>{const u=state.ownerByRoster[r.roster_id];const s=r.settings||{};return `<div class="rank-mini"><div class="rank-number">${i+1}</div><div><div class="team-name">${esc(teamName(u,r.roster_id))}</div><div class="team-sub">${pts(s,'fpts').toFixed(2)} PF</div></div><div class="record">${s.wins||0}-${s.losses||0}${s.ties?`-${s.ties}`:''}</div></div>`}).join('') || '<div class="loading">No standings yet.</div>';
  $('#rankings-table').innerHTML=`<table><thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>PF</th><th>PA</th><th>Moves</th><th>FAAB Used</th></tr></thead><tbody>${rows.map((r,i)=>{const u=state.ownerByRoster[r.roster_id],s=r.settings||{};return `<tr><td><div class="rank-pill ${i===0?'top':''}">${i+1}</div></td><td><strong>${esc(teamName(u,r.roster_id))}</strong><div class="team-sub">${esc(u?.display_name||u?.username||'')}</div></td><td><strong>${s.wins||0}-${s.losses||0}${s.ties?`-${s.ties}`:''}</strong></td><td>${pts(s,'fpts').toFixed(2)}</td><td>${pts(s,'fpts_against').toFixed(2)}</td><td>${s.total_moves||0}</td><td>${s.waiver_budget_used||0}</td></tr>`}).join('')}</tbody></table>`;
}

function assetsForRoster(t,rosterId){
  const a=[];
  Object.entries(t.adds||{}).filter(([,rid])=>Number(rid)===Number(rosterId)).forEach(([id])=>a.push(playerName(id)));
  (t.draft_picks||[]).filter(p=>Number(p.owner_id)===Number(rosterId)).forEach(p=>a.push(`${p.season} Round ${p.round} pick`));
  (t.waiver_budget||[]).filter(x=>Number(x.receiver)===Number(rosterId)).forEach(x=>a.push(`$${x.amount} FAAB`));
  return a;
}

function renderTrades(){
  const trades=state.transactions.filter(t=>t.type==='trade');
  $('#trades-feed').innerHTML=trades.length?trades.map(t=>{
    const sides=(t.roster_ids||[]).map(rid=>{const u=state.ownerByRoster[rid];const assets=assetsForRoster(t,rid);return `<div class="trade-side"><h3>${esc(teamName(u,rid))}</h3><ul>${assets.length?assets.map(x=>`<li>+ ${esc(x)}</li>`).join(''):'<li class="muted">No mapped assets</li>'}</ul></div>`});
    return `<article class="tx-card"><div class="tx-head"><div><div class="tx-type">COMPLETED TRADE</div></div><div class="tx-date">${fmtDate(t.status_updated||t.created)}</div></div><div class="trade-teams">${sides.join('<div class="swap">⇄</div>')}</div></article>`;
  }).join(''):'<div class="panel"><div class="loading">No completed trades found yet.</div></div>';
}


function renderFeaturedTrade(){
  const t=state.transactions.find(t=>t.type==='trade');
  const el=$('#featured-trade');
  if(!t){ el.innerHTML='<div class="loading">No completed trades yet. Somebody be irresponsible.</div>'; return; }
  const sides=(t.roster_ids||[]).slice(0,2).map(rid=>{
    const u=state.ownerByRoster[rid];
    const assets=assetsForRoster(t,rid);
    return `<div class="featured-side"><strong>${esc(teamName(u,rid))}</strong><div class="featured-assets">${assets.length?assets.slice(0,5).map(x=>`+ ${esc(x)}`).join('<br>'):'No mapped assets'}</div></div>`;
  });
  if(sides.length<2){ el.innerHTML='<div class="loading">Latest trade data is incomplete.</div>'; return; }
  const assetCount=Object.keys(t.adds||{}).length+(t.draft_picks||[]).length+(t.waiver_budget||[]).length;
  el.innerHTML=`<div class="featured-trade">${sides[0]}<div class="featured-arrow">⇄</div>${sides[1]}</div><div class="featured-meta"><span>${fmtDate(t.status_updated||t.created)}</span><span>${assetCount} asset${assetCount===1?'':'s'} moved</span></div>`;
}

function renderWaivers(){
  const tx=state.transactions.filter(t=>t.type==='waiver'||t.type==='free_agent');
  $('#waivers-feed').innerHTML=tx.length?tx.map(t=>{
    const rid=(t.roster_ids||[])[0]; const u=state.ownerByRoster[rid];
    const adds=Object.keys(t.adds||{}).map(playerName); const drops=Object.keys(t.drops||{}).map(playerName); const bid=t.settings?.waiver_bid;
    return `<article class="tx-card"><div class="tx-head"><div><div class="tx-type">${t.type==='waiver'?'WAIVER CLAIM':'FREE AGENT'}</div><strong>${esc(teamName(u,rid))}</strong></div><div class="tx-date">${fmtDate(t.status_updated||t.created)}</div></div><div class="waiver-line"><div><div>${adds.length?`Added <strong>${adds.map(esc).join(', ')}</strong>`:'Add not listed'}</div>${drops.length?`<div class="team-sub">Dropped ${drops.map(esc).join(', ')}</div>`:''}</div>${bid!=null?`<div class="faab">$${bid} FAAB</div>`:''}</div></article>`;
  }).join(''):'<div class="panel"><div class="loading">No waiver or free-agent activity found yet.</div></div>';
}

function renderHomeActivity(){
  const recent=state.transactions.slice(0,6);
  $('#home-activity').innerHTML=recent.length?recent.map(t=>{const rid=(t.roster_ids||[])[0],u=state.ownerByRoster[rid];const label=t.type==='trade'?'Trade completed':t.type==='waiver'?'Waiver claim':'Free-agent move';return `<div class="activity-mini"><div><strong>${esc(label)}</strong><div><span>${esc(teamName(u,rid))}</span></div></div><span>${fmtDate(t.status_updated||t.created)}</span></div>`}).join(''):'<div class="loading">No recent activity found.</div>';
}

async function boot(){
  try{
    await loadLeague();
    renderRankings();
    const legacyPromise=loadLegacy();
    const scorePromise=loadWeeklyScore();
    await Promise.all([loadPlayers(),loadTransactions()]);
    renderTrades(); renderWaivers(); renderHomeActivity(); renderFeaturedTrade();
    await Promise.allSettled([legacyPromise,scorePromise]);
  }catch(e){
    console.error(e);
    const msg=`<div class="callout danger">Couldn't reach Sleeper from this browser. Check your connection and reload. League ID: ${LEAGUE_ID}</div>`;
    $('#home-rankings').innerHTML=msg; $('#home-activity').innerHTML=msg; $('#rankings-table').innerHTML=msg; $('#trades-feed').innerHTML=msg; $('#waivers-feed').innerHTML=msg;
  }
}
boot();
