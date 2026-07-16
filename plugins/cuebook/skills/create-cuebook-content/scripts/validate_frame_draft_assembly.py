#!/usr/bin/env python3
"""Validate FrameDraftAssemblyV1 — the Skill-side package handed to the Frame backend.

Bundles one FrameDraftV1-compatible draft, an optional SettlementIntentV1, the
visual-manifest lineage, and the idempotency key. Mirrors the frozen core
contracts (packages/core/src/frame/contracts.ts) so the assembly can be
verified before any backend call.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# The backend derives time-ordered dedupe state from the idempotency key, so a
# generic UUID (v4 etc.) is rejected: only UUIDv7 carries the required
# millisecond-ordered prefix. Mirrors uuidV7Schema in core frame assembly.
UUID_V7_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SHA_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
DECIMAL_PATTERN = re.compile(r"^-?\d+(\.\d+)?$")
FAMILIES = {"single_asset_direction", "single_asset_price_target", "pair_asset_direction", "pair_asset_price_targets"}
PAIR_FAMILIES = {"pair_asset_direction", "pair_asset_price_targets"}
TARGET_FAMILIES = {"single_asset_price_target", "pair_asset_price_targets"}
HORIZON_UNIT_MAX = {"hour": 24 * 183, "calendar_day": 183, "market_session": 130}
MEDIA_ROLES = {"publication", "compact", "og"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def check_horizon(h: Any, received_at: str, errors: list, path: str) -> None:
    if not isinstance(h, dict):
        errors.append(issue("HORIZON_SHAPE", path, "Horizon must be a HorizonIntentV1 object."))
        return
    kind = h.get("kind")
    if kind == "duration":
        value, unit = h.get("value"), h.get("unit")
        if not isinstance(value, int) or value < 1 or unit not in HORIZON_UNIT_MAX:
            errors.append(issue("HORIZON_SHAPE", path, "Duration needs positive integer value and supported unit."))
        elif value > HORIZON_UNIT_MAX[unit]:
            errors.append(issue("HORIZON_BOUNDS", path, f"Horizon exceeds six months ({unit} max {HORIZON_UNIT_MAX[unit]})."))
    elif kind == "instant":
        try:
            settle = datetime.fromisoformat(str(h.get("requested_settle_at")).replace("Z", "+00:00"))
            base = datetime.fromisoformat(str(received_at).replace("Z", "+00:00"))
            hours = (settle - base).total_seconds() / 3600
            if hours < 1 or hours > 24 * 183:
                errors.append(issue("HORIZON_BOUNDS", path, "Instant horizon must sit 1 hour to 6 months after assembled_at."))
        except ValueError:
            errors.append(issue("HORIZON_SHAPE", path, "Instant horizon timestamps must be ISO 8601."))
    else:
        errors.append(issue("HORIZON_SHAPE", path, "Horizon kind must be duration or instant."))
    if not h.get("creator_timezone") or h.get("session_policy") not in {"at_instant", "next_eligible_close"}:
        errors.append(issue("HORIZON_SHAPE", path, "Horizon needs creator_timezone and session_policy."))


def check_leg(leg: Any, needs_target: bool, needs_threshold: bool, errors: list, path: str) -> None:
    if not isinstance(leg, dict):
        errors.append(issue("LEG_SHAPE", path, "Leg must be an object."))
        return
    if leg.get("direction") not in {"long", "short"}:
        errors.append(issue("LEG_DIRECTION", path, "Leg direction must be long or short."))
    if not leg.get("asset_ref"):
        errors.append(issue("LEG_ASSET", path, "Leg needs an asset_ref."))
    if needs_threshold:
        t = leg.get("threshold_bps")
        if not isinstance(t, str) or not DECIMAL_PATTERN.match(t):
            errors.append(issue("THRESHOLD_NOT_EXPLICIT", path, "Direction legs freeze an explicit decimal-string threshold_bps (\"0\" counts)."))
    if needs_target:
        target = leg.get("target")
        if not isinstance(target, dict) or target.get("operator") not in {"gt", "gte", "lt", "lte"} or not isinstance(target.get("price"), str) or not DECIMAL_PATTERN.match(str(target.get("price"))):
            errors.append(issue("TARGET_SHAPE", path, "Target legs need operator gt/gte/lt/lte and a decimal-string price."))
        elif leg.get("direction") == "long" and target["operator"] not in {"gt", "gte"}:
            errors.append(issue("TARGET_OPERATOR_DIRECTION", path, "A long target uses gt/gte."))
        elif leg.get("direction") == "short" and target["operator"] not in {"lt", "lte"}:
            errors.append(issue("TARGET_OPERATOR_DIRECTION", path, "A short target uses lt/lte."))


def validate(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Assembly must be an object.")]}
    errors: list[dict[str, str]] = []
    if payload.get("schema_version") != "frame-draft-assembly-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected frame-draft-assembly-v1."))
    if not UUID_V7_PATTERN.match(str(payload.get("idempotency_key", ""))):
        errors.append(issue("IDEMPOTENCY_KEY", "$.idempotency_key", "A lowercase UUIDv7 idempotency key is required; other UUID versions are rejected."))
    assembled_at = str(payload.get("assembled_at", ""))
    if not assembled_at:
        errors.append(issue("ASSEMBLED_AT", "$.assembled_at", "assembled_at ISO timestamp is required."))

    draft = payload.get("frame_draft") if isinstance(payload.get("frame_draft"), dict) else {}
    if draft.get("kind") != "market_view":
        errors.append(issue("DRAFT_KIND", "$.frame_draft.kind", "Launch drafts are kind market_view."))
    visibility = draft.get("visibility")
    if visibility not in {"private", "unlisted", "public"}:
        errors.append(issue("DRAFT_VISIBILITY", "$.frame_draft.visibility", "Visibility must be private, unlisted, or public."))
    title, body = str(draft.get("title", "")), str(draft.get("body", ""))
    if not 1 <= len(title) <= 80:
        errors.append(issue("DRAFT_TITLE", "$.frame_draft.title", "Title is one clear judgment line, 1-80 characters."))
    if not 1 <= len(body) <= 2000:
        errors.append(issue("DRAFT_BODY", "$.frame_draft.body", "Body must be 1-2000 characters."))
    if str(draft.get("disclosures", {}).get("ai_assistance")) not in {"none", "assisted", "generated"}:
        errors.append(issue("DRAFT_DISCLOSURE", "$.frame_draft.disclosures.ai_assistance", "AI provenance disclosure is required."))
    media = draft.get("media") if isinstance(draft.get("media"), list) else []
    roles = {}
    for index, item in enumerate(media):
        role = item.get("rendition_role") if isinstance(item, dict) else None
        if role not in MEDIA_ROLES:
            errors.append(issue("MEDIA_ROLE", f"$.frame_draft.media[{index}]", "Media roles are publication, compact, or og."))
            continue
        roles[role] = item
        if not str(item.get("alt_text", "")).strip():
            errors.append(issue("MEDIA_ALT_TEXT", f"$.frame_draft.media[{index}]", f"Role {role} needs non-empty alt_text."))
        if not SHA_PATTERN.match(str(item.get("sha256", ""))):
            errors.append(issue("MEDIA_HASH", f"$.frame_draft.media[{index}]", "Each media item carries its sha256."))
    for required in ("publication", "compact"):
        if required not in roles:
            errors.append(issue("MEDIA_ROLE_MISSING", "$.frame_draft.media", f"{required} rendition is required for every publication."))
    if visibility in {"public", "unlisted"} and "og" not in roles:
        errors.append(issue("OG_REQUIRED", "$.frame_draft.media", "Public and unlisted drafts require an independently composed og rendition."))

    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    if not SHA_PATTERN.match(str(lineage.get("visual_manifest_sha256", ""))):
        errors.append(issue("LINEAGE_MANIFEST", "$.lineage.visual_manifest_sha256", "The frame-visual-manifest-v1 JCS hash is required."))
    if not lineage.get("intake_ref"):
        errors.append(issue("LINEAGE_INTAKE", "$.lineage.intake_ref", "The ViewpointIntakeV1 ref is required."))

    intent = payload.get("settlement_intent")
    if intent is None:
        if visibility in {"public", "unlisted"}:
            errors.append(issue("INTENT_REQUIRED", "$.settlement_intent", "A publishable market_view carries exactly one settlement intent."))
    elif isinstance(intent, dict):
        family = intent.get("family")
        if family not in FAMILIES:
            errors.append(issue("INTENT_FAMILY", "$.settlement_intent.family", "Family must be one of the four launch families."))
        else:
            check_horizon(intent.get("horizon"), assembled_at, errors, "$.settlement_intent.horizon")
            needs_target = family in TARGET_FAMILIES
            needs_threshold = family in {"single_asset_direction", "pair_asset_direction"} and (intent.get("aggregate", {}) or {}).get("mode") != "equal_notional_long_short"
            legs = intent.get("legs") if family in PAIR_FAMILIES else [intent.get("leg")]
            if family in PAIR_FAMILIES and (not isinstance(legs, list) or len(legs) != 2):
                errors.append(issue("LEG_COUNT", "$.settlement_intent.legs", "Pair families need exactly two legs."))
            else:
                for i, leg in enumerate(legs or []):
                    check_leg(leg, needs_target, needs_threshold, errors, f"$.settlement_intent.legs[{i}]")
                if family in PAIR_FAMILIES and isinstance(legs, list) and len(legs) == 2:
                    refs = {str((l or {}).get("asset_ref")) for l in legs if isinstance(l, dict)}
                    if len(refs) != 2:
                        errors.append(issue("PAIR_DISTINCT_ASSETS", "$.settlement_intent.legs", "Pair legs must reference two different assets."))
                    aggregate = intent.get("aggregate") if isinstance(intent.get("aggregate"), dict) else {}
                    if family == "pair_asset_direction" and aggregate.get("mode") == "equal_notional_long_short":
                        directions = sorted(str((l or {}).get("direction")) for l in legs if isinstance(l, dict))
                        if directions != ["long", "short"]:
                            errors.append(issue("PAIR_LONG_SHORT", "$.settlement_intent.legs", "Equal-notional pairs need exactly one long and one short leg."))
                        spread = aggregate.get("spread_threshold_bps")
                        if not isinstance(spread, str) or not DECIMAL_PATTERN.match(spread):
                            errors.append(issue("THRESHOLD_NOT_EXPLICIT", "$.settlement_intent.aggregate", "Equal-notional pairs freeze an explicit spread_threshold_bps."))
        if not str(intent.get("claim_text", "")).strip():
            errors.append(issue("INTENT_CLAIM", "$.settlement_intent.claim_text", "claim_text is required and freezes at publish."))
    else:
        errors.append(issue("INTENT_SHAPE", "$.settlement_intent", "Settlement intent must be an object or null."))

    return {"valid": not errors, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path)
    args = parser.parse_args()
    result = validate(json.loads(args.json_file.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
