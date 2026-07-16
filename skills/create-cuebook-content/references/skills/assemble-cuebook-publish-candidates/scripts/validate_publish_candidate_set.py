#!/usr/bin/env python3
"""Validate frontend-ready Cuebook publishing candidate sets."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

VISUAL_SCRIPTS = Path(__file__).resolve().parents[2] / "direct-cuebook-viewpoint-visual" / "scripts"
sys.path.insert(0, str(VISUAL_SCRIPTS))
from lint_launch_viewpoint_html import audit_html  # noqa: E402


ROOT_FIELDS = {
    "schema_version", "candidate_set_id", "revision", "state", "lineage",
    "generation_policy", "shared_view", "calibration", "candidates",
    "selection", "quality_report",
}
CANDIDATE_FIELDS = {
    "candidate_id", "label", "angle", "meaning_fingerprint", "post_ref",
    "copy", "visual", "evidence_anchors", "settlement", "public_disclosures", "quality",
}
ANGLES = {"conviction", "evidence", "catalyst", "mechanism", "countercase"}
CALIBRATION_STATES = {"ready", "degraded", "not_applicable", "blocked"}
PROCESS_TERMS = {
    "工作流", "数据库字段", "证据状态", "内部校准", "已计算", "已确认",
    "待补数据", "待补充数据", "模型生成过程",
}
AI_PHRASES = {"值得关注的是", "核心逻辑在于", "从机制上看", "这意味着什么"}
MATERIAL_REQUEST_CLASSES = {
    "news_anchor", "official_event", "valuation_metric", "comparison_metric",
    "price_level", "market_series", "settlement_reference",
}
METRIC_REQUEST_CLASSES = {"valuation_metric", "comparison_metric"}
SETTLEMENT_ELIGIBILITY_FIELDS = {
    "metric", "operator", "threshold", "deadline", "authoritative_source",
}
SETTLEMENT_CONFIRMATION_FIELDS = SETTLEMENT_ELIGIBILITY_FIELDS | {
    "subject", "direction", "baseline", "market_session",
}
COMMON_EVIDENCE_ANCHOR_FIELDS = {
    "anchor_id", "request_class", "kind", "title", "publisher", "url",
    "published_at", "as_of", "fact_refs",
}
EVIDENCE_ANCHOR_FIELDS = {
    "news_anchor": COMMON_EVIDENCE_ANCHOR_FIELDS,
    "official_event": COMMON_EVIDENCE_ANCHOR_FIELDS,
    "valuation_metric": COMMON_EVIDENCE_ANCHOR_FIELDS | {"metric"},
    "comparison_metric": COMMON_EVIDENCE_ANCHOR_FIELDS | {"metric"},
    "price_level": COMMON_EVIDENCE_ANCHOR_FIELDS | {"price_observation"},
    "market_series": COMMON_EVIDENCE_ANCHOR_FIELDS | {"market_series"},
    "settlement_reference": COMMON_EVIDENCE_ANCHOR_FIELDS | {"settlement_reference"},
}
METRIC_FIELDS = {
    "name", "basis", "value_state", "value", "unit", "comparison_subject",
    "not_meaningful_reason",
}
PRICE_OBSERVATION_FIELDS = {
    "instrument_ref", "value", "unit", "observed_at", "observation_basis",
    "market_session",
}
PRICE_OBSERVATION_BASES = {
    "last_trade", "last_close", "midpoint", "official_close",
    "official_settlement", "spot", "intraday", "nav", "event_status",
}
MARKET_SESSIONS = {"regular", "extended", "all_sessions", "continuous", "event_window"}
MARKET_SERIES_FIELDS = {
    "series_ref", "instrument_refs", "metric", "interval", "window_start",
    "window_end", "timezone", "observation_basis",
}
SETTLEMENT_REFERENCE_FIELDS = {"claim_ref", "eligibility_fields"}
WEIGHTS = {
    "claim_fidelity": 0.20,
    "compression": 0.15,
    "human_voice": 0.15,
    "evidence_integrity": 0.20,
    "visual_craft": 0.15,
    "three_second": 0.15,
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or "T" not in value:
        return None
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def string_set(value: Any, *, minimum: int = 0) -> set[str] | None:
    if (
        not isinstance(value, list)
        or len(value) < minimum
        or any(not nonempty_string(item) for item in value)
        or len(value) != len(set(value))
    ):
        return None
    return set(value)


def require_exact_fields(
    value: dict[str, Any],
    expected: set[str],
    path: str,
    code: str,
    errors: list[dict[str, str]],
) -> None:
    if set(value) != expected:
        missing = sorted(expected - set(value))
        unknown = sorted(set(value) - expected)
        errors.append(issue(code, path, f"Fields must match the contract exactly; missing={missing}, unknown={unknown}."))


def validate_metric_observation(
    value: Any,
    request_class: str,
    path: str,
    errors: list[dict[str, str]],
) -> None:
    if not isinstance(value, dict):
        errors.append(issue("EVIDENCE_METRIC", path, "Metric evidence requires a typed metric object."))
        return
    require_exact_fields(value, METRIC_FIELDS, path, "EVIDENCE_METRIC_FIELDS", errors)
    for key in ("name", "basis", "unit"):
        if not nonempty_string(value.get(key)):
            errors.append(issue("EVIDENCE_METRIC", f"{path}.{key}", f"Metric {key} must be non-empty."))
    comparison_subject = value.get("comparison_subject")
    if request_class == "comparison_metric" and not nonempty_string(comparison_subject):
        errors.append(issue("EVIDENCE_METRIC", f"{path}.comparison_subject", "Comparison metrics require a named comparison subject."))
    elif comparison_subject is not None and not nonempty_string(comparison_subject):
        errors.append(issue("EVIDENCE_METRIC", f"{path}.comparison_subject", "comparison_subject must be null or non-empty."))

    value_state = value.get("value_state")
    metric_value = value.get("value")
    reason = value.get("not_meaningful_reason")
    if value_state == "numeric":
        if not finite_number(metric_value):
            errors.append(issue("EVIDENCE_METRIC_VALUE", f"{path}.value", "Numeric metrics require a finite value."))
        if reason is not None:
            errors.append(issue("EVIDENCE_METRIC_VALUE", f"{path}.not_meaningful_reason", "Numeric metrics cannot carry an N/M reason."))
    elif value_state == "N/M":
        if metric_value is not None:
            errors.append(issue("EVIDENCE_METRIC_VALUE", f"{path}.value", "N/M metrics must use a null numeric value."))
        if not nonempty_string(reason):
            errors.append(issue("EVIDENCE_METRIC_VALUE", f"{path}.not_meaningful_reason", "N/M metrics require a reason."))
    else:
        errors.append(issue("EVIDENCE_METRIC_VALUE", f"{path}.value_state", "Metric value_state must be numeric or N/M."))


def validate_price_observation(value: Any, path: str, errors: list[dict[str, str]]) -> None:
    if not isinstance(value, dict):
        errors.append(issue("EVIDENCE_PRICE", path, "Price-level evidence requires a typed price observation."))
        return
    require_exact_fields(value, PRICE_OBSERVATION_FIELDS, path, "EVIDENCE_PRICE_FIELDS", errors)
    for key in ("instrument_ref", "unit"):
        if not nonempty_string(value.get(key)):
            errors.append(issue("EVIDENCE_PRICE", f"{path}.{key}", f"Price {key} must be non-empty."))
    if not finite_number(value.get("value")):
        errors.append(issue("EVIDENCE_PRICE", f"{path}.value", "Price value must be finite."))
    if parse_iso_datetime(value.get("observed_at")) is None:
        errors.append(issue("EVIDENCE_PRICE", f"{path}.observed_at", "Price observed_at must be an ISO date-time with timezone."))
    if value.get("observation_basis") not in PRICE_OBSERVATION_BASES:
        errors.append(issue("EVIDENCE_PRICE_BASIS", f"{path}.observation_basis", "Unsupported price observation basis."))
    if value.get("market_session") not in MARKET_SESSIONS:
        errors.append(issue("EVIDENCE_PRICE_BASIS", f"{path}.market_session", "Unsupported price market session."))


def validate_market_series(value: Any, path: str, errors: list[dict[str, str]]) -> None:
    if not isinstance(value, dict):
        errors.append(issue("EVIDENCE_SERIES", path, "Market-series evidence requires a typed series projection."))
        return
    require_exact_fields(value, MARKET_SERIES_FIELDS, path, "EVIDENCE_SERIES_FIELDS", errors)
    for key in ("series_ref", "metric", "interval", "timezone", "observation_basis"):
        if not nonempty_string(value.get(key)):
            errors.append(issue("EVIDENCE_SERIES", f"{path}.{key}", f"Series {key} must be non-empty."))
    if string_set(value.get("instrument_refs"), minimum=1) is None:
        errors.append(issue("EVIDENCE_SERIES", f"{path}.instrument_refs", "Series instrument refs must be unique and non-empty."))
    window_start = parse_iso_datetime(value.get("window_start"))
    window_end = parse_iso_datetime(value.get("window_end"))
    if window_start is None:
        errors.append(issue("EVIDENCE_SERIES", f"{path}.window_start", "Series window_start must be an ISO date-time with timezone."))
    if window_end is None:
        errors.append(issue("EVIDENCE_SERIES", f"{path}.window_end", "Series window_end must be an ISO date-time with timezone."))
    if window_start is not None and window_end is not None and window_end < window_start:
        errors.append(issue("EVIDENCE_SERIES_WINDOW", path, "Series window_end cannot precede window_start."))


def validate_settlement_reference(
    value: Any,
    lineage_claim_ref: Any,
    path: str,
    errors: list[dict[str, str]],
) -> None:
    if not isinstance(value, dict):
        errors.append(issue("EVIDENCE_SETTLEMENT", path, "Settlement-reference evidence requires a typed reference."))
        return
    require_exact_fields(value, SETTLEMENT_REFERENCE_FIELDS, path, "EVIDENCE_SETTLEMENT_FIELDS", errors)
    claim_ref = value.get("claim_ref")
    if not nonempty_string(claim_ref):
        errors.append(issue("EVIDENCE_SETTLEMENT", f"{path}.claim_ref", "Settlement reference requires a claim ref."))
    elif lineage_claim_ref is not None and claim_ref != lineage_claim_ref:
        errors.append(issue("EVIDENCE_SETTLEMENT_REF", f"{path}.claim_ref", "Settlement evidence must match the lineage claim ref."))
    eligibility_fields = string_set(value.get("eligibility_fields"))
    if eligibility_fields != SETTLEMENT_ELIGIBILITY_FIELDS:
        errors.append(issue("EVIDENCE_SETTLEMENT_FIELDS", f"{path}.eligibility_fields", "Settlement reference must cover all eligibility fields."))


def safe_relative_ref(value: Any, suffix: str | None = None) -> bool:
    if not isinstance(value, str) or not value or value.startswith(("/", "~")):
        return False
    if "://" in value or ".." in Path(value).parts:
        return False
    return suffix is None or value.lower().endswith(suffix)


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def hard_number_count(value: str) -> int:
    pattern = r"(?<![A-Za-z])\d+(?:\.\d+)?(?:/\d+(?:\.\d+)?)?(?:[%+×xX]|[KMBkmb])?"
    return len(re.findall(pattern, value))


def visible_char_count(copy: dict[str, Any]) -> int:
    parts = [str(copy.get("headline") or ""), str(copy.get("body") or ""), str(copy.get("close") or "")]
    tags = copy.get("tags") if isinstance(copy.get("tags"), list) else []
    return sum(len(item.strip()) for item in parts) + sum(len(str(tag).strip()) for tag in tags)


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"style", "script", "title"}:
            self.skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "script", "title"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip_depth and data.strip():
            self.parts.append(data)


def html_visible_char_count(path: Path) -> int:
    parser = _VisibleTextParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return len(re.sub(r"\s+", "", "".join(parser.parts)))


def validate(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    stats: dict[str, Any] = {"candidate_count": 0, "max_visible_chars": 0}

    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "PublishCandidateSetV1 must be an object.")], "warnings": [], "stats": stats}

    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "publish-candidate-set-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected publish-candidate-set-v1."))
    if not re.fullmatch(r"PUBSET_[A-Za-z0-9_:-]{8,}", str(payload.get("candidate_set_id") or "")):
        errors.append(issue("CANDIDATE_SET_ID", "$.candidate_set_id", "Invalid candidate set ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))

    state = payload.get("state")
    if state not in {"draft", "ready_for_selection", "selected", "blocked"}:
        errors.append(issue("STATE", "$.state", "Unsupported candidate-set state."))

    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    root_fingerprint = lineage.get("fingerprint_sha256")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(root_fingerprint or "")):
        errors.append(issue("FINGERPRINT", "$.lineage.fingerprint_sha256", "A canonical sha256 fingerprint is required."))
    settlement_ref = lineage.get("settlement_claim_ref")
    if settlement_ref is not None and not nonempty_string(settlement_ref):
        errors.append(issue("SETTLEMENT_REF", "$.lineage.settlement_claim_ref", "Settlement claim ref must be null or non-empty."))

    policy = payload.get("generation_policy") if isinstance(payload.get("generation_policy"), dict) else {}
    expected_policy = {
        "candidate_count": 3,
        "autonomous": True,
        "user_iteration_required": False,
        "calibration_owner": "skills",
        "fallback_policy": "degrade_then_omit",
        "linked_evidence_policy": "required_when_material",
    }
    for key, expected in expected_policy.items():
        if policy.get(key) != expected:
            errors.append(issue("AUTONOMOUS_POLICY", f"$.generation_policy.{key}", f"Expected {expected!r}."))
    retry_limit = policy.get("retry_limit")
    if not isinstance(retry_limit, int) or not 0 <= retry_limit <= 3:
        errors.append(issue("RETRY_LIMIT", "$.generation_policy.retry_limit", "Retry limit must be 0-3."))
    budget = policy.get("copy_budget") if isinstance(policy.get("copy_budget"), dict) else {}
    budget_limits = {
        "headline_max": (12, 32), "body_max": (80, 220), "close_max": (20, 56),
        "total_max": (160, 300), "paragraph_max": (2, 4), "hard_number_max": (1, 3),
    }
    for key, (minimum, maximum) in budget_limits.items():
        value = budget.get(key)
        if not isinstance(value, int) or not minimum <= value <= maximum:
            errors.append(issue("COPY_BUDGET", f"$.generation_policy.copy_budget.{key}", f"Budget must be {minimum}-{maximum}."))
    visual_char_max = policy.get("visual_visible_char_max")
    if not isinstance(visual_char_max, int) or not 60 <= visual_char_max <= 120:
        errors.append(issue("VISUAL_BUDGET", "$.generation_policy.visual_visible_char_max", "Visual character budget must be 60-120."))

    shared_view = payload.get("shared_view") if isinstance(payload.get("shared_view"), dict) else {}
    expected_shared_view_fields = {
        "ticker", "direction", "horizon", "claim", "caveat", "material_evidence",
        "settlement_eligibility",
    }
    require_exact_fields(shared_view, expected_shared_view_fields, "$.shared_view", "SHARED_VIEW_FIELDS", errors)

    material_evidence = shared_view.get("material_evidence") if isinstance(shared_view.get("material_evidence"), dict) else {}
    require_exact_fields(material_evidence, {"requirements"}, "$.shared_view.material_evidence", "MATERIAL_EVIDENCE_FIELDS", errors)
    raw_requirements = material_evidence.get("requirements")
    if not isinstance(raw_requirements, list) or len(raw_requirements) > 8:
        errors.append(issue("MATERIAL_EVIDENCE", "$.shared_view.material_evidence.requirements", "Material evidence requirements must be an array with at most eight items."))
        raw_requirements = []

    requirement_ids: set[str] = set()
    required_anchor_types: dict[str, str] = {}
    for index, raw_requirement in enumerate(raw_requirements):
        requirement_path = f"$.shared_view.material_evidence.requirements[{index}]"
        if not isinstance(raw_requirement, dict):
            errors.append(issue("MATERIAL_REQUIREMENT", requirement_path, "Material evidence requirement must be an object."))
            continue
        require_exact_fields(
            raw_requirement,
            {"requirement_id", "request_class", "required_anchor_ids"},
            requirement_path,
            "MATERIAL_REQUIREMENT_FIELDS",
            errors,
        )
        requirement_id = raw_requirement.get("requirement_id")
        if not isinstance(requirement_id, str) or not re.fullmatch(r"D[1-9][0-9]*", requirement_id):
            errors.append(issue("MATERIAL_REQUIREMENT_ID", f"{requirement_path}.requirement_id", "Requirement ID must match the expression-plan D<number> form."))
        elif requirement_id in requirement_ids:
            errors.append(issue("MATERIAL_REQUIREMENT_ID", f"{requirement_path}.requirement_id", "Requirement IDs must be unique."))
        else:
            requirement_ids.add(requirement_id)

        request_class = raw_requirement.get("request_class")
        if not isinstance(request_class, str) or request_class not in MATERIAL_REQUEST_CLASSES:
            errors.append(issue("MATERIAL_REQUIREMENT_TYPE", f"{requirement_path}.request_class", "Unsupported material evidence request class."))
        anchor_ids = string_set(raw_requirement.get("required_anchor_ids"), minimum=1)
        if anchor_ids is None:
            errors.append(issue("MATERIAL_REQUIREMENT_ANCHORS", f"{requirement_path}.required_anchor_ids", "Each material requirement needs unique evidence anchor IDs."))
            continue
        for anchor_id in anchor_ids:
            if not re.fullmatch(r"EVA_[A-Za-z0-9_:-]{4,}", anchor_id):
                errors.append(issue("MATERIAL_REQUIREMENT_ANCHORS", f"{requirement_path}.required_anchor_ids", f"Invalid evidence anchor ID {anchor_id!r}."))
            existing_type = required_anchor_types.get(anchor_id)
            if existing_type is not None:
                errors.append(issue("MATERIAL_REQUIREMENT_ANCHORS", f"{requirement_path}.required_anchor_ids", f"Required anchor {anchor_id!r} is assigned more than once."))
            elif request_class in MATERIAL_REQUEST_CLASSES:
                required_anchor_types[anchor_id] = request_class
    required_anchor_ids = set(required_anchor_types)

    settlement_eligibility = shared_view.get("settlement_eligibility") if isinstance(shared_view.get("settlement_eligibility"), dict) else {}
    require_exact_fields(
        settlement_eligibility,
        {"status", "requirements", "missing_requirements"},
        "$.shared_view.settlement_eligibility",
        "SETTLEMENT_ELIGIBILITY_FIELDS",
        errors,
    )
    eligibility_status = settlement_eligibility.get("status")
    if not isinstance(eligibility_status, str) or eligibility_status not in {"ineligible", "candidate", "eligible", "blocked"}:
        errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Unsupported settlement eligibility status."))
    eligibility_requirements = settlement_eligibility.get("requirements") if isinstance(settlement_eligibility.get("requirements"), dict) else {}
    require_exact_fields(
        eligibility_requirements,
        SETTLEMENT_ELIGIBILITY_FIELDS,
        "$.shared_view.settlement_eligibility.requirements",
        "SETTLEMENT_ELIGIBILITY_FIELDS",
        errors,
    )
    for field in SETTLEMENT_ELIGIBILITY_FIELDS:
        if not isinstance(eligibility_requirements.get(field), bool):
            errors.append(issue("SETTLEMENT_ELIGIBILITY", f"$.shared_view.settlement_eligibility.requirements.{field}", "Settlement eligibility requirements must be boolean."))
    missing_eligibility = string_set(settlement_eligibility.get("missing_requirements"))
    if missing_eligibility is None or not missing_eligibility.issubset(SETTLEMENT_ELIGIBILITY_FIELDS):
        errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.missing_requirements", "Missing settlement requirements must be unique canonical field names."))
        missing_eligibility = set()
    computed_missing_eligibility = {
        field for field in SETTLEMENT_ELIGIBILITY_FIELDS
        if eligibility_requirements.get(field) is False
    }
    if eligibility_status == "ineligible":
        if any(value is True for value in eligibility_requirements.values()) or missing_eligibility:
            errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "Ineligible settlement must not assert requirements or missing fields."))
    elif missing_eligibility != computed_missing_eligibility:
        errors.append(issue("SETTLEMENT_ELIGIBILITY_MISMATCH", "$.shared_view.settlement_eligibility.missing_requirements", "Missing requirements must match false eligibility fields."))
    if eligibility_status == "eligible" and computed_missing_eligibility:
        errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Eligible settlement requires every eligibility field."))
    if settlement_ref is not None and (eligibility_status != "eligible" or computed_missing_eligibility):
        errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "A bound settlement claim requires complete eligible semantics."))
    if state in {"ready_for_selection", "selected"} and eligibility_status == "blocked":
        errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Selectable output cannot preserve blocked settlement eligibility."))

    calibration = payload.get("calibration") if isinstance(payload.get("calibration"), dict) else {}
    for key in ("research", "market_data", "semantics", "policy", "visual", "settlement"):
        value = calibration.get(key)
        if value not in CALIBRATION_STATES:
            errors.append(issue("CALIBRATION_STATE", f"$.calibration.{key}", "Unsupported calibration state."))
    if state in {"ready_for_selection", "selected"} and "blocked" in calibration.values():
        errors.append(issue("BLOCKED_CALIBRATION", "$.calibration", "Selectable candidates cannot contain a blocked calibration stage."))

    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        errors.append(issue("CANDIDATES", "$.candidates", "Candidates must be an array."))
        candidates = []
    stats["candidate_count"] = len(candidates)
    if len(candidates) > 3:
        errors.append(issue("CANDIDATE_COUNT", "$.candidates", "At most three candidates are allowed."))
    if state in {"ready_for_selection", "selected"} and len(candidates) != 3:
        errors.append(issue("CANDIDATE_COUNT", "$.candidates", "Selectable state requires exactly three candidates."))
    if state == "blocked" and candidates:
        errors.append(issue("BLOCKED_HAS_CANDIDATES", "$.candidates", "Blocked output must not expose partial candidates."))

    ids: set[str] = set()
    labels: set[str] = set()
    angles: set[str] = set()
    posts: set[str] = set()
    directions: set[str] = set()
    previews: set[str] = set()
    compact_previews: set[str] = set()
    html_refs: set[str] = set()
    normalized_copies: set[str] = set()
    settlement_projections: set[str] = set()
    settlement_states: list[str] = []
    material_anchor_sets: set[tuple[tuple[str, str], ...]] = set()
    material_anchor_payloads: dict[str, str] = {}
    passed_candidates: set[str] = set()

    for index, candidate in enumerate(candidates):
        path = f"$.candidates[{index}]"
        if not isinstance(candidate, dict):
            errors.append(issue("CANDIDATE_TYPE", path, "Candidate must be an object."))
            continue
        for key in sorted(CANDIDATE_FIELDS - set(candidate)):
            errors.append(issue("CANDIDATE_FIELD", f"{path}.{key}", "Required candidate field is missing."))
        for key in sorted(set(candidate) - CANDIDATE_FIELDS):
            errors.append(issue("CANDIDATE_FIELD", f"{path}.{key}", "Unknown candidate field."))

        candidate_id = candidate.get("candidate_id")
        if not re.fullmatch(r"PUBCAND_[A-Za-z0-9_:-]{6,}", str(candidate_id or "")):
            errors.append(issue("CANDIDATE_ID", f"{path}.candidate_id", "Invalid candidate ID."))
        elif candidate_id in ids:
            errors.append(issue("DUPLICATE_CANDIDATE", f"{path}.candidate_id", "Candidate IDs must be unique."))
        else:
            ids.add(str(candidate_id))

        label = candidate.get("label")
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 12:
            errors.append(issue("LABEL", f"{path}.label", "Label must be 1-12 characters."))
        elif label.strip() in labels:
            errors.append(issue("DUPLICATE_LABEL", f"{path}.label", "Candidate labels must be unique."))
        else:
            labels.add(label.strip())

        angle = candidate.get("angle")
        if angle not in ANGLES:
            errors.append(issue("ANGLE", f"{path}.angle", "Unsupported candidate angle."))
        elif angle in angles:
            errors.append(issue("DUPLICATE_ANGLE", f"{path}.angle", "Candidate angles must be distinct."))
        else:
            angles.add(str(angle))

        if candidate.get("meaning_fingerprint") != root_fingerprint:
            errors.append(issue("FINGERPRINT_MISMATCH", f"{path}.meaning_fingerprint", "Candidate must preserve the shared meaning fingerprint."))

        post_ref = candidate.get("post_ref")
        if not isinstance(post_ref, str) or not post_ref:
            errors.append(issue("POST_REF", f"{path}.post_ref", "Post ref is required."))
        elif post_ref in posts:
            errors.append(issue("DUPLICATE_POST", f"{path}.post_ref", "Each candidate needs a distinct PostV1 ref."))
        else:
            posts.add(post_ref)

        copy = candidate.get("copy") if isinstance(candidate.get("copy"), dict) else {}
        headline = str(copy.get("headline") or "")
        body = str(copy.get("body") or "")
        close = str(copy.get("close") or "")
        tags = copy.get("tags") if isinstance(copy.get("tags"), list) else []
        fields = {"headline": headline, "body": body, "close": close}
        for key, value in fields.items():
            limit = budget.get(f"{key}_max")
            if not value.strip():
                errors.append(issue("COPY_REQUIRED", f"{path}.copy.{key}", "Copy field cannot be empty."))
            elif isinstance(limit, int) and len(value.strip()) > limit:
                errors.append(issue("COPY_BUDGET_EXCEEDED", f"{path}.copy.{key}", f"Copy exceeds {limit} visible characters."))
        if not 2 <= len(tags) <= 4 or len(tags) != len(set(tags)) or any(not isinstance(tag, str) or not 1 <= len(tag.strip()) <= 12 for tag in tags):
            errors.append(issue("TAGS", f"{path}.copy.tags", "Use two to four unique tags of at most 12 characters."))
        calculated_count = visible_char_count(copy)
        stats["max_visible_chars"] = max(stats["max_visible_chars"], calculated_count)
        if copy.get("visible_char_count") != calculated_count:
            errors.append(issue("CHAR_COUNT", f"{path}.copy.visible_char_count", f"Expected {calculated_count}."))
        if isinstance(budget.get("total_max"), int) and calculated_count > budget["total_max"]:
            errors.append(issue("TOTAL_COPY_BUDGET", f"{path}.copy", f"Visible copy exceeds {budget['total_max']} characters."))
        paragraphs = [part.strip() for part in re.split(r"\n+", body) if part.strip()]
        if isinstance(budget.get("paragraph_max"), int) and len(paragraphs) > budget["paragraph_max"]:
            errors.append(issue("PARAGRAPH_BUDGET", f"{path}.copy.body", f"Body exceeds {budget['paragraph_max']} paragraphs."))
        number_count = hard_number_count(" ".join((headline, body, close)))
        if isinstance(budget.get("hard_number_max"), int) and number_count > budget["hard_number_max"]:
            errors.append(issue("HARD_NUMBER_BUDGET", f"{path}.copy", f"Copy uses {number_count} hard numbers; maximum is {budget['hard_number_max']}."))
        public_copy = "\n".join((headline, body, close))
        for term in sorted(PROCESS_TERMS | AI_PHRASES):
            if term in public_copy:
                errors.append(issue("PUBLIC_LANGUAGE", f"{path}.copy", f"Remove internal or stock AI phrase {term!r}."))
        if re.search(r"不是.{0,18}而是", public_copy):
            errors.append(issue("PUBLIC_LANGUAGE", f"{path}.copy", "Remove the repeated '不是 A 而是 B' frame."))
        copy_key = normalized_text(public_copy)
        if copy_key in normalized_copies:
            errors.append(issue("DUPLICATE_COPY", f"{path}.copy", "Candidate copies must be structurally distinct."))
        normalized_copies.add(copy_key)

        visual = candidate.get("visual") if isinstance(candidate.get("visual"), dict) else {}
        direction = visual.get("direction_ref")
        if not isinstance(direction, str) or not direction:
            errors.append(issue("DIRECTION_REF", f"{path}.visual.direction_ref", "Visual direction ref is required."))
        elif direction in directions:
            errors.append(issue("DUPLICATE_DIRECTION", f"{path}.visual.direction_ref", "Each candidate needs a distinct visual direction."))
        else:
            directions.add(direction)
        html_ref = visual.get("html_ref")
        if not safe_relative_ref(html_ref, ".html"):
            errors.append(issue("VISUAL_REF", f"{path}.visual.html_ref", "Use a safe relative HTML ref."))
        elif html_ref in html_refs:
            errors.append(issue("DUPLICATE_VISUAL_REF", f"{path}.visual.html_ref", "HTML refs must be unique."))
        else:
            html_refs.add(html_ref)
            if asset_root is not None:
                html_path = asset_root / html_ref
                if not html_path.is_file():
                    errors.append(issue("VISUAL_MISSING", f"{path}.visual.html_ref", f"Missing visual asset {html_ref!r}."))
                else:
                    html = html_path.read_text(encoding="utf-8")
                    measured_chars = html_visible_char_count(html_path)
                    if visual.get("visible_char_count") != measured_chars:
                        errors.append(issue("VISUAL_CHAR_COUNT", f"{path}.visual.visible_char_count", f"Expected {measured_chars} from HTML."))
                    launch_audit = audit_html(html)
                    for launch_error in launch_audit["errors"]:
                        errors.append(issue(f"VISUAL_{launch_error['code']}", f"{path}.visual.html_ref", launch_error["message"]))
        declared_visual_chars = visual.get("visible_char_count")
        if not isinstance(declared_visual_chars, int) or declared_visual_chars < 1:
            errors.append(issue("VISUAL_CHAR_COUNT", f"{path}.visual.visible_char_count", "A positive visual character count is required."))
        elif isinstance(visual_char_max, int) and declared_visual_chars > visual_char_max:
            errors.append(issue("VISUAL_COPY_BUDGET", f"{path}.visual.visible_char_count", f"Visual copy exceeds {visual_char_max} characters."))
        for key, seen in (("preview_ref", previews), ("compact_preview_ref", compact_previews)):
            ref = visual.get(key)
            if not safe_relative_ref(ref, ".png"):
                errors.append(issue("VISUAL_REF", f"{path}.visual.{key}", "Use a safe relative PNG ref."))
                continue
            if ref in seen:
                errors.append(issue("DUPLICATE_VISUAL_REF", f"{path}.visual.{key}", "Preview refs must be unique."))
            seen.add(ref)
            if asset_root is not None and not (asset_root / ref).is_file():
                errors.append(issue("VISUAL_MISSING", f"{path}.visual.{key}", f"Missing visual asset {ref!r}."))

        evidence_anchors = candidate.get("evidence_anchors")
        if not isinstance(evidence_anchors, list) or len(evidence_anchors) > 8:
            errors.append(issue("EVIDENCE_ANCHORS", f"{path}.evidence_anchors", "Evidence anchors must be an array with at most eight items."))
            evidence_anchors = []
        anchor_ids: set[str] = set()
        anchor_types: dict[str, str] = {}
        for anchor_index, anchor in enumerate(evidence_anchors):
            anchor_path = f"{path}.evidence_anchors[{anchor_index}]"
            if not isinstance(anchor, dict):
                errors.append(issue("EVIDENCE_ANCHOR", anchor_path, "Evidence anchor must be an object."))
                continue
            request_class = anchor.get("request_class")
            if not isinstance(request_class, str) or request_class not in MATERIAL_REQUEST_CLASSES:
                errors.append(issue("EVIDENCE_ANCHOR_TYPE", f"{anchor_path}.request_class", "Unsupported evidence anchor request class."))
                expected_anchor_fields = COMMON_EVIDENCE_ANCHOR_FIELDS
            else:
                expected_anchor_fields = EVIDENCE_ANCHOR_FIELDS[request_class]
            require_exact_fields(anchor, expected_anchor_fields, anchor_path, "EVIDENCE_ANCHOR_FIELDS", errors)

            anchor_id = anchor.get("anchor_id")
            anchor_key = anchor_id if isinstance(anchor_id, str) else ""
            if not re.fullmatch(r"EVA_[A-Za-z0-9_:-]{4,}", anchor_key):
                errors.append(issue("EVIDENCE_ANCHOR_ID", f"{anchor_path}.anchor_id", "Invalid evidence anchor ID."))
            elif anchor_key in anchor_ids:
                errors.append(issue("EVIDENCE_ANCHOR_ID", f"{anchor_path}.anchor_id", "Evidence anchor IDs must be unique per candidate."))
            else:
                anchor_ids.add(anchor_key)
                if isinstance(request_class, str):
                    anchor_types[anchor_key] = request_class

            kind = anchor.get("kind")
            if not isinstance(kind, str) or kind not in {"news", "company_release", "filing", "official_data", "market_data", "estimate_data"}:
                errors.append(issue("EVIDENCE_ANCHOR_KIND", f"{anchor_path}.kind", "Unsupported evidence anchor kind."))
            for key, maximum in (("title", 160), ("publisher", 80)):
                value = anchor.get(key)
                if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
                    errors.append(issue("EVIDENCE_ANCHOR_TEXT", f"{anchor_path}.{key}", f"{key} must be non-empty and at most {maximum} characters."))
            url = anchor.get("url")
            if url is not None and (not isinstance(url, str) or not re.match(r"^https?://", url)):
                errors.append(issue("EVIDENCE_ANCHOR_URL", f"{anchor_path}.url", "Evidence anchor URL must be null or HTTP(S)."))
            if isinstance(kind, str) and kind in {"news", "company_release", "filing", "official_data"} and not isinstance(url, str):
                errors.append(issue("EVIDENCE_ANCHOR_URL", f"{anchor_path}.url", "Linked editorial and primary-source anchors require a URL."))
            if parse_iso_datetime(anchor.get("as_of")) is None:
                errors.append(issue("EVIDENCE_ANCHOR_TIME", f"{anchor_path}.as_of", "Evidence anchor requires an ISO date-time as_of with timezone."))
            published_at = anchor.get("published_at")
            if published_at is not None and parse_iso_datetime(published_at) is None:
                errors.append(issue("EVIDENCE_ANCHOR_TIME", f"{anchor_path}.published_at", "published_at must be null or an ISO date-time with timezone."))
            if anchor_key in required_anchor_ids and isinstance(kind, str) and kind in {"news", "company_release"} and parse_iso_datetime(published_at) is None:
                errors.append(issue("MATERIAL_NEWS_PUBLISHED_AT", f"{anchor_path}.published_at", "Material news and company releases require published_at."))
            elif isinstance(kind, str) and kind in {"news", "company_release"} and parse_iso_datetime(published_at) is None:
                errors.append(issue("EVIDENCE_ANCHOR_TIME", f"{anchor_path}.published_at", "News and company-release anchors require published_at."))
            if string_set(anchor.get("fact_refs"), minimum=1) is None:
                errors.append(issue("EVIDENCE_ANCHOR_FACTS", f"{anchor_path}.fact_refs", "Evidence anchor requires unique fact refs."))

            if isinstance(request_class, str) and request_class in METRIC_REQUEST_CLASSES:
                validate_metric_observation(anchor.get("metric"), request_class, f"{anchor_path}.metric", errors)
            elif request_class == "price_level":
                validate_price_observation(anchor.get("price_observation"), f"{anchor_path}.price_observation", errors)
            elif request_class == "market_series":
                validate_market_series(anchor.get("market_series"), f"{anchor_path}.market_series", errors)
            elif request_class == "settlement_reference":
                validate_settlement_reference(anchor.get("settlement_reference"), settlement_ref, f"{anchor_path}.settlement_reference", errors)

            expected_request_class = required_anchor_types.get(anchor_key)
            if expected_request_class is not None and request_class != expected_request_class:
                errors.append(issue("MATERIAL_ANCHOR_TYPE", f"{anchor_path}.request_class", f"Required anchor {anchor_id!r} must preserve request class {expected_request_class!r}."))
            if expected_request_class is not None:
                serialized_anchor = json.dumps(anchor, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                prior_anchor = material_anchor_payloads.setdefault(anchor_key, serialized_anchor)
                if prior_anchor != serialized_anchor:
                    errors.append(issue("EVIDENCE_ANCHOR_DRIFT", anchor_path, f"Required anchor {anchor_id!r} changed across candidates."))

        missing_anchor_ids = required_anchor_ids - anchor_ids
        if missing_anchor_ids:
            errors.append(issue("MATERIAL_ANCHOR_MISSING", f"{path}.evidence_anchors", f"Missing material anchors: {sorted(missing_anchor_ids)}."))
        material_anchor_sets.add(tuple(sorted(
            (anchor_id, anchor_types.get(anchor_id, ""))
            for anchor_id in anchor_ids & required_anchor_ids
        )))

        settlement = candidate.get("settlement") if isinstance(candidate.get("settlement"), dict) else {}
        require_exact_fields(settlement, {"claim_ref", "one_line", "state"}, f"{path}.settlement", "SETTLEMENT_FIELDS", errors)
        settlement_state = settlement.get("state")
        if not isinstance(settlement_state, str) or settlement_state not in {"not_applicable", "needs_confirmation", "ready", "frozen"}:
            errors.append(issue("SETTLEMENT_STATE", f"{path}.settlement.state", "Unsupported candidate settlement state."))
        else:
            settlement_states.append(settlement_state)
        settlement_projections.add(json.dumps(settlement, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str))
        if settlement_ref is None:
            if settlement != {"claim_ref": None, "one_line": None, "state": "not_applicable"}:
                errors.append(issue("SETTLEMENT_UNBOUND", f"{path}.settlement", "Unbound candidates must use not_applicable settlement."))
        else:
            if settlement.get("claim_ref") != settlement_ref:
                errors.append(issue("SETTLEMENT_REF", f"{path}.settlement.claim_ref", "Candidate settlement must match lineage."))
            one_line = settlement.get("one_line")
            if not nonempty_string(one_line) or len(one_line.strip()) > 240:
                errors.append(issue("SETTLEMENT_LINE", f"{path}.settlement.one_line", "Bound settlement requires a one-line projection of at most 240 characters."))
            if settlement_state == "not_applicable":
                errors.append(issue("SETTLEMENT_STATE", f"{path}.settlement.state", "Bound settlement cannot be not_applicable."))

        quality = candidate.get("quality") if isinstance(candidate.get("quality"), dict) else {}
        calculated_score = 0.0
        low_dimension = False
        score_values: dict[str, float] = {}
        for key, weight in WEIGHTS.items():
            value = quality.get(key)
            if not finite_number(value) or not 0 <= float(value) <= 10:
                errors.append(issue("QUALITY_SCORE", f"{path}.quality.{key}", "Score must be 0-10."))
                value = 0
            score_values[key] = float(value)
            if score_values[key] < 7:
                low_dimension = True
            calculated_score += score_values[key] * weight
        reported = quality.get("weighted_score")
        if not finite_number(reported) or abs(float(reported) - calculated_score) > 0.05:
            errors.append(issue("QUALITY_WEIGHT", f"{path}.quality.weighted_score", f"Expected {calculated_score:.2f}."))
        expected_pass = calculated_score >= 8 and not low_dimension and score_values["claim_fidelity"] >= 8 and score_values["evidence_integrity"] >= 8
        expected_verdict = "pass" if expected_pass else "reject"
        if quality.get("verdict") != expected_verdict:
            errors.append(issue("QUALITY_VERDICT", f"{path}.quality.verdict", f"Expected {expected_verdict}."))
        if expected_pass and isinstance(candidate_id, str):
            passed_candidates.add(candidate_id)

    if len(settlement_projections) > 1:
        errors.append(issue("SETTLEMENT_DRIFT", "$.candidates", "All candidates must preserve one settlement projection."))
    if len(material_anchor_sets) > 1:
        errors.append(issue("EVIDENCE_ANCHOR_DRIFT", "$.candidates", "All candidates must preserve the same material evidence anchors."))

    selection = payload.get("selection") if isinstance(payload.get("selection"), dict) else {}
    require_exact_fields(
        selection,
        {"selected_candidate_id", "selection_receipt_ref", "content_confirmed", "settlement_confirmed", "settlement_confirmation_fields"},
        "$.selection",
        "SELECTION_FIELDS",
        errors,
    )
    selected_id = selection.get("selected_candidate_id")
    receipt_ref = selection.get("selection_receipt_ref")
    content_confirmed = selection.get("content_confirmed")
    settlement_confirmed = selection.get("settlement_confirmed")
    if not isinstance(content_confirmed, bool):
        errors.append(issue("SELECTION_CONFIRMATION", "$.selection.content_confirmed", "content_confirmed must be boolean."))
    if not isinstance(settlement_confirmed, bool):
        errors.append(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmed", "settlement_confirmed must be boolean."))
    confirmed_fields = string_set(selection.get("settlement_confirmation_fields"))
    if confirmed_fields is None or not confirmed_fields.issubset(SETTLEMENT_CONFIRMATION_FIELDS):
        errors.append(issue("SETTLEMENT_CONFIRMATION_FIELDS", "$.selection.settlement_confirmation_fields", "Settlement confirmation fields must be unique canonical field names."))
        confirmed_fields = set()

    if state == "ready_for_selection":
        if selected_id is not None or receipt_ref is not None or content_confirmed is not False or settlement_confirmed is not False or confirmed_fields:
            errors.append(issue("PRESELECTED", "$.selection", "Ready-for-selection output cannot preselect or confirm content or settlement."))
        if passed_candidates != ids:
            errors.append(issue("FAILED_CANDIDATE_EXPOSED", "$.candidates", "Every exposed candidate must pass quality gates."))
    elif state == "selected":
        if selected_id not in ids:
            errors.append(issue("SELECTED_ID", "$.selection.selected_candidate_id", "Selected candidate must resolve."))
        if content_confirmed is not True or not nonempty_string(receipt_ref):
            errors.append(issue("SELECTION_RECEIPT", "$.selection", "Selected content requires confirmation and a receipt ref."))
    if settlement_confirmed is True:
        if state != "selected":
            errors.append(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmed", "Settlement confirmation requires a selected candidate."))
        if settlement_ref is None:
            errors.append(issue("SETTLEMENT_CONFIRMATION", "$.lineage.settlement_claim_ref", "Settlement confirmation requires a bound claim."))
        if confirmed_fields != SETTLEMENT_CONFIRMATION_FIELDS:
            missing = sorted(SETTLEMENT_CONFIRMATION_FIELDS - confirmed_fields)
            errors.append(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmation_fields", f"Missing explicit settlement confirmations: {missing}."))
        if eligibility_status != "eligible" or computed_missing_eligibility:
            errors.append(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "Confirmed settlement requires complete eligible semantics."))
        if any(item != "frozen" for item in settlement_states) or len(settlement_states) != len(candidates):
            errors.append(issue("SETTLEMENT_STATE", "$.candidates", "Explicitly confirmed settlement must be frozen across all candidates."))
    else:
        if confirmed_fields:
            errors.append(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmation_fields", "Unconfirmed settlement cannot record confirmed fields."))
        if any(item == "frozen" for item in settlement_states):
            errors.append(issue("SETTLEMENT_PREMATURE_FREEZE", "$.candidates", "Settlement cannot be frozen before explicit candidate selection and settlement confirmation."))

    if state in {"ready_for_selection", "selected"}:
        expected_settlement_state = "not_applicable" if settlement_ref is None else "frozen" if settlement_confirmed is True else "needs_confirmation"
        if any(item != expected_settlement_state for item in settlement_states) or len(settlement_states) != len(candidates):
            errors.append(issue("SETTLEMENT_STATE", "$.candidates", f"Selectable output requires settlement state {expected_settlement_state!r} across all candidates."))

    quality_report = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    expected_decision = "blocked" if state == "blocked" else "selected" if state == "selected" else "ready_for_selection"
    if state != "draft" and quality_report.get("decision") != expected_decision:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", f"Expected {expected_decision}."))
    hard_failures = quality_report.get("hard_failures") if isinstance(quality_report.get("hard_failures"), list) else []
    if state == "blocked" and not hard_failures:
        errors.append(issue("BLOCK_REASON", "$.quality_report.hard_failures", "Blocked output needs a hard failure."))
    if state in {"ready_for_selection", "selected"} and hard_failures:
        errors.append(issue("READY_WITH_FAILURES", "$.quality_report.hard_failures", "Selectable output cannot contain hard failures."))

    return {"valid": not errors, "errors": errors, "warnings": warnings, "stats": stats}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--asset-root", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("READ", "$", str(exc))], "warnings": [], "stats": {}}, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload, args.asset_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
