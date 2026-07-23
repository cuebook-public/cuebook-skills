import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runFastPreviewJob } from "../scripts/run_fast_preview.mjs";
import { compileLensExpression } from "../scripts/render_lens_expression.mjs";
import { CANONICAL_FORMULA, validateLensPreviewJob } from "../scripts/run_lens_preview.mjs";
import { validPaintedPng } from "./png_fixture.mjs";

const AS_OF = "2026-07-17T08:58:00Z";

async function fakeRasterize(svg, output) {
  assert.match(readFileSync(svg, "utf8"), /<svg\b[^>]*width="1866"[^>]*height="1200"[^>]*viewBox="0 0 622 400"/u);
  writeFileSync(output, validPaintedPng());
  return output;
}

function candles(ticker, { start = 100, drift = 1, wave = 0.5 } = {}) {
  const bars = Array.from({ length: 24 }, (_, index) => {
    const openTime = new Date(Date.UTC(2026, 5, 24 + index)).toISOString();
    const close = start + index * drift + Math.sin(index / 2.2) * wave;
    const open = close - drift * 0.35;
    return {
      openTime,
      open: open.toFixed(4),
      high: (Math.max(open, close) + 1.2).toFixed(4),
      low: (Math.min(open, close) - 1.1).toFixed(4),
      close: close.toFixed(4),
      volume: String(1_000_000 + index * 31_000),
    };
  });
  return {
    data: { ticker, interval: "1d", bars, nextCursor: null },
    meta: { asOf: AS_OF, truncated: false },
  };
}

function component(ticker, index, weight, side, series = {}) {
  return {
    leg: {
      ticker,
      display_name: ticker,
      asset_id: index + 101,
      asset_class: "equity",
      result_ref: `RES_${ticker}_CANDLES`,
      candles: candles(ticker, series),
    },
    weight,
    side,
    inclusion_reason: `${ticker} is an observable proxy in the demand chain`,
    origin: index % 2 === 0 ? "creator_named" : "cuebook_discovered",
    binding_id: `BIND_LENS_COMPONENT_${ticker}`,
  };
}

export function baseLensJob() {
  const components = [
    component("NVDA", 0, 0.25, "long", { start: 100, drift: 1.35 }),
    component("AVGO", 1, 0.25, "long", { start: 92, drift: 0.92 }),
    component("ANET", 2, 0.25, "long", { start: 83, drift: 0.78 }),
    component("VRT", 3, 0.25, "long", { start: 70, drift: 0.65 }),
  ];
  const refs = components.map((item) => item.leg.result_ref);
  const observation = "This AI infrastructure proxy Lens is positive over the frozen window";
  const title = "AI Investment Cannot Be Read Through One Company";
  const body = `${observation}. My view is that demand is spreading from compute into networking and power. Over the next 30 days, watch whether breadth holds; reassess if any critical link weakens.`;
  return {
    schema_version: "frame-lens-preview-job",
    preview: {
      preview_id: "FPREV_AI_LENS_LENS_001",
      state: "conditional",
      created_at: "2026-07-17T09:00:00Z",
      creator_view: {
        original_text: "I do not think AI investment is over, but I want to chart the demand chain rather than one company.",
        subject: "AI infrastructure demand",
        direction: "long",
        observation_window: "2026-06-24 to 2026-07-17",
        horizon: "Next 30 days",
        claim: "The strength of AI investment should be observed through a basket of infrastructure proxies",
        mechanism: "If compute, networking, and power strengthen together, demand has more breadth than a single leader can show",
        next_watch: "Watch whether breadth keeps expanding and reassess if any critical link weakens",
      },
      meaning_lock: {
        lock_id: "MLOCK_AI_LENS_LENS_001",
        status: "creator_confirmed",
        confirmed_at: "2026-07-17T08:59:00Z",
        title,
        body,
        subject: "AI infrastructure demand",
        direction: "long",
        horizon: "Next 30 days",
        claim: "The strength of AI investment should be observed through a basket of infrastructure proxies",
        mechanism: "If compute, networking, and power strengthen together, demand has more breadth than a single leader can show",
        next_watch: "Watch whether breadth keeps expanding and reassess if any critical link weakens",
        settlement: {
          mode: "non_settleable",
          reason: "This creator-owned observation basket is not one canonical asset contract.",
        },
        visual_intent: {
          summary: "Show the tested Lens move, the creator's mechanism, component anatomy, and the dated future check.",
          required_beats: ["tested_observation", "mechanism", "future_check", "component_anatomy"],
        },
      },
      query_binding: {
        required: true,
        status: "executed",
        bundle_refs: ["QRY_AI_LENS_LENS"],
        result_refs: refs,
        as_of: AS_OF,
        warnings: ["synthetic evaluation fixture"],
        unavailable_capabilities: [],
      },
      candidate: {
        candidate_id: "FPREV_CAND_AI_LENS_LENS_001",
        angle: "evidence",
        frame: {
          title,
          body,
        },
        evidence_refs: refs,
      },
    },
    expression: {
      candidate_id: "FPREV_CAND_AI_LENS_LENS_001",
      creator_signal: { origin: "direct_prompt", interview_text: null, adoption_state: "not_needed" },
      text_image_division: { title_job: "memorable_judgment", body_job: "evidence_and_mechanism", image_job: "evidence_and_time" },
      reader_job: "proof",
      analytic_relationship: "basket_breadth",
      grammar: "creator_lens",
      composition: "lens_anatomy",
      surface: "paper_signal",
      subject_label: "AI CAPEX",
      horizon_label: "30D VIEW",
      data_status: "synthetic_fixture",
      data_as_of: AS_OF,
      source_label: "Synthetic evaluation series",
      argument: {
        claim: { text: "The real signal is demand spreading from chips across the infrastructure stack", state: "creator_view", binding_id: "BIND_LENS_CLAIM", source_refs: [] },
        observation: { text: observation, state: "derived", binding_id: "BIND_LENS_OBSERVATION", source_refs: refs },
        mechanism: { text: "Breadth signals durable AI demand", state: "creator_view", binding_id: "BIND_LENS_MECHANISM", source_refs: [] },
        implication: { text: "First watch whether breadth holds, then whether demand continues to spill over", state: "conditional", binding_id: "BIND_LENS_IMPLICATION", source_refs: [] },
        countercase: { text: "If networking or power proxies weaken first, the expansion thesis loses its footing", state: "conditional", binding_id: "BIND_LENS_COUNTER", source_refs: [] },
      },
      observation_test: {
        kind: "lens_positive",
        statement: observation,
        threshold: 0,
        supports_binding_ids: ["BIND_LENS_OBSERVATION", "BIND_LENS_LENS_CURVE", "BIND_LENS_CONTRIBUTIONS"],
        source_refs: refs,
      },
      time: {
        observation_start: "2026-06-24T00:00:00Z",
        declared_at: "2026-07-17T09:00:00Z",
        horizon_end: "2026-08-16T09:00:00Z",
        timezone: "UTC",
      },
      lens: {
        lens_id: "LENS_AI_CAPEX_LENS",
        name: "AI Capex Breadth Lens",
        label_kind: "creator_lens",
        selection_mode: "pre_registered",
        universe_frozen_at: "2026-06-23T23:59:00Z",
        base_value: 100,
        weighting: "equal",
        rebalance: "none",
        formula: CANONICAL_FORMULA,
        components,
        limitations: ["A proxy basket is not the same as company orders", "Dividends, fees, and trading costs are excluded"],
        curve_binding_id: "BIND_LENS_LENS_CURVE",
        contribution_binding_id: "BIND_LENS_CONTRIBUTIONS",
      },
      future_beats: [
        { role: "confirmation", label: "Breadth keeps expanding", criterion: "20D Lens remains above 100", at: "2026-08-02T09:00:00Z", state: "conditional", binding_id: "BIND_LENS_CONFIRM", source_refs: [] },
        { role: "invalidation", label: "Expansion relationship fails", criterion: "Lens falls below 100 and stays there for 5D", at: "2026-08-16T09:00:00Z", state: "conditional", binding_id: "BIND_LENS_INVALIDATE", source_refs: [] },
      ],
    },
  };
}

test("LENS computes and renders a transparent four-component Creator Lens", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-lens-"));
  try {
    const job = baseLensJob();
    const compiled = compileLensExpression(job.expression);
    assert.equal(compiled.components.length, 4);
    assert.equal(compiled.synchronized_count, 24);
    assert.ok(compiled.change_from_base > 0);
    const { frame, preview, report } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    assert.equal(report.schema_version, "frame-preview-run-report");
    assert.equal(report.route, "lens");
    assert.equal(report.renders[0].design_family, "lens_ledger");
    assert.equal(report.renders[0].narrative_placement, "ledger_plus_footer");
    assert.equal(preview.candidates[0].template_id, "creator_lens");
    assert.equal(report.release_eligible, false);
    const svg = readFileSync(path.join(output, preview.candidates[0].candidate_id, "frame-preview.svg"), "utf8");
    assert.match(svg, /data-expression-system="lens"/u);
    assert.match(svg, /data-design-family="lens_ledger"/u);
    assert.match(svg, /data-display-system="signal_sans"/u);
    assert.match(svg, /data-lens-stage="true"/u);
    assert.match(svg, /NOT AN OFFICIAL INDEX/u);
    assert.match(svg, /data-future-region="unresolved"/u);
    assert.match(svg, /data-annotation-role="observation"/u);
    assert.match(svg, /data-role="compact-contributions"/u);
    assert.doesNotMatch(svg, /data-layout="open-beat"/u);
    assert.doesNotMatch(svg, /data-series-state="future"/u);
    assert.doesNotMatch(svg, /data-text-truncated="true"/u);
    const visibleComponents = [...compiled.components]
      .sort((left, right) => Math.abs(right.latest_contribution_pp) - Math.abs(left.latest_contribution_pp))
      .slice(0, 3);
    for (const item of visibleComponents) assert.match(svg, new RegExp(`data-binding-ref="${item.binding_id}"`, "u"));
    assert.equal((svg.match(/data-role="compact-component-row"/gu) ?? []).length, 3);
    assert.equal(report.renders[0].audit.single_master, true);
    assert.equal(report.renders[0].audit.mobile_display, "622x400");
    assert.ok(report.renders[0].audit.essential_copy_groups <= 3);
    assert.equal(report.renders[0].audit.essential_font_floor, 20);
    assert.equal(report.renders[0].audit.secondary_font_floor, 16);
    assert.equal(Object.hasOwn(report.renders[0], "compact_image_ref"), false);
    assert.equal(Object.hasOwn(report.renders[0], "compact_audit"), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "frame-feed-622.svg")), false);
    assert.equal(existsSync(path.join(output, preview.candidates[0].candidate_id, "viewpoint-622.png")), false);
    assert.deepEqual(Object.keys(frame), ["title", "body", "image_ref", "alt_text"]);
    assert.equal(frame.image_ref, `${preview.candidates[0].candidate_id}/viewpoint-1866.png`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(output, "frame.json"), "utf8")), frame);
    assert.equal(preview.candidates[0].image_byte_size, validPaintedPng().length);
    for (const privateField of ["state", "schema_version", "candidate_id", "query_binding", "image_sha256", "image_byte_size", "receipt", "scope"]) {
      assert.equal(Object.hasOwn(frame, privateField), false);
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("LENS rejects a creator construction presented as an official index", () => {
  const job = baseLensJob();
  job.expression.lens.name = "AI Demand Index";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "FAKE_INDEX"));
});

test("LENS rejects a hidden component and a mismatched weight side", () => {
  const job = baseLensJob();
  job.preview.candidate.evidence_refs.pop();
  job.expression.lens.components[0].side = "short";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "COMPONENT_EVIDENCE"));
  assert.ok(result.errors.some((error) => error.code === "WEIGHT_SIDE"));
});

test("LENS rejects source envelopes that cross the frozen as-of", () => {
  const job = baseLensJob();
  job.expression.lens.components[0].leg.candles.meta.asOf = "2026-07-18T00:00:00Z";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "CANDLE_AS_OF"));
});

test("LENS rejects an observed sentence contradicted by the computed lens", () => {
  const job = baseLensJob();
  job.expression.observation_test.kind = "lens_negative";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "OBSERVATION_UNSUPPORTED"));
});

test("LENS rejects copy changed after creator confirmation", () => {
  const job = baseLensJob();
  job.preview.candidate.frame.title = "AI Infrastructure Breadth Needs a Basket Test";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "MEANING_LOCK_TITLE"));
});

test("LENS supports a transparent positive long-short observation lens", async () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-lens-"));
  try {
    const job = baseLensJob();
    const expression = job.expression;
    expression.grammar = "long_short_lens";
    expression.analytic_relationship = "long_short_spread";
    expression.text_image_division.image_job = "comparison_and_time";
    expression.composition = "contribution_stage";
    expression.lens.label_kind = "long_short_lens";
    expression.lens.name = "Quality Spread Lens";
    expression.lens.components[0].weight = 0.5;
    expression.lens.components[1].weight = 0.5;
    expression.lens.components[2].weight = -0.5;
    expression.lens.components[2].side = "short";
    expression.lens.components[2].leg.candles = candles("ANET", { start: 83, drift: -0.15 });
    expression.lens.components[3].weight = -0.5;
    expression.lens.components[3].side = "short";
    expression.lens.components[3].leg.candles = candles("VRT", { start: 70, drift: -0.1 });
    expression.observation_test.kind = "long_short_positive";
    const { preview, report } = await runFastPreviewJob(job, output, { rasterize: fakeRasterize });
    assert.equal(preview.candidates[0].template_id, "long_short_lens");
    assert.ok(report.renders[0].lens_summary.change_from_base > 0);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("LENS freezes component selection before the observation window", () => {
  const job = baseLensJob();
  job.expression.lens.universe_frozen_at = "2026-07-01T00:00:00Z";
  const result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "UNIVERSE_FREEZE"));
});

test("LENS allows a retrospective exploratory Lens only with visible selection-bias disclosure", () => {
  const job = baseLensJob();
  job.expression.lens.selection_mode = "retrospective_exploratory";
  job.expression.lens.universe_frozen_at = "2026-07-17T08:59:00Z";
  let result = validateLensPreviewJob(job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "RETROSPECTIVE_DISCLOSURE"));
  job.expression.lens.limitations[0] = "Constituents were selected retrospectively, introducing selection bias";
  result = validateLensPreviewJob(job);
  assert.equal(result.valid, true);
});
