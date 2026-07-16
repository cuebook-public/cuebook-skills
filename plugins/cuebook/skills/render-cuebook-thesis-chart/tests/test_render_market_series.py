from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
MODULE_PATH = ROOT / "scripts" / "render_thesis_chart.py"
SPEC = importlib.util.spec_from_file_location("render_thesis_chart", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def chart_spec() -> dict:
    return {
        "time": {
            "context_start": "2026-07-13T00:00:00Z",
            "horizon_end": "2026-07-14T20:00:00Z",
            "bar_limit": 90,
        }
    }


def series_spec() -> dict:
    return {
        "id": "S1",
        "ticker": "USO",
        "instrument_id": "USO:ARCX",
        "role": "primary",
        "transformation": "return_from_baseline",
        "baseline": {"value": 100.0},
        "provider": {"requested_interval": "15m"},
    }


def market_batch() -> dict:
    return {
        "schema_version": "market-series-batch-v1",
        "fetched_at": "2026-07-14T14:01:00Z",
        "series": [
            {
                "series_ref": "S1",
                "instrument_id": "USO:ARCX",
                "ticker": "USO",
                "interval": "15m",
                "coverage_status": "complete",
                "source_ref": "cuebook-db:ohlcv:USO:15m",
                "provider_id": "cuebook-ohlcv",
                "venue": "ARCX",
                "currency": "USD",
                "timezone": "America/New_York",
                "calendar_ref": "XNYS",
                "session": "regular",
                "quote_basis": "trade",
                "adjustment_basis": "split_adjusted",
                "source_as_of": "2026-07-14T13:52:00Z",
                "license_scope": "display",
                "quality_flags": [],
                "bars": [
                    {
                        "open_time": "2026-07-14T13:30:00Z",
                        "observed_at": "2026-07-14T13:45:00Z",
                        "open": 100.0,
                        "high": 102.0,
                        "low": 99.5,
                        "close": 101.0,
                        "volume": 1000.0,
                        "vwap": 100.7,
                        "state": "sealed",
                        "last_event_time": None,
                    },
                    {
                        "open_time": "2026-07-14T13:45:00Z",
                        "observed_at": "2026-07-14T13:52:00Z",
                        "open": 101.0,
                        "high": 103.0,
                        "low": 100.8,
                        "close": 102.5,
                        "volume": 800.0,
                        "vwap": 102.0,
                        "state": "forming",
                        "last_event_time": "2026-07-14T13:52:00Z",
                    },
                ],
            }
        ],
    }


class CanonicalMarketSeriesTests(unittest.TestCase):
    def test_loads_database_export_and_marks_forming_bar(self):
        result = MODULE.load_canonical_series(chart_spec(), series_spec(), market_batch())
        self.assertEqual(result["observed_interval"], "15m")
        self.assertAlmostEqual(result["points"][0]["derived_value"], 1.0)
        self.assertAlmostEqual(result["points"][1]["derived_value"], 2.5)
        self.assertEqual(result["forming_as_of"], "2026-07-14T13:52:00Z")
        self.assertEqual(result["adjustment_basis"], "split_adjusted")
        self.assertEqual(result["license_scope"], "display")

    def test_rejects_ticker_mismatch(self):
        batch = market_batch()
        batch["series"][0]["ticker"] = "XLE"
        with self.assertRaisesRegex(RuntimeError, "Ticker mismatch"):
            MODULE.load_canonical_series(chart_spec(), series_spec(), batch)


if __name__ == "__main__":
    unittest.main()
