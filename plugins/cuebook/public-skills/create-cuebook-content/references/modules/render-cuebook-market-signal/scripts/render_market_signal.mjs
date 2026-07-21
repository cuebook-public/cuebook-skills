#!/usr/bin/env node
// Render a validated MarketSignalSpecV1 as a Cuebook Feed SVG.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { collapseWhitespace, displayWidth, htmlEscape } from "./pycompat.mjs";
import { validateManifest, validateSpec } from "./validate_market_signal.mjs";

export const WIDTH = 720;
export const HEIGHT = 420;
export const FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif";
export const PALETTES = {
  cuebook_light: {
    bg: "#FFFFFF", ink: "#151817", muted: "#66706B", line: "#DDE3E0", soft: "#F4F7F5",
    green: "#0A7F60", green_soft: "#EAF6F1", yellow: "#F3C51D", yellow_ink: "#7A5E00",
    yellow_soft: "#FFF8DE", red: "#B5424B", red_soft: "#FCEEEF",
  },
  cuebook_dark: {
    bg: "#111413", ink: "#F5F7F6", muted: "#AAB2AE", line: "#39413D", soft: "#1A1F1D",
    green: "#51C5A0", green_soft: "#193A30", yellow: "#F3C51D", yellow_ink: "#F3C51D",
    yellow_soft: "#362F13", red: "#F0777F", red_soft: "#3B2226",
  },
};

const PROTECTED_WRAP_TOKEN = /(?:\u7a97\u53e3\u770b|\u672a\u6765|\u81f3\u5c11|\u63a5\u4e0b\u6765|\u5148\u770b|\u770b)?\s*[+-]?\d[\d,.]*(?:\s*(?:-|–|—|~|\u81f3)\s*[+-]?\d[\d,.]*)?\s*(?:\u5206\u949f|\u5c0f\u65f6|\u5929|\u5468|\u4e2a\u6708|\u6708|\u5e74|days?|weeks?|months?|years?|%|pp|bps?)|\$?[A-Z][A-Z0-9./-]{1,11}/gu;

export function esc(value) {
  return htmlEscape(value);
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function wrapText(value, maxUnits, maxLines) {
  const text = collapseWhitespace(String(pyTruthy(value) ? value : "")).trim();
  if (!text) return [];
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(PROTECTED_WRAP_TOKEN)) {
    tokens.push(...Array.from(text.slice(cursor, match.index)));
    tokens.push(match[0]);
    cursor = match.index + match[0].length;
  }
  tokens.push(...Array.from(text.slice(cursor)));
  const lines = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current + token;
    if (current && displayWidth(candidate) > maxUnits) {
      lines.push(current.trimEnd());
      current = token.trimStart();
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current.trimEnd());
  const rendered = lines.join("").replaceAll(" ", "");
  if (Array.from(rendered).length < Array.from(text.replaceAll(" ", "")).length && lines.length > 0) {
    const chars = Array.from(lines.at(-1));
    while (chars.length > 0 && displayWidth(chars.join("") + "…") > maxUnits) chars.pop();
    lines[lines.length - 1] = chars.join("").trimEnd() + "…";
  }
  return lines.slice(0, maxLines);
}

export const wrap_text = wrapText;

export function textBlock(x, y, value, maxUnits, maxLines, size, lineHeight, fill, weight = 400, anchor = "start") {
  const lines = wrapText(value, maxUnits, maxLines);
  const spans = lines.map((line, index) => `<tspan x="${x.toFixed(1)}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join("");
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0" font-variant-numeric="tabular-nums">${spans}</text>`;
}

export function rect(x, y, width, height, fill, radius = 0, stroke = "none") {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}

function signalTime(value) {
  const parsed = new Date(value.replace("Z", "+00:00"));
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(parsed.getUTCMonth() + 1)}/${pad(parsed.getUTCDate())} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}`;
}

export function tradeColors(spec, colors) {
  const expression = spec.trade_logic.expression;
  if (["outright_short", "short_vol"].includes(expression)) return [colors.red, colors.red_soft];
  if (["options_convexity", "volatility_trade"].includes(expression)) return [colors.yellow_ink, colors.yellow_soft];
  return [colors.green, colors.green_soft];
}

export function brandMark(colors) {
  return [
    rect(608, 14, 20, 20, colors.yellow, 4),
    textBlock(618, 29, "C", 2, 1, 12, 14, "#111413", 800, "middle"),
    textBlock(692, 28, "Cuebook", 16, 1, 12, 14, colors.ink, 700, "end"),
  ];
}

export function renderKeyNumber(spec, colors) {
  const number = spec.key_number;
  const [accent, accentSoft] = tradeColors(spec, colors);
  const meta = [`${signalTime(number.as_of)} UTC`, ...spec.trade_logic.public_tags].join(" · ");
  const value = number.display_value;
  const valueSize = displayWidth(value) <= 13 ? 76 : displayWidth(value) <= 18 ? 62 : 50;
  const comparison = number.comparison;
  const parts = [
    textBlock(28, 27, meta, 78, 1, 10, 12, colors.muted, 650),
    ...brandMark(colors),
    textBlock(28, 84, spec.frame.headline, 43, 2, 29, 37, colors.ink, 800),
    rect(28, 171, 4, 96, accent, 2),
    textBlock(52, 231, value, 20, 1, valueSize, valueSize + 4, colors.ink, 800),
    textBlock(55, 267, number.label, 34, 1, 14, 17, accent, 700),
  ];
  if (comparison) {
    parts.push(
      rect(477, 190, 215, 64, accentSoft, 6),
      textBlock(494, 215, "LIKE-FOR-LIKE", 20, 1, 11, 13, accent, 700),
      textBlock(494, 240, comparison, 26, 1, 18, 21, colors.ink, 700),
    );
  }
  parts.push(
    `<line x1="28" y1="304" x2="692" y2="304" stroke="${colors.line}" stroke-width="1"/>`,
    textBlock(28, 342, spec.frame.interpretation, 57, 2, 20, 28, colors.ink, 650),
    rect(28, 382, 96, 4, accent, 2),
  );
  return parts;
}

export function renderKeyNews(spec, colors) {
  const news = spec.key_news;
  const [accent, accentSoft] = tradeColors(spec, colors);
  const tags = spec.trade_logic.public_tags.join(" · ");
  const action = spec.frame.headline;
  const actionSize = displayWidth(action) <= 42 ? 34 : 30;
  return [
    textBlock(28, 27, `${signalTime(news.published_at)} UTC · ${news.publisher}`, 48, 1, 12, 14, colors.muted, 600),
    ...brandMark(colors),
    textBlock(28, 72, tags, 70, 1, 14, 17, accent, 700),
    rect(28, 94, 4, 78, accent, 2),
    textBlock(52, 124, action, 42, 2, actionSize, actionSize + 8, colors.ink, 800),
    rect(28, 194, 664, 72, accentSoft, 6),
    textBlock(44, 216, "WHY", 8, 1, 11, 13, accent, 700),
    textBlock(44, 246, news.headline, 61, 2, 18, 22, colors.ink, 700),
    `<line x1="28" y1="290" x2="692" y2="290" stroke="${colors.line}" stroke-width="1"/>`,
    textBlock(28, 329, spec.frame.interpretation, 57, 2, 20, 28, colors.ink, 650),
    rect(28, 382, 96, 4, accent, 2),
  ];
}

export function renderSvg(spec) {
  const colors = PALETTES[spec.render.theme];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" data-signal-mode="${esc(spec.mode)}">`,
    `<title>${esc(spec.frame.headline)}</title>`,
    rect(0, 0, WIDTH, HEIGHT, colors.bg),
    ...(spec.mode === "key_number" ? renderKeyNumber(spec, colors) : renderKeyNews(spec, colors)),
    "</svg>",
  ];
  return `${parts.join("\n")}\n`;
}

export const render_svg = renderSvg;

function pythonUtcNow() {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

export function render(spec, outputDir) {
  const validation = validateSpec(spec);
  if (!validation.valid) throw new Error(JSON.stringify(validation, null, 2));
  mkdirSync(outputDir, { recursive: true });
  const svgPath = join(outputDir, "market-signal.svg");
  const manifestPath = join(outputDir, "market-signal-v1.json");
  const svg = renderSvg(spec);
  writeFileSync(svgPath, svg, "utf8");
  const contentHash = `sha256:${createHash("sha256").update(svg, "utf8").digest("hex")}`;
  const signal = spec.mode === "key_number" ? spec.key_number : spec.key_news;
  const manifest = {
    schema_version: "market-signal-v1",
    market_signal_id: spec.signal_id.replace("SIGSPEC_", "SIGNAL_"),
    spec_ref: spec.signal_id,
    mode: spec.mode,
    state: spec.state,
    generated_at: pythonUtcNow(),
    dimensions: { width: WIDTH, height: HEIGHT },
    theme: spec.render.theme,
    lineage: { ...spec.lineage, trade_logic_ref: spec.trade_logic.profile_ref },
    content: {
      category: spec.frame.category,
      asset_label: spec.frame.asset_label,
      headline: spec.frame.headline,
      interpretation: spec.frame.interpretation,
      strategy_tags: spec.trade_logic.public_tags,
      signal_time: spec.mode === "key_number" ? signal.as_of : signal.published_at,
      signal_label: spec.mode === "key_number" ? signal.label : signal.publisher,
      signal_value: spec.mode === "key_number" ? signal.display_value : null,
      signal_status: signal.status,
      watermark: "Cuebook",
    },
    asset: { svg_ref: "market-signal.svg", content_hash: contentHash },
    quality_report: spec.quality_report,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestValidation = validateManifest(manifest, outputDir);
  if (!manifestValidation.valid) throw new Error(JSON.stringify(manifestValidation, null, 2));
  return { svg_path: svgPath, manifest_path: manifestPath, manifest };
}

function parseArgs(argv) {
  const usage = "usage: render_market_signal.mjs [-h] --output-dir OUTPUT_DIR spec";
  let spec = null;
  let outputDir = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }
    if (arg === "--output-dir") {
      outputDir = argv[++index];
    } else if (arg.startsWith("--output-dir=")) {
      outputDir = arg.slice("--output-dir=".length);
    } else if (arg.startsWith("-")) {
      process.stderr.write(`${usage}\nrender_market_signal.mjs: error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    } else if (spec === null) {
      spec = arg;
    } else {
      process.stderr.write(`${usage}\nrender_market_signal.mjs: error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    }
  }
  if (!spec || !outputDir) {
    process.stderr.write(`${usage}\nrender_market_signal.mjs: error: spec and --output-dir are required\n`);
    process.exit(2);
  }
  return { spec, outputDir };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = JSON.parse(readFileSync(args.spec, "utf8"));
  const result = render(spec, args.outputDir);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: spec.mode, svg: result.svg_path, manifest: result.manifest_path }, null, 2)}\n`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) main();
