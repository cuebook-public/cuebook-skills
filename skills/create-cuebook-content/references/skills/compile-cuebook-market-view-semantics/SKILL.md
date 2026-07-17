---
name: compile-cuebook-market-view-semantics
description: Compile source posts, excerpts, creator notes, CorpusV1 items, research packs, or market viewpoint drafts into source-faithful MarketViewSemanticsV1. Use before thesis, trade-logic, visual-argument, post, or settlement compilation when Cuebook must preserve source-unit roles and completeness, speaker attribution and creator adoption, speech acts, rhetorical moves, typed subjects, claim certainty and evidence scope, causal and feedback-loop structure, phased posture, trigger-versus-trade-leg semantics, horizon precision, proprietary formulas, and resolution explicitness. Do not use to invent creator conviction, broaden anecdotal sentiment, settle outcomes, or turn quoted/source-only views into first-person creator claims.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Compile Cuebook Market View Semantics

Normalize what a market source actually says without upgrading its voice, evidence, trade intent, or settlement precision.

## Workflow

1. Read `references/market-view-semantics-taxonomy.md` before classifying a new source family.
2. Segment the input into independently attributable `source_units`. Preserve each locator, functional role, source primitive, speaker, and completeness. Do not merge a truncated post with inferred background into a complete unit.
3. Register speakers and the optional current creator. Treat adoption as an explicit field, never as a writing convenience.
4. Register typed subjects before claims. Give triggers, metrics, events, flows, cohorts, and tradeable instruments separate subject IDs.
5. Extract atomic claims. For each claim, record source refs, subject refs, speech act, rhetorical move, ownership, creator adoption, render voice, certainty, and evidence scope.
6. Encode causal links between subjects. If links form a directed cycle, assign their `loop_id` and declare the matching feedback loop.
7. Encode posture by phase: `past`, `now`, and `on_condition`. Keep `trigger_subject_refs` separate from `trade_legs`; a watched level or policy event is not automatically a position.
8. Preserve horizon precision. Use `unspecified` instead of manufacturing dates. Add a proprietary signal only when the source supplies a formula or enough structure to preserve it.
9. Record resolution as `none`, `partial`, `implicit`, or `explicit`. Mark it explicit only when both criterion and deadline are explicitly supplied.
10. Validate the artifact and repair every structural or semantic error before handing it downstream.

## Hard Gates

- Keep `source_only` claims out of `current_creator_first_person` voice.
- Allow `posture.explicitness: none` for non-trade speech acts. Require posture for trade speech acts.
- Bound `sentiment_witness` evidence to an individual or cohort; never promote it to market-wide evidence.
- Give every directed causal cycle a declared `loop_id`.
- Require criterion and deadline, both source-explicit, for `resolution.explicitness: explicit`.
- Keep source units, speakers, claims, subjects, causal links, loops, and formula inputs referentially closed.
- Preserve incomplete inputs as incomplete even when the interpretation is high confidence.

## Output

Return one `MarketViewSemanticsV1` object matching `references/market-view-semantics-v1.schema.json`.

```bash
node scripts/validate_market_view_semantics.mjs market-view-semantics-v1.json
```

A conditional or blocked artifact may still be structurally valid. Keep its limitations in `quality_report`; do not hide them in prose.

## Resources

- `references/market-view-semantics-v1.schema.json`: authoritative output shape.
- `references/market-view-semantics-taxonomy.md`: classification rules and 11 benchmark mappings.
- `scripts/validate_market_view_semantics.mjs`: structural, referential, graph, and cross-field validator.
- `tests/validate_market_view_semantics.test.mjs`: benchmark and hard-gate regressions.
