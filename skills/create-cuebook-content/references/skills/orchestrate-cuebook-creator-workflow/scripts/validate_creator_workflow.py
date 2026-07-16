#!/usr/bin/env python3
"""Validate CreatorWorkflowRunV1 DAG, state, artifact, and approval invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_FIELDS = {"schema_version", "workflow_id", "feed_ref", "opportunity_set_ref", "recipe_ref", "catalog_version", "query_bundle_refs", "selected_opportunity_refs", "mode", "created_at", "as_of", "ruleset_version", "state", "nodes", "artifact_registry", "approvals", "state_events", "blockers", "quality_report"}
CAPABILITIES = {
    "normalize_feed": ("normalize-cuebook-creator-feed", "CreatorFeedV1"),
    "compose_recipe": ("compose-cuebook-content-recipe", "ContentRecipeV1"),
    "select_opportunities": ("select-cuebook-content-opportunities", "ContentOpportunitySetV1"),
    "validate_projection": ("validate-cuebook-projection", "GateV1"),
    "route_narrative": ("route-cuebook-narrative", "RouteV1"),
    "query_cuebook": ("query-cuebook", "CuebookQueryBundleV1"),
    "build_research_pack": ("build-market-research-pack", "ResearchPackV1"),
    "plan_content_program": ("plan-market-content-program", "ContentProgramV1"),
    "render_market_post": ("render-cuebook-market-post", "PostV1"),
    "render_market_media": ("render-cuebook-market-media", "MediaPackageV1"),
    "compile_settlement_claim": ("compile-cuebook-settlement-claim", "SettlementClaimV1"),
    "compile_settlement_formula": ("compile-cuebook-settlement-formula", "SettlementFormulaV1"),
    "optimize_market_seo": ("optimize-cuebook-market-seo", "MarketSEOPackV1"),
    "optimize_market_geo": ("optimize-cuebook-market-geo", "MarketGEOPackV1"),
    "prepare_release": ("prepare-market-content-release", "ReleaseBundleV1"),
    "publish_external": (None, "PublicationReceiptV1"),
    "reconcile_history": ("reconcile-market-content-history", "ContentHistoryLedgerV1"),
}
MODES = {"plan_only", "single", "batch", "event_lifecycle", "postmortem", "correction"}
NODE_STATES = {"pending", "ready", "running", "completed", "blocked", "skipped", "deferred"}
CATALOG_VERSION = "1.27.0"
GATE_SUMMARY_FIELDS = {"quality_decision", "artifact_state", "unresolved_material_request_count"}
GATE_ARTIFACT_RULES = {
    "CuebookQueryBundleV1": {
        "quality_decisions": {"ready", "conditional", "blocked"},
        "artifact_states": {"ready", "conditional", "blocked"},
        "ready_decisions": {"ready"},
        "ready_states": {"ready"},
    },
    "ResearchPackV1": {
        "quality_decisions": {"ready", "conditional", "blocked"},
        "artifact_states": {"ready", "conditional", "blocked"},
        "ready_decisions": {"ready"},
        "ready_states": {"ready"},
    },
    "CreatorExpressionPlanV1": {
        "quality_decisions": {"ready", "conditional", "blocked"},
        "artifact_states": {"draft", "conditional", "ready", "frozen"},
        "ready_decisions": {"ready"},
        "ready_states": {"ready", "frozen"},
    },
    "ViewpointDataBundleV1": {
        "quality_decisions": {"ready", "conditional", "blocked"},
        "artifact_states": {"ready", "conditional", "blocked"},
        "ready_decisions": {"ready"},
        "ready_states": {"ready"},
    },
    "PublishCandidateSetV1": {
        "quality_decisions": {"ready_for_selection", "selected", "blocked"},
        "artifact_states": {"draft", "ready_for_selection", "selected", "blocked"},
        "ready_decisions": {"ready_for_selection", "selected"},
        "ready_states": {"ready_for_selection", "selected"},
    },
}
GATED_DOWNSTREAM_CONTRACTS = {
    "PostV1",
    "MediaPackageV1",
    "VisualDirectionSetV1",
    "ViewpointVisualV1",
    "ThesisChartV1",
    "ViewpointMotionSpecV1",
    "ViewpointMotionV1",
    "LogicCardV1",
    "MarketFigureV1",
    "MarketSignalV1",
    "ViewpointCardV1",
    "PublishCandidateSetV1",
    "ReleaseBundleV1",
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any, path: str, errors: list[dict[str, str]], nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value:
        errors.append(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("TIME_FORMAT", path, "Invalid ISO timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."))
        return None
    return parsed


def has_path(nodes: dict[str, dict[str, Any]], start: str, target: str, seen: set[str] | None = None) -> bool:
    if start == target:
        return True
    seen = set() if seen is None else seen
    if start in seen or start not in nodes:
        return False
    seen.add(start)
    return any(has_path(nodes, dep, target, seen.copy()) for dep in nodes[start].get("depends_on", []))


def gate_summary_is_ready(artifact_type: str, summary: Any) -> bool:
    rules = GATE_ARTIFACT_RULES.get(artifact_type)
    if rules is None or not isinstance(summary, dict):
        return False
    unresolved = summary.get("unresolved_material_request_count")
    return (
        summary.get("quality_decision") in rules["ready_decisions"]
        and summary.get("artifact_state") in rules["ready_states"]
        and isinstance(unresolved, int)
        and not isinstance(unresolved, bool)
        and unresolved == 0
    )


def validate(payload: Any, opportunities: Any | None = None, recipe: Any | None = None, catalog: Any | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "CreatorWorkflowRunV1 must be an object.")], "warnings": []}
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "creator-workflow-run-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-workflow-run-v1."))
    if not re.fullmatch(r"WF_[a-z0-9]{8,64}", str(payload.get("workflow_id") or "")):
        errors.append(issue("WORKFLOW_ID", "$.workflow_id", "Invalid workflow ID."))
    if not re.fullmatch(r"RECIPE_[a-z0-9]{8,64}", str(payload.get("recipe_ref") or "")):
        errors.append(issue("RECIPE_REF", "$.recipe_ref", "Invalid recipe reference."))
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", str(payload.get("catalog_version") or "")):
        errors.append(issue("CATALOG_VERSION", "$.catalog_version", "Catalog version must use semantic versioning."))
    elif payload.get("catalog_version") != CATALOG_VERSION:
        errors.append(issue("CATALOG_VERSION_UNSUPPORTED", "$.catalog_version", f"CreatorWorkflowRunV1 currently requires catalog {CATALOG_VERSION}."))
    mode = payload.get("mode")
    if mode not in MODES:
        errors.append(issue("MODE", "$.mode", "Unsupported workflow mode."))
    created = parse_time(payload.get("created_at"), "$.created_at", errors)
    as_of = parse_time(payload.get("as_of"), "$.as_of", errors)
    if created and as_of and created > as_of:
        warnings.append(issue("CREATED_AFTER_AS_OF", "$.created_at", "created_at is after as_of."))
    if not str(payload.get("ruleset_version") or "").strip():
        errors.append(issue("RULESET", "$.ruleset_version", "ruleset_version is required."))

    selected_refs = payload.get("selected_opportunity_refs")
    if not isinstance(selected_refs, list) or len(selected_refs) != len(set(selected_refs or [])):
        errors.append(issue("SELECTED_REFS", "$.selected_opportunity_refs", "Selected opportunity refs must be a unique array."))
        selected_refs = []
    if mode == "single" and len(selected_refs) != 1:
        errors.append(issue("SINGLE_CARDINALITY", "$.selected_opportunity_refs", "single mode requires exactly one selected opportunity."))
    if mode == "batch" and len(selected_refs) < 2:
        errors.append(issue("BATCH_CARDINALITY", "$.selected_opportunity_refs", "batch mode requires at least two selected opportunities."))
    if mode not in {"plan_only"} and not selected_refs:
        errors.append(issue("OPPORTUNITY_REQUIRED", "$.selected_opportunity_refs", "Active mode requires selected opportunities."))
    if opportunities is not None:
        if not isinstance(opportunities, dict) or opportunities.get("schema_version") != "content-opportunity-set-v1":
            errors.append(issue("OPPORTUNITY_SET_TYPE", "$opportunities", "Expected ContentOpportunitySetV1."))
        else:
            if payload.get("opportunity_set_ref") != opportunities.get("opportunity_set_id"):
                errors.append(issue("OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Opportunity set reference does not match."))
            known = {entry.get("opportunity_id") for entry in opportunities.get("candidates", []) if isinstance(entry, dict) and entry.get("decision") == "selected"}
            for ref in selected_refs:
                if ref not in known:
                    errors.append(issue("UNKNOWN_SELECTED_OPPORTUNITY", "$.selected_opportunity_refs", f"{ref!r} is not selected in the supplied set."))

    recipe_selection_mode: str | None = None
    recipe_resolved_skills: set[str] = set()
    recipe_version_pins: dict[str, str] = {}
    if recipe is not None:
        if not isinstance(recipe, dict) or recipe.get("schema_version") != "content-recipe-v1":
            errors.append(issue("RECIPE_TYPE", "$recipe", "Expected ContentRecipeV1."))
        else:
            if payload.get("recipe_ref") != recipe.get("recipe_id"):
                errors.append(issue("RECIPE_REF_MISMATCH", "$.recipe_ref", "Workflow recipe reference does not match."))
            if payload.get("catalog_version") != recipe.get("catalog_version"):
                errors.append(issue("RECIPE_CATALOG_MISMATCH", "$.catalog_version", "Workflow and recipe catalog versions differ."))
            if payload.get("feed_ref") != recipe.get("feed_ref"):
                errors.append(issue("RECIPE_FEED_MISMATCH", "$.feed_ref", "Workflow and recipe feed references differ."))
            if recipe.get("opportunity_set_ref") is not None and payload.get("opportunity_set_ref") != recipe.get("opportunity_set_ref"):
                errors.append(issue("RECIPE_OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Workflow and recipe opportunity-set references differ."))
            recipe_execution = recipe.get("execution") if isinstance(recipe.get("execution"), dict) else {}
            if mode != recipe_execution.get("mode"):
                errors.append(issue("RECIPE_MODE_MISMATCH", "$.mode", "Workflow mode differs from the recipe."))
            recipe_resolved_skills = set(recipe_execution.get("resolved_skill_ids") or [])
            for pin in recipe_execution.get("version_pins") or []:
                if isinstance(pin, dict) and isinstance(pin.get("skill_id"), str) and isinstance(pin.get("version"), str):
                    recipe_version_pins[pin["skill_id"]] = pin["version"]
            recipe_selection_mode = recipe.get("selection_mode")
            anchor = recipe.get("anchor") if isinstance(recipe.get("anchor"), dict) else {}
            if recipe_selection_mode == "opportunity_first" and anchor.get("opportunity_ref") not in selected_refs:
                errors.append(issue("RECIPE_ANCHOR_MISMATCH", "$.selected_opportunity_refs", "Selected opportunities must include the recipe anchor."))
            if recipe.get("state") in {"blocked", "archived"}:
                errors.append(issue("RECIPE_NOT_EXECUTABLE", "$recipe.state", "Blocked or archived recipes cannot execute."))

    catalog_skills: dict[str, dict[str, Any]] = {}
    catalog_extensions: dict[str, dict[str, Any]] = {}
    if catalog is not None:
        if not isinstance(catalog, dict) or catalog.get("schema_version") != "skill-catalog-v1":
            errors.append(issue("CATALOG_TYPE", "$catalog", "Expected SkillCatalogV1."))
        else:
            if payload.get("catalog_version") != catalog.get("catalog_version"):
                errors.append(issue("WORKFLOW_CATALOG_MISMATCH", "$.catalog_version", "Workflow must pin the supplied catalog version."))
            catalog_skills = {entry.get("skill_id"): entry for entry in catalog.get("skills", []) if isinstance(entry, dict)}
            catalog_extensions = {entry.get("extension_point"): entry for entry in catalog.get("extension_points", []) if isinstance(entry, dict)}
    recipe_extensions = {
        entry.get("extension_point"): entry for entry in (recipe.get("extensions", []) if isinstance(recipe, dict) else []) if isinstance(entry, dict)
    }

    nodes_raw = payload.get("nodes")
    if not isinstance(nodes_raw, list):
        errors.append(issue("NODES_TYPE", "$.nodes", "nodes must be an array."))
        nodes_raw = []
    nodes: dict[str, dict[str, Any]] = {}
    node_paths: dict[str, str] = {}
    capabilities: dict[str, list[str]] = {}
    dynamic_catalog_nodes: dict[str, dict[str, Any]] = {}
    catalog_node_entries: dict[str, dict[str, Any]] = {}
    for index, node in enumerate(nodes_raw):
        path = f"$.nodes[{index}]"
        if not isinstance(node, dict):
            errors.append(issue("NODE_TYPE", path, "Node must be an object."))
            continue
        node_id = str(node.get("node_id") or "")
        if not node_id.startswith("NODE_"):
            errors.append(issue("NODE_ID", f"{path}.node_id", "Expected NODE_* ID."))
        if node_id in nodes:
            errors.append(issue("DUPLICATE_NODE", f"{path}.node_id", "Duplicate node ID."))
        nodes[node_id] = node
        node_paths[node_id] = path
        capability = node.get("capability")
        dynamic_catalog_entry: dict[str, Any] | None = None
        extension_entry: dict[str, Any] | None = None
        if capability in CAPABILITIES:
            expected_skill, expected_contract = CAPABILITIES[capability]
            expected_execution = "external" if capability == "publish_external" else "installed"
        elif isinstance(capability, str) and capability.startswith("catalog:"):
            capability_name = capability.split(":", 1)[1]
            candidates = [entry for entry in catalog_skills.values() if capability_name in (entry.get("capabilities") or [])]
            matching = [entry for entry in candidates if entry.get("skill_id") == node.get("skill_name")]
            if not catalog_skills:
                errors.append(issue("CATALOG_CAPABILITY_WITHOUT_CATALOG", f"{path}.capability", "Catalog capabilities require SkillCatalogV1."))
                continue
            if len(matching) != 1:
                errors.append(issue("CATALOG_CAPABILITY_RESOLUTION", f"{path}.capability", "Catalog capability must resolve to the node skill exactly once."))
                continue
            dynamic_catalog_entry = matching[0]
            dynamic_catalog_nodes[node_id] = dynamic_catalog_entry
            expected_skill = dynamic_catalog_entry.get("skill_id")
            expected_contract = dynamic_catalog_entry.get("output_contract")
            expected_execution = dynamic_catalog_entry.get("execution")
        elif isinstance(capability, str) and capability.startswith("extension:"):
            extension_point = capability.split(":", 1)[1].replace("-", "_")
            extension_entry = catalog_extensions.get(extension_point)
            if extension_entry is None:
                errors.append(issue("EXTENSION_CAPABILITY_UNKNOWN", f"{path}.capability", "Extension capability is absent from the catalog."))
                continue
            if extension_point not in recipe_extensions:
                errors.append(issue("EXTENSION_NOT_CONFIGURED", f"{path}.capability", "Recipe does not configure this extension point."))
            expected_skill = None
            expected_contract = extension_entry.get("contract")
            expected_execution = "external"
        else:
            errors.append(issue("CAPABILITY", f"{path}.capability", "Unsupported capability."))
            continue
        capabilities.setdefault(capability, []).append(node_id)
        if node.get("skill_name") != expected_skill:
            errors.append(issue("SKILL_OWNER", f"{path}.skill_name", f"Expected {expected_skill!r}."))
        skill_version = node.get("skill_version")
        if expected_skill is None:
            if skill_version is not None:
                errors.append(issue("EXTERNAL_SKILL_VERSION", f"{path}.skill_version", "External publisher has no local skill version."))
        elif not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", str(skill_version or "")):
            errors.append(issue("SKILL_VERSION", f"{path}.skill_version", "Installed nodes require a semantic skill version."))
        is_query_boundary = capability == "query_cuebook"
        if recipe_resolved_skills and expected_skill and expected_skill not in recipe_resolved_skills and not is_query_boundary:
            errors.append(issue("NODE_SKILL_NOT_RESOLVED", f"{path}.skill_name", "Node skill is not present in the recipe resolution."))
        if recipe_version_pins and expected_skill and not is_query_boundary and recipe_version_pins.get(expected_skill) != skill_version:
            errors.append(issue("NODE_RECIPE_VERSION_MISMATCH", f"{path}.skill_version", "Node skill version differs from the recipe pin."))
        if catalog_skills and expected_skill:
            catalog_entry = catalog_skills.get(expected_skill)
            if catalog_entry is None:
                errors.append(issue("NODE_SKILL_NOT_CATALOGED", f"{path}.skill_name", "Node skill is absent from the pinned catalog."))
            elif skill_version != catalog_entry.get("version"):
                errors.append(issue("NODE_SKILL_VERSION_MISMATCH", f"{path}.skill_version", "Node skill version differs from the catalog."))
            else:
                catalog_node_entries[node_id] = catalog_entry
        if node.get("output_contract") != expected_contract:
            errors.append(issue("OUTPUT_CONTRACT", f"{path}.output_contract", f"Expected {expected_contract}."))
        availability = node.get("availability")
        if expected_execution in {"external", "deferred"} and availability not in {"external", "deferred"}:
            errors.append(issue("EXTERNAL_AVAILABILITY", f"{path}.availability", "External or deferred capability cannot claim local installation."))
        if expected_execution == "installed" and availability != "installed":
            errors.append(issue("INSTALLED_AVAILABILITY", f"{path}.availability", "Installed catalog capability must be installed."))
        state = node.get("state")
        if state not in NODE_STATES:
            errors.append(issue("NODE_STATE", f"{path}.state", "Unsupported node state."))
        if state in {"blocked", "skipped", "deferred"} and not str(node.get("reason") or "").strip():
            errors.append(issue("STATE_REASON", f"{path}.reason", f"{state} node requires a reason."))
        if state == "completed" and not node.get("artifact_refs"):
            errors.append(issue("COMPLETED_WITHOUT_ARTIFACT", f"{path}.artifact_refs", "Completed node requires an artifact."))
        if state != "completed" and node.get("artifact_refs") and state not in {"blocked"}:
            warnings.append(issue("ARTIFACT_ON_INCOMPLETE_NODE", f"{path}.artifact_refs", "Incomplete node carries artifacts; verify partial-output semantics."))
        opportunity_refs = node.get("opportunity_refs")
        if not isinstance(opportunity_refs, list):
            errors.append(issue("NODE_OPPORTUNITY_REFS", f"{path}.opportunity_refs", "opportunity_refs must be an array."))
        else:
            for ref in opportunity_refs:
                if ref not in selected_refs:
                    errors.append(issue("UNKNOWN_NODE_OPPORTUNITY", f"{path}.opportunity_refs", f"Unknown selected opportunity {ref!r}."))
        for key in ("depends_on", "input_artifact_refs", "artifact_refs"):
            if not isinstance(node.get(key), list):
                errors.append(issue("NODE_REFS", f"{path}.{key}", f"{key} must be an array."))

    for node_id, node in nodes.items():
        path = node_paths[node_id]
        for dep in node.get("depends_on") or []:
            if dep not in nodes:
                errors.append(issue("UNKNOWN_DEPENDENCY", f"{path}.depends_on", f"Unknown dependency {dep!r}."))
            elif dep == node_id or has_path(nodes, dep, node_id):
                errors.append(issue("DEPENDENCY_CYCLE", f"{path}.depends_on", "Dependency graph contains a cycle."))
        if node.get("state") == "completed":
            for dep in node.get("depends_on") or []:
                if dep in nodes and nodes[dep].get("state") not in {"completed", "skipped"}:
                    errors.append(issue("COMPLETED_BEFORE_DEPENDENCY", path, f"Dependency {dep} is not completed or skipped."))
        catalog_entry = catalog_node_entries.get(node_id)
        if catalog_entry:
            for required_skill in catalog_entry.get("requires_all", []):
                provider_nodes = [candidate_id for candidate_id, candidate in nodes.items() if candidate.get("skill_name") == required_skill]
                if not provider_nodes or not any(has_path(nodes, node_id, provider_node) for provider_node in provider_nodes):
                    errors.append(issue("CATALOG_DEPENDENCY_MISSING", f"{path}.depends_on", f"Catalog dependency {required_skill!r} is not an ancestor."))

    if recipe_resolved_skills and catalog_skills:
        node_skill_names = {node.get("skill_name") for node in nodes.values() if node.get("skill_name")}
        for skill_id in sorted(recipe_resolved_skills):
            entry = catalog_skills.get(skill_id)
            if not entry or skill_id == "orchestrate-cuebook-creator-workflow":
                continue
            if mode in (entry.get("supported_modes") or []) and skill_id not in node_skill_names:
                errors.append(issue("RESOLVED_SKILL_NODE_MISSING", "$.nodes", f"Resolved runtime skill {skill_id!r} has no workflow node."))

    def require_capability(name: str) -> None:
        if name not in capabilities:
            errors.append(issue("REQUIRED_CAPABILITY", "$.nodes", f"Mode {mode} requires {name}."))

    if mode != "plan_only":
        for capability in ("normalize_feed", "compose_recipe", "select_opportunities", "validate_projection", "route_narrative"):
            require_capability(capability)
        if recipe_resolved_skills:
            for capability, (skill_name, _) in CAPABILITIES.items():
                if skill_name and skill_name in recipe_resolved_skills:
                    require_capability(capability)
        else:
            for capability in ("build_research_pack", "render_market_post", "prepare_release"):
                require_capability(capability)
    if mode in {"batch", "event_lifecycle"}:
        require_capability("plan_content_program")
    if mode in {"postmortem", "correction"}:
        require_capability("reconcile_history")

    def depends_on_capability(node: dict[str, Any], capability: str) -> bool:
        return any(dep in nodes and nodes[dep].get("capability") == capability for dep in node.get("depends_on") or [])

    def nodes_for_skill(skill_name: str) -> list[str]:
        return [node_id for node_id, node in nodes.items() if node.get("skill_name") == skill_name]

    def related(left_id: str, right_id: str) -> bool:
        left_refs = set(nodes[left_id].get("opportunity_refs") or [])
        right_refs = set(nodes[right_id].get("opportunity_refs") or [])
        return not left_refs or not right_refs or bool(left_refs & right_refs)

    def has_related_skill_ancestor(node_id: str, skill_name: str) -> bool:
        providers = [provider_id for provider_id in nodes_for_skill(skill_name) if related(node_id, provider_id)]
        return bool(providers) and any(has_path(nodes, node_id, provider_id) for provider_id in providers)

    for node_id, node in nodes.items():
        path = node_paths[node_id]
        capability = node.get("capability")
        if capability == "select_opportunities" and not depends_on_capability(node, "normalize_feed"):
            errors.append(issue("ORDER_SELECT", f"{path}.depends_on", "Selection must depend on normalization."))
        if capability == "compose_recipe":
            if not depends_on_capability(node, "normalize_feed"):
                errors.append(issue("ORDER_RECIPE", f"{path}.depends_on", "Recipe composition must depend on normalization."))
            if recipe_selection_mode == "opportunity_first" and not depends_on_capability(node, "select_opportunities"):
                errors.append(issue("ORDER_RECIPE_AFTER_SELECTION", f"{path}.depends_on", "opportunity_first recipe must depend on selection."))
        if capability == "select_opportunities" and recipe_selection_mode in {"ingredient_first", "preset_auto"} and not depends_on_capability(node, "compose_recipe"):
            errors.append(issue("ORDER_SELECTION_AFTER_RECIPE", f"{path}.depends_on", "Ingredient-first and automatic presets constrain selection through the recipe."))
        if capability == "validate_projection":
            if not depends_on_capability(node, "select_opportunities") or not depends_on_capability(node, "compose_recipe"):
                errors.append(issue("ORDER_GATE", f"{path}.depends_on", "Projection gate must depend on selection and the resolved recipe."))
        if capability == "route_narrative" and not depends_on_capability(node, "validate_projection"):
            errors.append(issue("ORDER_ROUTE", f"{path}.depends_on", "Narrative route must depend on projection validation."))
        if capability == "build_research_pack":
            if not depends_on_capability(node, "validate_projection") or not depends_on_capability(node, "route_narrative"):
                errors.append(issue("ORDER_RESEARCH", f"{path}.depends_on", "Research must depend on both gate and route."))
        if capability == "plan_content_program" and not depends_on_capability(node, "build_research_pack"):
            errors.append(issue("ORDER_PROGRAM", f"{path}.depends_on", "Program planning must depend on research."))
        if capability in {"render_market_post", "render_market_media"}:
            if not has_related_skill_ancestor(node_id, "plan-cuebook-creator-expression"):
                errors.append(issue("ORDER_RENDER", f"{path}.depends_on", "Render must descend from the shared creator expression plan."))
            if "plan_content_program" in capabilities and not depends_on_capability(node, "plan_content_program"):
                errors.append(issue("ORDER_RENDER_PROGRAM", f"{path}.depends_on", "Render must depend on the program when one exists."))
        if capability == "compile_settlement_claim":
            if not has_related_skill_ancestor(node_id, "plan-cuebook-creator-expression"):
                errors.append(issue("ORDER_SETTLEMENT_EXPRESSION", f"{path}.depends_on", "Settlement compilation must descend from the locked creator expression plan."))
        if capability == "optimize_market_geo" and not depends_on_capability(node, "optimize_market_seo"):
            errors.append(issue("ORDER_GEO", f"{path}.depends_on", "Owned-web GEO must depend on SEO."))
        if capability == "prepare_release":
            render_node_ids = {
                candidate_id for candidate_id, candidate in nodes.items()
                if candidate.get("capability") in {"render_market_post", "render_market_media"}
                or catalog_node_entries.get(candidate_id, {}).get("category_id") == "category-rendering"
                or candidate.get("capability") == "extension:custom-renderer"
            }
            if not any(dep in render_node_ids for dep in node.get("depends_on") or []):
                errors.append(issue("ORDER_RELEASE_RENDER", f"{path}.depends_on", "Release must depend on a render node."))
            for preflight in ("optimize_market_seo", "optimize_market_geo"):
                for preflight_node in capabilities.get(preflight, []):
                    if preflight_node not in (node.get("depends_on") or []):
                        errors.append(issue("ORDER_RELEASE_PREFLIGHT", f"{path}.depends_on", f"Release must depend on {preflight_node}."))
            for settlement_node in capabilities.get("compile_settlement_claim", []):
                if not has_path(nodes, node_id, settlement_node):
                    errors.append(issue("ORDER_RELEASE_SETTLEMENT", f"{path}.depends_on", f"Release must include settlement claim {settlement_node}."))
            for formula_node in capabilities.get("compile_settlement_formula", []):
                if not has_path(nodes, node_id, formula_node):
                    errors.append(issue("ORDER_RELEASE_FORMULA", f"{path}.depends_on", f"Release must include settlement formula {formula_node}."))
            for render_node_id in render_node_ids:
                if not has_path(nodes, node_id, render_node_id):
                    errors.append(issue("ORDER_RELEASE_CATALOG_RENDER", f"{path}.depends_on", f"Release must descend from catalog renderer {render_node_id}."))
        if capability == "publish_external" and not depends_on_capability(node, "prepare_release"):
            errors.append(issue("ORDER_PUBLISH", f"{path}.depends_on", "Publisher must depend on release preparation."))

    semantics_nodes = nodes_for_skill("compile-cuebook-market-view-semantics")
    expression_nodes = nodes_for_skill("plan-cuebook-creator-expression")
    data_nodes = nodes_for_skill("assemble-cuebook-viewpoint-data")
    direction_nodes = nodes_for_skill("direct-cuebook-viewpoint-visual")
    visual_nodes = nodes_for_skill("render-cuebook-viewpoint-visual")
    motion_spec_nodes = nodes_for_skill("direct-cuebook-viewpoint-motion")
    motion_nodes = nodes_for_skill("render-cuebook-viewpoint-motion")
    post_nodes = nodes_for_skill("render-cuebook-market-post")
    settlement_nodes = nodes_for_skill("compile-cuebook-settlement-claim")
    formula_nodes = nodes_for_skill("compile-cuebook-settlement-formula")
    downstream_nodes = nodes_for_skill("render-cuebook-market-media") + nodes_for_skill("assemble-cuebook-viewpoint-card")

    for semantics_node in semantics_nodes:
        related_research = [candidate for candidate in capabilities.get("build_research_pack", []) if related(semantics_node, candidate)]
        if related_research and not any(has_path(nodes, semantics_node, candidate) for candidate in related_research):
            errors.append(issue("ORDER_SEMANTICS_INPUT", f"{node_paths[semantics_node]}.depends_on", "Semantics must descend from the available research pack or use a direct creator input."))

    for expression_node in expression_nodes:
        if not has_related_skill_ancestor(expression_node, "compile-cuebook-market-view-semantics"):
            errors.append(issue("ORDER_EXPRESSION_SEMANTICS", f"{node_paths[expression_node]}.depends_on", "Expression planning must descend from market-view semantics."))
        for optional_skill in ("classify-cuebook-trading-logic", "compose-cuebook-trading-thesis"):
            for optional_node in nodes_for_skill(optional_skill):
                if related(expression_node, optional_node) and not has_path(nodes, expression_node, optional_node):
                    errors.append(issue("ORDER_EXPRESSION_ENRICHMENT", f"{node_paths[expression_node]}.depends_on", f"Expression must include optional enrichment node {optional_node}."))

    for data_node in data_nodes:
        if not has_related_skill_ancestor(data_node, "plan-cuebook-creator-expression"):
            errors.append(issue("ORDER_DATA_EXPRESSION", f"{node_paths[data_node]}.depends_on", "Viewpoint data must descend from the shared expression plan."))

    for direction_node in direction_nodes:
        if not has_related_skill_ancestor(direction_node, "plan-cuebook-creator-expression") or not has_related_skill_ancestor(direction_node, "assemble-cuebook-viewpoint-data"):
            errors.append(issue("ORDER_VISUAL_DIRECTION", f"{node_paths[direction_node]}.depends_on", "Visual direction must descend from the shared expression plan and viewpoint data."))

    for visual_node in visual_nodes:
        if not has_related_skill_ancestor(visual_node, "plan-cuebook-creator-expression") or not has_related_skill_ancestor(visual_node, "assemble-cuebook-viewpoint-data") or not has_related_skill_ancestor(visual_node, "direct-cuebook-viewpoint-visual"):
            errors.append(issue("ORDER_VISUAL_BRIDGE", f"{node_paths[visual_node]}.depends_on", "The unified visual must descend from expression, viewpoint data, and an approved visual direction set."))

    for motion_spec_node in motion_spec_nodes:
        if not has_related_skill_ancestor(motion_spec_node, "render-cuebook-viewpoint-visual"):
            errors.append(issue("ORDER_MOTION_DIRECTION", f"{node_paths[motion_spec_node]}.depends_on", "Motion direction must descend from the approved static viewpoint visual."))

    for motion_node in motion_nodes:
        if not has_related_skill_ancestor(motion_node, "direct-cuebook-viewpoint-motion") or not has_related_skill_ancestor(motion_node, "render-cuebook-viewpoint-visual"):
            errors.append(issue("ORDER_MOTION_RENDER", f"{node_paths[motion_node]}.depends_on", "Motion render must descend from its motion spec and static poster visual."))

    for data_node in data_nodes:
        for post_node in post_nodes:
            if related(data_node, post_node) and (has_path(nodes, data_node, post_node) or has_path(nodes, post_node, data_node)):
                errors.append(issue("PARALLEL_BRANCH_ORDER", "$.nodes", "Post text and viewpoint data must remain parallel children of the expression plan."))

    for formula_node in formula_nodes:
        related_claims = [candidate for candidate in settlement_nodes if related(formula_node, candidate)]
        if not related_claims or not any(has_path(nodes, formula_node, candidate) for candidate in related_claims):
            errors.append(issue("ORDER_SETTLEMENT_FORMULA", f"{node_paths[formula_node]}.depends_on", "Settlement formula must descend from its settlement claim."))

    for downstream_node in downstream_nodes:
        for prerequisite_skill in ("render-cuebook-market-post", "render-cuebook-viewpoint-visual", "render-cuebook-viewpoint-motion", "compile-cuebook-settlement-claim"):
            providers = [provider for provider in nodes_for_skill(prerequisite_skill) if related(downstream_node, provider)]
            if providers and not any(has_path(nodes, downstream_node, provider) for provider in providers):
                errors.append(issue("ORDER_DOWNSTREAM_ASSEMBLY", f"{node_paths[downstream_node]}.depends_on", f"Downstream media/card must descend from {prerequisite_skill}."))

    artifacts_raw = payload.get("artifact_registry")
    if not isinstance(artifacts_raw, list):
        errors.append(issue("ARTIFACTS_TYPE", "$.artifact_registry", "artifact_registry must be an array."))
        artifacts_raw = []
    artifacts: dict[str, dict[str, Any]] = {}
    artifact_paths: dict[str, str] = {}
    hashes: set[str] = set()
    for index, artifact in enumerate(artifacts_raw):
        path = f"$.artifact_registry[{index}]"
        if not isinstance(artifact, dict):
            errors.append(issue("ARTIFACT_TYPE", path, "Artifact must be an object."))
            continue
        artifact_id = str(artifact.get("artifact_id") or "")
        if not artifact_id.startswith("ART_"):
            errors.append(issue("ARTIFACT_ID", f"{path}.artifact_id", "Expected ART_* ID."))
        if artifact_id in artifacts:
            errors.append(issue("DUPLICATE_ARTIFACT", f"{path}.artifact_id", "Duplicate artifact ID."))
        artifacts[artifact_id] = artifact
        artifact_paths[artifact_id] = path
        artifact_type = artifact.get("artifact_type")
        content_hash = str(artifact.get("content_hash") or "")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", content_hash):
            errors.append(issue("ARTIFACT_HASH", f"{path}.content_hash", "Invalid artifact hash."))
        if content_hash in hashes:
            warnings.append(issue("DUPLICATE_ARTIFACT_HASH", f"{path}.content_hash", "Multiple artifact IDs share one payload hash."))
        hashes.add(content_hash)
        producer = artifact.get("producer_node_ref")
        if producer not in nodes:
            errors.append(issue("UNKNOWN_PRODUCER", f"{path}.producer_node_ref", "Artifact producer does not resolve."))
        elif artifact_id not in (nodes[producer].get("artifact_refs") or []):
            errors.append(issue("PRODUCER_LINK", f"{path}.producer_node_ref", "Producer node does not register this artifact."))
        parse_time(artifact.get("created_at"), f"{path}.created_at", errors)
        gate_rules = GATE_ARTIFACT_RULES.get(artifact_type)
        if gate_rules:
            summary = artifact.get("gate_summary")
            if not isinstance(summary, dict):
                errors.append(issue("GATE_SUMMARY_REQUIRED", f"{path}.gate_summary", f"{artifact_type} requires an inline gate summary."))
                continue
            for key in sorted(GATE_SUMMARY_FIELDS - set(summary)):
                errors.append(issue("GATE_SUMMARY_FIELD_REQUIRED", f"{path}.gate_summary.{key}", "Required gate-summary field is missing."))
            for key in sorted(set(summary) - GATE_SUMMARY_FIELDS):
                errors.append(issue("UNKNOWN_GATE_SUMMARY_FIELD", f"{path}.gate_summary.{key}", "Unknown gate-summary field."))
            decision = summary.get("quality_decision")
            artifact_state = summary.get("artifact_state")
            unresolved = summary.get("unresolved_material_request_count")
            if decision not in gate_rules["quality_decisions"]:
                errors.append(issue("GATE_QUALITY_DECISION", f"{path}.gate_summary.quality_decision", f"Unsupported quality decision for {artifact_type}."))
            if artifact_state not in gate_rules["artifact_states"]:
                errors.append(issue("GATE_ARTIFACT_STATE", f"{path}.gate_summary.artifact_state", f"Unsupported artifact state for {artifact_type}."))
            if not isinstance(unresolved, int) or isinstance(unresolved, bool) or unresolved < 0:
                errors.append(issue("UNRESOLVED_MATERIAL_REQUEST_COUNT", f"{path}.gate_summary.unresolved_material_request_count", "Expected a non-negative integer."))
            if artifact_type in {"CuebookQueryBundleV1", "ResearchPackV1", "ViewpointDataBundleV1"} and decision != artifact_state:
                errors.append(issue("GATE_SUMMARY_STATE_MISMATCH", f"{path}.gate_summary", f"{artifact_type} quality decision and normalized state must match."))
            if artifact_type == "CreatorExpressionPlanV1":
                valid_expression_pair = (
                    artifact_state == "draft"
                    or (decision == "conditional" and artifact_state == "conditional")
                    or (decision == "ready" and artifact_state in {"ready", "frozen"})
                )
                if not valid_expression_pair:
                    errors.append(issue("GATE_SUMMARY_STATE_MISMATCH", f"{path}.gate_summary", "Expression quality decision and artifact state are inconsistent."))
            if artifact_type == "PublishCandidateSetV1" and artifact_state != "draft" and decision != artifact_state:
                errors.append(issue("GATE_SUMMARY_STATE_MISMATCH", f"{path}.gate_summary", "Candidate-set quality decision must match its non-draft state."))

    query_bundle_refs = payload.get("query_bundle_refs")
    if not isinstance(query_bundle_refs, list):
        errors.append(issue("QUERY_BUNDLE_REFS_TYPE", "$.query_bundle_refs", "query_bundle_refs must be an array."))
        query_bundle_refs = []
    for ref in query_bundle_refs:
        if ref not in artifacts:
            errors.append(issue("UNKNOWN_QUERY_BUNDLE", "$.query_bundle_refs", f"Unknown query bundle artifact {ref!r}."))
        elif artifacts[ref].get("artifact_type") != "CuebookQueryBundleV1":
            errors.append(issue("QUERY_BUNDLE_CONTRACT", "$.query_bundle_refs", f"Artifact {ref!r} is not CuebookQueryBundleV1."))

    for node_id, node in nodes.items():
        path = node_paths[node_id]
        for ref in node.get("input_artifact_refs") or []:
            if ref not in artifacts:
                errors.append(issue("UNKNOWN_INPUT_ARTIFACT", f"{path}.input_artifact_refs", f"Unknown artifact {ref!r}."))
            else:
                producer = artifacts[ref].get("producer_node_ref")
                if producer in nodes and not has_path(nodes, node_id, producer):
                    errors.append(issue("INPUT_PRODUCER_NOT_DEPENDENCY", f"{path}.input_artifact_refs", f"Producer {producer!r} is not a dependency ancestor."))
        for ref in node.get("artifact_refs") or []:
            if ref not in artifacts:
                errors.append(issue("UNKNOWN_OUTPUT_ARTIFACT", f"{path}.artifact_refs", f"Unknown artifact {ref!r}."))
            elif artifacts[ref].get("artifact_type") != node.get("output_contract"):
                errors.append(issue("ARTIFACT_CONTRACT_MISMATCH", f"{path}.artifact_refs", "Artifact type does not match node output contract."))
        if node.get("capability") == "publish_external" and node.get("state") == "completed":
            if not any(ref in artifacts and artifacts[ref].get("artifact_type") == "PublicationReceiptV1" for ref in node.get("artifact_refs") or []):
                errors.append(issue("PUBLISH_WITHOUT_RECEIPT", path, "Completed publication requires PublicationReceiptV1."))

    def is_gated_downstream(node_id: str, node: dict[str, Any]) -> bool:
        catalog_entry = catalog_node_entries.get(node_id, {})
        capability = str(node.get("capability") or "")
        return (
            node.get("output_contract") in GATED_DOWNSTREAM_CONTRACTS
            or catalog_entry.get("category_id") == "category-rendering"
            or capability.startswith("catalog:render-")
            or capability.startswith("extension:") and "render" in capability
        )

    def transitive_input_artifacts(node: dict[str, Any]) -> set[str]:
        found: set[str] = set()
        pending = list(node.get("input_artifact_refs") or [])
        while pending:
            artifact_id = pending.pop()
            if artifact_id in found:
                continue
            found.add(artifact_id)
            artifact = artifacts.get(artifact_id)
            if artifact:
                pending.extend(artifact.get("input_artifact_refs") or [])
        return found

    for node_id, node in nodes.items():
        if not is_gated_downstream(node_id, node):
            continue
        consumed_artifacts = transitive_input_artifacts(node)
        unsafe_upstream: list[str] = []
        for artifact_id, artifact in artifacts.items():
            artifact_type = artifact.get("artifact_type")
            producer = artifact.get("producer_node_ref")
            if (
                artifact_type in GATE_ARTIFACT_RULES
                and (artifact.get("status") == "current" or artifact_id in consumed_artifacts)
                and producer in nodes
                and producer != node_id
                and related(node_id, producer)
                and has_path(nodes, node_id, producer)
                and not gate_summary_is_ready(artifact_type, artifact.get("gate_summary"))
            ):
                unsafe_upstream.append(artifact_id)
        if unsafe_upstream and node.get("state") in {"ready", "running", "completed"}:
            code = "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" if node.get("state") == "completed" else "ADVANCED_WITH_UNRESOLVED_UPSTREAM_GATE"
            errors.append(issue(code, f"{node_paths[node_id]}.state", f"Node must be blocked; upstream artifact gates are unresolved: {sorted(unsafe_upstream)}."))
        if node.get("output_contract") == "PublishCandidateSetV1" and node.get("state") == "completed":
            unsafe_outputs = [
                ref for ref in node.get("artifact_refs") or []
                if ref in artifacts
                and artifacts[ref].get("artifact_type") == "PublishCandidateSetV1"
                and not gate_summary_is_ready("PublishCandidateSetV1", artifacts[ref].get("gate_summary"))
            ]
            if unsafe_outputs:
                errors.append(issue("COMPLETED_CANDIDATE_GATE_NOT_READY", f"{node_paths[node_id]}.state", f"Candidate node must be blocked until its output is selectable: {sorted(unsafe_outputs)}."))

    approvals_raw = payload.get("approvals")
    if not isinstance(approvals_raw, list):
        errors.append(issue("APPROVALS_TYPE", "$.approvals", "approvals must be an array."))
        approvals_raw = []
    approved_release_artifacts: set[str] = set()
    approval_ids: set[str] = set()
    for index, approval in enumerate(approvals_raw):
        path = f"$.approvals[{index}]"
        if not isinstance(approval, dict):
            errors.append(issue("APPROVAL_TYPE", path, "Approval must be an object."))
            continue
        approval_id = str(approval.get("approval_id") or "")
        if approval_id in approval_ids:
            errors.append(issue("DUPLICATE_APPROVAL", f"{path}.approval_id", "Duplicate approval ID."))
        approval_ids.add(approval_id)
        decision = approval.get("decision")
        decided_at = parse_time(approval.get("decided_at"), f"{path}.decided_at", errors, nullable=True)
        if decision == "pending" and decided_at is not None:
            errors.append(issue("PENDING_DECIDED_AT", f"{path}.decided_at", "Pending approval cannot have decided_at."))
        if decision != "pending" and decided_at is None:
            errors.append(issue("DECISION_TIME", f"{path}.decided_at", "Decided approval requires decided_at."))
        versions = approval.get("artifact_versions")
        if not isinstance(versions, list) or not versions:
            errors.append(issue("APPROVAL_VERSIONS", f"{path}.artifact_versions", "Approval requires artifact versions."))
            versions = []
        for version in versions:
            if not isinstance(version, dict):
                errors.append(issue("APPROVAL_VERSION_TYPE", f"{path}.artifact_versions", "Approval version must be an object."))
                continue
            ref = version.get("artifact_ref")
            artifact = artifacts.get(ref)
            version_matches_current = False
            if artifact is None:
                errors.append(issue("UNKNOWN_APPROVAL_ARTIFACT", f"{path}.artifact_versions", f"Unknown artifact {ref!r}."))
            elif version.get("content_hash") != artifact.get("content_hash"):
                errors.append(issue("APPROVAL_HASH_MISMATCH", f"{path}.artifact_versions", "Approval hash no longer matches current registry payload."))
            elif decision == "approved" and artifact.get("status") != "current":
                errors.append(issue("APPROVED_STALE_ARTIFACT", f"{path}.artifact_versions", "Approved artifact is superseded or invalidated."))
            else:
                version_matches_current = True
            if approval.get("gate") == "release" and decision == "approved" and version_matches_current and artifact and artifact.get("artifact_type") == "ReleaseBundleV1":
                approved_release_artifacts.add(ref)

    events_raw = payload.get("state_events")
    if not isinstance(events_raw, list):
        errors.append(issue("EVENTS_TYPE", "$.state_events", "state_events must be an array."))
        events_raw = []
    events_by_node: dict[str, list[tuple[datetime, dict[str, Any], str]]] = {}
    event_ids: set[str] = set()
    for index, event in enumerate(events_raw):
        path = f"$.state_events[{index}]"
        if not isinstance(event, dict):
            errors.append(issue("EVENT_TYPE", path, "State event must be an object."))
            continue
        event_id = str(event.get("event_id") or "")
        if event_id in event_ids:
            errors.append(issue("DUPLICATE_EVENT", f"{path}.event_id", "Duplicate state event ID."))
        event_ids.add(event_id)
        node_ref = event.get("node_ref")
        if node_ref not in nodes:
            errors.append(issue("UNKNOWN_EVENT_NODE", f"{path}.node_ref", "Event node does not resolve."))
            continue
        occurred = parse_time(event.get("occurred_at"), f"{path}.occurred_at", errors)
        if occurred:
            events_by_node.setdefault(node_ref, []).append((occurred, event, path))
    for node_id, node in nodes.items():
        events = sorted(events_by_node.get(node_id, []), key=lambda entry: entry[0])
        if not events:
            errors.append(issue("NODE_EVENT_REQUIRED", node_paths[node_id], "Every node requires at least one state event."))
            continue
        previous = None
        for _, event, path in events:
            if event.get("from_state") != previous:
                errors.append(issue("EVENT_CHAIN", path, f"Expected from_state {previous!r}."))
            previous = event.get("to_state")
        if previous != node.get("state"):
            errors.append(issue("EVENT_STATE_MISMATCH", node_paths[node_id], "Folded event state does not match node state."))

    blockers_raw = payload.get("blockers")
    if not isinstance(blockers_raw, list):
        errors.append(issue("BLOCKERS_TYPE", "$.blockers", "blockers must be an array."))
        blockers_raw = []
    blocker_nodes: set[str] = set()
    blocker_ids: set[str] = set()
    for index, blocker in enumerate(blockers_raw):
        path = f"$.blockers[{index}]"
        if not isinstance(blocker, dict):
            errors.append(issue("BLOCKER_TYPE", path, "Blocker must be an object."))
            continue
        if blocker.get("blocker_id") in blocker_ids:
            errors.append(issue("DUPLICATE_BLOCKER", f"{path}.blocker_id", "Duplicate blocker ID."))
        blocker_ids.add(blocker.get("blocker_id"))
        if blocker.get("node_ref") not in nodes:
            errors.append(issue("UNKNOWN_BLOCKER_NODE", f"{path}.node_ref", "Blocker node does not resolve."))
        if blocker.get("blocking"):
            blocker_nodes.add(blocker.get("node_ref"))
    for node_id, node in nodes.items():
        if node.get("state") == "blocked" and node_id not in blocker_nodes:
            errors.append(issue("BLOCKED_WITHOUT_BLOCKER", node_paths[node_id], "Blocked node requires a blocking record."))

    workflow_state = payload.get("state")
    release_artifacts = {
        ref for node in nodes.values() if node.get("capability") == "prepare_release" and node.get("state") == "completed"
        for ref in node.get("artifact_refs") or [] if ref in artifacts and artifacts[ref].get("status") == "current"
    }
    if workflow_state == "ready_for_handoff":
        if isinstance(recipe, dict) and recipe.get("state") != "valid":
            errors.append(issue("HANDOFF_WITH_CONDITIONAL_RECIPE", "$.state", "Ready handoff requires a valid recipe revision."))
        if not release_artifacts:
            errors.append(issue("HANDOFF_WITHOUT_RELEASE", "$.state", "ready_for_handoff requires a current completed ReleaseBundleV1."))
        if not (release_artifacts & approved_release_artifacts):
            errors.append(issue("HANDOFF_WITHOUT_APPROVAL", "$.state", "Current release bundle lacks release approval."))
        if any(node.get("state") == "blocked" and node.get("blocking") for node in nodes.values()):
            errors.append(issue("HANDOFF_WITH_BLOCKER", "$.state", "Blocking nodes prevent handoff."))
        unfinished = [node_id for node_id, node in nodes.items() if node.get("blocking") and node.get("state") not in {"completed", "skipped"}]
        if unfinished:
            errors.append(issue("HANDOFF_WITH_UNFINISHED", "$.state", f"Blocking nodes unfinished: {unfinished}."))
    if workflow_state == "complete":
        unfinished = [node_id for node_id, node in nodes.items() if node.get("blocking") and node.get("state") not in {"completed", "skipped"}]
        if unfinished:
            errors.append(issue("COMPLETE_WITH_UNFINISHED", "$.state", f"Blocking nodes unfinished: {unfinished}."))
        if "publish_external" in capabilities and not any(nodes[node_id].get("state") == "completed" for node_id in capabilities["publish_external"]):
            errors.append(issue("COMPLETE_WITHOUT_PUBLICATION", "$.state", "Complete workflow with publisher node requires verified publication."))
    if workflow_state == "planned" and mode != "plan_only" and any(node.get("state") not in {"pending", "deferred"} for node in nodes.values()):
        warnings.append(issue("PLANNED_WITH_PROGRESS", "$.state", "Run is marked planned after nodes advanced."))
    if workflow_state == "blocked" and not blocker_nodes:
        errors.append(issue("BLOCKED_WITHOUT_BLOCKERS", "$.state", "Blocked workflow requires a blocking record."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."))
        quality = {}
    hard_failures = quality.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if hard_failures and quality.get("decision") != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."))
    expected_counts = {
        "nodes": len(nodes_raw), "completed": sum(n.get("state") == "completed" for n in nodes_raw if isinstance(n, dict)),
        "blocked": sum(n.get("state") == "blocked" for n in nodes_raw if isinstance(n, dict)),
        "deferred": sum(n.get("state") == "deferred" for n in nodes_raw if isinstance(n, dict)),
        "artifacts": len(artifacts_raw), "approvals_pending": sum(a.get("decision") == "pending" for a in approvals_raw if isinstance(a, dict)),
    }
    if quality.get("counts") != expected_counts:
        errors.append(issue("COUNTS", "$.quality_report.counts", f"Expected exact counts {expected_counts}."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--opportunities", type=Path)
    parser.add_argument("--recipe", type=Path)
    parser.add_argument("--catalog", type=Path)
    args = parser.parse_args()
    load = lambda path: json.loads(path.read_text(encoding="utf-8")) if path else None
    result = validate(load(args.json_file), load(args.opportunities), load(args.recipe), load(args.catalog))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
