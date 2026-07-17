---
name: build-market-research-pack
description: Build an evidence-backed ResearchPackV1 from a selected ContentOpportunitySetV1 candidate, validated ContentRecipeV1, CreatorFeedV1 records, Cuebook cue, creator claim, company or asset question, earnings event, source set, transcript, or trade-watch request. Use when finance content needs current news or PR anchors, source provenance, requested numbers, metric-basis checks, actual-versus-consensus comparisons, estimate revisions, price reaction, valuation, positioning, liquidity, scenarios, catalysts, and falsifiable thesis logic before rendering. Do not use for opportunity ranking, personal budgeting, portfolio execution, order placement, commentator profiling, or publication-ready social copy.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Build Market Research Pack

Turn a market question into a reusable research artifact. Keep reported facts, live observations, calculations, and hypotheses separate. A thin source produces a thin or conditional pack, not a confident thesis.

## Workflow

1. Normalize the request with `templates/brief-template.md`. For a selected opportunity and ContentRecipeV1, preserve feed/cutoff, recipe revision, anchor refs, selected ingredients, preparation controls, research requirements, disclosures, and expiry. Record the subject, assets, question, decision use, horizon, `as_of`, freshness window, supplied evidence, and allowed source boundary.
2. If the input is a Cuebook cue, run `$validate-cuebook-projection` first. Stop on `reject`; preserve every caution and repair in the research gaps.
3. For a Cuebook cue that is not rejected, run `$route-cuebook-narrative`. Use `event_type`, `reasoning_lenses`, and `required_context` to select research modules; the route does not approve evidence or publication.
4. Treat selected opportunity status as an editorial decision only. Re-verify every claim. Use trade-history refs solely for declared conflict checks or an authorized postmortem, never as evidence for a fresh thesis.
5. Read `references/research-modules.md` and select only the modules needed for the event, decision use, and recipe preparation. A recipe may request fresh market data or deeper research; it cannot lower source or falsifiability requirements.
6. Follow `references/source-policy.md`. Prefer primary evidence, preserve source identity and timestamps, and treat snippets or inaccessible pages as discovery leads only.
7. Build the source register and fact ledger before interpreting. Assign stable IDs. Tag each fact as `source`, `verified-live`, `derived`, or `hypothesis`.
8. For Cuebook inputs, preserve `consensusRead` as model-authored thesis context unless its value is explicitly grounded by an owned source event. A frozen, sourced `consensusPrior` may be used as a comparator. Never let an unsourced `consensusRead.pricedIn` stand in for external consensus.
9. Build hard comparators where relevant: actual versus consensus and prior; new guidance versus prior guidance and Street; estimate level versus its 7/30/90-day history; price reaction versus a benchmark and the correct event window.
10. Add only decision-relevant market context. For a trade watch, include data delay, session, spread or liquidity, volatility, and invalidation. For valuation, show a range and sensitivity rather than a false-precision point estimate.
11. Write the thesis after the evidence and a short pre-mortem. Name the mechanism, forced or exposed actors, horizon, counterevidence, and a condition that would make the view wrong.
12. Build at least two scenarios for a directional or trade-watch claim. Do not invent probabilities. Leave unavailable inputs in `gaps`.
13. Return `ResearchPackV1`, run `scripts/validate_research_pack.mjs`, and repair all errors. Review warnings deliberately.

Proceed with a conditional pack when non-critical fields are missing. Ask a question only when the missing answer would change source identity, asset mapping, decision use, or the safety boundary.

## Provider Routing

- Use Cuebook `search_news` first for a creator's current news, PR, regulator, or exchange premise. If one bounded Cuebook pass leaves a material gap and the runtime permits Web research, run one bounded Web batch of at most three targeted searches and three primary or authoritative sources; record `retrieved_via`, URL, and retrieval time.
- Use `list_filings` for reported financials and valuation requests. Use `get_market_state` for bounded current quote context and `get_candles` for OHLCV or synchronized returns. Run `$compute-cuebook-market-indicators` locally for declared derived calculations from frozen candle inputs.
- The renderer never calls providers. Research and data assembly resolve, source, and cache the inputs before copy or layout begins.
- Missing provider capability is a named gap. Web supplementation does not erase that gap or become Cuebook evidence, and it cannot be disguised as a successful qualitative result when the premise is material.

## Creator Claim Enrichment Fast Path

Read `references/claim-enrichment-fast-path.md` whenever raw creator language contains a current event, named news or PR premise, requested number, valuation multiple, comparator, relative-performance claim, market level, or settlement anchor.

- Compile the smallest exact support requests before searching. A request names the creator fragment it supports, entity, evidence job, metric or event definition, basis, freshness, and whether the premise is material to the claim.
- A material news premise requires one relevant linked anchor. Register news and company releases with `title`, public HTTP(S) `url`, `publisher`, `published_at`, `access: public`, and non-empty `fact_refs` that backlink to the source. Select by causal relevance and authority, then recency; a routine newest headline does not displace the event the creator is discussing.
- A material valuation premise requires a source-backed `numeric` value or explicit `N/M` state. Every valuation entry carries subject, numerator, denominator, period, accounting basis, currency treatment, share class, comparability, `as_of`, and `source_refs`; `N/M` also requires a reason and a null numeric value.
- Keep issuer PR and independent reporting visibly distinct. A company release proves what the company announced; it does not independently prove the announcement's economic consequence.
- A ready pack may not silently turn a missing material news or metric premise into qualitative prose. Keep the pack conditional or blocked and name the gap.

## Hard Gates

- Source-to-asset mismatch, direction conflict, or a missing proxy bridge: block the pack until repaired.
- Beat/miss language without a named consensus source and basis: remove it.
- Model-authored `consensusRead` presented as observed market consensus: remove it or relabel it `hypothesis`. Use a grounded `consensusPrior` only with its owned source snapshot.
- Guidance change without prior guidance, midpoint math, or period basis: mark the comparison incomplete.
- Current price, spread, funding, probability, flow, or estimate without source and `as_of`: unavailable, never remembered.
- Trade-watch output without liquidity, data-delay, and invalidation context: conditional at best.
- Investment claim with no counterevidence or falsifier: conditional at best.
- Creator claim using current news or PR as a material reason without a linked, timestamped event anchor: conditional at best.
- Creator claim using a valuation multiple or comparison without compatible numerator, denominator, period, accounting basis, currency treatment, share class, as-of time, and source refs: conditional at best; report `N/M` with a reason when the denominator makes the multiple undefined.
- Personalized sizing, order instructions, credential handling, or execution: out of scope.

## Research Boundary

- Use public or user-authorized sources only. Do not bypass access controls.
- Separate analysis from action. This skill can describe a setup or risk budget conceptually; it cannot place, cancel, or modify orders.
- Do not turn a social anecdote into market-wide evidence without breadth, positioning, or liquidation data.
- Do not treat source frequency as source authority.
- Return only the validated research pack. A downstream Create workflow may pass it to a renderer; this Query skill never invokes a Create skill.

## Output Contract

Return the shape defined by `references/research-pack-v1.schema.json`:

```json
{
  "schema_version": "research-pack-v1",
  "brief": {
    "subject": "",
    "assets": [],
    "question": "",
    "decision_use": "investment_research",
    "horizon": "",
    "as_of": "",
    "freshness_window": ""
  },
  "source_register": [],
  "fact_ledger": [],
  "comparator_table": [],
  "market_context": {
    "price_reaction": [],
    "positioning": [],
    "liquidity": [],
    "valuation": []
  },
  "thesis": {
    "stance": "watch",
    "claim": "",
    "horizon": "",
    "confidence": "low",
    "mechanisms": [],
    "forced_actors": [],
    "evidence_ids": [],
    "counterevidence_ids": [],
    "invalidation": ""
  },
  "scenarios": [],
  "catalysts": [],
  "gaps": [],
  "quality_report": {
    "decision": "conditional",
    "hard_failures": [],
    "warnings": [],
    "checks": [],
    "data_freshness": "mixed",
    "source_coverage": {
      "primary_source_present": false,
      "live_market_data_present": false,
      "independent_sources": 0
    }
  }
}
```

## Resources

- `templates/brief-template.md`: normalized research request.
- `references/source-policy.md`: source hierarchy, identity, basis, and freshness rules.
- `references/research-modules.md`: event-specific research modules and required fields.
- `references/claim-enrichment-fast-path.md`: creator-language triggers, exact support requests, news-anchor selection, and metric-basis resolution.
- `references/research-pack-v1.schema.json`: authoritative contract.
- `scripts/validate_research_pack.mjs`: deterministic cross-reference and safety checks.
- `tests/validate_research_pack.test.mjs`: regression suite.
- `evals/trigger_cases.json`: positive, neighboring, and adversarial routing cases.
- `evals/rubric.md`: research quality gate.
- `evals/failure_cases.md`: stable failure patterns.
