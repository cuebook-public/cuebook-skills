# Cuebook Viewpoint Expression System V1

Use this system to choose what the image must communicate before choosing its visual surface. It is a composition grammar, not a template gallery.

## Eight Layers

1. **Communication job**: fast conviction, proof, news synthesis, mechanism, comparison, distribution, scenario, flow, trigger, strategy, or cycle.
2. **Market relationship**: deviation, magnitude, change, ranking, distribution, correlation, part-to-whole, flow, relative value, term structure, revision, event reaction, trigger state, scenario/payoff, or causal transmission.
3. **Argument archetype**: the trading logic that explains why the relationship matters, such as forecast surprise, guidance reset, crowding unwind, balance-sheet pressure, or event-driven repricing.
4. **Evidence shape**: judgment, number, comparison pair, revision series, term structure, level, ordered series, events, distribution, quantiles, composition, spread, graph, flow, categories, or payoff.
5. **Visual grammar**: the meaningful geometry selected from `viewpoint-expression-registry-v1.json`.
6. **Composition archetype**: chart stage, editorial split, comparison axis, instrument strip, threshold field, transmission gate, timeline rail, distribution field, scenario field, network field, or editorial statement.
7. **Surface**: creator-adaptive hierarchy, palette, typography, density, and art direction.
8. **Integrity**: every visible magnitude, date, event, area, line, and relation resolves to a binding and its declared data requirement.

Do not start at layer 5. Different colors on the same semantic skeleton are siblings, not distinct candidates.

## Three Candidate Contract

Return exactly one candidate from each family:

- **Fast read**: the judgment becomes clear in one glance.
- **Proof**: the strongest valid evidence form carries the judgment.
- **System**: the reader sees how events, actors, conditions, flows, scenarios, or instruments connect.

The three candidates must use different primary grammars, three different composition archetypes, and at least two different evidence-shape signatures. They preserve the same creator judgment and all selected material bindings, but they answer different reader questions. At most one candidate may use the editorial-statement composition.

Choose the system candidate from the thesis:

- three or more material news events -> `news_synthesis`;
- event-to-market transmission -> `mechanism_path`;
- conditional outcomes -> `scenario_range`;
- measured capital or inventory movement -> `flow_map`;
- instrument or risk choices -> `strategy_map`;
- phase or reflexive loop -> `cycle_map`.

## Combination Rules

- Use one hero grammar and at most two support grammars.
- Choose the market relationship and argument archetype before the grammar. Read `finance-visual-argument-system-v1.md` for the routing matrix.
- A support must answer a different question from the hero. A news ribbon can locate a curve; it must not restate the curve label.
- Bind one visual group to one semantic role. Do not repeat the same fact as a number, label, and footer.
- Let geometry do real work: position for sequence, length for measured magnitude, area for a reconciled whole, enclosure for grouping, stroke state for observed versus conditional.
- Use direct labels. Legends are a fallback when several series cannot be labeled without collision.
- Recompose at 622 x 264. Remove secondary supports before shrinking the hero below legibility.
- Proof candidates give 55-72% of usable area to evidence geometry. A large number cannot replace a valid comparison, term structure, series, distribution, or threshold.

## Data Gates

Advanced geometry must bind to a validated `ViewpointDataBundleV1.evidence_objects` item and its `render_payload.evidence_object_refs` entry. The direction Skill selects and composes that object; it does not construct samples, clusters, flows, quantiles, reconciliations, or payoff points from prose.

- **Fan or quantile band**: require sourced or calculated quantiles with cutoff, horizon, method, model vintage, and calibration. Historical volatility alone is not a forecast fan. Prose bull/base/bear cases become a scenario tree. Keep the fan visually separate from the observed curve and label it modeled or conditional.
- **Box plot or histogram**: require a real sample, `n`, declared observation unit, window, population, weights, quartile/whisker method, and comparable basis. One current value cannot become a distribution. Prefer raw dots for small samples.
- **Donut, stacked composition, or dot matrix**: require a true part-to-whole denominator. Values must reconcile or visibly retain an `other` residual.
- **Sankey or weighted flow**: require quantified origin-to-destination flows with one unit, time basis, and visible residual. Qualitative influence becomes a causal chain or transmission gate with uniform strokes.
- **Relative or spread chart**: require synchronized timestamps, declared normalization, compatible currency/adjustment basis, and an explicit formula. Re-basing cannot repair an incompatible universe.
- **Waterfall**: require additive components and a reconciled start-to-end bridge.
- **Payoff curve**: require instrument terms, expiry, underlying-price domain, and calculation basis.
- **News cluster**: use the `news_cluster` evidence shape and bind every event, source, event time, `available_at`, cluster ID/method, and unique-source count. Deduplicate reports of the same event. Density may encode count only when every displayed item exists in the source bundle; article count is not importance or consensus.
- **OHLC setup**: route the full evidence object through `$render-cuebook-thesis-chart`; the viewpoint composition may frame it but cannot simplify it into an invented line.
- **Comparable scalar pair**: require shared unit, period, currency, basis, and as-of time. Use `comparison_pair` with a variance bar or bullet comparison; do not misuse `pair_spread` when no synchronized spread formula exists.
- **Revision ladder**: require ordered forecast/guidance vintages, one target period, one basis, and known-at times.
- **Maturity profile or term-structure curve**: require instrument-level maturity, notional, rate, currency, and one as-of time. Amount and rate use separate aligned visual channels.

## State Language

- Observed and reported geometry is solid.
- Conditional branches, levels, or areas are dashed or open and explicitly labeled.
- A future region may remain empty. Never draw one preferred price path merely because the creator is directional. A probabilistic fan is the only exception and must pass the quantile data gate above.
- Creator judgment may be visually dominant, but it cannot masquerade as a measured series, probability, flow, or distribution.

## Reference Mappings

Examples of valid synthesis:

- many headlines + one price response -> `news_constellation` or `catalyst_ribbon` supported by `event_reaction`;
- valuation gap + relative trade -> `dumbbell` or `spread_divergence` supported by one creator judgment;
- leverage crowding across assets -> `indexed_comparison`, `box_whisker`, or `dot_plot`, depending on whether the input is a time series or a cross-sectional sample;
- product catalyst + earnings revision + technical confirmation -> `causal_chain` supported by `curve_with_events` or `threshold_band`;
- risk-tiered ETF choices -> `risk_ladder` supported by one measured comparison, when available;
- event calendar + decision threshold -> `calendar_map` supported by `threshold_band`.

If the requested grammar fails its data gate, choose the nearest honest grammar and record the missing data upstream. Do not manufacture the missing shape.
