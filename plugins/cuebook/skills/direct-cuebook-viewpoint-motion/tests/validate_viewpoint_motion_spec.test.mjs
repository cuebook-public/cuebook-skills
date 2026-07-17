import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_viewpoint_motion_spec.mjs";

function baseSpec() {
  const bindings = [
    { binding_id: "BIND_judgment", kind: "creator_judgment", label: "坏消息砸不动，卖压正在被吸收", value: null, unit: null, state: "creator_view", source_refs: ["CREATOR_note_1"] },
    { binding_id: "BIND_price_series", kind: "series", label: "BTC/USD observed price", value: null, unit: "USD", state: "observed", source_refs: ["SERIES_btc_1h"] },
    { binding_id: "BIND_event", kind: "event", label: "negative market catalyst", value: null, unit: null, state: "reported", source_refs: ["NEWS_event_1"] },
    { binding_id: "BIND_relationship", kind: "relationship", label: "selling pressure rose while downside response weakened", value: null, unit: null, state: "derived", source_refs: ["DERIVED_reaction_1"] },
  ];
  const beats = [
    { beat_id: "BEAT_hook", role: "hook", start_ms: 0, end_ms: 700, focus: "坏消息先落下", binding_refs: ["BIND_event"], motion_primitives: ["reveal", "pulse"], keyframe_ref: "keyframes/000-hook.png" },
    { beat_id: "BEAT_evidence", role: "evidence", start_ms: 550, end_ms: 1700, focus: "观察价格路径", binding_refs: ["BIND_price_series"], motion_primitives: ["draw_path", "track"], keyframe_ref: "keyframes/001-evidence.png" },
    { beat_id: "BEAT_mechanism", role: "mechanism", start_ms: 1450, end_ms: 2700, focus: "卖压增强但跌幅收窄", binding_refs: ["BIND_relationship"], motion_primitives: ["connect", "focus_pull"], keyframe_ref: "keyframes/002-mechanism.png" },
    { beat_id: "BEAT_view", role: "view", start_ms: 2450, end_ms: 3400, focus: "筹码被吸收的判断出现", binding_refs: ["BIND_judgment"], motion_primitives: ["morph", "reveal"], keyframe_ref: "keyframes/003-view.png" },
    { beat_id: "BEAT_hold", role: "hold", start_ms: 3400, end_ms: 4000, focus: "完整观点停留", binding_refs: ["BIND_judgment", "BIND_price_series"], motion_primitives: ["settle"], keyframe_ref: "keyframes/004-hold.png" },
  ];
  return {
    schema_version: "viewpoint-motion-spec-v1",
    motion_spec_id: "VMSPEC_btc_reaction_01",
    state: "approved",
    input_refs: ["VDSET_btc_reaction_01", "VVIS_btc_reaction_01", "VDB_btc_reaction_01"],
    selected_visual_direction_ref: "VDIR_btc_tension_01",
    message: { claim: "坏消息砸不动 BTC", because: "卖压更重，价格反应反而更轻", implication: "短线筹码正在被吸收", direction: "watch", horizon: "未来 3 天" },
    bindings,
    form: { role: "mechanism", distance: "feed_360", temperature: "contrarian", capacity: "只让事件、价格反应和吸收判断进入画面", motif: "下压箭头触及价格路径后被路径的韧性托住", continuity: "同一条 BTC 路径从观察对象变成吸收卖压的证据" },
    hero: { hero_id: "HERO_btc_path", kind: "observed_path", binding_refs: ["BIND_price_series", "BIND_relationship"], continuity_statement: "BTC 价格路径贯穿所有 beat，并在事件压力下保持连续", observed_geometry: "solid", conditional_geometry: "dashed" },
    beats,
    runtime: { framework: "react", animation_library: "motion/react", timebase: "deterministic_ms", duration_ms: 4000, fps: 60, autoplay: "when_in_view", loop: false, in_view_once: true, supports_external_time: true },
    accessibility: { reduced_motion: "static_poster", poster_ref: "poster/viewpoint.png", audio_default: false, alt_text: "负面事件增加卖压，但 BTC 跌幅收窄，创作者判断筹码正在被吸收。" },
    outputs: { component_ref: "react/BtcReactionMotion.tsx", poster_ref: "poster/viewpoint.png", keyframe_refs: beats.map((beat) => beat.keyframe_ref), video_ref: null },
    quality_report: { semantic_continuity: 8.6, keyframe_readability: 8.2, data_integrity: 9.5, motion_craft: 8.0, reduced_motion: 9.0, weighted_score: 8.6, verdict: "pass", hard_failures: [], revision: "保留最终 600ms 停留。" },
  };
}

function codes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

test("base spec is valid", () => {
  const item = baseSpec();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result));
});

test("unknown beat binding is rejected", () => {
  const item = baseSpec();
  item.beats[1].binding_refs = ["BIND_missing"];
  assert.ok(codes(validate(item)).has("UNKNOWN_BEAT_BINDING"));
});

test("short final hold is rejected", () => {
  const item = baseSpec();
  item.beats[item.beats.length - 1].start_ms = 3700;
  assert.ok(codes(validate(item)).has("SHORT_FINAL_HOLD"));
});

test("missing external time support is rejected", () => {
  const item = baseSpec();
  item.runtime.supports_external_time = false;
  assert.ok(codes(validate(item)).has("DETERMINISTIC_TIME"));
});

test("approved spec with low critical score is rejected", () => {
  const item = baseSpec();
  item.quality_report.data_integrity = 6.5;
  assert.ok(codes(validate(item)).has("APPROVED_SCORE"));
});

test("settlement beat without deadline or level binding is rejected", () => {
  const item = baseSpec();
  const settlement = structuredClone(item.beats[3]);
  Object.assign(settlement, { beat_id: "BEAT_settlement", role: "settlement" });
  item.beats.splice(4, 0, settlement);
  item.outputs.keyframe_refs.splice(4, 0, settlement.keyframe_ref);
  assert.ok(codes(validate(item)).has("SETTLEMENT_BINDING"));
});
