#!/usr/bin/env node
// Validate deterministic PostV1 publication invariants.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = new Set(["schema_version", "lineage", "brief", "gate", "research_decision", "policy_gate", "disclosure_state", "route", "fact_ledger", "angle", "drafts", "draft_evidence", "watch_items", "quality_report", "publication_state"]);
const OPTIONAL = new Set(["assisted_discovery"]);
const PLATFORMS = new Set(["frame"]);
const RESEARCH_DECISIONS = new Set(["ready", "conditional", "blocked", null]);
const EVIDENCE_CLASSES = new Set(["source", "verified-live", "derived", "hypothesis"]);
const FRESHNESS = new Set(["current", "stale", "unknown"]);
const CONTENT_CLASSES = new Set(["market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice"]);
const TEMPORAL_MODES = new Set(["realtime", "historical_replay", "evergreen"]);
const STATE_RANK = { ready: 0, conditional: 1, blocked: 2 };
const BANNED_PUBLIC_PHRASES = ["值得关注的是", "从机制上看", "核心逻辑在于", "传导路径", "验证路径"];
const INTERNAL_MARKERS = ["SOURCE_ASSET_MISMATCH", "PROXY_BRIDGE_MISSING", "projection-rejected", "gate-v1", "post-v1"];
const CONDITIONAL_MARKERS_ZH = ["如果", "要是", "除非", "仍需", "还要看", "取决于", "一旦", "能否", "是否", "待确认", "可能", "观察"];
const CONDITIONAL_MARKERS_EN = /\b(if|unless|may|might|could|depends?|watch|conditional|needs? confirmation)\b/i;
const HISTORICAL_MARKERS = ["历史", "复盘", "截至", "当时", "historical", "replay", "as of"];
const SELF_CORRECTION_PHRASES = ["认错", "哪里看错", "什么情况算看错", "错了怎么办"];
const CUEBOOK_WORKFLOW_PATTERNS = [
  /cuebook.{0,40}(?:帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色|写(?:出|成)?|建议|让我|给我|替我|完成)/i,
  /(?:放进|用|通过|经过|借助|帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色).{0,40}cuebook/i,
  /\bcuebook\b.{0,48}\b(?:helped?|completed?|improved?|inspired?|generated?|drafted?|rewrote|suggested?)\b/i,
  /\b(?:used?|put|through|with)\b.{0,48}\bcuebook\b/i,
];
const ACTION_PATTERNS = [
  /(?:^|[。！!?；;\n])\s*(?:买|买入|卖|卖出|做多|做空|开仓|平仓)\s*\d+(?:\.\d+)?\s*(?:股|手|张|枚|份|个)/i,
  /(?:建议|你可以|你应当|你应该|直接|现在|立刻|马上|请).{0,16}(?:买入|卖出|做多|做空|开仓|平仓|仓位|杠杆|止损|止盈)/i,
  /(?:^|[.!?;\n])\s*(?:buy|sell|short|go long)\s+\d+(?:\.\d+)?\s*(?:shares?|contracts?|lots?)/i,
  /\b(?:you should|i recommend|right now).{0,24}\b(?:buy|sell|short|go long|position size|leverage|stop[- ]?loss)\b/i,
  /(?:助记词|私钥|API\s*secret|secret\s*key|seed\s*phrase)/i,
];
const THESIS_REF = /^THESIS_[a-z0-9]{8,64}@r[1-9][0-9]*$/;
const EXPRESSION_REF = /^CEXP_[A-Za-z0-9_:-]{8,}@r[1-9][0-9]*$/;
const CANONICAL_HASH = /^sha256:[a-f0-9]{64}$/;

function isDict(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}
function strOrEmpty(value) { return pyTruthy(value) ? String(value) : ""; }

export function issue(code, path, message) { return { code, path, message }; }

export function nonemptyDrafts(value) {
  if (!isDict(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === "string" && text.trim()).map(([key, text]) => [key, text.trim()]));
}

export function hasConditionalMarker(text) {
  return CONDITIONAL_MARKERS_ZH.some((marker) => text.includes(marker)) || CONDITIONAL_MARKERS_EN.test(text);
}

export function containsCuebookWorkflowNarration(text) { return CUEBOOK_WORKFLOW_PATTERNS.some((pattern) => pattern.test(text)); }

export function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let candidate = value.trim();
  if (candidate.endsWith("Z")) candidate = `${candidate.slice(0, -1)}+00:00`;
  if (!/(?:[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:\.\d{1,6})?)?)$/.test(candidate)) candidate += "Z";
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

export function validate(item) {
  const errors = [];
  const warnings = [];
  if (!isDict(item)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "PostV1 must be an object.")], warnings: [] };

  for (const key of [...REQUIRED].filter((candidate) => !(candidate in item)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of Object.keys(item).filter((candidate) => !REQUIRED.has(candidate) && !OPTIONAL.has(candidate)).sort()) errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  if (item.schema_version !== "post-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected post-v1."));

  let lineage = item.lineage;
  if (!isDict(lineage)) { errors.push(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object.")); lineage = {}; }
  if (!strOrEmpty(lineage.artifact_id).startsWith("POST_")) errors.push(issue("ARTIFACT_ID", "$.lineage.artifact_id", "Post artifact ID must use POST_* prefix."));
  if (pyTruthy(lineage.program_ref) !== pyTruthy(lineage.content_item_ref)) errors.push(issue("PROGRAM_ITEM_LINEAGE", "$.lineage", "program_ref and content_item_ref must be set together."));
  for (const key of ["opportunity_refs", "input_artifact_refs"]) {
    const value = lineage[key];
    if (!Array.isArray(value) || value.length !== new Set(value ?? []).size) errors.push(issue("LINEAGE_REFS", `$.lineage.${key}`, `${key} must be a unique array.`));
  }
  const inputRefs = Array.isArray(lineage.input_artifact_refs) ? lineage.input_artifact_refs : [];
  const thesisRefs = inputRefs.filter((ref) => typeof ref === "string" && THESIS_REF.test(ref));
  const thesisBinding = lineage.thesis_binding;
  if (thesisRefs.length > 0 && !isDict(thesisBinding)) errors.push(issue("THESIS_BINDING_REQUIRED", "$.lineage.thesis_binding", "A thesis-derived post requires its versioned ref and canonical hash."));
  if (thesisBinding !== null && thesisBinding !== undefined) {
    if (!isDict(thesisBinding)) errors.push(issue("THESIS_BINDING_TYPE", "$.lineage.thesis_binding", "thesis_binding must be an object or null."));
    else {
      const boundRef = thesisBinding.thesis_ref;
      const boundHash = thesisBinding.canonical_hash;
      if (typeof boundRef !== "string" || !THESIS_REF.test(boundRef)) errors.push(issue("THESIS_REF", "$.lineage.thesis_binding.thesis_ref", "Invalid versioned thesis reference."));
      else if (!inputRefs.includes(boundRef)) errors.push(issue("THESIS_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound thesis must appear in input_artifact_refs."));
      if (typeof boundHash !== "string" || !CANONICAL_HASH.test(boundHash)) errors.push(issue("THESIS_HASH", "$.lineage.thesis_binding.canonical_hash", "Invalid thesis canonical hash."));
    }
  }
  const expressionRefs = inputRefs.filter((ref) => typeof ref === "string" && EXPRESSION_REF.test(ref));
  const expressionBinding = lineage.expression_binding;
  if (expressionRefs.length > 0 && !isDict(expressionBinding)) errors.push(issue("EXPRESSION_BINDING_REQUIRED", "$.lineage.expression_binding", "An expression-plan-derived post requires its versioned plan ref and locked meaning fingerprint."));
  if (expressionBinding !== null && expressionBinding !== undefined) {
    if (!isDict(expressionBinding)) errors.push(issue("EXPRESSION_BINDING_TYPE", "$.lineage.expression_binding", "expression_binding must be an object or null."));
    else {
      const planRef = expressionBinding.plan_ref;
      const fingerprint = expressionBinding.fingerprint_sha256;
      if (typeof planRef !== "string" || !EXPRESSION_REF.test(planRef)) errors.push(issue("EXPRESSION_REF", "$.lineage.expression_binding.plan_ref", "Invalid versioned expression-plan reference."));
      else if (!inputRefs.includes(planRef)) errors.push(issue("EXPRESSION_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound expression plan must appear in input_artifact_refs."));
      if (typeof fingerprint !== "string" || !CANONICAL_HASH.test(fingerprint)) errors.push(issue("EXPRESSION_FINGERPRINT", "$.lineage.expression_binding.fingerprint_sha256", "Invalid locked meaning fingerprint."));
    }
  }

  let brief = item.brief;
  if (!isDict(brief)) { errors.push(issue("BRIEF_TYPE", "$.brief", "brief must be an object.")); brief = {}; }
  const platforms = brief.platforms;
  if (!Array.isArray(platforms) || platforms.length !== 1 || platforms[0] !== "frame") errors.push(issue("PLATFORMS", "$.brief.platforms", "PostV1 is Frame-only and requires platforms=[\"frame\"]."));
  const contentClass = brief.content_class;
  const temporalMode = brief.temporal_mode;
  if (!CONTENT_CLASSES.has(contentClass)) errors.push(issue("CONTENT_CLASS", "$.brief.content_class", "Unsupported content class."));
  if (!TEMPORAL_MODES.has(temporalMode)) errors.push(issue("TEMPORAL_MODE", "$.brief.temporal_mode", "Unsupported temporal mode."));

  let gate = item.gate;
  if (!isDict(gate)) { errors.push(issue("GATE_TYPE", "$.gate", "gate must be an object.")); gate = {}; }
  const decision = gate.decision;
  if (!["pass", "caution", "reject"].includes(decision)) errors.push(issue("GATE_DECISION", "$.gate.decision", "Expected pass, caution, or reject."));

  const researchDecision = item.research_decision ?? null;
  if (!RESEARCH_DECISIONS.has(researchDecision)) errors.push(issue("RESEARCH_DECISION", "$.research_decision", "Expected ready, conditional, blocked, or null."));
  const researchPackRef = strOrEmpty(brief.research_pack_ref).trim();
  if (researchPackRef && (researchDecision === null || researchDecision === undefined)) errors.push(issue("RESEARCH_DECISION_REQUIRED", "$.research_decision", "A referenced research pack requires its quality decision."));
  if (researchDecision !== null && researchDecision !== undefined && !researchPackRef) errors.push(issue("RESEARCH_REFERENCE_REQUIRED", "$.brief.research_pack_ref", "A research decision requires a stable pack reference or digest."));

  let route = item.route;
  let routeAbstain = false;
  const requiredRoute = new Set(["schema_version", "taxonomy_version", "cue_id", "event_type", "event_confidence", "candidates", "reasoning_lenses", "render_shape", "required_context", "hard_numbers", "abstain", "abstain_reason"]);
  if (!isDict(route)) { errors.push(issue("ROUTE_TYPE", "$.route", "route must be a complete RouteV1 object.")); route = {}; }
  for (const key of [...requiredRoute].filter((candidate) => !(candidate in route)).sort()) errors.push(issue("ROUTE_FIELD", `$.route.${key}`, "Complete RouteV1 field is required."));
  if (route.schema_version !== "route-v1" || route.taxonomy_version !== "market-narrative-v2") errors.push(issue("ROUTE_VERSION", "$.route", "Embedded route must be route-v1 / market-narrative-v2."));
  const confidence = route.event_confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push(issue("ROUTE_CONFIDENCE", "$.route.event_confidence", "Route confidence must be between 0 and 1."));
  for (const key of ["candidates", "reasoning_lenses", "required_context", "hard_numbers"]) if (!Array.isArray(route[key])) errors.push(issue("ROUTE_ARRAY", `$.route.${key}`, `${key} must be an array.`));
  routeAbstain = route.abstain === true;
  if (typeof route.abstain !== "boolean") errors.push(issue("ROUTE_ABSTAIN_TYPE", "$.route.abstain", "abstain must be boolean."));
  if (routeAbstain && !strOrEmpty(route.abstain_reason).trim()) errors.push(issue("ROUTE_ABSTAIN_REASON", "$.route.abstain_reason", "Abstention requires a reason."));
  if (route.event_type === "unknown" && !routeAbstain) errors.push(issue("ROUTE_UNKNOWN_NOT_ABSTAIN", "$.route", "Unknown event type must abstain."));

  let policy = item.policy_gate;
  if (!isDict(policy)) { errors.push(issue("POLICY_TYPE", "$.policy_gate", "policy_gate must be an object.")); policy = {}; }
  const policyDecision = policy.decision;
  if (!(policyDecision in STATE_RANK)) errors.push(issue("POLICY_DECISION", "$.policy_gate.decision", "Expected ready, conditional, or blocked."));
  if (!Array.isArray(policy.rules_checked) || !Array.isArray(policy.repairs)) errors.push(issue("POLICY_FIELDS", "$.policy_gate", "rules_checked and repairs must be arrays."));

  let disclosure = item.disclosure_state;
  if (!isDict(disclosure)) { errors.push(issue("DISCLOSURE_TYPE", "$.disclosure_state", "disclosure_state must be an object.")); disclosure = {}; }
  if (!["declared", "no_position", "unknown", "not_required"].includes(disclosure.position_status)) errors.push(issue("POSITION_STATUS", "$.disclosure_state.position_status", "Unsupported position state."));
  if (!["declared", "none", "unknown", "not_required"].includes(disclosure.commercial_status)) errors.push(issue("COMMERCIAL_STATUS", "$.disclosure_state.commercial_status", "Unsupported commercial state."));
  if (!["verified", "declared", "unknown", "not_required"].includes(disclosure.identity_status)) errors.push(issue("IDENTITY_STATUS", "$.disclosure_state.identity_status", "Unsupported identity state."));
  if (!["disclosed", "not_disclosed", "unknown", "not_required"].includes(disclosure.ai_assistance_status)) errors.push(issue("AI_ASSISTANCE_STATUS", "$.disclosure_state.ai_assistance_status", "Unsupported AI-assistance state."));
  if (!Array.isArray(disclosure.public_disclosures)) errors.push(issue("PUBLIC_DISCLOSURES", "$.disclosure_state.public_disclosures", "public_disclosures must be an array."));

  const checkedAt = parseTime(policy.checked_at);
  const briefAsOf = parseTime(brief.as_of);
  if (policyDecision === "ready") {
    if (checkedAt === null || briefAsOf === null) errors.push(issue("POLICY_TIME", "$.policy_gate.checked_at", "Ready policy requires parseable checked_at and brief.as_of."));
    else if (briefAsOf - checkedAt > 30 * 86400 * 1000) errors.push(issue("POLICY_STALE", "$.policy_gate.checked_at", "Policy older than 30 days cannot support ready publication."));
  }

  let drafts = item.drafts;
  if (!isDict(drafts) || Object.keys(drafts).length !== PLATFORMS.size || [...PLATFORMS].some((platform) => !(platform in drafts))) { errors.push(issue("DRAFT_FIELDS", "$.drafts", "PostV1 must contain exactly one Frame draft field.")); drafts = isDict(drafts) ? drafts : {}; }
  const liveDrafts = nonemptyDrafts(drafts);
  const state = item.publication_state;
  const gateState = { pass: "ready", caution: "conditional", reject: "blocked" }[decision];
  const routeState = routeAbstain ? "blocked" : null;
  const candidates = [gateState, researchDecision, routeState, policyDecision].filter((candidate) => candidate in STATE_RANK);
  const expectedState = candidates.length > 0 ? candidates.reduce((best, candidate) => STATE_RANK[candidate] > STATE_RANK[best] ? candidate : best) : null;
  if (expectedState && state !== expectedState) errors.push(issue("PUBLICATION_STATE", "$.publication_state", `Gate and research decisions require ${expectedState}.`));
  if (expectedState === "blocked" && Object.keys(liveDrafts).length > 0) errors.push(issue("BLOCKED_HAS_DRAFT", "$.drafts", "Blocked artifacts cannot contain public drafts."));
  if (["ready", "conditional"].includes(expectedState) && pyTruthy(platforms) && !platforms.some((platform) => platform in liveDrafts)) errors.push(issue("REQUESTED_DRAFT_MISSING", "$.drafts", "No requested platform has a draft."));
  if (contentClass === "personalized_advice" && (state !== "blocked" || Object.keys(liveDrafts).length > 0)) errors.push(issue("PERSONALIZED_ADVICE", "$.brief.content_class", "Personalized advice requires a blocked artifact with no drafts."));
  if (state === "ready") {
    if (disclosure.commercial_status === "unknown") errors.push(issue("COMMERCIAL_DISCLOSURE_UNKNOWN", "$.disclosure_state.commercial_status", "Ready finance content requires a known commercial relationship."));
    if (["market_commentary", "investment_analysis", "product_marketing"].includes(contentClass) && disclosure.position_status === "unknown") errors.push(issue("POSITION_DISCLOSURE_UNKNOWN", "$.disclosure_state.position_status", "Ready market content requires a known position state."));
  }

  let ledger = item.fact_ledger;
  if (!Array.isArray(ledger)) { errors.push(issue("LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array.")); ledger = []; }
  const seenIds = new Set();
  let currentFactCount = 0;
  ledger.forEach((fact, index) => {
    const path = `$.fact_ledger[${index}]`;
    if (!isDict(fact)) { errors.push(issue("FACT_TYPE", path, "Ledger item must be an object.")); return; }
    const factId = strOrEmpty(fact.id).trim();
    if (!factId) errors.push(issue("FACT_ID", `${path}.id`, "Fact ID is required."));
    else if (seenIds.has(factId)) errors.push(issue("DUPLICATE_FACT_ID", `${path}.id`, `Duplicate fact ID ${factId}.`));
    seenIds.add(factId);
    if (!strOrEmpty(fact.claim).trim()) errors.push(issue("FACT_CLAIM", `${path}.claim`, "Fact claim is required."));
    const evidenceClass = fact.evidence_class;
    if (!EVIDENCE_CLASSES.has(evidenceClass)) errors.push(issue("EVIDENCE_CLASS", `${path}.evidence_class`, "Unsupported evidence class."));
    const freshness = fact.freshness;
    if (!FRESHNESS.has(freshness)) errors.push(issue("FRESHNESS", `${path}.freshness`, "Unsupported freshness state."));
    else if (freshness === "current") currentFactCount += 1;
    if (evidenceClass === "verified-live" && !strOrEmpty(fact.source_url).trim()) errors.push(issue("LIVE_SOURCE", `${path}.source_url`, "Verified live facts require a source URL."));
    if ((evidenceClass === "verified-live" || freshness === "current") && !strOrEmpty(fact.as_of).trim()) errors.push(issue("LIVE_TIMESTAMP", `${path}.as_of`, "Current or verified live facts require as_of."));
  });

  let assisted = item.assisted_discovery;
  let assistedMode = null;
  let publicAttribution = false;
  if (assisted !== null && assisted !== undefined) {
    if (!isDict(assisted)) { errors.push(issue("ASSISTED_DISCOVERY_TYPE", "$.assisted_discovery", "assisted_discovery must be an object or null.")); assisted = {}; }
    assistedMode = assisted.mode;
    publicAttribution = assisted.public_attribution === true;
    if (!["none", "cuebook_assisted"].includes(assistedMode)) errors.push(issue("ASSISTED_DISCOVERY_MODE", "$.assisted_discovery.mode", "Unsupported assisted-discovery mode."));
    if (assistedMode === "cuebook_assisted") {
      for (const key of ["creator_seed", "cuebook_contribution", "creator_judgment", "final_trade_idea"]) if (!strOrEmpty(assisted[key]).trim()) errors.push(issue("ASSISTED_DISCOVERY_FIELD", `$.assisted_discovery.${key}`, `${key} is required in cuebook_assisted mode.`));
      if (!["unchanged", "strengthened", "weakened", "narrowed", "conditionalized", "reversed", "abandoned"].includes(assisted.idea_delta)) errors.push(issue("ASSISTED_IDEA_DELTA", "$.assisted_discovery.idea_delta", "cuebook_assisted mode requires a valid idea_delta."));
      const factRefs = assisted.fact_refs;
      if (!Array.isArray(factRefs) || factRefs.length === 0) errors.push(issue("ASSISTED_FACT_REFS", "$.assisted_discovery.fact_refs", "Cuebook contribution requires at least one supporting fact reference."));
      else if (factRefs.some((ref) => typeof ref !== "string" || !seenIds.has(ref))) errors.push(issue("ASSISTED_UNKNOWN_FACT", "$.assisted_discovery.fact_refs", "Cuebook contribution references an unknown fact."));
    }
    if (publicAttribution) errors.push(issue("PUBLIC_ASSISTANCE_ATTRIBUTION", "$.assisted_discovery.public_attribution", "Cuebook assistance provenance must remain internal."));
  }

  let draftEvidence = item.draft_evidence;
  if (!isDict(draftEvidence) || Object.keys(draftEvidence).length !== PLATFORMS.size || [...PLATFORMS].some((platform) => !(platform in draftEvidence))) { errors.push(issue("DRAFT_EVIDENCE_FIELDS", "$.draft_evidence", "PostV1 must contain exactly one Frame evidence field.")); draftEvidence = {}; }
  for (const platform of [...PLATFORMS].sort()) {
    const refs = draftEvidence[platform];
    const path = `$.draft_evidence.${platform}`;
    if (!Array.isArray(refs)) { errors.push(issue("DRAFT_EVIDENCE_TYPE", path, "Draft evidence must be an array of fact IDs.")); continue; }
    const validRefs = refs.filter((ref) => typeof ref === "string" && seenIds.has(ref));
    if (validRefs.length !== refs.length) errors.push(issue("UNKNOWN_DRAFT_FACT", path, "Draft evidence contains an unknown fact ID."));
    if (platform in liveDrafts && validRefs.length === 0) errors.push(issue("DRAFT_EVIDENCE_MISSING", path, "A non-empty draft requires at least one fact ID."));
    if (!(platform in liveDrafts) && validRefs.length > 0) warnings.push(issue("DRAFT_EVIDENCE_WITHOUT_DRAFT", path, "Empty draft retains evidence references."));
  }

  const angle = item.angle;
  if (!isDict(angle) || !Array.isArray(angle.profile_rule_ids)) errors.push(issue("PROFILE_RULE_IDS", "$.angle.profile_rule_ids", "profile_rule_ids must be an array."));

  const publicText = Object.values(liveDrafts).join("\n");
  if (containsCuebookWorkflowNarration(publicText)) errors.push(issue("PUBLIC_CUEBOOK_NARRATION", "$.drafts", "Public drafts must express the market view directly and keep Cuebook workflow narration internal."));
  const loweredPublicText = publicText.toLowerCase();
  for (const phrase of SELF_CORRECTION_PHRASES) if (loweredPublicText.includes(phrase.toLowerCase())) errors.push(issue("PUBLIC_SELF_CORRECTION_HEADING", "$.drafts", `Remove self-correction workflow language: ${phrase}`));
  if (temporalMode === "realtime" && ledger.length > 0 && currentFactCount === 0) errors.push(issue("REALTIME_WITHOUT_CURRENT_FACT", "$.brief.temporal_mode", "Realtime post requires at least one current fact."));
  if (temporalMode === "historical_replay" && !HISTORICAL_MARKERS.some((marker) => loweredPublicText.includes(marker.toLowerCase()))) errors.push(issue("HISTORICAL_LABEL", "$.drafts", "Historical replay must be visibly labeled."));
  for (const phrase of BANNED_PUBLIC_PHRASES) if (publicText.includes(phrase)) warnings.push(issue("AI_PHRASE", "$.drafts", `Review stock phrase: ${phrase}`));
  for (const marker of INTERNAL_MARKERS) if (publicText.includes(marker)) errors.push(issue("INTERNAL_MARKER", "$.drafts", `Internal marker leaked into public copy: ${marker}`));
  for (const [platform, draft] of Object.entries(liveDrafts)) {
    if (expectedState === "conditional" && !hasConditionalMarker(draft)) errors.push(issue("CONDITIONAL_WORDING", `$.drafts.${platform}`, "Conditional drafts must name uncertainty, a condition, or a confirmation check."));
    if (ACTION_PATTERNS.some((pattern) => pattern.test(draft))) errors.push(issue("ACTION_BOUNDARY", `$.drafts.${platform}`, "Draft crosses into personalized orders, sizing, leverage, or credential handling."));
  }
  if ((publicText.match(/不是.{0,30}而是/g) ?? []).length > 1) warnings.push(issue("REPEATED_CONTRAST", "$.drafts", "Repeated 不是...而是 framing reads formulaic."));

  const quality = item.quality_report;
  if (!isDict(quality) || !["scores", "hard_failures", "revisions"].every((key) => Object.hasOwn(quality, key))) errors.push(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."));
  else if (pyTruthy(quality.hard_failures) && state !== "blocked") errors.push(issue("HARD_FAILURE_STATE", "$.quality_report.hard_failures", "Hard failures require blocked state."));

  return { valid: errors.length === 0, errors, warnings };
}

async function readInput(path) {
  if (path) return readFileSync(path, "utf8");
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) { process.stdout.write("usage: validate_post_artifact.mjs [-h] [json_file]\n"); return 0; }
  if (argv.length > 1) { process.stderr.write("usage: validate_post_artifact.mjs [-h] [json_file]\n"); return 2; }
  const payload = JSON.parse(await readInput(argv[0]));
  const output = Array.isArray(payload) ? payload.map(validate) : validate(payload);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return (Array.isArray(output) ? output : [output]).every((result) => result.valid) ? 0 : 1;
}

const isMain = (() => { if (!process.argv[1]) return false; try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) process.exit(await main());
