import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { render, wrapText } from "../scripts/render_market_signal.mjs";
import { validateManifest, validateSpec } from "../scripts/validate_market_signal.mjs";

function numberSpec() {
  return {
    schema_version: "market-signal-spec-v1",
    signal_id: "SIGSPEC_AAPL_SERVICE_REV_20260714",
    revision: 1,
    state: "ready",
    mode: "key_number",
    lineage: {
      input_artifact_refs: ["RESEARCH_AAPL_20260714"],
      source_refs: ["source:consensus:aapl-services"],
      decision_cutoff_at: "2026-07-14T08:30:00Z",
    },
    frame: {
      category: "预期修正",
      asset_label: "AAPL",
      headline: "新品要发，我先做多 AAPL，窗口看 1-4 周",
      interpretation: "我押服务收入预期上修接过新品热度，把一次发布会变成盈利定价。",
    },
    trade_logic: {
      profile_ref: "TLOGIC_AAPL_SERVICE_REV_20260714",
      family: "event_driven",
      mechanism: "expectation_revision",
      expression: "outright_long",
      horizon: "one_to_four_weeks",
      public_tags: ["事件驱动", "预期修正", "直接做多"],
    },
    key_number: {
      label: "未来 12 个月服务收入预期",
      display_value: "+4.8%",
      numeric_value: 4.8,
      unit: "%",
      as_of: "2026-07-14T08:20:00Z",
      status: "observed",
      comparison: "7 日前 +1.6%",
      source_ref: "source:consensus:aapl-services",
    },
    key_news: null,
    render: {
      layout: "compact",
      width: 720,
      height: 420,
      theme: "cuebook_light",
      design_profile: "receptive_restraint",
      watermark: "Cuebook",
    },
    quality_report: { decision: "ready", warnings: [], hard_failures: [] },
  };
}

function newsSpec() {
  const payload = numberSpec();
  Object.assign(payload, {
    signal_id: "SIGSPEC_IBM_Q2_NEWS_20260714",
    state: "conditional",
    mode: "key_news",
    lineage: {
      input_artifact_refs: ["NEWS_IBM_Q2_20260714"],
      source_refs: ["source:ibm:q2-release"],
      decision_cutoff_at: "2026-07-14T08:30:00Z",
    },
    frame: {
      category: "财报",
      asset_label: "IBM",
      headline: "收入掉链子，我先做空 IBM，窗口看 1-3 天",
      interpretation: "我押这次收入缺口先压估值，再让市场重估企业 IT 需求。",
    },
    trade_logic: {
      profile_ref: "TLOGIC_IBM_Q2_SHORT_20260714",
      family: "event_driven",
      mechanism: "expectation_revision",
      expression: "outright_short",
      horizon: "one_to_three_days",
      public_tags: ["事件驱动", "预期修正", "直接做空"],
    },
    key_number: null,
    key_news: {
      headline: "IBM 第二季度收入低于市场预期",
      publisher: "IBM IR",
      published_at: "2026-07-14T08:12:00Z",
      status: "provisional",
      source_refs: ["source:ibm:q2-release"],
    },
    quality_report: {
      decision: "conditional",
      warnings: ["板块传导尚未由同业指引确认。"],
      hard_failures: [],
    },
  });
  return payload;
}

test("valid number and news specs", () => {
  for (const payload of [numberSpec(), newsSpec()]) {
    const result = validateSpec(payload);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  }
});

test("mode requires exactly one signal", () => {
  const payload = numberSpec();
  payload.key_news = newsSpec().key_news;
  const result = validateSpec(payload);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === "MODE_PAYLOAD"));
});

test("source lineage is mandatory", () => {
  const payload = numberSpec();
  payload.key_number.source_ref = "source:missing";
  const result = validateSpec(payload);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === "NUMBER_SOURCE_LINEAGE"));
});

test("number render uses restrained single-signal layout", () => {
  const directory = mkdtempSync(join(tmpdir(), "market-signal-number-"));
  try {
    const result = render(numberSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    for (const expected of ['data-signal-mode="key_number"', "+4.8%", "07/14 08:20 UTC", "Cuebook", "事件驱动 · 预期修正 · 直接做多"]) {
      assert.ok(svg.includes(expected));
    }
    for (const forbidden of ["条数据引用", "虚线为形成中", "结算", "已计算"]) assert.ok(!svg.includes(forbidden));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("news render preserves publisher and hides evidence state", () => {
  const directory = mkdtempSync(join(tmpdir(), "market-signal-news-"));
  try {
    const result = render(newsSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    for (const expected of ['data-signal-mode="key_news"', "IBM IR", "收入掉链子，我先做空 IBM", "事件驱动 · 预期修正 · 直接做空", "07/14 08:12 UTC"]) {
      assert.ok(svg.includes(expected));
    }
    assert.ok(!svg.includes("待确认"));
    assert.ok(!svg.includes("已确认"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("trade horizon wraps as one phrase", () => {
  const lines = wrapText("油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天", 43, 2);
  assert.ok(lines.some((line) => line.includes("窗口看 1-3 天")), JSON.stringify(lines));
  assert.notEqual(lines.at(-1), "天");
});

test("manifest hash and asset validate", () => {
  const directory = mkdtempSync(join(tmpdir(), "market-signal-manifest-"));
  try {
    const result = render(numberSpec(), directory);
    const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
    const validation = validateManifest(manifest, directory);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    assert.deepEqual(manifest.dimensions, { width: 720, height: 420 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

export { newsSpec, numberSpec };
