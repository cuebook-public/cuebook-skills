import test from "node:test";
import assert from "node:assert/strict";

import * as VALIDATOR from "../scripts/validate_query_bundle.mjs";
import * as REQUEST_VALIDATOR from "../scripts/validate_query_request.mjs";

function bundle() {
  return {
    schema_version: "cuebook-query-bundle-v1",
    module_id: "query",
    query_id: "QRY_uso_latest",
    state: "complete",
    read_only: true,
    query_type: "latest_stories",
    as_of: "2026-07-15T19:00:00+08:00",
    request: { raw_text: "看 USO 最新叙事", asset_refs: ["asset:uso"], time_range: null, depth: "quick" },
    results: [{ result_id: "RES_story", kind: "story", title: "Oil risk premium", summary: "Risk premium is unwinding.", data_ref: "story:uso:1", source_refs: ["SRC_story"], as_of: "2026-07-15T18:50:00+08:00", status: "available" }],
    source_register: [{ source_ref: "SRC_story", source_type: "cuebook_story", locator: "cuebook://story/uso/1", published_at: "2026-07-15T18:45:00+08:00", retrieved_at: "2026-07-15T19:00:00+08:00", usage_rights: "citation_only" }],
    unavailable_capabilities: [],
    creation_handoff: { eligible: true, subject_refs: ["asset:uso"], result_refs: ["RES_story"], warnings: [] },
    quality_report: { warnings: [], hard_failures: [] },
  };
}

function request() {
  return {
    schema_version: "cuebook-query-request-v1",
    request_id: "QREQ_hood_chart",
    raw_text: "画一张 HOOD 和 COIN 过去一年的事实价格对比图，不写观点。",
    query_type: "market_series",
    asset_inputs: ["HOOD", "COIN"],
    time_range: "1y",
    depth: "focused",
    output_mode: "factual_chart",
  };
}

test("valid bundle", () => {
  assert.ok(VALIDATOR.validate(bundle()).valid);
});

test("factual chart is a valid query request", () => {
  assert.ok(REQUEST_VALIDATOR.validate(request()).valid);
  const item = request();
  item.output_mode = "creator_viewpoint_graphic";
  assert.ok(new Set(REQUEST_VALIDATOR.validate(item).errors.map((error) => error.code)).has("SCHEMA_ENUM"));
});

test("query must be read only", () => {
  const item = bundle();
  item.read_only = false;
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("READ_ONLY"));
});

test("query module is explicit", () => {
  const item = bundle();
  item.module_id = "create";
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("MODULE_ID"));
});

test("source refs resolve", () => {
  const item = bundle();
  item.results[0].source_refs = ["SRC_missing"];
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("UNKNOWN_SOURCE_REF"));
});

test("partial when capability is unavailable", () => {
  const item = bundle();
  item.unavailable_capabilities = ["get_candles"];
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("UNAVAILABLE_COMPLETE"));
  item.state = "partial";
  assert.ok(VALIDATOR.validate(item).valid);
});

test("handoff refs resolve", () => {
  const item = structuredClone(bundle());
  item.creation_handoff.result_refs = ["RES_missing"];
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("UNKNOWN_HANDOFF_RESULT"));
});

test("blocked query cannot handoff", () => {
  const item = bundle();
  item.state = "blocked";
  item.quality_report.hard_failures = ["provider unavailable"];
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("BLOCKED_HANDOFF"));
  item.creation_handoff = { eligible: false, subject_refs: [], result_refs: [], warnings: ["provider unavailable"] };
  assert.ok(VALIDATOR.validate(item).valid);
});

test("partial query needs usable result and gap", () => {
  const item = bundle();
  item.state = "partial";
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("PARTIAL_STATE"));
  item.quality_report.warnings = ["fundamentals unavailable"];
  assert.ok(VALIDATOR.validate(item).valid);
});

test("schema is enforced", () => {
  let item = bundle();
  delete item.as_of;
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("SCHEMA_REQUIRED"));
  item = bundle();
  item.state = "unknown";
  assert.ok(new Set(VALIDATOR.validate(item).errors.map((error) => error.code)).has("SCHEMA_ENUM"));
});
