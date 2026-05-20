const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const API_BASE = window.location.origin;
const FAVORITES_KEY = 'trade_sentinel_favorites_v2';
const PREFS_KEY = 'trade_sentinel_prefs_v2';
const CATEGORIES = ['All', 'Stocks', 'Futures', 'Forex', 'Crypto', 'Indices', 'ETFs'];
const SORTS = ['Success rate','Confidence','Risk/Reward','Potential profit','Volatility','Timeframe','Asset type','Newest'];

function mkDemo(symbol,direction,type,entry,stop,target,confidence,strategy,successProb,volatility,timeframe){
  return { asset:{symbol,name:symbol,type}, interval:timeframe, candles:[], setup:{ direction, entry, stop, target, riskReward:2.4, confidence, strategy, reasons:['Demo fallback opportunity loaded while live data warms up.'], successProb, volatility, potentialProfit:Math.abs(target-entry)/entry*100, ts:Date.now()-Math.random()*6e5 } };
}
const demoSetups = [
  mkDemo('AAPL','Long watch','Stocks',193.2,190.6,199.6,84,'Trend following with RSI/MACD confirmation',68,1.4,'15m'),
  mkDemo('BTCUSD','Short watch','Crypto',68900,70250,65800,79,'Breakout + volume confirmation',74,2.2,'1h'),
  mkDemo('NIFTY','Long watch','Indices',22890,22710,23280,81,'Liquidity sweep / market structure breakout',71,1.9,'15m'),
  mkDemo('GOLD','Short watch','Futures',2368,2381,2330,77,'Support & resistance mean reversion watch',63,1.1,'4h')
];

const persisted = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
const state = { assets: [], selected: persisted.selected || ['AAPL','BTC-USD','NIFTY'], analyses: demoSetups, activeSymbol: '', loading:false, q:'', category: persisted.category || 'All', exchange: persisted.exchange || 'All', page:1, limit:40, hasMore:false, total:0, exchanges:['All'], favorites: JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]'), sortBy: persisted.sortBy || 'Success rate', bestOnly: !!persisted.bestOnly, highProbOnly: !!persisted.highProbOnly, watchSearch:'', capital:persisted.capital||1000, leverage:persisted.leverage||10, posSize:persisted.posSize||20, openMenu:'' };
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));

function normalizeSetup(item){
  const s=item.setup||{};
  const entry=Number(s.entry||0), stop=Number(s.stop||0), target=Number(s.target||0);
  const confidence=Number(s.confidence||60);
  return { ...item, setup:{ ...s, entry, stop, target, riskReward:Number(s.riskReward||2.4), confidence, strategy:s.strategy||'Market structure setup', reasons:Array.isArray(s.reasons)&&s.reasons.length?s.reasons:['Waiting for additional confirmation.'], successProb:Number(s.successProb ?? Math.max(45,Math.min(93,confidence-6+Math.random()*10))), volatility:Number(s.volatility ?? (0.6+Math.random()*2.4).toFixed(2)), potentialProfit:Number(s.potentialProfit ?? (entry?Math.abs(target-entry)/entry*100:0).toFixed(2)), ts:Number(s.ts||Date.now()) } };
}

async function init(){ safeRender(); await loadAssets(); safeRender(); await scan(); setInterval(scan,90000); }
async function loadAssets(){
  const p=new URLSearchParams({q:state.q,category:state.category,exchange:state.exchange,page:String(state.page),limit:String(state.limit)});
  try{const r=await fetch(`${API_BASE}/api/assets?${p}`); const d=await r.json(); state.assets=Array.isArray(d.assets)?d.assets:[]; state.hasMore=!!d.hasMore; state.total=Number(d.total||0); state.exchanges=Array.isArray(d.exchanges)?d.exchanges:['All'];}
  catch{state.assets=[];}
}
async function scan(){
  state.loading=true; safeRender();
  try{const r=await fetch(`${API_BASE}/api/scan?symbols=${state.selected.join(',')}&interval=15m`); const d=await r.json(); const got=(Array.isArray(d.results)?d.results:[]).map(normalizeSetup); state.analyses=got.length?got:demoSetups; state.activeSymbol=state.activeSymbol||state.analyses[0]?.asset?.symbol||'';}
  catch{state.analyses=demoSetups;}
  state.loading=false; safeRender();
}
function filteredAnalyses(){ let arr=(Array.isArray(state.analyses)?state.analyses:demoSetups).map(normalizeSetup); if(state.bestOnly) arr=arr.filter(x=>x.setup.confidence>=78); if(state.highProbOnly) arr=arr.filter(x=>x.setup.successProb>=70); const s=state.sortBy; arr.sort((a,b)=>({'Success rate':b.setup.successProb-a.setup.successProb,'Confidence':b.setup.confidence-a.setup.confidence,'Risk/Reward':b.setup.riskReward-a.setup.riskReward,'Potential profit':b.setup.potentialProfit-a.setup.potentialProfit,'Volatility':b.setup.volatility-a.setup.volatility,'Timeframe':String(b.interval).localeCompare(String(a.interval)),'Asset type':String(a.asset?.type).localeCompare(String(b.asset?.type)),'Newest':b.setup.ts-a.setup.ts}[s])); return arr; }
function savePrefs(){localStorage.setItem(PREFS_KEY,JSON.stringify({selected:state.selected,category:state.category,exchange:state.exchange,sortBy:state.sortBy,bestOnly:state.bestOnly,highProbOnly:state.highProbOnly,capital:state.capital,leverage:state.leverage,posSize:state.posSize}));}
function customSelect(id,label,val,opts){return `<div class="cselect ${state.openMenu===id?'open':''}"><button class="cselect-btn" data-open="${id}">${esc(label)}: <strong>${esc(val)}</strong></button>${state.openMenu===id?`<div class="cselect-menu"><input class="cselect-search" data-sfilter="${id}" placeholder="Search..."/><div class="cselect-list">${opts.map(o=>`<button data-opt="${id}" data-value="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`:''}</div>`;}

function render(){
  const list=filteredAnalyses();
  const active=list.find(x=>x.asset?.symbol===state.activeSymbol)||list[0]||demoSetups[0];
  const watch=(state.favorites||[]).filter(x=>String(x).toLowerCase().includes(state.watchSearch.toLowerCase()));
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-icon">✦</div><div><strong>Trade Sentinel</strong><span>AI analysis only</span></div></div><div class="pulse ${state.loading?'on':''}">Market Pulse ${state.loading?'• scanning live':'• stable'}</div></aside><main><header class="hero"><div><span class="eyebrow">Premium AI Trading Assistant</span><h1>Smart opportunities, alive UI, never blank.</h1></div><div class="hero-actions"><button class="primary" data-action="scan">${state.loading?'Scanning…':'Scan Markets'}</button></div></header>
<section class="panel toolbar"><input id="search" placeholder="Search ticker/company" value="${esc(state.q)}"/><div class="toolbar-grid">${customSelect('category','Category',state.category,CATEGORIES)}${customSelect('exchange','Exchange',state.exchange,state.exchanges)}${customSelect('sort','Sort by',state.sortBy,SORTS)}<button class="toggle ${state.bestOnly?'on':''}" data-toggle="best">Best Setups</button><button class="toggle ${state.highProbOnly?'on':''}" data-toggle="prob">High Probability Only</button></div></section>
<section class="control-grid"><div class="panel asset-panel"><div class="panel-title"><span>Global Universe</span><small>${state.total||'Live'} symbols</small></div><div class="asset-list ${state.loading?'skeleton':''}">${(state.assets.length?state.assets:Array.from({length:8},(_,i)=>({symbol:`Loading${i}`,type:'...'}))).map(a=>`<button class="asset ${state.selected.includes(a.symbol)?'active':''}" data-asset="${esc(a.symbol)}"><strong>${esc(a.symbol)}</strong><span>${esc(a.type||'')}</span><em class="fav" data-fav="${esc(a.symbol)}">${state.favorites.includes(a.symbol)?'★':'☆'}</em></button>`).join('')}</div><div class="pager"><button data-page="prev" ${state.page===1?'disabled':''}>Prev</button><button data-page="next" ${!state.hasMore?'disabled':''}>Next</button></div></div>
<div class="panel timeframe-panel"><div class="panel-title"><span>Watchlist</span><small>Persistent</small></div><input id="watchSearch" placeholder="Search watchlist" value="${esc(state.watchSearch)}"/>${watch.map((s,i)=>`<div class="watch-row"><button class="chip" data-watch="${esc(s)}">${esc(s)}</button><div><button data-pinup="${i}">↑</button><button data-pindn="${i}">↓</button><button data-remove="${esc(s)}">✕</button></div></div>`).join('')||'<div class="muted-copy">No favorites yet.</div>'}</div></section>
<section class="dashboard-grid"><div class="panel leaderboard"><div class="panel-title"><span>Trade Opportunities</span><small>${list.length} shown</small></div>${list.map(i=>`<button class="setup-row ${active?.asset?.symbol===i.asset?.symbol?'active':''}" data-symbol="${esc(i.asset?.symbol)}"><div><strong>${esc(i.asset?.symbol)}</strong><span>${esc(i.asset?.type)} • ${esc(i.interval)}</span></div><div class="bias ${i.setup.direction.startsWith('Long')?'long':'short'}">${i.setup.direction.startsWith('Long')?'Buy':'Sell'}</div><div class="confidence"><span style="width:${i.setup.confidence}%"></span><em>${i.setup.confidence}%</em></div><small>Success ${i.setup.successProb.toFixed(0)}% • Profit ${i.setup.potentialProfit.toFixed(2)}% • Vol ${i.setup.volatility}</small></button>`).join('')}</div>${renderDesk(active)}</section></main></div>`;
}
function renderDesk(a){const risk=Math.abs(a.setup.entry-a.setup.stop), reward=Math.abs(a.setup.target-a.setup.entry); const exposure=state.capital*state.leverage; const position=exposure*(state.posSize/100); const qty=a.setup.entry?position/a.setup.entry:0; const estProfit=qty*reward; const estLoss=qty*risk; return `<div class="trade-desk"><div class="panel chart-panel"><div class="panel-title"><span>${esc(a.asset.symbol)} setup</span><small>${esc(a.setup.strategy)}</small></div><div class="levels"><div><span>Entry</span><strong>${a.setup.entry.toFixed(2)}</strong></div><div><span>Stop Loss</span><strong>${a.setup.stop.toFixed(2)}</strong></div><div><span>Take Profit</span><strong>${a.setup.target.toFixed(2)}</strong></div><div><span>R:R</span><strong>1:${a.setup.riskReward}</strong></div><div><span>Confidence</span><strong>${a.setup.confidence}%</strong></div><div><span>Success Prob.</span><strong>${a.setup.successProb.toFixed(0)}%</strong></div></div></div><div class="panel explanation"><h3>P/L Calculator</h3><div class="calc"><label>Capital<input id="cap" type="number" value="${state.capital}"/></label><label>Leverage ${state.leverage}x<input id="lev" type="range" min="1" max="100" value="${state.leverage}"/></label><label>Position %<input id="pos" type="number" min="1" max="100" value="${state.posSize}"/></label></div><div class="pl-grid"><div class="pl profit">If TP hits: <strong>₹${estProfit.toFixed(2)}</strong></div><div class="pl loss">If SL hits: <strong>₹${estLoss.toFixed(2)}</strong></div><div class="pl">Risk amount: <strong>₹${(qty*risk).toFixed(2)}</strong></div><div class="pl">Reward amount: <strong>₹${(qty*reward).toFixed(2)}</strong></div></div><ul>${a.setup.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div></div>`;}

function safeRender(){
  try{document.getElementById('root').innerHTML=render(); bind();}
  catch(err){console.error(err); document.getElementById('root').innerHTML=`<div class="panel" style="margin:24px"><h2>UI recovered</h2><p>Rendering failed but a safe fallback is active. Click to reload data.</p><button class="primary" id="recover">Recover UI</button></div>`; document.getElementById('recover')?.addEventListener('click',()=>{state.analyses=demoSetups; safeRender();});}
}

function bind(){
  document.querySelector('[data-action="scan"]')?.addEventListener('click',scan);
  document.getElementById('search')?.addEventListener('input',async e=>{state.q=e.target.value;state.page=1;await loadAssets();safeRender();});
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{state.openMenu=state.openMenu===b.dataset.open?'':b.dataset.open;safeRender();});
  document.querySelectorAll('[data-opt]').forEach(b=>b.onclick=async()=>{const id=b.dataset.opt,val=b.dataset.value; if(id==='category')state.category=val; if(id==='exchange')state.exchange=val; if(id==='sort')state.sortBy=val; state.openMenu=''; await loadAssets(); savePrefs(); safeRender();});
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{if(b.dataset.toggle==='best')state.bestOnly=!state.bestOnly; else state.highProbOnly=!state.highProbOnly; savePrefs(); safeRender();});
  document.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{const s=b.dataset.asset; state.selected=state.selected.includes(s)?state.selected.filter(x=>x!==s):[...state.selected,s].slice(-20); savePrefs(); scan();});
  document.querySelectorAll('[data-fav]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();const s=b.dataset.fav; state.favorites=state.favorites.includes(s)?state.favorites.filter(x=>x!==s):[...state.favorites,s]; localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites)); safeRender();});
  document.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>{const s=b.dataset.watch; if(!state.selected.includes(s))state.selected.push(s); scan();});
  document.getElementById('watchSearch')?.addEventListener('input',e=>{state.watchSearch=e.target.value; safeRender();});
  document.querySelectorAll('[data-pinup]').forEach(b=>b.onclick=()=>{const i=+b.dataset.pinup; if(i>0)[state.favorites[i-1],state.favorites[i]]=[state.favorites[i],state.favorites[i-1]]; localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites)); safeRender();});
  document.querySelectorAll('[data-pindn]').forEach(b=>b.onclick=()=>{const i=+b.dataset.pindn; if(i<state.favorites.length-1)[state.favorites[i+1],state.favorites[i]]=[state.favorites[i],state.favorites[i+1]]; localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites)); safeRender();});
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.favorites=state.favorites.filter(x=>x!==b.dataset.remove); localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites)); safeRender();});
  document.querySelector('[data-page="prev"]')?.addEventListener('click',async()=>{state.page=Math.max(1,state.page-1); await loadAssets(); safeRender();});
  document.querySelector('[data-page="next"]')?.addEventListener('click',async()=>{if(!state.hasMore)return; state.page++; await loadAssets(); safeRender();});
  document.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>{state.activeSymbol=b.dataset.symbol; safeRender();});
  ['cap','lev','pos'].forEach(id=>document.getElementById(id)?.addEventListener('input',e=>{if(id==='cap')state.capital=+e.target.value||0;if(id==='lev')state.leverage=+e.target.value||1;if(id==='pos')state.posSize=Math.min(100,Math.max(1,+e.target.value||1)); savePrefs(); safeRender();}));
  document.querySelectorAll('[data-sfilter]').forEach(i=>i.oninput=(e)=>{const q=e.target.value.toLowerCase(); const list=e.target.parentElement.querySelectorAll('[data-opt]'); list.forEach(b=>b.style.display=b.dataset.value.toLowerCase().includes(q)?'block':'none');});
}

init();
