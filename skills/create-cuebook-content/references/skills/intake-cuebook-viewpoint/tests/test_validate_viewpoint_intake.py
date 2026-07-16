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
            "pair_asset": None,
            "direction": {"value": "long", "provenance": "stated"},
            "horizon": {
                "value": "30D",
                "intent": {"kind": "duration", "value": 30, "unit": "calendar_day", "creator_timezone": "Asia/Shanghai", "session_policy": "next_eligible_close"},
                "provenance": "elicited",
            },
            "price_anchor": {"value": None, "currency": None, "kind": None, "operator": None, "provenance": "missing"},
            "settlement": {"family": "single_asset_direction", "threshold_bps": "0", "provenance": "elicited"},
        },
        "elicitation_log": [
            {"round": 1, "asked": ["asset", "horizon"], "prompt_text": "记在哪个标的上（USO / CL / XLE）？看多久（48H / 30D / 90D）？", "answered_verbatim": "USO，一个月吧"},
            {"round": 2, "asked": ["settlement"], "prompt_text": "到期按方向对错结算（阈值 0）可以吗？还是要挂一个目标价？", "answered_verbatim": "方向对错就行"},
        ],
        "verification": {
            "asset_resolution": {"status": "pass", "method": "search_assets", "resolved_ref": "asset:uso", "note": None},
            "horizon_validity": {"status": "pass", "note": "30 calendar days within 1h-6mo bounds."},
            "direction_consistency": {"status": "pass", "note": "要涨 matches long."},
            "price_sanity": {"status": "skipped", "reference_price": None, "deviation_pct": None, "note": "No anchor requested."},
            "target_direction": {"status": "skipped", "reference_price": None, "note": "No target price."},
        },
        "confirmation": {"card_text": "USO · 30D · 偏多 · 方向对错结算（阈值 0） · 依据：霍尔木兹运输风险", "confirmed": True, "confirmed_at": "2026-07-16T10:02:00+08:00"},
        "handback": {
            "target": "compile-cuebook-market-view-semantics",
            "eligible": True,
            "seed": {
                "claim_gist": "油价先计入霍尔木兹运输风险溢价",
                "because_gist": "航道规则收紧，绕行与保险成本先动",
                "asset_ref": "asset:uso",
                "pair_asset_ref": None,
                "direction": "long",
                "horizon_intent": {"kind": "duration", "value": 30, "unit": "calendar_day", "creator_timezone": "Asia/Shanghai", "session_policy": "next_eligible_close"},
                "settlement_family": "single_asset_direction",
                "threshold_bps": "0",
                "target_price": None,
                "target_operator": None,
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
        found = codes(payload)
        self.assertIn("REQUIRED_FIELD_MISSING", found)

        payload = intake()
        payload["verification"]["asset_resolution"]["status"] = "unavailable"
        self.assertIn("VERIFICATION_INCOMPLETE", codes(payload))

        payload = intake()
        payload["fields"]["horizon"]["intent"] = None
        self.assertIn("HORIZON_NOT_STRUCTURED", codes(payload))

    def test_horizon_bounds_one_hour_to_six_months(self) -> None:
        payload = intake()
        payload["fields"]["horizon"]["intent"] = {"kind": "duration", "value": 200, "unit": "calendar_day", "creator_timezone": "Asia/Shanghai", "session_policy": "next_eligible_close"}
        self.assertIn("HORIZON_BOUNDS", codes(payload))

        payload = intake()
        payload["fields"]["horizon"]["intent"] = {"kind": "instant", "requested_settle_at": "2026-07-16T10:30:00+08:00", "creator_timezone": "Asia/Shanghai", "session_policy": "at_instant"}
        self.assertIn("HORIZON_BOUNDS", codes(payload))

        payload = intake()
        payload["fields"]["horizon"]["intent"] = {"kind": "duration", "value": 48, "unit": "hour", "creator_timezone": "Asia/Shanghai", "session_policy": "at_instant"}
        self.assertNotIn("HORIZON_BOUNDS", codes(payload))

    def test_long_target_below_reference_is_a_conflict(self) -> None:
        payload = intake()
        payload["fields"]["settlement"] = {"family": "single_asset_price_target", "threshold_bps": None, "provenance": "elicited"}
        payload["fields"]["price_anchor"] = {"value": 500.0, "currency": "USD", "kind": "target", "operator": "gte", "provenance": "stated"}
        payload["verification"]["target_direction"] = {"status": "pass", "reference_price": 550.0, "note": "checked against get_market_state"}
        payload["handback"]["seed"].update({"settlement_family": "single_asset_price_target", "threshold_bps": None, "target_price": 500.0, "target_operator": "gte"})
        self.assertIn("TARGET_DIRECTION_CONFLICT", codes(payload))

        payload["fields"]["direction"] = {"value": "short", "provenance": "elicited"}
        payload["fields"]["price_anchor"]["operator"] = "lte"
        payload["handback"]["seed"]["direction"] = "short"
        payload["elicitation_log"].append({"round": 3, "asked": ["direction"], "prompt_text": "500 在现价 550 下方——你是想做空吗？", "answered_verbatim": "对，是做空"})
        found = codes(payload)
        self.assertNotIn("TARGET_DIRECTION_CONFLICT", found)

    def test_target_operator_must_match_direction(self) -> None:
        payload = intake()
        payload["fields"]["price_anchor"] = {"value": 90.0, "currency": "USD", "kind": "target", "operator": "lte", "provenance": "stated"}
        self.assertIn("TARGET_OPERATOR_DIRECTION", codes(payload))

    def test_pair_family_requires_second_asset(self) -> None:
        payload = intake()
        payload["fields"]["direction"] = {"value": "relative", "provenance": "stated"}
        payload["fields"]["settlement"] = {"family": "pair_asset_direction", "threshold_bps": "0", "provenance": "elicited"}
        self.assertIn("PAIR_ASSET_MISSING", codes(payload))

        payload["fields"]["pair_asset"] = {"value": "asset:xle", "display": "XLE", "candidates": [], "provenance": "elicited"}
        payload["elicitation_log"].append({"round": 3, "asked": ["pair_asset"], "prompt_text": "相对谁？", "answered_verbatim": "XLE"})
        self.assertNotIn("PAIR_ASSET_MISSING", codes(payload))

    def test_direction_threshold_must_be_explicit(self) -> None:
        payload = intake()
        payload["fields"]["settlement"]["threshold_bps"] = None
        self.assertIn("THRESHOLD_NOT_EXPLICIT", codes(payload))

    def test_non_settleable_direction_cannot_carry_family(self) -> None:
        payload = intake()
        payload["fields"]["direction"] = {"value": "watch", "provenance": "stated"}
        self.assertIn("NON_SETTLEABLE_DIRECTION", codes(payload))

    def test_blocked_terminal_requires_reasons_and_no_handback(self) -> None:
        payload = intake()
        payload["state"] = "blocked"
        payload["handback"] = {"target": "none", "eligible": False, "seed": None, "blockers": ["用户坚持做多但目标价低于现价，方向与目标矛盾"]}
        payload["confirmation"] = {"card_text": None, "confirmed": False, "confirmed_at": None}
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])

        payload["handback"]["blockers"] = []
        self.assertIn("BLOCKED_WITHOUT_REASON", codes(payload))

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
            "pair_asset": None,
            "direction": {"value": None, "provenance": "missing"},
            "horizon": {"value": None, "intent": None, "provenance": "missing"},
            "price_anchor": {"value": None, "currency": None, "kind": None, "operator": None, "provenance": "missing"},
            "settlement": {"family": None, "threshold_bps": None, "provenance": "missing"},
        }
        payload["elicitation_log"] = []
        payload["verification"] = {
            "asset_resolution": {"status": "pending"},
            "horizon_validity": {"status": "pending"},
            "direction_consistency": {"status": "pending"},
            "price_sanity": {"status": "pending"},
            "target_direction": {"status": "pending"},
        }
        payload["confirmation"] = {"card_text": None, "confirmed": False, "confirmed_at": None}
        payload["handback"] = {"target": "none", "eligible": False, "seed": None, "blockers": []}
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])

    def test_price_anchor_needs_kind_and_sanity_pairing(self) -> None:
        payload = intake()
        payload["fields"]["price_anchor"] = {"value": 78.5, "currency": "USD", "kind": None, "operator": None, "provenance": "stated"}
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
