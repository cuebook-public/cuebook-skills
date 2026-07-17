import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_creator_feed.mjs";

const H = "a".repeat(64);

function baseFeed() {
  return {
    schema_version: "creator-feed-v1",
    feed_id: "CF_1234abcd",
    generated_at: "2026-07-14T12:05:00+00:00",
    as_of: "2026-07-14T12:00:00+00:00",
    knowledge_cutoff_at: "2026-07-14T12:00:00+00:00",
    input_hash: `sha256:${"0".repeat(64)}`,
    ruleset_version: "2026-07-14",
    brief: {
      workspace_ref: "cuebook-prod", creator_ref: "creator-vito",
      snapshot_ref: "snapshot-42", timezone: "Asia/Shanghai", locale: "zh-CN",
      universe: ["US equities", "semiconductors"], personalized_advice_allowed: false,
    },
    source_register: [
      {
        id: "SRC_company_q2", revision_id: `sha256:${H}`,
        source_type: "company_release", publisher: "Example Corp",
        locator: "https://example.com/q2", external_id: "q2-2026",
        content_hash: `sha256:${"b".repeat(64)}`, published_at: "2026-07-14T10:00:00+00:00",
        source_updated_at: null, observed_at: "2026-07-14T10:02:00+00:00",
        authorized_at: null, available_at: "2026-07-14T10:02:00+00:00",
        access: "public", reuse_rights: "summarize_allowed", trust_state: "verified",
        independent_cluster_id: "SC_example_q2",
      },
    ],
    entities: [
      {
        id: "ENT_example", kind: "company", canonical_name: "Example Corp",
        symbol_aliases: [{ symbol: "EXM", venue: "NASDAQ", valid_from: null, valid_to: null }],
      },
    ],
    news: [
      {
        id: "NEWS_q2", revision_id: `sha256:${"c".repeat(64)}`, record_status: "active",
        headline: "Example reports Q2", summary: "Revenue rose.", entity_refs: ["ENT_example"],
        source_refs: ["SRC_company_q2"], cluster_id: "NC_q2", occurred_at: "2026-07-14T10:00:00+00:00",
        published_at: "2026-07-14T10:00:00+00:00", observed_at: "2026-07-14T10:02:00+00:00",
        available_at: "2026-07-14T10:02:00+00:00", evidence_role: "attributable_fact",
      },
    ],
    calendar_events: [
      {
        id: "CAL_call", revision_id: `sha256:${"d".repeat(64)}`, record_status: "active",
        label: "Q2 earnings call", event_type: "earnings", event_status: "scheduled",
        entity_refs: ["ENT_example"], source_refs: ["SRC_company_q2"],
        scheduled_at: "2026-07-14T13:00:00+00:00", timezone: "America/New_York",
        available_at: "2026-07-14T10:02:00+00:00", previous_revision_refs: [],
      },
    ],
    narratives: [
      {
        id: "NAR_revision", revision_id: `sha256:${"e".repeat(64)}`, record_status: "active",
        origin: "model", narrative_class: "hypothesis",
        claim: "The quarter may lift the next two estimates.", entity_refs: ["ENT_example"],
        source_refs: ["SRC_company_q2"], created_at: "2026-07-14T10:10:00+00:00",
        available_at: "2026-07-14T10:10:00+00:00", horizon: "two quarters",
        mechanism: ["reported revenue changes analyst models"],
        evidence_gaps: ["consensus revision data"], falsifier: "Forward estimates remain flat.",
      },
    ],
    trade_ideas: [
      {
        id: "IDEA_watch", revision_id: `sha256:${"f".repeat(64)}`, record_status: "active",
        thesis: "Watch for a revision cycle after the call.", direction: "watch",
        entity_refs: ["ENT_example"], source_refs: ["SRC_company_q2"],
        catalyst_refs: ["CAL_call", "NAR_revision"], created_at: "2026-07-14T10:12:00+00:00",
        observed_at: "2026-07-14T10:12:00+00:00", available_at: "2026-07-14T10:12:00+00:00",
        horizon: "30 days", invalidation: "Guidance and estimates do not rise.",
        evidence_state: "partial", execution_state: "idea_only",
      },
    ],
    trade_history: [
      {
        id: "TRADE_old", revision_id: `sha256:${"1".repeat(64)}`, record_status: "active",
        trade_type: "executed", entity_refs: ["ENT_example"], source_refs: [],
        idea_ref: null, side: "long", lifecycle_state: "closed",
        opened_at: "2026-05-01T14:00:00+00:00", closed_at: "2026-05-20T14:00:00+00:00",
        recorded_at: "2026-05-20T14:05:00+00:00", available_at: "2026-05-20T14:05:00+00:00",
        execution_verification: "broker_reconciled", position_disclosure: "public_flat",
        commercial_relationship: "none", public_reuse_permission: "aggregate_only",
        performance: { return_pct: 4.2, pnl_amount: null, currency: null, fees_included: true, basis: "executed_reconciled" },
      },
    ],
    links: [
      { id: "LINK_news_narrative", from_ref: "NAR_revision", to_ref: "NEWS_q2", relation: "derived_from" },
    ],
    quality_report: {
      decision: "ready", hard_failures: [], warnings: [], checks: ["cutoff-safe"],
      record_counts: { sources: 1, entities: 1, news: 1, calendar_events: 1, narratives: 1, trade_ideas: 1, trade_history: 1, links: 1, quarantined: 0 },
      quarantined_records: [],
    },
  };
}

function codes(result, key = "errors") {
  return new Set(result[key].map((entry) => entry.code));
}

test("base feed is valid", () => {
  const result = validate(baseFeed());
  assert.ok(result.valid, JSON.stringify(result));
});

test("personalized advice must stay disabled", () => {
  const item = baseFeed();
  item.brief.personalized_advice_allowed = true;
  assert.ok(codes(validate(item)).has("PERSONALIZED_ADVICE"));
});

test("active record after cutoff is temporal leakage", () => {
  const item = baseFeed();
  item.news[0].available_at = "2026-07-14T12:01:00+00:00";
  assert.ok(codes(validate(item)).has("TEMPORAL_LEAKAGE"));
});

test("unknown entity reference is rejected", () => {
  const item = baseFeed();
  item.news[0].entity_refs = ["ENT_missing"];
  assert.ok(codes(validate(item)).has("UNKNOWN_ENTITY_REF"));
});

test("news requires a source", () => {
  const item = baseFeed();
  item.news[0].source_refs = [];
  assert.ok(codes(validate(item)).has("NEWS_SOURCE_REQUIRED"));
});

test("active record cannot rely on a retracted source", () => {
  const item = baseFeed();
  item.source_register[0].trust_state = "retracted";
  assert.ok(codes(validate(item)).has("RETRACTED_SUPPORT"));
});

test("available_at cannot precede observed_at", () => {
  const item = baseFeed();
  item.source_register[0].available_at = "2026-07-14T09:00:00+00:00";
  assert.ok(codes(validate(item)).has("AVAILABLE_BEFORE_OBSERVED"));
});

test("identical content hashes must share one cluster", () => {
  const item = baseFeed();
  const duplicate = structuredClone(item.source_register[0]);
  duplicate.id = "SRC_syndicated";
  duplicate.revision_id = `sha256:${"2".repeat(64)}`;
  duplicate.independent_cluster_id = "SC_wrong";
  item.source_register.push(duplicate);
  item.quality_report.record_counts.sources = 2;
  assert.ok(codes(validate(item)).has("DUPLICATE_CLUSTER_SPLIT"));
});

test("narrative requires a falsifier", () => {
  const item = baseFeed();
  item.narratives[0].falsifier = "";
  assert.ok(codes(validate(item)).has("NARRATIVE_FIELD"));
});

test("source-bound narrative requires a source", () => {
  const item = baseFeed();
  item.narratives[0].narrative_class = "source_bound";
  item.narratives[0].source_refs = [];
  assert.ok(codes(validate(item)).has("SOURCE_BOUND_NARRATIVE"));
});

test("executed state cannot live on a trade idea", () => {
  const item = baseFeed();
  item.trade_ideas[0].execution_state = "executed";
  assert.ok(codes(validate(item)).has("IDEA_EXECUTION_PROMOTION"));
});

test("trade records cannot be catalysts", () => {
  const item = baseFeed();
  item.trade_ideas[0].catalyst_refs = ["TRADE_old"];
  assert.ok(codes(validate(item)).has("UNKNOWN_CATALYST_REF"));
});

test("public executed-trade reuse requires broker reconciliation", () => {
  const item = baseFeed();
  item.trade_history[0].execution_verification = "self_reported";
  item.trade_history[0].public_reuse_permission = "record_allowed";
  assert.ok(codes(validate(item)).has("PUBLIC_EXECUTION_UNVERIFIED"));
});

test("active history cannot contain an outcome after the cutoff", () => {
  const item = baseFeed();
  item.trade_history[0].closed_at = "2026-07-15T14:00:00+00:00";
  assert.ok(codes(validate(item)).has("FUTURE_TRADE_OUTCOME"));
});

test("unknown disclosure warns and blocks a ready decision", () => {
  const item = baseFeed();
  item.trade_history[0].position_disclosure = "unknown";
  const result = validate(item);
  assert.ok(codes(result, "warnings").has("DISCLOSURE_UNKNOWN"));
  assert.ok(codes(result).has("READY_WITH_UNRESOLVED_GUARDS"));
});

test("unclear source use warns while conditional feed stays valid", () => {
  const item = baseFeed();
  item.source_register[0].access = "unknown";
  item.quality_report.decision = "conditional";
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result));
  assert.ok(codes(result, "warnings").has("SOURCE_USE_UNCLEAR"));
});

test("quarantine index must match quarantined records", () => {
  const item = baseFeed();
  item.news[0].record_status = "quarantined";
  item.quality_report.record_counts.quarantined = 1;
  assert.ok(codes(validate(item)).has("QUARANTINE_INDEX"));
});

test("hard failures require a blocked decision", () => {
  const item = baseFeed();
  item.quality_report.hard_failures = ["identity mismatch"];
  assert.ok(codes(validate(item)).has("HARD_FAILURE_STATE"));
});

test("record counts must be exact", () => {
  const item = baseFeed();
  item.quality_report.record_counts.news = 2;
  assert.ok(codes(validate(item)).has("RECORD_COUNTS"));
});

test("unknown root fields are rejected", () => {
  const item = baseFeed();
  item.debug = true;
  assert.ok(codes(validate(item)).has("UNKNOWN_ROOT_FIELD"));
});
