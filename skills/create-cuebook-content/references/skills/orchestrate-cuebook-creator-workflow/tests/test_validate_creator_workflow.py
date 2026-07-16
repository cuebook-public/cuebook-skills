#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT.parent
sys.path.insert(0, str(ROOT / "scripts"))
from validate_creator_workflow import validate  # noqa: E402

OPS_TEST = SKILLS / "select-cuebook-content-opportunities" / "tests" / "test_validate_content_opportunities.py"
spec = importlib.util.spec_from_file_location("ops_fixture", OPS_TEST)
ops_module = importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(ops_module)
RECIPE_TEST = SKILLS / "compose-cuebook-content-recipe" / "tests" / "test_validate_content_recipe.py"
recipe_spec = importlib.util.spec_from_file_location("recipe_fixture", RECIPE_TEST)
recipe_module = importlib.util.module_from_spec(recipe_spec); assert recipe_spec.loader; recipe_spec.loader.exec_module(recipe_module)
CATALOG = json.loads((SKILLS / "compose-cuebook-content-recipe" / "references" / "skill-catalog-v1.json").read_text(encoding="utf-8"))
SKILL_VERSIONS = {entry["skill_id"]: entry["version"] for entry in CATALOG["skills"]}


CAPS = [
    ("normalize", "normalize_feed", "normalize-cuebook-creator-feed", "CreatorFeedV1", [], [], "ART_feed"),
    ("select", "select_opportunities", "select-cuebook-content-opportunities", "ContentOpportunitySetV1", ["NODE_normalize"], ["ART_feed"], "ART_ops"),
    ("recipe", "compose_recipe", "compose-cuebook-content-recipe", "ContentRecipeV1", ["NODE_normalize", "NODE_select"], ["ART_feed", "ART_ops"], "ART_recipe"),
    ("gate", "validate_projection", "validate-cuebook-projection", "GateV1", ["NODE_select", "NODE_recipe"], ["ART_feed", "ART_ops", "ART_recipe"], "ART_gate"),
    ("route", "route_narrative", "route-cuebook-narrative", "RouteV1", ["NODE_gate"], ["ART_gate"], "ART_route"),
    ("research", "build_research_pack", "build-market-research-pack", "ResearchPackV1", ["NODE_gate", "NODE_route"], ["ART_gate", "ART_route"], "ART_research"),
    ("semantics", "catalog:compile-market-view-semantics", "compile-cuebook-market-view-semantics", "MarketViewSemanticsV1", ["NODE_research"], ["ART_research"], "ART_semantics"),
    ("expression", "catalog:plan-creator-expression", "plan-cuebook-creator-expression", "CreatorExpressionPlanV1", ["NODE_semantics"], ["ART_semantics"], "ART_expression"),
    ("render", "render_market_post", "render-cuebook-market-post", "PostV1", ["NODE_expression"], ["ART_expression"], "ART_post"),
    ("data", "catalog:assemble-viewpoint-data", "assemble-cuebook-viewpoint-data", "ViewpointDataBundleV1", ["NODE_expression"], ["ART_expression", "ART_research"], "ART_data"),
    ("direction", "catalog:direct-viewpoint-visual", "direct-cuebook-viewpoint-visual", "VisualDirectionSetV1", ["NODE_expression", "NODE_data"], ["ART_expression", "ART_data"], "ART_direction"),
    ("visual", "catalog:render-viewpoint-visual", "render-cuebook-viewpoint-visual", "ViewpointVisualV1", ["NODE_direction"], ["ART_expression", "ART_data", "ART_direction"], "ART_visual"),
    ("release", "prepare_release", "prepare-market-content-release", "ReleaseBundleV1", ["NODE_render", "NODE_visual"], ["ART_post", "ART_visual"], "ART_release"),
]


def ready_gate_summary(contract: str) -> dict | None:
    summaries = {
        "ResearchPackV1": {"quality_decision": "ready", "artifact_state": "ready", "unresolved_material_request_count": 0},
        "CreatorExpressionPlanV1": {"quality_decision": "ready", "artifact_state": "ready", "unresolved_material_request_count": 0},
        "ViewpointDataBundleV1": {"quality_decision": "ready", "artifact_state": "ready", "unresolved_material_request_count": 0},
        "PublishCandidateSetV1": {"quality_decision": "ready_for_selection", "artifact_state": "ready_for_selection", "unresolved_material_request_count": 0},
    }
    return copy.deepcopy(summaries.get(contract))


def base_run() -> dict:
    nodes = []
    artifacts = []
    events = []
    for index, (short, capability, skill, contract, deps, inputs, artifact_id) in enumerate(CAPS, start=1):
        node_id = f"NODE_{short}"
        nodes.append({"node_id": node_id, "capability": capability, "skill_name": skill, "skill_version": SKILL_VERSIONS[skill], "availability": "installed", "opportunity_refs": [] if short in {"normalize", "select"} else ["OPP_q2_revision"], "depends_on": list(deps), "input_artifact_refs": list(inputs), "output_contract": contract, "state": "completed", "artifact_refs": [artifact_id], "blocking": True, "human_gate": "release" if short == "release" else "none", "owner": "ai", "reason": None})
        artifact = {"artifact_id": artifact_id, "artifact_type": contract, "schema_version": contract, "content_hash": f"sha256:{format(index % 16, 'x') * 64}", "locator": f"memory://{artifact_id}", "created_at": f"2026-07-14T12:{index:02d}:00+00:00", "producer_node_ref": node_id, "input_artifact_refs": list(inputs), "status": "current"}
        gate_summary = ready_gate_summary(contract)
        if gate_summary is not None:
            artifact["gate_summary"] = gate_summary
        artifacts.append(artifact)
        events.append({"event_id": f"EVT_{short}", "node_ref": node_id, "from_state": None, "to_state": "completed", "actor": "system", "occurred_at": f"2026-07-14T12:{index:02d}:00+00:00", "reason": "validated output registered"})
    nodes.append({"node_id": "NODE_publish", "capability": "publish_external", "skill_name": None, "skill_version": None, "availability": "external", "opportunity_refs": ["OPP_q2_revision"], "depends_on": ["NODE_release"], "input_artifact_refs": ["ART_release"], "output_contract": "PublicationReceiptV1", "state": "deferred", "artifact_refs": [], "blocking": False, "human_gate": "release", "owner": "external", "reason": "publisher connector not configured"})
    events.append({"event_id": "EVT_publish", "node_ref": "NODE_publish", "from_state": None, "to_state": "deferred", "actor": "system", "occurred_at": "2026-07-14T12:09:00+00:00", "reason": "external handoff only"})
    return {
        "schema_version": "creator-workflow-run-v1", "workflow_id": "WF_1234abcd",
        "feed_ref": "CF_1234abcd", "opportunity_set_ref": "OS_1234abcd",
        "recipe_ref": "RECIPE_1234abcd", "catalog_version": "1.27.0",
        "query_bundle_refs": [],
        "selected_opportunity_refs": ["OPP_q2_revision"], "mode": "single",
        "created_at": "2026-07-14T12:00:00+00:00", "as_of": "2026-07-14T12:11:00+00:00",
        "ruleset_version": "2026-07-14", "state": "ready_for_handoff", "nodes": nodes,
        "artifact_registry": artifacts,
        "approvals": [{"approval_id": "APR_release", "gate": "release", "artifact_versions": [{"artifact_ref": "ART_release", "content_hash": next(artifact["content_hash"] for artifact in artifacts if artifact["artifact_id"] == "ART_release")}], "decision": "approved", "reviewer_ref": "editor-vito", "decided_at": "2026-07-14T12:14:00+00:00", "policy_version": "2026-07-14", "reason": "frozen payload approved"}],
        "state_events": events, "blockers": [],
        "quality_report": {"decision": "ready", "hard_failures": [], "warnings": [], "checks": ["recipe", "catalog", "dag", "hash-bound approval"], "counts": {"nodes": 14, "completed": 13, "blocked": 0, "deferred": 1, "artifacts": 13, "approvals_pending": 0}},
    }


def codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["errors"]}


def add_query_bundle(item: dict) -> None:
    query_node = {
        "node_id": "NODE_query", "capability": "query_cuebook",
        "skill_name": "query-cuebook", "skill_version": SKILL_VERSIONS["query-cuebook"],
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": [], "input_artifact_refs": [],
        "output_contract": "CuebookQueryBundleV1", "state": "completed",
        "artifact_refs": ["ART_query"], "blocking": True,
        "human_gate": "none", "owner": "ai", "reason": None,
    }
    item["nodes"].insert(0, query_node)
    item["artifact_registry"].append({
        "artifact_id": "ART_query", "artifact_type": "CuebookQueryBundleV1",
        "schema_version": "cuebook-query-bundle-v1",
        "content_hash": f"sha256:{'f' * 64}", "locator": "memory://ART_query",
        "created_at": "2026-07-14T11:59:00+00:00", "producer_node_ref": "NODE_query",
        "input_artifact_refs": [], "status": "current",
        "gate_summary": ready_gate_summary("ResearchPackV1"),
    })
    item["state_events"].append({
        "event_id": "EVT_query", "node_ref": "NODE_query", "from_state": None,
        "to_state": "completed", "actor": "system",
        "occurred_at": "2026-07-14T11:59:00+00:00",
        "reason": "read-only query bundle registered",
    })
    research = next(node for node in item["nodes"] if node["node_id"] == "NODE_research")
    research["depends_on"].append("NODE_query")
    research["input_artifact_refs"].append("ART_query")
    research_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_research")
    research_artifact["input_artifact_refs"].append("ART_query")
    item["query_bundle_refs"] = ["ART_query"]
    item["quality_report"]["counts"].update({"nodes": 15, "completed": 14, "artifacts": 14})


def workflow_recipe() -> dict:
    recipe = recipe_module.base_recipe()
    recipe["preset_ref"] = "preset-thesis-watch"
    recipe["plating"]["bundle_strategy"] = "independent"
    recipe["plating"]["outputs"] = recipe["plating"]["outputs"][:1]
    recipe["execution"]["selected_skill_ids"] = ["prepare-market-content-release"]
    recipe["execution"]["resolved_skill_ids"] = [skill_id for skill_id in recipe["execution"]["resolved_skill_ids"] if skill_id not in {"plan-market-content-program", "render-cuebook-market-media"}]
    recipe["execution"]["version_pins"] = [pin for pin in recipe["execution"]["version_pins"] if pin["skill_id"] not in {"plan-market-content-program", "render-cuebook-market-media"}]
    for skill_id in ("assemble-cuebook-viewpoint-data", "direct-cuebook-viewpoint-visual", "render-cuebook-viewpoint-visual"):
        recipe["execution"]["resolved_skill_ids"].append(skill_id)
        version = next(entry["version"] for entry in CATALOG["skills"] if entry["skill_id"] == skill_id)
        recipe["execution"]["version_pins"].append({"skill_id": skill_id, "version": version})
    recipe["execution"]["selected_skill_ids"].append("render-cuebook-viewpoint-visual")
    recipe["validation_report"]["counts"].update({"outputs": 1, "selected_skills": 2, "resolved_skills": 14})
    return recipe


def settlement_recipe() -> dict:
    recipe = workflow_recipe()
    recipe["execution"]["selected_skill_ids"].append("compile-cuebook-settlement-claim")
    for skill_id in ("compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula"):
        recipe["execution"]["resolved_skill_ids"].append(skill_id)
        version = next(entry["version"] for entry in CATALOG["skills"] if entry["skill_id"] == skill_id)
        recipe["execution"]["version_pins"].append({"skill_id": skill_id, "version": version})
    recipe["validation_report"]["counts"].update({"selected_skills": 3, "resolved_skills": 16})
    return recipe


def detail_chart_recipe() -> dict:
    recipe = workflow_recipe()
    recipe["execution"]["resolved_skill_ids"].append("render-cuebook-thesis-chart")
    recipe["execution"]["version_pins"].append({"skill_id": "render-cuebook-thesis-chart", "version": "1.2.0"})
    recipe["validation_report"]["counts"]["resolved_skills"] = 15
    return recipe


def candidate_recipe() -> dict:
    recipe = workflow_recipe()
    skill_id = "assemble-cuebook-publish-candidates"
    recipe["execution"]["resolved_skill_ids"].append(skill_id)
    recipe["execution"]["version_pins"].append({"skill_id": skill_id, "version": SKILL_VERSIONS[skill_id]})
    recipe["validation_report"]["counts"]["resolved_skills"] = 15
    return recipe


def add_candidate_node(item: dict) -> None:
    node = {
        "node_id": "NODE_candidates", "capability": "catalog:assemble-publish-candidates",
        "skill_name": "assemble-cuebook-publish-candidates",
        "skill_version": SKILL_VERSIONS["assemble-cuebook-publish-candidates"],
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": ["NODE_render", "NODE_direction"],
        "input_artifact_refs": ["ART_expression", "ART_research", "ART_data", "ART_post", "ART_direction"],
        "output_contract": "PublishCandidateSetV1", "state": "completed",
        "artifact_refs": ["ART_candidates"], "blocking": True,
        "human_gate": "editorial", "owner": "ai", "reason": None,
    }
    release_index = next(index for index, entry in enumerate(item["nodes"]) if entry["node_id"] == "NODE_release")
    item["nodes"].insert(release_index, node)
    item["artifact_registry"].append({
        "artifact_id": "ART_candidates", "artifact_type": "PublishCandidateSetV1",
        "schema_version": "publish-candidate-set-v1", "content_hash": f"sha256:{'9' * 64}",
        "locator": "memory://ART_candidates", "created_at": "2026-07-14T12:11:45+00:00",
        "producer_node_ref": "NODE_candidates",
        "input_artifact_refs": ["ART_expression", "ART_research", "ART_data", "ART_post", "ART_direction"],
        "status": "current", "gate_summary": ready_gate_summary("PublishCandidateSetV1"),
    })
    item["state_events"].append({
        "event_id": "EVT_candidates", "node_ref": "NODE_candidates", "from_state": None,
        "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:11:45+00:00",
        "reason": "three selectable candidates assembled",
    })
    release = next(entry for entry in item["nodes"] if entry["node_id"] == "NODE_release")
    release["depends_on"].append("NODE_candidates")
    release["input_artifact_refs"].append("ART_candidates")
    release_artifact = next(entry for entry in item["artifact_registry"] if entry["artifact_id"] == "ART_release")
    release_artifact["input_artifact_refs"].append("ART_candidates")
    item["quality_report"]["counts"].update({"nodes": 15, "completed": 14, "artifacts": 14})


def add_settlement_node(item: dict) -> None:
    claim_version = next(entry["version"] for entry in CATALOG["skills"] if entry["skill_id"] == "compile-cuebook-settlement-claim")
    formula_version = next(entry["version"] for entry in CATALOG["skills"] if entry["skill_id"] == "compile-cuebook-settlement-formula")
    claim_node = {
        "node_id": "NODE_settlement", "capability": "compile_settlement_claim",
        "skill_name": "compile-cuebook-settlement-claim", "skill_version": claim_version,
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": ["NODE_expression"], "input_artifact_refs": ["ART_expression"],
        "output_contract": "SettlementClaimV1", "state": "completed",
        "artifact_refs": ["ART_settlement"], "blocking": True,
        "human_gate": "editorial", "owner": "ai", "reason": None,
    }
    formula_node = {
        "node_id": "NODE_settlement_formula", "capability": "compile_settlement_formula",
        "skill_name": "compile-cuebook-settlement-formula", "skill_version": formula_version,
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": ["NODE_settlement"], "input_artifact_refs": ["ART_settlement"],
        "output_contract": "SettlementFormulaV1", "state": "completed",
        "artifact_refs": ["ART_settlement_formula"], "blocking": True,
        "human_gate": "none", "owner": "ai", "reason": None,
    }
    release_index = next(index for index, entry in enumerate(item["nodes"]) if entry["node_id"] == "NODE_release")
    item["nodes"][release_index:release_index] = [claim_node, formula_node]
    item["artifact_registry"].append({
        "artifact_id": "ART_settlement", "artifact_type": "SettlementClaimV1",
        "schema_version": "settlement-claim-v1", "content_hash": f"sha256:{'c' * 64}",
        "locator": "memory://ART_settlement", "created_at": "2026-07-14T12:07:30+00:00",
        "producer_node_ref": "NODE_settlement", "input_artifact_refs": ["ART_expression"], "status": "current",
    })
    item["artifact_registry"].append({
        "artifact_id": "ART_settlement_formula", "artifact_type": "SettlementFormulaV1",
        "schema_version": "settlement-formula-v1", "content_hash": f"sha256:{'d' * 64}",
        "locator": "memory://ART_settlement_formula", "created_at": "2026-07-14T12:07:45+00:00",
        "producer_node_ref": "NODE_settlement_formula", "input_artifact_refs": ["ART_settlement"], "status": "current",
    })
    item["state_events"].append({
        "event_id": "EVT_settlement", "node_ref": "NODE_settlement", "from_state": None,
        "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:07:30+00:00",
        "reason": "settlement claim compiled and confirmed",
    })
    item["state_events"].append({
        "event_id": "EVT_settlement_formula", "node_ref": "NODE_settlement_formula", "from_state": None,
        "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:07:45+00:00",
        "reason": "settlement formula compiled from the confirmed claim",
    })
    release = next(entry for entry in item["nodes"] if entry["node_id"] == "NODE_release")
    release["depends_on"].extend(["NODE_settlement", "NODE_settlement_formula"])
    release["input_artifact_refs"].extend(["ART_settlement", "ART_settlement_formula"])
    release_artifact = next(entry for entry in item["artifact_registry"] if entry["artifact_id"] == "ART_release")
    release_artifact["input_artifact_refs"].extend(["ART_settlement", "ART_settlement_formula"])
    item["quality_report"]["counts"].update({"nodes": 16, "completed": 15, "artifacts": 15})


def trade_recipe() -> dict:
    recipe = workflow_recipe()
    for skill_id in ("compose-cuebook-trading-thesis", "classify-cuebook-trading-logic"):
        recipe["execution"]["resolved_skill_ids"].append(skill_id)
        recipe["execution"]["version_pins"].append({"skill_id": skill_id, "version": "1.0.0"})
    recipe["execution"]["selected_skill_ids"].append("compose-cuebook-trading-thesis")
    recipe["validation_report"]["counts"].update({"selected_skills": 3, "resolved_skills": 16})
    return recipe


def add_trade_nodes(item: dict) -> None:
    additions = [
        ("NODE_thesis", "catalog:compose-trading-thesis", "compose-cuebook-trading-thesis", "TradingThesisV1", "ART_thesis", "d"),
        ("NODE_trade", "catalog:classify-trading-logic", "classify-cuebook-trading-logic", "TradeLogicProfileV1", "ART_trade", "e"),
    ]
    expression_index = next(index for index, node in enumerate(item["nodes"]) if node["node_id"] == "NODE_expression")
    for offset, (node_id, capability, skill_name, contract, artifact_id, hash_char) in enumerate(additions):
        item["nodes"].insert(expression_index + offset, {
            "node_id": node_id, "capability": capability, "skill_name": skill_name,
            "skill_version": "1.0.0", "availability": "installed",
            "opportunity_refs": ["OPP_q2_revision"], "depends_on": ["NODE_semantics"],
            "input_artifact_refs": ["ART_semantics", "ART_research"], "output_contract": contract,
            "state": "completed", "artifact_refs": [artifact_id], "blocking": True,
            "human_gate": "editorial", "owner": "ai", "reason": None,
        })
        item["artifact_registry"].append({
            "artifact_id": artifact_id, "artifact_type": contract, "schema_version": contract,
            "content_hash": f"sha256:{hash_char * 64}", "locator": f"memory://{artifact_id}",
            "created_at": "2026-07-14T12:07:30+00:00", "producer_node_ref": node_id,
            "input_artifact_refs": ["ART_semantics", "ART_research"], "status": "current",
        })
        item["state_events"].append({
            "event_id": f"EVT_{node_id.removeprefix('NODE_')}", "node_ref": node_id,
            "from_state": None, "to_state": "completed", "actor": "system",
            "occurred_at": "2026-07-14T12:07:30+00:00", "reason": "optional trade enrichment completed",
        })
    expression = next(node for node in item["nodes"] if node["node_id"] == "NODE_expression")
    expression["depends_on"].extend(["NODE_thesis", "NODE_trade"])
    expression["input_artifact_refs"].extend(["ART_thesis", "ART_trade"])
    expression_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_expression")
    expression_artifact["input_artifact_refs"].extend(["ART_thesis", "ART_trade"])
    item["quality_report"]["counts"].update({"nodes": 16, "completed": 15, "artifacts": 15})


def card_recipe() -> dict:
    recipe = workflow_recipe()
    recipe["preset_ref"] = "preset-viewpoint-card"
    recipe["plating"]["outputs"] = [{
        "output_id": "OUT_viewpoint", "channel": "generic", "format": "viewpoint_card",
        "count": 1, "length": "standard", "media_format_ref": None, "target_context": None,
    }]
    recipe["execution"]["resolved_skill_ids"].append("assemble-cuebook-viewpoint-card")
    recipe["execution"]["version_pins"].append({"skill_id": "assemble-cuebook-viewpoint-card", "version": "1.1.0"})
    recipe["validation_report"]["counts"]["resolved_skills"] = 15
    return recipe


def add_card_node(item: dict) -> None:
    card = {
        "node_id": "NODE_card", "capability": "catalog:assemble-viewpoint-card",
        "skill_name": "assemble-cuebook-viewpoint-card", "skill_version": "1.1.0",
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": ["NODE_render", "NODE_visual"],
        "input_artifact_refs": ["ART_expression", "ART_post", "ART_visual"],
        "output_contract": "ViewpointCardV1", "state": "completed",
        "artifact_refs": ["ART_card"], "blocking": True,
        "human_gate": "editorial", "owner": "ai", "reason": None,
    }
    release_index = next(index for index, node in enumerate(item["nodes"]) if node["node_id"] == "NODE_release")
    item["nodes"].insert(release_index, card)
    item["artifact_registry"].append({
        "artifact_id": "ART_card", "artifact_type": "ViewpointCardV1",
        "schema_version": "viewpoint-card-v1", "content_hash": f"sha256:{'f' * 64}",
        "locator": "memory://ART_card", "created_at": "2026-07-14T12:11:30+00:00",
        "producer_node_ref": "NODE_card", "input_artifact_refs": ["ART_expression", "ART_post", "ART_visual"],
        "status": "current",
    })
    item["state_events"].append({
        "event_id": "EVT_card", "node_ref": "NODE_card", "from_state": None,
        "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:11:30+00:00",
        "reason": "no-trade viewpoint card assembled",
    })
    release = next(node for node in item["nodes"] if node["node_id"] == "NODE_release")
    release["depends_on"] = ["NODE_card"]
    release["input_artifact_refs"] = ["ART_card"]
    release_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_release")
    release_artifact["input_artifact_refs"] = ["ART_card"]
    item["quality_report"]["counts"].update({"nodes": 15, "completed": 14, "artifacts": 14})


def add_detail_chart_node(item: dict) -> None:
    chart = {
        "node_id": "NODE_thesis_chart", "capability": "catalog:render-thesis-chart",
        "skill_name": "render-cuebook-thesis-chart", "skill_version": "1.2.0",
        "availability": "installed", "opportunity_refs": ["OPP_q2_revision"],
        "depends_on": ["NODE_data"],
        "input_artifact_refs": ["ART_expression", "ART_data", "ART_research"],
        "output_contract": "ThesisChartV1", "state": "completed",
        "artifact_refs": ["ART_thesis_chart"], "blocking": True,
        "human_gate": "editorial", "owner": "ai", "reason": None,
    }
    release_index = next(index for index, node in enumerate(item["nodes"]) if node["node_id"] == "NODE_release")
    item["nodes"].insert(release_index, chart)
    item["artifact_registry"].append({
        "artifact_id": "ART_thesis_chart", "artifact_type": "ThesisChartV1",
        "schema_version": "thesis-chart-v1", "content_hash": f"sha256:{'0' * 64}",
        "locator": "memory://ART_thesis_chart", "created_at": "2026-07-14T12:11:30+00:00",
        "producer_node_ref": "NODE_thesis_chart",
        "input_artifact_refs": ["ART_expression", "ART_data", "ART_research"], "status": "current",
    })
    item["state_events"].append({
        "event_id": "EVT_thesis_chart", "node_ref": "NODE_thesis_chart", "from_state": None,
        "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:11:30+00:00",
        "reason": "optional full-chart detail rendered",
    })
    release = next(node for node in item["nodes"] if node["node_id"] == "NODE_release")
    release["depends_on"].append("NODE_thesis_chart")
    release["input_artifact_refs"].append("ART_thesis_chart")
    release_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_release")
    release_artifact["input_artifact_refs"].append("ART_thesis_chart")
    item["quality_report"]["counts"].update({"nodes": 15, "completed": 14, "artifacts": 14})


def main() -> None:
    opportunities = ops_module.base_set(); recipe = workflow_recipe(); cases = 0
    result = validate(base_run(), opportunities, recipe, CATALOG); assert result["valid"], result; cases += 1
    assert not ({"compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula"} & {node["skill_name"] for node in base_run()["nodes"]}); cases += 1

    item = base_run(); add_query_bundle(item)
    result = validate(item, opportunities, recipe, CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); item["query_bundle_refs"] = ["ART_missing_query"]
    assert "UNKNOWN_QUERY_BUNDLE" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); item["query_bundle_refs"] = ["ART_research"]
    assert "QUERY_BUNDLE_CONTRACT" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run()
    for artifact in item["artifact_registry"]:
        if artifact["artifact_type"] in {"ResearchPackV1", "CreatorExpressionPlanV1", "ViewpointDataBundleV1"}:
            artifact["locator"] = f"https://artifacts.invalid/{artifact['artifact_id']}"
    result = validate(item, opportunities, recipe, CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_research").pop("gate_summary")
    assert "GATE_SUMMARY_REQUIRED" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    for artifact_id, decision, state in (
        ("ART_research", "conditional", "conditional"),
        ("ART_research", "blocked", "blocked"),
        ("ART_expression", "conditional", "conditional"),
        ("ART_data", "conditional", "conditional"),
    ):
        item = base_run(); summary = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == artifact_id)["gate_summary"]; summary.update({"quality_decision": decision, "artifact_state": state})
        assert "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_expression")["gate_summary"]["unresolved_material_request_count"] = 1
    assert "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); research_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_research"); research_artifact["status"] = "superseded"; research_artifact["gate_summary"].update({"quality_decision": "conditional", "artifact_state": "conditional"})
    assert "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); add_candidate_node(item)
    result = validate(item, opportunities, candidate_recipe(), CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); add_candidate_node(item); research_summary = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_research")["gate_summary"]; research_summary.update({"quality_decision": "conditional", "artifact_state": "conditional", "unresolved_material_request_count": 1})
    candidate_index = next(index for index, node in enumerate(item["nodes"]) if node["node_id"] == "NODE_candidates")
    result = validate(item, opportunities, candidate_recipe(), CATALOG); assert any(error["code"] == "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" and error["path"] == f"$.nodes[{candidate_index}].state" for error in result["errors"]); cases += 1

    item = base_run(); add_candidate_node(item); candidate_artifact = next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_candidates"); candidate_artifact["gate_summary"] = {"quality_decision": "blocked", "artifact_state": "blocked", "unresolved_material_request_count": 1}
    result = validate(item, opportunities, candidate_recipe(), CATALOG); assert "COMPLETED_CANDIDATE_GATE_NOT_READY" in codes(result); cases += 1

    item = base_run(); add_candidate_node(item)
    candidate_node = next(node for node in item["nodes"] if node["node_id"] == "NODE_candidates")
    release_node = next(node for node in item["nodes"] if node["node_id"] == "NODE_release")
    candidate_node.update({"state": "blocked", "reason": "material metric remains unresolved"})
    release_node.update({"state": "blocked", "reason": "candidate gate is blocked"})
    next(event for event in item["state_events"] if event["node_ref"] == "NODE_candidates")["to_state"] = "blocked"
    next(event for event in item["state_events"] if event["node_ref"] == "NODE_release")["to_state"] = "blocked"
    next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_candidates")["gate_summary"] = {"quality_decision": "blocked", "artifact_state": "blocked", "unresolved_material_request_count": 1}
    item["state"] = "blocked"
    item["blockers"] = [
        {"blocker_id": "BLK_candidates", "node_ref": "NODE_candidates", "code": "MATERIAL_REQUEST_UNRESOLVED", "detail": "Required same-basis metric is unavailable.", "resolution": "Resolve the metric or return an explicit not-meaningful result.", "blocking": True},
        {"blocker_id": "BLK_release", "node_ref": "NODE_release", "code": "UPSTREAM_GATE_BLOCKED", "detail": "Candidate assembly is blocked.", "resolution": "Clear the candidate material-request gate.", "blocking": True},
    ]
    item["quality_report"].update({"decision": "blocked", "hard_failures": ["material metric unresolved"]})
    item["quality_report"]["counts"].update({"completed": 12, "blocked": 2})
    result = validate(item, opportunities, candidate_recipe(), CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); visual = next(node for node in item["nodes"] if node["node_id"] == "NODE_visual"); visual["depends_on"].remove("NODE_direction")
    result = validate(item, opportunities, recipe, CATALOG); assert "CATALOG_DEPENDENCY_MISSING" in codes(result) and "ORDER_VISUAL_BRIDGE" in codes(result); cases += 1

    item = base_run(); data = next(node for node in item["nodes"] if node["node_id"] == "NODE_data"); data["depends_on"] = ["NODE_expression", "NODE_render"]
    assert "PARALLEL_BRANCH_ORDER" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); add_settlement_node(item)
    result = validate(item, opportunities, settlement_recipe(), CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); add_settlement_node(item); formula = next(entry for entry in item["nodes"] if entry["node_id"] == "NODE_settlement_formula"); formula["depends_on"] = []; formula["input_artifact_refs"] = []; next(entry for entry in item["artifact_registry"] if entry["artifact_id"] == "ART_settlement_formula")["input_artifact_refs"] = []
    assert "ORDER_SETTLEMENT_FORMULA" in codes(validate(item, opportunities, settlement_recipe(), CATALOG)); cases += 1

    item = base_run(); add_trade_nodes(item)
    result = validate(item, opportunities, trade_recipe(), CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); add_trade_nodes(item); expression = next(node for node in item["nodes"] if node["node_id"] == "NODE_expression"); expression["depends_on"].remove("NODE_trade"); expression["input_artifact_refs"].remove("ART_trade"); next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_expression")["input_artifact_refs"].remove("ART_trade")
    assert "ORDER_EXPRESSION_ENRICHMENT" in codes(validate(item, opportunities, trade_recipe(), CATALOG)); cases += 1

    item = base_run(); add_card_node(item)
    result = validate(item, opportunities, card_recipe(), CATALOG); assert result["valid"], result; cases += 1

    item = base_run(); add_detail_chart_node(item)
    result = validate(item, opportunities, detail_chart_recipe(), CATALOG); assert result["valid"], result; cases += 1
    assert not ({"compile-cuebook-settlement-claim", "compile-cuebook-settlement-formula"} & {node["skill_name"] for node in item["nodes"]}); cases += 1

    item = base_run(); add_settlement_node(item); release = next(entry for entry in item["nodes"] if entry["node_id"] == "NODE_release"); release["depends_on"].remove("NODE_settlement_formula"); release["input_artifact_refs"].remove("ART_settlement_formula"); next(entry for entry in item["artifact_registry"] if entry["artifact_id"] == "ART_release")["input_artifact_refs"].remove("ART_settlement_formula")
    assert "ORDER_RELEASE_FORMULA" in codes(validate(item, opportunities, settlement_recipe(), CATALOG)); cases += 1

    item = base_run(); item["selected_opportunity_refs"] = []
    result = validate(item, opportunities); assert "SINGLE_CARDINALITY" in codes(result) and "OPPORTUNITY_REQUIRED" in codes(result); cases += 1

    item = base_run(); item["nodes"][1]["skill_name"] = "wrong-skill"
    assert "SKILL_OWNER" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["nodes"][1]["depends_on"] = []
    assert "ORDER_SELECT" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["nodes"][0]["depends_on"] = ["NODE_select"]
    assert "DEPENDENCY_CYCLE" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["nodes"][5]["depends_on"] = ["NODE_route"]
    assert "ORDER_RESEARCH" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); next(node for node in item["nodes"] if node["node_id"] == "NODE_render")["depends_on"] = ["NODE_route"]
    result = validate(item, opportunities); assert "ORDER_RENDER" in codes(result) and "COMPLETED_BEFORE_DEPENDENCY" not in codes(result); cases += 1

    item = base_run(); next(node for node in item["nodes"] if node["node_id"] == "NODE_release")["depends_on"] = ["NODE_research"]
    assert "ORDER_RELEASE_RENDER" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["nodes"][0]["artifact_refs"] = []
    assert "COMPLETED_WITHOUT_ARTIFACT" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["artifact_registry"][0]["artifact_type"] = "WrongV1"
    assert "ARTIFACT_CONTRACT_MISMATCH" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["artifact_registry"][0]["producer_node_ref"] = "NODE_missing"
    assert "UNKNOWN_PRODUCER" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["approvals"][0]["artifact_versions"][0]["content_hash"] = f"sha256:{'9' * 64}"
    result = validate(item, opportunities); assert "APPROVAL_HASH_MISMATCH" in codes(result) and "HANDOFF_WITHOUT_APPROVAL" in codes(result); cases += 1

    item = base_run(); item["approvals"] = []; item["quality_report"]["counts"]["approvals_pending"] = 0
    assert "HANDOFF_WITHOUT_APPROVAL" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["state_events"][0]["to_state"] = "running"
    assert "EVENT_STATE_MISMATCH" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["state_events"] = item["state_events"][1:]
    assert "NODE_EVENT_REQUIRED" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["nodes"][3]["state"] = "blocked"; item["nodes"][3]["reason"] = "asset mismatch"; item["nodes"][3]["artifact_refs"] = []; item["state_events"][3]["to_state"] = "blocked"; item["state"] = "blocked"; item["quality_report"]["decision"] = "blocked"; item["quality_report"]["counts"]["completed"] = 12; item["quality_report"]["counts"]["blocked"] = 1
    result = validate(item, opportunities); assert "BLOCKED_WITHOUT_BLOCKER" in codes(result) and "BLOCKED_WITHOUT_BLOCKERS" in codes(result); cases += 1

    item = base_run(); item["nodes"] = [node for node in item["nodes"] if node["capability"] != "build_research_pack"]; item["artifact_registry"] = [a for a in item["artifact_registry"] if a["artifact_type"] != "ResearchPackV1"]; item["state_events"] = [e for e in item["state_events"] if e["node_ref"] != "NODE_research"]; item["quality_report"]["counts"] = {"nodes": 13, "completed": 12, "blocked": 0, "deferred": 1, "artifacts": 12, "approvals_pending": 0}
    assert "REQUIRED_CAPABILITY" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["mode"] = "batch"; item["selected_opportunity_refs"].append("OPP_second")
    assert "REQUIRED_CAPABILITY" in codes(validate(item)); cases += 1

    item = base_run(); item["nodes"][-1]["state"] = "completed"; item["nodes"][-1]["artifact_refs"] = []; item["state_events"][-1]["to_state"] = "completed"; item["quality_report"]["counts"]["completed"] = 14; item["quality_report"]["counts"]["deferred"] = 0
    result = validate(item, opportunities); assert "COMPLETED_WITHOUT_ARTIFACT" in codes(result) and "PUBLISH_WITHOUT_RECEIPT" in codes(result); cases += 1

    item = base_run(); item["state"] = "complete"
    result = validate(item, opportunities); assert "COMPLETE_WITH_UNFINISHED" not in codes(result) and "COMPLETE_WITHOUT_PUBLICATION" in codes(result); cases += 1

    item = base_run(); item["quality_report"]["counts"]["nodes"] = 99
    assert "COUNTS" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["catalog_version"] = "1.6.0"
    assert "CATALOG_VERSION_UNSUPPORTED" in codes(validate(item, opportunities)); cases += 1

    item = base_run(); item["recipe_ref"] = "RECIPE_deadbeef"
    assert "RECIPE_REF_MISMATCH" in codes(validate(item, opportunities, recipe)); cases += 1

    item = base_run(); item["nodes"][2]["skill_version"] = "9.9.9"
    assert "NODE_SKILL_VERSION_MISMATCH" in codes(validate(item, opportunities, recipe, CATALOG)); cases += 1

    item = base_run(); conditional_recipe = workflow_recipe(); conditional_recipe["state"] = "conditional"; conditional_recipe["validation_report"]["decision"] = "conditional"
    assert "HANDOFF_WITH_CONDITIONAL_RECIPE" in codes(validate(item, opportunities, conditional_recipe, CATALOG)); cases += 1

    item = base_run(); item["nodes"][2]["depends_on"] = ["NODE_normalize"]
    assert "ORDER_RECIPE_AFTER_SELECTION" in codes(validate(item, opportunities, recipe)); cases += 1

    item = base_run(); ingredient_recipe = workflow_recipe(); ingredient_recipe["selection_mode"] = "ingredient_first"; ingredient_recipe["opportunity_set_ref"] = None; ingredient_recipe["anchor"]["opportunity_ref"] = None; item["nodes"][1]["depends_on"] = ["NODE_normalize", "NODE_recipe"]; item["nodes"][1]["input_artifact_refs"] = ["ART_feed", "ART_recipe"]; item["artifact_registry"][1]["input_artifact_refs"] = ["ART_feed", "ART_recipe"]; item["nodes"][2]["depends_on"] = ["NODE_normalize"]; item["nodes"][2]["input_artifact_refs"] = ["ART_feed"]; item["artifact_registry"][2]["input_artifact_refs"] = ["ART_feed"]
    result = validate(item, opportunities, ingredient_recipe, CATALOG); assert result["valid"], result; cases += 1

    custom_catalog = copy.deepcopy(CATALOG); custom_skill = copy.deepcopy(next(entry for entry in custom_catalog["skills"] if entry["skill_id"] == "render-cuebook-market-media")); custom_skill.update({"skill_id": "render-custom-email", "display_name": "Render Custom Email", "description": "Render a custom email package.", "visibility": "selectable", "user_selectable": True, "default_enabled": False, "capabilities": ["render-custom-email"], "output_contract": "EmailPackageV1", "requires_all": ["build-market-research-pack"], "supported_channels": ["custom:email"]}); custom_skill["ui"].update({"order": 21, "control_type": "toggle", "summary": "Render custom email."}); custom_catalog["skills"].append(custom_skill)
    custom_recipe = workflow_recipe(); custom_recipe["execution"]["selected_skill_ids"].append("render-custom-email"); custom_recipe["execution"]["resolved_skill_ids"].append("render-custom-email"); custom_recipe["execution"]["version_pins"].append({"skill_id": "render-custom-email", "version": "1.0.0"}); custom_recipe["validation_report"]["counts"].update({"selected_skills": 3, "resolved_skills": 15})
    item = base_run(); email_node = {"node_id": "NODE_email", "capability": "catalog:render-custom-email", "skill_name": "render-custom-email", "skill_version": "1.0.0", "availability": "installed", "opportunity_refs": ["OPP_q2_revision"], "depends_on": ["NODE_research"], "input_artifact_refs": ["ART_research"], "output_contract": "EmailPackageV1", "state": "completed", "artifact_refs": ["ART_email"], "blocking": True, "human_gate": "editorial", "owner": "ai", "reason": None}; item["nodes"].insert(-1, email_node); item["artifact_registry"].append({"artifact_id": "ART_email", "artifact_type": "EmailPackageV1", "schema_version": "email-package-v1", "content_hash": f"sha256:{'a' * 64}", "locator": "memory://ART_email", "created_at": "2026-07-14T12:07:30+00:00", "producer_node_ref": "NODE_email", "input_artifact_refs": ["ART_research"], "status": "current"}); item["state_events"].append({"event_id": "EVT_email", "node_ref": "NODE_email", "from_state": None, "to_state": "completed", "actor": "system", "occurred_at": "2026-07-14T12:07:30+00:00", "reason": "catalog renderer completed"}); release_node = next(node for node in item["nodes"] if node["capability"] == "prepare_release"); release_node["depends_on"].append("NODE_email"); release_node["input_artifact_refs"].append("ART_email"); next(artifact for artifact in item["artifact_registry"] if artifact["artifact_id"] == "ART_release")["input_artifact_refs"].append("ART_email"); item["quality_report"]["counts"].update({"nodes": 15, "completed": 14, "artifacts": 14})
    result = validate(item, opportunities, custom_recipe, custom_catalog); assert result["valid"], result; cases += 1

    missing_node = copy.deepcopy(item); missing_node["nodes"] = [node for node in missing_node["nodes"] if node["node_id"] != "NODE_email"]; missing_node["artifact_registry"] = [artifact for artifact in missing_node["artifact_registry"] if artifact["artifact_id"] != "ART_email"]; missing_node["state_events"] = [event for event in missing_node["state_events"] if event["node_ref"] != "NODE_email"]; missing_release = next(node for node in missing_node["nodes"] if node["capability"] == "prepare_release"); missing_release["depends_on"].remove("NODE_email"); missing_release["input_artifact_refs"].remove("ART_email"); next(artifact for artifact in missing_node["artifact_registry"] if artifact["artifact_id"] == "ART_release")["input_artifact_refs"].remove("ART_email"); missing_node["quality_report"]["counts"].update({"nodes": 14, "completed": 13, "artifacts": 13})
    assert "RESOLVED_SKILL_NODE_MISSING" in codes(validate(missing_node, opportunities, custom_recipe, custom_catalog)); cases += 1

    custom_only_recipe = copy.deepcopy(custom_recipe); custom_only_recipe["plating"]["outputs"] = [{"output_id": "OUT_email", "channel": "custom:email", "format": "newsletter", "count": 1, "length": "standard", "media_format_ref": None, "target_context": "subscribers"}]; custom_only_recipe["execution"]["resolved_skill_ids"].remove("render-cuebook-market-post"); custom_only_recipe["execution"]["version_pins"] = [pin for pin in custom_only_recipe["execution"]["version_pins"] if pin["skill_id"] != "render-cuebook-market-post"]; custom_only_recipe["validation_report"]["counts"].update({"outputs": 1, "resolved_skills": 14})
    custom_only = copy.deepcopy(item); custom_only["nodes"] = [node for node in custom_only["nodes"] if node["node_id"] != "NODE_render"]; custom_only["artifact_registry"] = [artifact for artifact in custom_only["artifact_registry"] if artifact["artifact_id"] != "ART_post"]; custom_only["state_events"] = [event for event in custom_only["state_events"] if event["node_ref"] != "NODE_render"]; custom_release = next(node for node in custom_only["nodes"] if node["capability"] == "prepare_release"); custom_release["depends_on"].remove("NODE_render"); custom_release["input_artifact_refs"].remove("ART_post"); next(artifact for artifact in custom_only["artifact_registry"] if artifact["artifact_id"] == "ART_release")["input_artifact_refs"].remove("ART_post"); custom_only["quality_report"]["counts"].update({"nodes": 14, "completed": 13, "artifacts": 13})
    result = validate(custom_only, opportunities, custom_only_recipe, custom_catalog); assert result["valid"], result; cases += 1

    broken = copy.deepcopy(item); next(node for node in broken["nodes"] if node["node_id"] == "NODE_email")["depends_on"] = []
    assert "CATALOG_DEPENDENCY_MISSING" in codes(validate(broken, opportunities, custom_recipe, custom_catalog)); cases += 1

    extension_recipe = workflow_recipe(); extension_recipe["extensions"].append({"extension_id": "EXT_custom", "extension_point": "custom_renderer", "provider_ref": "renderer-custom-v1", "required": True, "config_ref": None}); extension_recipe["validation_report"]["counts"]["extensions"] = 2
    item = base_run(); item["nodes"].insert(-1, {"node_id": "NODE_custom_extension", "capability": "extension:custom-renderer", "skill_name": None, "skill_version": None, "availability": "deferred", "opportunity_refs": ["OPP_q2_revision"], "depends_on": ["NODE_research"], "input_artifact_refs": ["ART_research"], "output_contract": "RendererProviderV1", "state": "deferred", "artifact_refs": [], "blocking": True, "human_gate": "editorial", "owner": "external", "reason": "provider not configured"}); item["state_events"].append({"event_id": "EVT_custom_extension", "node_ref": "NODE_custom_extension", "from_state": None, "to_state": "deferred", "actor": "system", "occurred_at": "2026-07-14T12:07:30+00:00", "reason": "provider not configured"}); item["quality_report"]["counts"].update({"nodes": 15, "deferred": 2})
    assert "HANDOFF_WITH_UNFINISHED" in codes(validate(item, opportunities, extension_recipe, CATALOG)); cases += 1

    print(f"ok: {cases} creator workflow cases")


class CreatorWorkflowRegressionTests(unittest.TestCase):
    def test_regression_matrix(self) -> None:
        main()


if __name__ == "__main__":
    main()
