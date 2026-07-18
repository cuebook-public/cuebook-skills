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
| `event_driven` | 事件驱动 | A discrete event creates the opportunity window |
| `relative_value` | 相对价值 | The edge is a mispricing between related instruments |
| `directional` | 方向交易 | The thesis is primarily up/down exposure |
| `global_macro` | 宏观交易 | Macro variables or geopolitical regimes drive cross-asset positioning |
| `factor_style` | 因子交易 | Value, quality, momentum, size, yield, growth, or low-volatility exposure drives the view |
| `volatility` | 波动率交易 | Implied/realized volatility or convexity is the primary object |
| `liquidity_microstructure` | 资金与流动性 | Order flow, dealer capacity, depth, squeeze, or price discovery is primary |
| `carry_income` | Carry / 收益率 | Carry, roll-down, basis, funding, or income dominates return |

## Catalyst

`corporate_action`, `earnings`, `product`, `policy`, `macro_data`, `geopolitical`, `supply_demand`, `technical_break`, `flow_positioning`, `valuation_dislocation`, `none`.

## Price Mechanism

| Value | Public tag |
|---|---|
| `risk_premium_transmission` | 风险溢价传导 |
| `expectation_revision` | 预期修正 |
| `supply_demand_repricing` | 供需重定价 |
| `forced_flow` | 被迫资金流 |
| `positioning_squeeze` | 仓位挤压 |
| `liquidity_amplification` | 流动性放大 |
| `price_discovery_lead_lag` | 价格发现 / 领先滞后 |
| `valuation_mean_reversion` | 估值回归 |
| `fundamental_compounding` | 基本面复利 |
| `momentum_continuation` | 趋势延续 |
| `volatility_repricing` | 波动率重定价 |
| `carry_roll_down` | Carry / Roll-down |
| `cross_asset_transmission` | 跨资产传导 |

## Trade Expression

| Value | Public tag |
|---|---|
| `outright_long` | 直接做多 |
| `outright_short` | 直接做空 |
| `relative_value_pair` | 相对价值 |
| `long_short_basket` | 多空篮子 |
| `etf_basket` | ETF 组合 |
| `curve_spread` | 曲线 / 价差 |
| `options_convexity` | 期权凸性 |
| `volatility_trade` | 波动率 |
| `hedge_overlay` | 对冲覆盖 |
| `no_trade` | 暂不交易 |

## Horizon

- `intraday`: 日内
- `one_to_three_days`: 1-3 天
- `one_to_four_weeks`: 1-4 周
- `one_to_three_months`: 1-3 个月
- `structural`: 中长期

## Edge

`information`, `causal`, `structural`, `behavioral`, `mechanical`, `valuation`, `timing`.

## Tag Selection

1. Prefer one family tag, one mechanism tag, and one expression tag.
2. Remove duplicates such as family `relative_value` plus expression `relative_value_pair` appearing twice.
3. Keep two to four tags and at most 12 display characters per tag.
4. Never use evidence workflow terms as public tags: `已确认`, `已计算`, `推演`, `待确认`, `形成中`, `observed`, `derived`, `provisional`, `conditional`.

## Example

Creator view: an oil-tanker attack should move direct crude exposure before broad energy equities.

- family: `event_driven`
- catalyst: `geopolitical`
- mechanism: `risk_premium_transmission`
- expression: `relative_value_pair`
- horizon: `one_to_three_days`
- edge: `causal`
- action: `油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天。`
- reason: `航运风险溢价会先写进原油期货，直接敞口通常比能源股更快。`
- tags: `事件驱动`, `风险溢价传导`, `相对价值`
