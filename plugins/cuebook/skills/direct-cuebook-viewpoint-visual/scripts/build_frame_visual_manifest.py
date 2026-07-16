#!/usr/bin/env python3
"""Build the frame visual manifest that binds rendered viewpoint media to its lineage.

The manifest is the handshake between the visual Skill and the Frame backend:
per-role rendition hashes, the rendered-audit verdict, the source bindings the
image displays, the font profile, and per-role alt text. The backend verifies
the uploaded bytes against `role_hashes` and stores the manifest JCS hash.

All scalar values are strings or booleans so the JCS hash is stable across
languages; floats are rejected.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "frame-visual-manifest-v1"
CAPTURE_KIND_TO_ROLE = {"full": "publication", "compact_622": "compact", "og": "og"}
REQUIRED_ROLES = ("publication", "compact")


def canonical_jcs(value: Any) -> str:
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, (int, float)):
        raise ValueError("manifest scalars must be strings or booleans; numbers break cross-language JCS stability")
    if isinstance(value, list):
        return "[" + ",".join(canonical_jcs(item) for item in value) + "]"
    if isinstance(value, dict):
        parts = []
        for key in sorted(value):
            if not isinstance(key, str):
                raise ValueError("manifest keys must be strings")
            parts.append(f"{json.dumps(key, ensure_ascii=False)}:{canonical_jcs(value[key])}")
        return "{" + ",".join(parts) + "}"
    raise ValueError(f"unsupported manifest value type: {type(value).__name__}")


def jcs_sha256(value: Any) -> str:
    return f"sha256:{hashlib.sha256(canonical_jcs(value).encode('utf-8')).hexdigest()}"


def issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def build(
    capture_report: dict,
    render_audit: dict,
    direction_set: dict,
    fonts_manifest_path: Path,
    alt_text_by_role: dict[str, str],
) -> tuple[dict | None, list[dict[str, str]]]:
    errors: list[dict[str, str]] = []

    role_hashes: dict[str, str] = {}
    for output in capture_report.get("derivatives", []):
        role = CAPTURE_KIND_TO_ROLE.get(str(output.get("kind")))
        if role:
            role_hashes[role] = str(output.get("sha256"))
    for role in REQUIRED_ROLES:
        if role not in role_hashes:
            errors.append(issue("ROLE_MISSING", f"Capture report has no {role} rendition; the backend blocks publication without it."))

    if render_audit.get("valid") is not True:
        errors.append(issue("AUDIT_NOT_PASSED", "Rendered audit must be valid before a manifest is issued."))
    capture_audit = {"decision": "ready" if render_audit.get("valid") is True else "blocked", "status": "passed" if render_audit.get("valid") is True else "failed"}

    source_bindings = []
    for binding in direction_set.get("bindings", []):
        if binding.get("selected_for_display") is True:
            refs = binding.get("source_refs") or []
            source_bindings.append({
                "ref": str(refs[0]) if refs else str(binding.get("binding_id")),
                "binding_id": str(binding.get("binding_id")),
                "sha256": jcs_sha256({"binding_id": str(binding.get("binding_id")), "label": str(binding.get("label")), "source_refs": [str(r) for r in refs]}),
            })
    if not source_bindings:
        errors.append(issue("NO_SOURCE_BINDINGS", "A publishable visual carries at least one selected display binding."))

    try:
        fonts_manifest_bytes = fonts_manifest_path.read_bytes()
        fonts = json.loads(fonts_manifest_bytes)
        profile = str(fonts.get("profile") or fonts.get("font_profile") or "cuebook-noi-v1")
        font_profile = {"profile": profile, "manifest_sha256": f"sha256:{hashlib.sha256(fonts_manifest_bytes).hexdigest()}"}
        if str(fonts.get("license_mode")) == "evaluation":
            errors.append(issue("TRIAL_FONTS", "Evaluation/Trial fonts cannot enter a publishable manifest."))
    except (OSError, json.JSONDecodeError):
        errors.append(issue("FONTS_MANIFEST_UNREADABLE", f"Cannot read fonts manifest at {fonts_manifest_path}."))
        font_profile = None

    for role in role_hashes:
        text = alt_text_by_role.get(role, "")
        if not text or not text.strip():
            errors.append(issue("ALT_TEXT_MISSING", f"Role {role} needs non-empty alt text."))

    if errors:
        return None, errors

    manifest = {
        "schema_version": SCHEMA_VERSION,
        "role_hashes": role_hashes,
        "capture_audit": capture_audit,
        "source_bindings": source_bindings,
        "font_profile": font_profile,
        "alt_text_by_role": {role: alt_text_by_role[role] for role in sorted(role_hashes)},
    }
    return manifest, []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-report", type=Path, required=True)
    parser.add_argument("--render-audit", type=Path, required=True)
    parser.add_argument("--direction-set", type=Path, required=True)
    parser.add_argument("--fonts-manifest", type=Path, required=True)
    parser.add_argument("--alt-text", type=Path, required=True, help="JSON object mapping rendition role to alt text.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    manifest, errors = build(
        json.loads(args.capture_report.read_text(encoding="utf-8")),
        json.loads(args.render_audit.read_text(encoding="utf-8")),
        json.loads(args.direction_set.read_text(encoding="utf-8")),
        args.fonts_manifest,
        json.loads(args.alt_text.read_text(encoding="utf-8")),
    )
    if manifest is None:
        print(json.dumps({"valid": False, "errors": errors}, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    args.out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"valid": True, "manifest_ref": str(args.out), "manifest_sha256": jcs_sha256(manifest)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
