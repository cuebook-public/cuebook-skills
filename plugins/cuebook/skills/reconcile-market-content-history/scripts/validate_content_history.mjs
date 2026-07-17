#!/usr/bin/env node
/** Validate ContentHistoryLedgerV1 publication, correction, and outcome invariants. */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { pyrepr } from "../../../scripts/validate_json_schema.mjs";

const ROOT_FIELDS = new Set(["schema_version", "ledger_id", "workflow_ref", "release_refs", "as_of", "reconciliation_cutoff_at", "ruleset_version", "publication_receipts", "corrections", "artifact_invalidations", "content_performance", "market_outcomes", "trade_reconciliations", "learning_snapshots", "audit_events", "quality_report"]);
const SECTIONS = ["publication_receipts", "corrections", "artifact_invalidations", "content_performance", "market_outcomes", "trade_reconciliations", "learning_snapshots", "audit_events"];
const RECEIPT_TRANSITIONS = new Map([
  [null, new Set(["not_attempted", "attempted", "failed", "ambiguous"])],
  ["not_attempted", new Set(["attempted"])], ["attempted", new Set(["acknowledged", "failed", "ambiguous"])],
  ["acknowledged", new Set(["verified_published", "failed", "ambiguous"])],
  ["verified_published", new Set(["edited", "corrected", "retracted", "removed"])],
  ["edited", new Set(["corrected", "retracted", "removed"])], ["corrected", new Set(["retracted", "removed"])],
  ["failed", new Set()], ["ambiguous", new Set()], ["retracted", new Set(["removed"])], ["removed", new Set()],
]);

const issue = (code, issuePath, message) => ({ code, path: issuePath, message });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const subset = (left, right) => [...left].every((value) => right.has(value));

function parseTime(value, issuePath, errors, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value) {
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

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "ContentHistoryLedgerV1 must be an object.")], warnings: [] };
  for (const key of [...ROOT_FIELDS].filter((key) => !Object.hasOwn(payload, key)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  for (const key of Object.keys(payload).filter((key) => !ROOT_FIELDS.has(key)).sort()) errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  if (payload.schema_version !== "content-history-ledger-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-history-ledger-v1."));
  if (!/^CHL_[a-z0-9]{8,64}$/.test(String(payload.ledger_id || ""))) errors.push(issue("LEDGER_ID", "$.ledger_id", "Invalid ledger ID."));
  if (!String(payload.workflow_ref || "").startsWith("WF_")) errors.push(issue("WORKFLOW_REF", "$.workflow_ref", "workflow_ref must be a WF_* ID."));
  if (!Array.isArray(payload.release_refs)) errors.push(issue("RELEASE_REFS", "$.release_refs", "release_refs must be an array."));
  const asOf = parseTime(payload.as_of, "$.as_of", errors);
  const cutoff = parseTime(payload.reconciliation_cutoff_at, "$.reconciliation_cutoff_at", errors);
  if (asOf && cutoff && cutoff > asOf) errors.push(issue("CUTOFF_AFTER_AS_OF", "$.reconciliation_cutoff_at", "Cutoff cannot be after as_of."));
  if (!String(payload.ruleset_version || "").trim()) errors.push(issue("RULESET", "$.ruleset_version", "ruleset_version is required."));
  const sections = {};
  for (const section of SECTIONS) {
    let value = payload[section];
    if (!Array.isArray(value)) {
      errors.push(issue("ARRAY_REQUIRED", `$.${section}`, `${section} must be an array.`));
      value = [];
    }
    sections[section] = value;
  }

  const receipts = new Map();
  const remoteKeys = new Set();
  const ambiguousKeys = new Map();
  for (const [index, receipt] of sections.publication_receipts.entries()) {
    const receiptPath = `$.publication_receipts[${index}]`;
    if (!isObject(receipt)) {
      errors.push(issue("RECEIPT_TYPE", receiptPath, "Receipt must be an object."));
      continue;
    }
    const receiptId = String(receipt.receipt_id || "");
    if (!receiptId.startsWith("REC_")) errors.push(issue("RECEIPT_ID", `${receiptPath}.receipt_id`, "Expected REC_* ID."));
    if (receipts.has(receiptId)) errors.push(issue("DUPLICATE_RECEIPT", `${receiptPath}.receipt_id`, "Duplicate receipt ID."));
    receipts.set(receiptId, receipt);
    if (!(payload.release_refs ?? []).includes(receipt.release_ref)) errors.push(issue("UNKNOWN_RELEASE_REF", `${receiptPath}.release_ref`, "Receipt release is not registered at the ledger root."));
    const attempted = parseTime(receipt.attempted_at, `${receiptPath}.attempted_at`, errors, true);
    const acknowledged = parseTime(receipt.acknowledged_at, `${receiptPath}.acknowledged_at`, errors, true);
    const verified = parseTime(receipt.verified_at, `${receiptPath}.verified_at`, errors, true);
    if (attempted && acknowledged && attempted > acknowledged) errors.push(issue("RECEIPT_TIME_ORDER", receiptPath, "attempted_at cannot be after acknowledged_at."));
    if (acknowledged && verified && acknowledged > verified) errors.push(issue("RECEIPT_TIME_ORDER", receiptPath, "acknowledged_at cannot be after verified_at."));
    if (cutoff && [attempted, acknowledged, verified].some((time) => time && time > cutoff)) errors.push(issue("RECEIPT_AFTER_CUTOFF", receiptPath, "Receipt contains a state after the reconciliation cutoff."));
    const status = receipt.status;
    if (["attempted", "acknowledged", "verified_published", "failed", "ambiguous", "edited", "corrected", "retracted", "removed"].includes(status) && !attempted) errors.push(issue("ATTEMPT_TIME_REQUIRED", `${receiptPath}.attempted_at`, "Attempted or later state requires attempted_at."));
    if (["acknowledged", "verified_published", "edited", "corrected", "retracted", "removed"].includes(status) && !acknowledged) errors.push(issue("ACK_TIME_REQUIRED", `${receiptPath}.acknowledged_at`, "Acknowledged or later state requires acknowledged_at."));
    if (["verified_published", "edited", "corrected", "retracted", "removed"].includes(status)) {
      for (const key of ["remote_id", "verification_locator"]) if (!String(receipt[key] || "").trim()) errors.push(issue("VERIFIED_RECEIPT_FIELD", `${receiptPath}.${key}`, `${key} is required for verified publication.`));
      if (!verified) errors.push(issue("VERIFIED_TIME_REQUIRED", `${receiptPath}.verified_at`, "Verified publication requires verified_at."));
      if (receipt.verification_method === "none") errors.push(issue("VERIFICATION_METHOD", `${receiptPath}.verification_method`, "Verified publication requires a verification method."));
      const remoteKey = `${String(receipt.platform || "")}\u0000${String(receipt.remote_id || "")}`;
      if (remoteKeys.has(remoteKey)) errors.push(issue("DUPLICATE_REMOTE_OBJECT", receiptPath, "Remote platform object is registered twice."));
      remoteKeys.add(remoteKey);
    }
    if (status === "ambiguous") {
      const group = `${String(receipt.platform || "")}\u0000${String(receipt.release_item_ref || "")}`;
      const keys = ambiguousKeys.get(group) ?? new Set();
      keys.add(String(receipt.idempotency_key || ""));
      ambiguousKeys.set(group, keys);
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(String(receipt.payload_hash || ""))) errors.push(issue("PAYLOAD_HASH", `${receiptPath}.payload_hash`, "Invalid payload hash."));
  }
  for (const [group, keys] of ambiguousKeys) {
    if (keys.size > 1) {
      const [platform, item] = group.split("\u0000");
      errors.push(issue("AMBIGUOUS_RETRY", "$.publication_receipts", `Ambiguous item ${pyrepr([platform, item])} was retried with different idempotency keys.`));
    }
  }

  const corrections = new Map();
  const correctionPaths = new Map();
  for (const [index, correction] of sections.corrections.entries()) {
    const correctionPath = `$.corrections[${index}]`;
    if (!isObject(correction)) {
      errors.push(issue("CORRECTION_TYPE", correctionPath, "Correction must be an object."));
      continue;
    }
    const correctionId = String(correction.correction_id || "");
    if (corrections.has(correctionId)) errors.push(issue("DUPLICATE_CORRECTION", `${correctionPath}.correction_id`, "Duplicate correction ID."));
    corrections.set(correctionId, correction);
    correctionPaths.set(correctionId, correctionPath);
    const detected = parseTime(correction.detected_at, `${correctionPath}.detected_at`, errors);
    const effective = parseTime(correction.effective_at, `${correctionPath}.effective_at`, errors);
    if (detected && effective && effective < detected) errors.push(issue("CORRECTION_TIME_ORDER", correctionPath, "effective_at cannot precede detected_at."));
    if (cutoff && effective && effective > cutoff) errors.push(issue("CORRECTION_AFTER_CUTOFF", `${correctionPath}.effective_at`, "Correction is after the reconciliation cutoff."));
    if (["material", "critical"].includes(correction.severity)) {
      if (correction.public_action === "none") errors.push(issue("MATERIAL_PUBLIC_ACTION", `${correctionPath}.public_action`, "Material correction requires a public action."));
      if (!correction.affected_artifact_refs?.length) errors.push(issue("MATERIAL_AFFECTED_ARTIFACTS", `${correctionPath}.affected_artifact_refs`, "Material correction requires affected artifacts."));
      if (["approved", "propagating", "complete"].includes(correction.status) && !correction.approver_ref) errors.push(issue("CORRECTION_APPROVER", `${correctionPath}.approver_ref`, "Approved correction requires an approver."));
    }
    if (correction.propagation_status === "complete" && correction.status !== "complete") errors.push(issue("PROPAGATION_STATE", correctionPath, "Complete propagation requires complete correction status."));
  }

  const invalidatedByCorrection = new Map();
  const invalidationIds = new Set();
  for (const [index, invalidation] of sections.artifact_invalidations.entries()) {
    const invalidationPath = `$.artifact_invalidations[${index}]`;
    if (!isObject(invalidation)) {
      errors.push(issue("INVALIDATION_TYPE", invalidationPath, "Invalidation must be an object."));
      continue;
    }
    if (invalidationIds.has(invalidation.invalidation_id)) errors.push(issue("DUPLICATE_INVALIDATION", `${invalidationPath}.invalidation_id`, "Duplicate invalidation ID."));
    invalidationIds.add(invalidation.invalidation_id);
    const correctionRef = invalidation.correction_ref;
    if (!corrections.has(correctionRef)) errors.push(issue("UNKNOWN_CORRECTION_REF", `${invalidationPath}.correction_ref`, "Invalidation correction does not resolve."));
    const refs = invalidatedByCorrection.get(String(correctionRef)) ?? new Set();
    refs.add(String(invalidation.artifact_ref || ""));
    invalidatedByCorrection.set(String(correctionRef), refs);
    const invalidatedAt = parseTime(invalidation.invalidated_at, `${invalidationPath}.invalidated_at`, errors);
    if (cutoff && invalidatedAt && invalidatedAt > cutoff) errors.push(issue("INVALIDATION_AFTER_CUTOFF", `${invalidationPath}.invalidated_at`, "Invalidation is after cutoff."));
  }
  for (const [correctionId, correction] of corrections) {
    if (["material", "critical"].includes(correction.severity) && correction.propagation_status === "complete") {
      const expected = new Set(correction.affected_artifact_refs ?? []);
      const actual = invalidatedByCorrection.get(correctionId) ?? new Set();
      if (!subset(expected, actual)) errors.push(issue("INCOMPLETE_INVALIDATION_CASCADE", correctionPaths.get(correctionId), `Missing invalidations for ${pyrepr([...expected].filter((ref) => !actual.has(ref)).sort())}.`));
    }
  }

  const contentIds = new Set();
  for (const [index, snapshot] of sections.content_performance.entries()) {
    const snapshotPath = `$.content_performance[${index}]`;
    if (!isObject(snapshot)) {
      errors.push(issue("CONTENT_SNAPSHOT_TYPE", snapshotPath, "Content snapshot must be an object."));
      continue;
    }
    contentIds.add(snapshot.snapshot_id);
    const receipt = receipts.get(snapshot.receipt_ref);
    if (!receipt) errors.push(issue("UNKNOWN_RECEIPT_REF", `${snapshotPath}.receipt_ref`, "Content snapshot receipt does not resolve."));
    else if (!["verified_published", "edited", "corrected", "retracted", "removed"].includes(receipt.status)) errors.push(issue("PERFORMANCE_UNVERIFIED_PUBLICATION", `${snapshotPath}.receipt_ref`, "Performance requires a verified published object."));
    const start = parseTime(snapshot.window_start, `${snapshotPath}.window_start`, errors);
    const end = parseTime(snapshot.window_end, `${snapshotPath}.window_end`, errors);
    const observed = parseTime(snapshot.observed_at, `${snapshotPath}.observed_at`, errors);
    if (start && end && start > end) errors.push(issue("CONTENT_WINDOW", snapshotPath, "window_start cannot be after window_end."));
    if (end && observed && end > observed) errors.push(issue("CONTENT_OBSERVED_EARLY", snapshotPath, "Snapshot cannot observe a window before it closes."));
    if (cutoff && observed && observed > cutoff) errors.push(issue("CONTENT_AFTER_CUTOFF", `${snapshotPath}.observed_at`, "Content snapshot is after cutoff."));
    if (snapshot.use_scope !== "packaging_only") errors.push(issue("CONTENT_USE_SCOPE", `${snapshotPath}.use_scope`, "Content performance is packaging_only."));
  }

  const marketIds = new Set();
  for (const [index, outcome] of sections.market_outcomes.entries()) {
    const outcomePath = `$.market_outcomes[${index}]`;
    if (!isObject(outcome)) {
      errors.push(issue("MARKET_OUTCOME_TYPE", outcomePath, "Market outcome must be an object."));
      continue;
    }
    marketIds.add(outcome.outcome_id);
    const start = parseTime(outcome.window_start, `${outcomePath}.window_start`, errors);
    const end = parseTime(outcome.window_end, `${outcomePath}.window_end`, errors);
    const observed = parseTime(outcome.observed_at, `${outcomePath}.observed_at`, errors);
    if (start && end && start > end) errors.push(issue("MARKET_WINDOW", outcomePath, "window_start cannot be after window_end."));
    if (["window_closed", "frozen", "eligible"].includes(outcome.status) && end && observed && end > observed) errors.push(issue("MARKET_OBSERVED_EARLY", outcomePath, "Closed outcome window must end before observation."));
    if (cutoff && observed && observed > cutoff) errors.push(issue("MARKET_AFTER_CUTOFF", `${outcomePath}.observed_at`, "Market outcome is after cutoff."));
    if (!["idea_scorecard", "calibration_only"].includes(outcome.use_scope)) errors.push(issue("MARKET_USE_SCOPE", `${outcomePath}.use_scope`, "Market outcome cannot be a track record."));
  }

  const tradeIds = new Set();
  for (const [index, trade] of sections.trade_reconciliations.entries()) {
    const tradePath = `$.trade_reconciliations[${index}]`;
    if (!isObject(trade)) {
      errors.push(issue("TRADE_RECON_TYPE", tradePath, "Trade reconciliation must be an object."));
      continue;
    }
    tradeIds.add(trade.reconciliation_id);
    const claim = trade.public_claim_eligibility;
    if (claim === "eligible") {
      const required = [trade.record_type === "executed", trade.verification === "broker_reconciled", trade.fills_complete === true, trade.fees_included === true, trade.cohort_completeness === "complete", trade.consent === "record_allowed", trade.fx_treatment !== "missing", trade.corporate_actions_treatment !== "missing", trade.status === "eligible"];
      if (!required.every(Boolean)) errors.push(issue("PUBLIC_CLAIM_INELIGIBLE", tradePath, "Public claim eligibility requires complete consented broker-reconciled executed history."));
    }
    if (claim === "aggregate_only" && !["aggregate_only", "record_allowed"].includes(trade.consent)) errors.push(issue("AGGREGATE_CONSENT", `${tradePath}.consent`, "Aggregate eligibility requires aggregate consent."));
    if (trade.status === "excluded" && !String(trade.exclusion_reason || "").trim()) errors.push(issue("EXCLUSION_REASON", `${tradePath}.exclusion_reason`, "Excluded reconciliation requires a reason."));
  }

  const learningIds = new Set();
  for (const [index, learning] of sections.learning_snapshots.entries()) {
    const learningPath = `$.learning_snapshots[${index}]`;
    if (!isObject(learning)) {
      errors.push(issue("LEARNING_TYPE", learningPath, "Learning snapshot must be an object."));
      continue;
    }
    if (learningIds.has(learning.learning_snapshot_id)) errors.push(issue("DUPLICATE_LEARNING", `${learningPath}.learning_snapshot_id`, "Duplicate learning snapshot ID."));
    learningIds.add(learning.learning_snapshot_id);
    const created = parseTime(learning.created_at, `${learningPath}.created_at`, errors);
    const learningCutoff = parseTime(learning.cutoff_at, `${learningPath}.cutoff_at`, errors);
    if (created && learningCutoff && learningCutoff > created) errors.push(issue("LEARNING_CUTOFF", learningPath, "Learning cutoff cannot be after creation."));
    if (learning.split_method !== "forward_time") errors.push(issue("LEARNING_SPLIT", `${learningPath}.split_method`, "Time-dependent learning requires forward_time split."));
    const refs = new Set(learning.outcome_refs ?? []);
    const allowed = learning.outcome_plane === "content_performance" ? contentIds : learning.outcome_plane === "market_calibration" ? marketIds : tradeIds;
    if (!subset(refs, allowed)) errors.push(issue("OUTCOME_PLANE_REF", `${learningPath}.outcome_refs`, "Outcome references cross or miss the declared outcome plane."));
    if (!/^sha256:[a-f0-9]{64}$/.test(String(learning.cohort_query_hash || ""))) errors.push(issue("COHORT_HASH", `${learningPath}.cohort_query_hash`, "Invalid cohort query hash."));
  }

  const objects = new Map([...receipts].map(([id, receipt]) => [id, receipt.status]));
  for (const [id, correction] of corrections) objects.set(id, correction.status);
  const eventsByObject = new Map();
  const eventIds = new Set();
  for (const [index, event] of sections.audit_events.entries()) {
    const eventPath = `$.audit_events[${index}]`;
    if (!isObject(event)) {
      errors.push(issue("EVENT_TYPE", eventPath, "Audit event must be an object."));
      continue;
    }
    if (eventIds.has(event.event_id)) errors.push(issue("DUPLICATE_EVENT", `${eventPath}.event_id`, "Duplicate event ID."));
    eventIds.add(event.event_id);
    const ref = event.object_ref;
    if (!objects.has(ref)) {
      errors.push(issue("UNKNOWN_EVENT_OBJECT", `${eventPath}.object_ref`, "Audit event object does not resolve."));
      continue;
    }
    const occurred = parseTime(event.occurred_at, `${eventPath}.occurred_at`, errors);
    if (occurred) eventsByObject.set(ref, [...(eventsByObject.get(ref) ?? []), [occurred, event, eventPath]]);
  }
  for (const [ref, currentState] of objects) {
    const events = (eventsByObject.get(ref) ?? []).sort((left, right) => left[0] - right[0]);
    if (!events.length) {
      errors.push(issue("OBJECT_EVENT_REQUIRED", `$object.${ref}`, "Receipt and correction require audit events."));
      continue;
    }
    let previous = null;
    for (const [, event, eventPath] of events) {
      if (event.from_state !== previous) errors.push(issue("EVENT_CHAIN", eventPath, `Expected from_state ${pyrepr(previous)}.`));
      if (ref.startsWith("REC_") && !(RECEIPT_TRANSITIONS.get(previous) ?? new Set()).has(event.to_state)) errors.push(issue("RECEIPT_TRANSITION", eventPath, `Invalid receipt transition ${pyrepr(previous)} -> ${pyrepr(event.to_state)}.`));
      previous = event.to_state;
    }
    if (previous !== currentState) errors.push(issue("EVENT_STATE_MISMATCH", `$object.${ref}`, "Folded event state does not match current state."));
  }

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
  const expectedCounts = {
    receipts: sections.publication_receipts.length, corrections: sections.corrections.length,
    invalidations: sections.artifact_invalidations.length, content_snapshots: sections.content_performance.length,
    market_outcomes: sections.market_outcomes.length, trade_reconciliations: sections.trade_reconciliations.length,
    learning_snapshots: sections.learning_snapshots.length,
  };
  if (JSON.stringify(quality.counts) !== JSON.stringify(expectedCounts)) errors.push(issue("COUNTS", "$.quality_report.counts", `Expected exact counts ${pyrepr(expectedCounts)}.`));
  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_content_history.mjs [-h] json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
