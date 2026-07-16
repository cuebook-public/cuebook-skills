from __future__ import annotations

import copy
import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
MODULE_PATH = ROOT / "scripts" / "validate_thesis_chart.py"
SPEC = importlib.util.spec_from_file_location("validate_thesis_chart", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

RENDERER_PATH = ROOT / "scripts" / "render_thesis_chart.py"
RENDERER_SPEC = importlib.util.spec_from_file_location("render_thesis_chart", RENDERER_PATH)
RENDERER = importlib.util.module_from_spec(RENDERER_SPEC)
assert RENDERER_SPEC and RENDERER_SPEC.loader
RENDERER_SPEC.loader.exec_module(RENDERER)


def base_spec() -> dict:
    baseline_time = "2026-07-13T20:00:00Z"
    provider = {
        "name": "Cuebook",
        "endpoint": "https://cuebook.xyz/api/trpc/market.candles",
        "requested_interval": "15m",
        "observed_interval": "1d",
        "coverage_status": "partial",
        "as_of": "2026-07-14T08:00:00Z",
    }
    return {
        "schema_version": "thesis-chart-v1",
        "chart_id": "CHART_usovsxle20260714",
        "revision": 1,
        "state": "conditional",
        "lineage": {
            "input_artifact_refs": ["SETTLE_usovsxle20260714"],
            "thesis_ref": None,
            "settlement_claim_ref": "SETTLE_usovsxle20260714",
        },
        "role": "settlement",
        "claim": {
            "evaluation_kind": "relative_performance",
            "direction": "outperform",
            "action_state": "enter_now",
            "statement": "USO total return exceeds XLE total return at expiry.",
        },
        "time": {
            "declared_at": "2026-07-14T07:37:13Z",
            "horizon_end": "2026-07-14T20:00:00Z",
            "timezone": "America/New_York",
            "market_session": "regular",
            "horizon_seconds": 44567,
            "context_start": "2026-06-15T00:00:00Z",
            "preferred_interval": "15m",
            "observed_interval": "1d",
            "interval_status": "degraded",
            "bar_limit": 90,
        },
        "series": [
            {
                "id": "S1",
                "ticker": "USO",
                "display_name": "United States Oil Fund",
                "instrument_id": "USO:ARCX",
                "asset_id": 198,
                "role": "primary",
                "transformation": "return_from_baseline",
                "baseline": {
                    "value": 117.79,
                    "unit": "USD",
                    "observed_at": baseline_time,
                    "observation_basis": "last_close",
                    "market_state": "closed",
                    "source_ref": "cuebook:market.latest:asset:198",
                },
                "provider": copy.deepcopy(provider),
            },
            {
                "id": "S2",
                "ticker": "XLE",
                "display_name": "Energy Select Sector SPDR Fund",
                "instrument_id": "XLE:ARCX",
                "asset_id": 148,
                "role": "benchmark",
                "transformation": "return_from_baseline",
                "baseline": {
                    "value": 56.74,
                    "unit": "USD",
                    "observed_at": baseline_time,
                    "observation_basis": "last_close",
                    "market_state": "closed",
                    "source_ref": "cuebook:market.latest:asset:148",
                },
                "provider": copy.deepcopy(provider),
            },
        ],
        "annotations": [
            {
                "id": "A1",
                "kind": "baseline",
                "series_ref": None,
                "value": None,
                "observed_at": baseline_time,
                "label": "BASELINE",
                "provenance": "explicit",
                "source_ref": "SETTLE_usovsxle20260714",
            },
            {
                "id": "A2",
                "kind": "declaration",
                "series_ref": None,
                "value": None,
                "observed_at": "2026-07-14T07:37:13Z",
                "label": "DECLARED",
                "provenance": "explicit",
                "source_ref": "SETTLE_usovsxle20260714",
            },
            {
                "id": "A3",
                "kind": "expiry",
                "series_ref": None,
                "value": None,
                "observed_at": "2026-07-14T20:00:00Z",
                "label": "EXPIRY",
                "provenance": "explicit",
                "source_ref": "SETTLE_usovsxle20260714",
            },
        ],
        "render": {
            "mode": "relative_performance",
            "chart_type": "line",
            "y_axis": "return_pct",
            "width": 1200,
            "height": 560,
            "future_region": True,
            "show_volume": False,
            "show_forming_bar": True,
            "forecast_path": "none",
            "title": "USO vs XLE",
            "subtitle": "Returns from synchronized July 13 closes",
            "success_label": "Success: USO return > XLE return at expiry",
        },
        "quality_report": {
            "decision": "conditional",
            "warnings": ["Only daily bars are currently available for a one-session claim."],
            "hard_failures": [],
        },
    }


class ThesisChartValidationTests(unittest.TestCase):
    def test_valid_relative_conditional_chart(self):
        result = MODULE.validate(base_spec())
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("DEGRADED_INTERVAL", {item["code"] for item in result["warnings"]})

    def test_relative_baselines_must_be_synchronized(self):
        item = base_spec()
        item["series"][1]["baseline"]["observed_at"] = "2026-07-13T19:59:00Z"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("RELATIVE_BASELINE_TIME", {entry["code"] for entry in result["errors"]})

    def test_future_path_is_rejected(self):
        item = base_spec()
        item["render"]["forecast_path"] = "projected_curve"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("FORECAST_PATH", {entry["code"] for entry in result["errors"]})

    def test_degraded_chart_cannot_be_ready(self):
        item = base_spec()
        item["state"] = "ready"
        item["quality_report"] = {"decision": "ready", "warnings": [], "hard_failures": []}
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("READY_INTERVAL", {entry["code"] for entry in result["errors"]})

    def test_wait_for_trigger_requires_visible_trigger(self):
        item = base_spec()
        item["claim"]["action_state"] = "wait_for_trigger"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("TRIGGER_ANNOTATION", {entry["code"] for entry in result["errors"]})

    def test_open_ended_evidence_trigger_does_not_invent_expiry(self):
        item = base_spec()
        item["role"] = "evidence"
        item["claim"]["action_state"] = "wait_for_trigger"
        item["time"].update({
            "horizon_status": "unspecified",
            "horizon_end": None,
            "horizon_seconds": None,
        })
        item["render"].update({
            "future_region": False,
            "timeline_layout": "continuous_time",
        })
        item["annotations"] = [entry for entry in item["annotations"] if entry["kind"] != "expiry"]
        item["annotations"].append({
            "id": "A4",
            "kind": "trigger",
            "series_ref": "S1",
            "value": 120.0,
            "observed_at": None,
            "label": "TRIGGER",
            "provenance": "explicit",
            "source_ref": "creator:test",
        })
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_candles_require_raw_price_axis_and_single_series(self):
        item = base_spec()
        item["claim"].update({"evaluation_kind": "price_target", "direction": "long"})
        item["series"] = item["series"][:1]
        item["series"][0]["transformation"] = "raw_price"
        item["render"].update({"mode": "single_price", "chart_type": "candles", "y_axis": "return_pct"})
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("CANDLE_AXIS", {entry["code"] for entry in result["errors"]})

    def test_volume_panel_requires_one_series_and_valid_window(self):
        item = base_spec()
        item["render"].update({"show_volume": True, "volume_average_window": 4})
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("VOLUME_SERIES", codes)
        self.assertIn("VOLUME_WINDOW", codes)

    def test_decision_split_requires_declaration_marker(self):
        item = base_spec()
        item["render"].update({
            "brand": "cuebook",
            "watermark": True,
            "timeline_layout": "decision_split",
            "decision_split_ratio": 0.68,
            "show_settlement_panel": True,
        })
        item["annotations"] = [entry for entry in item["annotations"] if entry["kind"] != "declaration"]
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("DECLARATION_ANNOTATION", {entry["code"] for entry in result["errors"]})

    def test_compact_chart_keeps_success_prose_outside_svg(self):
        item = base_spec()
        item["render"].update({
            "style_profile": "cuebook_feed_v1",
            "theme": "cuebook_light",
            "brand": "cuebook",
            "watermark": True,
            "show_state_label": False,
            "show_provenance_footer": False,
            "show_guide": False,
            "locale": "zh-CN",
            "timeline_layout": "decision_split",
            "decision_split_ratio": 0.68,
            "show_settlement_panel": False,
        })
        fetched = [
            {
                "ticker": "USO",
                "role": "primary",
                "observed_interval": "1d",
                "points": [
                    {"observed_at": "2026-07-13T20:00:00Z", "derived_value": 0.0, "state": "sealed"},
                    {"observed_at": "2026-07-14T08:00:00Z", "derived_value": 2.0, "state": "forming"},
                ],
            },
            {
                "ticker": "XLE",
                "role": "benchmark",
                "observed_interval": "1d",
                "points": [
                    {"observed_at": "2026-07-13T20:00:00Z", "derived_value": 0.0, "state": "sealed"},
                    {"observed_at": "2026-07-14T08:00:00Z", "derived_value": 0.5, "state": "forming"},
                ],
            },
        ]
        svg = RENDERER.render_svg(item, fetched)
        self.assertNotIn(item["render"]["success_label"], svg)
        self.assertIn("结算", svg)
        self.assertNotIn("Cuebook OHLCV", svg)
        self.assertNotIn("CONDITIONAL", svg)
        self.assertIn('data-style-profile="cuebook_feed_v1"', svg)
        self.assertIn("Cuebook", svg)

    def test_feed_profile_rejects_internal_copy_and_detail_panel(self):
        item = base_spec()
        item["render"].update({
            "style_profile": "cuebook_feed_v1",
            "watermark": True,
            "show_settlement_panel": True,
            "subtitle": "Cuebook 从观点描述中提取参数",
        })
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("FEED_SETTLEMENT_PANEL", codes)
        self.assertIn("FEED_INTERNAL_COPY", codes)

    def test_volume_panel_renders_bars_prior_average_and_ratio(self):
        item = base_spec()
        item["claim"].update({
            "evaluation_kind": "directional_return",
            "direction": "long",
            "action_state": "wait_for_trigger",
            "statement": "BTC closes above 65,000 on expanding volume.",
        })
        item["series"] = item["series"][:1]
        item["series"][0].update({
            "ticker": "BTC",
            "display_name": "Bitcoin",
            "instrument_id": "BTC:USD",
            "asset_id": 1,
            "transformation": "raw_price",
        })
        item["series"][0]["baseline"].update({"value": 64000.0, "unit": "USD"})
        item["render"].update({
            "mode": "single_price",
            "chart_type": "candles",
            "y_axis": "price",
            "width": 720,
            "height": 420,
            "future_region": False,
            "show_volume": True,
            "volume_average_window": 20,
            "theme": "cuebook_light",
            "style_profile": "cuebook_feed_v1",
            "watermark": True,
            "locale": "zh-CN",
            "timeline_layout": "continuous_time",
            "title": "65,000 上方放量收盘",
            "subtitle": "BTC / USD · 4H",
        })
        item["annotations"].append({
            "id": "A4",
            "kind": "trigger",
            "series_ref": "S1",
            "value": 65000,
            "observed_at": None,
            "label": "65,000 触发",
            "provenance": "explicit",
            "source_ref": "creator:test",
        })
        start = datetime(2026, 7, 10, tzinfo=timezone.utc)
        points = []
        for index in range(25):
            open_value = 63000.0 + index * 70.0
            close_value = open_value + (120.0 if index % 2 == 0 else -80.0)
            points.append({
                "observed_at": (start + timedelta(hours=index * 4)).isoformat().replace("+00:00", "Z"),
                "open": open_value,
                "high": max(open_value, close_value) + 110.0,
                "low": min(open_value, close_value) - 90.0,
                "close": close_value,
                "volume": 900.0 + index * 25.0,
                "derived_value": close_value,
                "state": "sealed",
            })
        fetched = [{
            "ticker": "BTC",
            "role": "primary",
            "observed_interval": "4h",
            "points": points,
        }]
        svg = RENDERER.render_svg(item, fetched)
        self.assertIn('<g id="volume-panel" data-average-window="20">', svg)
        self.assertIn('class="volume-bar"', svg)
        self.assertIn('id="volume-average"', svg)
        self.assertIn('id="volume-ratio"', svg)
        self.assertIn("前20根均量", svg)

        item["render"]["show_volume"] = False
        without_volume = RENDERER.render_svg(item, fetched)
        self.assertNotIn('id="volume-panel"', without_volume)


if __name__ == "__main__":
    unittest.main()
