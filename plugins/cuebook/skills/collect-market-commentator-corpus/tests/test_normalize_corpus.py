from __future__ import annotations

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "normalize_corpus.py"
SPEC = importlib.util.spec_from_file_location("normalize_corpus", SCRIPT_PATH)
assert SPEC and SPEC.loader
NORMALIZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


class NormalizeCorpusTests(unittest.TestCase):
    def test_json_preserves_chinese_and_merges_duplicates(self) -> None:
        records = [
            {
                "id": "1001",
                "platform": "twitter",
                "author": {"name": "测试作者", "handle": "@tester"},
                "text": "英伟达 $NVDA 营收超预期，AI ETF 和 CPI 只是上下文。",
                "created_at": "2026-07-14T08:00:00+08:00",
                "url": "https://twitter.com/tester/status/1001?utm_source=feed",
                "links": [
                    {
                        "url": "https://WWW.REUTERS.COM/markets/chips/?utm_medium=social",
                        "type": "source",
                    }
                ],
                "entities": {"organizations": ["英伟达"]},
                "metrics": {"like_count": "1.2万"},
                "provenance": {"collector": "authorized-export"},
            },
            {
                "id": "1001",
                "platform": "x",
                "author_handle": "tester",
                "text": "英伟达 $NVDA 营收超预期，AI ETF 和 CPI 只是上下文。",
                "created_at": "2026-07-14T00:00:00Z",
                "url": "https://x.com/tester/status/1001",
                "metrics": {"likes": "12,500", "replies": "3"},
            },
            {"id": "empty", "text": "   "},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.json"
            path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
            corpus = NORMALIZER.normalize_files(
                [path],
                rights_basis="authorized",
                source_label="regression export",
                subject_name="测试作者",
            )

        self.assertEqual(corpus["schema_version"], "corpus.v1")
        self.assertEqual(corpus["stats"]["input_records"], 3)
        self.assertEqual(corpus["stats"]["output_items"], 1)
        self.assertEqual(corpus["stats"]["duplicates_removed"], 1)
        self.assertEqual(corpus["quality"]["skipped_records"], 1)

        item = corpus["items"][0]
        self.assertIn("英伟达", item["text"])
        self.assertEqual(item["url"], "https://x.com/tester/status/1001")
        self.assertEqual(item["links"][0]["domain"], "reuters.com")
        self.assertEqual(item["entities"]["tickers"], ["NVDA"])
        self.assertNotIn("AI", item["entities"]["tickers"])
        self.assertNotIn("CPI", item["entities"]["tickers"])
        self.assertNotIn("ETF", item["entities"]["tickers"])
        self.assertEqual(item["metrics"]["values"]["likes"], 12500)
        self.assertEqual(item["metrics"]["values"]["replies"], 3)
        self.assertTrue(item["metrics"]["available"])
        self.assertEqual(len(item["provenance"]["records"]), 2)
        self.assertIn("deduplicated_merge", item["provenance"]["transformations"])

    def test_jsonl_and_csv_are_accepted_together(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            jsonl_path = root / "records.jsonl"
            jsonl_path.write_text(
                json.dumps(
                    {
                        "id": "j1",
                        "text": "油价突破前高，成交量同步放大。",
                        "platform": "x",
                        "created_at": "2026-07-13T09:00:00Z",
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )

            csv_path = root / "records.csv"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["id", "text", "platform", "created_at", "links", "metrics"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "id": "c1",
                        "text": "Revenue guidance moved higher after the filing.",
                        "platform": "newsletter",
                        "created_at": "2026-07-12",
                        "links": json.dumps(["https://sec.gov/Archives/example"]),
                        "metrics": json.dumps({"views": "2.5K"}),
                    }
                )

            corpus = NORMALIZER.normalize_files(
                [jsonl_path, csv_path],
                rights_basis="public",
                source_label="public regression inputs",
            )

        self.assertEqual(corpus["stats"]["output_items"], 2)
        self.assertEqual({item["language"] for item in corpus["items"]}, {"en", "zh"})
        self.assertEqual(
            {entry["format"] for entry in corpus["provenance"]["inputs"]},
            {"jsonl", "csv"},
        )
        csv_item = next(item for item in corpus["items"] if item["external_id"] == "c1")
        self.assertEqual(csv_item["metrics"]["values"]["views"], 2500)
        self.assertNotIn("likes", csv_item["metrics"]["values"])
        self.assertIn("likes", csv_item["metrics"]["missing"])


if __name__ == "__main__":
    unittest.main()
