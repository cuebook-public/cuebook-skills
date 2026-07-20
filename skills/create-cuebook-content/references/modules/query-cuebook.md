<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/query-cuebook/` from the public Skill directory.
# Query Cuebook

Provide one read-only entrance for everything the user wants to see in Cuebook. Keep retrieval and interpretation separate from creation so the same frozen query result can be inspected directly or handed to create-cuebook-content later without Query invoking it.

## Connection Gate

Assume the plugin's install-time host authentication is complete. Run the smallest required Cuebook read as the connection check: `search_assets` for a named asset, `get_frame` for a release-pinned Frame, or the first read that directly answers a request without an asset. A normal MCP result is the only runtime readiness proof.

- If the Tool is absent, cannot be called, interrupts for authentication, or returns a token, reconnect, or transport failure, preserve the request and stop. Say that the Cuebook install-time connection is not ready and ask the user to complete the plugin README setup, then retry the preserved request in one later task.
- Use only the host-installed `cuebook` MCP connector. Do not enumerate generic MCP resources, inspect connector internals, run a CLI login, implement OAuth discovery or DCR, exchange tokens, create a custom client, store credentials in task files, open another task, or retry automatically. Do not diagnose a local marketplace plugin through ChatGPT or public plugin management.
- If the plugin was installed in the current task, finish its install-time authentication and open one new task before querying. Do not reinstall from inside Query.

## Routing

1. Classify the request as `latest_stories`, `story_detail`, `asset_narratives`, `market_state`, `market_evidence`, `fundamentals`, `market_series`, `derived_metrics`, `settlement_history`, `published_frame`, `commentator_profile`, `media_format`, or `mixed`.
2. Resolve named assets with Cuebook `search_assets` before requesting asset-bound data. Never guess a canonical asset from a display ticker.
3. Use only read tools declared as `module: query` in `assets/plugin/mcp-capability-map-v1.json`.
4. Select the smallest query path that answers the request:
   - latest story: `list_asset_cues`, then `get_cues` only for selected details;
   - narrative library: `list_asset_cues`; use `list_themes`, `get_cues_detail`, or `get_reasoning_graph` only for an explicit focused/deep request, never for a fast creator preview;
   - creator thought scaffolds: after asset resolution, use `list_asset_cues` and select at most two non-duplicative Cue refs relative to the creator's provisional direction—normally one aligned and one contrasting or adjacent; call `get_cues` for those selected details only, and return them through `creation_handoff` without drafting or adopting their stance;
   - current snapshot: `get_market_state`;
   - evidence or valuation: `search_news`, `list_filings`, and `references/modules/build-market-research-pack.md` when synthesis is requested;
   - curves or triggers: `get_candles`; preserve its raw frozen envelope for a creation handoff, and invoke `references/modules/compute-cuebook-market-indicators.md` only when a requested indicator is actually needed;
   - positioning, calendar, disclosures, or asset events: call only the one matching read tool when the user's premise needs it;
   - settlement outcomes: `list_settlements` and `references/modules/reconcile-market-content-history.md` when a history ledger is requested;
   - published Frames: `get_frame` for one release-pinned full Frame with its attached publication visual, settlement state, discussion entry, and canonical URL; never query, browse, or retrieve a rendition independently;
   - public account or media study: the authorized corpus and distillation skills.
5. Preserve provider timestamps, sealed/forming state, source identity, metric basis, and capability gaps inside the bundle. A missing backend tool produces a partial result, never an invented value.
6. Return `CuebookQueryBundleV1`, then answer the user from the reconciled results. Include sources and freshness near the claims they support, but do not narrate which retrieval lane succeeded, failed, retried, or supplemented another lane.

## Connection and Latency

- Reuse the connector's persisted OAuth session after the Connection Gate. Never repeat a login merely to refresh unchanged data or expose more Tools.
- Resolve a named asset once. After resolution, run independent reads such as market state, candles, positioning, and cue detail concurrently when the runtime supports parallel calls.
- Keep an observed-series window separate from any future thesis horizon. `get_candles` covers what happened; a creator's horizon remains a distinct declared field and never changes the historical baseline silently.
- For a creator handoff involving trend, price path, volume, or relative strength, preserve the exact `get_candles` and selected `get_market_state` result envelopes plus their result refs. Do not make the model transcribe OHLCV into a second ad hoc shape.
- When a creator names a broad market rather than a ticker, make any proxy choice explicit in the handoff. Use SPY only as a transparent broad-U.S.-equity comparator and QQQ only for Nasdaq/technology; never rewrite the creator's premise as if they supplied the proxy.
- Reuse a compatible query bundle by canonical asset, request class, basis, cutoff, and freshness. Refresh only stale result primitives; do not rebuild an unchanged bundle because a downstream renderer retried.
- A creation fast preview uses only `skill_tool_policy.creator_fast_allowlist`, one bounded Cuebook query phase, and no default graph/DAG read. Any optional enrichment that misses the latency budget is recorded as unavailable and must not delay already sufficient material evidence.
- Cue thought scaffolds are viewpoint context, not factual support. Preserve their published time, source ownership, summary, and result refs; never treat count, recency rank, agreement, or a directional label as proof or consensus. The Create consumer decides whether a Cue is aligned, contrasting, or adjacent to the current creator's provisional hypothesis and may use at most two.

## Evidence Reconciliation

- Compile one evidence plan. For material current news, filings, official events, company claims, or dated public facts, start the smallest Cuebook batch and one authorized Web batch without waiting for a visible gap. Execute concurrently when the host permits; otherwise run them back-to-back from the same plan.
- Run at most one Web batch with no more than three targeted searches and three primary or authoritative sources. Do not broaden the topic or repeat a failed search loop. Reconcile and deduplicate both lanes once.
- Register every source with `retrieved_via: cuebook_mcp | authorized_web | user_supplied | local_derivation`, its locator, publication time when known, retrieval time, and usage rights. Keep issuer, regulator, exchange, filing, independent reporting, Cuebook interpretation, and local calculation distinct.
- Keep route coverage and unavailable capability classes internal for data-source improvement. Do not tell the user “Cuebook did not have it” or “Web had to supply it.” An unresolved factual claim remains an internal gap; a creator-owned causal bridge, analogy, scenario, or expectation may pass to Create as a typed hypothesis rather than being rejected for lacking direct proof. The human answer says reliable support is not yet sufficient only when the requested sentence is factual.

## Query Boundary

- Query may summarize and compare retrieved material and may show a factual table, curve, or report for inspection. It does not turn that material into a publish-ready voice, market post, creator viewpoint graphic, settlement claim, or release bundle.
- A Cue-assisted `creation_handoff` may provide optional thought anchors, but it never assigns them to the creator. Adoption or rejection belongs to Create and must be explicit before any Cue-derived connection, countercase, or rule enters the creator's Meaning Lock.
- Query never calls any write, Paper trade, Frame mutation, correction, withdrawal, or publication tool.
- An ambiguous request defaults to query. Choose creation only when the requested deliverable is explicitly a market post, creator viewpoint graphic, settlement protocol, release bundle, or publishing candidate. A request to generate a data table or factual chart remains Query.
- A `creation_handoff` is data lineage, not an implicit creation request. It names reusable result refs and warnings without drafting anything.
- A blocked query always returns `creation_handoff.eligible: false` with no result refs. A partial query can hand off only usable results and must preserve every missing capability internally; the creator-facing answer presents supported logic and material uncertainty without exposing connector coverage.

## Output

Normalize input with `references/modules/query-cuebook/references/cuebook-query-request-v1.schema.json`. Return the contract in `references/modules/query-cuebook/references/cuebook-query-bundle-v1.schema.json`. Validate it with:

```bash
node references/modules/query-cuebook/scripts/validate_query_request.mjs query-request-v1.json
node references/modules/query-cuebook/scripts/validate_query_bundle.mjs query-bundle-v1.json
```

Use `assets/plugin/query-menu-v1.json` for product-facing query types and `assets/plugin/cuebook-modules-v1.json` for the enforced module boundary.
