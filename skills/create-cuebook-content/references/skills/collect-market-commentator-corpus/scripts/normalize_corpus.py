#!/usr/bin/env python3
"""Normalize public or authorized exports into the CorpusV1 contract."""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit


SCHEMA_VERSION = "corpus.v1"
NORMALIZER_VERSION = "1.0.0"
CORE_METRICS = ("likes", "reposts", "replies", "views", "bookmarks", "quotes")

TEXT_FIELDS = ("text", "full_text", "content", "body", "tweet", "post", "message")
DATE_FIELDS = ("created_at", "published_at", "timestamp", "date", "time")
URL_FIELDS = ("url", "permalink", "post_url", "canonical_url")
ID_FIELDS = ("external_id", "post_id", "tweet_id", "status_id", "id")
PLATFORM_FIELDS = ("platform", "source_platform", "channel_type")

METRIC_ALIASES = {
    "likes": ("likes", "like_count", "favorite_count", "favorites", "favourites"),
    "reposts": ("reposts", "repost_count", "retweets", "retweet_count", "shares", "share_count"),
    "replies": ("replies", "reply_count", "comments", "comment_count"),
    "views": ("views", "view_count", "impressions", "impression_count"),
    "bookmarks": ("bookmarks", "bookmark_count", "saves", "save_count"),
    "quotes": ("quotes", "quote_count", "quote_tweets", "quote_tweet_count"),
}

ENTITY_ALIASES = {
    "tickers": ("tickers", "ticker", "symbols", "symbol", "cashtags", "cashtag"),
    "hashtags": ("hashtags", "hashtag", "tags"),
    "mentions": ("mentions", "mention", "user_mentions"),
    "organizations": ("organizations", "organization", "orgs", "companies"),
    "people": ("people", "persons", "person"),
    "locations": ("locations", "location", "places"),
    "other": ("other", "topics", "keywords"),
}

TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref_src",
    "spm",
}

LINK_KIND_MAP = {
    "source": "source",
    "citation": "citation",
    "cite": "citation",
    "reference": "citation",
    "media": "media",
    "image": "media",
    "video": "media",
    "external": "external",
    "url": "external",
    "link": "external",
    "other": "other",
}

PLATFORM_ALIASES = {
    "twitter": "x",
    "x.com": "x",
    "telegram": "telegram",
    "substack": "newsletter",
    "youtube": "youtube",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def first_value(mapping: dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        value = mapping.get(name)
        if value is not None and value != "":
            return value
    return None


def clean_scalar(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple, set)):
        return None
    text = unicodedata.normalize("NFC", str(value)).strip()
    return text or None


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFC", str(value or ""))
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[\t\f\v ]+", " ", line).strip() for line in text.split("\n")]
    compact: list[str] = []
    for line in lines:
        if line or not compact or compact[-1]:
            compact.append(line)
    return "\n".join(compact).strip()


def decode_structured(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped or stripped[0] not in "[{":
        return value
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return value


def list_values(value: Any) -> list[Any]:
    value = decode_structured(value)
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, (tuple, set)):
        return list(value)
    if isinstance(value, dict):
        return [value]
    text = str(value).strip()
    if not text:
        return []
    if "\n" in text or ";" in text or "|" in text or "," in text:
        return [part.strip() for part in re.split(r"[\n;,|]+", text) if part.strip()]
    return [text]


def load_records(path: Path) -> tuple[list[dict[str, Any]], str, str]:
    data = path.read_bytes()
    digest = sha256_bytes(data)
    suffix = path.suffix.lower()

    if suffix == ".jsonl":
        records: list[dict[str, Any]] = []
        for line_number, line in enumerate(data.decode("utf-8-sig").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}: invalid JSONL at line {line_number}: {exc.msg}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"{path}: JSONL line {line_number} is not an object")
            records.append(value)
        return records, "jsonl", digest

    if suffix == ".csv":
        text = data.decode("utf-8-sig")
        rows = list(csv.DictReader(text.splitlines()))
        return [dict(row) for row in rows], "csv", digest

    if suffix != ".json":
        raise ValueError(f"{path}: expected a .json, .jsonl, or .csv file")

    try:
        value = json.loads(data.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc.msg}") from exc

    if isinstance(value, list):
        records = value
    elif isinstance(value, dict):
        records = []
        for key in ("items", "posts", "tweets", "records", "data"):
            if isinstance(value.get(key), list):
                records = value[key]
                break
        if not records and value:
            raise ValueError(f"{path}: JSON object must contain items/posts/tweets/records/data")
    else:
        raise ValueError(f"{path}: JSON root must be an array or object")

    if any(not isinstance(record, dict) for record in records):
        raise ValueError(f"{path}: every record must be an object")
    return records, "json", digest


def normalize_datetime(value: Any) -> str | None:
    if value is None or value == "":
        return None
    parsed: datetime | None = None

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        try:
            parsed = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    else:
        text = str(value).strip()
        if re.fullmatch(r"\d{10}(?:\d{3})?", text):
            timestamp = float(text)
            if len(text) == 13:
                timestamp /= 1000
            try:
                parsed = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                return None
        else:
            iso_text = text[:-1] + "+00:00" if text.endswith(("Z", "z")) else text
            try:
                parsed = datetime.fromisoformat(iso_text)
            except ValueError:
                for pattern in ("%Y/%m/%d %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
                    try:
                        parsed = datetime.strptime(text, pattern)
                        break
                    except ValueError:
                        continue
            if parsed is None:
                try:
                    parsed = parsedate_to_datetime(text)
                except (TypeError, ValueError, OverflowError):
                    return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc).replace(microsecond=0)
    return parsed.isoformat().replace("+00:00", "Z")


def canonicalize_url(value: Any) -> str | None:
    raw = clean_scalar(value)
    if raw is None:
        return None
    raw = raw.strip("<>[]{}\"'")
    raw = re.sub(r"[.,;:!?，。；：！？)\]}]+$", "", raw)
    if raw.startswith("www."):
        raw = "https://" + raw
    if not re.match(r"^https?://", raw, flags=re.I):
        return None

    try:
        parts = urlsplit(raw)
        host = (parts.hostname or "").rstrip(".").lower()
        if not host:
            return None
        host = host.encode("idna").decode("ascii")
        if host.startswith("www."):
            host = host[4:]
        if host in {"twitter.com", "mobile.twitter.com"}:
            host = "x.com"
        port = parts.port
    except (UnicodeError, ValueError):
        return None

    scheme = parts.scheme.lower()
    netloc = host
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"

    path = quote(parts.path or "", safe="/%:@-._~!$&'()*+,;=")
    if path != "/":
        path = path.rstrip("/")
    query = []
    for key, item_value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_QUERY_KEYS:
            continue
        query.append((key, item_value))
    query.sort()
    return urlunsplit((scheme, netloc, path, urlencode(query, doseq=True), ""))


def domain_from_url(value: Any) -> str | None:
    url = canonicalize_url(value)
    if url is None:
        return None
    try:
        return (urlsplit(url).hostname or "").lower() or None
    except ValueError:
        return None


def extract_urls(text: str) -> list[str]:
    urls: list[str] = []
    for raw in re.findall(r"https?://[^\s<>\"']+", text, flags=re.I):
        url = canonicalize_url(raw)
        if url and url not in urls:
            urls.append(url)
    return urls


def normalize_link(value: Any, default_kind: str = "external") -> dict[str, Any] | None:
    value = decode_structured(value)
    title: str | None = None
    kind = default_kind
    if isinstance(value, dict):
        raw_url = first_value(value, ("url", "href", "link", "expanded_url", "unwound_url"))
        title = clean_scalar(first_value(value, ("title", "label", "name")))
        raw_kind = clean_scalar(first_value(value, ("kind", "type", "link_type")))
        if raw_kind:
            kind = LINK_KIND_MAP.get(raw_kind.lower(), "other")
    else:
        raw_url = value

    url = canonicalize_url(raw_url)
    domain = domain_from_url(url)
    if not url or not domain:
        return None
    normalized: dict[str, Any] = {
        "url": url,
        "domain": domain,
        "kind": LINK_KIND_MAP.get(kind.lower(), "other"),
    }
    if title:
        normalized["title"] = title
    return normalized


def merge_link(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    priority = {"source": 0, "citation": 1, "media": 2, "external": 3, "other": 4}
    result = dict(existing)
    if priority[incoming["kind"]] < priority[result["kind"]]:
        result["kind"] = incoming["kind"]
    if not result.get("title") and incoming.get("title"):
        result["title"] = incoming["title"]
    return result


def normalize_links(record: dict[str, Any], text: str, item_url: str | None) -> list[dict[str, Any]]:
    by_url: dict[str, dict[str, Any]] = {}
    fields = (
        ("links", "external"),
        ("urls", "external"),
        ("outbound_links", "external"),
        ("citations", "citation"),
        ("sources", "source"),
        ("media_links", "media"),
    )
    for field, kind in fields:
        for value in list_values(record.get(field)):
            link = normalize_link(value, kind)
            if link and link["url"] != item_url:
                by_url[link["url"]] = merge_link(by_url[link["url"]], link) if link["url"] in by_url else link
    for url in extract_urls(text):
        if url == item_url:
            continue
        link = normalize_link(url)
        if link:
            by_url[link["url"]] = merge_link(by_url[link["url"]], link) if link["url"] in by_url else link
    return list(by_url.values())


def entity_strings(value: Any) -> list[str]:
    result: list[str] = []
    for item in list_values(value):
        if isinstance(item, dict):
            item = first_value(item, ("value", "name", "text", "symbol", "tag", "handle", "username"))
        scalar = clean_scalar(item)
        if scalar:
            result.append(scalar)
    return result


def unique_strings(values: Iterable[str], transform: Any = None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = transform(value) if transform else clean_scalar(value)
        if not normalized:
            continue
        key = normalized.casefold()
        if key not in seen:
            seen.add(key)
            result.append(normalized)
    return result


def normalize_ticker(value: Any) -> str | None:
    ticker = clean_scalar(value)
    if ticker is None:
        return None
    ticker = ticker.lstrip("$").upper()
    if re.fullmatch(r"(?:[A-Z]{1,8}:)?[A-Z0-9][A-Z0-9.\-]{0,14}", ticker):
        return ticker
    return None


def normalize_hashtag(value: Any) -> str | None:
    tag = clean_scalar(value)
    return tag.strip("#") if tag and tag.strip("#") else None


def normalize_mention(value: Any) -> str | None:
    mention = clean_scalar(value)
    return mention.lstrip("@") if mention and mention.lstrip("@") else None


def normalize_entities(record: dict[str, Any], text: str) -> dict[str, list[str]]:
    collected: dict[str, list[str]] = {name: [] for name in ENTITY_ALIASES}
    nested = decode_structured(record.get("entities"))

    if isinstance(nested, dict):
        for canonical, aliases in ENTITY_ALIASES.items():
            for alias in aliases:
                collected[canonical].extend(entity_strings(nested.get(alias)))
    elif isinstance(nested, list):
        for entry in nested:
            if not isinstance(entry, dict):
                collected["other"].extend(entity_strings(entry))
                continue
            entity_type = str(first_value(entry, ("type", "kind", "entity_type")) or "other").lower()
            destination = next(
                (canonical for canonical, aliases in ENTITY_ALIASES.items() if entity_type in aliases),
                "other",
            )
            collected[destination].extend(entity_strings(entry))

    for canonical, aliases in ENTITY_ALIASES.items():
        for alias in aliases:
            collected[canonical].extend(entity_strings(record.get(alias)))

    collected["tickers"].extend(re.findall(r"(?<![\w$])\$([A-Za-z][A-Za-z0-9.\-]{0,14})", text))
    for venue, symbol in re.findall(r"\b(NASDAQ|NYSE|AMEX|HKEX|SSE|SZSE|SH|SZ):([A-Z0-9.\-]{1,15})\b", text, flags=re.I):
        collected["tickers"].append(f"{venue}:{symbol}")
    collected["hashtags"].extend(re.findall(r"(?<!\w)#([\w\u3400-\u9fff][\w\u3400-\u9fff-]{0,49})#?", text))
    collected["mentions"].extend(re.findall(r"(?<!\w)@([A-Za-z0-9_]{1,32})", text))

    return {
        "tickers": unique_strings(collected["tickers"], normalize_ticker),
        "hashtags": unique_strings(collected["hashtags"], normalize_hashtag),
        "mentions": unique_strings(collected["mentions"], normalize_mention),
        "organizations": unique_strings(collected["organizations"]),
        "people": unique_strings(collected["people"]),
        "locations": unique_strings(collected["locations"]),
        "other": unique_strings(collected["other"]),
    }


def parse_metric_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = unicodedata.normalize("NFKC", str(value)).strip().lower()
        text = text.replace(",", "").replace("，", "").replace(" ", "")
        match = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)(k|m|b|万|亿)?", text)
        if not match:
            return None
        number = float(match.group(1))
        multiplier = {
            None: 1,
            "k": 1_000,
            "m": 1_000_000,
            "b": 1_000_000_000,
            "万": 10_000,
            "亿": 100_000_000,
        }[match.group(2)]
        number *= multiplier
    if not math.isfinite(number) or number < 0:
        return None
    return int(number) if number.is_integer() else number


def snake_case(value: str) -> str | None:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value).lower()
    value = re.sub(r"[^a-z0-9]+", "_", value).strip("_")
    return value if re.fullmatch(r"[a-z][a-z0-9_]*", value or "") else None


def normalized_key_map(mapping: dict[str, Any]) -> dict[str, Any]:
    return {str(key).lower(): value for key, value in mapping.items()}


def normalize_metrics(record: dict[str, Any]) -> dict[str, Any]:
    nested: dict[str, Any] = {}
    for field in ("metrics", "public_metrics", "engagement"):
        value = decode_structured(record.get(field))
        if isinstance(value, dict):
            nested.update(value)
    nested_values = decode_structured(nested.get("values"))
    if isinstance(nested_values, dict):
        nested.update(nested_values)

    nested_lower = normalized_key_map(nested)
    record_lower = normalized_key_map(record)
    values: dict[str, int | float] = {}
    consumed_aliases: set[str] = set()
    for canonical, aliases in METRIC_ALIASES.items():
        for alias in aliases:
            consumed_aliases.add(alias.lower())
            raw = nested_lower.get(alias.lower())
            if raw is None or raw == "":
                raw = record_lower.get(alias.lower())
            parsed = parse_metric_number(raw)
            if parsed is not None:
                values[canonical] = parsed
                break

    ignored = {"available", "observed_at", "captured_at", "collected_at", "missing", "values"}
    for key, raw in nested.items():
        normalized_key = snake_case(str(key))
        if not normalized_key or normalized_key in ignored or normalized_key in consumed_aliases or normalized_key in values:
            continue
        parsed = parse_metric_number(raw)
        if parsed is not None:
            values[normalized_key] = parsed

    observed_at = normalize_datetime(
        first_value(nested, ("observed_at", "captured_at", "collected_at"))
        or first_value(record, ("metrics_observed_at", "metrics_at"))
    )
    return {
        "available": bool(values),
        "observed_at": observed_at,
        "values": values,
        "missing": [name for name in CORE_METRICS if name not in values],
    }


def normalize_author(
    record: dict[str, Any],
    default_name: str | None,
    default_handle: str | None,
) -> dict[str, str | None]:
    nested = decode_structured(record.get("author"))
    if isinstance(nested, dict):
        name = clean_scalar(first_value(nested, ("name", "display_name", "author_name")))
        handle = clean_scalar(first_value(nested, ("handle", "username", "screen_name")))
    else:
        name = clean_scalar(nested)
        handle = None
    name = name or clean_scalar(first_value(record, ("author_name", "display_name", "creator_name"))) or default_name
    handle = handle or clean_scalar(first_value(record, ("author_handle", "handle", "username", "screen_name"))) or default_handle
    if handle:
        handle = handle.lstrip("@") or None
    return {"name": name, "handle": handle}


def infer_platform(url: str | None) -> str | None:
    domain = domain_from_url(url)
    if not domain:
        return None
    if domain == "x.com":
        return "x"
    if domain in {"t.me", "telegram.me"}:
        return "telegram"
    if domain.endswith("substack.com"):
        return "newsletter"
    if domain in {"youtube.com", "youtu.be"}:
        return "youtube"
    return None


def normalize_platform(record: dict[str, Any], url: str | None, default: str | None) -> str:
    platform = clean_scalar(first_value(record, PLATFORM_FIELDS)) or default or infer_platform(url) or "unknown"
    lowered = platform.lower()
    return PLATFORM_ALIASES.get(lowered, lowered)


def normalize_content_type(record: dict[str, Any]) -> str:
    raw = (clean_scalar(first_value(record, ("content_type", "type", "record_type"))) or "post").lower()
    mapping = {
        "tweet": "post",
        "status": "post",
        "message": "post",
        "blog": "article",
        "news": "article",
        "substack": "newsletter",
        "podcast": "transcript",
        "video_transcript": "transcript",
        "reply": "comment",
    }
    normalized = mapping.get(raw, raw)
    return normalized if normalized in {"post", "article", "newsletter", "transcript", "comment", "other"} else "other"


def detect_language(text: str) -> str:
    han = len(re.findall(r"[\u3400-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if han:
        ratio = latin / max(1, han + latin)
        return "mixed" if latin >= 10 and ratio >= 0.25 else "zh"
    if latin:
        return "en"
    return "und"


def normalize_language(record: dict[str, Any], text: str) -> str:
    supplied = clean_scalar(first_value(record, ("language", "lang")))
    if not supplied:
        return detect_language(text)
    lowered = supplied.lower().replace("_", "-")
    if lowered.startswith("zh"):
        return "zh"
    if lowered.startswith("en"):
        return "en"
    return lowered


def fingerprint_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def identity_seed(item: dict[str, Any]) -> str:
    if item.get("external_id"):
        return f"external|{item['platform']}|{item['external_id']}"
    if item.get("url"):
        return f"url|{item['url']}"
    author = item["author"].get("handle") or item["author"].get("name") or ""
    return "content|{}|{}|{}|{}".format(
        item["platform"],
        author.casefold(),
        item.get("created_at") or "",
        fingerprint_text(item["text"]),
    )


def make_item_id(item: dict[str, Any]) -> str:
    return "item_" + hashlib.sha256(identity_seed(item).encode("utf-8")).hexdigest()[:16]


def dedupe_keys(item: dict[str, Any]) -> list[str]:
    keys: list[str] = []
    if item.get("external_id"):
        keys.append(f"external|{item['platform']}|{item['external_id']}")
    if item.get("url"):
        keys.append(f"url|{item['url']}")
    text_key = fingerprint_text(item["text"])
    author = item["author"].get("handle") or item["author"].get("name") or ""
    when = item.get("created_at") or ""
    if len(text_key) >= 16 and (author or when):
        keys.append(f"content|{item['platform']}|{author.casefold()}|{when}|{text_key}")
    elif len(text_key) >= 40:
        keys.append(f"content|{text_key}")
    return keys


def normalize_record(
    record: dict[str, Any],
    *,
    source_path: Path,
    source_digest: str,
    source_index: int,
    source_label: str,
    rights_basis: str,
    default_platform: str | None,
    default_author_name: str | None,
    default_author_handle: str | None,
) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    text = normalize_text(first_value(record, TEXT_FIELDS))
    if not text:
        return None, [f"{source_path.name}[{source_index}]: missing text; skipped"]

    raw_date = first_value(record, DATE_FIELDS)
    created_at = normalize_datetime(raw_date)
    if raw_date not in (None, "") and created_at is None:
        warnings.append(f"{source_path.name}[{source_index}]: invalid created_at dropped")

    external_id = clean_scalar(first_value(record, ID_FIELDS))
    url = canonicalize_url(first_value(record, URL_FIELDS))
    raw_url = first_value(record, URL_FIELDS)
    if raw_url not in (None, "") and url is None:
        warnings.append(f"{source_path.name}[{source_index}]: invalid canonical URL dropped")
    platform = normalize_platform(record, url, default_platform)
    author = normalize_author(record, default_author_name, default_author_handle)
    upstream = decode_structured(record.get("provenance"))

    source_record: dict[str, Any] = {
        "source_label": source_label,
        "source_file": source_path.name,
        "source_file_sha256": source_digest,
        "source_record_index": source_index,
        "source_record_id": external_id,
        "source_url": url,
    }
    if isinstance(upstream, dict) and upstream:
        source_record["upstream"] = upstream

    item: dict[str, Any] = {
        "id": "",
        "external_id": external_id,
        "platform": platform,
        "author": author,
        "content_type": normalize_content_type(record),
        "text": text,
        "created_at": created_at,
        "url": url,
        "language": normalize_language(record, text),
        "links": normalize_links(record, text, url),
        "entities": normalize_entities(record, text),
        "metrics": normalize_metrics(record),
        "provenance": {
            "rights_basis": rights_basis,
            "records": [source_record],
            "transformations": [
                "unicode_nfc",
                "normalized_whitespace",
                "canonical_urls",
                "structured_entities",
                "structured_metrics",
            ],
        },
    }
    item["id"] = make_item_id(item)
    return item, warnings


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, index: int) -> int:
        while self.parent[index] != index:
            self.parent[index] = self.parent[self.parent[index]]
            index = self.parent[index]
        return index

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def merge_metrics(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    values = dict(left["values"])
    for name, value in right["values"].items():
        values[name] = max(values[name], value) if name in values else value
    observed = max(filter(None, (left.get("observed_at"), right.get("observed_at"))), default=None)
    return {
        "available": bool(values),
        "observed_at": observed,
        "values": values,
        "missing": [name for name in CORE_METRICS if name not in values],
    }


def merge_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    result = copy.deepcopy(items[0])
    links = {link["url"]: dict(link) for link in result["links"]}
    for incoming in items[1:]:
        if len(incoming["text"]) > len(result["text"]):
            result["text"] = incoming["text"]
        for field in ("external_id", "created_at", "url"):
            if not result.get(field) and incoming.get(field):
                result[field] = incoming[field]
        if result["platform"] == "unknown" and incoming["platform"] != "unknown":
            result["platform"] = incoming["platform"]
        for field in ("name", "handle"):
            if not result["author"].get(field) and incoming["author"].get(field):
                result["author"][field] = incoming["author"][field]
        if result["content_type"] == "other" and incoming["content_type"] != "other":
            result["content_type"] = incoming["content_type"]
        if result["language"] == "und" and incoming["language"] != "und":
            result["language"] = incoming["language"]

        for link in incoming["links"]:
            links[link["url"]] = merge_link(links[link["url"]], link) if link["url"] in links else dict(link)
        for entity_type, values in incoming["entities"].items():
            result["entities"][entity_type] = unique_strings(result["entities"][entity_type] + values)
        result["metrics"] = merge_metrics(result["metrics"], incoming["metrics"])
        result["provenance"]["records"].extend(copy.deepcopy(incoming["provenance"]["records"]))
        result["provenance"]["transformations"].extend(incoming["provenance"]["transformations"])

    result["links"] = list(links.values())
    if len(items) > 1:
        result["provenance"]["transformations"].append("deduplicated_merge")
    result["provenance"]["transformations"] = unique_strings(result["provenance"]["transformations"])
    result["id"] = make_item_id(result)
    return result


def deduplicate(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    union_find = UnionFind(len(items))
    seen: dict[str, int] = {}
    for index, item in enumerate(items):
        for key in dedupe_keys(item):
            if key in seen:
                union_find.union(seen[key], index)
            else:
                seen[key] = index

    groups: dict[int, list[tuple[int, dict[str, Any]]]] = defaultdict(list)
    for index, item in enumerate(items):
        groups[union_find.find(index)].append((index, item))
    ordered_groups = sorted(groups.values(), key=lambda group: min(index for index, _ in group))
    merged = [merge_items([item for _, item in group]) for group in ordered_groups]
    return merged, len(items) - len(merged)


def build_subject(
    items: list[dict[str, Any]],
    subject_name: str | None,
    subject_handles: list[str] | None,
) -> dict[str, Any]:
    names = unique_strings(item["author"]["name"] for item in items if item["author"].get("name"))
    handles = unique_strings(
        [handle.lstrip("@") for handle in (subject_handles or [])]
        + [item["author"]["handle"] for item in items if item["author"].get("handle")]
    )
    platforms = unique_strings(item["platform"] for item in items)
    return {
        "name": clean_scalar(subject_name) or (names[0] if len(names) == 1 else None),
        "handles": handles,
        "platforms": platforms,
    }


def normalize_files(
    paths: list[Path],
    *,
    rights_basis: str,
    source_label: str,
    subject_name: str | None = None,
    subject_handles: list[str] | None = None,
    default_platform: str | None = None,
    default_author_name: str | None = None,
    default_author_handle: str | None = None,
) -> dict[str, Any]:
    if rights_basis not in {"public", "authorized"}:
        raise ValueError("rights_basis must be public or authorized")
    if not paths:
        raise ValueError("at least one input path is required")

    normalized: list[dict[str, Any]] = []
    input_metadata: list[dict[str, Any]] = []
    warnings: list[str] = []
    skipped = 0
    input_records = 0

    for path in paths:
        records, input_format, digest = load_records(path)
        input_metadata.append({
            "path": str(path),
            "format": input_format,
            "sha256": digest,
            "records": len(records),
        })
        input_records += len(records)
        for source_index, record in enumerate(records):
            item, item_warnings = normalize_record(
                record,
                source_path=path,
                source_digest=digest,
                source_index=source_index,
                source_label=source_label,
                rights_basis=rights_basis,
                default_platform=default_platform,
                default_author_name=default_author_name,
                default_author_handle=default_author_handle,
            )
            warnings.extend(item_warnings)
            if item is None:
                skipped += 1
            else:
                normalized.append(item)

    if not normalized:
        raise ValueError("no non-empty records could be normalized")

    items, duplicates_removed = deduplicate(normalized)
    generated_at = utc_now()
    corpus_hash = hashlib.sha256("|".join(sorted(item["id"] for item in items)).encode("utf-8")).hexdigest()[:16]
    languages = Counter(item["language"] for item in items)
    platforms = Counter(item["platform"] for item in items)

    return {
        "schema_version": SCHEMA_VERSION,
        "corpus_id": f"corpus_{corpus_hash}",
        "generated_at": generated_at,
        "subject": build_subject(items, subject_name, subject_handles),
        "items": items,
        "provenance": {
            "rights_basis": rights_basis,
            "source_label": source_label,
            "inputs": input_metadata,
            "normalized_at": generated_at,
            "normalizer": {"name": "normalize_corpus.py", "version": NORMALIZER_VERSION},
        },
        "stats": {
            "input_records": input_records,
            "output_items": len(items),
            "duplicates_removed": duplicates_removed,
            "metrics_items": sum(1 for item in items if item["metrics"]["available"]),
            "languages": dict(sorted(languages.items())),
            "platforms": dict(sorted(platforms.items())),
        },
        "quality": {
            "warnings": warnings,
            "skipped_records": skipped,
            "duplicates_removed": duplicates_removed,
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Normalize JSON, JSONL, or CSV records into CorpusV1")
    parser.add_argument("inputs", nargs="+", type=Path, help="Input .json, .jsonl, or .csv files")
    parser.add_argument("--rights-basis", choices=("public", "authorized"), required=True)
    parser.add_argument("--source-label", default="normalized input files")
    parser.add_argument("--subject-name")
    parser.add_argument("--subject-handle", action="append", default=[])
    parser.add_argument("--default-platform")
    parser.add_argument("--default-author-name")
    parser.add_argument("--default-author-handle")
    parser.add_argument("--output", type=Path, help="Write JSON to this path instead of stdout")
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        corpus = normalize_files(
            args.inputs,
            rights_basis=args.rights_basis,
            source_label=args.source_label,
            subject_name=args.subject_name,
            subject_handles=args.subject_handle,
            default_platform=args.default_platform,
            default_author_name=args.default_author_name,
            default_author_handle=args.default_author_handle,
        )
    except (OSError, UnicodeError, ValueError) as exc:
        parser.error(str(exc))
    payload = json.dumps(
        corpus,
        ensure_ascii=False,
        indent=None if args.compact else 2,
        separators=(",", ":") if args.compact else None,
    )
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
