#!/usr/bin/env node
// Validate frontend-ready Cuebook publishing candidate sets.
// Error codes, paths, messages, stats, JSON output, and exit status are contract.

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { audit_html, pyrepr, walkHtml } from "../../direct-cuebook-viewpoint-visual/scripts/lint_launch_viewpoint_html.mjs";
import { PY_WS_CLASS_SOURCE, pyFloatFixed, pyFromIsoformat, pyLen, pyStrip } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

const ROOT_FIELDS = new Set(["schema_version", "candidate_set_id", "revision", "state", "lineage", "generation_policy", "shared_view", "calibration", "candidates", "selection", "quality_report"]);
const CANDIDATE_FIELDS = new Set(["candidate_id", "label", "angle", "meaning_fingerprint", "post_ref", "copy", "visual", "frame", "evidence_anchors", "settlement", "public_disclosures", "quality"]);
const ANGLES = new Set(["conviction", "evidence", "catalyst", "mechanism", "countercase"]);
const CALIBRATION_STATES = new Set(["ready", "degraded", "not_applicable", "blocked"]);
const PROCESS_TERMS = new Set(["工作流", "数据库字段", "证据状态", "内部校准", "已计算", "已确认", "待补数据", "待补充数据", "模型生成过程"]);
const AI_PHRASES = new Set(["值得关注的是", "核心逻辑在于", "从机制上看", "这意味着什么"]);
export const MATERIAL_REQUEST_CLASSES = new Set(["news_anchor", "official_event", "valuation_metric", "comparison_metric", "price_level", "market_series", "settlement_reference"]);
const METRIC_REQUEST_CLASSES = new Set(["valuation_metric", "comparison_metric"]);
export const SETTLEMENT_ELIGIBILITY_FIELDS = new Set(["metric", "operator", "threshold", "deadline", "authoritative_source"]);
export const SETTLEMENT_CONFIRMATION_FIELDS = new Set([...SETTLEMENT_ELIGIBILITY_FIELDS, "subject", "direction", "baseline", "market_session"]);
const COMMON_EVIDENCE_ANCHOR_FIELDS = new Set(["anchor_id", "request_class", "kind", "title", "publisher", "url", "published_at", "as_of", "fact_refs"]);
const EVIDENCE_ANCHOR_FIELDS = new Map([
  ["news_anchor", COMMON_EVIDENCE_ANCHOR_FIELDS],
  ["official_event", COMMON_EVIDENCE_ANCHOR_FIELDS],
  ["valuation_metric", new Set([...COMMON_EVIDENCE_ANCHOR_FIELDS, "metric"])],
  ["comparison_metric", new Set([...COMMON_EVIDENCE_ANCHOR_FIELDS, "metric"])],
  ["price_level", new Set([...COMMON_EVIDENCE_ANCHOR_FIELDS, "price_observation"])],
  ["market_series", new Set([...COMMON_EVIDENCE_ANCHOR_FIELDS, "market_series"])],
  ["settlement_reference", new Set([...COMMON_EVIDENCE_ANCHOR_FIELDS, "settlement_reference"])],
]);
const METRIC_FIELDS = new Set(["name", "basis", "value_state", "value", "unit", "comparison_subject", "not_meaningful_reason"]);
const PRICE_OBSERVATION_FIELDS = new Set(["instrument_ref", "value", "unit", "observed_at", "observation_basis", "market_session"]);
const PRICE_OBSERVATION_BASES = new Set(["last_trade", "last_close", "midpoint", "official_close", "official_settlement", "spot", "intraday", "nav", "event_status"]);
const MARKET_SESSIONS = new Set(["regular", "extended", "all_sessions", "continuous", "event_window"]);
const MARKET_SERIES_FIELDS = new Set(["series_ref", "instrument_refs", "metric", "interval", "window_start", "window_end", "timezone", "observation_basis"]);
const SETTLEMENT_REFERENCE_FIELDS = new Set(["claim_ref", "eligibility_fields"]);
export const WEIGHTS = {
  claim_fidelity: 0.20,
  compression: 0.15,
  human_voice: 0.15,
  evidence_integrity: 0.20,
  visual_craft: 0.15,
  three_second: 0.15,
};

export function issue(code, path, message) {
  return { code, path, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyInt(value) {
  return typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value));
}

function pyNumber(value) {
  return typeof value === "boolean" ? Number(value) : value;
}

function pyEquals(left, right) {
  if (
    (typeof left === "boolean" || typeof left === "number")
    && (typeof right === "boolean" || typeof right === "number")
  ) return Number(left) === Number(right);
  return left === right;
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function strOrEmpty(value) {
  if (!pyTruthy(value)) return "";
  if (typeof value === "string") return value;
  if (value === true) return "True";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function nonemptyString(value) {
  return typeof value === "string" && pyStrip(value) !== "";
}

export function parseIsoDatetime(value) {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const normalized = value.endsWith("Z") ? `${value.slice(0, -1)}+00:00` : value;
  const parsed = pyFromIsoformat(normalized);
  return parsed !== null && parsed.aware ? parsed : null;
}

export function stringSet(value, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.some((item) => !nonemptyString(item)) || value.length !== new Set(value).size) return null;
  return new Set(value);
}

function sortedStrings(values) {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function requireExactFields(value, expected, path, code, errors) {
  const keys = new Set(Object.keys(value));
  const missing = sortedStrings([...expected].filter((key) => !keys.has(key)));
  const unknown = sortedStrings([...keys].filter((key) => !expected.has(key)));
  if (missing.length || unknown.length) {
    errors.push(issue(code, path, `Fields must match the contract exactly; missing=${pyrepr(missing)}, unknown=${pyrepr(unknown)}.`));
  }
}

function validateMetricObservation(value, requestClass, path, errors) {
  if (!isObject(value)) {
    errors.push(issue("EVIDENCE_METRIC", path, "Metric evidence requires a typed metric object."));
    return;
  }
  requireExactFields(value, METRIC_FIELDS, path, "EVIDENCE_METRIC_FIELDS", errors);
  for (const key of ["name", "basis", "unit"]) {
    if (!nonemptyString(value[key])) errors.push(issue("EVIDENCE_METRIC", `${path}.${key}`, `Metric ${key} must be non-empty.`));
  }
  const comparisonSubject = value.comparison_subject;
  if (requestClass === "comparison_metric" && !nonemptyString(comparisonSubject)) {
    errors.push(issue("EVIDENCE_METRIC", `${path}.comparison_subject`, "Comparison metrics require a named comparison subject."));
  } else if (comparisonSubject !== null && comparisonSubject !== undefined && !nonemptyString(comparisonSubject)) {
    errors.push(issue("EVIDENCE_METRIC", `${path}.comparison_subject`, "comparison_subject must be null or non-empty."));
  }
  const valueState = value.value_state;
  const metricValue = value.value;
  const reason = value.not_meaningful_reason;
  if (valueState === "numeric") {
    if (!finiteNumber(metricValue)) errors.push(issue("EVIDENCE_METRIC_VALUE", `${path}.value`, "Numeric metrics require a finite value."));
    if (reason !== null && reason !== undefined) errors.push(issue("EVIDENCE_METRIC_VALUE", `${path}.not_meaningful_reason`, "Numeric metrics cannot carry an N/M reason."));
  } else if (valueState === "N/M") {
    if (metricValue !== null) errors.push(issue("EVIDENCE_METRIC_VALUE", `${path}.value`, "N/M metrics must use a null numeric value."));
    if (!nonemptyString(reason)) errors.push(issue("EVIDENCE_METRIC_VALUE", `${path}.not_meaningful_reason`, "N/M metrics require a reason."));
  } else {
    errors.push(issue("EVIDENCE_METRIC_VALUE", `${path}.value_state`, "Metric value_state must be numeric or N/M."));
  }
}

function validatePriceObservation(value, path, errors) {
  if (!isObject(value)) {
    errors.push(issue("EVIDENCE_PRICE", path, "Price-level evidence requires a typed price observation."));
    return;
  }
  requireExactFields(value, PRICE_OBSERVATION_FIELDS, path, "EVIDENCE_PRICE_FIELDS", errors);
  for (const key of ["instrument_ref", "unit"]) if (!nonemptyString(value[key])) errors.push(issue("EVIDENCE_PRICE", `${path}.${key}`, `Price ${key} must be non-empty.`));
  if (!finiteNumber(value.value)) errors.push(issue("EVIDENCE_PRICE", `${path}.value`, "Price value must be finite."));
  if (parseIsoDatetime(value.observed_at) === null) errors.push(issue("EVIDENCE_PRICE", `${path}.observed_at`, "Price observed_at must be an ISO date-time with timezone."));
  if (!PRICE_OBSERVATION_BASES.has(value.observation_basis)) errors.push(issue("EVIDENCE_PRICE_BASIS", `${path}.observation_basis`, "Unsupported price observation basis."));
  if (!MARKET_SESSIONS.has(value.market_session)) errors.push(issue("EVIDENCE_PRICE_BASIS", `${path}.market_session`, "Unsupported price market session."));
}

function validateMarketSeries(value, path, errors) {
  if (!isObject(value)) {
    errors.push(issue("EVIDENCE_SERIES", path, "Market-series evidence requires a typed series projection."));
    return;
  }
  requireExactFields(value, MARKET_SERIES_FIELDS, path, "EVIDENCE_SERIES_FIELDS", errors);
  for (const key of ["series_ref", "metric", "interval", "timezone", "observation_basis"]) if (!nonemptyString(value[key])) errors.push(issue("EVIDENCE_SERIES", `${path}.${key}`, `Series ${key} must be non-empty.`));
  if (stringSet(value.instrument_refs, 1) === null) errors.push(issue("EVIDENCE_SERIES", `${path}.instrument_refs`, "Series instrument refs must be unique and non-empty."));
  const windowStart = parseIsoDatetime(value.window_start);
  const windowEnd = parseIsoDatetime(value.window_end);
  if (windowStart === null) errors.push(issue("EVIDENCE_SERIES", `${path}.window_start`, "Series window_start must be an ISO date-time with timezone."));
  if (windowEnd === null) errors.push(issue("EVIDENCE_SERIES", `${path}.window_end`, "Series window_end must be an ISO date-time with timezone."));
  if (windowStart !== null && windowEnd !== null && windowEnd.epoch < windowStart.epoch) errors.push(issue("EVIDENCE_SERIES_WINDOW", path, "Series window_end cannot precede window_start."));
}

function setEquals(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function validateSettlementReference(value, lineageClaimRef, path, errors) {
  if (!isObject(value)) {
    errors.push(issue("EVIDENCE_SETTLEMENT", path, "Settlement-reference evidence requires a typed reference."));
    return;
  }
  requireExactFields(value, SETTLEMENT_REFERENCE_FIELDS, path, "EVIDENCE_SETTLEMENT_FIELDS", errors);
  const claimRef = value.claim_ref;
  if (!nonemptyString(claimRef)) errors.push(issue("EVIDENCE_SETTLEMENT", `${path}.claim_ref`, "Settlement reference requires a claim ref."));
  else if (lineageClaimRef !== null && lineageClaimRef !== undefined && claimRef !== lineageClaimRef) errors.push(issue("EVIDENCE_SETTLEMENT_REF", `${path}.claim_ref`, "Settlement evidence must match the lineage claim ref."));
  const eligibilityFields = stringSet(value.eligibility_fields);
  if (eligibilityFields === null || !setEquals(eligibilityFields, SETTLEMENT_ELIGIBILITY_FIELDS)) errors.push(issue("EVIDENCE_SETTLEMENT_FIELDS", `${path}.eligibility_fields`, "Settlement reference must cover all eligibility fields."));
}

export function safeRelativeRef(value, suffix = null) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.startsWith("~")) return false;
  if (value.includes("://") || value.split("/").includes("..")) return false;
  return suffix === null || value.toLowerCase().endsWith(suffix);
}

export function normalizedText(value) {
  return value.replace(new RegExp(`[${PY_WS_CLASS_SOURCE}]+`, "gu"), "").toLowerCase();
}

export function hardNumberCount(value) {
  return [...value.matchAll(/(?<![A-Za-z])\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:[%+×xX]|[KMBkmb])?/g)].length;
}

function pythonStr(value) {
  if (!pyTruthy(value)) return "";
  if (typeof value === "string") return value;
  if (value === true) return "True";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function pythonRawStr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

export function visibleCharCount(copy) {
  const parts = [pythonStr(copy.headline), pythonStr(copy.body), pythonStr(copy.close)];
  const tags = Array.isArray(copy.tags) ? copy.tags : [];
  return parts.reduce((sum, item) => sum + pyLen(pyStrip(item)), 0) + tags.reduce((sum, tag) => sum + pyLen(pyStrip(pythonRawStr(tag))), 0);
}

export function canonicalFrameBody(copy) {
  return [pythonStr(copy.body), pythonStr(copy.close)].map((part) => pyStrip(part)).filter(Boolean).join("\n\n");
}

export function htmlVisibleCharCount(html) {
  const parts = [];
  let skipDepth = 0;
  const skip = new Set(["style", "script", "title"]);
  const handler = {
    handleStartTag(tag) { if (skip.has(tag)) skipDepth += 1; },
    handleStartEndTag(tag) { if (skip.has(tag)) { skipDepth += 1; skipDepth -= 1; } },
    handleEndTag(tag) { if (skip.has(tag) && skipDepth) skipDepth -= 1; },
    handleData(data) { if (!skipDepth && pyStrip(data)) parts.push(data); },
  };
  walkHtml(html, handler);
  return pyLen(parts.join("").replace(new RegExp(`[${PY_WS_CLASS_SOURCE}]+`, "gu"), ""));
}

function canonicalJson(value) {
  const normalize = (node) => {
    if (Array.isArray(node)) return node.map(normalize);
    if (isObject(node)) return Object.fromEntries(Object.keys(node).sort().map((key) => [key, normalize(node[key])]));
    return node;
  };
  return JSON.stringify(normalize(value));
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

export function validate(payload, assetRoot = null) {
  const errors = [];
  const warnings = [];
  const stats = { candidate_count: 0, max_visible_chars: 0 };
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "PublishCandidateSetV1 must be an object.")], warnings: [], stats };

  for (const key of [...ROOT_FIELDS].filter((field) => !Object.hasOwn(payload, field)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of Object.keys(payload).filter((field) => !ROOT_FIELDS.has(field)).sort()) errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  if (payload.schema_version !== "publish-candidate-set-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected publish-candidate-set-v1."));
  if (!/^PUBSET_[A-Za-z0-9_:-]{8,}$/.test(strOrEmpty(payload.candidate_set_id))) errors.push(issue("CANDIDATE_SET_ID", "$.candidate_set_id", "Invalid candidate set ID."));
  if (!pyInt(payload.revision) || pyNumber(payload.revision ?? 0) < 1) errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  const state = payload.state;
  if (!new Set(["draft", "ready_for_selection", "selected", "blocked"]).has(state)) errors.push(issue("STATE", "$.state", "Unsupported candidate-set state."));

  const lineage = isObject(payload.lineage) ? payload.lineage : {};
  const rootFingerprint = lineage.fingerprint_sha256;
  if (!/^sha256:[a-f0-9]{64}$/.test(strOrEmpty(rootFingerprint))) errors.push(issue("FINGERPRINT", "$.lineage.fingerprint_sha256", "A canonical sha256 fingerprint is required."));
  const settlementRef = lineage.settlement_claim_ref;
  if (settlementRef !== null && settlementRef !== undefined && !nonemptyString(settlementRef)) errors.push(issue("SETTLEMENT_REF", "$.lineage.settlement_claim_ref", "Settlement claim ref must be null or non-empty."));

  const policy = isObject(payload.generation_policy) ? payload.generation_policy : {};
  const expectedPolicy = { autonomous: true, user_iteration_required: false, calibration_owner: "skills", fallback_policy: "degrade_then_omit", linked_evidence_policy: "required_when_material" };
  for (const [key, expected] of Object.entries(expectedPolicy)) if (!pyEquals(policy[key], expected)) errors.push(issue("AUTONOMOUS_POLICY", `$.generation_policy.${key}`, `Expected ${pyrepr(expected)}.`));
  if (![1, 3].includes(policy.candidate_count)) errors.push(issue("CANDIDATE_COUNT", "$.generation_policy.candidate_count", "Candidate count must be one selected Frame or three explicitly requested alternatives."));
  const retryLimit = policy.retry_limit;
  if (!pyInt(retryLimit) || pyNumber(retryLimit) < 0 || pyNumber(retryLimit) > 3) errors.push(issue("RETRY_LIMIT", "$.generation_policy.retry_limit", "Retry limit must be 0-3."));
  const budget = isObject(policy.copy_budget) ? policy.copy_budget : {};
  const budgetLimits = { headline_max: [12, 32], body_max: [80, 220], close_max: [20, 56], total_max: [160, 300], paragraph_max: [2, 4], hard_number_max: [1, 3] };
  for (const [key, [minimum, maximum]] of Object.entries(budgetLimits)) {
    const value = budget[key];
    if (!pyInt(value) || pyNumber(value) < minimum || pyNumber(value) > maximum) errors.push(issue("COPY_BUDGET", `$.generation_policy.copy_budget.${key}`, `Budget must be ${minimum}-${maximum}.`));
  }
  const visualCharMax = policy.visual_visible_char_max;
  if (!pyInt(visualCharMax) || pyNumber(visualCharMax) < 60 || pyNumber(visualCharMax) > 120) errors.push(issue("VISUAL_BUDGET", "$.generation_policy.visual_visible_char_max", "Visual character budget must be 60-120."));

  const sharedView = isObject(payload.shared_view) ? payload.shared_view : {};
  requireExactFields(sharedView, new Set(["ticker", "direction", "horizon", "claim", "caveat", "material_evidence", "settlement_eligibility"]), "$.shared_view", "SHARED_VIEW_FIELDS", errors);
  const materialEvidence = isObject(sharedView.material_evidence) ? sharedView.material_evidence : {};
  requireExactFields(materialEvidence, new Set(["requirements"]), "$.shared_view.material_evidence", "MATERIAL_EVIDENCE_FIELDS", errors);
  let rawRequirements = materialEvidence.requirements;
  if (!Array.isArray(rawRequirements) || rawRequirements.length > 8) {
    errors.push(issue("MATERIAL_EVIDENCE", "$.shared_view.material_evidence.requirements", "Material evidence requirements must be an array with at most eight items."));
    rawRequirements = [];
  }
  const requirementIds = new Set();
  const requiredAnchorTypes = new Map();
  rawRequirements.forEach((rawRequirement, index) => {
    const requirementPath = `$.shared_view.material_evidence.requirements[${index}]`;
    if (!isObject(rawRequirement)) { errors.push(issue("MATERIAL_REQUIREMENT", requirementPath, "Material evidence requirement must be an object.")); return; }
    requireExactFields(rawRequirement, new Set(["requirement_id", "request_class", "required_anchor_ids"]), requirementPath, "MATERIAL_REQUIREMENT_FIELDS", errors);
    const requirementId = rawRequirement.requirement_id;
    if (typeof requirementId !== "string" || !/^D[1-9][0-9]*$/.test(requirementId)) errors.push(issue("MATERIAL_REQUIREMENT_ID", `${requirementPath}.requirement_id`, "Requirement ID must match the expression-plan D<number> form."));
    else if (requirementIds.has(requirementId)) errors.push(issue("MATERIAL_REQUIREMENT_ID", `${requirementPath}.requirement_id`, "Requirement IDs must be unique."));
    else requirementIds.add(requirementId);
    const requestClass = rawRequirement.request_class;
    if (typeof requestClass !== "string" || !MATERIAL_REQUEST_CLASSES.has(requestClass)) errors.push(issue("MATERIAL_REQUIREMENT_TYPE", `${requirementPath}.request_class`, "Unsupported material evidence request class."));
    const anchorIds = stringSet(rawRequirement.required_anchor_ids, 1);
    if (anchorIds === null) { errors.push(issue("MATERIAL_REQUIREMENT_ANCHORS", `${requirementPath}.required_anchor_ids`, "Each material requirement needs unique evidence anchor IDs.")); return; }
    for (const anchorId of anchorIds) {
      if (!/^EVA_[A-Za-z0-9_:-]{4,}$/.test(anchorId)) errors.push(issue("MATERIAL_REQUIREMENT_ANCHORS", `${requirementPath}.required_anchor_ids`, `Invalid evidence anchor ID ${pyrepr(anchorId)}.`));
      const existingType = requiredAnchorTypes.get(anchorId);
      if (existingType !== undefined) errors.push(issue("MATERIAL_REQUIREMENT_ANCHORS", `${requirementPath}.required_anchor_ids`, `Required anchor ${pyrepr(anchorId)} is assigned more than once.`));
      else if (MATERIAL_REQUEST_CLASSES.has(requestClass)) requiredAnchorTypes.set(anchorId, requestClass);
    }
  });
  const requiredAnchorIds = new Set(requiredAnchorTypes.keys());

  const settlementEligibility = isObject(sharedView.settlement_eligibility) ? sharedView.settlement_eligibility : {};
  requireExactFields(settlementEligibility, new Set(["status", "requirements", "missing_requirements"]), "$.shared_view.settlement_eligibility", "SETTLEMENT_ELIGIBILITY_FIELDS", errors);
  const eligibilityStatus = settlementEligibility.status;
  if (typeof eligibilityStatus !== "string" || !new Set(["ineligible", "candidate", "eligible", "blocked"]).has(eligibilityStatus)) errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Unsupported settlement eligibility status."));
  const eligibilityRequirements = isObject(settlementEligibility.requirements) ? settlementEligibility.requirements : {};
  requireExactFields(eligibilityRequirements, SETTLEMENT_ELIGIBILITY_FIELDS, "$.shared_view.settlement_eligibility.requirements", "SETTLEMENT_ELIGIBILITY_FIELDS", errors);
  for (const field of SETTLEMENT_ELIGIBILITY_FIELDS) if (typeof eligibilityRequirements[field] !== "boolean") errors.push(issue("SETTLEMENT_ELIGIBILITY", `$.shared_view.settlement_eligibility.requirements.${field}`, "Settlement eligibility requirements must be boolean."));
  let missingEligibility = stringSet(settlementEligibility.missing_requirements);
  if (missingEligibility === null || ![...missingEligibility].every((field) => SETTLEMENT_ELIGIBILITY_FIELDS.has(field))) {
    errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.missing_requirements", "Missing settlement requirements must be unique canonical field names."));
    missingEligibility = new Set();
  }
  const computedMissingEligibility = new Set([...SETTLEMENT_ELIGIBILITY_FIELDS].filter((field) => eligibilityRequirements[field] === false));
  if (eligibilityStatus === "ineligible") {
    if (Object.values(eligibilityRequirements).some((value) => value === true) || missingEligibility.size) errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "Ineligible settlement must not assert requirements or missing fields."));
  } else if (!setEquals(missingEligibility, computedMissingEligibility)) errors.push(issue("SETTLEMENT_ELIGIBILITY_MISMATCH", "$.shared_view.settlement_eligibility.missing_requirements", "Missing requirements must match false eligibility fields."));
  if (eligibilityStatus === "eligible" && computedMissingEligibility.size) errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Eligible settlement requires every eligibility field."));
  if (settlementRef !== null && settlementRef !== undefined && (eligibilityStatus !== "eligible" || computedMissingEligibility.size)) errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "A bound settlement claim requires complete eligible semantics."));
  if (new Set(["ready_for_selection", "selected"]).has(state) && eligibilityStatus === "blocked") errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility.status", "Selectable output cannot preserve blocked settlement eligibility."));

  const calibration = isObject(payload.calibration) ? payload.calibration : {};
  for (const key of ["research", "market_data", "semantics", "policy", "visual", "settlement"]) if (!CALIBRATION_STATES.has(calibration[key])) errors.push(issue("CALIBRATION_STATE", `$.calibration.${key}`, "Unsupported calibration state."));
  if (new Set(["ready_for_selection", "selected"]).has(state) && Object.values(calibration).includes("blocked")) errors.push(issue("BLOCKED_CALIBRATION", "$.calibration", "Selectable candidates cannot contain a blocked calibration stage."));

  let candidates = payload.candidates;
  if (!Array.isArray(candidates)) { errors.push(issue("CANDIDATES", "$.candidates", "Candidates must be an array.")); candidates = []; }
  stats.candidate_count = candidates.length;
  if (candidates.length > 3) errors.push(issue("CANDIDATE_COUNT", "$.candidates", "At most three candidates are allowed."));
  if (state === "ready_for_selection" && candidates.length !== 3) errors.push(issue("CANDIDATE_COUNT", "$.candidates", "Unselected alternatives require exactly three explicitly requested candidates."));
  if (new Set(["ready_for_selection", "selected"]).has(state) && candidates.length !== policy.candidate_count) errors.push(issue("CANDIDATE_COUNT", "$.candidates", "Selectable output must match its declared one or three candidates."));
  if (state === "blocked" && candidates.length) errors.push(issue("BLOCKED_HAS_CANDIDATES", "$.candidates", "Blocked output must not expose partial candidates."));

  const ids = new Set(), labels = new Set(), angles = new Set(), posts = new Set(), directions = new Set(), previews = new Set(), compactPreviews = new Set(), htmlRefs = new Set(), normalizedCopies = new Set(), settlementProjections = new Set(), materialAnchorSets = new Set(), passedCandidates = new Set();
  const settlementStates = [];
  const materialAnchorPayloads = new Map();

  candidates.forEach((candidate, index) => {
    const path = `$.candidates[${index}]`;
    if (!isObject(candidate)) { errors.push(issue("CANDIDATE_TYPE", path, "Candidate must be an object.")); return; }
    for (const key of [...CANDIDATE_FIELDS].filter((field) => !Object.hasOwn(candidate, field)).sort()) errors.push(issue("CANDIDATE_FIELD", `${path}.${key}`, "Required candidate field is missing."));
    for (const key of Object.keys(candidate).filter((field) => !CANDIDATE_FIELDS.has(field)).sort()) errors.push(issue("CANDIDATE_FIELD", `${path}.${key}`, "Unknown candidate field."));
    const candidateId = candidate.candidate_id;
    if (!/^PUBCAND_[A-Za-z0-9_:-]{6,}$/.test(strOrEmpty(candidateId))) errors.push(issue("CANDIDATE_ID", `${path}.candidate_id`, "Invalid candidate ID."));
    else if (ids.has(candidateId)) errors.push(issue("DUPLICATE_CANDIDATE", `${path}.candidate_id`, "Candidate IDs must be unique."));
    else ids.add(String(candidateId));
    const label = candidate.label;
    if (typeof label !== "string" || pyLen(pyStrip(label)) < 1 || pyLen(pyStrip(label)) > 12) errors.push(issue("LABEL", `${path}.label`, "Label must be 1-12 characters."));
    else if (labels.has(pyStrip(label))) errors.push(issue("DUPLICATE_LABEL", `${path}.label`, "Candidate labels must be unique."));
    else labels.add(pyStrip(label));
    const angle = candidate.angle;
    if (!ANGLES.has(angle)) errors.push(issue("ANGLE", `${path}.angle`, "Unsupported candidate angle."));
    else if (angles.has(angle)) errors.push(issue("DUPLICATE_ANGLE", `${path}.angle`, "Candidate angles must be distinct."));
    else angles.add(String(angle));
    if (candidate.meaning_fingerprint !== rootFingerprint) errors.push(issue("FINGERPRINT_MISMATCH", `${path}.meaning_fingerprint`, "Candidate must preserve the shared meaning fingerprint."));
    const postRef = candidate.post_ref;
    if (typeof postRef !== "string" || !postRef) errors.push(issue("POST_REF", `${path}.post_ref`, "Post ref is required."));
    else if (posts.has(postRef)) errors.push(issue("DUPLICATE_POST", `${path}.post_ref`, "Each candidate needs a distinct PostV1 ref."));
    else posts.add(postRef);

    const copy = isObject(candidate.copy) ? candidate.copy : {};
    const headline = pythonStr(copy.headline), body = pythonStr(copy.body), close = pythonStr(copy.close);
    const tags = Array.isArray(copy.tags) ? copy.tags : [];
    for (const [key, value] of Object.entries({ headline, body, close })) {
      const limit = budget[`${key}_max`];
      if (!pyStrip(value)) errors.push(issue("COPY_REQUIRED", `${path}.copy.${key}`, "Copy field cannot be empty."));
      else if (pyInt(limit) && pyLen(pyStrip(value)) > pyNumber(limit)) errors.push(issue("COPY_BUDGET_EXCEEDED", `${path}.copy.${key}`, `Copy exceeds ${pythonStr(limit)} visible characters.`));
    }
    if (tags.length < 2 || tags.length > 4 || tags.length !== new Set(tags).size || tags.some((tag) => typeof tag !== "string" || pyLen(pyStrip(tag)) < 1 || pyLen(pyStrip(tag)) > 12)) errors.push(issue("TAGS", `${path}.copy.tags`, "Use two to four unique tags of at most 12 characters."));
    const calculatedCount = visibleCharCount(copy);
    stats.max_visible_chars = Math.max(stats.max_visible_chars, calculatedCount);
    if (!pyEquals(copy.visible_char_count, calculatedCount)) errors.push(issue("CHAR_COUNT", `${path}.copy.visible_char_count`, `Expected ${calculatedCount}.`));
    if (pyInt(budget.total_max) && calculatedCount > pyNumber(budget.total_max)) errors.push(issue("TOTAL_COPY_BUDGET", `${path}.copy`, `Visible copy exceeds ${pythonStr(budget.total_max)} characters.`));
    const paragraphs = body.split(/\n+/u).map((part) => pyStrip(part)).filter(Boolean);
    if (pyInt(budget.paragraph_max) && paragraphs.length > pyNumber(budget.paragraph_max)) errors.push(issue("PARAGRAPH_BUDGET", `${path}.copy.body`, `Body exceeds ${pythonStr(budget.paragraph_max)} paragraphs.`));
    const numberCount = hardNumberCount(`${headline} ${body} ${close}`);
    if (pyInt(budget.hard_number_max) && numberCount > pyNumber(budget.hard_number_max)) errors.push(issue("HARD_NUMBER_BUDGET", `${path}.copy`, `Copy uses ${numberCount} hard numbers; maximum is ${pythonStr(budget.hard_number_max)}.`));
    const publicCopy = `${headline}\n${body}\n${close}`;
    for (const term of sortedStrings(new Set([...PROCESS_TERMS, ...AI_PHRASES]))) if (publicCopy.includes(term)) errors.push(issue("PUBLIC_LANGUAGE", `${path}.copy`, `Remove internal or stock AI phrase ${pyrepr(term)}.`));
    if (/不是.{0,18}而是/su.test(publicCopy)) errors.push(issue("PUBLIC_LANGUAGE", `${path}.copy`, "Remove the repeated '不是 A 而是 B' frame."));
    const copyKey = normalizedText(publicCopy);
    if (normalizedCopies.has(copyKey)) errors.push(issue("DUPLICATE_COPY", `${path}.copy`, "Candidate copies must be structurally distinct."));
    normalizedCopies.add(copyKey);

    const visual = isObject(candidate.visual) ? candidate.visual : {};
    const direction = visual.direction_ref;
    if (typeof direction !== "string" || !direction) errors.push(issue("DIRECTION_REF", `${path}.visual.direction_ref`, "Visual direction ref is required."));
    else if (directions.has(direction)) errors.push(issue("DUPLICATE_DIRECTION", `${path}.visual.direction_ref`, "Each candidate needs a distinct visual direction."));
    else directions.add(direction);
    const rendererMode = visual.renderer_mode ?? "cuebook_template";
    if (!new Set(["cuebook_template", "finished_bitmap"]).has(rendererMode)) {
      errors.push(issue("RENDERER_MODE", `${path}.visual.renderer_mode`, "Use cuebook_template or finished_bitmap."));
    }
    const htmlRef = visual.html_ref;
    if (rendererMode === "cuebook_template") {
      if (!safeRelativeRef(htmlRef, ".html")) errors.push(issue("VISUAL_REF", `${path}.visual.html_ref`, "Template mode needs a safe relative HTML ref."));
      else if (htmlRefs.has(htmlRef)) errors.push(issue("DUPLICATE_VISUAL_REF", `${path}.visual.html_ref`, "HTML refs must be unique."));
      else {
        htmlRefs.add(htmlRef);
        if (assetRoot !== null && assetRoot !== undefined) {
          const htmlPath = isAbsolute(htmlRef) ? htmlRef : resolve(String(assetRoot), htmlRef);
          if (!isFile(htmlPath)) errors.push(issue("VISUAL_MISSING", `${path}.visual.html_ref`, `Missing visual asset ${pyrepr(htmlRef)}.`));
          else {
            const html = readFileSync(htmlPath, "utf8");
            const measuredChars = htmlVisibleCharCount(html);
            if (!pyEquals(visual.visible_char_count, measuredChars)) errors.push(issue("VISUAL_CHAR_COUNT", `${path}.visual.visible_char_count`, `Expected ${measuredChars} from HTML.`));
            const launchAudit = audit_html(html);
            for (const launchError of launchAudit.errors) errors.push(issue(`VISUAL_${launchError.code}`, `${path}.visual.html_ref`, launchError.message));
          }
        }
      }
    } else if (htmlRef !== null) {
      errors.push(issue("BITMAP_HTML_UNEXPECTED", `${path}.visual.html_ref`, "finished_bitmap must use null and must not be blocked by missing original HTML."));
    }
    const declaredVisualChars = visual.visible_char_count;
    if (!pyInt(declaredVisualChars) || pyNumber(declaredVisualChars) < 1) errors.push(issue("VISUAL_CHAR_COUNT", `${path}.visual.visible_char_count`, "A positive visual character count is required."));
    else if (pyInt(visualCharMax) && pyNumber(declaredVisualChars) > pyNumber(visualCharMax)) errors.push(issue("VISUAL_COPY_BUDGET", `${path}.visual.visible_char_count`, `Visual copy exceeds ${pythonStr(visualCharMax)} characters.`));
    for (const [key, seen] of [["preview_ref", previews], ["compact_preview_ref", compactPreviews]]) {
      const ref = visual[key];
      if (!safeRelativeRef(ref, ".png")) { errors.push(issue("VISUAL_REF", `${path}.visual.${key}`, "Use a safe relative PNG ref.")); continue; }
      if (seen.has(ref)) errors.push(issue("DUPLICATE_VISUAL_REF", `${path}.visual.${key}`, "Preview refs must be unique."));
      seen.add(ref);
      if (assetRoot !== null && assetRoot !== undefined && !isFile(resolve(String(assetRoot), ref))) errors.push(issue("VISUAL_MISSING", `${path}.visual.${key}`, `Missing visual asset ${pyrepr(ref)}.`));
    }

    const frame = isObject(candidate.frame) ? candidate.frame : {};
    requireExactFields(frame, new Set(["title", "body", "image_ref", "alt_text"]), `${path}.frame`, "FRAME_PROJECTION_FIELDS", errors);
    const expectedFrame = {
      title: pyStrip(headline),
      body: canonicalFrameBody(copy),
      image_ref: visual.preview_ref,
      alt_text: visual.alt_text,
    };
    for (const [field, expected] of Object.entries(expectedFrame)) {
      if (frame[field] !== expected) errors.push(issue("FRAME_PROJECTION_MISMATCH", `${path}.frame.${field}`, `Frame ${field} must match the selected canonical copy and paired publication image.`));
    }
    if (!safeRelativeRef(frame.image_ref, ".png")) errors.push(issue("FRAME_IMAGE_REF", `${path}.frame.image_ref`, "Frame image_ref must be one safe relative PNG ref."));
    if (!nonemptyString(frame.title) || pyLen(pyStrip(frame.title)) < 2 || pyLen(pyStrip(frame.title)) > 32) errors.push(issue("FRAME_TITLE", `${path}.frame.title`, "Frame title must be 2-32 visible characters."));
    if (!nonemptyString(frame.body) || pyLen(pyStrip(frame.body)) < 20 || pyLen(pyStrip(frame.body)) > 280) errors.push(issue("FRAME_BODY", `${path}.frame.body`, "Frame body must be 20-280 visible characters."));
    if (!nonemptyString(frame.alt_text) || pyLen(pyStrip(frame.alt_text)) < 2 || pyLen(pyStrip(frame.alt_text)) > 120) errors.push(issue("FRAME_ALT_TEXT", `${path}.frame.alt_text`, "Frame alt text must be 2-120 visible characters."));

    let evidenceAnchors = candidate.evidence_anchors;
    if (!Array.isArray(evidenceAnchors) || evidenceAnchors.length > 8) { errors.push(issue("EVIDENCE_ANCHORS", `${path}.evidence_anchors`, "Evidence anchors must be an array with at most eight items.")); evidenceAnchors = []; }
    const anchorIds = new Set();
    const anchorTypes = new Map();
    evidenceAnchors.forEach((anchor, anchorIndex) => {
      const anchorPath = `${path}.evidence_anchors[${anchorIndex}]`;
      if (!isObject(anchor)) { errors.push(issue("EVIDENCE_ANCHOR", anchorPath, "Evidence anchor must be an object.")); return; }
      const requestClass = anchor.request_class;
      let expectedAnchorFields;
      if (typeof requestClass !== "string" || !MATERIAL_REQUEST_CLASSES.has(requestClass)) { errors.push(issue("EVIDENCE_ANCHOR_TYPE", `${anchorPath}.request_class`, "Unsupported evidence anchor request class.")); expectedAnchorFields = COMMON_EVIDENCE_ANCHOR_FIELDS; }
      else expectedAnchorFields = EVIDENCE_ANCHOR_FIELDS.get(requestClass);
      requireExactFields(anchor, expectedAnchorFields, anchorPath, "EVIDENCE_ANCHOR_FIELDS", errors);
      const anchorId = anchor.anchor_id;
      const anchorKey = typeof anchorId === "string" ? anchorId : "";
      if (!/^EVA_[A-Za-z0-9_:-]{4,}$/.test(anchorKey)) errors.push(issue("EVIDENCE_ANCHOR_ID", `${anchorPath}.anchor_id`, "Invalid evidence anchor ID."));
      else if (anchorIds.has(anchorKey)) errors.push(issue("EVIDENCE_ANCHOR_ID", `${anchorPath}.anchor_id`, "Evidence anchor IDs must be unique per candidate."));
      else { anchorIds.add(anchorKey); if (typeof requestClass === "string") anchorTypes.set(anchorKey, requestClass); }
      const kind = anchor.kind;
      if (typeof kind !== "string" || !new Set(["news", "company_release", "filing", "official_data", "market_data", "estimate_data"]).has(kind)) errors.push(issue("EVIDENCE_ANCHOR_KIND", `${anchorPath}.kind`, "Unsupported evidence anchor kind."));
      for (const [key, maximum] of [["title", 160], ["publisher", 80]]) { const value = anchor[key]; if (typeof value !== "string" || !pyStrip(value) || pyLen(pyStrip(value)) > maximum) errors.push(issue("EVIDENCE_ANCHOR_TEXT", `${anchorPath}.${key}`, `${key} must be non-empty and at most ${maximum} characters.`)); }
      const url = anchor.url;
      if (url !== null && url !== undefined && (typeof url !== "string" || !/^https?:\/\//.test(url))) errors.push(issue("EVIDENCE_ANCHOR_URL", `${anchorPath}.url`, "Evidence anchor URL must be null or HTTP(S)."));
      if (typeof kind === "string" && new Set(["news", "company_release", "filing", "official_data"]).has(kind) && typeof url !== "string") errors.push(issue("EVIDENCE_ANCHOR_URL", `${anchorPath}.url`, "Linked editorial and primary-source anchors require a URL."));
      if (parseIsoDatetime(anchor.as_of) === null) errors.push(issue("EVIDENCE_ANCHOR_TIME", `${anchorPath}.as_of`, "Evidence anchor requires an ISO date-time as_of with timezone."));
      const publishedAt = anchor.published_at;
      if (publishedAt !== null && publishedAt !== undefined && parseIsoDatetime(publishedAt) === null) errors.push(issue("EVIDENCE_ANCHOR_TIME", `${anchorPath}.published_at`, "published_at must be null or an ISO date-time with timezone."));
      if (requiredAnchorIds.has(anchorKey) && typeof kind === "string" && new Set(["news", "company_release"]).has(kind) && parseIsoDatetime(publishedAt) === null) errors.push(issue("MATERIAL_NEWS_PUBLISHED_AT", `${anchorPath}.published_at`, "Material news and company releases require published_at."));
      else if (typeof kind === "string" && new Set(["news", "company_release"]).has(kind) && parseIsoDatetime(publishedAt) === null) errors.push(issue("EVIDENCE_ANCHOR_TIME", `${anchorPath}.published_at`, "News and company-release anchors require published_at."));
      if (stringSet(anchor.fact_refs, 1) === null) errors.push(issue("EVIDENCE_ANCHOR_FACTS", `${anchorPath}.fact_refs`, "Evidence anchor requires unique fact refs."));
      if (METRIC_REQUEST_CLASSES.has(requestClass)) validateMetricObservation(anchor.metric, requestClass, `${anchorPath}.metric`, errors);
      else if (requestClass === "price_level") validatePriceObservation(anchor.price_observation, `${anchorPath}.price_observation`, errors);
      else if (requestClass === "market_series") validateMarketSeries(anchor.market_series, `${anchorPath}.market_series`, errors);
      else if (requestClass === "settlement_reference") validateSettlementReference(anchor.settlement_reference, settlementRef, `${anchorPath}.settlement_reference`, errors);
      const expectedRequestClass = requiredAnchorTypes.get(anchorKey);
      if (expectedRequestClass !== undefined && requestClass !== expectedRequestClass) errors.push(issue("MATERIAL_ANCHOR_TYPE", `${anchorPath}.request_class`, `Required anchor ${pyrepr(anchorId)} must preserve request class ${pyrepr(expectedRequestClass)}.`));
      if (expectedRequestClass !== undefined) {
        const serializedAnchor = canonicalJson(anchor);
        if (!materialAnchorPayloads.has(anchorKey)) materialAnchorPayloads.set(anchorKey, serializedAnchor);
        else if (materialAnchorPayloads.get(anchorKey) !== serializedAnchor) errors.push(issue("EVIDENCE_ANCHOR_DRIFT", anchorPath, `Required anchor ${pyrepr(anchorId)} changed across candidates.`));
      }
    });
    const missingAnchorIds = sortedStrings([...requiredAnchorIds].filter((anchorId) => !anchorIds.has(anchorId)));
    if (missingAnchorIds.length) errors.push(issue("MATERIAL_ANCHOR_MISSING", `${path}.evidence_anchors`, `Missing material anchors: ${pyrepr(missingAnchorIds)}.`));
    const materialPairs = sortedStrings([...anchorIds].filter((anchorId) => requiredAnchorIds.has(anchorId)).map((anchorId) => `${anchorId}\u0000${anchorTypes.get(anchorId) ?? ""}`));
    materialAnchorSets.add(JSON.stringify(materialPairs));

    const settlement = isObject(candidate.settlement) ? candidate.settlement : {};
    requireExactFields(settlement, new Set(["claim_ref", "one_line", "state"]), `${path}.settlement`, "SETTLEMENT_FIELDS", errors);
    const settlementState = settlement.state;
    if (typeof settlementState !== "string" || !new Set(["not_applicable", "needs_confirmation", "ready", "frozen"]).has(settlementState)) errors.push(issue("SETTLEMENT_STATE", `${path}.settlement.state`, "Unsupported candidate settlement state."));
    else settlementStates.push(settlementState);
    settlementProjections.add(canonicalJson(settlement));
    if (settlementRef === null || settlementRef === undefined) {
      if (canonicalJson(settlement) !== canonicalJson({ claim_ref: null, one_line: null, state: "not_applicable" })) errors.push(issue("SETTLEMENT_UNBOUND", `${path}.settlement`, "Unbound candidates must use not_applicable settlement."));
    } else {
      if (settlement.claim_ref !== settlementRef) errors.push(issue("SETTLEMENT_REF", `${path}.settlement.claim_ref`, "Candidate settlement must match lineage."));
      const oneLine = settlement.one_line;
      if (!nonemptyString(oneLine) || pyLen(pyStrip(oneLine)) > 240) errors.push(issue("SETTLEMENT_LINE", `${path}.settlement.one_line`, "Bound settlement requires a one-line projection of at most 240 characters."));
      if (settlementState === "not_applicable") errors.push(issue("SETTLEMENT_STATE", `${path}.settlement.state`, "Bound settlement cannot be not_applicable."));
    }

    const quality = isObject(candidate.quality) ? candidate.quality : {};
    let calculatedScore = 0;
    let lowDimension = false;
    const scoreValues = {};
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      let value = quality[key];
      if (!finiteNumber(value) || value < 0 || value > 10) { errors.push(issue("QUALITY_SCORE", `${path}.quality.${key}`, "Score must be 0-10.")); value = 0; }
      scoreValues[key] = Number(value);
      if (scoreValues[key] < 7) lowDimension = true;
      calculatedScore += scoreValues[key] * weight;
    }
    const reported = quality.weighted_score;
    if (!finiteNumber(reported) || Math.abs(Number(reported) - calculatedScore) > 0.05) errors.push(issue("QUALITY_WEIGHT", `${path}.quality.weighted_score`, `Expected ${pyFloatFixed(calculatedScore, 2)}.`));
    const expectedPass = calculatedScore >= 8 && !lowDimension && scoreValues.claim_fidelity >= 8 && scoreValues.evidence_integrity >= 8;
    const expectedVerdict = expectedPass ? "pass" : "reject";
    if (quality.verdict !== expectedVerdict) errors.push(issue("QUALITY_VERDICT", `${path}.quality.verdict`, `Expected ${expectedVerdict}.`));
    if (expectedPass && typeof candidateId === "string") passedCandidates.add(candidateId);
  });

  if (settlementProjections.size > 1) errors.push(issue("SETTLEMENT_DRIFT", "$.candidates", "All candidates must preserve one settlement projection."));
  if (materialAnchorSets.size > 1) errors.push(issue("EVIDENCE_ANCHOR_DRIFT", "$.candidates", "All candidates must preserve the same material evidence anchors."));

  const selection = isObject(payload.selection) ? payload.selection : {};
  requireExactFields(selection, new Set(["selected_candidate_id", "selection_receipt_ref", "content_confirmed", "settlement_confirmed", "settlement_confirmation_fields"]), "$.selection", "SELECTION_FIELDS", errors);
  const selectedId = selection.selected_candidate_id, receiptRef = selection.selection_receipt_ref, contentConfirmed = selection.content_confirmed, settlementConfirmed = selection.settlement_confirmed;
  if (typeof contentConfirmed !== "boolean") errors.push(issue("SELECTION_CONFIRMATION", "$.selection.content_confirmed", "content_confirmed must be boolean."));
  if (typeof settlementConfirmed !== "boolean") errors.push(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmed", "settlement_confirmed must be boolean."));
  let confirmedFields = stringSet(selection.settlement_confirmation_fields);
  if (confirmedFields === null || ![...confirmedFields].every((field) => SETTLEMENT_CONFIRMATION_FIELDS.has(field))) { errors.push(issue("SETTLEMENT_CONFIRMATION_FIELDS", "$.selection.settlement_confirmation_fields", "Settlement confirmation fields must be unique canonical field names.")); confirmedFields = new Set(); }
  if (state === "ready_for_selection") {
    if (selectedId !== null || receiptRef !== null || contentConfirmed !== false || settlementConfirmed !== false || confirmedFields.size) errors.push(issue("PRESELECTED", "$.selection", "Ready-for-selection output cannot preselect or confirm content or settlement."));
    if (!setEquals(passedCandidates, ids)) errors.push(issue("FAILED_CANDIDATE_EXPOSED", "$.candidates", "Every exposed candidate must pass quality gates."));
  } else if (state === "selected") {
    if (!ids.has(selectedId)) errors.push(issue("SELECTED_ID", "$.selection.selected_candidate_id", "Selected candidate must resolve."));
    if (contentConfirmed !== true || !nonemptyString(receiptRef)) errors.push(issue("SELECTION_RECEIPT", "$.selection", "Selected content requires confirmation and a receipt ref."));
  }
  if (settlementConfirmed === true) {
    if (state !== "selected") errors.push(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmed", "Settlement confirmation requires a selected candidate."));
    if (settlementRef === null || settlementRef === undefined) errors.push(issue("SETTLEMENT_CONFIRMATION", "$.lineage.settlement_claim_ref", "Settlement confirmation requires a bound claim."));
    if (!setEquals(confirmedFields, SETTLEMENT_CONFIRMATION_FIELDS)) {
      const missing = sortedStrings([...SETTLEMENT_CONFIRMATION_FIELDS].filter((field) => !confirmedFields.has(field)));
      errors.push(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmation_fields", `Missing explicit settlement confirmations: ${pyrepr(missing)}.`));
    }
    if (eligibilityStatus !== "eligible" || computedMissingEligibility.size) errors.push(issue("SETTLEMENT_ELIGIBILITY", "$.shared_view.settlement_eligibility", "Confirmed settlement requires complete eligible semantics."));
    if (settlementStates.some((item) => item !== "frozen") || settlementStates.length !== candidates.length) errors.push(issue("SETTLEMENT_STATE", "$.candidates", "Explicitly confirmed settlement must be frozen across all candidates."));
  } else {
    if (confirmedFields.size) errors.push(issue("SETTLEMENT_CONFIRMATION", "$.selection.settlement_confirmation_fields", "Unconfirmed settlement cannot record confirmed fields."));
    if (settlementStates.includes("frozen")) errors.push(issue("SETTLEMENT_PREMATURE_FREEZE", "$.candidates", "Settlement cannot be frozen before explicit candidate selection and settlement confirmation."));
  }
  if (new Set(["ready_for_selection", "selected"]).has(state)) {
    const expectedSettlementState = settlementRef === null || settlementRef === undefined ? "not_applicable" : settlementConfirmed === true ? "frozen" : "needs_confirmation";
    if (settlementStates.some((item) => item !== expectedSettlementState) || settlementStates.length !== candidates.length) errors.push(issue("SETTLEMENT_STATE", "$.candidates", `Selectable output requires settlement state ${pyrepr(expectedSettlementState)} across all candidates.`));
  }
  const qualityReport = isObject(payload.quality_report) ? payload.quality_report : {};
  const expectedDecision = state === "blocked" ? "blocked" : state === "selected" ? "selected" : "ready_for_selection";
  if (state !== "draft" && qualityReport.decision !== expectedDecision) errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", `Expected ${expectedDecision}.`));
  const hardFailures = Array.isArray(qualityReport.hard_failures) ? qualityReport.hard_failures : [];
  if (state === "blocked" && !hardFailures.length) errors.push(issue("BLOCK_REASON", "$.quality_report.hard_failures", "Blocked output needs a hard failure."));
  if (new Set(["ready_for_selection", "selected"]).has(state) && hardFailures.length) errors.push(issue("READY_WITH_FAILURES", "$.quality_report.hard_failures", "Selectable output cannot contain hard failures."));
  return { valid: errors.length === 0, errors, warnings, stats };
}

function parseArgs(argv) {
  let artifact = null, assetRoot = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--asset-root") assetRoot = argv[++index];
    else if (!artifact) artifact = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (!artifact) throw new Error("the following arguments are required: artifact");
  return { artifact, assetRoot };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); }
  catch (error) { process.stderr.write(`usage: validate_publish_candidate_set.mjs artifact [--asset-root ASSET_ROOT]\nvalidate_publish_candidate_set.mjs: error: ${error.message}\n`); return 2; }
  let payload;
  try { payload = JSON.parse(readFileSync(args.artifact, "utf8")); }
  catch (error) { const result = { valid: false, errors: [issue("READ", "$", error.message)], warnings: [], stats: {} }; process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return 1; }
  const result = validate(payload, args.assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
