import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runFastPreviewJob } from "../scripts/run_fast_preview.mjs";

function fakePng() {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(2488, 16);
  png.writeUInt32BE(1056, 20);
  return png;
}

function hash(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function baseJob() {
  return {
    schema_version: "frame-preview-fast-job-v1",
    preview: {
      preview_id: "FPREV_BTC_FAST_001",
      state: "ready",
      created_at: "2026-07-17T09:00:00Z",
      creator_view: {
        original_text: "最近 BTC 跌不下去，我觉得还会冲一波，美股跌的时候资金可能回流币圈。",
        subject: "BTC",
        direction: "long",
        observation_window: "2026-07-01 至 2026-07-17",
        horizon: "未来 30 天",
        claim: "BTC 的抗跌可能演化为下一轮上冲",
        mechanism: "美股承压时，边际资金可能寻找全天候流动性资产",
        next_watch: "继续观察 BTC 相对大盘的强弱",
      },
      query_binding: {
        required: true,
        status: "executed",
        bundle_refs: ["QRY_BTC_FAST_001"],
        result_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
        as_of: "2026-07-17T08:58:00Z",
        warnings: [],
        unavailable_capabilities: [],
      },
      candidate: {
        candidate_id: "FPREV_CAND_BTC_FAST_001",
        angle: "conviction",
        frame: {
          title: "BTC 的不跌，正在变成信号",
          body: "我看多的不是一次普通反弹，而是风险资产承压时 BTC 仍有承接。未来 30 天，我更关注这种相对韧性能否继续吸引边际资金。",
          alt_text: "BTC 与美股代理 SPY 的同期表现，以及未来 30 天的观点观察区间。",
        },
        evidence_refs: ["RES_BTC_CANDLES", "RES_SPY_CANDLES"],
      },
    },
    visual: {
      kind: "logic_card",
      template_id: "system",
      subject: "BTC",
      horizon: "未来 30 天",
      as_of_label: "Cuebook · 截至 2026-07-17",
      claim: "不跌，正在变成相对强势",
      evidence: "风险资产承压时 BTC 仍保持承接",
      mechanism: "边际资金可能转向全天候流动性",
      condition: "继续观察相对强弱",
      binding_refs: {
        claim: "BIND_CLAIM_BTC_FAST",
        evidence: "BIND_EVIDENCE_BTC_FAST",
        mechanism: "BIND_MECHANISM_BTC_FAST",
        condition: "BIND_CONDITION_BTC_FAST",
      },
    },
  };
}

function candles(ticker, offset = 0, scale = 1) {
  const bars = Array.from({ length: 12 }, (_, index) => {
    const openTime = new Date(Date.UTC(2026, 6, index + 1, offset)).toISOString();
    const open = scale * (100 + index);
    const close = open + scale * (index % 3 === 0 ? -0.4 : 0.8);
    return {
      openTime,
      open: String(open),
      high: String(Math.max(open, close) + scale),
      low: String(Math.min(open, close) - scale),
      close: String(close),
      volume: String(1000 + index * 25),
    };
  });
  return {
    data: { ticker, interval: "1d", bars, nextCursor: null },
    meta: { asOf: "2026-07-17T08:58:00Z", truncated: false },
  };
}

function marketJob() {
  const job = baseJob();
  job.preview.creator_view.direction = "outperform";
  job.visual = {
    kind: "market_chart",
    mode: "relative_performance",
    role: "evidence",
    title: "BTC 的韧性，已经跑赢美股代理",
    subtitle: "同期表现只描述已发生的相对强弱；资金迁移仍是我的推演",
    claim_statement: "BTC 在观察期内相对 SPY 更强",
    direction: "outperform",
    observation_start: "2026-07-01T00:00:00Z",
    declared_at: "2026-07-17T09:00:00Z",
    horizon_end: "2026-08-16T09:00:00Z",
    success_label: "30 天后观察 BTC 是否仍高于观点日",
    show_volume: false,
    primary: {
      ticker: "BTC",
      display_name: "Bitcoin",
      asset_id: 1,
      asset_class: "crypto",
      result_ref: "RES_BTC_CANDLES",
      market_state: { price: "118", observedAt: "2026-07-17T08:57:00Z" },
      candles: candles("BTC", 0, 600),
    },
    benchmark: {
      ticker: "SPY",
      display_name: "SPY",
      asset_id: 2,
      asset_class: "equity",
      result_ref: "RES_SPY_CANDLES",
      market_state: { price: "620", observedAt: "2026-07-17T08:57:00Z" },
      candles: candles("SPY", 0, 5),
    },
    warnings: [],
  };
  return job;
}

async function fakeCapture(_html, outputDir) {
  const png = fakePng();
  writeFileSync(path.join(outputDir, "viewpoint-2488.png"), png);
  return {
    report: {
      derivatives: [{
        kind: "full",
        ref: "viewpoint-2488.png",
        width: 2488,
        height: 1056,
        sha256: hash(png),
        pixel_sha256: `sha256:${"b".repeat(64)}`,
      }],
    },
  };
}

async function fakeRasterize(_svg, output) {
  writeFileSync(output, fakePng());
  return output;
}

test("one thin command renders and validates a stable logic-card preview", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const { preview, report } = await runFastPreviewJob(baseJob(), output, { capture: fakeCapture });
    assert.equal(preview.candidates[0].visual_kind, "logic_card");
    assert.equal(preview.candidates[0].template_id, "system");
    assert.equal(report.visual_kind, "logic_card");
    assert.equal(JSON.parse(readFileSync(path.join(output, "frame-preview-v1.json"), "utf8")).state, "ready");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("a partial logic-card query is downgraded to a conditional preview", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const job = baseJob();
    job.preview.query_binding.status = "partial";
    job.preview.query_binding.warnings = ["Positioning was unavailable."];
    job.preview.query_binding.unavailable_capabilities = ["get_positioning"];
    const { preview } = await runFastPreviewJob(job, output, { capture: fakeCapture });
    assert.equal(preview.state, "conditional");
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("raw Cuebook candles compile into a sourced relative chart and one Frame PNG", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const { preview } = await runFastPreviewJob(marketJob(), output, { rasterize: fakeRasterize });
    const candidate = preview.candidates[0];
    assert.equal(candidate.visual_kind, "market_chart");
    assert.equal(candidate.template_id, "thesis_chart");
    const chart = JSON.parse(readFileSync(path.join(output, candidate.candidate_id, "thesis-chart-v1.json"), "utf8"));
    assert.equal(chart.time.context_start, "2026-07-01T00:00:00.000Z");
    assert.equal(chart.time.horizon_end, "2026-08-16T09:00:00.000Z");
    assert.notEqual(chart.time.context_start, chart.time.horizon_end);
    assert.deepEqual(chart.series.map((series) => series.transformation), ["return_from_baseline", "return_from_baseline"]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("a directional horizon stays on a single-price axis with its own expiry clock", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const job = marketJob();
    job.preview.creator_view.direction = "long";
    job.preview.candidate.evidence_refs = ["RES_BTC_CANDLES"];
    job.visual = {
      ...job.visual,
      mode: "single_price",
      role: "thesis",
      title: "BTC 的不跌，正在变成上冲准备",
      subtitle: "历史价格只画已发生的走势；淡色区域是未来 30 天观察期",
      claim_statement: "30 天后 BTC 高于观点提出时",
      direction: "long",
      show_volume: true,
      benchmark: undefined,
      primary: { ...job.visual.primary, market_state: { price: "70000", observedAt: "2026-07-17T08:57:00Z" } },
    };
    delete job.visual.benchmark;
    const { preview } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    const chart = JSON.parse(readFileSync(path.join(output, preview.candidates[0].candidate_id, "thesis-chart-v1.json"), "utf8"));
    assert.equal(chart.render.mode, "single_price");
    assert.equal(chart.render.y_axis, "price");
    assert.equal(chart.render.show_latest_metric, false);
    assert.equal(chart.series.length, 1);
    assert.ok(chart.annotations.some((annotation) => annotation.kind === "expiry"));
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.doesNotMatch(svg, /最新\s*·|Latest\s*·/u);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("pre-publish chart copy rejects an unlocked current-price label", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const job = marketJob();
    job.visual.title = "BTC 现价 70000";
    await assert.rejects(
      () => runFastPreviewJob(job, output, { rasterize: fakeRasterize }),
      /cannot print a mutable current\/entry price/u,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("relative charts reject unsynchronized comparison windows", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-fast-preview-"));
  try {
    const job = marketJob();
    job.visual.benchmark.candles = candles("SPY", 12, 5);
    await assert.rejects(
      () => runFastPreviewJob(job, output, { rasterize: fakeRasterize }),
      /synchronized primary\/benchmark candle/u,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
