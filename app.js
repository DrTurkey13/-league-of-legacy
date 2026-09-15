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

function rosterDivision(roster){
  const raw=roster?.settings?.division ?? roster?.metadata?.division;
  const n=Number(raw);
  return Number.isFinite(n) ? n : null;
}

function divisionName(id){
  if(id==null) return 'League';
  const m=state.league?.metadata||{};
  return m[`division_${id}`] || m[`division_${id}_name`] || `Division ${id}`;
}

async function loadWeeklyAwards(){
  try{
    if(!state.nflState) state.nflState=await getJSON(`${API}/state/nfl`);
    const currentWeek=Math.max(1,Number(state.nflState?.week||1));
    const week=currentWeek-1;
    if(week<1){
      $('#power-division-label').textContent='POWER DIVISION';
      $('#power-division').textContent='Starts after Week 1';
      $('#power-division-sub').textContent='The strongest division will be crowned after each completed week.';
      $('#division-rankings').innerHTML='';
      $('#you-suck-label').textContent='YOU SUCK';
      $('#you-suck-manager').textContent='Nobody yet';
      $('#you-suck-sub').textContent='Give it a week. Somebody will earn it.';
      $('#idiot-label').textContent='IDIOT OF THE WEEK';
      $('#idiot-manager').textContent='Nobody yet';
      $('#idiot-sub').textContent='After Week 1, the highest-scoring benched player earns somebody the clown nose.';
      return;
    }

    const matchups=await getJSON(`${API}/league/${LEAGUE_ID}/matchups/${week}`).catch(()=>[]);
    const scoreByRoster=Object.fromEntries(matchups.map(m=>[Number(m.roster_id),Number(m.points||0)]));
    const scored=state.rosters.map(r=>({roster:r,points:scoreByRoster[Number(r.roster_id)]})).filter(x=>Number.isFinite(x.points));
    if(!scored.length) throw new Error('No completed-week scores');

    $('#power-division-label').textContent=`WEEK ${week} POWER DIVISION`;
    const grouped=new Map();
    for(const x of scored){
      const id=rosterDivision(x.roster);
      if(id==null) continue;
      if(!grouped.has(id)) grouped.set(id,[]);
      grouped.get(id).push(x.points);
    }
    const divisions=[...grouped.entries()].map(([id,scores])=>({
      id, name:divisionName(id), avg:scores.reduce((a,b)=>a+b,0)/scores.length, total:scores.reduce((a,b)=>a+b,0), teams:scores.length
    })).sort((a,b)=>b.avg-a.avg);

    if(divisions.length>1){
      const champ=divisions[0];
      $('#power-division').innerHTML=`${esc(champ.name)} <span class="score-points">${champ.avg.toFixed(2)}</span>`;
      $('#power-division-sub').textContent=`Best average score per team in Week ${week}.`;
      $('#division-rankings').innerHTML=divisions.map((d,i)=>`<div class="division-rank-row"><span>${i+1}. ${esc(d.name)}</span><strong>${d.avg.toFixed(2)}</strong></div>`).join('');
    }else{
      $('#power-division').textContent='No divisions found';
      $('#power-division-sub').textContent='Sleeper is not returning division assignments for this league.';
      $('#division-rankings').innerHTML='';
    }

    const worst=scored.reduce((a,b)=>b.points<a.points?b:a);
    const who=rosterLabel(state.ownerByRoster,worst.roster.roster_id);
    $('#you-suck-label').textContent=`WEEK ${week} YOU SUCK`;
    $('#you-suck-manager').innerHTML=`${esc(who.owner||who.team)} <span class="suck-points">${worst.points.toFixed(2)}</span>`;
    $('#you-suck-sub').textContent=who.owner?`${who.team} put up the fewest points in the league.`:'Fewest points in the league. Congratulations, I guess.';

    // Idiot of the Week: manager who left the highest-scoring eligible bench player out of the starting lineup.
    // Players in Sleeper reserve/IR or taxi slots are excluded; this is intended to measure an actual bench decision.
    const benchCandidates=[];
    for(const m of matchups){
      const roster=state.rosters.find(r=>Number(r.roster_id)===Number(m.roster_id));
      const starters=new Set((m.starters||[]).filter(Boolean));
      const reserve=new Set([...(roster?.reserve||[]),...(roster?.taxi||[])]);
      const playerIds=(m.players||Object.keys(m.players_points||{})).filter(Boolean);
      for(const pid of playerIds){
        if(starters.has(pid) || reserve.has(pid)) continue;
        const p=Number(m.players_points?.[pid] ?? 0);
        if(!Number.isFinite(p)) continue;
        benchCandidates.push({rosterId:Number(m.roster_id),playerId:pid,points:p});
      }
    }
    if(benchCandidates.length){
      const maxBench=Math.max(...benchCandidates.map(x=>x.points));
      const idiots=benchCandidates.filter(x=>Math.abs(x.points-maxBench)<0.001);
      const first=idiots[0];
      const idiotWho=rosterLabel(state.ownerByRoster,first.rosterId);
      $('#idiot-label').textContent=`WEEK ${week} IDIOT OF THE WEEK`;
      if(idiots.length===1){
        $('#idiot-manager').innerHTML=`${esc(idiotWho.owner||idiotWho.team)} <span class="idiot-player">${maxBench.toFixed(2)}</span>`;
        $('#idiot-sub').innerHTML=`Left <strong>${esc(playerName(first.playerId))}</strong> on the bench with ${maxBench.toFixed(2)} points. ${esc(idiotWho.team)} deserved better.`;
      }else{
        const names=[...new Set(idiots.map(x=>{const w=rosterLabel(state.ownerByRoster,x.rosterId);return w.owner||w.team;}))];
        $('#idiot-manager').innerHTML=`${esc(names.join(' & '))} <span class="idiot-player">${maxBench.toFixed(2)}</span>`;
        $('#idiot-sub').textContent=`Tie for the highest-scoring benched player at ${maxBench.toFixed(2)} points. Congratulations to all involved.`;
      }
    }else{
      $('#idiot-label').textContent=`WEEK ${week} IDIOT OF THE WEEK`;
      $('#idiot-manager').textContent='No eligible bench score';
      $('#idiot-sub').textContent='Nobody qualified this week.';
    }
  }catch(e){
    console.warn('Weekly awards unavailable',e);
    $('#power-division').textContent='Unavailable';
    $('#power-division-sub').textContent='Could not calculate the latest completed week.';
    $('#division-rankings').innerHTML='';
    $('#you-suck-manager').textContent='Unavailable';
    $('#you-suck-sub').textContent='Could not calculate the latest completed week.';
    $('#idiot-manager').textContent='Unavailable';
    $('#idiot-sub').textContent='Could not calculate the latest completed week.';
  }
}


async function loadYouSuckLeaderboard(){
  try{
    if(!state.nflState) state.nflState=await getJSON(`${API}/state/nfl`);
    const currentWeek=Math.max(1,Number(state.nflState?.week||1));
    const completedWeeks=Math.max(0,currentWeek-1);
    const el=$('#you-suck-leaderboard');
    const sub=$('#you-suck-season-sub');
    if(!el) return;
    if(completedWeeks<1){
      el.innerHTML='<div class="loading">Nobody has embarrassed themselves yet. Week 1 will fix that.</div>';
      if(sub) sub.textContent='Fewest points each completed week earns one You Suck.';
      return;
    }

    const weekly=await Promise.all(Array.from({length:completedWeeks},(_,i)=>i+1).map(async week=>{
      const matchups=await getJSON(`${API}/league/${LEAGUE_ID}/matchups/${week}`).catch(()=>[]);
      const scored=matchups.map(m=>({rosterId:Number(m.roster_id),points:Number(m.points)})).filter(x=>Number.isFinite(x.points));
      if(!scored.length) return null;
      const low=Math.min(...scored.map(x=>x.points));
      const losers=scored.filter(x=>Math.abs(x.points-low)<0.001);
      return {week,low,losers};
    }));

    const counts=new Map();
    const history=[];
    for(const w of weekly.filter(Boolean)){
      for(const loser of w.losers){
        counts.set(loser.rosterId,(counts.get(loser.rosterId)||0)+1);
        history.push({week:w.week,rosterId:loser.rosterId,points:loser.points});
      }
    }

    const rows=state.rosters.map(r=>{
      const who=rosterLabel(state.ownerByRoster,r.roster_id);
      const wins=counts.get(Number(r.roster_id))||0;
      const worsts=history.filter(h=>h.rosterId===Number(r.roster_id));
      const worstScore=worsts.length?Math.min(...worsts.map(h=>h.points)):null;
      return {rosterId:Number(r.roster_id),manager:who.owner||who.team,team:who.team,wins,worstScore};
    }).sort((a,b)=>b.wins-a.wins || ((a.worstScore??Infinity)-(b.worstScore??Infinity)) || a.manager.localeCompare(b.manager));

    const leaders=rows.filter(r=>r.wins>0);
    if(!leaders.length){
      el.innerHTML='<div class="loading">No completed weekly low-score awards found yet.</div>';
      return;
    }
    const max=leaders[0].wins;
    if(sub){
      const leadNames=leaders.filter(r=>r.wins===max).map(r=>r.manager);
      sub.textContent=`${leadNames.join(' & ')} ${leadNames.length>1?'are':'is'} currently leading with ${max} You Suck${max===1?'':'s'}.`;
    }
    el.innerHTML=leaders.map((r,i)=>`<div class="suck-leader-row ${r.wins===max?'leader':''}"><div class="suck-rank">${i+1}</div><div class="suck-person"><strong>${esc(r.manager)}</strong><span>${esc(r.team)}</span></div><div class="suck-count"><strong>${r.wins}</strong><span>You Suck${r.wins===1?'':'s'}</span></div></div>`).join('');
  }catch(e){
    console.warn('You Suck leaderboard unavailable',e);
    const el=$('#you-suck-leaderboard');
    if(el) el.innerHTML='<div class="loading">Could not calculate the season shame standings.</div>';
  }
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


async function loadAllTime(){
  const table=$('#alltime-table');
  if(!table) return;
  try{
    const seasons=[];
    let league=state.league;
    const seen=new Set();
    while(league?.league_id && !seen.has(league.league_id) && seasons.length<25){
      seen.add(league.league_id);
      const id=league.league_id;
      const [users,rosters,bracket]=await Promise.all([
        getJSON(`${API}/league/${id}/users`).catch(()=>[]),
        getJSON(`${API}/league/${id}/rosters`).catch(()=>[]),
        getJSON(`${API}/league/${id}/winners_bracket`).catch(()=>[])
      ]);
      seasons.push({league,users,rosters,bracket});
      const prev=league.previous_league_id;
      if(!prev || prev==='0' || prev===id) break;
      league=await getJSON(`${API}/league/${prev}`).catch(()=>null);
    }

    const managers=new Map();
    const ensure=(uid,u)=>{
      if(!managers.has(uid)) managers.set(uid,{uid,name:u?.display_name||u?.username||'Unknown Manager',team:u?.metadata?.team_name||'',seasons:0,w:0,l:0,t:0,pf:0,pa:0,titles:0});
      const x=managers.get(uid);
      if(u?.display_name||u?.username) x.name=u.display_name||u.username;
      if(u?.metadata?.team_name) x.team=u.metadata.team_name;
      return x;
    };

    for(const season of seasons){
      const byUser=Object.fromEntries(season.users.map(u=>[u.user_id,u]));
      const byRoster=Object.fromEntries(season.rosters.map(r=>[r.roster_id,r]));
      for(const r of season.rosters){
        if(!r.owner_id) continue;
        const x=ensure(r.owner_id,byUser[r.owner_id]);
        const st=r.settings||{};
        x.seasons++; x.w+=Number(st.wins||0); x.l+=Number(st.losses||0); x.t+=Number(st.ties||0);
        x.pf+=pts(st,'fpts'); x.pa+=pts(st,'fpts_against');
      }
      const final=season.bracket.find(g=>Number(g.p)===1);
      const champRid=final?.w;
      const champ=byRoster[champRid];
      if(champ?.owner_id) ensure(champ.owner_id,byUser[champ.owner_id]).titles++;
    }

    const rows=[...managers.values()].sort((a,b)=>b.w-a.w || (b.pf-a.pf));
    const games=x=>x.w+x.l+x.t;
    const pct=x=>games(x)?(x.w+x.t*.5)/games(x):0;
    const fmt=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    table.innerHTML=`<table><thead><tr><th>Manager</th><th>Seasons</th><th>Record</th><th>Win %</th><th>PF</th><th>PA</th><th>Titles</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td><strong>${esc(x.name)}</strong>${x.team?`<div class="team-sub">${esc(x.team)}</div>`:''}</td><td>${x.seasons}</td><td><strong>${x.w}-${x.l}${x.t?`-${x.t}`:''}</strong></td><td>${(pct(x)*100).toFixed(1)}%</td><td>${fmt(x.pf)}</td><td>${fmt(x.pa)}</td><td><strong>${x.titles}</strong></td></tr>`).join('')}</tbody></table>`;

    const years=seasons.map(s=>s.league.season).filter(Boolean).sort();
    const totalGames=rows.reduce((n,x)=>n+games(x),0)/2;
    $('#alltime-summary').innerHTML=`<div class="stat-card"><span class="stat-label">Seasons</span><strong>${seasons.length}</strong></div><div class="stat-card"><span class="stat-label">History</span><strong>${esc(years.length?`${years[0]}–${years[years.length-1]}`:'Sleeper')}</strong></div><div class="stat-card"><span class="stat-label">Managers</span><strong>${rows.length}</strong></div><div class="stat-card"><span class="stat-label">Games Logged</span><strong>${Math.round(totalGames)}</strong></div>`;

    const mostWins=[...rows].sort((a,b)=>b.w-a.w)[0], mostPF=[...rows].sort((a,b)=>b.pf-a.pf)[0], mostPA=[...rows].sort((a,b)=>b.pa-a.pa)[0];
    const eligible=rows.filter(x=>games(x)>=10); const bestPct=[...eligible].sort((a,b)=>pct(b)-pct(a))[0];
    const leaderItems=[
      ['Most Wins',mostWins,mostWins?.w],['Best Win %',bestPct,bestPct?`${(pct(bestPct)*100).toFixed(1)}%`:null],['Most Points For',mostPF,mostPF?fmt(mostPF.pf):null],['Most Points Against',mostPA,mostPA?fmt(mostPA.pa):null]
    ].filter(x=>x[1]);
    $('#alltime-leaders').innerHTML=leaderItems.map(([label,x,val])=>`<div class="alltime-leader-row"><div><strong>${esc(label)}</strong><span>${esc(x.name)}</span></div><strong>${esc(val)}</strong></div>`).join('');

    const champs=rows.filter(x=>x.titles).sort((a,b)=>b.titles-a.titles || b.w-a.w);
    $('#alltime-champs').innerHTML=champs.length?champs.map(x=>`<div class="alltime-leader-row"><div><strong>${esc(x.name)}</strong><span>${x.titles===1?'League champion':'Multiple-time league champion'}</span></div><strong class="title-count">${'🏆'.repeat(Math.min(x.titles,5))}${x.titles>5?` ×${x.titles}`:''}</strong></div>`).join(''):'<div class="loading">No completed championship bracket found in the linked Sleeper history.</div>';
  }catch(e){
    console.warn('All-time history unavailable',e);
    table.innerHTML='<div class="callout danger">Could not load the linked Sleeper league history.</div>';
  }
}

async function boot(){
  try{
    await loadLeague();
    renderRankings();
    const allTimePromise=loadAllTime();
    const scorePromise=loadWeeklyScore();
    await Promise.all([loadPlayers(),loadTransactions()]);
    const awardsPromise=loadWeeklyAwards();
    const suckBoardPromise=loadYouSuckLeaderboard();
    renderTrades(); renderWaivers(); renderHomeActivity(); renderFeaturedTrade();
    await Promise.allSettled([scorePromise,awardsPromise,suckBoardPromise,allTimePromise]);
  }catch(e){
    console.error(e);
    const msg=`<div class="callout danger">Couldn't reach Sleeper from this browser. Check your connection and reload. League ID: ${LEAGUE_ID}</div>`;
    $('#home-rankings').innerHTML=msg; $('#home-activity').innerHTML=msg; $('#rankings-table').innerHTML=msg; $('#trades-feed').innerHTML=msg; $('#waivers-feed').innerHTML=msg;
  }
}
// Theme toggle
(function initThemeToggle(){
  const root=document.documentElement;
  const btn=document.getElementById('theme-toggle');
  const meta=document.getElementById('theme-color-meta');
  if(!btn) return;

  function applyTheme(theme, persist=false){
    root.dataset.theme=theme;
    const isLight=theme==='light';
    btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    btn.setAttribute('title', isLight ? 'Dark mode' : 'Light mode');
    const icon=btn.querySelector('.theme-icon');
    if(icon) icon.textContent=isLight ? '☾' : '☀︎';
    if(meta) meta.setAttribute('content', isLight ? '#f5f7fa' : '#0b0f14');
    if(persist){
      try{ localStorage.setItem('lol-theme',theme); }catch(e){}
    }
  }

  applyTheme(root.dataset.theme || 'dark');
  btn.addEventListener('click',()=>{
    applyTheme(root.dataset.theme==='light' ? 'dark' : 'light', true);
  });
})();

boot();
