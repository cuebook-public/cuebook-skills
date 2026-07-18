#!/usr/bin/env node
// Validate MarketFigureSpecV1 or rendered MarketFigureV1 artifacts.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { pyFromIsoformat } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

export const GRAMMARS = new Set([
  "event_reaction", "relative_strength", "expectation_revision", "fundamental_driver",
  "positioning_pressure", "sensitivity_curve", "instrument_map",
]);
export const STATES = new Set(["draft", "conditional", "ready", "frozen"]);
const SPEC_FIELDS = new Set([
  "schema_version", "spec_id", "revision", "state", "lineage", "grammar", "frame",
  "argument_path", "trade_logic", "news_anchor", "curve", "key_numbers", "countercase",
  "settlement", "render", "quality_report",
]);
const REQUIRED_SPEC_FIELDS = new Set([...SPEC_FIELDS].filter((item) => !new Set(["argument_path", "trade_logic"]).has(item)));
const MANIFEST_FIELDS = new Set([
  "schema_version", "figure_id", "spec_ref", "grammar", "layout", "state", "generated_at",
  "theme", "dimensions", "lineage", "content", "asset", "quality_report",
]);
const TRADE_LOGIC_FAMILIES = new Set([
  "event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility",
  "liquidity_microstructure", "carry_income",
]);
const TRADE_LOGIC_MECHANISMS = new Set([
  "risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow",
  "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag",
  "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation",
  "volatility_repricing", "carry_roll_down", "cross_asset_transmission",
]);
const TRADE_LOGIC_EXPRESSIONS = new Set([
  "outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket",
  "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade",
]);
const TRADE_LOGIC_HORIZONS = new Set([
  "intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural",
]);
const PUBLIC_BACKEND_TERMS = new Set([
  "已确认", "已计算", "推演", "待确认", "形成中", "observed", "derived", "provisional",
  "conditional", "confirmed", "pending",
]);

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

function pyStr(value) {
  if (value === null || value === undefined || value === "") return value === "" ? "" : "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed;
}

export function stringList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) errors.push(issue("STRING_LIST_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    else result.push(item);
  });
  if (result.length !== new Set(result).size) errors.push(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."));
  return result;
}

export function validateQuality(quality, state, errors, path = "$.quality_report") {
  if (!isObject(quality)) {
    errors.push(issue("QUALITY", path, "Quality report must be an object."));
    return [[], []];
  }
  const decision = g(quality, "decision");
  if (!new Set(["ready", "conditional", "blocked"]).has(decision)) errors.push(issue("QUALITY_DECISION", `${path}.decision`, "Unsupported quality decision."));
  const warnings = stringList(g(quality, "warnings"), `${path}.warnings`, errors);
  const failures = stringList(g(quality, "hard_failures"), `${path}.hard_failures`, errors);
  if (failures.length && decision !== "blocked") errors.push(issue("HARD_FAILURE_DECISION", `${path}.decision`, "Hard failures require blocked quality."));
  if (decision === "blocked" && !failures.length) errors.push(issue("BLOCKED_WITHOUT_FAILURE", `${path}.hard_failures`, "Blocked quality requires a hard failure."));
  if (state === "conditional" && (decision !== "conditional" || !warnings.length)) errors.push(issue("CONDITIONAL_STATE", path, "Conditional figures require conditional quality and a warning."));
  if (new Set(["ready", "frozen"]).has(state) && (decision !== "ready" || warnings.length || failures.length)) errors.push(issue("READY_STATE", path, "Ready or frozen figures require clean ready quality."));
  return [warnings, failures];
}

export function xValue(value, kind, path, errors) {
  if (kind === "time") {
    const parsed = parseTime(value, path, errors);
    return parsed?.epoch ?? null;
  }
  if (kind === "numeric") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(issue("NUMERIC_X", path, "Numeric axes require finite numeric x values."));
      return null;
    }
    return value;
  }
  if (kind === "category") {
    if (!nonempty(value)) {
      errors.push(issue("CATEGORY_X", path, "Category axes require non-empty string x values."));
      return null;
    }
    return value;
  }
  errors.push(issue("X_AXIS_KIND", path, "x-axis kind must be time, category, or numeric."));
  return null;
}

export function validateSpec(payload) {
  const errors = [];
  const warningsOut = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  const payloadKeys = new Set(Object.keys(payload));
  for (const key of sorted(setDifference(REQUIRED_SPEC_FIELDS, payloadKeys))) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of sorted(setDifference(payloadKeys, SPEC_FIELDS))) errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  if (g(payload, "schema_version") !== "market-figure-spec-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-figure-spec-v1."));
  if (!/^FIGSPEC_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(payload, "spec_id") || ""))) errors.push(issue("SPEC_ID", "$.spec_id", "Invalid figure spec ID."));
  const revision = g(payload, "revision");
  if (!Number.isInteger(revision) || revision < 1) errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  const state = g(payload, "state");
  if (!STATES.has(state)) errors.push(issue("STATE", "$.state", "Unsupported figure state."));
  const grammar = g(payload, "grammar");
  if (!GRAMMARS.has(grammar)) errors.push(issue("GRAMMAR", "$.grammar", "Unsupported curve grammar."));

  let lineage = g(payload, "lineage");
  if (!isObject(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
    lineage = {};
  }
  const inputs = stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors);
  if (!inputs.length) errors.push(issue("INPUT_LINEAGE", "$.lineage.input_artifact_refs", "At least one input artifact is required."));
  const newsFactRefs = stringList(g(lineage, "news_fact_refs"), "$.lineage.news_fact_refs", errors);
  for (const key of ["visual_argument_ref", "thesis_chart_ref", "chart_data_ref", "indicator_pack_ref", "settlement_claim_ref"]) {
    if (g(lineage, key) !== null && !nonempty(g(lineage, key))) errors.push(issue("LINEAGE_REF", `$.lineage.${key}`, "Reference must be null or non-empty."));
  }
  parseTime(g(lineage, "decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors);

  let frame = g(payload, "frame");
  if (!isObject(frame)) {
    errors.push(issue("FRAME", "$.frame", "Frame must be an object."));
    frame = {};
  }
  for (const key of ["kicker", "headline", "viewpoint"]) if (!nonempty(g(frame, key))) errors.push(issue("FRAME_FIELD", `$.frame.${key}`, `${key} is required.`));

  let argumentPath = g(payload, "argument_path");
  const argumentNodeIds = [];
  if (argumentPath !== null) {
    if (!isObject(argumentPath)) {
      errors.push(issue("ARGUMENT_PATH", "$.argument_path", "Argument path must be null or an object."));
      argumentPath = {};
    }
    if (!new Set(["causal_chain", "confirmation_ladder", "evidence_ladder"]).has(g(argumentPath, "mode"))) errors.push(issue("ARGUMENT_MODE", "$.argument_path.mode", "Unsupported argument path mode."));
    let nodes = g(argumentPath, "nodes");
    if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 4) {
      errors.push(issue("ARGUMENT_NODES", "$.argument_path.nodes", "Argument path requires two to four nodes."));
      nodes = [];
    }
    nodes.forEach((node, index) => {
      const path = `$.argument_path.nodes[${index}]`;
      if (!isObject(node)) {
        errors.push(issue("ARGUMENT_NODE", path, "Argument node must be an object."));
        return;
      }
      const nodeId = g(node, "id");
      if (!/^N[1-9][0-9]*$/.test(pyStr(nodeId || ""))) errors.push(issue("ARGUMENT_NODE_ID", `${path}.id`, "Invalid argument node ID."));
      else argumentNodeIds.push(nodeId);
      if (!new Set(["event", "evidence", "mechanism", "actor_action", "market_effect", "metric", "condition", "countercase", "invalidation", "settlement"]).has(g(node, "kind"))) errors.push(issue("ARGUMENT_NODE_KIND", `${path}.kind`, "Unsupported argument node kind."));
      const label = g(node, "label");
      if (!nonempty(label) || [...label].length > 80) errors.push(issue("ARGUMENT_NODE_LABEL", `${path}.label`, "Argument node label must contain one to 80 characters."));
      if (!new Set(["observed", "derived", "conditional", "unresolved"]).has(g(node, "status"))) errors.push(issue("ARGUMENT_NODE_STATUS", `${path}.status`, "Unsupported argument node status."));
      const sources = stringList(g(node, "source_refs"), `${path}.source_refs`, errors);
      if (!sources.length) errors.push(issue("ARGUMENT_NODE_SOURCE", `${path}.source_refs`, "Every public argument node requires source lineage."));
    });
    if (argumentNodeIds.length !== new Set(argumentNodeIds).size) errors.push(issue("ARGUMENT_NODE_IDS_UNIQUE", "$.argument_path.nodes", "Argument node IDs must be unique."));
    let edges = g(argumentPath, "edges");
    if (!Array.isArray(edges) || edges.length !== Math.max(nodes.length - 1, 1)) {
      errors.push(issue("ARGUMENT_EDGES", "$.argument_path.edges", "A compact argument path requires one edge between each adjacent node."));
      edges = [];
    }
    const expectedPairs = argumentNodeIds.slice(0, -1).map((item, index) => [item, argumentNodeIds[index + 1]]);
    const observedPairs = [];
    edges.forEach((edge, index) => {
      const path = `$.argument_path.edges[${index}]`;
      if (!isObject(edge)) {
        errors.push(issue("ARGUMENT_EDGE", path, "Argument edge must be an object."));
        return;
      }
      const fromId = g(edge, "from"), toId = g(edge, "to");
      observedPairs.push([pyStr(fromId || ""), pyStr(toId || "")]);
      if (!argumentNodeIds.includes(fromId) || !argumentNodeIds.includes(toId)) errors.push(issue("ARGUMENT_EDGE_REF", path, "Argument edge references an unknown node."));
      if (!new Set(["causes", "enables", "pressures", "confirms", "challenges", "conditions", "settles", "compares"]).has(g(edge, "relation"))) errors.push(issue("ARGUMENT_EDGE_RELATION", `${path}.relation`, "Unsupported argument relation."));
      if (!new Set(["observed", "inferred", "hypothesis"]).has(g(edge, "certainty"))) errors.push(issue("ARGUMENT_EDGE_CERTAINTY", `${path}.certainty`, "Unsupported argument certainty."));
      if (g(edge, "label") !== null && !nonempty(g(edge, "label"))) errors.push(issue("ARGUMENT_EDGE_LABEL", `${path}.label`, "Argument edge label must be null or non-empty."));
    });
    if (observedPairs.length && JSON.stringify(observedPairs) !== JSON.stringify(expectedPairs)) errors.push(issue("ARGUMENT_PATH_ORDER", "$.argument_path.edges", "Edges must connect adjacent nodes in display order."));
    if (g(lineage, "visual_argument_ref") === null) errors.push(issue("ARGUMENT_LINEAGE", "$.lineage.visual_argument_ref", "Argument paths require a VisualArgumentV1 lineage ref."));
  }

  let tradeLogic = g(payload, "trade_logic");
  if (tradeLogic !== null) {
    if (!isObject(tradeLogic)) {
      errors.push(issue("TRADE_LOGIC", "$.trade_logic", "Trade logic must be null or an object."));
      tradeLogic = {};
    }
    if (!/^TLOGIC_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(tradeLogic, "profile_ref") || ""))) errors.push(issue("TRADE_LOGIC_REF", "$.trade_logic.profile_ref", "Invalid TradeLogicProfileV1 ref."));
    for (const [key, allowed] of [
      ["family", TRADE_LOGIC_FAMILIES], ["mechanism", TRADE_LOGIC_MECHANISMS],
      ["expression", TRADE_LOGIC_EXPRESSIONS], ["horizon", TRADE_LOGIC_HORIZONS],
    ]) if (!allowed.has(g(tradeLogic, key))) errors.push(issue("TRADE_LOGIC_CLASS", `$.trade_logic.${key}`, "Unsupported trade logic classification."));
    const tags = stringList(g(tradeLogic, "public_tags"), "$.trade_logic.public_tags", errors);
    if (tags.length < 2 || tags.length > 4) errors.push(issue("TRADE_LOGIC_TAGS", "$.trade_logic.public_tags", "Use two to four public strategy tags."));
    tags.forEach((tag, index) => {
      if ([...tag].length > 24) errors.push(issue("TRADE_LOGIC_TAG_LENGTH", `$.trade_logic.public_tags[${index}]`, "Public tags must not exceed 24 characters."));
      if ([...PUBLIC_BACKEND_TERMS].some((term) => tag.toLowerCase().includes(term.toLowerCase()))) errors.push(issue("PUBLIC_BACKEND_TERM", `$.trade_logic.public_tags[${index}]`, "Backend evidence-state terms cannot appear in public tags."));
    });
  }

  let news = g(payload, "news_anchor");
  if (news !== null) {
    if (!isObject(news)) {
      errors.push(issue("NEWS", "$.news_anchor", "News anchor must be null or an object."));
      news = {};
    }
    for (const key of ["headline", "publisher"]) if (!nonempty(g(news, key))) errors.push(issue("NEWS_FIELD", `$.news_anchor.${key}`, `${key} is required.`));
    parseTime(g(news, "published_at"), "$.news_anchor.published_at", errors);
    if (!new Set(["observed", "provisional", "unconfirmed"]).has(g(news, "status"))) errors.push(issue("NEWS_STATUS", "$.news_anchor.status", "Unsupported news status."));
    const facts = stringList(g(news, "fact_refs"), "$.news_anchor.fact_refs", errors);
    const sources = stringList(g(news, "source_refs"), "$.news_anchor.source_refs", errors);
    if (!facts.length || !sources.length) errors.push(issue("NEWS_LINEAGE", "$.news_anchor", "News requires fact and source references."));
    if (facts.some((item) => !newsFactRefs.includes(item))) errors.push(issue("NEWS_FACT_LINEAGE", "$.news_anchor.fact_refs", "News fact refs must be preserved in lineage."));
  }

  let curve = g(payload, "curve");
  if (!isObject(curve)) {
    errors.push(issue("CURVE", "$.curve", "Curve must be an object."));
    curve = {};
  }
  if (!nonempty(g(curve, "title"))) errors.push(issue("CURVE_TITLE", "$.curve.title", "Curve title is required."));
  const xAxis = isObject(g(curve, "x_axis")) ? g(curve, "x_axis") : {};
  const yAxis = isObject(g(curve, "y_axis")) ? g(curve, "y_axis") : {};
  const xKind = g(xAxis, "kind");
  if (!new Set(["time", "category", "numeric"]).has(xKind)) errors.push(issue("X_AXIS_KIND", "$.curve.x_axis.kind", "x-axis kind must be time, category, or numeric."));
  if (g(yAxis, "kind") !== "value") errors.push(issue("Y_AXIS_KIND", "$.curve.y_axis.kind", "y-axis kind must be value."));
  for (const [axisName, axis] of [["x_axis", xAxis], ["y_axis", yAxis]]) {
    for (const key of ["label", "unit"]) if (!nonempty(g(axis, key))) errors.push(issue("AXIS_FIELD", `$.curve.${axisName}.${key}`, `${key} is required.`));
    if (!new Set(["include", "adaptive"]).has(g(axis, "zero_policy"))) errors.push(issue("ZERO_POLICY", `$.curve.${axisName}.zero_policy`, "Unsupported zero policy."));
  }

  let series = g(curve, "series");
  if (!Array.isArray(series) || series.length < 1 || series.length > 7) {
    errors.push(issue("SERIES", "$.curve.series", "Expected one to seven series."));
    series = [];
  }
  const seriesIds = [], seriesUnits = [];
  let hasForming = false, hasModelled = false, hasDigitized = false;
  series.forEach((item, seriesIndex) => {
    const path = `$.curve.series[${seriesIndex}]`;
    if (!isObject(item)) {
      errors.push(issue("SERIES_OBJECT", path, "Series must be an object."));
      return;
    }
    const seriesId = g(item, "id");
    if (!/^S[1-9][0-9]*$/.test(pyStr(seriesId || ""))) errors.push(issue("SERIES_ID", `${path}.id`, "Invalid series ID."));
    else seriesIds.push(seriesId);
    for (const key of ["label", "unit", "source_ref"]) if (!nonempty(g(item, key))) errors.push(issue("SERIES_FIELD", `${path}.${key}`, `${key} is required.`));
    if (nonempty(g(item, "unit"))) seriesUnits.push(g(item, "unit"));
    if (!new Set(["primary", "benchmark", "driver", "context"]).has(g(item, "role"))) errors.push(issue("SERIES_ROLE", `${path}.role`, "Unsupported series role."));
    const dataKind = g(item, "data_kind");
    if (!new Set(["observed", "formula", "digitized_observed"]).has(dataKind)) errors.push(issue("DATA_KIND", `${path}.data_kind`, "Unsupported data kind."));
    hasDigitized ||= dataKind === "digitized_observed";
    if (dataKind === "formula" && !nonempty(g(item, "formula"))) errors.push(issue("FORMULA_REQUIRED", `${path}.formula`, "Formula series require an explicit formula."));
    if (new Set(["observed", "digitized_observed"]).has(dataKind) && g(item, "formula") !== null) errors.push(issue("OBSERVED_FORMULA", `${path}.formula`, "Observed and digitized series must not carry a formula."));
    if (!new Set(["solid", "dashed", "dotted"]).has(g(item, "stroke_style", "solid"))) errors.push(issue("STROKE_STYLE", `${path}.stroke_style`, "Unsupported stroke style."));
    if (g(item, "color_role") !== null && !new Set(["focus", "positive", "comparison", "support", "violet", "context", "risk"]).has(g(item, "color_role"))) errors.push(issue("COLOR_ROLE", `${path}.color_role`, "Unsupported series color role."));
    const baseline = g(item, "baseline");
    if (baseline !== null) {
      if (!isObject(baseline) || typeof g(baseline, "value") !== "number" || !Number.isFinite(g(baseline, "value"))) errors.push(issue("BASELINE", `${path}.baseline`, "Baseline requires a numeric value."));
      else {
        parseTime(g(baseline, "observed_at"), `${path}.baseline.observed_at`, errors);
        if (!nonempty(g(baseline, "source_ref"))) errors.push(issue("BASELINE_SOURCE", `${path}.baseline.source_ref`, "Baseline source is required."));
      }
    }
    const points = g(item, "points");
    if (!Array.isArray(points) || points.length < 2 || points.length > 500) {
      errors.push(issue("POINTS", `${path}.points`, "Series require two to 500 points."));
      return;
    }
    const ordered = [];
    points.forEach((point, pointIndex) => {
      const pointPath = `${path}.points[${pointIndex}]`;
      if (!isObject(point)) {
        errors.push(issue("POINT_OBJECT", pointPath, "Point must be an object."));
        return;
      }
      const observedX = xValue(g(point, "x"), pyStr(xKind), `${pointPath}.x`, errors);
      if (typeof observedX === "number") ordered.push(observedX);
      const y = g(point, "y");
      if (typeof y !== "number" || !Number.isFinite(y)) errors.push(issue("POINT_Y", `${pointPath}.y`, "Point y must be finite."));
      const pointState = g(point, "state");
      if (!new Set(["sealed", "forming", "modelled"]).has(pointState)) errors.push(issue("POINT_STATE", `${pointPath}.state`, "Unsupported point state."));
      hasForming ||= pointState === "forming";
      hasModelled ||= pointState === "modelled";
      if (g(point, "source_ref") !== null && !nonempty(g(point, "source_ref"))) errors.push(issue("POINT_SOURCE", `${pointPath}.source_ref`, "Point source must be null or non-empty."));
      if (g(point, "label") !== null && !nonempty(g(point, "label"))) errors.push(issue("POINT_LABEL", `${pointPath}.label`, "Point label must be null or non-empty."));
      if (pointState === "modelled" && dataKind !== "formula") errors.push(issue("MODELLED_OBSERVED", pointPath, "Modelled points require a formula series."));
    });
    if (new Set(["time", "numeric"]).has(xKind) && ordered.some((item, index) => index > 0 && item < ordered[index - 1])) errors.push(issue("POINT_ORDER", `${path}.points`, "Time and numeric points must be sorted by x."));
  });
  if (seriesIds.length !== new Set(seriesIds).size) errors.push(issue("SERIES_IDS_UNIQUE", "$.curve.series", "Series IDs must be unique."));
  if (new Set(seriesUnits).size > 1) errors.push(issue("MIXED_UNITS", "$.curve.series", "One figure y-axis cannot combine different units."));
  const dataFidelity = g(curve, "data_fidelity", "native_series");
  if (!new Set(["native_series", "source_chart_redraw"]).has(dataFidelity)) errors.push(issue("DATA_FIDELITY", "$.curve.data_fidelity", "Unsupported curve data fidelity."));
  if (hasDigitized && dataFidelity !== "source_chart_redraw") errors.push(issue("DIGITIZED_FIDELITY", "$.curve.data_fidelity", "Digitized series require source_chart_redraw fidelity."));
  if (dataFidelity === "source_chart_redraw" && !hasDigitized) errors.push(issue("REDRAW_SERIES", "$.curve.series", "Source-chart redraw fidelity requires at least one digitized series."));
  if (g(curve, "methodology") !== null && !nonempty(g(curve, "methodology"))) errors.push(issue("METHODOLOGY", "$.curve.methodology", "Methodology must be null or non-empty."));

  let markers = g(curve, "markers");
  if (!Array.isArray(markers) || markers.length > 8) {
    errors.push(issue("MARKERS", "$.curve.markers", "Markers must be an array of at most eight items."));
    markers = [];
  }
  const markerIds = [], markerKinds = [];
  markers.forEach((marker, markerIndex) => {
    const path = `$.curve.markers[${markerIndex}]`;
    if (!isObject(marker)) {
      errors.push(issue("MARKER_OBJECT", path, "Marker must be an object."));
      return;
    }
    const markerId = g(marker, "id");
    if (!/^M[1-9][0-9]*$/.test(pyStr(markerId || ""))) errors.push(issue("MARKER_ID", `${path}.id`, "Invalid marker ID."));
    else markerIds.push(markerId);
    markerKinds.push(pyStr(g(marker, "kind") || ""));
    xValue(g(marker, "x"), pyStr(xKind), `${path}.x`, errors);
    if (!nonempty(g(marker, "label")) || !nonempty(g(marker, "source_ref"))) errors.push(issue("MARKER_FIELD", path, "Marker label and source are required."));
    if (!new Set(["observed", "derived", "proposed"]).has(g(marker, "status"))) errors.push(issue("MARKER_STATUS", `${path}.status`, "Unsupported marker status."));
  });
  if (markerIds.length !== new Set(markerIds).size) errors.push(issue("MARKER_IDS_UNIQUE", "$.curve.markers", "Marker IDs must be unique."));

  const objectSeries = series.filter(isObject);
  if (grammar === "event_reaction" && (news === null || !markerKinds.includes("event") || xKind !== "time")) errors.push(issue("EVENT_REACTION_INPUTS", "$", "event_reaction requires a news anchor, event marker, and time axis."));
  if (grammar === "relative_strength") {
    const comparable = objectSeries.filter((item) => new Set(["return_from_baseline", "normalized_index"]).has(g(item, "transformation")));
    const excess = objectSeries.filter((item) => g(item, "transformation") === "excess_return");
    if (!excess.length) {
      const roles = new Set(comparable.map((item) => g(item, "role")));
      const baselines = comparable.map((item) => g(item, "baseline"));
      const baselineTimes = new Set(baselines.filter(isObject).map((item) => g(item, "observed_at")));
      if (!["primary", "benchmark"].every((item) => roles.has(item)) || comparable.length < 2 || baselines.includes(null) || baselineTimes.size !== 1) errors.push(issue("RELATIVE_INPUTS", "$.curve.series", "relative_strength requires synchronized primary and benchmark baselines or one excess-return series."));
    }
  }
  if (grammar === "expectation_revision" && !objectSeries.some((item) => g(item, "transformation") === "revision")) errors.push(issue("REVISION_SERIES", "$.curve.series", "expectation_revision requires a revision series."));
  if (grammar === "fundamental_driver" && !objectSeries.some((item) => g(item, "role") === "driver")) errors.push(issue("DRIVER_SERIES", "$.curve.series", "fundamental_driver requires a driver series."));
  if (grammar === "positioning_pressure" && !objectSeries.some((item) => new Set(["flow", "positioning"]).has(g(item, "transformation")))) errors.push(issue("POSITIONING_SERIES", "$.curve.series", "positioning_pressure requires flow or positioning history."));
  if (grammar === "sensitivity_curve" && (xKind !== "numeric" || !objectSeries.length || objectSeries.some((item) => g(item, "data_kind") !== "formula"))) errors.push(issue("SENSITIVITY_INPUTS", "$.curve", "sensitivity_curve requires a numeric x-axis and formula series."));
  if (grammar === "instrument_map") {
    const item = objectSeries[0];
    const points = isObject(item) && Array.isArray(g(item, "points")) ? g(item, "points") : [];
    const validMap = xKind === "numeric" && objectSeries.length === 1 && g(item, "transformation") === "risk_exposure_map"
      && g(item, "data_kind") === "formula" && nonempty(g(item, "formula")) && points.length >= 2 && points.length <= 8
      && points.every((point) => isObject(point) && nonempty(g(point, "label")) && nonempty(g(point, "source_ref")))
      && points.every((point) => g(point, "state") !== "modelled");
    if (!validMap) errors.push(issue("INSTRUMENT_MAP_INPUTS", "$.curve", "instrument_map requires one formula-backed risk_exposure_map series, a numeric x-axis, and two to eight labeled, sourced, non-modelled vehicle points."));
  }
  if (hasModelled && (grammar !== "sensitivity_curve" || xKind !== "numeric")) errors.push(issue("MODELLED_PATH", "$.curve.series", "Modelled points are restricted to numeric sensitivity curves."));

  let keyNumbers = g(payload, "key_numbers");
  if (!Array.isArray(keyNumbers) || keyNumbers.length < 2 || keyNumbers.length > 4) {
    errors.push(issue("KEY_NUMBERS", "$.key_numbers", "Expected two to four key numbers."));
    keyNumbers = [];
  }
  const keyIds = [];
  keyNumbers.forEach((item, index) => {
    const path = `$.key_numbers[${index}]`;
    if (!isObject(item)) {
      errors.push(issue("KEY_NUMBER_OBJECT", path, "Key number must be an object."));
      return;
    }
    if (!/^K[1-9][0-9]*$/.test(pyStr(g(item, "id") || ""))) errors.push(issue("KEY_NUMBER_ID", `${path}.id`, "Invalid key number ID."));
    else keyIds.push(g(item, "id"));
    for (const key of ["label", "display_value", "unit", "source_ref"]) if (!nonempty(g(item, key))) errors.push(issue("KEY_NUMBER_FIELD", `${path}.${key}`, `${key} is required.`));
    if (g(item, "as_of") !== null) parseTime(g(item, "as_of"), `${path}.as_of`, errors);
    if (g(item, "status") === "provisional" && g(item, "as_of") === null) errors.push(issue("PROVISIONAL_AS_OF", `${path}.as_of`, "Provisional numbers require an as-of time."));
    if (g(item, "status") === "modelled" && grammar !== "sensitivity_curve") errors.push(issue("MODELLED_NUMBER", path, "Modelled key numbers are restricted to sensitivity curves."));
  });
  if (keyIds.length !== new Set(keyIds).size) errors.push(issue("KEY_NUMBER_IDS_UNIQUE", "$.key_numbers", "Key number IDs must be unique."));

  const countercase = g(payload, "countercase");
  if (countercase !== null) {
    if (!isObject(countercase) || !nonempty(g(countercase, "label")) || !nonempty(g(countercase, "condition"))) errors.push(issue("COUNTERCASE", "$.countercase", "Countercase requires a label and condition."));
    else if (!stringList(g(countercase, "source_refs"), "$.countercase.source_refs", errors).length) errors.push(issue("COUNTERCASE_SOURCE", "$.countercase.source_refs", "Countercase requires source lineage."));
  }

  let settlement = g(payload, "settlement");
  if (!isObject(settlement)) {
    errors.push(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."));
    settlement = {};
  }
  const settleable = g(settlement, "settleable");
  if (typeof settleable !== "boolean") errors.push(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."));
  const claimRef = g(settlement, "claim_ref");
  if (settleable) {
    if (!nonempty(claimRef) || !nonempty(g(settlement, "success_line"))) errors.push(issue("SETTLEMENT_FIELDS", "$.settlement", "Settleable figures require claim_ref and success_line."));
    parseTime(g(settlement, "deadline_at"), "$.settlement.deadline_at", errors);
    if (claimRef !== g(lineage, "settlement_claim_ref")) errors.push(issue("SETTLEMENT_LINEAGE", "$.settlement.claim_ref", "Settlement ref must match lineage."));
  } else if (["claim_ref", "deadline_at", "success_line"].some((key) => g(settlement, key) !== null)) errors.push(issue("NONSETTLEABLE_FIELDS", "$.settlement", "Non-settleable figures must use null claim, deadline, and success line."));

  let render = g(payload, "render");
  if (!isObject(render)) {
    errors.push(issue("RENDER", "$.render", "Render settings must be an object."));
    render = {};
  }
  const layout = g(render, "layout");
  const expectedDimensions = new Map([["compact", [720, 420]], ["editorial", [1200, 760]]]);
  if (!expectedDimensions.has(layout)) errors.push(issue("LAYOUT", "$.render.layout", "Layout must be compact or editorial."));
  else if (g(render, "width") !== expectedDimensions.get(layout)[0] || g(render, "height") !== expectedDimensions.get(layout)[1]) {
    const [expectedWidth, expectedHeight] = expectedDimensions.get(layout);
    errors.push(issue("DIMENSIONS", "$.render", `${layout} figures use ${expectedWidth} x ${expectedHeight}.`));
  }
  if (!new Set(["cuebook_light", "cuebook_dark"]).has(g(render, "theme"))) errors.push(issue("THEME", "$.render.theme", "Unsupported theme."));
  if (g(render, "watermark") !== "Cuebook") errors.push(issue("WATERMARK", "$.render.watermark", "Cuebook watermark is required."));
  const semanticMode = g(render, "semantic_mode", "curve_only");
  if (!new Set(["curve_only", "argument_curve"]).has(semanticMode)) errors.push(issue("SEMANTIC_MODE", "$.render.semantic_mode", "Unsupported semantic render mode."));
  if (semanticMode === "argument_curve" && argumentPath === null) errors.push(issue("ARGUMENT_PATH_REQUIRED", "$.argument_path", "argument_curve mode requires an argument path."));
  if (semanticMode === "argument_curve" && tradeLogic === null) errors.push(issue("TRADE_LOGIC_REQUIRED", "$.trade_logic", "argument_curve mode requires a TradeLogicProfileV1 summary."));
  if (semanticMode === "curve_only" && argumentPath !== null) errors.push(issue("ARGUMENT_PATH_UNUSED", "$.render.semantic_mode", "An argument path must be rendered with argument_curve mode."));
  let focusSeriesIds = g(render, "focus_series_ids", []);
  if (focusSeriesIds !== null) {
    focusSeriesIds = stringList(focusSeriesIds, "$.render.focus_series_ids", errors);
    if (focusSeriesIds.length > 4) errors.push(issue("FOCUS_SERIES_LIMIT", "$.render.focus_series_ids", "Compact focus is limited to four series."));
    if (focusSeriesIds.some((item) => !seriesIds.includes(item))) errors.push(issue("FOCUS_SERIES_REF", "$.render.focus_series_ids", "Focus series IDs must reference curve series."));
  }
  let endpointSeriesIds = g(render, "endpoint_series_ids", []);
  if (endpointSeriesIds !== null) {
    endpointSeriesIds = stringList(endpointSeriesIds, "$.render.endpoint_series_ids", errors);
    if (endpointSeriesIds.length > 4) errors.push(issue("ENDPOINT_SERIES_LIMIT", "$.render.endpoint_series_ids", "Endpoint labels are limited to four series."));
    if (endpointSeriesIds.some((item) => !seriesIds.includes(item))) errors.push(issue("ENDPOINT_SERIES_REF", "$.render.endpoint_series_ids", "Endpoint series IDs must reference curve series."));
  }

  const [qualityWarnings] = validateQuality(g(payload, "quality_report"), state, errors);
  if (hasForming && (state !== "conditional" || !qualityWarnings.some((warning) => warning.toLowerCase().includes("forming") || warning.includes("形成")))) errors.push(issue("FORMING_DISCLOSURE", "$.quality_report", "Forming data requires conditional state and an explicit warning."));
  if (hasDigitized) {
    const redrawDisclosed = qualityWarnings.some((warning) => ["digitized", "source-chart", "source chart", "重绘", "截图"].some((token) => warning.toLowerCase().includes(token)));
    if (state !== "conditional" || !redrawDisclosed) errors.push(issue("DIGITIZED_DISCLOSURE", "$.quality_report", "Digitized source-chart series require conditional state and an explicit redraw warning."));
    if (settleable) errors.push(issue("DIGITIZED_SETTLEMENT", "$.settlement", "Source-chart redraws cannot be used for settlement."));
  }
  if (grammar === "event_reaction" && news !== null && g(news, "status") !== "observed" && state !== "conditional") errors.push(issue("NEWS_UNCERTAINTY", "$.state", "Provisional or unconfirmed news requires a conditional figure."));
  return { valid: errors.length === 0, errors, warnings: warningsOut };
}

export function validateManifest(payload, assetRoot = null) {
  const errors = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  const payloadKeys = new Set(Object.keys(payload));
  for (const key of sorted(setDifference(MANIFEST_FIELDS, payloadKeys))) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of sorted(setDifference(payloadKeys, MANIFEST_FIELDS))) errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  if (g(payload, "schema_version") !== "market-figure-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-figure-v1."));
  if (!/^FIGURE_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(payload, "figure_id") || ""))) errors.push(issue("FIGURE_ID", "$.figure_id", "Invalid figure ID."));
  if (!/^FIGSPEC_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(payload, "spec_ref") || ""))) errors.push(issue("SPEC_REF", "$.spec_ref", "Invalid figure spec ref."));
  if (!GRAMMARS.has(g(payload, "grammar"))) errors.push(issue("GRAMMAR", "$.grammar", "Unsupported curve grammar."));
  const layout = g(payload, "layout");
  if (!new Set(["compact", "editorial"]).has(layout)) errors.push(issue("LAYOUT", "$.layout", "Layout must be compact or editorial."));
  const state = g(payload, "state");
  if (!STATES.has(state)) errors.push(issue("STATE", "$.state", "Unsupported figure state."));
  parseTime(g(payload, "generated_at"), "$.generated_at", errors);
  const dimensions = isObject(g(payload, "dimensions")) ? g(payload, "dimensions") : {};
  const expectedDimensions = new Map([["compact", [720, 420]], ["editorial", [1200, 760]]]);
  if (expectedDimensions.has(layout) && (g(dimensions, "width") !== expectedDimensions.get(layout)[0] || g(dimensions, "height") !== expectedDimensions.get(layout)[1])) {
    const [expectedWidth, expectedHeight] = expectedDimensions.get(layout);
    errors.push(issue("DIMENSIONS", "$.dimensions", `${layout} figures use ${expectedWidth} x ${expectedHeight}.`));
  }
  const lineage = isObject(g(payload, "lineage")) ? g(payload, "lineage") : {};
  for (const key of ["input_artifact_refs", "series_refs", "marker_refs", "key_number_refs", "news_fact_refs", "source_refs"]) stringList(g(lineage, key), `$.lineage.${key}`, errors);
  if (Object.hasOwn(lineage, "argument_node_refs")) stringList(g(lineage, "argument_node_refs"), "$.lineage.argument_node_refs", errors);
  if (g(lineage, "trade_logic_ref") !== null && !/^TLOGIC_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(lineage, "trade_logic_ref") || ""))) errors.push(issue("TRADE_LOGIC_REF", "$.lineage.trade_logic_ref", "Invalid TradeLogicProfileV1 ref."));
  const content = isObject(g(payload, "content")) ? g(payload, "content") : {};
  for (const key of ["headline", "viewpoint", "curve_title"]) if (!nonempty(g(content, key))) errors.push(issue("CONTENT_FIELD", `$.content.${key}`, `${key} is required.`));
  if (Object.hasOwn(content, "argument_path_labels")) stringList(g(content, "argument_path_labels"), "$.content.argument_path_labels", errors);
  if (Object.hasOwn(content, "strategy_tags")) {
    const tags = stringList(g(content, "strategy_tags"), "$.content.strategy_tags", errors);
    tags.forEach((tag, index) => {
      if ([...PUBLIC_BACKEND_TERMS].some((term) => tag.toLowerCase().includes(term.toLowerCase()))) errors.push(issue("PUBLIC_BACKEND_TERM", `$.content.strategy_tags[${index}]`, "Backend evidence-state terms cannot appear in public tags."));
    });
  }
  if (g(content, "watermark") !== "Cuebook") errors.push(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."));
  const asset = isObject(g(payload, "asset")) ? g(payload, "asset") : {};
  const svgRef = g(asset, "svg_ref"), contentHash = g(asset, "content_hash");
  if (!nonempty(svgRef)) errors.push(issue("SVG_REF", "$.asset.svg_ref", "SVG reference is required."));
  if (!/^sha256:[a-f0-9]{64}$/.test(pyStr(contentHash || ""))) errors.push(issue("CONTENT_HASH", "$.asset.content_hash", "Expected sha256:<64 lowercase hex characters>."));
  if (assetRoot !== null && nonempty(svgRef)) {
    const path = isAbsolute(svgRef) ? svgRef : join(assetRoot, svgRef);
    if (!existsSync(path) || !statSync(path).isFile()) errors.push(issue("ASSET_MISSING", "$.asset.svg_ref", `Asset does not exist: ${path}.`));
    else if (/^sha256:[a-f0-9]{64}$/.test(pyStr(contentHash || ""))) {
      const observed = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
      if (observed !== contentHash) errors.push(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."));
    }
  }
  validateQuality(g(payload, "quality_report"), state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validate(payload, assetRoot = null) {
  return isObject(payload) && g(payload, "schema_version") === "market-figure-v1"
    ? validateManifest(payload, assetRoot)
    : validateSpec(payload);
}

function parseArgs(argv) {
  let artifact = null, assetRoot = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--asset-root") assetRoot = argv[++index];
    else if (artifact === null) artifact = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (artifact === null) throw new Error("the following arguments are required: artifact");
  return { artifact, assetRoot };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: validate_market_figure.mjs artifact [--asset-root ASSET_ROOT]\nvalidate_market_figure.mjs: error: ${error.message}\n`);
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(args.artifact, "utf8"));
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("LOAD", "$", error.message)], warnings: [] }, null, 2)}\n`);
    return 1;
  }
  const result = validate(payload, args.assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
