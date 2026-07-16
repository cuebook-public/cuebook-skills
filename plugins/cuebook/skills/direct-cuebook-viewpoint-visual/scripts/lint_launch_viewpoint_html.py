#!/usr/bin/env python3
"""Lint compact launch-mode Cuebook viewpoint HTML copy and role markup."""

from __future__ import annotations

import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ALLOWED_ROLES = {"claim", "evidence", "condition", "context", "brand"}
ALLOWED_ENTRY_ROLES = {"claim", "evidence", "condition"}
ALLOWED_COLOR_ROLES = {"positive", "negative", "observed", "catalyst", "conditional", "comparison", "risk"}
ALLOWED_PALETTE_STRATEGIES = {"creator_native", "thesis_native", "contrast_variant"}
ALLOWED_VISUAL_LEVELS = {"1", "2", "3", "4"}
REQUIRED_FONT_PROFILE = "cuebook-noi-v1"
ALLOWED_FONT_LICENSE_MODES = {"evaluation", "production"}
# Claim copy may include a verdict plus a compact implication. Rendered line,
# height, and collision audits remain the authoritative compactness gates.
ROLE_LIMITS = {"claim": 44, "evidence": 60, "condition": 28, "context": 18, "brand": 0}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
GRAPHIC_TAGS = {"path", "polyline", "polygon", "line", "rect", "circle", "ellipse", "use", "canvas", "img"}
NON_VISUAL_TAGS = {"head", "style", "script", "title", "template", "noscript", "meta", "link", "base", "defs", "symbol"}
BINDING_REF_PATTERN = re.compile(r"BIND_[A-Za-z0-9_:-]{4,}")
WORDMARK_ASSET = Path(__file__).resolve().parents[1] / "assets" / "cuebook-wordmark.svg"
PALETTE_REGISTRY = Path(__file__).resolve().parents[1] / "references" / "creator-palette-presets-v1.json"
REGISTERED_PALETTES = {
    item["preset_id"]
    for item in json.loads(PALETTE_REGISTRY.read_text(encoding="utf-8"))["presets"]
}
CANONICAL_WORDMARK_PATHS = re.findall(r'<path\s+d="([^"]+)"', WORDMARK_ASSET.read_text(encoding="utf-8"))


def issue(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def style_hides(style: str | None) -> bool:
    if not style:
        return False
    return bool(
        re.search(r"(?:^|;)\s*display\s*:\s*none(?:\s*!important)?\s*(?:;|$)", style, flags=re.I)
        or re.search(r"(?:^|;)\s*visibility\s*:\s*(?:hidden|collapse)(?:\s*!important)?\s*(?:;|$)", style, flags=re.I)
        or re.search(r"(?:^|;)\s*opacity\s*:\s*(?:0+(?:\.0+)?|0%)(?:\s*!important)?\s*(?:;|$)", style, flags=re.I)
    )


def hidden_css_selectors(html: str) -> tuple[set[str], set[str], set[str]]:
    classes: set[str] = set()
    ids: set[str] = set()
    tags: set[str] = set()
    for selector_block, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", html, flags=re.S):
        if not style_hides(declarations):
            continue
        for selector in selector_block.split(","):
            value = selector.strip()
            if "<" in value and ">" in value:
                value = value.rsplit(">", 1)[-1].strip()
            if re.fullmatch(r"\.[A-Za-z_][\w-]*", value):
                classes.add(value[1:])
            elif re.fullmatch(r"#[A-Za-z_][\w-]*", value):
                ids.add(value[1:])
            elif re.fullmatch(r"[A-Za-z][\w-]*", value):
                tags.add(value.lower())
    return classes, ids, tags


class LaunchParser(HTMLParser):
    def __init__(self, hidden_selectors: tuple[set[str], set[str], set[str]]) -> None:
        super().__init__()
        self.contract = False
        self.contract_count = 0
        self.wordmark = False
        self.hidden_classes, self.hidden_ids, self.hidden_tags = hidden_selectors
        self.frames: list[dict[str, Any]] = []
        self.role_parts: dict[str, list[str]] = {role: [] for role in ALLOWED_ROLES}
        self.unscoped: list[str] = []
        self.unknown_roles: set[str] = set()
        self.role_groups = 0
        self.claim_break = False
        self.entry_role: str | None = None
        self.color_system: str | None = None
        self.palette_family: str | None = None
        self.palette_strategy: str | None = None
        self.palette_preset: str | None = None
        self.font_profile: str | None = None
        self.font_license_mode: str | None = None
        self.font_manifest_ref: str | None = None
        self.group_levels: list[tuple[str, str | None]] = []
        self.color_roles: set[str] = set()
        self.unknown_color_roles: set[str] = set()
        self.binding_records: list[dict[str, Any]] = []
        self.logic_records: list[dict[str, Any]] = []

    def locally_hidden(self, tag: str, values: dict[str, str | None]) -> bool:
        classes = set(str(values.get("class") or "").split())
        return bool(
            tag in NON_VISUAL_TAGS
            or tag in self.hidden_tags
            or "hidden" in values
            or "inert" in values
            or str(values.get("aria-hidden") or "").lower() == "true"
            or (tag == "input" and str(values.get("type") or "").lower() == "hidden")
            or style_hides(values.get("style"))
            or bool(classes.intersection(self.hidden_classes))
            or values.get("id") in self.hidden_ids
        )

    def add_record(self, values: dict[str, str | None], frame: dict[str, Any]) -> None:
        binding_ref = values.get("data-binding-ref")
        binding_display = values.get("data-binding-display")
        has_graphic = frame["tag"] in GRAPHIC_TAGS or binding_display == "geometry"
        if binding_ref is not None:
            record = {
                "ref": str(binding_ref),
                "tag": frame["tag"],
                "in_contract": frame["in_contract"],
                "hidden": frame["hidden"],
                "relevant": frame["effective_role"] in ALLOWED_ROLES - {"brand"} or bool(frame["effective_logic_step"]),
                "has_text": False,
                "has_graphic": has_graphic,
                "display": binding_display,
            }
            self.binding_records.append(record)
            frame["binding_record"] = len(self.binding_records) - 1
        logic_step = values.get("data-logic-step-id")
        if logic_step is not None:
            record = {
                "step_id": str(logic_step),
                "in_contract": frame["in_contract"],
                "hidden": frame["hidden"],
                "has_text": False,
                "has_graphic": has_graphic,
            }
            self.logic_records.append(record)
            frame["logic_record"] = len(self.logic_records) - 1

    def mark_graphic_ancestors(self, frame: dict[str, Any]) -> None:
        if frame["hidden"] or frame["tag"] not in GRAPHIC_TAGS:
            return
        for ancestor in [*self.frames, frame]:
            binding_index = ancestor.get("binding_record")
            if binding_index is not None:
                self.binding_records[binding_index]["has_graphic"] = True
            logic_index = ancestor.get("logic_record")
            if logic_index is not None:
                self.logic_records[logic_index]["has_graphic"] = True

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        parent = self.frames[-1] if self.frames else None
        is_contract = values.get("data-cuebook-visual-contract") == "launch-v1"
        if is_contract:
            self.contract = True
            self.contract_count += 1
            self.entry_role = values.get("data-entry-role")
            self.color_system = values.get("data-color-system")
            self.palette_family = values.get("data-palette-family")
            self.palette_strategy = values.get("data-palette-strategy")
            self.palette_preset = values.get("data-palette-preset")
            self.font_profile = values.get("data-font-profile")
            self.font_license_mode = values.get("data-font-license-mode")
            self.font_manifest_ref = values.get("data-font-manifest-ref")
        if values.get("data-cuebook-wordmark") == "v1":
            self.wordmark = True
        explicit_role = values.get("data-role")
        effective_role = explicit_role or (parent.get("effective_role") if parent else None)
        own_logic_step = values.get("data-logic-step-id")
        effective_logic_step = own_logic_step or (parent.get("effective_logic_step") if parent else None)
        hidden = bool(parent and parent["hidden"]) or self.locally_hidden(tag, values)
        in_contract = is_contract or bool(parent and parent["in_contract"])
        frame: dict[str, Any] = {
            "tag": tag,
            "effective_role": effective_role,
            "effective_logic_step": effective_logic_step,
            "hidden": hidden,
            "in_contract": in_contract,
            "binding_record": None,
            "logic_record": None,
        }
        if explicit_role and in_contract and not hidden:
            self.role_groups += 1
            if explicit_role not in ALLOWED_ROLES:
                self.unknown_roles.add(explicit_role)
            elif explicit_role != "brand":
                self.group_levels.append((explicit_role, values.get("data-visual-level")))
        color_role = values.get("data-color-role")
        if color_role and in_contract and not hidden:
            if color_role in ALLOWED_COLOR_ROLES:
                self.color_roles.add(color_role)
            else:
                self.unknown_color_roles.add(color_role)
        if tag == "br" and effective_role == "claim" and in_contract and not hidden:
            self.claim_break = True
        self.add_record(values, frame)
        self.mark_graphic_ancestors(frame)
        if tag not in VOID_TAGS:
            self.frames.append(frame)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS and self.frames:
            self.frames.pop()

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.frames) - 1, -1, -1):
            if self.frames[index]["tag"] == tag:
                del self.frames[index:]
                return

    def handle_data(self, data: str) -> None:
        text = re.sub(r"\s+", "", data)
        if not text:
            return
        frame = self.frames[-1] if self.frames else None
        if frame and frame["hidden"]:
            return
        current_role = frame.get("effective_role") if frame else None
        if current_role in ALLOWED_ROLES:
            self.role_parts[str(current_role)].append(text)
        else:
            self.unscoped.append(text)
        for ancestor in self.frames:
            binding_index = ancestor.get("binding_record")
            if binding_index is not None:
                self.binding_records[binding_index]["has_text"] = True
            logic_index = ancestor.get("logic_record")
            if logic_index is not None:
                self.logic_records[logic_index]["has_text"] = True


def audit_html(html: str) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    parser = LaunchParser(hidden_css_selectors(html))
    parser.feed(html)
    role_text = {role: "".join(parts) for role, parts in parser.role_parts.items()}
    visible_count = sum(len(value) for value in role_text.values()) + sum(len(value) for value in parser.unscoped)
    visible_binding_refs: set[str] = set()
    for record in parser.binding_records:
        ref = record["ref"]
        valid_ref = bool(BINDING_REF_PATTERN.fullmatch(ref))
        if not valid_ref:
            errors.append(issue("BINDING_REF", f"Invalid data-binding-ref {ref!r}."))
        if record["display"] not in {None, "text", "geometry"}:
            errors.append(issue("BINDING_DISPLAY", f"Binding {ref!r} uses unsupported data-binding-display."))
        if not record["in_contract"]:
            errors.append(issue("BINDING_SCOPE", f"Binding {ref!r} must be inside the launch visual root."))
        elif record["hidden"]:
            errors.append(issue("BINDING_HIDDEN", f"Binding {ref!r} is attached to a hidden or non-rendered element."))
        elif not record["relevant"]:
            errors.append(issue("BINDING_CONTEXT", f"Binding {ref!r} must be on or inside a non-brand launch role or logic step."))
        elif not record["has_text"] and not record["has_graphic"]:
            errors.append(issue("BINDING_EMPTY", f"Binding {ref!r} must label visible text or rendered geometry."))
        elif valid_ref:
            visible_binding_refs.add(ref)
    visible_logic_step_ids = {
        record["step_id"]
        for record in parser.logic_records
        if record["in_contract"]
        and not record["hidden"]
        and (record["has_text"] or record["has_graphic"])
        and re.fullmatch(r"LSTEP_[A-Za-z0-9_:-]{3,}", record["step_id"])
    }
    wordmark_match = re.search(
        r'<svg\b(?=[^>]*\bdata-cuebook-wordmark=["\']v1["\'])[^>]*>(.*?)</svg>',
        html,
        flags=re.I | re.S,
    )

    if not parser.contract:
        errors.append(issue("LAUNCH_CONTRACT", "Root must declare data-cuebook-visual-contract=launch-v1."))
    elif parser.contract_count != 1:
        errors.append(issue("LAUNCH_CONTRACT_COUNT", f"Exactly one launch visual root is required; found {parser.contract_count}."))
    if parser.entry_role not in ALLOWED_ENTRY_ROLES:
        errors.append(issue("ENTRY_ROLE", "Root must declare data-entry-role=claim|evidence|condition."))
    if parser.color_system != "semantic-v1":
        errors.append(issue("COLOR_SYSTEM", "Root must declare data-color-system=semantic-v1."))
    if not parser.palette_family or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+){1,5}", parser.palette_family):
        errors.append(issue("PALETTE_FAMILY", "Root must declare a lowercase hyphenated data-palette-family."))
    if parser.palette_strategy not in ALLOWED_PALETTE_STRATEGIES:
        errors.append(issue("PALETTE_STRATEGY", "Root must declare data-palette-strategy=creator_native|thesis_native|contrast_variant."))
    if parser.palette_preset not in REGISTERED_PALETTES:
        errors.append(issue("PALETTE_PRESET", "Root must declare a registered data-palette-preset."))
    elif parser.palette_family != parser.palette_preset:
        errors.append(issue("PALETTE_FAMILY_PRESET", "data-palette-family must equal data-palette-preset."))
    if parser.font_profile != REQUIRED_FONT_PROFILE:
        errors.append(issue("FONT_PROFILE", f"Root must declare data-font-profile={REQUIRED_FONT_PROFILE}."))
    if parser.font_license_mode not in ALLOWED_FONT_LICENSE_MODES:
        errors.append(issue("FONT_LICENSE_MODE", "Root must declare data-font-license-mode=evaluation|production."))
    if not parser.font_manifest_ref or not re.fullmatch(r"(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9._/-]+\.json", parser.font_manifest_ref):
        errors.append(issue("FONT_MANIFEST_REF", "Root must declare a safe artifact-local data-font-manifest-ref ending in .json."))
    if not re.search(r'["\']Cuebook Noi["\']', html):
        errors.append(issue("NOI_FONT_STACK", "Launch CSS must declare the Cuebook Noi family alias."))
    if re.search(
        r'(?:src\s*:[^;{}]*url\(\s*["\']?(?:https?:|//|data:)|<link\b[^>]*href\s*=\s*["\'](?:https?:|//|data:))',
        html,
        flags=re.I | re.S,
    ):
        errors.append(issue("FONT_NETWORK_ASSET", "Font assets must be artifact-local and network-free."))
    font_css_context = "\n".join(
        re.findall(r"@font-face\s*\{.*?\}", html, flags=re.I | re.S)
        + re.findall(r"font-family\s*:[^;{}]+", html, flags=re.I | re.S)
        + re.findall(r"<link\b[^>]*href\s*=\s*[\"'][^\"']+[\"'][^>]*>", html, flags=re.I | re.S)
    )
    if re.search(r"capsule\s+sans|\bnib\b", font_css_context, flags=re.I):
        errors.append(issue("BENCHMARK_FONT", "Robinhood brand fonts are forbidden; use the Cuebook Noi profile."))
    if parser.font_license_mode == "production" and "trial" in font_css_context.lower():
        errors.append(issue("TRIAL_FONT_RELEASE", "Production launch HTML cannot reference a Trial font family, path, or asset."))
    if not parser.wordmark:
        errors.append(issue("WORDMARK_REQUIRED", "Final visual must include the canonical data-cuebook-wordmark=v1 SVG."))
    elif not wordmark_match:
        errors.append(issue("WORDMARK_ELEMENT", "Cuebook wordmark marker must be attached to an inline SVG element."))
    elif re.findall(r'<path\s+d="([^"]+)"', wordmark_match.group(1)) != CANONICAL_WORDMARK_PATHS:
        errors.append(issue("WORDMARK_PATHS", "Cuebook wordmark paths must exactly match the canonical product asset."))
    elif len(re.findall(r'fill=["\']currentColor["\']', wordmark_match.group(1), flags=re.I)) != len(CANONICAL_WORDMARK_PATHS):
        errors.append(issue("WORDMARK_FILL", "Every canonical wordmark path must inherit currentColor."))
    if parser.wordmark and not all(re.search(pattern, html, flags=re.I) for pattern in (
        r"\.cuebook-wordmark\s*\{",
        r"right\s*:\s*41px",
        r"bottom\s*:\s*34px",
        r"width\s*:\s*136px",
        r"height\s*:\s*26px",
        r"color\s*:\s*#(?:F2F3F4|101411)",
    )):
        errors.append(issue("WORDMARK_GEOMETRY", "Canonical wordmark must use the fixed 136 x 26 bottom-right geometry on the 1244 x 528 authoring canvas."))
    if not role_text["claim"]:
        errors.append(issue("CLAIM_REQUIRED", "One visible claim role is required."))
    if parser.unknown_roles:
        errors.append(issue("UNKNOWN_ROLE", f"Unsupported visible roles: {sorted(parser.unknown_roles)}."))
    if parser.unknown_color_roles:
        errors.append(issue("UNKNOWN_COLOR_ROLE", f"Unsupported semantic color roles: {sorted(parser.unknown_color_roles)}."))
    missing_levels = [role for role, level in parser.group_levels if level is None]
    invalid_levels = [(role, level) for role, level in parser.group_levels if level is not None and level not in ALLOWED_VISUAL_LEVELS]
    valid_levels = [(role, level) for role, level in parser.group_levels if level in ALLOWED_VISUAL_LEVELS]
    if missing_levels:
        errors.append(issue("VISUAL_LEVEL_REQUIRED", f"Every non-brand visible role group needs data-visual-level: {missing_levels}."))
    if invalid_levels:
        errors.append(issue("VISUAL_LEVEL", f"Visual levels must be 1-4: {invalid_levels}."))
    level_one_roles = [role for role, level in valid_levels if level == "1"]
    if len(level_one_roles) != 1:
        errors.append(issue("VISUAL_ENTRY", f"Exactly one level-1 group is required; found {len(level_one_roles)}."))
    elif parser.entry_role and level_one_roles[0] != parser.entry_role:
        errors.append(issue("ENTRY_ROLE_MISMATCH", f"Level-1 role {level_one_roles[0]!r} does not match root entry role {parser.entry_role!r}."))
    if len({level for _, level in valid_levels}) < 2:
        errors.append(issue("HIERARCHY_DEPTH", "Use at least two distinct visual levels."))
    if any(role == "claim" and level not in {"1", "2"} for role, level in valid_levels):
        errors.append(issue("CLAIM_LEVEL", "Claim must use visual level 1 or 2."))
    if not parser.color_roles:
        errors.append(issue("COLOR_ROLE_REQUIRED", "Declare at least one semantic data-color-role."))
    elif len(parser.color_roles) > 3:
        errors.append(issue("COLOR_ROLE_LIMIT", f"Use at most three semantic color roles; found {len(parser.color_roles)}."))
    if parser.unscoped:
        errors.append(issue("UNSCOPED_TEXT", f"Visible text lacks a launch role: {parser.unscoped}."))
    if parser.claim_break:
        errors.append(issue("CLAIM_MANUAL_BREAK", "Claim copy cannot contain a manual br."))
    if role_text["brand"]:
        errors.append(issue("BRAND_TEXT", "Visible brand text is forbidden; use only the canonical SVG wordmark."))
    if role_text["claim"] and len(role_text["claim"]) > 12 and not re.search(r"text-wrap\s*:\s*balance", html, flags=re.I):
        errors.append(issue("CLAIM_BALANCE", "Long claim copy must use text-wrap: balance."))
    if parser.role_groups > 8:
        errors.append(issue("ROLE_GROUPS", f"Use at most 8 visible role groups; found {parser.role_groups}."))
    if visible_count > 120:
        errors.append(issue("VISIBLE_COPY", f"Launch visual contains {visible_count} visible characters; maximum is 120."))
    for role, limit in ROLE_LIMITS.items():
        if len(role_text[role]) > limit:
            errors.append(issue("ROLE_BUDGET", f"Role {role!r} contains {len(role_text[role])} characters; maximum is {limit}."))
    generated_copy = re.findall(r"content\s*:\s*([\"'])(?!\s*\1)(.+?)\1", html, flags=re.I | re.S)
    if generated_copy:
        errors.append(issue("GENERATED_COPY", "CSS generated text is forbidden; place factual labels in role-marked HTML."))
    numeric_copy = any(re.search(r"[0-9]", value) for value in role_text.values())
    if numeric_copy and not re.search(r"font-variant-numeric\s*:\s*tabular-nums", html, flags=re.I):
        errors.append(issue("TABULAR_NUMBERS", "Market numbers and dates require font-variant-numeric: tabular-nums."))

    return {
        "valid": not errors,
        "errors": errors,
        "stats": {
            "visible_char_count": visible_count,
            "role_groups": parser.role_groups,
            "role_char_counts": {role: len(value) for role, value in role_text.items()},
            "visual_levels": valid_levels,
            "color_roles": sorted(parser.color_roles),
            "palette_family": parser.palette_family,
            "palette_strategy": parser.palette_strategy,
            "palette_preset": parser.palette_preset,
            "font_profile": parser.font_profile,
            "font_license_mode": parser.font_license_mode,
            "font_manifest_ref": parser.font_manifest_ref,
            "visible_binding_refs": sorted(visible_binding_refs),
            "visible_logic_step_ids": sorted(visible_logic_step_ids),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", type=Path)
    args = parser.parse_args()
    try:
        result = audit_html(args.html.read_text(encoding="utf-8"))
    except OSError as exc:
        result = {"valid": False, "errors": [issue("READ", str(exc))], "stats": {}}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
