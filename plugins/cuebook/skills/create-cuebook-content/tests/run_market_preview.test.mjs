import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runFastPreviewJob } from "../scripts/run_fast_preview.mjs";
import { validateMarketPreviewJob } from "../scripts/run_market_preview.mjs";
import { validPaintedPng } from "./png_fixture.mjs";

function fakePng() {
  return validPaintedPng();
}

async function fakeRasterize(svg, output) {
  assert.match(readFileSync(svg, "utf8"), /<svg\b[^>]*width="2488"[^>]*height="1056"[^>]*viewBox="0 0 622 264"/u);
  writeFileSync(output, fakePng());
  return output;
}

async function fakeHeaderRasterize(svg, output) {
  assert.match(readFileSync(svg, "utf8"), /<svg\b[^>]*width="2488"[^>]*height="1056"[^>]*viewBox="0 0 622 264"/u);
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(2488, 16);
  png.writeUInt32BE(1056, 20);
  writeFileSync(output, png);
  return output;
}

function candles(ticker, scale = 1, drift = 0.8) {
  const bars = Array.from({ length: 24 }, (_, index) => {
    const openTime = new Date(Date.UTC(2026, 5, 24 + index)).toISOString();
    const wave = Math.sin(index / 2.4) * scale * 0.8;
    const open = scale * (100 + index * drift) + wave;
    const close = open + scale * (index % 4 === 0 ? -0.6 : 0.9);
    return {
      openTime,
      open: String(open),
      high: String(Math.max(open, close) + scale * 1.2),
      low: String(Math.min(open, close) - scale * 1.1),
      close: String(close),
      volume: String(1000 + index * 35 + (index % 5) * 90),
    };
  });
  return {
    data: { ticker, interval: "1d", bars, nextCursor: null },
    meta: { asOf: "2026-07-17T08:58:00Z", truncated: false },
  };
}

function leg(ticker, resultRef, scale, assetClass) {
  return {
    ticker,
    display_name: ticker === "BTC" ? "Bitcoin" : ticker,
    asset_id: ticker === "BTC" ? 1 : 2,
    asset_class: assetClass,
    result_ref: resultRef,
    market_state: { price: String(scale * 123), observedAt: "2026-07-17T08:57:00Z" },
    candles: candles(ticker, scale, ticker === "BTC" ? 0.9 : 0.35),
  };
}

function queryBinding() {
  return {
    required: true,
    status: "executed",
    bundle_refs: ["QRY_BTC_FAST_MARKET"],
    result_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
    as_of: "2026-07-17T08:58:00Z",
    warnings: [],
    unavailable_capabilities: [],
  };
}

export function baseMarketJob() {
  const title = "BTC Is Competing for the Next Risk-On Move";
  const body = "BTC has outperformed SPY over the same period. My view is not that capital has already rotated, but that around-the-clock liquidity is becoming the marginal choice. Over the next 30 days, watch whether this resilience persists and then turns into upside momentum.";
  return {
    schema_version: "frame-market-preview-job",
    preview: {
      preview_id: "FPREV_BTC_FAST_MARKET_001",
      state: "conditional",
      created_at: "2026-07-17T09:00:00Z",
      creator_view: {
        original_text: "BTC has refused to break lower, and I think it has another move up; capital may rotate into crypto when US equities pull back.",
        subject: "BTC",
        direction: "long",
        observation_window: "2026-06-24 to 2026-07-17",
        horizon: "Next 30 days",
        claim: "BTC's resilience may develop into the next move higher",
        mechanism: "When US equities are under pressure, marginal capital may seek assets with around-the-clock liquidity",
        next_watch: "First watch whether relative resilience persists, then whether it turns into upside momentum",
      },
      meaning_lock: {
        lock_id: "MLOCK_BTC_FAST_MARKET_001",
        status: "creator_confirmed",
        confirmed_at: "2026-07-17T08:59:00Z",
        title,
        body,
        subject: "BTC",
        direction: "long",
        horizon: "Next 30 days",
        claim: "BTC's resilience may develop into the next move higher",
        mechanism: "When US equities are under pressure, marginal capital may seek assets with around-the-clock liquidity",
        next_watch: "First watch whether relative resilience persists, then whether it turns into upside momentum",
        settlement: {
          mode: "standard_direction",
          family: "single_asset_direction",
          asset_ref: "asset:btc",
          direction: "long",
          requested_settle_at: "2026-08-16T09:00:00Z",
          session_policy: "at_instant",
          threshold_bps: "0",
          success_condition: "above_publication_baseline",
        },
        visual_intent: {
          summary: "Show dated price context, the tested relative-strength observation, the creator's mechanism, and the 30-day check.",
          required_beats: ["price_context", "tested_observation", "mechanism", "future_check", "settlement_clock"],
        },
      },
      query_binding: queryBinding(),
      candidates: [{
        candidate_id: "FPREV_CAND_BTC_FAST_MARKET_001",
        angle: "conviction",
        frame: {
          title,
          body,
        },
        evidence_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      }],
    },
    expressions: [{
      candidate_id: "FPREV_CAND_BTC_FAST_MARKET_001",
      creator_signal: {
        origin: "heuristic_interview",
        interview_text: "I am really watching whether persistent buying absorbs the selling pressure.",
        adoption_state: "adopted",
      },
      text_image_division: {
        title_job: "memorable_judgment",
        body_job: "mechanism_and_horizon",
        image_job: "evidence_and_time",
      },
      reader_job: "proof",
      analytic_relationship: "change_over_time",
      grammar: "curve_story",
      composition: "curve_stage",
      surface: "paper_signal",
      subject_label: "BTC",
      horizon_label: "30D LONG",
      data_status: "synthetic_fixture",
      data_as_of: "2026-07-17T08:58:00Z",
      source_label: "Synthetic test series",
      argument: {
        claim: { text: "Resilience may be early rotation", state: "creator_view", binding_id: "BIND_MARKET_CLAIM", source_refs: [] },
        observation: { text: "BTC has outperformed SPY over the same period", state: "derived", binding_id: "BIND_MARKET_OBSERVATION", source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"] },
        mechanism: { text: "Demand absorbs supply", state: "creator_view", binding_id: "BIND_MARKET_MECHANISM", source_refs: [] },
        implication: { text: "First watch resilience persist, then see whether it turns into upside momentum", state: "conditional", binding_id: "BIND_MARKET_IMPLICATION", source_refs: [] },
        countercase: { text: "If relative strength rolls over again, this thesis loses its footing", state: "conditional", binding_id: "BIND_MARKET_COUNTER", source_refs: [] },
      },
      observation_test: {
        kind: "primary_outperformed_benchmark",
        statement: "BTC has outperformed SPY over the same period",
        threshold: 0,
        supports_binding_ids: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_RELATIVE_CURVE"],
        source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      },
      time: {
        observation_start: "2026-06-24T00:00:00Z",
        declared_at: "2026-07-17T09:00:00Z",
        horizon_end: "2026-08-16T09:00:00Z",
        future_mode: "conditional_lanes",
        timezone: "UTC",
      },
      market: {
        main_transform: "raw_price",
        support_transform: "relative_spread",
        main_binding_ids: ["BIND_MARKET_BTC_CURVE"],
        support_binding_ids: ["BIND_MARKET_RELATIVE_CURVE"],
        chart_style: "candles",
        rolling_window: 10,
        show_volume: false,
        primary: leg("BTC", "RES_BTC_CANDLES", 600, "crypto"),
        benchmark: leg("SPY", "RES_SPY_CANDLES", 5, "equity"),
      },
      annotations: [{
        kind: "regime_start",
        label: "Relative resilience begins to widen",
        occurred_at: "2026-07-08T00:00:00Z",
        value: null,
        state: "derived",
        binding_id: "BIND_MARKET_REGIME",
        source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      }],
      future_beats: [
        { role: "checkpoint", label: "Relative strength holds", criterion: "5D relative strength versus SPY > 0", at: "2026-07-31T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_CHECKPOINT", source_refs: [] },
        { role: "confirmation", label: "Upside momentum follows", criterion: "BTC makes a new 20D high", at: "2026-08-16T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_CONFIRM", source_refs: [] },
      ],
    }],
  };
}

function setObservationTest(job, {
  kind,
  statement,
  threshold = 0,
  supports,
  sources = ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
}) {
  const candidate = job.preview.candidates[0];
  const expression = job.expressions[0];
  expression.argument.observation.text = statement;
  expression.argument.observation.source_refs = [...sources];
  const firstStop = candidate.frame.body.indexOf(".");
  const bodyTail = firstStop === -1 ? "" : candidate.frame.body.slice(firstStop + 1).trim();
  candidate.frame.body = bodyTail ? `${statement}. ${bodyTail}` : `${statement}.`;
  job.preview.meaning_lock.body = candidate.frame.body;
  expression.observation_test = {
    kind,
    statement,
    threshold,
    supports_binding_ids: supports,
    source_refs: [...sources],
  };
}

function makeCreatorOnly(job, observation) {
  job.preview.query_binding = {
    required: false, status: "not_required", bundle_refs: [], result_refs: [], as_of: null, warnings: [], unavailable_capabilities: [],
  };
  job.preview.candidates[0].evidence_refs = [];
  const expression = job.expressions[0];
  expression.data_status = "creator_only";
  expression.data_as_of = null;
  expression.source_label = "Creator scenario";
  expression.observation_test = null;
  expression.argument.observation = {
    text: observation,
    state: "creator_view",
    binding_id: "BIND_MARKET_OBSERVATION",
    source_refs: [],
  };
  expression.market = null;
  expression.annotations = [];
  job.preview.meaning_lock.visual_intent.required_beats = ["argument_structure", "mechanism", "future_check", "settlement_clock"];
}

test("MARKET compiles one sourced curve, a derived support panel, and an honest future lane", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const { frame, preview, report } = await runFastPreviewJob(baseMarketJob(), output, { rasterize: fakeRasterize });
    assert.equal(preview.candidates[0].visual_kind, "editorial_visual");
    assert.equal(preview.candidates[0].template_id, "curve_story");
    assert.equal(report.schema_version, "frame-preview-run-report");
    assert.equal(report.route, "market");
    assert.deepEqual(report.renders[0].market_transforms, { main: "raw_price", support: "relative_spread" });
    assert.equal(report.renders[0].design_family, "signal_poster");
    assert.equal(report.renders[0].narrative_placement, "side_right");
    assert.match(report.renders[0].design_fingerprint, /^curve_story\/curve_stage\/paper_signal\//u);
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-future-region="unresolved"/u);
    assert.match(svg, /data-chart-transform="relative_spread"/u);
    assert.doesNotMatch(svg, /data-chart-transform="raw_price"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_CONFIRM"/u);
    assert.match(svg, /data-data-status="synthetic_fixture"/u);
    assert.match(svg, /data-design-family="signal_poster"/u);
    assert.match(svg, /data-display-system="signal_sans"/u);
    assert.match(svg, /data-annotation-role="observation"/u);
    assert.match(svg, /data-role="creator-interpretation"/u);
    assert.match(svg, /data-role="next-watch"/u);
    assert.doesNotMatch(svg, /data-layout="open-beat"/u);
    assert.doesNotMatch(svg, /data-series-state="future"/u);
    assert.equal(report.renders[0].audit.single_master, true);
    assert.equal(report.renders[0].audit.mobile_display, "622x264");
    assert.ok(report.renders[0].audit.essential_copy_groups <= 3);
    assert.equal(report.renders[0].audit.essential_font_floor, 20);
    assert.equal(report.renders[0].audit.secondary_font_floor, 16);
    assert.equal(preview.state, "conditional");
    assert.equal(report.release_eligible, false);
    assert.match(preview.candidates[0].frame.alt_text, /historical price.*after the view date/iu);
    assert.equal(preview.candidates[0].image_sha256, `sha256:${createHash("sha256").update(fakePng()).digest("hex")}`);
    assert.equal(preview.candidates[0].image_byte_size, fakePng().length);
    assert.equal(Object.hasOwn(report.renders[0], "compact_image_ref"), false);
    assert.equal(Object.hasOwn(report.renders[0], "compact_audit"), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "frame-feed-622.svg")), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "viewpoint-622.png")), false);
    assert.deepEqual(Object.keys(frame), ["title", "body", "image_ref", "alt_text"]);
    assert.equal(frame.image_ref, `${preview.candidates[0].candidate_id}/viewpoint-2488.png`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(output, "frame.json"), "utf8")), frame);
    for (const privateField of ["state", "schema_version", "candidate_id", "query_binding", "image_sha256", "image_byte_size", "receipt", "scope"]) {
      assert.equal(Object.hasOwn(frame, privateField), false);
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET routes a drawdown argument to observed drawdown geometry", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.analytic_relationship = "deviation";
    expression.grammar = "drawdown_recovery";
    expression.composition = "divergence_field";
    expression.text_image_division.image_job = "comparison_and_time";
    expression.market.main_transform = "drawdown";
    expression.market.support_transform = "none";
    expression.market.main_binding_ids = ["BIND_MARKET_BTC_DRAWDOWN", "BIND_MARKET_SPY_DRAWDOWN"];
    expression.market.support_binding_ids = [];
    expression.market.chart_style = "line";
    setObservationTest(job, {
      kind: "primary_drawdown_shallower",
      statement: "BTC's maximum drawdown was shallower than SPY's over the same period",
      supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_BTC_DRAWDOWN", "BIND_MARKET_SPY_DRAWDOWN"],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-chart-transform="drawdown"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_BTC_DRAWDOWN"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_SPY_DRAWDOWN"/u);
    assert.match(preview.candidates[0].frame.alt_text, /drawdown.*recovery speed/iu);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET can express conditional futures without inventing a market curve", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.reader_job = "scenario";
    expression.analytic_relationship = "scenario_payoff";
    expression.grammar = "scenario_lanes";
    expression.composition = "scenario_field";
    expression.surface = "midnight";
    expression.text_image_division.image_job = "scenario_and_time";
    makeCreatorOnly(job, "BTC's resilience is the starting point for this view");
    expression.future_beats.push({
      role: "invalidation", label: "Relative strength fades", criterion: "5D relative strength versus SPY < 0",
      at: "2026-08-08T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_INVALIDATION", source_refs: [],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-grammar="scenario_lanes"/u);
    assert.match(svg, /data-geometry-type="conditional-lane"/u);
    assert.match(svg, /REASSESS IF/u);
    assert.doesNotMatch(svg, />INVALIDATION</u);
    assert.match(svg, /D\+22/u);
    assert.match(preview.candidates[0].frame.alt_text, /two possible paths/iu);
    assert.doesNotMatch(svg, /data-chart-transform=/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET rejects an unsupported causal claim masquerading as observed evidence", () => {
  const job = baseMarketJob();
  job.expressions[0].argument.mechanism.state = "observed";
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "BEAT_SOURCE"));
});

test("MARKET rejects an observed sentence when the frozen curves contradict it", () => {
  const job = baseMarketJob();
  setObservationTest(job, {
    kind: "benchmark_declined",
      statement: "SPY declined materially over the same period",
    threshold: 0,
    supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_RELATIVE_CURVE"],
    sources: ["RES_SPY_CANDLES"],
  });
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "OBSERVATION_UNSUPPORTED"));
});

test("MARKET refuses a synthetic fixture that masquerades as a ready preview", () => {
  const job = baseMarketJob();
  job.preview.state = "ready";
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "SYNTHETIC_STATE"));
});

test("MARKET image_render requires a fully decodable, materially painted PNG", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    await assert.rejects(
      () => runFastPreviewJob(baseMarketJob(), output, { rasterize: fakeHeaderRasterize }),
      /fully decodable PNG/u,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET rejects a future beat outside the declared horizon", () => {
  const job = baseMarketJob();
  job.expressions[0].future_beats[0].at = "2026-09-01T09:00:00Z";
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "FUTURE_BEAT_TIME"));
});

test("MARKET refuses exact title repetition inside the image", () => {
  const job = baseMarketJob();
  job.expressions[0].argument.claim.text = job.preview.candidates[0].frame.title;
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "TEXT_IMAGE_DIVISION"));
});

test("MARKET rejects a pair transform when the benchmark is missing", () => {
  const job = baseMarketJob();
  job.expressions[0].market.benchmark = null;
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "BENCHMARK_REQUIRED"));
});

test("MARKET renders a sourced event window and keeps its event marker before declaration", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.reader_job = "event";
    expression.analytic_relationship = "event_reaction";
    expression.grammar = "event_window";
    expression.composition = "timeline_rail";
    expression.market.support_transform = "none";
    expression.market.support_binding_ids = [];
    expression.market.benchmark = null;
    expression.market.chart_style = "line";
    expression.annotations = [{
      kind: "event", label: "Broad risk-asset drawdown", occurred_at: "2026-07-08T00:00:00Z", value: null,
      state: "reported", binding_id: "BIND_MARKET_EVENT", source_refs: ["RES_SPY_CANDLES"],
    }];
    setObservationTest(job, {
      kind: "primary_positive_after_event",
      statement: "BTC remained positive after the event",
      supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_BTC_CURVE", "BIND_MARKET_EVENT"],
      sources: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-composition="timeline_rail"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_EVENT"/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET renders an explicit threshold as state-changing geometry", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.reader_job = "trigger";
    expression.analytic_relationship = "trigger_state";
    expression.grammar = "threshold_regime";
    expression.composition = "threshold_field";
    expression.market.support_transform = "none";
    expression.market.support_binding_ids = [];
    expression.market.benchmark = null;
    expression.annotations = [{
      kind: "threshold", label: "Upside confirmation line", occurred_at: null, value: 70000,
      state: "creator_view", binding_id: "BIND_MARKET_THRESHOLD", source_refs: [],
    }];
    setObservationTest(job, {
      kind: "latest_above_threshold",
      statement: "BTC's latest daily bar remains above the confirmation line",
      threshold: 70000,
      supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_BTC_CURVE", "BIND_MARKET_THRESHOLD"],
      sources: ["RES_BTC_CANDLES"],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-composition="threshold_field"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_THRESHOLD"/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET compiles rolling correlation from synchronized returns without causal wording", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.reader_job = "comparison";
    expression.analytic_relationship = "correlation";
    expression.grammar = "correlation_shift";
    expression.composition = "divergence_field";
    expression.text_image_division.image_job = "comparison_and_time";
    expression.market.main_transform = "rolling_correlation";
    expression.market.support_transform = "none";
    expression.market.main_binding_ids = ["BIND_MARKET_CORRELATION"];
    expression.market.support_binding_ids = [];
    expression.market.chart_style = "line";
    setObservationTest(job, {
      kind: "correlation_above",
      statement: "BTC's rolling correlation with SPY remains positive",
      threshold: 0,
      supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_CORRELATION"],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-chart-transform="rolling_correlation"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_CORRELATION"/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET renders a creator-owned causal spine without manufacturing a curve", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-"));
  try {
    const job = baseMarketJob();
    const expression = job.expressions[0];
    expression.reader_job = "mechanism";
    expression.analytic_relationship = "causal_transmission";
    expression.grammar = "causal_spine";
    expression.composition = "causal_spine";
    expression.text_image_division.image_job = "mechanism_and_time";
    makeCreatorOnly(job, "Risk appetite is looking for a new outlet");
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-grammar="causal_spine"/u);
    assert.doesNotMatch(svg, /data-chart-transform=/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET renders one confirmed expression at a time", () => {
  const job = baseMarketJob();
  const firstCandidate = job.preview.candidates[0];
  const firstExpression = job.expressions[0];
  const secondCandidate = structuredClone(firstCandidate);
  secondCandidate.candidate_id = "FPREV_CAND_BTC_FAST_MARKET_002";
  secondCandidate.angle = "evidence";
  secondCandidate.frame.title = "Who Preserved Structure Through the Drawdown?";
  const secondExpression = structuredClone(firstExpression);
  secondExpression.candidate_id = secondCandidate.candidate_id;
  secondExpression.reader_job = "comparison";
  secondExpression.analytic_relationship = "deviation";
  secondExpression.grammar = "drawdown_recovery";
  secondExpression.composition = "divergence_field";
  secondExpression.surface = "midnight";
  secondExpression.text_image_division.image_job = "comparison_and_time";
  secondExpression.argument.claim.text = "In a stress test, repair speed matters more than drawdown size";
  secondExpression.market.main_transform = "drawdown";
  secondExpression.market.support_transform = "none";
  secondExpression.market.main_binding_ids = ["BIND_MARKET_002_BTC", "BIND_MARKET_002_SPY"];
  secondExpression.market.support_binding_ids = [];
  secondExpression.market.chart_style = "line";
  for (const beat of Object.values(secondExpression.argument)) if (beat) beat.binding_id += "_002";
  secondExpression.annotations[0].binding_id += "_002";
  for (const beat of secondExpression.future_beats) beat.binding_id += "_002";
  secondExpression.argument.observation.text = "BTC's maximum drawdown was shallower than SPY's over the same period";
  secondCandidate.frame.body = `BTC's maximum drawdown was shallower than SPY's over the same period. ${secondCandidate.frame.body.split(".").slice(1).join(".").trim()}`;
  secondExpression.observation_test = {
    kind: "primary_drawdown_shallower",
    statement: "BTC's maximum drawdown was shallower than SPY's over the same period",
    threshold: 0,
    supports_binding_ids: [secondExpression.argument.observation.binding_id, ...secondExpression.market.main_binding_ids],
    source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
  };

  const thirdCandidate = structuredClone(firstCandidate);
  thirdCandidate.candidate_id = "FPREV_CAND_BTC_FAST_MARKET_003";
  thirdCandidate.angle = "mechanism";
  thirdCandidate.frame.title = "Changing Correlation Matters More Than Moving Together";
  const thirdExpression = structuredClone(firstExpression);
  thirdExpression.candidate_id = thirdCandidate.candidate_id;
  thirdExpression.reader_job = "comparison";
  thirdExpression.analytic_relationship = "correlation";
  thirdExpression.grammar = "correlation_shift";
  thirdExpression.composition = "editorial_split";
  thirdExpression.surface = "cool_mono";
  thirdExpression.text_image_division.image_job = "comparison_and_time";
  thirdExpression.argument.claim.text = "Co-movement is giving way to a changing relationship";
  thirdExpression.market.main_transform = "rolling_correlation";
  thirdExpression.market.support_transform = "none";
  thirdExpression.market.main_binding_ids = ["BIND_MARKET_003_CORRELATION"];
  thirdExpression.market.support_binding_ids = [];
  thirdExpression.market.chart_style = "line";
  for (const beat of Object.values(thirdExpression.argument)) if (beat) beat.binding_id += "_003";
  thirdExpression.annotations[0].binding_id += "_003";
  for (const beat of thirdExpression.future_beats) beat.binding_id += "_003";
  thirdExpression.argument.observation.text = "BTC's rolling correlation with SPY remains positive";
  thirdCandidate.frame.body = `BTC's rolling correlation with SPY remains positive. ${thirdCandidate.frame.body.split(".").slice(1).join(".").trim()}`;
  thirdExpression.observation_test = {
    kind: "correlation_above",
    statement: "BTC's rolling correlation with SPY remains positive",
    threshold: 0,
    supports_binding_ids: [thirdExpression.argument.observation.binding_id, ...thirdExpression.market.main_binding_ids],
    source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
  };

  job.preview.candidates.push(secondCandidate, thirdCandidate);
  job.expressions.push(secondExpression, thirdExpression);
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "SCHEMA_MAX_ITEMS" || error.code === "CANDIDATE_COUNT"));
});

test("MARKET rejects copy or settlement changed after creator confirmation", () => {
  const copyChanged = baseMarketJob();
  copyChanged.preview.candidates[0].frame.body += " One more sentence.";
  assert.ok(validateMarketPreviewJob(copyChanged).errors.some((error) => error.code === "MEANING_LOCK_BODY"));

  const deadlineChanged = baseMarketJob();
  deadlineChanged.expressions[0].time.horizon_end = "2026-08-17T09:00:00Z";
  assert.ok(validateMarketPreviewJob(deadlineChanged).errors.some((error) => error.code === "MEANING_LOCK_DEADLINE"));
});

test("MARKET locks a creator-confirmed terminal range and keeps it visible", () => {
  const job = baseMarketJob();
  job.preview.creator_view.direction = "range";
  job.preview.meaning_lock.direction = "range";
  job.preview.meaning_lock.settlement = {
    mode: "terminal_range",
    family: "single_asset_range",
    asset_ref: "asset:btc",
    direction: "range",
    requested_settle_at: "2026-08-16T09:00:00Z",
    session_policy: "at_instant",
    max_abs_move_bps: "500",
    success_condition: "within_publication_baseline_band_at_deadline",
  };
  job.preview.meaning_lock.visual_intent.required_beats.push("settlement_band");
  job.expressions[0].horizon_label = "RANGE ±5% · 30D";
  job.expressions[0].future_beats.push({
    role: "settlement",
    label: "Terminal range",
    criterion: "Finish within ±5% of publication baseline",
    at: "2026-08-16T09:00:00Z",
    state: "conditional",
    binding_id: "BIND_MARKET_RANGE_SETTLEMENT",
    source_refs: [],
  });

  let result = validateMarketPreviewJob(job);
  assert.ok(result.valid, JSON.stringify(result.errors));

  job.preview.meaning_lock.visual_intent.required_beats =
    job.preview.meaning_lock.visual_intent.required_beats.filter((beat) => beat !== "settlement_band");
  result = validateMarketPreviewJob(job);
  assert.ok(result.errors.some((error) => error.code === "MEANING_LOCK_SETTLEMENT_BAND"));
});

test("MARKET locks relative outperformance to two normalized asset returns", () => {
  const job = baseMarketJob();
  job.preview.creator_view.direction = "outperform";
  job.preview.meaning_lock.direction = "outperform";
  job.preview.meaning_lock.settlement = {
    mode: "relative_outperformance",
    family: "pair_asset_direction",
    asset_ref: "asset:nvda",
    pair_asset_ref: "asset:tsla",
    direction: "outperform",
    requested_settle_at: "2026-08-16T09:00:00Z",
    session_policy: "at_instant",
    spread_threshold_bps: "0",
    success_condition: "focal_outperforms_pair",
  };
  const expression = job.expressions[0];
  expression.reader_job = "comparison";
  expression.analytic_relationship = "relative_value";
  expression.grammar = "relative_divergence";
  expression.text_image_division.image_job = "comparison_and_time";
  expression.horizon_label = "NVDA > TSLA · 30D";
  expression.market.main_transform = "indexed_return";
  expression.market.support_transform = "none";
  expression.market.main_binding_ids = ["BIND_MARKET_BTC_CURVE", "BIND_MARKET_SPY_CURVE"];
  expression.market.support_binding_ids = [];
  expression.market.chart_style = "line";
  expression.observation_test.supports_binding_ids = [
    "BIND_MARKET_OBSERVATION",
    "BIND_MARKET_BTC_CURVE",
    "BIND_MARKET_SPY_CURVE",
  ];

  let result = validateMarketPreviewJob(job);
  assert.ok(result.valid, JSON.stringify(result.errors));

  job.preview.meaning_lock.settlement.pair_asset_ref = "NVDA";
  result = validateMarketPreviewJob(job);
  assert.ok(result.errors.some((error) => error.code === "MEANING_LOCK_RELATIVE_ASSETS"));

  job.preview.meaning_lock.settlement.pair_asset_ref = "asset:tsla";
  expression.market.benchmark = null;
  result = validateMarketPreviewJob(job);
  assert.ok(result.errors.some((error) => error.code === "MEANING_LOCK_RELATIVE_GEOMETRY"));
});

function compoundMarketJob() {
  const job = baseMarketJob();
  job.preview.creator_view.direction = "compound";
  job.preview.meaning_lock.direction = "compound";
  job.preview.meaning_lock.settlement = {
    mode: "compound_conditions",
    family: "pair_asset_conditions",
    asset_ref: "asset:tsla",
    pair_asset_ref: "asset:nvda",
    direction: "compound",
    primary_direction: "long",
    pair_direction: "range",
    requested_settle_at: "2026-08-16T09:00:00Z",
    session_policy: "at_instant",
    threshold_bps: "0",
    pair_threshold_bps: null,
    max_abs_move_bps: null,
    pair_max_abs_move_bps: "500",
    aggregate: "all_legs",
    success_condition: "all_conditions_hit",
    flat_condition: "direction_equals_threshold_with_no_miss_or_missing",
  };
  job.preview.meaning_lock.visual_intent.required_beats.push("condition_join", "settlement_band");
  const expression = job.expressions[0];
  expression.reader_job = "comparison";
  expression.analytic_relationship = "relative_value";
  expression.grammar = "relative_divergence";
  expression.composition = "divergence_field";
  expression.text_image_division.image_job = "comparison_and_time";
  expression.subject_label = "TSLA + NVDA";
  expression.horizon_label = "BOTH · 30D";
  expression.market.main_transform = "indexed_return";
  expression.market.support_transform = "none";
  expression.market.main_binding_ids = ["BIND_MARKET_BTC_CURVE", "BIND_MARKET_SPY_CURVE"];
  expression.market.support_binding_ids = [];
  expression.market.chart_style = "line";
  expression.observation_test.supports_binding_ids = [
    "BIND_MARKET_OBSERVATION",
    "BIND_MARKET_BTC_CURVE",
    "BIND_MARKET_SPY_CURVE",
  ];
  expression.future_beats.push({
    role: "settlement",
    label: "TSLA up AND NVDA ±5%",
    criterion: "TSLA > baseline AND NVDA within ±5%",
    at: "2026-08-16T09:00:00Z",
    state: "conditional",
    binding_id: "BIND_MARKET_COMPOUND_SETTLEMENT",
    source_refs: [],
  });
  return job;
}

test("MARKET locks two independent conditions to explicit AND geometry", async () => {
  const job = compoundMarketJob();
  let result = validateMarketPreviewJob(job);
  assert.ok(result.valid, JSON.stringify(result.errors));

  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-market-compound-"));
  try {
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(
      path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"),
      "utf8",
    );
    assert.match(svg, /TSLA up AND<\/tspan><tspan[^>]*>NVDA ±5%/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_COMPOUND_SETTLEMENT"/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }

  job.preview.meaning_lock.visual_intent.required_beats =
    job.preview.meaning_lock.visual_intent.required_beats.filter((beat) => beat !== "condition_join");
  result = validateMarketPreviewJob(job);
  assert.ok(result.errors.some((error) => error.code === "MEANING_LOCK_COMPOUND_JOIN"));
});

test("MARKET compound lock cannot drop a leg, band, or all-legs family", () => {
  const job = compoundMarketJob();
  job.preview.meaning_lock.settlement.pair_asset_ref = "TSLA";
  assert.ok(validateMarketPreviewJob(job).errors.some((error) => error.code === "MEANING_LOCK_COMPOUND_ASSETS"));

  job.preview.meaning_lock.settlement.pair_asset_ref = "asset:nvda";
  job.preview.meaning_lock.settlement.pair_max_abs_move_bps = null;
  assert.ok(validateMarketPreviewJob(job).errors.some((error) => error.code === "MEANING_LOCK_COMPOUND_RANGE"));

  job.preview.meaning_lock.settlement.pair_max_abs_move_bps = "500";
  job.preview.meaning_lock.settlement.family = "pair_asset_direction";
  assert.ok(validateMarketPreviewJob(job).errors.some((error) => error.code === "MEANING_LOCK_COMPOUND_FAMILY"));
});

test("MARKET rejects future chart annotations, empty-clock beats, and reused preview bindings", () => {
  const futureAnnotation = baseMarketJob();
  futureAnnotation.expressions[0].annotations[0].occurred_at = "2026-07-31T09:00:00Z";
  assert.ok(validateMarketPreviewJob(futureAnnotation).errors.some((error) => error.code === "FUTURE_ANNOTATION"));

  const emptyClock = baseMarketJob();
  emptyClock.expressions[0].time.future_mode = "empty_clock";
  assert.ok(validateMarketPreviewJob(emptyClock).errors.some((error) => error.code === "EMPTY_CLOCK_BEATS"));

  const bindingCount = baseMarketJob();
  bindingCount.expressions[0].market.support_binding_ids = [];
  assert.ok(validateMarketPreviewJob(bindingCount).errors.some((error) => error.code === "SUPPORT_BINDING_COUNT"));
});
