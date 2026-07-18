#!/usr/bin/env node
// Validate SettlementClaimV1 and render its deterministic public one-line.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STATES = new Set(["draft", "needs_confirmation", "ready", "frozen"]);
const DIRECTIONS = new Set(["long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"]);
const NUMERIC_OPERATORS = new Set(["gt", "gte", "lt", "lte", "eq"]);
const PRICE_METRICS = new Set(["official_close", "official_settlement", "spot_price", "intraday_high", "intraday_low", "vwap"]);
const SCORE_MODES = new Set(["binary_accuracy", "directional_accuracy", "return", "excess_return"]);
const BASELINE_BASES = new Set(["last_trade", "last_close", "midpoint", "official_close", "official_settlement", "spot", "intraday", "nav", "event_status", "none"]);
const BASELINE_MARKET_STATES = new Set(["regular", "pre", "after", "overnight", "closed", "continuous", "event_window", "unknown"]);
const ACTION_STATES = new Set(["enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"]);
const ENTRY_PRICE_RULES = new Set(["publication_baseline", "trigger_observation", "not_applicable"]);
const TARGET_VALUE_SOURCES = new Set(["baseline", "explicit_target", "benchmark", "event", "trigger_observation", "none"]);

export function issue(code, path, message) {
  return { code, path, message };
}

export function isNumber(value) {
  return typeof value === "number";
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// dict.get(key) — absent keys read as None, prototype properties ignored.
function get(obj, key) {
  return Object.hasOwn(obj, key) ? obj[key] : null;
}

function getDefault(obj, key, fallback) {
  return Object.hasOwn(obj, key) ? obj[key] : fallback;
}

// Python truthiness for the `x or default` idiom (empty containers are falsy).
function pyTruthy(value) {
  if (value === null || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// str() over JSON values as Python renders them in f-strings.
function pyStr(value) {
  if (typeof value === "string") return value;
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return pyRepr(value);
  if (typeof value === "object") return pyRepr(value);
  return String(value);
}

// repr() for JSON values (used for interpolated lists of strings).
function pyRepr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
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
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  return `{${Object.entries(value).map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ")}}`;
}

// str.strip() — Python's whitespace set differs from String.prototype.trim().
const PY_WHITESPACE = "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_WHITESPACE}]+|[${PY_WHITESPACE}]+$`, "g");

function pyStrip(value) {
  return value.replace(PY_STRIP_RE, "");
}

function fullmatch(pattern, value) {
  return new RegExp(`^(?:${pattern})$`).test(value);
}

function stringSet(value, path, errors) {
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

// --- datetime.fromisoformat(value.replace("Z", "+00:00")) equivalent -------

class PyValueError extends Error {}

function daysInMonth(year, month) {
  return [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function parseFraction(digits) {
  return Number(digits.slice(0, 6).padEnd(6, "0"));
}

function parseIsoTime(text) {
  let m = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!m) m = /^(\d{2})(?:(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? "0");
  const s = Number(m[3] ?? "0");
  const us = m[4] ? parseFraction(m[4]) : 0;
  if (mi > 59 || s > 59) return null;
  if (h > 24 || (h === 24 && (mi !== 0 || s !== 0 || us !== 0))) return null;
  return { h, mi, s, us };
}

function parseIsoOffset(text) {
  let m = /^([+-])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?$/.exec(text);
  if (!m) m = /^([+-])(\d{2})(?:(\d{2})(?:(\d{2}))?)?$/.exec(text);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const h = Number(m[2]);
  const mi = Number(m[3] ?? "0");
  const s = Number(m[4] ?? "0");
  const us = m[5] ? parseFraction(m[5]) : 0;
  if (mi > 59 || s > 59) return null;
  const total = ((h * 60 + mi) * 60 + s) * 1e6 + us;
  if (total >= 24 * 3600 * 1e6) return null;
  return sign * total;
}

// Returns { naive, epochUs, comps } or throws PyValueError. Covers the ISO 8601
// forms datetime.fromisoformat accepts on realistic inputs: extended/basic
// dates, any single date-time separator, HH[:MM[:SS[.ffffff]]] times (fraction
// truncated to microseconds, 24:00 rolls over), and extended/basic offsets.
function pyFromIsoformat(value) {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  let rest;
  if (m) {
    rest = value.slice(10);
  } else {
    m = /^(\d{4})(\d{2})(\d{2})(?![0-9])/.exec(value);
    if (!m) throw new PyValueError(`Invalid isoformat string: ${pyRepr(value)}`);
    rest = value.slice(8);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new PyValueError(`Invalid isoformat string: ${pyRepr(value)}`);
  }
  let time = { h: 0, mi: 0, s: 0, us: 0 };
  let offsetUs = null;
  if (rest !== "") {
    const timeText = [...rest].slice(1).join("");
    let clock = timeText;
    const offsetStart = Math.max(clock.indexOf("+"), clock.indexOf("-"));
    if (offsetStart > 0) {
      offsetUs = parseIsoOffset(clock.slice(offsetStart));
      if (offsetUs === null) throw new PyValueError(`Invalid isoformat string: ${pyRepr(value)}`);
      clock = clock.slice(0, offsetStart);
    }
    const parsed = parseIsoTime(clock);
    if (!parsed) throw new PyValueError(`Invalid isoformat string: ${pyRepr(value)}`);
    time = parsed;
  }
  const comps = { y, mo, d, ...time };
  const naive = offsetUs === null;
  const epochUs = naive
    ? null
    : Date.UTC(y, mo - 1, d, time.h, time.mi, time.s) * 1000 + time.us - offsetUs;
  return { naive, epochUs, comps };
}

function parseTime(value, path, errors, required = true) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || !pyStrip(value)) {
    errors.push(issue("DATETIME_REQUIRED", path, "Expected an ISO 8601 timestamp."));
    return null;
  }
  let parsed;
  try {
    parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  } catch (exc) {
    if (!(exc instanceof PyValueError)) throw exc;
    errors.push(issue("DATETIME_FORMAT", path, "Invalid ISO 8601 timestamp."));
    return null;
  }
  if (parsed.naive) {
    errors.push(issue("DATETIME_TIMEZONE", path, "Timestamp must include a timezone offset."));
    return null;
  }
  return parsed;
}

// --- zoneinfo.ZoneInfo equivalent -------------------------------------------

class ZoneInfoNotFoundError extends Error {}

// ZoneInfo(key): ValueError for non-normalized relative keys, otherwise
// ZoneInfoNotFoundError when the IANA key is unknown (checked through Intl).
function zoneInfoCheck(key) {
  if (key === "" || key.startsWith("/") || key.includes("\\")) {
    throw new PyValueError(`ZoneInfo keys must be normalized relative paths, got: ${key}`);
  }
  if (key.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new PyValueError(`ZoneInfo keys must be normalized relative paths, got: ${key}`);
  }
  if (!/^[A-Za-z0-9_+./-]+$/.test(key) || key.includes(":")) {
    throw new ZoneInfoNotFoundError(`No time zone found with key ${key}`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: key });
  } catch {
    throw new ZoneInfoNotFoundError(`No time zone found with key ${key}`);
  }
}

function dateInZone(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(epochMs));
  const byType = {};
  for (const part of parts) byType[part.type] = part.value;
  return `${byType.year.padStart(4, "0")}-${byType.month}-${byType.day}`;
}

// --- canonical hash ----------------------------------------------------------

function canonicalPayload(payload) {
  const result = structuredClone(payload);
  const lineage = asObject(get(result, "lineage"));
  lineage.canonical_hash = null;
  result.lineage = lineage;
  return result;
}

// json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function canonicalHash(payload) {
  return createHash("sha256").update(Buffer.from(canonicalJson(canonicalPayload(payload)), "utf-8")).digest("hex");
}

export const canonical_hash = canonicalHash;

// json.dumps(..., ensure_ascii=False) with the default (", ", ": ") separators.
function pyDumps(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(pyDumps).join(", ")}]`;
  return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pyDumps(v)}`).join(", ")}}`;
}

// --- public one-line rendering -----------------------------------------------

export function formatNumber(value) {
  if (!isNumber(value)) return "?";
  if (Number.isInteger(value)) {
    return Math.abs(value) < 1e21 ? String(value) : BigInt(value).toString();
  }
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function localEndDate(payload) {
  const clock = asObject(get(payload, "clock"));
  if (get(clock, "end_mode") === "protocol_event") {
    return pyStr(pyTruthy(get(clock, "end_event_label")) ? get(clock, "end_event_label") : "事件待定");
  }
  const value = get(clock, "window_end");
  if (typeof value !== "string") return "待定";
  try {
    const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
    const timeZone = pyStr(pyTruthy(get(clock, "timezone")) ? get(clock, "timezone") : "UTC");
    zoneInfoCheck(timeZone);
    const epochMs = parsed.naive
      ? new Date(parsed.comps.y, parsed.comps.mo - 1, parsed.comps.d, parsed.comps.h, parsed.comps.mi, parsed.comps.s, Math.floor(parsed.comps.us / 1000)).getTime()
      : Math.floor(parsed.epochUs / 1000);
    return dateInZone(epochMs, timeZone);
  } catch (exc) {
    if (exc instanceof PyValueError || exc instanceof ZoneInfoNotFoundError) {
      return [...value].slice(0, 10).join("");
    }
    throw exc;
  }
}

function metricLabel(metric, marketSession) {
  if (metric === "official_close") {
    return marketSession === "regular" ? "常规收盘" : "官方收盘";
  }
  return getDefault({
    official_settlement: "官方结算价",
    spot_price: "现价",
    intraday_high: "盘中最高价",
    intraday_low: "盘中最低价",
    vwap: "VWAP",
    total_return_pct: "总收益率",
    excess_return_pct: "超额收益率",
    spread_value: "价差",
    probability_pct: "概率",
    fundamental_value: "指标值",
  }, metric, metric);
}

function benchmarkLabel(value) {
  const ref = pyStrip(pyStr(pyTruthy(value) ? value : ""));
  if (!ref) return "";
  const parts = ref.split(":");
  if (parts.length > 1 && parts[0].toLowerCase() === "benchmark") return parts[1];
  if (ref.includes(":") && !ref.toLowerCase().startsWith("http:") && !ref.toLowerCase().startsWith("https:")) {
    return parts[0];
  }
  return ref;
}

function conditionText(condition, marketSession) {
  const kind = get(condition, "kind");
  const metric = pyStr(pyTruthy(get(condition, "metric")) ? get(condition, "metric") : "");
  const operator = pyStr(pyTruthy(get(condition, "operator")) ? get(condition, "operator") : "");
  const target = asObject(get(condition, "target"));
  const mode = get(condition, "observation_mode");
  if (kind === "event") {
    return pyStr(pyTruthy(get(condition, "description")) ? get(condition, "description") : "事件条件");
  }

  const prefix = getDefault({
    at_expiry: "到期",
    any_in_window: "期间任一",
    every_observation: "期间每次",
    first_after_event: "事件后首次",
    event_by_expiry: "到期前",
  }, mode, "");
  const label = metricLabel(metric, marketSession);
  const dynamicTriggerValue = get(target, "value_source") === "trigger_observation";
  const unit = dynamicTriggerValue ? "" : (pyTruthy(get(target, "unit")) ? ` ${pyStr(get(target, "unit"))}` : "");
  const benchmark = kind === "relative_return" ? benchmarkLabel(get(condition, "benchmark_ref")) : "";
  const benchmarkSuffix = benchmark ? `（相对 ${benchmark}）` : "";
  if (operator === "between") {
    return `${prefix}${label}在 ${formatNumber(get(target, "lower_bound"))}-${formatNumber(get(target, "upper_bound"))}${unit}`;
  }
  const symbol = getDefault({ gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" }, operator, operator);
  const targetText = dynamicTriggerValue ? "触发收盘价" : formatNumber(get(target, "value"));
  return `${prefix}${label} ${symbol} ${targetText}${unit}${benchmarkSuffix}`;
}

export function renderOneLine(payload) {
  let direction = getDefault({
    long: "看多",
    short: "看空",
    outperform: "跑赢",
    underperform: "跑输",
    range: "区间",
    event_yes: "事件会发生",
    event_no: "事件不会发生",
    neutral: "中性",
  }, pyStr(pyTruthy(get(payload, "direction")) ? get(payload, "direction") : ""), "待定");
  const actionState = get(asObject(get(payload, "intent")), "action_state");
  if (actionState === "wait_for_trigger") direction = `条件${direction}`;
  else if (actionState === "observe_only") direction = "观察";
  else if (actionState === "avoid") direction = "回避";
  else if (actionState === "exit") direction = "退出";
  else if (actionState === "hold") direction = `持有${direction}`;
  const subject = asObject(get(payload, "subject"));
  const ticker = pyStr(
    pyTruthy(get(subject, "ticker")) ? get(subject, "ticker")
      : pyTruthy(get(subject, "display_name")) ? get(subject, "display_name")
        : "标的",
  );
  const clock = asObject(get(payload, "clock"));
  const session = pyStr(pyTruthy(get(clock, "market_session")) ? get(clock, "market_session") : "regular");
  const success = asObject(get(payload, "success"));
  const conditions = asArray(get(success, "conditions")).filter((item) => item !== null && typeof item === "object" && !Array.isArray(item));
  const pieces = conditions.map((item) => conditionText(item, session));
  const connector = getDefault({ all: " 且 ", any: " 或 ", sequence: " -> " }, get(success, "logic"), " 且 ");
  const conditionSummary = pieces.length ? pieces.join(connector) : "条件待定";
  const statusFallback = getDefault({
    draft: "草稿",
    needs_confirmation: "待确认",
    ready: "待结算",
    frozen: "已冻结",
  }, get(payload, "state"), "待确认");
  const statusLabel = get(asObject(get(payload, "public_view")), "status_label");
  const status = pyStr(pyTruthy(statusLabel) ? statusLabel : statusFallback);
  const horizon = get(clock, "end_mode") === "protocol_event" ? `至${localEndDate(payload)}` : `截至 ${localEndDate(payload)}`;
  return `${ticker} ${direction}｜${horizon}｜${conditionSummary}｜${status}`;
}

export const render_one_line = renderOneLine;

// --- validation ----------------------------------------------------------------

const TERMINAL_METRICS = new Set([...PRICE_METRICS, "total_return_pct", "fundamental_value", "probability_pct"]);
const BARRIER_METRICS = new Set([...PRICE_METRICS, "total_return_pct", "probability_pct"]);
const PRIMARY_PRICE_METRICS = new Set([...PRICE_METRICS, "total_return_pct"]);

function validateCondition(condition, path, baseline, overallStart, overallEnd, errors) {
  if (condition === null || typeof condition !== "object" || Array.isArray(condition)) {
    errors.push(issue("CONDITION_TYPE", path, "Condition must be an object."));
    return [null, {}];
  }
  let conditionId = get(condition, "id");
  if (typeof conditionId !== "string" || !fullmatch("[CF][1-9][0-9]*", conditionId)) {
    errors.push(issue("CONDITION_ID", `${path}.id`, "Condition ID must use C<number> or F<number>."));
    conditionId = null;
  }
  for (const key of ["subject_ref", "kind", "metric", "operator", "observation_mode", "data_source_ref", "description"]) {
    if (typeof get(condition, key) !== "string" || !pyStrip(pyStr(get(condition, key)))) {
      errors.push(issue("CONDITION_FIELD", `${path}.${key}`, `Condition requires ${key}.`));
    }
  }

  const kind = get(condition, "kind");
  const metric = get(condition, "metric");
  const operator = get(condition, "operator");
  const mode = get(condition, "observation_mode");
  const target = asObject(get(condition, "target"));
  const value = get(target, "value");
  const lower = get(target, "lower_bound");
  const upper = get(target, "upper_bound");
  const valueSource = get(target, "value_source");
  if (!TARGET_VALUE_SOURCES.has(valueSource)) {
    errors.push(issue("TARGET_VALUE_SOURCE", `${path}.target.value_source`, "Unsupported target value source."));
  }
  const dynamicTriggerValue = valueSource === "trigger_observation" && value === null;

  if (kind === "terminal_value") {
    if (!["at_expiry", "first_after_event"].includes(mode) || !TERMINAL_METRICS.has(metric) || !NUMERIC_OPERATORS.has(operator) || !(isNumber(value) || dynamicTriggerValue)) {
      errors.push(issue("TERMINAL_CONTRACT", path, "Terminal value requires an expiry or event observation, a supported metric and operator, and a numeric or trigger-observation target."));
    }
    if (mode === "first_after_event" && !pyStrip(pyStr(pyTruthy(get(condition, "event_ref")) ? get(condition, "event_ref") : ""))) {
      errors.push(issue("POST_EVENT_REF", `${path}.event_ref`, "first_after_event requires an event_ref."));
    }
  } else if (kind === "window_barrier") {
    if (!["any_in_window", "every_observation"].includes(mode) || !BARRIER_METRICS.has(metric) || !NUMERIC_OPERATORS.has(operator) || !isNumber(value)) {
      errors.push(issue("BARRIER_CONTRACT", path, "Window barrier requires a window observation mode, numeric metric, operator, and target value."));
    }
  } else if (kind === "relative_return") {
    if (metric !== "excess_return_pct" || !NUMERIC_OPERATORS.has(operator) || !isNumber(value) || !pyStrip(pyStr(pyTruthy(get(condition, "benchmark_ref")) ? get(condition, "benchmark_ref") : ""))) {
      errors.push(issue("RELATIVE_CONTRACT", path, "Relative return requires excess_return_pct, a numeric target, and benchmark_ref."));
    }
  } else if (kind === "range") {
    if (operator !== "between" || !isNumber(lower) || !isNumber(upper) || lower >= upper) {
      errors.push(issue("RANGE_CONTRACT", path, "Range requires ordered numeric lower and upper bounds."));
    }
  } else if (kind === "event") {
    if (metric !== "event_status" || !["occurred", "not_occurred"].includes(operator) || !["event_by_expiry", "first_after_event"].includes(mode) || !pyStrip(pyStr(pyTruthy(get(condition, "event_ref")) ? get(condition, "event_ref") : ""))) {
      errors.push(issue("EVENT_CONTRACT", path, "Event requires event_status, an event operator, observation mode, and event_ref."));
    }
  } else if (kind === "spread") {
    if (metric !== "spread_value" || !NUMERIC_OPERATORS.has(operator) || !isNumber(value) || !pyStrip(pyStr(pyTruthy(get(condition, "benchmark_ref")) ? get(condition, "benchmark_ref") : ""))) {
      errors.push(issue("SPREAD_CONTRACT", path, "Spread requires spread_value, numeric target, and a formula/leg reference."));
    }
  } else if (kind === "probability") {
    if (metric !== "probability_pct" || !NUMERIC_OPERATORS.has(operator) || !isNumber(value) || value < 0 || value > 100) {
      errors.push(issue("PROBABILITY_CONTRACT", path, "Probability requires probability_pct and a target from 0 to 100."));
    }
  } else if (kind === "fundamental") {
    if (metric !== "fundamental_value" || !NUMERIC_OPERATORS.has(operator) || !isNumber(value)) {
      errors.push(issue("FUNDAMENTAL_CONTRACT", path, "Fundamental value requires a numeric target and operator."));
    }
  } else {
    errors.push(issue("CONDITION_KIND", `${path}.kind`, "Unsupported condition kind."));
  }

  if (get(target, "value_source") === "baseline") {
    const baselineValue = get(baseline, "value");
    if (!isNumber(value) || !isNumber(baselineValue) || Math.abs(value - baselineValue) > 1e-9) {
      errors.push(issue("BASELINE_TARGET", `${path}.target`, "A baseline target must equal the sourced baseline value."));
    }
  }

  const conditionStart = parseTime(get(condition, "window_start"), `${path}.window_start`, errors, false);
  const conditionEnd = parseTime(get(condition, "window_end"), `${path}.window_end`, errors, false);
  if ((conditionStart === null) !== (conditionEnd === null)) {
    errors.push(issue("CONDITION_WINDOW_PAIR", path, "Condition window_start and window_end must both be set or both be null."));
  }
  if (conditionStart && conditionEnd) {
    if (conditionEnd.epochUs <= conditionStart.epochUs) {
      errors.push(issue("CONDITION_WINDOW_ORDER", path, "Condition window_end must follow window_start."));
    }
    if (overallStart && conditionStart.epochUs < overallStart.epochUs) {
      errors.push(issue("CONDITION_WINDOW_START", path, "Condition window starts before the overall window."));
    }
    if (overallEnd && conditionEnd.epochUs > overallEnd.epochUs) {
      errors.push(issue("CONDITION_WINDOW_END", path, "Condition window ends after the overall window."));
    }
  }
  return [conditionId, condition];
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (get(payload, "schema_version") !== "settlement-claim-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected settlement-claim-v1."));
  }
  const claimId = get(payload, "claim_id");
  if (typeof claimId !== "string" || !fullmatch("SETTLE_[A-Za-z0-9_-]{8,}", claimId)) {
    errors.push(issue("CLAIM_ID", "$.claim_id", "Invalid claim_id."));
  }
  if (!Number.isInteger(get(payload, "revision")) || getDefault(payload, "revision", 0) < 1) {
    errors.push(issue("REVISION", "$.revision", "revision must be a positive integer."));
  }
  const state = get(payload, "state");
  if (!STATES.has(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }

  const lineage = asObject(get(payload, "lineage"));
  const sourceRefs = stringSet(get(lineage, "source_content_refs"), "$.lineage.source_content_refs", errors);
  if (!sourceRefs.length) {
    errors.push(issue("SOURCE_CONTENT_REQUIRED", "$.lineage.source_content_refs", "At least one source content reference is required."));
  }

  const extraction = asObject(get(payload, "extraction"));
  if (!["explicit", "mixed", "proposed"].includes(get(extraction, "mode"))) {
    errors.push(issue("EXTRACTION_MODE", "$.extraction.mode", "Unsupported extraction mode."));
  }
  const proposed = new Set(stringSet(get(extraction, "proposed_fields"), "$.extraction.proposed_fields", errors));
  const confirmed = new Set(stringSet(get(extraction, "confirmed_fields"), "$.extraction.confirmed_fields", errors));
  const missing = new Set(stringSet(get(extraction, "missing_fields"), "$.extraction.missing_fields", errors));
  stringSet(get(extraction, "explicit_fields"), "$.extraction.explicit_fields", errors);
  stringSet(get(extraction, "inferred_fields"), "$.extraction.inferred_fields", errors);
  const unconfirmed = new Set([...proposed].filter((item) => !confirmed.has(item)));
  if (["ready", "frozen"].includes(state) && unconfirmed.size) {
    errors.push(issue("UNCONFIRMED_PROPOSAL", "$.extraction", `Unconfirmed proposed fields: ${pyRepr([...unconfirmed].sort())}`));
  }
  if (["ready", "frozen"].includes(state) && missing.size) {
    errors.push(issue("MISSING_READY_FIELD", "$.extraction.missing_fields", "Ready or frozen claims cannot have missing fields."));
  }

  const subject = asObject(get(payload, "subject"));
  for (const key of ["instrument_id", "ticker", "display_name", "asset_class", "venue", "quote_currency"]) {
    if (typeof get(subject, key) !== "string" || !pyStrip(pyStr(get(subject, key)))) {
      errors.push(issue("SUBJECT_FIELD", `$.subject.${key}`, `Subject requires ${key}.`));
    }
  }
  const direction = get(payload, "direction");
  if (!DIRECTIONS.has(direction)) {
    errors.push(issue("DIRECTION", "$.direction", "Unsupported direction."));
  }
  if (typeof get(payload, "claim_text") !== "string" || !pyStrip(pyStr(get(payload, "claim_text")))) {
    errors.push(issue("CLAIM_TEXT", "$.claim_text", "claim_text is required."));
  }

  const intentValue = get(payload, "intent");
  const intent = asObject(intentValue);
  const actionState = intentValue !== null ? get(intent, "action_state") : "enter_now";
  if (!ACTION_STATES.has(actionState)) {
    errors.push(issue("ACTION_STATE", "$.intent.action_state", "Unsupported action state."));
  }
  const entryPriceRule = intentValue !== null ? get(intent, "entry_price_rule") : "publication_baseline";
  if (!ENTRY_PRICE_RULES.has(entryPriceRule)) {
    errors.push(issue("ENTRY_PRICE_RULE", "$.intent.entry_price_rule", "Unsupported entry price rule."));
  }
  if (["observe_only", "avoid", "exit"].includes(actionState) && direction !== "neutral") {
    errors.push(issue("ACTION_DIRECTION_CONFLICT", "$.intent.action_state", "Observe-only, avoid, and exit claims use neutral direction."));
  }
  if (["observe_only", "avoid", "exit"].includes(actionState) && entryPriceRule !== "not_applicable") {
    errors.push(issue("ACTION_ENTRY_RULE_CONFLICT", "$.intent.entry_price_rule", "This action state cannot define an entry price."));
  }

  const baseline = asObject(get(payload, "baseline"));
  let baselineObserved = null;
  if (get(baseline, "value") !== null) {
    if (!isNumber(get(baseline, "value"))) {
      errors.push(issue("BASELINE_VALUE", "$.baseline.value", "Baseline value must be numeric or null."));
    }
    baselineObserved = parseTime(get(baseline, "observed_at"), "$.baseline.observed_at", errors);
    if (
      !pyStrip(pyStr(pyTruthy(get(baseline, "unit")) ? get(baseline, "unit") : ""))
      || !pyStrip(pyStr(pyTruthy(get(baseline, "data_source_ref")) ? get(baseline, "data_source_ref") : ""))
      || get(baseline, "observation_basis") === null
      || get(baseline, "observation_basis") === "none"
    ) {
      errors.push(issue("BASELINE_PROVENANCE", "$.baseline", "Numeric baseline requires unit, basis, timestamp, and data source."));
    }
  }
  if (!BASELINE_BASES.has(get(baseline, "observation_basis"))) {
    errors.push(issue("BASELINE_BASIS", "$.baseline.observation_basis", "Unsupported baseline observation basis."));
  }
  if (!BASELINE_MARKET_STATES.has(get(baseline, "market_state"))) {
    errors.push(issue("BASELINE_MARKET_STATE", "$.baseline.market_state", "Baseline must preserve the observed market state."));
  }

  const clock = asObject(get(payload, "clock"));
  const declared = parseTime(get(clock, "declared_at"), "$.clock.declared_at", errors);
  const windowStart = parseTime(get(clock, "window_start"), "$.clock.window_start", errors);
  const endMode = getDefault(clock, "end_mode", "fixed_datetime");
  if (!["fixed_datetime", "protocol_event"].includes(endMode)) {
    errors.push(issue("CLOCK_END_MODE", "$.clock.end_mode", "Clock end mode must be fixed_datetime or protocol_event."));
  }
  const windowEnd = parseTime(get(clock, "window_end"), "$.clock.window_end", errors, endMode === "fixed_datetime");
  const fallbackWindowEnd = parseTime(get(clock, "fallback_window_end"), "$.clock.fallback_window_end", errors, false);
  if (endMode === "protocol_event") {
    if (get(clock, "window_end") !== null) {
      errors.push(issue("EVENT_CLOCK_WINDOW_END", "$.clock.window_end", "A protocol-event clock keeps window_end null."));
    }
    for (const key of ["end_event_ref", "end_event_label", "end_event_source_ref"]) {
      if (typeof get(clock, key) !== "string" || !pyStrip(pyStr(get(clock, key)))) {
        errors.push(issue("EVENT_CLOCK_FIELD", `$.clock.${key}`, `A protocol-event clock requires ${key}.`));
      }
    }
    if (windowStart && fallbackWindowEnd && fallbackWindowEnd.epochUs <= windowStart.epochUs) {
      errors.push(issue("FALLBACK_WINDOW_ORDER", "$.clock.fallback_window_end", "Fallback window end must follow window_start."));
    }
  } else if (["end_event_ref", "end_event_label", "end_event_source_ref", "fallback_window_end"].some((key) => get(clock, key) !== null)) {
    errors.push(issue("FIXED_CLOCK_EVENT_FIELDS", "$.clock", "A fixed clock cannot carry protocol-event fields."));
  }
  if (declared && windowStart && windowStart.epochUs < declared.epochUs) {
    errors.push(issue("WINDOW_BEFORE_DECLARATION", "$.clock.window_start", "Window cannot start before declared_at."));
  }
  if (declared && baselineObserved && baselineObserved.epochUs > declared.epochUs) {
    errors.push(issue("BASELINE_AFTER_DECLARATION", "$.baseline.observed_at", "Baseline observation cannot occur after the claim declaration."));
  }
  if (windowStart && windowEnd && windowEnd.epochUs <= windowStart.epochUs) {
    errors.push(issue("WINDOW_ORDER", "$.clock.window_end", "window_end must follow window_start."));
  }
  try {
    zoneInfoCheck(pyStr(pyTruthy(get(clock, "timezone")) ? get(clock, "timezone") : ""));
  } catch (exc) {
    if (exc instanceof ZoneInfoNotFoundError) {
      errors.push(issue("TIMEZONE", "$.clock.timezone", "Unknown IANA timezone."));
    } else {
      throw exc;
    }
  }
  if (!["regular", "extended", "all_sessions", "continuous", "event_window"].includes(get(clock, "market_session"))) {
    errors.push(issue("MARKET_SESSION", "$.clock.market_session", "Unsupported market session."));
  }

  const success = asObject(get(payload, "success"));
  const logic = get(success, "logic");
  const successConditions = asArray(get(success, "conditions"));
  if (!["all", "any", "sequence"].includes(logic)) {
    errors.push(issue("SUCCESS_LOGIC", "$.success.logic", "Unsupported condition logic."));
  }
  if (!successConditions.length) {
    errors.push(issue("SUCCESS_CONDITION_REQUIRED", "$.success.conditions", "At least one success condition is required."));
  }
  if (logic === "sequence" && successConditions.length < 2) {
    errors.push(issue("SEQUENCE_LENGTH", "$.success.conditions", "Sequence requires at least two conditions."));
  }

  const ids = new Set();
  const parsedSuccess = [];
  successConditions.forEach((condition, index) => {
    const [conditionId, parsed] = validateCondition(condition, `$.success.conditions[${index}]`, baseline, windowStart, windowEnd, errors);
    if (conditionId !== null && ids.has(conditionId)) {
      errors.push(issue("CONDITION_ID_DUPLICATE", `$.success.conditions[${index}].id`, "Condition IDs must be unique."));
    }
    if (conditionId) ids.add(conditionId);
    parsedSuccess.push(parsed);
  });

  const triggerRef = intentValue !== null ? get(intent, "trigger_condition_ref") : null;
  if (actionState === "wait_for_trigger") {
    if (typeof triggerRef !== "string" || !ids.has(triggerRef)) {
      errors.push(issue("TRIGGER_CONDITION_REF", "$.intent.trigger_condition_ref", "wait_for_trigger requires a valid success-condition reference."));
    }
    if (logic !== "sequence" || successConditions.length < 2) {
      errors.push(issue("CONDITIONAL_SEQUENCE", "$.success", "wait_for_trigger requires a trigger followed by an outcome condition."));
    } else if (get(asObject(successConditions[0]), "id") !== triggerRef) {
      errors.push(issue("TRIGGER_SEQUENCE_ORDER", "$.success.conditions", "The trigger condition must be first in the sequence."));
    }
  } else if (triggerRef !== null) {
    errors.push(issue("UNUSED_TRIGGER_REF", "$.intent.trigger_condition_ref", "Only wait_for_trigger may carry a trigger condition reference."));
  }
  if (entryPriceRule === "trigger_observation" && actionState !== "wait_for_trigger") {
    errors.push(issue("TRIGGER_ENTRY_RULE", "$.intent.entry_price_rule", "trigger_observation requires wait_for_trigger."));
  }
  const dynamicOutcomes = parsedSuccess.filter((item) => get(asObject(get(item, "target")), "value_source") === "trigger_observation");
  if (dynamicOutcomes.length && (actionState !== "wait_for_trigger" || entryPriceRule !== "trigger_observation")) {
    errors.push(issue("DYNAMIC_TRIGGER_TARGET", "$.success.conditions", "A trigger-observation target requires wait_for_trigger and entry_price_rule trigger_observation."));
  }
  if (dynamicOutcomes.some((item) => get(item, "id") === triggerRef)) {
    errors.push(issue("TRIGGER_TARGET_SELF_REFERENCE", "$.success.conditions", "The trigger condition cannot target its own trigger observation."));
  }
  if (endMode === "protocol_event") {
    const endEventRef = pyStr(pyTruthy(get(clock, "end_event_ref")) ? get(clock, "end_event_ref") : "");
    const postEventOutcomes = parsedSuccess.filter(
      (item) => get(item, "observation_mode") === "first_after_event" && get(item, "event_ref") === endEventRef,
    );
    if (["long", "short", "outperform", "underperform", "range"].includes(direction) && !postEventOutcomes.length) {
      errors.push(issue("EVENT_HORIZON_OUTCOME", "$.success.conditions", "A directional protocol-event horizon requires an outcome observed first after the named end event."));
    }
  }

  const failure = asObject(get(payload, "failure"));
  if (!["complement_at_expiry", "early_condition", "manual_review"].includes(get(failure, "mode"))) {
    errors.push(issue("FAILURE_MODE", "$.failure.mode", "Unsupported failure mode."));
  }
  const failureConditions = asArray(get(failure, "conditions"));
  if (get(failure, "mode") === "early_condition" && !failureConditions.length) {
    errors.push(issue("EARLY_FAILURE_REQUIRED", "$.failure.conditions", "early_condition requires at least one condition."));
  }
  if (get(failure, "mode") === "complement_at_expiry" && failureConditions.length) {
    errors.push(issue("COMPLEMENT_CONDITIONS", "$.failure.conditions", "Complement-at-expiry must not add separate failure conditions."));
  }
  if (typeof get(failure, "text") !== "string" || !pyStrip(pyStr(get(failure, "text")))) {
    errors.push(issue("FAILURE_TEXT", "$.failure.text", "Failure text is required."));
  }
  failureConditions.forEach((condition, index) => {
    const [conditionId] = validateCondition(condition, `$.failure.conditions[${index}]`, baseline, windowStart, windowEnd, errors);
    if (conditionId !== null && ids.has(conditionId)) {
      errors.push(issue("CONDITION_ID_DUPLICATE", `$.failure.conditions[${index}].id`, "Condition IDs must be unique."));
    }
    if (conditionId) ids.add(conditionId);
  });

  const primaryPrice = parsedSuccess.find(
    (item) => get(item, "subject_ref") === "primary"
      && ["terminal_value", "window_barrier"].includes(get(item, "kind"))
      && PRIMARY_PRICE_METRICS.has(get(item, "metric")),
  ) ?? null;
  if (direction === "long") {
    if (!primaryPrice) {
      errors.push(issue("LONG_PRICE_CONDITION", "$.success.conditions", "Long direction requires a primary upside price or return condition."));
    } else if (["lt", "lte"].includes(get(primaryPrice, "operator"))) {
      errors.push(issue("DIRECTION_CONFLICT", "$.success.conditions", "Long direction conflicts with a downside primary condition."));
    }
  }
  if (direction === "short") {
    if (!primaryPrice) {
      errors.push(issue("SHORT_PRICE_CONDITION", "$.success.conditions", "Short direction requires a primary downside price or return condition."));
    } else if (["gt", "gte"].includes(get(primaryPrice, "operator"))) {
      errors.push(issue("DIRECTION_CONFLICT", "$.success.conditions", "Short direction conflicts with an upside primary condition."));
    }
  }
  if (["outperform", "underperform"].includes(direction) && !parsedSuccess.some((item) => get(item, "kind") === "relative_return")) {
    errors.push(issue("RELATIVE_DIRECTION_CONDITION", "$.success.conditions", "Relative direction requires a relative_return condition."));
  }
  if (direction === "range" && !parsedSuccess.some((item) => get(item, "kind") === "range")) {
    errors.push(issue("RANGE_DIRECTION_CONDITION", "$.success.conditions", "Range direction requires a range condition."));
  }
  if (["event_yes", "event_no"].includes(direction) && !parsedSuccess.some((item) => get(item, "kind") === "event")) {
    errors.push(issue("EVENT_DIRECTION_CONDITION", "$.success.conditions", "Event direction requires an event condition."));
  }

  const resolution = asObject(get(payload, "resolution"));
  if (!pyStrip(pyStr(pyTruthy(get(resolution, "primary_source_ref")) ? get(resolution, "primary_source_ref") : ""))) {
    errors.push(issue("PRIMARY_SOURCE", "$.resolution.primary_source_ref", "Primary resolution source is required."));
  }
  const fallbacks = stringSet(get(resolution, "fallback_source_refs"), "$.resolution.fallback_source_refs", errors);
  if (get(resolution, "ambiguity_policy") === "fallback_source" && !fallbacks.length) {
    errors.push(issue("FALLBACK_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."));
  }
  if (!pyStrip(pyStr(pyTruthy(get(resolution, "adjustments_policy")) ? get(resolution, "adjustments_policy") : ""))) {
    errors.push(issue("ADJUSTMENTS_POLICY", "$.resolution.adjustments_policy", "adjustments_policy is required."));
  }
  const scoreModes = new Set(stringSet(get(resolution, "score_modes"), "$.resolution.score_modes", errors));
  if (!scoreModes.size || [...scoreModes].some((mode) => !SCORE_MODES.has(mode))) {
    errors.push(issue("SCORE_MODES", "$.resolution.score_modes", "Unsupported or empty score modes."));
  }
  if (scoreModes.has("excess_return") && !parsedSuccess.some((item) => get(item, "kind") === "relative_return")) {
    errors.push(issue("EXCESS_RETURN_SCORE", "$.resolution.score_modes", "excess_return scoring requires a relative_return condition."));
  }

  const publicView = asObject(get(payload, "public_view"));
  const expectedStatus = getDefault({ draft: "草稿", needs_confirmation: "待确认", ready: "待结算", frozen: "已冻结" }, state, null);
  if (get(publicView, "status_label") !== expectedStatus) {
    errors.push(issue("STATUS_LABEL", "$.public_view.status_label", `Expected status label ${pyStr(expectedStatus)}.`));
  }
  const summary = get(publicView, "settlement_summary");
  if (typeof summary !== "string" || !pyStrip(summary) || [...summary].length > 600) {
    errors.push(issue("SETTLEMENT_SUMMARY", "$.public_view.settlement_summary", "Summary must contain 1-600 characters."));
  }
  const generatedLine = renderOneLine(payload);
  if (get(publicView, "one_line") !== generatedLine) {
    errors.push(issue("ONE_LINE_MISMATCH", "$.public_view.one_line", `Expected deterministic one-line: ${generatedLine}`));
  }

  const quality = asObject(get(payload, "quality_report"));
  const qualityMissing = new Set(stringSet(get(quality, "missing_fields"), "$.quality_report.missing_fields", errors));
  if (qualityMissing.size !== missing.size || [...qualityMissing].some((item) => !missing.has(item))) {
    errors.push(issue("MISSING_FIELD_MISMATCH", "$.quality_report.missing_fields", "Quality and extraction missing fields must match."));
  }
  let expectedDecision = ["ready", "frozen"].includes(state) ? "ready" : "needs_confirmation";
  if (state === "draft" && get(quality, "decision") === "blocked") {
    expectedDecision = "blocked";
  }
  if (get(quality, "decision") !== expectedDecision) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", `Expected quality decision ${expectedDecision}.`));
  }
  stringSet(get(quality, "warnings"), "$.quality_report.warnings", errors);

  const expectedHash = canonicalHash(payload);
  const storedHash = get(lineage, "canonical_hash");
  if (state === "frozen") {
    if (storedHash !== expectedHash) {
      errors.push(issue("CANONICAL_HASH", "$.lineage.canonical_hash", "Frozen claim canonical hash is missing or does not match."));
    }
  } else if (storedHash !== null) {
    errors.push(issue("UNFROZEN_HASH", "$.lineage.canonical_hash", "Only frozen claims may store a canonical hash."));
  }

  if (["draft", "needs_confirmation"].includes(state)) {
    warnings.push(issue("NOT_READY", "$.state", "Claim is not ready for release as a settleable commitment."));
  }
  return {
    valid: !errors.length,
    errors,
    warnings,
    generated_one_line: generatedLine,
    canonical_hash: expectedHash,
  };
}

function loadPayload(path) {
  const text = path === "-" ? readFileSync(0, "utf-8") : readFileSync(path, "utf-8");
  const value = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Top-level JSON value must be an object.");
  }
  return value;
}

const USAGE = "usage: validate_settlement_claim.mjs [-h] [--print-one-line] [--print-canonical-hash] path";

function parseCliArgs(argv) {
  const flags = { "print-one-line": false, "print-canonical-hash": false };
  const positionals = [];
  let onlyPositionals = false;
  for (const token of argv) {
    if (onlyPositionals || token === "-" || !token.startsWith("-")) {
      positionals.push(token);
    } else if (token === "--") {
      onlyPositionals = true;
    } else if (token === "-h" || token === "--help") {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else if (token === "--print-one-line" || token === "--print-canonical-hash") {
      flags[token.slice(2)] = true;
    } else {
      process.stderr.write(`${USAGE}\nvalidate_settlement_claim.mjs: error: unrecognized arguments: ${token}\n`);
      process.exit(2);
    }
  }
  if (positionals.length !== 1) {
    const detail = positionals.length === 0
      ? "the following arguments are required: path"
      : `unrecognized arguments: ${positionals.slice(1).join(" ")}`;
    process.stderr.write(`${USAGE}\nvalidate_settlement_claim.mjs: error: ${detail}\n`);
    process.exit(2);
  }
  return { path: positionals[0], printOneLine: flags["print-one-line"], printCanonicalHash: flags["print-canonical-hash"] };
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  let payload;
  try {
    payload = loadPayload(args.path);
  } catch (exc) {
    process.stdout.write(`${pyDumps({ valid: false, errors: [{ code: "INPUT", path: "$", message: String(exc.message ?? exc) }] })}\n`);
    return 1;
  }
  const result = validate(payload);
  if (args.printOneLine) {
    process.stdout.write(`${result.generated_one_line}\n`);
  } else if (args.printCanonicalHash) {
    process.stdout.write(`${result.canonical_hash}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result.valid ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
