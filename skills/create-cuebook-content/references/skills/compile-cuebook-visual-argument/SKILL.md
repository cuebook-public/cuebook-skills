---
name: compile-cuebook-visual-argument
description: >-
  Compile a Cuebook PostV1, selected public CorpusV1 item, CreatorViewIntentV1, TradingThesisV1, ResearchPackV1, SettlementClaimV1, or bounded creator narrative into VisualArgumentV1: an evidence-linked graph of events, mechanisms, actor actions, market effects, metrics, conditions, countercases, price levels, scenarios, and settlement semantics. Use before turning narrative logic or a verified commentator-post idea into Cuebook causal cards, metric panels, scenario maps, evidence balances, comparison visuals, or thesis charts. Do not render graphics, invent links, imitate a commentator, rewrite creator ownership, calculate market data, publish content, or place trades.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+ for validators.
---

# Compile Cuebook Visual Argument

Create the shared semantic layer behind every Cuebook opinion visual. A renderer should choose layout and typography; this skill decides what the argument actually contains and which parts are observed, derived, conditional, or unresolved.

## Workflow

1. Accept one creator-owned view plus available `PostV1`, selected `CorpusV1` item, `CreatorViewIntentV1`, `TradingThesisV1`, `ResearchPackV1`, and `SettlementClaimV1` artifacts. Preserve artifact refs and creator text verbatim. A commentator's source post remains a source artifact; do not relabel it as the current creator's text.
2. Fix the visual decision cutoff. Exclude later observations from evidence supporting the original declaration; later data may enter a tracking revision.
3. Write one compact headline and thesis. Record Cuebook's contribution separately from the creator's words for internal lineage; public renderers must omit that production note.
4. Build a directed argument graph:
   - observed event or evidence;
   - mechanism or actor action;
   - market consequence;
   - condition, countercase, or invalidation;
   - optional settlement node.
5. Attach fact and source refs to every observed claim. A derived mechanism cites the facts it connects. A hypothesis stays visibly conditional.
6. Extract only explicit metrics and market levels. Preserve value, unit, as-of time, formula/source, and provisional state. Never infer a target or invalidation for visual symmetry.
7. Add scenarios only when the narrative genuinely branches. Keep conditions and outcomes separate.
8. Bind a settlement contract when the content is settleable. Preserve its exact deadline and success condition.
9. Recommend one primary visual grammar and no more than two alternatives:
   - `causal_chain`: event -> mechanism -> market consequence;
   - `metric_thesis`: judgment supported by two to four meaningful metrics;
   - `scenario_tree`: conditional branches with distinct observable outcomes;
   - `evidence_balance`: supporting evidence versus countercase;
   - `comparison`: two assets, instruments, companies, or regimes;
   - `price_timeline`: market path, trigger, target, invalidation, and settlement clock.
10. Validate with `scripts/validate_visual_argument.mjs`.

## Commentator Post Route

Read `references/kol-to-visual-routing.md` when the starting material is a public X/Twitter post, thread, Telegram post, article, or commentator corpus item.

- Treat the source item as evidence of the commentator's statement, not proof that its market claim is true.
- Split reported observations, external facts, author inference, market mechanism, directional view, horizon, and invalidation before routing a grammar.
- Send external facts, current prices, flows, positioning, and causal claims through `../build-market-research-pack/SKILL.md`.
- Generate an original headline and visual structure from the verified argument. Do not reuse signature phrasing, sentence sequence, catchphrases, or identity presentation.
- A one-line conviction with no evidence becomes a research lead. A personal loss story remains anecdotal unless independent market data supports the broader claim.

## Grammar Routing

- News shock with a short transmission path: `causal_chain`.
- Fundamental or earnings thesis with decision-driving numbers: `metric_thesis`.
- Uncertain catalyst with several paths: `scenario_tree`.
- Contested view where the countercase matters: `evidence_balance`.
- Relative-value or substitute choice: `comparison`.
- Price-level, breakout, range, target, or settleable market-path claim: `price_timeline`.

Use `../render-cuebook-logic-card/SKILL.md` when the primary job is the graph itself and no quantitative sequence is needed. Use `../render-cuebook-market-figure/SKILL.md` with `argument_curve` when two to four graph nodes should stay visible above a sourced price, estimate, fundamental, positioning, or comparison curve. Use `../render-cuebook-thesis-chart/SKILL.md` for a pure `price_timeline` whose main job is level and settlement tracking.

## Hard Gates

- Do not connect nodes merely because they appear next to each other in prose.
- Observed nodes need source and fact refs. Derived nodes need supporting fact refs.
- The graph must be connected and acyclic. A feedback loop belongs in explanatory detail, not in the compact visual path.
- A metric without value basis, time, and source cannot appear as proof.
- A conditional mechanism cannot be styled as an observed fact.
- A relative or comparison visual requires a named benchmark or comparison subject.
- A settleable visual requires a separate settlement claim, deadline, and machine-readable success condition.
- Preserve creator text. Cuebook additions stay attributable.
- Keep commentator source text in corpus lineage. Do not expose it as current creator ownership or use a public logic card as disguised attribution removal.

## Output Contract

Return `VisualArgumentV1` from `references/visual-argument-v1.schema.json` and validate it:

```bash
node scripts/validate_visual_argument.mjs visual-argument-v1.json
```

## Resources

- `references/visual-argument-v1.schema.json`: shared semantic contract for every Cuebook opinion visual.
- `references/kol-to-visual-routing.md`: KOL/commentator post classification, grammar routing, and evidence gates.
- `scripts/validate_visual_argument.mjs`: graph, provenance, grammar, settlement, and state validator.
- `tests/validate_visual_argument.test.mjs`: regression tests.
