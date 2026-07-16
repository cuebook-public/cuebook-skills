#!/usr/bin/env python3
"""Validate SettlementClaimV1 and render its deterministic public one-line."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


STATES = {"draft", "needs_confirmation", "ready", "frozen"}
DIRECTIONS = {"long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"}
NUMERIC_OPERATORS = {"gt", "gte", "lt", "lte", "eq"}
PRICE_METRICS = {"official_close", "official_settlement", "spot_price", "intraday_high", "intraday_low", "vwap"}
SCORE_MODES = {"binary_accuracy", "directional_accuracy", "return", "excess_return"}
BASELINE_BASES = {"last_trade", "last_close", "midpoint", "official_close", "official_settlement", "spot", "intraday", "nav", "event_status", "none"}
BASELINE_MARKET_STATES = {"regular", "pre", "after", "overnight", "closed", "continuous", "event_window", "unknown"}
ACTION_STATES = {"enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"}
ENTRY_PRICE_RULES = {"publication_baseline", "trigger_observation", "not_applicable"}
TARGET_VALUE_SOURCES = {"baseline", "explicit_target", "benchmark", "event", "trigger_observation", "none"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def as_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_array(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def string_set(value: Any, path: str, errors: list[dict[str, str]]) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_SET_TYPE", path, "Expected an array of strings."))
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            errors.append(issue("STRING_SET_VALUE", f"{path}[{index}]", "Expected a non-empty string."))
        else:
            result.append(item.strip())
    if len(result) != len(set(result)):
        errors.append(issue("STRING_SET_DUPLICATE", path, "Values must be unique."))
    return result


def parse_time(value: Any, path: str, errors: list[dict[str, str]], required: bool = True) -> datetime | None:
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip():
        errors.append(issue("DATETIME_REQUIRED", path, "Expected an ISO 8601 timestamp."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("DATETIME_FORMAT", path, "Invalid ISO 8601 timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("DATETIME_TIMEZONE", path, "Timestamp must include a timezone offset."))
        return None
    return parsed


def canonical_payload(payload: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(payload)
    lineage = as_object(result.get("lineage"))
    lineage["canonical_hash"] = None
    result["lineage"] = lineage
    return result


def canonical_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(canonical_payload(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def format_number(value: Any) -> str:
    if not is_number(value):
        return "?"
    if float(value).is_integer():
        return str(int(value))
    return (f"{value:.8f}").rstrip("0").rstrip(".")


def local_end_date(payload: dict[str, Any]) -> str:
    clock = as_object(payload.get("clock"))
    if clock.get("end_mode") == "protocol_event":
        return str(clock.get("end_event_label") or "事件待定")
    value = clock.get("window_end")
    if not isinstance(value, str):
        return "待定"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        timezone = ZoneInfo(str(clock.get("timezone") or "UTC"))
        return parsed.astimezone(timezone).date().isoformat()
    except (ValueError, ZoneInfoNotFoundError):
        return value[:10]


def metric_label(metric: str, market_session: str) -> str:
    if metric == "official_close":
        return "常规收盘" if market_session == "regular" else "官方收盘"
    return {
        "official_settlement": "官方结算价",
        "spot_price": "现价",
        "intraday_high": "盘中最高价",
        "intraday_low": "盘中最低价",
        "vwap": "VWAP",
        "total_return_pct": "总收益率",
        "excess_return_pct": "超额收益率",
        "spread_value": "价差",
        "probability_pct": "概率",
        "fundamental_value": "指标值",
    }.get(metric, metric)


def benchmark_label(value: Any) -> str:
    ref = str(value or "").strip()
    if not ref:
        return ""
    parts = ref.split(":")
    if len(parts) > 1 and parts[0].lower() == "benchmark":
        return parts[1]
    if ":" in ref and not ref.lower().startswith(("http:", "https:")):
        return parts[0]
    return ref


def condition_text(condition: dict[str, Any], market_session: str) -> str:
    kind = condition.get("kind")
    metric = str(condition.get("metric") or "")
    operator = str(condition.get("operator") or "")
    target = as_object(condition.get("target"))
    mode = condition.get("observation_mode")
    if kind == "event":
        return str(condition.get("description") or "事件条件")

    prefix = {
        "at_expiry": "到期",
        "any_in_window": "期间任一",
        "every_observation": "期间每次",
        "first_after_event": "事件后首次",
        "event_by_expiry": "到期前",
    }.get(mode, "")
    label = metric_label(metric, market_session)
    dynamic_trigger_value = target.get("value_source") == "trigger_observation"
    unit = "" if dynamic_trigger_value else (f" {target.get('unit')}" if target.get("unit") else "")
    benchmark = benchmark_label(condition.get("benchmark_ref")) if kind == "relative_return" else ""
    benchmark_suffix = f"（相对 {benchmark}）" if benchmark else ""
    if operator == "between":
        return f"{prefix}{label}在 {format_number(target.get('lower_bound'))}-{format_number(target.get('upper_bound'))}{unit}"
    symbol = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "eq": "="}.get(operator, operator)
    target_text = "触发收盘价" if dynamic_trigger_value else format_number(target.get("value"))
    return f"{prefix}{label} {symbol} {target_text}{unit}{benchmark_suffix}"


def render_one_line(payload: dict[str, Any]) -> str:
    direction = {
        "long": "看多",
        "short": "看空",
        "outperform": "跑赢",
        "underperform": "跑输",
        "range": "区间",
        "event_yes": "事件会发生",
        "event_no": "事件不会发生",
        "neutral": "中性",
    }.get(str(payload.get("direction") or ""), "待定")
    action_state = as_object(payload.get("intent")).get("action_state")
    if action_state == "wait_for_trigger":
        direction = f"条件{direction}"
    elif action_state == "observe_only":
        direction = "观察"
    elif action_state == "avoid":
        direction = "回避"
    elif action_state == "exit":
        direction = "退出"
    elif action_state == "hold":
        direction = f"持有{direction}"
    subject = as_object(payload.get("subject"))
    ticker = str(subject.get("ticker") or subject.get("display_name") or "标的")
    clock = as_object(payload.get("clock"))
    session = str(clock.get("market_session") or "regular")
    success = as_object(payload.get("success"))
    conditions = [item for item in as_array(success.get("conditions")) if isinstance(item, dict)]
    pieces = [condition_text(item, session) for item in conditions]
    connector = {"all": " 且 ", "any": " 或 ", "sequence": " -> "}.get(success.get("logic"), " 且 ")
    condition_summary = connector.join(pieces) if pieces else "条件待定"
    status = str(as_object(payload.get("public_view")).get("status_label") or {
        "draft": "草稿",
        "needs_confirmation": "待确认",
        "ready": "待结算",
        "frozen": "已冻结",
    }.get(payload.get("state"), "待确认"))
    horizon = f"至{local_end_date(payload)}" if clock.get("end_mode") == "protocol_event" else f"截至 {local_end_date(payload)}"
    return f"{ticker} {direction}｜{horizon}｜{condition_summary}｜{status}"


def validate_condition(
    condition: Any,
    path: str,
    baseline: dict[str, Any],
    overall_start: datetime | None,
    overall_end: datetime | None,
    errors: list[dict[str, str]],
) -> tuple[str | None, dict[str, Any]]:
    if not isinstance(condition, dict):
        errors.append(issue("CONDITION_TYPE", path, "Condition must be an object."))
        return None, {}
    condition_id = condition.get("id")
    if not isinstance(condition_id, str) or not re.fullmatch(r"[CF][1-9][0-9]*", condition_id):
        errors.append(issue("CONDITION_ID", f"{path}.id", "Condition ID must use C<number> or F<number>."))
        condition_id = None
    for key in ("subject_ref", "kind", "metric", "operator", "observation_mode", "data_source_ref", "description"):
        if not isinstance(condition.get(key), str) or not str(condition.get(key)).strip():
            errors.append(issue("CONDITION_FIELD", f"{path}.{key}", f"Condition requires {key}."))

    kind = condition.get("kind")
    metric = condition.get("metric")
    operator = condition.get("operator")
    mode = condition.get("observation_mode")
    target = as_object(condition.get("target"))
    value = target.get("value")
    lower = target.get("lower_bound")
    upper = target.get("upper_bound")
    value_source = target.get("value_source")
    if value_source not in TARGET_VALUE_SOURCES:
        errors.append(issue("TARGET_VALUE_SOURCE", f"{path}.target.value_source", "Unsupported target value source."))
    dynamic_trigger_value = value_source == "trigger_observation" and value is None

    if kind == "terminal_value":
        if mode not in {"at_expiry", "first_after_event"} or metric not in PRICE_METRICS | {"total_return_pct", "fundamental_value", "probability_pct"} or operator not in NUMERIC_OPERATORS or not (is_number(value) or dynamic_trigger_value):
            errors.append(issue("TERMINAL_CONTRACT", path, "Terminal value requires an expiry or event observation, a supported metric and operator, and a numeric or trigger-observation target."))
        if mode == "first_after_event" and not str(condition.get("event_ref") or "").strip():
            errors.append(issue("POST_EVENT_REF", f"{path}.event_ref", "first_after_event requires an event_ref."))
    elif kind == "window_barrier":
        if mode not in {"any_in_window", "every_observation"} or metric not in PRICE_METRICS | {"total_return_pct", "probability_pct"} or operator not in NUMERIC_OPERATORS or not is_number(value):
            errors.append(issue("BARRIER_CONTRACT", path, "Window barrier requires a window observation mode, numeric metric, operator, and target value."))
    elif kind == "relative_return":
        if metric != "excess_return_pct" or operator not in NUMERIC_OPERATORS or not is_number(value) or not str(condition.get("benchmark_ref") or "").strip():
            errors.append(issue("RELATIVE_CONTRACT", path, "Relative return requires excess_return_pct, a numeric target, and benchmark_ref."))
    elif kind == "range":
        if operator != "between" or not is_number(lower) or not is_number(upper) or lower >= upper:
            errors.append(issue("RANGE_CONTRACT", path, "Range requires ordered numeric lower and upper bounds."))
    elif kind == "event":
        if metric != "event_status" or operator not in {"occurred", "not_occurred"} or mode not in {"event_by_expiry", "first_after_event"} or not str(condition.get("event_ref") or "").strip():
            errors.append(issue("EVENT_CONTRACT", path, "Event requires event_status, an event operator, observation mode, and event_ref."))
    elif kind == "spread":
        if metric != "spread_value" or operator not in NUMERIC_OPERATORS or not is_number(value) or not str(condition.get("benchmark_ref") or "").strip():
            errors.append(issue("SPREAD_CONTRACT", path, "Spread requires spread_value, numeric target, and a formula/leg reference."))
    elif kind == "probability":
        if metric != "probability_pct" or operator not in NUMERIC_OPERATORS or not is_number(value) or value < 0 or value > 100:
            errors.append(issue("PROBABILITY_CONTRACT", path, "Probability requires probability_pct and a target from 0 to 100."))
    elif kind == "fundamental":
        if metric != "fundamental_value" or operator not in NUMERIC_OPERATORS or not is_number(value):
            errors.append(issue("FUNDAMENTAL_CONTRACT", path, "Fundamental value requires a numeric target and operator."))
    else:
        errors.append(issue("CONDITION_KIND", f"{path}.kind", "Unsupported condition kind."))

    if target.get("value_source") == "baseline":
        baseline_value = baseline.get("value")
        if not is_number(value) or not is_number(baseline_value) or abs(float(value) - float(baseline_value)) > 1e-9:
            errors.append(issue("BASELINE_TARGET", f"{path}.target", "A baseline target must equal the sourced baseline value."))

    condition_start = parse_time(condition.get("window_start"), f"{path}.window_start", errors, required=False)
    condition_end = parse_time(condition.get("window_end"), f"{path}.window_end", errors, required=False)
    if (condition_start is None) != (condition_end is None):
        errors.append(issue("CONDITION_WINDOW_PAIR", path, "Condition window_start and window_end must both be set or both be null."))
    if condition_start and condition_end:
        if condition_end <= condition_start:
            errors.append(issue("CONDITION_WINDOW_ORDER", path, "Condition window_end must follow window_start."))
        if overall_start and condition_start < overall_start:
            errors.append(issue("CONDITION_WINDOW_START", path, "Condition window starts before the overall window."))
        if overall_end and condition_end > overall_end:
            errors.append(issue("CONDITION_WINDOW_END", path, "Condition window ends after the overall window."))
    return condition_id, condition


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if payload.get("schema_version") != "settlement-claim-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected settlement-claim-v1."))
    claim_id = payload.get("claim_id")
    if not isinstance(claim_id, str) or not re.fullmatch(r"SETTLE_[A-Za-z0-9_-]{8,}", claim_id):
        errors.append(issue("CLAIM_ID", "$.claim_id", "Invalid claim_id."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "revision must be a positive integer."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage = as_object(payload.get("lineage"))
    source_refs = string_set(lineage.get("source_content_refs"), "$.lineage.source_content_refs", errors)
    if not source_refs:
        errors.append(issue("SOURCE_CONTENT_REQUIRED", "$.lineage.source_content_refs", "At least one source content reference is required."))

    extraction = as_object(payload.get("extraction"))
    if extraction.get("mode") not in {"explicit", "mixed", "proposed"}:
        errors.append(issue("EXTRACTION_MODE", "$.extraction.mode", "Unsupported extraction mode."))
    proposed = set(string_set(extraction.get("proposed_fields"), "$.extraction.proposed_fields", errors))
    confirmed = set(string_set(extraction.get("confirmed_fields"), "$.extraction.confirmed_fields", errors))
    missing = set(string_set(extraction.get("missing_fields"), "$.extraction.missing_fields", errors))
    string_set(extraction.get("explicit_fields"), "$.extraction.explicit_fields", errors)
    string_set(extraction.get("inferred_fields"), "$.extraction.inferred_fields", errors)
    unconfirmed = proposed - confirmed
    if state in {"ready", "frozen"} and unconfirmed:
        errors.append(issue("UNCONFIRMED_PROPOSAL", "$.extraction", f"Unconfirmed proposed fields: {sorted(unconfirmed)}"))
    if state in {"ready", "frozen"} and missing:
        errors.append(issue("MISSING_READY_FIELD", "$.extraction.missing_fields", "Ready or frozen claims cannot have missing fields."))

    subject = as_object(payload.get("subject"))
    for key in ("instrument_id", "ticker", "display_name", "asset_class", "venue", "quote_currency"):
        if not isinstance(subject.get(key), str) or not str(subject.get(key)).strip():
            errors.append(issue("SUBJECT_FIELD", f"$.subject.{key}", f"Subject requires {key}."))
    direction = payload.get("direction")
    if direction not in DIRECTIONS:
        errors.append(issue("DIRECTION", "$.direction", "Unsupported direction."))
    if not isinstance(payload.get("claim_text"), str) or not str(payload.get("claim_text")).strip():
        errors.append(issue("CLAIM_TEXT", "$.claim_text", "claim_text is required."))

    intent_value = payload.get("intent")
    intent = as_object(intent_value)
    action_state = intent.get("action_state") if intent_value is not None else "enter_now"
    if action_state not in ACTION_STATES:
        errors.append(issue("ACTION_STATE", "$.intent.action_state", "Unsupported action state."))
    entry_price_rule = intent.get("entry_price_rule") if intent_value is not None else "publication_baseline"
    if entry_price_rule not in ENTRY_PRICE_RULES:
        errors.append(issue("ENTRY_PRICE_RULE", "$.intent.entry_price_rule", "Unsupported entry price rule."))
    if action_state in {"observe_only", "avoid", "exit"} and direction != "neutral":
        errors.append(issue("ACTION_DIRECTION_CONFLICT", "$.intent.action_state", "Observe-only, avoid, and exit claims use neutral direction."))
    if action_state in {"observe_only", "avoid", "exit"} and entry_price_rule != "not_applicable":
        errors.append(issue("ACTION_ENTRY_RULE_CONFLICT", "$.intent.entry_price_rule", "This action state cannot define an entry price."))

    baseline = as_object(payload.get("baseline"))
    baseline_observed = None
    if baseline.get("value") is not None:
        if not is_number(baseline.get("value")):
            errors.append(issue("BASELINE_VALUE", "$.baseline.value", "Baseline value must be numeric or null."))
        baseline_observed = parse_time(baseline.get("observed_at"), "$.baseline.observed_at", errors)
        if not str(baseline.get("unit") or "").strip() or not str(baseline.get("data_source_ref") or "").strip() or baseline.get("observation_basis") in {None, "none"}:
            errors.append(issue("BASELINE_PROVENANCE", "$.baseline", "Numeric baseline requires unit, basis, timestamp, and data source."))
    if baseline.get("observation_basis") not in BASELINE_BASES:
        errors.append(issue("BASELINE_BASIS", "$.baseline.observation_basis", "Unsupported baseline observation basis."))
    if baseline.get("market_state") not in BASELINE_MARKET_STATES:
        errors.append(issue("BASELINE_MARKET_STATE", "$.baseline.market_state", "Baseline must preserve the observed market state."))

    clock = as_object(payload.get("clock"))
    declared = parse_time(clock.get("declared_at"), "$.clock.declared_at", errors)
    window_start = parse_time(clock.get("window_start"), "$.clock.window_start", errors)
    end_mode = clock.get("end_mode", "fixed_datetime")
    if end_mode not in {"fixed_datetime", "protocol_event"}:
        errors.append(issue("CLOCK_END_MODE", "$.clock.end_mode", "Clock end mode must be fixed_datetime or protocol_event."))
    window_end = parse_time(clock.get("window_end"), "$.clock.window_end", errors, required=end_mode == "fixed_datetime")
    fallback_window_end = parse_time(clock.get("fallback_window_end"), "$.clock.fallback_window_end", errors, required=False)
    if end_mode == "protocol_event":
        if clock.get("window_end") is not None:
            errors.append(issue("EVENT_CLOCK_WINDOW_END", "$.clock.window_end", "A protocol-event clock keeps window_end null."))
        for key in ("end_event_ref", "end_event_label", "end_event_source_ref"):
            if not isinstance(clock.get(key), str) or not str(clock.get(key)).strip():
                errors.append(issue("EVENT_CLOCK_FIELD", f"$.clock.{key}", f"A protocol-event clock requires {key}."))
        if window_start and fallback_window_end and fallback_window_end <= window_start:
            errors.append(issue("FALLBACK_WINDOW_ORDER", "$.clock.fallback_window_end", "Fallback window end must follow window_start."))
    elif any(clock.get(key) is not None for key in ("end_event_ref", "end_event_label", "end_event_source_ref", "fallback_window_end")):
        errors.append(issue("FIXED_CLOCK_EVENT_FIELDS", "$.clock", "A fixed clock cannot carry protocol-event fields."))
    if declared and window_start and window_start < declared:
        errors.append(issue("WINDOW_BEFORE_DECLARATION", "$.clock.window_start", "Window cannot start before declared_at."))
    if declared and baseline_observed and baseline_observed > declared:
        errors.append(issue("BASELINE_AFTER_DECLARATION", "$.baseline.observed_at", "Baseline observation cannot occur after the claim declaration."))
    if window_start and window_end and window_end <= window_start:
        errors.append(issue("WINDOW_ORDER", "$.clock.window_end", "window_end must follow window_start."))
    try:
        ZoneInfo(str(clock.get("timezone") or ""))
    except ZoneInfoNotFoundError:
        errors.append(issue("TIMEZONE", "$.clock.timezone", "Unknown IANA timezone."))
    if clock.get("market_session") not in {"regular", "extended", "all_sessions", "continuous", "event_window"}:
        errors.append(issue("MARKET_SESSION", "$.clock.market_session", "Unsupported market session."))

    success = as_object(payload.get("success"))
    logic = success.get("logic")
    success_conditions = as_array(success.get("conditions"))
    if logic not in {"all", "any", "sequence"}:
        errors.append(issue("SUCCESS_LOGIC", "$.success.logic", "Unsupported condition logic."))
    if not success_conditions:
        errors.append(issue("SUCCESS_CONDITION_REQUIRED", "$.success.conditions", "At least one success condition is required."))
    if logic == "sequence" and len(success_conditions) < 2:
        errors.append(issue("SEQUENCE_LENGTH", "$.success.conditions", "Sequence requires at least two conditions."))

    ids: set[str] = set()
    parsed_success: list[dict[str, Any]] = []
    for index, condition in enumerate(success_conditions):
        condition_id, parsed = validate_condition(condition, f"$.success.conditions[{index}]", baseline, window_start, window_end, errors)
        if condition_id in ids:
            errors.append(issue("CONDITION_ID_DUPLICATE", f"$.success.conditions[{index}].id", "Condition IDs must be unique."))
        if condition_id:
            ids.add(condition_id)
        parsed_success.append(parsed)

    trigger_ref = intent.get("trigger_condition_ref") if intent_value is not None else None
    if action_state == "wait_for_trigger":
        if not isinstance(trigger_ref, str) or trigger_ref not in ids:
            errors.append(issue("TRIGGER_CONDITION_REF", "$.intent.trigger_condition_ref", "wait_for_trigger requires a valid success-condition reference."))
        if logic != "sequence" or len(success_conditions) < 2:
            errors.append(issue("CONDITIONAL_SEQUENCE", "$.success", "wait_for_trigger requires a trigger followed by an outcome condition."))
        elif success_conditions[0].get("id") != trigger_ref:
            errors.append(issue("TRIGGER_SEQUENCE_ORDER", "$.success.conditions", "The trigger condition must be first in the sequence."))
    elif trigger_ref is not None:
        errors.append(issue("UNUSED_TRIGGER_REF", "$.intent.trigger_condition_ref", "Only wait_for_trigger may carry a trigger condition reference."))
    if entry_price_rule == "trigger_observation" and action_state != "wait_for_trigger":
        errors.append(issue("TRIGGER_ENTRY_RULE", "$.intent.entry_price_rule", "trigger_observation requires wait_for_trigger."))
    dynamic_outcomes = [item for item in parsed_success if as_object(item.get("target")).get("value_source") == "trigger_observation"]
    if dynamic_outcomes and (action_state != "wait_for_trigger" or entry_price_rule != "trigger_observation"):
        errors.append(issue("DYNAMIC_TRIGGER_TARGET", "$.success.conditions", "A trigger-observation target requires wait_for_trigger and entry_price_rule trigger_observation."))
    if any(item.get("id") == trigger_ref for item in dynamic_outcomes):
        errors.append(issue("TRIGGER_TARGET_SELF_REFERENCE", "$.success.conditions", "The trigger condition cannot target its own trigger observation."))
    if end_mode == "protocol_event":
        end_event_ref = str(clock.get("end_event_ref") or "")
        post_event_outcomes = [
            item for item in parsed_success
            if item.get("observation_mode") == "first_after_event" and item.get("event_ref") == end_event_ref
        ]
        if direction in {"long", "short", "outperform", "underperform", "range"} and not post_event_outcomes:
            errors.append(issue("EVENT_HORIZON_OUTCOME", "$.success.conditions", "A directional protocol-event horizon requires an outcome observed first after the named end event."))

    failure = as_object(payload.get("failure"))
    if failure.get("mode") not in {"complement_at_expiry", "early_condition", "manual_review"}:
        errors.append(issue("FAILURE_MODE", "$.failure.mode", "Unsupported failure mode."))
    failure_conditions = as_array(failure.get("conditions"))
    if failure.get("mode") == "early_condition" and not failure_conditions:
        errors.append(issue("EARLY_FAILURE_REQUIRED", "$.failure.conditions", "early_condition requires at least one condition."))
    if failure.get("mode") == "complement_at_expiry" and failure_conditions:
        errors.append(issue("COMPLEMENT_CONDITIONS", "$.failure.conditions", "Complement-at-expiry must not add separate failure conditions."))
    if not isinstance(failure.get("text"), str) or not str(failure.get("text")).strip():
        errors.append(issue("FAILURE_TEXT", "$.failure.text", "Failure text is required."))
    for index, condition in enumerate(failure_conditions):
        condition_id, _ = validate_condition(condition, f"$.failure.conditions[{index}]", baseline, window_start, window_end, errors)
        if condition_id in ids:
            errors.append(issue("CONDITION_ID_DUPLICATE", f"$.failure.conditions[{index}].id", "Condition IDs must be unique."))
        if condition_id:
            ids.add(condition_id)

    primary_price = next((item for item in parsed_success if item.get("subject_ref") == "primary" and item.get("kind") in {"terminal_value", "window_barrier"} and item.get("metric") in PRICE_METRICS | {"total_return_pct"}), None)
    if direction == "long":
        if not primary_price:
            errors.append(issue("LONG_PRICE_CONDITION", "$.success.conditions", "Long direction requires a primary upside price or return condition."))
        elif primary_price.get("operator") in {"lt", "lte"}:
            errors.append(issue("DIRECTION_CONFLICT", "$.success.conditions", "Long direction conflicts with a downside primary condition."))
    if direction == "short":
        if not primary_price:
            errors.append(issue("SHORT_PRICE_CONDITION", "$.success.conditions", "Short direction requires a primary downside price or return condition."))
        elif primary_price.get("operator") in {"gt", "gte"}:
            errors.append(issue("DIRECTION_CONFLICT", "$.success.conditions", "Short direction conflicts with an upside primary condition."))
    if direction in {"outperform", "underperform"} and not any(item.get("kind") == "relative_return" for item in parsed_success):
        errors.append(issue("RELATIVE_DIRECTION_CONDITION", "$.success.conditions", "Relative direction requires a relative_return condition."))
    if direction == "range" and not any(item.get("kind") == "range" for item in parsed_success):
        errors.append(issue("RANGE_DIRECTION_CONDITION", "$.success.conditions", "Range direction requires a range condition."))
    if direction in {"event_yes", "event_no"} and not any(item.get("kind") == "event" for item in parsed_success):
        errors.append(issue("EVENT_DIRECTION_CONDITION", "$.success.conditions", "Event direction requires an event condition."))

    resolution = as_object(payload.get("resolution"))
    if not str(resolution.get("primary_source_ref") or "").strip():
        errors.append(issue("PRIMARY_SOURCE", "$.resolution.primary_source_ref", "Primary resolution source is required."))
    fallbacks = string_set(resolution.get("fallback_source_refs"), "$.resolution.fallback_source_refs", errors)
    if resolution.get("ambiguity_policy") == "fallback_source" and not fallbacks:
        errors.append(issue("FALLBACK_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."))
    if not str(resolution.get("adjustments_policy") or "").strip():
        errors.append(issue("ADJUSTMENTS_POLICY", "$.resolution.adjustments_policy", "adjustments_policy is required."))
    score_modes = set(string_set(resolution.get("score_modes"), "$.resolution.score_modes", errors))
    if not score_modes or score_modes - SCORE_MODES:
        errors.append(issue("SCORE_MODES", "$.resolution.score_modes", "Unsupported or empty score modes."))
    if "excess_return" in score_modes and not any(item.get("kind") == "relative_return" for item in parsed_success):
        errors.append(issue("EXCESS_RETURN_SCORE", "$.resolution.score_modes", "excess_return scoring requires a relative_return condition."))

    public_view = as_object(payload.get("public_view"))
    expected_status = {"draft": "草稿", "needs_confirmation": "待确认", "ready": "待结算", "frozen": "已冻结"}.get(state)
    if public_view.get("status_label") != expected_status:
        errors.append(issue("STATUS_LABEL", "$.public_view.status_label", f"Expected status label {expected_status}."))
    summary = public_view.get("settlement_summary")
    if not isinstance(summary, str) or not summary.strip() or len(summary) > 600:
        errors.append(issue("SETTLEMENT_SUMMARY", "$.public_view.settlement_summary", "Summary must contain 1-600 characters."))
    generated_line = render_one_line(payload)
    if public_view.get("one_line") != generated_line:
        errors.append(issue("ONE_LINE_MISMATCH", "$.public_view.one_line", f"Expected deterministic one-line: {generated_line}"))

    quality = as_object(payload.get("quality_report"))
    quality_missing = set(string_set(quality.get("missing_fields"), "$.quality_report.missing_fields", errors))
    if quality_missing != missing:
        errors.append(issue("MISSING_FIELD_MISMATCH", "$.quality_report.missing_fields", "Quality and extraction missing fields must match."))
    expected_decision = "ready" if state in {"ready", "frozen"} else "needs_confirmation"
    if state == "draft" and quality.get("decision") == "blocked":
        expected_decision = "blocked"
    if quality.get("decision") != expected_decision:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", f"Expected quality decision {expected_decision}."))
    string_set(quality.get("warnings"), "$.quality_report.warnings", errors)

    expected_hash = canonical_hash(payload)
    stored_hash = lineage.get("canonical_hash")
    if state == "frozen":
        if stored_hash != expected_hash:
            errors.append(issue("CANONICAL_HASH", "$.lineage.canonical_hash", "Frozen claim canonical hash is missing or does not match."))
    elif stored_hash is not None:
        errors.append(issue("UNFROZEN_HASH", "$.lineage.canonical_hash", "Only frozen claims may store a canonical hash."))

    if state in {"draft", "needs_confirmation"}:
        warnings.append(issue("NOT_READY", "$.state", "Claim is not ready for release as a settleable commitment."))
    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "generated_one_line": generated_line,
        "canonical_hash": expected_hash,
    }


def load_payload(path: str) -> dict[str, Any]:
    if path == "-":
        value = json.load(sys.stdin)
    else:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Top-level JSON value must be an object.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", help="SettlementClaimV1 JSON file, or - for stdin")
    parser.add_argument("--print-one-line", action="store_true")
    parser.add_argument("--print-canonical-hash", action="store_true")
    args = parser.parse_args()
    try:
        payload = load_payload(args.path)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [{"code": "INPUT", "path": "$", "message": str(exc)}]}, ensure_ascii=False))
        return 1
    result = validate(payload)
    if args.print_one_line:
        print(result["generated_one_line"])
    elif args.print_canonical_hash:
        print(result["canonical_hash"])
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
