# Market GEO Method

## Modes

| Mode | Purpose | Maximum readiness |
| --- | --- | --- |
| `plan` | build entities, fact cards, questions, answer jobs, and source requirements | `conditional` |
| `preflight` | check a final owned-web artifact for answer and citation readiness | `ready` |
| `monitor_plan` | version prompts, sample fields, windows, and correction routing | `conditional` |
| `sample_review` | evaluate supplied manual or authorized samples without collecting them | `ready` |

Every run records a canonical-input SHA-256 reference and semantic ruleset version. Stable IDs and normalized findings must remain deterministic when equivalent inputs are reordered.

## SEO Floor

Google states that its normal SEO requirements remain applicable to AI features and that no special AI markup or machine-readable file is required. This module therefore records `seo_eligibility` as an upstream gate. Entity clarity and answer structure cannot repair a blocked page.

## Cuebook Entity And Evidence Rules

- Canonicalize issuer, brand, legal entity, ticker, security, sector, metric, event, regulator, person, and concept separately.
- Keep aliases and ticker mappings explicit. Never infer that two similarly named securities are interchangeable.
- Verified entities and relations need upstream fact and source IDs. Each source record keeps an exact locator, and the referenced research sources must actually cover every bound fact ID.
- Derived relations remain derived. Hypotheses may shape monitoring questions but cannot enter fact cards or answer units.
- Market metrics retain unit, period, accounting basis, event time, observation time, and revision state upstream.

## Question Clusters

- `definition`: what the entity, metric, or mechanism is.
- `changed`: what changed, versus which comparable basis, and when.
- `mechanism`: how the supported causal chain may work.
- `comparison`: entities or scenarios on one explicit basis.
- `risk`: counterevidence, uncertainty, and downside mechanism.
- `valuation`: model input, basis, and sensitivity, never a personalized order.
- `catalyst`: observable event and expected time.
- `invalidation`: evidence that would weaken or reverse the thesis.
- `source_check`: where a claim comes from and whether the source directly supports it.

Observed demand needs supplied search, audience, or platform evidence. Derived questions are transparent transformations of supported facts or reader jobs. Hypotheses are test candidates only.

## Answer Units

An answer unit has one job, one or more question IDs, fact IDs, source IDs, and an explicit temporal label. `self_contained` means the unit identifies the entity, period, basis, and limitation needed to understand it without hidden context. It does not imply any preferred word count.

## Citation Support

- `direct`: every material part of the claim is supported by the cited facts and sources.
- `partial`: at least one material part still needs evidence or narrower wording.
- `unsupported`: the claim cannot be published as written.

Citation count is not citation quality. A source URL that does not support the mapped claim is a failure, even if the URL is authoritative.

## Crawler And Retrieval Controls

Record each engine or crawler independently with current official documentation, check time, and observed policy evidence. Do not infer one crawler's behavior from another. Do not treat crawler permission as a guarantee of retrieval or citation.

## Sample Integrity

Supported sample modes:

- `manual_real`: a human collected a real answer with auditable evidence.
- `authorized_api`: an authorized interface returned the answer.
- `browser_assisted_with_permission`: a user-controlled, terms-compliant browser session produced the evidence.
- `synthetic_replay`: a test fixture or simulated answer.
- `plan_only`: no sample exists.

At minimum, a real sample retains engine, prompt ID and version, sample time, raw evidence reference, answer hash, and review state. Account, device, region, and network state should be retained when available in the raw evidence. Synthetic replay never proves live visibility. Every calculated rate records numerator, denominator, and definition; invalid samples stay outside the denominator.

## Measurement

Keep content quality, retrieval visibility, citation support, answer factuality, distribution, and later market outcomes as different metric classes. Use fixed windows only when a release receipt or baseline exists. Observed correlation does not prove that an optimization caused the answer change.

## Primary Official References

- Google AI features and websites: https://developers.google.com/search/docs/appearance/ai-features
- Google people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google structured-data guidelines: https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- OpenAI crawler overview: https://developers.openai.com/api/docs/bots
- OpenAI publishers and developers FAQ: https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
