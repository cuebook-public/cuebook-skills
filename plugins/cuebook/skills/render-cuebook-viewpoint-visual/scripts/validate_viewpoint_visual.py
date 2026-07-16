#!/usr/bin/env python3
"""Validate ViewpointVisualSpecV1 inputs and ViewpointVisualV1 manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


GRAMMAR_JOBS = {
    "reaction_test": "test_reaction",
    "parallel_contrast": "compare_paths",
    "category_reframe": "reframe_category",
    "relative_value_trigger": "show_relative_trigger",
    "policy_pivot": "show_policy_pivot",
    "sentiment_witness": "show_sentiment_witness",
    "event_unwind": "show_event_unwind",
    "feedback_loop": "explain_feedback_loop",
    "binary_level": "test_binary_level",
    "expectation_gap": "show_expectation_gap",
    "factor_rotation": "show_factor_rotation",
}
GRAMMARS = set(GRAMMAR_JOBS)
WIDE_GRAMMARS = {
    "reaction_test",
    "event_transmission",
    "expectation_revision",
    "valuation_reframe",
    "relative_value",
    "cycle_rotation",
    "flow_pressure",
    "technical_trigger",
    "scenario_branch",
    "strategy_ladder",
    "custom",
}
SUPPORTED_MODES = {
    "reaction_test": {"qualitative", "key_numbers", "series"},
    "parallel_contrast": {"qualitative", "key_numbers", "series"},
    "category_reframe": {"qualitative"},
    "relative_value_trigger": {"qualitative", "key_numbers"},
    "policy_pivot": {"qualitative", "key_numbers"},
    "sentiment_witness": {"qualitative", "key_numbers", "series"},
    "event_unwind": {"qualitative", "key_numbers", "series"},
    "feedback_loop": {"qualitative", "mixed"},
    "binary_level": {"key_numbers", "series"},
    "expectation_gap": {"qualitative", "key_numbers"},
    "factor_rotation": {"qualitative", "key_numbers", "series"},
}
STATES = {"conditional", "ready", "frozen"}
SHAPES = {"circle", "square", "triangle", "diamond"}
HASH_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
PUBLIC_BACKEND_PATTERN = re.compile(
    r"\b(?:draft|conditional|ready|frozen|blocked|observed|derived|provisional|"
    r"unconfirmed|settlement|settle|deadline|source|sources)\b",
    re.IGNORECASE,
)
PUBLIC_BACKEND_CJK = ("草稿", "待确认", "已确认", "已计算", "推演", "形成中", "已冻结", "来源", "结算", "成功条件")
ROOT = Path(__file__).resolve().parents[1]
WORDMARK_ASSET = ROOT.parent / "direct-cuebook-viewpoint-visual" / "assets" / "cuebook-wordmark.svg"
CANONICAL_WORDMARK_PATHS = re.findall(r'<path\s+d="([^"]+)"', WORDMARK_ASSET.read_text(encoding="utf-8"))
CANONICAL_WORDMARK_COLOR = json.loads((ROOT / "references" / "cuebook-visual-tokens-v1.json").read_text(encoding="utf-8"))["colors"]["ink"]

SPEC_FIELDS = {
    "schema_version",
    "spec_id",
    "revision",
    "state",
    "grammar",
    "payload_mode",
    "visual_job",
    "lineage",
    "frame",
    "data",
    "render",
    "quality_report",
}
MANIFEST_FIELDS = {
    "schema_version",
    "visual_id",
    "render_profile",
    "spec_ref",
    "grammar",
    "payload_mode",
    "visual_job",
    "state",
    "generated_at",
    "dimensions",
    "theme",
    "lineage",
    "content",
    "asset",
    "quality_report",
}
DATA_KEYS = ("series", "values", "levels", "events", "nodes", "edges", "rails", "stages")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def display_width(value: str) -> int:
    return sum(2 if unicodedata.east_asian_width(char) in {"W", "F", "A"} else 1 for char in value)


def check_object(
    value: Any,
    path: str,
    required: set[str],
    allowed: set[str],
    errors: list[dict[str, str]],
) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(issue("OBJECT", path, "Expected an object."))
        return {}
    for key in sorted(required - set(value)):
        errors.append(issue("MISSING_FIELD", f"{path}.{key}", "Required field is missing."))
    for key in sorted(set(value) - allowed):
        errors.append(issue("UNKNOWN_FIELD", f"{path}.{key}", "Unknown field."))
    return value


def parse_time(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
    if not nonempty(value):
        errors.append(issue("DATE_TIME", path, "Expected an RFC 3339 timestamp."))
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("DATE_TIME", path, "Expected an RFC 3339 timestamp."))
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        errors.append(issue("DATE_TIME_ZONE", path, "Timestamp must include a timezone."))
        return None
    return parsed


def string_list(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_LIST", path, "Expected an array of strings."))
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_LIST_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
        else:
            result.append(item.strip())
    if len(result) < minimum:
        errors.append(issue("STRING_LIST_MIN", path, f"Expected at least {minimum} item(s)."))
    if maximum is not None and len(result) > maximum:
        errors.append(issue("STRING_LIST_MAX", path, f"Expected at most {maximum} item(s)."))
    if len(set(result)) != len(result):
        errors.append(issue("STRING_LIST_UNIQUE", path, "Items must be unique."))
    return result


def public_text(value: Any, path: str, errors: list[dict[str, str]], *, maximum: int, units: int | None = None) -> str:
    if not nonempty(value):
        errors.append(issue("PUBLIC_TEXT", path, "Expected non-empty public text."))
        return ""
    text = re.sub(r"\s+", " ", str(value)).strip()
    if len(text) > maximum:
        errors.append(issue("PUBLIC_TEXT_LENGTH", path, f"Public text exceeds {maximum} characters."))
    if units is not None and display_width(text) > units:
        errors.append(issue("PUBLIC_TEXT_FIT", path, f"Public text exceeds the {units}-unit composition limit."))
    if PUBLIC_BACKEND_PATTERN.search(text) or any(term in text for term in PUBLIC_BACKEND_CJK):
        errors.append(issue("PUBLIC_BACKEND_TEXT", path, "Workflow, source, or settlement language cannot appear in public copy."))
    return text


def validate_quality(value: Any, state: Any, errors: list[dict[str, str]]) -> None:
    quality = check_object(
        value,
        "$.quality_report",
        {"decision", "warnings", "hard_failures"},
        {"decision", "warnings", "hard_failures"},
        errors,
    )
    decision = quality.get("decision")
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if decision == "blocked" and not failures:
        errors.append(issue("BLOCKED_FAILURES", "$.quality_report.hard_failures", "Blocked output requires a hard failure."))
    if decision != "blocked" and failures:
        errors.append(issue("HARD_FAILURES", "$.quality_report.hard_failures", "Renderable output cannot retain hard failures."))
    if state == "conditional" and decision not in {"conditional", "blocked"}:
        errors.append(issue("STATE_QUALITY", "$.quality_report.decision", "Conditional state requires conditional or blocked quality."))
    if state in {"ready", "frozen"} and decision != "ready":
        errors.append(issue("STATE_QUALITY", "$.quality_report.decision", "Ready or frozen state requires ready quality."))
    _ = warnings


def validate_source(ref: Any, path: str, lineage_sources: set[str], errors: list[dict[str, str]]) -> str | None:
    if not nonempty(ref):
        errors.append(issue("SOURCE_REF", path, "A source ref is required."))
        return None
    value = str(ref).strip()
    if value not in lineage_sources:
        errors.append(issue("SOURCE_LINEAGE", path, "Primitive source ref is missing from lineage.source_refs."))
    return value


def validate_series(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("SERIES", "$.data.series", "Expected an array."))
        return []
    if len(items) > 2:
        errors.append(issue("SERIES_COUNT", "$.data.series", "At most two series are supported."))
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(items):
        path = f"$.data.series[{index}]"
        series = check_object(item, path, {"id", "label", "role", "data_kind", "unit", "source_ref", "points"}, {"id", "label", "role", "data_kind", "unit", "source_ref", "points"}, errors)
        series_id = series.get("id")
        if not re.fullmatch(r"S[1-9][0-9]*", str(series_id or "")) or series_id in seen:
            errors.append(issue("SERIES_ID", f"{path}.id", "Expected a unique S<number> ID."))
        seen.add(series_id)
        public_text(series.get("label"), f"{path}.label", errors, maximum=28, units=24)
        if series.get("role") not in {"reaction", "primary", "comparison", "witness", "unwind", "level_test"}:
            errors.append(issue("SERIES_ROLE", f"{path}.role", "Unsupported series role."))
        if series.get("data_kind") != "observed":
            errors.append(issue("OBSERVED_ONLY", f"{path}.data_kind", "Only observed series can be rendered."))
        if not nonempty(series.get("unit")) or len(str(series.get("unit", ""))) > 12:
            errors.append(issue("UNIT", f"{path}.unit", "A unit of at most 12 characters is required."))
        validate_source(series.get("source_ref"), f"{path}.source_ref", sources, errors)
        points = series.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= 24:
            errors.append(issue("POINT_COUNT", f"{path}.points", "Series require two to 24 explicit points."))
            points = []
        x_values: list[float | datetime] = []
        x_kind: type | None = None
        for point_index, item_point in enumerate(points):
            point_path = f"{path}.points[{point_index}]"
            point = check_object(item_point, point_path, {"x", "y", "source_ref"}, {"x", "y", "source_ref"}, errors)
            x = point.get("x")
            parsed_x: float | datetime | None = None
            current_kind: type | None = None
            if is_number(x):
                parsed_x = float(x)
                current_kind = float
            elif isinstance(x, str):
                parsed_x = parse_time(x, f"{point_path}.x", errors)
                current_kind = datetime
            else:
                errors.append(issue("POINT_X", f"{point_path}.x", "Point x must be a finite number or timestamp."))
            if parsed_x is not None:
                if x_kind is None:
                    x_kind = current_kind
                elif x_kind is not current_kind:
                    errors.append(issue("POINT_X_KIND", f"{point_path}.x", "All point x values in a series must share one type."))
                x_values.append(parsed_x)
            if not is_number(point.get("y")):
                errors.append(issue("POINT_Y", f"{point_path}.y", "Point y must be finite."))
            if point.get("source_ref") is not None:
                validate_source(point.get("source_ref"), f"{point_path}.source_ref", sources, errors)
        if len(x_values) == len(points) and any(first >= second for first, second in zip(x_values, x_values[1:])):
            errors.append(issue("POINT_ORDER", f"{path}.points", "Point x values must be strictly increasing."))
        result.append(series)
    return result


def validate_values(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("VALUES", "$.data.values", "Expected an array."))
        return []
    if len(items) > 3:
        errors.append(issue("VALUE_COUNT", "$.data.values", "At most three values are supported."))
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    allowed = {"id", "label", "role", "display_value", "numeric_value", "unit", "as_of", "source_ref", "shape", "formula"}
    for index, item in enumerate(items):
        path = f"$.data.values[{index}]"
        value = check_object(item, path, allowed, allowed, errors)
        value_id = value.get("id")
        if not re.fullmatch(r"V[1-9][0-9]*", str(value_id or "")) or value_id in seen:
            errors.append(issue("VALUE_ID", f"{path}.id", "Expected a unique V<number> ID."))
        seen.add(value_id)
        public_text(value.get("label"), f"{path}.label", errors, maximum=32, units=28)
        public_text(value.get("display_value"), f"{path}.display_value", errors, maximum=20, units=18)
        if value.get("role") not in {"spread", "baseline", "witness", "current", "expected", "actual", "gap", "from", "to", "shock_primary", "shock_secondary"}:
            errors.append(issue("VALUE_ROLE", f"{path}.role", "Unsupported value role."))
        if not is_number(value.get("numeric_value")):
            errors.append(issue("VALUE_NUMBER", f"{path}.numeric_value", "Value must be finite."))
        if not nonempty(value.get("unit")) or len(str(value.get("unit", ""))) > 12:
            errors.append(issue("UNIT", f"{path}.unit", "A unit of at most 12 characters is required."))
        parse_time(value.get("as_of"), f"{path}.as_of", errors)
        validate_source(value.get("source_ref"), f"{path}.source_ref", sources, errors)
        if value.get("shape") not in SHAPES:
            errors.append(issue("SHAPE", f"{path}.shape", "Unsupported non-color marker shape."))
        if value.get("formula") is not None and not nonempty(value.get("formula")):
            errors.append(issue("FORMULA", f"{path}.formula", "Formula must be null or non-empty."))
        result.append(value)
    return result


def validate_levels(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("LEVELS", "$.data.levels", "Expected an array."))
        return []
    if len(items) > 1:
        errors.append(issue("LEVEL_COUNT", "$.data.levels", "At most one level is supported."))
    result: list[dict[str, Any]] = []
    allowed = {"id", "label", "role", "display_value", "numeric_value", "unit", "relation", "relation_label", "source_ref"}
    for index, item in enumerate(items):
        path = f"$.data.levels[{index}]"
        level = check_object(item, path, allowed, allowed, errors)
        if not re.fullmatch(r"L[1-9][0-9]*", str(level.get("id") or "")):
            errors.append(issue("LEVEL_ID", f"{path}.id", "Expected an L<number> ID."))
        public_text(level.get("label"), f"{path}.label", errors, maximum=32, units=28)
        public_text(level.get("display_value"), f"{path}.display_value", errors, maximum=20, units=18)
        public_text(level.get("relation_label"), f"{path}.relation_label", errors, maximum=24, units=22)
        if level.get("role") not in {"trigger", "threshold"}:
            errors.append(issue("LEVEL_ROLE", f"{path}.role", "Unsupported level role."))
        if not is_number(level.get("numeric_value")):
            errors.append(issue("LEVEL_NUMBER", f"{path}.numeric_value", "Level must be finite."))
        if not nonempty(level.get("unit")) or len(str(level.get("unit", ""))) > 12:
            errors.append(issue("UNIT", f"{path}.unit", "A unit of at most 12 characters is required."))
        if level.get("relation") not in {"above", "below", "at"}:
            errors.append(issue("LEVEL_RELATION", f"{path}.relation", "Relation must be above, below, or at."))
        validate_source(level.get("source_ref"), f"{path}.source_ref", sources, errors)
        result.append(level)
    return result


def validate_events(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("EVENTS", "$.data.events", "Expected an array."))
        return []
    if len(items) > 1:
        errors.append(issue("EVENT_COUNT", "$.data.events", "At most one event is supported."))
    result: list[dict[str, Any]] = []
    allowed = {"id", "label", "occurred_at", "source_ref"}
    for index, item in enumerate(items):
        path = f"$.data.events[{index}]"
        event = check_object(item, path, allowed, allowed, errors)
        if not re.fullmatch(r"EVT[1-9][0-9]*", str(event.get("id") or "")):
            errors.append(issue("EVENT_ID", f"{path}.id", "Expected an EVT<number> ID."))
        public_text(event.get("label"), f"{path}.label", errors, maximum=36, units=30)
        parse_time(event.get("occurred_at"), f"{path}.occurred_at", errors)
        validate_source(event.get("source_ref"), f"{path}.source_ref", sources, errors)
        result.append(event)
    return result


def validate_nodes(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("NODES", "$.data.nodes", "Expected an array."))
        return []
    if len(items) > 4:
        errors.append(issue("NODE_COUNT", "$.data.nodes", "At most four nodes are supported."))
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    allowed = {"id", "label", "role", "source_refs", "shape", "path_kind"}
    for index, item in enumerate(items):
        path = f"$.data.nodes[{index}]"
        node = check_object(item, path, allowed, allowed, errors)
        node_id = node.get("id")
        if not re.fullmatch(r"N[1-9][0-9]*", str(node_id or "")) or node_id in seen:
            errors.append(issue("NODE_ID", f"{path}.id", "Expected a unique N<number> ID."))
        seen.add(node_id)
        public_text(node.get("label"), f"{path}.label", errors, maximum=48, units=26)
        if node.get("role") not in {"frame_from", "frame_to", "policy_before", "policy_after", "loop"}:
            errors.append(issue("NODE_ROLE", f"{path}.role", "Unsupported node role."))
        node_sources = string_list(node.get("source_refs"), f"{path}.source_refs", errors, minimum=1)
        for source_index, ref in enumerate(node_sources):
            validate_source(ref, f"{path}.source_refs[{source_index}]", sources, errors)
        if node.get("shape") not in SHAPES:
            errors.append(issue("SHAPE", f"{path}.shape", "Unsupported non-color marker shape."))
        if node.get("path_kind") not in {"solid", "conditional", "future"}:
            errors.append(issue("PATH_KIND", f"{path}.path_kind", "Path kind must be solid, conditional, or future."))
        result.append(node)
    return result


def validate_edges(items: Any, nodes: list[dict[str, Any]], sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("EDGES", "$.data.edges", "Expected an array."))
        return []
    if len(items) > 4:
        errors.append(issue("EDGE_COUNT", "$.data.edges", "At most four edges are supported."))
    node_ids = {node.get("id") for node in nodes}
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    allowed = {"id", "from", "to", "relation", "label", "source_refs", "path_kind"}
    for index, item in enumerate(items):
        path = f"$.data.edges[{index}]"
        edge = check_object(item, path, allowed, allowed, errors)
        edge_id = edge.get("id")
        if not re.fullmatch(r"E[1-9][0-9]*", str(edge_id or "")) or edge_id in seen:
            errors.append(issue("EDGE_ID", f"{path}.id", "Expected a unique E<number> ID."))
        seen.add(edge_id)
        if edge.get("from") not in node_ids or edge.get("to") not in node_ids or edge.get("from") == edge.get("to"):
            errors.append(issue("EDGE_ENDPOINT", path, "Edge endpoints must name two distinct supplied nodes."))
        if edge.get("relation") not in {"reframes", "pivots", "reinforces", "dampens"}:
            errors.append(issue("EDGE_RELATION", f"{path}.relation", "Unsupported edge relation."))
        if edge.get("label") is not None:
            public_text(edge.get("label"), f"{path}.label", errors, maximum=24, units=20)
        edge_sources = string_list(edge.get("source_refs"), f"{path}.source_refs", errors, minimum=1)
        for source_index, ref in enumerate(edge_sources):
            validate_source(ref, f"{path}.source_refs[{source_index}]", sources, errors)
        if edge.get("path_kind") not in {"solid", "conditional", "future"}:
            errors.append(issue("PATH_KIND", f"{path}.path_kind", "Path kind must be solid, conditional, or future."))
        result.append(edge)
    return result


def validate_rails(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("RAILS", "$.data.rails", "Expected an array."))
        return []
    if len(items) > 2:
        errors.append(issue("RAIL_COUNT", "$.data.rails", "At most two outcome rails are supported."))
    allowed_roles = {
        "pressure", "response", "primary", "comparison", "spread", "trigger",
        "policy_before", "policy_after", "baseline", "witness", "expected", "actual", "from", "to",
    }
    allowed = {"id", "label", "detail", "role", "display_value", "numeric_value", "unit", "formula", "source_refs", "shape", "path_kind"}
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(items):
        path = f"$.data.rails[{index}]"
        rail = check_object(item, path, allowed, allowed, errors)
        rail_id = rail.get("id")
        if not re.fullmatch(r"R[1-9][0-9]*", str(rail_id or "")) or rail_id in seen:
            errors.append(issue("RAIL_ID", f"{path}.id", "Expected a unique R<number> ID."))
        seen.add(rail_id)
        public_text(rail.get("label"), f"{path}.label", errors, maximum=32, units=24)
        public_text(rail.get("detail"), f"{path}.detail", errors, maximum=72, units=44)
        if rail.get("display_value") is not None:
            public_text(rail.get("display_value"), f"{path}.display_value", errors, maximum=24, units=20)
        if rail.get("role") not in allowed_roles:
            errors.append(issue("RAIL_ROLE", f"{path}.role", "Unsupported rail role."))
        numeric = rail.get("numeric_value")
        if numeric is not None and not is_number(numeric):
            errors.append(issue("RAIL_NUMBER", f"{path}.numeric_value", "Rail numeric value must be null or finite."))
        unit = rail.get("unit")
        if unit is not None and (not nonempty(unit) or len(str(unit)) > 12):
            errors.append(issue("UNIT", f"{path}.unit", "Rail unit must be null or a non-empty string of at most 12 characters."))
        if numeric is not None and not nonempty(unit):
            errors.append(issue("RAIL_UNIT", f"{path}.unit", "A numeric rail requires an explicit unit."))
        if numeric is None and unit is not None:
            errors.append(issue("RAIL_UNIT", f"{path}.unit", "A non-numeric rail must not declare a unit."))
        if rail.get("formula") is not None:
            public_text(rail.get("formula"), f"{path}.formula", errors, maximum=96, units=44)
        refs = string_list(rail.get("source_refs"), f"{path}.source_refs", errors, minimum=1)
        for source_index, ref in enumerate(refs):
            validate_source(ref, f"{path}.source_refs[{source_index}]", sources, errors)
        if rail.get("shape") not in SHAPES:
            errors.append(issue("SHAPE", f"{path}.shape", "Unsupported non-color marker shape."))
        if rail.get("path_kind") not in {"solid", "conditional", "future"}:
            errors.append(issue("PATH_KIND", f"{path}.path_kind", "Path kind must be solid, conditional, or future."))
        result.append(rail)
    return result


def validate_stages(items: Any, sources: set[str], errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        errors.append(issue("STAGES", "$.data.stages", "Expected an array."))
        return []
    if len(items) > 3:
        errors.append(issue("STAGE_COUNT", "$.data.stages", "At most three timeline stages are supported."))
    allowed = {"id", "label", "detail", "role", "occurred_at", "display_value", "numeric_value", "unit", "source_refs", "shape", "path_kind"}
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(items):
        path = f"$.data.stages[{index}]"
        stage = check_object(item, path, allowed, allowed, errors)
        stage_id = stage.get("id")
        if not re.fullmatch(r"T[1-9][0-9]*", str(stage_id or "")) or stage_id in seen:
            errors.append(issue("STAGE_ID", f"{path}.id", "Expected a unique T<number> ID."))
        seen.add(stage_id)
        public_text(stage.get("label"), f"{path}.label", errors, maximum=32, units=24)
        public_text(stage.get("detail"), f"{path}.detail", errors, maximum=64, units=30)
        if stage.get("display_value") is not None:
            public_text(stage.get("display_value"), f"{path}.display_value", errors, maximum=24, units=18)
        if stage.get("role") not in {"pre_event", "event_day", "next_step"}:
            errors.append(issue("STAGE_ROLE", f"{path}.role", "Unsupported stage role."))
        if stage.get("occurred_at") is not None:
            parse_time(stage.get("occurred_at"), f"{path}.occurred_at", errors)
        numeric = stage.get("numeric_value")
        if numeric is not None and not is_number(numeric):
            errors.append(issue("STAGE_NUMBER", f"{path}.numeric_value", "Stage numeric value must be null or finite."))
        unit = stage.get("unit")
        if unit is not None and (not nonempty(unit) or len(str(unit)) > 12):
            errors.append(issue("UNIT", f"{path}.unit", "Stage unit must be null or a non-empty string of at most 12 characters."))
        if numeric is not None and not nonempty(unit):
            errors.append(issue("STAGE_UNIT", f"{path}.unit", "A numeric stage requires an explicit unit."))
        if numeric is None and unit is not None:
            errors.append(issue("STAGE_UNIT", f"{path}.unit", "A non-numeric stage must not declare a unit."))
        refs = string_list(stage.get("source_refs"), f"{path}.source_refs", errors, minimum=1)
        for source_index, ref in enumerate(refs):
            validate_source(ref, f"{path}.source_refs[{source_index}]", sources, errors)
        if stage.get("shape") not in SHAPES:
            errors.append(issue("SHAPE", f"{path}.shape", "Unsupported non-color marker shape."))
        if stage.get("path_kind") not in {"solid", "conditional", "future"}:
            errors.append(issue("PATH_KIND", f"{path}.path_kind", "Path kind must be solid, conditional, or future."))
        result.append(stage)
    return result


def relation_for(value: float, level: float) -> str:
    if math.isclose(value, level, rel_tol=1e-9, abs_tol=1e-9):
        return "at"
    return "above" if value > level else "below"


def point_times(series: dict[str, Any], errors: list[dict[str, str]], path: str) -> list[datetime]:
    result: list[datetime] = []
    for index, point in enumerate(series.get("points", [])):
        parsed = parse_time(point.get("x"), f"{path}.points[{index}].x", errors)
        if parsed is not None:
            result.append(parsed)
    return result


def require_empty(data: dict[str, list[Any]], allowed: set[str], errors: list[dict[str, str]]) -> None:
    for key in DATA_KEYS:
        if key not in allowed and data[key]:
            errors.append(issue("GRAMMAR_EXTRA_DATA", f"$.data.{key}", "This primitive is not used by the selected grammar."))


def require_roles(items: list[dict[str, Any]], roles: set[str], path: str, errors: list[dict[str, str]]) -> None:
    actual = {item.get("role") for item in items}
    if len(items) != len(roles) or actual != roles:
        errors.append(issue("GRAMMAR_ROLES", path, f"Expected exactly these roles: {', '.join(sorted(roles))}."))


def validate_event_series(
    series: dict[str, Any],
    event: dict[str, Any],
    errors: list[dict[str, str]],
    *,
    minimum_points: int,
    event_must_match: bool,
) -> tuple[list[datetime], int | None]:
    points = series.get("points", [])
    if len(points) < minimum_points:
        errors.append(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", f"This grammar requires at least {minimum_points} observed points."))
    times = point_times(series, errors, "$.data.series[0]")
    occurred = parse_time(event.get("occurred_at"), "$.data.events[0].occurred_at", errors)
    event_index: int | None = None
    if occurred is not None and len(times) == len(points):
        if not times or occurred < times[0] or occurred > times[-1]:
            errors.append(issue("EVENT_RANGE", "$.data.events[0].occurred_at", "Event must fall inside the observed series range."))
        for index, timestamp in enumerate(times):
            if timestamp == occurred:
                event_index = index
                break
        if event_must_match and event_index is None:
            errors.append(issue("EVENT_POINT", "$.data.events[0].occurred_at", "Event must match an observed point timestamp."))
    return times, event_index


def validate_rail_mode(rails: list[dict[str, Any]], roles: set[str], mode: str, errors: list[dict[str, str]]) -> None:
    require_roles(rails, roles, "$.data.rails", errors)
    if mode == "qualitative":
        for index, rail in enumerate(rails):
            if any(rail.get(key) is not None for key in ("display_value", "numeric_value", "unit")):
                errors.append(issue("QUALITATIVE_NUMERIC_DATA", f"$.data.rails[{index}]", "Qualitative rails must not carry numeric or display-value fields."))
    elif mode == "key_numbers":
        if not rails or not any(is_number(rail.get("numeric_value")) for rail in rails):
            errors.append(issue("KEY_NUMBER_REQUIRED", "$.data.rails", "Key-number rails require at least one explicit numeric value."))
        for index, rail in enumerate(rails):
            if not nonempty(rail.get("display_value")):
                errors.append(issue("KEY_NUMBER_DISPLAY", f"$.data.rails[{index}].display_value", "Every key-number rail requires an explicit display value."))


def validate_stage_mode(stages: list[dict[str, Any]], mode: str, errors: list[dict[str, str]]) -> None:
    require_roles(stages, {"pre_event", "event_day", "next_step"}, "$.data.stages", errors)
    if mode == "qualitative":
        for index, stage in enumerate(stages):
            if any(stage.get(key) is not None for key in ("display_value", "numeric_value", "unit")):
                errors.append(issue("QUALITATIVE_NUMERIC_DATA", f"$.data.stages[{index}]", "Qualitative stages must not carry numeric or display-value fields."))
    elif mode == "key_numbers":
        if not stages or not any(is_number(stage.get("numeric_value")) for stage in stages):
            errors.append(issue("KEY_NUMBER_REQUIRED", "$.data.stages", "Key-number stages require at least one explicit numeric value."))
        for index, stage in enumerate(stages):
            if stage.get("numeric_value") is not None and not nonempty(stage.get("display_value")):
                errors.append(issue("KEY_NUMBER_DISPLAY", f"$.data.stages[{index}].display_value", "Numeric stages require an explicit display value."))


def validate_synchronized_series(series: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    if len(series) != 2:
        return
    first_times = point_times(series[0], errors, "$.data.series[0]")
    second_times = point_times(series[1], errors, "$.data.series[1]")
    if first_times != second_times:
        errors.append(issue("SYNCHRONIZED_SERIES", "$.data.series", "Series-mode comparison requires identical timestamps."))
    if series[0].get("unit") != series[1].get("unit"):
        errors.append(issue("COMPARABLE_UNITS", "$.data.series", "Series-mode comparison requires matching units."))


def validate_grammar(data: dict[str, list[Any]], grammar: str, mode: str, errors: list[dict[str, str]]) -> None:
    series, values, levels, events, nodes, edges, rails, stages = (data[key] for key in DATA_KEYS)
    if grammar != "feedback_loop" and len(nodes) > 2:
        errors.append(issue("LANDSCAPE_NODE_LIMIT", "$.data.nodes", "Landscape visuals allow at most two reasoning nodes unless the grammar is feedback_loop."))
    if grammar != "factor_rotation" and any(rail.get("formula") is not None for rail in rails):
        errors.append(issue("FORMULA_GRAMMAR", "$.data.rails", "Rail formulas are reserved for factor_rotation."))

    if grammar == "reaction_test":
        if mode == "series":
            require_empty(data, {"series", "events"}, errors)
            require_roles(series, {"reaction"}, "$.data.series", errors)
            if len(events) != 1:
                errors.append(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "Series reaction_test requires exactly one event."))
            if len(series) == 1 and len(events) == 1:
                times, _ = validate_event_series(series[0], events[0], errors, minimum_points=3, event_must_match=False)
                occurred = parse_time(events[0].get("occurred_at"), "$.data.events[0].occurred_at", errors)
                if occurred is not None and times and not (times[0] < occurred < times[-1]):
                    errors.append(issue("REACTION_WINDOW", "$.data.events[0].occurred_at", "Series reaction_test needs observations before and after the event."))
        else:
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"pressure", "response"}, mode, errors)

    elif grammar == "parallel_contrast":
        if mode == "series":
            require_empty(data, {"series"}, errors)
            require_roles(series, {"primary", "comparison"}, "$.data.series", errors)
            validate_synchronized_series(series, errors)
        else:
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"primary", "comparison"}, mode, errors)

    elif grammar == "category_reframe":
        require_empty(data, {"nodes", "edges"}, errors)
        require_roles(nodes, {"frame_from", "frame_to"}, "$.data.nodes", errors)
        if len(edges) != 1 or edges[0].get("relation") != "reframes":
            errors.append(issue("REFRAME_EDGE", "$.data.edges", "category_reframe requires one reframes edge."))

    elif grammar == "relative_value_trigger":
        if mode == "qualitative":
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"spread", "trigger"}, mode, errors)
        else:
            require_empty(data, {"values", "levels"}, errors)
            require_roles(values, {"spread"}, "$.data.values", errors)
            require_roles(levels, {"trigger"}, "$.data.levels", errors)
            validate_value_level(values, levels, errors)

    elif grammar == "policy_pivot":
        if len(events) != 1:
            errors.append(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "policy_pivot requires exactly one event."))
        if mode == "qualitative":
            require_empty(data, {"events", "nodes", "edges"}, errors)
            require_roles(nodes, {"policy_before", "policy_after"}, "$.data.nodes", errors)
            if len(edges) != 1 or edges[0].get("relation") != "pivots":
                errors.append(issue("PIVOT_EDGE", "$.data.edges", "Qualitative policy_pivot requires one pivots edge."))
        else:
            require_empty(data, {"events", "rails"}, errors)
            validate_rail_mode(rails, {"policy_before", "policy_after"}, mode, errors)

    elif grammar == "sentiment_witness":
        if mode == "series":
            require_empty(data, {"series"}, errors)
            require_roles(series, {"witness"}, "$.data.series", errors)
            if len(series) == 1 and len(series[0].get("points", [])) < 3:
                errors.append(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", "Series sentiment_witness requires at least three observations."))
            if len(series) == 1:
                point_times(series[0], errors, "$.data.series[0]")
        else:
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"baseline", "witness"}, mode, errors)

    elif grammar == "event_unwind":
        if mode == "series":
            require_empty(data, {"series", "events"}, errors)
            require_roles(series, {"unwind"}, "$.data.series", errors)
            if len(events) != 1:
                errors.append(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "Series event_unwind requires exactly one event."))
            if len(series) == 1 and len(events) == 1:
                _, event_index = validate_event_series(series[0], events[0], errors, minimum_points=4, event_must_match=True)
                points = series[0].get("points", [])
                if event_index is not None:
                    if event_index == 0 or event_index >= len(points) - 1:
                        errors.append(issue("UNWIND_EVENT_POSITION", "$.data.events[0].occurred_at", "Series event_unwind needs a pre-event baseline and post-event observations."))
                    elif all(is_number(point.get("y")) for point in points):
                        baseline = float(points[0]["y"])
                        deviations = [abs(float(point["y"]) - baseline) for point in points[event_index:]]
                        if not deviations or max(deviations) <= 0 or not deviations[-1] < max(deviations):
                            errors.append(issue("UNWIND_ARITHMETIC", "$.data.series[0].points", "Final value must retrace from the post-event extreme toward the first value."))
        else:
            require_empty(data, {"stages"}, errors)
            validate_stage_mode(stages, mode, errors)

    elif grammar == "feedback_loop":
        allowed = {"nodes", "edges", "values"} if mode == "mixed" else {"nodes", "edges"}
        require_empty(data, allowed, errors)
        if not 3 <= len(nodes) <= 4 or any(node.get("role") != "loop" for node in nodes):
            errors.append(issue("LOOP_NODES", "$.data.nodes", "feedback_loop requires three or four loop nodes."))
        if len(edges) != len(nodes) or any(edge.get("relation") not in {"reinforces", "dampens"} for edge in edges):
            errors.append(issue("LOOP_EDGES", "$.data.edges", "feedback_loop requires one reinforcing or dampening edge per node."))
        validate_cycle(nodes, edges, errors)
        if mode == "mixed":
            require_roles(values, {"shock_primary", "shock_secondary"}, "$.data.values", errors)
            validate_same_units(values, "$.data.values", errors)
            for index, value in enumerate(values):
                if display_width(str(value.get("label") or "")) > 13:
                    errors.append(issue("MIXED_VALUE_FIT", f"$.data.values[{index}].label", "Mixed feedback shock labels must fit the compact value panel."))
            for index, node in enumerate(nodes):
                if display_width(str(node.get("label") or "")) > 18:
                    errors.append(issue("MIXED_NODE_FIT", f"$.data.nodes[{index}].label", "Mixed feedback loop labels must fit the compact loop."))

    elif grammar == "binary_level":
        if mode == "series":
            require_empty(data, {"series", "levels"}, errors)
            require_roles(series, {"level_test"}, "$.data.series", errors)
            require_roles(levels, {"threshold"}, "$.data.levels", errors)
            validate_series_level(series, levels, errors)
        else:
            require_empty(data, {"values", "levels"}, errors)
            require_roles(values, {"current"}, "$.data.values", errors)
            require_roles(levels, {"threshold"}, "$.data.levels", errors)
            validate_value_level(values, levels, errors)

    elif grammar == "expectation_gap":
        if mode == "qualitative":
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"expected", "actual"}, mode, errors)
        else:
            require_empty(data, {"values"}, errors)
            require_roles(values, {"expected", "actual", "gap"}, "$.data.values", errors)
            validate_same_units(values, "$.data.values", errors)
            by_role = {value.get("role"): value for value in values}
            if set(by_role) == {"expected", "actual", "gap"} and all(is_number(item.get("numeric_value")) for item in by_role.values()):
                expected = float(by_role["expected"]["numeric_value"])
                actual = float(by_role["actual"]["numeric_value"])
                gap = float(by_role["gap"]["numeric_value"])
                if not math.isclose(gap, actual - expected, rel_tol=1e-9, abs_tol=1e-9):
                    errors.append(issue("EXPECTATION_GAP", "$.data.values", "Explicit gap must equal actual minus expected."))
                if not nonempty(by_role["gap"].get("formula")):
                    errors.append(issue("EXPECTATION_FORMULA", "$.data.values", "The gap value requires an explicit formula."))

    elif grammar == "factor_rotation":
        if mode == "series":
            require_empty(data, {"series"}, errors)
            require_roles(series, {"primary", "comparison"}, "$.data.series", errors)
            validate_synchronized_series(series, errors)
        else:
            require_empty(data, {"rails"}, errors)
            validate_rail_mode(rails, {"from", "to"}, mode, errors)
            if mode == "qualitative" and not any(nonempty(rail.get("formula")) for rail in rails):
                errors.append(issue("FACTOR_FORMULA", "$.data.rails", "Qualitative factor_rotation requires an explicit formula on one rail."))
            if mode != "qualitative" and any(rail.get("formula") is not None for rail in rails):
                errors.append(issue("FACTOR_FORMULA_MODE", "$.data.rails", "Rail formulas without current values belong in qualitative factor_rotation mode."))


def validate_same_units(items: list[dict[str, Any]], path: str, errors: list[dict[str, str]]) -> None:
    units = {item.get("unit") for item in items if nonempty(item.get("unit"))}
    if len(units) > 1:
        errors.append(issue("COMPARABLE_UNITS", path, "Compared values must share one unit."))


def validate_value_level(values: list[dict[str, Any]], levels: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    if len(values) != 1 or len(levels) != 1:
        return
    value, level = values[0], levels[0]
    if value.get("unit") != level.get("unit"):
        errors.append(issue("COMPARABLE_UNITS", "$.data", "Value and level must share one unit."))
    if is_number(value.get("numeric_value")) and is_number(level.get("numeric_value")):
        observed = relation_for(float(value["numeric_value"]), float(level["numeric_value"]))
        if level.get("relation") != observed:
            errors.append(issue("LEVEL_RELATION_MISMATCH", "$.data.levels[0].relation", f"Numeric inputs imply relation '{observed}'."))


def validate_series_level(series: list[dict[str, Any]], levels: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    if len(series) != 1 or len(levels) != 1:
        return
    item, level = series[0], levels[0]
    if item.get("unit") != level.get("unit"):
        errors.append(issue("COMPARABLE_UNITS", "$.data", "Observed path and level must share one unit."))
    points = item.get("points", [])
    if len(points) < 3:
        errors.append(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", "Series binary_level requires at least three observed points."))
    point_times(item, errors, "$.data.series[0]")
    if points and is_number(points[-1].get("y")) and is_number(level.get("numeric_value")):
        observed = relation_for(float(points[-1]["y"]), float(level["numeric_value"]))
        if level.get("relation") != observed:
            errors.append(issue("LEVEL_RELATION_MISMATCH", "$.data.levels[0].relation", f"Final observed point implies relation '{observed}'."))


def validate_cycle(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], errors: list[dict[str, str]]) -> None:
    node_ids = {node.get("id") for node in nodes}
    if not node_ids or len(edges) != len(node_ids):
        return
    outgoing: dict[Any, list[Any]] = {node_id: [] for node_id in node_ids}
    incoming: dict[Any, int] = {node_id: 0 for node_id in node_ids}
    for edge in edges:
        source, target = edge.get("from"), edge.get("to")
        if source in outgoing and target in incoming:
            outgoing[source].append(target)
            incoming[target] += 1
    if any(len(outgoing[node_id]) != 1 or incoming[node_id] != 1 for node_id in node_ids):
        errors.append(issue("LOOP_TOPOLOGY", "$.data.edges", "Every loop node must have one incoming and one outgoing edge."))
        return
    start = next(iter(node_ids))
    visited: set[Any] = set()
    current = start
    while current not in visited:
        visited.add(current)
        current = outgoing[current][0]
    if current != start or visited != node_ids:
        errors.append(issue("LOOP_TOPOLOGY", "$.data.edges", "Edges must form one closed cycle containing every node."))


def validate_spec(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    check_object(payload, "$", SPEC_FIELDS, SPEC_FIELDS, errors)
    if payload.get("schema_version") != "viewpoint-visual-spec-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-visual-spec-v1."))
    if not re.fullmatch(r"VVSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("spec_id") or "")):
        errors.append(issue("SPEC_ID", "$.spec_id", "Invalid viewpoint visual spec ID."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    grammar = payload.get("grammar")
    payload_mode = payload.get("payload_mode")
    if grammar not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.grammar", "Unsupported viewpoint grammar."))
    else:
        if payload.get("visual_job") != GRAMMAR_JOBS[grammar]:
            errors.append(issue("VISUAL_JOB", "$.visual_job", f"{grammar} requires visual_job '{GRAMMAR_JOBS[grammar]}'."))
        if payload_mode not in SUPPORTED_MODES[grammar]:
            modes = ", ".join(sorted(SUPPORTED_MODES[grammar]))
            errors.append(issue("PAYLOAD_MODE", "$.payload_mode", f"{grammar} supports: {modes}."))

    lineage = check_object(payload.get("lineage"), "$.lineage", {"input_artifact_refs", "source_refs", "decision_cutoff_at"}, {"input_artifact_refs", "source_refs", "decision_cutoff_at"}, errors)
    string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, minimum=1)
    source_list = string_list(lineage.get("source_refs"), "$.lineage.source_refs", errors, minimum=1)
    source_set = set(source_list)
    cutoff = parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    frame = check_object(payload.get("frame"), "$.frame", {"headline", "observation", "observed_at", "strategy_tags", "alt_text"}, {"headline", "observation", "observed_at", "strategy_tags", "alt_text"}, errors)
    public_text(frame.get("headline"), "$.frame.headline", errors, maximum=96, units=84)
    public_text(frame.get("observation"), "$.frame.observation", errors, maximum=120, units=120)
    observed_at = parse_time(frame.get("observed_at"), "$.frame.observed_at", errors)
    tags = string_list(frame.get("strategy_tags"), "$.frame.strategy_tags", errors, minimum=1, maximum=4)
    for index, tag in enumerate(tags):
        public_text(tag, f"$.frame.strategy_tags[{index}]", errors, maximum=20, units=18)
    if display_width(" / ".join(tags)) > 58:
        errors.append(issue("STRATEGY_TAG_FIT", "$.frame.strategy_tags", "Strategy tags exceed the compact header width."))
    public_text(frame.get("alt_text"), "$.frame.alt_text", errors, maximum=320)
    if cutoff is not None and observed_at is not None and observed_at > cutoff:
        errors.append(issue("OBSERVATION_CUTOFF", "$.frame.observed_at", "Observation time cannot exceed the decision cutoff."))

    data_obj = check_object(payload.get("data"), "$.data", set(DATA_KEYS), set(DATA_KEYS), errors)
    data = {key: data_obj.get(key, []) for key in DATA_KEYS}
    series = validate_series(data["series"], source_set, errors)
    values = validate_values(data["values"], source_set, errors)
    levels = validate_levels(data["levels"], source_set, errors)
    events = validate_events(data["events"], source_set, errors)
    nodes = validate_nodes(data["nodes"], source_set, errors)
    edges = validate_edges(data["edges"], nodes, source_set, errors)
    rails = validate_rails(data["rails"], source_set, errors)
    stages = validate_stages(data["stages"], source_set, errors)
    validated_data = {
        "series": series,
        "values": values,
        "levels": levels,
        "events": events,
        "nodes": nodes,
        "edges": edges,
        "rails": rails,
        "stages": stages,
    }
    if grammar in GRAMMARS and payload_mode in SUPPORTED_MODES[grammar]:
        validate_grammar(validated_data, grammar, payload_mode, errors)

    render = check_object(payload.get("render"), "$.render", {"layout", "width", "height", "theme", "watermark", "generated_at"}, {"layout", "width", "height", "theme", "watermark", "generated_at"}, errors)
    expected = {"layout": "landscape", "width": 720, "height": 420, "theme": "cuebook_accessible_light", "watermark": "Cuebook"}
    for key, expected_value in expected.items():
        if render.get(key) != expected_value:
            errors.append(issue("RENDER_CONTRACT", f"$.render.{key}", f"Expected {expected_value!r}."))
    generated_at = parse_time(render.get("generated_at"), "$.render.generated_at", errors)
    if cutoff is not None and generated_at is not None and generated_at < cutoff:
        errors.append(issue("GENERATED_AT", "$.render.generated_at", "Generation time cannot precede the decision cutoff."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def safe_asset_path(ref: Any, root: Path, path: str, errors: list[dict[str, str]]) -> Path | None:
    if not nonempty(ref):
        errors.append(issue("ASSET_REF", path, "Asset ref is required."))
        return None
    candidate = Path(str(ref))
    if candidate.is_absolute() or ".." in candidate.parts:
        errors.append(issue("ASSET_REF", path, "Asset ref must be a safe relative path."))
        return None
    return root / candidate


def png_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        data = path.read_bytes()[:24]
    except OSError:
        return None
    if len(data) != 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def verify_hash(path: Path, expected: Any, hash_path: str, errors: list[dict[str, str]]) -> bytes | None:
    if not path.is_file():
        errors.append(issue("ASSET_MISSING", hash_path, f"Asset does not exist: {path}."))
        return None
    data = path.read_bytes()
    observed = "sha256:" + hashlib.sha256(data).hexdigest()
    if observed != expected:
        errors.append(issue("ASSET_HASH", hash_path, "Asset bytes do not match the declared hash."))
    return data


def validate_canonical_wordmark(svg_text: str, errors: list[dict[str, str]]) -> None:
    matches = list(re.finditer(r'(<g\b(?=[^>]*data-cuebook-wordmark="v1")[^>]*>(.*?)</g>)', svg_text, flags=re.S))
    if len(matches) != 1:
        errors.append(issue("WORDMARK_REQUIRED", "$.asset.svg", "SVG must contain exactly one canonical Cuebook wordmark group."))
        return
    match = matches[0]
    opening = match.group(1).split(">", 1)[0]
    body = match.group(2)
    if not all(token in opening for token in ('data-role="brand"', 'transform="translate(625 388)"', f'color="{CANONICAL_WORDMARK_COLOR}"')):
        errors.append(issue("WORDMARK_GEOMETRY", "$.asset.svg", "Cuebook wordmark must use the canonical bottom-right geometry and ink color."))
    if re.findall(r'<path d="([^"]+)"', body) != CANONICAL_WORDMARK_PATHS:
        errors.append(issue("WORDMARK_PATHS", "$.asset.svg", "Cuebook wordmark paths do not match the canonical product asset."))
    if body.count('fill="currentColor"') != len(CANONICAL_WORDMARK_PATHS) or "<text" in body:
        errors.append(issue("WORDMARK_FILL", "$.asset.svg", "Cuebook wordmark must be path-only and inherit currentColor."))
    if not re.fullmatch(r"\s*</svg>\s*", svg_text[match.end():]):
        errors.append(issue("WORDMARK_LAYER", "$.asset.svg", "Cuebook wordmark must be the final SVG visual layer."))


def validate_wide_html(html_text: str, errors: list[dict[str, str]], font_manifest_ref: str | None = None) -> None:
    if not re.search(r'data-cuebook-visual-contract=["\']launch-v1["\']', html_text, flags=re.I):
        errors.append(issue("HTML_CONTRACT", "$.asset.html", "Wide HTML must declare the Cuebook launch visual contract."))
    if not re.search(r'data-font-profile=["\']cuebook-noi-v1["\']', html_text, flags=re.I):
        errors.append(issue("FONT_PROFILE", "$.asset.html", "Wide HTML must declare the cuebook-noi-v1 font profile."))
    if not re.search(r'data-font-license-mode=["\']production["\']', html_text, flags=re.I):
        errors.append(issue("FONT_LICENSE_MODE", "$.asset.html", "Wide HTML must use production font license mode."))
    if font_manifest_ref and not re.search(rf'data-font-manifest-ref=["\']{re.escape(font_manifest_ref)}["\']', html_text, flags=re.I):
        errors.append(issue("FONT_MANIFEST_REF", "$.asset.html", "Wide HTML does not bind the declared font manifest ref."))
    match = re.search(
        r'<svg\b(?=[^>]*data-cuebook-wordmark=["\']v1["\'])[^>]*>(.*?)</svg>',
        html_text,
        flags=re.I | re.S,
    )
    if not match:
        errors.append(issue("WORDMARK_REQUIRED", "$.asset.html", "Wide HTML must contain the canonical Cuebook wordmark SVG."))
        return
    if re.findall(r'<path\s+d="([^"]+)"', match.group(1)) != CANONICAL_WORDMARK_PATHS:
        errors.append(issue("WORDMARK_PATHS", "$.asset.html", "Wide HTML wordmark paths do not match the canonical product asset."))
    if len(re.findall(r'fill=["\']currentColor["\']', match.group(1), flags=re.I)) != len(CANONICAL_WORDMARK_PATHS):
        errors.append(issue("WORDMARK_FILL", "$.asset.html", "Wide HTML wordmark paths must inherit currentColor."))


def validate_production_font_manifest(data: bytes, manifest_path: Path, errors: list[dict[str, str]]) -> None:
    try:
        manifest = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        errors.append(issue("FONT_MANIFEST_JSON", "$.asset.font_manifest", "Font manifest must be valid UTF-8 JSON."))
        return
    if manifest.get("schema_version") != "cuebook-font-assets-v1" or manifest.get("font_profile_id") != "cuebook-noi-v1":
        errors.append(issue("FONT_MANIFEST_PROFILE", "$.asset.font_manifest", "Font manifest must bind cuebook-noi-v1."))
    if manifest.get("license_mode") != "production" or manifest.get("release_eligible") is not True:
        errors.append(issue("FONT_MANIFEST_LICENSE", "$.asset.font_manifest", "Font manifest must be release-eligible production material."))
    license_ref = str(manifest.get("license_ref") or "")
    if len(license_ref) < 6 or re.search(r"trial|eval", license_ref, flags=re.I):
        errors.append(issue("FONT_LICENSE_REF", "$.asset.font_manifest", "Production font manifest needs an opaque non-evaluation license_ref."))
    css_ref = manifest.get("css_ref")
    css_path = safe_asset_path(css_ref, manifest_path.parent, "$.asset.font_manifest.css_ref", errors)
    if css_path is not None and HASH_PATTERN.fullmatch(str(manifest.get("css_sha256") or "")):
        verify_hash(css_path, manifest.get("css_sha256"), "$.asset.font_manifest.css_sha256", errors)
    else:
        errors.append(issue("FONT_CSS_HASH", "$.asset.font_manifest.css_sha256", "Font CSS needs a valid SHA-256 hash."))
    files = manifest.get("files")
    if not isinstance(files, list) or {item.get("weight") for item in files if isinstance(item, dict)} != {400, 500, 600, 700}:
        errors.append(issue("FONT_WEIGHTS", "$.asset.font_manifest.files", "Font manifest must bind upright weights 400, 500, 600, and 700."))
        return
    for index, item in enumerate(files):
        ref = item.get("ref")
        if re.search(r"trial", str(ref or "") + str(item.get("source_name") or ""), flags=re.I):
            errors.append(issue("TRIAL_FONT_RELEASE", f"$.asset.font_manifest.files[{index}]", "Production font manifest cannot reference Trial assets."))
        font_path = safe_asset_path(ref, manifest_path.parent, f"$.asset.font_manifest.files[{index}].ref", errors)
        if font_path is not None and HASH_PATTERN.fullmatch(str(item.get("sha256") or "")):
            verify_hash(font_path, item.get("sha256"), f"$.asset.font_manifest.files[{index}].sha256", errors)
        else:
            errors.append(issue("FONT_ASSET_HASH", f"$.asset.font_manifest.files[{index}].sha256", "Font asset needs a valid SHA-256 hash."))


def validate_manifest(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    check_object(payload, "$", MANIFEST_FIELDS, MANIFEST_FIELDS, errors)
    if payload.get("schema_version") != "viewpoint-visual-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-visual-v1."))
    if not re.fullmatch(r"VVIS_[A-Za-z0-9_:-]{8,}", str(payload.get("visual_id") or "")):
        errors.append(issue("VISUAL_ID", "$.visual_id", "Invalid viewpoint visual ID."))
    render_profile = payload.get("render_profile")
    profile_contracts = {
        "wide_2680": {
            "source_kind": "html",
            "spec_pattern": r"VDIR_[A-Za-z0-9_:-]{8,}",
            "dimensions": {"width": 2680, "height": 1056},
            "derivatives": {"full": (2680, 1056), "compact_670": (670, 264)},
        },
        "legacy_720": {
            "source_kind": "svg",
            "spec_pattern": r"VVSPEC_[A-Za-z0-9_:-]{8,}",
            "dimensions": {"width": 720, "height": 420},
            "derivatives": {"full": (720, 420), "compact_360": (360, 210)},
        },
    }
    profile_contract = profile_contracts.get(render_profile)
    if profile_contract is None:
        errors.append(issue("RENDER_PROFILE", "$.render_profile", "Expected wide_2680 or legacy_720."))
    elif not re.fullmatch(profile_contract["spec_pattern"], str(payload.get("spec_ref") or "")):
        errors.append(issue("SPEC_REF", "$.spec_ref", f"Invalid source ref for {render_profile}."))
    grammar = payload.get("grammar")
    payload_mode = payload.get("payload_mode")
    if render_profile == "wide_2680":
        if grammar not in WIDE_GRAMMARS:
            errors.append(issue("GRAMMAR", "$.grammar", "Unsupported wide viewpoint argument pattern."))
        if payload.get("visual_job") != "render_selected_direction":
            errors.append(issue("VISUAL_JOB", "$.visual_job", "Wide viewpoints render the selected HTML direction."))
        if payload_mode not in {"qualitative", "key_numbers", "series", "mixed"}:
            errors.append(issue("PAYLOAD_MODE", "$.payload_mode", "Unsupported wide viewpoint payload mode."))
    elif grammar not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.grammar", "Unsupported legacy viewpoint grammar."))
    else:
        if payload.get("visual_job") != GRAMMAR_JOBS[grammar]:
            errors.append(issue("VISUAL_JOB", "$.visual_job", "Visual job does not match grammar."))
        if payload_mode not in SUPPORTED_MODES[grammar]:
            errors.append(issue("PAYLOAD_MODE", "$.payload_mode", "Payload mode is not supported by this grammar."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    parse_time(payload.get("generated_at"), "$.generated_at", errors)
    dimensions = check_object(payload.get("dimensions"), "$.dimensions", {"width", "height"}, {"width", "height"}, errors)
    if profile_contract is not None and dimensions != profile_contract["dimensions"]:
        expected = profile_contract["dimensions"]
        errors.append(issue("DIMENSIONS", "$.dimensions", f"{render_profile} visuals use {expected['width']} x {expected['height']}."))
    theme = payload.get("theme")
    if render_profile == "wide_2680":
        if not isinstance(theme, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+){1,5}", theme):
            errors.append(issue("THEME", "$.theme", "Wide viewpoints bind a registered lowercase hyphenated palette preset."))
    elif theme != "cuebook_accessible_light":
        errors.append(issue("THEME", "$.theme", "Legacy viewpoints use cuebook_accessible_light."))

    lineage_fields = {"input_artifact_refs", "source_refs", "series_refs", "value_refs", "level_refs", "event_refs", "node_refs", "edge_refs", "rail_refs", "stage_refs", "decision_cutoff_at"}
    lineage = check_object(payload.get("lineage"), "$.lineage", lineage_fields, lineage_fields, errors)
    string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, minimum=1)
    string_list(lineage.get("source_refs"), "$.lineage.source_refs", errors, minimum=1)
    for key in ("series_refs", "value_refs", "level_refs", "event_refs", "node_refs", "edge_refs", "rail_refs", "stage_refs"):
        string_list(lineage.get(key), f"$.lineage.{key}", errors)
    parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    content_fields = {"headline", "observation", "observed_at", "strategy_tags", "alt_text", "watermark"}
    content = check_object(payload.get("content"), "$.content", content_fields, content_fields, errors)
    public_text(content.get("headline"), "$.content.headline", errors, maximum=96, units=84)
    public_text(content.get("observation"), "$.content.observation", errors, maximum=120, units=120)
    parse_time(content.get("observed_at"), "$.content.observed_at", errors)
    tags = string_list(content.get("strategy_tags"), "$.content.strategy_tags", errors, minimum=1, maximum=4)
    for index, tag in enumerate(tags):
        public_text(tag, f"$.content.strategy_tags[{index}]", errors, maximum=20, units=18)
    public_text(content.get("alt_text"), "$.content.alt_text", errors, maximum=320)
    if content.get("watermark") != "Cuebook":
        errors.append(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."))

    asset_fields = {"html", "svg", "font_manifest", "png_derivatives", "derivative_bundle_hash"}
    required_asset_fields = asset_fields if render_profile == "wide_2680" else asset_fields - {"font_manifest"}
    asset = check_object(payload.get("asset"), "$.asset", required_asset_fields, asset_fields, errors)
    source_kind = profile_contract["source_kind"] if profile_contract is not None else "html"
    alternate_kind = "svg" if source_kind == "html" else "html"
    primary_asset = check_object(asset.get(source_kind), f"$.asset.{source_kind}", {"ref", "sha256"}, {"ref", "sha256"}, errors)
    if asset.get(alternate_kind) is not None:
        errors.append(issue("ASSET_PROFILE", f"$.asset.{alternate_kind}", f"{render_profile} must not bind a {alternate_kind.upper()} source asset."))
    if not HASH_PATTERN.fullmatch(str(primary_asset.get("sha256") or "")):
        errors.append(issue("ASSET_HASH_FORMAT", f"$.asset.{source_kind}.sha256", "Expected sha256:<64 lowercase hex characters>."))
    font_manifest_asset: dict[str, Any] = {}
    if render_profile == "wide_2680":
        font_manifest_asset = check_object(asset.get("font_manifest"), "$.asset.font_manifest", {"ref", "sha256"}, {"ref", "sha256"}, errors)
        if not HASH_PATTERN.fullmatch(str(font_manifest_asset.get("sha256") or "")):
            errors.append(issue("ASSET_HASH_FORMAT", "$.asset.font_manifest.sha256", "Expected sha256:<64 lowercase hex characters>."))
    derivatives = asset.get("png_derivatives")
    if not isinstance(derivatives, list) or len(derivatives) not in {0, 2}:
        errors.append(issue("DERIVATIVE_PAIR", "$.asset.png_derivatives", "PNG derivatives must be absent or contain the full atomic pair."))
        derivatives = []
    if render_profile == "wide_2680" and not derivatives:
        errors.append(issue("DERIVATIVE_REQUIRED", "$.asset.png_derivatives", "The launch wide profile requires both final PNG derivatives."))
    expected_sizes = profile_contract["derivatives"] if profile_contract is not None else {}
    seen_kinds: set[str] = set()
    parsed_derivatives: list[dict[str, Any]] = []
    for index, item in enumerate(derivatives):
        path = f"$.asset.png_derivatives[{index}]"
        derivative = check_object(item, path, {"kind", "ref", "width", "height", "sha256"}, {"kind", "ref", "width", "height", "sha256"}, errors)
        kind = derivative.get("kind")
        if kind not in expected_sizes or kind in seen_kinds:
            compact_kind = next((key for key in expected_sizes if key != "full"), "profile-specific compact")
            errors.append(issue("DERIVATIVE_KIND", f"{path}.kind", f"Expected one full and one {compact_kind} derivative."))
        else:
            seen_kinds.add(kind)
            if (derivative.get("width"), derivative.get("height")) != expected_sizes[kind]:
                errors.append(issue("DERIVATIVE_DIMENSIONS", path, f"{kind} must use {expected_sizes[kind][0]} x {expected_sizes[kind][1]}."))
        if not HASH_PATTERN.fullmatch(str(derivative.get("sha256") or "")):
            errors.append(issue("ASSET_HASH_FORMAT", f"{path}.sha256", "Expected sha256:<64 lowercase hex characters>."))
        parsed_derivatives.append(derivative)
    bundle_hash = asset.get("derivative_bundle_hash")
    if derivatives and not HASH_PATTERN.fullmatch(str(bundle_hash or "")):
        errors.append(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Completed derivatives require a bundle hash."))
    if not derivatives and bundle_hash is not None:
        errors.append(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Bundle hash must be null without derivatives."))

    if asset_root is not None:
        if render_profile == "wide_2680":
            font_manifest_path = safe_asset_path(font_manifest_asset.get("ref"), asset_root, "$.asset.font_manifest.ref", errors)
            if font_manifest_path is not None and HASH_PATTERN.fullmatch(str(font_manifest_asset.get("sha256") or "")):
                font_manifest_data = verify_hash(font_manifest_path, font_manifest_asset.get("sha256"), "$.asset.font_manifest.sha256", errors)
                if font_manifest_data is not None:
                    validate_production_font_manifest(font_manifest_data, font_manifest_path, errors)
        primary_path = safe_asset_path(primary_asset.get("ref"), asset_root, f"$.asset.{source_kind}.ref", errors)
        if primary_path is not None and HASH_PATTERN.fullmatch(str(primary_asset.get("sha256") or "")):
            primary_data = verify_hash(primary_path, primary_asset.get("sha256"), f"$.asset.{source_kind}.sha256", errors)
            if primary_data is not None:
                try:
                    source_text = primary_data.decode("utf-8")
                    if source_kind == "html":
                        validate_wide_html(source_text, errors, str(font_manifest_asset.get("ref") or ""))
                    else:
                        validate_canonical_wordmark(source_text, errors)
                except UnicodeDecodeError:
                    errors.append(issue("ASSET_ENCODING", f"$.asset.{source_kind}.ref", f"{source_kind.upper()} asset must be UTF-8."))
        bytes_by_kind: dict[str, bytes] = {}
        for index, derivative in enumerate(parsed_derivatives):
            path = safe_asset_path(derivative.get("ref"), asset_root, f"$.asset.png_derivatives[{index}].ref", errors)
            if path is None:
                continue
            data = verify_hash(path, derivative.get("sha256"), f"$.asset.png_derivatives[{index}].sha256", errors)
            expected_size = expected_sizes.get(derivative.get("kind"))
            if expected_size is not None and png_dimensions(path) != expected_size:
                errors.append(issue("PNG_DIMENSIONS", f"$.asset.png_derivatives[{index}]", "PNG bytes do not match declared dimensions."))
            if data is not None and derivative.get("kind") in expected_sizes:
                bytes_by_kind[derivative["kind"]] = data
        if set(bytes_by_kind) == set(expected_sizes) and HASH_PATTERN.fullmatch(str(bundle_hash or "")):
            compact_kind = next(key for key in expected_sizes if key != "full")
            observed_bundle = "sha256:" + hashlib.sha256(bytes_by_kind["full"] + bytes_by_kind[compact_kind]).hexdigest()
            if observed_bundle != bundle_hash:
                errors.append(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Derivative bytes do not match the bundle hash."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def validate(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    if isinstance(payload, dict) and payload.get("schema_version") == "viewpoint-visual-v1":
        return validate_manifest(payload, asset_root)
    return validate_spec(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--asset-root", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        result = {"valid": False, "errors": [issue("LOAD", "$", str(exc))], "warnings": []}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload, args.asset_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
