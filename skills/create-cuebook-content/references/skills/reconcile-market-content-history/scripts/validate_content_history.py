#!/usr/bin/env python3
"""Validate ContentHistoryLedgerV1 publication, correction, and outcome invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_FIELDS = {"schema_version", "ledger_id", "workflow_ref", "release_refs", "as_of", "reconciliation_cutoff_at", "ruleset_version", "publication_receipts", "corrections", "artifact_invalidations", "content_performance", "market_outcomes", "trade_reconciliations", "learning_snapshots", "audit_events", "quality_report"}
SECTIONS = ("publication_receipts", "corrections", "artifact_invalidations", "content_performance", "market_outcomes", "trade_reconciliations", "learning_snapshots", "audit_events")
RECEIPT_TRANSITIONS = {
    None: {"not_attempted", "attempted", "failed", "ambiguous"},
    "not_attempted": {"attempted"}, "attempted": {"acknowledged", "failed", "ambiguous"},
    "acknowledged": {"verified_published", "failed", "ambiguous"},
    "verified_published": {"edited", "corrected", "retracted", "removed"},
    "edited": {"corrected", "retracted", "removed"}, "corrected": {"retracted", "removed"},
    "failed": set(), "ambiguous": set(), "retracted": {"removed"}, "removed": set(),
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any, path: str, errors: list[dict[str, str]], nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not value:
        errors.append(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("TIME_FORMAT", path, "Invalid ISO timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."))
        return None
    return parsed


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ContentHistoryLedgerV1 must be an object.")], "warnings": []}
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "content-history-ledger-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-history-ledger-v1."))
    if not re.fullmatch(r"CHL_[a-z0-9]{8,64}", str(payload.get("ledger_id") or "")):
        errors.append(issue("LEDGER_ID", "$.ledger_id", "Invalid ledger ID."))
    if not str(payload.get("workflow_ref") or "").startswith("WF_"):
        errors.append(issue("WORKFLOW_REF", "$.workflow_ref", "workflow_ref must be a WF_* ID."))
    if not isinstance(payload.get("release_refs"), list):
        errors.append(issue("RELEASE_REFS", "$.release_refs", "release_refs must be an array."))
    as_of = parse_time(payload.get("as_of"), "$.as_of", errors)
    cutoff = parse_time(payload.get("reconciliation_cutoff_at"), "$.reconciliation_cutoff_at", errors)
    if as_of and cutoff and cutoff > as_of:
        errors.append(issue("CUTOFF_AFTER_AS_OF", "$.reconciliation_cutoff_at", "Cutoff cannot be after as_of."))
    if not str(payload.get("ruleset_version") or "").strip():
        errors.append(issue("RULESET", "$.ruleset_version", "ruleset_version is required."))
    sections: dict[str, list[Any]] = {}
    for section in SECTIONS:
        value = payload.get(section)
        if not isinstance(value, list):
            errors.append(issue("ARRAY_REQUIRED", f"$.{section}", f"{section} must be an array."))
            value = []
        sections[section] = value

    receipts: dict[str, dict[str, Any]] = {}
    receipt_paths: dict[str, str] = {}
    remote_keys: set[tuple[str, str]] = set()
    ambiguous_keys: dict[tuple[str, str], set[str]] = {}
    for index, receipt in enumerate(sections["publication_receipts"]):
        path = f"$.publication_receipts[{index}]"
        if not isinstance(receipt, dict):
            errors.append(issue("RECEIPT_TYPE", path, "Receipt must be an object."))
            continue
        receipt_id = str(receipt.get("receipt_id") or "")
        if not receipt_id.startswith("REC_"):
            errors.append(issue("RECEIPT_ID", f"{path}.receipt_id", "Expected REC_* ID."))
        if receipt_id in receipts:
            errors.append(issue("DUPLICATE_RECEIPT", f"{path}.receipt_id", "Duplicate receipt ID."))
        receipts[receipt_id] = receipt
        receipt_paths[receipt_id] = path
        if receipt.get("release_ref") not in (payload.get("release_refs") or []):
            errors.append(issue("UNKNOWN_RELEASE_REF", f"{path}.release_ref", "Receipt release is not registered at the ledger root."))
        attempted = parse_time(receipt.get("attempted_at"), f"{path}.attempted_at", errors, nullable=True)
        acknowledged = parse_time(receipt.get("acknowledged_at"), f"{path}.acknowledged_at", errors, nullable=True)
        verified = parse_time(receipt.get("verified_at"), f"{path}.verified_at", errors, nullable=True)
        if attempted and acknowledged and attempted > acknowledged:
            errors.append(issue("RECEIPT_TIME_ORDER", path, "attempted_at cannot be after acknowledged_at."))
        if acknowledged and verified and acknowledged > verified:
            errors.append(issue("RECEIPT_TIME_ORDER", path, "acknowledged_at cannot be after verified_at."))
        if cutoff and any(t and t > cutoff for t in (attempted, acknowledged, verified)):
            errors.append(issue("RECEIPT_AFTER_CUTOFF", path, "Receipt contains a state after the reconciliation cutoff."))
        status = receipt.get("status")
        if status in {"attempted", "acknowledged", "verified_published", "failed", "ambiguous", "edited", "corrected", "retracted", "removed"} and attempted is None:
            errors.append(issue("ATTEMPT_TIME_REQUIRED", f"{path}.attempted_at", "Attempted or later state requires attempted_at."))
        if status in {"acknowledged", "verified_published", "edited", "corrected", "retracted", "removed"} and acknowledged is None:
            errors.append(issue("ACK_TIME_REQUIRED", f"{path}.acknowledged_at", "Acknowledged or later state requires acknowledged_at."))
        if status in {"verified_published", "edited", "corrected", "retracted", "removed"}:
            for key in ("remote_id", "verification_locator"):
                if not str(receipt.get(key) or "").strip():
                    errors.append(issue("VERIFIED_RECEIPT_FIELD", f"{path}.{key}", f"{key} is required for verified publication."))
            if verified is None:
                errors.append(issue("VERIFIED_TIME_REQUIRED", f"{path}.verified_at", "Verified publication requires verified_at."))
            if receipt.get("verification_method") == "none":
                errors.append(issue("VERIFICATION_METHOD", f"{path}.verification_method", "Verified publication requires a verification method."))
            remote_key = (str(receipt.get("platform") or ""), str(receipt.get("remote_id") or ""))
            if remote_key in remote_keys:
                errors.append(issue("DUPLICATE_REMOTE_OBJECT", path, "Remote platform object is registered twice."))
            remote_keys.add(remote_key)
        if status == "ambiguous":
            group = (str(receipt.get("platform") or ""), str(receipt.get("release_item_ref") or ""))
            ambiguous_keys.setdefault(group, set()).add(str(receipt.get("idempotency_key") or ""))
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(receipt.get("payload_hash") or "")):
            errors.append(issue("PAYLOAD_HASH", f"{path}.payload_hash", "Invalid payload hash."))
    for group, keys in ambiguous_keys.items():
        if len(keys) > 1:
            errors.append(issue("AMBIGUOUS_RETRY", "$.publication_receipts", f"Ambiguous item {group} was retried with different idempotency keys."))

    corrections: dict[str, dict[str, Any]] = {}
    correction_paths: dict[str, str] = {}
    for index, correction in enumerate(sections["corrections"]):
        path = f"$.corrections[{index}]"
        if not isinstance(correction, dict):
            errors.append(issue("CORRECTION_TYPE", path, "Correction must be an object."))
            continue
        correction_id = str(correction.get("correction_id") or "")
        if correction_id in corrections:
            errors.append(issue("DUPLICATE_CORRECTION", f"{path}.correction_id", "Duplicate correction ID."))
        corrections[correction_id] = correction
        correction_paths[correction_id] = path
        detected = parse_time(correction.get("detected_at"), f"{path}.detected_at", errors)
        effective = parse_time(correction.get("effective_at"), f"{path}.effective_at", errors)
        if detected and effective and effective < detected:
            errors.append(issue("CORRECTION_TIME_ORDER", path, "effective_at cannot precede detected_at."))
        if cutoff and effective and effective > cutoff:
            errors.append(issue("CORRECTION_AFTER_CUTOFF", f"{path}.effective_at", "Correction is after the reconciliation cutoff."))
        if correction.get("severity") in {"material", "critical"}:
            if correction.get("public_action") == "none":
                errors.append(issue("MATERIAL_PUBLIC_ACTION", f"{path}.public_action", "Material correction requires a public action."))
            if not correction.get("affected_artifact_refs"):
                errors.append(issue("MATERIAL_AFFECTED_ARTIFACTS", f"{path}.affected_artifact_refs", "Material correction requires affected artifacts."))
            if correction.get("status") in {"approved", "propagating", "complete"} and not correction.get("approver_ref"):
                errors.append(issue("CORRECTION_APPROVER", f"{path}.approver_ref", "Approved correction requires an approver."))
        if correction.get("propagation_status") == "complete" and correction.get("status") != "complete":
            errors.append(issue("PROPAGATION_STATE", path, "Complete propagation requires complete correction status."))

    invalidated_by_correction: dict[str, set[str]] = {}
    invalidation_ids: set[str] = set()
    for index, invalidation in enumerate(sections["artifact_invalidations"]):
        path = f"$.artifact_invalidations[{index}]"
        if not isinstance(invalidation, dict):
            errors.append(issue("INVALIDATION_TYPE", path, "Invalidation must be an object."))
            continue
        invalidation_id = invalidation.get("invalidation_id")
        if invalidation_id in invalidation_ids:
            errors.append(issue("DUPLICATE_INVALIDATION", f"{path}.invalidation_id", "Duplicate invalidation ID."))
        invalidation_ids.add(invalidation_id)
        correction_ref = invalidation.get("correction_ref")
        if correction_ref not in corrections:
            errors.append(issue("UNKNOWN_CORRECTION_REF", f"{path}.correction_ref", "Invalidation correction does not resolve."))
        invalidated_by_correction.setdefault(str(correction_ref), set()).add(str(invalidation.get("artifact_ref") or ""))
        invalidated_at = parse_time(invalidation.get("invalidated_at"), f"{path}.invalidated_at", errors)
        if cutoff and invalidated_at and invalidated_at > cutoff:
            errors.append(issue("INVALIDATION_AFTER_CUTOFF", f"{path}.invalidated_at", "Invalidation is after cutoff."))
    for correction_id, correction in corrections.items():
        if correction.get("severity") in {"material", "critical"} and correction.get("propagation_status") == "complete":
            expected = set(correction.get("affected_artifact_refs") or [])
            actual = invalidated_by_correction.get(correction_id, set())
            if not expected <= actual:
                errors.append(issue("INCOMPLETE_INVALIDATION_CASCADE", correction_paths[correction_id], f"Missing invalidations for {sorted(expected - actual)}."))

    content_ids: set[str] = set()
    for index, snapshot in enumerate(sections["content_performance"]):
        path = f"$.content_performance[{index}]"
        if not isinstance(snapshot, dict):
            errors.append(issue("CONTENT_SNAPSHOT_TYPE", path, "Content snapshot must be an object."))
            continue
        snapshot_id = snapshot.get("snapshot_id"); content_ids.add(snapshot_id)
        receipt = receipts.get(snapshot.get("receipt_ref"))
        if receipt is None:
            errors.append(issue("UNKNOWN_RECEIPT_REF", f"{path}.receipt_ref", "Content snapshot receipt does not resolve."))
        elif receipt.get("status") not in {"verified_published", "edited", "corrected", "retracted", "removed"}:
            errors.append(issue("PERFORMANCE_UNVERIFIED_PUBLICATION", f"{path}.receipt_ref", "Performance requires a verified published object."))
        start = parse_time(snapshot.get("window_start"), f"{path}.window_start", errors)
        end = parse_time(snapshot.get("window_end"), f"{path}.window_end", errors)
        observed = parse_time(snapshot.get("observed_at"), f"{path}.observed_at", errors)
        if start and end and start > end:
            errors.append(issue("CONTENT_WINDOW", path, "window_start cannot be after window_end."))
        if end and observed and end > observed:
            errors.append(issue("CONTENT_OBSERVED_EARLY", path, "Snapshot cannot observe a window before it closes."))
        if cutoff and observed and observed > cutoff:
            errors.append(issue("CONTENT_AFTER_CUTOFF", f"{path}.observed_at", "Content snapshot is after cutoff."))
        if snapshot.get("use_scope") != "packaging_only":
            errors.append(issue("CONTENT_USE_SCOPE", f"{path}.use_scope", "Content performance is packaging_only."))

    market_ids: set[str] = set()
    for index, outcome in enumerate(sections["market_outcomes"]):
        path = f"$.market_outcomes[{index}]"
        if not isinstance(outcome, dict):
            errors.append(issue("MARKET_OUTCOME_TYPE", path, "Market outcome must be an object."))
            continue
        market_ids.add(outcome.get("outcome_id"))
        start = parse_time(outcome.get("window_start"), f"{path}.window_start", errors)
        end = parse_time(outcome.get("window_end"), f"{path}.window_end", errors)
        observed = parse_time(outcome.get("observed_at"), f"{path}.observed_at", errors)
        if start and end and start > end:
            errors.append(issue("MARKET_WINDOW", path, "window_start cannot be after window_end."))
        if outcome.get("status") in {"window_closed", "frozen", "eligible"} and end and observed and end > observed:
            errors.append(issue("MARKET_OBSERVED_EARLY", path, "Closed outcome window must end before observation."))
        if cutoff and observed and observed > cutoff:
            errors.append(issue("MARKET_AFTER_CUTOFF", f"{path}.observed_at", "Market outcome is after cutoff."))
        if outcome.get("use_scope") not in {"idea_scorecard", "calibration_only"}:
            errors.append(issue("MARKET_USE_SCOPE", f"{path}.use_scope", "Market outcome cannot be a track record."))

    trade_ids: set[str] = set()
    for index, trade in enumerate(sections["trade_reconciliations"]):
        path = f"$.trade_reconciliations[{index}]"
        if not isinstance(trade, dict):
            errors.append(issue("TRADE_RECON_TYPE", path, "Trade reconciliation must be an object."))
            continue
        trade_ids.add(trade.get("reconciliation_id"))
        claim = trade.get("public_claim_eligibility")
        if claim == "eligible":
            required = (
                trade.get("record_type") == "executed",
                trade.get("verification") == "broker_reconciled",
                trade.get("fills_complete") is True,
                trade.get("fees_included") is True,
                trade.get("cohort_completeness") == "complete",
                trade.get("consent") == "record_allowed",
                trade.get("fx_treatment") != "missing",
                trade.get("corporate_actions_treatment") != "missing",
                trade.get("status") == "eligible",
            )
            if not all(required):
                errors.append(issue("PUBLIC_CLAIM_INELIGIBLE", path, "Public claim eligibility requires complete consented broker-reconciled executed history."))
        if claim == "aggregate_only" and trade.get("consent") not in {"aggregate_only", "record_allowed"}:
            errors.append(issue("AGGREGATE_CONSENT", f"{path}.consent", "Aggregate eligibility requires aggregate consent."))
        if trade.get("status") == "excluded" and not str(trade.get("exclusion_reason") or "").strip():
            errors.append(issue("EXCLUSION_REASON", f"{path}.exclusion_reason", "Excluded reconciliation requires a reason."))

    learning_ids: set[str] = set()
    for index, learning in enumerate(sections["learning_snapshots"]):
        path = f"$.learning_snapshots[{index}]"
        if not isinstance(learning, dict):
            errors.append(issue("LEARNING_TYPE", path, "Learning snapshot must be an object."))
            continue
        learning_id = learning.get("learning_snapshot_id")
        if learning_id in learning_ids:
            errors.append(issue("DUPLICATE_LEARNING", f"{path}.learning_snapshot_id", "Duplicate learning snapshot ID."))
        learning_ids.add(learning_id)
        created = parse_time(learning.get("created_at"), f"{path}.created_at", errors)
        learning_cutoff = parse_time(learning.get("cutoff_at"), f"{path}.cutoff_at", errors)
        if created and learning_cutoff and learning_cutoff > created:
            errors.append(issue("LEARNING_CUTOFF", path, "Learning cutoff cannot be after creation."))
        if learning.get("split_method") != "forward_time":
            errors.append(issue("LEARNING_SPLIT", f"{path}.split_method", "Time-dependent learning requires forward_time split."))
        refs = set(learning.get("outcome_refs") or [])
        plane = learning.get("outcome_plane")
        allowed = content_ids if plane == "content_performance" else market_ids if plane == "market_calibration" else trade_ids
        if not refs <= allowed:
            errors.append(issue("OUTCOME_PLANE_REF", f"{path}.outcome_refs", "Outcome references cross or miss the declared outcome plane."))
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(learning.get("cohort_query_hash") or "")):
            errors.append(issue("COHORT_HASH", f"{path}.cohort_query_hash", "Invalid cohort query hash."))

    objects: dict[str, str] = {receipt_id: receipt.get("status") for receipt_id, receipt in receipts.items()}
    objects.update({correction_id: correction.get("status") for correction_id, correction in corrections.items()})
    events_by_object: dict[str, list[tuple[datetime, dict[str, Any], str]]] = {}
    event_ids: set[str] = set()
    for index, event in enumerate(sections["audit_events"]):
        path = f"$.audit_events[{index}]"
        if not isinstance(event, dict):
            errors.append(issue("EVENT_TYPE", path, "Audit event must be an object."))
            continue
        if event.get("event_id") in event_ids:
            errors.append(issue("DUPLICATE_EVENT", f"{path}.event_id", "Duplicate event ID."))
        event_ids.add(event.get("event_id"))
        ref = event.get("object_ref")
        if ref not in objects:
            errors.append(issue("UNKNOWN_EVENT_OBJECT", f"{path}.object_ref", "Audit event object does not resolve."))
            continue
        occurred = parse_time(event.get("occurred_at"), f"{path}.occurred_at", errors)
        if occurred:
            events_by_object.setdefault(ref, []).append((occurred, event, path))
    for ref, current_state in objects.items():
        events = sorted(events_by_object.get(ref, []), key=lambda item: item[0])
        if not events:
            errors.append(issue("OBJECT_EVENT_REQUIRED", f"$object.{ref}", "Receipt and correction require audit events."))
            continue
        previous = None
        for _, event, path in events:
            if event.get("from_state") != previous:
                errors.append(issue("EVENT_CHAIN", path, f"Expected from_state {previous!r}."))
            if ref.startswith("REC_") and event.get("to_state") not in RECEIPT_TRANSITIONS.get(previous, set()):
                errors.append(issue("RECEIPT_TRANSITION", path, f"Invalid receipt transition {previous!r} -> {event.get('to_state')!r}."))
            previous = event.get("to_state")
        if previous != current_state:
            errors.append(issue("EVENT_STATE_MISMATCH", f"$object.{ref}", "Folded event state does not match current state."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."))
        quality = {}
    hard_failures = quality.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if hard_failures and quality.get("decision") != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."))
    expected_counts = {
        "receipts": len(sections["publication_receipts"]), "corrections": len(sections["corrections"]),
        "invalidations": len(sections["artifact_invalidations"]), "content_snapshots": len(sections["content_performance"]),
        "market_outcomes": len(sections["market_outcomes"]), "trade_reconciliations": len(sections["trade_reconciliations"]),
        "learning_snapshots": len(sections["learning_snapshots"]),
    }
    if quality.get("counts") != expected_counts:
        errors.append(issue("COUNTS", "$.quality_report.counts", f"Expected exact counts {expected_counts}."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("json_file", type=Path); args = parser.parse_args()
    result = validate(json.loads(args.json_file.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
