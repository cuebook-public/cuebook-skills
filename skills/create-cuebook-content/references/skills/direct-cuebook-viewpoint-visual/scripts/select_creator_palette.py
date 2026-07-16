#!/usr/bin/env python3
"""Select three creator- and thesis-adaptive Cuebook palette presets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REGISTRY_PATH = Path(__file__).resolve().parents[1] / "references" / "creator-palette-presets-v1.json"
STRATEGIES = ("creator_native", "thesis_native", "contrast_variant")


def _number(value: Any, default: int = 3) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 5 else default


def _range_fit(value: int, bounds: list[int]) -> float:
    low, high = bounds
    if low <= value <= high:
        return 2.0
    return max(0.0, 2.0 - min(abs(value - low), abs(value - high)))


def _slug_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value[:6] if isinstance(item, str) and item]


def derive_profile(brief: dict[str, Any]) -> dict[str, Any]:
    register = brief.get("register") if brief.get("register") in {
        "desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"
    } else "strategist"
    energy = _number(brief.get("energy"))
    conviction = _number(brief.get("conviction"))
    technicality = _number(brief.get("technicality"))
    emotionality = _number(brief.get("emotionality"))
    compression = _number(brief.get("compression"))
    contrast = "high" if energy + conviction >= 8 else "soft" if energy + conviction <= 4 else "balanced"
    if energy >= 4 and emotionality >= 3:
        chroma = "vivid"
    elif emotionality <= 2 or (energy <= 2 and emotionality <= 3):
        chroma = "restrained"
    else:
        chroma = "balanced"
    temperature = "warm" if register == "confessional" else "cool" if register in {"desk", "research_memo"} else "neutral"
    surface_bias = "dark" if register in {"meme", "cinematic"} and energy >= 4 else "light" if register in {"research_memo", "confessional"} else "mixed"
    return {
        "source": brief.get("profile_source", "voice_spec"),
        "source_ref": brief.get("profile_ref"),
        "register": register,
        "energy": energy,
        "conviction": conviction,
        "technicality": technicality,
        "emotionality": emotionality,
        "compression": compression,
        "contrast": contrast,
        "chroma": chroma,
        "neutral_temperature": temperature,
        "surface_bias": surface_bias,
        "signature_palette_id": brief.get("signature_palette_id"),
        "recent_palette_ids": _slug_list(brief.get("recent_palette_ids")),
    }


def _scores(preset: dict[str, Any], profile: dict[str, Any], brief: dict[str, Any]) -> tuple[float, float]:
    creator = 5.0 if profile["register"] in preset["register_fit"] else 0.0
    creator += _range_fit(profile["energy"], preset["energy_range"])
    creator += _range_fit(profile["technicality"], preset["technicality_range"])
    creator += _range_fit(profile["emotionality"], preset["emotionality_range"])
    creator += 1.5 if profile["contrast"] == preset["contrast"] else 0.0
    creator += 1.5 if profile["chroma"] == preset["chroma"] else 0.0
    creator += 1.0 if profile["neutral_temperature"] == preset["neutral_temperature"] else 0.0

    content_mode = brief.get("content_mode", "mechanism")
    evidence_mode = brief.get("evidence_mode", "causal_path")
    thesis = 6.0 if content_mode in preset["content_fit"] else 0.0
    thesis += 3.0 if evidence_mode in preset["evidence_fit"] else 0.0
    if brief.get("direction") in {"short", "avoid"} and preset["preset_id"] in {"event-coral", "macro-crimson"}:
        thesis += 1.0
    if preset["preset_id"] in profile["recent_palette_ids"]:
        creator -= 6.0
        thesis -= 6.0
    return creator, thesis


def _diversity(preset: dict[str, Any], chosen: list[dict[str, Any]]) -> float:
    if not chosen:
        return 0.0
    score = 0.0
    score += 1.0 if preset["surface"] not in {item["surface"] for item in chosen} else 0.0
    score += 0.75 if preset["neutral_temperature"] not in {item["neutral_temperature"] for item in chosen} else 0.0
    score += 0.75 if preset["chroma"] not in {item["chroma"] for item in chosen} else 0.0
    score += 0.5 if preset["contrast"] not in {item["contrast"] for item in chosen} else 0.0
    return score


def _credible_contrast(preset: dict[str, Any], profile: dict[str, Any]) -> bool:
    if profile["chroma"] == "restrained" and preset["chroma"] == "vivid":
        return False
    if profile["contrast"] == "soft" and preset["contrast"] == "high":
        return False
    if profile["surface_bias"] == "light" and preset["surface"] == "dark":
        return False
    return True


def select(brief: dict[str, Any], registry: dict[str, Any] | None = None) -> dict[str, Any]:
    registry = registry or json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    presets = registry.get("presets") if isinstance(registry, dict) else None
    if not isinstance(presets, list) or len(presets) < 3:
        raise ValueError("Palette registry requires at least three presets.")
    by_id = {item["preset_id"]: item for item in presets}
    if len(by_id) != len(presets):
        raise ValueError("Palette preset IDs must be unique.")

    profile = derive_profile(brief)
    scored = {item["preset_id"]: _scores(item, profile, brief) for item in presets}
    chosen: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []

    signature = profile.get("signature_palette_id")
    if signature in by_id:
        creator_pick = by_id[str(signature)]
    else:
        creator_pick = max(presets, key=lambda item: (scored[item["preset_id"]][0], scored[item["preset_id"]][1], -presets.index(item)))
    chosen.append(creator_pick)
    creator_score, creator_thesis = scored[creator_pick["preset_id"]]
    results.append({
        "strategy": "creator_native",
        "preset_id": creator_pick["preset_id"],
        "score": round(creator_score + creator_thesis * 0.25, 2),
        "reason": "匹配人物语气、能量与信息密度" + ("，并保留其签名色" if signature == creator_pick["preset_id"] else ""),
    })

    remaining = [item for item in presets if item["preset_id"] != creator_pick["preset_id"]]
    thesis_pick = max(
        remaining,
        key=lambda item: (
            scored[item["preset_id"]][1] + scored[item["preset_id"]][0] * 0.35,
            -presets.index(item),
        ),
    )
    chosen.append(thesis_pick)
    thesis_creator, thesis_score = scored[thesis_pick["preset_id"]]
    results.append({
        "strategy": "thesis_native",
        "preset_id": thesis_pick["preset_id"],
        "score": round(thesis_score + thesis_creator * 0.25, 2),
        "reason": f"匹配 {brief.get('content_mode', 'mechanism')} 内容与 {brief.get('evidence_mode', 'causal_path')} 证据结构",
    })

    remaining = [item for item in remaining if item["preset_id"] != thesis_pick["preset_id"]]
    credible_remaining = [item for item in remaining if _credible_contrast(item, profile)]
    if credible_remaining:
        remaining = credible_remaining
    contrast_pick = max(
        remaining,
        key=lambda item: (
            (scored[item["preset_id"]][0] + scored[item["preset_id"]][1]) * 0.75 + _diversity(item, chosen),
            -presets.index(item),
        ),
    )
    contrast_creator, contrast_thesis = scored[contrast_pick["preset_id"]]
    results.append({
        "strategy": "contrast_variant",
        "preset_id": contrast_pick["preset_id"],
        "score": round((contrast_creator + contrast_thesis) * 0.75 + _diversity(contrast_pick, chosen), 2),
        "reason": "改变表面、色温或饱和度，提供可信的反差方案",
    })

    return {
        "schema_version": "creator-palette-selection-v1",
        "creator_visual_profile": profile,
        "content_mode": brief.get("content_mode", "mechanism"),
        "evidence_mode": brief.get("evidence_mode", "causal_path"),
        "direction": brief.get("direction", "explain"),
        "selections": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON palette brief")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    result = select(payload)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
