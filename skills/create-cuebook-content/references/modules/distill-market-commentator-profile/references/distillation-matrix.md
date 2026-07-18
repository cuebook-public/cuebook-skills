# ProfileV1 Distillation Matrix

Distill repeatable market-research methods from CorpusV1. Ground every entry in corpus item IDs and keep low-sample conclusions tentative.

## Evidence And Confidence

- Count a pattern at most once per item.
- Emit no pattern with zero supporting items.
- Use `low` for one supporting item, `medium` for two to four, and `high` only for at least five items with meaningful corpus share.
- Store at most the configured number of `evidence_item_ids`; counts still cover the full corpus.
- Do not quote or reproduce source text in ProfileV1.

## Sampling Frame

- Include recent, ordinary, and high-attention posts. A corpus made only from memorable or viral posts cannot describe the account's baseline method.
- Stratify by platform, period, and format before comparing metrics. Raw likes across X, Telegram, and long-form articles are not comparable.
- Require at least eight items with a common engagement field covering at least half of the corpus before setting `engagement_ranking_available` to true.
- Treat engagement as an outcome signal with confounders, not proof that a hook or topic caused performance.

## Source Map

Classify structured outbound links, not each post's canonical platform URL.

| `source_type` | Typical evidence |
| --- | --- |
| `official` | regulators, exchanges, central banks, statistics agencies, filings |
| `media_wire` | attributable news and wire domains |
| `market_data` | charting, pricing, derivatives, flow, and prediction-market domains |
| `social` | social networks, forums, chats, and video platforms |
| `other` | linked domains without a supported classification |

Report domain and category counts separately. A domain frequency is an observation, not an endorsement of source quality.

## Attention Map

Every entry must use an `event_type` from this taxonomy:

| `event_type` | Signal |
| --- | --- |
| `hard-data-print` | macro release, filing, earnings, guidance, inventory |
| `tape-break` | price/volume break, level, gap, new high/low |
| `prediction-market-shift` | odds or prediction-market repricing |
| `crowded-unwind` | leverage, liquidation, crowding, trapped positioning |
| `macro-risk-premium` | rates, FX, commodities, policy, geopolitical premium |
| `estimate-revision` | analyst/model/target or earnings-estimate change |
| `mechanical-flow` | ETF, index, buyback, issuance, rebalance, unlock |
| `supply-bottleneck` | capacity, supply chain, chips, power, logistics |
| `credit-cashflow-stress` | debt, credit, coupon, refinancing, free cash flow |
| `sentiment-pain` | fear, FOMO, losses, capitulation, retail pain |
| `valuation-rerating` | multiple, valuation, TAM, rerating |

Use dedicated Chinese alternatives in regex patterns. Do not wrap Chinese phrases in `\b`.

## Reasoning Map

Classify only explicit reasoning moves:

- `source-first`: checks a primary document or original data;
- `actor-forced`: identifies an actor compelled to buy, sell, hedge, or revise;
- `model-line`: maps evidence to revenue, margin, EPS, cash flow, or TAM;
- `tape-first`: starts from price, volume, or a technical level;
- `crowding-first`: reasons from consensus positioning or trapped exposure;
- `analogy-first`: compares with a prior market episode;
- `pain-first`: turns participant emotion or loss into flow evidence;
- `skepticism-first`: challenges a neat consensus claim;
- `falsifier-first`: names a condition that would invalidate the view.

Keyword hits are weak evidence. Keep `confidence` tied to recurrence and leave unobserved patterns out.

## Writing Map

Extract mechanics only: `number-first`, `judgment-first`, `question-first`, `anecdote-first`, `thread`, or `statement`; character/line medians; short, multiline, numeric, question, and long-form shares; language distribution.

Do not extract signature phrases, favored quotations, persona prompts, or sample outputs. The abstraction rule must require original wording.

## Risk Map And Quality Gate

Flag small samples, selection bias, low date/link/metric coverage, non-comparable engagement, single-platform concentration, weak event recurrence, and proprietary or private-source claims. Missing metrics remain unavailable; never score them as zero.

Set the overall gate to `pass` only when every configured coverage check passes. Otherwise use `caution`; reserve `reject` for unusable or disallowed inputs before normal profile use.

## Cuebook Bridge

Derive attention weights from observed shares and source preferences from linked-domain shares. Map each attention type to the compatible `route-cuebook-narrative` event types. Add data hooks only for observed attention types.

Give every selection, source, reasoning, opening, data, and constraint control a stable `rule_id`. Downstream rendering must return the IDs it actually used; a profile that cannot change an eligible angle or rhythm in an explainable way has not been applied.

Always include constraints requiring current evidence, original wording, no biography or catchphrases, and no invented access or metrics.
