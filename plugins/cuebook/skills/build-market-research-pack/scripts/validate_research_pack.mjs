#!/usr/bin/env node
// Validate deterministic ResearchPackV1 invariants and cross-references.
//
// Port of validate_research_pack.py; error codes, paths, message wording, and
// JSON output shape are contract and must stay byte-compatible with the
// Python original.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { pyrepr } from "../../../scripts/validate_json_schema.mjs";

const REQUIRED_ROOT = new Set([
  "schema_version",
  "brief",
  "source_register",
  "fact_ledger",
  "comparator_table",
  "market_context",
  "thesis",
  "scenarios",
  "catalysts",
  "gaps",
  "quality_report",
]);
const DECISION_USES = new Set(["public_content", "investment_research", "trade_watch", "risk_review"]);
const EVIDENCE_CLASSES = new Set(["source", "verified-live", "derived", "hypothesis"]);
const FRESHNESS = new Set(["current", "stale", "unknown"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);
const STANCES = new Set(["positive", "negative", "mixed", "watch", "no-view"]);
const ACCESS = new Set(["public", "authorized"]);
const DATA_FRESHNESS = new Set(["current", "stale", "mixed", "unknown"]);
const SOURCE_TYPES = new Set([
  "official_filing",
  "company_release",
  "official_data",
  "exchange",
  "market_data",
  "consensus_data",
  "transcript",
  "reputable_news",
  "specialist_research",
  "social",
  "user_supplied",
]);
const PRIMARY_SOURCE_TYPES = new Set([
  "official_filing",
  "company_release",
  "official_data",
  "exchange",
  "transcript",
]);
const LIVE_SOURCE_TYPES = new Set(["market_data", "exchange", "official_data", "consensus_data"]);
const EVENT_ANCHOR_SOURCE_TYPES = new Set(["company_release", "reputable_news"]);
const CONTEXT_SECTIONS = new Set(["price_reaction", "positioning", "liquidity", "valuation"]);
const VALUATION_VALUE_STATES = new Set(["numeric", "N/M"]);
const VALUATION_COMPARABILITY = new Set(["comparable", "not_comparable", "not_applicable"]);

// ---------------------------------------------------------------------------
// Python-parity helpers.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const get = (obj, key) => (isObject(obj) && Object.hasOwn(obj, key) ? obj[key] : undefined);

function pyTruthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// Python str(x or "") for message/guard interpolation.
function strField(value) {
  if (!pyTruthy(value)) return "";
  return typeof value === "string" ? value : pyrepr(value);
}

// Characters stripped by Python str.strip() / matched by Python re \s.
const PY_SPACE = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "gu");

const pystrip = (value) => value.replace(PY_STRIP_RE, "");

function pyEq(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === null || b === null) return a === b;
  const numA = typeof a === "boolean" ? Number(a) : a;
  const numB = typeof b === "boolean" ? Number(b) : b;
  if (typeof numA === "number" && typeof numB === "number") return numA === numB;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a === "string") return a === b;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, index) => pyEq(item, b[index]));
  if (typeof a === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => Object.hasOwn(b, key) && pyEq(a[key], b[key]));
  }
  return a === b;
}

// ---------------------------------------------------------------------------
// json.loads parity (accepts NaN/Infinity, rejects a UTF-8 BOM, and mirrors
// CPython JSONDecodeError messages).

class JSONDecodeError extends SyntaxError {
  constructor(msg, doc, pos) {
    let newline = -1;
    for (let index = pos - 1; index >= 0; index -= 1) {
      if (doc[index] === "\n") {
        newline = index;
        break;
      }
    }
    let lineno = 1;
    for (let index = 0; index < pos; index += 1) {
      if (doc[index] === "\n") lineno += 1;
    }
    super(`${msg}: line ${lineno} column ${pos - newline} (char ${pos})`);
    this.name = "JSONDecodeError";
  }
}

const JSON_WS = new Set([" ", "\t", "\n", "\r"]);
const JSON_NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/y;
const JSON_BACKSLASH = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

function skipJsonWs(doc, index) {
  while (index < doc.length && JSON_WS.has(doc[index])) index += 1;
  return index;
}

function scanJsonString(doc, end) {
  const begin = end - 1;
  const parts = [];
  while (true) {
    let terminatorIndex = end;
    while (terminatorIndex < doc.length) {
      const ch = doc[terminatorIndex];
      if (ch === '"' || ch === "\\" || ch < "\x20") break;
      terminatorIndex += 1;
    }
    if (terminatorIndex >= doc.length) {
      throw new JSONDecodeError("Unterminated string starting at", doc, begin);
    }
    parts.push(doc.slice(end, terminatorIndex));
    const terminator = doc[terminatorIndex];
    end = terminatorIndex + 1;
    if (terminator === '"') break;
    if (terminator !== "\\") {
      throw new JSONDecodeError(`Invalid control character ${pyrepr(terminator)} at`, doc, terminatorIndex);
    }
    if (end >= doc.length) {
      throw new JSONDecodeError("Unterminated string starting at", doc, begin);
    }
    const esc = doc[end];
    if (esc !== "u") {
      const decoded = JSON_BACKSLASH[esc];
      if (decoded === undefined) {
        throw new JSONDecodeError(`Invalid \\escape: ${pyrepr(esc)}`, doc, end);
      }
      parts.push(decoded);
      end += 1;
    } else {
      const decodeUnit = (pos) => {
        const digits = doc.slice(pos + 1, pos + 5);
        if (digits.length === 4 && !/[xX]/.test(digits) && /^[0-9a-fA-F]{4}$/.test(digits)) {
          return parseInt(digits, 16);
        }
        throw new JSONDecodeError("Invalid \\uXXXX escape", doc, pos + 1);
      };
      let unit = decodeUnit(end);
      end += 5;
      if (unit >= 0xd800 && unit <= 0xdbff && doc.slice(end, end + 2) === "\\u") {
        const unit2 = decodeUnit(end + 1);
        if (unit2 >= 0xdc00 && unit2 <= 0xdfff) {
          unit = 0x10000 + ((unit - 0xd800) << 10) + (unit2 - 0xdc00);
          end += 6;
        }
      }
      parts.push(String.fromCodePoint(unit));
    }
  }
  return [parts.join(""), end];
}

function setJsonKey(target, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

function scanJsonObject(doc, index) {
  const pairs = {};
  let end = index + 1;
  let nextchar = doc[end];
  if (nextchar !== '"') {
    if (nextchar !== undefined && JSON_WS.has(nextchar)) {
      end = skipJsonWs(doc, end);
      nextchar = doc[end];
    }
    if (nextchar === "}") return [pairs, end + 1];
    if (nextchar !== '"') {
      throw new JSONDecodeError("Expecting property name enclosed in double quotes", doc, end);
    }
  }
  end += 1;
  while (true) {
    let key;
    [key, end] = scanJsonString(doc, end);
    if (doc[end] !== ":") {
      end = skipJsonWs(doc, end);
      if (doc[end] !== ":") {
        throw new JSONDecodeError("Expecting ':' delimiter", doc, end);
      }
    }
    end += 1;
    if (end < doc.length && JSON_WS.has(doc[end])) {
      end = skipJsonWs(doc, end + 1);
    }
    let value;
    [value, end] = scanJsonValue(doc, end);
    setJsonKey(pairs, key, value);
    let closing = end < doc.length ? doc[end] : "";
    if (JSON_WS.has(closing)) {
      end = skipJsonWs(doc, end + 1);
      closing = end < doc.length ? doc[end] : "";
    }
    end += 1;
    if (closing === "}") break;
    if (closing !== ",") {
      throw new JSONDecodeError("Expecting ',' delimiter", doc, end - 1);
    }
    end = skipJsonWs(doc, end);
    const quote = end < doc.length ? doc[end] : "";
    end += 1;
    if (quote !== '"') {
      throw new JSONDecodeError("Expecting property name enclosed in double quotes", doc, end - 1);
    }
  }
  return [pairs, end];
}

function scanJsonArray(doc, index) {
  const values = [];
  let end = index + 1;
  let nextchar = end < doc.length ? doc[end] : "";
  if (JSON_WS.has(nextchar)) {
    end = skipJsonWs(doc, end + 1);
    nextchar = end < doc.length ? doc[end] : "";
  }
  if (nextchar === "]") return [values, end + 1];
  while (true) {
    let value;
    [value, end] = scanJsonValue(doc, end);
    values.push(value);
    nextchar = end < doc.length ? doc[end] : "";
    if (JSON_WS.has(nextchar)) {
      end = skipJsonWs(doc, end + 1);
      nextchar = end < doc.length ? doc[end] : "";
    }
    end += 1;
    if (nextchar === "]") break;
    if (nextchar !== ",") {
      throw new JSONDecodeError("Expecting ',' delimiter", doc, end - 1);
    }
    if (end < doc.length && JSON_WS.has(doc[end])) {
      end = skipJsonWs(doc, end + 1);
    }
  }
  return [values, end];
}

function scanJsonValue(doc, index) {
  const nextchar = index < doc.length ? doc[index] : undefined;
  if (nextchar === '"') return scanJsonString(doc, index + 1);
  if (nextchar === "{") return scanJsonObject(doc, index);
  if (nextchar === "[") return scanJsonArray(doc, index);
  if (doc.startsWith("null", index)) return [null, index + 4];
  if (doc.startsWith("true", index)) return [true, index + 4];
  if (doc.startsWith("false", index)) return [false, index + 5];
  JSON_NUMBER_RE.lastIndex = index;
  const match = JSON_NUMBER_RE.exec(doc);
  if (match) return [Number(match[0]), index + match[0].length];
  if (doc.startsWith("NaN", index)) return [NaN, index + 3];
  if (doc.startsWith("Infinity", index)) return [Infinity, index + 8];
  if (doc.startsWith("-Infinity", index)) return [-Infinity, index + 9];
  throw new JSONDecodeError("Expecting value", doc, index);
}

export function pyJsonLoads(doc) {
  if (doc.startsWith("\ufeff")) {
    throw new JSONDecodeError("Unexpected UTF-8 BOM (decode using utf-8-sig)", doc, 0);
  }
  let index = skipJsonWs(doc, 0);
  const [value, end] = scanJsonValue(doc, index);
  index = skipJsonWs(doc, end);
  if (index !== doc.length) {
    throw new JSONDecodeError("Extra data", doc, index);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Validator.

export function issue(code, path, message) {
  return { code, path, message };
}

export function strings(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.length > 0);
}

export function isNonemptyString(value) {
  return typeof value === "string" && pystrip(value).length > 0;
}

// datetime.fromisoformat(value.replace("Z", "+00:00")) acceptance (common ISO
// forms) returning null on failure or { us, tz } on success.
const ISO_DATETIME_RE = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
  "(?:.(\\d{2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d{1,6})\\d*)?)?" +
  "([+-]\\d{2}(?::?\\d{2}(?::\\d{2}(?:\\.\\d{1,6})?)?)?)?)?$",
);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parsePyIso(value) {
  const match = ISO_DATETIME_RE.exec(value);
  if (!match) return null;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw, fractionRaw, offsetRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (month < 1 || month > 12) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return null;
  const hour = hourRaw === undefined ? 0 : Number(hourRaw);
  const minute = minuteRaw === undefined ? 0 : Number(minuteRaw);
  const second = secondRaw === undefined ? 0 : Number(secondRaw);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const micro = fractionRaw === undefined ? 0 : Number((fractionRaw + "000000").slice(0, 6));
  let offsetUs = null;
  if (offsetRaw !== undefined) {
    const sign = offsetRaw[0] === "-" ? -1 : 1;
    const digits = offsetRaw.slice(1).replace(/:/g, "");
    const offHour = Number(digits.slice(0, 2));
    const offMinute = digits.length >= 4 ? Number(digits.slice(2, 4)) : 0;
    const offSecondPart = digits.length > 4 ? digits.slice(4) : "0";
    const offSecond = Number(offSecondPart.split(".")[0] || "0");
    const offFraction = offSecondPart.includes(".")
      ? Number((offSecondPart.split(".")[1] + "000000").slice(0, 6))
      : 0;
    if (offMinute > 59 || offSecond > 59) return null;
    offsetUs = sign * (((offHour * 60 + offMinute) * 60 + offSecond) * 1e6 + offFraction);
    if (Math.abs(offsetUs) >= 24 * 3600 * 1e6) return null;
  }
  const baseMs = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(baseMs)) return null;
  let us = baseMs * 1000 + micro;
  if (offsetUs !== null) us -= offsetUs;
  return { us, tz: offsetUs !== null };
}

export function isDatetime(value) {
  if (typeof value !== "string") return false;
  const parsed = parsePyIso(value.replaceAll("Z", "+00:00"));
  return parsed !== null && parsed.tz;
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPublicHttpUrl(value) {
  if (typeof value !== "string") return false;
  // urllib.parse.urlparse: scheme before ":", netloc after "//".
  let scheme = "";
  let rest = value;
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(value);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    rest = schemeMatch[2];
  }
  let netloc = "";
  if (rest.startsWith("//")) {
    const stop = rest.slice(2).search(/[/?#]/);
    netloc = stop === -1 ? rest.slice(2) : rest.slice(2, 2 + stop);
  }
  return (scheme === "http" || scheme === "https") && netloc.length > 0;
}

export function addBadRefs(errors, refs, allowed, path, kind) {
  if (!Array.isArray(refs)) {
    errors.push(issue(`${kind}_REFS_TYPE`, path, `${kind.toLowerCase()} references must be an array.`));
    return;
  }
  for (const ref of refs) {
    if (typeof ref !== "string" || !allowed.has(ref)) {
      errors.push(issue(`UNKNOWN_${kind}_REF`, path, `Unknown ${kind.toLowerCase()} reference: ${pyrepr(ref)}.`));
    }
  }
}

export function validate(item) {
  const errors = [];
  const warnings = [];
  if (!isObject(item)) {
    return {
      valid: false,
      errors: [issue("ROOT_TYPE", "$", "ResearchPackV1 must be an object.")],
      warnings: [],
    };
  }

  for (const key of [...REQUIRED_ROOT].filter((name) => !Object.hasOwn(item, name)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(item).filter((name) => !REQUIRED_ROOT.has(name)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (!pyEq(get(item, "schema_version"), "research-pack-v1")) {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected research-pack-v1."));
  }

  let brief = get(item, "brief");
  if (!isObject(brief)) {
    errors.push(issue("BRIEF_TYPE", "$.brief", "brief must be an object."));
    brief = {};
  }
  if (!DECISION_USES.has(get(brief, "decision_use"))) {
    errors.push(issue("DECISION_USE", "$.brief.decision_use", "Unsupported decision use."));
  }
  for (const key of ["subject", "question", "horizon", "as_of", "freshness_window"]) {
    if (!pystrip(strField(get(brief, key)))) {
      errors.push(issue("BRIEF_FIELD", `$.brief.${key}`, `${key} is required.`));
    }
  }
  if (!Array.isArray(get(brief, "assets"))) {
    errors.push(issue("ASSETS_TYPE", "$.brief.assets", "assets must be an array."));
  }

  let sources = get(item, "source_register");
  if (!Array.isArray(sources)) {
    errors.push(issue("SOURCE_REGISTER_TYPE", "$.source_register", "source_register must be an array."));
    sources = [];
  }
  const sourceIds = new Set();
  const sourceTypes = new Map();
  const publishers = new Set();
  const sourceFactRefs = [];
  sources.forEach((source, index) => {
    const path = `$.source_register[${index}]`;
    if (!isObject(source)) {
      errors.push(issue("SOURCE_TYPE", path, "Source entry must be an object."));
      return;
    }
    const sourceId = pystrip(strField(get(source, "id")));
    if (!sourceId) {
      errors.push(issue("SOURCE_ID", `${path}.id`, "Source ID is required."));
    } else if (sourceIds.has(sourceId)) {
      errors.push(issue("DUPLICATE_SOURCE_ID", `${path}.id`, `Duplicate source ID ${sourceId}.`));
    }
    sourceIds.add(sourceId);
    const sourceType = strField(get(source, "source_type"));
    sourceTypes.set(sourceId, sourceType);
    const publisher = pystrip(strField(get(source, "publisher"))).toLowerCase();
    if (publisher) {
      publishers.add(publisher);
    }
    for (const key of ["publisher", "source_type", "observed_at", "access"]) {
      if (!pystrip(strField(get(source, key)))) {
        errors.push(issue("SOURCE_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    if (!pystrip(strField(get(source, "url"))) && !pystrip(strField(get(source, "locator")))) {
      errors.push(issue("SOURCE_LOCATOR", path, "Source requires a URL or an authorized locator."));
    }
    if (sourceType && !SOURCE_TYPES.has(sourceType)) {
      errors.push(issue("SOURCE_TYPE_VALUE", `${path}.source_type`, "Unsupported source type."));
    }
    const access = get(source, "access");
    if (pyTruthy(access) && !ACCESS.has(access)) {
      errors.push(issue("SOURCE_ACCESS", `${path}.access`, "Unsupported access boundary."));
    }
    const title = get(source, "title");
    if (title !== null && title !== undefined && !isNonemptyString(title)) {
      errors.push(issue("SOURCE_TITLE", `${path}.title`, "Source title must be non-empty when supplied."));
    }
    const isEventAnchor = EVENT_ANCHOR_SOURCE_TYPES.has(sourceType);
    if (isEventAnchor) {
      if (!isNonemptyString(title)) {
        errors.push(issue("EVENT_ANCHOR_TITLE", `${path}.title`, "News and company-release anchors require a title."));
      }
      if (!isPublicHttpUrl(get(source, "url"))) {
        errors.push(issue("EVENT_ANCHOR_URL", `${path}.url`, "News and company-release anchors require a public HTTP(S) URL."));
      }
      if (access !== "public") {
        errors.push(issue("EVENT_ANCHOR_ACCESS", `${path}.access`, "News and company-release anchors must be public."));
      }
      if (!isNonemptyString(get(source, "publisher"))) {
        errors.push(issue("EVENT_ANCHOR_PUBLISHER", `${path}.publisher`, "News and company-release anchors require a publisher."));
      }
      if (!isDatetime(get(source, "published_at"))) {
        errors.push(issue("EVENT_ANCHOR_PUBLISHED_AT", `${path}.published_at`, "News and company-release anchors require an ISO date-time published_at."));
      }
      const factRefs = get(source, "fact_refs");
      if (!Array.isArray(factRefs) || strings(factRefs).length === 0) {
        errors.push(issue("EVENT_ANCHOR_FACT_REFS", `${path}.fact_refs`, "News and company-release anchors require fact refs."));
      } else if (
        factRefs.length !== new Set(strings(factRefs)).size ||
        strings(factRefs).length !== factRefs.length
      ) {
        errors.push(issue("EVENT_ANCHOR_FACT_REFS", `${path}.fact_refs`, "Anchor fact refs must be unique non-empty strings."));
      }
    }
    if (isEventAnchor || Object.hasOwn(source, "fact_refs")) {
      sourceFactRefs.push([path, sourceId, get(source, "fact_refs"), isEventAnchor]);
    }
  });

  let facts = get(item, "fact_ledger");
  if (!Array.isArray(facts)) {
    errors.push(issue("FACT_LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array."));
    facts = [];
  }
  const factIds = new Set();
  const factClasses = new Map();
  const factFreshness = new Set();
  const factSourceIds = new Map();
  facts.forEach((fact, index) => {
    const path = `$.fact_ledger[${index}]`;
    if (!isObject(fact)) {
      errors.push(issue("FACT_TYPE", path, "Fact entry must be an object."));
      return;
    }
    const factId = pystrip(strField(get(fact, "id")));
    if (!factId) {
      errors.push(issue("FACT_ID", `${path}.id`, "Fact ID is required."));
    } else if (factIds.has(factId)) {
      errors.push(issue("DUPLICATE_FACT_ID", `${path}.id`, `Duplicate fact ID ${factId}.`));
    }
    factIds.add(factId);
    const evidenceClass = get(fact, "evidence_class");
    factClasses.set(factId, strField(evidenceClass));
    if (!EVIDENCE_CLASSES.has(evidenceClass)) {
      errors.push(issue("EVIDENCE_CLASS", `${path}.evidence_class`, "Unsupported evidence class."));
    }
    if (!FRESHNESS.has(get(fact, "freshness"))) {
      errors.push(issue("FRESHNESS", `${path}.freshness`, "Unsupported freshness state."));
    } else {
      factFreshness.add(fact.freshness);
    }
    if (!CONFIDENCE.has(get(fact, "confidence"))) {
      errors.push(issue("FACT_CONFIDENCE", `${path}.confidence`, "Unsupported fact confidence."));
    }
    if (!pystrip(strField(get(fact, "claim")))) {
      errors.push(issue("FACT_CLAIM", `${path}.claim`, "Fact claim is required."));
    }
    const refs = get(fact, "source_ids");
    factSourceIds.set(factId, new Set(strings(refs)));
    addBadRefs(errors, refs, sourceIds, `${path}.source_ids`, "SOURCE");
    if ((evidenceClass === "source" || evidenceClass === "verified-live") && strings(refs).length === 0) {
      errors.push(issue("FACT_SOURCE_REQUIRED", `${path}.source_ids`, "Source and live facts require a source."));
    }
    if ((evidenceClass === "verified-live" || get(fact, "freshness") === "current") && !pyTruthy(get(fact, "as_of"))) {
      errors.push(issue("FACT_TIMESTAMP_REQUIRED", `${path}.as_of`, "Current and live facts require as_of."));
    }
    if (evidenceClass === "verified-live" && strings(refs).length > 0) {
      if (!refs.some((ref) => LIVE_SOURCE_TYPES.has(sourceTypes.get(ref)))) {
        warnings.push(issue("LIVE_SOURCE_CLASS", `${path}.source_ids`, "Live fact lacks a market, exchange, official, or consensus data source."));
      }
    }
    if ((evidenceClass === "derived" || evidenceClass === "hypothesis") && strings(refs).length === 0) {
      warnings.push(issue("UNGROUNDED_INFERENCE", `${path}.source_ids`, "Inference has no registered source inputs."));
    }
  });

  for (const [sourcePath, sourceId, refs, isEventAnchor] of sourceFactRefs) {
    const refPath = `${sourcePath}.fact_refs`;
    addBadRefs(errors, refs, factIds, refPath, "FACT");
    if (isEventAnchor) {
      for (const ref of strings(refs)) {
        const cited = factSourceIds.get(ref) || new Set();
        if (!cited.has(sourceId)) {
          errors.push(issue("EVENT_ANCHOR_FACT_LINK", refPath, `Fact ${pyrepr(ref)} does not cite source ${pyrepr(sourceId)}.`));
        }
      }
    }
  }

  let comparators = get(item, "comparator_table");
  if (!Array.isArray(comparators)) {
    errors.push(issue("COMPARATOR_TYPE", "$.comparator_table", "comparator_table must be an array."));
    comparators = [];
  }
  comparators.forEach((comparator, index) => {
    const path = `$.comparator_table[${index}]`;
    if (!isObject(comparator)) {
      errors.push(issue("COMPARATOR_ENTRY", path, "Comparator must be an object."));
      return;
    }
    const evidenceIds = get(comparator, "evidence_ids");
    addBadRefs(errors, evidenceIds, factIds, `${path}.evidence_ids`, "FACT");
    const valueEvidence = get(comparator, "value_evidence");
    const allValueRefs = new Set();
    if (!isObject(valueEvidence)) {
      errors.push(issue("COMPARATOR_VALUE_EVIDENCE", `${path}.value_evidence`, "Comparator requires value-level evidence."));
    } else {
      for (const valueName of ["actual", "consensus", "prior"]) {
        const refs = get(valueEvidence, valueName);
        const refPath = `${path}.value_evidence.${valueName}`;
        addBadRefs(errors, refs, factIds, refPath, "FACT");
        const validRefs = strings(refs);
        for (const ref of validRefs) allValueRefs.add(ref);
        if (get(comparator, valueName) !== null && get(comparator, valueName) !== undefined) {
          if (validRefs.length === 0) {
            errors.push(issue("COMPARATOR_VALUE_SOURCE", refPath, `Populated ${valueName} requires evidence.`));
          } else if (validRefs.some((ref) => factClasses.get(ref) !== "source" && factClasses.get(ref) !== "verified-live")) {
            errors.push(issue("COMPARATOR_EVIDENCE_CLASS", refPath, `Populated ${valueName} must use sourced or verified-live facts.`));
          }
        } else if (validRefs.length > 0) {
          warnings.push(issue("COMPARATOR_NULL_EVIDENCE", refPath, `Null ${valueName} should not retain evidence references.`));
        }
      }
    }
    const declaredRefs = new Set(strings(evidenceIds));
    const sameRefs = declaredRefs.size === allValueRefs.size && [...declaredRefs].every((ref) => allValueRefs.has(ref));
    if (!sameRefs) {
      errors.push(issue("COMPARATOR_EVIDENCE_MISMATCH", `${path}.evidence_ids`, "Comparator evidence_ids must equal the union of value_evidence references."));
    }
    const valuesPresent = ["actual", "consensus", "prior"].filter((key) => {
      const value = get(comparator, key);
      return value !== null && value !== undefined;
    }).length;
    if (valuesPresent < 2) {
      warnings.push(issue("COMPARATOR_THIN", path, "Comparator has fewer than two populated reference values."));
    }
  });

  let context = get(item, "market_context");
  if (!isObject(context)) {
    errors.push(issue("MARKET_CONTEXT_TYPE", "$.market_context", "market_context must be an object."));
    context = {};
  }
  for (const section of [...CONTEXT_SECTIONS].sort()) {
    const entries = get(context, section);
    if (!Array.isArray(entries)) {
      errors.push(issue("CONTEXT_SECTION", `$.market_context.${section}`, "Context section must be an array."));
      continue;
    }
    entries.forEach((entry, index) => {
      const path = `$.market_context.${section}[${index}]`;
      if (!isObject(entry)) {
        errors.push(issue("CONTEXT_ENTRY", path, "Market context entry must be an object."));
        return;
      }
      addBadRefs(errors, get(entry, "evidence_ids"), factIds, `${path}.evidence_ids`, "FACT");
      if (!pyTruthy(get(entry, "as_of"))) {
        errors.push(issue("CONTEXT_TIMESTAMP", `${path}.as_of`, "Market context requires as_of."));
      }
      if (!pystrip(strField(get(entry, "data_delay")))) {
        errors.push(issue("DATA_DELAY", `${path}.data_delay`, "Market context requires data_delay."));
      }
      if (section === "valuation") {
        for (const key of [
          "subject",
          "label",
          "unit",
          "numerator",
          "denominator",
          "period",
          "accounting_basis",
          "currency_treatment",
          "share_class",
        ]) {
          if (!isNonemptyString(get(entry, key))) {
            errors.push(issue("VALUATION_FIELD", `${path}.${key}`, `Valuation metric requires ${key}.`));
          }
        }
        if (!isDatetime(get(entry, "as_of"))) {
          errors.push(issue("VALUATION_AS_OF", `${path}.as_of`, "Valuation metric requires an ISO date-time as_of."));
        }
        const valueState = get(entry, "value_state");
        if (!VALUATION_VALUE_STATES.has(valueState)) {
          errors.push(issue("VALUATION_VALUE_STATE", `${path}.value_state`, "Valuation value_state must be numeric or N/M."));
        }
        const comparability = get(entry, "comparability");
        if (!VALUATION_COMPARABILITY.has(comparability)) {
          errors.push(issue("VALUATION_COMPARABILITY", `${path}.comparability`, "Unsupported valuation comparability state."));
        }
        const sourceRefs = get(entry, "source_refs");
        addBadRefs(errors, sourceRefs, sourceIds, `${path}.source_refs`, "SOURCE");
        if (strings(sourceRefs).length === 0) {
          errors.push(issue("VALUATION_SOURCE_REQUIRED", `${path}.source_refs`, "Valuation metrics require source refs."));
        } else if (
          sourceRefs.length !== new Set(strings(sourceRefs)).size ||
          strings(sourceRefs).length !== sourceRefs.length
        ) {
          errors.push(issue("VALUATION_SOURCE_REFS", `${path}.source_refs`, "Valuation source refs must be unique non-empty strings."));
        }
        if (!Object.hasOwn(entry, "not_meaningful_reason")) {
          errors.push(issue("VALUATION_NM_REASON", `${path}.not_meaningful_reason`, "Valuation metrics must carry not_meaningful_reason."));
        }
        if (!Object.hasOwn(entry, "value")) {
          errors.push(issue("VALUATION_VALUE", `${path}.value`, "Valuation metrics must carry value, using null for N/M."));
        }
        const reason = get(entry, "not_meaningful_reason");
        if (valueState === "numeric") {
          if (!isFiniteNumber(get(entry, "value"))) {
            errors.push(issue("VALUATION_NUMERIC_VALUE", `${path}.value`, "Numeric valuation state requires a finite number."));
          }
          if (reason !== null && reason !== undefined) {
            errors.push(issue("VALUATION_NM_REASON", `${path}.not_meaningful_reason`, "Numeric valuation state requires a null N/M reason."));
          }
        } else if (valueState === "N/M") {
          if (get(entry, "value") !== null && get(entry, "value") !== undefined) {
            errors.push(issue("VALUATION_NM_VALUE", `${path}.value`, "N/M valuation state requires a null numeric value."));
          }
          if (!isNonemptyString(reason)) {
            errors.push(issue("VALUATION_NM_REASON", `${path}.not_meaningful_reason`, "N/M valuation state requires a reason."));
          }
          if (comparability === "comparable") {
            errors.push(issue("VALUATION_NM_COMPARABILITY", `${path}.comparability`, "An N/M metric cannot be marked comparable."));
          }
        }
      }
    });
  }

  let thesis = get(item, "thesis");
  if (!isObject(thesis)) {
    errors.push(issue("THESIS_TYPE", "$.thesis", "thesis must be an object."));
    thesis = {};
  }
  for (const key of ["claim", "horizon", "invalidation"]) {
    if (!pystrip(strField(get(thesis, key)))) {
      errors.push(issue("THESIS_FIELD", `$.thesis.${key}`, `${key} is required.`));
    }
  }
  if (!STANCES.has(get(thesis, "stance"))) {
    errors.push(issue("THESIS_STANCE", "$.thesis.stance", "Unsupported thesis stance."));
  }
  if (!CONFIDENCE.has(get(thesis, "confidence"))) {
    errors.push(issue("THESIS_CONFIDENCE", "$.thesis.confidence", "Unsupported thesis confidence."));
  }
  addBadRefs(errors, get(thesis, "evidence_ids"), factIds, "$.thesis.evidence_ids", "FACT");
  addBadRefs(errors, get(thesis, "counterevidence_ids"), factIds, "$.thesis.counterevidence_ids", "FACT");
  const mechanisms = get(thesis, "mechanisms");
  if (!Array.isArray(mechanisms)) {
    errors.push(issue("MECHANISMS_TYPE", "$.thesis.mechanisms", "mechanisms must be an array."));
  } else {
    mechanisms.forEach((mechanism, index) => {
      const path = `$.thesis.mechanisms[${index}]`;
      if (!isObject(mechanism)) {
        errors.push(issue("MECHANISM_ENTRY", path, "Mechanism must be an object."));
        return;
      }
      addBadRefs(errors, get(mechanism, "evidence_ids"), factIds, `${path}.evidence_ids`, "FACT");
    });
  }

  let scenarios = get(item, "scenarios");
  if (!Array.isArray(scenarios)) {
    errors.push(issue("SCENARIOS_TYPE", "$.scenarios", "scenarios must be an array."));
    scenarios = [];
  }
  scenarios.forEach((scenario, index) => {
    const path = `$.scenarios[${index}]`;
    if (!isObject(scenario)) {
      errors.push(issue("SCENARIO_ENTRY", path, "Scenario must be an object."));
      return;
    }
    addBadRefs(errors, get(scenario, "evidence_ids"), factIds, `${path}.evidence_ids`, "FACT");
    if (!pystrip(strField(get(scenario, "invalidation")))) {
      errors.push(issue("SCENARIO_INVALIDATION", `${path}.invalidation`, "Scenario requires invalidation."));
    }
  });

  const catalysts = get(item, "catalysts");
  if (!Array.isArray(catalysts)) {
    errors.push(issue("CATALYSTS_TYPE", "$.catalysts", "catalysts must be an array."));
  } else {
    catalysts.forEach((catalyst, index) => {
      const path = `$.catalysts[${index}]`;
      if (!isObject(catalyst)) {
        errors.push(issue("CATALYST_ENTRY", path, "Catalyst must be an object."));
        return;
      }
      addBadRefs(errors, get(catalyst, "evidence_ids"), factIds, `${path}.evidence_ids`, "FACT");
    });
  }

  let quality = get(item, "quality_report");
  if (!isObject(quality)) {
    errors.push(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."));
    quality = {};
  }
  const decision = get(quality, "decision");
  if (!["ready", "conditional", "blocked"].includes(decision)) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  }
  if (!DATA_FRESHNESS.has(get(quality, "data_freshness"))) {
    errors.push(issue("QUALITY_FRESHNESS", "$.quality_report.data_freshness", "Unsupported data freshness."));
  }
  const hardFailures = strings(get(quality, "hard_failures"));
  if (hardFailures.length > 0 && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_STATE", "$.quality_report", "Hard failures require a blocked decision."));
  }
  if (decision === "ready" && (sources.length === 0 || facts.length === 0)) {
    errors.push(issue("READY_WITHOUT_EVIDENCE", "$.quality_report.decision", "Ready packs require sources and facts."));
  }
  if (
    decision === "ready" &&
    !strings(get(thesis, "evidence_ids")).some((ref) => {
      const evidenceClass = factClasses.get(ref);
      return evidenceClass === "source" || evidenceClass === "verified-live";
    })
  ) {
    errors.push(issue("READY_WITHOUT_SOURCED_THESIS", "$.thesis.evidence_ids", "A ready thesis requires sourced or verified-live evidence."));
  }
  if (decision === "ready" && ["positive", "negative", "mixed"].includes(get(thesis, "stance"))) {
    if (strings(get(thesis, "counterevidence_ids")).length === 0) {
      errors.push(issue("READY_WITHOUT_COUNTEREVIDENCE", "$.thesis.counterevidence_ids", "A ready directional thesis requires counterevidence."));
    }
    if (scenarios.length < 2) {
      errors.push(issue("READY_WITHOUT_SCENARIOS", "$.scenarios", "A ready directional thesis requires at least two scenarios."));
    }
  }
  if (decision === "ready" && get(brief, "decision_use") === "trade_watch" && !pyTruthy(get(context, "liquidity"))) {
    errors.push(issue("TRADE_LIQUIDITY_MISSING", "$.market_context.liquidity", "A ready trade watch requires liquidity context."));
  }

  const computedPrimary = [...sourceIds].some((sourceId) => PRIMARY_SOURCE_TYPES.has(sourceTypes.get(sourceId)));
  const computedLive = [...sourceIds].some((sourceId) => LIVE_SOURCE_TYPES.has(sourceTypes.get(sourceId)));
  const computedFreshness =
    factFreshness.size === 0 ? "unknown" : factFreshness.size === 1 ? [...factFreshness][0] : "mixed";
  if (DATA_FRESHNESS.has(get(quality, "data_freshness")) && get(quality, "data_freshness") !== computedFreshness) {
    errors.push(issue("DATA_FRESHNESS_MISMATCH", "$.quality_report.data_freshness", `Expected ${pyrepr(computedFreshness)} from the fact ledger.`));
  }
  const coverage = get(quality, "source_coverage");
  if (!isObject(coverage)) {
    errors.push(issue("SOURCE_COVERAGE_TYPE", "$.quality_report.source_coverage", "source_coverage must be an object."));
  } else {
    const expected = {
      primary_source_present: computedPrimary,
      live_market_data_present: computedLive,
      independent_sources: publishers.size,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (!pyEq(get(coverage, key), value)) {
        errors.push(issue("SOURCE_COVERAGE_MISMATCH", `$.quality_report.source_coverage.${key}`, `Expected ${pyrepr(value)}.`));
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePayload(payload) {
  return Array.isArray(payload) ? payload.map((item) => validate(item)) : validate(payload);
}

export function allValid(result) {
  const rows = Array.isArray(result) ? result : [result];
  return rows.every((row) => pyTruthy(row.valid));
}

function main() {
  const argv = process.argv.slice(2);
  const positionals = [];
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write("usage: validate_research_pack.mjs [json_file]\n\nValidate Cuebook ResearchPackV1 artifacts\n");
      process.exit(0);
    }
    if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`usage: validate_research_pack.mjs [json_file]\nvalidate_research_pack.mjs: error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    }
    positionals.push(arg);
  }
  if (positionals.length > 1) {
    process.stderr.write(`usage: validate_research_pack.mjs [json_file]\nvalidate_research_pack.mjs: error: unrecognized arguments: ${positionals.slice(1).join(" ")}\n`);
    process.exit(2);
  }
  const raw = positionals.length === 1 ? readFileSync(positionals[0], "utf-8") : readFileSync(0, "utf-8");
  const result = validatePayload(pyJsonLoads(raw));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = allValid(result) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
