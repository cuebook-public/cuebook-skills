import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { normalize_files } from "../scripts/normalize_corpus.mjs";

function withTempDirectory(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "corpus-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("json preserves source text and merges duplicates", () => {
  const records = [
    {
      id: "1001",
      platform: "twitter",
      author: { name: "Test Author", handle: "@tester" },
      text: "Nvidia $NVDA revenue beat expectations; the AI ETF and CPI are only context.",
      created_at: "2026-07-14T08:00:00+08:00",
      url: "https://twitter.com/tester/status/1001?utm_source=feed",
      links: [{ url: "https://WWW.REUTERS.COM/markets/chips/?utm_medium=social", type: "source" }],
      entities: { organizations: ["Nvidia"] },
      metrics: { like_count: "12K" },
      provenance: { collector: "authorized-export" },
    },
    {
      id: "1001",
      platform: "x",
      author_handle: "tester",
      text: "Nvidia $NVDA revenue beat expectations; the AI ETF and CPI are only context.",
      created_at: "2026-07-14T00:00:00Z",
      url: "https://x.com/tester/status/1001",
      metrics: { likes: "12,500", replies: "3" },
    },
    { id: "empty", text: "   " },
  ];

  const corpus = withTempDirectory((directory) => {
    const inputPath = path.join(directory, "records.json");
    writeFileSync(inputPath, JSON.stringify(records), "utf8");
    return normalize_files([inputPath], {
      rights_basis: "authorized",
      source_label: "regression export",
      subject_name: "Test Author",
    });
  });

  assert.equal(corpus.schema_version, "corpus.v1");
  assert.equal(corpus.stats.input_records, 3);
  assert.equal(corpus.stats.output_items, 1);
  assert.equal(corpus.stats.duplicates_removed, 1);
  assert.equal(corpus.quality.skipped_records, 1);
  const item = corpus.items[0];
  assert.ok(item.text.includes("Nvidia"));
  assert.equal(item.url, "https://x.com/tester/status/1001");
  assert.equal(item.links[0].domain, "reuters.com");
  assert.deepEqual(item.entities.tickers, ["NVDA"]);
  assert.ok(!item.entities.tickers.includes("AI"));
  assert.ok(!item.entities.tickers.includes("CPI"));
  assert.ok(!item.entities.tickers.includes("ETF"));
  assert.equal(item.metrics.values.likes, 12500);
  assert.equal(item.metrics.values.replies, 3);
  assert.equal(item.metrics.available, true);
  assert.equal(item.provenance.records.length, 2);
  assert.ok(item.provenance.transformations.includes("deduplicated_merge"));
});

test("jsonl and csv are accepted together", () => {
  const corpus = withTempDirectory((directory) => {
    const jsonlPath = path.join(directory, "records.jsonl");
    writeFileSync(
      jsonlPath,
      `${JSON.stringify({
        id: "j1",
        text: "Oil broke above its prior high as volume expanded.",
        platform: "x",
        created_at: "2026-07-13T09:00:00Z",
      })}\n`,
      "utf8",
    );
    const csvPath = path.join(directory, "records.csv");
    writeFileSync(
      csvPath,
      'id,text,platform,created_at,links,metrics\n' +
        'c1,Revenue guidance moved higher after the filing.,newsletter,2026-07-12,"[""https://sec.gov/Archives/example""]","{""views"": ""2.5K""}"\n',
      "utf8",
    );
    return normalize_files([jsonlPath, csvPath], {
      rights_basis: "public",
      source_label: "public regression inputs",
    });
  });

  assert.equal(corpus.stats.output_items, 2);
  assert.deepEqual(new Set(corpus.items.map((item) => item.language)), new Set(["en"]));
  assert.deepEqual(new Set(corpus.provenance.inputs.map((entry) => entry.format)), new Set(["jsonl", "csv"]));
  const csvItem = corpus.items.find((item) => item.external_id === "c1");
  assert.equal(csvItem.metrics.values.views, 2500);
  assert.ok(!Object.hasOwn(csvItem.metrics.values, "likes"));
  assert.ok(csvItem.metrics.missing.includes("likes"));
});
