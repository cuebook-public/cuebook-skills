import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_content_program.mjs";

function contentItem(itemId = "content_item_x") {
  return {
    item_id: itemId,
    role: "explainer",
    editorial_job: "Explain one observable change and its evidence boundary.",
    platform: "x",
    format: "single_post",
    renderer: "compact_text",
    temporal_mode: "realtime",
    target_context: null,
    source_refs: ["source:one"],
    parent_item_id: null,
    depends_on: [],
    asset_jobs: [],
    interaction_job: "Answer sourced corrections.",
    semantic_reuse_allowed: true,
    wording_reuse_allowed: false,
    status: "planned",
  };
}

function baseArtifact() {
  return {
    schema_version: "content-program.v1",
    program_id: "content_program_0123456789abcdef",
    generated_at: "2026-07-14T03:00:00Z",
    brief: {
      objective: "Explain a market event without overstating the evidence.",
      audience: "market readers",
      language: "en-US",
      content_class: "market_commentary",
      horizon_start: "2026-07-14T03:00:00Z",
      horizon_end: "2026-07-21T03:00:00Z",
      source_refs: ["source:one"],
      requested_platforms: ["x"],
      excluded_actions: ["external publishing", "personalized advice"],
    },
    topology: { mode: "single", anchor_item_id: null, event_expiry: null, rationale: "One job is sufficient." },
    items: [contentItem()],
    release_strategy: {
      mode: "single_channel",
      relative_order: ["content_item_x"],
      cadence_notes: "One item only.",
      trigger_rules: [],
      execution_assumption: "manual_handoff",
    },
    measurement_plan: {
      questions: [
        {
          question_id: "measure_corrections",
          question: "Did readers provide sourced corrections?",
          item_ids: ["content_item_x"],
          metric_class: "content_quality",
        },
      ],
      windows: [{ label: "24h", offset_hours: 24 }],
      notes: "Missing metrics stay missing.",
    },
    quality_report: { scores: {}, hard_failures: [], revisions: [] },
  };
}

function assertValid(artifact) {
  const result = validate(artifact);
  assert.ok(result.valid, JSON.stringify(result.errors));
}

function codes(artifact) {
  return new Set(validate(artifact).errors.map((entry) => entry.code));
}

test("valid single program", () => {
  assertValid(baseArtifact());
});

test("single rejects extra item", () => {
  const artifact = baseArtifact();
  const second = contentItem("content_item_second");
  artifact.items.push(second);
  artifact.release_strategy.relative_order.push("content_item_second");
  assert.ok(codes(artifact).has("SINGLE_COUNT"));
});

test("item sources must stay inside brief boundary", () => {
  const artifact = baseArtifact();
  artifact.items[0].source_refs = ["source:invented"];
  assert.ok(codes(artifact).has("UNKNOWN_SOURCE_REF"));
});

test("renderer uses capability not skill name", () => {
  const artifact = baseArtifact();
  artifact.items[0].renderer = "render-cuebook-market-post";
  assert.ok(codes(artifact).has("RENDERER_VALUE"));
});

test("dependency cycle and order are rejected", () => {
  const artifact = baseArtifact();
  artifact.topology.mode = "serial";
  const second = contentItem("content_item_second");
  artifact.items[0].depends_on = ["content_item_second"];
  second.depends_on = ["content_item_x"];
  artifact.items.push(second);
  Object.assign(artifact.release_strategy, { mode: "staggered", relative_order: ["content_item_x", "content_item_second"] });
  const errorCodes = codes(artifact);
  assert.ok(errorCodes.has("DEPENDENCY_CYCLE"));
  assert.ok(errorCodes.has("RELATIVE_ORDER_DEPENDENCY"));
});

test("valid anchor and derivatives", () => {
  const artifact = baseArtifact();
  artifact.brief.requested_platforms = ["x", "xiaohongshu"];
  artifact.topology = {
    mode: "anchor_and_derivatives",
    anchor_item_id: "content_item_anchor",
    event_expiry: null,
    rationale: "One visual anchor supports a compact derivative.",
  };
  const anchor = contentItem("content_item_anchor");
  Object.assign(anchor, { role: "anchor", platform: "xiaohongshu", format: "carousel_note", renderer: "structured_media" });
  const child = contentItem("content_item_x");
  Object.assign(child, { role: "derivative", parent_item_id: "content_item_anchor", depends_on: ["content_item_anchor"] });
  artifact.items = [anchor, child];
  Object.assign(artifact.release_strategy, { mode: "anchor_then_derivatives", relative_order: ["content_item_anchor", "content_item_x"] });
  artifact.measurement_plan.questions[0].item_ids = ["content_item_anchor", "content_item_x"];
  assertValid(artifact);
});

test("synchronized release rejects dependencies", () => {
  const artifact = baseArtifact();
  artifact.topology.mode = "serial";
  const second = contentItem("content_item_second");
  second.depends_on = ["content_item_x"];
  artifact.items.push(second);
  Object.assign(artifact.release_strategy, { mode: "synchronized", relative_order: ["content_item_x", "content_item_second"] });
  assert.ok(codes(artifact).has("SYNCHRONIZED_DEPENDENCY"));
});

test("reddit requires named community", () => {
  const artifact = baseArtifact();
  artifact.brief.requested_platforms = ["reddit"];
  Object.assign(artifact.items[0], { platform: "reddit", format: "community_post", renderer: "structured_media" });
  assert.ok(codes(artifact).has("COMMUNITY_CONTEXT"));
});

test("valid owned website uses structured media", () => {
  const artifact = baseArtifact();
  artifact.brief.requested_platforms = ["website"];
  Object.assign(artifact.items[0], {
    platform: "website",
    format: "long_form_article",
    renderer: "structured_media",
  });
  assertValid(artifact);
});

test("evergreen series requires evergreen items", () => {
  const artifact = baseArtifact();
  artifact.topology.mode = "evergreen_series";
  const second = contentItem("content_item_second");
  artifact.items.push(second);
  Object.assign(artifact.release_strategy, { mode: "staggered", relative_order: ["content_item_x", "content_item_second"] });
  assert.ok(codes(artifact).has("EVERGREEN_TEMPORAL_MODE"));
});

test("measurement refs must point to items", () => {
  const artifact = baseArtifact();
  artifact.measurement_plan.questions[0].item_ids = ["content_item_missing"];
  assert.ok(codes(artifact).has("MEASUREMENT_ITEM_REF"));
});

test("hype language warns without invalidating", () => {
  const artifact = structuredClone(baseArtifact());
  artifact.brief.objective = "Create a viral post.";
  const result = validate(artifact);
  assert.ok(result.valid);
  assert.ok(new Set(result.warnings.map((entry) => entry.code)).has("PERFORMANCE_PROMISE"));
});
