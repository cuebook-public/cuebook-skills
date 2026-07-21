# Cuebook Trading Logic Taxonomy

The taxonomy is orthogonal. Select one value per dimension, then expose only two to four human-readable tags. Evidence status remains private.

Industry anchors:

- AIMA commonly groups hedge-fund approaches into relative value, event driven, and directional/opportunistic families: https://www.aima.org/educate/about-alts/faqs.html
- CAIA separates relative-value, event-driven, macro, and managed-futures material: https://caia.org/content/fundamentals-alternative-investments-learning-modules
- Federal Reserve research distinguishes order flow, price pressure, liquidity amplification, and price discovery: https://www.federalreserve.gov/econres/feds/price-pressure-and-price-discovery-in-the-term-structure-of-interest-rates.htm
- MSCI's systematic-factor vocabulary includes value, size, volatility, yield, quality, momentum, and growth: https://www.msci.com/indexes/factor-indexes/msci-factor-indexes

Cuebook adds content-facing mechanism and expression dimensions so one viewpoint can be both event driven and relative value without forcing a flat label.

## Strategy Family

| Value | Public tag | Use when |
|---|---|---|
| `event_driven` | Event driven | A discrete event creates the opportunity window |
| `relative_value` | Relative value | The edge is a mispricing between related instruments |
| `directional` | Directional | The thesis is primarily up/down exposure |
| `global_macro` | Global macro | Macro variables or geopolitical regimes drive cross-asset positioning |
| `factor_style` | Factor or style | Value, quality, momentum, size, yield, growth, or low-volatility exposure drives the view |
| `volatility` | Volatility | Implied/realized volatility or convexity is the primary object |
| `liquidity_microstructure` | Flow and liquidity | Order flow, dealer capacity, depth, squeeze, or price discovery is primary |
| `carry_income` | Carry or yield | Carry, roll-down, basis, funding, or income dominates return |

## Catalyst

`corporate_action`, `earnings`, `product`, `policy`, `macro_data`, `geopolitical`, `supply_demand`, `technical_break`, `flow_positioning`, `valuation_dislocation`, `none`.

## Price Mechanism

| Value | Public tag |
|---|---|
| `risk_premium_transmission` | Risk-premium transmission |
| `expectation_revision` | Expectation revision |
| `supply_demand_repricing` | Supply-demand repricing |
| `forced_flow` | Forced flow |
| `positioning_squeeze` | Positioning squeeze |
| `liquidity_amplification` | Liquidity amplification |
| `price_discovery_lead_lag` | Price discovery or lead-lag |
| `valuation_mean_reversion` | Valuation mean reversion |
| `fundamental_compounding` | Fundamental compounding |
| `momentum_continuation` | Momentum continuation |
| `volatility_repricing` | Volatility repricing |
| `carry_roll_down` | Carry / Roll-down |
| `cross_asset_transmission` | Cross-asset transmission |

## Trade Expression

| Value | Public tag |
|---|---|
| `outright_long` | Outright long |
| `outright_short` | Outright short |
| `relative_value_pair` | Relative-value pair |
| `long_short_basket` | Long/short basket |
| `etf_basket` | ETF basket |
| `curve_spread` | Curve or spread |
| `options_convexity` | Options convexity |
| `volatility_trade` | Volatility trade |
| `hedge_overlay` | Hedge overlay |
| `no_trade` | No trade |

## Horizon

- `intraday`: intraday
- `one_to_three_days`: 1-3 days
- `one_to_four_weeks`: 1-4 weeks
- `one_to_three_months`: 1-3 months
- `structural`: medium to long term

## Edge

`information`, `causal`, `structural`, `behavioral`, `mechanical`, `valuation`, `timing`.

## Tag Selection

1. Prefer one family tag, one mechanism tag, and one expression tag.
2. Remove duplicates such as family `relative_value` plus expression `relative_value_pair` appearing twice.
3. Keep two to four tags and at most 12 display characters per tag.
4. Never use evidence workflow terms as public tags: `confirmed`, `calculated`, `simulation`, `pending`, `forming`, `observed`, `derived`, `provisional`, `conditional`.

## Example

Creator view: an oil-tanker attack should move direct crude exposure before broad energy equities.

- family: `event_driven`
- catalyst: `geopolitical`
- mechanism: `risk_premium_transmission`
- expression: `relative_value_pair`
- horizon: `one_to_three_days`
- edge: `causal`
- action: `After the tanker attack, I expect USO to outperform XLE over the next 1-3 days.`
- reason: `Shipping risk should enter crude futures first, so direct exposure may react faster than energy equities.`
- tags: `event driven`, `risk-premium transmission`, `relative value`
