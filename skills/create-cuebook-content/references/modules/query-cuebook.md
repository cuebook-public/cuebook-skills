<!-- Generated internal module: not a public Agent Skill. -->
> Module resources are rooted at `references/modules/query-cuebook/` from the public Skill directory.
# Query Cuebook

Provide one read-only entrance to Cuebook. Keep retrieval separate from creation so frozen results can be inspected or handed to Create without Query invoking it.

## Cuebook Context

Stay in Cuebook unless the creator explicitly asks for another Skill. Keep routing backstage.

For an explicit or accepted TradingView aid, read `references/modules/query-cuebook/references/tradingview-workbench.md`; it routes requested chart images to `references/modules/query-cuebook/references/tradingview-focused-capture.md`. An absent optional connector never blocks Cuebook.

## Quiet Readiness Check

Assume the plugin's host authentication is complete. Silently run the smallest required Cuebook read: `search_assets` for a named asset, `get_frame` for a release-pinned Frame, or the first read that directly answers a request without an asset. A normal MCP result is the only runtime readiness proof.

- Treat authentication, discovery, and connectivity as different failure classes. Only an explicit host authentication signal—`not_logged_in`, `AuthorizationRequired`, an expired or revoked credential, or a scope step-up—justifies asking the user to complete Cuebook sign-in. Say it naturally in the user's language and keep it to at most two short sentences; do not prescribe a second login when the host already reports an authenticated connection.
- If the Cuebook connector or required entrypoint is absent from the task, do not infer an account problem. Say briefly that Cuebook did not load in this task and ask the user to confirm the Plugin is enabled before opening one new task with the same request.
- If a visible Cuebook call fails with an HTTP request, transport-send, DNS, TLS, proxy, socket, or timeout error, do not infer authentication from that failure. Say briefly that Cuebook is temporarily unreachable, preserve the user's request, and ask them to restore their network or proxy and retry; make clear that reinstalling or logging in again is unnecessary. Any normal Cuebook result already returned in the task is decisive evidence that the connector loaded, even if another concurrent or later call hits a transport failure.
- Never mention the README, missing actions, Tool names, MCP internals, market-data fabrication, preserved intent, or an internal process name in this response. Do not enumerate resources or diagnose the connector in the user conversation.
- Use only the host-installed `cuebook` MCP connector for Cuebook data. Optional TradingView follows its workbench; never install, launch, update, or configure it here. Do not run a CLI login from this Skill—especially after a transport failure—implement OAuth discovery or DCR, exchange tokens, create a custom client, store credentials in task files, open another task, or retry automatically.
- If the plugin was installed in the current task, finish its host authentication and open one new task before querying. Do not reinstall from inside Query.

## Routing

1. Normalize once with `references/modules/query-cuebook/references/cuebook-intent-v1.schema.json`: route by effect, order mixed dependencies, and default ambiguity to one read-only Query answer.
2. Classify each Query step as `latest_stories`, `story_detail`, `asset_narratives`, `market_state`, `market_evidence`, `fundamentals`, `market_series`, `derived_metrics`, `tradingview_inspect`, `tradingview_capture`, `settlement_history`, `published_frame`, `commentator_profile`, `media_format`, or `mixed`.
3. `search_assets` returns ranked candidates, not an existence verdict. Bind only an exact identity (`matchType: exact`). Never substitute a fuzzy candidate, proxy, or nearest carrier. A missing capability is an operation gap, not an identity gap. With no exact result, retain the term; do not claim Cuebook has no knowledge of it or infer lifecycle from a miss.
4. Query stays read-only. An active TradingView workbench adds only its audited observation subset; live Tool lists remain runtime truth.
5. Select the smallest query path that answers the request:
   - latest story: `list_asset_cues`, then `get_cues` only for selected details;
   - narrative library: `list_asset_cues`; reserve `list_themes`, `get_cues_detail`, and `get_reasoning_graph` for explicit focused/deep requests;
   - creator thought scaffolds: resolve the asset, select at most two non-duplicative Cues—normally one aligned and one contrasting or adjacent—and fetch only their details; hand them off without drafting or adoption;
   - current snapshot: `get_market_state`;
   - evidence or valuation: `search_news`, `list_filings`, and `references/modules/build-market-research-pack.md` when synthesis is requested;
   - curves or triggers: `get_candles`; preserve its raw frozen envelope for a creation handoff, and invoke `references/modules/compute-cuebook-market-indicators.md` only when a requested indicator is actually needed;
   - explicit TradingView inspection, focused chart image, or stress test: use the workbench, preserve exact identity and restricted lineage, and exclude raw observations from direct Frame handoff;
   - positioning, calendar, disclosures, or asset events: call only the one matching read tool when the user's premise needs it;
   - settlement outcomes: `list_settlements` and `references/modules/reconcile-market-content-history.md` when a history ledger is requested;
   - published Frames: `get_frame` for one release-pinned Frame, attached visual, settlement state, and discussion entry; never retrieve a rendition separately;
   - public account or media study: the authorized corpus and distillation skills.
6. Preserve provider timestamps, sealed/forming state, source identity, metric basis, and capability gaps inside the bundle. A missing backend tool produces a partial result, never an invented value.
7. For a published Frame, derive one plain settlement sentence from the frozen formula rather than its body. `all_legs` joins every leg with explicit AND and says every condition must hold; `equal_notional_long_short` remains relative return. Never imply OR or invent a threshold.
8. Return `CuebookQueryBundleV1`, then answer the user from the reconciled results. Include sources and freshness near the claims they support, but do not narrate which retrieval lane succeeded, failed, retried, or supplemented another lane.

## Connection and Latency

- Reuse persisted OAuth and resolve a named asset once; then parallelize independent market, candle, positioning, and Cue reads. Never repeat login to refresh data or expose Tools.
- Keep an observed-series window separate from any future thesis horizon. `get_candles` covers what happened; a creator's horizon remains a distinct declared field and never changes the historical baseline silently.
- For trend, price, volume, or relative-strength handoff, preserve exact `get_candles` and selected `get_market_state` envelopes and refs; never re-transcribe OHLCV.
- Reuse bundles by canonical asset, request class, basis, cutoff, and freshness; refresh only stale primitives.
- Fast Preview uses one bounded `creator_fast_allowlist` phase and no default graph/DAG. Late optional enrichment becomes unavailable without delaying sufficient evidence.
- Cues are viewpoint context, not factual support. Preserve time, owner, summary, and refs; count, rank, agreement, or direction is never proof or consensus. Create may classify and use at most two.

## Evidence Reconciliation

- For material current news, filings, official events, company claims, or dated facts, run the smallest Cuebook batch and one authorized Web batch from one plan. Use at most three targeted primary or authoritative sources, never broaden or loop, then reconcile once.
- Register source locator, times, rights, and `retrieved_via: cuebook_mcp | authorized_web | user_supplied | local_derivation | tradingview_desktop_mcp | tradingview_research_mcp`. TradingView is restricted and never a direct Frame input; a separately validated official attributed snapshot routes to Create's finished-bitmap path, not this query bundle.
- Keep route and capability gaps internal; never say “Cuebook did not have it” or “Web supplied it.” Unresolved facts stay gaps, while creator-owned causality, analogy, scenario, or expectation may pass as typed hypothesis. Say support is insufficient only for a requested factual sentence.

## Query Boundary

- Query may summarize, compare, and show factual tables, curves, or reports; it never produces publish-ready voice, viewpoint graphics, settlement claims, or releases.
- `creation_handoff` may offer thought anchors but never assign them to the creator. Create requires explicit adoption before a Cue-derived connection, countercase, or rule enters the draft.
- Query never calls any write, Paper trade, TradingView drawing, Frame mutation, correction, withdrawal, or publication tool.
- Ambiguous requests default here. Posts, viewpoint graphics, settlement, releases, publishing candidates, or confirmed TradingView drawings route to Create; tables, factual charts, and inspection remain Query.
- A `creation_handoff` is data lineage, not an implicit creation request. It names reusable result refs and warnings without drafting anything.
- Blocked queries return an ineligible empty handoff. Partial queries hand off only usable results, retain gaps internally, and state supported logic and material uncertainty without connector accounting.

## Output

Normalize cross-surface intent first, then the Query step with `references/modules/query-cuebook/references/cuebook-query-request-v1.schema.json`. Return the contract in `references/modules/query-cuebook/references/cuebook-query-bundle-v1.schema.json`. Validate it with:

```bash
node references/modules/query-cuebook/scripts/validate_cuebook_intent.mjs cuebook-intent-v1.json
node references/modules/query-cuebook/scripts/validate_query_request.mjs query-request-v1.json
node references/modules/query-cuebook/scripts/validate_query_bundle.mjs query-bundle-v1.json
```

When used, validate the workbench with `node references/modules/query-cuebook/scripts/validate_tradingview_observation.mjs tradingview-observation-v1.json`; validate a requested chart image with `node references/modules/query-cuebook/scripts/validate_tradingview_focused_capture.mjs tradingview-focused-capture-v1.json`.

Use `assets/plugin/query-menu-v1.json` for product-facing query types and `assets/plugin/cuebook-modules-v1.json` for the enforced module boundary.
