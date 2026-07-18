#!/usr/bin/env node
// Validate TradeLogicProfileV1 artifacts.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import process from "node:process";

const DESCRIPTION = "Validate TradeLogicProfileV1 artifacts.";

const ROOT_FIELDS = new Set([
  "schema_version",
  "profile_id",
  "revision",
  "state",
  "lineage",
  "classification",
  "stance",
  "public_expression",
  "evidence_boundary",
  "quality_report",
]);
const FAMILIES = new Set(["event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility", "liquidity_microstructure", "carry_income"]);
const CATALYSTS = new Set(["corporate_action", "earnings", "product", "policy", "macro_data", "geopolitical", "supply_demand", "technical_break", "flow_positioning", "valuation_dislocation", "none"]);
const MECHANISMS = new Set(["risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag", "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation", "volatility_repricing", "carry_roll_down", "cross_asset_transmission"]);
const EXPRESSIONS = new Set(["outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket", "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade"]);
const HORIZONS = new Set(["intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural"]);
const EDGES = new Set(["information", "causal", "structural", "behavioral", "mechanical", "valuation", "timing"]);
const DIRECTIONS = new Set(["long", "short", "outperform", "underperform", "long_vol", "short_vol", "steepener", "flattener", "neutral"]);
const BACKEND_TERMS = new Set([
  "已确认",
  "已计算",
  "推演",
  "待确认",
  "形成中",
  "交给市场验证",
  "等待确认",
  "observed",
  "derived",
  "provisional",
  "conditional",
  "confirmed",
  "pending",
]);
const FACTOR_MECHANISMS = new Set(["valuation_mean_reversion", "fundamental_compounding", "momentum_continuation"]);
const MICROSTRUCTURE_MECHANISMS = new Set(["forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag"]);

// Characters stripped by Python str.strip() with no arguments.
const PY_WHITESPACE = "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STRIP_RE = new RegExp(`^[${PY_WHITESPACE}]+|[${PY_WHITESPACE}]+$`, "g");

function pyStrip(value) {
  return value.replace(STRIP_RE, "");
}

// Reproduce Python repr() for parsed-JSON values (used by pyStr for containers).
function pyrepr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const hasSingle = value.includes("'");
    const hasDouble = value.includes('"');
    const quote = hasSingle && !hasDouble ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyrepr).join(", ")}]`;
  const parts = Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`);
  return `{${parts.join(", ")}}`;
}

// Python str() over parsed-JSON values.
function pyStr(value) {
  if (typeof value === "string") return value;
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  return pyrepr(value);
}

function codePointLength(value) {
  return [...value].length;
}

// Python truthiness for parsed-JSON values (`value or ""` fallbacks).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function nonempty(value) {
  return typeof value === "string" && pyStrip(value).length > 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year, month) {
  if (month === 2 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return 29;
  return DAYS_IN_MONTH[month - 1];
}

// Acceptance-compatible port of datetime.fromisoformat (Python 3.11+) for the
// forms this validator can meet. Returns null when unparsable, otherwise
// { hasTz } — the parsed instant itself is never used downstream.
function parsePyIsoDatetime(value) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})([\s\S]*)$/.exec(value) || /^(\d{4})(\d{2})(\d{2})([\s\S]*)$/.exec(value);
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  let rest = dateMatch[4];
  if (rest === "") return { hasTz: false };
  // Any single character may separate date and time (Python 3.11+).
  rest = rest.slice(1);
  const timeMatch = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?|(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?([\s\S]*)$/.exec(rest);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = timeMatch[2] !== undefined ? Number(timeMatch[2]) : timeMatch[5] !== undefined ? Number(timeMatch[5]) : 0;
  const second = timeMatch[3] !== undefined ? Number(timeMatch[3]) : timeMatch[6] !== undefined ? Number(timeMatch[6]) : 0;
  const fraction = timeMatch[4] !== undefined ? timeMatch[4] : timeMatch[7];
  if (minute > 59 || second > 59) return null;
  // Hour 24 is accepted only as exact midnight (rolls to the next day).
  if (hour > 24 || (hour === 24 && (minute !== 0 || second !== 0 || (fraction !== undefined && Number(fraction) !== 0)))) return null;
  const offsetPart = timeMatch[8];
  if (offsetPart === "") return { hasTz: false };
  if (offsetPart === "Z") return { hasTz: true };
  const offsetMatch = /^([+-])(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?|(\d{2})(?:(\d{2}))?)?$/.exec(offsetPart);
  if (!offsetMatch) return null;
  const offsetHour = Number(offsetMatch[2]);
  const offsetMinute = offsetMatch[3] !== undefined ? Number(offsetMatch[3]) : offsetMatch[6] !== undefined ? Number(offsetMatch[6]) : 0;
  const offsetSecond = offsetMatch[4] !== undefined ? Number(offsetMatch[4]) : offsetMatch[7] !== undefined ? Number(offsetMatch[7]) : 0;
  if (offsetHour > 23 || offsetMinute > 59 || offsetSecond > 59) return null;
  return { hasTz: true };
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = parsePyIsoDatetime(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!parsed.hasTz) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed;
}

export function stringList(value, path, errors, require = false) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) {
      errors.push(issue("STRING_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    } else {
      result.push(pyStrip(item));
    }
  });
  if (new Set(result).size !== result.length) {
    errors.push(issue("STRING_UNIQUE", path, "Strings must be unique."));
  }
  if (require && result.length === 0) {
    errors.push(issue("STRING_REQUIRED", path, "At least one item is required."));
  }
  return result;
}

export function containsBackendTerm(value) {
  const lowered = value.toLowerCase();
  for (const term of BACKEND_TERMS) {
    if (lowered.includes(term.toLowerCase())) return true;
  }
  return false;
}

export function validateQuality(value, state, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    return;
  }
  const decision = value.decision;
  const warnings = stringList(value.warnings, "$.quality_report.warnings", errors);
  const failures = stringList(value.hard_failures, "$.quality_report.hard_failures", errors);
  if (!["ready", "conditional", "blocked"].includes(decision)) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  }
  if (state === "conditional" && (decision !== "conditional" || warnings.length === 0)) {
    errors.push(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires conditional quality and a warning."));
  }
  if ((state === "ready" || state === "frozen") && (decision !== "ready" || warnings.length > 0 || failures.length > 0)) {
    errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."));
  }
  if (failures.length > 0 && decision !== "blocked") {
    errors.push(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."));
  }
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function validate(payload) {
  const errors = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }
  const payloadKeys = new Set(Object.keys(payload));
  for (const key of [...ROOT_FIELDS].filter((item) => !payloadKeys.has(item)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of [...payloadKeys].filter((item) => !ROOT_FIELDS.has(item)).sort()) {
    errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "trade-logic-profile-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected trade-logic-profile-v1."));
  }
  if (!/^(?:TLOGIC_[A-Za-z0-9_:-]{8,})$/.test(pyStr(pyTruthy(payload.profile_id) ? payload.profile_id : ""))) {
    errors.push(issue("PROFILE_ID", "$.profile_id", "Invalid profile ID."));
  }
  const revision = payload.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || (Object.hasOwn(payload, "revision") ? revision : 0) < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }
  const state = payload.state;
  if (!["draft", "conditional", "ready", "frozen"].includes(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }

  const lineage = asObject(payload.lineage);
  const inputRefs = stringList(lineage.input_artifact_refs, "$.lineage.input_artifact_refs", errors, true);
  const sourceRefs = stringList(lineage.source_refs, "$.lineage.source_refs", errors, true);
  parseTime(lineage.decision_cutoff_at, "$.lineage.decision_cutoff_at", errors);

  const classification = asObject(payload.classification);
  const family = classification.family;
  const catalyst = classification.catalyst;
  const mechanism = classification.mechanism;
  const expression = classification.expression;
  const horizon = classification.horizon;
  const edge = classification.edge;
  for (const [value, allowed, path] of [
    [family, FAMILIES, "$.classification.family"],
    [catalyst, CATALYSTS, "$.classification.catalyst"],
    [mechanism, MECHANISMS, "$.classification.mechanism"],
    [expression, EXPRESSIONS, "$.classification.expression"],
    [horizon, HORIZONS, "$.classification.horizon"],
    [edge, EDGES, "$.classification.edge"],
  ]) {
    if (!allowed.has(value)) {
      errors.push(issue("CLASSIFICATION", path, "Unsupported classification value."));
    }
  }
  const rationaleRefs = stringList(classification.rationale_refs, "$.classification.rationale_refs", errors, true);
  if (rationaleRefs.some((ref) => !inputRefs.includes(ref) && !sourceRefs.includes(ref))) {
    errors.push(issue("RATIONALE_LINEAGE", "$.classification.rationale_refs", "Rationale refs must resolve to input or source lineage."));
  }
  if (family === "event_driven" && catalyst === "none") {
    errors.push(issue("EVENT_CATALYST", "$.classification.catalyst", "Event-driven logic requires a catalyst."));
  }
  if (family === "factor_style" && !FACTOR_MECHANISMS.has(mechanism)) {
    errors.push(issue("FACTOR_MECHANISM", "$.classification.mechanism", "Factor-style logic requires a factor-compatible mechanism."));
  }
  if (family === "liquidity_microstructure" && !MICROSTRUCTURE_MECHANISMS.has(mechanism)) {
    errors.push(issue("MICROSTRUCTURE_MECHANISM", "$.classification.mechanism", "Liquidity/microstructure logic requires an order-flow, positioning, liquidity, or price-discovery mechanism."));
  }

  const stance = asObject(payload.stance);
  const asset = stance.primary_asset;
  const direction = stance.direction;
  const comparator = stance.comparator;
  if (!nonempty(asset)) {
    errors.push(issue("PRIMARY_ASSET", "$.stance.primary_asset", "Primary asset is required."));
  }
  if (!DIRECTIONS.has(direction)) {
    errors.push(issue("DIRECTION", "$.stance.direction", "Unsupported stance direction."));
  }
  if (comparator !== null && comparator !== undefined && !nonempty(comparator)) {
    errors.push(issue("COMPARATOR", "$.stance.comparator", "Comparator must be null or non-empty."));
  }
  const horizonLabel = stance.horizon_label;
  if (!nonempty(horizonLabel) || codePointLength(pyStr(pyTruthy(horizonLabel) ? horizonLabel : "")) > 24) {
    errors.push(issue("HORIZON_LABEL", "$.stance.horizon_label", "Horizon label must contain one to 24 characters."));
  }
  if (expression === "relative_value_pair") {
    if (!nonempty(comparator)) {
      errors.push(issue("RELATIVE_COMPARATOR", "$.stance.comparator", "Relative-value pairs require a comparator."));
    }
    if (direction !== "outperform" && direction !== "underperform") {
      errors.push(issue("RELATIVE_DIRECTION", "$.stance.direction", "Relative-value pairs require outperform or underperform direction."));
    }
  }

  const publicExpression = asObject(payload.public_expression);
  const action = publicExpression.action_line;
  const because = publicExpression.because_line;
  if (!nonempty(action) || codePointLength(pyStr(pyTruthy(action) ? action : "")) > 100) {
    errors.push(issue("ACTION_LINE", "$.public_expression.action_line", "Action line must contain one to 100 characters."));
  } else if (nonempty(asset) && !action.toLowerCase().includes(asset.toLowerCase())) {
    errors.push(issue("ACTION_ASSET", "$.public_expression.action_line", "Action line must name the primary asset."));
  }
  if (!nonempty(because) || codePointLength(pyStr(pyTruthy(because) ? because : "")) > 160) {
    errors.push(issue("BECAUSE_LINE", "$.public_expression.because_line", "Because line must contain one to 160 characters."));
  }
  const tags = stringList(publicExpression.tags, "$.public_expression.tags", errors, true);
  if (!(tags.length >= 2 && tags.length <= 4)) {
    errors.push(issue("TAG_COUNT", "$.public_expression.tags", "Use two to four public tags."));
  }
  tags.forEach((value, index) => {
    if (codePointLength(value) > 24) {
      errors.push(issue("TAG_LENGTH", `$.public_expression.tags[${index}]`, "Public tags must not exceed 24 characters."));
    }
    if (containsBackendTerm(value)) {
      errors.push(issue("PUBLIC_BACKEND_TERM", `$.public_expression.tags[${index}]`, "Backend evidence-state terms cannot appear in public tags."));
    }
  });
  for (const [key, value] of [["action_line", action], ["because_line", because]]) {
    if (nonempty(value) && containsBackendTerm(value)) {
      errors.push(issue("PUBLIC_BACKEND_TERM", `$.public_expression.${key}`, "Backend evidence-state or workflow terms cannot appear in public expression."));
    }
  }

  const boundary = asObject(payload.evidence_boundary);
  for (const key of ["observed_claim_refs", "inferred_claim_refs", "missing_requirement_refs"]) {
    stringList(boundary[key], `$.evidence_boundary.${key}`, errors);
  }
  if (boundary.public_status_suppressed !== true) {
    errors.push(issue("PUBLIC_STATUS", "$.evidence_boundary.public_status_suppressed", "Public evidence status must be suppressed."));
  }
  validateQuality(payload.quality_report, state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(`usage: validate_trade_logic.mjs [-h] artifact\n\n${DESCRIPTION}\n`);
    return 0;
  }
  const positionals = argv.filter((item) => !item.startsWith("-") || item === "-");
  const flags = argv.filter((item) => item.startsWith("-") && item !== "-");
  if (flags.length > 0 || positionals.length !== 1) {
    process.stderr.write("usage: validate_trade_logic.mjs [-h] artifact\n");
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(positionals[0], "utf-8"));
  } catch (exc) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("LOAD", "$", exc.message)], warnings: [] }, null, 2)}\n`);
    return 1;
  }
  const result = validate(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
