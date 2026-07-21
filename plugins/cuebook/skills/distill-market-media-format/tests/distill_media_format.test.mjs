import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as DISTILLER from "../scripts/distill_media_format.mjs";
import * as NORMALIZER from "../../collect-market-media-corpus/scripts/normalize_media_corpus.mjs";

const SKILL_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA_PATH = join(SKILL_ROOT, "references", "media-format-v1.schema.json");

function makeCorpus(t, records) {
  const temp = mkdtempSync(join(tmpdir(), "distill-media-format-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const path = join(temp, "records.json");
  writeFileSync(path, JSON.stringify(records));
  return NORMALIZER.normalize([path], {
    rights_basis: "public",
    source_label: "test",
    sample_frame: "baseline plus high attention",
  });
}

test("image note contract and bridge", (t) => {
  const records = [];
  for (let index = 0; index < 8; index += 1) {
    records.push({
      id: `xhs-${index}`,
      platform: "xiaohongshu",
      format: "image_note",
      sample_role: index === 0 || index === 1 ? "high_attention" : "baseline",
      title: `Memory cycle ${index}`,
      cover_text: "Who is being forced to sell?",
      tags: ["memory", "semiconductors"],
      assets: [{ type: "image", width: 1080, height: 1440, rights: "owned" }],
      segments: [
        { role: "cover", text: "Who is being forced to sell?" },
        { role: "card", text: "Establish the event and timing first." },
        { role: "evidence", text: "Then show price and sources.", source_urls: ["https://example.com/source"] },
        { role: "invalidation", text: "Reassess if inventory data reverses." },
        { role: "disclosure", text: "Market record only." },
      ],
      metrics: { likes: 100 + index, bookmarks: 80 + index },
    });
  }
  const profile = DISTILLER.distill(makeCorpus(t, records));
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  assert.ok(schema.required.every((key) => key in profile));
  assert.deepEqual(profile.target, { platform: "xiaohongshu", format: "image_note" });
  assert.equal(profile.quality_gate.status, "pass");
  assert.ok(profile.corpus_summary.performance_inference_allowed);
  assert.ok(new Set(profile.media_map.aspect_ratios.map((entry) => entry.ratio)).has("3:4"));
  assert.equal(profile.compliance_map.disclosure_coverage, 1.0);
  const ruleIds = profile.cuebook_bridge.rules.map((entry) => entry.rule_id);
  assert.equal(ruleIds.length, new Set(ruleIds).size);
  assert.ok(ruleIds.some((ruleId) => ruleId.includes("unit-card")));
});

test("single high attention video stays provisional", (t) => {
  const corpus = makeCorpus(t, [
    {
      id: "video-1",
      platform: "douyin",
      format: "short_video",
      sample_role: "high_attention",
      assets: [{ type: "video", duration_ms: 15000, rights: "owned" }],
      segments: [
        { role: "hook", text: "What happened?", start_ms: 0, end_ms: 2500 },
        { role: "evidence", text: "Sources and numbers", start_ms: 2500, end_ms: 10000 },
        { role: "invalidation", text: "What could break the view?", start_ms: 10000, end_ms: 15000 },
      ],
      metrics: { views: 100000 },
    },
  ]);
  const profile = DISTILLER.distill(corpus);
  assert.equal(profile.quality_gate.status, "caution");
  assert.ok(!profile.corpus_summary.performance_inference_allowed);
  assert.equal(profile.media_map.timing_coverage, 1.0);
});

test("mixed corpus reports concentration", (t) => {
  const corpus = makeCorpus(t, [
    { id: "a", platform: "reddit", format: "community_post", body: "A", community: { name: "stocks" } },
    { id: "b", platform: "reddit", format: "community_post", body: "B", community: { name: "stocks" } },
    { id: "c", platform: "douyin", format: "short_video", transcript: "C" },
    { id: "d", platform: "xiaohongshu", format: "image_note", body: "D" },
  ]);
  const profile = DISTILLER.distill(corpus);
  assert.deepEqual(profile.target, { platform: "reddit", format: "community_post" });
  assert.equal(profile.corpus_summary.target_concentration, 0.5);
  assert.equal(profile.quality_gate.status, "caution");
});

test("platform policy guards are explicit", (t) => {
  const corpus = makeCorpus(t, [
    { id: "sa", platform: "seeking_alpha", format: "long_form_article", body: "Thesis and evidence." },
  ]);
  const profile = DISTILLER.distill(corpus);
  assert.equal(profile.policy_guard.status, "restricted");
  assert.ok(new Set(profile.policy_guard.rules.map((rule) => rule.rule_id)).has("sa.ai-submission"));
});

test("rejects text corpus and private provenance", (t) => {
  assert.throws(() => DISTILLER.distill({ schema_version: "corpus.v1", items: [] }), /schema_version/);
  const corpus = makeCorpus(t, [{ id: "x", platform: "reddit", format: "community_post", body: "x" }]);
  corpus.provenance.rights_basis = "private";
  assert.throws(() => DISTILLER.distill(corpus), /public or authorized/);
});
