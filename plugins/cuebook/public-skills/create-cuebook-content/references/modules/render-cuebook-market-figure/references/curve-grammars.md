# Curve Grammars

Choose the grammar from the data that can be proved, then fit the editorial frame around it.

| Grammar | Reader question | Curve | Required evidence | Typical key numbers |
| --- | --- | --- | --- | --- |
| `event_reaction` | What did this news change? | Observed price, volume, spread, or rate before and after a dated event | News anchor, event marker, time series | move since event, volume ratio, current level |
| `relative_strength` | Which expression is absorbing the thesis faster? | Two synchronized return/index series or one excess-return series | Named benchmark, common baseline, common quote basis | primary return, benchmark return, spread |
| `expectation_revision` | How has the market's expectation moved? | Consensus, probability, forecast, or estimate revisions by date | Versioned estimate observations and catalyst dates | old estimate, new estimate, revision percent |
| `fundamental_driver` | Which operating variable carries the thesis? | Revenue, margin, orders, inventory, users, supply, or another comparable KPI | Dated comparable observations and accounting/unit basis | latest KPI, growth/change, valuation/context |
| `positioning_pressure` | Who may be forced to act? | Price plus flow, open interest, funding, short interest, dealer exposure, or ETF flow | Actual positioning/flow history and matching dates | flow, leverage/position level, price response |
| `sensitivity_curve` | What changes when an input changes? | Reproducible payoff or sensitivity function | Numeric x-axis, explicit formula/model assumptions, no observed-price forecast | threshold, base case, break-even, cap/floor |

## Routing Order

1. Use `relative_strength` when the claim itself is versus a benchmark.
2. Use `event_reaction` when a timestamped event and reaction window are central.
3. Use `expectation_revision` when the tradable information is a change in expectations rather than spot price.
4. Use `positioning_pressure` when forced action, crowding, flow, or unwind is the mechanism.
5. Use `fundamental_driver` when a business or physical KPI carries the thesis.
6. Use `sensitivity_curve` only when a formula or explicit scenario model exists.

If several grammars qualify, choose the one closest to the settlement metric. Use one figure per visual job.

## Layout Routing

- `compact` (`720 x 420`): Feed default. Show one judgment, one evidence relationship, one dominant number, one optional news/event line, and endpoint values. Do not print a prose settlement rule inside the image.
- `editorial` (`1200 x 760`): Detail or cross-media asset. May show the full news card, two to four key-number cells, countercase, and settlement rail.

Do not solve a compact-layout problem by shrinking every editorial block. Remove secondary blocks and preserve the core data argument.

For a one-image thesis bridge, the dominant key number may carry the sourced driver while the main curve carries the observed price path closest to settlement. Keep their units separate: put the driver in the header and the outcome on the plot. Use sourced horizontal `baseline`, `trigger`, `target`, or `invalidation` markers for price levels.

The compact image should close five reader questions: judgment, reason, observed relationship, next observable, and deadline. Encode a selected numeric trigger, target, or settlement level on the matching axis and the deadline as a time marker; preserve internal invalidation and all other settlement language in the manifest and Feed card unless the user explicitly selects a risk-boundary view. Match the history window to the settlement horizon; for a three-session claim, start with two to four weeks of observed context. If the stated reason needs an unavailable derived comparison, report the missing contract and leave the number out. Never infer a valuation basis from the word "valuation."

## Curve Integrity

- `time` x-axis: use observed timestamps. Future `modelled` points are forbidden.
- `category` x-axis: preserve the supplied order and disclose comparable basis.
- `numeric` x-axis: use for formula-driven sensitivity or payoff curves.
- `sealed` points render solid. `forming` points render dashed and carry an as-of warning.
- `modelled` points render dashed with a visible model label and are restricted to `sensitivity_curve`.
- Use synchronized points for filled relative spreads. If timestamps differ, draw independent lines and avoid a misleading filled gap.
- Keep units explicit. A transformed return series uses `%`; an index series names its baseline; a KPI names currency, quantity, or ratio basis.

## News And Numbers

- The news anchor needs a concise observed claim, publisher, publication time, fact refs, and source refs.
- Distinguish an observed event from an unresolved condition. Put the unresolved condition in `countercase` or a proposed marker.
- Key numbers should answer different questions: magnitude, comparison, current state, and settlement. Repeating the same move in three formats adds no value.
- A key number becomes a curve only when sourced history, peers, a distribution, or a formula exists. Keep an isolated number as a large-number composition instead of inventing a trend.
- A provisional number may appear only when its state and as-of time are visible.

## Abstain Conditions

Return a blocked spec when the only available material is sentiment, a slogan, a personal P&L anecdote, an unsupported causal assertion, or a hand-drawn future path. A clean logic card or text post is preferable to a fake curve.
