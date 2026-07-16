from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "compute_indicators.py"
SPEC = importlib.util.spec_from_file_location("compute_indicators", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def point(index: int, close: float, state: str = "sealed") -> dict:
    return {
        "observed_at": f"2026-07-{index:02d}T20:00:00Z",
        "open": close - 1,
        "high": close + 1,
        "low": close - 2,
        "close": close,
        "volume": 1000 + index * 10,
        "vwap": close - 0.5,
        "state": state,
    }


def chart_data(forming: bool = False) -> dict:
    primary_points = [point(index, 100 + index) for index in range(1, 16)]
    benchmark_points = [point(index, 50 + index * 0.25) for index in range(1, 16)]
    if forming:
        primary_points.append(point(16, 120, "forming"))
        benchmark_points.append(point(16, 54.5, "forming"))
    return {
        "schema_version": "thesis-chart-data-v1",
        "series": [
            {
                "id": "S1",
                "ticker": "AAA",
                "observed_interval": "1d",
                "baseline": {"value": 100},
                "points": primary_points,
            },
            {
                "id": "S2",
                "ticker": "BBB",
                "observed_interval": "1d",
                "baseline": {"value": 50},
                "points": benchmark_points,
            },
        ],
    }


def request(include_forming: bool = False) -> dict:
    return {
        "schema_version": "indicator-request-v1",
        "request_id": "INDREQ_example20260714",
        "source_ref": "CHART_example20260714:data",
        "source_path": "/tmp/not-used.json",
        "primary_series_ref": "S1",
        "benchmark_series_ref": "S2",
        "include_forming": include_forming,
        "indicators": [
            {"id": "I1", "kind": "return_pct", "lookback_bars": None},
            {"id": "I2", "kind": "relative_strength_pct", "lookback_bars": None},
            {"id": "I3", "kind": "rsi", "lookback_bars": 14},
        ],
    }


class IndicatorTests(unittest.TestCase):
    def test_sealed_indicator_pack(self):
        pack = MODULE.build_pack(request(), chart_data())
        self.assertEqual(pack["quality_report"]["decision"], "ready")
        results = {item["kind"]: item for item in pack["results"]}
        self.assertAlmostEqual(results["return_pct"]["value"], 15.0)
        self.assertAlmostEqual(results["relative_strength_pct"]["value"], 7.5)
        self.assertEqual(results["rsi"]["status"], "ready")

    def test_forming_values_are_provisional(self):
        pack = MODULE.build_pack(request(include_forming=True), chart_data(forming=True))
        self.assertEqual(pack["quality_report"]["decision"], "conditional")
        self.assertTrue(all(item["status"] == "provisional" for item in pack["results"]))

    def test_insufficient_history_is_explicit(self):
        item = request()
        item["indicators"] = [{"id": "I1", "kind": "rsi", "lookback_bars": 30}]
        pack = MODULE.build_pack(item, chart_data())
        self.assertEqual(pack["results"][0]["status"], "insufficient_data")
        self.assertIsNone(pack["results"][0]["value"])

    def test_mixed_intervals_are_rejected(self):
        data = chart_data()
        data["series"][1]["observed_interval"] = "1h"
        with self.assertRaises(ValueError):
            MODULE.build_pack(request(), data)


if __name__ == "__main__":
    unittest.main()
