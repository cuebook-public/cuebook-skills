# Backend and DB Contract

## What the current DB already supplies

| Formula field | Cuebook source |
| --- | --- |
| `asset_id`, canonical ticker, tradeability | `market_assets` |
| `provider_instrument_id`, provider, exchange, quote currency | `market_provider_instruments` |
| entry `symbol_period_id` and provider symbol | `market_symbol_periods` |
| persisted publish-time entry snapshot | `market_latest_prices`, copied to `narrative_asset_entries` |
| sealed OHLCV outcome candidates | `market_warm_candles` |
| current directional head outcome | `settlements` |
| current non-lead directional outcomes | `settlement_legs` |

`asset_id` is the stable product identity. `provider_instrument_id` pins the data instrument. A `symbol_period_id` is time-bounded, so freeze it on the entry receipt but resolve and record the eligible symbol period again at exit.

All DB price values are `numeric(38,18)` and arrive in application code as strings. Formula prices therefore remain decimal strings from capture through hashing, evaluation, and receipts.

## What the current settlement worker cannot express

The existing worker evaluates only one rule per head or leg:

```text
up:   move_pct > +0.3%
down: move_pct < -0.3%
```

`settlements` plus `settlement_legs` can preserve the entry, exit, return, and per-leg directional verdict. They do not currently preserve:

- a formula hash or formula family;
- a target price and boundary operator;
- combined `all` verdicts for two-leg claims;
- a long/short return spread, weighting rule, or margin;
- the exact observation selection and candle basis;
- complete observation receipts and correction revisions.

Do not encode those meanings inside `lead_asset`, ticker strings, or generic JSON attached to a narrative. Add a formula-owned append-only path.

## Minimum backend additions

1. **Formula registration**
   Persist the complete canonical `SettlementFormulaV1`, `formula_id`, `canonical_hash`, `claim_ref`, `claim_hash`, family, creator, release, and registration time. Registration validates the schema and hash atomically and is idempotent on the formula hash.

2. **Formula legs**
   Index A/B legs by formula ID with `asset_id`, `provider_instrument_id`, entry snapshot lineage, direction, optional target price, and target operator. The canonical JSON remains the source of truth; columns are query and integrity projections.

3. **Template evaluator**
   Dispatch on `execution_profile.engine + formula_family`. Never evaluate an arbitrary client-supplied AST. Rebuild the canonical expression from the profile, compare it with the stored AST, obtain eligible sealed observations, and evaluate with decimal arithmetic.

4. **Formula result head and legs**
   Append one immutable result head with `hit|miss|flat|no_data`, settle time, evaluated time, family, formula hash, and combined metrics. Append one result leg per A/B input with entry and exit receipts, simple return in basis points, target result when applicable, and its own verdict.

5. **Observation receipts**
   Preserve provider instrument, resolved symbol period, provider symbol, source, event time, capture time, interval, session, origin, adjustment, bar version, sealed state, decimal value, and selection reason. A correction appends a revision; it never edits history in place.

## Required MCP binding call

The creator workflow needs one bounded backend call before formula compilation. Suggested contract:

```text
resolve_settlement_binding(SettlementBindingQueryV1)
  -> SettlementBindingBundleV1
```

For each requested leg it returns:

- canonical `asset_id`, ticker, tradeability, and lifecycle;
- `provider_instrument_id`, provider, quote currency, and current symbol period;
- the selected persisted entry price, observed time, source, session, and observation reference;
- supported intervals and sealed outcome bases for the requested horizon;
- explicit blockers such as private/untradeable asset, missing price, stale observation, unsupported currency alignment, or unavailable sealed history.

The call resolves and reports facts. It does not choose the creator's direction, target, operator, benchmark, deadline, or risk threshold.

## Evaluator rules by family

### Single direction

Use the frozen `direction_threshold_bps`, not the worker's current global constant. Values inside the neutral band settle `flat`.

### Single price target

Evaluate the frozen operator against the eligible exit price. `at_datetime` and `any_in_window` are different contracts; a terminal target must not succeed merely because an earlier intraday high touched it.

### Pair direction with `all`, or pair targets

Evaluate both legs independently, then apply `all`. Store both leg outcomes even when the head is already known to miss.

### Pair direction with `long_short`

Compute:

```text
R_A = P_A,exit / P_A,entry - 1
R_B = P_B,exit / P_B,entry - 1
spread_bps = 10000 * (R_long - R_short)
```

Use equal-notional weights, the frozen endpoint alignment, and the frozen FX policy. The default success test is `spread_bps > 0`; a positive margin is valid only when the creator stated one. Nominal price differences are never a substitute for returns.

## Launch boundary

A Skill package can be released with this contract and validator now. End-to-end settlement remains blocked until the MCP binding call, formula registration storage, four-family evaluator, and formula result receipts exist server-side. Existing directional settlement can be adapted behind the new evaluator for the two directional families; targets and `long_short` aggregation require new execution and persistence paths.
