// Deterministic renderer for Cuebook market expressions.
// It turns raw frozen market envelopes plus a typed argument into one finished
// 2488 x 1056 Frame bitmap. It never draws a future price series.

import { readFileSync } from "node:fs";

const WORDMARK = readFileSync(
  new URL("../../direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg", import.meta.url),
  "utf8",
);

// Keep localized safety matches as escapes so the source remains English-only.
const MUTABLE_PRICE_LABEL = /(?:\u73b0\u4ef7|\u5f53\u524d\u4ef7|\u6700\u65b0\u4ef7|\u5165\u573a\u4ef7|current\s+price|latest\s+price|entry\s+price)/iu;

export const PALETTES = Object.freeze({
  paper_signal: {
    canvas: "#F4F4EF", surface: "#FCFCF8", surfaceAlt: "#E9ECE5", ink: "#111512", muted: "#69706A",
    grid: "#D8DDD5", primary: "#136E58", comparison: "#3867D6", signal: "#F35B38", future: "#FFF0D7",
    danger: "#B8434F", conditional: "#8E6A28", wordmark: "#111512",
  },
  midnight: {
    canvas: "#111513", surface: "#191F1B", surfaceAlt: "#222A25", ink: "#F4F6F1", muted: "#9EA8A0",
    grid: "#303A34", primary: "#50D6A8", comparison: "#82A7FF", signal: "#FFC84A", future: "#20251F",
    danger: "#FF7A86", conditional: "#D6AF62", wordmark: "#F4F6F1",
  },
  warm_editorial: {
    canvas: "#F3EBDD", surface: "#FBF6EC", surfaceAlt: "#E8DCC9", ink: "#201812", muted: "#74675D",
    grid: "#D7C8B4", primary: "#236C5B", comparison: "#315B8A", signal: "#D95B35", future: "#F4DDB8",
    danger: "#A73D48", conditional: "#8B6527", wordmark: "#201812",
  },
  cool_mono: {
    canvas: "#EDF1F3", surface: "#F8FAFA", surfaceAlt: "#DCE4E8", ink: "#10181C", muted: "#607078",
    grid: "#CBD5D9", primary: "#174F63", comparison: "#6B5FA8", signal: "#E06B3C", future: "#E6EDF0",
    danger: "#A84752", conditional: "#7D672D", wordmark: "#10181C",
  },
});

export const FRAME_SURFACE_SYSTEMS = Object.freeze({
  paper_signal: {
    displaySystem: "signal_sans",
    displayFont: "-apple-system, BlinkMacSystemFont, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif",
    claimSize: 34,
    claimWeight: 780,
    claimTracking: "-0.025em",
    plotRadius: 8,
    seriesWidth: 3.2,
    gridOpacity: 0.86,
    futureOpacity: 0.88,
    areaOpacity: 0.1,
  },
  midnight: {
    displaySystem: "high_contrast_sans",
    displayFont: "Arial, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif",
    claimSize: 35,
    claimWeight: 800,
    claimTracking: "-0.035em",
    plotRadius: 0,
    seriesWidth: 3.8,
    gridOpacity: 0.7,
    futureOpacity: 0.62,
    areaOpacity: 0.08,
  },
  warm_editorial: {
    displaySystem: "editorial_serif",
    displayFont: "STSong, Songti SC, Noto Serif CJK SC, Georgia, serif",
    claimSize: 37,
    claimWeight: 650,
    claimTracking: "-0.01em",
    plotRadius: 0,
    seriesWidth: 2.8,
    gridOpacity: 0.58,
    futureOpacity: 0.74,
    areaOpacity: 0.07,
  },
  cool_mono: {
    displaySystem: "precision_mono",
    displayFont: "SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace",
    claimSize: 31,
    claimWeight: 720,
    claimTracking: "-0.04em",
    plotRadius: 2,
    seriesWidth: 2.5,
    gridOpacity: 0.95,
    futureOpacity: 0.82,
    areaOpacity: 0.06,
  },
});

const COMPOSITION_DESIGN_PROFILES = Object.freeze({
  curve_stage: { design_family: "signal_poster", narrative_placement: "side_right" },
  editorial_split: { design_family: "editorial_argument", narrative_placement: "side_left" },
  divergence_field: { design_family: "tension_field", narrative_placement: "footer_band" },
  timeline_rail: { design_family: "temporal_rail", narrative_placement: "time_first" },
  threshold_field: { design_family: "trigger_poster", narrative_placement: "side_right" },
  scenario_field: { design_family: "branch_map", narrative_placement: "branch_origin" },
  causal_spine: { design_family: "mechanism_path", narrative_placement: "pathway" },
  evidence_balance: { design_family: "evidence_tension", narrative_placement: "split_tension" },
});

export function expressionDesignProfile(expression) {
  const composition = COMPOSITION_DESIGN_PROFILES[expression.composition];
  const surface = FRAME_SURFACE_SYSTEMS[expression.surface];
  if (!composition || !surface) throw new Error(`Unknown Frame design profile ${expression.composition}/${expression.surface}.`);
  return {
    ...composition,
    display_system: surface.displaySystem,
    material_system: expression.surface,
    fingerprint: `${expression.grammar}/${expression.composition}/${expression.surface}/${surface.displaySystem}/${composition.narrative_placement}`,
  };
}

const STATE_LABELS = Object.freeze({
  observed: ["OBSERVED", "OBSERVED"],
  reported: ["REPORTED", "REPORTED"],
  derived: ["DERIVED", "DERIVED"],
  creator_view: ["MY VIEW", "MY VIEW"],
  conditional: ["WATCH", "WATCH"],
});

const BEAT_LABELS = Object.freeze({
  observation: ["WHAT CHANGED", "WHAT CHANGED"],
  mechanism: ["WHY IT MATTERS", "WHY IT MATTERS"],
  implication: ["WHAT COMES NEXT", "WHAT COMES NEXT"],
  countercase: ["REASSESS IF", "REASSESS IF"],
});

const GRAMMAR_LABELS = Object.freeze({
  curve_story: ["HISTORICAL CURVE + FORWARD WATCH", "HISTORICAL CURVE + FORWARD WATCH"],
  relative_divergence: ["RELATIVE DIVERGENCE", "RELATIVE DIVERGENCE"],
  drawdown_recovery: ["DRAWDOWN + RECOVERY SPEED", "DRAWDOWN + RECOVERY SPEED"],
  correlation_shift: ["ROLLING CORRELATION SHIFT", "ROLLING CORRELATION SHIFT"],
  event_window: ["EVENT WINDOW", "EVENT WINDOW"],
  threshold_regime: ["THRESHOLD REGIME", "THRESHOLD REGIME"],
  scenario_lanes: ["TWO POSSIBLE PATHS", "TWO POSSIBLE PATHS"],
  causal_spine: ["CAUSAL SPINE", "CAUSAL SPINE"],
  evidence_balance: ["EVIDENCE BALANCE", "EVIDENCE BALANCE"],
});

const TRANSFORM_LABELS = Object.freeze({
  raw_price: ["historical price", "historical price"],
  indexed_return: ["indexed return", "indexed return"],
  relative_spread: ["relative return spread (pp)", "relative return spread (pp)"],
  drawdown: ["drawdown from prior high", "drawdown from prior high"],
  rolling_correlation: ["rolling return correlation", "rolling return correlation"],
  volume_ratio: ["volume / rolling average", "volume / rolling average"],
  none: ["no support panel", "no support panel"],
});

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

function number(value, label, { nullable = false, positive = false } = {}) {
  if (value === null && nullable) return null;
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

function wrapText(value, maxUnits, maxLines = 2) {
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
    } else line += word;
  }
  if (line.trim()) lines.push(line.trim());
  const truncated = lines.length > maxLines;
  const visible = lines.slice(0, maxLines);
  if (truncated) {
    let finalLine = `${visible.at(-1)}…`;
    while (textWidth(finalLine) > maxUnits && finalLine.length > 1) finalLine = `${finalLine.slice(0, -2)}…`;
    visible[visible.length - 1] = finalLine;
  }
  return { lines: visible, truncated };
}

function textBlock({ x, y, text, size, color, weight = 500, maxUnits = 30, maxLines = 2, lineHeight = 1.18, anchor = "start", attrs = "", minSize = Math.max(10, size * 0.72) }) {
  let fittedSize = size;
  let fittedUnits = maxUnits;
  let wrapped = wrapText(text, fittedUnits, maxLines);
  while (wrapped.truncated && fittedSize > minSize) {
    fittedSize = Math.max(minSize, fittedSize - 0.5);
    fittedUnits = maxUnits * (size / fittedSize);
    wrapped = wrapText(text, fittedUnits, maxLines);
  }
  const lines = wrapped.lines;
  const tspans = lines.map((line, index) => (
    `<tspan x="${f(x)}" dy="${index === 0 ? 0 : f(fittedSize * lineHeight)}">${esc(line)}</tspan>`
  )).join("");
  const truncation = wrapped.truncated ? ' data-text-truncated="true"' : "";
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" fill="${color}" font-size="${f(fittedSize)}" font-weight="${weight}"${truncation} ${attrs}>${tspans}</text>`;
}

function stateColor(state, palette) {
  if (state === "conditional") return palette.conditional;
  if (state === "creator_view") return palette.signal;
  if (state === "derived") return palette.comparison;
  return palette.primary;
}

function bindingAttr(bindingId, state, geometry = "text") {
  return `data-binding-ref="${esc(bindingId)}" data-claim-state="${esc(state)}" data-binding-display="${geometry}"`;
}

function normalizeBars(leg, time) {
  const start = Date.parse(time.observation_start);
  const declared = Date.parse(time.declared_at);
  const seen = new Set();
  const bars = leg.candles.data.bars.map((bar, index) => {
    const observedAt = iso(bar.openTime, `${leg.ticker}.bars[${index}].openTime`);
    if (seen.has(observedAt)) throw new Error(`${leg.ticker} contains duplicate candle ${observedAt}.`);
    seen.add(observedAt);
    const open = number(bar.open, `${leg.ticker}.bars[${index}].open`, { positive: true });
    const high = number(bar.high, `${leg.ticker}.bars[${index}].high`, { positive: true });
    const low = number(bar.low, `${leg.ticker}.bars[${index}].low`, { positive: true });
    const close = number(bar.close, `${leg.ticker}.bars[${index}].close`, { positive: true });
    const volume = number(bar.volume, `${leg.ticker}.bars[${index}].volume`, { nullable: true });
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      throw new Error(`${leg.ticker}.bars[${index}] violates OHLC bounds.`);
    }
    return { observed_at: observedAt, open, high, low, close, volume };
  }).filter((bar) => {
    const timestamp = Date.parse(bar.observed_at);
    return timestamp >= start && timestamp <= declared;
  }).sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  if (bars.length < 2) throw new Error(`${leg.ticker} needs at least two observations inside the declared historical window.`);
  return bars;
}

function synchronized(primary, benchmark) {
  const byTime = new Map(benchmark.map((point) => [point.observed_at, point]));
  const pairs = primary.flatMap((point) => {
    const other = byTime.get(point.observed_at);
    return other ? [[point, other]] : [];
  });
  if (pairs.length < 2) throw new Error("Paired transforms need at least two synchronized observations.");
  return pairs;
}

function indexed(points) {
  const baseline = points[0].close;
  return points.map((point) => ({ ...point, value: (point.close / baseline - 1) * 100 }));
}

function drawdown(points) {
  let peak = -Infinity;
  return points.map((point) => {
    peak = Math.max(peak, point.close);
    return { ...point, value: (point.close / peak - 1) * 100 };
  });
}

function recoveryStats(points) {
  let peakIndex = 0;
  let runningPeakIndex = 0;
  let maxDrawdown = 0;
  let troughIndex = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (points[index].close >= points[runningPeakIndex].close) runningPeakIndex = index;
    const drawdownPct = (points[index].close / points[runningPeakIndex].close - 1) * 100;
    if (drawdownPct < maxDrawdown) {
      maxDrawdown = drawdownPct;
      peakIndex = runningPeakIndex;
      troughIndex = index;
    }
  }
  let recoveryIndex = null;
  for (let index = troughIndex + 1; index < points.length; index += 1) {
    if (points[index].close >= points[peakIndex].close) {
      recoveryIndex = index;
      break;
    }
  }
  return {
    max_drawdown_pct: maxDrawdown,
    peak_at: points[peakIndex].observed_at,
    trough_at: points[troughIndex].observed_at,
    recovered_at: recoveryIndex === null ? null : points[recoveryIndex].observed_at,
    recovery_bars: recoveryIndex === null ? null : recoveryIndex - troughIndex,
  };
}

function priceMetrics(points) {
  return {
    return_pct: (points.at(-1).close / points[0].close - 1) * 100,
    first_close: points[0].close,
    latest_close: points.at(-1).close,
    ...recoveryStats(points),
  };
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const meanLeft = left.reduce((sum, item) => sum + item, 0) / left.length;
  const meanRight = right.reduce((sum, item) => sum + item, 0) / right.length;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const deltaLeft = left[index] - meanLeft;
    const deltaRight = right[index] - meanRight;
    covariance += deltaLeft * deltaRight;
    varianceLeft += deltaLeft ** 2;
    varianceRight += deltaRight ** 2;
  }
  const denominator = Math.sqrt(varianceLeft * varianceRight);
  return denominator === 0 ? null : covariance / denominator;
}

function rollingCorrelation(pairs, window) {
  const returns = [];
  for (let index = 1; index < pairs.length; index += 1) {
    returns.push({
      observed_at: pairs[index][0].observed_at,
      primary: pairs[index][0].close / pairs[index - 1][0].close - 1,
      benchmark: pairs[index][1].close / pairs[index - 1][1].close - 1,
    });
  }
  const output = [];
  for (let index = window - 1; index < returns.length; index += 1) {
    const slice = returns.slice(index - window + 1, index + 1);
    const value = correlation(slice.map((item) => item.primary), slice.map((item) => item.benchmark));
    if (value !== null) output.push({ observed_at: returns[index].observed_at, value });
  }
  if (output.length < 2) throw new Error(`rolling_correlation needs at least ${window + 2} synchronized observations.`);
  return output;
}

function volumeRatio(points, window) {
  const output = [];
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].volume === null) continue;
    const previous = points.slice(Math.max(0, index - window), index).map((point) => point.volume).filter(Number.isFinite);
    if (!previous.length) continue;
    const average = previous.reduce((sum, item) => sum + item, 0) / previous.length;
    if (average > 0) output.push({ observed_at: points[index].observed_at, value: points[index].volume / average });
  }
  if (output.length < 2) throw new Error("volume_ratio needs at least two usable volume observations.");
  return output;
}

function panelFor(transform, market, primary, benchmark, bindingIds) {
  const pairs = benchmark ? synchronized(primary, benchmark) : null;
  if (transform === "raw_price") {
    return {
      transform,
      unit: "price",
      zero: false,
      series: [{ id: "S1", label: market.primary.ticker, role: "primary", binding_id: bindingIds[0], points: primary.map((point) => ({ ...point, value: point.close })) }],
    };
  }
  if (transform === "indexed_return") {
    const series = [{ id: "S1", label: market.primary.ticker, role: "primary", binding_id: bindingIds[0], points: indexed(primary) }];
    if (benchmark) series.push({ id: "S2", label: market.benchmark.ticker, role: "comparison", binding_id: bindingIds[1], points: indexed(benchmark) });
    return { transform, unit: "%", zero: true, series };
  }
  if (transform === "relative_spread") {
    if (!pairs) throw new Error("relative_spread requires a benchmark.");
    const primaryIndexed = indexed(pairs.map((pair) => pair[0]));
    const benchmarkIndexed = indexed(pairs.map((pair) => pair[1]));
    return {
      transform,
      unit: "pp",
      zero: true,
      series: [{
        id: "S1",
        label: `${market.primary.ticker} − ${market.benchmark.ticker}`,
        role: "primary",
        binding_id: bindingIds[0],
        points: primaryIndexed.map((point, index) => ({ ...point, value: point.value - benchmarkIndexed[index].value })),
      }],
    };
  }
  if (transform === "drawdown") {
    const series = [{
      id: "S1", label: market.primary.ticker, role: "primary", binding_id: bindingIds[0],
      points: drawdown(primary), recovery: recoveryStats(primary),
    }];
    if (benchmark) series.push({
      id: "S2", label: market.benchmark.ticker, role: "comparison", binding_id: bindingIds[1],
      points: drawdown(benchmark), recovery: recoveryStats(benchmark),
    });
    return { transform, unit: "%", zero: true, series };
  }
  if (transform === "rolling_correlation") {
    if (!pairs) throw new Error("rolling_correlation requires a benchmark.");
    return {
      transform,
      unit: "ρ",
      zero: true,
      fixed_domain: [-1, 1],
      series: [{
        id: "S1",
        label: `${market.primary.ticker} × ${market.benchmark.ticker}`,
        role: "primary",
        binding_id: bindingIds[0],
        points: rollingCorrelation(pairs, market.rolling_window),
      }],
    };
  }
  if (transform === "volume_ratio") {
    return {
      transform,
      unit: "×",
      zero: false,
      reference: 1,
      series: [{ id: "S1", label: market.primary.ticker, role: "primary", binding_id: bindingIds[0], points: volumeRatio(primary, market.rolling_window) }],
    };
  }
  throw new Error(`Unsupported transform ${transform}.`);
}

export function compileExpression(expression) {
  if (expression.market === null) return {
    main: null, support: null, source_cutoff: expression.time.declared_at, raw: null, metrics: null,
  };
  const primary = normalizeBars(expression.market.primary, expression.time);
  const benchmark = expression.market.benchmark ? normalizeBars(expression.market.benchmark, expression.time) : null;
  const main = panelFor(expression.market.main_transform, expression.market, primary, benchmark, expression.market.main_binding_ids);
  const support = expression.market.support_transform === "none"
    ? null
    : panelFor(expression.market.support_transform, expression.market, primary, benchmark, expression.market.support_binding_ids);
  const metrics = {
    primary: priceMetrics(primary),
    benchmark: benchmark ? priceMetrics(benchmark) : null,
    relative_return_pp: benchmark
      ? priceMetrics(primary).return_pct - priceMetrics(benchmark).return_pct
      : null,
    latest_correlation: null,
  };
  if (benchmark) {
    try {
      metrics.latest_correlation = rollingCorrelation(synchronized(primary, benchmark), expression.market.rolling_window).at(-1).value;
    } catch {
      // Correlation is optional unless the selected grammar explicitly tests it.
    }
  }
  return {
    main, support, source_cutoff: expression.time.declared_at,
    raw: { primary, benchmark }, metrics,
  };
}

function panelDomain(panel, annotations = []) {
  if (panel.fixed_domain) return panel.fixed_domain;
  const values = panel.series.flatMap((series) => series.points.map((point) => point.value));
  for (const annotation of annotations) if (annotation.kind === "threshold" && Number.isFinite(annotation.value)) values.push(annotation.value);
  if (panel.zero) values.push(0);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (low === high) {
    low -= Math.abs(low || 1) * 0.05;
    high += Math.abs(high || 1) * 0.05;
  }
  const padding = Math.max((high - low) * 0.12, panel.unit === "price" ? Math.abs(high) * 0.005 : 0.25);
  return [low - padding, high + padding];
}

function dateLabel(timestamp, locale) {
  return new Date(timestamp).toLocaleDateString(locale || "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function shortNumericDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function valueLabel(value, unit) {
  if (unit === "price") {
    const magnitude = Math.abs(value);
    if (magnitude >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: magnitude >= 10000 ? 0 : 1 });
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (unit === "%" || unit === "pp") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${unit}`;
  if (unit === "×") return `${value.toFixed(2)}×`;
  return value.toFixed(2);
}

function compactPriceLabel(value) {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}M`;
  if (magnitude >= 10_000) return `${(value / 1_000).toFixed(magnitude >= 100_000 ? 0 : 1)}K`;
  return valueLabel(value, "price");
}

function seriesColor(role, palette) {
  return role === "comparison" ? palette.comparison : palette.primary;
}

function linePath(points, xScale, yScale) {
  return points.map((point, index) => `${index ? "L" : "M"} ${f(xScale(Date.parse(point.observed_at)))} ${f(yScale(point.value))}`).join(" ");
}

function areaPath(first, second, xScale, yScale) {
  const secondByTime = new Map(second.map((point) => [point.observed_at, point]));
  const pairs = first.flatMap((point) => secondByTime.has(point.observed_at) ? [[point, secondByTime.get(point.observed_at)]] : []);
  if (pairs.length < 2) return "";
  const forward = pairs.map((pair) => `${f(xScale(Date.parse(pair[0].observed_at)))} ${f(yScale(pair[0].value))}`);
  const backward = pairs.slice().reverse().map((pair) => `${f(xScale(Date.parse(pair[1].observed_at)))} ${f(yScale(pair[1].value))}`);
  return `M ${forward.join(" L ")} L ${backward.join(" L ")} Z`;
}

function renderWordmark(palette) {
  const inner = WORDMARK
    .replace(/^<svg[^>]*>/u, "")
    .replace(/<\/svg>\s*$/u, "")
    .replaceAll('#F2F3F4', palette.wordmark);
  return `<g id="cuebook-wordmark" transform="translate(1090 498) scale(1.35)" opacity="0.78">${inner}</g>`;
}

function transformSummary(expression, locale) {
  if (!expression.market) return GRAMMAR_LABELS[expression.grammar][locale === "zh-CN" ? 0 : 1];
  const index = locale === "zh-CN" ? 0 : 1;
  const labels = [TRANSFORM_LABELS[expression.market.main_transform][index]];
  if (expression.market.support_transform !== "none") labels.push(TRANSFORM_LABELS[expression.market.support_transform][index]);
  return labels.join(" · support: ");
}

function relativeDayLabel(timestamp, declaredAt, locale) {
  const days = Math.max(1, Math.round((Date.parse(timestamp) - Date.parse(declaredAt)) / 86_400_000));
  return locale === "zh-CN" ? `D+${days} · ${dateLabel(timestamp, locale)}` : `D+${days} · ${dateLabel(timestamp, locale)}`;
}

function clipped(value, maximum) {
  const text = String(value).trim();
  return [...text].length <= maximum ? text : `${[...text].slice(0, maximum - 1).join("")}…`;
}

export function generateExpressionAltText(expression, candidate, compiled = compileExpression(expression)) {
  const locale = localeFor(candidate);
  const grammar = GRAMMAR_LABELS[expression.grammar][locale === "zh-CN" ? 0 : 1];
  const future = expression.future_beats
    .map((beat) => `${beat.label} (${beat.criterion})`)
    .join(", ");
  const dataNotice = expression.data_status === "synthetic_fixture" ? "Synthetic test data; not publishable. " : "";
  const transform = transformSummary(expression, locale);
  const text = `${dataNotice}${grammar} for ${expression.subject_label}: ${expression.argument.observation.text}. Geometry uses ${transform}; after the view date there is no forecast price path${future ? `, only ${future}` : ""}.`;
  // FramePreviewV1 caps alt text at 240 visible characters. Keep the same
  // deterministic description in the SVG and the structured Frame output.
  return clipped(text, 240);
}

function renderHeader(expression, candidate, compiled, palette, locale) {
  const claim = expression.argument.claim;
  const surfaceSystem = FRAME_SURFACE_SYSTEMS[expression.surface];
  const label = `${expression.subject_label} · ${expression.horizon_label}`;
  const asOf = expression.data_as_of ? dateLabel(expression.data_as_of, locale) : null;
  const source = expression.data_status === "synthetic_fixture"
    ? `TEST DATA · NOT PUBLISHABLE · ${expression.source_label}${asOf ? ` · as of ${asOf}` : ""}`
    : `${expression.source_label}${asOf ? ` · as of ${asOf}` : ""}`;
  const sourceColor = expression.data_status === "synthetic_fixture" ? palette.danger : palette.muted;
  return [
    `<circle cx="53" cy="45" r="4" fill="${palette.signal}"/>`,
    `<text x="65" y="51" fill="${palette.muted}" font-size="15" font-weight="650" letter-spacing="0.04em">${esc(label)}</text>`,
    `<g data-data-status="${esc(expression.data_status)}"><text x="1191" y="43" text-anchor="end" fill="${sourceColor}" font-size="12.5" font-weight="650">${esc(source)}</text><text x="1191" y="62" text-anchor="end" fill="${palette.muted}" font-size="10.5">${esc(transformSummary(expression, locale))}</text></g>`,
    textBlock({
      x: 52, y: 113, text: claim.text, size: surfaceSystem.claimSize + (expression.composition === "editorial_split" ? 1 : 0),
      color: palette.ink, weight: surfaceSystem.claimWeight, maxUnits: expression.composition === "editorial_split" ? 22 : 34, maxLines: 2,
      attrs: `${bindingAttr(claim.binding_id, claim.state)} data-role="claim" font-family="${surfaceSystem.displayFont}" letter-spacing="${surfaceSystem.claimTracking}"`,
    }),
    `<desc id="frame-desc">${esc(generateExpressionAltText(expression, candidate, compiled))}</desc>`,
  ].join("");
}

function beatPanel(beat, role, x, y, width, palette, locale, { compact = false } = {}) {
  const publicLabel = (BEAT_LABELS[role] ?? STATE_LABELS[beat.state])[locale === "zh-CN" ? 0 : 1];
  const color = stateColor(beat.state, palette);
  const height = compact ? 78 : 92;
  const copySize = compact ? 17 : 18;
  return [
    `<g ${bindingAttr(beat.binding_id, beat.state)} data-role="${role}">`,
    `<rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${height}" rx="10" fill="${palette.surface}" stroke="${palette.grid}"/>`,
    `<rect x="${f(x)}" y="${f(y)}" width="4" height="${height}" rx="2" fill="${color}"/>`,
    `<text x="${f(x + 15)}" y="${f(y + 22)}" fill="${color}" font-size="11" font-weight="750" letter-spacing="0.08em">${esc(publicLabel)}</text>`,
    textBlock({ x: x + 15, y: y + 49, text: beat.text, size: copySize, color: palette.ink, weight: 610, maxUnits: Math.max(12, width / copySize * 0.9), maxLines: 2 }),
    "</g>",
  ].join("");
}

function beatOpen(beat, role, x, y, width, palette, locale, { compact = false } = {}) {
  const publicLabel = (BEAT_LABELS[role] ?? STATE_LABELS[beat.state])[locale === "zh-CN" ? 0 : 1];
  const color = stateColor(beat.state, palette);
  const copySize = compact ? 15.5 : 17;
  return [
    `<g ${bindingAttr(beat.binding_id, beat.state)} data-role="${role}" data-layout="open-beat">`,
    `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + width)}" y2="${f(y)}" stroke="${palette.grid}" stroke-width="1.2"/>`,
    `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.min(54, width * 0.18))}" y2="${f(y)}" stroke="${color}" stroke-width="3"/>`,
    `<text x="${f(x)}" y="${f(y + 22)}" fill="${color}" font-size="10.5" font-weight="760" letter-spacing="0.06em">${esc(publicLabel)}</text>`,
    textBlock({
      x,
      y: y + 51,
      text: beat.text,
      size: copySize,
      color: palette.ink,
      weight: 640,
      maxUnits: Math.max(13, width / copySize * 0.96),
      maxLines: 2,
      minSize: 12.5,
    }),
    "</g>",
  ].join("");
}

function chartLayout(expression) {
  if (expression.composition === "editorial_split") return { plot: { x: 408, y: 170, w: 782, h: 282 }, side: { x: 52, y: 180, w: 322 } };
  if (expression.composition === "divergence_field") return { plot: { x: 52, y: 170, w: 1138, h: 220 }, side: null };
  if (expression.composition === "timeline_rail") return { plot: { x: 52, y: 236, w: 1138, h: 196 }, side: null };
  if (expression.composition === "threshold_field") return { plot: { x: 52, y: 170, w: 836, h: 282 }, side: { x: 918, y: 180, w: 272 } };
  return { plot: { x: 52, y: 170, w: 790, h: 282 }, side: { x: 872, y: 180, w: 318 } };
}

function renderPanel(panel, box, expression, palette, locale, { support = false } = {}) {
  const surfaceSystem = FRAME_SURFACE_SYSTEMS[expression.surface];
  const annotations = support ? [] : expression.annotations;
  const [low, high] = panelDomain(panel, annotations);
  const declared = Date.parse(expression.time.declared_at);
  const start = Date.parse(expression.time.observation_start);
  const horizon = expression.time.horizon_end ? Date.parse(expression.time.horizon_end) : declared;
  const hasFuture = expression.time.future_mode !== "none" && horizon > declared;
  const historyRatio = hasFuture ? 0.72 : 1;
  const historyWidth = box.w * historyRatio;
  const xScale = (timestamp) => {
    if (timestamp <= declared || !hasFuture) return box.x + ((timestamp - start) / Math.max(declared - start, 1)) * historyWidth;
    return box.x + historyWidth + ((timestamp - declared) / Math.max(horizon - declared, 1)) * (box.w - historyWidth);
  };
  const yScale = (value) => box.y + box.h - ((value - low) / Math.max(high - low, Number.EPSILON)) * box.h;
  const parts = [];
  const futureMarkers = [];
  let primaryEndpoint = null;
  parts.push(`<g data-chart-transform="${panel.transform}" data-series-state="observed">`);
  parts.push(`<rect x="${f(box.x)}" y="${f(box.y)}" width="${f(box.w)}" height="${f(box.h)}" rx="${surfaceSystem.plotRadius}" fill="${palette.surface}"/>`);
  if (hasFuture) {
    const futureX = box.x + historyWidth;
    parts.push(`<rect data-future-region="unresolved" x="${f(futureX)}" y="${f(box.y)}" width="${f(box.w - historyWidth)}" height="${f(box.h)}" fill="${palette.future}" opacity="${surfaceSystem.futureOpacity}"/>`);
    parts.push(`<line x1="${f(futureX)}" y1="${f(box.y)}" x2="${f(futureX)}" y2="${f(box.y + box.h)}" stroke="${palette.signal}" stroke-width="1.5" stroke-dasharray="4 5"/>`);
    if (!support && expression.composition !== "timeline_rail") {
      expression.future_beats.forEach((beat, index) => {
        const explicit = beat.at ? Date.parse(beat.at) : null;
        const timestamp = explicit && explicit > declared && explicit <= horizon
          ? explicit
          : declared + ((index + 1) / (expression.future_beats.length + 1)) * (horizon - declared);
        const x = xScale(timestamp);
        const color = stateColor(beat.state, palette);
        const labelY = box.y + 22 + (index % 3) * 39;
        const labelX = Math.min(x + 7, box.x + box.w - 118);
        const timeLabel = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale) : expression.horizon_label;
        futureMarkers.push(`<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${beat.role}" data-geometry-type="future-marker"><line x1="${f(x)}" y1="${f(box.y + 8)}" x2="${f(x)}" y2="${f(box.y + box.h - 8)}" stroke="${color}" stroke-width="1.1" stroke-dasharray="3 4"/><rect x="${f(labelX - 4)}" y="${f(labelY - 13)}" width="116" height="32" rx="4" fill="${palette.future}"/><circle cx="${f(x)}" cy="${f(labelY - 5)}" r="3.5" fill="${color}"/><text x="${f(labelX)}" y="${f(labelY)}" fill="${color}" font-size="8.5" font-weight="750">${esc(timeLabel)}</text><text x="${f(labelX)}" y="${f(labelY + 14)}" fill="${palette.ink}" font-size="9.5" font-weight="650">${esc(clipped(beat.criterion, 22))}</text></g>`);
      });
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    const y = box.y + ratio * box.h;
    const value = high - ratio * (high - low);
    parts.push(`<line x1="${f(box.x)}" y1="${f(y)}" x2="${f(box.x + box.w)}" y2="${f(y)}" stroke="${palette.grid}" stroke-width="1" opacity="${surfaceSystem.gridOpacity}"/>`);
    if (!support || index === 0 || index === 3) {
      parts.push(`<text x="${f(box.x + 8)}" y="${f(y - 5)}" fill="${palette.muted}" font-size="${support ? 8.5 : 10.5}">${esc(valueLabel(value, panel.unit))}</text>`);
    }
  }
  if (panel.reference !== undefined) {
    const y = yScale(panel.reference);
    parts.push(`<line x1="${f(box.x)}" y1="${f(y)}" x2="${f(box.x + historyWidth)}" y2="${f(y)}" stroke="${palette.muted}" stroke-dasharray="4 4"/>`);
  } else if (panel.zero && low <= 0 && high >= 0) {
    const y = yScale(0);
    parts.push(`<line x1="${f(box.x)}" y1="${f(y)}" x2="${f(box.x + historyWidth)}" y2="${f(y)}" stroke="${palette.muted}" stroke-width="1.3" opacity="0.75"/>`);
  }
  if (panel.series.length === 2 && expression.grammar === "relative_divergence") {
    const area = areaPath(panel.series[0].points, panel.series[1].points, xScale, yScale);
    if (area) parts.push(`<path d="${area}" fill="${palette.comparison}" opacity="${surfaceSystem.areaOpacity}"/>`);
  }
  for (const [seriesIndex, series] of panel.series.entries()) {
    const color = seriesColor(series.role, palette);
    const attrs = bindingAttr(series.binding_id, "observed", "geometry");
    if (!support && expression.market?.chart_style === "candles" && panel.transform === "raw_price" && panel.series.length === 1) {
      const width = Math.max(2.5, Math.min(8, historyWidth / Math.max(series.points.length, 12) * 0.55));
      for (const point of series.points) {
        const x = xScale(Date.parse(point.observed_at));
        const up = point.close >= point.open;
        const candleColor = up ? palette.primary : palette.danger;
        const highY = yScale(point.high);
        const lowY = yScale(point.low);
        const openY = yScale(point.open);
        const closeY = yScale(point.close);
        parts.push(`<line ${attrs} x1="${f(x)}" y1="${f(highY)}" x2="${f(x)}" y2="${f(lowY)}" stroke="${candleColor}" stroke-width="1.2"/>`);
        parts.push(`<rect x="${f(x - width / 2)}" y="${f(Math.min(openY, closeY))}" width="${f(width)}" height="${f(Math.max(Math.abs(closeY - openY), 1.4))}" rx="1" fill="${up ? candleColor : palette.surface}" stroke="${candleColor}" stroke-width="1.2"/>`);
      }
    } else {
      parts.push(`<path ${attrs} d="${linePath(series.points, xScale, yScale)}" fill="none" stroke="${color}" stroke-width="${support ? Math.max(1.8, surfaceSystem.seriesWidth - 0.8) : surfaceSystem.seriesWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    const latest = series.points.at(-1);
    const labelX = xScale(Date.parse(latest.observed_at));
    const labelY = yScale(latest.value);
    if (!support && seriesIndex === 0) primaryEndpoint = { x: labelX, y: labelY };
    parts.push(`<circle cx="${f(labelX)}" cy="${f(labelY)}" r="${support ? 3 : 4.5}" fill="${palette.surface}" stroke="${color}" stroke-width="2.2"/>`);
    if (panel.series.length > 1 || support) {
      const offset = panel.series.length > 1 ? (seriesIndex === 0 ? -9 : 15) : -7;
      parts.push(`<text x="${f(Math.min(labelX + 8, box.x + historyWidth - 45))}" y="${f(labelY + offset)}" fill="${color}" font-size="${support ? 10.5 : 12}" font-weight="700">${esc(series.label)}</text>`);
    }
  }
  if (!support && primaryEndpoint) {
    const observation = expression.argument.observation;
    const color = stateColor(observation.state, palette);
    const noteX = Math.max(box.x + 24, Math.min(primaryEndpoint.x - 260, box.x + historyWidth - 284));
    const below = primaryEndpoint.y < box.y + box.h * 0.42;
    const noteY = Math.max(box.y + 54, Math.min(box.y + box.h - 44, primaryEndpoint.y + (below ? 52 : -42)));
    parts.push(`<g ${bindingAttr(observation.binding_id, observation.state)} data-role="observation" data-annotation-role="observation" data-layout="chart-attached"><path d="M ${f(primaryEndpoint.x - 7)} ${f(primaryEndpoint.y)} L ${f(noteX + 246)} ${f(primaryEndpoint.y)} L ${f(noteX + 246)} ${f(noteY - 11)}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.7"/><rect x="${f(noteX - 8)}" y="${f(noteY - 24)}" width="266" height="66" rx="3" fill="${palette.surface}" opacity="0.93"/><line x1="${f(noteX)}" y1="${f(noteY - 11)}" x2="${f(noteX + 42)}" y2="${f(noteY - 11)}" stroke="${color}" stroke-width="3"/><text x="${f(noteX)}" y="${f(noteY + 4)}" fill="${color}" font-size="9" font-weight="800" letter-spacing="0.06em">${esc("KEY POINT ON THE CHART")}</text>${textBlock({ x: noteX, y: noteY + 24, text: observation.text, size: 12.5, color: palette.ink, weight: 690, maxUnits: 25, maxLines: 2, minSize: 10 })}</g>`);
  }
  if (!support && expression.grammar === "drawdown_recovery") {
    panel.series.forEach((series, index) => {
      const recovery = series.recovery;
      if (!recovery) return;
      const startX = xScale(Date.parse(recovery.trough_at));
      const endX = recovery.recovered_at ? xScale(Date.parse(recovery.recovered_at)) : box.x + historyWidth;
      const y = box.y + 22 + index * 20;
      const color = seriesColor(series.role, palette);
      const duration = recovery.recovery_bars === null
        ? `${series.label} not recovered`
        : `${series.label} recovered in ${recovery.recovery_bars} bars`;
      parts.push(`<g data-geometry-type="recovery-duration"><line x1="${f(startX)}" y1="${f(y)}" x2="${f(endX)}" y2="${f(y)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="${recovery.recovered_at ? "none" : "4 4"}"/><line x1="${f(startX)}" y1="${f(y - 4)}" x2="${f(startX)}" y2="${f(y + 4)}" stroke="${color}"/><line x1="${f(endX)}" y1="${f(y - 4)}" x2="${f(endX)}" y2="${f(y + 4)}" stroke="${color}"/><text x="${f((startX + endX) / 2)}" y="${f(y - 5)}" text-anchor="middle" fill="${color}" font-size="9.5" font-weight="700">${esc(duration)}</text></g>`);
    });
  }
  if (!support) {
    for (const annotation of annotations) {
      const color = stateColor(annotation.state, palette);
      if (annotation.kind === "threshold" && Number.isFinite(annotation.value)) {
        const y = yScale(annotation.value);
        parts.push(`<g ${bindingAttr(annotation.binding_id, annotation.state, "geometry")}><line x1="${f(box.x)}" y1="${f(y)}" x2="${f(box.x + historyWidth)}" y2="${f(y)}" stroke="${color}" stroke-width="1.7" stroke-dasharray="7 5"/><rect x="${f(box.x + 12)}" y="${f(y - 22)}" width="${f(Math.min(190, 18 + textWidth(annotation.label) * 9))}" height="20" rx="4" fill="${palette.surfaceAlt}"/><text x="${f(box.x + 20)}" y="${f(y - 8)}" fill="${color}" font-size="11" font-weight="700">${esc(annotation.label)}</text></g>`);
      } else if (annotation.occurred_at) {
        const timestamp = Date.parse(annotation.occurred_at);
        if (timestamp < start || timestamp > horizon) continue;
        const x = xScale(timestamp);
        parts.push(`<g ${bindingAttr(annotation.binding_id, annotation.state, "geometry")}><line x1="${f(x)}" y1="${f(box.y)}" x2="${f(x)}" y2="${f(box.y + box.h)}" stroke="${color}" stroke-width="1.3" stroke-dasharray="3 4"/><circle cx="${f(x)}" cy="${f(box.y + 10)}" r="4" fill="${color}"/><text x="${f(Math.min(x + 7, box.x + box.w - 120))}" y="${f(box.y + 16)}" fill="${color}" font-size="11" font-weight="700">${esc(annotation.label)}</text></g>`);
      } else {
        const noteIndex = annotations.filter((item) => !item.occurred_at && item.kind !== "threshold").indexOf(annotation);
        parts.push(`<g ${bindingAttr(annotation.binding_id, annotation.state)}><circle cx="${f(box.x + box.w - 148)}" cy="${f(box.y + 18 + noteIndex * 22)}" r="3" fill="${color}"/><text x="${f(box.x + box.w - 138)}" y="${f(box.y + 22 + noteIndex * 22)}" fill="${color}" font-size="10.5" font-weight="650">${esc(annotation.label)}</text></g>`);
      }
    }
  }
  parts.push(...futureMarkers);
  parts.push("</g>");
  return parts.join("");
}

function renderTimeAxis(expression, box, palette, locale) {
  const start = Date.parse(expression.time.observation_start);
  const declared = Date.parse(expression.time.declared_at);
  const horizon = expression.time.horizon_end ? Date.parse(expression.time.horizon_end) : declared;
  const hasFuture = expression.time.future_mode !== "none" && horizon > declared;
  const declarationX = box.x + box.w * (hasFuture ? 0.72 : 1);
  const y = box.y + box.h + 20;
  return [
    `<g data-time-axis="common">`,
    `<text x="${f(box.x)}" y="${f(y)}" fill="${palette.muted}" font-size="10.5">${esc(dateLabel(start, locale))}</text>`,
    `<text x="${f(declarationX - 6)}" y="${f(y)}" text-anchor="end" fill="${palette.signal}" font-size="10.5" font-weight="700">${esc(`VIEW · ${dateLabel(declared, locale)}`)}</text>`,
    hasFuture ? `<text x="${f(box.x + box.w)}" y="${f(y)}" text-anchor="end" fill="${palette.conditional}" font-size="10.5" font-weight="700">${esc(`HORIZON · ${dateLabel(horizon, locale)}`)}</text>` : "",
    `</g>`,
  ].join("");
}

function renderInvalidation(expression, plot, palette, locale) {
  const beat = expression.argument.countercase;
  if (!beat) return "";
  const hasFuture = expression.time.future_mode !== "none" && expression.time.horizon_end;
  const width = Math.min(292, hasFuture ? plot.w * 0.27 - 14 : 292);
  const x = hasFuture ? plot.x + plot.w * 0.72 + 8 : plot.x + plot.w - width;
  const y = plot.y + plot.h - 66;
  return `<g ${bindingAttr(beat.binding_id, beat.state)} data-role="invalidation"><rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="58" rx="8" fill="${palette.surface}" stroke="${palette.conditional}" stroke-width="1.1"/><text x="${f(x + 12)}" y="${f(y + 16)}" fill="${palette.conditional}" font-size="9.5" font-weight="780">${esc("REASSESS IF")}</text>${textBlock({ x: x + 12, y: y + 34, text: beat.text, size: 10.5, color: palette.ink, weight: 600, maxUnits: Math.max(12, width / 10.5 * 0.84), maxLines: 2, minSize: 9 })}</g>`;
}

function renderFutureRail(expression, x, y, width, palette, locale) {
  if (!expression.future_beats.length) return "";
  const beatHeight = Math.min(66, 206 / expression.future_beats.length);
  const parts = [`<g data-future-language="${esc(expression.time.future_mode)}">`];
  expression.future_beats.forEach((beat, index) => {
    const top = y + index * (beatHeight + 6);
    const color = stateColor(beat.state, palette);
    const role = locale === "zh-CN"
      ? ({ catalyst: "CATALYST", checkpoint: "CHECKPOINT", confirmation: "CONFIRMATION", invalidation: "REASSESS IF", settlement: "HORIZON" }[beat.role])
      : beat.role.toUpperCase();
    const time = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale) : expression.horizon_label;
    parts.push(`<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${beat.role}"><line x1="${f(x)}" y1="${f(top + 9)}" x2="${f(x + 16)}" y2="${f(top + 9)}" stroke="${color}" stroke-width="2" stroke-dasharray="4 3"/><text x="${f(x + 24)}" y="${f(top + 13)}" fill="${color}" font-size="10.5" font-weight="750" letter-spacing="0.06em">${esc(`${role} · ${time}`)}</text>${textBlock({ x: x + 24, y: top + 37, text: `${beat.label} · ${beat.criterion}`, size: 14, color: palette.ink, weight: 610, maxUnits: Math.max(12, width / 14 * 0.82), maxLines: 2 })}</g>`);
  });
  parts.push("</g>");
  return parts.join("");
}

function renderChartNarrative(expression, layout, palette, locale) {
  const mechanism = expression.argument.mechanism;
  const implication = expression.argument.implication;
  const mechanismColor = stateColor(mechanism.state, palette);
  const implicationColor = stateColor(implication.state, palette);
  if (layout.side) {
    const { x, y, w } = layout.side;
    return [
      `<g ${bindingAttr(mechanism.binding_id, mechanism.state)} data-role="creator-pulse" data-layout="creator-pulse"><line x1="${f(x)}" y1="${f(y)}" x2="${f(x + w)}" y2="${f(y)}" stroke="${palette.grid}"/><line x1="${f(x)}" y1="${f(y)}" x2="${f(x + Math.min(72, w * 0.24))}" y2="${f(y)}" stroke="${mechanismColor}" stroke-width="4"/><text x="${f(x)}" y="${f(y + 24)}" fill="${mechanismColor}" font-size="10.5" font-weight="820" letter-spacing="0.07em">${esc("MY CREATOR EDGE")}</text>${textBlock({ x, y: y + 63, text: mechanism.text, size: 20, color: palette.ink, weight: 730, maxUnits: Math.max(15, w / 20 * 0.96), maxLines: 3, minSize: 14 })}</g>`,
      `<g ${bindingAttr(implication.binding_id, implication.state)} data-role="next-watch" data-layout="compact-watch"><line x1="${f(x)}" y1="${f(y + 178)}" x2="${f(x + w)}" y2="${f(y + 178)}" stroke="${palette.grid}"/><line x1="${f(x)}" y1="${f(y + 178)}" x2="${f(x + Math.min(52, w * 0.2))}" y2="${f(y + 178)}" stroke="${implicationColor}" stroke-width="3"/><text x="${f(x)}" y="${f(y + 200)}" fill="${implicationColor}" font-size="10" font-weight="800" letter-spacing="0.06em">${esc("WATCH NEXT")}</text>${textBlock({ x, y: y + 229, text: implication.text, size: 14, color: palette.ink, weight: 650, maxUnits: Math.max(15, w / 14 * 0.92), maxLines: 2, minSize: 11 })}</g>`,
    ].join("");
  }
  const y = expression.composition === "timeline_rail" ? 456 : 426;
  return [
    `<g ${bindingAttr(mechanism.binding_id, mechanism.state)} data-role="creator-pulse" data-layout="creator-pulse"><line x1="52" y1="${y}" x2="786" y2="${y}" stroke="${palette.grid}"/><line x1="52" y1="${y}" x2="128" y2="${y}" stroke="${mechanismColor}" stroke-width="4"/><text x="52" y="${y + 19}" fill="${mechanismColor}" font-size="10" font-weight="820" letter-spacing="0.07em">${esc("MY CREATOR EDGE")}</text>${textBlock({ x: 52, y: y + 49, text: mechanism.text, size: 18, color: palette.ink, weight: 730, maxUnits: 44, maxLines: 1, minSize: 13 })}</g>`,
    `<g ${bindingAttr(implication.binding_id, implication.state)} data-role="next-watch" data-layout="compact-watch"><line x1="820" y1="${y}" x2="1070" y2="${y}" stroke="${palette.grid}"/><line x1="820" y1="${y}" x2="868" y2="${y}" stroke="${implicationColor}" stroke-width="3"/><text x="820" y="${y + 19}" fill="${implicationColor}" font-size="9.5" font-weight="800" letter-spacing="0.06em">${esc("WATCH NEXT")}</text>${textBlock({ x: 820, y: y + 45, text: implication.text, size: 12.5, color: palette.ink, weight: 650, maxUnits: 20, maxLines: 1, minSize: 10 })}</g>`,
  ].join("");
}

function renderChartExpression(expression, candidate, compiled, palette, locale) {
  const layout = chartLayout(expression);
  const plot = { ...layout.plot };
  let supportBox = null;
  if (compiled.support) {
    const supportHeight = Math.min(74, plot.h * 0.27);
    supportBox = { x: plot.x, y: plot.y + plot.h - supportHeight, w: plot.w, h: supportHeight };
    plot.h -= supportHeight + 12;
  }
  const parts = [];
  if (expression.composition === "timeline_rail") {
    const future = expression.future_beats.slice(0, 4);
    const railY = 190;
    const segment = 1138 / Math.max(future.length, 1);
    future.forEach((beat, index) => {
      const x = 52 + index * segment;
      const color = stateColor(beat.state, palette);
      const time = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale) : expression.horizon_label;
      parts.push(`<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${beat.role}"><line x1="${f(x)}" y1="${railY}" x2="${f(x + segment - 18)}" y2="${railY}" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/><circle cx="${f(x)}" cy="${railY}" r="5" fill="${palette.surface}" stroke="${color}" stroke-width="2"/><text x="${f(x + 12)}" y="${railY - 8}" fill="${color}" font-size="9.5" font-weight="750">${esc(time)}</text>${textBlock({ x, y: railY + 25, text: `${beat.label} · ${beat.criterion}`, size: 12.5, color: palette.ink, weight: 620, maxUnits: Math.max(10, segment / 12.5 * 0.8), maxLines: 2 })}</g>`);
    });
  }
  parts.push(renderPanel(compiled.main, plot, expression, palette, locale));
  if (supportBox) parts.push(renderPanel(compiled.support, supportBox, expression, palette, locale, { support: true }));
  parts.push(renderTimeAxis(expression, layout.plot, palette, locale));
  parts.push(renderInvalidation(expression, plot, palette, locale));

  parts.push(renderChartNarrative(expression, layout, palette, locale));
  return parts.join("");
}

function renderMiniFutureStrip(expression, x, y, width, palette, locale) {
  if (!expression.future_beats.length) return "";
  const segment = width / expression.future_beats.length;
  return expression.future_beats.map((beat, index) => {
    const left = x + index * segment;
    const color = stateColor(beat.state, palette);
    const role = locale === "zh-CN"
      ? ({ catalyst: "CATALYST", checkpoint: "CHECK", confirmation: "CONFIRMATION", invalidation: "REASSESS IF", settlement: "HORIZON" }[beat.role])
      : beat.role.toUpperCase();
    const time = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale) : expression.horizon_label;
    return `<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${beat.role}" data-geometry-type="future-marker"><circle cx="${f(left + 4)}" cy="${f(y)}" r="3.5" fill="${color}"/><text x="${f(left + 13)}" y="${f(y + 4)}" fill="${color}" font-size="9.5" font-weight="750">${esc(`${role} · ${time}`)}</text>${textBlock({ x: left + 13, y: y + 23, text: `${beat.label} · ${beat.criterion}`, size: 10.5, color: palette.ink, weight: 580, maxUnits: Math.max(8, segment / 10.5 * 0.78), maxLines: 1 })}</g>`;
  }).join("");
}

function renderCausal(expression, palette, locale) {
  const beats = [
    [expression.argument.observation, "observation"],
    [expression.argument.mechanism, "mechanism"],
    [expression.argument.implication, "implication"],
  ];
  const parts = [];
  const startX = 52;
  const top = 188;
  const nodeWidth = 328;
  const gap = 72;
  beats.forEach(([beat, role], index) => {
    const x = startX + index * (nodeWidth + gap);
    const y = top + (index === 1 ? 48 : index === 2 ? 4 : 0);
    const color = stateColor(beat.state, palette);
    if (index) {
      const priorX = startX + (index - 1) * (nodeWidth + gap) + nodeWidth;
      const priorY = top + (index - 1 === 1 ? 48 : index - 1 === 2 ? 4 : 0) + 72;
      parts.push(`<path d="M ${f(priorX + 8)} ${f(priorY)} C ${f(priorX + 35)} ${f(priorY)}, ${f(x - 35)} ${f(y + 72)}, ${f(x - 8)} ${f(y + 72)}" fill="none" stroke="${color}" stroke-width="2.2" stroke-dasharray="${beat.state === "conditional" ? "6 5" : "none"}"/><path d="M ${f(x - 14)} ${f(y + 66)} L ${f(x - 5)} ${f(y + 72)} L ${f(x - 14)} ${f(y + 78)}" fill="none" stroke="${color}" stroke-width="2"/>`);
    }
    parts.push(beatPanel(beat, role, x, y, nodeWidth, palette, locale));
  });
  parts.push(`<rect x="52" y="392" width="1138" height="58" rx="12" fill="${palette.surfaceAlt}"/>`);
  parts.push(`<text x="72" y="426" fill="${palette.signal}" font-size="11" font-weight="760" letter-spacing="0.08em">${esc("FORWARD WATCH")}</text>`);
  parts.push(`<text x="1170" y="426" text-anchor="end" fill="${palette.conditional}" font-size="12" font-weight="700">${esc(expression.horizon_label)}</text>`);
  if (expression.argument.countercase) {
    parts.push(`<g ${bindingAttr(expression.argument.countercase.binding_id, expression.argument.countercase.state)} data-role="invalidation"><text x="850" y="414" fill="${palette.conditional}" font-size="9.5" font-weight="780">${esc("REASSESS IF")}</text>${textBlock({ x: 850, y: 435, text: expression.argument.countercase.text, size: 11.5, color: palette.ink, weight: 620, maxUnits: 25, maxLines: 1 })}</g>`);
  }
  parts.push(renderMiniFutureStrip(expression, 52, 466, 780, palette, locale));
  return parts.join("");
}

function renderScenario(expression, palette, locale) {
  const parts = [];
  parts.push(beatOpen(expression.argument.observation, "observation", 52, 176, 330, palette, locale, { compact: true }));
  parts.push(beatOpen(expression.argument.mechanism, "mechanism", 52, 264, 330, palette, locale, { compact: true }));
  parts.push(beatOpen(expression.argument.implication, "implication", 52, 352, 330, palette, locale, { compact: true }));
  const future = expression.future_beats.slice(0, 4);
  const originX = 434;
  const originY = 315;
  const laneX = 610;
  const laneWidth = 580;
  const laneHeight = Math.min(76, (282 - Math.max(0, future.length - 1) * 12) / Math.max(future.length, 1));
  parts.push(`<g data-scenario-origin="true"><circle cx="${originX}" cy="${originY}" r="10" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="3"/><text x="${originX}" y="${originY - 22}" text-anchor="middle" fill="${palette.signal}" font-size="10.5" font-weight="760">${esc("VIEW")}</text></g>`);
  future.forEach((beat, index) => {
    const y = 178 + index * (laneHeight + 12);
    const centerY = y + laneHeight / 2;
    const color = stateColor(beat.state, palette);
    const branch = locale === "zh-CN"
      ? (beat.role === "invalidation" ? "REASSESS IF" : beat.role === "settlement" ? "HORIZON CHECK" : "CONFIRMATION BRANCH")
      : (beat.role === "invalidation" ? "REASSESS IF" : beat.role === "settlement" ? "SETTLEMENT CHECK" : "CONFIRMATION BRANCH");
    const time = relativeDayLabel(beat.at, expression.time.declared_at, locale);
    parts.push(`<g ${bindingAttr(beat.binding_id, beat.state)} data-future-role="${beat.role}" data-geometry-type="conditional-lane">`);
    parts.push(`<path d="M ${originX + 12} ${originY} C ${originX + 78} ${originY}, ${laneX - 72} ${centerY}, ${laneX - 14} ${centerY}" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="${beat.state === "reported" ? "none" : "7 5"}"/>`);
    parts.push(`<circle cx="${laneX}" cy="${f(centerY)}" r="6" fill="${palette.canvas}" stroke="${color}" stroke-width="2.2"/>`);
    parts.push(`<line x1="${laneX + 14}" y1="${f(y)}" x2="${laneX + laneWidth}" y2="${f(y)}" stroke="${color}" stroke-width="2"/>`);
    parts.push(`<text x="${laneX + 18}" y="${f(y + 20)}" fill="${color}" font-size="9.5" font-weight="780">${esc(`${branch} · ${time}`)}</text>`);
    parts.push(textBlock({ x: laneX + 18, y: y + 46, text: beat.label, size: 16.5, color: palette.ink, weight: 660, maxUnits: 24, maxLines: 1, minSize: 13 }));
    parts.push(textBlock({ x: laneX + laneWidth, y: y + 46, text: beat.criterion, size: 11, color, weight: 700, maxUnits: 23, maxLines: 2, anchor: "end", minSize: 9.5 }));
    parts.push(`</g>`);
  });
  parts.push(`<line x1="${originX}" y1="468" x2="1190" y2="468" stroke="${palette.grid}"/><text x="${originX}" y="491" fill="${palette.signal}" font-size="11" font-weight="700">${esc(`VIEW · ${dateLabel(expression.time.declared_at, locale)}`)}</text><text x="1190" y="491" text-anchor="end" fill="${palette.conditional}" font-size="11" font-weight="700">${esc(`HORIZON · ${dateLabel(expression.time.horizon_end, locale)}`)}</text>`);
  if (expression.argument.countercase) {
    parts.push(`<g ${bindingAttr(expression.argument.countercase.binding_id, expression.argument.countercase.state)} data-role="invalidation"><text x="52" y="466" fill="${palette.conditional}" font-size="10" font-weight="780">${esc("REASSESS IF")}</text>${textBlock({ x: 140, y: 466, text: expression.argument.countercase.text, size: 11.5, color: palette.ink, weight: 620, maxUnits: 25, maxLines: 2, minSize: 9.5 })}</g>`);
  }
  return parts.join("");
}

function renderEvidenceBalance(expression, palette, locale) {
  const countercase = expression.argument.countercase;
  const parts = [];
  parts.push(`<rect x="52" y="176" width="546" height="236" fill="${palette.primary}" opacity="0.045"/>`);
  parts.push(`<rect x="646" y="176" width="544" height="236" fill="${palette.conditional}" opacity="0.04"/>`);
  parts.push(`<line x1="622" y1="184" x2="622" y2="404" stroke="${palette.grid}" stroke-width="1.4"/>`);
  parts.push(`<circle cx="622" cy="292" r="10" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="2.4"/>`);
  parts.push(`<path d="M 572 282 L 622 292 L 672 302" fill="none" stroke="${palette.signal}" stroke-width="2.4"/>`);
  parts.push(`<text x="76" y="210" fill="${palette.primary}" font-size="12" font-weight="760" letter-spacing="0.08em">${esc("SUPPORTING THE VIEW")}</text>`);
  parts.push(textBlock({ x: 76, y: 268, text: expression.argument.observation.text, size: 25, color: palette.ink, weight: 700, maxUnits: 20, maxLines: 3, minSize: 18, attrs: bindingAttr(expression.argument.observation.binding_id, expression.argument.observation.state) }));
  parts.push(textBlock({ x: 76, y: 374, text: expression.argument.mechanism.text, size: 15.5, color: palette.muted, weight: 590, maxUnits: 30, maxLines: 2, minSize: 12.5, attrs: bindingAttr(expression.argument.mechanism.binding_id, expression.argument.mechanism.state) }));
  parts.push(`<text x="670" y="210" fill="${palette.conditional}" font-size="12" font-weight="760" letter-spacing="0.08em">${esc("WHAT COULD CHANGE IT")}</text>`);
  if (countercase) parts.push(textBlock({ x: 670, y: 278, text: countercase.text, size: 25, color: palette.ink, weight: 700, maxUnits: 20, maxLines: 3, minSize: 18, attrs: bindingAttr(countercase.binding_id, countercase.state) }));
  parts.push(`<line x1="52" y1="438" x2="1190" y2="438" stroke="${palette.grid}" stroke-width="1.4"/>`);
  parts.push(`<text x="52" y="466" fill="${palette.conditional}" font-size="10.5" font-weight="760">${esc("ONE NEXT DISAGREEMENT")}</text>`);
  parts.push(textBlock({ x: 246, y: 468, text: expression.argument.implication.text, size: 17, color: palette.ink, weight: 650, maxUnits: 44, maxLines: 1, minSize: 13, attrs: bindingAttr(expression.argument.implication.binding_id, expression.argument.implication.state) }));
  parts.push(renderMiniFutureStrip(expression, 660, 145, 512, palette, locale));
  return parts.join("");
}

const MOBILE_MASTER_PROFILE = "single-master-mobile";
const MOBILE_PRIMARY_FONT_FLOOR = 20;
const MOBILE_SECONDARY_FONT_FLOOR = 16;

function compactWordmark(palette) {
  const inner = WORDMARK
    .replace(/^<svg[^>]*>/u, "")
    .replace(/<\/svg>\s*$/u, "")
    .replaceAll("#F2F3F4", palette.wordmark);
  return `<g id="cuebook-wordmark" transform="translate(538 35) scale(0.88)" opacity="0.66">${inner}</g>`;
}

function compactProvenance(expression, palette, locale) {
  const asOf = expression.data_as_of ? dateLabel(expression.data_as_of, locale) : null;
  const source = expression.data_status === "synthetic_fixture"
    ? "TEST DATA · NOT PUBLISHABLE"
    : expression.source_label;
  return [
    `<circle cx="20" cy="22" r="4" fill="${palette.signal}"/>`,
    `<text x="31" y="28" fill="${palette.ink}" font-size="16" font-weight="760" letter-spacing="0.02em">${esc(`${expression.subject_label} · ${expression.horizon_label}`)}</text>`,
    `<g data-role="mobile-provenance"><text x="602" y="27" text-anchor="end" fill="${expression.data_status === "synthetic_fixture" ? palette.danger : palette.muted}" font-size="14" font-weight="650">${esc(clipped(`${source}${asOf ? ` · ${asOf}` : ""}`, 28))}</text></g>`,
  ].join("");
}

function compactSeriesPath(panel, box, expression, palette, locale) {
  const allPoints = panel.series.flatMap((series) => series.points);
  const start = Math.min(...allPoints.map((point) => Date.parse(point.observed_at)));
  const end = Math.max(...allPoints.map((point) => Date.parse(point.observed_at)));
  const hasFuture = expression.time.future_mode !== "none" && expression.time.horizon_end;
  const historyWidth = box.w * (hasFuture ? 0.8 : 1);
  const [low, high] = panelDomain(panel, expression.annotations);
  const xScale = (timestamp) => box.x + ((timestamp - start) / Math.max(1, end - start)) * historyWidth;
  const yScale = (value) => box.y + box.h - ((value - low) / Math.max(1e-9, high - low)) * box.h;
  const parts = [`<g data-role="compact-evidence" data-chart-transform="${esc(panel.transform)}">`];
  if (hasFuture) {
    parts.push(
      `<rect x="${f(box.x + historyWidth)}" y="${f(box.y)}" width="${f(box.w - historyWidth)}" height="${f(box.h)}" fill="${palette.future}" opacity="0.72" data-future-region="unresolved"/>`,
      `<line x1="${f(box.x + historyWidth)}" y1="${f(box.y)}" x2="${f(box.x + historyWidth)}" y2="${f(box.y + box.h)}" stroke="${palette.signal}" stroke-width="2" stroke-dasharray="5 5"/>`,
    );
  }
  if (panel.zero && low < 0 && high > 0) {
    parts.push(`<line x1="${f(box.x)}" y1="${f(yScale(0))}" x2="${f(box.x + historyWidth)}" y2="${f(yScale(0))}" stroke="${palette.grid}" stroke-width="1.4"/>`);
  }
  const threshold = expression.annotations.find((annotation) => annotation.kind === "threshold" && Number.isFinite(annotation.value));
  if (threshold && threshold.value >= low && threshold.value <= high) {
    const thresholdY = yScale(threshold.value);
    parts.push(
      `<line x1="${f(box.x)}" y1="${f(thresholdY)}" x2="${f(box.x + historyWidth)}" y2="${f(thresholdY)}" stroke="${palette.signal}" stroke-width="3" stroke-dasharray="9 5" ${bindingAttr(threshold.binding_id, threshold.state, "threshold")}/>` ,
      `<text x="${f(box.x + 7)}" y="${f(Math.max(box.y + 14, thresholdY - 7))}" fill="${palette.signal}" font-size="13" font-weight="820">${esc(`${threshold.label} · ${valueLabel(threshold.value, "price")}`)}</text>`,
    );
  }
  const event = expression.annotations.find((annotation) => annotation.kind === "event" && annotation.occurred_at);
  if (event) {
    const occurredAt = Date.parse(event.occurred_at);
    if (occurredAt >= start && occurredAt <= end) {
      const eventX = xScale(occurredAt);
      parts.push(
        `<g ${bindingAttr(event.binding_id, event.state, "event")} data-role="event-marker"><line x1="${f(eventX)}" y1="${f(box.y)}" x2="${f(eventX)}" y2="${f(box.y + box.h)}" stroke="${palette.signal}" stroke-width="2.5" stroke-dasharray="5 4"/><circle cx="${f(eventX)}" cy="${f(box.y + 8)}" r="5" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="3"/><text x="${f(Math.min(eventX + 8, box.x + historyWidth - 92))}" y="${f(box.y + 18)}" fill="${palette.signal}" font-size="13" font-weight="820">${esc(clipped(`${event.label} · ${dateLabel(event.occurred_at, locale)}`, 18))}</text></g>`,
      );
    }
  }
  const labels = panel.series.map((series) => {
    const point = panel.transform === "drawdown"
      ? series.points.reduce((lowest, candidate) => candidate.value < lowest.value ? candidate : lowest)
      : series.points.at(-1);
    return {
      series,
      point,
      y: Math.max(box.y + 17, Math.min(box.y + box.h - 7, yScale(point.value) - 9)),
    };
  }).sort((left, right) => left.y - right.y);
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index].y - labels[index - 1].y < 20) labels[index].y = labels[index - 1].y + 20;
  }
  const overflow = Math.max(0, (labels.at(-1)?.y ?? 0) - (box.y + box.h - 7));
  if (overflow) labels.forEach((label) => { label.y -= overflow; });
  for (const { series, point, y } of labels) {
    const color = seriesColor(series.role, palette);
    const path = linePath(series.points, xScale, yScale);
    const endpointLabel = panel.transform === "raw_price"
      ? `${series.label} ${valueLabel(point.value, "price")} · ${dateLabel(point.observed_at, locale)}`
      : `${series.label} ${valueLabel(point.value, panel.unit)}`;
    parts.push(
      `<path d="${path}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${bindingAttr(series.binding_id, "derived", "curve")} data-series-state="observed"/>`,
    );
    parts.push(
      `<circle cx="${f(xScale(Date.parse(point.observed_at)))}" cy="${f(yScale(point.value))}" r="5" fill="${palette.canvas}" stroke="${color}" stroke-width="3"/>`,
      `<text x="${f(box.x + historyWidth - 8)}" y="${f(y)}" text-anchor="end" fill="${color}" font-size="16" font-weight="820">${esc(endpointLabel)}</text>`,
    );
  }
  parts.push("</g>");
  return parts.join("");
}

function compactEssentialText({ x, y, text, color, widthUnits, lines = 2, anchor = "start", binding = "", group, tier = "primary" }) {
  const primary = tier === "primary";
  return textBlock({
    x,
    y,
    text,
    size: primary ? 22 : 18,
    color,
    weight: 780,
    maxUnits: widthUnits,
    maxLines: lines,
    minSize: primary ? MOBILE_PRIMARY_FONT_FLOOR : MOBILE_SECONDARY_FONT_FLOOR,
    anchor,
    attrs: `${binding} data-essential-copy="true" data-essential-tier="${tier}" data-essential-copy-group="${group}"`,
  });
}

function compactHistoricalContext(expression, compiled, palette, locale, { x, y, anchor = "start" }) {
  const points = compiled.raw?.primary;
  if (!points?.length) return "";
  const first = points[0];
  const last = points.at(-1);
  const change = (last.close / first.close - 1) * 100;
  const label = `${expression.market.primary.ticker} · ${shortNumericDate(first.observed_at)} ${compactPriceLabel(first.close)} → ${shortNumericDate(last.observed_at)} ${compactPriceLabel(last.close)} · ${valueLabel(change, "%")}`;
  return `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" fill="${palette.muted}" font-size="16" font-weight="760" data-role="historical-price-context" data-essential-copy="true" data-essential-tier="secondary" data-essential-copy-group="evidence">${esc(label)}</text>`;
}

function compactMechanism(expression, { x, y, widthUnits, palette, locale, anchor = "start", lines = 2 }) {
  const mechanism = expression.argument.mechanism;
  return [
    `<text x="${f(x)}" y="${f(y - 20)}" text-anchor="${anchor}" fill="${palette.signal}" font-size="12" font-weight="820" letter-spacing="0.05em">${esc("MY LOGIC")}</text>`,
    compactEssentialText({ x, y, text: mechanism.text, color: palette.ink, widthUnits, lines, anchor, binding: `${bindingAttr(mechanism.binding_id, mechanism.state)} data-role="creator-mechanism"`, group: "logic", tier: "secondary" }),
  ].join("");
}

function compactFuture(expression, { x, y, widthUnits, palette, locale, group = "future", lines = 2, anchor = "start", splitTime = false }) {
  const beat = expression.future_beats.find((item) => item.role === "settlement")
    ?? expression.future_beats.findLast((item) => item.at && Date.parse(item.at) === Date.parse(expression.time.horizon_end))
    ?? expression.future_beats.at(-1);
  if (!beat) return "";
  const time = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale) : expression.horizon_label;
  const label = `${time} · ${beat.label}`;
  if (splitTime) {
    return [
      `<g data-role="next-watch">`,
      `<text x="${f(x)}" y="${f(y - 21)}" text-anchor="${anchor}" fill="${stateColor(beat.state, palette)}" font-size="12" font-weight="820" letter-spacing="0.05em">${esc("HORIZON CHECK")}</text>`,
      `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" fill="${palette.ink}" font-size="16" font-weight="780" data-essential-copy="true" data-essential-tier="secondary" data-essential-copy-group="${group}">${esc(time)}</text>`,
      compactEssentialText({
        x,
        y: y + 23,
        text: beat.label,
        color: palette.ink,
        widthUnits,
        lines: Math.max(1, lines - 1),
        anchor,
        binding: bindingAttr(beat.binding_id, beat.state),
        group,
        tier: "secondary",
      }),
      `</g>`,
    ].join("");
  }
  return [
    `<g data-role="next-watch">`,
    `<text x="${f(x)}" y="${f(y - 21)}" text-anchor="${anchor}" fill="${stateColor(beat.state, palette)}" font-size="12" font-weight="820" letter-spacing="0.05em">${esc("HORIZON CHECK")}</text>`,
    compactEssentialText({
      x,
      y,
      text: label,
      color: palette.ink,
      widthUnits,
      lines,
      anchor,
      binding: bindingAttr(beat.binding_id, beat.state),
      group,
      tier: "secondary",
    }),
    `</g>`,
  ].join("");
}

function mobileEvidencePanel(expression, compiled) {
  if (
    expression.observation_test?.kind === "primary_outperformed_benchmark"
    && compiled.support?.transform === "relative_spread"
  ) return compiled.support;
  return compiled.main;
}

function renderCompactChart(expression, compiled, palette, locale) {
  const panel = mobileEvidencePanel(expression, compiled);
  const claim = expression.argument.claim;
  const observation = expression.argument.observation;
  if (expression.composition === "editorial_split") {
    return [
      `<g ${bindingAttr(observation.binding_id, observation.state, "annotation")} data-role="compact-observation-marker" data-annotation-role="observation"/>`,
      `<line x1="222" y1="48" x2="222" y2="224" stroke="${palette.grid}" stroke-width="1.5"/>`,
      compactEssentialText({ x: 20, y: 76, text: claim.text, color: palette.ink, widthUnits: 8.5, lines: 2, binding: `${bindingAttr(claim.binding_id, claim.state)} data-role="creator-interpretation"`, group: "logic" }),
      compactMechanism(expression, { x: 20, y: 148, widthUnits: 9.2, palette, locale, lines: 2 }),
      compactFuture(expression, { x: 20, y: 205, widthUnits: 11, palette, locale, lines: 3, splitTime: true }),
      compactHistoricalContext(expression, compiled, palette, locale, { x: 246, y: 62 }),
      compactSeriesPath(panel, { x: 246, y: 78, w: 356, h: 142 }, expression, palette, locale),
    ].join("");
  }
  if (expression.composition === "divergence_field" || expression.composition === "timeline_rail") {
    const plotY = expression.composition === "timeline_rail" ? 82 : 68;
    const plotH = expression.composition === "timeline_rail" ? 98 : 112;
    const future = expression.future_beats[0];
    return [
      expression.composition === "timeline_rail" && future
        ? `<g ${bindingAttr(future.binding_id, future.state)} data-role="compact-time-rail" data-future-region="unresolved"><line x1="20" y1="55" x2="602" y2="55" stroke="${palette.conditional}" stroke-width="2" stroke-dasharray="7 5"/><circle cx="20" cy="55" r="5" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="3"/><circle cx="602" cy="55" r="5" fill="${palette.canvas}" stroke="${palette.conditional}" stroke-width="3"/></g>`
        : "",
      compactHistoricalContext(expression, compiled, palette, locale, { x: 20, y: expression.composition === "timeline_rail" ? 76 : 55 }),
      compactSeriesPath(panel, { x: 20, y: plotY, w: 582, h: plotH }, expression, palette, locale),
      `<g ${bindingAttr(observation.binding_id, observation.state, "annotation")} data-role="compact-observation-marker" data-annotation-role="observation"/>`,
      compactEssentialText({ x: 20, y: 190, text: claim.text, color: palette.ink, widthUnits: 26, lines: 1, binding: `${bindingAttr(claim.binding_id, claim.state)} data-role="creator-interpretation"`, group: "logic" }),
      compactMechanism(expression, { x: 20, y: 226, widthUnits: 18, palette, locale, lines: 1 }),
      compactFuture(expression, { x: 602, y: 226, widthUnits: 15, palette, locale, anchor: "end", lines: 2 }),
    ].join("");
  }
  return [
    compactHistoricalContext(expression, compiled, palette, locale, { x: 20, y: 53 }),
    compactSeriesPath(panel, { x: 20, y: 68, w: 356, h: 152 }, expression, palette, locale),
    `<g ${bindingAttr(observation.binding_id, observation.state, "annotation")} data-role="compact-observation-marker" data-annotation-role="observation"/>`,
    `<line x1="396" y1="52" x2="396" y2="224" stroke="${palette.grid}" stroke-width="1.5"/>`,
    compactEssentialText({ x: 418, y: 76, text: claim.text, color: palette.ink, widthUnits: 8.7, lines: 2, binding: `${bindingAttr(claim.binding_id, claim.state)} data-role="creator-interpretation"`, group: "logic" }),
    compactMechanism(expression, { x: 418, y: 148, widthUnits: 9.3, palette, locale, lines: 2 }),
    compactFuture(expression, { x: 418, y: 205, widthUnits: 10, palette, locale, lines: 3, splitTime: true }),
  ].join("");
}

function renderCompactScenario(expression, palette, locale) {
  const claim = expression.argument.claim;
  const branches = expression.future_beats.slice(0, 3);
  const branchHeight = Math.min(58, 174 / Math.max(1, branches.length));
  const parts = [
    compactEssentialText({ x: 20, y: 76, text: claim.text, color: palette.ink, widthUnits: 8.8, lines: 2, binding: `${bindingAttr(claim.binding_id, claim.state)} data-role="creator-interpretation"`, group: "logic" }),
    compactMechanism(expression, { x: 20, y: 204, widthUnits: 10.8, palette, locale, lines: 3 }),
    `<circle cx="222" cy="142" r="9" fill="${palette.canvas}" stroke="${palette.signal}" stroke-width="4"/>`,
    `<g data-future-region="unresolved" data-role="compact-branch-group">`,
  ];
  branches.forEach((beat, index) => {
    const y = 56 + index * branchHeight;
    const centerY = y + 28;
    const color = palette.conditional;
    const branch = beat.role === "invalidation" ? "REASSESS IF" : beat.role === "settlement" ? "SETTLEMENT" : "CONFIRMATION";
    const time = beat.at ? relativeDayLabel(beat.at, expression.time.declared_at, locale).split(" · ")[0] : expression.horizon_label;
    parts.push(
      `<g ${bindingAttr(beat.binding_id, beat.state)} data-geometry-type="conditional-lane" data-future-role="${beat.role}"><path d="M 231 142 C 270 142, 278 ${f(centerY)}, 310 ${f(centerY)}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 5"/><circle cx="314" cy="${f(centerY)}" r="5" fill="${palette.canvas}" stroke="${color}" stroke-width="3"/><text x="330" y="${f(y + 11)}" fill="${color}" font-size="12" font-weight="820">${esc(`${time} · ${branch}`)}</text>`,
      compactEssentialText({ x: 330, y: y + 39, text: beat.label, color: palette.ink, widthUnits: 11.2, lines: 1, binding: "", group: "future", tier: "secondary" }),
      `</g>`,
    );
  });
  parts.push("</g>");
  return parts.join("");
}

function renderCompactCausal(expression, palette, locale) {
  const observation = expression.argument.observation;
  const mechanism = expression.argument.mechanism;
  const future = expression.future_beats.findLast((item) => item.at && Date.parse(item.at) === Date.parse(expression.time.horizon_end))
    ?? expression.future_beats.at(-1);
  return [
    `<g data-role="compact-causal-path"><line x1="80" y1="160" x2="542" y2="160" stroke="${palette.grid}" stroke-width="5" stroke-linecap="round"/><path d="M 205 160 L 219 153 L 219 167 Z M 394 160 L 408 153 L 408 167 Z" fill="${palette.signal}"/><circle cx="80" cy="160" r="10" fill="${palette.primary}"/><circle cx="311" cy="160" r="12" fill="${palette.signal}"/><circle cx="542" cy="160" r="10" fill="${palette.conditional}"/></g>`,
    `<text x="20" y="58" fill="${palette.primary}" font-size="12" font-weight="820">${esc("OBSERVED START")}</text>`,
    compactEssentialText({ x: 20, y: 86, text: observation.text, color: palette.ink, widthUnits: 9.2, lines: 3, binding: bindingAttr(observation.binding_id, observation.state, "geometry"), group: "observation", tier: "secondary" }),
    `<text x="311" y="58" text-anchor="middle" fill="${palette.signal}" font-size="12" font-weight="820">${esc("MY LOGIC")}</text>`,
    compactEssentialText({ x: 311, y: 86, text: mechanism.text, color: palette.ink, widthUnits: 9.2, lines: 3, anchor: "middle", binding: `${bindingAttr(mechanism.binding_id, mechanism.state)} data-role="creator-mechanism"`, group: "logic" }),
    `<text x="602" y="58" text-anchor="end" fill="${palette.conditional}" font-size="12" font-weight="820">${esc("HORIZON CHECK")}</text>`,
    future ? compactEssentialText({ x: 602, y: 86, text: `${relativeDayLabel(future.at, expression.time.declared_at, locale)} · ${future.label}`, color: palette.ink, widthUnits: 9.2, lines: 3, anchor: "end", binding: bindingAttr(future.binding_id, future.state), group: "future", tier: "secondary" }) : "",
  ].join("");
}

function renderCompactEvidence(expression, palette, locale) {
  const support = expression.argument.observation;
  const counter = expression.argument.countercase ?? expression.argument.implication;
  return [
    `<rect x="20" y="52" width="278" height="146" fill="${palette.primary}" opacity="0.07"/><rect x="324" y="52" width="278" height="146" fill="${palette.danger}" opacity="0.06" data-future-region="unresolved"/>`,
    `<text x="38" y="82" fill="${palette.primary}" font-size="16" font-weight="820">${esc("SUPPORT")}</text>`,
    `<text x="342" y="82" fill="${palette.danger}" font-size="16" font-weight="820">${esc("BREAKS IF")}</text>`,
    compactEssentialText({ x: 38, y: 120, text: support.text, color: palette.ink, widthUnits: 10.4, lines: 3, binding: bindingAttr(support.binding_id, support.state), group: "evidence" }),
    compactEssentialText({ x: 342, y: 120, text: counter.text, color: palette.ink, widthUnits: 10.4, lines: 3, binding: bindingAttr(counter.binding_id, counter.state), group: "evidence" }),
    compactMechanism(expression, { x: 20, y: 232, widthUnits: 18, palette, locale, lines: 1 }),
    compactFuture(expression, { x: 602, y: 232, widthUnits: 15, palette, locale, anchor: "end", lines: 2 }),
  ].join("");
}

function compiledFutureRequired(expression) {
  return expression.time.future_mode !== "none" && expression.future_beats.length > 0;
}

export function expressionBindingIds(expression) {
  const ids = [
    ...Object.values(expression.argument).filter(Boolean).map((beat) => beat.binding_id),
    ...expression.annotations.map((annotation) => annotation.binding_id),
    ...expression.future_beats.map((beat) => beat.binding_id),
  ];
  if (expression.market) {
    ids.push(...expression.market.main_binding_ids, ...expression.market.support_binding_ids);
  }
  return [...new Set(ids)];
}

export function renderExpressionSvg(expression, candidate, compiled = compileExpression(expression)) {
  const palette = PALETTES[expression.surface];
  if (!palette) throw new Error(`Unknown surface ${expression.surface}.`);
  const locale = localeFor(candidate);
  const design = expressionDesignProfile(expression);
  const attentionSignature = `${design.design_family}/${design.narrative_placement}/${expression.grammar}/${MOBILE_MASTER_PROFILE}`;
  const body = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="2488" height="1056" viewBox="0 0 622 264" role="img" aria-labelledby="frame-title frame-desc" data-expression-system="market" data-grammar="${esc(expression.grammar)}" data-composition="${esc(expression.composition)}" data-surface="${esc(expression.surface)}" data-data-status="${esc(expression.data_status)}" data-master-profile="${MOBILE_MASTER_PROFILE}" data-mobile-display="622x264" data-single-master="true" data-attention-signature="${esc(attentionSignature)}" data-design-family="${design.design_family}" data-narrative-placement="${design.narrative_placement}" data-display-system="${design.display_system}" data-primary-font-floor="${MOBILE_PRIMARY_FONT_FLOOR}" data-secondary-font-floor="${MOBILE_SECONDARY_FONT_FLOOR}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-variant-numeric="tabular-nums">`,
    `<title id="frame-title">${esc(candidate.frame.title)}</title>`,
    `<desc id="frame-desc">${esc(generateExpressionAltText(expression, candidate, compiled))}</desc>`,
    `<rect width="622" height="264" fill="${palette.canvas}"/>`,
    compactProvenance(expression, palette, locale),
  ];
  if (compiled.main) body.push(renderCompactChart(expression, compiled, palette, locale));
  else if (expression.grammar === "scenario_lanes") body.push(renderCompactScenario(expression, palette, locale));
  else if (expression.grammar === "evidence_balance") body.push(renderCompactEvidence(expression, palette, locale));
  else body.push(renderCompactCausal(expression, palette, locale));
  body.push(compactWordmark(palette), "</svg>");
  return body.join("");
}

export function auditExpressionSvg(svg, expression, candidate) {
  const errors = [];
  const design = expressionDesignProfile(expression);
  if (!/<svg\b[^>]*\bwidth="2488"[^>]*\bheight="1056"/u.test(svg)) errors.push("SVG must declare the exact 2488 x 1056 publication size.");
  if (!/viewBox="0 0 622 264"/u.test(svg)) errors.push("The publication master must be authored against its exact 622 x 264 mobile display box.");
  if (!svg.includes(`data-master-profile="${MOBILE_MASTER_PROFILE}"`) || !svg.includes('data-single-master="true"')) errors.push("SVG is missing its single-master mobile profile.");
  if (!/role="img"/u.test(svg) || !/<title id="frame-title">/u.test(svg) || !/<desc id="frame-desc">/u.test(svg)) errors.push("SVG needs an accessible title and description.");
  if (!/id="cuebook-wordmark"/u.test(svg)) errors.push("SVG is missing the canonical Cuebook wordmark.");
  if (!svg.includes(`data-design-family="${design.design_family}"`) || !svg.includes(`data-display-system="${design.display_system}"`)) errors.push("SVG is missing its truthful design-family and display-system fingerprint.");
  if (/(?:href|src)=["']https?:\/\//iu.test(svg)) errors.push("SVG must not load network assets.");
  if (MUTABLE_PRICE_LABEL.test(svg)) errors.push("SVG cannot print a mutable current or entry price before a backend lock exists.");
  if (/data-text-truncated="true"/u.test(svg)) errors.push("Visible Frame copy must fit without ellipsis or hidden truncation.");
  if (/data-series-state="(?:future|forecast|modelled)"/u.test(svg)) errors.push("Future or modelled market series are forbidden in fast previews.");
  if (/forecast[_ -]?path|projected candle|\u9884\u6d4b\u4ef7\u683c\u8def\u5f84/iu.test(svg)) errors.push("SVG leaks a forbidden future-price instruction.");
  if (expression.market && (svg.match(/data-role="compact-observation-marker"/gu) ?? []).length !== 1) errors.push("A chart expression must attach the tested observation to its evidence geometry exactly once.");
  if (expression.market && !/data-series-state="observed"/u.test(svg)) errors.push("A market master needs one observed evidence curve.");
  if (expression.market && !/data-role="historical-price-context"/u.test(svg)) errors.push("A market master needs one frozen dated price context.");
  if (!/data-role="creator-mechanism"/u.test(svg)) errors.push("The creator's mechanism must remain visible in the mobile master.");
  if (candidate.frame.title.trim() === expression.argument.claim.text.trim()) errors.push("The image claim must add to the Frame title instead of repeating it exactly.");
  const alt = generateExpressionAltText(expression, candidate);
  if (!svg.includes(`<desc id="frame-desc">${esc(alt)}</desc>`)) errors.push("SVG description must be generated from the selected expression grammar.");
  for (const match of svg.matchAll(/<text\b[^>]*data-essential-copy="true"[^>]*>/gu)) {
    const tag = match[0];
    const size = Number(tag.match(/font-size="([0-9.]+)"/u)?.[1]);
    const tier = tag.match(/data-essential-tier="(primary|secondary)"/u)?.[1];
    if (!tier) errors.push("Every essential copy item needs a primary or secondary tier.");
    else if (tier === "primary" && size < MOBILE_PRIMARY_FONT_FLOOR) errors.push("Primary essential copy must use at least 20 display pixels.");
    else if (tier === "secondary" && size < MOBILE_SECONDARY_FONT_FLOOR) errors.push("Secondary essential copy must use at least 16 display pixels.");
  }
  const groups = new Set([...svg.matchAll(/data-essential-copy-group="([^"]+)"/gu)].map((match) => match[1]));
  if (groups.size > 3) errors.push("The publication master may contain at most three essential copy groups.");
  if (/data-role="(?:source-detail|formula|limitations|component-reason)"/u.test(svg)) errors.push("The mobile master contains publication-only source or method detail.");
  if (compiledFutureRequired(expression) && !/data-future-region="unresolved"|data-essential-copy-group="future"|data-essential-copy-group="branches"/u.test(svg)) errors.push("The publication master must preserve one visible unresolved future cue.");
  return {
    valid: errors.length === 0,
    errors,
    single_master: true,
    mobile_display: "622x264",
    essential_copy_groups: groups.size,
    essential_font_floor: MOBILE_PRIMARY_FONT_FLOOR,
    secondary_font_floor: MOBILE_SECONDARY_FONT_FLOOR,
    attention_signature: `${design.design_family}/${design.narrative_placement}/${expression.grammar}/${MOBILE_MASTER_PROFILE}`,
  };
}

export function assertNoMutablePriceText(value, label) {
  if (typeof value === "string" && MUTABLE_PRICE_LABEL.test(value)) throw new Error(`${label} cannot print a mutable current/entry price before a backend lock exists.`);
}
