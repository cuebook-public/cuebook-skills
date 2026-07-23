# Attributed TradingView Snapshot

Use snapshot pixels only after explicit selection and validation of `references/modules/query-cuebook/references/tradingview-focused-capture-v1.schema.json`. Accept an official snapshot only when the focused chart and axes are legible, TradingView attribution remains at least 13 px at final display size, overlay rights are known, private UI is absent, geometry is undistorted, and any mutable current or entry price has a backend lock.

Prepare `tradingview-attributed-frame-job-v1.schema.json`, inspect the bottom-right Cuebook wordmark safe zone, then run:

```bash
node scripts/build_tradingview_attributed_frame.mjs job.json \
  --asset-root DIR \
  --output-dir DIR
```

The runner requires the exact snapshot file selected during focus and a near-1.56:1 chart. It never stretches axes or blindly crops labels. It uniformly fits the source, stamps the canonical wordmark, and locally audits one 1866 × 1200 `finished_bitmap`. After that, Frame receives the ordinary PNG through its existing hash-and-size upload contract; focus and audit bookkeeping stay local. A source mismatch, unsafe aspect, missing rights state, private UI, unknown overlay rights, clipped attribution, or failed audit stops this route and returns to native rerender. Publication remains a separate explicit action.
