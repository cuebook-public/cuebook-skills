---
name: render-cuebook-market-post
description: Render a validated CreatorExpressionPlanV1, MarketViewSemanticsV1, ContentRecipeV1 output, selected opportunity, TradingThesisV1, Cuebook cue, or ResearchPackV1 into original, reasoning-complete finance text for X, Telegram, Xiaohongshu, or a buy-side note. Use for one final post or three meaning-locked PostV1 siblings consumed by assemble-cuebook-publish-candidates when the product must offer finished choices without conversational revision. Preserve authorship, evidence, rhetoric, and internal assistance provenance while expressing the trading idea directly; derive compact selector copy separately instead of shrinking the final post into a preview. Use compile-cuebook-settlement-claim for a separate settleable viewpoint and prepare-market-content-release after approval. Do not use for research without writing, corpus collection, commentator profiling, copying a living author's voice, automated publishing, or invented market facts.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Render Cuebook Market Post

Turn a supported market event into a readable point of view. Evidence decides what can be said. The event and market tension decide the shape. A profile can tune selection and rhythm; it cannot supply facts or authorize imitation.

## Workflow

1. Resolve the assigned output and copy mode from ContentRecipeV1. Apply its channel, format, count, language, flavor, and selected profile/media refs without changing claim strength. Default a final public post to `reasoned_feed`; use `compact_preview` only for a selector, notification, or explicitly compact destination. If the recipe contains coordinated items, call `$plan-market-content-program` and render only the assigned item. Preserve recipe, program, content-item, opportunity, and input-artifact refs in `lineage`.
2. Run the cue through `validate-cuebook-projection`. A `reject` produces no public draft. A `caution` can produce only a watch, debate, or clearly conditional draft.
3. Run `route-cuebook-narrative` and preserve the complete RouteV1 as source triage. `abstain: true` produces no public draft. RouteV1 never owns the final rhetoric or visual grammar.
4. If `ResearchPackV1` is supplied, validate it with `$build-market-research-pack`, preserve its source and fact IDs, and copy `quality_report.decision` into `research_decision`. If the request needs decision-grade comparators, valuation, positioning, or liquidity that the cue does not contain, build a research pack before drafting.
5. Compile or validate `MarketViewSemanticsV1`, then plan the expression with `$plan-cuebook-creator-expression`. This neutral layer locks claim type, subject, comparator, direction, horizon, mechanism, evidence breadth, speaker ownership, action tense, and settlement eligibility before prose changes shape.
6. When `TradingThesisV1` is supplied, validate it first and store `THESIS_id@revision` plus its canonical hash in `lineage.input_artifact_refs`. Treat its claim, direction, probability, horizon, invalidation, resolution criteria, and disclosures as locked. A renderer may shorten them; it cannot improve or rewrite them.
7. Store `CEXP_plan_id@revision` and `meaning_fingerprint.fingerprint_sha256` in `lineage.expression_binding`. Follow its ordered narrative primitives, `VoiceSpec`, text blueprint, authorship mode, required caveats, and source-style firewall. If a downstream draft changes the fingerprinted claim, direction, horizon, trade intent, settlement intent, or ownership, block it.
8. Build or import the fact ledger before drafting. Give every usable fact an ID, evidence class, source URL, event time, observed time, freshness state, and allowed wording.
9. Resolve authorship mode from the expression plan. In `cuebook_assisted`, preserve `creator_seed`, evidence-linked additions, creator acceptance or rejection, `idea_delta`, and final judgment in internal `assisted_discovery`; force `public_attribution: false`. If no real creator seed exists, use generated or source-transformation disclosure; never invent first-person discovery.
10. Fetch only the small amount of live context still required by the expression plan. Timestamp every price, probability, spread, flow, or news update. Preserve whether a displayed current price is a live trade, last close, midpoint, or another quote type.
11. Draft the selected text blueprint. Do not regenerate the angle once the plan is locked. Make the creator's judgment, concrete change, market disagreement, forced actor, transmission, expression/horizon, and next observable legible even when adjacent jobs share a paragraph. Use sourced additions to repair missing links, then remove all research-process and assistance narration. Apply profile rules only when compatible with the source-style firewall; report which rules were used.
12. Check current destination policy and record position, commercial relationship, identity, and AI-assistance disclosure states. If the request needs sections, community rules, visual assets, voiceover, subtitles, or timed beats, hand the same locked expression plan to `$render-cuebook-market-media`.
13. Run four focused passes: semantic lock, evidence, human language, and platform fit. Then score with `evals/rubric.md` and repair every hard failure.
14. When returning structured output, run `scripts/validate_post_artifact.mjs` and resolve all errors. Warnings require a deliberate review.
15. When the user wants `正文 + 结算观点`, route the finalized prose to `$compile-cuebook-settlement-claim` only when the expression plan says settlement is eligible. Return separate `PostV1` and `SettlementClaimV1` artifacts; do not force contract fields into the draft.
16. When the user asks to stage, schedule, hand off, or publish it, route the final artifacts to `$prepare-market-content-release`; this skill performs no account or platform operation.

Read `references/rendering-method.md` for evidence classes, angle selection, profile use, and platform rules. Use `references/skill-matrix.md` as a market-situation reference, not as a substitute for source-first routing.

## Public Copy Modes

- `reasoned_feed` is the default final content unit. In Chinese, normally use 420-900 visible characters across five to eight short paragraphs. This is a reasoning budget, not a quota: finish sooner when every decision-relevant job is clear, and go longer only when the channel supports it. For X, use a thread when the account limit is unknown or the complete argument does not fit; do not silently amputate the mechanism.
- A reasoning-complete trading post lets the reader follow seven jobs: the judgment; what changed; what the market may be misreading; who may have to act; how that action reaches price or relative performance; why this asset and horizon express the view; and what observable comes next. Merge jobs naturally and vary their rhetorical order when the source supports it.
- `compact_preview` is a 220-character-or-shorter selector derived from a completed post. It may carry judgment, strongest proof, and one condition. It is never the canonical final post and cannot be the only text behind a selectable candidate.
- `detail_note` is for Telegram, Xiaohongshu, or a buy-side note that needs secondary evidence. Keep the same argument spine, then add only sourced comparators, caveats, and scenarios that change the decision.
- A source may support a shorter output than these defaults. Never pad with generic context, repeated warnings, engagement bait, or workflow narration.

## Autonomous Candidate Mode

When called by `$assemble-cuebook-publish-candidates`, use one batch generation pass to render exactly three passed, reasoning-complete `PostV1` siblings from the same expression fingerprint and fact ledger. Use distinct openings: conviction first, evidence first, and catalyst/condition first. A substitute angle is allowed when one opening does not fit the source.

- Return finished copy only. Do not expose outlines, rejected tensions, repair notes, or requests for another writing round.
- Keep every canonical `PostV1` in `reasoned_feed` mode unless the destination explicitly requires another final format. The candidate assembler derives a separate selector preview with a 24-character headline, 160-character body, 36-character close, three short paragraphs, three hard numbers, and 220 visible characters total including tags.
- Resolve routine volatile context through the research pack, Cuebook data, official primary sources, and approved live providers before writing. Repair or omit unsupported facts internally.
- Keep one judgment and one argument spine, then make the forced actor, transmission, market consequence, horizon, and material caveat understandable. Remove repeated setup before removing a reasoning link.
- Run semantic-lock, evidence, human-language, and compactness passes on every sibling. Regenerate a failed sibling; never send a weak option downstream merely to reach three.
- Preserve the same asset, direction, horizon, caveat, authorship, and settlement eligibility across all candidates.
- Run semantic-lock and evidence checks once across the batch, then score voice and compression per sibling. Regenerate only the sibling that fails.

## Hard Gates

- Source ticker or entity mismatch: reject until repaired or mapped to a closer asset.
- Proxy cue without an explicit target, repricing actor, and causal chain: reject.
- Narrow company or sector event forced into a broad ETF: reject or reroute.
- RouteV1 abstention or unknown event classification: block public drafting until the route is repaired.
- Missing or changed expression fingerprint, reassigned speaker ownership, anecdote upgraded into a cohort claim, or an observation upgraded into a trade: block until restored to the locked expression plan.
- Analyst target without a model reason: caution; do not turn it into a thesis.
- Unchanged guidance without a consensus comparison: caution.
- Beat/miss, revision, or reaction language without a comparable period, basis, source, and timestamp: remove or make conditional.
- Trade conclusion without a supported asset expression, horizon, and sufficient liquidity context: keep it as a watch, not an instruction. Invalidation may remain in the structured thesis or settlement artifact without appearing in body copy.
- Frozen thesis derivative with missing thesis ref/hash or changed claim, direction, probability, invalidation, or resolution criteria: block until restored to the canonical declaration.
- Current fact without source and `as_of`: remove it or mark it unavailable.
- Ready market commentary with unknown position or commercial relationship, or a ready policy snapshot older than 30 days: keep conditional until resolved.
- Material number absent from the fact ledger: remove it.
- A reasoning-complete post reduced to selector copy, or a post that omits the forced actor or transmission solely to satisfy a preview budget: reject and restore the full argument behind `post_ref`.
- A settlement footer with an invented or unconfirmed deadline, threshold, session, benchmark, or source: keep it separate in `needs_confirmation`; do not attach it as a ready claim.
- A public draft that narrates Cuebook assistance, idea completion, workflow steps, or accepted/rejected additions: remove that narration. Preserve it only in internal provenance fields.
- A post whose prose says wait, watch, avoid, or exit while its settlement claim says immediate long or short: block the pair until action state and claim agree.
- Direct imitation, exact catchphrases, or identity performance for a living author: refuse that part and render original analysis.

## Writing Rules

- Start with a concrete change, judgment, or tension. Avoid an abstract scene setter.
- Put one thought in each paragraph. Let the source fact and the market read occupy separate sentences.
- Name the actor who may need to revise, hedge, chase, cut, or wait.
- End on the horizon, next data point, catalyst, or market condition. Do not force an invalidation paragraph or generic warning.
- In Cuebook-assisted mode, keep the creator as the decision owner and the assistance record internal. The public draft must not say Cuebook supplied, inspired, completed, strengthened, or corrected the idea.
- Keep the language conversational without pretending to have private access or personal experience.
- Build the public argument as `claim -> proof -> market consequence -> next condition`. Do not add marketing CTAs or engagement bait unless explicitly requested.
- Make the market movement concrete: name the participant who is likely to hedge, reprice, rotate, chase, cut, or wait; name what exposure or balance-sheet constraint changes; then connect that action to the selected asset. Do not jump from news to direction in one sentence.
- Let the expression plan select the actual rhetorical order. `claim -> proof -> consequence -> condition` is a fallback, not a template to repeat across every post.
- Do not use `我认错`, `哪里认错`, `错了怎么办`, or equivalent self-correction headings. If a selected format explicitly requires a risk boundary, phrase it neutrally as a material condition and keep it separate from the creator's main argument.
- Avoid stock AI phrases such as `值得关注的是`, `从机制上看`, `核心逻辑在于`, `传导路径`, `验证路径`, and repeated `不是 A，而是 B` framing.
- Do not add a ticker, target, direction, motive, or hard number merely to make the post sound tradable.

## Output Contract

Return `PostV1`:

```json
{
  "schema_version": "post-v1",
  "lineage": {"artifact_id": "POST_...", "program_ref": null, "content_item_ref": null, "opportunity_refs": [], "input_artifact_refs": [], "thesis_binding": null, "expression_binding": {"plan_ref": "CEXP_...@r1", "fingerprint_sha256": "sha256:..."}},
  "brief": {"platforms": [], "content_class": "market_commentary", "temporal_mode": "realtime", "language": "zh-CN", "as_of": "", "reader": "", "decision_use": "", "research_pack_ref": null},
  "gate": {"decision": "pass | caution | reject", "checks": [], "repairs": []},
  "research_decision": "ready | conditional | blocked | null",
  "policy_gate": {"decision": "ready | conditional | blocked", "checked_at": "", "rules_checked": [], "repairs": []},
  "disclosure_state": {"position_status": "unknown", "position_text": null, "commercial_status": "unknown", "commercial_text": null, "identity_status": "unknown", "ai_assistance_status": "unknown", "public_disclosures": []},
  "route": {"schema_version": "route-v1", "taxonomy_version": "market-narrative-v2", "cue_id": "", "event_type": "", "event_confidence": 0, "candidates": [], "reasoning_lenses": [], "render_shape": "", "required_context": [], "hard_numbers": [], "abstain": false, "abstain_reason": ""},
  "fact_ledger": [
    {"id": "F1", "claim": "", "evidence_class": "source | verified-live | derived | hypothesis", "source_url": "", "as_of": "", "freshness": "current | stale | unknown"}
  ],
  "assisted_discovery": {"mode": "none | cuebook_assisted", "creator_seed": null, "cuebook_contribution": null, "creator_judgment": null, "idea_delta": null, "final_trade_idea": null, "fact_refs": [], "public_attribution": false},
  "angle": {"tension": "", "forced_actor": "", "why_selected": "", "profile_rule_ids": []},
  "drafts": {"x": "", "telegram": "", "xhs": "", "buy_side_note": ""},
  "draft_evidence": {"x": [], "telegram": [], "xhs": [], "buy_side_note": []},
  "watch_items": [],
  "quality_report": {"scores": {}, "hard_failures": [], "revisions": []},
  "publication_state": "ready | conditional | blocked"
}
```

Set `publication_state` to the stricter result from `gate.decision`, RouteV1 abstention, `research_decision`, and `policy_gate`, then apply disclosure guards. For a blocked result, leave all drafts empty and explain the repair. For a conditional result, use conditional language.

## Resources

- `templates/brief-template.md`: normalized request and source boundary.
- `references/rendering-method.md`: evidence, angle, profile, and platform method.
- `references/post-v1.schema.json`: structured output contract.
- `references/skill-matrix.md`: market-situation examples and context needs.
- `scripts/validate_post_artifact.mjs`: deterministic PostV1 invariant checks.
- `tests/validate_post_artifact.test.mjs`: regression tests.
- `evals/trigger_cases.json`: positive, negative, neighboring, and adversarial routing cases.
- `evals/expected_artifacts.json`: PostV1 contract expectations.
- `evals/rubric.md`: content quality gate.
- `evals/failure_cases.md`: stable regression cases from Cuebook.
