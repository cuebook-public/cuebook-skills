#!/usr/bin/env python3
"""Render VisualArgumentV1 into a Cuebook LogicCardV1 SVG bundle."""

from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
ARGUMENT_VALIDATOR_PATH = ROOT.parent / "compile-cuebook-visual-argument" / "scripts" / "validate_visual_argument.py"
LOGIC_VALIDATOR_PATH = ROOT / "scripts" / "validate_logic_card.py"
WIDTH = 1200
HEIGHT = 760
GRAMMARS = {"causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison"}


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module from {path}.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ARGUMENT_VALIDATOR = load_module("validate_visual_argument", ARGUMENT_VALIDATOR_PATH)
LOGIC_VALIDATOR = load_module("validate_logic_card", LOGIC_VALIDATOR_PATH)


PALETTES = {
    "cuebook_light": {
        "bg": "#F5F6F2",
        "surface": "#FFFFFF",
        "ink": "#11120F",
        "muted": "#6C7069",
        "line": "#D9DDD4",
        "soft": "#ECEFE9",
        "yellow": "#FFD217",
        "yellow_soft": "#FFF6C7",
        "green": "#0AA67A",
        "green_soft": "#E5F6F0",
        "red": "#DD5362",
        "red_soft": "#FCE9EC",
        "cyan": "#1596B2",
        "cyan_soft": "#E6F5F8",
        "black": "#10110F",
    },
    "cuebook_dark": {
        "bg": "#111310",
        "surface": "#1A1D19",
        "ink": "#F7F8F4",
        "muted": "#A9AEA5",
        "line": "#343933",
        "soft": "#242923",
        "yellow": "#FFD217",
        "yellow_soft": "#3B3515",
        "green": "#39C79A",
        "green_soft": "#17382E",
        "red": "#F07884",
        "red_soft": "#42252A",
        "cyan": "#50BED3",
        "cyan_soft": "#17343B",
        "black": "#090A09",
    },
}

STATUS_META = {
    "observed": ("已观察", "cyan", "cyan_soft"),
    "derived": ("推演", "green", "green_soft"),
    "conditional": ("待验证", "yellow", "yellow_soft"),
    "unresolved": ("未解决", "red", "red_soft"),
}
KIND_LABELS = {
    "event": "事件",
    "evidence": "证据",
    "mechanism": "机制",
    "actor_action": "资金动作",
    "market_effect": "市场结果",
    "metric": "指标",
    "condition": "条件",
    "countercase": "反例",
    "invalidation": "失效",
    "settlement": "结算",
}
GRAMMAR_LABELS = {
    "causal_chain": "因果链",
    "metric_thesis": "指标论证",
    "scenario_tree": "情景树",
    "evidence_balance": "证据天平",
    "comparison": "相对比较",
}


def esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def display_width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(char) in {"W", "F", "A"} else 1 for char in text)


def wrap_text(value: Any, max_units: int, max_lines: int) -> list[str]:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return []
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and display_width(candidate) > max_units:
            lines.append(current.rstrip())
            current = char.lstrip()
            if len(lines) == max_lines:
                break
        else:
            current = candidate
    if len(lines) < max_lines and current:
        lines.append(current.rstrip())
    consumed = "".join(lines)
    compact_original = text.replace(" ", "")
    compact_consumed = consumed.replace(" ", "")
    if len(compact_consumed) < len(compact_original) and lines:
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
    family: str | None = None,
) -> str:
    lines = wrap_text(value, max_units, max_lines)
    font = family or "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif"
    tspans = "".join(
        f'<tspan x="{x:.1f}" dy="{0 if index == 0 else line_height}">{esc(line)}</tspan>'
        for index, line in enumerate(lines)
    )
    return (
        f'<text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-family="{font}" '
        f'font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" letter-spacing="0">{tspans}</text>'
    )


def rect(x: float, y: float, width: float, height: float, fill: str, stroke: str = "none", radius: int = 7, stroke_width: int = 1) -> str:
    return (
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}"/>'
    )


def pill(x: float, y: float, label: str, fill: str, ink: str, width: float | None = None) -> str:
    width = width or max(54, display_width(label) * 7 + 22)
    return rect(x, y, width, 28, fill, radius=7) + text_block(x + width / 2, y + 19, label, 20, 1, 13, 15, ink, 650, "middle")


def dedupe(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if isinstance(value, str) and value.strip()))


def node_sources(nodes: Iterable[dict[str, Any]]) -> list[str]:
    return dedupe(ref for node in nodes for ref in node.get("source_refs", []))


def topological_nodes(argument: dict[str, Any], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidate_ids = {node["id"] for node in candidates}
    indegree = {node_id: 0 for node_id in candidate_ids}
    adjacency = {node_id: [] for node_id in candidate_ids}
    for edge in argument["graph"]["edges"]:
        source, target = edge["from"], edge["to"]
        if source in candidate_ids and target in candidate_ids and edge["relation"] != "challenges":
            adjacency[source].append(target)
            indegree[target] += 1
    queue = [node["id"] for node in candidates if indegree[node["id"]] == 0]
    ordered: list[str] = []
    while queue:
        current = queue.pop(0)
        ordered.append(current)
        for target in adjacency[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if len(ordered) != len(candidate_ids):
        return candidates
    by_id = {node["id"]: node for node in candidates}
    return [by_id[node_id] for node_id in ordered]


def common_open(argument: dict[str, Any], grammar: str, colors: dict[str, str]) -> list[str]:
    source_count = len(node_sources(argument["graph"]["nodes"]) + [item["source_ref"] for item in argument["metrics"]])
    status_label = {"draft": "草稿", "conditional": "待确认", "ready": "可发布", "frozen": "已冻结"}[argument["state"]]
    status_fill = colors["yellow_soft"] if argument["state"] in {"draft", "conditional"} else colors["green_soft"]
    status_ink = colors["yellow"] if argument["state"] in {"draft", "conditional"} else colors["green"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        "<defs>",
        f'<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{colors["muted"]}"/></marker>',
        f'<marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="{colors["red"]}"/></marker>',
        "</defs>",
        rect(0, 0, WIDTH, HEIGHT, colors["bg"], radius=0),
        rect(34, 28, 38, 38, colors["black"], radius=7),
        text_block(53, 56, "C", 2, 1, 24, 26, colors["yellow"], 800, "middle", "Georgia,serif"),
        text_block(88, 56, f"Cuebook 观点逻辑 · {GRAMMAR_LABELS[grammar]}", 40, 1, 17, 20, colors["ink"], 700),
        pill(1014, 34, status_label, status_fill, status_ink, 112),
        text_block(965, 55, f"{source_count} 个来源", 20, 1, 13, 16, colors["muted"], 500, "end"),
        text_block(56, 110, argument["frame"]["headline"], 62, 2, 34, 42, colors["ink"], 750),
        text_block(56, 188, argument["frame"]["thesis"], 100, 2, 18, 25, colors["muted"], 450),
    ]
    return parts


def settlement_line(argument: dict[str, Any]) -> str | None:
    settlement = argument["settlement"]
    if not settlement["settleable"]:
        return None
    deadline = datetime.fromisoformat(settlement["deadline_at"].replace("Z", "+00:00"))
    deadline_label = deadline.strftime("%Y-%m-%d %H:%M UTC")
    primary = argument["subject"]["primary"]["ticker"]
    benchmark = argument["subject"].get("benchmark")
    direction = argument["subject"]["direction"]
    if benchmark and direction in {"outperform", "underperform"}:
        operator = ">" if direction == "outperform" else "<"
        readable = f"{primary} 相对 {benchmark['ticker']} 收益 {operator} 0%"
    else:
        readable = settlement["condition"]
    return f"截至 {deadline_label} · 成功条件：{readable}"


def common_footer(argument: dict[str, Any], colors: dict[str, str]) -> list[str]:
    line = settlement_line(argument)
    parts: list[str] = []
    if line:
        parts.extend(
            [
                rect(56, 608, 1088, 96, colors["black"], radius=7),
                rect(56, 608, 8, 96, colors["yellow"], radius=7),
                text_block(84, 640, "可结算观点", 16, 1, 14, 16, colors["yellow"], 700),
                text_block(84, 674, line, 82, 2, 18, 23, "#FFFFFF", 600),
            ]
        )
    else:
        parts.extend(
            [
                f'<line x1="56" y1="624" x2="1144" y2="624" stroke="{colors["line"]}" stroke-width="1"/>',
                text_block(56, 657, "观点仍在形成中，按可观察条件继续验证。", 70, 2, 17, 22, colors["muted"], 500),
            ]
        )
    parts.extend(
        [
            text_block(56, 738, "Cuebook", 20, 1, 20, 22, colors["muted"], 700),
            text_block(1144, 738, "观点有来源 · 推演有状态 · 到期可验证", 44, 1, 13, 16, colors["muted"], 500, "end"),
            "</svg>",
        ]
    )
    return parts


def node_card(node: dict[str, Any], x: float, y: float, width: float, height: float, colors: dict[str, str], order: int | None = None) -> str:
    status_label, accent_key, soft_key = STATUS_META[node["status"]]
    accent, soft = colors[accent_key], colors[soft_key]
    parts = [
        rect(x, y, width, height, colors["surface"], colors["line"], 7),
        rect(x, y, 7, height, accent, radius=7),
        text_block(x + 24, y + 31, KIND_LABELS[node["kind"]], 14, 1, 13, 15, accent, 700),
        pill(x + width - 98, y + 13, status_label, soft, accent, 82),
        text_block(x + 24, y + 73, node["label"], max(14, int((width - 64) * 2 / 20)), 3, 20, 27, colors["ink"], 700),
    ]
    if order is not None:
        parts.append(text_block(x + width - 20, y + height - 18, f"0{order}", 4, 1, 12, 14, colors["muted"], 650, "end"))
    return "".join(parts)


def render_causal_chain(argument: dict[str, Any], colors: dict[str, str]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    nodes = argument["graph"]["nodes"]
    main = [node for node in nodes if node["kind"] not in {"countercase", "invalidation", "settlement", "condition"}]
    main = topological_nodes(argument, main)[:4]
    if len(main) < 3:
        raise RuntimeError("causal_chain requires at least three renderable path nodes.")
    challenge = [node for node in nodes if node["kind"] in {"countercase", "invalidation", "condition"}][:1]
    gap = 28
    width = (1088 - gap * (len(main) - 1)) / len(main)
    y, height = 260, 174
    parts: list[str] = []
    for index, node in enumerate(main):
        x = 56 + index * (width + gap)
        if index:
            previous_x = 56 + (index - 1) * (width + gap)
            parts.append(
                f'<line x1="{previous_x + width + 5:.1f}" y1="{y + 87}" x2="{x - 7:.1f}" y2="{y + 87}" '
                f'stroke="{colors["muted"]}" stroke-width="2" marker-end="url(#arrow)"/>'
            )
        parts.append(node_card(node, x, y, width, height, colors, index + 1))

    if challenge:
        node = challenge[0]
        target_id = next(
            (
                edge["to"]
                for edge in argument["graph"]["edges"]
                if edge["from"] == node["id"] and edge["relation"] in {"challenges", "conditions"}
            ),
            main[-1]["id"],
        )
        target_index = next((index for index, item in enumerate(main) if item["id"] == target_id), len(main) - 1)
        target_x = 56 + target_index * (width + gap) + width / 2
        challenge_x, challenge_width = 584, 560
        parts.extend(
            [
                f'<path d="M {challenge_x + challenge_width / 2:.1f} 466 C {challenge_x + challenge_width / 2:.1f} 446, {target_x:.1f} 452, {target_x:.1f} 438" fill="none" stroke="{colors["red"]}" stroke-width="2" stroke-dasharray="7 6" marker-end="url(#arrow-red)"/>',
                rect(challenge_x, 466, challenge_width, 110, colors["red_soft"], colors["red"], 7),
                text_block(challenge_x + 22, 494, "反例 / 失效条件", 24, 1, 13, 15, colors["red"], 750),
                text_block(challenge_x + 22, 530, node["label"], 48, 2, 18, 23, colors["ink"], 650),
            ]
        )
    used = main + challenge + [node for node in nodes if node["kind"] == "settlement"][:1]
    return parts, used, []


def render_metric_thesis(argument: dict[str, Any], colors: dict[str, str]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    metrics = argument["metrics"][:4]
    if len(metrics) < 2:
        raise RuntimeError("metric_thesis requires at least two metrics.")
    parts = [text_block(56, 248, "决定这条观点的数字", 30, 1, 14, 17, colors["cyan"], 750)]
    gap = 18
    width = (1088 - gap * (len(metrics) - 1)) / len(metrics)
    for index, metric in enumerate(metrics):
        x = 56 + index * (width + gap)
        status_label = {"verified": "已核验", "provisional": "形成中", "estimated": "估算"}[metric["status"]]
        accent = colors["green"] if metric["status"] == "verified" else colors["yellow"]
        soft = colors["green_soft"] if metric["status"] == "verified" else colors["yellow_soft"]
        parts.extend(
            [
                rect(x, 270, width, 196, colors["surface"], colors["line"], 7),
                text_block(x + 22, 304, metric["label"], max(16, int(width / 10)), 2, 15, 20, colors["muted"], 600),
                text_block(x + 22, 366, metric["display_value"], max(12, int(width / 14)), 2, 33, 38, colors["ink"], 800),
                pill(x + 22, 414, status_label, soft, accent, 76),
            ]
        )
    challenge = [node for node in argument["graph"]["nodes"] if node["kind"] in {"countercase", "invalidation"}][:1]
    if challenge:
        parts.extend(
            [
                rect(56, 494, 1088, 82, colors["red_soft"], colors["red"], 7),
                text_block(78, 524, "观点失效", 16, 1, 13, 15, colors["red"], 750),
                text_block(190, 526, challenge[0]["label"], 78, 2, 18, 23, colors["ink"], 600),
            ]
        )
    used_nodes = [node for node in argument["graph"]["nodes"] if node["kind"] in {"market_effect", "countercase", "invalidation", "settlement"}]
    return parts, used_nodes, metrics


def render_scenario_tree(argument: dict[str, Any], colors: dict[str, str]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    scenarios = argument["scenarios"][:3]
    if len(scenarios) < 2:
        raise RuntimeError("scenario_tree requires at least two scenarios.")
    root_nodes = [node for node in argument["graph"]["nodes"] if node["kind"] in {"event", "evidence", "condition"}]
    root = root_nodes[0] if root_nodes else argument["graph"]["nodes"][0]
    parts = [
        rect(376, 244, 448, 94, colors["surface"], colors["cyan"], 7),
        text_block(398, 274, "当前设置", 14, 1, 13, 15, colors["cyan"], 750),
        text_block(398, 309, root["label"], 38, 2, 19, 24, colors["ink"], 700),
    ]
    gap = 24
    width = (1088 - gap * (len(scenarios) - 1)) / len(scenarios)
    stance_meta = {
        "bull": ("上行情景", colors["green"], colors["green_soft"]),
        "base": ("基准情景", colors["cyan"], colors["cyan_soft"]),
        "bear": ("下行情景", colors["red"], colors["red_soft"]),
        "risk": ("风险情景", colors["yellow"], colors["yellow_soft"]),
    }
    for index, scenario in enumerate(scenarios):
        x = 56 + index * (width + gap)
        label, accent, soft = stance_meta[scenario["stance"]]
        center = x + width / 2
        parts.extend(
            [
                f'<line x1="600" y1="338" x2="{center:.1f}" y2="378" stroke="{colors["line"]}" stroke-width="2" marker-end="url(#arrow)"/>',
                rect(x, 388, width, 188, colors["surface"], accent, 7),
                pill(x + 18, 404, label, soft, accent, 88),
                text_block(x + 18, 454, scenario["condition"], max(20, int(width / 10)), 2, 16, 21, colors["muted"], 550),
                text_block(x + 18, 514, scenario["outcome"], max(20, int(width / 10)), 3, 18, 24, colors["ink"], 700),
            ]
        )
    settlement_nodes = [node for node in argument["graph"]["nodes"] if node["kind"] == "settlement"][:1]
    return parts, [root] + settlement_nodes, []


def render_evidence_balance(argument: dict[str, Any], colors: dict[str, str]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    nodes = argument["graph"]["nodes"]
    challenge = [node for node in nodes if node["kind"] in {"countercase", "invalidation"} or node["status"] == "unresolved"][:3]
    support = [node for node in nodes if node not in challenge and node["kind"] != "settlement"][:3]
    if not support or not challenge:
        raise RuntimeError("evidence_balance requires both supporting and challenging nodes.")
    parts = [
        rect(56, 250, 524, 294, colors["green_soft"], colors["green"], 7),
        rect(620, 250, 524, 294, colors["red_soft"], colors["red"], 7),
        text_block(80, 284, "支持这条观点", 22, 1, 15, 18, colors["green"], 750),
        text_block(644, 284, "反例与失效", 22, 1, 15, 18, colors["red"], 750),
    ]
    for index, node in enumerate(support):
        y = 330 + index * 66
        parts.extend([rect(80, y - 18, 10, 10, colors["green"], radius=5), text_block(106, y, node["label"], 38, 2, 17, 22, colors["ink"], 600)])
    for index, node in enumerate(challenge):
        y = 330 + index * 66
        parts.extend([rect(644, y - 18, 10, 10, colors["red"], radius=5), text_block(670, y, node["label"], 38, 2, 17, 22, colors["ink"], 600)])
    parts.extend(
        [
            rect(348, 560, 504, 42, colors["black"], radius=7),
            text_block(600, 587, argument["frame"]["thesis"], 50, 1, 15, 18, "#FFFFFF", 650, "middle"),
        ]
    )
    settlement_nodes = [node for node in nodes if node["kind"] == "settlement"][:1]
    return parts, support + challenge + settlement_nodes, []


def render_comparison(argument: dict[str, Any], colors: dict[str, str]) -> tuple[list[str], list[dict[str, Any]], list[dict[str, Any]]]:
    benchmark = argument["subject"].get("benchmark")
    if not benchmark:
        raise RuntimeError("comparison requires a named benchmark.")
    metrics = argument["metrics"][:6]
    has_pairs = any(metric["subject_ref"] == "primary" for metric in metrics) and any(metric["subject_ref"] == "benchmark" for metric in metrics)
    compares = any(edge["relation"] == "compares" for edge in argument["graph"]["edges"])
    if not has_pairs and not compares:
        raise RuntimeError("comparison requires paired metrics or an explicit compares edge.")
    primary = argument["subject"]["primary"]
    parts = [
        rect(56, 250, 524, 326, colors["surface"], colors["green"], 7),
        rect(620, 250, 524, 326, colors["surface"], colors["cyan"], 7),
        text_block(80, 292, primary["ticker"], 14, 1, 27, 30, colors["green"], 800),
        text_block(80, 324, primary["display_name"], 38, 1, 14, 17, colors["muted"], 500),
        text_block(644, 292, benchmark["ticker"], 14, 1, 27, 30, colors["cyan"], 800),
        text_block(644, 324, benchmark["display_name"], 38, 1, 14, 17, colors["muted"], 500),
    ]
    for side, x, accent in (("primary", 80, colors["green"]), ("benchmark", 644, colors["cyan"])):
        side_metrics = [metric for metric in metrics if metric["subject_ref"] == side][:3]
        if not side_metrics:
            side_metrics = [metric for metric in metrics if metric["subject_ref"] == "context"][:3]
        for index, metric in enumerate(side_metrics):
            y = 374 + index * 66
            parts.extend(
                [
                    text_block(x, y, metric["label"], 24, 1, 14, 17, colors["muted"], 550),
                    text_block(x + 430, y, metric["display_value"], 20, 1, 20, 23, accent, 800, "end"),
                    f'<line x1="{x}" y1="{y + 17}" x2="{x + 430}" y2="{y + 17}" stroke="{colors["line"]}" stroke-width="1"/>',
                ]
            )
    used_nodes = [node for node in argument["graph"]["nodes"] if node["kind"] in {"market_effect", "countercase", "settlement"}]
    return parts, used_nodes, metrics


RENDERERS = {
    "causal_chain": render_causal_chain,
    "metric_thesis": render_metric_thesis,
    "scenario_tree": render_scenario_tree,
    "evidence_balance": render_evidence_balance,
    "comparison": render_comparison,
}


def render(argument: dict[str, Any], output_dir: Path, grammar: str | None = None) -> dict[str, Any]:
    validation = ARGUMENT_VALIDATOR.validate(argument)
    if not validation["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in validation["errors"])
        raise RuntimeError(f"Invalid VisualArgumentV1: {details}")
    if argument["quality_report"]["decision"] == "blocked":
        raise RuntimeError("Blocked visual arguments cannot be rendered.")
    selected = grammar or argument["visual"]["recommended_grammar"]
    if selected == "price_timeline":
        raise RuntimeError("price_timeline must be rendered with render-cuebook-thesis-chart.")
    if selected not in GRAMMARS:
        raise RuntimeError(f"Unsupported logic-card grammar: {selected}.")
    allowed = {argument["visual"]["recommended_grammar"], *argument["visual"]["alternative_grammars"]}
    if selected not in allowed:
        raise RuntimeError(f"Grammar {selected} is not recommended or declared as an alternative.")

    theme = argument["visual"]["theme"]
    colors = PALETTES[theme]
    parts = common_open(argument, selected, colors)
    body, used_nodes, used_metrics = RENDERERS[selected](argument, colors)
    parts.extend(body)
    parts.extend(common_footer(argument, colors))
    svg = "\n".join(parts) + "\n"

    output_dir.mkdir(parents=True, exist_ok=True)
    svg_path = output_dir / "logic-card.svg"
    svg_path.write_text(svg, encoding="utf-8")
    content_hash = "sha256:" + hashlib.sha256(svg_path.read_bytes()).hexdigest()
    node_refs = dedupe(node["id"] for node in used_nodes)
    metric_refs = dedupe(metric["id"] for metric in used_metrics)
    source_refs = dedupe(node_sources(used_nodes) + [metric["source_ref"] for metric in used_metrics])
    suffix = argument["argument_id"].removeprefix("VARG_")
    manifest = {
        "schema_version": "logic-card-v1",
        "card_id": f"LOGICCARD_{suffix}_r{argument['revision']}_{selected}",
        "argument_ref": argument["argument_id"],
        "grammar": selected,
        "state": argument["state"],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "theme": theme,
        "dimensions": {"width": WIDTH, "height": HEIGHT},
        "lineage": {
            "input_argument_ref": argument["argument_id"],
            "node_refs": node_refs,
            "metric_refs": metric_refs,
            "source_refs": source_refs,
            "settlement_claim_ref": argument["settlement"]["claim_ref"],
        },
        "content": {
            "headline": argument["frame"]["headline"],
            "thesis": argument["frame"]["thesis"],
            "settlement_line": settlement_line(argument),
            "watermark": "Cuebook",
        },
        "asset": {"svg_ref": "logic-card.svg", "content_hash": content_hash},
        "quality_report": {
            "decision": argument["quality_report"]["decision"],
            "warnings": list(argument["quality_report"]["warnings"]),
            "hard_failures": list(argument["quality_report"]["hard_failures"]),
        },
    }
    result = LOGIC_VALIDATOR.validate(manifest, argument=argument, asset_root=output_dir)
    if not result["valid"]:
        details = "; ".join(f"{item['code']}: {item['message']}" for item in result["errors"])
        raise RuntimeError(f"Rendered LogicCardV1 failed validation: {details}")
    manifest_path = output_dir / "logic-card-v1.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"manifest": manifest, "manifest_path": manifest_path, "svg_path": svg_path}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("argument", type=Path)
    parser.add_argument("--grammar", choices=sorted(GRAMMARS | {"price_timeline"}))
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        argument = json.loads(args.argument.read_text(encoding="utf-8"))
        result = render(argument, args.output_dir, args.grammar)
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
