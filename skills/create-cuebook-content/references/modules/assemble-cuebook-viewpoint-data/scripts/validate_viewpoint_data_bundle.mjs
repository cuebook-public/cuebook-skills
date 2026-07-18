#!/usr/bin/env node
// Validate ViewpointDataBundleV1 cutoff, references, data geometry, and fallbacks.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { pyFromIsoformat } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

const ROOT_REQUIRED_FIELDS = new Set([
  "schema_version", "bundle_id", "revision", "state", "temporal_mode",
  "lineage", "request", "instruments", "series", "key_values", "events",
  "levels", "formulas", "requirements", "render_payload", "quality_report",
]);
const ROOT_FIELDS = new Set([...ROOT_REQUIRED_FIELDS, "evidence_objects"]);
const REQUEST_CLASSES = new Set([
  "qualitative_evidence", "news_anchor", "official_event", "valuation_metric",
  "comparison_metric", "market_series", "price_level", "settlement_reference",
]);
const NON_DEGRADABLE_MATERIAL_CLASSES = new Set([
  "news_anchor", "valuation_metric", "comparison_metric", "price_level", "settlement_reference",
]);
const EXPRESSION_SURFACES = new Set(["text", "visual"]);
const SERIES_KINDS = new Set([
  "ohlcv", "price", "return", "spread", "flow", "estimate",
  "fundamental", "factor", "positioning", "volume",
]);
export const EVIDENCE_SHAPES = new Set([
  "news_cluster", "distribution_sample", "quantile_scenarios", "part_to_whole",
  "additive_components", "quantified_flow", "ordered_categories", "payoff_series",
]);
const DATA_KINDS = new Set([...SERIES_KINDS, "key_value", "event", "level", "formula", ...EVIDENCE_SHAPES]);
const DATA_KINDS_BY_REQUEST_CLASS = new Map([
  ["qualitative_evidence", DATA_KINDS],
  ["news_anchor", new Set(["event", "news_cluster"])],
  ["official_event", new Set(["event"])],
  ["valuation_metric", new Set(["key_value"])],
  ["comparison_metric", new Set([
    ...SERIES_KINDS, "key_value", "distribution_sample", "part_to_whole",
    "additive_components", "quantified_flow", "ordered_categories", "payoff_series",
  ])],
  ["market_series", new Set([
    ...SERIES_KINDS, "distribution_sample", "quantile_scenarios",
    "additive_components", "quantified_flow", "payoff_series",
  ])],
  ["price_level", new Set(["level"])],
  ["settlement_reference", new Set(["event", "key_value", "level"])],
]);
const SOURCE_TYPES = new Set([
  "issuer", "regulator", "exchange", "government", "filing",
  "newswire", "publisher", "market_data", "creator_source",
]);
const OFFICIAL_SOURCE_TYPES = new Set(["issuer", "regulator", "exchange", "government", "filing"]);
const EVENT_ROLES = new Set([
  "catalyst", "decision_cutoff", "deadline", "news", "policy",
  "earnings", "listing", "trade_action",
]);
const LEVEL_KINDS = new Set([
  "support", "resistance", "trigger", "invalidation", "target", "benchmark", "range_boundary",
]);
const EVENT_FIELDS = new Set([
  "event_id", "label", "at", "available_at", "source_ref", "publisher_or_issuer",
  "source_type", "source_url", "supported_fact_refs", "role",
]);
const LEVEL_FIELDS = new Set([
  "level_id", "label", "instrument_ref", "value", "unit", "kind",
  "source_ref", "fact_refs", "observed_at", "available_at", "explicit",
]);
const EVIDENCE_OBJECT_FIELDS = new Set([
  "evidence_id", "shape", "label", "state", "as_of", "available_at",
  "source_refs", "formula_ref", "payload",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function g(value, key, fallback = null) {
  return isObject(value) && Object.hasOwn(value, key) ? value[key] : fallback;
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isObject(value)) return pyRepr(value);
  return String(value);
}

function pyStrOrEmpty(value) {
  return pyTruthy(value) ? pyStr(value) : "";
}

function pyRepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const hasSingle = value.includes("'");
    const hasDouble = value.includes('"');
    const quote = hasSingle && !hasDouble ? '"' : "'";
    let output = quote;
    for (const character of value) {
      if (character === "\\") output += "\\\\";
      else if (character === quote) output += `\\${quote}`;
      else if (character === "\n") output += "\\n";
      else if (character === "\r") output += "\\r";
      else if (character === "\t") output += "\\t";
      else output += character;
    }
    return `${output}${quote}`;
  }
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isObject(value)) return `{${Object.entries(value).map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`).join(", ")}}`;
  return String(value);
}

function pyInt(value) {
  return typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value));
}

function pyNumber(value) {
  return typeof value === "boolean" ? Number(value) : value;
}

function pyEquals(left, right) {
  if (
    (typeof left === "boolean" || typeof left === "number")
    && (typeof right === "boolean" || typeof right === "number")
  ) return Number(left) === Number(right);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => pyEquals(value, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && pyEquals(left[key], right[key]));
  }
  return left === right;
}

function setEquals(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function setSubset(left, right) {
  return [...left].every((value) => right.has(value));
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function stringList(value, path, errors, { minimum = 0, maximum = null } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const clean = [];
  value.forEach((item, position) => {
    if (!nonempty(item)) errors.push(issue("STRING_ITEM", `${path}[${position}]`, "Expected a non-empty string."));
    else clean.push(item.trim());
  });
  if (clean.length !== new Set(clean).size) errors.push(issue("STRING_UNIQUE", path, "Strings must be unique."));
  if (clean.length < minimum) errors.push(issue("STRING_MIN", path, `Expected at least ${minimum} item(s).`));
  if (maximum !== null && clean.length > maximum) errors.push(issue("STRING_MAX", path, `Expected at most ${maximum} item(s).`));
  return clean;
}

export function validateShape(value, path, required, allowed, errors) {
  const keys = new Set(Object.keys(value));
  for (const key of sorted([...required].filter((field) => !keys.has(field)))) {
    errors.push(issue("MISSING_FIELD", `${path}.${key}`, "Required field is missing."));
  }
  for (const key of sorted([...keys].filter((field) => !allowed.has(field)))) {
    errors.push(issue("UNKNOWN_FIELD", `${path}.${key}`, "Unknown field."));
  }
}

export function parseTime(value, path, errors) {
  if (typeof value !== "string" || !value) {
    errors.push(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."));
    return null;
  }
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("TIME_FORMAT", path, "Invalid ISO timestamp."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."));
    return null;
  }
  return parsed;
}

export function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function numericList(value, path, errors, { minimum = 1 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("NUMBER_LIST", path, "Expected an array of finite numbers."));
    return [];
  }
  const clean = [];
  value.forEach((item, position) => {
    if (!finite(item)) errors.push(issue("NUMBER_ITEM", `${path}[${position}]`, "Expected a finite number."));
    else clean.push(Number(item));
  });
  if (clean.length < minimum) errors.push(issue("NUMBER_MIN", path, `Expected at least ${minimum} number(s).`));
  return clean;
}

export function reconciles(left, right) {
  return Math.abs(left - right) <= Math.max(1e-6 * Math.max(Math.abs(left), Math.abs(right)), 1e-9);
}

function sameNumberArray(left, right) {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]) || value === right[index]);
}

export function validateEvidenceObject(
  item,
  path,
  {
    eventIndex,
    instrumentIndex,
    formulaIndex,
    requestGrammar,
    bundleAsOf,
    errors,
    warnings,
  },
) {
  validateShape(item, path, EVIDENCE_OBJECT_FIELDS, EVIDENCE_OBJECT_FIELDS, errors);
  let shape = g(item, "shape");
  if (!EVIDENCE_SHAPES.has(shape)) {
    errors.push(issue("EVIDENCE_SHAPE", `${path}.shape`, "Unsupported structured evidence shape."));
    shape = null;
  }
  if (!nonempty(g(item, "label"))) errors.push(issue("EVIDENCE_LABEL", `${path}.label`, "Evidence label is required."));
  const state = g(item, "state");
  if (!new Set(["observed", "derived", "modeled", "conditional"]).has(state)) {
    errors.push(issue("EVIDENCE_STATE", `${path}.state`, "Unsupported evidence state."));
  }
  const objectAsOf = parseTime(g(item, "as_of"), `${path}.as_of`, errors);
  if (objectAsOf && bundleAsOf && objectAsOf.epoch > bundleAsOf.epoch) {
    errors.push(issue("EVIDENCE_AFTER_AS_OF", `${path}.as_of`, "Evidence as_of cannot be after the bundle as_of."));
  }
  const available = parseTime(g(item, "available_at"), `${path}.available_at`, errors);
  const sourceRefs = stringList(g(item, "source_refs"), `${path}.source_refs`, errors, { minimum: 1 });
  const formulaRef = g(item, "formula_ref");
  if (formulaRef !== null && !formulaIndex.has(formulaRef)) {
    errors.push(issue("UNKNOWN_FORMULA", `${path}.formula_ref`, `Unknown formula ${pyRepr(formulaRef)}.`));
  }
  if (new Set(["quantile_scenarios", "payoff_series"]).has(shape) && !formulaIndex.has(formulaRef)) {
    errors.push(issue("EVIDENCE_FORMULA_REQUIRED", `${path}.formula_ref`, `${shape} requires a declared formula.`));
  }
  if (
    new Set(["derived", "modeled"]).has(state)
    && new Set(["distribution_sample", "part_to_whole", "additive_components", "quantified_flow"]).has(shape)
    && !formulaIndex.has(formulaRef)
  ) {
    errors.push(issue("EVIDENCE_FORMULA_REQUIRED", `${path}.formula_ref`, `Derived ${shape} evidence requires a declared formula.`));
  }
  if (shape === "quantile_scenarios" && !new Set(["modeled", "conditional"]).has(state)) {
    errors.push(issue("QUANTILE_STATE", `${path}.state`, "Quantile scenarios must be labeled modeled or conditional."));
  }

  const payload = g(item, "payload");
  if (!isObject(payload)) {
    errors.push(issue("EVIDENCE_PAYLOAD", `${path}.payload`, "Evidence payload must be an object."));
    return [available, shape];
  }
  const payloadShape = (required) => validateShape(payload, `${path}.payload`, required, required, errors);

  if (shape === "news_cluster") {
    const fields = new Set(["cluster_id", "event_refs", "cluster_method", "unique_source_count"]);
    payloadShape(fields);
    for (const key of ["cluster_id", "cluster_method"]) {
      if (!nonempty(g(payload, key))) errors.push(issue("NEWS_CLUSTER_FIELD", `${path}.payload.${key}`, `${key} is required.`));
    }
    const eventRefs = stringList(g(payload, "event_refs"), `${path}.payload.event_refs`, errors, { minimum: 2 });
    const resolvedEvents = eventRefs.filter((ref) => eventIndex.has(ref)).map((ref) => eventIndex.get(ref));
    for (const ref of eventRefs) {
      if (!eventIndex.has(ref)) errors.push(issue("NEWS_CLUSTER_EVENT", `${path}.payload.event_refs`, `Unknown event ${pyRepr(ref)}.`));
    }
    const qualifying = resolvedEvents.filter((event) => (
      nonempty(g(event, "publisher_or_issuer"))
      && nonempty(g(event, "source_url"))
      && pyTruthy(g(event, "supported_fact_refs"))
    ));
    if (qualifying.length !== resolvedEvents.length) {
      errors.push(issue("NEWS_CLUSTER_PROVENANCE", `${path}.payload.event_refs`, "Every clustered event needs publisher, URL, and supported fact refs."));
    }
    const eventSources = new Set(resolvedEvents.map((event) => g(event, "source_ref")).filter(nonempty));
    const uniqueSourceCount = g(payload, "unique_source_count");
    if (!Number.isInteger(uniqueSourceCount) || typeof uniqueSourceCount === "boolean" || uniqueSourceCount < 2) {
      errors.push(issue("NEWS_CLUSTER_SOURCE_COUNT", `${path}.payload.unique_source_count`, "unique_source_count must be an integer of at least 2."));
    } else if (uniqueSourceCount !== eventSources.size) {
      errors.push(issue("NEWS_CLUSTER_SOURCE_COUNT", `${path}.payload.unique_source_count`, "unique_source_count must equal the deduplicated event source count."));
    }
    if (!setSubset(eventSources, new Set(sourceRefs))) {
      errors.push(issue("NEWS_CLUSTER_SOURCE_REFS", `${path}.source_refs`, "Evidence source_refs must include every clustered event source."));
    }
  } else if (shape === "distribution_sample") {
    const fields = new Set([
      "observations", "n", "observation_unit", "unit", "window", "population",
      "weights", "quartile_method", "whisker_rule", "outlier_policy",
    ]);
    payloadShape(fields);
    const observations = numericList(g(payload, "observations"), `${path}.payload.observations`, errors, { minimum: 2 });
    if (!pyEquals(g(payload, "n"), observations.length)) {
      errors.push(issue("DISTRIBUTION_N", `${path}.payload.n`, "n must equal the number of observations."));
    }
    for (const key of ["observation_unit", "unit", "window", "population", "weights", "quartile_method", "whisker_rule", "outlier_policy"]) {
      if (!nonempty(g(payload, key))) errors.push(issue("DISTRIBUTION_FIELD", `${path}.payload.${key}`, `${key} is required.`));
    }
    if (requestGrammar === "box_whisker" && observations.length < 5) {
      errors.push(issue("BOX_SAMPLE_TOO_SMALL", `${path}.payload.observations`, "A box-and-whisker view needs at least five observations."));
    } else if (requestGrammar === "box_whisker" && observations.length < 20) {
      warnings.push(issue("BOX_SHOW_RAW_DOTS", `${path}.payload.observations`, "Show raw observations alongside a box summary when n is below 20."));
    }
  } else if (shape === "quantile_scenarios") {
    const fields = new Set([
      "cutoff", "horizon", "quantile_levels", "quantile_values", "unit",
      "model_or_method", "model_vintage", "calibration",
    ]);
    payloadShape(fields);
    const quantileCutoff = parseTime(g(payload, "cutoff"), `${path}.payload.cutoff`, errors);
    for (const key of ["horizon", "unit", "model_or_method", "model_vintage", "calibration"]) {
      if (!nonempty(g(payload, key))) errors.push(issue("QUANTILE_FIELD", `${path}.payload.${key}`, `${key} is required.`));
    }
    const levels = numericList(g(payload, "quantile_levels"), `${path}.payload.quantile_levels`, errors, { minimum: 3 });
    const sortedLevels = [...new Set(levels)].sort((left, right) => left - right);
    if (levels.length && (!sameNumberArray(levels, sortedLevels) || levels[0] <= 0 || levels.at(-1) >= 1)) {
      errors.push(issue("QUANTILE_LEVELS", `${path}.payload.quantile_levels`, "Quantile levels must be unique, increasing, and strictly between 0 and 1."));
    }
    const rows = g(payload, "quantile_values");
    if (!Array.isArray(rows) || !rows.length) {
      errors.push(issue("QUANTILE_VALUES", `${path}.payload.quantile_values`, "Quantile values require at least one future row."));
    } else {
      let priorT = null;
      rows.forEach((row, position) => {
        const rowPath = `${path}.payload.quantile_values[${position}]`;
        if (!isObject(row)) {
          errors.push(issue("QUANTILE_ROW", rowPath, "Quantile row must be an object."));
          return;
        }
        const rowFields = new Set(["t", "values"]);
        validateShape(row, rowPath, rowFields, rowFields, errors);
        const rowT = parseTime(g(row, "t"), `${rowPath}.t`, errors);
        const rowValues = numericList(g(row, "values"), `${rowPath}.values`, errors, { minimum: levels.length || 1 });
        if (levels.length && rowValues.length !== levels.length) errors.push(issue("QUANTILE_WIDTH", `${rowPath}.values`, "Each row must provide one value per quantile level."));
        if (rowValues.length && !sameNumberArray(rowValues, [...rowValues].sort((left, right) => left - right))) {
          errors.push(issue("QUANTILE_CROSSING", `${rowPath}.values`, "Quantile values must be non-decreasing within each row."));
        }
        if (rowT && quantileCutoff && rowT.epoch <= quantileCutoff.epoch) errors.push(issue("QUANTILE_BEFORE_CUTOFF", `${rowPath}.t`, "Fan observations must begin after the declared cutoff."));
        if (rowT && priorT && rowT.epoch <= priorT.epoch) errors.push(issue("QUANTILE_TIME_ORDER", `${rowPath}.t`, "Quantile row times must be strictly increasing."));
        if (rowT) priorT = rowT;
      });
    }
  } else if (shape === "part_to_whole") {
    const fields = new Set(["parts", "denominator", "unit", "basis", "residual"]);
    payloadShape(fields);
    const parts = g(payload, "parts");
    let partTotal = 0;
    if (!Array.isArray(parts) || parts.length < 2) {
      errors.push(issue("PARTS_REQUIRED", `${path}.payload.parts`, "Part-to-whole evidence needs at least two parts."));
    } else {
      const labels = [];
      parts.forEach((part, position) => {
        const partPath = `${path}.payload.parts[${position}]`;
        if (!isObject(part)) {
          errors.push(issue("PART_TYPE", partPath, "Part must be an object."));
          return;
        }
        const partFields = new Set(["label", "value"]);
        validateShape(part, partPath, partFields, partFields, errors);
        if (!nonempty(g(part, "label"))) errors.push(issue("PART_LABEL", `${partPath}.label`, "Part label is required."));
        else labels.push(g(part, "label").trim());
        const value = g(part, "value");
        if (!finite(value) || value < 0) errors.push(issue("PART_VALUE", `${partPath}.value`, "Part value must be finite and non-negative."));
        else partTotal += Number(value);
      });
      if (labels.length !== new Set(labels).size) errors.push(issue("PART_LABEL_UNIQUE", `${path}.payload.parts`, "Part labels must be unique."));
    }
    const denominator = g(payload, "denominator");
    const residual = g(payload, "residual");
    if (!finite(denominator) || denominator <= 0) errors.push(issue("PART_DENOMINATOR", `${path}.payload.denominator`, "denominator must be positive and finite."));
    if (!finite(residual) || residual < 0) errors.push(issue("PART_RESIDUAL", `${path}.payload.residual`, "residual must be finite and non-negative."));
    if (finite(denominator) && finite(residual) && !reconciles(partTotal + Number(residual), Number(denominator))) {
      errors.push(issue("PART_RECONCILIATION", `${path}.payload`, "Parts plus residual must reconcile to the denominator."));
    }
    for (const key of ["unit", "basis"]) if (!nonempty(g(payload, key))) errors.push(issue("PART_FIELD", `${path}.payload.${key}`, `${key} is required.`));
  } else if (shape === "additive_components") {
    const fields = new Set(["start", "components", "end", "unit", "period", "residual"]);
    payloadShape(fields);
    const components = g(payload, "components");
    let componentTotal = 0;
    if (!Array.isArray(components) || !components.length) {
      errors.push(issue("COMPONENTS_REQUIRED", `${path}.payload.components`, "Additive evidence needs at least one component."));
    } else {
      components.forEach((component, position) => {
        const componentPath = `${path}.payload.components[${position}]`;
        if (!isObject(component)) {
          errors.push(issue("COMPONENT_TYPE", componentPath, "Component must be an object."));
          return;
        }
        const componentFields = new Set(["label", "value"]);
        validateShape(component, componentPath, componentFields, componentFields, errors);
        if (!nonempty(g(component, "label"))) errors.push(issue("COMPONENT_LABEL", `${componentPath}.label`, "Component label is required."));
        if (!finite(g(component, "value"))) errors.push(issue("COMPONENT_VALUE", `${componentPath}.value`, "Component value must be finite."));
        else componentTotal += Number(g(component, "value"));
      });
    }
    const start = g(payload, "start"), end = g(payload, "end"), residual = g(payload, "residual");
    for (const [key, value] of [["start", start], ["end", end], ["residual", residual]]) {
      if (!finite(value)) errors.push(issue("BRIDGE_VALUE", `${path}.payload.${key}`, `${key} must be finite.`));
    }
    if ([start, end, residual].every(finite) && !reconciles(Number(start) + componentTotal + Number(residual), Number(end))) {
      errors.push(issue("BRIDGE_RECONCILIATION", `${path}.payload`, "Start, components, and residual must reconcile to end."));
    }
    for (const key of ["unit", "period"]) if (!nonempty(g(payload, key))) errors.push(issue("BRIDGE_FIELD", `${path}.payload.${key}`, `${key} is required.`));
  } else if (shape === "quantified_flow") {
    const fields = new Set(["edges", "unit", "window", "residual", "declared_total"]);
    payloadShape(fields);
    const edges = g(payload, "edges");
    let edgeTotal = 0;
    const edgeKeys = [];
    if (!Array.isArray(edges) || !edges.length) {
      errors.push(issue("FLOW_EDGES", `${path}.payload.edges`, "Quantified flow needs at least one edge."));
    } else {
      edges.forEach((edge, position) => {
        const edgePath = `${path}.payload.edges[${position}]`;
        if (!isObject(edge)) {
          errors.push(issue("FLOW_EDGE_TYPE", edgePath, "Flow edge must be an object."));
          return;
        }
        const edgeFields = new Set(["origin", "destination", "value"]);
        validateShape(edge, edgePath, edgeFields, edgeFields, errors);
        const origin = g(edge, "origin"), destination = g(edge, "destination");
        if (!nonempty(origin) || !nonempty(destination) || origin === destination) errors.push(issue("FLOW_EDGE_ENDPOINT", edgePath, "Flow edge needs distinct origin and destination labels."));
        else edgeKeys.push(`${origin.trim()}\u0000${destination.trim()}`);
        const value = g(edge, "value");
        if (!finite(value) || value < 0) errors.push(issue("FLOW_EDGE_VALUE", `${edgePath}.value`, "Flow value must be finite and non-negative."));
        else edgeTotal += Number(value);
      });
      if (edgeKeys.length !== new Set(edgeKeys).size) errors.push(issue("FLOW_EDGE_UNIQUE", `${path}.payload.edges`, "Flow edges must be unique."));
    }
    const residual = g(payload, "residual"), declaredTotal = g(payload, "declared_total");
    if (!finite(residual) || residual < 0) errors.push(issue("FLOW_RESIDUAL", `${path}.payload.residual`, "Flow residual must be finite and non-negative."));
    if (!finite(declaredTotal) || declaredTotal < 0) errors.push(issue("FLOW_TOTAL", `${path}.payload.declared_total`, "Declared total must be finite and non-negative."));
    if (finite(residual) && finite(declaredTotal) && !reconciles(edgeTotal + Number(residual), Number(declaredTotal))) {
      errors.push(issue("FLOW_RECONCILIATION", `${path}.payload`, "Measured edges plus residual must reconcile to the declared total."));
    }
    for (const key of ["unit", "window"]) if (!nonempty(g(payload, key))) errors.push(issue("FLOW_FIELD", `${path}.payload.${key}`, `${key} is required.`));
  } else if (shape === "ordered_categories") {
    const fields = new Set(["items", "order_basis"]);
    payloadShape(fields);
    if (!nonempty(g(payload, "order_basis"))) errors.push(issue("CATEGORY_ORDER", `${path}.payload.order_basis`, "order_basis is required."));
    const items = g(payload, "items");
    if (!Array.isArray(items) || items.length < 2) {
      errors.push(issue("CATEGORY_ITEMS", `${path}.payload.items`, "Ordered categories need at least two items."));
    } else {
      const labels = [];
      items.forEach((category, position) => {
        const categoryPath = `${path}.payload.items[${position}]`;
        if (!isObject(category)) {
          errors.push(issue("CATEGORY_TYPE", categoryPath, "Category must be an object."));
          return;
        }
        const categoryFields = new Set(["label", "state", "source_refs"]);
        validateShape(category, categoryPath, categoryFields, categoryFields, errors);
        if (nonempty(g(category, "label"))) labels.push(g(category, "label").trim());
        else errors.push(issue("CATEGORY_LABEL", `${categoryPath}.label`, "Category label is required."));
        if (!new Set(["observed", "derived", "conditional"]).has(g(category, "state"))) errors.push(issue("CATEGORY_STATE", `${categoryPath}.state`, "Unsupported category state."));
        const categorySources = stringList(g(category, "source_refs"), `${categoryPath}.source_refs`, errors, { minimum: 1 });
        if (!setSubset(new Set(categorySources), new Set(sourceRefs))) errors.push(issue("NESTED_SOURCE_CLOSURE", `${categoryPath}.source_refs`, "Nested source refs must be declared by the evidence object."));
      });
      if (labels.length !== new Set(labels).size) errors.push(issue("CATEGORY_LABEL_UNIQUE", `${path}.payload.items`, "Category labels must be unique."));
    }
  } else if (shape === "payoff_series") {
    const fields = new Set(["instrument_terms", "underlying_domain", "calculation_method", "values", "unit"]);
    payloadShape(fields);
    const terms = g(payload, "instrument_terms");
    const termStrikes = [];
    if (!Array.isArray(terms) || !terms.length) {
      errors.push(issue("PAYOFF_TERMS", `${path}.payload.instrument_terms`, "Payoff evidence needs at least one instrument term."));
    } else {
      terms.forEach((term, position) => {
        const termPath = `${path}.payload.instrument_terms[${position}]`;
        if (!isObject(term)) {
          errors.push(issue("PAYOFF_TERM_TYPE", termPath, "Instrument term must be an object."));
          return;
        }
        const termFields = new Set(["instrument_ref", "instrument_type", "side", "strike", "expiry", "quantity", "premium"]);
        validateShape(term, termPath, termFields, termFields, errors);
        if (!instrumentIndex.has(g(term, "instrument_ref"))) errors.push(issue("PAYOFF_INSTRUMENT", `${termPath}.instrument_ref`, "Instrument term must resolve to a bundle instrument."));
        if (!new Set(["equity", "future", "call", "put", "custom"]).has(g(term, "instrument_type"))) errors.push(issue("PAYOFF_INSTRUMENT_TYPE", `${termPath}.instrument_type`, "Unsupported payoff instrument type."));
        if (!new Set(["long", "short"]).has(g(term, "side"))) errors.push(issue("PAYOFF_SIDE", `${termPath}.side`, "Payoff side must be long or short."));
        if (g(term, "strike") !== null && !finite(g(term, "strike"))) errors.push(issue("PAYOFF_TERM_STRIKE", `${termPath}.strike`, "Term strike must be finite or null."));
        else if (finite(g(term, "strike"))) termStrikes.push(Number(g(term, "strike")));
        if (g(term, "expiry") !== null) parseTime(g(term, "expiry"), `${termPath}.expiry`, errors);
        if (new Set(["call", "put"]).has(g(term, "instrument_type")) && (g(term, "strike") === null || g(term, "expiry") === null)) errors.push(issue("PAYOFF_OPTION_TERMS", termPath, "Option terms require both strike and expiry."));
        if (!finite(g(term, "quantity")) || g(term, "quantity") === 0) errors.push(issue("PAYOFF_TERM_QUANTITY", `${termPath}.quantity`, "Term quantity must be finite and non-zero."));
        if (!finite(g(term, "premium")) || g(term, "premium") < 0) errors.push(issue("PAYOFF_TERM_PREMIUM", `${termPath}.premium`, "Term premium must be finite and non-negative."));
      });
    }
    const domain = g(payload, "underlying_domain");
    let domainMin = null, domainMax = null;
    if (!isObject(domain)) {
      errors.push(issue("PAYOFF_DOMAIN", `${path}.payload.underlying_domain`, "Underlying domain must be an object."));
    } else {
      const domainFields = new Set(["min", "max", "unit"]);
      validateShape(domain, `${path}.payload.underlying_domain`, domainFields, domainFields, errors);
      domainMin = g(domain, "min");
      domainMax = g(domain, "max");
      if (!finite(domainMin) || !finite(domainMax) || domainMin >= domainMax) errors.push(issue("PAYOFF_DOMAIN_RANGE", `${path}.payload.underlying_domain`, "Underlying domain needs finite min below max."));
      if (!nonempty(g(domain, "unit"))) errors.push(issue("PAYOFF_DOMAIN_UNIT", `${path}.payload.underlying_domain.unit`, "Underlying domain unit is required."));
      for (const strike of termStrikes) {
        if (finite(domainMin) && finite(domainMax) && !(domainMin <= strike && strike <= domainMax)) errors.push(issue("PAYOFF_STRIKE_DOMAIN", `${path}.payload.instrument_terms`, "Every strike must lie inside the declared underlying domain."));
      }
    }
    const method = g(payload, "calculation_method");
    if (!isObject(method)) {
      errors.push(issue("PAYOFF_METHOD", `${path}.payload.calculation_method`, "calculation_method must be an object."));
    } else {
      const methodFields = new Set(["basis", "model", "assumptions"]);
      validateShape(method, `${path}.payload.calculation_method`, methodFields, methodFields, errors);
      const basis = g(method, "basis");
      if (!new Set(["terminal_payoff", "pre_expiry_pnl"]).has(basis)) errors.push(issue("PAYOFF_BASIS", `${path}.payload.calculation_method.basis`, "Payoff basis must be terminal_payoff or pre_expiry_pnl."));
      const model = g(method, "model");
      if (model !== null && !nonempty(model)) errors.push(issue("PAYOFF_MODEL", `${path}.payload.calculation_method.model`, "model must be non-empty or null."));
      const assumptions = stringList(g(method, "assumptions"), `${path}.payload.calculation_method.assumptions`, errors);
      if (basis === "pre_expiry_pnl" && (!nonempty(model) || !assumptions.length)) errors.push(issue("PAYOFF_PRICING_MODEL", `${path}.payload.calculation_method`, "Pre-expiry PnL requires a pricing model and assumptions."));
    }
    if (!nonempty(g(payload, "unit"))) errors.push(issue("PAYOFF_TEXT_FIELD", `${path}.payload.unit`, "unit is required."));
    const values = g(payload, "values");
    if (!Array.isArray(values) || values.length < 2) {
      errors.push(issue("PAYOFF_VALUES", `${path}.payload.values`, "Payoff evidence needs at least two calculated points."));
    } else {
      let priorUnderlying = null;
      values.forEach((point, position) => {
        const pointPath = `${path}.payload.values[${position}]`;
        if (!isObject(point)) {
          errors.push(issue("PAYOFF_POINT_TYPE", pointPath, "Payoff point must be an object."));
          return;
        }
        const pointFields = new Set(["underlying", "payoff"]);
        validateShape(point, pointPath, pointFields, pointFields, errors);
        const underlying = g(point, "underlying"), payoff = g(point, "payoff");
        if (!finite(underlying) || !finite(payoff)) {
          errors.push(issue("PAYOFF_POINT", pointPath, "Payoff point values must be finite."));
          return;
        }
        if (priorUnderlying !== null && underlying <= priorUnderlying) errors.push(issue("PAYOFF_ORDER", `${pointPath}.underlying`, "Underlying values must be strictly increasing."));
        priorUnderlying = Number(underlying);
      });
    }
  }

  return [available, shape];
}

export function uniqueObjects(items, field, path, prefix, errors) {
  if (!Array.isArray(items)) {
    errors.push(issue("ARRAY_REQUIRED", path, "Expected an array."));
    return [[], new Map()];
  }
  const clean = [];
  const index = new Map();
  items.forEach((item, position) => {
    const itemPath = `${path}[${position}]`;
    if (!isObject(item)) {
      errors.push(issue("OBJECT_REQUIRED", itemPath, "Expected an object."));
      return;
    }
    const ref = g(item, field);
    if (typeof ref !== "string" || !ref.startsWith(prefix)) {
      errors.push(issue("ID_FORMAT", `${itemPath}.${field}`, `Expected ${prefix}* ID.`));
      return;
    }
    if (index.has(ref)) {
      errors.push(issue("DUPLICATE_ID", `${itemPath}.${field}`, `Duplicate ID ${pyRepr(ref)}.`));
      return;
    }
    clean.push(item);
    index.set(ref, item);
  });
  return [clean, index];
}

export function validate(payload, { expressionPlan = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "ViewpointDataBundleV1 must be an object.")], warnings: [] };
  }

  const rootKeys = new Set(Object.keys(payload));
  for (const key of sorted([...ROOT_REQUIRED_FIELDS].filter((field) => !rootKeys.has(field)))) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of sorted([...rootKeys].filter((field) => !ROOT_FIELDS.has(field)))) errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  if (g(payload, "schema_version") !== "viewpoint-data-bundle-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-data-bundle-v1."));
  if (!/^VDATA_[A-Za-z0-9_:-]{8,96}$/.test(pyStrOrEmpty(g(payload, "bundle_id")))) errors.push(issue("BUNDLE_ID", "$.bundle_id", "Invalid VDATA_* bundle ID."));
  if (!pyInt(g(payload, "revision")) || pyNumber(g(payload, "revision", 0)) < 1) errors.push(issue("REVISION", "$.revision", "revision must be a positive integer."));
  const state = g(payload, "state");
  if (!new Set(["ready", "conditional", "blocked"]).has(state)) errors.push(issue("STATE", "$.state", "Unsupported state."));
  const temporalMode = g(payload, "temporal_mode");
  if (!new Set(["declaration", "tracking", "replay"]).has(temporalMode)) errors.push(issue("TEMPORAL_MODE", "$.temporal_mode", "Unsupported temporal mode."));

  const lineage = isObject(g(payload, "lineage")) ? g(payload, "lineage") : {};
  if (!pyTruthy(lineage)) errors.push(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object."));
  else {
    const lineageFields = new Set([
      "expression_plan_ref", "meaning_fingerprint", "research_pack_ref",
      "input_artifact_refs", "decision_cutoff_at", "as_of",
    ]);
    validateShape(lineage, "$.lineage", lineageFields, lineageFields, errors);
  }
  const expressionRef = g(lineage, "expression_plan_ref");
  if (!/^(?:CEXP|EXPR)_[A-Za-z0-9_:-]+@r[1-9][0-9]*$/.test(pyStrOrEmpty(expressionRef))) errors.push(issue("EXPRESSION_REF", "$.lineage.expression_plan_ref", "Expression plan ref must be revision-qualified as CEXP_*@rN or EXPR_*@rN."));
  const fingerprint = g(lineage, "meaning_fingerprint");
  if (!/^sha256:[a-f0-9]{64}$/.test(pyStrOrEmpty(fingerprint))) errors.push(issue("MEANING_FINGERPRINT", "$.lineage.meaning_fingerprint", "Expected a sha256 fingerprint."));
  const inputRefs = stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors, { minimum: 1 });
  if (typeof expressionRef === "string" && !inputRefs.includes(expressionRef)) errors.push(issue("EXPRESSION_INPUT_REF", "$.lineage.input_artifact_refs", "The revision-qualified expression plan ref must appear in input_artifact_refs."));
  const cutoff = parseTime(g(lineage, "decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors);
  const asOf = parseTime(g(lineage, "as_of"), "$.lineage.as_of", errors);
  if (cutoff && asOf && asOf.epoch < cutoff.epoch) errors.push(issue("AS_OF_BEFORE_CUTOFF", "$.lineage.as_of", "as_of cannot precede the decision cutoff."));

  const request = isObject(g(payload, "request")) ? g(payload, "request") : {};
  if (!pyTruthy(request)) errors.push(issue("REQUEST_TYPE", "$.request", "request must be an object."));
  else {
    const requestFields = new Set(["grammar", "visual_job", "required_kinds", "fallback_modes"]);
    validateShape(request, "$.request", requestFields, requestFields, errors);
  }
  if (!pyStrOrEmpty(g(request, "grammar")).trim()) errors.push(issue("GRAMMAR", "$.request.grammar", "grammar is required."));
  if (!pyStrOrEmpty(g(request, "visual_job")).trim()) errors.push(issue("VISUAL_JOB", "$.request.visual_job", "visual_job is required."));
  const requiredKinds = stringList(g(request, "required_kinds"), "$.request.required_kinds", errors, { minimum: 1 });
  if (requiredKinds.some((kind) => !DATA_KINDS.has(kind))) errors.push(issue("REQUIRED_KIND", "$.request.required_kinds", "required_kinds contains an unsupported primitive kind."));
  const fallbackModes = stringList(g(request, "fallback_modes"), "$.request.fallback_modes", errors);
  if (fallbackModes.some((mode) => !new Set(["qualitative", "key_numbers", "series", "mixed"]).has(mode))) errors.push(issue("FALLBACK_MODE", "$.request.fallback_modes", "fallback_modes contains an unsupported mode."));

  const [instruments, instrumentIndex] = uniqueObjects(g(payload, "instruments"), "instrument_id", "$.instruments", "INS_", errors);
  const [series, seriesIndex] = uniqueObjects(g(payload, "series"), "series_id", "$.series", "SER_", errors);
  const [values, valueIndex] = uniqueObjects(g(payload, "key_values"), "value_id", "$.key_values", "VAL_", errors);
  const [events, eventIndex] = uniqueObjects(g(payload, "events"), "event_id", "$.events", "EV_", errors);
  const [levels, levelIndex] = uniqueObjects(g(payload, "levels"), "level_id", "$.levels", "LVL_", errors);
  const [formulas, formulaIndex] = uniqueObjects(g(payload, "formulas"), "formula_id", "$.formulas", "FORM_", errors);
  const [evidenceObjects, evidenceObjectIndex] = uniqueObjects(g(payload, "evidence_objects", []), "evidence_id", "$.evidence_objects", "EOBJ_", errors);
  const [requirements, requirementIndex] = uniqueObjects(g(payload, "requirements"), "requirement_id", "$.requirements", "REQ_", errors);

  const allIds = new Map();
  for (const [groupName, index] of [
    ["instrument", instrumentIndex], ["series", seriesIndex], ["value", valueIndex],
    ["event", eventIndex], ["level", levelIndex], ["formula", formulaIndex],
    ["evidence_object", evidenceObjectIndex], ["requirement", requirementIndex],
  ]) {
    for (const ref of index.keys()) {
      if (allIds.has(ref)) errors.push(issue("CROSS_TYPE_DUPLICATE_ID", "$", `${pyRepr(ref)} is both ${allIds.get(ref)} and ${groupName}.`));
      allIds.set(ref, groupName);
    }
  }

  instruments.forEach((instrument, position) => {
    const path = `$.instruments[${position}]`;
    for (const key of ["entity_ref", "symbol", "venue", "mapping_source_ref"]) {
      if (!pyStrOrEmpty(g(instrument, key)).trim()) errors.push(issue("INSTRUMENT_FIELD", `${path}.${key}`, `${key} is required.`));
    }
    if (g(instrument, "role") === "proxy" && !pyStrOrEmpty(g(instrument, "mapping_limitation")).trim()) errors.push(issue("PROXY_LIMITATION", `${path}.mapping_limitation`, "A proxy requires an explicit mapping limitation."));
  });

  const timedItems = [];
  series.forEach((item, position) => {
    const path = `$.series[${position}]`;
    const instrumentRefs = stringList(g(item, "instrument_refs"), `${path}.instrument_refs`, errors, { minimum: 1 });
    for (const ref of instrumentRefs) if (!instrumentIndex.has(ref)) errors.push(issue("UNKNOWN_INSTRUMENT", `${path}.instrument_refs`, `Unknown instrument ${pyRepr(ref)}.`));
    const kind = g(item, "kind");
    if (!SERIES_KINDS.has(kind)) errors.push(issue("SERIES_KIND", `${path}.kind`, "Unsupported series kind."));
    for (const key of ["label", "unit", "interval", "timezone", "source_ref"]) if (!nonempty(g(item, key))) errors.push(issue("SERIES_FIELD", `${path}.${key}`, `${key} is required.`));
    const formulaRef = g(item, "formula_ref");
    if (new Set(["return", "spread", "factor"]).has(kind) && !formulaIndex.has(formulaRef)) errors.push(issue("SERIES_FORMULA_REQUIRED", `${path}.formula_ref`, `${kind} series requires a declared formula.`));
    else if (formulaRef !== null && !formulaIndex.has(formulaRef)) errors.push(issue("UNKNOWN_FORMULA", `${path}.formula_ref`, `Unknown formula ${pyRepr(formulaRef)}.`));
    const points = g(item, "points");
    if (!Array.isArray(points) || !points.length) {
      errors.push(issue("POINTS_REQUIRED", `${path}.points`, "Series requires observed points."));
      return;
    }
    let priorT = null;
    const seenTimes = new Set();
    points.forEach((point, pointPosition) => {
      const pointPath = `${path}.points[${pointPosition}]`;
      if (!isObject(point)) {
        errors.push(issue("POINT_TYPE", pointPath, "Point must be an object."));
        return;
      }
      const pointT = parseTime(g(point, "t"), `${pointPath}.t`, errors);
      const available = parseTime(g(point, "available_at"), `${pointPath}.available_at`, errors);
      timedItems.push([`${pointPath}.available_at`, available]);
      if (pointT && priorT && pointT.epoch <= priorT.epoch) errors.push(issue("POINT_ORDER", `${pointPath}.t`, "Point times must be strictly increasing."));
      if (pointT && seenTimes.has(pointT.epoch)) errors.push(issue("DUPLICATE_POINT_TIME", `${pointPath}.t`, "Duplicate point time."));
      if (pointT) {
        priorT = pointT;
        seenTimes.add(pointT.epoch);
        if (asOf && pointT.epoch > asOf.epoch) errors.push(issue("POINT_AFTER_AS_OF", `${pointPath}.t`, "Observed point cannot be after bundle as_of."));
      }
      if (!pyStrOrEmpty(g(point, "source_ref")).trim()) errors.push(issue("POINT_SOURCE", `${pointPath}.source_ref`, "Point source is required."));
      if (g(point, "state") === "forming" && pointPosition !== points.length - 1) errors.push(issue("FORMING_NOT_LAST", `${pointPath}.state`, "Only the final point may be forming."));
      if (kind === "ohlcv") {
        const prices = Object.fromEntries(["o", "h", "l", "c"].map((key) => [key, g(point, key)]));
        if (!Object.values(prices).every(finite)) errors.push(issue("OHLC_REQUIRED", pointPath, "OHLC series requires finite o, h, l, and c."));
        else {
          if (prices.h < Math.max(...Object.values(prices))) errors.push(issue("OHLC_HIGH", `${pointPath}.h`, "High must be the maximum OHLC value."));
          if (prices.l > Math.min(...Object.values(prices))) errors.push(issue("OHLC_LOW", `${pointPath}.l`, "Low must be the minimum OHLC value."));
        }
        if (Object.hasOwn(point, "value")) errors.push(issue("OHLC_VALUE_MIX", `${pointPath}.value`, "OHLC points cannot also carry value."));
        if (Object.hasOwn(point, "v") && (!finite(g(point, "v")) || g(point, "v") < 0)) errors.push(issue("VOLUME", `${pointPath}.v`, "Volume must be finite and non-negative."));
      } else {
        if (!finite(g(point, "value"))) errors.push(issue("VALUE_REQUIRED", `${pointPath}.value`, "Non-OHLC series requires a finite value."));
        if (["o", "h", "l", "c", "v"].some((key) => Object.hasOwn(point, key))) errors.push(issue("VALUE_OHLC_MIX", pointPath, "Value points cannot carry OHLCV fields."));
      }
    });
  });

  values.forEach((item, position) => {
    const path = `$.key_values[${position}]`;
    const valueFields = new Set([
      "value_id", "label", "instrument_refs", "numeric_value", "display_value",
      "unit", "as_of", "available_at", "source_ref", "evidence_kind",
      "formula_ref", "role", "valuation_basis",
    ]);
    validateShape(item, path, valueFields, valueFields, errors);
    for (const key of ["label", "display_value", "unit", "source_ref"]) if (!nonempty(g(item, key))) errors.push(issue("KEY_VALUE_FIELD", `${path}.${key}`, `${key} is required.`));
    const instrumentRefs = stringList(g(item, "instrument_refs"), `${path}.instrument_refs`, errors, { minimum: 1 });
    for (const ref of instrumentRefs) if (!instrumentIndex.has(ref)) errors.push(issue("UNKNOWN_INSTRUMENT", `${path}.instrument_refs`, `Unknown instrument ${pyRepr(ref)}.`));
    const numeric = g(item, "numeric_value");
    if (numeric !== null && !finite(numeric)) errors.push(issue("KEY_VALUE_NUMERIC", `${path}.numeric_value`, "numeric_value must be finite or null."));
    if (!pyStrOrEmpty(g(item, "display_value")).trim()) errors.push(issue("DISPLAY_VALUE", `${path}.display_value`, "display_value is required."));
    if (!new Set(["observed", "reported", "derived", "analogy"]).has(g(item, "evidence_kind"))) errors.push(issue("EVIDENCE_KIND", `${path}.evidence_kind`, "Unsupported key-value evidence kind."));
    if (!new Set(["driver", "comparison", "magnitude", "risk", "context"]).has(g(item, "role"))) errors.push(issue("KEY_VALUE_ROLE", `${path}.role`, "Unsupported key-value role."));
    const available = parseTime(g(item, "available_at"), `${path}.available_at`, errors);
    parseTime(g(item, "as_of"), `${path}.as_of`, errors);
    timedItems.push([`${path}.available_at`, available]);
    const formulaRef = g(item, "formula_ref");
    if (g(item, "evidence_kind") === "derived" && !formulaIndex.has(formulaRef)) errors.push(issue("VALUE_FORMULA_REQUIRED", `${path}.formula_ref`, "Derived values require a declared formula."));
    else if (formulaRef !== null && !formulaIndex.has(formulaRef)) errors.push(issue("UNKNOWN_FORMULA", `${path}.formula_ref`, `Unknown formula ${pyRepr(formulaRef)}.`));
    const valuationBasis = g(item, "valuation_basis");
    if (valuationBasis !== null) {
      const valuationFields = new Set([
        "metric_name", "numerator", "denominator", "denominator_value",
        "period_basis", "accounting_basis", "currency_treatment",
        "share_class", "comparability_notes",
      ]);
      if (!isObject(valuationBasis)) errors.push(issue("VALUATION_BASIS_TYPE", `${path}.valuation_basis`, "valuation_basis must be an object or null."));
      else {
        validateShape(valuationBasis, `${path}.valuation_basis`, valuationFields, valuationFields, errors);
        for (const key of ["metric_name", "numerator", "denominator", "accounting_basis", "currency_treatment", "share_class"]) if (!nonempty(g(valuationBasis, key))) errors.push(issue("VALUATION_BASIS_FIELD", `${path}.valuation_basis.${key}`, `${key} is required.`));
        if (!new Set(["trailing", "forward", "current", "point_in_time", "not_applicable"]).has(g(valuationBasis, "period_basis"))) errors.push(issue("VALUATION_PERIOD", `${path}.valuation_basis.period_basis`, "Unsupported valuation period basis."));
        const denominatorValue = g(valuationBasis, "denominator_value");
        if (denominatorValue !== null && !finite(denominatorValue)) errors.push(issue("VALUATION_DENOMINATOR", `${path}.valuation_basis.denominator_value`, "denominator_value must be finite or null."));
        const metricName = pyStrOrEmpty(g(valuationBasis, "metric_name")).trim().toLowerCase().replaceAll(" ", "");
        if (new Set(["p/e", "pe", "price/earnings"]).has(metricName) && finite(denominatorValue) && denominatorValue <= 0) {
          if (numeric !== null || pyStrOrEmpty(g(item, "display_value")).trim().toUpperCase() !== "N/M") errors.push(issue("PE_NOT_MEANINGFUL", path, "P/E with non-positive earnings must use numeric_value null and display_value N/M."));
        }
      }
    }
  });

  events.forEach((item, position) => {
    const path = `$.events[${position}]`;
    validateShape(item, path, EVENT_FIELDS, EVENT_FIELDS, errors);
    if (!nonempty(g(item, "label"))) errors.push(issue("EVENT_LABEL", `${path}.label`, "Event label is required."));
    parseTime(g(item, "at"), `${path}.at`, errors);
    const available = parseTime(g(item, "available_at"), `${path}.available_at`, errors);
    timedItems.push([`${path}.available_at`, available]);
    if (!nonempty(g(item, "source_ref"))) errors.push(issue("EVENT_SOURCE", `${path}.source_ref`, "Event source is required."));
    if (g(item, "publisher_or_issuer") !== null && !nonempty(g(item, "publisher_or_issuer"))) errors.push(issue("EVENT_PUBLISHER", `${path}.publisher_or_issuer`, "Publisher or issuer must be non-empty or null."));
    if (!SOURCE_TYPES.has(g(item, "source_type"))) errors.push(issue("EVENT_SOURCE_TYPE", `${path}.source_type`, "Unsupported event source type."));
    const sourceUrl = g(item, "source_url");
    if (sourceUrl !== null && (!nonempty(sourceUrl) || !/^https?:\/\/\S+$/.test(sourceUrl))) errors.push(issue("EVENT_SOURCE_URL", `${path}.source_url`, "Event source URL must be an absolute HTTP(S) URL or null."));
    stringList(g(item, "supported_fact_refs"), `${path}.supported_fact_refs`, errors);
    if (!EVENT_ROLES.has(g(item, "role"))) errors.push(issue("EVENT_ROLE", `${path}.role`, "Unsupported event role."));
  });

  levels.forEach((item, position) => {
    const path = `$.levels[${position}]`;
    validateShape(item, path, LEVEL_FIELDS, LEVEL_FIELDS, errors);
    for (const key of ["label", "unit", "source_ref"]) if (!nonempty(g(item, key))) errors.push(issue("LEVEL_FIELD", `${path}.${key}`, `${key} is required.`));
    if (!instrumentIndex.has(g(item, "instrument_ref"))) errors.push(issue("LEVEL_INSTRUMENT", `${path}.instrument_ref`, "Level instrument_ref must resolve to an instrument."));
    if (!finite(g(item, "value"))) errors.push(issue("LEVEL_VALUE", `${path}.value`, "Level value must be finite."));
    if (!LEVEL_KINDS.has(g(item, "kind"))) errors.push(issue("LEVEL_KIND", `${path}.kind`, "Unsupported level kind."));
    stringList(g(item, "fact_refs"), `${path}.fact_refs`, errors, { minimum: 1 });
    if (typeof g(item, "explicit") !== "boolean") errors.push(issue("LEVEL_EXPLICIT", `${path}.explicit`, "Level explicit must be boolean."));
    parseTime(g(item, "observed_at"), `${path}.observed_at`, errors);
    const available = parseTime(g(item, "available_at"), `${path}.available_at`, errors);
    timedItems.push([`${path}.available_at`, available]);
  });

  const dataIds = new Set([...seriesIndex.keys(), ...valueIndex.keys(), ...eventIndex.keys(), ...levelIndex.keys()]);
  formulas.forEach((item, position) => {
    const path = `$.formulas[${position}]`;
    let formulaInputRefs = g(item, "input_refs");
    if (!Array.isArray(formulaInputRefs) || !formulaInputRefs.length) {
      errors.push(issue("FORMULA_INPUTS", `${path}.input_refs`, "Formula requires input refs."));
      formulaInputRefs = [];
    }
    for (const ref of formulaInputRefs) if (!dataIds.has(ref)) errors.push(issue("UNKNOWN_FORMULA_INPUT", `${path}.input_refs`, `Unknown formula input ${pyRepr(ref)}.`));
    for (const key of ["expression", "output_unit", "window", "normalization"]) if (!pyStrOrEmpty(g(item, key)).trim()) errors.push(issue("FORMULA_FIELD", `${path}.${key}`, `${key} is required.`));
    const limitations = g(item, "limitations");
    if (!Array.isArray(limitations) || !limitations.length) errors.push(issue("FORMULA_LIMITATIONS", `${path}.limitations`, "Formula requires at least one limitation."));
  });

  evidenceObjects.forEach((item, position) => {
    const path = `$.evidence_objects[${position}]`;
    const [available] = validateEvidenceObject(item, path, {
      eventIndex,
      instrumentIndex,
      formulaIndex,
      requestGrammar: pyStrOrEmpty(g(request, "grammar")),
      bundleAsOf: asOf,
      errors,
      warnings,
    });
    timedItems.push([`${path}.available_at`, available]);
  });

  if (temporalMode === "declaration" && cutoff) {
    for (const [path, available] of timedItems) if (available && available.epoch > cutoff.epoch) errors.push(issue("POST_CUTOFF_DATA", path, "Declaration bundle cannot use data first available after the decision cutoff."));
  }

  const resolvableIds = new Set([...dataIds, ...formulaIndex.keys(), ...evidenceObjectIndex.keys()]);
  let missingRequired = 0;
  let degradedRequired = 0;
  let nondegradableGapCount = 0;
  const materialVisualRefs = new Set();
  const upstreamRequirementIds = new Map();
  const requirementFields = new Set([
    "requirement_id", "expression_plan_requirement_ref", "kind", "request_class",
    "required", "material_to_claim", "expression_surfaces", "status",
    "resolved_refs", "missing_reason", "fallback",
  ]);
  requirements.forEach((item, position) => {
    const path = `$.requirements[${position}]`;
    validateShape(item, path, requirementFields, requirementFields, errors);

    const upstreamRef = g(item, "expression_plan_requirement_ref");
    const expectedPrefix = typeof expressionRef === "string" ? `${expressionRef}#/data_requirements/` : "";
    let upstreamId = null;
    if (typeof upstreamRef !== "string" || !expectedPrefix || !upstreamRef.startsWith(expectedPrefix)) {
      errors.push(issue("UPSTREAM_REQUIREMENT_REF", `${path}.expression_plan_requirement_ref`, "Requirement ref must point into lineage.expression_plan_ref#/data_requirements/."));
    } else {
      upstreamId = upstreamRef.slice(expectedPrefix.length);
      if (!/^D[1-9][0-9]*$/.test(upstreamId)) {
        errors.push(issue("UPSTREAM_REQUIREMENT_REF", `${path}.expression_plan_requirement_ref`, "Upstream requirement fragment must end in a D* requirement ID."));
        upstreamId = null;
      } else if (upstreamRequirementIds.has(upstreamId)) {
        errors.push(issue("UPSTREAM_REQUIREMENT_UNIQUE", `${path}.expression_plan_requirement_ref`, "Each expression-plan requirement may appear only once in a bundle."));
      } else upstreamRequirementIds.set(upstreamId, [item, path]);
    }

    const kind = g(item, "kind");
    if (!DATA_KINDS.has(kind)) errors.push(issue("REQUIREMENT_KIND", `${path}.kind`, "Unsupported requirement primitive kind."));
    else if (!requiredKinds.includes(kind)) warnings.push(issue("UNREQUESTED_REQUIREMENT", `${path}.kind`, "Requirement kind is absent from request.required_kinds."));

    const requestClass = g(item, "request_class");
    if (!REQUEST_CLASSES.has(requestClass)) errors.push(issue("REQUEST_CLASS", `${path}.request_class`, "Unsupported request class."));
    else if (DATA_KINDS.has(kind) && !DATA_KINDS_BY_REQUEST_CLASS.get(requestClass).has(kind)) errors.push(issue("REQUEST_CLASS_KIND", `${path}.kind`, `${requestClass} cannot be resolved as ${kind}.`));

    const requiredValue = g(item, "required");
    if (typeof requiredValue !== "boolean") errors.push(issue("REQUIREMENT_REQUIRED", `${path}.required`, "required must be boolean."));
    const required = requiredValue === true;
    const materialToClaim = g(item, "material_to_claim");
    if (typeof materialToClaim !== "boolean") errors.push(issue("REQUIREMENT_MATERIAL", `${path}.material_to_claim`, "material_to_claim must be boolean."));
    else if (pyTruthy(materialToClaim) && !required) errors.push(issue("MATERIAL_MUST_BE_REQUIRED", path, "A material creator request must remain required."));
    const surfaces = new Set(stringList(g(item, "expression_surfaces"), `${path}.expression_surfaces`, errors, { minimum: 1, maximum: 2 }));
    if (!setSubset(surfaces, EXPRESSION_SURFACES)) errors.push(issue("EXPRESSION_SURFACE", `${path}.expression_surfaces`, "Expression surfaces must be text and/or visual."));

    const refs = stringList(g(item, "resolved_refs"), `${path}.resolved_refs`, errors);
    for (const ref of refs) if (!resolvableIds.has(ref)) errors.push(issue("UNKNOWN_REQUIREMENT_REF", `${path}.resolved_refs`, `Unknown resolved ref ${pyRepr(ref)}.`));
    const status = g(item, "status");
    if (!new Set(["available", "degraded", "missing", "not_applicable"]).has(status)) errors.push(issue("REQUIREMENT_STATUS", `${path}.status`, "Unsupported requirement status."));
    const fallback = g(item, "fallback");
    const nondegradable = required && materialToClaim === true && NON_DEGRADABLE_MATERIAL_CLASSES.has(requestClass);
    if (new Set(["available", "degraded"]).has(status) && !refs.length) errors.push(issue("AVAILABLE_WITHOUT_DATA", `${path}.resolved_refs`, `${status} requirement needs resolved data.`));
    if (status === "available" && g(item, "missing_reason") !== null) errors.push(issue("AVAILABLE_WITH_MISSING_REASON", `${path}.missing_reason`, "Available data cannot carry a missing reason."));
    if (status === "available" && fallback !== null) errors.push(issue("AVAILABLE_WITH_FALLBACK", `${path}.fallback`, "Available data cannot carry a fallback."));
    if (status === "available" && materialToClaim === true && surfaces.has("visual")) for (const ref of refs) if (resolvableIds.has(ref)) materialVisualRefs.add(ref);
    if (status === "missing") {
      if (!nonempty(g(item, "missing_reason"))) errors.push(issue("MISSING_REASON", `${path}.missing_reason`, "Missing requirement needs a reason."));
      if (required) {
        missingRequired += 1;
        if (!nondegradable && !isObject(fallback)) errors.push(issue("MISSING_WITHOUT_FALLBACK", `${path}.fallback`, "Missing required data needs an allowed fallback or blocks the visual."));
      }
    }
    if (status === "degraded" && required) {
      degradedRequired += 1;
      if (!nonempty(g(item, "missing_reason"))) errors.push(issue("DEGRADED_REASON", `${path}.missing_reason`, "Degraded required data needs a reason."));
    }
    if (status === "not_applicable" && required) errors.push(issue("REQUIRED_NOT_APPLICABLE", `${path}.status`, "A required item cannot be not_applicable."));
    if (nondegradable && new Set(["degraded", "missing", "not_applicable"]).has(status)) nondegradableGapCount += 1;
    if (nondegradable && status === "degraded") errors.push(issue("MATERIAL_REQUEST_DEGRADED", `${path}.status`, "Material news, valuation, comparator, price, and settlement requests cannot degrade."));
    if (nondegradable && fallback !== null) errors.push(issue("MATERIAL_REQUEST_FALLBACK", `${path}.fallback`, "Material news, valuation, comparator, price, and settlement requests cannot fallback."));
    if (isObject(fallback)) {
      const fallbackFields = new Set(["mode", "grammar", "reason"]);
      validateShape(fallback, `${path}.fallback`, fallbackFields, fallbackFields, errors);
      const mode = g(fallback, "mode");
      if (!fallbackModes.includes(mode)) errors.push(issue("FALLBACK_NOT_ALLOWED", `${path}.fallback.mode`, "Fallback mode is not allowed by the expression plan."));
      if (!nonempty(g(fallback, "grammar")) || !nonempty(g(fallback, "reason"))) errors.push(issue("FALLBACK_FIELDS", `${path}.fallback`, "Fallback requires grammar and reason."));
    } else if (fallback !== null) errors.push(issue("FALLBACK_TYPE", `${path}.fallback`, "fallback must be an object or null."));

    const resolvedEvents = refs.filter((ref) => eventIndex.has(ref)).map((ref) => eventIndex.get(ref));
    const resolvedValues = refs.filter((ref) => valueIndex.has(ref)).map((ref) => valueIndex.get(ref));
    const resolvedLevels = refs.filter((ref) => levelIndex.has(ref)).map((ref) => levelIndex.get(ref));
    const resolvedSeries = refs.filter((ref) => seriesIndex.has(ref)).map((ref) => seriesIndex.get(ref));
    const resolvedEvidence = refs.filter((ref) => evidenceObjectIndex.has(ref)).map((ref) => evidenceObjectIndex.get(ref));
    const matchingEvidence = resolvedEvidence.filter((evidence) => g(evidence, "shape") === kind);
    if (new Set(["available", "degraded"]).has(status) && EVIDENCE_SHAPES.has(kind) && !matchingEvidence.length) errors.push(issue("EVIDENCE_KIND_MISMATCH", `${path}.resolved_refs`, "A structured requirement must resolve an evidence object whose shape matches requirement.kind."));
    if (new Set(["available", "degraded"]).has(status) && requestClass === "news_anchor") {
      const qualifyingNews = resolvedEvents.filter((event) => new Set(["news", "catalyst"]).has(g(event, "role")) && nonempty(g(event, "publisher_or_issuer")) && nonempty(g(event, "source_url")) && pyTruthy(g(event, "supported_fact_refs")));
      const qualifyingClusters = matchingEvidence.filter((evidence) => g(evidence, "shape") === "news_cluster");
      if (!qualifyingNews.length && !qualifyingClusters.length) errors.push(issue("NEWS_EVIDENCE", `${path}.resolved_refs`, "News anchors require a sourced news/catalyst event with publisher, URL, and supported fact refs."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "official_event") {
      if (!resolvedEvents.some((event) => OFFICIAL_SOURCE_TYPES.has(g(event, "source_type")) && nonempty(g(event, "source_url")))) errors.push(issue("OFFICIAL_EVENT_EVIDENCE", `${path}.resolved_refs`, "Official events require an issuer, regulator, exchange, government, or filing event with a source URL."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "valuation_metric") {
      if (!resolvedValues.length || !resolvedValues.every((value) => isObject(g(value, "valuation_basis")))) errors.push(issue("VALUATION_EVIDENCE", `${path}.resolved_refs`, "Valuation requests require key values with complete valuation_basis metadata."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "comparison_metric" && !matchingEvidence.length) {
      const comparisonItems = [...resolvedValues, ...resolvedSeries];
      const comparisonInstrumentRefs = new Set();
      for (const comparisonItem of comparisonItems) {
        const refsValue = g(comparisonItem, "instrument_refs", []);
        if (Array.isArray(refsValue)) for (const ref of refsValue) if (instrumentIndex.has(ref)) comparisonInstrumentRefs.add(ref);
      }
      const instrumentRoles = new Set([...comparisonInstrumentRefs].map((ref) => g(instrumentIndex.get(ref), "role")));
      const units = new Set(comparisonItems.map((comparisonItem) => g(comparisonItem, "unit")));
      if (comparisonItems.length < 2 || comparisonInstrumentRefs.size < 2 || !setSubset(new Set(["primary", "comparator"]), instrumentRoles)) errors.push(issue("COMPARISON_EVIDENCE", `${path}.resolved_refs`, "Comparator requests require at least two values or series bound to primary and comparator instruments."));
      if (units.size > 1) errors.push(issue("COMPARISON_UNIT", `${path}.resolved_refs`, "Comparator evidence requires compatible units or an explicit normalized result."));
      if (resolvedValues.length && resolvedSeries.length) errors.push(issue("COMPARISON_TYPE", `${path}.resolved_refs`, "Comparator evidence cannot mix raw key values and series without an explicit derived result."));
      if (new Set(resolvedValues.map((value) => g(value, "as_of"))).size > 1 || new Set(resolvedSeries.map((seriesItem) => g(seriesItem, "interval"))).size > 1) errors.push(issue("COMPARISON_TIME_BASIS", `${path}.resolved_refs`, "Comparator evidence requires aligned as-of times or intervals."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "market_series") {
      const marketShapes = new Set(["distribution_sample", "quantile_scenarios", "additive_components", "quantified_flow", "payoff_series"]);
      if (!resolvedSeries.length && !matchingEvidence.some((evidence) => marketShapes.has(g(evidence, "shape")))) errors.push(issue("MARKET_SERIES_EVIDENCE", `${path}.resolved_refs`, "Market-series requests require an observed series or a validated structured market object."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "price_level") {
      if (!resolvedLevels.length || !resolvedLevels.every((level) => g(level, "explicit") === true && nonempty(g(level, "source_ref")))) errors.push(issue("PRICE_LEVEL_EVIDENCE", `${path}.resolved_refs`, "Price-level requests require explicit, source-linked levels."));
    }
    if (new Set(["available", "degraded"]).has(status) && requestClass === "settlement_reference") {
      const officialDeadline = resolvedEvents.some((event) => g(event, "role") === "deadline" && OFFICIAL_SOURCE_TYPES.has(g(event, "source_type")));
      if (!officialDeadline || !(resolvedValues.length || resolvedLevels.length)) errors.push(issue("SETTLEMENT_EVIDENCE", `${path}.resolved_refs`, "Settlement references require an official deadline event and a sourced value or level."));
    }
  });

  if (nondegradableGapCount && state !== "blocked") errors.push(issue("MATERIAL_REQUEST_STATE", "$.state", "Unresolved material news, valuation, comparator, price, or settlement requests require a blocked bundle."));

  if (expressionPlan !== null) {
    if (!isObject(expressionPlan)) errors.push(issue("EXPRESSION_PLAN_TYPE", "$", "Expected expression plan input to be an object."));
    else {
      const planId = g(expressionPlan, "plan_id");
      const planRevision = g(expressionPlan, "revision");
      const expectedExpressionRef = `${pyStr(planId)}@r${pyStr(planRevision)}`;
      if (expressionRef !== expectedExpressionRef) errors.push(issue("EXPRESSION_PLAN_REF_MISMATCH", "$.lineage.expression_plan_ref", "Bundle expression plan ref does not match the supplied plan ID and revision."));
      const planFingerprintContainer = g(expressionPlan, "meaning_fingerprint");
      const planFingerprint = isObject(planFingerprintContainer) ? g(planFingerprintContainer, "fingerprint_sha256") : null;
      if (fingerprint !== planFingerprint) errors.push(issue("EXPRESSION_FINGERPRINT_MISMATCH", "$.lineage.meaning_fingerprint", "Bundle fingerprint does not match the supplied expression plan."));
      let rawPlanRequirements = g(expressionPlan, "data_requirements");
      if (!Array.isArray(rawPlanRequirements)) {
        errors.push(issue("EXPRESSION_REQUIREMENTS", "$", "Supplied expression plan has no data_requirements array."));
        rawPlanRequirements = [];
      }
      const planRequirementsById = new Map();
      for (const requirement of rawPlanRequirements) if (isObject(requirement) && typeof g(requirement, "id") === "string") planRequirementsById.set(g(requirement, "id"), requirement);
      const missingPlanRequirementIds = new Set([...planRequirementsById].filter(([requirementId, requirement]) => g(requirement, "required") === true && !upstreamRequirementIds.has(requirementId)).map(([requirementId]) => requirementId));
      if (missingPlanRequirementIds.size) errors.push(issue("UPSTREAM_REQUIREMENT_COVERAGE", "$.requirements", `Bundle omits required expression-plan requests: ${pyRepr(sorted(missingPlanRequirementIds))}.`));
      for (const [upstreamId, [bundleRequirement, bundlePath]] of upstreamRequirementIds) {
        const planRequirement = planRequirementsById.get(upstreamId);
        if (planRequirement === undefined) {
          errors.push(issue("UNKNOWN_UPSTREAM_REQUIREMENT", `${bundlePath}.expression_plan_requirement_ref`, "Referenced requirement is absent from the supplied expression plan."));
          continue;
        }
        for (const field of ["request_class", "material_to_claim", "required"]) {
          if (!pyEquals(g(bundleRequirement, field), g(planRequirement, field))) errors.push(issue("UPSTREAM_REQUIREMENT_MISMATCH", `${bundlePath}.${field}`, `${field} must exactly retain the supplied expression-plan requirement.`));
        }
        const bundleSurfaces = g(bundleRequirement, "expression_surfaces");
        const planSurfaces = g(planRequirement, "expression_surfaces");
        const bundleSurfaceSet = new Set(Array.isArray(bundleSurfaces) ? bundleSurfaces : []);
        const planSurfaceSet = new Set(Array.isArray(planSurfaces) ? planSurfaces : []);
        if (!setEquals(bundleSurfaceSet, planSurfaceSet)) errors.push(issue("UPSTREAM_REQUIREMENT_MISMATCH", `${bundlePath}.expression_surfaces`, "expression_surfaces must exactly retain the supplied expression-plan requirement."));
      }
    }
  }

  const render = isObject(g(payload, "render_payload")) ? g(payload, "render_payload") : {};
  if (!pyTruthy(render)) errors.push(issue("RENDER_PAYLOAD_TYPE", "$.render_payload", "render_payload must be an object."));
  const renderMode = g(render, "mode");
  if (!new Set(["qualitative", "key_numbers", "series", "evidence", "mixed"]).has(renderMode)) errors.push(issue("RENDER_MODE", "$.render_payload.mode", "Unsupported render mode."));
  const renderGroups = new Map([
    ["series_refs", seriesIndex], ["value_refs", valueIndex], ["event_refs", eventIndex],
    ["level_refs", levelIndex], ["formula_refs", formulaIndex], ["evidence_object_refs", evidenceObjectIndex],
  ]);
  const selectedRenderRefs = new Set();
  for (const [key, index] of renderGroups) {
    const refs = key === "evidence_object_refs" ? g(render, key, []) : g(render, key);
    if (!Array.isArray(refs) || refs.length !== new Set(Array.isArray(refs) ? refs : []).size) {
      errors.push(issue("RENDER_REFS", `$.render_payload.${key}`, `${key} must be a unique array.`));
      continue;
    }
    for (const ref of refs) {
      if (!index.has(ref)) errors.push(issue("UNKNOWN_RENDER_REF", `$.render_payload.${key}`, `Unknown render ref ${pyRepr(ref)}.`));
      else selectedRenderRefs.add(ref);
    }
  }
  const omittedMaterialVisualRefs = new Set([...materialVisualRefs].filter((ref) => !selectedRenderRefs.has(ref)));
  if (omittedMaterialVisualRefs.size) errors.push(issue("MATERIAL_RENDER_OMISSION", "$.render_payload", `Render payload omits material visual evidence refs: ${pyRepr(sorted(omittedMaterialVisualRefs))}.`));
  if (renderMode === "series" && !pyTruthy(g(render, "series_refs"))) errors.push(issue("SERIES_MODE_EMPTY", "$.render_payload.series_refs", "Series mode requires a series."));
  if (renderMode === "key_numbers" && !pyTruthy(g(render, "value_refs"))) errors.push(issue("KEY_NUMBER_MODE_EMPTY", "$.render_payload.value_refs", "Key-number mode requires values."));
  if (renderMode === "evidence" && !pyTruthy(g(render, "evidence_object_refs"))) errors.push(issue("EVIDENCE_MODE_EMPTY", "$.render_payload.evidence_object_refs", "Evidence mode requires a structured evidence object."));
  if (renderMode === "mixed") {
    const populatedGroups = [...renderGroups.keys()].filter((key) => key !== "formula_refs" && pyTruthy(g(render, key))).length;
    if (populatedGroups < 2) errors.push(issue("MIXED_MODE_INCOMPLETE", "$.render_payload", "Mixed mode requires at least two distinct evidence groups."));
  }
  const rawSelectedSeries = g(render, "series_refs");
  const selectedSeries = (Array.isArray(rawSelectedSeries) ? rawSelectedSeries : []).filter((ref) => seriesIndex.has(ref)).map((ref) => seriesIndex.get(ref));
  if (selectedSeries.length > 1) {
    const units = new Set(selectedSeries.map((item) => g(item, "unit")));
    const intervals = new Set(selectedSeries.map((item) => g(item, "interval")));
    if (units.size > 1 || intervals.size > 1) errors.push(issue("COMPARISON_BASIS", "$.render_payload.series_refs", "Displayed comparison series require compatible unit and interval or an explicit normalized series."));
  }

  const report = isObject(g(payload, "quality_report")) ? g(payload, "quality_report") : {};
  if (!pyTruthy(report)) errors.push(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."));
  const decision = g(report, "decision");
  if (decision !== state) errors.push(issue("STATE_DECISION", "$.quality_report.decision", "Quality decision must equal bundle state."));
  let hardFailures = g(report, "hard_failures");
  if (!Array.isArray(hardFailures)) {
    errors.push(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hardFailures = [];
  }
  if (hardFailures.length && state !== "blocked") errors.push(issue("HARD_FAILURE_STATE", "$.state", "Hard failures require blocked state."));
  if (state === "blocked" && !hardFailures.length) errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked state requires a hard failure."));
  if (state === "ready" && (missingRequired || degradedRequired)) errors.push(issue("READY_WITH_GAPS", "$.state", "Ready state cannot contain missing or degraded required data."));
  if (missingRequired && state === "ready") errors.push(issue("MISSING_REQUIRED_READY", "$.state", "Missing required data cannot be ready."));
  const counts = g(report, "counts");
  const expectedCounts = {
    instruments: instruments.length,
    series: series.length,
    key_values: values.length,
    events: events.length,
    levels: levels.length,
    formulas: formulas.length,
    requirements: requirements.length,
    missing_required: missingRequired,
  };
  if (Object.hasOwn(payload, "evidence_objects")) expectedCounts.evidence_objects = evidenceObjects.length;
  if (!pyEquals(counts, expectedCounts)) errors.push(issue("COUNTS", "$.quality_report.counts", `Expected exact counts ${pyRepr(expectedCounts)}.`));

  return { valid: errors.length === 0, errors, warnings };
}

function parseArgs(argv) {
  let jsonFile = null;
  let expressionPlan = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--expression-plan") expressionPlan = argv[++index];
    else if (jsonFile === null) jsonFile = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (jsonFile === null) throw new Error("the following arguments are required: json_file");
  if (expressionPlan === null || expressionPlan === undefined) throw new Error("the following arguments are required: --expression-plan");
  return { jsonFile, expressionPlan };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: validate_viewpoint_data_bundle.mjs json_file --expression-plan EXPRESSION_PLAN\nvalidate_viewpoint_data_bundle.mjs: error: ${error.message}\n`);
    return 2;
  }
  const payload = JSON.parse(readFileSync(args.jsonFile, "utf8"));
  const expressionPlan = JSON.parse(readFileSync(args.expressionPlan, "utf8"));
  const result = validate(payload, { expressionPlan });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
