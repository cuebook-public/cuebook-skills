#!/usr/bin/env node
// Validate SettlementFormulaV1 and render deterministic public math.
//
// Port of validate_settlement_formula.py. Error codes, paths, message wording,
// JSON output shapes, and the canonical hash are contract and must stay
// byte-compatible with the Python original.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const STATES = new Set(["draft", "ready", "frozen"]);
export const DIRECTIONS = new Set(["long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"]);
export const VARIABLE_KINDS = new Set(["market_observation", "derived_metric", "event_observation"]);
export const VALUE_TYPES = new Set(["number", "boolean", "datetime"]);
export const NUMERIC_OPS = new Set(["add", "sub", "mul", "div", "mean"]);
export const COMPARISON_OPS = new Set(["gt", "gte", "lt", "lte", "eq", "between"]);
export const BOOLEAN_OPS = new Set(["and", "or", "not"]);
export const ALL_OPS = new Set(["literal", "var", "capture", ...NUMERIC_OPS, ...COMPARISON_OPS, ...BOOLEAN_OPS]);
export const FORMULA_FAMILIES = new Set([
  "single_asset_direction",
  "single_asset_price_target",
  "pair_asset_direction",
  "pair_asset_price_targets",
]);
export const DIRECTION_FAMILIES = new Set(["single_asset_direction", "pair_asset_direction"]);
export const TARGET_FAMILIES = new Set(["single_asset_price_target", "pair_asset_price_targets"]);
const DECIMAL_RE = /^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?)$/;

export function issue(code, path, message) {
  return { code, path, message };
}

// --- Python parity helpers -------------------------------------------------

// Missing keys read as Python's dict.get(...) -> None.
function getv(obj, key) {
  const value = obj[key];
  return value === undefined ? null : value;
}

// Python str() for the JSON value types that can reach messages or dict keys.
function pyStr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

// Python truthiness for JSON values (empty dict/list are falsy).
function pyTruthy(value) {
  if (value === null || value === false || value === undefined) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// Python str.strip() whitespace set (differs from JS trim: no ﻿, plus
// the \x1c-\x1f and \x85 separators).
const PY_WHITESPACE = /^[\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
function pyStrip(value) {
  return value.replace(PY_WHITESPACE, "");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function arrayEqual(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

// json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

// --- Exact decimal handling (Python decimal.Decimal parity) -----------------
// Values are decimal strings (<= 18 dp) or JSON numbers; represent them as
// {neg, digits, scale} so threshold/positivity checks and fixed-point
// rendering never round-trip through floats.

function parseDecimal(text) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return null; // Infinity/NaN -> Python's non-finite -> None
  const sign = match[1];
  const intPart = match[2];
  const fracPart = match[3] || "";
  const exponent = match[4] ? Number.parseInt(match[4], 10) : 0;
  let digits = (intPart + fracPart).replace(/^0+(?=\d)/, "");
  const scale = fracPart.length - exponent;
  return { neg: sign === "-", digits, scale };
}

export function isNumber(value) {
  return typeof value === "number";
}

export function isDecimalString(value) {
  return typeof value === "string" && DECIMAL_RE.test(value);
}

export function isNumericLiteral(value) {
  return isNumber(value) || isDecimalString(value);
}

export function decimalValue(value) {
  if (!isNumericLiteral(value)) return null;
  return parseDecimal(typeof value === "string" ? value : String(value));
}

function decimalIsZero(dec) {
  return /^0+$/.test(dec.digits);
}

function decimalIsPositive(dec) {
  return !dec.neg && !decimalIsZero(dec);
}

// format(Decimal, "f"): fixed-point notation, preserving stored scale.
function decimalToFixed(dec) {
  let digits = dec.digits;
  let rendered;
  if (dec.scale <= 0) {
    rendered = digits + "0".repeat(-dec.scale);
  } else {
    if (digits.length <= dec.scale) digits = "0".repeat(dec.scale - digits.length + 1) + digits;
    rendered = `${digits.slice(0, digits.length - dec.scale)}.${digits.slice(digits.length - dec.scale)}`;
  }
  return (dec.neg ? "-" : "") + rendered;
}

export function isUuid(value) {
  // Python: str(UUID(value)) == value.lower() -- only the canonical dashed
  // 8-4-4-4-12 hex form (any case) satisfies the round-trip.
  return typeof value === "string" && /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(value);
}

export function asObject(value) {
  return isPlainObject(value) ? value : {};
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// --- datetime.fromisoformat parity ------------------------------------------
// Returns epoch microseconds plus timezone-awareness, mirroring the practical
// acceptance of Python 3.11+ fromisoformat for calendar dates (extended and
// basic), optional time with any single separator character, hour 24 with
// zero minutes/seconds, "." or "," fractional seconds (truncated to
// microseconds), and numeric offsets strictly under 24h (Z was already
// replaced by the caller; lowercase "z" is rejected, matching Python).
// Known gap vs CPython: ISO week dates ("2026-W01-4") are not accepted.

function daysInMonth(year, month) {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
  return table[month - 1];
}

function parseIsoDatetime(text) {
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) match = /^(\d{4})(\d{2})(\d{2})/.exec(text);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  let rest = text.slice(match[0].length);

  let hour = 0;
  let minute = 0;
  let second = 0;
  let micro = 0;
  let offsetUs = null;
  if (rest.length > 0) {
    rest = rest.slice(1); // any single separator character
    const timeMatch = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?|(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?/.exec(rest);
    if (!timeMatch || timeMatch[0].length === 0) return null;
    hour = Number.parseInt(timeMatch[1], 10);
    minute = Number.parseInt(timeMatch[2] ?? timeMatch[5] ?? "0", 10);
    second = Number.parseInt(timeMatch[3] ?? timeMatch[6] ?? "0", 10);
    const fraction = timeMatch[4] ?? timeMatch[7];
    if (fraction) micro = Number.parseInt(fraction.padEnd(6, "0").slice(0, 6), 10);
    if (hour > 24 || minute > 59 || second > 59) return null;
    if (hour === 24 && (minute !== 0 || second !== 0 || micro !== 0)) return null;
    rest = rest.slice(timeMatch[0].length);

    if (rest.length > 0) {
      const offsetMatch = /^([+-])(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?|(\d{2})(?:(\d{2}))?)?$/.exec(rest);
      if (!offsetMatch) return null;
      const offSign = offsetMatch[1] === "-" ? -1 : 1;
      const offHour = Number.parseInt(offsetMatch[2], 10);
      const offMinute = Number.parseInt(offsetMatch[3] ?? offsetMatch[6] ?? "0", 10);
      const offSecond = Number.parseInt(offsetMatch[4] ?? offsetMatch[7] ?? "0", 10);
      const offMicro = offsetMatch[5] ? Number.parseInt(offsetMatch[5].padEnd(6, "0").slice(0, 6), 10) : 0;
      if (offMinute > 59 || offSecond > 59) return null;
      const totalUs = ((offHour * 3600 + offMinute * 60 + offSecond) * 1_000_000 + offMicro) * offSign;
      if (Math.abs(totalUs) >= 24 * 3600 * 1_000_000) return null;
      offsetUs = totalUs;
    }
  } else if (match[0].length !== text.length) {
    return null;
  }

  const base = new Date(0);
  base.setUTCFullYear(year, month - 1, day);
  base.setUTCHours(hour, minute, second, 0);
  const naiveUs = base.getTime() * 1000 + micro;
  return { us: offsetUs === null ? naiveUs : naiveUs - offsetUs, aware: offsetUs !== null };
}

export function parseTime(value, path, errors, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || !pyStrip(value)) {
    errors.push(issue("DATETIME_REQUIRED", path, "Expected an ISO 8601 timestamp."));
    return null;
  }
  const parsed = parseIsoDatetime(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME_FORMAT", path, "Invalid ISO 8601 timestamp."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("DATETIME_TIMEZONE", path, "Timestamp must include a timezone."));
    return null;
  }
  return parsed.us;
}

export function stringSet(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_SET_TYPE", path, "Expected an array of strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || !pyStrip(item)) {
      errors.push(issue("STRING_SET_VALUE", `${path}[${index}]`, "Expected a non-empty string."));
    } else {
      result.push(pyStrip(item));
    }
  });
  if (result.length !== new Set(result).size) {
    errors.push(issue("STRING_SET_DUPLICATE", path, "Values must be unique."));
  }
  return result;
}

export function canonicalPayload(payload) {
  const result = structuredClone(payload);
  const lineage = asObject(getv(result, "lineage"));
  lineage["canonical_hash"] = null;
  result["lineage"] = lineage;
  return result;
}

export function canonicalHash(payload) {
  return createHash("sha256").update(canonicalJson(canonicalPayload(payload)), "utf8").digest("hex");
}
export { canonicalHash as canonical_hash };

export function formatNumber(value) {
  const parsed = decimalValue(value);
  if (parsed === null) return "?";
  let rendered = decimalToFixed(parsed);
  if (rendered.includes(".")) {
    rendered = rendered.replace(/0+$/, "").replace(/\.$/, "");
  }
  return rendered === "-0" || rendered === "" ? "0" : rendered;
}

export function exprNode(op, args = [], value = null, ref = null) {
  return { op, args: [...args], value, ref, window: null };
}

function entryExpression(leg) {
  const entry = asObject(getv(leg, "entry"));
  if (getv(entry, "mode") === "fixed_snapshot" && isDecimalString(getv(entry, "price"))) {
    return exprNode("literal", [], getv(entry, "price"));
  }
  if (getv(entry, "mode") === "activation_capture" && typeof getv(entry, "capture_ref") === "string") {
    return exprNode("capture", [], null, getv(entry, "capture_ref"));
  }
  return null;
}

function returnBpsExpression(leg) {
  const exitRef = getv(leg, "exit_variable_ref");
  const entry = entryExpression(leg);
  if (typeof exitRef !== "string" || entry === null) return null;
  const rawReturn = exprNode("sub", [
    exprNode("div", [exprNode("var", [], null, exitRef), entry]),
    exprNode("literal", [], "1"),
  ]);
  return exprNode("mul", [rawReturn, exprNode("literal", [], "10000")]);
}

export function canonicalExecutionExpression(profileValue) {
  const profile = asObject(profileValue);
  const family = getv(profile, "formula_family");
  const legs = asArray(getv(profile, "legs")).map((item) => asObject(item));
  const threshold = getv(profile, "direction_threshold_bps");

  if (family === "pair_asset_direction" && getv(profile, "aggregation") === "long_short" && legs.length === 2) {
    const longShort = asObject(getv(profile, "long_short"));
    const byId = Object.create(null);
    for (const leg of legs) byId[pyStr(getv(leg, "leg_id"))] = leg;
    const longLeg = asObject(getv(byId, pyStr(getv(longShort, "long_leg_id"))));
    const shortLeg = asObject(getv(byId, pyStr(getv(longShort, "short_leg_id"))));
    const longReturn = returnBpsExpression(longLeg);
    const shortReturn = returnBpsExpression(shortLeg);
    const operator = getv(longShort, "operator");
    const margin = getv(longShort, "margin_bps");
    if (
      longReturn === null
      || shortReturn === null
      || getv(longLeg, "direction") !== "long"
      || getv(shortLeg, "direction") !== "short"
      || (operator !== "gt" && operator !== "gte")
      || !Number.isInteger(margin)
    ) {
      return null;
    }
    return exprNode(pyStr(operator), [
      exprNode("sub", [longReturn, shortReturn]),
      exprNode("literal", [], String(margin)),
    ]);
  }

  if (DIRECTION_FAMILIES.has(family)) {
    if (!Number.isInteger(threshold)) return null;
    const comparisons = [];
    for (const leg of legs) {
      const legReturn = returnBpsExpression(leg);
      const direction = getv(leg, "direction");
      if (legReturn === null || (direction !== "long" && direction !== "short")) return null;
      const operator = direction === "long" ? "gt" : "lt";
      const boundary = direction === "long" ? threshold : -threshold;
      comparisons.push(exprNode(operator, [legReturn, exprNode("literal", [], String(boundary))]));
    }
    if (comparisons.length === 1) return comparisons[0];
    return comparisons.length === 2 ? exprNode("and", comparisons) : null;
  }

  if (TARGET_FAMILIES.has(family)) {
    const comparisons = [];
    for (const leg of legs) {
      const target = asObject(getv(leg, "target"));
      const exitRef = getv(leg, "exit_variable_ref");
      if (!COMPARISON_OPS.has(getv(target, "operator")) || !isDecimalString(getv(target, "value")) || typeof exitRef !== "string") {
        return null;
      }
      comparisons.push(
        exprNode(pyStr(getv(target, "operator")), [
          exprNode("var", [], null, exitRef),
          exprNode("literal", [], getv(target, "value")),
        ]),
      );
    }
    if (comparisons.length === 1) return comparisons[0];
    return comparisons.length === 2 ? exprNode("and", comparisons) : null;
  }

  return null;
}
export { canonicalExecutionExpression as canonical_execution_expression };

const INFIX_OPS = {
  add: "+", sub: "-", mul: "*", div: "/",
  gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=",
  and: "AND", or: "OR",
};

export function renderExpr(node, symbols, captureSymbols) {
  const expr = asObject(node);
  const op = getv(expr, "op");
  const args = asArray(getv(expr, "args"));
  if (op === "literal") {
    const value = getv(expr, "value");
    if (typeof value === "boolean") return value ? "true" : "false";
    return formatNumber(value);
  }
  if (op === "var") {
    const key = pyStr(pyTruthy(getv(expr, "ref")) ? getv(expr, "ref") : "");
    return Object.hasOwn(symbols, key) ? symbols[key] : pyStr(pyTruthy(getv(expr, "ref")) ? getv(expr, "ref") : "?");
  }
  if (op === "capture") {
    const key = pyStr(pyTruthy(getv(expr, "ref")) ? getv(expr, "ref") : "");
    return Object.hasOwn(captureSymbols, key) ? captureSymbols[key] : pyStr(pyTruthy(getv(expr, "ref")) ? getv(expr, "ref") : "?");
  }
  const rendered = args.map((item) => renderExpr(item, symbols, captureSymbols));
  if (op === "mean") {
    const window = asObject(getv(expr, "window"));
    const lookback = Object.hasOwn(window, "lookback") ? window["lookback"] : "?";
    const suffix = pyTruthy(getv(window, "include_current")) ? "including_current" : "excluding_current";
    return `mean_${pyStr(lookback)}(${rendered.length > 0 ? rendered[0] : "?"},${suffix})`;
  }
  if (op === "between" && rendered.length === 3) {
    return `(${rendered[1]} <= ${rendered[0]} AND ${rendered[0]} <= ${rendered[2]})`;
  }
  if (op === "not" && rendered.length > 0) {
    return `NOT ${rendered[0]}`;
  }
  const infix = Object.hasOwn(INFIX_OPS, pyStr(op)) ? INFIX_OPS[pyStr(op)] : pyStr(op);
  return `(${rendered.join(` ${infix} `)})`;
}

export function renderPublicMath(payload) {
  const variables = asArray(getv(payload, "variables")).filter((item) => isPlainObject(item));
  const symbols = Object.create(null);
  for (const item of variables) {
    symbols[pyStr(getv(item, "id"))] = pyStr(pyTruthy(getv(item, "symbol")) ? getv(item, "symbol") : getv(item, "id"));
  }
  const captures = asArray(getv(asObject(getv(payload, "activation")), "captures")).filter((item) => isPlainObject(item));
  const captureSymbols = Object.create(null);
  for (const item of captures) {
    captureSymbols[pyStr(getv(item, "id"))] = pyStr(pyTruthy(getv(item, "symbol")) ? getv(item, "symbol") : getv(item, "id"));
  }
  const activation = asObject(getv(payload, "activation"));
  const activationFormula = getv(activation, "mode") === "immediate"
    ? "immediate"
    : renderExpr(getv(activation, "expression"), symbols, captureSymbols);
  const successFormula = renderExpr(getv(asObject(getv(payload, "outcome")), "expression"), symbols, captureSymbols);
  return {
    activation_formula: activationFormula,
    success_formula: successFormula,
    failure_formula: `NOT ${successFormula}`,
  };
}
export { renderPublicMath as render_public_math };

export function collectVariableRefs(value) {
  const expr = asObject(value);
  const refs = new Set();
  if (getv(expr, "op") === "var" && typeof getv(expr, "ref") === "string") refs.add(pyStr(getv(expr, "ref")));
  for (const item of asArray(getv(expr, "args"))) {
    for (const ref of collectVariableRefs(item)) refs.add(ref);
  }
  return refs;
}

export function validateExpr(value, path, variableTypes, captureTypes, errors) {
  if (!isPlainObject(value)) {
    errors.push(issue("EXPRESSION_TYPE", path, "Expression must be an object."));
    return null;
  }
  const op = getv(value, "op");
  const args = asArray(getv(value, "args"));
  if (!ALL_OPS.has(op)) {
    errors.push(issue("EXPRESSION_OP", `${path}.op`, "Unsupported expression operator."));
    return null;
  }
  const window = getv(value, "window");
  const ref = getv(value, "ref");
  const literal = getv(value, "value");

  if (op === "literal") {
    if (pyTruthy(args) || ref !== null || window !== null || !(isNumericLiteral(literal) || typeof literal === "boolean")) {
      errors.push(issue("LITERAL_SHAPE", path, "literal requires one decimal string, numeric, or boolean value and no args, ref, or window."));
      return null;
    }
    return typeof literal === "boolean" ? "boolean" : "number";
  }

  if (op === "var" || op === "capture") {
    const expected = op === "var" ? variableTypes : captureTypes;
    if (pyTruthy(args) || literal !== null || window !== null || typeof ref !== "string" || !Object.hasOwn(expected, ref)) {
      errors.push(issue("REFERENCE_SHAPE", path, `${op} requires one declared ref and no args, value, or window.`));
      return null;
    }
    return expected[ref];
  }

  if (ref !== null || literal !== null) {
    errors.push(issue("OPERATOR_SHAPE", path, "Operators cannot carry ref or literal value."));
  }
  const childTypes = args.map((item, index) => validateExpr(item, `${path}.args[${index}]`, variableTypes, captureTypes, errors));

  if (op === "mean") {
    const win = asObject(window);
    const lookback = getv(win, "lookback");
    if (args.length !== 1 || !arrayEqual(childTypes, ["number"]) || !Number.isInteger(lookback) || lookback < 1 || typeof getv(win, "include_current") !== "boolean") {
      errors.push(issue("MEAN_SHAPE", path, "mean requires one numeric argument and a positive lookback window."));
    }
    return "number";
  }

  if (window !== null) {
    errors.push(issue("UNUSED_WINDOW", `${path}.window`, "Only mean may carry a window."));
  }
  if (op === "add" || op === "sub" || op === "mul" || op === "div") {
    if (args.length !== 2 || !arrayEqual(childTypes, ["number", "number"])) {
      errors.push(issue("ARITHMETIC_TYPES", path, `${op} requires two numeric arguments.`));
    }
    return "number";
  }
  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    if (args.length !== 2 || !arrayEqual(childTypes, ["number", "number"])) {
      errors.push(issue("COMPARISON_TYPES", path, `${op} requires two numeric arguments.`));
    }
    return "boolean";
  }
  if (op === "eq") {
    if (args.length !== 2 || childTypes.includes(null) || new Set(childTypes).size !== 1) {
      errors.push(issue("EQUALITY_TYPES", path, "eq requires two arguments of the same known type."));
    }
    return "boolean";
  }
  if (op === "between") {
    if (args.length !== 3 || !arrayEqual(childTypes, ["number", "number", "number"])) {
      errors.push(issue("BETWEEN_TYPES", path, "between requires value, lower, and upper numeric arguments."));
    }
    return "boolean";
  }
  if (op === "and" || op === "or") {
    if (args.length < 2 || childTypes.some((item) => item !== "boolean")) {
      errors.push(issue("BOOLEAN_TYPES", path, `${op} requires at least two boolean arguments.`));
    }
    return "boolean";
  }
  if (op === "not") {
    if (args.length !== 1 || !arrayEqual(childTypes, ["boolean"])) {
      errors.push(issue("NOT_TYPE", path, "not requires one boolean argument."));
    }
    return "boolean";
  }
  return null;
}

const EXPECTED_SHAPES = {
  single_asset_direction: [1, ["single"]],
  single_asset_price_target: [1, ["single"]],
  pair_asset_direction: [2, ["all", "long_short"]],
  pair_asset_price_targets: [2, ["all"]],
};

export function validateExecutionProfile(payload, variableTypes, variableSpecs, captureTypes, errors) {
  const profile = asObject(getv(payload, "execution_profile"));
  if (getv(profile, "engine") !== "cuebook_settlement_v1") {
    errors.push(issue("EXECUTION_ENGINE", "$.execution_profile.engine", "Expected cuebook_settlement_v1."));
  }
  const family = getv(profile, "formula_family");
  if (!FORMULA_FAMILIES.has(family)) {
    errors.push(issue("FORMULA_FAMILY", "$.execution_profile.formula_family", "Unsupported frozen formula family."));
  }

  const rawLegs = getv(profile, "legs");
  if (!Array.isArray(rawLegs)) {
    errors.push(issue("EXECUTION_LEGS", "$.execution_profile.legs", "Execution legs must be an array."));
  }
  const legs = asArray(rawLegs).map((item) => asObject(item));
  const expectedShape = Object.hasOwn(EXPECTED_SHAPES, pyStr(family)) ? EXPECTED_SHAPES[pyStr(family)] : null;
  if (expectedShape) {
    const [expectedCount, expectedAggregations] = expectedShape;
    if (legs.length !== expectedCount) {
      errors.push(issue("FAMILY_LEG_COUNT", "$.execution_profile.legs", `${family} requires exactly ${expectedCount} leg(s).`));
    }
    if (!expectedAggregations.includes(getv(profile, "aggregation"))) {
      const allowed = expectedAggregations.slice().sort().join(" or ");
      errors.push(issue("FAMILY_AGGREGATION", "$.execution_profile.aggregation", `${family} requires ${allowed} aggregation.`));
    }
  }

  const legIds = [];
  const assetIds = [];
  const instrumentIds = [];
  const entryTimes = new Map();
  const entrySessions = new Map();
  const expectedIds = legs.length === 1 ? ["A"] : legs.length === 2 ? ["A", "B"] : [];
  legs.forEach((leg, index) => {
    const path = `$.execution_profile.legs[${index}]`;
    const legId = getv(leg, "leg_id");
    legIds.push(pyStr(legId));
    const expectedId = index < expectedIds.length ? expectedIds[index] : null;
    if (legId !== expectedId) {
      errors.push(issue("LEG_ORDER", `${path}.leg_id`, "Legs must be ordered A, then B."));
    }
    const expectedRole = legId === "A" ? "primary" : "comparator";
    if (getv(leg, "role") !== expectedRole) {
      errors.push(issue("LEG_ROLE", `${path}.role`, `Leg ${pyTruthy(legId) ? pyStr(legId) : "?"} must use role ${expectedRole}.`));
    }

    const assetId = getv(leg, "asset_id");
    if (!Number.isInteger(assetId) || assetId < 1) {
      errors.push(issue("ASSET_ID", `${path}.asset_id`, "asset_id must be a positive Cuebook market_assets identity."));
    } else {
      assetIds.push(assetId);
    }
    const providerInstrumentId = getv(leg, "provider_instrument_id");
    if (!isUuid(providerInstrumentId)) {
      errors.push(issue("PROVIDER_INSTRUMENT_ID", `${path}.provider_instrument_id`, "Expected a market_provider_instruments UUID."));
    } else {
      instrumentIds.push(pyStr(providerInstrumentId));
    }
    const ticker = getv(leg, "canonical_ticker");
    if (typeof ticker !== "string" || !/^(?:[a-z0-9][a-z0-9._:-]*)$/.test(ticker)) {
      errors.push(issue("CANONICAL_TICKER", `${path}.canonical_ticker`, "Expected the lowercase market_assets canonical_ticker snapshot."));
    }
    for (const key of ["provider", "quote_currency"]) {
      if (typeof getv(leg, key) !== "string" || !pyStrip(pyStr(getv(leg, key)))) {
        errors.push(issue("LEG_BINDING", `${path}.${key}`, `Leg requires ${key}.`));
      }
    }

    const exitRef = getv(leg, "exit_variable_ref");
    const exitKey = typeof exitRef === "string" ? exitRef : pyStr(exitRef);
    if (!(typeof exitRef === "string" && Object.hasOwn(variableTypes, exitRef)) || variableTypes[exitKey] !== "number") {
      errors.push(issue("EXIT_VARIABLE", `${path}.exit_variable_ref`, "Each leg requires one declared numeric exit variable."));
    } else if (getv(Object.hasOwn(variableSpecs, exitKey) ? variableSpecs[exitKey] : {}, "instrument_ref") !== providerInstrumentId) {
      errors.push(issue("EXIT_INSTRUMENT", `${path}.exit_variable_ref`, "Exit variable instrument_ref must equal the leg provider_instrument_id."));
    }

    const entry = asObject(getv(leg, "entry"));
    const entryPath = `${path}.entry`;
    if (getv(entry, "mode") === "fixed_snapshot") {
      const parsedPrice = decimalValue(getv(entry, "price"));
      if (!isDecimalString(getv(entry, "price")) || parsedPrice === null || !decimalIsPositive(parsedPrice)) {
        errors.push(issue("ENTRY_PRICE", `${entryPath}.price`, "Fixed entry price must be a positive decimal string with at most 18 decimal places."));
      }
      const observed = parseTime(getv(entry, "observed_at"), `${entryPath}.observed_at`, errors, true);
      if (observed !== null && typeof legId === "string") {
        entryTimes.set(legId, observed);
      }
      if (getv(entry, "source") !== "realtime" && getv(entry, "source") !== "candle_close") {
        errors.push(issue("ENTRY_SOURCE", `${entryPath}.source`, "Fixed entry requires realtime or candle_close source."));
      }
      const marketSession = getv(entry, "market_session");
      if (!["regular", "extended", "all_sessions", "continuous"].includes(marketSession)) {
        errors.push(issue("ENTRY_SESSION", `${entryPath}.market_session`, "Fixed entry requires its actual market session."));
      } else if (typeof legId === "string") {
        entrySessions.set(legId, marketSession);
      }
      if (!isUuid(getv(entry, "symbol_period_id"))) {
        errors.push(issue("ENTRY_SYMBOL_PERIOD", `${entryPath}.symbol_period_id`, "Fixed entry requires the observed market_symbol_periods UUID."));
      }
      for (const key of ["provider_symbol", "observation_ref"]) {
        if (typeof getv(entry, key) !== "string" || !pyStrip(pyStr(getv(entry, key)))) {
          errors.push(issue("ENTRY_PROVENANCE", `${entryPath}.${key}`, `Fixed entry requires ${key}.`));
        }
      }
      if (getv(entry, "capture_ref") !== null) {
        errors.push(issue("FIXED_ENTRY_CAPTURE", `${entryPath}.capture_ref`, "Fixed entry cannot reference an activation capture."));
      }
    } else if (getv(entry, "mode") === "activation_capture") {
      const captureRef = getv(entry, "capture_ref");
      const captureKey = typeof captureRef === "string" ? captureRef : pyStr(captureRef);
      if (!(typeof captureRef === "string" && Object.hasOwn(captureTypes, captureRef)) || captureTypes[captureKey] !== "number") {
        errors.push(issue("ENTRY_CAPTURE", `${entryPath}.capture_ref`, "Activation entry requires a declared numeric capture_ref."));
      }
      for (const key of ["price", "observed_at", "source", "market_session", "symbol_period_id", "provider_symbol", "observation_ref"]) {
        if (getv(entry, key) !== null) {
          errors.push(issue("DYNAMIC_ENTRY_VALUE", `${entryPath}.${key}`, "Activation-captured entry cannot freeze a value before the trigger occurs."));
        }
      }
    } else {
      errors.push(issue("ENTRY_MODE", `${entryPath}.mode`, "Unsupported entry mode."));
    }

    const direction = getv(leg, "direction");
    const target = getv(leg, "target");
    if (DIRECTION_FAMILIES.has(family)) {
      if (direction !== "long" && direction !== "short") {
        errors.push(issue("LEG_DIRECTION", `${path}.direction`, "Directional families require long or short on every leg."));
      }
      if (target !== null) {
        errors.push(issue("UNEXPECTED_TARGET", `${path}.target`, "Directional families do not carry price targets."));
      }
    } else if (TARGET_FAMILIES.has(family)) {
      if (direction !== "long" && direction !== "short") {
        errors.push(issue("LEG_DIRECTION", `${path}.direction`, "Price-target families require long or short on every leg."));
      }
      const targetObj = asObject(target);
      const operator = getv(targetObj, "operator");
      if (!pyTruthy(targetObj) || !["gt", "gte", "lt", "lte"].includes(operator)) {
        errors.push(issue("PRICE_TARGET", `${path}.target`, "Price-target families require one explicit gt/gte/lt/lte target."));
      }
      const targetValue = decimalValue(getv(targetObj, "value"));
      if (!isDecimalString(getv(targetObj, "value")) || targetValue === null || !decimalIsPositive(targetValue)) {
        errors.push(issue("TARGET_VALUE", `${path}.target.value`, "Target price must be a positive decimal string."));
      }
      if (getv(targetObj, "unit") !== getv(leg, "quote_currency")) {
        errors.push(issue("TARGET_UNIT", `${path}.target.unit`, "Target unit must match the leg quote_currency."));
      }
      if (direction === "long" && operator !== "gt" && operator !== "gte") {
        errors.push(issue("TARGET_DIRECTION", `${path}.target.operator`, "A long target requires gt or gte."));
      }
      if (direction === "short" && operator !== "lt" && operator !== "lte") {
        errors.push(issue("TARGET_DIRECTION", `${path}.target.operator`, "A short target requires lt or lte."));
      }
    }
  });

  if (legIds.length !== new Set(legIds).size) {
    errors.push(issue("LEG_DUPLICATE", "$.execution_profile.legs", "leg_id values must be unique."));
  }
  if (assetIds.length !== new Set(assetIds).size || instrumentIds.length !== new Set(instrumentIds).size) {
    errors.push(issue("LEG_IDENTITY_DUPLICATE", "$.execution_profile.legs", "Two-leg formulas require two distinct assets and provider instruments."));
  }

  const clock = asObject(getv(profile, "clock"));
  const startsAt = parseTime(getv(clock, "starts_at"), "$.execution_profile.clock.starts_at", errors, true);
  const settleAt = parseTime(getv(clock, "settle_at"), "$.execution_profile.clock.settle_at", errors);
  const endEventRef = getv(clock, "end_event_ref");
  if ((settleAt === null) === (typeof endEventRef !== "string" || !pyStrip(endEventRef))) {
    errors.push(issue("EXECUTION_HORIZON", "$.execution_profile.clock", "Exactly one of settle_at or end_event_ref is required."));
  }
  if (startsAt !== null && settleAt !== null && settleAt <= startsAt) {
    errors.push(issue("EXECUTION_WINDOW", "$.execution_profile.clock.settle_at", "settle_at must follow starts_at."));
  }
  for (const [legId, observed] of entryTimes) {
    if (startsAt !== null && observed > startsAt) {
      errors.push(issue("ENTRY_AFTER_START", `$.execution_profile.legs[${legId === "A" ? 0 : 1}].entry.observed_at`, "Fixed entry observation cannot occur after the formula starts."));
    }
  }
  if (typeof getv(clock, "interval") !== "string" || !pyStrip(pyStr(getv(clock, "interval")))) {
    errors.push(issue("EXECUTION_INTERVAL", "$.execution_profile.clock.interval", "Execution clock requires an interval."));
  }
  if (typeof getv(clock, "timezone") !== "string" || !pyStrip(pyStr(getv(clock, "timezone")))) {
    errors.push(issue("EXECUTION_TIMEZONE", "$.execution_profile.clock.timezone", "Execution clock requires a timezone."));
  }
  if (!["regular", "extended", "all_sessions", "continuous"].includes(getv(clock, "session"))) {
    errors.push(issue("EXECUTION_SESSION", "$.execution_profile.clock.session", "Unsupported execution session."));
  }
  if (getv(clock, "outcome_source") === "warm_candle") {
    if (!["provider_official", "ws_built", "internal"].includes(getv(clock, "origin")) || !["adjusted", "unadjusted"].includes(getv(clock, "adjustment"))) {
      errors.push(issue("WARM_CANDLE_BASIS", "$.execution_profile.clock", "warm_candle requires explicit origin and adjustment."));
    }
  } else if (getv(clock, "outcome_source") !== "realtime" && getv(clock, "outcome_source") !== "candle_close") {
    errors.push(issue("OUTCOME_SOURCE", "$.execution_profile.clock.outcome_source", "Unsupported outcome source."));
  }
  const delay = getv(clock, "max_observation_delay_seconds");
  if (!Number.isInteger(delay) || !(delay >= 0 && delay <= 1_209_600)) {
    errors.push(issue("OBSERVATION_DELAY", "$.execution_profile.clock.max_observation_delay_seconds", "Delay must be 0-1209600 seconds."));
  }
  legs.forEach((leg, index) => {
    const exitRef = pyTruthy(getv(leg, "exit_variable_ref")) ? pyStr(getv(leg, "exit_variable_ref")) : "";
    const variable = Object.hasOwn(variableSpecs, exitRef) ? variableSpecs[exitRef] : {};
    const expectedSignature = [getv(clock, "interval"), getv(clock, "timezone"), getv(clock, "session")];
    const actualSignature = [getv(variable, "interval"), getv(variable, "timezone"), getv(variable, "session")];
    if (pyTruthy(variable) && !arrayEqual(actualSignature, expectedSignature)) {
      errors.push(issue("EXIT_CLOCK_ALIGNMENT", `$.execution_profile.legs[${index}].exit_variable_ref`, "Exit variable interval, timezone, and session must match execution_profile.clock."));
    }
  });

  const outcome = asObject(getv(payload, "outcome"));
  const selection = getv(clock, "selection");
  if (selection === "first_eligible_at_or_after") {
    const observedAt = parseTime(getv(outcome, "observed_at"), "$.outcome.observed_at", errors);
    if (getv(outcome, "observation_mode") !== "at_datetime" || settleAt === null || observedAt !== settleAt) {
      errors.push(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Terminal selection requires at_datetime at exactly clock.settle_at."));
    }
  } else if (selection === "any_sealed_in_window") {
    const outcomeStart = parseTime(getv(outcome, "window_start"), "$.outcome.window_start", errors);
    const outcomeEnd = parseTime(getv(outcome, "window_end"), "$.outcome.window_end", errors);
    if (getv(outcome, "observation_mode") !== "any_in_window" || startsAt === null || settleAt === null || outcomeStart !== startsAt || outcomeEnd !== settleAt) {
      errors.push(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Window selection must use the execution start and settle timestamps."));
    }
  } else if (selection === "first_sealed_after_event") {
    if (getv(outcome, "observation_mode") !== "first_sealed_bar_after_event" || getv(outcome, "event_ref") !== endEventRef) {
      errors.push(issue("CLOCK_OUTCOME_MISMATCH", "$.outcome", "Event selection requires the same end_event_ref on the outcome."));
    }
  } else {
    errors.push(issue("EXECUTION_SELECTION", "$.execution_profile.clock.selection", "Unsupported settlement observation selection."));
  }

  const threshold = getv(profile, "direction_threshold_bps");
  const longShort = getv(profile, "long_short");
  const aggregation = getv(profile, "aggregation");
  if (family === "pair_asset_direction" && aggregation === "long_short") {
    if (threshold !== null) {
      errors.push(issue("LONG_SHORT_THRESHOLD", "$.execution_profile.direction_threshold_bps", "long_short aggregation uses margin_bps, not a direction threshold."));
    }
    const longShortObj = asObject(longShort);
    const sessionFamilies = new Set([...entrySessions.values()].map((session) => session === "continuous" ? "continuous" : "scheduled"));
    if (sessionFamilies.size > 1) {
      errors.push(issue("MIXED_SESSION_FAMILY", "$.execution_profile.legs", "Equal-notional pair settlement cannot mix continuous and scheduled market session families; degrade explicitly to a supported single-asset settlement or block."));
    }
    if (!pyTruthy(longShortObj)) {
      errors.push(issue("LONG_SHORT_POLICY", "$.execution_profile.long_short", "long_short aggregation requires an explicit long_short policy."));
    } else {
      const longLegId = getv(longShortObj, "long_leg_id");
      const shortLegId = getv(longShortObj, "short_leg_id");
      const idSet = new Set([longLegId, shortLegId]);
      if (longLegId === shortLegId || !(idSet.size === 2 && idSet.has("A") && idSet.has("B"))) {
        errors.push(issue("LONG_SHORT_LEGS", "$.execution_profile.long_short", "long_short policy must assign distinct A and B legs."));
      }
      const byId = Object.create(null);
      for (const leg of legs) byId[pyStr(getv(leg, "leg_id"))] = leg;
      if (getv(asObject(getv(byId, pyStr(longLegId))), "direction") !== "long") {
        errors.push(issue("LONG_SHORT_SIDE", "$.execution_profile.long_short.long_leg_id", "long_leg_id must reference the leg whose direction is long."));
      }
      if (getv(asObject(getv(byId, pyStr(shortLegId))), "direction") !== "short") {
        errors.push(issue("LONG_SHORT_SIDE", "$.execution_profile.long_short.short_leg_id", "short_leg_id must reference the leg whose direction is short."));
      }
      if (getv(longShortObj, "operator") !== "gt" && getv(longShortObj, "operator") !== "gte") {
        errors.push(issue("LONG_SHORT_OPERATOR", "$.execution_profile.long_short.operator", "long_short spread supports gt or gte; reverse the legs for the opposite view."));
      }
      const margin = getv(longShortObj, "margin_bps");
      if (!Number.isInteger(margin) || !(margin >= 0 && margin <= 100000)) {
        errors.push(issue("LONG_SHORT_MARGIN", "$.execution_profile.long_short.margin_bps", "margin_bps must be a non-negative integer; use 0 when no excess-return margin was stated."));
      }
      if (getv(longShortObj, "weighting") !== "equal_notional") {
        errors.push(issue("LONG_SHORT_WEIGHTING", "$.execution_profile.long_short.weighting", "Launch long_short aggregation requires equal_notional weighting."));
      }
      if (getv(longShortObj, "return_basis") !== "simple_price_return") {
        errors.push(issue("RETURN_BASIS", "$.execution_profile.long_short.return_basis", "Launch engine supports simple_price_return."));
      }
      if (!["same_session_close", "same_utc_timestamp"].includes(getv(longShortObj, "endpoint_alignment"))) {
        errors.push(issue("ENDPOINT_ALIGNMENT", "$.execution_profile.long_short.endpoint_alignment", "Unsupported endpoint alignment."));
      }
      const maxSkew = getv(longShortObj, "max_entry_skew_seconds");
      if (!Number.isInteger(maxSkew) || !(maxSkew >= 0 && maxSkew <= 86400)) {
        errors.push(issue("ENTRY_SKEW", "$.execution_profile.long_short.max_entry_skew_seconds", "Entry skew must be 0-86400 seconds."));
      } else if (entryTimes.size === 2 && Math.abs((entryTimes.get("A") - entryTimes.get("B")) / 1_000_000) > maxSkew) {
        errors.push(issue("ENTRY_SKEW", "$.execution_profile.legs", "Long/short entry observations exceed max_entry_skew_seconds."));
      }
      if (getv(longShortObj, "fx_policy") === "same_quote_currency" && new Set(legs.map((leg) => pyStr(getv(leg, "quote_currency")))).size > 1) {
        errors.push(issue("QUOTE_CURRENCY", "$.execution_profile.legs", "same_quote_currency requires matching quote currencies."));
      }
    }
  } else if (DIRECTION_FAMILIES.has(family)) {
    if (!Number.isInteger(threshold) || !(threshold >= 0 && threshold <= 100000)) {
      errors.push(issue("DIRECTION_THRESHOLD", "$.execution_profile.direction_threshold_bps", "Directional families require an explicit non-negative integer threshold in basis points."));
    }
    if (longShort !== null) {
      errors.push(issue("UNEXPECTED_LONG_SHORT", "$.execution_profile.long_short", "single or all aggregation cannot carry long_short policy."));
    }
  } else if (TARGET_FAMILIES.has(family)) {
    if (threshold !== null || longShort !== null) {
      errors.push(issue("TARGET_POLICY", "$.execution_profile", "Price-target families use neither direction_threshold_bps nor long_short policy."));
    }
  }

  const subject = asObject(getv(payload, "subject"));
  const primary = legs.length > 0 ? legs[0] : {};
  if (pyTruthy(primary)) {
    if (getv(subject, "instrument_id") !== getv(primary, "provider_instrument_id")) {
      errors.push(issue("SUBJECT_BINDING", "$.subject.instrument_id", "Subject instrument_id must equal leg A provider_instrument_id."));
    }
    const subjectTicker = pyStr(pyTruthy(getv(subject, "ticker")) ? getv(subject, "ticker") : "").toLowerCase();
    const primaryTicker = pyStr(pyTruthy(getv(primary, "canonical_ticker")) ? getv(primary, "canonical_ticker") : "").toLowerCase();
    if (subjectTicker !== primaryTicker) {
      errors.push(issue("SUBJECT_BINDING", "$.subject.ticker", "Subject ticker must identify leg A."));
    }
    let expectedDirection;
    if (family === "pair_asset_direction" && aggregation === "long_short") {
      const longShortObj = asObject(longShort);
      expectedDirection = getv(longShortObj, "long_leg_id") === "A" ? "outperform" : "underperform";
    } else {
      expectedDirection = getv(primary, "direction");
    }
    if (FORMULA_FAMILIES.has(family) && getv(subject, "direction") !== expectedDirection) {
      errors.push(issue("SUBJECT_DIRECTION", "$.subject.direction", `Subject direction must be ${expectedDirection} for this execution profile.`));
    }
  }

  const expectedExpression = canonicalExecutionExpression(profile);
  if (expectedExpression === null) {
    errors.push(issue("EXECUTION_EXPRESSION", "$.execution_profile", "Execution profile cannot compile to a canonical expression."));
  } else if (!deepEqual(getv(outcome, "expression"), expectedExpression)) {
    errors.push(issue("EXECUTION_EXPRESSION_MISMATCH", "$.outcome.expression", "Outcome expression must be the canonical projection of execution_profile."));
  }
  return expectedExpression;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (getv(payload, "schema_version") !== "settlement-formula-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected settlement-formula-v1."));
  }
  if (typeof getv(payload, "formula_id") !== "string" || !/^(?:FORMULA_[A-Za-z0-9_-]{8,})$/.test(pyStr(pyTruthy(getv(payload, "formula_id")) ? getv(payload, "formula_id") : ""))) {
    errors.push(issue("FORMULA_ID", "$.formula_id", "Invalid formula_id."));
  }
  if (!Number.isInteger(getv(payload, "revision")) || getv(payload, "revision") < 1) {
    errors.push(issue("REVISION", "$.revision", "revision must be a positive integer."));
  }
  const state = getv(payload, "state");
  if (!STATES.has(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }

  const lineage = asObject(getv(payload, "lineage"));
  if (typeof getv(lineage, "claim_ref") !== "string" || !pyStrip(pyStr(getv(lineage, "claim_ref")))) {
    errors.push(issue("CLAIM_REF", "$.lineage.claim_ref", "A source claim reference is required."));
  }
  if (typeof getv(lineage, "claim_hash") !== "string" || !/^(?:[a-f0-9]{64})$/.test(pyStr(pyTruthy(getv(lineage, "claim_hash")) ? getv(lineage, "claim_hash") : ""))) {
    errors.push(issue("CLAIM_HASH", "$.lineage.claim_hash", "claim_hash must be a SHA-256 hex digest."));
  }

  const subject = asObject(getv(payload, "subject"));
  for (const key of ["instrument_id", "ticker"]) {
    if (typeof getv(subject, key) !== "string" || !pyStrip(pyStr(getv(subject, key)))) {
      errors.push(issue("SUBJECT", `$.subject.${key}`, `Subject requires ${key}.`));
    }
  }
  if (!DIRECTIONS.has(getv(subject, "direction"))) {
    errors.push(issue("DIRECTION", "$.subject.direction", "Unsupported direction."));
  }

  const variableTypes = Object.create(null);
  const variableSpecs = Object.create(null);
  const symbols = new Set();
  asArray(getv(payload, "variables")).forEach((item, index) => {
    const path = `$.variables[${index}]`;
    const variable = asObject(item);
    const varId = getv(variable, "id");
    if (typeof varId !== "string" || !/^(?:VAR_[A-Z0-9_]+)$/.test(varId)) {
      errors.push(issue("VARIABLE_ID", `${path}.id`, "Invalid variable id."));
      return;
    }
    if (Object.hasOwn(variableTypes, varId)) {
      errors.push(issue("VARIABLE_DUPLICATE", `${path}.id`, "Variable ids must be unique."));
    }
    let valueType = getv(variable, "value_type");
    if (!VALUE_TYPES.has(valueType)) {
      errors.push(issue("VARIABLE_TYPE", `${path}.value_type`, "Unsupported variable type."));
      valueType = "unknown";
    }
    variableTypes[varId] = pyStr(valueType);
    variableSpecs[varId] = variable;
    const symbol = getv(variable, "symbol");
    if (typeof symbol !== "string" || !pyStrip(symbol) || symbols.has(symbol)) {
      errors.push(issue("VARIABLE_SYMBOL", `${path}.symbol`, "Variable symbols must be non-empty and unique."));
    } else {
      symbols.add(symbol);
    }
    if (!VARIABLE_KINDS.has(getv(variable, "kind"))) {
      errors.push(issue("VARIABLE_KIND", `${path}.kind`, "Unsupported variable kind."));
    }
    if (typeof getv(variable, "source_ref") !== "string" || !pyStrip(pyStr(getv(variable, "source_ref")))) {
      errors.push(issue("VARIABLE_SOURCE", `${path}.source_ref`, "Variable source is required."));
    }
    if (typeof getv(variable, "metric") !== "string" || !pyStrip(pyStr(getv(variable, "metric")))) {
      errors.push(issue("VARIABLE_METRIC", `${path}.metric`, "Variable metric is required."));
    }
    if ((state === "ready" || state === "frozen") && ["market_observation", "derived_metric"].includes(getv(variable, "kind")) && getv(variable, "sealed_only") !== true) {
      errors.push(issue("UNSEALED_VARIABLE", `${path}.sealed_only`, "Ready settlement math requires sealed market observations."));
    }
  });
  if (!pyTruthy(variableTypes)) {
    errors.push(issue("VARIABLES_REQUIRED", "$.variables", "At least one variable is required."));
  }

  const activation = asObject(getv(payload, "activation"));
  const captures = asArray(getv(activation, "captures"));
  const captureTypes = Object.create(null);
  const captureSymbols = new Set();
  captures.forEach((item, index) => {
    const path = `$.activation.captures[${index}]`;
    const capture = asObject(item);
    const capId = getv(capture, "id");
    const variableRef = getv(capture, "variable_ref");
    if (typeof capId !== "string" || !/^(?:CAP_[A-Z0-9_]+)$/.test(capId)) {
      errors.push(issue("CAPTURE_ID", `${path}.id`, "Invalid capture id."));
      return;
    }
    if (Object.hasOwn(captureTypes, capId)) {
      errors.push(issue("CAPTURE_DUPLICATE", `${path}.id`, "Capture ids must be unique."));
    }
    if (!(typeof variableRef === "string" && Object.hasOwn(variableTypes, variableRef))) {
      errors.push(issue("CAPTURE_VARIABLE", `${path}.variable_ref`, "Capture must reference a declared variable."));
      captureTypes[capId] = "unknown";
    } else {
      captureTypes[capId] = variableTypes[pyStr(variableRef)];
    }
    const symbol = getv(capture, "symbol");
    if (typeof symbol !== "string" || !pyStrip(symbol) || captureSymbols.has(symbol) || symbols.has(symbol)) {
      errors.push(issue("CAPTURE_SYMBOL", `${path}.symbol`, "Capture symbols must be non-empty and unique."));
    } else {
      captureSymbols.add(symbol);
    }
    if (getv(capture, "mode") !== "value_at_activation") {
      errors.push(issue("CAPTURE_MODE", `${path}.mode`, "Unsupported capture mode."));
    }
  });

  validateExecutionProfile(payload, variableTypes, variableSpecs, captureTypes, errors);

  const mode = getv(activation, "mode");
  if (mode !== "immediate" && mode !== "first_true") {
    errors.push(issue("ACTIVATION_MODE", "$.activation.mode", "Unsupported activation mode."));
  }
  if (mode === "immediate") {
    if (getv(activation, "expression") !== null || pyTruthy(captures)) {
      errors.push(issue("IMMEDIATE_ACTIVATION", "$.activation", "Immediate activation cannot carry a trigger expression or captures."));
    }
  } else if (mode === "first_true") {
    const activationType = validateExpr(getv(activation, "expression"), "$.activation.expression", variableTypes, captureTypes, errors);
    if (activationType !== "boolean") {
      errors.push(issue("ACTIVATION_BOOLEAN", "$.activation.expression", "Activation expression must be boolean."));
    }
    if (getv(activation, "window_end") === null && getv(activation, "end_event_ref") === null) {
      errors.push(issue("ACTIVATION_HORIZON", "$.activation", "Conditional activation requires a fixed end or event horizon."));
    }
    const activationRefs = collectVariableRefs(getv(activation, "expression"));
    const marketSignatures = new Set();
    for (const ref of activationRefs) {
      if (Object.hasOwn(variableSpecs, ref) && ["market_observation", "derived_metric"].includes(getv(variableSpecs[ref], "kind"))) {
        marketSignatures.add(canonicalJson([
          getv(variableSpecs[ref], "interval"),
          getv(variableSpecs[ref], "timezone"),
          getv(variableSpecs[ref], "session"),
        ]));
      }
    }
    if (marketSignatures.size > 1) {
      errors.push(issue("ACTIVATION_ALIGNMENT", "$.activation.expression", "Market variables in one activation expression must share interval, timezone, and session."));
    }
  }
  const activationStart = parseTime(getv(activation, "window_start"), "$.activation.window_start", errors);
  const activationEnd = parseTime(getv(activation, "window_end"), "$.activation.window_end", errors);
  if (activationStart !== null && activationEnd !== null && activationEnd <= activationStart) {
    errors.push(issue("ACTIVATION_WINDOW", "$.activation", "Activation window end must follow its start."));
  }

  const outcome = asObject(getv(payload, "outcome"));
  const outcomeMode = getv(outcome, "observation_mode");
  const outcomeType = validateExpr(getv(outcome, "expression"), "$.outcome.expression", variableTypes, captureTypes, errors);
  if (outcomeType !== "boolean") {
    errors.push(issue("OUTCOME_BOOLEAN", "$.outcome.expression", "Outcome expression must be boolean."));
  }
  const observedAt = parseTime(getv(outcome, "observed_at"), "$.outcome.observed_at", errors);
  const outcomeStart = parseTime(getv(outcome, "window_start"), "$.outcome.window_start", errors);
  const outcomeEnd = parseTime(getv(outcome, "window_end"), "$.outcome.window_end", errors);
  if (outcomeMode === "at_datetime") {
    if (observedAt === null) {
      errors.push(issue("OUTCOME_TIME", "$.outcome.observed_at", "at_datetime requires observed_at."));
    }
  } else if (outcomeMode === "any_in_window" || outcomeMode === "every_observation") {
    if (outcomeStart === null || outcomeEnd === null || outcomeEnd <= outcomeStart) {
      errors.push(issue("OUTCOME_WINDOW", "$.outcome", "Window outcome requires an ordered start and end."));
    }
  } else if (outcomeMode === "first_sealed_bar_after_event") {
    if (typeof getv(outcome, "event_ref") !== "string" || !pyStrip(pyStr(getv(outcome, "event_ref")))) {
      errors.push(issue("OUTCOME_EVENT", "$.outcome.event_ref", "Event outcome requires event_ref."));
    }
  } else {
    errors.push(issue("OUTCOME_MODE", "$.outcome.observation_mode", "Unsupported outcome observation mode."));
  }

  const invalidation = getv(payload, "invalidation");
  if (invalidation !== null) {
    const invalidationObj = asObject(invalidation);
    const invalidationType = validateExpr(getv(invalidationObj, "expression"), "$.invalidation.expression", variableTypes, captureTypes, errors);
    if (invalidationType !== "boolean") {
      errors.push(issue("INVALIDATION_BOOLEAN", "$.invalidation.expression", "Invalidation expression must be boolean."));
    }
    if (!["first_true", "at_datetime"].includes(getv(invalidationObj, "mode")) || !["failed", "no_score"].includes(getv(invalidationObj, "result"))) {
      errors.push(issue("INVALIDATION_POLICY", "$.invalidation", "Unsupported invalidation mode or result."));
    }
  }

  const lifecycle = asObject(getv(payload, "lifecycle"));
  if (mode === "immediate" && getv(lifecycle, "initial_state") !== "active") {
    errors.push(issue("IMMEDIATE_STATE", "$.lifecycle.initial_state", "Immediate formulas start active."));
  }
  if (mode === "first_true") {
    if (getv(lifecycle, "initial_state") !== "pending_activation") {
      errors.push(issue("CONDITIONAL_STATE", "$.lifecycle.initial_state", "Conditional formulas start pending_activation."));
    }
    if (getv(lifecycle, "untriggered_result") !== "no_score") {
      errors.push(issue("UNTRIGGERED_SCORE", "$.lifecycle.untriggered_result", "An untriggered conditional view defaults to no_score."));
    }
  }
  const terminals = new Set(stringSet(getv(lifecycle, "terminal_states"), "$.lifecycle.terminal_states", errors));
  if (!(terminals.has("succeeded") && terminals.has("failed"))) {
    errors.push(issue("TERMINAL_STATES", "$.lifecycle.terminal_states", "Terminal states must include succeeded and failed."));
  }
  if (mode === "first_true" && !terminals.has("expired_untriggered")) {
    errors.push(issue("UNTRIGGERED_STATE", "$.lifecycle.terminal_states", "Conditional formulas require expired_untriggered."));
  }
  if (!["failed", "succeeded", "manual_review"].includes(getv(lifecycle, "tie_result"))) {
    errors.push(issue("TIE_RESULT", "$.lifecycle.tie_result", "Unsupported tie result."));
  }

  const resolution = asObject(getv(payload, "resolution"));
  const primarySources = stringSet(getv(resolution, "primary_source_refs"), "$.resolution.primary_source_refs", errors);
  if (!pyTruthy(primarySources)) {
    errors.push(issue("PRIMARY_SOURCES", "$.resolution.primary_source_refs", "At least one primary source is required."));
  }
  const fallbacks = stringSet(getv(resolution, "fallback_source_refs"), "$.resolution.fallback_source_refs", errors);
  if (getv(resolution, "missing_data_policy") === "fallback_source" && !pyTruthy(fallbacks)) {
    errors.push(issue("FALLBACK_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."));
  }
  if (!["manual_review", "annul", "not_applicable"].includes(getv(resolution, "zero_division_policy"))) {
    errors.push(issue("ZERO_DIVISION", "$.resolution.zero_division_policy", "Unsupported zero-division policy."));
  }
  const precision = getv(resolution, "precision");
  if (!Number.isInteger(precision) || !(precision >= 0 && precision <= 18)) {
    errors.push(issue("PRECISION", "$.resolution.precision", "precision must be an integer from 0 to 18."));
  }

  const expectedMath = renderPublicMath(payload);
  const publicMath = asObject(getv(payload, "public_math"));
  for (const [key, expected] of Object.entries(expectedMath)) {
    if (getv(publicMath, key) !== expected) {
      errors.push(issue("PUBLIC_MATH_MISMATCH", `$.public_math.${key}`, `Expected deterministic formula: ${expected}`));
    }
  }
  const oneLine = getv(publicMath, "one_line");
  if (typeof oneLine !== "string" || !pyStrip(pyStr(oneLine)) || [...pyStr(oneLine)].length > 320) {
    errors.push(issue("PUBLIC_ONE_LINE", "$.public_math.one_line", "one_line must contain 1-320 characters."));
  }

  const quality = asObject(getv(payload, "quality_report"));
  const missing = stringSet(getv(quality, "missing_fields"), "$.quality_report.missing_fields", errors);
  stringSet(getv(quality, "warnings"), "$.quality_report.warnings", errors);
  if (state === "ready" || state === "frozen") {
    if (getv(quality, "decision") !== "ready" || pyTruthy(missing)) {
      errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen formulas require a ready decision and no missing fields."));
    }
  } else if (!["needs_confirmation", "blocked"].includes(getv(quality, "decision"))) {
    errors.push(issue("DRAFT_QUALITY", "$.quality_report.decision", "Draft formula must be needs_confirmation or blocked."));
  }

  const expectedHash = canonicalHash(payload);
  const storedHash = getv(lineage, "canonical_hash");
  if (state === "frozen") {
    if (storedHash !== expectedHash) {
      errors.push(issue("CANONICAL_HASH", "$.lineage.canonical_hash", "Frozen formula hash is missing or does not match."));
    }
  } else if (storedHash !== null) {
    errors.push(issue("UNFROZEN_HASH", "$.lineage.canonical_hash", "Only frozen formulas may store a canonical hash."));
  }
  if (state === "draft") {
    warnings.push(issue("NOT_READY", "$.state", "Draft formula is not eligible for registration."));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    public_math: expectedMath,
    canonical_hash: expectedHash,
  };
}

function loadPayload(path) {
  const text = path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
  const value = JSON.parse(text);
  if (!isPlainObject(value)) {
    throw new Error("Top-level JSON value must be an object.");
  }
  return value;
}

const USAGE = "usage: validate_settlement_formula.mjs [-h] [--print-math] [--print-canonical-hash] formula";

function main() {
  const argv = process.argv.slice(2);
  let printMath = false;
  let printCanonicalHash = false;
  const positionals = [];
  for (const arg of argv) {
    if (arg === "--print-math") printMath = true;
    else if (arg === "--print-canonical-hash") printCanonicalHash = true;
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${USAGE}\n\nValidate SettlementFormulaV1 and render deterministic public math.\n`);
      return 0;
    } else if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`${USAGE}\nvalidate_settlement_formula.mjs: error: unrecognized arguments: ${arg}\n`);
      return 2;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    process.stderr.write(`${USAGE}\nvalidate_settlement_formula.mjs: error: ${positionals.length === 0 ? "the following arguments are required: formula" : `unrecognized arguments: ${positionals.slice(1).join(" ")}`}\n`);
    return 2;
  }
  let payload;
  try {
    payload = loadPayload(positionals[0]);
  } catch (exc) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("LOAD", "$", exc.message)] }, null, 2)}\n`);
    return 2;
  }
  const result = validate(payload);
  if (printMath) {
    process.stdout.write(`${JSON.stringify(result.public_math, null, 2)}\n`);
  } else if (printCanonicalHash) {
    process.stdout.write(`${result.canonical_hash}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result.valid ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
