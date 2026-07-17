import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PALETTES,
  fmtAxisY,
  fmtY,
  render,
  renderSvg,
  wrapText,
} from "../scripts/render_market_figure.mjs";
import { validateManifest, validateSpec } from "../scripts/validate_market_figure.mjs";
import {
  instrumentMapSpec,
  relativeSpec,
  semanticRelativeSpec,
  sourceChartRedrawSpec,
} from "./market_figure_fixtures.mjs";

function withTempDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "cuebook-market-figure-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function resultCodes(result) {
  return new Set(result.errors.map((item) => item.code));
}

function assertValidSpec(payload) {
  const result = validateSpec(payload);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
}

function contrastRatio(foreground, background) {
  const luminance = (value) => {
    const channels = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground), second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("trade horizon wraps as one phrase", () => {
  const lines = wrapText("油轮遇袭，我先做 USO 跑赢 XLE，窗口看 1-3 天", 40, 2);
  assert.ok(lines.some((line) => line.includes("窗口看 1-3 天")), JSON.stringify(lines));
  assert.notEqual(lines.at(-1), "天");
});

test("valid relative spec", () => {
  assertValidSpec(relativeSpec());
});

test("valid editorial dimensions", () => {
  const payload = relativeSpec();
  Object.assign(payload.render, { layout: "editorial", width: 1200, height: 760 });
  assertValidSpec(payload);
});

test("valid semantic argument curve", () => {
  assertValidSpec(semanticRelativeSpec());
});

test("argument curve requires a linear sourced path", () => {
  const payload = semanticRelativeSpec();
  payload.argument_path.nodes[1].source_refs = [];
  Object.assign(payload.argument_path.edges[0], { from: "N2", to: "N1" });
  const codes = resultCodes(validateSpec(payload));
  assert.ok(codes.has("ARGUMENT_NODE_SOURCE"));
  assert.ok(codes.has("ARGUMENT_PATH_ORDER"));
});

test("semantic compact renders reasoning and curve", () => {
  withTempDirectory((directory) => {
    const result = render(semanticRelativeSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    assert.equal(svg.match(/data-argument-node="/g)?.length, 4);
    for (const term of ["导火索", "为什么先动", "钱先去哪", "我押什么", "事件驱动 · 风险溢价传导 · 相对价值", "07/14 08:30 UTC", "USO"]) assert.ok(svg.includes(term), term);
    for (const term of ["已发生", "已计算", "推演", "待确认"]) assert.ok(!svg.includes(`>${term}<`), term);
    assert.ok(svg.includes('data-argument-edge="hypothesis"'));
    const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
    assert.deepEqual(manifest.lineage.argument_node_refs, ["N1", "N2", "N3", "N4"]);
    assert.equal(manifest.lineage.trade_logic_ref, "TLOGIC_USO_XLE_HORMUZ_20260714");
    assert.equal(manifest.content.argument_path_labels.length, 4);
    assert.deepEqual(manifest.content.strategy_tags, ["事件驱动", "风险溢价传导", "相对价值"]);
  });
});

test("valid instrument map", () => {
  assertValidSpec(instrumentMapSpec());
});

test("instrument map requires labeled points", () => {
  const payload = instrumentMapSpec();
  payload.curve.series[0].points[0].label = null;
  assert.ok(resultCodes(validateSpec(payload)).has("INSTRUMENT_MAP_INPUTS"));
});

test("instrument map renders points without a connecting path", () => {
  withTempDirectory((directory) => {
    const result = render(instrumentMapSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    assert.equal(svg.match(/data-plot-kind="instrument-map"/g)?.length, 4);
    assert.ok(svg.includes("KORU · 日3×"));
    assert.ok(svg.includes("20日年化波动"));
  });
});

test("compact renders horizontal level marker", () => {
  const payload = relativeSpec();
  payload.curve.markers.push({
    id: "M3",
    kind: "baseline",
    x: "2026-07-13T20:00:00Z",
    y: 1,
    label: "参考线",
    status: "observed",
    source_ref: "source:baseline:test",
  });
  withTempDirectory((directory) => {
    const svg = readFileSync(render(payload, directory).svg_path, "utf8");
    assert.ok(svg.includes('data-marker-orientation="horizontal"'));
    assert.ok(svg.includes("参考线"));
  });
});

test("formats financial units", () => {
  assert.equal(fmtY(139.14, "USD"), "$139.14");
  assert.equal(fmtAxisY(139.14, "USD"), "$139");
  assert.equal(fmtY(1_913_000, "KRW"), "₩1.91m");
  assert.equal(fmtAxisY(1_913_000, "KRW"), "₩1.9m");
  assert.equal(fmtY(98.2, "x"), "98.2×");
});

test("taste review palette uses a neutral driver", () => {
  assert.equal(PALETTES.cuebook_light.driver, "#315D57");
  assert.notEqual(PALETTES.cuebook_light.driver, "#8D5FC7");
});

test("semantic inks meet small-text contrast", () => {
  const inkKeys = ["ink", "muted", "primary", "benchmark", "driver", "context", "yellow_ink", "red"];
  for (const [theme, palette] of Object.entries(PALETTES)) {
    for (const surfaceKey of ["bg", "surface"]) {
      for (const inkKey of inkKeys) assert.ok(contrastRatio(palette[inkKey], palette[surfaceKey]) >= 4.5, `${theme}:${surfaceKey}:${inkKey}`);
    }
  }
});

test("rejects unsynchronized relative baseline", () => {
  const payload = relativeSpec();
  payload.curve.series[1].baseline.observed_at = "2026-07-12T20:00:00Z";
  assert.ok(resultCodes(validateSpec(payload)).has("RELATIVE_INPUTS"));
});

test("rejects modelled time path", () => {
  const payload = relativeSpec();
  payload.curve.series[0].data_kind = "formula";
  payload.curve.series[0].formula = "future price guess";
  payload.curve.series[0].points.at(-1).state = "modelled";
  assert.ok(resultCodes(validateSpec(payload)).has("MODELLED_PATH"));
});

test("event reaction requires news", () => {
  const payload = relativeSpec();
  payload.grammar = "event_reaction";
  payload.news_anchor = null;
  assert.ok(resultCodes(validateSpec(payload)).has("EVENT_REACTION_INPUTS"));
});

test("multi-series source-chart redraw renders focus and canonical brand", () => {
  const payload = sourceChartRedrawSpec();
  assertValidSpec(payload);
  withTempDirectory((directory) => {
    const svg = readFileSync(render(payload, directory).svg_path, "utf8");
    assert.ok(svg.includes('data-data-kind="digitized_observed"'));
    assert.ok(svg.includes('stroke-dasharray="8 6"'));
    assert.ok(svg.includes('data-cuebook-wordmark="v1"'));
    assert.ok(!svg.includes("▮ Cuebook"));
    assert.ok(!svg.includes("Series 5"));
  });
});

test("digitized redraw cannot settle", () => {
  const payload = relativeSpec();
  payload.curve.data_fidelity = "source_chart_redraw";
  for (const series of payload.curve.series) series.data_kind = "digitized_observed";
  payload.quality_report.warnings.push("Source-chart redraw from screenshot.");
  assert.ok(resultCodes(validateSpec(payload)).has("DIGITIZED_SETTLEMENT"));
});

test("render writes a valid manifest and SVG", () => {
  withTempDirectory((directory) => {
    const result = render(relativeSpec(), directory);
    const svg = readFileSync(result.svg_path, "utf8");
    for (const term of ["同一条供应冲击", "油轮在霍尔木兹", "+2.03pp", "07/14 08:30 UTC", 'font-variant-numeric="tabular-nums"']) assert.ok(svg.includes(term), term);
    for (const term of ["7 月 14 日收盘时", "虚线为形成中", "条数据引用", "font-feature-settings", "Cuebook 补全"]) assert.ok(!svg.includes(term), term);
    const weights = new Set([...svg.matchAll(/font-weight="(\d+)"/g)].map((match) => Number(match[1])));
    assert.ok([...weights].every((value) => new Set([400, 500, 600, 700, 800]).has(value)), JSON.stringify([...weights]));
    const manifest = JSON.parse(readFileSync(result.manifest_path, "utf8"));
    assert.equal(manifest.layout, "compact");
    assert.deepEqual(manifest.dimensions, { width: 720, height: 420 });
    assert.equal(manifest.content.settlement_line, "7 月 14 日收盘时，USO 收益率高于 XLE。");
    const validation = validateManifest(manifest, directory);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
  });
});

test("renderer stays byte-compatible with migration goldens", () => {
  const goldens = new Map([
    [relativeSpec, "86874d4911ed3cf93cf7929e047925bd4789b57d747ba13380ff162d3ad5da82"],
    [instrumentMapSpec, "00f9f24e891ede1a4d6c9a49c4e1ca851336850ffc247cf46f3b018c1e905c32"],
    [semanticRelativeSpec, "2539769c1287ed1b64f5f3c9a2f8fdc5dafaf4b5911fa3d393db91e5e31570a8"],
    [sourceChartRedrawSpec, "3ef659086d4bd14ad9457e87da3d759d352f6880665519ce98d3457a196093e9"],
  ]);
  for (const [factory, expected] of goldens) {
    const observed = createHash("sha256").update(renderSvg(factory()), "utf8").digest("hex");
    assert.equal(observed, expected, factory.name);
  }
});
