#!/usr/bin/env python3
"""Stage original Noi font files for a network-free Cuebook render."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
from pathlib import Path


WEIGHTS = {
    "regular": 400,
    "medium": 500,
    "semibold": 600,
    "bold": 700,
}
EXTENSIONS = {".otf": "opentype", ".ttf": "truetype", ".woff": "woff", ".woff2": "woff2"}


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def find_weight(source: Path, weight: str) -> Path:
    candidates = []
    for path in source.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        stem = re.sub(r"[^a-z0-9]+", "", path.stem.lower())
        if weight in stem and "italic" not in stem:
            candidates.append(path)
    if not candidates:
        raise RuntimeError(f"Missing upright Noi {weight} font in {source}.")
    candidates.sort(key=lambda item: (len(item.parts), len(item.name), str(item)))
    return candidates[0]


def stage(source: Path, target: Path, *, license_mode: str, license_ref: str) -> dict:
    if not source.is_dir():
        raise RuntimeError(f"Font source directory does not exist: {source}")
    selected = {weight: find_weight(source, weight) for weight in WEIGHTS}
    if license_mode == "production" and any("trial" in str(path).lower() for path in [source, *selected.values()]):
        raise RuntimeError("Production mode rejects Trial font paths and filenames.")
    if license_mode == "production" and (len(license_ref.strip()) < 6 or re.search(r"trial|eval", license_ref, flags=re.I)):
        raise RuntimeError("Production mode requires an opaque non-evaluation license_ref.")

    target.mkdir(parents=True, exist_ok=True)
    records = []
    faces = []
    for weight, numeric_weight in WEIGHTS.items():
        source_path = selected[weight]
        suffix = source_path.suffix.lower()
        output_name = f"cuebook-noi-{weight}{suffix}"
        output_path = target / output_name
        shutil.copy2(source_path, output_path)
        records.append({
            "weight": numeric_weight,
            "style": "normal",
            "ref": output_name,
            "sha256": digest(output_path),
            "source_name": source_path.name,
            "source_sha256": digest(source_path),
        })
        faces.append(
            "\n".join([
                "@font-face {",
                '  font-family: "Cuebook Noi";',
                f'  src: url("./{output_name}") format("{EXTENSIONS[suffix]}");',
                "  font-style: normal;",
                f"  font-weight: {numeric_weight};",
                "  font-display: block;",
                "}",
            ])
        )

    css_path = target / "cuebook-noi-fonts.css"
    css_path.write_text("\n\n".join(faces) + "\n", encoding="utf-8")
    manifest = {
        "schema_version": "cuebook-font-assets-v1",
        "font_profile_id": "cuebook-noi-v1",
        "family_alias": "Cuebook Noi",
        "license_mode": license_mode,
        "license_ref": license_ref,
        "release_eligible": license_mode == "production",
        "css_ref": css_path.name,
        "css_sha256": digest(css_path),
        "files": records,
    }
    manifest_path = target / "font-assets-v1.json"
    temporary = target / f".{manifest_path.name}.{os.getpid()}.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, manifest_path)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory containing original licensed or evaluation Noi files.")
    parser.add_argument("target", type=Path, help="Artifact-local fonts directory.")
    parser.add_argument("--license-mode", choices=("evaluation", "production"), required=True)
    parser.add_argument("--license-ref", required=True, help="Opaque procurement or evaluation reference; never a license document body.")
    args = parser.parse_args()
    try:
        manifest = stage(args.source, args.target, license_mode=args.license_mode, license_ref=args.license_ref)
    except (OSError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"ok": True, "target": str(args.target), "manifest": manifest}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
