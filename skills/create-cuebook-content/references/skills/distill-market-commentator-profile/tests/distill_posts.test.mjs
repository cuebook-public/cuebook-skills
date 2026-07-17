import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EVENT_PATTERNS,
  distill,
  metricsAvailability,
  patternMap,
} from "../scripts/distill_posts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, "..");
const corpus = JSON.parse(readFileSync(join(here, "fixtures/corpus-v1.json"), "utf8"));
const profile = distill(corpus);

test("profile contract and boundary", () => {
  const schema = JSON.parse(readFileSync(join(skillRoot, "references/profile-v1.schema.json"), "utf8"));
  assert.equal(profile.schema_version, "profile.v1");
  assert.ok(schema.required.every((key) => Object.hasOwn(profile, key)));
  assert.equal(profile.quality_gate.status, "caution");
  assert.equal(Object.hasOwn(profile, "sample_original_outputs"), false);
  assert.equal(Object.hasOwn(profile, "generated_posts"), false);
  assert.ok(profile.risk_map.prohibited_actions.length);
});

test("Chinese attention patterns have event type", () => {
  const entries = profile.attention_map;
  assert.ok(entries.every((entry) => Object.hasOwn(entry, "event_type")));
  const eventTypes = new Set(entries.map((entry) => entry.event_type));
  for (const expected of ["hard-data-print", "tape-break", "crowded-unwind", "macro-risk-premium", "valuation-rerating"]) {
    assert.ok(eventTypes.has(expected));
  }
});

test("negated terms and cooking oil do not create events", () => {
  const items = [
    { id: "n1", text: "No EPS or revenue change." },
    { id: "n2", text: "A breakthrough, but no capacity constraint." },
    { id: "n3", text: "$ADM cooking oil sales rose." },
  ];
  const [entries] = patternMap(items, EVENT_PATTERNS, "event_type", 5, true);
  assert.deepEqual(entries, []);
  const [positive] = patternMap([{ id: "p1", text: "Revenue guidance increased above consensus." }], EVENT_PATTERNS, "event_type", 5, true);
  assert.ok(new Set(positive.map((entry) => entry.event_type)).has("hard-data-print"));
});

test("domains are parsed from URLs", () => {
  const domains = Object.fromEntries(profile.source_map.domains.map((entry) => [entry.domain, entry.source_type]));
  assert.equal(domains["reuters.com"], "media_wire");
  assert.equal(domains["stats.gov.cn"], "official");
  assert.equal(domains["polymarket.com"], "market_data");
  assert.equal(domains["x.com"], "social");
  assert.equal(Object.hasOwn(domains, "www.reuters.com"), false);
});

test("tickers require structured or explicit evidence", () => {
  const tickers = new Set(profile.corpus_summary.top_tickers.map((entry) => entry.ticker));
  assert.deepEqual(tickers, new Set(["NVDA"]));
  for (const rejected of ["AI", "CPI", "ETF"]) assert.equal(tickers.has(rejected), false);
});

test("missing metrics are not zero", () => {
  const availability = profile.quality_gate.metrics_availability;
  assert.equal(availability.items_total, 4);
  assert.equal(availability.items_with_any, 2);
  assert.equal(availability.item_coverage, 0.5);
  assert.equal(availability.fields.likes.observed_items, 2);
  assert.equal(availability.engagement_ranking_available, false);
});

test("engagement ranking requires a comparable sample", () => {
  const comparable = Array.from({ length: 8 }, (_, index) => ({ metrics: { values: { likes: index + 1 } } }));
  assert.equal(metricsAvailability(comparable).engagement_ranking_available, true);
  const viewsOnly = Array.from({ length: 8 }, (_, index) => ({ metrics: { values: { views: (index + 1) * 100 } } }));
  assert.equal(metricsAvailability(viewsOnly).engagement_ranking_available, false);
});

test("Cuebook bridge has stable rules and route mapping", () => {
  const bridge = profile.cuebook_bridge;
  assert.equal(bridge.taxonomy_version, "profile-bridge-v1");
  const rules = [
    ...bridge.attention_affinities,
    ...bridge.source_preferences,
    ...bridge.reasoning_rules,
    ...bridge.opening_rules,
    ...bridge.data_hooks,
    ...bridge.render_constraints,
  ];
  const ruleIds = rules.map((entry) => entry.rule_id);
  assert.equal(ruleIds.length, new Set(ruleIds).size);
  assert.ok(ruleIds.every(Boolean));
  assert.ok(bridge.attention_affinities.every((entry) => entry.route_event_types.length));
  const hardData = bridge.attention_affinities.find((entry) => entry.attention_type === "hard-data-print");
  assert.ok(hardData.route_event_types.includes("earnings-result"));
});

test("raw records and inconsistent metrics are rejected", () => {
  assert.throws(() => distill({ items: [] }), /schema_version/);
  const broken = structuredClone(corpus);
  broken.items[0].metrics.available = false;
  assert.throws(() => distill(broken), /disagrees/);
});
