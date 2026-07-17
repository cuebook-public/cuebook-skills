# Cuebook OHLCV Adapter

The product backend owns database access. The chart skill receives a bounded `MarketSeriesBatchV1` export and never receives credentials, SQL, or internal table names.

## Request Boundary

The upstream chart job supplies:

- canonical `instrument_id` and ticker;
- exact UTC context start and horizon end;
- preferred interval and maximum bars;
- market session and quote basis;
- required primary and benchmark legs.

The adapter queries the OHLCV store, applies the venue calendar, and returns the interval it actually served. It must not label daily bars as intraday bars or forward-fill missing bars into fake observations.

## Required Mapping

| Database concept | Contract field |
| --- | --- |
| canonical instrument key | `instrument_id` |
| chart leg | `series_ref` |
| served bar size | `interval` |
| venue/session rule | `session` |
| trade, midpoint, NAV, or settlement basis | `quote_basis` |
| bar open timestamp | `bars[].open_time` |
| value observation timestamp | `bars[].observed_at` |
| immutable completed bar | `bars[].state: sealed` |
| current updating bar | `bars[].state: forming` |
| last update in a forming bar | `bars[].last_event_time` |
| query coverage result | `coverage_status` |
| durable data lineage | `source_ref` |
| registered data provider | `provider_id` |
| listing venue and quote currency | `venue`, `currency` |
| venue timezone and calendar | `timezone`, `calendar_ref` |
| raw or adjusted price policy | `adjustment_basis` |
| provider snapshot time | `source_as_of` |
| permitted product use | `license_scope` |
| gaps, staleness, or repair flags | `quality_flags[]` |

For exchange-traded daily bars, `observed_at` should represent the official session observation used by the thesis, not midnight merely because storage partitions use a date key.

## Integrity Rules

- Return one row per requested `series_ref` and reject ticker or instrument mismatches.
- Keep primary and benchmark intervals and baseline semantics synchronized for relative charts.
- Mark a bar forming until the venue-specific seal process completes.
- Apply corporate-action adjustments consistently with the thesis and settlement contract; expose the basis in `source_ref` metadata or the provider registry.
- Prefer explicit `adjustment_basis`, `source_as_of`, and `license_scope` fields. Missing optional lineage keeps an experimental chart usable but prevents a publication-ready state.
- Report `partial` when the requested range, baseline, or current interval is incomplete.
- Exclude observations after the requested horizon and never synthesize future values.

## Invocation

```bash
node scripts/render_thesis_chart.mjs thesis-chart-v1.json \
  --market-data market-series-batch-v1.json \
  --output-dir chart-output
```

The same export can feed `$compute-cuebook-market-indicators` after chart normalization, keeping visual and numeric evidence on one data snapshot.
