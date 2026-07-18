# Formula Patterns

## Observation notation

- `P_t`: sealed price observation for the primary instrument at time `t`.
- `V_t`: sealed volume for the same bar as `P_t`.
- `P_0`: publication baseline when the claim explicitly uses it.
- `P_tau`: price captured at activation time `tau`.
- `P_H`: first eligible observation at the declared horizon `H`.
- `R_A(t0,t1)`: total return of asset A over synchronized endpoints.

`execution_profile` is authoritative for server dispatch. The expression tree and these strings are deterministic projections for inspection and receipts.

## Frozen launch families

`cuebook_settlement_v1` accepts four terminal families. Activation can still be immediate or trigger-based. Pair direction has two explicit aggregation modes.

| `formula_family` | Legs | Frozen test | Combined verdict |
| --- | ---: | --- | --- |
| `single_asset_direction` | 1 | `signed_return_bps(A) > threshold_bps` | leg A |
| `single_asset_price_target` | 1 | `P_A,H operator K_A` | leg A |
| `pair_asset_direction` | 2 | direction test for A AND direction test for B | `all` |
| `pair_asset_direction` | 2 | `return_bps(long_leg) - return_bps(short_leg) > margin_bps` | `long_short` |
| `pair_asset_price_targets` | 2 | price target for A AND price target for B | `all` |

Direction math uses the actual signed return. For a long leg:

```text
return_bps(A) = 10000 * (P_A,H / P_A,0 - 1)
success       = return_bps(A) > threshold_bps
```

For a short leg:

```text
success = return_bps(A) < -threshold_bps
```

The current Cuebook directional engine uses a `30` bps neutral band. The compiler freezes that number in `execution_profile.direction_threshold_bps`; the server must not read a mutable global default when replaying an older formula.

For pair `all` formulas, aggregate per-leg verdicts in this order:

1. any `miss` -> combined `miss`;
2. otherwise any `no_data` -> combined `no_data`;
3. otherwise any `flat` -> combined `flat`;
4. otherwise all legs are `hit` -> combined `hit`.

For `long_short`, compute simple returns from synchronized endpoints and subtract the short asset's raw return from the long asset's raw return. This correctly succeeds when the long leg falls less than the short leg, for example `-2% - (-5%) = +3%`. If either leg lacks an eligible endpoint, return `no_data`. Equality is `flat` for strict `gt`; equality is `hit` for inclusive `gte`.

The launch pair is equal-notional. Default `margin_bps` to `0` when the creator states only “A 跑赢 B” or “A 跑输 B”. A stated minimum excess return may freeze a positive margin. This is a raw long/short spread, not a beta-neutral or factor-alpha estimate.

Both legs must belong to the same settlement session family. Continuous crypto and scheduled exchange sessions cannot be made compatible by choosing a convenient shared timestamp. BTC/QQQ may still be shown as a sourced comparison, but the current settlement engine must return `MIXED_SESSION_FAMILY`; the creator may explicitly choose a single-asset settlement or publish without settlement.

`execution_profile` is the server dispatch contract. `outcome.expression` must be its canonical projection and is retained for inspection and receipts; registration rejects any mismatch.

## Standard patterns

| View | Formula | Lifecycle |
| --- | --- | --- |
| Terminal long | `P_H > K` | active -> succeeded/failed |
| Terminal short | `P_H < K` | active -> succeeded/failed |
| Window barrier | `exists t in W: P_t >= K` | active until hit or expiry |
| Range | `L <= P_H AND P_H <= U` | active -> succeeded/failed |
| Long A / short B | `10000 * (R_A(t0,t1) - R_B(t0,t1)) > margin_bps` | synchronized endpoints required |
| Event | `E_H = true` | authoritative event source required |
| Triggered horizon | `tau = first t: G(t); success = F(H, tau)` | pending -> active -> terminal |

## Price and volume activation

For `BTC closes above 65,000 on volume` using Cuebook's default volume policy:

```text
G(t) = P_t > 65000
       AND
       V_t / mean(V_(t-20), ..., V_(t-1)) >= 1
```

Requirements:

- price and volume come from the same sealed bar;
- the previous-20 mean excludes the current bar;
- the interval, timezone, venue aggregation, and volume unit are fixed;
- zero denominator follows `resolution.zero_division_policy`;
- `tau` is the first bar for which the complete expression is true.

If the view remains bullish through the next Bitcoin halving:

```text
P_tau = close captured when G(tau) becomes true
P_H   = first sealed UTC daily close after the halving event
success = P_H > P_tau
failure = NOT(success)
```

If `G(t)` never becomes true before the horizon, lifecycle result is `expired_untriggered` and scoring result is `no_score`.

## Return formulas

```text
R_A(t0,t1) = P_A(t1) / P_A(t0) - 1
LongShort(A,B) = R_A(t0,t1) - R_B(t0,t1)
```

Both legs require synchronized timestamps, compatible adjustment bases, and compatible quote currencies or an explicit FX conversion variable.

## Boundary rules

- `gt` means strict `>`; equality fails unless `tie_result` says otherwise.
- `gte` means `>=`; equality succeeds.
- `between` compiles to two explicit comparisons with declared inclusive or exclusive edges.
- `any_in_window` is existential; `every_observation` is universal.
- Missing data never silently becomes `false`. Apply the declared missing-data policy.

## Formula versus data

The Skill compiles variables and math. MCP supplies observations later:

1. resolve each variable's pinned source and observation policy;
2. retrieve only eligible observations;
3. evaluate activation in event-time order;
4. capture activation values once;
5. evaluate invalidation and terminal outcome;
6. persist every input, formula hash, result, and receipt.
