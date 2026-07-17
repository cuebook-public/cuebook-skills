---
name: select-cuebook-content-opportunities
description: Select, deduplicate, classify, and prioritize evidence-ready creator opportunities from CreatorFeedV1, optionally constrained by an ingredient-first or automatic ContentRecipeV1, as ContentOpportunitySetV1. Use when a Cuebook creator or workflow asks what is worth researching or publishing from a batch of news, calendar events, narratives, trade ideas, and authorized trade history, including daily desks, frontend ingredient selections, event lifecycles, corrections, postmortems, and evergreen ideas. Do not use to draft copy, research missing facts, predict engagement or returns, place trades, or approve publication.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Select Cuebook Content Opportunities

Turn one normalized feed into a small, explicit editorial queue. Selection means worth working on, not true, profitable, publishable, or likely to go viral.

## Workflow

1. Require a validated `CreatorFeedV1`. Freeze `decision_cutoff_at` to the feed knowledge cutoff and preserve its feed ID and input hash.
2. When ContentRecipeV1 is supplied, validate its catalog/cutoff, treat selected ingredients and preset limits as constraints, and preserve its recipe artifact as an input. The recipe cannot promote an ineligible record.
3. Cluster records by event, entity, mechanism, and source lineage. Merge syndication and duplicate angles before ranking.
4. Apply hard gates first: identity, cutoff, retraction, access, confidentiality, asset mapping, record status, disclosure, and duplicate state.
5. Classify each candidate as `researchable`, `conditional`, or `blocked`.
6. Assign one lifecycle and editorial job. Keep pre-event, breaking, post-event, evergreen, postmortem, correction, and risk-alert jobs distinct.
7. Record a categorical factor vector. Do not collapse it into an opaque score:
   - timeliness
   - evidence maturity
   - novelty
   - audience relevance
   - explainability
   - production fit
   - correction risk
   - conflict risk
8. Decide `selected`, `defer`, `merge`, `reject`, or `no_action`. Record stable reason codes, missing requirements, expiry, dedupe target, and a deterministic tie-break key.
9. Rank selected candidates with contiguous `selection_rank` values. Corrections and material risk alerts take `p0`; time-sensitive research takes `p1`; useful non-urgent work takes `p2`.
10. Recommend only the next work mode: quick post, research pack, content program, correction workflow, or postmortem. Channel and asset topology stay in ContentRecipeV1 and `$plan-market-content-program`.
11. Return `ContentOpportunitySetV1`, run `scripts/validate_content_opportunities.mjs` with the feed, and repair every error.

## Input-Specific Rules

- News can anchor a current opportunity when its source revision is usable and the asset map is resolved.
- Calendar records can create a pre-event opportunity. They cannot prove an event happened or determine direction.
- A narrative can seed a research question. A narrative-only candidate cannot be evidence-ready.
- A trade idea can seed a prospective watch. It cannot be promoted to an execution or performance claim.
- Trade history may be referenced only for `conflict_check`, `disclosure`, or an authorized `pre_registered_postmortem`. Historical winners never improve ranking.

## Hard Gates

- Selected candidate anchored to a quarantined, superseded, retracted, expired, or post-cutoff record: block.
- Selected candidate with `eligibility: blocked`, `permission_state: blocked`, or `disclosure_state: blocked`: block.
- Candidate expired at selection time: defer, reject, or no action.
- Duplicate candidate not merged into its canonical candidate: repair.
- `evidence_state: ready` based only on narratives, ideas, or scheduled calendar entries: downgrade.
- Postmortem without authorized history or a declared history use: block.
- Correction lacking `p0` priority and a correction reason: repair.
- Numeric composite score, future return, later price reaction, P&L, or engagement as a feature: reject the selection artifact.

## Boundaries

- Do not browse, calculate market facts, or fill research gaps in this skill.
- Do not write hooks, titles for publication, body copy, visual briefs, or SEO metadata. The candidate `title` is an internal desk label.
- Do not infer that a selected opportunity should be traded.
- Do not cherry-pick favorable trade history into the queue.

## Output Contract

Return the shape in `references/content-opportunity-set-v1.schema.json`:

```json
{
  "schema_version": "content-opportunity-set-v1",
  "opportunity_set_id": "OS_...",
  "feed_ref": "CF_...",
  "decision_cutoff_at": "...",
  "mode": "daily_desk",
  "candidates": [],
  "clusters": [],
  "selected_order": [],
  "quality_report": {}
}
```

## Resources

- `references/content-opportunity-set-v1.schema.json`: authoritative contract.
- `scripts/validate_content_opportunities.mjs`: deterministic feed-reference, ranking, dedupe, history-use, and gate checks.
- `tests/validate_content_opportunities.test.mjs`: regression suite.
- `evals/trigger_cases.json`: routing cases.
- `evals/rubric.md`: selection quality gate.
- `evals/failure_cases.md`: stable selection failures.
