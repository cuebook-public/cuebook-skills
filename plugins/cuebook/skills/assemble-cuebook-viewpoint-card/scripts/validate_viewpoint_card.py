#!/usr/bin/env python3
"""Validate ViewpointCardV1 structure, lineage, ownership, and state invariants."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


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


def parse_datetime(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
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


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}

    if payload.get("schema_version") != "viewpoint-card-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-card-v1."))
    if not re.fullmatch(r"VIEWCARD_[A-Za-z0-9_:-]{8,}", str(payload.get("card_id") or "")):
        errors.append(issue("CARD_ID", "$.card_id", "Invalid viewpoint card ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported card state."))

    lineage = payload.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
        lineage = {}
    input_refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    if not input_refs:
        errors.append(issue("INPUT_REF_REQUIRED", "$.lineage.input_artifact_refs", "At least one input artifact is required."))
    for key in ("creator_intent_ref", "thesis_ref", "post_ref", "viewpoint_visual_ref", "logic_card_ref", "market_figure_ref", "chart_ref", "indicator_pack_ref", "settlement_claim_ref"):
        value = lineage.get(key)
        if key == "creator_intent_ref" and not nonempty(value):
            errors.append(issue("CREATOR_INTENT_REF", f"$.lineage.{key}", "Creator intent reference is required."))
        elif value is not None and not nonempty(value):
            errors.append(issue("LINEAGE_REF", f"$.lineage.{key}", "Reference must be null or a non-empty string."))
        if nonempty(value) and value not in input_refs:
            errors.append(issue("LINEAGE_INPUT_MISSING", f"$.lineage.{key}", "Every lineage reference must also appear in input_artifact_refs."))

    creator = payload.get("creator")
    if not isinstance(creator, dict):
        errors.append(issue("CREATOR", "$.creator", "Creator must be an object."))
        creator = {}
    for key in ("creator_ref", "display_name"):
        if not nonempty(creator.get(key)):
            errors.append(issue("CREATOR_FIELD", f"$.creator.{key}", f"{key} is required."))
    if creator.get("handle") is not None and not nonempty(creator.get("handle")):
        errors.append(issue("CREATOR_HANDLE", "$.creator.handle", "Handle must be null or a non-empty string."))
    if creator.get("author_type") not in {"human", "ai", "hybrid"}:
        errors.append(issue("AUTHOR_TYPE", "$.creator.author_type", "Unsupported author type."))
    if creator.get("decision_owner") != "creator":
        errors.append(issue("DECISION_OWNER", "$.creator.decision_owner", "The creator must remain the decision owner."))

    header = payload.get("header")
    if not isinstance(header, dict):
        errors.append(issue("HEADER", "$.header", "Header must be an object."))
        header = {}
    for key in ("instrument_id", "ticker", "direction_label", "status_label"):
        if not nonempty(header.get(key)):
            errors.append(issue("HEADER_FIELD", f"$.header.{key}", f"{key} is required."))
    direction = header.get("direction")
    if direction not in {"long", "short", "outperform", "underperform", "range", "neutral", "observe", "custom"}:
        errors.append(issue("DIRECTION", "$.header.direction", "Unsupported direction."))
    deadline_at = header.get("deadline_at")
    deadline_label = header.get("deadline_label")
    if deadline_at is not None:
        parse_datetime(deadline_at, "$.header.deadline_at", errors)
    if deadline_label is not None and not nonempty(deadline_label):
        errors.append(issue("DEADLINE_LABEL", "$.header.deadline_label", "Deadline label must be null or a non-empty string."))
    benchmark_ticker = header.get("benchmark_ticker")
    benchmark_id = header.get("benchmark_instrument_id")
    if direction in {"outperform", "underperform"}:
        if not nonempty(benchmark_ticker) or not nonempty(benchmark_id):
            errors.append(issue("RELATIVE_BENCHMARK", "$.header", "Relative cards require a benchmark instrument and ticker."))
    for key, value in (("benchmark_ticker", benchmark_ticker), ("benchmark_instrument_id", benchmark_id)):
        if value is not None and not nonempty(value):
            errors.append(issue("BENCHMARK_FIELD", f"$.header.{key}", "Benchmark must be null or a non-empty string."))

    thesis = payload.get("thesis")
    if not isinstance(thesis, dict):
        errors.append(issue("THESIS", "$.thesis", "Thesis must be an object."))
        thesis = {}
    for key in ("headline", "body", "creator_text"):
        if not nonempty(thesis.get(key)):
            errors.append(issue("THESIS_FIELD", f"$.thesis.{key}", f"{key} is required."))
    if thesis.get("creator_text_preserved") is not True:
        errors.append(issue("CREATOR_TEXT_PRESERVATION", "$.thesis.creator_text_preserved", "Creator text must be preserved verbatim."))
    if thesis.get("content_ref") is not None and not nonempty(thesis.get("content_ref")):
        errors.append(issue("CONTENT_REF", "$.thesis.content_ref", "Content ref must be null or a non-empty string."))

    blocks = payload.get("blocks")
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= 12:
        errors.append(issue("BLOCKS", "$.blocks", "Expected one to twelve blocks."))
        blocks = []
    block_ids: set[str] = set()
    block_orders: list[int] = []
    by_kind: dict[str, list[dict[str, Any]]] = {}
    block_states: list[str] = []
    allowed_kinds = {"creator_text", "news", "viewpoint_visual", "logic_card", "market_figure", "chart", "indicator", "metric", "countercase", "settlement"}
    for index, block in enumerate(blocks):
        path = f"$.blocks[{index}]"
        if not isinstance(block, dict):
            errors.append(issue("BLOCK", path, "Block must be an object."))
            continue
        block_id = block.get("id")
        if not re.fullmatch(r"B[1-9][0-9]*", str(block_id or "")):
            errors.append(issue("BLOCK_ID", f"{path}.id", "Block ID must use B<number>."))
        elif block_id in block_ids:
            errors.append(issue("BLOCK_ID_UNIQUE", f"{path}.id", "Block IDs must be unique."))
        else:
            block_ids.add(block_id)
        order = block.get("order")
        if not isinstance(order, int) or order < 1:
            errors.append(issue("BLOCK_ORDER", f"{path}.order", "Block order must be a positive integer."))
        else:
            block_orders.append(order)
        kind = block.get("kind")
        if kind not in allowed_kinds:
            errors.append(issue("BLOCK_KIND", f"{path}.kind", "Unsupported block kind."))
        else:
            by_kind.setdefault(kind, []).append(block)
        if block.get("role") not in {"supports", "challenges", "context", "settles"}:
            errors.append(issue("BLOCK_ROLE", f"{path}.role", "Unsupported block role."))
        block_state = block.get("state")
        if block_state not in {"ready", "conditional", "blocked"}:
            errors.append(issue("BLOCK_STATE", f"{path}.state", "Unsupported block state."))
        else:
            block_states.append(block_state)
        for key in ("title", "summary"):
            if not nonempty(block.get(key)):
                errors.append(issue("BLOCK_FIELD", f"{path}.{key}", f"{key} is required."))
        artifact_ref = block.get("artifact_ref")
        if artifact_ref is not None and not nonempty(artifact_ref):
            errors.append(issue("BLOCK_ARTIFACT_REF", f"{path}.artifact_ref", "Artifact ref must be null or a non-empty string."))
        fact_refs = string_list(block.get("fact_refs"), f"{path}.fact_refs", errors)
        source_refs = string_list(block.get("source_refs"), f"{path}.source_refs", errors)
        if kind == "news" and (not fact_refs or not source_refs):
            errors.append(issue("NEWS_PROVENANCE", path, "News blocks require fact and source references."))
        expected_ref = {
            "viewpoint_visual": lineage.get("viewpoint_visual_ref"),
            "logic_card": lineage.get("logic_card_ref"),
            "market_figure": lineage.get("market_figure_ref"),
            "chart": lineage.get("chart_ref"),
            "indicator": lineage.get("indicator_pack_ref"),
            "settlement": lineage.get("settlement_claim_ref"),
        }.get(kind)
        if kind in {"viewpoint_visual", "logic_card", "market_figure", "chart", "indicator", "settlement"} and (not nonempty(expected_ref) or artifact_ref != expected_ref):
            errors.append(issue("BLOCK_LINEAGE_REF", f"{path}.artifact_ref", f"{kind} block must reference its matching lineage artifact."))
        if kind == "settlement" and block.get("role") != "settles":
            errors.append(issue("SETTLEMENT_ROLE", f"{path}.role", "Settlement block must use the settles role."))

    if block_orders and sorted(block_orders) != list(range(1, len(blocks) + 1)):
        errors.append(issue("BLOCK_ORDER_CONTIGUOUS", "$.blocks", "Block orders must be unique and contiguous from 1."))
    if len(by_kind.get("creator_text", [])) != 1:
        errors.append(issue("CREATOR_TEXT_BLOCK", "$.blocks", "Exactly one creator_text block is required."))
    elif by_kind["creator_text"][0].get("summary") != thesis.get("creator_text"):
        errors.append(issue("CREATOR_TEXT_CHANGED", "$.blocks", "Creator text block must exactly match thesis.creator_text."))
    for kind in ("viewpoint_visual", "logic_card", "market_figure", "chart", "indicator"):
        if len(by_kind.get(kind, [])) > 1:
            errors.append(issue("COMPACT_BLOCK_LIMIT", "$.blocks", f"Compact cards allow at most one {kind} block."))

    settlement = payload.get("settlement")
    if not isinstance(settlement, dict):
        errors.append(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."))
        settlement = {}
    settleable = settlement.get("settleable")
    if not isinstance(settleable, bool):
        errors.append(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."))
    settlement_state = settlement.get("state")
    if settlement_state not in {"not_applicable", "draft", "needs_confirmation", "ready", "frozen"}:
        errors.append(issue("SETTLEMENT_STATE", "$.settlement.state", "Unsupported settlement state."))
    if settleable:
        if deadline_at is None or not nonempty(deadline_label):
            errors.append(issue("SETTLEMENT_DEADLINE", "$.header", "A settleable card requires a deadline and public deadline label."))
        if not nonempty(settlement.get("claim_ref")) or not nonempty(settlement.get("one_line")):
            errors.append(issue("SETTLEMENT_CONTRACT", "$.settlement", "Settleable cards require a claim ref and one-line rule."))
        if settlement_state == "not_applicable":
            errors.append(issue("SETTLEMENT_APPLICABILITY", "$.settlement.state", "Settleable card cannot be not_applicable."))
        if len(by_kind.get("settlement", [])) != 1:
            errors.append(issue("SETTLEMENT_BLOCK", "$.blocks", "Settleable cards require exactly one settlement block."))
        if direction in {"outperform", "underperform"} and nonempty(benchmark_ticker) and benchmark_ticker not in str(settlement.get("one_line") or ""):
            errors.append(issue("SETTLEMENT_BENCHMARK", "$.settlement.one_line", "Relative settlement line must name the benchmark ticker."))
    elif settlement_state != "not_applicable":
        errors.append(issue("NON_SETTLEABLE_STATE", "$.settlement.state", "Non-settleable cards must use not_applicable."))

    disclosures = payload.get("disclosures")
    if not isinstance(disclosures, dict):
        errors.append(issue("DISCLOSURES", "$.disclosures", "Disclosures must be an object."))
        disclosures = {}
    disclosure_values = {
        "position_status": {"known", "none", "unknown"},
        "commercial_status": {"known", "none", "unknown"},
        "identity_status": {"known", "unknown"},
        "ai_assistance_status": {"disclosed", "not_used", "unknown"},
    }
    for key, allowed in disclosure_values.items():
        if disclosures.get(key) not in allowed:
            errors.append(issue("DISCLOSURE_FIELD", f"$.disclosures.{key}", f"Unsupported {key}."))
    string_list(disclosures.get("public_lines"), "$.disclosures.public_lines", errors)

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
        errors.append(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."))
    if "blocked" in block_states and decision != "blocked":
        errors.append(issue("BLOCKED_BLOCK_CARD", "$.quality_report.decision", "A blocked block blocks the card."))
    if "conditional" in block_states and state in {"ready", "frozen"}:
        errors.append(issue("CONDITIONAL_BLOCK_CARD", "$.state", "A conditional block prevents a ready or frozen card."))
    if state == "conditional" and (decision != "conditional" or not quality_warnings):
        errors.append(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional cards require a conditional decision and warning."))
    if state in {"ready", "frozen"}:
        if decision != "ready" or quality_warnings or hard_failures:
            errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen cards require clean ready quality."))
        if any(value == "unknown" for value in (disclosures.get("position_status"), disclosures.get("commercial_status"), disclosures.get("identity_status"), disclosures.get("ai_assistance_status"))):
            errors.append(issue("READY_DISCLOSURES", "$.disclosures", "Ready or frozen cards require resolved disclosures."))
        if settleable and settlement_state not in {"ready", "frozen"}:
            errors.append(issue("READY_SETTLEMENT", "$.settlement.state", "Ready or frozen settleable cards require ready settlement."))
    if decision == "blocked" and not hard_failures and "blocked" not in block_states:
        errors.append(issue("BLOCKED_WITHOUT_CAUSE", "$.quality_report", "Blocked decision requires a hard failure or blocked block."))

    if state == "conditional":
        warnings.append(issue("CONDITIONAL_PREVIEW", "$.state", "Preview is usable for editing but cannot be frozen or published yet."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("READ", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
