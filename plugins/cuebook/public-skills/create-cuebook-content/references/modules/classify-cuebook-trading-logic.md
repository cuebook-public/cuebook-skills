<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/classify-cuebook-trading-logic/` from the public Skill directory.
# Classify Cuebook Trading Logic

Expose the trading play a reader would recognize in the viewpoint. The output separates creator expression from evidence administration.

## Workflow

1. Read `MarketViewSemanticsV1` first, then the creator seed, optional thesis, source refs, target asset, comparator, and horizon. If `posture.trade_intent` is `none` or `observe_only`, return `not_applicable` to the orchestrator and stop; expression tags remain owned by `CreatorExpressionPlanV1`.
2. Classify six orthogonal dimensions with `references/modules/classify-cuebook-trading-logic/references/trading-logic-taxonomy.md`:
   - primary strategy family;
   - catalyst type;
   - price mechanism;
   - trade expression;
   - horizon;
   - source of edge.
3. Freeze the stance: primary asset, direction or relative outcome, comparator when needed, and horizon label.
4. Write public expression in a human order:
   - `action_line`: what I would do or what I am betting on;
   - `because_line`: the one mechanism that earns that action;
   - two to four tags drawn from strategy, mechanism, and expression.
5. Preserve observed, inferred, provisional, and missing evidence only in `evidence_boundary`. Do not copy those labels into public lines or tags.
6. Validate with `references/modules/classify-cuebook-trading-logic/scripts/validate_trade_logic.mjs` and pass the profile to renderers.

## Public Expression

- Prefer `Because X, I am doing Y over window Z` or an equally direct natural sentence.
- Name the actual asset and the trade construction. `Bullish energy` is weaker than `I expect USO to outperform XLE`.
- State the hidden play in readable tags, for example `event driven · risk-premium transmission · relative value`.
- Use conviction as creator voice: `I am betting`, `I am starting with`, `I am avoiding`, `I will only trade`, or `I will not chase`.
- Keep the evidence boundary intact. A creator may say `I expect capital to move first into direct crude exposure`; the backend still records that flow as inferred when no flow tape exists.
- Avoid workflow language such as `awaiting confirmation`, `leave it for the market to validate`, `calculated`, `confirmed`, `simulation`, and `pending` in public copy.

## Hard Gates

- `event_driven` requires a non-`none` catalyst.
- `relative_value_pair` requires a comparator and a relative stance.
- `factor_style` requires a factor-compatible mechanism.
- `liquidity_microstructure` requires an order-flow, positioning, liquidity, or price-discovery mechanism.
- The action line must name the primary asset.
- Public tags cannot contain backend evidence-state vocabulary.
- Keep at most one primary family. Mechanism and expression carry the nuance.
- An unavailable trade expression produces a missing field or `no_trade`; do not fabricate one.
- Sentiment evidence, personal loss stories, category observations, and retrospective attribution do not become current trades unless the semantic artifact explicitly records creator-owned trade intent.

## Resources

- `references/modules/classify-cuebook-trading-logic/references/trade-logic-profile-v1.schema.json`: versioned output contract.
- `references/modules/classify-cuebook-trading-logic/references/trading-logic-taxonomy.md`: Cuebook categories, mappings, and public tag rules.
- `references/modules/classify-cuebook-trading-logic/scripts/validate_trade_logic.mjs`: structural and cross-field validator.
