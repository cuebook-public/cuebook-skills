#!/usr/bin/env node
// Normalize public or authorized media records into MediaCorpusV1.
//
// Port of normalize_media_corpus.py; output (including the pinned normalizer
// name "normalize_media_corpus.py") is contract and must stay byte-compatible
// with the Python original.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { pyrepr } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA_VERSION = "media-corpus.v1";
const NORMALIZER_VERSION = "1.0.0";
const FORMATS = new Set([
  "long_form_article",
  "community_post",
  "community_comment",
  "image_note",
  "short_video",
  "long_video",
  "podcast",
  "other",
]);
const ROLES = new Set([
  "title",
  "dek",
  "thesis",
  "evidence",
  "analysis",
  "valuation",
  "risk",
  "invalidation",
  "conclusion",
  "cover",
  "card",
  "caption",
  "body",
  "question",
  "reply",
  "edit",
  "hook",
  "voiceover",
  "on_screen_text",
  "shot",
  "cta",
  "disclosure",
  "source_list",
  "other",
]);
const ASSET_TYPES = new Set(["image", "video", "audio", "chart", "screenshot", "document", "other"]);
const RIGHTS = new Set(["owned", "licensed", "public-domain", "permission", "unknown", "not-reusable"]);
const SAMPLE_ROLES = new Set(["baseline", "recent", "high_attention", "other", "unknown"]);
const AUTHOR_ROLES = new Set(["author", "community", "moderator", "unknown"]);
const QUALIFICATIONS = new Set(["verified", "declared", "unknown", "not_applicable"]);
const CONTENT_CLASSES = new Set(["market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice", "unknown"]);
const RELATIONSHIPS = new Set(["disclosed", "none", "unknown"]);
const PRESENCE = new Set(["present", "absent", "unknown", "not_applicable"]);
const METRIC_NAMES = ["likes", "comments", "replies", "shares", "bookmarks", "views", "upvotes", "downvotes"];

// Python str whitespace (str.strip / str.split defaults); differs from JS \s.
const PY_WS = "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "g");
const PY_RSTRIP_RE = new RegExp(`[${PY_WS}]+$`);
const PY_SPLIT_RE = new RegExp(`[${PY_WS}]+`);

function pyStrip(text) {
  return text.replace(PY_STRIP_RE, "");
}

// Marker for values that are Python floats: json.dumps renders them with a
// trailing ".0" (repr), which JSON.stringify cannot reproduce.
class PyFloat {
  constructor(value) {
    this.value = value;
  }
}

function pyFloatRepr(x) {
  if (Number.isNaN(x)) return "NaN";
  if (x === Infinity) return "Infinity";
  if (x === -Infinity) return "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(x.toExponential());
  const sign = match[1];
  const digits = match[2] + (match[3] || "");
  const exp = Number.parseInt(match[4], 10);
  if (exp >= 16 || exp < -4) {
    const mantissa = match[3] ? `${match[2]}.${match[3]}` : match[2];
    const expSign = exp < 0 ? "-" : "+";
    return `${sign}${mantissa}e${expSign}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  if (exp >= 0) {
    const intPart = digits.length > exp + 1 ? digits.slice(0, exp + 1) : digits.padEnd(exp + 1, "0");
    const fracPart = digits.length > exp + 1 ? digits.slice(exp + 1) : "";
    return `${sign}${intPart}.${fracPart || "0"}`;
  }
  return `${sign}0.${"0".repeat(-exp - 1)}${digits}`;
}

// Python str() for the JSON value shapes that can reach text fields.
function pyStr(value) {
  if (typeof value === "string") return value;
  if (value === true) return "True";
  if (value === false) return "False";
  if (value === null) return "None";
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  return pyrepr(value);
}

// Python truthiness for JSON values (empty array/object are falsy).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "" || value === 0) return false;
  if (value instanceof PyFloat) return value.value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function cmpCodePoints(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (diff) return diff < 0 ? -1 : 1;
  }
  return left.length - right.length;
}

function jsonString(text) {
  let out = '"';
  for (const ch of text) {
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch.codePointAt(0) < 0x20) out += `\\u${ch.codePointAt(0).toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

function jsonScalar(value) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  return jsonString(value);
}

// json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
function dumpsCanonicalSorted(value) {
  if (Array.isArray(value)) return `[${value.map(dumpsCanonicalSorted).join(",")}]`;
  if (value !== null && typeof value === "object" && !(value instanceof PyFloat)) {
    const keys = Object.keys(value).sort(cmpCodePoints);
    return `{${keys.map((key) => `${jsonString(key)}:${dumpsCanonicalSorted(value[key])}`).join(",")}}`;
  }
  return jsonScalar(value);
}

// json.dumps(value, ensure_ascii=False, indent=2)
function dumpsIndent2(value, depth = 0) {
  const pad = " ".repeat(2 * (depth + 1));
  const close = " ".repeat(2 * depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => pad + dumpsIndent2(item, depth + 1)).join(",\n")}\n${close}]`;
  }
  if (value !== null && typeof value === "object" && !(value instanceof PyFloat)) {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([key, item]) => `${pad}${jsonString(key)}: ${dumpsIndent2(item, depth + 1)}`).join(",\n")}\n${close}}`;
  }
  return jsonScalar(value);
}

function nowIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;
}

function digestBytes(data) {
  return createHash("sha256").update(data).digest("hex");
}

function shortId(prefix, value) {
  const raw = dumpsCanonicalSorted(value);
  return `${prefix}_${createHash("sha256").update(Buffer.from(raw, "utf-8")).digest("hex").slice(0, 16)}`;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  let text = pyStr(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  text = pyStrip(text.split("\n").map((line) => line.replace(PY_RSTRIP_RE, "")).join("\n"));
  return text || null;
}

function cleanString(value) {
  const text = cleanText(value);
  return text ? text.split(PY_SPLIT_RE).filter((part) => part !== "").join(" ") : null;
}

function stringList(value) {
  if (value === null || value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  const result = [];
  for (const entry of values) {
    const text = cleanString(entry);
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

// Python float() acceptance for the decimal forms that appear in exports.
// (Python additionally accepts underscores and inf/nan spellings; those are
// not reproduced.)
function pyFloatParse(text) {
  const stripped = pyStrip(text);
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(stripped)) return null;
  return Number.parseFloat(stripped);
}

function number(value, integer = false) {
  if (typeof value === "boolean" || value === null || value === undefined || value === "") return null;
  const parsed = pyFloatParse(pyStr(value).replaceAll(",", ""));
  if (parsed === null || parsed < 0) return null;
  return integer ? Math.trunc(parsed) : new PyFloat(parsed);
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysFromCivil(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [y + (month <= 2 ? 1 : 0), month, day];
}

function parseTimeComponents(timePart) {
  let match = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(timePart);
  if (!match) match = /^(\d{2})(?:(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?$/.exec(timePart);
  if (!match) return null;
  const hh = Number.parseInt(match[1], 10);
  const mm = match[2] === undefined ? 0 : Number.parseInt(match[2], 10);
  const ss = match[3] === undefined ? 0 : Number.parseInt(match[3], 10);
  const us = match[4] === undefined ? 0 : Number.parseInt(match[4].slice(0, 6).padEnd(6, "0"), 10);
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return { hh, mm, ss, us };
}

// datetime.fromisoformat for the shapes seen in feeds: extended calendar
// date, optional single-character separator + time, optional Z/z or numeric
// offset. (CPython 3.11+ also accepts basic YYYYMMDD dates and ISO week
// dates; those are not reproduced.)
function parsePyIsoformat(text) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!dateMatch) return null;
  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10);
  const day = Number.parseInt(dateMatch[3], 10);
  if (year < 1 || month < 1 || month > 12) return null;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return null;
  let time = { hh: 0, mm: 0, ss: 0, us: 0 };
  let offsetUs = null;
  const rest = text.slice(10);
  if (rest) {
    const tail = rest.slice(1);
    if (!tail) return null;
    let tzIndex = -1;
    for (let i = 0; i < tail.length; i += 1) {
      const ch = tail[i];
      if (ch === "Z" || ch === "z" || ch === "+" || ch === "-") {
        tzIndex = i;
        break;
      }
    }
    const timePart = tzIndex >= 0 ? tail.slice(0, tzIndex) : tail;
    const tzPart = tzIndex >= 0 ? tail.slice(tzIndex) : "";
    time = parseTimeComponents(timePart);
    if (!time) return null;
    if (tzPart === "Z" || tzPart === "z") {
      offsetUs = 0;
    } else if (tzPart) {
      const tz = /^([+-])(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,](\d+))?)?)?$/.exec(tzPart);
      if (!tz) return null;
      const th = Number.parseInt(tz[2], 10);
      const tm = tz[3] === undefined ? 0 : Number.parseInt(tz[3], 10);
      const ts = tz[4] === undefined ? 0 : Number.parseInt(tz[4], 10);
      const tf = tz[5] === undefined ? 0 : Number.parseInt(tz[5].slice(0, 6).padEnd(6, "0"), 10);
      if (tm > 59 || ts > 59) return null;
      const magnitude = ((th * 3600 + tm * 60 + ts) * 1e6 + tf);
      if (magnitude >= 24 * 3600 * 1e6) return null;
      offsetUs = tz[1] === "-" ? -magnitude : magnitude;
    }
  }
  const localUs = (daysFromCivil(year, month, day) * 86400 + time.hh * 3600 + time.mm * 60 + time.ss) * 1e6 + time.us;
  return localUs - (offsetUs ?? 0);
}

function isoDatetime(value) {
  const text = cleanString(value);
  if (!text) return null;
  const candidate = text.endsWith("Z") ? `${text.slice(0, -1)}+00:00` : text;
  const epochUs = parsePyIsoformat(candidate);
  if (epochUs === null) return null;
  const seconds = Math.floor(epochUs / 1e6);
  const days = Math.floor(seconds / 86400);
  const secondOfDay = seconds - days * 86400;
  const [year, month, day] = civilFromDays(days);
  const pad = (n) => String(n).padStart(2, "0");
  const hh = Math.floor(secondOfDay / 3600);
  const mm = Math.floor((secondOfDay % 3600) / 60);
  const ss = secondOfDay % 60;
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:${pad(ss)}Z`;
}

// urllib.parse.urlsplit for cleaned single-line strings.
function pyUrlsplit(url) {
  let rest = url.replaceAll("\t", "").replaceAll("\r", "").replaceAll("\n", "");
  let scheme = "";
  const colon = rest.indexOf(":");
  if (colon > 0 && /^[A-Za-z]/.test(rest) && /^[A-Za-z0-9+.-]*$/.test(rest.slice(0, colon))) {
    scheme = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }
  let netloc = "";
  if (rest.startsWith("//")) {
    let end = rest.length;
    for (const ch of ["/", "?", "#"]) {
      const idx = rest.indexOf(ch, 2);
      if (idx >= 0 && idx < end) end = idx;
    }
    netloc = rest.slice(2, end);
    rest = rest.slice(end);
    if ((netloc.includes("[") && !netloc.includes("]")) || (netloc.includes("]") && !netloc.includes("["))) {
      throw new Error("Invalid IPv6 URL");
    }
    if (netloc && ![...netloc].every((ch) => ch.codePointAt(0) < 128)) {
      const stripped = netloc.replaceAll("@", "").replaceAll(":", "").replaceAll("#", "").replaceAll("?", "");
      const normalized = stripped.normalize("NFKC");
      if (normalized !== stripped) {
        for (const ch of "/?#@:") {
          if (normalized.includes(ch)) throw new Error(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
        }
      }
    }
  }
  let fragment = "";
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
  }
  let query = "";
  const qm = rest.indexOf("?");
  if (qm >= 0) {
    query = rest.slice(qm + 1);
    rest = rest.slice(0, qm);
  }
  return { scheme, netloc, path: rest, query, fragment };
}

function netlocHostPortStr(netloc) {
  const at = netloc.lastIndexOf("@");
  const hostinfo = at >= 0 ? netloc.slice(at + 1) : netloc;
  let host;
  let portStr;
  const open = hostinfo.indexOf("[");
  if (open >= 0) {
    const close = hostinfo.indexOf("]", open + 1);
    host = hostinfo.slice(open + 1, close < 0 ? undefined : close);
    const after = close < 0 ? "" : hostinfo.slice(close + 1);
    const sep = after.indexOf(":");
    portStr = sep >= 0 ? after.slice(sep + 1) : "";
  } else {
    const sep = hostinfo.indexOf(":");
    host = sep >= 0 ? hostinfo.slice(0, sep) : hostinfo;
    portStr = sep >= 0 ? hostinfo.slice(sep + 1) : "";
  }
  return { hostname: host ? host.toLowerCase() : null, portStr };
}

// SplitResult.port: raises ValueError on a malformed port, which the Python
// caller does not catch — surface it the same way (uncaught -> exit 1).
function netlocPort(portStr) {
  if (!portStr) return null;
  if (!/^\d+$/.test(portStr)) throw new Error(`Port could not be cast to integer value as '${portStr}'`);
  const port = Number.parseInt(portStr, 10);
  if (port > 65535) throw new Error("Port out of range 0-65535");
  return port;
}

function canonicalUrl(value) {
  const text = cleanString(value);
  if (!text) return null;
  let parts;
  try {
    parts = pyUrlsplit(text);
  } catch {
    return null;
  }
  const { hostname, portStr } = netlocHostPortStr(parts.netloc);
  if (!["http", "https"].includes(parts.scheme.toLowerCase()) || !hostname) return null;
  const port = netlocPort(portStr);
  const portSuffix = port ? `:${port}` : "";
  const path = (parts.path || "/").replace(/\/{2,}/g, "/");
  let url = `${parts.scheme.toLowerCase()}://${hostname}${portSuffix}${path}`;
  if (parts.query) url += `?${parts.query}`;
  return url;
}

function first(record, ...keys) {
  for (const key of keys) {
    if (Object.hasOwn(record, key) && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// str(PurePosixPath(p)) for the argument strings this CLI receives.
function pyPathStr(p) {
  if (p === "") return ".";
  let lead = "";
  let rest = p;
  const slashes = /^\/+/.exec(rest);
  if (slashes) {
    lead = slashes[0].length === 2 ? "//" : "/";
    rest = rest.slice(slashes[0].length);
  }
  const parts = rest.split("/").filter((seg) => seg !== "" && seg !== ".");
  if (!lead && !parts.length) return ".";
  return lead + parts.join("/");
}

function pyPathSuffix(p) {
  const parts = pyPathStr(p).split("/");
  const name = parts[parts.length - 1];
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

const PY_SPLITLINES_RE = /\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/;

function loadRecords(path) {
  const raw = readFileSync(path);
  const fileHash = digestBytes(raw);
  const suffix = pyPathSuffix(path).toLowerCase();
  const decoded = () => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  let records;
  let fileFormat;
  if (suffix === ".jsonl") {
    records = decoded()
      .split(PY_SPLITLINES_RE)
      .filter((line) => pyStrip(line))
      .map((line) => JSON.parse(line));
    fileFormat = "jsonl";
  } else if (suffix === ".json") {
    const payload = JSON.parse(decoded());
    if (Array.isArray(payload)) {
      records = payload;
    } else if (isObject(payload) && Array.isArray(payload.items)) {
      records = payload.items;
    } else if (isObject(payload) && Array.isArray(payload.records)) {
      records = payload.records;
    } else if (isObject(payload)) {
      records = [payload];
    } else {
      throw new Error(`Unsupported JSON root in ${pyPathStr(path)}`);
    }
    fileFormat = "json";
  } else {
    throw new Error(`Unsupported input format for ${pyPathStr(path)}; use JSON or JSONL`);
  }
  if (records.some((record) => !isObject(record))) {
    throw new Error(`Every record in ${pyPathStr(path)} must be an object`);
  }
  return [records, fileFormat, fileHash];
}

function normalizeAsset(raw, itemKey, index) {
  if (typeof raw === "string") raw = { url: raw };
  if (!isObject(raw)) return null;
  let assetType = cleanString(first(raw, "type", "asset_type")) || "other";
  if (!ASSET_TYPES.has(assetType)) assetType = "other";
  const url = canonicalUrl(first(raw, "url", "source_url"));
  const localPath = cleanString(first(raw, "local_path", "path"));
  let rights = cleanString(first(raw, "rights_status", "rights")) || "unknown";
  if (!RIGHTS.has(rights)) rights = "unknown";
  const firstId = first(raw, "id", "external_id");
  const seed = pyTruthy(firstId) ? firstId : [itemKey, index, assetType, url, localPath];
  return {
    id: shortId("asset", seed),
    type: assetType,
    url,
    local_path: localPath,
    mime_type: cleanString(raw.mime_type ?? null),
    width: number(raw.width ?? null, true),
    height: number(raw.height ?? null, true),
    duration_ms: number(first(raw, "duration_ms", "duration"), true),
    rights_status: rights,
    ocr_text: cleanText(first(raw, "ocr_text", "ocr")),
    transcript: cleanText(raw.transcript ?? null),
  };
}

function fallbackSegment(record, mediaFormat) {
  const choices = [
    ["body", first(record, "body", "text", "content")],
    ["caption", record.caption ?? null],
    ["voiceover", record.transcript ?? null],
    ["on_screen_text", first(record, "ocr_text", "ocr")],
  ];
  for (let [role, value] of choices) {
    const text = cleanText(value);
    if (text) {
      if (["short_video", "long_video", "podcast"].includes(mediaFormat) && role === "body") {
        role = "voiceover";
      }
      return { role, text };
    }
  }
  return null;
}

function normalizeSegment(raw, itemKey, index, assetIds) {
  if (typeof raw === "string") raw = { text: raw, role: "body" };
  if (!isObject(raw)) return null;
  let role = cleanString(first(raw, "role", "type")) || "other";
  if (!ROLES.has(role)) role = "other";
  const text = cleanText(first(raw, "text", "body", "content"));
  const linkedAssets = stringList(first(raw, "asset_ids", "assets")).filter((value) => assetIds.has(value));
  if (!text && !linkedAssets.length) return null;
  let startMs = number(first(raw, "start_ms", "start"), true);
  let endMs = number(first(raw, "end_ms", "end"), true);
  if (startMs !== null && endMs !== null && endMs < startMs) {
    [startMs, endMs] = [endMs, startMs];
  }
  const sourceUrls = [];
  for (const value of stringList(first(raw, "source_urls", "sources", "citations"))) {
    const url = canonicalUrl(value);
    if (url && !sourceUrls.includes(url)) sourceUrls.push(url);
  }
  const firstId = first(raw, "id", "external_id");
  const seed = pyTruthy(firstId) ? firstId : [itemKey, index, role, text, linkedAssets, startMs, endMs];
  return {
    id: shortId("segment", seed),
    index,
    role,
    text,
    start_ms: startMs,
    end_ms: endMs,
    asset_ids: linkedAssets,
    source_urls: sourceUrls,
  };
}

function normalizeInteraction(raw, itemKey, index) {
  if (typeof raw === "string") raw = { text: raw };
  if (!isObject(raw)) return null;
  const text = cleanText(first(raw, "text", "body", "content"));
  if (!text) return null;
  let authorRole = cleanString(first(raw, "author_role", "role")) || "unknown";
  if (!AUTHOR_ROLES.has(authorRole)) authorRole = "unknown";
  const rawId = cleanString(first(raw, "id", "external_id"));
  const interactionId = shortId("interaction", rawId || [itemKey, index, text]);
  const parent = cleanString(first(raw, "parent_id", "parent"));
  return {
    id: interactionId,
    parent_id: parent,
    author_role: authorRole,
    text,
    score: number(first(raw, "score", "likes", "upvotes")),
    created_at: isoDatetime(first(raw, "created_at", "published_at", "timestamp")),
  };
}

function normalizeMetrics(raw, observedAt) {
  const values = {};
  const source = isObject(raw) ? raw : {};
  const nested = isObject(source.values) ? source.values : source;
  for (const [key, value] of Object.entries(nested)) {
    const name = pyStrip(key).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    const parsed = number(value);
    if (name && /^[a-z]/.test(name) && parsed !== null) {
      values[name] = parsed;
    }
  }
  const firstObserved = first(source, "observed_at", "as_of");
  return {
    available: Object.keys(values).length > 0,
    observed_at: isoDatetime(pyTruthy(firstObserved) ? firstObserved : observedAt),
    values,
    missing: METRIC_NAMES.filter((name) => !Object.hasOwn(values, name)),
  };
}

function enumValue(value, allowed, fallback) {
  if (typeof value === "boolean" && allowed === PRESENCE) {
    return value ? "present" : "absent";
  }
  const text = (cleanString(value) || fallback).toLowerCase();
  return allowed.has(text) ? text : fallback;
}

function normalizeRecord(record, { sourceFile, sourceHash, sourceIndex, sourceLabel, rightsBasis }) {
  const warnings = [];
  const platform = (cleanString(first(record, "platform", "channel", "site")) || "unknown").toLowerCase();
  let mediaFormat = (cleanString(first(record, "format", "content_type", "media_type")) || "other").toLowerCase();
  if (!FORMATS.has(mediaFormat)) {
    warnings.push(`record ${sourceIndex}: unsupported format ${pyrepr(mediaFormat)}; stored as other`);
    mediaFormat = "other";
  }
  const externalId = cleanString(first(record, "external_id", "post_id", "id"));
  const url = canonicalUrl(first(record, "url", "canonical_url", "source_url"));
  const title = cleanText(first(record, "title", "headline"));
  const seed = externalId || url || [platform, mediaFormat, title, first(record, "body", "text", "transcript", "caption")];
  const itemId = shortId("media_item", seed);

  const assets = (Array.isArray(record.assets) ? record.assets : [])
    .map((raw, index) => normalizeAsset(raw, itemId, index))
    .filter((asset) => asset !== null);
  const assetIds = new Set(assets.map((asset) => asset.id));
  let rawSegments = Array.isArray(record.segments) ? record.segments : [];
  if (!rawSegments.length) {
    const fallback = fallbackSegment(record, mediaFormat);
    rawSegments = fallback ? [fallback] : [];
    if (fallback) {
      warnings.push(`record ${sourceIndex}: derived one coarse segment from supplied text`);
    }
  }
  const segments = rawSegments
    .map((raw, index) => normalizeSegment(raw, itemId, index, assetIds))
    .filter((segment) => segment !== null);
  if (!segments.length) {
    warnings.push(`record ${sourceIndex}: skipped because it has no text or linked media segment`);
    return [null, warnings];
  }
  segments.forEach((segment, index) => {
    segment.index = index;
  });

  const rawCommunity = isObject(record.community) ? record.community : null;
  let community = null;
  if (pyTruthy(rawCommunity) || ["community_post", "community_comment"].includes(mediaFormat)) {
    const source = rawCommunity || {};
    const name = cleanString(first(source, "name", "subreddit", "community"));
    if (name) {
      community = {
        name,
        flair: cleanString(first(source, "flair", "tag")),
        rules_url: canonicalUrl(first(source, "rules_url", "rules")),
        rules_checked_at: isoDatetime(first(source, "rules_checked_at", "checked_at")),
        op_intent: cleanText(first(source, "op_intent", "intent", "question")),
        audience_terms: stringList(first(source, "audience_terms", "terms", "vocabulary")),
      };
    } else {
      warnings.push(`record ${sourceIndex}: community item lacks community name`);
    }
  }

  const rawInteractions = Array.isArray(record.interactions)
    ? record.interactions
    : Array.isArray(record.comments)
      ? record.comments
      : [];
  const interactions = rawInteractions
    .map((raw, index) => normalizeInteraction(raw, itemId, index))
    .filter((interaction) => interaction !== null);
  const complianceRaw = isObject(record.compliance) ? record.compliance : {};
  const disclosureSegmentIds = segments.filter((segment) => segment.role === "disclosure").map((segment) => segment.id);
  const pick = (fromCompliance, fallbackKey) =>
    pyTruthy(fromCompliance) ? fromCompliance : record[fallbackKey] ?? null;
  const compliance = {
    account_qualification: enumValue(pick(first(complianceRaw, "account_qualification", "qualification"), "account_qualification"), QUALIFICATIONS, "unknown"),
    content_class: enumValue(pick(first(complianceRaw, "content_class", "classification"), "content_class"), CONTENT_CLASSES, "unknown"),
    commercial_relationship: enumValue(pick(first(complianceRaw, "commercial_relationship", "relationship"), "commercial_relationship"), RELATIONSHIPS, "unknown"),
    ai_label: enumValue(pick(first(complianceRaw, "ai_label", "ai_assistance_label"), "ai_label"), PRESENCE, "unknown"),
    identity_disclosure: enumValue(pick(first(complianceRaw, "identity_disclosure", "professional_identity"), "identity_disclosure"), PRESENCE, "unknown"),
    disclosure_segment_ids: disclosureSegmentIds,
  };
  const metrics = normalizeMetrics(record.metrics ?? null, first(record, "metrics_observed_at", "observed_at", "as_of"));
  const createdAt = isoDatetime(first(record, "created_at", "published_at", "timestamp"));
  const observedAt = isoDatetime(first(record, "observed_at", "collected_at", "as_of"));
  let sampleRole = (cleanString(record.sample_role ?? null) || "unknown").toLowerCase();
  if (!SAMPLE_ROLES.has(sampleRole)) sampleRole = "unknown";

  if (assets.length && assets.some((asset) => asset.rights_status === "unknown")) {
    warnings.push(`record ${sourceIndex}: one or more asset reuse rights are unknown`);
  }
  if (
    ["short_video", "long_video", "podcast"].includes(mediaFormat) &&
    !segments.some((segment) => segment.start_ms !== null && segment.end_ms !== null)
  ) {
    warnings.push(`record ${sourceIndex}: timed media lacks segment timing`);
  }
  if (community && (!pyTruthy(community.rules_url) || !pyTruthy(community.rules_checked_at))) {
    warnings.push(`record ${sourceIndex}: community rules snapshot is incomplete`);
  }

  const sourceRecord = {
    source_label: sourceLabel,
    source_file: pyPathStr(sourceFile),
    source_file_sha256: sourceHash,
    source_record_index: sourceIndex,
    source_record_id: externalId,
    source_url: url,
  };
  const authorRaw = isObject(record.author) ? record.author : {};
  const authorName = first(authorRaw, "name", "display_name");
  const authorHandle = first(authorRaw, "handle", "username");
  const item = {
    id: itemId,
    external_id: externalId,
    platform,
    format: mediaFormat,
    sample_role: sampleRole,
    author: {
      name: cleanString(pyTruthy(authorName) ? authorName : record.author_name ?? null),
      handle: cleanString(pyTruthy(authorHandle) ? authorHandle : record.author_handle ?? null),
    },
    packaging: {
      title,
      subtitle: cleanText(first(record, "subtitle", "dek")),
      cover_text: cleanText(first(record, "cover_text", "cover")),
      tags: stringList(first(record, "tags", "hashtags")),
      flair: cleanString(first(record, "flair", "tag")),
    },
    created_at: createdAt,
    observed_at: observedAt,
    url,
    language: cleanString(first(record, "language", "lang")) || "und",
    segments,
    assets,
    community,
    interactions,
    compliance,
    metrics,
    provenance: {
      rights_basis: rightsBasis,
      records: [sourceRecord],
      transformations: ["whitespace-normalized", "ordered-units-normalized"],
    },
  };
  return [item, warnings];
}

function dedupeKey(item) {
  if (pyTruthy(item.external_id)) {
    return `external:${item.platform}:${item.external_id}`;
  }
  if (pyTruthy(item.url)) {
    return `url:${item.url}`;
  }
  const content = item.segments.map((segment) => [segment.role, segment.text, segment.asset_ids]);
  return `content:${shortId("fingerprint", [item.platform, item.format, content])}`;
}

function counterToSortedObject(counter) {
  const result = {};
  for (const key of [...counter.keys()].sort(cmpCodePoints)) {
    result[key] = counter.get(key);
  }
  return result;
}

export function normalize(inputPaths, { rights_basis: rightsBasis, source_label: sourceLabel, sample_frame: sampleFrame }) {
  if (!["public", "authorized"].includes(rightsBasis)) {
    throw new Error("rights_basis must be public or authorized");
  }
  const generatedAt = nowIso();
  const inputs = [];
  const itemsByKey = new Map();
  const warnings = [];
  let inputRecords = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const path of inputPaths) {
    const [records, fileFormat, sourceHash] = loadRecords(path);
    inputs.push({ path: pyPathStr(path), format: fileFormat, sha256: sourceHash, records: records.length });
    inputRecords += records.length;
    records.forEach((record, index) => {
      const [item, itemWarnings] = normalizeRecord(record, {
        sourceFile: path,
        sourceHash,
        sourceIndex: index,
        sourceLabel,
        rightsBasis,
      });
      warnings.push(...itemWarnings);
      if (item === null) {
        skipped += 1;
        return;
      }
      const key = dedupeKey(item);
      if (itemsByKey.has(key)) {
        duplicates += 1;
        itemsByKey.get(key).provenance.records.push(...item.provenance.records);
        return;
      }
      itemsByKey.set(key, item);
    });
  }

  const items = [...itemsByKey.values()];
  if (!items.length) {
    throw new Error("No usable media records were found");
  }
  const platforms = new Map();
  const formats = new Map();
  const sampleRoles = new Map();
  for (const item of items) {
    platforms.set(item.platform, (platforms.get(item.platform) || 0) + 1);
    formats.set(item.format, (formats.get(item.format) || 0) + 1);
    sampleRoles.set(item.sample_role, (sampleRoles.get(item.sample_role) || 0) + 1);
  }
  const created = items.map((item) => item.created_at).filter((value) => pyTruthy(value)).sort(cmpCodePoints);
  const corpusSeed = items.map((item) => item.id);
  return {
    schema_version: SCHEMA_VERSION,
    corpus_id: shortId("media_corpus", corpusSeed),
    generated_at: generatedAt,
    scope: {
      platforms: [...platforms.keys()].sort(cmpCodePoints),
      formats: [...formats.keys()].sort(cmpCodePoints),
      sample_frame: cleanString(sampleFrame) || "unspecified",
      time_range: { start: created.length ? created[0] : null, end: created.length ? created[created.length - 1] : null },
    },
    items,
    provenance: {
      rights_basis: rightsBasis,
      source_label: sourceLabel,
      inputs,
      normalized_at: generatedAt,
      normalizer: { name: "normalize_media_corpus.py", version: NORMALIZER_VERSION },
    },
    stats: {
      input_records: inputRecords,
      output_items: items.length,
      duplicates_removed: duplicates,
      platforms: counterToSortedObject(platforms),
      formats: counterToSortedObject(formats),
      sample_roles: counterToSortedObject(sampleRoles),
      items_with_assets: items.filter((item) => pyTruthy(item.assets)).length,
      items_with_interactions: items.filter((item) => pyTruthy(item.interactions)).length,
      items_with_metrics: items.filter((item) => item.metrics.available).length,
    },
    quality: {
      warnings: [...new Set(warnings)].sort(cmpCodePoints),
      skipped_records: skipped,
      duplicates_removed: duplicates,
    },
  };
}

const USAGE =
  "usage: normalize_media_corpus.mjs [-h] --rights-basis {public,authorized}\n" +
  "                                  --source-label SOURCE_LABEL\n" +
  "                                  [--sample-frame SAMPLE_FRAME]\n" +
  "                                  [--output OUTPUT]\n" +
  "                                  inputs [inputs ...]";

function usageError(message) {
  process.stderr.write(`${USAGE}\nnormalize_media_corpus.mjs: error: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { inputs: [], rightsBasis: null, sourceLabel: null, sampleFrame: "unspecified", output: null };
  const takeValue = (name, index) => {
    if (index + 1 >= argv.length) usageError(`argument ${name}: expected one argument`);
    return argv[index + 1];
  };
  let positionalOnly = false;
  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    if (!positionalOnly && arg === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && arg.startsWith("--")) {
      let value = null;
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        value = arg.slice(eq + 1);
        arg = arg.slice(0, eq);
      }
      if (arg === "--rights-basis") {
        if (value === null) {
          value = takeValue(arg, i);
          i += 1;
        }
        if (!["public", "authorized"].includes(value)) {
          usageError(`argument --rights-basis: invalid choice: '${value}' (choose from 'public', 'authorized')`);
        }
        args.rightsBasis = value;
      } else if (arg === "--source-label") {
        if (value === null) {
          value = takeValue(arg, i);
          i += 1;
        }
        args.sourceLabel = value;
      } else if (arg === "--sample-frame") {
        if (value === null) {
          value = takeValue(arg, i);
          i += 1;
        }
        args.sampleFrame = value;
      } else if (arg === "--output") {
        if (value === null) {
          value = takeValue(arg, i);
          i += 1;
        }
        args.output = value;
      } else if (arg === "-h" || arg === "--help") {
        process.stdout.write(`${USAGE}\n\nNormalize media records into MediaCorpusV1\n`);
        process.exit(0);
      } else {
        usageError(`unrecognized arguments: ${arg}`);
      }
    } else if (!positionalOnly && arg === "-h") {
      process.stdout.write(`${USAGE}\n\nNormalize media records into MediaCorpusV1\n`);
      process.exit(0);
    } else {
      args.inputs.push(arg);
    }
  }
  const missing = [];
  if (!args.inputs.length) missing.push("inputs");
  if (args.rightsBasis === null) missing.push("--rights-basis");
  if (args.sourceLabel === null) missing.push("--source-label");
  if (missing.length) usageError(`the following arguments are required: ${missing.join(", ")}`);
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = normalize(args.inputs, {
    rights_basis: args.rightsBasis,
    source_label: args.sourceLabel,
    sample_frame: args.sampleFrame,
  });
  const encoded = `${dumpsIndent2(result)}\n`;
  if (args.output) {
    writeFileSync(args.output, encoded, "utf-8");
  } else {
    process.stdout.write(encoded);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
