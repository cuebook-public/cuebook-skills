import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_frame_preview.mjs";

const HASH = `sha256:${"a".repeat(64)}`;
const CHECKS = ["creator_ownership", "source_binding", "copy_fit", "image_render"];

function candidate(index = 1, angle = "conviction", template = "verdict") {
  return {
    candidate_id: `FPREV_CAND_BTC_${index}`,
    angle,
    visual_kind: "logic_card",
    template_id: template,
    frame: {
      title: `BTC Resilience Is Becoming an Opportunity ${index}`,
      body: `BTC did not weaken alongside US equities under pressure. Over the next 30 days, I am watching whether this relative strength keeps attracting marginal capital. Version ${index}`,
      image_ref: `FPREV_CAND_BTC_${index}/viewpoint-2488.png`,
      alt_text: `Viewpoint visual showing BTC relative strength, a capital-rotation hypothesis, and a 30-day observation window, version ${index}`,
    },
    image_sha256: HASH,
    image_byte_size: 1,
    evidence_refs: ["RES_MARKET_STATE"],
    quality_checks: [...CHECKS],
  };
}

function preview() {
  return {
    schema_version: "frame-preview-v1",
    preview_id: "FPREV_BTC_30D_001",
    state: "ready",
    created_at: "2026-07-17T17:00:00+08:00",
    meaning_lock_ref: "MLOCK_BTC_30D_001",
    creator_view: {
      original_text: "BTC has refused to break lower, and I think it has another move up.",
      subject: "BTC",
      direction: "long",
      observation_window: "Past 21 days",
      horizon: "30 days",
      claim: "BTC's resilience may develop into the next move higher",
      mechanism: "When risk appetite in US equities is under pressure, marginal capital may seek assets with around-the-clock liquidity",
      next_watch: "BTC relative strength versus Nasdaq and spot demand",
    },
    query_binding: {
      required: true,
      status: "executed",
      bundle_refs: ["QRY_BTC_30D"],
      result_refs: ["RES_MARKET_STATE"],
      as_of: "2026-07-17T16:55:00+08:00",
      warnings: [],
      unavailable_capabilities: [],
    },
    generation: { mode: "recommended_one", candidate_count: 1 },
    candidates: [candidate()],
    selection: { selected_candidate_id: null, confirmed: false },
    blockers: [],
  };
}

function codes(payload) {
  return new Set(validate(payload).errors.map((error) => error.code));
}

test("one recommended Frame is the valid default", () => {
  assert.deepEqual(validate(preview()), { valid: true, errors: [] });
});

test("a confirmed preview stays one image at a time", () => {
  const item = preview();
  item.generation = { mode: "requested_three", candidate_count: 3 };
  item.candidates = [
    candidate(1, "conviction", "verdict"),
    candidate(2, "evidence", "proof"),
    candidate(3, "mechanism", "system"),
  ];
  assert.equal(validate(item).valid, false);
  assert.ok(codes(item).has("SCHEMA_CONST") || codes(item).has("SCHEMA_MAX_ITEMS"));
});

test("default preview cannot silently expand to three", () => {
  const item = preview();
  item.generation.candidate_count = 3;
  assert.ok(codes(item).has("GENERATION_MODE"));
});

test("partial Cuebook data makes the preview conditional", () => {
  const item = preview();
  item.query_binding.status = "partial";
  item.query_binding.warnings = ["positioning unavailable"];
  item.query_binding.unavailable_capabilities = ["get_positioning"];
  assert.ok(codes(item).has("PARTIAL_QUERY"));
  item.state = "conditional";
  assert.equal(validate(item).valid, true);
});

test("material current-market copy binds a frozen query result", () => {
  const item = preview();
  item.candidates[0].evidence_refs = [];
  assert.ok(codes(item).has("SOURCE_BINDING"));
});

test("one sourced market chart is valid without pretending to be a logic template", () => {
  const item = preview();
  Object.assign(item.candidates[0], { visual_kind: "market_chart", template_id: "thesis_chart" });
  assert.equal(validate(item).valid, true);
  item.candidates[0].template_id = "system";
  assert.ok(codes(item).has("VISUAL_ROUTE"));
});

test("unavailable required evidence blocks instead of fabricating", () => {
  const item = preview();
  Object.assign(item, { state: "blocked", candidates: [], blockers: ["Cuebook MCP authorization required"] });
  Object.assign(item.query_binding, { status: "unavailable", bundle_refs: [], result_refs: [], as_of: null });
  assert.equal(validate(item).valid, true);
  item.state = "conditional";
  assert.ok(codes(item).has("QUERY_UNAVAILABLE"));
});

test("public Frame stays Frame-only and hides workflow narration", () => {
  const item = preview();
  item.candidates[0].frame.body = "This is a Reddit candidate set that passed quality scoring and workflow checks.";
  assert.ok(codes(item).has("PUBLIC_LANGUAGE"));
});

test("selection confirms one exact preview candidate", () => {
  const item = preview();
  item.state = "selected";
  item.selection = { selected_candidate_id: item.candidates[0].candidate_id, confirmed: true };
  assert.equal(validate(item).valid, true);
  item.selection.selected_candidate_id = "FPREV_CAND_UNKNOWN_99";
  assert.ok(codes(item).has("SELECTION"));
});

test("preview contract has no compact, OG, release, or settlement surface", () => {
  const item = preview();
  item.candidates[0].compact_preview_ref = "compact.png";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "SCHEMA_ADDITIONAL_PROPERTY"));
});
