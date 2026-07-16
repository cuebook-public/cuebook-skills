#!/usr/bin/env python3
"""Validate MarketFigureSpecV1 or rendered MarketFigureV1 artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any


GRAMMARS = {
    "event_reaction",
    "relative_strength",
    "expectation_revision",
    "fundamental_driver",
    "positioning_pressure",
    "sensitivity_curve",
    "instrument_map",
}
STATES = {"draft", "conditional", "ready", "frozen"}
SPEC_FIELDS = {
    "schema_version",
    "spec_id",
    "revision",
    "state",
    "lineage",
    "grammar",
    "frame",
    "argument_path",
    "trade_logic",
    "news_anchor",
    "curve",
    "key_numbers",
    "countercase",
    "settlement",
    "render",
    "quality_report",
}
REQUIRED_SPEC_FIELDS = SPEC_FIELDS - {"argument_path", "trade_logic"}
MANIFEST_FIELDS = {
    "schema_version",
    "figure_id",
    "spec_ref",
    "grammar",
    "layout",
    "state",
    "generated_at",
    "theme",
    "dimensions",
    "lineage",
    "content",
    "asset",
    "quality_report",
}
TRADE_LOGIC_FAMILIES = {"event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility", "liquidity_microstructure", "carry_income"}
TRADE_LOGIC_MECHANISMS = {"risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag", "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation", "volatility_repricing", "carry_roll_down", "cross_asset_transmission"}
TRADE_LOGIC_EXPRESSIONS = {"outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket", "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade"}
TRADE_LOGIC_HORIZONS = {"intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural"}
PUBLIC_BACKEND_TERMS = {"已确认", "已计算", "推演", "待确认", "形成中", "observed", "derived", "provisional", "conditional", "confirmed", "pending"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def parse_time(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
    if not nonempty(value):
        errors.append(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("DATETIME", path, "Invalid ISO-8601 datetime."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("DATETIME_TZ", path, "Datetime must include a timezone."))
        return None
    return parsed


def string_list(value: Any, path: str, errors: list[dict[str, str]]) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."))
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_LIST_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
        else:
            result.append(item)
    if len(result) != len(set(result)):
        errors.append(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."))
    return result


def validate_quality(
    quality: Any,
    state: Any,
    errors: list[dict[str, str]],
    path: str = "$.quality_report",
) -> tuple[list[str], list[str]]:
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY", path, "Quality report must be an object."))
        return [], []
    decision = quality.get("decision")
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", f"{path}.decision", "Unsupported quality decision."))
    warnings = string_list(quality.get("warnings"), f"{path}.warnings", errors)
    failures = string_list(quality.get("hard_failures"), f"{path}.hard_failures", errors)
    if failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_DECISION", f"{path}.decision", "Hard failures require blocked quality."))
    if decision == "blocked" and not failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", f"{path}.hard_failures", "Blocked quality requires a hard failure."))
    if state == "conditional" and (decision != "conditional" or not warnings):
        errors.append(issue("CONDITIONAL_STATE", path, "Conditional figures require conditional quality and a warning."))
    if state in {"ready", "frozen"} and (decision != "ready" or warnings or failures):
        errors.append(issue("READY_STATE", path, "Ready or frozen figures require clean ready quality."))
    return warnings, failures


def x_value(value: Any, kind: str, path: str, errors: list[dict[str, str]]) -> float | str | None:
    if kind == "time":
        parsed = parse_time(value, path, errors)
        return parsed.timestamp() if parsed else None
    if kind == "numeric":
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
            errors.append(issue("NUMERIC_X", path, "Numeric axes require finite numeric x values."))
            return None
        return float(value)
    if kind == "category":
        if not nonempty(value):
            errors.append(issue("CATEGORY_X", path, "Category axes require non-empty string x values."))
            return None
        return value
    errors.append(issue("X_AXIS_KIND", path, "x-axis kind must be time, category, or numeric."))
    return None


def validate_spec(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings_out: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    for key in sorted(REQUIRED_SPEC_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - SPEC_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "market-figure-spec-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-figure-spec-v1."))
    if not re.fullmatch(r"FIGSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("spec_id") or "")):
        errors.append(issue("SPEC_ID", "$.spec_id", "Invalid figure spec ID."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported figure state."))
    grammar = payload.get("grammar")
    if grammar not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.grammar", "Unsupported curve grammar."))

    lineage = payload.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
        lineage = {}
    inputs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    if not inputs:
        errors.append(issue("INPUT_LINEAGE", "$.lineage.input_artifact_refs", "At least one input artifact is required."))
    news_fact_refs = string_list(lineage.get("news_fact_refs"), "$.lineage.news_fact_refs", errors)
    for key in ("visual_argument_ref", "thesis_chart_ref", "chart_data_ref", "indicator_pack_ref", "settlement_claim_ref"):
        if lineage.get(key) is not None and not nonempty(lineage.get(key)):
            errors.append(issue("LINEAGE_REF", f"$.lineage.{key}", "Reference must be null or non-empty."))
    parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    frame = payload.get("frame")
    if not isinstance(frame, dict):
        errors.append(issue("FRAME", "$.frame", "Frame must be an object."))
        frame = {}
    for key in ("kicker", "headline", "viewpoint"):
        if not nonempty(frame.get(key)):
            errors.append(issue("FRAME_FIELD", f"$.frame.{key}", f"{key} is required."))

    argument_path = payload.get("argument_path")
    argument_node_ids: list[str] = []
    if argument_path is not None:
        if not isinstance(argument_path, dict):
            errors.append(issue("ARGUMENT_PATH", "$.argument_path", "Argument path must be null or an object."))
            argument_path = {}
        if argument_path.get("mode") not in {"causal_chain", "confirmation_ladder", "evidence_ladder"}:
            errors.append(issue("ARGUMENT_MODE", "$.argument_path.mode", "Unsupported argument path mode."))
        nodes = argument_path.get("nodes")
        if not isinstance(nodes, list) or not 2 <= len(nodes) <= 4:
            errors.append(issue("ARGUMENT_NODES", "$.argument_path.nodes", "Argument path requires two to four nodes."))
            nodes = []
        for index, node in enumerate(nodes):
            path = f"$.argument_path.nodes[{index}]"
            if not isinstance(node, dict):
                errors.append(issue("ARGUMENT_NODE", path, "Argument node must be an object."))
                continue
            node_id = node.get("id")
            if not re.fullmatch(r"N[1-9][0-9]*", str(node_id or "")):
                errors.append(issue("ARGUMENT_NODE_ID", f"{path}.id", "Invalid argument node ID."))
            else:
                argument_node_ids.append(node_id)
            if node.get("kind") not in {"event", "evidence", "mechanism", "actor_action", "market_effect", "metric", "condition", "countercase", "invalidation", "settlement"}:
                errors.append(issue("ARGUMENT_NODE_KIND", f"{path}.kind", "Unsupported argument node kind."))
            label = node.get("label")
            if not nonempty(label) or len(label) > 80:
                errors.append(issue("ARGUMENT_NODE_LABEL", f"{path}.label", "Argument node label must contain one to 80 characters."))
            if node.get("status") not in {"observed", "derived", "conditional", "unresolved"}:
                errors.append(issue("ARGUMENT_NODE_STATUS", f"{path}.status", "Unsupported argument node status."))
            sources = string_list(node.get("source_refs"), f"{path}.source_refs", errors)
            if not sources:
                errors.append(issue("ARGUMENT_NODE_SOURCE", f"{path}.source_refs", "Every public argument node requires source lineage."))
        if len(argument_node_ids) != len(set(argument_node_ids)):
            errors.append(issue("ARGUMENT_NODE_IDS_UNIQUE", "$.argument_path.nodes", "Argument node IDs must be unique."))
        edges = argument_path.get("edges")
        if not isinstance(edges, list) or len(edges) != max(len(nodes) - 1, 1):
            errors.append(issue("ARGUMENT_EDGES", "$.argument_path.edges", "A compact argument path requires one edge between each adjacent node."))
            edges = []
        expected_pairs = list(zip(argument_node_ids, argument_node_ids[1:]))
        observed_pairs: list[tuple[str, str]] = []
        for index, edge in enumerate(edges):
            path = f"$.argument_path.edges[{index}]"
            if not isinstance(edge, dict):
                errors.append(issue("ARGUMENT_EDGE", path, "Argument edge must be an object."))
                continue
            from_id, to_id = edge.get("from"), edge.get("to")
            observed_pairs.append((str(from_id or ""), str(to_id or "")))
            if from_id not in argument_node_ids or to_id not in argument_node_ids:
                errors.append(issue("ARGUMENT_EDGE_REF", path, "Argument edge references an unknown node."))
            if edge.get("relation") not in {"causes", "enables", "pressures", "confirms", "challenges", "conditions", "settles", "compares"}:
                errors.append(issue("ARGUMENT_EDGE_RELATION", f"{path}.relation", "Unsupported argument relation."))
            if edge.get("certainty") not in {"observed", "inferred", "hypothesis"}:
                errors.append(issue("ARGUMENT_EDGE_CERTAINTY", f"{path}.certainty", "Unsupported argument certainty."))
            if edge.get("label") is not None and not nonempty(edge.get("label")):
                errors.append(issue("ARGUMENT_EDGE_LABEL", f"{path}.label", "Argument edge label must be null or non-empty."))
        if observed_pairs and observed_pairs != expected_pairs:
            errors.append(issue("ARGUMENT_PATH_ORDER", "$.argument_path.edges", "Edges must connect adjacent nodes in display order."))
        if lineage.get("visual_argument_ref") is None:
            errors.append(issue("ARGUMENT_LINEAGE", "$.lineage.visual_argument_ref", "Argument paths require a VisualArgumentV1 lineage ref."))

    trade_logic = payload.get("trade_logic")
    if trade_logic is not None:
        if not isinstance(trade_logic, dict):
            errors.append(issue("TRADE_LOGIC", "$.trade_logic", "Trade logic must be null or an object."))
            trade_logic = {}
        if not re.fullmatch(r"TLOGIC_[A-Za-z0-9_:-]{8,}", str(trade_logic.get("profile_ref") or "")):
            errors.append(issue("TRADE_LOGIC_REF", "$.trade_logic.profile_ref", "Invalid TradeLogicProfileV1 ref."))
        for key, allowed in (
            ("family", TRADE_LOGIC_FAMILIES),
            ("mechanism", TRADE_LOGIC_MECHANISMS),
            ("expression", TRADE_LOGIC_EXPRESSIONS),
            ("horizon", TRADE_LOGIC_HORIZONS),
        ):
            if trade_logic.get(key) not in allowed:
                errors.append(issue("TRADE_LOGIC_CLASS", f"$.trade_logic.{key}", "Unsupported trade logic classification."))
        tags = string_list(trade_logic.get("public_tags"), "$.trade_logic.public_tags", errors)
        if not 2 <= len(tags) <= 4:
            errors.append(issue("TRADE_LOGIC_TAGS", "$.trade_logic.public_tags", "Use two to four public strategy tags."))
        for index, tag in enumerate(tags):
            if len(tag) > 24:
                errors.append(issue("TRADE_LOGIC_TAG_LENGTH", f"$.trade_logic.public_tags[{index}]", "Public tags must not exceed 24 characters."))
            if any(term.lower() in tag.lower() for term in PUBLIC_BACKEND_TERMS):
                errors.append(issue("PUBLIC_BACKEND_TERM", f"$.trade_logic.public_tags[{index}]", "Backend evidence-state terms cannot appear in public tags."))

    news = payload.get("news_anchor")
    if news is not None:
        if not isinstance(news, dict):
            errors.append(issue("NEWS", "$.news_anchor", "News anchor must be null or an object."))
            news = {}
        for key in ("headline", "publisher"):
            if not nonempty(news.get(key)):
                errors.append(issue("NEWS_FIELD", f"$.news_anchor.{key}", f"{key} is required."))
        parse_time(news.get("published_at"), "$.news_anchor.published_at", errors)
        if news.get("status") not in {"observed", "provisional", "unconfirmed"}:
            errors.append(issue("NEWS_STATUS", "$.news_anchor.status", "Unsupported news status."))
        facts = string_list(news.get("fact_refs"), "$.news_anchor.fact_refs", errors)
        sources = string_list(news.get("source_refs"), "$.news_anchor.source_refs", errors)
        if not facts or not sources:
            errors.append(issue("NEWS_LINEAGE", "$.news_anchor", "News requires fact and source references."))
        if any(item not in news_fact_refs for item in facts):
            errors.append(issue("NEWS_FACT_LINEAGE", "$.news_anchor.fact_refs", "News fact refs must be preserved in lineage."))

    curve = payload.get("curve")
    if not isinstance(curve, dict):
        errors.append(issue("CURVE", "$.curve", "Curve must be an object."))
        curve = {}
    if not nonempty(curve.get("title")):
        errors.append(issue("CURVE_TITLE", "$.curve.title", "Curve title is required."))
    x_axis = curve.get("x_axis") if isinstance(curve.get("x_axis"), dict) else {}
    y_axis = curve.get("y_axis") if isinstance(curve.get("y_axis"), dict) else {}
    x_kind = x_axis.get("kind")
    if x_kind not in {"time", "category", "numeric"}:
        errors.append(issue("X_AXIS_KIND", "$.curve.x_axis.kind", "x-axis kind must be time, category, or numeric."))
    if y_axis.get("kind") != "value":
        errors.append(issue("Y_AXIS_KIND", "$.curve.y_axis.kind", "y-axis kind must be value."))
    for axis_name, axis in (("x_axis", x_axis), ("y_axis", y_axis)):
        for key in ("label", "unit"):
            if not nonempty(axis.get(key)):
                errors.append(issue("AXIS_FIELD", f"$.curve.{axis_name}.{key}", f"{key} is required."))
        if axis.get("zero_policy") not in {"include", "adaptive"}:
            errors.append(issue("ZERO_POLICY", f"$.curve.{axis_name}.zero_policy", "Unsupported zero policy."))

    series = curve.get("series")
    if not isinstance(series, list) or not 1 <= len(series) <= 7:
        errors.append(issue("SERIES", "$.curve.series", "Expected one to seven series."))
        series = []
    series_ids: list[str] = []
    series_units: list[str] = []
    has_forming = False
    has_modelled = False
    has_digitized = False
    for s_index, item in enumerate(series):
        path = f"$.curve.series[{s_index}]"
        if not isinstance(item, dict):
            errors.append(issue("SERIES_OBJECT", path, "Series must be an object."))
            continue
        series_id = item.get("id")
        if not re.fullmatch(r"S[1-9][0-9]*", str(series_id or "")):
            errors.append(issue("SERIES_ID", f"{path}.id", "Invalid series ID."))
        else:
            series_ids.append(series_id)
        for key in ("label", "unit", "source_ref"):
            if not nonempty(item.get(key)):
                errors.append(issue("SERIES_FIELD", f"{path}.{key}", f"{key} is required."))
        if nonempty(item.get("unit")):
            series_units.append(item["unit"])
        if item.get("role") not in {"primary", "benchmark", "driver", "context"}:
            errors.append(issue("SERIES_ROLE", f"{path}.role", "Unsupported series role."))
        data_kind = item.get("data_kind")
        if data_kind not in {"observed", "formula", "digitized_observed"}:
            errors.append(issue("DATA_KIND", f"{path}.data_kind", "Unsupported data kind."))
        has_digitized = has_digitized or data_kind == "digitized_observed"
        if data_kind == "formula" and not nonempty(item.get("formula")):
            errors.append(issue("FORMULA_REQUIRED", f"{path}.formula", "Formula series require an explicit formula."))
        if data_kind in {"observed", "digitized_observed"} and item.get("formula") is not None:
            errors.append(issue("OBSERVED_FORMULA", f"{path}.formula", "Observed and digitized series must not carry a formula."))
        if item.get("stroke_style", "solid") not in {"solid", "dashed", "dotted"}:
            errors.append(issue("STROKE_STYLE", f"{path}.stroke_style", "Unsupported stroke style."))
        if item.get("color_role") is not None and item.get("color_role") not in {"focus", "positive", "comparison", "support", "violet", "context", "risk"}:
            errors.append(issue("COLOR_ROLE", f"{path}.color_role", "Unsupported series color role."))
        baseline = item.get("baseline")
        if baseline is not None:
            if not isinstance(baseline, dict) or not isinstance(baseline.get("value"), (int, float)) or isinstance(baseline.get("value"), bool):
                errors.append(issue("BASELINE", f"{path}.baseline", "Baseline requires a numeric value."))
            else:
                parse_time(baseline.get("observed_at"), f"{path}.baseline.observed_at", errors)
                if not nonempty(baseline.get("source_ref")):
                    errors.append(issue("BASELINE_SOURCE", f"{path}.baseline.source_ref", "Baseline source is required."))
        points = item.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= 500:
            errors.append(issue("POINTS", f"{path}.points", "Series require two to 500 points."))
            continue
        ordered: list[float] = []
        for p_index, point in enumerate(points):
            ppath = f"{path}.points[{p_index}]"
            if not isinstance(point, dict):
                errors.append(issue("POINT_OBJECT", ppath, "Point must be an object."))
                continue
            observed_x = x_value(point.get("x"), str(x_kind), f"{ppath}.x", errors)
            if isinstance(observed_x, float):
                ordered.append(observed_x)
            y = point.get("y")
            if not isinstance(y, (int, float)) or isinstance(y, bool) or not math.isfinite(float(y)):
                errors.append(issue("POINT_Y", f"{ppath}.y", "Point y must be finite."))
            point_state = point.get("state")
            if point_state not in {"sealed", "forming", "modelled"}:
                errors.append(issue("POINT_STATE", f"{ppath}.state", "Unsupported point state."))
            has_forming = has_forming or point_state == "forming"
            has_modelled = has_modelled or point_state == "modelled"
            if point.get("source_ref") is not None and not nonempty(point.get("source_ref")):
                errors.append(issue("POINT_SOURCE", f"{ppath}.source_ref", "Point source must be null or non-empty."))
            if point.get("label") is not None and not nonempty(point.get("label")):
                errors.append(issue("POINT_LABEL", f"{ppath}.label", "Point label must be null or non-empty."))
            if point_state == "modelled" and data_kind != "formula":
                errors.append(issue("MODELLED_OBSERVED", ppath, "Modelled points require a formula series."))
        if x_kind in {"time", "numeric"} and ordered != sorted(ordered):
            errors.append(issue("POINT_ORDER", f"{path}.points", "Time and numeric points must be sorted by x."))
    if len(series_ids) != len(set(series_ids)):
        errors.append(issue("SERIES_IDS_UNIQUE", "$.curve.series", "Series IDs must be unique."))
    if len(set(series_units)) > 1:
        errors.append(issue("MIXED_UNITS", "$.curve.series", "One figure y-axis cannot combine different units."))
    data_fidelity = curve.get("data_fidelity", "native_series")
    if data_fidelity not in {"native_series", "source_chart_redraw"}:
        errors.append(issue("DATA_FIDELITY", "$.curve.data_fidelity", "Unsupported curve data fidelity."))
    if has_digitized and data_fidelity != "source_chart_redraw":
        errors.append(issue("DIGITIZED_FIDELITY", "$.curve.data_fidelity", "Digitized series require source_chart_redraw fidelity."))
    if data_fidelity == "source_chart_redraw" and not has_digitized:
        errors.append(issue("REDRAW_SERIES", "$.curve.series", "Source-chart redraw fidelity requires at least one digitized series."))
    if curve.get("methodology") is not None and not nonempty(curve.get("methodology")):
        errors.append(issue("METHODOLOGY", "$.curve.methodology", "Methodology must be null or non-empty."))

    markers = curve.get("markers")
    if not isinstance(markers, list) or len(markers) > 8:
        errors.append(issue("MARKERS", "$.curve.markers", "Markers must be an array of at most eight items."))
        markers = []
    marker_ids: list[str] = []
    marker_kinds: list[str] = []
    for m_index, marker in enumerate(markers):
        path = f"$.curve.markers[{m_index}]"
        if not isinstance(marker, dict):
            errors.append(issue("MARKER_OBJECT", path, "Marker must be an object."))
            continue
        marker_id = marker.get("id")
        if not re.fullmatch(r"M[1-9][0-9]*", str(marker_id or "")):
            errors.append(issue("MARKER_ID", f"{path}.id", "Invalid marker ID."))
        else:
            marker_ids.append(marker_id)
        marker_kinds.append(str(marker.get("kind") or ""))
        x_value(marker.get("x"), str(x_kind), f"{path}.x", errors)
        if not nonempty(marker.get("label")) or not nonempty(marker.get("source_ref")):
            errors.append(issue("MARKER_FIELD", path, "Marker label and source are required."))
        if marker.get("status") not in {"observed", "derived", "proposed"}:
            errors.append(issue("MARKER_STATUS", f"{path}.status", "Unsupported marker status."))
    if len(marker_ids) != len(set(marker_ids)):
        errors.append(issue("MARKER_IDS_UNIQUE", "$.curve.markers", "Marker IDs must be unique."))

    if grammar == "event_reaction":
        if news is None or "event" not in marker_kinds or x_kind != "time":
            errors.append(issue("EVENT_REACTION_INPUTS", "$", "event_reaction requires a news anchor, event marker, and time axis."))
    if grammar == "relative_strength":
        comparable = [item for item in series if item.get("transformation") in {"return_from_baseline", "normalized_index"}]
        excess = [item for item in series if item.get("transformation") == "excess_return"]
        if not excess:
            roles = {item.get("role") for item in comparable}
            baselines = [item.get("baseline") for item in comparable]
            baseline_times = {item.get("observed_at") for item in baselines if isinstance(item, dict)}
            if not {"primary", "benchmark"}.issubset(roles) or len(comparable) < 2 or None in baselines or len(baseline_times) != 1:
                errors.append(issue("RELATIVE_INPUTS", "$.curve.series", "relative_strength requires synchronized primary and benchmark baselines or one excess-return series."))
    if grammar == "expectation_revision" and not any(item.get("transformation") == "revision" for item in series):
        errors.append(issue("REVISION_SERIES", "$.curve.series", "expectation_revision requires a revision series."))
    if grammar == "fundamental_driver" and not any(item.get("role") == "driver" for item in series):
        errors.append(issue("DRIVER_SERIES", "$.curve.series", "fundamental_driver requires a driver series."))
    if grammar == "positioning_pressure" and not any(item.get("transformation") in {"flow", "positioning"} for item in series):
        errors.append(issue("POSITIONING_SERIES", "$.curve.series", "positioning_pressure requires flow or positioning history."))
    if grammar == "sensitivity_curve":
        if x_kind != "numeric" or not series or any(item.get("data_kind") != "formula" for item in series):
            errors.append(issue("SENSITIVITY_INPUTS", "$.curve", "sensitivity_curve requires a numeric x-axis and formula series."))
    if grammar == "instrument_map":
        valid_map = (
            x_kind == "numeric"
            and len(series) == 1
            and series[0].get("transformation") == "risk_exposure_map"
            and series[0].get("data_kind") == "formula"
            and nonempty(series[0].get("formula"))
            and 2 <= len(series[0].get("points", [])) <= 8
            and all(nonempty(point.get("label")) and nonempty(point.get("source_ref")) for point in series[0].get("points", []))
            and all(point.get("state") != "modelled" for point in series[0].get("points", []))
        )
        if not valid_map:
            errors.append(issue("INSTRUMENT_MAP_INPUTS", "$.curve", "instrument_map requires one formula-backed risk_exposure_map series, a numeric x-axis, and two to eight labeled, sourced, non-modelled vehicle points."))
    if has_modelled and (grammar != "sensitivity_curve" or x_kind != "numeric"):
        errors.append(issue("MODELLED_PATH", "$.curve.series", "Modelled points are restricted to numeric sensitivity curves."))

    key_numbers = payload.get("key_numbers")
    if not isinstance(key_numbers, list) or not 2 <= len(key_numbers) <= 4:
        errors.append(issue("KEY_NUMBERS", "$.key_numbers", "Expected two to four key numbers."))
        key_numbers = []
    key_ids: list[str] = []
    for index, item in enumerate(key_numbers):
        path = f"$.key_numbers[{index}]"
        if not isinstance(item, dict):
            errors.append(issue("KEY_NUMBER_OBJECT", path, "Key number must be an object."))
            continue
        if not re.fullmatch(r"K[1-9][0-9]*", str(item.get("id") or "")):
            errors.append(issue("KEY_NUMBER_ID", f"{path}.id", "Invalid key number ID."))
        else:
            key_ids.append(item["id"])
        for key in ("label", "display_value", "unit", "source_ref"):
            if not nonempty(item.get(key)):
                errors.append(issue("KEY_NUMBER_FIELD", f"{path}.{key}", f"{key} is required."))
        if item.get("as_of") is not None:
            parse_time(item.get("as_of"), f"{path}.as_of", errors)
        if item.get("status") == "provisional" and item.get("as_of") is None:
            errors.append(issue("PROVISIONAL_AS_OF", f"{path}.as_of", "Provisional numbers require an as-of time."))
        if item.get("status") == "modelled" and grammar != "sensitivity_curve":
            errors.append(issue("MODELLED_NUMBER", path, "Modelled key numbers are restricted to sensitivity curves."))
    if len(key_ids) != len(set(key_ids)):
        errors.append(issue("KEY_NUMBER_IDS_UNIQUE", "$.key_numbers", "Key number IDs must be unique."))

    countercase = payload.get("countercase")
    if countercase is not None:
        if not isinstance(countercase, dict) or not nonempty(countercase.get("label")) or not nonempty(countercase.get("condition")):
            errors.append(issue("COUNTERCASE", "$.countercase", "Countercase requires a label and condition."))
        else:
            sources = string_list(countercase.get("source_refs"), "$.countercase.source_refs", errors)
            if not sources:
                errors.append(issue("COUNTERCASE_SOURCE", "$.countercase.source_refs", "Countercase requires source lineage."))

    settlement = payload.get("settlement")
    if not isinstance(settlement, dict):
        errors.append(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."))
        settlement = {}
    settleable = settlement.get("settleable")
    if not isinstance(settleable, bool):
        errors.append(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."))
    claim_ref = settlement.get("claim_ref")
    if settleable:
        if not nonempty(claim_ref) or not nonempty(settlement.get("success_line")):
            errors.append(issue("SETTLEMENT_FIELDS", "$.settlement", "Settleable figures require claim_ref and success_line."))
        parse_time(settlement.get("deadline_at"), "$.settlement.deadline_at", errors)
        if claim_ref != lineage.get("settlement_claim_ref"):
            errors.append(issue("SETTLEMENT_LINEAGE", "$.settlement.claim_ref", "Settlement ref must match lineage."))
    elif any(settlement.get(key) is not None for key in ("claim_ref", "deadline_at", "success_line")):
        errors.append(issue("NONSETTLEABLE_FIELDS", "$.settlement", "Non-settleable figures must use null claim, deadline, and success line."))

    render = payload.get("render")
    if not isinstance(render, dict):
        errors.append(issue("RENDER", "$.render", "Render settings must be an object."))
        render = {}
    layout = render.get("layout")
    expected_dimensions = {"compact": (720, 420), "editorial": (1200, 760)}
    if layout not in expected_dimensions:
        errors.append(issue("LAYOUT", "$.render.layout", "Layout must be compact or editorial."))
    elif (render.get("width"), render.get("height")) != expected_dimensions[layout]:
        expected_width, expected_height = expected_dimensions[layout]
        errors.append(issue("DIMENSIONS", "$.render", f"{layout} figures use {expected_width} x {expected_height}."))
    if render.get("theme") not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("THEME", "$.render.theme", "Unsupported theme."))
    if render.get("watermark") != "Cuebook":
        errors.append(issue("WATERMARK", "$.render.watermark", "Cuebook watermark is required."))
    semantic_mode = render.get("semantic_mode", "curve_only")
    if semantic_mode not in {"curve_only", "argument_curve"}:
        errors.append(issue("SEMANTIC_MODE", "$.render.semantic_mode", "Unsupported semantic render mode."))
    if semantic_mode == "argument_curve" and argument_path is None:
        errors.append(issue("ARGUMENT_PATH_REQUIRED", "$.argument_path", "argument_curve mode requires an argument path."))
    if semantic_mode == "argument_curve" and trade_logic is None:
        errors.append(issue("TRADE_LOGIC_REQUIRED", "$.trade_logic", "argument_curve mode requires a TradeLogicProfileV1 summary."))
    if semantic_mode == "curve_only" and argument_path is not None:
        errors.append(issue("ARGUMENT_PATH_UNUSED", "$.render.semantic_mode", "An argument path must be rendered with argument_curve mode."))
    focus_series_ids = render.get("focus_series_ids", [])
    if focus_series_ids is not None:
        focus_series_ids = string_list(focus_series_ids, "$.render.focus_series_ids", errors)
        if len(focus_series_ids) > 4:
            errors.append(issue("FOCUS_SERIES_LIMIT", "$.render.focus_series_ids", "Compact focus is limited to four series."))
        if any(item not in series_ids for item in focus_series_ids):
            errors.append(issue("FOCUS_SERIES_REF", "$.render.focus_series_ids", "Focus series IDs must reference curve series."))
    endpoint_series_ids = render.get("endpoint_series_ids", [])
    if endpoint_series_ids is not None:
        endpoint_series_ids = string_list(endpoint_series_ids, "$.render.endpoint_series_ids", errors)
        if len(endpoint_series_ids) > 4:
            errors.append(issue("ENDPOINT_SERIES_LIMIT", "$.render.endpoint_series_ids", "Endpoint labels are limited to four series."))
        if any(item not in series_ids for item in endpoint_series_ids):
            errors.append(issue("ENDPOINT_SERIES_REF", "$.render.endpoint_series_ids", "Endpoint series IDs must reference curve series."))

    quality_warnings, _ = validate_quality(payload.get("quality_report"), state, errors)
    if has_forming:
        if state != "conditional" or not any("forming" in warning.lower() or "形成" in warning for warning in quality_warnings):
            errors.append(issue("FORMING_DISCLOSURE", "$.quality_report", "Forming data requires conditional state and an explicit warning."))
    if has_digitized:
        redraw_disclosed = any(
            token in warning.lower()
            for warning in quality_warnings
            for token in ("digitized", "source-chart", "source chart", "重绘", "截图")
        )
        if state != "conditional" or not redraw_disclosed:
            errors.append(issue("DIGITIZED_DISCLOSURE", "$.quality_report", "Digitized source-chart series require conditional state and an explicit redraw warning."))
        if settleable:
            errors.append(issue("DIGITIZED_SETTLEMENT", "$.settlement", "Source-chart redraws cannot be used for settlement."))
    if grammar == "event_reaction" and news is not None and news.get("status") != "observed" and state != "conditional":
        errors.append(issue("NEWS_UNCERTAINTY", "$.state", "Provisional or unconfirmed news requires a conditional figure."))
    return {"valid": not errors, "errors": errors, "warnings": warnings_out}


def validate_manifest(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    for key in sorted(MANIFEST_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - MANIFEST_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "market-figure-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-figure-v1."))
    if not re.fullmatch(r"FIGURE_[A-Za-z0-9_:-]{8,}", str(payload.get("figure_id") or "")):
        errors.append(issue("FIGURE_ID", "$.figure_id", "Invalid figure ID."))
    if not re.fullmatch(r"FIGSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("spec_ref") or "")):
        errors.append(issue("SPEC_REF", "$.spec_ref", "Invalid figure spec ref."))
    if payload.get("grammar") not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.grammar", "Unsupported curve grammar."))
    layout = payload.get("layout")
    if layout not in {"compact", "editorial"}:
        errors.append(issue("LAYOUT", "$.layout", "Layout must be compact or editorial."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported figure state."))
    parse_time(payload.get("generated_at"), "$.generated_at", errors)
    dimensions = payload.get("dimensions") if isinstance(payload.get("dimensions"), dict) else {}
    expected_dimensions = {"compact": (720, 420), "editorial": (1200, 760)}
    if layout in expected_dimensions and (dimensions.get("width"), dimensions.get("height")) != expected_dimensions[layout]:
        expected_width, expected_height = expected_dimensions[layout]
        errors.append(issue("DIMENSIONS", "$.dimensions", f"{layout} figures use {expected_width} x {expected_height}."))
    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    for key in ("input_artifact_refs", "series_refs", "marker_refs", "key_number_refs", "news_fact_refs", "source_refs"):
        string_list(lineage.get(key), f"$.lineage.{key}", errors)
    if "argument_node_refs" in lineage:
        string_list(lineage.get("argument_node_refs"), "$.lineage.argument_node_refs", errors)
    if lineage.get("trade_logic_ref") is not None and not re.fullmatch(r"TLOGIC_[A-Za-z0-9_:-]{8,}", str(lineage.get("trade_logic_ref") or "")):
        errors.append(issue("TRADE_LOGIC_REF", "$.lineage.trade_logic_ref", "Invalid TradeLogicProfileV1 ref."))
    content = payload.get("content") if isinstance(payload.get("content"), dict) else {}
    for key in ("headline", "viewpoint", "curve_title"):
        if not nonempty(content.get(key)):
            errors.append(issue("CONTENT_FIELD", f"$.content.{key}", f"{key} is required."))
    if "argument_path_labels" in content:
        string_list(content.get("argument_path_labels"), "$.content.argument_path_labels", errors)
    if "strategy_tags" in content:
        tags = string_list(content.get("strategy_tags"), "$.content.strategy_tags", errors)
        for index, tag in enumerate(tags):
            if any(term.lower() in tag.lower() for term in PUBLIC_BACKEND_TERMS):
                errors.append(issue("PUBLIC_BACKEND_TERM", f"$.content.strategy_tags[{index}]", "Backend evidence-state terms cannot appear in public tags."))
    if content.get("watermark") != "Cuebook":
        errors.append(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."))
    asset = payload.get("asset") if isinstance(payload.get("asset"), dict) else {}
    svg_ref = asset.get("svg_ref")
    content_hash = asset.get("content_hash")
    if not nonempty(svg_ref):
        errors.append(issue("SVG_REF", "$.asset.svg_ref", "SVG reference is required."))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
        errors.append(issue("CONTENT_HASH", "$.asset.content_hash", "Expected sha256:<64 lowercase hex characters>."))
    if asset_root is not None and nonempty(svg_ref):
        path = Path(svg_ref)
        path = path if path.is_absolute() else asset_root / path
        if not path.is_file():
            errors.append(issue("ASSET_MISSING", "$.asset.svg_ref", f"Asset does not exist: {path}."))
        elif re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
            observed = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
            if observed != content_hash:
                errors.append(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def validate(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    if isinstance(payload, dict) and payload.get("schema_version") == "market-figure-v1":
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
        print(json.dumps({"valid": False, "errors": [issue("LOAD", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload, args.asset_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
