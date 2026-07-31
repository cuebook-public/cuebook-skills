#!/usr/bin/env node
// Compute deterministic IndicatorPackV1 values from ThesisChartDataV1.
//
// Port of compute_indicators.py; output shapes, message wording, float
// rounding (Python round-half-even on the exact binary value) and float
// repr formatting in the JSON output are contract and stay byte-compatible
// with the Python original.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const DESCRIPTION = "Compute deterministic IndicatorPackV1 values from ThesisChartDataV1.";

const KINDS = new Set([
  "return_pct",
  "relative_strength_pct",
  "sma_distance_pct",
  "ema_distance_pct",
  "rsi",
  "atr_pct",
  "volume_ratio",
  "drawdown_pct",
  "vwap_distance_pct",
  "breakout_distance_pct",
]);

// Python ValueError equivalent so main() only converts contractual failures.
class ValueError extends Error {}

// Wrapper marking a value as a Python float for JSON serialization
// (json.dumps prints 15.0, JSON.stringify would print 15).
class PyFloat {
  constructor(value) {
    this.value = value;
  }
  valueOf() {
    return this.value;
  }
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof PyFloat);
}

// str(x or "") as the Python used it on JSON-derived scalars.
function strOrEmpty(value) {
  if (!value) return "";
  return String(value);
}

// str(x) for JSON scalars (None -> "None", True -> "True").
function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

// repr() of a sorted list of strings, as f"{sorted(intervals)}" prints it.
function pyStrListRepr(values) {
  const parts = values.map((item) => {
    const quote = item.includes("'") && !item.includes('"') ? '"' : "'";
    let out = quote;
    for (const ch of item) {
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += ch;
    }
    return out + quote;
  });
  return `[${parts.join(", ")}]`;
}

// Python round(value, 8): round-half-even on the exact decimal expansion of
// the binary double, then convert the rounded decimal back to the nearest
// double (CPython uses correctly-rounded dtoa/strtod; this reproduces it).
function pyRound8(value) {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return value;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const negative = (bits >> 63n) === 1n;
  let exponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  if (exponent === 0) {
    exponent = -1074;
  } else {
    mantissa |= 0x10000000000000n;
    exponent -= 1075;
  }
  // |value| = mantissa * 2^exponent, exactly.
  if (exponent >= 0) return value; // integral: rounding to 8 decimals is a no-op
  const numerator = mantissa * 10n ** 8n;
  const denominator = 1n << BigInt(-exponent);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = remainder * 2n;
  if (twice > denominator || (twice === denominator && (quotient & 1n) === 1n)) {
    quotient += 1n;
  }
  if (quotient === 0n) return negative ? -0 : 0;
  const magnitude = Number(`${quotient}e-8`);
  return negative ? -magnitude : magnitude;
}

// repr(float) as CPython prints it (shortest round-trip digits, scientific
// notation for exponent >= 16 or < -4, two-digit signed exponent, and a
// trailing .0 on integral values).
function pyFloatRepr(value) {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return "inf";
  if (value === -Infinity) return "-inf";
  let negative = value < 0 || Object.is(value, -0);
  const exponential = Math.abs(value).toExponential(); // shortest unique digits
  const [mantissaText, exponentText] = exponential.split("e");
  const exponent = parseInt(exponentText, 10);
  const digits = mantissaText.replace(".", "");
  const sign = negative ? "-" : "";
  if (exponent >= 16 || exponent < -4) {
    const fraction = digits.length > 1 ? `.${digits.slice(1)}` : "";
    const expSign = exponent < 0 ? "-" : "+";
    const expDigits = String(Math.abs(exponent)).padStart(2, "0");
    return `${sign}${digits[0]}${fraction}e${expSign}${expDigits}`;
  }
  if (exponent >= 0) {
    if (digits.length <= exponent + 1) {
      return `${sign}${digits.padEnd(exponent + 1, "0")}.0`;
    }
    return `${sign}${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
  }
  return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
}

// json.dumps(value, ensure_ascii=False, indent=2); PyFloat marks Python
// floats, plain non-integer numbers also print with float repr.
function pyJsonDumps(value, indentLevel = 0) {
  const pad = "  ".repeat(indentLevel);
  const childPad = "  ".repeat(indentLevel + 1);
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${childPad}${pyJsonDumps(item, indentLevel + 1)}`);
    return `[\n${items.join(",\n")}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const items = entries.map(([key, item]) => `${childPad}${JSON.stringify(key)}: ${pyJsonDumps(item, indentLevel + 1)}`);
  return `{\n${items.join(",\n")}\n${pad}}`;
}

// datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"): microsecond
// precision, fractional part omitted when exactly zero.
function isoNow() {
  const now = new Date();
  const pad = (number, width = 2) => String(number).padStart(width, "0");
  let text =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const milliseconds = now.getUTCMilliseconds();
  if (milliseconds !== 0) text += `.${pad(milliseconds * 1000, 6)}`;
  return `${text}Z`;
}

// isinstance(x, int) — Python bools are ints.
function isPyInt(value) {
  return typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value));
}

export function validateRequest(payload) {
  const errors = [];
  if (!isDict(payload)) {
    return ["Request must be a JSON object."];
  }
  if (payload.schema_version !== "indicator-request-v1") {
    errors.push("schema_version must be indicator-request-v1.");
  }
  if (!/^INDREQ_[A-Za-z0-9_:-]{8,}$/.test(strOrEmpty(payload.request_id))) {
    errors.push("request_id is invalid.");
  }
  for (const key of ["source_ref", "source_path", "primary_series_ref"]) {
    if (typeof payload[key] !== "string" || !payload[key].trim()) {
      errors.push(`${key} is required.`);
    }
  }
  const benchmark = payload.benchmark_series_ref;
  if (benchmark !== null && benchmark !== undefined && (typeof benchmark !== "string" || !benchmark.trim())) {
    errors.push("benchmark_series_ref must be null or a non-empty string.");
  }
  if (typeof payload.include_forming !== "boolean") {
    errors.push("include_forming must be boolean.");
  }
  const indicators = payload.indicators;
  if (!Array.isArray(indicators) || indicators.length === 0) {
    errors.push("indicators must be a non-empty array.");
    return errors;
  }
  const ids = new Set();
  indicators.forEach((item, index) => {
    if (!isDict(item)) {
      errors.push(`indicators[${index}] must be an object.`);
      return;
    }
    const indicatorId = item.id;
    if (typeof indicatorId !== "string" || !/^I[1-9][0-9]*$/.test(indicatorId)) {
      errors.push(`indicators[${index}].id must use I<number>.`);
    } else if (ids.has(indicatorId)) {
      errors.push(`indicators[${index}].id must be unique.`);
    } else {
      ids.add(indicatorId);
    }
    if (!KINDS.has(item.kind)) {
      errors.push(`indicators[${index}].kind is unsupported.`);
    }
    const lookback = item.lookback_bars;
    if (lookback !== null && lookback !== undefined && (!isPyInt(lookback) || lookback < 1)) {
      errors.push(`indicators[${index}].lookback_bars must be null or positive.`);
    }
  });
  return errors;
}

function selectedPoints(series, includeForming) {
  let points = (Array.isArray(series.points) ? series.points : []).filter((item) => isDict(item));
  if (!includeForming) {
    points = points.filter((item) => item.state === "sealed");
  }
  // sorted(..., key=str(observed_at or "")): stable sort on the string key.
  return points
    .map((item, index) => ({ item, index, key: strOrEmpty(item.observed_at) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index))
    .map((entry) => entry.item);
}

function ema(values, period) {
  const alpha = 2.0 / (period + 1.0);
  let current = values.slice(0, period).reduce((total, value) => total + value, 0) / period;
  for (const value of values.slice(period)) {
    current = value * alpha + current * (1.0 - alpha);
  }
  return current;
}

function rsi(values, period) {
  const deltas = values.slice(1).map((current, index) => current - values[index]);
  const window = deltas.slice(-period);
  const gains = window.reduce((total, value) => total + Math.max(value, 0.0), 0) / period;
  const losses = window.reduce((total, value) => total + Math.max(-value, 0.0), 0) / period;
  if (losses === 0) {
    return gains > 0 ? 100.0 : 50.0;
  }
  const relativeStrength = gains / losses;
  return 100.0 - 100.0 / (1.0 + relativeStrength);
}

function resultState(points) {
  if (points.length === 0) return "unavailable";
  const last = points[points.length - 1];
  const state = last.state ? pyStr(last.state) : "unavailable"; // str(state or "unavailable")
  return state === "sealed" || state === "forming" ? state : "unavailable";
}

function insufficient(item, seriesRefs, formula, sourceRef) {
  return {
    id: item.id,
    kind: item.kind,
    series_refs: seriesRefs,
    lookback_bars: item.lookback_bars ?? null,
    value: null,
    unit: item.kind !== "volume_ratio" ? "%" : "x",
    observed_at: null,
    bar_state: "unavailable",
    formula,
    status: "insufficient_data",
    source_ref: sourceRef,
  };
}

function computeOne(item, seriesMap, primaryRef, benchmarkRef, includeForming, sourceRef) {
  const kind = item.kind;
  const lookback = item.lookback_bars ?? null;
  const requestedRef = item.series_ref || primaryRef;
  let primary = seriesMap.get(requestedRef);
  if (primary === undefined) {
    return insufficient(item, [requestedRef], "series unavailable", sourceRef);
  }
  const points = selectedPoints(primary, includeForming);
  const closes = points
    .filter((point) => point.close !== null && point.close !== undefined)
    .map((point) => Number(point.close));
  let state = resultState(points);
  let observedAt = points.length ? points[points.length - 1].observed_at ?? null : null;
  let status = state === "forming" || state === "mixed" ? "provisional" : "ready";
  let seriesRefs = [requestedRef];
  let value = null;
  let unit = "%";
  let formula = "";

  if (kind === "return_pct") {
    formula = "(latest_close / explicit_baseline - 1) * 100";
    if (points.length) {
      const baseline = Number(primary.baseline.value);
      value = (closes[closes.length - 1] / baseline - 1.0) * 100.0;
    }
  } else if (kind === "relative_strength_pct") {
    formula = "primary_return_from_baseline - benchmark_return_from_baseline";
    if (benchmarkRef === null || benchmarkRef === undefined || !seriesMap.has(benchmarkRef)) {
      return insufficient(item, [primaryRef], formula, sourceRef);
    }
    primary = seriesMap.get(primaryRef);
    const benchmark = seriesMap.get(benchmarkRef);
    const primaryPoints = selectedPoints(primary, includeForming);
    const benchmarkPoints = selectedPoints(benchmark, includeForming);
    seriesRefs = [primaryRef, benchmarkRef];
    if (primaryPoints.length === 0 || benchmarkPoints.length === 0) {
      return insufficient(item, seriesRefs, formula, sourceRef);
    }
    const lastPrimary = primaryPoints[primaryPoints.length - 1];
    const lastBenchmark = benchmarkPoints[benchmarkPoints.length - 1];
    const primaryReturn = (Number(lastPrimary.close) / Number(primary.baseline.value) - 1.0) * 100.0;
    const benchmarkReturn = (Number(lastBenchmark.close) / Number(benchmark.baseline.value) - 1.0) * 100.0;
    value = primaryReturn - benchmarkReturn;
    const primaryObserved = pyStr(lastPrimary.observed_at ?? null);
    const benchmarkObserved = pyStr(lastBenchmark.observed_at ?? null);
    observedAt = primaryObserved >= benchmarkObserved ? primaryObserved : benchmarkObserved;
    const states = new Set([pyStr(lastPrimary.state ?? null), pyStr(lastBenchmark.state ?? null)]);
    state = states.size === 1 ? states.values().next().value : "mixed";
    status = states.has("forming") || state === "mixed" ? "provisional" : "ready";
  } else if (kind === "sma_distance_pct") {
    const period = lookback || 20;
    formula = `(latest_close / SMA(${period}) - 1) * 100`;
    if (closes.length >= period) {
      const average = closes.slice(-period).reduce((total, close) => total + close, 0) / period;
      value = (closes[closes.length - 1] / average - 1.0) * 100.0;
    }
  } else if (kind === "ema_distance_pct") {
    const period = lookback || 20;
    formula = `(latest_close / EMA(${period}) - 1) * 100`;
    if (closes.length >= period) {
      value = (closes[closes.length - 1] / ema(closes, period) - 1.0) * 100.0;
    }
  } else if (kind === "rsi") {
    const period = lookback || 14;
    formula = `RSI(${period}) from close-to-close changes`;
    unit = "index";
    if (closes.length >= period + 1) {
      value = rsi(closes, period);
    }
  } else if (kind === "atr_pct") {
    const period = lookback || 14;
    formula = `ATR(${period}) / latest_close * 100`;
    if (points.length >= period + 1) {
      const previousWindow = points.slice(-(period + 1));
      const currentWindow = points.slice(-period);
      const trueRanges = [];
      for (let index = 0; index < currentWindow.length; index += 1) {
        const previous = previousWindow[index];
        const current = currentWindow[index];
        const high = Number(current.high);
        const low = Number(current.low);
        const previousClose = Number(previous.close);
        trueRanges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
      }
      value = (trueRanges.reduce((total, range) => total + range, 0) / period / closes[closes.length - 1]) * 100.0;
    }
  } else if (kind === "volume_ratio") {
    const period = lookback || 20;
    formula = `latest_volume / previous_${period}_bar_average_volume`;
    unit = "x";
    const volumes = points
      .filter((point) => point.volume !== null && point.volume !== undefined)
      .map((point) => Number(point.volume));
    if (volumes.length >= period + 1) {
      const previousAverage = volumes.slice(-(period + 1), -1).reduce((total, volume) => total + volume, 0) / period;
      value = previousAverage ? volumes[volumes.length - 1] / previousAverage : null;
    }
  } else if (kind === "drawdown_pct") {
    const period = lookback || 20;
    formula = `(latest_close / highest_close_${period} - 1) * 100`;
    if (closes.length >= period) {
      value = (closes[closes.length - 1] / Math.max(...closes.slice(-period)) - 1.0) * 100.0;
    }
  } else if (kind === "vwap_distance_pct") {
    formula = "(latest_close / latest_vwap - 1) * 100";
    if (points.length) {
      const vwap = points[points.length - 1].vwap;
      // Python membership `not in {None, 0, 0.0}` also excludes False (== 0).
      if (!(vwap === null || vwap === undefined || vwap === 0 || vwap === false)) {
        value = (Number(points[points.length - 1].close) / Number(vwap) - 1.0) * 100.0;
      }
    }
  } else if (kind === "breakout_distance_pct") {
    const period = lookback || 20;
    formula = `(latest_close / previous_${period}_bar_high - 1) * 100`;
    if (points.length >= period + 1) {
      const previousHigh = Math.max(...points.slice(-(period + 1), -1).map((point) => Number(point.high)));
      value = (Number(points[points.length - 1].close) / previousHigh - 1.0) * 100.0;
    }
  }

  if (value === null || !Number.isFinite(value)) {
    return insufficient(item, seriesRefs, formula, sourceRef);
  }
  return {
    id: item.id,
    kind,
    series_refs: seriesRefs,
    lookback_bars: lookback,
    value: new PyFloat(pyRound8(value)),
    unit,
    observed_at: observedAt,
    bar_state: state,
    formula,
    status,
    source_ref: sourceRef,
  };
}

export function buildPack(request, chartData) {
  const sourceSeries = chartData.series;
  if (!Array.isArray(sourceSeries) || sourceSeries.length === 0) {
    throw new ValueError("Chart data has no series.");
  }
  const seriesMap = new Map();
  for (const item of sourceSeries) {
    if (isDict(item)) {
      seriesMap.set(pyStr(item.id ?? null), item);
    }
  }
  const primaryRef = request.primary_series_ref;
  const benchmarkRef = request.benchmark_series_ref ?? null;
  if (!seriesMap.has(primaryRef)) {
    throw new ValueError(`Unknown primary series ${primaryRef}.`);
  }
  if (benchmarkRef !== null && !seriesMap.has(benchmarkRef)) {
    throw new ValueError(`Unknown benchmark series ${benchmarkRef}.`);
  }
  const intervals = new Set(sourceSeries.map((item) => pyStr(item.observed_interval ?? null)));
  if (intervals.size !== 1) {
    throw new ValueError(`Mixed source intervals are not allowed: ${pyStrListRepr([...intervals].sort())}`);
  }
  const interval = intervals.values().next().value;
  const results = request.indicators.map((item) =>
    computeOne(item, seriesMap, primaryRef, benchmarkRef, request.include_forming, request.source_ref),
  );
  const warnings = [];
  if (results.some((item) => item.status === "provisional")) {
    warnings.push("One or more indicators use a forming bar and remain provisional.");
  }
  if (results.some((item) => item.status === "insufficient_data")) {
    warnings.push("One or more requested indicators lack sufficient source history.");
  }
  const decision = warnings.length ? "conditional" : "ready";
  const stripped = request.request_id.startsWith("INDREQ_") ? request.request_id.slice("INDREQ_".length) : request.request_id;
  const suffix = stripped.replace(/[^A-Za-z0-9_:-]/g, "");
  return {
    schema_version: "indicator-pack-v1",
    pack_id: `INDPACK_${suffix}`,
    request_ref: request.request_id,
    source_ref: request.source_ref,
    computed_at: isoNow(),
    interval,
    include_forming: request.include_forming,
    results,
    quality_report: { decision, warnings, hard_failures: [] },
  };
}

const ERRNO_TEXT = {
  ENOENT: [2, "No such file or directory"],
  EACCES: [13, "Permission denied"],
  EISDIR: [21, "Is a directory"],
  ENOTDIR: [20, "Not a directory"],
};

// str(OSError) as Python formats it for the mapped errnos.
function osErrorText(error, path) {
  const mapped = ERRNO_TEXT[error.code];
  if (!mapped) return error.message;
  return `[Errno ${mapped[0]}] ${mapped[1]}: '${path}'`;
}

// json.loads with Python's JSONDecodeError message for the common
// "no value at the start" failures (empty input, whitespace, bad token).
function pyJsonLoads(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    let index = 0;
    while (index < text.length && " \t\n\r".includes(text[index])) index += 1;
    if (index >= text.length || !'{["-0123456789tfn'.includes(text[index])) {
      const before = text.slice(0, index);
      const lastNewline = before.lastIndexOf("\n");
      const line = (before.match(/\n/g) || []).length + 1;
      const column = index - lastNewline;
      const decodeError = new SyntaxError(`Expecting value: line ${line} column ${column} (char ${index})`);
      decodeError.pyJson = true;
      throw decodeError;
    }
    error.pyJson = true;
    throw error;
  }
}

function parseArgs(argv) {
  const prog = "compute_indicators.mjs";
  const usage = `usage: ${prog} [-h] --output OUTPUT request\n`;
  const fail = (message) => {
    process.stderr.write(usage);
    process.stderr.write(`${prog}: error: ${message}\n`);
    process.exit(2);
  };
  let request = null;
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${usage}\n${DESCRIPTION}\n`);
      process.exit(0);
    } else if (arg === "--output") {
      index += 1;
      if (index >= argv.length) fail("argument --output: expected one argument");
      output = argv[index];
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg.startsWith("-") && arg !== "-") {
      fail(`unrecognized arguments: ${arg}`);
    } else if (request === null) {
      request = arg;
    } else {
      fail(`unrecognized arguments: ${arg}`);
    }
  }
  const missing = [];
  if (request === null) missing.push("request");
  if (output === null) missing.push("--output");
  if (missing.length) fail(`the following arguments are required: ${missing.join(", ")}`);
  return { request, output };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let request;
  try {
    request = pyJsonLoads(readFileSync(args.request, "utf-8"));
  } catch (error) {
    const detail = error.code ? osErrorText(error, args.request) : error.message;
    process.stderr.write(`Unable to read request: ${detail}\n`);
    return 1;
  }
  const errors = validateRequest(request);
  if (errors.length) {
    process.stderr.write(`${JSON.stringify({ valid: false, errors }, null, 2)}\n`);
    return 1;
  }
  let pack;
  try {
    const chartData = pyJsonLoads(readFileSync(request.source_path, "utf-8"));
    pack = buildPack(request, chartData);
  } catch (error) {
    if (!(error instanceof ValueError) && !error.code && !error.pyJson && !(error instanceof SyntaxError)) throw error;
    const detail = error.code ? osErrorText(error, request.source_path) : error.message;
    process.stderr.write(`Indicator computation failed: ${detail}\n`);
    return 1;
  }
  mkdirSync(dirname(args.output) || ".", { recursive: true });
  const serialized = pyJsonDumps(pack);
  writeFileSync(args.output, serialized, "utf-8");
  process.stdout.write(`${serialized}\n`);
  return 0;
}

export { ValueError, PyFloat, computeOne, selectedPoints, ema, rsi, pyRound8, pyFloatRepr, pyJsonDumps };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
