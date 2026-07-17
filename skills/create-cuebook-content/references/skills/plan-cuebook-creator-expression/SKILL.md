---
name: plan-cuebook-creator-expression
description: Plan a required MarketViewSemanticsV1 plus optional ResearchPackV1, TradingThesisV1, TradeLogicProfileV1, and ProfileV1 into CreatorExpressionPlanV1, the semantically locked shared bridge for original text and visual expression. Use after market-view meaning and ownership are known and before drafting a Cuebook post, thread, memo, article, caption, logic card, market figure, signal, or thesis chart; use especially to reconstruct a creator's trading logic, identify missing support, select a narrative engine, preserve internal authorship provenance, set VoiceSpec and anti-AI-language controls, build text and visual blueprints, or assess settlement eligibility. Do not use to research missing facts, create or adopt a trade, compile or settle a claim, render final copy or art, imitate a living commentator, or relabel an external source view as the current creator's experience.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Plan Cuebook Creator Expression

Turn one authoritative market-view semantic object into a shared expression contract. Keep meaning, action, ownership, and caveats fixed while giving text and visual renderers enough freedom to compose original work.

Read `references/expression-protocol.md` before creating or revising a plan. Read `references/visual-intent-routing-v1.md` and its registry before planning a visual. Read `references/archetype-routing.md` when routing a commentator-style market view or testing one of the 11 source archetypes.

## Workflow

1. Require one `MarketViewSemanticsV1`. Record its ref, canonical hash, decision cutoff, semantic claim refs, and source refs. Accept `ResearchPackV1`, `TradingThesisV1`, `TradeLogicProfileV1`, and `ProfileV1` only when compatible with the semantic input; block on conflict rather than merging incompatible meaning.
2. Copy the canonical claim, claim type, subject, comparator, direction, horizon, mechanism, source trade and settlement intent, action, supporting facts, caveats, and creator-owned experience refs into `meaning_fingerprint`. Separate the creator's explicit judgment from genuinely implied links and missing links. Never fill a missing link by silently changing the claim. Calculate the canonical hash and lock both meaning and authorship.
3. Select the authorship mode:
   - `creator_original`: preserve the current creator's seed; add no Cuebook idea substance.
   - `cuebook_assisted`: preserve a real creator seed; record each added `evidence`, `connection`, `countercase`, or `rule`; record every creator acceptance and rejection; state the idea delta internally; keep assistance attribution out of public body copy.
   - `source_transformation`: name the external source-view owner and require public source attribution. Keep current-creator trade and settlement intent absent unless a new creator-owned semantic input explicitly adopts them.
4. Choose one unified text-and-visual engine from the 11 ViewpointVisual grammars. Build it from the primitive vocabulary `reaction_test`, `parallel_contrast`, `category_reframe`, `forced_flow_loop`, `event_unwind`, `expectation_ladder`, `sentiment_witness`, `binary_level`, `derived_signal`, `analogy`, `decision`, and `caveat`; put the engine's mapped core primitive first and always include `caveat`.
5. For `analogy`, provide source domain, target domain, explicit mapping, and breakpoint. Treat analogy as explanation, never evidence.
6. Set `VoiceSpec`: language, register, energy, conviction, technicality, emotionality, compression, rhythm, humor, first-person stance and experience, technical terms, rhetorical devices, and optional profile rule refs. Enable anti-AI-language controls and ban at least `值得关注的是`, `核心逻辑在于`, and `从机制上看`; allow at most one `不是 A 而是 B` frame.
7. Declare root `data_requirements` before either surface blueprint. Give every request a stable `D*` ID, honest `qualitative`, `key_numbers`, or `series` mode, request class, required/material flags, `text` and/or `visual` surface, status, and fact/source lineage. Bind a creator-named news, PR, metric, comparator, level, or deadline to its exact ResearchPackV1 or market-data fact; do not reduce it to generic qualitative support. For a bounded tradable view, declare a narrow observed `market_series` request when price reaction, a trigger or close, relative performance, flow pressure, expectation revision, or market confirmation is part of the creator's reasoning. Route it to `visual` and mark it material only when the claim would change without it. Do not request a curve merely because the output is an image. For every visual requirement, bind one Query capability and its exact Cuebook MCP tool path in `visual_plan.execution_route.query_requests`. Reuse of an existing result is runtime fulfillment and does not change the locked capability.
8. Build the text blueprint with all six slots: `hook`, `proof`, `mechanism`, `action`, `caveat`, and `close`. Bind included slots to semantic or fact refs, and set `data_requirement_refs` to exactly the root requests routed to `text`. Complete the public reasoning as `judgment -> observed change -> market disagreement -> actor/action -> price transmission -> asset and horizon -> next observable`. Omit unavailable links instead of filling them with generic prose. Keep caveats and invalidation internal unless the user or selected format explicitly asks to surface them. Map action exactly from source trade intent and return two to four original public tags.
9. Build the visual plan with exactly the same primary engine as the narrative: `reaction_test`, `parallel_contrast`, `category_reframe`, `relative_value_trigger`, `policy_pivot`, `sentiment_witness`, `event_unwind`, `feedback_loop`, `binary_level`, `expectation_gap`, or `factor_rotation`. Lock one reader question and one primary communication job, then exactly three downstream targets: `fast_read`, `proof`, and `system`, each answering a different reader question. Name the intended evidence shapes without choosing a grid or palette. Select `viewpoint_static`, `viewpoint_static_plus_thesis_chart`, or `no_visual`; record the canonical Skill path and `resume_from_latest_valid_artifact` policy. Use optional `argument_grammar` only as a legacy six-layout hint. Set `data_requirement_refs` to exactly the root requests routed to `visual`, name every fallback-covered request ID, and set hard image text budgets. Prefer an observed curve when it can show the reaction, relative spread, confirmation level, expectation change, or positioning pressure that carries the view. Full OHLC, volume, indicators, or chart clocks require the thesis-chart detail route. When no honest ordered series exists or a static comparison proves the claim better, choose a supported key-number, comparison, timeline, distribution, news, or logic shape instead of inventing a curve.
10. Assess settlement eligibility without creating a contract. Keep source intent `none` fully ineligible; route only `candidate` or incomplete `explicit` intent to `../compile-cuebook-settlement-claim/SKILL.md`.
11. Apply the source/style firewall: require attribution and fact refs; separate fact from interpretation; keep anecdotes contextual or sentiment-only; prohibit unsupported first-person experience, living-creator imitation, signature phrasing, sentence-sequence copying, identity impersonation, backend vocabulary in public expression, and non-original composition.
12. Return `CreatorExpressionPlanV1` from `references/creator-expression-plan-v1.schema.json` and validate it:

```bash
node scripts/validate_creator_expression_plan.mjs creator-expression-plan-v1.json
```

To calculate the fingerprint hash while assembling a plan:

```bash
node scripts/validate_creator_expression_plan.mjs creator-expression-plan-v1.json --print-fingerprint-hash
```

When the source semantic hash is available independently, enforce it too:

```bash
node scripts/validate_creator_expression_plan.mjs creator-expression-plan-v1.json \
  --expected-source-semantics-hash sha256:<64-lowercase-hex>
```

## Hard Gates

- Preserve the meaning fingerprint. Permit only compression, reordering, translation, formatting, and visualization.
- Preserve authorship. Never convert a KOL source, public anecdote, or Cuebook addition into current-creator discovery or experience.
- Do not invent first-person buying, selling, hearing, seeing, loss, profit, portfolio, dashboard, or liquidation history.
- Do not add a `decision`, action slot, trade language, or settlement route when source intent is `none`. Preserve sentiment-only cases as no-trade evidence.
- Require a complete analogy mapping and breakpoint.
- Require included text slots and all available expression data to resolve to fingerprint or source lineage.
- Keep `visual_plan.grammar.primary` in the unified ViewpointVisual taxonomy and aligned with the narrative engine. Never promote an optional legacy `argument_grammar` to the public rhetorical contract.
- Require exactly one fast-read, proof, and system candidate job. The primary visual job must be one of them, and all three reader questions must differ.
- Cover every visual data requirement with exactly one compatible Query capability route. Tool IDs must come from the Cuebook MCP capability map; Create Skills do not call them directly.
- Keep the canonical Skill path and renderer pair aligned with the selected visual route. OHLC evidence requires `../render-cuebook-thesis-chart/SKILL.md` as the optional detail renderer.
- Keep requirements at root and route them explicitly to text, visual, or both. Never create a fake visual dependency for a text-only material premise.
- Declare missing key numbers or series as missing and fall back only for the exact eligible visual requirement IDs; do not fabricate comparison or price data to satisfy a layout.
- Required material news, valuation, comparator, price-level, and settlement requests cannot fallback. If unresolved, they require a `blocked` plan and a hard failure.
- Do not let a compact selector budget remove the actor, transmission, asset expression, horizon, or next observable from the canonical public post.
- Keep Cuebook additions, acceptance/rejection history, and idea delta in provenance fields. Public expression must not narrate the workflow or say that Cuebook supplied, inspired, completed, or improved the idea.
- Keep public tags to two through four, at most 24 characters each. Keep backend evidence/workflow terms out of all public expression guidance.
- Enforce image maxima: title 48, subtitle 96, node label 32, callout 56, source line 120, seven nodes, four callouts, and 320 total visible characters.
- Require an active visual fallback for each missing fallback-eligible visual requirement. Never invent a metric, use an unbridged proxy, promote anecdote to fact, or substitute a decorative chart.
- Require clean `ready` quality for `ready` or `frozen` plans; use `conditional` with a warning or `blocked` with hard failures otherwise.

## Downstream Routing

- Let the parent workflow execute `visual_plan.execution_route`. Reuse the latest valid Query bundle, data bundle, direction set, or selected visual before running a new stage; issue a Query call only for unresolved routed requirements.
- Pass the same plan and fingerprint hash to `../render-cuebook-market-post/SKILL.md` for reasoning-complete public text. Derive compact selector copy only when a downstream surface explicitly needs it.
- Pass the same plan and fingerprint hash to `../compile-cuebook-visual-argument/SKILL.md` before logic cards, market figures, or thesis charts when a graph-level argument is needed.
- Pass structured-media jobs to `../render-cuebook-market-media/SKILL.md` after its data and asset requirements are satisfied.
- Pass settlement candidates to `../compile-cuebook-settlement-claim/SKILL.md`; never mark a claim settled here.

Downstream outputs may compress or restyle the plan but must preserve the fingerprint, internal authorship/assistance provenance, external source ownership, action boundary, and required caveats. Cuebook assistance stays internal; external-source attribution remains public when required.

## Resources

- `references/creator-expression-plan-v1.schema.json`: authoritative output schema.
- `references/expression-protocol.md`: fingerprint, authorship, narrative, voice, text, visual, settlement, and firewall semantics.
- `references/visual-intent-routing-v1.md`: intent-first Query, Skill, evidence-shape, renderer, and shortest-path protocol.
- `references/visual-intent-route-registry-v1.json`: canonical candidate families, Query capability bindings, and visual Skill routes.
- `references/archetype-routing.md`: routing for the 11 reverse-engineered source archetypes.
- `scripts/validate_creator_expression_plan.mjs`: deterministic structural and cross-field validator.
- `tests/validate_creator_expression_plan.test.mjs`: 11-archetype and policy regression suite.
