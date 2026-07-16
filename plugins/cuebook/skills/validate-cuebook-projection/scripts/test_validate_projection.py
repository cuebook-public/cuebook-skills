#!/usr/bin/env python3
import json
from pathlib import Path

from validate_projection import validate


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    cases = json.loads((root / "references" / "db-regression-cases.json").read_text(encoding="utf-8"))
    failures = []
    for case in cases:
        result = validate(case["cue"])
        expected = case["expected"]
        codes = {item["code"] for item in result["checks"]}
        if result["decision"] != expected["decision"]:
            failures.append(f"{case['name']}: decision {result['decision']} != {expected['decision']} ({sorted(codes)})")
        for code in expected.get("codes", []):
            if code not in codes:
                failures.append(f"{case['name']}: missing {code}; got {sorted(codes)}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"ok: {len(cases)} projection cases")


if __name__ == "__main__":
    main()
