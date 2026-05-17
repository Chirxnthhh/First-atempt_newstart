const DEFAULT_ASSETS = ['NIFTY', 'NASDAQ', 'GOLD', 'BTC', 'QQQ'];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const API_BASE = window.location.origin;

const state = {
  assets: [],
  selected: [...DEFAULT_ASSETS],
  timeframe: '15m',
  analyses: [],
  activeSymbol: '',
  loading: false,
  alertsEnabled: false,
  lastScan: ''
};

const icons = {
  radar: '◈', brain: '✦', chart: '▧', shield: '⬟', bell: '🔔', zap: '⚡', target: '◎', gauge: '◒', lock: '🔒'
};

const formatPrice = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 5 : 2 });
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

async function init() {
  render();
  try {
    const response = await fetch(`${API_BASE}/api/assets`);
    const data = await response.json();
    state.assets = data.assets || [];
  } catch {
    state.assets = [];
  }
  await scan();
  setInterval(scan, 90000);
}

async function scan() {
  if (!state.selected.length) return;
  state.loading = true;
  render();
  try {
    const response = await fetch(`${API_BASE}/api/scan?symbols=${state.selected.join(',')}&interval=${state.timeframe}`);
    const data = await response.json();
    state.analyses = data.results || [];
    state.activeSymbol = state.activeSymbol && state.analyses.some((item) => item.asset.symbol === state.activeSymbol)
      ? state.activeSymbol
      : state.analyses[0]?.asset.symbol || '';
    state.lastScan = new Date(data.generatedAt || Date.now()).toLocaleTimeString();
    const best = state.analyses[0];
    if (state.alertsEnabled && best?.setup.confidence >= 78) notify(best);
  } finally {
    state.loading = false;
    render();
  }
}

async function enableAlerts() {
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  state.alertsEnabled = permission === 'granted';
  render();
}

function notify(item) {
  if (document.visibilityState === 'visible') return;
  new Notification(`Strong ${item.setup.direction}: ${item.asset.symbol}`, {
    body: `${item.setup.strategy} • ${item.setup.confidence}% confidence • Manual execution only`
  });
}

function render() {
  const active = state.analyses.find((item) => item.asset.symbol === state.activeSymbol) || state.analyses[0];
  const strongCount = state.analyses.filter((item) => item.setup.confidence >= 78).length;
  document.getElementById('root').innerHTML = `
    <div class="app-shell">
      <div class="orb orb-one"></div><div class="orb orb-two"></div>
      <aside class="sidebar">
        <div class="brand"><div class="brand-icon">✦</div><div><strong>Trade Sentinel</strong><span>AI analysis only</span></div></div>
        <nav>
          <a class="active">${icons.radar} Market Radar</a>
          <a>${icons.brain} Strategy Engine</a>
          <a>${icons.chart} Visual Setups</a>
          <a>${icons.shield} Risk Guardrails</a>
        </nav>
        <div class="no-trade-card"><span>${icons.lock}</span><strong>No auto-trading</strong><p>This app never places orders or connects to brokers. You stay in control and trade manually.</p></div>
      </aside>
      <main>
        <header class="hero fade-in">
          <div>
            <span class="eyebrow">● Live market intelligence</span>
            <h1>Premium AI trade analysis for disciplined manual traders.</h1>
            <p>Scan stocks, indices, futures, forex, and crypto across multiple timeframes. Get explained setups with entries, stops, targets, risk-to-reward, confidence, and visual zones.</p>
          </div>
          <div class="hero-actions">
            <button class="primary" data-action="scan">${icons.zap} ${state.loading ? 'Scanning...' : 'Scan markets'}</button>
            <button class="secondary" data-action="alerts">${icons.bell} ${state.alertsEnabled ? 'Alerts enabled' : 'Enable alerts'}</button>
          </div>
        </header>
        <section class="control-grid">
          <div class="panel asset-panel"><div class="panel-title"><span>Universe</span><small>${state.selected.length} selected</small></div><div class="asset-list">${renderAssets()}</div></div>
          <div class="panel timeframe-panel"><div class="panel-title"><span>Timeframe</span><small>multi-timeframe ready</small></div><div class="timeframes">${TIMEFRAMES.map((tf) => `<button data-timeframe="${tf}" class="${state.timeframe === tf ? 'active' : ''}">${tf}</button>`).join('')}</div></div>
          ${metricCard(icons.target, 'Strong setups', strongCount, 'Confidence ≥ 78%')}
          ${metricCard(icons.gauge, 'Best confidence', state.analyses[0] ? `${state.analyses[0].setup.confidence}%` : '—', state.analyses[0]?.asset.symbol || 'Awaiting scan')}
        </section>
        <section class="dashboard-grid">
          <div class="panel leaderboard"><div class="panel-title"><span>Opportunity Scanner</span><small>Last scan ${state.lastScan || '—'}</small></div>${renderRows()}</div>
          ${active ? renderTradeDesk(active) : '<div class="panel empty">Select assets and scan to generate trade ideas.</div>'}
        </section>
        <section class="panel disclaimer"><span>${icons.shield}</span><p><strong>Risk disclaimer:</strong> Trading involves substantial risk. These are educational analytics and probabilistic suggestions, not financial advice or guaranteed outcomes. Confirm every setup independently, use position sizing, and never risk money you cannot afford to lose.</p></section>
      </main>
    </div>`;
  bindEvents();
}

function renderAssets() {
  return state.assets.map((asset) => `<button class="asset ${state.selected.includes(asset.symbol) ? 'active' : ''}" data-asset="${asset.symbol}"><strong>${asset.symbol}</strong><span>${asset.type}</span></button>`).join('');
}

function metricCard(icon, label, value, detail) {
  return `<div class="panel metric"><div class="metric-icon">${icon}</div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function renderRows() {
  if (!state.analyses.length) return '<div class="muted-copy">No setups yet. Start a scan to analyze the selected markets.</div>';
  return state.analyses.map((item) => {
    const bullish = item.setup.direction.startsWith('Long');
    return `<button class="setup-row ${state.activeSymbol === item.asset.symbol ? 'active' : ''}" data-symbol="${item.asset.symbol}">
      <div><strong>${item.asset.symbol}</strong><span>${escapeHtml(item.asset.name)}</span></div>
      <div class="bias ${bullish ? 'long' : 'short'}">${item.setup.direction}</div>
      <div class="confidence"><span style="width:${item.setup.confidence}%"></span><em>${item.setup.confidence}%</em></div>
    </button>`;
  }).join('');
}

function renderTradeDesk(analysis) {
  const { asset, candles, setup, dataSource } = analysis;
  const bullish = setup.direction.startsWith('Long');
  return `<div class="trade-desk">
    <div class="panel chart-panel">
      <div class="panel-title"><span>${asset.symbol} visual trade chart</span><small>${asset.type} • ${dataSource.replaceAll('-', ' ')}</small></div>
      <div class="chart-wrap">${renderChart(candles, setup)}</div>
      <div class="legend"><span class="entry">Entry</span><span class="stop">Stop loss</span><span class="target">Take profit</span><span class="zone">Supply / demand zones</span></div>
    </div>
    <div class="setup-details">
      <div class="panel ticket">
        <div class="ticket-head"><div><span class="eyebrow small">Trade idea</span><h2 class="${bullish ? 'long-text' : 'short-text'}">${setup.direction}</h2></div><div class="score-ring">${setup.confidence}%<small>confidence</small></div></div>
        <div class="levels">
          ${level('Entry', formatPrice(setup.entry))}${level('Stop loss', formatPrice(setup.stop))}${level('Take profit', formatPrice(setup.target))}${level('Risk : Reward', `1 : ${setup.riskReward}`)}
        </div>
        <div class="quality">✓ ${setup.quality}</div>
      </div>
      <div class="panel explanation">
        <div class="panel-title"><span>Strategy explanation</span><small>${escapeHtml(setup.strategy)}</small></div>
        <ul>${setup.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
        <div class="beginner-box"><span>🔊</span><p><strong>Beginner translation:</strong> The assistant is looking for alignment between trend, important price levels, momentum, and volume. If any condition fails before entry, skip the trade instead of forcing it.</p></div>
      </div>
    </div>
  </div>`;
}

function level(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function renderChart(candles, setup) {
  const width = 920;
  const height = 420;
  const pad = { top: 22, right: 96, bottom: 34, left: 28 };
  const values = candles.flatMap((c) => [c.close, c.sma20, c.sma50]).filter(Number.isFinite).concat([setup.entry, setup.stop, setup.target, setup.levels.support, setup.levels.resistance]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => pad.left + (index / Math.max(1, candles.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => height - pad.bottom - ((value - min) / span) * (height - pad.top - pad.bottom);
  const path = (key) => candles.map((c, i) => Number.isFinite(c[key]) ? `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(c[key]).toFixed(1)}` : '').join(' ');
  const area = `${path('close')} L${x(candles.length - 1)},${height - pad.bottom} L${pad.left},${height - pad.bottom} Z`;
  const line = (value, klass, label) => `<line class="${klass}" x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-label ${klass}" x="${width - pad.right + 8}" y="${y(value) + 4}">${label} ${formatPrice(value)}</text>`;
  const zoneTop = y(setup.levels.resistance);
  const zoneBottom = y(setup.levels.support);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Annotated trade chart">
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#48e4b7" stop-opacity=".34"/><stop offset="100%" stop-color="#48e4b7" stop-opacity="0"/></linearGradient></defs>
    ${Array.from({ length: 6 }, (_, i) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + i * 68}" y2="${pad.top + i * 68}"/>`).join('')}
    <rect class="res-zone" x="${pad.left}" y="${Math.max(0, zoneTop - 10)}" width="${width - pad.left - pad.right}" height="20"/><text class="zone-label" x="${pad.left + 12}" y="${Math.max(18, zoneTop - 14)}">Resistance / supply</text>
    <rect class="sup-zone" x="${pad.left}" y="${zoneBottom - 10}" width="${width - pad.left - pad.right}" height="20"/><text class="zone-label" x="${pad.left + 12}" y="${zoneBottom + 28}">Support / demand</text>
    <path class="area" d="${area}"/><path class="price-line" d="${path('close')}"/><path class="sma20" d="${path('sma20')}"/><path class="sma50" d="${path('sma50')}"/>
    ${line(setup.entry, 'entry-line', 'ENTRY')}${line(setup.stop, 'stop-line', 'STOP')}${line(setup.target, 'target-line', 'TARGET')}
  </svg>`;
}

function bindEvents() {
  document.querySelector('[data-action="scan"]')?.addEventListener('click', scan);
  document.querySelector('[data-action="alerts"]')?.addEventListener('click', enableAlerts);
  document.querySelectorAll('[data-asset]').forEach((button) => button.addEventListener('click', () => {
    const symbol = button.dataset.asset;
    state.selected = state.selected.includes(symbol) ? state.selected.filter((item) => item !== symbol) : [...state.selected, symbol];
    scan();
  }));
  document.querySelectorAll('[data-timeframe]').forEach((button) => button.addEventListener('click', () => {
    state.timeframe = button.dataset.timeframe;
    scan();
  }));
  document.querySelectorAll('[data-symbol]').forEach((button) => button.addEventListener('click', () => {
    state.activeSymbol = button.dataset.symbol;
    render();
  }));
}

init();
