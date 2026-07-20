---
name: plan-cuebook-creator-expression
description: Build the release-grade expression contract after a Frame preview is selected, retaining one chosen visual job by default or fast-read/proof/system jobs for explicitly requested alternatives. Preserve meaning, ownership, evidence routes, voice, and text-image division of labor. Do not run this contract-heavy planner for a raw fast preview; do not research facts, create or adopt a trade, render final copy or art, create social variants, imitate a living commentator, or relabel an external view as the creator's experience.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Plan Cuebook Creator Expression

Turn one authoritative market-view semantic object into a shared expression contract. Keep meaning, action, ownership, and caveats fixed while giving text and visual renderers enough freedom to compose original work.

Read `references/expression-protocol.md` before creating or revising a plan. Read `references/visual-intent-routing-v1.md` and its registry before planning a visual. Read `references/archetype-routing.md` when routing a commentator-style market view or testing one of the 11 source archetypes.

## Workflow

1. Require one `MarketViewSemanticsV1`. Record its ref, canonical hash, decision cutoff, semantic claim refs, and source refs. Accept `ResearchPackV1`, `TradingThesisV1`, `TradeLogicProfileV1`, and `ProfileV1` only when compatible with the semantic input; block on conflict rather than merging incompatible meaning.
2. Copy the canonical claim, claim type, subject, comparator, direction, horizon, mechanism, source trade and settlement intent, action, supporting facts, caveats, and creator-owned experience refs into `meaning_fingerprint`. Separate the creator's explicit viewpoint, supported reasoning or hypothesis, observed facts, genuinely implied links, and missing links. The creator's viewpoint is the expression anchor, not an assertion to disprove by default. Never fill a missing link or resolve contradictory evidence by silently changing the claim. Calculate the canonical hash and lock both meaning and authorship.
3. Select the authorship mode:
   - `creator_original`: preserve the current creator's seed; add no Cuebook idea substance.
   - `cuebook_assisted`: preserve a real creator seed; record each added `evidence`, `connection`, `countercase`, or `rule`; record every creator acceptance and rejection; state the idea delta internally; keep assistance attribution out of public body copy.
   - `source_transformation`: name the external source-view owner and require public source attribution. Keep current-creator trade and settlement intent absent unless a new creator-owned semantic input explicitly adopts them.
4. Choose one unified text-and-visual engine from the 11 ViewpointVisual grammars. Build it from the primitive vocabulary `reaction_test`, `parallel_contrast`, `category_reframe`, `forced_flow_loop`, `event_unwind`, `expectation_ladder`, `sentiment_witness`, `binary_level`, `derived_signal`, `analogy`, `decision`, and `caveat`; put the engine's mapped core primitive first and always include `caveat`.
5. For `analogy`, provide source domain, target domain, explicit mapping, and breakpoint. Treat analogy as explanation, never evidence.
6. Set `VoiceSpec`: language, register, energy, conviction, technicality, emotionality, compression, rhythm, humor, first-person stance and experience, technical terms, rhetorical devices, and optional profile rule refs. Enable anti-AI-language controls and ban at least `值得关注的是`, `核心逻辑在于`, and `从机制上看`; allow at most one `不是 A 而是 B` frame.
7. Declare root `data_requirements` before either surface blueprint. Give every request a stable `D*` ID, honest `qualitative`, `key_numbers`, or `series` mode, request class, required/material flags, `text` and/or `visual` surface, status, and fact/source lineage. Bind a creator-named news, PR, metric, comparator, level, or deadline to its exact ResearchPackV1 or market-data fact; do not reduce it to generic qualitative support. For a bounded tradable view, declare a narrow observed `market_series` request when price reaction, a trigger or close, relative performance, flow pressure, expectation revision, or market confirmation is part of the creator's reasoning. Route it to `visual` and mark it material only when the claim would change without it. Do not request a curve merely because the output is an image. For every visual requirement, bind one Query capability and its exact Cuebook MCP tool path in `visual_plan.execution_route.query_requests`. Reuse of an existing result is runtime fulfillment and does not change the locked capability.
8. Build the Frame text blueprint with all six structural slots: `hook`, `proof`, `mechanism`, `action`, `caveat`, and `close`, but include only the slots the final body actually needs. Bind included slots to semantic or fact refs and set `data_requirement_refs` to exactly the root requests routed to `text`. Normally use 260–700 visible Chinese characters across three to five short paragraphs (roughly 120–300 English words), with a 1,200-character hard Frame ceiling. The body should carry the strongest observation, creator judgment, causal sequence, horizon, and one confirming or weakening next observable. The seven reasoning jobs are an internal completeness check, not seven mandatory public paragraphs. Finish sooner for a genuinely simple view; never pad with generic context or compress a material mechanism into a slogan. Omit unavailable links instead of filling them with generic prose. Keep caveats and invalidation internal unless they materially change the claim or the user explicitly asks. Map action exactly from source trade intent. Tags remain internal discovery metadata and are never part of the public Frame projection.
9. Build the paired release visual plan with the same primary engine as the narrative. A selected fast preview retains one chosen candidate job. An explicit alternative request locks exactly one `fast_read`, one `proof`, and one `system` target. Name evidence shapes without choosing a grid or palette, preserve the selected reader job, and never draw a fabricated future path.
10. Assess settlement eligibility without creating a contract. Keep source intent `none` fully ineligible; route only `candidate` or incomplete `explicit` intent to `$compile-cuebook-settlement-claim`.
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
- Preserve creator intent. Cuebook may strengthen, connect, narrow, or condition a creator-owned view; it may not silently replace it. A material evidence contradiction requires an explicit creator-facing decision.
- Do not invent first-person buying, selling, hearing, seeing, loss, profit, portfolio, dashboard, or liquidation history.
- Do not add a `decision`, action slot, trade language, or settlement route when source intent is `none`. Preserve sentiment-only cases as no-trade evidence.
- Require a complete analogy mapping and breakpoint.
- Require included text slots and all available expression data to resolve to fingerprint or source lineage.
- Keep `visual_plan.grammar.primary` in the unified ViewpointVisual taxonomy and aligned with the narrative engine. Never promote an optional legacy `argument_grammar` to the public rhetorical contract.
- Require either one selected candidate job or exactly one fast-read, proof, and system job for explicit alternatives. The primary visual job must be retained.
- Cover every visual data requirement with exactly one compatible Query capability route. Tool IDs must come from the Cuebook MCP capability map; Create Skills do not call them directly.
- Keep the canonical Skill path and renderer pair aligned with the selected visual route. OHLC evidence requires `$render-cuebook-thesis-chart` as the optional detail renderer.
- Keep requirements at root and route them explicitly to text, visual, or both. Never create a fake visual dependency for a text-only material premise.
- Declare missing key numbers or series as missing and fall back only for the exact eligible visual requirement IDs; do not fabricate comparison or price data to satisfy a layout.
- Required material news, valuation, comparator, price-level, and settlement requests cannot fallback. If unresolved, they require a `blocked` plan and a hard failure.
- Do not force every reasoning job into the body. Preserve the argument across the combined title/body/image Frame, with text and image doing complementary work.
- Keep Cuebook additions, acceptance/rejection history, and idea delta in provenance fields. Public expression must not narrate the workflow or say that Cuebook supplied, inspired, completed, or improved the idea.
- Keep two through four internal discovery tags, at most 24 characters each. Never render them in the public Frame. Keep backend evidence/workflow terms out of all public expression guidance.
- Enforce image maxima: title 48, subtitle 96, node label 32, callout 56, source line 120, seven nodes, four callouts, and 320 total visible characters.
- Require an active visual fallback for each missing fallback-eligible visual requirement. Never invent a metric, use an unbridged proxy, promote anecdote to fact, or substitute a decorative chart.
- Require clean `ready` quality for `ready` or `frozen` plans; use `conditional` with a warning or `blocked` with hard failures otherwise.

## Downstream Routing

- Let the parent workflow execute `visual_plan.execution_route`. Reuse the latest valid Query bundle, data bundle, direction set, or selected visual before running a new stage; issue a Query call only for unresolved routed requirements.
- Pass the same plan and fingerprint hash to `$render-cuebook-market-post` for Frame-sized body text. The candidate assembler derives the title and binds the selected image; no social or selector-only public derivative is created.
- Pass the same plan and fingerprint hash to `$compile-cuebook-visual-argument` before logic cards, market figures, or thesis charts when a graph-level argument is needed.
- Pass structured-media jobs to `$render-cuebook-market-media` after its data and asset requirements are satisfied.
- Pass settlement candidates to `$compile-cuebook-settlement-claim`; never mark a claim settled here.

Downstream outputs may compress or restyle the plan but must preserve the fingerprint, internal authorship/assistance provenance, external source ownership, action boundary, and required caveats. Cuebook assistance stays internal; external-source attribution remains public when required.

## Resources

- `references/creator-expression-plan-v1.schema.json`: authoritative output schema.
- `references/expression-protocol.md`: fingerprint, authorship, narrative, voice, text, visual, settlement, and firewall semantics.
- `references/visual-intent-routing-v1.md`: intent-first Query, Skill, evidence-shape, renderer, and shortest-path protocol.
- `references/visual-intent-route-registry-v1.json`: canonical candidate families, Query capability bindings, and visual Skill routes.
- `references/archetype-routing.md`: routing for the 11 reverse-engineered source archetypes.
- `scripts/validate_creator_expression_plan.mjs`: deterministic structural and cross-field validator.
- `tests/validate_creator_expression_plan.test.mjs`: 11-archetype and policy regression suite.
