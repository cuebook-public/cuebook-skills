<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/compute-cuebook-market-indicators/` from the public Skill directory.
# Compute Cuebook Market Indicators

Calculate only the indicators that test a stated view. Keep formulas, lookbacks, interval, source, bar state, and as-of time visible so downstream reasoning can use the numbers without turning them into magic labels.

## Workflow

1. Accept registered OHLCV data or `ThesisChartDataV1`. Verify ticker mapping, interval, session, coverage, and sealed/forming state.
2. Resolve the indicator request from the creator's selected block and claim horizon. Use the same series and baseline as the thesis chart.
3. Compute with `references/modules/compute-cuebook-market-indicators/scripts/compute_indicators.mjs`. Default to sealed bars. `include_forming: true` produces `provisional` results.
4. Return `IndicatorPackV1`. Each result records formula, lookback bars, source series, value, unit, observation time, and bar state.
5. Return indicator semantics and placement hints without invoking a renderer. A downstream Create workflow decides where the indicator appears and whether it supports, challenges, or contextualizes the claim.

## Supported Indicators

- `return_pct`: latest close versus the chart's explicit baseline.
- `relative_strength_pct`: primary baseline return minus benchmark baseline return.
- `sma_distance_pct` and `ema_distance_pct`: latest close distance from an N-bar average.
- `rsi`: N-bar Relative Strength Index.
- `atr_pct`: N-bar Average True Range divided by latest close.
- `volume_ratio`: latest volume divided by the previous N-bar average.
- `drawdown_pct`: latest close versus the N-bar high close.
- `vwap_distance_pct`: latest close versus the latest available VWAP.
- `breakout_distance_pct`: latest close versus the previous N-bar high.

## Hard Gates

- Never compute across mixed intervals, unsynchronized relative legs, or an unknown ticker mapping.
- Never silently replace a requested lookback when history is insufficient; return `insufficient_data`.
- Forming-bar results are provisional and must retain `lastEventTime`.
- A computed indicator is a derived fact. It does not become a bullish or bearish conclusion until the creator or thesis reasoning explicitly connects it.
- Do not calculate an indicator merely because the UI has empty space. Every request needs a decision job.
- Do not infer support, resistance, trigger, or invalidation from an indicator unless a separate explicit rule defines it.

## Output Contract

Prepare an `IndicatorRequestV1`, then run:

```bash
node references/modules/compute-cuebook-market-indicators/scripts/compute_indicators.mjs indicator-request-v1.json --output indicator-pack-v1.json
```

Validate the output against `references/modules/compute-cuebook-market-indicators/references/indicator-pack-v1.schema.json` or consume the script's validated result directly.

## Resources

- `references/modules/compute-cuebook-market-indicators/references/indicator-pack-v1.schema.json`: deterministic output contract.
- `references/modules/compute-cuebook-market-indicators/scripts/compute_indicators.mjs`: indicator request validator and calculator.
