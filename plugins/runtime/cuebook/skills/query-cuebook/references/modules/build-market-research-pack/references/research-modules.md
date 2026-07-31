# Market Research Modules

## Contents

1. Routing
2. Event and earnings
3. Estimates and valuation
4. Tape, positioning, and liquidity
5. Macro, commodities, and event risk
6. Social narratives

## 1. Routing

Select only modules that can change the decision. Every module feeds the same source register and fact ledger.

| Request | Minimum modules |
| --- | --- |
| Earnings preview | consensus, estimate revisions, historical calibration, valuation, event risk |
| Earnings recap | actual/consensus/prior, guidance delta, KPI mix, price reaction, next catalyst |
| Company thesis | operating model, estimate path, valuation range, catalysts, counterevidence |
| Macro or commodity event | actual/consensus/prior, curve or cross-asset reaction, positioning, seasonality |
| Mechanical flow | effective date, expected notional, float/ADV, execution window, exposed actors |
| Trade watch | trigger, tape, volatility, liquidity, positioning, scenarios, invalidation |
| Social pain or crowding | breadth, leverage, liquidation/flow evidence, representative-sample caveat |
| Creator cites latest news or PR | material-event anchor, official source, independent context, price reaction, next falsifier |
| Creator compares valuation | metric definition, denominator viability, same-basis comparator, as-of alignment, alternative only when authorized |

## 2. Event And Earnings

### Actual And Guidance

- Report actual, consensus, prior period, and unit on the same basis.
- For margins, use basis-point deltas. For guidance ranges, compare midpoints and range width.
- Separate headline EPS from revenue, gross margin, operating margin, free cash flow, and industry KPIs.
- Tag GAAP and non-GAAP figures explicitly. Surface large adjustments rather than mixing them.

### Transcript And Q&A

- Separate prepared remarks from analyst Q&A.
- Track new information, repeated analyst pressure, and specific non-answers.
- Treat tone as a derived claim supported by text; do not present sentiment scoring as a reported fact.
- Compare language with the prior period only when both transcripts are available.

## 3. Estimates And Valuation

### Cuebook Consensus Handoff

- Treat `consensusRead.pricedIn`, `inversion`, and `inversionBasis` as the engine's thesis context by default. Register them as `hypothesis` or `derived`, never as `source`.
- Promote `consensusRead.pricedIn` to sourced evidence only when the cue carries the owned source event or snapshot that grounded it. Keep the provider, observation time, market identifier, and liquidity caveat.
- A frozen `consensusPrior` can populate a comparator when its source, period, basis, and capture time travel with the cue.
- Keep model-authored and externally grounded priors visibly separate. A generated prior cannot validate its own surprise claim.
- When no external baseline exists, phrase the edge as a hypothesis and add `grounded consensus baseline` to `gaps`.

### Estimate Revisions

- Record current estimate, 7/30/90-day history, magnitude, breadth, analyst count, and data timestamp.
- Separate a target-price change from an EPS, revenue, margin, or cash-flow model change.
- Check whether revisions confirm or diverge from price action.

### Valuation

- Choose methods by business type: DCF, peer multiples, SOTP, NAV, DDM, or normalized-cycle metrics.
- Use a range and at least one sensitivity table for a decision-grade valuation.
- State peer-selection logic and adjustments. Do not use a peer median without checking growth, margin, leverage, geography, and accounting basis.
- Flag terminal-value concentration, negative denominator problems, and unsupported long-run assumptions.
- Resolve the requested multiple before displaying a value. P/E requires positive attributable earnings on a declared trailing or forward basis; a loss-making subject is `N/M`, not zero and not an invitation to substitute P/S.
- For every valuation record, preserve subject, numeric-or-`N/M` state, numerator, denominator, period, accounting basis, currency treatment, share class, comparability, as-of time, and source refs. Keep the numeric value null and state the reason when the result is `N/M`.
- Compare two multiples only when numerator, denominator period, accounting basis, timestamp, currency treatment, and share class are compatible. Preserve an incompatibility as a research result.

### News And PR Anchor

- When the creator names news, PR, an announcement, or a catalyst as a reason, select one material anchor by relevance to the stated mechanism, source authority, and recency.
- Record title, publisher or issuer, source type, publication time, public HTTP(S) URL, and the exact fact refs supported. Those fact refs must cite the anchor source.
- Pair issuer material with independent reporting only when the second source adds verification or market context. Syndications of the same release do not count as independent evidence.
- Keep routine launches, product posts, and promotional language out of an equity thesis unless the creator explains the financial transmission path.

## 4. Tape, Positioning, And Liquidity

### Price Reaction

- Use the correct event window and a relevant sector or market benchmark.
- Record raw return, benchmark return, and excess return when data permit.
- Check volume, gap behavior, close location, and whether the move persisted.

### Positioning And Flow

- Use open interest, funding, borrow, short interest, ETF/index flow, dealer exposure, ownership, or liquidation data only when sourced.
- Name the actor and deadline for a forced-flow claim.
- Do not label every decline a liquidation or every high-volume move institutional activity.

### Liquidity And Risk

- Record bid/ask spread, average daily volume, volatility, market session, and data delay.
- Treat square-root impact, VaR, and option Greeks as model outputs with assumptions.
- For a trade watch, show trigger, invalidation, adverse scenario, and liquidity limitation. Do not output orders or personalized position sizes.

## 5. Macro, Commodities, And Event Risk

### Macro And Commodity Prints

- Compare actual, consensus, prior, revision, and seasonal context.
- Check rates, FX, curve, volatility, and relevant spot or futures reaction.
- For inventories, distinguish stock level, weekly change, expected change, and seasonal norm.

### Legal, Deal, And Policy Events

- Identify stage, jurisdiction, remedy, conditions, effective date, and remaining steps.
- Separate announced value from recognized revenue, consideration from enterprise value, and approval from completion.
- Translate legal or policy outcomes into a financial line only when the mechanism and timing are supportable.

## 6. Social Narratives

- Preserve first-person stories as anecdotes.
- Test representativeness with breadth, leverage, liquidation, fund-flow, search, or survey data.
- Separate a compelling story from evidence that the market is crowded.
- Never invent private messages, channel checks, or access to make the research feel proprietary.
