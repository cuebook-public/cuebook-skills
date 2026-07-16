---
name: render-cuebook-logic-card
description: Render a validated Cuebook VisualArgumentV1 into a branded LogicCardV1 and Feed-ready SVG using causal-chain, metric-thesis, scenario-tree, evidence-balance, or comparison grammar. Use when a trading narrative should become an explanatory opinion graphic rather than a market-price chart. Preserve observed, derived, conditional, countercase, creator-ownership, source, and settlement states. Use render-cuebook-thesis-chart for candles, relative-return lines, price levels, and viewpoint-to-expiry market timelines. Do not research facts, invent causal links, calculate indicators, imitate a creator, publish, or place trades.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Python 3.11+ for validators and Node.js 18+ with Playwright plus a local Chromium/Chrome executable for capture, render, and audit scripts. Local filesystem only; no network access at render time.
---

# Render Cuebook Logic Card

Turn one validated visual argument into one compact Cuebook opinion graphic. The renderer controls layout; `VisualArgumentV1` controls meaning.

## Workflow

1. Validate the input with `../compile-cuebook-visual-argument/SKILL.md` and preserve its `argument_id`, revision, state, lineage, node IDs, metric IDs, source refs, creator text, and settlement claim.
2. Use the recommended grammar by default. A creator may select one of the declared alternatives without changing the argument.
3. Route grammar:
   - `causal_chain`: observed event/evidence -> mechanism -> actor action -> market effect, with a visibly separate countercase;
   - `metric_thesis`: one judgment plus two to four decision-driving metrics and an invalidation;
   - `scenario_tree`: one current setup branching into distinct conditions and outcomes;
   - `evidence_balance`: support and counterevidence around one explicit conclusion;
   - `comparison`: primary versus benchmark/company/regime with shared comparison dimensions.
4. Render Cuebook branding, concise source state, argument status, and optional settlement footer. Use brand yellow for conditional or settlement structure, green for support, and red for challenge/invalidation.
5. Keep node labels compact. Full prose, source bodies, and methodological notes stay in the card detail view.
6. Write `logic-card.svg` and `logic-card-v1.json`, then validate the manifest with `scripts/validate_logic_card.py`. Use the optional Playwright rasterizer when a PNG derivative is required; SVG remains the canonical hashed asset.

## Hard Gates

- Render only the primary grammar or one declared alternative.
- `price_timeline` routes to `../render-cuebook-thesis-chart/SKILL.md`; do not fake a market chart with decorative lines.
- Observed and derived nodes must remain visually distinguishable from conditional or unresolved nodes.
- A countercase cannot be hidden because it weakens the headline.
- `frame.cuebook_contribution` is internal provenance metadata. Never render a “Cuebook 补全” block or other production commentary inside the public graphic.
- Metric cards preserve as-of and provisional status. Do not turn estimates into verified numbers.
- Comparison needs a named benchmark and shared dimensions.
- A settleable argument keeps the exact claim ref, deadline, and success condition.
- The Cuebook watermark stays low contrast and never obscures evidence.

## Output Contract

```bash
python scripts/render_logic_card.py visual-argument-v1.json --output-dir ./logic-card
python scripts/render_logic_card.py visual-argument-v1.json --grammar evidence_balance --output-dir ./logic-card
python scripts/validate_logic_card.py ./logic-card/logic-card-v1.json
node scripts/rasterize_logic_card.cjs ./logic-card/logic-card.svg ./logic-card/logic-card.png
```

## Resources

- `references/logic-card-v1.schema.json`: rendered asset manifest.
- `references/visual-grammars.md`: routing and content limits for all five grammars.
- `scripts/render_logic_card.py`: dependency-free Cuebook SVG renderer.
- `scripts/rasterize_logic_card.cjs`: optional Playwright PNG renderer for release previews.
- `scripts/validate_logic_card.py`: lineage, grammar, asset, settlement, and state validator.
- `tests/test_logic_card.py`: renderer and manifest regressions.
