#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT.parent
sys.path.insert(0, str(ROOT / "scripts"))
from validate_content_recipe import validate  # noqa: E402


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(module)
    return module


feed_fixture = load_module("recipe_feed_fixture", SKILLS / "normalize-cuebook-creator-feed" / "tests" / "test_validate_creator_feed.py")
opportunity_fixture = load_module("recipe_opportunity_fixture", SKILLS / "select-cuebook-content-opportunities" / "tests" / "test_validate_content_opportunities.py")
CATALOG_PATH = ROOT / "references" / "skill-catalog-v1.json"
CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
SKILL_VERSIONS = {entry["skill_id"]: entry["version"] for entry in CATALOG["skills"]}


RESOLVED = [
    "normalize-cuebook-creator-feed",
    "compose-cuebook-content-recipe",
    "select-cuebook-content-opportunities",
    "validate-cuebook-projection",
    "route-cuebook-narrative",
    "build-market-research-pack",
    "compile-cuebook-market-view-semantics",
    "plan-cuebook-creator-expression",
    "plan-market-content-program",
    "render-cuebook-market-post",
    "render-cuebook-market-media",
    "prepare-market-content-release",
    "orchestrate-cuebook-creator-workflow",
]


def base_recipe() -> dict:
    return {
        "schema_version": "content-recipe-v1",
        "recipe_id": "RECIPE_1234abcd",
        "revision": 1,
        "state": "valid",
        "catalog_version": "1.26.0",
        "created_at": "2026-07-14T12:11:00+00:00",
        "updated_at": "2026-07-14T12:12:00+00:00",
        "as_of": "2026-07-14T12:00:00+00:00",
        "decision_cutoff_at": "2026-07-14T12:00:00+00:00",
        "feed_ref": "CF_1234abcd",
        "opportunity_set_ref": "OS_1234abcd",
        "selection_mode": "opportunity_first",
        "preset_ref": "preset-cross-platform-desk",
        "anchor": {
            "opportunity_ref": "OPP_q2_revision",
            "primary_ref": "NEWS_q2",
            "title": "Q2 revision watch",
            "entity_refs": ["ENT_example"],
            "lifecycle": "pre_event",
            "horizon": "30 days",
        },
        "ingredients": {
            "news_refs": ["NEWS_q2"],
            "calendar_refs": ["CAL_call"],
            "narrative_refs": ["NAR_revision"],
            "trade_idea_refs": ["IDEA_watch"],
            "trade_history_refs": [],
            "history_use": "none",
        },
        "preparation": {
            "editorial_job": "pre_event_watch",
            "analysis_lenses": ["expectation-gap", "actor-forced", "next-catalyst"],
            "argument_shape": "scenario_tree",
            "research_mode": "fresh_required",
            "market_data_mode": "refresh_if_available",
            "source_policy": "primary_first",
            "include_countercase": True,
            "include_invalidation": False,
        },
        "flavor": {
            "profile_ref": "PROFILE_creator_v1",
            "voice_traits": ["conversational", "concrete", "trade-aware"],
            "stance": "watch",
            "certainty": "conditional",
            "density": "standard",
            "language": "zh-CN",
            "avoid_patterns": ["living-author catchphrases", "personalized orders"],
            "originality_policy": "traits_only",
            "authorship_mode": "cuebook_assisted",
            "assistance_attribution": "none",
        },
        "plating": {
            "bundle_strategy": "master_and_derivatives",
            "deliverable_mode": "release_candidates",
            "outputs": [
                {"output_id": "OUT_x_thread", "channel": "x", "format": "thread", "count": 1, "length": "standard", "media_format_ref": "FORMAT_x_thread_v1", "target_context": None},
                {"output_id": "OUT_xhs_carousel", "channel": "xiaohongshu", "format": "carousel", "count": 1, "length": "standard", "media_format_ref": "FORMAT_xhs_carousel_v1", "target_context": None},
            ],
        },
        "execution": {
            "mode": "single",
            "skill_selection_policy": "manual_plus_required",
            "selected_skill_ids": ["plan-market-content-program", "prepare-market-content-release"],
            "resolved_skill_ids": list(RESOLVED),
            "version_pins": [
                {"skill_id": skill_id, "version": SKILL_VERSIONS[skill_id]}
                for skill_id in RESOLVED
            ],
            "auto_fill_missing_research": True,
            "stop_on_conditional": False,
            "require_human_approval": True,
            "dry_run": False,
        },
        "extensions": [
            {"extension_id": "EXT_market_data_default", "extension_point": "market_data", "provider_ref": "cuebook-market-snapshot", "required": False, "config_ref": "CFG_market_default"}
        ],
        "validation_report": {
            "decision": "ready",
            "hard_failures": [],
            "warnings": [],
            "checks": ["ingredient refs", "skill resolution", "channel compatibility"],
            "counts": {"news": 1, "calendar_events": 1, "narratives": 1, "trade_ideas": 1, "trade_history": 0, "outputs": 2, "selected_skills": 2, "resolved_skills": 13, "extensions": 1},
        },
    }


def codes(result: dict, key: str = "errors") -> set[str]:
    return {entry["code"] for entry in result[key]}


def main() -> None:
    feed, opportunities = feed_fixture.base_feed(), opportunity_fixture.base_set()
    catalog = CATALOG
    cases = 0

    result = validate(base_recipe()); assert result["valid"], result; cases += 1
    result = validate(base_recipe(), feed, opportunities, catalog); assert result["valid"], result; cases += 1
    assert not ({"compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim"} & set(base_recipe()["execution"]["resolved_skill_ids"])); cases += 1

    item = base_recipe(); item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item)); cases += 1

    item = base_recipe(); item["selection_mode"] = "ingredient_first"; item["opportunity_set_ref"] = None; item["anchor"]["opportunity_ref"] = None
    result = validate(item, feed); assert result["valid"], result; cases += 1

    item = base_recipe(); item["selection_mode"] = "ingredient_first"; item["opportunity_set_ref"] = None; item["anchor"]["opportunity_ref"] = None; item["anchor"]["primary_ref"] = "NEWS_missing"
    assert "PRIMARY_INGREDIENT" in codes(validate(item)); cases += 1

    item = base_recipe(); item["anchor"]["opportunity_ref"] = None
    assert "OPPORTUNITY_ANCHOR_REQUIRED" in codes(validate(item)); cases += 1

    item = base_recipe(); item["selection_mode"] = "preset_auto"; item["preset_ref"] = None
    assert "PRESET_REQUIRED" in codes(validate(item)); cases += 1

    item = base_recipe(); item["selection_mode"] = "preset_auto"; item["anchor"]["opportunity_ref"] = None; item["opportunity_set_ref"] = None
    for field in ("news_refs", "calendar_refs", "narrative_refs", "trade_idea_refs", "trade_history_refs"):
        item["ingredients"][field] = []
    item["state"] = "conditional"; item["validation_report"]["decision"] = "conditional"
    item["validation_report"]["counts"].update({"news": 0, "calendar_events": 0, "narratives": 0, "trade_ideas": 0})
    result = validate(item, catalog=catalog); assert result["valid"], result; cases += 1

    item = base_recipe(); item["ingredients"]["trade_history_refs"] = ["TRADE_old"]; item["validation_report"]["counts"]["trade_history"] = 1
    assert "HISTORY_USE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_recipe(); item["ingredients"]["trade_history_refs"] = ["TRADE_old"]; item["ingredients"]["history_use"] = "postmortem"; item["execution"]["mode"] = "postmortem"; item["execution"]["resolved_skill_ids"].append("reconcile-market-content-history"); item["execution"]["selected_skill_ids"].append("reconcile-market-content-history"); item["execution"]["version_pins"].append({"skill_id": "reconcile-market-content-history", "version": "1.0.0"}); item["validation_report"]["counts"].update({"trade_history": 1, "selected_skills": 3, "resolved_skills": 14})
    result = validate(item, feed); assert result["valid"], result; cases += 1

    item = base_recipe(); item["execution"]["mode"] = "postmortem"
    assert "POSTMORTEM_HISTORY_REQUIRED" in codes(validate(item)); cases += 1

    item = base_recipe(); item["plating"]["outputs"][1]["output_id"] = "OUT_x_thread"
    assert "DUPLICATE_OUTPUT_ID" in codes(validate(item)); cases += 1

    item = base_recipe(); item["plating"]["outputs"][0]["format"] = "carousel"
    assert "CHANNEL_FORMAT" in codes(validate(item)); cases += 1

    item = base_recipe(); item["plating"]["outputs"] = [{"output_id": "OUT_viewpoint", "channel": "generic", "format": "viewpoint_card", "count": 1, "length": "standard", "media_format_ref": None, "target_context": None}]; item["validation_report"]["counts"]["outputs"] = 1
    assert "REQUIRED_SKILL_MISSING" in codes(validate(item)); cases += 1

    item = base_recipe(); item["plating"]["outputs"] = [{"output_id": "OUT_sa", "channel": "seeking_alpha_internal", "format": "article_outline", "count": 1, "length": "long", "media_format_ref": None, "target_context": None}]; item["validation_report"]["counts"]["outputs"] = 1
    assert "SEEKING_ALPHA_INTERNAL_ONLY" in codes(validate(item)); cases += 1

    item = base_recipe(); item["execution"]["resolved_skill_ids"].remove("render-cuebook-market-media"); item["execution"]["version_pins"] = [pin for pin in item["execution"]["version_pins"] if pin["skill_id"] != "render-cuebook-market-media"]; item["validation_report"]["counts"]["resolved_skills"] = 12
    assert "REQUIRED_SKILL_MISSING" in codes(validate(item)); cases += 1

    item = base_recipe(); item["execution"]["resolved_skill_ids"].remove("plan-market-content-program"); item["execution"]["version_pins"] = [pin for pin in item["execution"]["version_pins"] if pin["skill_id"] != "plan-market-content-program"]; item["validation_report"]["counts"]["resolved_skills"] = 12
    result = validate(item); assert "SELECTED_SKILL_UNRESOLVED" in codes(result) and "REQUIRED_SKILL_MISSING" in codes(result); cases += 1

    item = base_recipe(); item["execution"]["resolved_skill_ids"].append("optimize-cuebook-market-geo"); item["execution"]["version_pins"].append({"skill_id": "optimize-cuebook-market-geo", "version": "1.0.0"}); item["validation_report"]["counts"]["resolved_skills"] = 14
    assert "GEO_REQUIRES_SEO" in codes(validate(item)); cases += 1

    item = base_recipe(); item["execution"]["version_pins"][0]["skill_id"] = "unknown-skill"
    assert "PIN_UNRESOLVED_SKILL" in codes(validate(item)); cases += 1

    item = base_recipe(); item["execution"]["version_pins"] = item["execution"]["version_pins"][1:]
    assert "MISSING_VERSION_PIN" in codes(validate(item)); cases += 1

    item = base_recipe(); item["execution"]["version_pins"].append(copy.deepcopy(item["execution"]["version_pins"][0]))
    assert "DUPLICATE_VERSION_PIN" in codes(validate(item)); cases += 1

    item = base_recipe(); item["feed_ref"] = "CF_deadbeef"
    assert "FEED_REF_MISMATCH" in codes(validate(item, feed)); cases += 1

    item = base_recipe(); item["ingredients"]["news_refs"] = ["NEWS_missing"]
    assert "UNKNOWN_INGREDIENT" in codes(validate(item, feed)); cases += 1

    item = base_recipe(); feed_late = copy.deepcopy(feed); feed_late["news"][0]["available_at"] = "2026-07-14T12:01:00+00:00"
    assert "POST_CUTOFF_INGREDIENT" in codes(validate(item, feed_late)); cases += 1

    item = base_recipe(); item["anchor"]["opportunity_ref"] = "OPP_missing"
    assert "UNKNOWN_SELECTED_OPPORTUNITY" in codes(validate(item, opportunities=opportunities)); cases += 1

    item = base_recipe(); item["validation_report"]["counts"]["news"] = 9
    assert "COUNTS" in codes(validate(item)); cases += 1

    item = base_recipe(); item["flavor"]["assistance_attribution"] = "natural"
    assert "ASSISTANCE_ATTRIBUTION" in codes(validate(item)); cases += 1

    if catalog is not None:
        item = base_recipe(); item["catalog_version"] = "9.9.9"
        assert "CATALOG_VERSION_MISMATCH" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["execution"]["selected_skill_ids"].append("validate-cuebook-projection"); item["validation_report"]["counts"]["selected_skills"] = 3
        assert "SKILL_NOT_USER_SELECTABLE" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["ingredients"]["narrative_refs"] = []; item["validation_report"]["counts"]["narratives"] = 0
        assert "PRESET_INGREDIENT_MIN" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["execution"]["selected_skill_ids"].append("distill-market-media-format"); item["execution"]["resolved_skill_ids"].append("distill-market-media-format"); item["execution"]["version_pins"].append({"skill_id": "distill-market-media-format", "version": "1.0.0"}); item["validation_report"]["counts"].update({"selected_skills": 3, "resolved_skills": 14})
        assert "SKILL_MODE_UNSUPPORTED" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["execution"]["resolved_skill_ids"].remove("compile-cuebook-market-view-semantics"); item["execution"]["version_pins"] = [pin for pin in item["execution"]["version_pins"] if pin["skill_id"] != "compile-cuebook-market-view-semantics"]; item["validation_report"]["counts"]["resolved_skills"] = 12
        assert "RESOLVED_DEPENDENCY_MISSING" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["execution"]["version_pins"][0]["version"] = "9.9.9"
        assert "SKILL_VERSION_MISMATCH" in codes(validate(item, catalog=catalog)); cases += 1

        item = base_recipe(); item["preset_ref"] = "preset-viewpoint-card"; item["selection_mode"] = "ingredient_first"; item["opportunity_set_ref"] = None; item["anchor"]["opportunity_ref"] = None; item["plating"]["bundle_strategy"] = "independent"; item["plating"]["outputs"] = [{"output_id": "OUT_viewpoint", "channel": "generic", "format": "viewpoint_card", "count": 1, "length": "standard", "media_format_ref": None, "target_context": None}]
        for skill_id in ("assemble-cuebook-viewpoint-data", "direct-cuebook-viewpoint-visual", "render-cuebook-viewpoint-visual", "assemble-cuebook-viewpoint-card"):
            item["execution"]["resolved_skill_ids"].append(skill_id)
            item["execution"]["version_pins"].append({"skill_id": skill_id, "version": SKILL_VERSIONS[skill_id]})
        item["execution"]["selected_skill_ids"].append("render-cuebook-viewpoint-visual")
        item["validation_report"]["counts"].update({"outputs": 1, "selected_skills": 3, "resolved_skills": 17})
        result = validate(item, feed, catalog=catalog); assert result["valid"], result; cases += 1

        item = base_recipe(); item["preset_ref"] = "preset-publish-candidates"; item["selection_mode"] = "ingredient_first"; item["opportunity_set_ref"] = None; item["anchor"]["opportunity_ref"] = None; item["plating"]["bundle_strategy"] = "independent"; item["plating"]["outputs"] = [{"output_id": "OUT_candidates", "channel": "generic", "format": "publish_candidate_set", "count": 3, "length": "short", "media_format_ref": None, "target_context": None}]
        catalog_skills = {entry["skill_id"]: entry for entry in catalog["skills"]}
        candidate_preset = next(preset for preset in catalog["presets"] if preset["preset_id"] == "preset-publish-candidates")
        required = set(item["execution"]["resolved_skill_ids"]); pending = list(candidate_preset["required_skill_ids"])
        while pending:
            skill_id = pending.pop()
            if skill_id in required:
                continue
            required.add(skill_id); pending.extend(catalog_skills[skill_id]["requires_all"])
        item["execution"]["resolved_skill_ids"] = list(dict.fromkeys(item["execution"]["resolved_skill_ids"] + sorted(required)))
        item["execution"]["version_pins"] = [{"skill_id": skill_id, "version": SKILL_VERSIONS[skill_id]} for skill_id in item["execution"]["resolved_skill_ids"]]
        item["validation_report"]["counts"].update({"outputs": 1, "resolved_skills": len(item["execution"]["resolved_skill_ids"])})
        result = validate(item, feed, catalog=catalog); assert result["valid"], result; cases += 1

        custom_catalog = copy.deepcopy(catalog)
        custom_skill = copy.deepcopy(next(entry for entry in custom_catalog["skills"] if entry["skill_id"] == "render-cuebook-market-media"))
        custom_skill.update({"skill_id": "render-custom-email", "display_name": "Render Custom Email", "description": "Render a registered custom email package.", "visibility": "selectable", "user_selectable": True, "default_enabled": False, "capabilities": ["render-custom-email"], "output_contract": "EmailPackageV1", "requires_all": ["build-market-research-pack"], "supported_channels": ["custom:email"]})
        custom_skill["ui"].update({"order": max(entry["ui"]["order"] for entry in custom_catalog["skills"]) + 1, "control_type": "toggle", "summary": "Render custom email."})
        custom_catalog["skills"].append(custom_skill)
        item = base_recipe(); item["plating"]["outputs"].append({"output_id": "OUT_email", "channel": "custom:email", "format": "newsletter", "count": 1, "length": "standard", "media_format_ref": None, "target_context": "subscribers"}); item["execution"]["selected_skill_ids"].append("render-custom-email"); item["execution"]["resolved_skill_ids"].append("render-custom-email"); item["execution"]["version_pins"].append({"skill_id": "render-custom-email", "version": "1.0.0"}); item["validation_report"]["counts"].update({"outputs": 3, "selected_skills": 3, "resolved_skills": 14})
        result = validate(item, catalog=custom_catalog); assert result["valid"], result; cases += 1

        item["execution"]["selected_skill_ids"].remove("render-custom-email"); item["execution"]["resolved_skill_ids"].remove("render-custom-email"); item["execution"]["version_pins"] = [pin for pin in item["execution"]["version_pins"] if pin["skill_id"] != "render-custom-email"]; item["validation_report"]["counts"].update({"selected_skills": 2, "resolved_skills": 13})
        assert "CUSTOM_RENDERER_SKILL_MISSING" in codes(validate(item, catalog=custom_catalog)); cases += 1

    item = base_recipe(); item["plating"]["outputs"].append({"output_id": "OUT_custom", "channel": "custom:newsletter", "format": "digest", "count": 1, "length": "standard", "media_format_ref": None, "target_context": None}); item["validation_report"]["counts"]["outputs"] = 3
    assert "CUSTOM_RENDERER_REQUIRED" in codes(validate(item)); cases += 1

    item["extensions"].append({"extension_id": "EXT_custom_renderer", "extension_point": "custom_renderer", "provider_ref": "renderer-newsletter-v1", "required": False, "config_ref": None}); item["validation_report"]["counts"]["extensions"] = 2
    assert "CUSTOM_RENDERER_NOT_REQUIRED" in codes(validate(item)); cases += 1

    item["extensions"][-1]["required"] = True
    result = validate(item); assert result["valid"], result; cases += 1

    print(f"ok: {cases} content recipe cases")


if __name__ == "__main__":
    main()
