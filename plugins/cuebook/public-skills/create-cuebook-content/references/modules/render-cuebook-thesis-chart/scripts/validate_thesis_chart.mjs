#!/usr/bin/env node
// Validate ThesisChartV1 structure and chart-specific semantic invariants.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

// ---------------------------------------------------------------------------
// Python-parity helpers (shared with render_thesis_chart.mjs via exports).
// ---------------------------------------------------------------------------

// dict.get(key[, default]) semantics: missing keys and explicit undefined map
// to the default (null unless provided); stored null stays null.
export function g(obj, key, fallback = null) {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj) && key in obj) {
    const value = obj[key];
    return value === undefined ? fallback : value;
  }
  return fallback;
}

export function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// str() semantics for the value kinds JSON can produce.
export function pyStr(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (value === null || value === undefined) return "None";
  return String(value);
}

// str.strip() truthiness helper: non-empty after stripping whitespace.
export function strippedTruthy(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Python isinstance(x, int) — booleans are ints in Python.
export function pyIsInt(value) {
  return typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value));
}

// Python isinstance(x, (int, float)) — booleans included.
export function pyIsNumber(value) {
  return typeof value === "boolean" || typeof value === "number";
}

// Numeric coercion mirroring Python arithmetic on bools.
export function pyNum(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

// round(x) with no digits: banker's rounding to an integer.
export function pyRound(x) {
  x = Number(x);
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Exact Python float formatting.
// ---------------------------------------------------------------------------

// f"{x:.<digits>f}" — correctly-rounded fixed formatting with ties-to-even on
// the exact binary value of the double (matches CPython, unlike toFixed).
export function pyFixed(x, digits) {
  x = pyNum(x);
  if (!Number.isFinite(x)) return x > 0 ? "inf" : x < 0 ? "-inf" : "nan";
  const negative = x < 0 || Object.is(x, -0);
  const abs = Math.abs(x);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, abs);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp;
  if (expBits === 0) {
    exp = -1074n;
  } else {
    mantissa |= 1n << 52n;
    exp = BigInt(expBits) - 1075n;
  }
  const scaled = mantissa * 10n ** BigInt(digits);
  let quotient;
  if (exp >= 0n) {
    quotient = scaled << exp;
  } else {
    const denominator = 1n << -exp;
    quotient = scaled / denominator;
    const remainder = scaled % denominator;
    const doubled = remainder * 2n;
    if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) {
      quotient += 1n;
    }
  }
  let body = quotient.toString();
  if (digits > 0) {
    if (body.length <= digits) body = "0".repeat(digits - body.length + 1) + body;
    body = body.slice(0, body.length - digits) + "." + body.slice(body.length - digits);
  }
  return (negative ? "-" : "") + body;
}

// f"{x:+.<digits>f}"
export function pyFixedSigned(x, digits) {
  const body = pyFixed(x, digits);
  return body.startsWith("-") ? body : "+" + body;
}

// f"{x:,.<digits>f}"
export function pyFixedGrouped(x, digits) {
  let body = pyFixed(x, digits);
  let sign = "";
  if (body.startsWith("-")) {
    sign = "-";
    body = body.slice(1);
  }
  const dot = body.indexOf(".");
  let integer = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? "" : body.slice(dot);
  integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + integer + rest;
}

// repr(float) — Python's shortest round-trip formatting, including the
// trailing ".0" for integral floats and Python-style exponents.
export function pyFloatRepr(x) {
  x = pyNum(x);
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (Object.is(x, -0)) return "-0.0";
  if (x === 0) return "0.0";
  const negative = x < 0;
  const abs = Math.abs(x);
  const [mantissa, expText] = abs.toExponential().split("e");
  const digits = mantissa.replace(".", "");
  const exp = Number(expText);
  let body;
  if (exp >= -4 && exp < 16) {
    if (exp >= digits.length - 1) {
      body = digits + "0".repeat(exp - (digits.length - 1)) + ".0";
    } else if (exp >= 0) {
      body = digits.slice(0, exp + 1) + "." + digits.slice(exp + 1);
    } else {
      body = "0." + "0".repeat(-exp - 1) + digits;
    }
  } else {
    const mantissaBody = digits.length === 1 ? digits : digits[0] + "." + digits.slice(1);
    const expSign = exp < 0 ? "-" : "+";
    const expAbs = String(Math.abs(exp)).padStart(2, "0");
    body = `${mantissaBody}e${expSign}${expAbs}`;
  }
  return (negative ? "-" : "") + body;
}

// repr(str) — enough of CPython's algorithm for public copy and identifiers.
export function pyStrRepr(value) {
  const useDouble = value.includes("'") && !value.includes('"');
  const quote = useDouble ? '"' : "'";
  let body = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (char === "\\") body += "\\\\";
    else if (char === quote) body += "\\" + quote;
    else if (char === "\n") body += "\\n";
    else if (char === "\r") body += "\\r";
    else if (char === "\t") body += "\\t";
    else if (code < 0x20 || code === 0x7f) body += "\\x" + code.toString(16).padStart(2, "0");
    else body += char;
  }
  return quote + body + quote;
}

// repr(x) for the JSON value kinds these scripts interpolate with !r.
export function pyRepr(value) {
  if (typeof value === "string") return pyStrRepr(value);
  if (value === true) return "True";
  if (value === false) return "False";
  if (value === null || value === undefined) return "None";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// datetime.fromisoformat parity (micros since epoch; calendar math is exact).
// ---------------------------------------------------------------------------

function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days) {
  // Howard Hinnant's inverse expects a civil-epoch day count; our caller uses
  // Unix-epoch days, matching daysFromCivil's 719468 subtraction above.
  const z = days + 719468;
  const era = Math.floor(z >= 0 ? z / 146097 : (z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return [y + (month <= 2 ? 1 : 0), month, day];
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// Parses the subset of datetime.fromisoformat these skills exercise:
// extended/basic calendar dates, an arbitrary single-character separator,
// HH[:MM[:SS]] or basic times, fractional seconds (truncated to micros), and
// Z / ±HH[:MM[:SS]] (or basic ±HHMM[SS]) offsets. Returns null on failure.
export function parseIsoDateTime(raw) {
  if (typeof raw !== "string") return null;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  let year;
  let month;
  let day;
  let rest;
  if (match) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    rest = raw.slice(10);
  } else {
    match = /^(\d{4})(\d{2})(\d{2})/.exec(raw);
    if (!match) return null;
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    rest = raw.slice(8);
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let micro = 0;
  let offsetMicros = null;
  if (rest !== "") {
    if (rest.length < 3) return null;
    const time = rest.slice(1);
    const timeMatch =
      /^(\d{2})(?::(\d{2})(?::(\d{2}))?|(\d{2})(\d{2})?)?(?:[.,](\d+))?(Z|z|[+-]\d{2}(?::?\d{2}(?::?\d{2}(?:[.,]\d{1,6})?)?)?)?$/.exec(time);
    if (!timeMatch) return null;
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] ?? timeMatch[4] ?? "0");
    second = Number(timeMatch[3] ?? timeMatch[5] ?? "0");
    if (timeMatch[6] !== undefined) {
      micro = Number((timeMatch[6] + "000000").slice(0, 6));
    }
    if (hour > 23 || minute > 59 || second > 59) return null;
    const zone = timeMatch[7];
    if (zone !== undefined) {
      if (zone === "Z" || zone === "z") {
        offsetMicros = 0;
      } else {
        const sign = zone[0] === "-" ? -1 : 1;
        const zoneBody = zone.slice(1).replace(/:/g, "");
        const zoneHour = Number(zoneBody.slice(0, 2));
        const zoneMinute = Number(zoneBody.slice(2, 4) || "0");
        const secondPart = zoneBody.slice(4);
        let zoneSecond = 0;
        let zoneMicro = 0;
        if (secondPart) {
          const secondMatch = /^(\d{2})(?:[.,](\d{1,6}))?$/.exec(secondPart);
          if (!secondMatch) return null;
          zoneSecond = Number(secondMatch[1]);
          if (secondMatch[2] !== undefined) zoneMicro = Number((secondMatch[2] + "000000").slice(0, 6));
        }
        if (zoneMinute > 59 || zoneSecond > 59) return null;
        const total = ((zoneHour * 60 + zoneMinute) * 60 + zoneSecond) * 1_000_000 + zoneMicro;
        if (total >= 24 * 3600 * 1_000_000) return null;
        offsetMicros = sign * total;
      }
    }
  }
  const localMicros =
    (daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second) * 1_000_000 + micro;
  if (offsetMicros === null) {
    return { micros: localMicros, hasTz: false, wall: { year, month, day, hour, minute, second, micro } };
  }
  return { micros: localMicros - offsetMicros, hasTz: true, wall: { year, month, day, hour, minute, second, micro } };
}

// ---------------------------------------------------------------------------
// json.dumps parity.
// ---------------------------------------------------------------------------

// Marks a value the Python code coerced with float() so serialization keeps
// Python's float formatting (e.g. "100.0"). valueOf lets arithmetic and
// comparisons unwrap transparently.
export class PyFloat {
  constructor(value) {
    this.value = pyNum(Number(value));
  }
  valueOf() {
    return this.value;
  }
}

export function pyFloatOf(value) {
  return new PyFloat(value);
}

function pyJsonScalar(value) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return value > 0 ? "Infinity" : Number.isNaN(value) ? "NaN" : "-Infinity";
    return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  return null;
}

// json.dumps(value, ensure_ascii=False, indent=2) with PyFloat awareness.
export function pyJsonDumps(value, indent = 2, level = 0) {
  const scalar = pyJsonScalar(value);
  if (scalar !== null) return scalar;
  const pad = " ".repeat(indent * (level + 1));
  const closePad = " ".repeat(indent * level);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => pad + pyJsonDumps(item, indent, level + 1));
    return "[\n" + items.join(",\n") + "\n" + closePad + "]";
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const items = keys.map((key) => `${pad}${JSON.stringify(key)}: ${pyJsonDumps(value[key], indent, level + 1)}`);
  return "{\n" + items.join(",\n") + "\n" + closePad + "}";
}

// json.dumps(value, ensure_ascii=False) — Python's default ", " / ": " separators.
export function pyJsonDumpsCompactSpaced(value) {
  const scalar = pyJsonScalar(value);
  if (scalar !== null) return scalar;
  if (Array.isArray(value)) {
    return "[" + value.map((item) => pyJsonDumpsCompactSpaced(item)).join(", ") + "]";
  }
  const items = Object.keys(value).map(
    (key) => `${JSON.stringify(key)}: ${pyJsonDumpsCompactSpaced(value[key])}`
  );
  return "{" + items.join(", ") + "}";
}

// ensure_ascii=True post-pass: escape every non-ASCII UTF-16 unit as \uXXXX.
export function ensureAscii(serialized) {
  return serialized.replace(/[\u0080-\uffff]/g, (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
}

// ---------------------------------------------------------------------------
// Python-compatible JSON parsing (json.loads error messages included).
// ---------------------------------------------------------------------------

export class PyJsonError extends Error {}

function jsonErrorAt(doc, pos, message) {
  let line = 1;
  for (let index = 0; index < pos; index += 1) if (doc[index] === "\n") line += 1;
  const lastNewline = doc.lastIndexOf("\n", pos - 1);
  const column = pos - lastNewline;
  return new PyJsonError(`${message}: line ${line} column ${column} (char ${pos})`);
}

export function pyJsonLoads(doc) {
  let pos = 0;
  const skipWs = () => {
    while (pos < doc.length && (doc[pos] === " " || doc[pos] === "\t" || doc[pos] === "\n" || doc[pos] === "\r")) pos += 1;
  };
  const parseString = () => {
    const begin = pos;
    pos += 1;
    let out = "";
    for (;;) {
      if (pos >= doc.length) throw jsonErrorAt(doc, begin, "Unterminated string starting at");
      const char = doc[pos];
      if (char === '"') {
        pos += 1;
        return out;
      }
      if (char === "\\") {
        pos += 1;
        if (pos >= doc.length) throw jsonErrorAt(doc, begin, "Unterminated string starting at");
        const escape = doc[pos];
        if (escape === "u") {
          const hex = doc.slice(pos + 1, pos + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw jsonErrorAt(doc, pos - 1, "Invalid \\uXXXX escape");
          out += String.fromCharCode(parseInt(hex, 16));
          pos += 5;
        } else {
          const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (!(escape in map)) throw jsonErrorAt(doc, pos - 1, `Invalid \\escape: ${pos - 1}`);
          out += map[escape];
          pos += 1;
        }
      } else if (char.charCodeAt(0) < 0x20) {
        throw jsonErrorAt(doc, pos, "Invalid control character at");
      } else {
        out += char;
        pos += 1;
      }
    }
  };
  const parseValue = () => {
    skipWs();
    if (pos >= doc.length) throw jsonErrorAt(doc, pos, "Expecting value");
    const char = doc[pos];
    if (char === '"') return parseString();
    if (char === "{") {
      pos += 1;
      const out = {};
      skipWs();
      if (doc[pos] === "}") {
        pos += 1;
        return out;
      }
      for (;;) {
        skipWs();
        if (doc[pos] !== '"') throw jsonErrorAt(doc, pos, "Expecting property name enclosed in double quotes");
        const key = parseString();
        skipWs();
        if (doc[pos] !== ":") throw jsonErrorAt(doc, pos, "Expecting ':' delimiter");
        pos += 1;
        out[key] = parseValue();
        skipWs();
        if (doc[pos] === ",") {
          pos += 1;
          continue;
        }
        if (doc[pos] === "}") {
          pos += 1;
          return out;
        }
        throw jsonErrorAt(doc, pos, "Expecting ',' delimiter");
      }
    }
    if (char === "[") {
      pos += 1;
      const out = [];
      skipWs();
      if (doc[pos] === "]") {
        pos += 1;
        return out;
      }
      for (;;) {
        out.push(parseValue());
        skipWs();
        if (doc[pos] === ",") {
          pos += 1;
          continue;
        }
        if (doc[pos] === "]") {
          pos += 1;
          return out;
        }
        throw jsonErrorAt(doc, pos, "Expecting ',' delimiter");
      }
    }
    if (doc.startsWith("true", pos)) {
      pos += 4;
      return true;
    }
    if (doc.startsWith("false", pos)) {
      pos += 5;
      return false;
    }
    if (doc.startsWith("null", pos)) {
      pos += 4;
      return null;
    }
    if (doc.startsWith("NaN", pos)) {
      pos += 3;
      return NaN;
    }
    if (doc.startsWith("Infinity", pos)) {
      pos += 8;
      return Infinity;
    }
    if (doc.startsWith("-Infinity", pos)) {
      pos += 9;
      return -Infinity;
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/.exec(doc.slice(pos));
    if (number) {
      pos += number[0].length;
      return Number(number[0]);
    }
    throw jsonErrorAt(doc, pos, "Expecting value");
  };
  const value = parseValue();
  skipWs();
  if (pos !== doc.length) throw jsonErrorAt(doc, pos, "Extra data");
  return value;
}

// OSError str() parity for the errno values these CLIs can realistically hit.
export function readTextPy(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    const messages = {
      ENOENT: `[Errno 2] No such file or directory: '${path}'`,
      EISDIR: `[Errno 21] Is a directory: '${path}'`,
      EACCES: `[Errno 13] Permission denied: '${path}'`,
      ENOTDIR: `[Errno 20] Not a directory: '${path}'`,
    };
    const wrapped = new Error(messages[error.code] || error.message);
    wrapped.pyOSError = true;
    throw wrapped;
  }
}

// PurePath-style normalization for CLI Path arguments (drops "." segments and
// duplicate slashes, mirroring str(Path(value))).
export function pathStr(value) {
  if (value === "") return ".";
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((part) => part !== "" && part !== ".");
  const body = parts.join("/");
  if (isAbsolute) return "/" + body;
  return body === "" ? "." : body;
}

// ---------------------------------------------------------------------------
// Validator.
// ---------------------------------------------------------------------------

export function issue(code, path, message) {
  return { code, path, message };
}

function parseDatetime(value, path, errors) {
  if (!strippedTruthy(value)) {
    errors.push(issue("DATETIME", path, "Expected a non-empty ISO-8601 datetime."));
    return null;
  }
  const parsed = parseIsoDateTime(value.replace(/Z/g, "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!parsed.hasTz) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed.micros;
}

function stringList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!strippedTruthy(item)) {
      errors.push(issue("STRING_LIST_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
      return;
    }
    result.push(item);
  });
  if (new Set(result).size !== result.length) {
    errors.push(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."));
  }
  return result;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }

  if (g(payload, "schema_version") !== "thesis-chart-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected thesis-chart-v1."));
  }
  if (!/^CHART_[A-Za-z0-9_:-]{8,}$/.test(pyStr(g(payload, "chart_id") || ""))) {
    errors.push(issue("CHART_ID", "$.chart_id", "Invalid chart ID."));
  }
  if (!pyIsInt(g(payload, "revision")) || pyNum(g(payload, "revision", 0)) < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }

  const state = g(payload, "state");
  if (!["draft", "conditional", "ready", "frozen"].includes(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }

  let lineage = g(payload, "lineage");
  if (!isDict(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
    lineage = {};
  }
  const refs = stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors);
  if (refs.length === 0) {
    errors.push(issue("INPUT_REF_REQUIRED", "$.lineage.input_artifact_refs", "At least one input artifact is required."));
  }
  for (const key of ["thesis_ref", "settlement_claim_ref"]) {
    const value = g(lineage, key);
    if (value !== null && !strippedTruthy(value)) {
      errors.push(issue("LINEAGE_REF", `$.lineage.${key}`, "Reference must be null or a non-empty string."));
    }
  }

  const role = g(payload, "role");
  if (!["evidence", "thesis", "settlement"].includes(role)) {
    errors.push(issue("ROLE", "$.role", "Unsupported chart role."));
  }

  let claim = g(payload, "claim");
  if (!isDict(claim)) {
    errors.push(issue("CLAIM", "$.claim", "Claim must be an object."));
    claim = {};
  }
  const evaluationKind = g(claim, "evaluation_kind");
  const direction = g(claim, "direction");
  const actionState = g(claim, "action_state");
  if (!["price_target", "directional_return", "relative_performance", "range", "event_occurrence"].includes(evaluationKind)) {
    errors.push(issue("EVALUATION_KIND", "$.claim.evaluation_kind", "Unsupported evaluation kind."));
  }
  if (!["long", "short", "outperform", "underperform", "range", "event_yes", "event_no", "neutral"].includes(direction)) {
    errors.push(issue("DIRECTION", "$.claim.direction", "Unsupported direction."));
  }
  if (!["enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"].includes(actionState)) {
    errors.push(issue("ACTION_STATE", "$.claim.action_state", "Unsupported action state."));
  }
  if (!strippedTruthy(g(claim, "statement"))) {
    errors.push(issue("CLAIM_STATEMENT", "$.claim.statement", "Claim statement is required."));
  }

  let time = g(payload, "time");
  if (!isDict(time)) {
    errors.push(issue("TIME", "$.time", "Time must be an object."));
    time = {};
  }
  const declared = parseDatetime(g(time, "declared_at"), "$.time.declared_at", errors);
  const horizonStatus = g(time, "horizon_status", "explicit");
  if (!["explicit", "unspecified"].includes(horizonStatus)) {
    errors.push(issue("HORIZON_STATUS", "$.time.horizon_status", "Horizon status must be explicit or unspecified."));
  }
  let horizonEnd = null;
  if (horizonStatus === "explicit") {
    horizonEnd = parseDatetime(g(time, "horizon_end"), "$.time.horizon_end", errors);
  } else if (g(time, "horizon_end") !== null) {
    errors.push(issue("UNSPECIFIED_HORIZON_END", "$.time.horizon_end", "An unspecified horizon must use null horizon_end."));
  }
  const contextStart = parseDatetime(g(time, "context_start"), "$.time.context_start", errors);
  if (declared !== null && horizonEnd !== null && horizonEnd <= declared) {
    errors.push(issue("HORIZON_ORDER", "$.time.horizon_end", "Horizon end must be after declaration."));
  }
  if (contextStart !== null && declared !== null && contextStart >= declared) {
    errors.push(issue("CONTEXT_ORDER", "$.time.context_start", "Context must begin before declaration."));
  }
  const horizonSeconds = g(time, "horizon_seconds");
  if (horizonStatus === "explicit") {
    if (!pyIsInt(horizonSeconds) || typeof horizonSeconds === "boolean" || horizonSeconds < 1) {
      errors.push(issue("HORIZON_SECONDS", "$.time.horizon_seconds", "Horizon seconds must be a positive integer."));
    } else if (declared !== null && horizonEnd !== null) {
      const expected = pyRound((horizonEnd - declared) / 1_000_000);
      if (Math.abs(horizonSeconds - expected) > 1) {
        errors.push(issue("HORIZON_SECONDS_MISMATCH", "$.time.horizon_seconds", `Expected ${expected} seconds from declared_at to horizon_end.`));
      }
    }
  } else if (horizonSeconds !== null) {
    errors.push(issue("UNSPECIFIED_HORIZON_SECONDS", "$.time.horizon_seconds", "An unspecified horizon must use null horizon_seconds."));
  }
  if (horizonStatus === "unspecified" && role === "settlement") {
    errors.push(issue("SETTLEMENT_HORIZON", "$.time.horizon_status", "Settlement charts require an explicit horizon."));
  }
  const intervalStatus = g(time, "interval_status");
  if (!["matched", "degraded", "unavailable"].includes(intervalStatus)) {
    errors.push(issue("INTERVAL_STATUS", "$.time.interval_status", "Unsupported interval status."));
  }
  for (const key of ["timezone", "preferred_interval"]) {
    if (!strippedTruthy(g(time, key))) {
      errors.push(issue("TIME_FIELD", `$.time.${key}`, `${key} is required.`));
    }
  }
  const observedInterval = g(time, "observed_interval");
  if (observedInterval !== null && !strippedTruthy(observedInterval)) {
    errors.push(issue("OBSERVED_INTERVAL", "$.time.observed_interval", "Observed interval must be null or a non-empty string."));
  }
  if (intervalStatus === "unavailable" && observedInterval !== null) {
    errors.push(issue("INTERVAL_UNAVAILABLE", "$.time.observed_interval", "Unavailable interval must not declare an observed interval."));
  }
  if (["matched", "degraded"].includes(intervalStatus) && observedInterval === null) {
    errors.push(issue("INTERVAL_REQUIRED", "$.time.observed_interval", "Observed interval is required when data is available."));
  }

  let series = g(payload, "series");
  if (!Array.isArray(series) || !(series.length >= 1 && series.length <= 3)) {
    errors.push(issue("SERIES", "$.series", "Expected one to three series."));
    series = [];
  }
  const seriesIds = new Set();
  const seriesRoles = { primary: [], benchmark: [], context: [] };
  const baselineTimes = [];
  const baselineBases = [];
  series.forEach((item, index) => {
    const path = `$.series[${index}]`;
    if (!isDict(item)) {
      errors.push(issue("SERIES_ITEM", path, "Series must be an object."));
      return;
    }
    const seriesId = g(item, "id");
    if (typeof seriesId !== "string" || !/^S[1-9][0-9]*$/.test(seriesId)) {
      errors.push(issue("SERIES_ID", `${path}.id`, "Series ID must use S<number>."));
    } else if (seriesIds.has(seriesId)) {
      errors.push(issue("SERIES_ID_UNIQUE", `${path}.id`, "Series IDs must be unique."));
    } else {
      seriesIds.add(seriesId);
    }
    const seriesRole = g(item, "role");
    if (!(seriesRole in seriesRoles)) {
      errors.push(issue("SERIES_ROLE", `${path}.role`, "Unsupported series role."));
    } else {
      seriesRoles[seriesRole].push(item);
    }
    for (const key of ["ticker", "display_name", "instrument_id"]) {
      if (!strippedTruthy(g(item, key))) {
        errors.push(issue("SERIES_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    if (!["raw_price", "return_from_baseline", "normalized_index", "excess_return"].includes(g(item, "transformation"))) {
      errors.push(issue("TRANSFORMATION", `${path}.transformation`, "Unsupported transformation."));
    }
    let provider = g(item, "provider");
    if (!isDict(provider)) {
      errors.push(issue("PROVIDER", `${path}.provider`, "Provider must be an object."));
      provider = {};
    }
    for (const key of ["name", "endpoint", "requested_interval"]) {
      if (!strippedTruthy(g(provider, key))) {
        errors.push(issue("PROVIDER_FIELD", `${path}.provider.${key}`, `${key} is required.`));
      }
    }
    if (pyStr(g(provider, "name") || "").toLowerCase() === "cuebook" && !pyIsInt(g(item, "asset_id"))) {
      errors.push(issue("CUEBOOK_ASSET_ID", `${path}.asset_id`, "Cuebook series requires a numeric asset ID."));
    }
    if (!["complete", "partial", "unavailable", "unknown"].includes(g(provider, "coverage_status"))) {
      errors.push(issue("COVERAGE_STATUS", `${path}.provider.coverage_status`, "Unsupported coverage status."));
    }
    parseDatetime(g(provider, "as_of"), `${path}.provider.as_of`, errors);
    const baseline = g(item, "baseline");
    if (!isDict(baseline)) {
      errors.push(issue("BASELINE", `${path}.baseline`, "Baseline must be an object."));
      return;
    }
    const value = g(baseline, "value");
    if (!pyIsNumber(value) || typeof value === "boolean" || value <= 0) {
      errors.push(issue("BASELINE_VALUE", `${path}.baseline.value`, "Baseline value must be positive."));
    }
    const baselineTime = parseDatetime(g(baseline, "observed_at"), `${path}.baseline.observed_at`, errors);
    if (baselineTime !== null) {
      baselineTimes.push(baselineTime);
      if (declared !== null && baselineTime > declared) {
        errors.push(issue("BASELINE_AFTER_DECLARATION", `${path}.baseline.observed_at`, "Baseline cannot be observed after declaration."));
      }
    }
    const basis = g(baseline, "observation_basis");
    baselineBases.push(pyStr(basis || ""));
    if (!strippedTruthy(g(baseline, "source_ref"))) {
      errors.push(issue("BASELINE_SOURCE", `${path}.baseline.source_ref`, "Baseline source is required."));
    }
  });

  if (seriesRoles.primary.length !== 1) {
    errors.push(issue("PRIMARY_SERIES", "$.series", "Exactly one primary series is required."));
  }

  let render = g(payload, "render");
  if (!isDict(render)) {
    errors.push(issue("RENDER", "$.render", "Render must be an object."));
    render = {};
  }
  const mode = g(render, "mode");
  const yAxis = g(render, "y_axis");
  const chartType = g(render, "chart_type");
  if (!["line", "candles"].includes(chartType)) {
    errors.push(issue("CHART_TYPE", "$.render.chart_type", "Unsupported chart type."));
  }
  if (g(render, "forecast_path") !== "none") {
    errors.push(issue("FORECAST_PATH", "$.render.forecast_path", "Forecast path must be none."));
  }
  for (const key of ["title", "subtitle", "success_label"]) {
    if (!strippedTruthy(g(render, key))) {
      errors.push(issue("RENDER_LABEL", `$.render.${key}`, `${key} is required.`));
    }
  }
  const theme = g(render, "theme", "cuebook_dark");
  if (!["cuebook_light", "cuebook_dark"].includes(theme)) {
    errors.push(issue("THEME", "$.render.theme", "Unsupported Cuebook chart theme."));
  }
  const styleProfile = g(render, "style_profile");
  if (styleProfile !== null && !["cuebook_feed_v1", "cuebook_detail_v1"].includes(styleProfile)) {
    errors.push(issue("STYLE_PROFILE", "$.render.style_profile", "Unsupported Cuebook chart style profile."));
  }
  const resolvedStyleProfile = styleProfile || (g(render, "show_settlement_panel") ? "cuebook_detail_v1" : "cuebook_feed_v1");
  const brand = g(render, "brand", "cuebook");
  if (brand !== "cuebook") {
    errors.push(issue("BRAND", "$.render.brand", "Cuebook charts must use the cuebook brand."));
  }
  for (const key of ["watermark", "show_settlement_panel", "show_state_label", "show_provenance_footer", "show_guide"]) {
    const value = g(render, key);
    if (value !== null && typeof value !== "boolean") {
      errors.push(issue("RENDER_BOOLEAN", `$.render.${key}`, `${key} must be boolean.`));
    }
  }
  const locale = g(render, "locale", "zh-CN");
  if (!["zh-CN", "en-US"].includes(locale)) {
    errors.push(issue("LOCALE", "$.render.locale", "Unsupported chart locale."));
  }
  const width = g(render, "width");
  const height = g(render, "height");
  if (!pyIsInt(width) || !(pyNum(width) >= 640 && pyNum(width) <= 2488)) {
    errors.push(issue("RENDER_WIDTH", "$.render.width", "Chart width must be an integer from 640 to 2488."));
  }
  if (!pyIsInt(height) || !(pyNum(height) >= 280 && pyNum(height) <= 1600)) {
    errors.push(issue("RENDER_HEIGHT", "$.render.height", "Chart height must be an integer from 280 to 1600."));
  }
  if (resolvedStyleProfile === "cuebook_feed_v1") {
    if (g(render, "show_settlement_panel") === true) {
      errors.push(issue("FEED_SETTLEMENT_PANEL", "$.render.show_settlement_panel", "Feed charts keep settlement prose outside the image."));
    }
    if (g(render, "show_state_label") === true) {
      errors.push(issue("FEED_STATE_LABEL", "$.render.show_state_label", "Feed charts must not expose internal artifact state."));
    }
    if (g(render, "show_provenance_footer") === true) {
      errors.push(issue("FEED_PROVENANCE", "$.render.show_provenance_footer", "Feed charts keep provenance in the artifact and detail view."));
    }
    if (g(render, "show_guide") === true) {
      errors.push(issue("FEED_GUIDE", "$.render.show_guide", "Feed charts must not show rendering instructions."));
    }
    if (g(render, "watermark", true) !== true) {
      errors.push(issue("FEED_WATERMARK", "$.render.watermark", "Cuebook Feed charts require the quiet brand watermark."));
    }
    if (styleProfile !== null) {
      const publicCopy = ["title", "subtitle"].map((key) => pyStr(g(render, key) || "")).join(" ");
      const internalPhrases = [
        "Cuebook \u4ece\u89c2\u70b9",
        "Cuebook\u63d0\u53d6",
        "\u4ece\u89c2\u70b9\u63cf\u8ff0\u4e2d\u63d0\u53d6",
        "Cuebook extracts",
        "SKILL",
        "CONDITIONAL",
        "DRAFT",
        "schema_version",
      ];
      for (const phrase of internalPhrases) {
        if (publicCopy.toLowerCase().includes(phrase.toLowerCase())) {
          errors.push(issue("FEED_INTERNAL_COPY", "$.render", `Feed copy exposes internal workflow language: ${phrase}.`));
        }
      }
    }
  }
  const timelineLayout = g(render, "timeline_layout", "continuous_time");
  if (!["continuous_time", "decision_split"].includes(timelineLayout)) {
    errors.push(issue("TIMELINE_LAYOUT", "$.render.timeline_layout", "Unsupported timeline layout."));
  }
  const splitRatio = g(render, "decision_split_ratio", 0.68);
  if (!pyIsNumber(splitRatio) || typeof splitRatio === "boolean" || !(splitRatio >= 0.45 && splitRatio <= 0.82)) {
    errors.push(issue("DECISION_SPLIT_RATIO", "$.render.decision_split_ratio", "Decision split ratio must be between 0.45 and 0.82."));
  }
  if (timelineLayout === "decision_split" && g(render, "future_region") !== true) {
    errors.push(issue("DECISION_SPLIT_FUTURE", "$.render.future_region", "Decision-split charts require a visible future region."));
  }
  if (horizonStatus === "unspecified" && g(render, "future_region") === true) {
    errors.push(issue("UNSPECIFIED_FUTURE_REGION", "$.render.future_region", "Open-ended trigger charts cannot shade an invented future region."));
  }
  if (horizonStatus === "unspecified" && timelineLayout !== "continuous_time") {
    errors.push(issue("UNSPECIFIED_TIMELINE", "$.render.timeline_layout", "Open-ended trigger charts require a continuous timeline."));
  }
  if (chartType === "candles") {
    if (yAxis !== "price") {
      errors.push(issue("CANDLE_AXIS", "$.render.y_axis", "Candlestick charts require a price axis."));
    }
    if (series.length !== 1 || seriesRoles.primary.length !== 1) {
      errors.push(issue("CANDLE_SERIES", "$.series", "Candlestick charts require exactly one primary series."));
    } else if (g(series[0], "transformation") !== "raw_price") {
      errors.push(issue("CANDLE_TRANSFORMATION", "$.series[0].transformation", "Candlestick charts require raw_price transformation."));
    }
  }
  if (g(render, "show_volume") === true) {
    if (series.length !== 1) {
      errors.push(issue("VOLUME_SERIES", "$.series", "Volume panels require exactly one market series."));
    }
    const volumeWindow = g(render, "volume_average_window", 20);
    if (!pyIsInt(volumeWindow) || typeof volumeWindow === "boolean" || !(volumeWindow >= 5 && volumeWindow <= 100)) {
      errors.push(issue("VOLUME_WINDOW", "$.render.volume_average_window", "Volume average window must be an integer from 5 to 100."));
    }
  }

  if (evaluationKind === "relative_performance") {
    if (mode !== "relative_performance") {
      errors.push(issue("RELATIVE_MODE", "$.render.mode", "Relative claims require relative_performance mode."));
    }
    if (!["outperform", "underperform"].includes(direction)) {
      errors.push(issue("RELATIVE_DIRECTION", "$.claim.direction", "Relative claims require outperform or underperform."));
    }
    if (seriesRoles.benchmark.length !== 1 || series.length !== 2) {
      errors.push(issue("RELATIVE_BENCHMARK", "$.series", "Relative charts require exactly one primary and one benchmark series."));
    }
    if (series.some((item) => isDict(item) && g(item, "transformation") !== "return_from_baseline")) {
      errors.push(issue("RELATIVE_TRANSFORMATION", "$.series", "Both relative chart legs must use return_from_baseline."));
    }
    if (yAxis !== "return_pct") {
      errors.push(issue("RELATIVE_AXIS", "$.render.y_axis", "Two-leg relative charts must use return_pct."));
    }
    if (baselineTimes.length === 2 && baselineTimes[0] !== baselineTimes[1]) {
      errors.push(issue("RELATIVE_BASELINE_TIME", "$.series", "Relative baselines must use the same timestamp."));
    }
    if (baselineBases.length === 2 && baselineBases[0] !== baselineBases[1]) {
      errors.push(issue("RELATIVE_BASELINE_BASIS", "$.series", "Relative baselines must use the same quote basis."));
    }
  } else if (evaluationKind === "range") {
    if (mode !== "range_band") {
      errors.push(issue("RANGE_MODE", "$.render.mode", "Range claims require range_band mode."));
    }
    if (yAxis !== "price") {
      errors.push(issue("RANGE_AXIS", "$.render.y_axis", "Range charts require a price axis."));
    }
  } else if (evaluationKind === "event_occurrence" && mode !== "event_reaction") {
    errors.push(issue("EVENT_MODE", "$.render.mode", "Price-backed event charts require event_reaction mode."));
  } else if (evaluationKind !== "event_occurrence" && mode === "relative_performance") {
    errors.push(issue("MODE_CLAIM_MISMATCH", "$.render.mode", "Relative mode requires a relative-performance claim."));
  }

  let annotations = g(payload, "annotations");
  if (!Array.isArray(annotations)) {
    errors.push(issue("ANNOTATIONS", "$.annotations", "Annotations must be an array."));
    annotations = [];
  }
  const annotationIds = new Set();
  const kinds = new Set();
  annotations.forEach((annotation, index) => {
    const path = `$.annotations[${index}]`;
    if (!isDict(annotation)) {
      errors.push(issue("ANNOTATION", path, "Annotation must be an object."));
      return;
    }
    const annotationId = g(annotation, "id");
    if (typeof annotationId !== "string" || !/^A[1-9][0-9]*$/.test(annotationId)) {
      errors.push(issue("ANNOTATION_ID", `${path}.id`, "Annotation ID must use A<number>."));
    } else if (annotationIds.has(annotationId)) {
      errors.push(issue("ANNOTATION_ID_UNIQUE", `${path}.id`, "Annotation IDs must be unique."));
    } else {
      annotationIds.add(annotationId);
    }
    const kind = g(annotation, "kind");
    kinds.add(pyStr(kind || ""));
    const seriesRef = g(annotation, "series_ref");
    if (seriesRef !== null && !seriesIds.has(seriesRef)) {
      errors.push(issue("ANNOTATION_SERIES_REF", `${path}.series_ref`, "Annotation references an unknown series."));
    }
    const value = g(annotation, "value");
    if (["target", "trigger", "invalidation", "range_lower", "range_upper"].includes(kind) && !pyIsNumber(value)) {
      errors.push(issue("ANNOTATION_VALUE", `${path}.value`, `${kind} annotation requires a numeric value.`));
    }
    const observedAt = g(annotation, "observed_at");
    if (["event", "declaration", "baseline", "expiry"].includes(kind) && observedAt === null) {
      errors.push(issue("ANNOTATION_TIME", `${path}.observed_at`, `${kind} annotation requires a timestamp.`));
    }
    if (observedAt !== null) {
      parseDatetime(observedAt, `${path}.observed_at`, errors);
    }
    if (!strippedTruthy(g(annotation, "label"))) {
      errors.push(issue("ANNOTATION_LABEL", `${path}.label`, "Annotation label is required."));
    }
    if (!["explicit", "derived"].includes(g(annotation, "provenance"))) {
      errors.push(issue("ANNOTATION_PROVENANCE", `${path}.provenance`, "Unsupported annotation provenance."));
    }
    if (!strippedTruthy(g(annotation, "source_ref"))) {
      errors.push(issue("ANNOTATION_SOURCE", `${path}.source_ref`, "Annotation source is required."));
    }
  });

  if (horizonStatus === "explicit" && !kinds.has("expiry")) {
    errors.push(issue("EXPIRY_ANNOTATION", "$.annotations", "Every thesis chart requires an expiry annotation."));
  }
  if (horizonStatus === "unspecified" && kinds.has("expiry")) {
    errors.push(issue("UNSPECIFIED_EXPIRY", "$.annotations", "Open-ended trigger charts must not invent an expiry annotation."));
  }
  if (g(render, "timeline_layout", "continuous_time") === "decision_split" && !kinds.has("declaration")) {
    errors.push(issue("DECLARATION_ANNOTATION", "$.annotations", "Decision-split charts require a declaration annotation."));
  }
  if (actionState === "wait_for_trigger" && !kinds.has("trigger") && !kinds.has("event")) {
    errors.push(issue("TRIGGER_ANNOTATION", "$.annotations", "A wait-for-trigger chart must show its price or event trigger."));
  }
  if (evaluationKind === "range" && !(kinds.has("range_lower") && kinds.has("range_upper"))) {
    errors.push(issue("RANGE_ANNOTATIONS", "$.annotations", "Range charts require lower and upper annotations."));
  }
  if (resolvedStyleProfile === "cuebook_feed_v1" && annotations.length > 4) {
    warnings.push(issue("FEED_ANNOTATION_DENSITY", "$.annotations", "Feed charts should keep at most four visible annotations; demote the rest to detail metadata."));
  }
  if (resolvedStyleProfile === "cuebook_feed_v1" && [...pyStr(g(render, "title") || "")].length > 48) {
    warnings.push(issue("FEED_TITLE_DENSITY", "$.render.title", "Feed title may exceed two compact lines; shorten it before release."));
  }

  let quality = g(payload, "quality_report");
  if (!isDict(quality)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    quality = {};
  }
  const decision = g(quality, "decision");
  const qualityWarnings = stringList(g(quality, "warnings"), "$.quality_report.warnings", errors);
  const hardFailures = stringList(g(quality, "hard_failures"), "$.quality_report.hard_failures", errors);
  if (hardFailures.length > 0 && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."));
  }
  if (decision === "blocked" && hardFailures.length === 0) {
    errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked decision requires a hard failure."));
  }
  if (state === "conditional" && decision !== "conditional") {
    errors.push(issue("CONDITIONAL_DECISION", "$.quality_report.decision", "Conditional state requires conditional decision."));
  }
  if (["ready", "frozen"].includes(state)) {
    if (decision !== "ready") {
      errors.push(issue("READY_DECISION", "$.quality_report.decision", "Ready or frozen state requires ready decision."));
    }
    if (intervalStatus !== "matched") {
      errors.push(issue("READY_INTERVAL", "$.time.interval_status", "Ready or frozen chart requires matched interval."));
    }
    if (qualityWarnings.length > 0 || hardFailures.length > 0) {
      errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen chart cannot carry warnings or hard failures."));
    }
  }
  if (intervalStatus === "degraded" && decision === "ready") {
    errors.push(issue("DEGRADED_READY", "$.quality_report.decision", "Degraded interval cannot be ready."));
  }
  if (intervalStatus === "degraded" && qualityWarnings.length === 0) {
    errors.push(issue("DEGRADED_WARNING", "$.quality_report.warnings", "Degraded interval requires an explicit warning."));
  }
  if (decision === "conditional" && qualityWarnings.length === 0) {
    errors.push(issue("CONDITIONAL_WARNING", "$.quality_report.warnings", "Conditional charts require an explicit warning."));
  }

  if (intervalStatus === "degraded") {
    warnings.push(issue("DEGRADED_INTERVAL", "$.time", "Chart can orient the reader but cannot claim confirmation at the preferred interval."));
  }
  if (series.some((item) => isDict(item) && g(isDict(g(item, "provider")) ? g(item, "provider") : {}, "coverage_status") === "partial")) {
    warnings.push(issue("PARTIAL_COVERAGE", "$.series", "Provider reported partial coverage; verify baseline and required observation are present."));
  }

  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  const prog = basename(process.argv[1] || "validate_thesis_chart.mjs");
  const positional = [];
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`usage: ${prog} [-h] path\n`);
      return 0;
    }
    if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: unrecognized arguments: ${arg}\n`);
      return 2;
    }
    positional.push(arg);
  }
  if (positional.length < 1) {
    process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: the following arguments are required: path\n`);
    return 2;
  }
  if (positional.length > 1) {
    process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: unrecognized arguments: ${positional.slice(1).join(" ")}\n`);
    return 2;
  }
  const path = pathStr(positional[0]);
  let payload;
  try {
    payload = pyJsonLoads(readTextPy(path));
  } catch (error) {
    const result = { valid: false, errors: [issue("READ", "$", error.message)], warnings: [] };
    process.stdout.write(ensureAscii(pyJsonDumps(result, 2)) + "\n");
    return 1;
  }
  const result = validate(payload);
  process.stdout.write(pyJsonDumps(result, 2) + "\n");
  return result.valid ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
