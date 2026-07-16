---
name: assemble-cuebook-viewpoint-data
description: Assemble the exact sourced market primitives requested by CreatorExpressionPlanV1 into ViewpointDataBundleV1 for Cuebook text and viewpoint visuals. Use after meaning and expression jobs are fixed and a hash-verified CuebookQueryBundleV1 or validated caller data supplies OHLCV, prices, returns, events, levels, formulas, key numbers, or structured evidence for news clusters, distributions, quantile fans, compositions, additive bridges, measured flows, ordered categories, and strategy payoffs. Preserve query and requirement lineage, enforce reconciliation and provenance, record missing requirements, and use fallback only where the plan permits it. Do not call market-data or evidence tools directly, research a new thesis, infer creator conviction, calculate undeclared indicators, write public copy, render graphics, or publish content.
---

# Assemble Cuebook Viewpoint Data

Turn an expression data request into one cutoff-safe, source-linked bundle. The expression plan owns meaning and surface routing; this skill only resolves the market primitives needed by text and/or visual output.

## Workflow

1. Validate `CreatorExpressionPlanV1` and freeze its root data requirements, text/visual surface routing, three candidate jobs, evidence shapes, exact Query tool bindings, visual Skill/renderer route hash, grammar, meaning fingerprint, decision cutoff, and temporal mode.
2. Read `references/cuebook-data-supply.md`. Resolve instruments through durable entity and venue IDs before matching symbols.
3. Resolve only the requested primitives from supplied `CuebookQueryBundleV1` result refs, `ResearchPackV1`, `MarketSeriesBatchV1`, `IndicatorPackV1`, or explicit caller data. Match every visual requirement to the exact capability and tool path locked in `visual_plan.execution_route.query_requests`; the route identifies provenance expectations but does not authorize this Create skill to call tools. A bounded tradable view should already carry the narrow proof-series request declared by the expression plan; do not broaden it into an everything package. Preserve query hash, result ref, source, observed time, available time, interval, timezone, unit, currency, rights, and sealed/forming state.
4. Normalize each primitive without changing meaning:
   - OHLCV and price series remain observed points;
   - spreads, returns, ratios, revisions, and factors carry a declared formula and input refs;
   - news and policy catalysts remain events;
   - support, trigger, benchmark, and invalidation values remain levels;
   - compact values retain numeric and display forms.
   - deduplicated news clusters, samples, modeled quantiles, reconciled compositions, measured flows, ordered categories, and payoff structures become typed `evidence_objects`; never flatten them into decorative labels.
   For valuation and comparison requests, preserve metric name, numerator, denominator, trailing or forward period, accounting basis, currency treatment, share class, as-of time, and comparability. For a non-positive earnings denominator, return P/E as `N/M`; never replace it silently. For required news, preserve the event title, publisher or issuer, source type, publication time, URL-bearing source ref, and supported fact refs.
5. Create exactly one bundle requirement for each required plan request. Set `expression_plan_requirement_ref` to `<revision-qualified-plan-ref>#/data_requirements/<D-id>` and retain `request_class`, `required`, `material_to_claim`, and `expression_surfaces` exactly. Evaluate it as `available`, `degraded`, `missing`, or `not_applicable`. Do not silently substitute a proxy.
6. Choose `render_payload.mode`:
   - `series` when the required observed series is complete and the curve performs a real evidence job;
   - `key_numbers` when the judgment is supported by explicit values but no honest curve exists;
   - `evidence` when one validated structured evidence object is the main proof;
   - `mixed` when two distinct evidence groups share one decision job, such as an observed curve plus a news cluster or a level plus a distribution;
   - `qualitative` when the viewpoint can be expressed as a sourced logic, timeline, rail, or category diagram without market geometry.
7. If fallback-eligible data is missing, preserve the reason and select only the fallback allowed by the expression plan. Required material news, valuation, comparator, price-level, and settlement requests cannot degrade or fallback; record them as missing with no fallback and block the bundle. A text-only requirement remains first-class and is not forced into the visual payload.
8. Validate against the exact expression-plan artifact before passing the bundle downstream.

```bash
python3 scripts/validate_viewpoint_data_bundle.py viewpoint-data-bundle-v1.json \
  --expression-plan creator-expression-plan-v1.json
```

## Curve Eligibility And Window

An observed curve is the default evidence surface for a time-bounded trading view when it can show reaction, relative performance, confirmation, expectation change, or positioning pressure. It is not mandatory for point-in-time valuation math, a single decisive number, a categorical product map, or pure causal explanation.

- `event_reaction`: request the asset series around the sourced event plus the event marker; add volume only when the claim depends on participation or a volume-confirmed close.
- `relative_strength`: request synchronized primary and benchmark series on one baseline, plus a reproducible excess-return series when useful.
- `binary_level` or `confirmation`: request completed OHLCV bars, the exact level, close basis, and any volume rule. A future settlement region may be blank; never create a forecast price path.
- `forced_flow_loop`: request the actual flow, leverage, positioning, borrow, or liquidity series that supports the mechanism and a separate aligned price series when available. Price alone can show the reaction but cannot prove forced flow.
- `expectation_gap` or macro transmission: request the estimate, yield, spread, or fundamental history that changed and a separately scaled or normalized asset series when both are decision-relevant.

Fit context to the claim. For a five-session view, normally request 20-30 completed daily sessions ending at the decision cutoff, then carry the five-session deadline as a marker with no future observations. Use intraday bars only when the event time or close condition makes them material. Keep the solid observed series to the cutoff; use dashed geometry only for a conditional level, rule, or unobserved settlement window, never for an invented path.

## Autonomous Resolution

For a publish-candidate run, return unresolved primitive requests to the parent Create workflow, which may invoke Query and rerun this assembler with a new frozen bundle. This skill never calls a provider itself. Record every degradation internally.

- Repair entity, venue, quote-basis, interval, timestamp, and unit mismatches automatically when a durable mapping exists.
- When an optional series is unavailable, use the plan's `key_numbers` or `qualitative` fallback and continue.
- When a required quantitative primitive is unavailable and no honest fallback exists, block the affected visual job; do not ask the user to invent a number.
- When the creator explicitly used news, PR, a requested valuation, comparator, price level, or settlement deadline as a material premise, missing data blocks the bundle and finished candidate even if generic prose or a qualitative diagram remains possible.
- Never expose provider diagnostics, availability states, or fallback narration in the public candidate.

## Fast Fetch

- Build the exact primitive request list before calling a provider. Include the expression plan's narrow proof-series request when curve-eligible; do not fetch a broad quote, fundamentals, news, and OHLC package when the visual uses only one key number.
- Reuse complete OHLC bars after provider finalization. Refresh only the forming bar or latest quote.
- Run independent quote, event, series, and official-source requests concurrently, then normalize once.
- Cache by durable instrument ID, venue, interval, observation basis, provider/source hash, and time bucket. Preserve the original `observed_at` and `available_at` when a cached artifact is reused.
- If an optional primitive misses its latency budget, take the expression plan's declared key-number or qualitative fallback. Do not hold the other candidate branches open.
- Deduplicate identical requests across all three visual directions; one `ViewpointDataBundleV1` supplies the full candidate set.

## Hard Gates

- Never invent or interpolate an observed point, value, event, level, formula input, or timestamp.
- Declaration visuals cannot use information first available after `decision_cutoff_at`; tracking and replay bundles must say so explicitly.
- OHLC bars must satisfy price bounds; volume cannot be negative; only the final bar may be forming.
- Derived values and series require a declared formula, resolvable inputs, output unit, window, and limitations.
- Comparisons require compatible units, intervals, timestamps, and venues or an explicit normalization.
- News clusters require at least two deduplicated, source-complete events and an exact unique-source count. Article count never becomes importance, consensus, or magnitude.
- Distribution objects require the raw sample, `n`, one observation unit and window, population, weighting, quartile method, whisker rule, and outlier policy. A box view needs at least five observations; show raw dots below 20.
- Quantile fans require future time-indexed quantiles, a cutoff, horizon, method, model vintage, calibration, and formula. Quantiles cannot cross and must begin after the cutoff.
- Part-to-whole, additive bridge, and measured-flow objects must reconcile exactly within numeric tolerance and keep any residual visible.
- Payoff objects require source-linked instrument terms, expiry, premium, strike, quantity, domain, formula, and ordered calculated points. Do not present a terminal payoff as pre-expiry PnL.
- Every requirement must resolve to a real root requirement in the supplied expression plan and retain its class, required flag, materiality, and expression surfaces.
- Every visual requirement must retain its locked Query capability, exact tool provenance, and visual route hash. A result produced by an undeclared substitute tool blocks the bundle.
- News anchors require a source-linked event with publisher or issuer, source type, HTTP(S) URL, publication/availability time, and supported fact refs. Official events require an official source type.
- Valuation values require numerator, denominator, period, accounting basis, currency treatment, share class, and comparability metadata. Non-positive P/E denominators render as `N/M` with no numeric ratio.
- Comparator requests require at least two aligned values or series bound to primary and comparator instruments. Price levels require an explicit instrument-bound level and fact/source refs. Settlement references require an official deadline event and a sourced value or level.
- A proxy needs an explicit entity map and limitation; a symbol match alone is insufficient.
- Missing fallback-eligible required data with no permitted fallback blocks the bundle. Non-degradable material requests always block when unresolved and never carry fallback.
- Material evidence routed to `visual` must appear in `render_payload`; material evidence routed only to `text` need not be forced into it.
- Keep evidence and workflow states in the bundle. Public renderers receive only the selected display payload.

## Output

Return `ViewpointDataBundleV1` matching `references/viewpoint-data-bundle-v1.schema.json`.

## Resources

- `references/viewpoint-data-bundle-v1.schema.json`: normalized data and availability contract.
- `references/cuebook-data-supply.md`: Cuebook DB fields and visual-grammar supply map.
- `scripts/validate_viewpoint_data_bundle.py`: cutoff, OHLC, formula, reference, fallback, and state validator.
- `tests/test_validate_viewpoint_data_bundle.py`: data and fallback regressions.
