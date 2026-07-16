---
name: optimize-cuebook-market-geo
description: Plan or preflight answer-engine readiness, design compliant monitoring, or review supplied samples for Cuebook finance and investment content as MarketGEOPackV1. Use when a Cuebook cue, ResearchPackV1, MarketSEOPackV1, owned-web article, methodology page, data page, or knowledge asset needs entity and alias normalization, evidence-backed fact cards, answer-engine question mapping, extractable answer units, claim-to-source citation support, crawler-policy observations, prompt versioning, AI-answer sample integrity, or a correction loop. Use optimize-cuebook-market-seo for crawl, index, canonical, sitemap, and structured-data eligibility. Do not use for factual research, article rewriting, living-author imitation, citation guarantees, synthetic samples presented as live, unauthorized platform crawling, anti-bot evasion, mass mention campaigns, personalized investment advice, credentials, or external publishing.
---

# Optimize Cuebook Market GEO

Make supported market knowledge easier to identify, extract, attribute, and correct across answer engines. This skill never guarantees that an engine will retrieve, cite, rank, or recommend the content.

## Workflow

1. Select one mode from `plan`, `preflight`, `monitor_plan`, or `sample_review`. Read `references/method.md` for mode and evidence rules.
2. Accept a ready or conditional `ResearchPackV1` plus optional cue, `ContentProgramV1`, `MarketSEOPackV1`, rendered artifact, owned-web URL, authorized platform samples, and manual exports. Preserve every upstream fact and source ID.
3. Record SEO eligibility separately. A page blocked from normal search eligibility cannot be GEO-ready merely because its prose is extractable.
4. Build a canonical entity graph for companies, tickers, securities, sectors, metrics, events, people, regulators, and concepts. Every verified entity and relationship must return to fact IDs and exact source locators that cover those facts.
5. Create bounded fact cards and a question map covering definitions, changes, mechanisms, comparisons, risks, valuation, catalysts, invalidation, and source checks. Label questions as observed, derived, or hypothesis.
6. Design answer units with one clear job, explicit temporal context, fact bindings, and source bindings. Map every public claim to direct, partial, or unsupported citation support.
7. Record crawler or retrieval controls only from current official evidence. Keep training crawlers, search crawlers, and user-triggered retrieval distinct when the platform documents them separately.
8. For monitoring, version prompts and define sample mode, evidence fields, windows, and correction ownership. Do not execute browser sampling or platform automation in this skill.
9. In `sample_review`, accept only supplied or authorized raw evidence. A live sample needs prompt version, engine, time, environment evidence or export, answer hash, and manual review state. Synthetic replay remains synthetic. Report every rate with an explicit numerator and denominator.
10. Hash the normalized input, record the semantic ruleset version, compute `readiness`, then validate:

```bash
python scripts/validate_market_geo_pack.py market-geo-pack-v1.json
```

11. Feed planning constraints into `$render-cuebook-market-media`, run `preflight` on the final owned-web artifact, and pass the approved artifact to `$prepare-market-content-release`.

## Hard Boundaries

- A blocked ResearchPack or blocked SEO eligibility state blocks GEO readiness.
- Verified entities, relations, fact cards, answer units, and directly supported claims require upstream fact and source IDs.
- Derived and hypothetical questions cannot silently become verified answer facts.
- Current market facts require `as_of`, current freshness, and visible `current_as_of` labels. Historical replay must be labeled.
- `plan` and `monitor_plan` cannot be ready because no final page or verified sample has been established.
- Partial citation support is conditional. Unsupported citation support is blocked.
- A sample is not live without raw answer evidence, prompt version, engine, sample time, and review provenance.
- Sample metrics must expose numerator and denominator; invalid samples never enter the denominator.
- Do not automate consumer UI scraping, bypass rate limits, rotate identities, defeat CAPTCHA, or simulate organic mentions.
- Do not prescribe position size, leverage, entry, target, or stop, and do not turn comparison questions into personalized rankings.
- Do not create special files, markup, answer lengths, or repeated phrasing as guaranteed citation levers.
- Never store tokens, cookies, passwords, API keys, authorization headers, or private signing material.

## Output

Return `MarketGEOPackV1` using `references/market-geo-pack-v1.schema.json`.

- `blocked`: research, SEO eligibility, evidence integrity, sample integrity, or citation support has a hard blocker.
- `conditional`: the asset is still planned, a required observation is unknown, citation support is partial, or samples are synthetic or incomplete.
- `ready`: a final asset has passed SEO eligibility, every answer unit and direct claim is fact-bound, crawler observations are current, and any reviewed live samples are auditable.

## Resources

- `references/method.md`: entity, question, answer-unit, citation, and monitoring method.
- `references/upstream-provenance.md`: audited upstream projects and adaptation decisions.
- `references/market-geo-pack-v1.schema.json`: artifact contract.
- `scripts/validate_market_geo_pack.py`: deterministic evidence, sample, and readiness validator.
- `tests/test_validate_market_geo_pack.py`: contract regressions.
