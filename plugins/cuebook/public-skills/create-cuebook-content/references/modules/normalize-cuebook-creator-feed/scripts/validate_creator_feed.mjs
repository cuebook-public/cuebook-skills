#!/usr/bin/env node
// Validate deterministic CreatorFeedV1 invariants beyond JSON Schema.
// Port of validate_creator_feed.py; error codes, paths, messages, JSON output
// shape, and exit codes are contract and stay byte-compatible with the Python
// original.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED_ROOT = new Set([
  "schema_version", "feed_id", "generated_at", "as_of", "knowledge_cutoff_at",
  "input_hash", "ruleset_version", "brief", "source_register", "entities",
  "news", "calendar_events", "narratives", "trade_ideas", "trade_history",
  "links", "quality_report",
]);
const HASH_RE = /^sha256:[a-f0-9]{64}$/;
const RECORD_SECTIONS = ["news", "calendar_events", "narratives", "trade_ideas", "trade_history"];
const ALL_LIST_SECTIONS = ["source_register", "entities", ...RECORD_SECTIONS, "links"];
const ACTIVE = "active";

export function issue(code, path, message) {
  return { code, path, message };
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Python truthiness for JSON values (None/False/0/""/[]/{} are falsy).
function pyTruthy(value) {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// Python `value or fallback`.
function orElse(value, fallback) {
  return pyTruthy(value) ? value : fallback;
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

// Python str() applied to JSON values (str for strings, repr-like otherwise).
function pyStr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

// Python == structural equality for JSON values.
function pyEq(a, b) {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (typeof na !== typeof nb) return false;
  if (Array.isArray(na) && Array.isArray(nb)) {
    return na.length === nb.length && na.every((item, index) => pyEq(item, nb[index]));
  }
  if (isDict(na) && isDict(nb)) {
    const ka = Object.keys(na);
    const kb = Object.keys(nb);
    if (ka.length !== kb.length) return false;
    return ka.every((key) => Object.hasOwn(nb, key) && pyEq(na[key], nb[key]));
  }
  return false;
}

function daysInMonth(year, month) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function utcEpochUs(year, month, day, hour, minute, second, micro) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime() * 1000 + micro;
}

// Parse HH[[:]MM[[:]SS[.ffffff]]]; returns {h, mi, s, us} or null.
function parseClock(text) {
  const m = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?|(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? m[5] ?? "0");
  const s = Number(m[3] ?? m[6] ?? "0");
  const frac = m[4] ?? m[7] ?? "";
  const us = frac ? Number(frac.slice(0, 6).padEnd(6, "0")) : 0;
  return { h, mi, s, us };
}

// Emulate datetime.fromisoformat() for the formats Cuebook artifacts use:
// extended/basic calendar dates, an arbitrary single-char separator, extended
// or basic times, "Z"/"z", and +-HH[:MM[:SS[.ffffff]]] offsets. Returns
// {us, hasTz} (microseconds since epoch, naive treated as UTC) or null.
function parseIsoDatetime(value) {
  if (typeof value !== "string") return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  let rest;
  if (m) {
    rest = value.slice(10);
  } else {
    m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    rest = value.slice(8);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (rest === "") return { us: utcEpochUs(year, month, day, 0, 0, 0, 0), hasTz: false };
  const timeText = rest.slice(1);
  if (timeText === "") return null;
  let tzIndex = -1;
  for (let index = 0; index < timeText.length; index += 1) {
    const ch = timeText[index];
    if (ch === "Z" || ch === "z" || ch === "+" || ch === "-") {
      tzIndex = index;
      break;
    }
  }
  const clockText = tzIndex === -1 ? timeText : timeText.slice(0, tzIndex);
  const tzText = tzIndex === -1 ? null : timeText.slice(tzIndex);
  const clock = parseClock(clockText);
  if (!clock || clock.h > 23 || clock.mi > 59 || clock.s > 59) return null;
  let offsetUs = 0;
  let hasTz = false;
  if (tzText !== null) {
    hasTz = true;
    if (tzText === "Z" || tzText === "z") {
      offsetUs = 0;
    } else {
      const sign = tzText[0] === "-" ? -1 : 1;
      const offset = parseClock(tzText.slice(1));
      if (!offset || offset.mi > 59 || offset.s > 59) return null;
      offsetUs = sign * (((offset.h * 60 + offset.mi) * 60 + offset.s) * 1e6 + offset.us);
      if (Math.abs(offsetUs) >= 24 * 3600 * 1e6) return null;
    }
  }
  const us = utcEpochUs(year, month, day, clock.h, clock.mi, clock.s, clock.us) - offsetUs;
  return { us, hasTz };
}

function parseTime(value, path, errors, { nullable = false } = {}) {
  if ((value === null || value === undefined) && nullable) return null;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(issue("TIME_REQUIRED", path, "A timezone-aware ISO timestamp is required."));
    return null;
  }
  const parsed = parseIsoDatetime(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("TIME_FORMAT", path, "Invalid ISO timestamp."));
    return null;
  }
  if (!parsed.hasTz) {
    errors.push(issue("TIMEZONE_REQUIRED", path, "Timestamp must include a timezone."));
    return null;
  }
  return parsed;
}

function asList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("ARRAY_REQUIRED", path, "Expected an array."));
    return [];
  }
  return value;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "CreatorFeedV1 must be an object.")], warnings: [] };
  }

  const payloadKeys = new Set(Object.keys(payload));
  for (const key of [...REQUIRED_ROOT].filter((item) => !payloadKeys.has(item)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of [...payloadKeys].filter((item) => !REQUIRED_ROOT.has(item)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "creator-feed-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-feed-v1."));
  }
  if (!/^CF_[a-z0-9]{8,64}$/.test(pyStr(orElse(payload.feed_id, "")))) {
    errors.push(issue("FEED_ID", "$.feed_id", "feed_id must be a stable CF_* identifier."));
  }
  if (!HASH_RE.test(pyStr(orElse(payload.input_hash, "")))) {
    errors.push(issue("INPUT_HASH", "$.input_hash", "input_hash must be sha256:<64 lowercase hex>."));
  }
  for (const key of ["ruleset_version"]) {
    if (!pyStr(orElse(payload[key], "")).trim()) {
      errors.push(issue("ROOT_VALUE", `$.${key}`, `${key} is required.`));
    }
  }

  const generatedAt = parseTime(payload.generated_at, "$.generated_at", errors);
  const asOf = parseTime(payload.as_of, "$.as_of", errors);
  const cutoff = parseTime(payload.knowledge_cutoff_at, "$.knowledge_cutoff_at", errors);
  if (generatedAt && asOf && generatedAt.us < asOf.us) {
    warnings.push(issue("GENERATED_BEFORE_AS_OF", "$.generated_at", "Feed was generated before its stated as_of."));
  }
  if (asOf && cutoff && cutoff.us > asOf.us) {
    errors.push(issue("CUTOFF_AFTER_AS_OF", "$.knowledge_cutoff_at", "knowledge cutoff cannot be after as_of."));
  }

  let brief = payload.brief;
  if (!isDict(brief)) {
    errors.push(issue("BRIEF_TYPE", "$.brief", "brief must be an object."));
    brief = {};
  }
  const requiredBrief = new Set(["workspace_ref", "creator_ref", "snapshot_ref", "timezone", "locale", "universe", "personalized_advice_allowed"]);
  const briefKeys = new Set(Object.keys(brief));
  for (const key of [...requiredBrief].filter((item) => !briefKeys.has(item)).sort()) {
    errors.push(issue("BRIEF_FIELD", `$.brief.${key}`, "Required brief field is missing."));
  }
  if (brief.personalized_advice_allowed !== false) {
    errors.push(issue("PERSONALIZED_ADVICE", "$.brief.personalized_advice_allowed", "Must be false."));
  }
  if (!Array.isArray(brief.universe)) {
    errors.push(issue("UNIVERSE_TYPE", "$.brief.universe", "universe must be an array."));
  }

  const sections = {};
  for (const name of ALL_LIST_SECTIONS) {
    sections[name] = asList(payload[name], `$.${name}`, errors);
  }
  const allIds = new Set();
  const revisionIds = new Set();
  const objectPaths = new Map();

  function registerId(obj, path, prefix, { revision = false } = {}) {
    if (!isDict(obj)) {
      errors.push(issue("ENTRY_TYPE", path, "Entry must be an object."));
      return "";
    }
    const objectId = pyStr(orElse(obj.id, ""));
    if (!objectId.startsWith(prefix)) {
      errors.push(issue("ID_PREFIX", `${path}.id`, `Expected ${prefix}* ID.`));
    }
    if (!objectId) {
      errors.push(issue("ID_REQUIRED", `${path}.id`, "ID is required."));
    } else if (allIds.has(objectId)) {
      errors.push(issue("DUPLICATE_ID", `${path}.id`, `Duplicate ID ${objectId}.`));
    } else {
      allIds.add(objectId);
      objectPaths.set(objectId, path);
    }
    if (revision) {
      const revisionId = pyStr(orElse(obj.revision_id, ""));
      if (!HASH_RE.test(revisionId)) {
        errors.push(issue("REVISION_ID", `${path}.revision_id`, "Invalid revision hash."));
      } else if (revisionIds.has(revisionId)) {
        errors.push(issue("DUPLICATE_REVISION", `${path}.revision_id`, "Revision hash is duplicated."));
      } else {
        revisionIds.add(revisionId);
      }
    }
    return objectId;
  }

  const sourcesById = new Map();
  const contentClusters = new Map();
  sections.source_register.forEach((source, index) => {
    const path = `$.source_register[${index}]`;
    const sourceId = registerId(source, path, "SRC_", { revision: true });
    if (!isDict(source)) return;
    sourcesById.set(sourceId, source);
    for (const key of ["source_type", "publisher", "locator", "access", "reuse_rights", "trust_state", "independent_cluster_id"]) {
      if (!pyStr(orElse(source[key], "")).trim()) {
        errors.push(issue("SOURCE_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    const contentHash = pyStr(orElse(source.content_hash, ""));
    if (!HASH_RE.test(contentHash)) {
      errors.push(issue("CONTENT_HASH", `${path}.content_hash`, "Invalid content hash."));
    }
    const cluster = pyStr(orElse(source.independent_cluster_id, ""));
    if (contentClusters.has(contentHash) && contentClusters.get(contentHash) !== cluster) {
      errors.push(issue("DUPLICATE_CLUSTER_SPLIT", `${path}.independent_cluster_id`, "Identical content hashes must share one independent-source cluster."));
    } else if (contentHash) {
      contentClusters.set(contentHash, cluster);
    }
    const observed = parseTime(source.observed_at, `${path}.observed_at`, errors);
    const authorized = parseTime(source.authorized_at, `${path}.authorized_at`, errors, { nullable: true });
    const available = parseTime(source.available_at, `${path}.available_at`, errors);
    parseTime(source.published_at, `${path}.published_at`, errors, { nullable: true });
    parseTime(source.source_updated_at, `${path}.source_updated_at`, errors, { nullable: true });
    if (observed && available && available.us < observed.us) {
      errors.push(issue("AVAILABLE_BEFORE_OBSERVED", `${path}.available_at`, "available_at cannot precede observed_at."));
    }
    if (authorized && available && available.us < authorized.us) {
      errors.push(issue("AVAILABLE_BEFORE_AUTHORIZED", `${path}.available_at`, "available_at cannot precede authorization."));
    }
    if (cutoff && available && available.us > cutoff.us && !["retracted", "disputed"].includes(source.trust_state)) {
      warnings.push(issue("SOURCE_AFTER_CUTOFF", `${path}.available_at`, "Source revision was unavailable at the feed cutoff."));
    }
    if (["restricted", "unknown"].includes(source.access) || source.reuse_rights === "unknown") {
      warnings.push(issue("SOURCE_USE_UNCLEAR", path, "Source cannot be assumed usable for public content."));
    }
  });

  const entityIds = new Set();
  sections.entities.forEach((entity, index) => {
    const path = `$.entities[${index}]`;
    const entityId = registerId(entity, path, "ENT_");
    entityIds.add(entityId);
    if (!isDict(entity)) return;
    if (!pyStr(orElse(entity.canonical_name, "")).trim()) {
      errors.push(issue("ENTITY_NAME", `${path}.canonical_name`, "Canonical entity name is required."));
    }
    const aliases = asList(entity.symbol_aliases, `${path}.symbol_aliases`, errors);
    aliases.forEach((alias, aliasIndex) => {
      const aliasPath = `${path}.symbol_aliases[${aliasIndex}]`;
      if (!isDict(alias) || !pyStr(orElse(alias.symbol, "")).trim()) {
        errors.push(issue("SYMBOL_ALIAS", aliasPath, "Alias requires a symbol."));
        return;
      }
      const validFrom = parseTime(alias.valid_from, `${aliasPath}.valid_from`, errors, { nullable: true });
      const validTo = parseTime(alias.valid_to, `${aliasPath}.valid_to`, errors, { nullable: true });
      if (validFrom && validTo && validFrom.us > validTo.us) {
        errors.push(issue("ALIAS_RANGE", aliasPath, "Alias valid_from cannot be after valid_to."));
      }
    });
  });

  const prefixBySection = {
    news: "NEWS_", calendar_events: "CAL_", narratives: "NAR_",
    trade_ideas: "IDEA_", trade_history: "TRADE_",
  };
  const recordsById = new Map();
  const recordPaths = new Map();
  for (const section of RECORD_SECTIONS) {
    sections[section].forEach((record, index) => {
      const path = `$.${section}[${index}]`;
      const recordId = registerId(record, path, prefixBySection[section], { revision: true });
      if (!isDict(record)) return;
      recordsById.set(recordId, record);
      recordPaths.set(recordId, path);
      const status = record.record_status;
      if (!["active", "quarantined", "superseded", "retracted", "expired"].includes(status)) {
        errors.push(issue("RECORD_STATUS", `${path}.record_status`, "Unsupported record status."));
      }
      const available = parseTime(record.available_at, `${path}.available_at`, errors);
      if (status === ACTIVE && cutoff && available && available.us > cutoff.us) {
        errors.push(issue("TEMPORAL_LEAKAGE", `${path}.available_at`, "Active record was unavailable at the knowledge cutoff."));
      }
      for (const ref of asList(record.entity_refs, `${path}.entity_refs`, errors)) {
        if (!entityIds.has(ref)) {
          errors.push(issue("UNKNOWN_ENTITY_REF", `${path}.entity_refs`, `Unknown entity reference ${pyrepr(ref)}.`));
        }
      }
      for (const ref of asList(record.source_refs, `${path}.source_refs`, errors)) {
        if (!sourcesById.has(ref)) {
          errors.push(issue("UNKNOWN_SOURCE_REF", `${path}.source_refs`, `Unknown source reference ${pyrepr(ref)}.`));
        } else if (status === ACTIVE && sourcesById.get(ref).trust_state === "retracted") {
          errors.push(issue("RETRACTED_SUPPORT", `${path}.source_refs`, "Active record cannot rely on a retracted source."));
        }
      }
    });
  }

  for (const [recordId, record] of recordsById) {
    const path = recordPaths.get(recordId);
    if (recordId.startsWith("NEWS_")) {
      if (!pyTruthy(record.source_refs)) {
        errors.push(issue("NEWS_SOURCE_REQUIRED", `${path}.source_refs`, "News requires a source revision."));
      }
      const observed = parseTime(record.observed_at, `${path}.observed_at`, errors);
      const available = parseTime(record.available_at, `${path}.available_at`, errors);
      if (observed && available && available.us < observed.us) {
        errors.push(issue("AVAILABLE_BEFORE_OBSERVED", `${path}.available_at`, "available_at cannot precede observed_at."));
      }
    } else if (recordId.startsWith("CAL_")) {
      if (!pyTruthy(record.source_refs)) {
        errors.push(issue("CALENDAR_SOURCE_REQUIRED", `${path}.source_refs`, "Calendar event requires a source."));
      }
      parseTime(record.scheduled_at, `${path}.scheduled_at`, errors);
      if (record.event_status === "completed_verified" && !pyTruthy(record.source_refs)) {
        errors.push(issue("COMPLETION_EVIDENCE", path, "Verified completion requires an owned source."));
      }
    } else if (recordId.startsWith("NAR_")) {
      for (const key of ["claim", "horizon", "falsifier"]) {
        if (!pyStr(orElse(record[key], "")).trim()) {
          errors.push(issue("NARRATIVE_FIELD", `${path}.${key}`, `${key} is required.`));
        }
      }
      if (record.narrative_class === "source_bound" && !pyTruthy(record.source_refs)) {
        errors.push(issue("SOURCE_BOUND_NARRATIVE", `${path}.source_refs`, "Source-bound narrative requires a source."));
      }
    } else if (recordId.startsWith("IDEA_")) {
      for (const key of ["thesis", "horizon", "invalidation"]) {
        if (!pyStr(orElse(record[key], "")).trim()) {
          errors.push(issue("IDEA_FIELD", `${path}.${key}`, `${key} is required.`));
        }
      }
      if (!["idea_only", "paper"].includes(record.execution_state)) {
        errors.push(issue("IDEA_EXECUTION_PROMOTION", `${path}.execution_state`, "Execution belongs in trade history, not a trade idea."));
      }
      for (const ref of asList(record.catalyst_refs, `${path}.catalyst_refs`, errors)) {
        if (!recordsById.has(ref) || ref.startsWith("TRADE_") || ref.startsWith("IDEA_")) {
          errors.push(issue("UNKNOWN_CATALYST_REF", `${path}.catalyst_refs`, `Invalid catalyst reference ${pyrepr(ref)}.`));
        }
      }
    } else if (recordId.startsWith("TRADE_")) {
      const ideaRef = record.idea_ref;
      if (ideaRef !== null && ideaRef !== undefined && (!recordsById.has(ideaRef) || !pyStr(ideaRef).startsWith("IDEA_"))) {
        errors.push(issue("UNKNOWN_IDEA_REF", `${path}.idea_ref`, "Trade history idea_ref must resolve to a trade idea."));
      }
      const opened = parseTime(record.opened_at, `${path}.opened_at`, errors, { nullable: true });
      const closed = parseTime(record.closed_at, `${path}.closed_at`, errors, { nullable: true });
      const recorded = parseTime(record.recorded_at, `${path}.recorded_at`, errors);
      if (opened && closed && opened.us > closed.us) {
        errors.push(issue("TRADE_TIME_ORDER", path, "opened_at cannot be after closed_at."));
      }
      if (cutoff && closed && closed.us > cutoff.us && record.record_status === ACTIVE) {
        errors.push(issue("FUTURE_TRADE_OUTCOME", `${path}.closed_at`, "Active history contains an outcome after the cutoff."));
      }
      if (opened && recorded && recorded.us < opened.us) {
        errors.push(issue("TRADE_RECORDED_BEFORE_OPEN", `${path}.recorded_at`, "recorded_at cannot precede opened_at."));
      }
      if (record.trade_type === "executed" && record.execution_verification === "not_applicable") {
        errors.push(issue("EXECUTION_VERIFICATION", `${path}.execution_verification`, "Executed trade requires a verification state."));
      }
      if (record.trade_type !== "executed" && record.execution_verification === "broker_reconciled") {
        errors.push(issue("NON_EXECUTED_RECONCILIATION", `${path}.execution_verification`, "Only executed trades can be broker reconciled."));
      }
      if (record.public_reuse_permission === "record_allowed" && record.trade_type === "executed" && record.execution_verification !== "broker_reconciled") {
        errors.push(issue("PUBLIC_EXECUTION_UNVERIFIED", path, "Public executed-trade reuse requires broker reconciliation."));
      }
      if (record.position_disclosure === "unknown" || record.commercial_relationship === "unknown") {
        warnings.push(issue("DISCLOSURE_UNKNOWN", path, "Unknown material disclosure blocks a ready feed."));
      }
      const performance = record.performance;
      if (!isDict(performance)) {
        errors.push(issue("PERFORMANCE_TYPE", `${path}.performance`, "performance must be an object."));
      } else if (record.trade_type !== "executed" && ["executed_raw", "executed_reconciled"].includes(performance.basis)) {
        errors.push(issue("PERFORMANCE_BASIS", `${path}.performance.basis`, "Execution basis cannot be attached to a non-executed record."));
      }
    }
  }

  sections.links.forEach((link, index) => {
    const path = `$.links[${index}]`;
    registerId(link, path, "LINK_");
    if (!isDict(link)) return;
    for (const key of ["from_ref", "to_ref"]) {
      const ref = link[key];
      if (!allIds.has(ref)) {
        errors.push(issue("UNKNOWN_LINK_REF", `${path}.${key}`, `Unknown link endpoint ${pyrepr(ref)}.`));
      }
    }
    if (pyEq(link.from_ref, link.to_ref)) {
      errors.push(issue("SELF_LINK", path, "A record cannot link to itself."));
    }
  });

  let quality = payload.quality_report;
  if (!isDict(quality)) {
    errors.push(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."));
    quality = {};
  }
  const decision = quality.decision;
  let hardFailures = quality.hard_failures;
  if (!Array.isArray(hardFailures)) {
    errors.push(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hardFailures = [];
  }
  if (hardFailures.length && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."));
  }
  if (decision === "ready" && warnings.some((w) => ["SOURCE_USE_UNCLEAR", "DISCLOSURE_UNKNOWN", "SOURCE_AFTER_CUTOFF"].includes(w.code))) {
    errors.push(issue("READY_WITH_UNRESOLVED_GUARDS", "$.quality_report.decision", "Unresolved rights, disclosure, or cutoff warnings prevent ready."));
  }
  const counts = quality.record_counts;
  const expectedCounts = {
    sources: sections.source_register.length, entities: sections.entities.length,
    news: sections.news.length, calendar_events: sections.calendar_events.length,
    narratives: sections.narratives.length, trade_ideas: sections.trade_ideas.length,
    trade_history: sections.trade_history.length, links: sections.links.length,
    quarantined: RECORD_SECTIONS.reduce(
      (total, section) => total + sections[section].filter((record) => isDict(record) && record.record_status === "quarantined").length,
      0,
    ),
  };
  if (!pyEq(counts, expectedCounts)) {
    errors.push(issue("RECORD_COUNTS", "$.quality_report.record_counts", `Expected exact counts ${pyrepr(expectedCounts)}.`));
  }
  const quarantined = quality.quarantined_records;
  const expectedQuarantined = new Set();
  for (const section of RECORD_SECTIONS) {
    for (const record of sections[section]) {
      if (isDict(record) && record.record_status === "quarantined") {
        expectedQuarantined.add(record.id === undefined ? null : record.id);
      }
    }
  }
  const quarantinedSet = Array.isArray(quarantined) ? new Set(quarantined) : null;
  const quarantineMatches = quarantinedSet !== null
    && quarantinedSet.size === expectedQuarantined.size
    && [...quarantinedSet].every((item) => expectedQuarantined.has(item));
  if (!quarantineMatches) {
    errors.push(issue("QUARANTINE_INDEX", "$.quality_report.quarantined_records", "Quarantine index must exactly match quarantined records."));
  }

  return { valid: !errors.length, errors, warnings };
}

export function validatePayload(payload) {
  if (Array.isArray(payload)) {
    const results = payload.map((item) => validate(item));
    return { valid: results.every((result) => result.valid), results };
  }
  return validate(payload);
}

function main() {
  const argv = process.argv.slice(2);
  const positional = [];
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write("usage: validate_creator_feed.mjs [-h] [json_file]\n");
      process.exit(0);
    }
    if (arg.startsWith("--") && arg.length > 2) {
      process.stderr.write(`error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    }
    positional.push(arg);
  }
  if (positional.length > 1) {
    process.stderr.write(`error: unrecognized arguments: ${positional.slice(1).join(" ")}\n`);
    process.exit(2);
  }
  const raw = positional.length ? readFileSync(positional[0], "utf-8") : readFileSync(0, "utf-8");
  const result = validatePayload(JSON.parse(raw));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
