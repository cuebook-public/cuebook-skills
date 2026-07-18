#!/usr/bin/env node
// Fetch Cuebook OHLCV and render a thesis-aware SVG plus data provenance.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  PyFloat,
  civilFromDays,
  ensureAscii,
  g,
  isDict,
  issue,
  parseIsoDateTime,
  pathStr,
  pyFixed,
  pyFixedGrouped,
  pyFixedSigned,
  pyFloatRepr,
  pyJsonDumps,
  pyJsonLoads,
  pyNum,
  pyRound,
  pyStr,
  pyStrRepr,
  readTextPy,
  validate,
} from "./validate_thesis_chart.mjs";

export const THEMES = {
  cuebook_dark: {
    background: "#171918",
    plot: "#171918",
    grid: "#343835",
    text: "#F5F6F2",
    muted: "#A5AAA6",
    primary: "#22B58A",
    benchmark: "#F3C84B",
    context: "#6D8EFF",
    danger: "#EE6B73",
    future: "#242725",
    panel: "#202321",
    white: "#FFFFFF",
  },
  cuebook_light: {
    background: "#FCFCFA",
    plot: "#FCFCFA",
    grid: "#E5E9E5",
    text: "#151815",
    muted: "#737A75",
    primary: "#12A97B",
    benchmark: "#F1BE28",
    context: "#5577D9",
    danger: "#DF5967",
    future: "#FFF8E4",
    panel: "#FFFDF5",
    white: "#FFFFFF",
  },
};
export const STYLE_PROFILES = {
  cuebook_feed_v1: {
    outer_radius: 8,
    grid_rows: 4,
    show_state_label: false,
    show_provenance_footer: false,
    show_guide: false,
    annotation_limit: 4,
  },
  cuebook_detail_v1: {
    outer_radius: 8,
    grid_rows: 5,
    show_state_label: true,
    show_provenance_footer: true,
    show_guide: true,
    annotation_limit: 8,
  },
};
export let COLORS = THEMES.cuebook_dark;
let X_LAYOUT = null;

// ---------------------------------------------------------------------------
// Python exception / conversion parity.
// ---------------------------------------------------------------------------

class PyError extends Error {
  constructor(message, pyType) {
    super(message);
    this.pyType = pyType;
  }
}

function runtimeError(message) {
  return new PyError(message, "RuntimeError");
}

// obj[key] — raises KeyError like Python subscripting.
function sub(obj, key) {
  if (isDict(obj) && key in obj && obj[key] !== undefined) return obj[key];
  throw new PyError(`'${key}'`, "KeyError");
}

// float(value) with Python's error messages.
function pyFloatConv(value) {
  if (value instanceof PyFloat) return value.value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const text = value.trim().replace(/_/g, "");
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || /^[+-]?(?:inf(?:inity)?|nan)$/i.test(text)) {
      return Number(text.replace(/^([+-]?)inf(inity)?$/i, "$1Infinity"));
    }
    throw new PyError(`could not convert string to float: ${pyStrRepr(value)}`, "ValueError");
  }
  const kind = value === null || value === undefined ? "NoneType" : Array.isArray(value) ? "list" : "dict";
  throw new PyError(`float() argument must be a string or a real number, not '${kind}'`, "TypeError");
}

// int(value) with Python's error messages (only used on numbers here).
function pyIntConv(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PyError("cannot convert float infinity to integer", "OverflowError");
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (/^[+-]?\d+$/.test(text)) return Number(text);
    throw new PyError(`invalid literal for int() with base 10: ${pyStrRepr(value)}`, "ValueError");
  }
  const kind = value === null || value === undefined ? "NoneType" : Array.isArray(value) ? "list" : "dict";
  throw new PyError(`int() argument must be a string, a bytes-like object or a real number, not '${kind}'`, "TypeError");
}

const fl = (value) => (value instanceof PyFloat ? value.value : pyNum(value));

// ---------------------------------------------------------------------------
// datetime parity (values are integer microseconds since the epoch, UTC).
// ---------------------------------------------------------------------------

export function parse_dt(value) {
  if (typeof value !== "string") {
    throw new PyError("fromisoformat: argument must be str", "TypeError");
  }
  const parsed = parseIsoDateTime(value.replace(/Z/g, "+00:00"));
  if (parsed === null) {
    throw new PyError(`Invalid isoformat string: ${pyStrRepr(value)}`, "ValueError");
  }
  if (!parsed.hasTz) {
    // Python's astimezone() interprets naive datetimes in local time.
    const wall = parsed.wall;
    const local = new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    local.setFullYear(wall.year);
    return local.getTime() * 1000 + wall.micro;
  }
  return parsed.micros;
}

export function iso_utc(micros) {
  let days = Math.floor(micros / 86_400_000_000);
  let rem = micros - days * 86_400_000_000;
  const [year, month, day] = civilFromDays(days);
  const micro = rem % 1_000_000;
  rem = (rem - micro) / 1_000_000;
  const second = rem % 60;
  rem = (rem - second) / 60;
  const minute = rem % 60;
  const hour = (rem - minute) / 60;
  const p2 = (n) => String(n).padStart(2, "0");
  let out = `${String(year).padStart(4, "0")}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}:${p2(second)}`;
  if (micro !== 0) out += "." + String(micro).padStart(6, "0");
  return out + "Z";
}

function utcParts(micros) {
  const days = Math.floor(micros / 86_400_000_000);
  let rem = micros - days * 86_400_000_000;
  const [year, month, day] = civilFromDays(days);
  const micro = rem % 1_000_000;
  rem = (rem - micro) / 1_000_000;
  const second = rem % 60;
  rem = (rem - second) / 60;
  const minute = rem % 60;
  const hour = (rem - minute) / 60;
  return { year, month, day, hour, minute, second, micro };
}

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------------------------------------------------------------------------
// Networking (provider fetch path).
// ---------------------------------------------------------------------------

const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function http_json(url, retries = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "CuebookThesisChart/1.0" },
          signal: controller.signal,
        });
        return pyJsonLoads(await response.text());
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      await sleep(0.5 * (attempt + 1));
    }
  }
  try {
    const output = execFileSync(
      "curl",
      ["-sS", "--retry", "4", "--retry-all-errors", "--retry-delay", "1", url],
      { encoding: "utf-8", timeout: 40000 }
    );
    return pyJsonLoads(output);
  } catch (error) {
    throw runtimeError(`Market-data request failed: ${lastError}; curl fallback: ${error}`);
  }
}

export async function fetch_cuebook_series(spec, series) {
  const provider = sub(series, "provider");
  const endpoint = sub(provider, "endpoint");
  const horizonValue = g(sub(spec, "time"), "horizon_end");
  const queryEnd = horizonValue ? parse_dt(horizonValue) : parse_dt(sub(sub(spec, "time"), "declared_at"));
  const payload = {
    json: {
      assetId: sub(series, "asset_id"),
      interval: sub(provider, "requested_interval"),
      from: iso_utc(parse_dt(sub(sub(spec, "time"), "context_start"))).slice(0, 10),
      to: iso_utc(queryEnd).slice(0, 10),
    },
  };
  const url = `${endpoint}?input=${encodeURIComponent(JSON.stringify(payload))}`;
  const response = await http_json(url);
  let body;
  let bars;
  try {
    body = sub(sub(sub(response, "result"), "data"), "json");
    bars = sub(body, "bars");
  } catch (error) {
    throw runtimeError(
      `Unexpected Cuebook market.candles response for ${pyStr(sub(series, "ticker"))}: ${pyStr(response)}`
    );
  }
  if (!Array.isArray(bars) || bars.length === 0) {
    throw runtimeError(`Cuebook returned no bars for ${pyStr(sub(series, "ticker"))}.`);
  }

  const returnedTickers = new Set(bars.map((bar) => pyStr(g(bar, "canonicalTicker") || "").toUpperCase()));
  if (!returnedTickers.has(sub(series, "ticker").toUpperCase())) {
    const sortedTickers = [...returnedTickers].sort();
    throw runtimeError(
      `Ticker mismatch for ${pyStr(sub(series, "ticker"))}: provider returned [${sortedTickers
        .map((item) => pyStrRepr(item))
        .join(", ")}].`
    );
  }
  const intervals = new Set(bars.filter((bar) => g(bar, "interval")).map((bar) => pyStr(g(bar, "interval") || "")));
  const sortedIntervals = [...intervals].sort();
  const observedInterval = intervals.size === 1 ? sortedIntervals[0] : sortedIntervals.join(",");
  const baselineClock = utcParts(parse_dt(sub(sub(series, "baseline"), "observed_at")));
  const points = [];
  for (const bar of bars) {
    let openTime;
    let close;
    try {
      openTime = pyIntConv(sub(bar, "openTime")) * 1000;
      close = pyFloatConv(sub(bar, "close"));
    } catch (error) {
      continue;
    }
    const state = pyStr(g(bar, "state") || "unknown");
    let observedAt;
    if (state === "forming" && g(bar, "lastEventTime")) {
      observedAt = pyIntConv(sub(bar, "lastEventTime")) * 1000;
    } else if (observedInterval === "1d" && sub(sub(spec, "time"), "market_session") !== "continuous") {
      const open = utcParts(openTime);
      const dayStart = openTime - ((open.hour * 3600 + open.minute * 60 + open.second) * 1_000_000 + open.micro);
      observedAt =
        dayStart +
        (baselineClock.hour * 3600 + baselineClock.minute * 60 + baselineClock.second) * 1_000_000 +
        baselineClock.micro;
    } else {
      observedAt = openTime;
    }
    const baseline = pyFloatConv(sub(sub(series, "baseline"), "value"));
    const transformation = sub(series, "transformation");
    let derived;
    if (transformation === "raw_price") {
      derived = close;
    } else if (transformation === "return_from_baseline") {
      derived = (close / baseline - 1.0) * 100.0;
    } else if (transformation === "normalized_index") {
      derived = (close / baseline) * 100.0;
    } else {
      throw runtimeError("excess_return requires a precomputed single series and is not fetched directly.");
    }
    points.push({
      observed_at: iso_utc(observedAt),
      open_time: iso_utc(openTime),
      open: g(bar, "open") !== null ? new PyFloat(pyFloatConv(sub(bar, "open"))) : null,
      high: g(bar, "high") !== null ? new PyFloat(pyFloatConv(sub(bar, "high"))) : null,
      low: g(bar, "low") !== null ? new PyFloat(pyFloatConv(sub(bar, "low"))) : null,
      close: new PyFloat(close),
      volume: g(bar, "volume") !== null ? new PyFloat(pyFloatConv(sub(bar, "volume"))) : null,
      vwap: g(bar, "vwap") !== null ? new PyFloat(pyFloatConv(sub(bar, "vwap"))) : null,
      state,
      derived_value: new PyFloat(derived),
      last_event_time: g(bar, "lastEventTime") ? iso_utc(pyIntConv(sub(bar, "lastEventTime")) * 1000) : null,
    });
  }
  points.sort((a, b) => (a.observed_at < b.observed_at ? -1 : a.observed_at > b.observed_at ? 1 : 0));
  let trimmed = points;
  if (points.length > sub(sub(spec, "time"), "bar_limit")) {
    trimmed = points.slice(points.length - sub(sub(spec, "time"), "bar_limit"));
  }
  const sealed = trimmed.filter((item) => item.state === "sealed");
  const forming = trimmed.filter((item) => item.state === "forming");
  return {
    id: sub(series, "id"),
    ticker: sub(series, "ticker"),
    role: sub(series, "role"),
    transformation: sub(series, "transformation"),
    baseline: sub(series, "baseline"),
    source_url: url,
    requested_interval: sub(provider, "requested_interval"),
    observed_interval: observedInterval || null,
    coverage_status: g(body, "coverageStatus", "unknown"),
    provider_id: pyStr(g(provider, "name") || "Cuebook"),
    venue: null,
    currency: g(g(series, "baseline", {}) ?? {}, "unit"),
    timezone: g(g(spec, "time", {}) ?? {}, "timezone"),
    calendar_ref: null,
    session: g(g(spec, "time", {}) ?? {}, "market_session"),
    quote_basis: g(g(series, "baseline", {}) ?? {}, "observation_basis"),
    adjustment_basis: "unknown",
    source_as_of: g(provider, "as_of"),
    license_scope: "unknown",
    quality_flags: [],
    latest_sealed_open_time: g(body, "latestSealedOpenTime"),
    forming_open_time: g(body, "formingOpenTime"),
    sealed_through: sealed.length > 0 ? sealed[sealed.length - 1].observed_at : null,
    forming_as_of: forming.length > 0 ? forming[forming.length - 1].last_event_time : null,
    points: trimmed,
  };
}

// Map a database-exported MarketSeriesBatchV1 leg into renderer data.
export function load_canonical_series(spec, series, batch) {
  if (g(batch, "schema_version") !== "market-series-batch-v1") {
    throw runtimeError("--market-data must use schema_version market-series-batch-v1.");
  }
  const rows = g(batch, "series");
  if (!Array.isArray(rows)) {
    throw runtimeError("MarketSeriesBatchV1.series must be an array.");
  }
  const matches = rows.filter((item) => isDict(item) && g(item, "series_ref") === sub(series, "id"));
  if (matches.length !== 1) {
    throw runtimeError(`Expected one market-data series for ${pyStr(sub(series, "id"))}; found ${matches.length}.`);
  }
  const row = matches[0];
  if (pyStr(g(row, "ticker") || "").toUpperCase() !== sub(series, "ticker").toUpperCase()) {
    throw runtimeError(
      `Ticker mismatch for ${pyStr(sub(series, "id"))}: spec=${pyStr(sub(series, "ticker"))}, data=${pyStr(g(row, "ticker"))}.`
    );
  }
  if (g(row, "instrument_id") !== sub(series, "instrument_id")) {
    throw runtimeError(
      `Instrument mismatch for ${pyStr(sub(series, "id"))}: spec=${pyStr(sub(series, "instrument_id"))}, data=${pyStr(g(row, "instrument_id"))}.`
    );
  }
  const interval = g(row, "interval");
  if (typeof interval !== "string" || interval.trim() === "") {
    throw runtimeError(`Market data for ${pyStr(sub(series, "id"))} has no interval.`);
  }
  const coverage = g(row, "coverage_status");
  if (!["complete", "partial", "unavailable", "unknown"].includes(coverage)) {
    throw runtimeError(`Market data for ${pyStr(sub(series, "id"))} has invalid coverage_status.`);
  }
  const sourceRef = g(row, "source_ref");
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") {
    throw runtimeError(`Market data for ${pyStr(sub(series, "id"))} has no source_ref.`);
  }

  const contextStart = parse_dt(sub(sub(spec, "time"), "context_start"));
  const horizonValue = g(sub(spec, "time"), "horizon_end");
  const horizonEnd = horizonValue ? parse_dt(horizonValue) : parse_dt(sub(sub(spec, "time"), "declared_at"));
  const baseline = pyFloatConv(sub(sub(series, "baseline"), "value"));
  const points = [];
  const rawBars = g(row, "bars") || [];
  for (let index = 0; index < rawBars.length; index += 1) {
    const bar = rawBars[index];
    if (!isDict(bar)) {
      throw runtimeError(`Market data ${pyStr(sub(series, "id"))} bar ${index} must be an object.`);
    }
    let openTime;
    let observedAt;
    let openValue;
    let high;
    let low;
    let close;
    try {
      openTime = parse_dt(sub(bar, "open_time"));
      observedAt = parse_dt(sub(bar, "observed_at"));
      openValue = pyFloatConv(sub(bar, "open"));
      high = pyFloatConv(sub(bar, "high"));
      low = pyFloatConv(sub(bar, "low"));
      close = pyFloatConv(sub(bar, "close"));
    } catch (error) {
      if (["KeyError", "TypeError", "ValueError"].includes(error.pyType)) {
        throw runtimeError(`Market data ${pyStr(sub(series, "id"))} bar ${index} has invalid OHLC or time fields.`);
      }
      throw error;
    }
    if (observedAt < contextStart || observedAt > horizonEnd) {
      continue;
    }
    if (high < Math.max(openValue, close) || low > Math.min(openValue, close) || low > high) {
      throw runtimeError(`Market data ${pyStr(sub(series, "id"))} bar ${index} violates OHLC bounds.`);
    }
    const state = g(bar, "state");
    if (!["sealed", "forming"].includes(state)) {
      throw runtimeError(`Market data ${pyStr(sub(series, "id"))} bar ${index} has invalid state.`);
    }
    const lastEventTime = g(bar, "last_event_time");
    if (state === "forming" && typeof lastEventTime !== "string") {
      throw runtimeError(`Forming bar ${pyStr(sub(series, "id"))}[${index}] requires last_event_time.`);
    }
    if (lastEventTime !== null) {
      parse_dt(lastEventTime);
    }
    const transformation = sub(series, "transformation");
    let derived;
    if (transformation === "raw_price") {
      derived = close;
    } else if (transformation === "return_from_baseline") {
      derived = (close / baseline - 1.0) * 100.0;
    } else if (transformation === "normalized_index") {
      derived = (close / baseline) * 100.0;
    } else {
      throw runtimeError("excess_return requires a precomputed single series and is not loaded directly.");
    }
    points.push({
      observed_at: iso_utc(observedAt),
      open_time: iso_utc(openTime),
      open: new PyFloat(openValue),
      high: new PyFloat(high),
      low: new PyFloat(low),
      close: new PyFloat(close),
      volume: g(bar, "volume") !== null ? new PyFloat(pyFloatConv(sub(bar, "volume"))) : null,
      vwap: g(bar, "vwap") !== null ? new PyFloat(pyFloatConv(sub(bar, "vwap"))) : null,
      state,
      derived_value: new PyFloat(derived),
      last_event_time: lastEventTime ? iso_utc(parse_dt(lastEventTime)) : null,
    });
  }
  points.sort((a, b) => (a.observed_at < b.observed_at ? -1 : a.observed_at > b.observed_at ? 1 : 0));
  const observedTimes = points.map((item) => item.observed_at);
  if (observedTimes.length !== new Set(observedTimes).size) {
    throw runtimeError(`Market data for ${pyStr(sub(series, "id"))} contains duplicate observed_at values.`);
  }
  if (points.length === 0) {
    throw runtimeError(`Market data for ${pyStr(sub(series, "id"))} has no bars inside the chart window.`);
  }
  let trimmed = points;
  if (points.length > sub(sub(spec, "time"), "bar_limit")) {
    trimmed = points.slice(points.length - sub(sub(spec, "time"), "bar_limit"));
  }
  const sealed = trimmed.filter((item) => item.state === "sealed");
  const forming = trimmed.filter((item) => item.state === "forming");
  return {
    id: sub(series, "id"),
    ticker: sub(series, "ticker"),
    role: sub(series, "role"),
    transformation: sub(series, "transformation"),
    baseline: sub(series, "baseline"),
    source_url: sourceRef,
    requested_interval: sub(sub(series, "provider"), "requested_interval"),
    observed_interval: interval,
    coverage_status: coverage,
    provider_id: g(row, "provider_id"),
    venue: g(row, "venue"),
    currency: g(row, "currency"),
    timezone: g(row, "timezone"),
    calendar_ref: g(row, "calendar_ref"),
    session: g(row, "session"),
    quote_basis: g(row, "quote_basis"),
    adjustment_basis: g(row, "adjustment_basis"),
    source_as_of: g(row, "source_as_of"),
    license_scope: g(row, "license_scope"),
    quality_flags: g(row, "quality_flags") || [],
    latest_sealed_open_time: sealed.length > 0 ? sealed[sealed.length - 1].open_time : null,
    forming_open_time: forming.length > 0 ? forming[forming.length - 1].open_time : null,
    sealed_through: sealed.length > 0 ? sealed[sealed.length - 1].observed_at : null,
    forming_as_of: forming.length > 0 ? forming[forming.length - 1].last_event_time : null,
    points: trimmed,
  };
}

// ---------------------------------------------------------------------------
// Geometry and text helpers.
// ---------------------------------------------------------------------------

function x_scale(value, start, end, left, right) {
  if (X_LAYOUT && X_LAYOUT.mode === "decision_split") {
    const declared = X_LAYOUT.declared;
    const horizon = X_LAYOUT.horizon;
    const split = left + pyNum(X_LAYOUT.ratio) * (right - left);
    if (value <= declared) {
      const span = Math.max((declared - start) / 1_000_000, 1.0);
      const ratio = (value - start) / 1_000_000 / span;
      return left + Math.min(Math.max(ratio, 0.0), 1.0) * (split - left);
    }
    const span = Math.max((horizon - declared) / 1_000_000, 1.0);
    const ratio = (value - declared) / 1_000_000 / span;
    return split + Math.min(Math.max(ratio, 0.0), 1.0) * (right - split);
  }
  const span = Math.max((end - start) / 1_000_000, 1.0);
  return left + ((value - start) / 1_000_000 / span) * (right - left);
}

function y_scale(value, low, high, top, bottom) {
  const span = Math.max(high - low, 1e-9);
  return bottom - ((value - low) / span) * (bottom - top);
}

function fmt_value(value, axis) {
  if (axis === "return_pct" || axis === "excess_return_pct") {
    return `${pyFixedSigned(value, 2)}%`;
  }
  if (Math.abs(value) >= 1000) {
    return pyFixedGrouped(value, 0);
  }
  return pyFixed(value, 2);
}

// Return a prior-bar rolling average so the current bar cannot lift its own benchmark.
function previous_volume_averages(points, window) {
  const history = [];
  const result = [];
  for (const point of points) {
    const volume = g(point, "volume");
    if (volume === null) continue;
    if (history.length > 0) {
      const sample = history.slice(Math.max(history.length - window, 0));
      result.push([point, sample.reduce((total, item) => total + item, 0) / sample.length]);
    }
    if (g(point, "state") === "sealed") {
      history.push(fl(volume));
    }
  }
  return result;
}

function isPySpace(char) {
  return /^\s$/u.test(char) && char !== "﻿";
}

function text_units(value) {
  let total = 0.0;
  for (const char of value) {
    if (isPySpace(char)) total += 0.34;
    else if (char.codePointAt(0) > 127) total += 1.0;
    else if ("ilI1.,:;'|".includes(char)) total += 0.32;
    else if ("MW@%".includes(char)) total += 0.9;
    else total += 0.58;
  }
  return total;
}

function collapseWhitespace(value) {
  return value.split(/\s+/u).filter((part) => part !== "").join(" ");
}

function ellipsize(value, maxUnits) {
  value = collapseWhitespace(value);
  if (text_units(value) <= maxUnits) return value;
  const result = [];
  for (const char of value) {
    if (text_units(result.join("") + char + "...") > maxUnits) break;
    result.push(char);
  }
  return result.join("").replace(/\s+$/u, "") + "...";
}

function wrap_text(value, maxUnits, maxLines = 2) {
  let remaining = collapseWhitespace(value);
  const lines = [];
  while (remaining !== "" && lines.length < maxLines) {
    if (text_units(remaining) <= maxUnits) {
      lines.push(remaining);
      remaining = "";
      break;
    }
    const chars = [...remaining];
    const consumed = [];
    let lastSpace = -1;
    for (let index = 0; index < chars.length; index += 1) {
      const char = chars[index];
      if (isPySpace(char)) lastSpace = index;
      if (text_units(consumed.join("") + char) > maxUnits) break;
      consumed.push(char);
    }
    let cut = consumed.length;
    if (lastSpace > 0 && lastSpace < cut && cut - lastSpace < 12) {
      cut = lastSpace;
    }
    cut = Math.max(cut, 1);
    lines.push(chars.slice(0, cut).join("").replace(/\s+$/u, ""));
    remaining = chars.slice(cut).join("").replace(/^\s+/u, "");
  }
  if (remaining !== "" && lines.length > 0) {
    lines[lines.length - 1] = ellipsize(lines[lines.length - 1] + remaining, maxUnits);
  }
  return lines.length > 0 ? lines : [""];
}

function short_date(micros, locale) {
  const parts = utcParts(micros);
  if (locale === "zh-CN") {
    return `${parts.month}/${parts.day}`;
  }
  return `${MONTHS_ABBR[parts.month - 1]} ${String(parts.day).padStart(2, "0")}`;
}

function path_for(points, start, end, left, right, top, bottom, yLow, yHigh) {
  const commands = [];
  points.forEach((point, index) => {
    const x = x_scale(parse_dt(sub(point, "observed_at")), start, end, left, right);
    const y = y_scale(pyFloatConv(sub(point, "derived_value")), yLow, yHigh, top, bottom);
    commands.push(`${index === 0 ? "M" : "L"} ${pyFixed(x, 2)} ${pyFixed(y, 2)}`);
  });
  return commands.join(" ");
}

function series_color(role) {
  return { primary: COLORS.primary, benchmark: COLORS.benchmark, context: COLORS.context }[role] || COLORS.white;
}

// html.escape(value, quote=True)
function escape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// SVG renderer.
// ---------------------------------------------------------------------------

export function render_svg(spec, fetched) {
  const render = sub(spec, "render");
  COLORS = THEMES[g(render, "theme", "cuebook_dark")] || THEMES.cuebook_dark;
  const profileName =
    g(render, "style_profile") || (g(render, "show_settlement_panel") ? "cuebook_detail_v1" : "cuebook_feed_v1");
  const profile = sub(STYLE_PROFILES, profileName);
  const locale = g(render, "locale", "zh-CN");
  const showState = g(render, "show_state_label", profile.show_state_label);
  const showProvenance = g(render, "show_provenance_footer", profile.show_provenance_footer);
  const showGuide = g(render, "show_guide", profile.show_guide);
  const showVolume = Boolean(g(render, "show_volume", false));
  const volumeWindow = pyIntConv(g(render, "volume_average_window", 20));
  const width = sub(render, "width");
  const height = sub(render, "height");
  const left = width <= 900 ? 72.0 : 84.0;
  const right = width - (width <= 900 ? 32 : 40);

  const allPoints = fetched.flatMap((series) => sub(series, "points"));
  if (allPoints.length === 0) {
    throw runtimeError("No chart points available.");
  }
  const xValues = allPoints.map((point) => parse_dt(sub(point, "observed_at")));
  const start = Math.min(Math.min(...xValues), parse_dt(sub(sub(spec, "time"), "context_start")));
  const declared = parse_dt(sub(sub(spec, "time"), "declared_at"));
  const horizonValue = g(sub(spec, "time"), "horizon_end");
  const horizon = horizonValue ? parse_dt(horizonValue) : Math.max(Math.max(...xValues), declared);
  const end = Math.max(Math.max(...xValues), horizon);
  const latestObserved = Math.max(...xValues);
  const timelineLayout = g(render, "timeline_layout", "continuous_time");
  X_LAYOUT = {
    mode: timelineLayout,
    declared,
    horizon,
    ratio: g(render, "decision_split_ratio", 0.68),
  };

  const annotationRank = {
    target: 0,
    trigger: 0,
    invalidation: 0,
    range_lower: 0,
    range_upper: 0,
    event: 1,
    expiry: 2,
    declaration: 3,
    baseline: 4,
    note: 5,
  };
  const annotations = [...sub(spec, "annotations")];
  let visibleAnnotations;
  if (annotations.length > profile.annotation_limit) {
    const selected = annotations
      .map((annotation, index) => [index, annotation])
      .sort((a, b) => {
        const rankA = annotationRank[g(a[1], "kind")] ?? 9;
        const rankB = annotationRank[g(b[1], "kind")] ?? 9;
        if (rankA !== rankB) return rankA - rankB;
        return a[0] - b[0];
      })
      .slice(0, profile.annotation_limit);
    const selectedIds = new Set(selected.map((item) => sub(item[1], "id")));
    visibleAnnotations = annotations.filter((item) => selectedIds.has(sub(item, "id")));
  } else {
    visibleAnnotations = annotations;
  }

  const primaryFetched = fetched.find((item) => sub(item, "role") === "primary") || fetched[0];
  const primarySpec = sub(spec, "series").find((item) => sub(item, "role") === "primary") || sub(spec, "series")[0];
  let latestPrimary = sub(primaryFetched, "points")[0];
  let latestKey = -Infinity;
  for (const item of sub(primaryFetched, "points")) {
    const key = parse_dt(sub(item, "observed_at"));
    if (key > latestKey) {
      latestKey = key;
      latestPrimary = item;
    }
  }
  const metricWidth = fetched.length === 1 ? 220.0 : 0.0;
  const titleSize = width <= 900 ? 24 : 27;
  const titleAvailable = Math.max(right - left - metricWidth - 18, 280);
  const titleLines = wrap_text(sub(render, "title"), titleAvailable / titleSize, 2);
  const titleY = 43.0;
  const subtitleY = titleY + (titleLines.length - 1) * 30.0 + 30.0;
  const subtitleUnits = Math.max(titleAvailable / 14.5, 22);
  const subtitle = ellipsize(sub(render, "subtitle"), subtitleUnits);
  const legendY = subtitleY + 29.0;
  const top = fetched.length > 1 ? legendY + 24.0 : subtitleY + 31.0;
  const footerRows = (showProvenance ? 1 : 0) + (showGuide ? 1 : 0);
  const bottom = height - 58 - footerRows * 19;
  if (bottom - top < 150) {
    throw runtimeError("Chart height is too small for the selected title and style profile.");
  }
  if (showVolume && fetched.length !== 1) {
    throw runtimeError("Volume panels require exactly one market series.");
  }
  const volumePoints = showVolume
    ? sub(fetched[0], "points").filter(
        (point) => g(point, "volume") !== null && (g(point, "state") !== "forming" || sub(render, "show_forming_bar"))
      )
    : [];
  if (showVolume && volumePoints.length === 0) {
    throw runtimeError("show_volume is enabled, but the selected series has no volume data.");
  }
  let priceBottom;
  let volumeTop;
  let volumeHeight = 0;
  if (showVolume) {
    volumeHeight = Math.min(Math.max((bottom - top) * 0.24, 58.0), 76.0);
    const volumeGap = 15.0;
    priceBottom = bottom - volumeHeight - volumeGap;
    volumeTop = priceBottom + volumeGap;
    if (priceBottom - top < 120) {
      throw runtimeError("Chart height is too small for a readable price and volume split.");
    }
  } else {
    priceBottom = bottom;
    volumeTop = bottom;
  }

  const values = allPoints.map((point) => pyFloatConv(sub(point, "derived_value")));
  if (g(render, "chart_type") === "candles") {
    for (const point of allPoints) {
      for (const key of ["high", "low"]) {
        if (g(point, key) !== null) values.push(pyFloatConv(sub(point, key)));
      }
    }
  }
  for (const annotation of visibleAnnotations) {
    if (!["target", "trigger", "invalidation", "range_lower", "range_upper"].includes(sub(annotation, "kind"))) {
      continue;
    }
    const value = g(annotation, "value");
    if (typeof value !== "number") continue;
    if (sub(render, "y_axis") === "price") {
      values.push(value);
    } else {
      const series = sub(spec, "series").find((item) => sub(item, "id") === g(annotation, "series_ref")) || null;
      if (series) {
        values.push((value / pyFloatConv(sub(sub(series, "baseline"), "value")) - 1.0) * 100.0);
      }
    }
  }
  if (["return_pct", "excess_return_pct"].includes(sub(render, "y_axis"))) {
    values.push(0.0);
  }
  let yLow = Math.min(...values);
  let yHigh = Math.max(...values);
  const padding = Math.max(
    (yHigh - yLow) * 0.13,
    sub(render, "y_axis") !== "price" ? 0.8 : Math.max(Math.abs(yHigh) * 0.01, 0.5)
  );
  yLow -= padding;
  yHigh += padding;

  const pieces = [];
  pieces.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc" data-style-profile="${profileName}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, Noto Sans CJK SC, sans-serif" font-variant-numeric="tabular-nums" letter-spacing="0">`
  );
  pieces.push(`<title id="chart-title">${escape(sub(render, "title"))}</title>`);
  pieces.push(`<desc id="chart-desc">${escape(sub(sub(spec, "claim"), "statement"))}</desc>`);
  pieces.push(`<metadata id="cuebook-chart-style">${profileName}</metadata>`);
  pieces.push(`<rect width="${width}" height="${height}" rx="${profile.outer_radius}" fill="${COLORS.background}"/>`);
  pieces.push(
    `<rect x="${pyFloatRepr(left)}" y="${pyFixed(top, 2)}" width="${pyFixed(right - left, 2)}" height="${pyFixed(bottom - top, 2)}" fill="${COLORS.plot}"/>`
  );
  if (sub(render, "future_region") && horizon > declared) {
    const futureStart = timelineLayout === "decision_split" ? declared : latestObserved;
    const futureX = x_scale(futureStart, start, end, left, right);
    pieces.push(
      `<rect x="${pyFixed(futureX, 2)}" y="${pyFixed(top, 2)}" width="${pyFixed(Math.max(right - futureX, 0), 2)}" height="${pyFixed(bottom - top, 2)}" fill="${COLORS.future}" opacity="0.82"/>`
    );
    const unresolvedX = x_scale(Math.max(latestObserved, declared), start, end, left, right);
    if (unresolvedX < right) {
      pieces.push(
        `<rect x="${pyFixed(unresolvedX, 2)}" y="${pyFixed(top, 2)}" width="${pyFixed(right - unresolvedX, 2)}" height="${pyFixed(bottom - top, 2)}" fill="${COLORS.future}" opacity="0.42"/>`
      );
    }
  }

  const titleSpans = [];
  titleLines.forEach((line, index) => {
    const dy = index === 0 ? "0" : "30.0";
    titleSpans.push(`<tspan x="${pyFloatRepr(left)}" dy="${dy}">${escape(line)}</tspan>`);
  });
  pieces.push(
    `<text id="public-title" x="${pyFloatRepr(left)}" y="${pyFixed(titleY, 2)}" fill="${COLORS.text}" font-size="${titleSize}" font-weight="650">${titleSpans.join("")}</text>`
  );
  pieces.push(
    `<text x="${pyFloatRepr(left)}" y="${pyFixed(subtitleY, 2)}" fill="${COLORS.muted}" font-size="14">${escape(subtitle)}</text>`
  );

  if (fetched.length === 1) {
    const metricValue = pyFloatConv(
      g(render, "chart_type") === "candles" && g(latestPrimary, "close") !== null
        ? g(latestPrimary, "close")
        : sub(latestPrimary, "derived_value")
    );
    let metricColor = COLORS.primary;
    let deltaLabel = "";
    if (sub(render, "y_axis") === "price") {
      const baseline = pyFloatConv(sub(sub(primarySpec, "baseline"), "value"));
      const delta = (metricValue / baseline - 1.0) * 100.0;
      metricColor = delta >= 0 ? COLORS.primary : COLORS.danger;
      deltaLabel = `${pyFixedSigned(delta, 2)}%`;
    } else if (metricValue < 0) {
      metricColor = COLORS.danger;
    }
    let stateLabel = "";
    if (g(latestPrimary, "state") === "forming") {
      stateLabel = locale === "zh-CN" ? "形成中" : "forming";
    }
    const detailLabel = [deltaLabel, stateLabel].filter((item) => item).join(" · ");
    const metricCaption = locale === "zh-CN" ? "最新" : "Latest";
    pieces.push(
      `<text x="${pyFloatRepr(right)}" y="30" text-anchor="end" fill="${COLORS.muted}" font-size="12">${escape(metricCaption)} · ${escape(pyStr(g(primaryFetched, "observed_interval") || "?"))}</text>`
    );
    pieces.push(
      `<text x="${pyFloatRepr(right)}" y="57" text-anchor="end" fill="${metricColor}" font-size="23" font-weight="700">${escape(fmt_value(metricValue, sub(render, "y_axis")))}</text>`
    );
    if (detailLabel) {
      pieces.push(
        `<text x="${pyFloatRepr(right)}" y="78" text-anchor="end" fill="${metricColor}" font-size="12" font-weight="600">${escape(detailLabel)}</text>`
      );
    }
  }
  if (showState) {
    const status = sub(spec, "state") === "conditional" ? "CONDITIONAL" : sub(spec, "state").toUpperCase();
    pieces.push(
      `<text x="${pyFloatRepr(right)}" y="16" text-anchor="end" fill="${COLORS.benchmark}" font-size="10" font-weight="650">${escape(status)}</text>`
    );
  }

  if (fetched.length > 1) {
    let legendX = left;
    for (const fetchedSeries of fetched) {
      const color = series_color(sub(fetchedSeries, "role"));
      const legendLabel = `${sub(fetchedSeries, "ticker")} · ${pyStr(g(fetchedSeries, "observed_interval") ?? "?") === "None" ? "?" : g(fetchedSeries, "observed_interval") || "?"}`;
      pieces.push(
        `<line x1="${pyFloatRepr(legendX)}" y1="${pyFixed(legendY, 2)}" x2="${pyFloatRepr(legendX + 20)}" y2="${pyFixed(legendY, 2)}" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`
      );
      pieces.push(
        `<text x="${pyFloatRepr(legendX + 29)}" y="${pyFixed(legendY + 5, 2)}" fill="${COLORS.text}" font-size="13" font-weight="600">${escape(legendLabel)}</text>`
      );
      legendX += Math.max(118.0, text_units(legendLabel) * 8.0 + 48.0);
    }
  }

  const gridRows = pyIntConv(profile.grid_rows);
  for (let index = 0; index < gridRows; index += 1) {
    const ratio = index / Math.max(gridRows - 1, 1);
    const y = top + ratio * (priceBottom - top);
    const value = yHigh - ratio * (yHigh - yLow);
    pieces.push(
      `<line x1="${pyFloatRepr(left)}" y1="${pyFixed(y, 2)}" x2="${pyFloatRepr(right)}" y2="${pyFixed(y, 2)}" stroke="${COLORS.grid}" stroke-width="1"/>`
    );
    pieces.push(
      `<text x="${pyFloatRepr(left - 10)}" y="${pyFixed(y + 4, 2)}" text-anchor="end" fill="${COLORS.muted}" font-size="11">${escape(fmt_value(value, sub(render, "y_axis")))}</text>`
    );
  }
  if (["return_pct", "excess_return_pct"].includes(sub(render, "y_axis")) && yLow <= 0 && yHigh >= 0) {
    const zeroY = y_scale(0, yLow, yHigh, top, priceBottom);
    pieces.push(
      `<line x1="${pyFloatRepr(left)}" y1="${pyFixed(zeroY, 2)}" x2="${pyFloatRepr(right)}" y2="${pyFixed(zeroY, 2)}" stroke="${COLORS.muted}" stroke-width="1.3" opacity="0.72"/>`
    );
  }

  if (showVolume) {
    const volumeChartTop = volumeTop + 18.0;
    let volumeMax = Math.max(...volumePoints.map((point) => pyFloatConv(sub(point, "volume"))));
    const averagePoints = previous_volume_averages(volumePoints, volumeWindow);
    if (averagePoints.length > 0) {
      volumeMax = Math.max(volumeMax, Math.max(...averagePoints.map(([, value]) => value)));
    }
    volumeMax = Math.max(volumeMax * 1.08, 1.0);
    const barWidth = Math.max(2.5, Math.min(10.0, ((right - left) / Math.max(volumePoints.length, 10)) * 0.58));
    let latestSealed = null;
    for (let index = volumePoints.length - 1; index >= 0; index -= 1) {
      if (g(volumePoints[index], "state") === "sealed") {
        latestSealed = volumePoints[index];
        break;
      }
    }
    let latestRatio = null;
    if (latestSealed !== null) {
      const latestIndex = volumePoints.indexOf(latestSealed);
      const previous = volumePoints
        .slice(0, latestIndex)
        .filter((point) => g(point, "state") === "sealed" && g(point, "volume") !== null)
        .map((point) => pyFloatConv(sub(point, "volume")))
        .slice(-volumeWindow);
      if (previous.length > 0) {
        latestRatio =
          pyFloatConv(sub(latestSealed, "volume")) / (previous.reduce((total, item) => total + item, 0) / previous.length);
      }
    }
    const volumeLabel =
      locale === "zh-CN" ? `成交量 · 前${volumeWindow}根均量` : `Volume · prior ${volumeWindow}-bar average`;
    pieces.push(`<g id="volume-panel" data-average-window="${volumeWindow}">`);
    pieces.push(
      `<line x1="${pyFloatRepr(left)}" y1="${pyFixed(volumeTop, 2)}" x2="${pyFloatRepr(right)}" y2="${pyFixed(volumeTop, 2)}" stroke="${COLORS.grid}" stroke-width="1"/>`
    );
    pieces.push(
      `<text x="${pyFloatRepr(left)}" y="${pyFixed(volumeTop + 11, 2)}" fill="${COLORS.muted}" font-size="10.5" font-weight="600">${escape(volumeLabel)}</text>`
    );
    if (latestRatio !== null) {
      const ratioCopy =
        locale === "zh-CN" ? `最新封盘 ${pyFixed(latestRatio, 2)}×均量` : `Last sealed ${pyFixed(latestRatio, 2)}× average`;
      const ratioColor = latestRatio >= 1.0 ? COLORS.primary : COLORS.muted;
      pieces.push(
        `<text id="volume-ratio" x="${pyFloatRepr(right)}" y="${pyFixed(volumeTop + 11, 2)}" text-anchor="end" fill="${ratioColor}" font-size="10.5" font-weight="650">${escape(ratioCopy)}</text>`
      );
    }
    for (const point of volumePoints) {
      const x = x_scale(parse_dt(sub(point, "observed_at")), start, end, left, right);
      const volume = pyFloatConv(sub(point, "volume"));
      const y = y_scale(volume, 0.0, volumeMax, volumeChartTop, bottom);
      const openValue = g(point, "open");
      const closeValue = g(point, "close");
      const rising = openValue === null || closeValue === null || pyFloatConv(closeValue) >= pyFloatConv(openValue);
      const color = rising ? COLORS.primary : COLORS.danger;
      const forming = g(point, "state") === "forming";
      const dashAttr = forming ? ' stroke-dasharray="3 2"' : "";
      pieces.push(
        `<rect class="volume-bar" x="${pyFixed(x - barWidth / 2, 2)}" y="${pyFixed(y, 2)}" width="${pyFixed(barWidth, 2)}" height="${pyFixed(Math.max(bottom - y, 1.0), 2)}" rx="0.8" fill="${forming ? COLORS.plot : color}" fill-opacity="${forming ? "0.0" : "0.42"}" stroke="${color}" stroke-width="${forming ? "1.1" : "0.0"}"${dashAttr}/>`
      );
    }
    if (averagePoints.length >= 2) {
      const commands = [];
      averagePoints.forEach(([point, average], index) => {
        const x = x_scale(parse_dt(sub(point, "observed_at")), start, end, left, right);
        const y = y_scale(average, 0.0, volumeMax, volumeChartTop, bottom);
        commands.push(`${index === 0 ? "M" : "L"} ${pyFixed(x, 2)} ${pyFixed(y, 2)}`);
      });
      pieces.push(
        `<path id="volume-average" d="${commands.join(" ")}" fill="none" stroke="${COLORS.context}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
      );
    }
    pieces.push("</g>");
  }

  const axisY = bottom + 24;
  if (timelineLayout === "decision_split") {
    const contextMid = start + pyRound((declared - start) * 0.52);
    for (const [moment, anchor] of [
      [start, "start"],
      [contextMid, "middle"],
    ]) {
      const x = x_scale(moment, start, end, left, right);
      pieces.push(
        `<text x="${pyFixed(x, 2)}" y="${pyFixed(axisY, 2)}" text-anchor="${anchor}" fill="${COLORS.muted}" font-size="11">${short_date(moment, locale)}</text>`
      );
    }
    const splitX = x_scale(declared, start, end, left, right);
    const publishLabel =
      locale === "zh-CN" ? `发布 ${short_date(declared, locale)}` : `Published ${short_date(declared, locale)}`;
    const expiryLabel =
      locale === "zh-CN" ? `结算 ${short_date(horizon, locale)}` : `Settle ${short_date(horizon, locale)}`;
    pieces.push(
      `<text x="${pyFixed(splitX + 7, 2)}" y="${pyFixed(axisY, 2)}" text-anchor="start" fill="${COLORS.benchmark}" font-size="11" font-weight="650">${escape(publishLabel)}</text>`
    );
    pieces.push(
      `<text x="${pyFixed(right, 2)}" y="${pyFixed(axisY, 2)}" text-anchor="end" fill="${COLORS.benchmark}" font-size="11" font-weight="650">${escape(expiryLabel)}</text>`
    );
  } else {
    for (let index = 0; index < 4; index += 1) {
      const ratio = index / 3;
      const moment = start + pyRound((end - start) * ratio);
      const x = left + ratio * (right - left);
      const anchor = index === 0 ? "start" : index === 3 ? "end" : "middle";
      pieces.push(
        `<text x="${pyFixed(x, 2)}" y="${pyFixed(axisY, 2)}" text-anchor="${anchor}" fill="${COLORS.muted}" font-size="11">${short_date(moment, locale)}</text>`
      );
    }
  }

  const verticalAnnotations = visibleAnnotations.filter(
    (item) => ["event", "declaration", "baseline", "expiry"].includes(sub(item, "kind")) && g(item, "observed_at")
  );
  const verticalLabelSlots = {};
  const placedVerticals = [];
  for (const annotation of [...verticalAnnotations].sort(
    (a, b) => parse_dt(sub(a, "observed_at")) - parse_dt(sub(b, "observed_at"))
  )) {
    const x = x_scale(parse_dt(sub(annotation, "observed_at")), start, end, left, right);
    const occupied = new Set(placedVerticals.filter(([otherX]) => Math.abs(otherX - x) < 105).map(([, slot]) => slot));
    let slot = 0;
    for (let candidate = 0; candidate < 4; candidate += 1) {
      if (!occupied.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    verticalLabelSlots[sub(annotation, "id")] = slot;
    placedVerticals.push([x, slot]);
  }

  for (const annotation of visibleAnnotations) {
    const kind = sub(annotation, "kind");
    const color = ["invalidation", "range_lower"].includes(kind) ? COLORS.danger : COLORS.benchmark;
    if (["event", "declaration", "baseline", "expiry"].includes(kind) && g(annotation, "observed_at")) {
      const at = parse_dt(sub(annotation, "observed_at"));
      if (start <= at && at <= end) {
        const x = x_scale(at, start, end, left, right);
        const dash = kind === "expiry" ? "6 6" : "3 5";
        pieces.push(
          `<line x1="${pyFixed(x, 2)}" y1="${pyFixed(top, 2)}" x2="${pyFixed(x, 2)}" y2="${pyFixed(bottom, 2)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="${dash}"/>`
        );
        if (!(timelineLayout === "decision_split" && ["declaration", "expiry"].includes(kind))) {
          const anchor = x > (left + right) / 2 ? "end" : "start";
          const dx = anchor === "end" ? -7 : 7;
          const labelY = priceBottom - 10 - (verticalLabelSlots[sub(annotation, "id")] ?? 0) * 19;
          pieces.push(
            `<text x="${pyFixed(x + dx, 2)}" y="${pyFixed(labelY, 2)}" text-anchor="${anchor}" fill="${color}" font-size="11" font-weight="600">${escape(sub(annotation, "label"))}</text>`
          );
        }
      }
    } else if (
      ["target", "trigger", "invalidation", "range_lower", "range_upper"].includes(kind) &&
      typeof g(annotation, "value") === "number"
    ) {
      let chartValue = pyFloatConv(sub(annotation, "value"));
      if (sub(render, "y_axis") !== "price") {
        const series = sub(spec, "series").find((item) => sub(item, "id") === g(annotation, "series_ref")) || null;
        if (!series) continue;
        chartValue = (chartValue / pyFloatConv(sub(sub(series, "baseline"), "value")) - 1.0) * 100.0;
      }
      const y = y_scale(chartValue, yLow, yHigh, top, priceBottom);
      pieces.push(
        `<line x1="${pyFloatRepr(left)}" y1="${pyFixed(y, 2)}" x2="${pyFloatRepr(right)}" y2="${pyFixed(y, 2)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="7 6"/>`
      );
      const label = sub(annotation, "label");
      let labelWidth = Math.min(Math.max(text_units(label) * 7.2 + 18, 70), 190);
      let labelX;
      let textX;
      let textAnchor;
      if (timelineLayout === "decision_split") {
        const splitX = x_scale(declared, start, end, left, right);
        labelX = splitX + 10;
        labelWidth = Math.min(labelWidth, Math.max(right - labelX - 6, 70));
        textX = labelX + 9;
        textAnchor = "start";
      } else if (kind === "trigger") {
        labelX = left + 3;
        textX = labelX + 9;
        textAnchor = "start";
      } else {
        labelX = right - labelWidth - 3;
        textX = right - 10;
        textAnchor = "end";
      }
      const labelY = Math.min(Math.max(y - 22, top + 4), priceBottom - 23);
      pieces.push(
        `<rect x="${pyFixed(labelX, 2)}" y="${pyFixed(labelY, 2)}" width="${pyFixed(labelWidth, 2)}" height="20" rx="3" fill="${COLORS.plot}" stroke="${color}" stroke-width="0.8"/>`
      );
      pieces.push(
        `<text x="${pyFixed(textX, 2)}" y="${pyFixed(labelY + 14, 2)}" text-anchor="${textAnchor}" fill="${color}" font-size="11" font-weight="650">${escape(ellipsize(label, Math.max((labelWidth - 16) / 7.2, 8)))}</text>`
      );
    }
  }

  for (const fetchedSeries of fetched) {
    const color = series_color(sub(fetchedSeries, "role"));
    const ticker = sub(fetchedSeries, "ticker");
    const sealed = sub(fetchedSeries, "points").filter((point) => sub(point, "state") !== "forming");
    const forming = sub(fetchedSeries, "points").filter((point) => sub(point, "state") === "forming");
    if (g(render, "chart_type") === "candles") {
      const visiblePoints = sub(fetchedSeries, "points").filter(
        (point) => sub(point, "state") !== "forming" || sub(render, "show_forming_bar")
      );
      const historyCount = Math.max(
        visiblePoints.reduce((total, point) => total + (parse_dt(sub(point, "observed_at")) <= declared ? 1 : 0), 0),
        10
      );
      const historyRight = timelineLayout === "decision_split" ? x_scale(declared, start, end, left, right) : right;
      const candleWidth = Math.max(3.5, Math.min(13.0, ((historyRight - left) / historyCount) * 0.58));
      for (const point of visiblePoints) {
        const x = x_scale(parse_dt(sub(point, "observed_at")), start, end, left, right);
        const openValue = pyFloatConv(sub(point, "open"));
        const closeValue = pyFloatConv(sub(point, "close"));
        const highValue = pyFloatConv(sub(point, "high"));
        const lowValue = pyFloatConv(sub(point, "low"));
        const candleColor = closeValue >= openValue ? COLORS.primary : COLORS.danger;
        const wickTop = y_scale(highValue, yLow, yHigh, top, priceBottom);
        const wickBottom = y_scale(lowValue, yLow, yHigh, top, priceBottom);
        const bodyTop = y_scale(Math.max(openValue, closeValue), yLow, yHigh, top, priceBottom);
        const bodyBottom = y_scale(Math.min(openValue, closeValue), yLow, yHigh, top, priceBottom);
        const bodyHeight = Math.max(bodyBottom - bodyTop, 2.0);
        const formingStyle = sub(point, "state") === "forming";
        const dashAttr = formingStyle ? ' stroke-dasharray="3 2"' : "";
        pieces.push(
          `<line x1="${pyFixed(x, 2)}" y1="${pyFixed(wickTop, 2)}" x2="${pyFixed(x, 2)}" y2="${pyFixed(wickBottom, 2)}" stroke="${candleColor}" stroke-width="1.4" opacity="${formingStyle ? "0.68" : "1"}"${dashAttr}/>`
        );
        pieces.push(
          `<rect x="${pyFixed(x - candleWidth / 2, 2)}" y="${pyFixed(bodyTop, 2)}" width="${pyFixed(candleWidth, 2)}" height="${pyFixed(bodyHeight, 2)}" rx="1" fill="${formingStyle ? COLORS.plot : candleColor}" stroke="${candleColor}" stroke-width="1.6"${dashAttr}/>`
        );
      }
    } else {
      if (sealed.length >= 2) {
        pieces.push(
          `<path d="${path_for(sealed, start, end, left, right, top, priceBottom, yLow, yHigh)}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
        );
        const finalSealed = sealed[sealed.length - 1];
        const finalX = x_scale(parse_dt(sub(finalSealed, "observed_at")), start, end, left, right);
        const finalY = y_scale(pyFloatConv(sub(finalSealed, "derived_value")), yLow, yHigh, top, priceBottom);
        pieces.push(`<circle cx="${pyFixed(finalX, 2)}" cy="${pyFixed(finalY, 2)}" r="3.5" fill="${color}"/>`);
      } else if (sealed.length > 0) {
        const point = sealed[0];
        const x = x_scale(parse_dt(sub(point, "observed_at")), start, end, left, right);
        const y = y_scale(pyFloatConv(sub(point, "derived_value")), yLow, yHigh, top, priceBottom);
        pieces.push(`<circle cx="${pyFixed(x, 2)}" cy="${pyFixed(y, 2)}" r="4" fill="${color}"/>`);
      }
      if (forming.length > 0 && sub(render, "show_forming_bar")) {
        const formingPoint = forming[forming.length - 1];
        const segment = (sealed.length > 0 ? [sealed[sealed.length - 1]] : []).concat([formingPoint]);
        if (segment.length === 2) {
          pieces.push(
            `<path d="${path_for(segment, start, end, left, right, top, priceBottom, yLow, yHigh)}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>`
          );
        }
        const x = x_scale(parse_dt(sub(formingPoint, "observed_at")), start, end, left, right);
        const y = y_scale(pyFloatConv(sub(formingPoint, "derived_value")), yLow, yHigh, top, priceBottom);
        pieces.push(
          `<circle cx="${pyFixed(x, 2)}" cy="${pyFixed(y, 2)}" r="4.5" fill="${COLORS.plot}" stroke="${color}" stroke-width="2.5"/>`
        );
        if (fetched.length > 1) {
          const label = `${ticker} ${fmt_value(pyFloatConv(sub(formingPoint, "derived_value")), sub(render, "y_axis"))}`;
          const anchor = x > right - 140 ? "end" : "start";
          const dx = anchor === "end" ? -9 : 9;
          pieces.push(
            `<text x="${pyFixed(x + dx, 2)}" y="${pyFixed(y - 9, 2)}" text-anchor="${anchor}" fill="${color}" font-size="12" font-weight="650">${escape(label)}</text>`
          );
        }
      }
    }
  }

  if (timelineLayout === "decision_split" && g(render, "show_settlement_panel", false)) {
    const splitX = x_scale(declared, start, end, left, right);
    const panelX = splitX + 12;
    const panelWidth = Math.max(right - panelX - 8, 120);
    const panelY = priceBottom - 84;
    pieces.push(
      `<rect x="${pyFixed(panelX, 2)}" y="${pyFixed(panelY, 2)}" width="${pyFixed(panelWidth, 2)}" height="70" rx="6" fill="${COLORS.panel}" stroke="${COLORS.benchmark}" stroke-width="1"/>`
    );
    const horizonDate = iso_utc(horizon).slice(0, 10);
    const panelTitle = locale === "zh-CN" ? `结算条件 · ${horizonDate}` : `Settlement · ${horizonDate}`;
    pieces.push(
      `<text x="${pyFixed(panelX + 12, 2)}" y="${pyFixed(panelY + 21, 2)}" fill="${COLORS.benchmark}" font-size="11" font-weight="700">${escape(panelTitle)}</text>`
    );
    const successLines = wrap_text(sub(render, "success_label"), Math.max(panelWidth / 12.0, 12), 2);
    successLines.forEach((line, index) => {
      pieces.push(
        `<text x="${pyFixed(panelX + 12, 2)}" y="${pyFixed(panelY + 44 + index * 17, 2)}" fill="${COLORS.text}" font-size="11" font-weight="600">${escape(line)}</text>`
      );
    });
  }

  if (g(render, "watermark", true)) {
    const markX = left + 12;
    const markY = priceBottom - 14;
    pieces.push(
      `<rect x="${pyFixed(markX, 2)}" y="${pyFixed(markY - 15, 2)}" width="20" height="20" rx="4" fill="${COLORS.muted}" opacity="0.13"/>`
    );
    pieces.push(
      `<text x="${pyFixed(markX + 10, 2)}" y="${pyFixed(markY, 2)}" text-anchor="middle" fill="${COLORS.text}" font-size="12" font-weight="800" opacity="0.18">C</text>`
    );
    pieces.push(
      `<text x="${pyFixed(markX + 28, 2)}" y="${pyFixed(markY, 2)}" fill="${COLORS.text}" font-size="18" font-weight="700" opacity="0.11">Cuebook</text>`
    );
  }

  const footerLines = [];
  const sourceIntervals = fetched
    .map((item) => `${sub(item, "ticker")} ${g(item, "observed_interval") || "?"}`)
    .join(", ");
  if (showProvenance) {
    footerLines.push(`Cuebook OHLCV · ${sourceIntervals}`);
  }
  if (showGuide) {
    if (locale === "zh-CN") {
      footerLines.push("实体/实线：已封盘 · 空心虚线：形成中 · 淡黄区：待结算");
    } else if (g(render, "chart_type") === "candles") {
      footerLines.push("Solid candle: sealed · hollow/dashed: forming · pale area: unresolved");
    } else {
      footerLines.push("Solid: sealed · dashed/hollow: forming · pale area: unresolved");
    }
  }
  const firstFooterY = height - 18 * footerLines.length;
  footerLines.forEach((line, index) => {
    pieces.push(
      `<text x="${pyFloatRepr(left)}" y="${pyFixed(firstFooterY + index * 18, 2)}" fill="${COLORS.muted}" font-size="11">${escape(line)}</text>`
    );
  });
  pieces.push("</svg>");
  return pieces.join("\n");
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

async function main() {
  const prog = basename(process.argv[1] || "render_thesis_chart.mjs");
  const usage = `usage: ${prog} [-h] --output-dir OUTPUT_DIR [--market-data MARKET_DATA] spec\n`;
  const argv = process.argv.slice(2);
  let specArg = null;
  let outputDir = null;
  let marketData = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage);
      return 0;
    }
    if (arg === "--output-dir" || arg.startsWith("--output-dir=")) {
      outputDir = arg.includes("=") ? arg.split("=").slice(1).join("=") : argv[(index += 1)];
      if (outputDir === undefined) {
        process.stderr.write(`${usage}${prog}: error: argument --output-dir: expected one argument\n`);
        return 2;
      }
    } else if (arg === "--market-data" || arg.startsWith("--market-data=")) {
      marketData = arg.includes("=") ? arg.split("=").slice(1).join("=") : argv[(index += 1)];
      if (marketData === undefined) {
        process.stderr.write(`${usage}${prog}: error: argument --market-data: expected one argument\n`);
        return 2;
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`${usage}${prog}: error: unrecognized arguments: ${arg}\n`);
      return 2;
    } else if (specArg === null) {
      specArg = arg;
    } else {
      process.stderr.write(`${usage}${prog}: error: unrecognized arguments: ${arg}\n`);
      return 2;
    }
  }
  const missing = [];
  if (specArg === null) missing.push("spec");
  if (outputDir === null) missing.push("--output-dir");
  if (missing.length > 0) {
    process.stderr.write(`${usage}${prog}: error: the following arguments are required: ${missing.join(", ")}\n`);
    return 2;
  }
  specArg = pathStr(specArg);
  outputDir = pathStr(outputDir);
  if (marketData !== null) marketData = pathStr(marketData);

  let spec;
  try {
    spec = pyJsonLoads(readTextPy(specArg));
  } catch (error) {
    process.stderr.write(`Unable to read chart spec: ${error.message}\n`);
    return 1;
  }
  const result = validate(spec);
  if (!result.valid) {
    process.stderr.write(pyJsonDumps(result, 2) + "\n");
    return 1;
  }

  let marketBatch = null;
  if (marketData !== null) {
    try {
      marketBatch = pyJsonLoads(readTextPy(marketData));
    } catch (error) {
      process.stderr.write(`Unable to read market-data batch: ${error.message}\n`);
      return 1;
    }
  }

  const fetchedAt = Date.now() * 1000;
  const fetched = [];
  let provenance;
  let svg;
  try {
    for (const series of sub(spec, "series")) {
      if (marketBatch !== null) {
        fetched.push(load_canonical_series(spec, series, marketBatch));
      } else if (pyStr(sub(sub(series, "provider"), "name")).toLowerCase() === "cuebook") {
        fetched.push(await fetch_cuebook_series(spec, series));
      } else {
        throw runtimeError(
          `No online adapter registered for provider ${pyStr(sub(sub(series, "provider"), "name"))}; pass --market-data with MarketSeriesBatchV1.`
        );
      }
    }
    const observedIntervals = new Set(fetched.map((item) => sub(item, "observed_interval")));
    const intervalWarnings = [];
    const declaredInterval = sub(sub(spec, "time"), "observed_interval");
    if (!(observedIntervals.size === 1 && observedIntervals.has(declaredInterval))) {
      const sortedIntervals = [...observedIntervals].map((item) => pyStr(item)).sort();
      intervalWarnings.push(
        `Spec observed_interval=${pyStr(declaredInterval)}; provider returned [${sortedIntervals
          .map((item) => pyStrRepr(item))
          .join(", ")}].`
      );
    }
    provenance = {
      schema_version: "thesis-chart-data-v1",
      chart_id: sub(spec, "chart_id"),
      fetched_at: iso_utc(fetchedAt),
      preferred_interval: sub(sub(spec, "time"), "preferred_interval"),
      declared_observed_interval: sub(sub(spec, "time"), "observed_interval"),
      provider_observed_intervals: [...observedIntervals].map((item) => pyStr(item)).sort(),
      input_mode: marketBatch !== null ? "market-series-batch" : "provider-fetch",
      source_fetched_at: marketBatch !== null ? g(marketBatch, "fetched_at") : null,
      interval_warnings: intervalWarnings,
      series: fetched,
    };
    svg = render_svg(spec, fetched);
  } catch (error) {
    process.stderr.write(`Chart rendering failed: ${error.message}\n`);
    return 1;
  }

  mkdirSync(outputDir, { recursive: true });
  const svgPath = join(outputDir, "chart.svg");
  const dataPath = join(outputDir, "chart-data.json");
  writeFileSync(svgPath, svg, "utf-8");
  writeFileSync(dataPath, pyJsonDumps(provenance, 2), "utf-8");
  process.stdout.write(pyJsonDumps({ chart: svgPath, data: dataPath }, 2) + "\n");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
