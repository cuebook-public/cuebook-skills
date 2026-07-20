import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_visual_direction_set.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "visual-direction-set-base.json"), "utf8"));
const wordmark = readFileSync(path.join(root, "assets", "cuebook-wordmark.svg"), "utf8").trim()
  .replace("<svg ", '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ')
  .replaceAll('fill="#F2F3F4"', 'fill="currentColor"');

function basePayload(state = "draft") {
  const payload = structuredClone(fixture);
  payload.state = state;
  payload.selected_direction_id = state === "selected" ? payload.directions[0].direction_id : null;
  payload.selection_reason = state === "selected" ? "The claim-first direction survives thumbnail scale best." : null;
  return payload;
}

function critique(score = 8) {
  return {
    concept: score, three_second: score, hierarchy: score, data_integrity: score,
    color_logic: score, craft: score, originality: score, anti_default: score,
    weighted_score: score, verdict: score >= 7.5 ? "pass" : "revise",
    revision: "Tighten the final annotation.",
  };
}

const codes = (payload, options = {}, assetRoot = null) => new Set(validate(payload, assetRoot, options).map((item) => item.code));

test("valid draft", () => assert.deepEqual(validate(basePayload()), []));

test("selection freeze may retain only the chosen release-grade direction", () => {
  const payload = basePayload("selected");
  payload.directions = [payload.directions[0]];
  payload.directions[0].capture_report_ref = "selected/capture-report.json";
  payload.directions[0].render_audit_ref = "selected/render-audit.json";
  assert.deepEqual(validate(payload, null, { require_expression_recipes: true, require_finance_route: true }), []);
});

test("selected finished bitmap direction does not require original HTML or DOM audit", () => {
  const payload = basePayload("selected");
  payload.directions = [payload.directions[0]];
  Object.assign(payload.directions[0], {
    renderer_mode: "finished_bitmap",
    html_ref: null,
    capture_report_ref: "selected/raster-audit.json",
    render_audit_ref: null,
  });
  assert.deepEqual(validate(payload, null, { require_expression_recipes: true, require_finance_route: true }), []);
});

test("a one-direction set is not a preselection preview shortcut", () => {
  const payload = basePayload();
  payload.directions = [payload.directions[0]];
  assert.ok(codes(payload).has("DIRECTION_COUNT"));
});

test("schema requires upstream lineage and binding classification", () => {
  const schema = JSON.parse(readFileSync(path.join(root, "references", "visual-direction-set-v1.schema.json"), "utf8"));
  assert.ok(["fact_refs", "data_requirement_refs"].every((field) => schema.required.includes(field)));
  const binding = schema.properties.bindings.items;
  assert.ok(["request_class", "material_to_claim", "selected_for_display"].every((field) => binding.required.includes(field)));
  assert.ok(Object.hasOwn(schema.properties.directions.items.properties, "expression_recipe"));
  assert.ok(Object.hasOwn(schema.properties.directions.items.properties, "renderer_mode"));
  assert.ok(schema.properties.directions.items.properties.html_ref.type.includes("null"));
});

test("expression recipe is required in strict mode", () => {
  const payload = basePayload();
  delete payload.directions[0].expression_recipe;
  assert.ok(codes(payload, { require_expression_recipes: true }).has("EXPRESSION_RECIPE"));
});

test("legacy set without expression recipes remains readable", () => {
  const payload = basePayload();
  for (const direction of payload.directions) delete direction.expression_recipe;
  assert.deepEqual(validate(payload), []);
  assert.ok(codes(payload, { require_expression_recipes: true }).has("EXPRESSION_RECIPE"));
});

test("partial expression recipe coverage is rejected", () => {
  const payload = basePayload();
  delete payload.directions[0].expression_recipe;
  assert.ok(codes(payload).has("EXPRESSION_RECIPE_PARTIAL"));
});

test("expression registry matches schema enums", () => {
  const schema = JSON.parse(readFileSync(path.join(root, "references", "visual-direction-set-v1.schema.json"), "utf8"));
  const registry = JSON.parse(readFileSync(path.join(root, "references", "viewpoint-expression-registry-v1.json"), "utf8"));
  const recipe = schema.properties.directions.items.properties.expression_recipe.properties;
  assert.deepEqual(new Set(registry.candidate_jobs.map((item) => item.job_id)), new Set(recipe.candidate_job.enum));
  assert.deepEqual(new Set(registry.grammars.map((item) => item.grammar_id)), new Set(recipe.primary_grammar.enum));
  assert.deepEqual(new Set(registry.evidence_shapes), new Set(recipe.evidence_shapes.items.enum));
  assert.deepEqual(new Set(registry.evidence_shapes), new Set(Object.keys(registry.evidence_contracts)));
  assert.deepEqual(new Set(registry.market_relationships.map((item) => item.relationship_id)), new Set(recipe.market_relationship.enum));
  assert.deepEqual(new Set(registry.argument_archetypes.map((item) => item.archetype_id)), new Set(recipe.argument_archetype.enum));
  assert.deepEqual(new Set(registry.composition_archetypes.map((item) => item.composition_id)), new Set(recipe.composition_archetype.enum));
  const intent = schema.properties.intent_lock.properties;
  assert.deepEqual(new Set(registry.finance_transforms), new Set(intent.finance_transform.enum));
  assert.deepEqual(new Set(registry.baseline_policies), new Set(intent.baseline_policy.enum));
  assert.deepEqual(new Set(registry.chart_decisions), new Set(intent.chart_decision.enum));
  for (const contract of Object.values(registry.evidence_contracts)) {
    assert.ok(contract.required_fields.length);
    assert.ok(contract.geometry_channels.length);
    assert.ok(contract.compact_fallback);
    assert.ok(contract.integrity.length);
  }
});

test("strict finance route is required and structurally diverse", () => {
  const payload = basePayload();
  assert.deepEqual(validate(payload, null, { require_finance_route: true }), []);
  delete payload.directions[0].expression_recipe.market_relationship;
  const result = codes(payload, { require_finance_route: true });
  assert.ok(result.has("FINANCE_ROUTE"));
  assert.ok(result.has("FINANCE_ROUTE_COVERAGE"));
});

test("intent lock prevents analytic drift", () => {
  let payload = basePayload();
  payload.directions[1].expression_recipe.market_relationship = "deviation";
  assert.ok(codes(payload, { require_finance_route: true }).has("FINANCE_INTENT_DRIFT"));
  payload = basePayload();
  delete payload.intent_lock;
  assert.ok(codes(payload, { require_finance_route: true }).has("FINANCE_INTENT_LOCK"));
});

const mutations = [
  ["malformed support grammar list", (p) => { p.directions[0].expression_recipe.support_grammars = [{}]; }, "EXPRESSION_SUPPORT_GRAMMARS"],
  ["candidate family coverage", (p) => { Object.assign(p.directions[2].expression_recipe, { candidate_job: "trigger_watch", primary_grammar: "threshold_band", evidence_shapes: ["ordered_series", "level"] }); }, "EXPRESSION_FAMILY_COVERAGE"],
  ["primary grammar diversity", (p) => { Object.assign(p.directions[1].expression_recipe, { primary_grammar: "editorial_statement", candidate_job: "conviction_snapshot", evidence_shapes: ["creator_judgment", "qualitative_relation"] }); }, "EXPRESSION_GRAMMAR_DIVERSITY"],
  ["binding source lineage", (p) => { p.bindings[1].source_refs.push("FACT_UNDECLARED"); }, "BINDING_SOURCE_LINEAGE"],
  ["selected request data lineage", (p) => { p.bindings[1].source_refs = ["FACT_TEST_01"]; }, "BINDING_REQUIREMENT_LINEAGE"],
  ["compact material binding route", (p) => { p.directions[0].logic_route.compact_step_ids = p.directions[0].logic_route.compact_step_ids.filter((id) => id !== "LSTEP_OBS"); }, "MATERIAL_BINDING_COMPACT_ROUTE"],
  ["duplicate skeleton", (p) => { p.directions[1].spatial_skeleton = p.directions[0].spatial_skeleton; }, "SKELETON_DUPLICATE"],
  ["design read required", (p) => { delete p.design_read; }, "DESIGN_READ"],
  ["preserve mode traits", (p) => { p.design_read.mode = "redesign_preserve"; }, "PRESERVE_REQUIRED"],
  ["unknown binding", (p) => { p.directions[0].binding_refs.push("BIND_MISSING"); }, "UNKNOWN_BINDING"],
  ["layout system required", (p) => { delete p.directions[0].layout_system; }, "LAYOUT_SYSTEM"],
  ["duplicate layout", (p) => { p.directions[1].layout_system = structuredClone(p.directions[0].layout_system); }, "LAYOUT_DUPLICATE"],
  ["design logic coverage", (p) => { p.directions[1].design_logic = "product_native"; }, "DESIGN_LOGIC_COVERAGE"],
  ["type scale ratio", (p) => { p.directions[0].layout_system.type_scale.hero_body_ratio = 4; }, "TYPE_SCALE_RATIO"],
  ["semantic color system", (p) => { delete p.directions[0].layout_system.color_system; }, "COLOR_SYSTEM"],
  ["palette strategy coverage", (p) => { p.directions[1].layout_system.color_system.palette_strategy = "creator_native"; }, "PALETTE_STRATEGY_COVERAGE"],
  ["palette preset registration", (p) => { Object.assign(p.directions[0].layout_system.color_system, { palette_family: "made-up-palette", preset_id: "made-up-palette" }); }, "PALETTE_PRESET"],
  ["recent palette repeat", (p) => { p.design_read.creator_visual_profile.recent_palette_ids = ["quiet-cobalt"]; }, "PALETTE_RECENT_REPEAT"],
  ["density dial", (p) => { p.design_read.visual_density = 2; p.directions[0].layout_system.density = "dense"; }, "DENSITY_DIAL_MISMATCH"],
  ["logic progression connected", (p) => { p.logic_progression.links.pop(); }, "LOGIC_DISCONNECTED"],
  ["message map distinct", (p) => { p.logic_progression.message_step_map.because_step_id = "LSTEP_CLAIM"; }, "LOGIC_MESSAGE_MAP"],
  ["compact reasoning bridge", (p) => { p.directions[0].logic_route.compact_step_ids = ["LSTEP_OBS", "LSTEP_ACTION", "LSTEP_UNKNOWN"]; }, "LOGIC_ROUTE_BRIDGE"],
  ["verified benchmark", (p) => { p.directions[1].design_anchor.source_ref = "unverified reference"; }, "BENCHMARK_REF"],
  ["phone display must use fixed master", (p) => { p.directions[0].layout_system.craft_system.phone_scale_mode = "recompose"; }, "CRAFT_PHONE_SCALE_MODE"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => {
    const payload = basePayload();
    mutate(payload);
    assert.ok(codes(payload).has(expected));
  });
}

test("primary and support grammars combine evidence shapes", () => {
  const payload = basePayload();
  Object.assign(payload.directions[1].expression_recipe, { evidence_shapes: ["qualitative_relation", "creator_judgment"], support_grammars: ["editorial_statement"] });
  const expressionCodes = [...codes(payload)].filter((code) => code.startsWith("EXPRESSION_"));
  assert.deepEqual(expressionCodes, []);
});

test("fan chart requires quantile scenarios and data", () => {
  const payload = basePayload();
  Object.assign(payload.directions[2].expression_recipe, { candidate_job: "scenario_range", primary_grammar: "fan_quantiles", evidence_shapes: ["ordered_series"], data_requirement_refs: [] });
  const result = codes(payload);
  assert.ok(result.has("EXPRESSION_SHAPE_COMPATIBILITY"));
  assert.ok(result.has("EXPRESSION_DATA_REQUIRED"));
});

test("ordered-axis grammar requires axis integrity", () => {
  const payload = basePayload();
  const recipe = payload.directions[1].expression_recipe;
  Object.assign(recipe, { candidate_job: "evidence_proof", primary_grammar: "maturity_profile", evidence_shapes: ["term_structure"] });
  assert.ok(codes(payload).has("AXIS_INTEGRITY"));
  recipe.axis_integrity = "ordinal_gap_marked";
  assert.equal(codes(payload).has("AXIS_INTEGRITY"), false);
  recipe.axis_integrity = "diagonal";
  assert.ok(codes(payload).has("AXIS_INTEGRITY"));
});

test("news-heavy view needs synthesis candidate", () => {
  const payload = basePayload();
  for (let index = 1; index <= 3; index += 1) payload.bindings.push({ binding_id: `BIND_EVENT_0${index}`, kind: "event", label: `material event ${index}`, state: "reported", source_refs: ["D1"], request_class: "news_anchor", material_to_claim: true, selected_for_display: true });
  assert.ok(codes(payload).has("NEWS_SYNTHESIS_REQUIRED"));
});

for (const [field, expected] of [["request_class", "BINDING_REQUEST_CLASS"], ["material_to_claim", "BINDING_MATERIALITY"], ["selected_for_display", "BINDING_SELECTION"]]) {
  test(`binding requires ${field}`, () => {
    const payload = basePayload();
    delete payload.bindings[1][field];
    assert.ok(codes(payload).has(expected));
  });
}

for (const requestClass of ["news_anchor", "valuation_metric", "comparison_metric", "price_level"]) {
  test(`every direction keeps ${requestClass} binding`, () => {
    const payload = basePayload();
    payload.bindings[1].request_class = requestClass;
    payload.directions[0].binding_refs = payload.directions[0].binding_refs.filter((id) => id !== "BIND_OBS_01");
    assert.ok(codes(payload).has("MATERIAL_BINDING_OMITTED"));
  });
}

test("sibling directions need palette diversity", () => {
  const payload = basePayload();
  for (const direction of payload.directions) Object.assign(direction.layout_system.color_system, { palette_family: "quiet-cobalt", preset_id: "quiet-cobalt" });
  assert.ok(codes(payload).has("PALETTE_DIVERSITY"));
});

test("high variance requires structural variance", () => {
  const payload = basePayload();
  const grids = ["single_axis", "editorial_split", "timeline_band"];
  const alignments = ["left", "centered", "left"];
  payload.directions.forEach((direction, index) => Object.assign(direction.layout_system, { grid: grids[index], alignment: alignments[index] }));
  assert.ok(codes(payload).has("DESIGN_VARIANCE_UNDERDELIVERED"));
});

test("previewed direction needs complete preflight", () => {
  const payload = basePayload("previewed");
  payload.directions[0].preflight.copy_audited = false;
  assert.ok(codes(payload).has("PREFLIGHT_INCOMPLETE"));
});

test("low anti-default score cannot pass", () => {
  const payload = basePayload();
  payload.directions[0].critique = { ...critique(8), anti_default: 6, weighted_score: 7.9 };
  assert.ok(codes(payload).has("ANTI_DEFAULT_VERDICT"));
});

test("low color-logic score cannot pass", () => {
  const payload = basePayload();
  payload.directions[0].critique = { ...critique(8), color_logic: 6, weighted_score: 7.8 };
  assert.ok(codes(payload).has("COLOR_VERDICT"));
});

test("selected direction must clear score", () => {
  const payload = basePayload("selected");
  payload.directions[0].critique = critique(7);
  assert.ok(codes(payload).has("SELECTION_SCORE"));
});

test("previewed HTML binds declared items", () => {
  const payload = basePayload("previewed");
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-direction-test-"));
  try {
    payload.directions.forEach((direction, offset) => {
      const index = offset + 1;
      const { grid, entry_role: entryRole, color_system: colors } = direction.layout_system;
      const claimLevel = entryRole === "evidence" ? "2" : "1";
      const evidenceLevel = entryRole === "evidence" ? "1" : "2";
      const mechanismBinding = index !== 2 ? ' data-binding-ref="BIND_REL_01"' : "";
      const hiddenBinding = index === 2 ? '<i hidden data-binding-ref="BIND_REL_01"></i>' : "";
      const evidence = `<span data-role="evidence" data-visual-level="${evidenceLevel}" data-color-role="observed"><span data-logic-step-id="LSTEP_OBS" data-binding-ref="BIND_OBS_01">证据</span><span data-logic-step-id="LSTEP_MECH"${mechanismBinding}>机制</span></span>`;
      const html = `<style>.claim{text-wrap:balance}[data-binding-ref]{font-variant-numeric:tabular-nums}.cuebook-wordmark{right:41px;bottom:34px;width:136px;height:26px;color:#101411}</style><main data-cuebook-viewpoint data-width="1244" data-height="528" data-cuebook-visual-contract="launch-v1" data-direction-id="${direction.direction_id}" data-design-variance="8" data-visual-density="5" data-layout-grid="${grid}" data-entry-role="${entryRole}" data-color-system="semantic-v1" data-palette-family="${colors.palette_family}" data-palette-strategy="${colors.palette_strategy}" data-palette-preset="${colors.preset_id}"><h1 class="claim" data-role="claim" data-visual-level="${claimLevel}" data-logic-step-id="LSTEP_CLAIM" data-binding-ref="BIND_VIEW_01">观点判断</h1>${evidence}<span data-role="condition" data-visual-level="3" data-logic-step-id="LSTEP_ACTION" data-binding-ref="BIND_ACTION_01">行动</span>${hiddenBinding}${wordmark}</main>`;
      writeFileSync(path.join(temp, direction.html_ref), html);
      writeFileSync(path.join(temp, direction.preview_ref), "preview");
    });
    const result = codes(payload, {}, temp);
    assert.ok(result.has("HTML_BINDING"));
    assert.ok(result.has("HTML_BINDING_HIDDEN"));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
