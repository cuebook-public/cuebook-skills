#!/usr/bin/env python3
"""Normalize public or authorized media records into MediaCorpusV1."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


SCHEMA_VERSION = "media-corpus.v1"
NORMALIZER_VERSION = "1.0.0"
FORMATS = {
    "long_form_article",
    "community_post",
    "community_comment",
    "image_note",
    "short_video",
    "long_video",
    "podcast",
    "other",
}
ROLES = {
    "title",
    "dek",
    "thesis",
    "evidence",
    "analysis",
    "valuation",
    "risk",
    "invalidation",
    "conclusion",
    "cover",
    "card",
    "caption",
    "body",
    "question",
    "reply",
    "edit",
    "hook",
    "voiceover",
    "on_screen_text",
    "shot",
    "cta",
    "disclosure",
    "source_list",
    "other",
}
ASSET_TYPES = {"image", "video", "audio", "chart", "screenshot", "document", "other"}
RIGHTS = {"owned", "licensed", "public-domain", "permission", "unknown", "not-reusable"}
SAMPLE_ROLES = {"baseline", "recent", "high_attention", "other", "unknown"}
AUTHOR_ROLES = {"author", "community", "moderator", "unknown"}
QUALIFICATIONS = {"verified", "declared", "unknown", "not_applicable"}
CONTENT_CLASSES = {"market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice", "unknown"}
RELATIONSHIPS = {"disclosed", "none", "unknown"}
PRESENCE = {"present", "absent", "unknown", "not_applicable"}
METRIC_NAMES = ("likes", "comments", "replies", "shares", "bookmarks", "views", "upvotes", "downvotes")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def short_id(prefix: str, value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n")).strip()
    return text or None


def clean_string(value: Any) -> str | None:
    text = clean_text(value)
    return " ".join(text.split()) if text else None


def string_list(value: Any) -> list[str]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    result: list[str] = []
    for entry in values:
        text = clean_string(entry)
        if text and text not in result:
            result.append(text)
    return result


def number(value: Any, integer: bool = False) -> int | float | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        parsed = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return int(parsed) if integer else parsed


def iso_datetime(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_url(value: Any) -> str | None:
    text = clean_string(value)
    if not text:
        return None
    try:
        parts = urlsplit(text)
    except ValueError:
        return None
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        return None
    host = parts.hostname.lower()
    port = f":{parts.port}" if parts.port else ""
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    return urlunsplit((parts.scheme.lower(), host + port, path, parts.query, ""))


def first(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def load_records(path: Path) -> tuple[list[dict[str, Any]], str, str]:
    raw = path.read_bytes()
    file_hash = digest_bytes(raw)
    suffix = path.suffix.lower()
    records: list[Any]
    if suffix == ".jsonl":
        records = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
        file_format = "jsonl"
    elif suffix == ".json":
        payload = json.loads(raw.decode("utf-8"))
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
            records = payload["items"]
        elif isinstance(payload, dict) and isinstance(payload.get("records"), list):
            records = payload["records"]
        elif isinstance(payload, dict):
            records = [payload]
        else:
            raise ValueError(f"Unsupported JSON root in {path}")
        file_format = "json"
    else:
        raise ValueError(f"Unsupported input format for {path}; use JSON or JSONL")
    if any(not isinstance(record, dict) for record in records):
        raise ValueError(f"Every record in {path} must be an object")
    return records, file_format, file_hash


def normalize_asset(raw: Any, item_key: str, index: int) -> dict[str, Any] | None:
    if isinstance(raw, str):
        raw = {"url": raw}
    if not isinstance(raw, dict):
        return None
    asset_type = clean_string(first(raw, "type", "asset_type")) or "other"
    if asset_type not in ASSET_TYPES:
        asset_type = "other"
    url = canonical_url(first(raw, "url", "source_url"))
    local_path = clean_string(first(raw, "local_path", "path"))
    rights = clean_string(first(raw, "rights_status", "rights")) or "unknown"
    if rights not in RIGHTS:
        rights = "unknown"
    seed = first(raw, "id", "external_id") or [item_key, index, asset_type, url, local_path]
    return {
        "id": short_id("asset", seed),
        "type": asset_type,
        "url": url,
        "local_path": local_path,
        "mime_type": clean_string(raw.get("mime_type")),
        "width": number(raw.get("width"), integer=True),
        "height": number(raw.get("height"), integer=True),
        "duration_ms": number(first(raw, "duration_ms", "duration"), integer=True),
        "rights_status": rights,
        "ocr_text": clean_text(first(raw, "ocr_text", "ocr")),
        "transcript": clean_text(raw.get("transcript")),
    }


def fallback_segment(record: dict[str, Any], media_format: str) -> dict[str, Any] | None:
    choices = (
        ("body", first(record, "body", "text", "content")),
        ("caption", record.get("caption")),
        ("voiceover", record.get("transcript")),
        ("on_screen_text", first(record, "ocr_text", "ocr")),
    )
    for role, value in choices:
        text = clean_text(value)
        if text:
            if media_format in {"short_video", "long_video", "podcast"} and role == "body":
                role = "voiceover"
            return {"role": role, "text": text}
    return None


def normalize_segment(raw: Any, item_key: str, index: int, asset_ids: set[str]) -> dict[str, Any] | None:
    if isinstance(raw, str):
        raw = {"text": raw, "role": "body"}
    if not isinstance(raw, dict):
        return None
    role = clean_string(first(raw, "role", "type")) or "other"
    if role not in ROLES:
        role = "other"
    text = clean_text(first(raw, "text", "body", "content"))
    linked_assets = [value for value in string_list(first(raw, "asset_ids", "assets")) if value in asset_ids]
    if not text and not linked_assets:
        return None
    start_ms = number(first(raw, "start_ms", "start"), integer=True)
    end_ms = number(first(raw, "end_ms", "end"), integer=True)
    if start_ms is not None and end_ms is not None and end_ms < start_ms:
        start_ms, end_ms = end_ms, start_ms
    source_urls = []
    for value in string_list(first(raw, "source_urls", "sources", "citations")):
        url = canonical_url(value)
        if url and url not in source_urls:
            source_urls.append(url)
    seed = first(raw, "id", "external_id") or [item_key, index, role, text, linked_assets, start_ms, end_ms]
    return {
        "id": short_id("segment", seed),
        "index": index,
        "role": role,
        "text": text,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "asset_ids": linked_assets,
        "source_urls": source_urls,
    }


def normalize_interaction(raw: Any, item_key: str, index: int) -> dict[str, Any] | None:
    if isinstance(raw, str):
        raw = {"text": raw}
    if not isinstance(raw, dict):
        return None
    text = clean_text(first(raw, "text", "body", "content"))
    if not text:
        return None
    author_role = clean_string(first(raw, "author_role", "role")) or "unknown"
    if author_role not in AUTHOR_ROLES:
        author_role = "unknown"
    raw_id = clean_string(first(raw, "id", "external_id"))
    interaction_id = short_id("interaction", raw_id or [item_key, index, text])
    parent = clean_string(first(raw, "parent_id", "parent"))
    return {
        "id": interaction_id,
        "parent_id": parent,
        "author_role": author_role,
        "text": text,
        "score": number(first(raw, "score", "likes", "upvotes")),
        "created_at": iso_datetime(first(raw, "created_at", "published_at", "timestamp")),
    }


def normalize_metrics(raw: Any, observed_at: Any) -> dict[str, Any]:
    values: dict[str, int | float] = {}
    source = raw if isinstance(raw, dict) else {}
    nested = source.get("values") if isinstance(source.get("values"), dict) else source
    for key, value in nested.items():
        name = re.sub(r"[^a-z0-9_]+", "_", str(key).strip().lower()).strip("_")
        parsed = number(value)
        if name and re.match(r"^[a-z]", name) and parsed is not None:
            values[name] = parsed
    return {
        "available": bool(values),
        "observed_at": iso_datetime(first(source, "observed_at", "as_of") or observed_at),
        "values": values,
        "missing": [name for name in METRIC_NAMES if name not in values],
    }


def enum_value(value: Any, allowed: set[str], default: str) -> str:
    if isinstance(value, bool) and allowed == PRESENCE:
        return "present" if value else "absent"
    text = (clean_string(value) or default).lower()
    return text if text in allowed else default


def normalize_record(
    record: dict[str, Any],
    *,
    source_file: Path,
    source_hash: str,
    source_index: int,
    source_label: str,
    rights_basis: str,
) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    platform = (clean_string(first(record, "platform", "channel", "site")) or "unknown").lower()
    media_format = (clean_string(first(record, "format", "content_type", "media_type")) or "other").lower()
    if media_format not in FORMATS:
        warnings.append(f"record {source_index}: unsupported format {media_format!r}; stored as other")
        media_format = "other"
    external_id = clean_string(first(record, "external_id", "post_id", "id"))
    url = canonical_url(first(record, "url", "canonical_url", "source_url"))
    title = clean_text(first(record, "title", "headline"))
    seed = external_id or url or [platform, media_format, title, first(record, "body", "text", "transcript", "caption")]
    item_id = short_id("media_item", seed)

    assets = [
        asset
        for index, raw in enumerate(record.get("assets") if isinstance(record.get("assets"), list) else [])
        if (asset := normalize_asset(raw, item_id, index)) is not None
    ]
    asset_ids = {asset["id"] for asset in assets}
    raw_segments = record.get("segments") if isinstance(record.get("segments"), list) else []
    if not raw_segments:
        fallback = fallback_segment(record, media_format)
        raw_segments = [fallback] if fallback else []
        if fallback:
            warnings.append(f"record {source_index}: derived one coarse segment from supplied text")
    segments = [
        segment
        for index, raw in enumerate(raw_segments)
        if (segment := normalize_segment(raw, item_id, index, asset_ids)) is not None
    ]
    if not segments:
        warnings.append(f"record {source_index}: skipped because it has no text or linked media segment")
        return None, warnings
    for index, segment in enumerate(segments):
        segment["index"] = index

    raw_community = record.get("community") if isinstance(record.get("community"), dict) else None
    community = None
    if raw_community or media_format in {"community_post", "community_comment"}:
        source = raw_community or {}
        name = clean_string(first(source, "name", "subreddit", "community"))
        if name:
            community = {
                "name": name,
                "flair": clean_string(first(source, "flair", "tag")),
                "rules_url": canonical_url(first(source, "rules_url", "rules")),
                "rules_checked_at": iso_datetime(first(source, "rules_checked_at", "checked_at")),
                "op_intent": clean_text(first(source, "op_intent", "intent", "question")),
                "audience_terms": string_list(first(source, "audience_terms", "terms", "vocabulary")),
            }
        else:
            warnings.append(f"record {source_index}: community item lacks community name")

    interactions = [
        interaction
        for index, raw in enumerate(record.get("interactions") if isinstance(record.get("interactions"), list) else record.get("comments") if isinstance(record.get("comments"), list) else [])
        if (interaction := normalize_interaction(raw, item_id, index)) is not None
    ]
    compliance_raw = record.get("compliance") if isinstance(record.get("compliance"), dict) else {}
    disclosure_segment_ids = [segment["id"] for segment in segments if segment["role"] == "disclosure"]
    compliance = {
        "account_qualification": enum_value(first(compliance_raw, "account_qualification", "qualification") or record.get("account_qualification"), QUALIFICATIONS, "unknown"),
        "content_class": enum_value(first(compliance_raw, "content_class", "classification") or record.get("content_class"), CONTENT_CLASSES, "unknown"),
        "commercial_relationship": enum_value(first(compliance_raw, "commercial_relationship", "relationship") or record.get("commercial_relationship"), RELATIONSHIPS, "unknown"),
        "ai_label": enum_value(first(compliance_raw, "ai_label", "ai_assistance_label") or record.get("ai_label"), PRESENCE, "unknown"),
        "identity_disclosure": enum_value(first(compliance_raw, "identity_disclosure", "professional_identity") or record.get("identity_disclosure"), PRESENCE, "unknown"),
        "disclosure_segment_ids": disclosure_segment_ids,
    }
    metrics = normalize_metrics(record.get("metrics"), first(record, "metrics_observed_at", "observed_at", "as_of"))
    created_at = iso_datetime(first(record, "created_at", "published_at", "timestamp"))
    observed_at = iso_datetime(first(record, "observed_at", "collected_at", "as_of"))
    sample_role = (clean_string(record.get("sample_role")) or "unknown").lower()
    if sample_role not in SAMPLE_ROLES:
        sample_role = "unknown"

    if assets and any(asset["rights_status"] == "unknown" for asset in assets):
        warnings.append(f"record {source_index}: one or more asset reuse rights are unknown")
    if media_format in {"short_video", "long_video", "podcast"} and not any(
        segment["start_ms"] is not None and segment["end_ms"] is not None for segment in segments
    ):
        warnings.append(f"record {source_index}: timed media lacks segment timing")
    if community and (not community["rules_url"] or not community["rules_checked_at"]):
        warnings.append(f"record {source_index}: community rules snapshot is incomplete")

    source_record = {
        "source_label": source_label,
        "source_file": str(source_file),
        "source_file_sha256": source_hash,
        "source_record_index": source_index,
        "source_record_id": external_id,
        "source_url": url,
    }
    author_raw = record.get("author") if isinstance(record.get("author"), dict) else {}
    item = {
        "id": item_id,
        "external_id": external_id,
        "platform": platform,
        "format": media_format,
        "sample_role": sample_role,
        "author": {
            "name": clean_string(first(author_raw, "name", "display_name") or record.get("author_name")),
            "handle": clean_string(first(author_raw, "handle", "username") or record.get("author_handle")),
        },
        "packaging": {
            "title": title,
            "subtitle": clean_text(first(record, "subtitle", "dek")),
            "cover_text": clean_text(first(record, "cover_text", "cover")),
            "tags": string_list(first(record, "tags", "hashtags")),
            "flair": clean_string(first(record, "flair", "tag")),
        },
        "created_at": created_at,
        "observed_at": observed_at,
        "url": url,
        "language": clean_string(first(record, "language", "lang")) or "und",
        "segments": segments,
        "assets": assets,
        "community": community,
        "interactions": interactions,
        "compliance": compliance,
        "metrics": metrics,
        "provenance": {
            "rights_basis": rights_basis,
            "records": [source_record],
            "transformations": ["whitespace-normalized", "ordered-units-normalized"],
        },
    }
    return item, warnings


def dedupe_key(item: dict[str, Any]) -> str:
    if item["external_id"]:
        return "external:" + item["platform"] + ":" + item["external_id"]
    if item["url"]:
        return "url:" + item["url"]
    content = [(segment["role"], segment["text"], segment["asset_ids"]) for segment in item["segments"]]
    return "content:" + short_id("fingerprint", [item["platform"], item["format"], content])


def normalize(
    input_paths: Iterable[Path],
    *,
    rights_basis: str,
    source_label: str,
    sample_frame: str,
) -> dict[str, Any]:
    if rights_basis not in {"public", "authorized"}:
        raise ValueError("rights_basis must be public or authorized")
    generated_at = now_iso()
    inputs: list[dict[str, Any]] = []
    items_by_key: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    input_records = 0
    skipped = 0
    duplicates = 0

    for path in input_paths:
        records, file_format, source_hash = load_records(path)
        inputs.append({"path": str(path), "format": file_format, "sha256": source_hash, "records": len(records)})
        input_records += len(records)
        for index, record in enumerate(records):
            item, item_warnings = normalize_record(
                record,
                source_file=path,
                source_hash=source_hash,
                source_index=index,
                source_label=source_label,
                rights_basis=rights_basis,
            )
            warnings.extend(item_warnings)
            if item is None:
                skipped += 1
                continue
            key = dedupe_key(item)
            if key in items_by_key:
                duplicates += 1
                existing = items_by_key[key]
                existing["provenance"]["records"].extend(item["provenance"]["records"])
                continue
            items_by_key[key] = item

    items = list(items_by_key.values())
    if not items:
        raise ValueError("No usable media records were found")
    platforms = Counter(item["platform"] for item in items)
    formats = Counter(item["format"] for item in items)
    sample_roles = Counter(item["sample_role"] for item in items)
    created = sorted(value for item in items if (value := item["created_at"]))
    corpus_seed = [item["id"] for item in items]
    return {
        "schema_version": SCHEMA_VERSION,
        "corpus_id": short_id("media_corpus", corpus_seed),
        "generated_at": generated_at,
        "scope": {
            "platforms": sorted(platforms),
            "formats": sorted(formats),
            "sample_frame": clean_string(sample_frame) or "unspecified",
            "time_range": {"start": created[0] if created else None, "end": created[-1] if created else None},
        },
        "items": items,
        "provenance": {
            "rights_basis": rights_basis,
            "source_label": source_label,
            "inputs": inputs,
            "normalized_at": generated_at,
            "normalizer": {"name": "normalize_media_corpus.py", "version": NORMALIZER_VERSION},
        },
        "stats": {
            "input_records": input_records,
            "output_items": len(items),
            "duplicates_removed": duplicates,
            "platforms": dict(sorted(platforms.items())),
            "formats": dict(sorted(formats.items())),
            "sample_roles": dict(sorted(sample_roles.items())),
            "items_with_assets": sum(bool(item["assets"]) for item in items),
            "items_with_interactions": sum(bool(item["interactions"]) for item in items),
            "items_with_metrics": sum(item["metrics"]["available"] for item in items),
        },
        "quality": {
            "warnings": sorted(set(warnings)),
            "skipped_records": skipped,
            "duplicates_removed": duplicates,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize media records into MediaCorpusV1")
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--rights-basis", choices=("public", "authorized"), required=True)
    parser.add_argument("--source-label", required=True)
    parser.add_argument("--sample-frame", default="unspecified")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = normalize(
        args.inputs,
        rights_basis=args.rights_basis,
        source_label=args.source_label,
        sample_frame=args.sample_frame,
    )
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        sys.stdout.write(encoded)


if __name__ == "__main__":
    main()
