<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/render-cuebook-market-signal/` from the public Skill directory.
# Render Cuebook Market Signal

Turn one verified number or news item into a compact creator viewpoint. The public image says what happened, what the creator would do, and why. Strategy classification and source administration remain separable. The visual profile uses receptive restraint: whitespace, quiet asymmetry, one accent, and one dominant information object. It is adapted from Hara Design Institute writing on white as communicative capacity; it does not imitate a named designer's work.

## Routing

- `key_number`: one number carries the update. Examples: estimate revision, ETF flow, spread, valuation gap, implied move, inventory change, or positioning percentile.
- `key_news`: one verified headline is the catalyst. The creator action is the headline; the source headline appears under a localized `because` label.
- Use `references/modules/render-cuebook-market-figure.md` when a sourced curve, relationship, or capital-flow sequence is available.
- Use `references/modules/render-cuebook-logic-card.md` when the argument needs two or more causal, comparative, or scenario nodes and no quantitative curve is necessary.

## Workflow

1. Freeze one source-bounded signal and a decision cutoff.
2. Run `references/modules/classify-cuebook-trading-logic.md`. Use its action line, reason line, horizon, and two to four public tags. Keep `evidence_boundary` private.
3. Choose exactly one mode. Never fabricate a companion number or decorative chart to fill space.
4. Make the public headline a creator action: `Because of this change, I am doing X over window Y`. Make the interpretation the single price mechanism behind the action.
5. Put signal time and readable strategy tags in the upper-left metadata. Put the Cuebook wordmark in the upper right. Keep source IDs, retrieval notes, evidence states, and settlement prose in the manifest.
6. Render `market-signal.svg` and `market-signal-v1.json` with `references/modules/render-cuebook-market-signal/scripts/render_market_signal.mjs`.
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
node references/modules/render-cuebook-market-signal/scripts/render_market_signal.mjs market-signal-spec-v1.json --output-dir ./market-signal
node references/modules/render-cuebook-market-signal/scripts/validate_market_signal.mjs ./market-signal/market-signal-v1.json --asset-root ./market-signal
node references/modules/render-cuebook-market-signal/scripts/rasterize_market_signal.cjs ./market-signal/market-signal.svg ./market-signal/market-signal.png
```

## Resources

- `references/modules/render-cuebook-market-signal/references/market-signal-spec-v1.schema.json`: validated render input.
- `references/modules/render-cuebook-market-signal/references/market-signal-v1.schema.json`: rendered manifest.
- `references/modules/render-cuebook-market-signal/references/signal-visual-grammar.md`: content routing and visual limits.
- `references/modules/render-cuebook-market-signal/scripts/render_market_signal.mjs`: dependency-free SVG renderer.
- `references/modules/render-cuebook-market-signal/scripts/validate_market_signal.mjs`: spec and manifest validator.
- `references/modules/render-cuebook-market-signal/scripts/pycompat.mjs`: local Python-parity helpers used by the renderer and validator.
- `references/modules/render-cuebook-market-signal/scripts/rasterize_market_signal.cjs`: PNG preview renderer.
