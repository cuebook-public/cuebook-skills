#!/usr/bin/env node
// Validate an explicitly authorized Cuebook-to-TradingView drawing transfer.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/tradingview-canvas-transfer-v1.schema.json", import.meta.url), "utf8"),
);
const POLICY = JSON.parse(
  readFileSync(new URL("../references/tradingview-canvas-tool-policy-v1.json", import.meta.url), "utf8"),
);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asArray = (value) => Array.isArray(value) ? value : [];

export function issue(code, path, message) {
  return { code, path, message };
}

function sameSet(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function allowedToolPhases(policy = POLICY) {
  const phases = new Map();
  for (const [phase, tools] of Object.entries(policy.allowed_tools ?? {})) {
    for (const tool of tools ?? []) {
      const toolPhases = phases.get(tool) ?? new Set();
      toolPhases.add(phase);
      phases.set(tool, toolPhases);
    }
  }
  return phases;
}

export function validatePolicy(policy = POLICY) {
  const errors = [];
  const phases = allowedToolPhases(policy);
  const blocked = new Set(policy.explicitly_blocked_tools ?? []);
  for (const tool of phases.keys()) {
    if (blocked.has(tool)) {
      errors.push(issue("POLICY_TOOL_CONFLICT", "$.explicitly_blocked_tools", `${tool} cannot be both allowed and blocked.`));
    }
  }
  const expected = {
    preflight: ["chart_get_state", "draw_list", "tv_health_check"],
    stage: ["chart_set_symbol", "chart_set_timeframe"],
    apply: ["draw_shape"],
    verify: ["draw_get_properties", "draw_list"],
    cleanup: ["draw_remove_one"],
    local_artifact: ["capture_screenshot"],
  };
  for (const [phase, tools] of Object.entries(expected)) {
    if (!sameSet(policy.allowed_tools?.[phase] ?? [], tools)) {
      errors.push(issue("POLICY_ALLOWED_TOOLS", `$.allowed_tools.${phase}`, `${phase} must keep the audited bounded Tool set.`));
    }
  }
  for (const required of ["draw_clear", "ui_evaluate", "pine_set_source", "replay_trade", "watchlist_add"]) {
    if (!blocked.has(required)) errors.push(issue("POLICY_MISSING_BLOCK", "$.explicitly_blocked_tools", `${required} must stay blocked.`));
  }
  const lifecycle = policy.lifecycle ?? {};
  for (const key of [
    "creator_confirmation_required_before_draw",
    "snapshot_existing_entity_ids",
    "record_every_created_entity_id",
    "cleanup_only_created_entity_ids",
    "restore_staged_chart_state",
  ]) {
    if (lifecycle[key] !== true) errors.push(issue("POLICY_LIFECYCLE", `$.lifecycle.${key}`, `${key} must stay enabled.`));
  }
  for (const key of ["clear_all_allowed", "direct_frame_pixel_reuse_allowed"]) {
    if (lifecycle[key] !== false) errors.push(issue("POLICY_LIFECYCLE", `$.lifecycle.${key}`, `${key} must stay disabled.`));
  }
  return { valid: !errors.length, errors };
}

export function validate(payload) {
  const errors = validateInstance(payload, SCHEMA);
  if (!isObject(payload)) return { valid: false, errors };
  errors.push(...validatePolicy().errors);

  const operations = asArray(payload.operations);
  const operationRefs = new Set();
  const operationsByRef = new Map();
  const source = isObject(payload.source) ? payload.source : {};
  const sourceRefs = new Set([
    source.meaning_lock_ref,
    source.observation_ref,
    ...asArray(source.cuebook_result_refs),
    ...asArray(source.creator_hypothesis_refs),
  ].filter(Boolean));
  const intentShape = {
    decision_level: "horizontal_line",
    decision_zone: "rectangle",
    time_marker: "vertical_line",
    annotation: "text",
    historical_trend_segment: "trend_line",
  };

  operations.forEach((operation, index) => {
    if (!isObject(operation)) return;
    const path = `$.operations[${index}]`;
    if (operationRefs.has(operation.operation_ref)) {
      errors.push(issue("DUPLICATE_OPERATION_REF", `${path}.operation_ref`, "Drawing operation refs must be unique."));
    }
    operationRefs.add(operation.operation_ref);
    operationsByRef.set(operation.operation_ref, operation);
    if (intentShape[operation.intent] !== operation.shape) {
      errors.push(issue("INTENT_SHAPE_MISMATCH", `${path}.shape`, `${operation.intent} must use ${intentShape[operation.intent]}.`));
    }
    const needsSecondPoint = ["rectangle", "trend_line"].includes(operation.shape);
    if (needsSecondPoint !== isObject(operation.point2)) {
      errors.push(issue("DRAWING_POINT_COUNT", `${path}.point2`, `${operation.shape} ${needsSecondPoint ? "requires" : "must not include"} a second point.`));
    }
    if (operation.shape === "text") {
      if (!(typeof operation.text === "string" && operation.text.trim())) {
        errors.push(issue("DRAWING_TEXT_REQUIRED", `${path}.text`, "A text annotation requires non-empty creator-confirmed copy."));
      }
    } else if (operation.text !== null) {
      errors.push(issue("DRAWING_TEXT_UNEXPECTED", `${path}.text`, "Only a text annotation may carry text."));
    }
    if (operation.intent === "historical_trend_segment") {
      const cutoff = payload.chart_target?.observation_cutoff_unix;
      if (operation.point?.time > cutoff || operation.point2?.time > cutoff) {
        errors.push(issue("FUTURE_PRICE_PATH", `${path}.point2`, "A trend segment may only connect observations at or before the viewpoint cutoff."));
      }
    }
    for (const ref of asArray(operation.source_refs)) {
      if (!sourceRefs.has(ref)) errors.push(issue("UNKNOWN_OPERATION_SOURCE", `${path}.source_refs`, `Unknown source ref: ${ref}.`));
    }
    const hasEntity = typeof operation.entity_id === "string" && operation.entity_id.length > 0;
    if (["applied", "removed"].includes(operation.status) && !hasEntity) {
      errors.push(issue("MISSING_OPERATION_ENTITY", `${path}.entity_id`, `${operation.status} operations must retain their created entity id.`));
    }
    if (["planned", "failed"].includes(operation.status) && operation.entity_id !== null) {
      errors.push(issue("UNEXPECTED_OPERATION_ENTITY", `${path}.entity_id`, `${operation.status} operations cannot claim a created entity id.`));
    }
  });

  const authorization = isObject(payload.authorization) ? payload.authorization : {};
  const confirmedRefs = asArray(authorization.confirmed_operation_refs);
  if (authorization.confirmed) {
    if (!authorization.confirmed_at) errors.push(issue("CONFIRMATION_TIME", "$.authorization.confirmed_at", "A confirmed drawing plan requires its confirmation time."));
    if (!sameSet(confirmedRefs, [...operationRefs])) {
      errors.push(issue("CONFIRMATION_SCOPE", "$.authorization.confirmed_operation_refs", "Confirmation must cover the exact drawing plan."));
    }
  } else if (authorization.confirmed_at !== null || confirmedRefs.length) {
    errors.push(issue("UNCONFIRMED_SCOPE", "$.authorization", "An unconfirmed plan cannot carry a confirmation time or confirmed operation refs."));
  }

  const identity = isObject(payload.identity) ? payload.identity : {};
  if (identity.mapping_status === "exact") {
    if (!identity.cuebook_asset_ref || !identity.tradingview_symbol) {
      errors.push(issue("EXACT_IDENTITY", "$.identity", "An exact transfer requires Cuebook and TradingView asset refs."));
    }
    if (identity.proxy_confirmed) errors.push(issue("EXACT_PROXY_FLAG", "$.identity.proxy_confirmed", "An exact mapping is not a proxy."));
  }
  if (identity.mapping_status === "user_confirmed_proxy" && !identity.proxy_confirmed) {
    errors.push(issue("UNCONFIRMED_PROXY", "$.identity.proxy_confirmed", "A proxy mapping requires explicit creator confirmation."));
  }

  const effectStates = new Set(["applied", "partial", "rolled_back"]);
  if (effectStates.has(payload.state)) {
    if (!authorization.confirmed) errors.push(issue("WRITE_WITHOUT_CONFIRMATION", "$.authorization.confirmed", "TradingView drawings require explicit confirmation of the exact plan."));
    if (!["exact", "user_confirmed_proxy"].includes(identity.mapping_status)) {
      errors.push(issue("WRITE_WITHOUT_IDENTITY", "$.identity.mapping_status", "TradingView drawings require an exact or creator-confirmed proxy identity."));
    }
    if (!operations.length) errors.push(issue("EMPTY_TRANSFER", "$.operations", "An executed transfer requires at least one drawing operation."));
  }

  const inventory = isObject(payload.inventory) ? payload.inventory : {};
  const before = new Set(asArray(inventory.before_entity_ids));
  const after = new Set(asArray(inventory.after_entity_ids));
  const created = new Set(asArray(inventory.created_entity_ids));
  const removed = new Set(asArray(inventory.removed_entity_ids));
  for (const entityId of created) {
    if (before.has(entityId)) errors.push(issue("CREATED_ENTITY_COLLISION", "$.inventory.created_entity_ids", `Created entity already existed: ${entityId}.`));
  }
  for (const entityId of removed) {
    if (!created.has(entityId)) errors.push(issue("FOREIGN_ENTITY_REMOVAL", "$.inventory.removed_entity_ids", `Cleanup may only remove an entity created by this transfer: ${entityId}.`));
  }
  const operationEntities = operations
    .filter((operation) => ["applied", "removed"].includes(operation?.status))
    .map((operation) => operation.entity_id);
  if (!sameSet(operationEntities, [...created])) {
    errors.push(issue("CREATED_ENTITY_LINEAGE", "$.inventory.created_entity_ids", "Created entity ids must exactly match applied or removed operations."));
  }
  if (effectStates.has(payload.state)) {
    if (!inventory.verified) errors.push(issue("UNVERIFIED_DRAWING_INVENTORY", "$.inventory.verified", "Executed transfers require a verified post-write drawing inventory."));
    const expectedAfter = new Set([...before, ...created]);
    for (const entityId of removed) expectedAfter.delete(entityId);
    if (!sameSet([...after], [...expectedAfter])) {
      errors.push(issue("DRAWING_INVENTORY_DRIFT", "$.inventory.after_entity_ids", "Post-write inventory must preserve prior drawings and add only surviving transfer entities."));
    }
  }

  const toolPhases = allowedToolPhases();
  const toolCalls = asArray(payload.tool_calls);
  const callRefs = new Set();
  const successfulCalls = [];
  toolCalls.forEach((call, index) => {
    if (!isObject(call)) return;
    const path = `$.tool_calls[${index}]`;
    if (callRefs.has(call.call_ref)) errors.push(issue("DUPLICATE_CALL_REF", `${path}.call_ref`, "Tool call refs must be unique."));
    callRefs.add(call.call_ref);
    const phases = toolPhases.get(call.tool);
    if (!phases) {
      errors.push(issue("TOOL_BLOCKED_FROM_CANVAS", `${path}.tool`, `${call.tool} is not callable from the Cuebook canvas bridge.`));
    } else if (!phases.has(call.phase)) {
      errors.push(issue("TOOL_PHASE", `${path}.phase`, `${call.tool} is not allowed in ${call.phase}.`));
    }
    if (call.operation_ref !== null && !operationRefs.has(call.operation_ref)) {
      errors.push(issue("UNKNOWN_CALL_OPERATION", `${path}.operation_ref`, `Unknown operation ref: ${call.operation_ref}.`));
    }
    if (call.tool === "draw_shape") {
      if (!call.operation_ref) errors.push(issue("DRAW_CALL_WITHOUT_OPERATION", `${path}.operation_ref`, "draw_shape must bind to one confirmed operation."));
      if (!authorization.confirmed && call.status === "success") errors.push(issue("DRAW_CALL_WITHOUT_CONFIRMATION", path, "A successful draw_shape call requires creator confirmation."));
      const operation = operationsByRef.get(call.operation_ref);
      if (call.status === "success" && call.entity_id !== operation?.entity_id) {
        errors.push(issue("DRAW_CALL_ENTITY", `${path}.entity_id`, "draw_shape must return the entity id recorded by its operation."));
      }
    } else if (call.operation_ref !== null) {
      errors.push(issue("UNEXPECTED_CALL_OPERATION", `${path}.operation_ref`, "Only draw_shape calls bind to an operation ref."));
    }
    if (call.tool === "draw_remove_one" && call.status === "success" && !created.has(call.entity_id)) {
      errors.push(issue("FOREIGN_CLEANUP_CALL", `${path}.entity_id`, "draw_remove_one may only target an entity created by this transfer."));
    }
    if (call.tool === "draw_get_properties" && call.entity_id && !created.has(call.entity_id)) {
      errors.push(issue("FOREIGN_VERIFY_CALL", `${path}.entity_id`, "Canvas verification is limited to entities created by this transfer."));
    }
    if (["chart_set_symbol", "chart_set_timeframe"].includes(call.tool) && call.status === "success" && !authorization.confirmed) {
      errors.push(issue("STAGE_WITHOUT_CONFIRMATION", path, "Do not stage the creator's chart before the transfer is confirmed."));
    }
    if (call.status === "success") successfulCalls.push({ ...call, index });
  });

  operations.forEach((operation, index) => {
    if (!isObject(operation)) return;
    const drawCalls = successfulCalls.filter((call) => call.tool === "draw_shape" && call.operation_ref === operation.operation_ref);
    if (["applied", "removed"].includes(operation.status) && drawCalls.length !== 1) {
      errors.push(issue("DRAW_CALL_LINEAGE", `$.operations[${index}]`, "Each created operation requires exactly one successful draw_shape call."));
    }
  });

  if (effectStates.has(payload.state)) {
    for (const required of ["tv_health_check", "chart_get_state"]) {
      if (!successfulCalls.some((call) => call.tool === required && call.phase === "preflight")) {
        errors.push(issue("MISSING_PREFLIGHT", "$.tool_calls", `Executed transfers require a successful ${required} preflight.`));
      }
    }
    const firstDraw = successfulCalls.find((call) => call.tool === "draw_shape")?.index ?? Number.POSITIVE_INFINITY;
    const preflightList = successfulCalls.find((call) => call.tool === "draw_list" && call.phase === "preflight" && call.index < firstDraw);
    const lastMutation = Math.max(-1, ...successfulCalls.filter((call) => ["draw_shape", "draw_remove_one"].includes(call.tool)).map((call) => call.index));
    const finalList = successfulCalls.find((call) => call.tool === "draw_list" && call.phase === "verify" && call.index > lastMutation);
    if (!preflightList) errors.push(issue("MISSING_DRAWING_SNAPSHOT", "$.tool_calls", "Snapshot existing drawings before the first draw_shape call."));
    if (!finalList) errors.push(issue("MISSING_DRAWING_VERIFICATION", "$.tool_calls", "Verify the drawing inventory after the last mutation."));
  }

  const session = isObject(payload.session) ? payload.session : {};
  const staged = successfulCalls.some((call) => ["chart_set_symbol", "chart_set_timeframe"].includes(call.tool));
  if (staged && !session.changed) errors.push(issue("STAGE_WITHOUT_SESSION_CHANGE", "$.session.changed", "Successful chart staging must record a changed session."));
  if (session.restore_mode === "restored" && !session.restoration_verified) {
    errors.push(issue("RESTORE_NOT_VERIFIED", "$.session.restoration_verified", "Restored chart state must be verified."));
  }
  if (session.restore_mode === "preserved_by_user" && !session.preserve_confirmed) {
    errors.push(issue("PRESERVE_NOT_CONFIRMED", "$.session.preserve_confirmed", "Keeping the staged chart requires creator confirmation."));
  }
  if (session.restore_mode === "not_changed" && session.changed) {
    errors.push(issue("RESTORE_MODE_MISMATCH", "$.session.restore_mode", "A changed chart session cannot use not_changed."));
  }

  const artifacts = asArray(payload.local_artifacts);
  artifacts.forEach((artifact, index) => {
    if (!isObject(artifact)) return;
    const sourceCall = toolCalls.find((call) => call.call_ref === artifact.source_call_ref);
    if (sourceCall?.tool !== "capture_screenshot" || sourceCall?.status !== "success") {
      errors.push(issue("ARTIFACT_SOURCE_CALL", `$.local_artifacts[${index}].source_call_ref`, "A local chart artifact requires a successful capture_screenshot call."));
    }
    if (/^https?:\/\//iu.test(artifact.locator ?? "")) {
      errors.push(issue("ARTIFACT_NOT_LOCAL", `$.local_artifacts[${index}].locator`, "TradingView screenshots must remain local artifacts."));
    }
    if (!/^TVFOCUS_[A-Za-z0-9_-]+$/u.test(artifact.focus_capture_ref ?? "")) {
      errors.push(issue("FOCUS_CAPTURE_REQUIRED", `$.local_artifacts[${index}].focus_capture_ref`, "A canvas screenshot requires a validated focused-capture record."));
    }
  });

  const bridge = isObject(payload.frame_bridge) ? payload.frame_bridge : {};
  if (bridge.mode === "cuebook_rerender") {
    if (!asArray(bridge.cuebook_result_refs).length) {
      errors.push(issue("RERENDER_WITHOUT_CUEBOOK_SOURCE", "$.frame_bridge.cuebook_result_refs", "A Frame rerender requires independently retrieved Cuebook results."));
    }
    for (const ref of asArray(bridge.cuebook_result_refs)) {
      if (!asArray(source.cuebook_result_refs).includes(ref)) {
        errors.push(issue("UNKNOWN_FRAME_SOURCE", "$.frame_bridge.cuebook_result_refs", `Frame source is not registered on the transfer: ${ref}.`));
      }
    }
    if (!asArray(bridge.warnings).length) errors.push(issue("RERENDER_WITHOUT_WARNING", "$.frame_bridge.warnings", "Explain that TradingView pixels and raw data stay outside the Frame."));
  } else if (asArray(bridge.cuebook_result_refs).length) {
    errors.push(issue("UNUSED_FRAME_SOURCE", "$.frame_bridge.cuebook_result_refs", "Frame source refs require cuebook_rerender mode."));
  }

  if (payload.state === "prepared" && operations.some((operation) => operation?.status !== "planned")) {
    errors.push(issue("PREPARED_WITH_EFFECTS", "$.operations", "A prepared transfer may contain only planned operations."));
  }
  if (payload.state === "applied" && operations.some((operation) => operation?.status !== "applied")) {
    errors.push(issue("APPLIED_WITH_INCOMPLETE_OPERATION", "$.operations", "An applied transfer requires every operation to be applied."));
  }
  if (payload.state === "partial" && !toolCalls.some((call) => ["failed", "unavailable"].includes(call?.status))) {
    errors.push(issue("PARTIAL_WITHOUT_FAILURE", "$.tool_calls", "A partial transfer must retain the failed or unavailable call."));
  }
  if (payload.state === "rolled_back") {
    if (operations.some((operation) => operation?.status !== "removed")) errors.push(issue("ROLLBACK_INCOMPLETE", "$.operations", "A rolled-back transfer requires every created operation to be removed."));
    if (!sameSet([...before], [...after])) errors.push(issue("ROLLBACK_INVENTORY", "$.inventory.after_entity_ids", "A rollback must restore the original drawing inventory."));
  }
  if (payload.state === "blocked") {
    if (successfulCalls.some((call) => ["stage", "apply", "cleanup"].includes(call.phase))) {
      errors.push(issue("BLOCKED_WITH_SIDE_EFFECT", "$.tool_calls", "A blocked transfer cannot retain a successful side effect."));
    }
    if (created.size || removed.size) errors.push(issue("BLOCKED_WITH_ENTITIES", "$.inventory", "A blocked transfer cannot claim created or removed drawings."));
  }

  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_tradingview_canvas_transfer.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
