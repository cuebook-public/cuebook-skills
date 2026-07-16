from __future__ import annotations

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


VALIDATOR = load_module("market_signal_validator", ROOT / "scripts" / "validate_market_signal.py")
RENDERER = load_module("market_signal_renderer", ROOT / "scripts" / "render_market_signal.py")


def number_spec() -> dict:
    return {
        "schema_version": "market-signal-spec-v1",
        "signal_id": "SIGSPEC_AAPL_SERVICE_REV_20260714",
        "revision": 1,
        "state": "ready",
        "mode": "key_number",
        "lineage": {
            "input_artifact_refs": ["RESEARCH_AAPL_20260714"],
            "source_refs": ["source:consensus:aapl-services"],
            "decision_cutoff_at": "2026-07-14T08:30:00Z"
        },
        "frame": {
            "category": "预期修正",
            "asset_label": "AAPL",
            "headline": "新品要发，我先做多 AAPL，窗口看 1-4 周",
            "interpretation": "我押服务收入预期上修接过新品热度，把一次发布会变成盈利定价。"
        },
        "trade_logic": {
            "profile_ref": "TLOGIC_AAPL_SERVICE_REV_20260714",
            "family": "event_driven",
            "mechanism": "expectation_revision",
            "expression": "outright_long",
            "horizon": "one_to_four_weeks",
            "public_tags": ["事件驱动", "预期修正", "直接做多"]
        },
        "key_number": {
            "label": "未来 12 个月服务收入预期",
            "display_value": "+4.8%",
            "numeric_value": 4.8,
            "unit": "%",
            "as_of": "2026-07-14T08:20:00Z",
            "status": "observed",
            "comparison": "7 日前 +1.6%",
            "source_ref": "source:consensus:aapl-services"
        },
        "key_news": None,
        "render": {
            "layout": "compact",
            "width": 720,
            "height": 420,
            "theme": "cuebook_light",
            "design_profile": "receptive_restraint",
            "watermark": "Cuebook"
        },
        "quality_report": {"decision": "ready", "warnings": [], "hard_failures": []}
    }


def news_spec() -> dict:
    payload = number_spec()
    payload.update(
        {
            "signal_id": "SIGSPEC_IBM_Q2_NEWS_20260714",
            "state": "conditional",
            "mode": "key_news",
            "lineage": {
                "input_artifact_refs": ["NEWS_IBM_Q2_20260714"],
                "source_refs": ["source:ibm:q2-release"],
                "decision_cutoff_at": "2026-07-14T08:30:00Z"
            },
            "frame": {
                "category": "财报",
                "asset_label": "IBM",
                "headline": "收入掉链子，我先做空 IBM，窗口看 1-3 天",
                "interpretation": "我押这次收入缺口先压估值，再让市场重估企业 IT 需求。"
            },
            "trade_logic": {
                "profile_ref": "TLOGIC_IBM_Q2_SHORT_20260714",
                "family": "event_driven",
                "mechanism": "expectation_revision",
                "expression": "outright_short",
                "horizon": "one_to_three_days",
                "public_tags": ["事件驱动", "预期修正", "直接做空"]
            },
            "key_number": None,
            "key_news": {
                "headline": "IBM 第二季度收入低于市场预期",
                "publisher": "IBM IR",
                "published_at": "2026-07-14T08:12:00Z",
                "status": "provisional",
                "source_refs": ["source:ibm:q2-release"]
            },
            "quality_report": {
                "decision": "conditional",
                "warnings": ["板块传导尚未由同业指引确认。"],
                "hard_failures": []
            }
        }
    )
    return payload


class MarketSignalTests(unittest.TestCase):
    def test_valid_number_and_news_specs(self):
        for payload in (number_spec(), news_spec()):
            result = VALIDATOR.validate_spec(payload)
            self.assertTrue(result["valid"], result["errors"])

    def test_mode_requires_exactly_one_signal(self):
        payload = number_spec()
        payload["key_news"] = news_spec()["key_news"]
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("MODE_PAYLOAD", {item["code"] for item in result["errors"]})

    def test_source_lineage_is_mandatory(self):
        payload = number_spec()
        payload["key_number"]["source_ref"] = "source:missing"
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("NUMBER_SOURCE_LINEAGE", {item["code"] for item in result["errors"]})

    def test_number_render_uses_restrained_single_signal_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(number_spec(), Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn('data-signal-mode="key_number"', svg)
            self.assertIn("+4.8%", svg)
            self.assertIn("07/14 08:20 UTC", svg)
            self.assertIn("Cuebook", svg)
            self.assertIn("事件驱动 · 预期修正 · 直接做多", svg)
            self.assertNotIn("条数据引用", svg)
            self.assertNotIn("虚线为形成中", svg)
            self.assertNotIn("结算", svg)
            self.assertNotIn("已计算", svg)

    def test_news_render_preserves_publisher_and_hides_evidence_state(self):
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(news_spec(), Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn('data-signal-mode="key_news"', svg)
            self.assertIn("IBM IR", svg)
            self.assertIn("收入掉链子，我先做空 IBM", svg)
            self.assertIn("事件驱动 · 预期修正 · 直接做空", svg)
            self.assertNotIn("待确认", svg)
            self.assertNotIn("已确认", svg)
            self.assertIn("07/14 08:12 UTC", svg)

    def test_trade_horizon_wraps_as_one_phrase(self):
        lines = RENDERER.wrap_text("油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天", 43, 2)
        self.assertTrue(any("窗口看 1-3 天" in line for line in lines), lines)
        self.assertNotEqual(lines[-1], "天")

    def test_manifest_hash_and_asset_validate(self):
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(number_spec(), Path(directory))
            manifest = json.loads(result["manifest_path"].read_text(encoding="utf-8"))
            validation = VALIDATOR.validate_manifest(manifest, Path(directory))
            self.assertTrue(validation["valid"], validation["errors"])
            self.assertEqual(manifest["dimensions"], {"width": 720, "height": 420})


if __name__ == "__main__":
    unittest.main()
