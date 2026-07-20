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
  assert.match(readFileSync(svg, "utf8"), /width="1244" height="528"/u);
  writeFileSync(output, fakePng());
  return output;
}

async function fakeHeaderRasterize(svg, output) {
  assert.match(readFileSync(svg, "utf8"), /width="1244" height="528"/u);
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
  return {
    schema_version: "frame-market-preview-job",
    preview: {
      preview_id: "FPREV_BTC_FAST_MARKET_001",
      state: "conditional",
      created_at: "2026-07-17T09:00:00Z",
      creator_view: {
        original_text: "最近 BTC 跌不下去，我觉得还会冲一波；美股回撤时资金可能回流币圈。",
        subject: "BTC",
        direction: "long",
        observation_window: "2026-06-24 至 2026-07-17",
        horizon: "未来 30 天",
        claim: "BTC 的抗跌可能演化为下一轮上冲",
        mechanism: "美股承压时，边际资金可能寻找全天候流动性资产",
        next_watch: "先看相对韧性是否延续，再看它能否转成价格上冲",
      },
      query_binding: queryBinding(),
      candidates: [{
        candidate_id: "FPREV_CAND_BTC_FAST_MARKET_001",
        angle: "conviction",
        frame: {
          title: "BTC 正在争夺下一段风险偏好",
          body: "同期 BTC 相对 SPY 更强。我的判断不是资金已经完成迁移，而是全天候流动性正在成为边际选择；未来 30 天，先看这种韧性能否延续，再看它会不会转成上冲。",
        },
        evidence_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      }],
    },
    expressions: [{
      candidate_id: "FPREV_CAND_BTC_FAST_MARKET_001",
      creator_signal: {
        origin: "heuristic_interview",
        interview_text: "我更像是在看持续买盘吸收抛压。",
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
      source_label: "合成测试序列",
      argument: {
        claim: { text: "抗跌不是结论，是轮动的起点", state: "creator_view", binding_id: "BIND_MARKET_CLAIM", source_refs: [] },
        observation: { text: "同期 BTC 相对 SPY 更强", state: "derived", binding_id: "BIND_MARKET_OBSERVATION", source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"] },
        mechanism: { text: "我把它理解为持续承接正在吸收抛压", state: "creator_view", binding_id: "BIND_MARKET_MECHANISM", source_refs: [] },
        implication: { text: "先看韧性延续，再看它能否转成上冲", state: "conditional", binding_id: "BIND_MARKET_IMPLICATION", source_refs: [] },
        countercase: { text: "若相对强弱重新走低，这条推演失去支点", state: "conditional", binding_id: "BIND_MARKET_COUNTER", source_refs: [] },
      },
      observation_test: {
        kind: "primary_outperformed_benchmark",
        statement: "同期 BTC 相对 SPY 更强",
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
        label: "相对韧性开始扩大",
        occurred_at: "2026-07-08T00:00:00Z",
        value: null,
        state: "derived",
        binding_id: "BIND_MARKET_REGIME",
        source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      }],
      future_beats: [
        { role: "checkpoint", label: "相对韧性继续保持", criterion: "5D 相对 SPY 强弱 > 0", at: "2026-07-31T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_CHECKPOINT", source_refs: [] },
        { role: "confirmation", label: "韧性转成价格上冲", criterion: "BTC 创 20D 新高", at: "2026-08-16T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_CONFIRM", source_refs: [] },
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
  const bodyTail = candidate.frame.body.split("。").slice(1).join("。").trim();
  candidate.frame.body = `${statement}。${bodyTail}`;
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
  expression.source_label = "创作者推演";
  expression.observation_test = null;
  expression.argument.observation = {
    text: observation,
    state: "creator_view",
    binding_id: "BIND_MARKET_OBSERVATION",
    source_refs: [],
  };
  expression.market = null;
  expression.annotations = [];
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
    assert.match(svg, /data-chart-transform="raw_price"/u);
    assert.match(svg, /data-chart-transform="relative_spread"/u);
    assert.match(svg, /data-binding-ref="BIND_MARKET_CHECKPOINT"/u);
    assert.match(svg, /data-data-status="synthetic_fixture"/u);
    assert.match(svg, /data-design-family="signal_poster"/u);
    assert.match(svg, /data-display-system="signal_sans"/u);
    assert.match(svg, /data-annotation-role="observation"/u);
    assert.match(svg, /data-role="creator-pulse"/u);
    assert.match(svg, /data-role="next-watch"/u);
    assert.doesNotMatch(svg, /data-layout="open-beat"/u);
    assert.ok(svg.indexOf('data-time-axis="common"') > svg.indexOf('data-chart-transform="relative_spread"'));
    assert.doesNotMatch(svg, /data-series-state="future"/u);
    assert.equal(preview.state, "conditional");
    assert.equal(report.release_eligible, false);
    assert.match(preview.candidates[0].frame.alt_text, /历史曲线与未来观察/u);
    assert.equal(preview.candidates[0].image_sha256, `sha256:${createHash("sha256").update(fakePng()).digest("hex")}`);
    assert.equal(Object.hasOwn(report.renders[0], "compact_image_ref"), false);
    assert.equal(Object.hasOwn(report.renders[0], "compact_audit"), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "frame-feed-622.svg")), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "viewpoint-622.png")), false);
    assert.deepEqual(Object.keys(frame), ["title", "body", "image_ref", "alt_text"]);
    assert.equal(frame.image_ref, `${preview.candidates[0].candidate_id}/viewpoint-2488.png`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(output, "frame.json"), "utf8")), frame);
    for (const privateField of ["state", "schema_version", "candidate_id", "query_binding", "image_sha256", "receipt", "scope"]) {
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
      statement: "同期 BTC 的最大回撤浅于 SPY",
      supports: ["BIND_MARKET_OBSERVATION", "BIND_MARKET_BTC_DRAWDOWN", "BIND_MARKET_SPY_DRAWDOWN"],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-chart-transform="drawdown"/u);
    assert.match(svg, /data-geometry-type="recovery-duration"/u);
    assert.match(preview.candidates[0].frame.alt_text, /回撤与修复速度/u);
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
    makeCreatorOnly(job, "BTC 的抗跌是我这次判断的起点");
    expression.future_beats.push({
      role: "invalidation", label: "相对韧性消失", criterion: "5D 相对 SPY 强弱 < 0",
      at: "2026-08-08T09:00:00Z", state: "conditional", binding_id: "BIND_MARKET_INVALIDATION", source_refs: [],
    });
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-grammar="scenario_lanes"/u);
    assert.match(svg, /data-geometry-type="conditional-lane"/u);
    assert.match(svg, /失效分支/u);
    assert.match(svg, /D\+22/u);
    assert.match(preview.candidates[0].frame.alt_text, /成立与失效分支/u);
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
    statement: "同期 SPY 明显下跌",
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
      kind: "event", label: "风险资产集中回撤", occurred_at: "2026-07-08T00:00:00Z", value: null,
      state: "reported", binding_id: "BIND_MARKET_EVENT", source_refs: ["RES_SPY_CANDLES"],
    }];
    setObservationTest(job, {
      kind: "primary_positive_after_event",
      statement: "事件发生后 BTC 仍保持正收益",
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
      kind: "threshold", label: "上冲确认线", occurred_at: null, value: 70000,
      state: "creator_view", binding_id: "BIND_MARKET_THRESHOLD", source_refs: [],
    }];
    setObservationTest(job, {
      kind: "latest_above_threshold",
      statement: "BTC 最新一根日线仍在确认线之上",
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
      statement: "BTC 与 SPY 的滚动相关性仍为正",
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
    makeCreatorOnly(job, "风险偏好正在重新寻找出口");
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-grammar="causal_spine"/u);
    assert.doesNotMatch(svg, /data-chart-transform=/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("MARKET enforces real structural diversity for three requested candidates", () => {
  const job = baseMarketJob();
  const firstCandidate = job.preview.candidates[0];
  const firstExpression = job.expressions[0];
  const secondCandidate = structuredClone(firstCandidate);
  secondCandidate.candidate_id = "FPREV_CAND_BTC_FAST_MARKET_002";
  secondCandidate.angle = "evidence";
  secondCandidate.frame.title = "谁在回撤里保住了结构";
  const secondExpression = structuredClone(firstExpression);
  secondExpression.candidate_id = secondCandidate.candidate_id;
  secondExpression.reader_job = "comparison";
  secondExpression.analytic_relationship = "deviation";
  secondExpression.grammar = "drawdown_recovery";
  secondExpression.composition = "divergence_field";
  secondExpression.surface = "midnight";
  secondExpression.text_image_division.image_job = "comparison_and_time";
  secondExpression.argument.claim.text = "压力测试里，修复速度比跌幅更重要";
  secondExpression.market.main_transform = "drawdown";
  secondExpression.market.support_transform = "none";
  secondExpression.market.main_binding_ids = ["BIND_MARKET_002_BTC", "BIND_MARKET_002_SPY"];
  secondExpression.market.support_binding_ids = [];
  secondExpression.market.chart_style = "line";
  for (const beat of Object.values(secondExpression.argument)) if (beat) beat.binding_id += "_002";
  secondExpression.annotations[0].binding_id += "_002";
  for (const beat of secondExpression.future_beats) beat.binding_id += "_002";
  secondExpression.argument.observation.text = "同期 BTC 的最大回撤浅于 SPY";
  secondCandidate.frame.body = `同期 BTC 的最大回撤浅于 SPY。${secondCandidate.frame.body.split("。").slice(1).join("。").trim()}`;
  secondExpression.observation_test = {
    kind: "primary_drawdown_shallower",
    statement: "同期 BTC 的最大回撤浅于 SPY",
    threshold: 0,
    supports_binding_ids: [secondExpression.argument.observation.binding_id, ...secondExpression.market.main_binding_ids],
    source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
  };

  const thirdCandidate = structuredClone(firstCandidate);
  thirdCandidate.candidate_id = "FPREV_CAND_BTC_FAST_MARKET_003";
  thirdCandidate.angle = "mechanism";
  thirdCandidate.frame.title = "相关性变化，比同步涨跌更重要";
  const thirdExpression = structuredClone(firstExpression);
  thirdExpression.candidate_id = thirdCandidate.candidate_id;
  thirdExpression.reader_job = "comparison";
  thirdExpression.analytic_relationship = "correlation";
  thirdExpression.grammar = "correlation_shift";
  thirdExpression.composition = "editorial_split";
  thirdExpression.surface = "cool_mono";
  thirdExpression.text_image_division.image_job = "comparison_and_time";
  thirdExpression.argument.claim.text = "同步涨跌正在让位于关系变化";
  thirdExpression.market.main_transform = "rolling_correlation";
  thirdExpression.market.support_transform = "none";
  thirdExpression.market.main_binding_ids = ["BIND_MARKET_003_CORRELATION"];
  thirdExpression.market.support_binding_ids = [];
  thirdExpression.market.chart_style = "line";
  for (const beat of Object.values(thirdExpression.argument)) if (beat) beat.binding_id += "_003";
  thirdExpression.annotations[0].binding_id += "_003";
  for (const beat of thirdExpression.future_beats) beat.binding_id += "_003";
  thirdExpression.argument.observation.text = "BTC 与 SPY 的滚动相关性仍为正";
  thirdCandidate.frame.body = `BTC 与 SPY 的滚动相关性仍为正。${thirdCandidate.frame.body.split("。").slice(1).join("。").trim()}`;
  thirdExpression.observation_test = {
    kind: "correlation_above",
    statement: "BTC 与 SPY 的滚动相关性仍为正",
    threshold: 0,
    supports_binding_ids: [thirdExpression.argument.observation.binding_id, ...thirdExpression.market.main_binding_ids],
    source_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
  };

  job.preview.candidates.push(secondCandidate, thirdCandidate);
  job.expressions.push(secondExpression, thirdExpression);
  const result = validateMarketPreviewJob(job);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
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
