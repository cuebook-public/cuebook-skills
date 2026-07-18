#!/usr/bin/env node
// Render a validated MarketFigureSpecV1 into Cuebook SVG and MarketFigureV1.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collapseWhitespace,
  displayWidth,
  htmlEscape,
  pad2,
  pyFloatFixed,
  pyFromIsoformat,
  pyLstrip,
  pyNowUtcIsoformat,
  pyRound,
  pyRstrip,
  pyStrip,
  utcParts,
} from "../../render-cuebook-market-signal/scripts/pycompat.mjs";
import { validateManifest, validateSpec } from "./validate_market_figure.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wordmarkAsset = join(here, "..", "..", "direct-cuebook-viewpoint-visual", "assets", "cuebook-wordmark.svg");
const wordmarkPaths = [...readFileSync(wordmarkAsset, "utf8").matchAll(/<path\b[^>]+\/>/g)].map((match) => match[0]).join("\n");

export const WIDTH = 1200;
export const HEIGHT = 760;
export const COMPACT_WIDTH = 720;
export const COMPACT_HEIGHT = 420;
export const GRAMMAR_LABELS = {
  event_reaction: "新闻反应",
  relative_strength: "相对强弱",
  expectation_revision: "预期修正",
  fundamental_driver: "基本面驱动",
  positioning_pressure: "资金压力",
  sensitivity_curve: "敏感性曲线",
  instrument_map: "工具地图",
};
export const PALETTES = {
  cuebook_light: {
    bg: "#FFFFFF", surface: "#F7F9F8", surface_alt: "#FFF9E8", ink: "#151817",
    muted: "#66706B", line: "#E2E7E4", grid: "#E8ECEA", primary: "#0A7F60",
    benchmark: "#4B68CC", driver: "#315D57", context: "#69726D", accent_focus: "#946200",
    accent_positive: "#08765A", accent_comparison: "#315FB6", accent_support: "#166B75",
    accent_violet: "#6C55A3", yellow: "#F3C51D", yellow_ink: "#8A6A00", red: "#C43D4E",
    red_soft: "#FFF0F1", green_soft: "#EAF9F4", blue_soft: "#EEF2FF", white: "#FFFFFF",
  },
  cuebook_dark: {
    bg: "#151817", surface: "#1E2220", surface_alt: "#29271D", ink: "#F6F7F4",
    muted: "#A3AAA6", line: "#353B37", grid: "#303632", primary: "#2BC59A",
    benchmark: "#7694F0", driver: "#8CCFC0", context: "#A4ACA7", accent_focus: "#F0B33A",
    accent_positive: "#47D39D", accent_comparison: "#7EA4FF", accent_support: "#60C5D2",
    accent_violet: "#B9A2F4", yellow: "#F3C51D", yellow_ink: "#F5D65D", red: "#F0717A",
    red_soft: "#342326", green_soft: "#18322A", blue_soft: "#222A43", white: "#FFFFFF",
  },
};
const SERIES_COLORS = { primary: "primary", benchmark: "benchmark", driver: "driver", context: "context" };
const COLOR_ROLE_KEYS = {
  focus: "accent_focus", positive: "accent_positive", comparison: "accent_comparison",
  support: "accent_support", violet: "accent_violet", context: "context", risk: "red",
};
const STROKE_DASHES = { solid: "", dashed: "8 6", dotted: "2 6" };
const LEVEL_MARKER_KINDS = new Set(["baseline", "latest", "trigger", "target", "invalidation", "estimate"]);
const CURRENCY_SYMBOLS = { KRW: "₩", JPY: "¥", CNY: "¥", EUR: "€", GBP: "£" };
const ARGUMENT_KIND_LABELS = {
  event: "导火索", evidence: "我看到的", mechanism: "为什么先动", actor_action: "钱先去哪",
  market_effect: "我押什么", metric: "关键数据", condition: "要盯什么", countercase: "我可能错在",
  invalidation: "逻辑边界", settlement: "到期看",
};

const f1 = (value) => pyFloatFixed(Number(value), 1);
const pyString = (value) => {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
};

export function esc(value) {
  return htmlEscape(pyString(value));
}

export { displayWidth as display_width };

const PROTECTED_WRAP_TOKEN = /(?:窗口看|未来|至少|接下来|先看|看)?\s*[+-]?\d[\d,.]*(?:\s*(?:-|–|—|~|至)\s*[+-]?\d[\d,.]*)?\s*(?:分钟|小时|天|周|个月|月|年|days?|weeks?|months?|years?|%|pp|bps?)|\$?[A-Z][A-Z0-9./-]{1,11}/gu;

export function wrapText(value, maxUnits, maxLines) {
  const source = value ? pyString(value) : "";
  const text = pyStrip(collapseWhitespace(source));
  if (!text) return [];
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(PROTECTED_WRAP_TOKEN)) {
    tokens.push(...text.slice(cursor, match.index));
    tokens.push(match[0]);
    cursor = match.index + match[0].length;
  }
  tokens.push(...text.slice(cursor));
  const lines = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current + token;
    if (current && displayWidth(candidate) > maxUnits) {
      lines.push(pyRstrip(current));
      current = pyLstrip(token);
      if (lines.length === maxLines) break;
    } else current = candidate;
  }
  if (lines.length < maxLines && current) lines.push(pyRstrip(current));
  const visibleLength = Array.from(lines.join("").replaceAll(" ", "")).length;
  const textLength = Array.from(text.replaceAll(" ", "")).length;
  if (visibleLength < textLength && lines.length) {
    let tail = Array.from(lines.at(-1));
    while (tail.length && displayWidth(`${tail.join("")}…`) > maxUnits) tail = tail.slice(0, -1);
    lines[lines.length - 1] = `${pyRstrip(tail.join(""))}…`;
  }
  return lines.slice(0, maxLines);
}

export const wrap_text = wrapText;

export function textBlock(x, y, value, maxUnits, maxLines, size, lineHeight, fill, weight = 400, anchor = "start") {
  const lines = wrapText(value, maxUnits, maxLines);
  const font = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif";
  const spans = lines.map((line, index) => `<tspan x="${f1(x)}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join("");
  return `<text x="${f1(x)}" y="${f1(y)}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0" font-variant-numeric="tabular-nums">${spans}</text>`;
}

export function rect(x, y, width, height, fill, stroke = "none", radius = 7, strokeWidth = 1) {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(width)}" height="${f1(height)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

export function canonicalWordmark(x, y, color, scale = 1) {
  const paths = wordmarkPaths.replaceAll(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${color}"`);
  return `<g data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" transform="translate(${f1(x)} ${f1(y)}) scale(${pyFloatFixed(scale, 3)})">${paths}</g>`;
}

export function pill(x, y, label, fill, ink, width = null) {
  const resolvedWidth = width || Math.max(62, displayWidth(label) * 7 + 22);
  return rect(x, y, resolvedWidth, 28, fill, "none", 7) + textBlock(x + resolvedWidth / 2, y + 19, label, 22, 1, 13, 15, ink, 700, "middle");
}

export function renderArgumentPath(spec, colors, x, y, width, height, compact) {
  const argument = spec.argument_path;
  if (!argument) return [];
  const { nodes, edges } = argument;
  const gap = compact ? 26 : 24;
  const nodeWidth = (width - gap * (nodes.length - 1)) / nodes.length;
  const centerY = y + height / 2;
  const parts = [];
  edges.forEach((edge, index) => {
    const startX = x + nodeWidth * (index + 1) + gap * index;
    const endX = startX + gap;
    const dash = new Set(["challenges", "conditions"]).has(edge.relation) ? ' stroke-dasharray="4 4"' : "";
    const target = nodes[index + 1];
    const edgeColor = new Set(["countercase", "invalidation"]).has(target.kind)
      ? colors.red
      : new Set(["actor_action", "market_effect"]).has(target.kind) ? colors.primary : colors.driver;
    const lineWidth = compact ? 3.2 : 2;
    const arrowDepth = compact ? 8 : 6;
    const arrowHalfHeight = compact ? 5 : 4;
    parts.push(
      `<line data-argument-edge="${esc(edge.certainty)}" x1="${f1(startX)}" y1="${f1(centerY)}" x2="${f1(endX - arrowDepth)}" y2="${f1(centerY)}" stroke="${edgeColor}" stroke-width="${lineWidth}" stroke-linecap="round"${dash}/>` ,
      `<path d="M ${f1(endX - arrowDepth)} ${f1(centerY - arrowHalfHeight)} L ${f1(endX)} ${f1(centerY)} L ${f1(endX - arrowDepth)} ${f1(centerY + arrowHalfHeight)} Z" fill="${edgeColor}"/>`,
    );
    if (!compact && edge.label) parts.push(textBlock((startX + endX) / 2, centerY - 8, edge.label, 14, 1, 9, 11, colors.muted, 600, "middle"));
  });
  nodes.forEach((node, index) => {
    const nodeX = x + index * (nodeWidth + gap);
    const { status, kind } = node;
    let fill, stroke;
    if (kind === "event") [fill, stroke] = [colors.surface_alt, colors.yellow_ink];
    else if (new Set(["mechanism", "evidence", "metric"]).has(kind)) [fill, stroke] = [colors.blue_soft, colors.driver];
    else if (new Set(["countercase", "invalidation"]).has(kind)) [fill, stroke] = [colors.red_soft, colors.red];
    else [fill, stroke] = [colors.green_soft, colors.primary];
    parts.push(`<rect data-argument-node="${esc(node.id)}" data-node-status="${esc(status)}" x="${f1(nodeX)}" y="${f1(y)}" width="${f1(nodeWidth)}" height="${f1(height)}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`);
    parts.push(rect(nodeX, y, 4, height, stroke, "none", 2));
    const caption = ARGUMENT_KIND_LABELS[kind];
    const captionSize = compact ? 12 : 9;
    const captionUnits = Math.max(12, Math.trunc((nodeWidth - 18) / (compact ? 6.2 : 6)));
    parts.push(textBlock(nodeX + 9, y + (compact ? 18 : 13), caption, captionUnits, 1, captionSize, compact ? 14 : 11, stroke, 700));
    const labelY = y + (compact ? 47 : 31);
    const maxUnits = Math.max(14, Math.trunc((nodeWidth - 18) / (compact ? 7.6 : 6.2)));
    parts.push(textBlock(nodeX + 9, labelY, node.label, maxUnits, compact ? 2 : 1, compact ? 16 : 12, compact ? 18 : 13, colors.ink, 700));
  });
  return parts;
}

export function dedupe(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

export function parseTime(value) {
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
  if (!parsed) throw new Error(`Invalid isoformat string: '${value}'`);
  return { ...utcParts(parsed.epoch), epoch: parsed.epoch };
}

export function xNumeric(value, kind, categories) {
  if (kind === "time") return parseTime(pyString(value)).epoch;
  if (kind === "numeric") return Number(value);
  return categories.indexOf(pyString(value));
}

function trimFixed(value) {
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

export function fmtX(value, kind, categories) {
  if (kind === "time") {
    const parts = utcParts(value);
    return `${parts.month}月${parts.day}日`;
  }
  if (kind === "category") {
    const index = Math.max(0, Math.min(categories.length - 1, pyRound(value)));
    return categories[index];
  }
  if (Math.abs(value) >= 1000) return pyFloatFixed(value, 0, { grouping: true });
  if (Math.abs(value) >= 10) return trimFixed(pyFloatFixed(value, 1));
  return trimFixed(pyFloatFixed(value, 2));
}

export function fmtAxisX(value, kind, categories, unit) {
  if (kind === "numeric" && new Set(["%", "pct"]).has(unit)) return `${pyFloatFixed(value, 0)}%`;
  if (kind === "numeric" && unit === "x") return `${pyFloatFixed(value, 1)}×`;
  return fmtX(value, kind, categories);
}

export function fmtY(value, unit) {
  if (unit === "%") return Math.abs(value) >= 0.05 ? `${pyFloatFixed(value, 1, { sign: true })}%` : "0.0%";
  if (unit === "pct") return `${pyFloatFixed(value, 1)}%`;
  if (new Set(["USD", "$"]).has(unit)) {
    if (Math.abs(value) >= 1_000_000_000) return `$${pyFloatFixed(value / 1_000_000_000, 1)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${pyFloatFixed(value / 1_000_000, 1)}M`;
    if (Math.abs(value) >= 1_000) return `$${pyFloatFixed(value, 0, { grouping: true })}`;
    return trimFixed(`$${pyFloatFixed(value, 2, { grouping: true })}`);
  }
  if (Object.hasOwn(CURRENCY_SYMBOLS, unit)) {
    const symbol = CURRENCY_SYMBOLS[unit];
    if (Math.abs(value) >= 1_000_000_000) return `${symbol}${pyFloatFixed(value / 1_000_000_000, 2)}b`;
    if (Math.abs(value) >= 1_000_000) return `${symbol}${pyFloatFixed(value / 1_000_000, 2)}m`;
    if (Math.abs(value) >= 1_000) return `${symbol}${pyFloatFixed(value / 1_000, 1)}k`;
    return trimFixed(`${symbol}${pyFloatFixed(value, 2, { grouping: true })}`);
  }
  let rendered;
  if (Math.abs(value) >= 1_000_000_000) rendered = `${pyFloatFixed(value / 1_000_000_000, 1)}B`;
  else if (Math.abs(value) >= 1_000_000) rendered = `${pyFloatFixed(value / 1_000_000, 1)}M`;
  else if (Math.abs(value) >= 1_000) rendered = `${pyFloatFixed(value / 1_000, 1)}K`;
  else if (Math.abs(value) >= 100) rendered = pyFloatFixed(value, 0, { grouping: true });
  else if (Math.abs(value) >= 10) rendered = pyFloatFixed(value, 1);
  else rendered = trimFixed(pyFloatFixed(value, 2));
  if (unit === "x") return `${rendered}×`;
  if (unit === "pp") return `${rendered}pp`;
  return rendered;
}

export function fmtAxisY(value, unit) {
  if (new Set(["USD", "$"]).has(unit)) return `$${pyFloatFixed(value, 0, { grouping: true })}`;
  if (Object.hasOwn(CURRENCY_SYMBOLS, unit)) {
    const symbol = CURRENCY_SYMBOLS[unit];
    if (Math.abs(value) >= 1_000_000_000) return `${symbol}${pyFloatFixed(value / 1_000_000_000, 1)}b`;
    if (Math.abs(value) >= 1_000_000) return `${symbol}${pyFloatFixed(value / 1_000_000, 1)}m`;
    if (Math.abs(value) >= 1_000) return `${symbol}${pyFloatFixed(value / 1_000, 0)}k`;
    return `${symbol}${pyFloatFixed(value, 0, { grouping: true })}`;
  }
  return fmtY(value, unit);
}

export const fmt_y = fmtY;
export const fmt_axis_y = fmtAxisY;

export function isLevelMarker(marker) {
  return marker.y !== null && marker.y !== undefined && LEVEL_MARKER_KINDS.has(marker.kind);
}

export function markerColor(marker, colors) {
  const { kind } = marker;
  if (kind === "invalidation") return colors.red;
  if (new Set(["trigger", "target"]).has(kind)) return colors.primary;
  if (kind === "baseline") return colors.context;
  if (kind === "estimate") return colors.driver;
  return colors.yellow_ink;
}

export function seriesColor(series, colors) {
  return series.color_role ? colors[COLOR_ROLE_KEYS[series.color_role]] : colors[SERIES_COLORS[series.role]];
}

export function seriesDash(series, provisional = false) {
  let style = series.stroke_style ?? "solid";
  if (provisional && style === "solid") style = "dashed";
  const dash = STROKE_DASHES[style];
  return dash ? ` stroke-dasharray="${dash}"` : "";
}

export function compactSeries(spec) {
  const series = spec.curve.series;
  const focusIds = spec.render.focus_series_ids || [];
  if (focusIds.length) {
    const byId = new Map(series.map((item) => [item.id, item]));
    return focusIds.map((item) => byId.get(item));
  }
  return series.slice(0, 4);
}

export function showEndpointLabel(spec, series) {
  const endpointIds = spec.render.endpoint_series_ids || [];
  return !endpointIds.length || endpointIds.includes(series.id);
}

export function spreadLatestLabels(labels, minY, maxY, gap) {
  const ordered = [...labels].sort((left, right) => left[1] - right[1]);
  let placed = [];
  for (const [, targetY] of ordered) placed.push(Math.max(minY, !placed.length ? targetY : Math.max(targetY, placed.at(-1) + gap)));
  if (placed.length && placed.at(-1) > maxY) {
    const shift = placed.at(-1) - maxY;
    placed = placed.map((value) => value - shift);
  }
  if (placed.length && placed[0] < minY) {
    const shift = minY - placed[0];
    placed = placed.map((value) => value + shift);
  }
  return ordered.map((item, index) => [item[0], placed[index], item[2], item[3]]);
}

export function collectCategories(spec) {
  const categories = [];
  if (spec.curve.x_axis.kind !== "category") return categories;
  for (const series of spec.curve.series) {
    for (const point of series.points) {
      const value = pyString(point.x);
      if (!categories.includes(value)) categories.push(value);
    }
  }
  for (const marker of spec.curve.markers) {
    const value = pyString(marker.x);
    if (!categories.includes(value)) categories.push(value);
  }
  return categories;
}

export function niceCeiling(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const scale = 10 ** exponent;
  const normalized = value / scale;
  for (const candidate of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (normalized <= candidate) return candidate * scale;
  return 10 * scale;
}

export function axisDomains(spec, categories) {
  const xKind = spec.curve.x_axis.kind;
  const xs = spec.curve.series.flatMap((series) => series.points.map((point) => xNumeric(point.x, xKind, categories)));
  xs.push(...spec.curve.markers.map((marker) => xNumeric(marker.x, xKind, categories)));
  const ys = spec.curve.series.flatMap((series) => series.points.map((point) => Number(point.y)));
  ys.push(...spec.curve.markers.filter((marker) => marker.y !== null && marker.y !== undefined).map((marker) => Number(marker.y)));
  let xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  } else if (spec.grammar === "instrument_map") {
    const xPadding = (xMax - xMin) * 0.1;
    xMin -= xPadding;
    xMax += xPadding;
  }
  if (spec.curve.y_axis.zero_policy === "include") {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }
  const padding = yMin === yMax ? Math.max(Math.abs(yMin) * 0.1, 1) : (yMax - yMin) * 0.12;
  let lowerY = yMin - padding, upperY = yMax + padding;
  if (spec.curve.y_axis.zero_policy === "include" && Math.min(...ys) >= 0) {
    lowerY = 0;
    upperY = niceCeiling(Math.max(...ys) * 1.08);
  }
  return [xMin, xMax, lowerY, upperY];
}

export function renderPlot(spec, colors) {
  const plotX = 56, plotY = 258, plotW = 720, plotH = 326;
  const innerX = plotX + 56, innerY = plotY + 44, innerW = plotW - 78, innerH = plotH - 82;
  const categories = collectCategories(spec);
  const xKind = spec.curve.x_axis.kind;
  const [xMin, xMax, yMin, yMax] = axisDomains(spec, categories);
  const sx = (value) => innerX + (xNumeric(value, xKind, categories) - xMin) / (xMax - xMin) * innerW;
  const sy = (value) => innerY + (yMax - Number(value)) / (yMax - yMin) * innerH;
  const parts = [rect(plotX, plotY, plotW, plotH, colors.surface, colors.line, 7)];
  const latestObservedX = Math.max(...spec.curve.series.flatMap((series) => series.points.filter((point) => point.state !== "modelled").map((point) => xNumeric(point.x, xKind, categories))));
  const expiry = spec.curve.markers.find((marker) => marker.kind === "expiry");
  if (expiry) {
    const expiryX = xNumeric(expiry.x, xKind, categories);
    if (expiryX > latestObservedX) {
      const left = innerX + (latestObservedX - xMin) / (xMax - xMin) * innerW;
      parts.push(rect(left, innerY, Math.max(0, sx(expiry.x) - left), innerH, colors.surface_alt, "none", 0));
    }
  }

  for (let index = 0; index < 4; index += 1) {
    const value = yMax - index * (yMax - yMin) / 3;
    const y = sy(value);
    parts.push(
      `<line x1="${f1(innerX)}" y1="${f1(y)}" x2="${f1(innerX + innerW)}" y2="${f1(y)}" stroke="${colors.grid}" stroke-width="1"/>`,
      textBlock(innerX - 10, y + 4, fmtAxisY(value, spec.curve.y_axis.unit), 10, 1, 11, 13, colors.muted, 500, "end"),
    );
  }
  let tickValues;
  if (xKind === "category") {
    tickValues = Array.from({ length: categories.length }, (_, index) => Number(index));
    if (tickValues.length > 6) {
      const step = Math.max(1, Math.ceil(tickValues.length / 6));
      tickValues = tickValues.filter((_, index) => index % step === 0);
    }
  } else tickValues = Array.from({ length: 4 }, (_, index) => xMin + index * (xMax - xMin) / 3);
  for (const value of tickValues) {
    const x = innerX + (value - xMin) / (xMax - xMin) * innerW;
    parts.push(
      `<line x1="${f1(x)}" y1="${f1(innerY + innerH)}" x2="${f1(x)}" y2="${f1(innerY + innerH + 5)}" stroke="${colors.line}" stroke-width="1"/>`,
      textBlock(x, innerY + innerH + 22, fmtAxisX(value, xKind, categories, spec.curve.x_axis.unit), 12, 1, 11, 13, colors.muted, 500, "middle"),
    );
  }

  if (spec.grammar === "relative_strength" && spec.curve.series.length >= 2) {
    const [first, second] = spec.curve.series.slice(0, 2);
    const firstMap = new Map(first.points.map((point) => [pyString(point.x), point]));
    const secondMap = new Map(second.points.map((point) => [pyString(point.x), point]));
    const common = [...firstMap.keys()].filter((key) => secondMap.has(key) && firstMap.get(key).state === "sealed" && secondMap.get(key).state === "sealed");
    common.sort((left, right) => xNumeric(firstMap.get(left).x, xKind, categories) - xNumeric(firstMap.get(right).x, xKind, categories));
    if (common.length >= 2) {
      const upper = common.map((key) => `${f1(sx(firstMap.get(key).x))},${f1(sy(firstMap.get(key).y))}`).join(" ");
      const lower = [...common].reverse().map((key) => `${f1(sx(secondMap.get(key).x))},${f1(sy(secondMap.get(key).y))}`).join(" ");
      parts.push(`<polygon points="${upper} ${lower}" fill="${colors.primary}" opacity="0.10"/>`);
    }
  }

  let lastMarkerX = -10000, markerLane = 0;
  for (const marker of spec.curve.markers) {
    const x = sx(marker.x), markerInk = markerColor(marker, colors);
    const dash = marker.status === "proposed" ? "5 5" : "3 4";
    if (isLevelMarker(marker)) {
      const y = sy(marker.y);
      const labelWidth = Math.max(62, Math.min(122, displayWidth(marker.label) * 7 + 20));
      const labelY = Math.max(innerY + 3, Math.min(y - 14, innerY + innerH - 28));
      parts.push(
        `<line data-marker-orientation="horizontal" x1="${f1(innerX)}" y1="${f1(y)}" x2="${f1(innerX + innerW)}" y2="${f1(y)}" stroke="${markerInk}" stroke-width="1.5" stroke-dasharray="${dash}"/>`,
        pill(innerX + 6, labelY, marker.label, colors.bg, markerInk, labelWidth),
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="4.5" fill="${markerInk}" stroke="${colors.bg}" stroke-width="2"/>`,
      );
      continue;
    }
    markerLane = x - lastMarkerX < 92 ? markerLane + 1 : 0;
    markerLane %= 3;
    lastMarkerX = x;
    const labelWidth = Math.max(54, Math.min(68, displayWidth(marker.label) * 7 + 20));
    const labelX = Math.max(innerX, Math.min(x - labelWidth / 2, innerX + innerW - labelWidth));
    const labelY = innerY + innerH - 37 - markerLane * 31;
    parts.push(`<line data-marker-orientation="vertical" x1="${f1(x)}" y1="${f1(innerY)}" x2="${f1(x)}" y2="${f1(innerY + innerH)}" stroke="${markerInk}" stroke-width="1.5" stroke-dasharray="${dash}"/>`);
    if (!(marker.kind === "event" && x > innerX + innerW - 36)) parts.push(pill(labelX, labelY, marker.label, colors.surface_alt, colors.yellow_ink, labelWidth));
    if (marker.y !== null && marker.y !== undefined) parts.push(`<circle cx="${f1(x)}" cy="${f1(sy(marker.y))}" r="5" fill="${markerInk}" stroke="${colors.bg}" stroke-width="2"/>`);
  }

  let legendX = innerX, legendY = plotY + 25;
  const latestLabels = [];
  for (const series of spec.curve.series) {
    const color = seriesColor(series, colors);
    if (spec.grammar === "instrument_map") {
      const points = series.points;
      const ranked = [...points].sort((left, right) => Number(left.x) - Number(right.x));
      const pointColors = [colors.primary, colors.benchmark, colors.driver, colors.red];
      ranked.forEach((point, index) => {
        const riskRank = ranked.length === 1 ? 0 : pyRound(index * (pointColors.length - 1) / (ranked.length - 1));
        const pointColor = pointColors[riskRank];
        const pointX = sx(point.x), pointY = sy(point.y);
        const fill = point.state === "forming" ? colors.bg : pointColor;
        let labelY = index % 2 === 0 ? pointY - 13 : pointY + 27;
        labelY = Math.max(innerY + 13, Math.min(labelY, innerY + innerH - 5));
        parts.push(
          `<circle data-plot-kind="instrument-map" data-instrument="${esc(point.label)}" cx="${f1(pointX)}" cy="${f1(pointY)}" r="8" fill="${fill}" stroke="${pointColor}" stroke-width="3"/>`,
          textBlock(pointX, labelY, point.label, 18, 1, 12, 14, pointColor, 800, "middle"),
        );
      });
      parts.push(
        textBlock(innerX, plotY + 29, series.label, 36, 1, 12, 14, colors.ink, 700),
        textBlock(innerX + innerW, innerY + innerH + 39, spec.curve.x_axis.label, 30, 1, 11, 13, colors.muted, 600, "end"),
      );
      continue;
    }
    if (spec.render.show_legend ?? true) {
      const legendWidth = Math.max(108, displayWidth(series.label) * 7 + 58);
      if (legendX > innerX && legendX + legendWidth > innerX + innerW) {
        legendX = innerX;
        legendY += 18;
      }
      parts.push(
        `<line x1="${f1(legendX)}" y1="${f1(legendY)}" x2="${f1(legendX + 20)}" y2="${f1(legendY)}" stroke="${color}" stroke-width="3" stroke-linecap="round"${seriesDash(series)}/>` ,
        textBlock(legendX + 28, legendY + 4, series.label, 16, 1, 11, 13, colors.ink, 600),
      );
      legendX += legendWidth;
    }
    const { points } = series;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1], current = points[index];
      const provisional = new Set(["forming", "modelled"]).has(current.state) || new Set(["forming", "modelled"]).has(previous.state);
      parts.push(`<line data-series-id="${esc(series.id)}" data-data-kind="${esc(series.data_kind)}" x1="${f1(sx(previous.x))}" y1="${f1(sy(previous.y))}" x2="${f1(sx(current.x))}" y2="${f1(sy(current.y))}" stroke="${color}" stroke-width="3" stroke-linecap="round"${seriesDash(series, provisional)}/>`);
    }
    points.forEach((point, index) => {
      if (index === points.length - 1 || point.state !== "sealed") {
        const fill = point.state !== "sealed" ? colors.bg : color;
        parts.push(`<circle cx="${f1(sx(point.x))}" cy="${f1(sy(point.y))}" r="4.5" fill="${fill}" stroke="${color}" stroke-width="2"/>`);
      }
    });
    const latest = points.at(-1);
    const latestValue = fmtY(Number(latest.y), series.unit);
    const latestLabel = (spec.render.show_legend ?? true) ? latestValue : `${series.label} ${latestValue}`;
    if (showEndpointLabel(spec, series)) latestLabels.push([sx(latest.x), sy(latest.y), latestLabel, color]);
  }
  const positionedLabels = spreadLatestLabels(
    latestLabels.map(([x, y, label, color]) => [x, Math.max(innerY + 16, Math.min(y - 8, innerY + innerH - 8)), label, color]),
    innerY + 16, innerY + innerH - 5, 17,
  );
  for (const [x, labelY, label, color] of positionedLabels) {
    const nearRight = x > innerX + innerW - 110;
    const labelX = nearRight ? x - 9 : x + 9;
    parts.push(textBlock(labelX, labelY, label, 22, 1, 12, 14, color, 700, nearRight ? "end" : "start"));
  }
  parts.push(textBlock(plotX + plotW - 18, plotY + 29, spec.curve.y_axis.label, 22, 1, 11, 13, colors.muted, 500, "end"));
  return parts;
}

export function renderSidePanel(spec, colors) {
  const x = 804, y = 258, width = 340, height = 326;
  const parts = [rect(x, y, width, height, colors.surface, colors.line, 7)];
  const news = spec.news_anchor;
  let cursor = y + 28;
  if (news) {
    const statusLabel = { observed: "已确认", provisional: "快讯", unconfirmed: "待核实" }[news.status];
    parts.push(
      textBlock(x + 20, cursor, "新闻锚点", 18, 1, 13, 15, colors.yellow_ink, 700),
      pill(x + width - 92, cursor - 20, statusLabel, colors.surface_alt, colors.yellow_ink, 72),
      textBlock(x + 20, cursor + 38, news.headline, 33, 3, 17, 23, colors.ink, 700),
    );
    const published = parseTime(news.published_at);
    parts.push(textBlock(x + 20, cursor + 112, `${news.publisher} · ${published.month}月${published.day}日 ${pad2(published.hour)}:${pad2(published.minute)} UTC`, 38, 1, 11, 13, colors.muted, 500));
    cursor += 140;
    parts.push(`<line x1="${f1(x + 20)}" y1="${f1(cursor)}" x2="${f1(x + width - 20)}" y2="${f1(cursor)}" stroke="${colors.line}" stroke-width="1"/>`);
    cursor += 28;
  } else {
    parts.push(textBlock(x + 20, cursor, "关键数字", 20, 1, 13, 15, colors.muted, 700));
    cursor += 28;
  }
  const numbers = spec.key_numbers;
  const columns = numbers.length >= 3 ? 2 : 1;
  const cellW = (width - 40 - (columns === 2 ? 12 : 0)) / columns;
  const rows = Math.ceil(numbers.length / columns);
  const available = y + height - cursor - 12;
  const cellH = Math.max(62, available / rows);
  numbers.forEach((number, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const cellX = x + 20 + column * (cellW + 12), cellY = cursor + row * cellH;
    if (column) parts.push(`<line x1="${f1(cellX - 6)}" y1="${f1(cellY)}" x2="${f1(cellX - 6)}" y2="${f1(cellY + cellH - 10)}" stroke="${colors.line}" stroke-width="1"/>`);
    const roleColor = number.role === "risk" ? colors.red : number.role === "magnitude" ? colors.primary : number.role === "comparison" ? colors.benchmark : colors.ink;
    parts.push(
      textBlock(cellX, cellY + 14, number.label, 20, 1, 11, 13, colors.muted, 600),
      textBlock(cellX, cellY + 46, number.display_value, 16, 1, columns === 1 ? 25 : 22, 27, roleColor, 800),
    );
  });
  return parts;
}

export function renderBottom(spec, colors) {
  const y = 612, height = 88;
  const counter = spec.countercase, settlement = spec.settlement;
  const parts = [];
  if (counter && settlement.settleable) {
    parts.push(
      rect(56, y, 516, height, colors.red_soft, colors.red, 7),
      textBlock(76, y + 25, counter.label, 28, 1, 12, 14, colors.red, 700),
      textBlock(76, y + 53, counter.condition, 50, 2, 14, 18, colors.ink, 600),
      rect(592, y, 552, height, colors.surface_alt, colors.yellow, 7),
      textBlock(612, y + 25, "如何结算", 18, 1, 12, 14, colors.yellow_ink, 700),
      textBlock(612, y + 53, settlement.success_line, 48, 2, 14, 18, colors.ink, 600),
    );
  } else if (settlement.settleable) {
    parts.push(
      rect(56, y, 1088, height, colors.surface_alt, colors.yellow, 7),
      textBlock(76, y + 25, "如何结算", 18, 1, 12, 14, colors.yellow_ink, 700),
      textBlock(76, y + 56, settlement.success_line, 100, 2, 16, 21, colors.ink, 600),
    );
  } else if (counter) {
    parts.push(
      rect(56, y, 1088, height, colors.red_soft, colors.red, 7),
      textBlock(76, y + 25, counter.label, 18, 1, 12, 14, colors.red, 700),
      textBlock(76, y + 56, counter.condition, 100, 2, 16, 21, colors.ink, 600),
    );
  }
  return parts;
}

export function allSources(spec) {
  const values = [];
  for (const series of spec.curve.series) {
    values.push(series.source_ref);
    if (series.baseline) values.push(series.baseline.source_ref);
    values.push(...series.points.map((point) => point.source_ref));
  }
  values.push(...spec.curve.markers.map((marker) => marker.source_ref));
  values.push(...spec.key_numbers.map((number) => number.source_ref));
  if (spec.news_anchor) values.push(...spec.news_anchor.source_refs);
  if (spec.countercase) values.push(...spec.countercase.source_refs);
  if (spec.argument_path) for (const node of spec.argument_path.nodes) values.push(...node.source_refs);
  return dedupe(values);
}

export function dominantNumber(spec) {
  const priorities = { settlement: 0, comparison: 1, magnitude: 2, driver: 3, risk: 4 };
  return [...spec.key_numbers].sort((left, right) => (priorities[left.role] ?? 9) - (priorities[right.role] ?? 9))[0];
}

export function renderCompactPlot(spec, colors, plotY = 132, plotH = 220) {
  const plotX = 28, plotW = 664;
  const innerX = plotX + 42, innerY = plotY + 34, innerW = plotW - 64, innerH = plotH - 74;
  const selectedSeries = compactSeries(spec);
  const plotSpec = { ...spec, curve: { ...spec.curve, series: selectedSeries } };
  const categories = collectCategories(plotSpec);
  const xKind = spec.curve.x_axis.kind;
  const [xMin, xMax, yMin, yMax] = axisDomains(plotSpec, categories);
  const sx = (value) => innerX + (xNumeric(value, xKind, categories) - xMin) / (xMax - xMin) * innerW;
  const sy = (value) => innerY + (yMax - Number(value)) / (yMax - yMin) * innerH;
  const parts = [rect(plotX, plotY, plotW, plotH, colors.surface, colors.line, 7)];
  const observedXs = selectedSeries.flatMap((series) => series.points.filter((point) => point.state !== "modelled").map((point) => xNumeric(point.x, xKind, categories)));
  const expiry = spec.curve.markers.find((marker) => marker.kind === "expiry");
  if (expiry && observedXs.length) {
    const latestX = Math.max(...observedXs), expiryX = xNumeric(expiry.x, xKind, categories);
    if (expiryX > latestX) {
      const left = innerX + (latestX - xMin) / (xMax - xMin) * innerW;
      parts.push(rect(left, innerY, Math.max(0, sx(expiry.x) - left), innerH, colors.surface_alt, "none", 0));
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const value = yMax - index * (yMax - yMin) / 3;
    const y = sy(value);
    const stroke = Math.abs(value) < (yMax - yMin) * 0.04 ? colors.line : colors.grid;
    const width = stroke === colors.line ? 1.5 : 1;
    parts.push(
      `<line x1="${f1(innerX)}" y1="${f1(y)}" x2="${f1(innerX + innerW)}" y2="${f1(y)}" stroke="${stroke}" stroke-width="${width}"/>`,
      textBlock(innerX - 8, y + 3, fmtAxisY(value, spec.curve.y_axis.unit), 9, 1, 10, 12, colors.muted, 500, "end"),
    );
  }
  if (spec.grammar !== "instrument_map" && yMin <= 0 && 0 <= yMax) {
    const zeroY = sy(0);
    const zeroLabel = new Set(["%", "pct"]).has(spec.curve.y_axis.unit) ? "0% 基准" : "0 基准";
    parts.push(
      `<line x1="${f1(innerX)}" y1="${f1(zeroY)}" x2="${f1(innerX + innerW)}" y2="${f1(zeroY)}" stroke="${colors.line}" stroke-width="1.5"/>`,
      textBlock(innerX + 6, zeroY - 5, zeroLabel, 12, 1, 10, 12, colors.muted, 600),
    );
  }
  let tickValues = [xMin, (xMin + xMax) / 2, xMax];
  if (xKind === "category") tickValues = [...new Set([0, Math.max(0, Math.floor(categories.length / 2)), Math.max(0, categories.length - 1)])].sort((left, right) => left - right);
  for (const value of tickValues) {
    const x = innerX + (value - xMin) / (xMax - xMin) * innerW;
    parts.push(textBlock(x, innerY + innerH + 18, fmtAxisX(value, xKind, categories, spec.curve.x_axis.unit), 12, 1, 10, 12, colors.muted, 500, "middle"));
  }
  let legendX = innerX;
  for (const series of selectedSeries) {
    const color = seriesColor(series, colors);
    if (spec.grammar === "instrument_map") continue;
    if (spec.render.show_legend ?? true) {
      parts.push(
        `<line x1="${f1(legendX)}" y1="${f1(plotY + 18)}" x2="${f1(legendX + 16)}" y2="${f1(plotY + 18)}" stroke="${color}" stroke-width="3" stroke-linecap="round"${seriesDash(series)}/>` ,
        textBlock(legendX + 22, plotY + 21, series.label, 14, 1, 10, 12, colors.ink, 700),
      );
      legendX += Math.max(72, displayWidth(series.label) * 6 + 40);
    }
  }
  if (spec.grammar === "relative_strength" && selectedSeries.length >= 2) {
    const [first, second] = selectedSeries.slice(0, 2);
    const firstMap = new Map(first.points.map((point) => [pyString(point.x), point]));
    const secondMap = new Map(second.points.map((point) => [pyString(point.x), point]));
    const common = [...firstMap.keys()].filter((key) => secondMap.has(key) && firstMap.get(key).state === "sealed" && secondMap.get(key).state === "sealed");
    common.sort((left, right) => xNumeric(firstMap.get(left).x, xKind, categories) - xNumeric(firstMap.get(right).x, xKind, categories));
    if (common.length >= 2) {
      const upper = common.map((key) => `${f1(sx(firstMap.get(key).x))},${f1(sy(firstMap.get(key).y))}`).join(" ");
      const lower = [...common].reverse().map((key) => `${f1(sx(secondMap.get(key).x))},${f1(sy(secondMap.get(key).y))}`).join(" ");
      parts.push(`<polygon points="${upper} ${lower}" fill="${colors.primary}" opacity="0.10"/>`);
    }
  }

  let markerLane = 0, lastMarkerX = -10000;
  for (const marker of spec.curve.markers) {
    const x = sx(marker.x), markerInk = markerColor(marker, colors);
    const dash = marker.status === "proposed" ? "5 5" : "3 4";
    if (isLevelMarker(marker)) {
      const y = sy(marker.y);
      const labelY = Math.max(innerY + 10, Math.min(y - 5, innerY + innerH - 20));
      parts.push(
        `<line data-marker-orientation="horizontal" x1="${f1(innerX)}" y1="${f1(y)}" x2="${f1(innerX + innerW)}" y2="${f1(y)}" stroke="${markerInk}" stroke-width="1.2" stroke-dasharray="${dash}"/>`,
        textBlock(innerX + 6, labelY, marker.label, 20, 1, 10, 12, markerInk, 700),
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="4" fill="${markerInk}" stroke="${colors.bg}" stroke-width="2"/>`,
      );
      continue;
    }
    parts.push(`<line data-marker-orientation="vertical" x1="${f1(x)}" y1="${f1(innerY)}" x2="${f1(x)}" y2="${f1(innerY + innerH)}" stroke="${markerInk}" stroke-width="1.2" stroke-dasharray="${dash}"/>`);
    if (new Set(["event", "publication", "expiry"]).has(marker.kind)) {
      markerLane = x - lastMarkerX < 72 ? markerLane + 1 : 0;
      markerLane %= 2;
      const nearRight = x > innerX + innerW - 50;
      const labelY = nearRight ? plotY + 21 : innerY + innerH - 8 - markerLane * 15;
      const anchor = nearRight ? "end" : "start", labelX = nearRight ? x - 5 : x + 5;
      parts.push(textBlock(labelX, labelY, marker.label, 8, 1, 10, 12, colors.yellow_ink, 700, anchor));
      lastMarkerX = x;
    }
    if (marker.y !== null && marker.y !== undefined) parts.push(`<circle cx="${f1(x)}" cy="${f1(sy(marker.y))}" r="4" fill="${markerInk}" stroke="${colors.bg}" stroke-width="2"/>`);
  }

  const latestLabels = [];
  for (const series of selectedSeries) {
    const color = seriesColor(series, colors), points = series.points;
    if (spec.grammar === "instrument_map") {
      const ranked = [...points].sort((left, right) => Number(left.x) - Number(right.x));
      const pointColors = [colors.primary, colors.benchmark, colors.driver, colors.red];
      ranked.forEach((point, index) => {
        const riskRank = ranked.length === 1 ? 0 : pyRound(index * (pointColors.length - 1) / (ranked.length - 1));
        const pointColor = pointColors[riskRank];
        const pointX = sx(point.x), pointY = sy(point.y);
        const fill = point.state === "forming" ? colors.bg : pointColor;
        let labelY = index % 2 === 0 ? pointY - 11 : pointY + 23;
        labelY = Math.max(innerY + 11, Math.min(labelY, innerY + innerH - 4));
        parts.push(
          `<circle data-plot-kind="instrument-map" data-instrument="${esc(point.label)}" cx="${f1(pointX)}" cy="${f1(pointY)}" r="7" fill="${fill}" stroke="${pointColor}" stroke-width="2.5"/>`,
          textBlock(pointX, labelY, point.label, 16, 1, 11, 13, pointColor, 800, "middle"),
        );
      });
      continue;
    }
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1], current = points[index];
      const provisional = new Set(["forming", "modelled"]).has(previous.state) || new Set(["forming", "modelled"]).has(current.state);
      parts.push(`<line data-series-id="${esc(series.id)}" data-data-kind="${esc(series.data_kind)}" x1="${f1(sx(previous.x))}" y1="${f1(sy(previous.y))}" x2="${f1(sx(current.x))}" y2="${f1(sy(current.y))}" stroke="${color}" stroke-width="2.8" stroke-linecap="round"${seriesDash(series, provisional)}/>`);
    }
    const latest = points.at(-1);
    parts.push(`<circle cx="${f1(sx(latest.x))}" cy="${f1(sy(latest.y))}" r="4" fill="${latest.state !== "sealed" ? colors.bg : color}" stroke="${color}" stroke-width="2"/>`);
    const latestValue = fmtY(Number(latest.y), series.unit);
    const latestLabel = (spec.render.show_legend ?? true) ? latestValue : `${series.label} ${latestValue}`;
    if (showEndpointLabel(spec, series)) latestLabels.push([sx(latest.x), sy(latest.y), latestLabel, color]);
  }
  const positionedLabels = spreadLatestLabels(
    latestLabels.map(([x, y, label, color]) => [x, Math.max(innerY + 10, Math.min(y - 7, innerY + innerH - 4)), label, color]),
    innerY + 10, innerY + innerH - 4, 15,
  );
  for (const [x, labelY, label, color] of positionedLabels) {
    const nearRight = x > innerX + innerW - 90;
    parts.push(textBlock(nearRight ? x - 7 : x + 7, labelY, label, 10, 1, 10, 12, color, 800, nearRight ? "end" : "start"));
  }
  if (spec.grammar === "instrument_map") {
    parts.push(
      textBlock(plotX + plotW - 12, plotY + 20, spec.curve.y_axis.label, 24, 1, 9, 11, colors.muted, 600, "end"),
      textBlock(innerX + innerW, innerY + innerH + 32, spec.curve.x_axis.label, 26, 1, 9, 11, colors.muted, 600, "end"),
    );
  }
  return parts;
}

function compactTimestamp(parts) {
  return `${pad2(parts.month)}/${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)} UTC`;
}

function editorialTimestamp(parts) {
  return `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)} UTC`;
}

export function renderCompactSvg(spec) {
  const colors = PALETTES[spec.render.theme];
  const dominant = dominantNumber(spec);
  const valueColor = dominant.role === "risk" ? colors.red : colors.primary;
  const news = spec.news_anchor;
  const hasArgument = (spec.render.semantic_mode ?? "curve_only") === "argument_curve" && Boolean(spec.argument_path);
  const cutoff = parseTime(spec.lineage.decision_cutoff_at);
  const timestamp = compactTimestamp(cutoff);
  const tradeLogic = spec.trade_logic;
  const meta = [timestamp, ...(tradeLogic ? tradeLogic.public_tags : [spec.frame.kicker])].join(" · ");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COMPACT_WIDTH}" height="${COMPACT_HEIGHT}" viewBox="0 0 ${COMPACT_WIDTH} ${COMPACT_HEIGHT}">`,
    rect(0, 0, COMPACT_WIDTH, COMPACT_HEIGHT, colors.bg, "none", 0),
    textBlock(28, 24, meta, 76, 1, 10, 12, colors.muted, 700),
    textBlock(28, 57, spec.frame.headline, 40, 2, 22, 28, colors.ink, 800),
    textBlock(692, 24, dominant.label, 20, 1, 10, 12, colors.muted, 600, "end"),
    textBlock(692, 58, dominant.display_value, 16, 1, 28, 31, valueColor, 800, "end"),
  ];
  if (hasArgument) {
    parts.push(...renderArgumentPath(spec, colors, 28, 94, 664, 80, true));
    parts.push(...renderCompactPlot(spec, colors, 186, 206));
  } else parts.push(textBlock(28, 120, spec.curve.title, 42, 1, 11, 13, colors.ink, 700));
  if (news && !hasArgument) {
    const published = parseTime(news.published_at);
    const newsLine = `${pad2(published.month)}/${pad2(published.day)} · ${news.headline} · ${news.publisher}`;
    parts.push(
      `<circle cx="687" cy="116" r="4" fill="${colors.yellow}" stroke="${colors.yellow_ink}" stroke-width="1"/>`,
      textBlock(677, 120, newsLine, 46, 1, 10, 12, colors.muted, 600, "end"),
    );
  }
  if (!hasArgument) parts.push(...renderCompactPlot(spec, colors));
  parts.push(canonicalWordmark(COMPACT_WIDTH - 73 - 18, COMPACT_HEIGHT - 14 - 16, colors.muted));
  parts.push("</svg>");
  return `${parts.join("\n")}\n`;
}

export function renderEditorialSvg(spec) {
  const colors = PALETTES[spec.render.theme];
  const hasArgument = (spec.render.semantic_mode ?? "curve_only") === "argument_curve" && Boolean(spec.argument_path);
  const cutoff = parseTime(spec.lineage.decision_cutoff_at);
  const tradeLogic = spec.trade_logic;
  const meta = [editorialTimestamp(cutoff), ...(tradeLogic ? tradeLogic.public_tags : [GRAMMAR_LABELS[spec.grammar]])].join(" · ");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    rect(0, 0, WIDTH, HEIGHT, colors.bg, "none", 0),
    textBlock(56, 43, meta, 100, 1, 14, 17, colors.muted, 700),
    textBlock(56, 92, spec.frame.headline, 66, 2, 30, 38, colors.ink, 800),
    textBlock(56, 173, spec.frame.viewpoint, 105, 2, 16, 22, colors.muted, 500),
  ];
  if (hasArgument) parts.push(...renderArgumentPath(spec, colors, 56, 205, 1088, 42, false));
  else parts.push(textBlock(56, 235, spec.curve.title, 60, 1, 15, 18, colors.ink, 700));
  parts.push(...renderPlot(spec, colors));
  parts.push(...renderSidePanel(spec, colors));
  parts.push(...renderBottom(spec, colors));
  parts.push(canonicalWordmark(WIDTH - 73 - 32, HEIGHT - 14 - 28, colors.muted));
  parts.push("</svg>");
  return `${parts.join("\n")}\n`;
}

export function renderSvg(spec) {
  return spec.render.layout === "compact" ? renderCompactSvg(spec) : renderEditorialSvg(spec);
}

export function render(spec, outputDir) {
  const result = validateSpec(spec);
  if (!result.valid) {
    const details = result.errors.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw new Error(`Invalid MarketFigureSpecV1: ${details}`);
  }
  if (spec.quality_report.decision === "blocked") throw new Error("Blocked figure specs cannot be rendered.");
  mkdirSync(outputDir, { recursive: true });
  const svgPath = join(outputDir, "market-figure.svg");
  writeFileSync(svgPath, renderSvg(spec), "utf8");
  const contentHash = `sha256:${createHash("sha256").update(readFileSync(svgPath)).digest("hex")}`;
  const sources = allSources(spec);
  const argumentNodes = spec.argument_path ? (spec.argument_path.nodes ?? []) : [];
  const tradeLogic = spec.trade_logic;
  const suffix = spec.spec_id.startsWith("FIGSPEC_") ? spec.spec_id.slice("FIGSPEC_".length) : spec.spec_id;
  const manifest = {
    schema_version: "market-figure-v1",
    figure_id: `FIGURE_${suffix}_r${spec.revision}_${spec.grammar}`,
    spec_ref: spec.spec_id,
    grammar: spec.grammar,
    layout: spec.render.layout,
    state: spec.state,
    generated_at: pyNowUtcIsoformat().replace("+00:00", "Z"),
    theme: spec.render.theme,
    dimensions: { width: spec.render.width, height: spec.render.height },
    lineage: {
      input_artifact_refs: spec.lineage.input_artifact_refs,
      series_refs: spec.curve.series.map((item) => item.id),
      marker_refs: spec.curve.markers.map((item) => item.id),
      key_number_refs: spec.key_numbers.map((item) => item.id),
      news_fact_refs: spec.lineage.news_fact_refs,
      source_refs: sources,
      argument_node_refs: argumentNodes.map((item) => item.id),
      trade_logic_ref: tradeLogic ? tradeLogic.profile_ref : null,
      settlement_claim_ref: spec.lineage.settlement_claim_ref,
    },
    content: {
      headline: spec.frame.headline,
      viewpoint: spec.frame.viewpoint,
      curve_title: spec.curve.title,
      news_headline: spec.news_anchor ? spec.news_anchor.headline : null,
      countercase_line: spec.countercase ? spec.countercase.condition : null,
      settlement_line: spec.settlement.success_line,
      argument_path_labels: argumentNodes.map((item) => item.label),
      strategy_tags: tradeLogic ? tradeLogic.public_tags : [],
      watermark: "Cuebook",
    },
    asset: { svg_ref: "market-figure.svg", content_hash: contentHash },
    quality_report: spec.quality_report,
  };
  const manifestValidation = validateManifest(manifest, outputDir);
  if (!manifestValidation.valid) {
    const details = manifestValidation.errors.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw new Error(`Rendered MarketFigureV1 failed validation: ${details}`);
  }
  const manifestPath = join(outputDir, "market-figure-v1.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifest_path: manifestPath, svg_path: svgPath };
}

function parseArgs(argv) {
  let spec = null, outputDir = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") outputDir = argv[++index];
    else if (spec === null) spec = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (spec === null) throw new Error("the following arguments are required: spec");
  if (outputDir === null) throw new Error("the following arguments are required: --output-dir");
  return { spec, outputDir };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: render_market_figure.mjs spec --output-dir OUTPUT_DIR\nrender_market_figure.mjs: error: ${error.message}\n`);
    return 2;
  }
  let result;
  try {
    const spec = JSON.parse(readFileSync(args.spec, "utf8"));
    result = render(spec, args.outputDir);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    grammar: result.manifest.grammar,
    state: result.manifest.state,
    manifest: result.manifest_path,
    svg: result.svg_path,
  }, null, 2)}\n`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
