#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_content_history import validate  # noqa: E402


def base_ledger() -> dict:
    return {
        "schema_version": "content-history-ledger-v1", "ledger_id": "CHL_1234abcd",
        "workflow_ref": "WF_1234abcd", "release_refs": ["ART_release"],
        "as_of": "2026-07-15T13:10:00+00:00", "reconciliation_cutoff_at": "2026-07-15T13:10:00+00:00",
        "ruleset_version": "2026-07-14",
        "publication_receipts": [{"receipt_id": "REC_x_post", "release_ref": "ART_release", "release_item_ref": "REL_item_1", "platform": "x", "status": "verified_published", "attempted_at": "2026-07-14T13:00:00+00:00", "acknowledged_at": "2026-07-14T13:00:01+00:00", "verified_at": "2026-07-14T13:00:05+00:00", "remote_id": "123456", "remote_url": "https://x.com/example/status/123456", "idempotency_key": "release-item-1-v1", "payload_hash": f"sha256:{'a' * 64}", "verification_method": "api", "verification_locator": "api:x:123456"}],
        "corrections": [], "artifact_invalidations": [],
        "content_performance": [{"snapshot_id": "CPS_x_24h", "receipt_ref": "REC_x_post", "observed_at": "2026-07-15T13:00:00+00:00", "window_start": "2026-07-14T13:00:05+00:00", "window_end": "2026-07-15T12:00:00+00:00", "metric_source": "authorized platform export", "metrics": {"impressions": 1000, "clicks": 20}, "status": "final", "use_scope": "packaging_only"}],
        "market_outcomes": [], "trade_reconciliations": [],
        "learning_snapshots": [{"learning_snapshot_id": "LS_content_24h", "created_at": "2026-07-15T13:05:00+00:00", "task": "compare hook retention", "cutoff_at": "2026-07-14T13:00:05+00:00", "feature_revision_refs": ["ART_post"], "outcome_plane": "content_performance", "outcome_refs": ["CPS_x_24h"], "policy_versions": ["2026-07-14"], "cohort_query_hash": f"sha256:{'b' * 64}", "label_definition": "24h click-through rate", "window": "24h", "exclusions": [], "split_method": "forward_time", "status": "frozen"}],
        "audit_events": [
            {"event_id": "HEVT_attempt", "object_ref": "REC_x_post", "from_state": None, "to_state": "attempted", "actor": "publisher", "occurred_at": "2026-07-14T13:00:00+00:00", "reason": "request sent"},
            {"event_id": "HEVT_ack", "object_ref": "REC_x_post", "from_state": "attempted", "to_state": "acknowledged", "actor": "publisher", "occurred_at": "2026-07-14T13:00:01+00:00", "reason": "platform acknowledged"},
            {"event_id": "HEVT_verified", "object_ref": "REC_x_post", "from_state": "acknowledged", "to_state": "verified_published", "actor": "reconciler", "occurred_at": "2026-07-14T13:00:05+00:00", "reason": "remote object verified"}
        ],
        "quality_report": {"decision": "ready", "hard_failures": [], "warnings": [], "checks": ["receipt verified"], "counts": {"receipts": 1, "corrections": 0, "invalidations": 0, "content_snapshots": 1, "market_outcomes": 0, "trade_reconciliations": 0, "learning_snapshots": 1}},
    }


def codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["errors"]}


def main() -> None:
    cases = 0
    result = validate(base_ledger()); assert result["valid"], result; cases += 1

    item = base_ledger(); item["publication_receipts"][0]["remote_id"] = None
    assert "VERIFIED_RECEIPT_FIELD" in codes(validate(item)); cases += 1

    item = base_ledger(); item["publication_receipts"][0]["verification_method"] = "none"
    assert "VERIFICATION_METHOD" in codes(validate(item)); cases += 1

    item = base_ledger(); item["publication_receipts"][0]["status"] = "acknowledged"; item["audit_events"] = item["audit_events"][:2]
    assert "PERFORMANCE_UNVERIFIED_PUBLICATION" in codes(validate(item)); cases += 1

    item = base_ledger(); item["publication_receipts"][0]["status"] = "ambiguous"; item["publication_receipts"][0]["acknowledged_at"] = None; item["publication_receipts"][0]["verified_at"] = None; item["publication_receipts"][0]["remote_id"] = None; item["publication_receipts"][0]["remote_url"] = None; item["publication_receipts"][0]["verification_method"] = "none"; item["publication_receipts"][0]["verification_locator"] = None; item["content_performance"] = []; item["learning_snapshots"] = []; item["audit_events"] = [{"event_id": "HEVT_ambiguous", "object_ref": "REC_x_post", "from_state": None, "to_state": "ambiguous", "actor": "publisher", "occurred_at": "2026-07-14T13:00:00+00:00", "reason": "timeout after create"}]; item["quality_report"]["counts"]["content_snapshots"] = 0; item["quality_report"]["counts"]["learning_snapshots"] = 0
    second = copy.deepcopy(item["publication_receipts"][0]); second["receipt_id"] = "REC_x_retry"; second["idempotency_key"] = "new-key"; item["publication_receipts"].append(second); item["audit_events"].append({"event_id": "HEVT_retry", "object_ref": "REC_x_retry", "from_state": None, "to_state": "ambiguous", "actor": "publisher", "occurred_at": "2026-07-14T13:01:00+00:00", "reason": "unsafe retry"}); item["quality_report"]["counts"]["receipts"] = 2
    assert "AMBIGUOUS_RETRY" in codes(validate(item)); cases += 1

    item = base_ledger(); item["content_performance"][0]["window_end"] = "2026-07-16T12:00:00+00:00"
    assert "CONTENT_OBSERVED_EARLY" in codes(validate(item)); cases += 1

    item = base_ledger(); item["content_performance"][0]["use_scope"] = "investment_validation"
    assert "CONTENT_USE_SCOPE" in codes(validate(item)); cases += 1

    item = base_ledger(); correction = {"correction_id": "COR_fact", "target_artifact_ref": "ART_post", "target_content_hash": f"sha256:{'c' * 64}", "category": "factual", "severity": "material", "status": "complete", "detected_at": "2026-07-15T10:00:00+00:00", "effective_at": "2026-07-15T10:05:00+00:00", "evidence_refs": ["SRC_fix"], "before": "Revenue was 10", "after": "Revenue was 12", "reason": "transcription error", "approver_ref": "editor", "replacement_artifact_ref": "ART_post_v2", "public_action": "none", "affected_artifact_refs": ["ART_post"], "propagation_status": "complete"}; item["corrections"].append(correction); item["audit_events"].append({"event_id": "HEVT_cor", "object_ref": "COR_fact", "from_state": None, "to_state": "complete", "actor": "editor", "occurred_at": "2026-07-15T10:05:00+00:00", "reason": "correction approved and propagated"}); item["quality_report"]["counts"]["corrections"] = 1
    result = validate(item); assert "MATERIAL_PUBLIC_ACTION" in codes(result) and "INCOMPLETE_INVALIDATION_CASCADE" in codes(result); cases += 1

    item = base_ledger(); item["trade_reconciliations"] = [{"reconciliation_id": "TRC_one", "trade_ref": "TRADE_old", "record_type": "paper", "verification": "not_applicable", "fills_complete": False, "fees_included": False, "fx_treatment": "not_applicable", "corporate_actions_treatment": "not_applicable", "cohort_ref": "winners-only", "cohort_completeness": "partial", "consent": "record_allowed", "public_claim_eligibility": "eligible", "status": "eligible", "exclusion_reason": None}]; item["quality_report"]["counts"]["trade_reconciliations"] = 1
    assert "PUBLIC_CLAIM_INELIGIBLE" in codes(validate(item)); cases += 1

    item = base_ledger(); item["trade_reconciliations"] = [{"reconciliation_id": "TRC_one", "trade_ref": "TRADE_old", "record_type": "executed", "verification": "broker_reconciled", "fills_complete": True, "fees_included": True, "fx_treatment": "included", "corporate_actions_treatment": "included", "cohort_ref": "all-2026", "cohort_completeness": "complete", "consent": "record_allowed", "public_claim_eligibility": "eligible", "status": "eligible", "exclusion_reason": None}]; item["quality_report"]["counts"]["trade_reconciliations"] = 1
    assert validate(item)["valid"]; cases += 1

    item = base_ledger(); item["learning_snapshots"][0]["split_method"] = "random_rows"
    assert "LEARNING_SPLIT" in codes(validate(item)); cases += 1

    item = base_ledger(); item["learning_snapshots"][0]["outcome_plane"] = "market_calibration"
    assert "OUTCOME_PLANE_REF" in codes(validate(item)); cases += 1

    item = base_ledger(); item["audit_events"][1]["from_state"] = None
    assert "EVENT_CHAIN" in codes(validate(item)); cases += 1

    item = base_ledger(); item["audit_events"] = []
    assert "OBJECT_EVENT_REQUIRED" in codes(validate(item)); cases += 1

    item = base_ledger(); item["audit_events"][0]["to_state"] = "verified_published"
    assert "RECEIPT_TRANSITION" in codes(validate(item)); cases += 1

    item = base_ledger(); item["publication_receipts"][0]["verified_at"] = "2026-07-16T13:00:00+00:00"
    assert "RECEIPT_AFTER_CUTOFF" in codes(validate(item)); cases += 1

    item = base_ledger(); item["quality_report"]["hard_failures"] = ["fabricated receipt"]
    assert "HARD_FAILURE_STATE" in codes(validate(item)); cases += 1

    item = base_ledger(); item["quality_report"]["counts"]["receipts"] = 2
    assert "COUNTS" in codes(validate(item)); cases += 1

    item = base_ledger(); item["engagement_validates_thesis"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item)); cases += 1

    print(f"ok: {cases} content history cases")


if __name__ == "__main__":
    main()
