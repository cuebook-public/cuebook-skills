# Source Chart Redraw

Use this bridge only when the creator owns, supplies, or is authorized to reuse a chart image and Cuebook does not yet hold the underlying ordered series.

## Two Modes

- `native_series`: render source-linked ordered observations or a reproducible formula. The figure may support analysis or settlement when the remaining claim contract is valid.
- `source_chart_redraw`: reconstruct the visible relationship from the supplied chart. Mark each reconstructed series `digitized_observed`, preserve the source-chart ref, set the figure `conditional`, add a redraw warning, and keep settlement off.

Endpoint labels printed in the source chart may be transcribed as source-visible values. Intermediate digitized points remain visual approximations. Never use them for backtests, triggers, rankings, or outcome settlement.

## Indicator Families

An editorial figure may retain up to seven same-unit series. A compact Feed figure selects at most four thesis-bearing series through `focus_series_ids`.

- Use one color role per entity family.
- Use `solid`, `dashed`, or `dotted` only for a meaningful scope or methodology distinction.
- Limit endpoint labels to four with `endpoint_series_ids`; preserve the rest in the legend and manifest.
- Put the creator's interpretation in the headline. Let the curve prove one relationship rather than adding explanatory paragraphs.
- Keep formula, venue list, source IDs, and digitization limits in metadata or the detail surface.

## Cuebook Leverage-Series Contract

For an exact memory-sector leverage ratio, Cuebook should provide one record per asset, listing scope, and primary-listing session:

```json
{
  "session_date": "2026-07-10",
  "asset_id": "SK_HYNIX",
  "listing_scope": "KR_ONLY",
  "leveraged_product_volume_usd": 0,
  "underlying_common_volume_usd": 0,
  "underlying_adr_gdr_volume_usd": 0,
  "ratio": 0.81,
  "session_state": "sealed",
  "source_refs": []
}
```

The deterministic formula is:

`leveraged_product_volume_usd / (underlying_common_volume_usd + included_adr_gdr_volume_usd)`

Also preserve product membership, venue, FX normalization timestamp, ADR/GDR inclusion rule, no-product state, and data cutoff. A listing event that changes the denominator must arrive as a sourced marker so the chart can distinguish a measurement break from a genuine leverage unwind.
