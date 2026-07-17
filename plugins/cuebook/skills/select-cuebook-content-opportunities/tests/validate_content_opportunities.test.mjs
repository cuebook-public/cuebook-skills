import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_content_opportunities.mjs";

function feedFixture() {
  return {
    schema_version: "creator-feed-v1",
    feed_id: "CF_1234abcd",
    input_hash: `sha256:${"0".repeat(64)}`,
    knowledge_cutoff_at: "2026-07-14T12:00:00+00:00",
    entities: [{ id: "ENT_example" }],
    news: [{ id: "NEWS_q2", record_status: "active", available_at: "2026-07-14T10:02:00+00:00" }],
    calendar_events: [{ id: "CAL_call", record_status: "active", available_at: "2026-07-14T10:02:00+00:00" }],
    narratives: [{ id: "NAR_revision", record_status: "active", available_at: "2026-07-14T10:10:00+00:00" }],
    trade_ideas: [],
    trade_history: [{ id: "TRADE_old", record_status: "active", available_at: "2026-05-20T14:05:00+00:00", public_reuse_permission: "aggregate_only" }],
  };
}

function candidate() {
  return {
    opportunity_id: "OPP_q2_revision", title: "Q2 revision watch",
    anchor_refs: ["NEWS_q2", "NAR_revision", "CAL_call"], entity_refs: ["ENT_example"],
    lifecycle: "post_event", editorial_job: "test_narrative",
    thesis_seed: "Test whether the release changes forward estimates.", audience: "active equity investors",
    expires_at: "2026-07-15T12:00:00+00:00", eligibility: "researchable", evidence_state: "ready",
    missing_requirements: [], permission_state: "ready", disclosure_state: "ready", conflict_state: "clear",
    history_refs: [], history_use: null,
    factor_vector: { timeliness: "high", evidence_maturity: "high", novelty: "medium", audience_relevance: "high", explainability: "high", production_fit: "high", correction_risk: "low", conflict_risk: "low" },
    decision: "selected", priority: "p1", reason_codes: ["breaking_primary_source", "evidence_ready"],
    dedupe_cluster_id: "OC_q2", merged_into: null, research_requirements: ["compare actual with consensus"],
    recommended_mode: "research_pack", selection_rank: 1, tie_break_key: "20260714-q2-revision",
  };
}

function baseSet() {
  const feed = feedFixture();
  return {
    schema_version: "content-opportunity-set-v1", opportunity_set_id: "OS_1234abcd",
    feed_ref: feed.feed_id, feed_hash: feed.input_hash,
    as_of: "2026-07-14T12:00:00+00:00", decision_cutoff_at: feed.knowledge_cutoff_at,
    ruleset_version: "2026-07-14", mode: "daily_desk", candidates: [candidate()],
    clusters: [{ cluster_id: "OC_q2", member_refs: ["OPP_q2_revision"], canonical_ref: "OPP_q2_revision", reason: "one earnings event" }],
    selected_order: ["OPP_q2_revision"],
    quality_report: { decision: "ready", hard_failures: [], warnings: [], checks: ["no lookahead"], counts: { candidates: 1, selected: 1, deferred: 0, merged: 0, rejected: 0, no_action: 0, blocked: 0 } },
  };
}

const codes = (result) => new Set(result.errors.map((entry) => entry.code));

test("base set is valid", () => assert.equal(validate(baseSet(), feedFixture()).valid, true));

const mutations = [
  ["feed cutoff mismatch", (item) => { item.decision_cutoff_at = "2026-07-14T11:59:00+00:00"; }, "FEED_CUTOFF_MISMATCH"],
  ["unknown anchor", (item) => { item.candidates[0].anchor_refs = ["NEWS_missing"]; }, "UNKNOWN_ANCHOR_REF"],
  ["selected blocked", (item) => { item.candidates[0].eligibility = "blocked"; }, "SELECTED_BLOCKED"],
  ["permission block", (item) => { item.candidates[0].permission_state = "blocked"; }, "SELECTED_PERMISSION_BLOCK"],
  ["selected expired", (item) => { item.candidates[0].expires_at = "2026-07-14T11:00:00+00:00"; }, "SELECTED_EXPIRED"],
  ["factor vector exactness", (item) => { item.candidates[0].factor_vector.future_return = "high"; }, "FACTOR_VECTOR"],
  ["reason code registry", (item) => { item.candidates[0].reason_codes = ["went_up_later"]; }, "REASON_CODE"],
  ["ready with gaps", (item) => { item.candidates[0].missing_requirements = ["consensus source"]; }, "READY_WITH_GAPS"],
  ["inference-only ready", (item) => { item.candidates[0].anchor_refs = ["NAR_revision", "CAL_call"]; }, "INFERENCE_ONLY_READY"],
  ["correction priority", (item) => { item.candidates[0].lifecycle = "correction"; item.candidates[0].editorial_job = "correction"; }, "CORRECTION_PRIORITY"],
  ["p0 scope", (item) => { item.candidates[0].priority = "p0"; }, "P0_SCOPE"],
  ["history use", (item) => { item.candidates[0].history_refs = ["TRADE_old"]; }, "HISTORY_USE"],
  ["postmortem history", (item) => { item.candidates[0].lifecycle = "trade_postmortem"; item.candidates[0].editorial_job = "trade_postmortem"; item.candidates[0].recommended_mode = "postmortem"; }, "POSTMORTEM_HISTORY"],
  ["selected order", (item) => { item.selected_order = []; }, "SELECTED_ORDER"],
  ["conditional ready", (item) => { item.candidates[0].eligibility = "conditional"; item.candidates[0].evidence_state = "conditional"; item.candidates[0].missing_requirements = ["estimate revisions"]; }, "READY_WITH_CONDITIONAL_SELECTION"],
  ["exact counts", (item) => { item.quality_report.counts.selected = 0; }, "COUNTS"],
  ["unknown root", (item) => { item.predicted_engagement = 0.9; }, "UNKNOWN_ROOT_FIELD"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => {
    const item = baseSet();
    mutate(item);
    assert.ok(codes(validate(item, feedFixture())).has(expected));
  });
}

test("merge requires a target", () => {
  const item = baseSet();
  item.candidates[0].decision = "merge";
  item.candidates[0].selection_rank = null;
  item.selected_order = [];
  item.quality_report.counts.selected = 0;
  item.quality_report.counts.merged = 1;
  assert.ok(codes(validate(item, feedFixture())).has("MERGE_TARGET"));
});

test("rank sequence is contiguous", () => {
  const item = baseSet();
  const second = structuredClone(item.candidates[0]);
  second.opportunity_id = "OPP_second";
  second.selection_rank = 3;
  second.tie_break_key = "z";
  item.candidates.push(second);
  item.clusters[0].member_refs.push("OPP_second");
  item.selected_order.push("OPP_second");
  item.quality_report.counts.candidates = 2;
  item.quality_report.counts.selected = 2;
  assert.ok(codes(validate(item, feedFixture())).has("RANK_SEQUENCE"));
});

test("cluster members and memberships agree", () => {
  const item = baseSet();
  item.clusters[0].member_refs = [];
  const resultCodes = codes(validate(item, feedFixture()));
  assert.ok(resultCodes.has("CLUSTER_MEMBERS"));
  assert.ok(resultCodes.has("CLUSTER_MEMBERSHIP_MISMATCH"));
});
