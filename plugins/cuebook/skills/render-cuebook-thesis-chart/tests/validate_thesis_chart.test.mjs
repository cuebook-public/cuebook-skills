import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { render_svg } from "../scripts/render_thesis_chart.mjs";
import { validate } from "../scripts/validate_thesis_chart.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "thesis-chart-base.json"), "utf8"));
const baseSpec = () => structuredClone(fixture);
const codes = (result, key = "errors") => new Set(result[key].map((entry) => entry.code));

test("valid relative conditional chart", () => {
  const result = validate(baseSpec());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(codes(result, "warnings").has("DEGRADED_INTERVAL"));
});

test("Frame-native 1866 width is accepted", () => {
  const item = baseSpec();
  item.render.width = 1866;
  assert.equal(validate(item).valid, true);
});

const mutations = [
  ["relative baseline synchronization", (item) => { item.series[1].baseline.observed_at = "2026-07-13T19:59:00Z"; }, "RELATIVE_BASELINE_TIME"],
  ["future path", (item) => { item.render.forecast_path = "projected_curve"; }, "FORECAST_PATH"],
  ["degraded ready chart", (item) => { item.state = "ready"; item.quality_report = { decision: "ready", warnings: [], hard_failures: [] }; }, "READY_INTERVAL"],
  ["wait-for-trigger annotation", (item) => { item.claim.action_state = "wait_for_trigger"; }, "TRIGGER_ANNOTATION"],
  ["candle price axis", (item) => { Object.assign(item.claim, { evaluation_kind: "price_target", direction: "long" }); item.series = item.series.slice(0, 1); item.series[0].transformation = "raw_price"; Object.assign(item.render, { mode: "single_price", chart_type: "candles", y_axis: "return_pct" }); }, "CANDLE_AXIS"],
  ["decision declaration", (item) => { Object.assign(item.render, { brand: "cuebook", watermark: true, timeline_layout: "decision_split", decision_split_ratio: 0.68, show_settlement_panel: true }); item.annotations = item.annotations.filter((entry) => entry.kind !== "declaration"); }, "DECLARATION_ANNOTATION"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => {
    const item = baseSpec();
    mutate(item);
    const result = validate(item);
    assert.equal(result.valid, false);
    assert.ok(codes(result).has(expected));
  });
}

test("open-ended evidence trigger does not invent expiry", () => {
  const item = baseSpec();
  item.role = "evidence";
  item.claim.action_state = "wait_for_trigger";
  Object.assign(item.time, { horizon_status: "unspecified", horizon_end: null, horizon_seconds: null });
  Object.assign(item.render, { future_region: false, timeline_layout: "continuous_time" });
  item.annotations = item.annotations.filter((entry) => entry.kind !== "expiry");
  item.annotations.push({ id: "A4", kind: "trigger", series_ref: "S1", value: 120, observed_at: null, label: "TRIGGER", provenance: "explicit", source_ref: "creator:test" });
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("volume panel requires one series and valid window", () => {
  const item = baseSpec();
  Object.assign(item.render, { show_volume: true, volume_average_window: 4 });
  const result = validate(item);
  assert.ok(codes(result).has("VOLUME_SERIES"));
  assert.ok(codes(result).has("VOLUME_WINDOW"));
});

test("compact chart keeps success prose outside SVG", () => {
  const item = baseSpec();
  Object.assign(item.render, { style_profile: "cuebook_feed_v1", theme: "cuebook_light", brand: "cuebook", watermark: true, show_state_label: false, show_provenance_footer: false, show_guide: false, locale: "en-US", timeline_layout: "decision_split", decision_split_ratio: 0.68, show_settlement_panel: false });
  const fetched = [
    { ticker: "USO", role: "primary", observed_interval: "1d", points: [{ observed_at: "2026-07-13T20:00:00Z", derived_value: 0, state: "sealed" }, { observed_at: "2026-07-14T08:00:00Z", derived_value: 2, state: "forming" }] },
    { ticker: "XLE", role: "benchmark", observed_interval: "1d", points: [{ observed_at: "2026-07-13T20:00:00Z", derived_value: 0, state: "sealed" }, { observed_at: "2026-07-14T08:00:00Z", derived_value: 0.5, state: "forming" }] },
  ];
  const svg = render_svg(item, fetched);
  assert.equal(svg.includes(item.render.success_label), false);
  assert.match(svg, /Settle/);
  assert.doesNotMatch(svg, /Cuebook OHLCV|CONDITIONAL/);
  assert.match(svg, /data-style-profile="cuebook_feed_v1"/);
  assert.match(svg, /Cuebook/);
});

test("feed profile rejects internal copy and detail panel", () => {
  const item = baseSpec();
  Object.assign(item.render, { style_profile: "cuebook_feed_v1", watermark: true, show_settlement_panel: true, subtitle: "Cuebook extracts parameters from the viewpoint description" });
  const result = validate(item);
  assert.ok(codes(result).has("FEED_SETTLEMENT_PANEL"));
  assert.ok(codes(result).has("FEED_INTERNAL_COPY"));
});

test("volume panel renders bars, prior average, and ratio", () => {
  const item = baseSpec();
  Object.assign(item.claim, { evaluation_kind: "directional_return", direction: "long", action_state: "wait_for_trigger", statement: "BTC closes above 65,000 on expanding volume." });
  item.series = item.series.slice(0, 1);
  Object.assign(item.series[0], { ticker: "BTC", display_name: "Bitcoin", instrument_id: "BTC:USD", asset_id: 1, transformation: "raw_price" });
  Object.assign(item.series[0].baseline, { value: 64000, unit: "USD" });
  Object.assign(item.render, { mode: "single_price", chart_type: "candles", y_axis: "price", width: 720, height: 420, future_region: false, show_volume: true, volume_average_window: 20, theme: "cuebook_light", style_profile: "cuebook_feed_v1", watermark: true, locale: "en-US", timeline_layout: "continuous_time", title: "High-volume close above 65,000", subtitle: "BTC / USD · 4H" });
  item.annotations.push({ id: "A4", kind: "trigger", series_ref: "S1", value: 65000, observed_at: null, label: "65,000 trigger", provenance: "explicit", source_ref: "creator:test" });
  const start = Date.UTC(2026, 6, 10);
  const points = Array.from({ length: 25 }, (_, index) => {
    const open = 63000 + index * 70;
    const close = open + (index % 2 === 0 ? 120 : -80);
    return { observed_at: new Date(start + index * 4 * 3600_000).toISOString().replace(".000Z", "Z"), open, high: Math.max(open, close) + 110, low: Math.min(open, close) - 90, close, volume: 900 + index * 25, derived_value: close, state: "sealed" };
  });
  const fetched = [{ ticker: "BTC", role: "primary", observed_interval: "4h", points }];
  const svg = render_svg(item, fetched);
  assert.match(svg, /<g id="volume-panel" data-average-window="20">/);
  assert.match(svg, /class="volume-bar"/);
  assert.match(svg, /id="volume-average"/);
  assert.match(svg, /id="volume-ratio"/);
  assert.match(svg, /prior 20-bar average/);
  item.render.show_volume = false;
  assert.doesNotMatch(render_svg(item, fetched), /id="volume-panel"/);
});
