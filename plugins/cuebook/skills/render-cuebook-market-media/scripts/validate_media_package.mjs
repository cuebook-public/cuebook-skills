#!/usr/bin/env node
// Validate deterministic MediaPackageV1 evidence, policy, rights, and timing invariants.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = new Set(["schema_version", "lineage", "brief", "gate", "research_decision", "policy_gate", "disclosure_state", "route", "fact_ledger", "angle", "asset_plan", "package", "watch_items", "quality_report", "publication_state"]);
const CHANNEL_FORMATS = {
  generic_long_form: new Set(["article_outline", "long_form_article"]), seeking_alpha: new Set(["article_outline"]),
  reddit: new Set(["community_post", "community_comment"]), xiaohongshu: new Set(["carousel_note"]), douyin: new Set(["short_video"]),
};
const CONTENT_CLASSES = new Set(["market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice"]);
const RESEARCH_DECISIONS = new Set(["ready", "conditional", "blocked", null]);
const EVIDENCE_CLASSES = new Set(["source", "verified-live", "derived", "hypothesis"]);
const FRESHNESS = new Set(["current", "stale", "unknown"]);
const STATE_RANK = { ready: 0, conditional: 1, blocked: 2 };
const BANNED_PUBLIC_PHRASES = ["It is worth noting that", "From a mechanism perspective", "The core logic is", "transmission path", "verification path", "\u503c\u5f97\u5173\u6ce8\u7684\u662f", "\u4ece\u673a\u5236\u4e0a\u770b", "\u6838\u5fc3\u903b\u8f91\u5728\u4e8e", "\u4f20\u5bfc\u8def\u5f84", "\u9a8c\u8bc1\u8def\u5f84"];
const INTERNAL_MARKERS = ["SOURCE_ASSET_MISMATCH", "PROXY_BRIDGE_MISSING", "projection-rejected", "gate-v1", "media-package.v1"];
const CONDITIONAL_MARKERS_ZH = ["\u5982\u679c", "\u8981\u662f", "\u9664\u975e", "\u4ecd\u9700", "\u8fd8\u8981\u770b", "\u53d6\u51b3\u4e8e", "\u4e00\u65e6", "\u80fd\u5426", "\u662f\u5426", "\u5f85\u786e\u8ba4", "\u53ef\u80fd", "\u89c2\u5bdf"];
const CONDITIONAL_MARKERS_EN = /\b(if|unless|may|might|could|depends?|watch|conditional|needs? confirmation)\b/i;
const HISTORICAL_MARKERS = ["\u5386\u53f2", "\u590d\u76d8", "\u622a\u81f3", "\u5f53\u65f6", "historical", "replay", "as of"];
const ACTION_PATTERNS = [
  /(?:\u5efa\u8bae|\u4f60\u53ef\u4ee5|\u4f60\u5e94\u5f53|\u4f60\u5e94\u8be5|\u76f4\u63a5|\u73b0\u5728|\u7acb\u523b|\u9a6c\u4e0a|\u8bf7).{0,20}(?:\u4e70\u5165|\u5356\u51fa|\u505a\u591a|\u505a\u7a7a|\u5f00\u4ed3|\u5e73\u4ed3|\u4ed3\u4f4d|\u6760\u6746|\u6b62\u635f|\u6b62\u76c8)/i,
  /(?:^|[\u3002\uff01!?\uff1b;\n])\s*(?:\u4e70|\u4e70\u5165|\u5356|\u5356\u51fa|\u505a\u591a|\u505a\u7a7a|\u5f00\u4ed3|\u5e73\u4ed3)\s*\d+(?:\.\d+)?\s*(?:\u80a1|\u624b|\u5f20|\u679a|\u4efd|\u4e2a)/i,
  /\b(?:you should|i recommend|right now).{0,28}\b(?:buy|sell|short|go long|position size|leverage|stop[- ]?loss)\b/i,
  /(?:\u52a9\u8bb0\u8bcd|\u79c1\u94a5|API\s*secret|secret\s*key|seed\s*phrase)/i,
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
function pyrepr(value) {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  if (value === true) return "True"; if (value === false) return "False"; return String(value);
}

export function issue(code, path, message) { return { code, path, message }; }
export function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let candidate = value.trim(); if (candidate.endsWith("Z")) candidate = `${candidate.slice(0, -1)}+00:00`;
  if (!/(?:[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:\.\d{1,6})?)?)$/.test(candidate)) candidate += "Z";
  const parsed = Date.parse(candidate); return Number.isNaN(parsed) ? null : parsed;
}
export function normalizeCommunity(value) { const text = strOrEmpty(value).trim().toLowerCase(); return text.startsWith("r/") ? text.slice(2) : text; }
export function hasConditionalMarker(text) { return CONDITIONAL_MARKERS_ZH.some((marker) => text.includes(marker)) || CONDITIONAL_MARKERS_EN.test(text); }
export function collectStrings(value) {
  const result = [];
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) for (const entry of value) result.push(...collectStrings(entry));
  else if (isDict(value)) for (const [key, entry] of Object.entries(value)) if (!["source_url", "source_links", "community_rules_url", "thread_url"].includes(key)) result.push(...collectStrings(entry));
  return result;
}
export function expectedState(gateDecision, researchDecision, policyDecision, routeAbstain = false) {
  const gateState = { pass: "ready", caution: "conditional", reject: "blocked" }[gateDecision];
  const routeState = routeAbstain ? "blocked" : null;
  const candidates = [gateState, researchDecision, policyDecision, routeState].filter((state) => state in STATE_RANK);
  return candidates.length ? candidates.reduce((best, state) => STATE_RANK[state] > STATE_RANK[best] ? state : best) : null;
}

export function validate(item) {
  const errors = []; const warnings = [];
  if (!isDict(item)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "MediaPackageV1 must be an object.")], warnings: [] };
  for (const key of [...REQUIRED].filter((candidate) => !(candidate in item)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  if (item.schema_version !== "media-package.v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected media-package.v1."));

  let lineage = item.lineage;
  if (!isDict(lineage)) { errors.push(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object.")); lineage = {}; }
  if (!strOrEmpty(lineage.artifact_id).startsWith("MEDIA_")) errors.push(issue("ARTIFACT_ID", "$.lineage.artifact_id", "Media artifact ID must use MEDIA_* prefix."));
  if (pyTruthy(lineage.program_ref) !== pyTruthy(lineage.content_item_ref)) errors.push(issue("PROGRAM_ITEM_LINEAGE", "$.lineage", "program_ref and content_item_ref must be set together."));
  for (const key of ["opportunity_refs", "input_artifact_refs"]) { const value = lineage[key]; if (!Array.isArray(value) || value.length !== new Set(value ?? []).size) errors.push(issue("LINEAGE_REFS", `$.lineage.${key}`, `${key} must be a unique array.`)); }
  const inputRefs = Array.isArray(lineage.input_artifact_refs) ? lineage.input_artifact_refs : [];
  const thesisRefs = inputRefs.filter((ref) => typeof ref === "string" && THESIS_REF.test(ref)); const thesisBinding = lineage.thesis_binding;
  if (thesisRefs.length && !isDict(thesisBinding)) errors.push(issue("THESIS_BINDING_REQUIRED", "$.lineage.thesis_binding", "A thesis-derived media package requires its versioned ref and canonical hash."));
  if (thesisBinding !== null && thesisBinding !== undefined) {
    if (!isDict(thesisBinding)) errors.push(issue("THESIS_BINDING_TYPE", "$.lineage.thesis_binding", "thesis_binding must be an object or null."));
    else {
      const boundRef = thesisBinding.thesis_ref; const boundHash = thesisBinding.canonical_hash;
      if (typeof boundRef !== "string" || !THESIS_REF.test(boundRef)) errors.push(issue("THESIS_REF", "$.lineage.thesis_binding.thesis_ref", "Invalid versioned thesis reference."));
      else if (!inputRefs.includes(boundRef)) errors.push(issue("THESIS_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound thesis must appear in input_artifact_refs."));
      if (typeof boundHash !== "string" || !CANONICAL_HASH.test(boundHash)) errors.push(issue("THESIS_HASH", "$.lineage.thesis_binding.canonical_hash", "Invalid thesis canonical hash."));
    }
  }
  const expressionRefs = inputRefs.filter((ref) => typeof ref === "string" && EXPRESSION_REF.test(ref)); const expressionBinding = lineage.expression_binding;
  if (expressionRefs.length && !isDict(expressionBinding)) errors.push(issue("EXPRESSION_BINDING_REQUIRED", "$.lineage.expression_binding", "An expression-plan-derived media package requires its versioned plan ref and locked meaning fingerprint."));
  if (expressionBinding !== null && expressionBinding !== undefined) {
    if (!isDict(expressionBinding)) errors.push(issue("EXPRESSION_BINDING_TYPE", "$.lineage.expression_binding", "expression_binding must be an object or null."));
    else {
      const planRef = expressionBinding.plan_ref; const fingerprint = expressionBinding.fingerprint_sha256;
      if (typeof planRef !== "string" || !EXPRESSION_REF.test(planRef)) errors.push(issue("EXPRESSION_REF", "$.lineage.expression_binding.plan_ref", "Invalid versioned expression-plan reference."));
      else if (!inputRefs.includes(planRef)) errors.push(issue("EXPRESSION_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound expression plan must appear in input_artifact_refs."));
      if (typeof fingerprint !== "string" || !CANONICAL_HASH.test(fingerprint)) errors.push(issue("EXPRESSION_FINGERPRINT", "$.lineage.expression_binding.fingerprint_sha256", "Invalid locked meaning fingerprint."));
    }
  }

  let brief = item.brief; if (!isDict(brief)) { errors.push(issue("BRIEF_TYPE", "$.brief", "brief must be an object.")); brief = {}; }
  const channel = brief.channel; const mediaFormat = brief.format; const deliveryMode = brief.delivery_mode; const contentClass = brief.content_class; const temporalMode = brief.temporal_mode; const qualification = brief.account_qualification;
  if (!(channel in CHANNEL_FORMATS)) errors.push(issue("CHANNEL", "$.brief.channel", "Unsupported channel."));
  else if (!CHANNEL_FORMATS[channel].has(mediaFormat)) errors.push(issue("CHANNEL_FORMAT", "$.brief.format", `${pyrepr(mediaFormat)} is not supported for ${channel}.`));
  if (!["internal_outline", "draft", "publish_ready"].includes(deliveryMode)) errors.push(issue("DELIVERY_MODE", "$.brief.delivery_mode", "Unsupported delivery mode."));
  if (!CONTENT_CLASSES.has(contentClass)) errors.push(issue("CONTENT_CLASS", "$.brief.content_class", "Unsupported content class."));
  if (!["realtime", "historical_replay", "evergreen"].includes(temporalMode)) errors.push(issue("TEMPORAL_MODE", "$.brief.temporal_mode", "Expected realtime, historical_replay, or evergreen."));
  if (!["verified", "declared", "unknown", "not_required"].includes(qualification)) errors.push(issue("QUALIFICATION", "$.brief.account_qualification", "Unsupported qualification state."));

  let packageValue = item.package; if (!isDict(packageValue)) { errors.push(issue("PACKAGE_TYPE", "$.package", "package must be an object.")); packageValue = {}; }
  const kind = packageValue.kind;
  if (!["blocked", "article_outline", "long_form_article", "community_post", "community_comment", "carousel_note", "short_video"].includes(kind)) errors.push(issue("PACKAGE_KIND", "$.package.kind", "Unsupported package kind."));
  if (kind !== "blocked" && pyTruthy(mediaFormat) && kind !== mediaFormat) errors.push(issue("FORMAT_KIND", "$.package.kind", "Package kind must match brief.format."));

  let gate = item.gate; if (!isDict(gate)) { errors.push(issue("GATE_TYPE", "$.gate", "gate must be an object.")); gate = {}; }
  const gateDecision = gate.decision; if (!["pass", "caution", "reject"].includes(gateDecision)) errors.push(issue("GATE_DECISION", "$.gate.decision", "Expected pass, caution, or reject."));
  const researchDecision = item.research_decision ?? null; const researchRef = strOrEmpty(brief.research_pack_ref).trim();
  if (!RESEARCH_DECISIONS.has(researchDecision)) errors.push(issue("RESEARCH_DECISION", "$.research_decision", "Expected ready, conditional, blocked, or null."));
  if (researchRef && researchDecision === null) errors.push(issue("RESEARCH_DECISION_REQUIRED", "$.research_decision", "A referenced research pack requires its quality decision."));
  if (researchDecision !== null && !researchRef) errors.push(issue("RESEARCH_REFERENCE_REQUIRED", "$.brief.research_pack_ref", "A research decision requires a stable pack reference."));

  let route = item.route; let routeAbstain = false; const requiredRoute = new Set(["schema_version", "taxonomy_version", "cue_id", "event_type", "event_confidence", "candidates", "reasoning_lenses", "render_shape", "required_context", "hard_numbers", "abstain", "abstain_reason"]);
  if (!isDict(route)) { errors.push(issue("ROUTE_TYPE", "$.route", "route must be a complete RouteV1 object.")); route = {}; }
  for (const key of [...requiredRoute].filter((candidate) => !(candidate in route)).sort()) errors.push(issue("ROUTE_FIELD", `$.route.${key}`, "Complete RouteV1 field is required."));
  if (route.schema_version !== "route-v1" || route.taxonomy_version !== "market-narrative-v2") errors.push(issue("ROUTE_VERSION", "$.route", "Embedded route must be route-v1 / market-narrative-v2."));
  const confidence = route.event_confidence; if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push(issue("ROUTE_CONFIDENCE", "$.route.event_confidence", "Route confidence must be between 0 and 1."));
  for (const key of ["candidates", "reasoning_lenses", "required_context", "hard_numbers"]) if (!Array.isArray(route[key])) errors.push(issue("ROUTE_ARRAY", `$.route.${key}`, `${key} must be an array.`));
  routeAbstain = route.abstain === true; if (typeof route.abstain !== "boolean") errors.push(issue("ROUTE_ABSTAIN_TYPE", "$.route.abstain", "abstain must be boolean."));
  if (routeAbstain && !strOrEmpty(route.abstain_reason).trim()) errors.push(issue("ROUTE_ABSTAIN_REASON", "$.route.abstain_reason", "Abstention requires a reason."));
  if (route.event_type === "unknown" && !routeAbstain) errors.push(issue("ROUTE_UNKNOWN_NOT_ABSTAIN", "$.route", "Unknown event type must abstain."));

  let policy = item.policy_gate; if (!isDict(policy)) { errors.push(issue("POLICY_TYPE", "$.policy_gate", "policy_gate must be an object.")); policy = {}; }
  const policyDecision = policy.decision; if (!(policyDecision in STATE_RANK)) errors.push(issue("POLICY_DECISION", "$.policy_gate.decision", "Expected ready, conditional, or blocked."));
  let rulesChecked = policy.rules_checked; if (!Array.isArray(rulesChecked)) { errors.push(issue("POLICY_RULES", "$.policy_gate.rules_checked", "rules_checked must be an array.")); rulesChecked = []; }
  const ruleById = new Map(rulesChecked.filter(isDict).map((rule) => [rule.rule_id, rule]));
  const state = item.publication_state; const expected = expectedState(gateDecision, researchDecision, policyDecision, routeAbstain);
  if (expected && state !== expected) errors.push(issue("PUBLICATION_STATE", "$.publication_state", `Gate, research, and policy decisions require ${expected}.`));

  const seekingAlphaOutline = channel === "seeking_alpha" && deliveryMode === "internal_outline" && kind === "article_outline";
  if (channel === "seeking_alpha") {
    if (!seekingAlphaOutline) errors.push(issue("SA_AI_BOUNDARY", "$.brief", "Seeking Alpha targets may only return an internal article outline."));
    if (policyDecision !== "blocked" || state !== "blocked") errors.push(issue("SA_PUBLICATION_BLOCK", "$.policy_gate.decision", "AI-assisted Seeking Alpha publication must remain blocked."));
    const saRule = ruleById.get("sa.ai-submission"); if (!isDict(saRule) || saRule.status !== "block") errors.push(issue("SA_POLICY_RULE", "$.policy_gate.rules_checked", "Record the Seeking Alpha AI submission block."));
  }
  if (contentClass === "personalized_advice" && (policyDecision !== "blocked" || state !== "blocked" || kind !== "blocked")) errors.push(issue("PERSONALIZED_ADVICE", "$.brief.content_class", "Personalized advice requires a blocked package."));
  if (["xiaohongshu", "douyin"].includes(channel) && ["investment_analysis", "product_marketing"].includes(contentClass) && qualification === "unknown" && policyDecision === "ready") errors.push(issue("QUALIFICATION_UNKNOWN", "$.policy_gate.decision", "Unknown finance qualification cannot produce ready professional analysis or marketing."));

  let disclosure = item.disclosure_state; if (!isDict(disclosure)) { errors.push(issue("DISCLOSURE_STATE", "$.disclosure_state", "disclosure_state must be an object.")); disclosure = {}; }
  const positionStatus = disclosure.position_status; const commercialStatus = disclosure.commercial_status; const identityStatus = disclosure.identity_status; const aiStatus = disclosure.ai_assistance_status; let publicDisclosures = disclosure.public_disclosures;
  if (!["declared", "no_position", "unknown", "not_required"].includes(positionStatus)) errors.push(issue("POSITION_STATUS", "$.disclosure_state.position_status", "Unsupported position disclosure state."));
  if (!["declared", "none", "unknown", "not_required"].includes(commercialStatus)) errors.push(issue("COMMERCIAL_STATUS", "$.disclosure_state.commercial_status", "Unsupported commercial disclosure state."));
  if (!["verified", "declared", "unknown", "not_required"].includes(identityStatus)) errors.push(issue("IDENTITY_STATUS", "$.disclosure_state.identity_status", "Unsupported identity disclosure state."));
  if (!["disclosed", "not_disclosed", "unknown", "not_required"].includes(aiStatus)) errors.push(issue("AI_ASSISTANCE_STATUS", "$.disclosure_state.ai_assistance_status", "Unsupported AI-assistance disclosure state."));
  if (!Array.isArray(publicDisclosures)) { errors.push(issue("PUBLIC_DISCLOSURES", "$.disclosure_state.public_disclosures", "public_disclosures must be an array.")); publicDisclosures = []; }
  if (state === "ready") {
    if (commercialStatus === "unknown") errors.push(issue("COMMERCIAL_DISCLOSURE_UNKNOWN", "$.disclosure_state.commercial_status", "Ready finance media requires a known commercial-relationship state."));
    if (["market_commentary", "investment_analysis", "product_marketing"].includes(contentClass) && positionStatus === "unknown") errors.push(issue("POSITION_DISCLOSURE_UNKNOWN", "$.disclosure_state.position_status", "Ready commentary, analysis, or marketing requires a known position state."));
    if (["xiaohongshu", "douyin"].includes(channel) && ["investment_analysis", "product_marketing"].includes(contentClass) && identityStatus === "unknown") errors.push(issue("IDENTITY_DISCLOSURE_UNKNOWN", "$.disclosure_state.identity_status", "Ready professional finance media requires a known identity-disclosure state."));
    if (contentClass !== "personalized_advice" && publicDisclosures.length === 0) warnings.push(issue("PUBLIC_DISCLOSURE_EMPTY", "$.disclosure_state.public_disclosures", "Confirm whether visible position, commercial, identity, or AI disclosures are required."));
  }
  const checkedAt = parseTime(policy.checked_at); const asOf = parseTime(brief.as_of);
  if (deliveryMode === "publish_ready") {
    if (checkedAt === null) errors.push(issue("POLICY_CHECK_REQUIRED", "$.policy_gate.checked_at", "Publish-ready media requires a policy check timestamp."));
    else if (asOf === null) errors.push(issue("BRIEF_AS_OF", "$.brief.as_of", "Publish-ready media requires a parseable as_of timestamp."));
    else { const ageDays = (asOf - checkedAt) / 86400000; if (ageDays > 30 && policyDecision === "ready") errors.push(issue("POLICY_STALE", "$.policy_gate.checked_at", "A policy check older than 30 days cannot support ready publication.")); else if (ageDays > 30) warnings.push(issue("POLICY_STALE", "$.policy_gate.checked_at", "Refresh the policy check before publication.")); }
  }

  if (channel === "reddit" && ["community_post", "community_comment"].includes(kind)) {
    const target = normalizeCommunity(brief.target_community); const actual = normalizeCommunity(packageValue.community);
    if (!target || target !== actual) errors.push(issue("REDDIT_COMMUNITY", "$.package.community", "Package community must match the named target community."));
    if (!(strOrEmpty(packageValue.community_rules_url).startsWith("http://") || strOrEmpty(packageValue.community_rules_url).startsWith("https://"))) errors.push(issue("REDDIT_RULES_URL", "$.package.community_rules_url", "A current community rules URL is required."));
    if (parseTime(packageValue.rules_checked_at) === null) errors.push(issue("REDDIT_RULES_TIME", "$.package.rules_checked_at", "A parseable community rules check time is required."));
    const communityRule = ruleById.get("reddit.community-rules"); if (!isDict(communityRule) || communityRule.status !== "pass") errors.push(issue("REDDIT_RULE_CHECK", "$.policy_gate.rules_checked", "Record a passing named-community rule check."));
  }
  if (expected === "blocked" && kind !== "blocked" && !seekingAlphaOutline) errors.push(issue("BLOCKED_HAS_PACKAGE", "$.package", "Blocked artifacts cannot contain a public package."));
  if (["ready", "conditional"].includes(expected) && kind === "blocked") errors.push(issue("UNEXPECTED_BLOCK", "$.package", "A non-blocked state requires the requested package."));

  let ledger = item.fact_ledger; if (!Array.isArray(ledger)) { errors.push(issue("LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array.")); ledger = []; }
  const factIds = new Set(); let currentFactCount = 0;
  ledger.forEach((fact, index) => {
    const path = `$.fact_ledger[${index}]`; if (!isDict(fact)) { errors.push(issue("FACT_TYPE", path, "Fact must be an object.")); return; }
    const factId = strOrEmpty(fact.id).trim(); if (!factId) errors.push(issue("FACT_ID", `${path}.id`, "Fact ID is required.")); else if (factIds.has(factId)) errors.push(issue("DUPLICATE_FACT_ID", `${path}.id`, `Duplicate fact ID ${factId}.`)); factIds.add(factId);
    if (!EVIDENCE_CLASSES.has(fact.evidence_class)) errors.push(issue("EVIDENCE_CLASS", `${path}.evidence_class`, "Unsupported evidence class."));
    if (!FRESHNESS.has(fact.freshness)) errors.push(issue("FRESHNESS", `${path}.freshness`, "Unsupported freshness state.")); else if (fact.freshness === "current") currentFactCount += 1;
    if (!strOrEmpty(fact.claim).trim()) errors.push(issue("FACT_CLAIM", `${path}.claim`, "Fact claim is required."));
    if (fact.evidence_class === "verified-live" && !strOrEmpty(fact.source_url).trim()) errors.push(issue("LIVE_SOURCE", `${path}.source_url`, "Verified-live facts require a source URL."));
    if ((fact.evidence_class === "verified-live" || fact.freshness === "current") && !strOrEmpty(fact.as_of).trim()) errors.push(issue("LIVE_TIMESTAMP", `${path}.as_of`, "Current or verified-live facts require as_of."));
  });
  function checkFactRefs(refs, path, required = true) {
    if (!Array.isArray(refs)) { errors.push(issue("FACT_REFS_TYPE", path, "fact_ids must be an array.")); return; }
    if (required && refs.length === 0) errors.push(issue("FACT_REFS_EMPTY", path, "A content unit requires at least one fact ID."));
    if (refs.some((ref) => typeof ref !== "string" || !factIds.has(ref))) errors.push(issue("UNKNOWN_FACT", path, "fact_ids contains an unknown fact ID."));
  }

  let assetPlan = item.asset_plan; if (!Array.isArray(assetPlan)) { errors.push(issue("ASSET_PLAN_TYPE", "$.asset_plan", "asset_plan must be an array.")); assetPlan = []; }
  const assets = new Map();
  assetPlan.forEach((asset, index) => {
    const path = `$.asset_plan[${index}]`; if (!isDict(asset)) { errors.push(issue("ASSET_TYPE", path, "Asset plan entry must be an object.")); return; }
    const assetId = strOrEmpty(asset.id).trim(); if (!assetId || assets.has(assetId)) errors.push(issue("ASSET_ID", `${path}.id`, "Asset ID must be non-empty and unique.")); assets.set(assetId, asset);
    checkFactRefs(asset.fact_ids, `${path}.fact_ids`, false);
    const artifactRef = asset.artifact_ref;
    if (artifactRef !== null && artifactRef !== undefined) { if (typeof artifactRef !== "string" || !artifactRef.trim()) errors.push(issue("ASSET_ARTIFACT_REF", `${path}.artifact_ref`, "artifact_ref must be null or a non-empty string.")); else if (!inputRefs.includes(artifactRef)) errors.push(issue("ASSET_ARTIFACT_LINEAGE", `${path}.artifact_ref`, "A generated artifact used as media must also appear in lineage.input_artifact_refs.")); }
    if (asset.origin === "source-reference-only" && asset.reuse_allowed !== false) errors.push(issue("REFERENCE_ASSET_REUSE", `${path}.reuse_allowed`, "Source-reference-only assets cannot be marked reusable."));
  });
  const referencedAssetIds = new Set();
  function checkAssetRefs(refs, path) {
    if (!Array.isArray(refs)) { errors.push(issue("ASSET_REFS_TYPE", path, "asset_ids must be an array.")); return; }
    for (const ref of refs) { if (typeof ref !== "string" || !assets.has(ref)) errors.push(issue("UNKNOWN_ASSET", path, "asset_ids contains an unknown asset ID.")); else referencedAssetIds.add(ref); }
  }

  if (["article_outline", "long_form_article"].includes(kind)) {
    const sections = packageValue.sections;
    if (!Array.isArray(sections) || sections.length < 2) errors.push(issue("ARTICLE_SECTIONS", "$.package.sections", "Article packages require at least two sections."));
    else { const textField = kind === "article_outline" ? "notes" : "body"; sections.forEach((section, index) => { const path = `$.package.sections[${index}]`; if (!isDict(section) || !strOrEmpty(isDict(section) ? section[textField] : null).trim()) errors.push(issue("ARTICLE_SECTION", path, `Section requires ${textField}.`)); else { checkFactRefs(section.fact_ids, `${path}.fact_ids`); checkAssetRefs(section.asset_ids, `${path}.asset_ids`); } }); }
  } else if (["community_post", "community_comment"].includes(kind)) checkFactRefs(packageValue.fact_ids, "$.package.fact_ids");
  else if (kind === "carousel_note") {
    const cards = packageValue.cards;
    if (!Array.isArray(cards) || cards.length < 2) errors.push(issue("CARDS", "$.package.cards", "Carousel requires at least two cards."));
    else {
      const indices = cards.filter(isDict).map((card) => card.index); if (JSON.stringify(indices) !== JSON.stringify(Array.from({ length: cards.length }, (_, i) => i + 1))) errors.push(issue("CARD_ORDER", "$.package.cards", "Card indices must be contiguous and ordered from 1."));
      cards.forEach((card, index) => { const path = `$.package.cards[${index}]`; if (!isDict(card)) errors.push(issue("CARD_TYPE", path, "Card must be an object.")); else { checkFactRefs(card.fact_ids, `${path}.fact_ids`); checkAssetRefs(card.asset_ids, `${path}.asset_ids`); } });
    }
    const cover = packageValue.cover; if (!isDict(cover)) errors.push(issue("COVER", "$.package.cover", "Carousel cover is required.")); else checkAssetRefs(cover.asset_ids, "$.package.cover.asset_ids");
    if (assetPlan.length === 0) errors.push(issue("VISUAL_ASSET_PLAN", "$.asset_plan", "Carousel packages require an asset plan."));
  } else if (kind === "short_video") {
    let duration = packageValue.duration_seconds; const beats = packageValue.beats;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) { errors.push(issue("VIDEO_DURATION", "$.package.duration_seconds", "Video duration must be positive.")); duration = 0; }
    if (!Array.isArray(beats) || beats.length < 2) errors.push(issue("VIDEO_BEATS", "$.package.beats", "Short video requires at least two beats."));
    else {
      const indices = beats.filter(isDict).map((beat) => beat.index); if (JSON.stringify(indices) !== JSON.stringify(Array.from({ length: beats.length }, (_, i) => i + 1))) errors.push(issue("BEAT_ORDER", "$.package.beats", "Beat indices must be contiguous and ordered from 1."));
      let previousEnd = 0;
      beats.forEach((beat, index) => { const path = `$.package.beats[${index}]`; if (!isDict(beat)) { errors.push(issue("BEAT_TYPE", path, "Beat must be an object.")); return; }
        const start = beat.start_second; const end = beat.end_second;
        if (typeof start !== "number" || !Number.isFinite(start) || typeof end !== "number" || !Number.isFinite(end)) errors.push(issue("BEAT_TIMING", path, "Beat timing must be numeric."));
        else { if (index === 0 && start !== 0) errors.push(issue("BEAT_START", `${path}.start_second`, "First beat must start at 0.")); if (start < previousEnd || end <= start || end > duration) errors.push(issue("BEAT_TIMING", path, "Beats must be ordered, non-overlapping, positive, and inside duration.")); previousEnd = end; }
        if (!["voiceover", "on_screen_text", "visual_direction"].some((field) => strOrEmpty(beat[field]).trim())) errors.push(issue("BEAT_EMPTY", path, "Beat needs voiceover, on-screen text, or visual direction."));
        checkFactRefs(beat.fact_ids, `${path}.fact_ids`); checkAssetRefs(beat.asset_ids, `${path}.asset_ids`);
      });
    }
    if (assetPlan.length === 0) errors.push(issue("VIDEO_ASSET_PLAN", "$.asset_plan", "Short-video packages require an asset plan."));
  }
  if (deliveryMode === "publish_ready") for (const assetId of referencedAssetIds) { const asset = assets.get(assetId); if (asset.reuse_allowed !== true || asset.origin === "source-reference-only") errors.push(issue("ASSET_RIGHTS", `$.asset_plan[${assetId}]`, "Every referenced publish-ready asset requires explicit reusable rights.")); }
  const disclosures = isDict(packageValue) ? packageValue.disclosures : null;
  if (["long_form_article", "article_outline", "carousel_note", "short_video"].includes(kind) && ["investment_analysis", "product_marketing"].includes(contentClass) && (!Array.isArray(disclosures) || !disclosures.some((value) => String(value).trim()))) errors.push(issue("DISCLOSURE_REQUIRED", "$.package.disclosures", "Investment analysis or marketing requires a visible disclosure."));
  const angle = item.angle; if (!isDict(angle) || !Array.isArray(angle.profile_rule_ids) || !Array.isArray(angle.media_rule_ids)) errors.push(issue("ANGLE_RULE_IDS", "$.angle", "Angle must report profile_rule_ids and media_rule_ids."));
  const publicText = collectStrings(packageValue).join("\n"); const lowered = publicText.toLowerCase();
  if (temporalMode === "realtime" && ledger.length && currentFactCount === 0) errors.push(issue("REALTIME_WITHOUT_CURRENT_FACT", "$.brief.temporal_mode", "Realtime media requires at least one fact explicitly marked current."));
  if (temporalMode === "historical_replay" && !HISTORICAL_MARKERS.some((marker) => lowered.includes(marker.toLowerCase()))) errors.push(issue("HISTORICAL_LABEL", "$.package", "Historical replay must be visibly labeled in public copy."));
  for (const phrase of BANNED_PUBLIC_PHRASES) if (publicText.includes(phrase)) warnings.push(issue("AI_PHRASE", "$.package", `Review stock phrase: ${phrase}`));
  for (const marker of INTERNAL_MARKERS) if (publicText.includes(marker)) errors.push(issue("INTERNAL_MARKER", "$.package", `Internal marker leaked into public copy: ${marker}`));
  if ((publicText.match(/\u4e0d\u662f.{0,30}\u800c\u662f/g) ?? []).length > 1) warnings.push(issue("REPEATED_CONTRAST", "$.package", "Repeated \u4e0d\u662f...\u800c\u662f framing reads formulaic."));
  if (ACTION_PATTERNS.some((pattern) => pattern.test(publicText))) errors.push(issue("ACTION_BOUNDARY", "$.package", "Package crosses into personalized orders, sizing, leverage, or credential handling."));
  if (expected === "conditional" && kind !== "blocked" && !hasConditionalMarker(publicText)) errors.push(issue("CONDITIONAL_WORDING", "$.package", "Conditional packages must name uncertainty, a condition, or a confirmation check."));
  const quality = item.quality_report;
  if (!isDict(quality) || !["scores", "hard_failures", "revisions"].every((key) => Object.hasOwn(quality, key))) errors.push(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."));
  else if (pyTruthy(quality.hard_failures) && state !== "blocked") errors.push(issue("HARD_FAILURE_STATE", "$.quality_report.hard_failures", "Hard failures require blocked state."));
  return { valid: errors.length === 0, errors, warnings };
}

async function readInput(path) { if (path) return readFileSync(path, "utf8"); const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8"); }
async function main() { const argv = process.argv.slice(2); if (argv.includes("-h") || argv.includes("--help")) { process.stdout.write("usage: validate_media_package.mjs [-h] [json_file]\n"); return 0; } if (argv.length > 1) return 2; const payload = JSON.parse(await readInput(argv[0])); const output = Array.isArray(payload) ? payload.map(validate) : validate(payload); process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); return (Array.isArray(output) ? output : [output]).every((result) => result.valid) ? 0 : 1; }
const isMain = (() => { if (!process.argv[1]) return false; try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) process.exit(await main());
