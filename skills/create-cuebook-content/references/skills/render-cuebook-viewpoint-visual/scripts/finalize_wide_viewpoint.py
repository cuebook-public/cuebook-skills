#!/usr/bin/env python3
"""Freeze a selected VisualDirectionSetV1 direction as a wide ViewpointVisualV1."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT.parent
sys.path.insert(0, str(ROOT / "scripts"))
from validate_viewpoint_visual import validate_manifest  # noqa: E402


def load_direction_validator():
    path = SKILLS_ROOT / "direct-cuebook-viewpoint-visual" / "scripts" / "validate_visual_direction_set.py"
    spec = importlib.util.spec_from_file_location("cuebook_direction_validator", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load direction validator: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def safe_asset_path(asset_root: Path, ref: str, *, base: Path | None = None) -> Path:
    relative = Path(ref)
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeError(f"Unsafe artifact-local asset ref: {ref}")
    root = asset_root.resolve()
    candidate = ((base or asset_root) / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"Asset ref escapes the artifact root: {ref}") from exc
    return candidate


def production_font_manifest(html_text: str, asset_root: Path) -> tuple[str, bytes]:
    def attribute(name: str) -> str:
        match = re.search(rf'\b{re.escape(name)}=["\']([^"\']+)["\']', html_text, flags=re.I)
        if not match:
            raise RuntimeError(f"Selected HTML is missing {name}.")
        return match.group(1)

    if attribute("data-font-profile") != "cuebook-noi-v1":
        raise RuntimeError("Selected HTML must use the cuebook-noi-v1 font profile.")
    if attribute("data-font-license-mode") != "production":
        raise RuntimeError("Final publication requires production font license mode.")
    manifest_ref = attribute("data-font-manifest-ref")
    manifest_path = safe_asset_path(asset_root, manifest_ref)
    if not manifest_path.is_file():
        raise RuntimeError(f"Font manifest is missing: {manifest_path}")
    manifest_bytes = manifest_path.read_bytes()
    try:
        manifest = json.loads(manifest_bytes)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Font manifest is invalid JSON: {manifest_path}") from exc
    if manifest.get("schema_version") != "cuebook-font-assets-v1" or manifest.get("font_profile_id") != "cuebook-noi-v1":
        raise RuntimeError("Font manifest does not bind the Cuebook Noi profile.")
    license_ref = str(manifest.get("license_ref") or "")
    if manifest.get("license_mode") != "production" or manifest.get("release_eligible") is not True:
        raise RuntimeError("Font manifest is not release-eligible production material.")
    if len(license_ref) < 6 or re.search(r"trial|eval", license_ref, flags=re.I):
        raise RuntimeError("Production font manifest needs an opaque non-evaluation license_ref.")
    css_ref = str(manifest.get("css_ref") or "")
    css_path = safe_asset_path(asset_root, css_ref, base=manifest_path.parent)
    if not css_path.is_file() or sha256_bytes(css_path.read_bytes()) != manifest.get("css_sha256"):
        raise RuntimeError("Font CSS is missing or does not match the manifest hash.")
    expected_css_ref = (PurePosixPath(manifest_ref).parent / css_ref).as_posix()
    if not re.search(rf'href=["\'](?:\./)?{re.escape(expected_css_ref)}["\']', html_text, flags=re.I):
        raise RuntimeError("Selected HTML does not load the CSS bound by its font manifest.")
    files = manifest.get("files")
    if not isinstance(files, list) or {item.get("weight") for item in files if isinstance(item, dict)} != {400, 500, 600, 700}:
        raise RuntimeError("Font manifest must bind upright Noi weights 400, 500, 600, and 700.")
    for item in files:
        ref = str(item.get("ref") or "")
        source_name = str(item.get("source_name") or "")
        if re.search(r"trial", ref + source_name, flags=re.I):
            raise RuntimeError("Production font manifest cannot reference Trial font assets.")
        font_path = safe_asset_path(asset_root, ref, base=manifest_path.parent)
        if not font_path.is_file() or sha256_bytes(font_path.read_bytes()) != item.get("sha256"):
            raise RuntimeError(f"Font asset is missing or does not match its manifest hash: {ref}")
    return manifest_ref, manifest_bytes


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def selected_direction(direction_set: dict[str, Any]) -> dict[str, Any]:
    if direction_set.get("state") != "selected":
        raise RuntimeError("VisualDirectionSetV1 must be selected before finalization.")
    selected_id = direction_set.get("selected_direction_id")
    for direction in direction_set.get("directions", []):
        if direction.get("direction_id") == selected_id:
            return direction
    raise RuntimeError("Selected direction does not resolve inside VisualDirectionSetV1.")


def payload_mode(bindings: list[dict[str, Any]]) -> str:
    kinds = {item.get("kind") for item in bindings}
    has_series = "series" in kinds
    has_key_numbers = bool(kinds.intersection({"metric", "level"})) or any(
        isinstance(item.get("value"), (int, float)) and not isinstance(item.get("value"), bool)
        for item in bindings
    )
    has_qualitative = bool(kinds - {"series", "metric", "level"})
    if has_series and (has_key_numbers or has_qualitative):
        return "mixed"
    if has_series:
        return "series"
    if has_key_numbers:
        return "key_numbers"
    return "qualitative"


def build_manifest(
    direction_set: dict[str, Any],
    asset_root: Path,
    *,
    observed_at: str,
    decision_cutoff_at: str,
    generated_at: str,
    state: str = "frozen",
) -> dict[str, Any]:
    direction = selected_direction(direction_set)
    binding_ids = set(direction.get("binding_refs", []))
    bindings = [item for item in direction_set.get("bindings", []) if item.get("binding_id") in binding_ids]
    if not bindings:
        raise RuntimeError("Selected direction has no resolved bindings.")

    html_path = asset_root / direction["html_ref"]
    full_path = asset_root / direction["preview_ref"]
    compact_path = asset_root / direction["compact_preview_ref"]
    capture_path = asset_root / direction["capture_report_ref"]
    for path in (html_path, full_path, compact_path, capture_path):
        if not path.is_file():
            raise RuntimeError(f"Required selected-direction asset is missing: {path}")

    html_bytes = html_path.read_bytes()
    font_manifest_ref, font_manifest_bytes = production_font_manifest(html_bytes.decode("utf-8"), asset_root)
    full_bytes = full_path.read_bytes()
    compact_bytes = compact_path.read_bytes()
    capture = json.loads(capture_path.read_text(encoding="utf-8"))
    capture_by_kind = {
        item.get("kind"): item
        for item in capture.get("derivatives", [])
        if isinstance(item, dict)
    }
    expected = {
        "full": (direction["preview_ref"], 2488, 1056, sha256_bytes(full_bytes)),
        "compact_622": (direction["compact_preview_ref"], 622, 264, sha256_bytes(compact_bytes)),
    }
    if capture.get("source_sha256") != sha256_bytes(html_bytes):
        raise RuntimeError("Capture report does not bind the selected HTML bytes.")
    for kind, (_, width, height, digest) in expected.items():
        item = capture_by_kind.get(kind)
        if not isinstance(item, dict) or (item.get("width"), item.get("height"), item.get("sha256")) != (width, height, digest):
            raise RuntimeError(f"Capture report does not bind the {kind} derivative.")
        painted_ratio = item.get("painted_ratio")
        if not isinstance(painted_ratio, (int, float)) or isinstance(painted_ratio, bool) or painted_ratio < 0.006:
            raise RuntimeError(f"Capture report marks the {kind} derivative as visually blank.")

    source_refs = unique([
        str(source_ref)
        for binding in bindings
        for source_ref in binding.get("source_refs", [])
    ])
    if not source_refs:
        raise RuntimeError("Selected direction bindings do not retain source refs.")

    message = direction_set["message"]
    grammar = direction_set["logic_progression"]["pattern"]
    color_system = direction["layout_system"]["color_system"]
    direction_id = direction["direction_id"]
    visual_suffix = direction_id.removeprefix("VDIR_")
    html_digest = sha256_bytes(html_bytes)
    tags = unique([str(message["direction"]), str(direction["route"])])
    refs_by_kind = {
        kind: [item["binding_id"] for item in bindings if item.get("kind") == kind]
        for kind in ("series", "metric", "level", "event")
    }

    return {
        "schema_version": "viewpoint-visual-v1",
        "visual_id": f"VVIS_{visual_suffix}_{html_digest[-12:]}",
        "render_profile": "wide_2488",
        "spec_ref": direction_id,
        "grammar": grammar,
        "payload_mode": payload_mode(bindings),
        "visual_job": "render_selected_direction",
        "state": state,
        "generated_at": generated_at,
        "dimensions": {"width": 2488, "height": 1056},
        "theme": color_system["preset_id"],
        "lineage": {
            "input_artifact_refs": unique([direction_set["direction_set_id"], *direction_set["input_refs"]]),
            "source_refs": source_refs,
            "series_refs": refs_by_kind["series"],
            "value_refs": refs_by_kind["metric"],
            "level_refs": refs_by_kind["level"],
            "event_refs": refs_by_kind["event"],
            "node_refs": [],
            "edge_refs": [],
            "rail_refs": [],
            "stage_refs": [],
            "decision_cutoff_at": decision_cutoff_at,
        },
        "content": {
            "headline": message["claim"],
            "observation": message["because"],
            "observed_at": observed_at,
            "strategy_tags": tags,
            "alt_text": f"{message['claim']}. {message['because']}. {message['implication']}.",
            "watermark": "Cuebook",
        },
        "asset": {
            "html": {"ref": direction["html_ref"], "sha256": html_digest},
            "svg": None,
            "font_manifest": {"ref": font_manifest_ref, "sha256": sha256_bytes(font_manifest_bytes)},
            "png_derivatives": [
                {"kind": kind, "ref": ref, "width": width, "height": height, "sha256": digest}
                for kind, (ref, width, height, digest) in expected.items()
            ],
            "derivative_bundle_hash": sha256_bytes(full_bytes + compact_bytes),
        },
        "quality_report": {"decision": "ready", "warnings": [], "hard_failures": []},
    }


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("direction_set", type=Path)
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--observed-at", required=True)
    parser.add_argument("--decision-cutoff-at", required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--state", choices=("ready", "frozen"), default="frozen")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        direction_set = json.loads(args.direction_set.read_text(encoding="utf-8"))
        direction_errors = load_direction_validator().validate(direction_set, args.asset_root)
        if direction_errors:
            details = "; ".join(f"{item['code']}: {item['message']}" for item in direction_errors)
            raise RuntimeError(f"Invalid VisualDirectionSetV1: {details}")
        manifest = build_manifest(
            direction_set,
            args.asset_root,
            observed_at=args.observed_at,
            decision_cutoff_at=args.decision_cutoff_at,
            generated_at=args.generated_at,
            state=args.state,
        )
        validation = validate_manifest(manifest, args.asset_root)
        if not validation["valid"]:
            details = "; ".join(f"{item['code']}: {item['message']}" for item in validation["errors"])
            raise RuntimeError(f"Final ViewpointVisualV1 failed validation: {details}")
        atomic_write(args.output, manifest)
    except (OSError, KeyError, json.JSONDecodeError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"ok": True, "manifest": str(args.output), "visual_id": manifest["visual_id"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
