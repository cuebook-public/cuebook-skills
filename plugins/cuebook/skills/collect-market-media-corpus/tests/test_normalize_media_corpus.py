from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = SKILL_ROOT / "scripts" / "normalize_media_corpus.py"
SCHEMA_PATH = SKILL_ROOT / "references" / "media-corpus-v1.schema.json"
SPEC = importlib.util.spec_from_file_location("normalize_media_corpus", SCRIPT_PATH)
assert SPEC and SPEC.loader
NORMALIZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


class NormalizeMediaCorpusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.path = Path(self.tempdir.name) / "media.json"
        payload = [
            {
                "external_id": "sa-1",
                "platform": "seeking_alpha",
                "format": "long_form_article",
                "title": "Memory cycle update",
                "sample_role": "baseline",
                "created_at": "2026-07-01T10:00:00Z",
                "url": "https://example.com/article/1#fragment",
                "language": "en",
                "segments": [
                    {"role": "thesis", "text": "The estimate path changed."},
                    {"role": "valuation", "text": "The multiple still assumes a clean cycle."},
                    {"role": "risk", "text": "Inventory could rebuild."},
                ],
                "metrics": {},
            },
            {
                "external_id": "xhs-1",
                "platform": "xiaohongshu",
                "format": "image_note",
                "title": "存储股为什么一起跌",
                "cover_text": "先看谁在被迫卖",
                "sample_role": "high_attention",
                "language": "zh-CN",
                "assets": [{"id": "cover", "type": "image", "width": 1080, "height": 1440}],
                "segments": [
                    {"role": "cover", "text": "先看谁在被迫卖"},
                    {"role": "card", "text": "韩股熔断把高杠杆资金先打出来。"},
                    {"role": "disclosure", "text": "仅为市场记录。"},
                ],
                "metrics": {"likes": 120, "bookmarks": 90},
            },
            {
                "external_id": "rd-1",
                "platform": "reddit",
                "format": "community_post",
                "title": "Is the memory selloff flow-driven?",
                "body": "I am trying to separate fundamentals from forced selling.",
                "community": {"name": "stocks", "op_intent": "requesting counterevidence"},
                "comments": [{"text": "What does inventory say?", "author_role": "community", "score": 8}],
                "language": "en",
            },
            {
                "external_id": "dy-1",
                "platform": "douyin",
                "format": "short_video",
                "title": "油价开盘为什么没冲高",
                "language": "zh-CN",
                "segments": [
                    {"role": "hook", "text": "油价只到这里，市场在赌什么？", "start_ms": 0, "end_ms": 3000},
                    {"role": "voiceover", "text": "先看期限结构，再看跨区价差。", "start_ms": 3000, "end_ms": 12000},
                ],
            },
            {
                "external_id": "sa-1",
                "platform": "seeking_alpha",
                "format": "long_form_article",
                "body": "duplicate",
            },
        ]
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        self.corpus = NORMALIZER.normalize(
            [self.path],
            rights_basis="public",
            source_label="test set",
            sample_frame="recent plus baseline",
        )

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_contract_and_deduplication(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertTrue(set(schema["required"]).issubset(self.corpus))
        self.assertEqual(self.corpus["schema_version"], "media-corpus.v1")
        self.assertEqual(self.corpus["stats"]["input_records"], 5)
        self.assertEqual(self.corpus["stats"]["output_items"], 4)
        self.assertEqual(self.corpus["stats"]["duplicates_removed"], 1)
        self.assertEqual(len(self.corpus["items"][0]["provenance"]["records"]), 2)

    def test_ordered_units_and_timing_are_preserved(self) -> None:
        article = next(item for item in self.corpus["items"] if item["external_id"] == "sa-1")
        self.assertEqual([segment["role"] for segment in article["segments"]], ["thesis", "valuation", "risk"])
        video = next(item for item in self.corpus["items"] if item["external_id"] == "dy-1")
        self.assertEqual(video["segments"][1]["start_ms"], 3000)
        self.assertEqual(video["segments"][1]["end_ms"], 12000)

    def test_absent_metrics_are_not_zero(self) -> None:
        article = next(item for item in self.corpus["items"] if item["external_id"] == "sa-1")
        self.assertFalse(article["metrics"]["available"])
        self.assertEqual(article["metrics"]["values"], {})
        self.assertIn("likes", article["metrics"]["missing"])

    def test_asset_rights_and_community_gaps_are_explicit(self) -> None:
        note = next(item for item in self.corpus["items"] if item["external_id"] == "xhs-1")
        self.assertEqual(note["assets"][0]["rights_status"], "unknown")
        self.assertEqual(note["compliance"]["account_qualification"], "unknown")
        self.assertEqual(len(note["compliance"]["disclosure_segment_ids"]), 1)
        reddit = next(item for item in self.corpus["items"] if item["external_id"] == "rd-1")
        self.assertEqual(reddit["community"]["name"], "stocks")
        self.assertIsNone(reddit["community"]["rules_url"])
        self.assertTrue(any("community rules snapshot" in warning for warning in self.corpus["quality"]["warnings"]))

    def test_rejects_unsupported_rights_basis(self) -> None:
        with self.assertRaisesRegex(ValueError, "rights_basis"):
            NORMALIZER.normalize([self.path], rights_basis="private", source_label="x", sample_frame="x")


if __name__ == "__main__":
    unittest.main()
