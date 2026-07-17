import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_skill_catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "references", "skill-catalog-v1.json");
const baseCatalog = () => JSON.parse(readFileSync(catalogPath, "utf8"));
const codes = (result, key = "errors") => new Set(result[key].map((entry) => entry.code));
const skill = (catalog, skillId) => catalog.skills.find((item) => item.skill_id === skillId);

function ancestors(catalog, skillId) {
  const found = new Set();
  const pending = [...skill(catalog, skillId).requires_all];
  while (pending.length) {
    const dependency = pending.pop();
    if (found.has(dependency)) continue;
    found.add(dependency);
    pending.push(...skill(catalog, dependency).requires_all);
  }
  return found;
}

test("base catalog structure", () => {
  const catalog = baseCatalog();
  const result = validate(catalog, false);
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(catalog.catalog_version, "1.27.0");
  const query = skill(catalog, "query-cuebook");
  const create = skill(catalog, "create-cuebook-content");
  assert.equal(query.output_contract, "CuebookQueryBundleV1");
  assert.deepEqual(query.requires_all, []);
  assert.equal(query.ui.surface, "query");
  assert.equal(create.output_contract, "CuebookCreationBundleV1");
  assert.deepEqual(create.requires_all, ["orchestrate-cuebook-creator-workflow"]);
  assert.ok(create.input_contracts.includes("CuebookQueryBundleV1"));
});

test("viewpoint bridge and deferred motion metadata", () => {
  const catalog = baseCatalog();
  const bridge = [
    ["compile-cuebook-market-view-semantics", "MarketViewSemanticsV1"],
    ["plan-cuebook-creator-expression", "CreatorExpressionPlanV1"],
    ["assemble-cuebook-viewpoint-data", "ViewpointDataBundleV1"],
    ["direct-cuebook-viewpoint-visual", "VisualDirectionSetV1"],
    ["render-cuebook-viewpoint-visual", "ViewpointVisualV1"],
  ];
  assert.ok(bridge.every(([id, contract]) => skill(catalog, id).output_contract === contract));
  assert.ok(bridge.every(([id]) => skill(catalog, id).execution === "installed"));
  assert.ok(bridge.slice(0, 4).every(([id]) => skill(catalog, id).visibility === "automatic" && skill(catalog, id).ui.control_type === "hidden"));
  assert.equal(skill(catalog, "assemble-cuebook-viewpoint-data").version, "1.5.0");
  assert.ok(skill(catalog, "assemble-cuebook-viewpoint-data").description.includes("route hash"));
  assert.equal(skill(catalog, "direct-cuebook-viewpoint-visual").version, "2.5.0");
  assert.ok(skill(catalog, "direct-cuebook-viewpoint-visual").maintenance.schema_refs.includes("direct-cuebook-viewpoint-visual/references/viewpoint-expression-registry-v1.json"));
  assert.equal(skill(catalog, "render-cuebook-viewpoint-visual").user_selectable, true);
  for (const id of ["direct-cuebook-viewpoint-motion", "render-cuebook-viewpoint-motion"]) {
    const deferred = skill(catalog, id);
    assert.equal(deferred.status, "disabled");
    assert.equal(deferred.execution, "deferred");
    assert.equal(deferred.visibility, "internal");
    assert.equal(deferred.user_selectable, false);
    assert.equal(deferred.ui.control_type, "hidden");
  }
  const semantics = skill(catalog, "compile-cuebook-market-view-semantics");
  assert.deepEqual(semantics.requires_all, []);
  assert.ok(["ResearchPackV1", "CreatorViewIntentV1", "CorpusV1"].every((item) => semantics.input_contracts.includes(item)));
  const chain = ancestors(catalog, "render-cuebook-viewpoint-visual");
  assert.ok(["compile-cuebook-market-view-semantics", "plan-cuebook-creator-expression", "assemble-cuebook-viewpoint-data", "direct-cuebook-viewpoint-visual"].every((item) => chain.has(item)));
  assert.ok(catalog.presets.every((preset) => ![...preset.required_skill_ids, ...preset.optional_skill_ids].includes("render-cuebook-viewpoint-motion")));
});

test("legacy visuals stay internal and thesis chart stays automatic", () => {
  const catalog = baseCatalog();
  const legacy = ["render-cuebook-logic-card", "render-cuebook-market-figure", "render-cuebook-market-signal"];
  const presetSkills = new Set(catalog.presets.flatMap((preset) => [...preset.required_skill_ids, ...preset.optional_skill_ids]));
  assert.ok(legacy.every((id) => skill(catalog, id).visibility === "internal" && skill(catalog, id).user_selectable === false && !presetSkills.has(id)));
  const thesis = skill(catalog, "render-cuebook-thesis-chart");
  assert.equal(thesis.visibility, "automatic");
  assert.equal(thesis.user_selectable, false);
  assert.equal(thesis.replaced_by, null);
  assert.deepEqual(thesis.requires_all, ["assemble-cuebook-viewpoint-data"]);
  assert.ok(["ViewpointDataBundleV1", "MarketSeriesBatchV1"].every((item) => thesis.input_contracts.includes(item)));
  const preset = catalog.presets.find((item) => item.preset_id === "preset-publish-candidates");
  assert.ok(preset.optional_skill_ids.includes("render-cuebook-thesis-chart"));
  assert.ok(!preset.required_skill_ids.includes("render-cuebook-thesis-chart"));
});

const mutations = [
  ["unknown root", (item) => { item.debug = true; }, "UNKNOWN_ROOT_FIELD"],
  ["duplicate category", (item) => { item.categories[1].category_id = item.categories[0].category_id; }, "DUPLICATE_CATEGORY"],
  ["duplicate category order", (item) => { item.categories[1].order = item.categories[0].order; }, "DUPLICATE_CATEGORY_ORDER"],
  ["duplicate skill", (item) => { item.skills.push(structuredClone(item.skills[0])); }, "DUPLICATE_SKILL"],
  ["unknown category", (item) => { item.skills[0].category_id = "category-missing"; }, "UNKNOWN_CATEGORY"],
  ["selectable flag", (item) => { skill(item, "plan-market-content-program").user_selectable = false; }, "SELECTABLE_FLAG"],
  ["automatic visible control", (item) => { skill(item, "compose-cuebook-content-recipe").ui.control_type = "toggle"; }, "AUTOMATIC_VISIBLE_CONTROL"],
  ["internal surface", (item) => { skill(item, "validate-cuebook-projection").ui.surface = "creator"; }, "INTERNAL_SURFACE"],
  ["stability mismatch", (item) => { skill(item, "compose-cuebook-content-recipe").maintenance.stability = "stable"; }, "STABILITY_MISMATCH"],
  ["maintenance artifact required", (item) => { skill(item, "compose-cuebook-content-recipe").maintenance.schema_refs = []; }, "MAINTENANCE_ARTIFACT_REQUIRED"],
  ["unknown dependency", (item) => { skill(item, "compose-cuebook-content-recipe").requires_all = ["unknown-skill"]; }, "UNKNOWN_DEPENDENCY"],
  ["dependency contract", (item) => { skill(item, "render-cuebook-market-post").input_contracts = skill(item, "render-cuebook-market-post").input_contracts.filter((entry) => entry !== "CreatorExpressionPlanV1"); }, "DEPENDENCY_CONTRACT_MISSING"],
  ["duplicate dependency", (item) => { skill(item, "render-cuebook-market-post").requires_all.push("plan-cuebook-creator-expression"); }, "DUPLICATE_DEPENDENCY"],
  ["dependency cycle", (item) => { skill(item, "normalize-cuebook-creator-feed").requires_all = ["orchestrate-cuebook-creator-workflow"]; skill(item, "orchestrate-cuebook-creator-workflow").requires_all = ["normalize-cuebook-creator-feed"]; }, "DEPENDENCY_CYCLE"],
  ["ingredient range", (item) => { item.presets[0].ingredient_limits.news_refs = { min: 5, max: 1 }; }, "INGREDIENT_RANGE"],
  ["unknown preset skill", (item) => { item.presets[0].required_skill_ids.push("unknown-skill"); }, "UNKNOWN_PRESET_SKILL"],
  ["preset skill overlap", (item) => { item.presets[0].optional_skill_ids.push("build-market-research-pack"); }, "PRESET_SKILL_OVERLAP"],
  ["preset channel format", (item) => { item.presets[0].default_outputs[0].format = "carousel"; }, "PRESET_CHANNEL_FORMAT"],
  ["preset post renderer", (item) => { item.presets[0].required_skill_ids = item.presets[0].required_skill_ids.filter((id) => id !== "render-cuebook-market-post"); }, "PRESET_POST_RENDERER"],
  ["owned web requires seo", (item) => { const preset = item.presets.find((entry) => entry.preset_id === "preset-earnings-preview"); preset.required_skill_ids = preset.required_skill_ids.filter((id) => id !== "optimize-cuebook-market-seo"); }, "PRESET_OWNED_WEB_SEO"],
  ["program required", (item) => { item.presets[0].required_skill_ids = item.presets[0].required_skill_ids.filter((id) => id !== "plan-market-content-program"); }, "PRESET_PROGRAM_REQUIRED"],
  ["thesis protocol required", (item) => { const preset = item.presets.find((entry) => entry.preset_id === "preset-settleable-thesis"); preset.default_analysis_lenses.push("resolution-contract"); preset.optional_skill_ids = preset.optional_skill_ids.filter((id) => id !== "compose-cuebook-trading-thesis"); }, "PRESET_THESIS_PROTOCOL_REQUIRED"],
  ["settlement compiler required", (item) => { const preset = item.presets.find((entry) => entry.preset_id === "preset-settleable-thesis"); preset.required_skill_ids = preset.required_skill_ids.filter((id) => id !== "compile-cuebook-settlement-claim"); }, "PRESET_SETTLEMENT_COMPILER_REQUIRED"],
  ["viewpoint assembler", (item) => { const preset = item.presets.find((entry) => entry.preset_id === "preset-viewpoint-card"); preset.required_skill_ids = preset.required_skill_ids.filter((id) => id !== "assemble-cuebook-viewpoint-card"); }, "PRESET_VIEWPOINT_ASSEMBLER"],
  ["viewpoint visual", (item) => { const preset = item.presets.find((entry) => entry.preset_id === "preset-viewpoint-card"); preset.required_skill_ids = preset.required_skill_ids.filter((id) => id !== "render-cuebook-viewpoint-visual"); }, "PRESET_VIEWPOINT_VISUAL"],
  ["preset mode", (item) => { skill(item, "compile-cuebook-settlement-claim").supported_modes = ["batch"]; }, "PRESET_MODE_UNSUPPORTED"],
  ["duplicate extension point", (item) => { item.extension_points.push(structuredClone(item.extension_points[0])); }, "DUPLICATE_EXTENSION_POINT"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => {
    const item = baseCatalog();
    mutate(item);
    assert.ok(codes(validate(item, false)).has(expected));
  });
}

test("invalid skill path is checked", () => {
  const item = baseCatalog();
  skill(item, "compose-cuebook-content-recipe").maintenance.skill_path = "/tmp/missing-recipe-skill";
  assert.ok(codes(validate(item)).has("SKILL_PATH_INVALID"));
});

test("registered custom renderer is accepted and required by its preset", () => {
  const item = baseCatalog();
  const custom = structuredClone(skill(item, "render-cuebook-market-media"));
  Object.assign(custom, { skill_id: "render-custom-email", display_name: "Render Custom Email", description: "Render a custom email package.", visibility: "selectable", user_selectable: true, default_enabled: false, capabilities: ["render-custom-email"], output_contract: "EmailPackageV1", requires_all: ["build-market-research-pack"], supported_channels: ["custom:email"] });
  Object.assign(custom.ui, { order: Math.max(...item.skills.map((entry) => entry.ui.order)) + 1, control_type: "toggle", summary: "Render custom email." });
  item.skills.push(custom);
  const preset = structuredClone(item.presets[0]);
  Object.assign(preset, { preset_id: "preset-custom-email", name: "Custom email", description: "Render a registered custom email.", default_outputs: [{ channel: "custom:email", format: "newsletter", count: 1, length: "standard" }], required_skill_ids: ["build-market-research-pack", "render-custom-email", "prepare-market-content-release"], optional_skill_ids: [] });
  item.presets.push(preset);
  assert.equal(validate(item, false).valid, true);
  item.presets.at(-1).required_skill_ids = item.presets.at(-1).required_skill_ids.filter((id) => id !== "render-custom-email");
  assert.ok(codes(validate(item, false)).has("PRESET_CUSTOM_RENDERER"));
});
