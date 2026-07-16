from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("intake_validator", ROOT / "scripts" / "validate_viewpoint_intake.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


def intake() -> dict:
    return {
        "schema_version": "viewpoint-intake-v1",
        "intake_id": "VINT_uso_20260716",
        "state": "handed_back",
        "raw_input": {"text": "我觉得油价最近要涨，霍尔木兹那边不太平", "language": "zh", "received_at": "2026-07-16T10:00:00+08:00"},
        "triage": {"intent": "express_view", "query_route": None, "reason": "First-person directional judgment with a mechanism."},
        "fields": {
            "asset": {"value": "asset:uso", "display": "USO", "candidates": [], "provenance": "elicited"},
            "direction": {"value": "long", "provenance": "stated"},
            "horizon": {"value": "30D", "end_date": "2026-08-15", "provenance": "elicited"},
            "price_anchor": {"value": None, "currency": None, "kind": None, "provenance": "missing"},
        },
        "elicitation_log": [
            {"round": 1, "asked": ["asset", "horizon"], "prompt_text": "记在哪个标的上（USO / CL / XLE）？看多久（7D / 30D / 90D）？", "answered_verbatim": "USO，一个月吧"},
        ],
        "verification": {
            "asset_resolution": {"status": "pass", "method": "search_assets", "resolved_ref": "asset:uso", "note": None},
            "horizon_validity": {"status": "pass", "note": "30D window ends 2026-08-15."},
            "direction_consistency": {"status": "pass", "note": "要涨 matches long."},
            "price_sanity": {"status": "skipped", "reference_price": None, "deviation_pct": None, "note": "User skipped the optional anchor."},
        },
        "confirmation": {"card_text": "USO · 30D · 偏多 · 依据：霍尔木兹运输风险", "confirmed": True, "confirmed_at": "2026-07-16T10:02:00+08:00"},
        "handback": {
            "target": "compile-cuebook-market-view-semantics",
            "eligible": True,
            "seed": {
                "claim_gist": "油价先计入霍尔木兹运输风险溢价",
                "because_gist": "航道规则收紧，绕行与保险成本先动",
                "asset_ref": "asset:uso",
                "direction": "long",
                "horizon_end_date": "2026-08-15",
                "price_anchor": None,
                "price_anchor_kind": None,
            },
            "blockers": [],
        },
    }


def codes(payload: dict) -> set[str]:
    return {item["code"] for item in VALIDATOR.validate(payload)["errors"]}


class ViewpointIntakeTests(unittest.TestCase):
    def test_valid_handed_back_intake(self) -> None:
        result = VALIDATOR.validate(intake())
        self.assertTrue(result["valid"], result["errors"])

    def test_three_fields_in_one_round_is_rejected(self) -> None:
        payload = intake()
        payload["elicitation_log"][0]["asked"] = ["asset", "horizon", "price_anchor"]
        self.assertFalse(VALIDATOR.validate(payload)["valid"])

    def test_elicited_field_requires_a_logged_round(self) -> None:
        payload = intake()
        payload["elicitation_log"] = []
        self.assertIn("ELICITED_WITHOUT_LOG", codes(payload))

    def test_handback_requires_confirmation(self) -> None:
        payload = intake()
        payload["confirmation"]["confirmed"] = False
        self.assertIn("HANDBACK_UNCONFIRMED", codes(payload))

    def test_settled_state_requires_required_fields_and_verification(self) -> None:
        payload = intake()
        payload["fields"]["direction"] = {"value": None, "provenance": "missing"}
        self.assertIn("REQUIRED_FIELD_MISSING", codes(payload))

        payload = intake()
        payload["verification"]["asset_resolution"]["status"] = "unavailable"
        self.assertIn("VERIFICATION_INCOMPLETE", codes(payload))

        payload = intake()
        payload["fields"]["horizon"]["end_date"] = None
        found = codes(payload)
        self.assertTrue({"HORIZON_NOT_ABSOLUTE"} & found, found)

    def test_query_only_visitor_is_never_forced_into_creation(self) -> None:
        payload = intake()
        payload["triage"]["intent"] = "query_only"
        self.assertIn("QUERY_NOT_FORCED", codes(payload))

    def test_query_routed_terminal_is_valid_without_fields(self) -> None:
        payload = intake()
        payload.update({"state": "query_routed"})
        payload["triage"] = {"intent": "query_only", "query_route": "query-cuebook", "reason": "Pure lookup of USO stories."}
        payload["fields"] = {
            "asset": {"value": None, "display": "USO", "candidates": [], "provenance": "missing"},
            "direction": {"value": None, "provenance": "missing"},
            "horizon": {"value": None, "end_date": None, "provenance": "missing"},
            "price_anchor": {"value": None, "currency": None, "kind": None, "provenance": "missing"},
        }
        payload["elicitation_log"] = []
        payload["verification"] = {
            "asset_resolution": {"status": "pending"},
            "horizon_validity": {"status": "pending"},
            "direction_consistency": {"status": "pending"},
            "price_sanity": {"status": "pending"},
        }
        payload["confirmation"] = {"card_text": None, "confirmed": False, "confirmed_at": None}
        payload["handback"] = {"target": "none", "eligible": False, "seed": None, "blockers": []}
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])

    def test_price_anchor_needs_kind_and_sanity_pairing(self) -> None:
        payload = intake()
        payload["fields"]["price_anchor"] = {"value": 78.5, "currency": "USD", "kind": None, "provenance": "stated"}
        self.assertIn("PRICE_ANCHOR_KIND", codes(payload))

        payload = intake()
        payload["verification"]["price_sanity"]["status"] = "pass"
        self.assertIn("PRICE_SANITY_WITHOUT_ANCHOR", codes(payload))

    def test_eligible_handback_requires_seed(self) -> None:
        payload = intake()
        payload["handback"]["seed"] = None
        self.assertIn("HANDBACK_SEED", codes(payload))


if __name__ == "__main__":
    unittest.main()
