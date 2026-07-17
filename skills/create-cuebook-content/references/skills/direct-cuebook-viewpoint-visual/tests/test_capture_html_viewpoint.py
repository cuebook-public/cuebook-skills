#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "capture_html_viewpoint.cjs"
NODE = shutil.which("node")
BROWSERS = [
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
    Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    Path("/usr/bin/google-chrome"),
    Path("/usr/bin/chromium"),
]


def html(content: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:1244px;height:528px;overflow:hidden;background:#f7f8fa;color:#111418}}
main{{position:relative;width:1244px;height:528px;overflow:hidden;transform-origin:top left}}
.claim{{position:absolute;left:72px;top:58px;width:850px;font:800 86px/1.06 -apple-system,sans-serif}}
.proof{{position:absolute;left:76px;top:290px;width:720px;font:650 38px/1.2 -apple-system,sans-serif;color:#315fd0}}
.field{{position:absolute;right:60px;top:48px;width:290px;height:382px;background:#dce5ff;border-left:16px solid #315fd0}}
@media(max-width:1000px){{html,body{{width:622px;height:264px}}main{{transform:scale(.5)}}}}
</style></head><body><main data-cuebook-viewpoint data-width="1244" data-height="528">{content}</main></body></html>"""


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    return struct.unpack(">II", data[16:24])


@unittest.skipUnless(NODE and any(path.is_file() for path in BROWSERS), "Node and Chromium are required.")
class CaptureViewpointTests(unittest.TestCase):
    def run_capture(self, source: str) -> tuple[subprocess.CompletedProcess[str], Path, tempfile.TemporaryDirectory[str]]:
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        source_path = root / "direction.html"
        output = root / "capture"
        source_path.write_text(source, encoding="utf-8")
        completed = subprocess.run(
            [str(NODE), str(SCRIPT), str(source_path), str(output)],
            text=True,
            capture_output=True,
            check=False,
        )
        return completed, output, temporary

    def test_rejects_uniform_blank_canvas(self) -> None:
        completed, _, temporary = self.run_capture(html(""))
        try:
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("visually blank viewpoint PNG", completed.stderr)
        finally:
            temporary.cleanup()

    def test_captures_real_wide_and_compact_content(self) -> None:
        source = html('<h1 class="claim">HOOD 进入重估窗口</h1><div class="proof">交易、分发与结算开始合流</div><div class="field"></div>')
        completed, output, temporary = self.run_capture(source)
        try:
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(png_dimensions(output / "viewpoint-2488.png"), (2488, 1056))
            self.assertEqual(png_dimensions(output / "viewpoint-622.png"), (622, 264))
            report = json.loads((output / "capture-report.json").read_text(encoding="utf-8"))
            for derivative in report["derivatives"]:
                self.assertRegex(derivative["pixel_sha256"], r"^sha256:[0-9a-f]{64}$")
                self.assertNotEqual(derivative["pixel_sha256"], derivative["sha256"])
            pixel_hashes = [derivative["pixel_sha256"] for derivative in report["derivatives"]]
            self.assertEqual(len(set(pixel_hashes)), len(pixel_hashes))
        finally:
            temporary.cleanup()


if __name__ == "__main__":
    unittest.main()
