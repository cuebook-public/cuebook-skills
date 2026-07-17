import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { REGISTRY_PATH, STRATEGIES, select } from "../scripts/select_creator_palette.mjs";

function luminance(value) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
    .map((item) => item <= 0.04045 ? item / 12.92 : ((item + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

test("registry tokens clear contrast floors", () => {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  for (const preset of registry.presets) {
    const { tokens } = preset;
    assert.ok(contrast(tokens.ink_1, tokens.surface_0) >= 7, preset.preset_id);
    assert.ok(contrast(tokens.ink_2, tokens.surface_0) >= 4.5, preset.preset_id);
    for (const token of ["accent_a", "accent_b", "accent_c", "risk"]) {
      assert.ok(contrast(tokens[token], tokens.surface_0) >= 3, `${preset.preset_id}:${token}`);
    }
  }
});

test("returns three distinct strategies and presets", () => {
  const result = select({ register: "strategist", energy: 3, conviction: 4, technicality: 4, emotionality: 2, compression: 4, content_mode: "mechanism", evidence_mode: "causal_path", direction: "long" });
  assert.deepEqual(result.selections.map((item) => item.strategy), STRATEGIES);
  assert.equal(new Set(result.selections.map((item) => item.preset_id)).size, 3);
});

test("signature palette leads creator-native", () => {
  const result = select({ register: "research_memo", signature_palette_id: "premium-monochrome", content_mode: "valuation", evidence_mode: "key_numbers" });
  assert.equal(result.selections[0].preset_id, "premium-monochrome");
});

test("high-energy meme uses expressive creator palette", () => {
  const result = select({ register: "meme", energy: 5, conviction: 5, technicality: 3, emotionality: 5, content_mode: "cycle", evidence_mode: "curve" });
  assert.ok(new Set(["signal-lime", "terminal-cyan"]).has(result.selections[0].preset_id));
});

test("recent palette is penalized without signature lock", () => {
  const brief = { register: "meme", energy: 5, conviction: 5, technicality: 3, emotionality: 5, content_mode: "cycle", evidence_mode: "curve" };
  const recent = select(brief).selections[0].preset_id;
  const result = select({ ...brief, recent_palette_ids: [recent] });
  assert.notEqual(result.selections[0].preset_id, recent);
});

test("restrained profile does not get vivid contrast", () => {
  const result = select({ register: "research_memo", energy: 2, conviction: 3, technicality: 5, emotionality: 1, content_mode: "valuation", evidence_mode: "key_numbers" });
  const presets = Object.fromEntries(JSON.parse(readFileSync(REGISTRY_PATH, "utf8")).presets.map((item) => [item.preset_id, item]));
  assert.notEqual(presets[result.selections[2].preset_id].chroma, "vivid");
});
