from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


RENDER = load_module("render_logic_card", ROOT / "scripts" / "render_logic_card.py")
VALIDATE = load_module("validate_logic_card_test", ROOT / "scripts" / "validate_logic_card.py")


def base_argument() -> dict:
    return {
        "schema_version": "visual-argument-v1",
        "argument_id": "VARG_testlogic20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": ["POST_testlogic20260714", "SETTLE_testlogic20260714"],
            "post_ref": "POST_testlogic20260714",
            "creator_intent_ref": None,
            "thesis_ref": None,
            "research_pack_ref": None,
            "settlement_claim_ref": "SETTLE_testlogic20260714",
            "decision_cutoff_at": "2026-07-14T08:00:00Z",
        },
        "subject": {
            "primary": {"instrument_id": "AAA:X", "ticker": "AAA", "display_name": "Alpha Asset"},
            "benchmark": {"instrument_id": "BBB:X", "ticker": "BBB", "display_name": "Beta Asset"},
            "direction": "outperform",
            "horizon_end": "2026-07-15T20:00:00Z",
        },
        "frame": {
            "headline": "事件冲击后，AAA 可能先于 BBB 重定价",
            "thesis": "风险先进入直接敞口，随后才传到权益定价。",
            "creator_text": "我先看 AAA 的反应。",
            "creator_text_preserved": True,
            "cuebook_contribution": "Cuebook 补上机制、反例与统一结算窗口。",
            "visual_job": "explain_cause",
        },
        "graph": {
            "nodes": [
                {"id": "N1", "kind": "event", "label": "事件已经发生", "detail": None, "status": "observed", "fact_refs": ["F1"], "source_refs": ["SRC1"], "metric_ref": None},
                {"id": "N2", "kind": "mechanism", "label": "风险先进入直接敞口", "detail": None, "status": "derived", "fact_refs": ["F1"], "source_refs": ["SRC1"], "metric_ref": None},
                {"id": "N3", "kind": "market_effect", "label": "AAA 先于 BBB 重定价", "detail": None, "status": "conditional", "fact_refs": ["F2"], "source_refs": ["SRC2"], "metric_ref": None},
                {"id": "N4", "kind": "countercase", "label": "风险没有继续扩大", "detail": None, "status": "unresolved", "fact_refs": ["F3"], "source_refs": ["SRC3"], "metric_ref": None},
                {"id": "N5", "kind": "settlement", "label": "比较到期收益", "detail": None, "status": "conditional", "fact_refs": [], "source_refs": ["SETTLE_testlogic20260714"], "metric_ref": None},
            ],
            "edges": [
                {"id": "E1", "from": "N1", "to": "N2", "relation": "causes", "certainty": "inferred", "label": None},
                {"id": "E2", "from": "N2", "to": "N3", "relation": "causes", "certainty": "hypothesis", "label": None},
                {"id": "E3", "from": "N4", "to": "N3", "relation": "challenges", "certainty": "hypothesis", "label": None},
                {"id": "E4", "from": "N3", "to": "N5", "relation": "settles", "certainty": "observed", "label": None},
            ],
        },
        "metrics": [],
        "levels": [],
        "scenarios": [],
        "settlement": {
            "settleable": True,
            "claim_ref": "SETTLE_testlogic20260714",
            "deadline_at": "2026-07-15T20:00:00Z",
            "condition": "AAA return > BBB return",
            "state": "needs_confirmation",
        },
        "visual": {
            "recommended_grammar": "causal_chain",
            "alternative_grammars": ["evidence_balance", "comparison"],
            "rationale": "事件、机制和市场结果构成短因果链。",
            "theme": "cuebook_light",
        },
        "quality_report": {"decision": "conditional", "warnings": ["结果仍待验证。"], "hard_failures": []},
    }


def add_metrics(argument: dict) -> None:
    argument["metrics"] = [
        {"id": "M1", "subject_ref": "primary", "label": "直接敞口", "display_value": "82%", "numeric_value": 82, "unit": "%", "as_of": "2026-07-14T07:50:00Z", "source_ref": "SRC1", "status": "verified"},
        {"id": "M2", "subject_ref": "benchmark", "label": "直接敞口", "display_value": "47%", "numeric_value": 47, "unit": "%", "as_of": "2026-07-14T07:50:00Z", "source_ref": "SRC2", "status": "verified"},
        {"id": "M3", "subject_ref": "primary", "label": "一日弹性", "display_value": "1.8x", "numeric_value": 1.8, "unit": "x", "as_of": "2026-07-14T07:50:00Z", "source_ref": "SRC1", "status": "estimated"},
        {"id": "M4", "subject_ref": "benchmark", "label": "一日弹性", "display_value": "1.1x", "numeric_value": 1.1, "unit": "x", "as_of": "2026-07-14T07:50:00Z", "source_ref": "SRC2", "status": "estimated"},
    ]


def set_grammar(argument: dict, grammar: str, job: str) -> None:
    current = argument["visual"]["recommended_grammar"]
    alternatives = [item for item in argument["visual"]["alternative_grammars"] if item != grammar]
    if current != grammar:
        alternatives = [current] + alternatives
    argument["visual"]["recommended_grammar"] = grammar
    argument["visual"]["alternative_grammars"] = alternatives[:2]
    argument["frame"]["visual_job"] = job


class LogicCardTests(unittest.TestCase):
    def test_renders_and_validates_causal_card(self):
        argument = base_argument()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDER.render(argument, Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn("Cuebook 观点逻辑", svg)
            self.assertIn("事件冲击后", svg)
            self.assertIn("反例 / 失效条件", svg)
            self.assertIn("可结算观点", svg)
            self.assertNotIn("Cuebook 补全", svg)
            self.assertNotIn("Cuebook 推演", svg)
            self.assertNotIn(argument["frame"]["cuebook_contribution"], svg)
            validation = VALIDATE.validate(result["manifest"], argument, Path(directory))
            self.assertTrue(validation["valid"], validation["errors"])

    def test_rejects_undeclared_grammar(self):
        argument = base_argument()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "not recommended or declared"):
                RENDER.render(argument, Path(directory), "metric_thesis")

    def test_routes_price_timeline_to_chart_skill(self):
        argument = base_argument()
        argument["visual"]["alternative_grammars"] = ["price_timeline"]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "render-cuebook-thesis-chart"):
                RENDER.render(argument, Path(directory), "price_timeline")

    def test_detects_asset_hash_change(self):
        argument = base_argument()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDER.render(argument, Path(directory))
            result["svg_path"].write_text("tampered", encoding="utf-8")
            validation = VALIDATE.validate(result["manifest"], argument, Path(directory))
            self.assertIn("ASSET_HASH", {item["code"] for item in validation["errors"]})

    def test_renders_all_five_logic_grammars(self):
        cases = {
            "causal_chain": "explain_cause",
            "metric_thesis": "show_metrics",
            "scenario_tree": "map_scenarios",
            "evidence_balance": "weigh_evidence",
            "comparison": "compare_assets",
        }
        for grammar, job in cases.items():
            with self.subTest(grammar=grammar), tempfile.TemporaryDirectory() as directory:
                argument = copy.deepcopy(base_argument())
                set_grammar(argument, grammar, job)
                if grammar in {"metric_thesis", "comparison"}:
                    add_metrics(argument)
                if grammar == "scenario_tree":
                    argument["scenarios"] = [
                        {"id": "SC1", "label": "风险扩大", "condition": "保险费率继续上调", "outcome": "AAA 继续跑赢", "stance": "bull", "fact_refs": ["F1"]},
                        {"id": "SC2", "label": "风险回落", "condition": "通行与保险恢复", "outcome": "相对溢价回吐", "stance": "risk", "fact_refs": ["F3"]},
                    ]
                if grammar == "comparison":
                    argument["graph"]["edges"][1]["relation"] = "compares"
                result = RENDER.render(argument, Path(directory))
                self.assertEqual(result["manifest"]["grammar"], grammar)
                self.assertTrue(result["svg_path"].is_file())

    def test_cli_manifest_is_json_serializable(self):
        argument = base_argument()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDER.render(argument, Path(directory))
            payload = json.loads(result["manifest_path"].read_text(encoding="utf-8"))
            self.assertEqual(payload["schema_version"], "logic-card-v1")


if __name__ == "__main__":
    unittest.main()
