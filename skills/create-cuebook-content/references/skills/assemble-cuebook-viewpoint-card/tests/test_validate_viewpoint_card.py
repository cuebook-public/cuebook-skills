from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_viewpoint_card.py"
SPEC = importlib.util.spec_from_file_location("validate_viewpoint_card", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def base_card() -> dict:
    creator_text = "单看反应速度，我选 USO。保险区扩大仍是待验证条件。"
    refs = ["VIEWINTENT_usovsxle20260714", "POST_uso_vs_xle_20260714", "LOGICCARD_usovsxle20260714", "CHART_usovsxle20260714", "INDPACK_usovsxle20260714", "SETTLE_usovsxle20260714"]
    return {
        "schema_version": "viewpoint-card-v1",
        "card_id": "VIEWCARD_usovsxle20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": refs,
            "creator_intent_ref": refs[0],
            "thesis_ref": None,
            "post_ref": refs[1],
            "logic_card_ref": refs[2],
            "chart_ref": refs[3],
            "indicator_pack_ref": refs[4],
            "settlement_claim_ref": refs[5],
        },
        "creator": {"creator_ref": "creator:vito", "display_name": "Vito", "handle": None, "author_type": "hybrid", "decision_owner": "creator"},
        "header": {
            "instrument_id": "USO:ARCX", "ticker": "USO", "direction": "outperform", "direction_label": "跑赢 XLE",
            "benchmark_instrument_id": "XLE:ARCX", "benchmark_ticker": "XLE", "deadline_at": "2026-07-14T20:00:00Z",
            "deadline_label": "7 月 14 日收盘", "status_label": "待确认",
        },
        "thesis": {
            "headline": "油轮遇袭后，USO 会先于 XLE 吸收风险溢价",
            "body": "袭击已经确认，保险区扩大仍待权威通知。观点用同步基准比较一日相对收益。",
            "creator_text": creator_text, "creator_text_preserved": True, "content_ref": refs[1],
        },
        "blocks": [
            {"id": "B1", "order": 1, "kind": "creator_text", "role": "context", "state": "ready", "title": "我还想说", "summary": creator_text, "artifact_ref": refs[0], "fact_refs": [], "source_refs": [], "display_variant": "plain_text"},
            {"id": "B2", "order": 2, "kind": "news", "role": "supports", "state": "ready", "title": "油轮遇袭", "summary": "UKMTO 收到油轮被导弹击中的报告。", "artifact_ref": "research-pack-v1:uso-tanker", "fact_refs": ["F1"], "source_refs": ["https://example.com/news"], "display_variant": "source_card"},
            {"id": "B3", "order": 3, "kind": "logic_card", "role": "supports", "state": "conditional", "title": "事件如何变成交易判断", "summary": "事件经过航运、原油期货和资金动作，落到 AAA 相对 BBB 的先后重定价。", "artifact_ref": refs[2], "fact_refs": ["F1", "F2"], "source_refs": ["https://example.com/news"], "display_variant": "logic_card"},
            {"id": "B4", "order": 4, "kind": "chart", "role": "supports", "state": "conditional", "title": "USO 相对 XLE", "summary": "当前形成中表现，仅供观察。", "artifact_ref": refs[3], "fact_refs": ["I2"], "source_refs": ["cuebook:market.candles"], "display_variant": "thesis_chart"},
            {"id": "B5", "order": 5, "kind": "indicator", "role": "supports", "state": "conditional", "title": "相对强弱", "summary": "形成中超额收益为正。", "artifact_ref": refs[4], "fact_refs": ["I2"], "source_refs": ["cuebook:market.candles"], "display_variant": "indicator_strip"},
            {"id": "B6", "order": 6, "kind": "settlement", "role": "settles", "state": "conditional", "title": "如何结算", "summary": "到期比较同步基准后的总收益。", "artifact_ref": refs[5], "fact_refs": [], "source_refs": ["market-data:official-close"], "display_variant": "settlement_footer"},
        ],
        "settlement": {"settleable": True, "claim_ref": refs[5], "one_line": "USO 跑赢｜相对 XLE｜待确认", "state": "needs_confirmation"},
        "disclosures": {"position_status": "unknown", "commercial_status": "unknown", "identity_status": "unknown", "ai_assistance_status": "disclosed", "public_lines": ["AI 协助补充研究与结构。"]},
        "quality_report": {"decision": "conditional", "warnings": ["Chart and indicator use forming daily bars."], "hard_failures": []},
    }


class ViewpointCardValidationTests(unittest.TestCase):
    def test_valid_conditional_relative_card(self):
        result = MODULE.validate(base_card())
        self.assertTrue(result["valid"], result["errors"])

    def test_relative_card_requires_benchmark(self):
        item = base_card()
        item["header"]["benchmark_ticker"] = None
        result = MODULE.validate(item)
        self.assertIn("RELATIVE_BENCHMARK", {entry["code"] for entry in result["errors"]})

    def test_chart_ref_must_match_lineage(self):
        item = base_card()
        item["blocks"][3]["artifact_ref"] = "CHART_wrongref"
        result = MODULE.validate(item)
        self.assertIn("BLOCK_LINEAGE_REF", {entry["code"] for entry in result["errors"]})

    def test_creator_text_cannot_change(self):
        item = base_card()
        item["blocks"][0]["summary"] = "AI 改写后的观点"
        result = MODULE.validate(item)
        self.assertIn("CREATOR_TEXT_CHANGED", {entry["code"] for entry in result["errors"]})

    def test_ready_card_rejects_conditional_block(self):
        item = base_card()
        item["state"] = "ready"
        item["quality_report"] = {"decision": "ready", "warnings": [], "hard_failures": []}
        item["disclosures"] = {"position_status": "none", "commercial_status": "none", "identity_status": "known", "ai_assistance_status": "disclosed", "public_lines": []}
        item["settlement"]["state"] = "ready"
        result = MODULE.validate(item)
        self.assertIn("CONDITIONAL_BLOCK_CARD", {entry["code"] for entry in result["errors"]})

    def test_settleable_card_requires_settlement_block(self):
        item = base_card()
        item["blocks"] = item["blocks"][:-1]
        result = MODULE.validate(item)
        self.assertIn("SETTLEMENT_BLOCK", {entry["code"] for entry in result["errors"]})

    def test_logic_card_ref_must_match_lineage(self):
        item = base_card()
        item["blocks"][2]["artifact_ref"] = "LOGICCARD_wrongref"
        result = MODULE.validate(item)
        self.assertIn("BLOCK_LINEAGE_REF", {entry["code"] for entry in result["errors"]})

    def test_market_figure_ref_must_match_lineage(self):
        item = base_card()
        figure_ref = "FIGURE_usovsxle20260714_relative"
        item["lineage"]["input_artifact_refs"].append(figure_ref)
        item["lineage"]["market_figure_ref"] = figure_ref
        for block in item["blocks"]:
            if block["order"] >= 6:
                block["order"] += 1
        item["blocks"].insert(
            5,
            {
                "id": "B7", "order": 6, "kind": "market_figure", "role": "supports", "state": "conditional",
                "title": "新闻与相对收益主图", "summary": "用一张图绑定曲线、新闻、关键数字和结算。",
                "artifact_ref": "FIGURE_wrongref", "fact_refs": ["F1", "I2"], "source_refs": ["cuebook:market.candles"],
                "display_variant": "market_figure",
            },
        )
        result = MODULE.validate(item)
        self.assertIn("BLOCK_LINEAGE_REF", {entry["code"] for entry in result["errors"]})

    def test_viewpoint_visual_ref_must_match_lineage(self):
        item = base_card()
        visual_ref = "VVIS_usovsxle20260714"
        item["lineage"]["input_artifact_refs"].append(visual_ref)
        item["lineage"]["viewpoint_visual_ref"] = visual_ref
        item["blocks"][2].update({
            "kind": "viewpoint_visual",
            "title": "风险溢价先落在哪里",
            "artifact_ref": "VVIS_wrongref",
            "display_variant": "viewpoint_visual",
        })
        result = MODULE.validate(item)
        self.assertIn("BLOCK_LINEAGE_REF", {entry["code"] for entry in result["errors"]})

    def test_observation_card_can_omit_deadline_and_settlement(self):
        item = base_card()
        item["header"].update({
            "direction": "observe",
            "direction_label": "观察去杠杆",
            "benchmark_instrument_id": None,
            "benchmark_ticker": None,
            "deadline_at": None,
            "deadline_label": None,
        })
        item["blocks"] = item["blocks"][:-1]
        item["settlement"] = {"settleable": False, "claim_ref": None, "one_line": None, "state": "not_applicable"}
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_settleable_card_requires_deadline(self):
        item = base_card()
        item["header"]["deadline_at"] = None
        item["header"]["deadline_label"] = None
        result = MODULE.validate(item)
        self.assertIn("SETTLEMENT_DEADLINE", {entry["code"] for entry in result["errors"]})


if __name__ == "__main__":
    unittest.main()
