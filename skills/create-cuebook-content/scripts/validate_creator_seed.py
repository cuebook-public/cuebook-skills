#!/usr/bin/env python3
"""Validate CreatorSeedV1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PLUGIN_ROOT))
from validate_json_schema import validate_instance  # noqa: E402


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "references" / "creator-seed-v1.schema.json").read_text(encoding="utf-8")
)


def validate(payload: Any) -> dict[str, Any]:
    errors = validate_instance(payload, SCHEMA)
    if isinstance(payload, dict) and payload.get("stance_source") != "creator_seed":
        if payload.get("adoption_confirmed") is not True or not payload.get("source_claim_refs"):
            errors.append({
                "code": "SOURCE_STANCE_ADOPTION",
                "path": "$.stance_source",
                "message": "Cuebook or commentator stance requires explicit source refs and adoption confirmation.",
            })
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
