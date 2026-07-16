# Market View Semantics Taxonomy

Use this reference to compile source-faithful `MarketViewSemanticsV1` artifacts. The contract describes meaning and provenance; it does not endorse the source or create a trade.

## Source Inventory

Each source unit is independently attributable and independently complete.

### Functional roles

| Role | Meaning |
| --- | --- |
| `primary_view` | Unit whose market view is being compiled |
| `quoted_view` | View quoted or reported by another unit |
| `supporting_evidence` | Unit offered as support for a claim |
| `counterevidence` | Unit that limits or conflicts with a claim |
| `context` | Background that is not direct support |
| `creator_instruction` | Current creator's instruction or declared adoption |
| `methodology` | Research method or scorecard rather than a market claim |

### Source primitives

| Primitive | Typical contents |
| --- | --- |
| `official_event` | Filing, exchange notice, company announcement, regulation |
| `market_data` | Price, spread, volume, volatility, index, circuit breaker |
| `flow_positioning` | ETF flow, margin, leverage, liquidation, positioning |
| `on_chain` | Wallet, treasury, exchange, or blockchain flow |
| `social_sentiment` | Confession, anecdote, crowd language, viral comparison |
| `structural_thesis` | TAM, market structure, infrastructure, value capture |
| `sell_side_expectation` | Estimate, consensus, target, or margin revision |
| `technical_structure` | Gap, level, support, resistance, liquidation threshold |
| `proprietary_factor` | Internal ratio, dashboard, reconstructed proxy |
| `methodology` | Research protocol or evidence ladder |
| `creator_input` | Creator-authored instruction, correction, or adoption |
| `unknown` | Primitive cannot be established from the unit |

### Completeness

- `complete`: the full unit is available.
- `excerpted`: a bounded excerpt is available.
- `truncated`: the unit ends prematurely or is known to be cut off.
- `summary_only`: only a derived summary is available.
- `unavailable`: the referenced unit cannot be inspected.
- `unknown`: completeness itself cannot be established.

Aggregate `source_completeness.overall` deterministically:

- all `complete` -> `complete`;
- all `unknown` -> `unknown`;
- at least one `complete` plus any other status -> `mixed`;
- otherwise -> `incomplete`.

Do not treat inferred context as a continuation of an excerpted or truncated source.

## Speakers And Adoption

Speaker role and creator adoption answer different questions.

- `source_author`: authored a source unit.
- `current_creator`: owns the Cuebook output being assembled.
- `quoted_witness`: appears as testimony inside another source.
- `researcher`: supplies analysis or methodology.
- `unknown`: identity or role is unresolved.

Claim ownership modes:

| Mode | Meaning |
| --- | --- |
| `source_only` | Preserve as the source speaker's claim; current creator has not adopted it |
| `current_creator` | Originates with the current creator |
| `adopted` | Originates elsewhere and is affirmatively adopted by the creator |
| `shared` | Source and creator jointly own the expressed claim |
| `unattributed` | Ownership cannot be established |

`creator_adoption` records `none`, `reported`, `adopted`, `qualified`, `rejected`, or `not_applicable`. `surface_voice` records how a downstream renderer may voice it. A `source_only` claim may use source-third-person or quoted-first-person voice, but never current-creator first person.

## Claims

Make each claim atomic enough to assign one ownership record, certainty, and evidence scope.

### Speech acts

Trade speech acts require non-`none` posture:

- `trade_intent`
- `trade_report`
- `trade_recommendation`
- `conditional_trade`

Non-trade speech acts may have no posture:

- `market_observation`
- `causal_explanation`
- `forecast`
- `risk_warning`
- `sentiment_witness`
- `category_reframe`
- `valuation_judgment`
- `question`

### Rhetorical moves and benchmark cards

The benchmark set is the 11 corpus-card archetypes in `market-kol-source-reverse-engineering.md`.

| Card | Rhetorical move | Semantic center |
| --- | --- | --- |
| S1 | `bad_news_absorption` | Bad news stops moving price lower, suggesting seller exhaustion |
| X1 | `parallel_realities` | Anecdotal contrast across asset-class outcomes |
| X2/X3 | `category_reframing` | Surface product is reframed as a larger infrastructure category |
| X4 | `headline_vs_price` | Headline risk is compared with muted price response and a conditional spread trade |
| X5 | `policy_pivot` | A policy or flow change, not price alone, defines the turn |
| X6 | `capitulation_testimony` | Personal loss is used only as bounded sentiment evidence |
| X7 | `event_crowding_unwind` | A known catalyst is pre-bought and sold when it arrives |
| X8 | `feedback_loop_explainer` | Price, leverage, forced selling, and confidence reinforce one another |
| X9 | `technical_meme_warning` | Humor carries a conditional technical risk warning |
| X10 | `expectation_reset` | Strong absolute results disappoint perfection-level expectations |
| X11 | `proprietary_factor_rotation` | A custom crowding ratio motivates rotation to a cleaner trade leg |

Use `direct_observation`, `causal_chain`, `comparison`, `caveat`, or `none` when none of the benchmark moves is the right fit.

### Certainty and evidence scope

`certainty` captures the speaker's epistemic strength: `certain`, `likely`, `possible`, `speculative`, or `unspecified`.

`evidence_scope.basis` captures how the claim is supported. `evidence_scope.breadth` limits what the evidence can establish. A firsthand liquidation story can support `individual` sentiment and, with careful framing, a named `cohort`; it cannot establish `market_wide` sentiment by itself.

## Typed Subjects

Register each distinct entity or semantic node with one of:

`equity`, `index`, `crypto_asset`, `commodity`, `currency`, `fund`, `derivative`, `company`, `sector`, `venue`, `technology`, `policy`, `event`, `metric`, `signal`, `person`, `cohort`, `flow`, `market_state`, `geography`, `concept`, or `other`.

Do not collapse these roles:

- A spread threshold is a `metric`, not automatically a traded instrument.
- A policy action is a `policy` or `event`, not automatically a position.
- Forced selling is a `flow`; the affected equity or index is a separate subject.
- A proprietary indicator is a `signal`; its numerator and denominator are separate input subjects.

## Causality And Feedback

Create directed causal links between typed subjects and cite the claims that declare or support each edge. Use `causes`, `amplifies`, `dampens`, `enables`, `triggers`, `constrains`, `signals`, `reprices`, `precedes`, or `conditions`.

A directed cycle is a feedback loop. Every edge participating in a cycle must carry a `loop_id`, and that ID must resolve to a `feedback_loops` declaration whose link set actually contains a cycle. Record whether the loop was `explicit` in the source or `inferred` during compilation. Do not declare a loop merely because several factors move together.

## Phased Posture

Keep posture orthogonal to discourse. A source can explain a market without taking a position.

- `past`: prior holding, exit, or completed rotation.
- `now`: current action or stance.
- `on_condition`: action that activates only if a stated condition occurs.

Each phase has separate `trigger_subject_refs` and `trade_legs`:

- Triggers answer what must happen: a level, spread, policy action, event, or flow state.
- Trade legs answer what is bought, sold, held, avoided, or compared.

`on_condition` requires both condition text and at least one trigger subject. Trade actions require at least one trade leg. Never turn a mentioned trigger into a leg unless the source separately expresses that trade.

## Horizon Precision

Use the narrowest honest representation:

| Kind | Required representation |
| --- | --- |
| `unspecified` | `precision: none`; no manufactured timing |
| `instant` | One normalized observation time |
| `window` | Normalized start and end |
| `duration` | Numeric minimum, maximum, and unit |
| `event_bound` | Trigger or event subject plus the source's raw wording |
| `structural` | Qualitative raw wording for an open-ended structural view |

Precision values are `none`, `exact`, `bounded`, `approximate`, and `qualitative`.

## Proprietary Signals

Use `proprietary_signal` only when the source declares a formula or a reproducible formula shape. Preserve:

- the signal subject and name;
- operator and literal expression;
- typed formula inputs and their roles;
- output unit and segmentation;
- source and claim refs;
- replicability as `exact`, `partial`, or `opaque`.

A `ratio` requires at least one numerator and one denominator input. X11's memory leverage ratio is leveraged-vehicle volume divided by underlying-equity volume, segmented to separate Korea-local from global or ADR activity.

## Resolution Explicitness

- `none`: no criterion and no deadline.
- `partial`: exactly one of criterion or deadline is present.
- `implicit`: both are recoverable, but at least one is inferred rather than source-explicit.
- `explicit`: criterion and deadline are both present and both explicitly stated by the source.

A threshold without a deadline is not an explicit settlement claim. A horizon label without a success criterion is not one either. Preserve partial resolution here and let `compile-cuebook-settlement-claim` handle later contract construction and confirmation.
