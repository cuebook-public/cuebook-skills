---
name: query-cuebook
description: Query, inspect, compare, visualize, or explain Cuebook market intelligence without creating publishable creator content or causing writes. Use whenever the user asks to 看、查、搜、读取、列出、比较 or verify Cuebook assets, stories, published Frames, market state, news, evidence, fundamentals, valuation, OHLCV, indicators, data tables or factual curves, settlement outcomes, commentator profiles, or media patterns. Return a source-linked CuebookQueryBundleV1 and a concise human answer. Use Cuebook first and one bounded authorized Web fallback only for a material evidence gap. Do not draft market posts, design creator viewpoint graphics, compile settlement claims, publish, or call any write tool. An explicit request for a post, creator viewpoint graphic, settlement protocol, or publishing candidate belongs to create-cuebook-content.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses a connected Cuebook MCP server first for asset resolution and market data, with one bounded authorized Web fallback for a material evidence gap. Degrades to partial results, never invented values. Node.js 18+ for validators.
---

# Query Cuebook

Provide one read-only entrance for everything the user wants to see in Cuebook. Keep retrieval and interpretation separate from creation so the same frozen query result can be inspected directly or handed to create-cuebook-content later without Query invoking it.

## Routing

1. Classify the request as `latest_stories`, `story_detail`, `asset_narratives`, `market_state`, `market_evidence`, `fundamentals`, `market_series`, `derived_metrics`, `settlement_history`, `published_frame`, `commentator_profile`, `media_format`, or `mixed`.
2. Resolve named assets with Cuebook `search_assets` before requesting asset-bound data. Never guess a canonical asset from a display ticker.
3. Use only read tools declared as `module: query` in `../../../assets/plugin/mcp-capability-map-v1.json`.
4. Select the smallest query path that answers the request:
   - latest story: `list_asset_cues`, then `get_cues` only for selected details;
   - narrative library: `list_asset_cues`; use `list_themes`, `get_cues_detail`, or `get_reasoning_graph` only for an explicit focused/deep request, never for a fast creator preview;
   - current snapshot: `get_market_state`;
   - evidence or valuation: `search_news`, `list_filings`, and `../build-market-research-pack/SKILL.md` when synthesis is requested;
   - curves or triggers: `get_candles`; preserve its raw frozen envelope for a creation handoff, and invoke `../compute-cuebook-market-indicators/SKILL.md` only when a requested indicator is actually needed;
   - positioning, calendar, disclosures, or asset events: call only the one matching read tool when the user's premise needs it;
   - settlement outcomes: `list_settlements` and `../reconcile-market-content-history/SKILL.md` when a history ledger is requested;
   - published Frames: `get_frame` for one release-pinned full Frame with its attached publication visual, settlement state, discussion entry, and canonical URL; never query, browse, or retrieve a rendition independently;
   - public account or media study: the authorized corpus and distillation skills.
5. Preserve provider timestamps, sealed/forming state, source identity, metric basis, and capability gaps. A missing backend tool produces a partial result, never an invented value.
6. Return `CuebookQueryBundleV1`, then answer the user from that bundle. Include sources and freshness near the claims they support.

## Connection and Latency

- Use the host-installed `cuebook` MCP connector and its persisted OAuth session. Do not enumerate generic MCP resources repeatedly, implement OAuth discovery/DCR, exchange tokens, create a custom HTTP client, or store credentials in task files.
- If the connector reports unauthorized, emit one normal host reconnect handoff and preserve the frozen request for resume. Do not spend the task retrying alternative authentication paths.
- Resolve a named asset once. After resolution, run independent reads such as market state, candles, positioning, and cue detail concurrently when the runtime supports parallel calls.
- Keep an observed-series window separate from any future thesis horizon. `get_candles` covers what happened; a creator's horizon remains a distinct declared field and never changes the historical baseline silently.
- For a creator handoff involving trend, price path, volume, or relative strength, preserve the exact `get_candles` and selected `get_market_state` result envelopes plus their result refs. Do not make the model transcribe OHLCV into a second ad hoc shape.
- When a creator names a broad market rather than a ticker, make any proxy choice explicit in the handoff. Use SPY only as a transparent broad-U.S.-equity comparator and QQQ only for Nasdaq/technology; never rewrite the creator's premise as if they supplied the proxy.
- Reuse a compatible query bundle by canonical asset, request class, basis, cutoff, and freshness. Refresh only stale result primitives; do not rebuild an unchanged bundle because a downstream renderer retried.
- A creation fast preview uses only `skill_tool_policy.creator_fast_allowlist`, one bounded Cuebook query phase, and no default graph/DAG read. Any optional enrichment that misses the latency budget is recorded as unavailable and must not delay already sufficient material evidence.

## Evidence Fallback

- Query Cuebook first. Use authorized Web research only when the user explicitly requests it or the first Cuebook batch leaves a material evidence gap.
- Run at most one Web batch with no more than three targeted searches and three primary or authoritative sources. Do not broaden the topic, repeat a failed search loop, or let Web replace usable Cuebook evidence.
- Register every source with `retrieved_via: cuebook_mcp | authorized_web | user_supplied | local_derivation`, its locator, publication time when known, retrieval time, and usage rights. Keep issuer, regulator, exchange, filing, independent reporting, Cuebook interpretation, and local calculation distinct.
- A Web-supplemented bundle remains `partial` when a requested Cuebook capability is unavailable. Unsupported material remains a creator hypothesis or an explicit gap; it never becomes a retrieved fact.

## Query Boundary

- Query may summarize and compare retrieved material and may show a factual table, curve, or report for inspection. It does not turn that material into a publish-ready voice, market post, creator viewpoint graphic, settlement claim, or release bundle.
- Query never calls any write, Paper trade, Frame mutation, correction, withdrawal, or publication tool.
- An ambiguous request defaults to query. Choose creation only when the requested deliverable is explicitly a market post, creator viewpoint graphic, settlement protocol, release bundle, or publishing candidate. A request to generate a data table or factual chart remains Query.
- A `creation_handoff` is data lineage, not an implicit creation request. It names reusable result refs and warnings without drafting anything.
- A blocked query always returns `creation_handoff.eligible: false` with no result refs. A partial query can hand off only usable results and must describe every missing capability.

## Output

Normalize input with `references/cuebook-query-request-v1.schema.json`. Return the contract in `references/cuebook-query-bundle-v1.schema.json`. Validate it with:

```bash
node scripts/validate_query_request.mjs query-request-v1.json
node scripts/validate_query_bundle.mjs query-bundle-v1.json
```

Use `../../../assets/plugin/query-menu-v1.json` for product-facing query types and `../../../assets/plugin/cuebook-modules-v1.json` for the enforced module boundary.
