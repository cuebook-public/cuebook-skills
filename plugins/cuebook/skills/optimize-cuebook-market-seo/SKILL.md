---
name: optimize-cuebook-market-seo
description: Plan, preflight, audit, or compare SEO for Cuebook-owned finance and investment web pages as MarketSEOPackV1. Use when a Cuebook cue, ResearchPackV1, ContentProgramV1, market article, methodology page, event page, company analysis, sector analysis, or data page needs search-intent mapping, crawl and index eligibility checks, canonical and sitemap review, initial-HTML review, internal links, visible-fact-bound structured data, or testable SEO recommendations. Use optimize-cuebook-market-geo separately for answer-engine entities, questions, citation support, and monitoring. Do not use for factual research, general social posts, keyword stuffing, mass page generation, backlink manipulation, guaranteed rankings, credential collection, private-network crawling, or external publishing.
license: Proprietary. Cuebook internal; see the repository README for terms.
---

# Optimize Cuebook Market SEO

Create one evidence-bound SEO plan or audit for an owned web asset. Search demand can shape the page job; it cannot change the underlying market facts.

## Workflow

1. Select one mode: `plan`, `preflight`, `audit`, or `drift`. Read `references/method.md` for mode-specific evidence requirements.
2. Accept a ready or conditional `ResearchPackV1` plus optional Cuebook cue, `ContentProgramV1`, rendered artifact, page snapshot, target URL, and authorized search or analytics data. Preserve upstream fact IDs and source boundaries.
3. For a live URL, accept only public HTTP(S) targets. Core validation consumes supplied snapshots and never fetches. Record raw and rendered page observations separately with mode, locator, timestamp, and SHA-256 content hash. Never accept localhost, private, link-local, metadata, credential-bearing, or non-HTTP targets.
4. Build a query map. Label each query as `observed`, `derived`, or `hypothesis`. Search volume remains null unless an authorized search-data record supports it.
5. Define the page job, original value, primary entity, primary query, title, H1, description, slug, section jobs, fact bindings, and internal-link jobs. Do not expand a cue into near-duplicate pages.
6. Evaluate the technical eligibility floor: successful response, crawl permission, indexability, canonical, internal discovery, and primary content in initial HTML. Keep unknown observations unknown.
7. Plan or validate structured data only for facts visible on the page. Every structured-data fact must bind to an upstream fact ID and supporting evidence.
8. Return prioritized recommendations as a dependency graph. Each recommendation needs evidence, an owner, an acceptance test, and a failure signal.
9. Hash the normalized input, record the semantic ruleset version, compute `readiness`, then validate:

```bash
python scripts/validate_market_seo_pack.py market-seo-pack-v1.json
```

10. For owned-web content, pass planning constraints to `$render-cuebook-market-media`; run this skill again in `preflight` after rendering. Use `$optimize-cuebook-market-geo` alongside it when answer-engine readiness is requested, then send the final artifact to `$prepare-market-content-release`.

## Hard Boundaries

- A blocked upstream research artifact cannot produce a ready SEO pack.
- Current market content requires `as_of`, expiry, visible temporal labels, and source-bound facts.
- Page, query, analytics, ranking, and Core Web Vitals claims require observed evidence and timestamps. Missing values stay null.
- `plan` mode cannot be ready because crawl and index eligibility have not been observed.
- `preflight`, `audit`, and `drift` cannot be ready while any eligibility-floor check is unknown, caution, or blocked.
- Structured data must match visible page facts. It cannot invent performance, reviews, authorship, prices, ratings, credentials, or relationships.
- Do not promise ranking, indexing, traffic, snippets, AI citations, or rich results.
- Do not create scaled low-value pages, doorway variants, hidden text, keyword stuffing, link schemes, or search-engine-only copy.
- Do not treat title length, keyword density, word count, schema presence, or a sitemap as a ranking guarantee.
- Never store tokens, cookies, passwords, API keys, authorization headers, or private signing material.
- Keep future fetch or rendering adapters isolated, size-limited, redirect-safe, and credential-free; their output enters only as hashed observations.

## Output

Return `MarketSEOPackV1` using `references/market-seo-pack-v1.schema.json`.

- `blocked`: upstream evidence, spam, URL safety, or technical eligibility has a hard blocker.
- `conditional`: the plan is pre-observation, or required observations remain unknown.
- `ready`: an observed page passes the eligibility floor, has no unresolved P0 recommendation, and all state invariants pass.

## Resources

- `references/method.md`: modes, Cuebook-specific evidence hierarchy, and SEO checks.
- `references/upstream-provenance.md`: audited upstream projects and adopted or rejected patterns.
- `references/market-seo-pack-v1.schema.json`: artifact contract.
- `scripts/validate_market_seo_pack.py`: deterministic boundary and readiness validator.
- `tests/test_validate_market_seo_pack.py`: contract regressions.
