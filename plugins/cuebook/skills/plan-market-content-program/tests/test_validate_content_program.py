from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "validate_content_program.py"
SPEC = importlib.util.spec_from_file_location("validate_content_program", SCRIPT_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


def content_item(item_id: str = "content_item_x") -> dict:
    return {
        "item_id": item_id,
        "role": "explainer",
        "editorial_job": "Explain one observable change and its evidence boundary.",
        "platform": "x",
        "format": "single_post",
        "renderer": "compact_text",
        "temporal_mode": "realtime",
        "target_context": None,
        "source_refs": ["source:one"],
        "parent_item_id": None,
        "depends_on": [],
        "asset_jobs": [],
        "interaction_job": "Answer sourced corrections.",
        "semantic_reuse_allowed": True,
        "wording_reuse_allowed": False,
        "status": "planned",
    }


def base_artifact() -> dict:
    return {
        "schema_version": "content-program.v1",
        "program_id": "content_program_0123456789abcdef",
        "generated_at": "2026-07-14T03:00:00Z",
        "brief": {
            "objective": "Explain a market event without overstating the evidence.",
            "audience": "market readers",
            "language": "en-US",
            "content_class": "market_commentary",
            "horizon_start": "2026-07-14T03:00:00Z",
            "horizon_end": "2026-07-21T03:00:00Z",
            "source_refs": ["source:one"],
            "requested_platforms": ["x"],
            "excluded_actions": ["external publishing", "personalized advice"],
        },
        "topology": {"mode": "single", "anchor_item_id": None, "event_expiry": None, "rationale": "One job is sufficient."},
        "items": [content_item()],
        "release_strategy": {
            "mode": "single_channel",
            "relative_order": ["content_item_x"],
            "cadence_notes": "One item only.",
            "trigger_rules": [],
            "execution_assumption": "manual_handoff",
        },
        "measurement_plan": {
            "questions": [
                {
                    "question_id": "measure_corrections",
                    "question": "Did readers provide sourced corrections?",
                    "item_ids": ["content_item_x"],
                    "metric_class": "content_quality",
                }
            ],
            "windows": [{"label": "24h", "offset_hours": 24}],
            "notes": "Missing metrics stay missing.",
        },
        "quality_report": {"scores": {}, "hard_failures": [], "revisions": []},
    }


class ValidateContentProgramTests(unittest.TestCase):
    def assert_valid(self, artifact: dict) -> None:
        result = VALIDATOR.validate(artifact)
        self.assertTrue(result["valid"], result["errors"])

    def codes(self, artifact: dict) -> set[str]:
        return {entry["code"] for entry in VALIDATOR.validate(artifact)["errors"]}

    def test_valid_single_program(self) -> None:
        self.assert_valid(base_artifact())

    def test_single_rejects_extra_item(self) -> None:
        artifact = base_artifact()
        second = content_item("content_item_second")
        artifact["items"].append(second)
        artifact["release_strategy"]["relative_order"].append("content_item_second")
        self.assertIn("SINGLE_COUNT", self.codes(artifact))

    def test_item_sources_must_stay_inside_brief_boundary(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["source_refs"] = ["source:invented"]
        self.assertIn("UNKNOWN_SOURCE_REF", self.codes(artifact))

    def test_renderer_uses_capability_not_skill_name(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["renderer"] = "render-cuebook-market-post"
        self.assertIn("RENDERER_VALUE", self.codes(artifact))

    def test_dependency_cycle_and_order_are_rejected(self) -> None:
        artifact = base_artifact()
        artifact["topology"]["mode"] = "serial"
        second = content_item("content_item_second")
        artifact["items"][0]["depends_on"] = ["content_item_second"]
        second["depends_on"] = ["content_item_x"]
        artifact["items"].append(second)
        artifact["release_strategy"].update({"mode": "staggered", "relative_order": ["content_item_x", "content_item_second"]})
        codes = self.codes(artifact)
        self.assertIn("DEPENDENCY_CYCLE", codes)
        self.assertIn("RELATIVE_ORDER_DEPENDENCY", codes)

    def test_valid_anchor_and_derivatives(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["requested_platforms"] = ["x", "xiaohongshu"]
        artifact["topology"] = {
            "mode": "anchor_and_derivatives",
            "anchor_item_id": "content_item_anchor",
            "event_expiry": None,
            "rationale": "One visual anchor supports a compact derivative.",
        }
        anchor = content_item("content_item_anchor")
        anchor.update({"role": "anchor", "platform": "xiaohongshu", "format": "carousel_note", "renderer": "structured_media"})
        child = content_item("content_item_x")
        child.update({"role": "derivative", "parent_item_id": "content_item_anchor", "depends_on": ["content_item_anchor"]})
        artifact["items"] = [anchor, child]
        artifact["release_strategy"].update({"mode": "anchor_then_derivatives", "relative_order": ["content_item_anchor", "content_item_x"]})
        artifact["measurement_plan"]["questions"][0]["item_ids"] = ["content_item_anchor", "content_item_x"]
        self.assert_valid(artifact)

    def test_synchronized_release_rejects_dependencies(self) -> None:
        artifact = base_artifact()
        artifact["topology"]["mode"] = "serial"
        second = content_item("content_item_second")
        second["depends_on"] = ["content_item_x"]
        artifact["items"].append(second)
        artifact["release_strategy"].update({"mode": "synchronized", "relative_order": ["content_item_x", "content_item_second"]})
        self.assertIn("SYNCHRONIZED_DEPENDENCY", self.codes(artifact))

    def test_reddit_requires_named_community(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["requested_platforms"] = ["reddit"]
        artifact["items"][0].update({"platform": "reddit", "format": "community_post", "renderer": "structured_media"})
        self.assertIn("COMMUNITY_CONTEXT", self.codes(artifact))

    def test_valid_owned_website_routes_through_seo_and_geo(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["requested_platforms"] = ["website"]
        artifact["items"][0].update(
            {
                "platform": "website",
                "format": "long_form_article",
                "renderer": "structured_media",
                "optimization_modules": ["seo", "geo"],
            }
        )
        self.assert_valid(artifact)

    def test_owned_website_requires_seo_route(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["requested_platforms"] = ["website"]
        artifact["items"][0].update(
            {"platform": "website", "format": "long_form_article", "renderer": "structured_media", "optimization_modules": []}
        )
        self.assertIn("WEBSITE_SEO_ROUTE", self.codes(artifact))

    def test_geo_cannot_bypass_the_seo_floor(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["requested_platforms"] = ["website"]
        artifact["items"][0].update(
            {"platform": "website", "format": "long_form_article", "renderer": "structured_media", "optimization_modules": ["geo"]}
        )
        self.assertIn("GEO_REQUIRES_SEO", self.codes(artifact))

    def test_evergreen_series_requires_evergreen_items(self) -> None:
        artifact = base_artifact()
        artifact["topology"]["mode"] = "evergreen_series"
        second = content_item("content_item_second")
        artifact["items"].append(second)
        artifact["release_strategy"].update({"mode": "staggered", "relative_order": ["content_item_x", "content_item_second"]})
        self.assertIn("EVERGREEN_TEMPORAL_MODE", self.codes(artifact))

    def test_measurement_refs_must_point_to_items(self) -> None:
        artifact = base_artifact()
        artifact["measurement_plan"]["questions"][0]["item_ids"] = ["content_item_missing"]
        self.assertIn("MEASUREMENT_ITEM_REF", self.codes(artifact))

    def test_hype_language_warns_without_invalidating(self) -> None:
        artifact = copy.deepcopy(base_artifact())
        artifact["brief"]["objective"] = "Create a viral post."
        result = VALIDATOR.validate(artifact)
        self.assertTrue(result["valid"])
        self.assertIn("PERFORMANCE_PROMISE", {entry["code"] for entry in result["warnings"]})


if __name__ == "__main__":
    unittest.main()
