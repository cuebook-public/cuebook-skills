# Market SEO Method

## Modes

| Mode | Input floor | Main output | Maximum readiness |
| --- | --- | --- | --- |
| `plan` | ResearchPackV1 and stable source refs | query map, page plan, planned checks | `conditional` |
| `preflight` | final artifact plus page or build snapshot | release-facing eligibility and content checks | `ready` |
| `audit` | public URL plus observed raw/rendered evidence | current findings and repair graph | `ready` |
| `drift` | comparable baseline and current observations | material changes and acceptance tests | `ready` |

Every run records a canonical-input SHA-256 digest and a semantic ruleset version. Reordering equivalent input must not change normalized findings or stable IDs.

## Observation Boundary

The validator is a pure artifact consumer. It does not fetch pages. Keep future network collection in an isolated adapter with public-URL validation, redirect revalidation, DNS and rebinding defenses, response and decompression limits, timeouts, and no credentials. Record raw HTML and rendered DOM as separate evidence records with their own locator, observation mode, timestamp, and content hash. Missing renderer capability remains `unknown`.

Treat parsed JSON-LD as data. A downstream publisher must serialize it safely and must not interpolate untrusted text into a raw script string. Unpublished research, customer data, and possible material nonpublic information stay local unless the user explicitly authorizes a named external processor.

## Cuebook Evidence Order

1. Regulators, exchanges, filings, official statistics, issuer releases, and official documentation.
2. Authorized market, consensus, search, analytics, and performance data with observation time.
3. Reputable independent reporting and research retained by ResearchPackV1.
4. Derived conclusions that name their fact IDs and calculation basis.
5. Hypotheses, which may shape a question but cannot support a public fact or structured-data property.

SEO observations never upgrade a hypothesis into a fact. Search volume and ranking data never prove an investment thesis.

## Page Types

- `market_event`: time-bounded event, update path, correction path, and expiry.
- `company_analysis`: entity disambiguation, period and accounting basis, counterevidence, and disclosure.
- `sector_analysis`: company-to-sector boundary, comparison basis, and constituent scope.
- `macro_explainer`: release calendar, revision policy, unit and seasonal-adjustment basis.
- `evergreen_education`: durable mechanism, examples labeled by date, and no disguised live call.
- `methodology`: data provenance, formulas, limitations, version, and correction history.
- `data_page`: dataset owner, field definitions, update cadence, missing-data policy, and download terms.

## Eligibility Floor

Ready pages need observed `pass` results for:

- `status_http`
- `robots`
- `indexability`
- `canonical`
- `internal_discovery`
- `initial_html`

Sitemaps, page experience, security, mobile parity, and structured data remain important checks but do not substitute for this floor. Report unavailable field data as unknown; do not estimate it from a screenshot.

## Query Discipline

- `observed`: supported by authorized search data or an observed search artifact.
- `derived`: a transparent transformation of supported audience questions or source facts.
- `hypothesis`: useful to test, with no claim of demand.

Numeric volume requires an `authorized_search_data` evidence record. Do not scrape search-result pages or send automated search queries without express permission and an approved interface.

## Structured Data

Use the most specific truthful type that matches the visible page. A Schema.org type can describe content without being eligible for a Google rich result. Validate syntax and source-to-visible-content parity separately. Never add a fact solely to fill a property.

## Recommendation Shape

Every recommendation records:

- supporting evidence IDs;
- priority and dependency IDs;
- one concrete owner;
- an acceptance test;
- a failure signal that would retract or revise the recommendation.

Avoid generic title-length, word-count, keyword-density, or internal-link quotas. Observe truncation, duplication, user intent, crawl paths, and page behavior directly.

## Primary Official References

- Google AI features and websites: https://developers.google.com/search/docs/appearance/ai-features
- Google people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google spam policies: https://developers.google.com/search/docs/essentials/spam-policies
- Google structured-data guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google crawling and indexing: https://developers.google.com/search/docs/crawling-indexing
- Google canonical guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- IndexNow protocol: https://www.indexnow.org/documentation
