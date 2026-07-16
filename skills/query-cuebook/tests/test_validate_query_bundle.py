from __future__ import annotations

import copy
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("query_validator", ROOT / "scripts" / "validate_query_bundle.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)
REQUEST_SPEC = importlib.util.spec_from_file_location("query_request_validator", ROOT / "scripts" / "validate_query_request.py")
REQUEST_VALIDATOR = importlib.util.module_from_spec(REQUEST_SPEC)
assert REQUEST_SPEC and REQUEST_SPEC.loader
REQUEST_SPEC.loader.exec_module(REQUEST_VALIDATOR)


def bundle() -> dict:
    return {
        "schema_version": "cuebook-query-bundle-v1",
        "module_id": "query",
        "query_id": "QRY_uso_latest",
        "state": "complete",
        "read_only": True,
        "query_type": "latest_stories",
        "as_of": "2026-07-15T19:00:00+08:00",
        "request": {"raw_text": "看 USO 最新叙事", "asset_refs": ["asset:uso"], "time_range": None, "depth": "quick"},
        "results": [{"result_id": "RES_story", "kind": "story", "title": "Oil risk premium", "summary": "Risk premium is unwinding.", "data_ref": "story:uso:1", "source_refs": ["SRC_story"], "as_of": "2026-07-15T18:50:00+08:00", "status": "available"}],
        "source_register": [{"source_ref": "SRC_story", "source_type": "cuebook_story", "locator": "cuebook://story/uso/1", "published_at": "2026-07-15T18:45:00+08:00", "retrieved_at": "2026-07-15T19:00:00+08:00", "usage_rights": "citation_only"}],
        "unavailable_capabilities": [],
        "creation_handoff": {"eligible": True, "subject_refs": ["asset:uso"], "result_refs": ["RES_story"], "warnings": []},
        "quality_report": {"warnings": [], "hard_failures": []},
    }


def request() -> dict:
    return {
        "schema_version": "cuebook-query-request-v1",
        "request_id": "QREQ_hood_chart",
        "raw_text": "画一张 HOOD 和 COIN 过去一年的事实价格对比图，不写观点。",
        "query_type": "market_series",
        "asset_inputs": ["HOOD", "COIN"],
        "time_range": "1y",
        "depth": "focused",
        "output_mode": "factual_chart",
    }


def test_valid_bundle() -> None:
    assert VALIDATOR.validate(bundle())["valid"]


def test_factual_chart_is_a_valid_query_request() -> None:
    assert REQUEST_VALIDATOR.validate(request())["valid"]
    item = request(); item["output_mode"] = "creator_viewpoint_graphic"
    assert "SCHEMA_ENUM" in {error["code"] for error in REQUEST_VALIDATOR.validate(item)["errors"]}


def test_query_must_be_read_only() -> None:
    item = bundle(); item["read_only"] = False
    assert "READ_ONLY" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}


def test_query_module_is_explicit() -> None:
    item = bundle(); item["module_id"] = "create"
    assert "MODULE_ID" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}


def test_source_refs_resolve() -> None:
    item = bundle(); item["results"][0]["source_refs"] = ["SRC_missing"]
    assert "UNKNOWN_SOURCE_REF" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}


def test_partial_when_capability_is_unavailable() -> None:
    item = bundle(); item["unavailable_capabilities"] = ["query_market_series"]
    assert "UNAVAILABLE_COMPLETE" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}
    item["state"] = "partial"
    assert VALIDATOR.validate(item)["valid"]


def test_handoff_refs_resolve() -> None:
    item = copy.deepcopy(bundle()); item["creation_handoff"]["result_refs"] = ["RES_missing"]
    assert "UNKNOWN_HANDOFF_RESULT" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}


def test_blocked_query_cannot_handoff() -> None:
    item = bundle(); item["state"] = "blocked"; item["quality_report"]["hard_failures"] = ["provider unavailable"]
    assert "BLOCKED_HANDOFF" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}
    item["creation_handoff"] = {"eligible": False, "subject_refs": [], "result_refs": [], "warnings": ["provider unavailable"]}
    assert VALIDATOR.validate(item)["valid"]


def test_partial_query_needs_usable_result_and_gap() -> None:
    item = bundle(); item["state"] = "partial"
    assert "PARTIAL_STATE" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}
    item["quality_report"]["warnings"] = ["fundamentals unavailable"]
    assert VALIDATOR.validate(item)["valid"]


def test_schema_is_enforced() -> None:
    item = bundle(); del item["as_of"]
    assert "SCHEMA_REQUIRED" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}
    item = bundle(); item["state"] = "unknown"
    assert "SCHEMA_ENUM" in {error["code"] for error in VALIDATOR.validate(item)["errors"]}
