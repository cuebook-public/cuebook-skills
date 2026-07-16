from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "validate_market_geo_pack.py"
SPEC = importlib.util.spec_from_file_location("validate_market_geo_pack", SCRIPT_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


HASH_A = "sha256:" + "a" * 64
HASH_B = "sha256:" + "b" * 64


def base_plan() -> dict:
    return {
        "schema_version": "market-geo-pack.v1",
        "pack_id": "geo_pack_1111111111111111",
        "input_hash": HASH_A,
        "ruleset_version": "cuebook-market-geo/1.0.0",
        "generated_at": "2026-07-14T08:00:00Z",
        "mode": "plan",
        "brief": {
            "cue_ref": "cue://example/one",
            "research_pack_ref": "research-pack://example/one",
            "seo_pack_ref": None,
            "artifact_ref": None,
            "target_url": None,
            "locale": "zh-CN",
            "regions": ["CN"],
            "engines": ["google_ai"],
            "temporal_mode": "evergreen",
            "as_of": None,
            "source_refs": ["research-pack://example/one", "https://developers.google.com/search/docs/appearance/ai-features"],
            "sample_refs": [],
            "personalized_advice_allowed": False,
        },
        "source_register": [
            {
                "source_id": "GEO_S1",
                "source_ref": "research-pack://example/one",
                "source_locator": "research-pack://example/one#facts=F1,F2",
                "kind": "research_fact",
                "observed_at": "2026-07-14T07:00:00Z",
                "freshness": "current",
                "fact_ids": ["F1", "F2"],
                "evidence_ref": None,
            },
            {
                "source_id": "GEO_S2",
                "source_ref": "https://developers.google.com/search/docs/appearance/ai-features",
                "source_locator": "https://developers.google.com/search/docs/appearance/ai-features",
                "kind": "official_guidance",
                "observed_at": "2026-07-14T07:30:00Z",
                "freshness": "current",
                "fact_ids": [],
                "evidence_ref": None,
            },
        ],
        "seo_eligibility": {"state": "unknown", "seo_pack_ref": None, "notes": "No final page exists."},
        "entity_graph": {
            "entities": [
                {
                    "entity_id": "GEO_ENT_MECHANISM",
                    "canonical_name": "Example market mechanism",
                    "kind": "concept",
                    "aliases": [],
                    "fact_ids": ["F1"],
                    "source_ids": ["GEO_S1"],
                    "confidence": "high",
                },
                {
                    "entity_id": "GEO_ENT_METRIC",
                    "canonical_name": "Example metric",
                    "kind": "metric",
                    "aliases": [],
                    "fact_ids": ["F2"],
                    "source_ids": ["GEO_S1"],
                    "confidence": "high",
                },
            ],
            "relations": [
                {
                    "relation_id": "GEO_REL_EXPLAINS",
                    "subject_entity_id": "GEO_ENT_MECHANISM",
                    "predicate": "is observed through",
                    "object_entity_id": "GEO_ENT_METRIC",
                    "status": "verified",
                    "fact_ids": ["F1", "F2"],
                    "source_ids": ["GEO_S1"],
                }
            ],
        },
        "fact_cards": [
            {
                "card_id": "GEO_FC1",
                "question": "What does the example mechanism show?",
                "answer_boundary": "Explain only the relationship supported by F1 and F2; do not infer a trade direction.",
                "fact_ids": ["F1", "F2"],
                "source_ids": ["GEO_S1"],
                "as_of": None,
                "freshness": "current",
                "temporal_scope": "evergreen",
                "prohibited_inferences": ["personalized trade direction", "guaranteed outcome"],
            }
        ],
        "question_map": [
            {
                "question_id": "GEO_Q1",
                "cluster": "mechanism",
                "question": "How does the example market mechanism work?",
                "standalone_rewrite": "How does the example market mechanism affect the example metric?",
                "evidence_query": "Find the supported relationship between F1 and F2.",
                "target_asset_ref": None,
                "required_fact_ids": ["F1", "F2"],
                "status": "derived",
            }
        ],
        "answer_units": [
            {
                "unit_id": "GEO_AU1",
                "job": "direct_answer",
                "question_ids": ["GEO_Q1"],
                "fact_ids": ["F1", "F2"],
                "source_ids": ["GEO_S1"],
                "context_dependency": "self_contained",
                "temporal_label": "evergreen",
                "placement": "opening summary",
            }
        ],
        "citation_map": [
            {
                "citation_id": "GEO_C1",
                "claim": "The example mechanism is observed through the example metric.",
                "fact_ids": ["F1", "F2"],
                "source_ids": ["GEO_S1"],
                "support": "direct",
                "visible_source_required": True,
            }
        ],
        "crawler_access": [
            {
                "engine": "google_ai",
                "crawler": "Googlebot",
                "policy": "unknown",
                "checked_at": None,
                "official_source_url": None,
                "observed_source_id": None,
            }
        ],
        "measurement_plan": {
            "sample_mode": "plan_only",
            "prompts": [],
            "windows": [],
            "required_sample_fields": [],
            "correction_owner": "research editor",
        },
        "observations": [],
        "sample_summary": {"total_samples": 0, "valid_samples": 0, "invalid_samples": 0, "metrics": []},
        "issues": [],
        "quality_report": {
            "upstream_research_state": "ready",
            "sample_integrity": "no_samples",
            "hard_failures": [],
            "warnings": [],
            "unknowns": ["No final page or crawler observation exists."],
        },
        "readiness": "conditional",
    }


def ready_preflight() -> dict:
    artifact = base_plan()
    artifact["mode"] = "preflight"
    artifact["brief"].update(
        {
            "seo_pack_ref": "seo_pack_1111111111111111",
            "artifact_ref": "artifact://example/page-one",
            "target_url": "https://example.com/research/example-market-mechanism",
        }
    )
    artifact["seo_eligibility"] = {
        "state": "pass",
        "seo_pack_ref": "seo_pack_1111111111111111",
        "notes": "Observed eligibility floor passed.",
    }
    artifact["crawler_access"][0].update(
        {
            "policy": "allowed",
            "checked_at": "2026-07-14T07:30:00Z",
            "official_source_url": "https://developers.google.com/search/docs/appearance/ai-features",
            "observed_source_id": "GEO_S2",
        }
    )
    artifact["quality_report"]["unknowns"] = []
    artifact["readiness"] = "ready"
    return artifact


def ready_sample_review() -> dict:
    artifact = ready_preflight()
    artifact["mode"] = "sample_review"
    artifact["brief"]["sample_refs"] = ["sample://example/google-ai-one"]
    artifact["brief"]["source_refs"].append("sample-source://example/google-ai-one")
    artifact["source_register"].append(
        {
            "source_id": "GEO_S3",
            "source_ref": "sample-source://example/google-ai-one",
            "source_locator": "sample://example/google-ai-one#answer",
            "kind": "manual_platform_sample",
            "observed_at": "2026-07-14T09:00:00Z",
            "freshness": "current",
            "fact_ids": [],
            "evidence_ref": "sample://example/google-ai-one",
        }
    )
    artifact["measurement_plan"] = {
        "sample_mode": "manual_real",
        "prompts": [
            {
                "prompt_id": "GEO_P1",
                "engine": "google_ai",
                "question_id": "GEO_Q1",
                "version": "v1",
                "text": "How does the example market mechanism affect the example metric?",
            }
        ],
        "windows": [{"label": "baseline", "offset_hours": 0}],
        "required_sample_fields": ["engine", "prompt_id", "sampled_at", "raw_evidence_ref", "answer_hash", "review_state"],
        "correction_owner": "research editor",
    }
    artifact["observations"] = [
        {
            "observation_id": "GEO_O1",
            "sample_mode": "manual_real",
            "engine": "google_ai",
            "sampled_at": "2026-07-14T09:00:00Z",
            "prompt_id": "GEO_P1",
            "raw_evidence_ref": "sample://example/google-ai-one",
            "answer_hash": HASH_B,
            "mentioned_entity_ids": ["GEO_ENT_MECHANISM", "GEO_ENT_METRIC"],
            "citation_urls": ["https://example.com/research/example-market-mechanism"],
            "evaluated_citation_ids": ["GEO_C1"],
            "review_state": "manual_verified",
        }
    ]
    artifact["sample_summary"] = {
        "total_samples": 1,
        "valid_samples": 1,
        "invalid_samples": 0,
        "metrics": [
            {
                "metric_id": "GEO_M1",
                "numerator": 1,
                "denominator": 1,
                "value": 1.0,
                "definition": "Share of valid samples that mention the canonical mechanism entity.",
            }
        ],
    }
    artifact["quality_report"]["sample_integrity"] = "verified"
    return artifact


class ValidateMarketGEOPackTests(unittest.TestCase):
    def result(self, artifact: dict) -> dict:
        return VALIDATOR.validate(artifact)

    def assert_valid(self, artifact: dict) -> dict:
        result = self.result(artifact)
        self.assertTrue(result["valid"], result)
        return result

    def error_codes(self, artifact: dict) -> set[str]:
        return {entry["code"] for entry in self.result(artifact)["errors"]}

    def test_valid_plan_is_conditional(self) -> None:
        self.assertEqual(self.assert_valid(base_plan())["computed_readiness"], "conditional")

    def test_valid_ready_preflight(self) -> None:
        self.assertEqual(self.assert_valid(ready_preflight())["computed_readiness"], "ready")

    def test_valid_verified_sample_review(self) -> None:
        self.assertEqual(self.assert_valid(ready_sample_review())["computed_readiness"], "ready")

    def test_blocked_seo_is_valid_blocked_pack(self) -> None:
        artifact = base_plan()
        artifact["seo_eligibility"]["state"] = "blocked"
        artifact["readiness"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("SEO_ELIGIBILITY_BLOCKED", {entry["code"] for entry in result["blockers"]})

    def test_entity_cannot_use_unknown_fact(self) -> None:
        artifact = base_plan()
        artifact["entity_graph"]["entities"][0]["fact_ids"] = ["F99"]
        self.assertIn("UNKNOWN_FACT_REF", self.error_codes(artifact))

    def test_fact_source_ids_must_cover_the_bound_facts(self) -> None:
        artifact = base_plan()
        artifact["citation_map"][0]["source_ids"] = ["GEO_S2"]
        self.assertIn("FACT_SOURCE_MISMATCH", self.error_codes(artifact))

    def test_ruleset_and_source_locator_are_required(self) -> None:
        artifact = base_plan()
        artifact["ruleset_version"] = "latest"
        artifact["source_register"][0]["source_locator"] = ""
        codes = self.error_codes(artifact)
        self.assertIn("RULESET_VERSION", codes)
        self.assertIn("SOURCE_LOCATOR", codes)

    def test_unsupported_citation_is_valid_blocked_pack(self) -> None:
        artifact = ready_preflight()
        artifact["citation_map"][0]["support"] = "unsupported"
        artifact["readiness"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("UNSUPPORTED_CITATION", {entry["code"] for entry in result["blockers"]})

    def test_partial_citation_is_conditional(self) -> None:
        artifact = ready_preflight()
        artifact["citation_map"][0]["support"] = "partial"
        artifact["readiness"] = "conditional"
        self.assert_valid(artifact)

    def test_realtime_fact_card_requires_current_as_of(self) -> None:
        artifact = base_plan()
        artifact["brief"].update({"temporal_mode": "realtime", "as_of": "2026-07-14T08:00:00Z"})
        artifact["fact_cards"][0].update({"temporal_scope": "current_as_of", "as_of": None, "freshness": "unknown"})
        artifact["answer_units"][0]["temporal_label"] = "current_as_of"
        artifact["readiness"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("CURRENT_FACT_CARD", {entry["code"] for entry in result["blockers"]})

    def test_observed_crawler_policy_needs_official_provenance(self) -> None:
        artifact = ready_preflight()
        artifact["crawler_access"][0]["official_source_url"] = None
        self.assertIn("CRAWLER_OFFICIAL_SOURCE", self.error_codes(artifact))

    def test_monitor_plan_requires_prompts_and_sample_fields(self) -> None:
        artifact = base_plan()
        artifact["mode"] = "monitor_plan"
        codes = self.error_codes(artifact)
        self.assertIn("MONITOR_PROMPTS", codes)
        self.assertIn("SAMPLE_FIELDS", codes)

    def test_synthetic_sample_never_proves_live_readiness(self) -> None:
        artifact = ready_sample_review()
        artifact["source_register"][-1]["kind"] = "synthetic_sample"
        artifact["observations"][0]["sample_mode"] = "synthetic_replay"
        artifact["measurement_plan"]["sample_mode"] = "synthetic_replay"
        artifact["quality_report"]["sample_integrity"] = "synthetic_only"
        artifact["readiness"] = "conditional"
        self.assert_valid(artifact)

    def test_metric_denominator_excludes_invalid_samples(self) -> None:
        artifact = ready_sample_review()
        artifact["sample_summary"]["metrics"][0]["denominator"] = 2
        artifact["sample_summary"]["metrics"][0]["value"] = 0.5
        self.assertIn("METRIC_DENOMINATOR", self.error_codes(artifact))

    def test_sample_raw_evidence_must_be_declared(self) -> None:
        artifact = ready_sample_review()
        artifact["observations"][0]["raw_evidence_ref"] = "sample://missing"
        self.assertIn("OBSERVATION_RAW_EVIDENCE", self.error_codes(artifact))

    def test_observations_only_belong_to_sample_review(self) -> None:
        artifact = ready_sample_review()
        artifact["mode"] = "preflight"
        self.assertIn("OBSERVATION_MODE", self.error_codes(artifact))

    def test_blocking_issue_blocks_readiness(self) -> None:
        artifact = ready_preflight()
        artifact["issues"] = [
            {
                "issue_id": "GEO_I1",
                "severity": "block",
                "location": "opening summary",
                "evidence_source_ids": ["GEO_S1"],
                "action": "Remove the unsupported directional claim.",
                "owner": "research editor",
                "acceptance_test": "Every remaining claim maps to supported facts.",
                "handoff": "research",
            }
        ]
        artifact["readiness"] = "blocked"
        self.assert_valid(artifact)

    def test_secret_field_is_invalid(self) -> None:
        artifact = base_plan()
        artifact["api_key"] = "do-not-store"
        self.assertIn("SECRET_FIELD", self.error_codes(artifact))

    def test_personalized_advice_stays_disabled(self) -> None:
        artifact = base_plan()
        artifact["brief"]["personalized_advice_allowed"] = True
        self.assertIn("ADVICE_BOUNDARY", self.error_codes(artifact))


if __name__ == "__main__":
    unittest.main()
