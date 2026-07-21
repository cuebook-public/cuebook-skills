import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_viewpoint_motion.mjs";

const HASH = `sha256:${"a".repeat(64)}`;

function baseManifest() {
  return {
    schema_version: "viewpoint-motion-v1",
    motion_id: "VMOTION_btc_reaction_01",
    spec_ref: "VMSPEC_btc_reaction_01",
    state: "frozen",
    framework: "react",
    animation_library: "motion/react",
    dimensions: { width: 720, height: 420, compact_width: 360, compact_height: 210 },
    timebase: "deterministic_ms",
    duration_ms: 4000,
    fps: 60,
    lineage: { input_artifact_refs: ["VVIS_btc_01", "VDB_btc_01"], binding_refs: ["BIND_price_series", "BIND_judgment"], selected_visual_direction_ref: "VDIR_btc_tension_01" },
    asset: {
      component: { ref: "react/BtcReactionMotion.tsx", sha256: HASH },
      poster: { ref: "poster/viewpoint.png", sha256: HASH },
      keyframes: [
        { at_ms: 0, ref: "keyframes/frame-00000.png", sha256: HASH },
        { at_ms: 700, ref: "keyframes/frame-00700.png", sha256: HASH },
        { at_ms: 1700, ref: "keyframes/frame-01700.png", sha256: HASH },
        { at_ms: 2700, ref: "keyframes/frame-02700.png", sha256: HASH },
        { at_ms: 4000, ref: "keyframes/frame-04000.png", sha256: HASH },
      ],
      videos: [],
    },
    accessibility: { reduced_motion_verified: true, autoplay_audio: false, alt_text: "A negative event increases selling pressure, but BTC's decline narrows; the creator concludes that supply is being absorbed." },
    quality_report: { decision: "ready", first_frame: "pass", decisive_frame: "pass", final_frame: "pass", compact_readability: "pass", data_integrity: "pass", console_errors: 0, hard_failures: [], warnings: [] },
  };
}

const codes = (result) => new Set(result.errors.map((entry) => entry.code));

test("valid manifest remains publishable without video", () => {
  const result = validate(baseManifest());
  assert.equal(result.valid, true, JSON.stringify(result));
  assert.equal(result.warnings[0].code, "NO_VIDEO_DERIVATIVE");
});

test("final hold is required", () => {
  const item = baseManifest();
  item.asset.keyframes.at(-1).at_ms = 3800;
  assert.ok(codes(validate(item)).has("FINAL_FRAME"));
});

test("autoplay audio is rejected", () => {
  const item = baseManifest();
  item.accessibility.autoplay_audio = true;
  assert.ok(codes(validate(item)).has("ACCESSIBILITY"));
});

test("ready quality rejects console errors", () => {
  const item = baseManifest();
  item.quality_report.console_errors = 1;
  assert.ok(codes(validate(item)).has("READY_QUALITY"));
});

test("video extension must match format", () => {
  const item = baseManifest();
  item.asset.videos = [{ format: "mp4", ref: "video/viewpoint.webm", sha256: HASH }];
  assert.ok(codes(validate(item)).has("VIDEO_REF"));
});
