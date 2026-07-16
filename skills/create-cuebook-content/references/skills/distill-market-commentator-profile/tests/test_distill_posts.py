from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = SKILL_ROOT / "scripts" / "distill_posts.py"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "corpus-v1.json"
SCHEMA_PATH = SKILL_ROOT / "references" / "profile-v1.schema.json"

SPEC = importlib.util.spec_from_file_location("distill_posts", SCRIPT_PATH)
assert SPEC and SPEC.loader
DISTILLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DISTILLER)


class DistillPostsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.profile = DISTILLER.distill(cls.corpus)

    def test_profile_contract_and_boundary(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(self.profile["schema_version"], "profile.v1")
        self.assertTrue(set(schema["required"]).issubset(self.profile))
        self.assertEqual(self.profile["quality_gate"]["status"], "caution")
        self.assertNotIn("sample_original_outputs", self.profile)
        self.assertNotIn("generated_posts", self.profile)
        self.assertTrue(self.profile["risk_map"]["prohibited_actions"])

    def test_chinese_attention_patterns_have_event_type(self) -> None:
        entries = self.profile["attention_map"]
        self.assertTrue(all("event_type" in entry for entry in entries))
        event_types = {entry["event_type"] for entry in entries}
        self.assertIn("hard-data-print", event_types)
        self.assertIn("tape-break", event_types)
        self.assertIn("crowded-unwind", event_types)
        self.assertIn("macro-risk-premium", event_types)
        self.assertIn("valuation-rerating", event_types)

    def test_negated_terms_and_cooking_oil_do_not_create_events(self) -> None:
        items = [
            {"id": "n1", "text": "No EPS or revenue change."},
            {"id": "n2", "text": "A breakthrough, but no capacity constraint."},
            {"id": "n3", "text": "$ADM cooking oil sales rose."},
        ]
        entries, _ = DISTILLER.pattern_map(
            items,
            DISTILLER.EVENT_PATTERNS,
            "event_type",
            5,
            negation_aware=True,
        )
        self.assertEqual(entries, [])

        positive, _ = DISTILLER.pattern_map(
            [{"id": "p1", "text": "Revenue guidance increased above consensus."}],
            DISTILLER.EVENT_PATTERNS,
            "event_type",
            5,
            negation_aware=True,
        )
        self.assertIn("hard-data-print", {entry["event_type"] for entry in positive})

    def test_domains_are_parsed_from_urls(self) -> None:
        domains = {entry["domain"]: entry["source_type"] for entry in self.profile["source_map"]["domains"]}
        self.assertEqual(domains["reuters.com"], "media_wire")
        self.assertEqual(domains["stats.gov.cn"], "official")
        self.assertEqual(domains["polymarket.com"], "market_data")
        self.assertEqual(domains["x.com"], "social")
        self.assertNotIn("www.reuters.com", domains)

    def test_tickers_require_structured_or_explicit_evidence(self) -> None:
        tickers = {entry["ticker"] for entry in self.profile["corpus_summary"]["top_tickers"]}
        self.assertEqual(tickers, {"NVDA"})
        self.assertNotIn("AI", tickers)
        self.assertNotIn("CPI", tickers)
        self.assertNotIn("ETF", tickers)

    def test_missing_metrics_are_not_zero(self) -> None:
        availability = self.profile["quality_gate"]["metrics_availability"]
        self.assertEqual(availability["items_total"], 4)
        self.assertEqual(availability["items_with_any"], 2)
        self.assertEqual(availability["item_coverage"], 0.5)
        self.assertEqual(availability["fields"]["likes"]["observed_items"], 2)
        self.assertFalse(availability["engagement_ranking_available"])

    def test_engagement_ranking_requires_a_comparable_sample(self) -> None:
        comparable = [
            {"metrics": {"values": {"likes": index + 1}}}
            for index in range(8)
        ]
        self.assertTrue(DISTILLER.metrics_availability(comparable)["engagement_ranking_available"])

        views_only = [
            {"metrics": {"values": {"views": (index + 1) * 100}}}
            for index in range(8)
        ]
        self.assertFalse(DISTILLER.metrics_availability(views_only)["engagement_ranking_available"])

    def test_cuebook_bridge_has_stable_rules_and_route_mapping(self) -> None:
        bridge = self.profile["cuebook_bridge"]
        self.assertEqual(bridge["taxonomy_version"], "profile-bridge-v1")
        rules = (
            bridge["attention_affinities"]
            + bridge["source_preferences"]
            + bridge["reasoning_rules"]
            + bridge["opening_rules"]
            + bridge["data_hooks"]
            + bridge["render_constraints"]
        )
        rule_ids = [entry["rule_id"] for entry in rules]
        self.assertEqual(len(rule_ids), len(set(rule_ids)))
        self.assertTrue(all(rule_id for rule_id in rule_ids))
        self.assertTrue(all(entry["route_event_types"] for entry in bridge["attention_affinities"]))
        hard_data = next(
            entry for entry in bridge["attention_affinities"]
            if entry["attention_type"] == "hard-data-print"
        )
        self.assertIn("earnings-result", hard_data["route_event_types"])

    def test_raw_records_and_inconsistent_metrics_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "schema_version"):
            DISTILLER.distill({"items": []})

        broken = json.loads(json.dumps(self.corpus))
        broken["items"][0]["metrics"]["available"] = False
        with self.assertRaisesRegex(ValueError, "disagrees"):
            DISTILLER.distill(broken)


if __name__ == "__main__":
    unittest.main()
