#!/usr/bin/env python3
"""Validate LogicCardV1 lineage, grammar, asset integrity, and state."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


GRAMMARS = {"causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison"}
ROOT_FIELDS = {
    "schema_version",
    "card_id",
    "argument_ref",
    "grammar",
    "state",
    "generated_at",
    "theme",
    "dimensions",
    "lineage",
    "content",
    "asset",
    "quality_report",
}


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
            continue
        result.append(item)
    if len(result) != len(set(result)):
        errors.append(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."))
    return result


def validate(
    payload: Any,
    argument: dict[str, Any] | None = None,
    asset_root: Path | None = None,
) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}

    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))

    if payload.get("schema_version") != "logic-card-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected logic-card-v1."))
    if not re.fullmatch(r"LOGICCARD_[A-Za-z0-9_:-]{8,}", str(payload.get("card_id") or "")):
        errors.append(issue("CARD_ID", "$.card_id", "Invalid logic card ID."))
    argument_ref = payload.get("argument_ref")
    if not re.fullmatch(r"VARG_[A-Za-z0-9_:-]{8,}", str(argument_ref or "")):
        errors.append(issue("ARGUMENT_REF", "$.argument_ref", "Invalid visual argument reference."))
    grammar = payload.get("grammar")
    if grammar not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.grammar", "Unsupported logic-card grammar."))
    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported logic-card state."))
    parse_time(payload.get("generated_at"), "$.generated_at", errors)
    if payload.get("theme") not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("THEME", "$.theme", "Unsupported Cuebook theme."))

    dimensions = payload.get("dimensions")
    if not isinstance(dimensions, dict):
        errors.append(issue("DIMENSIONS", "$.dimensions", "Dimensions must be an object."))
        dimensions = {}
    for key, lower, upper in (("width", 640, 2400), ("height", 360, 1600)):
        value = dimensions.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or not lower <= value <= upper:
            errors.append(issue("DIMENSION_VALUE", f"$.dimensions.{key}", f"{key} must be {lower}-{upper}."))

    lineage = payload.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
        lineage = {}
    input_argument_ref = lineage.get("input_argument_ref")
    if input_argument_ref != argument_ref:
        errors.append(issue("ARGUMENT_LINEAGE", "$.lineage.input_argument_ref", "Input argument ref must match argument_ref."))
    node_refs = string_list(lineage.get("node_refs"), "$.lineage.node_refs", errors)
    metric_refs = string_list(lineage.get("metric_refs"), "$.lineage.metric_refs", errors)
    source_refs = string_list(lineage.get("source_refs"), "$.lineage.source_refs", errors)
    if not node_refs:
        errors.append(issue("NODE_LINEAGE", "$.lineage.node_refs", "A logic card must preserve at least one argument node."))
    settlement_claim_ref = lineage.get("settlement_claim_ref")
    if settlement_claim_ref is not None and not nonempty(settlement_claim_ref):
        errors.append(issue("SETTLEMENT_LINEAGE", "$.lineage.settlement_claim_ref", "Settlement ref must be null or non-empty."))

    content = payload.get("content")
    if not isinstance(content, dict):
        errors.append(issue("CONTENT", "$.content", "Content must be an object."))
        content = {}
    for key in ("headline", "thesis"):
        if not nonempty(content.get(key)):
            errors.append(issue("CONTENT_FIELD", f"$.content.{key}", f"{key} is required."))
    settlement_line = content.get("settlement_line")
    if settlement_line is not None and not nonempty(settlement_line):
        errors.append(issue("SETTLEMENT_LINE", "$.content.settlement_line", "Settlement line must be null or non-empty."))
    if content.get("watermark") != "Cuebook":
        errors.append(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."))

    asset = payload.get("asset")
    if not isinstance(asset, dict):
        errors.append(issue("ASSET", "$.asset", "Asset must be an object."))
        asset = {}
    svg_ref = asset.get("svg_ref")
    if not nonempty(svg_ref):
        errors.append(issue("SVG_REF", "$.asset.svg_ref", "SVG reference is required."))
    content_hash = asset.get("content_hash")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
        errors.append(issue("CONTENT_HASH", "$.asset.content_hash", "Expected sha256:<64 lowercase hex characters>."))
    if asset_root is not None and nonempty(svg_ref):
        svg_path = Path(svg_ref)
        svg_path = svg_path if svg_path.is_absolute() else asset_root / svg_path
        if not svg_path.is_file():
            errors.append(issue("ASSET_MISSING", "$.asset.svg_ref", f"Asset does not exist: {svg_path}."))
        elif re.fullmatch(r"sha256:[a-f0-9]{64}", str(content_hash or "")):
            observed_hash = "sha256:" + hashlib.sha256(svg_path.read_bytes()).hexdigest()
            if observed_hash != content_hash:
                errors.append(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY", "$.quality_report", "Quality report must be an object."))
        quality = {}
    decision = quality.get("decision")
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    quality_warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    hard_failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."))
    if state == "conditional" and (decision != "conditional" or not quality_warnings):
        errors.append(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional cards require a warning and conditional quality."))
    if state in {"ready", "frozen"} and (decision != "ready" or quality_warnings or hard_failures):
        errors.append(issue("READY_STATE", "$.quality_report", "Ready or frozen cards require clean ready quality."))
    if decision == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked quality requires a hard failure."))

    if argument is not None:
        if argument.get("argument_id") != argument_ref:
            errors.append(issue("ARGUMENT_MISMATCH", "$.argument_ref", "Manifest does not reference the supplied argument."))
        allowed = {argument.get("visual", {}).get("recommended_grammar"), *(argument.get("visual", {}).get("alternative_grammars") or [])}
        if grammar not in allowed:
            errors.append(issue("UNDECLARED_GRAMMAR", "$.grammar", "Grammar is neither recommended nor declared as an alternative."))
        if argument.get("visual", {}).get("theme") != payload.get("theme"):
            errors.append(issue("THEME_MISMATCH", "$.theme", "Card theme must match the visual argument."))
        if argument.get("state") != state:
            errors.append(issue("STATE_MISMATCH", "$.state", "Card state must match the visual argument."))
        if content.get("headline") != argument.get("frame", {}).get("headline"):
            errors.append(issue("HEADLINE_MISMATCH", "$.content.headline", "Headline must remain bound to the argument."))
        if content.get("thesis") != argument.get("frame", {}).get("thesis"):
            errors.append(issue("THESIS_MISMATCH", "$.content.thesis", "Thesis must remain bound to the argument."))

        argument_nodes = {item.get("id") for item in argument.get("graph", {}).get("nodes", []) if isinstance(item, dict)}
        argument_metrics = {item.get("id") for item in argument.get("metrics", []) if isinstance(item, dict)}
        argument_sources = {
            ref
            for item in argument.get("graph", {}).get("nodes", [])
            if isinstance(item, dict)
            for ref in item.get("source_refs", [])
        }
        argument_sources.update(
            item.get("source_ref") for item in argument.get("metrics", []) if isinstance(item, dict) and nonempty(item.get("source_ref"))
        )
        if not set(node_refs) <= argument_nodes:
            errors.append(issue("UNKNOWN_NODE_REF", "$.lineage.node_refs", "Card references a node outside the argument."))
        if not set(metric_refs) <= argument_metrics:
            errors.append(issue("UNKNOWN_METRIC_REF", "$.lineage.metric_refs", "Card references a metric outside the argument."))
        if not set(source_refs) <= argument_sources:
            errors.append(issue("UNKNOWN_SOURCE_REF", "$.lineage.source_refs", "Card references a source outside the argument."))

        settlement = argument.get("settlement", {})
        if settlement.get("settleable"):
            if settlement_claim_ref != settlement.get("claim_ref") or not nonempty(settlement_line):
                errors.append(issue("SETTLEMENT_BINDING", "$.lineage.settlement_claim_ref", "Settleable cards must preserve claim ref and visible rule."))
        elif settlement_claim_ref is not None or settlement_line is not None:
            errors.append(issue("NON_SETTLEABLE_BINDING", "$.content.settlement_line", "Non-settleable cards cannot add a settlement rule."))

    if state == "conditional":
        warnings.append(issue("CONDITIONAL_PREVIEW", "$.state", "Preview is useful for editing but cannot be frozen yet."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--argument", type=Path)
    parser.add_argument("--skip-asset-check", action="store_true")
    args = parser.parse_args()
    try:
        payload = json.loads(args.manifest.read_text(encoding="utf-8"))
        argument = json.loads(args.argument.read_text(encoding="utf-8")) if args.argument else None
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("READ", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1
    asset_root = None if args.skip_asset_check else args.manifest.parent
    result = validate(payload, argument=argument, asset_root=asset_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
