import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_content_recipe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(path.join(root, "references", "skill-catalog-v1.json"), "utf8"));
const skillVersions = Object.fromEntries(catalog.skills.map((entry) => [entry.skill_id, entry.version]));

const RESOLVED = [
  "normalize-cuebook-creator-feed",
  "compose-cuebook-content-recipe",
  "select-cuebook-content-opportunities",
  "validate-cuebook-projection",
  "route-cuebook-narrative",
  "build-market-research-pack",
  "compile-cuebook-market-view-semantics",
  "plan-cuebook-creator-expression",
  "plan-market-content-program",
  "render-cuebook-market-post",
  "render-cuebook-market-media",
  "prepare-market-content-release",
  "orchestrate-cuebook-creator-workflow",
];

function baseRecipe() {
  return {
    schema_version: "content-recipe-v1",
    recipe_id: "RECIPE_1234abcd",
    revision: 1,
    state: "valid",
    catalog_version: "1.27.0",
    created_at: "2026-07-14T12:11:00+00:00",
    updated_at: "2026-07-14T12:12:00+00:00",
    as_of: "2026-07-14T12:00:00+00:00",
    decision_cutoff_at: "2026-07-14T12:00:00+00:00",
    feed_ref: "CF_1234abcd",
    opportunity_set_ref: "OS_1234abcd",
    selection_mode: "opportunity_first",
    preset_ref: "preset-cross-platform-desk",
    anchor: {
      opportunity_ref: "OPP_q2_revision",
      primary_ref: "NEWS_q2",
      title: "Q2 revision watch",
      entity_refs: ["ENT_example"],
      lifecycle: "pre_event",
      horizon: "30 days",
    },
    ingredients: {
      news_refs: ["NEWS_q2"],
      calendar_refs: ["CAL_call"],
      narrative_refs: ["NAR_revision"],
      trade_idea_refs: ["IDEA_watch"],
      trade_history_refs: [],
      history_use: "none",
    },
    preparation: {
      editorial_job: "pre_event_watch",
      analysis_lenses: ["expectation-gap", "actor-forced", "next-catalyst"],
      argument_shape: "scenario_tree",
      research_mode: "fresh_required",
      market_data_mode: "refresh_if_available",
      source_policy: "primary_first",
      include_countercase: true,
      include_invalidation: false,
    },
    flavor: {
      profile_ref: "PROFILE_creator_v1",
      voice_traits: ["conversational", "concrete", "trade-aware"],
      stance: "watch",
      certainty: "conditional",
      density: "standard",
      language: "zh-CN",
      avoid_patterns: ["living-author catchphrases", "personalized orders"],
      originality_policy: "traits_only",
      authorship_mode: "cuebook_assisted",
      assistance_attribution: "none",
    },
    plating: {
      bundle_strategy: "master_and_derivatives",
      deliverable_mode: "release_candidates",
      outputs: [
        { output_id: "OUT_x_thread", channel: "x", format: "thread", count: 1, length: "standard", media_format_ref: "FORMAT_x_thread_v1", target_context: null },
        { output_id: "OUT_xhs_carousel", channel: "xiaohongshu", format: "carousel", count: 1, length: "standard", media_format_ref: "FORMAT_xhs_carousel_v1", target_context: null },
      ],
    },
    execution: {
      mode: "single",
      skill_selection_policy: "manual_plus_required",
      selected_skill_ids: ["plan-market-content-program", "prepare-market-content-release"],
      resolved_skill_ids: [...RESOLVED],
      version_pins: RESOLVED.map((skillId) => ({ skill_id: skillId, version: skillVersions[skillId] })),
      auto_fill_missing_research: true,
      stop_on_conditional: false,
      require_human_approval: true,
      dry_run: false,
    },
    extensions: [
      { extension_id: "EXT_market_data_default", extension_point: "market_data", provider_ref: "cuebook-market-snapshot", required: false, config_ref: "CFG_market_default" },
    ],
    validation_report: {
      decision: "ready",
      hard_failures: [],
      warnings: [],
      checks: ["ingredient refs", "skill resolution", "channel compatibility"],
      counts: { news: 1, calendar_events: 1, narratives: 1, trade_ideas: 1, trade_history: 0, outputs: 2, selected_skills: 2, resolved_skills: 13, extensions: 1 },
    },
  };
}

function feedFixture() {
  const record = (id, extra = {}) => ({
    id,
    record_status: "active",
    available_at: "2026-07-14T10:02:00+00:00",
    entity_refs: ["ENT_example"],
    ...extra,
  });
  return {
    schema_version: "creator-feed-v1",
    feed_id: "CF_1234abcd",
    news: [record("NEWS_q2", { cluster_id: "NC_q2" })],
    calendar_events: [record("CAL_call")],
    narratives: [record("NAR_revision", { available_at: "2026-07-14T10:10:00+00:00" })],
    trade_ideas: [record("IDEA_watch", { available_at: "2026-07-14T10:12:00+00:00" })],
    trade_history: [record("TRADE_old", {
      available_at: "2026-05-20T14:05:00+00:00",
      public_reuse_permission: "aggregate_only",
      trade_type: "executed",
      execution_verification: "broker_reconciled",
    })],
  };
}

function opportunityFixture() {
  return {
    schema_version: "content-opportunity-set-v1",
    opportunity_set_id: "OS_1234abcd",
    candidates: [{ opportunity_id: "OPP_q2_revision", decision: "selected" }],
  };
}

const codes = (result, key = "errors") => new Set(result[key].map((entry) => entry.code));
const expectCode = (item, code, feed = null, opportunities = null, suppliedCatalog = null) => {
  assert.ok(codes(validate(item, feed, opportunities, suppliedCatalog)).has(code));
};

test("base recipe is valid without dependencies", () => {
  const result = validate(baseRecipe());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("base recipe is valid with feed, opportunities, and catalog", () => {
  const result = validate(baseRecipe(), feedFixture(), opportunityFixture(), catalog);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("base recipe avoids thesis and settlement layers", () => {
  const excluded = new Set(["compose-cuebook-trading-thesis", "classify-cuebook-trading-logic", "compile-cuebook-settlement-claim"]);
  assert.equal(baseRecipe().execution.resolved_skill_ids.some((id) => excluded.has(id)), false);
});

const simpleMutations = [
  ["unknown root", (item) => { item.debug = true; }, "UNKNOWN_ROOT_FIELD"],
  ["opportunity anchor required", (item) => { item.anchor.opportunity_ref = null; }, "OPPORTUNITY_ANCHOR_REQUIRED"],
  ["preset required", (item) => { item.selection_mode = "preset_auto"; item.preset_ref = null; }, "PRESET_REQUIRED"],
  ["history use required", (item) => { item.ingredients.trade_history_refs = ["TRADE_old"]; item.validation_report.counts.trade_history = 1; }, "HISTORY_USE_REQUIRED"],
  ["postmortem history required", (item) => { item.execution.mode = "postmortem"; }, "POSTMORTEM_HISTORY_REQUIRED"],
  ["duplicate output id", (item) => { item.plating.outputs[1].output_id = "OUT_x_thread"; }, "DUPLICATE_OUTPUT_ID"],
  ["channel format", (item) => { item.plating.outputs[0].format = "carousel"; }, "CHANNEL_FORMAT"],
  ["assistance attribution", (item) => { item.flavor.assistance_attribution = "natural"; }, "ASSISTANCE_ATTRIBUTION"],
  ["counts", (item) => { item.validation_report.counts.news = 9; }, "COUNTS"],
  ["unresolved version pin", (item) => { item.execution.version_pins[0].skill_id = "unknown-skill"; }, "PIN_UNRESOLVED_SKILL"],
  ["missing version pin", (item) => { item.execution.version_pins.shift(); }, "MISSING_VERSION_PIN"],
  ["duplicate version pin", (item) => { item.execution.version_pins.push(structuredClone(item.execution.version_pins[0])); }, "DUPLICATE_VERSION_PIN"],
];

for (const [name, mutate, expected] of simpleMutations) {
  test(name, () => {
    const item = baseRecipe();
    mutate(item);
    expectCode(item, expected);
  });
}

test("ingredient-first recipe is valid", () => {
  const item = baseRecipe();
  item.selection_mode = "ingredient_first";
  item.opportunity_set_ref = null;
  item.anchor.opportunity_ref = null;
  const result = validate(item, feedFixture());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("ingredient-first primary must be selected", () => {
  const item = baseRecipe();
  item.selection_mode = "ingredient_first";
  item.opportunity_set_ref = null;
  item.anchor.opportunity_ref = null;
  item.anchor.primary_ref = "NEWS_missing";
  expectCode(item, "PRIMARY_INGREDIENT");
});

test("conditional preset-auto may have no ingredients", () => {
  const item = baseRecipe();
  item.selection_mode = "preset_auto";
  item.anchor.opportunity_ref = null;
  item.opportunity_set_ref = null;
  for (const field of ["news_refs", "calendar_refs", "narrative_refs", "trade_idea_refs", "trade_history_refs"]) item.ingredients[field] = [];
  item.state = "conditional";
  item.validation_report.decision = "conditional";
  Object.assign(item.validation_report.counts, { news: 0, calendar_events: 0, narratives: 0, trade_ideas: 0 });
  const result = validate(item, null, null, catalog);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("valid postmortem recipe", () => {
  const item = baseRecipe();
  item.ingredients.trade_history_refs = ["TRADE_old"];
  item.ingredients.history_use = "postmortem";
  item.execution.mode = "postmortem";
  item.execution.resolved_skill_ids.push("reconcile-market-content-history");
  item.execution.selected_skill_ids.push("reconcile-market-content-history");
  item.execution.version_pins.push({ skill_id: "reconcile-market-content-history", version: skillVersions["reconcile-market-content-history"] });
  Object.assign(item.validation_report.counts, { trade_history: 1, selected_skills: 3, resolved_skills: 14 });
  const result = validate(item, feedFixture());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("viewpoint output requires its renderer", () => {
  const item = baseRecipe();
  item.plating.outputs = [{ output_id: "OUT_viewpoint", channel: "generic", format: "viewpoint_card", count: 1, length: "standard", media_format_ref: null, target_context: null }];
  item.validation_report.counts.outputs = 1;
  expectCode(item, "REQUIRED_SKILL_MISSING");
});

test("Seeking Alpha output is internal-only", () => {
  const item = baseRecipe();
  item.plating.outputs = [{ output_id: "OUT_sa", channel: "seeking_alpha_internal", format: "article_outline", count: 1, length: "long", media_format_ref: null, target_context: null }];
  item.validation_report.counts.outputs = 1;
  expectCode(item, "SEEKING_ALPHA_INTERNAL_ONLY");
});

for (const [name, skillId, extraCode] of [
  ["market media renderer is required", "render-cuebook-market-media", null],
  ["selected program planner must resolve", "plan-market-content-program", "SELECTED_SKILL_UNRESOLVED"],
]) {
  test(name, () => {
    const item = baseRecipe();
    item.execution.resolved_skill_ids = item.execution.resolved_skill_ids.filter((id) => id !== skillId);
    item.execution.version_pins = item.execution.version_pins.filter((pin) => pin.skill_id !== skillId);
    item.validation_report.counts.resolved_skills = 12;
    const result = validate(item);
    assert.ok(codes(result).has("REQUIRED_SKILL_MISSING"));
    if (extraCode) assert.ok(codes(result).has(extraCode));
  });
}

const dependencyCases = [
  ["feed ref mismatch", (item, feed) => { item.feed_ref = "CF_deadbeef"; }, "FEED_REF_MISMATCH"],
  ["unknown ingredient", (item) => { item.ingredients.news_refs = ["NEWS_missing"]; }, "UNKNOWN_INGREDIENT"],
  ["post-cutoff ingredient", (item, feed) => { feed.news[0].available_at = "2026-07-14T12:01:00+00:00"; }, "POST_CUTOFF_INGREDIENT"],
];

for (const [name, mutate, expected] of dependencyCases) {
  test(name, () => {
    const item = baseRecipe();
    const feed = feedFixture();
    mutate(item, feed);
    expectCode(item, expected, feed);
  });
}

test("unknown selected opportunity", () => {
  const item = baseRecipe();
  item.anchor.opportunity_ref = "OPP_missing";
  expectCode(item, "UNKNOWN_SELECTED_OPPORTUNITY", null, opportunityFixture());
});

const catalogCases = [
  ["catalog version mismatch", (item) => { item.catalog_version = "9.9.9"; }, "CATALOG_VERSION_MISMATCH"],
  ["automatic skill cannot be selected", (item) => { item.execution.selected_skill_ids.push("validate-cuebook-projection"); item.validation_report.counts.selected_skills = 3; }, "SKILL_NOT_USER_SELECTABLE"],
  ["preset ingredient minimum", (item) => { item.ingredients.narrative_refs = []; item.validation_report.counts.narratives = 0; }, "PRESET_INGREDIENT_MIN"],
  ["skill mode unsupported", (item) => {
    item.execution.selected_skill_ids.push("distill-market-media-format");
    item.execution.resolved_skill_ids.push("distill-market-media-format");
    item.execution.version_pins.push({ skill_id: "distill-market-media-format", version: skillVersions["distill-market-media-format"] });
    Object.assign(item.validation_report.counts, { selected_skills: 3, resolved_skills: 14 });
  }, "SKILL_MODE_UNSUPPORTED"],
  ["resolved dependency missing", (item) => {
    item.execution.resolved_skill_ids = item.execution.resolved_skill_ids.filter((id) => id !== "compile-cuebook-market-view-semantics");
    item.execution.version_pins = item.execution.version_pins.filter((pin) => pin.skill_id !== "compile-cuebook-market-view-semantics");
    item.validation_report.counts.resolved_skills = 12;
  }, "RESOLVED_DEPENDENCY_MISSING"],
  ["skill version mismatch", (item) => { item.execution.version_pins[0].version = "9.9.9"; }, "SKILL_VERSION_MISMATCH"],
];

for (const [name, mutate, expected] of catalogCases) {
  test(name, () => {
    const item = baseRecipe();
    mutate(item);
    expectCode(item, expected, null, null, catalog);
  });
}

test("viewpoint-card preset resolves", () => {
  const item = baseRecipe();
  item.preset_ref = "preset-viewpoint-card";
  item.selection_mode = "ingredient_first";
  item.opportunity_set_ref = null;
  item.anchor.opportunity_ref = null;
  item.plating.bundle_strategy = "independent";
  item.plating.outputs = [{ output_id: "OUT_viewpoint", channel: "generic", format: "viewpoint_card", count: 1, length: "standard", media_format_ref: null, target_context: null }];
  for (const skillId of ["assemble-cuebook-viewpoint-data", "direct-cuebook-viewpoint-visual", "render-cuebook-viewpoint-visual", "assemble-cuebook-viewpoint-card"]) {
    item.execution.resolved_skill_ids.push(skillId);
    item.execution.version_pins.push({ skill_id: skillId, version: skillVersions[skillId] });
  }
  item.execution.selected_skill_ids.push("render-cuebook-viewpoint-visual");
  Object.assign(item.validation_report.counts, { outputs: 1, selected_skills: 3, resolved_skills: 17 });
  const result = validate(item, feedFixture(), null, catalog);
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("publish-candidates preset resolves with transitive dependencies", () => {
  const item = baseRecipe();
  item.preset_ref = "preset-publish-candidates";
  item.selection_mode = "ingredient_first";
  item.opportunity_set_ref = null;
  item.anchor.opportunity_ref = null;
  item.plating.bundle_strategy = "independent";
  item.plating.outputs = [{ output_id: "OUT_candidates", channel: "generic", format: "publish_candidate_set", count: 3, length: "short", media_format_ref: null, target_context: null }];
  const catalogSkills = Object.fromEntries(catalog.skills.map((entry) => [entry.skill_id, entry]));
  const preset = catalog.presets.find((entry) => entry.preset_id === "preset-publish-candidates");
  const required = new Set(item.execution.resolved_skill_ids);
  const pending = [...preset.required_skill_ids];
  while (pending.length) {
    const skillId = pending.pop();
    if (required.has(skillId)) continue;
    required.add(skillId);
    pending.push(...catalogSkills[skillId].requires_all);
  }
  item.execution.resolved_skill_ids = [...new Set([...item.execution.resolved_skill_ids, ...[...required].sort()])];
  item.execution.version_pins = item.execution.resolved_skill_ids.map((skillId) => ({ skill_id: skillId, version: skillVersions[skillId] }));
  Object.assign(item.validation_report.counts, { outputs: 1, resolved_skills: item.execution.resolved_skill_ids.length });
  const result = validate(item, feedFixture(), null, catalog);
  assert.equal(result.valid, true, JSON.stringify(result));
});

function customCatalog() {
  const item = structuredClone(catalog);
  const customSkill = structuredClone(item.skills.find((entry) => entry.skill_id === "render-cuebook-market-media"));
  Object.assign(customSkill, {
    skill_id: "render-custom-email",
    display_name: "Render Custom Email",
    description: "Render a registered custom email package.",
    visibility: "selectable",
    user_selectable: true,
    default_enabled: false,
    capabilities: ["render-custom-email"],
    output_contract: "EmailPackageV1",
    requires_all: ["build-market-research-pack"],
    supported_channels: ["custom:email"],
  });
  Object.assign(customSkill.ui, {
    order: Math.max(...item.skills.map((entry) => entry.ui.order)) + 1,
    control_type: "toggle",
    summary: "Render custom email.",
  });
  item.skills.push(customSkill);
  return item;
}

function addCustomEmail(item) {
  item.plating.outputs.push({ output_id: "OUT_email", channel: "custom:email", format: "newsletter", count: 1, length: "standard", media_format_ref: null, target_context: "subscribers" });
  item.execution.selected_skill_ids.push("render-custom-email");
  item.execution.resolved_skill_ids.push("render-custom-email");
  item.execution.version_pins.push({ skill_id: "render-custom-email", version: "1.0.0" });
  Object.assign(item.validation_report.counts, { outputs: 3, selected_skills: 3, resolved_skills: 14 });
}

test("catalog-registered custom renderer is valid", () => {
  const item = baseRecipe();
  addCustomEmail(item);
  const result = validate(item, null, null, customCatalog());
  assert.equal(result.valid, true, JSON.stringify(result));
});

test("catalog-registered custom renderer must resolve", () => {
  const item = baseRecipe();
  addCustomEmail(item);
  item.execution.selected_skill_ids.pop();
  item.execution.resolved_skill_ids.pop();
  item.execution.version_pins.pop();
  Object.assign(item.validation_report.counts, { selected_skills: 2, resolved_skills: 13 });
  expectCode(item, "CUSTOM_RENDERER_SKILL_MISSING", null, null, customCatalog());
});

test("custom channel requires a renderer extension without catalog", () => {
  const item = baseRecipe();
  item.plating.outputs.push({ output_id: "OUT_custom", channel: "custom:newsletter", format: "digest", count: 1, length: "standard", media_format_ref: null, target_context: null });
  item.validation_report.counts.outputs = 3;
  expectCode(item, "CUSTOM_RENDERER_REQUIRED");
  item.extensions.push({ extension_id: "EXT_custom_renderer", extension_point: "custom_renderer", provider_ref: "renderer-newsletter-v1", required: false, config_ref: null });
  item.validation_report.counts.extensions = 2;
  expectCode(item, "CUSTOM_RENDERER_NOT_REQUIRED");
  item.extensions.at(-1).required = true;
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result));
});
