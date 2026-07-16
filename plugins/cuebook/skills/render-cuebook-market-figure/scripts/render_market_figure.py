#!/usr/bin/env python3
"""Render a validated MarketFigureSpecV1 into Cuebook SVG and MarketFigureV1."""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


HERE = Path(__file__).resolve().parent
WORDMARK_ASSET = HERE.parent.parent / "direct-cuebook-viewpoint-visual" / "assets" / "cuebook-wordmark.svg"
WORDMARK_PATHS = "\n".join(re.findall(r"<path\b[^>]+/>", WORDMARK_ASSET.read_text(encoding="utf-8")))
VALIDATOR_SPEC = importlib.util.spec_from_file_location("market_figure_validator", HERE / "validate_market_figure.py")
if VALIDATOR_SPEC is None or VALIDATOR_SPEC.loader is None:
    raise RuntimeError("Unable to load market figure validator.")
VALIDATOR = importlib.util.module_from_spec(VALIDATOR_SPEC)
VALIDATOR_SPEC.loader.exec_module(VALIDATOR)

WIDTH = 1200
HEIGHT = 760
COMPACT_WIDTH = 720
COMPACT_HEIGHT = 420
GRAMMAR_LABELS = {
    "event_reaction": "新闻反应",
    "relative_strength": "相对强弱",
    "expectation_revision": "预期修正",
    "fundamental_driver": "基本面驱动",
    "positioning_pressure": "资金压力",
    "sensitivity_curve": "敏感性曲线",
    "instrument_map": "工具地图",
}
PALETTES = {
    "cuebook_light": {
        "bg": "#FFFFFF",
        "surface": "#F7F9F8",
        "surface_alt": "#FFF9E8",
        "ink": "#151817",
        "muted": "#66706B",
        "line": "#E2E7E4",
        "grid": "#E8ECEA",
        "primary": "#0A7F60",
        "benchmark": "#4B68CC",
        "driver": "#315D57",
        "context": "#69726D",
        "accent_focus": "#946200",
        "accent_positive": "#08765A",
        "accent_comparison": "#315FB6",
        "accent_support": "#166B75",
        "accent_violet": "#6C55A3",
        "yellow": "#F3C51D",
        "yellow_ink": "#8A6A00",
        "red": "#C43D4E",
        "red_soft": "#FFF0F1",
        "green_soft": "#EAF9F4",
        "blue_soft": "#EEF2FF",
        "white": "#FFFFFF",
    },
    "cuebook_dark": {
        "bg": "#151817",
        "surface": "#1E2220",
        "surface_alt": "#29271D",
        "ink": "#F6F7F4",
        "muted": "#A3AAA6",
        "line": "#353B37",
        "grid": "#303632",
        "primary": "#2BC59A",
        "benchmark": "#7694F0",
        "driver": "#8CCFC0",
        "context": "#A4ACA7",
        "accent_focus": "#F0B33A",
        "accent_positive": "#47D39D",
        "accent_comparison": "#7EA4FF",
        "accent_support": "#60C5D2",
        "accent_violet": "#B9A2F4",
        "yellow": "#F3C51D",
        "yellow_ink": "#F5D65D",
        "red": "#F0717A",
        "red_soft": "#342326",
        "green_soft": "#18322A",
        "blue_soft": "#222A43",
        "white": "#FFFFFF",
    },
}
SERIES_COLORS = {"primary": "primary", "benchmark": "benchmark", "driver": "driver", "context": "context"}
COLOR_ROLE_KEYS = {
    "focus": "accent_focus",
    "positive": "accent_positive",
    "comparison": "accent_comparison",
    "support": "accent_support",
    "violet": "accent_violet",
    "context": "context",
    "risk": "red",
}
STROKE_DASHES = {"solid": "", "dashed": "8 6", "dotted": "2 6"}
LEVEL_MARKER_KINDS = {"baseline", "latest", "trigger", "target", "invalidation", "estimate"}
CURRENCY_SYMBOLS = {"KRW": "₩", "JPY": "¥", "CNY": "¥", "EUR": "€", "GBP": "£"}
ARGUMENT_KIND_LABELS = {
    "event": "导火索",
    "evidence": "我看到的",
    "mechanism": "为什么先动",
    "actor_action": "钱先去哪",
    "market_effect": "我押什么",
    "metric": "关键数据",
    "condition": "要盯什么",
    "countercase": "我可能错在",
    "invalidation": "逻辑边界",
    "settlement": "到期看",
}


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def display_width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(char) in {"W", "F", "A"} else 1 for char in text)


PROTECTED_WRAP_TOKEN = re.compile(
    r"(?:窗口看|未来|至少|接下来|先看|看)?\s*[+-]?\d[\d,.]*"
    r"(?:\s*(?:-|–|—|~|至)\s*[+-]?\d[\d,.]*)?"
    r"\s*(?:分钟|小时|天|周|个月|月|年|days?|weeks?|months?|years?|%|pp|bps?)"
    r"|\$?[A-Z][A-Z0-9./-]{1,11}"
)


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
    if len("".join(lines).replace(" ", "")) < len(text.replace(" ", "")) and lines:
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
    font = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif"
    spans = "".join(
        f'<tspan x="{x:.1f}" dy="{0 if index == 0 else line_height}">{esc(line)}</tspan>'
        for index, line in enumerate(lines)
    )
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-family="{font}" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="0" '
        f'font-variant-numeric="tabular-nums">{spans}</text>'
    )


def rect(x: float, y: float, width: float, height: float, fill: str, stroke: str = "none", radius: int = 7, stroke_width: int = 1) -> str:
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
    )


def canonical_wordmark(x: float, y: float, color: str, scale: float = 1.0) -> str:
    paths = re.sub(r'fill="#[0-9A-Fa-f]{6}"', f'fill="{color}"', WORDMARK_PATHS)
    return (
        f'<g data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" '
        f'transform="translate({x:.1f} {y:.1f}) scale({scale:.3f})">{paths}</g>'
    )


def pill(x: float, y: float, label: str, fill: str, ink: str, width: float | None = None) -> str:
    width = width or max(62, display_width(label) * 7 + 22)
    return rect(x, y, width, 28, fill, radius=7) + text_block(x + width / 2, y + 19, label, 22, 1, 13, 15, ink, 700, "middle")


def render_argument_path(
    spec: dict[str, Any],
    colors: dict[str, str],
    x: float,
    y: float,
    width: float,
    height: float,
    compact: bool,
) -> list[str]:
    argument = spec.get("argument_path")
    if not argument:
        return []
    nodes = argument["nodes"]
    edges = argument["edges"]
    gap = 26.0 if compact else 24.0
    node_width = (width - gap * (len(nodes) - 1)) / len(nodes)
    center_y = y + height / 2
    parts: list[str] = []

    for index, edge in enumerate(edges):
        start_x = x + node_width * (index + 1) + gap * index
        end_x = start_x + gap
        dash = ' stroke-dasharray="4 4"' if edge["relation"] in {"challenges", "conditions"} else ""
        target = nodes[index + 1]
        if target["kind"] in {"countercase", "invalidation"}:
            edge_color = colors["red"]
        elif target["kind"] in {"actor_action", "market_effect"}:
            edge_color = colors["primary"]
        else:
            edge_color = colors["driver"]
        line_width = 3.2 if compact else 2.0
        arrow_depth = 8 if compact else 6
        arrow_half_height = 5 if compact else 4
        parts.extend(
            [
                f'<line data-argument-edge="{esc(edge["certainty"])}" x1="{start_x:.1f}" y1="{center_y:.1f}" x2="{end_x-arrow_depth:.1f}" y2="{center_y:.1f}" stroke="{edge_color}" stroke-width="{line_width}" stroke-linecap="round"{dash}/>',
                f'<path d="M {end_x-arrow_depth:.1f} {center_y-arrow_half_height:.1f} L {end_x:.1f} {center_y:.1f} L {end_x-arrow_depth:.1f} {center_y+arrow_half_height:.1f} Z" fill="{edge_color}"/>',
            ]
        )
        if not compact and edge.get("label"):
            parts.append(text_block((start_x + end_x) / 2, center_y - 8, edge["label"], 14, 1, 9, 11, colors["muted"], 600, "middle"))

    for index, node in enumerate(nodes):
        node_x = x + index * (node_width + gap)
        status = node["status"]
        kind = node["kind"]
        if kind == "event":
            fill, stroke = colors["surface_alt"], colors["yellow_ink"]
        elif kind in {"mechanism", "evidence", "metric"}:
            fill, stroke = colors["blue_soft"], colors["driver"]
        elif kind in {"countercase", "invalidation"}:
            fill, stroke = colors["red_soft"], colors["red"]
        else:
            fill, stroke = colors["green_soft"], colors["primary"]
        parts.append(
            f'<rect data-argument-node="{esc(node["id"])}" data-node-status="{esc(status)}" x="{node_x:.1f}" y="{y:.1f}" width="{node_width:.1f}" height="{height:.1f}" rx="6" fill="{fill}" stroke="{stroke}" stroke-width="1"/>'
        )
        parts.append(rect(node_x, y, 4, height, stroke, radius=2))
        caption = ARGUMENT_KIND_LABELS[kind]
        caption_size = 12 if compact else 9
        caption_units = max(12, int((node_width - 18) / (6.2 if compact else 6)))
        parts.append(text_block(node_x + 9, y + (18 if compact else 13), caption, caption_units, 1, caption_size, 14 if compact else 11, stroke, 700))
        label_y = y + (47 if compact else 31)
        max_units = max(14, int((node_width - 18) / (7.6 if compact else 6.2)))
        parts.append(text_block(node_x + 9, label_y, node["label"], max_units, 2 if compact else 1, 16 if compact else 12, 18 if compact else 13, colors["ink"], 700))
    return parts


def dedupe(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if isinstance(value, str) and value.strip()))


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def x_numeric(value: Any, kind: str, categories: list[str]) -> float:
    if kind == "time":
        return parse_time(str(value)).timestamp()
    if kind == "numeric":
        return float(value)
    return float(categories.index(str(value)))


def fmt_x(value: float, kind: str, categories: list[str]) -> str:
    if kind == "time":
        dt = datetime.fromtimestamp(value, tz=timezone.utc)
        return f"{dt.month}月{dt.day}日"
    if kind == "category":
        index = max(0, min(len(categories) - 1, int(round(value))))
        return categories[index]
    if abs(value) >= 1000:
        return f"{value:,.0f}"
    if abs(value) >= 10:
        return f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{value:.2f}".rstrip("0").rstrip(".")


def fmt_axis_x(value: float, kind: str, categories: list[str], unit: str) -> str:
    if kind == "numeric" and unit in {"%", "pct"}:
        return f"{value:.0f}%"
    if kind == "numeric" and unit == "x":
        return f"{value:.1f}×"
    return fmt_x(value, kind, categories)


def fmt_y(value: float, unit: str) -> str:
    if unit == "%":
        return f"{value:+.1f}%" if abs(value) >= 0.05 else "0.0%"
    if unit == "pct":
        return f"{value:.1f}%"
    if unit in {"USD", "$"}:
        if abs(value) >= 1_000_000_000:
            return f"${value / 1_000_000_000:.1f}B"
        if abs(value) >= 1_000_000:
            return f"${value / 1_000_000:.1f}M"
        if abs(value) >= 1_000:
            return f"${value:,.0f}"
        return f"${value:,.2f}".rstrip("0").rstrip(".")
    if unit in CURRENCY_SYMBOLS:
        symbol = CURRENCY_SYMBOLS[unit]
        if abs(value) >= 1_000_000_000:
            return f"{symbol}{value / 1_000_000_000:.2f}b"
        if abs(value) >= 1_000_000:
            return f"{symbol}{value / 1_000_000:.2f}m"
        if abs(value) >= 1_000:
            return f"{symbol}{value / 1_000:.1f}k"
        return f"{symbol}{value:,.2f}".rstrip("0").rstrip(".")
    if abs(value) >= 1_000_000_000:
        rendered = f"{value / 1_000_000_000:.1f}B"
    elif abs(value) >= 1_000_000:
        rendered = f"{value / 1_000_000:.1f}M"
    elif abs(value) >= 1_000:
        rendered = f"{value / 1_000:.1f}K"
    elif abs(value) >= 100:
        rendered = f"{value:,.0f}"
    elif abs(value) >= 10:
        rendered = f"{value:.1f}"
    else:
        rendered = f"{value:.2f}".rstrip("0").rstrip(".")
    if unit == "x":
        return f"{rendered}×"
    if unit == "pp":
        return f"{rendered}pp"
    return rendered


def fmt_axis_y(value: float, unit: str) -> str:
    if unit in {"USD", "$"}:
        return f"${value:,.0f}"
    if unit in CURRENCY_SYMBOLS:
        symbol = CURRENCY_SYMBOLS[unit]
        if abs(value) >= 1_000_000_000:
            return f"{symbol}{value / 1_000_000_000:.1f}b"
        if abs(value) >= 1_000_000:
            return f"{symbol}{value / 1_000_000:.1f}m"
        if abs(value) >= 1_000:
            return f"{symbol}{value / 1_000:.0f}k"
        return f"{symbol}{value:,.0f}"
    return fmt_y(value, unit)


def is_level_marker(marker: dict[str, Any]) -> bool:
    return marker.get("y") is not None and marker.get("kind") in LEVEL_MARKER_KINDS


def marker_color(marker: dict[str, Any], colors: dict[str, str]) -> str:
    kind = marker.get("kind")
    if kind == "invalidation":
        return colors["red"]
    if kind in {"trigger", "target"}:
        return colors["primary"]
    if kind == "baseline":
        return colors["context"]
    if kind == "estimate":
        return colors["driver"]
    return colors["yellow_ink"]


def series_color(series: dict[str, Any], colors: dict[str, str]) -> str:
    color_role = series.get("color_role")
    if color_role:
        return colors[COLOR_ROLE_KEYS[color_role]]
    return colors[SERIES_COLORS[series["role"]]]


def series_dash(series: dict[str, Any], provisional: bool = False) -> str:
    style = series.get("stroke_style", "solid")
    if provisional and style == "solid":
        style = "dashed"
    dash = STROKE_DASHES[style]
    return f' stroke-dasharray="{dash}"' if dash else ""


def compact_series(spec: dict[str, Any]) -> list[dict[str, Any]]:
    series = spec["curve"]["series"]
    focus_ids = spec["render"].get("focus_series_ids") or []
    if focus_ids:
        by_id = {item["id"]: item for item in series}
        return [by_id[item] for item in focus_ids]
    return series[:4]


def show_endpoint_label(spec: dict[str, Any], series: dict[str, Any]) -> bool:
    endpoint_ids = spec["render"].get("endpoint_series_ids") or []
    return not endpoint_ids or series["id"] in endpoint_ids


def spread_latest_labels(
    labels: list[tuple[float, float, str, str]],
    min_y: float,
    max_y: float,
    gap: float,
) -> list[tuple[float, float, str, str]]:
    ordered = sorted(labels, key=lambda item: item[1])
    placed: list[float] = []
    for _, target_y, _, _ in ordered:
        placed.append(max(min_y, target_y if not placed else max(target_y, placed[-1] + gap)))
    if placed and placed[-1] > max_y:
        shift = placed[-1] - max_y
        placed = [value - shift for value in placed]
    if placed and placed[0] < min_y:
        shift = min_y - placed[0]
        placed = [value + shift for value in placed]
    return [(item[0], placed[index], item[2], item[3]) for index, item in enumerate(ordered)]


def collect_categories(spec: dict[str, Any]) -> list[str]:
    categories: list[str] = []
    if spec["curve"]["x_axis"]["kind"] != "category":
        return categories
    for series in spec["curve"]["series"]:
        for point in series["points"]:
            value = str(point["x"])
            if value not in categories:
                categories.append(value)
    for marker in spec["curve"]["markers"]:
        value = str(marker["x"])
        if value not in categories:
            categories.append(value)
    return categories


def nice_ceiling(value: float) -> float:
    if value <= 0:
        return 1.0
    exponent = math.floor(math.log10(value))
    scale = 10**exponent
    normalized = value / scale
    for candidate in (1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0):
        if normalized <= candidate:
            return candidate * scale
    return 10.0 * scale


def axis_domains(spec: dict[str, Any], categories: list[str]) -> tuple[float, float, float, float]:
    x_kind = spec["curve"]["x_axis"]["kind"]
    xs = [x_numeric(point["x"], x_kind, categories) for series in spec["curve"]["series"] for point in series["points"]]
    xs.extend(x_numeric(marker["x"], x_kind, categories) for marker in spec["curve"]["markers"])
    ys = [float(point["y"]) for series in spec["curve"]["series"] for point in series["points"]]
    ys.extend(float(marker["y"]) for marker in spec["curve"]["markers"] if marker.get("y") is not None)
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    if x_min == x_max:
        x_min -= 1
        x_max += 1
    elif spec["grammar"] == "instrument_map":
        x_padding = (x_max - x_min) * 0.10
        x_min -= x_padding
        x_max += x_padding
    if spec["curve"]["y_axis"]["zero_policy"] == "include":
        y_min = min(y_min, 0.0)
        y_max = max(y_max, 0.0)
    if y_min == y_max:
        padding = max(abs(y_min) * 0.1, 1.0)
    else:
        padding = (y_max - y_min) * 0.12
    lower_y = y_min - padding
    upper_y = y_max + padding
    if spec["curve"]["y_axis"]["zero_policy"] == "include" and min(ys) >= 0:
        lower_y = 0.0
        upper_y = nice_ceiling(max(ys) * 1.08)
    return x_min, x_max, lower_y, upper_y


def render_plot(spec: dict[str, Any], colors: dict[str, str]) -> list[str]:
    plot_x, plot_y, plot_w, plot_h = 56.0, 258.0, 720.0, 326.0
    inner_x, inner_y, inner_w, inner_h = plot_x + 56, plot_y + 44, plot_w - 78, plot_h - 82
    categories = collect_categories(spec)
    x_kind = spec["curve"]["x_axis"]["kind"]
    x_min, x_max, y_min, y_max = axis_domains(spec, categories)

    def sx(value: Any) -> float:
        raw = x_numeric(value, x_kind, categories)
        return inner_x + (raw - x_min) / (x_max - x_min) * inner_w

    def sy(value: float) -> float:
        return inner_y + (y_max - float(value)) / (y_max - y_min) * inner_h

    parts = [rect(plot_x, plot_y, plot_w, plot_h, colors["surface"], colors["line"], 7)]
    latest_observed_x = max(
        x_numeric(point["x"], x_kind, categories)
        for series in spec["curve"]["series"]
        for point in series["points"]
        if point["state"] != "modelled"
    )
    expiry = next((marker for marker in spec["curve"]["markers"] if marker["kind"] == "expiry"), None)
    if expiry is not None:
        expiry_x = x_numeric(expiry["x"], x_kind, categories)
        if expiry_x > latest_observed_x:
            left = inner_x + (latest_observed_x - x_min) / (x_max - x_min) * inner_w
            parts.extend(
                [
                    rect(left, inner_y, max(0, sx(expiry["x"]) - left), inner_h, colors["surface_alt"], radius=0),
                ]
            )

    for index in range(4):
        value = y_max - index * (y_max - y_min) / 3
        y = sy(value)
        parts.extend(
            [
                f'<line x1="{inner_x:.1f}" y1="{y:.1f}" x2="{inner_x + inner_w:.1f}" y2="{y:.1f}" stroke="{colors["grid"]}" stroke-width="1"/>',
                text_block(inner_x - 10, y + 4, fmt_axis_y(value, spec["curve"]["y_axis"]["unit"]), 10, 1, 11, 13, colors["muted"], 500, "end"),
            ]
        )
    if x_kind == "category":
        tick_values = [float(index) for index in range(len(categories))]
        if len(tick_values) > 6:
            step = max(1, math.ceil(len(tick_values) / 6))
            tick_values = tick_values[::step]
    else:
        tick_values = [x_min + index * (x_max - x_min) / 3 for index in range(4)]
    for value in tick_values:
        x = inner_x + (value - x_min) / (x_max - x_min) * inner_w
        parts.extend(
            [
                f'<line x1="{x:.1f}" y1="{inner_y + inner_h:.1f}" x2="{x:.1f}" y2="{inner_y + inner_h + 5:.1f}" stroke="{colors["line"]}" stroke-width="1"/>',
                text_block(x, inner_y + inner_h + 22, fmt_axis_x(value, x_kind, categories, spec["curve"]["x_axis"]["unit"]), 12, 1, 11, 13, colors["muted"], 500, "middle"),
            ]
        )

    if spec["grammar"] == "relative_strength" and len(spec["curve"]["series"]) >= 2:
        first, second = spec["curve"]["series"][:2]
        first_map = {str(point["x"]): point for point in first["points"]}
        second_map = {str(point["x"]): point for point in second["points"]}
        common = [key for key in first_map if key in second_map and first_map[key]["state"] == "sealed" and second_map[key]["state"] == "sealed"]
        common.sort(key=lambda key: x_numeric(first_map[key]["x"], x_kind, categories))
        if len(common) >= 2:
            upper = " ".join(f"{sx(first_map[key]['x']):.1f},{sy(first_map[key]['y']):.1f}" for key in common)
            lower = " ".join(f"{sx(second_map[key]['x']):.1f},{sy(second_map[key]['y']):.1f}" for key in reversed(common))
            parts.append(f'<polygon points="{upper} {lower}" fill="{colors["primary"]}" opacity="0.10"/>')

    last_marker_x = -10_000.0
    marker_lane = 0
    for marker in spec["curve"]["markers"]:
        x = sx(marker["x"])
        marker_ink = marker_color(marker, colors)
        dash = "5 5" if marker["status"] == "proposed" else "3 4"
        if is_level_marker(marker):
            y = sy(marker["y"])
            label_width = max(62, min(122, display_width(marker["label"]) * 7 + 20))
            label_y = max(inner_y + 3, min(y - 14, inner_y + inner_h - 28))
            parts.extend(
                [
                    f'<line data-marker-orientation="horizontal" x1="{inner_x:.1f}" y1="{y:.1f}" x2="{inner_x + inner_w:.1f}" y2="{y:.1f}" stroke="{marker_ink}" stroke-width="1.5" stroke-dasharray="{dash}"/>',
                    pill(inner_x + 6, label_y, marker["label"], colors["bg"], marker_ink, label_width),
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{marker_ink}" stroke="{colors["bg"]}" stroke-width="2"/>',
                ]
            )
            continue
        marker_lane = marker_lane + 1 if x - last_marker_x < 92 else 0
        marker_lane %= 3
        last_marker_x = x
        label_width = max(54, min(68, display_width(marker["label"]) * 7 + 20))
        label_x = max(inner_x, min(x - label_width / 2, inner_x + inner_w - label_width))
        label_y = inner_y + inner_h - 37 - marker_lane * 31
        parts.append(f'<line data-marker-orientation="vertical" x1="{x:.1f}" y1="{inner_y:.1f}" x2="{x:.1f}" y2="{inner_y + inner_h:.1f}" stroke="{marker_ink}" stroke-width="1.5" stroke-dasharray="{dash}"/>')
        if not (marker["kind"] == "event" and x > inner_x + inner_w - 36):
            parts.append(pill(label_x, label_y, marker["label"], colors["surface_alt"], colors["yellow_ink"], label_width))
        if marker.get("y") is not None:
            parts.append(f'<circle cx="{x:.1f}" cy="{sy(marker["y"]):.1f}" r="5" fill="{marker_ink}" stroke="{colors["bg"]}" stroke-width="2"/>')

    legend_x = inner_x
    legend_y = plot_y + 25
    latest_labels: list[tuple[float, float, str, str]] = []
    for series in spec["curve"]["series"]:
        color = series_color(series, colors)
        if spec["grammar"] == "instrument_map":
            points = series["points"]
            ranked = sorted(points, key=lambda point: float(point["x"]))
            point_colors = [colors["primary"], colors["benchmark"], colors["driver"], colors["red"]]
            for index, point in enumerate(ranked):
                risk_rank = 0 if len(ranked) == 1 else round(index * (len(point_colors) - 1) / (len(ranked) - 1))
                point_color = point_colors[risk_rank]
                point_x, point_y = sx(point["x"]), sy(point["y"])
                fill = colors["bg"] if point["state"] == "forming" else point_color
                label_y = point_y - 13 if index % 2 == 0 else point_y + 27
                label_y = max(inner_y + 13, min(label_y, inner_y + inner_h - 5))
                parts.extend(
                    [
                        f'<circle data-plot-kind="instrument-map" data-instrument="{esc(point["label"])}" cx="{point_x:.1f}" cy="{point_y:.1f}" r="8" fill="{fill}" stroke="{point_color}" stroke-width="3"/>',
                        text_block(point_x, label_y, point["label"], 18, 1, 12, 14, point_color, 800, "middle"),
                    ]
                )
            parts.extend(
                [
                    text_block(inner_x, plot_y + 29, series["label"], 36, 1, 12, 14, colors["ink"], 700),
                    text_block(inner_x + inner_w, inner_y + inner_h + 39, spec["curve"]["x_axis"]["label"], 30, 1, 11, 13, colors["muted"], 600, "end"),
                ]
            )
            continue
        if spec["render"].get("show_legend", True):
            legend_width = max(108, display_width(series["label"]) * 7 + 58)
            if legend_x > inner_x and legend_x + legend_width > inner_x + inner_w:
                legend_x = inner_x
                legend_y += 18
            parts.extend(
                [
                    f'<line x1="{legend_x:.1f}" y1="{legend_y:.1f}" x2="{legend_x + 20:.1f}" y2="{legend_y:.1f}" stroke="{color}" stroke-width="3" stroke-linecap="round"{series_dash(series)}/>',
                    text_block(legend_x + 28, legend_y + 4, series["label"], 16, 1, 11, 13, colors["ink"], 600),
                ]
            )
            legend_x += legend_width
        points = series["points"]
        for index in range(1, len(points)):
            previous, current = points[index - 1], points[index]
            is_provisional = current["state"] in {"forming", "modelled"} or previous["state"] in {"forming", "modelled"}
            dash = series_dash(series, is_provisional)
            parts.append(
                f'<line data-series-id="{esc(series["id"])}" data-data-kind="{esc(series["data_kind"])}" x1="{sx(previous["x"]):.1f}" y1="{sy(previous["y"]):.1f}" '
                f'x2="{sx(current["x"]):.1f}" y2="{sy(current["y"]):.1f}" '
                f'stroke="{color}" stroke-width="3" stroke-linecap="round"{dash}/>'
            )
        for point in points:
            if point is points[-1] or point["state"] != "sealed":
                fill = colors["bg"] if point["state"] != "sealed" else color
                parts.append(f'<circle cx="{sx(point["x"]):.1f}" cy="{sy(point["y"]):.1f}" r="4.5" fill="{fill}" stroke="{color}" stroke-width="2"/>')
        latest = points[-1]
        latest_value = fmt_y(float(latest["y"]), series["unit"])
        latest_label = latest_value if spec["render"].get("show_legend", True) else f'{series["label"]} {latest_value}'
        if show_endpoint_label(spec, series):
            latest_labels.append((sx(latest["x"]), sy(latest["y"]), latest_label, color))

    positioned_labels = spread_latest_labels(
        [(x, max(inner_y + 16, min(y - 8, inner_y + inner_h - 8)), label, color) for x, y, label, color in latest_labels],
        inner_y + 16,
        inner_y + inner_h - 5,
        17,
    )
    for x, label_y, label, color in positioned_labels:
        near_right = x > inner_x + inner_w - 110
        label_x = x - 9 if near_right else x + 9
        parts.append(text_block(label_x, label_y, label, 22, 1, 12, 14, color, 700, "end" if near_right else "start"))

    parts.append(text_block(plot_x + plot_w - 18, plot_y + 29, spec["curve"]["y_axis"]["label"], 22, 1, 11, 13, colors["muted"], 500, "end"))
    return parts


def render_side_panel(spec: dict[str, Any], colors: dict[str, str]) -> list[str]:
    x, y, width, height = 804.0, 258.0, 340.0, 326.0
    parts = [rect(x, y, width, height, colors["surface"], colors["line"], 7)]
    news = spec["news_anchor"]
    cursor = y + 28
    if news:
        status_label = {"observed": "已确认", "provisional": "快讯", "unconfirmed": "待核实"}[news["status"]]
        parts.extend(
            [
                text_block(x + 20, cursor, "新闻锚点", 18, 1, 13, 15, colors["yellow_ink"], 700),
                pill(x + width - 92, cursor - 20, status_label, colors["surface_alt"], colors["yellow_ink"], 72),
                text_block(x + 20, cursor + 38, news["headline"], 33, 3, 17, 23, colors["ink"], 700),
            ]
        )
        published = parse_time(news["published_at"])
        parts.append(text_block(x + 20, cursor + 112, f"{news['publisher']} · {published.month}月{published.day}日 {published:%H:%M} UTC", 38, 1, 11, 13, colors["muted"], 500))
        cursor += 140
        parts.append(f'<line x1="{x + 20:.1f}" y1="{cursor:.1f}" x2="{x + width - 20:.1f}" y2="{cursor:.1f}" stroke="{colors["line"]}" stroke-width="1"/>')
        cursor += 28
    else:
        parts.append(text_block(x + 20, cursor, "关键数字", 20, 1, 13, 15, colors["muted"], 700))
        cursor += 28

    numbers = spec["key_numbers"]
    columns = 2 if len(numbers) >= 3 else 1
    cell_w = (width - 40 - (12 if columns == 2 else 0)) / columns
    rows = math.ceil(len(numbers) / columns)
    available = y + height - cursor - 12
    cell_h = max(62, available / rows)
    for index, number in enumerate(numbers):
        column = index % columns
        row = index // columns
        cell_x = x + 20 + column * (cell_w + 12)
        cell_y = cursor + row * cell_h
        if column:
            parts.append(f'<line x1="{cell_x - 6:.1f}" y1="{cell_y:.1f}" x2="{cell_x - 6:.1f}" y2="{cell_y + cell_h - 10:.1f}" stroke="{colors["line"]}" stroke-width="1"/>')
        role_color = colors["red"] if number["role"] == "risk" else colors["primary"] if number["role"] == "magnitude" else colors["benchmark"] if number["role"] == "comparison" else colors["ink"]
        parts.extend(
            [
                text_block(cell_x, cell_y + 14, number["label"], 20, 1, 11, 13, colors["muted"], 600),
                text_block(cell_x, cell_y + 46, number["display_value"], 16, 1, 25 if columns == 1 else 22, 27, role_color, 800),
            ]
        )
    return parts


def render_bottom(spec: dict[str, Any], colors: dict[str, str]) -> list[str]:
    y, height = 612.0, 88.0
    counter = spec["countercase"]
    settlement = spec["settlement"]
    parts: list[str] = []
    if counter and settlement["settleable"]:
        parts.extend(
            [
                rect(56, y, 516, height, colors["red_soft"], colors["red"], 7),
                text_block(76, y + 25, counter["label"], 28, 1, 12, 14, colors["red"], 700),
                text_block(76, y + 53, counter["condition"], 50, 2, 14, 18, colors["ink"], 600),
                rect(592, y, 552, height, colors["surface_alt"], colors["yellow"], 7),
                text_block(612, y + 25, "如何结算", 18, 1, 12, 14, colors["yellow_ink"], 700),
                text_block(612, y + 53, settlement["success_line"], 48, 2, 14, 18, colors["ink"], 600),
            ]
        )
    elif settlement["settleable"]:
        parts.extend(
            [
                rect(56, y, 1088, height, colors["surface_alt"], colors["yellow"], 7),
                text_block(76, y + 25, "如何结算", 18, 1, 12, 14, colors["yellow_ink"], 700),
                text_block(76, y + 56, settlement["success_line"], 100, 2, 16, 21, colors["ink"], 600),
            ]
        )
    elif counter:
        parts.extend(
            [
                rect(56, y, 1088, height, colors["red_soft"], colors["red"], 7),
                text_block(76, y + 25, counter["label"], 18, 1, 12, 14, colors["red"], 700),
                text_block(76, y + 56, counter["condition"], 100, 2, 16, 21, colors["ink"], 600),
            ]
        )
    return parts


def all_sources(spec: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for series in spec["curve"]["series"]:
        values.append(series["source_ref"])
        if series.get("baseline"):
            values.append(series["baseline"]["source_ref"])
        values.extend(point.get("source_ref") for point in series["points"])
    values.extend(marker["source_ref"] for marker in spec["curve"]["markers"])
    values.extend(number["source_ref"] for number in spec["key_numbers"])
    if spec["news_anchor"]:
        values.extend(spec["news_anchor"]["source_refs"])
    if spec["countercase"]:
        values.extend(spec["countercase"]["source_refs"])
    if spec.get("argument_path"):
        for node in spec["argument_path"]["nodes"]:
            values.extend(node["source_refs"])
    return dedupe(values)


def dominant_number(spec: dict[str, Any]) -> dict[str, Any]:
    priorities = {"settlement": 0, "comparison": 1, "magnitude": 2, "driver": 3, "risk": 4}
    return sorted(spec["key_numbers"], key=lambda item: priorities.get(item["role"], 9))[0]


def render_compact_plot(
    spec: dict[str, Any],
    colors: dict[str, str],
    plot_y: float = 132.0,
    plot_h: float = 220.0,
) -> list[str]:
    plot_x, plot_w = 28.0, 664.0
    inner_x, inner_y, inner_w, inner_h = plot_x + 42, plot_y + 34, plot_w - 64, plot_h - 74
    selected_series = compact_series(spec)
    plot_spec = {**spec, "curve": {**spec["curve"], "series": selected_series}}
    categories = collect_categories(plot_spec)
    x_kind = spec["curve"]["x_axis"]["kind"]
    x_min, x_max, y_min, y_max = axis_domains(plot_spec, categories)

    def sx(value: Any) -> float:
        raw = x_numeric(value, x_kind, categories)
        return inner_x + (raw - x_min) / (x_max - x_min) * inner_w

    def sy(value: float) -> float:
        return inner_y + (y_max - float(value)) / (y_max - y_min) * inner_h

    parts = [rect(plot_x, plot_y, plot_w, plot_h, colors["surface"], colors["line"], 7)]
    observed_xs = [
        x_numeric(point["x"], x_kind, categories)
        for series in selected_series
        for point in series["points"]
        if point["state"] != "modelled"
    ]
    expiry = next((marker for marker in spec["curve"]["markers"] if marker["kind"] == "expiry"), None)
    if expiry is not None and observed_xs:
        latest_x = max(observed_xs)
        expiry_x = x_numeric(expiry["x"], x_kind, categories)
        if expiry_x > latest_x:
            left = inner_x + (latest_x - x_min) / (x_max - x_min) * inner_w
            parts.append(rect(left, inner_y, max(0, sx(expiry["x"]) - left), inner_h, colors["surface_alt"], radius=0))

    for index in range(4):
        value = y_max - index * (y_max - y_min) / 3
        y = sy(value)
        stroke = colors["line"] if abs(value) < (y_max - y_min) * 0.04 else colors["grid"]
        width = 1.5 if stroke == colors["line"] else 1
        parts.extend(
            [
                f'<line x1="{inner_x:.1f}" y1="{y:.1f}" x2="{inner_x + inner_w:.1f}" y2="{y:.1f}" stroke="{stroke}" stroke-width="{width}"/>',
                text_block(inner_x - 8, y + 3, fmt_axis_y(value, spec["curve"]["y_axis"]["unit"]), 9, 1, 10, 12, colors["muted"], 500, "end"),
            ]
        )
    if spec["grammar"] != "instrument_map" and y_min <= 0 <= y_max:
        zero_y = sy(0)
        zero_label = "0% 基准" if spec["curve"]["y_axis"]["unit"] in {"%", "pct"} else "0 基准"
        parts.extend(
            [
                f'<line x1="{inner_x:.1f}" y1="{zero_y:.1f}" x2="{inner_x + inner_w:.1f}" y2="{zero_y:.1f}" stroke="{colors["line"]}" stroke-width="1.5"/>',
                text_block(inner_x + 6, zero_y - 5, zero_label, 12, 1, 10, 12, colors["muted"], 600),
            ]
        )

    tick_values = [x_min, (x_min + x_max) / 2, x_max]
    if x_kind == "category":
        tick_values = sorted(set([0.0, float(max(0, len(categories) // 2)), float(max(0, len(categories) - 1))]))
    for value in tick_values:
        x = inner_x + (value - x_min) / (x_max - x_min) * inner_w
        parts.append(text_block(x, inner_y + inner_h + 18, fmt_axis_x(value, x_kind, categories, spec["curve"]["x_axis"]["unit"]), 12, 1, 10, 12, colors["muted"], 500, "middle"))

    legend_x = inner_x
    for series in selected_series:
        color = series_color(series, colors)
        if spec["grammar"] == "instrument_map":
            continue
        if spec["render"].get("show_legend", True):
            parts.extend(
                [
                    f'<line x1="{legend_x:.1f}" y1="{plot_y + 18:.1f}" x2="{legend_x + 16:.1f}" y2="{plot_y + 18:.1f}" stroke="{color}" stroke-width="3" stroke-linecap="round"{series_dash(series)}/>',
                    text_block(legend_x + 22, plot_y + 21, series["label"], 14, 1, 10, 12, colors["ink"], 700),
                ]
            )
            legend_x += max(72, display_width(series["label"]) * 6 + 40)

    if spec["grammar"] == "relative_strength" and len(selected_series) >= 2:
        first, second = selected_series[:2]
        first_map = {str(point["x"]): point for point in first["points"]}
        second_map = {str(point["x"]): point for point in second["points"]}
        common = [key for key in first_map if key in second_map and first_map[key]["state"] == "sealed" and second_map[key]["state"] == "sealed"]
        common.sort(key=lambda key: x_numeric(first_map[key]["x"], x_kind, categories))
        if len(common) >= 2:
            upper = " ".join(f"{sx(first_map[key]['x']):.1f},{sy(first_map[key]['y']):.1f}" for key in common)
            lower = " ".join(f"{sx(second_map[key]['x']):.1f},{sy(second_map[key]['y']):.1f}" for key in reversed(common))
            parts.append(f'<polygon points="{upper} {lower}" fill="{colors["primary"]}" opacity="0.10"/>')

    marker_lane = 0
    last_marker_x = -10_000.0
    for marker in spec["curve"]["markers"]:
        x = sx(marker["x"])
        marker_ink = marker_color(marker, colors)
        dash = "5 5" if marker["status"] == "proposed" else "3 4"
        if is_level_marker(marker):
            y = sy(marker["y"])
            label_y = max(inner_y + 10, min(y - 5, inner_y + inner_h - 20))
            parts.extend(
                [
                    f'<line data-marker-orientation="horizontal" x1="{inner_x:.1f}" y1="{y:.1f}" x2="{inner_x + inner_w:.1f}" y2="{y:.1f}" stroke="{marker_ink}" stroke-width="1.2" stroke-dasharray="{dash}"/>',
                    text_block(inner_x + 6, label_y, marker["label"], 20, 1, 10, 12, marker_ink, 700),
                    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="{marker_ink}" stroke="{colors["bg"]}" stroke-width="2"/>',
                ]
            )
            continue
        parts.append(f'<line data-marker-orientation="vertical" x1="{x:.1f}" y1="{inner_y:.1f}" x2="{x:.1f}" y2="{inner_y + inner_h:.1f}" stroke="{marker_ink}" stroke-width="1.2" stroke-dasharray="{dash}"/>')
        if marker["kind"] in {"event", "publication", "expiry"}:
            marker_lane = marker_lane + 1 if x - last_marker_x < 72 else 0
            marker_lane %= 2
            near_right = x > inner_x + inner_w - 50
            label_y = plot_y + 21 if near_right else inner_y + inner_h - 8 - marker_lane * 15
            anchor = "end" if near_right else "start"
            label_x = x - 5 if near_right else x + 5
            parts.append(text_block(label_x, label_y, marker["label"], 8, 1, 10, 12, colors["yellow_ink"], 700, anchor))
            last_marker_x = x
        if marker.get("y") is not None:
            parts.append(f'<circle cx="{x:.1f}" cy="{sy(marker["y"]):.1f}" r="4" fill="{marker_ink}" stroke="{colors["bg"]}" stroke-width="2"/>')

    latest_labels: list[tuple[float, float, str, str]] = []
    for series in selected_series:
        color = series_color(series, colors)
        points = series["points"]
        if spec["grammar"] == "instrument_map":
            ranked = sorted(points, key=lambda point: float(point["x"]))
            point_colors = [colors["primary"], colors["benchmark"], colors["driver"], colors["red"]]
            for index, point in enumerate(ranked):
                risk_rank = 0 if len(ranked) == 1 else round(index * (len(point_colors) - 1) / (len(ranked) - 1))
                point_color = point_colors[risk_rank]
                point_x, point_y = sx(point["x"]), sy(point["y"])
                fill = colors["bg"] if point["state"] == "forming" else point_color
                label_y = point_y - 11 if index % 2 == 0 else point_y + 23
                label_y = max(inner_y + 11, min(label_y, inner_y + inner_h - 4))
                parts.extend(
                    [
                        f'<circle data-plot-kind="instrument-map" data-instrument="{esc(point["label"])}" cx="{point_x:.1f}" cy="{point_y:.1f}" r="7" fill="{fill}" stroke="{point_color}" stroke-width="2.5"/>',
                        text_block(point_x, label_y, point["label"], 16, 1, 11, 13, point_color, 800, "middle"),
                    ]
                )
            continue
        for index in range(1, len(points)):
            previous, current = points[index - 1], points[index]
            provisional = previous["state"] in {"forming", "modelled"} or current["state"] in {"forming", "modelled"}
            dash = series_dash(series, provisional)
            parts.append(
                f'<line data-series-id="{esc(series["id"])}" data-data-kind="{esc(series["data_kind"])}" x1="{sx(previous["x"]):.1f}" y1="{sy(previous["y"]):.1f}" '
                f'x2="{sx(current["x"]):.1f}" y2="{sy(current["y"]):.1f}" '
                f'stroke="{color}" stroke-width="2.8" stroke-linecap="round"{dash}/>'
            )
        latest = points[-1]
        parts.append(f'<circle cx="{sx(latest["x"]):.1f}" cy="{sy(latest["y"]):.1f}" r="4" fill="{colors["bg"] if latest["state"] != "sealed" else color}" stroke="{color}" stroke-width="2"/>')
        latest_value = fmt_y(float(latest["y"]), series["unit"])
        latest_label = latest_value if spec["render"].get("show_legend", True) else f'{series["label"]} {latest_value}'
        if show_endpoint_label(spec, series):
            latest_labels.append((sx(latest["x"]), sy(latest["y"]), latest_label, color))
    positioned_labels = spread_latest_labels(
        [(x, max(inner_y + 10, min(y - 7, inner_y + inner_h - 4)), label, color) for x, y, label, color in latest_labels],
        inner_y + 10,
        inner_y + inner_h - 4,
        15,
    )
    for x, label_y, label, color in positioned_labels:
        near_right = x > inner_x + inner_w - 90
        parts.append(text_block(x - 7 if near_right else x + 7, label_y, label, 10, 1, 10, 12, color, 800, "end" if near_right else "start"))

    if spec["grammar"] == "instrument_map":
        parts.extend(
            [
                text_block(plot_x + plot_w - 12, plot_y + 20, spec["curve"]["y_axis"]["label"], 24, 1, 9, 11, colors["muted"], 600, "end"),
                text_block(inner_x + inner_w, inner_y + inner_h + 32, spec["curve"]["x_axis"]["label"], 26, 1, 9, 11, colors["muted"], 600, "end"),
            ]
        )
    return parts


def render_compact_svg(spec: dict[str, Any]) -> str:
    colors = PALETTES[spec["render"]["theme"]]
    dominant = dominant_number(spec)
    value_color = colors["red"] if dominant["role"] == "risk" else colors["primary"]
    news = spec["news_anchor"]
    has_argument = spec["render"].get("semantic_mode", "curve_only") == "argument_curve" and bool(spec.get("argument_path"))
    cutoff = parse_time(spec["lineage"]["decision_cutoff_at"])
    timestamp = f"{cutoff:%m/%d %H:%M} UTC"
    trade_logic = spec.get("trade_logic")
    meta = " · ".join([timestamp, *(trade_logic["public_tags"] if trade_logic else [spec["frame"]["kicker"]])])
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{COMPACT_WIDTH}" height="{COMPACT_HEIGHT}" viewBox="0 0 {COMPACT_WIDTH} {COMPACT_HEIGHT}">',
        rect(0, 0, COMPACT_WIDTH, COMPACT_HEIGHT, colors["bg"], radius=0),
        text_block(28, 24, meta, 76, 1, 10, 12, colors["muted"], 700),
        text_block(28, 57, spec["frame"]["headline"], 40, 2, 22, 28, colors["ink"], 800),
        text_block(692, 24, dominant["label"], 20, 1, 10, 12, colors["muted"], 600, "end"),
        text_block(692, 58, dominant["display_value"], 16, 1, 28, 31, value_color, 800, "end"),
    ]
    if has_argument:
        parts.extend(render_argument_path(spec, colors, 28, 94, 664, 80, True))
        parts.extend(render_compact_plot(spec, colors, 186, 206))
    else:
        parts.append(text_block(28, 120, spec["curve"]["title"], 42, 1, 11, 13, colors["ink"], 700))
    if news and not has_argument:
        published = parse_time(news["published_at"])
        news_line = f"{published:%m/%d} · {news['headline']} · {news['publisher']}"
        parts.extend(
            [
                f'<circle cx="687" cy="116" r="4" fill="{colors["yellow"]}" stroke="{colors["yellow_ink"]}" stroke-width="1"/>',
                text_block(677, 120, news_line, 46, 1, 10, 12, colors["muted"], 600, "end"),
            ]
        )
    if not has_argument:
        parts.extend(render_compact_plot(spec, colors))
    parts.append(canonical_wordmark(COMPACT_WIDTH - 73 - 18, COMPACT_HEIGHT - 14 - 16, colors["muted"]))
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def render_editorial_svg(spec: dict[str, Any]) -> str:
    colors = PALETTES[spec["render"]["theme"]]
    has_argument = spec["render"].get("semantic_mode", "curve_only") == "argument_curve" and bool(spec.get("argument_path"))
    cutoff = parse_time(spec["lineage"]["decision_cutoff_at"])
    trade_logic = spec.get("trade_logic")
    meta = " · ".join([f"{cutoff:%Y-%m-%d %H:%M} UTC", *(trade_logic["public_tags"] if trade_logic else [GRAMMAR_LABELS[spec["grammar"]]])])
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        rect(0, 0, WIDTH, HEIGHT, colors["bg"], radius=0),
        text_block(56, 43, meta, 100, 1, 14, 17, colors["muted"], 700),
        text_block(56, 92, spec["frame"]["headline"], 66, 2, 30, 38, colors["ink"], 800),
        text_block(56, 173, spec["frame"]["viewpoint"], 105, 2, 16, 22, colors["muted"], 500),
    ]
    if has_argument:
        parts.extend(render_argument_path(spec, colors, 56, 205, 1088, 42, False))
    else:
        parts.append(text_block(56, 235, spec["curve"]["title"], 60, 1, 15, 18, colors["ink"], 700))
    parts.extend(render_plot(spec, colors))
    parts.extend(render_side_panel(spec, colors))
    parts.extend(render_bottom(spec, colors))
    parts.append(canonical_wordmark(WIDTH - 73 - 32, HEIGHT - 14 - 28, colors["muted"]))
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def render_svg(spec: dict[str, Any]) -> str:
    return render_compact_svg(spec) if spec["render"]["layout"] == "compact" else render_editorial_svg(spec)


def render(spec: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    result = VALIDATOR.validate_spec(spec)
    if not result["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in result["errors"])
        raise RuntimeError(f"Invalid MarketFigureSpecV1: {details}")
    if spec["quality_report"]["decision"] == "blocked":
        raise RuntimeError("Blocked figure specs cannot be rendered.")
    output_dir.mkdir(parents=True, exist_ok=True)
    svg_path = output_dir / "market-figure.svg"
    svg_path.write_text(render_svg(spec), encoding="utf-8")
    content_hash = "sha256:" + hashlib.sha256(svg_path.read_bytes()).hexdigest()
    sources = all_sources(spec)
    argument_nodes = spec.get("argument_path", {}).get("nodes", []) if spec.get("argument_path") else []
    trade_logic = spec.get("trade_logic")
    suffix = spec["spec_id"].removeprefix("FIGSPEC_")
    manifest = {
        "schema_version": "market-figure-v1",
        "figure_id": f"FIGURE_{suffix}_r{spec['revision']}_{spec['grammar']}",
        "spec_ref": spec["spec_id"],
        "grammar": spec["grammar"],
        "layout": spec["render"]["layout"],
        "state": spec["state"],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "theme": spec["render"]["theme"],
        "dimensions": {"width": spec["render"]["width"], "height": spec["render"]["height"]},
        "lineage": {
            "input_artifact_refs": spec["lineage"]["input_artifact_refs"],
            "series_refs": [item["id"] for item in spec["curve"]["series"]],
            "marker_refs": [item["id"] for item in spec["curve"]["markers"]],
            "key_number_refs": [item["id"] for item in spec["key_numbers"]],
            "news_fact_refs": spec["lineage"]["news_fact_refs"],
            "source_refs": sources,
            "argument_node_refs": [item["id"] for item in argument_nodes],
            "trade_logic_ref": trade_logic["profile_ref"] if trade_logic else None,
            "settlement_claim_ref": spec["lineage"]["settlement_claim_ref"],
        },
        "content": {
            "headline": spec["frame"]["headline"],
            "viewpoint": spec["frame"]["viewpoint"],
            "curve_title": spec["curve"]["title"],
            "news_headline": spec["news_anchor"]["headline"] if spec["news_anchor"] else None,
            "countercase_line": spec["countercase"]["condition"] if spec["countercase"] else None,
            "settlement_line": spec["settlement"]["success_line"],
            "argument_path_labels": [item["label"] for item in argument_nodes],
            "strategy_tags": trade_logic["public_tags"] if trade_logic else [],
            "watermark": "Cuebook",
        },
        "asset": {"svg_ref": "market-figure.svg", "content_hash": content_hash},
        "quality_report": spec["quality_report"],
    }
    manifest_validation = VALIDATOR.validate_manifest(manifest, output_dir)
    if not manifest_validation["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in manifest_validation["errors"])
        raise RuntimeError(f"Rendered MarketFigureV1 failed validation: {details}")
    manifest_path = output_dir / "market-figure-v1.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"manifest": manifest, "manifest_path": manifest_path, "svg_path": svg_path}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
        result = render(spec, args.output_dir)
    except (OSError, json.JSONDecodeError, RuntimeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(
        json.dumps(
            {
                "ok": True,
                "grammar": result["manifest"]["grammar"],
                "state": result["manifest"]["state"],
                "manifest": str(result["manifest_path"]),
                "svg": str(result["svg_path"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
