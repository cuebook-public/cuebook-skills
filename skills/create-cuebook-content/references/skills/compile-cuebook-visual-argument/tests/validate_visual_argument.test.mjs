import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_visual_argument.mjs";

function baseArgument() {
  return {
    schema_version: "visual-argument-v1",
    argument_id: "VARG_usovsxle20260714",
    revision: 1,
    state: "conditional",
    lineage: {
      input_artifact_refs: ["POST_uso_vs_xle_20260714", "SETTLE_usovsxle20260714"],
      post_ref: "POST_uso_vs_xle_20260714",
      creator_intent_ref: null,
      thesis_ref: null,
      research_pack_ref: null,
      settlement_claim_ref: "SETTLE_usovsxle20260714",
      decision_cutoff_at: "2026-07-14T07:37:13Z",
    },
    subject: {
      primary: { instrument_id: "USO:ARCX", ticker: "USO", display_name: "United States Oil Fund" },
      benchmark: { instrument_id: "XLE:ARCX", ticker: "XLE", display_name: "Energy Select Sector SPDR Fund" },
      direction: "outperform",
      horizon_end: "2026-07-14T20:00:00Z",
    },
    frame: {
      headline: "油轮遇袭后，USO 会先于 XLE 吸收风险溢价",
      thesis: "航运风险先进入原油期货，USO 的短期反应可能快于能源股。",
      creator_text: "单看反应速度，我选 USO。",
      creator_text_preserved: true,
      cuebook_contribution: "Cuebook 补充了传导顺序、反证和结算窗口。",
      visual_job: "explain_cause",
    },
    graph: {
      nodes: [
        { id: "N1", kind: "event", label: "油轮在霍尔木兹出港航道遇袭", detail: null, status: "observed", fact_refs: ["F1"], source_refs: ["reuters:tanker-strike"], metric_ref: null },
        { id: "N2", kind: "mechanism", label: "航运风险先进入原油期货", detail: "保险区扩大仍待确认。", status: "derived", fact_refs: ["F1", "F6"], source_refs: ["uscf:uso"], metric_ref: null },
        { id: "N3", kind: "market_effect", label: "USO 可能先于 XLE 重定价", detail: null, status: "conditional", fact_refs: ["F3", "F4", "F5"], source_refs: ["cuebook:market"], metric_ref: null },
        { id: "N4", kind: "countercase", label: "保险风险区没有扩大", detail: "风险溢价可能回吐。", status: "unresolved", fact_refs: ["F2"], source_refs: ["imo:shipping"], metric_ref: null },
        { id: "N5", kind: "settlement", label: "到期比较 USO 与 XLE 总收益", detail: null, status: "conditional", fact_refs: [], source_refs: ["SETTLE_usovsxle20260714"], metric_ref: null },
      ],
      edges: [
        { id: "E1", from: "N1", to: "N2", relation: "causes", certainty: "inferred", label: null },
        { id: "E2", from: "N2", to: "N3", relation: "enables", certainty: "hypothesis", label: "传导更直接" },
        { id: "E3", from: "N4", to: "N3", relation: "challenges", certainty: "hypothesis", label: "削弱" },
        { id: "E4", from: "N3", to: "N5", relation: "settles", certainty: "observed", label: null },
      ],
    },
    metrics: [],
    levels: [],
    scenarios: [],
    settlement: {
      settleable: true,
      claim_ref: "SETTLE_usovsxle20260714",
      deadline_at: "2026-07-14T20:00:00Z",
      condition: "USO total return > XLE total return",
      state: "needs_confirmation",
    },
    visual: {
      recommended_grammar: "causal_chain",
      alternative_grammars: ["evidence_balance", "comparison"],
      rationale: "The opinion depends on a short event-to-instrument transmission path.",
      theme: "cuebook_light",
    },
    quality_report: {
      decision: "conditional",
      warnings: ["Insurance-zone expansion and settlement time remain unconfirmed."],
      hard_failures: [],
    },
  };
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

test("test_valid_causal_argument", () => {
  const result = validate(baseArgument());
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("test_observed_node_requires_provenance", () => {
  const item = baseArgument();
  item.graph.nodes[0].source_refs = [];
  const result = validate(item);
  assert.ok(errorCodes(result).has("OBSERVED_PROVENANCE"));
});

test("test_graph_cycle_is_rejected", () => {
  const item = baseArgument();
  item.graph.edges.push({ id: "E5", from: "N3", to: "N1", relation: "causes", certainty: "hypothesis", label: null });
  const result = validate(item);
  assert.ok(errorCodes(result).has("GRAPH_CYCLE"));
});

test("test_metric_grammar_requires_two_metrics", () => {
  const item = baseArgument();
  item.frame.visual_job = "show_metrics";
  item.visual.recommended_grammar = "metric_thesis";
  const result = validate(item);
  assert.ok(errorCodes(result).has("METRIC_GRAMMAR"));
});

test("test_comparison_requires_benchmark", () => {
  const item = baseArgument();
  item.frame.visual_job = "compare_assets";
  item.visual.recommended_grammar = "comparison";
  item.subject.direction = "long";
  item.subject.benchmark = null;
  const result = validate(item);
  assert.ok(errorCodes(result).has("COMPARISON_GRAMMAR"));
});

test("test_creator_text_must_be_preserved", () => {
  const item = baseArgument();
  item.frame.creator_text_preserved = false;
  const result = validate(item);
  assert.ok(errorCodes(result).has("CREATOR_TEXT_PRESERVED"));
});

test("test_settlement_claim_must_match_lineage", () => {
  const item = baseArgument();
  item.settlement.claim_ref = "SETTLE_wrongclaim";
  const result = validate(item);
  assert.ok(errorCodes(result).has("SETTLEMENT_LINEAGE"));
});

test("test_commentator_item_stays_source_lineage_not_creator_text", () => {
  const item = baseArgument();
  item.lineage.input_artifact_refs = ["item_0123456789abcdef", "SETTLE_usovsxle20260714"];
  item.lineage.post_ref = null;
  item.frame.creator_text = null;
  item.frame.creator_text_preserved = false;
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
});
