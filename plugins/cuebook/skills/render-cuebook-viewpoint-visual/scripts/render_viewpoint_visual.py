#!/usr/bin/env python3
"""Render a validated ViewpointVisualSpecV1 as a deterministic Cuebook SVG bundle."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
WORDMARK_ASSET = ROOT.parent / "direct-cuebook-viewpoint-visual" / "assets" / "cuebook-wordmark.svg"
sys.path.insert(0, str(ROOT / "scripts"))
from validate_viewpoint_visual import validate_manifest, validate_spec  # noqa: E402


TOKENS = json.loads((ROOT / "references" / "cuebook-visual-tokens-v1.json").read_text(encoding="utf-8"))
COLORS = TOKENS["colors"]
TYPE = TOKENS["type"]
GEOMETRY = TOKENS["geometry"]
WIDTH = TOKENS["canvas"]["width"]
HEIGHT = TOKENS["canvas"]["height"]
FONT = TYPE["family"]
MIN_FONT = TYPE["minimum_canonical_px"]
WORDMARK_PATHS = re.findall(r'<path\s+d="([^"]+)"', WORDMARK_ASSET.read_text(encoding="utf-8"))
if not WORDMARK_PATHS:
    raise RuntimeError(f"Canonical Cuebook wordmark has no paths: {WORDMARK_ASSET}")


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def display_width(value: str) -> int:
    return sum(2 if unicodedata.east_asian_width(char) in {"W", "F", "A"} else 1 for char in value)


def wrap_text(value: Any, max_units: int, max_lines: int) -> list[str]:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return []
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    if len(words) > 1:
        for word in words:
            candidate = f"{current} {word}".strip()
            if current and display_width(candidate) > max_units:
                lines.append(current)
                current = word
            else:
                current = candidate
            while display_width(current) > max_units:
                split_at = max_units
                while split_at > 1 and display_width(current[:split_at]) > max_units:
                    split_at -= 1
                lines.append(current[:split_at])
                current = current[split_at:]
        if current:
            lines.append(current)
    else:
        for char in text:
            candidate = current + char
            if current and display_width(candidate) > max_units:
                lines.append(current.rstrip())
                current = char.lstrip()
            else:
                current = candidate
        if current:
            lines.append(current.rstrip())
    if len(lines) > max_lines:
        raise RuntimeError(f"Validated public text does not fit: {text!r}")
    return lines


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
    extra: str = "",
) -> str:
    if size < MIN_FONT:
        raise RuntimeError(f"Visible type cannot be smaller than {MIN_FONT}px.")
    lines = wrap_text(value, max_units, max_lines)
    spans = "".join(
        f'<tspan x="{x:.1f}" dy="{0 if index == 0 else line_height}">{esc(line)}</tspan>'
        for index, line in enumerate(lines)
    )
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-family="{esc(FONT)}" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="0" '
        f'font-variant-numeric="tabular-nums" {extra}>{spans}</text>'
    )


def rect(
    x: float,
    y: float,
    width: float,
    height: float,
    fill: str,
    *,
    stroke: str = "none",
    stroke_width: float = 0,
    radius: float = 0,
    dash: str | None = None,
    extra: str = "",
) -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'rx="{radius:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width:.1f}"'
        f'{dash_attr} {extra}/>'
    )


def line(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    stroke: str,
    *,
    width: float = 2,
    dash: str | None = None,
    arrow: bool = False,
    extra: str = "",
) -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    marker_name = {
        COLORS["ink"]: "ink",
        COLORS["muted"]: "muted",
        COLORS["positive"]: "positive",
        COLORS["comparison"]: "comparison",
        COLORS["negative"]: "negative",
        COLORS["highlight_ink"]: "highlight",
    }.get(stroke, "muted")
    marker = f' marker-end="url(#vv-arrow-{marker_name})"' if arrow else ""
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="{stroke}" stroke-width="{width:.1f}" stroke-linecap="round"'
        f'{dash_attr}{marker} {extra}/>'
    )


def curve(
    d: str,
    stroke: str,
    *,
    width: float = 2,
    dash: str | None = None,
    arrow: bool = False,
    extra: str = "",
) -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    marker_name = {
        COLORS["ink"]: "ink",
        COLORS["muted"]: "muted",
        COLORS["positive"]: "positive",
        COLORS["comparison"]: "comparison",
        COLORS["negative"]: "negative",
        COLORS["highlight_ink"]: "highlight",
    }.get(stroke, "muted")
    marker = f' marker-end="url(#vv-arrow-{marker_name})"' if arrow else ""
    return (
        f'<path d="{esc(d)}" fill="none" stroke="{stroke}" stroke-width="{width:.1f}" '
        f'stroke-linecap="round" stroke-linejoin="round"{dash_attr}{marker} {extra}/>'
    )


def marker_shape(x: float, y: float, shape: str, color: str, size: float = 8, *, outline: bool = False) -> str:
    fill = COLORS["canvas"] if outline else color
    stroke_width = 3 if outline else 2
    if shape == "circle":
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size:.1f}" fill="{fill}" stroke="{color}" stroke-width="{stroke_width}"/>'
    if shape == "square":
        return rect(x - size, y - size, size * 2, size * 2, fill, stroke=color, stroke_width=stroke_width, radius=1)
    if shape == "triangle":
        points = f"{x:.1f},{y-size:.1f} {x+size:.1f},{y+size:.1f} {x-size:.1f},{y+size:.1f}"
        return f'<polygon points="{points}" fill="{fill}" stroke="{color}" stroke-width="{stroke_width}"/>'
    points = f"{x:.1f},{y-size:.1f} {x+size:.1f},{y:.1f} {x:.1f},{y+size:.1f} {x-size:.1f},{y:.1f}"
    return f'<polygon points="{points}" fill="{fill}" stroke="{color}" stroke-width="{stroke_width}"/>'


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def time_label(value: str) -> str:
    return parse_time(value).strftime("%Y.%m.%d  %H:%M UTC")


def short_time(value: str) -> str:
    return parse_time(value).strftime("%d %b / %H:%M").upper()


def fmt_number(value: float, unit: str) -> str:
    absolute = abs(value)
    if absolute >= 1_000_000:
        number = f"{value / 1_000_000:.3f}".rstrip("0").rstrip(".") + "m"
    elif absolute >= 1_000:
        number = f"{value / 1_000:.2f}".rstrip("0").rstrip(".") + "k"
    elif math.isclose(value, round(value), abs_tol=1e-9):
        number = str(int(round(value)))
    else:
        number = f"{value:.2f}".rstrip("0").rstrip(".")
    if unit in {"%", "pp", "bps"}:
        return f"{number}{unit}"
    return f"{number} {unit}".strip()


def path_dash(path_kind: str | None) -> str | None:
    return GEOMETRY["dash"] if path_kind in {"conditional", "future"} else None


def canonical_wordmark() -> str:
    paths = "".join(f'<path d="{esc(path)}" fill="currentColor"/>' for path in WORDMARK_PATHS)
    x = WIDTH - 22 - 73
    y = HEIGHT - 18 - 14
    return (
        f'<g data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" '
        f'transform="translate({x} {y})" color="{COLORS["ink"]}" pointer-events="none">{paths}</g>'
    )


def common_open(spec: dict[str, Any]) -> list[str]:
    frame = spec["frame"]
    tag_line = " / ".join(frame["strategy_tags"])
    parts = [
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
            f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="vv-title vv-desc" '
            f'data-schema="viewpoint-visual-v1" data-grammar="{esc(spec["grammar"])}" '
            f'data-payload-mode="{esc(spec["payload_mode"])}" '
            f'data-design-language="cuebook-editorial-signal-v2" '
            f'data-composition="{esc(spec["grammar"])}">'
        ),
        f'<title id="vv-title">{esc(frame["headline"])}</title>',
        f'<desc id="vv-desc">{esc(frame["alt_text"])}</desc>',
        "<defs>",
    ]
    arrow_colors = {
        "ink": COLORS["ink"],
        "muted": COLORS["muted"],
        "positive": COLORS["positive"],
        "comparison": COLORS["comparison"],
        "negative": COLORS["negative"],
        "highlight": COLORS["highlight_ink"],
    }
    for name, color in arrow_colors.items():
        parts.append(
            f'<marker id="vv-arrow-{name}" viewBox="0 0 10 10" refX="9" refY="5" '
            f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<polygon points="0,0 10,5 0,10" fill="{color}"/></marker>'
        )
    parts.extend(
        [
            "</defs>",
            rect(0, 0, WIDTH, HEIGHT, COLORS["canvas"]),
            text_block(30, 29, time_label(frame["observed_at"]), 32, 1, TYPE["meta_px"], 24, COLORS["muted"], 520),
            text_block(30, 62, tag_line, 58, 1, TYPE["tag_px"], 24, COLORS["positive"], 700),
            text_block(30, 99, frame["headline"], 42, 2, TYPE["headline_px"], TYPE["headline_line_height_px"], COLORS["ink"], 760),
            text_block(30, 179, frame["observation"], 62, 1, TYPE["body_px"], 24, COLORS["muted"], 500),
            line(30, 207, 690, 207, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
        ]
    )
    return parts


def rails_by_role(spec: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {rail["role"]: rail for rail in spec["data"]["rails"]}


def render_reaction_test(spec: dict[str, Any]) -> list[str]:
    rails = rails_by_role(spec)
    pressure = rails["pressure"]
    response = rails["response"]
    parts: list[str] = []
    parts.extend(
        [
            f'<g data-rail="{esc(pressure["id"])}">',
            text_block(30, 244, pressure["label"], 31, 1, TYPE["label_px"], 24, COLORS["ink"], 720),
            text_block(30, 276, pressure["detail"], 31, 1, TYPE["body_px"], 24, COLORS["muted"], 500),
            marker_shape(385, 256, pressure["shape"], COLORS["negative"], 8),
            line(405, 256, 674, 256, COLORS["negative"], width=7, dash=path_dash(pressure["path_kind"]), arrow=True),
        ]
    )
    if pressure.get("display_value"):
        parts.append(text_block(675, 291, pressure["display_value"], 16, 1, TYPE["compact_metric_px"], 34, COLORS["negative"], 760, "end"))
    parts.append("</g>")
    parts.extend(
        [
            f'<g data-rail="{esc(response["id"])}">',
            text_block(30, 333, response["label"], 31, 1, TYPE["label_px"], 24, COLORS["ink"], 720),
            text_block(30, 365, response["detail"], 31, 1, TYPE["body_px"], 24, COLORS["muted"], 500),
            line(385, 346, 650, 346, COLORS["positive"], width=4, dash=path_dash(response["path_kind"])),
            marker_shape(650, 346, response["shape"], COLORS["positive"], 8, outline=response["path_kind"] != "solid"),
        ]
    )
    if response.get("display_value"):
        parts.append(text_block(675, 386, response["display_value"], 16, 1, TYPE["compact_metric_px"], 34, COLORS["positive"], 760, "end"))
    parts.append("</g>")
    return parts


def render_parallel_contrast(spec: dict[str, Any]) -> list[str]:
    rails = rails_by_role(spec)
    first = rails["primary"]
    second = rails["comparison"]
    parts: list[str] = [line(360, 228, 360, 388, COLORS["hairline"], width=GEOMETRY["hairline_px"])]
    for rail, x, color, width_units in (
        (first, 30, COLORS["comparison"], 24),
        (second, 390, COLORS["positive"], 23),
    ):
        metric = rail.get("display_value") or rail["detail"]
        parts.extend(
            [
                f'<g data-rail="{esc(rail["id"])}">',
                line(x, 235, x, 382, color, width=4, dash=path_dash(rail["path_kind"])),
                text_block(x + 20, 257, rail["label"], width_units, 2, TYPE["label_px"], 26, COLORS["ink"], 700),
                text_block(x + 20, 313, metric, width_units, 2, TYPE["hero_metric_px"] if rail.get("display_value") else TYPE["compact_metric_px"], 48, color, 780),
            ]
        )
        if rail.get("display_value"):
            parts.append(text_block(x + 20, 365, rail["detail"], width_units, 2, TYPE["body_px"], 24, COLORS["muted"], 500))
        parts.append("</g>")
    return parts


def render_stages(spec: dict[str, Any]) -> list[str]:
    role_order = {"pre_event": 0, "event_day": 1, "next_step": 2}
    stages = sorted(spec["data"]["stages"], key=lambda item: role_order[item["role"]])
    xs = (70, 360, 580)
    parts: list[str] = [
        line(xs[0], 310, xs[1], 310, COLORS["comparison"], width=4, arrow=True),
        line(xs[1], 310, xs[2], 310, COLORS["positive"], width=4, dash=path_dash(stages[2]["path_kind"]), arrow=True),
        line(xs[1], 224, xs[1], 391, COLORS["negative"], width=3),
    ]
    colors = (COLORS["comparison"], COLORS["negative"], COLORS["positive"])
    anchors = ("start", "middle", "end")
    label_xs = (30, 360, 600)
    for index, (stage, x) in enumerate(zip(stages, xs)):
        parts.extend(
            [
                f'<g data-stage="{esc(stage["id"])}">',
                marker_shape(x, 310, stage["shape"], colors[index], 9, outline=stage["path_kind"] != "solid"),
                text_block(label_xs[index], 250, stage["label"], 16, 2, TYPE["label_px"], 25, COLORS["ink"], 720, anchors[index]),
                text_block(label_xs[index], 357, stage["detail"], 16, 2, TYPE["body_px"], 24, COLORS["muted"], 500, anchors[index]),
            ]
        )
        footer = stage.get("display_value")
        if not footer and stage.get("occurred_at"):
            footer = short_time(stage["occurred_at"])
        if footer:
            parts.append(text_block(label_xs[index], 392, footer, 18, 1, TYPE["label_px"], 24, colors[index], 700, anchors[index]))
        parts.append("</g>")
    return parts


def ordered_pair(nodes: list[dict[str, Any]], first_role: str, second_role: str) -> tuple[dict[str, Any], dict[str, Any]]:
    by_role = {node["role"]: node for node in nodes}
    return by_role[first_role], by_role[second_role]


def render_node_pair(spec: dict[str, Any], *, policy: bool = False) -> list[str]:
    if policy:
        first, second = ordered_pair(spec["data"]["nodes"], "policy_before", "policy_after")
    else:
        first, second = ordered_pair(spec["data"]["nodes"], "frame_from", "frame_to")
    edge = spec["data"]["edges"][0]
    if policy:
        event = spec["data"]["events"][0]
        return [
            f'<g data-node="{esc(first["id"])}">',
            curve("M 60 310 C 80 235, 300 235, 320 310", COLORS["comparison"], width=4, arrow=True),
            curve("M 320 322 C 295 390, 85 390, 60 322", COLORS["comparison"], width=4, arrow=True),
            text_block(190, 294, first["label"], 22, 2, TYPE["label_px"], 26, COLORS["ink"], 700, "middle"),
            "</g>",
            rect(354, 226, 9, 164, COLORS["highlight"], radius=1, extra=f'data-event="{esc(event["id"])}"'),
            text_block(382, 247, event["label"], 24, 2, TYPE["label_px"], 25, COLORS["highlight_ink"], 720),
            curve(
                "M 330 310 L 455 310",
                COLORS["positive"],
                width=4,
                dash=path_dash(edge["path_kind"]),
                arrow=True,
                extra=f'data-edge="{esc(edge["id"])}"',
            ),
            f'<g data-node="{esc(second["id"])}">',
            marker_shape(475, 310, second["shape"], COLORS["positive"], 10, outline=second["path_kind"] != "solid"),
            text_block(500, 319, second["label"], 14, 2, 28, 31, COLORS["positive"], 760),
            "</g>",
            text_block(500, 390, edge.get("label") or "", 20, 1, TYPE["label_px"], 24, COLORS["muted"], 600, "middle"),
        ]

    parts = [
        f'<g data-node="{esc(first["id"])}">',
        marker_shape(52, 306, first["shape"], COLORS["comparison"], 10, outline=True),
        text_block(78, 278, first["label"], 18, 3, TYPE["compact_metric_px"], 34, COLORS["comparison"], 760),
        "</g>",
        line(280, 310, 448, 310, COLORS["positive"], width=4, dash=path_dash(edge["path_kind"]), arrow=True, extra=f'data-edge="{esc(edge["id"])}"'),
        f'<g data-node="{esc(second["id"])}">',
        marker_shape(472, 306, second["shape"], COLORS["positive"], 10, outline=second["path_kind"] != "solid"),
        text_block(500, 270, second["label"], 14, 3, TYPE["headline_px"], 35, COLORS["positive"], 780),
        "</g>",
    ]
    if edge.get("label"):
        parts.append(text_block(364, 242, edge["label"], 20, 1, TYPE["label_px"], 24, COLORS["highlight_ink"], 700, "middle"))
    return parts


def render_feedback_loop(spec: dict[str, Any]) -> list[str]:
    return render_feedback(spec, include_values=False)


def render_feedback_mixed(spec: dict[str, Any]) -> list[str]:
    return render_feedback(spec, include_values=True)


def render_feedback(spec: dict[str, Any], *, include_values: bool) -> list[str]:
    nodes = spec["data"]["nodes"]
    parts: list[str] = []
    if include_values:
        by_role = {value["role"]: value for value in spec["data"]["values"]}
        primary = by_role["shock_primary"]
        secondary = by_role["shock_secondary"]
        parts.extend(
            [
                f'<g data-value="{esc(primary["id"])}">',
                text_block(30, 246, primary["label"], 17, 1, TYPE["label_px"], 24, COLORS["ink"], 650),
                text_block(30, 291, primary["display_value"], 15, 1, TYPE["metric_px"], 42, COLORS["negative"], 780),
                "</g>",
                line(30, 307, 235, 307, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
                f'<g data-value="{esc(secondary["id"])}">',
                text_block(30, 339, secondary["label"], 17, 1, TYPE["label_px"], 24, COLORS["ink"], 650),
                text_block(30, 384, secondary["display_value"], 15, 1, TYPE["metric_px"], 42, COLORS["comparison"], 780),
                "</g>",
                line(260, 225, 260, 390, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
            ]
        )
        centers = ((500, 245), (640, 305), (500, 375), (360, 305)) if len(nodes) == 4 else ((500, 235), (575, 340), (365, 365))
    else:
        centers = ((360, 235), (620, 305), (360, 380), (100, 305)) if len(nodes) == 4 else ((360, 235), (610, 365), (110, 365))
    positions = {node["id"]: center for node, center in zip(nodes, centers)}
    for edge in spec["data"]["edges"]:
        if edge["from"] not in positions or edge["to"] not in positions:
            continue
        x1, y1 = positions[edge["from"]]
        x2, y2 = positions[edge["to"]]
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        center_x = 500 if include_values else 360
        control_x = mid_x + (mid_x - center_x) * 0.24
        control_y = mid_y + (mid_y - 310) * 0.24
        stroke = COLORS["negative"] if edge["relation"] == "dampens" else COLORS["ink"]
        parts.append(
            curve(
                f"M {x1:.1f} {y1:.1f} Q {control_x:.1f} {control_y:.1f} {x2:.1f} {y2:.1f}",
                stroke,
                width=3,
                dash=path_dash(edge["path_kind"]),
                arrow=True,
                extra=f'data-edge="{esc(edge["id"])}" data-role="causal-loop"',
            )
        )
    loop_colors = (COLORS["negative"], COLORS["comparison"], COLORS["positive"], COLORS["highlight_ink"])
    label_offsets = ((0, -22, "middle"), (40, 45, "end"), (0, 30, "middle"), (-60, -42, "start"))
    if len(nodes) == 3:
        label_offsets = ((0, -22, "middle"), (20, 20, "end"), (-35, 25, "start"))
    for index, (node, (cx, cy)) in enumerate(zip(nodes, centers)):
        dx, dy, anchor = label_offsets[index]
        parts.extend(
            [
                f'<g data-node="{esc(node["id"])}">',
                marker_shape(cx, cy, node["shape"], loop_colors[index], 8, outline=node["path_kind"] != "solid"),
                text_block(cx + dx, cy + dy, node["label"], 14, 2, TYPE["label_px"], 24, COLORS["ink"], 650, anchor),
                "</g>",
            ]
        )
    return parts


def render_level_track(spec: dict[str, Any]) -> list[str]:
    value = spec["data"]["values"][0]
    level = spec["data"]["levels"][0]
    current = float(value["numeric_value"])
    threshold = float(level["numeric_value"])
    low, high = min(current, threshold), max(current, threshold)
    span = high - low
    pad = span * 0.25 if span else max(abs(high) * 0.1, 1.0)
    low -= pad
    high += pad

    def x_for(number: float) -> float:
        return 70 + (number - low) / (high - low) * 580

    current_x, threshold_x = x_for(current), x_for(threshold)
    endpoint_color = COLORS["negative"] if level["relation"] == "below" else COLORS["positive"]
    parts = [
        text_block(30, 247, level["relation_label"], 32, 1, TYPE["headline_px"], 34, COLORS["ink"], 760),
        rect(threshold_x - 6, 270, 12, 106, COLORS["highlight_soft"], radius=0, extra=f'data-level="{esc(level["id"])}"'),
        line(70, 335, 650, 335, COLORS["hairline"], width=3),
        line(threshold_x, 270, threshold_x, 376, COLORS["highlight_ink"], width=2),
        marker_shape(current_x, 335, value["shape"], endpoint_color, 10),
        text_block(current_x, 305, f'{value["label"]} {value["display_value"]}', 25, 1, TYPE["compact_metric_px"], 34, endpoint_color, 760, "middle"),
        text_block(min(threshold_x, 580), 400, f'{level["label"]} {level["display_value"]}', 25, 1, TYPE["label_px"], 24, COLORS["highlight_ink"], 720, "end" if threshold_x > 500 else "middle"),
    ]
    return parts


def render_expectation_gap(spec: dict[str, Any]) -> list[str]:
    if not spec["data"]["values"]:
        rails = rails_by_role(spec)
        expected = rails["expected"]
        actual = rails["actual"]
        return [
            f'<g data-rail="{esc(expected["id"])}">',
            text_block(30, 254, expected["label"], 24, 2, TYPE["label_px"], 25, COLORS["muted"], 600),
            text_block(30, 328, expected["detail"], 25, 3, TYPE["compact_metric_px"], 34, COLORS["comparison"], 760),
            "</g>",
            line(330, 232, 330, 382, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
            line(350, 310, 412, 310, COLORS["muted"], width=3, arrow=True),
            line(390, 232, 390, 382, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
            f'<g data-rail="{esc(actual["id"])}">',
            text_block(690, 254, actual["label"], 24, 2, TYPE["label_px"], 25, COLORS["muted"], 600, "end"),
            text_block(690, 328, actual["detail"], 25, 3, TYPE["compact_metric_px"], 34, COLORS["positive"], 760, "end"),
            "</g>",
        ]
    by_role = {value["role"]: value for value in spec["data"]["values"]}
    expected, actual, gap = by_role["expected"], by_role["actual"], by_role["gap"]
    gap_color = COLORS["negative"] if float(gap["numeric_value"]) < 0 else COLORS["positive"]
    return [
        f'<g data-value="{esc(expected["id"])}">',
        text_block(30, 254, expected["label"], 22, 2, TYPE["label_px"], 25, COLORS["muted"], 600),
        text_block(30, 334, expected["display_value"], 16, 1, TYPE["hero_metric_px"], 52, COLORS["comparison"], 790),
        "</g>",
        line(327, 232, 327, 382, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
        f'<g data-value="{esc(gap["id"])}">',
        text_block(360, 268, gap["label"], 13, 2, TYPE["label_px"], 25, COLORS["muted"], 650, "middle"),
        text_block(360, 335, gap["display_value"], 14, 1, TYPE["metric_px"], 42, gap_color, 780, "middle"),
        "</g>",
        line(393, 232, 393, 382, COLORS["hairline"], width=GEOMETRY["hairline_px"]),
        f'<g data-value="{esc(actual["id"])}">',
        text_block(690, 254, actual["label"], 22, 2, TYPE["label_px"], 25, COLORS["muted"], 600, "end"),
        text_block(690, 334, actual["display_value"], 16, 1, TYPE["hero_metric_px"], 52, COLORS["positive"], 790, "end"),
        "</g>",
    ]


def render_relative_value(spec: dict[str, Any]) -> list[str]:
    if spec["payload_mode"] == "key_numbers":
        return render_level_track(spec)
    rails = rails_by_role(spec)
    spread = rails["spread"]
    trigger = rails["trigger"]
    return [
        f'<g data-rail="{esc(spread["id"])}">',
        text_block(30, 258, spread["label"], 27, 2, TYPE["compact_metric_px"], 34, COLORS["comparison"], 760),
        text_block(30, 310, spread["detail"], 28, 2, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
        f'<g data-rail="{esc(trigger["id"])}">',
        text_block(430, 258, trigger["label"], 22, 2, TYPE["label_px"], 27, COLORS["ink"], 720),
        text_block(430, 310, trigger["detail"], 22, 2, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
        line(30, 354, 365, 354, COLORS["comparison"], width=5),
        marker_shape(365, 354, spread["shape"], COLORS["comparison"], 9),
        line(380, 354, 680, 354, COLORS["positive"], width=4, dash=path_dash(trigger["path_kind"]), arrow=True),
        marker_shape(680, 354, trigger["shape"], COLORS["positive"], 9, outline=True),
    ]


def render_sentiment_witness(spec: dict[str, Any]) -> list[str]:
    rails = rails_by_role(spec)
    baseline = rails["baseline"]
    witness = rails["witness"]
    parts = [
        text_block(27, 309, "“", 2, 1, 72, 72, COLORS["hairline"], 760),
        f'<g data-rail="{esc(baseline["id"])}">',
        text_block(88, 258, baseline["label"], 21, 2, TYPE["compact_metric_px"], 34, COLORS["ink"], 740),
        text_block(88, 305, baseline["detail"], 21, 2, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
        line(342, 238, 342, 384, COLORS["hairline"], width=2, dash=GEOMETRY["dash"]),
        line(365, 310, 425, 310, COLORS["muted"], width=3, dash=path_dash(witness["path_kind"]), arrow=True),
        f'<g data-rail="{esc(witness["id"])}">',
        marker_shape(452, 304, witness["shape"], COLORS["positive"], 10, outline=witness["path_kind"] != "solid"),
        text_block(480, 258, witness["label"], 17, 2, TYPE["compact_metric_px"], 34, COLORS["positive"], 760),
        text_block(480, 316, witness["detail"], 17, 3, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
    ]
    if baseline.get("display_value"):
        parts.insert(4, text_block(88, 373, baseline["display_value"], 15, 1, TYPE["metric_px"], 42, COLORS["comparison"], 780))
    if witness.get("display_value"):
        parts.insert(-1, text_block(480, 383, witness["display_value"], 15, 1, TYPE["metric_px"], 42, COLORS["positive"], 780))
    return parts


def render_factor_rotation(spec: dict[str, Any]) -> list[str]:
    rails = rails_by_role(spec)
    first = rails["from"]
    second = rails["to"]
    formula = second.get("formula") or first.get("formula") or ""
    parts = [
        f'<g data-rail="{esc(first["id"])}">',
        marker_shape(42, 274, first["shape"], COLORS["comparison"], 9, outline=True),
        text_block(64, 259, first["label"], 20, 2, TYPE["label_px"], 27, COLORS["ink"], 720),
        text_block(64, 323, first["detail"], 20, 2, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
        line(292, 290, 442, 290, COLORS["positive"], width=5, dash=path_dash(second["path_kind"]), arrow=True),
        f'<g data-rail="{esc(second["id"])}">',
        marker_shape(468, 274, second["shape"], COLORS["positive"], 9, outline=second["path_kind"] != "solid"),
        text_block(490, 259, second["label"], 16, 2, TYPE["label_px"], 27, COLORS["positive"], 740),
        text_block(490, 323, second["detail"], 16, 2, TYPE["body_px"], 24, COLORS["muted"], 500),
        "</g>",
    ]
    if "/" in formula:
        numerator, denominator = (part.strip() for part in formula.split("/", 1))
        parts.extend(
            [
                text_block(360, 350, numerator, 34, 1, TYPE["label_px"], 24, COLORS["highlight_ink"], 700, "middle"),
                line(225, 360, 495, 360, COLORS["highlight_ink"], width=2),
                text_block(360, 390, denominator, 34, 1, TYPE["label_px"], 24, COLORS["highlight_ink"], 700, "middle"),
            ]
        )
    else:
        parts.append(text_block(360, 382, formula, 48, 2, TYPE["label_px"], 25, COLORS["highlight_ink"], 700, "middle"))
    return parts


def scale_points(
    series: list[dict[str, Any]],
    plot: tuple[float, float, float, float],
    extra_y_values: Iterable[float] = (),
) -> tuple[list[list[tuple[float, float]]], float, float]:
    left, top, right, bottom = plot
    all_points = [point for item in series for point in item["points"]]
    x_values = [parse_time(point["x"]).timestamp() for point in all_points]
    y_values = [float(point["y"]) for point in all_points] + [float(value) for value in extra_y_values]
    x_min, x_max = min(x_values), max(x_values)
    y_min, y_max = min(y_values), max(y_values)
    y_pad = (y_max - y_min) * 0.1 if y_max != y_min else max(abs(y_max) * 0.05, 1)
    y_min -= y_pad
    y_max += y_pad
    scaled: list[list[tuple[float, float]]] = []
    for item in series:
        item_points: list[tuple[float, float]] = []
        for point in item["points"]:
            x_value = parse_time(point["x"]).timestamp()
            x = left + (x_value - x_min) / (x_max - x_min) * (right - left)
            y = bottom - (float(point["y"]) - y_min) / (y_max - y_min) * (bottom - top)
            item_points.append((x, y))
        scaled.append(item_points)
    return scaled, y_min, y_max


def polyline(points: Iterable[tuple[float, float]], color: str, *, width: int, dash: str | None, extra: str) -> str:
    coordinates = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="miter" stroke-linecap="square"{dash_attr} {extra}/>'


def render_series(spec: dict[str, Any]) -> list[str]:
    series = spec["data"]["series"]
    two = len(series) == 2
    plot = (40, 235, 530 if two else 580, 350)
    level = spec["data"]["levels"][0] if spec["grammar"] == "binary_level" else None
    extra_y = [float(level["numeric_value"])] if level else []
    scaled, y_min, y_max = scale_points(series, plot, extra_y)
    colors = (COLORS["positive"], COLORS["comparison"])
    shapes = ("circle", "square")
    parts: list[str] = [line(plot[0], plot[3], plot[2], plot[3], COLORS["hairline"], width=GEOMETRY["hairline_px"])]
    if spec["grammar"] == "event_unwind":
        baseline_y = scaled[0][0][1]
        parts.append(line(plot[0], baseline_y, plot[2], baseline_y, COLORS["hairline"], width=2, dash=GEOMETRY["dot"]))
    if level:
        level_y = plot[3] - (float(level["numeric_value"]) - y_min) / (y_max - y_min) * (plot[3] - plot[1])
        parts.append(rect(plot[0], level_y - 5, plot[2] - plot[0], 10, COLORS["highlight_soft"], radius=0, extra=f'data-level="{esc(level["id"])}"'))
        parts.append(line(plot[0], level_y, plot[2], level_y, COLORS["highlight_ink"], width=2))
        level_label_y = min(374, max(245, level_y - 11))
        parts.append(text_block(plot[0] + 8, level_label_y, f'{level["label"]} {level["display_value"]}', 30, 1, TYPE["label_px"], 24, COLORS["highlight_ink"], 720))
    if spec["data"]["events"]:
        event = spec["data"]["events"][0]
        first_time = parse_time(series[0]["points"][0]["x"]).timestamp()
        last_time = parse_time(series[0]["points"][-1]["x"]).timestamp()
        event_time = parse_time(event["occurred_at"]).timestamp()
        event_x = plot[0] + (event_time - first_time) / (last_time - first_time) * (plot[2] - plot[0])
        parts.append(line(event_x, 225, event_x, 365, COLORS["negative"], width=2, extra=f'data-event="{esc(event["id"])}"'))
        parts.append(text_block(40, 230, event["label"], 30, 1, TYPE["label_px"], 24, COLORS["negative"], 700))
    for index, (item, points) in enumerate(zip(series, scaled)):
        dash = GEOMETRY["dash"] if index == 1 else None
        series_color = colors[index]
        if level and index == 0:
            series_color = COLORS["negative"] if level["relation"] == "below" else COLORS["positive"]
        parts.append(polyline(points, series_color, width=4 if index == 0 else 3, dash=dash, extra=f'data-series="{esc(item["id"])}" data-interpolation="none"'))
        parts.append(marker_shape(points[-1][0], points[-1][1], shapes[index], series_color, 7, outline=index == 1))
        endpoint = item["points"][-1]
        label = f'{item["label"]} {fmt_number(float(endpoint["y"]), item["unit"])}'
        if two:
            label_y = 265 if index == 0 else 337
            parts.append(line(points[-1][0] + 4, points[-1][1], 532, label_y - 6, series_color, width=2, dash=dash))
            parts.append(text_block(540, label_y, label, 17, 2, TYPE["label_px"], 24, series_color, 720))
        else:
            if level:
                parts.append(text_block(plot[2], 230, label, 28, 1, TYPE["label_px"], 24, series_color, 720, "end"))
            else:
                label_y = min(372, max(245, points[-1][1] - 18))
                parts.append(text_block(points[-1][0] - 12, label_y, label, 28, 1, TYPE["label_px"], 24, series_color, 720, "end"))
    first_x = series[0]["points"][0]["x"]
    last_x = series[0]["points"][-1]["x"]
    parts.append(text_block(plot[0], 396, short_time(first_x), 20, 1, TYPE["label_px"], 24, COLORS["muted"], 500))
    parts.append(text_block(plot[2], 396, short_time(last_x), 20, 1, TYPE["label_px"], 24, COLORS["muted"], 500, "end"))
    return parts


def render_policy_rails(spec: dict[str, Any]) -> list[str]:
    rails = rails_by_role(spec)
    first = rails["policy_before"]
    second = rails["policy_after"]
    event = spec["data"]["events"][0]
    return [
        f'<g data-rail="{esc(first["id"])}">',
        curve("M 60 310 C 80 235, 300 235, 320 310", COLORS["comparison"], width=4, arrow=True),
        curve("M 320 322 C 295 390, 85 390, 60 322", COLORS["comparison"], width=4, arrow=True),
        text_block(190, 292, first["label"], 23, 2, TYPE["label_px"], 26, COLORS["ink"], 700, "middle"),
        text_block(190, 350, first["display_value"] or first["detail"], 21, 2, TYPE["compact_metric_px"], 34, COLORS["comparison"], 760, "middle"),
        "</g>",
        rect(354, 226, 9, 164, COLORS["highlight"], radius=1, extra=f'data-event="{esc(event["id"])}"'),
        text_block(382, 247, event["label"], 24, 2, TYPE["label_px"], 25, COLORS["highlight_ink"], 720),
        line(330, 310, 500, 310, COLORS["positive"], width=4, dash=path_dash(second["path_kind"]), arrow=True),
        f'<g data-rail="{esc(second["id"])}">',
        marker_shape(520, 310, second["shape"], COLORS["positive"], 10, outline=second["path_kind"] != "solid"),
        text_block(590, 286, second["label"], 14, 2, TYPE["label_px"], 27, COLORS["ink"], 720, "end"),
        text_block(590, 357, second["display_value"] or second["detail"], 14, 2, TYPE["compact_metric_px"], 34, COLORS["positive"], 760, "end"),
        "</g>",
    ]


def render_svg(spec: dict[str, Any]) -> str:
    parts = common_open(spec)
    grammar = spec["grammar"]
    mode = spec["payload_mode"]
    if mode == "series":
        parts.extend(render_series(spec))
    elif grammar == "reaction_test":
        parts.extend(render_reaction_test(spec))
    elif grammar == "parallel_contrast":
        parts.extend(render_parallel_contrast(spec))
    elif grammar == "category_reframe":
        parts.extend(render_node_pair(spec))
    elif grammar == "relative_value_trigger":
        parts.extend(render_relative_value(spec))
    elif grammar == "policy_pivot":
        parts.extend(render_node_pair(spec, policy=True) if spec["data"]["nodes"] else render_policy_rails(spec))
    elif grammar == "sentiment_witness":
        parts.extend(render_sentiment_witness(spec))
    elif grammar == "event_unwind":
        parts.extend(render_stages(spec))
    elif grammar == "feedback_loop":
        parts.extend(render_feedback_mixed(spec) if mode == "mixed" else render_feedback_loop(spec))
    elif grammar == "binary_level":
        parts.extend(render_level_track(spec))
    elif grammar == "expectation_gap":
        parts.extend(render_expectation_gap(spec))
    elif grammar == "factor_rotation":
        parts.extend(render_factor_rotation(spec))
    else:
        raise RuntimeError(f"No renderer for grammar={grammar!r}, payload_mode={mode!r}.")
    parts.append(canonical_wordmark())
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def atomic_write(path: Path, data: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def manifest_for(spec: dict[str, Any], svg_hash: str) -> dict[str, Any]:
    data = spec["data"]
    suffix = spec["spec_id"].removeprefix("VVSPEC_")
    return {
        "schema_version": "viewpoint-visual-v1",
        "visual_id": f"VVIS_{suffix}_r{spec['revision']}_{spec['grammar']}_{spec['payload_mode']}",
        "render_profile": "legacy_720",
        "spec_ref": spec["spec_id"],
        "grammar": spec["grammar"],
        "payload_mode": spec["payload_mode"],
        "visual_job": spec["visual_job"],
        "state": spec["state"],
        "generated_at": spec["render"]["generated_at"],
        "dimensions": {"width": WIDTH, "height": HEIGHT},
        "theme": spec["render"]["theme"],
        "lineage": {
            "input_artifact_refs": spec["lineage"]["input_artifact_refs"],
            "source_refs": spec["lineage"]["source_refs"],
            "series_refs": [item["id"] for item in data["series"]],
            "value_refs": [item["id"] for item in data["values"]],
            "level_refs": [item["id"] for item in data["levels"]],
            "event_refs": [item["id"] for item in data["events"]],
            "node_refs": [item["id"] for item in data["nodes"]],
            "edge_refs": [item["id"] for item in data["edges"]],
            "rail_refs": [item["id"] for item in data["rails"]],
            "stage_refs": [item["id"] for item in data["stages"]],
            "decision_cutoff_at": spec["lineage"]["decision_cutoff_at"],
        },
        "content": {
            "headline": spec["frame"]["headline"],
            "observation": spec["frame"]["observation"],
            "observed_at": spec["frame"]["observed_at"],
            "strategy_tags": spec["frame"]["strategy_tags"],
            "alt_text": spec["frame"]["alt_text"],
            "watermark": "Cuebook",
        },
        "asset": {
            "html": None,
            "svg": {"ref": "viewpoint-visual.svg", "sha256": svg_hash},
            "png_derivatives": [],
            "derivative_bundle_hash": None,
        },
        "quality_report": spec["quality_report"],
    }


def render(spec: dict[str, Any], output_dir: Path, *, rasterize: bool = True) -> dict[str, Any]:
    validation = validate_spec(spec)
    if not validation["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in validation["errors"])
        raise RuntimeError(f"Invalid ViewpointVisualSpecV1: {details}")
    if spec["quality_report"]["decision"] == "blocked":
        raise RuntimeError("Blocked viewpoint visual specs cannot be rendered.")
    output_dir.mkdir(parents=True, exist_ok=True)
    svg_bytes = render_svg(spec).encode("utf-8")
    svg_path = output_dir / "viewpoint-visual.svg"
    atomic_write(svg_path, svg_bytes)
    svg_hash = "sha256:" + hashlib.sha256(svg_bytes).hexdigest()
    manifest = manifest_for(spec, svg_hash)
    initial_validation = validate_manifest(manifest, output_dir)
    if not initial_validation["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in initial_validation["errors"])
        raise RuntimeError(f"Rendered ViewpointVisualV1 failed validation: {details}")
    manifest_path = output_dir / "viewpoint-visual-v1.json"
    atomic_write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))

    node = shutil.which("node")
    if rasterize and node:
        command = [node, str(ROOT / "scripts" / "rasterize_viewpoint_visual.cjs"), str(svg_path), str(manifest_path)]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            raise RuntimeError(f"PNG rasterization failed: {completed.stderr.strip() or completed.stdout.strip()}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        final_validation = validate_manifest(manifest, output_dir)
        if not final_validation["valid"]:
            details = "; ".join(f"{item['code']}: {item['message']}" for item in final_validation["errors"])
            raise RuntimeError(f"Rasterized ViewpointVisualV1 failed validation: {details}")
    return {"manifest": manifest, "manifest_path": manifest_path, "svg_path": svg_path}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--svg-only", action="store_true", help="Skip Node PNG derivatives intentionally.")
    args = parser.parse_args()
    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
        result = render(spec, args.output_dir, rasterize=not args.svg_only)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(
        json.dumps(
            {
                "ok": True,
                "grammar": result["manifest"]["grammar"],
                "payload_mode": result["manifest"]["payload_mode"],
                "manifest": str(result["manifest_path"]),
                "svg": str(result["svg_path"]),
                "png_derivatives": len(result["manifest"]["asset"]["png_derivatives"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
