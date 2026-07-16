#!/usr/bin/env python3
"""Regression tests for PostV1 invariants."""

from __future__ import annotations

import copy

from validate_post_artifact import validate


def base() -> dict:
    return {
        "schema_version": "post-v1",
        "lineage": {"artifact_id": "POST_storage_x", "program_ref": None, "content_item_ref": None, "opportunity_refs": ["OPP_storage"], "input_artifact_refs": ["ART_gate", "ART_route"]},
        "brief": {"platforms": ["x"], "content_class": "market_commentary", "temporal_mode": "realtime", "language": "zh-CN", "as_of": "2026-07-14T08:00:00Z", "reader": "market reader", "decision_use": "understand the print", "research_pack_ref": None},
        "gate": {"decision": "pass", "checks": [], "repairs": []},
        "research_decision": None,
        "policy_gate": {"decision": "ready", "checked_at": "2026-07-14T07:30:00Z", "rules_checked": [], "repairs": []},
        "disclosure_state": {"position_status": "no_position", "position_text": None, "commercial_status": "none", "commercial_text": None, "identity_status": "not_required", "ai_assistance_status": "not_required", "public_disclosures": []},
        "route": {"schema_version": "route-v1", "taxonomy_version": "market-narrative-v2", "cue_id": "cue-storage", "event_type": "inventory-print", "event_confidence": 0.667, "candidates": [{"event_type": "inventory-print", "score": 4.0}], "reasoning_lenses": ["model-revision"], "render_shape": "number-first", "required_context": [], "hard_numbers": ["76B", "67B"], "abstain": False, "abstain_reason": ""},
        "fact_ledger": [
            {"id": "F1", "claim": "Storage exceeded consensus.", "evidence_class": "source", "source_url": "https://example.com/source", "as_of": "2026-07-14T07:00:00Z", "freshness": "current"}
        ],
        "angle": {"tension": "inventory versus positioning", "forced_actor": "directional holders", "why_selected": "hard comparator", "profile_rule_ids": []},
        "drafts": {"x": "库存高过预期，多头今天少了点想象空间。下一份数据要是还压不下来，反弹会更难做。", "telegram": "", "xhs": "", "buy_side_note": ""},
        "draft_evidence": {"x": ["F1"], "telegram": [], "xhs": [], "buy_side_note": []},
        "watch_items": [],
        "quality_report": {"scores": {}, "hard_failures": [], "revisions": []},
        "publication_state": "ready",
    }


def assert_code(payload: dict, code: str) -> None:
    result = validate(payload)
    codes = {item["code"] for item in result["errors"] + result["warnings"]}
    assert code in codes, (code, result)


def main() -> None:
    assert validate(base())["valid"]

    item = base()
    item["gate"]["decision"] = "reject"
    item["publication_state"] = "blocked"
    assert_code(item, "BLOCKED_HAS_DRAFT")

    item = base()
    item["fact_ledger"][0]["evidence_class"] = "verified-live"
    item["fact_ledger"][0]["source_url"] = ""
    assert_code(item, "LIVE_SOURCE")

    item = base()
    item["fact_ledger"].append(copy.deepcopy(item["fact_ledger"][0]))
    assert_code(item, "DUPLICATE_FACT_ID")

    item = base()
    item["gate"]["decision"] = "caution"
    assert_code(item, "PUBLICATION_STATE")

    item = base()
    item["drafts"]["x"] = "SOURCE_ASSET_MISMATCH"
    assert_code(item, "INTERNAL_MARKER")

    item = base()
    item["drafts"]["x"] = "值得关注的是，这里还要看下一份数据。"
    assert_code(item, "AI_PHRASE")

    item = base()
    item["research_decision"] = "conditional"
    item["brief"]["research_pack_ref"] = "pack:conditional-valid"
    item["publication_state"] = "conditional"
    assert validate(item)["valid"]

    item = base()
    item["research_decision"] = "conditional"
    item["brief"]["research_pack_ref"] = "pack:conditional-state"
    assert_code(item, "PUBLICATION_STATE")

    item = base()
    item["research_decision"] = "blocked"
    item["brief"]["research_pack_ref"] = "pack:block-test"
    item["publication_state"] = "blocked"
    assert_code(item, "BLOCKED_HAS_DRAFT")

    item = base()
    item["brief"]["research_pack_ref"] = "pack:missing-decision"
    assert_code(item, "RESEARCH_DECISION_REQUIRED")

    item = base()
    item["gate"]["decision"] = "caution"
    item["publication_state"] = "conditional"
    item["drafts"]["x"] = "库存超预期已经确认下跌，结论很明确。"
    assert_code(item, "CONDITIONAL_WORDING")

    item = base()
    item["drafts"]["x"] = "买100股，止损90。"
    assert_code(item, "ACTION_BOUNDARY")

    item = base()
    item["draft_evidence"]["x"] = []
    assert_code(item, "DRAFT_EVIDENCE_MISSING")

    item = base()
    item["route"].update({"event_type": "unknown", "event_confidence": 0.0, "candidates": [], "reasoning_lenses": [], "hard_numbers": [], "abstain": True, "abstain_reason": "no-supported-event-type"})
    assert_code(item, "PUBLICATION_STATE")
    assert_code(item, "BLOCKED_HAS_DRAFT")

    item = base()
    del item["route"]["abstain"]
    assert_code(item, "ROUTE_FIELD")

    item = base()
    item["lineage"]["program_ref"] = "PROGRAM_1"
    assert_code(item, "PROGRAM_ITEM_LINEAGE")

    item = base()
    item["lineage"]["input_artifact_refs"].append("THESIS_hormuzwatch01@r1")
    assert_code(item, "THESIS_BINDING_REQUIRED")

    item = base()
    item["lineage"]["input_artifact_refs"].append("THESIS_hormuzwatch01@r1")
    item["lineage"]["thesis_binding"] = {"thesis_ref": "THESIS_hormuzwatch01@r1", "canonical_hash": f"sha256:{'a' * 64}"}
    assert validate(item)["valid"]

    item = base()
    item["lineage"]["thesis_binding"] = {"thesis_ref": "THESIS_hormuzwatch01@r1", "canonical_hash": "bad"}
    result = validate(item)
    assert {"THESIS_BINDING_LINEAGE", "THESIS_HASH"} <= {entry["code"] for entry in result["errors"]}

    item = base()
    item["lineage"]["input_artifact_refs"].append("CEXP_hormuzwatch01@r1")
    assert_code(item, "EXPRESSION_BINDING_REQUIRED")

    item = base()
    item["lineage"]["input_artifact_refs"].append("CEXP_hormuzwatch01@r1")
    item["lineage"]["expression_binding"] = {"plan_ref": "CEXP_hormuzwatch01@r1", "fingerprint_sha256": f"sha256:{'b' * 64}"}
    assert validate(item)["valid"]

    item = base()
    item["lineage"]["expression_binding"] = {"plan_ref": "CEXP_hormuzwatch01@r1", "fingerprint_sha256": "bad"}
    result = validate(item)
    assert {"EXPRESSION_BINDING_LINEAGE", "EXPRESSION_FINGERPRINT"} <= {entry["code"] for entry in result["errors"]}

    item = base()
    item["disclosure_state"]["position_status"] = "unknown"
    assert_code(item, "POSITION_DISCLOSURE_UNKNOWN")

    item = base()
    item["policy_gate"]["checked_at"] = "2026-05-01T00:00:00Z"
    assert_code(item, "POLICY_STALE")

    item = base()
    item["drafts"]["x"] = "我把库存异动放进 Cuebook，又补看了持仓和下一份数据。"
    assert_code(item, "PUBLIC_CUEBOOK_NARRATION")

    item = base()
    item["drafts"]["x"] = "数据来源：Cuebook。库存高过预期，多头今天少了点想象空间。下一份数据还要看库存能否回落。"
    assert validate(item)["valid"]

    item = base()
    item["assisted_discovery"] = {
        "mode": "cuebook_assisted",
        "creator_seed": "库存高于预期可能压制反弹。",
        "cuebook_contribution": "Cuebook 补出了持仓拥挤和下一次数据确认点。",
        "creator_judgment": "保留偏空判断，但把表达改成条件观察。",
        "idea_delta": "conditionalized",
        "final_trade_idea": "下一份库存继续超预期时，偏空观点维持。",
        "fact_refs": ["F1"],
        "public_attribution": False,
    }
    item["drafts"]["x"] = "库存超预期以后，拥挤持仓让反弹更难做。下一份数据如果继续走高，偏空判断维持。"
    assert validate(item)["valid"]

    item = copy.deepcopy(item)
    item["assisted_discovery"]["fact_refs"] = ["F99"]
    assert_code(item, "ASSISTED_UNKNOWN_FACT")

    item = base()
    item["assisted_discovery"] = {
        "mode": "cuebook_assisted",
        "creator_seed": "库存高于预期可能压制反弹。",
        "cuebook_contribution": "Cuebook 补出了下一次确认点。",
        "creator_judgment": "保留条件偏空。",
        "idea_delta": "conditionalized",
        "final_trade_idea": "下一份数据确认后再判断。",
        "fact_refs": ["F1"],
        "public_attribution": True,
    }
    assert_code(item, "PUBLIC_ASSISTANCE_ATTRIBUTION")

    item = base()
    item["drafts"]["x"] = "库存超预期，什么情况算看错：下一份数据回落。"
    assert_code(item, "PUBLIC_SELF_CORRECTION_HEADING")

    print("ok: 30 post artifact cases")


if __name__ == "__main__":
    main()
