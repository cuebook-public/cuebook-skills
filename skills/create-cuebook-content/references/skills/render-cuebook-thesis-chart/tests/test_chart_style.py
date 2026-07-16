from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "audit_chart_svg.py"
SPEC = importlib.util.spec_from_file_location("audit_chart_svg", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ChartStyleAuditTests(unittest.TestCase):
    def audit_svg(self, body: str) -> dict:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chart.svg"
            path.write_text(body, encoding="utf-8")
            return MODULE.audit(path)

    def test_accepts_clean_feed_svg(self):
        result = self.audit_svg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" '
            'data-style-profile="cuebook_feed_v1" font-variant-numeric="tabular-nums" letter-spacing="0">'
            '<title>Chart</title><desc>Claim</desc>'
            '<text id="public-title"><tspan>观点标题</tspan></text><text>Cuebook</text></svg>'
        )
        self.assertTrue(result["valid"], result["errors"])

    def test_rejects_feed_internal_state_and_gradient(self):
        result = self.audit_svg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" '
            'data-style-profile="cuebook_feed_v1" font-variant-numeric="tabular-nums" letter-spacing="0">'
            '<linearGradient id="g"/><text id="public-title"><tspan>观点</tspan></text>'
            '<text>CONDITIONAL Cuebook OHLCV Cuebook</text></svg>'
        )
        self.assertFalse(result["valid"])
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("DECORATIVE_EFFECT", codes)
        self.assertIn("FEED_LEAKAGE", codes)


if __name__ == "__main__":
    unittest.main()
