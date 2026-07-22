# TradingView Local Workbench

Use this module only when the creator explicitly asks to inspect TradingView, refers to the chart currently open in their TradingView Desktop workspace, asks for TradingView-backed screening or stress testing, or accepts one of those optional research aids. It is not a silent fallback market-data provider and never runs merely because a Cuebook read is thin.

## Boundary

- Treat both upstreams as optional and separately installed. Give them distinct host connector names because both projects default to `tradingview`:
  - `tradingview_desktop`: `tradesdontlie/tradingview-mcp`, the 84-Tool local Desktop/CDP bridge audited in `tradingview-tool-policy-v1.json`.
  - `tradingview_research`: `atilaahmettaner/tradingview-mcp`, the 37-Tool network research server audited in `tradingview-research-policy-v1.json`.
  The live Tool lists remain runtime truth. A creator may connect either one or both.
- Require TradingView Desktop, a valid TradingView subscription, Node.js 18+, and CDP bound only to localhost. Never expose port 9222 to a network, install the bridge, launch debug mode, or update its source from a normal Query or Create run.
- Both upstream codebases are MIT. TradingView software, trademarks, Pine intellectual property, screenshots, and third-party market data are not covered by those licenses. Keep every raw Desktop capture `local_analysis_only`.
- Never upload a raw CDP screenshot, bar series, quote, indicator payload, strategy report, or Pine source to Frame. A separately validated official snapshot may use the attributed finished-bitmap path in [TradingView Focused Capture](tradingview-focused-capture.md); all other Frame graphics require Cuebook-native rerendering.
- TradingView may clarify the creator's question, expose a locally visible relationship, or help the creator adopt a qualitative hypothesis. A publishable factual curve must be rebuilt from Cuebook `get_candles`, `get_market_state`, or another source whose registered usage rights permit display or transform.

## Readiness And Identity

1. If an optional Tool surface is absent, continue with Cuebook data when that still answers the request. Mention only the missing optional capability; do not infer a Cuebook login failure or install anything automatically.
2. When the Desktop surface exists and is requested, call `tv_health_check` once. Then call `chart_get_state` once and preserve symbol, timeframe, chart type, pane, and tab context available in the result.
3. Resolve the creator's asset through Cuebook `search_assets`. Compare it with TradingView `symbol_info` or `symbol_search`, including venue, contract, share class, currency, and instrument type. Do not equate display tickers alone.
4. An exact match may proceed. An ambiguous mapping stops the asset-bound read. A proxy, continuous future, index substitute, synthetic pair, or alternate venue requires the creator to accept that changed subject before use; record `user_confirmed_proxy`.
5. Never repair an unresolved identity by silently switching the chart or choosing the nearest search result.

## Bounded Research Pass

Run at most one serialized Desktop batch and one targeted research batch per request. Use both policy JSON files as the complete 84-Tool and 37-Tool classifications.

- Default pass: current-chart `quote_get`, `data_get_study_values`, `data_get_ohlcv` with `summary: true`, and only the relevant filtered Pine lines, labels, tables, or boxes. Do not call every reader by default.
- Use `study_filter` whenever the creator names an indicator. Keep Pine `verbose` false. Cap OHLCV at 20 bars for a quick read and 100 for a focused read; use 500 only when the creator specifically requests the individual history.
- Take `capture_screenshot` only when pixels answer a question the structured reads cannot. Read [TradingView Focused Capture](tradingview-focused-capture.md), stage the smallest relevant latest window, use `region: "chart"` with `wait_for_render: true`, and validate one high-density image. A raw CDP file remains local.
- Treat strategy results and replay state as TradingView workspace observations, not Cuebook Paper Trade records or Frame settlement evidence.
- Never use persistent-state or security-sensitive Tools from this bridge. That excludes alerts, watchlist changes, drawings, Pine writes/saves, replay trades, raw UI automation, `ui_evaluate`, `tv_update`, and debug launch. A creator who separately requests one of those workflows must leave this read-only Cuebook bridge and receive the upstream workflow's own confirmation and safety handling.

For the network research connector, prefer a small useful subset:

- `coin_analysis`, `multi_timeframe_analysis`, and `volume_confirmation_analysis` for a focused technical foothold;
- `financial_news` only when its Marketaux token is configured and each retained item carries the original URL and attribution;
- `stock_extended_hours`, `stock_options_chain`, `futures_market_overview`, and `futures_category_snapshot` for a named gap Cuebook does not already answer;
- `backtest_strategy`, `compare_strategies`, and `walk_forward_backtest_strategy` only as derived stress tests with period, strategy rules, costs, sample size, provider, and train/test split preserved.

Use at most one on-demand scanner for an explicit screen. A scanner result is a discovery lead that still requires Cuebook identity resolution. Ignore provider BUY/SELL labels, confidence scores, and trade-plan language. Do not call `multi_agent_analysis`, `combined_analysis`, or `egx_trade_plan`: their opaque heuristic stance duplicates work Cuebook should reason through transparently. Describe unusual-options output only as volume/open-interest mechanics, never as proof of institutional intent.

## Reversible Chart Staging

When the creator explicitly asks to inspect another symbol, timeframe, visible range, pane, or indicator:

1. Freeze the initial state.
2. Use only the smallest `reversible_session` Tool sequence.
3. Collect the requested observation.
4. Restore the initial state and verify it with one final state read. If the creator explicitly asks to keep the new layout, record `preserved_by_user` instead.
5. A failed restoration makes the observation partial and must be stated plainly.

Do not run independent chart-switching calls in parallel. The TradingView workspace is stateful; serialize them. Cuebook and authorized Web reads may still run concurrently because they do not share that UI state.

## Output And Frame Bridge

Return a compact `TradingViewObservationV1` and validate it with:

```bash
node scripts/validate_tradingview_observation.mjs tradingview-observation-v1.json
```

When a screenshot is requested, also return and validate `TradingViewFocusedCaptureV1`:

```bash
node scripts/validate_tradingview_focused_capture.mjs tradingview-focused-capture-v1.json
```

Register Desktop Query sources with `retrieved_via: tradingview_desktop_mcp`, `usage_rights: restricted`, and a non-public `tradingview://local/...` locator. Register network research with `retrieved_via: tradingview_research_mcp`, restricted rights, and either the original HTTP(S) source or a `tradingview-research://...` derived-observation locator. Use the truthful source type: market data, calculation, or news. Preserve the original URL and attribution for retained news.

Keep every result backed by that source out of `creation_handoff.result_refs`. The default Frame route is native rerendering:

1. Let them accept or reject only the qualitative connection learned from their local chart.
2. Re-resolve the exact asset in Cuebook.
3. Fetch Cuebook candles and market state for every visible number or curve.
4. Recompute any reproducible metric from the frozen Cuebook bars.
5. Confirm copy, settlement meaning, and the new Cuebook visual intent.
6. Render the standard 2488 × 1056 Cuebook PNG and publish only that finished image through the normal Frame path.

If Cuebook cannot reproduce the material geometry with publishable sources, keep the TradingView analysis local and block the factual Frame graphic. Never disguise a screenshot, manually transcribed series, or remembered number as a Cuebook-backed chart.

If the creator explicitly wants the chart snapshot pixels, do not pass the raw observation through `creation_handoff`. Validate the separate focused-capture contract. Only an official TradingView snapshot with retained attribution, known overlay rights, no private UI, a matching backend lock for any mutable price, exact Frame dimensions, creator confirmation, and the finished-bitmap audit may proceed. Otherwise use native rerendering.
