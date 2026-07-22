#!/usr/bin/env node
// Validate and run Cuebook's market-expression preview path.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";
import { validate as validateFramePreview } from "./validate_frame_preview.mjs";
import { validateMeaningLock } from "./validate_meaning_lock.mjs";
import {
  assertNoMutablePriceText,
  auditExpressionSvg,
  compileExpression,
  expressionDesignProfile,
  expressionBindingIds,
  generateExpressionAltText,
  renderExpressionSvg,
} from "./render_market_expression.mjs";

const require = createRequire(import.meta.url);
const rasterizerScript = fileURLToPath(new URL("../../render-cuebook-thesis-chart/scripts/rasterize_thesis_chart.cjs", import.meta.url));
const { rasterizeSvg } = require(rasterizerScript);
const JOB_SCHEMA = JSON.parse(readFileSync(new URL("../references/frame-market-preview-job.schema.json", import.meta.url), "utf8"));
const PUBLIC_FRAME_SCHEMA = JSON.parse(readFileSync(new URL("../references/frame.schema.json", import.meta.url), "utf8"));
const QUALITY_CHECKS = ["creator_ownership", "source_binding", "copy_fit", "image_render"];
const EXTERNAL_STATES = new Set(["observed", "reported", "derived"]);
const MARKET_GRAMMARS = new Set([
  "curve_story",
  "relative_divergence",
  "drawdown_recovery",
  "correlation_shift",
  "event_window",
  "threshold_regime",
]);
const GRAMMAR_COMPOSITIONS = Object.freeze({
  curve_story: new Set(["curve_stage", "editorial_split"]),
  relative_divergence: new Set(["divergence_field", "curve_stage"]),
  drawdown_recovery: new Set(["curve_stage", "editorial_split", "divergence_field"]),
  correlation_shift: new Set(["divergence_field", "editorial_split"]),
  event_window: new Set(["timeline_rail", "curve_stage"]),
  threshold_regime: new Set(["threshold_field", "curve_stage"]),
  scenario_lanes: new Set(["scenario_field"]),
  causal_spine: new Set(["causal_spine"]),
  evidence_balance: new Set(["evidence_balance"]),
});
const GRAMMAR_RELATIONSHIPS = Object.freeze({
  curve_story: new Set(["change_over_time", "deviation"]),
  relative_divergence: new Set(["relative_value"]),
  drawdown_recovery: new Set(["change_over_time", "deviation", "relative_value"]),
  correlation_shift: new Set(["correlation"]),
  event_window: new Set(["event_reaction"]),
  threshold_regime: new Set(["trigger_state"]),
  scenario_lanes: new Set(["scenario_payoff"]),
  causal_spine: new Set(["causal_transmission"]),
  evidence_balance: new Set(["deviation", "relative_value", "causal_transmission"]),
});
const GRAMMAR_OBSERVATION_TESTS = Object.freeze({
  curve_story: new Set(["primary_positive", "primary_outperformed_benchmark", "benchmark_declined"]),
  relative_divergence: new Set(["primary_outperformed_benchmark"]),
  drawdown_recovery: new Set(["primary_drawdown_shallower", "primary_recovered_faster"]),
  correlation_shift: new Set(["correlation_above", "correlation_below"]),
  event_window: new Set(["primary_positive_after_event", "primary_negative_after_event", "primary_outperformed_after_event"]),
  threshold_regime: new Set(["latest_above_threshold", "latest_below_threshold"]),
});
const CHECKABLE_CRITERION = /(?:\d+\s*(?:D|\u65e5|\u5929|\u5468|\u6839|sessions?|bars?)|[<>≤≥±]|\u65b0\u9ad8|\u65b0\u4f4e|\u8f6c\u6b63|\u8f6c\u8d1f|\u7a81\u7834|\u8dcc\u7834|\u53d1\u751f|\u843d\u5730|\u786e\u8ba4|\u5931\u6548|holds?|cross(?:es)?|above|below|within|outside|occurs?|settles?)/iu;

function issue(code, issuePath, message) {
  return { code, path: issuePath, message };
}

function failValidation(label, errors) {
  const detail = errors.map((error) => `${error.path ?? "$"}: ${error.message ?? error.code ?? error}`).join("\n");
  throw new Error(`${label} validation failed${detail ? `:\n${detail}` : "."}`);
}

function unique(values) {
  return [...new Set(values)];
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

function candidateSources(expression) {
  const values = [];
  for (const beat of Object.values(expression.argument)) if (beat) values.push(...beat.source_refs);
  if (expression.observation_test) values.push(...expression.observation_test.source_refs);
  for (const annotation of expression.annotations) values.push(...annotation.source_refs);
  for (const beat of expression.future_beats) values.push(...beat.source_refs);
  if (expression.market) {
    values.push(expression.market.primary.result_ref);
    if (expression.market.benchmark) values.push(expression.market.benchmark.result_ref);
  }
  return unique(values);
}

function periodReturn(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  return (points.at(-1).close / points[0].close - 1) * 100;
}

export function evaluateObservationTest(expression, compiled = compileExpression(expression)) {
  const test = expression.observation_test;
  if (test === null) return null;
  const threshold = test.threshold ?? 0;
  const metrics = compiled.metrics;
  let value = null;
  let unit = "%";
  let passed = false;
  const details = {};
  if (test.kind === "primary_outperformed_benchmark") {
    value = metrics?.relative_return_pp;
    unit = "pp";
    passed = Number.isFinite(value) && value > threshold;
  } else if (test.kind === "benchmark_declined") {
    value = metrics?.benchmark?.return_pct;
    passed = Number.isFinite(value) && value < threshold;
  } else if (test.kind === "primary_positive") {
    value = metrics?.primary?.return_pct;
    passed = Number.isFinite(value) && value > threshold;
  } else if (test.kind === "primary_drawdown_shallower") {
    value = metrics?.benchmark
      ? metrics.primary.max_drawdown_pct - metrics.benchmark.max_drawdown_pct
      : null;
    unit = "pp shallower";
    passed = Number.isFinite(value) && value > threshold;
  } else if (test.kind === "primary_recovered_faster") {
    const primaryBars = metrics?.primary?.recovery_bars;
    const benchmarkBars = metrics?.benchmark?.recovery_bars;
    value = Number.isInteger(primaryBars) && Number.isInteger(benchmarkBars) ? benchmarkBars - primaryBars : null;
    unit = "bars faster";
    passed = Number.isFinite(value) && value > threshold;
    details.primary_recovery_bars = primaryBars ?? null;
    details.benchmark_recovery_bars = benchmarkBars ?? null;
  } else if (test.kind === "correlation_above") {
    value = metrics?.latest_correlation;
    unit = "rho";
    passed = Number.isFinite(value) && value > threshold;
  } else if (test.kind === "correlation_below") {
    value = metrics?.latest_correlation;
    unit = "rho";
    passed = Number.isFinite(value) && value < threshold;
  } else if (test.kind === "latest_above_threshold") {
    value = metrics?.primary?.latest_close;
    unit = "price";
    passed = Number.isFinite(value) && Number.isFinite(test.threshold) && value > test.threshold;
  } else if (test.kind === "latest_below_threshold") {
    value = metrics?.primary?.latest_close;
    unit = "price";
    passed = Number.isFinite(value) && Number.isFinite(test.threshold) && value < test.threshold;
  } else if (["primary_positive_after_event", "primary_negative_after_event", "primary_outperformed_after_event"].includes(test.kind)) {
    const event = expression.annotations.find((annotation) => annotation.kind === "event" && annotation.occurred_at);
    const eventTime = event ? Date.parse(event.occurred_at) : null;
    const primary = eventTime === null ? [] : compiled.raw.primary.filter((point) => Date.parse(point.observed_at) >= eventTime);
    const benchmark = eventTime === null || !compiled.raw.benchmark
      ? []
      : compiled.raw.benchmark.filter((point) => Date.parse(point.observed_at) >= eventTime);
    const primaryReturn = periodReturn(primary);
    const benchmarkReturn = periodReturn(benchmark);
    details.event_at = event?.occurred_at ?? null;
    details.primary_return_pct = primaryReturn;
    details.benchmark_return_pct = benchmarkReturn;
    if (test.kind === "primary_positive_after_event") {
      value = primaryReturn;
      passed = Number.isFinite(value) && value > threshold;
    } else if (test.kind === "primary_negative_after_event") {
      value = primaryReturn;
      passed = Number.isFinite(value) && value < threshold;
    } else {
      value = Number.isFinite(primaryReturn) && Number.isFinite(benchmarkReturn) ? primaryReturn - benchmarkReturn : null;
      unit = "pp";
      passed = Number.isFinite(value) && value > threshold;
    }
  }
  return {
    kind: test.kind,
    statement: test.statement,
    passed,
    value: Number.isFinite(value) ? Number(value.toFixed(6)) : null,
    threshold: test.threshold,
    unit,
    details,
  };
}

function validateBeat(beat, beatPath, knownResults, errors) {
  const sources = Array.isArray(beat.source_refs) ? beat.source_refs : [];
  if (EXTERNAL_STATES.has(beat.state) && !sources.length) {
    errors.push(issue("BEAT_SOURCE", `${beatPath}.source_refs`, `${beat.state} beats require frozen source refs.`));
  }
  if (["creator_view", "conditional"].includes(beat.state) && sources.length) {
    errors.push(issue("BEAT_OWNERSHIP", `${beatPath}.source_refs`, `${beat.state} beats stay creator-owned and cannot borrow factual source refs.`));
  }
  const missing = sources.filter((ref) => !knownResults.has(ref));
  if (missing.length) errors.push(issue("BEAT_SOURCE_REF", `${beatPath}.source_refs`, `Unknown frozen result refs: ${missing.join(", ")}.`));
}

function validateExpression(expression, expressionPath, candidate, queryBinding, errors) {
  const knownResults = new Set(queryBinding.result_refs);
  const candidateEvidence = new Set(candidate.evidence_refs);
  const allowedCompositions = GRAMMAR_COMPOSITIONS[expression.grammar];
  if (!allowedCompositions?.has(expression.composition)) {
    errors.push(issue("GRAMMAR_COMPOSITION", `${expressionPath}.composition`, `${expression.grammar} cannot use ${expression.composition}.`));
  }
  const allowedRelationships = GRAMMAR_RELATIONSHIPS[expression.grammar];
  if (!allowedRelationships?.has(expression.analytic_relationship)) {
    errors.push(issue("GRAMMAR_RELATIONSHIP", `${expressionPath}.analytic_relationship`, `${expression.grammar} does not express ${expression.analytic_relationship}.`));
  }
  const needsMarket = MARKET_GRAMMARS.has(expression.grammar);
  if (needsMarket !== (expression.market !== null)) {
    errors.push(issue("GRAMMAR_MARKET", `${expressionPath}.market`, needsMarket ? `${expression.grammar} requires market series.` : `${expression.grammar} is a non-market expression and must not carry a hidden curve.`));
  }
  if (needsMarket && expression.observation_test === null) {
    errors.push(issue("OBSERVATION_TEST_REQUIRED", `${expressionPath}.observation_test`, `${expression.grammar} needs one executable test for the sentence presented as observed.`));
  }
  if (!needsMarket && expression.observation_test !== null) {
    errors.push(issue("OBSERVATION_TEST_NONMARKET", `${expressionPath}.observation_test`, "A non-market grammar cannot pretend a curve test ran."));
  }
  if (expression.market && expression.data_status === "creator_only") {
    errors.push(issue("DATA_STATUS_MARKET", `${expressionPath}.data_status`, "A rendered market curve must identify frozen observed data or an explicit synthetic fixture."));
  }
  if (expression.data_status === "creator_only" && expression.data_as_of !== null) {
    errors.push(issue("DATA_AS_OF_CREATOR", `${expressionPath}.data_as_of`, "Creator-only logic has no market-data as-of timestamp."));
  }
  if (expression.data_status !== "creator_only") {
    if (expression.data_as_of === null) {
      errors.push(issue("DATA_AS_OF_REQUIRED", `${expressionPath}.data_as_of`, "Observed or synthetic geometry needs an exact data as-of timestamp."));
    } else if (queryBinding.as_of !== expression.data_as_of) {
      errors.push(issue("DATA_AS_OF_BINDING", `${expressionPath}.data_as_of`, "Visible data as-of must equal the frozen Cuebook query binding."));
    }
  }
  if (expression.argument.claim.state !== "creator_view") {
    errors.push(issue("CLAIM_OWNERSHIP", `${expressionPath}.argument.claim.state`, "The public judgment must remain creator_view."));
  }
  if (!["creator_view", "conditional", "reported"].includes(expression.argument.mechanism.state)) {
    errors.push(issue("MECHANISM_OWNERSHIP", `${expressionPath}.argument.mechanism.state`, "A fast preview may present a sourced reported mechanism or the creator's inference, never relabel correlation as observed causality."));
  }
  if (!["creator_view", "conditional"].includes(expression.argument.implication.state)) {
    errors.push(issue("IMPLICATION_STATE", `${expressionPath}.argument.implication.state`, "The forward implication must remain creator-owned or conditional."));
  }
  for (const [role, beat] of Object.entries(expression.argument)) {
    if (beat) validateBeat(beat, `${expressionPath}.argument.${role}`, knownResults, errors);
  }
  expression.annotations.forEach((annotation, index) => {
    validateBeat(annotation, `${expressionPath}.annotations[${index}]`, knownResults, errors);
    if (annotation.kind === "threshold" && !Number.isFinite(annotation.value)) {
      errors.push(issue("THRESHOLD_VALUE", `${expressionPath}.annotations[${index}].value`, "Threshold annotations require a numeric value."));
    }
    if (["event", "regime_start"].includes(annotation.kind) && !annotation.occurred_at) {
      errors.push(issue("ANNOTATION_TIME", `${expressionPath}.annotations[${index}].occurred_at`, `${annotation.kind} annotations require a timestamp.`));
    }
  });
  expression.future_beats.forEach((beat, index) => {
    validateBeat(beat, `${expressionPath}.future_beats[${index}]`, knownResults, errors);
    if (!CHECKABLE_CRITERION.test(beat.criterion)) {
      errors.push(issue("FUTURE_CRITERION", `${expressionPath}.future_beats[${index}].criterion`, "Future beats need a checkable time, operator, range, event, break, confirmation, or invalidation criterion."));
    }
  });

  const observationStart = Date.parse(expression.time.observation_start);
  const declaredAt = Date.parse(expression.time.declared_at);
  const horizonEnd = expression.time.horizon_end ? Date.parse(expression.time.horizon_end) : null;
  if (!(observationStart < declaredAt)) errors.push(issue("TIME_ORDER", `${expressionPath}.time`, "observation_start must precede declared_at."));
  if (horizonEnd === null) {
    if (expression.time.future_mode !== "none" || expression.future_beats.length) {
      errors.push(issue("OPEN_TIME", `${expressionPath}.time`, "An open horizon cannot invent a future region or dated future beats."));
    }
  } else {
    if (!(horizonEnd > declaredAt)) errors.push(issue("HORIZON_ORDER", `${expressionPath}.time.horizon_end`, "horizon_end must follow declared_at."));
    if (expression.time.future_mode === "none") errors.push(issue("FUTURE_MODE", `${expressionPath}.time.future_mode`, "A dated horizon needs an honest future-time mode."));
    if (["conditional_lanes", "milestone_ladder"].includes(expression.time.future_mode) && !expression.future_beats.length) {
      errors.push(issue("FUTURE_BEATS", `${expressionPath}.future_beats`, `${expression.time.future_mode} requires at least one future beat.`));
    }
    expression.future_beats.forEach((beat, index) => {
      if (beat.at) {
        const timestamp = Date.parse(beat.at);
        if (!(timestamp > declaredAt && timestamp <= horizonEnd)) {
          errors.push(issue("FUTURE_BEAT_TIME", `${expressionPath}.future_beats[${index}].at`, "A future beat must follow declaration and not exceed the horizon."));
        }
      }
    });
  }
  if (expression.time.future_mode === "empty_clock" && expression.future_beats.length) {
    errors.push(issue("EMPTY_CLOCK_BEATS", `${expressionPath}.future_beats`, "empty_clock shows only declaration and horizon; use a lane or ladder for future beats."));
  }
  if (expression.grammar === "scenario_lanes" && expression.future_beats.length < 2) {
    errors.push(issue("SCENARIO_LANES", `${expressionPath}.future_beats`, "A scenario field needs at least two distinct conditional or reported lanes."));
  }
  if (expression.grammar === "scenario_lanes" && expression.time.future_mode !== "conditional_lanes") {
    errors.push(issue("SCENARIO_TIME_MODE", `${expressionPath}.time.future_mode`, "A scenario field must use conditional_lanes."));
  }
  if (expression.grammar === "scenario_lanes") {
    if (!expression.future_beats.some((beat) => beat.role === "invalidation")) {
      errors.push(issue("SCENARIO_INVALIDATION", `${expressionPath}.future_beats`, "Scenario lanes need one counter-signal branch, rendered publicly as a neutral reason to reassess rather than a hard invalidation label."));
    }
    if (!expression.future_beats.some((beat) => beat.role !== "invalidation")) {
      errors.push(issue("SCENARIO_CONFIRMATION", `${expressionPath}.future_beats`, "Scenario lanes need at least one confirmation, checkpoint, catalyst, or settlement branch."));
    }
    expression.future_beats.forEach((beat, index) => {
      if (beat.at === null) errors.push(issue("SCENARIO_BEAT_TIME", `${expressionPath}.future_beats[${index}].at`, "Every scenario branch needs a visible D+ or calendar date."));
    });
    if (expression.argument.countercase === null) {
      errors.push(issue("SCENARIO_COUNTERCASE", `${expressionPath}.argument.countercase`, "Scenario expression needs an explicit creator-facing invalidation sentence."));
    }
  }
  if (expression.grammar === "evidence_balance" && expression.argument.countercase === null) {
    errors.push(issue("COUNTERCASE", `${expressionPath}.argument.countercase`, "An evidence balance needs a real countercase."));
  }
  if (expression.grammar === "event_window" && !expression.annotations.some((annotation) => annotation.kind === "event")) {
    errors.push(issue("EVENT_MARK", `${expressionPath}.annotations`, "An event window requires a sourced event marker."));
  }
  if (expression.grammar === "threshold_regime" && !expression.annotations.some((annotation) => annotation.kind === "threshold")) {
    errors.push(issue("THRESHOLD_MARK", `${expressionPath}.annotations`, "A threshold regime requires an explicit threshold."));
  }
  if (expression.market === null && expression.annotations.length) {
    errors.push(issue("NONMARKET_ANNOTATION", `${expressionPath}.annotations`, "Non-market grammars express evidence as typed beats, not unrendered chart annotations."));
  }
  expression.annotations.forEach((annotation, index) => {
    if (annotation.occurred_at && Date.parse(annotation.occurred_at) > declaredAt) {
      errors.push(issue("FUTURE_ANNOTATION", `${expressionPath}.annotations[${index}].occurred_at`, "Chart annotations cannot cross the declaration boundary; use a future beat for a reported catalyst."));
    }
  });

  if (expression.market) {
    const market = expression.market;
    const usesPair = [market.main_transform, market.support_transform].some((transform) => ["relative_spread", "rolling_correlation"].includes(transform))
      || (market.main_transform === "indexed_return" && market.benchmark !== null)
      || (market.main_transform === "drawdown" && market.benchmark !== null);
    if (usesPair && market.benchmark === null) errors.push(issue("BENCHMARK_REQUIRED", `${expressionPath}.market.benchmark`, "The selected transform requires a benchmark."));
    if (!usesPair && market.benchmark !== null) errors.push(issue("BENCHMARK_UNUSED", `${expressionPath}.market.benchmark`, "Remove a benchmark that the visible transforms do not use."));
    if (market.chart_style === "candles" && market.main_transform !== "raw_price") {
      errors.push(issue("CANDLE_TRANSFORM", `${expressionPath}.market.chart_style`, "Candles are valid only on a raw-price main panel."));
    }
    if (market.show_volume !== (market.support_transform === "volume_ratio")) {
      errors.push(issue("VOLUME_PANEL", `${expressionPath}.market`, "show_volume must exactly match a visible volume_ratio support panel."));
    }
    if (market.support_transform !== "none" && market.support_transform === market.main_transform) {
      errors.push(issue("DUPLICATE_PANEL", `${expressionPath}.market.support_transform`, "The support panel must answer a different question from the main curve."));
    }
    const bindingCount = (transform) => {
      if (["relative_spread", "rolling_correlation", "volume_ratio", "raw_price"].includes(transform)) return 1;
      if (["indexed_return", "drawdown"].includes(transform)) return market.benchmark === null ? 1 : 2;
      return 0;
    };
    if (market.main_binding_ids.length !== bindingCount(market.main_transform)) {
      errors.push(issue("MAIN_BINDING_COUNT", `${expressionPath}.market.main_binding_ids`, `${market.main_transform} needs one binding per visible main-panel curve.`));
    }
    const expectedSupportBindings = market.support_transform === "none" ? 0 : bindingCount(market.support_transform);
    if (market.support_binding_ids.length !== expectedSupportBindings) {
      errors.push(issue("SUPPORT_BINDING_COUNT", `${expressionPath}.market.support_binding_ids`, `${market.support_transform} needs one binding per visible support-panel curve.`));
    }
    const grammarTransforms = {
      relative_divergence: new Set(["indexed_return", "relative_spread"]),
      drawdown_recovery: new Set(["drawdown"]),
      correlation_shift: new Set(["rolling_correlation"]),
      threshold_regime: new Set(["raw_price"]),
    };
    if (grammarTransforms[expression.grammar] && !grammarTransforms[expression.grammar].has(market.main_transform)) {
      errors.push(issue("GRAMMAR_TRANSFORM", `${expressionPath}.market.main_transform`, `${expression.grammar} cannot use ${market.main_transform}.`));
    }
    for (const [role, leg] of [["primary", market.primary], ["benchmark", market.benchmark]]) {
      if (!leg) continue;
      if (!knownResults.has(leg.result_ref)) errors.push(issue("MARKET_RESULT", `${expressionPath}.market.${role}.result_ref`, "Market legs must resolve through the frozen query binding."));
      if (!candidateEvidence.has(leg.result_ref)) errors.push(issue("MARKET_EVIDENCE", `${expressionPath}.market.${role}.result_ref`, "Every visible market leg must remain in candidate.evidence_refs."));
      if (expression.data_as_of && Date.parse(leg.candles.meta.asOf) > Date.parse(expression.data_as_of)) {
        errors.push(issue("MARKET_AS_OF", `${expressionPath}.market.${role}.candles.meta.asOf`, "A market envelope cannot contain observations newer than the visible frozen as-of."));
      }
    }
  }

  if (expression.observation_test) {
    const test = expression.observation_test;
    const allowedTests = GRAMMAR_OBSERVATION_TESTS[expression.grammar];
    if (!allowedTests?.has(test.kind)) {
      errors.push(issue("OBSERVATION_TEST_GRAMMAR", `${expressionPath}.observation_test.kind`, `${test.kind} cannot substantiate ${expression.grammar}.`));
    }
    if (test.statement !== expression.argument.observation.text) {
      errors.push(issue("OBSERVATION_STATEMENT", `${expressionPath}.observation_test.statement`, "The executable observation statement must exactly match the image's observed sentence."));
    }
    if (!candidate.frame.body.includes(test.statement)) {
      errors.push(issue("BODY_OBSERVATION", `${expressionPath}.observation_test.statement`, "The Frame body must carry the exact tested observation before adding the creator's mechanism and forward view."));
    }
    const missingTestSources = test.source_refs.filter((ref) => !knownResults.has(ref) || !candidateEvidence.has(ref));
    if (missingTestSources.length) {
      errors.push(issue("OBSERVATION_SOURCE", `${expressionPath}.observation_test.source_refs`, `Observation test sources must be frozen and visible in candidate evidence: ${missingTestSources.join(", ")}.`));
    }
    const observationSources = new Set(expression.argument.observation.source_refs);
    if ([...observationSources].some((ref) => !test.source_refs.includes(ref))) {
      errors.push(issue("OBSERVATION_SOURCE_COVERAGE", `${expressionPath}.observation_test.source_refs`, "The executable test must cover every source claimed by the observed sentence."));
    }
    const visibleBindings = new Set(expressionBindingIds(expression));
    const missingBindings = test.supports_binding_ids.filter((bindingId) => !visibleBindings.has(bindingId));
    if (missingBindings.length) {
      errors.push(issue("OBSERVATION_BINDING", `${expressionPath}.observation_test.supports_binding_ids`, `Observation test refers to hidden bindings: ${missingBindings.join(", ")}.`));
    }
    if (!test.supports_binding_ids.includes(expression.argument.observation.binding_id)) {
      errors.push(issue("OBSERVATION_TEXT_BINDING", `${expressionPath}.observation_test.supports_binding_ids`, "The test must bind the exact observed sentence it substantiates."));
    }
    const evidenceGeometry = new Set([
      ...(expression.market?.main_binding_ids ?? []),
      ...(expression.market?.support_binding_ids ?? []),
      ...expression.annotations.map((annotation) => annotation.binding_id),
    ]);
    if (!test.supports_binding_ids.some((bindingId) => evidenceGeometry.has(bindingId))) {
      errors.push(issue("OBSERVATION_GEOMETRY_BINDING", `${expressionPath}.observation_test.supports_binding_ids`, "The tested sentence needs at least one visible curve, threshold, or event binding."));
    }
    try {
      const evaluation = evaluateObservationTest(expression);
      if (!evaluation.passed) {
        errors.push(issue(
          "OBSERVATION_UNSUPPORTED",
          `${expressionPath}.observation_test`,
          `${test.kind} did not support ${JSON.stringify(test.statement)} (value=${evaluation.value ?? "unavailable"}, threshold=${evaluation.threshold ?? "default 0"} ${evaluation.unit}).`,
        ));
      }
    } catch (error) {
      errors.push(issue("OBSERVATION_EVALUATION", `${expressionPath}.observation_test`, `Could not evaluate the observed sentence from frozen raw data: ${error.message}`));
    }
  }

  const externalSources = candidateSources(expression);
  const missingCandidateSources = externalSources.filter((ref) => !candidateEvidence.has(ref));
  if (missingCandidateSources.length) {
    errors.push(issue("CANDIDATE_SOURCE_COVERAGE", `${expressionPath}`, `Candidate evidence_refs omit visible sources: ${missingCandidateSources.join(", ")}.`));
  }
  const bindings = expressionBindingIds(expression);
  if (bindings.length !== (
    Object.values(expression.argument).filter(Boolean).length
    + expression.annotations.length
    + expression.future_beats.length
    + (expression.market ? expression.market.main_binding_ids.length + expression.market.support_binding_ids.length : 0)
  )) {
    errors.push(issue("BINDING_UNIQUENESS", expressionPath, "Every visible argument, curve, annotation, and future beat needs a distinct stable binding_id."));
  }
  if (candidate.frame.title.trim() === expression.argument.claim.text.trim()) {
    errors.push(issue("TEXT_IMAGE_DIVISION", `${expressionPath}.argument.claim.text`, "The image must add a visual judgment instead of repeating the Frame title exactly."));
  }
  if (candidate.frame.body.includes(expression.argument.claim.text) && candidate.frame.body.trim() === expression.argument.claim.text.trim()) {
    errors.push(issue("TEXT_IMAGE_DIVISION", `${expressionPath}.argument.claim.text`, "The image cannot merely repeat the entire body."));
  }
  const expectedImageJobs = MARKET_GRAMMARS.has(expression.grammar)
    ? new Set(expression.grammar === "relative_divergence" ? ["comparison_and_time"] : ["evidence_and_time", "comparison_and_time"])
    : new Set(expression.grammar === "scenario_lanes" ? ["scenario_and_time"] : ["mechanism_and_time"]);
  if (!expectedImageJobs.has(expression.text_image_division.image_job)) {
    errors.push(issue("IMAGE_JOB", `${expressionPath}.text_image_division.image_job`, `${expression.grammar} does not satisfy ${expression.text_image_division.image_job}.`));
  }

  const strings = [];
  const walk = (value, valuePath) => {
    if (typeof value === "string") strings.push([value, valuePath]);
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${valuePath}[${index}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, `${valuePath}.${key}`));
  };
  walk(expression, expressionPath);
  for (const [value, valuePath] of strings) {
    try {
      assertNoMutablePriceText(value, valuePath);
    } catch (error) {
      errors.push(issue("MUTABLE_PRICE", valuePath, error.message));
    }
  }
}

export function validateMarketPreviewJob(job) {
  const errors = validateInstance(job, JOB_SCHEMA);
  if (errors.length) return { valid: false, errors };
  const { preview, expressions } = job;
  errors.push(...validateMeaningLock({ preview, candidates: preview.candidates, expressions, route: "market" }));
  if (preview.candidates.length !== 1 || expressions.length !== 1) {
    errors.push(issue("CANDIDATE_COUNT", "$.expressions", "A confirmed Meaning Lock renders exactly one expression at a time."));
  }
  const candidateIds = preview.candidates.map((candidate) => candidate.candidate_id);
  const expressionIds = expressions.map((expression) => expression.candidate_id);
  if (new Set(candidateIds).size !== candidateIds.length || new Set(expressionIds).size !== expressionIds.length) {
    errors.push(issue("DUPLICATE_ID", "$.preview.candidates", "Candidate and expression IDs must be unique."));
  }
  if (candidateIds.slice().sort().join("\0") !== expressionIds.slice().sort().join("\0")) {
    errors.push(issue("EXPRESSION_JOIN", "$.expressions", "Every candidate needs exactly one matching expression."));
  }
  const binding = preview.query_binding;
  const usable = ["reused", "executed", "partial"].includes(binding.status);
  if (binding.required && !usable) errors.push(issue("QUERY_REQUIRED", "$.preview.query_binding.status", "A material current-market preview needs one usable reconciled evidence batch."));
  if (!binding.required && binding.status !== "not_required") errors.push(issue("QUERY_NOT_REQUIRED", "$.preview.query_binding.status", "A non-required preview must use not_required."));
  if (usable && (!binding.bundle_refs.length || !binding.result_refs.length || !binding.as_of)) {
    errors.push(issue("QUERY_LINEAGE", "$.preview.query_binding", "Usable query results require bundle_refs, result_refs, and as_of."));
  }
  if (binding.status === "not_required" && (binding.bundle_refs.length || binding.result_refs.length || binding.as_of !== null)) {
    errors.push(issue("QUERY_EMPTY", "$.preview.query_binding", "A not-required query cannot carry result lineage."));
  }
  if (binding.status === "partial" && preview.state !== "conditional") errors.push(issue("PARTIAL_STATE", "$.preview.state", "A partial query can produce only a conditional preview."));
  if (expressions.some((expression) => expression.data_status === "synthetic_fixture") && preview.state !== "conditional") {
    errors.push(issue("SYNTHETIC_STATE", "$.preview.state", "Synthetic fixtures are visibly marked and can produce only a conditional, non-publishable preview."));
  }
  const knownResults = new Set(binding.result_refs);
  const candidates = new Map(preview.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  preview.candidates.forEach((candidate, index) => {
    const missing = candidate.evidence_refs.filter((ref) => !knownResults.has(ref));
    if (missing.length) errors.push(issue("EVIDENCE_REF", `$.preview.candidates[${index}].evidence_refs`, `Unknown query results: ${missing.join(", ")}.`));
    if (binding.required && usable && !candidate.evidence_refs.length) errors.push(issue("EVIDENCE_REQUIRED", `$.preview.candidates[${index}].evidence_refs`, "Current-market creation requires frozen evidence refs."));
    for (const [field, value] of Object.entries(candidate.frame)) {
      try {
        assertNoMutablePriceText(value, `$.preview.candidates[${index}].frame.${field}`);
      } catch (error) {
        errors.push(issue("MUTABLE_PRICE", `$.preview.candidates[${index}].frame.${field}`, error.message));
      }
    }
  });
  expressions.forEach((expression, index) => {
    const candidate = candidates.get(expression.candidate_id);
    if (candidate) validateExpression(expression, `$.expressions[${index}]`, candidate, binding, errors);
  });
  const allBindings = expressions.flatMap((expression) => expressionBindingIds(expression));
  if (new Set(allBindings).size !== allBindings.length) {
    errors.push(issue("PREVIEW_BINDING_UNIQUENESS", "$.expressions", "Every visible binding_id must be unique across the complete preview job."));
  }
  return { valid: errors.length === 0, errors };
}

async function renderCandidate(expression, candidate, outputRoot, dependencies) {
  const startedAt = Date.now();
  const candidateDir = path.join(outputRoot, candidate.candidate_id);
  mkdirSync(candidateDir, { recursive: true });
  const compiled = compileExpression(expression);
  const design = expressionDesignProfile(expression);
  const altText = generateExpressionAltText(expression, candidate, compiled);
  const svg = renderExpressionSvg(expression, candidate, compiled);
  const audit = auditExpressionSvg(svg, expression, candidate);
  if (!audit.valid) failValidation("Fast expression SVG", audit.errors.map((message) => issue("SVG_AUDIT", "$.expressions", message)));
  const expressionPath = path.join(candidateDir, "market-expression.json");
  const svgPath = path.join(candidateDir, "frame-preview.svg");
  const pngPath = path.join(candidateDir, "viewpoint-2488.png");
  writeJson(expressionPath, expression);
  writeFileSync(svgPath, `${svg}\n`, "utf8");
  await (dependencies.rasterize ?? rasterizeSvg)(svgPath, pngPath);
  if (!existsSync(pngPath)) throw new Error("Market preview rasterizer did not produce the publication PNG.");
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
    observation_evaluation: evaluateObservationTest(expression, compiled),
    binding_ids: expressionBindingIds(expression),
    market_transforms: expression.market ? {
      main: expression.market.main_transform,
      support: expression.market.support_transform,
    } : null,
    audit,
  };
}

export async function runMarketPreviewJob(job, outputDir, dependencies = {}) {
  const startedAt = Date.now();
  const validation = validateMarketPreviewJob(job);
  if (!validation.valid) failValidation("Market preview job", validation.errors);
  const outputRoot = path.resolve(outputDir);
  mkdirSync(outputRoot, { recursive: true });
  const candidates = new Map(job.preview.candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const renders = await Promise.all(job.expressions.map((expression) => (
    renderCandidate(expression, candidates.get(expression.candidate_id), outputRoot, dependencies)
  )));
  const renderedById = new Map(renders.map((rendered) => [rendered.candidate_id, rendered]));
  const state = job.preview.state === "conditional"
    || job.preview.query_binding.status === "partial"
    || job.expressions.some((expression) => expression.data_status === "synthetic_fixture")
    ? "conditional"
    : "ready";
  const preview = {
    schema_version: "frame-preview-v1",
    preview_id: job.preview.preview_id,
    state,
    created_at: job.preview.created_at,
    creator_view: job.preview.creator_view,
    meaning_lock_ref: job.preview.meaning_lock.lock_id,
    query_binding: job.preview.query_binding,
    generation: {
      mode: "recommended_one",
      candidate_count: 1,
    },
    candidates: job.preview.candidates.map((candidate) => {
      const rendered = renderedById.get(candidate.candidate_id);
      return {
        candidate_id: candidate.candidate_id,
        angle: candidate.angle,
        visual_kind: rendered.visual_kind,
        template_id: rendered.template_id,
        frame: { ...candidate.frame, image_ref: rendered.image_ref, alt_text: rendered.alt_text },
        image_sha256: rendered.image_sha256,
        image_byte_size: rendered.image_byte_size,
        evidence_refs: candidate.evidence_refs,
        quality_checks: QUALITY_CHECKS,
      };
    }),
    selection: { selected_candidate_id: null, confirmed: false },
    blockers: [],
  };
  const previewValidation = validateFramePreview(preview, outputRoot);
  if (!previewValidation.valid) failValidation("Frame preview", previewValidation.errors);
  writeJson(path.join(outputRoot, "frame-preview-v1.json"), preview);
  const frames = job.preview.candidates.map((candidate) => {
    const rendered = renderedById.get(candidate.candidate_id);
    const frame = makePublicFrame(candidate, rendered);
    writeJson(path.join(outputRoot, candidate.candidate_id, "frame.json"), frame);
    return frame;
  });
  if (frames.length === 1) writeJson(path.join(outputRoot, "frame.json"), frames[0]);
  const report = {
    schema_version: "frame-preview-run-report",
    route: "market",
    preview_ref: "frame-preview-v1.json",
    public_frame_refs: renders.map((rendered) => `${rendered.candidate_id}/frame.json`),
    candidate_count: renders.length,
    release_eligible: renders.every((rendered) => rendered.publishable),
    total_duration_ms: Date.now() - startedAt,
    renders,
  };
  writeJson(path.join(outputRoot, "frame-preview-fast-run-report.json"), report);
  return { frame: frames[0], frames, preview, report };
}

async function main() {
  const [input, outputDir] = process.argv.slice(2);
  if (!input || !outputDir || process.argv.length !== 4) {
    process.stderr.write("usage: run_market_preview.mjs frame-market-preview-job.json output-dir\n");
    process.exitCode = 2;
    return;
  }
  const job = JSON.parse(readFileSync(input, "utf8"));
  const result = await runMarketPreviewJob(job, outputDir);
  process.stdout.write(`${JSON.stringify(result.frame, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
