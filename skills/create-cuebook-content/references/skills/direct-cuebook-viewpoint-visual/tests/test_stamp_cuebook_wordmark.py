#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "stamp_cuebook_wordmark.py"
SPEC = importlib.util.spec_from_file_location("wordmark_stamp", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class WordmarkStampTests(unittest.TestCase):
    def test_stamps_light_background(self) -> None:
        output, changed = MODULE.stamp("<style></style><main></main>", "light")
        self.assertTrue(changed)
        self.assertIn('data-cuebook-wordmark="v1"', output)
        self.assertIn("color:#101411", output)
        self.assertIn("right:41px;bottom:34px", output)
        canonical_path_count = MODULE.ASSET.read_text(encoding="utf-8").count("<path ")
        self.assertEqual(output.count('fill="currentColor"'), canonical_path_count)

    def test_stamps_dark_background(self) -> None:
        output, _ = MODULE.stamp("<style></style><main></main>", "dark")
        self.assertIn("color:#F2F3F4", output)

    def test_is_idempotent(self) -> None:
        once, _ = MODULE.stamp("<style></style><main></main>", "light")
        twice, changed = MODULE.stamp(once, "light")
        self.assertFalse(changed)
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
