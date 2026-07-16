#!/usr/bin/env python3
"""Validate ContentProgramV1 topology, routing, and measurement invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED = {
    "schema_version",
    "program_id",
    "generated_at",
    "brief",
    "topology",
    "items",
    "release_strategy",
    "measurement_plan",
    "quality_report",
}
TOPOLOGIES = {"single", "anchor_and_derivatives", "serial", "event_lifecycle", "community_loop", "evergreen_series"}
STRATEGIES = {"single_channel", "staggered", "synchronized", "anchor_then_derivatives", "event_triggered"}
RENDERERS = {"compact_text", "structured_media", "manual_authoring"}
COMPACT_TEXT_PLATFORMS = {"x", "telegram", "xiaohongshu", "buy_side"}
STRUCTURED_MEDIA_PLATFORMS = {"generic", "website", "reddit", "xiaohongshu", "douyin", "seeking_alpha"}
OPTIMIZATION_MODULES = {"seo", "geo"}
HYPE_PATTERN = re.compile(r"\b(?:viral|guaranteed reach|best posting time)\b|爆款|保证流量|最佳发布时间", re.I)


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def find_cycle(nodes: set[str], edges: dict[str, set[str]]) -> list[str] | None:
    state: dict[str, int] = {node: 0 for node in nodes}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for dependency in edges.get(node, set()):
            if dependency not in state:
                continue
            if state[dependency] == 1:
                start = stack.index(dependency)
                return stack[start:] + [dependency]
            if state[dependency] == 0:
                cycle = visit(dependency)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for node in sorted(nodes):
        if state[node] == 0:
            cycle = visit(node)
            if cycle:
                return cycle
    return None


def validate(item: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(item, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ContentProgramV1 must be an object.")], "warnings": []}

    for key in sorted(REQUIRED - set(item)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    if item.get("schema_version") != "content-program.v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-program.v1."))
    if not re.fullmatch(r"content_program_[a-f0-9]{16}", str(item.get("program_id") or "")):
        errors.append(issue("PROGRAM_ID", "$.program_id", "program_id must contain a stable 16-character lowercase hex suffix."))
    if parse_time(item.get("generated_at")) is None:
        errors.append(issue("GENERATED_AT", "$.generated_at", "generated_at must be a parseable timestamp."))

    brief = item.get("brief")
    if not isinstance(brief, dict):
        errors.append(issue("BRIEF_TYPE", "$.brief", "brief must be an object."))
        brief = {}
    source_refs_raw = brief.get("source_refs")
    source_refs = {value for value in source_refs_raw if isinstance(value, str) and value.strip()} if isinstance(source_refs_raw, list) else set()
    if not source_refs:
        errors.append(issue("SOURCE_BOUNDARY", "$.brief.source_refs", "A content program requires at least one stable source reference."))
    requested_raw = brief.get("requested_platforms")
    requested = {value for value in requested_raw if isinstance(value, str) and value.strip()} if isinstance(requested_raw, list) else set()
    if not requested:
        errors.append(issue("REQUESTED_PLATFORMS", "$.brief.requested_platforms", "At least one requested platform is required."))
    horizon_start = parse_time(brief.get("horizon_start"))
    horizon_end = parse_time(brief.get("horizon_end"))
    if brief.get("horizon_start") and horizon_start is None:
        errors.append(issue("HORIZON_START", "$.brief.horizon_start", "horizon_start must be parseable or null."))
    if brief.get("horizon_end") and horizon_end is None:
        errors.append(issue("HORIZON_END", "$.brief.horizon_end", "horizon_end must be parseable or null."))
    if horizon_start and horizon_end and horizon_end <= horizon_start:
        errors.append(issue("HORIZON_ORDER", "$.brief.horizon_end", "horizon_end must follow horizon_start."))

    topology = item.get("topology")
    if not isinstance(topology, dict):
        errors.append(issue("TOPOLOGY_TYPE", "$.topology", "topology must be an object."))
        topology = {}
    topology_mode = topology.get("mode")
    if topology_mode not in TOPOLOGIES:
        errors.append(issue("TOPOLOGY_MODE", "$.topology.mode", "Unsupported topology mode."))

    items_raw = item.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        errors.append(issue("ITEMS", "$.items", "items must be a non-empty array."))
        items_raw = []

    items: dict[str, dict[str, Any]] = {}
    edges: dict[str, set[str]] = {}
    duplicate_keys: dict[tuple[str, str, str, str], str] = {}
    for index, entry in enumerate(items_raw):
        path = f"$.items[{index}]"
        if not isinstance(entry, dict):
            errors.append(issue("ITEM_TYPE", path, "Each content item must be an object."))
            continue
        item_id = str(entry.get("item_id") or "").strip()
        if not re.fullmatch(r"content_item_[A-Za-z0-9_-]+", item_id):
            errors.append(issue("ITEM_ID", f"{path}.item_id", "item_id must use the content_item_ prefix."))
        elif item_id in items:
            errors.append(issue("DUPLICATE_ITEM_ID", f"{path}.item_id", f"Duplicate item ID {item_id}."))
        items[item_id] = entry
        platform = entry.get("platform")
        renderer = entry.get("renderer")
        if platform not in requested:
            errors.append(issue("PLATFORM_SCOPE", f"{path}.platform", "Item platform is outside brief.requested_platforms."))
        if renderer not in RENDERERS:
            errors.append(issue("RENDERER_VALUE", f"{path}.renderer", "renderer must name a stable rendering capability, not an implementation skill."))
        if renderer == "compact_text" and platform not in COMPACT_TEXT_PLATFORMS:
            errors.append(issue("RENDERER_ROUTE", f"{path}.renderer", f"Compact text rendering does not own {platform!r}."))
        if renderer == "structured_media" and platform not in STRUCTURED_MEDIA_PLATFORMS:
            errors.append(issue("RENDERER_ROUTE", f"{path}.renderer", f"Structured media rendering does not own {platform!r}."))
        modules_raw = entry.get("optimization_modules", [])
        if not isinstance(modules_raw, list):
            errors.append(issue("OPTIMIZATION_MODULES", f"{path}.optimization_modules", "optimization_modules must be an array."))
            modules: set[str] = set()
        else:
            modules = {value for value in modules_raw if isinstance(value, str)}
            unknown_modules = modules - OPTIMIZATION_MODULES
            if unknown_modules or len(modules) != len(modules_raw):
                errors.append(issue("OPTIMIZATION_MODULES", f"{path}.optimization_modules", f"Unsupported or duplicate modules: {sorted(unknown_modules)}."))
        if platform == "website":
            if "seo" not in modules:
                errors.append(issue("WEBSITE_SEO_ROUTE", f"{path}.optimization_modules", "Owned-web content must route through the Cuebook SEO module."))
            if "geo" in modules and "seo" not in modules:
                errors.append(issue("GEO_REQUIRES_SEO", f"{path}.optimization_modules", "Cuebook GEO uses the SEO eligibility result as its upstream floor."))
        elif modules:
            errors.append(issue("WEB_MODULE_SCOPE", f"{path}.optimization_modules", "SEO and GEO sidecars apply only to owned-web items."))
        if platform == "reddit" and not str(entry.get("target_context") or "").strip():
            errors.append(issue("COMMUNITY_CONTEXT", f"{path}.target_context", "Reddit planning requires a named community."))
        if entry.get("wording_reuse_allowed") is not False:
            errors.append(issue("WORDING_REUSE", f"{path}.wording_reuse_allowed", "Cross-channel wording reuse must remain false."))
        entry_sources = entry.get("source_refs")
        if not isinstance(entry_sources, list) or not entry_sources:
            errors.append(issue("ITEM_SOURCE_REFS", f"{path}.source_refs", "Each item requires bounded source references."))
        elif any(ref not in source_refs for ref in entry_sources):
            errors.append(issue("UNKNOWN_SOURCE_REF", f"{path}.source_refs", "Item source_refs must be declared in brief.source_refs."))
        if not str(entry.get("editorial_job") or "").strip():
            errors.append(issue("EDITORIAL_JOB", f"{path}.editorial_job", "Each item needs one explicit editorial job."))
        dependencies = entry.get("depends_on")
        if not isinstance(dependencies, list):
            errors.append(issue("DEPENDENCY_TYPE", f"{path}.depends_on", "depends_on must be an array."))
            dependencies = []
        edges[item_id] = {value for value in dependencies if isinstance(value, str)}
        dedupe_key = (str(platform), str(entry.get("format")), str(entry.get("target_context") or ""), str(entry.get("editorial_job") or "").strip().lower())
        if dedupe_key in duplicate_keys:
            warnings.append(issue("DUPLICATE_EDITORIAL_JOB", path, f"This item duplicates the job of {duplicate_keys[dedupe_key]}."))
        else:
            duplicate_keys[dedupe_key] = item_id

    item_ids = set(items)
    for item_id, entry in items.items():
        parent = entry.get("parent_item_id")
        if parent is not None and parent not in item_ids:
            errors.append(issue("UNKNOWN_PARENT", f"$.items[{item_id}].parent_item_id", "parent_item_id does not exist."))
        if parent == item_id:
            errors.append(issue("SELF_PARENT", f"$.items[{item_id}].parent_item_id", "An item cannot parent itself."))
        unknown_dependencies = edges.get(item_id, set()) - item_ids
        if unknown_dependencies:
            errors.append(issue("UNKNOWN_DEPENDENCY", f"$.items[{item_id}].depends_on", f"Unknown dependencies: {sorted(unknown_dependencies)}."))
        if item_id in edges.get(item_id, set()):
            errors.append(issue("SELF_DEPENDENCY", f"$.items[{item_id}].depends_on", "An item cannot depend on itself."))

    cycle = find_cycle(item_ids, edges)
    if cycle:
        errors.append(issue("DEPENDENCY_CYCLE", "$.items", "Dependency cycle: " + " -> ".join(cycle)))

    anchor_id = topology.get("anchor_item_id")
    if topology_mode == "single" and len(items) != 1:
        errors.append(issue("SINGLE_COUNT", "$.items", "single topology requires exactly one item."))
    if topology_mode == "anchor_and_derivatives":
        if anchor_id not in items or items.get(anchor_id, {}).get("role") != "anchor":
            errors.append(issue("ANCHOR_REQUIRED", "$.topology.anchor_item_id", "anchor_and_derivatives requires a valid anchor-role item."))
        if len(items) < 2 or not any(entry.get("parent_item_id") == anchor_id for entry in items.values()):
            errors.append(issue("DERIVATIVE_REQUIRED", "$.items", "anchor_and_derivatives requires at least one child of the anchor."))
    elif anchor_id is not None:
        warnings.append(issue("UNUSED_ANCHOR", "$.topology.anchor_item_id", "Only anchor_and_derivatives uses anchor_item_id."))
    if topology_mode == "serial" and len(items) < 2:
        errors.append(issue("SERIAL_COUNT", "$.items", "serial topology requires at least two items."))
    if topology_mode == "event_lifecycle":
        if parse_time(topology.get("event_expiry")) is None:
            errors.append(issue("EVENT_EXPIRY", "$.topology.event_expiry", "event_lifecycle requires a parseable event expiry."))
        if not any(entry.get("role") in {"update", "recap"} for entry in items.values()):
            errors.append(issue("EVENT_UPDATE", "$.items", "event_lifecycle requires an update or recap item."))
    if topology_mode == "community_loop":
        roles = {entry.get("role") for entry in items.values()}
        if not {"discussion", "reply"}.issubset(roles):
            errors.append(issue("COMMUNITY_LOOP_ROLES", "$.items", "community_loop requires discussion and reply roles."))
        if any(not str(entry.get("target_context") or "").strip() for entry in items.values()):
            errors.append(issue("COMMUNITY_LOOP_CONTEXT", "$.items", "Every community-loop item needs target_context."))
    if topology_mode == "evergreen_series":
        if len(items) < 2:
            errors.append(issue("EVERGREEN_COUNT", "$.items", "evergreen_series requires at least two items."))
        if any(entry.get("temporal_mode") != "evergreen" for entry in items.values()):
            errors.append(issue("EVERGREEN_TEMPORAL_MODE", "$.items", "Every evergreen-series item must use temporal_mode evergreen."))

    strategy = item.get("release_strategy")
    if not isinstance(strategy, dict):
        errors.append(issue("RELEASE_STRATEGY", "$.release_strategy", "release_strategy must be an object."))
        strategy = {}
    strategy_mode = strategy.get("mode")
    if strategy_mode not in STRATEGIES:
        errors.append(issue("RELEASE_STRATEGY_MODE", "$.release_strategy.mode", "Unsupported release strategy."))
    relative_order = strategy.get("relative_order")
    if not isinstance(relative_order, list) or len(relative_order) != len(set(relative_order)):
        errors.append(issue("RELATIVE_ORDER", "$.release_strategy.relative_order", "relative_order must contain unique item IDs."))
        relative_order = []
    if set(relative_order) != item_ids:
        errors.append(issue("RELATIVE_ORDER_COVERAGE", "$.release_strategy.relative_order", "relative_order must contain every item exactly once."))
    positions = {value: index for index, value in enumerate(relative_order)}
    for item_id, dependencies in edges.items():
        for dependency in dependencies:
            if item_id in positions and dependency in positions and positions[dependency] >= positions[item_id]:
                errors.append(issue("RELATIVE_ORDER_DEPENDENCY", "$.release_strategy.relative_order", f"{dependency} must precede {item_id}."))
    if strategy_mode == "synchronized" and any(edges.values()):
        errors.append(issue("SYNCHRONIZED_DEPENDENCY", "$.release_strategy.mode", "Dependent items cannot use synchronized release."))
    if topology_mode == "anchor_and_derivatives" and strategy_mode == "anchor_then_derivatives" and anchor_id in positions:
        if positions[anchor_id] != 0:
            errors.append(issue("ANCHOR_ORDER", "$.release_strategy.relative_order", "The anchor must be first."))

    measurement = item.get("measurement_plan")
    if not isinstance(measurement, dict):
        errors.append(issue("MEASUREMENT_PLAN", "$.measurement_plan", "measurement_plan must be an object."))
        measurement = {}
    question_ids: set[str] = set()
    for index, question in enumerate(measurement.get("questions") or []):
        path = f"$.measurement_plan.questions[{index}]"
        if not isinstance(question, dict):
            errors.append(issue("MEASUREMENT_QUESTION", path, "Measurement question must be an object."))
            continue
        question_id = str(question.get("question_id") or "")
        if question_id in question_ids:
            errors.append(issue("DUPLICATE_QUESTION_ID", f"{path}.question_id", "Measurement question IDs must be unique."))
        question_ids.add(question_id)
        refs = question.get("item_ids")
        if not isinstance(refs, list) or any(ref not in item_ids for ref in refs):
            errors.append(issue("MEASUREMENT_ITEM_REF", f"{path}.item_ids", "Measurement item_ids must reference planned items."))
    window_labels: set[str] = set()
    for index, window in enumerate(measurement.get("windows") or []):
        path = f"$.measurement_plan.windows[{index}]"
        if not isinstance(window, dict):
            errors.append(issue("MEASUREMENT_WINDOW", path, "Measurement window must be an object."))
            continue
        label = str(window.get("label") or "")
        if label in window_labels:
            errors.append(issue("DUPLICATE_WINDOW", f"{path}.label", "Measurement window labels must be unique."))
        window_labels.add(label)

    public_text = json.dumps(item, ensure_ascii=False)
    if HYPE_PATTERN.search(public_text):
        warnings.append(issue("PERFORMANCE_PROMISE", "$", "Remove unsupported virality, reach, or best-time claims."))
    quality = item.get("quality_report")
    if not isinstance(quality, dict) or not {"scores", "hard_failures", "revisions"}.issubset(quality):
        errors.append(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate ContentProgramV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="ContentProgramV1 JSON or array; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    payload = json.loads(raw)
    output = [validate(entry) for entry in payload] if isinstance(payload, list) else validate(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    results = output if isinstance(output, list) else [output]
    raise SystemExit(0 if all(result["valid"] for result in results) else 1)


if __name__ == "__main__":
    main()
