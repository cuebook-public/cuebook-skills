#!/usr/bin/env node
// Audit a rendered Cuebook chart for public-style leakage and design locks.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const finding = (code, message) => ({ code, message });
export const local_name = (tag) => String(tag).split("}").at(-1);

function attrs(source) {
  const result = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gs)) result[match[1]] = match[3];
  return result;
}

function textContent(source) {
  return source.replace(/<[^>]*>/g, " ")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

export function audit(file) {
  const errors = [];
  const warnings = [];
  let source;
  try { source = readFileSync(file, "utf8"); }
  catch (error) { return { valid: false, errors: [finding("SVG_READ", error.message)], warnings: [] }; }
  const rootMatch = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[^]*?-->\s*)?<([\w:.-]+)\b([^>]*)>/i.exec(source);
  if (!rootMatch || !source.includes("</")) return { valid: false, errors: [finding("SVG_READ", "no element found")], warnings: [] };
  const rootName = rootMatch[1].split(":").at(-1);
  const rootAttrs = attrs(rootMatch[2]);
  if (rootName !== "svg") errors.push(finding("SVG_ROOT", "Root element must be svg."));

  const profile = rootAttrs["data-style-profile"];
  if (!new Set(["cuebook_feed_v1", "cuebook_detail_v1"]).has(profile)) errors.push(finding("STYLE_PROFILE", "Rendered SVG must declare a Cuebook style profile."));
  if (rootAttrs["font-variant-numeric"] !== "tabular-nums") errors.push(finding("TABULAR_NUMS", "Market charts must use tabular numerals."));
  if (rootAttrs["letter-spacing"] !== "0") errors.push(finding("LETTER_SPACING", "Cuebook chart letter spacing must remain zero."));

  const names = new Set([...source.matchAll(/<\/?([\w:.-]+)/g)].map((match) => match[1].split(":").at(-1)));
  for (const banned of ["linearGradient", "radialGradient", "filter"]) {
    if (names.has(banned)) errors.push(finding("DECORATIVE_EFFECT", `Cuebook charts do not use ${banned}.`));
  }
  const allText = [...source.matchAll(/<(title|desc|text)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => textContent(match[2])).join(" ");
  if (!allText.includes("Cuebook")) errors.push(finding("WATERMARK", "Cuebook watermark text is missing."));

  const publicTitles = [...source.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)].filter((match) => attrs(match[1]).id === "public-title");
  if (publicTitles.length !== 1) errors.push(finding("PUBLIC_TITLE", "Rendered chart must contain one visible public title."));
  else if ([...publicTitles[0][2].matchAll(/<tspan\b/gi)].length > 2) errors.push(finding("TITLE_LINES", "Feed/detail chart title may use at most two lines."));

  if (profile === "cuebook_feed_v1") {
    const bannedPhrases = new Map([
      ["CONDITIONAL", "internal artifact state"], ["DRAFT", "internal artifact state"], ["Cuebook OHLCV", "provenance footer"],
      ["\u7ed3\u7b97\u6761\u4ef6", "settlement prose panel"], ["Settlement ·", "settlement prose panel"], ["Solid candle", "rendering guide"],
      ["hollow/dashed", "rendering guide"], ["\u5b9e\u4f53/\u5b9e\u7ebf", "rendering guide"], ["\u4ece\u89c2\u70b9\u63cf\u8ff0\u4e2d\u63d0\u53d6", "workflow narration"],
      ["Cuebook \u4ece\u89c2\u70b9", "workflow narration"], ["schema_version", "schema metadata"],
    ]);
    for (const [phrase, meaning] of bannedPhrases) {
      if (allText.toLowerCase().includes(phrase.toLowerCase())) errors.push(finding("FEED_LEAKAGE", `Feed SVG exposes ${meaning}: ${phrase}.`));
    }
    const width = Number(rootAttrs.width ?? 0);
    const height = Number(rootAttrs.height ?? 0);
    if (width / Math.max(height, 1) < 1.45) warnings.push(finding("FEED_ASPECT", "Feed chart is unusually tall; inspect it at thumbnail size."));
  }
  return { valid: errors.length === 0, style_profile: profile ?? null, errors, warnings };
}

function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write("usage: audit_chart_svg.mjs path\n");
    return 2;
  }
  const result = audit(argv[0]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
