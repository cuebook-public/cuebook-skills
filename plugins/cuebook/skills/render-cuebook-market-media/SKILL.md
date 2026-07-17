---
name: render-cuebook-market-media
description: Render a validated CreatorExpressionPlanV1, ContentRecipeV1 structured-media output, ContentProgramV1 item, TradingThesisV1, Cuebook cue, or ResearchPackV1 into a policy-checked MediaPackageV1 for an article, Reddit post or comment, Xiaohongshu carousel, or finance short-video script. Use when the deliverable needs sections, cards, a bound ViewpointVisualV1, community rules, timed beats, voiceover, on-screen text, disclosures, or MediaFormatV1 rules while preserving a locked creator viewpoint. Do not use for plain X or Telegram posts, research without rendering, corpus collection, living-creator imitation, automated publishing, or personalized trading instructions.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Render Cuebook Market Media

Build one grounded cross-media artifact. Research controls what may be said, current platform rules control what may be distributed, MediaFormatV1 controls the container, and ProfileV1 may only tune supported choices.

## Workflow

1. Resolve the assigned structured-media output from ContentRecipeV1. Apply channel, format, count, target context, language, flavor, and selected media/profile refs. For coordinated outputs, call `$plan-market-content-program`, render only the assigned item, and preserve recipe/program/content-item/opportunity/input-artifact refs in `lineage`.
2. Run `validate-cuebook-projection`. A rejection produces only a blocked package. A caution permits conditional analysis, not directional certainty.
3. Run `route-cuebook-narrative` and preserve the complete RouteV1. An abstention produces a blocked package. Build or validate `ResearchPackV1` when the content needs comparators, valuation, positioning, liquidity, or several live facts.
4. Compile or validate `MarketViewSemanticsV1`, then build or import one `$plan-cuebook-creator-expression` result. Store its versioned ref and locked meaning fingerprint in `lineage.expression_binding`; its authorship mode, narrative primitives, VoiceSpec, visual grammar, caveats, and source-style firewall control every card, section, and beat.
5. When `TradingThesisV1` is supplied, validate it and preserve its versioned ref and canonical hash in `lineage.input_artifact_refs`. Lock its claim, direction, probability, horizon, invalidation, resolution criteria, and disclosures across every card, section, and beat.
6. Build the fact ledger before writing. Preserve ResearchPack fact IDs where supplied. Separate `source`, `verified-live`, `derived`, and `hypothesis` claims.
7. Validate optional `MediaFormatV1` and `ProfileV1`. Resolve conflicts in this order: semantic lock and evidence, current policy, MediaFormatV1, ProfileV1.
8. Read `references/channel-methods.md`. Check official platform and named-community rules live for any `publish_ready` request; record URLs and check time in `policy_gate`. Record position, commercial relationship, identity, and AI-assistance disclosure states separately from generic risk language.
9. Create an asset plan with explicit rights status; do not reuse source media merely because it is public. Resolve data through `$assemble-cuebook-viewpoint-data`, then call `$render-cuebook-viewpoint-visual` for the primary compact argument and preserve its ref in both lineage and `asset_plan.artifact_ref`. Route only a long price history to `$render-cuebook-thesis-chart`, and only an oversized branching argument to the legacy visual-argument and logic-card pair.
10. Draft the requested artifact. Bind each section, community body, card, chart, indicator, or video beat to fact or artifact IDs and return applied profile and media rule IDs. Render a `website` program item as `generic_long_form`.
11. Run separate semantic-lock, evidence, human-language, media-fit, rights, and policy passes.
12. Validate with:

```bash
node scripts/validate_media_package.mjs media-package-v1.json
```
13. Route the final `MediaPackageV1` to `$prepare-market-content-release`; this skill performs no account or platform operation.

## Input Contracts

- Cuebook cue or route packet: validate projection and fill only supported context.
- `ResearchPackV1`: preserve its quality decision, facts, gaps, counterevidence, and invalidation.
- `MediaFormatV1`: apply only grounded `cuebook_bridge.rules` and report their IDs.
- `ProfileV1`: apply only grounded profile bridge rules; never reproduce identity or signature language.
- `CreatorExpressionPlanV1`: preserve its meaning fingerprint, authorship ownership, rhetoric, image text budget, settlement eligibility, and forbidden transformations.
- `VisualArgumentV1` and `LogicCardV1`: consume as a bound semantic graph and rendered explanation; preserve node states, countercase, and settlement lineage.
- `MarketFigureV1`: consume as one data-led editorial figure; preserve curve grammar, series/marker/key-number refs, provisional states, news lineage, countercase, and settlement line.
- `ThesisChartV1` and `IndicatorPackV1`: consume as bound, sourced media assets; never redraw them into a different claim or hide provisional data state.
- `ViewpointVisualV1`: use as the default compact public argument; keep source refs in metadata and never leak workflow state, source counts, or settlement instructions into the image.

## Hard Gates

- Source ticker or entity mismatch, unsupported proxy, stale current claim, or blocked ResearchPack: block public content.
- RouteV1 abstention or unknown event classification: block the public package until repaired.
- Missing or changed expression fingerprint, ownership reassignment, or observation-to-trade upgrade: block until restored to the expression plan.
- Personalized order, sizing, leverage, stop, target-entry instruction, or credential handling: block.
- Seeking Alpha target: allow an internal evidence-backed outline only. Current contributor policy blocks AI-written or AI-edited submission copy.
- Reddit target without a named community and current rules snapshot: conditional at best; never automate posting, promotion, voting, or replies.
- Xiaohongshu or Douyin professional analysis or marketing with unknown qualification: conditional at best. Hidden sponsorship, unlicensed assets, or personalized advice: block.
- `publish_ready` with a policy check older than 30 days relative to `brief.as_of`: conditional until refreshed.
- A `realtime` package with no fact explicitly marked current: block or relabel as a historical replay. A historical replay must say so in public copy.
- Ready commentary, analysis, or marketing with unknown position or commercial relationship: conditional until resolved. Apply channel-specific identity and AI-assistance disclosure rules separately.
- Material claim, number, chart, card, or beat without fact IDs: repair or remove.
- A material market chart without `ThesisChartV1`, source provenance, observed interval, and sealed/forming-bar state: repair or remove. A forming bar must remain visibly provisional.
- A material data-led figure without `MarketFigureV1`, sourced points or formula, curve grammar, key-number refs, and visible provisional state: repair or remove.
- A material narrative diagram without `VisualArgumentV1`, source-linked observed nodes, visible uncertainty, and `LogicCardV1`: repair or remove.
- An indicator block without `IndicatorPackV1`, formula, lookback, source interval, and as-of time: repair or remove.
- Frozen thesis derivative with missing thesis ref/hash or changed claim, direction, probability, invalidation, or resolution criteria: block until restored to the canonical declaration.
- Source asset with unknown or forbidden reuse rights in a public package: replace with an original, owned, licensed, permissioned, or public-domain asset.
- Direct imitation, exact catchphrases, cloned cover wording, or identity performance for a living author: refuse that part and render original work.

## Writing And Media Rules

- Open on a concrete change, judgment, or tension. Give each section, card, and beat one job.
- Build the argument as `claim -> proof -> market consequence -> counterpoint -> next condition` when the evidence supports each step.
- Name who may need to revise, hedge, chase, cut, or wait. Keep hypotheses visibly conditional.
- Show the source and basis of important numbers. Use a source card, source list, or linked evidence field appropriate to the format.
- Write voiceover for the ear, on-screen text for a glance, and visual direction for proof. Do not repeat the same sentence across all three tracks.
- Keep community writing responsive to the actual question and rules. Plan substantive replies to counterevidence, not engagement bait.
- Avoid stock AI phrases such as `值得关注的是`, `从机制上看`, `核心逻辑在于`, `传导路径`, `验证路径`, and repeated `不是 A，而是 B` framing.
- End on the horizon, next catalyst, or observable that would move the thesis forward. Keep invalidation in structured risk metadata unless the creator explicitly selects a dedicated risk-boundary module; when shown, label it neutrally rather than as self-correction.

## Output Contract

Return `MediaPackageV1` using `references/media-package-v1.schema.json`. `lineage` binds the artifact to its program item, opportunities, expression plan, and visual artifacts; a thesis-derived package also sets `thesis_binding.thesis_ref` and `thesis_binding.canonical_hash`. `brief.temporal_mode` prevents stale events from masquerading as live calls, and `disclosure_state` keeps position, commercial, identity, and AI-assistance declarations machine-checkable. `publication_state` is the strictest state from the projection gate, RouteV1 abstention, ResearchPack quality, and policy gate.

For a blocked result, return `package.kind = blocked` and a repair reason. The only exception is a Seeking Alpha `internal_outline`, which may carry `article_outline` while publication remains blocked.

## Resources

- `references/channel-methods.md`: per-format structure and policy routing.
- `references/media-package-v1.schema.json`: MediaPackageV1 contract.
- `scripts/validate_media_package.mjs`: deterministic evidence, policy, timing, rights, and state checks.
- `tests/validate_media_package.test.mjs`: format and safety regressions.
- `evals/trigger_cases.json`: positive, neighboring, and adversarial routing cases.
