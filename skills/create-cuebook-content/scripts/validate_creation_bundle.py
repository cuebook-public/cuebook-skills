#!/usr/bin/env python3
"""Validate query binding and candidate invariants for CuebookCreationBundleV1."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PLUGIN_ROOT))
from validate_json_schema import validate_instance  # noqa: E402


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "references" / "cuebook-creation-bundle-v1.schema.json").read_text(encoding="utf-8")
)
# The self-contained bundle vendors sibling skills under references/skills/;
# the plugin layout keeps them as top-level siblings. Accept either.
_QUERY_VALIDATOR_CANDIDATES = (
    Path(__file__).resolve().parents[1] / "references" / "skills" / "query-cuebook" / "scripts" / "validate_query_bundle.py",
    PLUGIN_ROOT / "skills" / "query-cuebook" / "scripts" / "validate_query_bundle.py",
)
QUERY_VALIDATOR_SPEC = importlib.util.spec_from_file_location(
    "cuebook_query_bundle_validator",
    next(path for path in _QUERY_VALIDATOR_CANDIDATES if path.exists()),
)
QUERY_VALIDATOR = importlib.util.module_from_spec(QUERY_VALIDATOR_SPEC)
assert QUERY_VALIDATOR_SPEC and QUERY_VALIDATOR_SPEC.loader
QUERY_VALIDATOR_SPEC.loader.exec_module(QUERY_VALIDATOR)


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def query_bundle_hash(payload: Any) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"sha256:{hashlib.sha256(canonical).hexdigest()}"


def validate(payload: Any, query_bundle: Any | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Creation bundle must be an object.")]}
    errors = validate_instance(payload, SCHEMA)
    if payload.get("schema_version") != "cuebook-creation-bundle-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected cuebook-creation-bundle-v1."))
    if payload.get("module_id") != "create":
        errors.append(issue("MODULE_ID", "$.module_id", "Creation bundle must identify the create module."))

    request = payload.get("creator_request") if isinstance(payload.get("creator_request"), dict) else {}
    binding = payload.get("query_binding") if isinstance(payload.get("query_binding"), dict) else {}
    material = request.get("material_current_claims") is True
    required = binding.get("required") is True
    status = binding.get("status")
    query_ref = binding.get("query_bundle_ref")
    query_hash = binding.get("query_bundle_hash")
    query_state = binding.get("query_state")
    freshness = binding.get("freshness")
    result_refs = binding.get("result_refs") if isinstance(binding.get("result_refs"), list) else []

    if material and not required:
        errors.append(issue("MATERIAL_QUERY_REQUIRED", "$.query_binding.required", "Material current claims require a query binding."))
    if required and status not in {"reused", "executed", "unavailable"}:
        errors.append(issue("QUERY_STATUS", "$.query_binding.status", "Required query must be reused, executed, or unavailable."))
    if status in {"reused", "executed"} and (
        not query_ref
        or not query_hash
        or not result_refs
        or not binding.get("as_of")
        or query_state not in {"complete", "partial"}
        or freshness not in {"fresh", "accepted_stale"}
    ):
        errors.append(issue("QUERY_LINEAGE", "$.query_binding", "Reused or executed query requires a hash, result refs, usable query state, freshness, and as-of time."))
    if status in {"reused", "executed"} and query_bundle is None:
        errors.append(issue("QUERY_BUNDLE_REQUIRED", "$.query_binding", "Bound creation must be validated against the referenced QueryBundleV1."))
    if status in {"reused", "executed"} and query_bundle is not None:
        query_result = QUERY_VALIDATOR.validate(query_bundle)
        for query_error in query_result["errors"]:
            errors.append(issue("QUERY_BUNDLE_INVALID", query_error["path"], f"{query_error['code']}: {query_error['message']}"))
        if isinstance(query_bundle, dict):
            known_results = {
                item.get("result_id")
                for item in query_bundle.get("results", [])
                if isinstance(item, dict) and item.get("status") != "unavailable"
            }
            if query_ref != query_bundle.get("query_id"):
                errors.append(issue("QUERY_REF_MISMATCH", "$.query_binding.query_bundle_ref", "Query ref does not match the supplied bundle."))
            if query_hash != query_bundle_hash(query_bundle):
                errors.append(issue("QUERY_HASH_MISMATCH", "$.query_binding.query_bundle_hash", "Query bundle hash does not match canonical content."))
            if query_state != query_bundle.get("state"):
                errors.append(issue("QUERY_STATE_MISMATCH", "$.query_binding.query_state", "Bound query state differs from the supplied bundle."))
            if binding.get("as_of") != query_bundle.get("as_of"):
                errors.append(issue("QUERY_AS_OF_MISMATCH", "$.query_binding.as_of", "Bound query cutoff differs from the supplied bundle."))
            missing_refs = set(result_refs) - known_results
            if missing_refs:
                errors.append(issue("QUERY_RESULT_MISMATCH", "$.query_binding.result_refs", f"Unknown or unavailable query result refs: {sorted(missing_refs)}."))
    if status == "not_required" and (required or query_ref or query_hash or result_refs or query_state != "not_applicable"):
        errors.append(issue("NOT_REQUIRED_BINDING", "$.query_binding", "Not-required query binding cannot carry query lineage."))
    if status == "unavailable" and (query_ref or query_hash or result_refs or query_state != "blocked"):
        errors.append(issue("UNAVAILABLE_BINDING", "$.query_binding", "Unavailable query must be blocked and cannot claim reusable lineage."))

    candidates = payload.get("candidate_refs") if isinstance(payload.get("candidate_refs"), list) else []
    candidate_set_ref = payload.get("candidate_set_ref")

    state = payload.get("state")
    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    hard_failures = quality.get("hard_failures") if isinstance(quality.get("hard_failures"), list) else []
    if state == "ready" and (hard_failures or status == "unavailable"):
        errors.append(issue("READY_STATE", "$.state", "Ready creation cannot have hard failures or unavailable required query."))
    if state == "ready" and query_state == "partial":
        errors.append(issue("READY_WITH_PARTIAL_QUERY", "$.state", "A partial query can produce only conditional creation."))
    if state in {"ready", "conditional"} and (len(candidates) != 3 or len(candidates) != len(set(candidates)) or not candidate_set_ref):
        errors.append(issue("THREE_CANDIDATES", "$.candidate_refs", "Ready or conditional creation requires one set of exactly three unique candidates."))
    if state == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked creation requires a hard failure."))
    if state == "blocked" and (candidates or candidate_set_ref):
        errors.append(issue("BLOCKED_CANDIDATES", "$.candidate_refs", "Blocked creation cannot contain publishable candidates."))
    if status == "unavailable" and state != "blocked":
        errors.append(issue("UNAVAILABLE_QUERY_BLOCKS", "$.state", "Unavailable required query must block creation."))
    stance_source = request.get("stance_source")
    adopted_refs = request.get("adopted_claim_refs") if isinstance(request.get("adopted_claim_refs"), list) else []
    if stance_source != "creator_seed" and request.get("authorship_mode") != "cuebook_generated":
        if request.get("adoption_confirmed") is not True or not adopted_refs:
            errors.append(issue("SOURCE_STANCE_ADOPTION", "$.creator_request", "A sourced stance must be explicitly adopted before it can be written as the creator's view."))
    if payload.get("release_bundle_ref") and "release" not in (request.get("requested_outputs") or []):
        errors.append(issue("UNREQUESTED_RELEASE", "$.release_bundle_ref", "Release bundle requires a release output request."))
    if payload.get("settlement_claim_ref") and "settlement" not in (request.get("requested_outputs") or []):
        errors.append(issue("UNREQUESTED_SETTLEMENT", "$.settlement_claim_ref", "Settlement claim requires a settlement output request."))
    return {"valid": not errors, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--query-bundle", type=Path)
    args = parser.parse_args()
    query_bundle = json.loads(args.query_bundle.read_text(encoding="utf-8")) if args.query_bundle else None
    result = validate(json.loads(args.json_file.read_text(encoding="utf-8")), query_bundle)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
