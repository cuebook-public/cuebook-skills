import test from "node:test";
import assert from "node:assert/strict";

import { canonicalHash, validate } from "../scripts/validate_trading_thesis.mjs";

function baseThesis() {
  return {
    schema_version: "trading-thesis-v1",
    thesis_id: "THESIS_hormuz01",
    revision: 1,
    lifecycle_state: "ready",
    timestamps: {
      created_at: "2026-07-14T09:30:00+08:00",
      updated_at: "2026-07-14T10:00:00+08:00",
      as_of: "2026-07-14T10:00:00+08:00",
      decision_cutoff_at: "2026-07-14T10:00:00+08:00",
      activated_at: "2026-07-14T10:01:00+08:00",
      expires_at: "2026-08-14T16:00:00+08:00",
    },
    author: { creator_ref: "CREATOR_demo", author_type: "hybrid" },
    lineage: {
      source_artifact_refs: ["research-pack-v1:hormuz-uso"],
      root_thesis_ref: null,
      previous_revision_ref: null,
      canonical_hash: null,
    },
    market: {
      instrument_id: "USO:ARCX",
      display_name: "United States Oil Fund",
      ticker: "USO",
      asset_class: "etf",
      venue: "ARCX",
      quote_currency: "USD",
      direction: "long",
      relationship: "direct",
      projection_gate_ref: "gate:hormuz-uso",
      proxy_reason: null,
    },
    claim: {
      statement: "USO is likely to close at or above 119.83 before the resolution window ends.",
      why_now: "Shipping risk is repricing prompt oil while the market still discounts a prolonged disruption.",
      horizon: "one month",
      confidence: "medium",
      probability: 0.62,
      probability_basis: "Scenario-weighted assessment from the cited shipping and market observations.",
    },
    idea_provenance: {
      mode: "cuebook_assisted",
      creator_seed: "Shipping disruption may create a tradable oil risk premium.",
      cuebook_contributions: [
        {
          kind: "countercase",
          summary: "Cuebook added partial tanker passage as evidence against an immediate full-disruption trade.",
          evidence_refs: ["E2"],
        },
        {
          kind: "settlement_rule",
          summary: "Cuebook converted the view into a dated USO threshold with an explicit fallback source.",
          evidence_refs: ["E3"],
        },
      ],
      creator_decision: "Keep the long view while requiring persistent restrictions and prompt-spread strength.",
      idea_delta: "conditionalized",
      final_trade_idea: "A conditional USO long thesis that fails if shipping and prompt spreads normalize.",
      public_attribution: true,
    },
    evidence_ledger: [
      {
        id: "E1",
        claim: "Verified prompt oil prices rose after the disruption risk increased.",
        evidence_class: "verified_live",
        source_ref: "source:market-data-1",
        as_of: "2026-07-14T09:55:00+08:00",
        freshness: "current",
        role: "supports",
      },
      {
        id: "E2",
        claim: "Available tanker traffic data still shows partial passage through the strait.",
        evidence_class: "source",
        source_ref: "source:shipping-1",
        as_of: "2026-07-14T09:40:00+08:00",
        freshness: "current",
        role: "challenges",
      },
      {
        id: "E3",
        claim: "USO was observed at 108.70 before the cutoff.",
        evidence_class: "verified_live",
        source_ref: "source:uso-quote-1",
        as_of: "2026-07-14T09:59:00+08:00",
        freshness: "current",
        role: "context",
      },
    ],
    reasoning: {
      mechanisms: [
        {
          step: 1,
          claim: "Higher disruption probability raises the prompt crude risk premium and flows into USO exposure.",
          status: "derived",
          evidence_refs: ["E1", "E2"],
        },
      ],
      supporting_evidence_refs: ["E1"],
      counterevidence_refs: ["E2"],
      gaps: ["Duration of any shipping interruption remains uncertain."],
      scenarios: [
        {
          id: "SC1",
          label: "Disruption persists",
          condition: "Verified traffic restrictions continue for at least five sessions.",
          expected_path: "Prompt oil retains a risk premium and USO approaches the threshold.",
          signposts: ["Tanker counts", "Prompt spreads"],
          invalidation: "Traffic normalizes and prompt spreads retrace.",
          evidence_refs: ["E1", "E2"],
        },
        {
          id: "SC2",
          label: "Rapid normalization",
          condition: "Passage normalizes within two sessions.",
          expected_path: "The risk premium fades and the target is unlikely to resolve true.",
          signposts: ["Tanker counts", "Official notices"],
          invalidation: "Restrictions broaden despite normalization notices.",
          evidence_refs: ["E2"],
        },
      ],
    },
    setup: {
      reference_observation: {
        value: 108.70,
        unit: "USD",
        observed_at: "2026-07-14T09:59:00+08:00",
        observation_basis: "last_trade",
        market_state: "regular",
        source_ref: "source:uso-quote-1",
      },
      action_state: "enter_now",
      entry_condition: "The view becomes active only while verified shipping restrictions and prompt-spread strength persist.",
      trigger_condition: null,
      catalysts: [
        {
          event: "Next official shipping-status update",
          expected_at: "2026-07-16T12:00:00+08:00",
          evidence_refs: ["E2"],
        },
      ],
      invalidation: "Verified passage normalizes for three sessions while prompt crude gives back the disruption premium.",
    },
    resolution: {
      status: "complete",
      evaluation_kind: "price_target",
      metric: "official_settlement_price",
      operator: "gte",
      threshold: {
        target_value: 119.83,
        lower_bound: null,
        upper_bound: null,
        unit: "USD",
      },
      observation_basis: "official_settlement",
      window_start: "2026-07-14T10:01:00+08:00",
      window_end: "2026-08-14T16:00:00+08:00",
      data_source_ref: "source:exchange-settlement-1",
      benchmark_ref: null,
      fallback_source_refs: ["source:licensed-market-data-1"],
      timezone: "America/New_York",
      adjustments_policy: "Use split-adjusted prices; symbol changes preserve the same instrument ID.",
      ambiguity_policy: "fallback_source",
      score_modes: ["binary_accuracy", "brier", "directional_accuracy", "return"],
    },
    disclosure: {
      visibility: "public",
      position_status: "none",
      position_text: null,
      commercial_status: "none",
      commercial_text: null,
      identity_status: "verified",
      ai_assistance_status: "assisted",
      public_disclosures: ["AI assisted the evidence organization and drafting."],
    },
    relations: { supports: [], challenges: [], forks: [], supersedes: [] },
    quality_report: {
      decision: "ready",
      evidence_decision: "ready",
      resolution_decision: "ready",
      publication_decision: "ready",
      hard_failures: [],
      warnings: [],
      checks: ["cutoff", "evidence", "countercase", "resolution", "disclosure"],
      counts: { evidence: 3, supporting: 1, challenging: 1, mechanisms: 1, scenarios: 2 },
    },
  };
}

function codes(result, key = "errors") {
  return new Set(result[key].map((entry) => entry.code));
}

test("base thesis is valid", () => {
  const result = validate(baseThesis());
  assert.ok(result.valid, JSON.stringify(result));
});

test("unknown root field", () => {
  const item = baseThesis();
  item.debug = true;
  assert.ok(codes(validate(item)).has("UNKNOWN_ROOT_FIELD"));
});

test("evidence after cutoff", () => {
  const item = baseThesis();
  item.evidence_ledger[0].as_of = "2026-07-14T10:01:00+08:00";
  assert.ok(codes(validate(item)).has("EVIDENCE_AFTER_CUTOFF"));
});

test("unknown mechanism ref", () => {
  const item = baseThesis();
  item.reasoning.mechanisms[0].evidence_refs = ["E99"];
  assert.ok(codes(validate(item)).has("UNKNOWN_MECHANISM_REF"));
});

test("counterevidence required", () => {
  const item = baseThesis();
  item.reasoning.counterevidence_refs = [];
  item.quality_report.counts.challenging = 0;
  assert.ok(codes(validate(item)).has("COUNTEREVIDENCE_REQUIRED"));
});

test("scenarios required", () => {
  const item = baseThesis();
  item.reasoning.scenarios = item.reasoning.scenarios.slice(0, 1);
  item.quality_report.counts.scenarios = 1;
  assert.ok(codes(validate(item)).has("SCENARIOS_REQUIRED"));
});

test("resolution incomplete", () => {
  const item = baseThesis();
  item.resolution.status = "incomplete";
  assert.ok(codes(validate(item)).has("RESOLUTION_INCOMPLETE"));
});

test("resolution window order", () => {
  const item = baseThesis();
  item.resolution.window_end = item.resolution.window_start;
  assert.ok(codes(validate(item)).has("RESOLUTION_WINDOW_ORDER"));
});

test("price target contract", () => {
  const item = baseThesis();
  item.resolution.metric = "event_status";
  assert.ok(codes(validate(item)).has("PRICE_TARGET_CONTRACT"));
});

test("probability basis required", () => {
  const item = baseThesis();
  item.claim.probability_basis = null;
  assert.ok(codes(validate(item)).has("PROBABILITY_BASIS"));
});

test("brier probability required", () => {
  const item = baseThesis();
  item.claim.probability = null;
  item.claim.probability_basis = null;
  assert.ok(codes(validate(item)).has("BRIER_PROBABILITY_REQUIRED"));
});

test("benchmark required", () => {
  const item = baseThesis();
  item.resolution.evaluation_kind = "relative_performance";
  item.resolution.metric = "excess_return_pct";
  item.resolution.benchmark_ref = null;
  item.resolution.score_modes = ["binary_accuracy", "excess_return"];
  assert.ok(codes(validate(item)).has("BENCHMARK_REQUIRED"));
});

test("supported proxy requires gate and reason", () => {
  const item = baseThesis();
  item.market.relationship = "supported_proxy";
  item.market.projection_gate_ref = null;
  item.market.proxy_reason = null;
  const result = validate(item);
  assert.ok(codes(result).has("PROXY_GATE_REQUIRED"));
  assert.ok(codes(result).has("PROXY_REASON_REQUIRED"));
});

test("watch only directional", () => {
  const item = baseThesis();
  item.market.relationship = "watch_only";
  assert.ok(codes(validate(item)).has("WATCH_ONLY_DIRECTIONAL"));
});

test("public disclosure required", () => {
  const item = baseThesis();
  item.disclosure.position_status = "unknown";
  assert.ok(codes(validate(item)).has("PUBLIC_DISCLOSURE_REQUIRED"));
});

test("ai disclosure required", () => {
  const item = baseThesis();
  item.disclosure.ai_assistance_status = "none";
  assert.ok(codes(validate(item)).has("AI_DISCLOSURE_REQUIRED"));
});

test("execution instruction", () => {
  const item = baseThesis();
  item.setup.entry_condition = "Buy immediately with 5x leverage";
  assert.ok(codes(validate(item)).has("EXECUTION_INSTRUCTION"));
});

test("previous revision required", () => {
  const item = baseThesis();
  item.revision = 2;
  assert.ok(codes(validate(item)).has("PREVIOUS_REVISION_REQUIRED"));
});

test("canonical hash required", () => {
  const item = baseThesis();
  item.lifecycle_state = "frozen";
  assert.ok(codes(validate(item)).has("CANONICAL_HASH_REQUIRED"));
});

test("frozen thesis with canonical hash is valid", () => {
  const item = baseThesis();
  item.lifecycle_state = "frozen";
  item.lineage.canonical_hash = canonicalHash(item);
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result));
});

test("canonical hash mismatch after tamper", () => {
  const item = baseThesis();
  item.lifecycle_state = "frozen";
  item.lineage.canonical_hash = canonicalHash(item);
  item.claim.statement = "Tampered after freeze.";
  assert.ok(codes(validate(item)).has("CANONICAL_HASH_MISMATCH"));
});

test("quality counts", () => {
  const item = baseThesis();
  item.quality_report.counts.evidence = 99;
  assert.ok(codes(validate(item)).has("QUALITY_COUNTS"));
});

test("quality decision", () => {
  const item = baseThesis();
  item.quality_report.decision = "conditional";
  assert.ok(codes(validate(item)).has("QUALITY_DECISION"));
});

test("duplicate evidence id", () => {
  const item = baseThesis();
  item.evidence_ledger.push(structuredClone(item.evidence_ledger[0]));
  item.quality_report.counts.evidence = 4;
  assert.ok(codes(validate(item)).has("DUPLICATE_EVIDENCE_ID"));
});

test("evidence source required", () => {
  const item = baseThesis();
  item.evidence_ledger[0].source_ref = null;
  assert.ok(codes(validate(item)).has("EVIDENCE_SOURCE_REQUIRED"));
});

test("observation after cutoff", () => {
  const item = baseThesis();
  item.setup.reference_observation.observed_at = "2026-07-14T10:02:00+08:00";
  assert.ok(codes(validate(item)).has("OBSERVATION_AFTER_CUTOFF"));
});

test("fallback source required", () => {
  const item = baseThesis();
  item.resolution.fallback_source_refs = [];
  assert.ok(codes(validate(item)).has("FALLBACK_SOURCE_REQUIRED"));
});

test("direction resolution conflict", () => {
  const item = baseThesis();
  item.resolution.operator = "lte";
  assert.ok(codes(validate(item)).has("DIRECTION_RESOLUTION_CONFLICT"));
});

test("unknown idea evidence ref", () => {
  const item = baseThesis();
  item.idea_provenance.cuebook_contributions[0].evidence_refs = ["E99"];
  assert.ok(codes(validate(item)).has("UNKNOWN_IDEA_EVIDENCE_REF"));
});

test("creator seed required", () => {
  const item = baseThesis();
  item.idea_provenance.creator_seed = null;
  assert.ok(codes(validate(item)).has("CREATOR_SEED_REQUIRED"));
});

test("reference observation basis", () => {
  const item = baseThesis();
  item.setup.reference_observation.observation_basis = null;
  assert.ok(codes(validate(item)).has("REFERENCE_OBSERVATION_BASIS"));
});

test("wait for trigger requires trigger and stays conditional", () => {
  const item = baseThesis();
  item.setup.action_state = "wait_for_trigger";
  item.setup.trigger_condition = null;
  const result = validate(item);
  assert.ok(codes(result).has("TRIGGER_REQUIRED"));
  assert.ok(codes(result).has("CONDITIONAL_NOT_ACTIVATED"));
});
