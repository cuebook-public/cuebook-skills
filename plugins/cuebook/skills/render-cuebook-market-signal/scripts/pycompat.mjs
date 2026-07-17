// Python-compatibility helpers for the ported Cuebook validator/renderer
// scripts. Every helper reproduces the exact CPython behavior the Python
// originals relied on (float formatting, JSON error messages, datetime
// parsing, unicode width and whitespace, path normalization); output is
// contract and must stay byte-compatible with the Python originals.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Python whitespace (str.isspace / re \s for str patterns).

const PY_WS_CLASS =
  " \\t\\n\\r\\v\\f\\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_WS_RUN = new RegExp(`[${PY_WS_CLASS}]+`, "gu");
const PY_WS_LEAD = new RegExp(`^[${PY_WS_CLASS}]+`, "u");
const PY_WS_TRAIL = new RegExp(`[${PY_WS_CLASS}]+$`, "u");

export function pyStrip(value) {
  return value.replace(PY_WS_LEAD, "").replace(PY_WS_TRAIL, "");
}

export function pyLstrip(value) {
  return value.replace(PY_WS_LEAD, "");
}

export function pyRstrip(value) {
  return value.replace(PY_WS_TRAIL, "");
}

// re.sub(r"\s+", " ", text) with Python str \s semantics.
export function collapseWhitespace(value) {
  return value.replace(PY_WS_RUN, " ");
}

export const PY_WS_CLASS_SOURCE = PY_WS_CLASS;

// ---------------------------------------------------------------------------
// Code-point helpers (Python str indexes by code point, not UTF-16 unit).

export function pyLen(value) {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

export function pyChars(value) {
  return Array.from(value);
}

// ---------------------------------------------------------------------------
// unicodedata.east_asian_width membership in {"W", "F", "A"} (Unicode 16.0,
// generated from CPython 3.14 unicodedata).

const EAW_WIDE_DATA =
  "a1-a1,a4-a4,a7-a8,aa-aa,ad-ae,b0-b4,b6-ba,bc-bf,c6-c6,d0-d0,d7-d8,de-e1,e6-e6,e8-ea,ec-ed,f0-f0," +
  "f2-f3,f7-fa,fc-fc,fe-fe,101-101,111-111,113-113,11b-11b,126-127,12b-12b,131-133,138-138,13f-142," +
  "144-144,148-14b,14d-14d,152-153,166-167,16b-16b,1ce-1ce,1d0-1d0,1d2-1d2,1d4-1d4,1d6-1d6,1d8-1d8," +
  "1da-1da,1dc-1dc,251-251,261-261,2c4-2c4,2c7-2c7,2c9-2cb,2cd-2cd,2d0-2d0,2d8-2db,2dd-2dd,2df-2df," +
  "300-36f,391-3a1,3a3-3a9,3b1-3c1,3c3-3c9,401-401,410-44f,451-451,1100-115f,2010-2010,2013-2016," +
  "2018-2019,201c-201d,2020-2022,2024-2027,2030-2030,2032-2033,2035-2035,203b-203b,203e-203e,2074-2074," +
  "207f-207f,2081-2084,20ac-20ac,2103-2103,2105-2105,2109-2109,2113-2113,2116-2116,2121-2122,2126-2126," +
  "212b-212b,2153-2154,215b-215e,2160-216b,2170-2179,2189-2189,2190-2199,21b8-21b9,21d2-21d2,21d4-21d4," +
  "21e7-21e7,2200-2200,2202-2203,2207-2208,220b-220b,220f-220f,2211-2211,2215-2215,221a-221a,221d-2220," +
  "2223-2223,2225-2225,2227-222c,222e-222e,2234-2237,223c-223d,2248-2248,224c-224c,2252-2252,2260-2261," +
  "2264-2267,226a-226b,226e-226f,2282-2283,2286-2287,2295-2295,2299-2299,22a5-22a5,22bf-22bf,2312-2312," +
  "231a-231b,2329-232a,23e9-23ec,23f0-23f0,23f3-23f3,2460-24e9,24eb-254b,2550-2573,2580-258f,2592-2595," +
  "25a0-25a1,25a3-25a9,25b2-25b3,25b6-25b7,25bc-25bd,25c0-25c1,25c6-25c8,25cb-25cb,25ce-25d1,25e2-25e5," +
  "25ef-25ef,25fd-25fe,2605-2606,2609-2609,260e-260f,2614-2615,261c-261c,261e-261e,2630-2637,2640-2640," +
  "2642-2642,2648-2653,2660-2661,2663-2665,2667-266a,266c-266d,266f-266f,267f-267f,268a-268f,2693-2693," +
  "269e-269f,26a1-26a1,26aa-26ab,26bd-26bf,26c4-26e1,26e3-26e3,26e8-26ff,2705-2705,270a-270b,2728-2728," +
  "273d-273d,274c-274c,274e-274e,2753-2755,2757-2757,2776-277f,2795-2797,27b0-27b0,27bf-27bf,2b1b-2b1c," +
  "2b50-2b50,2b55-2b59,2e80-2e99,2e9b-2ef3,2f00-2fd5,2ff0-303e,3041-3096,3099-30ff,3105-312f,3131-318e," +
  "3190-31e5,31ef-321e,3220-a48c,a490-a4c6,a960-a97c,ac00-d7a3,e000-faff,fe00-fe19,fe30-fe52,fe54-fe66," +
  "fe68-fe6b,ff01-ff60,ffe0-ffe6,fffd-fffd,16fe0-16fe4,16ff0-16ff1,17000-187f7,18800-18cd5,18cff-18d08," +
  "1aff0-1aff3,1aff5-1affb,1affd-1affe,1b000-1b122,1b132-1b132,1b150-1b152,1b155-1b155,1b164-1b167," +
  "1b170-1b2fb,1d300-1d356,1d360-1d376,1f004-1f004,1f0cf-1f0cf,1f100-1f10a,1f110-1f12d,1f130-1f169," +
  "1f170-1f1ac,1f200-1f202,1f210-1f23b,1f240-1f248,1f250-1f251,1f260-1f265,1f300-1f320,1f32d-1f335," +
  "1f337-1f37c,1f37e-1f393,1f3a0-1f3ca,1f3cf-1f3d3,1f3e0-1f3f0,1f3f4-1f3f4,1f3f8-1f43e,1f440-1f440," +
  "1f442-1f4fc,1f4ff-1f53d,1f54b-1f54e,1f550-1f567,1f57a-1f57a,1f595-1f596,1f5a4-1f5a4,1f5fb-1f64f," +
  "1f680-1f6c5,1f6cc-1f6cc,1f6d0-1f6d2,1f6d5-1f6d7,1f6dc-1f6df,1f6eb-1f6ec,1f6f4-1f6fc,1f7e0-1f7eb," +
  "1f7f0-1f7f0,1f90c-1f93a,1f93c-1f945,1f947-1f9ff,1fa70-1fa7c,1fa80-1fa89,1fa8f-1fac6,1face-1fadc," +
  "1fadf-1fae9,1faf0-1faf8,20000-2fffd,30000-3fffd,e0100-e01ef,f0000-ffffd,100000-10fffd";

const EAW_WIDE_RANGES = EAW_WIDE_DATA.split(",").map((pair) => {
  const [start, end] = pair.split("-");
  return [parseInt(start, 16), parseInt(end, 16)];
});

export function isWideChar(char) {
  const code = char.codePointAt(0);
  let low = 0;
  let high = EAW_WIDE_RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end] = EAW_WIDE_RANGES[mid];
    if (code < start) high = mid - 1;
    else if (code > end) low = mid + 1;
    else return true;
  }
  return false;
}

// sum(2 if unicodedata.east_asian_width(c) in {"W","F","A"} else 1 for c in text)
export function displayWidth(text) {
  let total = 0;
  for (const char of text) total += isWideChar(char) ? 2 : 1;
  return total;
}

// ---------------------------------------------------------------------------
// html.escape(str(value), quote=True)

export function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

// ---------------------------------------------------------------------------
// Python repr() for the JSON value types interpolated into messages.

export function pyrepr(value) {
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
  if (typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`);
    return `{${parts.join(", ")}}`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// CPython float formatting: format(x, ".<d>f") rounds the exact binary value
// half-to-even; the "," option groups the integer part in threes; the "+"
// option always emits a sign. The sign of a negative value that rounds to
// zero is preserved ("-0.0"), exactly like CPython.

function exactFraction(absValue) {
  // Decompose a finite double into an exact BigInt fraction num/den.
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, absValue);
  const bits = buffer.getBigUint64(0);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let exponent;
  if (exponentBits === 0) {
    exponent = -1074;
  } else {
    mantissa |= 0x10000000000000n;
    exponent = exponentBits - 1075;
  }
  if (exponent >= 0) return { num: mantissa << BigInt(exponent), den: 1n };
  return { num: mantissa, den: 1n << BigInt(-exponent) };
}

function roundHalfEvenScaled(absValue, digits) {
  // Return round_half_even(absValue * 10**digits) as a BigInt.
  const { num, den } = exactFraction(absValue);
  const scaled = num * 10n ** BigInt(digits);
  const quotient = scaled / den;
  const remainder = scaled % den;
  const doubled = remainder * 2n;
  if (doubled > den || (doubled === den && (quotient & 1n) === 1n)) return quotient + 1n;
  return quotient;
}

function groupThousands(digits) {
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ",";
    out += digits[index];
  }
  return out;
}

export function pyFloatFixed(value, digits, { sign = false, grouping = false } = {}) {
  if (Number.isNaN(value)) return "nan";
  if (value === Infinity) return sign ? "+inf" : "inf";
  if (value === -Infinity) return "-inf";
  const negative = value < 0 || Object.is(value, -0);
  const scaled = roundHalfEvenScaled(Math.abs(value), digits);
  let text = scaled.toString().padStart(digits + 1, "0");
  let integerPart = digits ? text.slice(0, -digits) : text;
  const fractionPart = digits ? text.slice(-digits) : "";
  if (grouping) integerPart = groupThousands(integerPart);
  const prefix = negative ? "-" : sign ? "+" : "";
  return prefix + integerPart + (digits ? `.${fractionPart}` : "");
}

// Python round(x) -> nearest int, ties to even.
export function pyRound(value) {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// datetime.fromisoformat (the subset of CPython 3.11+ syntax these artifacts
// use: extended or basic dates, "T" or single-character separators, optional
// seconds and 1..6+ fractional digits, offsets Z / +-HH / +-HHMM / +-HH:MM /
// +-HH:MM:SS). Returns null when CPython would raise ValueError.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_BASIC_RE = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_TIME_RE = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/;
const ISO_TIME_BASIC_RE = /^(\d{2})(\d{2})(?:(\d{2})(?:[.,](\d+))?)?$/;
const ISO_OFFSET_RE = /^([+-])(\d{2})(?::?(\d{2}))?(?::(\d{2})(?:[.,]\d{1,6})?)?$/;

export function pyFromIsoformat(value) {
  if (typeof value !== "string") return null;
  const chars = pyChars(value);
  if (chars.length < 8) return null;
  const dateText = chars.slice(0, chars.length >= 10 && value[7] === "-" ? 10 : 8).join("");
  let dateMatch = ISO_DATE_RE.exec(dateText);
  if (!dateMatch) dateMatch = ISO_DATE_BASIC_RE.exec(dateText);
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  let hour = 0;
  let minute = 0;
  let second = 0;
  let microsecond = 0;
  let offsetSeconds = null;
  const rest = chars.slice(dateText.length).join("");
  if (rest.length > 0) {
    // Any single-character separator is accepted, exactly like CPython.
    const timePart = pyChars(rest).slice(1).join("");
    if (!timePart) return null;
    let timeText = timePart;
    let offsetText = null;
    const zIndex = timePart.search(/[Zz+]|-(?!$)/);
    // Split the offset: "Z", or the first "+"/"-" after the clock digits.
    const offsetStart = timePart.search(/[Zz]|[+-]/);
    if (offsetStart !== -1) {
      timeText = timePart.slice(0, offsetStart);
      offsetText = timePart.slice(offsetStart);
    }
    void zIndex;
    let timeMatch = ISO_TIME_RE.exec(timeText);
    if (!timeMatch && !timeText.includes(":")) timeMatch = ISO_TIME_BASIC_RE.exec(timeText);
    if (!timeMatch) return null;
    hour = Number(timeMatch[1]);
    minute = timeMatch[2] === undefined ? 0 : Number(timeMatch[2]);
    second = timeMatch[3] === undefined ? 0 : Number(timeMatch[3]);
    if (timeMatch[4] !== undefined) {
      microsecond = Number(timeMatch[4].slice(0, 6).padEnd(6, "0"));
    }
    if (hour > 23 || minute > 59 || second > 59) return null;
    if (offsetText !== null) {
      if (offsetText === "Z" || offsetText === "z") {
        offsetSeconds = 0;
      } else {
        const offsetMatch = ISO_OFFSET_RE.exec(offsetText);
        if (!offsetMatch) return null;
        const offsetHour = Number(offsetMatch[2]);
        const offsetMinute = offsetMatch[3] === undefined ? 0 : Number(offsetMatch[3]);
        const offsetSecond = offsetMatch[4] === undefined ? 0 : Number(offsetMatch[4]);
        if (offsetHour > 23 || offsetMinute > 59 || offsetSecond > 59) return null;
        const magnitude = offsetHour * 3600 + offsetMinute * 60 + offsetSecond;
        offsetSeconds = offsetMatch[1] === "-" ? -magnitude : magnitude;
      }
    }
  }
  const naiveEpoch = Date.UTC(year, month - 1, day, hour, minute, second) / 1000 + microsecond / 1e6;
  return {
    aware: offsetSeconds !== null,
    epoch: naiveEpoch - (offsetSeconds ?? 0),
    year,
    month,
    day,
    hour,
    minute,
    second,
    microsecond,
    offsetSeconds,
  };
}

// UTC calendar components for an epoch expressed in seconds.
export function utcParts(epochSeconds) {
  const date = new Date(Math.floor(epochSeconds) * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

// datetime.now(timezone.utc).isoformat()
export function pyNowUtcIsoformat() {
  const now = Date.now();
  const parts = utcParts(now / 1000);
  const microsecond = (now % 1000) * 1000;
  const base =
    `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}` +
    `T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
  const fraction = microsecond ? `.${String(microsecond).padStart(6, "0")}` : "";
  return `${base}${fraction}+00:00`;
}

// ---------------------------------------------------------------------------
// PurePosixPath string semantics: str(Path(p)) normalization and joining.

export function pyPathStr(path) {
  if (path === "") return ".";
  const isAbsolute = path.startsWith("/");
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  let root = "";
  if (isAbsolute) {
    root = path.startsWith("//") && !path.startsWith("///") ? "//" : "/";
  }
  const joined = root + parts.join("/");
  return joined === "" ? "." : joined;
}

export function pyPathJoin(base, child) {
  if (child.startsWith("/")) return pyPathStr(child);
  const left = pyPathStr(base);
  if (left === ".") return pyPathStr(child);
  return pyPathStr(`${left}/${child}`);
}

export function pyPathParent(path) {
  const text = pyPathStr(path);
  const index = text.lastIndexOf("/");
  if (index === -1) return ".";
  if (index === 0) return "/";
  return text.slice(0, index);
}

export function pyPathIsAbsolute(path) {
  return path.startsWith("/");
}

// ---------------------------------------------------------------------------
// OSError with CPython message formatting.

export class PyOSError extends Error {}

const ERRNO_MESSAGES = {
  ENOENT: [2, "No such file or directory"],
  EACCES: [13, "Permission denied"],
  ENOTDIR: [20, "Not a directory"],
  EISDIR: [21, "Is a directory"],
};

function toPyOSError(error, path) {
  const mapped = ERRNO_MESSAGES[error.code];
  if (mapped) {
    return new PyOSError(`[Errno ${mapped[0]}] ${mapped[1]}: ${pyrepr(pyPathStr(path))}`);
  }
  return new PyOSError(String(error.message || error));
}

export function pyReadText(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    throw toPyOSError(error, path);
  }
}

export function pyReadBytes(path) {
  try {
    return readFileSync(path);
  } catch (error) {
    throw toPyOSError(error, path);
  }
}

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// RuntimeError marker so CLI entry points only catch what Python caught.

export class PyRuntimeError extends Error {}

// ---------------------------------------------------------------------------
// json.loads with CPython 3.14 JSONDecodeError messages. The scanner below is
// a direct port of CPython's json/decoder.py + json/scanner.py; positions in
// messages are code-point indices, exactly like Python str indexing.

export class PyJSONDecodeError extends Error {
  constructor(msg, doc, pos) {
    const prefix = doc.slice(0, pos);
    let newlines = 0;
    for (let index = 0; index < pos; index += 1) if (prefix[index] === "\n") newlines += 1;
    let lastNewline = -1;
    for (let index = pos - 1; index >= 0; index -= 1) {
      if (prefix[index] === "\n") {
        lastNewline = index;
        break;
      }
    }
    const lineno = newlines + 1;
    const colno = pos - lastNewline;
    super(`${msg}: line ${lineno} column ${colno} (char ${pos})`);
    this.msg = msg;
    this.pos = pos;
    this.lineno = lineno;
    this.colno = colno;
  }
}

const JSON_WS = new Set([" ", "\t", "\n", "\r"]);
const JSON_BACKSLASH = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
const JSON_NUMBER_RE = /^(-?(?:0|[1-9][0-9]*))(\.[0-9]+)?([eE][-+]?[0-9]+)?/;

function skipJsonWhitespace(chars, index) {
  while (index < chars.length && JSON_WS.has(chars[index])) index += 1;
  return index;
}

function scanJsonString(chars, end) {
  const begin = end - 1;
  const chunks = [];
  while (true) {
    let terminatorIndex = -1;
    for (let index = end; index < chars.length; index += 1) {
      const char = chars[index];
      if (char === '"' || char === "\\" || char.codePointAt(0) < 0x20) {
        terminatorIndex = index;
        break;
      }
    }
    if (terminatorIndex === -1) {
      throw new PyJSONDecodeError("Unterminated string starting at", chars, begin);
    }
    if (terminatorIndex > end) chunks.push(chars.slice(end, terminatorIndex).join(""));
    const terminator = chars[terminatorIndex];
    end = terminatorIndex + 1;
    if (terminator === '"') break;
    if (terminator !== "\\") {
      throw new PyJSONDecodeError(`Invalid control character ${pyrepr(terminator)} at`, chars, end - 1);
    }
    if (end >= chars.length) {
      throw new PyJSONDecodeError("Unterminated string starting at", chars, begin);
    }
    const escape = chars[end];
    if (escape !== "u") {
      const mapped = JSON_BACKSLASH[escape];
      if (mapped === undefined) {
        throw new PyJSONDecodeError(`Invalid \\escape: ${pyrepr(escape)}`, chars, end);
      }
      chunks.push(mapped);
      end += 1;
    } else {
      const decodeHex = (position) => {
        const hex = chars.slice(position + 1, position + 5).join("");
        if (hex.length === 4 && /^[0-9A-Fa-f]{4}$/.test(hex)) return parseInt(hex, 16);
        throw new PyJSONDecodeError("Invalid \\uXXXX escape", chars, position);
      };
      let code = decodeHex(end);
      end += 5;
      if (code >= 0xd800 && code <= 0xdbff && chars.slice(end, end + 2).join("") === "\\u") {
        const low = decodeHex(end + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + (((code - 0xd800) << 10) | (low - 0xdc00));
          end += 6;
        }
      }
      chunks.push(String.fromCodePoint(code));
    }
  }
  return [chunks.join(""), end];
}

function scanJsonOnce(chars, index) {
  if (index >= chars.length) {
    throw new PyJSONDecodeError("Expecting value", chars, index);
  }
  const nextchar = chars[index];
  if (nextchar === '"') return scanJsonString(chars, index + 1);
  if (nextchar === "{") return scanJsonObject(chars, index + 1);
  if (nextchar === "[") return scanJsonArray(chars, index + 1);
  if (nextchar === "n" && chars.slice(index, index + 4).join("") === "null") return [null, index + 4];
  if (nextchar === "t" && chars.slice(index, index + 4).join("") === "true") return [true, index + 4];
  if (nextchar === "f" && chars.slice(index, index + 5).join("") === "false") return [false, index + 5];
  const tail = chars.slice(index, index + 64).join("");
  const numberMatch = JSON_NUMBER_RE.exec(tail);
  if (numberMatch) {
    return [Number(numberMatch[0]), index + numberMatch[0].length];
  }
  if (nextchar === "N" && chars.slice(index, index + 3).join("") === "NaN") return [NaN, index + 3];
  if (nextchar === "I" && chars.slice(index, index + 8).join("") === "Infinity") return [Infinity, index + 8];
  if (nextchar === "-" && chars.slice(index, index + 9).join("") === "-Infinity") return [-Infinity, index + 9];
  throw new PyJSONDecodeError("Expecting value", chars, index);
}

function scanJsonObject(chars, end) {
  const pairs = {};
  let nextchar = chars[end] ?? "";
  if (nextchar !== '"') {
    if (JSON_WS.has(nextchar)) {
      end = skipJsonWhitespace(chars, end);
      nextchar = chars[end] ?? "";
    }
    if (nextchar === "}") return [pairs, end + 1];
    if (nextchar !== '"') {
      throw new PyJSONDecodeError("Expecting property name enclosed in double quotes", chars, end);
    }
  }
  end += 1;
  while (true) {
    let key;
    [key, end] = scanJsonString(chars, end);
    if ((chars[end] ?? "") !== ":") {
      end = skipJsonWhitespace(chars, end);
      if ((chars[end] ?? "") !== ":") {
        throw new PyJSONDecodeError("Expecting ':' delimiter", chars, end);
      }
    }
    end += 1;
    end = skipJsonWhitespace(chars, end);
    let value;
    [value, end] = scanJsonOnce(chars, end);
    pairs[key] = value;
    nextchar = chars[end] ?? "";
    if (JSON_WS.has(nextchar)) {
      end = skipJsonWhitespace(chars, end + 1);
      nextchar = chars[end] ?? "";
    }
    end += 1;
    if (nextchar === "}") break;
    if (nextchar !== ",") {
      throw new PyJSONDecodeError("Expecting ',' delimiter", chars, end - 1);
    }
    const commaIndex = end - 1;
    end = skipJsonWhitespace(chars, end);
    nextchar = chars[end] ?? "";
    end += 1;
    if (nextchar !== '"') {
      if (nextchar === "}") {
        throw new PyJSONDecodeError("Illegal trailing comma before end of object", chars, commaIndex);
      }
      throw new PyJSONDecodeError("Expecting property name enclosed in double quotes", chars, end - 1);
    }
  }
  return [pairs, end];
}

function scanJsonArray(chars, end) {
  const values = [];
  let nextchar = chars[end] ?? "";
  if (JSON_WS.has(nextchar)) {
    end = skipJsonWhitespace(chars, end + 1);
    nextchar = chars[end] ?? "";
  }
  if (nextchar === "]") return [values, end + 1];
  while (true) {
    let value;
    [value, end] = scanJsonOnce(chars, end);
    values.push(value);
    nextchar = chars[end] ?? "";
    if (JSON_WS.has(nextchar)) {
      end = skipJsonWhitespace(chars, end + 1);
      nextchar = chars[end] ?? "";
    }
    end += 1;
    if (nextchar === "]") break;
    if (nextchar !== ",") {
      throw new PyJSONDecodeError("Expecting ',' delimiter", chars, end - 1);
    }
    const commaIndex = end - 1;
    if (end < chars.length && JSON_WS.has(chars[end])) {
      end = skipJsonWhitespace(chars, end + 1);
    }
    nextchar = chars[end] ?? "";
    if (nextchar === "]") {
      throw new PyJSONDecodeError("Illegal trailing comma before end of array", chars, commaIndex);
    }
  }
  return [values, end];
}

export function pyJsonLoads(text) {
  const chars = pyChars(text);
  let index = skipJsonWhitespace(chars, 0);
  const [value, end] = scanJsonOnce(chars, index);
  index = skipJsonWhitespace(chars, end);
  if (index !== chars.length) {
    throw new PyJSONDecodeError("Extra data", chars, index);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Stable sorted() with Python comparison semantics for numbers, strings
// (code-point order), and arrays (tuples).

export function pyCompare(a, b) {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "string" && typeof b === "string") {
    const charsA = pyChars(a);
    const charsB = pyChars(b);
    const shared = Math.min(charsA.length, charsB.length);
    for (let index = 0; index < shared; index += 1) {
      const codeA = charsA[index].codePointAt(0);
      const codeB = charsB[index].codePointAt(0);
      if (codeA !== codeB) return codeA < codeB ? -1 : 1;
    }
    return charsA.length - charsB.length;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const shared = Math.min(a.length, b.length);
    for (let index = 0; index < shared; index += 1) {
      const result = pyCompare(a[index], b[index]);
      if (result !== 0) return result;
    }
    return a.length - b.length;
  }
  throw new TypeError("Unsupported comparison");
}

export function pySorted(iterable, keyFn = (item) => item) {
  return Array.from(iterable)
    .map((item, index) => [item, index])
    .sort((left, right) => {
      const result = pyCompare(keyFn(left[0]), keyFn(right[0]));
      return result !== 0 ? result : left[1] - right[1];
    })
    .map(([item]) => item);
}

