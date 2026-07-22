import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  canonicalFrameBody,
  MATERIAL_REQUEST_CLASSES,
  SETTLEMENT_CONFIRMATION_FIELDS,
  SETTLEMENT_ELIGIBILITY_FIELDS,
  WEIGHTS,
  validate,
  visibleCharCount,
} from "../scripts/validate_publish_candidate_set.mjs";
import {
  baseSet,
  bindMaterialAnchor,
  confirmSelection,
  evidenceAnchor,
  launchHtml,
} from "./publish_candidate_fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "references", "publish-candidate-set-v1.schema.json");

function codes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

function assertCode(result, code) {
  assert.ok(codes(result).has(code), `${code} missing from ${JSON.stringify(result.errors)}`);
}

function withTemp(run) {
  const directory = mkdtempSync(join(tmpdir(), "cuebook-publish-candidates-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeAssets(item, root) {
  for (const candidateItem of item.candidates) {
    for (const key of ["preview_ref"]) {
      const path = join(root, candidateItem.visual[key]);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "png");
    }
    if ((candidateItem.visual.renderer_mode ?? "cuebook_template") === "cuebook_template") {
      writeFileSync(join(root, candidateItem.visual.html_ref), launchHtml(), "utf8");
    }
  }
}

test("valid ready set", () => {
  const result = validate(baseSet());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.stats.candidate_count, 3);
});

test("finished bitmap candidates do not require original HTML", () => {
  const item = baseSet();
  for (const candidateItem of item.candidates) {
    candidateItem.visual.renderer_mode = "finished_bitmap";
    candidateItem.visual.html_ref = null;
  }
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("valid ready set without settlement", () => {
  const item = baseSet();
  item.lineage.settlement_claim_ref = null;
  item.shared_view.settlement_eligibility = {
    status: "ineligible",
    requirements: Object.fromEntries([...SETTLEMENT_ELIGIBILITY_FIELDS].map((field) => [field, false])),
    missing_requirements: [],
  };
  item.calibration.settlement = "not_applicable";
  for (const candidateItem of item.candidates) {
    candidateItem.settlement = { claim_ref: null, one_line: null, state: "not_applicable" };
  }
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("unselected alternatives require three candidates", () => {
  const item = baseSet();
  item.candidates.pop();
  assertCode(validate(item), "CANDIDATE_COUNT");
});

test("selection freeze may retain the sole recommended Frame", () => {
  const item = baseSet();
  item.generation_policy.candidate_count = 1;
  item.candidates = [item.candidates[0]];
  confirmSelection(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.stats.candidate_count, 1);
});

test("angles are distinct", () => {
  const item = baseSet();
  item.candidates[1].angle = "conviction";
  assertCode(validate(item), "DUPLICATE_ANGLE");
});

test("fingerprint cannot drift", () => {
  const item = baseSet();
  item.candidates[0].meaning_fingerprint = `sha256:${"b".repeat(64)}`;
  assertCode(validate(item), "FINGERPRINT_MISMATCH");
});

test("copy budget is hard", () => {
  const item = baseSet();
  item.candidates[0].copy.body = "x".repeat(1250);
  item.candidates[0].copy.visible_char_count = visibleCharCount(item.candidates[0].copy);
  const result = validate(item);
  assertCode(result, "COPY_BUDGET_EXCEEDED");
  assertCode(result, "TOTAL_COPY_BUDGET");
});

test("a layered Frame may use seven uneven paragraphs", () => {
  const item = baseSet();
  item.generation_policy.candidate_count = 1;
  item.candidates = [item.candidates[0]];
  item.candidates[0].copy.body = [
    "The first observation stands alone.",
    "A shorter bridge follows.",
    "The third paragraph explains the actor under pressure and why behavior may change.",
    "Then one sentence pauses.",
    "The fifth paragraph connects that behavior to the selected asset without repeating the setup.",
    "A catalyst gives the idea its clock.",
    "The final line leaves one quiet condition to revisit.",
  ].join("\n");
  item.candidates[0].copy.visible_char_count = visibleCharCount(item.candidates[0].copy);
  item.candidates[0].frame.body = canonicalFrameBody(item.candidates[0].copy);
  confirmSelection(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("reasoned Frame body may exceed the old 280-character ceiling", () => {
  const item = baseSet();
  item.generation_policy.candidate_count = 1;
  item.candidates = [item.candidates[0]];
  item.candidates[0].copy.body = [
    "The first paragraph preserves the creator observation. ".repeat(3),
    "The second paragraph explains transmission between capital, behavior, and price. ".repeat(3),
    "The third paragraph defines the signal to watch over the horizon. ".repeat(3),
  ].join("\n");
  item.candidates[0].copy.visible_char_count = visibleCharCount(item.candidates[0].copy);
  item.candidates[0].frame.body = canonicalFrameBody(item.candidates[0].copy);
  confirmSelection(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(item.candidates[0].frame.body.length > 280);
});

test("legacy compact copy-budget declarations remain readable", () => {
  const item = baseSet();
  item.generation_policy.copy_budget = {
    headline_max: 32,
    body_max: 220,
    close_max: 56,
    total_max: 300,
    paragraph_max: 4,
    hard_number_max: 3,
  };
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("character count is verified", () => {
  const item = baseSet();
  item.candidates[0].copy.visible_char_count += 1;
  assertCode(validate(item), "CHAR_COUNT");
});

test("Frame projection is exactly title, body, and paired image", () => {
  const item = baseSet();
  assert.deepEqual(Object.keys(item.candidates[0].frame).sort(), ["alt_text", "body", "image_ref", "title"]);
  item.candidates[0].frame.title = "A different title";
  assertCode(validate(item), "FRAME_PROJECTION_MISMATCH");
});

test("Frame cannot expose an additional public section", () => {
  const item = baseSet();
  item.candidates[0].frame.tags = ["hidden-only"];
  assertCode(validate(item), "FRAME_PROJECTION_FIELDS");
});

test("Frame image remains paired with the selected visual", () => {
  const item = baseSet();
  item.candidates[0].frame.image_ref = item.candidates[1].visual.preview_ref;
  assertCode(validate(item), "FRAME_PROJECTION_MISMATCH");
});

test("stock AI phrase is rejected", () => {
  const item = baseSet();
  item.candidates[0].copy.body = "It is worth noting that Robinhood Chain is now live.";
  item.candidates[0].copy.visible_char_count = visibleCharCount(item.candidates[0].copy);
  assertCode(validate(item), "PUBLIC_LANGUAGE");
});

test("settlement is shared", () => {
  const item = baseSet();
  item.candidates[2].settlement.one_line = "HOOD bullish | another horizon";
  assertCode(validate(item), "SETTLEMENT_DRIFT");
});

test("material news anchor is required in every candidate", () => {
  const item = baseSet();
  item.candidates[1].evidence_anchors = [];
  const result = validate(item);
  assertCode(result, "MATERIAL_ANCHOR_MISSING");
  assertCode(result, "EVIDENCE_ANCHOR_DRIFT");
});

test("low quality candidate is not exposed", () => {
  const item = baseSet();
  const quality = item.candidates[1].quality;
  quality.human_voice = 6.0;
  const weighted = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + quality[key] * weight, 0);
  quality.weighted_score = Math.round((weighted + Number.EPSILON) * 1_000) / 1_000;
  quality.verdict = "reject";
  assertCode(validate(item), "FAILED_CANDIDATE_EXPOSED");
});

test("assets can be checked", () => withTemp((root) => {
  const item = baseSet();
  writeAssets(item, root);
  const valid = validate(item, root);
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));
  rmSync(join(root, item.candidates[0].visual.preview_ref));
  assertCode(validate(item, root), "VISUAL_MISSING");
}));

test("assets require launch visual contract", () => withTemp((root) => {
  const item = baseSet();
  writeAssets(item, root);
  writeFileSync(join(root, item.candidates[0].visual.html_ref), "<main>Viewpoint</main>", "utf8");
  assertCode(validate(item, root), "VISUAL_LAUNCH_CONTRACT");
}));

test("ready set cannot preselect", () => {
  const item = baseSet();
  item.selection.selected_candidate_id = item.candidates[0].candidate_id;
  assertCode(validate(item), "PRESELECTED");
});

test("publish confirmation records all locked settlement fields", () => {
  const item = baseSet();
  item.selection.settlement_confirmed = true;
  item.selection.settlement_confirmation_fields = ["subject", "direction"];
  assertCode(validate(item), "SETTLEMENT_CONFIRMATION");
});

test("schema replaces coarse material flags", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const material = schema.properties.shared_view.properties.material_evidence;
  assert.deepEqual(new Set(Object.keys(material.properties)), new Set(["requirements"]));
  assert.deepEqual(new Set(schema.$defs.requestClass.enum), MATERIAL_REQUEST_CLASSES);
  assert.deepEqual(new Set(schema.$defs.settlementConfirmationField.enum), SETTLEMENT_CONFIRMATION_FIELDS);
  assert.equal(SETTLEMENT_CONFIRMATION_FIELDS.has("source"), false);
});

test("old coarse material flags are rejected", () => {
  const item = baseSet();
  item.shared_view.material_evidence = {
    news_required: true,
    metric_required: false,
    required_anchor_ids: ["EVA_HOOD_CHAIN"],
  };
  assertCode(validate(item), "MATERIAL_EVIDENCE_FIELDS");
});

test("all material request classes are supported", () => {
  for (const requestClass of [...MATERIAL_REQUEST_CLASSES].sort()) {
    const item = baseSet();
    bindMaterialAnchor(item, requestClass);
    const result = validate(item);
    assert.equal(result.valid, true, `${requestClass}: ${JSON.stringify(result.errors)}`);
  }
});

test("typed material requirements can coexist", () => {
  const item = baseSet();
  const requirements = [];
  const anchors = [];
  [...MATERIAL_REQUEST_CLASSES].sort().forEach((requestClass, index) => {
    const anchor = evidenceAnchor(requestClass);
    anchor.anchor_id = `EVA_TYPED_${index + 1}`;
    anchors.push(anchor);
    requirements.push({
      requirement_id: `D${index + 1}`,
      request_class: requestClass,
      required_anchor_ids: [anchor.anchor_id],
    });
  });
  item.shared_view.material_evidence.requirements = requirements;
  for (const candidateItem of item.candidates) candidateItem.evidence_anchors = structuredClone(anchors);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("metric anchor accepts explicit not meaningful", () => {
  const item = baseSet();
  const anchor = evidenceAnchor("valuation_metric");
  Object.assign(anchor.metric, {
    value_state: "N/M",
    value: null,
    not_meaningful_reason: "Attributable earnings are non-positive.",
  });
  bindMaterialAnchor(item, "valuation_metric", anchor);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("metric anchor requires basis and numeric or N/M value", () => {
  const item = baseSet();
  const anchor = evidenceAnchor("valuation_metric");
  delete anchor.metric.basis;
  bindMaterialAnchor(item, "valuation_metric", anchor);
  assertCode(validate(item), "EVIDENCE_METRIC_FIELDS");
});

test("price anchor requires observation basis", () => {
  const item = baseSet();
  const anchor = evidenceAnchor("price_level");
  delete anchor.price_observation.observation_basis;
  bindMaterialAnchor(item, "price_level", anchor);
  const result = validate(item);
  assertCode(result, "EVIDENCE_PRICE_FIELDS");
  assertCode(result, "EVIDENCE_PRICE_BASIS");
});

test("material news requires published_at", () => {
  const item = baseSet();
  const anchor = evidenceAnchor("news_anchor");
  anchor.published_at = null;
  bindMaterialAnchor(item, "news_anchor", anchor);
  assertCode(validate(item), "MATERIAL_NEWS_PUBLISHED_AT");
});

test("required anchor type cannot drift", () => {
  const item = baseSet();
  item.candidates[1].evidence_anchors[0].request_class = "official_event";
  const result = validate(item);
  assertCode(result, "MATERIAL_ANCHOR_TYPE");
  assertCode(result, "EVIDENCE_ANCHOR_DRIFT");
});

test("selected content can leave settlement unconfirmed", () => {
  const item = baseSet();
  confirmSelection(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("ready set cannot freeze settlement", () => {
  const item = baseSet();
  for (const candidateItem of item.candidates) candidateItem.settlement.state = "frozen";
  const result = validate(item);
  assertCode(result, "SETTLEMENT_PREMATURE_FREEZE");
  assertCode(result, "SETTLEMENT_STATE");
});

test("explicit selection and settlement confirmation can freeze", () => {
  const item = baseSet();
  confirmSelection(item, { settlement: true });
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("confirmation uses eligibility field names", () => {
  const item = baseSet();
  confirmSelection(item, { settlement: true });
  const fields = item.selection.settlement_confirmation_fields;
  fields.splice(fields.indexOf("authoritative_source"), 1);
  fields.push("source");
  const result = validate(item);
  assertCode(result, "SETTLEMENT_CONFIRMATION_FIELDS");
  assertCode(result, "SETTLEMENT_CONFIRMATION");
});

test("bound claim requires complete eligibility", () => {
  const item = baseSet();
  item.shared_view.settlement_eligibility.requirements.operator = false;
  const result = validate(item);
  assertCode(result, "SETTLEMENT_ELIGIBILITY_MISMATCH");
  assertCode(result, "SETTLEMENT_ELIGIBILITY");
});

export { writeAssets };
