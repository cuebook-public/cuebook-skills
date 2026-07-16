#!/usr/bin/env python3
"""Validate MarketSignalSpecV1 and MarketSignalV1 artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


SPEC_FIELDS = {
    "schema_version",
    "signal_id",
    "revision",
    "state",
    "mode",
    "lineage",
    "frame",
    "trade_logic",
    "key_number",
    "key_news",
    "render",
    "quality_report",
}
MANIFEST_FIELDS = {
    "schema_version",
    "market_signal_id",
    "spec_ref",
    "mode",
    "state",
    "generated_at",
    "dimensions",
    "theme",
    "lineage",
    "content",
    "asset",
    "quality_report",
}
TRADE_LOGIC_FAMILIES = {"event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility", "liquidity_microstructure", "carry_income"}
TRADE_LOGIC_MECHANISMS = {"risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag", "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation", "volatility_repricing", "carry_roll_down", "cross_asset_transmission"}
TRADE_LOGIC_EXPRESSIONS = {"outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket", "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade"}
TRADE_LOGIC_HORIZONS = {"intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural"}
PUBLIC_BACKEND_TERMS = {"已确认", "已计算", "推演", "待确认", "形成中", "等待确认", "交给市场验证", "observed", "derived", "provisional", "conditional", "confirmed", "pending"}


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


def string_set(value: Any, path: str, errors: list[dict[str, str]], require: bool = True) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_SET", path, "Expected an array of unique non-empty strings."))
        return []
    valid: list[str] = []
    for index, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_SET_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
        else:
            valid.append(item)
    if len(valid) != len(set(valid)):
        errors.append(issue("STRING_SET_UNIQUE", path, "Strings must be unique."))
    if require and not valid:
        errors.append(issue("STRING_SET_EMPTY", path, "At least one reference is required."))
    return valid


def validate_quality(value: Any, state: Any, errors: list[dict[str, str]]) -> None:
    if not isinstance(value, dict):
        errors.append(issue("QUALITY", "$.quality_report", "Quality report must be an object."))
        return
    decision = value.get("decision")
    warnings = string_set(value.get("warnings"), "$.quality_report.warnings", errors, require=False)
    failures = string_set(value.get("hard_failures"), "$.quality_report.hard_failures", errors, require=False)
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    if state == "conditional" and (decision != "conditional" or not warnings):
        errors.append(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires a warning and conditional quality."))
    if state in {"ready", "frozen"} and (decision != "ready" or warnings or failures):
        errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."))
    if failures and decision != "blocked":
        errors.append(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."))


def validate_spec(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    for key in sorted(SPEC_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - SPEC_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "market-signal-spec-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-signal-spec-v1."))
    if not re.fullmatch(r"SIGSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("signal_id") or "")):
        errors.append(issue("SIGNAL_ID", "$.signal_id", "Invalid signal spec ID."))
    if not isinstance(payload.get("revision"), int) or isinstance(payload.get("revision"), bool) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in {"conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    mode = payload.get("mode")
    if mode not in {"key_number", "key_news"}:
        errors.append(issue("MODE", "$.mode", "Mode must be key_number or key_news."))

    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    if not lineage:
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
    string_set(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    lineage_sources = string_set(lineage.get("source_refs"), "$.lineage.source_refs", errors)
    cutoff = parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    frame = payload.get("frame") if isinstance(payload.get("frame"), dict) else {}
    if not frame:
        errors.append(issue("FRAME", "$.frame", "Frame must be an object."))
    for key in ("category", "asset_label", "headline", "interpretation"):
        if not nonempty(frame.get(key)):
            errors.append(issue("FRAME_FIELD", f"$.frame.{key}", f"{key} is required."))
    if len(str(frame.get("headline") or "")) > 120:
        errors.append(issue("HEADLINE_LENGTH", "$.frame.headline", "Headline must not exceed 120 characters."))
    if len(str(frame.get("interpretation") or "")) > 180:
        errors.append(issue("INTERPRETATION_LENGTH", "$.frame.interpretation", "Interpretation must not exceed 180 characters."))
    for key in ("headline", "interpretation"):
        value = str(frame.get(key) or "")
        if any(term.lower() in value.lower() for term in PUBLIC_BACKEND_TERMS):
            errors.append(issue("PUBLIC_BACKEND_TERM", f"$.frame.{key}", "Backend evidence-state or workflow terms cannot appear in public copy."))

    trade_logic = payload.get("trade_logic") if isinstance(payload.get("trade_logic"), dict) else {}
    if not trade_logic:
        errors.append(issue("TRADE_LOGIC", "$.trade_logic", "TradeLogicProfileV1 summary is required."))
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
    public_tags = string_set(trade_logic.get("public_tags"), "$.trade_logic.public_tags", errors)
    if not 2 <= len(public_tags) <= 4:
        errors.append(issue("TRADE_LOGIC_TAGS", "$.trade_logic.public_tags", "Use two to four public strategy tags."))
    for index, tag in enumerate(public_tags):
        if len(tag) > 24:
            errors.append(issue("TRADE_LOGIC_TAG_LENGTH", f"$.trade_logic.public_tags[{index}]", "Public tags must not exceed 24 characters."))
        if any(term.lower() in tag.lower() for term in PUBLIC_BACKEND_TERMS):
            errors.append(issue("PUBLIC_BACKEND_TERM", f"$.trade_logic.public_tags[{index}]", "Backend evidence-state terms cannot appear in public tags."))

    number = payload.get("key_number")
    news = payload.get("key_news")
    if mode == "key_number" and (not isinstance(number, dict) or news is not None):
        errors.append(issue("MODE_PAYLOAD", "$", "key_number mode requires one key_number and null key_news."))
    if mode == "key_news" and (not isinstance(news, dict) or number is not None):
        errors.append(issue("MODE_PAYLOAD", "$", "key_news mode requires one key_news and null key_number."))

    if isinstance(number, dict):
        for key in ("label", "display_value", "unit", "source_ref"):
            if not nonempty(number.get(key)):
                errors.append(issue("NUMBER_FIELD", f"$.key_number.{key}", f"{key} is required."))
        as_of = parse_time(number.get("as_of"), "$.key_number.as_of", errors)
        if cutoff and as_of and as_of > cutoff:
            errors.append(issue("NUMBER_AFTER_CUTOFF", "$.key_number.as_of", "Number as-of time cannot exceed the decision cutoff."))
        if number.get("status") not in {"observed", "derived", "provisional"}:
            errors.append(issue("NUMBER_STATUS", "$.key_number.status", "Unsupported number status."))
        if number.get("comparison") is not None and not nonempty(number.get("comparison")):
            errors.append(issue("NUMBER_COMPARISON", "$.key_number.comparison", "Comparison must be null or non-empty."))
        if nonempty(number.get("source_ref")) and number["source_ref"] not in lineage_sources:
            errors.append(issue("NUMBER_SOURCE_LINEAGE", "$.key_number.source_ref", "Number source must be preserved in lineage."))
        if number.get("status") == "provisional" and state != "conditional":
            errors.append(issue("PROVISIONAL_STATE", "$.state", "A provisional number requires conditional state."))

    if isinstance(news, dict):
        for key in ("headline", "publisher"):
            if not nonempty(news.get(key)):
                errors.append(issue("NEWS_FIELD", f"$.key_news.{key}", f"{key} is required."))
        published = parse_time(news.get("published_at"), "$.key_news.published_at", errors)
        if cutoff and published and published > cutoff:
            errors.append(issue("NEWS_AFTER_CUTOFF", "$.key_news.published_at", "News publication time cannot exceed the decision cutoff."))
        if news.get("status") not in {"observed", "provisional", "unconfirmed"}:
            errors.append(issue("NEWS_STATUS", "$.key_news.status", "Unsupported news status."))
        news_sources = string_set(news.get("source_refs"), "$.key_news.source_refs", errors)
        if any(ref not in lineage_sources for ref in news_sources):
            errors.append(issue("NEWS_SOURCE_LINEAGE", "$.key_news.source_refs", "News sources must be preserved in lineage."))
        if news.get("status") != "observed" and state != "conditional":
            errors.append(issue("NEWS_UNCERTAINTY_STATE", "$.state", "Non-observed news requires conditional state."))

    render = payload.get("render") if isinstance(payload.get("render"), dict) else {}
    expected = {
        "layout": "compact",
        "width": 720,
        "height": 420,
        "design_profile": "receptive_restraint",
        "watermark": "Cuebook",
    }
    for key, value in expected.items():
        if render.get(key) != value:
            errors.append(issue("RENDER_CONTRACT", f"$.render.{key}", f"Expected {value!r}."))
    if render.get("theme") not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("THEME", "$.render.theme", "Unsupported theme."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def validate_manifest(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    for key in sorted(MANIFEST_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - MANIFEST_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "market-signal-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-signal-v1."))
    if not re.fullmatch(r"SIGNAL_[A-Za-z0-9_:-]{8,}", str(payload.get("market_signal_id") or "")):
        errors.append(issue("MARKET_SIGNAL_ID", "$.market_signal_id", "Invalid market signal ID."))
    if not re.fullmatch(r"SIGSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("spec_ref") or "")):
        errors.append(issue("SPEC_REF", "$.spec_ref", "Invalid spec ref."))
    if payload.get("mode") not in {"key_number", "key_news"}:
        errors.append(issue("MODE", "$.mode", "Unsupported mode."))
    state = payload.get("state")
    if state not in {"conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    parse_time(payload.get("generated_at"), "$.generated_at", errors)
    dimensions = payload.get("dimensions") if isinstance(payload.get("dimensions"), dict) else {}
    if dimensions != {"width": 720, "height": 420}:
        errors.append(issue("DIMENSIONS", "$.dimensions", "Expected 720 x 420."))
    if payload.get("theme") not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("THEME", "$.theme", "Unsupported theme."))
    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    string_set(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    string_set(lineage.get("source_refs"), "$.lineage.source_refs", errors)
    parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)
    if not re.fullmatch(r"TLOGIC_[A-Za-z0-9_:-]{8,}", str(lineage.get("trade_logic_ref") or "")):
        errors.append(issue("TRADE_LOGIC_REF", "$.lineage.trade_logic_ref", "Invalid TradeLogicProfileV1 ref."))
    content = payload.get("content") if isinstance(payload.get("content"), dict) else {}
    for key in ("category", "asset_label", "headline", "interpretation", "signal_label"):
        if not nonempty(content.get(key)):
            errors.append(issue("CONTENT_FIELD", f"$.content.{key}", f"{key} is required."))
    tags = string_set(content.get("strategy_tags"), "$.content.strategy_tags", errors)
    if not 2 <= len(tags) <= 4:
        errors.append(issue("TRADE_LOGIC_TAGS", "$.content.strategy_tags", "Use two to four public strategy tags."))
    for index, tag in enumerate(tags):
        if any(term.lower() in tag.lower() for term in PUBLIC_BACKEND_TERMS):
            errors.append(issue("PUBLIC_BACKEND_TERM", f"$.content.strategy_tags[{index}]", "Backend evidence-state terms cannot appear in public tags."))
    parse_time(content.get("signal_time"), "$.content.signal_time", errors)
    if content.get("signal_value") is not None and not nonempty(content.get("signal_value")):
        errors.append(issue("SIGNAL_VALUE", "$.content.signal_value", "Signal value must be null or non-empty."))
    if content.get("signal_status") not in {"observed", "derived", "provisional", "unconfirmed"}:
        errors.append(issue("SIGNAL_STATUS", "$.content.signal_status", "Unsupported signal status."))
    if content.get("watermark") != "Cuebook":
        errors.append(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."))
    asset = payload.get("asset") if isinstance(payload.get("asset"), dict) else {}
    svg_ref = asset.get("svg_ref")
    content_hash = asset.get("content_hash")
    if not nonempty(svg_ref):
        errors.append(issue("SVG_REF", "$.asset.svg_ref", "SVG ref is required."))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
        errors.append(issue("CONTENT_HASH", "$.asset.content_hash", "Invalid content hash."))
    if asset_root is not None and nonempty(svg_ref):
        asset_path = Path(svg_ref)
        asset_path = asset_path if asset_path.is_absolute() else asset_root / asset_path
        if not asset_path.is_file():
            errors.append(issue("ASSET_MISSING", "$.asset.svg_ref", f"Asset does not exist: {asset_path}."))
        elif re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
            observed = "sha256:" + hashlib.sha256(asset_path.read_bytes()).hexdigest()
            if observed != content_hash:
                errors.append(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."))
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def validate(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    if isinstance(payload, dict) and payload.get("schema_version") == "market-signal-v1":
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
