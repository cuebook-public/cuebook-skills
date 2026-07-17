import test from "node:test";
import assert from "node:assert/strict";

import { buildPack, ValueError } from "../scripts/compute_indicators.mjs";

function point(index, close, state = "sealed") {
  return {
    observed_at: `2026-07-${String(index).padStart(2, "0")}T20:00:00Z`,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1000 + index * 10,
    vwap: close - 0.5,
    state,
  };
}

function chartData(forming = false) {
  const primaryPoints = [];
  const benchmarkPoints = [];
  for (let index = 1; index < 16; index += 1) {
    primaryPoints.push(point(index, 100 + index));
    benchmarkPoints.push(point(index, 50 + index * 0.25));
  }
  if (forming) {
    primaryPoints.push(point(16, 120, "forming"));
    benchmarkPoints.push(point(16, 54.5, "forming"));
  }
  return {
    schema_version: "thesis-chart-data-v1",
    series: [
      {
        id: "S1",
        ticker: "AAA",
        observed_interval: "1d",
        baseline: { value: 100 },
        points: primaryPoints,
      },
      {
        id: "S2",
        ticker: "BBB",
        observed_interval: "1d",
        baseline: { value: 50 },
        points: benchmarkPoints,
      },
    ],
  };
}

function request(includeForming = false) {
  return {
    schema_version: "indicator-request-v1",
    request_id: "INDREQ_example20260714",
    source_ref: "CHART_example20260714:data",
    source_path: "/tmp/not-used.json",
    primary_series_ref: "S1",
    benchmark_series_ref: "S2",
    include_forming: includeForming,
    indicators: [
      { id: "I1", kind: "return_pct", lookback_bars: null },
      { id: "I2", kind: "relative_strength_pct", lookback_bars: null },
      { id: "I3", kind: "rsi", lookback_bars: 14 },
    ],
  };
}

// unittest assertAlmostEqual(a, b): round(a - b, 7) == 0.
function assertAlmostEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.5e-7, `${actual} !~= ${expected}`);
}

test("test_sealed_indicator_pack", () => {
  const pack = buildPack(request(), chartData());
  assert.equal(pack.quality_report.decision, "ready");
  const results = {};
  for (const item of pack.results) results[item.kind] = item;
  assertAlmostEqual(results.return_pct.value, 15.0);
  assertAlmostEqual(results.relative_strength_pct.value, 7.5);
  assert.equal(results.rsi.status, "ready");
});

test("test_forming_values_are_provisional", () => {
  const pack = buildPack(request(true), chartData(true));
  assert.equal(pack.quality_report.decision, "conditional");
  assert.ok(pack.results.every((item) => item.status === "provisional"));
});

test("test_insufficient_history_is_explicit", () => {
  const item = request();
  item.indicators = [{ id: "I1", kind: "rsi", lookback_bars: 30 }];
  const pack = buildPack(item, chartData());
  assert.equal(pack.results[0].status, "insufficient_data");
  assert.equal(pack.results[0].value, null);
});

test("test_mixed_intervals_are_rejected", () => {
  const data = chartData();
  data.series[1].observed_interval = "1h";
  assert.throws(() => buildPack(request(), data), ValueError);
});
