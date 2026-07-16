from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = SKILL_ROOT / "scripts" / "distill_media_format.py"
SCHEMA_PATH = SKILL_ROOT / "references" / "media-format-v1.schema.json"
COLLECTOR_PATH = Path(__file__).resolve().parents[2] / "collect-market-media-corpus" / "scripts" / "normalize_media_corpus.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


DISTILLER = load_module("distill_media_format", SCRIPT_PATH)
NORMALIZER = load_module("normalize_media_corpus_for_distill", COLLECTOR_PATH)


class DistillMediaFormatTests(unittest.TestCase):
    def make_corpus(self, records):
        temp = tempfile.TemporaryDirectory()
        path = Path(temp.name) / "records.json"
        path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
        corpus = NORMALIZER.normalize([path], rights_basis="public", source_label="test", sample_frame="baseline plus high attention")
        self.addCleanup(temp.cleanup)
        return corpus

    def test_image_note_contract_and_bridge(self) -> None:
        records = []
        for index in range(8):
            records.append(
                {
                    "id": f"xhs-{index}",
                    "platform": "xiaohongshu",
                    "format": "image_note",
                    "sample_role": "high_attention" if index in {0, 1} else "baseline",
                    "title": f"存储周期 {index}",
                    "cover_text": "谁在被迫卖",
                    "tags": ["存储", "半导体"],
                    "assets": [{"type": "image", "width": 1080, "height": 1440, "rights": "owned"}],
                    "segments": [
                        {"role": "cover", "text": "谁在被迫卖"},
                        {"role": "card", "text": "先放事件和时间。"},
                        {"role": "evidence", "text": "再放价格和来源。", "source_urls": ["https://example.com/source"]},
                        {"role": "invalidation", "text": "库存数据反向就要重估。"},
                        {"role": "disclosure", "text": "仅为市场记录。"},
                    ],
                    "metrics": {"likes": 100 + index, "bookmarks": 80 + index},
                }
            )
        profile = DISTILLER.distill(self.make_corpus(records))
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertTrue(set(schema["required"]).issubset(profile))
        self.assertEqual(profile["target"], {"platform": "xiaohongshu", "format": "image_note"})
        self.assertEqual(profile["quality_gate"]["status"], "pass")
        self.assertTrue(profile["corpus_summary"]["performance_inference_allowed"])
        self.assertIn("3:4", {entry["ratio"] for entry in profile["media_map"]["aspect_ratios"]})
        self.assertEqual(profile["compliance_map"]["disclosure_coverage"], 1.0)
        rule_ids = [entry["rule_id"] for entry in profile["cuebook_bridge"]["rules"]]
        self.assertEqual(len(rule_ids), len(set(rule_ids)))
        self.assertTrue(any("unit-card" in rule_id for rule_id in rule_ids))

    def test_single_high_attention_video_stays_provisional(self) -> None:
        corpus = self.make_corpus(
            [
                {
                    "id": "video-1",
                    "platform": "douyin",
                    "format": "short_video",
                    "sample_role": "high_attention",
                    "assets": [{"type": "video", "duration_ms": 15000, "rights": "owned"}],
                    "segments": [
                        {"role": "hook", "text": "发生了什么", "start_ms": 0, "end_ms": 2500},
                        {"role": "evidence", "text": "来源和数字", "start_ms": 2500, "end_ms": 10000},
                        {"role": "invalidation", "text": "哪里会看错", "start_ms": 10000, "end_ms": 15000},
                    ],
                    "metrics": {"views": 100000},
                }
            ]
        )
        profile = DISTILLER.distill(corpus)
        self.assertEqual(profile["quality_gate"]["status"], "caution")
        self.assertFalse(profile["corpus_summary"]["performance_inference_allowed"])
        self.assertEqual(profile["media_map"]["timing_coverage"], 1.0)

    def test_mixed_corpus_reports_concentration(self) -> None:
        corpus = self.make_corpus(
            [
                {"id": "a", "platform": "reddit", "format": "community_post", "body": "A", "community": {"name": "stocks"}},
                {"id": "b", "platform": "reddit", "format": "community_post", "body": "B", "community": {"name": "stocks"}},
                {"id": "c", "platform": "douyin", "format": "short_video", "transcript": "C"},
                {"id": "d", "platform": "xiaohongshu", "format": "image_note", "body": "D"},
            ]
        )
        profile = DISTILLER.distill(corpus)
        self.assertEqual(profile["target"], {"platform": "reddit", "format": "community_post"})
        self.assertEqual(profile["corpus_summary"]["target_concentration"], 0.5)
        self.assertEqual(profile["quality_gate"]["status"], "caution")

    def test_platform_policy_guards_are_explicit(self) -> None:
        corpus = self.make_corpus(
            [{"id": "sa", "platform": "seeking_alpha", "format": "long_form_article", "body": "Thesis and evidence."}]
        )
        profile = DISTILLER.distill(corpus)
        self.assertEqual(profile["policy_guard"]["status"], "restricted")
        self.assertIn("sa.ai-submission", {rule["rule_id"] for rule in profile["policy_guard"]["rules"]})

    def test_rejects_text_corpus_and_private_provenance(self) -> None:
        with self.assertRaisesRegex(ValueError, "schema_version"):
            DISTILLER.distill({"schema_version": "corpus.v1", "items": []})
        corpus = self.make_corpus([{"id": "x", "platform": "reddit", "format": "community_post", "body": "x"}])
        corpus["provenance"]["rights_basis"] = "private"
        with self.assertRaisesRegex(ValueError, "public or authorized"):
            DISTILLER.distill(corpus)


if __name__ == "__main__":
    unittest.main()
