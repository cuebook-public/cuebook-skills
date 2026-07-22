import test from "node:test";
import assert from "node:assert/strict";

import { validate, validatePolicy } from "../scripts/validate_tradingview_canvas_transfer.mjs";

function baseTransfer() {
  return {
    schema_version: "tradingview-canvas-transfer-v1",
    transfer_id: "TVXFER_BTC_LEVELS_001",
    state: "applied",
    requested_at: "2026-07-22T08:00:00Z",
    authorization: {
      confirmed: true,
      confirmed_at: "2026-07-22T08:01:00Z",
      scope: "drawings_only",
      confirmed_operation_refs: ["TVOP_SUPPORT_001"],
    },
    identity: {
      mapping_status: "exact",
      cuebook_asset_ref: "asset:btc",
      tradingview_symbol: "COINBASE:BTCUSD",
      venue: "COINBASE",
      currency: "USD",
      instrument_type: "spot_crypto",
      proxy_confirmed: false,
    },
    source: {
      meaning_lock_ref: "MLOCK_BTC_LEVELS_001",
      observation_ref: "TVOBS_BTC_LEVELS_001",
      cuebook_result_refs: ["RES_BTC_CANDLES_001"],
      creator_hypothesis_refs: ["TVFIND_BTC_SUPPORT_001"],
    },
    chart_target: {
      symbol: "COINBASE:BTCUSD",
      timeframe: "240",
      observation_cutoff_unix: 1784707200,
    },
    operations: [
      {
        operation_ref: "TVOP_SUPPORT_001",
        intent: "decision_level",
        shape: "horizontal_line",
        point: { time: 1784700000, price: 118500 },
        point2: null,
        text: null,
        style: {
          color: "#18B7A0",
          width: 2,
          dash: "solid",
          fill_color: null,
          fill_opacity: 0,
          text_color: null,
        },
        source_refs: ["MLOCK_BTC_LEVELS_001", "RES_BTC_CANDLES_001"],
        status: "applied",
        entity_id: "drawing-created-001",
      },
    ],
    tool_calls: [
      { call_ref: "TVCALL_HEALTH_001", tool: "tv_health_check", phase: "preflight", operation_ref: null, entity_id: null, status: "success" },
      { call_ref: "TVCALL_STATE_001", tool: "chart_get_state", phase: "preflight", operation_ref: null, entity_id: null, status: "success" },
      { call_ref: "TVCALL_LIST_BEFORE_001", tool: "draw_list", phase: "preflight", operation_ref: null, entity_id: null, status: "success" },
      { call_ref: "TVCALL_DRAW_001", tool: "draw_shape", phase: "apply", operation_ref: "TVOP_SUPPORT_001", entity_id: "drawing-created-001", status: "success" },
      { call_ref: "TVCALL_PROPS_001", tool: "draw_get_properties", phase: "verify", operation_ref: null, entity_id: "drawing-created-001", status: "success" },
      { call_ref: "TVCALL_LIST_AFTER_001", tool: "draw_list", phase: "verify", operation_ref: null, entity_id: null, status: "success" },
    ],
    inventory: {
      before_entity_ids: ["drawing-existing-001"],
      after_entity_ids: ["drawing-existing-001", "drawing-created-001"],
      created_entity_ids: ["drawing-created-001"],
      removed_entity_ids: [],
      verified: true,
    },
    session: {
      initial_state: { symbol: "COINBASE:BTCUSD", timeframe: "240", chart_type: "candles" },
      final_state: { symbol: "COINBASE:BTCUSD", timeframe: "240", chart_type: "candles" },
      changed: false,
      restore_mode: "not_changed",
      restoration_verified: false,
      preserve_confirmed: false,
    },
    local_artifacts: [],
    frame_bridge: {
      mode: "cuebook_rerender",
      direct_pixel_reuse_allowed: false,
      raw_data_reuse_allowed: false,
      cuebook_result_refs: ["RES_BTC_CANDLES_001"],
      warnings: ["TradingView pixels and raw data remain local; Cuebook rerenders the adopted geometry."],
    },
    warnings: [],
  };
}

test("the canvas policy keeps only the bounded drawing lifecycle", () => {
  assert.deepEqual(validatePolicy(), { valid: true, errors: [] });
});

test("a confirmed Cuebook level can be drawn and verified", () => {
  assert.deepEqual(validate(baseTransfer()), { valid: true, errors: [] });
});

test("an unconfirmed plan cannot mutate the TradingView chart", () => {
  const item = baseTransfer();
  item.authorization.confirmed = false;
  item.authorization.confirmed_at = null;
  item.authorization.confirmed_operation_refs = [];
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "WRITE_WITHOUT_CONFIRMATION"));
  assert.ok(result.errors.some((error) => error.code === "DRAW_CALL_WITHOUT_CONFIRMATION"));
});

test("draw_clear and arbitrary persistent account changes stay blocked", () => {
  const item = baseTransfer();
  item.tool_calls.splice(5, 0, {
    call_ref: "TVCALL_CLEAR_001",
    tool: "draw_clear",
    phase: "cleanup",
    operation_ref: null,
    entity_id: null,
    status: "success",
  });
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "TOOL_BLOCKED_FROM_CANVAS"));
});

test("cleanup can never remove a drawing that predated the transfer", () => {
  const item = baseTransfer();
  item.inventory.removed_entity_ids = ["drawing-existing-001"];
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "FOREIGN_ENTITY_REMOVAL"));
});

test("every mutation is bracketed by a before and after inventory", () => {
  const item = baseTransfer();
  item.tool_calls = item.tool_calls.filter((call) => call.call_ref !== "TVCALL_LIST_AFTER_001");
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "MISSING_DRAWING_VERIFICATION"));
});

test("future-dated price paths are not smuggled in as historical geometry", () => {
  const item = baseTransfer();
  item.operations[0].intent = "historical_trend_segment";
  item.operations[0].shape = "trend_line";
  item.operations[0].point2 = { time: 1784793600, price: 125000 };
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "FUTURE_PRICE_PATH"));
});

test("a proxy must remain an explicit creator choice", () => {
  const item = baseTransfer();
  item.identity.mapping_status = "user_confirmed_proxy";
  item.identity.proxy_confirmed = false;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "UNCONFIRMED_PROXY"));
});

test("TradingView screenshots remain local and cannot become Frame pixels", () => {
  const item = baseTransfer();
  item.tool_calls.push({
    call_ref: "TVCALL_CAPTURE_001",
    tool: "capture_screenshot",
    phase: "local_artifact",
    operation_ref: null,
    entity_id: null,
    status: "success",
  });
  item.local_artifacts.push({
    artifact_ref: "TVART_CAPTURE_001",
    kind: "chart_screenshot",
    locator: "https://example.com/tradingview.png",
    source_call_ref: "TVCALL_CAPTURE_001",
    focus_capture_ref: "TVFOCUS_BTC_LEVELS_001",
    usage_rights: "local_analysis_only",
  });
  item.frame_bridge.direct_pixel_reuse_allowed = true;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "ARTIFACT_NOT_LOCAL"));
  assert.ok(result.errors.some((error) => error.path === "$.frame_bridge.direct_pixel_reuse_allowed"));
});

test("canvas screenshots use the same focused-capture quality contract", () => {
  const item = baseTransfer();
  item.tool_calls.push({
    call_ref: "TVCALL_CAPTURE_001",
    tool: "capture_screenshot",
    phase: "local_artifact",
    operation_ref: null,
    entity_id: null,
    status: "success",
  });
  item.local_artifacts.push({
    artifact_ref: "TVART_CAPTURE_001",
    kind: "chart_screenshot",
    locator: "/tmp/tradingview.png",
    source_call_ref: "TVCALL_CAPTURE_001",
    focus_capture_ref: "bad-focus-ref",
    usage_rights: "local_analysis_only",
  });
  assert.ok(validate(item).errors.some((error) => error.code === "FOCUS_CAPTURE_REQUIRED"));
});

test("rollback removes only entities created by this transfer", () => {
  const item = baseTransfer();
  item.state = "rolled_back";
  item.operations[0].status = "removed";
  item.tool_calls.splice(5, 0, {
    call_ref: "TVCALL_REMOVE_001",
    tool: "draw_remove_one",
    phase: "cleanup",
    operation_ref: null,
    entity_id: "drawing-created-001",
    status: "success",
  });
  item.inventory.after_entity_ids = ["drawing-existing-001"];
  item.inventory.removed_entity_ids = ["drawing-created-001"];
  assert.deepEqual(validate(item), { valid: true, errors: [] });
});

test("a prepared plan may be shown without touching the chart", () => {
  const item = baseTransfer();
  item.state = "prepared";
  item.authorization.confirmed = false;
  item.authorization.confirmed_at = null;
  item.authorization.confirmed_operation_refs = [];
  item.operations[0].status = "planned";
  item.operations[0].entity_id = null;
  item.tool_calls = [];
  item.inventory = {
    before_entity_ids: [],
    after_entity_ids: [],
    created_entity_ids: [],
    removed_entity_ids: [],
    verified: false,
  };
  assert.deepEqual(validate(item), { valid: true, errors: [] });
});

test("staged chart state must be restored or explicitly preserved", () => {
  const item = baseTransfer();
  item.tool_calls.splice(3, 0, {
    call_ref: "TVCALL_STAGE_001",
    tool: "chart_set_timeframe",
    phase: "stage",
    operation_ref: null,
    entity_id: null,
    status: "success",
  });
  item.session.changed = true;
  item.session.restore_mode = "restored";
  item.session.restoration_verified = false;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "RESTORE_NOT_VERIFIED"));
});
