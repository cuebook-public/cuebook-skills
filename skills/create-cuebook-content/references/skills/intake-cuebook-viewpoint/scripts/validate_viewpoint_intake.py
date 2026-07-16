#!/usr/bin/env python3
"""Validate ViewpointIntakeV1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PLUGIN_ROOT))
from validate_json_schema import validate_instance  # noqa: E402


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "references" / "viewpoint-intake-v1.schema.json").read_text(encoding="utf-8")
)

REQUIRED_FIELDS = ("asset", "direction", "horizon")
SETTLED_STATES = {"verified", "handed_back"}
CAPTURED_PROVENANCE = {"stated", "elicited", "inferred_confirmed"}
PASSING_PRICE_STATUSES = {"pass", "warn", "skipped", "unavailable"}
PASSING_TARGET_STATUSES = {"pass", "skipped", "unavailable"}
SETTLEABLE_DIRECTIONS = {"long", "short", "relative"}
PAIR_FAMILIES = {"pair_asset_direction", "pair_asset_price_targets"}
TARGET_FAMILIES = {"single_asset_price_target", "pair_asset_price_targets"}
DIRECTION_FAMILIES = {"single_asset_direction", "pair_asset_direction"}
HORIZON_MIN_HOURS = 1
HORIZON_MAX_HOURS = 24 * 183  # six months
HORIZON_UNIT_MAX = {"hour": HORIZON_MAX_HOURS, "calendar_day": 183, "market_session": 130}


def horizon_bounds_error(intent: dict, received_at: str) -> str | None:
    kind = intent.get("kind")
    if kind == "duration":
        value = intent.get("value")
        unit = intent.get("unit")
        if not isinstance(value, int) or unit not in HORIZON_UNIT_MAX:
            return "Duration horizon needs an integer value and a supported unit."
        if unit == "hour" and value < HORIZON_MIN_HOURS:
            return "Horizon must be at least one hour."
        if value > HORIZON_UNIT_MAX[unit]:
            return f"Horizon exceeds six months ({unit} max {HORIZON_UNIT_MAX[unit]})."
        return None
    if kind == "instant":
        from datetime import datetime

        try:
            settle = datetime.fromisoformat(str(intent.get("requested_settle_at")).replace("Z", "+00:00"))
            received = datetime.fromisoformat(str(received_at).replace("Z", "+00:00"))
        except ValueError:
            return "Instant horizon timestamps must be ISO 8601."
        hours = (settle - received).total_seconds() / 3600
        if hours < HORIZON_MIN_HOURS:
            return "Horizon must be at least one hour after received_at."
        if hours > HORIZON_MAX_HOURS:
            return "Horizon exceeds six months after received_at."
        return None
    return "Horizon intent must be duration or instant."


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def validate(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "Viewpoint intake must be an object.")]}
    errors = validate_instance(payload, SCHEMA)

    state = payload.get("state")
    triage = payload.get("triage") if isinstance(payload.get("triage"), dict) else {}
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    log = payload.get("elicitation_log") if isinstance(payload.get("elicitation_log"), list) else []
    verification = payload.get("verification") if isinstance(payload.get("verification"), dict) else {}
    confirmation = payload.get("confirmation") if isinstance(payload.get("confirmation"), dict) else {}
    handback = payload.get("handback") if isinstance(payload.get("handback"), dict) else {}

    rounds = [entry.get("round") for entry in log if isinstance(entry, dict)]
    if len(rounds) != len(set(rounds)):
        errors.append(issue("ELICIT_ROUND_DUPLICATE", "$.elicitation_log", "Each elicitation round number must be unique."))

    asked_fields: set[str] = set()
    for entry in log:
        if isinstance(entry, dict):
            asked_fields.update(entry.get("asked") or [])
    for name in ("asset", "direction", "horizon", "price_anchor"):
        field = fields.get(name) if isinstance(fields.get(name), dict) else {}
        if field.get("provenance") in {"elicited", "inferred_confirmed"} and name not in asked_fields:
            errors.append(issue("ELICITED_WITHOUT_LOG", f"$.fields.{name}", "An elicited or confirmed-inference field needs a matching elicitation_log entry; never fill a field the user did not address."))

    if triage.get("intent") == "query_only" and state not in {"query_routed", "abandoned"}:
        errors.append(issue("QUERY_NOT_FORCED", "$.state", "A query-only visitor is routed to query-cuebook or leaves; intake never forces creation."))
    if state == "query_routed":
        if triage.get("intent") not in {"query_only", "mixed"}:
            errors.append(issue("QUERY_ROUTE_INTENT", "$.triage.intent", "query_routed requires query_only or mixed intent."))
        if triage.get("query_route") != "query-cuebook":
            errors.append(issue("QUERY_ROUTE_TARGET", "$.triage.query_route", "query_routed must name the query-cuebook route."))
        if handback.get("target") != "none":
            errors.append(issue("QUERY_ROUTE_HANDBACK", "$.handback.target", "A query route hands nothing to creation."))

    direction_value = (fields.get("direction") or {}).get("value") if isinstance(fields.get("direction"), dict) else None
    settlement = fields.get("settlement") if isinstance(fields.get("settlement"), dict) else {}
    family = settlement.get("family")
    pair_asset = fields.get("pair_asset") if isinstance(fields.get("pair_asset"), dict) else None
    price_anchor = fields.get("price_anchor") if isinstance(fields.get("price_anchor"), dict) else {}

    if family is not None and direction_value not in SETTLEABLE_DIRECTIONS:
        errors.append(issue("NON_SETTLEABLE_DIRECTION", "$.fields.settlement.family", "avoid/watch/explain/neutral views cannot carry a settlement family; they can only be stored."))
    if direction_value == "relative" and family is not None and family not in PAIR_FAMILIES:
        errors.append(issue("RELATIVE_NEEDS_PAIR", "$.fields.settlement.family", "A relative view settles as a confirmed two-asset pair family."))
    if family in PAIR_FAMILIES:
        if not pair_asset or pair_asset.get("value") in (None, "") or pair_asset.get("provenance") not in CAPTURED_PROVENANCE:
            errors.append(issue("PAIR_ASSET_MISSING", "$.fields.pair_asset", "Pair settlement families require a captured second asset."))
    elif pair_asset and pair_asset.get("value") not in (None, ""):
        errors.append(issue("PAIR_ASSET_UNEXPECTED", "$.fields.pair_asset", "A single-asset family cannot carry a second asset."))
    if family in DIRECTION_FAMILIES and settlement.get("threshold_bps") in (None, ""):
        errors.append(issue("THRESHOLD_NOT_EXPLICIT", "$.fields.settlement.threshold_bps", "Direction families freeze an explicit threshold; a default of 0 must still be stated as \"0\"."))
    if family in TARGET_FAMILIES and price_anchor.get("value") is None:
        errors.append(issue("TARGET_PRICE_MISSING", "$.fields.price_anchor.value", "Price-target families require a captured target price."))

    operator = price_anchor.get("operator")
    if operator is not None and direction_value in {"long", "short"}:
        if direction_value == "long" and operator not in {"gt", "gte"}:
            errors.append(issue("TARGET_OPERATOR_DIRECTION", "$.fields.price_anchor.operator", "A long target uses gt/gte."))
        if direction_value == "short" and operator not in {"lt", "lte"}:
            errors.append(issue("TARGET_OPERATOR_DIRECTION", "$.fields.price_anchor.operator", "A short target uses lt/lte."))

    target_direction = verification.get("target_direction") if isinstance(verification.get("target_direction"), dict) else {}
    reference_price = target_direction.get("reference_price")
    target_value = price_anchor.get("value")
    if (
        target_direction.get("status") == "pass"
        and isinstance(reference_price, (int, float))
        and isinstance(target_value, (int, float))
        and direction_value in {"long", "short"}
    ):
        conflict = (direction_value == "long" and target_value <= reference_price) or (
            direction_value == "short" and target_value >= reference_price
        )
        if conflict:
            errors.append(issue("TARGET_DIRECTION_CONFLICT", "$.verification.target_direction", f"A {direction_value} target of {target_value} against reference {reference_price} contradicts the direction; ask whether the user means the opposite side, and block if unresolved."))

    if state == "blocked":
        if handback.get("eligible") is True or handback.get("target") not in {"none", None}:
            errors.append(issue("BLOCKED_HANDBACK", "$.handback", "A blocked intake hands nothing back."))
        if not handback.get("blockers"):
            errors.append(issue("BLOCKED_WITHOUT_REASON", "$.handback.blockers", "A blocked intake states its blockers."))

    if state in SETTLED_STATES:
        for name in REQUIRED_FIELDS:
            field = fields.get(name) if isinstance(fields.get(name), dict) else {}
            if field.get("value") in (None, "") or field.get("provenance") not in CAPTURED_PROVENANCE:
                errors.append(issue("REQUIRED_FIELD_MISSING", f"$.fields.{name}", f"State {state} requires {name} with stated, elicited, or confirmed-inference provenance."))
        horizon = fields.get("horizon") if isinstance(fields.get("horizon"), dict) else {}
        intent = horizon.get("intent") if isinstance(horizon.get("intent"), dict) else None
        if intent is None:
            errors.append(issue("HORIZON_NOT_STRUCTURED", "$.fields.horizon.intent", "A settled horizon carries a HorizonIntentV1-compatible intent."))
        else:
            received_at = (payload.get("raw_input") or {}).get("received_at", "")
            bounds_error = horizon_bounds_error(intent, received_at)
            if bounds_error:
                errors.append(issue("HORIZON_BOUNDS", "$.fields.horizon.intent", bounds_error))
        if settlement.get("provenance") not in CAPTURED_PROVENANCE and family is not None:
            errors.append(issue("SETTLEMENT_PROVENANCE", "$.fields.settlement", "A chosen settlement family needs stated, elicited, or confirmed-inference provenance."))
        for check, allowed in (
            ("asset_resolution", {"pass"}),
            ("horizon_validity", {"pass"}),
            ("direction_consistency", {"pass"}),
            ("price_sanity", PASSING_PRICE_STATUSES),
            ("target_direction", PASSING_TARGET_STATUSES),
        ):
            status = (verification.get(check) or {}).get("status") if isinstance(verification.get(check), dict) else None
            if status not in allowed:
                errors.append(issue("VERIFICATION_INCOMPLETE", f"$.verification.{check}", f"State {state} requires {check} status in {sorted(allowed)}; found {status!r}."))

    asset_resolution = verification.get("asset_resolution") if isinstance(verification.get("asset_resolution"), dict) else {}
    if asset_resolution.get("status") == "pass" and not asset_resolution.get("resolved_ref"):
        errors.append(issue("ASSET_RESOLUTION_REF", "$.verification.asset_resolution.resolved_ref", "A passing asset resolution names the canonical ref it resolved."))

    price_anchor = fields.get("price_anchor") if isinstance(fields.get("price_anchor"), dict) else {}
    price_sanity = verification.get("price_sanity") if isinstance(verification.get("price_sanity"), dict) else {}
    if price_anchor.get("value") is not None and not price_anchor.get("kind"):
        errors.append(issue("PRICE_ANCHOR_KIND", "$.fields.price_anchor.kind", "A price anchor declares entry, trigger, or reference."))
    if price_anchor.get("value") is None and price_sanity.get("status") not in {"skipped", "pending", None}:
        errors.append(issue("PRICE_SANITY_WITHOUT_ANCHOR", "$.verification.price_sanity.status", "Without a price anchor, price sanity is skipped or pending."))

    if state == "handed_back":
        if confirmation.get("confirmed") is not True:
            errors.append(issue("HANDBACK_UNCONFIRMED", "$.confirmation.confirmed", "Hand back requires the user-confirmed recap card."))
        if handback.get("target") in {"none", None}:
            errors.append(issue("HANDBACK_TARGET", "$.handback.target", "Hand back names a creation or storage target."))
        if handback.get("eligible") is not True:
            errors.append(issue("HANDBACK_INELIGIBLE", "$.handback.eligible", "Hand back requires an eligible payload."))
    if handback.get("eligible") is True and not isinstance(handback.get("seed"), dict):
        errors.append(issue("HANDBACK_SEED", "$.handback.seed", "An eligible handback carries a seed."))

    return {"valid": not errors, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    args = parser.parse_args()
    result = validate(json.loads(args.json_file.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
