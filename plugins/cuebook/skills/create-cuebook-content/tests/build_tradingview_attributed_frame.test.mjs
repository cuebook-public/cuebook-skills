import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { runAttributedSnapshotFrame } from "../scripts/build_tradingview_attributed_frame.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function writePng(file, width, height, variant = 1) {
  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (rowBytes + 1);
    raw[start] = 0;
    raw.fill(32 + variant, start + 1, start + 1 + rowBytes);
    const painted = Math.max(1, Math.ceil(width * 0.02));
    for (let x = 0; x < painted; x += 1) {
      const pixel = start + 1 + x * 3;
      raw[pixel] = 236;
      raw[pixel + 1] = 190;
      raw[pixel + 2] = 34;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

function focusedCapture(width = 1244, height = 800) {
  return {
    schema_version: "tradingview-focused-capture-v1",
    capture_id: "TVFOCUS_spcx_frame",
    state: "complete",
    observation_ref: "TVOBS_spcx_frame",
    captured_at: "2026-07-22T10:00:00+08:00",
    source: {
      call_ref: "TVCALL_spcx_snapshot",
      method: "tradingview_snapshot",
      region: "chart",
      locator: "snapshot.png",
      width,
      height,
      timeframe: "240",
      latest_complete_bar_at: "2026-07-22T08:00:00+08:00",
    },
    focus: {
      mode: "latest_structure",
      initial_visible_range: { from: 1779408000, to: 1784685600 },
      selected_visible_range: { from: 1782096000, to: 1784685600 },
      visible_bar_count: 72,
      reference_anchor: { kind: "swing_high", at: "2026-06-22T08:00:00+08:00", label: "Reference peak" },
      retained_targets: ["latest_complete_bar", "price_axis", "time_context", "named_decision_levels", "tradingview_attribution"],
      excluded_surfaces: ["profile_header", "post_copy", "blank_margin", "position_card", "toolbar", "side_panel", "irrelevant_history"],
      latest_bar_x_ratio: 0.82,
      window_changed: true,
      restore_mode: "restored",
      restoration_verified: true,
      preserve_confirmed: false,
    },
    quality: {
      output_width: width,
      output_height: height,
      chart_fill_ratio: 0.96,
      latest_bar_visible: true,
      price_axis_visible: true,
      time_context_visible: true,
      key_annotations_legible: true,
      private_ui_absent: true,
      mutable_price_visible: false,
      non_uniform_scaling: false,
      reviewed: true,
    },
    rights: {
      usage_scope: "attributed_publication",
      tradingview_attribution_visible: true,
      attribution_effective_px: 14,
      overlay_rights: "creator_owned",
      creator_confirmed_publication: true,
    },
    frame_bridge: {
      mode: "attributed_finished_bitmap",
      direct_raw_upload_allowed: false,
      cuebook_result_refs: [],
      finished_bitmap_audit_required: true,
      publication_master: {
        locator: "selected/publication.png",
        width: 1866,
        height: 1200,
        cuebook_wordmark_visible: true,
        backend_price_lock_ref: null,
      },
    },
    warnings: [],
  };
}

function job() {
  return {
    schema_version: "tradingview-attributed-frame-job-v1",
    focused_capture_ref: "focus.json",
    snapshot_ref: "snapshot.png",
    theme: "dark",
    audited_at: "2026-07-22T10:05:00.000Z",
    image_review: {
      reviewer: "model",
      reviewed_at: "2026-07-22T10:05:00.000Z",
      legibility: "pass",
      collision: "pass",
      imagery_policy: "no_external_untrusted",
      imagery_result: "pass",
      wordmark_safe_zone: "clear",
    },
  };
}

async function withWorkspace(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-tv-frame-"));
  try {
    return await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("builds an ordinary Frame PNG after local attributed-snapshot checks", async () => withWorkspace(async (root) => {
  writePng(path.join(root, "snapshot.png"), 1244, 800);
  writeFileSync(path.join(root, "focus.json"), `${JSON.stringify(focusedCapture(), null, 2)}\n`);
  const captureViewpoint = async (htmlPath, outputDir) => {
    const html = readFileSync(htmlPath, "utf8");
    assert.match(html, /data-source-kind="official-tradingview-snapshot"/u);
    assert.match(html, /data-cuebook-wordmark="v1"/u);
    assert.match(html, /object-fit:contain/u);
    writePng(path.join(outputDir, "viewpoint-1866.png"), 1866, 1200, 2);
  };

  const result = await runAttributedSnapshotFrame(job(), root, path.join(root, "selected"), { captureViewpoint });
  assert.equal(result.valid, true);
  assert.match(result.publication_sha256, /^sha256:[a-f0-9]{64}$/u);
  const audit = JSON.parse(readFileSync(path.join(root, result.raster_audit_ref), "utf8"));
  assert.equal(audit.valid, true);
  assert.equal("media_provenance_ref" in result, false);
}));

test("rejects a low-density aspect before rendering instead of stretching or blind cropping", async () => withWorkspace(async (root) => {
  writePng(path.join(root, "snapshot.png"), 1600, 800);
  writeFileSync(path.join(root, "focus.json"), `${JSON.stringify(focusedCapture(1600, 800), null, 2)}\n`);
  await assert.rejects(
    runAttributedSnapshotFrame(job(), root, path.join(root, "selected"), { captureViewpoint: async () => assert.fail("capture should not run") }),
    /aspect ratio is too far/u,
  );
}));

test("rejects a snapshot that is not the exact file bound by the focus record", async () => withWorkspace(async (root) => {
  writePng(path.join(root, "snapshot.png"), 1244, 800);
  writePng(path.join(root, "other.png"), 1244, 800, 3);
  const focus = focusedCapture();
  focus.source.locator = "other.png";
  writeFileSync(path.join(root, "focus.json"), `${JSON.stringify(focus, null, 2)}\n`);
  await assert.rejects(
    runAttributedSnapshotFrame(job(), root, path.join(root, "selected"), { captureViewpoint: async () => assert.fail("capture should not run") }),
    /does not match the snapshot bound/u,
  );
}));
