#!/usr/bin/env python3
"""Validate SettlementFormulaV1 and render deterministic public math."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import UUID


STATES = {"draft", "ready", "frozen"}
DIRECTIONS = {"long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"}
VARIABLE_KINDS = {"market_observation", "derived_metric", "event_observation"}
VALUE_TYPES = {"number", "boolean", "datetime"}
NUMERIC_OPS = {"add", "sub", "mul", "div", "mean"}
COMPARISON_OPS = {"gt", "gte", "lt", "lte", "eq", "between"}
BOOLEAN_OPS = {"and", "or", "not"}
ALL_OPS = {"literal", "var", "capture"} | NUMERIC_OPS | COMPARISON_OPS | BOOLEAN_OPS
FORMULA_FAMILIES = {
    "single_asset_direction",
    "single_asset_price_target",
    "pair_asset_direction",
    "pair_asset_price_targets",
}
DIRECTION_FAMILIES = {"single_asset_direction", "pair_asset_direction"}
TARGET_FAMILIES = {"single_asset_price_target", "pair_asset_price_targets"}
DECIMAL_RE = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_decimal_string(value: Any) -> bool:
    return isinstance(value, str) and DECIMAL_RE.fullmatch(value) is not None


def is_numeric_literal(value: Any) -> bool:
    return is_number(value) or is_decimal_string(value)


def decimal_value(value: Any) -> Decimal | None:
    if not is_numeric_literal(value):
        return None
    try:
        parsed = Decimal(str(value))
    except InvalidOperation:
        return None
    return parsed if parsed.is_finite() else None


def is_uuid(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return str(UUID(value)) == value.lower()
    except ValueError:
        return False


def as_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_array(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def parse_time(value: Any, path: str, errors: list[dict[str, str]], required: bool = False) -> datetime | None:
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
        errors.append(issue("DATETIME_TIMEZONE", path, "Timestamp must include a timezone."))
        return None
    return parsed


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
    parsed = decimal_value(value)
    if parsed is None:
        return "?"
    rendered = format(parsed, "f")
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    return "0" if rendered in {"-0", ""} else rendered


def expr_node(op: str, *args: dict[str, Any], value: Any = None, ref: str | None = None) -> dict[str, Any]:
    return {"op": op, "args": list(args), "value": value, "ref": ref, "window": None}


def entry_expression(leg: dict[str, Any]) -> dict[str, Any] | None:
    entry = as_object(leg.get("entry"))
    if entry.get("mode") == "fixed_snapshot" and is_decimal_string(entry.get("price")):
        return expr_node("literal", value=entry.get("price"))
    if entry.get("mode") == "activation_capture" and isinstance(entry.get("capture_ref"), str):
        return expr_node("capture", ref=entry.get("capture_ref"))
    return None


def return_bps_expression(leg: dict[str, Any]) -> dict[str, Any] | None:
    exit_ref = leg.get("exit_variable_ref")
    entry = entry_expression(leg)
    if not isinstance(exit_ref, str) or entry is None:
        return None
    raw_return = expr_node(
        "sub",
        expr_node("div", expr_node("var", ref=exit_ref), entry),
        expr_node("literal", value="1"),
    )
    return expr_node("mul", raw_return, expr_node("literal", value="10000"))


def canonical_execution_expression(profile_value: Any) -> dict[str, Any] | None:
    profile = as_object(profile_value)
    family = profile.get("formula_family")
    legs = [as_object(item) for item in as_array(profile.get("legs"))]
    threshold = profile.get("direction_threshold_bps")

    if family == "pair_asset_direction" and profile.get("aggregation") == "long_short" and len(legs) == 2:
        long_short = as_object(profile.get("long_short"))
        by_id = {str(leg.get("leg_id")): leg for leg in legs}
        long_leg = as_object(by_id.get(str(long_short.get("long_leg_id"))))
        short_leg = as_object(by_id.get(str(long_short.get("short_leg_id"))))
        long_return = return_bps_expression(long_leg)
        short_return = return_bps_expression(short_leg)
        operator = long_short.get("operator")
        margin = long_short.get("margin_bps")
        if (
            long_return is None
            or short_return is None
            or long_leg.get("direction") != "long"
            or short_leg.get("direction") != "short"
            or operator not in {"gt", "gte"}
            or not isinstance(margin, int)
            or isinstance(margin, bool)
        ):
            return None
        return expr_node(
            str(operator),
            expr_node("sub", long_return, short_return),
            expr_node("literal", value=str(margin)),
        )

    if family in DIRECTION_FAMILIES:
        if not isinstance(threshold, int) or isinstance(threshold, bool):
            return None
        comparisons: list[dict[str, Any]] = []
        for leg in legs:
            leg_return = return_bps_expression(leg)
            direction = leg.get("direction")
            if leg_return is None or direction not in {"long", "short"}:
                return None
            operator = "gt" if direction == "long" else "lt"
            boundary = threshold if direction == "long" else -threshold
            comparisons.append(expr_node(operator, leg_return, expr_node("literal", value=str(boundary))))
        if len(comparisons) == 1:
            return comparisons[0]
        return expr_node("and", *comparisons) if len(comparisons) == 2 else None

    if family in TARGET_FAMILIES:
        comparisons = []
        for leg in legs:
            target = as_object(leg.get("target"))
            exit_ref = leg.get("exit_variable_ref")
            if target.get("operator") not in COMPARISON_OPS or not is_decimal_string(target.get("value")) or not isinstance(exit_ref, str):
                return None
            comparisons.append(
                expr_node(
                    str(target.get("operator")),
                    expr_node("var", ref=exit_ref),
                    expr_node("literal", value=target.get("value")),
                )
            )
        if len(comparisons) == 1:
            return comparisons[0]
        return expr_node("and", *comparisons) if len(comparisons) == 2 else None

    return None


def render_expr(node: Any, symbols: dict[str, str], capture_symbols: dict[str, str]) -> str:
    expr = as_object(node)
    op = expr.get("op")
    args = as_array(expr.get("args"))
    if op == "literal":
        value = expr.get("value")
        if isinstance(value, bool):
            return "true" if value else "false"
        return format_number(value)
    if op == "var":
        return symbols.get(str(expr.get("ref") or ""), str(expr.get("ref") or "?"))
    if op == "capture":
        return capture_symbols.get(str(expr.get("ref") or ""), str(expr.get("ref") or "?"))
    rendered = [render_expr(item, symbols, capture_symbols) for item in args]
    if op == "mean":
        window = as_object(expr.get("window"))
        lookback = window.get("lookback", "?")
        suffix = "including_current" if window.get("include_current") else "excluding_current"
        return f"mean_{lookback}({rendered[0] if rendered else '?'},{suffix})"
    if op == "between" and len(rendered) == 3:
        return f"({rendered[1]} <= {rendered[0]} AND {rendered[0]} <= {rendered[2]})"
    if op == "not" and rendered:
        return f"NOT {rendered[0]}"
    infix = {
        "add": "+", "sub": "-", "mul": "*", "div": "/",
        "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "eq": "=",
        "and": "AND", "or": "OR",
    }.get(str(op), str(op))
    return f"({' {} '.format(infix).join(rendered)})"


def render_public_math(payload: dict[str, Any]) -> dict[str, str]:
    variables = [item for item in as_array(payload.get("variables")) if isinstance(item, dict)]
    symbols = {str(item.get("id")): str(item.get("symbol") or item.get("id")) for item in variables}
    captures = [item for item in as_array(as_object(payload.get("activation")).get("captures")) if isinstance(item, dict)]
    capture_symbols = {str(item.get("id")): str(item.get("symbol") or item.get("id")) for item in captures}
    activation = as_object(payload.get("activation"))
    activation_formula = "immediate" if activation.get("mode") == "immediate" else render_expr(activation.get("expression"), symbols, capture_symbols)
    success_formula = render_expr(as_object(payload.get("outcome")).get("expression"), symbols, capture_symbols)
    return {
        "activation_formula": activation_formula,
        "success_formula": success_formula,
        "failure_formula": f"NOT {success_formula}",
    }


def collect_variable_refs(value: Any) -> set[str]:
    expr = as_object(value)
    refs = {str(expr.get("ref"))} if expr.get("op") == "var" and isinstance(expr.get("ref"), str) else set()
    for item in as_array(expr.get("args")):
        refs.update(collect_variable_refs(item))
    return refs


def validate_expr(
    value: Any,
    path: str,
    variable_types: dict[str, str],
    capture_types: dict[str, str],
    errors: list[dict[str, str]],
) -> str | None:
    if not isinstance(value, dict):
        errors.append(issue("EXPRESSION_TYPE", path, "Expression must be an object."))
        return None
    op = value.get("op")
    args = as_array(value.get("args"))
    if op not in ALL_OPS:
        errors.append(issue("EXPRESSION_OP", f"{path}.op", "Unsupported expression operator."))
        return None
    window = value.get("window")
    ref = value.get("ref")
    literal = value.get("value")

    if op == "literal":
        if args or ref is not None or window is not None or not (is_numeric_literal(literal) or isinstance(literal, bool)):
            errors.append(issue("LITERAL_SHAPE", path, "literal requires one decimal string, numeric, or boolean value and no args, ref, or window."))
            return None
        return "boolean" if isinstance(literal, bool) else "number"

    if op in {"var", "capture"}:
        expected = variable_types if op == "var" else capture_types
        if args or literal is not None or window is not None or not isinstance(ref, str) or ref not in expected:
            errors.append(issue("REFERENCE_SHAPE", path, f"{op} requires one declared ref and no args, value, or window."))
            return None
        return expected[ref]

    if ref is not None or literal is not None:
        errors.append(issue("OPERATOR_SHAPE", path, "Operators cannot carry ref or literal value."))
    child_types = [validate_expr(item, f"{path}.args[{index}]", variable_types, capture_types, errors) for index, item in enumerate(args)]

    if op == "mean":
        win = as_object(window)
        if len(args) != 1 or child_types != ["number"] or not isinstance(win.get("lookback"), int) or isinstance(win.get("lookback"), bool) or win.get("lookback", 0) < 1 or not isinstance(win.get("include_current"), bool):
            errors.append(issue("MEAN_SHAPE", path, "mean requires one numeric argument and a positive lookback window."))
        return "number"

    if window is not None:
        errors.append(issue("UNUSED_WINDOW", f"{path}.window", "Only mean may carry a window."))
    if op in {"add", "sub", "mul", "div"}:
        if len(args) != 2 or child_types != ["number", "number"]:
            errors.append(issue("ARITHMETIC_TYPES", path, f"{op} requires two numeric arguments."))
        return "number"
    if op in {"gt", "gte", "lt", "lte"}:
        if len(args) != 2 or child_types != ["number", "number"]:
            errors.append(issue("COMPARISON_TYPES", path, f"{op} requires two numeric arguments."))
        return "boolean"
    if op == "eq":
        if len(args) != 2 or None in child_types or len(set(child_types)) != 1:
            errors.append(issue("EQUALITY_TYPES", path, "eq requires two arguments of the same known type."))
        return "boolean"
    if op == "between":
        if len(args) != 3 or child_types != ["number", "number", "number"]:
            errors.append(issue("BETWEEN_TYPES", path, "between requires value, lower, and upper numeric arguments."))
        return "boolean"
    if op in {"and", "or"}:
        if len(args) < 2 or any(item != "boolean" for item in child_types):
            errors.append(issue("BOOLEAN_TYPES", path, f"{op} requires at least two boolean arguments."))
        return "boolean"
    if op == "not":
        if len(args) != 1 or child_types != ["boolean"]:
            errors.append(issue("NOT_TYPE", path, "not requires one boolean argument."))
        return "boolean"
    return None


def validate_execution_profile(
    payload: dict[str, Any],
    variable_types: dict[str, str],
    variable_specs: dict[str, dict[str, Any]],
    capture_types: dict[str, str],
    errors: list[dict[str, str]],
) -> dict[str, Any] | None:
    profile = as_object(payload.get("execution_profile"))
    if profile.get("engine") != "cuebook_settlement_v1":
        errors.append(issue("EXECUTION_ENGINE", "$.execution_profile.engine", "Expected cuebook_settlement_v1."))
    family = profile.get("formula_family")
    if family not in FORMULA_FAMILIES:
        errors.append(issue("FORMULA_FAMILY", "$.execution_profile.formula_family", "Unsupported frozen formula family."))

    raw_legs = profile.get("legs")
    if not isinstance(raw_legs, list):
        errors.append(issue("EXECUTION_LEGS", "$.execution_profile.legs", "Execution legs must be an array."))
    legs = [as_object(item) for item in as_array(raw_legs)]
    expected_shape = {
        "single_asset_direction": (1, {"single"}),
        "single_asset_price_target": (1, {"single"}),
        "pair_asset_direction": (2, {"all", "long_short"}),
        "pair_asset_price_targets": (2, {"all"}),
    }.get(str(family))
    if expected_shape:
        expected_count, expected_aggregations = expected_shape
        if len(legs) != expected_count:
            errors.append(issue("FAMILY_LEG_COUNT", "$.execution_profile.legs", f"{family} requires exactly {expected_count} leg(s)."))
        if profile.get("aggregation") not in expected_aggregations:
            allowed = " or ".join(sorted(expected_aggregations))
            errors.append(issue("FAMILY_AGGREGATION", "$.execution_profile.aggregation", f"{family} requires {allowed} aggregation."))

    leg_ids: list[str] = []
    asset_ids: list[int] = []
    instrument_ids: list[str] = []
    entry_times: dict[str, datetime] = {}
    expected_ids = ["A"] if len(legs) == 1 else ["A", "B"] if len(legs) == 2 else []
    for index, leg in enumerate(legs):
        path = f"$.execution_profile.legs[{index}]"
        leg_id = leg.get("leg_id")
        leg_ids.append(str(leg_id))
        expected_id = expected_ids[index] if index < len(expected_ids) else None
        if leg_id != expected_id:
            errors.append(issue("LEG_ORDER", f"{path}.leg_id", "Legs must be ordered A, then B."))
        expected_role = "primary" if leg_id == "A" else "comparator"
        if leg.get("role") != expected_role:
            errors.append(issue("LEG_ROLE", f"{path}.role", f"Leg {leg_id or '?'} must use role {expected_role}."))

        asset_id = leg.get("asset_id")
        if not isinstance(asset_id, int) or isinstance(asset_id, bool) or asset_id < 1:
            errors.append(issue("ASSET_ID", f"{path}.asset_id", "asset_id must be a positive Cuebook market_assets identity."))
        else:
            asset_ids.append(asset_id)
        provider_instrument_id = leg.get("provider_instrument_id")
        if not is_uuid(provider_instrument_id):
            errors.append(issue("PROVIDER_INSTRUMENT_ID", f"{path}.provider_instrument_id", "Expected a market_provider_instruments UUID."))
        else:
            instrument_ids.append(str(provider_instrument_id))
        ticker = leg.get("canonical_ticker")
        if not isinstance(ticker, str) or re.fullmatch(r"[a-z0-9][a-z0-9._:-]*", ticker) is None:
            errors.append(issue("CANONICAL_TICKER", f"{path}.canonical_ticker", "Expected the lowercase market_assets canonical_ticker snapshot."))
        for key in ("provider", "quote_currency"):
            if not isinstance(leg.get(key), str) or not str(leg.get(key)).strip():
                errors.append(issue("LEG_BINDING", f"{path}.{key}", f"Leg requires {key}."))

        exit_ref = leg.get("exit_variable_ref")
        if exit_ref not in variable_types or variable_types.get(str(exit_ref)) != "number":
            errors.append(issue("EXIT_VARIABLE", f"{path}.exit_variable_ref", "Each leg requires one declared numeric exit variable."))
        elif variable_specs.get(str(exit_ref), {}).get("instrument_ref") != provider_instrument_id:
            errors.append(issue("EXIT_INSTRUMENT", f"{path}.exit_variable_ref", "Exit variable instrument_ref must equal the leg provider_instrument_id."))

        entry = as_object(leg.get("entry"))
        entry_path = f"{path}.entry"
        if entry.get("mode") == "fixed_snapshot":
            parsed_price = decimal_value(entry.get("price"))
            if not is_decimal_string(entry.get("price")) or parsed_price is None or parsed_price <= 0:
                errors.append(issue("ENTRY_PRICE", f"{entry_path}.price", "Fixed entry price must be a positive decimal string with at most 18 decimal places."))
            observed = parse_time(entry.get("observed_at"), f"{entry_path}.observed_at", errors, required=True)
            if observed and isinstance(leg_id, str):
                entry_times[leg_id] = observed
            if entry.get("source") not in {"realtime", "candle_close"}:
                errors.append(issue("ENTRY_SOURCE", f"{entry_path}.source", "Fixed entry requires realtime or candle_close source."))
            if not is_uuid(entry.get("symbol_period_id")):
                errors.append(issue("ENTRY_SYMBOL_PERIOD", f"{entry_path}.symbol_period_id", "Fixed entry requires the observed market_symbol_periods UUID."))
            for key in ("provider_symbol", "observation_ref"):
                if not isinstance(entry.get(key), str) or not str(entry.get(key)).strip():
                    errors.append(issue("ENTRY_PROVENANCE", f"{entry_path}.{key}", f"Fixed entry requires {key}."))
            if entry.get("capture_ref") is not None:
                errors.append(issue("FIXED_ENTRY_CAPTURE", f"{entry_path}.capture_ref", "Fixed entry cannot reference an activation capture."))
        elif entry.get("mode") == "activation_capture":
            capture_ref = entry.get("capture_ref")
            if capture_ref not in capture_types or capture_types.get(str(capture_ref)) != "number":
                errors.append(issue("ENTRY_CAPTURE", f"{entry_path}.capture_ref", "Activation entry requires a declared numeric capture_ref."))
            for key in ("price", "observed_at", "source", "market_session", "symbol_period_id", "provider_symbol", "observation_ref"):
                if entry.get(key) is not None:
                    errors.append(issue("DYNAMIC_ENTRY_VALUE", f"{entry_path}.{key}", "Activation-captured entry cannot freeze a value before the trigger occurs."))
        else:
            errors.append(issue("ENTRY_MODE", f"{entry_path}.mode", "Unsupported entry mode."))

        direction = leg.get("direction")
        target = leg.get("target")
        if family in DIRECTION_FAMILIES:
            if direction not in {"long", "short"}:
                errors.append(issue("LEG_DIRECTION", f"{path}.direction", "Directional families require long or short on every leg."))
            if target is not None:
                errors.append(issue("UNEXPECTED_TARGET", f"{path}.target", "Directional families do not carry price targets."))
        elif family in TARGET_FAMILIES:
            if direction not in {"long", "short"}:
                errors.append(issue("LEG_DIRECTION", f"{path}.direction", "Price-target families require long or short on every leg."))
            target_obj = as_object(target)
            operator = target_obj.get("operator")
            if not target_obj or operator not in {"gt", "gte", "lt", "lte"}:
                errors.append(issue("PRICE_TARGET", f"{path}.target", "Price-target families require one explicit gt/gte/lt/lte target."))
            target_value = decimal_value(target_obj.get("value"))
            if not is_decimal_string(target_obj.get("value")) or target_value is None or target_value <= 0:
                errors.append(issue("TARGET_VALUE", f"{path}.target.value", "Target price must be a positive decimal string."))
            if target_obj.get("unit") != leg.get("quote_currency"):
                errors.append(issue("TARGET_UNIT", f"{path}.target.unit", "Target unit must match the leg quote_currency."))
            if direction == "long" and operator not in {"gt", "gte"}:
                errors.append(issue("TARGET_DIRECTION", f"{path}.target.operator", "A long target requires gt or gte."))
            if direction == "short" and operator not in {"lt", "lte"}:
                errors.append(issue("TARGET_DIRECTION", f"{path}.target.operator", "A short target requires lt or lte."))

    if len(leg_ids) != len(set(leg_ids)):
        errors.append(issue("LEG_DUPLICATE", "$.execution_profile.legs", "leg_id values must be unique."))
    if len(asset_ids) != len(set(asset_ids)) or len(instrument_ids) != len(set(instrument_ids)):
        errors.append(issue("LEG_IDENTITY_DUPLICATE", "$.execution_profile.legs", "Two-leg formulas require two distinct assets and provider instruments."))

    clock = as_object(profile.get("clock"))
    starts_at = parse_time(clock.get("starts_at"), "$.execution_profile.clock.starts_at", errors, required=True)
    settle_at = parse_time(clock.get("settle_at"), "$.execution_profile.clock.settle_at", errors)
    end_event_ref = clock.get("end_event_ref")
    if (settle_at is None) == (not isinstance(end_event_ref, str) or not end_event_ref.strip()):
        errors.append(issue("EXECUTION_HORIZON", "$.execution_profile.clock", "Exactly one of settle_at or end_event_ref is required."))
    if starts_at and settle_at and settle_at <= starts_at:
        errors.append(issue("EXECUTION_WINDOW", "$.execution_profile.clock.settle_at", "settle_at must follow starts_at."))
    for leg_id, observed in entry_times.items():
        if starts_at and observed > starts_at:
            errors.append(issue("ENTRY_AFTER_START", f"$.execution_profile.legs[{0 if leg_id == 'A' else 1}].entry.observed_at", "Fixed entry observation cannot occur after the formula starts."))
    if not isinstance(clock.get("interval"), str) or not str(clock.get("interval")).strip():
        errors.append(issue("EXECUTION_INTERVAL", "$.execution_profile.clock.interval", "Execution clock requires an interval."))
    if not isinstance(clock.get("timezone"), str) or not str(clock.get("timezone")).strip():
        errors.append(issue("EXECUTION_TIMEZONE", "$.execution_profile.clock.timezone", "Execution clock requires a timezone."))
    if clock.get("session") not in {"regular", "extended", "all_sessions", "continuous"}:
        errors.append(issue("EXECUTION_SESSION", "$.execution_profile.clock.session", "Unsupported execution session."))
    if clock.get("outcome_source") == "warm_candle":
        if clock.get("origin") not in {"provider_official", "ws_built", "internal"} or clock.get("adjustment") not in {"adjusted", "unadjusted"}:
            errors.append(issue("WARM_CANDLE_BASIS", "$.execution_profile.clock", "warm_candle requires explicit origin and adjustment."))
    elif clock.get("outcome_source") not in {"realtime", "candle_close"}:
        errors.append(issue("OUTCOME_SOURCE", "$.execution_profile.clock.outcome_source", "Unsupported outcome source."))
    delay = clock.get("max_observation_delay_seconds")
    if not isinstance(delay, int) or isinstance(delay, bool) or not 0 <= delay <= 1_209_600:
        errors.append(issue("OBSERVATION_DELAY", "$.execution_profile.clock.max_observation_delay_seconds", "Delay must be 0-1209600 seconds."))
    for index, leg in enumerate(legs):
        exit_ref = str(leg.get("exit_variable_ref") or "")
        variable = variable_specs.get(exit_ref, {})
        expected_signature = (clock.get("interval"), clock.get("timezone"), clock.get("session"))
        actual_signature = (variable.get("interval"), variable.get("timezone"), variable.get("session"))
        if variable and actual_signature != expected_signature:
            errors.append(issue("EXIT_CLOCK_ALIGNMENT", f"$.execution_profile.legs[{index}].exit_variable_ref", "Exit variable interval, timezone, and session must match execution_profile.clock."))

    outcome = as_object(payload.get("outcome"))
    selection = clock.get("selection")
    if selection == "first_eligible_at_or_after":
        observed_at = parse_time(outcome.get("observed_at"), "$.outcome.observed_at", errors)
        if outcome.get("observation_mode") != "at_datetime" or settle_at is None or observed_at != settle_at:
            errors.append(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Terminal selection requires at_datetime at exactly clock.settle_at."))
    elif selection == "any_sealed_in_window":
        outcome_start = parse_time(outcome.get("window_start"), "$.outcome.window_start", errors)
        outcome_end = parse_time(outcome.get("window_end"), "$.outcome.window_end", errors)
        if outcome.get("observation_mode") != "any_in_window" or starts_at is None or settle_at is None or outcome_start != starts_at or outcome_end != settle_at:
            errors.append(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Window selection must use the execution start and settle timestamps."))
    elif selection == "first_sealed_after_event":
        if outcome.get("observation_mode") != "first_sealed_bar_after_event" or outcome.get("event_ref") != end_event_ref:
            errors.append(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Event selection requires the same end_event_ref on the outcome."))
    else:
        errors.append(issue("EXECUTION_SELECTION", "$.execution_profile.clock.selection", "Unsupported settlement observation selection."))

    threshold = profile.get("direction_threshold_bps")
    long_short = profile.get("long_short")
    aggregation = profile.get("aggregation")
    if family == "pair_asset_direction" and aggregation == "long_short":
        if threshold is not None:
            errors.append(issue("LONG_SHORT_THRESHOLD", "$.execution_profile.direction_threshold_bps", "long_short aggregation uses margin_bps, not a direction threshold."))
        long_short_obj = as_object(long_short)
        if not long_short_obj:
            errors.append(issue("LONG_SHORT_POLICY", "$.execution_profile.long_short", "long_short aggregation requires an explicit long_short policy."))
        else:
            long_leg_id = long_short_obj.get("long_leg_id")
            short_leg_id = long_short_obj.get("short_leg_id")
            if long_leg_id == short_leg_id or {long_leg_id, short_leg_id} != {"A", "B"}:
                errors.append(issue("LONG_SHORT_LEGS", "$.execution_profile.long_short", "long_short policy must assign distinct A and B legs."))
            by_id = {str(leg.get("leg_id")): leg for leg in legs}
            if as_object(by_id.get(str(long_leg_id))).get("direction") != "long":
                errors.append(issue("LONG_SHORT_SIDE", "$.execution_profile.long_short.long_leg_id", "long_leg_id must reference the leg whose direction is long."))
            if as_object(by_id.get(str(short_leg_id))).get("direction") != "short":
                errors.append(issue("LONG_SHORT_SIDE", "$.execution_profile.long_short.short_leg_id", "short_leg_id must reference the leg whose direction is short."))
            if long_short_obj.get("operator") not in {"gt", "gte"}:
                errors.append(issue("LONG_SHORT_OPERATOR", "$.execution_profile.long_short.operator", "long_short spread supports gt or gte; reverse the legs for the opposite view."))
            margin = long_short_obj.get("margin_bps")
            if not isinstance(margin, int) or isinstance(margin, bool) or not 0 <= margin <= 100000:
                errors.append(issue("LONG_SHORT_MARGIN", "$.execution_profile.long_short.margin_bps", "margin_bps must be a non-negative integer; use 0 when no excess-return margin was stated."))
            if long_short_obj.get("weighting") != "equal_notional":
                errors.append(issue("LONG_SHORT_WEIGHTING", "$.execution_profile.long_short.weighting", "Launch long_short aggregation requires equal_notional weighting."))
            if long_short_obj.get("return_basis") != "simple_price_return":
                errors.append(issue("RETURN_BASIS", "$.execution_profile.long_short.return_basis", "Launch engine supports simple_price_return."))
            if long_short_obj.get("endpoint_alignment") not in {"same_session_close", "same_utc_timestamp"}:
                errors.append(issue("ENDPOINT_ALIGNMENT", "$.execution_profile.long_short.endpoint_alignment", "Unsupported endpoint alignment."))
            max_skew = long_short_obj.get("max_entry_skew_seconds")
            if not isinstance(max_skew, int) or isinstance(max_skew, bool) or not 0 <= max_skew <= 86400:
                errors.append(issue("ENTRY_SKEW", "$.execution_profile.long_short.max_entry_skew_seconds", "Entry skew must be 0-86400 seconds."))
            elif len(entry_times) == 2 and abs((entry_times["A"] - entry_times["B"]).total_seconds()) > max_skew:
                errors.append(issue("ENTRY_SKEW", "$.execution_profile.legs", "Long/short entry observations exceed max_entry_skew_seconds."))
            if long_short_obj.get("fx_policy") == "same_quote_currency" and len({str(leg.get("quote_currency")) for leg in legs}) > 1:
                errors.append(issue("QUOTE_CURRENCY", "$.execution_profile.legs", "same_quote_currency requires matching quote currencies."))
    elif family in DIRECTION_FAMILIES:
        if not isinstance(threshold, int) or isinstance(threshold, bool) or not 0 <= threshold <= 100000:
            errors.append(issue("DIRECTION_THRESHOLD", "$.execution_profile.direction_threshold_bps", "Directional families require an explicit non-negative integer threshold in basis points."))
        if long_short is not None:
            errors.append(issue("UNEXPECTED_LONG_SHORT", "$.execution_profile.long_short", "single or all aggregation cannot carry long_short policy."))
    elif family in TARGET_FAMILIES:
        if threshold is not None or long_short is not None:
            errors.append(issue("TARGET_POLICY", "$.execution_profile", "Price-target families use neither direction_threshold_bps nor long_short policy."))

    subject = as_object(payload.get("subject"))
    primary = legs[0] if legs else {}
    if primary:
        if subject.get("instrument_id") != primary.get("provider_instrument_id"):
            errors.append(issue("SUBJECT_BINDING", "$.subject.instrument_id", "Subject instrument_id must equal leg A provider_instrument_id."))
        if str(subject.get("ticker") or "").lower() != str(primary.get("canonical_ticker") or "").lower():
            errors.append(issue("SUBJECT_BINDING", "$.subject.ticker", "Subject ticker must identify leg A."))
        if family == "pair_asset_direction" and aggregation == "long_short":
            long_short_obj = as_object(long_short)
            expected_direction = "outperform" if long_short_obj.get("long_leg_id") == "A" else "underperform"
        else:
            expected_direction = primary.get("direction")
        if family in FORMULA_FAMILIES and subject.get("direction") != expected_direction:
            errors.append(issue("SUBJECT_DIRECTION", "$.subject.direction", f"Subject direction must be {expected_direction} for this execution profile."))

    expected_expression = canonical_execution_expression(profile)
    if expected_expression is None:
        errors.append(issue("EXECUTION_EXPRESSION", "$.execution_profile", "Execution profile cannot compile to a canonical expression."))
    elif outcome.get("expression") != expected_expression:
        errors.append(issue("EXECUTION_EXPRESSION_MISMATCH", "$.outcome.expression", "Outcome expression must be the canonical projection of execution_profile."))
    return expected_expression


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if payload.get("schema_version") != "settlement-formula-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected settlement-formula-v1."))
    if not isinstance(payload.get("formula_id"), str) or not re.fullmatch(r"FORMULA_[A-Za-z0-9_-]{8,}", str(payload.get("formula_id") or "")):
        errors.append(issue("FORMULA_ID", "$.formula_id", "Invalid formula_id."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "revision must be a positive integer."))
    state = payload.get("state")
    if state not in STATES:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage = as_object(payload.get("lineage"))
    if not isinstance(lineage.get("claim_ref"), str) or not str(lineage.get("claim_ref")).strip():
        errors.append(issue("CLAIM_REF", "$.lineage.claim_ref", "A source claim reference is required."))
    if not isinstance(lineage.get("claim_hash"), str) or not re.fullmatch(r"[a-f0-9]{64}", str(lineage.get("claim_hash") or "")):
        errors.append(issue("CLAIM_HASH", "$.lineage.claim_hash", "claim_hash must be a SHA-256 hex digest."))

    subject = as_object(payload.get("subject"))
    for key in ("instrument_id", "ticker"):
        if not isinstance(subject.get(key), str) or not str(subject.get(key)).strip():
            errors.append(issue("SUBJECT", f"$.subject.{key}", f"Subject requires {key}."))
    if subject.get("direction") not in DIRECTIONS:
        errors.append(issue("DIRECTION", "$.subject.direction", "Unsupported direction."))

    variable_types: dict[str, str] = {}
    variable_specs: dict[str, dict[str, Any]] = {}
    symbols: set[str] = set()
    for index, item in enumerate(as_array(payload.get("variables"))):
        path = f"$.variables[{index}]"
        variable = as_object(item)
        var_id = variable.get("id")
        if not isinstance(var_id, str) or not re.fullmatch(r"VAR_[A-Z0-9_]+", var_id):
            errors.append(issue("VARIABLE_ID", f"{path}.id", "Invalid variable id."))
            continue
        if var_id in variable_types:
            errors.append(issue("VARIABLE_DUPLICATE", f"{path}.id", "Variable ids must be unique."))
        value_type = variable.get("value_type")
        if value_type not in VALUE_TYPES:
            errors.append(issue("VARIABLE_TYPE", f"{path}.value_type", "Unsupported variable type."))
            value_type = "unknown"
        variable_types[var_id] = str(value_type)
        variable_specs[var_id] = variable
        symbol = variable.get("symbol")
        if not isinstance(symbol, str) or not symbol.strip() or symbol in symbols:
            errors.append(issue("VARIABLE_SYMBOL", f"{path}.symbol", "Variable symbols must be non-empty and unique."))
        else:
            symbols.add(symbol)
        if variable.get("kind") not in VARIABLE_KINDS:
            errors.append(issue("VARIABLE_KIND", f"{path}.kind", "Unsupported variable kind."))
        if not isinstance(variable.get("source_ref"), str) or not str(variable.get("source_ref")).strip():
            errors.append(issue("VARIABLE_SOURCE", f"{path}.source_ref", "Variable source is required."))
        if not isinstance(variable.get("metric"), str) or not str(variable.get("metric")).strip():
            errors.append(issue("VARIABLE_METRIC", f"{path}.metric", "Variable metric is required."))
        if state in {"ready", "frozen"} and variable.get("kind") in {"market_observation", "derived_metric"} and variable.get("sealed_only") is not True:
            errors.append(issue("UNSEALED_VARIABLE", f"{path}.sealed_only", "Ready settlement math requires sealed market observations."))
    if not variable_types:
        errors.append(issue("VARIABLES_REQUIRED", "$.variables", "At least one variable is required."))

    activation = as_object(payload.get("activation"))
    captures = as_array(activation.get("captures"))
    capture_types: dict[str, str] = {}
    capture_symbols: set[str] = set()
    for index, item in enumerate(captures):
        path = f"$.activation.captures[{index}]"
        capture = as_object(item)
        cap_id = capture.get("id")
        variable_ref = capture.get("variable_ref")
        if not isinstance(cap_id, str) or not re.fullmatch(r"CAP_[A-Z0-9_]+", cap_id):
            errors.append(issue("CAPTURE_ID", f"{path}.id", "Invalid capture id."))
            continue
        if cap_id in capture_types:
            errors.append(issue("CAPTURE_DUPLICATE", f"{path}.id", "Capture ids must be unique."))
        if variable_ref not in variable_types:
            errors.append(issue("CAPTURE_VARIABLE", f"{path}.variable_ref", "Capture must reference a declared variable."))
            capture_types[cap_id] = "unknown"
        else:
            capture_types[cap_id] = variable_types[str(variable_ref)]
        symbol = capture.get("symbol")
        if not isinstance(symbol, str) or not symbol.strip() or symbol in capture_symbols or symbol in symbols:
            errors.append(issue("CAPTURE_SYMBOL", f"{path}.symbol", "Capture symbols must be non-empty and unique."))
        else:
            capture_symbols.add(symbol)
        if capture.get("mode") != "value_at_activation":
            errors.append(issue("CAPTURE_MODE", f"{path}.mode", "Unsupported capture mode."))

    validate_execution_profile(payload, variable_types, variable_specs, capture_types, errors)

    mode = activation.get("mode")
    if mode not in {"immediate", "first_true"}:
        errors.append(issue("ACTIVATION_MODE", "$.activation.mode", "Unsupported activation mode."))
    activation_type = None
    if mode == "immediate":
        if activation.get("expression") is not None or captures:
            errors.append(issue("IMMEDIATE_ACTIVATION", "$.activation", "Immediate activation cannot carry a trigger expression or captures."))
    elif mode == "first_true":
        activation_type = validate_expr(activation.get("expression"), "$.activation.expression", variable_types, capture_types, errors)
        if activation_type != "boolean":
            errors.append(issue("ACTIVATION_BOOLEAN", "$.activation.expression", "Activation expression must be boolean."))
        if activation.get("window_end") is None and activation.get("end_event_ref") is None:
            errors.append(issue("ACTIVATION_HORIZON", "$.activation", "Conditional activation requires a fixed end or event horizon."))
        activation_refs = collect_variable_refs(activation.get("expression"))
        market_signatures = {
            (
                variable_specs[ref].get("interval"),
                variable_specs[ref].get("timezone"),
                variable_specs[ref].get("session"),
            )
            for ref in activation_refs
            if ref in variable_specs and variable_specs[ref].get("kind") in {"market_observation", "derived_metric"}
        }
        if len(market_signatures) > 1:
            errors.append(issue("ACTIVATION_ALIGNMENT", "$.activation.expression", "Market variables in one activation expression must share interval, timezone, and session."))
    activation_start = parse_time(activation.get("window_start"), "$.activation.window_start", errors)
    activation_end = parse_time(activation.get("window_end"), "$.activation.window_end", errors)
    if activation_start and activation_end and activation_end <= activation_start:
        errors.append(issue("ACTIVATION_WINDOW", "$.activation", "Activation window end must follow its start."))

    outcome = as_object(payload.get("outcome"))
    outcome_mode = outcome.get("observation_mode")
    outcome_type = validate_expr(outcome.get("expression"), "$.outcome.expression", variable_types, capture_types, errors)
    if outcome_type != "boolean":
        errors.append(issue("OUTCOME_BOOLEAN", "$.outcome.expression", "Outcome expression must be boolean."))
    observed_at = parse_time(outcome.get("observed_at"), "$.outcome.observed_at", errors)
    outcome_start = parse_time(outcome.get("window_start"), "$.outcome.window_start", errors)
    outcome_end = parse_time(outcome.get("window_end"), "$.outcome.window_end", errors)
    if outcome_mode == "at_datetime":
        if observed_at is None:
            errors.append(issue("OUTCOME_TIME", "$.outcome.observed_at", "at_datetime requires observed_at."))
    elif outcome_mode in {"any_in_window", "every_observation"}:
        if not outcome_start or not outcome_end or outcome_end <= outcome_start:
            errors.append(issue("OUTCOME_WINDOW", "$.outcome", "Window outcome requires an ordered start and end."))
    elif outcome_mode == "first_sealed_bar_after_event":
        if not isinstance(outcome.get("event_ref"), str) or not str(outcome.get("event_ref")).strip():
            errors.append(issue("OUTCOME_EVENT", "$.outcome.event_ref", "Event outcome requires event_ref."))
    else:
        errors.append(issue("OUTCOME_MODE", "$.outcome.observation_mode", "Unsupported outcome observation mode."))

    invalidation = payload.get("invalidation")
    if invalidation is not None:
        invalidation_obj = as_object(invalidation)
        invalidation_type = validate_expr(invalidation_obj.get("expression"), "$.invalidation.expression", variable_types, capture_types, errors)
        if invalidation_type != "boolean":
            errors.append(issue("INVALIDATION_BOOLEAN", "$.invalidation.expression", "Invalidation expression must be boolean."))
        if invalidation_obj.get("mode") not in {"first_true", "at_datetime"} or invalidation_obj.get("result") not in {"failed", "no_score"}:
            errors.append(issue("INVALIDATION_POLICY", "$.invalidation", "Unsupported invalidation mode or result."))

    lifecycle = as_object(payload.get("lifecycle"))
    if mode == "immediate" and lifecycle.get("initial_state") != "active":
        errors.append(issue("IMMEDIATE_STATE", "$.lifecycle.initial_state", "Immediate formulas start active."))
    if mode == "first_true":
        if lifecycle.get("initial_state") != "pending_activation":
            errors.append(issue("CONDITIONAL_STATE", "$.lifecycle.initial_state", "Conditional formulas start pending_activation."))
        if lifecycle.get("untriggered_result") != "no_score":
            errors.append(issue("UNTRIGGERED_SCORE", "$.lifecycle.untriggered_result", "An untriggered conditional view defaults to no_score."))
    terminals = set(string_set(lifecycle.get("terminal_states"), "$.lifecycle.terminal_states", errors))
    if not {"succeeded", "failed"}.issubset(terminals):
        errors.append(issue("TERMINAL_STATES", "$.lifecycle.terminal_states", "Terminal states must include succeeded and failed."))
    if mode == "first_true" and "expired_untriggered" not in terminals:
        errors.append(issue("UNTRIGGERED_STATE", "$.lifecycle.terminal_states", "Conditional formulas require expired_untriggered."))
    if lifecycle.get("tie_result") not in {"failed", "succeeded", "manual_review"}:
        errors.append(issue("TIE_RESULT", "$.lifecycle.tie_result", "Unsupported tie result."))

    resolution = as_object(payload.get("resolution"))
    primary_sources = string_set(resolution.get("primary_source_refs"), "$.resolution.primary_source_refs", errors)
    if not primary_sources:
        errors.append(issue("PRIMARY_SOURCES", "$.resolution.primary_source_refs", "At least one primary source is required."))
    fallbacks = string_set(resolution.get("fallback_source_refs"), "$.resolution.fallback_source_refs", errors)
    if resolution.get("missing_data_policy") == "fallback_source" and not fallbacks:
        errors.append(issue("FALLBACK_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."))
    if resolution.get("zero_division_policy") not in {"manual_review", "annul", "not_applicable"}:
        errors.append(issue("ZERO_DIVISION", "$.resolution.zero_division_policy", "Unsupported zero-division policy."))
    precision = resolution.get("precision")
    if not isinstance(precision, int) or isinstance(precision, bool) or not 0 <= precision <= 18:
        errors.append(issue("PRECISION", "$.resolution.precision", "precision must be an integer from 0 to 18."))

    expected_math = render_public_math(payload)
    public_math = as_object(payload.get("public_math"))
    for key, expected in expected_math.items():
        if public_math.get(key) != expected:
            errors.append(issue("PUBLIC_MATH_MISMATCH", f"$.public_math.{key}", f"Expected deterministic formula: {expected}"))
    if not isinstance(public_math.get("one_line"), str) or not str(public_math.get("one_line")).strip() or len(str(public_math.get("one_line"))) > 320:
        errors.append(issue("PUBLIC_ONE_LINE", "$.public_math.one_line", "one_line must contain 1-320 characters."))

    quality = as_object(payload.get("quality_report"))
    missing = string_set(quality.get("missing_fields"), "$.quality_report.missing_fields", errors)
    string_set(quality.get("warnings"), "$.quality_report.warnings", errors)
    if state in {"ready", "frozen"}:
        if quality.get("decision") != "ready" or missing:
            errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen formulas require a ready decision and no missing fields."))
    elif quality.get("decision") not in {"needs_confirmation", "blocked"}:
        errors.append(issue("DRAFT_QUALITY", "$.quality_report.decision", "Draft formula must be needs_confirmation or blocked."))

    expected_hash = canonical_hash(payload)
    stored_hash = lineage.get("canonical_hash")
    if state == "frozen":
        if stored_hash != expected_hash:
            errors.append(issue("CANONICAL_HASH", "$.lineage.canonical_hash", "Frozen formula hash is missing or does not match."))
    elif stored_hash is not None:
        errors.append(issue("UNFROZEN_HASH", "$.lineage.canonical_hash", "Only frozen formulas may store a canonical hash."))
    if state == "draft":
        warnings.append(issue("NOT_READY", "$.state", "Draft formula is not eligible for registration."))

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "public_math": expected_math,
        "canonical_hash": expected_hash,
    }


def load_payload(path: str) -> dict[str, Any]:
    value = json.load(sys.stdin) if path == "-" else json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Top-level JSON value must be an object.")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("formula")
    parser.add_argument("--print-math", action="store_true")
    parser.add_argument("--print-canonical-hash", action="store_true")
    args = parser.parse_args()
    try:
        payload = load_payload(args.formula)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("LOAD", "$", str(exc))]}, ensure_ascii=False, indent=2))
        return 2
    result = validate(payload)
    if args.print_math:
        print(json.dumps(result["public_math"], ensure_ascii=False, indent=2))
    elif args.print_canonical_hash:
        print(result["canonical_hash"])
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
