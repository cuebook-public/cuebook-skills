#!/usr/bin/env node
// Validate and run Cuebook's transparent Creator Lens preview path.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";
import { validate as validateFramePreview } from "./validate_frame_preview.mjs";
import { validateMeaningLock } from "./validate_meaning_lock.mjs";
import {
  assertNoMutableLensPriceText,
  auditLensSvg,
  compileLensExpression,
  generateLensAltText,
  lensDesignProfile,
  lensBindingIds,
  renderLensSvg,
} from "./render_lens_expression.mjs";

const require = createRequire(import.meta.url);
const rasterizerScript = fileURLToPath(new URL("../references/modules/render-cuebook-thesis-chart/scripts/rasterize_thesis_chart.cjs", import.meta.url));
const { rasterizeSvg } = require(rasterizerScript);
const JOB_SCHEMA = JSON.parse(readFileSync(new URL("../references/frame-lens-preview-job.schema.json", import.meta.url), "utf8"));
const PUBLIC_FRAME_SCHEMA = JSON.parse(readFileSync(new URL("../references/frame.schema.json", import.meta.url), "utf8"));
const QUALITY_CHECKS = ["creator_ownership", "source_binding", "copy_fit", "image_render"];
const CANONICAL_FORMULA = "100 + Σ(weight × component return)";
const CHECKABLE_CRITERION = /(?:\d+\s*(?:D|\u65e5|\u5929|\u5468|\u6839|sessions?|bars?)|[<>≤≥]|\u65b0\u9ad8|\u65b0\u4f4e|\u8f6c\u6b63|\u8f6c\u8d1f|\u7a81\u7834|\u8dcc\u7834|\u53d1\u751f|\u843d\u5730|\u786e\u8ba4|\u5931\u6548|holds?|cross(?:es)?|above|below|occurs?|settles?)/iu;
const OFFICIAL_INDEX_LANGUAGE = /(?:\bindex\b|\u6307\u6570|official\s+benchmark|\u5b98\u65b9\u57fa\u51c6)/iu;

function issue(code, issuePath, message) {
  return { code, path: issuePath, message };
}

function failValidation(label, errors) {
  const detail = errors.map((error) => `${error.path ?? "$"}: ${error.message ?? error.code ?? error}`).join("\n");
  throw new Error(`${label} validation failed${detail ? `:\n${detail}` : "."}`);
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makePublicFrame(candidate, rendered) {
  const frame = {
    title: candidate.frame.title,
    body: candidate.frame.body,
    image_ref: rendered.image_ref,
    alt_text: rendered.alt_text,
  };
  const errors = validateInstance(frame, PUBLIC_FRAME_SCHEMA);
  if (errors.length) failValidation("Public Frame", errors);
  return frame;
}

function sha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function approximately(value, expected, tolerance = 1e-6) {
  return Math.abs(value - expected) <= tolerance;
}

function unique(values) {
  return [...new Set(values)];
}

function componentRefs(expression) {
  return expression.lens.components.map((component) => component.leg.result_ref);
}

function beatSources(expression) {
  return Object.values(expression.argument).filter(Boolean).flatMap((beat) => beat.source_refs);
}

function validateBeat(beat, beatPath, knownResults, errors) {
  const external = beat.state === "derived";
  if (external && beat.source_refs.length === 0) {
    errors.push(issue("BEAT_SOURCE", `${beatPath}.source_refs`, "A derived beat needs frozen source refs."));
  }
  if (!external && beat.source_refs.length !== 0) {
    errors.push(issue("BEAT_OWNERSHIP", `${beatPath}.source_refs`, "Creator-owned and conditional beats cannot borrow external source authority."));
  }
  const missing = beat.source_refs.filter((ref) => !knownResults.has(ref));
  if (missing.length) errors.push(issue("BEAT_SOURCE_REF", `${beatPath}.source_refs`, `Unknown frozen results: ${missing.join(", ")}.`));
}

export function evaluateLensObservation(expression, compiled = compileLensExpression(expression)) {
  const test = expression.observation_test;
  const value = compiled.change_from_base;
  const positive = ["lens_positive", "long_short_positive"].includes(test.kind);
  return {
    kind: test.kind,
    statement: test.statement,
    value,
    threshold: test.threshold,
    unit: "points from base 100",
    passed: positive ? value > test.threshold : value < test.threshold,
  };
}

function validateWeights(expression, expressionPath, errors) {
  const components = expression.lens.components;
  const longs = components.filter((component) => component.side === "long");
  const shorts = components.filter((component) => component.side === "short");
  components.forEach((component, index) => {
    if ((component.side === "long" && component.weight <= 0) || (component.side === "short" && component.weight >= 0)) {
      errors.push(issue("WEIGHT_SIDE", `${expressionPath}.lens.components[${index}]`, "Long weights must be positive and short weights must be negative."));
    }
  });
  if (expression.grammar === "creator_lens") {
    if (expression.lens.label_kind !== "creator_lens" || shorts.length) {
      errors.push(issue("CREATOR_LENS_SIDES", `${expressionPath}.lens`, "A creator_lens is a long-only observation basket."));
    }
    if (!approximately(longs.reduce((sum, component) => sum + component.weight, 0), 1)) {
      errors.push(issue("CREATOR_LENS_WEIGHT", `${expressionPath}.lens.components`, "Creator Lens weights must sum to 1."));
    }
    if (expression.observation_test.kind.startsWith("long_short_")) {
      errors.push(issue("OBSERVATION_KIND", `${expressionPath}.observation_test.kind`, "A creator_lens must use a lens_positive or lens_negative test."));
    }
  } else {
    if (expression.lens.label_kind !== "long_short_lens" || !longs.length || !shorts.length) {
      errors.push(issue("LONG_SHORT_SIDES", `${expressionPath}.lens`, "A long_short_lens needs at least one transparent long and one transparent short leg."));
    }
    if (!approximately(longs.reduce((sum, component) => sum + component.weight, 0), 1)
        || !approximately(shorts.reduce((sum, component) => sum + Math.abs(component.weight), 0), 1)) {
      errors.push(issue("LONG_SHORT_WEIGHT", `${expressionPath}.lens.components`, "Long weights must sum to +1 and absolute short weights to 1."));
    }
    if (!expression.observation_test.kind.startsWith("long_short_")) {
      errors.push(issue("OBSERVATION_KIND", `${expressionPath}.observation_test.kind`, "A long_short_lens must use a long_short_positive or long_short_negative test."));
    }
  }
  if (expression.lens.weighting === "equal") {
    for (const sideComponents of [longs, shorts]) {
      if (sideComponents.length > 1) {
        const absolute = Math.abs(sideComponents[0].weight);
        if (sideComponents.some((component) => !approximately(Math.abs(component.weight), absolute))) {
          errors.push(issue("EQUAL_WEIGHT", `${expressionPath}.lens.components`, "An equal-weight lens needs equal absolute weights within each side."));
        }
      }
    }
  }
}

function validateExpression(expression, candidate, binding, errors) {
  const expressionPath = "$.expression";
  const knownResults = new Set(binding.result_refs);
  const candidateEvidence = new Set(candidate.evidence_refs);
  if (expression.candidate_id !== candidate.candidate_id) {
    errors.push(issue("EXPRESSION_JOIN", `${expressionPath}.candidate_id`, "The expression must join the preview candidate exactly."));
  }
  if (expression.grammar !== expression.lens.label_kind) {
    errors.push(issue("LENS_KIND", `${expressionPath}.lens.label_kind`, "Lens label_kind must match the selected grammar."));
  }
  const expectedRelationship = expression.grammar === "creator_lens" ? "basket_breadth" : "long_short_spread";
  const expectedImageJob = expression.grammar === "creator_lens" ? "evidence_and_time" : "comparison_and_time";
  if (expression.analytic_relationship !== expectedRelationship) {
    errors.push(issue("LENS_RELATIONSHIP", `${expressionPath}.analytic_relationship`, `${expression.grammar} must use ${expectedRelationship}.`));
  }
  if (expression.text_image_division.image_job !== expectedImageJob) {
    errors.push(issue("LENS_IMAGE_JOB", `${expressionPath}.text_image_division.image_job`, `${expression.grammar} must make the image do ${expectedImageJob}.`));
  }
  if (OFFICIAL_INDEX_LANGUAGE.test(expression.lens.name)) {
    errors.push(issue("FAKE_INDEX", `${expressionPath}.lens.name`, "Call a creator-owned construction a Lens or basket, never an official index."));
  }
  if (expression.lens.formula !== CANONICAL_FORMULA) {
    errors.push(issue("LENS_FORMULA", `${expressionPath}.lens.formula`, `The Lens renderer currently supports only ${JSON.stringify(CANONICAL_FORMULA)}.`));
  }
  if (expression.lens.rebalance !== "none") {
    errors.push(issue("REBALANCE_UNSUPPORTED", `${expressionPath}.lens.rebalance`, "The Lens renderer does not pretend to calculate periodic rebalancing; use none until the engine implements it."));
  }
  if (Date.parse(expression.lens.universe_frozen_at) > Date.parse(expression.time.declared_at)) {
    errors.push(issue("UNIVERSE_FREEZE", `${expressionPath}.lens.universe_frozen_at`, "Freeze the component universe no later than the creator declaration."));
  }
  if (expression.lens.selection_mode === "pre_registered"
      && Date.parse(expression.lens.universe_frozen_at) > Date.parse(expression.time.observation_start)) {
    errors.push(issue("UNIVERSE_FREEZE", `${expressionPath}.lens.universe_frozen_at`, "Freeze the component universe no later than the observation start to avoid hindsight selection."));
  }
  if (expression.lens.selection_mode === "retrospective_exploratory"
      && !expression.lens.limitations.some((limitation) => /(?:\u56de\u770b|\u4e8b\u540e|\u9009\u62e9\u504f\u5dee|retrospective|hindsight|selection)/iu.test(limitation))) {
    errors.push(issue("RETROSPECTIVE_DISCLOSURE", `${expressionPath}.lens.limitations`, "A retrospective exploratory Lens must visibly disclose hindsight or selection bias."));
  }
  if (expression.argument.claim.state !== "creator_view" || expression.argument.mechanism.state !== "creator_view") {
    errors.push(issue("CREATOR_OWNERSHIP", `${expressionPath}.argument`, "The claim and mechanism must remain creator-owned views."));
  }
  if (expression.argument.observation.state !== "derived") {
    errors.push(issue("OBSERVATION_STATE", `${expressionPath}.argument.observation.state`, "The executable lens observation must be derived."));
  }
  if (expression.argument.implication.state !== "conditional"
      || (expression.argument.countercase && expression.argument.countercase.state !== "conditional")) {
    errors.push(issue("FORWARD_STATE", `${expressionPath}.argument`, "The implication and countercase must remain conditional."));
  }
  for (const [role, beat] of Object.entries(expression.argument)) {
    if (beat) validateBeat(beat, `${expressionPath}.argument.${role}`, knownResults, errors);
  }

  const observationStart = Date.parse(expression.time.observation_start);
  const declaredAt = Date.parse(expression.time.declared_at);
  const horizonEnd = Date.parse(expression.time.horizon_end);
  if (!(observationStart < declaredAt && declaredAt < horizonEnd)) {
    errors.push(issue("TIME_ORDER", `${expressionPath}.time`, "observation_start < declared_at < horizon_end is required."));
  }
  if (Date.parse(expression.data_as_of) !== Date.parse(binding.as_of)) {
    errors.push(issue("AS_OF_JOIN", `${expressionPath}.data_as_of`, "The visual as-of must exactly match the frozen query binding."));
  }

  const refs = componentRefs(expression);
  const tickers = expression.lens.components.map((component) => component.leg.ticker.toUpperCase());
  const componentBindings = expression.lens.components.map((component) => component.binding_id);
  if (new Set(refs).size !== refs.length || new Set(tickers).size !== tickers.length || new Set(componentBindings).size !== componentBindings.length) {
    errors.push(issue("COMPONENT_UNIQUENESS", `${expressionPath}.lens.components`, "Every component needs a unique ticker, result ref, and binding."));
  }
  const missingQuery = refs.filter((ref) => !knownResults.has(ref));
  const missingCandidate = refs.filter((ref) => !candidateEvidence.has(ref));
  if (missingQuery.length) errors.push(issue("COMPONENT_QUERY", `${expressionPath}.lens.components`, `Components missing from query binding: ${missingQuery.join(", ")}.`));
  if (missingCandidate.length) errors.push(issue("COMPONENT_EVIDENCE", `${expressionPath}.lens.components`, `Components hidden from candidate evidence: ${missingCandidate.join(", ")}.`));
  expression.lens.components.forEach((component, index) => {
    const legPath = `${expressionPath}.lens.components[${index}].leg`;
    if (component.leg.candles.data.ticker.toUpperCase() !== component.leg.ticker.toUpperCase()) {
      errors.push(issue("CANDLE_TICKER", `${legPath}.candles.data.ticker`, "Candle envelope ticker must match the visible component."));
    }
    if (Date.parse(component.leg.candles.meta.asOf) > Date.parse(expression.data_as_of)) {
      errors.push(issue("CANDLE_AS_OF", `${legPath}.candles.meta.asOf`, "A component envelope cannot be newer than the frozen visual as-of."));
    }
    component.leg.candles.data.bars.forEach((bar, barIndex) => {
      if (Date.parse(bar.openTime) > Date.parse(expression.data_as_of)) {
        errors.push(issue("BAR_AS_OF", `${legPath}.candles.data.bars[${barIndex}].openTime`, "A raw candle cannot cross the frozen visual as-of."));
      }
    });
  });
  validateWeights(expression, expressionPath, errors);

  const test = expression.observation_test;
  if (test.statement !== expression.argument.observation.text) {
    errors.push(issue("OBSERVATION_STATEMENT", `${expressionPath}.observation_test.statement`, "The executable statement must exactly match the visible derived observation."));
  }
  if (!candidate.frame.body.includes(test.statement)) {
    errors.push(issue("BODY_OBSERVATION", `${expressionPath}.observation_test.statement`, "The Frame body must include the exact tested observation."));
  }
  const componentRefSet = new Set(refs);
  if (test.source_refs.length !== componentRefSet.size || test.source_refs.some((ref) => !componentRefSet.has(ref))) {
    errors.push(issue("OBSERVATION_SOURCE", `${expressionPath}.observation_test.source_refs`, "The observation test must expose every component result and no unrelated source."));
  }
  const observationSourceSet = new Set(expression.argument.observation.source_refs);
  if (observationSourceSet.size !== componentRefSet.size || [...observationSourceSet].some((ref) => !componentRefSet.has(ref))) {
    errors.push(issue("OBSERVATION_SOURCE_COVERAGE", `${expressionPath}.argument.observation.source_refs`, "The derived sentence must bind every component result."));
  }
  const requiredSupports = [expression.argument.observation.binding_id, expression.lens.curve_binding_id, expression.lens.contribution_binding_id];
  if (requiredSupports.some((bindingId) => !test.supports_binding_ids.includes(bindingId))) {
    errors.push(issue("OBSERVATION_BINDING", `${expressionPath}.observation_test.supports_binding_ids`, "The test must bind the observed sentence, derived curve, and contribution anatomy."));
  }
  try {
    const evaluation = evaluateLensObservation(expression);
    if (!evaluation.passed) {
      errors.push(issue("OBSERVATION_UNSUPPORTED", `${expressionPath}.observation_test`, `${test.kind} did not support ${JSON.stringify(test.statement)} (value=${evaluation.value}, threshold=${evaluation.threshold}).`));
    }
  } catch (error) {
    errors.push(issue("OBSERVATION_EVALUATION", `${expressionPath}.observation_test`, `Could not compute the lens from frozen candles: ${error.message}`));
  }

  if (!expression.future_beats.some((beat) => beat.role === "invalidation")) {
    errors.push(issue("FUTURE_INVALIDATION", `${expressionPath}.future_beats`, "A Creator Lens needs a visible invalidation condition."));
  }
  if (!expression.future_beats.some((beat) => ["checkpoint", "confirmation"].includes(beat.role))) {
    errors.push(issue("FUTURE_CONFIRMATION", `${expressionPath}.future_beats`, "A Creator Lens needs a visible checkpoint or confirmation condition."));
  }
  expression.future_beats.forEach((beat, index) => {
    const timestamp = Date.parse(beat.at);
    if (!(timestamp > declaredAt && timestamp <= horizonEnd)) {
      errors.push(issue("FUTURE_BEAT_TIME", `${expressionPath}.future_beats[${index}].at`, "Future conditions must follow declaration and stay inside the horizon."));
    }
    if (!CHECKABLE_CRITERION.test(beat.criterion)) {
      errors.push(issue("FUTURE_CRITERION", `${expressionPath}.future_beats[${index}].criterion`, "Future conditions need a checkable time, operator, event, high/low, break, confirmation, or invalidation criterion."));
    }
  });

  if (candidate.frame.title.trim() === expression.argument.claim.text.trim()) {
    errors.push(issue("TEXT_IMAGE_DIVISION", `${expressionPath}.argument.claim.text`, "The image must add a visual judgment instead of repeating the Frame title."));
  }
  const allBindings = lensBindingIds(expression);
  const expectedBindings = Object.values(expression.argument).filter(Boolean).length
    + expression.lens.components.length + expression.future_beats.length + 2;
  if (allBindings.length !== expectedBindings) {
    errors.push(issue("BINDING_UNIQUENESS", expressionPath, "Every visible beat, component, curve, contribution stage, and future condition needs a unique binding."));
  }
  const strings = [];
  const walk = (value, valuePath) => {
    if (typeof value === "string") strings.push([value, valuePath]);
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${valuePath}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, `${valuePath}.${key}`));
  };
  walk(expression, expressionPath);
  walk(candidate.frame, "$.preview.candidate.frame");
  for (const [value, valuePath] of strings) {
    try {
      assertNoMutableLensPriceText(value, valuePath);
    } catch (error) {
      errors.push(issue("MUTABLE_PRICE", valuePath, error.message));
    }
  }
}

export function validateLensPreviewJob(job) {
  const errors = validateInstance(job, JOB_SCHEMA);
  if (errors.length) return { valid: false, errors };
  const { preview, expression } = job;
  errors.push(...validateMeaningLock({ preview, candidates: [preview.candidate], expressions: [expression], route: "lens" }));
  if (preview.query_binding.status === "partial" && preview.state !== "conditional") {
    errors.push(issue("PARTIAL_STATE", "$.preview.state", "A partial query can produce only a conditional preview."));
  }
  if (expression.data_status === "synthetic_fixture" && preview.state !== "conditional") {
    errors.push(issue("SYNTHETIC_STATE", "$.preview.state", "Synthetic fixtures can produce only a conditional non-publishable preview."));
  }
  const knownResults = new Set(preview.query_binding.result_refs);
  const missingEvidence = preview.candidate.evidence_refs.filter((ref) => !knownResults.has(ref));
  if (missingEvidence.length) errors.push(issue("EVIDENCE_REF", "$.preview.candidate.evidence_refs", `Unknown query results: ${missingEvidence.join(", ")}.`));
  validateExpression(expression, preview.candidate, preview.query_binding, errors);
  return { valid: errors.length === 0, errors };
}

async function renderCandidate(expression, candidate, outputRoot, dependencies) {
  const startedAt = Date.now();
  const candidateDir = path.join(outputRoot, candidate.candidate_id);
  mkdirSync(candidateDir, { recursive: true });
  const compiled = compileLensExpression(expression);
  const design = lensDesignProfile(expression);
  const altText = generateLensAltText(expression, candidate, compiled);
  const svg = renderLensSvg(expression, candidate, compiled);
  const audit = auditLensSvg(svg, expression, candidate);
  if (!audit.valid) failValidation("Creator Lens SVG", audit.errors.map((message) => issue("SVG_AUDIT", "$.expression", message)));
  const expressionPath = path.join(candidateDir, "creator-lens-expression.json");
  const svgPath = path.join(candidateDir, "frame-preview.svg");
  const pngPath = path.join(candidateDir, "viewpoint-2488.png");
  writeJson(expressionPath, expression);
  writeFileSync(svgPath, `${svg}\n`, "utf8");
  await (dependencies.rasterize ?? rasterizeSvg)(svgPath, pngPath);
  if (!existsSync(pngPath)) throw new Error("Lens preview rasterizer did not produce the publication PNG.");
  return {
    candidate_id: candidate.candidate_id,
    visual_kind: "editorial_visual",
    template_id: expression.grammar,
    image_ref: path.relative(outputRoot, pngPath).split(path.sep).join("/"),
    image_sha256: sha256(pngPath),
    image_byte_size: statSync(pngPath).size,
    duration_ms: Date.now() - startedAt,
    expression_ref: path.relative(outputRoot, expressionPath).split(path.sep).join("/"),
    svg_ref: path.relative(outputRoot, svgPath).split(path.sep).join("/"),
    grammar: expression.grammar,
    composition: expression.composition,
    surface: expression.surface,
    design_family: design.design_family,
    narrative_placement: design.narrative_placement,
    display_system: design.display_system,
    design_fingerprint: design.fingerprint,
    data_status: expression.data_status,
    publishable: expression.data_status !== "synthetic_fixture",
    alt_text: altText,
    observation_evaluation: evaluateLensObservation(expression, compiled),
    binding_ids: lensBindingIds(expression),
    lens_summary: {
      lens_id: expression.lens.lens_id,
      component_count: expression.lens.components.length,
      synchronized_count: compiled.synchronized_count,
      latest_value: compiled.latest_value,
      change_from_base: compiled.change_from_base,
    },
    audit,
  };
}

export async function runLensPreviewJob(job, outputDir, dependencies = {}) {
  const startedAt = Date.now();
  const validation = validateLensPreviewJob(job);
  if (!validation.valid) failValidation("Lens preview job", validation.errors);
  const outputRoot = path.resolve(outputDir);
  mkdirSync(outputRoot, { recursive: true });
  const rendered = await renderCandidate(job.expression, job.preview.candidate, outputRoot, dependencies);
  const state = job.preview.state === "conditional"
    || job.preview.query_binding.status === "partial"
    || job.expression.data_status === "synthetic_fixture"
    ? "conditional"
    : "ready";
  const candidate = job.preview.candidate;
  const preview = {
    schema_version: "frame-preview-v1",
    preview_id: job.preview.preview_id,
    state,
    created_at: job.preview.created_at,
    creator_view: job.preview.creator_view,
    meaning_lock_ref: job.preview.meaning_lock.lock_id,
    query_binding: job.preview.query_binding,
    generation: { mode: "recommended_one", candidate_count: 1 },
    candidates: [{
      candidate_id: candidate.candidate_id,
      angle: candidate.angle,
      visual_kind: rendered.visual_kind,
      template_id: rendered.template_id,
      frame: { ...candidate.frame, image_ref: rendered.image_ref, alt_text: rendered.alt_text },
      image_sha256: rendered.image_sha256,
      image_byte_size: rendered.image_byte_size,
      evidence_refs: candidate.evidence_refs,
      quality_checks: QUALITY_CHECKS,
    }],
    selection: { selected_candidate_id: null, confirmed: false },
    blockers: [],
  };
  const previewValidation = validateFramePreview(preview, outputRoot);
  if (!previewValidation.valid) failValidation("Frame preview", previewValidation.errors);
  writeJson(path.join(outputRoot, "frame-preview-v1.json"), preview);
  const frame = makePublicFrame(candidate, rendered);
  writeJson(path.join(outputRoot, candidate.candidate_id, "frame.json"), frame);
  writeJson(path.join(outputRoot, "frame.json"), frame);
  const report = {
    schema_version: "frame-preview-run-report",
    route: "lens",
    preview_ref: "frame-preview-v1.json",
    public_frame_refs: [`${candidate.candidate_id}/frame.json`],
    candidate_count: 1,
    release_eligible: rendered.publishable,
    total_duration_ms: Date.now() - startedAt,
    renders: [rendered],
  };
  writeJson(path.join(outputRoot, "frame-preview-fast-run-report.json"), report);
  return { frame, frames: [frame], preview, report };
}

async function main() {
  const [input, outputDir] = process.argv.slice(2);
  if (!input || !outputDir || process.argv.length !== 4) {
    process.stderr.write("usage: run_lens_preview.mjs frame-lens-preview-job.json output-dir\n");
    process.exitCode = 2;
    return;
  }
  const job = JSON.parse(readFileSync(input, "utf8"));
  const result = await runLensPreviewJob(job, outputDir);
  process.stdout.write(`${JSON.stringify(result.frame, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { CANONICAL_FORMULA };
