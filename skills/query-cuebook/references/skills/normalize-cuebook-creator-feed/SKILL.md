---
name: normalize-cuebook-creator-feed
description: Normalize a Cuebook export, API payload, database snapshot, or mixed batch of news, calendar events, narratives, trade ideas, and trade history into CreatorFeedV1. Use at the intake boundary of a Cuebook trading-content workflow when downstream skills need stable identities, source lineage, entity mapping, cutoff-safe timestamps, reuse permissions, disclosure state, deduplication, and explicit separation between evidence, hypotheses, ideas, executions, and outcomes. Do not use to select topics, research claims, draft content, publish posts, or calculate a public track record.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Normalize Cuebook Creator Feed

Create one immutable, cutoff-safe intake artifact. Preserve uncertainty and source semantics. A normalized record is eligible for triage; it is not automatically true, publishable, or investable.

## Workflow

1. Freeze `as_of`, `knowledge_cutoff_at`, input scope, creator/workspace references, locale, timezone, and the hash of the exact supplied payload.
2. Map company, instrument, sector, macro, commodity, fund, index, country, and crypto identities to stable `ENT_*` IDs. Keep symbols as dated aliases, never as durable identities.
3. Register every source revision before registering a content record. Preserve publisher, locator, content hash, observed time, authorization time, reuse rights, trust state, and an independent-source cluster.
4. Compute `available_at` as the earliest time the exact revision was both observed and usable under its access basis. Never replace it with a claimed publication time.
5. Normalize each of the five inputs according to `references/input-semantics.md`:
   - News provides discovery leads or attributable facts only through its source references.
   - Calendar records create timing and catalyst watches. A schedule does not prove an event occurred.
   - Narratives remain hypotheses, derived reasoning, or source-bound claims. Require a horizon, gaps, and falsifier.
   - Trade ideas remain prospective thesis snapshots. They do not prove fills, positions, returns, or public suitability.
   - Trade history supports conflict disclosure, authorized postmortems, and later reconciliation. It is not evidence for a fresh market thesis.
6. Deduplicate by exact revision/content hash first, then add `same_as` or cluster links for syndicated and near-duplicate records. Do not count syndication as independent confirmation.
7. Quarantine records with unresolved identity, future knowledge, retracted-only support, unknown access basis, invalid lineage, or missing required semantics. Preserve the raw locator and reason.
8. Set `quality_report.decision` to `ready`, `conditional`, or `blocked`. Unknown never defaults to `none`, `flat`, `public`, `authorized`, or `verified`.
9. Return `CreatorFeedV1`, run `scripts/validate_creator_feed.mjs`, and repair every error. Review warnings before opportunity selection.

## Stable Identity And Time

- Use a stable `CF_*` feed ID and type-prefixed object IDs. Keep each object ID stable across revisions.
- Use `revision_id = sha256:<64 lowercase hex>` over a canonical semantic payload plus lineage.
- Keep `observed_at`, `available_at`, event time, publication time, and ingestion time conceptually separate.
- An active record must have `available_at <= knowledge_cutoff_at`. Later revisions stay quarantined for a historical replay.
- Corrections append a new revision or relation. Never overwrite the revision used by an earlier decision.

## Hard Gates

- Missing or conflicting entity identity: quarantine or block.
- Active evidence supported only by a retracted source: block.
- Active record first available after the cutoff: block temporal leakage.
- Source access or reuse rights marked `unknown`: keep internal and make the feed conditional.
- Publicly reusable executed trade history without broker reconciliation: block that reuse.
- Material position or commercial relationship marked `unknown`: prevent a `ready` feed.
- `personalized_advice_allowed: true`: reject. This workflow never authorizes personalized trading instructions.

## Boundaries

- Do not browse for missing evidence in this skill. Record the gap in the query output; a later Query research pass or Create opportunity-selection pass may consume it.
- Do not rank topics, infer expected returns, choose a channel, or write copy.
- Do not expose private size, P&L, account identity, or confidential trade history downstream without explicit record-level permission.
- Do not treat model-authored narrative text as an external consensus source.

## Output Contract

Return the shape in `references/creator-feed-v1.schema.json`. The core sections are:

```json
{
  "schema_version": "creator-feed-v1",
  "feed_id": "CF_...",
  "as_of": "...",
  "knowledge_cutoff_at": "...",
  "source_register": [],
  "entities": [],
  "news": [],
  "calendar_events": [],
  "narratives": [],
  "trade_ideas": [],
  "trade_history": [],
  "links": [],
  "quality_report": {}
}
```

## Resources

- `references/input-semantics.md`: allowed and prohibited uses for each Cuebook input.
- `references/creator-feed-v1.schema.json`: authoritative contract.
- `scripts/validate_creator_feed.mjs`: deterministic lineage, cutoff, permission, reference, and count checks.
- `tests/validate_creator_feed.test.mjs`: regression suite.
- `evals/trigger_cases.json`: positive, neighboring, and adversarial routing cases.
- `evals/rubric.md`: intake quality gate.
- `evals/failure_cases.md`: stable failure patterns.
