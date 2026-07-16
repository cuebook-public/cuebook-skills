#!/usr/bin/env python3
"""Validate ContentOpportunitySetV1 and optional CreatorFeedV1 references."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_FIELDS = {"schema_version", "opportunity_set_id", "feed_ref", "feed_hash", "as_of", "decision_cutoff_at", "ruleset_version", "mode", "candidates", "clusters", "selected_order", "quality_report"}
MODES = {"daily_desk", "single_subject", "event_lifecycle", "postmortem", "correction", "evergreen"}
DECISIONS = {"selected", "defer", "merge", "reject", "no_action"}
REASON_CODES = {
    "correction_required", "breaking_primary_source", "catalyst_window", "evidence_ready",
    "researchable_gap", "duplicate_merged", "expired", "permission_blocked",
    "disclosure_unknown", "conflict_material", "identity_blocked", "temporal_blocked",
    "low_novelty", "low_relevance", "postmortem_authorized", "no_public_job",
}
FACTOR_KEYS = {"timeliness", "evidence_maturity", "novelty", "audience_relevance", "explainability", "production_fit", "correction_risk", "conflict_risk"}


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


def validate(payload: Any, feed: Any | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ContentOpportunitySetV1 must be an object.")], "warnings": []}
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "content-opportunity-set-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-opportunity-set-v1."))
    if not re.fullmatch(r"OS_[a-z0-9]{8,64}", str(payload.get("opportunity_set_id") or "")):
        errors.append(issue("SET_ID", "$.opportunity_set_id", "Invalid opportunity set ID."))
    if not re.fullmatch(r"CF_[a-z0-9]{8,64}", str(payload.get("feed_ref") or "")):
        errors.append(issue("FEED_REF", "$.feed_ref", "Invalid feed reference."))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(payload.get("feed_hash") or "")):
        errors.append(issue("FEED_HASH", "$.feed_hash", "Invalid feed hash."))
    if payload.get("mode") not in MODES:
        errors.append(issue("MODE", "$.mode", "Unsupported selection mode."))
    if not str(payload.get("ruleset_version") or "").strip():
        errors.append(issue("RULESET", "$.ruleset_version", "ruleset_version is required."))
    as_of = parse_time(payload.get("as_of"), "$.as_of", errors)
    cutoff = parse_time(payload.get("decision_cutoff_at"), "$.decision_cutoff_at", errors)
    if as_of and cutoff and cutoff > as_of:
        errors.append(issue("CUTOFF_AFTER_AS_OF", "$.decision_cutoff_at", "Decision cutoff cannot be after as_of."))

    feed_records: dict[str, dict[str, Any]] = {}
    feed_entities: set[str] = set()
    if feed is not None:
        if not isinstance(feed, dict) or feed.get("schema_version") != "creator-feed-v1":
            errors.append(issue("FEED_TYPE", "$feed", "A valid CreatorFeedV1 object is required."))
        else:
            if payload.get("feed_ref") != feed.get("feed_id"):
                errors.append(issue("FEED_ID_MISMATCH", "$.feed_ref", "feed_ref does not match the supplied feed."))
            if payload.get("feed_hash") != feed.get("input_hash"):
                errors.append(issue("FEED_HASH_MISMATCH", "$.feed_hash", "feed_hash does not match the supplied feed input hash."))
            if payload.get("decision_cutoff_at") != feed.get("knowledge_cutoff_at"):
                errors.append(issue("FEED_CUTOFF_MISMATCH", "$.decision_cutoff_at", "Selection cutoff must equal the feed knowledge cutoff."))
            feed_entities = {entry.get("id") for entry in feed.get("entities", []) if isinstance(entry, dict)}
            for section in ("news", "calendar_events", "narratives", "trade_ideas", "trade_history"):
                for entry in feed.get(section, []):
                    if isinstance(entry, dict) and entry.get("id"):
                        feed_records[entry["id"]] = entry

    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        errors.append(issue("CANDIDATES_TYPE", "$.candidates", "candidates must be an array."))
        candidates = []
    candidate_ids: set[str] = set()
    selected: list[tuple[int, str]] = []
    candidates_by_id: dict[str, dict[str, Any]] = {}
    cluster_memberships: dict[str, list[str]] = {}
    conditional_selected = False
    for index, candidate in enumerate(candidates):
        path = f"$.candidates[{index}]"
        if not isinstance(candidate, dict):
            errors.append(issue("CANDIDATE_TYPE", path, "Candidate must be an object."))
            continue
        candidate_id = str(candidate.get("opportunity_id") or "")
        if not candidate_id.startswith("OPP_"):
            errors.append(issue("OPPORTUNITY_ID", f"{path}.opportunity_id", "Expected OPP_* ID."))
        if candidate_id in candidate_ids:
            errors.append(issue("DUPLICATE_OPPORTUNITY", f"{path}.opportunity_id", "Duplicate opportunity ID."))
        candidate_ids.add(candidate_id)
        candidates_by_id[candidate_id] = candidate
        for key in ("title", "thesis_seed", "audience", "dedupe_cluster_id", "tie_break_key"):
            if not str(candidate.get(key) or "").strip():
                errors.append(issue("CANDIDATE_FIELD", f"{path}.{key}", f"{key} is required."))
        anchors = candidate.get("anchor_refs")
        entities = candidate.get("entity_refs")
        history_refs = candidate.get("history_refs")
        for key, refs in (("anchor_refs", anchors), ("entity_refs", entities), ("history_refs", history_refs), ("reason_codes", candidate.get("reason_codes")), ("missing_requirements", candidate.get("missing_requirements")), ("research_requirements", candidate.get("research_requirements"))):
            if not isinstance(refs, list):
                errors.append(issue("ARRAY_REQUIRED", f"{path}.{key}", f"{key} must be an array."))
        if not anchors:
            errors.append(issue("ANCHOR_REQUIRED", f"{path}.anchor_refs", "Candidate requires at least one anchor."))
        decision = candidate.get("decision")
        if decision not in DECISIONS:
            errors.append(issue("DECISION", f"{path}.decision", "Unsupported decision."))
        if candidate.get("eligibility") == "blocked" and decision == "selected":
            errors.append(issue("SELECTED_BLOCKED", path, "Blocked candidate cannot be selected."))
        if candidate.get("permission_state") == "blocked" and decision == "selected":
            errors.append(issue("SELECTED_PERMISSION_BLOCK", path, "Permission-blocked candidate cannot be selected."))
        if candidate.get("disclosure_state") == "blocked" and decision == "selected":
            errors.append(issue("SELECTED_DISCLOSURE_BLOCK", path, "Disclosure-blocked candidate cannot be selected."))
        if decision == "selected" and candidate.get("priority") == "none":
            errors.append(issue("SELECTED_PRIORITY", f"{path}.priority", "Selected candidate needs p0, p1, or p2."))
        rank = candidate.get("selection_rank")
        if decision == "selected":
            if not isinstance(rank, int) or rank < 1:
                errors.append(issue("SELECTION_RANK", f"{path}.selection_rank", "Selected candidate needs a positive rank."))
            else:
                selected.append((rank, candidate_id))
            if candidate.get("eligibility") == "conditional" or candidate.get("evidence_state") == "conditional" or candidate.get("disclosure_state") == "unknown":
                conditional_selected = True
        elif rank is not None:
            errors.append(issue("UNSELECTED_RANK", f"{path}.selection_rank", "Only selected candidates may have a rank."))
        expires = parse_time(candidate.get("expires_at"), f"{path}.expires_at", errors, nullable=True)
        if decision == "selected" and expires and cutoff and expires <= cutoff:
            errors.append(issue("SELECTED_EXPIRED", f"{path}.expires_at", "Expired candidate cannot be selected."))
        factors = candidate.get("factor_vector")
        if not isinstance(factors, dict) or set(factors) != FACTOR_KEYS:
            errors.append(issue("FACTOR_VECTOR", f"{path}.factor_vector", "Factor vector must contain exactly the eight categorical factors."))
        elif any(value not in {"high", "medium", "low"} for value in factors.values()):
            errors.append(issue("FACTOR_VALUE", f"{path}.factor_vector", "Factors must be high, medium, or low."))
        for reason in candidate.get("reason_codes") or []:
            if reason not in REASON_CODES:
                errors.append(issue("REASON_CODE", f"{path}.reason_codes", f"Unsupported reason code {reason!r}."))
        if candidate.get("evidence_state") == "ready" and candidate.get("missing_requirements"):
            errors.append(issue("READY_WITH_GAPS", f"{path}.missing_requirements", "Evidence-ready candidate cannot retain missing requirements."))
        if candidate.get("lifecycle") == "correction" or candidate.get("editorial_job") == "correction":
            if candidate.get("priority") != "p0" or "correction_required" not in (candidate.get("reason_codes") or []):
                errors.append(issue("CORRECTION_PRIORITY", path, "Correction requires p0 and correction_required."))
        if candidate.get("priority") == "p0" and candidate.get("editorial_job") not in {"correction", "risk_alert"}:
            errors.append(issue("P0_SCOPE", f"{path}.priority", "p0 is reserved for corrections and material risk alerts."))
        if decision == "merge":
            if not candidate.get("merged_into"):
                errors.append(issue("MERGE_TARGET", f"{path}.merged_into", "Merged candidate requires a canonical target."))
            if "duplicate_merged" not in (candidate.get("reason_codes") or []):
                errors.append(issue("MERGE_REASON", f"{path}.reason_codes", "Merged candidate requires duplicate_merged."))
        elif candidate.get("merged_into") is not None:
            errors.append(issue("UNEXPECTED_MERGE_TARGET", f"{path}.merged_into", "Only merged candidates may set merged_into."))
        if history_refs and candidate.get("history_use") not in {"conflict_check", "disclosure", "pre_registered_postmortem"}:
            errors.append(issue("HISTORY_USE", f"{path}.history_use", "History references require an allowed use."))
        if not history_refs and candidate.get("history_use") is not None:
            errors.append(issue("HISTORY_USE_WITHOUT_REFS", f"{path}.history_use", "History use requires history references."))
        if candidate.get("lifecycle") == "trade_postmortem":
            if not history_refs or candidate.get("history_use") != "pre_registered_postmortem":
                errors.append(issue("POSTMORTEM_HISTORY", path, "Trade postmortem requires authorized history and pre_registered_postmortem use."))

        cluster_memberships.setdefault(str(candidate.get("dedupe_cluster_id") or ""), []).append(candidate_id)

        if feed_records:
            active_anchor_types: set[str] = set()
            for ref in anchors or []:
                record = feed_records.get(ref)
                if record is None:
                    errors.append(issue("UNKNOWN_ANCHOR_REF", f"{path}.anchor_refs", f"Unknown feed record {ref!r}."))
                    continue
                active_anchor_types.add(ref.split("_", 1)[0])
                if decision == "selected" and record.get("record_status") != "active":
                    errors.append(issue("SELECTED_INACTIVE_ANCHOR", f"{path}.anchor_refs", f"Selected anchor {ref} is not active."))
                available = parse_time(record.get("available_at"), f"$feed.{ref}.available_at", errors)
                if decision == "selected" and cutoff and available and available > cutoff:
                    errors.append(issue("SELECTED_FUTURE_ANCHOR", f"{path}.anchor_refs", f"Anchor {ref} was unavailable at cutoff."))
            for ref in entities or []:
                if ref not in feed_entities:
                    errors.append(issue("UNKNOWN_ENTITY_REF", f"{path}.entity_refs", f"Unknown feed entity {ref!r}."))
            for ref in history_refs or []:
                record = feed_records.get(ref)
                if record is None or not ref.startswith("TRADE_"):
                    errors.append(issue("UNKNOWN_HISTORY_REF", f"{path}.history_refs", f"Invalid history reference {ref!r}."))
                elif candidate.get("lifecycle") == "trade_postmortem" and record.get("public_reuse_permission") not in {"aggregate_only", "record_allowed"}:
                    errors.append(issue("POSTMORTEM_PERMISSION", f"{path}.history_refs", "Postmortem history lacks public reuse permission."))
            if candidate.get("evidence_state") == "ready" and active_anchor_types and active_anchor_types <= {"NAR", "IDEA", "CAL"}:
                errors.append(issue("INFERENCE_ONLY_READY", f"{path}.evidence_state", "Narrative, idea, or schedule-only candidate cannot be evidence-ready."))

    for candidate_id, candidate in candidates_by_id.items():
        target = candidate.get("merged_into")
        if target is not None and (target not in candidates_by_id or target == candidate_id):
            errors.append(issue("INVALID_MERGE_TARGET", f"$.candidates[{candidate_id}].merged_into", "Merge target must resolve to a different candidate."))

    clusters = payload.get("clusters")
    if not isinstance(clusters, list):
        errors.append(issue("CLUSTERS_TYPE", "$.clusters", "clusters must be an array."))
        clusters = []
    seen_clusters: set[str] = set()
    clustered_candidates: set[str] = set()
    for index, cluster in enumerate(clusters):
        path = f"$.clusters[{index}]"
        if not isinstance(cluster, dict):
            errors.append(issue("CLUSTER_TYPE", path, "Cluster must be an object."))
            continue
        cluster_id = cluster.get("cluster_id")
        if cluster_id in seen_clusters:
            errors.append(issue("DUPLICATE_CLUSTER", f"{path}.cluster_id", "Duplicate cluster ID."))
        seen_clusters.add(cluster_id)
        members = cluster.get("member_refs")
        if not isinstance(members, list) or not members:
            errors.append(issue("CLUSTER_MEMBERS", f"{path}.member_refs", "Cluster requires members."))
            members = []
        for ref in members:
            if ref not in candidate_ids:
                errors.append(issue("UNKNOWN_CLUSTER_MEMBER", f"{path}.member_refs", f"Unknown candidate {ref!r}."))
            clustered_candidates.add(ref)
        if cluster.get("canonical_ref") not in members:
            errors.append(issue("CLUSTER_CANONICAL", f"{path}.canonical_ref", "Canonical candidate must be a cluster member."))
        expected = set(cluster_memberships.get(str(cluster_id), []))
        if set(members) != expected:
            errors.append(issue("CLUSTER_MEMBERSHIP_MISMATCH", path, "Cluster members must match candidate dedupe_cluster_id values."))
    if clustered_candidates != candidate_ids:
        errors.append(issue("CLUSTER_COVERAGE", "$.clusters", "Every candidate must occur in exactly one declared cluster."))

    selected.sort()
    expected_ranks = list(range(1, len(selected) + 1))
    if [rank for rank, _ in selected] != expected_ranks:
        errors.append(issue("RANK_SEQUENCE", "$.candidates", "Selected ranks must be unique and contiguous from 1."))
    expected_order = [candidate_id for _, candidate_id in selected]
    if payload.get("selected_order") != expected_order:
        errors.append(issue("SELECTED_ORDER", "$.selected_order", "selected_order must exactly follow selection_rank."))

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
    if conditional_selected and quality.get("decision") == "ready":
        errors.append(issue("READY_WITH_CONDITIONAL_SELECTION", "$.quality_report.decision", "Conditional selected work prevents a ready set."))
    expected_counts = {
        "candidates": len(candidates), "selected": sum(c.get("decision") == "selected" for c in candidates if isinstance(c, dict)),
        "deferred": sum(c.get("decision") == "defer" for c in candidates if isinstance(c, dict)),
        "merged": sum(c.get("decision") == "merge" for c in candidates if isinstance(c, dict)),
        "rejected": sum(c.get("decision") == "reject" for c in candidates if isinstance(c, dict)),
        "no_action": sum(c.get("decision") == "no_action" for c in candidates if isinstance(c, dict)),
        "blocked": sum(c.get("eligibility") == "blocked" for c in candidates if isinstance(c, dict)),
    }
    if quality.get("counts") != expected_counts:
        errors.append(issue("COUNTS", "$.quality_report.counts", f"Expected exact counts {expected_counts}."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--feed", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.json_file.read_text(encoding="utf-8"))
    feed = json.loads(args.feed.read_text(encoding="utf-8")) if args.feed else None
    result = validate(payload, feed)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
