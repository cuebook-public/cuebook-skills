import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_tradingview_focused_capture.mjs";

function focusedCapture() {
  return {
    schema_version: "tradingview-focused-capture-v1",
    capture_id: "TVFOCUS_spcx_4h",
    state: "complete",
    observation_ref: "TVOBS_spcx_4h",
    captured_at: "2026-07-22T10:00:00+08:00",
    source: {
      call_ref: "TVCALL_spcx_shot",
      method: "cdp_chart",
      region: "chart",
      locator: "/tmp/tradingview-spcx-focused.png",
      width: 1600,
      height: 1030,
      timeframe: "240",
      latest_complete_bar_at: "2026-07-22T08:00:00+08:00"
    },
    focus: {
      mode: "latest_structure",
      initial_visible_range: {from: 1779408000, to: 1784685600},
      selected_visible_range: {from: 1782096000, to: 1784685600},
      visible_bar_count: 72,
      reference_anchor: {kind: "swing_high", at: "2026-06-22T08:00:00+08:00", label: "Reference peak before the current structure"},
      retained_targets: ["latest_complete_bar", "price_axis", "time_context", "named_decision_levels", "relevant_swing_anchor"],
      excluded_surfaces: ["profile_header", "post_copy", "blank_margin", "position_card", "toolbar", "irrelevant_history"],
      latest_bar_x_ratio: 0.82,
      window_changed: true,
      restore_mode: "restored",
      restoration_verified: true,
      preserve_confirmed: false
    },
    quality: {
      output_width: 1600,
      output_height: 1030,
      chart_fill_ratio: 0.94,
      latest_bar_visible: true,
      price_axis_visible: true,
      time_context_visible: true,
      key_annotations_legible: true,
      private_ui_absent: true,
      mutable_price_visible: true,
      non_uniform_scaling: false,
      reviewed: true
    },
    rights: {
      usage_scope: "local_analysis_only",
      tradingview_attribution_visible: false,
      attribution_effective_px: null,
      overlay_rights: "unknown",
      creator_confirmed_publication: false
    },
    frame_bridge: {
      mode: "local_only",
      direct_raw_upload_allowed: false,
      cuebook_result_refs: [],
      finished_bitmap_audit_required: false,
      publication_master: null
    },
    warnings: []
  };
}

function codes(payload) {
  return new Set(validate(payload).errors.map((error) => error.code));
}

function attributedSnapshot() {
  const item = focusedCapture();
  item.source.method = "tradingview_snapshot";
  item.source.width = 1866;
  item.source.height = 1200;
  item.quality.output_width = 1866;
  item.quality.output_height = 1200;
  item.rights = {
    usage_scope: "attributed_publication",
    tradingview_attribution_visible: true,
    attribution_effective_px: 14,
    overlay_rights: "creator_owned",
    creator_confirmed_publication: true
  };
  item.frame_bridge = {
    mode: "attributed_finished_bitmap",
    direct_raw_upload_allowed: false,
    cuebook_result_refs: ["RES_spcx_quote_lock"],
    finished_bitmap_audit_required: true,
    publication_master: {
      locator: "/tmp/spcx-frame-publication.png",
      width: 1866,
      height: 1200,
      cuebook_wordmark_visible: true,
      backend_price_lock_ref: "quote-lock:spcx-20260722-1000"
    }
  };
  return item;
}

test("a high-density latest-structure chart capture is valid", () => {
  assert.deepEqual(validate(focusedCapture()), {valid: true, errors: []});
});

test("a full UI capture cannot masquerade as a focused chart", () => {
  const item = focusedCapture();
  item.source.region = "full";
  assert.ok(codes(item).has("FULL_UI_CAPTURE"));
});

test("small or whitespace-heavy captures fail information density", () => {
  const item = focusedCapture();
  item.quality.output_width = 586;
  item.quality.output_height = 456;
  item.quality.chart_fill_ratio = 0.34;
  assert.ok(codes(item).has("FOCUS_RESOLUTION"));
  assert.ok(codes(item).has("LOW_INFORMATION_DENSITY"));
});

test("latest structure stays near the decision edge without clipping the scale", () => {
  const item = focusedCapture();
  item.focus.latest_bar_x_ratio = 0.98;
  item.quality.price_axis_visible = false;
  assert.ok(codes(item).has("LATEST_BAR_PLACEMENT"));
  assert.ok(codes(item).has("FOCUS_QUALITY"));
});

test("latest focus is bounded unless the creator selects a wider window", () => {
  const item = focusedCapture();
  item.focus.visible_bar_count = 180;
  assert.ok(codes(item).has("LATEST_WINDOW_TOO_WIDE"));
  item.focus.mode = "creator_window";
  assert.equal(codes(item).has("LATEST_WINDOW_TOO_WIDE"), false);
});

test("viewport staging must restore or remain by explicit creator choice", () => {
  const item = focusedCapture();
  item.focus.restoration_verified = false;
  assert.ok(codes(item).has("FOCUS_RESTORE_UNVERIFIED"));
});

test("chart geometry cannot be stretched to fill the Frame", () => {
  const item = focusedCapture();
  item.quality.non_uniform_scaling = true;
  assert.ok(codes(item).has("NON_UNIFORM_SCALING"));
});

test("an official attributed snapshot can enter the audited finished-bitmap path", () => {
  assert.deepEqual(validate(attributedSnapshot()), {valid: true, errors: []});
});

test("private account or workspace UI blocks a complete focused capture", () => {
  const item = attributedSnapshot();
  item.quality.private_ui_absent = false;
  assert.ok(codes(item).has("FOCUS_QUALITY"));
});

test("a CDP screenshot cannot enter Frame pixel publication", () => {
  const item = attributedSnapshot();
  item.source.method = "cdp_chart";
  assert.ok(codes(item).has("UNOFFICIAL_PUBLICATION_SOURCE"));
});

test("cropped attribution or unknown third-party overlays block publication", () => {
  const item = attributedSnapshot();
  item.rights.tradingview_attribution_visible = false;
  item.rights.attribution_effective_px = 8;
  item.rights.overlay_rights = "unknown";
  assert.ok(codes(item).has("TRADINGVIEW_ATTRIBUTION"));
  assert.ok(codes(item).has("UNKNOWN_OVERLAY_RIGHTS"));
});

test("a visible snapshot price requires a Cuebook backend lock", () => {
  const item = attributedSnapshot();
  item.frame_bridge.publication_master.backend_price_lock_ref = null;
  assert.ok(codes(item).has("MUTABLE_PRICE_LOCK"));
});

test("native rerender needs independent Cuebook results and no screenshot master", () => {
  const item = focusedCapture();
  item.frame_bridge.mode = "cuebook_native_rerender";
  assert.ok(codes(item).has("NATIVE_RERENDER_CONTRACT"));
  item.frame_bridge.cuebook_result_refs = ["RES_spcx_candles"];
  assert.deepEqual(validate(item), {valid: true, errors: []});
});
