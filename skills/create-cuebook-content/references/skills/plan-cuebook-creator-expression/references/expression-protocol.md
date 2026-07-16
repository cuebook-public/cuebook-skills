# Creator Expression Protocol

## Contents

1. Input authority
2. Authorship and assistance
3. Meaning fingerprint and semantic lock
4. Narrative engine
5. VoiceSpec
6. Text blueprint
7. Expression data requirements
8. Visual plan
9. Settlement eligibility
10. Source and style firewall
11. Validation states

## 1. Input Authority

`MarketViewSemanticsV1` is required and authoritative for meaning. Optional artifacts may add bounded detail but may not rewrite it:

- `ResearchPackV1` supplies source-linked facts and counterevidence.
- `TradingThesisV1` supplies an already-declared action, horizon, invalidation, and resolution contract.
- `TradeLogicProfileV1` supplies a classified strategy and public tags only when the semantic input already contains a trade intent.
- `ProfileV1` supplies creator preferences and exclusions. It never grants permission to imitate another creator or fabricate biography.

Use the most specific compatible artifact. Stop and return a blocked plan when optional inputs conflict with the required semantic input; do not average incompatible claims.

## 2. Authorship And Assistance

Choose one mode before planning voice:

- `creator_original`: the current creator owns the seed and final view; Cuebook contributes no idea substance.
- `cuebook_assisted`: preserve a real creator seed, record each Cuebook addition as `evidence`, `connection`, `countercase`, or `rule`, and let the creator explicitly accept or reject every addition.
- `source_transformation`: an external creator owns the source view. Produce an original, attributed transformation without adopting the source author's biography, discovery, trade, or identity.

For `cuebook_assisted`, require at least one accepted addition and a non-empty `idea_delta`, but set `public_attribution_required: false` and `public_attribution_line: null`. The contract still records the seed, additions, and creator decisions for audit. Public copy presents the completed reasoning directly and never narrates how Cuebook supplied, inspired, completed, or improved the idea.

For `source_transformation`, set `source_view_owner.owner_type` to `external_creator`, name the owner in the public attribution line, and keep current-creator trade and settlement intent at `none`. If the current creator later adopts a trade, capture that adoption in a new creator-owned semantic input and use `creator_original` or `cuebook_assisted`.

Addition IDs must be unique. Accepted and rejected IDs must be disjoint and together cover every Cuebook addition. Do not silently drop a rejected addition from the record.

## 3. Meaning Fingerprint And Semantic Lock

Copy these values from `MarketViewSemanticsV1` before planning expression:

- canonical claim and claim type;
- primary subject, comparator, direction, and horizon;
- mechanism;
- trade intent, settlement intent, and action;
- semantic claim refs, supporting fact refs, required caveats, and creator-owned experience refs.

Copy the canonical input hash into `source_semantics_sha256`. Never generate a replacement hash from the expression plan.

Calculate `fingerprint_sha256` over the complete `meaning_fingerprint` object with `fingerprint_sha256` omitted. Serialize as UTF-8 JSON with keys sorted, no insignificant whitespace, and Unicode preserved. Prefix the lowercase digest with `sha256:`. The bundled validator exposes the same calculation with `--print-fingerprint-hash`.

Set the semantic lock to strict:

- Allowed: compress, reorder, translate, format, and visualize.
- Forbidden: change claim, direction, or horizon; add a trade or settlement; remove a caveat; upgrade certainty.
- Also forbid reassignment of authorship and keep `authorship_locked` true.
- Require every downstream artifact to retain and verify the fingerprint hash.

A valid hash makes the plan tamper-evident. Before calculating it, the planner must compare every fingerprint field with the referenced `MarketViewSemanticsV1`; the hash cannot repair a bad projection.

## 4. Narrative Engine

Choose one unified rhetorical engine for both text and visual planning. Put its mapped core primitive first:

| Unified engine | First primitive |
| --- | --- |
| `reaction_test` | `reaction_test` |
| `parallel_contrast` | `parallel_contrast` |
| `category_reframe` | `category_reframe` |
| `relative_value_trigger` | `reaction_test` |
| `policy_pivot` | `forced_flow_loop` |
| `sentiment_witness` | `sentiment_witness` |
| `event_unwind` | `event_unwind` |
| `feedback_loop` | `forced_flow_loop` |
| `binary_level` | `binary_level` |
| `expectation_gap` | `expectation_ladder` |
| `factor_rotation` | `derived_signal` |

Compose that engine from the ordered primitive vocabulary:

| Primitive | Use |
| --- | --- |
| `reaction_test` | Interpret price or spread behavior after a known catalyst. |
| `parallel_contrast` | Compare simultaneous but meaningfully different subjects or outcomes. |
| `category_reframe` | Replace a shallow category with a better structural category. |
| `forced_flow_loop` | Explain a reflexive leverage, liquidation, or liquidity loop. |
| `event_unwind` | Explain pre-positioning and post-catalyst selling. |
| `expectation_ladder` | Separate absolute performance from successively higher expectations. |
| `sentiment_witness` | Use a human account only as sentiment evidence. |
| `binary_level` | Show two paths around one explicit market level. |
| `derived_signal` | Explain a reproducible formula or constructed indicator. |
| `analogy` | Translate a mechanism across domains without claiming identity. |
| `decision` | Express an action already present in source intent. |
| `caveat` | Preserve the limiting condition or source boundary. |

Use no more than one instance of a primitive kind. Include the mapped core primitive and a `caveat` in every plan. Include `decision` only when trade intent is not `none`.

Every analogy requires:

1. a named source domain and target domain;
2. at least one explicit source-to-target mapping;
3. a breakpoint that says where the comparison stops working.

Do not use an analogy as proof. Its claim refs must already exist in the meaning fingerprint.

## 5. VoiceSpec

Set independent controls for register, energy, conviction, technicality, emotionality, compression, rhythm, humor, person, technical terms, and rhetorical devices. Apply `ProfileV1` rules by reference rather than copying a creator's signature phrases.

`first_person_stance` controls statements such as "I think" or "I prefer." `first_person_experience` controls biographical claims such as "I bought," "I was liquidated," or "my portfolio."

- With no `creator_owned_experience_refs`, set first-person experience to `forbidden` and firewall mode to `forbid`.
- With creator-owned experience refs, use `preserve_creator_owned_only`; cite exactly those refs wherever the experience appears.
- A public commentator's anecdote is not the current creator's experience.

Conviction may never exceed source certainty merely because a profile prefers assertive language.

Enable `anti_ai_language` in every VoiceSpec. At minimum ban `值得关注的是`, `核心逻辑在于`, and `从机制上看`; add locale-equivalent stock phrases when useful. Permit at most one `不是 A 而是 B` frame across all public expression guidance so `category_reframe` remains available without becoming a repetitive template. Vary openings and compose original sentences rather than substituting another commentator's catchphrases.

## 6. Text Blueprint

Plan all six slots: `hook`, `proof`, `mechanism`, `action`, `caveat`, and `close`.

- Include hook, proof, mechanism, caveat, and close.
- Bind each included slot to semantic claim or supporting fact refs.
- Use proof for source-linked facts, not workflow status or social popularity.
- Use mechanism for the causal bridge, not a second hook.
- Reconstruct the trading idea in seven passes: creator judgment, observed change, market disagreement, actor under pressure, transmission into price or relative performance, chosen asset and horizon, and next observable. Mark each pass as explicit, genuinely implied, supplied by evidence, or unavailable before writing guidance.
- Supplement only the missing links that materially improve the decision. A supplement needs a fact or source ref and may narrow confidence; it may not add a new trade, target, deadline, or personal experience.
- Keep addition history, idea delta, workflow status, and Cuebook attribution out of all public text slots.
- Keep invalidation and countercase in the semantic contract. Surface either in body copy only when explicitly requested by the user or selected format; never frame it as `我认错`, `哪里认错`, or `错了怎么办`.
- Set `text_blueprint.data_requirement_refs` to every root data requirement whose `expression_surfaces` contains `text`, including requirements that have no visual role.
- Map action exactly from source trade intent:

| Source trade intent | Action kind |
| --- | --- |
| `none` | `omit` |
| `observe_only` | `observe` |
| `avoid` | `avoid` |
| `conditional` | `conditional_trade` |
| `explicit` | `trade` |

When action is omitted, leave purpose and refs empty, set its character budget to zero, and use `source_has_no_trade_intent` as the omission reason. Do not turn an explanatory close into an implied buy or sell recommendation.

Return two to four original public tags. Each tag is at most 24 characters and must describe reader-facing strategy, mechanism, or format.

## 7. Expression Data Requirements

Declare data requirements once at root `data_requirements`; never bury the authoritative request objects inside `visual_plan`. Give every requirement a stable `D*` ID, one honest mode, a request class, purpose, `required`, `material_to_claim`, one or both `expression_surfaces`, availability status, and fact/source lineage.

Use these class-to-mode boundaries:

| Request class | Allowed mode |
| --- | --- |
| `qualitative_evidence` | `qualitative`, `key_numbers`, or `series` |
| `news_anchor`, `official_event` | `qualitative` |
| `valuation_metric`, `price_level` | `key_numbers` |
| `comparison_metric` | `key_numbers` or `series` |
| `market_series` | `series` |
| `settlement_reference` | `qualitative` or `key_numbers` |

Available requirements need fact and source refs. Missing requirements keep both lists empty. Material requirements must also be required. A text-only material premise uses `expression_surfaces: ["text"]`, appears in `text_blueprint.data_requirement_refs`, and does not need a fake visual requirement.

`text_blueprint.data_requirement_refs` and `visual_plan.data_requirement_refs` must exactly match their routed surfaces. A downstream bundle refers back to one of these root objects as `<plan-ref>#/data_requirements/<D-id>` and must retain its request class, required flag, materiality, and surfaces.

Required material `news_anchor`, `valuation_metric`, `comparison_metric`, `price_level`, and `settlement_reference` requests are non-degradable. If one is missing, use plan state `blocked` with a hard failure. Never place its ID in fallback coverage.

## 8. Visual Plan

Read `visual-intent-routing-v1.md` before choosing any visual grammar or renderer. The intent layer locks five things once:

1. the reader question and primary communication job;
2. one fast-read, one proof, and one system candidate job;
3. the evidence shapes the view can honestly support;
4. the Query capability and exact MCP tool path for every visual data requirement;
5. the shortest registered Skill and renderer path.

Use `resume_from_latest_valid_artifact`: a compatible frozen Query bundle, data bundle, direction set, or selected visual skips the stages it already satisfies. `query_requests` describe how to fill a gap; they do not authorize a Create Skill to call read tools directly.

Keep layout, palette, typography, motif, and exact chart grammar out of this intent route. The design director owns those high-freedom choices after evidence shapes are resolved.

Set `visual_plan.grammar.primary` to the same unified engine already selected in `narrative.primary_engine`:

| Grammar | Visual job |
| --- | --- |
| `reaction_test` | Show catalyst, expected reaction, actual reaction, and read-through. |
| `parallel_contrast` | Place simultaneous subjects or outcomes in parallel. |
| `category_reframe` | Move from the surface category to the structural category. |
| `relative_value_trigger` | Show two legs, the relative measure, and the trigger. |
| `policy_pivot` | Show the feedback pressure and the policy condition that can turn it. |
| `sentiment_witness` | Present an attributed human signal beside its evidentiary limit. |
| `event_unwind` | Show pre-positioning, event arrival, unwind, and possible reset. |
| `feedback_loop` | Show reinforcing actor, flow, price, and confidence effects. |
| `binary_level` | Show two paths around one explicit level or condition. |
| `expectation_gap` | Compare absolute result, consensus, and priced expectation. |
| `factor_rotation` | Define a factor and show why it favors one expression over another. |

Use optional `argument_grammar` only when a legacy renderer needs one of `causal_chain`, `metric_thesis`, `scenario_tree`, `evidence_balance`, `comparison`, or `price_timeline` as an internal layout hint. It never replaces `visual_plan.grammar.primary`.

Route each visual requirement by ID in `visual_plan.data_requirement_refs`. Root requirements use one honest data mode:

- `qualitative`: sourced events, mechanisms, attributed testimony, or categorical relationships;
- `key_numbers`: bounded metrics, levels, spreads, estimates, formula inputs, or triggers;
- `series`: real time series or comparison series.

For fallback-eligible missing visual data, choose a non-`none` trigger and strategy and list exactly those missing IDs in `fallback.applies_to_requirement_refs`. A fallback must preserve the fingerprint and may never invent a metric, substitute an unbridged proxy, promote an anecdote to market fact, or use a decorative chart that implies evidence. Non-degradable material IDs are never fallback-eligible.

Treat image text values as hard maxima, not targets:

| Slot | Hard maximum |
| --- | ---: |
| Title | 48 characters |
| Subtitle | 96 characters |
| Node label | 32 characters |
| Callout | 56 characters |
| Source line | 120 characters |
| Nodes | 7 |
| Callouts | 4 |
| Total visible text | 320 characters |

Downstream renderers may tighten these budgets for language, dimensions, and platform.

## 9. Settlement Eligibility

This plan assesses eligibility; it does not compile or settle a claim.

- `settlement_intent: none` requires `ineligible`, no claim ref, no route, and no settlement clock.
- `candidate` may route to `../../compile-cuebook-settlement-claim/SKILL.md`; list missing metric, operator, threshold, deadline, or authoritative source fields.
- `explicit` is `eligible` only when all five elements exist. Otherwise use `blocked` and list each missing element.

Never infer a deadline, threshold, or operator merely because the source contains a directional opinion.

## 10. Source And Style Firewall

Keep facts source-linked and separate them from interpretation. Treat unverified anecdotes as context or sentiment only. Require source attribution and keep verbatim reuse within the declared maximum of 25 words or less.

Always disable:

- living-creator imitation;
- signature-phrase reuse;
- source sentence-sequence copying;
- identity impersonation;
- unsupported first-person experience;
- unverified anecdote as proof.

Always require original composition. Style controls may shape register, compression, or rhythm, but may not reproduce a living commentator's signature phrases, sentence order, recurring hook, or identity presentation.

Do not place backend evidence or workflow vocabulary in public tags, narrative frames, or visual messages. The validator bans English terms such as `observed`, `derived`, `inferred`, `provisional`, `conditional`, `confirmed`, `pending`, and `unresolved`, plus the corresponding configured Chinese workflow phrases. Describe the market meaning directly.

## 11. Validation States

- `ready` or `frozen`: use clean `ready` quality with no warnings or failures.
- `conditional`: use `conditional` quality and at least one warning.
- `blocked`: use `blocked` quality and at least one hard failure. Missing non-degradable material requests require this state.

Run the validator before routing to text or visual renderers. A downstream renderer must reject a mismatched fingerprint hash even when the rest of the plan looks plausible.
