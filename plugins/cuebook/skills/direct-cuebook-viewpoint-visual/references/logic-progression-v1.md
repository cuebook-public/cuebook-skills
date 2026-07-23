# Cuebook Logic Progression V1

## Purpose

`LogicProgressionV1` is the compact public argument behind a viewpoint visual. It prevents a polished image from jumping directly from news or a number to a trade conclusion.

It can compress a `VisualArgumentV1` graph or be assembled directly from a meaning-locked creator view. It never creates new market substance.

## Contract

### Pattern

Choose the closest reasoning pattern:

- `reaction_test`: pressure or bad news meets an unexpectedly resilient or weak price response;
- `event_transmission`: event leads through a mechanism to a market effect;
- `expectation_revision`: new evidence changes an estimate, expectation, or positioning baseline;
- `valuation_reframe`: a business or asset is evaluated under a different category or multiple;
- `relative_value`: two assets, instruments, regimes, or expectations are compared on one basis;
- `cycle_rotation`: a cycle changes leadership, earnings, supply, or capital allocation;
- `flow_pressure`: positioning, leverage, liquidity, or forced activity drives price behavior;
- `technical_trigger`: an observed level or structure changes the trade state;
- `scenario_branch`: different conditions lead to different observable outcomes;
- `strategy_ladder`: instruments or actions express one view with ordered risk;
- `custom`: source-faithful reasoning that does not fit the presets.

### Steps

Use three to six steps. Every step requires a binding.

Supported roles:

`context`, `event`, `evidence`, `mechanism`, `actor_action`, `tension`, `judgment`, `market_effect`, `trade_implication`, `catalyst`, `condition`, `invalidation`.

Supported states:

`observed`, `reported`, `derived`, `creator_view`, `conditional`.

Observed and reported steps require observed or reported source bindings. Derived steps name the relationship they infer. Creator views remain visibly owned judgments. Conditional steps never use observed geometry.

Before steps are assembled, declare all upstream lineage in the direction set's `input_refs`, `fact_refs`, and `data_requirement_refs`. A binding's `source_refs` may use only those declared refs. Factual or derived bindings include a fact or data-requirement ref; creator judgments use a declared input ref. Every binding also preserves the expression plan's `request_class` and `material_to_claim`, plus the visual decision `selected_for_display`.

### Links

Use directed links with one of these meanings:

`causes`, `enables`, `pressures`, `confirms`, `challenges`, `conditions`, `compares`, `leads_to`, `invalidates`.

The compact graph is connected and acyclic. Every adjacent pair in the public spine must have a direct link. A branch is allowed when the source genuinely branches; decorative arrows are not.

### Public spine

Choose three to five ordered step IDs that carry the public argument. The spine must include:

- one supporting role: context, event, evidence, mechanism, actor action, tension, catalyst, or condition;
- one conclusion role: judgment, market effect, trade implication, condition, or invalidation;
- at least one interior bridge between the first and final step.

Map `claim`, `because`, and `implication` to three distinct spine steps. This makes message compression auditable.

## Direction Route

Each visual direction records a `logic_route`:

- `entry_step_id`: the first thing the eye meets;
- `visible_step_ids`: the order the full composition reveals;
- `compact_step_ids`: the three to five steps preserved at 622 x 400.

Both routes must include the spine's first and final step plus an interior bridge. Reordering is allowed for evidence-first or reasoning-first art direction, but no route may hide the connection that makes the conclusion understandable.

Any binding marked both `material_to_claim: true` and `selected_for_display: true` is mandatory in every direction and must survive phone-scale display of the publication master. This includes selected material news anchors, valuation or comparison metrics, market series, price levels, official events, and settlement references. Omit it only by returning upstream and changing the selection; do not silently replace it with generic qualitative copy.

Attach `data-logic-step-id="LSTEP_..."` to the visible text, SVG group, curve, number, or qualitative geometry that expresses each routed step. Put each `data-binding-ref` on that element or a visible relevant descendant. Hidden nodes, empty markers, and unrelated metadata do not satisfy a route. One element may express one step; repeated decorations do not create extra steps and do not need binding markup.

## Route Compatibility

- `claim_first`: entry is `judgment`, `market_effect`, or `trade_implication`.
- `evidence_first`: entry is `event`, `evidence`, `tension`, `context`, or `catalyst`.
- `reasoning_first`: entry is `mechanism`, `actor_action`, or `tension`.
- `strategy_first`: entry is `trade_implication`, `condition`, or `invalidation`.
- `freeform`: entry may vary, but the compact route still preserves support, bridge, and conclusion.

## Example

For a HOOD infrastructure re-rating view:

1. `event`: tokenized securities become an active product surface;
2. `mechanism`: Robinhood can combine distribution, trading, and settlement;
3. `judgment`: the market may value HOOD as financial infrastructure;
4. `condition`: usage and monetization must appear in operating results.

A claim-first layout may read `3 -> 1 -> 2 -> 4`. An evidence-first layout may read `1 -> 2 -> 3 -> 4`. Both preserve the same source-linked argument.
