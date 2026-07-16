#!/usr/bin/env python3
"""Audit a rendered Cuebook chart for public-style leakage and design locks."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def finding(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def audit(path: Path) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as exc:
        return {"valid": False, "errors": [finding("SVG_READ", str(exc))], "warnings": []}
    if local_name(root.tag) != "svg":
        errors.append(finding("SVG_ROOT", "Root element must be svg."))

    profile = root.attrib.get("data-style-profile")
    if profile not in {"cuebook_feed_v1", "cuebook_detail_v1"}:
        errors.append(finding("STYLE_PROFILE", "Rendered SVG must declare a Cuebook style profile."))
    if root.attrib.get("font-variant-numeric") != "tabular-nums":
        errors.append(finding("TABULAR_NUMS", "Market charts must use tabular numerals."))
    if root.attrib.get("letter-spacing") != "0":
        errors.append(finding("LETTER_SPACING", "Cuebook chart letter spacing must remain zero."))

    elements = list(root.iter())
    names = {local_name(item.tag) for item in elements}
    for banned in {"linearGradient", "radialGradient", "filter"} & names:
        errors.append(finding("DECORATIVE_EFFECT", f"Cuebook charts do not use {banned}."))

    all_text = " ".join("".join(item.itertext()) for item in elements if local_name(item.tag) in {"title", "desc", "text"})
    if "Cuebook" not in all_text:
        errors.append(finding("WATERMARK", "Cuebook watermark text is missing."))

    public_titles = [item for item in elements if local_name(item.tag) == "text" and item.attrib.get("id") == "public-title"]
    if len(public_titles) != 1:
        errors.append(finding("PUBLIC_TITLE", "Rendered chart must contain one visible public title."))
    else:
        lines = [item for item in public_titles[0] if local_name(item.tag) == "tspan"]
        if len(lines) > 2:
            errors.append(finding("TITLE_LINES", "Feed/detail chart title may use at most two lines."))

    if profile == "cuebook_feed_v1":
        banned_phrases = {
            "CONDITIONAL": "internal artifact state",
            "DRAFT": "internal artifact state",
            "Cuebook OHLCV": "provenance footer",
            "结算条件": "settlement prose panel",
            "Settlement ·": "settlement prose panel",
            "Solid candle": "rendering guide",
            "hollow/dashed": "rendering guide",
            "实体/实线": "rendering guide",
            "从观点描述中提取": "workflow narration",
            "Cuebook 从观点": "workflow narration",
            "schema_version": "schema metadata",
        }
        for phrase, meaning in banned_phrases.items():
            if phrase.lower() in all_text.lower():
                errors.append(finding("FEED_LEAKAGE", f"Feed SVG exposes {meaning}: {phrase}."))
        width = float(root.attrib.get("width", 0))
        height = float(root.attrib.get("height", 0))
        if width / max(height, 1) < 1.45:
            warnings.append(finding("FEED_ASPECT", "Feed chart is unusually tall; inspect it at thumbnail size."))

    return {
        "valid": not errors,
        "style_profile": profile,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    result = audit(args.path)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
