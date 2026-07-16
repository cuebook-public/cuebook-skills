#!/usr/bin/env python3
"""Validate the read-only and lineage invariants of CuebookQueryBundleV1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))
from validate_json_schema import validate_instance  # noqa: E402


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "references" / "cuebook-query-bundle-v1.schema.json").read_text(encoding="utf-8")
)


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def validate(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Query bundle must be an object.")]}
    errors = validate_instance(payload, SCHEMA)
    if payload.get("schema_version") != "cuebook-query-bundle-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected cuebook-query-bundle-v1."))
    if payload.get("module_id") != "query":
        errors.append(issue("MODULE_ID", "$.module_id", "Query bundle must identify the query module."))
    if payload.get("read_only") is not True:
        errors.append(issue("READ_ONLY", "$.read_only", "Cuebook query output must remain read-only."))

    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    sources = payload.get("source_register") if isinstance(payload.get("source_register"), list) else []
    result_ids = [item.get("result_id") for item in results if isinstance(item, dict)]
    source_ids = [item.get("source_ref") for item in sources if isinstance(item, dict)]
    if len(result_ids) != len(set(result_ids)):
        errors.append(issue("DUPLICATE_RESULT", "$.results", "Result IDs must be unique."))
    if len(source_ids) != len(set(source_ids)):
        errors.append(issue("DUPLICATE_SOURCE", "$.source_register", "Source refs must be unique."))
    known_sources = set(source_ids)
    for index, item in enumerate(results):
        if not isinstance(item, dict):
            errors.append(issue("RESULT_TYPE", f"$.results[{index}]", "Result must be an object."))
            continue
        missing = set(item.get("source_refs") or []) - known_sources
        if missing:
            errors.append(issue("UNKNOWN_SOURCE_REF", f"$.results[{index}].source_refs", f"Unknown source refs: {sorted(missing)}."))

    handoff = payload.get("creation_handoff") if isinstance(payload.get("creation_handoff"), dict) else {}
    missing_results = set(handoff.get("result_refs") or []) - set(result_ids)
    if missing_results:
        errors.append(issue("UNKNOWN_HANDOFF_RESULT", "$.creation_handoff.result_refs", f"Unknown result refs: {sorted(missing_results)}."))
    if handoff.get("eligible") and not handoff.get("result_refs"):
        errors.append(issue("EMPTY_HANDOFF", "$.creation_handoff", "Eligible creation handoff requires at least one result ref."))
    status_by_result = {
        item.get("result_id"): item.get("status")
        for item in results
        if isinstance(item, dict)
    }
    unavailable_handoff = [
        result_ref
        for result_ref in handoff.get("result_refs") or []
        if status_by_result.get(result_ref) == "unavailable"
    ]
    if unavailable_handoff:
        errors.append(issue("UNAVAILABLE_HANDOFF", "$.creation_handoff.result_refs", f"Unavailable results cannot enter creation: {unavailable_handoff}."))

    state = payload.get("state")
    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    hard_failures = quality.get("hard_failures") if isinstance(quality.get("hard_failures"), list) else []
    unavailable = payload.get("unavailable_capabilities") if isinstance(payload.get("unavailable_capabilities"), list) else []
    if state == "complete" and (hard_failures or unavailable or not results):
        errors.append(issue("COMPLETE_STATE", "$.state", "Complete query requires results and no hard failures or unavailable capabilities."))
    warnings = quality.get("warnings") if isinstance(quality.get("warnings"), list) else []
    usable_results = [item for item in results if isinstance(item, dict) and item.get("status") in {"available", "conditional"}]
    if state == "partial" and (not usable_results or not (warnings or unavailable)):
        errors.append(issue("PARTIAL_STATE", "$.state", "Partial query requires at least one usable result and an explicit warning or unavailable capability."))
    if state == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked query requires a hard failure."))
    if state == "blocked" and (handoff.get("eligible") or handoff.get("result_refs")):
        errors.append(issue("BLOCKED_HANDOFF", "$.creation_handoff", "Blocked query cannot hand results to creation."))
    if not handoff.get("eligible") and handoff.get("result_refs"):
        errors.append(issue("INELIGIBLE_HANDOFF", "$.creation_handoff", "Ineligible creation handoff cannot carry result refs."))
    if unavailable and state == "complete":
        errors.append(issue("UNAVAILABLE_COMPLETE", "$.unavailable_capabilities", "Unavailable capabilities require partial or blocked state."))
    return {"valid": not errors, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    args = parser.parse_args()
    result = validate(json.loads(args.json_file.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
