#!/usr/bin/env python3
"""Validate MarketViewSemanticsV1 artifacts without third-party dependencies."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


ROOT_FIELDS = {
    "schema_version",
    "semantics_id",
    "revision",
    "state",
    "lineage",
    "speakers",
    "current_creator_ref",
    "source_units",
    "source_completeness",
    "subjects",
    "claims",
    "primary_claim_ref",
    "causal_links",
    "feedback_loops",
    "posture",
    "horizon",
    "proprietary_signal",
    "resolution",
    "quality_report",
}

SPEAKER_ROLES = {"source_author", "current_creator", "quoted_witness", "researcher", "unknown"}
SOURCE_ROLES = {
    "primary_view",
    "quoted_view",
    "supporting_evidence",
    "counterevidence",
    "context",
    "creator_instruction",
    "methodology",
}
SOURCE_PRIMITIVES = {
    "official_event",
    "market_data",
    "flow_positioning",
    "on_chain",
    "social_sentiment",
    "structural_thesis",
    "sell_side_expectation",
    "technical_structure",
    "proprietary_factor",
    "methodology",
    "creator_input",
    "unknown",
}
SOURCE_COMPLETENESS = {"complete", "excerpted", "truncated", "summary_only", "unavailable", "unknown"}
SUBJECT_TYPES = {
    "equity",
    "index",
    "crypto_asset",
    "commodity",
    "currency",
    "fund",
    "derivative",
    "company",
    "sector",
    "venue",
    "technology",
    "policy",
    "event",
    "metric",
    "signal",
    "person",
    "cohort",
    "flow",
    "market_state",
    "geography",
    "concept",
    "other",
}
CLAIM_ROLES = {"primary", "supporting", "caveat", "counterclaim", "trigger", "resolution"}
SPEECH_ACTS = {
    "market_observation",
    "causal_explanation",
    "forecast",
    "trade_intent",
    "trade_report",
    "trade_recommendation",
    "conditional_trade",
    "risk_warning",
    "sentiment_witness",
    "category_reframe",
    "valuation_judgment",
    "question",
}
TRADE_SPEECH_ACTS = {"trade_intent", "trade_report", "trade_recommendation", "conditional_trade"}
RHETORICAL_MOVES = {
    "bad_news_absorption",
    "parallel_realities",
    "category_reframing",
    "headline_vs_price",
    "policy_pivot",
    "capitulation_testimony",
    "event_crowding_unwind",
    "feedback_loop_explainer",
    "technical_meme_warning",
    "expectation_reset",
    "proprietary_factor_rotation",
    "direct_observation",
    "causal_chain",
    "comparison",
    "caveat",
    "none",
}
OWNERSHIP_MODES = {"source_only", "current_creator", "adopted", "shared", "unattributed"}
ADOPTION_STATES = {"none", "reported", "adopted", "qualified", "rejected", "not_applicable"}
SURFACE_VOICES = {"source_third_person", "current_creator_first_person", "quoted_first_person", "neutral"}
CERTAINTIES = {"certain", "likely", "possible", "speculative", "unspecified"}
EVIDENCE_BASES = {
    "direct_observation",
    "official_record",
    "market_data",
    "firsthand_witness",
    "reported_source",
    "multi_source_synthesis",
    "proprietary_model",
    "inference",
    "none",
}
EVIDENCE_BREADTHS = {
    "individual",
    "cohort",
    "instrument",
    "venue",
    "sector",
    "cross_asset",
    "market_wide",
    "structural",
    "unspecified",
}
CAUSAL_RELATIONS = {
    "causes",
    "amplifies",
    "dampens",
    "enables",
    "triggers",
    "constrains",
    "signals",
    "reprices",
    "precedes",
    "conditions",
}
POSTURE_ACTIONS = {
    "long",
    "short",
    "outperform",
    "underperform",
    "rotate",
    "buy_dips",
    "sell_rallies",
    "hold",
    "avoid",
    "wait",
    "observe",
    "exit",
    "neutral",
}
TRADE_ACTIONS = POSTURE_ACTIONS - {"wait", "observe", "neutral"}
TRADE_LEG_ROLES = {"primary", "comparator", "hedge", "from_leg", "to_leg"}
TRADE_DIRECTIONS = {
    "long",
    "short",
    "buy",
    "sell",
    "hold",
    "avoid",
    "exit",
    "outperform",
    "underperform",
    "neutral",
}
HORIZON_KINDS = {"unspecified", "instant", "window", "duration", "event_bound", "structural"}
HORIZON_PRECISIONS = {"none", "exact", "bounded", "approximate", "qualitative"}
DURATION_UNITS = {"minutes", "hours", "days", "weeks", "months", "quarters", "years"}
EVENT_BOUND_SUBJECT_TYPES = {"policy", "event", "metric", "signal", "flow", "market_state"}
FORMULA_OPERATORS = {"ratio", "difference", "sum", "product", "weighted_composite", "custom"}
FORMULA_INPUT_ROLES = {"numerator", "denominator", "term", "weight", "filter"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def check_shape(
    value: Any,
    path: str,
    required: Iterable[str],
    allowed: Iterable[str],
    errors: list[dict[str, str]],
) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(issue("OBJECT", path, "Expected an object."))
        return {}
    required_set = set(required)
    allowed_set = set(allowed)
    for key in sorted(required_set - set(value)):
        errors.append(issue("MISSING_FIELD", f"{path}.{key}", "Required field is missing."))
    for key in sorted(set(value) - allowed_set):
        errors.append(issue("UNKNOWN_FIELD", f"{path}.{key}", "Unknown field."))
    return value


def object_list(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    minimum: int = 0,
) -> list[Any]:
    if not isinstance(value, list):
        errors.append(issue("ARRAY", path, "Expected an array."))
        return []
    if len(value) < minimum:
        errors.append(issue("ARRAY_MIN", path, f"Expected at least {minimum} item(s)."))
    return value


def string_list(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    minimum: int = 0,
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
    return result


def nullable_string(value: Any, path: str, errors: list[dict[str, str]]) -> str | None:
    if value is None:
        return None
    if not nonempty(value):
        errors.append(issue("NULLABLE_STRING", path, "Expected null or a non-empty string."))
        return None
    return value.strip()


def enum_value(value: Any, allowed: set[str], path: str, errors: list[dict[str, str]], code: str = "ENUM") -> Any:
    if value not in allowed:
        errors.append(issue(code, path, f"Unsupported value: {value!r}."))
    return value


def parse_datetime(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    nullable: bool = False,
) -> datetime | None:
    if value is None and nullable:
        return None
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


def check_refs(
    refs: Iterable[str],
    index: dict[str, Any],
    path: str,
    errors: list[dict[str, str]],
    code: str,
) -> None:
    for position, ref in enumerate(refs):
        if ref not in index:
            errors.append(issue(code, f"{path}[{position}]", f"Unknown reference: {ref}."))


def register_id(
    index: dict[str, Any],
    identifier: Any,
    value: Any,
    path: str,
    errors: list[dict[str, str]],
) -> str | None:
    if not nonempty(identifier):
        errors.append(issue("ID", path, "Expected a non-empty identifier."))
        return None
    normalized = identifier.strip()
    if normalized in index:
        errors.append(issue("DUPLICATE_ID", path, f"Duplicate identifier: {normalized}."))
        return None
    index[normalized] = value
    return normalized


def aggregate_completeness(statuses: list[str]) -> str:
    if statuses and all(status == "complete" for status in statuses):
        return "complete"
    if statuses and all(status == "unknown" for status in statuses):
        return "unknown"
    if any(status == "complete" for status in statuses):
        return "mixed"
    return "incomplete"


def validate_lineage(payload: Any, errors: list[dict[str, str]]) -> None:
    value = check_shape(
        payload,
        "$.lineage",
        {"input_artifact_refs", "source_document_refs", "compiled_at"},
        {"input_artifact_refs", "source_document_refs", "compiled_at"},
        errors,
    )
    string_list(value.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, minimum=1)
    string_list(value.get("source_document_refs"), "$.lineage.source_document_refs", errors, minimum=1)
    parse_datetime(value.get("compiled_at"), "$.lineage.compiled_at", errors)


def validate_speakers(
    payload: Any,
    errors: list[dict[str, str]],
) -> tuple[dict[str, dict[str, Any]], dict[str, list[str]]]:
    speakers: dict[str, dict[str, Any]] = {}
    source_refs: dict[str, list[str]] = {}
    for index, raw in enumerate(object_list(payload, "$.speakers", errors, minimum=1)):
        path = f"$.speakers[{index}]"
        speaker = check_shape(
            raw,
            path,
            {"speaker_id", "label", "role", "source_unit_refs"},
            {"speaker_id", "label", "role", "source_unit_refs"},
            errors,
        )
        speaker_id = register_id(speakers, speaker.get("speaker_id"), speaker, f"{path}.speaker_id", errors)
        if not nonempty(speaker.get("label")):
            errors.append(issue("SPEAKER_LABEL", f"{path}.label", "Speaker label is required."))
        enum_value(speaker.get("role"), SPEAKER_ROLES, f"{path}.role", errors, "SPEAKER_ROLE")
        refs = string_list(speaker.get("source_unit_refs"), f"{path}.source_unit_refs", errors)
        if speaker_id:
            source_refs[speaker_id] = refs
    return speakers, source_refs


def validate_source_units(
    payload: Any,
    speakers: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> tuple[dict[str, dict[str, Any]], dict[str, list[str]], list[str]]:
    units: dict[str, dict[str, Any]] = {}
    claim_refs: dict[str, list[str]] = {}
    statuses: list[str] = []
    fields = {
        "source_unit_id",
        "locator",
        "role",
        "primitive",
        "speaker_ref",
        "completeness",
        "claim_refs",
        "notes",
    }
    for index, raw in enumerate(object_list(payload, "$.source_units", errors, minimum=1)):
        path = f"$.source_units[{index}]"
        unit = check_shape(raw, path, fields, fields, errors)
        unit_id = register_id(units, unit.get("source_unit_id"), unit, f"{path}.source_unit_id", errors)
        if not nonempty(unit.get("locator")):
            errors.append(issue("SOURCE_LOCATOR", f"{path}.locator", "Source locator is required."))
        enum_value(unit.get("role"), SOURCE_ROLES, f"{path}.role", errors, "SOURCE_ROLE")
        enum_value(unit.get("primitive"), SOURCE_PRIMITIVES, f"{path}.primitive", errors, "SOURCE_PRIMITIVE")
        speaker_ref = nullable_string(unit.get("speaker_ref"), f"{path}.speaker_ref", errors)
        if speaker_ref is not None and speaker_ref not in speakers:
            errors.append(issue("SOURCE_SPEAKER_REF", f"{path}.speaker_ref", f"Unknown speaker: {speaker_ref}."))
        completeness = enum_value(
            unit.get("completeness"),
            SOURCE_COMPLETENESS,
            f"{path}.completeness",
            errors,
            "SOURCE_COMPLETENESS",
        )
        if completeness in SOURCE_COMPLETENESS:
            statuses.append(completeness)
        refs = string_list(unit.get("claim_refs"), f"{path}.claim_refs", errors, minimum=1)
        nullable_string(unit.get("notes"), f"{path}.notes", errors)
        if unit_id:
            claim_refs[unit_id] = refs
    return units, claim_refs, statuses


def validate_source_completeness(
    payload: Any,
    statuses: list[str],
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
) -> None:
    value = check_shape(
        payload,
        "$.source_completeness",
        {"overall", "missing_context"},
        {"overall", "missing_context"},
        errors,
    )
    overall = enum_value(
        value.get("overall"),
        {"complete", "mixed", "incomplete", "unknown"},
        "$.source_completeness.overall",
        errors,
        "OVERALL_COMPLETENESS",
    )
    string_list(value.get("missing_context"), "$.source_completeness.missing_context", errors)
    expected = aggregate_completeness(statuses)
    if overall in {"complete", "mixed", "incomplete", "unknown"} and overall != expected:
        errors.append(
            issue(
                "COMPLETENESS_AGGREGATE",
                "$.source_completeness.overall",
                f"Expected {expected!r} from source-unit completeness, received {overall!r}.",
            )
        )
    if expected != "complete":
        warnings.append(
            issue(
                "SOURCE_INCOMPLETE",
                "$.source_completeness.overall",
                f"Source inventory is {expected}; preserve this boundary downstream.",
            )
        )


def validate_subjects(
    payload: Any,
    source_units: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, dict[str, Any]]:
    subjects: dict[str, dict[str, Any]] = {}
    fields = {"subject_id", "label", "type", "canonical_id", "venue", "source_unit_refs"}
    for index, raw in enumerate(object_list(payload, "$.subjects", errors, minimum=1)):
        path = f"$.subjects[{index}]"
        subject = check_shape(raw, path, fields, fields, errors)
        register_id(subjects, subject.get("subject_id"), subject, f"{path}.subject_id", errors)
        if not nonempty(subject.get("label")):
            errors.append(issue("SUBJECT_LABEL", f"{path}.label", "Subject label is required."))
        enum_value(subject.get("type"), SUBJECT_TYPES, f"{path}.type", errors, "SUBJECT_TYPE")
        nullable_string(subject.get("canonical_id"), f"{path}.canonical_id", errors)
        nullable_string(subject.get("venue"), f"{path}.venue", errors)
        refs = string_list(subject.get("source_unit_refs"), f"{path}.source_unit_refs", errors, minimum=1)
        check_refs(refs, source_units, f"{path}.source_unit_refs", errors, "SUBJECT_SOURCE_REF")
    return subjects


def validate_claims(
    payload: Any,
    speakers: dict[str, dict[str, Any]],
    current_creator_ref: str | None,
    source_units: dict[str, dict[str, Any]],
    subjects: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, dict[str, Any]]:
    claims: dict[str, dict[str, Any]] = {}
    fields = {
        "claim_id",
        "role",
        "text",
        "source_unit_refs",
        "subject_refs",
        "speech_act",
        "rhetorical_move",
        "ownership",
        "certainty",
        "evidence_scope",
    }
    ownership_fields = {"mode", "origin_speaker_ref", "creator_adoption", "surface_voice"}
    evidence_fields = {"basis", "breadth", "subject_refs", "limitations"}

    for index, raw in enumerate(object_list(payload, "$.claims", errors, minimum=1)):
        path = f"$.claims[{index}]"
        claim = check_shape(raw, path, fields, fields, errors)
        register_id(claims, claim.get("claim_id"), claim, f"{path}.claim_id", errors)
        enum_value(claim.get("role"), CLAIM_ROLES, f"{path}.role", errors, "CLAIM_ROLE")
        if not nonempty(claim.get("text")):
            errors.append(issue("CLAIM_TEXT", f"{path}.text", "Claim text is required."))
        source_refs = string_list(claim.get("source_unit_refs"), f"{path}.source_unit_refs", errors, minimum=1)
        check_refs(source_refs, source_units, f"{path}.source_unit_refs", errors, "CLAIM_SOURCE_REF")
        subject_refs = string_list(claim.get("subject_refs"), f"{path}.subject_refs", errors, minimum=1)
        check_refs(subject_refs, subjects, f"{path}.subject_refs", errors, "CLAIM_SUBJECT_REF")
        speech_act = enum_value(claim.get("speech_act"), SPEECH_ACTS, f"{path}.speech_act", errors, "SPEECH_ACT")
        enum_value(claim.get("rhetorical_move"), RHETORICAL_MOVES, f"{path}.rhetorical_move", errors, "RHETORICAL_MOVE")
        enum_value(claim.get("certainty"), CERTAINTIES, f"{path}.certainty", errors, "CERTAINTY")

        ownership = check_shape(claim.get("ownership"), f"{path}.ownership", ownership_fields, ownership_fields, errors)
        mode = enum_value(ownership.get("mode"), OWNERSHIP_MODES, f"{path}.ownership.mode", errors, "OWNERSHIP_MODE")
        origin_ref = nullable_string(ownership.get("origin_speaker_ref"), f"{path}.ownership.origin_speaker_ref", errors)
        if origin_ref is not None and origin_ref not in speakers:
            errors.append(issue("CLAIM_SPEAKER_REF", f"{path}.ownership.origin_speaker_ref", f"Unknown speaker: {origin_ref}."))
        adoption = enum_value(
            ownership.get("creator_adoption"),
            ADOPTION_STATES,
            f"{path}.ownership.creator_adoption",
            errors,
            "CREATOR_ADOPTION",
        )
        voice = enum_value(
            ownership.get("surface_voice"),
            SURFACE_VOICES,
            f"{path}.ownership.surface_voice",
            errors,
            "SURFACE_VOICE",
        )
        if mode == "source_only":
            if origin_ref is None or origin_ref == current_creator_ref:
                errors.append(
                    issue(
                        "SOURCE_ONLY_ORIGIN",
                        f"{path}.ownership.origin_speaker_ref",
                        "source_only requires a non-creator origin speaker.",
                    )
                )
            if adoption not in {"none", "reported", "rejected"}:
                errors.append(
                    issue(
                        "SOURCE_ONLY_ADOPTION",
                        f"{path}.ownership.creator_adoption",
                        "source_only cannot be adopted or shared by the current creator.",
                    )
                )
            if voice == "current_creator_first_person":
                errors.append(
                    issue(
                        "SOURCE_ONLY_CREATOR_VOICE",
                        f"{path}.ownership.surface_voice",
                        "source_only cannot render as current-creator first person.",
                    )
                )
        if mode == "current_creator":
            if current_creator_ref is None or origin_ref != current_creator_ref:
                errors.append(
                    issue(
                        "CREATOR_OWNERSHIP",
                        f"{path}.ownership.origin_speaker_ref",
                        "current_creator ownership must resolve to current_creator_ref.",
                    )
                )
            if adoption != "not_applicable":
                errors.append(
                    issue(
                        "CREATOR_ADOPTION_STATE",
                        f"{path}.ownership.creator_adoption",
                        "A creator-originated claim uses not_applicable adoption.",
                    )
                )
        if mode in {"adopted", "shared"} and adoption not in {"adopted", "qualified"}:
            errors.append(
                issue(
                    "ADOPTED_OWNERSHIP",
                    f"{path}.ownership.creator_adoption",
                    "Adopted or shared ownership requires adopted or qualified creator adoption.",
                )
            )
        if voice == "current_creator_first_person":
            if current_creator_ref is None or mode not in {"current_creator", "adopted", "shared"}:
                errors.append(
                    issue(
                        "CREATOR_VOICE_OWNERSHIP",
                        f"{path}.ownership.surface_voice",
                        "Current-creator first person requires creator-owned, adopted, or shared ownership.",
                    )
                )

        evidence = check_shape(
            claim.get("evidence_scope"),
            f"{path}.evidence_scope",
            evidence_fields,
            evidence_fields,
            errors,
        )
        enum_value(evidence.get("basis"), EVIDENCE_BASES, f"{path}.evidence_scope.basis", errors, "EVIDENCE_BASIS")
        breadth = enum_value(
            evidence.get("breadth"),
            EVIDENCE_BREADTHS,
            f"{path}.evidence_scope.breadth",
            errors,
            "EVIDENCE_BREADTH",
        )
        evidence_subject_refs = string_list(evidence.get("subject_refs"), f"{path}.evidence_scope.subject_refs", errors)
        check_refs(evidence_subject_refs, subjects, f"{path}.evidence_scope.subject_refs", errors, "EVIDENCE_SUBJECT_REF")
        for evidence_ref in evidence_subject_refs:
            if evidence_ref not in subject_refs:
                errors.append(
                    issue(
                        "EVIDENCE_SUBJECT_CLAIM",
                        f"{path}.evidence_scope.subject_refs",
                        f"Evidence subject {evidence_ref} must also appear in claim.subject_refs.",
                    )
                )
        string_list(evidence.get("limitations"), f"{path}.evidence_scope.limitations", errors)
        if speech_act == "sentiment_witness" and breadth not in {"individual", "cohort"}:
            errors.append(
                issue(
                    "SENTIMENT_BREADTH",
                    f"{path}.evidence_scope.breadth",
                    "sentiment_witness evidence must remain individual or cohort scoped.",
                )
            )
    return claims


def validate_posture(
    payload: Any,
    claims: dict[str, dict[str, Any]],
    subjects: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> None:
    fields = {"explicitness", "past", "now", "on_condition"}
    phase_fields = {"action", "claim_refs", "trigger_subject_refs", "trade_legs", "condition_text"}
    leg_fields = {"subject_ref", "role", "direction"}
    posture = check_shape(payload, "$.posture", fields, fields, errors)
    explicitness = enum_value(
        posture.get("explicitness"),
        {"none", "implicit", "explicit"},
        "$.posture.explicitness",
        errors,
        "POSTURE_EXPLICITNESS",
    )
    phase_claim_refs: dict[str, set[str]] = {"past": set(), "now": set(), "on_condition": set()}
    populated = 0

    for phase_name in ("past", "now", "on_condition"):
        raw = posture.get(phase_name)
        path = f"$.posture.{phase_name}"
        if raw is None:
            continue
        populated += 1
        phase = check_shape(raw, path, phase_fields, phase_fields, errors)
        action = enum_value(phase.get("action"), POSTURE_ACTIONS, f"{path}.action", errors, "POSTURE_ACTION")
        claim_refs = string_list(phase.get("claim_refs"), f"{path}.claim_refs", errors, minimum=1)
        check_refs(claim_refs, claims, f"{path}.claim_refs", errors, "POSTURE_CLAIM_REF")
        phase_claim_refs[phase_name].update(claim_refs)
        trigger_refs = string_list(phase.get("trigger_subject_refs"), f"{path}.trigger_subject_refs", errors)
        check_refs(trigger_refs, subjects, f"{path}.trigger_subject_refs", errors, "TRIGGER_SUBJECT_REF")
        legs = object_list(phase.get("trade_legs"), f"{path}.trade_legs", errors)
        leg_keys: set[tuple[str, str, str]] = set()
        leg_roles: set[str] = set()
        for leg_index, raw_leg in enumerate(legs):
            leg_path = f"{path}.trade_legs[{leg_index}]"
            leg = check_shape(raw_leg, leg_path, leg_fields, leg_fields, errors)
            subject_ref = nullable_string(leg.get("subject_ref"), f"{leg_path}.subject_ref", errors)
            if subject_ref is not None and subject_ref not in subjects:
                errors.append(issue("TRADE_LEG_SUBJECT_REF", f"{leg_path}.subject_ref", f"Unknown subject: {subject_ref}."))
            role = enum_value(leg.get("role"), TRADE_LEG_ROLES, f"{leg_path}.role", errors, "TRADE_LEG_ROLE")
            direction = enum_value(
                leg.get("direction"),
                TRADE_DIRECTIONS,
                f"{leg_path}.direction",
                errors,
                "TRADE_LEG_DIRECTION",
            )
            if subject_ref is not None and role in TRADE_LEG_ROLES and direction in TRADE_DIRECTIONS:
                key = (subject_ref, role, direction)
                if key in leg_keys:
                    errors.append(issue("TRADE_LEG_DUPLICATE", leg_path, "Duplicate trade leg."))
                leg_keys.add(key)
                leg_roles.add(role)
        condition = nullable_string(phase.get("condition_text"), f"{path}.condition_text", errors)
        if phase_name == "on_condition":
            if condition is None:
                errors.append(issue("CONDITION_TEXT", f"{path}.condition_text", "on_condition requires condition text."))
            if not trigger_refs:
                errors.append(issue("CONDITION_TRIGGER", f"{path}.trigger_subject_refs", "on_condition requires a trigger subject."))
        elif condition is not None:
            errors.append(issue("PHASE_CONDITION", f"{path}.condition_text", "Only on_condition may contain condition text."))
        if action in TRADE_ACTIONS and not legs:
            errors.append(issue("TRADE_ACTION_LEG", f"{path}.trade_legs", f"Action {action!r} requires a trade leg."))
        if action == "rotate" and not {"from_leg", "to_leg"}.issubset(leg_roles):
            errors.append(issue("ROTATION_LEGS", f"{path}.trade_legs", "rotate requires from_leg and to_leg roles."))

    if explicitness == "none" and populated:
        errors.append(issue("POSTURE_NONE_PHASE", "$.posture", "none posture cannot contain phases."))
    if explicitness in {"implicit", "explicit"} and not populated:
        errors.append(issue("POSTURE_PHASE_REQUIRED", "$.posture", "Non-none posture requires at least one phase."))

    trade_claim_ids = {
        claim_id
        for claim_id, claim in claims.items()
        if claim.get("speech_act") in TRADE_SPEECH_ACTS
    }
    represented_claim_ids = set().union(*phase_claim_refs.values())
    if trade_claim_ids and explicitness == "none":
        errors.append(issue("TRADE_POSTURE_REQUIRED", "$.posture.explicitness", "Trade speech acts require non-none posture."))
    for claim_id in sorted(trade_claim_ids - represented_claim_ids):
        errors.append(
            issue(
                "TRADE_CLAIM_PHASE",
                "$.posture",
                f"Trade claim {claim_id} must be represented in a posture phase.",
            )
        )
    conditional_claim_ids = {
        claim_id for claim_id, claim in claims.items() if claim.get("speech_act") == "conditional_trade"
    }
    for claim_id in sorted(conditional_claim_ids - phase_claim_refs["on_condition"]):
        errors.append(
            issue(
                "CONDITIONAL_TRADE_PHASE",
                "$.posture.on_condition",
                f"Conditional trade claim {claim_id} must appear in on_condition.",
            )
        )


def graph_has_cycle(links: Iterable[dict[str, Any]]) -> bool:
    adjacency: dict[str, set[str]] = defaultdict(set)
    nodes: set[str] = set()
    for link in links:
        source = link.get("from_subject_ref")
        target = link.get("to_subject_ref")
        if nonempty(source) and nonempty(target):
            adjacency[source].add(target)
            nodes.update({source, target})
    active: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in active:
            return True
        if node in visited:
            return False
        active.add(node)
        for neighbor in adjacency.get(node, set()):
            if visit(neighbor):
                return True
        active.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in nodes if node not in visited)


def edge_is_cyclic(link: dict[str, Any], links: Iterable[dict[str, Any]]) -> bool:
    source = link.get("from_subject_ref")
    target = link.get("to_subject_ref")
    if not nonempty(source) or not nonempty(target):
        return False
    if source == target:
        return True
    adjacency: dict[str, set[str]] = defaultdict(set)
    for candidate in links:
        candidate_source = candidate.get("from_subject_ref")
        candidate_target = candidate.get("to_subject_ref")
        if nonempty(candidate_source) and nonempty(candidate_target):
            adjacency[candidate_source].add(candidate_target)
    stack = [target]
    visited: set[str] = set()
    while stack:
        node = stack.pop()
        if node == source:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(adjacency.get(node, set()) - visited)
    return False


def validate_causality(
    raw_links: Any,
    raw_loops: Any,
    subjects: dict[str, dict[str, Any]],
    claims: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> None:
    link_fields = {"link_id", "from_subject_ref", "to_subject_ref", "relation", "claim_refs", "certainty", "loop_id"}
    loop_fields = {"loop_id", "label", "polarity", "declaration", "link_refs", "claim_refs"}
    links: dict[str, dict[str, Any]] = {}
    link_paths: dict[str, str] = {}
    for index, raw in enumerate(object_list(raw_links, "$.causal_links", errors)):
        path = f"$.causal_links[{index}]"
        link = check_shape(raw, path, link_fields, link_fields, errors)
        link_id = register_id(links, link.get("link_id"), link, f"{path}.link_id", errors)
        if link_id:
            link_paths[link_id] = path
        for field in ("from_subject_ref", "to_subject_ref"):
            ref = nullable_string(link.get(field), f"{path}.{field}", errors)
            if ref is not None and ref not in subjects:
                errors.append(issue("CAUSAL_SUBJECT_REF", f"{path}.{field}", f"Unknown subject: {ref}."))
        enum_value(link.get("relation"), CAUSAL_RELATIONS, f"{path}.relation", errors, "CAUSAL_RELATION")
        claim_refs = string_list(link.get("claim_refs"), f"{path}.claim_refs", errors, minimum=1)
        check_refs(claim_refs, claims, f"{path}.claim_refs", errors, "CAUSAL_CLAIM_REF")
        enum_value(link.get("certainty"), CERTAINTIES, f"{path}.certainty", errors, "CAUSAL_CERTAINTY")
        nullable_string(link.get("loop_id"), f"{path}.loop_id", errors)

    loops: dict[str, dict[str, Any]] = {}
    loop_paths: dict[str, str] = {}
    for index, raw in enumerate(object_list(raw_loops, "$.feedback_loops", errors)):
        path = f"$.feedback_loops[{index}]"
        loop = check_shape(raw, path, loop_fields, loop_fields, errors)
        loop_id = register_id(loops, loop.get("loop_id"), loop, f"{path}.loop_id", errors)
        if loop_id:
            loop_paths[loop_id] = path
        if not nonempty(loop.get("label")):
            errors.append(issue("LOOP_LABEL", f"{path}.label", "Feedback-loop label is required."))
        enum_value(loop.get("polarity"), {"reinforcing", "balancing", "mixed", "unspecified"}, f"{path}.polarity", errors, "LOOP_POLARITY")
        enum_value(loop.get("declaration"), {"explicit", "inferred"}, f"{path}.declaration", errors, "LOOP_DECLARATION")
        link_refs = string_list(loop.get("link_refs"), f"{path}.link_refs", errors, minimum=1)
        check_refs(link_refs, links, f"{path}.link_refs", errors, "LOOP_LINK_REF")
        claim_refs = string_list(loop.get("claim_refs"), f"{path}.claim_refs", errors, minimum=1)
        check_refs(claim_refs, claims, f"{path}.claim_refs", errors, "LOOP_CLAIM_REF")

    all_links = list(links.values())
    for link_id, link in links.items():
        path = link_paths[link_id]
        loop_id = link.get("loop_id")
        if edge_is_cyclic(link, all_links) and not nonempty(loop_id):
            errors.append(issue("CYCLE_LOOP_ID", f"{path}.loop_id", "Every edge in a directed cycle requires loop_id."))
        if nonempty(loop_id):
            if loop_id not in loops:
                errors.append(issue("CAUSAL_LOOP_REF", f"{path}.loop_id", f"Unknown feedback loop: {loop_id}."))
            elif link_id not in loops[loop_id].get("link_refs", []):
                errors.append(
                    issue(
                        "LOOP_LINK_MEMBERSHIP",
                        f"{path}.loop_id",
                        f"Link {link_id} is not listed in feedback loop {loop_id}.",
                    )
                )

    for loop_id, loop in loops.items():
        path = loop_paths[loop_id]
        declared_links = [links[ref] for ref in loop.get("link_refs", []) if ref in links]
        for ref in loop.get("link_refs", []):
            if ref in links and links[ref].get("loop_id") != loop_id:
                errors.append(
                    issue(
                        "LOOP_ID_MISMATCH",
                        f"{path}.link_refs",
                        f"Link {ref} must carry loop_id {loop_id}.",
                    )
                )
        if declared_links and not graph_has_cycle(declared_links):
            errors.append(issue("LOOP_NOT_CYCLIC", f"{path}.link_refs", "A feedback-loop declaration must contain a directed cycle."))


def validate_horizon(
    payload: Any,
    subjects: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> None:
    fields = {"kind", "precision", "raw_text", "start_at", "end_at", "duration", "event_subject_ref"}
    horizon = check_shape(payload, "$.horizon", fields, fields, errors)
    kind = enum_value(horizon.get("kind"), HORIZON_KINDS, "$.horizon.kind", errors, "HORIZON_KIND")
    precision = enum_value(
        horizon.get("precision"),
        HORIZON_PRECISIONS,
        "$.horizon.precision",
        errors,
        "HORIZON_PRECISION",
    )
    raw_text = nullable_string(horizon.get("raw_text"), "$.horizon.raw_text", errors)
    start = parse_datetime(horizon.get("start_at"), "$.horizon.start_at", errors, nullable=True)
    end = parse_datetime(horizon.get("end_at"), "$.horizon.end_at", errors, nullable=True)
    event_ref = nullable_string(horizon.get("event_subject_ref"), "$.horizon.event_subject_ref", errors)
    if event_ref is not None:
        if event_ref not in subjects:
            errors.append(issue("HORIZON_EVENT_REF", "$.horizon.event_subject_ref", f"Unknown subject: {event_ref}."))
        elif subjects[event_ref].get("type") not in EVENT_BOUND_SUBJECT_TYPES:
            errors.append(
                issue(
                    "HORIZON_EVENT_TYPE",
                    "$.horizon.event_subject_ref",
                    "event_bound must reference an event, policy, metric, signal, flow, or market_state subject.",
                )
            )

    duration = horizon.get("duration")
    duration_value: tuple[float, float] | None = None
    if duration is not None:
        duration_fields = {"min", "max", "unit"}
        duration_object = check_shape(duration, "$.horizon.duration", duration_fields, duration_fields, errors)
        minimum = duration_object.get("min")
        maximum = duration_object.get("max")
        for value, field in ((minimum, "min"), (maximum, "max")):
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                errors.append(issue("DURATION_VALUE", f"$.horizon.duration.{field}", "Duration bounds must be non-negative numbers."))
        enum_value(duration_object.get("unit"), DURATION_UNITS, "$.horizon.duration.unit", errors, "DURATION_UNIT")
        if isinstance(minimum, (int, float)) and not isinstance(minimum, bool) and isinstance(maximum, (int, float)) and not isinstance(maximum, bool):
            duration_value = (float(minimum), float(maximum))
            if maximum < minimum:
                errors.append(issue("DURATION_ORDER", "$.horizon.duration", "Duration max must be greater than or equal to min."))

    if kind == "unspecified":
        if precision != "none" or any(value is not None for value in (raw_text, start, end, duration, event_ref)):
            errors.append(issue("HORIZON_UNSPECIFIED", "$.horizon", "unspecified horizon requires precision none and no timing fields."))
    elif kind == "instant":
        if precision not in {"exact", "approximate"} or end is None or raw_text is None:
            errors.append(issue("HORIZON_INSTANT", "$.horizon", "instant requires raw text, an end_at point, and exact or approximate precision."))
        if start is not None or duration is not None or event_ref is not None:
            errors.append(issue("HORIZON_INSTANT_FIELDS", "$.horizon", "instant cannot contain start, duration, or event fields."))
    elif kind == "window":
        if precision not in {"exact", "bounded", "approximate"} or start is None or end is None or raw_text is None:
            errors.append(issue("HORIZON_WINDOW", "$.horizon", "window requires raw text, start_at, end_at, and bounded timing precision."))
        if start is not None and end is not None and end < start:
            errors.append(issue("HORIZON_ORDER", "$.horizon", "Horizon end_at must not precede start_at."))
        if duration is not None or event_ref is not None:
            errors.append(issue("HORIZON_WINDOW_FIELDS", "$.horizon", "window cannot contain duration or event fields."))
    elif kind == "duration":
        if precision not in {"exact", "bounded", "approximate"} or duration_value is None or raw_text is None:
            errors.append(issue("HORIZON_DURATION", "$.horizon", "duration requires raw text, numeric duration, and numeric precision."))
        if start is not None or end is not None or event_ref is not None:
            errors.append(issue("HORIZON_DURATION_FIELDS", "$.horizon", "duration cannot contain dates or event fields."))
    elif kind == "event_bound":
        if precision not in {"bounded", "approximate", "qualitative"} or event_ref is None or raw_text is None:
            errors.append(issue("HORIZON_EVENT", "$.horizon", "event_bound requires raw text, an event subject, and non-exact precision."))
        if start is not None or end is not None or duration is not None:
            errors.append(issue("HORIZON_EVENT_FIELDS", "$.horizon", "event_bound cannot contain dates or duration."))
    elif kind == "structural":
        if precision != "qualitative" or raw_text is None:
            errors.append(issue("HORIZON_STRUCTURAL", "$.horizon", "structural requires qualitative precision and raw text."))
        if start is not None or end is not None or duration is not None or event_ref is not None:
            errors.append(issue("HORIZON_STRUCTURAL_FIELDS", "$.horizon", "structural cannot contain dates, duration, or event fields."))


def validate_proprietary_signal(
    payload: Any,
    subjects: dict[str, dict[str, Any]],
    source_units: dict[str, dict[str, Any]],
    claims: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> None:
    if payload is None:
        return
    fields = {"signal_subject_ref", "name", "replicability", "formula", "segmentation", "source_unit_refs", "claim_refs"}
    signal = check_shape(payload, "$.proprietary_signal", fields, fields, errors)
    signal_ref = nullable_string(signal.get("signal_subject_ref"), "$.proprietary_signal.signal_subject_ref", errors)
    if signal_ref is not None:
        if signal_ref not in subjects:
            errors.append(issue("SIGNAL_SUBJECT_REF", "$.proprietary_signal.signal_subject_ref", f"Unknown subject: {signal_ref}."))
        elif subjects[signal_ref].get("type") != "signal":
            errors.append(issue("SIGNAL_SUBJECT_TYPE", "$.proprietary_signal.signal_subject_ref", "Proprietary signal must reference a signal subject."))
    if not nonempty(signal.get("name")):
        errors.append(issue("SIGNAL_NAME", "$.proprietary_signal.name", "Signal name is required."))
    enum_value(signal.get("replicability"), {"exact", "partial", "opaque"}, "$.proprietary_signal.replicability", errors, "SIGNAL_REPLICABILITY")
    segmentation = string_list(signal.get("segmentation"), "$.proprietary_signal.segmentation", errors)
    del segmentation
    source_refs = string_list(signal.get("source_unit_refs"), "$.proprietary_signal.source_unit_refs", errors, minimum=1)
    check_refs(source_refs, source_units, "$.proprietary_signal.source_unit_refs", errors, "SIGNAL_SOURCE_REF")
    claim_refs = string_list(signal.get("claim_refs"), "$.proprietary_signal.claim_refs", errors, minimum=1)
    check_refs(claim_refs, claims, "$.proprietary_signal.claim_refs", errors, "SIGNAL_CLAIM_REF")

    formula_fields = {"operator", "expression", "output_unit", "inputs"}
    formula = check_shape(signal.get("formula"), "$.proprietary_signal.formula", formula_fields, formula_fields, errors)
    operator = enum_value(formula.get("operator"), FORMULA_OPERATORS, "$.proprietary_signal.formula.operator", errors, "FORMULA_OPERATOR")
    if not nonempty(formula.get("expression")):
        errors.append(issue("FORMULA_EXPRESSION", "$.proprietary_signal.formula.expression", "Formula expression is required."))
    if not nonempty(formula.get("output_unit")):
        errors.append(issue("FORMULA_OUTPUT_UNIT", "$.proprietary_signal.formula.output_unit", "Formula output unit is required."))
    input_fields = {"input_id", "subject_ref", "role", "unit", "transformation"}
    input_ids: set[str] = set()
    roles: list[str] = []
    for index, raw_input in enumerate(object_list(formula.get("inputs"), "$.proprietary_signal.formula.inputs", errors, minimum=1)):
        path = f"$.proprietary_signal.formula.inputs[{index}]"
        formula_input = check_shape(raw_input, path, input_fields, input_fields, errors)
        input_id = formula_input.get("input_id")
        if not nonempty(input_id):
            errors.append(issue("FORMULA_INPUT_ID", f"{path}.input_id", "Formula input ID is required."))
        elif input_id in input_ids:
            errors.append(issue("FORMULA_INPUT_DUPLICATE", f"{path}.input_id", f"Duplicate formula input ID: {input_id}."))
        else:
            input_ids.add(input_id)
        subject_ref = nullable_string(formula_input.get("subject_ref"), f"{path}.subject_ref", errors)
        if subject_ref is not None and subject_ref not in subjects:
            errors.append(issue("FORMULA_SUBJECT_REF", f"{path}.subject_ref", f"Unknown subject: {subject_ref}."))
        role = enum_value(formula_input.get("role"), FORMULA_INPUT_ROLES, f"{path}.role", errors, "FORMULA_INPUT_ROLE")
        if role in FORMULA_INPUT_ROLES:
            roles.append(role)
        if not nonempty(formula_input.get("unit")):
            errors.append(issue("FORMULA_INPUT_UNIT", f"{path}.unit", "Formula input unit is required."))
        nullable_string(formula_input.get("transformation"), f"{path}.transformation", errors)
    if operator == "ratio" and not {"numerator", "denominator"}.issubset(set(roles)):
        errors.append(issue("RATIO_INPUTS", "$.proprietary_signal.formula.inputs", "ratio requires numerator and denominator inputs."))


def validate_resolution(
    payload: Any,
    claims: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> None:
    fields = {"explicitness", "criterion", "deadline"}
    resolution = check_shape(payload, "$.resolution", fields, fields, errors)
    explicitness = enum_value(
        resolution.get("explicitness"),
        {"none", "partial", "implicit", "explicit"},
        "$.resolution.explicitness",
        errors,
        "RESOLUTION_EXPLICITNESS",
    )
    criterion = resolution.get("criterion")
    deadline = resolution.get("deadline")
    criterion_status: str | None = None
    deadline_status: str | None = None
    if criterion is not None:
        criterion_fields = {"text", "status", "claim_refs"}
        criterion_object = check_shape(criterion, "$.resolution.criterion", criterion_fields, criterion_fields, errors)
        if not nonempty(criterion_object.get("text")):
            errors.append(issue("RESOLUTION_CRITERION", "$.resolution.criterion.text", "Resolution criterion text is required."))
        criterion_status = enum_value(
            criterion_object.get("status"),
            {"explicit", "inferred"},
            "$.resolution.criterion.status",
            errors,
            "RESOLUTION_STATUS",
        )
        refs = string_list(criterion_object.get("claim_refs"), "$.resolution.criterion.claim_refs", errors, minimum=1)
        check_refs(refs, claims, "$.resolution.criterion.claim_refs", errors, "RESOLUTION_CLAIM_REF")
    if deadline is not None:
        deadline_fields = {"raw_text", "normalized_at", "status", "claim_refs"}
        deadline_object = check_shape(deadline, "$.resolution.deadline", deadline_fields, deadline_fields, errors)
        if not nonempty(deadline_object.get("raw_text")):
            errors.append(issue("RESOLUTION_DEADLINE", "$.resolution.deadline.raw_text", "Resolution deadline text is required."))
        parse_datetime(deadline_object.get("normalized_at"), "$.resolution.deadline.normalized_at", errors, nullable=True)
        deadline_status = enum_value(
            deadline_object.get("status"),
            {"explicit", "inferred"},
            "$.resolution.deadline.status",
            errors,
            "RESOLUTION_STATUS",
        )
        refs = string_list(deadline_object.get("claim_refs"), "$.resolution.deadline.claim_refs", errors, minimum=1)
        check_refs(refs, claims, "$.resolution.deadline.claim_refs", errors, "RESOLUTION_CLAIM_REF")

    present_count = int(criterion is not None) + int(deadline is not None)
    if explicitness == "none" and present_count:
        errors.append(issue("RESOLUTION_NONE", "$.resolution", "none resolution cannot contain criterion or deadline."))
    elif explicitness == "partial" and present_count != 1:
        errors.append(issue("RESOLUTION_PARTIAL", "$.resolution", "partial resolution requires exactly one of criterion or deadline."))
    elif explicitness == "implicit":
        if present_count != 2 or (criterion_status == "explicit" and deadline_status == "explicit"):
            errors.append(issue("RESOLUTION_IMPLICIT", "$.resolution", "implicit resolution requires criterion and deadline with at least one inferred field."))
    elif explicitness == "explicit":
        if present_count != 2 or criterion_status != "explicit" or deadline_status != "explicit":
            errors.append(
                issue(
                    "EXPLICIT_SETTLEMENT",
                    "$.resolution",
                    "Explicit settlement requires an explicit criterion and an explicit deadline.",
                )
            )


def validate_quality(payload: Any, state: Any, errors: list[dict[str, str]]) -> None:
    fields = {"decision", "warnings", "hard_failures"}
    quality = check_shape(payload, "$.quality_report", fields, fields, errors)
    decision = enum_value(
        quality.get("decision"),
        {"ready", "conditional", "blocked"},
        "$.quality_report.decision",
        errors,
        "QUALITY_DECISION",
    )
    warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if state == "conditional" and (decision != "conditional" or not warnings or failures):
        errors.append(issue("CONDITIONAL_QUALITY", "$.quality_report", "conditional state requires conditional decision, warnings, and no hard failures."))
    if state in {"ready", "frozen"} and (decision != "ready" or warnings or failures):
        errors.append(issue("READY_QUALITY", "$.quality_report", "ready or frozen state requires a clean ready quality report."))
    if decision == "blocked" and not failures:
        errors.append(issue("BLOCKED_FAILURE", "$.quality_report.hard_failures", "blocked quality requires a hard failure."))
    if failures and decision != "blocked":
        errors.append(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."))


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}
    check_shape(payload, "$", ROOT_FIELDS, ROOT_FIELDS, errors)
    if payload.get("schema_version") != "market-view-semantics-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-view-semantics-v1."))
    if not re.fullmatch(r"MVSEM_[A-Za-z0-9_:-]{8,}", str(payload.get("semantics_id") or "")):
        errors.append(issue("SEMANTICS_ID", "$.semantics_id", "Invalid semantics ID."))
    revision = payload.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = enum_value(payload.get("state"), {"draft", "conditional", "ready", "frozen"}, "$.state", errors, "STATE")

    validate_lineage(payload.get("lineage"), errors)
    speakers, speaker_source_refs = validate_speakers(payload.get("speakers"), errors)
    current_creator_ref = nullable_string(payload.get("current_creator_ref"), "$.current_creator_ref", errors)
    creator_speakers = [speaker_id for speaker_id, speaker in speakers.items() if speaker.get("role") == "current_creator"]
    if len(creator_speakers) > 1:
        errors.append(issue("CREATOR_COUNT", "$.speakers", "At most one speaker may have current_creator role."))
    if current_creator_ref is None and creator_speakers:
        errors.append(issue("CREATOR_REF_REQUIRED", "$.current_creator_ref", "A current_creator speaker requires current_creator_ref."))
    if current_creator_ref is not None:
        if current_creator_ref not in speakers:
            errors.append(issue("CURRENT_CREATOR_REF", "$.current_creator_ref", f"Unknown speaker: {current_creator_ref}."))
        elif speakers[current_creator_ref].get("role") != "current_creator":
            errors.append(issue("CURRENT_CREATOR_ROLE", "$.current_creator_ref", "current_creator_ref must point to a current_creator speaker."))

    source_units, source_claim_refs, statuses = validate_source_units(payload.get("source_units"), speakers, errors)
    for speaker_id, refs in speaker_source_refs.items():
        check_refs(refs, source_units, f"$.speakers[{speaker_id}].source_unit_refs", errors, "SPEAKER_SOURCE_REF")
        for ref in refs:
            if ref in source_units and source_units[ref].get("speaker_ref") != speaker_id:
                errors.append(
                    issue(
                        "SPEAKER_SOURCE_RECIPROCAL",
                        f"$.speakers[{speaker_id}].source_unit_refs",
                        f"Source unit {ref} does not point back to speaker {speaker_id}.",
                    )
                )
    for unit_id, unit in source_units.items():
        speaker_ref = unit.get("speaker_ref")
        if nonempty(speaker_ref) and unit_id not in speaker_source_refs.get(speaker_ref, []):
            errors.append(
                issue(
                    "SOURCE_SPEAKER_RECIPROCAL",
                    f"$.source_units[{unit_id}].speaker_ref",
                    f"Speaker {speaker_ref} does not list source unit {unit_id}.",
                )
            )
    validate_source_completeness(payload.get("source_completeness"), statuses, errors, warnings)
    subjects = validate_subjects(payload.get("subjects"), source_units, errors)
    claims = validate_claims(
        payload.get("claims"),
        speakers,
        current_creator_ref,
        source_units,
        subjects,
        errors,
    )

    primary_ref = nullable_string(payload.get("primary_claim_ref"), "$.primary_claim_ref", errors)
    primary_ids = [claim_id for claim_id, claim in claims.items() if claim.get("role") == "primary"]
    if len(primary_ids) != 1:
        errors.append(issue("PRIMARY_CLAIM_COUNT", "$.claims", "Exactly one claim must have primary role."))
    if primary_ref is not None:
        if primary_ref not in claims:
            errors.append(issue("PRIMARY_CLAIM_REF", "$.primary_claim_ref", f"Unknown claim: {primary_ref}."))
        elif claims[primary_ref].get("role") != "primary":
            errors.append(issue("PRIMARY_CLAIM_ROLE", "$.primary_claim_ref", "primary_claim_ref must point to the primary claim."))

    for unit_id, refs in source_claim_refs.items():
        check_refs(refs, claims, f"$.source_units[{unit_id}].claim_refs", errors, "SOURCE_CLAIM_REF")
        for ref in refs:
            if ref in claims and unit_id not in claims[ref].get("source_unit_refs", []):
                errors.append(
                    issue(
                        "SOURCE_CLAIM_RECIPROCAL",
                        f"$.source_units[{unit_id}].claim_refs",
                        f"Claim {ref} does not point back to source unit {unit_id}.",
                    )
                )
    for claim_id, claim in claims.items():
        for source_ref in claim.get("source_unit_refs", []):
            if source_ref in source_units and claim_id not in source_claim_refs.get(source_ref, []):
                errors.append(
                    issue(
                        "CLAIM_SOURCE_RECIPROCAL",
                        f"$.claims[{claim_id}].source_unit_refs",
                        f"Source unit {source_ref} does not list claim {claim_id}.",
                    )
                )

    validate_causality(payload.get("causal_links"), payload.get("feedback_loops"), subjects, claims, errors)
    validate_posture(payload.get("posture"), claims, subjects, errors)
    validate_horizon(payload.get("horizon"), subjects, errors)
    validate_proprietary_signal(payload.get("proprietary_signal"), subjects, source_units, claims, errors)
    validate_resolution(payload.get("resolution"), claims, errors)
    validate_quality(payload.get("quality_report"), state, errors)
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="Path to a MarketViewSemanticsV1 JSON artifact.")
    args = parser.parse_args()
    try:
        payload = json.loads(args.artifact.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        result = {"valid": False, "errors": [issue("LOAD", "$", str(exc))], "warnings": []}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
