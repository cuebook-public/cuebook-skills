# Cuebook Data Supply For Viewpoint Visuals

## Principle

The creator supplies the judgment. Cuebook supplies traceable primitives that can support, challenge, or visualize it. A missing primitive changes the visual grammar; it never licenses a synthetic market curve.

## Required DB Envelopes

Every record exposed to this skill should include:

- durable record and entity IDs;
- symbol, venue, currency, and valid-from/valid-to aliases;
- source locator, publisher, revision, and content hash;
- event or observation time, `observed_at`, `available_at`, and retrieval time;
- timezone, session, interval, unit, adjustment policy, and sealed/forming state;
- access, reuse rights, trust state, and supersession links.

Every bundle requirement must also carry a revision-qualified `expression_plan_requirement_ref` and retain the upstream `request_class`, `required`, `material_to_claim`, and `expression_surfaces`. Validate those fields against the supplied `CreatorExpressionPlanV1`; a self-consistent bundle is not enough.

Events retain label, event time, availability time, source ref, publisher or issuer, source type, HTTP(S) source URL when applicable, supported fact refs, and role. Levels retain instrument ref, numeric value, unit, kind, source ref, fact refs, observation/availability times, and whether the creator explicitly named the level.

## Supply Map

| Viewpoint job | Preferred primitives | Honest fallback |
| --- | --- | --- |
| Reaction test | price/return series plus event, flow, estimate revision, or news-pressure series | explicit event rail plus key reaction number |
| Parallel contrast | synchronized comparable series, or two explicitly reported outcome records | qualitative outcome rails with scope label |
| Category reframe | product facts, rights, jurisdiction, value-chain nodes, comparable category metrics | architecture diagram with caveat |
| Relative-value trigger | synchronized prices or a precomputed spread, level, and event | current spread number plus trigger |
| Policy pivot | policy event, leverage/flow series, affected instruments | feedback loop with policy break node |
| Sentiment witness | authorized post, cohort count, liquidation/funding/margin corroboration | single-witness card that forbids breadth inference |
| Event unwind | event timestamp, price/return and volume around event, positioning if available | pre-event/event/post-event action timeline |
| Feedback loop | concentration weights, price, flows, margin/liquidation, and event data | sourced key numbers plus qualitative loop |
| Binary level | OHLCV, explicit level, session and horizon | level diagram; never draw candles without OHLCV |
| Expectation gap | actual, consensus, prior estimate, revision history, contract/mix facts | labeled analogy plus mechanism columns |
| Factor rotation | formula inputs by venue, normalization, history, percentile, and relative returns | formula and historical action only; no current signal value |

## Structured Evidence Objects

Use `evidence_objects` only when the geometry needs a contract richer than a curve, point, event, or level. Keep the raw primitives in their native arrays and let the object bind them into one validated analytical shape.

| Shape | Minimum provider payload | Eligible expression |
| --- | --- | --- |
| `news_cluster` | deduplicated event refs, cluster ID/method, exact unique-source count, synthesis | news constellation, catalyst ribbon |
| `distribution_sample` | raw observations, `n`, unit/window/population, weights, quartile/whisker/outlier methods | dot plot, histogram, box-and-whisker |
| `quantile_scenarios` | cutoff, future timestamps, ordered quantile levels/values, method, model vintage, calibration, formula | conditional fan; never a made-up forecast path |
| `part_to_whole` | mutually exclusive non-negative parts, denominator, basis, residual | ranked share bars, dot matrix, compact composition |
| `additive_components` | start, signed components, end, period, residual | waterfall bridge |
| `quantified_flow` | one-stage measured edges, common unit/window, declared total, residual | width-encoded flow map |
| `ordered_categories` | sourced items, item states, explicit order basis | risk ladder, strategy ladder, confirmation sequence |
| `payoff_series` | complete instrument terms, domain, expiry, premium, strike, quantity, formula, calculated points | terminal payoff curve |

The optional object layer keeps `ViewpointDataBundleV1` backward compatible. Legacy bundles omit both `evidence_objects` and `render_payload.evidence_object_refs`. New renderers select `mode: evidence` for one object or `mode: mixed` for two or more distinct evidence groups.

## Data Families Cuebook Should Expose

1. **Instrument master**: entity, security, share class, ETF exposure, futures contract, venue, currency, corporate-action history, and proxy map.
2. **OHLCV and quotes**: adjusted and unadjusted bars, session state, quote type, exchange timestamp, interval, and forming-bar flag.
3. **Events and calendars**: earnings, listing, product, policy, macro, filing, reschedule/cancel state, and source revision.
4. **News facts**: event cluster, atomic facts, entities, directness, source hierarchy, and available time.
5. **Fundamentals and estimates**: reported values, consensus basis, analyst revisions, segment mix, guidance, and comparable periods.
6. **Flows and positioning**: ETF flows, foreign/local flow, margin, leveraged-product volume, open interest, funding, liquidation, and ownership cohort.
7. **Market structure**: index weights, circuit breakers, liquidity, borrow, spreads, contract basis, and venue segmentation.
8. **Derived factors**: immutable formula version, input refs, window, normalization, missing-value policy, output unit, limitations, and recomputation hash.
9. **Creator material**: creator seed, selected records, accepted/rejected Cuebook additions, horizon, instrument, direction, conditions, and disclosure state.
10. **Structured evidence**: deduplicated cluster membership, raw event-study samples, model quantiles and vintage, reconciled compositions/bridges/flows, category order, and complete strategy terms. Return inputs and method metadata, not a provider-rendered chart.

## Class Evidence

- `news_anchor`: a `news` or `catalyst` event with publisher/issuer, URL, and supported fact refs.
- `official_event`: an event sourced to an issuer, regulator, exchange, government body, or filing.
- `valuation_metric`: instrument-bound key values with complete valuation basis; P/E is `N/M` when earnings are non-positive.
- `comparison_metric`: at least two aligned values or series bound to primary and comparator instruments, with compatible units and time basis.
- `market_series`: a real observed series with source-linked points.
- `price_level`: an explicit, instrument-bound level with fact and source refs.
- `settlement_reference`: an official deadline event plus a sourced value or level.

## Backend Tool Requirements

The Query layer may expose raw records through existing tools, then assemble these shapes deterministically. Phase-one endpoints do not need to return pixels.

- `news_search` and `event_clusters` must return durable event and cluster IDs, source identity, event/publish/available times, dedup method, supported fact refs, and cluster membership.
- `candles`, `price_reaction`, `leverage_ratio`, fundamentals, estimates, positioning, and flow tools must retain the raw aligned observations needed to build samples and comparisons.
- Scenario or risk-model tools must return quantile levels and values by future timestamp, cutoff, horizon, model/method, model vintage, calibration note, and formula inputs.
- Composition and flow tools must return the denominator or declared total plus residual; never return percentages that cannot be reconciled.
- Derivatives tools must return the complete position terms and calculation basis needed to recompute payoff points.

Required material news, valuation, comparator, price-level, and settlement requests cannot use `degraded`, `not_applicable`, or fallback as an escape hatch. Keep the missing request, use no fallback, and block the bundle.

## Boundaries

- Search snippets and source posts can generate research leads. They do not become observed market data.
- A public commentator statement proves authorship of the statement. Independent data is required to present its market claim as fact.
- Later observations belong to tracking or replay. They cannot support the original declaration at an earlier cutoff.
- If venue, currency, adjustment, interval, or timestamp alignment is unresolved, return `degraded` or `missing` and use a permitted fallback.
- A material text-only premise remains routed to `text`; do not manufacture a visual dependency or omit it from the bundle.
