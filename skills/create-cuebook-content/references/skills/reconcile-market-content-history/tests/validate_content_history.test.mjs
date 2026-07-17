import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_content_history.mjs";

function baseLedger() {
  return {
    schema_version: "content-history-ledger-v1", ledger_id: "CHL_1234abcd", workflow_ref: "WF_1234abcd", release_refs: ["ART_release"],
    as_of: "2026-07-15T13:10:00+00:00", reconciliation_cutoff_at: "2026-07-15T13:10:00+00:00", ruleset_version: "2026-07-14",
    publication_receipts: [{ receipt_id: "REC_x_post", release_ref: "ART_release", release_item_ref: "REL_item_1", platform: "x", status: "verified_published", attempted_at: "2026-07-14T13:00:00+00:00", acknowledged_at: "2026-07-14T13:00:01+00:00", verified_at: "2026-07-14T13:00:05+00:00", remote_id: "123456", remote_url: "https://x.com/example/status/123456", idempotency_key: "release-item-1-v1", payload_hash: `sha256:${"a".repeat(64)}`, verification_method: "api", verification_locator: "api:x:123456" }],
    corrections: [], artifact_invalidations: [],
    content_performance: [{ snapshot_id: "CPS_x_24h", receipt_ref: "REC_x_post", observed_at: "2026-07-15T13:00:00+00:00", window_start: "2026-07-14T13:00:05+00:00", window_end: "2026-07-15T12:00:00+00:00", metric_source: "authorized platform export", metrics: { impressions: 1000, clicks: 20 }, status: "final", use_scope: "packaging_only" }],
    market_outcomes: [], trade_reconciliations: [],
    learning_snapshots: [{ learning_snapshot_id: "LS_content_24h", created_at: "2026-07-15T13:05:00+00:00", task: "compare hook retention", cutoff_at: "2026-07-14T13:00:05+00:00", feature_revision_refs: ["ART_post"], outcome_plane: "content_performance", outcome_refs: ["CPS_x_24h"], policy_versions: ["2026-07-14"], cohort_query_hash: `sha256:${"b".repeat(64)}`, label_definition: "24h click-through rate", window: "24h", exclusions: [], split_method: "forward_time", status: "frozen" }],
    audit_events: [
      { event_id: "HEVT_attempt", object_ref: "REC_x_post", from_state: null, to_state: "attempted", actor: "publisher", occurred_at: "2026-07-14T13:00:00+00:00", reason: "request sent" },
      { event_id: "HEVT_ack", object_ref: "REC_x_post", from_state: "attempted", to_state: "acknowledged", actor: "publisher", occurred_at: "2026-07-14T13:00:01+00:00", reason: "platform acknowledged" },
      { event_id: "HEVT_verified", object_ref: "REC_x_post", from_state: "acknowledged", to_state: "verified_published", actor: "reconciler", occurred_at: "2026-07-14T13:00:05+00:00", reason: "remote object verified" },
    ],
    quality_report: { decision: "ready", hard_failures: [], warnings: [], checks: ["receipt verified"], counts: { receipts: 1, corrections: 0, invalidations: 0, content_snapshots: 1, market_outcomes: 0, trade_reconciliations: 0, learning_snapshots: 1 } },
  };
}

const codes = (result) => new Set(result.errors.map((entry) => entry.code));
test("base ledger is valid", () => assert.equal(validate(baseLedger()).valid, true));

const simpleCases = [
  ["verified receipt field", (item) => { item.publication_receipts[0].remote_id = null; }, "VERIFIED_RECEIPT_FIELD"],
  ["verification method", (item) => { item.publication_receipts[0].verification_method = "none"; }, "VERIFICATION_METHOD"],
  ["content observed early", (item) => { item.content_performance[0].window_end = "2026-07-16T12:00:00+00:00"; }, "CONTENT_OBSERVED_EARLY"],
  ["content use scope", (item) => { item.content_performance[0].use_scope = "investment_validation"; }, "CONTENT_USE_SCOPE"],
  ["learning split", (item) => { item.learning_snapshots[0].split_method = "random_rows"; }, "LEARNING_SPLIT"],
  ["outcome plane", (item) => { item.learning_snapshots[0].outcome_plane = "market_calibration"; }, "OUTCOME_PLANE_REF"],
  ["event chain", (item) => { item.audit_events[1].from_state = null; }, "EVENT_CHAIN"],
  ["object event required", (item) => { item.audit_events = []; }, "OBJECT_EVENT_REQUIRED"],
  ["receipt transition", (item) => { item.audit_events[0].to_state = "verified_published"; }, "RECEIPT_TRANSITION"],
  ["receipt after cutoff", (item) => { item.publication_receipts[0].verified_at = "2026-07-16T13:00:00+00:00"; }, "RECEIPT_AFTER_CUTOFF"],
  ["hard failure state", (item) => { item.quality_report.hard_failures = ["fabricated receipt"]; }, "HARD_FAILURE_STATE"],
  ["counts", (item) => { item.quality_report.counts.receipts = 2; }, "COUNTS"],
  ["unknown root", (item) => { item.engagement_validates_thesis = true; }, "UNKNOWN_ROOT_FIELD"],
];

for (const [name, mutate, expected] of simpleCases) test(name, () => { const item = baseLedger(); mutate(item); assert.ok(codes(validate(item)).has(expected)); });

test("performance requires verified publication", () => {
  const item = baseLedger();
  item.publication_receipts[0].status = "acknowledged";
  item.audit_events = item.audit_events.slice(0, 2);
  assert.ok(codes(validate(item)).has("PERFORMANCE_UNVERIFIED_PUBLICATION"));
});

test("ambiguous retry must reuse the idempotency key", () => {
  const item = baseLedger();
  Object.assign(item.publication_receipts[0], { status: "ambiguous", acknowledged_at: null, verified_at: null, remote_id: null, remote_url: null, verification_method: "none", verification_locator: null });
  item.content_performance = [];
  item.learning_snapshots = [];
  item.audit_events = [{ event_id: "HEVT_ambiguous", object_ref: "REC_x_post", from_state: null, to_state: "ambiguous", actor: "publisher", occurred_at: "2026-07-14T13:00:00+00:00", reason: "timeout after create" }];
  item.quality_report.counts.content_snapshots = 0;
  item.quality_report.counts.learning_snapshots = 0;
  const second = structuredClone(item.publication_receipts[0]);
  second.receipt_id = "REC_x_retry";
  second.idempotency_key = "new-key";
  item.publication_receipts.push(second);
  item.audit_events.push({ event_id: "HEVT_retry", object_ref: "REC_x_retry", from_state: null, to_state: "ambiguous", actor: "publisher", occurred_at: "2026-07-14T13:01:00+00:00", reason: "unsafe retry" });
  item.quality_report.counts.receipts = 2;
  assert.ok(codes(validate(item)).has("AMBIGUOUS_RETRY"));
});

test("material correction requires public action and invalidation cascade", () => {
  const item = baseLedger();
  item.corrections.push({ correction_id: "COR_fact", target_artifact_ref: "ART_post", target_content_hash: `sha256:${"c".repeat(64)}`, category: "factual", severity: "material", status: "complete", detected_at: "2026-07-15T10:00:00+00:00", effective_at: "2026-07-15T10:05:00+00:00", evidence_refs: ["SRC_fix"], before: "Revenue was 10", after: "Revenue was 12", reason: "transcription error", approver_ref: "editor", replacement_artifact_ref: "ART_post_v2", public_action: "none", affected_artifact_refs: ["ART_post"], propagation_status: "complete" });
  item.audit_events.push({ event_id: "HEVT_cor", object_ref: "COR_fact", from_state: null, to_state: "complete", actor: "editor", occurred_at: "2026-07-15T10:05:00+00:00", reason: "correction approved and propagated" });
  item.quality_report.counts.corrections = 1;
  const resultCodes = codes(validate(item));
  assert.ok(resultCodes.has("MATERIAL_PUBLIC_ACTION"));
  assert.ok(resultCodes.has("INCOMPLETE_INVALIDATION_CASCADE"));
});

test("ineligible public trade claim", () => {
  const item = baseLedger();
  item.trade_reconciliations = [{ reconciliation_id: "TRC_one", trade_ref: "TRADE_old", record_type: "paper", verification: "not_applicable", fills_complete: false, fees_included: false, fx_treatment: "not_applicable", corporate_actions_treatment: "not_applicable", cohort_ref: "winners-only", cohort_completeness: "partial", consent: "record_allowed", public_claim_eligibility: "eligible", status: "eligible", exclusion_reason: null }];
  item.quality_report.counts.trade_reconciliations = 1;
  assert.ok(codes(validate(item)).has("PUBLIC_CLAIM_INELIGIBLE"));
});

test("complete broker-reconciled trade claim", () => {
  const item = baseLedger();
  item.trade_reconciliations = [{ reconciliation_id: "TRC_one", trade_ref: "TRADE_old", record_type: "executed", verification: "broker_reconciled", fills_complete: true, fees_included: true, fx_treatment: "included", corporate_actions_treatment: "included", cohort_ref: "all-2026", cohort_completeness: "complete", consent: "record_allowed", public_claim_eligibility: "eligible", status: "eligible", exclusion_reason: null }];
  item.quality_report.counts.trade_reconciliations = 1;
  assert.equal(validate(item).valid, true);
});
