#!/usr/bin/env node
/** Validate ContentOpportunitySetV1 and optional CreatorFeedV1 references. */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { pyrepr } from "./validate_json_schema.mjs";

const ROOT_FIELDS = new Set(["schema_version", "opportunity_set_id", "feed_ref", "feed_hash", "as_of", "decision_cutoff_at", "ruleset_version", "mode", "candidates", "clusters", "selected_order", "quality_report"]);
const MODES = new Set(["daily_desk", "single_subject", "event_lifecycle", "postmortem", "correction", "evergreen"]);
const DECISIONS = new Set(["selected", "defer", "merge", "reject", "no_action"]);
const REASON_CODES = new Set([
  "correction_required", "breaking_primary_source", "catalyst_window", "evidence_ready", "researchable_gap",
  "duplicate_merged", "expired", "permission_blocked", "disclosure_unknown", "conflict_material", "identity_blocked",
  "temporal_blocked", "low_novelty", "low_relevance", "postmortem_authorized", "no_public_job",
]);
const FACTOR_KEYS = new Set(["timeliness", "evidence_maturity", "novelty", "audience_relevance", "explainability", "production_fit", "correction_risk", "conflict_risk"]);

const issue = (code, issuePath, message) => ({ code, path: issuePath, message });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const setEqual = (left, right) => left.size === right.size && [...left].every((value) => right.has(value));

function parseTime(value, issuePath, errors, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || value.length === 0) {
    errors.push(issue("TIME_REQUIRED", issuePath, "Timezone-aware ISO timestamp required."));
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match || Number.isNaN(Date.parse(value.replace(/Z$/, "+00:00")))) {
    errors.push(issue("TIME_FORMAT", issuePath, "Invalid ISO timestamp."));
    return null;
  }
  if (!match[7]) {
    errors.push(issue("TIMEZONE_REQUIRED", issuePath, "Timestamp must include timezone."));
    return null;
  }
  return new Date(value);
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validate(payload, feed = null) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "ContentOpportunitySetV1 must be an object.")], warnings: [] };
  for (const key of [...ROOT_FIELDS].filter((key) => !Object.hasOwn(payload, key)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of Object.keys(payload).filter((key) => !ROOT_FIELDS.has(key)).sort()) errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  if (payload.schema_version !== "content-opportunity-set-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-opportunity-set-v1."));
  if (!/^OS_[a-z0-9]{8,64}$/.test(String(payload.opportunity_set_id || ""))) errors.push(issue("SET_ID", "$.opportunity_set_id", "Invalid opportunity set ID."));
  if (!/^CF_[a-z0-9]{8,64}$/.test(String(payload.feed_ref || ""))) errors.push(issue("FEED_REF", "$.feed_ref", "Invalid feed reference."));
  if (!/^sha256:[a-f0-9]{64}$/.test(String(payload.feed_hash || ""))) errors.push(issue("FEED_HASH", "$.feed_hash", "Invalid feed hash."));
  if (!MODES.has(payload.mode)) errors.push(issue("MODE", "$.mode", "Unsupported selection mode."));
  if (!String(payload.ruleset_version || "").trim()) errors.push(issue("RULESET", "$.ruleset_version", "ruleset_version is required."));
  const asOf = parseTime(payload.as_of, "$.as_of", errors);
  const cutoff = parseTime(payload.decision_cutoff_at, "$.decision_cutoff_at", errors);
  if (asOf && cutoff && cutoff > asOf) errors.push(issue("CUTOFF_AFTER_AS_OF", "$.decision_cutoff_at", "Decision cutoff cannot be after as_of."));

  const feedRecords = new Map();
  const feedEntities = new Set();
  if (feed !== null) {
    if (!isObject(feed) || feed.schema_version !== "creator-feed-v1") errors.push(issue("FEED_TYPE", "$feed", "A valid CreatorFeedV1 object is required."));
    else {
      if (payload.feed_ref !== feed.feed_id) errors.push(issue("FEED_ID_MISMATCH", "$.feed_ref", "feed_ref does not match the supplied feed."));
      if (payload.feed_hash !== feed.input_hash) errors.push(issue("FEED_HASH_MISMATCH", "$.feed_hash", "feed_hash does not match the supplied feed input hash."));
      if (payload.decision_cutoff_at !== feed.knowledge_cutoff_at) errors.push(issue("FEED_CUTOFF_MISMATCH", "$.decision_cutoff_at", "Selection cutoff must equal the feed knowledge cutoff."));
      for (const entry of feed.entities ?? []) if (isObject(entry)) feedEntities.add(entry.id);
      for (const section of ["news", "calendar_events", "narratives", "trade_ideas", "trade_history"]) {
        for (const entry of feed[section] ?? []) if (isObject(entry) && entry.id) feedRecords.set(entry.id, entry);
      }
    }
  }

  let candidates = payload.candidates;
  if (!Array.isArray(candidates)) {
    errors.push(issue("CANDIDATES_TYPE", "$.candidates", "candidates must be an array."));
    candidates = [];
  }
  const candidateIds = new Set();
  const selected = [];
  const candidatesById = new Map();
  const clusterMemberships = new Map();
  let conditionalSelected = false;
  for (const [index, candidate] of candidates.entries()) {
    const candidatePath = `$.candidates[${index}]`;
    if (!isObject(candidate)) {
      errors.push(issue("CANDIDATE_TYPE", candidatePath, "Candidate must be an object."));
      continue;
    }
    const candidateId = String(candidate.opportunity_id || "");
    if (!candidateId.startsWith("OPP_")) errors.push(issue("OPPORTUNITY_ID", `${candidatePath}.opportunity_id`, "Expected OPP_* ID."));
    if (candidateIds.has(candidateId)) errors.push(issue("DUPLICATE_OPPORTUNITY", `${candidatePath}.opportunity_id`, "Duplicate opportunity ID."));
    candidateIds.add(candidateId);
    candidatesById.set(candidateId, candidate);
    for (const key of ["title", "thesis_seed", "audience", "dedupe_cluster_id", "tie_break_key"]) {
      if (!String(candidate[key] || "").trim()) errors.push(issue("CANDIDATE_FIELD", `${candidatePath}.${key}`, `${key} is required.`));
    }
    const anchors = candidate.anchor_refs;
    const entities = candidate.entity_refs;
    const historyRefs = candidate.history_refs;
    for (const [key, refs] of [["anchor_refs", anchors], ["entity_refs", entities], ["history_refs", historyRefs], ["reason_codes", candidate.reason_codes], ["missing_requirements", candidate.missing_requirements], ["research_requirements", candidate.research_requirements]]) {
      if (!Array.isArray(refs)) errors.push(issue("ARRAY_REQUIRED", `${candidatePath}.${key}`, `${key} must be an array.`));
    }
    if (!anchors?.length) errors.push(issue("ANCHOR_REQUIRED", `${candidatePath}.anchor_refs`, "Candidate requires at least one anchor."));
    const decision = candidate.decision;
    if (!DECISIONS.has(decision)) errors.push(issue("DECISION", `${candidatePath}.decision`, "Unsupported decision."));
    if (candidate.eligibility === "blocked" && decision === "selected") errors.push(issue("SELECTED_BLOCKED", candidatePath, "Blocked candidate cannot be selected."));
    if (candidate.permission_state === "blocked" && decision === "selected") errors.push(issue("SELECTED_PERMISSION_BLOCK", candidatePath, "Permission-blocked candidate cannot be selected."));
    if (candidate.disclosure_state === "blocked" && decision === "selected") errors.push(issue("SELECTED_DISCLOSURE_BLOCK", candidatePath, "Disclosure-blocked candidate cannot be selected."));
    if (decision === "selected" && candidate.priority === "none") errors.push(issue("SELECTED_PRIORITY", `${candidatePath}.priority`, "Selected candidate needs p0, p1, or p2."));
    const rank = candidate.selection_rank;
    if (decision === "selected") {
      if (!Number.isInteger(rank) || rank < 1) errors.push(issue("SELECTION_RANK", `${candidatePath}.selection_rank`, "Selected candidate needs a positive rank."));
      else selected.push([rank, candidateId]);
      if (candidate.eligibility === "conditional" || candidate.evidence_state === "conditional" || candidate.disclosure_state === "unknown") conditionalSelected = true;
    } else if (rank !== null && rank !== undefined) errors.push(issue("UNSELECTED_RANK", `${candidatePath}.selection_rank`, "Only selected candidates may have a rank."));
    const expires = parseTime(candidate.expires_at, `${candidatePath}.expires_at`, errors, true);
    if (decision === "selected" && expires && cutoff && expires <= cutoff) errors.push(issue("SELECTED_EXPIRED", `${candidatePath}.expires_at`, "Expired candidate cannot be selected."));
    const factors = candidate.factor_vector;
    if (!isObject(factors) || !setEqual(new Set(Object.keys(factors)), FACTOR_KEYS)) errors.push(issue("FACTOR_VECTOR", `${candidatePath}.factor_vector`, "Factor vector must contain exactly the eight categorical factors."));
    else if (Object.values(factors).some((value) => !["high", "medium", "low"].includes(value))) errors.push(issue("FACTOR_VALUE", `${candidatePath}.factor_vector`, "Factors must be high, medium, or low."));
    for (const reason of candidate.reason_codes ?? []) if (!REASON_CODES.has(reason)) errors.push(issue("REASON_CODE", `${candidatePath}.reason_codes`, `Unsupported reason code ${pyrepr(reason)}.`));
    if (candidate.evidence_state === "ready" && candidate.missing_requirements?.length) errors.push(issue("READY_WITH_GAPS", `${candidatePath}.missing_requirements`, "Evidence-ready candidate cannot retain missing requirements."));
    if (candidate.lifecycle === "correction" || candidate.editorial_job === "correction") {
      if (candidate.priority !== "p0" || !(candidate.reason_codes ?? []).includes("correction_required")) errors.push(issue("CORRECTION_PRIORITY", candidatePath, "Correction requires p0 and correction_required."));
    }
    if (candidate.priority === "p0" && !["correction", "risk_alert"].includes(candidate.editorial_job)) errors.push(issue("P0_SCOPE", `${candidatePath}.priority`, "p0 is reserved for corrections and material risk alerts."));
    if (decision === "merge") {
      if (!candidate.merged_into) errors.push(issue("MERGE_TARGET", `${candidatePath}.merged_into`, "Merged candidate requires a canonical target."));
      if (!(candidate.reason_codes ?? []).includes("duplicate_merged")) errors.push(issue("MERGE_REASON", `${candidatePath}.reason_codes`, "Merged candidate requires duplicate_merged."));
    } else if (candidate.merged_into !== null && candidate.merged_into !== undefined) errors.push(issue("UNEXPECTED_MERGE_TARGET", `${candidatePath}.merged_into`, "Only merged candidates may set merged_into."));
    if (historyRefs?.length && !["conflict_check", "disclosure", "pre_registered_postmortem"].includes(candidate.history_use)) errors.push(issue("HISTORY_USE", `${candidatePath}.history_use`, "History references require an allowed use."));
    if (!historyRefs?.length && candidate.history_use !== null && candidate.history_use !== undefined) errors.push(issue("HISTORY_USE_WITHOUT_REFS", `${candidatePath}.history_use`, "History use requires history references."));
    if (candidate.lifecycle === "trade_postmortem" && (!historyRefs?.length || candidate.history_use !== "pre_registered_postmortem")) errors.push(issue("POSTMORTEM_HISTORY", candidatePath, "Trade postmortem requires authorized history and pre_registered_postmortem use."));

    const clusterId = String(candidate.dedupe_cluster_id || "");
    clusterMemberships.set(clusterId, [...(clusterMemberships.get(clusterId) ?? []), candidateId]);

    if (feedRecords.size) {
      const activeAnchorTypes = new Set();
      for (const ref of anchors ?? []) {
        const record = feedRecords.get(ref);
        if (!record) {
          errors.push(issue("UNKNOWN_ANCHOR_REF", `${candidatePath}.anchor_refs`, `Unknown feed record ${pyrepr(ref)}.`));
          continue;
        }
        activeAnchorTypes.add(String(ref).split("_", 1)[0]);
        if (decision === "selected" && record.record_status !== "active") errors.push(issue("SELECTED_INACTIVE_ANCHOR", `${candidatePath}.anchor_refs`, `Selected anchor ${ref} is not active.`));
        const available = parseTime(record.available_at, `$feed.${ref}.available_at`, errors);
        if (decision === "selected" && cutoff && available && available > cutoff) errors.push(issue("SELECTED_FUTURE_ANCHOR", `${candidatePath}.anchor_refs`, `Anchor ${ref} was unavailable at cutoff.`));
      }
      for (const ref of entities ?? []) if (!feedEntities.has(ref)) errors.push(issue("UNKNOWN_ENTITY_REF", `${candidatePath}.entity_refs`, `Unknown feed entity ${pyrepr(ref)}.`));
      for (const ref of historyRefs ?? []) {
        const record = feedRecords.get(ref);
        if (!record || !String(ref).startsWith("TRADE_")) errors.push(issue("UNKNOWN_HISTORY_REF", `${candidatePath}.history_refs`, `Invalid history reference ${pyrepr(ref)}.`));
        else if (candidate.lifecycle === "trade_postmortem" && !["aggregate_only", "record_allowed"].includes(record.public_reuse_permission)) errors.push(issue("POSTMORTEM_PERMISSION", `${candidatePath}.history_refs`, "Postmortem history lacks public reuse permission."));
      }
      if (candidate.evidence_state === "ready" && activeAnchorTypes.size && [...activeAnchorTypes].every((value) => ["NAR", "IDEA", "CAL"].includes(value))) errors.push(issue("INFERENCE_ONLY_READY", `${candidatePath}.evidence_state`, "Narrative, idea, or schedule-only candidate cannot be evidence-ready."));
    }
  }

  for (const [candidateId, candidate] of candidatesById) {
    const target = candidate.merged_into;
    if (target !== null && target !== undefined && (!candidatesById.has(target) || target === candidateId)) errors.push(issue("INVALID_MERGE_TARGET", `$.candidates[${candidateId}].merged_into`, "Merge target must resolve to a different candidate."));
  }

  let clusters = payload.clusters;
  if (!Array.isArray(clusters)) {
    errors.push(issue("CLUSTERS_TYPE", "$.clusters", "clusters must be an array."));
    clusters = [];
  }
  const seenClusters = new Set();
  const clusteredCandidates = new Set();
  for (const [index, cluster] of clusters.entries()) {
    const clusterPath = `$.clusters[${index}]`;
    if (!isObject(cluster)) {
      errors.push(issue("CLUSTER_TYPE", clusterPath, "Cluster must be an object."));
      continue;
    }
    const clusterId = cluster.cluster_id;
    if (seenClusters.has(clusterId)) errors.push(issue("DUPLICATE_CLUSTER", `${clusterPath}.cluster_id`, "Duplicate cluster ID."));
    seenClusters.add(clusterId);
    let members = cluster.member_refs;
    if (!Array.isArray(members) || !members.length) {
      errors.push(issue("CLUSTER_MEMBERS", `${clusterPath}.member_refs`, "Cluster requires members."));
      members = [];
    }
    for (const ref of members) {
      if (!candidateIds.has(ref)) errors.push(issue("UNKNOWN_CLUSTER_MEMBER", `${clusterPath}.member_refs`, `Unknown candidate ${pyrepr(ref)}.`));
      clusteredCandidates.add(ref);
    }
    if (!members.includes(cluster.canonical_ref)) errors.push(issue("CLUSTER_CANONICAL", `${clusterPath}.canonical_ref`, "Canonical candidate must be a cluster member."));
    const expected = new Set(clusterMemberships.get(String(clusterId)) ?? []);
    if (!setEqual(new Set(members), expected)) errors.push(issue("CLUSTER_MEMBERSHIP_MISMATCH", clusterPath, "Cluster members must match candidate dedupe_cluster_id values."));
  }
  if (!setEqual(clusteredCandidates, candidateIds)) errors.push(issue("CLUSTER_COVERAGE", "$.clusters", "Every candidate must occur in exactly one declared cluster."));

  selected.sort((left, right) => left[0] - right[0] || String(left[1]).localeCompare(String(right[1])));
  const expectedRanks = Array.from({ length: selected.length }, (_, index) => index + 1);
  if (!sameObject(selected.map(([rank]) => rank), expectedRanks)) errors.push(issue("RANK_SEQUENCE", "$.candidates", "Selected ranks must be unique and contiguous from 1."));
  const expectedOrder = selected.map(([, candidateId]) => candidateId);
  if (!sameObject(payload.selected_order, expectedOrder)) errors.push(issue("SELECTED_ORDER", "$.selected_order", "selected_order must exactly follow selection_rank."));

  let quality = payload.quality_report;
  if (!isObject(quality)) {
    errors.push(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."));
    quality = {};
  }
  let hardFailures = quality.hard_failures;
  if (!Array.isArray(hardFailures)) {
    errors.push(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hardFailures = [];
  }
  if (hardFailures.length && quality.decision !== "blocked") errors.push(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."));
  if (conditionalSelected && quality.decision === "ready") errors.push(issue("READY_WITH_CONDITIONAL_SELECTION", "$.quality_report.decision", "Conditional selected work prevents a ready set."));
  const expectedCounts = {
    candidates: candidates.length,
    selected: candidates.filter((candidate) => isObject(candidate) && candidate.decision === "selected").length,
    deferred: candidates.filter((candidate) => isObject(candidate) && candidate.decision === "defer").length,
    merged: candidates.filter((candidate) => isObject(candidate) && candidate.decision === "merge").length,
    rejected: candidates.filter((candidate) => isObject(candidate) && candidate.decision === "reject").length,
    no_action: candidates.filter((candidate) => isObject(candidate) && candidate.decision === "no_action").length,
    blocked: candidates.filter((candidate) => isObject(candidate) && candidate.eligibility === "blocked").length,
  };
  if (!sameObject(quality.counts, expectedCounts)) errors.push(issue("COUNTS", "$.quality_report.counts", `Expected exact counts ${pyrepr(expectedCounts)}.`));
  return { valid: errors.length === 0, errors, warnings };
}

function usageError(message) {
  process.stderr.write(`usage: validate_content_opportunities.mjs [-h] [--feed FEED] json_file\nvalidate_content_opportunities.mjs: error: ${message}\n`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  let jsonFile = null;
  let feedPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write("usage: validate_content_opportunities.mjs [-h] [--feed FEED] json_file\n");
      return;
    }
    if (arg === "--feed") {
      if (index + 1 >= args.length) usageError("argument --feed: expected one argument");
      feedPath = args[++index];
    } else if (arg.startsWith("-")) usageError(`unrecognized arguments: ${arg}`);
    else if (jsonFile === null) jsonFile = arg;
    else usageError(`unrecognized arguments: ${arg}`);
  }
  if (jsonFile === null) usageError("the following arguments are required: json_file");
  const payload = JSON.parse(readFileSync(jsonFile, "utf8"));
  const feed = feedPath ? JSON.parse(readFileSync(feedPath, "utf8")) : null;
  const result = validate(payload, feed);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
