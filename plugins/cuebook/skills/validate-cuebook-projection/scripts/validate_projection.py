#!/usr/bin/env python3
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BROAD_ASSETS = {"SPY", "QQQ", "IWM", "DIA", "RSP", "VTI"}
MACRO_TERMS = re.compile(r"\b(fed|cpi|inflation|rates?|yields?|dollar|liquidity|recession|jobs|payroll|oil|war|sanctions?|volatility)\b", re.I)
NARROW_TERMS = re.compile(r"\b(fcc|satellite|tourism|ev discount|subsidy|approval|contract|price target|product launch|merger)\b", re.I)
ANALYST_TERMS = re.compile(r"\b(price target|raises? target|lowers? target|analyst|maintains? (?:buy|sell|hold|overweight|underweight|outperform)|reiterates? (?:buy|sell|hold)|upgrades? .{0,60} to|downgrades? .{0,60} to)\b", re.I)
MODEL_TERMS = re.compile(r"\b(eps|ebitda|revenue|guidance|margin|bookings|arr|fcf|free cash flow|tam|market share|adoption|product cycle|sell[- ]?through)\b", re.I)
IDENTITY_STOPWORDS = {
    "after", "ahead", "analyst", "climbs", "company", "cuts", "downside",
    "earnings", "forecast", "growth", "guidance", "impact", "investors",
    "market", "merger", "overlooks", "price", "prices", "raises", "revenue",
    "risk", "rises", "shares", "slide", "still", "stock", "surge", "target",
    "underestimates", "underpricing", "upside", "why",
}


def field(obj: dict[str, Any], *names: str) -> Any:
    for name in names:
        if obj.get(name) is not None:
            return obj[name]
    return None


def values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(values(item))
        return out
    if isinstance(value, dict):
        out: list[str] = []
        for key in ("content", "text", "title", "note", "url", "occurred_at", "observed_at", "created_at"):
            if value.get(key) is not None:
                out.extend(values(value[key]))
        if out:
            return out
        for item in value.values():
            out.extend(values(item))
        return out
    return [str(value)]


def clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def ticker(value: Any) -> str:
    return re.sub(r"[^A-Z0-9.:-]", "", str(value or "").upper())


def asset_records(card: dict[str, Any]) -> list[dict[str, Any]]:
    raw = field(card, "assets", "cue_assets") or []
    if isinstance(raw, dict):
        raw = [raw]
    records = [dict(item) for item in raw if isinstance(item, dict)]
    direct = field(card, "asset", "lead_asset", "symbol")
    if direct and not any(ticker(field(item, "ticker", "canonical_ticker", "canonicalTicker", "symbol")) == ticker(direct) for item in records):
        records.insert(0, {"symbol": direct})
    return records


def card_assets(card: dict[str, Any]) -> set[str]:
    out = set()
    for item in asset_records(card):
        value = field(item, "ticker", "canonical_ticker", "canonicalTicker", "symbol")
        if ticker(value):
            out.add(ticker(value))
    return out


def asset_aliases(card: dict[str, Any]) -> set[str]:
    aliases = {item.lower() for item in card_assets(card)}
    for item in asset_records(card):
        for key in ("name", "display_name", "displayName"):
            if item.get(key):
                aliases.add(clean(str(item[key])).lower())
        aliases.update(clean(alias).lower() for alias in values(item.get("aliases")))
    return {item for item in aliases if item}


def descriptive_aliases(card: dict[str, Any]) -> set[str]:
    aliases = set()
    for item in asset_records(card):
        for key in ("name", "display_name", "displayName"):
            if item.get(key):
                aliases.add(clean(str(item[key])).lower())
        aliases.update(clean(alias).lower() for alias in values(item.get("aliases")))
    return {item for item in aliases if item and ticker(item) not in card_assets(card)}


def source_objects(card: dict[str, Any]) -> list[Any]:
    objects: list[Any] = []
    for key in ("source_content", "sourceContent", "evidence", "source_events", "sourceEvents"):
        value = card.get(key)
        if isinstance(value, list):
            objects.extend(value)
        elif value is not None:
            objects.append(value)
    return objects


def source_parts(card: dict[str, Any]) -> list[str]:
    return [clean(part) for part in values(source_objects(card)) if clean(part)]


def walk_named(value: Any, names: set[str]) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key in names:
                found.append(item)
            found.extend(walk_named(item, names))
    elif isinstance(value, list):
        for item in value:
            found.extend(walk_named(item, names))
    return found


def source_urls(card: dict[str, Any]) -> list[str]:
    text = " ".join(source_parts(card))
    return sorted(set(re.findall(r"https?://[^\s\"'<>]+", text)))


def source_tickers(card: dict[str, Any]) -> set[str]:
    text = " ".join(source_parts(card))
    found = set()
    for pattern in (
        r"/quote/([A-Za-z0-9.\-]+)",
        r"\b(?:NASDAQ|NYSE|NYSEARCA|AMEX|ARCA|OTC)\s*:\s*(?:<[^>]+>)*([A-Z][A-Z0-9.]{0,7})",
        r"\$([A-Z]{1,6})\b",
    ):
        found.update(ticker(match).replace("-", ".") for match in re.findall(pattern, text))
    for raw in walk_named(source_objects(card), {"tickers", "ticker", "symbols", "symbol", "canonicalTicker", "canonical_ticker"}):
        for item in values(raw):
            normalized = ticker(item)
            if 1 <= len(normalized) <= 8:
                found.add(normalized)
    return {item for item in found if item}


def narrative_text(card: dict[str, Any]) -> str:
    parts = []
    for name in ("title", "bottom_line", "bottomLine", "overread_note", "overreadNote", "asset_mechanism", "assetMechanism", "transmission_chain", "transmissionChain"):
        parts.extend(values(card.get(name)))
    return clean(" ".join(parts))


def bridge_text(card: dict[str, Any]) -> str:
    parts = []
    for name in ("title", "asset_mechanism", "assetMechanism", "mechanism_note", "transmission_chain", "transmissionChain"):
        parts.extend(values(card.get(name)))
    return clean(" ".join(parts)).lower()


def identity_terms(text: str) -> tuple[set[str], set[str]]:
    tokens = [token.lower() for token in re.findall(r"[A-Za-z][A-Za-z0-9&.-]*", clean(text))]
    tokens = [token for token in tokens if token not in IDENTITY_STOPWORDS]
    bigrams = {
        f"{left} {right}"
        for left, right in zip(tokens, tokens[1:])
        if len(left) > 2 and len(right) > 2
    }
    proper = {
        token.lower()
        for token in re.findall(r"\b(?:[A-Z][a-z]{3,}|[A-Z][a-z]+[A-Z][A-Za-z]+)\b", clean(text))
        if token.lower() not in IDENTITY_STOPWORDS
    }
    return bigrams, proper


def title_source_identity_match(card: dict[str, Any], source_text: str) -> bool:
    title = str(field(card, "title", "bottom_line", "bottomLine") or "")
    title_bigrams, title_proper = identity_terms(title)
    source_bigrams, source_proper = identity_terms(source_text)
    return bool((title_bigrams & source_bigrams) or (title_proper & source_proper))


def materially_numbered(text: str) -> set[str]:
    found = re.findall(r"(?<![A-Za-z])(?:[$€£¥]?\d+(?:\.\d+)?\s?(?:%|pp|bps|[BMK]|亿|万))(?![A-Za-z])", text, re.I)
    return {re.sub(r"\s+", "", item).upper() for item in found}


def observed_times(card: dict[str, Any]) -> list[str]:
    items = walk_named(source_objects(card), {"occurred_at", "occurredAt", "observed_at", "observedAt", "created_at", "createdAt"})
    items += [field(card, "occurred_at", "occurredAt", "published_at", "publishedAt")]
    return sorted({item for value in items for item in values(value) if re.match(r"^\d{4}-\d{2}-\d{2}T", item)})


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def directions(card: dict[str, Any]) -> set[str]:
    raw = [field(card, "direction", "lead_direction", "leadDirection")]
    raw.extend(field(item, "direction") for item in asset_records(card))
    raw.extend(walk_named(card.get("model_meta"), {"direction", "fragment_direction", "fragmentDirection"}))
    normalized = {str(item).lower() for value in raw for item in values(value)}
    return normalized & {"up", "down"}


def validate(card: dict[str, Any], as_of: datetime | None = None) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    repairs: list[str] = []
    unsupported: list[str] = []
    derived: list[str] = []
    facts = source_parts(card)[:3]
    c_assets = card_assets(card)
    s_assets = source_tickers(card)
    aliases = asset_aliases(card)
    descriptive = descriptive_aliases(card)
    source_text = " ".join(source_parts(card))
    story = narrative_text(card)
    bridge = bridge_text(card)
    directness = str(field(card, "directness") or "direct").lower()
    match = "unverified"

    def add(code: str, severity: str, message: str, evidence: list[str], repair: str | None = None) -> None:
        checks.append({"code": code, "severity": severity, "message": message, "evidence": evidence})
        if repair and repair not in repairs:
            repairs.append(repair)

    if not source_text and not source_urls(card):
        add("SOURCE_MISSING", "caution", "No attributable source text or URL is attached.", [], "Fetch the primary or closest attributable source.")

    if len(directions(card)) > 1:
        add("DIRECTION_CONFLICT", "reject", "Cue, fragment, or asset directions disagree.", sorted(directions(card)), "Resolve the direction before routing or writing.")

    if directness == "direct":
        if s_assets and c_assets.isdisjoint(s_assets):
            body_names_target = any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", source_text, re.I) for alias in descriptive if len(alias) > 2)
            analyst_context = bool(ANALYST_TERMS.search(source_text + " " + story))
            body_names_target = body_names_target or (
                not analyst_context and title_source_identity_match(card, source_text)
            )
            if body_names_target:
                match = "match"
                add("SOURCE_METADATA_CONFLICT", "caution", "Source metadata cites another ticker while the body names the selected underlying.", [f"card={','.join(sorted(c_assets))}", f"source={','.join(sorted(s_assets))}"], "Repair the provider URL or entity metadata before publication.")
            else:
                match = "mismatch"
                add("SOURCE_ASSET_MISMATCH", "reject", "Direct evidence cites a different ticker from the Cuebook asset.", [f"card={','.join(sorted(c_assets))}", f"source={','.join(sorted(s_assets))}"], "Replace the evidence or map the cue to the cited asset.")
        elif s_assets:
            match = "match"
        elif c_assets:
            mentions_alias = any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", source_text, re.I) for alias in aliases if len(alias) > 1)
            if mentions_alias or title_source_identity_match(card, source_text) or (c_assets & BROAD_ASSETS and MACRO_TERMS.search(source_text + " " + story)):
                match = "match"
            elif source_text:
                add("SOURCE_ASSET_UNVERIFIED", "caution", "The source has no resolvable ticker or asset alias.", sorted(c_assets), "Attach source entity metadata or an asset alias.")
    else:
        match = "proxy"
        target_named = any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", bridge, re.I) for alias in aliases if len(alias) > 1)
        descriptive_named = any(re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", bridge, re.I) for alias in descriptive if len(alias) > 2)
        chain = field(card, "transmission_chain", "transmissionChain")
        source_differs = bool(s_assets and c_assets.isdisjoint(s_assets))
        if not chain or not target_named or (source_differs and not descriptive_named):
            match = "mismatch"
            add("PROXY_BRIDGE_MISSING", "reject", "The proxy bridge does not explicitly reach the selected asset.", [f"asset={','.join(sorted(c_assets))}", bridge[:240]], "Name the target asset and explain who reprices what.")
        elif directness in {"speculative_proxy", "watch_only"}:
            add("SPECULATIVE_PROXY", "caution", "The Cuebook relationship is explicitly speculative or watch-only.", [directness], "Publish only as a watch or debate with a falsifier.")

    if c_assets & BROAD_ASSETS and NARROW_TERMS.search(source_text + " " + story) and not MACRO_TERMS.search(source_text + " " + story):
        match = "mismatch"
        add("BROAD_INDEX_OVERREACH", "reject", "A narrow event is being forced into a broad index asset.", sorted(c_assets), "Use the cited company, a sector ETF, or add a market-wide bridge.")

    if ANALYST_TERMS.search(source_text + " " + story) and not MODEL_TERMS.search(source_text + " " + story):
        add("TARGET_ONLY", "caution", "The analyst action has no model-line or operating reason.", [clean(source_text)[:240]], "Add the estimate change, model reason, consensus gap, or price-reaction divergence.")

    extra_numbers = materially_numbered(story) - materially_numbered(source_text)
    if extra_numbers:
        unsupported.extend(sorted(extra_numbers))
        add("UNSUPPORTED_NUMBER", "caution", "The narrative introduces a material number absent from its evidence.", sorted(extra_numbers), "Source or remove the unsupported number.")

    lower_story = story.lower()
    lower_source = source_text.lower()
    mechanism_issue = None
    if re.search(r"cash flow risk|overleverag|credit downgrade", lower_story) and not re.search(r"cash flow|free cash flow|revenue|leverage|credit downgrade", lower_source):
        mechanism_issue = "cash-flow or leverage claim"
    if re.search(r"operational synerg|market share", lower_story) and not re.search(r"synerg|market share", lower_source):
        mechanism_issue = "synergy or market-share claim"
    if mechanism_issue:
        unsupported.append(mechanism_issue)
        add("UNSUPPORTED_MECHANISM", "caution", "The narrative adds a mechanism that the evidence does not establish.", [mechanism_issue], "Add operating or financial evidence, or soften the claim.")
    elif story and source_text and story != source_text:
        derived.append(clean(story)[:320])

    if re.search(r"\breiterates?\b", lower_source) and re.search(r"\b(upside|underpric|underestimat)\b", lower_story) and not re.search(r"\b(raises?|increases?|above consensus|beats?)\b", lower_source):
        add("UNCHANGED_GUIDANCE_OVERREAD", "caution", "Unchanged guidance does not by itself establish fresh upside.", [clean(source_text)[:240]], "Compare the range with consensus and prior guidance.")

    times = observed_times(card)
    parsed = [item for item in (parse_time(value) for value in times) if item]
    if as_of and parsed and (as_of - max(parsed)).total_seconds() > 30 * 86400:
        add("STALE_EVENT", "caution", "The newest attached evidence is more than 30 days old.", [max(parsed).isoformat()], "Refresh the source and current market context.")

    decision = "reject" if any(item["severity"] == "reject" for item in checks) else "caution" if checks else "pass"
    return {
        "schema_version": "gate-v1",
        "cue_id": str(field(card, "id", "cue_id", "cueId") or ""),
        "decision": decision,
        "publishable": decision == "pass",
        "checks": checks,
        "source_asset": {"card_assets": sorted(c_assets), "source_assets": sorted(s_assets), "match": match},
        "claim_basis": {"sourced_facts": facts, "derived_claims": derived, "unsupported_claims": unsupported},
        "repairs": repairs,
        "closer_assets": sorted(s_assets - c_assets),
        "provenance": {"source_urls": source_urls(card), "observed_at": times},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Cuebook source-to-asset projection")
    parser.add_argument("json_file", nargs="?", help="Cue JSON or array; stdin when omitted")
    parser.add_argument("--as-of", help="ISO timestamp used for freshness checks")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else __import__("sys").stdin.read()
    payload = json.loads(raw)
    as_of = parse_time(args.as_of) if args.as_of else None
    output = [validate(item, as_of) for item in payload] if isinstance(payload, list) else validate(payload, as_of)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
