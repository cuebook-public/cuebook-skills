#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "stage_noi_font_assets.py"
SPEC = importlib.util.spec_from_file_location("stage_noi_font_assets", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def make_fonts(root: Path, prefix: str = "NoiGrotesk") -> None:
    for weight in ("Regular", "Medium", "Semibold", "Bold"):
        (root / f"{prefix}-{weight}.ttf").write_bytes(f"font:{weight}".encode())


class StageNoiFontAssetsTests(unittest.TestCase):
    def test_evaluation_stages_original_files_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "Noi Grotesk Family TRIAL"
            target = root / "artifact" / "fonts"
            source.mkdir()
            make_fonts(source)
            manifest = MODULE.stage(source, target, license_mode="evaluation", license_ref="EVAL_LOCAL_01")
            self.assertFalse(manifest["release_eligible"])
            self.assertEqual({item["weight"] for item in manifest["files"]}, {400, 500, 600, 700})
            self.assertIn('font-family: "Cuebook Noi"', (target / "cuebook-noi-fonts.css").read_text())
            self.assertTrue((target / "font-assets-v1.json").is_file())

    def test_production_rejects_trial_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "TRIAL"
            source.mkdir()
            make_fonts(source)
            with self.assertRaisesRegex(RuntimeError, "rejects Trial"):
                MODULE.stage(source, Path(directory) / "out", license_mode="production", license_ref="LICENSE_01")

    def test_production_stages_licensed_source_as_release_eligible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "licensed-noi"
            source.mkdir()
            make_fonts(source)
            manifest = MODULE.stage(source, Path(directory) / "out", license_mode="production", license_ref="LICENSE_01")
            self.assertTrue(manifest["release_eligible"])
            self.assertEqual(manifest["license_mode"], "production")


if __name__ == "__main__":
    unittest.main()
