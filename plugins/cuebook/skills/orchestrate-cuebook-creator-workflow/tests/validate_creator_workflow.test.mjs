import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_creator_workflow.mjs";
import { artifactById, baseRun, catalog, nodeById, opportunities, readyGateSummary, skillVersions, workflowRecipe } from "./workflow_fixtures.mjs";

const errorCodes = (result) => new Set(result.errors.map((entry) => entry.code));
const validateBase = (item, recipe = workflowRecipe(), suppliedCatalog = catalog) => validate(item, opportunities(), recipe, suppliedCatalog);
const expectCode = (item, code, recipe = workflowRecipe(), suppliedCatalog = catalog) => assert.ok(errorCodes(validateBase(item, recipe, suppliedCatalog)).has(code));

function refreshCounts(item) {
  Object.assign(item.quality_report.counts, {
    nodes: item.nodes.length,
    completed: item.nodes.filter((node) => node.state === "completed").length,
    blocked: item.nodes.filter((node) => node.state === "blocked").length,
    deferred: item.nodes.filter((node) => node.state === "deferred").length,
    artifacts: item.artifact_registry.length,
    approvals_pending: item.approvals.filter((approval) => approval.decision === "pending").length,
  });
}

function addQueryBundle(item) {
  item.nodes.unshift({ node_id: "NODE_query", capability: "query_cuebook", skill_name: "query-cuebook", skill_version: skillVersions["query-cuebook"], availability: "installed", opportunity_refs: ["OPP_q2_revision"], depends_on: [], input_artifact_refs: [], output_contract: "CuebookQueryBundleV1", state: "completed", artifact_refs: ["ART_query"], blocking: true, human_gate: "none", owner: "ai", reason: null });
  item.artifact_registry.push({ artifact_id: "ART_query", artifact_type: "CuebookQueryBundleV1", schema_version: "cuebook-query-bundle-v1", content_hash: `sha256:${"f".repeat(64)}`, locator: "memory://ART_query", created_at: "2026-07-14T11:59:00+00:00", producer_node_ref: "NODE_query", input_artifact_refs: [], status: "current", gate_summary: readyGateSummary("ResearchPackV1") });
  item.state_events.push({ event_id: "EVT_query", node_ref: "NODE_query", from_state: null, to_state: "completed", actor: "system", occurred_at: "2026-07-14T11:59:00+00:00", reason: "read-only query bundle registered" });
  nodeById(item, "NODE_research").depends_on.push("NODE_query");
  nodeById(item, "NODE_research").input_artifact_refs.push("ART_query");
  artifactById(item, "ART_research").input_artifact_refs.push("ART_query");
  item.query_bundle_refs = ["ART_query"];
  refreshCounts(item);
}

function addCandidateNode(item) {
  const node = { node_id: "NODE_candidates", capability: "catalog:assemble-publish-candidates", skill_name: "assemble-cuebook-publish-candidates", skill_version: skillVersions["assemble-cuebook-publish-candidates"], availability: "installed", opportunity_refs: ["OPP_q2_revision"], depends_on: ["NODE_render", "NODE_direction"], input_artifact_refs: ["ART_expression", "ART_research", "ART_data", "ART_post", "ART_direction"], output_contract: "PublishCandidateSetV1", state: "completed", artifact_refs: ["ART_candidates"], blocking: true, human_gate: "editorial", owner: "ai", reason: null };
  item.nodes.splice(item.nodes.findIndex((entry) => entry.node_id === "NODE_release"), 0, node);
  item.artifact_registry.push({ artifact_id: "ART_candidates", artifact_type: "PublishCandidateSetV1", schema_version: "publish-candidate-set-v1", content_hash: `sha256:${"9".repeat(64)}`, locator: "memory://ART_candidates", created_at: "2026-07-14T12:11:45+00:00", producer_node_ref: "NODE_candidates", input_artifact_refs: [...node.input_artifact_refs], status: "current", gate_summary: readyGateSummary("PublishCandidateSetV1") });
  item.state_events.push({ event_id: "EVT_candidates", node_ref: "NODE_candidates", from_state: null, to_state: "completed", actor: "system", occurred_at: "2026-07-14T12:11:45+00:00", reason: "three selectable candidates assembled" });
  nodeById(item, "NODE_release").depends_on.push("NODE_candidates");
  nodeById(item, "NODE_release").input_artifact_refs.push("ART_candidates");
  artifactById(item, "ART_release").input_artifact_refs.push("ART_candidates");
  refreshCounts(item);
}

function recipeWith(...skillIds) {
  const recipe = workflowRecipe();
  for (const skillId of skillIds) recipe.execution.resolved_skill_ids.push(skillId);
  return recipe;
}

function addSettlementNodes(item) {
  const claim = { node_id: "NODE_settlement", capability: "compile_settlement_claim", skill_name: "compile-cuebook-settlement-claim", skill_version: skillVersions["compile-cuebook-settlement-claim"], availability: "installed", opportunity_refs: ["OPP_q2_revision"], depends_on: ["NODE_expression"], input_artifact_refs: ["ART_expression"], output_contract: "SettlementClaimV1", state: "completed", artifact_refs: ["ART_settlement"], blocking: true, human_gate: "editorial", owner: "ai", reason: null };
  const formula = { node_id: "NODE_settlement_formula", capability: "compile_settlement_formula", skill_name: "compile-cuebook-settlement-formula", skill_version: skillVersions["compile-cuebook-settlement-formula"], availability: "installed", opportunity_refs: ["OPP_q2_revision"], depends_on: ["NODE_settlement"], input_artifact_refs: ["ART_settlement"], output_contract: "SettlementFormulaV1", state: "completed", artifact_refs: ["ART_settlement_formula"], blocking: true, human_gate: "none", owner: "ai", reason: null };
  item.nodes.splice(item.nodes.findIndex((entry) => entry.node_id === "NODE_release"), 0, claim, formula);
  for (const [node, artifactId, contract, hash] of [[claim, "ART_settlement", "SettlementClaimV1", "c"], [formula, "ART_settlement_formula", "SettlementFormulaV1", "d"]]) {
    item.artifact_registry.push({ artifact_id: artifactId, artifact_type: contract, schema_version: contract === "SettlementClaimV1" ? "settlement-claim-v1" : "settlement-formula-v1", content_hash: `sha256:${hash.repeat(64)}`, locator: `memory://${artifactId}`, created_at: "2026-07-14T12:07:30+00:00", producer_node_ref: node.node_id, input_artifact_refs: [...node.input_artifact_refs], status: "current" });
    item.state_events.push({ event_id: `EVT_${node.node_id.slice(5)}`, node_ref: node.node_id, from_state: null, to_state: "completed", actor: "system", occurred_at: "2026-07-14T12:07:30+00:00", reason: "settlement output compiled" });
  }
  nodeById(item, "NODE_release").depends_on.push("NODE_settlement", "NODE_settlement_formula");
  nodeById(item, "NODE_release").input_artifact_refs.push("ART_settlement", "ART_settlement_formula");
  artifactById(item, "ART_release").input_artifact_refs.push("ART_settlement", "ART_settlement_formula");
  refreshCounts(item);
}

function addOptionalNode(item, { nodeId, capability, skillName, contract, artifactId, dependencies, inputs, hash = "0" }) {
  const node = { node_id: nodeId, capability, skill_name: skillName, skill_version: skillVersions[skillName], availability: "installed", opportunity_refs: ["OPP_q2_revision"], depends_on: [...dependencies], input_artifact_refs: [...inputs], output_contract: contract, state: "completed", artifact_refs: [artifactId], blocking: true, human_gate: "editorial", owner: "ai", reason: null };
  item.nodes.splice(item.nodes.findIndex((entry) => entry.node_id === "NODE_release"), 0, node);
  item.artifact_registry.push({ artifact_id: artifactId, artifact_type: contract, schema_version: contract, content_hash: `sha256:${hash.repeat(64)}`, locator: `memory://${artifactId}`, created_at: "2026-07-14T12:11:30+00:00", producer_node_ref: nodeId, input_artifact_refs: [...inputs], status: "current" });
  item.state_events.push({ event_id: `EVT_${nodeId.slice(5)}`, node_ref: nodeId, from_state: null, to_state: "completed", actor: "system", occurred_at: "2026-07-14T12:11:30+00:00", reason: "optional output completed" });
  refreshCounts(item);
  return node;
}

test("base run validates", () => {
  const result = validateBase(baseRun());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("base run excludes optional trade and settlement skills", () => {
  const names = new Set(baseRun().nodes.map((node) => node.skill_name));
  assert.equal(["compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula"].some((name) => names.has(name)), false);
});

test("query bundle path validates", () => {
  const item = baseRun();
  addQueryBundle(item);
  const result = validateBase(item);
  assert.equal(result.valid, true, JSON.stringify(result));
});

const mutations = [
  ["unknown query bundle", (item) => { item.query_bundle_refs = ["ART_missing_query"]; }, "UNKNOWN_QUERY_BUNDLE"],
  ["query bundle contract", (item) => { item.query_bundle_refs = ["ART_research"]; }, "QUERY_BUNDLE_CONTRACT"],
  ["gate summary required", (item) => { delete artifactById(item, "ART_research").gate_summary; }, "GATE_SUMMARY_REQUIRED"],
  ["visual bridge ordering", (item) => { nodeById(item, "NODE_visual").depends_on = []; }, "ORDER_VISUAL_BRIDGE"],
  ["parallel branch ordering", (item) => { nodeById(item, "NODE_data").depends_on = ["NODE_expression", "NODE_render"]; }, "PARALLEL_BRANCH_ORDER"],
  ["single cardinality", (item) => { item.selected_opportunity_refs = []; }, "SINGLE_CARDINALITY"],
  ["skill owner", (item) => { item.nodes[1].skill_name = "wrong-skill"; }, "SKILL_OWNER"],
  ["selection ordering", (item) => { item.nodes[1].depends_on = []; }, "ORDER_SELECT"],
  ["dependency cycle", (item) => { item.nodes[0].depends_on = ["NODE_select"]; }, "DEPENDENCY_CYCLE"],
  ["research ordering", (item) => { item.nodes[5].depends_on = ["NODE_route"]; }, "ORDER_RESEARCH"],
  ["render ordering", (item) => { nodeById(item, "NODE_render").depends_on = ["NODE_route"]; }, "ORDER_RENDER"],
  ["release ordering", (item) => { nodeById(item, "NODE_release").depends_on = ["NODE_research"]; }, "ORDER_RELEASE_RENDER"],
  ["completed artifact", (item) => { item.nodes[0].artifact_refs = []; }, "COMPLETED_WITHOUT_ARTIFACT"],
  ["artifact contract", (item) => { item.artifact_registry[0].artifact_type = "WrongV1"; }, "ARTIFACT_CONTRACT_MISMATCH"],
  ["known producer", (item) => { item.artifact_registry[0].producer_node_ref = "NODE_missing"; }, "UNKNOWN_PRODUCER"],
  ["approval hash", (item) => { item.approvals[0].artifact_versions[0].content_hash = `sha256:${"9".repeat(64)}`; }, "APPROVAL_HASH_MISMATCH"],
  ["handoff approval", (item) => { item.approvals = []; }, "HANDOFF_WITHOUT_APPROVAL"],
  ["event state", (item) => { item.state_events[0].to_state = "running"; }, "EVENT_STATE_MISMATCH"],
  ["node event", (item) => { item.state_events.shift(); }, "NODE_EVENT_REQUIRED"],
  ["counts", (item) => { item.quality_report.counts.nodes = 99; }, "COUNTS"],
  ["unknown root", (item) => { item.debug = true; }, "UNKNOWN_ROOT_FIELD"],
  ["catalog version", (item) => { item.catalog_version = "1.6.0"; }, "CATALOG_VERSION_UNSUPPORTED"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => {
    const item = baseRun();
    mutate(item);
    expectCode(item, expected);
  });
}

test("external artifact locators are accepted", () => {
  const item = baseRun();
  for (const artifact of item.artifact_registry.filter((entry) => ["ResearchPackV1", "CreatorExpressionPlanV1", "ViewpointDataBundleV1"].includes(entry.artifact_type))) artifact.locator = `https://artifacts.invalid/${artifact.artifact_id}`;
  const result = validateBase(item);
  assert.equal(result.valid, true, JSON.stringify(result));
});

for (const [artifactId, decision, state] of [
  ["ART_research", "conditional", "conditional"], ["ART_research", "blocked", "blocked"],
  ["ART_expression", "conditional", "conditional"], ["ART_data", "conditional", "conditional"],
]) {
  test(`${artifactId} ${decision} gate blocks completed downstream`, () => {
    const item = baseRun();
    Object.assign(artifactById(item, artifactId).gate_summary, { quality_decision: decision, artifact_state: state });
    expectCode(item, "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE");
  });
}

test("unresolved material request blocks completed downstream", () => {
  const item = baseRun();
  artifactById(item, "ART_expression").gate_summary.unresolved_material_request_count = 1;
  expectCode(item, "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE");
});

test("superseded unresolved gate still blocks", () => {
  const item = baseRun();
  const artifact = artifactById(item, "ART_research");
  artifact.status = "superseded";
  Object.assign(artifact.gate_summary, { quality_decision: "conditional", artifact_state: "conditional" });
  expectCode(item, "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE");
});

test("candidate assembly validates", () => {
  const item = baseRun();
  addCandidateNode(item);
  const recipe = recipeWith("assemble-cuebook-publish-candidates");
  const result = validateBase(item, recipe);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("completed candidate gate must be ready", () => {
  const item = baseRun();
  addCandidateNode(item);
  artifactById(item, "ART_candidates").gate_summary = { quality_decision: "blocked", artifact_state: "blocked", unresolved_material_request_count: 1 };
  expectCode(item, "COMPLETED_CANDIDATE_GATE_NOT_READY", recipeWith("assemble-cuebook-publish-candidates"));
});

test("settlement chain validates", () => {
  const item = baseRun();
  addSettlementNodes(item);
  const recipe = recipeWith("compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula");
  const result = validateBase(item, recipe);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("settlement formula must depend on claim", () => {
  const item = baseRun();
  addSettlementNodes(item);
  nodeById(item, "NODE_settlement_formula").depends_on = [];
  nodeById(item, "NODE_settlement_formula").input_artifact_refs = [];
  artifactById(item, "ART_settlement_formula").input_artifact_refs = [];
  expectCode(item, "ORDER_SETTLEMENT_FORMULA", recipeWith("compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula"));
});

test("viewpoint card node validates", () => {
  const item = baseRun();
  const card = addOptionalNode(item, { nodeId: "NODE_card", capability: "catalog:assemble-viewpoint-card", skillName: "assemble-cuebook-viewpoint-card", contract: "ViewpointCardV1", artifactId: "ART_card", dependencies: ["NODE_render", "NODE_visual"], inputs: ["ART_expression", "ART_post", "ART_visual"], hash: "f" });
  nodeById(item, "NODE_release").depends_on = [card.node_id];
  nodeById(item, "NODE_release").input_artifact_refs = ["ART_card"];
  artifactById(item, "ART_release").input_artifact_refs = ["ART_card"];
  const result = validateBase(item, recipeWith("assemble-cuebook-viewpoint-card"));
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("optional thesis chart node validates", () => {
  const item = baseRun();
  addOptionalNode(item, { nodeId: "NODE_thesis_chart", capability: "catalog:render-thesis-chart", skillName: "render-cuebook-thesis-chart", contract: "ThesisChartV1", artifactId: "ART_thesis_chart", dependencies: ["NODE_data"], inputs: ["ART_expression", "ART_data", "ART_research"] });
  nodeById(item, "NODE_release").depends_on.push("NODE_thesis_chart");
  nodeById(item, "NODE_release").input_artifact_refs.push("ART_thesis_chart");
  artifactById(item, "ART_release").input_artifact_refs.push("ART_thesis_chart");
  const result = validateBase(item, recipeWith("render-cuebook-thesis-chart"));
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("blocked node requires blocker records", () => {
  const item = baseRun();
  Object.assign(item.nodes[3], { state: "blocked", reason: "asset mismatch", artifact_refs: [] });
  item.state_events[3].to_state = "blocked";
  item.state = "blocked";
  item.quality_report.decision = "blocked";
  refreshCounts(item);
  const result = validateBase(item);
  assert.ok(errorCodes(result).has("BLOCKED_WITHOUT_BLOCKER"));
  assert.ok(errorCodes(result).has("BLOCKED_WITHOUT_BLOCKERS"));
});

test("required capability cannot be removed", () => {
  const item = baseRun();
  item.nodes = item.nodes.filter((node) => node.capability !== "build_research_pack");
  item.artifact_registry = item.artifact_registry.filter((artifact) => artifact.artifact_type !== "ResearchPackV1");
  item.state_events = item.state_events.filter((event) => event.node_ref !== "NODE_research");
  refreshCounts(item);
  expectCode(item, "REQUIRED_CAPABILITY");
});

test("batch requires program capability", () => {
  const item = baseRun();
  item.mode = "batch";
  item.selected_opportunity_refs.push("OPP_second");
  assert.ok(errorCodes(validate(item)).has("REQUIRED_CAPABILITY"));
});

test("completed publication needs receipt", () => {
  const item = baseRun();
  Object.assign(item.nodes.at(-1), { state: "completed", artifact_refs: [] });
  item.state_events.at(-1).to_state = "completed";
  refreshCounts(item);
  const result = validateBase(item);
  assert.ok(errorCodes(result).has("COMPLETED_WITHOUT_ARTIFACT"));
  assert.ok(errorCodes(result).has("PUBLISH_WITHOUT_RECEIPT"));
});

test("complete workflow needs publication", () => {
  const item = baseRun();
  item.state = "complete";
  const result = validateBase(item);
  assert.equal(errorCodes(result).has("COMPLETE_WITH_UNFINISHED"), false);
  assert.ok(errorCodes(result).has("COMPLETE_WITHOUT_PUBLICATION"));
});

test("recipe reference mismatch", () => {
  const item = baseRun();
  item.recipe_ref = "RECIPE_deadbeef";
  expectCode(item, "RECIPE_REF_MISMATCH");
});

test("catalog skill version mismatch", () => {
  const item = baseRun();
  item.nodes[2].skill_version = "9.9.9";
  expectCode(item, "NODE_SKILL_VERSION_MISMATCH");
});

test("conditional recipe cannot hand off", () => {
  const recipe = workflowRecipe();
  recipe.state = "conditional";
  expectCode(baseRun(), "HANDOFF_WITH_CONDITIONAL_RECIPE", recipe);
});

test("opportunity-first recipe follows selection", () => {
  const item = baseRun();
  item.nodes[2].depends_on = ["NODE_normalize"];
  expectCode(item, "ORDER_RECIPE_AFTER_SELECTION");
});

test("ingredient-first recipe reverses selection and recipe", () => {
  const item = baseRun();
  const recipe = workflowRecipe();
  Object.assign(recipe, { selection_mode: "ingredient_first", opportunity_set_ref: null, anchor: { opportunity_ref: null } });
  Object.assign(nodeById(item, "NODE_select"), { depends_on: ["NODE_normalize", "NODE_recipe"], input_artifact_refs: ["ART_feed", "ART_recipe"] });
  artifactById(item, "ART_ops").input_artifact_refs = ["ART_feed", "ART_recipe"];
  Object.assign(nodeById(item, "NODE_recipe"), { depends_on: ["NODE_normalize"], input_artifact_refs: ["ART_feed"] });
  artifactById(item, "ART_recipe").input_artifact_refs = ["ART_feed"];
  const result = validateBase(item, recipe);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("required deferred extension prevents handoff", () => {
  const item = baseRun();
  const recipe = workflowRecipe();
  recipe.extensions.push({ extension_id: "EXT_custom", extension_point: "custom_renderer", provider_ref: "renderer-custom-v1", required: true, config_ref: null });
  item.nodes.splice(-1, 0, { node_id: "NODE_custom_extension", capability: "extension:custom-renderer", skill_name: null, skill_version: null, availability: "deferred", opportunity_refs: ["OPP_q2_revision"], depends_on: ["NODE_research"], input_artifact_refs: ["ART_research"], output_contract: "RendererProviderV1", state: "deferred", artifact_refs: [], blocking: true, human_gate: "editorial", owner: "external", reason: "provider not configured" });
  item.state_events.push({ event_id: "EVT_custom_extension", node_ref: "NODE_custom_extension", from_state: null, to_state: "deferred", actor: "system", occurred_at: "2026-07-14T12:07:30+00:00", reason: "provider not configured" });
  refreshCounts(item);
  expectCode(item, "HANDOFF_WITH_UNFINISHED", recipe);
});
