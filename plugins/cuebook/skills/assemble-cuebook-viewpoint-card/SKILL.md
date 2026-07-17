---
name: assemble-cuebook-viewpoint-card
description: Assemble a creator's structured market intent, preserved free text, locked expression plan, unified ViewpointVisualV1, selected evidence, optional full chart, countercase, and optional settlement claim into one product-native ViewpointCardV1 for Cuebook authoring preview and Feed display. Use for the two-step viewpoint flow, block recommendations, preview generation, observation-only posts, and settleable trading views. Do not use to research facts, draw charts, rewrite creator ownership, settle outcomes, publish externally, or place trades.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Assemble Cuebook Viewpoint Card

Build the product object shown in the creator preview. This skill composes validated artifacts; each upstream skill still owns its facts, calculations, prose, chart, and settlement logic.

## Workflow

1. Accept `CreatorViewIntentV1` from the first authoring step. Preserve creator text unchanged. A pure observation may omit a deadline and use `direction: observe`; a settleable trading view still requires an asset, direction, and deadline.
2. Compile `MarketViewSemanticsV1`, then build one `$plan-cuebook-creator-expression`. Compose a trading thesis only when the semantic layer contains real trade intent. Use `$build-market-research-pack` for selected or recommended news and context.
3. Resolve enrichment blocks:
   - text through `$render-cuebook-market-post` or preserved creator text;
   - news through sourced ResearchPack facts;
   - the primary compact argument through `$assemble-cuebook-viewpoint-data` and `$render-cuebook-viewpoint-visual`;
   - oversized branching logic through the legacy `$compile-cuebook-visual-argument` and `$render-cuebook-logic-card` only when it cannot fit the compact grammar;
   - legacy data-led figure through `$render-cuebook-market-figure` only for compatibility;
   - chart through `$render-cuebook-thesis-chart`;
   - indicator through `$compute-cuebook-market-indicators`;
   - settlement through `$compile-cuebook-settlement-claim`.
4. Recommend blocks by decision job, not by visual variety. Every block states whether it supports, challenges, contextualizes, or settles the viewpoint.
5. Assemble one `ViewpointCardV1`. Preserve artifact refs and fact refs rather than copying source payloads.
6. Apply the strictest upstream state. A provisional indicator, degraded chart, unconfirmed deadline, or unresolved disclosure makes the preview `conditional`.
7. Validate with `scripts/validate_viewpoint_card.mjs`. The frontend may reorder optional blocks, but changing the claim, deadline, benchmark, or settlement rule creates a new thesis revision.

## Block Recommendations

- News/event view: creator text + one reaction, unwind, or feedback-loop viewpoint visual.
- Technical view: creator text + binary-level viewpoint visual; use a full thesis chart only when the longer path matters.
- Fundamental view: creator text + category, expectation-gap, or key-number viewpoint visual.
- Relative view: creator text + relative-value or factor-rotation viewpoint visual; add settlement only when direction, benchmark, and deadline are explicit.
- Observation/sentiment view: creator text + contrast or witness viewpoint visual, with no invented direction or settlement.

The author can add, remove, and reorder optional blocks. The header, creator text, primary claim, and settlement block remain bound to their source artifacts.

## Hard Gates

- Do not silently rewrite the creator's free text or attribute Cuebook-generated reasoning to the creator.
- A news block needs source and fact refs. A viewpoint-visual block needs `ViewpointVisualV1`. Legacy logic-card and market-figure blocks still require their own artifacts. A chart block needs `ThesisChartV1`; an indicator block needs `IndicatorPackV1`.
- A relative card needs a visible benchmark in the header, chart, and settlement line.
- A settleable card needs a separate `SettlementClaimV1`, direction, and deadline; prose alone cannot supply the result contract. Observation-only cards use `settleable: false` and may omit a deadline.
- A blocked block blocks the card. A conditional block prevents a ready card.
- Do not repeat the same claim across decorative blocks. Each block must add evidence, counterevidence, context, or settlement semantics.
- Compact Feed cards should contain one primary `ViewpointVisualV1`. Put long charts and extra evidence in the detail view.

## Output Contract

- `references/creator-view-intent-v1.schema.json`: first-step authoring contract.
- `references/viewpoint-card-v1.schema.json`: product preview and Feed contract.

Validate:

```bash
node scripts/validate_viewpoint_card.mjs viewpoint-card-v1.json
```

## Resources

- `references/authoring-flow.md`: exact mapping from the two-screen creator flow to contracts, skills, states, and runtime services.
- `references/creator-view-intent-v1.schema.json`: asset, deadline, outcome, evidence choices, and creator text.
- `references/viewpoint-card-v1.schema.json`: card header, ordered evidence blocks, settlement, disclosures, and state.
- `scripts/validate_viewpoint_card.mjs`: lineage, block, benchmark, state, and ownership validator.
- `tests/validate_viewpoint_card.test.mjs`: regression tests.
