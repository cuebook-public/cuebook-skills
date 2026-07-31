# Frame Settlement Authoring

Read this reference only when the creator wants the Frame to carry a measurable market outcome.
Settlement is optional: subject assets, an Artifact, or a market image never create it.

## Natural Choice

Offer Settlement as a useful future checkpoint, not a product mode or form. Preserve a stated
horizon. If time is missing, ask how long the view should be tested or offer at most two
mechanism- or catalyst-linked horizons when the creator requests help. The creator accepts every
economic term before it enters the complete preview; keeping the Frame non-settling is always valid.

## Exact-Deadline Rules

- Every market-settled Frame uses the creator's exact `at_instant` deadline. The server freezes
  publication snapshot(s) and later selects the latest completed official observation(s) at or
  before it, regardless of market hours.
- `long` hits above the baseline and `short` below it; equality is flat. Freeze
  `threshold_bps: "0"` without a separate percentage question.
- `range` is distinct from neutral: it hits when the absolute terminal return is less than or equal
  to the creator-accepted `max_abs_move_bps`. Require an explicit `±X%`; never supply 3%, 5%, or
  another preset. If help was requested, propose at most two bands from the existing shared read.
  An interim move outside the band followed by a return inside still hits.
- Treat “A will beat B” as relative: it compiles to equal-notional long A / short B and hits when
  `return(A) - return(B)` exceeds zero or an explicit creator margin. Both may rise or fall. Require
  two distinct same-session-family assets; no percentage question is needed for ordinary
  outperformance.
- Compound A-and-B evaluates two independent conditions at one deadline. Both must hit; any miss is
  miss, missing data is `no_data` only when neither leg misses, and directional equality is flat.
  If either leg is range, freeze its accepted ± band. Atomic direction legs use zero bps; require
  two distinct same-session-family assets.
- If the creator means “never leaves the band,” explain that Frame currently settles the endpoint
  only. Let them accept endpoint range or keep the thought non-settling; never fake barrier
  monitoring.

Ask only for a missing asset, direction, horizon, range band, or explicit target/margin; never offer
session counts or next-close rules. Keep OAuth, scopes, idempotency, tokens, and transaction checks
intact.

## Complete-Preview Wording

Fold the chosen rule into the same natural response as the title, body, and actual image:

- Directional: “I will record this SPCX view through January 17; it counts as a hit if SPCX is
  above the publication baseline then.”
- Range: “I will record BTC through August 14; it counts as a hit if it finishes within the ±X%
  range you chose. Moves outside that band before then do not decide the result.”
- Relative: “I will record NVDA against TSLA through August 14; it counts as a hit if NVDA's return
  from publication is higher, even if both fall.”
- Compound: “I will record TSLA rising and NVDA finishing within the accepted range through August
  14. Both conditions must hold.”

Use the creator's actual assets, terms, and language. These are viewpoint contracts, never orders.
