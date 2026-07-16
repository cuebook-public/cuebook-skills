from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "validate_market_seo_pack.py"
SPEC = importlib.util.spec_from_file_location("validate_market_seo_pack", SCRIPT_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


def technical_checks(state: str = "unknown", evidence_ids: list[str] | None = None, observed_at: str | None = None) -> list[dict]:
    areas = ["status_http", "robots", "indexability", "canonical", "internal_discovery", "initial_html"]
    return [
        {
            "check_id": f"SEO_T{index}",
            "area": area,
            "state": state,
            "evidence_ids": evidence_ids or [],
            "observed_at": observed_at,
            "acceptance_test": f"Observe and verify {area}.",
        }
        for index, area in enumerate(areas, start=1)
    ]


def base_plan() -> dict:
    return {
        "schema_version": "market-seo-pack.v1",
        "pack_id": "seo_pack_1111111111111111",
        "generated_at": "2026-07-14T08:00:00Z",
        "input_hash": "sha256:" + "1" * 64,
        "ruleset_version": "cuebook-market-seo/1.0.0",
        "mode": "plan",
        "brief": {
            "cue_ref": "cue://example/one",
            "research_pack_ref": "research-pack://example/one",
            "content_program_ref": "content_program_1111111111111111",
            "artifact_ref": None,
            "target_url": None,
            "canonical_url": None,
            "locale": "zh-CN",
            "page_type": "evergreen_education",
            "temporal_mode": "evergreen",
            "as_of": None,
            "expires_at": None,
            "source_refs": ["research-pack://example/one", "https://developers.google.com/search/docs/appearance/ai-features"],
        },
        "evidence_register": [
            {
                "evidence_id": "SEO_E1",
                "source_ref": "research-pack://example/one",
                "kind": "research_fact",
                "observed_at": "2026-07-14T07:00:00Z",
                "observation_mode": "supplied_artifact",
                "source_locator": "research-pack://example/one#F1",
                "content_hash": None,
                "freshness": "current",
                "fact_ids": ["F1"],
                "notes": "Upstream supported fact.",
            },
            {
                "evidence_id": "SEO_E2",
                "source_ref": "https://developers.google.com/search/docs/appearance/ai-features",
                "kind": "official_guidance",
                "observed_at": "2026-07-14T07:30:00Z",
                "observation_mode": "manual_observation",
                "source_locator": "https://developers.google.com/search/docs/appearance/ai-features",
                "content_hash": None,
                "freshness": "current",
                "fact_ids": [],
                "notes": "Current official search guidance.",
            },
        ],
        "query_map": [
            {
                "query_id": "SEO_Q1",
                "query": "How does the example market mechanism work?",
                "intent": "informational",
                "evidence_state": "derived",
                "evidence_ids": ["SEO_E1"],
                "target_section_id": "SEO_SEC_SUMMARY",
                "volume": None,
                "volume_source_evidence_id": None,
            }
        ],
        "page_plan": {
            "primary_entity": "Example market mechanism",
            "aliases": [],
            "primary_query_id": "SEO_Q1",
            "search_job": "Explain one supported mechanism for readers who need the evidence boundary.",
            "original_value": "A source-bound explanation with a countercase and explicit invalidation.",
            "title_tag": "Example Market Mechanism: Evidence and Limits",
            "h1": "How the Example Market Mechanism Works",
            "meta_description": "A source-bound explanation of the example market mechanism, its limits, and what evidence would change the conclusion.",
            "slug": "/research/example-market-mechanism",
            "sections": [
                {
                    "section_id": "SEO_SEC_SUMMARY",
                    "job": "Answer the primary question and state the evidence boundary.",
                    "query_ids": ["SEO_Q1"],
                    "fact_ids": ["F1"],
                    "evidence_ids": ["SEO_E1"],
                    "temporal_label": "evergreen",
                }
            ],
            "internal_links": [],
        },
        "technical_gate": {"eligibility": "unknown", "checks": technical_checks()},
        "structured_data_plan": [
            {
                "entry_id": "SEO_SD1",
                "schema_type": "Article",
                "purpose": "Describe the visible article and publisher relationship.",
                "visible_fact_ids": ["F1"],
                "evidence_ids": ["SEO_E1"],
                "state": "planned",
                "validation_ref": None,
            }
        ],
        "recommendations": [
            {
                "recommendation_id": "SEO_R1",
                "priority": "P1",
                "action": "Verify the eligibility floor against the final page build.",
                "evidence_ids": ["SEO_E2"],
                "depends_on": [],
                "owner": "web publisher",
                "acceptance_test": "All six eligibility-floor checks have timestamped page evidence.",
                "failure_signal": "Any floor check remains unknown or blocked.",
                "state": "planned",
            }
        ],
        "quality_report": {
            "upstream_research_state": "ready",
            "spam_risk": "pass",
            "hard_failures": [],
            "warnings": [],
            "unknowns": ["Final page has not been observed."],
        },
        "readiness": "conditional",
    }


def ready_preflight() -> dict:
    artifact = base_plan()
    artifact["mode"] = "preflight"
    artifact["brief"].update(
        {
            "artifact_ref": "artifact://example/page-one",
            "target_url": "https://example.com/research/example-market-mechanism",
            "canonical_url": "https://example.com/research/example-market-mechanism",
        }
    )
    artifact["brief"]["source_refs"].append("page://example/final-build")
    artifact["evidence_register"].append(
        {
            "evidence_id": "SEO_E3",
            "source_ref": "page://example/final-build",
            "kind": "page_observation",
            "observed_at": "2026-07-14T08:30:00Z",
            "observation_mode": "raw_html",
            "source_locator": "page://example/final-build#raw-html",
            "content_hash": "3" * 64,
            "freshness": "current",
            "fact_ids": [],
            "notes": "Raw and rendered final build observation.",
        }
    )
    artifact["technical_gate"] = {
        "eligibility": "pass",
        "checks": technical_checks("pass", ["SEO_E3"], "2026-07-14T08:30:00Z"),
    }
    artifact["structured_data_plan"][0].update({"state": "validated", "validation_ref": "validation://example/schema-one"})
    artifact["recommendations"][0]["state"] = "done"
    artifact["quality_report"]["unknowns"] = []
    artifact["readiness"] = "ready"
    return artifact


class ValidateMarketSEOPackTests(unittest.TestCase):
    def result(self, artifact: dict) -> dict:
        return VALIDATOR.validate(artifact)

    def assert_valid(self, artifact: dict) -> dict:
        result = self.result(artifact)
        self.assertTrue(result["valid"], result)
        return result

    def error_codes(self, artifact: dict) -> set[str]:
        return {entry["code"] for entry in self.result(artifact)["errors"]}

    def test_valid_plan_is_conditional(self) -> None:
        result = self.assert_valid(base_plan())
        self.assertEqual(result["computed_readiness"], "conditional")

    def test_valid_ready_preflight(self) -> None:
        result = self.assert_valid(ready_preflight())
        self.assertEqual(result["computed_readiness"], "ready")

    def test_private_and_obfuscated_targets_are_rejected(self) -> None:
        for url in ("http://127.0.0.1/page", "http://2130706433/page", "file:///tmp/page"):
            artifact = ready_preflight()
            artifact["brief"]["target_url"] = url
            self.assertIn("URL_SAFETY", self.error_codes(artifact))

    def test_volume_requires_authorized_search_data(self) -> None:
        artifact = base_plan()
        artifact["query_map"][0].update({"volume": 100, "volume_source_evidence_id": "SEO_E1"})
        self.assertIn("VOLUME_PROVENANCE", self.error_codes(artifact))

    def test_authorized_volume_is_valid(self) -> None:
        artifact = base_plan()
        artifact["brief"]["source_refs"].append("search-data://authorized/example")
        artifact["evidence_register"].append(
            {
                "evidence_id": "SEO_E4",
                "source_ref": "search-data://authorized/example",
                "kind": "authorized_search_data",
                "observed_at": "2026-07-14T07:40:00Z",
                "observation_mode": "authorized_api",
                "source_locator": "search-data://authorized/example#query-row-1",
                "content_hash": None,
                "freshness": "current",
                "fact_ids": [],
                "notes": "Authorized query dataset.",
            }
        )
        artifact["query_map"][0].update({"volume": 100, "volume_source_evidence_id": "SEO_E4"})
        self.assert_valid(artifact)

    def test_structured_data_cannot_invent_fact(self) -> None:
        artifact = base_plan()
        artifact["structured_data_plan"][0]["visible_fact_ids"] = ["F99"]
        self.assertIn("UNKNOWN_FACT_REF", self.error_codes(artifact))

    def test_plan_cannot_claim_ready(self) -> None:
        artifact = base_plan()
        artifact["readiness"] = "ready"
        self.assertIn("READINESS", self.error_codes(artifact))

    def test_realtime_missing_expiry_is_valid_blocked_artifact(self) -> None:
        artifact = base_plan()
        artifact["brief"].update({"temporal_mode": "realtime", "as_of": "2026-07-14T08:00:00Z", "expires_at": None})
        artifact["page_plan"]["sections"][0]["temporal_label"] = "current_as_of"
        artifact["readiness"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("EVENT_EXPIRY", {entry["code"] for entry in result["blockers"]})

    def test_unresolved_p0_blocks_preflight(self) -> None:
        artifact = ready_preflight()
        artifact["recommendations"][0].update({"priority": "P0", "state": "accepted"})
        artifact["readiness"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("UNRESOLVED_P0", {entry["code"] for entry in result["blockers"]})

    def test_secret_field_is_invalid(self) -> None:
        artifact = base_plan()
        artifact["api_key"] = "do-not-store"
        self.assertIn("SECRET_FIELD", self.error_codes(artifact))

    def test_observed_technical_state_needs_provenance(self) -> None:
        artifact = ready_preflight()
        artifact["technical_gate"]["checks"][0].update({"evidence_ids": [], "observed_at": None})
        self.assertIn("CHECK_PROVENANCE", self.error_codes(artifact))

    def test_page_observation_requires_mode_locator_and_hash(self) -> None:
        artifact = ready_preflight()
        artifact["evidence_register"][-1].update(
            {"observation_mode": "not_applicable", "source_locator": None, "content_hash": None}
        )
        codes = self.error_codes(artifact)
        self.assertIn("PAGE_OBSERVATION_MODE", codes)
        self.assertIn("PAGE_OBSERVATION_LOCATOR", codes)
        self.assertIn("PAGE_OBSERVATION_HASH", codes)

    def test_input_hash_and_ruleset_are_versioned(self) -> None:
        artifact = base_plan()
        artifact.update({"input_hash": "short", "ruleset_version": "latest"})
        codes = self.error_codes(artifact)
        self.assertIn("INPUT_HASH", codes)
        self.assertIn("RULESET_VERSION", codes)

    def test_recommendation_dependency_cycle_is_invalid(self) -> None:
        artifact = base_plan()
        first = artifact["recommendations"][0]
        first["depends_on"] = ["SEO_R2"]
        second = copy.deepcopy(first)
        second.update({"recommendation_id": "SEO_R2", "depends_on": ["SEO_R1"]})
        artifact["recommendations"].append(second)
        self.assertIn("RECOMMENDATION_CYCLE", self.error_codes(artifact))

    def test_drift_requires_baseline_and_current_observations(self) -> None:
        artifact = ready_preflight()
        artifact["mode"] = "drift"
        self.assertIn("DRIFT_OBSERVATIONS", self.error_codes(artifact))


if __name__ == "__main__":
    unittest.main()
