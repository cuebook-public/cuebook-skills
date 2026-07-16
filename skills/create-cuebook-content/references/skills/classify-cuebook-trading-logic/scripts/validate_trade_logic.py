#!/usr/bin/env python3
"""Validate TradeLogicProfileV1 artifacts."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_FIELDS = {
    "schema_version",
    "profile_id",
    "revision",
    "state",
    "lineage",
    "classification",
    "stance",
    "public_expression",
    "evidence_boundary",
    "quality_report",
}
FAMILIES = {"event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility", "liquidity_microstructure", "carry_income"}
CATALYSTS = {"corporate_action", "earnings", "product", "policy", "macro_data", "geopolitical", "supply_demand", "technical_break", "flow_positioning", "valuation_dislocation", "none"}
MECHANISMS = {"risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag", "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation", "volatility_repricing", "carry_roll_down", "cross_asset_transmission"}
EXPRESSIONS = {"outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket", "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade"}
HORIZONS = {"intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural"}
EDGES = {"information", "causal", "structural", "behavioral", "mechanical", "valuation", "timing"}
DIRECTIONS = {"long", "short", "outperform", "underperform", "long_vol", "short_vol", "steepener", "flattener", "neutral"}
BACKEND_TERMS = {
    "已确认",
    "已计算",
    "推演",
    "待确认",
    "形成中",
    "交给市场验证",
    "等待确认",
    "observed",
    "derived",
    "provisional",
    "conditional",
    "confirmed",
    "pending",
}
FACTOR_MECHANISMS = {"valuation_mean_reversion", "fundamental_compounding", "momentum_continuation"}
MICROSTRUCTURE_MECHANISMS = {"forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag"}


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


def string_list(value: Any, path: str, errors: list[dict[str, str]], require: bool = False) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."))
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
        else:
            result.append(item.strip())
    if len(result) != len(set(result)):
        errors.append(issue("STRING_UNIQUE", path, "Strings must be unique."))
    if require and not result:
        errors.append(issue("STRING_REQUIRED", path, "At least one item is required."))
    return result


def contains_backend_term(value: str) -> bool:
    lowered = value.lower()
    return any(term.lower() in lowered for term in BACKEND_TERMS)


def validate_quality(value: Any, state: Any, errors: list[dict[str, str]]) -> None:
    if not isinstance(value, dict):
        errors.append(issue("QUALITY", "$.quality_report", "Quality report must be an object."))
        return
    decision = value.get("decision")
    warnings = string_list(value.get("warnings"), "$.quality_report.warnings", errors)
    failures = string_list(value.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    if state == "conditional" and (decision != "conditional" or not warnings):
        errors.append(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires conditional quality and a warning."))
    if state in {"ready", "frozen"} and (decision != "ready" or warnings or failures):
        errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."))
    if failures and decision != "blocked":
        errors.append(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."))


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "trade-logic-profile-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected trade-logic-profile-v1."))
    if not re.fullmatch(r"TLOGIC_[A-Za-z0-9_:-]{8,}", str(payload.get("profile_id") or "")):
        errors.append(issue("PROFILE_ID", "$.profile_id", "Invalid profile ID."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    input_refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, True)
    source_refs = string_list(lineage.get("source_refs"), "$.lineage.source_refs", errors, True)
    parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    classification = payload.get("classification") if isinstance(payload.get("classification"), dict) else {}
    family = classification.get("family")
    catalyst = classification.get("catalyst")
    mechanism = classification.get("mechanism")
    expression = classification.get("expression")
    horizon = classification.get("horizon")
    edge = classification.get("edge")
    for value, allowed, path in (
        (family, FAMILIES, "$.classification.family"),
        (catalyst, CATALYSTS, "$.classification.catalyst"),
        (mechanism, MECHANISMS, "$.classification.mechanism"),
        (expression, EXPRESSIONS, "$.classification.expression"),
        (horizon, HORIZONS, "$.classification.horizon"),
        (edge, EDGES, "$.classification.edge"),
    ):
        if value not in allowed:
            errors.append(issue("CLASSIFICATION", path, "Unsupported classification value."))
    rationale_refs = string_list(classification.get("rationale_refs"), "$.classification.rationale_refs", errors, True)
    if any(ref not in input_refs and ref not in source_refs for ref in rationale_refs):
        errors.append(issue("RATIONALE_LINEAGE", "$.classification.rationale_refs", "Rationale refs must resolve to input or source lineage."))
    if family == "event_driven" and catalyst == "none":
        errors.append(issue("EVENT_CATALYST", "$.classification.catalyst", "Event-driven logic requires a catalyst."))
    if family == "factor_style" and mechanism not in FACTOR_MECHANISMS:
        errors.append(issue("FACTOR_MECHANISM", "$.classification.mechanism", "Factor-style logic requires a factor-compatible mechanism."))
    if family == "liquidity_microstructure" and mechanism not in MICROSTRUCTURE_MECHANISMS:
        errors.append(issue("MICROSTRUCTURE_MECHANISM", "$.classification.mechanism", "Liquidity/microstructure logic requires an order-flow, positioning, liquidity, or price-discovery mechanism."))

    stance = payload.get("stance") if isinstance(payload.get("stance"), dict) else {}
    asset = stance.get("primary_asset")
    direction = stance.get("direction")
    comparator = stance.get("comparator")
    if not nonempty(asset):
        errors.append(issue("PRIMARY_ASSET", "$.stance.primary_asset", "Primary asset is required."))
    if direction not in DIRECTIONS:
        errors.append(issue("DIRECTION", "$.stance.direction", "Unsupported stance direction."))
    if comparator is not None and not nonempty(comparator):
        errors.append(issue("COMPARATOR", "$.stance.comparator", "Comparator must be null or non-empty."))
    if not nonempty(stance.get("horizon_label")) or len(str(stance.get("horizon_label") or "")) > 24:
        errors.append(issue("HORIZON_LABEL", "$.stance.horizon_label", "Horizon label must contain one to 24 characters."))
    if expression == "relative_value_pair":
        if not nonempty(comparator):
            errors.append(issue("RELATIVE_COMPARATOR", "$.stance.comparator", "Relative-value pairs require a comparator."))
        if direction not in {"outperform", "underperform"}:
            errors.append(issue("RELATIVE_DIRECTION", "$.stance.direction", "Relative-value pairs require outperform or underperform direction."))

    public = payload.get("public_expression") if isinstance(payload.get("public_expression"), dict) else {}
    action = public.get("action_line")
    because = public.get("because_line")
    if not nonempty(action) or len(str(action or "")) > 100:
        errors.append(issue("ACTION_LINE", "$.public_expression.action_line", "Action line must contain one to 100 characters."))
    elif nonempty(asset) and asset.lower() not in action.lower():
        errors.append(issue("ACTION_ASSET", "$.public_expression.action_line", "Action line must name the primary asset."))
    if not nonempty(because) or len(str(because or "")) > 160:
        errors.append(issue("BECAUSE_LINE", "$.public_expression.because_line", "Because line must contain one to 160 characters."))
    tags = string_list(public.get("tags"), "$.public_expression.tags", errors, True)
    if not 2 <= len(tags) <= 4:
        errors.append(issue("TAG_COUNT", "$.public_expression.tags", "Use two to four public tags."))
    for index, value in enumerate(tags):
        if len(value) > 24:
            errors.append(issue("TAG_LENGTH", f"$.public_expression.tags[{index}]", "Public tags must not exceed 24 characters."))
        if contains_backend_term(value):
            errors.append(issue("PUBLIC_BACKEND_TERM", f"$.public_expression.tags[{index}]", "Backend evidence-state terms cannot appear in public tags."))
    for key, value in (("action_line", action), ("because_line", because)):
        if nonempty(value) and contains_backend_term(value):
            errors.append(issue("PUBLIC_BACKEND_TERM", f"$.public_expression.{key}", "Backend evidence-state or workflow terms cannot appear in public expression."))

    boundary = payload.get("evidence_boundary") if isinstance(payload.get("evidence_boundary"), dict) else {}
    for key in ("observed_claim_refs", "inferred_claim_refs", "missing_requirement_refs"):
        string_list(boundary.get(key), f"$.evidence_boundary.{key}", errors)
    if boundary.get("public_status_suppressed") is not True:
        errors.append(issue("PUBLIC_STATUS", "$.evidence_boundary.public_status_suppressed", "Public evidence status must be suppressed."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("LOAD", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
