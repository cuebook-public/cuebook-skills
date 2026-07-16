#!/usr/bin/env python3
"""Validate ViewpointIntakeV1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PLUGIN_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))
from validate_json_schema import validate_instance  # noqa: E402


SCHEMA = json.loads(
    (Path(__file__).resolve().parents[1] / "references" / "viewpoint-intake-v1.schema.json").read_text(encoding="utf-8")
)

REQUIRED_FIELDS = ("asset", "direction", "horizon")
SETTLED_STATES = {"verified", "handed_back"}
CAPTURED_PROVENANCE = {"stated", "elicited", "inferred_confirmed"}
PASSING_PRICE_STATUSES = {"pass", "warn", "skipped", "unavailable"}


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

    if state in SETTLED_STATES:
        for name in REQUIRED_FIELDS:
            field = fields.get(name) if isinstance(fields.get(name), dict) else {}
            if field.get("value") in (None, "") or field.get("provenance") not in CAPTURED_PROVENANCE:
                errors.append(issue("REQUIRED_FIELD_MISSING", f"$.fields.{name}", f"State {state} requires {name} with stated, elicited, or confirmed-inference provenance."))
        horizon = fields.get("horizon") if isinstance(fields.get("horizon"), dict) else {}
        if horizon.get("value") not in (None, "") and not horizon.get("end_date"):
            errors.append(issue("HORIZON_NOT_ABSOLUTE", "$.fields.horizon.end_date", "A settled horizon must carry an absolute end_date."))
        for check, allowed in (
            ("asset_resolution", {"pass"}),
            ("horizon_validity", {"pass"}),
            ("direction_consistency", {"pass"}),
            ("price_sanity", PASSING_PRICE_STATUSES),
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
