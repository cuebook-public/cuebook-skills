import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import test from "node:test";

import { render } from "../scripts/render_logic_card.mjs";
import { validate } from "../scripts/validate_logic_card.mjs";

function withTemp(run) {
  const directory = mkdtempSync(join(tmpdir(), "cuebook-logic-card-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function baseArgument() {
  return {
    schema_version: "visual-argument-v1",
    argument_id: "VARG_testlogic20260714",
    revision: 1,
    state: "conditional",
    lineage: {
      input_artifact_refs: ["POST_testlogic20260714", "SETTLE_testlogic20260714"],
      post_ref: "POST_testlogic20260714",
      creator_intent_ref: null,
      thesis_ref: null,
      research_pack_ref: null,
      settlement_claim_ref: "SETTLE_testlogic20260714",
      decision_cutoff_at: "2026-07-14T08:00:00Z",
    },
    subject: {
      primary: { instrument_id: "AAA:X", ticker: "AAA", display_name: "Alpha Asset" },
      benchmark: { instrument_id: "BBB:X", ticker: "BBB", display_name: "Beta Asset" },
      direction: "outperform",
      horizon_end: "2026-07-15T20:00:00Z",
    },
    frame: {
      headline: "After the event shock, AAA may reprice before BBB",
      thesis: "Risk enters direct exposure first and reaches equity pricing later.",
      creator_text: "I am watching AAA's reaction first.",
      creator_text_preserved: true,
      cuebook_contribution: "Cuebook adds the mechanism, countercase, and a unified settlement window.",
      visual_job: "explain_cause",
    },
    graph: {
      nodes: [
        { id: "N1", kind: "event", label: "The event has occurred", detail: null, status: "observed", fact_refs: ["F1"], source_refs: ["SRC1"], metric_ref: null },
        { id: "N2", kind: "mechanism", label: "Risk enters direct exposure first", detail: null, status: "derived", fact_refs: ["F1"], source_refs: ["SRC1"], metric_ref: null },
        { id: "N3", kind: "market_effect", label: "AAA reprices before BBB", detail: null, status: "conditional", fact_refs: ["F2"], source_refs: ["SRC2"], metric_ref: null },
        { id: "N4", kind: "countercase", label: "Risk does not continue to expand", detail: null, status: "unresolved", fact_refs: ["F3"], source_refs: ["SRC3"], metric_ref: null },
        { id: "N5", kind: "settlement", label: "Compare returns at expiry", detail: null, status: "conditional", fact_refs: [], source_refs: ["SETTLE_testlogic20260714"], metric_ref: null },
      ],
      edges: [
        { id: "E1", from: "N1", to: "N2", relation: "causes", certainty: "inferred", label: null },
        { id: "E2", from: "N2", to: "N3", relation: "causes", certainty: "hypothesis", label: null },
        { id: "E3", from: "N4", to: "N3", relation: "challenges", certainty: "hypothesis", label: null },
        { id: "E4", from: "N3", to: "N5", relation: "settles", certainty: "observed", label: null },
      ],
    },
    metrics: [],
    levels: [],
    scenarios: [],
    settlement: {
      settleable: true,
      claim_ref: "SETTLE_testlogic20260714",
      deadline_at: "2026-07-15T20:00:00Z",
      condition: "AAA return > BBB return",
      state: "needs_confirmation",
    },
    visual: {
      recommended_grammar: "causal_chain",
      alternative_grammars: ["evidence_balance", "comparison"],
      rationale: "The event, mechanism, and market effect form a short causal chain.",
      theme: "cuebook_light",
    },
    quality_report: { decision: "conditional", warnings: ["The result still needs verification."], hard_failures: [] },
  };
}

function addMetrics(argument) {
  argument.metrics = [
    { id: "M1", subject_ref: "primary", label: "Direct exposure", display_value: "82%", numeric_value: 82, unit: "%", as_of: "2026-07-14T07:50:00Z", source_ref: "SRC1", status: "verified" },
    { id: "M2", subject_ref: "benchmark", label: "Direct exposure", display_value: "47%", numeric_value: 47, unit: "%", as_of: "2026-07-14T07:50:00Z", source_ref: "SRC2", status: "verified" },
    { id: "M3", subject_ref: "primary", label: "One-day sensitivity", display_value: "1.8x", numeric_value: 1.8, unit: "x", as_of: "2026-07-14T07:50:00Z", source_ref: "SRC1", status: "estimated" },
    { id: "M4", subject_ref: "benchmark", label: "One-day sensitivity", display_value: "1.1x", numeric_value: 1.1, unit: "x", as_of: "2026-07-14T07:50:00Z", source_ref: "SRC2", status: "estimated" },
  ];
}

function setGrammar(argument, grammar, job) {
  const current = argument.visual.recommended_grammar;
  let alternatives = argument.visual.alternative_grammars.filter((item) => item !== grammar);
  if (current !== grammar) alternatives = [current, ...alternatives];
  argument.visual.recommended_grammar = grammar;
  argument.visual.alternative_grammars = alternatives.slice(0, 2);
  argument.frame.visual_job = job;
}

test("renders and validates causal card", () => withTemp((directory) => {
  const argument = baseArgument();
  const result = render(argument, directory);
  const svg = readFileSync(result.svgPath, "utf8");
  assert.match(svg, /Cuebook View Logic/);
  assert.match(svg, /After the event shock/);
  assert.match(svg, /OTHER PATH \/ REASSESS/);
  assert.doesNotMatch(svg, /VIEW INVALIDATED|COUNTERCASE \/ INVALIDATION/);
  assert.match(svg, /SETTLEABLE VIEW/);
  assert.doesNotMatch(svg, /Cuebook completion/iu);
  assert.doesNotMatch(svg, /Cuebook inference/iu);
  assert.equal(svg.includes(argument.frame.cuebook_contribution), false);
  const validation = validate(result.manifest, argument, directory);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
}));

test("rejects undeclared grammar", () => withTemp((directory) => {
  assert.throws(() => render(baseArgument(), directory, "metric_thesis"), /not recommended or declared/);
}));

test("routes price timeline to chart skill", () => withTemp((directory) => {
  const argument = baseArgument();
  argument.visual.alternative_grammars = ["price_timeline"];
  assert.throws(() => render(argument, directory, "price_timeline"), /render-cuebook-thesis-chart/);
}));

test("detects asset hash change", () => withTemp((directory) => {
  const argument = baseArgument();
  const result = render(argument, directory);
  writeFileSync(result.svgPath, "tampered", "utf8");
  const validation = validate(result.manifest, argument, directory);
  assert.ok(new Set(validation.errors.map((item) => item.code)).has("ASSET_HASH"));
}));

test("renders all five logic grammars", () => {
  const cases = {
    causal_chain: "explain_cause",
    metric_thesis: "show_metrics",
    scenario_tree: "map_scenarios",
    evidence_balance: "weigh_evidence",
    comparison: "compare_assets",
  };
  for (const [grammar, job] of Object.entries(cases)) {
    withTemp((directory) => {
      const argument = baseArgument();
      setGrammar(argument, grammar, job);
      if (new Set(["metric_thesis", "comparison"]).has(grammar)) addMetrics(argument);
      if (grammar === "scenario_tree") {
        argument.scenarios = [
          { id: "SC1", label: "Risk expands", condition: "Insurance rates keep rising", outcome: "AAA continues to outperform", stance: "bull", fact_refs: ["F1"] },
          { id: "SC2", label: "Risk recedes", condition: "Transit and insurance normalize", outcome: "The relative premium unwinds", stance: "risk", fact_refs: ["F3"] },
        ];
      }
      if (grammar === "comparison") argument.graph.edges[1].relation = "compares";
      const result = render(argument, directory);
      assert.equal(result.manifest.grammar, grammar);
      assert.doesNotThrow(() => readFileSync(result.svgPath));
    });
  }
});

test("CLI manifest is JSON serializable", () => withTemp((directory) => {
  const result = render(baseArgument(), directory);
  const payload = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  assert.equal(payload.schema_version, "logic-card-v1");
}));

export { addMetrics, baseArgument, setGrammar };
