from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "select_creator_palette.py"
SPEC = importlib.util.spec_from_file_location("select_creator_palette", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PaletteSelectionTests(unittest.TestCase):
    @staticmethod
    def _luminance(value: str) -> float:
        channels = [int(value[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        channels = [item / 12.92 if item <= 0.04045 else ((item + 0.055) / 1.055) ** 2.4 for item in channels]
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    @classmethod
    def _contrast(cls, first: str, second: str) -> float:
        high, low = sorted((cls._luminance(first), cls._luminance(second)), reverse=True)
        return (high + 0.05) / (low + 0.05)

    def test_registry_tokens_clear_contrast_floors(self) -> None:
        registry = MODULE.json.loads(MODULE.REGISTRY_PATH.read_text(encoding="utf-8"))
        for preset in registry["presets"]:
            tokens = preset["tokens"]
            self.assertGreaterEqual(self._contrast(tokens["ink_1"], tokens["surface_0"]), 7.0, preset["preset_id"])
            self.assertGreaterEqual(self._contrast(tokens["ink_2"], tokens["surface_0"]), 4.5, preset["preset_id"])
            for token in ("accent_a", "accent_b", "accent_c", "risk"):
                self.assertGreaterEqual(self._contrast(tokens[token], tokens["surface_0"]), 3.0, f"{preset['preset_id']}:{token}")

    def test_returns_three_distinct_strategies_and_presets(self) -> None:
        result = MODULE.select({
            "register": "strategist", "energy": 3, "conviction": 4,
            "technicality": 4, "emotionality": 2, "compression": 4,
            "content_mode": "mechanism", "evidence_mode": "causal_path", "direction": "long",
        })
        self.assertEqual([item["strategy"] for item in result["selections"]], list(MODULE.STRATEGIES))
        self.assertEqual(len({item["preset_id"] for item in result["selections"]}), 3)

    def test_signature_palette_leads_creator_native(self) -> None:
        result = MODULE.select({
            "register": "research_memo", "signature_palette_id": "premium-monochrome",
            "content_mode": "valuation", "evidence_mode": "key_numbers",
        })
        self.assertEqual(result["selections"][0]["preset_id"], "premium-monochrome")

    def test_high_energy_meme_uses_an_expressive_creator_palette(self) -> None:
        result = MODULE.select({
            "register": "meme", "energy": 5, "conviction": 5,
            "technicality": 3, "emotionality": 5,
            "content_mode": "cycle", "evidence_mode": "curve",
        })
        self.assertIn(result["selections"][0]["preset_id"], {"signal-lime", "terminal-cyan"})

    def test_recent_palette_is_penalized_without_signature_lock(self) -> None:
        baseline = MODULE.select({
            "register": "meme", "energy": 5, "conviction": 5,
            "technicality": 3, "emotionality": 5,
            "content_mode": "cycle", "evidence_mode": "curve",
        })
        recent = baseline["selections"][0]["preset_id"]
        result = MODULE.select({
            "register": "meme", "energy": 5, "conviction": 5,
            "technicality": 3, "emotionality": 5,
            "content_mode": "cycle", "evidence_mode": "curve",
            "recent_palette_ids": [recent],
        })
        self.assertNotEqual(result["selections"][0]["preset_id"], recent)

    def test_restrained_profile_does_not_get_vivid_contrast(self) -> None:
        result = MODULE.select({
            "register": "research_memo", "energy": 2, "conviction": 3,
            "technicality": 5, "emotionality": 1,
            "content_mode": "valuation", "evidence_mode": "key_numbers",
        })
        preset_id = result["selections"][2]["preset_id"]
        registry = {item["preset_id"]: item for item in MODULE.json.loads(MODULE.REGISTRY_PATH.read_text(encoding="utf-8"))["presets"]}
        self.assertNotEqual(registry[preset_id]["chroma"], "vivid")


if __name__ == "__main__":
    unittest.main()
