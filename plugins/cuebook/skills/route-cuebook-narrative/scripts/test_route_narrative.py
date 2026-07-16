#!/usr/bin/env python3
import json
from pathlib import Path

from route_narrative import route


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    cases = json.loads((root / "references" / "route-regression-cases.json").read_text(encoding="utf-8"))
    failures = []
    for case in cases:
        actual = route(case["cue"])["event_type"]
        if actual != case["expected"]:
            failures.append(f"{case['name']}: {actual} != {case['expected']}")
    if failures:
        raise SystemExit("\n".join(failures))
    print(f"ok: {len(cases)} route cases")


if __name__ == "__main__":
    main()
