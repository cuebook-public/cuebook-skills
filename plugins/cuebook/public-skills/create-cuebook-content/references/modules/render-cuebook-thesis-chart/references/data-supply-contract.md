# Cuebook Chart Data Supply

A Skill is an instruction, validation, calculation, and rendering layer. It is never the origin of a live market fact. Every chart input belongs to one of the following layers.

## 1. Cuebook Native Observations

Preferred for publication and settlement:

- instrument master: canonical instrument, ticker, venue, currency, timezone, calendar;
- `market.latest`: latest quote plus market state and observation basis;
- `market.candles`: OHLCV, requested and served interval, sealed/forming state;
- corporate actions and adjustment basis;
- Cuebook news, event, and calendar records with durable source refs.

Export a bounded `MarketSeriesBatchV1`. The renderer never receives database credentials or table-specific SQL.

## 2. Deterministic Derived Data

Compute from one frozen native snapshot:

- returns and synchronized relative performance;
- volatility, drawdown, ATR, moving averages, breakout distance, volume ratio;
- holdings aggregation or exposure formulas when all constituents and weights are sourced.

Store formula, parameters, input refs, output unit, and `as_of`. Derived data may explain evidence; it cannot silently become a creator opinion.

## 3. External Enrichment

Use `references/modules/build-market-research-pack.md` when the thesis needs evidence Cuebook does not yet own:

- analyst estimate levels and revision history;
- company fundamentals and guidance history;
- ETF holdings, leverage/reset policy, fees, liquidity, and benchmark methodology;
- valuation comparables, positioning, flows, options, or macro series;
- official product announcements and other primary-source events.

In production, ingest these through a registered provider connector. Preserve provider ID, source URL/ref, source timestamp, fetch timestamp, basis, license scope, and freshness state. Manual browsing is an experimental fallback and keeps the artifact `conditional` until the data is ingested or frozen.

## 4. Creator-Owned Inputs

Direction, interpretation, trigger choice, target, invalidation, benchmark, and horizon may come from the creator. Label them `explicit`. They are not market facts and must not be presented as provider-sourced values.

## Minimum OHLCV Envelope

Each series should provide:

- canonical instrument and venue;
- ticker, currency, timezone, and market calendar;
- interval, session, quote basis, and adjustment basis;
- complete OHLC values and optional volume/VWAP;
- sealed/forming state and forming `last_event_time`;
- coverage status, source-as-of, fetch time, quality flags, and license scope.

## Release State

- `ready`: required observations are native or frozen, licensed, fresh, and fully sourced.
- `conditional`: an allowed external fallback, partial coverage, forming dependency, or stale enrichment remains.
- `blocked`: asset mapping, source identity, baseline, benchmark synchronization, or required settlement observation is missing.
