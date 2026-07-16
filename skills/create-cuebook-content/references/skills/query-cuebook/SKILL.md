---
name: query-cuebook
description: Query, inspect, compare, visualize, or explain Cuebook market intelligence without creating publishable creator content or causing writes. Use whenever the user asks to 看、查、搜、读取、列出、比较 or verify Cuebook assets, stories, market state, news, evidence, fundamentals, valuation, OHLCV, indicators, data tables or factual curves, creator feed records, settlement outcomes, publication receipts, commentator profiles, or media patterns. Return a source-linked CuebookQueryBundleV1 and a concise human answer. Do not draft market posts, design creator viewpoint graphics, compile settlement claims, save artifacts, publish, or call any write tool. An explicit request for a post, creator viewpoint graphic, settlement protocol, or publishing candidate belongs to create-cuebook-content.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Python 3.11+ for validators.
---

# Query Cuebook

Provide one read-only entrance for everything the user wants to see in Cuebook. Keep retrieval and interpretation separate from creation so the same frozen query result can be inspected directly or handed to create-cuebook-content later without Query invoking it.

## Routing

1. Classify the request as `latest_stories`, `story_detail`, `asset_narratives`, `market_state`, `market_evidence`, `fundamentals`, `market_series`, `derived_metrics`, `creator_feed`, `settlement_binding`, `settlement_history`, `publication_history`, `commentator_profile`, `media_format`, or `mixed`.
2. Resolve named assets with Cuebook `search_assets` before requesting asset-bound data. Never guess a canonical asset from a display ticker.
3. Use only read tools declared as `module: query` in `../../../assets/plugin/mcp-capability-map-v1.json`.
4. Select the smallest query path that answers the request:
   - latest story: `list_asset_cues`, then `get_cues` only for selected details;
   - narrative library: `list_asset_cues`; never relabel News Story records as narrative-library records;
   - current snapshot: `get_market_state`;
   - evidence or valuation: `search_news`, `list_filings`, and `../build-market-research-pack/SKILL.md` when synthesis is requested;
   - curves or triggers: `get_candles`, `compute_market_metrics`, and `../compute-cuebook-market-indicators/SKILL.md` when deterministic local indicators are needed;
   - owned feed: `get_creator_feed`, then `../normalize-cuebook-creator-feed/SKILL.md`;
   - settlement preparation: `resolve_settlement_binding`; return the read-only binding and never register a claim from Query;
   - outcomes and receipts: `list_settlements`, `get_publication_receipt`, and `../reconcile-market-content-history/SKILL.md` when a history ledger is requested;
   - public account or media study: the authorized corpus and distillation skills.
5. Preserve provider timestamps, sealed/forming state, source identity, metric basis, and capability gaps. A missing backend tool produces a partial result, never an invented value.
6. Return `CuebookQueryBundleV1`, then answer the user from that bundle. Include sources and freshness near the claims they support.

## Query Boundary

- Query may summarize and compare retrieved material and may show a factual table, curve, or report for inspection. It does not turn that material into a publish-ready voice, market post, creator viewpoint graphic, settlement claim, or release bundle.
- Query never calls `save_creator_artifact`, `register_settlement_claim`, `publish_release`, or any future write tool.
- An ambiguous request defaults to query. Choose creation only when the requested deliverable is explicitly a market post, creator viewpoint graphic, settlement protocol, release bundle, or publishing candidate. A request to generate a data table or factual chart remains Query.
- A `creation_handoff` is data lineage, not an implicit creation request. It names reusable result refs and warnings without drafting anything.
- A blocked query always returns `creation_handoff.eligible: false` with no result refs. A partial query can hand off only usable results and must describe every missing capability.

## Output

Normalize input with `references/cuebook-query-request-v1.schema.json`. Return the contract in `references/cuebook-query-bundle-v1.schema.json`. Validate it with:

```bash
python scripts/validate_query_request.py query-request-v1.json
python scripts/validate_query_bundle.py query-bundle-v1.json
```

Use `../../../assets/plugin/query-menu-v1.json` for product-facing query types and `../../../assets/plugin/cuebook-modules-v1.json` for the enforced module boundary.
