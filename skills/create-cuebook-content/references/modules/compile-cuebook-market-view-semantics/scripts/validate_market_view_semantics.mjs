#!/usr/bin/env node
// Validate MarketViewSemanticsV1 artifacts without third-party dependencies.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESCRIPTION = "Validate MarketViewSemanticsV1 artifacts without third-party dependencies.";

const ROOT_FIELDS = new Set([
  "schema_version",
  "semantics_id",
  "revision",
  "state",
  "lineage",
  "speakers",
  "current_creator_ref",
  "source_units",
  "source_completeness",
  "subjects",
  "claims",
  "primary_claim_ref",
  "causal_links",
  "feedback_loops",
  "posture",
  "horizon",
  "proprietary_signal",
  "resolution",
  "quality_report",
]);

const SPEAKER_ROLES = new Set(["source_author", "current_creator", "quoted_witness", "researcher", "unknown"]);
const SOURCE_ROLES = new Set([
  "primary_view",
  "quoted_view",
  "supporting_evidence",
  "counterevidence",
  "context",
  "creator_instruction",
  "methodology",
]);
const SOURCE_PRIMITIVES = new Set([
  "official_event",
  "market_data",
  "flow_positioning",
  "on_chain",
  "social_sentiment",
  "structural_thesis",
  "sell_side_expectation",
  "technical_structure",
  "proprietary_factor",
  "methodology",
  "creator_input",
  "unknown",
]);
const SOURCE_COMPLETENESS = new Set(["complete", "excerpted", "truncated", "summary_only", "unavailable", "unknown"]);
const SUBJECT_TYPES = new Set([
  "equity",
  "index",
  "crypto_asset",
  "commodity",
  "currency",
  "fund",
  "derivative",
  "company",
  "sector",
  "venue",
  "technology",
  "policy",
  "event",
  "metric",
  "signal",
  "person",
  "cohort",
  "flow",
  "market_state",
  "geography",
  "concept",
  "other",
]);
const CLAIM_ROLES = new Set(["primary", "supporting", "caveat", "counterclaim", "trigger", "resolution"]);
const SPEECH_ACTS = new Set([
  "market_observation",
  "causal_explanation",
  "forecast",
  "trade_intent",
  "trade_report",
  "trade_recommendation",
  "conditional_trade",
  "risk_warning",
  "sentiment_witness",
  "category_reframe",
  "valuation_judgment",
  "question",
]);
const TRADE_SPEECH_ACTS = new Set(["trade_intent", "trade_report", "trade_recommendation", "conditional_trade"]);
const RHETORICAL_MOVES = new Set([
  "bad_news_absorption",
  "parallel_realities",
  "category_reframing",
  "headline_vs_price",
  "policy_pivot",
  "capitulation_testimony",
  "event_crowding_unwind",
  "feedback_loop_explainer",
  "technical_meme_warning",
  "expectation_reset",
  "proprietary_factor_rotation",
  "direct_observation",
  "causal_chain",
  "comparison",
  "caveat",
  "none",
]);
const OWNERSHIP_MODES = new Set(["source_only", "current_creator", "adopted", "shared", "unattributed"]);
const ADOPTION_STATES = new Set(["none", "reported", "adopted", "qualified", "rejected", "not_applicable"]);
const SURFACE_VOICES = new Set(["source_third_person", "current_creator_first_person", "quoted_first_person", "neutral"]);
const CERTAINTIES = new Set(["certain", "likely", "possible", "speculative", "unspecified"]);
const EVIDENCE_BASES = new Set([
  "direct_observation",
  "official_record",
  "market_data",
  "firsthand_witness",
  "reported_source",
  "multi_source_synthesis",
  "proprietary_model",
  "inference",
  "none",
]);
const EVIDENCE_BREADTHS = new Set([
  "individual",
  "cohort",
  "instrument",
  "venue",
  "sector",
  "cross_asset",
  "market_wide",
  "structural",
  "unspecified",
]);
const CAUSAL_RELATIONS = new Set([
  "causes",
  "amplifies",
  "dampens",
  "enables",
  "triggers",
  "constrains",
  "signals",
  "reprices",
  "precedes",
  "conditions",
]);
const POSTURE_ACTIONS = new Set([
  "long",
  "short",
  "outperform",
  "underperform",
  "rotate",
  "buy_dips",
  "sell_rallies",
  "hold",
  "avoid",
  "wait",
  "observe",
  "exit",
  "neutral",
]);
const TRADE_ACTIONS = new Set([...POSTURE_ACTIONS].filter((item) => !["wait", "observe", "neutral"].includes(item)));
const TRADE_LEG_ROLES = new Set(["primary", "comparator", "hedge", "from_leg", "to_leg"]);
const TRADE_DIRECTIONS = new Set([
  "long",
  "short",
  "buy",
  "sell",
  "hold",
  "avoid",
  "exit",
  "outperform",
  "underperform",
  "neutral",
]);
const HORIZON_KINDS = new Set(["unspecified", "instant", "window", "duration", "event_bound", "structural"]);
const HORIZON_PRECISIONS = new Set(["none", "exact", "bounded", "approximate", "qualitative"]);
const DURATION_UNITS = new Set(["minutes", "hours", "days", "weeks", "months", "quarters", "years"]);
const EVENT_BOUND_SUBJECT_TYPES = new Set(["policy", "event", "metric", "signal", "flow", "market_state"]);
const FORMULA_OPERATORS = new Set(["ratio", "difference", "sum", "product", "weighted_composite", "custom"]);
const FORMULA_INPUT_ROLES = new Set(["numerator", "denominator", "term", "weight", "filter"]);

// --- Python parity helpers -------------------------------------------------

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// dict.get(key, default) — JSON.parse never produces undefined values.
function pyGet(obj, key, dflt = null) {
  if (isDict(obj) && Object.hasOwn(obj, key) && obj[key] !== undefined) return obj[key];
  return dflt;
}

// Python str.strip() whitespace set (differs from JS trim: no U+FEFF, adds \x1c-\x1f and \x85).
const PY_STRIP_RE = new RegExp(
  "^[\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+" +
  "|[\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+$",
  "g",
);

function pyStrip(value) {
  return value.replace(PY_STRIP_RE, "");
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// Reproduce Python repr() for the JSON value types that appear in messages.
function pyrepr(value) {
  if (value === null || value === undefined) return "None";
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

// Python str() for JSON values.
function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return pyrepr(value);
}

// Python `needle in container` for raw payload containers.
function pyIn(needle, container) {
  if (Array.isArray(container)) return container.some((item) => item === needle);
  if (typeof container === "string") return typeof needle === "string" && container.includes(needle);
  if (isDict(container)) return Object.hasOwn(container, needle);
  throw new TypeError(`argument of type ${pyrepr(container)} is not iterable`);
}

// Python `for x in value` where value came from dict.get(..., []).
function pyIterList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [...value];
  throw new TypeError("object is not iterable");
}

// --- datetime.fromisoformat parity -----------------------------------------

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function parseTimeComponent(text) {
  let match = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!match) match = /^(\d{2})(?:(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  let microsecond = 0;
  if (match[4] !== undefined) microsecond = Number((match[4] + "000000").slice(0, 6));
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second, microsecond };
}

// Emulates datetime.fromisoformat (CPython 3.11+) for calendar dates; returns
// { total: BigInt epoch microseconds, hasTz: boolean } or null on ValueError.
// ISO week dates (e.g. 2026-W29-4) are not supported.
function fromisoformat(text) {
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  let dateLength = 10;
  if (!match) {
    match = /^(\d{4})(\d{2})(\d{2})/.exec(text);
    dateLength = 8;
  }
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const rest = text.slice(dateLength);
  let time = { hour: 0, minute: 0, second: 0, microsecond: 0 };
  let offsetUs = null;
  if (rest.length) {
    const timeText = rest.slice(1); // any single separator character
    if (!timeText.length) return null;
    let tzIndex = -1;
    for (let i = 0; i < timeText.length; i += 1) {
      if (timeText[i] === "+" || timeText[i] === "-") {
        tzIndex = i;
        break;
      }
    }
    const clock = parseTimeComponent(tzIndex === -1 ? timeText : timeText.slice(0, tzIndex));
    if (!clock) return null;
    time = clock;
    if (tzIndex !== -1) {
      const sign = timeText[tzIndex] === "-" ? -1 : 1;
      const offset = parseTimeComponent(timeText.slice(tzIndex + 1));
      if (!offset) return null;
      offsetUs = sign * ((offset.hour * 3600 + offset.minute * 60 + offset.second) * 1e6 + offset.microsecond);
    }
  }
  const dayUs = (time.hour * 3600 + time.minute * 60 + time.second) * 1e6 + time.microsecond;
  const total = BigInt(daysFromCivil(year, month, day)) * 86400000000n + BigInt(dayUs) - BigInt(offsetUs ?? 0);
  return { total, hasTz: offsetUs !== null };
}

// --- validator --------------------------------------------------------------

export function issue(code, path, message) {
  return { code, path, message };
}

export function nonempty(value) {
  return typeof value === "string" && pyStrip(value).length > 0;
}

function check_shape(value, path, required, allowed, errors) {
  if (!isDict(value)) {
    errors.push(issue("OBJECT", path, "Expected an object."));
    return {};
  }
  const requiredSet = new Set(required);
  const allowedSet = new Set(allowed);
  const keys = new Set(Object.keys(value));
  for (const key of [...requiredSet].filter((item) => !keys.has(item)).sort()) {
    errors.push(issue("MISSING_FIELD", `${path}.${key}`, "Required field is missing."));
  }
  for (const key of [...keys].filter((item) => !allowedSet.has(item)).sort()) {
    errors.push(issue("UNKNOWN_FIELD", `${path}.${key}`, "Unknown field."));
  }
  return value;
}

function object_list(value, path, errors, { minimum = 0 } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("ARRAY", path, "Expected an array."));
    return [];
  }
  if (value.length < minimum) {
    errors.push(issue("ARRAY_MIN", path, `Expected at least ${minimum} item(s).`));
  }
  return value;
}

function string_list(value, path, errors, { minimum = 0 } = {}) {
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
  if (result.length !== new Set(result).size) {
    errors.push(issue("STRING_UNIQUE", path, "Strings must be unique."));
  }
  if (result.length < minimum) {
    errors.push(issue("STRING_MIN", path, `Expected at least ${minimum} item(s).`));
  }
  return result;
}

function nullable_string(value, path, errors) {
  if (value === null || value === undefined) return null;
  if (!nonempty(value)) {
    errors.push(issue("NULLABLE_STRING", path, "Expected null or a non-empty string."));
    return null;
  }
  return pyStrip(value);
}

function enum_value(value, allowed, path, errors, code = "ENUM") {
  if (!(typeof value === "string" && allowed.has(value))) {
    errors.push(issue(code, path, `Unsupported value: ${pyrepr(value)}.`));
  }
  return value === undefined ? null : value;
}

function parse_datetime(value, path, errors, { nullable = false } = {}) {
  if ((value === null || value === undefined) && nullable) return null;
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = fromisoformat(value.replaceAll("Z", "+00:00"));
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

function check_refs(refs, index, path, errors, code) {
  refs.forEach((ref, position) => {
    if (!index.has(ref)) {
      errors.push(issue(code, `${path}[${position}]`, `Unknown reference: ${ref}.`));
    }
  });
}

function register_id(index, identifier, value, path, errors) {
  if (!nonempty(identifier)) {
    errors.push(issue("ID", path, "Expected a non-empty identifier."));
    return null;
  }
  const normalized = pyStrip(identifier);
  if (index.has(normalized)) {
    errors.push(issue("DUPLICATE_ID", path, `Duplicate identifier: ${normalized}.`));
    return null;
  }
  index.set(normalized, value);
  return normalized;
}

function aggregate_completeness(statuses) {
  if (statuses.length && statuses.every((status) => status === "complete")) return "complete";
  if (statuses.length && statuses.every((status) => status === "unknown")) return "unknown";
  if (statuses.some((status) => status === "complete")) return "mixed";
  return "incomplete";
}

function validate_lineage(payload, errors) {
  const fields = ["input_artifact_refs", "source_document_refs", "compiled_at"];
  const value = check_shape(payload, "$.lineage", fields, fields, errors);
  string_list(pyGet(value, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors, { minimum: 1 });
  string_list(pyGet(value, "source_document_refs"), "$.lineage.source_document_refs", errors, { minimum: 1 });
  parse_datetime(pyGet(value, "compiled_at"), "$.lineage.compiled_at", errors);
}

function validate_speakers(payload, errors) {
  const speakers = new Map();
  const source_refs = new Map();
  const fields = ["speaker_id", "label", "role", "source_unit_refs"];
  object_list(payload, "$.speakers", errors, { minimum: 1 }).forEach((raw, index) => {
    const path = `$.speakers[${index}]`;
    const speaker = check_shape(raw, path, fields, fields, errors);
    const speaker_id = register_id(speakers, pyGet(speaker, "speaker_id"), speaker, `${path}.speaker_id`, errors);
    if (!nonempty(pyGet(speaker, "label"))) {
      errors.push(issue("SPEAKER_LABEL", `${path}.label`, "Speaker label is required."));
    }
    enum_value(pyGet(speaker, "role"), SPEAKER_ROLES, `${path}.role`, errors, "SPEAKER_ROLE");
    const refs = string_list(pyGet(speaker, "source_unit_refs"), `${path}.source_unit_refs`, errors);
    if (speaker_id) source_refs.set(speaker_id, refs);
  });
  return [speakers, source_refs];
}

function validate_source_units(payload, speakers, errors) {
  const units = new Map();
  const claim_refs = new Map();
  const statuses = [];
  const fields = [
    "source_unit_id",
    "locator",
    "role",
    "primitive",
    "speaker_ref",
    "completeness",
    "claim_refs",
    "notes",
  ];
  object_list(payload, "$.source_units", errors, { minimum: 1 }).forEach((raw, index) => {
    const path = `$.source_units[${index}]`;
    const unit = check_shape(raw, path, fields, fields, errors);
    const unit_id = register_id(units, pyGet(unit, "source_unit_id"), unit, `${path}.source_unit_id`, errors);
    if (!nonempty(pyGet(unit, "locator"))) {
      errors.push(issue("SOURCE_LOCATOR", `${path}.locator`, "Source locator is required."));
    }
    enum_value(pyGet(unit, "role"), SOURCE_ROLES, `${path}.role`, errors, "SOURCE_ROLE");
    enum_value(pyGet(unit, "primitive"), SOURCE_PRIMITIVES, `${path}.primitive`, errors, "SOURCE_PRIMITIVE");
    const speaker_ref = nullable_string(pyGet(unit, "speaker_ref"), `${path}.speaker_ref`, errors);
    if (speaker_ref !== null && !speakers.has(speaker_ref)) {
      errors.push(issue("SOURCE_SPEAKER_REF", `${path}.speaker_ref`, `Unknown speaker: ${speaker_ref}.`));
    }
    const completeness = enum_value(
      pyGet(unit, "completeness"),
      SOURCE_COMPLETENESS,
      `${path}.completeness`,
      errors,
      "SOURCE_COMPLETENESS",
    );
    if (typeof completeness === "string" && SOURCE_COMPLETENESS.has(completeness)) {
      statuses.push(completeness);
    }
    const refs = string_list(pyGet(unit, "claim_refs"), `${path}.claim_refs`, errors, { minimum: 1 });
    nullable_string(pyGet(unit, "notes"), `${path}.notes`, errors);
    if (unit_id) claim_refs.set(unit_id, refs);
  });
  return [units, claim_refs, statuses];
}

function validate_source_completeness(payload, statuses, errors, warnings) {
  const fields = ["overall", "missing_context"];
  const value = check_shape(payload, "$.source_completeness", fields, fields, errors);
  const OVERALL = new Set(["complete", "mixed", "incomplete", "unknown"]);
  const overall = enum_value(
    pyGet(value, "overall"),
    OVERALL,
    "$.source_completeness.overall",
    errors,
    "OVERALL_COMPLETENESS",
  );
  string_list(pyGet(value, "missing_context"), "$.source_completeness.missing_context", errors);
  const expected = aggregate_completeness(statuses);
  if (typeof overall === "string" && OVERALL.has(overall) && overall !== expected) {
    errors.push(
      issue(
        "COMPLETENESS_AGGREGATE",
        "$.source_completeness.overall",
        `Expected ${pyrepr(expected)} from source-unit completeness, received ${pyrepr(overall)}.`,
      ),
    );
  }
  if (expected !== "complete") {
    warnings.push(
      issue(
        "SOURCE_INCOMPLETE",
        "$.source_completeness.overall",
        `Source inventory is ${expected}; preserve this boundary downstream.`,
      ),
    );
  }
}

function validate_subjects(payload, source_units, errors) {
  const subjects = new Map();
  const fields = ["subject_id", "label", "type", "canonical_id", "venue", "source_unit_refs"];
  object_list(payload, "$.subjects", errors, { minimum: 1 }).forEach((raw, index) => {
    const path = `$.subjects[${index}]`;
    const subject = check_shape(raw, path, fields, fields, errors);
    register_id(subjects, pyGet(subject, "subject_id"), subject, `${path}.subject_id`, errors);
    if (!nonempty(pyGet(subject, "label"))) {
      errors.push(issue("SUBJECT_LABEL", `${path}.label`, "Subject label is required."));
    }
    enum_value(pyGet(subject, "type"), SUBJECT_TYPES, `${path}.type`, errors, "SUBJECT_TYPE");
    nullable_string(pyGet(subject, "canonical_id"), `${path}.canonical_id`, errors);
    nullable_string(pyGet(subject, "venue"), `${path}.venue`, errors);
    const refs = string_list(pyGet(subject, "source_unit_refs"), `${path}.source_unit_refs`, errors, { minimum: 1 });
    check_refs(refs, source_units, `${path}.source_unit_refs`, errors, "SUBJECT_SOURCE_REF");
  });
  return subjects;
}

function validate_claims(payload, speakers, current_creator_ref, source_units, subjects, errors) {
  const claims = new Map();
  const fields = [
    "claim_id",
    "role",
    "text",
    "source_unit_refs",
    "subject_refs",
    "speech_act",
    "rhetorical_move",
    "ownership",
    "certainty",
    "evidence_scope",
  ];
  const ownership_fields = ["mode", "origin_speaker_ref", "creator_adoption", "surface_voice"];
  const evidence_fields = ["basis", "breadth", "subject_refs", "limitations"];

  object_list(payload, "$.claims", errors, { minimum: 1 }).forEach((raw, index) => {
    const path = `$.claims[${index}]`;
    const claim = check_shape(raw, path, fields, fields, errors);
    register_id(claims, pyGet(claim, "claim_id"), claim, `${path}.claim_id`, errors);
    enum_value(pyGet(claim, "role"), CLAIM_ROLES, `${path}.role`, errors, "CLAIM_ROLE");
    if (!nonempty(pyGet(claim, "text"))) {
      errors.push(issue("CLAIM_TEXT", `${path}.text`, "Claim text is required."));
    }
    const source_refs = string_list(pyGet(claim, "source_unit_refs"), `${path}.source_unit_refs`, errors, { minimum: 1 });
    check_refs(source_refs, source_units, `${path}.source_unit_refs`, errors, "CLAIM_SOURCE_REF");
    const subject_refs = string_list(pyGet(claim, "subject_refs"), `${path}.subject_refs`, errors, { minimum: 1 });
    check_refs(subject_refs, subjects, `${path}.subject_refs`, errors, "CLAIM_SUBJECT_REF");
    const speech_act = enum_value(pyGet(claim, "speech_act"), SPEECH_ACTS, `${path}.speech_act`, errors, "SPEECH_ACT");
    enum_value(pyGet(claim, "rhetorical_move"), RHETORICAL_MOVES, `${path}.rhetorical_move`, errors, "RHETORICAL_MOVE");
    enum_value(pyGet(claim, "certainty"), CERTAINTIES, `${path}.certainty`, errors, "CERTAINTY");

    const ownership = check_shape(pyGet(claim, "ownership"), `${path}.ownership`, ownership_fields, ownership_fields, errors);
    const mode = enum_value(pyGet(ownership, "mode"), OWNERSHIP_MODES, `${path}.ownership.mode`, errors, "OWNERSHIP_MODE");
    const origin_ref = nullable_string(pyGet(ownership, "origin_speaker_ref"), `${path}.ownership.origin_speaker_ref`, errors);
    if (origin_ref !== null && !speakers.has(origin_ref)) {
      errors.push(issue("CLAIM_SPEAKER_REF", `${path}.ownership.origin_speaker_ref`, `Unknown speaker: ${origin_ref}.`));
    }
    const adoption = enum_value(
      pyGet(ownership, "creator_adoption"),
      ADOPTION_STATES,
      `${path}.ownership.creator_adoption`,
      errors,
      "CREATOR_ADOPTION",
    );
    const voice = enum_value(
      pyGet(ownership, "surface_voice"),
      SURFACE_VOICES,
      `${path}.ownership.surface_voice`,
      errors,
      "SURFACE_VOICE",
    );
    if (mode === "source_only") {
      if (origin_ref === null || origin_ref === current_creator_ref) {
        errors.push(
          issue(
            "SOURCE_ONLY_ORIGIN",
            `${path}.ownership.origin_speaker_ref`,
            "source_only requires a non-creator origin speaker.",
          ),
        );
      }
      if (!["none", "reported", "rejected"].includes(adoption)) {
        errors.push(
          issue(
            "SOURCE_ONLY_ADOPTION",
            `${path}.ownership.creator_adoption`,
            "source_only cannot be adopted or shared by the current creator.",
          ),
        );
      }
      if (voice === "current_creator_first_person") {
        errors.push(
          issue(
            "SOURCE_ONLY_CREATOR_VOICE",
            `${path}.ownership.surface_voice`,
            "source_only cannot render as current-creator first person.",
          ),
        );
      }
    }
    if (mode === "current_creator") {
      if (current_creator_ref === null || origin_ref !== current_creator_ref) {
        errors.push(
          issue(
            "CREATOR_OWNERSHIP",
            `${path}.ownership.origin_speaker_ref`,
            "current_creator ownership must resolve to current_creator_ref.",
          ),
        );
      }
      if (adoption !== "not_applicable") {
        errors.push(
          issue(
            "CREATOR_ADOPTION_STATE",
            `${path}.ownership.creator_adoption`,
            "A creator-originated claim uses not_applicable adoption.",
          ),
        );
      }
    }
    if ((mode === "adopted" || mode === "shared") && !["adopted", "qualified"].includes(adoption)) {
      errors.push(
        issue(
          "ADOPTED_OWNERSHIP",
          `${path}.ownership.creator_adoption`,
          "Adopted or shared ownership requires adopted or qualified creator adoption.",
        ),
      );
    }
    if (voice === "current_creator_first_person") {
      if (current_creator_ref === null || !["current_creator", "adopted", "shared"].includes(mode)) {
        errors.push(
          issue(
            "CREATOR_VOICE_OWNERSHIP",
            `${path}.ownership.surface_voice`,
            "Current-creator first person requires creator-owned, adopted, or shared ownership.",
          ),
        );
      }
    }

    const evidence = check_shape(
      pyGet(claim, "evidence_scope"),
      `${path}.evidence_scope`,
      evidence_fields,
      evidence_fields,
      errors,
    );
    enum_value(pyGet(evidence, "basis"), EVIDENCE_BASES, `${path}.evidence_scope.basis`, errors, "EVIDENCE_BASIS");
    const breadth = enum_value(
      pyGet(evidence, "breadth"),
      EVIDENCE_BREADTHS,
      `${path}.evidence_scope.breadth`,
      errors,
      "EVIDENCE_BREADTH",
    );
    const evidence_subject_refs = string_list(pyGet(evidence, "subject_refs"), `${path}.evidence_scope.subject_refs`, errors);
    check_refs(evidence_subject_refs, subjects, `${path}.evidence_scope.subject_refs`, errors, "EVIDENCE_SUBJECT_REF");
    for (const evidence_ref of evidence_subject_refs) {
      if (!subject_refs.includes(evidence_ref)) {
        errors.push(
          issue(
            "EVIDENCE_SUBJECT_CLAIM",
            `${path}.evidence_scope.subject_refs`,
            `Evidence subject ${evidence_ref} must also appear in claim.subject_refs.`,
          ),
        );
      }
    }
    string_list(pyGet(evidence, "limitations"), `${path}.evidence_scope.limitations`, errors);
    if (speech_act === "sentiment_witness" && !["individual", "cohort"].includes(breadth)) {
      errors.push(
        issue(
          "SENTIMENT_BREADTH",
          `${path}.evidence_scope.breadth`,
          "sentiment_witness evidence must remain individual or cohort scoped.",
        ),
      );
    }
  });
  return claims;
}

function validate_posture(payload, claims, subjects, errors) {
  const fields = ["explicitness", "past", "now", "on_condition"];
  const phase_fields = ["action", "claim_refs", "trigger_subject_refs", "trade_legs", "condition_text"];
  const leg_fields = ["subject_ref", "role", "direction"];
  const posture = check_shape(payload, "$.posture", fields, fields, errors);
  const explicitness = enum_value(
    pyGet(posture, "explicitness"),
    new Set(["none", "implicit", "explicit"]),
    "$.posture.explicitness",
    errors,
    "POSTURE_EXPLICITNESS",
  );
  const phase_claim_refs = { past: new Set(), now: new Set(), on_condition: new Set() };
  let populated = 0;

  for (const phase_name of ["past", "now", "on_condition"]) {
    const raw = pyGet(posture, phase_name);
    const path = `$.posture.${phase_name}`;
    if (raw === null) continue;
    populated += 1;
    const phase = check_shape(raw, path, phase_fields, phase_fields, errors);
    const action = enum_value(pyGet(phase, "action"), POSTURE_ACTIONS, `${path}.action`, errors, "POSTURE_ACTION");
    const claim_refs = string_list(pyGet(phase, "claim_refs"), `${path}.claim_refs`, errors, { minimum: 1 });
    check_refs(claim_refs, claims, `${path}.claim_refs`, errors, "POSTURE_CLAIM_REF");
    for (const ref of claim_refs) phase_claim_refs[phase_name].add(ref);
    const trigger_refs = string_list(pyGet(phase, "trigger_subject_refs"), `${path}.trigger_subject_refs`, errors);
    check_refs(trigger_refs, subjects, `${path}.trigger_subject_refs`, errors, "TRIGGER_SUBJECT_REF");
    const legs = object_list(pyGet(phase, "trade_legs"), `${path}.trade_legs`, errors);
    const leg_keys = new Set();
    const leg_roles = new Set();
    legs.forEach((raw_leg, leg_index) => {
      const leg_path = `${path}.trade_legs[${leg_index}]`;
      const leg = check_shape(raw_leg, leg_path, leg_fields, leg_fields, errors);
      const subject_ref = nullable_string(pyGet(leg, "subject_ref"), `${leg_path}.subject_ref`, errors);
      if (subject_ref !== null && !subjects.has(subject_ref)) {
        errors.push(issue("TRADE_LEG_SUBJECT_REF", `${leg_path}.subject_ref`, `Unknown subject: ${subject_ref}.`));
      }
      const role = enum_value(pyGet(leg, "role"), TRADE_LEG_ROLES, `${leg_path}.role`, errors, "TRADE_LEG_ROLE");
      const direction = enum_value(
        pyGet(leg, "direction"),
        TRADE_DIRECTIONS,
        `${leg_path}.direction`,
        errors,
        "TRADE_LEG_DIRECTION",
      );
      if (
        subject_ref !== null &&
        typeof role === "string" && TRADE_LEG_ROLES.has(role) &&
        typeof direction === "string" && TRADE_DIRECTIONS.has(direction)
      ) {
        const key = JSON.stringify([subject_ref, role, direction]);
        if (leg_keys.has(key)) {
          errors.push(issue("TRADE_LEG_DUPLICATE", leg_path, "Duplicate trade leg."));
        }
        leg_keys.add(key);
        leg_roles.add(role);
      }
    });
    const condition = nullable_string(pyGet(phase, "condition_text"), `${path}.condition_text`, errors);
    if (phase_name === "on_condition") {
      if (condition === null) {
        errors.push(issue("CONDITION_TEXT", `${path}.condition_text`, "on_condition requires condition text."));
      }
      if (!trigger_refs.length) {
        errors.push(issue("CONDITION_TRIGGER", `${path}.trigger_subject_refs`, "on_condition requires a trigger subject."));
      }
    } else if (condition !== null) {
      errors.push(issue("PHASE_CONDITION", `${path}.condition_text`, "Only on_condition may contain condition text."));
    }
    if (typeof action === "string" && TRADE_ACTIONS.has(action) && !legs.length) {
      errors.push(issue("TRADE_ACTION_LEG", `${path}.trade_legs`, `Action ${pyrepr(action)} requires a trade leg.`));
    }
    if (action === "rotate" && !(leg_roles.has("from_leg") && leg_roles.has("to_leg"))) {
      errors.push(issue("ROTATION_LEGS", `${path}.trade_legs`, "rotate requires from_leg and to_leg roles."));
    }
  }

  if (explicitness === "none" && populated) {
    errors.push(issue("POSTURE_NONE_PHASE", "$.posture", "none posture cannot contain phases."));
  }
  if ((explicitness === "implicit" || explicitness === "explicit") && !populated) {
    errors.push(issue("POSTURE_PHASE_REQUIRED", "$.posture", "Non-none posture requires at least one phase."));
  }

  const trade_claim_ids = new Set(
    [...claims].filter(([, claim]) => {
      const act = pyGet(claim, "speech_act");
      return typeof act === "string" && TRADE_SPEECH_ACTS.has(act);
    }).map(([claim_id]) => claim_id),
  );
  const represented_claim_ids = new Set();
  for (const refs of Object.values(phase_claim_refs)) {
    for (const ref of refs) represented_claim_ids.add(ref);
  }
  if (trade_claim_ids.size && explicitness === "none") {
    errors.push(issue("TRADE_POSTURE_REQUIRED", "$.posture.explicitness", "Trade speech acts require non-none posture."));
  }
  for (const claim_id of [...trade_claim_ids].filter((item) => !represented_claim_ids.has(item)).sort()) {
    errors.push(
      issue(
        "TRADE_CLAIM_PHASE",
        "$.posture",
        `Trade claim ${claim_id} must be represented in a posture phase.`,
      ),
    );
  }
  const conditional_claim_ids = new Set(
    [...claims].filter(([, claim]) => pyGet(claim, "speech_act") === "conditional_trade").map(([claim_id]) => claim_id),
  );
  for (const claim_id of [...conditional_claim_ids].filter((item) => !phase_claim_refs.on_condition.has(item)).sort()) {
    errors.push(
      issue(
        "CONDITIONAL_TRADE_PHASE",
        "$.posture.on_condition",
        `Conditional trade claim ${claim_id} must appear in on_condition.`,
      ),
    );
  }
}

function graph_has_cycle(links) {
  const adjacency = new Map();
  const nodes = new Set();
  for (const link of links) {
    const source = pyGet(link, "from_subject_ref");
    const target = pyGet(link, "to_subject_ref");
    if (nonempty(source) && nonempty(target)) {
      if (!adjacency.has(source)) adjacency.set(source, new Set());
      adjacency.get(source).add(target);
      nodes.add(source);
      nodes.add(target);
    }
  }
  const active = new Set();
  const visited = new Set();

  function visit(node) {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    active.add(node);
    for (const neighbor of adjacency.get(node) ?? new Set()) {
      if (visit(neighbor)) return true;
    }
    active.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node) && visit(node)) return true;
  }
  return false;
}

function edge_is_cyclic(link, links) {
  const source = pyGet(link, "from_subject_ref");
  const target = pyGet(link, "to_subject_ref");
  if (!nonempty(source) || !nonempty(target)) return false;
  if (source === target) return true;
  const adjacency = new Map();
  for (const candidate of links) {
    const candidate_source = pyGet(candidate, "from_subject_ref");
    const candidate_target = pyGet(candidate, "to_subject_ref");
    if (nonempty(candidate_source) && nonempty(candidate_target)) {
      if (!adjacency.has(candidate_source)) adjacency.set(candidate_source, new Set());
      adjacency.get(candidate_source).add(candidate_target);
    }
  }
  const stack = [target];
  const visited = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (node === source) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of adjacency.get(node) ?? new Set()) {
      if (!visited.has(neighbor)) stack.push(neighbor);
    }
  }
  return false;
}

function validate_causality(raw_links, raw_loops, subjects, claims, errors) {
  const link_fields = ["link_id", "from_subject_ref", "to_subject_ref", "relation", "claim_refs", "certainty", "loop_id"];
  const loop_fields = ["loop_id", "label", "polarity", "declaration", "link_refs", "claim_refs"];
  const links = new Map();
  const link_paths = new Map();
  object_list(raw_links, "$.causal_links", errors).forEach((raw, index) => {
    const path = `$.causal_links[${index}]`;
    const link = check_shape(raw, path, link_fields, link_fields, errors);
    const link_id = register_id(links, pyGet(link, "link_id"), link, `${path}.link_id`, errors);
    if (link_id) link_paths.set(link_id, path);
    for (const field of ["from_subject_ref", "to_subject_ref"]) {
      const ref = nullable_string(pyGet(link, field), `${path}.${field}`, errors);
      if (ref !== null && !subjects.has(ref)) {
        errors.push(issue("CAUSAL_SUBJECT_REF", `${path}.${field}`, `Unknown subject: ${ref}.`));
      }
    }
    enum_value(pyGet(link, "relation"), CAUSAL_RELATIONS, `${path}.relation`, errors, "CAUSAL_RELATION");
    const claim_refs = string_list(pyGet(link, "claim_refs"), `${path}.claim_refs`, errors, { minimum: 1 });
    check_refs(claim_refs, claims, `${path}.claim_refs`, errors, "CAUSAL_CLAIM_REF");
    enum_value(pyGet(link, "certainty"), CERTAINTIES, `${path}.certainty`, errors, "CAUSAL_CERTAINTY");
    nullable_string(pyGet(link, "loop_id"), `${path}.loop_id`, errors);
  });

  const loops = new Map();
  const loop_paths = new Map();
  object_list(raw_loops, "$.feedback_loops", errors).forEach((raw, index) => {
    const path = `$.feedback_loops[${index}]`;
    const loop = check_shape(raw, path, loop_fields, loop_fields, errors);
    const loop_id = register_id(loops, pyGet(loop, "loop_id"), loop, `${path}.loop_id`, errors);
    if (loop_id) loop_paths.set(loop_id, path);
    if (!nonempty(pyGet(loop, "label"))) {
      errors.push(issue("LOOP_LABEL", `${path}.label`, "Feedback-loop label is required."));
    }
    enum_value(pyGet(loop, "polarity"), new Set(["reinforcing", "balancing", "mixed", "unspecified"]), `${path}.polarity`, errors, "LOOP_POLARITY");
    enum_value(pyGet(loop, "declaration"), new Set(["explicit", "inferred"]), `${path}.declaration`, errors, "LOOP_DECLARATION");
    const link_refs = string_list(pyGet(loop, "link_refs"), `${path}.link_refs`, errors, { minimum: 1 });
    check_refs(link_refs, links, `${path}.link_refs`, errors, "LOOP_LINK_REF");
    const claim_refs = string_list(pyGet(loop, "claim_refs"), `${path}.claim_refs`, errors, { minimum: 1 });
    check_refs(claim_refs, claims, `${path}.claim_refs`, errors, "LOOP_CLAIM_REF");
  });

  const all_links = [...links.values()];
  for (const [link_id, link] of links) {
    const path = link_paths.get(link_id);
    const loop_id = pyGet(link, "loop_id");
    if (edge_is_cyclic(link, all_links) && !nonempty(loop_id)) {
      errors.push(issue("CYCLE_LOOP_ID", `${path}.loop_id`, "Every edge in a directed cycle requires loop_id."));
    }
    if (nonempty(loop_id)) {
      if (!loops.has(loop_id)) {
        errors.push(issue("CAUSAL_LOOP_REF", `${path}.loop_id`, `Unknown feedback loop: ${loop_id}.`));
      } else if (!pyIn(link_id, pyGet(loops.get(loop_id), "link_refs", []))) {
        errors.push(
          issue(
            "LOOP_LINK_MEMBERSHIP",
            `${path}.loop_id`,
            `Link ${link_id} is not listed in feedback loop ${loop_id}.`,
          ),
        );
      }
    }
  }

  for (const [loop_id, loop] of loops) {
    const path = loop_paths.get(loop_id);
    const declared_links = pyIterList(pyGet(loop, "link_refs", [])).filter((ref) => links.has(ref)).map((ref) => links.get(ref));
    for (const ref of pyIterList(pyGet(loop, "link_refs", []))) {
      if (links.has(ref) && pyGet(links.get(ref), "loop_id") !== loop_id) {
        errors.push(
          issue(
            "LOOP_ID_MISMATCH",
            `${path}.link_refs`,
            `Link ${ref} must carry loop_id ${loop_id}.`,
          ),
        );
      }
    }
    if (declared_links.length && !graph_has_cycle(declared_links)) {
      errors.push(issue("LOOP_NOT_CYCLIC", `${path}.link_refs`, "A feedback-loop declaration must contain a directed cycle."));
    }
  }
}

function validate_horizon(payload, subjects, errors) {
  const fields = ["kind", "precision", "raw_text", "start_at", "end_at", "duration", "event_subject_ref"];
  const horizon = check_shape(payload, "$.horizon", fields, fields, errors);
  const kind = enum_value(pyGet(horizon, "kind"), HORIZON_KINDS, "$.horizon.kind", errors, "HORIZON_KIND");
  const precision = enum_value(
    pyGet(horizon, "precision"),
    HORIZON_PRECISIONS,
    "$.horizon.precision",
    errors,
    "HORIZON_PRECISION",
  );
  const raw_text = nullable_string(pyGet(horizon, "raw_text"), "$.horizon.raw_text", errors);
  const start = parse_datetime(pyGet(horizon, "start_at"), "$.horizon.start_at", errors, { nullable: true });
  const end = parse_datetime(pyGet(horizon, "end_at"), "$.horizon.end_at", errors, { nullable: true });
  const event_ref = nullable_string(pyGet(horizon, "event_subject_ref"), "$.horizon.event_subject_ref", errors);
  if (event_ref !== null) {
    if (!subjects.has(event_ref)) {
      errors.push(issue("HORIZON_EVENT_REF", "$.horizon.event_subject_ref", `Unknown subject: ${event_ref}.`));
    } else {
      const type = pyGet(subjects.get(event_ref), "type");
      if (!(typeof type === "string" && EVENT_BOUND_SUBJECT_TYPES.has(type))) {
        errors.push(
          issue(
            "HORIZON_EVENT_TYPE",
            "$.horizon.event_subject_ref",
            "event_bound must reference an event, policy, metric, signal, flow, or market_state subject.",
          ),
        );
      }
    }
  }

  const duration = pyGet(horizon, "duration");
  let duration_value = null;
  if (duration !== null) {
    const duration_fields = ["min", "max", "unit"];
    const duration_object = check_shape(duration, "$.horizon.duration", duration_fields, duration_fields, errors);
    const minimum = pyGet(duration_object, "min");
    const maximum = pyGet(duration_object, "max");
    for (const [value, field] of [[minimum, "min"], [maximum, "max"]]) {
      if (typeof value !== "number" || value < 0) {
        errors.push(issue("DURATION_VALUE", `$.horizon.duration.${field}`, "Duration bounds must be non-negative numbers."));
      }
    }
    enum_value(pyGet(duration_object, "unit"), DURATION_UNITS, "$.horizon.duration.unit", errors, "DURATION_UNIT");
    if (typeof minimum === "number" && typeof maximum === "number") {
      duration_value = [minimum, maximum];
      if (maximum < minimum) {
        errors.push(issue("DURATION_ORDER", "$.horizon.duration", "Duration max must be greater than or equal to min."));
      }
    }
  }

  if (kind === "unspecified") {
    if (precision !== "none" || [raw_text, start, end, duration, event_ref].some((value) => value !== null)) {
      errors.push(issue("HORIZON_UNSPECIFIED", "$.horizon", "unspecified horizon requires precision none and no timing fields."));
    }
  } else if (kind === "instant") {
    if (!["exact", "approximate"].includes(precision) || end === null || raw_text === null) {
      errors.push(issue("HORIZON_INSTANT", "$.horizon", "instant requires raw text, an end_at point, and exact or approximate precision."));
    }
    if (start !== null || duration !== null || event_ref !== null) {
      errors.push(issue("HORIZON_INSTANT_FIELDS", "$.horizon", "instant cannot contain start, duration, or event fields."));
    }
  } else if (kind === "window") {
    if (!["exact", "bounded", "approximate"].includes(precision) || start === null || end === null || raw_text === null) {
      errors.push(issue("HORIZON_WINDOW", "$.horizon", "window requires raw text, start_at, end_at, and bounded timing precision."));
    }
    if (start !== null && end !== null && end.total < start.total) {
      errors.push(issue("HORIZON_ORDER", "$.horizon", "Horizon end_at must not precede start_at."));
    }
    if (duration !== null || event_ref !== null) {
      errors.push(issue("HORIZON_WINDOW_FIELDS", "$.horizon", "window cannot contain duration or event fields."));
    }
  } else if (kind === "duration") {
    if (!["exact", "bounded", "approximate"].includes(precision) || duration_value === null || raw_text === null) {
      errors.push(issue("HORIZON_DURATION", "$.horizon", "duration requires raw text, numeric duration, and numeric precision."));
    }
    if (start !== null || end !== null || event_ref !== null) {
      errors.push(issue("HORIZON_DURATION_FIELDS", "$.horizon", "duration cannot contain dates or event fields."));
    }
  } else if (kind === "event_bound") {
    if (!["bounded", "approximate", "qualitative"].includes(precision) || event_ref === null || raw_text === null) {
      errors.push(issue("HORIZON_EVENT", "$.horizon", "event_bound requires raw text, an event subject, and non-exact precision."));
    }
    if (start !== null || end !== null || duration !== null) {
      errors.push(issue("HORIZON_EVENT_FIELDS", "$.horizon", "event_bound cannot contain dates or duration."));
    }
  } else if (kind === "structural") {
    if (precision !== "qualitative" || raw_text === null) {
      errors.push(issue("HORIZON_STRUCTURAL", "$.horizon", "structural requires qualitative precision and raw text."));
    }
    if (start !== null || end !== null || duration !== null || event_ref !== null) {
      errors.push(issue("HORIZON_STRUCTURAL_FIELDS", "$.horizon", "structural cannot contain dates, duration, or event fields."));
    }
  }
}

function validate_proprietary_signal(payload, subjects, source_units, claims, errors) {
  if (payload === null) return;
  const fields = ["signal_subject_ref", "name", "replicability", "formula", "segmentation", "source_unit_refs", "claim_refs"];
  const signal = check_shape(payload, "$.proprietary_signal", fields, fields, errors);
  const signal_ref = nullable_string(pyGet(signal, "signal_subject_ref"), "$.proprietary_signal.signal_subject_ref", errors);
  if (signal_ref !== null) {
    if (!subjects.has(signal_ref)) {
      errors.push(issue("SIGNAL_SUBJECT_REF", "$.proprietary_signal.signal_subject_ref", `Unknown subject: ${signal_ref}.`));
    } else if (pyGet(subjects.get(signal_ref), "type") !== "signal") {
      errors.push(issue("SIGNAL_SUBJECT_TYPE", "$.proprietary_signal.signal_subject_ref", "Proprietary signal must reference a signal subject."));
    }
  }
  if (!nonempty(pyGet(signal, "name"))) {
    errors.push(issue("SIGNAL_NAME", "$.proprietary_signal.name", "Signal name is required."));
  }
  enum_value(pyGet(signal, "replicability"), new Set(["exact", "partial", "opaque"]), "$.proprietary_signal.replicability", errors, "SIGNAL_REPLICABILITY");
  string_list(pyGet(signal, "segmentation"), "$.proprietary_signal.segmentation", errors);
  const source_refs = string_list(pyGet(signal, "source_unit_refs"), "$.proprietary_signal.source_unit_refs", errors, { minimum: 1 });
  check_refs(source_refs, source_units, "$.proprietary_signal.source_unit_refs", errors, "SIGNAL_SOURCE_REF");
  const claim_refs = string_list(pyGet(signal, "claim_refs"), "$.proprietary_signal.claim_refs", errors, { minimum: 1 });
  check_refs(claim_refs, claims, "$.proprietary_signal.claim_refs", errors, "SIGNAL_CLAIM_REF");

  const formula_fields = ["operator", "expression", "output_unit", "inputs"];
  const formula = check_shape(pyGet(signal, "formula"), "$.proprietary_signal.formula", formula_fields, formula_fields, errors);
  const operator = enum_value(pyGet(formula, "operator"), FORMULA_OPERATORS, "$.proprietary_signal.formula.operator", errors, "FORMULA_OPERATOR");
  if (!nonempty(pyGet(formula, "expression"))) {
    errors.push(issue("FORMULA_EXPRESSION", "$.proprietary_signal.formula.expression", "Formula expression is required."));
  }
  if (!nonempty(pyGet(formula, "output_unit"))) {
    errors.push(issue("FORMULA_OUTPUT_UNIT", "$.proprietary_signal.formula.output_unit", "Formula output unit is required."));
  }
  const input_fields = ["input_id", "subject_ref", "role", "unit", "transformation"];
  const input_ids = new Set();
  const roles = [];
  object_list(pyGet(formula, "inputs"), "$.proprietary_signal.formula.inputs", errors, { minimum: 1 }).forEach((raw_input, index) => {
    const path = `$.proprietary_signal.formula.inputs[${index}]`;
    const formula_input = check_shape(raw_input, path, input_fields, input_fields, errors);
    const input_id = pyGet(formula_input, "input_id");
    if (!nonempty(input_id)) {
      errors.push(issue("FORMULA_INPUT_ID", `${path}.input_id`, "Formula input ID is required."));
    } else if (input_ids.has(input_id)) {
      errors.push(issue("FORMULA_INPUT_DUPLICATE", `${path}.input_id`, `Duplicate formula input ID: ${input_id}.`));
    } else {
      input_ids.add(input_id);
    }
    const subject_ref = nullable_string(pyGet(formula_input, "subject_ref"), `${path}.subject_ref`, errors);
    if (subject_ref !== null && !subjects.has(subject_ref)) {
      errors.push(issue("FORMULA_SUBJECT_REF", `${path}.subject_ref`, `Unknown subject: ${subject_ref}.`));
    }
    const role = enum_value(pyGet(formula_input, "role"), FORMULA_INPUT_ROLES, `${path}.role`, errors, "FORMULA_INPUT_ROLE");
    if (typeof role === "string" && FORMULA_INPUT_ROLES.has(role)) {
      roles.push(role);
    }
    if (!nonempty(pyGet(formula_input, "unit"))) {
      errors.push(issue("FORMULA_INPUT_UNIT", `${path}.unit`, "Formula input unit is required."));
    }
    nullable_string(pyGet(formula_input, "transformation"), `${path}.transformation`, errors);
  });
  if (operator === "ratio" && !(roles.includes("numerator") && roles.includes("denominator"))) {
    errors.push(issue("RATIO_INPUTS", "$.proprietary_signal.formula.inputs", "ratio requires numerator and denominator inputs."));
  }
}

function validate_resolution(payload, claims, errors) {
  const fields = ["explicitness", "criterion", "deadline"];
  const resolution = check_shape(payload, "$.resolution", fields, fields, errors);
  const explicitness = enum_value(
    pyGet(resolution, "explicitness"),
    new Set(["none", "partial", "implicit", "explicit"]),
    "$.resolution.explicitness",
    errors,
    "RESOLUTION_EXPLICITNESS",
  );
  const criterion = pyGet(resolution, "criterion");
  const deadline = pyGet(resolution, "deadline");
  let criterion_status = null;
  let deadline_status = null;
  if (criterion !== null) {
    const criterion_fields = ["text", "status", "claim_refs"];
    const criterion_object = check_shape(criterion, "$.resolution.criterion", criterion_fields, criterion_fields, errors);
    if (!nonempty(pyGet(criterion_object, "text"))) {
      errors.push(issue("RESOLUTION_CRITERION", "$.resolution.criterion.text", "Resolution criterion text is required."));
    }
    criterion_status = enum_value(
      pyGet(criterion_object, "status"),
      new Set(["explicit", "inferred"]),
      "$.resolution.criterion.status",
      errors,
      "RESOLUTION_STATUS",
    );
    const refs = string_list(pyGet(criterion_object, "claim_refs"), "$.resolution.criterion.claim_refs", errors, { minimum: 1 });
    check_refs(refs, claims, "$.resolution.criterion.claim_refs", errors, "RESOLUTION_CLAIM_REF");
  }
  if (deadline !== null) {
    const deadline_fields = ["raw_text", "normalized_at", "status", "claim_refs"];
    const deadline_object = check_shape(deadline, "$.resolution.deadline", deadline_fields, deadline_fields, errors);
    if (!nonempty(pyGet(deadline_object, "raw_text"))) {
      errors.push(issue("RESOLUTION_DEADLINE", "$.resolution.deadline.raw_text", "Resolution deadline text is required."));
    }
    parse_datetime(pyGet(deadline_object, "normalized_at"), "$.resolution.deadline.normalized_at", errors, { nullable: true });
    deadline_status = enum_value(
      pyGet(deadline_object, "status"),
      new Set(["explicit", "inferred"]),
      "$.resolution.deadline.status",
      errors,
      "RESOLUTION_STATUS",
    );
    const refs = string_list(pyGet(deadline_object, "claim_refs"), "$.resolution.deadline.claim_refs", errors, { minimum: 1 });
    check_refs(refs, claims, "$.resolution.deadline.claim_refs", errors, "RESOLUTION_CLAIM_REF");
  }

  const present_count = (criterion !== null ? 1 : 0) + (deadline !== null ? 1 : 0);
  if (explicitness === "none" && present_count) {
    errors.push(issue("RESOLUTION_NONE", "$.resolution", "none resolution cannot contain criterion or deadline."));
  } else if (explicitness === "partial" && present_count !== 1) {
    errors.push(issue("RESOLUTION_PARTIAL", "$.resolution", "partial resolution requires exactly one of criterion or deadline."));
  } else if (explicitness === "implicit") {
    if (present_count !== 2 || (criterion_status === "explicit" && deadline_status === "explicit")) {
      errors.push(issue("RESOLUTION_IMPLICIT", "$.resolution", "implicit resolution requires criterion and deadline with at least one inferred field."));
    }
  } else if (explicitness === "explicit") {
    if (present_count !== 2 || criterion_status !== "explicit" || deadline_status !== "explicit") {
      errors.push(
        issue(
          "EXPLICIT_SETTLEMENT",
          "$.resolution",
          "Explicit settlement requires an explicit criterion and an explicit deadline.",
        ),
      );
    }
  }
}

function validate_quality(payload, state, errors) {
  const fields = ["decision", "warnings", "hard_failures"];
  const quality = check_shape(payload, "$.quality_report", fields, fields, errors);
  const decision = enum_value(
    pyGet(quality, "decision"),
    new Set(["ready", "conditional", "blocked"]),
    "$.quality_report.decision",
    errors,
    "QUALITY_DECISION",
  );
  const warnings = string_list(pyGet(quality, "warnings"), "$.quality_report.warnings", errors);
  const failures = string_list(pyGet(quality, "hard_failures"), "$.quality_report.hard_failures", errors);
  if (state === "conditional" && (decision !== "conditional" || !warnings.length || failures.length)) {
    errors.push(issue("CONDITIONAL_QUALITY", "$.quality_report", "conditional state requires conditional decision, warnings, and no hard failures."));
  }
  if ((state === "ready" || state === "frozen") && (decision !== "ready" || warnings.length || failures.length)) {
    errors.push(issue("READY_QUALITY", "$.quality_report", "ready or frozen state requires a clean ready quality report."));
  }
  if (decision === "blocked" && !failures.length) {
    errors.push(issue("BLOCKED_FAILURE", "$.quality_report.hard_failures", "blocked quality requires a hard failure."));
  }
  if (failures.length && decision !== "blocked") {
    errors.push(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."));
  }
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }
  check_shape(payload, "$", ROOT_FIELDS, ROOT_FIELDS, errors);
  if (pyGet(payload, "schema_version") !== "market-view-semantics-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-view-semantics-v1."));
  }
  const rawSemanticsId = pyGet(payload, "semantics_id");
  const semanticsId = pyStr(pyTruthy(rawSemanticsId) ? rawSemanticsId : "");
  if (!/^(?:MVSEM_[A-Za-z0-9_:-]{8,})$/.test(semanticsId)) {
    errors.push(issue("SEMANTICS_ID", "$.semantics_id", "Invalid semantics ID."));
  }
  const revision = pyGet(payload, "revision");
  if (!Number.isInteger(revision) || revision < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }
  const state = enum_value(pyGet(payload, "state"), new Set(["draft", "conditional", "ready", "frozen"]), "$.state", errors, "STATE");

  validate_lineage(pyGet(payload, "lineage"), errors);
  const [speakers, speaker_source_refs] = validate_speakers(pyGet(payload, "speakers"), errors);
  const current_creator_ref = nullable_string(pyGet(payload, "current_creator_ref"), "$.current_creator_ref", errors);
  const creator_speakers = [...speakers].filter(([, speaker]) => pyGet(speaker, "role") === "current_creator").map(([speaker_id]) => speaker_id);
  if (creator_speakers.length > 1) {
    errors.push(issue("CREATOR_COUNT", "$.speakers", "At most one speaker may have current_creator role."));
  }
  if (current_creator_ref === null && creator_speakers.length) {
    errors.push(issue("CREATOR_REF_REQUIRED", "$.current_creator_ref", "A current_creator speaker requires current_creator_ref."));
  }
  if (current_creator_ref !== null) {
    if (!speakers.has(current_creator_ref)) {
      errors.push(issue("CURRENT_CREATOR_REF", "$.current_creator_ref", `Unknown speaker: ${current_creator_ref}.`));
    } else if (pyGet(speakers.get(current_creator_ref), "role") !== "current_creator") {
      errors.push(issue("CURRENT_CREATOR_ROLE", "$.current_creator_ref", "current_creator_ref must point to a current_creator speaker."));
    }
  }

  const [source_units, source_claim_refs, statuses] = validate_source_units(pyGet(payload, "source_units"), speakers, errors);
  for (const [speaker_id, refs] of speaker_source_refs) {
    check_refs(refs, source_units, `$.speakers[${speaker_id}].source_unit_refs`, errors, "SPEAKER_SOURCE_REF");
    for (const ref of refs) {
      if (source_units.has(ref) && pyGet(source_units.get(ref), "speaker_ref") !== speaker_id) {
        errors.push(
          issue(
            "SPEAKER_SOURCE_RECIPROCAL",
            `$.speakers[${speaker_id}].source_unit_refs`,
            `Source unit ${ref} does not point back to speaker ${speaker_id}.`,
          ),
        );
      }
    }
  }
  for (const [unit_id, unit] of source_units) {
    const speaker_ref = pyGet(unit, "speaker_ref");
    if (nonempty(speaker_ref) && !(speaker_source_refs.get(speaker_ref) ?? []).includes(unit_id)) {
      errors.push(
        issue(
          "SOURCE_SPEAKER_RECIPROCAL",
          `$.source_units[${unit_id}].speaker_ref`,
          `Speaker ${speaker_ref} does not list source unit ${unit_id}.`,
        ),
      );
    }
  }
  validate_source_completeness(pyGet(payload, "source_completeness"), statuses, errors, warnings);
  const subjects = validate_subjects(pyGet(payload, "subjects"), source_units, errors);
  const claims = validate_claims(
    pyGet(payload, "claims"),
    speakers,
    current_creator_ref,
    source_units,
    subjects,
    errors,
  );

  const primary_ref = nullable_string(pyGet(payload, "primary_claim_ref"), "$.primary_claim_ref", errors);
  const primary_ids = [...claims].filter(([, claim]) => pyGet(claim, "role") === "primary").map(([claim_id]) => claim_id);
  if (primary_ids.length !== 1) {
    errors.push(issue("PRIMARY_CLAIM_COUNT", "$.claims", "Exactly one claim must have primary role."));
  }
  if (primary_ref !== null) {
    if (!claims.has(primary_ref)) {
      errors.push(issue("PRIMARY_CLAIM_REF", "$.primary_claim_ref", `Unknown claim: ${primary_ref}.`));
    } else if (pyGet(claims.get(primary_ref), "role") !== "primary") {
      errors.push(issue("PRIMARY_CLAIM_ROLE", "$.primary_claim_ref", "primary_claim_ref must point to the primary claim."));
    }
  }

  for (const [unit_id, refs] of source_claim_refs) {
    check_refs(refs, claims, `$.source_units[${unit_id}].claim_refs`, errors, "SOURCE_CLAIM_REF");
    for (const ref of refs) {
      if (claims.has(ref) && !pyIn(unit_id, pyGet(claims.get(ref), "source_unit_refs", []))) {
        errors.push(
          issue(
            "SOURCE_CLAIM_RECIPROCAL",
            `$.source_units[${unit_id}].claim_refs`,
            `Claim ${ref} does not point back to source unit ${unit_id}.`,
          ),
        );
      }
    }
  }
  for (const [claim_id, claim] of claims) {
    for (const source_ref of pyIterList(pyGet(claim, "source_unit_refs", []))) {
      if (source_units.has(source_ref) && !(source_claim_refs.get(source_ref) ?? []).includes(claim_id)) {
        errors.push(
          issue(
            "CLAIM_SOURCE_RECIPROCAL",
            `$.claims[${claim_id}].source_unit_refs`,
            `Source unit ${source_ref} does not list claim ${claim_id}.`,
          ),
        );
      }
    }
  }

  validate_causality(pyGet(payload, "causal_links"), pyGet(payload, "feedback_loops"), subjects, claims, errors);
  validate_posture(pyGet(payload, "posture"), claims, subjects, errors);
  validate_horizon(pyGet(payload, "horizon"), subjects, errors);
  validate_proprietary_signal(pyGet(payload, "proprietary_signal"), subjects, source_units, claims, errors);
  validate_resolution(pyGet(payload, "resolution"), claims, errors);
  validate_quality(pyGet(payload, "quality_report"), state, errors);
  return { valid: !errors.length, errors, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  const prog = "validate_market_view_semantics.mjs";
  const usage = `usage: ${prog} [-h] artifact`;
  const positionals = [];
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${usage}\n\n${DESCRIPTION}\n\npositional arguments:\n  artifact    Path to a MarketViewSemanticsV1 JSON artifact.\n\noptions:\n  -h, --help  show this help message and exit\n`);
      return 0;
    }
    if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`${usage}\n${prog}: error: unrecognized arguments: ${arg}\n`);
      return 2;
    }
    positionals.push(arg);
  }
  if (positionals.length < 1) {
    process.stderr.write(`${usage}\n${prog}: error: the following arguments are required: artifact\n`);
    return 2;
  }
  if (positionals.length > 1) {
    process.stderr.write(`${usage}\n${prog}: error: unrecognized arguments: ${positionals.slice(1).join(" ")}\n`);
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(positionals[0], "utf-8"));
  } catch (exc) {
    const result = { valid: false, errors: [issue("LOAD", "$", String(exc.message))], warnings: [] };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 1;
  }
  const result = validate(payload);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result.valid ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
