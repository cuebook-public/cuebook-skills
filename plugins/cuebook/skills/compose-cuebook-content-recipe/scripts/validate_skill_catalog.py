#!/usr/bin/env python3
"""Validate SkillCatalogV1 dependencies, UI exposure, and maintenance metadata."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_SKILLS_ROOT = Path(__file__).resolve().parents[2]
ROOT_FIELDS = {"schema_version", "catalog_id", "catalog_version", "generated_at", "default_locale", "categories", "skills", "presets", "extension_points", "maintenance_policy"}
SEMVER = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
CHANNEL_FORMATS = {
    "x": {"short_post", "thread"}, "telegram": {"short_post", "long_post"},
    "xiaohongshu": {"caption", "carousel"}, "reddit": {"post", "comment"},
    "owned_web": {"article", "brief"}, "seeking_alpha_internal": {"article_outline"},
    "buy_side_note": {"note"}, "short_video": {"script"}, "douyin": {"short_video_script"},
    "generic": {"text", "viewpoint_card", "publish_candidate_set"},
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
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


def has_cycle(skills: dict[str, dict[str, Any]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(skill_id: str) -> bool:
        if skill_id in visiting:
            return True
        if skill_id in visited:
            return False
        visiting.add(skill_id)
        for dependency in skills.get(skill_id, {}).get("requires_all", []):
            if dependency in skills and visit(dependency):
                return True
        visiting.remove(skill_id)
        visited.add(skill_id)
        return False

    return any(visit(skill_id) for skill_id in skills)


def validate(payload: Any, check_files: bool = True, skills_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    skills_root = skills_root or DEFAULT_SKILLS_ROOT

    def local_path(locator: str) -> Path:
        path = Path(locator)
        return path if path.is_absolute() else skills_root / path
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "SkillCatalogV1 must be an object.")], "warnings": []}
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "skill-catalog-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected skill-catalog-v1."))
    if not SEMVER.fullmatch(str(payload.get("catalog_version") or "")):
        errors.append(issue("CATALOG_VERSION", "$.catalog_version", "Catalog version must be semantic versioning."))
    parse_time(payload.get("generated_at"), "$.generated_at", errors)

    categories_raw = payload.get("categories")
    if not isinstance(categories_raw, list) or not categories_raw:
        errors.append(issue("CATEGORIES_TYPE", "$.categories", "categories must be a non-empty array."))
        categories_raw = []
    category_ids: set[str] = set()
    category_orders: set[int] = set()
    for index, category in enumerate(categories_raw):
        path = f"$.categories[{index}]"
        if not isinstance(category, dict):
            errors.append(issue("CATEGORY_TYPE", path, "Category must be an object."))
            continue
        category_id, order = category.get("category_id"), category.get("order")
        if category_id in category_ids:
            errors.append(issue("DUPLICATE_CATEGORY", f"{path}.category_id", "Category IDs must be unique."))
        category_ids.add(category_id)
        if order in category_orders:
            errors.append(issue("DUPLICATE_CATEGORY_ORDER", f"{path}.order", "Category order values must be unique."))
        category_orders.add(order)

    policy = payload.get("maintenance_policy")
    if not isinstance(policy, dict):
        errors.append(issue("MAINTENANCE_POLICY_TYPE", "$.maintenance_policy", "maintenance_policy must be an object."))
        policy = {}

    skills_raw = payload.get("skills")
    if not isinstance(skills_raw, list) or not skills_raw:
        errors.append(issue("SKILLS_TYPE", "$.skills", "skills must be a non-empty array."))
        skills_raw = []
    skills: dict[str, dict[str, Any]] = {}
    skill_paths: dict[str, str] = {}
    ui_orders: set[int] = set()
    for index, skill in enumerate(skills_raw):
        path = f"$.skills[{index}]"
        if not isinstance(skill, dict):
            errors.append(issue("SKILL_TYPE", path, "Skill entry must be an object."))
            continue
        skill_id = str(skill.get("skill_id") or "")
        if skill_id in skills:
            errors.append(issue("DUPLICATE_SKILL", f"{path}.skill_id", "Skill IDs must be unique."))
        skills[skill_id] = skill
        skill_paths[skill_id] = path
        if not SEMVER.fullmatch(str(skill.get("version") or "")):
            errors.append(issue("SKILL_VERSION", f"{path}.version", "Skill version must use semantic versioning."))
        if skill.get("category_id") not in category_ids:
            errors.append(issue("UNKNOWN_CATEGORY", f"{path}.category_id", "Skill category does not resolve."))
        visibility, selectable = skill.get("visibility"), skill.get("user_selectable")
        ui = skill.get("ui") if isinstance(skill.get("ui"), dict) else {}
        if visibility == "selectable" and selectable is not True:
            errors.append(issue("SELECTABLE_FLAG", f"{path}.user_selectable", "Selectable visibility requires user_selectable true."))
        if visibility != "selectable" and selectable is not False:
            errors.append(issue("INTERNAL_SELECTABLE", f"{path}.user_selectable", "Automatic and internal skills cannot be user selectable."))
        if visibility == "selectable" and ui.get("control_type") == "hidden":
            errors.append(issue("SELECTABLE_HIDDEN", f"{path}.ui.control_type", "Selectable skills require a visible control."))
        if visibility in {"automatic", "internal"} and ui.get("control_type") != "hidden":
            errors.append(issue("AUTOMATIC_VISIBLE_CONTROL", f"{path}.ui.control_type", "Automatic and internal skills use hidden controls."))
        if visibility == "internal" and ui.get("surface") != "internal":
            errors.append(issue("INTERNAL_SURFACE", f"{path}.ui.surface", "Internal skills belong on the internal surface."))
        order = ui.get("order")
        if order in ui_orders:
            errors.append(issue("DUPLICATE_UI_ORDER", f"{path}.ui.order", "Skill UI order values must be unique."))
        ui_orders.add(order)
        maintenance = skill.get("maintenance") if isinstance(skill.get("maintenance"), dict) else {}
        parse_time(maintenance.get("last_verified_at"), f"{path}.maintenance.last_verified_at", errors)
        if skill.get("status") in {"stable", "beta", "experimental"} and maintenance.get("stability") != skill.get("status"):
            errors.append(issue("STABILITY_MISMATCH", f"{path}.maintenance.stability", "Maintenance stability must match active status."))
        if skill.get("status") in {"deprecated", "disabled"} and skill.get("default_enabled"):
            errors.append(issue("UNAVAILABLE_DEFAULT", f"{path}.default_enabled", "Unavailable skills cannot be enabled by default."))
        if skill.get("status") == "deprecated" and not skill.get("replaced_by"):
            warnings.append(issue("DEPRECATED_WITHOUT_REPLACEMENT", f"{path}.replaced_by", "Deprecated skill has no replacement."))
        channels = skill.get("supported_channels")
        if isinstance(channels, list) and "all" in channels and len(channels) > 1:
            errors.append(issue("ALL_CHANNELS_MIXED", f"{path}.supported_channels", "Use all alone or list concrete channels."))
        if skill.get("execution") == "installed":
            skill_path = maintenance.get("skill_path")
            if not isinstance(skill_path, str):
                errors.append(issue("INSTALLED_PATH", f"{path}.maintenance.skill_path", "Installed skill requires a local path."))
            elif check_files:
                directory = local_path(skill_path)
                if not directory.is_dir() or directory.name != skill_id or not (directory / "SKILL.md").is_file():
                    errors.append(issue("SKILL_PATH_INVALID", f"{path}.maintenance.skill_path", "Skill path must contain a matching SKILL.md directory."))
        for key, required in (("schema_refs", policy.get("require_schema")), ("validator_refs", policy.get("require_validator")), ("test_refs", policy.get("require_tests"))):
            value = maintenance.get(key)
            if required and (value is None or value == []):
                errors.append(issue("MAINTENANCE_ARTIFACT_REQUIRED", f"{path}.maintenance.{key}", f"{key} is required."))
            refs = value if isinstance(value, list) else []
            if check_files:
                for ref in refs:
                    if not local_path(ref).is_file():
                        errors.append(issue("MAINTENANCE_ARTIFACT_MISSING", f"{path}.maintenance.{key}", f"Missing file {ref!r}."))

    for skill_id, skill in skills.items():
        path = skill_paths[skill_id]
        dependencies = skill.get("requires_all")
        if not isinstance(dependencies, list):
            errors.append(issue("DEPENDENCIES_TYPE", f"{path}.requires_all", "requires_all must be an array."))
            dependencies = []
        elif len(dependencies) != len(set(dependencies)):
            errors.append(issue("DUPLICATE_DEPENDENCY", f"{path}.requires_all", "Dependencies must be unique."))
        input_contracts = skill.get("input_contracts") if isinstance(skill.get("input_contracts"), list) else []
        for dependency in dependencies:
            if dependency == skill_id:
                errors.append(issue("SELF_DEPENDENCY", f"{path}.requires_all", "Skill cannot depend on itself."))
            elif dependency not in skills:
                errors.append(issue("UNKNOWN_DEPENDENCY", f"{path}.requires_all", f"Unknown skill {dependency!r}."))
            else:
                dependency_contract = skills[dependency].get("output_contract")
                if dependency_contract not in input_contracts:
                    errors.append(issue(
                        "DEPENDENCY_CONTRACT_MISSING",
                        f"{path}.input_contracts",
                        f"Dependency {dependency!r} provides {dependency_contract!r}, which is not accepted as input.",
                    ))
        replacement = skill.get("replaced_by")
        if replacement and replacement not in skills:
            errors.append(issue("UNKNOWN_REPLACEMENT", f"{path}.replaced_by", "Replacement skill does not resolve."))
    if has_cycle(skills):
        errors.append(issue("DEPENDENCY_CYCLE", "$.skills", "Skill dependency graph contains a cycle."))

    presets_raw = payload.get("presets")
    if not isinstance(presets_raw, list):
        errors.append(issue("PRESETS_TYPE", "$.presets", "presets must be an array."))
        presets_raw = []
    preset_ids: set[str] = set()
    for index, preset in enumerate(presets_raw):
        path = f"$.presets[{index}]"
        if not isinstance(preset, dict):
            errors.append(issue("PRESET_TYPE", path, "Preset must be an object."))
            continue
        preset_id = preset.get("preset_id")
        if preset_id in preset_ids:
            errors.append(issue("DUPLICATE_PRESET", f"{path}.preset_id", "Preset IDs must be unique."))
        preset_ids.add(preset_id)
        limits = preset.get("ingredient_limits") if isinstance(preset.get("ingredient_limits"), dict) else {}
        for field, bounds in limits.items():
            if isinstance(bounds, dict) and bounds.get("min", 0) > bounds.get("max", 0):
                errors.append(issue("INGREDIENT_RANGE", f"{path}.ingredient_limits.{field}", "Minimum cannot exceed maximum."))
        required = set(preset.get("required_skill_ids") or [])
        optional = set(preset.get("optional_skill_ids") or [])
        default_mode = preset.get("default_execution_mode")
        analysis_lenses = set(preset.get("default_analysis_lenses") or [])
        if required & optional:
            errors.append(issue("PRESET_SKILL_OVERLAP", path, "Required and optional skill sets must be disjoint."))
        for skill_id in required | optional:
            if skill_id not in skills:
                errors.append(issue("UNKNOWN_PRESET_SKILL", path, f"Unknown skill {skill_id!r}."))
            elif skills[skill_id].get("status") in {"deprecated", "disabled"}:
                errors.append(issue("UNAVAILABLE_PRESET_SKILL", path, f"Preset references unavailable skill {skill_id!r}."))
        for skill_id in required:
            supported_modes = set(skills.get(skill_id, {}).get("supported_modes") or [])
            if skill_id in skills and default_mode not in supported_modes:
                errors.append(issue("PRESET_MODE_UNSUPPORTED", path, f"Required skill {skill_id!r} does not support mode {default_mode!r}."))
        if "resolution-contract" in analysis_lenses and "compose-cuebook-trading-thesis" not in required:
            errors.append(issue("PRESET_THESIS_PROTOCOL_REQUIRED", path, "A resolution-contract preset requires the trading-thesis composer."))
        if analysis_lenses & {"resolution-contract", "settlement-claim"} and "compile-cuebook-settlement-claim" not in required:
            errors.append(issue("PRESET_SETTLEMENT_COMPILER_REQUIRED", path, "A settlement-claim or resolution-contract preset requires the settlement-claim compiler."))
        if analysis_lenses & {"resolution-contract", "settlement-claim"} and "compile-cuebook-settlement-formula" not in required:
            errors.append(issue("PRESET_SETTLEMENT_FORMULA_REQUIRED", path, "A settleable preset requires the executable settlement-formula compiler."))
        outputs = preset.get("default_outputs") if isinstance(preset.get("default_outputs"), list) else []
        channels: set[str] = set()
        formats: set[str] = set()
        for output_index, output in enumerate(outputs):
            if not isinstance(output, dict):
                errors.append(issue("PRESET_OUTPUT_TYPE", f"{path}.default_outputs[{output_index}]", "Preset output must be an object."))
                continue
            channel, fmt = output.get("channel"), output.get("format")
            channels.add(channel)
            formats.add(fmt)
            if isinstance(channel, str) and channel.startswith("custom:"):
                renderer_ids = {skill_id for skill_id, entry in skills.items() if channel in (entry.get("supported_channels") or [])}
                if not renderer_ids or not (renderer_ids & required):
                    errors.append(issue("PRESET_CUSTOM_RENDERER", f"{path}.default_outputs[{output_index}]", "Custom preset channel requires a catalog renderer in required_skill_ids."))
            elif channel not in CHANNEL_FORMATS or fmt not in CHANNEL_FORMATS.get(channel, set()):
                errors.append(issue("PRESET_CHANNEL_FORMAT", f"{path}.default_outputs[{output_index}]", "Unsupported channel/format pair."))
        if channels & {"x", "telegram", "buy_side_note", "generic"} and "render-cuebook-market-post" not in required:
            errors.append(issue("PRESET_POST_RENDERER", path, "Preset requires the compact-text renderer."))
        if "viewpoint_card" in formats:
            if "assemble-cuebook-viewpoint-card" not in required:
                errors.append(issue("PRESET_VIEWPOINT_ASSEMBLER", path, "Viewpoint-card preset requires the card assembler."))
            if "render-cuebook-viewpoint-visual" not in required:
                errors.append(issue("PRESET_VIEWPOINT_VISUAL", path, "Viewpoint-card preset requires the unified viewpoint visual."))
        if channels & {"xiaohongshu", "reddit", "owned_web", "seeking_alpha_internal", "short_video", "douyin"} and "render-cuebook-market-media" not in required:
            errors.append(issue("PRESET_MEDIA_RENDERER", path, "Preset requires the media renderer."))
        if "owned_web" in channels and "optimize-cuebook-market-seo" not in required:
            errors.append(issue("PRESET_OWNED_WEB_SEO", path, "Owned-web preset requires SEO."))
        if len(outputs) > 1 and "plan-market-content-program" not in required:
            errors.append(issue("PRESET_PROGRAM_REQUIRED", path, "Multi-output preset requires content-program planning."))

    extension_points = payload.get("extension_points")
    if not isinstance(extension_points, list):
        errors.append(issue("EXTENSION_POINTS_TYPE", "$.extension_points", "extension_points must be an array."))
        extension_points = []
    seen_extension_points: set[str] = set()
    for index, extension in enumerate(extension_points):
        path = f"$.extension_points[{index}]"
        if not isinstance(extension, dict):
            errors.append(issue("EXTENSION_POINT_TYPE", path, "Extension point must be an object."))
            continue
        key = extension.get("extension_point")
        if key in seen_extension_points:
            errors.append(issue("DUPLICATE_EXTENSION_POINT", f"{path}.extension_point", "Extension points must be unique."))
        seen_extension_points.add(key)

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--skip-file-checks", action="store_true")
    parser.add_argument("--skills-root", type=Path, default=DEFAULT_SKILLS_ROOT)
    args = parser.parse_args()
    payload = json.loads(args.json_file.read_text(encoding="utf-8"))
    result = validate(payload, check_files=not args.skip_file_checks, skills_root=args.skills_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
