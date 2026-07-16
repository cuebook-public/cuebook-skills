from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("trade_logic_validator", ROOT / "scripts" / "validate_trade_logic.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


def valid_profile() -> dict:
    return {
        "schema_version": "trade-logic-profile-v1",
        "profile_id": "TLOGIC_USO_XLE_HORMUZ_20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": ["VARG_USO_XLE_HORMUZ_20260714"],
            "source_refs": ["source:ukmto:hormuz-20260714", "INDPACK_USO_XLE:I3"],
            "decision_cutoff_at": "2026-07-14T08:27:00Z"
        },
        "classification": {
            "family": "event_driven",
            "catalyst": "geopolitical",
            "mechanism": "risk_premium_transmission",
            "expression": "relative_value_pair",
            "horizon": "one_to_three_days",
            "edge": "causal",
            "rationale_refs": ["VARG_USO_XLE_HORMUZ_20260714", "INDPACK_USO_XLE:I3"]
        },
        "stance": {
            "primary_asset": "USO",
            "direction": "outperform",
            "comparator": "XLE",
            "horizon_label": "1-3 天"
        },
        "public_expression": {
            "action_line": "油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天。",
            "because_line": "航运风险溢价会先写进原油期货，直接敞口通常比能源股更快。",
            "tags": ["事件驱动", "风险溢价传导", "相对价值"]
        },
        "evidence_boundary": {
            "observed_claim_refs": ["source:ukmto:hormuz-20260714", "INDPACK_USO_XLE:I3"],
            "inferred_claim_refs": ["VARG_USO_XLE_HORMUZ_20260714:N3"],
            "missing_requirement_refs": ["cuebook:market.order_flow:USO"],
            "public_status_suppressed": True
        },
        "quality_report": {
            "decision": "conditional",
            "warnings": ["资金流向来自因果推断，尚无订单流快照。"],
            "hard_failures": []
        }
    }


class TradeLogicTests(unittest.TestCase):
    def test_valid_event_relative_profile(self):
        result = VALIDATOR.validate(valid_profile())
        self.assertTrue(result["valid"], result["errors"])

    def test_event_driven_requires_catalyst(self):
        payload = valid_profile()
        payload["classification"]["catalyst"] = "none"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("EVENT_CATALYST", {item["code"] for item in result["errors"]})

    def test_relative_value_requires_comparator_and_relative_direction(self):
        payload = valid_profile()
        payload["stance"].update({"comparator": None, "direction": "long"})
        result = VALIDATOR.validate(payload)
        codes = {item["code"] for item in result["errors"]}
        self.assertIn("RELATIVE_COMPARATOR", codes)
        self.assertIn("RELATIVE_DIRECTION", codes)

    def test_public_copy_rejects_backend_workflow_language(self):
        payload = valid_profile()
        payload["public_expression"]["action_line"] = "USO 等待确认后再做。"
        payload["public_expression"]["tags"][1] = "已计算"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertGreaterEqual(sum(item["code"] == "PUBLIC_BACKEND_TERM" for item in result["errors"]), 2)

    def test_action_line_names_primary_asset(self):
        payload = valid_profile()
        payload["public_expression"]["action_line"] = "油轮遇袭，我先做能源股。"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("ACTION_ASSET", {item["code"] for item in result["errors"]})

    def test_microstructure_family_requires_matching_mechanism(self):
        payload = valid_profile()
        payload["classification"].update({"family": "liquidity_microstructure", "mechanism": "fundamental_compounding"})
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("MICROSTRUCTURE_MECHANISM", {item["code"] for item in result["errors"]})


if __name__ == "__main__":
    unittest.main()
