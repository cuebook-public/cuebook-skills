---
name: classify-cuebook-trading-logic
description: "Classify the explicit or genuinely implied trading play inside a MarketViewSemanticsV1 or creator thesis as TradeLogicProfileV1: strategy family, catalyst, price mechanism, trade expression, horizon, edge, stance, public action/reason lines, and readable tags. Use only when the semantic layer records avoid, conditional, or explicit trade intent; skip this skill for pure observations, sentiment witnesses, and source anecdotes. Keep evidence certainty private and never invent a trade, personalize advice, execute orders, or infer conviction the creator did not express."
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Classify Cuebook Trading Logic

Expose the trading play a reader would recognize in the viewpoint. The output separates creator expression from evidence administration.

## Workflow

1. Read `MarketViewSemanticsV1` first, then the creator seed, optional thesis, source refs, target asset, comparator, and horizon. If `posture.trade_intent` is `none` or `observe_only`, return `not_applicable` to the orchestrator and stop; expression tags remain owned by `CreatorExpressionPlanV1`.
2. Classify six orthogonal dimensions with `references/trading-logic-taxonomy.md`:
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
6. Validate with `scripts/validate_trade_logic.mjs` and pass the profile to renderers.

## Public Expression

- Prefer `因为 X，我做 Y，窗口 Z` or an equally direct natural sentence.
- Name the actual asset and the trade construction. `看多能源` is weaker than `我先做 USO 跑赢 XLE`.
- State the hidden play in readable tags, for example `事件驱动 · 风险溢价传导 · 相对价值`.
- Use conviction as creator voice: `我押`, `我先做`, `我回避`, `我只做`, `我不追`.
- Keep the evidence boundary intact. A creator may say `我押资金先去直接原油敞口`; the backend still records that flow as inferred when no flow tape exists.
- Avoid workflow language such as `等待确认`, `交给市场验证`, `已计算`, `已确认`, `推演`, and `待确认` in public copy.

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

- `references/trade-logic-profile-v1.schema.json`: versioned output contract.
- `references/trading-logic-taxonomy.md`: Cuebook categories, mappings, and public tag rules.
- `scripts/validate_trade_logic.mjs`: structural and cross-field validator.
- `tests/trade_logic.test.mjs`: taxonomy and public/private boundary regressions.
