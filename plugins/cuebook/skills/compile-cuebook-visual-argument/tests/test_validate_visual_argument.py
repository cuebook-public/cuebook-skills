from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_visual_argument.py"
SPEC = importlib.util.spec_from_file_location("validate_visual_argument", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def base_argument() -> dict:
    return {
        "schema_version": "visual-argument-v1",
        "argument_id": "VARG_usovsxle20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": ["POST_uso_vs_xle_20260714", "SETTLE_usovsxle20260714"],
            "post_ref": "POST_uso_vs_xle_20260714",
            "creator_intent_ref": None,
            "thesis_ref": None,
            "research_pack_ref": None,
            "settlement_claim_ref": "SETTLE_usovsxle20260714",
            "decision_cutoff_at": "2026-07-14T07:37:13Z",
        },
        "subject": {
            "primary": {"instrument_id": "USO:ARCX", "ticker": "USO", "display_name": "United States Oil Fund"},
            "benchmark": {"instrument_id": "XLE:ARCX", "ticker": "XLE", "display_name": "Energy Select Sector SPDR Fund"},
            "direction": "outperform",
            "horizon_end": "2026-07-14T20:00:00Z",
        },
        "frame": {
            "headline": "油轮遇袭后，USO 会先于 XLE 吸收风险溢价",
            "thesis": "航运风险先进入原油期货，USO 的短期反应可能快于能源股。",
            "creator_text": "单看反应速度，我选 USO。",
            "creator_text_preserved": True,
            "cuebook_contribution": "Cuebook 补充了传导顺序、反证和结算窗口。",
            "visual_job": "explain_cause",
        },
        "graph": {
            "nodes": [
                {"id": "N1", "kind": "event", "label": "油轮在霍尔木兹出港航道遇袭", "detail": None, "status": "observed", "fact_refs": ["F1"], "source_refs": ["reuters:tanker-strike"], "metric_ref": None},
                {"id": "N2", "kind": "mechanism", "label": "航运风险先进入原油期货", "detail": "保险区扩大仍待确认。", "status": "derived", "fact_refs": ["F1", "F6"], "source_refs": ["uscf:uso"], "metric_ref": None},
                {"id": "N3", "kind": "market_effect", "label": "USO 可能先于 XLE 重定价", "detail": None, "status": "conditional", "fact_refs": ["F3", "F4", "F5"], "source_refs": ["cuebook:market"], "metric_ref": None},
                {"id": "N4", "kind": "countercase", "label": "保险风险区没有扩大", "detail": "风险溢价可能回吐。", "status": "unresolved", "fact_refs": ["F2"], "source_refs": ["imo:shipping"], "metric_ref": None},
                {"id": "N5", "kind": "settlement", "label": "到期比较 USO 与 XLE 总收益", "detail": None, "status": "conditional", "fact_refs": [], "source_refs": ["SETTLE_usovsxle20260714"], "metric_ref": None}
            ],
            "edges": [
                {"id": "E1", "from": "N1", "to": "N2", "relation": "causes", "certainty": "inferred", "label": None},
                {"id": "E2", "from": "N2", "to": "N3", "relation": "enables", "certainty": "hypothesis", "label": "传导更直接"},
                {"id": "E3", "from": "N4", "to": "N3", "relation": "challenges", "certainty": "hypothesis", "label": "削弱"},
                {"id": "E4", "from": "N3", "to": "N5", "relation": "settles", "certainty": "observed", "label": None}
            ]
        },
        "metrics": [],
        "levels": [],
        "scenarios": [],
        "settlement": {
            "settleable": True,
            "claim_ref": "SETTLE_usovsxle20260714",
            "deadline_at": "2026-07-14T20:00:00Z",
            "condition": "USO total return > XLE total return",
            "state": "needs_confirmation",
        },
        "visual": {
            "recommended_grammar": "causal_chain",
            "alternative_grammars": ["evidence_balance", "comparison"],
            "rationale": "The opinion depends on a short event-to-instrument transmission path.",
            "theme": "cuebook_light",
        },
        "quality_report": {
            "decision": "conditional",
            "warnings": ["Insurance-zone expansion and settlement time remain unconfirmed."],
            "hard_failures": [],
        },
    }


class VisualArgumentValidationTests(unittest.TestCase):
    def test_valid_causal_argument(self):
        result = MODULE.validate(base_argument())
        self.assertTrue(result["valid"], result["errors"])

    def test_observed_node_requires_provenance(self):
        item = base_argument()
        item["graph"]["nodes"][0]["source_refs"] = []
        result = MODULE.validate(item)
        self.assertIn("OBSERVED_PROVENANCE", {entry["code"] for entry in result["errors"]})

    def test_graph_cycle_is_rejected(self):
        item = base_argument()
        item["graph"]["edges"].append({"id": "E5", "from": "N3", "to": "N1", "relation": "causes", "certainty": "hypothesis", "label": None})
        result = MODULE.validate(item)
        self.assertIn("GRAPH_CYCLE", {entry["code"] for entry in result["errors"]})

    def test_metric_grammar_requires_two_metrics(self):
        item = base_argument()
        item["frame"]["visual_job"] = "show_metrics"
        item["visual"]["recommended_grammar"] = "metric_thesis"
        result = MODULE.validate(item)
        self.assertIn("METRIC_GRAMMAR", {entry["code"] for entry in result["errors"]})

    def test_comparison_requires_benchmark(self):
        item = base_argument()
        item["frame"]["visual_job"] = "compare_assets"
        item["visual"]["recommended_grammar"] = "comparison"
        item["subject"]["direction"] = "long"
        item["subject"]["benchmark"] = None
        result = MODULE.validate(item)
        self.assertIn("COMPARISON_GRAMMAR", {entry["code"] for entry in result["errors"]})

    def test_creator_text_must_be_preserved(self):
        item = base_argument()
        item["frame"]["creator_text_preserved"] = False
        result = MODULE.validate(item)
        self.assertIn("CREATOR_TEXT_PRESERVED", {entry["code"] for entry in result["errors"]})

    def test_settlement_claim_must_match_lineage(self):
        item = base_argument()
        item["settlement"]["claim_ref"] = "SETTLE_wrongclaim"
        result = MODULE.validate(item)
        self.assertIn("SETTLEMENT_LINEAGE", {entry["code"] for entry in result["errors"]})

    def test_commentator_item_stays_source_lineage_not_creator_text(self):
        item = base_argument()
        item["lineage"]["input_artifact_refs"] = ["item_0123456789abcdef", "SETTLE_usovsxle20260714"]
        item["lineage"]["post_ref"] = None
        item["frame"]["creator_text"] = None
        item["frame"]["creator_text_preserved"] = False
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])


if __name__ == "__main__":
    unittest.main()
