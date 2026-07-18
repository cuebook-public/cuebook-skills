#!/usr/bin/env node
// Render a validated ViewpointVisualSpecV1 as a deterministic Cuebook SVG bundle.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collapseWhitespace,
  displayWidth,
  htmlEscape,
  pyFloatFixed,
  pyFromIsoformat,
  pyLstrip,
  pyrepr,
  pyRound,
  pyRstrip,
  pyStrip,
  utcParts,
} from "../../render-cuebook-market-signal/scripts/pycompat.mjs";
import { validateManifest, validateSpec } from "./validate_viewpoint_visual.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = resolve(here, "..");
const WORDMARK_ASSET = join(ROOT, "..", "direct-cuebook-viewpoint-visual", "assets", "cuebook-wordmark.svg");

export const TOKENS = JSON.parse(readFileSync(join(ROOT, "references", "cuebook-visual-tokens-v1.json"), "utf8"));
export const COLORS = TOKENS.colors;
export const TYPE = TOKENS.type;
export const GEOMETRY = TOKENS.geometry;
export const WIDTH = TOKENS.canvas.width;
export const HEIGHT = TOKENS.canvas.height;
export const FONT = TYPE.family;
export const MIN_FONT = TYPE.minimum_canonical_px;
export const WORDMARK_PATHS = [...readFileSync(WORDMARK_ASSET, "utf8").matchAll(/<path\s+d="([^"]+)"/gu)].map((match) => match[1]);
if (!WORDMARK_PATHS.length) throw new Error(`Canonical Cuebook wordmark has no paths: ${WORDMARK_ASSET}`);

const f1 = (value) => pyFloatFixed(Number(value), 1);

export function esc(value) {
  return htmlEscape(value);
}

export { displayWidth as display_width };

export function wrapText(value, maxUnits, maxLines) {
  const source = value ? String(value) : "";
  const text = pyStrip(collapseWhitespace(source));
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let current = "";
  if (words.length > 1) {
    for (const word of words) {
      const candidate = pyStrip(`${current} ${word}`);
      if (current && displayWidth(candidate) > maxUnits) {
        lines.push(current);
        current = word;
      } else current = candidate;
      while (displayWidth(current) > maxUnits) {
        const chars = Array.from(current);
        let splitAt = maxUnits;
        while (splitAt > 1 && displayWidth(chars.slice(0, splitAt).join("")) > maxUnits) splitAt -= 1;
        lines.push(chars.slice(0, splitAt).join(""));
        current = chars.slice(splitAt).join("");
      }
    }
    if (current) lines.push(current);
  } else {
    for (const char of text) {
      const candidate = current + char;
      if (current && displayWidth(candidate) > maxUnits) {
        lines.push(pyRstrip(current));
        current = pyLstrip(char);
      } else current = candidate;
    }
    if (current) lines.push(pyRstrip(current));
  }
  if (lines.length > maxLines) throw new Error(`Validated public text does not fit: ${pyrepr(text)}`);
  return lines;
}

export function textBlock(x, y, value, maxUnits, maxLines, size, lineHeight, fill, weight = 400, anchor = "start", extra = "") {
  if (size < MIN_FONT) throw new Error(`Visible type cannot be smaller than ${MIN_FONT}px.`);
  const lines = wrapText(value, maxUnits, maxLines);
  const spans = lines.map((item, index) => `<tspan x="${f1(x)}" dy="${index === 0 ? 0 : lineHeight}">${esc(item)}</tspan>`).join("");
  return `<text x="${f1(x)}" y="${f1(y)}" fill="${fill}" font-family="${esc(FONT)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0" font-variant-numeric="tabular-nums" ${extra}>${spans}</text>`;
}

export function rect(x, y, width, height, fill, { stroke = "none", strokeWidth = 0, radius = 0, dash = null, extra = "" } = {}) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(width)}" height="${f1(height)}" rx="${f1(radius)}" fill="${fill}" stroke="${stroke}" stroke-width="${f1(strokeWidth)}"${dashAttr} ${extra}/>`;
}

function markerName(stroke) {
  const names = new Map([
    [COLORS.ink, "ink"],
    [COLORS.muted, "muted"],
    [COLORS.positive, "positive"],
    [COLORS.comparison, "comparison"],
    [COLORS.negative, "negative"],
    [COLORS.highlight_ink, "highlight"],
  ]);
  return names.get(stroke) ?? "muted";
}

export function line(x1, y1, x2, y2, stroke, { width = 2, dash = null, arrow = false, extra = "" } = {}) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  const marker = arrow ? ` marker-end="url(#vv-arrow-${markerName(stroke)})"` : "";
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${f1(width)}" stroke-linecap="round"${dashAttr}${marker} ${extra}/>`;
}

export function curve(d, stroke, { width = 2, dash = null, arrow = false, extra = "" } = {}) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  const marker = arrow ? ` marker-end="url(#vv-arrow-${markerName(stroke)})"` : "";
  return `<path d="${esc(d)}" fill="none" stroke="${stroke}" stroke-width="${f1(width)}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${marker} ${extra}/>`;
}

export function markerShape(x, y, shape, color, size = 8, { outline = false } = {}) {
  const fill = outline ? COLORS.canvas : color;
  const strokeWidth = outline ? 3 : 2;
  if (shape === "circle") return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size)}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
  if (shape === "square") return rect(x - size, y - size, size * 2, size * 2, fill, { stroke: color, strokeWidth, radius: 1 });
  if (shape === "triangle") {
    const points = `${f1(x)},${f1(y - size)} ${f1(x + size)},${f1(y + size)} ${f1(x - size)},${f1(y + size)}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
  }
  const points = `${f1(x)},${f1(y - size)} ${f1(x + size)},${f1(y)} ${f1(x)},${f1(y + size)} ${f1(x - size)},${f1(y)}`;
  return `<polygon points="${points}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
}

export function parseTime(value) {
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  if (parsed === null) throw new Error(`Invalid timestamp: ${value}`);
  return parsed;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function timeLabel(value) {
  const parts = utcParts(parseTime(value).epoch);
  return `${String(parts.year).padStart(4, "0")}.${String(parts.month).padStart(2, "0")}.${String(parts.day).padStart(2, "0")}  ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} UTC`;
}

export function shortTime(value) {
  const parts = utcParts(parseTime(value).epoch);
  return `${String(parts.day).padStart(2, "0")} ${MONTHS[parts.month - 1]} / ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function trimFixed(value) {
  return value.replace(/0+$/u, "").replace(/\.$/u, "");
}

function isClose(left, right, relTolerance = 1e-9, absTolerance = 0) {
  return Math.abs(left - right) <= Math.max(relTolerance * Math.max(Math.abs(left), Math.abs(right)), absTolerance);
}

export function fmtNumber(value, unit) {
  const absolute = Math.abs(value);
  let number;
  if (absolute >= 1_000_000) number = `${trimFixed(pyFloatFixed(value / 1_000_000, 3))}m`;
  else if (absolute >= 1_000) number = `${trimFixed(pyFloatFixed(value / 1_000, 2))}k`;
  else if (isClose(value, pyRound(value), 1e-9, 1e-9)) number = String(pyRound(value));
  else number = trimFixed(pyFloatFixed(value, 2));
  if (new Set(["%", "pp", "bps"]).has(unit)) return `${number}${unit}`;
  return pyStrip(`${number} ${unit}`);
}

export function pathDash(pathKind) {
  return new Set(["conditional", "future"]).has(pathKind) ? GEOMETRY.dash : null;
}

export function canonicalWordmark() {
  const paths = WORDMARK_PATHS.map((path) => `<path d="${esc(path)}" fill="currentColor"/>`).join("");
  const x = WIDTH - 22 - 73, y = HEIGHT - 18 - 14;
  return `<g data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" transform="translate(${x} ${y})" color="${COLORS.ink}" pointer-events="none">${paths}</g>`;
}

export function commonOpen(spec) {
  const frame = spec.frame, tagLine = frame.strategy_tags.join(" / ");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="vv-title vv-desc" data-schema="viewpoint-visual-v1" data-grammar="${esc(spec.grammar)}" data-payload-mode="${esc(spec.payload_mode)}" data-design-language="cuebook-editorial-signal-v2" data-composition="${esc(spec.grammar)}">`,
    `<title id="vv-title">${esc(frame.headline)}</title>`,
    `<desc id="vv-desc">${esc(frame.alt_text)}</desc>`,
    "<defs>",
  ];
  const arrowColors = {
    ink: COLORS.ink,
    muted: COLORS.muted,
    positive: COLORS.positive,
    comparison: COLORS.comparison,
    negative: COLORS.negative,
    highlight: COLORS.highlight_ink,
  };
  for (const [name, color] of Object.entries(arrowColors)) parts.push(`<marker id="vv-arrow-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10" fill="${color}"/></marker>`);
  parts.push(
    "</defs>",
    rect(0, 0, WIDTH, HEIGHT, COLORS.canvas),
    textBlock(30, 29, timeLabel(frame.observed_at), 32, 1, TYPE.meta_px, 24, COLORS.muted, 520),
    textBlock(30, 62, tagLine, 58, 1, TYPE.tag_px, 24, COLORS.positive, 700),
    textBlock(30, 99, frame.headline, 42, 2, TYPE.headline_px, TYPE.headline_line_height_px, COLORS.ink, 760),
    textBlock(30, 179, frame.observation, 62, 1, TYPE.body_px, 24, COLORS.muted, 500),
    line(30, 207, 690, 207, COLORS.hairline, { width: GEOMETRY.hairline_px }),
  );
  return parts;
}

export function railsByRole(spec) {
  return Object.fromEntries(spec.data.rails.map((rail) => [rail.role, rail]));
}

export function renderReactionTest(spec) {
  const rails = railsByRole(spec), pressure = rails.pressure, response = rails.response;
  const parts = [
    `<g data-rail="${esc(pressure.id)}">`,
    textBlock(30, 244, pressure.label, 31, 1, TYPE.label_px, 24, COLORS.ink, 720),
    textBlock(30, 276, pressure.detail, 31, 1, TYPE.body_px, 24, COLORS.muted, 500),
    markerShape(385, 256, pressure.shape, COLORS.negative, 8),
    line(405, 256, 674, 256, COLORS.negative, { width: 7, dash: pathDash(pressure.path_kind), arrow: true }),
  ];
  if (pressure.display_value) parts.push(textBlock(675, 291, pressure.display_value, 16, 1, TYPE.compact_metric_px, 34, COLORS.negative, 760, "end"));
  parts.push(
    "</g>",
    `<g data-rail="${esc(response.id)}">`,
    textBlock(30, 333, response.label, 31, 1, TYPE.label_px, 24, COLORS.ink, 720),
    textBlock(30, 365, response.detail, 31, 1, TYPE.body_px, 24, COLORS.muted, 500),
    line(385, 346, 650, 346, COLORS.positive, { width: 4, dash: pathDash(response.path_kind) }),
    markerShape(650, 346, response.shape, COLORS.positive, 8, { outline: response.path_kind !== "solid" }),
  );
  if (response.display_value) parts.push(textBlock(675, 386, response.display_value, 16, 1, TYPE.compact_metric_px, 34, COLORS.positive, 760, "end"));
  parts.push("</g>");
  return parts;
}

export function renderParallelContrast(spec) {
  const rails = railsByRole(spec), first = rails.primary, second = rails.comparison;
  const parts = [line(360, 228, 360, 388, COLORS.hairline, { width: GEOMETRY.hairline_px })];
  for (const [rail, x, color, widthUnits] of [[first, 30, COLORS.comparison, 24], [second, 390, COLORS.positive, 23]]) {
    const metric = rail.display_value || rail.detail;
    parts.push(
      `<g data-rail="${esc(rail.id)}">`,
      line(x, 235, x, 382, color, { width: 4, dash: pathDash(rail.path_kind) }),
      textBlock(x + 20, 257, rail.label, widthUnits, 2, TYPE.label_px, 26, COLORS.ink, 700),
      textBlock(x + 20, 313, metric, widthUnits, 2, rail.display_value ? TYPE.hero_metric_px : TYPE.compact_metric_px, 48, color, 780),
    );
    if (rail.display_value) parts.push(textBlock(x + 20, 365, rail.detail, widthUnits, 2, TYPE.body_px, 24, COLORS.muted, 500));
    parts.push("</g>");
  }
  return parts;
}

export function renderStages(spec) {
  const roleOrder = { pre_event: 0, event_day: 1, next_step: 2 };
  const stages = [...spec.data.stages].sort((left, right) => roleOrder[left.role] - roleOrder[right.role]);
  const xs = [70, 360, 580];
  const parts = [
    line(xs[0], 310, xs[1], 310, COLORS.comparison, { width: 4, arrow: true }),
    line(xs[1], 310, xs[2], 310, COLORS.positive, { width: 4, dash: pathDash(stages[2].path_kind), arrow: true }),
    line(xs[1], 224, xs[1], 391, COLORS.negative, { width: 3 }),
  ];
  const colors = [COLORS.comparison, COLORS.negative, COLORS.positive];
  const anchors = ["start", "middle", "end"], labelXs = [30, 360, 600];
  stages.forEach((stage, index) => {
    const x = xs[index];
    parts.push(
      `<g data-stage="${esc(stage.id)}">`,
      markerShape(x, 310, stage.shape, colors[index], 9, { outline: stage.path_kind !== "solid" }),
      textBlock(labelXs[index], 250, stage.label, 16, 2, TYPE.label_px, 25, COLORS.ink, 720, anchors[index]),
      textBlock(labelXs[index], 357, stage.detail, 16, 2, TYPE.body_px, 24, COLORS.muted, 500, anchors[index]),
    );
    let footer = stage.display_value;
    if (!footer && stage.occurred_at) footer = shortTime(stage.occurred_at);
    if (footer) parts.push(textBlock(labelXs[index], 392, footer, 18, 1, TYPE.label_px, 24, colors[index], 700, anchors[index]));
    parts.push("</g>");
  });
  return parts;
}

export function orderedPair(nodes, firstRole, secondRole) {
  const byRole = Object.fromEntries(nodes.map((node) => [node.role, node]));
  return [byRole[firstRole], byRole[secondRole]];
}

export function renderNodePair(spec, { policy = false } = {}) {
  const [first, second] = policy ? orderedPair(spec.data.nodes, "policy_before", "policy_after") : orderedPair(spec.data.nodes, "frame_from", "frame_to");
  const edge = spec.data.edges[0];
  if (policy) {
    const event = spec.data.events[0];
    return [
      `<g data-node="${esc(first.id)}">`,
      curve("M 60 310 C 80 235, 300 235, 320 310", COLORS.comparison, { width: 4, arrow: true }),
      curve("M 320 322 C 295 390, 85 390, 60 322", COLORS.comparison, { width: 4, arrow: true }),
      textBlock(190, 294, first.label, 22, 2, TYPE.label_px, 26, COLORS.ink, 700, "middle"),
      "</g>",
      rect(354, 226, 9, 164, COLORS.highlight, { radius: 1, extra: `data-event="${esc(event.id)}"` }),
      textBlock(382, 247, event.label, 24, 2, TYPE.label_px, 25, COLORS.highlight_ink, 720),
      curve("M 330 310 L 455 310", COLORS.positive, { width: 4, dash: pathDash(edge.path_kind), arrow: true, extra: `data-edge="${esc(edge.id)}"` }),
      `<g data-node="${esc(second.id)}">`,
      markerShape(475, 310, second.shape, COLORS.positive, 10, { outline: second.path_kind !== "solid" }),
      textBlock(500, 319, second.label, 14, 2, 28, 31, COLORS.positive, 760),
      "</g>",
      textBlock(500, 390, edge.label || "", 20, 1, TYPE.label_px, 24, COLORS.muted, 600, "middle"),
    ];
  }
  const parts = [
    `<g data-node="${esc(first.id)}">`,
    markerShape(52, 306, first.shape, COLORS.comparison, 10, { outline: true }),
    textBlock(78, 278, first.label, 18, 3, TYPE.compact_metric_px, 34, COLORS.comparison, 760),
    "</g>",
    line(280, 310, 448, 310, COLORS.positive, { width: 4, dash: pathDash(edge.path_kind), arrow: true, extra: `data-edge="${esc(edge.id)}"` }),
    `<g data-node="${esc(second.id)}">`,
    markerShape(472, 306, second.shape, COLORS.positive, 10, { outline: second.path_kind !== "solid" }),
    textBlock(500, 270, second.label, 14, 3, TYPE.headline_px, 35, COLORS.positive, 780),
    "</g>",
  ];
  if (edge.label) parts.push(textBlock(364, 242, edge.label, 20, 1, TYPE.label_px, 24, COLORS.highlight_ink, 700, "middle"));
  return parts;
}

export function renderFeedbackLoop(spec) {
  return renderFeedback(spec, { includeValues: false });
}

export function renderFeedbackMixed(spec) {
  return renderFeedback(spec, { includeValues: true });
}

export function renderFeedback(spec, { includeValues }) {
  const nodes = spec.data.nodes, parts = [];
  let centers;
  if (includeValues) {
    const byRole = Object.fromEntries(spec.data.values.map((value) => [value.role, value]));
    const primary = byRole.shock_primary, secondary = byRole.shock_secondary;
    parts.push(
      `<g data-value="${esc(primary.id)}">`,
      textBlock(30, 246, primary.label, 17, 1, TYPE.label_px, 24, COLORS.ink, 650),
      textBlock(30, 291, primary.display_value, 15, 1, TYPE.metric_px, 42, COLORS.negative, 780),
      "</g>",
      line(30, 307, 235, 307, COLORS.hairline, { width: GEOMETRY.hairline_px }),
      `<g data-value="${esc(secondary.id)}">`,
      textBlock(30, 339, secondary.label, 17, 1, TYPE.label_px, 24, COLORS.ink, 650),
      textBlock(30, 384, secondary.display_value, 15, 1, TYPE.metric_px, 42, COLORS.comparison, 780),
      "</g>",
      line(260, 225, 260, 390, COLORS.hairline, { width: GEOMETRY.hairline_px }),
    );
    centers = nodes.length === 4 ? [[500, 245], [640, 305], [500, 375], [360, 305]] : [[500, 235], [575, 340], [365, 365]];
  } else centers = nodes.length === 4 ? [[360, 235], [620, 305], [360, 380], [100, 305]] : [[360, 235], [610, 365], [110, 365]];
  const positions = new Map(nodes.map((node, index) => [node.id, centers[index]]));
  for (const edge of spec.data.edges) {
    if (!positions.has(edge.from) || !positions.has(edge.to)) continue;
    const [x1, y1] = positions.get(edge.from), [x2, y2] = positions.get(edge.to);
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2, centerX = includeValues ? 500 : 360;
    const controlX = midX + (midX - centerX) * 0.24, controlY = midY + (midY - 310) * 0.24;
    const stroke = edge.relation === "dampens" ? COLORS.negative : COLORS.ink;
    parts.push(curve(`M ${f1(x1)} ${f1(y1)} Q ${f1(controlX)} ${f1(controlY)} ${f1(x2)} ${f1(y2)}`, stroke, { width: 3, dash: pathDash(edge.path_kind), arrow: true, extra: `data-edge="${esc(edge.id)}" data-role="causal-loop"` }));
  }
  const loopColors = [COLORS.negative, COLORS.comparison, COLORS.positive, COLORS.highlight_ink];
  let labelOffsets = [[0, -22, "middle"], [40, 45, "end"], [0, 30, "middle"], [-60, -42, "start"]];
  if (nodes.length === 3) labelOffsets = [[0, -22, "middle"], [20, 20, "end"], [-35, 25, "start"]];
  nodes.forEach((node, index) => {
    const [cx, cy] = centers[index], [dx, dy, anchor] = labelOffsets[index];
    parts.push(
      `<g data-node="${esc(node.id)}">`,
      markerShape(cx, cy, node.shape, loopColors[index], 8, { outline: node.path_kind !== "solid" }),
      textBlock(cx + dx, cy + dy, node.label, 14, 2, TYPE.label_px, 24, COLORS.ink, 650, anchor),
      "</g>",
    );
  });
  return parts;
}

export function renderLevelTrack(spec) {
  const value = spec.data.values[0], level = spec.data.levels[0];
  const current = Number(value.numeric_value), threshold = Number(level.numeric_value);
  let low = Math.min(current, threshold), high = Math.max(current, threshold);
  const span = high - low, pad = span ? span * 0.25 : Math.max(Math.abs(high) * 0.1, 1);
  low -= pad;
  high += pad;
  const xFor = (number) => 70 + ((number - low) / (high - low)) * 580;
  const currentX = xFor(current), thresholdX = xFor(threshold);
  const endpointColor = level.relation === "below" ? COLORS.negative : COLORS.positive;
  return [
    textBlock(30, 247, level.relation_label, 32, 1, TYPE.headline_px, 34, COLORS.ink, 760),
    rect(thresholdX - 6, 270, 12, 106, COLORS.highlight_soft, { radius: 0, extra: `data-level="${esc(level.id)}"` }),
    line(70, 335, 650, 335, COLORS.hairline, { width: 3 }),
    line(thresholdX, 270, thresholdX, 376, COLORS.highlight_ink, { width: 2 }),
    markerShape(currentX, 335, value.shape, endpointColor, 10),
    textBlock(currentX, 305, `${value.label} ${value.display_value}`, 25, 1, TYPE.compact_metric_px, 34, endpointColor, 760, "middle"),
    textBlock(Math.min(thresholdX, 580), 400, `${level.label} ${level.display_value}`, 25, 1, TYPE.label_px, 24, COLORS.highlight_ink, 720, thresholdX > 500 ? "end" : "middle"),
  ];
}

export function renderExpectationGap(spec) {
  if (!spec.data.values.length) {
    const rails = railsByRole(spec), expected = rails.expected, actual = rails.actual;
    return [
      `<g data-rail="${esc(expected.id)}">`,
      textBlock(30, 254, expected.label, 24, 2, TYPE.label_px, 25, COLORS.muted, 600),
      textBlock(30, 328, expected.detail, 25, 3, TYPE.compact_metric_px, 34, COLORS.comparison, 760),
      "</g>",
      line(330, 232, 330, 382, COLORS.hairline, { width: GEOMETRY.hairline_px }),
      line(350, 310, 412, 310, COLORS.muted, { width: 3, arrow: true }),
      line(390, 232, 390, 382, COLORS.hairline, { width: GEOMETRY.hairline_px }),
      `<g data-rail="${esc(actual.id)}">`,
      textBlock(690, 254, actual.label, 24, 2, TYPE.label_px, 25, COLORS.muted, 600, "end"),
      textBlock(690, 328, actual.detail, 25, 3, TYPE.compact_metric_px, 34, COLORS.positive, 760, "end"),
      "</g>",
    ];
  }
  const byRole = Object.fromEntries(spec.data.values.map((value) => [value.role, value]));
  const expected = byRole.expected, actual = byRole.actual, gap = byRole.gap;
  const gapColor = Number(gap.numeric_value) < 0 ? COLORS.negative : COLORS.positive;
  return [
    `<g data-value="${esc(expected.id)}">`,
    textBlock(30, 254, expected.label, 22, 2, TYPE.label_px, 25, COLORS.muted, 600),
    textBlock(30, 334, expected.display_value, 16, 1, TYPE.hero_metric_px, 52, COLORS.comparison, 790),
    "</g>",
    line(327, 232, 327, 382, COLORS.hairline, { width: GEOMETRY.hairline_px }),
    `<g data-value="${esc(gap.id)}">`,
    textBlock(360, 268, gap.label, 13, 2, TYPE.label_px, 25, COLORS.muted, 650, "middle"),
    textBlock(360, 335, gap.display_value, 14, 1, TYPE.metric_px, 42, gapColor, 780, "middle"),
    "</g>",
    line(393, 232, 393, 382, COLORS.hairline, { width: GEOMETRY.hairline_px }),
    `<g data-value="${esc(actual.id)}">`,
    textBlock(690, 254, actual.label, 22, 2, TYPE.label_px, 25, COLORS.muted, 600, "end"),
    textBlock(690, 334, actual.display_value, 16, 1, TYPE.hero_metric_px, 52, COLORS.positive, 790, "end"),
    "</g>",
  ];
}

export function renderRelativeValue(spec) {
  if (spec.payload_mode === "key_numbers") return renderLevelTrack(spec);
  const rails = railsByRole(spec), spread = rails.spread, trigger = rails.trigger;
  return [
    `<g data-rail="${esc(spread.id)}">`,
    textBlock(30, 258, spread.label, 27, 2, TYPE.compact_metric_px, 34, COLORS.comparison, 760),
    textBlock(30, 310, spread.detail, 28, 2, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
    `<g data-rail="${esc(trigger.id)}">`,
    textBlock(430, 258, trigger.label, 22, 2, TYPE.label_px, 27, COLORS.ink, 720),
    textBlock(430, 310, trigger.detail, 22, 2, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
    line(30, 354, 365, 354, COLORS.comparison, { width: 5 }),
    markerShape(365, 354, spread.shape, COLORS.comparison, 9),
    line(380, 354, 680, 354, COLORS.positive, { width: 4, dash: pathDash(trigger.path_kind), arrow: true }),
    markerShape(680, 354, trigger.shape, COLORS.positive, 9, { outline: true }),
  ];
}

export function renderSentimentWitness(spec) {
  const rails = railsByRole(spec), baseline = rails.baseline, witness = rails.witness;
  const parts = [
    textBlock(27, 309, "“", 2, 1, 72, 72, COLORS.hairline, 760),
    `<g data-rail="${esc(baseline.id)}">`,
    textBlock(88, 258, baseline.label, 21, 2, TYPE.compact_metric_px, 34, COLORS.ink, 740),
    textBlock(88, 305, baseline.detail, 21, 2, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
    line(342, 238, 342, 384, COLORS.hairline, { width: 2, dash: GEOMETRY.dash }),
    line(365, 310, 425, 310, COLORS.muted, { width: 3, dash: pathDash(witness.path_kind), arrow: true }),
    `<g data-rail="${esc(witness.id)}">`,
    markerShape(452, 304, witness.shape, COLORS.positive, 10, { outline: witness.path_kind !== "solid" }),
    textBlock(480, 258, witness.label, 17, 2, TYPE.compact_metric_px, 34, COLORS.positive, 760),
    textBlock(480, 316, witness.detail, 17, 3, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
  ];
  if (baseline.display_value) parts.splice(4, 0, textBlock(88, 373, baseline.display_value, 15, 1, TYPE.metric_px, 42, COLORS.comparison, 780));
  if (witness.display_value) parts.splice(parts.length - 1, 0, textBlock(480, 383, witness.display_value, 15, 1, TYPE.metric_px, 42, COLORS.positive, 780));
  return parts;
}

export function renderFactorRotation(spec) {
  const rails = railsByRole(spec), first = rails.from, second = rails.to;
  const formula = second.formula || first.formula || "";
  const parts = [
    `<g data-rail="${esc(first.id)}">`,
    markerShape(42, 274, first.shape, COLORS.comparison, 9, { outline: true }),
    textBlock(64, 259, first.label, 20, 2, TYPE.label_px, 27, COLORS.ink, 720),
    textBlock(64, 323, first.detail, 20, 2, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
    line(292, 290, 442, 290, COLORS.positive, { width: 5, dash: pathDash(second.path_kind), arrow: true }),
    `<g data-rail="${esc(second.id)}">`,
    markerShape(468, 274, second.shape, COLORS.positive, 9, { outline: second.path_kind !== "solid" }),
    textBlock(490, 259, second.label, 16, 2, TYPE.label_px, 27, COLORS.positive, 740),
    textBlock(490, 323, second.detail, 16, 2, TYPE.body_px, 24, COLORS.muted, 500),
    "</g>",
  ];
  if (formula.includes("/")) {
    const split = formula.indexOf("/");
    const numerator = pyStrip(formula.slice(0, split)), denominator = pyStrip(formula.slice(split + 1));
    parts.push(
      textBlock(360, 350, numerator, 34, 1, TYPE.label_px, 24, COLORS.highlight_ink, 700, "middle"),
      line(225, 360, 495, 360, COLORS.highlight_ink, { width: 2 }),
      textBlock(360, 390, denominator, 34, 1, TYPE.label_px, 24, COLORS.highlight_ink, 700, "middle"),
    );
  } else parts.push(textBlock(360, 382, formula, 48, 2, TYPE.label_px, 25, COLORS.highlight_ink, 700, "middle"));
  return parts;
}

export function scalePoints(series, plot, extraYValues = []) {
  const [left, top, right, bottom] = plot;
  const allPoints = series.flatMap((item) => item.points);
  const xValues = allPoints.map((point) => parseTime(point.x).epoch);
  const yValues = [...allPoints.map((point) => Number(point.y)), ...extraYValues.map(Number)];
  const xMin = Math.min(...xValues), xMax = Math.max(...xValues);
  let yMin = Math.min(...yValues), yMax = Math.max(...yValues);
  const yPad = yMax !== yMin ? (yMax - yMin) * 0.1 : Math.max(Math.abs(yMax) * 0.05, 1);
  yMin -= yPad;
  yMax += yPad;
  const scaled = series.map((item) => item.points.map((point) => {
    const xValue = parseTime(point.x).epoch;
    const x = left + ((xValue - xMin) / (xMax - xMin)) * (right - left);
    const y = bottom - ((Number(point.y) - yMin) / (yMax - yMin)) * (bottom - top);
    return [x, y];
  }));
  return [scaled, yMin, yMax];
}

export function polyline(points, color, { width, dash, extra }) {
  const coordinates = points.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<polyline points="${coordinates}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="miter" stroke-linecap="square"${dashAttr} ${extra}/>`;
}

export function renderSeries(spec) {
  const series = spec.data.series, two = series.length === 2;
  const plot = [40, 235, two ? 530 : 580, 350];
  const level = spec.grammar === "binary_level" ? spec.data.levels[0] : null;
  const extraY = level ? [Number(level.numeric_value)] : [];
  const [scaled, yMin, yMax] = scalePoints(series, plot, extraY);
  const colors = [COLORS.positive, COLORS.comparison], shapes = ["circle", "square"];
  const parts = [line(plot[0], plot[3], plot[2], plot[3], COLORS.hairline, { width: GEOMETRY.hairline_px })];
  if (spec.grammar === "event_unwind") {
    const baselineY = scaled[0][0][1];
    parts.push(line(plot[0], baselineY, plot[2], baselineY, COLORS.hairline, { width: 2, dash: GEOMETRY.dot }));
  }
  if (level) {
    const levelY = plot[3] - ((Number(level.numeric_value) - yMin) / (yMax - yMin)) * (plot[3] - plot[1]);
    parts.push(rect(plot[0], levelY - 5, plot[2] - plot[0], 10, COLORS.highlight_soft, { radius: 0, extra: `data-level="${esc(level.id)}"` }));
    parts.push(line(plot[0], levelY, plot[2], levelY, COLORS.highlight_ink, { width: 2 }));
    const levelLabelY = Math.min(374, Math.max(245, levelY - 11));
    parts.push(textBlock(plot[0] + 8, levelLabelY, `${level.label} ${level.display_value}`, 30, 1, TYPE.label_px, 24, COLORS.highlight_ink, 720));
  }
  if (spec.data.events.length) {
    const event = spec.data.events[0];
    const firstTime = parseTime(series[0].points[0].x).epoch, lastTime = parseTime(series[0].points.at(-1).x).epoch, eventTime = parseTime(event.occurred_at).epoch;
    const eventX = plot[0] + ((eventTime - firstTime) / (lastTime - firstTime)) * (plot[2] - plot[0]);
    parts.push(line(eventX, 225, eventX, 365, COLORS.negative, { width: 2, extra: `data-event="${esc(event.id)}"` }));
    parts.push(textBlock(40, 230, event.label, 30, 1, TYPE.label_px, 24, COLORS.negative, 700));
  }
  series.forEach((item, index) => {
    const points = scaled[index], dash = index === 1 ? GEOMETRY.dash : null;
    let seriesColor = colors[index];
    if (level && index === 0) seriesColor = level.relation === "below" ? COLORS.negative : COLORS.positive;
    parts.push(polyline(points, seriesColor, { width: index === 0 ? 4 : 3, dash, extra: `data-series="${esc(item.id)}" data-interpolation="none"` }));
    parts.push(markerShape(points.at(-1)[0], points.at(-1)[1], shapes[index], seriesColor, 7, { outline: index === 1 }));
    const endpoint = item.points.at(-1), label = `${item.label} ${fmtNumber(Number(endpoint.y), item.unit)}`;
    if (two) {
      const labelY = index === 0 ? 265 : 337;
      parts.push(line(points.at(-1)[0] + 4, points.at(-1)[1], 532, labelY - 6, seriesColor, { width: 2, dash }));
      parts.push(textBlock(540, labelY, label, 17, 2, TYPE.label_px, 24, seriesColor, 720));
    } else if (level) parts.push(textBlock(plot[2], 230, label, 28, 1, TYPE.label_px, 24, seriesColor, 720, "end"));
    else {
      const labelY = Math.min(372, Math.max(245, points.at(-1)[1] - 18));
      parts.push(textBlock(points.at(-1)[0] - 12, labelY, label, 28, 1, TYPE.label_px, 24, seriesColor, 720, "end"));
    }
  });
  const firstX = series[0].points[0].x, lastX = series[0].points.at(-1).x;
  parts.push(textBlock(plot[0], 396, shortTime(firstX), 20, 1, TYPE.label_px, 24, COLORS.muted, 500));
  parts.push(textBlock(plot[2], 396, shortTime(lastX), 20, 1, TYPE.label_px, 24, COLORS.muted, 500, "end"));
  return parts;
}

export function renderPolicyRails(spec) {
  const rails = railsByRole(spec), first = rails.policy_before, second = rails.policy_after, event = spec.data.events[0];
  return [
    `<g data-rail="${esc(first.id)}">`,
    curve("M 60 310 C 80 235, 300 235, 320 310", COLORS.comparison, { width: 4, arrow: true }),
    curve("M 320 322 C 295 390, 85 390, 60 322", COLORS.comparison, { width: 4, arrow: true }),
    textBlock(190, 292, first.label, 23, 2, TYPE.label_px, 26, COLORS.ink, 700, "middle"),
    textBlock(190, 350, first.display_value || first.detail, 21, 2, TYPE.compact_metric_px, 34, COLORS.comparison, 760, "middle"),
    "</g>",
    rect(354, 226, 9, 164, COLORS.highlight, { radius: 1, extra: `data-event="${esc(event.id)}"` }),
    textBlock(382, 247, event.label, 24, 2, TYPE.label_px, 25, COLORS.highlight_ink, 720),
    line(330, 310, 500, 310, COLORS.positive, { width: 4, dash: pathDash(second.path_kind), arrow: true }),
    `<g data-rail="${esc(second.id)}">`,
    markerShape(520, 310, second.shape, COLORS.positive, 10, { outline: second.path_kind !== "solid" }),
    textBlock(590, 286, second.label, 14, 2, TYPE.label_px, 27, COLORS.ink, 720, "end"),
    textBlock(590, 357, second.display_value || second.detail, 14, 2, TYPE.compact_metric_px, 34, COLORS.positive, 760, "end"),
    "</g>",
  ];
}

export function renderSvg(spec) {
  const parts = commonOpen(spec), grammar = spec.grammar, mode = spec.payload_mode;
  if (mode === "series") parts.push(...renderSeries(spec));
  else if (grammar === "reaction_test") parts.push(...renderReactionTest(spec));
  else if (grammar === "parallel_contrast") parts.push(...renderParallelContrast(spec));
  else if (grammar === "category_reframe") parts.push(...renderNodePair(spec));
  else if (grammar === "relative_value_trigger") parts.push(...renderRelativeValue(spec));
  else if (grammar === "policy_pivot") parts.push(...(spec.data.nodes.length ? renderNodePair(spec, { policy: true }) : renderPolicyRails(spec)));
  else if (grammar === "sentiment_witness") parts.push(...renderSentimentWitness(spec));
  else if (grammar === "event_unwind") parts.push(...renderStages(spec));
  else if (grammar === "feedback_loop") parts.push(...(mode === "mixed" ? renderFeedbackMixed(spec) : renderFeedbackLoop(spec)));
  else if (grammar === "binary_level") parts.push(...renderLevelTrack(spec));
  else if (grammar === "expectation_gap") parts.push(...renderExpectationGap(spec));
  else if (grammar === "factor_rotation") parts.push(...renderFactorRotation(spec));
  else throw new Error(`No renderer for grammar=${pyrepr(grammar)}, payload_mode=${pyrepr(mode)}.`);
  parts.push(canonicalWordmark(), "</svg>");
  return `${parts.join("\n")}\n`;
}

export function atomicWrite(path, data) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(temporary, data);
  renameSync(temporary, path);
}

export function manifestFor(spec, svgHash) {
  const data = spec.data;
  const suffix = spec.spec_id.startsWith("VVSPEC_") ? spec.spec_id.slice("VVSPEC_".length) : spec.spec_id;
  return {
    schema_version: "viewpoint-visual-v1",
    visual_id: `VVIS_${suffix}_r${spec.revision}_${spec.grammar}_${spec.payload_mode}`,
    render_profile: "legacy_720",
    spec_ref: spec.spec_id,
    grammar: spec.grammar,
    payload_mode: spec.payload_mode,
    visual_job: spec.visual_job,
    state: spec.state,
    generated_at: spec.render.generated_at,
    dimensions: { width: WIDTH, height: HEIGHT },
    theme: spec.render.theme,
    lineage: {
      input_artifact_refs: spec.lineage.input_artifact_refs,
      source_refs: spec.lineage.source_refs,
      series_refs: data.series.map((item) => item.id),
      value_refs: data.values.map((item) => item.id),
      level_refs: data.levels.map((item) => item.id),
      event_refs: data.events.map((item) => item.id),
      node_refs: data.nodes.map((item) => item.id),
      edge_refs: data.edges.map((item) => item.id),
      rail_refs: data.rails.map((item) => item.id),
      stage_refs: data.stages.map((item) => item.id),
      decision_cutoff_at: spec.lineage.decision_cutoff_at,
    },
    content: {
      headline: spec.frame.headline,
      observation: spec.frame.observation,
      observed_at: spec.frame.observed_at,
      strategy_tags: spec.frame.strategy_tags,
      alt_text: spec.frame.alt_text,
      watermark: "Cuebook",
    },
    asset: {
      html: null,
      svg: { ref: "viewpoint-visual.svg", sha256: svgHash },
      png_derivatives: [],
      derivative_bundle_hash: null,
    },
    quality_report: spec.quality_report,
  };
}

function validationDetails(validation) {
  return validation.errors.map((item) => `${item.code}: ${item.message}`).join("; ");
}

export function render(spec, outputDir, { rasterize = true } = {}) {
  const validation = validateSpec(spec);
  if (!validation.valid) throw new Error(`Invalid ViewpointVisualSpecV1: ${validationDetails(validation)}`);
  if (spec.quality_report.decision === "blocked") throw new Error("Blocked viewpoint visual specs cannot be rendered.");
  mkdirSync(outputDir, { recursive: true });
  const svgBytes = Buffer.from(renderSvg(spec), "utf8"), svgPath = join(outputDir, "viewpoint-visual.svg");
  atomicWrite(svgPath, svgBytes);
  const svgHash = `sha256:${createHash("sha256").update(svgBytes).digest("hex")}`;
  let manifest = manifestFor(spec, svgHash);
  const initialValidation = validateManifest(manifest, outputDir);
  if (!initialValidation.valid) throw new Error(`Rendered ViewpointVisualV1 failed validation: ${validationDetails(initialValidation)}`);
  const manifestPath = join(outputDir, "viewpoint-visual-v1.json");
  atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));
  if (rasterize) {
    const command = spawnSync(process.execPath, [join(ROOT, "scripts", "rasterize_viewpoint_visual.cjs"), svgPath, manifestPath], { encoding: "utf8" });
    if (command.status !== 0) throw new Error(`PNG rasterization failed: ${(command.stderr || "").trim() || (command.stdout || "").trim()}`);
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const finalValidation = validateManifest(manifest, outputDir);
    if (!finalValidation.valid) throw new Error(`Rasterized ViewpointVisualV1 failed validation: ${validationDetails(finalValidation)}`);
  }
  return { manifest, manifest_path: manifestPath, svg_path: svgPath };
}

function parseCli(argv) {
  let spec = null, outputDir = null, svgOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--output-dir") {
      outputDir = argv[index + 1] ?? null;
      index += 1;
    } else if (item === "--svg-only") svgOnly = true;
    else if (spec === null) spec = item;
  }
  return { spec, outputDir, svgOnly };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCli(argv);
  let output;
  try {
    if (args.spec === null || args.outputDir === null) throw new Error("spec and --output-dir are required");
    const spec = JSON.parse(readFileSync(args.spec, "utf8"));
    const result = render(spec, args.outputDir, { rasterize: !args.svgOnly });
    output = {
      ok: true,
      grammar: result.manifest.grammar,
      payload_mode: result.manifest.payload_mode,
      manifest: result.manifest_path,
      svg: result.svg_path,
      png_derivatives: result.manifest.asset.png_derivatives.length,
    };
  } catch (error) {
    output = { ok: false, error: error.message };
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
