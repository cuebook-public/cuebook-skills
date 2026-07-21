---
name: render-cuebook-market-signal
description: "Render one sourced Cuebook market signal into a restrained 720 x 420 Feed SVG and MarketSignalV1 manifest. Use when a creator can express a decisive trade from one market number or one verified news item: what happened, what I would do, why the price should move, and the strategy tags hidden inside the idea. Route multi-step causal arguments to render-cuebook-logic-card or render-cuebook-market-figure, and price/settlement timelines to render-cuebook-thesis-chart. Keep evidence states in metadata; do not invent a curve, pad a weak signal with generic prose, research missing facts, or publish."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+; PNG preview additionally requires Playwright plus a local Chromium/Chrome executable. Local filesystem only; no network access at render time.
---

# Render Cuebook Market Signal

Turn one verified number or news item into a compact creator viewpoint. The public image says what happened, what the creator would do, and why. Strategy classification and source administration remain separable. The visual profile uses receptive restraint: whitespace, quiet asymmetry, one accent, and one dominant information object. It is adapted from Hara Design Institute writing on white as communicative capacity; it does not imitate a named designer's work.

## Routing

- `key_number`: one number carries the update. Examples: estimate revision, ETF flow, spread, valuation gap, implied move, inventory change, or positioning percentile.
- `key_news`: one verified headline is the catalyst. The creator action is the headline; the source headline appears under a localized `because` label.
- Use `$render-cuebook-market-figure` when a sourced curve, relationship, or capital-flow sequence is available.
- Use `$render-cuebook-logic-card` when the argument needs two or more causal, comparative, or scenario nodes and no quantitative curve is necessary.

## Workflow

1. Freeze one source-bounded signal and a decision cutoff.
2. Run `$classify-cuebook-trading-logic`. Use its action line, reason line, horizon, and two to four public tags. Keep `evidence_boundary` private.
3. Choose exactly one mode. Never fabricate a companion number or decorative chart to fill space.
4. Make the public headline a creator action: `Because of this change, I am doing X over window Y`. Make the interpretation the single price mechanism behind the action.
5. Put signal time and readable strategy tags in the upper-left metadata. Put the Cuebook wordmark in the upper right. Keep source IDs, retrieval notes, evidence states, and settlement prose in the manifest.
6. Render `market-signal.svg` and `market-signal-v1.json` with `scripts/render_market_signal.mjs`.
7. Validate the manifest and inspect the raster at full and 360px widths.

## Hard Gates

- `key_number` requires one sourced number with an as-of time and machine-only status.
- `key_news` requires publisher, published time, source refs, and a machine-only evidence state.
- A provisional number or developing transmission keeps the artifact conditional in metadata.
- The image contains no source count, footnote rail, “forming” legend, settlement copy, decorative curve, gradient, texture, or stock image.
- Public copy cannot contain backend labels such as `observed`, `derived`, `provisional`, `confirmed`, `calculated`, `inference`, `pending`, or `forming`.
- The creator may express a directional expectation about capital movement. The manifest must retain whether that movement is measured, inferred, or still missing.
- The public action must name the asset, trade expression, and horizon. Relative-value expressions must also name the comparator.
- Visible text stays concise; full provenance remains machine-readable.

## Commands

```bash
node scripts/render_market_signal.mjs market-signal-spec-v1.json --output-dir ./market-signal
node scripts/validate_market_signal.mjs ./market-signal/market-signal-v1.json --asset-root ./market-signal
node scripts/rasterize_market_signal.cjs ./market-signal/market-signal.svg ./market-signal/market-signal.png
```

## Resources

- `references/market-signal-spec-v1.schema.json`: validated render input.
- `references/market-signal-v1.schema.json`: rendered manifest.
- `references/signal-visual-grammar.md`: content routing and visual limits.
- `scripts/render_market_signal.mjs`: dependency-free SVG renderer.
- `scripts/validate_market_signal.mjs`: spec and manifest validator.
- `scripts/pycompat.mjs`: local Python-parity helpers used by the renderer and validator.
- `scripts/rasterize_market_signal.cjs`: PNG preview renderer.
