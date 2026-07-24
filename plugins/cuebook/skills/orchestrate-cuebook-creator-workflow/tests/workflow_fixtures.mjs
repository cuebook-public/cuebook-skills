import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skills = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const catalog = JSON.parse(readFileSync(path.join(skills, "compose-cuebook-content-recipe", "references", "skill-catalog-v1.json"), "utf8"));
export const skillVersions = Object.fromEntries(catalog.skills.map((entry) => [entry.skill_id, entry.version]));

const CAPS = [
  ["normalize", "normalize_feed", "normalize-cuebook-creator-feed", "CreatorFeedV1", [], [], "ART_feed"],
  ["select", "select_opportunities", "select-cuebook-content-opportunities", "ContentOpportunitySetV1", ["NODE_normalize"], ["ART_feed"], "ART_ops"],
  ["recipe", "compose_recipe", "compose-cuebook-content-recipe", "ContentRecipeV1", ["NODE_normalize", "NODE_select"], ["ART_feed", "ART_ops"], "ART_recipe"],
  ["gate", "validate_projection", "validate-cuebook-projection", "GateV1", ["NODE_select", "NODE_recipe"], ["ART_feed", "ART_ops", "ART_recipe"], "ART_gate"],
  ["route", "route_narrative", "route-cuebook-narrative", "RouteV1", ["NODE_gate"], ["ART_gate"], "ART_route"],
  ["research", "build_research_pack", "build-market-research-pack", "ResearchPackV1", ["NODE_gate", "NODE_route"], ["ART_gate", "ART_route"], "ART_research"],
  ["semantics", "catalog:compile-market-view-semantics", "compile-cuebook-market-view-semantics", "MarketViewSemanticsV1", ["NODE_research"], ["ART_research"], "ART_semantics"],
  ["expression", "catalog:plan-creator-expression", "plan-cuebook-creator-expression", "CreatorExpressionPlanV1", ["NODE_semantics"], ["ART_semantics"], "ART_expression"],
  ["render", "render_market_post", "render-cuebook-market-post", "PostV1", ["NODE_expression"], ["ART_expression"], "ART_post"],
  ["data", "catalog:assemble-viewpoint-data", "assemble-cuebook-viewpoint-data", "ViewpointDataBundleV1", ["NODE_expression"], ["ART_expression", "ART_research"], "ART_data"],
  ["direction", "catalog:direct-viewpoint-visual", "direct-cuebook-viewpoint-visual", "VisualDirectionSetV1", ["NODE_expression", "NODE_data"], ["ART_expression", "ART_data"], "ART_direction"],
  ["visual", "catalog:render-viewpoint-visual", "render-cuebook-viewpoint-visual", "ViewpointVisualV1", ["NODE_direction"], ["ART_expression", "ART_data", "ART_direction"], "ART_visual"],
  ["release", "prepare_release", "prepare-market-content-release", "ReleaseBundleV1", ["NODE_render", "NODE_visual"], ["ART_post", "ART_visual"], "ART_release"],
];

export function readyGateSummary(contract) {
  const summaries = {
    ResearchPackV1: { quality_decision: "ready", artifact_state: "ready", unresolved_material_request_count: 0 },
    CreatorExpressionPlanV1: { quality_decision: "ready", artifact_state: "ready", unresolved_material_request_count: 0 },
    ViewpointDataBundleV1: { quality_decision: "ready", artifact_state: "ready", unresolved_material_request_count: 0 },
    PublishCandidateSetV1: { quality_decision: "ready_for_selection", artifact_state: "ready_for_selection", unresolved_material_request_count: 0 },
  };
  return summaries[contract] ? structuredClone(summaries[contract]) : null;
}

export function baseRun() {
  const nodes = [];
  const artifacts = [];
  const events = [];
  CAPS.forEach(([short, capability, skill, contract, deps, inputs, artifactId], offset) => {
    const index = offset + 1;
    const nodeId = `NODE_${short}`;
    nodes.push({ node_id: nodeId, capability, skill_name: skill, skill_version: skillVersions[skill], availability: "installed", opportunity_refs: ["normalize", "select"].includes(short) ? [] : ["OPP_q2_revision"], depends_on: [...deps], input_artifact_refs: [...inputs], output_contract: contract, state: "completed", artifact_refs: [artifactId], blocking: true, human_gate: short === "release" ? "release" : "none", owner: "ai", reason: null });
    const artifact = { artifact_id: artifactId, artifact_type: contract, schema_version: contract, content_hash: `sha256:${(index % 16).toString(16).repeat(64)}`, locator: `memory://${artifactId}`, created_at: `2026-07-14T12:${String(index).padStart(2, "0")}:00+00:00`, producer_node_ref: nodeId, input_artifact_refs: [...inputs], status: "current" };
    const summary = readyGateSummary(contract);
    if (summary) artifact.gate_summary = summary;
    artifacts.push(artifact);
    events.push({ event_id: `EVT_${short}`, node_ref: nodeId, from_state: null, to_state: "completed", actor: "system", occurred_at: `2026-07-14T12:${String(index).padStart(2, "0")}:00+00:00`, reason: "validated output registered" });
  });
  nodes.push({ node_id: "NODE_publish", capability: "publish_external", skill_name: null, skill_version: null, availability: "external", opportunity_refs: ["OPP_q2_revision"], depends_on: ["NODE_release"], input_artifact_refs: ["ART_release"], output_contract: "PublicationReceiptV1", state: "deferred", artifact_refs: [], blocking: false, human_gate: "release", owner: "external", reason: "publisher connector not configured" });
  events.push({ event_id: "EVT_publish", node_ref: "NODE_publish", from_state: null, to_state: "deferred", actor: "system", occurred_at: "2026-07-14T12:09:00+00:00", reason: "external handoff only" });
  return {
    schema_version: "creator-workflow-run-v1", workflow_id: "WF_1234abcd",
    feed_ref: "CF_1234abcd", opportunity_set_ref: "OS_1234abcd", recipe_ref: "RECIPE_1234abcd",
    catalog_version: "1.29.0", query_bundle_refs: [], selected_opportunity_refs: ["OPP_q2_revision"], mode: "single",
    created_at: "2026-07-14T12:00:00+00:00", as_of: "2026-07-14T12:11:00+00:00", ruleset_version: "2026-07-14", state: "ready_for_handoff",
    nodes, artifact_registry: artifacts,
    approvals: [{ approval_id: "APR_release", gate: "release", artifact_versions: [{ artifact_ref: "ART_release", content_hash: artifacts.find((item) => item.artifact_id === "ART_release").content_hash }], decision: "approved", reviewer_ref: "editor-vito", decided_at: "2026-07-14T12:14:00+00:00", policy_version: "2026-07-14", reason: "frozen payload approved" }],
    state_events: events, blockers: [],
    quality_report: { decision: "ready", hard_failures: [], warnings: [], checks: ["recipe", "catalog", "dag", "hash-bound approval"], counts: { nodes: 14, completed: 13, blocked: 0, deferred: 1, artifacts: 13, approvals_pending: 0 } },
  };
}

export function opportunities() {
  return { schema_version: "content-opportunity-set-v1", opportunity_set_id: "OS_1234abcd", candidates: [{ opportunity_id: "OPP_q2_revision", decision: "selected" }] };
}

export function workflowRecipe() {
  const resolved = [
    "normalize-cuebook-creator-feed", "compose-cuebook-content-recipe", "select-cuebook-content-opportunities",
    "validate-cuebook-projection", "route-cuebook-narrative", "build-market-research-pack",
    "compile-cuebook-market-view-semantics", "plan-cuebook-creator-expression", "render-cuebook-market-post",
    "prepare-market-content-release", "orchestrate-cuebook-creator-workflow", "assemble-cuebook-viewpoint-data",
    "direct-cuebook-viewpoint-visual", "render-cuebook-viewpoint-visual",
  ];
  return {
    schema_version: "content-recipe-v1", recipe_id: "RECIPE_1234abcd", catalog_version: "1.29.0",
    feed_ref: "CF_1234abcd", opportunity_set_ref: "OS_1234abcd", selection_mode: "opportunity_first",
    anchor: { opportunity_ref: "OPP_q2_revision" }, state: "valid",
    execution: { mode: "single", selected_skill_ids: ["prepare-market-content-release", "render-cuebook-viewpoint-visual"], resolved_skill_ids: resolved },
    extensions: [],
  };
}

export const nodeById = (item, id) => item.nodes.find((node) => node.node_id === id);
export const artifactById = (item, id) => item.artifact_registry.find((artifact) => artifact.artifact_id === id);
