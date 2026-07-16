#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "lint_launch_viewpoint_html.py"
WORDMARK = Path(__file__).parents[1] / "assets" / "cuebook-wordmark.svg"
SPEC = importlib.util.spec_from_file_location("launch_visual_linter", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def valid_html() -> str:
    wordmark = WORDMARK.read_text(encoding="utf-8").strip().replace(
        "<svg ",
        '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ',
        1,
    ).replace('fill="#F2F3F4"', 'fill="currentColor"')
    return f'''<style>main{{font-family:"Cuebook Noi","PingFang SC",sans-serif}}.claim{{text-wrap:balance}}[data-binding-ref]{{font-variant-numeric:tabular-nums}}.cuebook-wordmark{{position:absolute;right:41px;bottom:34px;width:136px;height:26px;color:#101411}}</style><main data-cuebook-visual-contract="launch-v1" data-entry-role="claim" data-color-system="semantic-v1" data-palette-family="quiet-cobalt" data-palette-strategy="creator_native" data-palette-preset="quiet-cobalt" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json"><div data-role="context" data-visual-level="4">HOOD · 30天</div><h1 class="claim" data-role="claim" data-visual-level="1">我押HOOD拿到基础设施溢价</h1><div data-role="evidence" data-visual-level="2" data-color-role="observed" data-binding-ref="BIND_FACT">2770万客户 · 3770亿美元资产</div><div data-role="condition" data-visual-level="3" data-color-role="catalyst">财报看使用与收入</div>{wordmark}</main>'''


class LaunchVisualLintTests(unittest.TestCase):
    def test_valid_launch_visual(self) -> None:
        self.assertTrue(MODULE.audit_html(valid_html())["valid"])

    def test_reports_visible_relevant_binding_refs(self) -> None:
        result = MODULE.audit_html(valid_html())
        self.assertEqual(result["stats"]["visible_binding_refs"], ["BIND_FACT"])

    def test_rejects_binding_on_hidden_element(self) -> None:
        source = valid_html().replace("</main>", '<i hidden data-binding-ref="BIND_HIDDEN">hidden fact</i></main>')
        result = MODULE.audit_html(source)
        self.assertIn("BINDING_HIDDEN", {item["code"] for item in result["errors"]})
        self.assertNotIn("BIND_HIDDEN", result["stats"]["visible_binding_refs"])

    def test_rejects_binding_hidden_by_css_class(self) -> None:
        source = valid_html().replace("</style>", ".ghost{display:none}</style>").replace(
            "</main>",
            '<span class="ghost" data-role="evidence" data-visual-level="4" data-binding-ref="BIND_GHOST">ghost fact</span></main>',
        )
        result = MODULE.audit_html(source)
        self.assertIn("BINDING_HIDDEN", {item["code"] for item in result["errors"]})

    def test_rejects_binding_on_arbitrary_visible_node(self) -> None:
        source = valid_html().replace("</main>", '<i data-binding-ref="BIND_META">metadata</i></main>')
        result = MODULE.audit_html(source)
        self.assertIn("BINDING_CONTEXT", {item["code"] for item in result["errors"]})

    def test_rejects_empty_bound_role(self) -> None:
        source = valid_html().replace(
            "</main>",
            '<i data-role="context" data-visual-level="4" data-binding-ref="BIND_EMPTY"></i></main>',
        )
        result = MODULE.audit_html(source)
        self.assertIn("BINDING_EMPTY", {item["code"] for item in result["errors"]})

    def test_accepts_visible_bound_svg_geometry(self) -> None:
        source = valid_html().replace(
            "</main>",
            '<svg data-role="evidence" data-visual-level="3" data-logic-step-id="LSTEP_CURVE" data-binding-ref="BIND_CURVE"><path d="M0 4L20 4"/></svg></main>',
        )
        result = MODULE.audit_html(source)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("BIND_CURVE", result["stats"]["visible_binding_refs"])

    def test_allows_unbound_decorative_html_and_svg(self) -> None:
        source = valid_html().replace(
            "</main>",
            '<span class="decoration" aria-hidden="true"></span><svg aria-hidden="true"><path d="M0 0L8 8"/></svg></main>',
        )
        self.assertTrue(MODULE.audit_html(source)["valid"])

    def test_rejects_manual_claim_break(self) -> None:
        result = MODULE.audit_html(valid_html().replace("拿到", "<br>拿到"))
        self.assertIn("CLAIM_MANUAL_BREAK", {item["code"] for item in result["errors"]})

    def test_rejects_unscoped_disclosure(self) -> None:
        result = MODULE.audit_html(valid_html().replace("</main>", "<small>股东权利有限</small></main>"))
        self.assertIn("UNSCOPED_TEXT", {item["code"] for item in result["errors"]})

    def test_rejects_generated_copy(self) -> None:
        result = MODULE.audit_html(valid_html().replace("</style>", '.x:after{content:"7.29财报"}</style>'))
        self.assertIn("GENERATED_COPY", {item["code"] for item in result["errors"]})

    def test_rejects_excess_copy(self) -> None:
        result = MODULE.audit_html(valid_html().replace("财报看使用与收入", "财" * 30))
        self.assertIn("ROLE_BUDGET", {item["code"] for item in result["errors"]})

    def test_allows_compact_verdict_plus_implication_claim(self) -> None:
        source = valid_html().replace("我押HOOD拿到基础设施溢价", "库存超预期，七日偏空；供给宽松继续压制价格")
        result = MODULE.audit_html(source)
        self.assertNotIn("ROLE_BUDGET", {item["code"] for item in result["errors"]})

    def test_requires_canonical_wordmark(self) -> None:
        result = MODULE.audit_html(valid_html().replace(' data-cuebook-wordmark="v1"', ""))
        self.assertIn("WORDMARK_REQUIRED", {item["code"] for item in result["errors"]})

    def test_rejects_visible_brand_text(self) -> None:
        result = MODULE.audit_html(valid_html().replace("</main>", '<div data-role="brand">Cuebook</div></main>'))
        self.assertIn("BRAND_TEXT", {item["code"] for item in result["errors"]})

    def test_rejects_modified_wordmark_path(self) -> None:
        result = MODULE.audit_html(valid_html().replace("M6.61403", "M6.7", 1))
        self.assertIn("WORDMARK_PATHS", {item["code"] for item in result["errors"]})

    def test_requires_visual_level_on_visible_groups(self) -> None:
        result = MODULE.audit_html(valid_html().replace(' data-visual-level="4"', "", 1))
        self.assertIn("VISUAL_LEVEL_REQUIRED", {item["code"] for item in result["errors"]})

    def test_rejects_multiple_level_one_groups(self) -> None:
        result = MODULE.audit_html(valid_html().replace('data-visual-level="2"', 'data-visual-level="1"', 1))
        self.assertIn("VISUAL_ENTRY", {item["code"] for item in result["errors"]})

    def test_rejects_unknown_color_role(self) -> None:
        result = MODULE.audit_html(valid_html().replace('data-color-role="observed"', 'data-color-role="decorative"', 1))
        self.assertIn("UNKNOWN_COLOR_ROLE", {item["code"] for item in result["errors"]})

    def test_requires_palette_strategy(self) -> None:
        result = MODULE.audit_html(valid_html().replace(' data-palette-strategy="creator_native"', ""))
        self.assertIn("PALETTE_STRATEGY", {item["code"] for item in result["errors"]})

    def test_requires_registered_palette_preset(self) -> None:
        result = MODULE.audit_html(valid_html().replace('data-palette-preset="quiet-cobalt"', 'data-palette-preset="made-up-palette"'))
        self.assertIn("PALETTE_PRESET", {item["code"] for item in result["errors"]})

    def test_requires_noi_font_profile(self) -> None:
        result = MODULE.audit_html(valid_html().replace(' data-font-profile="cuebook-noi-v1"', ""))
        self.assertIn("FONT_PROFILE", {item["code"] for item in result["errors"]})

    def test_production_rejects_trial_font_reference(self) -> None:
        source = valid_html().replace("</style>", '@font-face{font-family:"Cuebook Noi";src:url("./fonts/NoiGroteskTrial-Regular.ttf")}</style>')
        result = MODULE.audit_html(source)
        self.assertIn("TRIAL_FONT_RELEASE", {item["code"] for item in result["errors"]})

    def test_requires_safe_font_manifest_ref(self) -> None:
        result = MODULE.audit_html(valid_html().replace(' data-font-manifest-ref="fonts/font-assets-v1.json"', ""))
        self.assertIn("FONT_MANIFEST_REF", {item["code"] for item in result["errors"]})

    def test_evaluation_allows_local_trial_font_reference(self) -> None:
        source = valid_html().replace('data-font-license-mode="production"', 'data-font-license-mode="evaluation"').replace(
            "</style>",
            '@font-face{font-family:"Cuebook Noi";src:url("./fonts/NoiGroteskTrial-Regular.ttf")}</style>',
        )
        self.assertTrue(MODULE.audit_html(source)["valid"])

    def test_rejects_benchmark_brand_font(self) -> None:
        result = MODULE.audit_html(valid_html().replace('"Cuebook Noi"', '"Cuebook Noi","Capsule Sans"', 1))
        self.assertIn("BENCHMARK_FONT", {item["code"] for item in result["errors"]})

    def test_requires_tabular_numbers(self) -> None:
        result = MODULE.audit_html(valid_html().replace("font-variant-numeric:tabular-nums", "font-variant-numeric:normal"))
        self.assertIn("TABULAR_NUMBERS", {item["code"] for item in result["errors"]})


if __name__ == "__main__":
    unittest.main()
