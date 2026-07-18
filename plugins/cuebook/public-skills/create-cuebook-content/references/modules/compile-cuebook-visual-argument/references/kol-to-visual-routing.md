# Commentator Post To Viewpoint Visual

Use this route for a selected public `CorpusV1.items[]` record or a supplied post extract. The goal is an original, evidence-linked viewpoint visual. The source post remains attributable in lineage and is never treated as proof of its external market claims.

## Pipeline

1. Normalize the source post with `references/modules/collect-market-commentator-corpus.md` and select one bounded item or thread.
2. Extract five separate layers: observed event, external facts, commentator inference, proposed market mechanism, and directional or conditional conclusion.
3. Build or reuse `ResearchPackV1` to verify external facts, current market data, comparators, causal bridges, and counterevidence.
4. Draft original `PostV1` content. ProfileV1 may contribute abstract mechanics such as hook length or evidence ordering; it cannot supply a named person's voice or catchphrases.
5. Compile the approved content and research into `VisualArgumentV1`.
6. Route one primary grammar. Render a second graphic only when it answers a different question, such as logic versus price path.

## Routing Matrix

| Source-post shape | Primary grammar | Required repair before rendering |
| --- | --- | --- |
| Breaking event followed by a transmission mechanism | `causal_chain` | Verify event, exposed asset, mechanism bridge, and countercase |
| Forced selling, leverage unwind, crowded positioning, or sell-the-news behavior | `causal_chain` with `actor_action` nodes | Verify the actor/flow claim; a personal anecdote alone is insufficient |
| Earnings, valuation, adoption, margins, or balance-sheet thesis | `metric_thesis` | Supply two to four comparable, dated, sourced metrics |
| Catalyst with bull/base/bear paths | `scenario_tree` | Keep conditions and outcomes observable; do not invent probabilities |
| Strong claim with meaningful conflicting evidence | `evidence_balance` | Include at least one sourced support item and one real countercase |
| Relative-value, substitute, ADR/listing, sector, or regime comparison | `comparison` | Name the benchmark and use shared comparison dimensions |
| Breakout, range, target, stop condition, relative-return window, or expiry | `price_timeline` | Use OHLCV, explicit levels, declaration time, horizon, and settlement claim |
| One-line conviction or slogan | no direct render | Build research first; route after a mechanism or measurable comparison exists |
| Personal P&L confession, emotion, or lifestyle story | no trade-thesis render | Keep as anecdote or obtain independent breadth/positioning/liquidation evidence |

## Support Boundary

The system supports all seven market-argument shapes above. It deliberately abstains when a post has no recoverable market claim, no attributable source, no valid asset mapping, or no evidence beyond the commentator's own assertion.

Technical screenshots are discovery inputs only. Rebuild the price visual from Cuebook OHLCV and explicit levels rather than copying the source image. Long threads may yield several candidate arguments; each public graphic still carries one question and one primary conclusion.
