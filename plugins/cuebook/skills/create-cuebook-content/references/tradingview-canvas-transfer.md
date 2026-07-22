# TradingView Canvas Transfer

Read this reference only when the creator explicitly asks to place a Cuebook idea on their TradingView chart, or accepts one concise offer to do so. This is optional canvas support, not part of normal Frame creation or publication. Use `tradingview_desktop`; the read-only `tradingview_research` connector cannot write to a chart.

The transfer carries creator-approved meaning into a local chart. It never turns a provider stance into the creator's stance, never executes a trade, and never publishes a Frame. Keep connector names, Tool names, contracts, and recovery mechanics backstage.

## Preconditions

1. The local Desktop connector is already available and healthy. Do not install it, launch TradingView with a debug port, update it, or alter account settings on the creator's behalf.
2. Resolve the Cuebook asset and TradingView symbol exactly, including venue, quote currency, and instrument type. A fuzzy result is only a candidate. Never substitute a proxy unless the creator explicitly chooses it after the difference is explained.
3. Bind every drawing to a creator-confirmed meaning lock, a Cuebook result, or an adopted TradingView observation. Research-provider `BUY`, `SELL`, score, confidence, unusual-activity, or backtest output is evidence context only.
4. A Frame and a TradingView canvas remain separate artifacts. TradingView pixels, raw market data, and Pine source never enter Frame media. If the creator wants the same idea as a Frame, retrieve eligible Cuebook data and rerender the adopted semantic geometry through the normal Fast Preview path.

If the connector is absent, say simply that local TradingView canvas support is unavailable and continue the Cuebook conversation. Do not block research or Frame work.

## Prepare one bounded plan

Translate the adopted idea into the smallest useful set of primitives:

- decision level → `horizontal_line`
- decision zone → `rectangle`
- dated checkpoint → `vertical_line`
- compact creator wording → `text`
- observed historical slope → `trend_line`

Default to at most six primitives; use more only when the creator specifically asks for a detailed transfer, and never exceed twelve. Do not draw decorative noise. A trend line may connect only observations at or before the viewpoint cutoff. Do not fabricate a future price path. A horizontal decision level or explicitly described future decision zone is a condition, not a price forecast.

Describe the exact plan once in ordinary language, including symbol and timeframe, then ask for one confirmation. Example: “I can put the 118.5k decision line and the July checkpoint on your BTCUSD 4H chart. Shall I place those two marks?” The confirmation authorizes only that enumerated drawing plan; any new or changed primitive needs a new confirmation.

Build and validate `tradingview-canvas-transfer-v1` before the first write. A prepared, unconfirmed transfer must not stage or mutate the chart.

## Apply as a drawing transaction

After confirmation:

1. Read chart state and list existing drawing entity IDs.
2. If needed, stage the exact symbol and timeframe. Remember the initial chart state.
3. Call `draw_shape` once per confirmed primitive. Record the returned entity ID immediately.
4. Verify each created entity with `draw_get_properties`, then list drawings again. Existing entity IDs must remain untouched.
5. Restore any staged symbol or timeframe and verify the restoration. Keep the staged chart only when the creator explicitly asks to keep it.
6. Validate the final transfer record before reporting success.

The only allowed lifecycle is defined by `tradingview-canvas-tool-policy-v1.json`. Never call `draw_clear`. Never create or delete alerts, edit watchlists, write or save Pine, place replay trades, run arbitrary UI actions, update the connector, or inspect Pine source through this flow.

If a draw fails, stop the batch and remove only entity IDs created by this transfer with `draw_remove_one`. The default outcome is an atomic rollback. Use `partial` only when cleanup itself cannot be verified; state plainly which requested marks remain without exposing internal IDs. Never delete a pre-existing or untracked drawing.

## Local visual check and Frame bridge

A chart screenshot is optional and requires the creator's request or acceptance. Read `$query-cuebook/references/tradingview-focused-capture.md`; use a chart-region, latest-structure capture rather than a full desktop screenshot. The canvas-transfer artifact stays local. An explicitly requested official snapshot may reach Frame only through the separate attributed finished-bitmap contract, never through this drawing transaction.

When the creator asks for a Frame from this workbench:

1. Preserve only the adopted hypothesis, levels, zones, dated checkpoint, and source lineage.
2. Re-query the exact asset through Cuebook for eligible data and freshness.
3. Build the normal meaning lock and Fast Preview from those Cuebook results.
4. Render a native 2488 × 1056 Frame. If the creator instead explicitly chooses official snapshot pixels, leave this canvas flow and validate the attributed finished-bitmap route; do not treat a raw canvas capture as publishable.

After a successful canvas transfer, respond in one or two short sentences naming what was placed and where. Continue the market conversation naturally; do not present an execution log or another checklist.
