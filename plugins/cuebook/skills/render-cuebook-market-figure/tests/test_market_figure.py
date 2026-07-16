from __future__ import annotations

import copy
import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VALIDATOR = load_module("market_figure_validator_test", ROOT / "scripts" / "validate_market_figure.py")
RENDERER = load_module("market_figure_renderer_test", ROOT / "scripts" / "render_market_figure.py")


def contrast_ratio(foreground: str, background: str) -> float:
    def luminance(value: str) -> float:
        channels = [int(value[index : index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

    first, second = luminance(foreground), luminance(background)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)


def relative_spec() -> dict:
    return {
        "schema_version": "market-figure-spec-v1",
        "spec_id": "FIGSPEC_testrelative20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": ["POST_testrelative20260714", "SETTLE_testrelative20260714"],
            "visual_argument_ref": "VARG_testrelative20260714",
            "thesis_chart_ref": "CHART_testrelative20260714",
            "chart_data_ref": "CHART_testrelative20260714:data",
            "indicator_pack_ref": "INDPACK_testrelative20260714",
            "settlement_claim_ref": "SETTLE_testrelative20260714",
            "news_fact_refs": ["F1"],
            "decision_cutoff_at": "2026-07-14T08:30:00Z",
        },
        "grammar": "relative_strength",
        "frame": {
            "kicker": "霍尔木兹风险",
            "headline": "同一条供应冲击，USO 暂时跑得更快",
            "viewpoint": "原油期货先吸收航运风险，能源股还要经过现金流和权益 beta。",
        },
        "news_anchor": {
            "headline": "油轮在霍尔木兹南侧出港航道遇袭",
            "publisher": "UKMTO",
            "published_at": "2026-07-14T07:27:30Z",
            "status": "observed",
            "fact_refs": ["F1"],
            "source_refs": ["source:ukmto:test"],
        },
        "curve": {
            "title": "自 7 月 13 日收盘以来的同步收益率",
            "x_axis": {"kind": "time", "label": "时间", "unit": "UTC", "zero_policy": "adaptive"},
            "y_axis": {"kind": "value", "label": "累计收益率", "unit": "%", "zero_policy": "include"},
            "series": [
                {
                    "id": "S1",
                    "label": "USO",
                    "role": "primary",
                    "data_kind": "observed",
                    "transformation": "return_from_baseline",
                    "unit": "%",
                    "source_ref": "cuebook:market.candles:USO",
                    "formula": None,
                    "baseline": {"value": 117.79, "observed_at": "2026-07-13T20:00:00Z", "source_ref": "cuebook:market.latest:USO"},
                    "points": [
                        {"x": "2026-07-13T20:00:00Z", "y": 0.0, "state": "sealed", "source_ref": None},
                        {"x": "2026-07-14T08:27:43Z", "y": 2.56, "state": "forming", "source_ref": None},
                    ],
                },
                {
                    "id": "S2",
                    "label": "XLE",
                    "role": "benchmark",
                    "data_kind": "observed",
                    "transformation": "return_from_baseline",
                    "unit": "%",
                    "source_ref": "cuebook:market.candles:XLE",
                    "formula": None,
                    "baseline": {"value": 56.74, "observed_at": "2026-07-13T20:00:00Z", "source_ref": "cuebook:market.latest:XLE"},
                    "points": [
                        {"x": "2026-07-13T20:00:00Z", "y": 0.0, "state": "sealed", "source_ref": None},
                        {"x": "2026-07-14T08:26:07Z", "y": 0.53, "state": "forming", "source_ref": None},
                    ],
                },
            ],
            "markers": [
                {"id": "M1", "kind": "event", "x": "2026-07-14T07:27:30Z", "y": None, "label": "遇袭", "status": "observed", "source_ref": "source:ukmto:test"},
                {"id": "M2", "kind": "expiry", "x": "2026-07-14T20:00:00Z", "y": None, "label": "结算", "status": "proposed", "source_ref": "SETTLE_testrelative20260714"},
            ],
        },
        "key_numbers": [
            {"id": "K1", "label": "USO", "display_value": "+2.56%", "numeric_value": 2.56, "unit": "%", "as_of": "2026-07-14T08:27:43Z", "role": "magnitude", "status": "provisional", "source_ref": "INDPACK_test:I1"},
            {"id": "K2", "label": "XLE", "display_value": "+0.53%", "numeric_value": 0.53, "unit": "%", "as_of": "2026-07-14T08:26:07Z", "role": "comparison", "status": "provisional", "source_ref": "INDPACK_test:I2"},
            {"id": "K3", "label": "超额收益", "display_value": "+2.03pp", "numeric_value": 2.03, "unit": "pp", "as_of": "2026-07-14T08:27:43Z", "role": "settlement", "status": "provisional", "source_ref": "INDPACK_test:I3"},
        ],
        "countercase": {"label": "反例", "condition": "若保险条件未升级且通行恢复，风险溢价可能回吐。", "source_refs": ["source:imo:test"]},
        "settlement": {
            "settleable": True,
            "claim_ref": "SETTLE_testrelative20260714",
            "deadline_at": "2026-07-14T20:00:00Z",
            "success_line": "7 月 14 日收盘时，USO 收益率高于 XLE。",
            "status": "needs_confirmation",
        },
        "render": {"layout": "compact", "width": 720, "height": 420, "theme": "cuebook_light", "watermark": "Cuebook", "show_legend": True, "show_sources": True},
        "quality_report": {
            "decision": "conditional",
            "warnings": ["Cuebook returned daily data and the latest bars are forming."],
            "hard_failures": [],
        },
    }


def instrument_map_spec() -> dict:
    payload = relative_spec()
    payload.update(
        {
            "spec_id": "FIGSPEC_testinstrumentmap20260714",
            "state": "ready",
            "grammar": "instrument_map",
            "frame": {
                "kicker": "内存周期 · ETF 工具",
                "headline": "同一轮内存行情，四只 ETF 买到的暴露不同",
                "viewpoint": "风险轴使用共同 20 日窗口，暴露轴来自各基金持仓或指数成分。",
            },
            "news_anchor": None,
            "curve": {
                "title": "共同 20 日年化波动 vs 内存生产商暴露",
                "x_axis": {"kind": "numeric", "label": "20日年化波动", "unit": "%", "zero_policy": "adaptive"},
                "y_axis": {"kind": "value", "label": "内存暴露", "unit": "pct", "zero_policy": "include"},
                "series": [
                    {
                        "id": "S1",
                        "label": "ETF 工具",
                        "role": "primary",
                        "data_kind": "formula",
                        "transformation": "risk_exposure_map",
                        "unit": "pct",
                        "source_ref": "VEHICLEPACK_memory_etfs_20260714",
                        "formula": "x=stdev(log_returns,20d)*sqrt(252); y=sum(memory_producer_weights)",
                        "baseline": None,
                        "points": [
                            {"x": 31.2, "y": 4.9, "state": "sealed", "source_ref": "VEHICLE_SMH", "label": "SMH"},
                            {"x": 43.8, "y": 47.33, "state": "sealed", "source_ref": "VEHICLE_EWY", "label": "EWY"},
                            {"x": 56.5, "y": 96.0, "state": "sealed", "source_ref": "VEHICLE_DRAM", "label": "DRAM"},
                            {"x": 118.4, "y": 41.62, "state": "sealed", "source_ref": "VEHICLE_KORU", "label": "KORU · 日3×"},
                        ],
                    }
                ],
                "markers": [],
            },
            "key_numbers": [
                {"id": "K1", "label": "EWY 两大内存股", "display_value": "47.33%", "numeric_value": 47.33, "unit": "%", "as_of": "2026-07-07T20:00:00Z", "role": "comparison", "status": "observed", "source_ref": "VEHICLE_EWY"},
                {"id": "K2", "label": "KORU 日目标", "display_value": "3×", "numeric_value": 3, "unit": "x", "as_of": "2026-07-13T20:00:00Z", "role": "risk", "status": "observed", "source_ref": "VEHICLE_KORU"},
            ],
            "countercase": None,
            "settlement": {"settleable": False, "claim_ref": None, "deadline_at": None, "success_line": None, "status": "none"},
            "quality_report": {"decision": "ready", "warnings": [], "hard_failures": []},
        }
    )
    payload["lineage"].update(
        {
            "input_artifact_refs": ["VEHICLEPACK_memory_etfs_20260714"],
            "visual_argument_ref": None,
            "thesis_chart_ref": None,
            "chart_data_ref": "VEHICLEPACK_memory_etfs_20260714",
            "indicator_pack_ref": "INDPACK_memory_etfs_risk20d_20260714",
            "settlement_claim_ref": None,
            "news_fact_refs": [],
        }
    )
    return payload


def semantic_relative_spec() -> dict:
    payload = relative_spec()
    payload["argument_path"] = {
        "mode": "causal_chain",
        "nodes": [
            {
                "id": "N1",
                "kind": "event",
                "label": "油轮在霍尔木兹出港航道遇袭",
                "status": "observed",
                "source_refs": ["source:ukmto:test"],
            },
            {
                "id": "N2",
                "kind": "mechanism",
                "label": "航运风险先进入原油期货",
                "status": "derived",
                "source_refs": ["source:uso:methodology"],
            },
            {
                "id": "N3",
                "kind": "actor_action",
                "label": "短线资金先买直接原油敞口",
                "status": "derived",
                "source_refs": ["cuebook:market.candles:USO", "cuebook:market.candles:XLE"],
            },
            {
                "id": "N4",
                "kind": "market_effect",
                "label": "USO 先于 XLE 重定价",
                "status": "conditional",
                "source_refs": ["INDPACK_test:I3"],
            },
        ],
        "edges": [
            {"from": "N1", "to": "N2", "relation": "causes", "certainty": "inferred", "label": "风险重估"},
            {"from": "N2", "to": "N3", "relation": "enables", "certainty": "inferred", "label": "传导更直接"},
            {"from": "N3", "to": "N4", "relation": "causes", "certainty": "hypothesis", "label": "先后顺序"},
        ],
    }
    payload["trade_logic"] = {
        "profile_ref": "TLOGIC_USO_XLE_HORMUZ_20260714",
        "family": "event_driven",
        "mechanism": "risk_premium_transmission",
        "expression": "relative_value_pair",
        "horizon": "one_to_three_days",
        "public_tags": ["事件驱动", "风险溢价传导", "相对价值"],
    }
    payload["render"]["semantic_mode"] = "argument_curve"
    return payload


class MarketFigureTests(unittest.TestCase):
    def test_trade_horizon_wraps_as_one_phrase(self):
        lines = RENDERER.wrap_text("油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天", 40, 2)
        self.assertTrue(any("窗口看 1-3 天" in line for line in lines), lines)
        self.assertNotEqual(lines[-1], "天")

    def test_valid_relative_spec(self):
        result = VALIDATOR.validate_spec(relative_spec())
        self.assertTrue(result["valid"], result["errors"])

    def test_valid_editorial_dimensions(self):
        payload = relative_spec()
        payload["render"].update({"layout": "editorial", "width": 1200, "height": 760})
        result = VALIDATOR.validate_spec(payload)
        self.assertTrue(result["valid"], result["errors"])

    def test_valid_semantic_argument_curve(self):
        result = VALIDATOR.validate_spec(semantic_relative_spec())
        self.assertTrue(result["valid"], result["errors"])

    def test_argument_curve_requires_linear_sourced_path(self):
        payload = semantic_relative_spec()
        payload["argument_path"]["nodes"][1]["source_refs"] = []
        payload["argument_path"]["edges"][0].update({"from": "N2", "to": "N1"})
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        codes = {item["code"] for item in result["errors"]}
        self.assertIn("ARGUMENT_NODE_SOURCE", codes)
        self.assertIn("ARGUMENT_PATH_ORDER", codes)

    def test_semantic_compact_renders_reasoning_and_curve(self):
        payload = semantic_relative_spec()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(payload, Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertEqual(svg.count('data-argument-node="'), 4)
            self.assertIn("导火索", svg)
            self.assertIn("为什么先动", svg)
            self.assertIn("钱先去哪", svg)
            self.assertIn("我押什么", svg)
            self.assertIn("事件驱动 · 风险溢价传导 · 相对价值", svg)
            for term in ("已发生", "已计算", "推演", "待确认"):
                self.assertNotIn(f">{term}<", svg)
            self.assertIn('data-argument-edge="hypothesis"', svg)
            self.assertIn("07/14 08:30 UTC", svg)
            self.assertIn("USO", svg)
            manifest = json.loads(result["manifest_path"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["lineage"]["argument_node_refs"], ["N1", "N2", "N3", "N4"])
            self.assertEqual(manifest["lineage"]["trade_logic_ref"], "TLOGIC_USO_XLE_HORMUZ_20260714")
            self.assertEqual(len(manifest["content"]["argument_path_labels"]), 4)
            self.assertEqual(manifest["content"]["strategy_tags"], ["事件驱动", "风险溢价传导", "相对价值"])

    def test_valid_instrument_map(self):
        result = VALIDATOR.validate_spec(instrument_map_spec())
        self.assertTrue(result["valid"], result["errors"])

    def test_instrument_map_requires_labeled_points(self):
        payload = instrument_map_spec()
        payload["curve"]["series"][0]["points"][0]["label"] = None
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("INSTRUMENT_MAP_INPUTS", {item["code"] for item in result["errors"]})

    def test_instrument_map_renders_points_without_connecting_path(self):
        payload = instrument_map_spec()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(payload, Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertEqual(svg.count('data-plot-kind="instrument-map"'), 4)
            self.assertIn("KORU · 日3×", svg)
            self.assertIn("20日年化波动", svg)

    def test_compact_renders_horizontal_level_marker(self):
        payload = relative_spec()
        payload["curve"]["markers"].append(
            {
                "id": "M3",
                "kind": "baseline",
                "x": "2026-07-13T20:00:00Z",
                "y": 1.0,
                "label": "参考线",
                "status": "observed",
                "source_ref": "source:baseline:test",
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(payload, Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn('data-marker-orientation="horizontal"', svg)
            self.assertIn("参考线", svg)

    def test_formats_financial_units(self):
        self.assertEqual(RENDERER.fmt_y(139.14, "USD"), "$139.14")
        self.assertEqual(RENDERER.fmt_axis_y(139.14, "USD"), "$139")
        self.assertEqual(RENDERER.fmt_y(1_913_000, "KRW"), "₩1.91m")
        self.assertEqual(RENDERER.fmt_axis_y(1_913_000, "KRW"), "₩1.9m")
        self.assertEqual(RENDERER.fmt_y(98.2, "x"), "98.2×")

    def test_taste_review_palette_uses_neutral_driver(self):
        self.assertEqual(RENDERER.PALETTES["cuebook_light"]["driver"], "#315D57")
        self.assertNotEqual(RENDERER.PALETTES["cuebook_light"]["driver"], "#8D5FC7")

    def test_semantic_inks_meet_small_text_contrast(self):
        ink_keys = {"ink", "muted", "primary", "benchmark", "driver", "context", "yellow_ink", "red"}
        for theme, palette in RENDERER.PALETTES.items():
            for surface_key in ("bg", "surface"):
                for ink_key in ink_keys:
                    with self.subTest(theme=theme, surface=surface_key, ink=ink_key):
                        self.assertGreaterEqual(contrast_ratio(palette[ink_key], palette[surface_key]), 4.5)

    def test_rejects_unsynchronized_relative_baseline(self):
        payload = relative_spec()
        payload["curve"]["series"][1]["baseline"]["observed_at"] = "2026-07-12T20:00:00Z"
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("RELATIVE_INPUTS", {item["code"] for item in result["errors"]})

    def test_rejects_modelled_time_path(self):
        payload = relative_spec()
        payload["curve"]["series"][0]["data_kind"] = "formula"
        payload["curve"]["series"][0]["formula"] = "future price guess"
        payload["curve"]["series"][0]["points"][-1]["state"] = "modelled"
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("MODELLED_PATH", {item["code"] for item in result["errors"]})

    def test_event_reaction_requires_news(self):
        payload = relative_spec()
        payload["grammar"] = "event_reaction"
        payload["news_anchor"] = None
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("EVENT_REACTION_INPUTS", {item["code"] for item in result["errors"]})

    def test_multiseries_source_chart_redraw_renders_focus_and_canonical_brand(self):
        payload = relative_spec()
        payload["spec_id"] = "FIGSPEC_testredraw20260715"
        payload["grammar"] = "positioning_pressure"
        payload["lineage"]["settlement_claim_ref"] = None
        payload["settlement"] = {"settleable": False, "claim_ref": None, "deadline_at": None, "success_line": None, "status": "none"}
        payload["curve"]["data_fidelity"] = "source_chart_redraw"
        payload["curve"]["markers"] = payload["curve"]["markers"][:1]
        seed = payload["curve"]["series"][0]
        series = []
        for index in range(5):
            item = copy.deepcopy(seed)
            item.update(
                {
                    "id": f"S{index + 1}",
                    "label": f"Series {index + 1}",
                    "role": "primary" if index == 0 else "context",
                    "data_kind": "digitized_observed",
                    "transformation": "positioning",
                    "unit": "ratio",
                    "source_ref": "source-chart:test",
                    "stroke_style": "dashed" if index == 0 else "solid",
                    "color_role": "focus" if index < 2 else "support",
                    "formula": None,
                    "baseline": None,
                }
            )
            for point_index, point in enumerate(item["points"]):
                point["y"] = index * 0.1 + point_index * 0.05
                point["state"] = "sealed"
            series.append(item)
        payload["curve"]["series"] = series
        payload["render"]["focus_series_ids"] = ["S1", "S2", "S3", "S4"]
        payload["render"]["endpoint_series_ids"] = ["S1", "S2"]
        payload["quality_report"] = {
            "decision": "conditional",
            "warnings": ["Source-chart redraw digitized from a supplied screenshot."],
            "hard_failures": [],
        }
        result = VALIDATOR.validate_spec(payload)
        self.assertTrue(result["valid"], result["errors"])
        with tempfile.TemporaryDirectory() as directory:
            rendered = RENDERER.render(payload, Path(directory))
            svg = rendered["svg_path"].read_text(encoding="utf-8")
            self.assertIn('data-data-kind="digitized_observed"', svg)
            self.assertIn('stroke-dasharray="8 6"', svg)
            self.assertIn('data-cuebook-wordmark="v1"', svg)
            self.assertNotIn("▮ Cuebook", svg)
            self.assertNotIn("Series 5", svg)

    def test_digitized_redraw_cannot_settle(self):
        payload = relative_spec()
        payload["curve"]["data_fidelity"] = "source_chart_redraw"
        for series in payload["curve"]["series"]:
            series["data_kind"] = "digitized_observed"
        payload["quality_report"]["warnings"].append("Source-chart redraw from screenshot.")
        result = VALIDATOR.validate_spec(payload)
        self.assertFalse(result["valid"])
        self.assertIn("DIGITIZED_SETTLEMENT", {item["code"] for item in result["errors"]})

    def test_render_writes_valid_manifest_and_svg(self):
        payload = relative_spec()
        with tempfile.TemporaryDirectory() as directory:
            result = RENDERER.render(payload, Path(directory))
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn("同一条供应冲击", svg)
            self.assertIn("油轮在霍尔木兹", svg)
            self.assertIn("+2.03pp", svg)
            self.assertNotIn("7 月 14 日收盘时", svg)
            self.assertNotIn("虚线为形成中", svg)
            self.assertNotIn("条数据引用", svg)
            self.assertIn("07/14 08:30 UTC", svg)
            self.assertIn('font-variant-numeric="tabular-nums"', svg)
            self.assertNotIn("font-feature-settings", svg)
            weights = {int(value) for value in re.findall(r'font-weight="(\d+)"', svg)}
            self.assertTrue(weights.issubset({400, 500, 600, 700, 800}), weights)
            self.assertNotIn("Cuebook 补全", svg)
            manifest = json.loads(result["manifest_path"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["layout"], "compact")
            self.assertEqual(manifest["dimensions"], {"width": 720, "height": 420})
            self.assertEqual(manifest["content"]["settlement_line"], "7 月 14 日收盘时，USO 收益率高于 XLE。")
            validation = VALIDATOR.validate_manifest(manifest, Path(directory))
            self.assertTrue(validation["valid"], validation["errors"])


if __name__ == "__main__":
    unittest.main()
