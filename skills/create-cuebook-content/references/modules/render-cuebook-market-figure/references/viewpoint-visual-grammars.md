# Viewpoint Visual Grammars

A Cuebook figure presents one evidence relationship that makes a viewpoint legible. It does not need to look like a price chart, and it must not turn prose into a decorative curve.

## Selection Matrix

| Viewpoint signal | Primary visual | Required Cuebook evidence | Settlement treatment |
| --- | --- | --- | --- |
| Reclaim, breakout, support, target | Observed price curve or candles plus one horizontal level | OHLCV, explicit level provenance, quote basis | Draw the level when it is the settlement threshold; mark expiry on time |
| News changed the tape | Event-window curve with one event marker | Timestamped event plus pre/post market series | Keep the deadline as a tick; keep prose outside |
| One surprising move | Dominant number plus a short observed sparkline | Current value, baseline, dated history | No settlement prose; threshold only when numeric and same-unit |
| Asset versus benchmark | Synchronized indexed lines, excess-return curve, or endpoint slope | Common baseline, synchronized observations, matching units | Encode the relative rule through endpoints or a zero/spread line |
| Valuation or fundamental comparison | Dominant ratio plus peer dots, bars, or ranked strip | Named metric, denominator period, peer basis, quote timestamps | Keep a composite success rule in metadata unless it reduces to one numeric threshold |
| Expectations are moving | Revision staircase or estimate-history line | Versioned estimates, consensus snapshots, catalyst dates | Deadline tick only |
| A catalyst needs several confirmations | Confirmation ladder above a price or estimate curve | VisualArgument path, event status, each confirmation metric, price level, common cutoff | Keep the multi-condition success rule in metadata |
| Crowding, leverage, or forced selling | Positioning or flow curve with price context | Flow, leverage, open interest, funding, short interest, or ETF exposure history | Show a numeric unwind trigger only when sourced |
| Where the asset sits in a universe | Percentile dot plot, rank strip, or compact distribution | Universe membership, metric basis, as-of timestamp | Keep rule in metadata unless percentile itself settles the claim |
| Several ETFs or vehicles express one thesis | Risk-versus-exposure instrument map | Common-window risk metric, holdings-based exposure metric, leverage/reset, cost, liquidity, as-of timestamps | Keep allocation prose outside; settle only a separately declared vehicle claim |
| Several drivers explain one change | Waterfall or variance bridge | Components with a reproducible sum and consistent units | No settlement prose in the figure |
| Payoff changes with an input | Sensitivity or payoff curve | Explicit formula and assumptions on a numeric x-axis | Break-even or threshold may be a plotted point or line |
| A sequence of catalysts matters | Compact event timeline with one reaction number | Calendar events, status, source, and observed reaction | Expiry may be the final tick |
| The claim is causal prose with no numeric sequence | Logic card | Sourced facts and causal links | Settlement remains on the Feed card |

## Key Number Routing

A key number can lead the figure in four ways:

1. `number + time`: show a dominant number and its observed history as a sparkline or curve.
2. `number + peer`: show a dominant number and a comparable peer or universe position.
3. `number + formula`: show a dominant number and the sensitivity or payoff that produces it.
4. `number only`: use a quiet large-number composition. Do not fabricate a curve. Require a baseline, comparison, or explanatory label so the number has meaning.

Two points can show a sourced before/after change. A trend claim normally needs at least three dated observations. A smooth line must never imply more sampling than the source provides.

## Settlement Visibility Contract

- Draw a settlement threshold when it is numeric, sourced, and expressed in the same unit as the plotted axis.
- Draw the deadline as a vertical tick or boundary when time is the x-axis.
- Draw a range only when both bounds are explicit.
- Keep relative, logical, multi-condition, and prose success rules in `SettlementClaimV1`, the Feed card, or the detail view.
- A compact figure must not repeat the full success sentence in a footer. The manifest still preserves it for settlement and accessibility.
- After settlement, outcome status may appear outside the plot as product chrome. It does not rewrite historical evidence.

## Viewpoint Language Inside The Figure

- Headline: one creator-owned judgment.
- Dominant number: one reason, reaction, or magnitude.
- Plot annotations: one to three short labels tied to actual points, levels, or events.
- Optional risk boundary: show one sourced numeric level only when explicitly selected; otherwise keep it in structured metadata.
- Body explanation: keep it in the content post. Do not paste a paragraph into the plot.

## Argument Plus Curve

Use `render.semantic_mode: argument_curve` when a curve alone would hide the creator's reasoning.

- `causal_chain`: event -> mechanism -> actor action -> market effect.
- `confirmation_ladder`: catalyst -> fundamental confirmation -> price confirmation -> active view.
- `evidence_ladder`: observation -> comparator -> interpretation -> decision state.
- Project two to four adjacent `VisualArgumentV1` nodes. Preserve `observed`, `derived`, `conditional`, and `unresolved` in metadata while rendering human roles and trade logic publicly.
- Add two to four public tags from `TradeLogicProfileV1`; suppress evidence-state labels in the image.
- The curve must verify one part of the path. It cannot serve as evidence for every causal edge.
- Keep branches and countercases outside the compact path unless the branch itself is the primary visual.

Example for AAPL:

`新品发布（催化剂） -> 服务收入预期上修（基本面确认） -> 周线突破（价格确认） -> 看多成立（观点状态）`

The plot shows weekly AAPL price, the event date, and the explicit breakout level. The dominant number shows the sourced services estimate revision. Missing estimate history or breakout provenance makes the output conditional.

## KOL To Cuebook Examples

| KOL-style claim | Cuebook visual | Data gap that blocks it |
| --- | --- | --- |
| "SK Hynix reclaimed 1.85m after an intraday break" | Price curve, 1.85m line, intraday low, low-to-close rebound | Venue OHLCV and explicit level normalization |
| "Korean leverage will keep pressuring memory stocks" | Leveraged ETF flow or exposure curve beside normalized memory-sector performance | Korean ETF holdings, flows, leverage reset, and synchronized sector data |
| "The oil shock is being priced in futures before equities" | USO or crude versus XLE normalized returns, event marker, excess return | Common baseline and event timestamp |
| "The ADR listing was a sell-the-news event" | Pre/post listing event window with volume ratio and gap | Listing timestamp, home-market and ADR mapping, volume basis |
| "HOOD is becoming prediction markets plus an on-chain exchange" | Revenue or volume mix revision curve led by one adoption number | Segment metrics or estimate history; price alone does not prove the mechanism |
| "SpaceX valuation is too high versus NVIDIA" | Valuation multiple as a large number plus peer dots or a sensitivity curve | Exact metric, denominator period, private valuation timestamp, comparable peer values |
| "Use SMH, DRAM, EWY, or KORU for the memory cycle" | Instrument map: common-window volatility or drawdown versus sourced memory exposure; annotate daily leverage | Vehicle holdings, exposure formula, shared OHLCV window, leverage/reset terms, fee and liquidity basis |

## Cuebook Data Contracts To Add

- `ComparableMetricSeriesV1`: valuation and fundamental metrics with denominator periods and peer basis.
- `EstimateRevisionSeriesV1`: timestamped consensus and creator estimate history.
- `FlowPositioningSeriesV1`: flows, leverage, open interest, funding, short interest, and exposure.
- `UniverseDistributionV1`: peer set, rank, percentile, and as-of basis.
- `DriverBridgeV1`: additive components and reconciliation residual.
- `ScenarioCurveV1`: formula, assumptions, x domain, break-even, and model status.
- `VehicleMetricPackV1`: instrument identity, holdings-based thesis exposure, exposure formula, holdings as-of, common-window risk metric, leverage/reset, fee, liquidity, and source refs.

Until those contracts exist, use OHLCV-backed event, level, and relative-strength figures, or route the viewpoint to a logic card.
