# TradingView Focused Capture

Read this reference only when the creator asks to see, inspect, reuse, or publish a TradingView chart image. A focused capture is a deliberate view of the chart's relevant latest structure, not a full desktop screenshot and not a substitute for structured reads.

## Select the information surface

1. State the visual question in one clause: latest structure, named decision levels, a creator-selected window, or necessary full context.
2. Read the latest bars, visible range, named lines, labels, boxes, and relevant indicator values before changing the viewport. Identify:
   - the latest completed bar;
   - the named level or zone;
   - the nearest swing or event anchor needed to understand it;
   - the price axis and enough time context to interpret distance and sequence.
3. Choose the smallest window that contains those targets. For `latest_structure`, prefer 24–80 visible bars and never exceed 120 without an explicit creator window. Keep an older peak or event only when the claim depends on it.
4. Exclude profile headers, post copy, large blank margins, position cards, toolbars, unrelated panes, and history before the selected anchor. Do not remove contrary candles, failed tests, or a level merely because they weaken the proposed view.

## Capture at useful density

1. Freeze the initial chart state and visible range.
2. If necessary, use reversible fullscreen or pane focus, then set the selected visible range. Serialize these calls.
3. Call `capture_screenshot` with `region: "chart"` and `wait_for_render: true`. Never use `region: "full"` for a chart image.
4. Prefer at least 1244 × 800 source pixels. A complete focused capture gives the chart at least 80% of the output area, places the latest completed bar between 55% and 90% of the image width, and keeps the price axis, time context, and key annotations legible.
5. Preserve chart geometry. Never stretch one axis independently, move labels away from their marks, crop away required TradingView attribution, or enlarge a low-resolution social screenshot until candles and text become soft.
6. Inspect one result at native size and at its intended conversation or Frame display size. Repair the viewport once when necessary; do not return a gallery of near-duplicate crops.
7. Restore the initial visible range, fullscreen state, pane, symbol, and timeframe, then verify restoration. Keep the focused layout only when the creator explicitly asks.

The preferred result resembles a chart-first crop: recent candles, the relevant reference swing, decision levels, annotations, and price scale fill the surface. The social wrapper and empty page do not.

## Local and Frame use

Validate `TradingViewFocusedCaptureV1` with:

```bash
node scripts/validate_tradingview_focused_capture.mjs tradingview-focused-capture-v1.json
```

Three outcomes are allowed:

- `local_only`: a CDP chart capture remains `local_analysis_only` and may be shown in the current conversation.
- `cuebook_native_rerender`: adopt only the qualitative relationship, re-fetch eligible Cuebook data, and render a native Cuebook Frame.
- `attributed_finished_bitmap`: use only when the creator explicitly wants the snapshot pixels and the source is an official TradingView snapshot. Preserve visible TradingView attribution at no less than 13 px at final display size, confirm rights to every creator/Pine overlay, remove private account or order details, bind any displayed mutable price to the matching Cuebook backend lock, preserve geometry without non-uniform scaling, and produce one audited 1866 × 1200 finished bitmap with the Cuebook wordmark.

The audited Desktop bridge's `method: "api"` may trigger TradingView's Snapshot function without returning a local file path. If that happens, ask the creator to save or attach the official snapshot, or use native rerendering. Never substitute a CDP capture for the publication source merely to keep the flow moving.

TradingView permits chart snapshots in publications when its attribution remains clearly visible; its Snapshot function is the preferred source. See [TradingView attribution terms](https://www.tradingview.com/policies/) and [snapshot sharing guidance](https://www.tradingview.com/support/solutions/43000482537-how-to-share-a-snapshot/). This does not grant rights to another creator's annotations, private information, or third-party Pine work. A screenshot copied from another person's post with unknown overlay rights stays local or routes to a Cuebook-native rerender.

A raw capture is never uploaded directly. The attributed path must pass the existing `finished_bitmap` imagery, legibility, collision, exact-dimension, hash, and publication checks. If any publication condition is missing, fall back to native rerender without delaying the creator's thinking process.
