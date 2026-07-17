---
name: assemble-cuebook-publish-candidates
description: Assemble one locked Cuebook market view into exactly three fully calibrated, frontend-ready Frame candidates. Each candidate exposes exactly one title, one body, and one paired image while retaining PostV1, evidence, settlement, disclosures, and calibration as backstage metadata. Use when Cuebook must give the creator finished Frame choices in one pass without conversational revision. Preserve and elevate the creator's viewpoint instead of defaulting to correction-first copy. Do not create social-platform variants, research a new thesis, change the meaning fingerprint, freeze unconfirmed settlement fields, publish externally, or expose failed drafts and internal calibration to users.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Assemble Cuebook Publish Candidates

Return three finished choices from one meaning-locked view. Every choice has one and only one creator-facing projection: `frame.title`, `frame.body`, and `frame.image_ref`. Internal copy splits, PostV1 refs, evidence anchors, settlement state, disclosures, labels, quality scores, and calibration remain available to the workflow but are never rendered as sibling public sections. The user selects a complete copy-to-image pair; all research, fact repair, visual QA, and graceful degradation happen before the set reaches the frontend.

## Workflow

1. Require one validated `CreatorExpressionPlanV1`. Preserve its meaning fingerprint, creator ownership, direction, horizon, caveat, and settlement eligibility, including `metric`, `operator`, `threshold`, `deadline`, and `authoritative_source` requirement flags.
2. Read `references/autonomous-calibration-policy.md`. Resolve volatile facts, market data, product scope, legal caveats, and source conflicts through the owning research, data, policy, and settlement skills. Compile each material creator premise as a typed requirement: `news_anchor` or `official_event`, `valuation_metric`, `comparison_metric`, `price_level`, `market_series`, or `settlement_reference`. Bind every requirement to one or more anchor IDs. Current news or PR needs a linked anchor with `published_at`; metrics need a declared basis and numeric value or explicit `N/M`; price levels need value, observation time, basis, and session. Do not ask the user to repair routine evidence or layout issues.
3. Invoke `$render-cuebook-market-post` once in batch candidate mode. Return three Frame-sized `PostV1` siblings from the same plan with distinct expression briefs:
   - `conviction`: judgment first;
   - `evidence`: strongest sourced proof first;
   - `catalyst`: next event, condition, or timing first.
   A different angle may be substituted only when one route does not fit the source.
4. Derive one internal `candidate.copy` split from each completed post, then enforce the Frame budget: headline at most 32 visible characters, body at most 220, close at most 56, no more than four short paragraphs, no more than three hard numbers, and at most 300 visible characters including hidden tags. This split exists for the frozen Frame assembly contract; it is not a second public text surface.
5. Require one previewed `VisualDirectionSetV1` containing three passed directions, one shared logic progression, and current capture/render-audit reports for every full and compact derivative. Pair each copy with a structurally compatible route. The image carries the observed evidence, two to four reasoning beats, and horizon/deadline marker when material; it does not duplicate the full body. Image copy is capped at 120 characters and follows its launch role contract.
6. Bind one optional `SettlementClaimV1` across all three candidates. Copy candidates may change rhetoric; they cannot change subject, direction, baseline, metric, operator, threshold, deadline, market session, or authoritative source. A bound claim requires complete `eligible` settlement semantics even while its candidate projection remains `needs_confirmation`.
7. Run internal calibration. Regenerate or compress any candidate that fails meaning fidelity, evidence integrity, human voice, three-second comprehension, compact rendering, or anti-default review. Failed attempts never enter the output.
8. Build `candidate.frame` deterministically: `title = copy.headline`, `body = trim(copy.body) + "\n\n" + trim(copy.close)`, `image_ref = visual.preview_ref`, and `alt_text = visual.alt_text`. Return `PublishCandidateSetV1` in `ready_for_selection`. The frontend renders only those four projection fields, with alt text attached to the image rather than as visible copy. Candidate labels, hidden tags, linked evidence anchors, disclosures, settlement lines, and calibration remain metadata. All three candidates preserve each required anchor's ID, `request_class`, source metadata, and typed payload even when only one layout displays it inside the image.
9. Treat candidate selection as content confirmation and an atomic copy-to-visual pairing. Move the candidate set and its `VisualDirectionSetV1` to `selected` together: `selected_candidate_id` must resolve to a candidate whose `visual.direction_ref` equals `selected_direction_id`, and its HTML/full/compact refs must remain byte-for-byte unchanged. A `ready_for_selection` set must keep a bound settlement `needs_confirmation`; it cannot project `frozen`. Freeze only after a candidate is selected, a receipt exists, and settlement confirmation explicitly covers subject, direction, baseline, market session, metric, operator, threshold, deadline, and authoritative source.
10. Validate with `scripts/validate_publish_candidate_set.mjs`, including `--asset-root` when local previews are present.

```bash
node scripts/validate_publish_candidate_set.mjs publish-candidate-set-v1.json --asset-root ./output
```

## Autonomous Rules

- Default to exactly three candidates. Return `blocked` with zero candidates only when no source-faithful public output survives.
- Resolve routine missing context through Cuebook data first, then authorized inputs, official primary sources, and approved market-data providers.
- When optional requested data is unavailable, use the expression plan's honest fallback, remove the unsupported element, and continue when the claim remains intact. Missing material news, valuation or comparison metrics, price levels, market series, or settlement references block a selectable set.
- Do not display research notes, source counts, workflow states, confidence badges, or correction narration in public copy or art.
- Do not display candidate labels, tags, evidence links, settlement panels, disclosures, quality scores, or platform names beside the Frame creative. The visible result is title, body, and one image only.
- Start from the creator-owned viewpoint and make it more precise, persuasive, and visually legible. Evidence may strengthen, connect, narrow, or condition the idea. Only a material contradiction justifies stopping for creator review; never silently replace the view with a safer or opposite one.
- After returning or selecting a candidate, the conversational handoff may briefly name what is strong in the creator's idea, state the concrete support Cuebook added, and suggest one useful next observation. Keep this encouragement outside `candidate.frame`.
- No candidate may require a follow-up rewrite. Internally retry until all three pass or block the set.
- A Frame projection that reads well but points to an incomplete `PostV1` or mismatched image is not a finished candidate. Repair the canonical artifacts before assembly.
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
