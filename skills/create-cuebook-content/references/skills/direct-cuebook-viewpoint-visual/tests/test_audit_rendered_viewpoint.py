#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit_rendered_viewpoint.cjs"
RUNTIME = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies"
NODE = RUNTIME / "node/bin/node"
NODE_MODULES = RUNTIME / "node/node_modules"


def html(extra_css: str = "") -> str:
    return f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><style>
*{{box-sizing:border-box}} html,body{{margin:0;width:100%;height:100%;overflow:hidden;background:#f7f9fc;color:#11151b}}
main{{position:relative;width:1340px;height:528px;transform-origin:top left;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums}}
.claim,.evidence,.condition{{position:absolute;letter-spacing:0}}
.claim{{left:74px;top:48px;width:1040px;font-size:96px;line-height:1.08;font-weight:750;text-wrap:balance}}
.evidence{{left:78px;top:244px;width:800px;font-size:44px;line-height:1.2;font-weight:650}}
.condition{{left:78px;top:340px;width:600px;font-size:40px;line-height:1.25;font-weight:650}}
@media(max-width:1000px){{main{{transform:scale(.5)}}}}
{extra_css}
</style></head><body>
<main data-cuebook-viewpoint data-width=\"1340\" data-height=\"528\">
  <h1 class=\"claim\" data-role=\"claim\" data-visual-level=\"1\" data-logic-step-id=\"LSTEP_CLAIM\">HOOD 进入重估窗口</h1>
  <div class=\"evidence\" data-role=\"evidence\" data-visual-level=\"2\" data-logic-step-id=\"LSTEP_MECH\" data-binding-ref=\"BIND_MECH\">分发、交易与结算开始合流</div>
  <div class=\"condition\" data-role=\"condition\" data-visual-level=\"3\" data-logic-step-id=\"LSTEP_ACTION\">下一步看使用与收入</div>
</main></body></html>"""


class RenderAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not NODE.is_file() or not NODE_MODULES.is_dir():
            raise unittest.SkipTest("Bundled Node and Playwright are unavailable.")

    def run_audit(self, source: str) -> tuple[subprocess.CompletedProcess[str], dict]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            html_path = root / "viewpoint.html"
            output = root / "audit"
            html_path.write_text(source, encoding="utf-8")
            env = {**os.environ, "NODE_PATH": str(NODE_MODULES)}
            completed = subprocess.run(
                [str(NODE), str(SCRIPT), str(html_path), str(output)],
                text=True,
                capture_output=True,
                env=env,
                check=False,
            )
            report = json.loads((output / "render-audit.json").read_text(encoding="utf-8"))
            return completed, report

    def test_valid_full_and_compact_geometry(self) -> None:
        completed, report = self.run_audit(html())
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertTrue(report["valid"], report["errors"])
        self.assertRegex(report["layout_fingerprint_sha256"], r"^sha256:[a-f0-9]{64}$")
        self.assertEqual([item["logic_step_ids"] for item in report["viewports"]], [["LSTEP_ACTION", "LSTEP_CLAIM", "LSTEP_MECH"]] * 2)
        self.assertEqual([item["binding_refs"] for item in report["viewports"]], [["BIND_MECH"]] * 2)

    def test_hidden_binding_is_not_rendered_evidence(self) -> None:
        completed, report = self.run_audit(html(".evidence{opacity:0}"))
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("BINDING_HIDDEN", {item["code"] for item in report["errors"]})
        self.assertEqual([item["binding_refs"] for item in report["viewports"]], [[], []])

    def test_compact_font_and_brand_safe_zone_are_measured(self) -> None:
        completed, report = self.run_audit(html(".condition{left:1135px;top:475px;font-size:16px}"))
        self.assertNotEqual(completed.returncode, 0)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("MIN_FONT", codes)
        self.assertIn("BRAND_SAFE_ZONE", codes)

    def test_real_reflow_uses_contract_scale_for_brand_safe_zone(self) -> None:
        responsive = html().replace(
            "@media(max-width:1000px){main{transform:scale(.5)}}",
            "@media(max-width:1000px){main{width:670px;height:264px;transform:none}.claim{left:26px;top:18px;width:610px;font-size:48px}.evidence{left:26px;top:126px;width:480px;font-size:22px}.condition{left:430px;top:202px;width:90px;font-size:18px}}",
        ).replace("下一步看使用与收入", "持有")
        completed, report = self.run_audit(responsive)
        self.assertEqual(completed.returncode, 0, report["errors"])
        compact = next(item for item in report["viewports"] if item["width"] == 670)
        self.assertEqual(compact["transform_scale"], 1)
        self.assertEqual(compact["contract_scale"], 0.5)

    def test_declared_noi_profile_requires_a_loaded_face(self) -> None:
        source = html().replace(
            "data-cuebook-viewpoint data-width",
            'data-cuebook-viewpoint data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json" data-width',
        ).replace(
            "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
            'font-family:"Cuebook Noi",sans-serif',
        )
        completed, report = self.run_audit(source)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("NOI_FONT_NOT_LOADED", {item["code"] for item in report["errors"]})
        self.assertEqual([item["font_profile"] for item in report["viewports"]], ["cuebook-noi-v1"] * 2)

    def test_text_crossing_a_border_line_fails(self) -> None:
        bracket = html(
            ".bracket{position:absolute;left:900px;top:430px;width:130px;height:20px;"
            "border-right:2px solid #223;border-bottom:2px solid #223}"
            ".bracket span{position:absolute;left:100px;top:0;font-size:24px;white-space:nowrap}"
        ).replace(
            "</main>",
            '<div class="bracket" data-role="evidence" data-visual-level="3"><span>+13.4% vs est</span></div></main>',
        )
        completed, report = self.run_audit(bracket)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("TEXT_BORDER_COLLISION", {item["code"] for item in report["errors"]})

        cleared = bracket.replace('data-role="evidence" data-visual-level="3"', 'data-role="evidence" data-visual-level="3" data-overlap-ok="true"')
        completed, report = self.run_audit(cleared)
        self.assertEqual(completed.returncode, 0, report["errors"])

    def test_display_scale_value_restatement_fails(self) -> None:
        restated = html().replace("HOOD 进入重估窗口", "指引下限 >$600M").replace("分发、交易与结算开始合流", "FY26 指引 $600M+，抬升基线")
        completed, report = self.run_audit(restated)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("VALUE_RESTATED", {item["code"] for item in report["errors"]})

        allowed = restated.replace(
            'data-role="evidence" data-visual-level="2"',
            'data-role="evidence" data-visual-level="2" data-value-restate-ok="true"',
        )
        completed, report = self.run_audit(allowed)
        self.assertEqual(completed.returncode, 0, report["errors"])

    def test_small_value_restatement_is_a_warning_not_an_error(self) -> None:
        source = html(".claim{font-size:36px}.condition{font-size:24px}").replace("HOOD 进入重估窗口", "库存比预期多 9B").replace("下一步看使用与收入", "失效：9B 缺口收回")
        completed, report = self.run_audit(source)
        self.assertEqual(completed.returncode, 0, report["errors"])
        self.assertIn("VALUE_RESTATED", {item["code"] for item in report["warnings"]})

    def test_proof_led_composition_requires_a_real_evidence_field(self) -> None:
        source = html(".claim{left:50px;top:40px;width:320px;font-size:54px}.evidence{left:420px;top:50px;width:820px;height:360px;font-size:30px}.condition{left:50px;top:260px;width:300px;font-size:30px}").replace(
            "data-cuebook-viewpoint data-width",
            'data-cuebook-viewpoint data-market-relationship="deviation" data-argument-archetype="forecast_surprise" data-composition-archetype="chart_stage" data-finance-transform="delta" data-baseline-policy="zero" data-chart-decision="chart" data-width',
        )
        completed, report = self.run_audit(source)
        self.assertEqual(completed.returncode, 0, report["errors"])
        self.assertGreaterEqual(report["viewports"][0]["layout_metrics"]["evidence_area_ratio"], 0.28)

        cramped = source.replace("width:820px;height:360px", "width:300px;height:100px")
        completed, report = self.run_audit(cramped)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("PROOF_EVIDENCE_AREA", {item["code"] for item in report["errors"]})


if __name__ == "__main__":
    unittest.main()
