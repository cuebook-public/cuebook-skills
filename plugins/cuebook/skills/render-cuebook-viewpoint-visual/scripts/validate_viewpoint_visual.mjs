#!/usr/bin/env node
// Validate ViewpointVisualSpecV1 inputs and ViewpointVisualV1 manifests.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collapseWhitespace,
  displayWidth,
  pyFromIsoformat,
  pyrepr,
  pyStrip,
} from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

export const GRAMMAR_JOBS = {
  reaction_test: "test_reaction",
  parallel_contrast: "compare_paths",
  category_reframe: "reframe_category",
  relative_value_trigger: "show_relative_trigger",
  policy_pivot: "show_policy_pivot",
  sentiment_witness: "show_sentiment_witness",
  event_unwind: "show_event_unwind",
  feedback_loop: "explain_feedback_loop",
  binary_level: "test_binary_level",
  expectation_gap: "show_expectation_gap",
  factor_rotation: "show_factor_rotation",
};
export const GRAMMARS = new Set(Object.keys(GRAMMAR_JOBS));
export const WIDE_GRAMMARS = new Set([
  "reaction_test", "event_transmission", "expectation_revision", "valuation_reframe", "relative_value",
  "cycle_rotation", "flow_pressure", "technical_trigger", "scenario_branch", "strategy_ladder", "custom",
]);
export const SUPPORTED_MODES = {
  reaction_test: new Set(["qualitative", "key_numbers", "series"]),
  parallel_contrast: new Set(["qualitative", "key_numbers", "series"]),
  category_reframe: new Set(["qualitative"]),
  relative_value_trigger: new Set(["qualitative", "key_numbers"]),
  policy_pivot: new Set(["qualitative", "key_numbers"]),
  sentiment_witness: new Set(["qualitative", "key_numbers", "series"]),
  event_unwind: new Set(["qualitative", "key_numbers", "series"]),
  feedback_loop: new Set(["qualitative", "mixed"]),
  binary_level: new Set(["key_numbers", "series"]),
  expectation_gap: new Set(["qualitative", "key_numbers"]),
  factor_rotation: new Set(["qualitative", "key_numbers", "series"]),
};
export const STATES = new Set(["conditional", "ready", "frozen"]);
const SHAPES = new Set(["circle", "square", "triangle", "diamond"]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PUBLIC_BACKEND_PATTERN = /\b(?:draft|conditional|ready|frozen|blocked|observed|derived|provisional|unconfirmed|settlement|settle|deadline|source|sources)\b/iu;
const PUBLIC_BACKEND_CJK = ["草稿", "待确认", "已确认", "已计算", "推演", "形成中", "已冻结", "来源", "结算", "成功条件"];

const here = fileURLToPath(new URL(".", import.meta.url));
const skillRoot = resolve(here, "..");
const wordmarkAsset = join(skillRoot, "..", "direct-cuebook-viewpoint-visual", "assets", "cuebook-wordmark.svg");
export const CANONICAL_WORDMARK_PATHS = [...readFileSync(wordmarkAsset, "utf8").matchAll(/<path\s+d="([^"]+)"/g)].map((match) => match[1]);
export const CANONICAL_WORDMARK_COLOR = JSON.parse(readFileSync(join(skillRoot, "references", "cuebook-visual-tokens-v1.json"), "utf8")).colors.ink;

const SPEC_FIELDS = new Set([
  "schema_version", "spec_id", "revision", "state", "grammar", "payload_mode", "visual_job",
  "lineage", "frame", "data", "render", "quality_report",
]);
const MANIFEST_FIELDS = new Set([
  "schema_version", "visual_id", "render_profile", "spec_ref", "grammar", "payload_mode", "visual_job",
  "state", "generated_at", "dimensions", "theme", "lineage", "content", "asset", "quality_report",
]);
const DATA_KEYS = ["series", "values", "levels", "events", "nodes", "edges", "rails", "stages"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function g(value, key, fallback = null) {
  return isObject(value) && Object.hasOwn(value, key) ? value[key] : fallback;
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function setDifference(left, right) {
  return new Set([...left].filter((item) => !right.has(item)));
}

function pyString(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

function pyLength(value) {
  if (typeof value === "string" || Array.isArray(value)) return [...value].length;
  if (isObject(value)) return Object.keys(value).length;
  return 0;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export { displayWidth as display_width };

export function checkObject(value, path, required, allowed, errors) {
  if (!isObject(value)) {
    errors.push(issue("OBJECT", path, "Expected an object."));
    return {};
  }
  const keys = new Set(Object.keys(value));
  for (const key of sorted(setDifference(required, keys))) errors.push(issue("MISSING_FIELD", `${path}.${key}`, "Required field is missing."));
  for (const key of sorted(setDifference(keys, allowed))) errors.push(issue("UNKNOWN_FIELD", `${path}.${key}`, "Unknown field."));
  return value;
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATE_TIME", path, "Expected an RFC 3339 timestamp."));
    return null;
  }
  const parsed = pyFromIsoformat(pyString(value).replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATE_TIME", path, "Expected an RFC 3339 timestamp."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("DATE_TIME_ZONE", path, "Timestamp must include a timezone."));
    return null;
  }
  return parsed;
}

export function stringList(value, path, errors, { minimum = 0, maximum = null } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) errors.push(issue("STRING_LIST_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    else result.push(item.trim());
  });
  if (result.length < minimum) errors.push(issue("STRING_LIST_MIN", path, `Expected at least ${minimum} item(s).`));
  if (maximum !== null && result.length > maximum) errors.push(issue("STRING_LIST_MAX", path, `Expected at most ${maximum} item(s).`));
  if (new Set(result).size !== result.length) errors.push(issue("STRING_LIST_UNIQUE", path, "Items must be unique."));
  return result;
}

export function publicText(value, path, errors, { maximum, units = null }) {
  if (!nonempty(value)) {
    errors.push(issue("PUBLIC_TEXT", path, "Expected non-empty public text."));
    return "";
  }
  const text = pyStrip(collapseWhitespace(pyString(value)));
  if ([...text].length > maximum) errors.push(issue("PUBLIC_TEXT_LENGTH", path, `Public text exceeds ${maximum} characters.`));
  if (units !== null && displayWidth(text) > units) errors.push(issue("PUBLIC_TEXT_FIT", path, `Public text exceeds the ${units}-unit composition limit.`));
  if (PUBLIC_BACKEND_PATTERN.test(text) || PUBLIC_BACKEND_CJK.some((term) => text.includes(term))) errors.push(issue("PUBLIC_BACKEND_TEXT", path, "Workflow, source, or settlement language cannot appear in public copy."));
  return text;
}

export function validateQuality(value, state, errors) {
  const fields = new Set(["decision", "warnings", "hard_failures"]);
  const quality = checkObject(value, "$.quality_report", fields, fields, errors);
  const decision = g(quality, "decision");
  if (!new Set(["ready", "conditional", "blocked"]).has(decision)) errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  const warnings = stringList(g(quality, "warnings"), "$.quality_report.warnings", errors);
  const failures = stringList(g(quality, "hard_failures"), "$.quality_report.hard_failures", errors);
  if (decision === "blocked" && !failures.length) errors.push(issue("BLOCKED_FAILURES", "$.quality_report.hard_failures", "Blocked output requires a hard failure."));
  if (decision !== "blocked" && failures.length) errors.push(issue("HARD_FAILURES", "$.quality_report.hard_failures", "Renderable output cannot retain hard failures."));
  if (state === "conditional" && !new Set(["conditional", "blocked"]).has(decision)) errors.push(issue("STATE_QUALITY", "$.quality_report.decision", "Conditional state requires conditional or blocked quality."));
  if (new Set(["ready", "frozen"]).has(state) && decision !== "ready") errors.push(issue("STATE_QUALITY", "$.quality_report.decision", "Ready or frozen state requires ready quality."));
  void warnings;
}

export function validateSource(ref, path, lineageSources, errors) {
  if (!nonempty(ref)) {
    errors.push(issue("SOURCE_REF", path, "A source ref is required."));
    return null;
  }
  const value = ref.trim();
  if (!lineageSources.has(value)) errors.push(issue("SOURCE_LINEAGE", path, "Primitive source ref is missing from lineage.source_refs."));
  return value;
}

export function validateSeries(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("SERIES", "$.data.series", "Expected an array."));
    return [];
  }
  if (items.length > 2) errors.push(issue("SERIES_COUNT", "$.data.series", "At most two series are supported."));
  const result = [], seen = new Set();
  items.forEach((item, index) => {
    const path = `$.data.series[${index}]`;
    const fields = new Set(["id", "label", "role", "data_kind", "unit", "source_ref", "points"]);
    const series = checkObject(item, path, fields, fields, errors);
    const seriesId = g(series, "id");
    if (!/^S[1-9][0-9]*$/.test(pyString(seriesId || "")) || seen.has(seriesId)) errors.push(issue("SERIES_ID", `${path}.id`, "Expected a unique S<number> ID."));
    seen.add(seriesId);
    publicText(g(series, "label"), `${path}.label`, errors, { maximum: 28, units: 24 });
    if (!new Set(["reaction", "primary", "comparison", "witness", "unwind", "level_test"]).has(g(series, "role"))) errors.push(issue("SERIES_ROLE", `${path}.role`, "Unsupported series role."));
    if (g(series, "data_kind") !== "observed") errors.push(issue("OBSERVED_ONLY", `${path}.data_kind`, "Only observed series can be rendered."));
    if (!nonempty(g(series, "unit")) || [...pyString(g(series, "unit", ""))].length > 12) errors.push(issue("UNIT", `${path}.unit`, "A unit of at most 12 characters is required."));
    validateSource(g(series, "source_ref"), `${path}.source_ref`, sources, errors);
    let points = g(series, "points");
    if (!Array.isArray(points) || points.length < 2 || points.length > 24) {
      errors.push(issue("POINT_COUNT", `${path}.points`, "Series require two to 24 explicit points."));
      points = [];
    }
    const xValues = [];
    let xKind = null;
    points.forEach((itemPoint, pointIndex) => {
      const pointPath = `${path}.points[${pointIndex}]`;
      const fields = new Set(["x", "y", "source_ref"]);
      const point = checkObject(itemPoint, pointPath, fields, fields, errors);
      const x = g(point, "x");
      let parsedX = null, currentKind = null;
      if (isNumber(x)) {
        parsedX = Number(x);
        currentKind = "float";
      } else if (typeof x === "string") {
        parsedX = parseTime(x, `${pointPath}.x`, errors);
        currentKind = "datetime";
      } else errors.push(issue("POINT_X", `${pointPath}.x`, "Point x must be a finite number or timestamp."));
      if (parsedX !== null) {
        if (xKind === null) xKind = currentKind;
        else if (xKind !== currentKind) errors.push(issue("POINT_X_KIND", `${pointPath}.x`, "All point x values in a series must share one type."));
        xValues.push(currentKind === "datetime" ? parsedX.epoch : parsedX);
      }
      if (!isNumber(g(point, "y"))) errors.push(issue("POINT_Y", `${pointPath}.y`, "Point y must be finite."));
      if (g(point, "source_ref") !== null) validateSource(g(point, "source_ref"), `${pointPath}.source_ref`, sources, errors);
    });
    if (xValues.length === points.length && xValues.some((value, itemIndex) => itemIndex > 0 && xValues[itemIndex - 1] >= value)) errors.push(issue("POINT_ORDER", `${path}.points`, "Point x values must be strictly increasing."));
    result.push(series);
  });
  return result;
}

export function validateValues(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("VALUES", "$.data.values", "Expected an array."));
    return [];
  }
  if (items.length > 3) errors.push(issue("VALUE_COUNT", "$.data.values", "At most three values are supported."));
  const result = [], seen = new Set();
  const fields = new Set(["id", "label", "role", "display_value", "numeric_value", "unit", "as_of", "source_ref", "shape", "formula"]);
  items.forEach((item, index) => {
    const path = `$.data.values[${index}]`;
    const value = checkObject(item, path, fields, fields, errors);
    const valueId = g(value, "id");
    if (!/^V[1-9][0-9]*$/.test(pyString(valueId || "")) || seen.has(valueId)) errors.push(issue("VALUE_ID", `${path}.id`, "Expected a unique V<number> ID."));
    seen.add(valueId);
    publicText(g(value, "label"), `${path}.label`, errors, { maximum: 32, units: 28 });
    publicText(g(value, "display_value"), `${path}.display_value`, errors, { maximum: 20, units: 18 });
    if (!new Set(["spread", "baseline", "witness", "current", "expected", "actual", "gap", "from", "to", "shock_primary", "shock_secondary"]).has(g(value, "role"))) errors.push(issue("VALUE_ROLE", `${path}.role`, "Unsupported value role."));
    if (!isNumber(g(value, "numeric_value"))) errors.push(issue("VALUE_NUMBER", `${path}.numeric_value`, "Value must be finite."));
    if (!nonempty(g(value, "unit")) || [...pyString(g(value, "unit", ""))].length > 12) errors.push(issue("UNIT", `${path}.unit`, "A unit of at most 12 characters is required."));
    parseTime(g(value, "as_of"), `${path}.as_of`, errors);
    validateSource(g(value, "source_ref"), `${path}.source_ref`, sources, errors);
    if (!SHAPES.has(g(value, "shape"))) errors.push(issue("SHAPE", `${path}.shape`, "Unsupported non-color marker shape."));
    if (g(value, "formula") !== null && !nonempty(g(value, "formula"))) errors.push(issue("FORMULA", `${path}.formula`, "Formula must be null or non-empty."));
    result.push(value);
  });
  return result;
}

export function validateLevels(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("LEVELS", "$.data.levels", "Expected an array."));
    return [];
  }
  if (items.length > 1) errors.push(issue("LEVEL_COUNT", "$.data.levels", "At most one level is supported."));
  const result = [];
  const fields = new Set(["id", "label", "role", "display_value", "numeric_value", "unit", "relation", "relation_label", "source_ref"]);
  items.forEach((item, index) => {
    const path = `$.data.levels[${index}]`;
    const level = checkObject(item, path, fields, fields, errors);
    if (!/^L[1-9][0-9]*$/.test(pyString(g(level, "id") || ""))) errors.push(issue("LEVEL_ID", `${path}.id`, "Expected an L<number> ID."));
    publicText(g(level, "label"), `${path}.label`, errors, { maximum: 32, units: 28 });
    publicText(g(level, "display_value"), `${path}.display_value`, errors, { maximum: 20, units: 18 });
    publicText(g(level, "relation_label"), `${path}.relation_label`, errors, { maximum: 24, units: 22 });
    if (!new Set(["trigger", "threshold"]).has(g(level, "role"))) errors.push(issue("LEVEL_ROLE", `${path}.role`, "Unsupported level role."));
    if (!isNumber(g(level, "numeric_value"))) errors.push(issue("LEVEL_NUMBER", `${path}.numeric_value`, "Level must be finite."));
    if (!nonempty(g(level, "unit")) || [...pyString(g(level, "unit", ""))].length > 12) errors.push(issue("UNIT", `${path}.unit`, "A unit of at most 12 characters is required."));
    if (!new Set(["above", "below", "at"]).has(g(level, "relation"))) errors.push(issue("LEVEL_RELATION", `${path}.relation`, "Relation must be above, below, or at."));
    validateSource(g(level, "source_ref"), `${path}.source_ref`, sources, errors);
    result.push(level);
  });
  return result;
}

export function validateEvents(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("EVENTS", "$.data.events", "Expected an array."));
    return [];
  }
  if (items.length > 1) errors.push(issue("EVENT_COUNT", "$.data.events", "At most one event is supported."));
  const result = [], fields = new Set(["id", "label", "occurred_at", "source_ref"]);
  items.forEach((item, index) => {
    const path = `$.data.events[${index}]`;
    const event = checkObject(item, path, fields, fields, errors);
    if (!/^EVT[1-9][0-9]*$/.test(pyString(g(event, "id") || ""))) errors.push(issue("EVENT_ID", `${path}.id`, "Expected an EVT<number> ID."));
    publicText(g(event, "label"), `${path}.label`, errors, { maximum: 36, units: 30 });
    parseTime(g(event, "occurred_at"), `${path}.occurred_at`, errors);
    validateSource(g(event, "source_ref"), `${path}.source_ref`, sources, errors);
    result.push(event);
  });
  return result;
}

export function validateNodes(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("NODES", "$.data.nodes", "Expected an array."));
    return [];
  }
  if (items.length > 4) errors.push(issue("NODE_COUNT", "$.data.nodes", "At most four nodes are supported."));
  const result = [], seen = new Set();
  const fields = new Set(["id", "label", "role", "source_refs", "shape", "path_kind"]);
  items.forEach((item, index) => {
    const path = `$.data.nodes[${index}]`;
    const node = checkObject(item, path, fields, fields, errors);
    const nodeId = g(node, "id");
    if (!/^N[1-9][0-9]*$/.test(pyString(nodeId || "")) || seen.has(nodeId)) errors.push(issue("NODE_ID", `${path}.id`, "Expected a unique N<number> ID."));
    seen.add(nodeId);
    publicText(g(node, "label"), `${path}.label`, errors, { maximum: 48, units: 26 });
    if (!new Set(["frame_from", "frame_to", "policy_before", "policy_after", "loop"]).has(g(node, "role"))) errors.push(issue("NODE_ROLE", `${path}.role`, "Unsupported node role."));
    const nodeSources = stringList(g(node, "source_refs"), `${path}.source_refs`, errors, { minimum: 1 });
    nodeSources.forEach((ref, sourceIndex) => validateSource(ref, `${path}.source_refs[${sourceIndex}]`, sources, errors));
    if (!SHAPES.has(g(node, "shape"))) errors.push(issue("SHAPE", `${path}.shape`, "Unsupported non-color marker shape."));
    if (!new Set(["solid", "conditional", "future"]).has(g(node, "path_kind"))) errors.push(issue("PATH_KIND", `${path}.path_kind`, "Path kind must be solid, conditional, or future."));
    result.push(node);
  });
  return result;
}

export function validateEdges(items, nodes, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("EDGES", "$.data.edges", "Expected an array."));
    return [];
  }
  if (items.length > 4) errors.push(issue("EDGE_COUNT", "$.data.edges", "At most four edges are supported."));
  const nodeIds = new Set(nodes.map((node) => g(node, "id"))), seen = new Set(), result = [];
  const fields = new Set(["id", "from", "to", "relation", "label", "source_refs", "path_kind"]);
  items.forEach((item, index) => {
    const path = `$.data.edges[${index}]`;
    const edge = checkObject(item, path, fields, fields, errors);
    const edgeId = g(edge, "id");
    if (!/^E[1-9][0-9]*$/.test(pyString(edgeId || "")) || seen.has(edgeId)) errors.push(issue("EDGE_ID", `${path}.id`, "Expected a unique E<number> ID."));
    seen.add(edgeId);
    if (!nodeIds.has(g(edge, "from")) || !nodeIds.has(g(edge, "to")) || g(edge, "from") === g(edge, "to")) errors.push(issue("EDGE_ENDPOINT", path, "Edge endpoints must name two distinct supplied nodes."));
    if (!new Set(["reframes", "pivots", "reinforces", "dampens"]).has(g(edge, "relation"))) errors.push(issue("EDGE_RELATION", `${path}.relation`, "Unsupported edge relation."));
    if (g(edge, "label") !== null) publicText(g(edge, "label"), `${path}.label`, errors, { maximum: 24, units: 20 });
    const edgeSources = stringList(g(edge, "source_refs"), `${path}.source_refs`, errors, { minimum: 1 });
    edgeSources.forEach((ref, sourceIndex) => validateSource(ref, `${path}.source_refs[${sourceIndex}]`, sources, errors));
    if (!new Set(["solid", "conditional", "future"]).has(g(edge, "path_kind"))) errors.push(issue("PATH_KIND", `${path}.path_kind`, "Path kind must be solid, conditional, or future."));
    result.push(edge);
  });
  return result;
}

export function validateRails(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("RAILS", "$.data.rails", "Expected an array."));
    return [];
  }
  if (items.length > 2) errors.push(issue("RAIL_COUNT", "$.data.rails", "At most two outcome rails are supported."));
  const roles = new Set(["pressure", "response", "primary", "comparison", "spread", "trigger", "policy_before", "policy_after", "baseline", "witness", "expected", "actual", "from", "to"]);
  const fields = new Set(["id", "label", "detail", "role", "display_value", "numeric_value", "unit", "formula", "source_refs", "shape", "path_kind"]);
  const result = [], seen = new Set();
  items.forEach((item, index) => {
    const path = `$.data.rails[${index}]`;
    const rail = checkObject(item, path, fields, fields, errors);
    const railId = g(rail, "id");
    if (!/^R[1-9][0-9]*$/.test(pyString(railId || "")) || seen.has(railId)) errors.push(issue("RAIL_ID", `${path}.id`, "Expected a unique R<number> ID."));
    seen.add(railId);
    publicText(g(rail, "label"), `${path}.label`, errors, { maximum: 32, units: 24 });
    publicText(g(rail, "detail"), `${path}.detail`, errors, { maximum: 72, units: 44 });
    if (g(rail, "display_value") !== null) publicText(g(rail, "display_value"), `${path}.display_value`, errors, { maximum: 24, units: 20 });
    if (!roles.has(g(rail, "role"))) errors.push(issue("RAIL_ROLE", `${path}.role`, "Unsupported rail role."));
    const numeric = g(rail, "numeric_value"), unit = g(rail, "unit");
    if (numeric !== null && !isNumber(numeric)) errors.push(issue("RAIL_NUMBER", `${path}.numeric_value`, "Rail numeric value must be null or finite."));
    if (unit !== null && (!nonempty(unit) || [...pyString(unit)].length > 12)) errors.push(issue("UNIT", `${path}.unit`, "Rail unit must be null or a non-empty string of at most 12 characters."));
    if (numeric !== null && !nonempty(unit)) errors.push(issue("RAIL_UNIT", `${path}.unit`, "A numeric rail requires an explicit unit."));
    if (numeric === null && unit !== null) errors.push(issue("RAIL_UNIT", `${path}.unit`, "A non-numeric rail must not declare a unit."));
    if (g(rail, "formula") !== null) publicText(g(rail, "formula"), `${path}.formula`, errors, { maximum: 96, units: 44 });
    const refs = stringList(g(rail, "source_refs"), `${path}.source_refs`, errors, { minimum: 1 });
    refs.forEach((ref, sourceIndex) => validateSource(ref, `${path}.source_refs[${sourceIndex}]`, sources, errors));
    if (!SHAPES.has(g(rail, "shape"))) errors.push(issue("SHAPE", `${path}.shape`, "Unsupported non-color marker shape."));
    if (!new Set(["solid", "conditional", "future"]).has(g(rail, "path_kind"))) errors.push(issue("PATH_KIND", `${path}.path_kind`, "Path kind must be solid, conditional, or future."));
    result.push(rail);
  });
  return result;
}

export function validateStages(items, sources, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("STAGES", "$.data.stages", "Expected an array."));
    return [];
  }
  if (items.length > 3) errors.push(issue("STAGE_COUNT", "$.data.stages", "At most three timeline stages are supported."));
  const fields = new Set(["id", "label", "detail", "role", "occurred_at", "display_value", "numeric_value", "unit", "source_refs", "shape", "path_kind"]);
  const result = [], seen = new Set();
  items.forEach((item, index) => {
    const path = `$.data.stages[${index}]`;
    const stage = checkObject(item, path, fields, fields, errors);
    const stageId = g(stage, "id");
    if (!/^T[1-9][0-9]*$/.test(pyString(stageId || "")) || seen.has(stageId)) errors.push(issue("STAGE_ID", `${path}.id`, "Expected a unique T<number> ID."));
    seen.add(stageId);
    publicText(g(stage, "label"), `${path}.label`, errors, { maximum: 32, units: 24 });
    publicText(g(stage, "detail"), `${path}.detail`, errors, { maximum: 64, units: 30 });
    if (g(stage, "display_value") !== null) publicText(g(stage, "display_value"), `${path}.display_value`, errors, { maximum: 24, units: 18 });
    if (!new Set(["pre_event", "event_day", "next_step"]).has(g(stage, "role"))) errors.push(issue("STAGE_ROLE", `${path}.role`, "Unsupported stage role."));
    if (g(stage, "occurred_at") !== null) parseTime(g(stage, "occurred_at"), `${path}.occurred_at`, errors);
    const numeric = g(stage, "numeric_value"), unit = g(stage, "unit");
    if (numeric !== null && !isNumber(numeric)) errors.push(issue("STAGE_NUMBER", `${path}.numeric_value`, "Stage numeric value must be null or finite."));
    if (unit !== null && (!nonempty(unit) || [...pyString(unit)].length > 12)) errors.push(issue("UNIT", `${path}.unit`, "Stage unit must be null or a non-empty string of at most 12 characters."));
    if (numeric !== null && !nonempty(unit)) errors.push(issue("STAGE_UNIT", `${path}.unit`, "A numeric stage requires an explicit unit."));
    if (numeric === null && unit !== null) errors.push(issue("STAGE_UNIT", `${path}.unit`, "A non-numeric stage must not declare a unit."));
    const refs = stringList(g(stage, "source_refs"), `${path}.source_refs`, errors, { minimum: 1 });
    refs.forEach((ref, sourceIndex) => validateSource(ref, `${path}.source_refs[${sourceIndex}]`, sources, errors));
    if (!SHAPES.has(g(stage, "shape"))) errors.push(issue("SHAPE", `${path}.shape`, "Unsupported non-color marker shape."));
    if (!new Set(["solid", "conditional", "future"]).has(g(stage, "path_kind"))) errors.push(issue("PATH_KIND", `${path}.path_kind`, "Path kind must be solid, conditional, or future."));
    result.push(stage);
  });
  return result;
}

export function relationFor(value, level) {
  if (Math.abs(value - level) <= Math.max(1e-9 * Math.max(Math.abs(value), Math.abs(level)), 1e-9)) return "at";
  return value > level ? "above" : "below";
}

export function pointTimes(series, errors, path) {
  const result = [];
  const points = g(series, "points", []);
  for (const [index, point] of (Array.isArray(points) ? points : []).entries()) {
    const parsed = parseTime(g(point, "x"), `${path}.points[${index}].x`, errors);
    if (parsed !== null) result.push(parsed);
  }
  return result;
}

export function requireEmpty(data, allowed, errors) {
  for (const key of DATA_KEYS) {
    if (!allowed.has(key) && data[key].length) errors.push(issue("GRAMMAR_EXTRA_DATA", `$.data.${key}`, "This primitive is not used by the selected grammar."));
  }
}

export function requireRoles(items, roles, path, errors) {
  const actual = new Set(items.map((item) => g(item, "role")));
  if (items.length !== roles.size || actual.size !== roles.size || [...actual].some((role) => !roles.has(role))) {
    errors.push(issue("GRAMMAR_ROLES", path, `Expected exactly these roles: ${sorted(roles).join(", ")}.`));
  }
}

export function validateEventSeries(series, event, errors, { minimumPoints, eventMustMatch }) {
  const points = g(series, "points", []);
  if (pyLength(points) < minimumPoints) errors.push(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", `This grammar requires at least ${minimumPoints} observed points.`));
  const times = pointTimes(series, errors, "$.data.series[0]");
  const occurred = parseTime(g(event, "occurred_at"), "$.data.events[0].occurred_at", errors);
  let eventIndex = null;
  if (occurred !== null && times.length === pyLength(points)) {
    if (!times.length || occurred.epoch < times[0].epoch || occurred.epoch > times.at(-1).epoch) errors.push(issue("EVENT_RANGE", "$.data.events[0].occurred_at", "Event must fall inside the observed series range."));
    for (const [index, timestamp] of times.entries()) {
      if (timestamp.epoch === occurred.epoch) {
        eventIndex = index;
        break;
      }
    }
    if (eventMustMatch && eventIndex === null) errors.push(issue("EVENT_POINT", "$.data.events[0].occurred_at", "Event must match an observed point timestamp."));
  }
  return [times, eventIndex];
}

export function validateRailMode(rails, roles, mode, errors) {
  requireRoles(rails, roles, "$.data.rails", errors);
  if (mode === "qualitative") {
    rails.forEach((rail, index) => {
      if (["display_value", "numeric_value", "unit"].some((key) => g(rail, key) !== null)) errors.push(issue("QUALITATIVE_NUMERIC_DATA", `$.data.rails[${index}]`, "Qualitative rails must not carry numeric or display-value fields."));
    });
  } else if (mode === "key_numbers") {
    if (!rails.length || !rails.some((rail) => isNumber(g(rail, "numeric_value")))) errors.push(issue("KEY_NUMBER_REQUIRED", "$.data.rails", "Key-number rails require at least one explicit numeric value."));
    rails.forEach((rail, index) => {
      if (!nonempty(g(rail, "display_value"))) errors.push(issue("KEY_NUMBER_DISPLAY", `$.data.rails[${index}].display_value`, "Every key-number rail requires an explicit display value."));
    });
  }
}

export function validateStageMode(stages, mode, errors) {
  requireRoles(stages, new Set(["pre_event", "event_day", "next_step"]), "$.data.stages", errors);
  if (mode === "qualitative") {
    stages.forEach((stage, index) => {
      if (["display_value", "numeric_value", "unit"].some((key) => g(stage, key) !== null)) errors.push(issue("QUALITATIVE_NUMERIC_DATA", `$.data.stages[${index}]`, "Qualitative stages must not carry numeric or display-value fields."));
    });
  } else if (mode === "key_numbers") {
    if (!stages.length || !stages.some((stage) => isNumber(g(stage, "numeric_value")))) errors.push(issue("KEY_NUMBER_REQUIRED", "$.data.stages", "Key-number stages require at least one explicit numeric value."));
    stages.forEach((stage, index) => {
      if (g(stage, "numeric_value") !== null && !nonempty(g(stage, "display_value"))) errors.push(issue("KEY_NUMBER_DISPLAY", `$.data.stages[${index}].display_value`, "Numeric stages require an explicit display value."));
    });
  }
}

export function validateSynchronizedSeries(series, errors) {
  if (series.length !== 2) return;
  const firstTimes = pointTimes(series[0], errors, "$.data.series[0]");
  const secondTimes = pointTimes(series[1], errors, "$.data.series[1]");
  if (firstTimes.length !== secondTimes.length || firstTimes.some((item, index) => item.epoch !== secondTimes[index].epoch)) errors.push(issue("SYNCHRONIZED_SERIES", "$.data.series", "Series-mode comparison requires identical timestamps."));
  if (g(series[0], "unit") !== g(series[1], "unit")) errors.push(issue("COMPARABLE_UNITS", "$.data.series", "Series-mode comparison requires matching units."));
}

export function validateGrammar(data, grammar, mode, errors) {
  const [series, values, levels, events, nodes, edges, rails, stages] = DATA_KEYS.map((key) => data[key]);
  if (grammar !== "feedback_loop" && nodes.length > 2) errors.push(issue("LANDSCAPE_NODE_LIMIT", "$.data.nodes", "Landscape visuals allow at most two reasoning nodes unless the grammar is feedback_loop."));
  if (grammar !== "factor_rotation" && rails.some((rail) => g(rail, "formula") !== null)) errors.push(issue("FORMULA_GRAMMAR", "$.data.rails", "Rail formulas are reserved for factor_rotation."));

  if (grammar === "reaction_test") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series", "events"]), errors);
      requireRoles(series, new Set(["reaction"]), "$.data.series", errors);
      if (events.length !== 1) errors.push(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "Series reaction_test requires exactly one event."));
      if (series.length === 1 && events.length === 1) {
        const [times] = validateEventSeries(series[0], events[0], errors, { minimumPoints: 3, eventMustMatch: false });
        const occurred = parseTime(g(events[0], "occurred_at"), "$.data.events[0].occurred_at", errors);
        if (occurred !== null && times.length && !(times[0].epoch < occurred.epoch && occurred.epoch < times.at(-1).epoch)) errors.push(issue("REACTION_WINDOW", "$.data.events[0].occurred_at", "Series reaction_test needs observations before and after the event."));
      }
    } else {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["pressure", "response"]), mode, errors);
    }
  } else if (grammar === "parallel_contrast") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series"]), errors);
      requireRoles(series, new Set(["primary", "comparison"]), "$.data.series", errors);
      validateSynchronizedSeries(series, errors);
    } else {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["primary", "comparison"]), mode, errors);
    }
  } else if (grammar === "category_reframe") {
    requireEmpty(data, new Set(["nodes", "edges"]), errors);
    requireRoles(nodes, new Set(["frame_from", "frame_to"]), "$.data.nodes", errors);
    if (edges.length !== 1 || g(edges[0], "relation") !== "reframes") errors.push(issue("REFRAME_EDGE", "$.data.edges", "category_reframe requires one reframes edge."));
  } else if (grammar === "relative_value_trigger") {
    if (mode === "qualitative") {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["spread", "trigger"]), mode, errors);
    } else {
      requireEmpty(data, new Set(["values", "levels"]), errors);
      requireRoles(values, new Set(["spread"]), "$.data.values", errors);
      requireRoles(levels, new Set(["trigger"]), "$.data.levels", errors);
      validateValueLevel(values, levels, errors);
    }
  } else if (grammar === "policy_pivot") {
    if (events.length !== 1) errors.push(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "policy_pivot requires exactly one event."));
    if (mode === "qualitative") {
      requireEmpty(data, new Set(["events", "nodes", "edges"]), errors);
      requireRoles(nodes, new Set(["policy_before", "policy_after"]), "$.data.nodes", errors);
      if (edges.length !== 1 || g(edges[0], "relation") !== "pivots") errors.push(issue("PIVOT_EDGE", "$.data.edges", "Qualitative policy_pivot requires one pivots edge."));
    } else {
      requireEmpty(data, new Set(["events", "rails"]), errors);
      validateRailMode(rails, new Set(["policy_before", "policy_after"]), mode, errors);
    }
  } else if (grammar === "sentiment_witness") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series"]), errors);
      requireRoles(series, new Set(["witness"]), "$.data.series", errors);
      if (series.length === 1 && pyLength(g(series[0], "points", [])) < 3) errors.push(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", "Series sentiment_witness requires at least three observations."));
      if (series.length === 1) pointTimes(series[0], errors, "$.data.series[0]");
    } else {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["baseline", "witness"]), mode, errors);
    }
  } else if (grammar === "event_unwind") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series", "events"]), errors);
      requireRoles(series, new Set(["unwind"]), "$.data.series", errors);
      if (events.length !== 1) errors.push(issue("GRAMMAR_EVENT_COUNT", "$.data.events", "Series event_unwind requires exactly one event."));
      if (series.length === 1 && events.length === 1) {
        const [, eventIndex] = validateEventSeries(series[0], events[0], errors, { minimumPoints: 4, eventMustMatch: true });
        const points = g(series[0], "points", []);
        if (eventIndex !== null) {
          if (eventIndex === 0 || eventIndex >= points.length - 1) errors.push(issue("UNWIND_EVENT_POSITION", "$.data.events[0].occurred_at", "Series event_unwind needs a pre-event baseline and post-event observations."));
          else if (points.every((point) => isNumber(g(point, "y")))) {
            const baseline = Number(g(points[0], "y"));
            const deviations = points.slice(eventIndex).map((point) => Math.abs(Number(g(point, "y")) - baseline));
            if (!deviations.length || Math.max(...deviations) <= 0 || !(deviations.at(-1) < Math.max(...deviations))) errors.push(issue("UNWIND_ARITHMETIC", "$.data.series[0].points", "Final value must retrace from the post-event extreme toward the first value."));
          }
        }
      }
    } else {
      requireEmpty(data, new Set(["stages"]), errors);
      validateStageMode(stages, mode, errors);
    }
  } else if (grammar === "feedback_loop") {
    requireEmpty(data, mode === "mixed" ? new Set(["nodes", "edges", "values"]) : new Set(["nodes", "edges"]), errors);
    if (nodes.length < 3 || nodes.length > 4 || nodes.some((node) => g(node, "role") !== "loop")) errors.push(issue("LOOP_NODES", "$.data.nodes", "feedback_loop requires three or four loop nodes."));
    if (edges.length !== nodes.length || edges.some((edge) => !new Set(["reinforces", "dampens"]).has(g(edge, "relation")))) errors.push(issue("LOOP_EDGES", "$.data.edges", "feedback_loop requires one reinforcing or dampening edge per node."));
    validateCycle(nodes, edges, errors);
    if (mode === "mixed") {
      requireRoles(values, new Set(["shock_primary", "shock_secondary"]), "$.data.values", errors);
      validateSameUnits(values, "$.data.values", errors);
      values.forEach((value, index) => {
        if (displayWidth(pyString(g(value, "label") || "")) > 13) errors.push(issue("MIXED_VALUE_FIT", `$.data.values[${index}].label`, "Mixed feedback shock labels must fit the compact value panel."));
      });
      nodes.forEach((node, index) => {
        if (displayWidth(pyString(g(node, "label") || "")) > 18) errors.push(issue("MIXED_NODE_FIT", `$.data.nodes[${index}].label`, "Mixed feedback loop labels must fit the compact loop."));
      });
    }
  } else if (grammar === "binary_level") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series", "levels"]), errors);
      requireRoles(series, new Set(["level_test"]), "$.data.series", errors);
      requireRoles(levels, new Set(["threshold"]), "$.data.levels", errors);
      validateSeriesLevel(series, levels, errors);
    } else {
      requireEmpty(data, new Set(["values", "levels"]), errors);
      requireRoles(values, new Set(["current"]), "$.data.values", errors);
      requireRoles(levels, new Set(["threshold"]), "$.data.levels", errors);
      validateValueLevel(values, levels, errors);
    }
  } else if (grammar === "expectation_gap") {
    if (mode === "qualitative") {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["expected", "actual"]), mode, errors);
    } else {
      requireEmpty(data, new Set(["values"]), errors);
      requireRoles(values, new Set(["expected", "actual", "gap"]), "$.data.values", errors);
      validateSameUnits(values, "$.data.values", errors);
      const byRole = Object.fromEntries(values.map((value) => [g(value, "role"), value]));
      if (new Set(Object.keys(byRole)).size === 3 && ["expected", "actual", "gap"].every((role) => Object.hasOwn(byRole, role)) && Object.values(byRole).every((item) => isNumber(g(item, "numeric_value")))) {
        const expected = Number(g(byRole.expected, "numeric_value"));
        const actual = Number(g(byRole.actual, "numeric_value"));
        const gap = Number(g(byRole.gap, "numeric_value"));
        if (Math.abs(gap - (actual - expected)) > Math.max(1e-9 * Math.max(Math.abs(gap), Math.abs(actual - expected)), 1e-9)) errors.push(issue("EXPECTATION_GAP", "$.data.values", "Explicit gap must equal actual minus expected."));
        if (!nonempty(g(byRole.gap, "formula"))) errors.push(issue("EXPECTATION_FORMULA", "$.data.values", "The gap value requires an explicit formula."));
      }
    }
  } else if (grammar === "factor_rotation") {
    if (mode === "series") {
      requireEmpty(data, new Set(["series"]), errors);
      requireRoles(series, new Set(["primary", "comparison"]), "$.data.series", errors);
      validateSynchronizedSeries(series, errors);
    } else {
      requireEmpty(data, new Set(["rails"]), errors);
      validateRailMode(rails, new Set(["from", "to"]), mode, errors);
      if (mode === "qualitative" && !rails.some((rail) => nonempty(g(rail, "formula")))) errors.push(issue("FACTOR_FORMULA", "$.data.rails", "Qualitative factor_rotation requires an explicit formula on one rail."));
      if (mode !== "qualitative" && rails.some((rail) => g(rail, "formula") !== null)) errors.push(issue("FACTOR_FORMULA_MODE", "$.data.rails", "Rail formulas without current values belong in qualitative factor_rotation mode."));
    }
  }
}

export function validateSameUnits(items, path, errors) {
  const units = new Set(items.map((item) => g(item, "unit")).filter(nonempty));
  if (units.size > 1) errors.push(issue("COMPARABLE_UNITS", path, "Compared values must share one unit."));
}

export function validateValueLevel(values, levels, errors) {
  if (values.length !== 1 || levels.length !== 1) return;
  const [value] = values, [level] = levels;
  if (g(value, "unit") !== g(level, "unit")) errors.push(issue("COMPARABLE_UNITS", "$.data", "Value and level must share one unit."));
  if (isNumber(g(value, "numeric_value")) && isNumber(g(level, "numeric_value"))) {
    const observed = relationFor(Number(g(value, "numeric_value")), Number(g(level, "numeric_value")));
    if (g(level, "relation") !== observed) errors.push(issue("LEVEL_RELATION_MISMATCH", "$.data.levels[0].relation", `Numeric inputs imply relation '${observed}'.`));
  }
}

export function validateSeriesLevel(series, levels, errors) {
  if (series.length !== 1 || levels.length !== 1) return;
  const [item] = series, [level] = levels;
  if (g(item, "unit") !== g(level, "unit")) errors.push(issue("COMPARABLE_UNITS", "$.data", "Observed path and level must share one unit."));
  const points = g(item, "points", []);
  if (pyLength(points) < 3) errors.push(issue("GRAMMAR_POINT_COUNT", "$.data.series[0].points", "Series binary_level requires at least three observed points."));
  pointTimes(item, errors, "$.data.series[0]");
  if (points.length && isNumber(g(points.at(-1), "y")) && isNumber(g(level, "numeric_value"))) {
    const observed = relationFor(Number(g(points.at(-1), "y")), Number(g(level, "numeric_value")));
    if (g(level, "relation") !== observed) errors.push(issue("LEVEL_RELATION_MISMATCH", "$.data.levels[0].relation", `Final observed point implies relation '${observed}'.`));
  }
}

export function validateCycle(nodes, edges, errors) {
  const nodeIds = new Set(nodes.map((node) => g(node, "id")));
  if (!nodeIds.size || edges.length !== nodeIds.size) return;
  const outgoing = new Map([...nodeIds].map((nodeId) => [nodeId, []]));
  const incoming = new Map([...nodeIds].map((nodeId) => [nodeId, 0]));
  for (const edge of edges) {
    const source = g(edge, "from"), target = g(edge, "to");
    if (outgoing.has(source) && incoming.has(target)) {
      outgoing.get(source).push(target);
      incoming.set(target, incoming.get(target) + 1);
    }
  }
  if ([...nodeIds].some((nodeId) => outgoing.get(nodeId).length !== 1 || incoming.get(nodeId) !== 1)) {
    errors.push(issue("LOOP_TOPOLOGY", "$.data.edges", "Every loop node must have one incoming and one outgoing edge."));
    return;
  }
  const start = nodeIds.values().next().value;
  const visited = new Set();
  let current = start;
  while (!visited.has(current)) {
    visited.add(current);
    current = outgoing.get(current)[0];
  }
  if (current !== start || visited.size !== nodeIds.size || [...visited].some((nodeId) => !nodeIds.has(nodeId))) errors.push(issue("LOOP_TOPOLOGY", "$.data.edges", "Edges must form one closed cycle containing every node."));
}

export function validateSpec(payload) {
  const errors = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  checkObject(payload, "$", SPEC_FIELDS, SPEC_FIELDS, errors);
  if (g(payload, "schema_version") !== "viewpoint-visual-spec-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-visual-spec-v1."));
  if (!/^VVSPEC_[A-Za-z0-9_:-]{8,}$/.test(pyString(g(payload, "spec_id") || ""))) errors.push(issue("SPEC_ID", "$.spec_id", "Invalid viewpoint visual spec ID."));
  const revision = g(payload, "revision", 0);
  if (!Number.isSafeInteger(revision) || revision < 1) errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  const state = g(payload, "state");
  if (!STATES.has(state)) errors.push(issue("STATE", "$.state", "Unsupported state."));
  const grammar = g(payload, "grammar"), payloadMode = g(payload, "payload_mode");
  if (!GRAMMARS.has(grammar)) errors.push(issue("GRAMMAR", "$.grammar", "Unsupported viewpoint grammar."));
  else {
    if (g(payload, "visual_job") !== GRAMMAR_JOBS[grammar]) errors.push(issue("VISUAL_JOB", "$.visual_job", `${grammar} requires visual_job '${GRAMMAR_JOBS[grammar]}'.`));
    if (!SUPPORTED_MODES[grammar].has(payloadMode)) errors.push(issue("PAYLOAD_MODE", "$.payload_mode", `${grammar} supports: ${sorted(SUPPORTED_MODES[grammar]).join(", ")}.`));
  }

  const lineageFields = new Set(["input_artifact_refs", "source_refs", "decision_cutoff_at"]);
  const lineage = checkObject(g(payload, "lineage"), "$.lineage", lineageFields, lineageFields, errors);
  stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors, { minimum: 1 });
  const sourceList = stringList(g(lineage, "source_refs"), "$.lineage.source_refs", errors, { minimum: 1 });
  const sourceSet = new Set(sourceList);
  const cutoff = parseTime(g(lineage, "decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors);

  const frameFields = new Set(["headline", "observation", "observed_at", "strategy_tags", "alt_text"]);
  const frame = checkObject(g(payload, "frame"), "$.frame", frameFields, frameFields, errors);
  publicText(g(frame, "headline"), "$.frame.headline", errors, { maximum: 96, units: 84 });
  publicText(g(frame, "observation"), "$.frame.observation", errors, { maximum: 120, units: 120 });
  const observedAt = parseTime(g(frame, "observed_at"), "$.frame.observed_at", errors);
  const tags = stringList(g(frame, "strategy_tags"), "$.frame.strategy_tags", errors, { minimum: 1, maximum: 4 });
  tags.forEach((tag, index) => publicText(tag, `$.frame.strategy_tags[${index}]`, errors, { maximum: 20, units: 18 }));
  if (displayWidth(tags.join(" / ")) > 58) errors.push(issue("STRATEGY_TAG_FIT", "$.frame.strategy_tags", "Strategy tags exceed the compact header width."));
  publicText(g(frame, "alt_text"), "$.frame.alt_text", errors, { maximum: 320 });
  if (cutoff !== null && observedAt !== null && observedAt.epoch > cutoff.epoch) errors.push(issue("OBSERVATION_CUTOFF", "$.frame.observed_at", "Observation time cannot exceed the decision cutoff."));

  const dataFields = new Set(DATA_KEYS);
  const dataObject = checkObject(g(payload, "data"), "$.data", dataFields, dataFields, errors);
  const data = Object.fromEntries(DATA_KEYS.map((key) => [key, g(dataObject, key, [])]));
  const series = validateSeries(data.series, sourceSet, errors);
  const values = validateValues(data.values, sourceSet, errors);
  const levels = validateLevels(data.levels, sourceSet, errors);
  const events = validateEvents(data.events, sourceSet, errors);
  const nodes = validateNodes(data.nodes, sourceSet, errors);
  const edges = validateEdges(data.edges, nodes, sourceSet, errors);
  const rails = validateRails(data.rails, sourceSet, errors);
  const stages = validateStages(data.stages, sourceSet, errors);
  const validatedData = { series, values, levels, events, nodes, edges, rails, stages };
  if (GRAMMARS.has(grammar) && SUPPORTED_MODES[grammar].has(payloadMode)) validateGrammar(validatedData, grammar, payloadMode, errors);

  const renderFields = new Set(["layout", "width", "height", "theme", "watermark", "generated_at"]);
  const render = checkObject(g(payload, "render"), "$.render", renderFields, renderFields, errors);
  const expected = { layout: "landscape", width: 720, height: 420, theme: "cuebook_accessible_light", watermark: "Cuebook" };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (g(render, key) !== expectedValue) errors.push(issue("RENDER_CONTRACT", `$.render.${key}`, `Expected ${pyrepr(expectedValue)}.`));
  }
  const generatedAt = parseTime(g(render, "generated_at"), "$.render.generated_at", errors);
  if (cutoff !== null && generatedAt !== null && generatedAt.epoch < cutoff.epoch) errors.push(issue("GENERATED_AT", "$.render.generated_at", "Generation time cannot precede the decision cutoff."));
  validateQuality(g(payload, "quality_report"), state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

function pathParts(value) {
  return value.split("/").filter((part) => part !== "");
}

export function safeAssetPath(ref, root, path, errors) {
  if (!nonempty(ref)) {
    errors.push(issue("ASSET_REF", path, "Asset ref is required."));
    return null;
  }
  const candidate = ref;
  if (isAbsolute(candidate) || pathParts(candidate).includes("..")) {
    errors.push(issue("ASSET_REF", path, "Asset ref must be a safe relative path."));
    return null;
  }
  return join(root, candidate);
}

export function pngDimensions(path) {
  let data;
  try {
    data = readFileSync(path).subarray(0, 24);
  } catch {
    return null;
  }
  if (data.length !== 24 || !data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || data.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function verifyHash(path, expected, hashPath, errors) {
  if (!isFile(path)) {
    errors.push(issue("ASSET_MISSING", hashPath, `Asset does not exist: ${path}.`));
    return null;
  }
  const data = readFileSync(path);
  const observed = `sha256:${createHash("sha256").update(data).digest("hex")}`;
  if (observed !== expected) errors.push(issue("ASSET_HASH", hashPath, "Asset bytes do not match the declared hash."));
  return data;
}

export function validateCanonicalWordmark(svgText, errors) {
  const pattern = /(<g\b(?=[^>]*data-cuebook-wordmark="v1")[^>]*>(.*?)<\/g>)/gsu;
  const matches = [...svgText.matchAll(pattern)];
  if (matches.length !== 1) {
    errors.push(issue("WORDMARK_REQUIRED", "$.asset.svg", "SVG must contain exactly one canonical Cuebook wordmark group."));
    return;
  }
  const match = matches[0], opening = match[1].split(">", 1)[0], body = match[2];
  if (!["data-role=\"brand\"", "transform=\"translate(625 388)\"", `color=\"${CANONICAL_WORDMARK_COLOR}\"`].every((token) => opening.includes(token))) errors.push(issue("WORDMARK_GEOMETRY", "$.asset.svg", "Cuebook wordmark must use the canonical bottom-right geometry and ink color."));
  const paths = [...body.matchAll(/<path d="([^"]+)"/gu)].map((item) => item[1]);
  if (paths.length !== CANONICAL_WORDMARK_PATHS.length || paths.some((item, index) => item !== CANONICAL_WORDMARK_PATHS[index])) errors.push(issue("WORDMARK_PATHS", "$.asset.svg", "Cuebook wordmark paths do not match the canonical product asset."));
  if ((body.match(/fill="currentColor"/gu) || []).length !== CANONICAL_WORDMARK_PATHS.length || body.includes("<text")) errors.push(issue("WORDMARK_FILL", "$.asset.svg", "Cuebook wordmark must be path-only and inherit currentColor."));
  const after = svgText.slice((match.index ?? 0) + match[0].length);
  if (!/^\s*<\/svg>\s*$/u.test(after)) errors.push(issue("WORDMARK_LAYER", "$.asset.svg", "Cuebook wordmark must be the final SVG visual layer."));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateWideHtml(htmlText, errors, fontManifestRef = null) {
  if (!/data-cuebook-visual-contract=["']launch-v1["']/iu.test(htmlText)) errors.push(issue("HTML_CONTRACT", "$.asset.html", "Wide HTML must declare the Cuebook launch visual contract."));
  if (!/data-font-profile=["']cuebook-noi-v1["']/iu.test(htmlText)) errors.push(issue("FONT_PROFILE", "$.asset.html", "Wide HTML must declare the cuebook-noi-v1 font profile."));
  if (!/data-font-license-mode=["']production["']/iu.test(htmlText)) errors.push(issue("FONT_LICENSE_MODE", "$.asset.html", "Wide HTML must use production font license mode."));
  if (fontManifestRef && !new RegExp(`data-font-manifest-ref=["']${escapeRegex(fontManifestRef)}["']`, "iu").test(htmlText)) errors.push(issue("FONT_MANIFEST_REF", "$.asset.html", "Wide HTML does not bind the declared font manifest ref."));
  const match = /<svg\b(?=[^>]*data-cuebook-wordmark=["']v1["'])[^>]*>(.*?)<\/svg>/isu.exec(htmlText);
  if (!match) {
    errors.push(issue("WORDMARK_REQUIRED", "$.asset.html", "Wide HTML must contain the canonical Cuebook wordmark SVG."));
    return;
  }
  const paths = [...match[1].matchAll(/<path\s+d="([^"]+)"/gu)].map((item) => item[1]);
  if (paths.length !== CANONICAL_WORDMARK_PATHS.length || paths.some((item, index) => item !== CANONICAL_WORDMARK_PATHS[index])) errors.push(issue("WORDMARK_PATHS", "$.asset.html", "Wide HTML wordmark paths do not match the canonical product asset."));
  if ((match[1].match(/fill=["']currentColor["']/giu) || []).length !== CANONICAL_WORDMARK_PATHS.length) errors.push(issue("WORDMARK_FILL", "$.asset.html", "Wide HTML wordmark paths must inherit currentColor."));
}

function decodeUtf8(data) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

export function validateProductionFontManifest(data, manifestPath, errors) {
  const text = decodeUtf8(data);
  let manifest;
  try {
    if (text === null) throw new Error("invalid utf8");
    manifest = JSON.parse(text);
  } catch {
    errors.push(issue("FONT_MANIFEST_JSON", "$.asset.font_manifest", "Font manifest must be valid UTF-8 JSON."));
    return;
  }
  if (g(manifest, "schema_version") !== "cuebook-font-assets-v1" || g(manifest, "font_profile_id") !== "cuebook-noi-v1") errors.push(issue("FONT_MANIFEST_PROFILE", "$.asset.font_manifest", "Font manifest must bind cuebook-noi-v1."));
  if (g(manifest, "license_mode") !== "production" || g(manifest, "release_eligible") !== true) errors.push(issue("FONT_MANIFEST_LICENSE", "$.asset.font_manifest", "Font manifest must be release-eligible production material."));
  const licenseRef = pyString(g(manifest, "license_ref") || "");
  if ([...licenseRef].length < 6 || /trial|eval/iu.test(licenseRef)) errors.push(issue("FONT_LICENSE_REF", "$.asset.font_manifest", "Production font manifest needs an opaque non-evaluation license_ref."));
  const cssPath = safeAssetPath(g(manifest, "css_ref"), resolve(manifestPath, ".."), "$.asset.font_manifest.css_ref", errors);
  if (cssPath !== null && HASH_PATTERN.test(pyString(g(manifest, "css_sha256") || ""))) verifyHash(cssPath, g(manifest, "css_sha256"), "$.asset.font_manifest.css_sha256", errors);
  else errors.push(issue("FONT_CSS_HASH", "$.asset.font_manifest.css_sha256", "Font CSS needs a valid SHA-256 hash."));
  const files = g(manifest, "files");
  const weights = Array.isArray(files) ? new Set(files.filter(isObject).map((item) => g(item, "weight"))) : new Set();
  if (!Array.isArray(files) || weights.size !== 4 || ![400, 500, 600, 700].every((weight) => weights.has(weight))) {
    errors.push(issue("FONT_WEIGHTS", "$.asset.font_manifest.files", "Font manifest must bind upright weights 400, 500, 600, and 700."));
    return;
  }
  files.forEach((item, index) => {
    const ref = g(item, "ref");
    if (/trial/iu.test(pyString(ref || "") + pyString(g(item, "source_name") || ""))) errors.push(issue("TRIAL_FONT_RELEASE", `$.asset.font_manifest.files[${index}]`, "Production font manifest cannot reference Trial assets."));
    const fontPath = safeAssetPath(ref, resolve(manifestPath, ".."), `$.asset.font_manifest.files[${index}].ref`, errors);
    if (fontPath !== null && HASH_PATTERN.test(pyString(g(item, "sha256") || ""))) verifyHash(fontPath, g(item, "sha256"), `$.asset.font_manifest.files[${index}].sha256`, errors);
    else errors.push(issue("FONT_ASSET_HASH", `$.asset.font_manifest.files[${index}].sha256`, "Font asset needs a valid SHA-256 hash."));
  });
}

function exactObject(value, expected) {
  if (!isObject(value)) return false;
  const valueKeys = Object.keys(value), expectedKeys = Object.keys(expected);
  return valueKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key) && value[key] === expected[key]);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

export function validateManifest(payload, assetRoot = null) {
  const errors = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  checkObject(payload, "$", MANIFEST_FIELDS, MANIFEST_FIELDS, errors);
  if (g(payload, "schema_version") !== "viewpoint-visual-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-visual-v1."));
  if (!/^VVIS_[A-Za-z0-9_:-]{8,}$/.test(pyString(g(payload, "visual_id") || ""))) errors.push(issue("VISUAL_ID", "$.visual_id", "Invalid viewpoint visual ID."));
  const renderProfile = g(payload, "render_profile");
  const profileContracts = {
    wide_2488: {
      sourceKind: "html",
      specPattern: /^VDIR_[A-Za-z0-9_:-]{8,}$/,
      dimensions: { width: 2488, height: 1056 },
      derivatives: { full: [2488, 1056] },
    },
    legacy_720: {
      sourceKind: "svg",
      specPattern: /^VVSPEC_[A-Za-z0-9_:-]{8,}$/,
      dimensions: { width: 720, height: 420 },
      derivatives: { full: [720, 420], compact_360: [360, 210] },
    },
  };
  const profileContract = profileContracts[renderProfile] ?? null;
  if (profileContract === null) errors.push(issue("RENDER_PROFILE", "$.render_profile", "Expected wide_2488 or legacy_720."));
  else if (!profileContract.specPattern.test(pyString(g(payload, "spec_ref") || ""))) errors.push(issue("SPEC_REF", "$.spec_ref", `Invalid source ref for ${renderProfile}.`));
  const grammar = g(payload, "grammar"), payloadMode = g(payload, "payload_mode");
  if (renderProfile === "wide_2488") {
    if (!WIDE_GRAMMARS.has(grammar)) errors.push(issue("GRAMMAR", "$.grammar", "Unsupported wide viewpoint argument pattern."));
    if (g(payload, "visual_job") !== "render_selected_direction") errors.push(issue("VISUAL_JOB", "$.visual_job", "Wide viewpoints render the selected HTML direction."));
    if (!new Set(["qualitative", "key_numbers", "series", "mixed"]).has(payloadMode)) errors.push(issue("PAYLOAD_MODE", "$.payload_mode", "Unsupported wide viewpoint payload mode."));
  } else if (!GRAMMARS.has(grammar)) errors.push(issue("GRAMMAR", "$.grammar", "Unsupported legacy viewpoint grammar."));
  else {
    if (g(payload, "visual_job") !== GRAMMAR_JOBS[grammar]) errors.push(issue("VISUAL_JOB", "$.visual_job", "Visual job does not match grammar."));
    if (!SUPPORTED_MODES[grammar].has(payloadMode)) errors.push(issue("PAYLOAD_MODE", "$.payload_mode", "Payload mode is not supported by this grammar."));
  }
  const state = g(payload, "state");
  if (!STATES.has(state)) errors.push(issue("STATE", "$.state", "Unsupported state."));
  parseTime(g(payload, "generated_at"), "$.generated_at", errors);
  const dimensionFields = new Set(["width", "height"]);
  const dimensions = checkObject(g(payload, "dimensions"), "$.dimensions", dimensionFields, dimensionFields, errors);
  if (profileContract !== null && !exactObject(dimensions, profileContract.dimensions)) errors.push(issue("DIMENSIONS", "$.dimensions", `${renderProfile} visuals use ${profileContract.dimensions.width} x ${profileContract.dimensions.height}.`));
  const theme = g(payload, "theme");
  if (renderProfile === "wide_2488") {
    if (typeof theme !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/.test(theme)) errors.push(issue("THEME", "$.theme", "Wide viewpoints bind a registered lowercase hyphenated palette preset."));
  } else if (theme !== "cuebook_accessible_light") errors.push(issue("THEME", "$.theme", "Legacy viewpoints use cuebook_accessible_light."));

  const lineageFields = new Set(["input_artifact_refs", "source_refs", "series_refs", "value_refs", "level_refs", "event_refs", "node_refs", "edge_refs", "rail_refs", "stage_refs", "decision_cutoff_at"]);
  const lineage = checkObject(g(payload, "lineage"), "$.lineage", lineageFields, lineageFields, errors);
  stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors, { minimum: 1 });
  stringList(g(lineage, "source_refs"), "$.lineage.source_refs", errors, { minimum: 1 });
  for (const key of ["series_refs", "value_refs", "level_refs", "event_refs", "node_refs", "edge_refs", "rail_refs", "stage_refs"]) stringList(g(lineage, key), `$.lineage.${key}`, errors);
  parseTime(g(lineage, "decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors);

  const contentFields = new Set(["headline", "observation", "observed_at", "strategy_tags", "alt_text", "watermark"]);
  const content = checkObject(g(payload, "content"), "$.content", contentFields, contentFields, errors);
  publicText(g(content, "headline"), "$.content.headline", errors, { maximum: 96, units: 84 });
  publicText(g(content, "observation"), "$.content.observation", errors, { maximum: 120, units: 120 });
  parseTime(g(content, "observed_at"), "$.content.observed_at", errors);
  const tags = stringList(g(content, "strategy_tags"), "$.content.strategy_tags", errors, { minimum: 1, maximum: 4 });
  tags.forEach((tag, index) => publicText(tag, `$.content.strategy_tags[${index}]`, errors, { maximum: 20, units: 18 }));
  publicText(g(content, "alt_text"), "$.content.alt_text", errors, { maximum: 320 });
  if (g(content, "watermark") !== "Cuebook") errors.push(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."));

  const assetFields = new Set(["html", "svg", "font_manifest", "png_derivatives", "derivative_bundle_hash"]);
  const requiredAssetFields = renderProfile === "wide_2488" ? assetFields : setDifference(assetFields, new Set(["font_manifest"]));
  const asset = checkObject(g(payload, "asset"), "$.asset", requiredAssetFields, assetFields, errors);
  const sourceKind = profileContract !== null ? profileContract.sourceKind : "html";
  const alternateKind = sourceKind === "html" ? "svg" : "html";
  const sourceFields = new Set(["ref", "sha256"]);
  const primaryAsset = checkObject(g(asset, sourceKind), `$.asset.${sourceKind}`, sourceFields, sourceFields, errors);
  if (g(asset, alternateKind) !== null) errors.push(issue("ASSET_PROFILE", `$.asset.${alternateKind}`, `${pyString(renderProfile)} must not bind a ${alternateKind.toUpperCase()} source asset.`));
  if (!HASH_PATTERN.test(pyString(g(primaryAsset, "sha256") || ""))) errors.push(issue("ASSET_HASH_FORMAT", `$.asset.${sourceKind}.sha256`, "Expected sha256:<64 lowercase hex characters>."));
  let fontManifestAsset = {};
  if (renderProfile === "wide_2488") {
    fontManifestAsset = checkObject(g(asset, "font_manifest"), "$.asset.font_manifest", sourceFields, sourceFields, errors);
    if (!HASH_PATTERN.test(pyString(g(fontManifestAsset, "sha256") || ""))) errors.push(issue("ASSET_HASH_FORMAT", "$.asset.font_manifest.sha256", "Expected sha256:<64 lowercase hex characters>."));
  }
  let derivatives = g(asset, "png_derivatives");
  const expectedSizes = profileContract !== null ? profileContract.derivatives : {};
  const expectedDerivativeCount = Object.keys(expectedSizes).length;
  if (!Array.isArray(derivatives) || !new Set([0, expectedDerivativeCount]).has(derivatives.length)) {
    errors.push(issue("DERIVATIVE_SET", "$.asset.png_derivatives", `PNG outputs must be absent or contain the complete ${renderProfile} set.`));
    derivatives = [];
  }
  if (renderProfile === "wide_2488" && derivatives.length === 0) errors.push(issue("DERIVATIVE_REQUIRED", "$.asset.png_derivatives", "The launch wide profile requires its publication master."));
  const seenKinds = new Set(), parsedDerivatives = [];
  derivatives.forEach((item, index) => {
    const path = `$.asset.png_derivatives[${index}]`;
    const fields = new Set(["kind", "ref", "width", "height", "sha256"]);
    const derivative = checkObject(item, path, fields, fields, errors);
    const kind = g(derivative, "kind");
    if (!Object.hasOwn(expectedSizes, kind) || seenKinds.has(kind)) {
      errors.push(issue("DERIVATIVE_KIND", `${path}.kind`, `Expected exactly the ${Object.keys(expectedSizes).join(", ")} output set.`));
    } else {
      seenKinds.add(kind);
      if (g(derivative, "width") !== expectedSizes[kind][0] || g(derivative, "height") !== expectedSizes[kind][1]) errors.push(issue("DERIVATIVE_DIMENSIONS", path, `${kind} must use ${expectedSizes[kind][0]} x ${expectedSizes[kind][1]}.`));
    }
    if (!HASH_PATTERN.test(pyString(g(derivative, "sha256") || ""))) errors.push(issue("ASSET_HASH_FORMAT", `${path}.sha256`, "Expected sha256:<64 lowercase hex characters>."));
    parsedDerivatives.push(derivative);
  });
  const bundleHash = g(asset, "derivative_bundle_hash");
  if (derivatives.length && !HASH_PATTERN.test(pyString(bundleHash || ""))) errors.push(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Completed derivatives require a bundle hash."));
  if (!derivatives.length && bundleHash !== null) errors.push(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Bundle hash must be null without derivatives."));

  if (assetRoot !== null) {
    if (renderProfile === "wide_2488") {
      const fontManifestPath = safeAssetPath(g(fontManifestAsset, "ref"), assetRoot, "$.asset.font_manifest.ref", errors);
      if (fontManifestPath !== null && HASH_PATTERN.test(pyString(g(fontManifestAsset, "sha256") || ""))) {
        const fontManifestData = verifyHash(fontManifestPath, g(fontManifestAsset, "sha256"), "$.asset.font_manifest.sha256", errors);
        if (fontManifestData !== null) validateProductionFontManifest(fontManifestData, fontManifestPath, errors);
      }
    }
    const primaryPath = safeAssetPath(g(primaryAsset, "ref"), assetRoot, `$.asset.${sourceKind}.ref`, errors);
    if (primaryPath !== null && HASH_PATTERN.test(pyString(g(primaryAsset, "sha256") || ""))) {
      const primaryData = verifyHash(primaryPath, g(primaryAsset, "sha256"), `$.asset.${sourceKind}.sha256`, errors);
      if (primaryData !== null) {
        const sourceText = decodeUtf8(primaryData);
        if (sourceText === null) errors.push(issue("ASSET_ENCODING", `$.asset.${sourceKind}.ref`, `${sourceKind.toUpperCase()} asset must be UTF-8.`));
        else if (sourceKind === "html") validateWideHtml(sourceText, errors, pyString(g(fontManifestAsset, "ref") || ""));
        else validateCanonicalWordmark(sourceText, errors);
      }
    }
    const bytesByKind = new Map();
    parsedDerivatives.forEach((derivative, index) => {
      const path = safeAssetPath(g(derivative, "ref"), assetRoot, `$.asset.png_derivatives[${index}].ref`, errors);
      if (path === null) return;
      const data = verifyHash(path, g(derivative, "sha256"), `$.asset.png_derivatives[${index}].sha256`, errors);
      const kind = g(derivative, "kind"), expectedSize = expectedSizes[kind];
      const observedSize = pngDimensions(path);
      if (expectedSize !== undefined && (observedSize === null || observedSize[0] !== expectedSize[0] || observedSize[1] !== expectedSize[1])) errors.push(issue("PNG_DIMENSIONS", `$.asset.png_derivatives[${index}]`, "PNG bytes do not match declared dimensions."));
      if (data !== null && Object.hasOwn(expectedSizes, kind)) bytesByKind.set(kind, data);
    });
    const expectedKinds = new Set(Object.keys(expectedSizes));
    if (sameSet(new Set(bytesByKind.keys()), expectedKinds) && HASH_PATTERN.test(pyString(bundleHash || ""))) {
      const observedBundle = `sha256:${createHash("sha256").update(Buffer.concat(Object.keys(expectedSizes).map((kind) => bytesByKind.get(kind)))).digest("hex")}`;
      if (observedBundle !== bundleHash) errors.push(issue("DERIVATIVE_BUNDLE_HASH", "$.asset.derivative_bundle_hash", "Derivative bytes do not match the bundle hash."));
    }
  }
  validateQuality(g(payload, "quality_report"), state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validate(payload, assetRoot = null) {
  if (isObject(payload) && g(payload, "schema_version") === "viewpoint-visual-v1") return validateManifest(payload, assetRoot);
  return validateSpec(payload);
}

function parseCli(argv) {
  let artifact = null, assetRoot = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--asset-root") {
      assetRoot = argv[index + 1] ?? null;
      index += 1;
    } else if (artifact === null) artifact = argv[index];
  }
  return { artifact, assetRoot };
}

export function main(argv = process.argv.slice(2)) {
  const { artifact, assetRoot } = parseCli(argv);
  let result;
  try {
    if (artifact === null) throw new Error("the following arguments are required: artifact");
    const payload = JSON.parse(readFileSync(artifact, "utf8"));
    result = validate(payload, assetRoot);
  } catch (error) {
    result = { valid: false, errors: [issue("LOAD", "$", error.message)], warnings: [] };
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
