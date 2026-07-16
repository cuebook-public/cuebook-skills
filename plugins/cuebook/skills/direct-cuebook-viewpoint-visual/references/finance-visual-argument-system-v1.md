# Cuebook Finance Visual Argument System V1

## Purpose

This reference selects a truthful financial graphic before styling it. It adapts the Financial Times Visual Vocabulary's relationship-first method to trading theses, then adds market-specific argument archetypes, source gates, and compact Feed composition.

The routing order is fixed:

`reader job -> market relationship -> finance transform + comparison basis -> evidence contract -> chart decision -> visual grammar -> composition archetype -> surface`

Color, typography, and brand treatment come last. A beautiful grammar that answers the wrong financial question is still wrong.

## 1. Extract The Market Argument

Write the thesis as four source-linked beats:

1. **Observation**: what happened or what value was reported?
2. **Mechanism**: through which financial channel can it matter?
3. **Market judgment**: what is mispriced, crowded, vulnerable, or improving?
4. **Trade implication**: what direction, relative view, trigger, or watch condition follows?

Mark every beat `observed`, `reported`, `derived`, `creator_view`, or `conditional`. Never draw a causal connector between beats that are only adjacent in time.

### Freeze one intent lock

Before generating visual candidates, write one set-level `intent_lock` and keep it unchanged across every direction:

- `reader_job` and `reader_question`;
- one `analytic_relationship`;
- eligible `evidence_shape_refs`;
- one `finance_transform` such as `delta`, `spread`, `maturity_profile`, or `causal_path`;
- `comparison_basis`: unit, currency, period, benchmark, and normalization;
- `baseline_policy`: `zero`, `reference`, `indexed_100`, `cropped_disclosed`, or `none`;
- `chart_decision`: text, number, table, chart, diagram, or full OHLCV;
- renderer route and compact fallback.

Candidates may change reading entry, composition, hierarchy, and surface. They may not answer a different reader question, switch the calculation basis, widen the evidence set, or upgrade a diagram into a quantitative chart.

## 2. Select One Primary Market Relationship

The primary relationship is the reader's analytical question. It is not a visual style.

| Relationship | Reader question | Preferred evidence | Typical grammars |
| --- | --- | --- | --- |
| `deviation` | How far did reality move from an estimate, threshold, or prior value? | comparable scalar values | variance bar, bullet comparison, dumbbell |
| `magnitude` | How large is this value on one declared basis? | point metric | direct number with proportional context |
| `change_over_time` | What changed, when, and with what persistence? | ordered series | observed curve, event window, OHLCV |
| `ranking` | Which assets, instruments, or scenarios lead? | ordered categories | ranked bars, dot plot, lollipop |
| `distribution` | Is the risk concentrated, skewed, or outside normal range? | observation sample | dot strip, box plot, histogram |
| `correlation` | Do two measured variables move together? | synchronized paired observations | scatter or connected scatter |
| `part_to_whole` | What composes the total? | reconciled parts | stacked bar, dot matrix |
| `flow` | Where did measured capital, inventory, or volume move? | conserved measured flows | flow map, waterfall bridge |
| `relative_value` | Which asset or leg wins on the same basis? | synchronized pair or spread | indexed comparison, spread divergence, slopegraph |
| `term_structure` | How does price, yield, coupon, exposure, or maturity vary across tenor? | dated instruments | maturity profile, term-structure curve |
| `revision` | How did expectations or guidance reset across vintages? | revision series | revision ladder, slopegraph, variance bar |
| `event_reaction` | What changed around a dated event? | event plus observed series | event reaction, curve with events |
| `trigger_state` | Which observable level or state changes the trade? | level plus series or ordered state | threshold band, OHLCV trigger |
| `scenario_payoff` | How does outcome or payoff vary across states? | quantified scenarios or payoff series | scenario tree, fan, payoff curve |
| `causal_transmission` | Through which supported channel can an event reach price? | causal graph or qualitative relation | transmission gate, causal chain |

If no evidence contract supports the intended relationship, downgrade to a qualitative grammar or return upstream. Do not make a quantitative-looking substitute.

## 3. Classify The Trading Argument Archetype

Choose the archetype that explains why the fact matters to a trader.

| Archetype | Minimum logic | Preferred relationships | Visual emphasis |
| --- | --- | --- | --- |
| `forecast_surprise` | estimate -> actual -> asset-sign implication | deviation | forecast error and sign inversion |
| `guidance_reset` | prior base -> new guide -> estimate revision | revision, deviation | common baseline and revision gap |
| `valuation_reframe` | new capability/fact -> earnings or multiple basis -> rerating | revision, causal transmission | bridge from operating fact to valuation basis |
| `relative_trade` | common driver -> unequal exposure/reaction -> long/short view | relative value | synchronized comparison or spread |
| `crowding_unwind` | positioning/leverage -> forced flow -> amplified move | change over time, distribution, flow | crowding measure plus reaction |
| `event_driven` | dated event -> changed constraint -> repricing window | event reaction, causal transmission | event marker or gate, then market channel |
| `balance_sheet_pressure` | financing obligation -> cash-flow claim -> credit/equity pressure | term structure, magnitude | maturity and obligation profile |
| `term_structure_risk` | tenor structure -> refinancing/carry exposure -> vulnerability | term structure | maturity profile or curve |
| `technical_trigger` | observed series -> explicit level -> confirmation/invalidation | trigger state | chart and level own the canvas |
| `regime_shift` | old relationship -> break -> new behavior | change over time, correlation | before/after regime or rolling relationship |
| `capital_flow` | measured source -> destination -> price pressure | flow | conserved flow geometry |
| `news_synthesis` | deduplicated events -> common mechanism -> market judgment | event reaction, causal transmission | ordered evidence, not article-count decoration |
| `scenario_payoff` | state/underlying -> quantified outcome -> asymmetry | scenario payoff | branches, fan, or payoff curve |
| `strategy_ladder` | instrument/action order -> risk difference -> usage rule | ranking, scenario payoff | categorical ordering without fake numeric distance |

## 4. Choose A Composition Archetype

Composition answers how the argument is read at 670 x 264. It must not override chart integrity.

| Composition | Use when | Required spatial behavior |
| --- | --- | --- |
| `chart_stage` | one quantitative proof carries the thesis | evidence occupies 55-72% of the authored canvas; claim is a compact entry, not a competing poster |
| `editorial_split` | claim and proof need unequal but simultaneous weight | one stable alignment seam; 28-40% message, 60-72% proof |
| `comparison_axis` | two values or subjects share a basis | one common zero/baseline or declared normalization; labels attach directly to marks |
| `instrument_strip` | maturities, tranches, catalysts, or ordered instruments matter | time/order is the main axis; amount, rate, and state use separate channels |
| `threshold_field` | a level divides valid and invalid states | the threshold is visually dominant and directly labeled; future or conditional space is distinct |
| `transmission_gate` | a changed rule or bottleneck alters a mechanism | geometry visibly narrows, blocks, or redirects one supported path; stroke width stays uniform when magnitude is qualitative |
| `timeline_rail` | event order and reaction window matter | event time, availability time, and reaction window remain distinct |
| `distribution_field` | range, skew, or outliers matter | the distribution owns the field; summary copy stays peripheral |
| `scenario_field` | outcomes branch or fan | observed state and conditional future never share the same visual treatment |
| `network_field` | several supported actors/relations matter | only meaningful edges appear; no decorative node constellation |
| `editorial_statement` | creator judgment is itself the unit | one concise judgment plus one visible reason; no empty slogan poster |

### Set-level diversity

For the three user-facing candidates:

- use three different composition archetypes;
- at most one may be `editorial_statement`;
- at least one quantitative thesis must include `chart_stage`, `comparison_axis`, `instrument_strip`, `threshold_field`, or `distribution_field`;
- the proof candidate cannot use a giant number when a comparison, structure, series, or distribution is the actual proof;
- changing palette, radius, or headline placement never counts as another composition.

## 5. Financial Geometry Rules

### Decide whether a chart is earned

- Use `text` when the claim is qualitative and one sentence is clearer than geometry.
- Use `number` only when one value on a declared basis is the complete proof.
- Use `table` when exact lookup across several instruments matters more than shape.
- Use `chart` when a quantitative relationship is visible in position or length.
- Use `diagram` for sourced qualitative transmission with uniform connectors.
- Route full OHLCV, volume, and indicator work to `render-cuebook-thesis-chart`.

Never interpolate sparse instruments, manufacture intermediate points, or draw a quantitative-looking axis for a qualitative relationship.

### Common basis first

- Bars and columns begin at zero unless the grammar is explicitly a deviation/spread centered on a declared reference.
- Comparable marks share currency, period, adjustment, timezone, and normalization.
- Direct labels sit at endpoints or marks. Legends are a fallback for dense multi-series charts.
- A large number is annotation, not proof, when the conclusion depends on comparison or structure.

### One channel per meaning

- Position/length: quantitative magnitude.
- Stroke style: observed versus conditional, or actual versus estimate.
- Color: semantic state, with a non-color cue.
- Sequence: time, tenor, or ordered logic.
- Uniform connector: qualitative relationship only.
- Width/area: measured flow or reconciled part-to-whole only.

Do not encode amount and coupon in one ambiguous vertical axis. For a maturity profile, use bar length for notional and direct text/dot position for coupon in a separate aligned band.

### Sign inversion

Some positive surprises are negative for the traded asset. Make the inversion explicit:

`reported surprise (+) -> market interpretation (- for asset)`

Do not rely on red/green alone. Use direction, labels, or a turn in the reading path.

## 6. Compact-First Layout Contract

Compose the 670 x 264 reading first, then author the 1340 x 528 version with the same hierarchy.

- Claim: 1-2 lines, normally 14-23% of canvas height.
- Evidence field: normally 55-72% of usable area for a proof-led visual.
- Mechanism/implication: one short sentence or one attached annotation.
- Context/meta: at most 5% of visual attention; remove it when not decision-relevant.
- Brand safe zone: reserve 218 x 93 authored pixels at bottom right.
- Use one principal alignment axis and one secondary alignment at most.
- Keep at least 16 authored pixels between unrelated text groups and at least 8 between attached labels and geometry.
- Every visible label owns a mark, region, or logic step. Floating labels fail review.

## 7. Copy Order

The image should answer these in order, even when the entry point changes:

1. What is the view?
2. Which evidence earns it?
3. Through which financial mechanism does it matter?
4. What should be watched next?

Use the post body for nuance and sourcing. The image carries one claim, one proof, one mechanism, and one next observable only when each is necessary.

## 8. Hard Failures

- The chart is selected because it looks varied rather than because it answers the relationship.
- The headline occupies more visual weight than the evidence in a proof candidate.
- Multiple exact numbers are rendered as unrelated big-number tiles instead of one comparable structure.
- A maturity profile omits maturities, amounts, or basis while drawing precise bars.
- A forecast surprise does not distinguish estimate from actual.
- A causal diagram skips the market mechanism or uses unsupported arrows.
- A qualitative flow uses Sankey width, area, or thickness as if measured.
- Text labels collide with, float away from, or obscure their marks.
- Three siblings share the same top-headline, middle-graphic, bottom-condition skeleton.
