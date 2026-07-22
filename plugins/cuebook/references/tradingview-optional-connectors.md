# Optional TradingView Connectors

Cuebook keeps TradingView support optional. The Cuebook package does not install, launch, update, authenticate, or silently depend on either third-party server. A creator can connect neither, either, or both; Query and Frame creation continue through Cuebook when they are absent.

Use distinct host names because both upstream projects call themselves `tradingview` by default:

| Host name | Upstream | Cuebook role |
| --- | --- | --- |
| `tradingview_desktop` | [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | Inspect the creator's local TradingView Desktop chart and, after one exact confirmation, place bounded annotations on it. |
| `tradingview_research` | [atilaahmettaner/tradingview-mcp](https://github.com/atilaahmettaner/tradingview-mcp) | Add a small read-only network research pass for named gaps such as multi-timeframe checks, extended hours, options, futures, news, or a transparent stress test. |

The audited Cuebook policy targets Desktop commit `0ac960ad548597d0d1e5fb2bf7bd9a7a50faa87b` and research commit `6755ba02bb05a933eabeefe8f27121171ec781a7`. Review upstream changes before moving those versions; never enable newly added Tools merely because they appear at runtime.

## Host configuration shape

Configure these outside the Cuebook plugin so the creator consciously owns the local path, Python environment, Desktop debug mode, and any third-party credentials. Adapt the config location to the host:

```json
{
  "mcpServers": {
    "tradingview_desktop": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/tradingview-mcp/src/server.js"]
    },
    "tradingview_research": {
      "command": "/ABSOLUTE/PATH/uvx",
      "args": ["--python", "3.13", "--from", "tradingview-mcp-server", "tradingview-mcp"]
    }
  }
}
```

Do not copy the placeholders literally. Pin or locally review the Desktop checkout, run its tests, and use an absolute path. The research connector can instead run from a reviewed source checkout with `uv run tradingview-mcp`. `MARKETAUX_API_TOKEN` is optional and belongs in the host's private environment only; without it, Cuebook skips token-dependent news rather than asking for a secret in conversation.

Restart the host after changing MCP configuration and verify the new Tool surfaces in a fresh task. The optional connectors do not share Cuebook OAuth and must never be used to diagnose or repair the Cuebook login.

## Desktop consent and isolation

TradingView Desktop must already be installed and deliberately launched by the creator with CDP on localhost. Keep the endpoint bound to `127.0.0.1`; never expose port 9222 to a LAN, VPN, container bridge, or public interface. Cuebook does not call `tv_launch`, `tv_discover`, `tv_update`, or arbitrary UI execution.

The read-only workbench may inspect chart state, bounded OHLCV summaries, named study values, filtered Pine-rendered lines/labels/tables/boxes, and one optional focused chart capture. For that capture it preserves the latest completed bar, price axis, time context, named levels, and required swing anchor; it excludes surrounding desktop or social UI, uses the chart region, and restores the prior viewport. The separately confirmed canvas transfer may draw only levels, zones, time markers, compact text, and historical trend segments. It records every created drawing ID, never calls `draw_clear`, restores staged chart state, and removes only its own IDs on rollback.

Alerts, watchlist edits, Pine source reads/writes/saves, replay trades, arbitrary mouse/keyboard/UI actions, self-update, and debug launch remain outside Cuebook.

## Research interpretation

The research connector is a supplementary provider, not a second source of truth. Cuebook may use one targeted batch and at most one explicit scanner. It ignores provider `BUY`/`SELL` labels, confidence scores, opaque combined recommendations, and trade-plan outputs. Backtests are simplified derived stress tests, not proof; preserve the period, rules, costs, sample/trade count, provider, and train/test split. “Unusual options” means only the reported volume/open-interest mechanics, never proof of institutional intent.

Every TradingView-derived source is registered as restricted. A CDP chart capture may be shown locally but never uploaded raw. The default Frame route resolves the exact asset again, fetches eligible Cuebook data, recomputes reproducible geometry, and natively renders the standard 2488 × 1056 image.

When the creator explicitly wants the snapshot pixels, Cuebook may instead accept an official TradingView snapshot through the existing finished-bitmap path. The focused chart must preserve visible TradingView attribution at 13 px or larger at final display size, have known rights to creator or Pine overlays, omit private account and order information, retain undistorted chart geometry, bind any mutable displayed price to a matching backend lock, include the Cuebook wordmark, and pass the finished-bitmap audit. TradingView's [attribution terms](https://www.tradingview.com/policies/) permit snapshots in publications when attribution remains visible. Another creator's social-post chart with unknown overlay rights stays local or routes to native rerender.

## Smoke checks

Use a fresh task and test only the connector the creator enabled:

- Desktop: ask for a latest-structure capture of the current chart; confirm the chart fills the image, the latest bar and price scale remain legible, surrounding UI is absent, and the original viewport is restored. Then explicitly approve one temporary test annotation and verify rollback removes only that new drawing.
- Research: ask for one named multi-timeframe check; confirm the answer states provider/time, does not adopt a recommendation label, and does not enter Frame handoff directly.
- Frame bridge: first ask for native rerender and confirm Cuebook re-fetches its own candles. Then test an official snapshot and confirm it is blocked unless attribution, overlay rights, price lock, exact dimensions, creator choice, and finished-bitmap review all pass.
