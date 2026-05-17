import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 4174;
const ROOT = process.cwd();

const ASSETS = [
  { symbol: 'NIFTY', yahoo: '^NSEI', name: 'NIFTY 50', type: 'Index', market: 'India' },
  { symbol: 'NASDAQ', yahoo: '^IXIC', name: 'NASDAQ Composite', type: 'Index', market: 'US' },
  { symbol: 'SPY', yahoo: 'SPY', name: 'S&P 500 ETF', type: 'ETF', market: 'US' },
  { symbol: 'QQQ', yahoo: 'QQQ', name: 'NASDAQ 100 ETF', type: 'ETF', market: 'US' },
  { symbol: 'GOLD', yahoo: 'GC=F', name: 'Gold Futures', type: 'Futures', market: 'COMEX' },
  { symbol: 'BTC', yahoo: 'BTC-USD', name: 'Bitcoin', type: 'Crypto', market: 'Crypto' },
  { symbol: 'ETH', yahoo: 'ETH-USD', name: 'Ethereum', type: 'Crypto', market: 'Crypto' },
  { symbol: 'EURUSD', yahoo: 'EURUSD=X', name: 'EUR/USD', type: 'Forex', market: 'FX' },
  { symbol: 'AAPL', yahoo: 'AAPL', name: 'Apple', type: 'Stock', market: 'US' },
  { symbol: 'MSFT', yahoo: 'MSFT', name: 'Microsoft', type: 'Stock', market: 'US' },
  { symbol: 'NVDA', yahoo: 'NVDA', name: 'NVIDIA', type: 'Stock', market: 'US' },
  { symbol: 'TSLA', yahoo: 'TSLA', name: 'Tesla', type: 'Stock', market: 'US' }
];

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];
const RANGE_BY_INTERVAL = { '1m': '1d', '5m': '5d', '15m': '5d', '1h': '1mo', '4h': '3mo', '1d': '1y' };


const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (url.pathname === '/api/assets') {
      return sendJson(res, { assets: ASSETS, intervals: INTERVALS });
    }

    if (url.pathname === '/api/scan') {
      const symbols = String(url.searchParams.get('symbols') || 'NIFTY,NASDAQ,GOLD,BTC,QQQ').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const intervalParam = url.searchParams.get('interval');
      const interval = INTERVALS.includes(intervalParam) ? intervalParam : '15m';
      const unique = [...new Set(symbols)].slice(0, 16);
      const results = await Promise.all(unique.map((symbol) => buildAnalysis(symbol, interval)));
      return sendJson(res, { generatedAt: new Date().toISOString(), interval, results: results.filter(Boolean).sort((a, b) => b.setup.confidence - a.setup.confidence) });
    }

    if (url.pathname.startsWith('/api/analyze/')) {
      const symbol = decodeURIComponent(url.pathname.replace('/api/analyze/', '')).toUpperCase();
      const intervalParam = url.searchParams.get('interval');
      const interval = INTERVALS.includes(intervalParam) ? intervalParam : '15m';
      const analysis = await buildAnalysis(symbol, interval);
      return analysis ? sendJson(res, analysis) : sendJson(res, { error: 'Unknown asset' }, 404);
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, { error: error.message || 'Server error' }, 500);
  }
});

function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function serveStatic(pathname, res) {
  const safePath = normalize(pathname).replace(/^\.\.(\/[\\])?/, '');
  const relative = safePath === '/' ? 'index.html' : safePath.slice(1);
  const filePath = join(ROOT, relative);
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    const content = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(content);
  }
}

async function buildAnalysis(symbol, interval) {
  const asset = ASSETS.find((item) => item.symbol === symbol) || ASSETS.find((item) => item.yahoo === symbol);
  if (!asset) return null;
  const candles = await loadCandles(asset, interval);
  const enriched = enrichCandles(candles);
  const setup = createTradeSetup(asset, enriched, interval);
  return { asset, interval, candles: enriched.slice(-180), setup, dataSource: candles.some((c) => c.synthetic) ? 'synthetic-fallback' : 'yahoo-chart-api' };
}

async function loadCandles(asset, interval) {
  const yahooInterval = interval === '4h' ? '1h' : interval;
  const range = RANGE_BY_INTERVAL[interval] || '5d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.yahoo)}?interval=${yahooInterval}&range=${range}&includePrePost=false`;
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Trade Sentinel AI' } });
    if (!response.ok) throw new Error(`Yahoo responded ${response.status}`);
    const json = await response.json();
    const result = json.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp || [];
    if (!quote || timestamps.length < 25) throw new Error('Insufficient chart data');
    let candles = timestamps.map((time, index) => ({
      time: time * 1000,
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index] || 0
    })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
    if (interval === '4h') candles = aggregateCandles(candles, 4);
    return candles.slice(-260);
  } catch (error) {
    return syntheticCandles(asset.symbol, interval);
  }
}

function aggregateCandles(candles, groupSize) {
  const grouped = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    if (group.length < groupSize) continue;
    grouped.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0)
    });
  }
  return grouped;
}

function syntheticCandles(symbol, interval) {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = symbol.includes('BTC') ? 65000 : symbol.includes('GOLD') ? 2350 : symbol.includes('NIFTY') ? 22500 : symbol.includes('EUR') ? 1.08 : 150 + (seed % 300);
  const stepMs = interval === '1d' ? 86400000 : interval === '1h' ? 3600000 : interval === '4h' ? 14400000 : Number.parseInt(interval) * 60000;
  let close = base;
  return Array.from({ length: 220 }, (_, i) => {
    const drift = Math.sin((i + seed) / 12) * base * 0.0015 + Math.cos((i + seed) / 31) * base * 0.001;
    const impulse = Math.sin((i + seed) / 5) * base * 0.0008;
    const open = close;
    close = Math.max(base * 0.2, open + drift + impulse);
    const spread = Math.abs(close - open) + base * (0.002 + ((seed + i) % 7) / 10000);
    return { time: Date.now() - (220 - i) * stepMs, open, high: Math.max(open, close) + spread / 2, low: Math.min(open, close) - spread / 2, close, volume: 500000 + ((seed * i) % 900000), synthetic: true };
  });
}

function enrichCandles(candles) {
  return candles.map((c, index) => {
    const closes = candles.slice(0, index + 1).map((x) => x.close);
    return {
      ...c,
      label: new Date(c.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      rsi14: rsi(closes, 14),
      macd: macd(closes),
      atr14: atr(candles.slice(0, index + 1), 14),
      volumeAvg20: sma(candles.slice(0, index + 1).map((x) => x.volume), 20)
    };
  });
}

const sma = (values, period) => values.length < period ? null : values.slice(-period).reduce((a, b) => a + b, 0) / period;
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  return values.slice(1).reduce((prev, value) => value * k + prev * (1 - k), values[0]);
}
function rsi(values, period) {
  if (values.length <= period) return null;
  const slice = values.slice(-period - 1);
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}
function macd(values) {
  const fast = ema(values, 12), slow = ema(values, 26), signal = ema(values.slice(-18).map((_, i) => (ema(values.slice(0, values.length - 17 + i), 12) || 0) - (ema(values.slice(0, values.length - 17 + i), 26) || 0)), 9);
  return fast && slow ? { line: fast - slow, signal: signal || 0, histogram: fast - slow - (signal || 0) } : null;
}
function atr(candles, period) {
  if (candles.length <= period) return null;
  const trs = candles.slice(-period).map((c, i, arr) => {
    const prev = i === 0 ? candles[candles.length - period - 1] : arr[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return trs.reduce((a, b) => a + b, 0) / period;
}

function createTradeSetup(asset, candles, interval) {
  const latest = candles.at(-1);
  const recent = candles.slice(-60);
  const swingHigh = Math.max(...recent.slice(0, -1).map((c) => c.high));
  const swingLow = Math.min(...recent.slice(0, -1).map((c) => c.low));
  const trendUp = latest.sma20 && latest.sma50 && latest.sma20 > latest.sma50 && latest.close > latest.sma20;
  const trendDown = latest.sma20 && latest.sma50 && latest.sma20 < latest.sma50 && latest.close < latest.sma20;
  const breakoutUp = latest.close > swingHigh * 0.998;
  const breakoutDown = latest.close < swingLow * 1.002;
  const volumeExpansion = latest.volumeAvg20 ? latest.volume > latest.volumeAvg20 * 1.12 : false;
  const bullishMomentum = latest.rsi14 > 52 && latest.rsi14 < 72 && latest.macd?.histogram > 0;
  const bearishMomentum = latest.rsi14 < 48 && latest.rsi14 > 28 && latest.macd?.histogram < 0;
  const longScore = score([trendUp, breakoutUp, volumeExpansion, bullishMomentum, latest.close > swingLow * 1.02]);
  const shortScore = score([trendDown, breakoutDown, volumeExpansion, bearishMomentum, latest.close < swingHigh * 0.98]);
  const direction = longScore >= shortScore ? 'Long watch' : 'Short watch';
  const atrValue = latest.atr14 || (latest.high - latest.low);
  const entry = latest.close;
  const stop = direction === 'Long watch' ? Math.min(swingLow, entry - 1.25 * atrValue) : Math.max(swingHigh, entry + 1.25 * atrValue);
  const risk = Math.abs(entry - stop) || atrValue;
  const target = direction === 'Long watch' ? entry + risk * 2.4 : entry - risk * 2.4;
  const confidence = Math.min(94, Math.max(45, 48 + (direction === 'Long watch' ? longScore : shortScore) * 8 + (volumeExpansion ? 6 : 0) + (Math.abs(latest.macd?.histogram || 0) > atrValue * 0.01 ? 4 : 0)));
  const strategy = chooseStrategy({ trendUp, trendDown, breakoutUp, breakoutDown, volumeExpansion, bullishMomentum, bearishMomentum });
  return {
    direction,
    strategy,
    entry, stop, target,
    riskReward: 2.4,
    confidence,
    quality: confidence >= 78 ? 'Strong setup' : confidence >= 65 ? 'Developing setup' : 'Watchlist only',
    levels: { swingHigh, swingLow, support: swingLow, resistance: swingHigh },
    reasons: buildReasons({ asset, interval, direction, strategy, latest, trendUp, trendDown, breakoutUp, breakoutDown, volumeExpansion, bullishMomentum, bearishMomentum, swingHigh, swingLow })
  };
}
function score(items) { return items.filter(Boolean).length; }
function chooseStrategy(ctx) {
  if ((ctx.breakoutUp || ctx.breakoutDown) && ctx.volumeExpansion) return 'Breakout + volume confirmation';
  if ((ctx.trendUp && ctx.bullishMomentum) || (ctx.trendDown && ctx.bearishMomentum)) return 'Trend following with RSI/MACD confirmation';
  if (ctx.breakoutUp || ctx.breakoutDown) return 'Liquidity sweep / market structure breakout';
  return 'Support & resistance mean reversion watch';
}
function buildReasons(ctx) {
  const side = ctx.direction.startsWith('Long') ? 'bullish' : 'bearish';
  return [
    `${ctx.asset.name} is being evaluated on the ${ctx.interval} chart with a ${side} bias.`,
    ctx.trendUp || ctx.trendDown ? 'The 20-period average is aligned with the 50-period average, which supports trend-following conditions.' : 'Moving averages are mixed, so position sizing and confirmation matter more.',
    ctx.breakoutUp || ctx.breakoutDown ? 'Price is pressing through a recent swing level, suggesting liquidity is being taken near an important zone.' : 'Price remains inside the recent range, so this is more of a watchlist setup than an immediate momentum signal.',
    ctx.volumeExpansion ? 'Volume is above its 20-period average, adding participation confirmation.' : 'Volume confirmation is not yet strong; wait for participation before acting.',
    ctx.bullishMomentum || ctx.bearishMomentum ? 'RSI and MACD agree with the setup direction without being extremely overextended.' : 'Momentum confirmation is incomplete, which lowers confidence.',
    `Stop placement is beyond the invalidation zone near ${formatPrice(ctx.direction.startsWith('Long') ? ctx.swingLow : ctx.swingHigh)}; target uses a planned 2.4R reward profile.`
  ];
}
function formatPrice(value) { return Number(value).toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 5 : 2 }); }

server.listen(PORT, () => console.log(`Trade Sentinel AI running at http://localhost:${PORT}`));
