# Cuebook Composition Primitives V1

Use these as visual words, not templates. First read `viewpoint-expression-system-v1.md`, then resolve the candidate job, evidence shape, and compatible grammar through `viewpoint-expression-registry-v1.json`. A composition combines one hero primitive with zero to two supporting primitives. New content-derived primitives are allowed when their bindings, evidence shape, and reading order are explicit.

## Message primitives

| Primitive | Best use | Required input | Avoid |
|---|---|---|---|
| `statement` | conviction, reframe, contrarian take | creator judgment | shrinking it into a card title |
| `key_number` | valuation, gap, threshold, shock | sourced value, unit, as-of | decorative statistics |
| `quote_fragment` | firsthand witness or creator voice | authorized excerpt or creator text | treating anecdote as market proof |
| `action_line` | explicit trade implication | creator-owned action or condition | adding advice the creator did not give |

## Evidence primitives

`news_cluster`, `distribution`, `fan_range`, `part_to_whole`, `quantified_flow`, and `payoff` require a matching validated `EOBJ_*` in `ViewpointDataBundleV1`; these primitives cannot be assembled from loose copy inside the layout Skill.

| Primitive | Best use | Required input | Avoid |
|---|---|---|---|
| `observed_curve` | price, estimate, flow, spread, positioning | ordered sourced observations | smoothing or forecast extension |
| `level` | trigger, invalidation, target, settlement threshold | value, unit, relation | unlabeled horizontal decoration |
| `before_after` | expectation gap or regime shift | comparable values or states | fake quantitative area |
| `contrast` | asset, regime, or reaction comparison | named subjects and common basis | equal generic cards |
| `event_marker` | catalyst or unwind | event time and source | implying exact timing when absent |
| `news_cluster` | several related catalysts or reports | two or more bound events with source and time | duplicated headlines used to fake density |
| `distribution` | dispersion, skew, percentile, or outlier | a declared comparable sample | turning one value into a box plot or histogram |
| `fan_range` | sourced forecast or scenario quantiles | quantiles, horizon, and method | deriving a forecast cone from historical OHLC |
| `part_to_whole` | exposure, allocation, revenue, or ownership mix | common denominator and reconciled parts | decorative donut or unreconciled areas |
| `quantified_flow` | measured capital, volume, inventory, or allocation movement | synchronized flows with one unit | using width to imply qualitative influence |
| `spread` | relative value, divergence, or pair performance | synchronized subjects and explicit formula | mismatched baselines or currencies |
| `payoff` | instrument outcome across underlying scenarios | contract terms, expiry, and calculated series | generic risk/reward curve |
| `full_chart` | OHLC, volume, indicator, or multi-level setup | complete chart artifact | reducing a trading setup to a sparkline |

## Reasoning primitives

| Primitive | Best use | Required input | Avoid |
|---|---|---|---|
| `causal_path` | event transmission | linked claims with state | unsupported arrows |
| `tension` | pressure versus response | two explicit qualitative sides | bars that imply invented magnitude |
| `loop` | reflexive flow or liquidation | closed sourced/derived edges | decorative circles |
| `branch` | conditional scenarios | distinct conditions and outcomes | presenting a forecast as observed |
| `ladder` | risk, instrument, or action progression | ordered categories and basis | pretending category spacing is numeric |
| `timeline` | catalyst, reaction, next condition | ordered events/stages | fabricated dates |
| `transmission_gate` | before/after conversion or blocked mechanism | named actor, mechanism, and consequence | a decorative central divider |
| `news_constellation` | several reports converging on one judgment | bound event set and grouping logic | equal news cards with no synthesis |
| `scenario_field` | conditional outcomes and observable branches | explicit conditions and outcomes | invented probabilities |
| `strategy_map` | ordered instruments or actions | ordering basis and creator-owned choice | hidden advice or numeric spacing for categories |

## Spatial skeletons

These are starting geometries. They may be bent, cropped, overlapped, or combined.

- **Poster**: statement owns 55-70% of the canvas; one proof mark interrupts it.
- **Split tension**: two unequal fields collide across one seam or axis.
- **Evidence stage**: curve or number owns the canvas; annotation sits directly on the evidence.
- **Processional**: reading path moves through time or causality with one clear destination.
- **Ladder or terrain**: ordered choices occupy one continuous slope, rail, or field.
- **Margin note**: a dominant visual is challenged or qualified by one editorial annotation.
- **Freeform motif**: geometry comes from the thesis itself and has no reusable stock skeleton.

## Direction generation

Generate directions across reader tasks, not decoration:

1. **Fast read**: maximize conviction and memorability. The reason is one supporting mark.
2. **Proof**: let a valid number, curve, spread, event reaction, distribution, or comparison carry the claim.
3. **System**: reveal the news synthesis, mechanism, flow, scenario, trigger, cycle, or strategy path.

Use three different `primary_grammar` values and at least two evidence-shape signatures. When three or more selected material news events exist, the system candidate uses `news_synthesis`.

When a route has no valid data, change the route. Never fill the absence with a fake sparkline.

## Three-second language

At 670 x 264, a reader should be able to say one of these:

- “Bad news landed, but price did not react.”
- “The product launch is only a catalyst; earnings and price confirm.”
- “These four instruments express the same cycle at increasing risk.”

If the summary becomes “there are several boxes and arrows,” the visual has failed.
