import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { normalize } from "../scripts/normalize_media_corpus.mjs";

let directory;
let corpus;
let inputPath;

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "media-corpus-test-"));
  inputPath = path.join(directory, "media.json");
  const payload = [
    {
      external_id: "sa-1",
      platform: "seeking_alpha",
      format: "long_form_article",
      title: "Memory cycle update",
      sample_role: "baseline",
      created_at: "2026-07-01T10:00:00Z",
      url: "https://example.com/article/1#fragment",
      language: "en",
      segments: [
        { role: "thesis", text: "The estimate path changed." },
        { role: "valuation", text: "The multiple still assumes a clean cycle." },
        { role: "risk", text: "Inventory could rebuild." },
      ],
      metrics: {},
    },
    {
      external_id: "xhs-1",
      platform: "xiaohongshu",
      format: "image_note",
      title: "Why memory stocks fell together",
      cover_text: "First watch who is being forced to sell",
      sample_role: "high_attention",
      language: "zh-CN",
      assets: [{ id: "cover", type: "image", width: 1080, height: 1440 }],
      segments: [
        { role: "cover", text: "First watch who is being forced to sell" },
        { role: "card", text: "The Korean market circuit breaker flushed out highly leveraged capital first." },
        { role: "disclosure", text: "Market record only." },
      ],
      metrics: { likes: 120, bookmarks: 90 },
    },
    {
      external_id: "rd-1",
      platform: "reddit",
      format: "community_post",
      title: "Is the memory selloff flow-driven?",
      body: "I am trying to separate fundamentals from forced selling.",
      community: { name: "stocks", op_intent: "requesting counterevidence" },
      comments: [{ text: "What does inventory say?", author_role: "community", score: 8 }],
      language: "en",
    },
    {
      external_id: "dy-1",
      platform: "douyin",
      format: "short_video",
      title: "Why oil did not surge at the open",
      language: "zh-CN",
      segments: [
        { role: "hook", text: "Oil only reached this level—what is the market pricing?", start_ms: 0, end_ms: 3000 },
        { role: "voiceover", text: "Watch the term structure first, then cross-region spreads.", start_ms: 3000, end_ms: 12000 },
      ],
    },
    {
      external_id: "sa-1",
      platform: "seeking_alpha",
      format: "long_form_article",
      body: "duplicate",
    },
  ];
  writeFileSync(inputPath, JSON.stringify(payload), "utf8");
  corpus = normalize([inputPath], {
    rights_basis: "public",
    source_label: "test set",
    sample_frame: "recent plus baseline",
  });
});

after(() => rmSync(directory, { recursive: true, force: true }));

test("contract and deduplication", () => {
  assert.equal(corpus.schema_version, "media-corpus.v1");
  assert.equal(corpus.stats.input_records, 5);
  assert.equal(corpus.stats.output_items, 4);
  assert.equal(corpus.stats.duplicates_removed, 1);
  assert.equal(corpus.items[0].provenance.records.length, 2);
});

test("ordered units and timing are preserved", () => {
  const article = corpus.items.find((item) => item.external_id === "sa-1");
  assert.deepEqual(article.segments.map((segment) => segment.role), ["thesis", "valuation", "risk"]);
  const video = corpus.items.find((item) => item.external_id === "dy-1");
  assert.equal(video.segments[1].start_ms, 3000);
  assert.equal(video.segments[1].end_ms, 12000);
});

test("absent metrics are not zero", () => {
  const article = corpus.items.find((item) => item.external_id === "sa-1");
  assert.equal(article.metrics.available, false);
  assert.deepEqual(article.metrics.values, {});
  assert.ok(article.metrics.missing.includes("likes"));
});

test("asset rights and community gaps are explicit", () => {
  const note = corpus.items.find((item) => item.external_id === "xhs-1");
  assert.equal(note.assets[0].rights_status, "unknown");
  assert.equal(note.compliance.account_qualification, "unknown");
  assert.equal(note.compliance.disclosure_segment_ids.length, 1);
  const reddit = corpus.items.find((item) => item.external_id === "rd-1");
  assert.equal(reddit.community.name, "stocks");
  assert.equal(reddit.community.rules_url, null);
  assert.ok(corpus.quality.warnings.some((warning) => warning.includes("community rules snapshot")));
});

test("rejects unsupported rights basis", () => {
  assert.throws(
    () => normalize([inputPath], { rights_basis: "private", source_label: "x", sample_frame: "x" }),
    /rights_basis/,
  );
});
