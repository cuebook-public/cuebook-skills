#!/usr/bin/env node
// Validate a high-density TradingView chart capture and its optional Frame bridge.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/tradingview-focused-capture-v1.schema.json", import.meta.url), "utf8"),
);

const BACKEND_LOCK_REF = /^(?:quote-lock|entry-lock):[A-Za-z0-9._:-]{8,}$/u;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const issue = (code, path, message) => ({ code, path, message });

export function validate(payload) {
  const errors = validateInstance(payload, SCHEMA);
  if (!isObject(payload)) return { valid: false, errors };

  const source = isObject(payload.source) ? payload.source : {};
  const focus = isObject(payload.focus) ? payload.focus : {};
  const quality = isObject(payload.quality) ? payload.quality : {};
  const rights = isObject(payload.rights) ? payload.rights : {};
  const bridge = isObject(payload.frame_bridge) ? payload.frame_bridge : {};
  const master = isObject(bridge.publication_master) ? bridge.publication_master : null;

  if (/^https?:\/\//iu.test(source.locator ?? "")) {
    errors.push(issue("CAPTURE_NOT_LOCAL", "$.source.locator", "A focused TradingView capture must remain on the local filesystem until publication."));
  }
  if (source.region !== "chart") {
    errors.push(issue("FULL_UI_CAPTURE", "$.source.region", "Use the chart region, never a full desktop or social wrapper capture."));
  }
  if (focus.initial_visible_range?.from >= focus.initial_visible_range?.to) {
    errors.push(issue("INITIAL_RANGE_ORDER", "$.focus.initial_visible_range", "Initial visible range must be chronological."));
  }
  if (focus.selected_visible_range?.from >= focus.selected_visible_range?.to) {
    errors.push(issue("SELECTED_RANGE_ORDER", "$.focus.selected_visible_range", "Selected visible range must be chronological."));
  }
  if (focus.mode === "latest_structure" && focus.visible_bar_count > 120) {
    errors.push(issue("LATEST_WINDOW_TOO_WIDE", "$.focus.visible_bar_count", "Latest-structure focus may show at most 120 bars; use an explicit creator window for more."));
  }
  const retained = new Set(focus.retained_targets ?? []);
  for (const target of ["latest_complete_bar", "price_axis", "time_context"]) {
    if (!retained.has(target)) errors.push(issue("REQUIRED_FOCUS_TARGET", "$.focus.retained_targets", `Focused chart must retain ${target}.`));
  }
  if (focus.mode === "named_levels" && !retained.has("named_decision_levels")) {
    errors.push(issue("NAMED_LEVELS_MISSING", "$.focus.retained_targets", "Named-level focus must retain the named decision levels."));
  }
  if (focus.window_changed) {
    if (focus.restore_mode === "not_changed") {
      errors.push(issue("FOCUS_RESTORE_MODE", "$.focus.restore_mode", "A changed viewport cannot use not_changed restore mode."));
    }
    if (focus.restore_mode === "restored" && !focus.restoration_verified) {
      errors.push(issue("FOCUS_RESTORE_UNVERIFIED", "$.focus.restoration_verified", "Restored viewport state must be verified."));
    }
    if (focus.restore_mode === "preserved_by_user" && !focus.preserve_confirmed) {
      errors.push(issue("FOCUS_PRESERVE_UNCONFIRMED", "$.focus.preserve_confirmed", "Keeping the focused viewport requires creator confirmation."));
    }
  } else if (focus.restore_mode !== "not_changed") {
    errors.push(issue("FOCUS_UNCHANGED_MODE", "$.focus.restore_mode", "An unchanged viewport must use not_changed restore mode."));
  }

  if (payload.state === "complete") {
    if (quality.output_width < 1244 || quality.output_height < 800) {
      errors.push(issue("FOCUS_RESOLUTION", "$.quality", "A complete focused capture needs at least 1244 x 800 source pixels."));
    }
    if (quality.chart_fill_ratio < 0.8) {
      errors.push(issue("LOW_INFORMATION_DENSITY", "$.quality.chart_fill_ratio", "The chart must occupy at least 80% of a complete focused capture."));
    }
    if (!(focus.latest_bar_x_ratio >= 0.55 && focus.latest_bar_x_ratio <= 0.9)) {
      errors.push(issue("LATEST_BAR_PLACEMENT", "$.focus.latest_bar_x_ratio", "Place the latest complete bar between 55% and 90% of image width."));
    }
    for (const [field, label] of [
      ["latest_bar_visible", "latest complete bar"],
      ["price_axis_visible", "price axis"],
      ["time_context_visible", "time context"],
      ["key_annotations_legible", "key annotations"],
      ["private_ui_absent", "the absence of private account or workspace UI"],
      ["reviewed", "native and target-size review"],
    ]) {
      if (!quality[field]) errors.push(issue("FOCUS_QUALITY", `$.quality.${field}`, `A complete focused capture must preserve ${label}.`));
    }
  }
  if (quality.non_uniform_scaling) {
    errors.push(issue("NON_UNIFORM_SCALING", "$.quality.non_uniform_scaling", "Never distort chart geometry by scaling axes independently."));
  }

  if (bridge.mode === "local_only") {
    if (rights.usage_scope !== "local_analysis_only" || rights.creator_confirmed_publication || bridge.finished_bitmap_audit_required || master) {
      errors.push(issue("LOCAL_SCOPE_MISMATCH", "$.frame_bridge", "Local-only capture cannot carry publication rights, confirmation, audit, or a publication master."));
    }
  }
  if (bridge.mode === "cuebook_native_rerender") {
    if (!(bridge.cuebook_result_refs?.length > 0) || bridge.finished_bitmap_audit_required || master) {
      errors.push(issue("NATIVE_RERENDER_CONTRACT", "$.frame_bridge", "Native rerender needs Cuebook result refs and no TradingView finished-bitmap master."));
    }
  }
  if (bridge.mode === "attributed_finished_bitmap") {
    if (source.method !== "tradingview_snapshot") {
      errors.push(issue("UNOFFICIAL_PUBLICATION_SOURCE", "$.source.method", "Frame pixels require an official TradingView snapshot, not a CDP chart capture."));
    }
    if (rights.usage_scope !== "attributed_publication" || !rights.creator_confirmed_publication) {
      errors.push(issue("PUBLICATION_RIGHTS", "$.rights", "Attributed snapshot publication requires the creator's explicit publication choice."));
    }
    if (!rights.tradingview_attribution_visible || rights.attribution_effective_px < 13) {
      errors.push(issue("TRADINGVIEW_ATTRIBUTION", "$.rights", "TradingView attribution must remain visible at 13 px or larger at final display size."));
    }
    if (rights.overlay_rights === "unknown") {
      errors.push(issue("UNKNOWN_OVERLAY_RIGHTS", "$.rights.overlay_rights", "Unknown creator or Pine overlay rights block snapshot pixel publication."));
    }
    if (!bridge.finished_bitmap_audit_required || !master) {
      errors.push(issue("FINISHED_BITMAP_REQUIRED", "$.frame_bridge", "Attributed snapshot publication requires one finished-bitmap audit and publication master."));
    } else {
      if (master.width !== 1866 || master.height !== 1200) {
        errors.push(issue("FRAME_DIMENSIONS", "$.frame_bridge.publication_master", "The publication master must be exactly 1866 x 1200."));
      }
      if (!master.cuebook_wordmark_visible) {
        errors.push(issue("CUEBOOK_WORDMARK", "$.frame_bridge.publication_master.cuebook_wordmark_visible", "The finished Frame master must retain the Cuebook wordmark."));
      }
      if (/^https?:\/\//iu.test(master.locator ?? "")) {
        errors.push(issue("MASTER_NOT_LOCAL", "$.frame_bridge.publication_master.locator", "Audit a local publication master before upload."));
      }
      if (quality.mutable_price_visible && !BACKEND_LOCK_REF.test(master.backend_price_lock_ref ?? "")) {
        errors.push(issue("MUTABLE_PRICE_LOCK", "$.frame_bridge.publication_master.backend_price_lock_ref", "A visible mutable price requires the matching Cuebook backend quote or entry lock."));
      }
      if (!quality.mutable_price_visible && master.backend_price_lock_ref !== null) {
        errors.push(issue("UNUSED_PRICE_LOCK", "$.frame_bridge.publication_master.backend_price_lock_ref", "Use null when no mutable price is visible."));
      }
    }
  }

  if (payload.state === "blocked" && bridge.mode === "attributed_finished_bitmap") {
    errors.push(issue("BLOCKED_PUBLICATION", "$.state", "A blocked focus capture cannot become an attributed finished bitmap."));
  }
  return { valid: errors.length === 0, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_tradingview_focused_capture.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
