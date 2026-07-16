from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("assembly_validator", ROOT / "scripts" / "validate_frame_draft_assembly.py")
V = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(V)


def assembly() -> dict:
    return {
        "schema_version": "frame-draft-assembly-v1",
        "idempotency_key": "0198a5b0-1111-7000-8000-000000000001",
        "assembled_at": "2026-07-16T20:00:00+08:00",
        "frame_draft": {
            "kind": "market_view",
            "visibility": "public",
            "title": "USO 30 天偏多：霍尔木兹运输风险先入价",
            "body": "航道规则收紧，绕行与保险成本先动，油价计入运输风险溢价。",
            "language": "zh",
            "disclosures": {"ai_assistance": "assisted"},
            "media": [
                {"rendition_role": "publication", "sha256": "sha256:" + "a" * 64, "alt_text": "USO 偏多观点图"},
                {"rendition_role": "compact", "sha256": "sha256:" + "b" * 64, "alt_text": "USO 观点紧凑图"},
                {"rendition_role": "og", "sha256": "sha256:" + "c" * 64, "alt_text": "USO 分享卡"},
            ],
        },
        "settlement_intent": {
            "schema_version": "settlement-intent.v1",
            "family": "single_asset_direction",
            "claim_text": "USO 30 天内跑出正收益",
            "observation_policy_id": "launch-us-equity-v1",
            "horizon": {"kind": "duration", "value": 30, "unit": "calendar_day", "creator_timezone": "Asia/Shanghai", "session_policy": "next_eligible_close"},
            "leg": {"asset_ref": "asset:uso", "direction": "long", "threshold_bps": "0"},
        },
        "lineage": {"intake_ref": "VINT_uso_20260716", "direction_set_ref": "VDSET_uso_1", "visual_manifest_sha256": "sha256:" + "d" * 64},
    }


def codes(payload: dict) -> set[str]:
    return {e["code"] for e in V.validate(payload)["errors"]}


class AssemblyTests(unittest.TestCase):
    def test_valid_assembly(self) -> None:
        result = V.validate(assembly())
        self.assertTrue(result["valid"], result["errors"])

    def test_public_requires_og_and_intent(self) -> None:
        payload = assembly()
        payload["frame_draft"]["media"] = payload["frame_draft"]["media"][:2]
        self.assertIn("OG_REQUIRED", codes(payload))
        payload = assembly()
        payload["settlement_intent"] = None
        self.assertIn("INTENT_REQUIRED", codes(payload))

    def test_horizon_bounds_enforced(self) -> None:
        payload = assembly()
        payload["settlement_intent"]["horizon"]["value"] = 200
        self.assertIn("HORIZON_BOUNDS", codes(payload))

    def test_threshold_and_target_rules(self) -> None:
        payload = assembly()
        del payload["settlement_intent"]["leg"]["threshold_bps"]
        self.assertIn("THRESHOLD_NOT_EXPLICIT", codes(payload))

        payload = assembly()
        payload["settlement_intent"].update({
            "family": "single_asset_price_target",
            "leg": {"asset_ref": "asset:uso", "direction": "long", "target": {"operator": "lte", "price": "90"}},
        })
        self.assertIn("TARGET_OPERATOR_DIRECTION", codes(payload))

    def test_equal_notional_pair_rules(self) -> None:
        payload = assembly()
        payload["settlement_intent"].update({
            "family": "pair_asset_direction",
            "aggregate": {"mode": "equal_notional_long_short", "spread_threshold_bps": "0"},
            "legs": [
                {"asset_ref": "asset:uso", "direction": "long"},
                {"asset_ref": "asset:xle", "direction": "long"},
            ],
        })
        payload["settlement_intent"].pop("leg", None)
        self.assertIn("PAIR_LONG_SHORT", codes(payload))

    def test_media_alt_text_and_idempotency(self) -> None:
        payload = assembly()
        payload["frame_draft"]["media"][0]["alt_text"] = " "
        self.assertIn("MEDIA_ALT_TEXT", codes(payload))
        payload = assembly()
        payload["idempotency_key"] = "not-a-uuid"
        self.assertIn("IDEMPOTENCY_KEY", codes(payload))
        payload = assembly()
        # A generic UUIDv4 is a valid UUID but not time-ordered; the backend
        # accepts only UUIDv7 and the assembly validator must match it.
        payload["idempotency_key"] = "0198a5b0-1111-4000-8000-000000000001"
        self.assertIn("IDEMPOTENCY_KEY", codes(payload))

    def test_manifest_lineage_required(self) -> None:
        payload = assembly()
        payload["lineage"]["visual_manifest_sha256"] = "sha256:short"
        self.assertIn("LINEAGE_MANIFEST", codes(payload))


if __name__ == "__main__":
    unittest.main()
