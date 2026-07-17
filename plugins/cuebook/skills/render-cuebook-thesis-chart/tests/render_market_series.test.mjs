import assert from "node:assert/strict";
import test from "node:test";

import { load_canonical_series } from "../scripts/render_thesis_chart.mjs";

const chartSpec = () => ({ time: { context_start: "2026-07-13T00:00:00Z", horizon_end: "2026-07-14T20:00:00Z", bar_limit: 90 } });
const seriesSpec = () => ({ id: "S1", ticker: "USO", instrument_id: "USO:ARCX", role: "primary", transformation: "return_from_baseline", baseline: { value: 100 }, provider: { requested_interval: "15m" } });
const marketBatch = () => ({
  schema_version: "market-series-batch-v1", fetched_at: "2026-07-14T14:01:00Z",
  series: [{
    series_ref: "S1", instrument_id: "USO:ARCX", ticker: "USO", interval: "15m", coverage_status: "complete",
    source_ref: "cuebook-db:ohlcv:USO:15m", provider_id: "cuebook-ohlcv", venue: "ARCX", currency: "USD",
    timezone: "America/New_York", calendar_ref: "XNYS", session: "regular", quote_basis: "trade",
    adjustment_basis: "split_adjusted", source_as_of: "2026-07-14T13:52:00Z", license_scope: "display", quality_flags: [],
    bars: [
      { open_time: "2026-07-14T13:30:00Z", observed_at: "2026-07-14T13:45:00Z", open: 100, high: 102, low: 99.5, close: 101, volume: 1000, vwap: 100.7, state: "sealed", last_event_time: null },
      { open_time: "2026-07-14T13:45:00Z", observed_at: "2026-07-14T13:52:00Z", open: 101, high: 103, low: 100.8, close: 102.5, volume: 800, vwap: 102, state: "forming", last_event_time: "2026-07-14T13:52:00Z" },
    ],
  }],
});

test("loads database export and marks forming bar", () => {
  const result = load_canonical_series(chartSpec(), seriesSpec(), marketBatch());
  assert.equal(result.observed_interval, "15m");
  assert.ok(Math.abs(result.points[0].derived_value - 1) < 1e-12);
  assert.ok(Math.abs(result.points[1].derived_value - 2.5) < 1e-12);
  assert.equal(result.forming_as_of, "2026-07-14T13:52:00Z");
  assert.equal(result.adjustment_basis, "split_adjusted");
  assert.equal(result.license_scope, "display");
});

test("rejects ticker mismatch", () => {
  const batch = marketBatch();
  batch.series[0].ticker = "XLE";
  assert.throws(() => load_canonical_series(chartSpec(), seriesSpec(), batch), /Ticker mismatch/);
});
