<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/compile-cuebook-market-view-semantics/` from the public Skill directory.
# Compile Cuebook Market View Semantics

Normalize what a market source actually says without upgrading its voice, evidence, trade intent, or settlement precision.

## Workflow

1. Read `references/modules/compile-cuebook-market-view-semantics/references/market-view-semantics-taxonomy.md` before classifying a new source family.
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

Return one `MarketViewSemanticsV1` object matching `references/modules/compile-cuebook-market-view-semantics/references/market-view-semantics-v1.schema.json`.

```bash
node references/modules/compile-cuebook-market-view-semantics/scripts/validate_market_view_semantics.mjs market-view-semantics-v1.json
```

A conditional or blocked artifact may still be structurally valid. Keep its limitations in `quality_report`; do not hide them in prose.

## Resources

- `references/modules/compile-cuebook-market-view-semantics/references/market-view-semantics-v1.schema.json`: authoritative output shape.
- `references/modules/compile-cuebook-market-view-semantics/references/market-view-semantics-taxonomy.md`: classification rules and 11 benchmark mappings.
- `references/modules/compile-cuebook-market-view-semantics/scripts/validate_market_view_semantics.mjs`: structural, referential, graph, and cross-field validator.
