---
name: compile-cuebook-settlement-formula
description: "Compile a confirmed SettlementClaimV1 plus a DB-bound settlement snapshot into a deterministic SettlementFormulaV1 that Cuebook can freeze, register, display, audit, and evaluate. The launch engine supports exactly four terminal families: one-asset direction, one-asset price target, two-asset direction, and two-asset price targets. Pair direction supports independent all-leg settlement or an equal-notional long/short spread. Activation may still be immediate or trigger-based. Do not invent missing identities, prices, thresholds, clocks, or sources; fetch outcomes; score creators; or place trades."
---

# Compile Cuebook Settlement Formula

Turn one meaning-locked settlement claim into math that a deterministic service can execute and a person can inspect.

## Workflow

1. Accept one `SettlementClaimV1` and one caller-supplied settlement binding from Cuebook MCP. Require a confirmed formula family, legs, directions or targets, clock, and persisted entry provenance. Drafts may retain blockers; ready and frozen formulas may not.
2. Choose exactly one `execution_profile.formula_family`: `single_asset_direction`, `single_asset_price_target`, `pair_asset_direction`, or `pair_asset_price_targets`. Compile natural-language outperform/underperform claims as `pair_asset_direction` with `aggregation: long_short`.
3. Bind each leg to `market_assets.asset_id` and `market_provider_instruments.provider_instrument_id`. Store the entry's `market_symbol_periods.symbol_period_id` as snapshot lineage; later exit resolution stays on the stable provider instrument and records the then-valid symbol period in its receipt.
4. Copy persisted entry prices as decimal strings. Preserve observed time, provider, provider symbol, `realtime|candle_close`, session, and observation reference. A future trigger entry uses `activation_capture` and carries no fabricated price.
5. Freeze the execution clock, observation source, interval, timezone, session, candle basis, selection rule, and data-delay allowance. A fixed horizon and an event horizon are mutually exclusive.
6. Declare typed variables, then generate the outcome AST from `execution_profile`. The AST is a deterministic audit projection; `cuebook_settlement_v1` dispatches only the four known families.
7. For immediate views, use `activation.mode: immediate`. For conditional views, use `first_true`, define the trigger window, and capture any activation value needed later.
8. Set lifecycle behavior. An untriggered conditional view is `no_score`. Missing data follows the frozen resolution policy and never becomes a false observation.
9. Generate `public_math` from the AST, validate, and freeze the canonical hash. Any difference between profile and AST is invalid.

## Hard Gates

- Ready or frozen formulas use sealed market observations. Forming bars may appear in content charts, never in settlement math.
- A frozen server formula has one or two ordered legs only: A is primary; B is comparator. Price values are decimal strings compatible with `numeric(38,18)`.
- One-asset direction uses an explicit basis-point neutral band. For compatibility with today's Cuebook directional settlement, use `30` bps only when that policy was confirmed; never hide it as an implementation default.
- Two-asset targets use `all`. Two-asset direction uses either `all` for independent leg tests or `long_short` for one equal-notional long leg against one equal-notional short leg. Persist both leg outcomes and the combined spread.
- Price targets preserve `>` versus `>=` and `<` versus `<=`. Terminal targets and in-window touches are different clocks.
- Long/short aggregation compares synchronized simple returns, not nominal price changes: `return_bps(long_leg) - return_bps(short_leg) > margin_bps`.
- Use `margin_bps: 0` when the creator only says “跑赢/跑输”; populate a positive margin only when the creator states one explicitly. Do not ask the user for a percentage merely to create the pair.
- Long/short legs require an endpoint-alignment rule, bounded entry skew, equal-notional weighting, and compatible quote currencies or an explicit local-return policy.
- A ratio names numerator, denominator, lookback, inclusion policy, and zero-division policy.
- `>` and `>=` remain distinct. Ties follow the declared `tie_result`.
- Trigger captures are dynamic references. Never substitute a publication price for an unknown future trigger close.
- Same-bar price and volume confirmation share one activation evaluation timestamp.
- Event horizons require stable event IDs and authoritative event sources. Estimated dates are fallback metadata only.
- Long/short returns require synchronized start and end observations for both legs.
- Missing or conflicting observations follow the formula's declared fallback, manual-review, or annul policy.
- A private or untradeable entity without a canonical market asset, provider instrument, and persisted price cannot become ready or frozen. Keep it draft or bind an explicitly named public proxy.
- This skill compiles formulas. The MCP settlement service supplies observations and evaluates them later.

## Output

Return `SettlementFormulaV1`, then run:

```bash
python scripts/validate_settlement_formula.py settlement-formula-v1.json
python scripts/validate_settlement_formula.py settlement-formula-v1.json --print-math
python scripts/validate_settlement_formula.py settlement-formula-v1.json --print-canonical-hash
```

## Resources

- `references/formula-patterns.md`: standard trading-view formulas and lifecycle rules.
- `references/backend-db-contract.md`: Cuebook table bindings, evaluator semantics, persistence gaps, and MCP requirements.
- `references/mcp-settlement-protocol.md`: registration, sealed observation, outcome, and receipt requirements for Cuebook MCP.
- `references/settlement-formula-v1.schema.json`: authoritative typed formula contract.
- `scripts/validate_settlement_formula.py`: type, lifecycle, public-math, and hash validator.
- `tests/test_validate_settlement_formula.py`: deterministic regression cases.
- `evals/trigger_cases.json`: routing examples.
