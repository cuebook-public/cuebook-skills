#!/usr/bin/env python3
"""Validate ContentRecipeV1 composition, references, and skill resolution."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_FIELDS = {
    "schema_version", "recipe_id", "revision", "state", "catalog_version", "created_at",
    "updated_at", "as_of", "decision_cutoff_at", "feed_ref", "opportunity_set_ref",
    "selection_mode", "preset_ref", "anchor", "ingredients", "preparation", "flavor",
    "plating", "execution", "extensions", "validation_report",
}
INGREDIENT_FIELDS = {
    "news_refs": ("news", "NEWS_"),
    "calendar_refs": ("calendar_events", "CAL_"),
    "narrative_refs": ("narratives", "NAR_"),
    "trade_idea_refs": ("trade_ideas", "IDEA_"),
    "trade_history_refs": ("trade_history", "TRADE_"),
}
CHANNEL_FORMATS = {
    "x": {"short_post", "thread"},
    "telegram": {"short_post", "long_post"},
    "xiaohongshu": {"caption", "carousel"},
    "reddit": {"post", "comment"},
    "owned_web": {"article", "brief"},
    "seeking_alpha_internal": {"article_outline"},
    "buy_side_note": {"note"},
    "short_video": {"script"},
    "douyin": {"short_video_script"},
    "generic": {"text", "viewpoint_card", "publish_candidate_set"},
}
COMPACT_CHANNELS = {"x", "telegram", "buy_side_note", "generic"}
MEDIA_CHANNELS = {"xiaohongshu", "reddit", "owned_web", "seeking_alpha_internal", "short_video", "douyin"}
BASE_REQUIRED_SKILLS = {
    "normalize-cuebook-creator-feed",
    "compose-cuebook-content-recipe",
    "select-cuebook-content-opportunities",
    "validate-cuebook-projection",
    "route-cuebook-narrative",
    "build-market-research-pack",
    "compile-cuebook-market-view-semantics",
    "plan-cuebook-creator-expression",
    "orchestrate-cuebook-creator-workflow",
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


def unique_list(value: Any, path: str, errors: list[dict[str, str]]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(issue("ARRAY_REQUIRED", path, "Expected an array."))
        return []
    try:
        if len(value) != len(set(value)):
            errors.append(issue("DUPLICATE_REF", path, "Array values must be unique."))
    except TypeError:
        errors.append(issue("SCALAR_REFS", path, "Array values must be scalar references."))
    return value


def required_skills(payload: dict[str, Any]) -> set[str]:
    required = set(BASE_REQUIRED_SKILLS)
    plating = payload.get("plating") if isinstance(payload.get("plating"), dict) else {}
    outputs = plating.get("outputs") if isinstance(plating.get("outputs"), list) else []
    channels = {item.get("channel") for item in outputs if isinstance(item, dict)}
    formats = {item.get("format") for item in outputs if isinstance(item, dict)}
    execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
    mode = execution.get("mode")
    if channels & COMPACT_CHANNELS:
        required.add("render-cuebook-market-post")
    if channels & MEDIA_CHANNELS:
        required.add("render-cuebook-market-media")
    if "viewpoint_card" in formats:
        required.update({"render-cuebook-viewpoint-visual", "assemble-cuebook-viewpoint-card"})
    if "publish_candidate_set" in formats:
        required.update({"render-cuebook-market-post", "direct-cuebook-viewpoint-visual", "assemble-cuebook-publish-candidates"})
    total_units = sum(
        1 if item.get("format") == "publish_candidate_set" else item.get("count", 0)
        for item in outputs
        if isinstance(item, dict) and isinstance(item.get("count"), int)
    )
    if len(outputs) > 1 or total_units > 1 or plating.get("bundle_strategy") != "independent" or mode in {"batch", "event_lifecycle"}:
        required.add("plan-market-content-program")
    if "owned_web" in channels:
        required.add("optimize-cuebook-market-seo")
    if plating.get("deliverable_mode") == "release_candidates":
        required.add("prepare-market-content-release")
    if mode in {"postmortem", "correction"}:
        required.add("reconcile-market-content-history")
    return required


def validate(payload: Any, feed: Any | None = None, opportunities: Any | None = None, catalog: Any | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ContentRecipeV1 must be an object.")], "warnings": []}

    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "content-recipe-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-recipe-v1."))
    if not re.fullmatch(r"RECIPE_[a-z0-9]{8,64}", str(payload.get("recipe_id") or "")):
        errors.append(issue("RECIPE_ID", "$.recipe_id", "Invalid recipe ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))

    created = parse_time(payload.get("created_at"), "$.created_at", errors)
    updated = parse_time(payload.get("updated_at"), "$.updated_at", errors)
    as_of = parse_time(payload.get("as_of"), "$.as_of", errors)
    cutoff = parse_time(payload.get("decision_cutoff_at"), "$.decision_cutoff_at", errors)
    if created and updated and created > updated:
        errors.append(issue("REVISION_TIME", "$.updated_at", "updated_at cannot precede created_at."))
    if cutoff and as_of and cutoff > as_of:
        errors.append(issue("CUTOFF_AFTER_AS_OF", "$.decision_cutoff_at", "Decision cutoff cannot be after as_of."))

    ingredients = payload.get("ingredients")
    if not isinstance(ingredients, dict):
        errors.append(issue("INGREDIENTS_TYPE", "$.ingredients", "ingredients must be an object."))
        ingredients = {}
    ingredient_refs: dict[str, list[Any]] = {}
    all_refs: list[Any] = []
    for field in INGREDIENT_FIELDS:
        refs = unique_list(ingredients.get(field), f"$.ingredients.{field}", errors)
        ingredient_refs[field] = refs
        all_refs.extend(refs)
    history_use = ingredients.get("history_use")
    if ingredient_refs["trade_history_refs"] and history_use == "none":
        errors.append(issue("HISTORY_USE_REQUIRED", "$.ingredients.history_use", "Selected trade history requires an explicit permitted use."))
    if not ingredient_refs["trade_history_refs"] and history_use not in {"none", None}:
        errors.append(issue("HISTORY_USE_WITHOUT_RECORDS", "$.ingredients.history_use", "History use requires selected trade-history records."))

    flavor = payload.get("flavor")
    if not isinstance(flavor, dict):
        errors.append(issue("FLAVOR_TYPE", "$.flavor", "flavor must be an object."))
        flavor = {}
    authorship_mode = flavor.get("authorship_mode", "creator_led")
    assistance_attribution = flavor.get("assistance_attribution", "none")
    if authorship_mode not in {"creator_led", "cuebook_assisted", "cuebook_generated"}:
        errors.append(issue("AUTHORSHIP_MODE", "$.flavor.authorship_mode", "Unsupported authorship mode."))
    if assistance_attribution not in {"none", "disclosure_only"}:
        errors.append(issue("ASSISTANCE_ATTRIBUTION", "$.flavor.assistance_attribution", "Unsupported assistance attribution mode."))

    anchor = payload.get("anchor")
    if not isinstance(anchor, dict):
        errors.append(issue("ANCHOR_TYPE", "$.anchor", "anchor must be an object."))
        anchor = {}
    mode = payload.get("selection_mode")
    primary_ref = anchor.get("primary_ref")
    opportunity_ref = anchor.get("opportunity_ref")
    if mode == "ingredient_first":
        if opportunity_ref is not None:
            errors.append(issue("INGREDIENT_FIRST_OPPORTUNITY", "$.anchor.opportunity_ref", "ingredient_first resolves an opportunity later."))
        if primary_ref not in all_refs:
            errors.append(issue("PRIMARY_INGREDIENT", "$.anchor.primary_ref", "Primary ingredient must be one of the selected records."))
    elif mode == "opportunity_first":
        if not opportunity_ref or not payload.get("opportunity_set_ref"):
            errors.append(issue("OPPORTUNITY_ANCHOR_REQUIRED", "$.anchor.opportunity_ref", "opportunity_first requires a selected opportunity and set."))
    elif mode == "preset_auto":
        if not payload.get("preset_ref"):
            errors.append(issue("PRESET_REQUIRED", "$.preset_ref", "preset_auto requires a preset."))
    else:
        errors.append(issue("SELECTION_MODE", "$.selection_mode", "Unsupported selection mode."))
    if payload.get("state") == "valid" and not all_refs:
        errors.append(issue("VALID_WITHOUT_INGREDIENTS", "$.ingredients", "A valid recipe requires resolved ingredients."))

    execution = payload.get("execution")
    if not isinstance(execution, dict):
        errors.append(issue("EXECUTION_TYPE", "$.execution", "execution must be an object."))
        execution = {}
    selected_skills = unique_list(execution.get("selected_skill_ids"), "$.execution.selected_skill_ids", errors)
    resolved_skills = unique_list(execution.get("resolved_skill_ids"), "$.execution.resolved_skill_ids", errors)
    selected_set, resolved_set = set(selected_skills), set(resolved_skills)
    if not selected_set.issubset(resolved_set):
        errors.append(issue("SELECTED_SKILL_UNRESOLVED", "$.execution.resolved_skill_ids", "Every selected skill must be present in the resolved set."))
    missing_required = sorted(required_skills(payload) - resolved_set)
    if missing_required:
        errors.append(issue("REQUIRED_SKILL_MISSING", "$.execution.resolved_skill_ids", f"Missing required skills: {missing_required}."))
    if "optimize-cuebook-market-geo" in resolved_set and "optimize-cuebook-market-seo" not in resolved_set:
        errors.append(issue("GEO_REQUIRES_SEO", "$.execution.resolved_skill_ids", "GEO requires SEO in the same recipe."))
    pins = execution.get("version_pins")
    if not isinstance(pins, list):
        errors.append(issue("VERSION_PINS_TYPE", "$.execution.version_pins", "version_pins must be an array."))
        pins = []
    pin_ids: set[str] = set()
    for index, pin in enumerate(pins):
        path = f"$.execution.version_pins[{index}]"
        if not isinstance(pin, dict):
            errors.append(issue("VERSION_PIN_TYPE", path, "Version pin must be an object."))
            continue
        skill_id = pin.get("skill_id")
        if skill_id in pin_ids:
            errors.append(issue("DUPLICATE_VERSION_PIN", f"{path}.skill_id", "Skill version pins must be unique."))
        pin_ids.add(skill_id)
        if skill_id not in resolved_set:
            errors.append(issue("PIN_UNRESOLVED_SKILL", path, "A version pin must reference a resolved skill."))
    missing_pin_ids = sorted(resolved_set - pin_ids)
    if missing_pin_ids:
        errors.append(issue("MISSING_VERSION_PIN", "$.execution.version_pins", f"Resolved runtime skills require exactly one version pin: {missing_pin_ids}."))

    plating = payload.get("plating")
    if not isinstance(plating, dict):
        errors.append(issue("PLATING_TYPE", "$.plating", "plating must be an object."))
        plating = {}
    outputs = plating.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        errors.append(issue("OUTPUT_REQUIRED", "$.plating.outputs", "At least one output is required."))
        outputs = []
    output_ids: set[str] = set()
    custom_channels: set[str] = set()
    for index, output in enumerate(outputs):
        path = f"$.plating.outputs[{index}]"
        if not isinstance(output, dict):
            errors.append(issue("OUTPUT_TYPE", path, "Output must be an object."))
            continue
        output_id = output.get("output_id")
        if output_id in output_ids:
            errors.append(issue("DUPLICATE_OUTPUT_ID", f"{path}.output_id", "Output IDs must be unique."))
        output_ids.add(output_id)
        channel, fmt = output.get("channel"), output.get("format")
        if isinstance(channel, str) and channel.startswith("custom:"):
            custom_channels.add(channel)
        elif channel not in CHANNEL_FORMATS or fmt not in CHANNEL_FORMATS.get(channel, set()):
            errors.append(issue("CHANNEL_FORMAT", path, f"Unsupported {channel!r}/{fmt!r} combination."))
    if any(isinstance(item, dict) and item.get("channel") == "seeking_alpha_internal" for item in outputs):
        if plating.get("deliverable_mode") != "drafts":
            errors.append(issue("SEEKING_ALPHA_INTERNAL_ONLY", "$.plating.deliverable_mode", "Seeking Alpha support is limited to an internal outline."))

    exec_mode = execution.get("mode")
    if exec_mode == "postmortem":
        if not ingredient_refs["trade_history_refs"] or history_use != "postmortem":
            errors.append(issue("POSTMORTEM_HISTORY_REQUIRED", "$.ingredients", "Postmortem mode requires selected history with postmortem use."))
    if exec_mode == "batch" and len(all_refs) < 2 and mode != "preset_auto":
        warnings.append(issue("THIN_BATCH", "$.ingredients", "Batch mode has fewer than two selected ingredients."))

    if feed is not None:
        if not isinstance(feed, dict) or feed.get("schema_version") != "creator-feed-v1":
            errors.append(issue("FEED_TYPE", "$feed", "Expected CreatorFeedV1."))
        else:
            if payload.get("feed_ref") != feed.get("feed_id"):
                errors.append(issue("FEED_REF_MISMATCH", "$.feed_ref", "Recipe feed reference does not match."))
            anchor_entities = set(anchor.get("entity_refs") or [])
            selected_news_clusters: set[str] = set()
            for field, (collection_name, _) in INGREDIENT_FIELDS.items():
                records = {item.get("id"): item for item in feed.get(collection_name, []) if isinstance(item, dict)}
                for ref in ingredient_refs[field]:
                    path = f"$.ingredients.{field}"
                    record = records.get(ref)
                    if record is None:
                        errors.append(issue("UNKNOWN_INGREDIENT", path, f"Unknown {collection_name} record {ref!r}."))
                        continue
                    if record.get("record_status") != "active":
                        errors.append(issue("INACTIVE_INGREDIENT", path, f"{ref!r} is not active."))
                    available = parse_time(record.get("available_at"), f"$feed.{collection_name}.{ref}.available_at", errors)
                    if available and cutoff and available > cutoff:
                        errors.append(issue("POST_CUTOFF_INGREDIENT", path, f"{ref!r} was unavailable at the decision cutoff."))
                    record_entities = set(record.get("entity_refs") or [])
                    if anchor_entities and record_entities and not (anchor_entities & record_entities):
                        warnings.append(issue("ENTITY_SPREAD", path, f"{ref!r} does not share an anchor entity; verify the proxy bridge."))
                    if field == "news_refs":
                        cluster = record.get("cluster_id")
                        if cluster in selected_news_clusters:
                            errors.append(issue("DUPLICATE_NEWS_CLUSTER", path, "Multiple selected news items share one cluster."))
                        selected_news_clusters.add(cluster)
                    if field == "trade_history_refs":
                        if record.get("public_reuse_permission") in {"private", "unknown"}:
                            errors.append(issue("HISTORY_REUSE_BLOCKED", path, f"{ref!r} is not authorized for this recipe."))
                        if history_use in {"postmortem", "calibration"} and record.get("trade_type") == "executed" and record.get("execution_verification") != "broker_reconciled":
                            errors.append(issue("HISTORY_UNRECONCILED", path, f"{ref!r} cannot support performance language."))

    if opportunities is not None:
        if not isinstance(opportunities, dict) or opportunities.get("schema_version") != "content-opportunity-set-v1":
            errors.append(issue("OPPORTUNITY_SET_TYPE", "$opportunities", "Expected ContentOpportunitySetV1."))
        else:
            if payload.get("opportunity_set_ref") != opportunities.get("opportunity_set_id"):
                errors.append(issue("OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Recipe opportunity-set reference does not match."))
            selected = {item.get("opportunity_id") for item in opportunities.get("candidates", []) if isinstance(item, dict) and item.get("decision") == "selected"}
            if opportunity_ref and opportunity_ref not in selected:
                errors.append(issue("UNKNOWN_SELECTED_OPPORTUNITY", "$.anchor.opportunity_ref", "Anchor is not selected in the supplied opportunity set."))

    if catalog is not None:
        if not isinstance(catalog, dict) or catalog.get("schema_version") != "skill-catalog-v1":
            errors.append(issue("CATALOG_TYPE", "$catalog", "Expected SkillCatalogV1."))
        else:
            if payload.get("catalog_version") != catalog.get("catalog_version"):
                errors.append(issue("CATALOG_VERSION_MISMATCH", "$.catalog_version", "Recipe must pin the supplied catalog version."))
            catalog_skills = {item.get("skill_id"): item for item in catalog.get("skills", []) if isinstance(item, dict)}
            for skill_id in resolved_set:
                entry = catalog_skills.get(skill_id)
                if entry is None:
                    errors.append(issue("UNKNOWN_RESOLVED_SKILL", "$.execution.resolved_skill_ids", f"Unknown catalog skill {skill_id!r}."))
                elif entry.get("status") in {"deprecated", "disabled"}:
                    errors.append(issue("UNAVAILABLE_RESOLVED_SKILL", "$.execution.resolved_skill_ids", f"Unavailable skill {skill_id!r}."))
                elif execution.get("mode") not in (entry.get("supported_modes") or []) and skill_id != "orchestrate-cuebook-creator-workflow":
                    errors.append(issue("SKILL_MODE_UNSUPPORTED", "$.execution.resolved_skill_ids", f"{skill_id!r} does not support mode {execution.get('mode')!r}."))
                if entry is not None:
                    missing_dependencies = sorted(set(entry.get("requires_all") or []) - resolved_set)
                    if missing_dependencies:
                        errors.append(issue(
                            "RESOLVED_DEPENDENCY_MISSING",
                            "$.execution.resolved_skill_ids",
                            f"Resolved skill {skill_id!r} is missing dependencies: {missing_dependencies}.",
                        ))
            for skill_id in selected_set:
                entry = catalog_skills.get(skill_id)
                if entry is not None and not entry.get("user_selectable"):
                    errors.append(issue("SKILL_NOT_USER_SELECTABLE", "$.execution.selected_skill_ids", f"{skill_id!r} is automatic or internal."))
            custom_renderer_extensions = [extension for extension in payload.get("extensions") or [] if isinstance(extension, dict) and extension.get("extension_point") == "custom_renderer"]
            custom_extension_configured = bool(custom_renderer_extensions)
            for channel in custom_channels:
                renderer_ids = {
                    skill_id for skill_id, entry in catalog_skills.items()
                    if channel in (entry.get("supported_channels") or []) and entry.get("status") not in {"deprecated", "disabled"}
                }
                if renderer_ids and not (renderer_ids & resolved_set):
                    errors.append(issue("CUSTOM_RENDERER_SKILL_MISSING", "$.execution.resolved_skill_ids", f"Resolve one catalog renderer for {channel!r}: {sorted(renderer_ids)}."))
                if not renderer_ids and not custom_extension_configured:
                    errors.append(issue("CUSTOM_RENDERER_REQUIRED", "$.extensions", f"No catalog skill or custom_renderer extension handles {channel!r}."))
                if not renderer_ids and custom_extension_configured and not any(extension.get("required") for extension in custom_renderer_extensions):
                    errors.append(issue("CUSTOM_RENDERER_NOT_REQUIRED", "$.extensions", "A renderer needed for a selected custom output must be marked required."))
            catalog_versions = {skill_id: entry.get("version") for skill_id, entry in catalog_skills.items()}
            for index, pin in enumerate(pins):
                if isinstance(pin, dict) and pin.get("skill_id") in catalog_versions and pin.get("version") != catalog_versions[pin.get("skill_id")]:
                    errors.append(issue("SKILL_VERSION_MISMATCH", f"$.execution.version_pins[{index}]", "Pinned skill version differs from the catalog."))
            presets = {item.get("preset_id"): item for item in catalog.get("presets", []) if isinstance(item, dict)}
            preset_ref = payload.get("preset_ref")
            if preset_ref and preset_ref not in presets:
                errors.append(issue("UNKNOWN_PRESET", "$.preset_ref", "Preset does not exist in the supplied catalog."))
            elif preset_ref in presets:
                limits = presets[preset_ref].get("ingredient_limits", {})
                for field in INGREDIENT_FIELDS:
                    limit = limits.get(field)
                    if isinstance(limit, dict) and len(ingredient_refs[field]) > limit.get("max", 10**9):
                        errors.append(issue("PRESET_INGREDIENT_MAX", f"$.ingredients.{field}", "Selection exceeds the preset limit."))
                    if isinstance(limit, dict) and len(ingredient_refs[field]) < limit.get("min", 0):
                        target = errors if payload.get("state") == "valid" else warnings
                        target.append(issue("PRESET_INGREDIENT_MIN", f"$.ingredients.{field}", "Selection is below the preset minimum."))
                missing_preset_skills = set(presets[preset_ref].get("required_skill_ids", [])) - resolved_set
                if missing_preset_skills:
                    errors.append(issue("PRESET_SKILL_MISSING", "$.execution.resolved_skill_ids", f"Missing preset skills: {sorted(missing_preset_skills)}."))
            known_extension_points = {item.get("extension_point") for item in catalog.get("extension_points", []) if isinstance(item, dict)}
            for index, extension in enumerate(payload.get("extensions") or []):
                if isinstance(extension, dict) and extension.get("extension_point") not in known_extension_points:
                    errors.append(issue("UNKNOWN_EXTENSION_POINT", f"$.extensions[{index}].extension_point", "Extension point is not registered."))

    elif custom_channels:
        custom_renderer_extensions = [extension for extension in payload.get("extensions") or [] if isinstance(extension, dict) and extension.get("extension_point") == "custom_renderer"]
        if not custom_renderer_extensions:
            errors.append(issue("CUSTOM_RENDERER_REQUIRED", "$.extensions", "Custom channels require a registered renderer extension when no catalog is supplied."))
        elif not any(extension.get("required") for extension in custom_renderer_extensions):
            errors.append(issue("CUSTOM_RENDERER_NOT_REQUIRED", "$.extensions", "A renderer needed for a selected custom output must be marked required."))

    extensions = payload.get("extensions")
    if not isinstance(extensions, list):
        errors.append(issue("EXTENSIONS_TYPE", "$.extensions", "extensions must be an array."))
        extensions = []
    extension_ids: set[str] = set()
    for index, extension in enumerate(extensions):
        if not isinstance(extension, dict):
            errors.append(issue("EXTENSION_TYPE", f"$.extensions[{index}]", "Extension must be an object."))
            continue
        if extension.get("extension_id") in extension_ids:
            errors.append(issue("DUPLICATE_EXTENSION", f"$.extensions[{index}].extension_id", "Extension IDs must be unique."))
        extension_ids.add(extension.get("extension_id"))

    report = payload.get("validation_report")
    if not isinstance(report, dict):
        errors.append(issue("VALIDATION_REPORT_TYPE", "$.validation_report", "validation_report must be an object."))
        report = {}
    hard_failures = report.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES_TYPE", "$.validation_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    decision, state = report.get("decision"), payload.get("state")
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.validation_report.decision", "Hard failures require blocked."))
    if state == "valid" and decision != "ready":
        errors.append(issue("VALID_STATE_DECISION", "$.validation_report.decision", "A valid recipe requires a ready decision."))
    if state == "conditional" and decision != "conditional":
        errors.append(issue("CONDITIONAL_STATE_DECISION", "$.validation_report.decision", "A conditional recipe requires a conditional decision."))
    if state == "blocked" and decision != "blocked":
        errors.append(issue("BLOCKED_STATE_DECISION", "$.validation_report.decision", "A blocked recipe requires a blocked decision."))
    if mode == "preset_auto" and not all_refs and state == "valid":
        errors.append(issue("AUTO_PRESET_UNRESOLVED", "$.state", "An unresolved automatic preset must remain conditional."))
    expected_counts = {
        "news": len(ingredient_refs["news_refs"]),
        "calendar_events": len(ingredient_refs["calendar_refs"]),
        "narratives": len(ingredient_refs["narrative_refs"]),
        "trade_ideas": len(ingredient_refs["trade_idea_refs"]),
        "trade_history": len(ingredient_refs["trade_history_refs"]),
        "outputs": len(outputs),
        "selected_skills": len(selected_skills),
        "resolved_skills": len(resolved_skills),
        "extensions": len(extensions),
    }
    if report.get("counts") != expected_counts:
        errors.append(issue("COUNTS", "$.validation_report.counts", f"Expected exact counts {expected_counts}."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--feed", type=Path)
    parser.add_argument("--opportunities", type=Path)
    parser.add_argument("--catalog", type=Path)
    args = parser.parse_args()
    load = lambda path: json.loads(path.read_text(encoding="utf-8")) if path else None
    result = validate(load(args.json_file), load(args.feed), load(args.opportunities), load(args.catalog))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
