# Projection Rules

## Reject Codes

| Code | Meaning | Repair |
| --- | --- | --- |
| `SOURCE_ASSET_MISMATCH` | A direct company or analyst event cites another ticker | map to the cited ticker or replace evidence |
| `PROXY_BRIDGE_MISSING` | A proxy never reaches the selected asset | name the asset-specific repricing mechanism |
| `BROAD_INDEX_OVERREACH` | A narrow event is assigned to SPY, QQQ, or IWM | use a closer company or sector asset |

## Caution Codes

| Code | Meaning | Repair |
| --- | --- | --- |
| `SOURCE_MISSING` | No attributable evidence text or URL | fetch the primary or closest source |
| `SOURCE_ASSET_UNVERIFIED` | Company evidence has no resolvable ticker or name | add asset aliases or source metadata |
| `TARGET_ONLY` | Analyst target or rating has no model reason | add EPS, revenue, margin, TAM, or revision detail |
| `SPECULATIVE_PROXY` | Asset bridge is speculative | publish only as a watch or debate |
| `UNSUPPORTED_NUMBER` | Narrative adds a material number absent from evidence | source or remove the number |
| `UNSUPPORTED_MECHANISM` | Narrative adds cash-flow, synergy, or similar claims absent from evidence | add support or soften the claim |
| `STALE_EVENT` | Evidence is outside its freshness window | refresh source and market context |

## Directness

- `direct`: source ticker or name should match the primary asset.
- `supported_proxy`: mismatch is allowed only when the bridge names the target asset or alias and explains who reprices what.
- `speculative_proxy`: require the same bridge, then force `caution`.
- `watch_only`: never mark publishable without an explicit decision.

Broad ETFs may absorb Fed, CPI, rates, jobs, dollar, liquidity, recession, or market-wide volatility events. They should not absorb a single-company approval, contract, analyst note, subsidy, tourism rule, or product headline.
