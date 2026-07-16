#!/usr/bin/env python3
"""Validate ThesisChartV1 structure and chart-specific semantic invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_datetime(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        errors.append(issue("DATETIME", path, "Expected a non-empty ISO-8601 datetime."))
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
        if not isinstance(item, str) or not item.strip():
            errors.append(issue("STRING_LIST_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
            continue
        result.append(item)
    if len(result) != len(set(result)):
        errors.append(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."))
    return result


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}

    if payload.get("schema_version") != "thesis-chart-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected thesis-chart-v1."))
    if not re.fullmatch(r"CHART_[A-Za-z0-9_:-]{8,}", str(payload.get("chart_id") or "")):
        errors.append(issue("CHART_ID", "$.chart_id", "Invalid chart ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))

    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage = payload.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
        lineage = {}
    refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    if not refs:
        errors.append(issue("INPUT_REF_REQUIRED", "$.lineage.input_artifact_refs", "At least one input artifact is required."))
    for key in ("thesis_ref", "settlement_claim_ref"):
        value = lineage.get(key)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            errors.append(issue("LINEAGE_REF", f"$.lineage.{key}", "Reference must be null or a non-empty string."))

    role = payload.get("role")
    if role not in {"evidence", "thesis", "settlement"}:
        errors.append(issue("ROLE", "$.role", "Unsupported chart role."))

    claim = payload.get("claim")
    if not isinstance(claim, dict):
        errors.append(issue("CLAIM", "$.claim", "Claim must be an object."))
        claim = {}
    evaluation_kind = claim.get("evaluation_kind")
    direction = claim.get("direction")
    action_state = claim.get("action_state")
    if evaluation_kind not in {"price_target", "directional_return", "relative_performance", "range", "event_occurrence"}:
        errors.append(issue("EVALUATION_KIND", "$.claim.evaluation_kind", "Unsupported evaluation kind."))
    if direction not in {"long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"}:
        errors.append(issue("DIRECTION", "$.claim.direction", "Unsupported direction."))
    if action_state not in {"enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"}:
        errors.append(issue("ACTION_STATE", "$.claim.action_state", "Unsupported action state."))
    if not isinstance(claim.get("statement"), str) or not claim.get("statement", "").strip():
        errors.append(issue("CLAIM_STATEMENT", "$.claim.statement", "Claim statement is required."))

    time = payload.get("time")
    if not isinstance(time, dict):
        errors.append(issue("TIME", "$.time", "Time must be an object."))
        time = {}
    declared = parse_datetime(time.get("declared_at"), "$.time.declared_at", errors)
    horizon_status = time.get("horizon_status", "explicit")
    if horizon_status not in {"explicit", "unspecified"}:
        errors.append(issue("HORIZON_STATUS", "$.time.horizon_status", "Horizon status must be explicit or unspecified."))
    horizon_end = None
    if horizon_status == "explicit":
        horizon_end = parse_datetime(time.get("horizon_end"), "$.time.horizon_end", errors)
    elif time.get("horizon_end") is not None:
        errors.append(issue("UNSPECIFIED_HORIZON_END", "$.time.horizon_end", "An unspecified horizon must use null horizon_end."))
    context_start = parse_datetime(time.get("context_start"), "$.time.context_start", errors)
    if declared and horizon_end and horizon_end <= declared:
        errors.append(issue("HORIZON_ORDER", "$.time.horizon_end", "Horizon end must be after declaration."))
    if context_start and declared and context_start >= declared:
        errors.append(issue("CONTEXT_ORDER", "$.time.context_start", "Context must begin before declaration."))
    horizon_seconds = time.get("horizon_seconds")
    if horizon_status == "explicit":
        if not isinstance(horizon_seconds, int) or isinstance(horizon_seconds, bool) or horizon_seconds < 1:
            errors.append(issue("HORIZON_SECONDS", "$.time.horizon_seconds", "Horizon seconds must be a positive integer."))
        elif declared and horizon_end:
            expected = round((horizon_end - declared).total_seconds())
            if abs(horizon_seconds - expected) > 1:
                errors.append(issue("HORIZON_SECONDS_MISMATCH", "$.time.horizon_seconds", f"Expected {expected} seconds from declared_at to horizon_end."))
    elif horizon_seconds is not None:
        errors.append(issue("UNSPECIFIED_HORIZON_SECONDS", "$.time.horizon_seconds", "An unspecified horizon must use null horizon_seconds."))
    if horizon_status == "unspecified" and role == "settlement":
        errors.append(issue("SETTLEMENT_HORIZON", "$.time.horizon_status", "Settlement charts require an explicit horizon."))
    interval_status = time.get("interval_status")
    if interval_status not in {"matched", "degraded", "unavailable"}:
        errors.append(issue("INTERVAL_STATUS", "$.time.interval_status", "Unsupported interval status."))
    for key in ("timezone", "preferred_interval"):
        if not isinstance(time.get(key), str) or not time.get(key, "").strip():
            errors.append(issue("TIME_FIELD", f"$.time.{key}", f"{key} is required."))
    observed_interval = time.get("observed_interval")
    if observed_interval is not None and (not isinstance(observed_interval, str) or not observed_interval.strip()):
        errors.append(issue("OBSERVED_INTERVAL", "$.time.observed_interval", "Observed interval must be null or a non-empty string."))
    if interval_status == "unavailable" and observed_interval is not None:
        errors.append(issue("INTERVAL_UNAVAILABLE", "$.time.observed_interval", "Unavailable interval must not declare an observed interval."))
    if interval_status in {"matched", "degraded"} and observed_interval is None:
        errors.append(issue("INTERVAL_REQUIRED", "$.time.observed_interval", "Observed interval is required when data is available."))

    series = payload.get("series")
    if not isinstance(series, list) or not 1 <= len(series) <= 3:
        errors.append(issue("SERIES", "$.series", "Expected one to three series."))
        series = []
    series_ids: set[str] = set()
    series_roles: dict[str, list[dict[str, Any]]] = {"primary": [], "benchmark": [], "context": []}
    baseline_times: list[datetime] = []
    baseline_bases: list[str] = []
    for index, item in enumerate(series):
        path = f"$.series[{index}]"
        if not isinstance(item, dict):
            errors.append(issue("SERIES_ITEM", path, "Series must be an object."))
            continue
        series_id = item.get("id")
        if not isinstance(series_id, str) or not re.fullmatch(r"S[1-9][0-9]*", series_id):
            errors.append(issue("SERIES_ID", f"{path}.id", "Series ID must use S<number>."))
        elif series_id in series_ids:
            errors.append(issue("SERIES_ID_UNIQUE", f"{path}.id", "Series IDs must be unique."))
        else:
            series_ids.add(series_id)
        series_role = item.get("role")
        if series_role not in series_roles:
            errors.append(issue("SERIES_ROLE", f"{path}.role", "Unsupported series role."))
        else:
            series_roles[series_role].append(item)
        for key in ("ticker", "display_name", "instrument_id"):
            if not isinstance(item.get(key), str) or not item.get(key, "").strip():
                errors.append(issue("SERIES_FIELD", f"{path}.{key}", f"{key} is required."))
        if item.get("transformation") not in {"raw_price", "return_from_baseline", "normalized_index", "excess_return"}:
            errors.append(issue("TRANSFORMATION", f"{path}.transformation", "Unsupported transformation."))
        provider = item.get("provider")
        if not isinstance(provider, dict):
            errors.append(issue("PROVIDER", f"{path}.provider", "Provider must be an object."))
            provider = {}
        for key in ("name", "endpoint", "requested_interval"):
            if not isinstance(provider.get(key), str) or not provider.get(key, "").strip():
                errors.append(issue("PROVIDER_FIELD", f"{path}.provider.{key}", f"{key} is required."))
        if str(provider.get("name") or "").lower() == "cuebook" and not isinstance(item.get("asset_id"), int):
            errors.append(issue("CUEBOOK_ASSET_ID", f"{path}.asset_id", "Cuebook series requires a numeric asset ID."))
        if provider.get("coverage_status") not in {"complete", "partial", "unavailable", "unknown"}:
            errors.append(issue("COVERAGE_STATUS", f"{path}.provider.coverage_status", "Unsupported coverage status."))
        parse_datetime(provider.get("as_of"), f"{path}.provider.as_of", errors)
        baseline = item.get("baseline")
        if not isinstance(baseline, dict):
            errors.append(issue("BASELINE", f"{path}.baseline", "Baseline must be an object."))
            continue
        value = baseline.get("value")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
            errors.append(issue("BASELINE_VALUE", f"{path}.baseline.value", "Baseline value must be positive."))
        baseline_time = parse_datetime(baseline.get("observed_at"), f"{path}.baseline.observed_at", errors)
        if baseline_time:
            baseline_times.append(baseline_time)
            if declared and baseline_time > declared:
                errors.append(issue("BASELINE_AFTER_DECLARATION", f"{path}.baseline.observed_at", "Baseline cannot be observed after declaration."))
        basis = baseline.get("observation_basis")
        baseline_bases.append(str(basis or ""))
        if not isinstance(baseline.get("source_ref"), str) or not baseline.get("source_ref", "").strip():
            errors.append(issue("BASELINE_SOURCE", f"{path}.baseline.source_ref", "Baseline source is required."))

    if len(series_roles["primary"]) != 1:
        errors.append(issue("PRIMARY_SERIES", "$.series", "Exactly one primary series is required."))

    render = payload.get("render")
    if not isinstance(render, dict):
        errors.append(issue("RENDER", "$.render", "Render must be an object."))
        render = {}
    mode = render.get("mode")
    y_axis = render.get("y_axis")
    chart_type = render.get("chart_type")
    if chart_type not in {"line", "candles"}:
        errors.append(issue("CHART_TYPE", "$.render.chart_type", "Unsupported chart type."))
    if render.get("forecast_path") != "none":
        errors.append(issue("FORECAST_PATH", "$.render.forecast_path", "Forecast path must be none."))
    for key in ("title", "subtitle", "success_label"):
        if not isinstance(render.get(key), str) or not render.get(key, "").strip():
            errors.append(issue("RENDER_LABEL", f"$.render.{key}", f"{key} is required."))
    theme = render.get("theme", "cuebook_dark")
    if theme not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("THEME", "$.render.theme", "Unsupported Cuebook chart theme."))
    style_profile = render.get("style_profile")
    if style_profile is not None and style_profile not in {"cuebook_feed_v1", "cuebook_detail_v1"}:
        errors.append(issue("STYLE_PROFILE", "$.render.style_profile", "Unsupported Cuebook chart style profile."))
    resolved_style_profile = style_profile or (
        "cuebook_detail_v1" if render.get("show_settlement_panel") else "cuebook_feed_v1"
    )
    brand = render.get("brand", "cuebook")
    if brand != "cuebook":
        errors.append(issue("BRAND", "$.render.brand", "Cuebook charts must use the cuebook brand."))
    for key in (
        "watermark",
        "show_settlement_panel",
        "show_state_label",
        "show_provenance_footer",
        "show_guide",
    ):
        value = render.get(key)
        if value is not None and not isinstance(value, bool):
            errors.append(issue("RENDER_BOOLEAN", f"$.render.{key}", f"{key} must be boolean."))
    locale = render.get("locale", "zh-CN")
    if locale not in {"zh-CN", "en-US"}:
        errors.append(issue("LOCALE", "$.render.locale", "Unsupported chart locale."))
    width = render.get("width")
    height = render.get("height")
    if not isinstance(width, int) or not 640 <= width <= 2400:
        errors.append(issue("RENDER_WIDTH", "$.render.width", "Chart width must be an integer from 640 to 2400."))
    if not isinstance(height, int) or not 280 <= height <= 1600:
        errors.append(issue("RENDER_HEIGHT", "$.render.height", "Chart height must be an integer from 280 to 1600."))
    if resolved_style_profile == "cuebook_feed_v1":
        if render.get("show_settlement_panel") is True:
            errors.append(issue("FEED_SETTLEMENT_PANEL", "$.render.show_settlement_panel", "Feed charts keep settlement prose outside the image."))
        if render.get("show_state_label") is True:
            errors.append(issue("FEED_STATE_LABEL", "$.render.show_state_label", "Feed charts must not expose internal artifact state."))
        if render.get("show_provenance_footer") is True:
            errors.append(issue("FEED_PROVENANCE", "$.render.show_provenance_footer", "Feed charts keep provenance in the artifact and detail view."))
        if render.get("show_guide") is True:
            errors.append(issue("FEED_GUIDE", "$.render.show_guide", "Feed charts must not show rendering instructions."))
        if render.get("watermark", True) is not True:
            errors.append(issue("FEED_WATERMARK", "$.render.watermark", "Cuebook Feed charts require the quiet brand watermark."))
        if style_profile is not None:
            public_copy = " ".join(str(render.get(key) or "") for key in ("title", "subtitle"))
            internal_phrases = (
                "Cuebook 从观点",
                "Cuebook提取",
                "从观点描述中提取",
                "SKILL",
                "CONDITIONAL",
                "DRAFT",
                "schema_version",
            )
            for phrase in internal_phrases:
                if phrase.lower() in public_copy.lower():
                    errors.append(issue("FEED_INTERNAL_COPY", "$.render", f"Feed copy exposes internal workflow language: {phrase}."))
    timeline_layout = render.get("timeline_layout", "continuous_time")
    if timeline_layout not in {"continuous_time", "decision_split"}:
        errors.append(issue("TIMELINE_LAYOUT", "$.render.timeline_layout", "Unsupported timeline layout."))
    split_ratio = render.get("decision_split_ratio", 0.68)
    if not isinstance(split_ratio, (int, float)) or isinstance(split_ratio, bool) or not 0.45 <= split_ratio <= 0.82:
        errors.append(issue("DECISION_SPLIT_RATIO", "$.render.decision_split_ratio", "Decision split ratio must be between 0.45 and 0.82."))
    if timeline_layout == "decision_split" and render.get("future_region") is not True:
        errors.append(issue("DECISION_SPLIT_FUTURE", "$.render.future_region", "Decision-split charts require a visible future region."))
    if horizon_status == "unspecified" and render.get("future_region") is True:
        errors.append(issue("UNSPECIFIED_FUTURE_REGION", "$.render.future_region", "Open-ended trigger charts cannot shade an invented future region."))
    if horizon_status == "unspecified" and timeline_layout != "continuous_time":
        errors.append(issue("UNSPECIFIED_TIMELINE", "$.render.timeline_layout", "Open-ended trigger charts require a continuous timeline."))
    if chart_type == "candles":
        if y_axis != "price":
            errors.append(issue("CANDLE_AXIS", "$.render.y_axis", "Candlestick charts require a price axis."))
        if len(series) != 1 or len(series_roles["primary"]) != 1:
            errors.append(issue("CANDLE_SERIES", "$.series", "Candlestick charts require exactly one primary series."))
        elif series[0].get("transformation") != "raw_price":
            errors.append(issue("CANDLE_TRANSFORMATION", "$.series[0].transformation", "Candlestick charts require raw_price transformation."))
    if render.get("show_volume") is True:
        if len(series) != 1:
            errors.append(issue("VOLUME_SERIES", "$.series", "Volume panels require exactly one market series."))
        volume_window = render.get("volume_average_window", 20)
        if not isinstance(volume_window, int) or isinstance(volume_window, bool) or not 5 <= volume_window <= 100:
            errors.append(issue("VOLUME_WINDOW", "$.render.volume_average_window", "Volume average window must be an integer from 5 to 100."))

    if evaluation_kind == "relative_performance":
        if mode != "relative_performance":
            errors.append(issue("RELATIVE_MODE", "$.render.mode", "Relative claims require relative_performance mode."))
        if direction not in {"outperform", "underperform"}:
            errors.append(issue("RELATIVE_DIRECTION", "$.claim.direction", "Relative claims require outperform or underperform."))
        if len(series_roles["benchmark"]) != 1 or len(series) != 2:
            errors.append(issue("RELATIVE_BENCHMARK", "$.series", "Relative charts require exactly one primary and one benchmark series."))
        if any(item.get("transformation") != "return_from_baseline" for item in series if isinstance(item, dict)):
            errors.append(issue("RELATIVE_TRANSFORMATION", "$.series", "Both relative chart legs must use return_from_baseline."))
        if y_axis != "return_pct":
            errors.append(issue("RELATIVE_AXIS", "$.render.y_axis", "Two-leg relative charts must use return_pct."))
        if len(baseline_times) == 2 and baseline_times[0] != baseline_times[1]:
            errors.append(issue("RELATIVE_BASELINE_TIME", "$.series", "Relative baselines must use the same timestamp."))
        if len(baseline_bases) == 2 and baseline_bases[0] != baseline_bases[1]:
            errors.append(issue("RELATIVE_BASELINE_BASIS", "$.series", "Relative baselines must use the same quote basis."))
    elif evaluation_kind == "range":
        if mode != "range_band":
            errors.append(issue("RANGE_MODE", "$.render.mode", "Range claims require range_band mode."))
        if y_axis != "price":
            errors.append(issue("RANGE_AXIS", "$.render.y_axis", "Range charts require a price axis."))
    elif evaluation_kind == "event_occurrence" and mode not in {"event_reaction"}:
        errors.append(issue("EVENT_MODE", "$.render.mode", "Price-backed event charts require event_reaction mode."))
    elif mode == "relative_performance":
        errors.append(issue("MODE_CLAIM_MISMATCH", "$.render.mode", "Relative mode requires a relative-performance claim."))

    annotations = payload.get("annotations")
    if not isinstance(annotations, list):
        errors.append(issue("ANNOTATIONS", "$.annotations", "Annotations must be an array."))
        annotations = []
    annotation_ids: set[str] = set()
    kinds: set[str] = set()
    for index, annotation in enumerate(annotations):
        path = f"$.annotations[{index}]"
        if not isinstance(annotation, dict):
            errors.append(issue("ANNOTATION", path, "Annotation must be an object."))
            continue
        annotation_id = annotation.get("id")
        if not isinstance(annotation_id, str) or not re.fullmatch(r"A[1-9][0-9]*", annotation_id):
            errors.append(issue("ANNOTATION_ID", f"{path}.id", "Annotation ID must use A<number>."))
        elif annotation_id in annotation_ids:
            errors.append(issue("ANNOTATION_ID_UNIQUE", f"{path}.id", "Annotation IDs must be unique."))
        else:
            annotation_ids.add(annotation_id)
        kind = annotation.get("kind")
        kinds.add(str(kind or ""))
        series_ref = annotation.get("series_ref")
        if series_ref is not None and series_ref not in series_ids:
            errors.append(issue("ANNOTATION_SERIES_REF", f"{path}.series_ref", "Annotation references an unknown series."))
        value = annotation.get("value")
        if kind in {"target", "trigger", "invalidation", "range_lower", "range_upper"} and not isinstance(value, (int, float)):
            errors.append(issue("ANNOTATION_VALUE", f"{path}.value", f"{kind} annotation requires a numeric value."))
        observed_at = annotation.get("observed_at")
        if kind in {"event", "declaration", "baseline", "expiry"} and observed_at is None:
            errors.append(issue("ANNOTATION_TIME", f"{path}.observed_at", f"{kind} annotation requires a timestamp."))
        if observed_at is not None:
            parse_datetime(observed_at, f"{path}.observed_at", errors)
        if not isinstance(annotation.get("label"), str) or not annotation.get("label", "").strip():
            errors.append(issue("ANNOTATION_LABEL", f"{path}.label", "Annotation label is required."))
        if annotation.get("provenance") not in {"explicit", "derived"}:
            errors.append(issue("ANNOTATION_PROVENANCE", f"{path}.provenance", "Unsupported annotation provenance."))
        if not isinstance(annotation.get("source_ref"), str) or not annotation.get("source_ref", "").strip():
            errors.append(issue("ANNOTATION_SOURCE", f"{path}.source_ref", "Annotation source is required."))

    if horizon_status == "explicit" and "expiry" not in kinds:
        errors.append(issue("EXPIRY_ANNOTATION", "$.annotations", "Every thesis chart requires an expiry annotation."))
    if horizon_status == "unspecified" and "expiry" in kinds:
        errors.append(issue("UNSPECIFIED_EXPIRY", "$.annotations", "Open-ended trigger charts must not invent an expiry annotation."))
    if render.get("timeline_layout", "continuous_time") == "decision_split" and "declaration" not in kinds:
        errors.append(issue("DECLARATION_ANNOTATION", "$.annotations", "Decision-split charts require a declaration annotation."))
    if action_state == "wait_for_trigger" and "trigger" not in kinds and "event" not in kinds:
        errors.append(issue("TRIGGER_ANNOTATION", "$.annotations", "A wait-for-trigger chart must show its price or event trigger."))
    if evaluation_kind == "range" and not {"range_lower", "range_upper"}.issubset(kinds):
        errors.append(issue("RANGE_ANNOTATIONS", "$.annotations", "Range charts require lower and upper annotations."))
    if resolved_style_profile == "cuebook_feed_v1" and len(annotations) > 4:
        warnings.append(issue("FEED_ANNOTATION_DENSITY", "$.annotations", "Feed charts should keep at most four visible annotations; demote the rest to detail metadata."))
    if resolved_style_profile == "cuebook_feed_v1" and len(str(render.get("title") or "")) > 48:
        warnings.append(issue("FEED_TITLE_DENSITY", "$.render.title", "Feed title may exceed two compact lines; shorten it before release."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY", "$.quality_report", "Quality report must be an object."))
        quality = {}
    decision = quality.get("decision")
    quality_warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    hard_failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."))
    if decision == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked decision requires a hard failure."))
    if state == "conditional" and decision != "conditional":
        errors.append(issue("CONDITIONAL_DECISION", "$.quality_report.decision", "Conditional state requires conditional decision."))
    if state in {"ready", "frozen"}:
        if decision != "ready":
            errors.append(issue("READY_DECISION", "$.quality_report.decision", "Ready or frozen state requires ready decision."))
        if interval_status != "matched":
            errors.append(issue("READY_INTERVAL", "$.time.interval_status", "Ready or frozen chart requires matched interval."))
        if quality_warnings or hard_failures:
            errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen chart cannot carry warnings or hard failures."))
    if interval_status == "degraded" and decision == "ready":
        errors.append(issue("DEGRADED_READY", "$.quality_report.decision", "Degraded interval cannot be ready."))
    if interval_status == "degraded" and not quality_warnings:
        errors.append(issue("DEGRADED_WARNING", "$.quality_report.warnings", "Degraded interval requires an explicit warning."))
    if decision == "conditional" and not quality_warnings:
        errors.append(issue("CONDITIONAL_WARNING", "$.quality_report.warnings", "Conditional charts require an explicit warning."))

    if interval_status == "degraded":
        warnings.append(issue("DEGRADED_INTERVAL", "$.time", "Chart can orient the reader but cannot claim confirmation at the preferred interval."))
    if any(isinstance(item, dict) and item.get("provider", {}).get("coverage_status") == "partial" for item in series):
        warnings.append(issue("PARTIAL_COVERAGE", "$.series", "Provider reported partial coverage; verify baseline and required observation are present."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("READ", "$", str(exc))], "warnings": []}, indent=2))
        return 1
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
