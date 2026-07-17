#!/usr/bin/env node
// Validate TradingThesisV1 integrity, precommitment, and safety invariants.
// Port of validate_trading_thesis.py; error codes, paths, message wording, and
// JSON output shapes are contract and must stay byte-compatible with the
// Python original.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REQUIRED_ROOT = new Set([
  "schema_version",
  "thesis_id",
  "revision",
  "lifecycle_state",
  "timestamps",
  "author",
  "lineage",
  "market",
  "claim",
  "evidence_ledger",
  "reasoning",
  "setup",
  "resolution",
  "disclosure",
  "relations",
  "quality_report",
]);
const OPTIONAL_ROOT = new Set(["idea_provenance"]);
const THESIS_ID = /^THESIS_[a-z0-9]{8,64}$/;
const THESIS_REF = /^THESIS_[a-z0-9]{8,64}@r[1-9][0-9]*$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const EVIDENCE_ID = /^E[1-9][0-9]*$/;
const SCENARIO_ID = /^SC[1-9][0-9]*$/;
const STATES = new Set(["draft", "conditional", "ready", "frozen"]);
const DIRECTIONS = new Set(["long", "short", "neutral", "conditional"]);
const RELATIONSHIPS = new Set(["direct", "supported_proxy", "watch_only"]);
const EVIDENCE_CLASSES = new Set(["source", "verified_live", "derived", "hypothesis"]);
const EVIDENCE_ROLES = new Set(["supports", "challenges", "context"]);
const SCORE_MODES = new Set(["binary_accuracy", "brier", "directional_accuracy", "return", "excess_return"]);
const PUBLIC_STATES = new Set(["ready", "frozen"]);
const REFERENCE_BASES = new Set(["last_trade", "last_close", "midpoint", "nav", "official_close", "official_settlement", "spot", "other"]);
const MARKET_STATES = new Set(["regular", "pre", "after", "overnight", "closed", "continuous", "unknown"]);
const ACTION_STATES = new Set(["enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"]);
const IDEA_MODES = new Set(["creator_led", "cuebook_assisted", "cuebook_generated"]);
const IDEA_DELTAS = new Set(["unchanged", "strengthened", "weakened", "narrowed", "conditionalized", "reversed", "abandoned"]);
const CONTRIBUTION_KINDS = new Set(["evidence", "connection", "countercase", "market_context", "settlement_rule"]);
// Python's \b is Unicode-aware (CJK characters are word characters); emulate it
// with explicit word-character lookarounds so boundary behavior matches.
const WB_START = "(?<![\\p{L}\\p{N}_])";
const WB_END = "(?![\\p{L}\\p{N}_])";
const INSTRUCTION_PATTERNS = [
  `${WB_START}(?:buy|sell)\\s+now${WB_END}`,
  `${WB_START}(?:place|submit)\\s+(?:a\\s+)?(?:market|limit|stop)?\\s*order${WB_END}`,
  `${WB_START}(?:all[ -]?in|api key|password|seed phrase)${WB_END}`,
  `${WB_START}[2-9][0-9]*x\\s+leverage${WB_END}`,
  "(?:立即买入|立即卖出|直接下单|梭哈|满仓|助记词|API\\s*密钥|账户密码)",
  "(?:加|使用)\\s*[2-9][0-9]*\\s*倍杠杆",
].map((pattern) => new RegExp(pattern, "iu"));

export function issue(code, path, message) {
  return { code, path, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function obj(value) {
  return isObject(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value) {
  return array(value).filter((item) => typeof item === "string" && item);
}

function isNone(value) {
  return value === null || value === undefined;
}

// Python truthiness for JSON values (None/False/0/""/[]/{} are falsy).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (isObject(value) && Object.keys(value).length === 0) return false;
  return true;
}

// Mirror `str(value or "").strip()` truthiness from the Python original.
function hasText(value) {
  if (typeof value === "string") return value.trim() !== "";
  return pyTruthy(value);
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

// datetime.fromisoformat acceptance (after the caller's Z replacement):
// extended-format date, optional time (hour precision or finer), optional
// numeric UTC offset. Returns {sec, micro, hasTz} or null.
const ISO_TIMESTAMP = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
  "(?:[T ](\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d{1,6}))?)?)?" +
  "(?:([+-])(\\d{2})(?::?(\\d{2})(?::?(\\d{2}))?)?)?)?$",
);

function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function parseIsoTimestamp(value) {
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, y, mo, d, hh, mi, ss, frac, sign, offH, offM, offS] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(hh || 0);
  const minute = Number(mi || 0);
  const second = Number(ss || 0);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  let offsetSeconds = null;
  if (sign) {
    const total = Number(offH) * 3600 + Number(offM || 0) * 60 + Number(offS || 0);
    if (total >= 24 * 3600) return null;
    offsetSeconds = (sign === "-" ? -1 : 1) * total;
  }
  const sec = Date.UTC(year, month - 1, day, hour, minute, second) / 1000 - (offsetSeconds || 0);
  const micro = frac ? Number(frac.padEnd(6, "0")) : 0;
  return { sec, micro, hasTz: offsetSeconds !== null };
}

function cmpTime(a, b) {
  return a.sec - b.sec || a.micro - b.micro;
}

function parseTime(value, path, errors, required = true) {
  if (isNone(value) && !required) return null;
  if (typeof value !== "string" || !value) {
    errors.push(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."));
    return null;
  }
  const parsed = parseIsoTimestamp(value.replaceAll("Z", "+00:00"));
  if (!parsed) {
    errors.push(issue("TIME_FORMAT", path, "Invalid ISO timestamp."));
    return null;
  }
  if (!parsed.hasTz) {
    errors.push(issue("TIMEZONE_REQUIRED", path, "Timestamp must include a timezone."));
    return null;
  }
  return parsed;
}

function addBadRefs(errors, refs, allowed, path, code) {
  if (!Array.isArray(refs)) {
    errors.push(issue("REFS_TYPE", path, "References must be an array."));
    return;
  }
  for (const ref of refs) {
    if (typeof ref !== "string" || !allowed.has(ref)) {
      errors.push(issue(code, path, `Unknown evidence reference: ${pyrepr(ref)}.`));
    }
  }
}

// json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function canonicalHash(payload) {
  const declaration = structuredClone(payload);
  const lineage = declaration.lineage;
  if (isObject(lineage)) lineage.canonical_hash = null;
  return "sha256:" + createHash("sha256").update(canonicalJson(declaration), "utf8").digest("hex");
}

function walkText(value, path = "$") {
  const output = [];
  if (typeof value === "string") {
    output.push([path, value]);
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      output.push(...walkText(child, `${path}.${key}`));
    }
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => {
      output.push(...walkText(child, `${path}[${index}]`));
    });
  }
  return output;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) {
    return {
      valid: false,
      errors: [issue("ROOT_TYPE", "$", "TradingThesisV1 must be an object.")],
      warnings: [],
    };
  }

  for (const key of [...REQUIRED_ROOT].filter((item) => !Object.hasOwn(payload, item)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(payload).filter((item) => !REQUIRED_ROOT.has(item) && !OPTIONAL_ROOT.has(item)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "trading-thesis-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected trading-thesis-v1."));
  }
  const thesisId = payload.thesis_id;
  if (typeof thesisId !== "string" || !THESIS_ID.test(thesisId)) {
    errors.push(issue("THESIS_ID", "$.thesis_id", "Invalid thesis ID."));
  }
  const revision = payload.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    errors.push(issue("REVISION", "$.revision", "revision must be a positive integer."));
  }
  const state = payload.lifecycle_state;
  if (!STATES.has(state)) {
    errors.push(issue("LIFECYCLE_STATE", "$.lifecycle_state", "Unsupported declaration state."));
  }

  const timestamps = obj(payload.timestamps);
  const created = parseTime(timestamps.created_at, "$.timestamps.created_at", errors);
  const updated = parseTime(timestamps.updated_at, "$.timestamps.updated_at", errors);
  const asOf = parseTime(timestamps.as_of, "$.timestamps.as_of", errors);
  const cutoff = parseTime(timestamps.decision_cutoff_at, "$.timestamps.decision_cutoff_at", errors);
  const activated = parseTime(timestamps.activated_at, "$.timestamps.activated_at", errors, false);
  const expires = parseTime(timestamps.expires_at, "$.timestamps.expires_at", errors, false);
  if (created && updated && cmpTime(created, updated) > 0) {
    errors.push(issue("TIMESTAMP_ORDER", "$.timestamps.updated_at", "updated_at precedes created_at."));
  }
  if (asOf && updated && cmpTime(asOf, updated) > 0) {
    errors.push(issue("AS_OF_AFTER_UPDATE", "$.timestamps.as_of", "as_of cannot follow updated_at."));
  }
  if (cutoff && updated && cmpTime(cutoff, updated) > 0) {
    errors.push(issue("CUTOFF_AFTER_UPDATE", "$.timestamps.decision_cutoff_at", "Decision cutoff cannot follow updated_at."));
  }
  if (activated && cutoff && cmpTime(activated, cutoff) < 0) {
    errors.push(issue("ACTIVATION_BEFORE_CUTOFF", "$.timestamps.activated_at", "Activation cannot precede the decision cutoff."));
  }
  if (expires && (activated || cutoff) && cmpTime(expires, activated || cutoff) <= 0) {
    errors.push(issue("EXPIRY_ORDER", "$.timestamps.expires_at", "Expiry must follow activation or cutoff."));
  }

  const author = obj(payload.author);
  if (!hasText(author.creator_ref)) {
    errors.push(issue("CREATOR_REF", "$.author.creator_ref", "creator_ref is required."));
  }
  if (!["human", "ai", "hybrid"].includes(author.author_type)) {
    errors.push(issue("AUTHOR_TYPE", "$.author.author_type", "Unsupported author type."));
  }

  const lineage = obj(payload.lineage);
  const sourceArtifacts = strings(lineage.source_artifact_refs);
  if (PUBLIC_STATES.has(state) && sourceArtifacts.length === 0) {
    errors.push(issue("SOURCE_LINEAGE_REQUIRED", "$.lineage.source_artifact_refs", "Ready declarations require source lineage."));
  }
  const previous = lineage.previous_revision_ref;
  const rootRef = lineage.root_thesis_ref;
  for (const [value, path] of [[previous, "$.lineage.previous_revision_ref"], [rootRef, "$.lineage.root_thesis_ref"]]) {
    if (!isNone(value) && (typeof value !== "string" || !THESIS_REF.test(value))) {
      errors.push(issue("THESIS_REF", path, "Invalid versioned thesis reference."));
    }
  }
  if (typeof revision === "number" && Number.isInteger(revision) && revision > 1 && !pyTruthy(previous)) {
    errors.push(issue("PREVIOUS_REVISION_REQUIRED", "$.lineage.previous_revision_ref", "Revision 2+ requires previous_revision_ref."));
  }
  if ((revision === 1 || revision === true) && !isNone(previous)) {
    errors.push(issue("FIRST_REVISION_PREVIOUS", "$.lineage.previous_revision_ref", "Revision 1 cannot have a previous revision."));
  }
  const storedHash = lineage.canonical_hash;
  if (state === "frozen") {
    if (typeof storedHash !== "string" || !HASH.test(storedHash)) {
      errors.push(issue("CANONICAL_HASH_REQUIRED", "$.lineage.canonical_hash", "Frozen declaration requires a SHA-256 canonical hash."));
    } else if (storedHash !== canonicalHash(payload)) {
      errors.push(issue("CANONICAL_HASH_MISMATCH", "$.lineage.canonical_hash", "Stored hash does not match the declaration."));
    }
  } else if (!isNone(storedHash)) {
    errors.push(issue("PREMATURE_CANONICAL_HASH", "$.lineage.canonical_hash", "Only frozen declarations carry a canonical hash."));
  }

  const market = obj(payload.market);
  for (const key of ["instrument_id", "display_name", "venue"]) {
    if (!hasText(market[key])) {
      errors.push(issue("MARKET_FIELD", `$.market.${key}`, `${key} is required.`));
    }
  }
  const direction = market.direction;
  const relationship = market.relationship;
  if (!DIRECTIONS.has(direction)) {
    errors.push(issue("DIRECTION", "$.market.direction", "Unsupported direction."));
  }
  if (!RELATIONSHIPS.has(relationship)) {
    errors.push(issue("RELATIONSHIP", "$.market.relationship", "Unsupported market relationship."));
  }
  if (relationship === "supported_proxy") {
    if (!hasText(market.projection_gate_ref)) {
      errors.push(issue("PROXY_GATE_REQUIRED", "$.market.projection_gate_ref", "Supported proxy requires a projection gate reference."));
    }
    if (!hasText(market.proxy_reason)) {
      errors.push(issue("PROXY_REASON_REQUIRED", "$.market.proxy_reason", "Supported proxy requires a causal bridge."));
    }
  }
  if (PUBLIC_STATES.has(state) && relationship === "watch_only" && ["long", "short"].includes(direction)) {
    errors.push(issue("WATCH_ONLY_DIRECTIONAL", "$.market.relationship", "A ready directional thesis cannot use a watch-only mapping."));
  }

  const claim = obj(payload.claim);
  for (const key of ["statement", "why_now", "horizon"]) {
    if (!hasText(claim[key])) {
      errors.push(issue("CLAIM_FIELD", `$.claim.${key}`, `${key} is required.`));
    }
  }
  if (!["low", "medium", "high"].includes(claim.confidence)) {
    errors.push(issue("CONFIDENCE", "$.claim.confidence", "Unsupported confidence."));
  }
  const probability = claim.probability;
  if (!isNone(probability) && (typeof probability !== "number" || !(probability >= 0 && probability <= 1))) {
    errors.push(issue("PROBABILITY", "$.claim.probability", "Probability must be between 0 and 1."));
  }
  if (!isNone(probability) && !hasText(claim.probability_basis)) {
    errors.push(issue("PROBABILITY_BASIS", "$.claim.probability_basis", "A probability requires a stated basis."));
  }

  let evidenceItems = payload.evidence_ledger;
  if (!Array.isArray(evidenceItems)) {
    errors.push(issue("EVIDENCE_TYPE", "$.evidence_ledger", "evidence_ledger must be an array."));
    evidenceItems = [];
  }
  const evidenceIds = new Set();
  const evidenceRoles = new Map();
  const evidenceClasses = new Map();
  evidenceItems.forEach((evidence, index) => {
    const path = `$.evidence_ledger[${index}]`;
    if (!isObject(evidence)) {
      errors.push(issue("EVIDENCE_ENTRY", path, "Evidence entry must be an object."));
      return;
    }
    const evidenceId = evidence.id;
    if (typeof evidenceId !== "string" || !EVIDENCE_ID.test(evidenceId)) {
      errors.push(issue("EVIDENCE_ID", `${path}.id`, "Invalid evidence ID."));
      return;
    }
    if (evidenceIds.has(evidenceId)) {
      errors.push(issue("DUPLICATE_EVIDENCE_ID", `${path}.id`, "Evidence IDs must be unique."));
    }
    evidenceIds.add(evidenceId);
    const evidenceClass = evidence.evidence_class;
    const role = evidence.role;
    evidenceClasses.set(evidenceId, typeof evidenceClass === "string" ? evidenceClass : "");
    evidenceRoles.set(evidenceId, typeof role === "string" ? role : "");
    if (!EVIDENCE_CLASSES.has(evidenceClass)) {
      errors.push(issue("EVIDENCE_CLASS", `${path}.evidence_class`, "Unsupported evidence class."));
    }
    if (!EVIDENCE_ROLES.has(role)) {
      errors.push(issue("EVIDENCE_ROLE", `${path}.role`, "Unsupported evidence role."));
    }
    if (!hasText(evidence.claim)) {
      errors.push(issue("EVIDENCE_CLAIM", `${path}.claim`, "Evidence claim is required."));
    }
    const evidenceTime = parseTime(evidence.as_of, `${path}.as_of`, errors, false);
    if (["source", "verified_live"].includes(evidenceClass)) {
      if (!hasText(evidence.source_ref)) {
        errors.push(issue("EVIDENCE_SOURCE_REQUIRED", `${path}.source_ref`, "Sourced evidence requires source_ref."));
      }
      if (evidenceTime === null) {
        errors.push(issue("EVIDENCE_TIME_REQUIRED", `${path}.as_of`, "Sourced evidence requires as_of."));
      }
    }
    if (evidence.freshness === "current" && evidenceTime === null) {
      errors.push(issue("CURRENT_EVIDENCE_TIME", `${path}.as_of`, "Current evidence requires as_of."));
    }
    if (evidenceTime && cutoff && cmpTime(evidenceTime, cutoff) > 0) {
      errors.push(issue("EVIDENCE_AFTER_CUTOFF", `${path}.as_of`, "Evidence observed after the decision cutoff cannot support this declaration."));
    }
  });

  const ideaProvenance = payload.idea_provenance;
  if (!isNone(ideaProvenance)) {
    const provenance = obj(ideaProvenance);
    const mode = provenance.mode;
    if (!IDEA_MODES.has(mode)) {
      errors.push(issue("IDEA_MODE", "$.idea_provenance.mode", "Unsupported idea provenance mode."));
    }
    if (!IDEA_DELTAS.has(provenance.idea_delta)) {
      errors.push(issue("IDEA_DELTA", "$.idea_provenance.idea_delta", "Unsupported idea delta."));
    }
    for (const key of ["creator_decision", "final_trade_idea"]) {
      if (!hasText(provenance[key])) {
        errors.push(issue("IDEA_PROVENANCE_FIELD", `$.idea_provenance.${key}`, `${key} is required.`));
      }
    }
    let contributions = provenance.cuebook_contributions;
    if (!Array.isArray(contributions)) {
      errors.push(issue("IDEA_CONTRIBUTIONS_TYPE", "$.idea_provenance.cuebook_contributions", "Cuebook contributions must be an array."));
      contributions = [];
    }
    if (mode === "cuebook_assisted") {
      if (!hasText(provenance.creator_seed)) {
        errors.push(issue("CREATOR_SEED_REQUIRED", "$.idea_provenance.creator_seed", "Cuebook-assisted mode requires the creator's actual seed idea."));
      }
      if (contributions.length === 0) {
        errors.push(issue("CUEBOOK_CONTRIBUTION_REQUIRED", "$.idea_provenance.cuebook_contributions", "Cuebook-assisted mode requires at least one attributable contribution."));
      }
    }
    if (mode === "creator_led" && contributions.length > 0) {
      errors.push(issue("CREATOR_LED_CONTRIBUTION", "$.idea_provenance.cuebook_contributions", "Creator-led mode cannot attribute contributions to Cuebook."));
    }
    if (provenance.public_attribution === true && mode !== "cuebook_assisted") {
      errors.push(issue("PUBLIC_ATTRIBUTION_MODE", "$.idea_provenance.public_attribution", "Public Cuebook attribution requires cuebook_assisted mode."));
    }
    contributions.forEach((contribution, index) => {
      const path = `$.idea_provenance.cuebook_contributions[${index}]`;
      if (!isObject(contribution)) {
        errors.push(issue("IDEA_CONTRIBUTION_TYPE", path, "Contribution must be an object."));
        return;
      }
      if (!CONTRIBUTION_KINDS.has(contribution.kind)) {
        errors.push(issue("IDEA_CONTRIBUTION_KIND", `${path}.kind`, "Unsupported Cuebook contribution kind."));
      }
      if (!hasText(contribution.summary)) {
        errors.push(issue("IDEA_CONTRIBUTION_SUMMARY", `${path}.summary`, "Contribution summary is required."));
      }
      addBadRefs(errors, contribution.evidence_refs, evidenceIds, `${path}.evidence_refs`, "UNKNOWN_IDEA_EVIDENCE_REF");
    });
  }

  const reasoning = obj(payload.reasoning);
  const supportRefs = reasoning.supporting_evidence_refs;
  const challengeRefs = reasoning.counterevidence_refs;
  addBadRefs(errors, supportRefs, evidenceIds, "$.reasoning.supporting_evidence_refs", "UNKNOWN_SUPPORT_REF");
  addBadRefs(errors, challengeRefs, evidenceIds, "$.reasoning.counterevidence_refs", "UNKNOWN_COUNTER_REF");
  for (const ref of strings(supportRefs)) {
    if (evidenceRoles.get(ref) !== "supports") {
      errors.push(issue("SUPPORT_ROLE_MISMATCH", "$.reasoning.supporting_evidence_refs", `${ref} is not supporting evidence.`));
    }
  }
  for (const ref of strings(challengeRefs)) {
    if (evidenceRoles.get(ref) !== "challenges") {
      errors.push(issue("COUNTER_ROLE_MISMATCH", "$.reasoning.counterevidence_refs", `${ref} is not challenging evidence.`));
    }
  }

  let mechanisms = reasoning.mechanisms;
  if (!Array.isArray(mechanisms)) {
    errors.push(issue("MECHANISMS_TYPE", "$.reasoning.mechanisms", "mechanisms must be an array."));
    mechanisms = [];
  }
  const mechanismSteps = new Set();
  mechanisms.forEach((mechanism, index) => {
    const path = `$.reasoning.mechanisms[${index}]`;
    if (!isObject(mechanism)) {
      errors.push(issue("MECHANISM_ENTRY", path, "Mechanism must be an object."));
      return;
    }
    const step = mechanism.step;
    if (typeof step !== "number" || !Number.isInteger(step) || step < 1 || mechanismSteps.has(step)) {
      errors.push(issue("MECHANISM_STEP", `${path}.step`, "Mechanism steps must be unique positive integers."));
    }
    mechanismSteps.add(step);
    addBadRefs(errors, mechanism.evidence_refs, evidenceIds, `${path}.evidence_refs`, "UNKNOWN_MECHANISM_REF");
  });

  let scenarios = reasoning.scenarios;
  if (!Array.isArray(scenarios)) {
    errors.push(issue("SCENARIOS_TYPE", "$.reasoning.scenarios", "scenarios must be an array."));
    scenarios = [];
  }
  const scenarioIds = new Set();
  scenarios.forEach((scenario, index) => {
    const path = `$.reasoning.scenarios[${index}]`;
    if (!isObject(scenario)) {
      errors.push(issue("SCENARIO_ENTRY", path, "Scenario must be an object."));
      return;
    }
    const scenarioId = scenario.id;
    if (typeof scenarioId !== "string" || !SCENARIO_ID.test(scenarioId) || scenarioIds.has(scenarioId)) {
      errors.push(issue("SCENARIO_ID", `${path}.id`, "Scenario IDs must be unique and use SC<number>."));
    }
    scenarioIds.add(typeof scenarioId === "string" ? scenarioId : String(scenarioId));
    addBadRefs(errors, scenario.evidence_refs, evidenceIds, `${path}.evidence_refs`, "UNKNOWN_SCENARIO_REF");
  });

  const setup = obj(payload.setup);
  const observation = obj(setup.reference_observation);
  const observationTime = parseTime(observation.observed_at, "$.setup.reference_observation.observed_at", errors, false);
  if (observationTime && cutoff && cmpTime(observationTime, cutoff) > 0) {
    errors.push(issue("OBSERVATION_AFTER_CUTOFF", "$.setup.reference_observation.observed_at", "Reference observation follows the decision cutoff."));
  }
  if (PUBLIC_STATES.has(state) && (isNone(observation.value) || !observationTime || !hasText(observation.source_ref))) {
    errors.push(issue("REFERENCE_OBSERVATION_REQUIRED", "$.setup.reference_observation", "Ready declarations require a sourced, timestamped reference observation."));
  }
  if (!REFERENCE_BASES.has(observation.observation_basis)) {
    errors.push(issue("REFERENCE_OBSERVATION_BASIS", "$.setup.reference_observation.observation_basis", "Reference observation must preserve its quote type."));
  }
  if (!MARKET_STATES.has(observation.market_state)) {
    errors.push(issue("REFERENCE_MARKET_STATE", "$.setup.reference_observation.market_state", "Reference observation must preserve the market state."));
  }
  const actionState = setup.action_state;
  if (!ACTION_STATES.has(actionState)) {
    errors.push(issue("ACTION_STATE", "$.setup.action_state", "Unsupported action state."));
  }
  const triggerCondition = hasText(setup.trigger_condition);
  if (actionState === "wait_for_trigger" && !triggerCondition) {
    errors.push(issue("TRIGGER_REQUIRED", "$.setup.trigger_condition", "wait_for_trigger requires an explicit trigger condition."));
  }
  if (actionState === "wait_for_trigger" && PUBLIC_STATES.has(state)) {
    errors.push(issue("CONDITIONAL_NOT_ACTIVATED", "$.lifecycle_state", "A thesis waiting for a trigger remains conditional until a lifecycle event activates it."));
  }
  if (["observe_only", "avoid"].includes(actionState) && PUBLIC_STATES.has(state) && ["long", "short"].includes(direction)) {
    errors.push(issue("ACTION_DIRECTION_CONFLICT", "$.setup.action_state", "Observe-only or avoid intent cannot be published as an active directional call."));
  }
  if (!hasText(setup.entry_condition)) {
    errors.push(issue("ENTRY_CONDITION", "$.setup.entry_condition", "A conditional setup description is required."));
  }
  if (!hasText(setup.invalidation)) {
    errors.push(issue("INVALIDATION", "$.setup.invalidation", "A falsifier is required."));
  }
  array(setup.catalysts).forEach((catalyst, index) => {
    if (isObject(catalyst)) {
      addBadRefs(errors, catalyst.evidence_refs, evidenceIds, `$.setup.catalysts[${index}].evidence_refs`, "UNKNOWN_CATALYST_REF");
    }
  });

  const resolution = obj(payload.resolution);
  const resolutionStatus = resolution.status;
  if (!["complete", "incomplete", "not_applicable"].includes(resolutionStatus)) {
    errors.push(issue("RESOLUTION_STATUS", "$.resolution.status", "Unsupported resolution status."));
  }
  const windowStart = parseTime(resolution.window_start, "$.resolution.window_start", errors, false);
  const windowEnd = parseTime(resolution.window_end, "$.resolution.window_end", errors, false);
  const scoreModes = new Set(strings(resolution.score_modes));
  if ([...scoreModes].some((mode) => !SCORE_MODES.has(mode))) {
    errors.push(issue("SCORE_MODE", "$.resolution.score_modes", "Unsupported score mode."));
  }
  if (resolutionStatus === "complete") {
    for (const key of ["evaluation_kind", "metric", "operator", "observation_basis", "data_source_ref", "timezone", "adjustments_policy"]) {
      const value = resolution[key];
      if (isNone(value) || value === "" || value === "none") {
        errors.push(issue("RESOLUTION_FIELD", `$.resolution.${key}`, `Complete resolution requires ${key}.`));
      }
    }
    if (!windowStart || !windowEnd) {
      errors.push(issue("RESOLUTION_WINDOW", "$.resolution", "Complete resolution requires start and end timestamps."));
    }
    if (scoreModes.size === 0) {
      errors.push(issue("RESOLUTION_SCORE_REQUIRED", "$.resolution.score_modes", "Complete resolution requires at least one score mode."));
    }
  } else if (PUBLIC_STATES.has(state)) {
    errors.push(issue("RESOLUTION_INCOMPLETE", "$.resolution.status", "Ready and frozen declarations require a complete resolution contract."));
  } else {
    warnings.push(issue("RESOLUTION_INCOMPLETE", "$.resolution.status", "Resolution contract is not complete."));
  }
  if (windowStart && cutoff && cmpTime(windowStart, cutoff) < 0) {
    errors.push(issue("RESOLUTION_BEFORE_CUTOFF", "$.resolution.window_start", "Resolution window cannot start before the decision cutoff."));
  }
  if (windowStart && windowEnd && cmpTime(windowEnd, windowStart) <= 0) {
    errors.push(issue("RESOLUTION_WINDOW_ORDER", "$.resolution.window_end", "Resolution window end must follow its start."));
  }

  const threshold = obj(resolution.threshold);
  const kind = resolution.evaluation_kind;
  const metric = resolution.metric;
  const operator = resolution.operator;
  const target = threshold.target_value;
  const lower = threshold.lower_bound;
  const upper = threshold.upper_bound;
  if (resolutionStatus === "complete") {
    if (kind === "price_target") {
      if (!["spot_price", "official_settlement_price"].includes(metric) || !["gt", "gte", "lt", "lte"].includes(operator) || typeof target !== "number") {
        errors.push(issue("PRICE_TARGET_CONTRACT", "$.resolution", "Price target needs a price metric, directional operator, and numeric target."));
      }
    } else if (kind === "directional_return") {
      if (metric !== "total_return_pct" || !["gt", "gte", "lt", "lte"].includes(operator) || typeof target !== "number") {
        errors.push(issue("DIRECTIONAL_RETURN_CONTRACT", "$.resolution", "Directional return needs total_return_pct and a numeric threshold."));
      }
    } else if (kind === "relative_performance") {
      if (metric !== "excess_return_pct" || !["gt", "gte", "lt", "lte"].includes(operator) || typeof target !== "number") {
        errors.push(issue("RELATIVE_CONTRACT", "$.resolution", "Relative performance needs excess_return_pct and a numeric threshold."));
      }
      if (!hasText(resolution.benchmark_ref)) {
        errors.push(issue("BENCHMARK_REQUIRED", "$.resolution.benchmark_ref", "Relative performance requires a benchmark."));
      }
    } else if (kind === "event_occurrence") {
      if (metric !== "event_status" || !["occurred", "not_occurred"].includes(operator)) {
        errors.push(issue("EVENT_CONTRACT", "$.resolution", "Event resolution requires event_status and an occurrence operator."));
      }
    } else if (kind === "range") {
      if (metric !== "range_value" || operator !== "between" || typeof lower !== "number" || typeof upper !== "number" || lower >= upper) {
        errors.push(issue("RANGE_CONTRACT", "$.resolution", "Range resolution requires ordered numeric bounds."));
      }
    } else {
      errors.push(issue("EVALUATION_KIND", "$.resolution.evaluation_kind", "Complete resolution needs a supported evaluation kind."));
    }
  }
  if (scoreModes.has("brier") && isNone(probability)) {
    errors.push(issue("BRIER_PROBABILITY_REQUIRED", "$.claim.probability", "Brier scoring requires a probability."));
  }
  if (scoreModes.has("excess_return") && kind !== "relative_performance") {
    errors.push(issue("EXCESS_RETURN_CONTRACT", "$.resolution.score_modes", "excess_return scoring requires relative_performance."));
  }
  if (resolution.ambiguity_policy === "fallback_source" && strings(resolution.fallback_source_refs).length === 0) {
    errors.push(issue("FALLBACK_SOURCE_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."));
  }
  if (["price_target", "directional_return", "relative_performance"].includes(kind)) {
    if (direction === "long" && ["lt", "lte"].includes(operator)) {
      errors.push(issue("DIRECTION_RESOLUTION_CONFLICT", "$.resolution.operator", "Long direction conflicts with a downside pass operator."));
    }
    if (direction === "short" && ["gt", "gte"].includes(operator)) {
      errors.push(issue("DIRECTION_RESOLUTION_CONFLICT", "$.resolution.operator", "Short direction conflicts with an upside pass operator."));
    }
  }

  if (PUBLIC_STATES.has(state) && ["long", "short"].includes(direction)) {
    const sourcedSupport = strings(supportRefs).filter((ref) => ["source", "verified_live"].includes(evidenceClasses.get(ref)));
    if (sourcedSupport.length === 0) {
      errors.push(issue("SOURCED_SUPPORT_REQUIRED", "$.reasoning.supporting_evidence_refs", "Directional thesis requires sourced supporting evidence."));
    }
    if (strings(challengeRefs).length === 0) {
      errors.push(issue("COUNTEREVIDENCE_REQUIRED", "$.reasoning.counterevidence_refs", "Directional thesis requires challenging evidence."));
    }
    if (scenarios.length < 2) {
      errors.push(issue("SCENARIOS_REQUIRED", "$.reasoning.scenarios", "Directional thesis requires at least two scenarios."));
    }
    if (mechanisms.length === 0) {
      errors.push(issue("MECHANISM_REQUIRED", "$.reasoning.mechanisms", "Directional thesis requires a mechanism."));
    }
  }

  const disclosure = obj(payload.disclosure);
  if (disclosure.visibility === "public" && PUBLIC_STATES.has(state)) {
    for (const key of ["position_status", "commercial_status", "identity_status", "ai_assistance_status"]) {
      if (isNone(disclosure[key]) || disclosure[key] === "unknown") {
        errors.push(issue("PUBLIC_DISCLOSURE_REQUIRED", `$.disclosure.${key}`, "Public declaration requires a known disclosure state."));
      }
    }
    if (["ai", "hybrid"].includes(author.author_type) && !["assisted", "generated"].includes(disclosure.ai_assistance_status)) {
      errors.push(issue("AI_DISCLOSURE_REQUIRED", "$.disclosure.ai_assistance_status", "AI or hybrid authorship must be disclosed."));
    }
    if (author.author_type === "ai" && disclosure.identity_status !== "ai_identity") {
      errors.push(issue("AI_IDENTITY_REQUIRED", "$.disclosure.identity_status", "AI author requires an AI identity disclosure."));
    }
  }

  for (const [textPath, textValue] of walkText(payload)) {
    if (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(textValue))) {
      errors.push(issue("EXECUTION_INSTRUCTION", textPath, "Thesis contains an order, leverage, sizing, or credential instruction."));
      break;
    }
  }

  const quality = obj(payload.quality_report);
  const counts = obj(quality.counts);
  const expectedCounts = {
    evidence: evidenceItems.length,
    supporting: strings(supportRefs).length,
    challenging: strings(challengeRefs).length,
    mechanisms: mechanisms.length,
    scenarios: scenarios.length,
  };
  const expectedKeys = Object.keys(expectedCounts);
  const countsEqual =
    Object.keys(counts).length === expectedKeys.length &&
    expectedKeys.every((key) => {
      if (!Object.hasOwn(counts, key)) return false;
      const value = counts[key];
      if (typeof value === "number") return value === expectedCounts[key];
      if (typeof value === "boolean") return (value ? 1 : 0) === expectedCounts[key];
      return false;
    });
  if (!countsEqual) {
    const rendered = expectedKeys.map((key) => `'${key}': ${expectedCounts[key]}`).join(", ");
    errors.push(issue("QUALITY_COUNTS", "$.quality_report.counts", `Expected counts {${rendered}}.`));
  }
  const structuralErrorCount = errors.length;
  const expectedDecision = structuralErrorCount
    ? "blocked"
    : ["draft", "conditional"].includes(state) || warnings.length
      ? "conditional"
      : "ready";
  if (quality.decision !== expectedDecision) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", `Expected ${expectedDecision}.`));
  }
  if (PUBLIC_STATES.has(state) && errors.length === 0) {
    for (const key of ["evidence_decision", "resolution_decision", "publication_decision"]) {
      if (quality[key] !== "ready") {
        errors.push(issue("QUALITY_SUBDECISION", `$.quality_report.${key}`, "Ready declaration requires ready subdecisions."));
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function usageError(message) {
  process.stderr.write("usage: validate_trading_thesis.mjs [-h] [--print-canonical-hash] json_file\n");
  process.stderr.write(`validate_trading_thesis.mjs: error: ${message}\n`);
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  let printCanonicalHash = false;
  const positionals = [];
  let positionalOnly = false;
  for (const arg of argv) {
    if (!positionalOnly && arg === "--") positionalOnly = true;
    else if (!positionalOnly && arg === "--print-canonical-hash") printCanonicalHash = true;
    else if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write("usage: validate_trading_thesis.mjs [-h] [--print-canonical-hash] json_file\n");
      process.exit(0);
    } else if (!positionalOnly && arg.length > 1 && arg.startsWith("-")) {
      usageError(`unrecognized arguments: ${arg}`);
    } else positionals.push(arg);
  }
  if (positionals.length < 1) usageError("the following arguments are required: json_file");
  if (positionals.length > 1) usageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
  const payload = JSON.parse(readFileSync(positionals[0], "utf-8"));
  if (printCanonicalHash) {
    if (!isObject(payload)) {
      process.stderr.write("TradingThesisV1 must be an object.\n");
      process.exit(1);
    }
    process.stdout.write(canonicalHash(payload) + "\n");
    return;
  }
  const result = validate(payload);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
