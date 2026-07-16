---
name: render-cuebook-market-figure
description: Compile and render a Cuebook market viewpoint into a compact, sourced Feed figure led by one meaningful curve or instrument map, one judgment, one dominant number, an optional news anchor, and an optional settlement rule; an editorial variant can retain secondary evidence. Use for event-reaction, relative-strength, expectation-revision, fundamental-driver, positioning-pressure, sensitivity/payoff, multi-vehicle risk-versus-exposure graphics, and clearly disclosed redraws of authorized source charts. Do not use for decorative trend lines, unsupported forecasts, generic logic diagrams, personalized allocation advice, or a standalone settlement price chart.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Python 3.11+ for validators and Node.js 18+ with Playwright plus a local Chromium/Chrome executable for capture, render, and audit scripts. Local filesystem only; no network access at render time.
---

# Render Cuebook Market Figure

Build the Feed visual that answers: what happened, what I am betting on, why price should move, and what market path already matters. Default to the compact core-data layout; use the editorial layout only in detail surfaces.

## Workflow

1. Lock the upstream viewpoint and settlement contract. Preserve direction, benchmark, time horizon, baseline, uncertainty, and creator ownership.
2. Select one viewpoint visual grammar with `references/viewpoint-visual-grammars.md`, then select the supporting curve grammar with `references/curve-grammars.md`. For an explicit direction plus bounded horizon, default to `argument_curve` when a sourced series can show reaction, divergence, a confirmation level, expectation change, or pressure relevant to the bet. Continue here for a sourced sequence, synchronized comparison, or numeric formula. Route a pure price timeline to `../render-cuebook-thesis-chart/SKILL.md`, pure causal prose to `../render-cuebook-logic-card/SKILL.md`, a single decisive number or news item to `../render-cuebook-market-signal/SKILL.md`, and an unsupported distribution or bridge to a missing-contract result. A curve is preferred when it proves something, not required by decoration policy.
3. Gather one chartable sequence, synchronized comparison, or explicit formula. A Skill is never a data source. Prefer Cuebook `MarketSeriesBatchV1`, `ThesisChartDataV1`, deterministic indicator history, estimate history, fundamental history, positioning/flow history, or a source-linked vehicle metric pack. When only an authorized chart image exists, follow `references/source-chart-redraw.md`, mark every reconstructed series `digitized_observed`, and keep the figure conditional and non-settleable. Route missing non-OHLC evidence through `../build-market-research-pack/SKILL.md`.
4. Run `../classify-cuebook-trading-logic/SKILL.md` and copy its family, mechanism, expression, horizon, and public tags into `trade_logic`. Make the headline the creator's action or bet, not a workflow update.
5. When the viewpoint contains a decision-relevant mechanism or several confirmations, project two to four adjacent nodes from `VisualArgumentV1` into `argument_path`. Use `causal_chain`, `confirmation_ladder`, or `evidence_ladder`; preserve node status and source refs in the spec. Set `render.semantic_mode: argument_curve`. Prefer the sequence `changed input or catalyst -> actor action -> capital or market transmission -> creator bet`, omitting only a genuinely absent role. Name who reallocates, hedges, reprices, chases, cuts, or waits and, when supported, from which exposure toward which exposure. The public renderer turns node kinds into human roles such as `导火索`, `谁被迫动`, `钱往哪走`, and `我押什么`; evidence states stay machine-only.
6. Build `MarketFigureSpecV1`. Bind every argument node, series, marker, news anchor, and key number to durable source refs. Mark forming data as provisional in metadata.
7. Validate the spec. Missing data lineage, a decorative curve, a disconnected argument path, or a forecast price path blocks rendering.
8. Render one SVG and `MarketFigureV1` manifest. Use `compact` at `720 x 420` for Feed: one judgment, one compact argument path, one evidence relationship, one dominant number, and at most one event anchor. Keep prose settlement rules and evidence states in the manifest and Feed card. Use `editorial` at `1200 x 760` only when the detail surface needs secondary evidence.
9. Run the adapted visual review in `references/visual-review.md`. Inspect the actual raster for hierarchy, type scale, contrast, crowding, truncation, currency, semantic color, and unnecessary motion or decoration. The review may simplify presentation; it cannot alter data or claims.
10. Rasterize only after SVG validation when a Feed PNG is needed, then repeat the visual review at final size.

```bash
python3 scripts/validate_market_figure.py market-figure-spec-v1.json
python3 scripts/render_market_figure.py market-figure-spec-v1.json --output-dir ./figure-output
node scripts/rasterize_market_figure.cjs ./figure-output/market-figure.svg ./figure-output/market-figure.png
python3 scripts/validate_market_figure.py ./figure-output/market-figure-v1.json --asset-root ./figure-output
```

## Compact Composition

- Put the creator-facing judgment in one short headline. Do not show a second explanatory paragraph.
- Let the curve occupy most of the visual. Curves must encode time, category order, or an explicit numeric function.
- Make the curve carry one explicit argumentative verb: `跌破`, `背离`, `跑赢`, `放量`, `回落`, `上修`, or another source-faithful relationship. At least one claim clause or node must point to its event, level, divergence, endpoint, or change; a curve that could be deleted without weakening the argument is decoration.
- When `semantic_mode` is `argument_curve`, place a two-to-four-node reasoning path above the plot. Public captions describe the role in the trade; observed, derived, conditional, and unresolved remain in SVG metadata and the manifest.
- Project compact node labels as short semantic clauses, normally one or two lines at Feed width. Preserve the full source wording and explanation in `VisualArgumentV1`; do not shrink type to fit long prose.
- Give capital transmission a visible direction: catalyst -> repricing mechanism -> capital flow -> market effect. Use strategy tags and action language to make the trade construction legible.
- Keep the public chain linear and compact. Branches, countercases, and full settlement logic remain in `VisualArgumentV1`, the post, or the detail view unless they are the main visual job.
- Show one dominant number. Let the curve endpoints carry the primary and benchmark values.
- Compress news into one sourced event line and marker.
- Show a numeric settlement threshold only when it shares the plotted axis; show the deadline as a time marker. Keep the full settlement sentence, countercase prose, and source detail outside the compact image.
- Keep the Cuebook watermark low contrast inside the plot.
- Put the decision cutoff in the upper-left metadata line. Keep source counts, source IDs, and forming-state explanations in the manifest or detail surface, not in the Feed footer.
- For an all-in-one thesis, let the dominant number carry the reason, the observed curve carry the market path, and horizontal level markers carry the entry, trigger, target, or explicitly selected risk boundary. Never mix their units on one axis.
- Make the compact image answer five questions without body copy: what is the judgment, why now, what has price done, what matters next, and when the stated horizon ends.
- Fit history to the claim horizon. A three-session view normally needs two to four weeks of observed context plus the settlement window; use full history only when the distant event is essential.
- For a five-session declaration, normally show 20-30 completed sessions before the decision cutoff, a visible cutoff line, and a five-session settlement marker or blank future region. Do not continue the observed line beyond the cutoff.
- Prefer Cuebook-native evidence closure. When the creator's reason depends on a missing comparison metric, return the missing field and omit that number. Use a different native driver only when it genuinely preserves the creator's thesis.
- For several ETFs or trade vehicles, use `instrument_map`: x is one common-window risk metric, y is one same-basis exposure metric, and every point names the instrument. Put leverage/reset, cost, or liquidity in sourced key numbers. Never inherit a creator's "稳健/激进" ordering without computing the shared risk axis.
- For one indicator family, retain up to seven same-unit series in editorial and select at most four thesis-bearing series in compact with `focus_series_ids`. Use one color per entity family and stroke style for scope or methodology, then limit explicit endpoint labels with `endpoint_series_ids`.

## Hard Gates

- Do not draw a curve from prose alone. Require at least two sourced points or an explicit reproducible formula.
- Do not extend an observed price series into the future. `modelled` points are allowed only for `sensitivity_curve` on a numeric x-axis.
- Do not combine raw prices with unrelated units on one y-axis. Normalize, separate the figure, or abstain.
- Preserve the quote currency for cross-market assets. Use explicit units such as `USD`, `KRW`, `JPY`, `CNY`, `EUR`, or `GBP`; never display a foreign-market price with a dollar sign.
- `relative_strength` requires synchronized baselines and either two comparable return series or one sourced excess-return series.
- `instrument_map` requires a numeric x-axis, a reproducible `risk_exposure_map` formula, two to eight labeled vehicle points, common risk-window lineage, holdings/exposure lineage, and no modelled points.
- `event_reaction` requires a sourced event marker and news anchor.
- A forming point uses dashed geometry; `provisional` remains metadata and never becomes a public badge or legend.
- A key number without source, basis, or as-of context cannot appear.
- A Skill name, prompt, model output, or renderer is not acceptable data lineage. Every displayed fact must resolve to a native snapshot, registered provider record, creator-owned explicit input, or reproducible formula over sourced inputs.
- `source_chart_redraw` is an editorial bridge, not recovered market data. It requires a durable source-chart ref, a redraw warning, `digitized_observed` series, conditional state, and a non-settleable claim. Never backtest, rank, trigger, or settle from digitized intermediate points.
- `argument_curve` requires `argument_path`, a `visual_argument_ref`, two to four sourced nodes, and one edge between every adjacent pair. Do not generate causal text from curve shape alone.
- Reject an `argument_curve` when the reasoning labels merely restate the headline, when the curve is unrelated to the claimed mechanism or confirmation, or when removing the curve leaves the same evidentiary argument intact.
- Do not silently translate an undefined phrase such as "higher valuation" into market cap, P/S, P/E, or EV/revenue. Require the comparison metric, denominator period, quote timestamp, formula, and sources.
- Do not change the upstream claim to make the figure look cleaner.

## Output Contracts

- `references/market-figure-spec-v1.schema.json`: semantic input and curve data.
- `references/market-figure-v1.schema.json`: rendered asset manifest.
- `references/viewpoint-visual-grammars.md`: routes KOL claims to curve, large-number, comparison, distribution, bridge, timeline, or logic-card forms.
- `references/curve-grammars.md`: routing rules and required inputs.
- `references/visual-review.md`: post-render hierarchy, typography, contrast, optical-alignment, and motion audit adapted from three MIT-licensed design skill sets.
- `references/source-chart-redraw.md`: exact-series versus chart-redraw modes, multi-series focus rules, and the Cuebook leverage-indicator data contract.
- `scripts/validate_market_figure.py`: structural and semantic validation.
- `scripts/render_market_figure.py`: dependency-free Cuebook SVG renderer.
- `scripts/rasterize_market_figure.cjs`: deterministic PNG rasterizer that follows the selected SVG dimensions.
- `tests/test_market_figure.py`: regression coverage.
