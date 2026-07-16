#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_viewpoint_motion import validate  # noqa: E402


HASH = "sha256:" + "a" * 64


def base_manifest() -> dict:
    return {
        "schema_version": "viewpoint-motion-v1",
        "motion_id": "VMOTION_btc_reaction_01",
        "spec_ref": "VMSPEC_btc_reaction_01",
        "state": "frozen",
        "framework": "react",
        "animation_library": "motion/react",
        "dimensions": {"width": 720, "height": 420, "compact_width": 360, "compact_height": 210},
        "timebase": "deterministic_ms",
        "duration_ms": 4000,
        "fps": 60,
        "lineage": {"input_artifact_refs": ["VVIS_btc_01", "VDB_btc_01"], "binding_refs": ["BIND_price_series", "BIND_judgment"], "selected_visual_direction_ref": "VDIR_btc_tension_01"},
        "asset": {
            "component": {"ref": "react/BtcReactionMotion.tsx", "sha256": HASH},
            "poster": {"ref": "poster/viewpoint.png", "sha256": HASH},
            "keyframes": [
                {"at_ms": 0, "ref": "keyframes/frame-00000.png", "sha256": HASH},
                {"at_ms": 700, "ref": "keyframes/frame-00700.png", "sha256": HASH},
                {"at_ms": 1700, "ref": "keyframes/frame-01700.png", "sha256": HASH},
                {"at_ms": 2700, "ref": "keyframes/frame-02700.png", "sha256": HASH},
                {"at_ms": 4000, "ref": "keyframes/frame-04000.png", "sha256": HASH},
            ],
            "videos": [],
        },
        "accessibility": {"reduced_motion_verified": True, "autoplay_audio": False, "alt_text": "负面事件增加卖压，但 BTC 跌幅收窄，创作者判断筹码正在被吸收。"},
        "quality_report": {"decision": "ready", "first_frame": "pass", "decisive_frame": "pass", "final_frame": "pass", "compact_readability": "pass", "data_integrity": "pass", "console_errors": 0, "hard_failures": [], "warnings": []},
    }


def codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["errors"]}


def main() -> None:
    cases = 0
    item = base_manifest(); result = validate(item); assert result["valid"], result; assert result["warnings"][0]["code"] == "NO_VIDEO_DERIVATIVE"; cases += 1
    item = base_manifest(); item["asset"]["keyframes"][-1]["at_ms"] = 3800
    assert "FINAL_FRAME" in codes(validate(item)); cases += 1
    item = base_manifest(); item["accessibility"]["autoplay_audio"] = True
    assert "ACCESSIBILITY" in codes(validate(item)); cases += 1
    item = base_manifest(); item["quality_report"]["console_errors"] = 1
    assert "READY_QUALITY" in codes(validate(item)); cases += 1
    item = base_manifest(); item["asset"]["videos"] = [{"format": "mp4", "ref": "video/viewpoint.webm", "sha256": HASH}]
    assert "VIDEO_REF" in codes(validate(item)); cases += 1
    print(f"ok: {cases} viewpoint motion manifest cases")


if __name__ == "__main__":
    main()
