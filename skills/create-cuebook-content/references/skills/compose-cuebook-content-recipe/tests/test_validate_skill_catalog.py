#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_skill_catalog import validate  # noqa: E402


CATALOG_PATH = ROOT / "references" / "skill-catalog-v1.json"


def base_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def codes(result: dict, key: str = "errors") -> set[str]:
    return {entry["code"] for entry in result[key]}


def skill(catalog: dict, skill_id: str) -> dict:
    return next(item for item in catalog["skills"] if item["skill_id"] == skill_id)


def ancestors(catalog: dict, skill_id: str) -> set[str]:
    found: set[str] = set()
    pending = list(skill(catalog, skill_id)["requires_all"])
    while pending:
        dependency = pending.pop()
        if dependency in found:
            continue
        found.add(dependency)
        pending.extend(skill(catalog, dependency)["requires_all"])
    return found


def main() -> None:
    cases = 0
    catalog = base_catalog(); result = validate(catalog); assert result["valid"], result; cases += 1
    assert catalog["catalog_version"] == "1.27.0"; cases += 1
    query_entrypoint = skill(catalog, "query-cuebook")
    create_entrypoint = skill(catalog, "create-cuebook-content")
    assert query_entrypoint["output_contract"] == "CuebookQueryBundleV1"
    assert query_entrypoint["requires_all"] == []
    assert query_entrypoint["ui"]["surface"] == "query"
    assert create_entrypoint["output_contract"] == "CuebookCreationBundleV1"
    assert create_entrypoint["requires_all"] == ["orchestrate-cuebook-creator-workflow"]
    assert "CuebookQueryBundleV1" in create_entrypoint["input_contracts"]; cases += 1

    bridge = [
        ("compile-cuebook-market-view-semantics", "MarketViewSemanticsV1"),
        ("plan-cuebook-creator-expression", "CreatorExpressionPlanV1"),
        ("assemble-cuebook-viewpoint-data", "ViewpointDataBundleV1"),
        ("direct-cuebook-viewpoint-visual", "VisualDirectionSetV1"),
        ("render-cuebook-viewpoint-visual", "ViewpointVisualV1"),
    ]
    assert all(skill(catalog, skill_id)["output_contract"] == contract for skill_id, contract in bridge)
    assert all(skill(catalog, skill_id)["execution"] == "installed" for skill_id, _ in bridge)
    assert all(skill(catalog, skill_id)["visibility"] == "automatic" for skill_id, _ in bridge[:4])
    assert all(skill(catalog, skill_id)["ui"]["control_type"] == "hidden" for skill_id, _ in bridge[:4])
    visual_director = skill(catalog, "direct-cuebook-viewpoint-visual")
    data_assembler = skill(catalog, "assemble-cuebook-viewpoint-data")
    assert data_assembler["version"] == "1.5.0"
    assert "route hash" in data_assembler["description"]
    assert visual_director["version"] == "2.5.0"
    assert "direct-cuebook-viewpoint-visual/references/viewpoint-expression-registry-v1.json" in visual_director["maintenance"]["schema_refs"]
    assert skill(catalog, "render-cuebook-viewpoint-visual")["user_selectable"] is True
    for skill_id in ("direct-cuebook-viewpoint-motion", "render-cuebook-viewpoint-motion"):
        deferred = skill(catalog, skill_id)
        assert deferred["status"] == "disabled"
        assert deferred["execution"] == "deferred"
        assert deferred["visibility"] == "internal"
        assert deferred["user_selectable"] is False
        assert deferred["ui"]["control_type"] == "hidden"
    semantics = skill(catalog, "compile-cuebook-market-view-semantics")
    assert semantics["requires_all"] == []
    assert {"ResearchPackV1", "CreatorViewIntentV1", "CorpusV1"}.issubset(semantics["input_contracts"])
    assert {
        "compile-cuebook-market-view-semantics",
        "plan-cuebook-creator-expression",
        "assemble-cuebook-viewpoint-data",
        "direct-cuebook-viewpoint-visual",
    }.issubset(ancestors(catalog, "render-cuebook-viewpoint-visual")); cases += 1
    viewpoint_preset = next(preset for preset in catalog["presets"] if preset["preset_id"] == "preset-viewpoint-card")
    assert "render-cuebook-viewpoint-motion" not in viewpoint_preset["optional_skill_ids"]
    assert all(
        "render-cuebook-viewpoint-motion" not in preset["required_skill_ids"] + preset["optional_skill_ids"]
        for preset in catalog["presets"]
    ); cases += 1

    legacy_visuals = {
        "render-cuebook-logic-card", "render-cuebook-market-figure",
        "render-cuebook-market-signal",
    }
    preset_skills = {
        skill_id for preset in catalog["presets"]
        for skill_id in preset["required_skill_ids"] + preset["optional_skill_ids"]
    }
    assert all(skill(catalog, skill_id)["visibility"] == "internal" for skill_id in legacy_visuals)
    assert all(skill(catalog, skill_id)["user_selectable"] is False for skill_id in legacy_visuals)
    assert not (legacy_visuals & preset_skills); cases += 1

    thesis_chart = skill(catalog, "render-cuebook-thesis-chart")
    assert thesis_chart["visibility"] == "automatic"
    assert thesis_chart["user_selectable"] is False
    assert thesis_chart["replaced_by"] is None
    assert thesis_chart["requires_all"] == ["assemble-cuebook-viewpoint-data"]
    assert {"ViewpointDataBundleV1", "MarketSeriesBatchV1"}.issubset(thesis_chart["input_contracts"])
    candidate_preset = next(preset for preset in catalog["presets"] if preset["preset_id"] == "preset-publish-candidates")
    assert "render-cuebook-thesis-chart" in candidate_preset["optional_skill_ids"]
    assert "render-cuebook-thesis-chart" not in candidate_preset["required_skill_ids"]; cases += 1

    item = base_catalog(); item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["categories"][1]["category_id"] = item["categories"][0]["category_id"]
    assert "DUPLICATE_CATEGORY" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["categories"][1]["order"] = item["categories"][0]["order"]
    assert "DUPLICATE_CATEGORY_ORDER" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); duplicate = copy.deepcopy(item["skills"][0]); item["skills"].append(duplicate)
    assert "DUPLICATE_SKILL" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["skills"][0]["category_id"] = "category-missing"
    assert "UNKNOWN_CATEGORY" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "plan-market-content-program")["user_selectable"] = False
    assert "SELECTABLE_FLAG" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "compose-cuebook-content-recipe")["ui"]["control_type"] = "toggle"
    assert "AUTOMATIC_VISIBLE_CONTROL" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "validate-cuebook-projection")["ui"]["surface"] = "creator"
    assert "INTERNAL_SURFACE" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "compose-cuebook-content-recipe")["maintenance"]["stability"] = "stable"
    assert "STABILITY_MISMATCH" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "compose-cuebook-content-recipe")["maintenance"]["skill_path"] = "/tmp/missing-recipe-skill"
    assert "SKILL_PATH_INVALID" in codes(validate(item)); cases += 1

    item = base_catalog(); skill(item, "compose-cuebook-content-recipe")["maintenance"]["schema_refs"] = []
    assert "MAINTENANCE_ARTIFACT_REQUIRED" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "compose-cuebook-content-recipe")["requires_all"] = ["unknown-skill"]
    assert "UNKNOWN_DEPENDENCY" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "render-cuebook-market-post")["input_contracts"].remove("CreatorExpressionPlanV1")
    assert "DEPENDENCY_CONTRACT_MISSING" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "render-cuebook-market-post")["requires_all"].append("plan-cuebook-creator-expression")
    assert "DUPLICATE_DEPENDENCY" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "normalize-cuebook-creator-feed")["requires_all"] = ["orchestrate-cuebook-creator-workflow"]; skill(item, "orchestrate-cuebook-creator-workflow")["requires_all"] = ["normalize-cuebook-creator-feed"]
    assert "DEPENDENCY_CYCLE" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["ingredient_limits"]["news_refs"] = {"min": 5, "max": 1}
    assert "INGREDIENT_RANGE" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["required_skill_ids"].append("unknown-skill")
    assert "UNKNOWN_PRESET_SKILL" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["optional_skill_ids"].append("build-market-research-pack")
    assert "PRESET_SKILL_OVERLAP" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["default_outputs"][0]["format"] = "carousel"
    assert "PRESET_CHANNEL_FORMAT" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["required_skill_ids"].remove("render-cuebook-market-post")
    assert "PRESET_POST_RENDERER" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); earnings = next(preset for preset in item["presets"] if preset["preset_id"] == "preset-earnings-preview"); earnings["required_skill_ids"].remove("optimize-cuebook-market-seo")
    assert "PRESET_OWNED_WEB_SEO" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["presets"][0]["required_skill_ids"].remove("plan-market-content-program")
    assert "PRESET_PROGRAM_REQUIRED" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); thesis_preset = next(preset for preset in item["presets"] if preset["preset_id"] == "preset-settleable-thesis"); thesis_preset["default_analysis_lenses"].append("resolution-contract"); thesis_preset["optional_skill_ids"].remove("compose-cuebook-trading-thesis")
    assert "PRESET_THESIS_PROTOCOL_REQUIRED" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); thesis_preset = next(preset for preset in item["presets"] if preset["preset_id"] == "preset-settleable-thesis"); thesis_preset["required_skill_ids"].remove("compile-cuebook-settlement-claim")
    assert "PRESET_SETTLEMENT_COMPILER_REQUIRED" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); viewpoint_preset = next(preset for preset in item["presets"] if preset["preset_id"] == "preset-viewpoint-card"); viewpoint_preset["required_skill_ids"].remove("assemble-cuebook-viewpoint-card")
    assert "PRESET_VIEWPOINT_ASSEMBLER" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); viewpoint_preset = next(preset for preset in item["presets"] if preset["preset_id"] == "preset-viewpoint-card"); viewpoint_preset["required_skill_ids"].remove("render-cuebook-viewpoint-visual")
    assert "PRESET_VIEWPOINT_VISUAL" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); skill(item, "compile-cuebook-settlement-claim")["supported_modes"] = ["batch"]
    assert "PRESET_MODE_UNSUPPORTED" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); item["extension_points"].append(copy.deepcopy(item["extension_points"][0]))
    assert "DUPLICATE_EXTENSION_POINT" in codes(validate(item, check_files=False)); cases += 1

    item = base_catalog(); custom_skill = copy.deepcopy(skill(item, "render-cuebook-market-media")); custom_skill.update({"skill_id": "render-custom-email", "display_name": "Render Custom Email", "description": "Render a custom email package.", "visibility": "selectable", "user_selectable": True, "default_enabled": False, "capabilities": ["render-custom-email"], "output_contract": "EmailPackageV1", "requires_all": ["build-market-research-pack"], "supported_channels": ["custom:email"]}); custom_skill["ui"].update({"order": max(entry["ui"]["order"] for entry in item["skills"]) + 1, "control_type": "toggle", "summary": "Render custom email."}); item["skills"].append(custom_skill); custom_preset = copy.deepcopy(item["presets"][0]); custom_preset.update({"preset_id": "preset-custom-email", "name": "Custom email", "description": "Render a registered custom email.", "default_outputs": [{"channel": "custom:email", "format": "newsletter", "count": 1, "length": "standard"}], "required_skill_ids": ["build-market-research-pack", "render-custom-email", "prepare-market-content-release"], "optional_skill_ids": []}); item["presets"].append(custom_preset)
    result = validate(item, check_files=False); assert result["valid"], result; cases += 1

    item["presets"][-1]["required_skill_ids"].remove("render-custom-email")
    assert "PRESET_CUSTOM_RENDERER" in codes(validate(item, check_files=False)); cases += 1

    print(f"ok: {cases} skill catalog cases")


if __name__ == "__main__":
    main()
