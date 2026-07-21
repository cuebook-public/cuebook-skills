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
      category: "Expectation revision",
      asset_label: "AAPL",
      headline: "New product ahead: long AAPL over a 1-4 week window",
      interpretation: "I expect upward services-revenue revisions to carry the product-launch excitement into earnings pricing.",
    },
    trade_logic: {
      profile_ref: "TLOGIC_AAPL_SERVICE_REV_20260714",
      family: "event_driven",
      mechanism: "expectation_revision",
      expression: "outright_long",
      horizon: "one_to_four_weeks",
      public_tags: ["event-driven", "expectation revision", "outright long"],
    },
    key_number: {
      label: "Next-12-month services revenue estimate",
      display_value: "+4.8%",
      numeric_value: 4.8,
      unit: "%",
      as_of: "2026-07-14T08:20:00Z",
      status: "observed",
      comparison: "+1.6% seven days ago",
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
      category: "Earnings",
      asset_label: "IBM",
      headline: "Revenue missed: short IBM over a 1-3 day window",
      interpretation: "I expect the revenue shortfall to pressure valuation first, then force a reassessment of enterprise IT demand.",
    },
    trade_logic: {
      profile_ref: "TLOGIC_IBM_Q2_SHORT_20260714",
      family: "event_driven",
      mechanism: "expectation_revision",
      expression: "outright_short",
      horizon: "one_to_three_days",
      public_tags: ["event-driven", "expectation revision", "outright short"],
    },
    key_number: null,
    key_news: {
      headline: "IBM second-quarter revenue missed market expectations",
      publisher: "IBM IR",
      published_at: "2026-07-14T08:12:00Z",
      status: "provisional",
      source_refs: ["source:ibm:q2-release"],
    },
    quality_report: {
      decision: "conditional",
      warnings: ["Peer guidance has not yet confirmed the sector transmission."],
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
    for (const expected of ['data-signal-mode="key_number"', "+4.8%", "07/14 08:20 UTC", "Cuebook", "event-driven · expectation revision · outright long"]) {
      assert.ok(svg.includes(expected));
    }
    for (const forbidden of ["data references", "dashed means forming", "settlement", "calculated"]) assert.ok(!svg.toLowerCase().includes(forbidden));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("news render preserves publisher and hides evidence state", () => {
  const directory = mkdtempSync(join(tmpdir(), "market-signal-news-"));
  try {
    const result = render(newsSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    for (const expected of ['data-signal-mode="key_news"', "IBM IR", "Revenue missed: short IBM", "event-driven · expectation revision · outright short", "07/14 08:12 UTC"]) {
      assert.ok(svg.includes(expected));
    }
    assert.ok(!svg.includes("TO CONFIRM"));
    assert.ok(!svg.includes("CONFIRMED"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("trade horizon wraps as one phrase", () => {
  const lines = wrapText("After the tanker attack, I favor USO over XLE over a 1-3 day window", 43, 2);
  assert.ok(lines.some((line) => line.includes("1-3 day window")), JSON.stringify(lines));
  assert.notEqual(lines.at(-1), "day");
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
