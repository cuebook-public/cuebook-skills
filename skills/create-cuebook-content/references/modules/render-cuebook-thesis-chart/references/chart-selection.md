# Chart Selection

## Horizon To Interval

Use the exact contract window. `Context` is history shown before declaration or baseline; it is not part of settlement.

| Claim horizon | Preferred interval | Useful context | Feed bar target |
| --- | --- | --- | --- |
| up to 2 hours | 1m, fallback 5m | 1 session or 12 hours | 60-120 |
| 2-24 hours | 5m or 15m | 3 sessions or 3 days | 60-120 |
| 1-3 days | 15m or 1h | 10 sessions or 14 days | 50-120 |
| 3-14 days | 1h or 4h | 30 sessions or 60 days | 50-120 |
| 14-90 days | 1d | 6-12 months | 60-180 |
| over 90 days | 1d or 1w | 1-3 years | 60-180 |

Use exchange sessions for equities and futures. Use elapsed clock time for 24/7 crypto. If the provider returns a different interval, store it as `observed_interval`; do not resample sparse data into fake granularity.

## Mode Routing

| Upstream evaluation | Chart mode | Axis | Required marks |
| --- | --- | --- | --- |
| price target or directional return | `single_price` | price | baseline, expiry, explicit target/invalidation |
| relative performance | `relative_performance` | return % | both baselines, both legs, expiry, success rule |
| range | `range_band` | price | lower/upper band, expiry |
| dated market event | `event_reaction` | price or return % | event, baseline, observed reaction window |
| event with no market-price claim | no price chart | event timeline | event definition and source |

## Rendering Semantics

- Solid line: sealed observations.
- Dashed continuation and hollow marker: forming observation.
- Neutral shaded area after the latest observed timestamp: unresolved time, not a prediction.
- Vertical line: declaration, event, or expiry.
- Horizontal line or band: an explicit target, trigger, invalidation, or range.
- Relative charts start both legs from their own synchronized baseline and express subsequent change in percent.
- At small Feed size, show at most two price series, three horizontal levels, and three dated markers.
- A Cuebook settleable chart uses a stable decision split, normally 60-72% history and 28-40% settlement time. The publication cutoff sits on the split and expiry sits at the right edge.
- The post-publication side may display observed candles or points during tracking. Empty space after the latest observation remains the unresolved settlement interval.
- Single-instrument target, trigger, or range claims default to raw-price candles and an auto-fitted visible scale. Relative claims default to normalized lines.
- The Cuebook watermark sits inside the lower-left plot area and must stay subordinate to market data.

## Provider Checks

For every fetched series record:

- canonical ticker and instrument mapping;
- requested and observed interval;
- first and last observation;
- latest sealed bar;
- forming bar and `lastEventTime`, when present;
- coverage status;
- source URL and fetch time;
- quote/session basis and corporate-action policy.

Cuebook's database adapter should export these fields as `MarketSeriesBatchV1`. The chart skill consumes the export and never needs database credentials or table-specific SQL.

`partial` coverage is usable only when the missing region does not contain the baseline or required settlement observation. Otherwise block.
