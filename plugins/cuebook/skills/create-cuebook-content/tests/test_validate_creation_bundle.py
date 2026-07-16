from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("creation_validator", ROOT / "scripts" / "validate_creation_bundle.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)
SEED_SPEC = importlib.util.spec_from_file_location("creator_seed_validator", ROOT / "scripts" / "validate_creator_seed.py")
SEED_VALIDATOR = importlib.util.module_from_spec(SEED_SPEC)
assert SEED_SPEC and SEED_SPEC.loader
SEED_SPEC.loader.exec_module(SEED_VALIDATOR)


def query_snapshot() -> dict:
    return {
        "schema_version": "cuebook-query-bundle-v1",
        "module_id": "query",
        "query_id": "QRY_uso_latest",
        "state": "complete",
        "read_only": True,
        "query_type": "mixed",
        "as_of": "2026-07-15T19:00:00+08:00",
        "request": {"raw_text": "查询 USO 最新故事和市场状态", "asset_refs": ["asset:uso"], "time_range": None, "depth": "focused"},
        "results": [
            {"result_id": "RES_story", "kind": "story", "title": "Oil risk premium", "summary": "Risk premium is unwinding.", "data_ref": "story:uso:1", "source_refs": ["SRC_story"], "as_of": "2026-07-15T18:50:00+08:00", "status": "available"},
            {"result_id": "RES_state", "kind": "market_state", "title": "USO market state", "summary": "Latest sealed snapshot.", "data_ref": "market:uso:1", "source_refs": ["SRC_state"], "as_of": "2026-07-15T19:00:00+08:00", "status": "available"},
        ],
        "source_register": [
            {"source_ref": "SRC_story", "source_type": "cuebook_story", "locator": "cuebook://story/uso/1", "published_at": "2026-07-15T18:45:00+08:00", "retrieved_at": "2026-07-15T19:00:00+08:00", "usage_rights": "citation_only"},
            {"source_ref": "SRC_state", "source_type": "cuebook_market_state", "locator": "cuebook://market/uso/1", "published_at": None, "retrieved_at": "2026-07-15T19:00:00+08:00", "usage_rights": "display"},
        ],
        "unavailable_capabilities": [],
        "creation_handoff": {"eligible": True, "subject_refs": ["asset:uso"], "result_refs": ["RES_story", "RES_state"], "warnings": []},
        "quality_report": {"warnings": [], "hard_failures": []},
    }


def bind_query(item: dict, snapshot: dict) -> None:
    item["query_binding"].update({
        "query_bundle_ref": snapshot["query_id"],
        "query_bundle_hash": VALIDATOR.query_bundle_hash(snapshot),
        "query_state": snapshot["state"],
        "result_refs": [result["result_id"] for result in snapshot["results"] if result["status"] != "unavailable"],
        "as_of": snapshot["as_of"],
    })


def bundle() -> dict:
    snapshot = query_snapshot()
    item = {
        "schema_version": "cuebook-creation-bundle-v1",
        "module_id": "create",
        "creation_id": "CREATE_uso_view",
        "state": "ready",
        "created_at": "2026-07-15T19:10:00+08:00",
        "creator_request": {"seed_text": "我认为原油风险溢价会回吐", "authorship_mode": "cuebook_assisted", "stance_source": "creator_seed", "adopted_claim_refs": [], "adoption_confirmed": False, "material_current_claims": True, "requested_outputs": ["text", "visual"]},
        "query_binding": {"required": True, "status": "executed", "query_bundle_ref": None, "query_bundle_hash": None, "query_state": "not_applicable", "result_refs": [], "as_of": None, "freshness": "fresh", "warnings": []},
        "workflow_run_ref": "WORKFLOW_uso",
        "candidate_set_ref": "CANDSET_uso",
        "candidate_refs": ["CAND_uso_a", "CAND_uso_b", "CAND_uso_c"],
        "settlement_claim_ref": None,
        "release_bundle_ref": None,
        "quality_report": {"warnings": [], "hard_failures": []},
    }
    bind_query(item, snapshot)
    return item


def validate(item: dict, snapshot: dict | None = None) -> dict:
    return VALIDATOR.validate(item, snapshot or query_snapshot())


def seed() -> dict:
    return {
        "schema_version": "creator-seed-v1",
        "seed_id": "SEED_hood_view",
        "seed_text": "我认为 HOOD 的链上证券业务会带来重估。",
        "deliverable": "market_post",
        "requested_outputs": ["text", "visual"],
        "material_current_claims": True,
        "stance_source": "creator_seed",
        "source_claim_refs": [],
        "adoption_confirmed": False,
    }


def test_valid_creation_bundle() -> None:
    assert validate(bundle())["valid"]


def test_creator_seed_requires_creation_deliverable() -> None:
    assert SEED_VALIDATOR.validate(seed())["valid"]
    item = seed(); item["deliverable"] = "factual_chart"
    assert "SCHEMA_ENUM" in {error["code"] for error in SEED_VALIDATOR.validate(item)["errors"]}


def test_material_claim_requires_query() -> None:
    item = bundle(); item["query_binding"] = {"required": False, "status": "not_required", "query_bundle_ref": None, "query_bundle_hash": None, "query_state": "not_applicable", "result_refs": [], "as_of": None, "freshness": "unknown", "warnings": []}
    assert "MATERIAL_QUERY_REQUIRED" in {error["code"] for error in validate(item)["errors"]}


def test_creation_module_is_explicit() -> None:
    item = bundle(); item["module_id"] = "query"
    assert "MODULE_ID" in {error["code"] for error in validate(item)["errors"]}


def test_query_lineage_is_required() -> None:
    item = bundle(); item["query_binding"]["query_bundle_ref"] = None
    assert "QUERY_LINEAGE" in {error["code"] for error in validate(item)["errors"]}


def test_exactly_three_candidates() -> None:
    item = bundle(); item["candidate_refs"] = ["CAND_a", "CAND_b"]
    assert "THREE_CANDIDATES" in {error["code"] for error in validate(item)["errors"]}


def test_unavailable_query_cannot_be_ready() -> None:
    item = bundle(); item["query_binding"].update({"status": "unavailable", "query_bundle_ref": None, "query_bundle_hash": None, "query_state": "blocked", "result_refs": [], "as_of": None, "freshness": "unknown"})
    assert "UNAVAILABLE_QUERY_BLOCKS" in {error["code"] for error in validate(item)["errors"]}


def test_blocked_creation_has_no_candidates() -> None:
    item = bundle()
    item["state"] = "blocked"
    item["query_binding"].update({"status": "unavailable", "query_bundle_ref": None, "query_bundle_hash": None, "query_state": "blocked", "result_refs": [], "as_of": None, "freshness": "unknown"})
    item["candidate_set_ref"] = None
    item["candidate_refs"] = []
    item["quality_report"]["hard_failures"] = ["query unavailable"]
    assert validate(item)["valid"]
    item["candidate_refs"] = ["CAND_forbidden"]
    assert "BLOCKED_CANDIDATES" in {error["code"] for error in validate(item)["errors"]}


def test_partial_query_cannot_be_ready() -> None:
    snapshot = query_snapshot(); snapshot["state"] = "partial"; snapshot["unavailable_capabilities"] = ["query_fundamental_metrics"]; snapshot["quality_report"]["warnings"] = ["fundamentals unavailable"]
    item = bundle(); bind_query(item, snapshot)
    assert "READY_WITH_PARTIAL_QUERY" in {error["code"] for error in validate(item, snapshot)["errors"]}
    item["state"] = "conditional"
    assert validate(item, snapshot)["valid"]


def test_source_stance_requires_adoption() -> None:
    item = bundle(); item["creator_request"]["stance_source"] = "source_commentator"
    assert "SOURCE_STANCE_ADOPTION" in {error["code"] for error in validate(item)["errors"]}
    item["creator_request"].update({"adopted_claim_refs": ["RES_story"], "adoption_confirmed": True})
    assert validate(item)["valid"]


def test_schema_is_enforced() -> None:
    item = bundle(); del item["created_at"]
    assert "SCHEMA_REQUIRED" in {error["code"] for error in validate(item)["errors"]}
    item = bundle(); item["unexpected"] = True
    assert "SCHEMA_ADDITIONAL_PROPERTY" in {error["code"] for error in validate(item)["errors"]}


def test_query_bundle_hash_is_verified() -> None:
    item = bundle(); item["query_binding"]["query_bundle_hash"] = "sha256:" + "0" * 64
    assert "QUERY_HASH_MISMATCH" in {error["code"] for error in validate(item)["errors"]}


def test_bound_creation_requires_query_bundle() -> None:
    assert "QUERY_BUNDLE_REQUIRED" in {error["code"] for error in VALIDATOR.validate(bundle())["errors"]}
