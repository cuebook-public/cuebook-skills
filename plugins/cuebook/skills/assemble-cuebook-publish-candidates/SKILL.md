---
name: assemble-cuebook-publish-candidates
description: Assemble one locked Cuebook market view into exactly three fully calibrated, frontend-ready publishing candidates. Each candidate pairs a reasoning-complete PostV1 with a compact selector excerpt, a distinct validated static visual, and the same optional settlement semantics. Use when the product must generate finished choices in one pass without conversational revision, including creator Feed posts, KOL-style market commentary, trading views, and settleable viewpoint cards. Do not research a new thesis, change the meaning fingerprint, freeze unconfirmed settlement fields, publish externally, or expose failed drafts and internal calibration to users.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Assemble Cuebook Publish Candidates

Return three finished choices from one meaning-locked view. Each choice has two text surfaces: compact selector copy for scanning and a reasoning-complete canonical post behind `post_ref`. The user selects a candidate; all research, fact repair, preview compression, visual QA, and graceful degradation happen before the set reaches the frontend.

## Workflow

1. Require one validated `CreatorExpressionPlanV1`. Preserve its meaning fingerprint, creator ownership, direction, horizon, caveat, and settlement eligibility, including `metric`, `operator`, `threshold`, `deadline`, and `authoritative_source` requirement flags.
2. Read `references/autonomous-calibration-policy.md`. Resolve volatile facts, market data, product scope, legal caveats, and source conflicts through the owning research, data, policy, and settlement skills. Compile each material creator premise as a typed requirement: `news_anchor` or `official_event`, `valuation_metric`, `comparison_metric`, `price_level`, `market_series`, or `settlement_reference`. Bind every requirement to one or more anchor IDs. Current news or PR needs a linked anchor with `published_at`; metrics need a declared basis and numeric value or explicit `N/M`; price levels need value, observation time, basis, and session. Do not ask the user to repair routine evidence or layout issues.
3. Invoke `$render-cuebook-market-post` once in batch candidate mode. Return three reasoning-complete `PostV1` siblings from the same plan with distinct expression briefs:
   - `conviction`: judgment first;
   - `evidence`: strongest sourced proof first;
   - `catalyst`: next event, condition, or timing first.
   A different angle may be substituted only when one route does not fit the source.
4. Derive one launch selector excerpt from each completed post, then enforce the selector budget: headline at most 24 visible characters, body at most 160, close at most 36, no more than three short paragraphs, no more than three hard numbers, and at most 220 visible characters including tags. Do not overwrite or truncate the canonical `PostV1`; `candidate.copy` is a preview and `candidate.post_ref` resolves the complete argument.
5. Require one previewed `VisualDirectionSetV1` containing three passed directions, one shared logic progression, and current capture/render-audit reports for every full and compact derivative. Pair each copy with a structurally compatible route. Image copy is capped at 120 characters and follows its launch role contract.
6. Bind one optional `SettlementClaimV1` across all three candidates. Copy candidates may change rhetoric; they cannot change subject, direction, baseline, metric, operator, threshold, deadline, market session, or authoritative source. A bound claim requires complete `eligible` settlement semantics even while its candidate projection remains `needs_confirmation`.
7. Run internal calibration. Regenerate or compress any candidate that fails meaning fidelity, evidence integrity, human voice, three-second comprehension, compact rendering, or anti-default review. Failed attempts never enter the output.
8. Return `PublishCandidateSetV1` in `ready_for_selection`. The selector shows candidate label, compact copy, visual, linked evidence anchors, disclosures, and settlement line; opening or selecting a candidate resolves `post_ref` to the full reasoning-complete post. Internal repairs and calibration remain metadata. All three candidates preserve each required anchor's ID, `request_class`, source metadata, and typed payload even when only one layout displays it inside the image.
9. Treat candidate selection as content confirmation only. A `ready_for_selection` set must keep a bound settlement `needs_confirmation`; it cannot project `frozen`. Freeze only after a candidate is selected, a receipt exists, and settlement confirmation explicitly covers subject, direction, baseline, market session, metric, operator, threshold, deadline, and authoritative source.
10. Validate with `scripts/validate_publish_candidate_set.mjs`, including `--asset-root` when local previews are present.

```bash
node scripts/validate_publish_candidate_set.mjs publish-candidate-set-v1.json --asset-root ./output
```

## Autonomous Rules

- Default to exactly three candidates. Return `blocked` with zero candidates only when no source-faithful public output survives.
- Resolve routine missing context through Cuebook data first, then authorized inputs, official primary sources, and approved market-data providers.
- When optional requested data is unavailable, use the expression plan's honest fallback, remove the unsupported element, and continue when the claim remains intact. Missing material news, valuation or comparison metrics, price levels, market series, or settlement references block a selectable set.
- Do not display research notes, source counts, workflow states, confidence badges, or correction narration in public copy or art.
- No candidate may require a follow-up rewrite. Internally retry until all three pass or block the set.
- A selector excerpt that reads well but points to a preview-only or reasoning-incomplete `PostV1` is not a finished candidate. Repair the canonical post before assembly.
- Keep text and visual variation orthogonal: the three candidates share meaning while changing rhetorical entry and spatial composition.
- Calibrate shared facts once. Fan out copy, visual direction, and optional settlement from the locked fingerprint; retry only the failed branch.
- Reuse source, policy, instrument, and market snapshots while their freshness policy remains valid. Refresh only the stale primitive, never the full chain.

## Output Contract

Return `PublishCandidateSetV1` from `references/publish-candidate-set-v1.schema.json`.

## Resources

- `references/autonomous-calibration-policy.md`: source, repair, fallback, retry, and selection-confirmation rules.
- `references/publish-candidate-set-v1.schema.json`: frontend-ready candidate-set contract.
- `scripts/validate_publish_candidate_set.mjs`: copy-budget, fingerprint, visual, settlement, and state validator.
- `tests/validate_publish_candidate_set.test.mjs`: regression tests.
