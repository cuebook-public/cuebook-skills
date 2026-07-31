# Market Narrative Taxonomy V2

## Axes

| Event type | Typical source primitive | Default reasoning lens | Default shape |
| --- | --- | --- | --- |
| `company-guidance` | revenue, EPS, EBITDA, outlook | `model-revision` | `number-first` |
| `earnings-result` | reported quarter or estimate change | `model-revision` | `number-first` |
| `inventory-print` | storage, inventory, CPI-style hard print | `model-revision` | `number-first` |
| `macro-policy` | Fed, rates, inflation, fiscal action | `risk-premium` | `source-first` |
| `analyst-action` | rating or target change | `model-revision` | `judgment-first` |
| `mechanical-flow` | index inclusion, buyback, issuance, unlock | `forced-flow` | `actor-first` |
| `credit-financing` | bonds, notes, refinancing, leverage | `cashflow-credit` | `debate` |
| `technical-level` | moving average, gap, high/low break | `forced-flow` | `tape-first` |
| `prediction-market` | Polymarket, Kalshi, implied odds | `probability-positioning` | `number-first` |
| `crowded-positioning` | liquidation, leverage, crowded trade | `crowding-unwind` | `actor-first` |
| `geopolitical-risk` | war, sanctions, shipping route, oil risk | `risk-premium` | `source-first` |
| `legal-regulatory` | lawsuit, regulator, approval, enforcement | `legal-overhang` | `event-first` |
| `government-contract` | procurement or contract award | `model-revision` | `number-first` |
| `deal-event` | merger approval or closing condition | `event-completion` | `event-first` |
| `capital-investment` | capex or multi-year investment | `cashflow-credit` | `number-first` |
| `operating-data` | shipments, users, deliveries, same-store sales | `model-revision` | `number-first` |
| `product-strategy` | product cycle, TAM, platform strategy | `tam-duration` | `judgment-first` |
| `social-sentiment` | loss confession, retail pain or euphoria | `sentiment-pain` | `anecdote-first` |
| `price-action` | unexplained price or volume move | `forced-flow` | `tape-first` |

Quality conditions such as target-only, broad-index overreach, or source mismatch belong to `GateV1`, not this taxonomy. Platform and voice belong to `DraftV1`.

## Additional Lenses

- `bottleneck-supply`: the scarce layer controls economics.
- `valuation-gap`: price and a defendable model disagree.
- `proxy-transmission`: a source event reprices a second asset through an explicit bridge.
- `crowding-unwind`: one side must exit, hedge, or de-risk.

## Context Rule

Request only data that can change the opening judgment. Each requirement must name fields and why they matter. Missing context remains structured; the router never invents it.
