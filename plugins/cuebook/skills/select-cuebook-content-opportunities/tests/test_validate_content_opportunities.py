#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_content_opportunities import validate  # noqa: E402

FEED_TEST = Path(__file__).resolve().parents[2] / "normalize-cuebook-creator-feed" / "tests" / "test_validate_creator_feed.py"
spec = importlib.util.spec_from_file_location("feed_fixture", FEED_TEST)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


def candidate() -> dict:
    return {
        "opportunity_id": "OPP_q2_revision", "title": "Q2 revision watch",
        "anchor_refs": ["NEWS_q2", "NAR_revision", "CAL_call"], "entity_refs": ["ENT_example"],
        "lifecycle": "post_event", "editorial_job": "test_narrative",
        "thesis_seed": "Test whether the release changes forward estimates.", "audience": "active equity investors",
        "expires_at": "2026-07-15T12:00:00+00:00", "eligibility": "researchable",
        "evidence_state": "ready", "missing_requirements": [], "permission_state": "ready",
        "disclosure_state": "ready", "conflict_state": "clear", "history_refs": [], "history_use": None,
        "factor_vector": {"timeliness": "high", "evidence_maturity": "high", "novelty": "medium", "audience_relevance": "high", "explainability": "high", "production_fit": "high", "correction_risk": "low", "conflict_risk": "low"},
        "decision": "selected", "priority": "p1", "reason_codes": ["breaking_primary_source", "evidence_ready"],
        "dedupe_cluster_id": "OC_q2", "merged_into": None, "research_requirements": ["compare actual with consensus"],
        "recommended_mode": "research_pack", "selection_rank": 1, "tie_break_key": "20260714-q2-revision",
    }


def base_set() -> dict:
    feed = module.base_feed()
    return {
        "schema_version": "content-opportunity-set-v1", "opportunity_set_id": "OS_1234abcd",
        "feed_ref": feed["feed_id"], "feed_hash": feed["input_hash"],
        "as_of": "2026-07-14T12:00:00+00:00", "decision_cutoff_at": feed["knowledge_cutoff_at"],
        "ruleset_version": "2026-07-14", "mode": "daily_desk", "candidates": [candidate()],
        "clusters": [{"cluster_id": "OC_q2", "member_refs": ["OPP_q2_revision"], "canonical_ref": "OPP_q2_revision", "reason": "one earnings event"}],
        "selected_order": ["OPP_q2_revision"],
        "quality_report": {"decision": "ready", "hard_failures": [], "warnings": [], "checks": ["no lookahead"], "counts": {"candidates": 1, "selected": 1, "deferred": 0, "merged": 0, "rejected": 0, "no_action": 0, "blocked": 0}},
    }


def codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["errors"]}


def main() -> None:
    feed = module.base_feed(); cases = 0
    result = validate(base_set(), feed); assert result["valid"], result; cases += 1

    item = base_set(); item["decision_cutoff_at"] = "2026-07-14T11:59:00+00:00"
    assert "FEED_CUTOFF_MISMATCH" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["anchor_refs"] = ["NEWS_missing"]
    assert "UNKNOWN_ANCHOR_REF" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["eligibility"] = "blocked"
    assert "SELECTED_BLOCKED" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["permission_state"] = "blocked"
    assert "SELECTED_PERMISSION_BLOCK" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["expires_at"] = "2026-07-14T11:00:00+00:00"
    assert "SELECTED_EXPIRED" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["factor_vector"]["future_return"] = "high"
    assert "FACTOR_VECTOR" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["reason_codes"] = ["went_up_later"]
    assert "REASON_CODE" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["missing_requirements"] = ["consensus source"]
    assert "READY_WITH_GAPS" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["anchor_refs"] = ["NAR_revision", "CAL_call"]
    assert "INFERENCE_ONLY_READY" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["lifecycle"] = "correction"; item["candidates"][0]["editorial_job"] = "correction"
    assert "CORRECTION_PRIORITY" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["priority"] = "p0"
    assert "P0_SCOPE" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["decision"] = "merge"; item["candidates"][0]["selection_rank"] = None; item["selected_order"] = []; item["quality_report"]["counts"]["selected"] = 0; item["quality_report"]["counts"]["merged"] = 1
    assert "MERGE_TARGET" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["history_refs"] = ["TRADE_old"]
    assert "HISTORY_USE" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["candidates"][0]["lifecycle"] = "trade_postmortem"; item["candidates"][0]["editorial_job"] = "trade_postmortem"; item["candidates"][0]["recommended_mode"] = "postmortem"
    assert "POSTMORTEM_HISTORY" in codes(validate(item, feed)); cases += 1

    item = base_set(); second = copy.deepcopy(item["candidates"][0]); second["opportunity_id"] = "OPP_second"; second["selection_rank"] = 3; second["tie_break_key"] = "z"; item["candidates"].append(second); item["clusters"][0]["member_refs"].append("OPP_second"); item["selected_order"].append("OPP_second"); item["quality_report"]["counts"]["candidates"] = 2; item["quality_report"]["counts"]["selected"] = 2
    assert "RANK_SEQUENCE" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["selected_order"] = []
    assert "SELECTED_ORDER" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["clusters"][0]["member_refs"] = []
    result = validate(item, feed); assert "CLUSTER_MEMBERS" in codes(result) and "CLUSTER_MEMBERSHIP_MISMATCH" in codes(result); cases += 1

    item = base_set(); item["candidates"][0]["eligibility"] = "conditional"; item["candidates"][0]["evidence_state"] = "conditional"; item["candidates"][0]["missing_requirements"] = ["estimate revisions"]
    assert "READY_WITH_CONDITIONAL_SELECTION" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["quality_report"]["counts"]["selected"] = 0
    assert "COUNTS" in codes(validate(item, feed)); cases += 1

    item = base_set(); item["predicted_engagement"] = 0.9
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item, feed)); cases += 1

    print(f"ok: {cases} content opportunity cases")


if __name__ == "__main__":
    main()
