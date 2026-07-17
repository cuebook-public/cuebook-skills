import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_viewpoint_card.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/base-card.json"), "utf8"));
const baseCard = () => structuredClone(fixture);
const codes = (result) => new Set(result.errors.map((entry) => entry.code));

test("valid conditional relative card", () => {
  const result = validate(baseCard());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

for (const [name, expected, mutate] of [
  ["relative card requires benchmark", "RELATIVE_BENCHMARK", (item) => { item.header.benchmark_ticker = null; }],
  ["chart ref must match lineage", "BLOCK_LINEAGE_REF", (item) => { item.blocks[3].artifact_ref = "CHART_wrongref"; }],
  ["creator text cannot change", "CREATOR_TEXT_CHANGED", (item) => { item.blocks[0].summary = "AI 改写后的观点"; }],
  ["ready card rejects conditional block", "CONDITIONAL_BLOCK_CARD", (item) => {
    item.state = "ready";
    item.quality_report = { decision: "ready", warnings: [], hard_failures: [] };
    item.disclosures = { position_status: "none", commercial_status: "none", identity_status: "known", ai_assistance_status: "disclosed", public_lines: [] };
    item.settlement.state = "ready";
  }],
  ["settleable card requires settlement block", "SETTLEMENT_BLOCK", (item) => { item.blocks = item.blocks.slice(0, -1); }],
  ["logic card ref must match lineage", "BLOCK_LINEAGE_REF", (item) => { item.blocks[2].artifact_ref = "LOGICCARD_wrongref"; }],
  ["settleable card requires deadline", "SETTLEMENT_DEADLINE", (item) => { item.header.deadline_at = null; item.header.deadline_label = null; }],
]) {
  test(name, () => {
    const item = baseCard();
    mutate(item);
    assert.ok(codes(validate(item)).has(expected));
  });
}

test("market figure ref must match lineage", () => {
  const item = baseCard();
  const figureRef = "FIGURE_usovsxle20260714_relative";
  item.lineage.input_artifact_refs.push(figureRef);
  item.lineage.market_figure_ref = figureRef;
  for (const block of item.blocks) if (block.order >= 6) block.order += 1;
  item.blocks.splice(5, 0, {
    id: "B7", order: 6, kind: "market_figure", role: "supports", state: "conditional",
    title: "新闻与相对收益主图", summary: "用一张图绑定曲线、新闻、关键数字和结算。",
    artifact_ref: "FIGURE_wrongref", fact_refs: ["F1", "I2"], source_refs: ["cuebook:market.candles"],
    display_variant: "market_figure",
  });
  assert.ok(codes(validate(item)).has("BLOCK_LINEAGE_REF"));
});

test("viewpoint visual ref must match lineage", () => {
  const item = baseCard();
  const visualRef = "VVIS_usovsxle20260714";
  item.lineage.input_artifact_refs.push(visualRef);
  item.lineage.viewpoint_visual_ref = visualRef;
  Object.assign(item.blocks[2], {
    kind: "viewpoint_visual", title: "风险溢价先落在哪里", artifact_ref: "VVIS_wrongref", display_variant: "viewpoint_visual",
  });
  assert.ok(codes(validate(item)).has("BLOCK_LINEAGE_REF"));
});

test("observation card can omit deadline and settlement", () => {
  const item = baseCard();
  Object.assign(item.header, {
    direction: "observe", direction_label: "观察去杠杆", benchmark_instrument_id: null,
    benchmark_ticker: null, deadline_at: null, deadline_label: null,
  });
  item.blocks = item.blocks.slice(0, -1);
  item.settlement = { settleable: false, claim_ref: null, one_line: null, state: "not_applicable" };
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

export { baseCard };
