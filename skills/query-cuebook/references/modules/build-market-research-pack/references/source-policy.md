# Market Research Source Policy

## Contents

1. Source order
2. Identity and basis
3. Time and freshness
4. Consensus and market data
5. Independence and gaps

## 1. Source Order

Prefer the source that owns the fact:

1. Regulatory filing, exchange notice, government release, court order, or official dataset.
2. Company release, investor presentation, official transcript, or issuer-hosted call material.
3. Timestamped exchange or market-data source for price, volume, curve, spread, funding, and open interest.
4. Named consensus or estimate dataset for Street comparisons and revisions.
5. Attributable reporting or specialist research for context unavailable from the owner.
6. Social posts for claims about sentiment, narrative spread, or first-person experience only.

Search snippets, reposts, and inaccessible pages are discovery leads. Do not register them as evidence for an underlying claim.

## 2. Identity And Basis

- Resolve the company, asset, contract, share class, venue, currency, and fiscal period before analysis.
- A user-provided attachment or pasted transcript may use an authorized local locator when no public URL exists. Record what the locator refers to; never invent a URL to satisfy the schema.
- News and company-release anchors are the exception to locator fallback: they require a title, public HTTP(S) URL, publisher, publication time, and fact refs that cite the source. Other source types retain URL-or-authorized-locator handling.
- Preserve GAAP versus non-GAAP, reported versus adjusted, nominal versus real, and stock versus flow bases.
- Record whether guidance is new, raised, lowered, narrowed, maintained, initiated, or withdrawn.
- Record whether a number is reported, management-provided, consensus, model-derived, or hypothetical.
- Do not repair a ticker mismatch with a shared analyst, bank, publisher, or generic proper noun.

## 3. Time And Freshness

- Record publication time and observation time separately when possible.
- Timestamp current market facts and include timezone or market session.
- Use the event's true reaction window. Distinguish before-market, after-market, and intraday releases.
- Mark a fact `stale` when it falls outside the brief's freshness window. Historical context may remain useful but cannot be worded as current.
- Record data delay when a feed is delayed, end-of-day, or otherwise not live.

## 4. Consensus And Market Data

- Name the consensus source and the number of analysts when available.
- In Cuebook, an unsourced `consensusRead` is model-authored thesis context. It belongs in a `hypothesis` or `derived` fact and cannot support beat/miss, priced-in, or surprise language by itself.
- Use `consensusPrior` as an external baseline only when its frozen source snapshot, observation time, period, and basis are available. If a prediction-market snapshot was already used to ground the cue, do not count the same snapshot again as independent confirmation.
- Keep estimate level, estimate range, revision magnitude, and revision breadth separate.
- Compare event-day return with a relevant benchmark and the same time window. Do not attribute a raw move to the event without checking broad-market or sector movement.
- Label modeled liquidity, slippage, valuation, and probability as estimates. Expose their inputs.
- A finance portal or unofficial API may be used for discovery or low-stakes context. Cross-check decision-critical figures against primary or licensed sources when available.

## 5. Independence And Gaps

- Count independent publishers or data owners, not repeated syndications of one report.
- Source frequency measures attention, not truth or authority.
- Put unresolved basis, timestamp, identity, comparator, and access problems in `gaps`.
- A missing field stays missing. Do not fill it from memory or a neighboring company.
