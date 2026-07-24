import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { build_bundle } from "../scripts/build_example_bundle.mjs";

function hasAncestor(nodes, nodeId, ancestorId) {
  if (nodeId === ancestorId) return true;
  return nodes[nodeId].depends_on.some((dependency) => hasAncestor(nodes, dependency, ancestorId));
}

test("no-database creator pipeline bundle", () => {
  const output = mkdtempSync(path.join(os.tmpdir(), "cuebook-workflow-e2e-"));
  try {
    const manifest = build_bundle(output);
    const expected = new Set(["skill-catalog-v1.json", "creator-feed-v1.json", "content-opportunity-set-v1.json", "content-recipe-v1.json", "creator-workflow-run-v1.json", "content-history-ledger-v1.json", "manifest.json"]);
    assert.deepEqual(new Set(readdirSync(output)), expected);
    assert.deepEqual(JSON.parse(readFileSync(path.join(output, "manifest.json"), "utf8")), manifest);
    assert.ok(Object.values(manifest.validation).every((result) => result.valid));
    assert.equal(manifest.catalog_version, "1.29.0");
    const workflow = JSON.parse(readFileSync(path.join(output, "creator-workflow-run-v1.json"), "utf8"));
    const nodes = Object.fromEntries(workflow.nodes.map((node) => [node.node_id, node]));
    const gatedTypes = new Set(["ResearchPackV1", "CreatorExpressionPlanV1", "ViewpointDataBundleV1"]);
    const gated = workflow.artifact_registry.filter((artifact) => gatedTypes.has(artifact.artifact_type));
    assert.deepEqual(new Set(gated.map((artifact) => artifact.artifact_type)), gatedTypes);
    assert.ok(gated.every((artifact) => artifact.gate_summary.unresolved_material_request_count === 0));
    assert.ok(gated.every((artifact) => artifact.gate_summary.quality_decision === "ready"));
    assert.ok(hasAncestor(nodes, "NODE_expression", "NODE_semantics"));
    assert.ok(hasAncestor(nodes, "NODE_data", "NODE_expression"));
    assert.ok(hasAncestor(nodes, "NODE_visual", "NODE_expression"));
    assert.ok(hasAncestor(nodes, "NODE_visual", "NODE_data"));
    assert.equal(hasAncestor(nodes, "NODE_data", "NODE_render"), false);
    assert.equal(hasAncestor(nodes, "NODE_render", "NODE_data"), false);
    const absent = new Set(["compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim"]);
    assert.equal(workflow.nodes.some((node) => absent.has(node.skill_name)), false);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
