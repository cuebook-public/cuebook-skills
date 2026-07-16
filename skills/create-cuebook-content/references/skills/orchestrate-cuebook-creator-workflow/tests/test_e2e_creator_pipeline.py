#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_example_bundle.py"
spec = importlib.util.spec_from_file_location("build_example_bundle", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def has_ancestor(nodes: dict[str, dict], node_id: str, ancestor_id: str) -> bool:
    if node_id == ancestor_id:
        return True
    return any(has_ancestor(nodes, dependency, ancestor_id) for dependency in nodes[node_id]["depends_on"])


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory)
        manifest = module.build_bundle(output)
        expected = {
            "skill-catalog-v1.json", "creator-feed-v1.json", "content-opportunity-set-v1.json", "content-recipe-v1.json",
            "creator-workflow-run-v1.json", "content-history-ledger-v1.json", "manifest.json",
        }
        assert {path.name for path in output.iterdir()} == expected
        saved_manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
        assert saved_manifest == manifest
        assert all(result["valid"] for result in manifest["validation"].values())
        assert manifest["catalog_version"] == "1.27.0"
        workflow = json.loads((output / "creator-workflow-run-v1.json").read_text(encoding="utf-8"))
        nodes = {node["node_id"]: node for node in workflow["nodes"]}
        gated_artifact_types = {"ResearchPackV1", "CreatorExpressionPlanV1", "ViewpointDataBundleV1"}
        gated_artifacts = [artifact for artifact in workflow["artifact_registry"] if artifact["artifact_type"] in gated_artifact_types]
        assert {artifact["artifact_type"] for artifact in gated_artifacts} == gated_artifact_types
        assert all(artifact["gate_summary"]["unresolved_material_request_count"] == 0 for artifact in gated_artifacts)
        assert all(artifact["gate_summary"]["quality_decision"] == "ready" for artifact in gated_artifacts)
        assert has_ancestor(nodes, "NODE_expression", "NODE_semantics")
        assert has_ancestor(nodes, "NODE_data", "NODE_expression")
        assert has_ancestor(nodes, "NODE_visual", "NODE_expression")
        assert has_ancestor(nodes, "NODE_visual", "NODE_data")
        assert not has_ancestor(nodes, "NODE_data", "NODE_render")
        assert not has_ancestor(nodes, "NODE_render", "NODE_data")
        absent = {"compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim"}
        assert not (absent & {node["skill_name"] for node in workflow["nodes"]})
    print("ok: no-database creator pipeline bundle")


if __name__ == "__main__":
    main()
