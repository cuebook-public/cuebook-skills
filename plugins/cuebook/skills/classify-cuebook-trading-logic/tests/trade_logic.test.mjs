import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_trade_logic.mjs";

function validProfile() {
  return {
    schema_version: "trade-logic-profile-v1",
    profile_id: "TLOGIC_USO_XLE_HORMUZ_20260714",
    revision: 1,
    state: "conditional",
    lineage: {
      input_artifact_refs: ["VARG_USO_XLE_HORMUZ_20260714"],
      source_refs: ["source:ukmto:hormuz-20260714", "INDPACK_USO_XLE:I3"],
      decision_cutoff_at: "2026-07-14T08:27:00Z",
    },
    classification: {
      family: "event_driven",
      catalyst: "geopolitical",
      mechanism: "risk_premium_transmission",
      expression: "relative_value_pair",
      horizon: "one_to_three_days",
      edge: "causal",
      rationale_refs: ["VARG_USO_XLE_HORMUZ_20260714", "INDPACK_USO_XLE:I3"],
    },
    stance: {
      primary_asset: "USO",
      direction: "outperform",
      comparator: "XLE",
      horizon_label: "1-3 days",
    },
    public_expression: {
      action_line: "After the tanker attack, I favor USO over XLE over a 1-3 day window.",
      because_line: "The shipping risk premium enters crude futures first, so direct exposure usually moves faster than energy equities.",
      tags: ["event-driven", "risk transmission", "relative value"],
    },
    evidence_boundary: {
      observed_claim_refs: ["source:ukmto:hormuz-20260714", "INDPACK_USO_XLE:I3"],
      inferred_claim_refs: ["VARG_USO_XLE_HORMUZ_20260714:N3"],
      missing_requirement_refs: ["cuebook:market.order_flow:USO"],
      public_status_suppressed: true,
    },
    quality_report: {
      decision: "conditional",
      warnings: ["The capital-flow view is a causal inference without an order-flow snapshot."],
      hard_failures: [],
    },
  };
}

test("valid_event_relative_profile", () => {
  const result = validate(validProfile());
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("event_driven_requires_catalyst", () => {
  const payload = validProfile();
  payload.classification.catalyst = "none";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(new Set(result.errors.map((item) => item.code)).has("EVENT_CATALYST"));
});

test("relative_value_requires_comparator_and_relative_direction", () => {
  const payload = validProfile();
  Object.assign(payload.stance, { comparator: null, direction: "long" });
  const result = validate(payload);
  const codes = new Set(result.errors.map((item) => item.code));
  assert.ok(codes.has("RELATIVE_COMPARATOR"));
  assert.ok(codes.has("RELATIVE_DIRECTION"));
});

test("public_copy_rejects_backend_workflow_language", () => {
  const payload = validProfile();
  payload.public_expression.action_line = "Wait for confirmation before acting on USO.";
  payload.public_expression.tags[1] = "calculated";
  const result = validate(payload);
  assert.equal(result.valid, false);
  const count = result.errors.filter((item) => item.code === "PUBLIC_BACKEND_TERM").length;
  assert.ok(count >= 2);
});

test("action_line_names_primary_asset", () => {
  const payload = validProfile();
  payload.public_expression.action_line = "After the tanker attack, I favor energy equities.";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(new Set(result.errors.map((item) => item.code)).has("ACTION_ASSET"));
});

test("microstructure_family_requires_matching_mechanism", () => {
  const payload = validProfile();
  Object.assign(payload.classification, { family: "liquidity_microstructure", mechanism: "fundamental_compounding" });
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(new Set(result.errors.map((item) => item.code)).has("MICROSTRUCTURE_MECHANISM"));
});
