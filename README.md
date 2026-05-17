# Trade Sentinel AI

A premium, dark themed AI-powered trading assistant for market analysis, trade setup suggestions, visual chart explanations, and manual-only alerts.

## Important safety rule

Trade Sentinel AI **does not execute trades**, **does not place orders**, and **does not connect to brokerage accounts**. It analyzes market data and presents educational trade ideas so a human can decide whether to place trades manually.

## Features

- Near real-time market data via a local Node API using Yahoo Finance chart data with deterministic synthetic fallback data for offline development.
- Multi-asset scanner for indices, futures, ETFs, stocks, forex, and crypto symbols.
- Timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, and `1d`.
- Strategy engine covering trend following, support/resistance, breakouts, supply/demand, moving averages, RSI/MACD, volume confirmation, and smart-money-inspired liquidity/market-structure checks.
- Trade setup cards with suggested entry, stop loss, take profit, risk-to-reward, confidence, quality, and detailed reasoning.
- Visual chart with entry, stop, target, support/demand, and resistance/supply annotations.
- Browser notification alerts for high-confidence setups.
- Prominent risk disclaimer and manual-execution guardrails.

## Getting started

```bash
npm run dev
```

The app and API are served together at http://localhost:4174. No brokerage credentials or package installation are required for the default local demo.

## Production build

```bash
npm run build
```

## Disclaimer

Trading involves substantial risk. The output of this app is educational market analysis, not financial advice and not a guarantee of future results.
