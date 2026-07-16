#!/usr/bin/env python3
"""Validate ViewpointMotionV1 manifest and optional local asset hashes."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT_FIELDS = {"schema_version", "motion_id", "spec_ref", "state", "framework", "animation_library", "dimensions", "timebase", "duration_ms", "fps", "lineage", "asset", "accessibility", "quality_report"}
HASH_RE = re.compile(r"sha256:[a-f0-9]{64}")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def valid_relative_ref(value: Any, suffixes: tuple[str, ...]) -> bool:
    return isinstance(value, str) and bool(value) and not value.startswith("/") and value.endswith(suffixes)


def validate(payload: Any, asset_root: Path | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Expected an object.")], "warnings": []}
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_ROOT_FIELD", f"$.{key}", "Required root field is missing."))

    if payload.get("schema_version") != "viewpoint-motion-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-motion-v1."))
    if not re.fullmatch(r"VMOTION_[A-Za-z0-9_:-]{8,}", str(payload.get("motion_id") or "")):
        errors.append(issue("MOTION_ID", "$.motion_id", "Expected VMOTION_* ID."))
    if not re.fullmatch(r"VMSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("spec_ref") or "")):
        errors.append(issue("SPEC_REF", "$.spec_ref", "Expected VMSPEC_* reference."))
    if payload.get("state") not in {"draft", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    if payload.get("framework") != "react" or payload.get("animation_library") != "motion/react":
        errors.append(issue("RUNTIME", "$", "Expected React with motion/react."))
    if payload.get("timebase") != "deterministic_ms":
        errors.append(issue("TIMEBASE", "$.timebase", "Expected deterministic_ms."))
    duration = payload.get("duration_ms")
    if not isinstance(duration, int) or not 2400 <= duration <= 12000:
        errors.append(issue("DURATION", "$.duration_ms", "Duration must be 2400-12000ms."))
        duration = 0
    if payload.get("fps") not in {25, 30, 60}:
        errors.append(issue("FPS", "$.fps", "FPS must be 25, 30, or 60."))

    dimensions = payload.get("dimensions") if isinstance(payload.get("dimensions"), dict) else {}
    expected_dimensions = {"width": 720, "height": 420, "compact_width": 360, "compact_height": 210}
    if dimensions != expected_dimensions:
        errors.append(issue("DIMENSIONS", "$.dimensions", "Expected 720x420 and 360x210 dimensions."))

    assets = payload.get("asset") if isinstance(payload.get("asset"), dict) else {}
    refs: list[tuple[str, str, str]] = []
    component = assets.get("component") if isinstance(assets.get("component"), dict) else {}
    poster = assets.get("poster") if isinstance(assets.get("poster"), dict) else {}
    if not valid_relative_ref(component.get("ref"), (".tsx",)):
        errors.append(issue("COMPONENT_REF", "$.asset.component.ref", "Expected relative TSX component ref."))
    else:
        refs.append(("$.asset.component", component["ref"], str(component.get("sha256") or "")))
    if not valid_relative_ref(poster.get("ref"), (".png",)):
        errors.append(issue("POSTER_REF", "$.asset.poster.ref", "Expected relative PNG poster ref."))
    else:
        refs.append(("$.asset.poster", poster["ref"], str(poster.get("sha256") or "")))

    keyframes = assets.get("keyframes")
    if not isinstance(keyframes, list) or not 4 <= len(keyframes) <= 7:
        errors.append(issue("KEYFRAME_COUNT", "$.asset.keyframes", "Expected 4-7 keyframes."))
        keyframes = []
    previous = -1
    seen_times: set[int] = set()
    for index, frame in enumerate(keyframes):
        path = f"$.asset.keyframes[{index}]"
        if not isinstance(frame, dict):
            errors.append(issue("KEYFRAME_TYPE", path, "Keyframe must be an object."))
            continue
        at_ms = frame.get("at_ms")
        if not isinstance(at_ms, int) or at_ms < 0 or (duration and at_ms > duration):
            errors.append(issue("KEYFRAME_TIME", f"{path}.at_ms", "Keyframe time must lie inside duration."))
        else:
            if at_ms <= previous or at_ms in seen_times:
                errors.append(issue("KEYFRAME_ORDER", f"{path}.at_ms", "Keyframe times must be strictly increasing."))
            previous = at_ms
            seen_times.add(at_ms)
        if not valid_relative_ref(frame.get("ref"), (".png",)):
            errors.append(issue("KEYFRAME_REF", f"{path}.ref", "Expected relative PNG keyframe ref."))
        else:
            refs.append((path, frame["ref"], str(frame.get("sha256") or "")))
    if keyframes:
        first = keyframes[0].get("at_ms")
        last = keyframes[-1].get("at_ms")
        if isinstance(first, int) and first > 150:
            errors.append(issue("FIRST_FRAME", "$.asset.keyframes[0].at_ms", "First keyframe must be within 150ms."))
        if duration and isinstance(last, int) and last < duration - 50:
            errors.append(issue("FINAL_FRAME", "$.asset.keyframes[-1].at_ms", "Final keyframe must capture the final hold."))

    videos = assets.get("videos")
    if not isinstance(videos, list) or len(videos) > 2:
        errors.append(issue("VIDEOS", "$.asset.videos", "videos must contain zero to two derivatives."))
        videos = []
    seen_formats: set[str] = set()
    for index, video in enumerate(videos):
        path = f"$.asset.videos[{index}]"
        if not isinstance(video, dict) or video.get("format") not in {"mp4", "webm"}:
            errors.append(issue("VIDEO_FORMAT", path, "Video format must be mp4 or webm."))
            continue
        fmt = video["format"]
        if fmt in seen_formats:
            errors.append(issue("DUPLICATE_VIDEO_FORMAT", f"{path}.format", "Video formats must be unique."))
        seen_formats.add(fmt)
        if not valid_relative_ref(video.get("ref"), (f".{fmt}",)):
            errors.append(issue("VIDEO_REF", f"{path}.ref", "Video ref extension must match format."))
        else:
            refs.append((path, video["ref"], str(video.get("sha256") or "")))

    for path, ref, expected_hash in refs:
        if not HASH_RE.fullmatch(expected_hash):
            errors.append(issue("ASSET_HASH", f"{path}.sha256", "Expected sha256:<64 lowercase hex>."))
            continue
        if asset_root is not None:
            candidate = (asset_root / ref).resolve()
            try:
                candidate.relative_to(asset_root.resolve())
            except ValueError:
                errors.append(issue("ASSET_ESCAPE", f"{path}.ref", "Asset ref escapes asset root."))
                continue
            if not candidate.is_file():
                errors.append(issue("ASSET_MISSING", f"{path}.ref", f"Missing asset {ref!r}."))
                continue
            actual = "sha256:" + hashlib.sha256(candidate.read_bytes()).hexdigest()
            if actual != expected_hash:
                errors.append(issue("ASSET_HASH_MISMATCH", f"{path}.sha256", f"Hash mismatch for {ref!r}."))

    accessibility = payload.get("accessibility") if isinstance(payload.get("accessibility"), dict) else {}
    if accessibility.get("reduced_motion_verified") is not True or accessibility.get("autoplay_audio") is not False:
        errors.append(issue("ACCESSIBILITY", "$.accessibility", "Reduced motion must be verified and autoplay audio disabled."))

    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    pass_fields = ("first_frame", "decisive_frame", "final_frame", "compact_readability", "data_integrity")
    for name in pass_fields:
        if quality.get(name) not in {"pass", "fail"}:
            errors.append(issue("QUALITY_FIELD", f"$.quality_report.{name}", "Expected pass or fail."))
    if not isinstance(quality.get("console_errors"), int) or quality.get("console_errors", -1) < 0:
        errors.append(issue("CONSOLE_ERRORS", "$.quality_report.console_errors", "Expected a non-negative integer."))
    hard_failures = quality.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if payload.get("state") in {"ready", "frozen"}:
        if quality.get("decision") != "ready" or hard_failures or quality.get("console_errors") != 0:
            errors.append(issue("READY_QUALITY", "$.quality_report", "Ready or frozen motion needs ready decision, zero console errors, and no hard failures."))
        for name in pass_fields:
            if quality.get(name) != "pass":
                errors.append(issue("READY_GATE", f"$.quality_report.{name}", "All critical gates must pass."))
    if not videos:
        warnings.append(issue("NO_VIDEO_DERIVATIVE", "$.asset.videos", "No video derivative is present; React motion remains publishable in Cuebook."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--asset-root", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.path.read_text(encoding="utf-8"))
    result = validate(payload, args.asset_root)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
