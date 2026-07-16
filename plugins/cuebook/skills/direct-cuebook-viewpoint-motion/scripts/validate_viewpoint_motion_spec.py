#!/usr/bin/env python3
"""Validate ViewpointMotionSpecV1 structure and Cuebook motion invariants."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


ROOT_FIELDS = {
    "schema_version", "motion_spec_id", "state", "input_refs",
    "selected_visual_direction_ref", "message", "bindings", "form",
    "hero", "beats", "runtime", "accessibility", "outputs", "quality_report",
}
ROLES = {"hook", "evidence", "mechanism", "reaction", "view", "settlement", "hold"}
PRIMITIVES = {"reveal", "draw_path", "count", "focus_pull", "track", "morph", "pulse", "connect", "split", "settle"}
BINDING_KINDS = {"creator_judgment", "fact", "metric", "series", "level", "event", "deadline", "quote", "relationship", "instrument"}
BINDING_STATES = {"observed", "reported", "derived", "conditional", "creator_view"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Expected an object.")], "warnings": []}

    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    for key in sorted(ROOT_FIELDS - set(payload)):
        errors.append(issue("MISSING_ROOT_FIELD", f"$.{key}", "Required root field is missing."))

    if payload.get("schema_version") != "viewpoint-motion-spec-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-motion-spec-v1."))
    if not re.fullmatch(r"VMSPEC_[A-Za-z0-9_:-]{8,}", str(payload.get("motion_spec_id") or "")):
        errors.append(issue("MOTION_SPEC_ID", "$.motion_spec_id", "Expected VMSPEC_* ID."))
    if payload.get("state") not in {"draft", "keyframed", "approved"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    if not re.fullmatch(r"VDIR_[A-Za-z0-9_:-]{6,}", str(payload.get("selected_visual_direction_ref") or "")):
        errors.append(issue("VISUAL_DIRECTION_REF", "$.selected_visual_direction_ref", "Expected selected VDIR_* reference."))

    input_refs = payload.get("input_refs")
    if not isinstance(input_refs, list) or len(input_refs) < 2 or len(input_refs) != len(set(input_refs)):
        errors.append(issue("INPUT_REFS", "$.input_refs", "At least two unique input refs are required."))

    bindings = payload.get("bindings")
    binding_map: dict[str, dict[str, Any]] = {}
    if not isinstance(bindings, list) or not bindings:
        errors.append(issue("BINDINGS", "$.bindings", "At least one binding is required."))
        bindings = []
    for index, binding in enumerate(bindings):
        path = f"$.bindings[{index}]"
        if not isinstance(binding, dict):
            errors.append(issue("BINDING_TYPE", path, "Binding must be an object."))
            continue
        binding_id = str(binding.get("binding_id") or "")
        if not re.fullmatch(r"BIND_[A-Za-z0-9_:-]{4,}", binding_id):
            errors.append(issue("BINDING_ID", f"{path}.binding_id", "Expected BIND_* ID."))
        elif binding_id in binding_map:
            errors.append(issue("DUPLICATE_BINDING", f"{path}.binding_id", "Binding IDs must be unique."))
        else:
            binding_map[binding_id] = binding
        if binding.get("kind") not in BINDING_KINDS:
            errors.append(issue("BINDING_KIND", f"{path}.kind", "Unsupported binding kind."))
        if binding.get("state") not in BINDING_STATES:
            errors.append(issue("BINDING_STATE", f"{path}.state", "Unsupported binding state."))
        if not nonempty(binding.get("label")):
            errors.append(issue("BINDING_LABEL", f"{path}.label", "Binding label is required."))
        sources = binding.get("source_refs")
        if not isinstance(sources, list) or not sources or len(sources) != len(set(sources)):
            errors.append(issue("BINDING_SOURCES", f"{path}.source_refs", "Unique source refs are required."))
        value = binding.get("value")
        if isinstance(value, float) and not math.isfinite(value):
            errors.append(issue("NONFINITE_VALUE", f"{path}.value", "Binding values must be finite."))

    hero = payload.get("hero") if isinstance(payload.get("hero"), dict) else {}
    if hero.get("observed_geometry") != "solid" or hero.get("conditional_geometry") != "dashed":
        errors.append(issue("GEOMETRY_SEMANTICS", "$.hero", "Observed geometry must be solid and conditional geometry dashed."))
    for ref in hero.get("binding_refs") or []:
        if ref not in binding_map:
            errors.append(issue("UNKNOWN_HERO_BINDING", "$.hero.binding_refs", f"Unknown binding {ref!r}."))

    runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
    duration = runtime.get("duration_ms")
    if runtime.get("framework") != "react" or runtime.get("animation_library") != "motion/react":
        errors.append(issue("RUNTIME", "$.runtime", "Runtime must be React with motion/react."))
    if runtime.get("timebase") != "deterministic_ms" or runtime.get("supports_external_time") is not True:
        errors.append(issue("DETERMINISTIC_TIME", "$.runtime", "Deterministic external time is required."))
    if runtime.get("loop") is not False or runtime.get("in_view_once") is not True:
        errors.append(issue("FEED_PLAYBACK", "$.runtime", "Feed motion must play once and never loop."))
    if not isinstance(duration, int) or not 2400 <= duration <= 12000:
        errors.append(issue("DURATION", "$.runtime.duration_ms", "Duration must be 2400-12000ms."))
        duration = 0
    if runtime.get("fps") not in {25, 30, 60}:
        errors.append(issue("FPS", "$.runtime.fps", "FPS must be 25, 30, or 60."))

    accessibility = payload.get("accessibility") if isinstance(payload.get("accessibility"), dict) else {}
    if accessibility.get("reduced_motion") != "static_poster" or accessibility.get("audio_default") is not False:
        errors.append(issue("ACCESSIBILITY", "$.accessibility", "Reduced motion must use the static poster and Feed audio must default off."))

    beats = payload.get("beats")
    if not isinstance(beats, list) or not 4 <= len(beats) <= 7:
        errors.append(issue("BEAT_COUNT", "$.beats", "Motion requires 4-7 beats."))
        beats = []
    seen_beats: set[str] = set()
    previous_start = -1
    keyframe_refs: list[str] = []
    for index, beat in enumerate(beats):
        path = f"$.beats[{index}]"
        if not isinstance(beat, dict):
            errors.append(issue("BEAT_TYPE", path, "Beat must be an object."))
            continue
        beat_id = str(beat.get("beat_id") or "")
        if not re.fullmatch(r"BEAT_[A-Za-z0-9_:-]{4,}", beat_id):
            errors.append(issue("BEAT_ID", f"{path}.beat_id", "Expected BEAT_* ID."))
        elif beat_id in seen_beats:
            errors.append(issue("DUPLICATE_BEAT", f"{path}.beat_id", "Beat IDs must be unique."))
        seen_beats.add(beat_id)
        role = beat.get("role")
        if role not in ROLES:
            errors.append(issue("BEAT_ROLE", f"{path}.role", "Unsupported beat role."))
        start = beat.get("start_ms")
        end = beat.get("end_ms")
        if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start:
            errors.append(issue("BEAT_TIMING", path, "Beat timing must satisfy 0 <= start < end."))
        else:
            if start < previous_start:
                errors.append(issue("BEAT_ORDER", f"{path}.start_ms", "Beats must be ordered by start time."))
            previous_start = start
            if duration and end > duration:
                errors.append(issue("BEAT_AFTER_DURATION", f"{path}.end_ms", "Beat exceeds runtime duration."))
        refs = beat.get("binding_refs")
        if not isinstance(refs, list) or not refs:
            errors.append(issue("BEAT_BINDINGS", f"{path}.binding_refs", "Each beat needs at least one binding."))
            refs = []
        for ref in refs:
            if ref not in binding_map:
                errors.append(issue("UNKNOWN_BEAT_BINDING", f"{path}.binding_refs", f"Unknown binding {ref!r}."))
        primitives = beat.get("motion_primitives")
        if not isinstance(primitives, list) or not primitives or len(primitives) > 3 or any(item not in PRIMITIVES for item in primitives):
            errors.append(issue("MOTION_PRIMITIVES", f"{path}.motion_primitives", "Use 1-3 supported motion primitives."))
        keyframe = beat.get("keyframe_ref")
        if not isinstance(keyframe, str) or not keyframe.endswith(".png") or keyframe.startswith("/"):
            errors.append(issue("KEYFRAME_REF", f"{path}.keyframe_ref", "Keyframe ref must be a relative PNG path."))
        else:
            keyframe_refs.append(keyframe)
        if role == "settlement":
            settlement_kinds = {binding_map.get(ref, {}).get("kind") for ref in refs}
            if not settlement_kinds.intersection({"deadline", "level"}):
                errors.append(issue("SETTLEMENT_BINDING", path, "Settlement beat requires a deadline or level binding."))

    if beats:
        first_start = beats[0].get("start_ms")
        last_end = beats[-1].get("end_ms")
        if isinstance(first_start, int) and first_start > 150:
            errors.append(issue("LATE_FIRST_BEAT", "$.beats[0].start_ms", "The first beat must begin within 150ms."))
        if duration and isinstance(last_end, int) and last_end < duration - 50:
            errors.append(issue("MISSING_FINAL_HOLD", "$.beats[-1].end_ms", "The last beat must reach the final frame."))
        last = beats[-1]
        if last.get("role") != "hold":
            errors.append(issue("FINAL_ROLE", "$.beats[-1].role", "The final beat must be a readable hold."))
        elif isinstance(last.get("start_ms"), int) and isinstance(last.get("end_ms"), int) and last["end_ms"] - last["start_ms"] < 450:
            errors.append(issue("SHORT_FINAL_HOLD", "$.beats[-1]", "Final hold must last at least 450ms."))

    outputs = payload.get("outputs") if isinstance(payload.get("outputs"), dict) else {}
    if outputs.get("poster_ref") != accessibility.get("poster_ref"):
        errors.append(issue("POSTER_MISMATCH", "$.outputs.poster_ref", "Output and accessibility poster refs must match."))
    output_keyframes = outputs.get("keyframe_refs")
    if output_keyframes != keyframe_refs:
        errors.append(issue("KEYFRAME_LIST_MISMATCH", "$.outputs.keyframe_refs", "Output keyframes must match beat keyframes in order."))
    component_ref = outputs.get("component_ref")
    if not isinstance(component_ref, str) or component_ref.startswith("/") or not component_ref.endswith(".tsx"):
        errors.append(issue("COMPONENT_REF", "$.outputs.component_ref", "Component ref must be a relative TSX path."))

    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    score_names = {"semantic_continuity", "keyframe_readability", "data_integrity", "motion_craft", "reduced_motion", "weighted_score"}
    for name in score_names:
        value = quality.get(name)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 10:
            errors.append(issue("QUALITY_SCORE", f"$.quality_report.{name}", "Quality score must be 0-10."))
    hard_failures = quality.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if payload.get("state") == "approved":
        if quality.get("verdict") != "pass" or hard_failures:
            errors.append(issue("APPROVED_QUALITY", "$.quality_report", "Approved motion requires pass verdict and no hard failures."))
        for name in ("semantic_continuity", "keyframe_readability", "data_integrity", "reduced_motion"):
            value = quality.get(name)
            if isinstance(value, (int, float)) and value < 7:
                errors.append(issue("APPROVED_SCORE", f"$.quality_report.{name}", "Approved motion requires critical scores >= 7."))
    if quality.get("verdict") == "pass" and isinstance(quality.get("weighted_score"), (int, float)) and quality["weighted_score"] < 7.5:
        warnings.append(issue("LOW_PASS_SCORE", "$.quality_report.weighted_score", "Pass score is below the recommended 7.5 threshold."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.path.read_text(encoding="utf-8"))
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
