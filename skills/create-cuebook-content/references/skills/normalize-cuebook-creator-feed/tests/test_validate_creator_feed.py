#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_creator_feed import validate  # noqa: E402


H = "a" * 64


def base_feed() -> dict:
    return {
        "schema_version": "creator-feed-v1",
        "feed_id": "CF_1234abcd",
        "generated_at": "2026-07-14T12:05:00+00:00",
        "as_of": "2026-07-14T12:00:00+00:00",
        "knowledge_cutoff_at": "2026-07-14T12:00:00+00:00",
        "input_hash": f"sha256:{'0' * 64}",
        "ruleset_version": "2026-07-14",
        "brief": {
            "workspace_ref": "cuebook-prod", "creator_ref": "creator-vito",
            "snapshot_ref": "snapshot-42", "timezone": "Asia/Shanghai", "locale": "zh-CN",
            "universe": ["US equities", "semiconductors"], "personalized_advice_allowed": False,
        },
        "source_register": [
            {
                "id": "SRC_company_q2", "revision_id": f"sha256:{H}",
                "source_type": "company_release", "publisher": "Example Corp",
                "locator": "https://example.com/q2", "external_id": "q2-2026",
                "content_hash": f"sha256:{'b' * 64}", "published_at": "2026-07-14T10:00:00+00:00",
                "source_updated_at": None, "observed_at": "2026-07-14T10:02:00+00:00",
                "authorized_at": None, "available_at": "2026-07-14T10:02:00+00:00",
                "access": "public", "reuse_rights": "summarize_allowed", "trust_state": "verified",
                "independent_cluster_id": "SC_example_q2",
            }
        ],
        "entities": [
            {"id": "ENT_example", "kind": "company", "canonical_name": "Example Corp", "symbol_aliases": [
                {"symbol": "EXM", "venue": "NASDAQ", "valid_from": None, "valid_to": None}
            ]}
        ],
        "news": [
            {
                "id": "NEWS_q2", "revision_id": f"sha256:{'c' * 64}", "record_status": "active",
                "headline": "Example reports Q2", "summary": "Revenue rose.", "entity_refs": ["ENT_example"],
                "source_refs": ["SRC_company_q2"], "cluster_id": "NC_q2", "occurred_at": "2026-07-14T10:00:00+00:00",
                "published_at": "2026-07-14T10:00:00+00:00", "observed_at": "2026-07-14T10:02:00+00:00",
                "available_at": "2026-07-14T10:02:00+00:00", "evidence_role": "attributable_fact",
            }
        ],
        "calendar_events": [
            {
                "id": "CAL_call", "revision_id": f"sha256:{'d' * 64}", "record_status": "active",
                "label": "Q2 earnings call", "event_type": "earnings", "event_status": "scheduled",
                "entity_refs": ["ENT_example"], "source_refs": ["SRC_company_q2"],
                "scheduled_at": "2026-07-14T13:00:00+00:00", "timezone": "America/New_York",
                "available_at": "2026-07-14T10:02:00+00:00", "previous_revision_refs": [],
            }
        ],
        "narratives": [
            {
                "id": "NAR_revision", "revision_id": f"sha256:{'e' * 64}", "record_status": "active",
                "origin": "model", "narrative_class": "hypothesis",
                "claim": "The quarter may lift the next two estimates.", "entity_refs": ["ENT_example"],
                "source_refs": ["SRC_company_q2"], "created_at": "2026-07-14T10:10:00+00:00",
                "available_at": "2026-07-14T10:10:00+00:00", "horizon": "two quarters",
                "mechanism": ["reported revenue changes analyst models"],
                "evidence_gaps": ["consensus revision data"], "falsifier": "Forward estimates remain flat.",
            }
        ],
        "trade_ideas": [
            {
                "id": "IDEA_watch", "revision_id": f"sha256:{'f' * 64}", "record_status": "active",
                "thesis": "Watch for a revision cycle after the call.", "direction": "watch",
                "entity_refs": ["ENT_example"], "source_refs": ["SRC_company_q2"],
                "catalyst_refs": ["CAL_call", "NAR_revision"], "created_at": "2026-07-14T10:12:00+00:00",
                "observed_at": "2026-07-14T10:12:00+00:00", "available_at": "2026-07-14T10:12:00+00:00",
                "horizon": "30 days", "invalidation": "Guidance and estimates do not rise.",
                "evidence_state": "partial", "execution_state": "idea_only",
            }
        ],
        "trade_history": [
            {
                "id": "TRADE_old", "revision_id": f"sha256:{'1' * 64}", "record_status": "active",
                "trade_type": "executed", "entity_refs": ["ENT_example"], "source_refs": [],
                "idea_ref": None, "side": "long", "lifecycle_state": "closed",
                "opened_at": "2026-05-01T14:00:00+00:00", "closed_at": "2026-05-20T14:00:00+00:00",
                "recorded_at": "2026-05-20T14:05:00+00:00", "available_at": "2026-05-20T14:05:00+00:00",
                "execution_verification": "broker_reconciled", "position_disclosure": "public_flat",
                "commercial_relationship": "none", "public_reuse_permission": "aggregate_only",
                "performance": {"return_pct": 4.2, "pnl_amount": None, "currency": None, "fees_included": True, "basis": "executed_reconciled"},
            }
        ],
        "links": [
            {"id": "LINK_news_narrative", "from_ref": "NAR_revision", "to_ref": "NEWS_q2", "relation": "derived_from"}
        ],
        "quality_report": {
            "decision": "ready", "hard_failures": [], "warnings": [], "checks": ["cutoff-safe"],
            "record_counts": {"sources": 1, "entities": 1, "news": 1, "calendar_events": 1, "narratives": 1, "trade_ideas": 1, "trade_history": 1, "links": 1, "quarantined": 0},
            "quarantined_records": [],
        },
    }


def codes(result: dict, key: str = "errors") -> set[str]:
    return {entry["code"] for entry in result[key]}


def main() -> None:
    cases = 0
    result = validate(base_feed())
    assert result["valid"], result
    cases += 1

    item = base_feed(); item["brief"]["personalized_advice_allowed"] = True
    assert "PERSONALIZED_ADVICE" in codes(validate(item)); cases += 1

    item = base_feed(); item["news"][0]["available_at"] = "2026-07-14T12:01:00+00:00"
    assert "TEMPORAL_LEAKAGE" in codes(validate(item)); cases += 1

    item = base_feed(); item["news"][0]["entity_refs"] = ["ENT_missing"]
    assert "UNKNOWN_ENTITY_REF" in codes(validate(item)); cases += 1

    item = base_feed(); item["news"][0]["source_refs"] = []
    assert "NEWS_SOURCE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_feed(); item["source_register"][0]["trust_state"] = "retracted"
    assert "RETRACTED_SUPPORT" in codes(validate(item)); cases += 1

    item = base_feed(); item["source_register"][0]["available_at"] = "2026-07-14T09:00:00+00:00"
    assert "AVAILABLE_BEFORE_OBSERVED" in codes(validate(item)); cases += 1

    item = base_feed(); duplicate = copy.deepcopy(item["source_register"][0]); duplicate["id"] = "SRC_syndicated"; duplicate["revision_id"] = f"sha256:{'2' * 64}"; duplicate["independent_cluster_id"] = "SC_wrong"; item["source_register"].append(duplicate); item["quality_report"]["record_counts"]["sources"] = 2
    assert "DUPLICATE_CLUSTER_SPLIT" in codes(validate(item)); cases += 1

    item = base_feed(); item["narratives"][0]["falsifier"] = ""
    assert "NARRATIVE_FIELD" in codes(validate(item)); cases += 1

    item = base_feed(); item["narratives"][0]["narrative_class"] = "source_bound"; item["narratives"][0]["source_refs"] = []
    assert "SOURCE_BOUND_NARRATIVE" in codes(validate(item)); cases += 1

    item = base_feed(); item["trade_ideas"][0]["execution_state"] = "executed"
    assert "IDEA_EXECUTION_PROMOTION" in codes(validate(item)); cases += 1

    item = base_feed(); item["trade_ideas"][0]["catalyst_refs"] = ["TRADE_old"]
    assert "UNKNOWN_CATALYST_REF" in codes(validate(item)); cases += 1

    item = base_feed(); item["trade_history"][0]["execution_verification"] = "self_reported"; item["trade_history"][0]["public_reuse_permission"] = "record_allowed"
    assert "PUBLIC_EXECUTION_UNVERIFIED" in codes(validate(item)); cases += 1

    item = base_feed(); item["trade_history"][0]["closed_at"] = "2026-07-15T14:00:00+00:00"
    assert "FUTURE_TRADE_OUTCOME" in codes(validate(item)); cases += 1

    item = base_feed(); item["trade_history"][0]["position_disclosure"] = "unknown"
    result = validate(item); assert "DISCLOSURE_UNKNOWN" in codes(result, "warnings") and "READY_WITH_UNRESOLVED_GUARDS" in codes(result); cases += 1

    item = base_feed(); item["source_register"][0]["access"] = "unknown"; item["quality_report"]["decision"] = "conditional"
    result = validate(item); assert result["valid"] and "SOURCE_USE_UNCLEAR" in codes(result, "warnings"); cases += 1

    item = base_feed(); item["news"][0]["record_status"] = "quarantined"; item["quality_report"]["record_counts"]["quarantined"] = 1
    assert "QUARANTINE_INDEX" in codes(validate(item)); cases += 1

    item = base_feed(); item["quality_report"]["hard_failures"] = ["identity mismatch"]
    assert "HARD_FAILURE_STATE" in codes(validate(item)); cases += 1

    item = base_feed(); item["quality_report"]["record_counts"]["news"] = 2
    assert "RECORD_COUNTS" in codes(validate(item)); cases += 1

    item = base_feed(); item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item)); cases += 1

    print(f"ok: {cases} creator feed cases")


if __name__ == "__main__":
    main()
