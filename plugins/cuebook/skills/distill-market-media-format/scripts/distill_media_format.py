#!/usr/bin/env python3
"""Distill MediaCorpusV1 into evidence-backed MediaFormatV1."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = "media-format.v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def short_id(prefix: str, value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def share(count: int | float, total: int | float) -> float:
    return round(float(count) / float(total), 4) if total else 0.0


def median(values: Iterable[int | float]) -> float | None:
    values = list(values)
    return round(float(statistics.median(values)), 2) if values else None


def distribution(values: Iterable[str]) -> list[dict[str, Any]]:
    values = list(values)
    counts = Counter(values)
    return [
        {"name": name, "count": count, "share": share(count, len(values))}
        for name, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]


def validate_corpus(corpus: Any) -> list[dict[str, Any]]:
    if not isinstance(corpus, dict) or corpus.get("schema_version") != "media-corpus.v1":
        raise ValueError("Expected schema_version media-corpus.v1")
    items = corpus.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("MediaCorpusV1 items must be non-empty")
    provenance = corpus.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("rights_basis") not in {"public", "authorized"}:
        raise ValueError("MediaCorpusV1 requires public or authorized provenance")
    required = {"id", "platform", "format", "sample_role", "packaging", "segments", "assets", "community", "interactions", "compliance", "metrics"}
    for index, item in enumerate(items):
        if not isinstance(item, dict) or not required.issubset(item):
            raise ValueError(f"MediaCorpusV1 item {index} is incomplete")
        if not isinstance(item["segments"], list) or not item["segments"]:
            raise ValueError(f"MediaCorpusV1 item {index} has no segments")
    return items


def dominant_target(items: list[dict[str, Any]]) -> tuple[str, str, list[dict[str, Any]]]:
    counts = Counter((item["platform"], item["format"]) for item in items)
    (platform, media_format), _ = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[0]
    selected = [item for item in items if item["platform"] == platform and item["format"] == media_format]
    return platform, media_format, selected


def confidence(count: int, item_share: float) -> str:
    if count >= 5 and item_share >= 0.5:
        return "high"
    if count >= 2 and item_share >= 0.25:
        return "medium"
    return "low"


def build_unit_map(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segment_counts: Counter[str] = Counter()
    item_ids: dict[str, list[str]] = defaultdict(list)
    positions: dict[str, list[float]] = defaultdict(list)
    lengths: dict[str, list[int]] = defaultdict(list)
    for item in items:
        segments = item["segments"]
        seen_roles: set[str] = set()
        denominator = max(1, len(segments) - 1)
        for index, segment in enumerate(segments):
            role = segment["role"]
            segment_counts[role] += 1
            positions[role].append(index / denominator if len(segments) > 1 else 0.0)
            lengths[role].append(len(segment.get("text") or ""))
            if role not in seen_roles:
                item_ids[role].append(item["id"])
                seen_roles.add(role)
    entries = []
    for role, count in sorted(segment_counts.items(), key=lambda pair: (-len(item_ids[pair[0]]), pair[0])):
        item_count = len(item_ids[role])
        item_share = share(item_count, len(items))
        entries.append(
            {
                "role": role,
                "segment_count": count,
                "item_count": item_count,
                "item_share": item_share,
                "median_position": median(positions[role]) or 0.0,
                "median_characters": median(lengths[role]) or 0.0,
                "confidence": confidence(item_count, item_share),
                "evidence_item_ids": item_ids[role][:8],
            }
        )
    return entries


def edge_entries(counter: Counter[str], total: int) -> list[dict[str, Any]]:
    return [
        {"role": role, "count": count, "share": share(count, total)}
        for role, count in sorted(counter.items(), key=lambda pair: (-pair[1], pair[0]))
    ]


def build_sequence_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    openings: Counter[str] = Counter()
    endings: Counter[str] = Counter()
    paths: Counter[tuple[str, ...]] = Counter()
    evidence: dict[tuple[str, ...], list[str]] = defaultdict(list)
    for item in items:
        roles = tuple(segment["role"] for segment in item["segments"])
        openings[roles[0]] += 1
        endings[roles[-1]] += 1
        paths[roles] += 1
        if len(evidence[roles]) < 8:
            evidence[roles].append(item["id"])
    recurring = [
        {"roles": list(path), "count": count, "share": share(count, len(items)), "evidence_item_ids": evidence[path]}
        for path, count in sorted(paths.items(), key=lambda pair: (-pair[1], pair[0]))[:5]
    ]
    return {
        "openings": edge_entries(openings, len(items)),
        "endings": edge_entries(endings, len(items)),
        "recurring_paths": recurring,
    }


def field_stats(items: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values = [item["packaging"].get(field) for item in items]
    present = [value for value in values if isinstance(value, str) and value.strip()]
    return {"item_count": len(present), "coverage": share(len(present), len(items)), "median_characters": median(len(value) for value in present)}


def build_packaging_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    tag_counts = [len(item["packaging"].get("tags") or []) for item in items]
    tagged = sum(count > 0 for count in tag_counts)
    return {
        "title": field_stats(items, "title"),
        "subtitle": field_stats(items, "subtitle"),
        "cover_text": field_stats(items, "cover_text"),
        "tags": {"item_count": tagged, "coverage": share(tagged, len(items)), "median_count": median(count for count in tag_counts if count)},
        "flair": field_stats(items, "flair"),
    }


def has_role(item: dict[str, Any], roles: set[str]) -> bool:
    return any(segment["role"] in roles for segment in item["segments"])


def build_evidence_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    evidence_roles = {"evidence", "valuation", "risk", "invalidation"}
    linked = sum(any(segment.get("source_urls") for segment in item["segments"]) for item in items)
    visual = sum(
        any(asset["type"] in {"chart", "screenshot", "document"} for asset in item["assets"])
        for item in items
    )
    return {
        "evidence_role_coverage": share(sum(has_role(item, evidence_roles) for item in items), len(items)),
        "source_link_coverage": share(linked, len(items)),
        "source_list_coverage": share(sum(has_role(item, {"source_list"}) for item in items), len(items)),
        "disclosure_coverage": share(sum(has_role(item, {"disclosure"}) for item in items), len(items)),
        "visual_evidence_coverage": share(visual, len(items)),
    }


def ratio_label(width: Any, height: Any) -> str | None:
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        return None
    divisor = math.gcd(width, height)
    left, right = width // divisor, height // divisor
    if left > 30 or right > 30:
        value = width / height
        common = [(1.0, "1:1"), (0.75, "3:4"), (0.5625, "9:16"), (1.7778, "16:9"), (1.3333, "4:3")]
        return min(common, key=lambda entry: abs(entry[0] - value))[1]
    return f"{left}:{right}"


def item_duration_ms(item: dict[str, Any]) -> int | None:
    durations = [asset.get("duration_ms") for asset in item["assets"] if isinstance(asset.get("duration_ms"), int)]
    ends = [segment.get("end_ms") for segment in item["segments"] if isinstance(segment.get("end_ms"), int)]
    values = durations + ends
    return max(values) if values else None


def build_media_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    type_counts: Counter[str] = Counter()
    type_items: dict[str, set[str]] = defaultdict(set)
    ratios: Counter[str] = Counter()
    timed_items = 0
    durations = []
    for item in items:
        if any(segment.get("start_ms") is not None and segment.get("end_ms") is not None for segment in item["segments"]):
            timed_items += 1
        duration = item_duration_ms(item)
        if duration is not None:
            durations.append(duration / 1000)
        for asset in item["assets"]:
            asset_type = asset["type"]
            type_counts[asset_type] += 1
            type_items[asset_type].add(item["id"])
            ratio = ratio_label(asset.get("width"), asset.get("height"))
            if ratio:
                ratios[ratio] += 1
    return {
        "asset_types": [
            {"type": asset_type, "count": count, "item_count": len(type_items[asset_type]), "item_share": share(len(type_items[asset_type]), len(items))}
            for asset_type, count in sorted(type_counts.items(), key=lambda pair: (-pair[1], pair[0]))
        ],
        "median_asset_count": median(len(item["assets"]) for item in items) or 0.0,
        "median_duration_seconds": median(durations),
        "aspect_ratios": [{"ratio": ratio, "count": count} for ratio, count in sorted(ratios.items(), key=lambda pair: (-pair[1], pair[0]))],
        "timing_coverage": share(timed_items, len(items)),
    }


def build_interaction_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    community_items = [item for item in items if item.get("community")]
    rules_items = [
        item for item in community_items
        if item["community"].get("rules_url") and item["community"].get("rules_checked_at")
    ]
    interaction_items = [item for item in items if item["interactions"]]
    all_interactions = [interaction for item in items for interaction in item["interactions"]]
    author_replies = sum(interaction.get("author_role") == "author" for interaction in all_interactions)
    terms = Counter(
        term
        for item in community_items
        for term in item["community"].get("audience_terms", [])
    )
    return {
        "community_context_coverage": share(len(community_items), len(items)),
        "community_rules_coverage": share(len(rules_items), len(items)),
        "interaction_coverage": share(len(interaction_items), len(items)),
        "median_interactions": median(len(item["interactions"]) for item in items) or 0.0,
        "author_reply_share": share(author_replies, len(all_interactions)) if all_interactions else None,
        "audience_terms": [term for term, _ in sorted(terms.items(), key=lambda pair: (-pair[1], pair[0]))[:12]],
    }


def build_compliance_map(items: list[dict[str, Any]]) -> dict[str, Any]:
    def known(field: str, unknown_values: set[str]) -> float:
        return share(sum(item["compliance"].get(field) not in unknown_values for item in items), len(items))

    disclosure_items = [item for item in items if item["compliance"].get("disclosure_segment_ids")]
    timed_disclosures = 0
    for item in disclosure_items:
        disclosure_ids = set(item["compliance"].get("disclosure_segment_ids", []))
        if any(
            segment["id"] in disclosure_ids and segment.get("start_ms") is not None and segment.get("end_ms") is not None
            for segment in item["segments"]
        ):
            timed_disclosures += 1
    return {
        "qualification_known_coverage": known("account_qualification", {"unknown"}),
        "content_class_known_coverage": known("content_class", {"unknown"}),
        "commercial_relationship_known_coverage": known("commercial_relationship", {"unknown"}),
        "ai_label_known_coverage": known("ai_label", {"unknown", "not_applicable"}),
        "identity_disclosure_known_coverage": known("identity_disclosure", {"unknown", "not_applicable"}),
        "disclosure_coverage": share(len(disclosure_items), len(items)),
        "timed_disclosure_coverage": share(timed_disclosures, len(items)),
    }


def policy_guard(platform: str) -> dict[str, Any]:
    if platform == "seeking_alpha":
        return {
            "status": "restricted",
            "recheck_before_publish": True,
            "rules": [
                {"rule_id": "sa.ai-submission", "effect": "block", "requirement": "Do not produce AI-written or AI-edited copy for submission; internal structural analysis only.", "source_url": "https://about.seekingalpha.com/article-submission-guidelines"},
                {"rule_id": "sa.sources-disclosure", "effect": "require", "requirement": "Keep sourced facts, transparent valuation assumptions, risks, and position or relationship disclosure.", "source_url": "https://about.seekingalpha.com/summary-editorial-policies"},
            ],
        }
    if platform == "reddit":
        return {
            "status": "conditional",
            "recheck_before_publish": True,
            "rules": [
                {"rule_id": "reddit.community-rules", "effect": "require", "requirement": "Check the named subreddit's current rules, allowed sources, flair, and self-promotion policy.", "source_url": "https://redditinc.com/policies/reddit-rules"},
                {"rule_id": "reddit.no-manipulation", "effect": "block", "requirement": "Do not mass-post, coordinate votes, farm karma, or conceal a promotional relationship.", "source_url": "https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam"},
            ],
        }
    if platform == "xiaohongshu":
        return {
            "status": "conditional",
            "recheck_before_publish": True,
            "rules": [
                {"rule_id": "xhs.finance-qualification", "effect": "require", "requirement": "Check finance-account qualification, content identity, and commercial relationship before professional analysis or marketing.", "source_url": "https://ad.xiaohongshu.com/next_help/docs/195c5fe505c71b4b0335a2fe0d61d8e0"},
                {"rule_id": "xhs.no-personal-orders", "effect": "block", "requirement": "Do not provide personalized orders, sizing, leverage, or unsupported buy and sell levels.", "source_url": "https://www.nbd.com.cn/articles/2026-06-04/4417782.html"},
            ],
        }
    if platform == "douyin":
        return {
            "status": "conditional",
            "recheck_before_publish": True,
            "rules": [
                {"rule_id": "douyin.finance-qualification", "effect": "require", "requirement": "Check current finance qualification and whether the content is education, professional analysis, or marketing.", "source_url": "https://95152.douyin.com/article/5561765854302017"},
                {"rule_id": "douyin.no-personal-orders", "effect": "block", "requirement": "Do not provide personalized orders, sizing, leverage, or unsupported buy and sell levels.", "source_url": "https://95152.douyin.com/article/5561765854302017"},
            ],
        }
    return {
        "status": "open",
        "recheck_before_publish": True,
        "rules": [
            {"rule_id": "generic.live-policy-check", "effect": "require", "requirement": "Check the target publisher's current rules, rights, disclosures, and financial-content restrictions.", "source_url": ""}
        ],
    }


def safe_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "unknown"


def build_bridge(
    platform: str,
    media_format: str,
    items: list[dict[str, Any]],
    units: list[dict[str, Any]],
    sequences: dict[str, Any],
    packaging: dict[str, Any],
    evidence: dict[str, Any],
    interaction: dict[str, Any],
) -> dict[str, Any]:
    prefix = f"media.{safe_token(platform)}.{safe_token(media_format)}"
    rules: list[dict[str, Any]] = []
    all_ids = [item["id"] for item in items][:8]
    for unit in units:
        if unit["confidence"] == "low":
            continue
        position = "opening" if unit["median_position"] <= 0.25 else "ending" if unit["median_position"] >= 0.75 else "middle"
        rules.append(
            {
                "rule_id": f"{prefix}.unit-{safe_token(unit['role'])}",
                "kind": "unit",
                "instruction": f"Use a {unit['role']} unit most often in the {position}; keep it as an abstract job, not copied wording.",
                "weight": unit["item_share"],
                "evidence_item_ids": unit["evidence_item_ids"],
            }
        )
    for index, path in enumerate(sequences["recurring_paths"][:3], start=1):
        if path["count"] < 2:
            continue
        rules.append(
            {
                "rule_id": f"{prefix}.sequence-{index}",
                "kind": "sequence",
                "instruction": "Order unit jobs as " + " -> ".join(path["roles"]) + "; change the wording and examples.",
                "weight": path["share"],
                "evidence_item_ids": path["evidence_item_ids"],
            }
        )
    for field in ("title", "subtitle", "cover_text", "flair"):
        stats = packaging[field]
        if stats["coverage"] >= 0.5:
            rules.append(
                {
                    "rule_id": f"{prefix}.package-{safe_token(field)}",
                    "kind": "packaging",
                    "instruction": f"Include {field.replace('_', ' ')} as a distinct packaging field; do not reuse sample phrasing.",
                    "weight": stats["coverage"],
                    "evidence_item_ids": all_ids,
                }
            )
    if evidence["source_link_coverage"] >= 0.25 or evidence["source_list_coverage"] >= 0.25:
        rules.append(
            {
                "rule_id": f"{prefix}.evidence-placement",
                "kind": "evidence",
                "instruction": "Reserve an explicit source placement and bind every material claim to the renderer fact ledger.",
                "weight": max(evidence["source_link_coverage"], evidence["source_list_coverage"]),
                "evidence_item_ids": all_ids,
            }
        )
    if interaction["interaction_coverage"] >= 0.25:
        rules.append(
            {
                "rule_id": f"{prefix}.interaction-followup",
                "kind": "interaction",
                "instruction": "Plan for substantive counterquestions, corrections, and author updates without engagement bait.",
                "weight": interaction["interaction_coverage"],
                "evidence_item_ids": all_ids,
            }
        )
    rules.append(
        {
            "rule_id": f"{prefix}.constraint-originality",
            "kind": "constraint",
            "instruction": "Use only abstract structure; do not copy signature phrases, identity cues, or source assets.",
            "weight": 1.0,
            "evidence_item_ids": all_ids,
        }
    )
    return {"taxonomy_version": "media-bridge-v1", "rules": rules}


def quality_gate(
    items: list[dict[str, Any]],
    all_items: list[dict[str, Any]],
    media_format: str,
    media: dict[str, Any],
    interaction: dict[str, Any],
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def add(name: str, status: str, value: float, threshold: str, detail: str) -> None:
        checks.append({"name": name, "status": status, "value": round(value, 4), "threshold": threshold, "detail": detail})

    add("sample_size", "pass" if len(items) >= 8 else "caution", len(items), ">= 8 for stable format claims", "Small samples remain provisional." if len(items) < 8 else "Sample supports recurrence checks.")
    concentration = share(len(items), len(all_items))
    add("target_concentration", "pass" if concentration >= 0.8 else "caution", concentration, ">= 0.80", "Split mixed platform and format samples." if concentration < 0.8 else "Dominant pair is sufficiently concentrated.")
    structural = share(sum(len({segment["role"] for segment in item["segments"]}) >= 2 for item in items), len(items))
    add("structural_coverage", "pass" if structural >= 0.75 else "caution", structural, ">= 0.75 with two or more unit roles", "More granular sections, cards, or beats are needed." if structural < 0.75 else "Most items preserve meaningful unit boundaries.")
    roles = {item["sample_role"] for item in items}
    balanced = bool(roles & {"baseline", "recent"}) and "high_attention" in roles
    add("sample_frame", "pass" if balanced else "caution", 1.0 if balanced else 0.0, "ordinary plus high_attention", "Do not infer performance from a one-sided sample." if not balanced else "Sample includes ordinary and high-attention material.")
    if media_format in {"image_note", "short_video", "long_video", "podcast"}:
        asset_coverage = share(sum(bool(item["assets"]) for item in items), len(items))
        add("asset_coverage", "pass" if asset_coverage >= 0.75 else "caution", asset_coverage, ">= 0.75", "Visual or audio format lacks asset manifests." if asset_coverage < 0.75 else "Asset structure is broadly represented.")
    if media_format in {"short_video", "long_video", "podcast"}:
        add("timing_coverage", "pass" if media["timing_coverage"] >= 0.75 else "caution", media["timing_coverage"], ">= 0.75", "Timed beats are incomplete." if media["timing_coverage"] < 0.75 else "Most items preserve timing.")
    if media_format in {"community_post", "community_comment"}:
        add("community_rules", "pass" if interaction["community_rules_coverage"] >= 0.75 else "caution", interaction["community_rules_coverage"], ">= 0.75", "Community rules and check times are incomplete." if interaction["community_rules_coverage"] < 0.75 else "Community rules are represented.")
    status = "caution" if any(check["status"] == "caution" for check in checks) else "pass"
    score = max(0, 100 - 12 * sum(check["status"] == "caution" for check in checks))
    reasons = [check["detail"] for check in checks if check["status"] != "pass"]
    return {"status": status, "score": score, "reasons": reasons, "checks": checks}


def distill(corpus: dict[str, Any]) -> dict[str, Any]:
    all_items = validate_corpus(corpus)
    platform, media_format, items = dominant_target(all_items)
    units = build_unit_map(items)
    sequences = build_sequence_map(items)
    packaging = build_packaging_map(items)
    evidence = build_evidence_map(items)
    media = build_media_map(items)
    interaction = build_interaction_map(items)
    compliance = build_compliance_map(items)
    metrics_coverage = share(sum(item["metrics"].get("available") is True for item in items), len(items))
    roles = {item["sample_role"] for item in items}
    performance_allowed = len(items) >= 8 and metrics_coverage >= 0.8 and bool(roles & {"baseline", "recent"}) and "high_attention" in roles
    structural_coverage = share(sum(len({segment["role"] for segment in item["segments"]}) >= 2 for item in items), len(items))
    asset_coverage = share(sum(bool(item["assets"]) for item in items), len(items))
    interaction_coverage = share(sum(bool(item["interactions"]) for item in items), len(items))
    generated_at = now_iso()
    result = {
        "schema_version": SCHEMA_VERSION,
        "format_id": short_id("media_format", [corpus.get("corpus_id"), platform, media_format, [entry["role"] for entry in units]]),
        "generated_at": generated_at,
        "target": {"platform": platform, "format": media_format},
        "corpus_summary": {
            "corpus_id": corpus.get("corpus_id") or "unknown",
            "items_total": len(all_items),
            "items_analyzed": len(items),
            "target_concentration": share(len(items), len(all_items)),
            "platform_distribution": distribution(item["platform"] for item in all_items),
            "format_distribution": distribution(item["format"] for item in all_items),
            "sample_role_distribution": distribution(item["sample_role"] for item in items),
            "structural_coverage": structural_coverage,
            "asset_coverage": asset_coverage,
            "interaction_coverage": interaction_coverage,
            "metrics_coverage": metrics_coverage,
            "performance_inference_allowed": performance_allowed,
        },
        "quality_gate": quality_gate(items, all_items, media_format, media, interaction),
        "unit_map": units,
        "sequence_map": sequences,
        "packaging_map": packaging,
        "evidence_map": evidence,
        "media_map": media,
        "interaction_map": interaction,
        "compliance_map": compliance,
        "policy_guard": policy_guard(platform),
        "cuebook_bridge": build_bridge(platform, media_format, items, units, sequences, packaging, evidence, interaction),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Distill MediaCorpusV1 into MediaFormatV1")
    parser.add_argument("corpus", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    corpus = json.loads(args.corpus.read_text(encoding="utf-8"))
    result = distill(corpus)
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        sys.stdout.write(encoded)


if __name__ == "__main__":
    main()
