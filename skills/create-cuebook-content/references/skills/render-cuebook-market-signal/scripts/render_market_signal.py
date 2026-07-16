#!/usr/bin/env python3
"""Render a validated MarketSignalSpecV1 as a Cuebook Feed SVG."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_market_signal import validate_manifest, validate_spec  # noqa: E402


WIDTH = 720
HEIGHT = 420
FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif"
PALETTES = {
    "cuebook_light": {
        "bg": "#FFFFFF",
        "ink": "#151817",
        "muted": "#66706B",
        "line": "#DDE3E0",
        "soft": "#F4F7F5",
        "green": "#0A7F60",
        "green_soft": "#EAF6F1",
        "yellow": "#F3C51D",
        "yellow_ink": "#7A5E00",
        "yellow_soft": "#FFF8DE",
        "red": "#B5424B",
        "red_soft": "#FCEEEF",
    },
    "cuebook_dark": {
        "bg": "#111413",
        "ink": "#F5F7F6",
        "muted": "#AAB2AE",
        "line": "#39413D",
        "soft": "#1A1F1D",
        "green": "#51C5A0",
        "green_soft": "#193A30",
        "yellow": "#F3C51D",
        "yellow_ink": "#F3C51D",
        "yellow_soft": "#362F13",
        "red": "#F0777F",
        "red_soft": "#3B2226",
    },
}
PROTECTED_WRAP_TOKEN = re.compile(
    r"(?:窗口看|未来|至少|接下来|先看|看)?\s*[+-]?\d[\d,.]*"
    r"(?:\s*(?:-|–|—|~|至)\s*[+-]?\d[\d,.]*)?"
    r"\s*(?:分钟|小时|天|周|个月|月|年|days?|weeks?|months?|years?|%|pp|bps?)"
    r"|\$?[A-Z][A-Z0-9./-]{1,11}"
)


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def display_width(value: str) -> int:
    return sum(2 if unicodedata.east_asian_width(char) in {"W", "F", "A"} else 1 for char in value)


def wrap_text(value: Any, max_units: int, max_lines: int) -> list[str]:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return []
    tokens: list[str] = []
    cursor = 0
    for match in PROTECTED_WRAP_TOKEN.finditer(text):
        tokens.extend(text[cursor:match.start()])
        tokens.append(match.group())
        cursor = match.end()
    tokens.extend(text[cursor:])
    lines: list[str] = []
    current = ""
    for token in tokens:
        candidate = current + token
        if current and display_width(candidate) > max_units:
            lines.append(current.rstrip())
            current = token.lstrip()
            if len(lines) == max_lines:
                break
        else:
            current = candidate
    if len(lines) < max_lines and current:
        lines.append(current.rstrip())
    rendered = "".join(lines).replace(" ", "")
    if len(rendered) < len(text.replace(" ", "")) and lines:
        tail = lines[-1]
        while tail and display_width(tail + "…") > max_units:
            tail = tail[:-1]
        lines[-1] = tail.rstrip() + "…"
    return lines[:max_lines]


def text_block(
    x: float,
    y: float,
    value: Any,
    max_units: int,
    max_lines: int,
    size: int,
    line_height: int,
    fill: str,
    weight: int = 400,
    anchor: str = "start",
) -> str:
    lines = wrap_text(value, max_units, max_lines)
    spans = "".join(
        f'<tspan x="{x:.1f}" dy="{0 if index == 0 else line_height}">{esc(line)}</tspan>'
        for index, line in enumerate(lines)
    )
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-family="{FONT}" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="0" '
        f'font-variant-numeric="tabular-nums">{spans}</text>'
    )


def rect(x: float, y: float, width: float, height: float, fill: str, radius: int = 0, stroke: str = "none") -> str:
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'rx="{radius}" fill="{fill}" stroke="{stroke}"/>'
    )


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def trade_colors(spec: dict[str, Any], colors: dict[str, str]) -> tuple[str, str]:
    expression = spec["trade_logic"]["expression"]
    if expression in {"outright_short", "short_vol"}:
        return colors["red"], colors["red_soft"]
    if expression in {"options_convexity", "volatility_trade"}:
        return colors["yellow_ink"], colors["yellow_soft"]
    return colors["green"], colors["green_soft"]


def brand_mark(colors: dict[str, str]) -> list[str]:
    return [
        rect(608, 14, 20, 20, colors["yellow"], 4),
        text_block(618, 29, "C", 2, 1, 12, 14, "#111413", 800, "middle"),
        text_block(692, 28, "Cuebook", 16, 1, 12, 14, colors["ink"], 700, "end"),
    ]


def render_key_number(spec: dict[str, Any], colors: dict[str, str]) -> list[str]:
    number = spec["key_number"]
    signal_time = parse_time(number["as_of"])
    accent, accent_soft = trade_colors(spec, colors)
    meta = " · ".join([f"{signal_time:%m/%d %H:%M} UTC", *spec["trade_logic"]["public_tags"]])
    value = number["display_value"]
    value_size = 76 if display_width(value) <= 13 else 62 if display_width(value) <= 18 else 50
    comparison = number.get("comparison")
    parts = [
        text_block(28, 27, meta, 78, 1, 10, 12, colors["muted"], 650),
        *brand_mark(colors),
        text_block(28, 84, spec["frame"]["headline"], 43, 2, 29, 37, colors["ink"], 800),
        rect(28, 171, 4, 96, accent, 2),
        text_block(52, 231, value, 20, 1, value_size, value_size + 4, colors["ink"], 800),
        text_block(55, 267, number["label"], 34, 1, 14, 17, accent, 700),
    ]
    if comparison:
        parts.extend(
            [
                rect(477, 190, 215, 64, accent_soft, 6),
                text_block(494, 215, "同口径比较", 20, 1, 11, 13, accent, 700),
                text_block(494, 240, comparison, 26, 1, 18, 21, colors["ink"], 700),
            ]
        )
    parts.extend(
        [
            f'<line x1="28" y1="304" x2="692" y2="304" stroke="{colors["line"]}" stroke-width="1"/>',
            text_block(28, 342, spec["frame"]["interpretation"], 57, 2, 20, 28, colors["ink"], 650),
            rect(28, 382, 96, 4, accent, 2),
        ]
    )
    return parts


def render_key_news(spec: dict[str, Any], colors: dict[str, str]) -> list[str]:
    news = spec["key_news"]
    signal_time = parse_time(news["published_at"])
    accent, accent_soft = trade_colors(spec, colors)
    tags = " · ".join(spec["trade_logic"]["public_tags"])
    action = spec["frame"]["headline"]
    action_size = 34 if display_width(action) <= 42 else 30
    parts = [
        text_block(28, 27, f"{signal_time:%m/%d %H:%M} UTC · {news['publisher']}", 48, 1, 12, 14, colors["muted"], 600),
        *brand_mark(colors),
        text_block(28, 72, tags, 70, 1, 14, 17, accent, 700),
        rect(28, 94, 4, 78, accent, 2),
        text_block(52, 124, action, 42, 2, action_size, action_size + 8, colors["ink"], 800),
        rect(28, 194, 664, 72, accent_soft, 6),
        text_block(44, 216, "因为", 8, 1, 11, 13, accent, 700),
        text_block(44, 246, news["headline"], 61, 2, 18, 22, colors["ink"], 700),
        f'<line x1="28" y1="290" x2="692" y2="290" stroke="{colors["line"]}" stroke-width="1"/>',
        text_block(28, 329, spec["frame"]["interpretation"], 57, 2, 20, 28, colors["ink"], 650),
        rect(28, 382, 96, 4, accent, 2),
    ]
    return parts


def render_svg(spec: dict[str, Any]) -> str:
    colors = PALETTES[spec["render"]["theme"]]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" data-signal-mode="{esc(spec["mode"])}">',
        f'<title>{esc(spec["frame"]["headline"])}</title>',
        rect(0, 0, WIDTH, HEIGHT, colors["bg"]),
    ]
    if spec["mode"] == "key_number":
        parts.extend(render_key_number(spec, colors))
    else:
        parts.extend(render_key_news(spec, colors))
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def render(spec: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    validation = validate_spec(spec)
    if not validation["valid"]:
        raise ValueError(json.dumps(validation, ensure_ascii=False, indent=2))
    output_dir.mkdir(parents=True, exist_ok=True)
    svg_path = output_dir / "market-signal.svg"
    manifest_path = output_dir / "market-signal-v1.json"
    svg = render_svg(spec)
    svg_path.write_text(svg, encoding="utf-8")
    content_hash = "sha256:" + hashlib.sha256(svg.encode("utf-8")).hexdigest()
    if spec["mode"] == "key_number":
        signal = spec["key_number"]
        signal_time = signal["as_of"]
        signal_label = signal["label"]
        signal_value = signal["display_value"]
        signal_status = signal["status"]
    else:
        signal = spec["key_news"]
        signal_time = signal["published_at"]
        signal_label = signal["publisher"]
        signal_value = None
        signal_status = signal["status"]
    manifest = {
        "schema_version": "market-signal-v1",
        "market_signal_id": spec["signal_id"].replace("SIGSPEC_", "SIGNAL_", 1),
        "spec_ref": spec["signal_id"],
        "mode": spec["mode"],
        "state": spec["state"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dimensions": {"width": WIDTH, "height": HEIGHT},
        "theme": spec["render"]["theme"],
        "lineage": {**spec["lineage"], "trade_logic_ref": spec["trade_logic"]["profile_ref"]},
        "content": {
            "category": spec["frame"]["category"],
            "asset_label": spec["frame"]["asset_label"],
            "headline": spec["frame"]["headline"],
            "interpretation": spec["frame"]["interpretation"],
            "strategy_tags": spec["trade_logic"]["public_tags"],
            "signal_time": signal_time,
            "signal_label": signal_label,
            "signal_value": signal_value,
            "signal_status": signal_status,
            "watermark": "Cuebook",
        },
        "asset": {"svg_ref": svg_path.name, "content_hash": content_hash},
        "quality_report": spec["quality_report"],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_validation = validate_manifest(manifest, output_dir)
    if not manifest_validation["valid"]:
        raise ValueError(json.dumps(manifest_validation, ensure_ascii=False, indent=2))
    return {"svg_path": svg_path, "manifest_path": manifest_path, "manifest": manifest}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    result = render(spec, args.output_dir)
    print(json.dumps({"ok": True, "mode": spec["mode"], "svg": str(result["svg_path"]), "manifest": str(result["manifest_path"])}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
