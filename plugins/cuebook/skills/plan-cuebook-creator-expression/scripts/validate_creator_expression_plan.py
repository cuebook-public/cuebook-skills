#!/usr/bin/env python3
"""Validate CreatorExpressionPlanV1 artifacts and semantic-lock invariants."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


VISUAL_ROUTE_REGISTRY_PATH = Path(__file__).resolve().parents[1] / "references" / "visual-intent-route-registry-v1.json"
VISUAL_ROUTE_REGISTRY = json.loads(VISUAL_ROUTE_REGISTRY_PATH.read_text(encoding="utf-8"))
VISUAL_ROUTE_REGISTRY_SHA256 = "sha256:" + hashlib.sha256(VISUAL_ROUTE_REGISTRY_PATH.read_bytes()).hexdigest()


ROOT_FIELDS = {
    "schema_version",
    "plan_id",
    "revision",
    "state",
    "lineage",
    "meaning_fingerprint",
    "semantic_lock",
    "authorship_assistance",
    "narrative",
    "voice_spec",
    "data_requirements",
    "text_blueprint",
    "visual_plan",
    "settlement_eligibility",
    "source_style_firewall",
    "quality_report",
}
CORE_PRIMITIVES = {
    "reaction_test",
    "parallel_contrast",
    "category_reframe",
    "forced_flow_loop",
    "event_unwind",
    "expectation_ladder",
    "sentiment_witness",
    "binary_level",
    "derived_signal",
}
PRIMITIVE_KINDS = CORE_PRIMITIVES | {"analogy", "decision", "caveat"}
ALLOWED_TRANSFORMATIONS = {"compress", "reorder", "translate", "format", "visualize"}
FORBIDDEN_TRANSFORMATIONS = {
    "change_claim",
    "change_direction",
    "change_horizon",
    "add_trade",
    "add_settlement",
    "remove_caveat",
    "upgrade_certainty",
    "reassign_authorship",
}
ACTION_BY_TRADE_INTENT = {
    "none": "omit",
    "observe_only": "observe",
    "avoid": "avoid",
    "conditional": "conditional_trade",
    "explicit": "trade",
}
SETTLEMENT_REQUIREMENTS = {"metric", "operator", "threshold", "deadline", "authoritative_source"}
VIEWPOINT_VISUAL_GRAMMARS = {
    "reaction_test",
    "parallel_contrast",
    "category_reframe",
    "relative_value_trigger",
    "policy_pivot",
    "sentiment_witness",
    "event_unwind",
    "feedback_loop",
    "binary_level",
    "expectation_gap",
    "factor_rotation",
}
VISUAL_CANDIDATE_JOBS_BY_FAMILY = {
    family: set(job_ids)
    for family, job_ids in VISUAL_ROUTE_REGISTRY["candidate_families"].items()
}
VISUAL_CANDIDATE_JOBS = set().union(*VISUAL_CANDIDATE_JOBS_BY_FAMILY.values())
EVIDENCE_SHAPES = set(VISUAL_ROUTE_REGISTRY["evidence_shapes"])
QUERY_CAPABILITY_TOOLS = {
    capability["capability_id"]: set(capability["tool_ids"])
    for capability in VISUAL_ROUTE_REGISTRY["query_capabilities"]
}
VISUAL_ROUTE_SPECS = {
    route["route_id"]: {
        "skill_path_ids": route["skill_path_ids"],
        "primary_renderer_skill_id": route["primary_renderer_skill_id"],
        "detail_renderer_skill_id": route["detail_renderer_skill_id"],
    }
    for route in VISUAL_ROUTE_REGISTRY["routes"]
}
ARGUMENT_GRAMMARS = {"causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison", "price_timeline"}
DATA_KINDS = {"qualitative", "key_numbers", "series"}
QUERY_CAPABILITY_REQUEST_CLASSES = {
    capability["capability_id"]: set(capability["request_classes"])
    for capability in VISUAL_ROUTE_REGISTRY["query_capabilities"]
}
REQUEST_CLASSES = set().union(*QUERY_CAPABILITY_REQUEST_CLASSES.values())
DATA_KINDS_BY_REQUEST_CLASS = {
    "qualitative_evidence": {"qualitative", "key_numbers", "series"},
    "news_anchor": {"qualitative"},
    "official_event": {"qualitative"},
    "valuation_metric": {"key_numbers"},
    "comparison_metric": {"key_numbers", "series"},
    "market_series": {"series"},
    "price_level": {"key_numbers"},
    "settlement_reference": {"qualitative", "key_numbers"},
}
NON_DEGRADABLE_MATERIAL_CLASSES = {
    "news_anchor",
    "valuation_metric",
    "comparison_metric",
    "price_level",
    "settlement_reference",
}
EXPRESSION_SURFACES = {"text", "visual"}
CORE_PRIMITIVE_BY_VIEWPOINT = {
    "reaction_test": "reaction_test",
    "parallel_contrast": "parallel_contrast",
    "category_reframe": "category_reframe",
    "relative_value_trigger": "reaction_test",
    "policy_pivot": "forced_flow_loop",
    "sentiment_witness": "sentiment_witness",
    "event_unwind": "event_unwind",
    "feedback_loop": "forced_flow_loop",
    "binary_level": "binary_level",
    "expectation_gap": "expectation_ladder",
    "factor_rotation": "derived_signal",
}
DATA_MODES_BY_VISUAL = {
    "reaction_test": {"qualitative", "key_numbers", "series"},
    "parallel_contrast": {"qualitative", "key_numbers", "series"},
    "category_reframe": {"qualitative"},
    "relative_value_trigger": {"key_numbers", "series"},
    "policy_pivot": {"qualitative", "key_numbers"},
    "sentiment_witness": {"qualitative"},
    "event_unwind": {"qualitative", "series"},
    "feedback_loop": {"qualitative", "key_numbers", "series"},
    "binary_level": {"key_numbers", "series"},
    "expectation_gap": {"key_numbers"},
    "factor_rotation": {"key_numbers", "series"},
}
FALLBACK_SUBSTITUTIONS = {"invent_metric", "proxy_without_bridge", "anecdote_as_market_fact", "decorative_chart"}
BACKEND_TERMS = {
    "observed",
    "derived",
    "inferred",
    "provisional",
    "conditional",
    "confirmed",
    "pending",
    "unresolved",
    "已确认",
    "已计算",
    "推演",
    "待确认",
    "形成中",
    "交给市场验证",
    "等待确认",
}
REQUIRED_ANTI_AI_PHRASES = {"值得关注的是", "核心逻辑在于", "从机制上看"}
CUEBOOK_WORKFLOW_PATTERNS = (
    re.compile(r"cuebook.{0,40}(?:帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色|写(?:出|成)?|建议|让我|给我|替我|完成)", re.I),
    re.compile(r"(?:放进|用|通过|经过|借助|帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色).{0,40}cuebook", re.I),
    re.compile(r"\bcuebook\b.{0,48}\b(?:helped?|completed?|improved?|inspired?|generated?|drafted?|rewrote|suggested?)\b", re.I),
    re.compile(r"\b(?:used?|put|through|with)\b.{0,48}\bcuebook\b", re.I),
)
FIRST_PERSON_EXPERIENCE_PATTERNS = (
    re.compile(
        r"\bI\s+(?:saw|heard|bought|sold|lost|made|switched|rotated|held|owned|traded|experienced|remembered|discovered|found|realized|identified|noticed|learned|was\s+liquidated|got\s+liquidated|came\s+across)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bmy\s+(?:trade|position|portfolio|dashboard|loss|profit|experience)\b", re.IGNORECASE),
    re.compile(r"我(?:亲历|听说|看到|买了|卖了|亏了|赚了|切换|换仓|爆仓|被清算|持有|做了|发现|意识到|注意到|找到了|识别出)"),
    re.compile(r"我的(?:仓位|组合|交易|亏损|盈利|仪表盘|经历)"),
)
IMAGE_BUDGET_LIMITS = {
    "title_max": (8, 48),
    "subtitle_max": (16, 96),
    "node_label_max": (8, 32),
    "callout_max": (12, 56),
    "source_line_max": (24, 120),
    "max_nodes": (2, 7),
    "max_callouts": (0, 4),
    "total_max": (80, 320),
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def contains_cuebook_workflow_narration(text: str) -> bool:
    return any(pattern.search(text) for pattern in CUEBOOK_WORKFLOW_PATTERNS)


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_object(
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


def string_list(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> list[str]:
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
    if len(result) < minimum:
        errors.append(issue("STRING_MIN", path, f"Expected at least {minimum} item(s)."))
    if maximum is not None and len(result) > maximum:
        errors.append(issue("STRING_MAX", path, f"Expected at most {maximum} item(s)."))
    return result


def nullable_string(value: Any, path: str, errors: list[dict[str, str]]) -> str | None:
    if value is None:
        return None
    if not nonempty(value):
        errors.append(issue("NULLABLE_STRING", path, "Expected null or a non-empty string."))
        return None
    return value.strip()


def integer_range(value: Any, path: str, minimum: int, maximum: int, errors: list[dict[str, str]]) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        errors.append(issue("INTEGER_RANGE", path, f"Expected an integer from {minimum} to {maximum}."))
        return None
    return value


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


def valid_sha256(value: Any) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"sha256:[0-9a-f]{64}", value))


def calculate_fingerprint_hash(fingerprint: dict[str, Any]) -> str:
    canonical = dict(fingerprint)
    canonical.pop("fingerprint_sha256", None)
    serialized = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def calculate_visual_route_hash(visual_plan: dict[str, Any]) -> str:
    execution_route = dict(visual_plan.get("execution_route") or {})
    execution_route.pop("route_sha256", None)
    canonical = {
        "intent": visual_plan.get("intent"),
        "data_requirement_refs": visual_plan.get("data_requirement_refs"),
        "execution_route": execution_route,
    }
    serialized = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def contains_backend_term(value: str) -> str | None:
    lowered = value.lower()
    for term in sorted(BACKEND_TERMS, key=len, reverse=True):
        if term.isascii():
            if re.search(rf"(?<![A-Za-z]){re.escape(term.lower())}(?![A-Za-z])", lowered):
                return term
        elif term in value:
            return term
    return None


def contains_first_person_experience(value: str) -> bool:
    return any(pattern.search(value) for pattern in FIRST_PERSON_EXPERIENCE_PATTERNS)


def validate_quality(value: Any, state: Any, errors: list[dict[str, str]]) -> None:
    quality = validate_object(
        value,
        "$.quality_report",
        {"decision", "warnings", "hard_failures"},
        {"decision", "warnings", "hard_failures"},
        errors,
    )
    decision = quality.get("decision")
    warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    if state == "conditional" and (decision != "conditional" or not warnings):
        errors.append(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires conditional quality and at least one warning."))
    if state in {"ready", "frozen"} and (decision != "ready" or warnings or failures):
        errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."))
    if state == "blocked" and (decision != "blocked" or not failures):
        errors.append(issue("BLOCKED_QUALITY", "$.quality_report", "Blocked state requires blocked quality and at least one hard failure."))
    if failures and decision != "blocked":
        errors.append(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."))


def validate(
    payload: Any,
    *,
    expected_source_semantics_hash: str | None = None,
) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}

    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "creator-expression-plan-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-expression-plan-v1."))
    if not re.fullmatch(r"CEXP_[A-Za-z0-9_:-]{8,}", str(payload.get("plan_id") or "")):
        errors.append(issue("PLAN_ID", "$.plan_id", "Invalid plan ID."))
    integer_range(payload.get("revision"), "$.revision", 1, 1_000_000, errors)
    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen", "blocked"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage_fields = {
        "input_artifact_refs",
        "market_view_semantics_ref",
        "research_pack_ref",
        "trading_thesis_ref",
        "trade_logic_profile_ref",
        "profile_ref",
        "source_refs",
        "decision_cutoff_at",
    }
    lineage = validate_object(payload.get("lineage"), "$.lineage", lineage_fields, lineage_fields, errors)
    input_refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, minimum=1)
    semantics_ref = lineage.get("market_view_semantics_ref")
    if not nonempty(semantics_ref):
        errors.append(issue("SEMANTICS_REF", "$.lineage.market_view_semantics_ref", "MarketViewSemanticsV1 ref is required."))
    elif semantics_ref not in input_refs:
        errors.append(issue("LINEAGE_REF", "$.lineage.market_view_semantics_ref", "Market semantics ref must appear in input_artifact_refs."))
    for key in ("research_pack_ref", "trading_thesis_ref", "trade_logic_profile_ref", "profile_ref"):
        ref = nullable_string(lineage.get(key), f"$.lineage.{key}", errors)
        if ref is not None and ref not in input_refs:
            errors.append(issue("LINEAGE_REF", f"$.lineage.{key}", "Named artifact ref must appear in input_artifact_refs."))
    source_refs = string_list(lineage.get("source_refs"), "$.lineage.source_refs", errors)
    parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    fingerprint_fields = {
        "source_semantics_sha256",
        "canonical_claim",
        "claim_type",
        "primary_subject",
        "comparator",
        "direction",
        "horizon",
        "mechanism",
        "trade_intent",
        "settlement_intent",
        "action",
        "claim_refs",
        "supporting_fact_refs",
        "required_caveats",
        "creator_owned_experience_refs",
        "fingerprint_sha256",
    }
    fingerprint = validate_object(
        payload.get("meaning_fingerprint"),
        "$.meaning_fingerprint",
        fingerprint_fields,
        fingerprint_fields,
        errors,
    )
    source_hash = fingerprint.get("source_semantics_sha256")
    if not valid_sha256(source_hash):
        errors.append(issue("SOURCE_SEMANTICS_HASH", "$.meaning_fingerprint.source_semantics_sha256", "Expected sha256:<64 lowercase hex characters>."))
    if expected_source_semantics_hash is not None and source_hash != expected_source_semantics_hash:
        errors.append(issue("SOURCE_SEMANTICS_MISMATCH", "$.meaning_fingerprint.source_semantics_sha256", "Source semantics hash does not match the expected input hash."))
    for key, maximum in (("canonical_claim", 500), ("mechanism", 500)):
        value = fingerprint.get(key)
        if not nonempty(value) or len(str(value or "")) > maximum:
            errors.append(issue("FINGERPRINT_TEXT", f"$.meaning_fingerprint.{key}", f"Expected one to {maximum} characters."))
    if not nonempty(fingerprint.get("primary_subject")):
        errors.append(issue("PRIMARY_SUBJECT", "$.meaning_fingerprint.primary_subject", "Primary subject is required."))
    nullable_string(fingerprint.get("comparator"), "$.meaning_fingerprint.comparator", errors)
    nullable_string(fingerprint.get("horizon"), "$.meaning_fingerprint.horizon", errors)
    if fingerprint.get("claim_type") not in {"observation", "explanation", "conditional_view", "directional_view", "relative_view", "sentiment_evidence"}:
        errors.append(issue("CLAIM_TYPE", "$.meaning_fingerprint.claim_type", "Unsupported claim type."))
    if fingerprint.get("direction") not in {"none", "bullish", "bearish", "outperform", "underperform", "range", "neutral", "custom"}:
        errors.append(issue("DIRECTION", "$.meaning_fingerprint.direction", "Unsupported direction."))
    trade_intent = fingerprint.get("trade_intent")
    if trade_intent not in ACTION_BY_TRADE_INTENT:
        errors.append(issue("TRADE_INTENT", "$.meaning_fingerprint.trade_intent", "Unsupported trade intent."))
    settlement_intent = fingerprint.get("settlement_intent")
    if settlement_intent not in {"none", "candidate", "explicit"}:
        errors.append(issue("SETTLEMENT_INTENT", "$.meaning_fingerprint.settlement_intent", "Unsupported settlement intent."))
    action = nullable_string(fingerprint.get("action"), "$.meaning_fingerprint.action", errors)
    if trade_intent == "none" and action is not None:
        errors.append(issue("SOURCE_TRADE_ABSENT", "$.meaning_fingerprint.action", "No action is allowed when source trade intent is none."))
    if trade_intent in {"observe_only", "avoid", "conditional", "explicit"} and action is None:
        errors.append(issue("SOURCE_ACTION_REQUIRED", "$.meaning_fingerprint.action", "Source trade intent requires its preserved action."))
    claim_refs = string_list(fingerprint.get("claim_refs"), "$.meaning_fingerprint.claim_refs", errors, minimum=1)
    fact_refs = string_list(fingerprint.get("supporting_fact_refs"), "$.meaning_fingerprint.supporting_fact_refs", errors)
    string_list(fingerprint.get("required_caveats"), "$.meaning_fingerprint.required_caveats", errors, minimum=1)
    owned_experience_refs = string_list(
        fingerprint.get("creator_owned_experience_refs"),
        "$.meaning_fingerprint.creator_owned_experience_refs",
        errors,
    )
    if any(ref not in claim_refs for ref in owned_experience_refs):
        errors.append(issue("EXPERIENCE_LINEAGE", "$.meaning_fingerprint.creator_owned_experience_refs", "Creator-owned experience refs must resolve to semantic claim refs."))
    fingerprint_hash = fingerprint.get("fingerprint_sha256")
    if not valid_sha256(fingerprint_hash):
        errors.append(issue("FINGERPRINT_HASH", "$.meaning_fingerprint.fingerprint_sha256", "Expected sha256:<64 lowercase hex characters>."))
    elif fingerprint_hash != calculate_fingerprint_hash(fingerprint):
        errors.append(issue("FINGERPRINT_HASH_MISMATCH", "$.meaning_fingerprint.fingerprint_sha256", "Fingerprint hash does not match the canonical meaning fingerprint."))

    lock_fields = {"locked", "authorship_locked", "fingerprint_sha256", "allowed_transformations", "forbidden_transformations", "downstream_verification_required"}
    lock = validate_object(payload.get("semantic_lock"), "$.semantic_lock", lock_fields, lock_fields, errors)
    if lock.get("locked") is not True or lock.get("authorship_locked") is not True or lock.get("downstream_verification_required") is not True:
        errors.append(issue("SEMANTIC_LOCK", "$.semantic_lock", "Meaning lock, authorship lock, and downstream verification must all be true."))
    if lock.get("fingerprint_sha256") != fingerprint_hash:
        errors.append(issue("LOCK_HASH", "$.semantic_lock.fingerprint_sha256", "Semantic lock must carry the meaning fingerprint hash."))
    allowed_transformations = set(string_list(lock.get("allowed_transformations"), "$.semantic_lock.allowed_transformations", errors, minimum=1))
    forbidden_transformations = set(string_list(lock.get("forbidden_transformations"), "$.semantic_lock.forbidden_transformations", errors, minimum=1))
    if allowed_transformations != ALLOWED_TRANSFORMATIONS:
        errors.append(issue("LOCK_ALLOWED_TRANSFORMS", "$.semantic_lock.allowed_transformations", "Use the complete safe transformation set."))
    if forbidden_transformations != FORBIDDEN_TRANSFORMATIONS:
        errors.append(issue("LOCK_FORBIDDEN_TRANSFORMS", "$.semantic_lock.forbidden_transformations", "Use the complete forbidden transformation set."))

    authorship_fields = {
        "mode",
        "creator_seed",
        "source_view_owner",
        "cuebook_additions",
        "creator_accepted_addition_ids",
        "creator_rejected_addition_ids",
        "idea_delta",
        "public_attribution_required",
        "public_attribution_line",
    }
    authorship = validate_object(
        payload.get("authorship_assistance"),
        "$.authorship_assistance",
        authorship_fields,
        authorship_fields,
        errors,
    )
    authorship_mode = authorship.get("mode")
    if authorship_mode not in {"creator_original", "cuebook_assisted", "source_transformation"}:
        errors.append(issue("AUTHORSHIP_MODE", "$.authorship_assistance.mode", "Unsupported authorship mode."))

    seed_fields = {"text", "preserved", "claim_refs"}
    seed = validate_object(
        authorship.get("creator_seed"),
        "$.authorship_assistance.creator_seed",
        seed_fields,
        seed_fields,
        errors,
    )
    seed_text = nullable_string(seed.get("text"), "$.authorship_assistance.creator_seed.text", errors)
    if seed_text is not None and len(seed_text) > 2000:
        errors.append(issue("CREATOR_SEED_LENGTH", "$.authorship_assistance.creator_seed.text", "Creator seed must not exceed 2000 characters."))
    seed_refs = string_list(seed.get("claim_refs"), "$.authorship_assistance.creator_seed.claim_refs", errors)
    if any(ref not in claim_refs for ref in seed_refs):
        errors.append(issue("CREATOR_SEED_LINEAGE", "$.authorship_assistance.creator_seed.claim_refs", "Creator seed refs must resolve to semantic claim refs."))
    if seed_text is None:
        if seed.get("preserved") is not False or seed_refs:
            errors.append(issue("CREATOR_SEED_EMPTY", "$.authorship_assistance.creator_seed", "An absent creator seed must be unpreserved and have no claim refs."))
    elif seed.get("preserved") is not True or not seed_refs:
        errors.append(issue("CREATOR_SEED_PRESERVATION", "$.authorship_assistance.creator_seed", "A creator seed must be preserved and linked to at least one semantic claim."))

    owner_fields = {"owner_type", "owner_ref", "public_label"}
    owner = validate_object(
        authorship.get("source_view_owner"),
        "$.authorship_assistance.source_view_owner",
        owner_fields,
        owner_fields,
        errors,
    )
    owner_type = owner.get("owner_type")
    if owner_type not in {"current_creator", "external_creator", "mixed"}:
        errors.append(issue("VIEW_OWNER_TYPE", "$.authorship_assistance.source_view_owner.owner_type", "Unsupported source-view owner type."))
    if not nonempty(owner.get("owner_ref")):
        errors.append(issue("VIEW_OWNER_REF", "$.authorship_assistance.source_view_owner.owner_ref", "Source-view owner ref is required."))
    owner_public_label = owner.get("public_label")
    if not nonempty(owner_public_label):
        errors.append(issue("VIEW_OWNER_LABEL", "$.authorship_assistance.source_view_owner.public_label", "Source-view owner public label is required."))

    additions = authorship.get("cuebook_additions")
    if not isinstance(additions, list) or len(additions) > 12:
        errors.append(issue("CUEBOOK_ADDITIONS", "$.authorship_assistance.cuebook_additions", "Expected an array of at most 12 Cuebook additions."))
        additions = []
    addition_fields = {"id", "kind", "summary", "support_refs"}
    addition_ids: list[str] = []
    allowed_addition_refs = set(claim_refs) | set(fact_refs) | set(input_refs) | set(source_refs)
    for index, raw_addition in enumerate(additions):
        path = f"$.authorship_assistance.cuebook_additions[{index}]"
        addition = validate_object(raw_addition, path, addition_fields, addition_fields, errors)
        addition_id = addition.get("id")
        if not isinstance(addition_id, str) or not re.fullmatch(r"CA[1-9][0-9]*", addition_id):
            errors.append(issue("CUEBOOK_ADDITION_ID", f"{path}.id", "Invalid Cuebook addition ID."))
        else:
            addition_ids.append(addition_id)
        if addition.get("kind") not in {"evidence", "connection", "countercase", "rule"}:
            errors.append(issue("CUEBOOK_ADDITION_KIND", f"{path}.kind", "Unsupported Cuebook addition kind."))
        if not nonempty(addition.get("summary")) or len(str(addition.get("summary") or "")) > 300:
            errors.append(issue("CUEBOOK_ADDITION_SUMMARY", f"{path}.summary", "Addition summary must contain one to 300 characters."))
        support_refs = string_list(addition.get("support_refs"), f"{path}.support_refs", errors, minimum=1)
        if any(ref not in allowed_addition_refs for ref in support_refs):
            errors.append(issue("CUEBOOK_ADDITION_LINEAGE", f"{path}.support_refs", "Addition refs must resolve to plan lineage or fingerprint refs."))
    if len(addition_ids) != len(set(addition_ids)):
        errors.append(issue("CUEBOOK_ADDITION_UNIQUE", "$.authorship_assistance.cuebook_additions", "Cuebook addition IDs must be unique."))
    accepted_ids = string_list(
        authorship.get("creator_accepted_addition_ids"),
        "$.authorship_assistance.creator_accepted_addition_ids",
        errors,
    )
    rejected_ids = string_list(
        authorship.get("creator_rejected_addition_ids"),
        "$.authorship_assistance.creator_rejected_addition_ids",
        errors,
    )
    if set(accepted_ids) & set(rejected_ids):
        errors.append(issue("ADDITION_DECISION_OVERLAP", "$.authorship_assistance", "Accepted and rejected addition IDs must be disjoint."))
    if set(accepted_ids) | set(rejected_ids) != set(addition_ids):
        errors.append(issue("ADDITION_DECISION_COVERAGE", "$.authorship_assistance", "Accepted and rejected IDs must cover every Cuebook addition exactly once."))
    idea_delta = nullable_string(authorship.get("idea_delta"), "$.authorship_assistance.idea_delta", errors)
    if idea_delta is not None and len(idea_delta) > 1000:
        errors.append(issue("IDEA_DELTA_LENGTH", "$.authorship_assistance.idea_delta", "Idea delta must not exceed 1000 characters."))
    attribution_required = authorship.get("public_attribution_required")
    if not isinstance(attribution_required, bool):
        errors.append(issue("PUBLIC_ATTRIBUTION_FLAG", "$.authorship_assistance.public_attribution_required", "Public attribution flag must be boolean."))
    attribution_line = nullable_string(authorship.get("public_attribution_line"), "$.authorship_assistance.public_attribution_line", errors)
    if attribution_line is not None and len(attribution_line) > 280:
        errors.append(issue("PUBLIC_ATTRIBUTION_LENGTH", "$.authorship_assistance.public_attribution_line", "Public attribution line must not exceed 280 characters."))

    if authorship_mode == "creator_original":
        if seed_text is None or owner_type != "current_creator" or additions or accepted_ids or rejected_ids or idea_delta is not None:
            errors.append(issue("CREATOR_ORIGINAL_CONTRACT", "$.authorship_assistance", "Creator-original mode requires a current-creator seed and no Cuebook idea additions or delta."))
        if attribution_required is not False or attribution_line is not None:
            errors.append(issue("CREATOR_ORIGINAL_ATTRIBUTION", "$.authorship_assistance", "Creator-original mode does not require assistance attribution."))
    elif authorship_mode == "cuebook_assisted":
        if seed_text is None or owner_type not in {"current_creator", "mixed"} or not additions or not accepted_ids or idea_delta is None:
            errors.append(issue("CUEBOOK_ASSISTED_CONTRACT", "$.authorship_assistance", "Cuebook-assisted mode requires a creator seed, creator-owned or mixed view, accepted additions, and an idea delta."))
        if attribution_required is not False or attribution_line is not None:
            errors.append(issue("CUEBOOK_ASSISTANCE_INTERNAL", "$.authorship_assistance", "Cuebook-assisted mode keeps assistance provenance internal and carries no public assistance line."))
    elif authorship_mode == "source_transformation":
        if owner_type != "external_creator" or idea_delta is None:
            errors.append(issue("SOURCE_TRANSFORMATION_CONTRACT", "$.authorship_assistance", "Source-transformation mode requires an external source-view owner and an original idea delta."))
        if attribution_required is not True or attribution_line is None:
            errors.append(issue("SOURCE_TRANSFORMATION_ATTRIBUTION", "$.authorship_assistance", "Source-transformation mode requires public source attribution."))
        elif nonempty(owner_public_label) and owner_public_label.lower() not in attribution_line.lower():
            errors.append(issue("SOURCE_OWNER_ATTRIBUTION", "$.authorship_assistance.public_attribution_line", "Source transformation attribution must name the external view owner."))
        if trade_intent != "none" or settlement_intent != "none":
            errors.append(issue("SOURCE_OWNER_RELABEL", "$.meaning_fingerprint", "An externally owned source transformation cannot become the current creator's trade or settlement."))

    public_plan_text: list[tuple[str, str]] = []
    if attribution_line is not None:
        public_plan_text.append(("$.authorship_assistance.public_attribution_line", attribution_line))

    narrative_fields = {"primary_engine", "frame", "primitives"}
    narrative = validate_object(payload.get("narrative"), "$.narrative", narrative_fields, narrative_fields, errors)
    primary_engine = narrative.get("primary_engine")
    if primary_engine not in VIEWPOINT_VISUAL_GRAMMARS:
        errors.append(issue("PRIMARY_ENGINE", "$.narrative.primary_engine", "Unsupported unified text-and-visual engine."))
    if not nonempty(narrative.get("frame")) or len(str(narrative.get("frame") or "")) > 300:
        errors.append(issue("NARRATIVE_FRAME", "$.narrative.frame", "Frame must contain one to 300 characters."))
    primitives = narrative.get("primitives")
    primitive_kinds: list[str] = []
    if not isinstance(primitives, list) or not 2 <= len(primitives) <= 8:
        errors.append(issue("PRIMITIVES", "$.narrative.primitives", "Expected two to eight narrative primitives."))
        primitives = []
    primitive_ids: list[str] = []
    primitive_fields = {"id", "kind", "purpose", "semantic_claim_refs", "analogy"}
    for index, raw_primitive in enumerate(primitives):
        path = f"$.narrative.primitives[{index}]"
        primitive = validate_object(raw_primitive, path, primitive_fields, primitive_fields, errors)
        primitive_id = primitive.get("id")
        if not isinstance(primitive_id, str) or not re.fullmatch(r"P[1-9][0-9]*", primitive_id):
            errors.append(issue("PRIMITIVE_ID", f"{path}.id", "Invalid primitive ID."))
        else:
            primitive_ids.append(primitive_id)
        kind = primitive.get("kind")
        if kind not in PRIMITIVE_KINDS:
            errors.append(issue("PRIMITIVE_KIND", f"{path}.kind", "Unsupported primitive kind."))
        else:
            primitive_kinds.append(kind)
        if not nonempty(primitive.get("purpose")) or len(str(primitive.get("purpose") or "")) > 240:
            errors.append(issue("PRIMITIVE_PURPOSE", f"{path}.purpose", "Purpose must contain one to 240 characters."))
        refs = string_list(primitive.get("semantic_claim_refs"), f"{path}.semantic_claim_refs", errors, minimum=1)
        if any(ref not in claim_refs for ref in refs):
            errors.append(issue("PRIMITIVE_LINEAGE", f"{path}.semantic_claim_refs", "Primitive refs must resolve to semantic claim refs."))
        analogy = primitive.get("analogy")
        if kind == "analogy":
            analogy_fields = {"source_domain", "target_domain", "mapping", "breakpoint"}
            analogy_object = validate_object(analogy, f"{path}.analogy", analogy_fields, analogy_fields, errors)
            for key in ("source_domain", "target_domain", "breakpoint"):
                if not nonempty(analogy_object.get(key)):
                    errors.append(issue("ANALOGY_FIELD", f"{path}.analogy.{key}", "Analogy field is required."))
            mapping = analogy_object.get("mapping")
            if not isinstance(mapping, list) or not 1 <= len(mapping) <= 5:
                errors.append(issue("ANALOGY_MAPPING", f"{path}.analogy.mapping", "Analogy requires one to five mappings."))
            else:
                for mapping_index, raw_mapping in enumerate(mapping):
                    mapping_path = f"{path}.analogy.mapping[{mapping_index}]"
                    mapping_object = validate_object(
                        raw_mapping,
                        mapping_path,
                        {"source_element", "target_element"},
                        {"source_element", "target_element"},
                        errors,
                    )
                    if not nonempty(mapping_object.get("source_element")) or not nonempty(mapping_object.get("target_element")):
                        errors.append(issue("ANALOGY_MAPPING", mapping_path, "Both sides of an analogy mapping are required."))
        elif analogy is not None:
            errors.append(issue("ANALOGY_LEAK", f"{path}.analogy", "Only analogy primitives may carry analogy metadata."))
    if len(primitive_ids) != len(set(primitive_ids)):
        errors.append(issue("PRIMITIVE_ID_UNIQUE", "$.narrative.primitives", "Primitive IDs must be unique."))
    if len(primitive_kinds) != len(set(primitive_kinds)):
        errors.append(issue("PRIMITIVE_KIND_UNIQUE", "$.narrative.primitives", "Use no more than one primitive of each kind."))
    expected_core_primitive = CORE_PRIMITIVE_BY_VIEWPOINT.get(primary_engine)
    if primitive_kinds and primitive_kinds[0] != expected_core_primitive:
        errors.append(issue("PRIMARY_ENGINE_ORDER", "$.narrative.primitives[0].kind", "The unified engine's core primitive must appear first."))
    if "caveat" not in primitive_kinds:
        errors.append(issue("CAVEAT_PRIMITIVE", "$.narrative.primitives", "Every plan requires a caveat primitive."))
    if trade_intent == "none" and "decision" in primitive_kinds:
        errors.append(issue("SOURCE_TRADE_ABSENT", "$.narrative.primitives", "Decision primitive is forbidden when source trade intent is none."))
    if trade_intent in {"observe_only", "avoid", "conditional", "explicit"} and "decision" not in primitive_kinds:
        errors.append(issue("DECISION_PRIMITIVE", "$.narrative.primitives", "Preserved source action requires a decision primitive."))

    voice_fields = {
        "language",
        "register",
        "energy",
        "conviction",
        "technicality",
        "emotionality",
        "compression",
        "sentence_rhythm",
        "humor",
        "first_person_stance",
        "first_person_experience",
        "technical_terms",
        "rhetorical_devices",
        "profile_rule_refs",
        "anti_ai_language",
    }
    voice = validate_object(payload.get("voice_spec"), "$.voice_spec", voice_fields, voice_fields, errors)
    if not nonempty(voice.get("language")):
        errors.append(issue("VOICE_LANGUAGE", "$.voice_spec.language", "Voice language is required."))
    enums = (
        ("register", {"desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"}),
        ("sentence_rhythm", {"short", "mixed", "measured"}),
        ("humor", {"none", "light", "dry", "meme"}),
        ("first_person_stance", {"avoid", "allowed", "prefer"}),
        ("first_person_experience", {"forbidden", "preserve_creator_owned_only"}),
        ("technical_terms", {"plain", "define_once", "desk_native"}),
    )
    for key, allowed in enums:
        if voice.get(key) not in allowed:
            errors.append(issue("VOICE_ENUM", f"$.voice_spec.{key}", "Unsupported VoiceSpec value."))
    for key in ("energy", "conviction", "technicality", "emotionality", "compression"):
        integer_range(voice.get(key), f"$.voice_spec.{key}", 1, 5, errors)
    rhetorical_devices = string_list(voice.get("rhetorical_devices"), "$.voice_spec.rhetorical_devices", errors, maximum=4)
    if any(item not in {"contrast", "paradox", "question", "repetition", "analogy", "understatement", "imperative"} for item in rhetorical_devices):
        errors.append(issue("RHETORICAL_DEVICE", "$.voice_spec.rhetorical_devices", "Unsupported rhetorical device."))
    if "analogy" in primitive_kinds and "analogy" not in rhetorical_devices:
        errors.append(issue("ANALOGY_VOICE", "$.voice_spec.rhetorical_devices", "An analogy primitive must be enabled in VoiceSpec."))
    profile_rule_refs = string_list(voice.get("profile_rule_refs"), "$.voice_spec.profile_rule_refs", errors)
    if profile_rule_refs and lineage.get("profile_ref") is None:
        errors.append(issue("PROFILE_LINEAGE", "$.voice_spec.profile_rule_refs", "Profile rule refs require a ProfileV1 lineage ref."))
    anti_ai_fields = {"enabled", "banned_stock_phrases", "max_not_a_but_b_frames", "repeated_openings_allowed"}
    anti_ai = validate_object(
        voice.get("anti_ai_language"),
        "$.voice_spec.anti_ai_language",
        anti_ai_fields,
        anti_ai_fields,
        errors,
    )
    if anti_ai.get("enabled") is not True:
        errors.append(issue("ANTI_AI_LANGUAGE", "$.voice_spec.anti_ai_language.enabled", "Anti-AI-language controls must be enabled."))
    banned_stock_phrases = string_list(
        anti_ai.get("banned_stock_phrases"),
        "$.voice_spec.anti_ai_language.banned_stock_phrases",
        errors,
        minimum=3,
    )
    if not REQUIRED_ANTI_AI_PHRASES.issubset(set(banned_stock_phrases)):
        errors.append(issue("ANTI_AI_PHRASE_SET", "$.voice_spec.anti_ai_language.banned_stock_phrases", "Banned phrases must include the required Cuebook stock-language set."))
    if anti_ai.get("max_not_a_but_b_frames") != 1:
        errors.append(issue("ANTI_AI_REFRAME_LIMIT", "$.voice_spec.anti_ai_language.max_not_a_but_b_frames", "Allow at most one 不是 A 而是 B frame."))
    if anti_ai.get("repeated_openings_allowed") is not False:
        errors.append(issue("ANTI_AI_OPENINGS", "$.voice_spec.anti_ai_language.repeated_openings_allowed", "Repeated stock openings must be disabled."))

    allowed_semantic_refs = set(claim_refs) | set(fact_refs)
    data_requirements = payload.get("data_requirements")
    if not isinstance(data_requirements, list) or not 1 <= len(data_requirements) <= 16:
        errors.append(issue("DATA_REQUIREMENTS", "$.data_requirements", "Expected one to 16 expression data requirements."))
        data_requirements = []
    data_fields = {
        "id",
        "kind",
        "request_class",
        "purpose",
        "required",
        "material_to_claim",
        "expression_surfaces",
        "status",
        "fact_refs",
        "source_refs",
    }
    data_requirements_by_id: dict[str, dict[str, Any]] = {}
    missing_required_ids: set[str] = set()
    missing_material_ids: set[str] = set()
    nondegradable_missing_ids: set[str] = set()
    for index, raw_requirement in enumerate(data_requirements):
        path = f"$.data_requirements[{index}]"
        requirement = validate_object(raw_requirement, path, data_fields, data_fields, errors)
        requirement_id = requirement.get("id")
        if not isinstance(requirement_id, str) or not re.fullmatch(r"D[1-9][0-9]*", requirement_id):
            errors.append(issue("DATA_ID", f"{path}.id", "Invalid data requirement ID."))
            requirement_id = None
        elif requirement_id in data_requirements_by_id:
            errors.append(issue("DATA_ID_UNIQUE", f"{path}.id", "Data requirement IDs must be unique."))
        else:
            data_requirements_by_id[requirement_id] = requirement

        kind = requirement.get("kind")
        if kind not in DATA_KINDS:
            errors.append(issue("DATA_KIND", f"{path}.kind", "Unsupported data requirement kind."))
        request_class = requirement.get("request_class")
        if request_class not in REQUEST_CLASSES:
            errors.append(issue("DATA_REQUEST_CLASS", f"{path}.request_class", "Unsupported data request class."))
        elif kind in DATA_KINDS and kind not in DATA_KINDS_BY_REQUEST_CLASS[request_class]:
            errors.append(issue("REQUEST_CLASS_KIND", f"{path}.kind", f"{request_class} cannot be requested as {kind}."))
        if not nonempty(requirement.get("purpose")) or len(str(requirement.get("purpose") or "")) > 240:
            errors.append(issue("DATA_PURPOSE", f"{path}.purpose", "Data purpose must contain one to 240 characters."))

        required = requirement.get("required")
        if not isinstance(required, bool):
            errors.append(issue("DATA_REQUIRED", f"{path}.required", "Required must be boolean."))
        material_to_claim = requirement.get("material_to_claim")
        if not isinstance(material_to_claim, bool):
            errors.append(issue("DATA_MATERIALITY", f"{path}.material_to_claim", "Material-to-claim must be boolean."))
        elif material_to_claim and required is not True:
            errors.append(issue("DATA_MATERIAL_REQUIRED", path, "A material creator premise must be a required data request."))

        surfaces = set(
            string_list(
                requirement.get("expression_surfaces"),
                f"{path}.expression_surfaces",
                errors,
                minimum=1,
                maximum=2,
            )
        )
        if not surfaces.issubset(EXPRESSION_SURFACES):
            errors.append(issue("DATA_SURFACE", f"{path}.expression_surfaces", "Expression surfaces must be text and/or visual."))

        status = requirement.get("status")
        if status not in {"available", "missing"}:
            errors.append(issue("DATA_STATUS", f"{path}.status", "Unsupported data status."))
        requirement_fact_refs = string_list(requirement.get("fact_refs"), f"{path}.fact_refs", errors)
        requirement_source_refs = string_list(requirement.get("source_refs"), f"{path}.source_refs", errors)
        if status == "available":
            if not requirement_fact_refs or not requirement_source_refs:
                errors.append(issue("AVAILABLE_DATA_LINEAGE", path, "Available expression data requires fact and source refs."))
            if any(ref not in allowed_semantic_refs for ref in requirement_fact_refs):
                errors.append(issue("DATA_FACT_LINEAGE", f"{path}.fact_refs", "Data fact refs must resolve to fingerprint claims or supporting facts."))
            if any(ref not in source_refs for ref in requirement_source_refs):
                errors.append(issue("DATA_SOURCE_LINEAGE", f"{path}.source_refs", "Data source refs must resolve to lineage source refs."))
        elif status == "missing":
            if requirement_fact_refs or requirement_source_refs:
                errors.append(issue("MISSING_DATA_LINEAGE", path, "Missing data must not carry invented fact or source refs."))
            if requirement_id and required is True:
                missing_required_ids.add(requirement_id)
                if material_to_claim is True:
                    missing_material_ids.add(requirement_id)
                    if request_class in NON_DEGRADABLE_MATERIAL_CLASSES:
                        nondegradable_missing_ids.add(requirement_id)

    text_fields = {"format", "public_tags", "max_total_characters", "data_requirement_refs", "hook", "proof", "mechanism", "action", "caveat", "close"}
    text_blueprint = validate_object(payload.get("text_blueprint"), "$.text_blueprint", text_fields, text_fields, errors)
    if text_blueprint.get("format") not in {"channel_neutral", "short_post", "thread", "memo", "article", "caption"}:
        errors.append(issue("TEXT_FORMAT", "$.text_blueprint.format", "Unsupported text format."))
    tags = string_list(text_blueprint.get("public_tags"), "$.text_blueprint.public_tags", errors, minimum=2, maximum=4)
    for index, tag in enumerate(tags):
        if len(tag) > 24:
            errors.append(issue("TAG_LENGTH", f"$.text_blueprint.public_tags[{index}]", "Public tags must not exceed 24 characters."))
    max_total = integer_range(text_blueprint.get("max_total_characters"), "$.text_blueprint.max_total_characters", 120, 12000, errors)
    text_requirement_refs = set(
        string_list(text_blueprint.get("data_requirement_refs"), "$.text_blueprint.data_requirement_refs", errors)
    )
    unknown_text_requirement_refs = text_requirement_refs - set(data_requirements_by_id)
    if unknown_text_requirement_refs:
        errors.append(issue("TEXT_DATA_REQUIREMENT_REF", "$.text_blueprint.data_requirement_refs", f"Unknown data requirement refs: {sorted(unknown_text_requirement_refs)}."))
    expected_text_requirement_refs = {
        requirement_id
        for requirement_id, requirement in data_requirements_by_id.items()
        if "text" in requirement.get("expression_surfaces", [])
    }
    if text_requirement_refs != expected_text_requirement_refs:
        errors.append(issue("TEXT_DATA_REQUIREMENT_COVERAGE", "$.text_blueprint.data_requirement_refs", "Text blueprint refs must exactly match requirements routed to text."))
    section_fields = {"mode", "purpose", "semantic_refs", "max_characters", "omission_reason"}
    action_fields = section_fields | {"action_kind"}
    allocated_characters = 0
    for section_name in ("hook", "proof", "mechanism", "caveat", "close"):
        path = f"$.text_blueprint.{section_name}"
        section = validate_object(text_blueprint.get(section_name), path, section_fields, section_fields, errors)
        mode = section.get("mode")
        purpose = nullable_string(section.get("purpose"), f"{path}.purpose", errors)
        refs = string_list(section.get("semantic_refs"), f"{path}.semantic_refs", errors)
        max_chars = integer_range(section.get("max_characters"), f"{path}.max_characters", 0, 1200, errors)
        omission_reason = nullable_string(section.get("omission_reason"), f"{path}.omission_reason", errors)
        if mode != "include":
            errors.append(issue("REQUIRED_TEXT_SECTION", f"{path}.mode", f"{section_name} must be included."))
        if purpose is None or not refs or max_chars in {None, 0} or omission_reason is not None:
            errors.append(issue("TEXT_SECTION_SHAPE", path, "Included text sections require purpose, refs, a positive budget, and no omission reason."))
        if any(ref not in allowed_semantic_refs for ref in refs):
            errors.append(issue("TEXT_LINEAGE", f"{path}.semantic_refs", "Text refs must resolve to semantic claims or supporting facts."))
        if max_chars:
            allocated_characters += max_chars
        if purpose:
            public_plan_text.append((f"{path}.purpose", purpose))

    action_path = "$.text_blueprint.action"
    action_section = validate_object(text_blueprint.get("action"), action_path, action_fields, action_fields, errors)
    action_mode = action_section.get("mode")
    action_kind = action_section.get("action_kind")
    action_purpose = nullable_string(action_section.get("purpose"), f"{action_path}.purpose", errors)
    action_refs = string_list(action_section.get("semantic_refs"), f"{action_path}.semantic_refs", errors)
    action_max = integer_range(action_section.get("max_characters"), f"{action_path}.max_characters", 0, 1200, errors)
    action_omission = nullable_string(action_section.get("omission_reason"), f"{action_path}.omission_reason", errors)
    expected_action_kind = ACTION_BY_TRADE_INTENT.get(trade_intent)
    if action_kind != expected_action_kind:
        errors.append(issue("ACTION_INTENT_MISMATCH", f"{action_path}.action_kind", "Action kind must map exactly from source trade intent."))
    if trade_intent == "none":
        if not (
            action_mode == "omit"
            and action_kind == "omit"
            and action_purpose is None
            and not action_refs
            and action_max == 0
            and action_omission == "source_has_no_trade_intent"
        ):
            errors.append(issue("NO_TRADE_ACTION", action_path, "No-trade source intent requires a fully omitted action slot."))
    else:
        if not (
            action_mode == "include"
            and action_purpose is not None
            and action_refs
            and action_max not in {None, 0}
            and action_omission is None
        ):
            errors.append(issue("TRADE_ACTION", action_path, "Preserved source action requires an included, referenced action slot."))
        if any(ref not in claim_refs for ref in action_refs):
            errors.append(issue("ACTION_LINEAGE", f"{action_path}.semantic_refs", "Action refs must resolve to semantic claim refs."))
        if action_max:
            allocated_characters += action_max
        if action_purpose:
            public_plan_text.append((f"{action_path}.purpose", action_purpose))
    if max_total is not None and allocated_characters > max_total:
        errors.append(issue("TEXT_BUDGET", "$.text_blueprint.max_total_characters", "Section budgets exceed the total text budget."))

    visual_fields = {"intent", "grammar", "data_requirement_refs", "execution_route", "fallback", "image_text_budget"}
    visual = validate_object(payload.get("visual_plan"), "$.visual_plan", visual_fields, visual_fields, errors)
    intent_fields = {
        "job",
        "reader_question",
        "primary_message",
        "reader_takeaway",
        "candidate_jobs",
        "target_evidence_shapes",
    }
    visual_intent = validate_object(visual.get("intent"), "$.visual_plan.intent", intent_fields, intent_fields, errors)
    visual_job = visual_intent.get("job")
    if visual_job not in VISUAL_CANDIDATE_JOBS:
        errors.append(issue("VISUAL_JOB", "$.visual_plan.intent.job", "Unsupported visual job."))
    for key, maximum in (("reader_question", 160), ("primary_message", 240), ("reader_takeaway", 240)):
        value = visual_intent.get(key)
        if not nonempty(value) or len(str(value or "")) > maximum:
            errors.append(issue("VISUAL_MESSAGE", f"$.visual_plan.intent.{key}", f"Visual intent text must contain one to {maximum} characters."))
        elif isinstance(value, str):
            public_plan_text.append((f"$.visual_plan.intent.{key}", value))

    candidate_jobs = visual_intent.get("candidate_jobs")
    if not isinstance(candidate_jobs, list) or len(candidate_jobs) != 3:
        errors.append(issue("VISUAL_CANDIDATE_JOBS", "$.visual_plan.intent.candidate_jobs", "Visual intent requires exactly three candidate jobs."))
        candidate_jobs = []
    candidate_families: list[str] = []
    candidate_job_ids: list[str] = []
    candidate_questions: list[str] = []
    candidate_requirement_refs_by_family: dict[str, set[str]] = {}
    candidate_evidence_shape_union: set[str] = set()
    candidate_fields = {"family", "job", "reader_question", "evidence_shapes", "requirement_refs"}
    for index, raw_candidate in enumerate(candidate_jobs):
        path = f"$.visual_plan.intent.candidate_jobs[{index}]"
        candidate = validate_object(raw_candidate, path, candidate_fields, candidate_fields, errors)
        family = candidate.get("family")
        job = candidate.get("job")
        question = candidate.get("reader_question")
        if family not in VISUAL_CANDIDATE_JOBS_BY_FAMILY:
            errors.append(issue("VISUAL_CANDIDATE_FAMILY", f"{path}.family", "Unsupported visual candidate family."))
        else:
            candidate_families.append(family)
            if job not in VISUAL_CANDIDATE_JOBS_BY_FAMILY[family]:
                errors.append(issue("VISUAL_CANDIDATE_JOB_FAMILY", f"{path}.job", "Candidate job is incompatible with its family."))
        if job not in VISUAL_CANDIDATE_JOBS:
            errors.append(issue("VISUAL_CANDIDATE_JOB", f"{path}.job", "Unsupported visual candidate job."))
        else:
            candidate_job_ids.append(job)
        if not nonempty(question) or len(str(question or "")) > 160:
            errors.append(issue("VISUAL_CANDIDATE_QUESTION", f"{path}.reader_question", "Candidate reader question must contain one to 160 characters."))
        elif isinstance(question, str):
            candidate_questions.append(question.strip())
            public_plan_text.append((f"{path}.reader_question", question))
        candidate_evidence_shapes = set(
            string_list(candidate.get("evidence_shapes"), f"{path}.evidence_shapes", errors, minimum=1, maximum=4)
        )
        unknown_candidate_shapes = candidate_evidence_shapes - EVIDENCE_SHAPES
        if unknown_candidate_shapes:
            errors.append(issue("VISUAL_CANDIDATE_EVIDENCE_SHAPE", f"{path}.evidence_shapes", f"Unsupported candidate evidence shapes: {sorted(unknown_candidate_shapes)}."))
        candidate_evidence_shape_union.update(candidate_evidence_shapes)
        candidate_requirement_refs = set(
            string_list(candidate.get("requirement_refs"), f"{path}.requirement_refs", errors)
        )
        if isinstance(family, str):
            candidate_requirement_refs_by_family[family] = candidate_requirement_refs
    if set(candidate_families) != set(VISUAL_CANDIDATE_JOBS_BY_FAMILY) or len(candidate_families) != 3:
        errors.append(issue("VISUAL_CANDIDATE_FAMILY_COVERAGE", "$.visual_plan.intent.candidate_jobs", "Candidate jobs must include fast_read, proof, and system exactly once."))
    if visual_job in VISUAL_CANDIDATE_JOBS and visual_job not in candidate_job_ids:
        errors.append(issue("VISUAL_PRIMARY_JOB_COVERAGE", "$.visual_plan.intent.job", "The primary visual job must appear in the three candidate targets."))
    if len(candidate_questions) != len(set(candidate_questions)):
        errors.append(issue("VISUAL_READER_QUESTION_UNIQUE", "$.visual_plan.intent.candidate_jobs", "Each candidate must answer a different reader question."))

    target_evidence_shapes = set(
        string_list(
            visual_intent.get("target_evidence_shapes"),
            "$.visual_plan.intent.target_evidence_shapes",
            errors,
            minimum=1,
            maximum=6,
        )
    )
    unknown_evidence_shapes = target_evidence_shapes - EVIDENCE_SHAPES
    if unknown_evidence_shapes:
        errors.append(issue("VISUAL_EVIDENCE_SHAPE", "$.visual_plan.intent.target_evidence_shapes", f"Unsupported evidence shapes: {sorted(unknown_evidence_shapes)}."))
    if candidate_evidence_shape_union != target_evidence_shapes:
        errors.append(issue("VISUAL_EVIDENCE_SHAPE_COVERAGE", "$.visual_plan.intent.target_evidence_shapes", "Target evidence shapes must equal the union of the three candidate shape sets."))
    grammar_required = {"primary", "rationale"}
    grammar_allowed = grammar_required | {"alternatives", "argument_grammar"}
    grammar = validate_object(visual.get("grammar"), "$.visual_plan.grammar", grammar_required, grammar_allowed, errors)
    primary_grammar = grammar.get("primary")
    if primary_grammar not in VIEWPOINT_VISUAL_GRAMMARS:
        errors.append(issue("VISUAL_GRAMMAR", "$.visual_plan.grammar.primary", "Unsupported unified ViewpointVisual grammar."))
    elif primary_grammar != primary_engine:
        errors.append(issue("TEXT_VISUAL_ENGINE_MISMATCH", "$.visual_plan.grammar.primary", "Text and visual plans must use the same unified rhetorical engine."))
    alternatives = string_list(grammar.get("alternatives", []), "$.visual_plan.grammar.alternatives", errors)
    if alternatives:
        errors.append(issue("VISUAL_GRAMMAR_ALTERNATIVE", "$.visual_plan.grammar.alternatives", "Use one shared unified rhetorical engine; layout variants belong in argument_grammar or downstream rendering."))
    argument_grammar = grammar.get("argument_grammar")
    if argument_grammar is not None and argument_grammar not in ARGUMENT_GRAMMARS:
        errors.append(issue("ARGUMENT_GRAMMAR", "$.visual_plan.grammar.argument_grammar", "Unsupported legacy argument-layout grammar."))
    if not nonempty(grammar.get("rationale")) or len(str(grammar.get("rationale") or "")) > 300:
        errors.append(issue("GRAMMAR_RATIONALE", "$.visual_plan.grammar.rationale", "Grammar rationale must contain one to 300 characters."))

    visual_requirement_refs = set(
        string_list(visual.get("data_requirement_refs"), "$.visual_plan.data_requirement_refs", errors)
    )
    unknown_visual_requirement_refs = visual_requirement_refs - set(data_requirements_by_id)
    if unknown_visual_requirement_refs:
        errors.append(issue("VISUAL_DATA_REQUIREMENT_REF", "$.visual_plan.data_requirement_refs", f"Unknown data requirement refs: {sorted(unknown_visual_requirement_refs)}."))
    expected_visual_requirement_refs = {
        requirement_id
        for requirement_id, requirement in data_requirements_by_id.items()
        if "visual" in requirement.get("expression_surfaces", [])
    }
    if visual_requirement_refs != expected_visual_requirement_refs:
        errors.append(issue("VISUAL_DATA_REQUIREMENT_COVERAGE", "$.visual_plan.data_requirement_refs", "Visual plan refs must exactly match requirements routed to visual expression."))

    visual_requirements = [
        data_requirements_by_id[requirement_id]
        for requirement_id in visual_requirement_refs
        if requirement_id in data_requirements_by_id
    ]
    material_visual_requirement_refs = {
        requirement_id
        for requirement_id in visual_requirement_refs
        if data_requirements_by_id.get(requirement_id, {}).get("material_to_claim") is True
    }
    for family, candidate_refs in candidate_requirement_refs_by_family.items():
        unknown_candidate_refs = candidate_refs - visual_requirement_refs
        if unknown_candidate_refs:
            errors.append(issue("VISUAL_CANDIDATE_REQUIREMENT_REF", "$.visual_plan.intent.candidate_jobs", f"{family} uses non-visual requirement refs: {sorted(unknown_candidate_refs)}."))
        missing_material_refs = material_visual_requirement_refs - candidate_refs
        if missing_material_refs:
            errors.append(issue("VISUAL_CANDIDATE_MATERIAL_COVERAGE", "$.visual_plan.intent.candidate_jobs", f"{family} omits material visual requirements: {sorted(missing_material_refs)}."))
    declared_kinds = {requirement.get("kind") for requirement in visual_requirements if requirement.get("kind") in DATA_KINDS}
    available_kinds = {
        requirement.get("kind")
        for requirement in visual_requirements
        if requirement.get("status") == "available" and requirement.get("kind") in DATA_KINDS
    }
    compatible_modes = DATA_MODES_BY_VISUAL.get(primary_grammar, set())
    if visual_requirement_refs and primary_grammar in VIEWPOINT_VISUAL_GRAMMARS and not (declared_kinds & compatible_modes):
        errors.append(issue("VISUAL_DATA_MODE", "$.visual_plan.data_requirement_refs", "Route at least one data mode compatible with the unified visual grammar."))

    route_fields = {
        "route_registry_ref",
        "route_registry_sha256",
        "route_id",
        "query_requests",
        "skill_path_ids",
        "primary_renderer_skill_id",
        "detail_renderer_skill_id",
        "resume_policy",
        "route_sha256",
    }
    execution_route = validate_object(
        visual.get("execution_route"),
        "$.visual_plan.execution_route",
        route_fields,
        route_fields,
        errors,
    )
    if execution_route.get("route_registry_ref") != "visual-intent-route-registry-v1":
        errors.append(issue("VISUAL_ROUTE_REGISTRY", "$.visual_plan.execution_route.route_registry_ref", "Use the canonical visual intent route registry."))
    if execution_route.get("route_registry_sha256") != VISUAL_ROUTE_REGISTRY_SHA256:
        errors.append(issue("VISUAL_ROUTE_REGISTRY_HASH", "$.visual_plan.execution_route.route_registry_sha256", "Visual intent route registry hash does not match the packaged registry."))
    route_id = execution_route.get("route_id")
    route_spec = VISUAL_ROUTE_SPECS.get(route_id)
    if route_spec is None:
        errors.append(issue("VISUAL_ROUTE_ID", "$.visual_plan.execution_route.route_id", "Unsupported visual execution route."))

    query_requests = execution_route.get("query_requests")
    if not isinstance(query_requests, list) or len(query_requests) > 16:
        errors.append(issue("VISUAL_QUERY_REQUESTS", "$.visual_plan.execution_route.query_requests", "Expected at most 16 routed visual Query requests."))
        query_requests = []
    routed_requirement_refs: list[str] = []
    query_fields = {"requirement_ref", "capability_id", "tool_ids", "run_policy"}
    for index, raw_query in enumerate(query_requests):
        path = f"$.visual_plan.execution_route.query_requests[{index}]"
        query = validate_object(raw_query, path, query_fields, query_fields, errors)
        requirement_ref = query.get("requirement_ref")
        if not isinstance(requirement_ref, str) or not re.fullmatch(r"D[1-9][0-9]*", requirement_ref):
            errors.append(issue("VISUAL_QUERY_REQUIREMENT_REF", f"{path}.requirement_ref", "Invalid visual Query requirement ref."))
            requirement_ref = None
        elif requirement_ref not in visual_requirement_refs:
            errors.append(issue("VISUAL_QUERY_REQUIREMENT_SCOPE", f"{path}.requirement_ref", "Visual Query requests must target requirements routed to the visual surface."))
        else:
            routed_requirement_refs.append(requirement_ref)

        capability_id = query.get("capability_id")
        if capability_id not in QUERY_CAPABILITY_TOOLS:
            errors.append(issue("VISUAL_QUERY_CAPABILITY", f"{path}.capability_id", "Unsupported Cuebook Query capability."))
        tool_ids = set(
            string_list(query.get("tool_ids"), f"{path}.tool_ids", errors, minimum=2, maximum=3)
        )
        if capability_id in QUERY_CAPABILITY_TOOLS and tool_ids != QUERY_CAPABILITY_TOOLS[capability_id]:
            errors.append(issue("VISUAL_QUERY_TOOLS", f"{path}.tool_ids", "Tool IDs must match the selected Query capability exactly."))
        if query.get("run_policy") != "reuse_or_query_gap":
            errors.append(issue("VISUAL_QUERY_RUN_POLICY", f"{path}.run_policy", "Visual Query requests must reuse a compatible bundle or query only the gap."))

        requirement = data_requirements_by_id.get(requirement_ref) if requirement_ref else None
        if requirement and capability_id in QUERY_CAPABILITY_REQUEST_CLASSES:
            request_class = requirement.get("request_class")
            if request_class not in QUERY_CAPABILITY_REQUEST_CLASSES[capability_id]:
                errors.append(issue("VISUAL_QUERY_CLASS", f"{path}.capability_id", f"{capability_id} cannot fulfill {request_class}."))
    if len(routed_requirement_refs) != len(set(routed_requirement_refs)):
        errors.append(issue("VISUAL_QUERY_REQUIREMENT_UNIQUE", "$.visual_plan.execution_route.query_requests", "Each visual requirement must have exactly one Query route."))
    if set(routed_requirement_refs) != visual_requirement_refs:
        errors.append(issue("VISUAL_QUERY_REQUIREMENT_COVERAGE", "$.visual_plan.execution_route.query_requests", "Query routes must cover every visual data requirement exactly once."))

    skill_path_ids = string_list(
        execution_route.get("skill_path_ids"),
        "$.visual_plan.execution_route.skill_path_ids",
        errors,
        maximum=5,
    )
    if route_spec is not None:
        if skill_path_ids != route_spec["skill_path_ids"]:
            errors.append(issue("VISUAL_SKILL_PATH", "$.visual_plan.execution_route.skill_path_ids", "Skill path must match the selected visual route and canonical stage order."))
        if execution_route.get("primary_renderer_skill_id") != route_spec["primary_renderer_skill_id"]:
            errors.append(issue("VISUAL_PRIMARY_RENDERER", "$.visual_plan.execution_route.primary_renderer_skill_id", "Primary renderer must match the selected visual route."))
        if execution_route.get("detail_renderer_skill_id") != route_spec["detail_renderer_skill_id"]:
            errors.append(issue("VISUAL_DETAIL_RENDERER", "$.visual_plan.execution_route.detail_renderer_skill_id", "Detail renderer must match the selected visual route."))
    if execution_route.get("resume_policy") != "resume_from_latest_valid_artifact":
        errors.append(issue("VISUAL_RESUME_POLICY", "$.visual_plan.execution_route.resume_policy", "Visual work must resume from the latest valid artifact."))
    route_hash = execution_route.get("route_sha256")
    expected_route_hash = calculate_visual_route_hash(visual)
    if not valid_sha256(route_hash) or route_hash != expected_route_hash:
        errors.append(issue("VISUAL_ROUTE_HASH", "$.visual_plan.execution_route.route_sha256", "Visual intent route hash does not match the locked intent, requirements, and execution route."))
    if "ohlcv_series" in target_evidence_shapes and route_id != "viewpoint_static_plus_thesis_chart":
        errors.append(issue("OHLCV_RENDERER_ROUTE", "$.visual_plan.execution_route.route_id", "OHLCV evidence requires the thesis-chart detail renderer route."))
    if route_id == "viewpoint_static_plus_thesis_chart" and not any(
        requirement.get("request_class") == "market_series" for requirement in visual_requirements
    ):
        errors.append(issue("THESIS_CHART_DATA_ROUTE", "$.visual_plan.execution_route.route_id", "The thesis-chart detail route requires a market-series data request."))

    fallback_fields = {"trigger", "strategy", "applies_to_requirement_refs", "preserves_fingerprint", "prohibited_substitutions"}
    fallback = validate_object(visual.get("fallback"), "$.visual_plan.fallback", fallback_fields, fallback_fields, errors)
    trigger = fallback.get("trigger")
    strategy = fallback.get("strategy")
    fallback_requirement_refs = set(
        string_list(
            fallback.get("applies_to_requirement_refs"),
            "$.visual_plan.fallback.applies_to_requirement_refs",
            errors,
        )
    )
    if trigger not in {"none", "missing_required_data", "rights_unavailable", "unverified_anecdote", "renderer_limit"}:
        errors.append(issue("FALLBACK_TRIGGER", "$.visual_plan.fallback.trigger", "Unsupported fallback trigger."))
    if strategy not in {"none", "qualitative", "key_numbers", "series", "text_only", "no_visual"}:
        errors.append(issue("FALLBACK_STRATEGY", "$.visual_plan.fallback.strategy", "Unsupported fallback strategy."))
    if (route_id == "no_visual") != (strategy == "no_visual"):
        errors.append(issue("NO_VISUAL_ROUTE", "$.visual_plan.execution_route.route_id", "The no-visual route and no-visual fallback strategy must be selected together."))
    if (trigger == "none") != (strategy == "none"):
        errors.append(issue("FALLBACK_PAIR", "$.visual_plan.fallback", "Fallback trigger and strategy must either both be none or both be active."))
    if fallback_requirement_refs - visual_requirement_refs:
        errors.append(issue("FALLBACK_REQUIREMENT_REF", "$.visual_plan.fallback.applies_to_requirement_refs", "Fallback refs must resolve to requirements routed to the visual plan."))
    if trigger == "none" and fallback_requirement_refs:
        errors.append(issue("INACTIVE_FALLBACK_REFS", "$.visual_plan.fallback.applies_to_requirement_refs", "An inactive fallback cannot claim requirement refs."))
    if trigger != "none" and not fallback_requirement_refs:
        errors.append(issue("ACTIVE_FALLBACK_EMPTY", "$.visual_plan.fallback.applies_to_requirement_refs", "An active fallback must name the requirements it covers."))
    missing_required_visual_ids = missing_required_ids & visual_requirement_refs
    fallback_eligible_ids = missing_required_visual_ids - nondegradable_missing_ids
    if fallback_eligible_ids and (trigger == "none" or strategy == "none"):
        errors.append(issue("MISSING_DATA_FALLBACK", "$.visual_plan.fallback", "Missing fallback-eligible visual data requires an active fallback."))
    if fallback_requirement_refs != fallback_eligible_ids:
        errors.append(issue("FALLBACK_REQUIREMENT_COVERAGE", "$.visual_plan.fallback.applies_to_requirement_refs", "Fallback refs must exactly match missing required visual requests that permit fallback."))
    material_fallback_refs = fallback_requirement_refs & nondegradable_missing_ids
    if material_fallback_refs:
        errors.append(issue("MATERIAL_REQUEST_FALLBACK", "$.visual_plan.fallback.applies_to_requirement_refs", f"Non-degradable material requests cannot fallback: {sorted(material_fallback_refs)}."))
    if strategy in DATA_KINDS and strategy not in available_kinds:
        errors.append(issue("FALLBACK_DATA_MODE", "$.visual_plan.fallback.strategy", "A data-mode fallback requires an available requirement of the same mode."))
    if missing_material_ids and state in {"ready", "frozen"}:
        errors.append(issue("MATERIAL_DATA_MISSING", "$.data_requirements", "Ready output cannot omit a missing material creator premise."))
    if nondegradable_missing_ids and state != "blocked":
        errors.append(issue("MATERIAL_REQUEST_STATE", "$.state", "Missing material news, valuation, comparator, price, or settlement requests require a blocked plan."))
    if fallback.get("preserves_fingerprint") is not True:
        errors.append(issue("FALLBACK_LOCK", "$.visual_plan.fallback.preserves_fingerprint", "Fallback must preserve the meaning fingerprint."))
    substitutions = set(string_list(fallback.get("prohibited_substitutions"), "$.visual_plan.fallback.prohibited_substitutions", errors, minimum=4))
    if substitutions != FALLBACK_SUBSTITUTIONS:
        errors.append(issue("FALLBACK_FIREWALL", "$.visual_plan.fallback.prohibited_substitutions", "Fallback must prohibit all unsafe substitutions."))

    budget_fields = {"unit"} | set(IMAGE_BUDGET_LIMITS)
    budget = validate_object(visual.get("image_text_budget"), "$.visual_plan.image_text_budget", budget_fields, budget_fields, errors)
    if budget.get("unit") != "characters":
        errors.append(issue("IMAGE_BUDGET_UNIT", "$.visual_plan.image_text_budget.unit", "Image text budget unit must be characters."))
    for key, (minimum, maximum) in IMAGE_BUDGET_LIMITS.items():
        integer_range(budget.get(key), f"$.visual_plan.image_text_budget.{key}", minimum, maximum, errors)

    settlement_fields = {"status", "reason_codes", "claim_ref", "requirements", "missing_requirements", "downstream_route"}
    settlement = validate_object(payload.get("settlement_eligibility"), "$.settlement_eligibility", settlement_fields, settlement_fields, errors)
    settlement_status = settlement.get("status")
    if settlement_status not in {"ineligible", "candidate", "eligible", "blocked"}:
        errors.append(issue("SETTLEMENT_STATUS", "$.settlement_eligibility.status", "Unsupported settlement status."))
    reason_codes = string_list(settlement.get("reason_codes"), "$.settlement_eligibility.reason_codes", errors, minimum=1)
    claim_ref = nullable_string(settlement.get("claim_ref"), "$.settlement_eligibility.claim_ref", errors)
    requirement_object = validate_object(
        settlement.get("requirements"),
        "$.settlement_eligibility.requirements",
        SETTLEMENT_REQUIREMENTS,
        SETTLEMENT_REQUIREMENTS,
        errors,
    )
    for key in SETTLEMENT_REQUIREMENTS:
        if not isinstance(requirement_object.get(key), bool):
            errors.append(issue("SETTLEMENT_REQUIREMENT", f"$.settlement_eligibility.requirements.{key}", "Settlement requirement must be boolean."))
    missing_requirements = set(string_list(settlement.get("missing_requirements"), "$.settlement_eligibility.missing_requirements", errors))
    if any(item not in SETTLEMENT_REQUIREMENTS for item in missing_requirements):
        errors.append(issue("SETTLEMENT_MISSING", "$.settlement_eligibility.missing_requirements", "Unsupported missing settlement requirement."))
    computed_missing = {key for key in SETTLEMENT_REQUIREMENTS if requirement_object.get(key) is False}
    if settlement_intent != "none" and missing_requirements != computed_missing:
        errors.append(issue("SETTLEMENT_MISSING_MISMATCH", "$.settlement_eligibility.missing_requirements", "Missing requirements must match false requirement flags."))
    route = settlement.get("downstream_route")
    if route not in {None, "compile-cuebook-settlement-claim"}:
        errors.append(issue("SETTLEMENT_ROUTE", "$.settlement_eligibility.downstream_route", "Unsupported settlement route."))
    if settlement_intent == "none":
        if not (
            settlement_status == "ineligible"
            and claim_ref is None
            and route is None
            and reason_codes == ["source_intent_absent"]
            and not any(requirement_object.values())
            and not missing_requirements
        ):
            errors.append(issue("NO_SETTLEMENT", "$.settlement_eligibility", "No-settlement source intent requires a fully ineligible settlement block."))
    elif settlement_intent == "candidate":
        if settlement_status not in {"candidate", "blocked"} or route != "compile-cuebook-settlement-claim":
            errors.append(issue("SETTLEMENT_CANDIDATE", "$.settlement_eligibility", "Candidate settlement intent must remain candidate or blocked and route to claim compilation."))
    elif settlement_intent == "explicit":
        expected_status = "eligible" if not computed_missing else "blocked"
        if settlement_status != expected_status:
            errors.append(issue("SETTLEMENT_EXPLICIT", "$.settlement_eligibility.status", "Explicit settlement intent is eligible only when all requirements are present."))
        expected_route = None if claim_ref is not None else "compile-cuebook-settlement-claim"
        if route != expected_route:
            errors.append(issue("SETTLEMENT_ROUTE", "$.settlement_eligibility.downstream_route", "Explicit settlement intent without a claim ref must route to claim compilation."))

    firewall_fields = {
        "source_attribution_required",
        "factual_claims_require_refs",
        "fact_interpretation_separated",
        "anecdote_policy",
        "unverified_anecdote_as_proof",
        "first_person_experience",
        "living_creator_imitation",
        "signature_phrasing_reuse",
        "sentence_sequence_copy",
        "identity_impersonation",
        "original_composition_required",
        "max_verbatim_words",
        "public_backend_terms_allowed",
    }
    firewall = validate_object(
        payload.get("source_style_firewall"),
        "$.source_style_firewall",
        firewall_fields,
        firewall_fields,
        errors,
    )
    for key in ("source_attribution_required", "factual_claims_require_refs", "fact_interpretation_separated"):
        if firewall.get(key) is not True:
            errors.append(issue("SOURCE_FIREWALL", f"$.source_style_firewall.{key}", "Source firewall control must be true."))
    if firewall.get("original_composition_required") is not True:
        errors.append(issue("ORIGINAL_COMPOSITION", "$.source_style_firewall.original_composition_required", "Original composition must be required."))
    for key in ("unverified_anecdote_as_proof", "living_creator_imitation", "signature_phrasing_reuse", "sentence_sequence_copy", "identity_impersonation", "public_backend_terms_allowed"):
        if firewall.get(key) is not False:
            errors.append(issue("STYLE_FIREWALL", f"$.source_style_firewall.{key}", "Style firewall control must be false."))
    anecdote_policy = firewall.get("anecdote_policy")
    if anecdote_policy not in {"not_present", "context_only", "sentiment_only", "creator_owned_only"}:
        errors.append(issue("ANECDOTE_POLICY", "$.source_style_firewall.anecdote_policy", "Unsupported anecdote policy."))
    if primary_engine == "sentiment_witness" and anecdote_policy != "sentiment_only":
        errors.append(issue("SENTIMENT_ANECDOTE_POLICY", "$.source_style_firewall.anecdote_policy", "Sentiment witness requires sentiment-only anecdote use."))
    integer_range(firewall.get("max_verbatim_words"), "$.source_style_firewall.max_verbatim_words", 0, 25, errors)
    experience_fields = {"mode", "allowed_claim_refs"}
    experience = validate_object(
        firewall.get("first_person_experience"),
        "$.source_style_firewall.first_person_experience",
        experience_fields,
        experience_fields,
        errors,
    )
    experience_mode = experience.get("mode")
    allowed_experience_refs = string_list(
        experience.get("allowed_claim_refs"),
        "$.source_style_firewall.first_person_experience.allowed_claim_refs",
        errors,
    )
    expected_experience_mode = "preserve_creator_owned_only" if owned_experience_refs else "forbid"
    expected_voice_mode = "preserve_creator_owned_only" if owned_experience_refs else "forbidden"
    if experience_mode != expected_experience_mode or set(allowed_experience_refs) != set(owned_experience_refs):
        errors.append(issue("FIRST_PERSON_OWNERSHIP", "$.source_style_firewall.first_person_experience", "First-person experience policy must match creator-owned semantic refs exactly."))
    if voice.get("first_person_experience") != expected_voice_mode:
        errors.append(issue("FIRST_PERSON_VOICE", "$.voice_spec.first_person_experience", "VoiceSpec first-person experience must match creator-owned semantic refs."))

    if nonempty(narrative.get("frame")):
        public_plan_text.append(("$.narrative.frame", narrative["frame"]))
    for index, primitive in enumerate(primitives):
        if isinstance(primitive, dict) and nonempty(primitive.get("purpose")):
            public_plan_text.append((f"$.narrative.primitives[{index}].purpose", primitive["purpose"]))
    for index, tag in enumerate(tags):
        public_plan_text.append((f"$.text_blueprint.public_tags[{index}]", tag))
    for path, value in public_plan_text:
        if contains_cuebook_workflow_narration(value):
            errors.append(issue("PUBLIC_CUEBOOK_NARRATION", path, "Public expression guidance must not narrate Cuebook assistance or transformation workflow."))
        backend_term = contains_backend_term(value)
        if backend_term is not None:
            errors.append(issue("PUBLIC_BACKEND_TERM", path, f"Public expression guidance contains backend term: {backend_term}."))
        for phrase in banned_stock_phrases:
            if phrase.lower() in value.lower():
                errors.append(issue("AI_STOCK_PHRASE", path, f"Public expression guidance contains banned stock phrase: {phrase}."))
        if not owned_experience_refs and contains_first_person_experience(value):
            errors.append(issue("INVENTED_FIRST_PERSON_EXPERIENCE", path, "First-person experience is not creator-owned in the semantic input."))
    public_expression_text = "\n".join(value for _, value in public_plan_text)
    not_a_but_b_count = len(re.findall(r"不是\s*[^。！？\n]{1,80}?\s*而是", public_expression_text))
    if not_a_but_b_count > 1:
        errors.append(issue("REPEATED_NOT_A_BUT_B", "$.voice_spec.anti_ai_language", "Use at most one 不是 A 而是 B frame across public expression guidance."))

    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": []}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--print-fingerprint-hash", action="store_true")
    parser.add_argument("--expected-source-semantics-hash")
    args = parser.parse_args()
    try:
        payload = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("LOAD", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1

    if args.print_fingerprint_hash:
        fingerprint = payload.get("meaning_fingerprint") if isinstance(payload, dict) else None
        if not isinstance(fingerprint, dict):
            print(json.dumps({"valid": False, "errors": [issue("FINGERPRINT", "$.meaning_fingerprint", "Expected an object.")], "warnings": []}, indent=2))
            return 1
        print(calculate_fingerprint_hash(fingerprint))
        return 0

    expected_hash = args.expected_source_semantics_hash
    if expected_hash is not None and not valid_sha256(expected_hash):
        print(json.dumps({"valid": False, "errors": [issue("EXPECTED_HASH", "$", "Expected sha256:<64 lowercase hex characters>.")], "warnings": []}, indent=2))
        return 1
    result = validate(payload, expected_source_semantics_hash=expected_hash)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
