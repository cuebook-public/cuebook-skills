---
name: render-cuebook-thesis-chart
description: Render a Cuebook PostV1, CreatorViewIntentV1, TradingThesisV1, SettlementClaimV1, ResearchPackV1, or explicit creator view into a sourced ThesisChartV1 plus a Cuebook-branded Feed chart. Use for adaptive price candles, sealed-versus-forming bars, aligned volume confirmation, open-ended price triggers, publication cutoffs, viewpoint-to-settlement timelines, targets, invalidations, event reactions, range bands, or normalized relative-performance comparisons. Do not use for unsupported technical levels, fabricated future paths, deep TradingView replay, order execution, or decorative charts detached from a thesis.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+ with Playwright plus a local Chromium/Chrome executable for capture, render, and audit scripts. Local filesystem only; no network access at render time.
---

# Render Cuebook Thesis Chart

Turn the creator's actual claim into one chart job. The claim chooses the comparison, levels, clock, and annotations; available market data chooses the achievable resolution.

## Workflow

1. Validate the upstream `PostV1`, `CreatorViewIntentV1`, `TradingThesisV1`, or `SettlementClaimV1`. Extract the creator-owned description and preserve its exact subject, benchmark, baseline quote semantics, publication cutoff, action state, horizon, success condition, and invalidation. A post without a thesis or settlement contract must supply the same fields explicitly and remain conditional.
2. Select one chart role: `evidence`, `thesis`, or `settlement`. A compact Feed card gets one primary visual job.
3. Select the semantic mode before fetching data:
   - `relative_performance`: normalize primary and benchmark to their synchronized baselines and show return percentages.
   - `single_price`: show the primary instrument with only explicit baseline, target, trigger, and invalidation levels.
   - `range_band`: show explicit lower and upper bounds.
   - `event_reaction`: mark the event and show the observed reaction window.
   - Price-and-volume confirmation: use one raw-price series, adaptive candles, the explicit price trigger, and `show_volume: true`. Render the volume bars against the prior sealed-bar average; do not replace the volume pane with a verbal badge.
4. Make a one-line chart design read, then select `cuebook_feed_v1` or `cuebook_detail_v1` with `references/chart-design-system.md`. Keep brand, shape, color, and density locks stable across every candlestick chart. The claim changes the visual grammar; it does not create a new aesthetic each time.
5. Resolve horizon, preferred interval, context window, and maximum bar count with `references/chart-selection.md`. Use exact contract timestamps before prose such as "one week." When the creator gives a trigger but no deadline, set `horizon_status: unspecified`, keep `horizon_end` and `horizon_seconds` null, use a continuous observed timeline, and render an evidence/thesis chart without an expiry or future region. Do not promote it to `settlement` until a deadline exists.
6. Resolve the data layer with `references/data-supply-contract.md`. For Cuebook, call `market.candles`; for Cuebook's own OHLCV database, export `MarketSeriesBatchV1` and pass it with `--market-data`. Use `$build-market-research-pack` for estimate revisions, fundamentals, holdings, events, valuation, or other non-OHLC evidence. Record the returned interval, session, quote basis, adjustment basis, sealed/forming state, source time, license scope, and coverage. Never assume a requested interval was honored.
7. Build and validate `ThesisChartV1`. A degraded interval or partial coverage remains `conditional`; an unmapped asset, missing benchmark, unsynchronized relative baseline, or missing source blocks the chart.
8. Render with `scripts/render_thesis_chart.mjs`. The output contains observed data only. Shade the unresolved future window and draw the expiry marker; never draw a predicted price path. A Frame fast preview uses the exact 2488 x 1056 publication canvas; standalone Feed inspection may use the smaller profile dimensions.
9. Run `scripts/audit_chart_svg.mjs` and inspect the raster at final size. Public Feed charts must not expose draft state, internal workflow narration, source legends, or settlement prose. Repair every failed check before release.
10. Register the chart as a generated `media_asset` and bind it to fact IDs when `$render-cuebook-market-media` packages the final content.

## Cuebook Native Grammar

- Put a low-contrast Cuebook watermark inside the lower-left plot area.
- Use `cuebook_light` or `cuebook_dark`; keep brand yellow for publication, target, and settlement marks.
- Use `cuebook_feed_v1` for scrolling surfaces and `cuebook_detail_v1` for research/detail surfaces. Feed is the default whenever a settlement panel is not explicitly requested.
- For a single-instrument price claim, default to adaptive raw-price candles. Include visible highs and lows when fitting the y-axis; never force a zero baseline.
- For a relative claim, use synchronized normalized-return lines. Candles cannot share one price axis with an unrelated benchmark.
- For settleable content, default to `timeline_layout: decision_split`. Allocate a stable portion of the chart to history and the rest to the live viewpoint-to-expiry interval, even when the historical context is much longer.
- Draw the publication cutoff as the boundary. Post-publication observations may enter the settlement region as they arrive; the remaining region stays blank and shaded.
- Put numeric target, range, trigger, or invalidation levels on the matching axis and expiry on the time axis. Keep the prose success rule in `ThesisChartV1` and the Feed card. Set `show_settlement_panel: false` for Feed; enable it only for an explicitly requested detail infographic.
- Use the content-derived title and a compact creator/Cuebook description in the subtitle. Keep full prose outside the plot.
- Keep internal artifact state, interval diagnostics, data lineage, and rendering instructions in JSON metadata. They may appear in a detail inspector, not in the Feed image.

## Source Routing

- Prefer Cuebook `market.latest` and `market.candles` for product Feed assets and deterministic settlement views.
- Use TradingView chart skills for interactive creator analysis, multi-interval technical review, and replay. Do not treat a TradingView screenshot workflow as a Feed data backend or redistribute data outside its permitted use.
- A fallback provider may repair coverage only when ticker, venue, quote basis, corporate-action policy, and session semantics remain explicit.

## Viewpoint Adaptation

- News or event thesis: event marker, pre-event context, publication baseline, and reaction window.
- Technical thesis: candles when available, explicit trigger and invalidation, and a horizon-matched interval.
- Fundamental thesis: longer context window and dated catalysts; omit intraday noise unless the claim is short-horizon.
- Relative thesis: normalized returns for both legs. Never overlay two raw prices on one axis.
- Conditional thesis: show the trigger as a level or event. Do not paint the directional state as active before the trigger.
- Open-ended trigger thesis: show observed context, the explicit trigger, and any sourced confirmation pane. Omit expiry, unresolved-future shading, and settlement language until the creator supplies a horizon.
- Price-and-volume thesis: keep price and volume as two aligned panes. The default Cuebook meaning of an unqualified “放量” is `sealed_bar_volume / mean(previous 20 sealed bars) >= 1.0`; set `volume_average_window` or a stronger explicit ratio when the creator supplies one. Forming-bar volume is context only.
- Settlement view: emphasize the exact observation basis, numeric threshold when chartable, and expiry. Use forming data for context only, never as an official close; keep composite settlement prose outside the plot.

## Hard Gates

- Do not invent support, resistance, targets, invalidations, event times, baselines, or benchmarks for visual completeness.
- Do not draw a future squiggle, projected candle, or implied path as observed data.
- Relative performance requires a named benchmark and synchronized baseline timestamps and quote bases.
- A line built from `forming` bars must look different from sealed history and disclose its as-of time.
- If the provider returns a coarser interval than requested, preserve the returned interval and downgrade the artifact.
- If a short horizon has only daily data, the chart may orient the reader but cannot claim intraday confirmation.
- Price scale, return scale, and excess-return scale are distinct. The axis label must match the transformation.
- A chart cannot strengthen the upstream thesis, change its direction, or silently move its deadline.
- Treat a creator level that is below `0.2x` or above `5x` the latest sealed price as a scale anomaly. Preserve the supplied number, block public release, and offer a separately labeled assumed correction; never add or remove a zero silently.
- A volume-confirmed settlement claim must name its bar interval, sealing basis, lookback window, and minimum ratio. The default 20-bar/1.0x policy may drive a content chart, but it must be copied into the settlement contract before the claim can settle.
- The settlement region is a clock, not a forecast canvas. Do not extend the last candle, draw a target path, or imply probability from empty space.

## Output Contract

Return `ThesisChartV1` from `references/thesis-chart-v1.schema.json`, then validate and render:

```bash
node scripts/validate_thesis_chart.mjs thesis-chart-v1.json
node scripts/render_thesis_chart.mjs thesis-chart-v1.json --output-dir ./chart-output
node scripts/render_thesis_chart.mjs thesis-chart-v1.json --market-data market-series-batch-v1.json --output-dir ./chart-output
node scripts/audit_chart_svg.mjs ./chart-output/chart.svg
node scripts/rasterize_thesis_chart.cjs ./chart-output/chart.svg ./chart-output/chart.png
```

The renderer writes `chart.svg` and `chart-data.json`. `chart-data.json` records fetched bars, derived values, source interval, coverage, sealed cutoff, and forming as-of time.

## Resources

- `references/chart-selection.md`: horizon, interval, mode, and annotation rules.
- `references/chart-design-system.md`: Cuebook chart design read, visual locks, density profiles, candlestick grammar, and preflight.
- `references/data-supply-contract.md`: native, derived, enriched, and creator-authored data boundaries.
- `references/thesis-chart-v1.schema.json`: structured chart job contract.
- `references/market-series-batch-v1.schema.json`: provider-neutral export contract for Cuebook's OHLCV database.
- `references/ohlcv-adapter.md`: backend query boundary, field mapping, and bar-integrity rules.
- `scripts/validate_thesis_chart.mjs`: semantic validator.
- `scripts/render_thesis_chart.mjs`: Cuebook candle adapter and dependency-free SVG renderer.
- `scripts/audit_chart_svg.mjs`: deterministic public-chart design and leakage audit.
- `scripts/rasterize_thesis_chart.cjs`: exact-size PNG renderer with light-canvas health checks.
- `tests/validate_thesis_chart.test.mjs`: regression tests using `node:test`.
