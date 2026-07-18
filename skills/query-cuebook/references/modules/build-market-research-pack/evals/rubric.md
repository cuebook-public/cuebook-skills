# Market Research Pack Rubric

Score each dimension from 1 to 5. Any hard failure blocks downstream rendering.

| Dimension | 5 means |
| --- | --- |
| Source integrity | The source owns or directly observes the claim; identity, access, and provenance are explicit |
| Comparator discipline | Actual, consensus, prior, revisions, units, periods, and basis are aligned |
| Freshness and tape | Current facts have timestamps, delay labels, correct event windows, and useful benchmarks |
| Financial reasoning | The pack connects evidence to model lines, cash flow, valuation, probability, or forced flow |
| Risk and liquidity | Liquidity, volatility, adverse path, and model limitations fit the decision use |
| Thesis quality | The claim is specific, evidence-backed, horizon-bound, and separated from hypothesis |
| Falsifiability | Counterevidence, scenarios, catalysts, gaps, and invalidation can change the view |
| Downstream utility | The renderer can select a supported angle without doing the research again |

`ready` requires source integrity and comparator discipline at 5, every other applicable dimension at least 4, and no hard failure. Use `conditional` when the asset is valid but one or more decision-critical inputs are missing. Use `blocked` for identity, direction, access, fabrication, or execution-boundary failures.

Hard failures:

- source-to-asset mismatch or unresolved proxy bridge
- fabricated source, consensus, quote, price, or timestamp
- model-authored `consensusRead` presented as an observed external baseline
- the same grounding snapshot counted again as independent confirmation
- inaccessible snippet treated as evidence
- current fact presented from stale or unknown data
- personalized order execution or credential exposure
