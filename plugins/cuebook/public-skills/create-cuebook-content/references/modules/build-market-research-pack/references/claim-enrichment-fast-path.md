# Creator Claim Enrichment Fast Path

Use this path to turn a creator's market language into the smallest evidence job that can support or reject it before writing or visualization.

## Trigger Map

| Creator language | Required support request |
| --- | --- |
| `最新`, `刚刚`, `今天`, `实时` | current observation with explicit freshness window and as-of time |
| `新闻`, `PR`, `公告`, `催化剂` | linked material event plus official-source classification |
| `PE`, `估值`, `倍数`, `市值` | exact metric definition, denominator, period, share basis, currency, and as-of time |
| `比 X 高/低`, `跑赢/跑输 X` | named comparator on the same basis and synchronized window |
| `突破`, `跌破`, `破发`, `到期` | authoritative level, observation basis, market session, and deadline or horizon |
| `资金会去`, `被迫卖`, `杠杆造成` | actor, measurable flow or positioning evidence, timing, and countercase |

## Request Compilation

For every material creator fragment, compile an internal support request with:

- `claim_fragment` and semantic ref;
- canonical entity and comparator;
- `request_class`: `news_anchor`, `official_event`, `valuation_metric`, `comparison_metric`, `market_series`, `price_level`, or `settlement_reference`;
- exact metric or event definition;
- basis, period, currency, share class, session, and as-of requirements when applicable;
- freshness window and source order;
- `material_to_claim` and intended text or visual use.

Deduplicate requests across all three publishing candidates. Search or fetch independent requests concurrently.

## Provider Route

| Request class | Preferred Cuebook tool | Minimum returned basis |
| --- | --- | --- |
| `news_anchor`, `official_event` | `search_news` | entity, event topic, source class, title, publisher, public URL, publication time, observed time, supported fact refs |
| `valuation_metric`, `comparison_metric` | `list_filings` | subject, metric, numeric or `N/M` state, numerator, denominator, period, accounting basis, currency treatment, share class, comparability, as-of, source refs, N/M reason |
| current quote | `get_market_state` | venue, session, quote type, value, currency, observed time |
| `market_series`, `price_level` | `get_candles` | durable instrument, venue, interval, timezone, sealed/forming state, source refs |
| derived return, spread, or trigger | `get_candles` + local `references/modules/compute-cuebook-market-indicators.md` | formula, frozen inputs, synchronized window, sealing state, source refs |

For material current public claims, start the smallest Cuebook pass and one approved Web batch from the same compiled request set; do not wait for either route to fail before starting the other. Use no more than three targeted searches and three primary or authoritative sources. Preserve `retrieved_via`, URL, retrieval time, and route gaps internally, then reconcile once. A search snippet alone is not an evidence anchor, and the creator-facing answer never exposes provider-by-provider coverage.

## News Anchor Selection

1. Find the event the creator is actually reacting to.
2. Prefer the owner of the fact: filing, regulator, exchange, issuer release, or official dataset.
3. Add one independent report when it verifies, contextualizes, or measures market reaction.
4. Rank by causal relevance, authority, then recency. The newest routine headline is not automatically the anchor.
5. Preserve title, publisher, publication time, public HTTP(S) URL, source type, and supported fact refs. A `company_release` or `reputable_news` source-register entry is incomplete without them.

The candidate payload always carries a linked anchor when news is a material premise. Put the headline or compact source fragment inside the bitmap only when the event is the visual entry or necessary bridge.

## Metric Resolution

Resolve meaning before value:

- Encode a resolved number as `value_state: numeric`, a finite numeric `value`, and `not_meaningful_reason: null`.
- Encode an undefined multiple as `value_state: N/M`, `value: null`, `comparability: not_comparable` or `not_applicable`, and a non-empty `not_meaningful_reason`.
- `P/E = equity value / attributable net income`, or price per share divided by diluted EPS, on a declared trailing or forward basis.
- Earnings at or below zero make P/E `N/M`. Never display a negative P/E as an ordinary comparable.
- A broad `估值` request may permit P/S, EV/revenue, EV/EBITDA, FCF yield, or SOTP when the creator's meaning survives. Record the alternative as a Cuebook addition and keep the original unavailable metric visible in the research lineage.
- A specific `PE` request does not authorize silent replacement.
- Relative performance requires synchronized baselines, return type, currency treatment, and horizon.

## SpaceX Example

Creator seed: `SpaceX 的 PE 和 NVDA 对不上，最近新闻只是 PR，我空到破发。`

Compile four requests:

1. material `news_anchor` for the exact recent announcement being dismissed;
2. material `valuation_metric` for SpaceX P/E viability and basis;
3. material `comparison_metric` for NVDA on the same basis, or an explicit incompatibility result;
4. material `settlement_reference` for the official IPO offer price and official daily close.

If SpaceX has negative attributable earnings, return `SpaceX P/E: N/M`. That is a valid result. Use another valuation multiple only when the creator's broader valuation wording permits it.
