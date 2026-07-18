#!/usr/bin/env node
// Validate CreatorExpressionPlanV1 artifacts and semantic-lock invariants.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { pyFromIsoformat } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const VISUAL_ROUTE_REGISTRY_PATH = join(here, "..", "references", "visual-intent-route-registry-v1.json");
const VISUAL_ROUTE_REGISTRY_BYTES = readFileSync(VISUAL_ROUTE_REGISTRY_PATH);
export const VISUAL_ROUTE_REGISTRY = JSON.parse(VISUAL_ROUTE_REGISTRY_BYTES.toString("utf8"));
export const VISUAL_ROUTE_REGISTRY_SHA256 = `sha256:${createHash("sha256").update(VISUAL_ROUTE_REGISTRY_BYTES).digest("hex")}`;

const ROOT_FIELDS = new Set([
  "schema_version", "plan_id", "revision", "state", "lineage", "meaning_fingerprint",
  "semantic_lock", "authorship_assistance", "narrative", "voice_spec", "data_requirements",
  "text_blueprint", "visual_plan", "settlement_eligibility", "source_style_firewall", "quality_report",
]);
const CORE_PRIMITIVES = new Set([
  "reaction_test", "parallel_contrast", "category_reframe", "forced_flow_loop",
  "event_unwind", "expectation_ladder", "sentiment_witness", "binary_level", "derived_signal",
]);
export const PRIMITIVE_KINDS = new Set([...CORE_PRIMITIVES, "analogy", "decision", "caveat"]);
const ALLOWED_TRANSFORMATIONS = new Set(["compress", "reorder", "translate", "format", "visualize"]);
const FORBIDDEN_TRANSFORMATIONS = new Set([
  "change_claim", "change_direction", "change_horizon", "add_trade", "add_settlement",
  "remove_caveat", "upgrade_certainty", "reassign_authorship",
]);
export const ACTION_BY_TRADE_INTENT = new Map([
  ["none", "omit"], ["observe_only", "observe"], ["avoid", "avoid"],
  ["conditional", "conditional_trade"], ["explicit", "trade"],
]);
const SETTLEMENT_REQUIREMENTS = new Set(["metric", "operator", "threshold", "deadline", "authoritative_source"]);
const VIEWPOINT_VISUAL_GRAMMARS = new Set([
  "reaction_test", "parallel_contrast", "category_reframe", "relative_value_trigger",
  "policy_pivot", "sentiment_witness", "event_unwind", "feedback_loop", "binary_level",
  "expectation_gap", "factor_rotation",
]);
const VISUAL_CANDIDATE_JOBS_BY_FAMILY = new Map(
  Object.entries(VISUAL_ROUTE_REGISTRY.candidate_families).map(([family, jobIds]) => [family, new Set(jobIds)]),
);
export const VISUAL_CANDIDATE_JOBS = new Set([...VISUAL_CANDIDATE_JOBS_BY_FAMILY.values()].flatMap((jobs) => [...jobs]));
export const EVIDENCE_SHAPES = new Set(VISUAL_ROUTE_REGISTRY.evidence_shapes);
export const QUERY_CAPABILITY_TOOLS = new Map(
  VISUAL_ROUTE_REGISTRY.query_capabilities.map((capability) => [capability.capability_id, new Set(capability.tool_ids)]),
);
export const VISUAL_ROUTE_SPECS = new Map(
  VISUAL_ROUTE_REGISTRY.routes.map((route) => [route.route_id, {
    skill_path_ids: route.skill_path_ids,
    primary_renderer_skill_id: route.primary_renderer_skill_id,
    detail_renderer_skill_id: route.detail_renderer_skill_id,
  }]),
);
const ARGUMENT_GRAMMARS = new Set(["causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison", "price_timeline"]);
const DATA_KINDS = new Set(["qualitative", "key_numbers", "series"]);
export const QUERY_CAPABILITY_REQUEST_CLASSES = new Map(
  VISUAL_ROUTE_REGISTRY.query_capabilities.map((capability) => [capability.capability_id, new Set(capability.request_classes)]),
);
const REQUEST_CLASSES = new Set([...QUERY_CAPABILITY_REQUEST_CLASSES.values()].flatMap((classes) => [...classes]));
const DATA_KINDS_BY_REQUEST_CLASS = new Map([
  ["qualitative_evidence", new Set(["qualitative", "key_numbers", "series"])],
  ["news_anchor", new Set(["qualitative"])],
  ["official_event", new Set(["qualitative"])],
  ["valuation_metric", new Set(["key_numbers"])],
  ["comparison_metric", new Set(["key_numbers", "series"])],
  ["market_series", new Set(["series"])],
  ["price_level", new Set(["key_numbers"])],
  ["settlement_reference", new Set(["qualitative", "key_numbers"])],
]);
const NON_DEGRADABLE_MATERIAL_CLASSES = new Set(["news_anchor", "valuation_metric", "comparison_metric", "price_level", "settlement_reference"]);
const EXPRESSION_SURFACES = new Set(["text", "visual"]);
const CORE_PRIMITIVE_BY_VIEWPOINT = new Map([
  ["reaction_test", "reaction_test"], ["parallel_contrast", "parallel_contrast"],
  ["category_reframe", "category_reframe"], ["relative_value_trigger", "reaction_test"],
  ["policy_pivot", "forced_flow_loop"], ["sentiment_witness", "sentiment_witness"],
  ["event_unwind", "event_unwind"], ["feedback_loop", "forced_flow_loop"],
  ["binary_level", "binary_level"], ["expectation_gap", "expectation_ladder"],
  ["factor_rotation", "derived_signal"],
]);
const DATA_MODES_BY_VISUAL = new Map([
  ["reaction_test", new Set(["qualitative", "key_numbers", "series"])],
  ["parallel_contrast", new Set(["qualitative", "key_numbers", "series"])],
  ["category_reframe", new Set(["qualitative"])],
  ["relative_value_trigger", new Set(["key_numbers", "series"])],
  ["policy_pivot", new Set(["qualitative", "key_numbers"])],
  ["sentiment_witness", new Set(["qualitative"])],
  ["event_unwind", new Set(["qualitative", "series"])],
  ["feedback_loop", new Set(["qualitative", "key_numbers", "series"])],
  ["binary_level", new Set(["key_numbers", "series"])],
  ["expectation_gap", new Set(["key_numbers"])],
  ["factor_rotation", new Set(["key_numbers", "series"])],
]);
const FALLBACK_SUBSTITUTIONS = new Set(["invent_metric", "proxy_without_bridge", "anecdote_as_market_fact", "decorative_chart"]);
const BACKEND_TERMS = new Set([
  "observed", "derived", "inferred", "provisional", "conditional", "confirmed", "pending", "unresolved",
  "已确认", "已计算", "推演", "待确认", "形成中", "交给市场验证", "等待确认",
]);
const REQUIRED_ANTI_AI_PHRASES = new Set(["值得关注的是", "核心逻辑在于", "从机制上看"]);
const CUEBOOK_WORKFLOW_PATTERNS = [
  /cuebook.{0,40}(?:帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色|写(?:出|成)?|建议|让我|给我|替我|完成)/iu,
  /(?:放进|用|通过|经过|借助|帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色).{0,40}cuebook/iu,
  /\bcuebook\b.{0,48}\b(?:helped?|completed?|improved?|inspired?|generated?|drafted?|rewrote|suggested?)\b/iu,
  /\b(?:used?|put|through|with)\b.{0,48}\bcuebook\b/iu,
];
const FIRST_PERSON_EXPERIENCE_PATTERNS = [
  /\bI\s+(?:saw|heard|bought|sold|lost|made|switched|rotated|held|owned|traded|experienced|remembered|discovered|found|realized|identified|noticed|learned|was\s+liquidated|got\s+liquidated|came\s+across)\b/iu,
  /\bmy\s+(?:trade|position|portfolio|dashboard|loss|profit|experience)\b/iu,
  /我(?:亲历|听说|看到|买了|卖了|亏了|赚了|切换|换仓|爆仓|被清算|持有|做了|发现|意识到|注意到|找到了|识别出)/u,
  /我的(?:仓位|组合|交易|亏损|盈利|仪表盘|经历)/u,
];
const IMAGE_BUDGET_LIMITS = new Map([
  ["title_max", [8, 48]], ["subtitle_max", [16, 96]], ["node_label_max", [8, 32]],
  ["callout_max", [12, 56]], ["source_line_max", [24, 120]], ["max_nodes", [2, 7]],
  ["max_callouts", [0, 4]], ["total_max", [80, 320]],
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function g(value, key, fallback = null) {
  return isObject(value) && Object.hasOwn(value, key) ? value[key] : fallback;
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isObject(value)) return pyRepr(value);
  return String(value);
}

function pyStrOrEmpty(value) {
  return pyTruthy(value) ? pyStr(value) : "";
}

function pyRepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    let output = quote;
    for (const character of value) {
      if (character === "\\") output += "\\\\";
      else if (character === quote) output += `\\${quote}`;
      else if (character === "\n") output += "\\n";
      else if (character === "\r") output += "\\r";
      else if (character === "\t") output += "\\t";
      else output += character;
    }
    return `${output}${quote}`;
  }
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (isObject(value)) return `{${Object.entries(value).map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`).join(", ")}}`;
  return String(value);
}

function pyEquals(left, right) {
  if ((typeof left === "number" || typeof left === "boolean") && (typeof right === "number" || typeof right === "boolean")) return Number(left) === Number(right);
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => pyEquals(value, right[index]));
  if (isObject(left) && isObject(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && pyEquals(left[key], right[key]));
  }
  return left === right;
}

function setEquals(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function setSubset(left, right) {
  return [...left].every((value) => right.has(value));
}

function setDifference(left, right) {
  return new Set([...left].filter((value) => !right.has(value)));
}

function setIntersection(left, right) {
  return new Set([...left].filter((value) => right.has(value)));
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function codePointLength(value) {
  return [...value].length;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function containsCuebookWorkflowNarration(text) {
  return CUEBOOK_WORKFLOW_PATTERNS.some((pattern) => pattern.test(text));
}

export function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function validateObject(value, path, required, allowed, errors) {
  if (!isObject(value)) {
    errors.push(issue("OBJECT", path, "Expected an object."));
    return {};
  }
  const keys = new Set(Object.keys(value));
  for (const key of sorted([...required].filter((field) => !keys.has(field)))) errors.push(issue("MISSING_FIELD", `${path}.${key}`, "Required field is missing."));
  for (const key of sorted([...keys].filter((field) => !allowed.has(field)))) errors.push(issue("UNKNOWN_FIELD", `${path}.${key}`, "Unknown field."));
  return value;
}

export function stringList(value, path, errors, { minimum = 0, maximum = null } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) errors.push(issue("STRING_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    else result.push(item.trim());
  });
  if (result.length !== new Set(result).size) errors.push(issue("STRING_UNIQUE", path, "Strings must be unique."));
  if (result.length < minimum) errors.push(issue("STRING_MIN", path, `Expected at least ${minimum} item(s).`));
  if (maximum !== null && result.length > maximum) errors.push(issue("STRING_MAX", path, `Expected at most ${maximum} item(s).`));
  return result;
}

export function nullableString(value, path, errors) {
  if (value === null || value === undefined) return null;
  if (!nonempty(value)) {
    errors.push(issue("NULLABLE_STRING", path, "Expected null or a non-empty string."));
    return null;
  }
  return value.trim();
}

export function integerRange(value, path, minimum, maximum, errors) {
  if (!Number.isInteger(value) || typeof value === "boolean" || value < minimum || value > maximum) {
    errors.push(issue("INTEGER_RANGE", path, `Expected an integer from ${minimum} to ${maximum}.`));
    return null;
  }
  return value;
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed;
}

export function validSha256(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function calculateFingerprintHash(fingerprint) {
  const canonical = { ...fingerprint };
  delete canonical.fingerprint_sha256;
  return sha256Text(canonicalJson(canonical));
}

export function calculateVisualRouteHash(visualPlan) {
  const rawRoute = g(visualPlan, "execution_route");
  const executionRoute = isObject(rawRoute) ? { ...rawRoute } : {};
  delete executionRoute.route_sha256;
  const canonical = {
    intent: g(visualPlan, "intent"),
    data_requirement_refs: g(visualPlan, "data_requirement_refs"),
    execution_route: executionRoute,
  };
  return sha256Text(canonicalJson(canonical));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBackendTerm(value) {
  const lowered = value.toLowerCase();
  const terms = [...BACKEND_TERMS].sort((left, right) => right.length - left.length);
  for (const term of terms) {
    if ([...term].every((character) => character.codePointAt(0) < 128)) {
      if (new RegExp(`(?<![A-Za-z])${escapeRegex(term.toLowerCase())}(?![A-Za-z])`, "u").test(lowered)) return term;
    } else if (value.includes(term)) return term;
  }
  return null;
}

export function containsFirstPersonExperience(value) {
  return FIRST_PERSON_EXPERIENCE_PATTERNS.some((pattern) => pattern.test(value));
}

export function validateQuality(value, state, errors) {
  const fields = new Set(["decision", "warnings", "hard_failures"]);
  const quality = validateObject(value, "$.quality_report", fields, fields, errors);
  const decision = g(quality, "decision");
  const warnings = stringList(g(quality, "warnings"), "$.quality_report.warnings", errors);
  const failures = stringList(g(quality, "hard_failures"), "$.quality_report.hard_failures", errors);
  if (!new Set(["ready", "conditional", "blocked"]).has(decision)) errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  if (state === "conditional" && (decision !== "conditional" || !warnings.length)) errors.push(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires conditional quality and at least one warning."));
  if (new Set(["ready", "frozen"]).has(state) && (decision !== "ready" || warnings.length || failures.length)) errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."));
  if (state === "blocked" && (decision !== "blocked" || !failures.length)) errors.push(issue("BLOCKED_QUALITY", "$.quality_report", "Blocked state requires blocked quality and at least one hard failure."));
  if (failures.length && decision !== "blocked") errors.push(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."));
}

export function validate(payload, { expectedSourceSemanticsHash = null } = {}) {
  const errors = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };

  const rootKeys = new Set(Object.keys(payload));
  for (const key of sorted([...ROOT_FIELDS].filter((field) => !rootKeys.has(field)))) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of sorted([...rootKeys].filter((field) => !ROOT_FIELDS.has(field)))) errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  if (g(payload, "schema_version") !== "creator-expression-plan-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-expression-plan-v1."));
  if (!/^CEXP_[A-Za-z0-9_:-]{8,}$/.test(pyStrOrEmpty(g(payload, "plan_id")))) errors.push(issue("PLAN_ID", "$.plan_id", "Invalid plan ID."));
  integerRange(g(payload, "revision"), "$.revision", 1, 1_000_000, errors);
  const state = g(payload, "state");
  if (!new Set(["draft", "conditional", "ready", "frozen", "blocked"]).has(state)) errors.push(issue("STATE", "$.state", "Unsupported state."));

  const lineageFields = new Set([
    "input_artifact_refs", "market_view_semantics_ref", "research_pack_ref",
    "trading_thesis_ref", "trade_logic_profile_ref", "profile_ref", "source_refs", "decision_cutoff_at",
  ]);
  const lineage = validateObject(g(payload, "lineage"), "$.lineage", lineageFields, lineageFields, errors);
  const inputRefs = stringList(g(lineage, "input_artifact_refs"), "$.lineage.input_artifact_refs", errors, { minimum: 1 });
  const semanticsRef = g(lineage, "market_view_semantics_ref");
  if (!nonempty(semanticsRef)) errors.push(issue("SEMANTICS_REF", "$.lineage.market_view_semantics_ref", "MarketViewSemanticsV1 ref is required."));
  else if (!inputRefs.includes(semanticsRef)) errors.push(issue("LINEAGE_REF", "$.lineage.market_view_semantics_ref", "Market semantics ref must appear in input_artifact_refs."));
  for (const key of ["research_pack_ref", "trading_thesis_ref", "trade_logic_profile_ref", "profile_ref"]) {
    const ref = nullableString(g(lineage, key), `$.lineage.${key}`, errors);
    if (ref !== null && !inputRefs.includes(ref)) errors.push(issue("LINEAGE_REF", `$.lineage.${key}`, "Named artifact ref must appear in input_artifact_refs."));
  }
  const sourceRefs = stringList(g(lineage, "source_refs"), "$.lineage.source_refs", errors);
  parseTime(g(lineage, "decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors);

  const fingerprintFields = new Set([
    "source_semantics_sha256", "canonical_claim", "claim_type", "primary_subject", "comparator",
    "direction", "horizon", "mechanism", "trade_intent", "settlement_intent", "action",
    "claim_refs", "supporting_fact_refs", "required_caveats", "creator_owned_experience_refs", "fingerprint_sha256",
  ]);
  const fingerprint = validateObject(g(payload, "meaning_fingerprint"), "$.meaning_fingerprint", fingerprintFields, fingerprintFields, errors);
  const sourceHash = g(fingerprint, "source_semantics_sha256");
  if (!validSha256(sourceHash)) errors.push(issue("SOURCE_SEMANTICS_HASH", "$.meaning_fingerprint.source_semantics_sha256", "Expected sha256:<64 lowercase hex characters>."));
  if (expectedSourceSemanticsHash !== null && sourceHash !== expectedSourceSemanticsHash) errors.push(issue("SOURCE_SEMANTICS_MISMATCH", "$.meaning_fingerprint.source_semantics_sha256", "Source semantics hash does not match the expected input hash."));
  for (const [key, maximum] of [["canonical_claim", 500], ["mechanism", 500]]) {
    const value = g(fingerprint, key);
    if (!nonempty(value) || codePointLength(pyStrOrEmpty(value)) > maximum) errors.push(issue("FINGERPRINT_TEXT", `$.meaning_fingerprint.${key}`, `Expected one to ${maximum} characters.`));
  }
  if (!nonempty(g(fingerprint, "primary_subject"))) errors.push(issue("PRIMARY_SUBJECT", "$.meaning_fingerprint.primary_subject", "Primary subject is required."));
  nullableString(g(fingerprint, "comparator"), "$.meaning_fingerprint.comparator", errors);
  nullableString(g(fingerprint, "horizon"), "$.meaning_fingerprint.horizon", errors);
  if (!new Set(["observation", "explanation", "conditional_view", "directional_view", "relative_view", "sentiment_evidence"]).has(g(fingerprint, "claim_type"))) errors.push(issue("CLAIM_TYPE", "$.meaning_fingerprint.claim_type", "Unsupported claim type."));
  if (!new Set(["none", "bullish", "bearish", "outperform", "underperform", "range", "neutral", "custom"]).has(g(fingerprint, "direction"))) errors.push(issue("DIRECTION", "$.meaning_fingerprint.direction", "Unsupported direction."));
  const tradeIntent = g(fingerprint, "trade_intent");
  if (!ACTION_BY_TRADE_INTENT.has(tradeIntent)) errors.push(issue("TRADE_INTENT", "$.meaning_fingerprint.trade_intent", "Unsupported trade intent."));
  const settlementIntent = g(fingerprint, "settlement_intent");
  if (!new Set(["none", "candidate", "explicit"]).has(settlementIntent)) errors.push(issue("SETTLEMENT_INTENT", "$.meaning_fingerprint.settlement_intent", "Unsupported settlement intent."));
  const action = nullableString(g(fingerprint, "action"), "$.meaning_fingerprint.action", errors);
  if (tradeIntent === "none" && action !== null) errors.push(issue("SOURCE_TRADE_ABSENT", "$.meaning_fingerprint.action", "No action is allowed when source trade intent is none."));
  if (new Set(["observe_only", "avoid", "conditional", "explicit"]).has(tradeIntent) && action === null) errors.push(issue("SOURCE_ACTION_REQUIRED", "$.meaning_fingerprint.action", "Source trade intent requires its preserved action."));
  const claimRefs = stringList(g(fingerprint, "claim_refs"), "$.meaning_fingerprint.claim_refs", errors, { minimum: 1 });
  const factRefs = stringList(g(fingerprint, "supporting_fact_refs"), "$.meaning_fingerprint.supporting_fact_refs", errors);
  stringList(g(fingerprint, "required_caveats"), "$.meaning_fingerprint.required_caveats", errors, { minimum: 1 });
  const ownedExperienceRefs = stringList(g(fingerprint, "creator_owned_experience_refs"), "$.meaning_fingerprint.creator_owned_experience_refs", errors);
  if (ownedExperienceRefs.some((ref) => !claimRefs.includes(ref))) errors.push(issue("EXPERIENCE_LINEAGE", "$.meaning_fingerprint.creator_owned_experience_refs", "Creator-owned experience refs must resolve to semantic claim refs."));
  const fingerprintHash = g(fingerprint, "fingerprint_sha256");
  if (!validSha256(fingerprintHash)) errors.push(issue("FINGERPRINT_HASH", "$.meaning_fingerprint.fingerprint_sha256", "Expected sha256:<64 lowercase hex characters>."));
  else if (fingerprintHash !== calculateFingerprintHash(fingerprint)) errors.push(issue("FINGERPRINT_HASH_MISMATCH", "$.meaning_fingerprint.fingerprint_sha256", "Fingerprint hash does not match the canonical meaning fingerprint."));

  const lockFields = new Set(["locked", "authorship_locked", "fingerprint_sha256", "allowed_transformations", "forbidden_transformations", "downstream_verification_required"]);
  const lock = validateObject(g(payload, "semantic_lock"), "$.semantic_lock", lockFields, lockFields, errors);
  if (g(lock, "locked") !== true || g(lock, "authorship_locked") !== true || g(lock, "downstream_verification_required") !== true) errors.push(issue("SEMANTIC_LOCK", "$.semantic_lock", "Meaning lock, authorship lock, and downstream verification must all be true."));
  if (g(lock, "fingerprint_sha256") !== fingerprintHash) errors.push(issue("LOCK_HASH", "$.semantic_lock.fingerprint_sha256", "Semantic lock must carry the meaning fingerprint hash."));
  const allowedTransformations = new Set(stringList(g(lock, "allowed_transformations"), "$.semantic_lock.allowed_transformations", errors, { minimum: 1 }));
  const forbiddenTransformations = new Set(stringList(g(lock, "forbidden_transformations"), "$.semantic_lock.forbidden_transformations", errors, { minimum: 1 }));
  if (!setEquals(allowedTransformations, ALLOWED_TRANSFORMATIONS)) errors.push(issue("LOCK_ALLOWED_TRANSFORMS", "$.semantic_lock.allowed_transformations", "Use the complete safe transformation set."));
  if (!setEquals(forbiddenTransformations, FORBIDDEN_TRANSFORMATIONS)) errors.push(issue("LOCK_FORBIDDEN_TRANSFORMS", "$.semantic_lock.forbidden_transformations", "Use the complete forbidden transformation set."));

  const authorshipFields = new Set([
    "mode", "creator_seed", "source_view_owner", "cuebook_additions", "creator_accepted_addition_ids",
    "creator_rejected_addition_ids", "idea_delta", "public_attribution_required", "public_attribution_line",
  ]);
  const authorship = validateObject(g(payload, "authorship_assistance"), "$.authorship_assistance", authorshipFields, authorshipFields, errors);
  const authorshipMode = g(authorship, "mode");
  if (!new Set(["creator_original", "cuebook_assisted", "source_transformation"]).has(authorshipMode)) errors.push(issue("AUTHORSHIP_MODE", "$.authorship_assistance.mode", "Unsupported authorship mode."));
  const seedFields = new Set(["text", "preserved", "claim_refs"]);
  const seed = validateObject(g(authorship, "creator_seed"), "$.authorship_assistance.creator_seed", seedFields, seedFields, errors);
  const seedText = nullableString(g(seed, "text"), "$.authorship_assistance.creator_seed.text", errors);
  if (seedText !== null && codePointLength(seedText) > 2000) errors.push(issue("CREATOR_SEED_LENGTH", "$.authorship_assistance.creator_seed.text", "Creator seed must not exceed 2000 characters."));
  const seedRefs = stringList(g(seed, "claim_refs"), "$.authorship_assistance.creator_seed.claim_refs", errors);
  if (seedRefs.some((ref) => !claimRefs.includes(ref))) errors.push(issue("CREATOR_SEED_LINEAGE", "$.authorship_assistance.creator_seed.claim_refs", "Creator seed refs must resolve to semantic claim refs."));
  if (seedText === null) {
    if (g(seed, "preserved") !== false || seedRefs.length) errors.push(issue("CREATOR_SEED_EMPTY", "$.authorship_assistance.creator_seed", "An absent creator seed must be unpreserved and have no claim refs."));
  } else if (g(seed, "preserved") !== true || !seedRefs.length) errors.push(issue("CREATOR_SEED_PRESERVATION", "$.authorship_assistance.creator_seed", "A creator seed must be preserved and linked to at least one semantic claim."));

  const ownerFields = new Set(["owner_type", "owner_ref", "public_label"]);
  const owner = validateObject(g(authorship, "source_view_owner"), "$.authorship_assistance.source_view_owner", ownerFields, ownerFields, errors);
  const ownerType = g(owner, "owner_type");
  if (!new Set(["current_creator", "external_creator", "mixed"]).has(ownerType)) errors.push(issue("VIEW_OWNER_TYPE", "$.authorship_assistance.source_view_owner.owner_type", "Unsupported source-view owner type."));
  if (!nonempty(g(owner, "owner_ref"))) errors.push(issue("VIEW_OWNER_REF", "$.authorship_assistance.source_view_owner.owner_ref", "Source-view owner ref is required."));
  const ownerPublicLabel = g(owner, "public_label");
  if (!nonempty(ownerPublicLabel)) errors.push(issue("VIEW_OWNER_LABEL", "$.authorship_assistance.source_view_owner.public_label", "Source-view owner public label is required."));

  let additions = g(authorship, "cuebook_additions");
  if (!Array.isArray(additions) || additions.length > 12) {
    errors.push(issue("CUEBOOK_ADDITIONS", "$.authorship_assistance.cuebook_additions", "Expected an array of at most 12 Cuebook additions."));
    additions = [];
  }
  const additionFields = new Set(["id", "kind", "summary", "support_refs"]);
  const additionIds = [];
  const allowedAdditionRefs = new Set([...claimRefs, ...factRefs, ...inputRefs, ...sourceRefs]);
  additions.forEach((rawAddition, index) => {
    const path = `$.authorship_assistance.cuebook_additions[${index}]`;
    const addition = validateObject(rawAddition, path, additionFields, additionFields, errors);
    const additionId = g(addition, "id");
    if (typeof additionId !== "string" || !/^CA[1-9][0-9]*$/.test(additionId)) errors.push(issue("CUEBOOK_ADDITION_ID", `${path}.id`, "Invalid Cuebook addition ID."));
    else additionIds.push(additionId);
    if (!new Set(["evidence", "connection", "countercase", "rule"]).has(g(addition, "kind"))) errors.push(issue("CUEBOOK_ADDITION_KIND", `${path}.kind`, "Unsupported Cuebook addition kind."));
    if (!nonempty(g(addition, "summary")) || codePointLength(pyStrOrEmpty(g(addition, "summary"))) > 300) errors.push(issue("CUEBOOK_ADDITION_SUMMARY", `${path}.summary`, "Addition summary must contain one to 300 characters."));
    const supportRefs = stringList(g(addition, "support_refs"), `${path}.support_refs`, errors, { minimum: 1 });
    if (supportRefs.some((ref) => !allowedAdditionRefs.has(ref))) errors.push(issue("CUEBOOK_ADDITION_LINEAGE", `${path}.support_refs`, "Addition refs must resolve to plan lineage or fingerprint refs."));
  });
  if (additionIds.length !== new Set(additionIds).size) errors.push(issue("CUEBOOK_ADDITION_UNIQUE", "$.authorship_assistance.cuebook_additions", "Cuebook addition IDs must be unique."));
  const acceptedIds = stringList(g(authorship, "creator_accepted_addition_ids"), "$.authorship_assistance.creator_accepted_addition_ids", errors);
  const rejectedIds = stringList(g(authorship, "creator_rejected_addition_ids"), "$.authorship_assistance.creator_rejected_addition_ids", errors);
  if (setIntersection(new Set(acceptedIds), new Set(rejectedIds)).size) errors.push(issue("ADDITION_DECISION_OVERLAP", "$.authorship_assistance", "Accepted and rejected addition IDs must be disjoint."));
  if (!setEquals(new Set([...acceptedIds, ...rejectedIds]), new Set(additionIds))) errors.push(issue("ADDITION_DECISION_COVERAGE", "$.authorship_assistance", "Accepted and rejected IDs must cover every Cuebook addition exactly once."));
  const ideaDelta = nullableString(g(authorship, "idea_delta"), "$.authorship_assistance.idea_delta", errors);
  if (ideaDelta !== null && codePointLength(ideaDelta) > 1000) errors.push(issue("IDEA_DELTA_LENGTH", "$.authorship_assistance.idea_delta", "Idea delta must not exceed 1000 characters."));
  const attributionRequired = g(authorship, "public_attribution_required");
  if (typeof attributionRequired !== "boolean") errors.push(issue("PUBLIC_ATTRIBUTION_FLAG", "$.authorship_assistance.public_attribution_required", "Public attribution flag must be boolean."));
  const attributionLine = nullableString(g(authorship, "public_attribution_line"), "$.authorship_assistance.public_attribution_line", errors);
  if (attributionLine !== null && codePointLength(attributionLine) > 280) errors.push(issue("PUBLIC_ATTRIBUTION_LENGTH", "$.authorship_assistance.public_attribution_line", "Public attribution line must not exceed 280 characters."));

  if (authorshipMode === "creator_original") {
    if (seedText === null || ownerType !== "current_creator" || additions.length || acceptedIds.length || rejectedIds.length || ideaDelta !== null) errors.push(issue("CREATOR_ORIGINAL_CONTRACT", "$.authorship_assistance", "Creator-original mode requires a current-creator seed and no Cuebook idea additions or delta."));
    if (attributionRequired !== false || attributionLine !== null) errors.push(issue("CREATOR_ORIGINAL_ATTRIBUTION", "$.authorship_assistance", "Creator-original mode does not require assistance attribution."));
  } else if (authorshipMode === "cuebook_assisted") {
    if (seedText === null || !new Set(["current_creator", "mixed"]).has(ownerType) || !additions.length || !acceptedIds.length || ideaDelta === null) errors.push(issue("CUEBOOK_ASSISTED_CONTRACT", "$.authorship_assistance", "Cuebook-assisted mode requires a creator seed, creator-owned or mixed view, accepted additions, and an idea delta."));
    if (attributionRequired !== false || attributionLine !== null) errors.push(issue("CUEBOOK_ASSISTANCE_INTERNAL", "$.authorship_assistance", "Cuebook-assisted mode keeps assistance provenance internal and carries no public assistance line."));
  } else if (authorshipMode === "source_transformation") {
    if (ownerType !== "external_creator" || ideaDelta === null) errors.push(issue("SOURCE_TRANSFORMATION_CONTRACT", "$.authorship_assistance", "Source-transformation mode requires an external source-view owner and an original idea delta."));
    if (attributionRequired !== true || attributionLine === null) errors.push(issue("SOURCE_TRANSFORMATION_ATTRIBUTION", "$.authorship_assistance", "Source-transformation mode requires public source attribution."));
    else if (nonempty(ownerPublicLabel) && !attributionLine.toLowerCase().includes(ownerPublicLabel.toLowerCase())) errors.push(issue("SOURCE_OWNER_ATTRIBUTION", "$.authorship_assistance.public_attribution_line", "Source transformation attribution must name the external view owner."));
    if (tradeIntent !== "none" || settlementIntent !== "none") errors.push(issue("SOURCE_OWNER_RELABEL", "$.meaning_fingerprint", "An externally owned source transformation cannot become the current creator's trade or settlement."));
  }

  const publicPlanText = [];
  if (attributionLine !== null) publicPlanText.push(["$.authorship_assistance.public_attribution_line", attributionLine]);

  const narrativeFields = new Set(["primary_engine", "frame", "primitives"]);
  const narrative = validateObject(g(payload, "narrative"), "$.narrative", narrativeFields, narrativeFields, errors);
  const primaryEngine = g(narrative, "primary_engine");
  if (!VIEWPOINT_VISUAL_GRAMMARS.has(primaryEngine)) errors.push(issue("PRIMARY_ENGINE", "$.narrative.primary_engine", "Unsupported unified text-and-visual engine."));
  if (!nonempty(g(narrative, "frame")) || codePointLength(pyStrOrEmpty(g(narrative, "frame"))) > 300) errors.push(issue("NARRATIVE_FRAME", "$.narrative.frame", "Frame must contain one to 300 characters."));
  let primitives = g(narrative, "primitives");
  const primitiveKinds = [];
  if (!Array.isArray(primitives) || primitives.length < 2 || primitives.length > 8) {
    errors.push(issue("PRIMITIVES", "$.narrative.primitives", "Expected two to eight narrative primitives."));
    primitives = [];
  }
  const primitiveIds = [];
  const primitiveFields = new Set(["id", "kind", "purpose", "semantic_claim_refs", "analogy"]);
  primitives.forEach((rawPrimitive, index) => {
    const path = `$.narrative.primitives[${index}]`;
    const primitive = validateObject(rawPrimitive, path, primitiveFields, primitiveFields, errors);
    const primitiveId = g(primitive, "id");
    if (typeof primitiveId !== "string" || !/^P[1-9][0-9]*$/.test(primitiveId)) errors.push(issue("PRIMITIVE_ID", `${path}.id`, "Invalid primitive ID."));
    else primitiveIds.push(primitiveId);
    const kind = g(primitive, "kind");
    if (!PRIMITIVE_KINDS.has(kind)) errors.push(issue("PRIMITIVE_KIND", `${path}.kind`, "Unsupported primitive kind."));
    else primitiveKinds.push(kind);
    if (!nonempty(g(primitive, "purpose")) || codePointLength(pyStrOrEmpty(g(primitive, "purpose"))) > 240) errors.push(issue("PRIMITIVE_PURPOSE", `${path}.purpose`, "Purpose must contain one to 240 characters."));
    const refs = stringList(g(primitive, "semantic_claim_refs"), `${path}.semantic_claim_refs`, errors, { minimum: 1 });
    if (refs.some((ref) => !claimRefs.includes(ref))) errors.push(issue("PRIMITIVE_LINEAGE", `${path}.semantic_claim_refs`, "Primitive refs must resolve to semantic claim refs."));
    const analogy = g(primitive, "analogy");
    if (kind === "analogy") {
      const analogyFields = new Set(["source_domain", "target_domain", "mapping", "breakpoint"]);
      const analogyObject = validateObject(analogy, `${path}.analogy`, analogyFields, analogyFields, errors);
      for (const key of ["source_domain", "target_domain", "breakpoint"]) if (!nonempty(g(analogyObject, key))) errors.push(issue("ANALOGY_FIELD", `${path}.analogy.${key}`, "Analogy field is required."));
      const mapping = g(analogyObject, "mapping");
      if (!Array.isArray(mapping) || mapping.length < 1 || mapping.length > 5) errors.push(issue("ANALOGY_MAPPING", `${path}.analogy.mapping`, "Analogy requires one to five mappings."));
      else mapping.forEach((rawMapping, mappingIndex) => {
        const mappingPath = `${path}.analogy.mapping[${mappingIndex}]`;
        const fields = new Set(["source_element", "target_element"]);
        const mappingObject = validateObject(rawMapping, mappingPath, fields, fields, errors);
        if (!nonempty(g(mappingObject, "source_element")) || !nonempty(g(mappingObject, "target_element"))) errors.push(issue("ANALOGY_MAPPING", mappingPath, "Both sides of an analogy mapping are required."));
      });
    } else if (analogy !== null) errors.push(issue("ANALOGY_LEAK", `${path}.analogy`, "Only analogy primitives may carry analogy metadata."));
  });
  if (primitiveIds.length !== new Set(primitiveIds).size) errors.push(issue("PRIMITIVE_ID_UNIQUE", "$.narrative.primitives", "Primitive IDs must be unique."));
  if (primitiveKinds.length !== new Set(primitiveKinds).size) errors.push(issue("PRIMITIVE_KIND_UNIQUE", "$.narrative.primitives", "Use no more than one primitive of each kind."));
  const expectedCorePrimitive = CORE_PRIMITIVE_BY_VIEWPOINT.get(primaryEngine);
  if (primitiveKinds.length && primitiveKinds[0] !== expectedCorePrimitive) errors.push(issue("PRIMARY_ENGINE_ORDER", "$.narrative.primitives[0].kind", "The unified engine's core primitive must appear first."));
  if (!primitiveKinds.includes("caveat")) errors.push(issue("CAVEAT_PRIMITIVE", "$.narrative.primitives", "Every plan requires a caveat primitive."));
  if (tradeIntent === "none" && primitiveKinds.includes("decision")) errors.push(issue("SOURCE_TRADE_ABSENT", "$.narrative.primitives", "Decision primitive is forbidden when source trade intent is none."));
  if (new Set(["observe_only", "avoid", "conditional", "explicit"]).has(tradeIntent) && !primitiveKinds.includes("decision")) errors.push(issue("DECISION_PRIMITIVE", "$.narrative.primitives", "Preserved source action requires a decision primitive."));

  const voiceFields = new Set([
    "language", "register", "energy", "conviction", "technicality", "emotionality", "compression",
    "sentence_rhythm", "humor", "first_person_stance", "first_person_experience", "technical_terms",
    "rhetorical_devices", "profile_rule_refs", "anti_ai_language",
  ]);
  const voice = validateObject(g(payload, "voice_spec"), "$.voice_spec", voiceFields, voiceFields, errors);
  if (!nonempty(g(voice, "language"))) errors.push(issue("VOICE_LANGUAGE", "$.voice_spec.language", "Voice language is required."));
  const voiceEnums = [
    ["register", new Set(["desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"])],
    ["sentence_rhythm", new Set(["short", "mixed", "measured"])],
    ["humor", new Set(["none", "light", "dry", "meme"])],
    ["first_person_stance", new Set(["avoid", "allowed", "prefer"])],
    ["first_person_experience", new Set(["forbidden", "preserve_creator_owned_only"])],
    ["technical_terms", new Set(["plain", "define_once", "desk_native"])],
  ];
  for (const [key, allowed] of voiceEnums) if (!allowed.has(g(voice, key))) errors.push(issue("VOICE_ENUM", `$.voice_spec.${key}`, "Unsupported VoiceSpec value."));
  for (const key of ["energy", "conviction", "technicality", "emotionality", "compression"]) integerRange(g(voice, key), `$.voice_spec.${key}`, 1, 5, errors);
  const rhetoricalDevices = stringList(g(voice, "rhetorical_devices"), "$.voice_spec.rhetorical_devices", errors, { maximum: 4 });
  if (rhetoricalDevices.some((item) => !new Set(["contrast", "paradox", "question", "repetition", "analogy", "understatement", "imperative"]).has(item))) errors.push(issue("RHETORICAL_DEVICE", "$.voice_spec.rhetorical_devices", "Unsupported rhetorical device."));
  if (primitiveKinds.includes("analogy") && !rhetoricalDevices.includes("analogy")) errors.push(issue("ANALOGY_VOICE", "$.voice_spec.rhetorical_devices", "An analogy primitive must be enabled in VoiceSpec."));
  const profileRuleRefs = stringList(g(voice, "profile_rule_refs"), "$.voice_spec.profile_rule_refs", errors);
  if (profileRuleRefs.length && g(lineage, "profile_ref") === null) errors.push(issue("PROFILE_LINEAGE", "$.voice_spec.profile_rule_refs", "Profile rule refs require a ProfileV1 lineage ref."));
  const antiAiFields = new Set(["enabled", "banned_stock_phrases", "max_not_a_but_b_frames", "repeated_openings_allowed"]);
  const antiAi = validateObject(g(voice, "anti_ai_language"), "$.voice_spec.anti_ai_language", antiAiFields, antiAiFields, errors);
  if (g(antiAi, "enabled") !== true) errors.push(issue("ANTI_AI_LANGUAGE", "$.voice_spec.anti_ai_language.enabled", "Anti-AI-language controls must be enabled."));
  const bannedStockPhrases = stringList(g(antiAi, "banned_stock_phrases"), "$.voice_spec.anti_ai_language.banned_stock_phrases", errors, { minimum: 3 });
  if (!setSubset(REQUIRED_ANTI_AI_PHRASES, new Set(bannedStockPhrases))) errors.push(issue("ANTI_AI_PHRASE_SET", "$.voice_spec.anti_ai_language.banned_stock_phrases", "Banned phrases must include the required Cuebook stock-language set."));
  if (!pyEquals(g(antiAi, "max_not_a_but_b_frames"), 1)) errors.push(issue("ANTI_AI_REFRAME_LIMIT", "$.voice_spec.anti_ai_language.max_not_a_but_b_frames", "Allow at most one 不是 A 而是 B frame."));
  if (g(antiAi, "repeated_openings_allowed") !== false) errors.push(issue("ANTI_AI_OPENINGS", "$.voice_spec.anti_ai_language.repeated_openings_allowed", "Repeated stock openings must be disabled."));

  const allowedSemanticRefs = new Set([...claimRefs, ...factRefs]);
  let dataRequirements = g(payload, "data_requirements");
  if (!Array.isArray(dataRequirements) || dataRequirements.length < 1 || dataRequirements.length > 16) {
    errors.push(issue("DATA_REQUIREMENTS", "$.data_requirements", "Expected one to 16 expression data requirements."));
    dataRequirements = [];
  }
  const dataFields = new Set(["id", "kind", "request_class", "purpose", "required", "material_to_claim", "expression_surfaces", "status", "fact_refs", "source_refs"]);
  const dataRequirementsById = new Map();
  const missingRequiredIds = new Set();
  const missingMaterialIds = new Set();
  const nondegradableMissingIds = new Set();
  dataRequirements.forEach((rawRequirement, index) => {
    const path = `$.data_requirements[${index}]`;
    const requirement = validateObject(rawRequirement, path, dataFields, dataFields, errors);
    let requirementId = g(requirement, "id");
    if (typeof requirementId !== "string" || !/^D[1-9][0-9]*$/.test(requirementId)) {
      errors.push(issue("DATA_ID", `${path}.id`, "Invalid data requirement ID."));
      requirementId = null;
    } else if (dataRequirementsById.has(requirementId)) errors.push(issue("DATA_ID_UNIQUE", `${path}.id`, "Data requirement IDs must be unique."));
    else dataRequirementsById.set(requirementId, requirement);
    const kind = g(requirement, "kind");
    if (!DATA_KINDS.has(kind)) errors.push(issue("DATA_KIND", `${path}.kind`, "Unsupported data requirement kind."));
    const requestClass = g(requirement, "request_class");
    if (!REQUEST_CLASSES.has(requestClass)) errors.push(issue("DATA_REQUEST_CLASS", `${path}.request_class`, "Unsupported data request class."));
    else if (DATA_KINDS.has(kind) && !DATA_KINDS_BY_REQUEST_CLASS.get(requestClass).has(kind)) errors.push(issue("REQUEST_CLASS_KIND", `${path}.kind`, `${pyStr(requestClass)} cannot be requested as ${pyStr(kind)}.`));
    if (!nonempty(g(requirement, "purpose")) || codePointLength(pyStrOrEmpty(g(requirement, "purpose"))) > 240) errors.push(issue("DATA_PURPOSE", `${path}.purpose`, "Data purpose must contain one to 240 characters."));
    const required = g(requirement, "required");
    if (typeof required !== "boolean") errors.push(issue("DATA_REQUIRED", `${path}.required`, "Required must be boolean."));
    const materialToClaim = g(requirement, "material_to_claim");
    if (typeof materialToClaim !== "boolean") errors.push(issue("DATA_MATERIALITY", `${path}.material_to_claim`, "Material-to-claim must be boolean."));
    else if (materialToClaim && required !== true) errors.push(issue("DATA_MATERIAL_REQUIRED", path, "A material creator premise must be a required data request."));
    const surfaces = new Set(stringList(g(requirement, "expression_surfaces"), `${path}.expression_surfaces`, errors, { minimum: 1, maximum: 2 }));
    if (!setSubset(surfaces, EXPRESSION_SURFACES)) errors.push(issue("DATA_SURFACE", `${path}.expression_surfaces`, "Expression surfaces must be text and/or visual."));
    const status = g(requirement, "status");
    if (!new Set(["available", "missing"]).has(status)) errors.push(issue("DATA_STATUS", `${path}.status`, "Unsupported data status."));
    const requirementFactRefs = stringList(g(requirement, "fact_refs"), `${path}.fact_refs`, errors);
    const requirementSourceRefs = stringList(g(requirement, "source_refs"), `${path}.source_refs`, errors);
    if (status === "available") {
      if (!requirementFactRefs.length || !requirementSourceRefs.length) errors.push(issue("AVAILABLE_DATA_LINEAGE", path, "Available expression data requires fact and source refs."));
      if (requirementFactRefs.some((ref) => !allowedSemanticRefs.has(ref))) errors.push(issue("DATA_FACT_LINEAGE", `${path}.fact_refs`, "Data fact refs must resolve to fingerprint claims or supporting facts."));
      if (requirementSourceRefs.some((ref) => !sourceRefs.includes(ref))) errors.push(issue("DATA_SOURCE_LINEAGE", `${path}.source_refs`, "Data source refs must resolve to lineage source refs."));
    } else if (status === "missing") {
      if (requirementFactRefs.length || requirementSourceRefs.length) errors.push(issue("MISSING_DATA_LINEAGE", path, "Missing data must not carry invented fact or source refs."));
      if (requirementId && required === true) {
        missingRequiredIds.add(requirementId);
        if (materialToClaim === true) {
          missingMaterialIds.add(requirementId);
          if (NON_DEGRADABLE_MATERIAL_CLASSES.has(requestClass)) nondegradableMissingIds.add(requirementId);
        }
      }
    }
  });

  const textFields = new Set(["format", "public_tags", "max_total_characters", "data_requirement_refs", "hook", "proof", "mechanism", "action", "caveat", "close"]);
  const textBlueprint = validateObject(g(payload, "text_blueprint"), "$.text_blueprint", textFields, textFields, errors);
  if (!new Set(["channel_neutral", "short_post", "thread", "memo", "article", "caption"]).has(g(textBlueprint, "format"))) errors.push(issue("TEXT_FORMAT", "$.text_blueprint.format", "Unsupported text format."));
  const tags = stringList(g(textBlueprint, "public_tags"), "$.text_blueprint.public_tags", errors, { minimum: 2, maximum: 4 });
  tags.forEach((tag, index) => { if (codePointLength(tag) > 24) errors.push(issue("TAG_LENGTH", `$.text_blueprint.public_tags[${index}]`, "Public tags must not exceed 24 characters.")); });
  const maxTotal = integerRange(g(textBlueprint, "max_total_characters"), "$.text_blueprint.max_total_characters", 120, 12000, errors);
  const textRequirementRefs = new Set(stringList(g(textBlueprint, "data_requirement_refs"), "$.text_blueprint.data_requirement_refs", errors));
  const unknownTextRequirementRefs = setDifference(textRequirementRefs, new Set(dataRequirementsById.keys()));
  if (unknownTextRequirementRefs.size) errors.push(issue("TEXT_DATA_REQUIREMENT_REF", "$.text_blueprint.data_requirement_refs", `Unknown data requirement refs: ${pyRepr(sorted(unknownTextRequirementRefs))}.`));
  const expectedTextRequirementRefs = new Set([...dataRequirementsById].filter(([, requirement]) => (Array.isArray(g(requirement, "expression_surfaces")) ? g(requirement, "expression_surfaces") : []).includes("text")).map(([requirementId]) => requirementId));
  if (!setEquals(textRequirementRefs, expectedTextRequirementRefs)) errors.push(issue("TEXT_DATA_REQUIREMENT_COVERAGE", "$.text_blueprint.data_requirement_refs", "Text blueprint refs must exactly match requirements routed to text."));
  const sectionFields = new Set(["mode", "purpose", "semantic_refs", "max_characters", "omission_reason"]);
  const actionFields = new Set([...sectionFields, "action_kind"]);
  let allocatedCharacters = 0;
  for (const sectionName of ["hook", "proof", "mechanism", "caveat", "close"]) {
    const path = `$.text_blueprint.${sectionName}`;
    const section = validateObject(g(textBlueprint, sectionName), path, sectionFields, sectionFields, errors);
    const mode = g(section, "mode");
    const purpose = nullableString(g(section, "purpose"), `${path}.purpose`, errors);
    const refs = stringList(g(section, "semantic_refs"), `${path}.semantic_refs`, errors);
    const maxChars = integerRange(g(section, "max_characters"), `${path}.max_characters`, 0, 1200, errors);
    const omissionReason = nullableString(g(section, "omission_reason"), `${path}.omission_reason`, errors);
    if (mode !== "include") errors.push(issue("REQUIRED_TEXT_SECTION", `${path}.mode`, `${sectionName} must be included.`));
    if (purpose === null || !refs.length || maxChars === null || maxChars === 0 || omissionReason !== null) errors.push(issue("TEXT_SECTION_SHAPE", path, "Included text sections require purpose, refs, a positive budget, and no omission reason."));
    if (refs.some((ref) => !allowedSemanticRefs.has(ref))) errors.push(issue("TEXT_LINEAGE", `${path}.semantic_refs`, "Text refs must resolve to semantic claims or supporting facts."));
    if (maxChars) allocatedCharacters += maxChars;
    if (purpose) publicPlanText.push([`${path}.purpose`, purpose]);
  }
  const actionPath = "$.text_blueprint.action";
  const actionSection = validateObject(g(textBlueprint, "action"), actionPath, actionFields, actionFields, errors);
  const actionMode = g(actionSection, "mode");
  const actionKind = g(actionSection, "action_kind");
  const actionPurpose = nullableString(g(actionSection, "purpose"), `${actionPath}.purpose`, errors);
  const actionRefs = stringList(g(actionSection, "semantic_refs"), `${actionPath}.semantic_refs`, errors);
  const actionMax = integerRange(g(actionSection, "max_characters"), `${actionPath}.max_characters`, 0, 1200, errors);
  const actionOmission = nullableString(g(actionSection, "omission_reason"), `${actionPath}.omission_reason`, errors);
  const expectedActionKind = ACTION_BY_TRADE_INTENT.get(tradeIntent);
  if (actionKind !== expectedActionKind) errors.push(issue("ACTION_INTENT_MISMATCH", `${actionPath}.action_kind`, "Action kind must map exactly from source trade intent."));
  if (tradeIntent === "none") {
    if (!(actionMode === "omit" && actionKind === "omit" && actionPurpose === null && !actionRefs.length && actionMax === 0 && actionOmission === "source_has_no_trade_intent")) errors.push(issue("NO_TRADE_ACTION", actionPath, "No-trade source intent requires a fully omitted action slot."));
  } else {
    if (!(actionMode === "include" && actionPurpose !== null && actionRefs.length && actionMax !== null && actionMax !== 0 && actionOmission === null)) errors.push(issue("TRADE_ACTION", actionPath, "Preserved source action requires an included, referenced action slot."));
    if (actionRefs.some((ref) => !claimRefs.includes(ref))) errors.push(issue("ACTION_LINEAGE", `${actionPath}.semantic_refs`, "Action refs must resolve to semantic claim refs."));
    if (actionMax) allocatedCharacters += actionMax;
    if (actionPurpose) publicPlanText.push([`${actionPath}.purpose`, actionPurpose]);
  }
  if (maxTotal !== null && allocatedCharacters > maxTotal) errors.push(issue("TEXT_BUDGET", "$.text_blueprint.max_total_characters", "Section budgets exceed the total text budget."));

  const visualFields = new Set(["intent", "grammar", "data_requirement_refs", "execution_route", "fallback", "image_text_budget"]);
  const visual = validateObject(g(payload, "visual_plan"), "$.visual_plan", visualFields, visualFields, errors);
  const intentFields = new Set(["job", "reader_question", "primary_message", "reader_takeaway", "candidate_jobs", "target_evidence_shapes"]);
  const visualIntent = validateObject(g(visual, "intent"), "$.visual_plan.intent", intentFields, intentFields, errors);
  const visualJob = g(visualIntent, "job");
  if (!VISUAL_CANDIDATE_JOBS.has(visualJob)) errors.push(issue("VISUAL_JOB", "$.visual_plan.intent.job", "Unsupported visual job."));
  for (const [key, maximum] of [["reader_question", 160], ["primary_message", 240], ["reader_takeaway", 240]]) {
    const value = g(visualIntent, key);
    if (!nonempty(value) || codePointLength(pyStrOrEmpty(value)) > maximum) errors.push(issue("VISUAL_MESSAGE", `$.visual_plan.intent.${key}`, `Visual intent text must contain one to ${maximum} characters.`));
    else if (typeof value === "string") publicPlanText.push([`$.visual_plan.intent.${key}`, value]);
  }

  let candidateJobs = g(visualIntent, "candidate_jobs");
  if (!Array.isArray(candidateJobs) || ![1, 3].includes(candidateJobs.length)) {
    errors.push(issue("VISUAL_CANDIDATE_JOBS", "$.visual_plan.intent.candidate_jobs", "Visual intent requires one selected job or three explicitly requested jobs."));
    candidateJobs = [];
  }
  const candidateFamilies = [];
  const candidateJobIds = [];
  const candidateQuestions = [];
  const candidateRequirementRefsByFamily = new Map();
  const candidateEvidenceShapeUnion = new Set();
  const candidateFields = new Set(["family", "job", "reader_question", "evidence_shapes", "requirement_refs"]);
  candidateJobs.forEach((rawCandidate, index) => {
    const path = `$.visual_plan.intent.candidate_jobs[${index}]`;
    const candidate = validateObject(rawCandidate, path, candidateFields, candidateFields, errors);
    const family = g(candidate, "family"), job = g(candidate, "job"), question = g(candidate, "reader_question");
    if (!VISUAL_CANDIDATE_JOBS_BY_FAMILY.has(family)) errors.push(issue("VISUAL_CANDIDATE_FAMILY", `${path}.family`, "Unsupported visual candidate family."));
    else {
      candidateFamilies.push(family);
      if (!VISUAL_CANDIDATE_JOBS_BY_FAMILY.get(family).has(job)) errors.push(issue("VISUAL_CANDIDATE_JOB_FAMILY", `${path}.job`, "Candidate job is incompatible with its family."));
    }
    if (!VISUAL_CANDIDATE_JOBS.has(job)) errors.push(issue("VISUAL_CANDIDATE_JOB", `${path}.job`, "Unsupported visual candidate job."));
    else candidateJobIds.push(job);
    if (!nonempty(question) || codePointLength(pyStrOrEmpty(question)) > 160) errors.push(issue("VISUAL_CANDIDATE_QUESTION", `${path}.reader_question`, "Candidate reader question must contain one to 160 characters."));
    else if (typeof question === "string") {
      candidateQuestions.push(question.trim());
      publicPlanText.push([`${path}.reader_question`, question]);
    }
    const candidateEvidenceShapes = new Set(stringList(g(candidate, "evidence_shapes"), `${path}.evidence_shapes`, errors, { minimum: 1, maximum: 4 }));
    const unknownCandidateShapes = setDifference(candidateEvidenceShapes, EVIDENCE_SHAPES);
    if (unknownCandidateShapes.size) errors.push(issue("VISUAL_CANDIDATE_EVIDENCE_SHAPE", `${path}.evidence_shapes`, `Unsupported candidate evidence shapes: ${pyRepr(sorted(unknownCandidateShapes))}.`));
    for (const shape of candidateEvidenceShapes) candidateEvidenceShapeUnion.add(shape);
    const candidateRequirementRefs = new Set(stringList(g(candidate, "requirement_refs"), `${path}.requirement_refs`, errors));
    if (typeof family === "string") candidateRequirementRefsByFamily.set(family, candidateRequirementRefs);
  });
  if (candidateJobs.length === 3 && (!setEquals(new Set(candidateFamilies), new Set(VISUAL_CANDIDATE_JOBS_BY_FAMILY.keys())) || candidateFamilies.length !== 3)) errors.push(issue("VISUAL_CANDIDATE_FAMILY_COVERAGE", "$.visual_plan.intent.candidate_jobs", "Three requested jobs must include fast_read, proof, and system exactly once."));
  if (VISUAL_CANDIDATE_JOBS.has(visualJob) && !candidateJobIds.includes(visualJob)) errors.push(issue("VISUAL_PRIMARY_JOB_COVERAGE", "$.visual_plan.intent.job", "The primary visual job must appear in the retained candidate targets."));
  if (candidateQuestions.length !== new Set(candidateQuestions).size) errors.push(issue("VISUAL_READER_QUESTION_UNIQUE", "$.visual_plan.intent.candidate_jobs", "Each candidate must answer a different reader question."));

  const targetEvidenceShapes = new Set(stringList(g(visualIntent, "target_evidence_shapes"), "$.visual_plan.intent.target_evidence_shapes", errors, { minimum: 1, maximum: 6 }));
  const unknownEvidenceShapes = setDifference(targetEvidenceShapes, EVIDENCE_SHAPES);
  if (unknownEvidenceShapes.size) errors.push(issue("VISUAL_EVIDENCE_SHAPE", "$.visual_plan.intent.target_evidence_shapes", `Unsupported evidence shapes: ${pyRepr(sorted(unknownEvidenceShapes))}.`));
  if (!setEquals(candidateEvidenceShapeUnion, targetEvidenceShapes)) errors.push(issue("VISUAL_EVIDENCE_SHAPE_COVERAGE", "$.visual_plan.intent.target_evidence_shapes", "Target evidence shapes must equal the union of the retained candidate shape sets."));
  const grammarRequired = new Set(["primary", "rationale"]);
  const grammarAllowed = new Set([...grammarRequired, "alternatives", "argument_grammar"]);
  const grammar = validateObject(g(visual, "grammar"), "$.visual_plan.grammar", grammarRequired, grammarAllowed, errors);
  const primaryGrammar = g(grammar, "primary");
  if (!VIEWPOINT_VISUAL_GRAMMARS.has(primaryGrammar)) errors.push(issue("VISUAL_GRAMMAR", "$.visual_plan.grammar.primary", "Unsupported unified ViewpointVisual grammar."));
  else if (primaryGrammar !== primaryEngine) errors.push(issue("TEXT_VISUAL_ENGINE_MISMATCH", "$.visual_plan.grammar.primary", "Text and visual plans must use the same unified rhetorical engine."));
  const alternatives = stringList(g(grammar, "alternatives", []), "$.visual_plan.grammar.alternatives", errors);
  if (alternatives.length) errors.push(issue("VISUAL_GRAMMAR_ALTERNATIVE", "$.visual_plan.grammar.alternatives", "Use one shared unified rhetorical engine; layout variants belong in argument_grammar or downstream rendering."));
  const argumentGrammar = g(grammar, "argument_grammar");
  if (argumentGrammar !== null && !ARGUMENT_GRAMMARS.has(argumentGrammar)) errors.push(issue("ARGUMENT_GRAMMAR", "$.visual_plan.grammar.argument_grammar", "Unsupported legacy argument-layout grammar."));
  if (!nonempty(g(grammar, "rationale")) || codePointLength(pyStrOrEmpty(g(grammar, "rationale"))) > 300) errors.push(issue("GRAMMAR_RATIONALE", "$.visual_plan.grammar.rationale", "Grammar rationale must contain one to 300 characters."));

  const visualRequirementRefs = new Set(stringList(g(visual, "data_requirement_refs"), "$.visual_plan.data_requirement_refs", errors));
  const unknownVisualRequirementRefs = setDifference(visualRequirementRefs, new Set(dataRequirementsById.keys()));
  if (unknownVisualRequirementRefs.size) errors.push(issue("VISUAL_DATA_REQUIREMENT_REF", "$.visual_plan.data_requirement_refs", `Unknown data requirement refs: ${pyRepr(sorted(unknownVisualRequirementRefs))}.`));
  const expectedVisualRequirementRefs = new Set([...dataRequirementsById].filter(([, requirement]) => (Array.isArray(g(requirement, "expression_surfaces")) ? g(requirement, "expression_surfaces") : []).includes("visual")).map(([requirementId]) => requirementId));
  if (!setEquals(visualRequirementRefs, expectedVisualRequirementRefs)) errors.push(issue("VISUAL_DATA_REQUIREMENT_COVERAGE", "$.visual_plan.data_requirement_refs", "Visual plan refs must exactly match requirements routed to visual expression."));
  const visualRequirements = [...visualRequirementRefs].filter((requirementId) => dataRequirementsById.has(requirementId)).map((requirementId) => dataRequirementsById.get(requirementId));
  const materialVisualRequirementRefs = new Set([...visualRequirementRefs].filter((requirementId) => g(dataRequirementsById.get(requirementId) ?? {}, "material_to_claim") === true));
  for (const [family, candidateRefs] of candidateRequirementRefsByFamily) {
    const unknownCandidateRefs = setDifference(candidateRefs, visualRequirementRefs);
    if (unknownCandidateRefs.size) errors.push(issue("VISUAL_CANDIDATE_REQUIREMENT_REF", "$.visual_plan.intent.candidate_jobs", `${family} uses non-visual requirement refs: ${pyRepr(sorted(unknownCandidateRefs))}.`));
    const missingMaterialRefs = setDifference(materialVisualRequirementRefs, candidateRefs);
    if (missingMaterialRefs.size) errors.push(issue("VISUAL_CANDIDATE_MATERIAL_COVERAGE", "$.visual_plan.intent.candidate_jobs", `${family} omits material visual requirements: ${pyRepr(sorted(missingMaterialRefs))}.`));
  }
  const declaredKinds = new Set(visualRequirements.map((requirement) => g(requirement, "kind")).filter((kind) => DATA_KINDS.has(kind)));
  const availableKinds = new Set(visualRequirements.filter((requirement) => g(requirement, "status") === "available" && DATA_KINDS.has(g(requirement, "kind"))).map((requirement) => g(requirement, "kind")));
  const compatibleModes = DATA_MODES_BY_VISUAL.get(primaryGrammar) ?? new Set();
  if (visualRequirementRefs.size && VIEWPOINT_VISUAL_GRAMMARS.has(primaryGrammar) && !setIntersection(declaredKinds, compatibleModes).size) errors.push(issue("VISUAL_DATA_MODE", "$.visual_plan.data_requirement_refs", "Route at least one data mode compatible with the unified visual grammar."));

  const routeFields = new Set([
    "route_registry_ref", "route_registry_sha256", "route_id", "query_requests", "skill_path_ids",
    "primary_renderer_skill_id", "detail_renderer_skill_id", "resume_policy", "route_sha256",
  ]);
  const executionRoute = validateObject(g(visual, "execution_route"), "$.visual_plan.execution_route", routeFields, routeFields, errors);
  if (g(executionRoute, "route_registry_ref") !== "visual-intent-route-registry-v1") errors.push(issue("VISUAL_ROUTE_REGISTRY", "$.visual_plan.execution_route.route_registry_ref", "Use the canonical visual intent route registry."));
  if (g(executionRoute, "route_registry_sha256") !== VISUAL_ROUTE_REGISTRY_SHA256) errors.push(issue("VISUAL_ROUTE_REGISTRY_HASH", "$.visual_plan.execution_route.route_registry_sha256", "Visual intent route registry hash does not match the packaged registry."));
  const routeId = g(executionRoute, "route_id");
  const routeSpec = VISUAL_ROUTE_SPECS.get(routeId);
  if (routeSpec === undefined) errors.push(issue("VISUAL_ROUTE_ID", "$.visual_plan.execution_route.route_id", "Unsupported visual execution route."));
  let queryRequests = g(executionRoute, "query_requests");
  if (!Array.isArray(queryRequests) || queryRequests.length > 16) {
    errors.push(issue("VISUAL_QUERY_REQUESTS", "$.visual_plan.execution_route.query_requests", "Expected at most 16 routed visual Query requests."));
    queryRequests = [];
  }
  const routedRequirementRefs = [];
  const queryFields = new Set(["requirement_ref", "capability_id", "tool_ids", "run_policy"]);
  queryRequests.forEach((rawQuery, index) => {
    const path = `$.visual_plan.execution_route.query_requests[${index}]`;
    const query = validateObject(rawQuery, path, queryFields, queryFields, errors);
    let requirementRef = g(query, "requirement_ref");
    if (typeof requirementRef !== "string" || !/^D[1-9][0-9]*$/.test(requirementRef)) {
      errors.push(issue("VISUAL_QUERY_REQUIREMENT_REF", `${path}.requirement_ref`, "Invalid visual Query requirement ref."));
      requirementRef = null;
    } else if (!visualRequirementRefs.has(requirementRef)) errors.push(issue("VISUAL_QUERY_REQUIREMENT_SCOPE", `${path}.requirement_ref`, "Visual Query requests must target requirements routed to the visual surface."));
    else routedRequirementRefs.push(requirementRef);
    const capabilityId = g(query, "capability_id");
    if (!QUERY_CAPABILITY_TOOLS.has(capabilityId)) errors.push(issue("VISUAL_QUERY_CAPABILITY", `${path}.capability_id`, "Unsupported Cuebook Query capability."));
    const toolIds = new Set(stringList(g(query, "tool_ids"), `${path}.tool_ids`, errors, { minimum: 2, maximum: 3 }));
    if (QUERY_CAPABILITY_TOOLS.has(capabilityId) && !setEquals(toolIds, QUERY_CAPABILITY_TOOLS.get(capabilityId))) errors.push(issue("VISUAL_QUERY_TOOLS", `${path}.tool_ids`, "Tool IDs must match the selected Query capability exactly."));
    if (g(query, "run_policy") !== "reuse_or_query_gap") errors.push(issue("VISUAL_QUERY_RUN_POLICY", `${path}.run_policy`, "Visual Query requests must reuse a compatible bundle or query only the gap."));
    const requirement = requirementRef ? dataRequirementsById.get(requirementRef) : null;
    if (requirement && QUERY_CAPABILITY_REQUEST_CLASSES.has(capabilityId)) {
      const requestClass = g(requirement, "request_class");
      if (!QUERY_CAPABILITY_REQUEST_CLASSES.get(capabilityId).has(requestClass)) errors.push(issue("VISUAL_QUERY_CLASS", `${path}.capability_id`, `${pyStr(capabilityId)} cannot fulfill ${pyStr(requestClass)}.`));
    }
  });
  if (routedRequirementRefs.length !== new Set(routedRequirementRefs).size) errors.push(issue("VISUAL_QUERY_REQUIREMENT_UNIQUE", "$.visual_plan.execution_route.query_requests", "Each visual requirement must have exactly one Query route."));
  if (!setEquals(new Set(routedRequirementRefs), visualRequirementRefs)) errors.push(issue("VISUAL_QUERY_REQUIREMENT_COVERAGE", "$.visual_plan.execution_route.query_requests", "Query routes must cover every visual data requirement exactly once."));
  const skillPathIds = stringList(g(executionRoute, "skill_path_ids"), "$.visual_plan.execution_route.skill_path_ids", errors, { maximum: 5 });
  if (routeSpec !== undefined) {
    if (!pyEquals(skillPathIds, routeSpec.skill_path_ids)) errors.push(issue("VISUAL_SKILL_PATH", "$.visual_plan.execution_route.skill_path_ids", "Skill path must match the selected visual route and canonical stage order."));
    if (g(executionRoute, "primary_renderer_skill_id") !== routeSpec.primary_renderer_skill_id) errors.push(issue("VISUAL_PRIMARY_RENDERER", "$.visual_plan.execution_route.primary_renderer_skill_id", "Primary renderer must match the selected visual route."));
    if (g(executionRoute, "detail_renderer_skill_id") !== routeSpec.detail_renderer_skill_id) errors.push(issue("VISUAL_DETAIL_RENDERER", "$.visual_plan.execution_route.detail_renderer_skill_id", "Detail renderer must match the selected visual route."));
  }
  if (g(executionRoute, "resume_policy") !== "resume_from_latest_valid_artifact") errors.push(issue("VISUAL_RESUME_POLICY", "$.visual_plan.execution_route.resume_policy", "Visual work must resume from the latest valid artifact."));
  const routeHash = g(executionRoute, "route_sha256");
  const expectedRouteHash = calculateVisualRouteHash(visual);
  if (!validSha256(routeHash) || routeHash !== expectedRouteHash) errors.push(issue("VISUAL_ROUTE_HASH", "$.visual_plan.execution_route.route_sha256", "Visual intent route hash does not match the locked intent, requirements, and execution route."));
  if (targetEvidenceShapes.has("ohlcv_series") && routeId !== "viewpoint_static_plus_thesis_chart") errors.push(issue("OHLCV_RENDERER_ROUTE", "$.visual_plan.execution_route.route_id", "OHLCV evidence requires the thesis-chart detail renderer route."));
  if (routeId === "viewpoint_static_plus_thesis_chart" && !visualRequirements.some((requirement) => g(requirement, "request_class") === "market_series")) errors.push(issue("THESIS_CHART_DATA_ROUTE", "$.visual_plan.execution_route.route_id", "The thesis-chart detail route requires a market-series data request."));

  const fallbackFields = new Set(["trigger", "strategy", "applies_to_requirement_refs", "preserves_fingerprint", "prohibited_substitutions"]);
  const fallback = validateObject(g(visual, "fallback"), "$.visual_plan.fallback", fallbackFields, fallbackFields, errors);
  const trigger = g(fallback, "trigger"), strategy = g(fallback, "strategy");
  const fallbackRequirementRefs = new Set(stringList(g(fallback, "applies_to_requirement_refs"), "$.visual_plan.fallback.applies_to_requirement_refs", errors));
  if (!new Set(["none", "missing_required_data", "rights_unavailable", "unverified_anecdote", "renderer_limit"]).has(trigger)) errors.push(issue("FALLBACK_TRIGGER", "$.visual_plan.fallback.trigger", "Unsupported fallback trigger."));
  if (!new Set(["none", "qualitative", "key_numbers", "series", "text_only", "no_visual"]).has(strategy)) errors.push(issue("FALLBACK_STRATEGY", "$.visual_plan.fallback.strategy", "Unsupported fallback strategy."));
  if ((routeId === "no_visual") !== (strategy === "no_visual")) errors.push(issue("NO_VISUAL_ROUTE", "$.visual_plan.execution_route.route_id", "The no-visual route and no-visual fallback strategy must be selected together."));
  if ((trigger === "none") !== (strategy === "none")) errors.push(issue("FALLBACK_PAIR", "$.visual_plan.fallback", "Fallback trigger and strategy must either both be none or both be active."));
  if (setDifference(fallbackRequirementRefs, visualRequirementRefs).size) errors.push(issue("FALLBACK_REQUIREMENT_REF", "$.visual_plan.fallback.applies_to_requirement_refs", "Fallback refs must resolve to requirements routed to the visual plan."));
  if (trigger === "none" && fallbackRequirementRefs.size) errors.push(issue("INACTIVE_FALLBACK_REFS", "$.visual_plan.fallback.applies_to_requirement_refs", "An inactive fallback cannot claim requirement refs."));
  if (trigger !== "none" && !fallbackRequirementRefs.size) errors.push(issue("ACTIVE_FALLBACK_EMPTY", "$.visual_plan.fallback.applies_to_requirement_refs", "An active fallback must name the requirements it covers."));
  const missingRequiredVisualIds = setIntersection(missingRequiredIds, visualRequirementRefs);
  const fallbackEligibleIds = setDifference(missingRequiredVisualIds, nondegradableMissingIds);
  if (fallbackEligibleIds.size && (trigger === "none" || strategy === "none")) errors.push(issue("MISSING_DATA_FALLBACK", "$.visual_plan.fallback", "Missing fallback-eligible visual data requires an active fallback."));
  if (!setEquals(fallbackRequirementRefs, fallbackEligibleIds)) errors.push(issue("FALLBACK_REQUIREMENT_COVERAGE", "$.visual_plan.fallback.applies_to_requirement_refs", "Fallback refs must exactly match missing required visual requests that permit fallback."));
  const materialFallbackRefs = setIntersection(fallbackRequirementRefs, nondegradableMissingIds);
  if (materialFallbackRefs.size) errors.push(issue("MATERIAL_REQUEST_FALLBACK", "$.visual_plan.fallback.applies_to_requirement_refs", `Non-degradable material requests cannot fallback: ${pyRepr(sorted(materialFallbackRefs))}.`));
  if (DATA_KINDS.has(strategy) && !availableKinds.has(strategy)) errors.push(issue("FALLBACK_DATA_MODE", "$.visual_plan.fallback.strategy", "A data-mode fallback requires an available requirement of the same mode."));
  if (missingMaterialIds.size && new Set(["ready", "frozen"]).has(state)) errors.push(issue("MATERIAL_DATA_MISSING", "$.data_requirements", "Ready output cannot omit a missing material creator premise."));
  if (nondegradableMissingIds.size && state !== "blocked") errors.push(issue("MATERIAL_REQUEST_STATE", "$.state", "Missing material news, valuation, comparator, price, or settlement requests require a blocked plan."));
  if (g(fallback, "preserves_fingerprint") !== true) errors.push(issue("FALLBACK_LOCK", "$.visual_plan.fallback.preserves_fingerprint", "Fallback must preserve the meaning fingerprint."));
  const substitutions = new Set(stringList(g(fallback, "prohibited_substitutions"), "$.visual_plan.fallback.prohibited_substitutions", errors, { minimum: 4 }));
  if (!setEquals(substitutions, FALLBACK_SUBSTITUTIONS)) errors.push(issue("FALLBACK_FIREWALL", "$.visual_plan.fallback.prohibited_substitutions", "Fallback must prohibit all unsafe substitutions."));

  const budgetFields = new Set(["unit", ...IMAGE_BUDGET_LIMITS.keys()]);
  const budget = validateObject(g(visual, "image_text_budget"), "$.visual_plan.image_text_budget", budgetFields, budgetFields, errors);
  if (g(budget, "unit") !== "characters") errors.push(issue("IMAGE_BUDGET_UNIT", "$.visual_plan.image_text_budget.unit", "Image text budget unit must be characters."));
  for (const [key, [minimum, maximum]] of IMAGE_BUDGET_LIMITS) integerRange(g(budget, key), `$.visual_plan.image_text_budget.${key}`, minimum, maximum, errors);

  const settlementFields = new Set(["status", "reason_codes", "claim_ref", "requirements", "missing_requirements", "downstream_route"]);
  const settlement = validateObject(g(payload, "settlement_eligibility"), "$.settlement_eligibility", settlementFields, settlementFields, errors);
  const settlementStatus = g(settlement, "status");
  if (!new Set(["ineligible", "candidate", "eligible", "blocked"]).has(settlementStatus)) errors.push(issue("SETTLEMENT_STATUS", "$.settlement_eligibility.status", "Unsupported settlement status."));
  const reasonCodes = stringList(g(settlement, "reason_codes"), "$.settlement_eligibility.reason_codes", errors, { minimum: 1 });
  const claimRef = nullableString(g(settlement, "claim_ref"), "$.settlement_eligibility.claim_ref", errors);
  const requirementObject = validateObject(g(settlement, "requirements"), "$.settlement_eligibility.requirements", SETTLEMENT_REQUIREMENTS, SETTLEMENT_REQUIREMENTS, errors);
  for (const key of SETTLEMENT_REQUIREMENTS) if (typeof g(requirementObject, key) !== "boolean") errors.push(issue("SETTLEMENT_REQUIREMENT", `$.settlement_eligibility.requirements.${key}`, "Settlement requirement must be boolean."));
  const missingRequirements = new Set(stringList(g(settlement, "missing_requirements"), "$.settlement_eligibility.missing_requirements", errors));
  if ([...missingRequirements].some((item) => !SETTLEMENT_REQUIREMENTS.has(item))) errors.push(issue("SETTLEMENT_MISSING", "$.settlement_eligibility.missing_requirements", "Unsupported missing settlement requirement."));
  const computedMissing = new Set([...SETTLEMENT_REQUIREMENTS].filter((key) => g(requirementObject, key) === false));
  if (settlementIntent !== "none" && !setEquals(missingRequirements, computedMissing)) errors.push(issue("SETTLEMENT_MISSING_MISMATCH", "$.settlement_eligibility.missing_requirements", "Missing requirements must match false requirement flags."));
  const route = g(settlement, "downstream_route");
  if (!new Set([null, "compile-cuebook-settlement-claim"]).has(route)) errors.push(issue("SETTLEMENT_ROUTE", "$.settlement_eligibility.downstream_route", "Unsupported settlement route."));
  if (settlementIntent === "none") {
    if (!(settlementStatus === "ineligible" && claimRef === null && route === null && pyEquals(reasonCodes, ["source_intent_absent"]) && !Object.values(requirementObject).some(pyTruthy) && !missingRequirements.size)) errors.push(issue("NO_SETTLEMENT", "$.settlement_eligibility", "No-settlement source intent requires a fully ineligible settlement block."));
  } else if (settlementIntent === "candidate") {
    if (!new Set(["candidate", "blocked"]).has(settlementStatus) || route !== "compile-cuebook-settlement-claim") errors.push(issue("SETTLEMENT_CANDIDATE", "$.settlement_eligibility", "Candidate settlement intent must remain candidate or blocked and route to claim compilation."));
  } else if (settlementIntent === "explicit") {
    const expectedStatus = computedMissing.size ? "blocked" : "eligible";
    if (settlementStatus !== expectedStatus) errors.push(issue("SETTLEMENT_EXPLICIT", "$.settlement_eligibility.status", "Explicit settlement intent is eligible only when all requirements are present."));
    const expectedRoute = claimRef !== null ? null : "compile-cuebook-settlement-claim";
    if (route !== expectedRoute) errors.push(issue("SETTLEMENT_ROUTE", "$.settlement_eligibility.downstream_route", "Explicit settlement intent without a claim ref must route to claim compilation."));
  }

  const firewallFields = new Set([
    "source_attribution_required", "factual_claims_require_refs", "fact_interpretation_separated",
    "anecdote_policy", "unverified_anecdote_as_proof", "first_person_experience",
    "living_creator_imitation", "signature_phrasing_reuse", "sentence_sequence_copy",
    "identity_impersonation", "original_composition_required", "max_verbatim_words", "public_backend_terms_allowed",
  ]);
  const firewall = validateObject(g(payload, "source_style_firewall"), "$.source_style_firewall", firewallFields, firewallFields, errors);
  for (const key of ["source_attribution_required", "factual_claims_require_refs", "fact_interpretation_separated"]) if (g(firewall, key) !== true) errors.push(issue("SOURCE_FIREWALL", `$.source_style_firewall.${key}`, "Source firewall control must be true."));
  if (g(firewall, "original_composition_required") !== true) errors.push(issue("ORIGINAL_COMPOSITION", "$.source_style_firewall.original_composition_required", "Original composition must be required."));
  for (const key of ["unverified_anecdote_as_proof", "living_creator_imitation", "signature_phrasing_reuse", "sentence_sequence_copy", "identity_impersonation", "public_backend_terms_allowed"]) if (g(firewall, key) !== false) errors.push(issue("STYLE_FIREWALL", `$.source_style_firewall.${key}`, "Style firewall control must be false."));
  const anecdotePolicy = g(firewall, "anecdote_policy");
  if (!new Set(["not_present", "context_only", "sentiment_only", "creator_owned_only"]).has(anecdotePolicy)) errors.push(issue("ANECDOTE_POLICY", "$.source_style_firewall.anecdote_policy", "Unsupported anecdote policy."));
  if (primaryEngine === "sentiment_witness" && anecdotePolicy !== "sentiment_only") errors.push(issue("SENTIMENT_ANECDOTE_POLICY", "$.source_style_firewall.anecdote_policy", "Sentiment witness requires sentiment-only anecdote use."));
  integerRange(g(firewall, "max_verbatim_words"), "$.source_style_firewall.max_verbatim_words", 0, 25, errors);
  const experienceFields = new Set(["mode", "allowed_claim_refs"]);
  const experience = validateObject(g(firewall, "first_person_experience"), "$.source_style_firewall.first_person_experience", experienceFields, experienceFields, errors);
  const experienceMode = g(experience, "mode");
  const allowedExperienceRefs = stringList(g(experience, "allowed_claim_refs"), "$.source_style_firewall.first_person_experience.allowed_claim_refs", errors);
  const expectedExperienceMode = ownedExperienceRefs.length ? "preserve_creator_owned_only" : "forbid";
  const expectedVoiceMode = ownedExperienceRefs.length ? "preserve_creator_owned_only" : "forbidden";
  if (experienceMode !== expectedExperienceMode || !setEquals(new Set(allowedExperienceRefs), new Set(ownedExperienceRefs))) errors.push(issue("FIRST_PERSON_OWNERSHIP", "$.source_style_firewall.first_person_experience", "First-person experience policy must match creator-owned semantic refs exactly."));
  if (g(voice, "first_person_experience") !== expectedVoiceMode) errors.push(issue("FIRST_PERSON_VOICE", "$.voice_spec.first_person_experience", "VoiceSpec first-person experience must match creator-owned semantic refs."));

  if (nonempty(g(narrative, "frame"))) publicPlanText.push(["$.narrative.frame", g(narrative, "frame")]);
  primitives.forEach((primitive, index) => { if (isObject(primitive) && nonempty(g(primitive, "purpose"))) publicPlanText.push([`$.narrative.primitives[${index}].purpose`, g(primitive, "purpose")]); });
  tags.forEach((tag, index) => publicPlanText.push([`$.text_blueprint.public_tags[${index}]`, tag]));
  for (const [path, value] of publicPlanText) {
    if (containsCuebookWorkflowNarration(value)) errors.push(issue("PUBLIC_CUEBOOK_NARRATION", path, "Public expression guidance must not narrate Cuebook assistance or transformation workflow."));
    const backendTerm = containsBackendTerm(value);
    if (backendTerm !== null) errors.push(issue("PUBLIC_BACKEND_TERM", path, `Public expression guidance contains backend term: ${backendTerm}.`));
    for (const phrase of bannedStockPhrases) if (value.toLowerCase().includes(phrase.toLowerCase())) errors.push(issue("AI_STOCK_PHRASE", path, `Public expression guidance contains banned stock phrase: ${phrase}.`));
    if (!ownedExperienceRefs.length && containsFirstPersonExperience(value)) errors.push(issue("INVENTED_FIRST_PERSON_EXPERIENCE", path, "First-person experience is not creator-owned in the semantic input."));
  }
  const publicExpressionText = publicPlanText.map(([, value]) => value).join("\n");
  const notAButBCount = [...publicExpressionText.matchAll(/不是\s*[^。！？\n]{1,80}?\s*而是/gu)].length;
  if (notAButBCount > 1) errors.push(issue("REPEATED_NOT_A_BUT_B", "$.voice_spec.anti_ai_language", "Use at most one 不是 A 而是 B frame across public expression guidance."));

  validateQuality(g(payload, "quality_report"), state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

function parseArgs(argv) {
  let artifact = null;
  let printFingerprintHash = false;
  let expectedSourceSemanticsHash = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--print-fingerprint-hash") printFingerprintHash = true;
    else if (token === "--expected-source-semantics-hash") expectedSourceSemanticsHash = argv[++index];
    else if (artifact === null) artifact = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (artifact === null) throw new Error("the following arguments are required: artifact");
  return { artifact, printFingerprintHash, expectedSourceSemanticsHash };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: validate_creator_expression_plan.mjs artifact [--print-fingerprint-hash] [--expected-source-semantics-hash HASH]\nvalidate_creator_expression_plan.mjs: error: ${error.message}\n`);
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(args.artifact, "utf8"));
  } catch (error) {
    const result = { valid: false, errors: [issue("LOAD", "$", error.message)], warnings: [] };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }
  if (args.printFingerprintHash) {
    const fingerprint = isObject(payload) ? g(payload, "meaning_fingerprint") : null;
    if (!isObject(fingerprint)) {
      process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("FINGERPRINT", "$.meaning_fingerprint", "Expected an object.")], warnings: [] }, null, 2)}\n`);
      return 1;
    }
    process.stdout.write(`${calculateFingerprintHash(fingerprint)}\n`);
    return 0;
  }
  if (args.expectedSourceSemanticsHash !== null && !validSha256(args.expectedSourceSemanticsHash)) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("EXPECTED_HASH", "$", "Expected sha256:<64 lowercase hex characters>.")], warnings: [] }, null, 2)}\n`);
    return 1;
  }
  const result = validate(payload, { expectedSourceSemanticsHash: args.expectedSourceSemanticsHash });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
