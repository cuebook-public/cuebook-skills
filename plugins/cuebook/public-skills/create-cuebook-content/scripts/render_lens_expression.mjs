// Deterministic renderer for Cuebook Creator Lens expressions. A lens is a
// transparent creator-owned observation basket, never an official index. Raw
// frozen candles are synchronized, rebased to 100, and combined locally.

import { readFileSync } from "node:fs";

import { FRAME_SURFACE_SYSTEMS, PALETTES } from "./render_market_expression.mjs";

const WORDMARK = readFileSync(
  new URL("../references/modules/direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg", import.meta.url),
  "utf8",
);

// Keep localized safety terms as escapes so the source remains English-only.
const MUTABLE_PRICE_LABEL = /(?:\u73b0\u4ef7|\u5f53\u524d\u4ef7|\u6700\u65b0\u4ef7|\u5165\u573a\u4ef7|current\s+price|latest\s+price|entry\s+price)/iu;

const LENS_DESIGN_PROFILES = Object.freeze({
  lens_anatomy: { design_family: "lens_ledger", narrative_placement: "ledger_plus_footer" },
  contribution_stage: { design_family: "spread_arena", narrative_placement: "two_sleeves_plus_footer" },
});

export function lensDesignProfile(expression) {
  const composition = LENS_DESIGN_PROFILES[expression.composition];
  const surface = FRAME_SURFACE_SYSTEMS[expression.surface];
  if (!composition || !surface) throw new Error(`Unknown Lens design profile ${expression.composition}/${expression.surface}.`);
  return {
    ...composition,
    display_system: surface.displaySystem,
    material_system: expression.surface,
    fingerprint: `${expression.grammar}/${expression.composition}/${expression.surface}/${surface.displaySystem}/${composition.narrative_placement}`,
  };
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function f(value) {
  return Number(value).toFixed(2).replace(/\.00$/u, "");
}

function iso(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO date-time.`);
  return new Date(parsed).toISOString();
}

function number(value, label, { positive = false } = {}) {
  if (typeof value === "string" && !value.trim()) throw new Error(`${label} must be numeric.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (positive && parsed <= 0)) {
    throw new Error(`${label} must be ${positive ? "positive and " : ""}numeric.`);
  }
  return parsed;
}

function localeFor(candidate) {
  return /[\u3400-\u9fff]/u.test(`${candidate.frame.title}\n${candidate.frame.body}`) ? "zh-CN" : "en-US";
}

function unitWidth(character) {
  if (/\s/u.test(character)) return 0.32;
  if (/[\u2e80-\u9fff\uf900-\ufaff]/u.test(character)) return 1;
  if (/[A-Z0-9]/u.test(character)) return 0.68;
  return 0.55;
}

function textWidth(value) {
  return [...String(value)].reduce((total, character) => total + unitWidth(character), 0);
}

function wrapText(value, maxUnits, maxLines) {
  const text = String(value).trim();
  if (!text) return { lines: [], truncated: false };
  const words = /[\u2e80-\u9fff]/u.test(text)
    ? (text.match(/[A-Za-z0-9]+(?:[._/+%-][A-Za-z0-9]+)*|\s+|[\u2e80-\u9fff]|[^\s]/gu) ?? [])
    : text.split(/\s+/u).map((word, index) => `${index ? " " : ""}${word}`);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && textWidth(line + word) > maxUnits) {
      lines.push(line.trim());
      line = word.trimStart();
    } else {
      line += word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return { lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

function textBlock({
  x,
  y,
  text,
  size,
  color,
  weight = 600,
  maxUnits,
  maxLines = 2,
  lineHeight = 1.16,
  anchor = "start",
  attrs = "",
  minSize = Math.max(9, size * 0.68),
}) {
  let fittedSize = size;
  let fittedUnits = maxUnits;
  let wrapped = wrapText(text, fittedUnits, maxLines);
  while (wrapped.truncated && fittedSize > minSize) {
    fittedSize = Math.max(minSize, fittedSize - 0.5);
    fittedUnits = maxUnits * (size / fittedSize);
    wrapped = wrapText(text, fittedUnits, maxLines);
  }
  const tspans = wrapped.lines.map((line, index) => (
    `<tspan x="${f(x)}" dy="${index === 0 ? 0 : f(fittedSize * lineHeight)}">${esc(line)}</tspan>`
  )).join("");
  const truncated = wrapped.truncated ? ' data-text-truncated="true"' : "";
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" fill="${color}" font-size="${f(fittedSize)}" font-weight="${weight}"${truncated} ${attrs}>${tspans}</text>`;
}

function bindingAttr(bindingId, state, geometry = "text") {
  return `data-binding-ref="${esc(bindingId)}" data-claim-state="${esc(state)}" data-binding-display="${geometry}"`;
}

function normalizeBars(component, time) {
  const start = Date.parse(time.observation_start);
  const declared = Date.parse(time.declared_at);
  const seen = new Set();
  const bars = component.leg.candles.data.bars.map((bar, index) => {
    const observedAt = iso(bar.openTime, `${component.leg.ticker}.bars[${index}].openTime`);
    if (seen.has(observedAt)) throw new Error(`${component.leg.ticker} contains duplicate candle ${observedAt}.`);
    seen.add(observedAt);
    const open = number(bar.open, `${component.leg.ticker}.bars[${index}].open`, { positive: true });
    const high = number(bar.high, `${component.leg.ticker}.bars[${index}].high`, { positive: true });
    const low = number(bar.low, `${component.leg.ticker}.bars[${index}].low`, { positive: true });
    const close = number(bar.close, `${component.leg.ticker}.bars[${index}].close`, { positive: true });
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      throw new Error(`${component.leg.ticker}.bars[${index}] violates OHLC bounds.`);
    }
    return { observed_at: observedAt, close };
  }).filter((bar) => {
    const timestamp = Date.parse(bar.observed_at);
    return timestamp >= start && timestamp <= declared;
  }).sort((left, right) => Date.parse(left.observed_at) - Date.parse(right.observed_at));
  if (bars.length < 5) throw new Error(`${component.leg.ticker} needs at least five observations inside the frozen window.`);
  return bars;
}

export function compileLensExpression(expression) {
  const normalized = expression.lens.components.map((component) => ({
    component,
    bars: normalizeBars(component, expression.time),
  }));
  let common = new Set(normalized[0].bars.map((point) => point.observed_at));
  for (const item of normalized.slice(1)) {
    const available = new Set(item.bars.map((point) => point.observed_at));
    common = new Set([...common].filter((timestamp) => available.has(timestamp)));
  }
  const timestamps = [...common].sort((left, right) => Date.parse(left) - Date.parse(right));
  if (timestamps.length < 5) throw new Error("A Creator Lens needs at least five synchronized observations across every component.");

  const series = normalized.map(({ component, bars }) => {
    const byTime = new Map(bars.map((point) => [point.observed_at, point]));
    const points = timestamps.map((timestamp) => byTime.get(timestamp));
    const baseline = points[0].close;
    return {
      component,
      points: points.map((point) => ({
        observed_at: point.observed_at,
        return_ratio: point.close / baseline - 1,
      })),
    };
  });

  const points = timestamps.map((timestamp, index) => {
    const contributions = series.map(({ component, points: componentPoints }) => ({
      ticker: component.leg.ticker,
      binding_id: component.binding_id,
      weight: component.weight,
      contribution_pp: component.weight * componentPoints[index].return_ratio * 100,
      return_pct: componentPoints[index].return_ratio * 100,
    }));
    return {
      observed_at: timestamp,
      value: expression.lens.base_value + contributions.reduce((sum, item) => sum + item.contribution_pp, 0),
      contributions,
    };
  });
  const latest = points.at(-1);
  const components = expression.lens.components.map((component) => {
    const contribution = latest.contributions.find((item) => item.ticker === component.leg.ticker);
    return {
      ...component,
      latest_return_pct: contribution.return_pct,
      latest_contribution_pp: contribution.contribution_pp,
    };
  });
  return {
    points,
    components,
    synchronized_count: points.length,
    observation_start: points[0].observed_at,
    observation_end: latest.observed_at,
    latest_value: latest.value,
    change_from_base: latest.value - expression.lens.base_value,
  };
}

function dateLabel(timestamp, locale) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale || "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function signed(value, digits = 1, suffix = "") {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function clipped(value, maximum) {
  const text = String(value).trim();
  return [...text].length <= maximum ? text : `${[...text].slice(0, maximum - 1).join("")}…`;
}

function lensKindLabel(expression) {
  if (expression.grammar === "long_short_lens") return "CREATOR LONG / SHORT LENS";
  return "CREATOR OBSERVATION LENS";
}

function selectionModeLabel(expression) {
  if (expression.lens.selection_mode === "retrospective_exploratory") {
    return "RETROSPECTIVE · SELECTION BIAS";
  }
  return "PRE-REGISTERED UNIVERSE";
}

export function generateLensAltText(expression, candidate, compiled = compileLensExpression(expression)) {
  const locale = localeFor(candidate);
  const members = compiled.components
    .map((component) => `${component.leg.ticker} ${signed(component.weight * 100, 0, "%")}`)
    .join(", ");
  const testNotice = expression.data_status === "synthetic_fixture"
    ? "Synthetic test data; not publishable. "
    : "";
  const text = `${testNotice}${expression.lens.name} is a creator-owned lens, not an official index; ${selectionModeLabel(expression)}. ${members} are rebased to 100 over one frozen window; the latest change is ${signed(compiled.change_from_base, 1, " points")}. After the view date, only conditions are shown.`;
  return clipped(text, 240);
}

function linePath(points, xScale, yScale) {
  return points.map((point, index) => `${index ? "L" : "M"} ${f(xScale(Date.parse(point.observed_at)))} ${f(yScale(point.value))}`).join(" ");
}

function renderWordmark(palette) {
  const inner = WORDMARK
    .replace(/^<svg[^>]*>/u, "")
    .replace(/<\/svg>\s*$/u, "")
    .replaceAll("#F2F3F4", palette.wordmark);
  return `<g id="cuebook-wordmark" transform="translate(1090 498) scale(1.35)" opacity="0.78">${inner}</g>`;
}

function renderHeader(expression, candidate, compiled, palette, locale) {
  const surfaceSystem = FRAME_SURFACE_SYSTEMS[expression.surface];
  const source = expression.data_status === "synthetic_fixture"
    ? `TEST DATA · NOT PUBLISHABLE · ${expression.source_label}`
    : expression.source_label;
  return [
    `<circle cx="53" cy="45" r="4" fill="${palette.signal}"/>`,
    `<text x="65" y="51" fill="${palette.muted}" font-size="14" font-weight="720" letter-spacing="0.04em">${esc(`${expression.subject_label} · ${expression.horizon_label}`)}</text>`,
    `<g data-data-status="${esc(expression.data_status)}"><text x="1191" y="43" text-anchor="end" fill="${expression.data_status === "synthetic_fixture" ? palette.danger : palette.muted}" font-size="12" font-weight="700">${esc(source)}</text><text x="1191" y="61" text-anchor="end" fill="${palette.muted}" font-size="10.5">${esc(`as of ${dateLabel(expression.data_as_of, locale)} · ${compiled.synchronized_count} synchronized bars`)}</text></g>`,
    textBlock({
      x: 52,
      y: 116,
      text: expression.argument.claim.text,
      size: surfaceSystem.claimSize + 1,
      color: palette.ink,
      weight: surfaceSystem.claimWeight,
      maxUnits: 34,
      maxLines: 2,
      attrs: `${bindingAttr(expression.argument.claim.binding_id, expression.argument.claim.state)} data-role="claim" font-family="${surfaceSystem.displayFont}" letter-spacing="${surfaceSystem.claimTracking}"`,
    }),
    `<desc id="frame-desc">${esc(generateLensAltText(expression, candidate, compiled))}</desc>`,
  ].join("");
}

function renderLensChart(expression, compiled, palette, locale) {
  const surfaceSystem = FRAME_SURFACE_SYSTEMS[expression.surface];
  const box = { x: 52, y: 166, w: 730, h: 238 };
  const historyWidth = 548;
  const futureX = box.x + historyWidth;
  const values = compiled.points.map((point) => point.value).concat(expression.lens.base_value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const padding = Math.max((high - low) * 0.18, 1.2);
  low -= padding;
  high += padding;
  const start = Date.parse(compiled.observation_start);
  const end = Date.parse(compiled.observation_end);
  const xScale = (timestamp) => box.x + ((timestamp - start) / Math.max(1, end - start)) * historyWidth;
  const yScale = (value) => box.y + box.h - ((value - low) / (high - low)) * box.h;
  const baseY = yScale(expression.lens.base_value);
  const latest = compiled.points.at(-1);
  const latestY = yScale(latest.value);
  const path = linePath(compiled.points, xScale, yScale);
  const area = `${path} L ${f(futureX)} ${f(baseY)} L ${f(box.x)} ${f(baseY)} Z`;
  const parts = [
    `<g data-lens-stage="true">`,
    `<rect x="${f(futureX)}" y="${box.y}" width="${f(box.w - historyWidth)}" height="${box.h}" rx="${surfaceSystem.plotRadius}" fill="${palette.future}" opacity="${surfaceSystem.futureOpacity}" data-future-region="unresolved"/>`,
    `<text x="${f(futureX + 14)}" y="${f(box.y + 22)}" fill="${palette.conditional}" font-size="10" font-weight="760" letter-spacing="0.07em">${esc("NO FUTURE PRICE PATH")}</text>`,
  ];
  for (let index = 0; index < 4; index += 1) {
    const value = low + ((high - low) * index) / 3;
    const y = yScale(value);
    parts.push(`<line x1="${box.x}" y1="${f(y)}" x2="${f(futureX)}" y2="${f(y)}" stroke="${palette.grid}" stroke-width="1" opacity="${surfaceSystem.gridOpacity}"/><text x="${f(box.x - 10)}" y="${f(y + 4)}" text-anchor="end" fill="${palette.muted}" font-size="9.5">${f(value)}</text>`);
  }
  parts.push(
    `<line x1="${box.x}" y1="${f(baseY)}" x2="${f(futureX)}" y2="${f(baseY)}" stroke="${palette.muted}" stroke-width="1.2" stroke-dasharray="5 5"/><text x="${f(box.x + 8)}" y="${f(baseY - 7)}" fill="${palette.muted}" font-size="9.5" font-weight="700">BASE 100</text>`,
    `<path d="${area}" fill="${palette.primary}" opacity="${surfaceSystem.areaOpacity}"/>`,
    `<path d="${path}" fill="none" stroke="${palette.primary}" stroke-width="${surfaceSystem.seriesWidth + 0.6}" stroke-linecap="round" stroke-linejoin="round" ${bindingAttr(expression.lens.curve_binding_id, "derived", "curve")} data-series-state="observed"/>`,
    `<circle cx="${f(futureX)}" cy="${f(latestY)}" r="6" fill="${palette.surface}" stroke="${palette.signal}" stroke-width="3"/>`,
    `<text x="${f(futureX - 10)}" y="${f(latestY - 12)}" text-anchor="end" fill="${palette.signal}" font-size="15" font-weight="800">${esc(signed(compiled.change_from_base, 1, " pts"))}</text>`,
    `<line x1="${f(futureX)}" y1="${box.y}" x2="${f(futureX)}" y2="${f(box.y + box.h)}" stroke="${palette.signal}" stroke-width="1.5" stroke-dasharray="4 5"/>`,
    `<text x="${box.x}" y="${f(box.y + box.h + 18)}" fill="${palette.muted}" font-size="10">${esc(dateLabel(compiled.observation_start, locale))}</text>`,
    `<text x="${f(futureX - 8)}" y="${f(box.y + box.h + 18)}" text-anchor="end" fill="${palette.signal}" font-size="10" font-weight="720">${esc(`VIEW · ${dateLabel(expression.time.declared_at, locale)}`)}</text>`,
    `<text x="${f(box.x)}" y="${f(box.y - 12)}" fill="${palette.muted}" font-size="10.5" font-weight="720" letter-spacing="0.04em">${esc(`${lensKindLabel(expression, locale)} · rebased 100`)}</text>`,
  );

  const observation = expression.argument.observation;
  const observationX = futureX - 300;
  const observationY = latestY < box.y + box.h * 0.4 ? latestY + 52 : latestY - 42;
  const observationColor = stateColor(observation.state, palette);
  parts.push(
    `<g ${bindingAttr(observation.binding_id, observation.state)} data-role="observation" data-annotation-role="observation" data-layout="chart-attached"><path d="M ${f(futureX - 9)} ${f(latestY)} L ${f(observationX + 270)} ${f(latestY)} L ${f(observationX + 270)} ${f(observationY - 11)}" fill="none" stroke="${observationColor}" stroke-width="1.2" opacity="0.72"/><rect x="${f(observationX - 8)}" y="${f(observationY - 24)}" width="286" height="66" rx="3" fill="${palette.canvas}" opacity="0.93"/><line x1="${f(observationX)}" y1="${f(observationY - 11)}" x2="${f(observationX + 42)}" y2="${f(observationY - 11)}" stroke="${observationColor}" stroke-width="3"/><text x="${f(observationX)}" y="${f(observationY + 4)}" fill="${observationColor}" font-size="9" font-weight="800" letter-spacing="0.06em">${esc("EVIDENCE ON THE CURVE")}</text>${textBlock({ x: observationX, y: observationY + 24, text: observation.text, size: 12.5, color: palette.ink, weight: 690, maxUnits: 27, maxLines: 2, minSize: 10 })}</g>`,
  );

  const futureTop = box.y + 60;
  expression.future_beats.forEach((beat, index) => {
    const top = futureTop + index * 64;
    const days = Math.max(1, Math.round((Date.parse(beat.at) - Date.parse(expression.time.declared_at)) / 86_400_000));
    const role = beat.role.toUpperCase();
    const color = beat.role === "invalidation" ? palette.danger : palette.conditional;
    parts.push(
      `<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${esc(beat.role)}"><line x1="${f(futureX + 16)}" y1="${f(top)}" x2="${f(futureX + 34)}" y2="${f(top)}" stroke="${color}" stroke-width="2"/><text x="${f(futureX + 42)}" y="${f(top + 4)}" fill="${color}" font-size="9.5" font-weight="780">${esc(`${role} · D+${days}`)}</text>${textBlock({ x: futureX + 16, y: top + 25, text: beat.criterion, size: 11.5, color: palette.ink, maxUnits: 20, maxLines: 2, minSize: 9.5 })}</g>`,
    );
  });
  if (expression.argument.countercase) {
    const beat = expression.argument.countercase;
    parts.push(
      `<g ${bindingAttr(beat.binding_id, beat.state)} data-role="countercase"><text x="${f(futureX + 16)}" y="${f(box.y + box.h - 30)}" fill="${palette.danger}" font-size="9" font-weight="800" letter-spacing="0.05em">${esc("MY STOP")}</text>${textBlock({ x: futureX + 16, y: box.y + box.h - 12, text: beat.text, size: 9.5, color: palette.ink, weight: 620, maxUnits: 24, maxLines: 1, minSize: 8 })}</g>`,
    );
  }
  parts.push("</g>");
  return parts.join("");
}

function renderAnatomy(expression, compiled, palette, locale) {
  const x = 820;
  const y = 160;
  const width = 370;
  const rowHeight = Math.min(25, 154 / compiled.components.length);
  const maxContribution = Math.max(0.1, ...compiled.components.map((component) => Math.abs(component.latest_contribution_pp)));
  const originLabel = {
    creator_named: "YOU",
    cuebook_discovered: "CUEBOOK",
    assistant_proxy: "PROXY",
  };
  const parts = [
    `<g data-lens-anatomy="true" ${bindingAttr(expression.lens.contribution_binding_id, "derived", "contribution-bars")}>`,
    `<text x="${x}" y="${y}" fill="${palette.signal}" font-size="10.5" font-weight="800" letter-spacing="0.08em">${esc(lensKindLabel(expression, locale))}</text>`,
    textBlock({ x, y: y + 31, text: expression.lens.name, size: 21, color: palette.ink, weight: 770, maxUnits: 25, maxLines: 1, minSize: 15 }),
    `<text x="${x + width}" y="${y + 31}" text-anchor="end" fill="${palette.muted}" font-size="9.5" font-weight="700">${esc("NOT AN OFFICIAL INDEX")}</text>`,
    `<line x1="${x}" y1="${y + 44}" x2="${x + width}" y2="${y + 44}" stroke="${palette.grid}"/>`,
    `<text x="${x}" y="${y + 60}" fill="${palette.muted}" font-size="9">MEMBER / WHY</text><text x="${x + 266}" y="${y + 60}" text-anchor="end" fill="${palette.muted}" font-size="9">WEIGHT</text><text x="${x + width}" y="${y + 60}" text-anchor="end" fill="${palette.muted}" font-size="9">CONTRIB.</text>`,
  ];
  compiled.components.forEach((component, index) => {
    const top = y + 72 + index * rowHeight;
    const color = component.latest_contribution_pp >= 0 ? palette.primary : palette.danger;
    const barWidth = Math.max(2, Math.abs(component.latest_contribution_pp) / maxContribution * 42);
    parts.push(
      `<g ${bindingAttr(component.binding_id, "derived", "component-row")} data-lens-component="${esc(component.leg.ticker)}">`,
      `<text x="${x}" y="${f(top)}" fill="${palette.ink}" font-size="${f(Math.max(9.5, rowHeight * 0.48))}" font-weight="800">${esc(component.leg.ticker)}</text>`,
      textBlock({ x: x + 52, y: top, text: component.inclusion_reason, size: Math.max(8.5, rowHeight * 0.4), color: palette.muted, weight: 560, maxUnits: 23, maxLines: 1, minSize: 7.2 }),
      `<text x="${x + 266}" y="${f(top)}" text-anchor="end" fill="${component.side === "short" ? palette.danger : palette.ink}" font-size="10" font-weight="720">${esc(signed(component.weight * 100, 0, "%"))}</text>`,
      `<line x1="${x + 279}" y1="${f(top - 3)}" x2="${f(x + 279 + barWidth)}" y2="${f(top - 3)}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`,
      `<text x="${x + width}" y="${f(top)}" text-anchor="end" fill="${color}" font-size="10" font-weight="760">${esc(signed(component.latest_contribution_pp, 1, "pp"))}</text>`,
      `<text x="${x + 52}" y="${f(top + 10)}" fill="${palette.muted}" font-size="7.5" font-weight="720">${esc(originLabel[component.origin])}</text>`,
      "</g>",
    );
  });
  const footerY = y + 82 + compiled.components.length * rowHeight;
  parts.push(
    `<line x1="${x}" y1="${f(footerY)}" x2="${x + width}" y2="${f(footerY)}" stroke="${palette.grid}"/>`,
    textBlock({ x, y: footerY + 18, text: `${selectionModeLabel(expression, locale)} · ${expression.lens.weighting.toUpperCase()} · ${expression.lens.rebalance.toUpperCase()} · ${compiled.synchronized_count} BARS`, size: 9.5, color: expression.lens.selection_mode === "retrospective_exploratory" ? palette.danger : palette.muted, weight: 720, maxUnits: 58, maxLines: 1, minSize: 7.5 }),
    textBlock({ x, y: footerY + 36, text: expression.lens.formula, size: 10.5, color: palette.ink, maxUnits: 55, maxLines: 1, minSize: 8.5 }),
    textBlock({ x, y: footerY + 53, text: `LIMIT: ${expression.lens.limitations.join("; ")}`, size: 9.5, color: palette.muted, weight: 580, maxUnits: 62, maxLines: 2, minSize: 8 }),
    "</g>",
  );
  return parts.join("");
}

function renderContributionStage(expression, compiled, palette, locale) {
  const x = 820;
  const y = 160;
  const width = 370;
  const longs = compiled.components.filter((component) => component.side === "long");
  const shorts = compiled.components.filter((component) => component.side === "short");
  const maxRows = Math.max(longs.length, shorts.length);
  const rowHeight = Math.min(29, 103 / Math.max(1, maxRows));
  const sleeve = (components, side, sleeveX) => {
    const color = side === "long" ? palette.primary : palette.danger;
    const total = components.reduce((sum, component) => sum + component.latest_contribution_pp, 0);
    const parts = [
      `<text x="${sleeveX}" y="253" fill="${color}" font-size="10" font-weight="820" letter-spacing="0.08em">${esc(side === "long" ? "LONG SLEEVE" : "SHORT SLEEVE")}</text>`,
      `<text x="${sleeveX + 172}" y="253" text-anchor="end" fill="${color}" font-size="13" font-weight="820">${esc(signed(total, 1, "pp"))}</text>`,
    ];
    components.forEach((component, index) => {
      const top = 276 + index * rowHeight;
      const contributionColor = component.latest_contribution_pp >= 0 ? palette.primary : palette.danger;
      parts.push(
        `<g ${bindingAttr(component.binding_id, "derived", "component-row")} data-lens-component="${esc(component.leg.ticker)}">`,
        `<text x="${sleeveX}" y="${f(top)}" fill="${palette.ink}" font-size="11.5" font-weight="820">${esc(component.leg.ticker)}</text>`,
        `<text x="${sleeveX + 44}" y="${f(top)}" fill="${color}" font-size="9.5" font-weight="720">${esc(signed(component.weight * 100, 0, "%"))}</text>`,
        `<text x="${sleeveX + 172}" y="${f(top)}" text-anchor="end" fill="${contributionColor}" font-size="10.5" font-weight="800">${esc(signed(component.latest_contribution_pp, 1, "pp"))}</text>`,
        textBlock({ x: sleeveX, y: top + 11, text: component.inclusion_reason, size: 8.2, color: palette.muted, weight: 560, maxUnits: 25, maxLines: 1, minSize: 6.8 }),
        "</g>",
      );
    });
    return parts.join("");
  };
  const footerY = 286 + maxRows * rowHeight;
  return [
    `<g data-lens-contribution-stage="true" ${bindingAttr(expression.lens.contribution_binding_id, "derived", "two-sided-contribution")}>`,
    `<text x="${x}" y="${y}" fill="${palette.signal}" font-size="10.5" font-weight="800" letter-spacing="0.08em">${esc(lensKindLabel(expression, locale))}</text>`,
    textBlock({ x, y: y + 31, text: expression.lens.name, size: 21, color: palette.ink, weight: 770, maxUnits: 25, maxLines: 1, minSize: 15 }),
    `<text x="${x + width}" y="${y + 31}" text-anchor="end" fill="${palette.muted}" font-size="9.5" font-weight="700">${esc("NOT AN OFFICIAL INDEX")}</text>`,
    `<line x1="${x}" y1="${y + 44}" x2="${x + width}" y2="${y + 44}" stroke="${palette.grid}"/>`,
    `<text x="${x}" y="226" fill="${palette.muted}" font-size="9.5" font-weight="750">${esc("NET OBSERVATION SPREAD")}</text>`,
    `<text x="${x + width}" y="228" text-anchor="end" fill="${palette.signal}" font-size="22" font-weight="840">${esc(signed(compiled.change_from_base, 1, " pts"))}</text>`,
    `<line x1="1005" y1="245" x2="1005" y2="${f(footerY - 7)}" stroke="${palette.grid}"/>`,
    sleeve(longs, "long", 820),
    sleeve(shorts, "short", 1018),
    `<line x1="${x}" y1="${f(footerY)}" x2="${x + width}" y2="${f(footerY)}" stroke="${palette.grid}"/>`,
    textBlock({ x, y: footerY + 17, text: `${selectionModeLabel(expression, locale)} · ${expression.lens.weighting.toUpperCase()} · ${expression.lens.rebalance.toUpperCase()} · ${compiled.synchronized_count} BARS`, size: 9.2, color: expression.lens.selection_mode === "retrospective_exploratory" ? palette.danger : palette.muted, weight: 720, maxUnits: 58, maxLines: 1, minSize: 7.5 }),
    textBlock({ x, y: footerY + 34, text: expression.lens.formula, size: 10, color: palette.ink, maxUnits: 58, maxLines: 1, minSize: 8.5 }),
    textBlock({ x, y: footerY + 50, text: `LIMIT: ${expression.lens.limitations.join("; ")}`, size: 9.2, color: palette.muted, weight: 580, maxUnits: 62, maxLines: 2, minSize: 7.8 }),
    "</g>",
  ].join("");
}

function stateColor(state, palette) {
  if (state === "conditional") return palette.conditional;
  if (state === "creator_view") return palette.signal;
  return palette.comparison;
}

function renderBottomArgument(expression, palette, locale) {
  const mechanism = expression.argument.mechanism;
  const implication = expression.argument.implication;
  const mechanismColor = stateColor(mechanism.state, palette);
  const implicationColor = stateColor(implication.state, palette);
  return [
    `<g ${bindingAttr(mechanism.binding_id, mechanism.state)} data-role="creator-pulse" data-layout="creator-pulse"><line x1="52" y1="439" x2="806" y2="439" stroke="${palette.grid}"/><line x1="52" y1="439" x2="132" y2="439" stroke="${mechanismColor}" stroke-width="4"/><text x="52" y="459" fill="${mechanismColor}" font-size="10" font-weight="820" letter-spacing="0.07em">${esc("MY CREATOR EDGE")}</text>${textBlock({ x: 52, y: 489, text: mechanism.text, size: 19, color: palette.ink, weight: 730, maxUnits: 48, maxLines: 1, minSize: 14 })}</g>`,
    `<g ${bindingAttr(implication.binding_id, implication.state)} data-role="next-watch" data-layout="compact-watch"><line x1="840" y1="439" x2="1072" y2="439" stroke="${palette.grid}"/><line x1="840" y1="439" x2="888" y2="439" stroke="${implicationColor}" stroke-width="3"/><text x="840" y="459" fill="${implicationColor}" font-size="9.5" font-weight="800" letter-spacing="0.06em">${esc("WATCH NEXT")}</text>${textBlock({ x: 840, y: 482, text: implication.text, size: 12.5, color: palette.ink, weight: 650, maxUnits: 19, maxLines: 2, minSize: 10 })}</g>`,
  ].join("");
}

const MOBILE_LENS_MASTER_PROFILE = "single-master-mobile";
const MOBILE_LENS_PRIMARY_FONT_FLOOR = 20;
const MOBILE_LENS_SECONDARY_FONT_FLOOR = 16;

function compactLensWordmark(palette) {
  const inner = WORDMARK
    .replace(/^<svg[^>]*>/u, "")
    .replace(/<\/svg>\s*$/u, "")
    .replaceAll("#F2F3F4", palette.wordmark);
  return `<g id="cuebook-wordmark" transform="translate(538 35) scale(0.88)" opacity="0.66">${inner}</g>`;
}

function compactLensEssentialText({ x, y, text, color, widthUnits, lines = 2, anchor = "start", binding = "", group, tier = "primary" }) {
  const primary = tier === "primary";
  return textBlock({
    x,
    y,
    text,
    size: primary ? 22 : 18,
    color,
    weight: 790,
    maxUnits: widthUnits,
    maxLines: lines,
    minSize: primary ? MOBILE_LENS_PRIMARY_FONT_FLOOR : MOBILE_LENS_SECONDARY_FONT_FLOOR,
    anchor,
    attrs: `${binding} data-essential-copy="true" data-essential-tier="${tier}" data-essential-copy-group="${group}"`,
  });
}

function compactLensProvenance(expression, palette, locale) {
  const asOf = dateLabel(expression.data_as_of, locale);
  const source = expression.data_status === "synthetic_fixture"
    ? "TEST DATA · NOT PUBLISHABLE"
    : clipped(expression.source_label, 18);
  return [
    `<circle cx="20" cy="22" r="4" fill="${palette.signal}"/>`,
    `<text x="31" y="28" fill="${palette.ink}" font-size="16" font-weight="780">${esc(`${expression.subject_label} · ${expression.horizon_label}`)}</text>`,
    `<text x="602" y="27" text-anchor="end" fill="${expression.data_status === "synthetic_fixture" ? palette.danger : palette.muted}" font-size="14" font-weight="650">${esc(`${source} · ${asOf}`)}</text>`,
  ].join("");
}

function compactLensCurve(expression, compiled, palette, box, { arena = false, showDelta = true } = {}) {
  const values = compiled.points.map((point) => point.value).concat(expression.lens.base_value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const padding = Math.max((high - low) * 0.16, 1);
  low -= padding;
  high += padding;
  const start = Date.parse(compiled.observation_start);
  const end = Date.parse(compiled.observation_end);
  const historyWidth = box.w * 0.82;
  const xScale = (timestamp) => box.x + ((timestamp - start) / Math.max(1, end - start)) * historyWidth;
  const yScale = (value) => box.y + box.h - ((value - low) / Math.max(1e-9, high - low)) * box.h;
  const path = linePath(compiled.points, xScale, yScale);
  const latest = compiled.points.at(-1);
  const latestX = xScale(Date.parse(latest.observed_at));
  const latestY = yScale(latest.value);
  return [
    `<g data-role="compact-lens-curve" data-lens-stage="true">`,
    `<rect x="${f(box.x + historyWidth)}" y="${f(box.y)}" width="${f(box.w - historyWidth)}" height="${f(box.h)}" fill="${palette.future}" opacity="0.72" data-future-region="unresolved"/>`,
    `<line x1="${f(box.x + historyWidth)}" y1="${f(box.y)}" x2="${f(box.x + historyWidth)}" y2="${f(box.y + box.h)}" stroke="${palette.signal}" stroke-width="2" stroke-dasharray="5 5"/>`,
    `<line x1="${f(box.x)}" y1="${f(yScale(expression.lens.base_value))}" x2="${f(box.x + historyWidth)}" y2="${f(yScale(expression.lens.base_value))}" stroke="${palette.grid}" stroke-width="1.5"/>`,
    `<path d="${path}" fill="none" stroke="${palette.primary}" stroke-width="${arena ? 4 : 5}" stroke-linecap="round" stroke-linejoin="round" ${bindingAttr(expression.lens.curve_binding_id, "derived", "curve")} data-series-state="observed"/>`,
    `<circle cx="${f(latestX)}" cy="${f(latestY)}" r="5" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="3"/>`,
    showDelta ? `<text x="${f(latestX - 8)}" y="${f(Math.max(box.y + 24, latestY - 10))}" text-anchor="end" fill="${palette.signal}" font-size="20" font-weight="840" data-role="lens-value-context" data-essential-copy="true" data-essential-tier="primary" data-essential-copy-group="evidence">${esc(`${expression.lens.base_value} → ${compiled.latest_value.toFixed(1)} · ${signed(compiled.change_from_base, 1, " pts")}`)}</text>` : "",
    `</g>`,
  ].join("");
}

function compactLensFuture(expression, palette, locale) {
  const beat = expression.future_beats.findLast((item) => item.at && Date.parse(item.at) === Date.parse(expression.time.horizon_end))
    ?? expression.future_beats.at(-1);
  if (!beat) return "";
  const days = Math.max(1, Math.round((Date.parse(beat.at) - Date.parse(expression.time.declared_at)) / 86_400_000));
  return [
    `<line x1="20" y1="222" x2="514" y2="222" stroke="${palette.grid}" stroke-width="1.5"/>`,
    `<text x="20" y="244" fill="${palette.conditional}" font-size="12" font-weight="820">${esc("HORIZON CHECK")}</text>`,
    compactLensEssentialText({ x: 112, y: 247, text: `D+${days} · ${dateLabel(beat.at, locale)} · ${beat.label}`, color: palette.ink, widthUnits: 23, lines: 1, binding: bindingAttr(beat.binding_id, beat.state), group: "future", tier: "secondary" }),
  ].join("");
}

function renderCompactLensAnatomy(expression, compiled, palette, locale) {
  const ranked = [...compiled.components]
    .sort((left, right) => Math.abs(right.latest_contribution_pp) - Math.abs(left.latest_contribution_pp))
    .slice(0, 3);
  const parts = [
    compactLensCurve(expression, compiled, palette, { x: 20, y: 58, w: 346, h: 108 }),
    `<g ${bindingAttr(expression.argument.observation.binding_id, expression.argument.observation.state, "annotation")} data-annotation-role="observation"/>`,
    `<line x1="386" y1="52" x2="386" y2="204" stroke="${palette.grid}" stroke-width="1.5"/>`,
    `<text x="406" y="62" fill="${palette.signal}" font-size="14" font-weight="820">${esc("CREATOR LENS · NOT AN OFFICIAL INDEX")}</text>`,
    textBlock({ x: 406, y: 90, text: expression.lens.name, size: 19, color: palette.ink, weight: 800, maxUnits: 10.8, maxLines: 2, minSize: 16 }),
    `<g data-role="compact-contributions" ${bindingAttr(expression.lens.contribution_binding_id, "derived", "contribution-bars")}>`,
  ];
  ranked.forEach((component, index) => {
    const y = 132 + index * 28;
    const color = component.latest_contribution_pp >= 0 ? palette.primary : palette.danger;
    parts.push(
      `<g data-role="compact-component-row" data-lens-component="${esc(component.leg.ticker)}" ${bindingAttr(component.binding_id, "derived", "component-row")}><text x="406" y="${y}" fill="${palette.ink}" font-size="18" font-weight="820">${esc(component.leg.ticker)}</text><text x="602" y="${y}" text-anchor="end" fill="${color}" font-size="18" font-weight="820">${esc(signed(component.latest_contribution_pp, 1, "pp"))}</text></g>`,
    );
  });
  parts.push(
    "</g>",
    `<text x="20" y="186" fill="${palette.signal}" font-size="12" font-weight="820">${esc("MY LOGIC")}</text>`,
    compactLensEssentialText({ x: 20, y: 208, text: expression.argument.mechanism.text, color: palette.ink, widthUnits: 20, lines: 1, binding: `${bindingAttr(expression.argument.mechanism.binding_id, expression.argument.mechanism.state)} data-role="creator-mechanism"`, group: "logic", tier: "secondary" }),
    compactLensFuture(expression, palette, locale),
  );
  return parts.join("");
}

function renderCompactSpreadArena(expression, compiled, palette, locale) {
  const long = [...compiled.components].filter((component) => component.side === "long")
    .sort((left, right) => Math.abs(right.latest_contribution_pp) - Math.abs(left.latest_contribution_pp))[0];
  const short = [...compiled.components].filter((component) => component.side === "short")
    .sort((left, right) => Math.abs(right.latest_contribution_pp) - Math.abs(left.latest_contribution_pp))[0];
  const longTotal = compiled.components.filter((component) => component.side === "long").reduce((sum, component) => sum + component.latest_contribution_pp, 0);
  const shortTotal = compiled.components.filter((component) => component.side === "short").reduce((sum, component) => sum + component.latest_contribution_pp, 0);
  const parts = [
    `<text x="311" y="47" text-anchor="middle" fill="${palette.signal}" font-size="12" font-weight="820">${esc("CREATOR LENS · NOT AN OFFICIAL INDEX")}</text>`,
    `<rect x="20" y="52" width="276" height="144" fill="${palette.primary}" opacity="0.07"/><rect x="326" y="52" width="276" height="144" fill="${palette.danger}" opacity="0.06"/>`,
    `<line x1="311" y1="52" x2="311" y2="196" stroke="${palette.signal}" stroke-width="3"/>`,
    compactLensCurve(expression, compiled, palette, { x: 210, y: 56, w: 202, h: 54 }, { arena: true, showDelta: false }),
    `<g ${bindingAttr(expression.argument.observation.binding_id, expression.argument.observation.state, "annotation")} data-annotation-role="observation"/>`,
    `<g data-role="compact-contributions" ${bindingAttr(expression.lens.contribution_binding_id, "derived", "two-sided-contribution")}>`,
    `<text x="40" y="82" fill="${palette.primary}" font-size="16" font-weight="840">LONG</text><text x="582" y="82" text-anchor="end" fill="${palette.danger}" font-size="16" font-weight="840">SHORT</text>`,
    `<text x="311" y="126" text-anchor="middle" fill="${palette.signal}" font-size="22" font-weight="860" data-role="lens-value-context" data-essential-copy="true" data-essential-tier="primary" data-essential-copy-group="evidence">${esc(`${expression.lens.base_value} → ${compiled.latest_value.toFixed(1)} · ${signed(compiled.change_from_base, 1, " pts")}`)}</text>`,
    compactLensEssentialText({ x: 40, y: 148, text: long ? long.leg.ticker : "—", color: palette.ink, widthUnits: 8, lines: 1, binding: long ? bindingAttr(long.binding_id, "derived", "component-row") : "", group: "evidence" }),
    compactLensEssentialText({ x: 582, y: 148, text: short ? short.leg.ticker : "—", color: palette.ink, widthUnits: 8, lines: 1, anchor: "end", binding: short ? bindingAttr(short.binding_id, "derived", "component-row") : "", group: "evidence" }),
    `<text x="40" y="181" fill="${palette.primary}" font-size="20" font-weight="820">${esc(signed(longTotal, 1, "pp"))}</text><text x="582" y="181" text-anchor="end" fill="${palette.danger}" font-size="20" font-weight="820">${esc(signed(shortTotal, 1, "pp"))}</text>`,
    `<text x="311" y="183" text-anchor="middle" fill="${palette.muted}" font-size="14" font-weight="820">${esc("NET SPREAD")}</text>`,
    `</g>`,
    `<text x="20" y="212" fill="${palette.signal}" font-size="12" font-weight="820">${esc("MY LOGIC")}</text>`,
    compactLensEssentialText({ x: 110, y: 215, text: expression.argument.mechanism.text, color: palette.ink, widthUnits: 27, lines: 1, binding: `${bindingAttr(expression.argument.mechanism.binding_id, expression.argument.mechanism.state)} data-role="creator-mechanism"`, group: "logic", tier: "secondary" }),
    compactLensFuture(expression, palette, locale),
  ];
  return parts.join("");
}

export function lensBindingIds(expression) {
  return [...new Set([
    ...Object.values(expression.argument).filter(Boolean).map((beat) => beat.binding_id),
    expression.lens.curve_binding_id,
    expression.lens.contribution_binding_id,
    ...expression.lens.components.map((component) => component.binding_id),
    ...expression.future_beats.map((beat) => beat.binding_id),
  ])];
}

export function renderLensSvg(expression, candidate, compiled = compileLensExpression(expression)) {
  const palette = PALETTES[expression.surface];
  if (!palette) throw new Error(`Unknown surface ${expression.surface}.`);
  const locale = localeFor(candidate);
  const design = lensDesignProfile(expression);
  const attentionSignature = `${design.design_family}/${design.narrative_placement}/${expression.grammar}/${MOBILE_LENS_MASTER_PROFILE}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1866" height="1200" viewBox="0 0 622 400" role="img" aria-labelledby="frame-title frame-desc" data-expression-system="lens" data-grammar="${esc(expression.grammar)}" data-composition="${esc(expression.composition)}" data-surface="${esc(expression.surface)}" data-master-profile="${MOBILE_LENS_MASTER_PROFILE}" data-mobile-display="622x400" data-single-master="true" data-attention-signature="${esc(attentionSignature)}" data-design-family="${design.design_family}" data-narrative-placement="${design.narrative_placement}" data-display-system="${design.display_system}" data-primary-font-floor="${MOBILE_LENS_PRIMARY_FONT_FLOOR}" data-secondary-font-floor="${MOBILE_LENS_SECONDARY_FONT_FLOOR}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-variant-numeric="tabular-nums">`,
    `<title id="frame-title">${esc(candidate.frame.title)}</title>`,
    `<desc id="frame-desc">${esc(generateLensAltText(expression, candidate, compiled))}</desc>`,
    `<rect width="622" height="400" fill="${palette.canvas}"/>`,
    compactLensProvenance(expression, palette, locale),
    expression.composition === "contribution_stage"
      ? renderCompactSpreadArena(expression, compiled, palette, locale)
      : renderCompactLensAnatomy(expression, compiled, palette, locale),
    compactLensWordmark(palette),
    "</svg>",
  ].join("");
}

export function auditLensSvg(svg, expression, candidate) {
  const errors = [];
  const design = lensDesignProfile(expression);
  if (!/<svg\b[^>]*\bwidth="1866"[^>]*\bheight="1200"/u.test(svg)) errors.push("SVG must declare the exact 1866 x 1200 publication size.");
  if (!/viewBox="0 0 622 400"/u.test(svg)) errors.push("The publication master must be authored against its exact 622 x 400 mobile display box.");
  if (!svg.includes(`data-master-profile="${MOBILE_LENS_MASTER_PROFILE}"`) || !svg.includes('data-single-master="true"')) errors.push("Lens SVG is missing its single-master mobile profile.");
  if (!/role="img"/u.test(svg) || !/<title id="frame-title">/u.test(svg) || !/<desc id="frame-desc">/u.test(svg)) errors.push("SVG needs an accessible title and description.");
  if (!/id="cuebook-wordmark"/u.test(svg)) errors.push("SVG is missing the canonical Cuebook wordmark.");
  if (!svg.includes(`data-design-family="${design.design_family}"`) || !svg.includes(`data-display-system="${design.display_system}"`)) errors.push("SVG is missing its truthful design-family and display-system fingerprint.");
  if (/(?:href|src)=["']https?:\/\//iu.test(svg)) errors.push("SVG must not load network assets.");
  if (MUTABLE_PRICE_LABEL.test(svg)) errors.push("SVG cannot print a mutable current or entry price before a backend lock exists.");
  if (/data-text-truncated="true"/u.test(svg)) errors.push("Visible Frame copy must fit without hidden truncation.");
  if (/data-series-state="(?:future|forecast|modelled)"/u.test(svg)) errors.push("A Creator Lens cannot draw a future or modelled series.");
  if (!/data-future-region="unresolved"/u.test(svg)) errors.push("A dated Creator Lens needs an unresolved future region.");
  if (!/NOT AN OFFICIAL INDEX|\u975e\u5b98\u65b9\u6307\u6570/u.test(svg)) errors.push("Creator Lens identity must be explicit in the visual.");
  if ((svg.match(/data-annotation-role="observation"/gu) ?? []).length !== 1) errors.push("The tested observation must appear once as chart-attached evidence.");
  if (!svg.includes(`data-binding-ref="${expression.lens.curve_binding_id}"`)) errors.push("The observed Lens curve binding is missing from the visual.");
  if (!svg.includes(`data-binding-ref="${expression.lens.contribution_binding_id}"`)) errors.push("The visible Lens contribution binding is missing from the visual.");
  if (!/data-role="lens-value-context"/u.test(svg)) errors.push("The Lens master needs its base-to-observation value context.");
  if (!/data-role="creator-mechanism"/u.test(svg)) errors.push("The creator's Lens mechanism must remain visible in the mobile master.");
  if (candidate.frame.title.trim() === expression.argument.claim.text.trim()) errors.push("The image claim must add to the Frame title instead of repeating it exactly.");
  const alt = generateLensAltText(expression, candidate);
  if (!svg.includes(`<desc id="frame-desc">${esc(alt)}</desc>`)) errors.push("SVG description must match the deterministic Creator Lens description.");
  for (const match of svg.matchAll(/<text\b[^>]*data-essential-copy="true"[^>]*>/gu)) {
    const tag = match[0];
    const size = Number(tag.match(/font-size="([0-9.]+)"/u)?.[1]);
    const tier = tag.match(/data-essential-tier="(primary|secondary)"/u)?.[1];
    if (!tier) errors.push("Every essential Lens copy item needs a primary or secondary tier.");
    else if (tier === "primary" && size < MOBILE_LENS_PRIMARY_FONT_FLOOR) errors.push("Primary essential Lens copy must use at least 20 display pixels.");
    else if (tier === "secondary" && size < MOBILE_LENS_SECONDARY_FONT_FLOOR) errors.push("Secondary essential Lens copy must use at least 16 display pixels.");
  }
  const groups = new Set([...svg.matchAll(/data-essential-copy-group="([^"]+)"/gu)].map((match) => match[1]));
  if (groups.size > 3) errors.push("The Lens master may contain at most three essential copy groups.");
  const visibleComponents = (svg.match(/data-role="compact-component-row"/gu) ?? []).length;
  if (visibleComponents > 3) errors.push("The Lens master may show at most three component rows.");
  if (/data-role="(?:formula|limitations|component-reason|source-detail)"/u.test(svg) || svg.includes(expression.lens.formula)) errors.push("The Lens master contains method detail that belongs in body, alt text, or references.");
  return {
    valid: errors.length === 0,
    errors,
    single_master: true,
    mobile_display: "622x400",
    essential_copy_groups: groups.size,
    essential_font_floor: MOBILE_LENS_PRIMARY_FONT_FLOOR,
    secondary_font_floor: MOBILE_LENS_SECONDARY_FONT_FLOOR,
    visible_component_rows: visibleComponents,
    attention_signature: `${design.design_family}/${design.narrative_placement}/${expression.grammar}/${MOBILE_LENS_MASTER_PROFILE}`,
  };
}

export function assertNoMutableLensPriceText(value, label) {
  if (typeof value === "string" && MUTABLE_PRICE_LABEL.test(value)) {
    throw new Error(`${label} cannot print a mutable current/entry price before a backend lock exists.`);
  }
}
