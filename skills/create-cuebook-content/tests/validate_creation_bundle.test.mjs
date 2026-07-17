import test from "node:test";
import assert from "node:assert/strict";

import * as VALIDATOR from "../scripts/validate_creation_bundle.mjs";
import * as SEED_VALIDATOR from "../scripts/validate_creator_seed.mjs";

function query_snapshot() {
  return {
    schema_version: "cuebook-query-bundle-v1",
    module_id: "query",
    query_id: "QRY_uso_latest",
    state: "complete",
    read_only: true,
    query_type: "mixed",
    as_of: "2026-07-15T19:00:00+08:00",
    request: { raw_text: "查询 USO 最新故事和市场状态", asset_refs: ["asset:uso"], time_range: null, depth: "focused" },
    results: [
      { result_id: "RES_story", kind: "story", title: "Oil risk premium", summary: "Risk premium is unwinding.", data_ref: "story:uso:1", source_refs: ["SRC_story"], as_of: "2026-07-15T18:50:00+08:00", status: "available" },
      { result_id: "RES_state", kind: "market_state", title: "USO market state", summary: "Latest sealed snapshot.", data_ref: "market:uso:1", source_refs: ["SRC_state"], as_of: "2026-07-15T19:00:00+08:00", status: "available" },
    ],
    source_register: [
      { source_ref: "SRC_story", source_type: "cuebook_story", locator: "cuebook://story/uso/1", published_at: "2026-07-15T18:45:00+08:00", retrieved_at: "2026-07-15T19:00:00+08:00", retrieved_via: "cuebook_mcp", usage_rights: "citation_only" },
      { source_ref: "SRC_state", source_type: "cuebook_market_state", locator: "cuebook://market/uso/1", published_at: null, retrieved_at: "2026-07-15T19:00:00+08:00", retrieved_via: "cuebook_mcp", usage_rights: "display" },
    ],
    retrieval_report: { cuebook_batches: 1, web_batches: 0, web_queries: 0, web_source_refs: [] },
    unavailable_capabilities: [],
    creation_handoff: { eligible: true, subject_refs: ["asset:uso"], result_refs: ["RES_story", "RES_state"], warnings: [] },
    quality_report: { warnings: [], hard_failures: [] },
  };
}

function bind_query(item, snapshot) {
  Object.assign(item.query_binding, {
    query_bundle_ref: snapshot.query_id,
    query_bundle_hash: VALIDATOR.query_bundle_hash(snapshot),
    query_state: snapshot.state,
    result_refs: snapshot.results.filter((result) => result.status !== "unavailable").map((result) => result.result_id),
    as_of: snapshot.as_of,
  });
}

function bundle() {
  const snapshot = query_snapshot();
  const item = {
    schema_version: "cuebook-creation-bundle-v1",
    module_id: "create",
    creation_id: "CREATE_uso_view",
    state: "ready",
    created_at: "2026-07-15T19:10:00+08:00",
    creator_request: { seed_text: "我认为原油风险溢价会回吐", authorship_mode: "cuebook_assisted", stance_source: "creator_seed", adopted_claim_refs: [], adoption_confirmed: false, material_current_claims: true, requested_outputs: ["text", "visual"] },
    query_binding: { required: true, status: "executed", query_bundle_ref: null, query_bundle_hash: null, query_state: "not_applicable", result_refs: [], as_of: null, freshness: "fresh", warnings: [] },
    workflow_run_ref: "WORKFLOW_uso",
    candidate_set_ref: "CANDSET_uso",
    candidate_refs: ["CAND_uso_a", "CAND_uso_b", "CAND_uso_c"],
    settlement_claim_ref: null,
    release_bundle_ref: null,
    quality_report: { warnings: [], hard_failures: [] },
  };
  bind_query(item, snapshot);
  return item;
}

function validate(item, snapshot = null) {
  return VALIDATOR.validate(item, snapshot || query_snapshot());
}

function seed() {
  return {
    schema_version: "creator-seed-v1",
    seed_id: "SEED_hood_view",
    seed_text: "我认为 HOOD 的链上证券业务会带来重估。",
    deliverable: "market_post",
    requested_outputs: ["text", "visual"],
    material_current_claims: true,
    stance_source: "creator_seed",
    source_claim_refs: [],
    adoption_confirmed: false,
  };
}

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

test("valid creation bundle", () => {
  assert.ok(validate(bundle()).valid);
});

test("creator seed requires creation deliverable", () => {
  assert.ok(SEED_VALIDATOR.validate(seed()).valid);
  const item = seed();
  item.deliverable = "factual_chart";
  assert.ok(codes(SEED_VALIDATOR.validate(item)).has("SCHEMA_ENUM"));
});

test("creator seed requires Frame text and image", () => {
  const item = seed();
  item.requested_outputs = ["text"];
  assert.ok(codes(SEED_VALIDATOR.validate(item)).has("FRAME_OUTPUT_REQUIRED"));
});

test("ready creation requires Frame text and image", () => {
  const item = bundle();
  item.creator_request.requested_outputs = ["text"];
  assert.ok(codes(validate(item)).has("FRAME_OUTPUT_REQUIRED"));
});

test("material claim requires query", () => {
  const item = bundle();
  item.query_binding = { required: false, status: "not_required", query_bundle_ref: null, query_bundle_hash: null, query_state: "not_applicable", result_refs: [], as_of: null, freshness: "unknown", warnings: [] };
  assert.ok(codes(validate(item)).has("MATERIAL_QUERY_REQUIRED"));
});

test("creation module is explicit", () => {
  const item = bundle();
  item.module_id = "query";
  assert.ok(codes(validate(item)).has("MODULE_ID"));
});

test("query lineage is required", () => {
  const item = bundle();
  item.query_binding.query_bundle_ref = null;
  assert.ok(codes(validate(item)).has("QUERY_LINEAGE"));
});

test("frozen creation accepts one selected candidate", () => {
  const item = bundle();
  item.candidate_refs = ["CAND_a"];
  assert.ok(validate(item).valid);
  item.candidate_refs = ["CAND_a", "CAND_b"];
  assert.ok(codes(validate(item)).has("CANDIDATE_COUNT"));
});

test("unavailable query cannot be ready", () => {
  const item = bundle();
  Object.assign(item.query_binding, { status: "unavailable", query_bundle_ref: null, query_bundle_hash: null, query_state: "blocked", result_refs: [], as_of: null, freshness: "unknown" });
  assert.ok(codes(validate(item)).has("UNAVAILABLE_QUERY_BLOCKS"));
});

test("blocked creation has no candidates", () => {
  const item = bundle();
  item.state = "blocked";
  Object.assign(item.query_binding, { status: "unavailable", query_bundle_ref: null, query_bundle_hash: null, query_state: "blocked", result_refs: [], as_of: null, freshness: "unknown" });
  item.candidate_set_ref = null;
  item.candidate_refs = [];
  item.quality_report.hard_failures = ["query unavailable"];
  assert.ok(validate(item).valid);
  item.candidate_refs = ["CAND_forbidden"];
  assert.ok(codes(validate(item)).has("BLOCKED_CANDIDATES"));
});

test("partial query cannot be ready", () => {
  const snapshot = query_snapshot();
  snapshot.state = "partial";
  snapshot.unavailable_capabilities = ["query_fundamental_metrics"];
  snapshot.quality_report.warnings = ["fundamentals unavailable"];
  const item = bundle();
  bind_query(item, snapshot);
  assert.ok(codes(validate(item, snapshot)).has("READY_WITH_PARTIAL_QUERY"));
  item.state = "conditional";
  assert.ok(validate(item, snapshot).valid);
});

test("source stance requires adoption", () => {
  const item = bundle();
  item.creator_request.stance_source = "source_commentator";
  assert.ok(codes(validate(item)).has("SOURCE_STANCE_ADOPTION"));
  Object.assign(item.creator_request, { adopted_claim_refs: ["RES_story"], adoption_confirmed: true });
  assert.ok(validate(item).valid);
});

test("schema is enforced", () => {
  let item = bundle();
  delete item.created_at;
  assert.ok(codes(validate(item)).has("SCHEMA_REQUIRED"));
  item = bundle();
  item.unexpected = true;
  assert.ok(codes(validate(item)).has("SCHEMA_ADDITIONAL_PROPERTY"));
});

test("query bundle hash is verified", () => {
  const item = bundle();
  item.query_binding.query_bundle_hash = "sha256:" + "0".repeat(64);
  assert.ok(codes(validate(item)).has("QUERY_HASH_MISMATCH"));
});

test("bound creation requires query bundle", () => {
  assert.ok(codes(VALIDATOR.validate(bundle())).has("QUERY_BUNDLE_REQUIRED"));
});
