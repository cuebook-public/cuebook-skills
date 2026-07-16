#!/usr/bin/env python3
"""Validate deterministic CreatorFeedV1 invariants beyond JSON Schema."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED_ROOT = {
    "schema_version", "feed_id", "generated_at", "as_of", "knowledge_cutoff_at",
    "input_hash", "ruleset_version", "brief", "source_register", "entities",
    "news", "calendar_events", "narratives", "trade_ideas", "trade_history",
    "links", "quality_report",
}
HASH_RE = re.compile(r"^sha256:[a-f0-9]{64}$")
RECORD_SECTIONS = ("news", "calendar_events", "narratives", "trade_ideas", "trade_history")
ALL_LIST_SECTIONS = ("source_register", "entities", *RECORD_SECTIONS, "links")
ACTIVE = "active"


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any, path: str, errors: list[dict[str, str]], *, nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value.strip():
        errors.append(issue("TIME_REQUIRED", path, "A timezone-aware ISO timestamp is required."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("TIME_FORMAT", path, "Invalid ISO timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("TIMEZONE_REQUIRED", path, "Timestamp must include a timezone."))
        return None
    return parsed


def as_list(value: Any, path: str, errors: list[dict[str, str]]) -> list[Any]:
    if not isinstance(value, list):
        errors.append(issue("ARRAY_REQUIRED", path, "Expected an array."))
        return []
    return value


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "CreatorFeedV1 must be an object.")], "warnings": []}

    for key in sorted(REQUIRED_ROOT - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - REQUIRED_ROOT):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "creator-feed-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-feed-v1."))
    if not re.fullmatch(r"CF_[a-z0-9]{8,64}", str(payload.get("feed_id") or "")):
        errors.append(issue("FEED_ID", "$.feed_id", "feed_id must be a stable CF_* identifier."))
    if not HASH_RE.fullmatch(str(payload.get("input_hash") or "")):
        errors.append(issue("INPUT_HASH", "$.input_hash", "input_hash must be sha256:<64 lowercase hex>."))
    for key in ("ruleset_version",):
        if not str(payload.get(key) or "").strip():
            errors.append(issue("ROOT_VALUE", f"$.{key}", f"{key} is required."))

    generated_at = parse_time(payload.get("generated_at"), "$.generated_at", errors)
    as_of = parse_time(payload.get("as_of"), "$.as_of", errors)
    cutoff = parse_time(payload.get("knowledge_cutoff_at"), "$.knowledge_cutoff_at", errors)
    if generated_at and as_of and generated_at < as_of:
        warnings.append(issue("GENERATED_BEFORE_AS_OF", "$.generated_at", "Feed was generated before its stated as_of."))
    if as_of and cutoff and cutoff > as_of:
        errors.append(issue("CUTOFF_AFTER_AS_OF", "$.knowledge_cutoff_at", "knowledge cutoff cannot be after as_of."))

    brief = payload.get("brief")
    if not isinstance(brief, dict):
        errors.append(issue("BRIEF_TYPE", "$.brief", "brief must be an object."))
        brief = {}
    required_brief = {"workspace_ref", "creator_ref", "snapshot_ref", "timezone", "locale", "universe", "personalized_advice_allowed"}
    for key in sorted(required_brief - set(brief)):
        errors.append(issue("BRIEF_FIELD", f"$.brief.{key}", "Required brief field is missing."))
    if brief.get("personalized_advice_allowed") is not False:
        errors.append(issue("PERSONALIZED_ADVICE", "$.brief.personalized_advice_allowed", "Must be false."))
    if not isinstance(brief.get("universe"), list):
        errors.append(issue("UNIVERSE_TYPE", "$.brief.universe", "universe must be an array."))

    sections = {name: as_list(payload.get(name), f"$.{name}", errors) for name in ALL_LIST_SECTIONS}
    all_ids: set[str] = set()
    revision_ids: set[str] = set()
    object_paths: dict[str, str] = {}

    def register_id(obj: Any, path: str, prefix: str, *, revision: bool = False) -> str:
        if not isinstance(obj, dict):
            errors.append(issue("ENTRY_TYPE", path, "Entry must be an object."))
            return ""
        object_id = str(obj.get("id") or "")
        if not object_id.startswith(prefix):
            errors.append(issue("ID_PREFIX", f"{path}.id", f"Expected {prefix}* ID."))
        if not object_id:
            errors.append(issue("ID_REQUIRED", f"{path}.id", "ID is required."))
        elif object_id in all_ids:
            errors.append(issue("DUPLICATE_ID", f"{path}.id", f"Duplicate ID {object_id}."))
        else:
            all_ids.add(object_id)
            object_paths[object_id] = path
        if revision:
            revision_id = str(obj.get("revision_id") or "")
            if not HASH_RE.fullmatch(revision_id):
                errors.append(issue("REVISION_ID", f"{path}.revision_id", "Invalid revision hash."))
            elif revision_id in revision_ids:
                errors.append(issue("DUPLICATE_REVISION", f"{path}.revision_id", "Revision hash is duplicated."))
            else:
                revision_ids.add(revision_id)
        return object_id

    sources_by_id: dict[str, dict[str, Any]] = {}
    content_clusters: dict[str, str] = {}
    for index, source in enumerate(sections["source_register"]):
        path = f"$.source_register[{index}]"
        source_id = register_id(source, path, "SRC_", revision=True)
        if not isinstance(source, dict):
            continue
        sources_by_id[source_id] = source
        for key in ("source_type", "publisher", "locator", "access", "reuse_rights", "trust_state", "independent_cluster_id"):
            if not str(source.get(key) or "").strip():
                errors.append(issue("SOURCE_FIELD", f"{path}.{key}", f"{key} is required."))
        content_hash = str(source.get("content_hash") or "")
        if not HASH_RE.fullmatch(content_hash):
            errors.append(issue("CONTENT_HASH", f"{path}.content_hash", "Invalid content hash."))
        cluster = str(source.get("independent_cluster_id") or "")
        if content_hash in content_clusters and content_clusters[content_hash] != cluster:
            errors.append(issue("DUPLICATE_CLUSTER_SPLIT", f"{path}.independent_cluster_id", "Identical content hashes must share one independent-source cluster."))
        elif content_hash:
            content_clusters[content_hash] = cluster
        observed = parse_time(source.get("observed_at"), f"{path}.observed_at", errors)
        authorized = parse_time(source.get("authorized_at"), f"{path}.authorized_at", errors, nullable=True)
        available = parse_time(source.get("available_at"), f"{path}.available_at", errors)
        parse_time(source.get("published_at"), f"{path}.published_at", errors, nullable=True)
        parse_time(source.get("source_updated_at"), f"{path}.source_updated_at", errors, nullable=True)
        if observed and available and available < observed:
            errors.append(issue("AVAILABLE_BEFORE_OBSERVED", f"{path}.available_at", "available_at cannot precede observed_at."))
        if authorized and available and available < authorized:
            errors.append(issue("AVAILABLE_BEFORE_AUTHORIZED", f"{path}.available_at", "available_at cannot precede authorization."))
        if cutoff and available and available > cutoff and source.get("trust_state") not in {"retracted", "disputed"}:
            warnings.append(issue("SOURCE_AFTER_CUTOFF", f"{path}.available_at", "Source revision was unavailable at the feed cutoff."))
        if source.get("access") in {"restricted", "unknown"} or source.get("reuse_rights") == "unknown":
            warnings.append(issue("SOURCE_USE_UNCLEAR", path, "Source cannot be assumed usable for public content."))

    entity_ids: set[str] = set()
    for index, entity in enumerate(sections["entities"]):
        path = f"$.entities[{index}]"
        entity_id = register_id(entity, path, "ENT_")
        entity_ids.add(entity_id)
        if not isinstance(entity, dict):
            continue
        if not str(entity.get("canonical_name") or "").strip():
            errors.append(issue("ENTITY_NAME", f"{path}.canonical_name", "Canonical entity name is required."))
        aliases = as_list(entity.get("symbol_aliases"), f"{path}.symbol_aliases", errors)
        for alias_index, alias in enumerate(aliases):
            alias_path = f"{path}.symbol_aliases[{alias_index}]"
            if not isinstance(alias, dict) or not str(alias.get("symbol") or "").strip():
                errors.append(issue("SYMBOL_ALIAS", alias_path, "Alias requires a symbol."))
                continue
            valid_from = parse_time(alias.get("valid_from"), f"{alias_path}.valid_from", errors, nullable=True)
            valid_to = parse_time(alias.get("valid_to"), f"{alias_path}.valid_to", errors, nullable=True)
            if valid_from and valid_to and valid_from > valid_to:
                errors.append(issue("ALIAS_RANGE", alias_path, "Alias valid_from cannot be after valid_to."))

    prefix_by_section = {
        "news": "NEWS_", "calendar_events": "CAL_", "narratives": "NAR_",
        "trade_ideas": "IDEA_", "trade_history": "TRADE_",
    }
    records_by_id: dict[str, dict[str, Any]] = {}
    record_paths: dict[str, str] = {}
    for section in RECORD_SECTIONS:
        for index, record in enumerate(sections[section]):
            path = f"$.{section}[{index}]"
            record_id = register_id(record, path, prefix_by_section[section], revision=True)
            if not isinstance(record, dict):
                continue
            records_by_id[record_id] = record
            record_paths[record_id] = path
            status = record.get("record_status")
            if status not in {"active", "quarantined", "superseded", "retracted", "expired"}:
                errors.append(issue("RECORD_STATUS", f"{path}.record_status", "Unsupported record status."))
            available = parse_time(record.get("available_at"), f"{path}.available_at", errors)
            if status == ACTIVE and cutoff and available and available > cutoff:
                errors.append(issue("TEMPORAL_LEAKAGE", f"{path}.available_at", "Active record was unavailable at the knowledge cutoff."))
            for ref in as_list(record.get("entity_refs"), f"{path}.entity_refs", errors):
                if ref not in entity_ids:
                    errors.append(issue("UNKNOWN_ENTITY_REF", f"{path}.entity_refs", f"Unknown entity reference {ref!r}."))
            for ref in as_list(record.get("source_refs"), f"{path}.source_refs", errors):
                if ref not in sources_by_id:
                    errors.append(issue("UNKNOWN_SOURCE_REF", f"{path}.source_refs", f"Unknown source reference {ref!r}."))
                elif status == ACTIVE and sources_by_id[ref].get("trust_state") == "retracted":
                    errors.append(issue("RETRACTED_SUPPORT", f"{path}.source_refs", "Active record cannot rely on a retracted source."))

    for record_id, record in records_by_id.items():
        path = record_paths[record_id]
        if record_id.startswith("NEWS_"):
            if not record.get("source_refs"):
                errors.append(issue("NEWS_SOURCE_REQUIRED", f"{path}.source_refs", "News requires a source revision."))
            observed = parse_time(record.get("observed_at"), f"{path}.observed_at", errors)
            available = parse_time(record.get("available_at"), f"{path}.available_at", errors)
            if observed and available and available < observed:
                errors.append(issue("AVAILABLE_BEFORE_OBSERVED", f"{path}.available_at", "available_at cannot precede observed_at."))
        elif record_id.startswith("CAL_"):
            if not record.get("source_refs"):
                errors.append(issue("CALENDAR_SOURCE_REQUIRED", f"{path}.source_refs", "Calendar event requires a source."))
            parse_time(record.get("scheduled_at"), f"{path}.scheduled_at", errors)
            if record.get("event_status") == "completed_verified" and not record.get("source_refs"):
                errors.append(issue("COMPLETION_EVIDENCE", path, "Verified completion requires an owned source."))
        elif record_id.startswith("NAR_"):
            for key in ("claim", "horizon", "falsifier"):
                if not str(record.get(key) or "").strip():
                    errors.append(issue("NARRATIVE_FIELD", f"{path}.{key}", f"{key} is required."))
            if record.get("narrative_class") == "source_bound" and not record.get("source_refs"):
                errors.append(issue("SOURCE_BOUND_NARRATIVE", f"{path}.source_refs", "Source-bound narrative requires a source."))
        elif record_id.startswith("IDEA_"):
            for key in ("thesis", "horizon", "invalidation"):
                if not str(record.get(key) or "").strip():
                    errors.append(issue("IDEA_FIELD", f"{path}.{key}", f"{key} is required."))
            if record.get("execution_state") not in {"idea_only", "paper"}:
                errors.append(issue("IDEA_EXECUTION_PROMOTION", f"{path}.execution_state", "Execution belongs in trade history, not a trade idea."))
            for ref in as_list(record.get("catalyst_refs"), f"{path}.catalyst_refs", errors):
                if ref not in records_by_id or ref.startswith("TRADE_") or ref.startswith("IDEA_"):
                    errors.append(issue("UNKNOWN_CATALYST_REF", f"{path}.catalyst_refs", f"Invalid catalyst reference {ref!r}."))
        elif record_id.startswith("TRADE_"):
            idea_ref = record.get("idea_ref")
            if idea_ref is not None and (idea_ref not in records_by_id or not str(idea_ref).startswith("IDEA_")):
                errors.append(issue("UNKNOWN_IDEA_REF", f"{path}.idea_ref", "Trade history idea_ref must resolve to a trade idea."))
            opened = parse_time(record.get("opened_at"), f"{path}.opened_at", errors, nullable=True)
            closed = parse_time(record.get("closed_at"), f"{path}.closed_at", errors, nullable=True)
            recorded = parse_time(record.get("recorded_at"), f"{path}.recorded_at", errors)
            if opened and closed and opened > closed:
                errors.append(issue("TRADE_TIME_ORDER", path, "opened_at cannot be after closed_at."))
            if cutoff and closed and closed > cutoff and record.get("record_status") == ACTIVE:
                errors.append(issue("FUTURE_TRADE_OUTCOME", f"{path}.closed_at", "Active history contains an outcome after the cutoff."))
            if opened and recorded and recorded < opened:
                errors.append(issue("TRADE_RECORDED_BEFORE_OPEN", f"{path}.recorded_at", "recorded_at cannot precede opened_at."))
            if record.get("trade_type") == "executed" and record.get("execution_verification") == "not_applicable":
                errors.append(issue("EXECUTION_VERIFICATION", f"{path}.execution_verification", "Executed trade requires a verification state."))
            if record.get("trade_type") != "executed" and record.get("execution_verification") == "broker_reconciled":
                errors.append(issue("NON_EXECUTED_RECONCILIATION", f"{path}.execution_verification", "Only executed trades can be broker reconciled."))
            if record.get("public_reuse_permission") == "record_allowed" and record.get("trade_type") == "executed" and record.get("execution_verification") != "broker_reconciled":
                errors.append(issue("PUBLIC_EXECUTION_UNVERIFIED", path, "Public executed-trade reuse requires broker reconciliation."))
            if record.get("position_disclosure") == "unknown" or record.get("commercial_relationship") == "unknown":
                warnings.append(issue("DISCLOSURE_UNKNOWN", path, "Unknown material disclosure blocks a ready feed."))
            performance = record.get("performance")
            if not isinstance(performance, dict):
                errors.append(issue("PERFORMANCE_TYPE", f"{path}.performance", "performance must be an object."))
            elif record.get("trade_type") != "executed" and performance.get("basis") in {"executed_raw", "executed_reconciled"}:
                errors.append(issue("PERFORMANCE_BASIS", f"{path}.performance.basis", "Execution basis cannot be attached to a non-executed record."))

    for index, link in enumerate(sections["links"]):
        path = f"$.links[{index}]"
        register_id(link, path, "LINK_")
        if not isinstance(link, dict):
            continue
        for key in ("from_ref", "to_ref"):
            ref = link.get(key)
            if ref not in all_ids:
                errors.append(issue("UNKNOWN_LINK_REF", f"{path}.{key}", f"Unknown link endpoint {ref!r}."))
        if link.get("from_ref") == link.get("to_ref"):
            errors.append(issue("SELF_LINK", path, "A record cannot link to itself."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."))
        quality = {}
    decision = quality.get("decision")
    hard_failures = quality.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."))
    if decision == "ready" and any(w["code"] in {"SOURCE_USE_UNCLEAR", "DISCLOSURE_UNKNOWN", "SOURCE_AFTER_CUTOFF"} for w in warnings):
        errors.append(issue("READY_WITH_UNRESOLVED_GUARDS", "$.quality_report.decision", "Unresolved rights, disclosure, or cutoff warnings prevent ready."))
    counts = quality.get("record_counts")
    expected_counts = {
        "sources": len(sections["source_register"]), "entities": len(sections["entities"]),
        "news": len(sections["news"]), "calendar_events": len(sections["calendar_events"]),
        "narratives": len(sections["narratives"]), "trade_ideas": len(sections["trade_ideas"]),
        "trade_history": len(sections["trade_history"]), "links": len(sections["links"]),
        "quarantined": sum(1 for section in RECORD_SECTIONS for record in sections[section] if isinstance(record, dict) and record.get("record_status") == "quarantined"),
    }
    if counts != expected_counts:
        errors.append(issue("RECORD_COUNTS", "$.quality_report.record_counts", f"Expected exact counts {expected_counts}."))
    quarantined = quality.get("quarantined_records")
    expected_quarantined = {
        record.get("id") for section in RECORD_SECTIONS for record in sections[section]
        if isinstance(record, dict) and record.get("record_status") == "quarantined"
    }
    if not isinstance(quarantined, list) or set(quarantined) != expected_quarantined:
        errors.append(issue("QUARANTINE_INDEX", "$.quality_report.quarantined_records", "Quarantine index must exactly match quarantined records."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def validate_payload(payload: Any) -> dict[str, Any]:
    if isinstance(payload, list):
        results = [validate(item) for item in payload]
        return {"valid": all(result["valid"] for result in results), "results": results}
    return validate(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", nargs="?", type=Path)
    args = parser.parse_args()
    raw = args.json_file.read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    result = validate_payload(json.loads(raw))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result.get("valid") else 1)


if __name__ == "__main__":
    main()
