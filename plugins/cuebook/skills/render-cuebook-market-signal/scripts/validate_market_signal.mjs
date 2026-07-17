#!/usr/bin/env node
// Validate MarketSignalSpecV1 and MarketSignalV1 artifacts.

import { statSync } from "node:fs";

import {
  pyFromIsoformat,
  pyJsonLoads,
  PyJSONDecodeError,
  PyOSError,
  pyPathIsAbsolute,
  pyPathJoin,
  pyPathStr,
  pyReadBytes,
  pyReadText,
  pyStrip,
  pyrepr,
  sha256Hex,
} from "./pycompat.mjs";

const SPEC_FIELDS = new Set([
  "schema_version",
  "signal_id",
  "revision",
  "state",
  "mode",
  "lineage",
  "frame",
  "trade_logic",
  "key_number",
  "key_news",
  "render",
  "quality_report",
]);
const MANIFEST_FIELDS = new Set([
  "schema_version",
  "market_signal_id",
  "spec_ref",
  "mode",
  "state",
  "generated_at",
  "dimensions",
  "theme",
  "lineage",
  "content",
  "asset",
  "quality_report",
]);
const TRADE_LOGIC_FAMILIES = new Set(["event_driven", "relative_value", "directional", "global_macro", "factor_style", "volatility", "liquidity_microstructure", "carry_income"]);
const TRADE_LOGIC_MECHANISMS = new Set(["risk_premium_transmission", "expectation_revision", "supply_demand_repricing", "forced_flow", "positioning_squeeze", "liquidity_amplification", "price_discovery_lead_lag", "valuation_mean_reversion", "fundamental_compounding", "momentum_continuation", "volatility_repricing", "carry_roll_down", "cross_asset_transmission"]);
const TRADE_LOGIC_EXPRESSIONS = new Set(["outright_long", "outright_short", "relative_value_pair", "long_short_basket", "etf_basket", "curve_spread", "options_convexity", "volatility_trade", "hedge_overlay", "no_trade"]);
const TRADE_LOGIC_HORIZONS = new Set(["intraday", "one_to_three_days", "one_to_four_weeks", "one_to_three_months", "structural"]);
const PUBLIC_BACKEND_TERMS = ["已确认", "已计算", "推演", "待确认", "形成中", "等待确认", "交给市场验证", "observed", "derived", "provisional", "conditional", "confirmed", "pending"];

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyTruthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return pyrepr(value);
}

function strOr(value) {
  return pyStr(pyTruthy(value) ? value : "");
}

function fullmatch(pattern, value) {
  return new RegExp(`^(?:${pattern})$`).test(value);
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function nonempty(value) {
  return typeof value === "string" && pyStrip(value).length > 0;
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = pyFromIsoformat(value.replace("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!parsed.aware) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed;
}

export function stringSet(value, path, errors, require = true) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_SET", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const valid = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) {
      errors.push(issue("STRING_SET_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    } else {
      valid.push(item);
    }
  });
  if (valid.length !== new Set(valid).size) {
    errors.push(issue("STRING_SET_UNIQUE", path, "Strings must be unique."));
  }
  if (require && valid.length === 0) {
    errors.push(issue("STRING_SET_EMPTY", path, "At least one reference is required."));
  }
  return valid;
}

export function validateQuality(value, state, errors) {
  if (!isDict(value)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    return;
  }
  const decision = value.decision;
  const warnings = stringSet(value.warnings, "$.quality_report.warnings", errors, false);
  const failures = stringSet(value.hard_failures, "$.quality_report.hard_failures", errors, false);
  if (!["ready", "conditional", "blocked"].includes(decision)) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  }
  if (state === "conditional" && (decision !== "conditional" || warnings.length === 0)) {
    errors.push(issue("CONDITIONAL_QUALITY", "$.quality_report", "Conditional state requires a warning and conditional quality."));
  }
  if ((state === "ready" || state === "frozen") && (decision !== "ready" || warnings.length > 0 || failures.length > 0)) {
    errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen state requires clean ready quality."));
  }
  if (failures.length > 0 && decision !== "blocked") {
    errors.push(issue("FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."));
  }
}

export function validateSpec(payload) {
  const errors = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }
  const payloadKeys = new Set(Object.keys(payload));
  for (const key of [...SPEC_FIELDS].filter((item) => !payloadKeys.has(item)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of [...payloadKeys].filter((item) => !SPEC_FIELDS.has(item)).sort()) {
    errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "market-signal-spec-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-signal-spec-v1."));
  }
  if (!fullmatch("SIGSPEC_[A-Za-z0-9_:-]{8,}", strOr(payload.signal_id))) {
    errors.push(issue("SIGNAL_ID", "$.signal_id", "Invalid signal spec ID."));
  }
  if (typeof payload.revision !== "number" || !Number.isInteger(payload.revision) || (payload.revision ?? 0) < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }
  const state = payload.state;
  if (!["conditional", "ready", "frozen"].includes(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }
  const mode = payload.mode;
  if (mode !== "key_number" && mode !== "key_news") {
    errors.push(issue("MODE", "$.mode", "Mode must be key_number or key_news."));
  }

  const lineage = isDict(payload.lineage) ? payload.lineage : {};
  if (!pyTruthy(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
  }
  stringSet(lineage.input_artifact_refs, "$.lineage.input_artifact_refs", errors);
  const lineageSources = stringSet(lineage.source_refs, "$.lineage.source_refs", errors);
  const cutoff = parseTime(lineage.decision_cutoff_at, "$.lineage.decision_cutoff_at", errors);

  const frame = isDict(payload.frame) ? payload.frame : {};
  if (!pyTruthy(frame)) {
    errors.push(issue("FRAME", "$.frame", "Frame must be an object."));
  }
  for (const key of ["category", "asset_label", "headline", "interpretation"]) {
    if (!nonempty(frame[key])) {
      errors.push(issue("FRAME_FIELD", `$.frame.${key}`, `${key} is required.`));
    }
  }
  if ([...strOr(frame.headline)].length > 120) {
    errors.push(issue("HEADLINE_LENGTH", "$.frame.headline", "Headline must not exceed 120 characters."));
  }
  if ([...strOr(frame.interpretation)].length > 180) {
    errors.push(issue("INTERPRETATION_LENGTH", "$.frame.interpretation", "Interpretation must not exceed 180 characters."));
  }
  for (const key of ["headline", "interpretation"]) {
    const value = strOr(frame[key]);
    if (PUBLIC_BACKEND_TERMS.some((term) => value.toLowerCase().includes(term.toLowerCase()))) {
      errors.push(issue("PUBLIC_BACKEND_TERM", `$.frame.${key}`, "Backend evidence-state or workflow terms cannot appear in public copy."));
    }
  }

  const tradeLogic = isDict(payload.trade_logic) ? payload.trade_logic : {};
  if (!pyTruthy(tradeLogic)) {
    errors.push(issue("TRADE_LOGIC", "$.trade_logic", "TradeLogicProfileV1 summary is required."));
  }
  if (!fullmatch("TLOGIC_[A-Za-z0-9_:-]{8,}", strOr(tradeLogic.profile_ref))) {
    errors.push(issue("TRADE_LOGIC_REF", "$.trade_logic.profile_ref", "Invalid TradeLogicProfileV1 ref."));
  }
  for (const [key, allowed] of [
    ["family", TRADE_LOGIC_FAMILIES],
    ["mechanism", TRADE_LOGIC_MECHANISMS],
    ["expression", TRADE_LOGIC_EXPRESSIONS],
    ["horizon", TRADE_LOGIC_HORIZONS],
  ]) {
    if (!allowed.has(tradeLogic[key])) {
      errors.push(issue("TRADE_LOGIC_CLASS", `$.trade_logic.${key}`, "Unsupported trade logic classification."));
    }
  }
  const publicTags = stringSet(tradeLogic.public_tags, "$.trade_logic.public_tags", errors);
  if (!(publicTags.length >= 2 && publicTags.length <= 4)) {
    errors.push(issue("TRADE_LOGIC_TAGS", "$.trade_logic.public_tags", "Use two to four public strategy tags."));
  }
  publicTags.forEach((tag, index) => {
    if ([...tag].length > 24) {
      errors.push(issue("TRADE_LOGIC_TAG_LENGTH", `$.trade_logic.public_tags[${index}]`, "Public tags must not exceed 24 characters."));
    }
    if (PUBLIC_BACKEND_TERMS.some((term) => tag.toLowerCase().includes(term.toLowerCase()))) {
      errors.push(issue("PUBLIC_BACKEND_TERM", `$.trade_logic.public_tags[${index}]`, "Backend evidence-state terms cannot appear in public tags."));
    }
  });

  const number = payload.key_number;
  const news = payload.key_news;
  if (mode === "key_number" && (!isDict(number) || (news !== null && news !== undefined))) {
    errors.push(issue("MODE_PAYLOAD", "$", "key_number mode requires one key_number and null key_news."));
  }
  if (mode === "key_news" && (!isDict(news) || (number !== null && number !== undefined))) {
    errors.push(issue("MODE_PAYLOAD", "$", "key_news mode requires one key_news and null key_number."));
  }

  if (isDict(number)) {
    for (const key of ["label", "display_value", "unit", "source_ref"]) {
      if (!nonempty(number[key])) {
        errors.push(issue("NUMBER_FIELD", `$.key_number.${key}`, `${key} is required.`));
      }
    }
    const asOf = parseTime(number.as_of, "$.key_number.as_of", errors);
    if (cutoff && asOf && asOf.epoch > cutoff.epoch) {
      errors.push(issue("NUMBER_AFTER_CUTOFF", "$.key_number.as_of", "Number as-of time cannot exceed the decision cutoff."));
    }
    if (!["observed", "derived", "provisional"].includes(number.status)) {
      errors.push(issue("NUMBER_STATUS", "$.key_number.status", "Unsupported number status."));
    }
    if (number.comparison !== null && number.comparison !== undefined && !nonempty(number.comparison)) {
      errors.push(issue("NUMBER_COMPARISON", "$.key_number.comparison", "Comparison must be null or non-empty."));
    }
    if (nonempty(number.source_ref) && !lineageSources.includes(number.source_ref)) {
      errors.push(issue("NUMBER_SOURCE_LINEAGE", "$.key_number.source_ref", "Number source must be preserved in lineage."));
    }
    if (number.status === "provisional" && state !== "conditional") {
      errors.push(issue("PROVISIONAL_STATE", "$.state", "A provisional number requires conditional state."));
    }
  }

  if (isDict(news)) {
    for (const key of ["headline", "publisher"]) {
      if (!nonempty(news[key])) {
        errors.push(issue("NEWS_FIELD", `$.key_news.${key}`, `${key} is required.`));
      }
    }
    const published = parseTime(news.published_at, "$.key_news.published_at", errors);
    if (cutoff && published && published.epoch > cutoff.epoch) {
      errors.push(issue("NEWS_AFTER_CUTOFF", "$.key_news.published_at", "News publication time cannot exceed the decision cutoff."));
    }
    if (!["observed", "provisional", "unconfirmed"].includes(news.status)) {
      errors.push(issue("NEWS_STATUS", "$.key_news.status", "Unsupported news status."));
    }
    const newsSources = stringSet(news.source_refs, "$.key_news.source_refs", errors);
    if (newsSources.some((ref) => !lineageSources.includes(ref))) {
      errors.push(issue("NEWS_SOURCE_LINEAGE", "$.key_news.source_refs", "News sources must be preserved in lineage."));
    }
    if (news.status !== "observed" && state !== "conditional") {
      errors.push(issue("NEWS_UNCERTAINTY_STATE", "$.state", "Non-observed news requires conditional state."));
    }
  }

  const render = isDict(payload.render) ? payload.render : {};
  const expected = {
    layout: "compact",
    width: 720,
    height: 420,
    design_profile: "receptive_restraint",
    watermark: "Cuebook",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (render[key] !== value) {
      errors.push(issue("RENDER_CONTRACT", `$.render.${key}`, `Expected ${pyrepr(value)}.`));
    }
  }
  if (render.theme !== "cuebook_light" && render.theme !== "cuebook_dark") {
    errors.push(issue("THEME", "$.render.theme", "Unsupported theme."));
  }
  validateQuality(payload.quality_report, state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateManifest(payload, assetRoot = null) {
  const errors = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }
  const payloadKeys = new Set(Object.keys(payload));
  for (const key of [...MANIFEST_FIELDS].filter((item) => !payloadKeys.has(item)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of [...payloadKeys].filter((item) => !MANIFEST_FIELDS.has(item)).sort()) {
    errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "market-signal-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-signal-v1."));
  }
  if (!fullmatch("SIGNAL_[A-Za-z0-9_:-]{8,}", strOr(payload.market_signal_id))) {
    errors.push(issue("MARKET_SIGNAL_ID", "$.market_signal_id", "Invalid market signal ID."));
  }
  if (!fullmatch("SIGSPEC_[A-Za-z0-9_:-]{8,}", strOr(payload.spec_ref))) {
    errors.push(issue("SPEC_REF", "$.spec_ref", "Invalid spec ref."));
  }
  if (payload.mode !== "key_number" && payload.mode !== "key_news") {
    errors.push(issue("MODE", "$.mode", "Unsupported mode."));
  }
  const state = payload.state;
  if (!["conditional", "ready", "frozen"].includes(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }
  parseTime(payload.generated_at, "$.generated_at", errors);
  const dimensions = isDict(payload.dimensions) ? payload.dimensions : {};
  const dimensionKeys = Object.keys(dimensions);
  if (!(dimensionKeys.length === 2 && dimensions.width === 720 && dimensions.height === 420)) {
    errors.push(issue("DIMENSIONS", "$.dimensions", "Expected 720 x 420."));
  }
  if (payload.theme !== "cuebook_light" && payload.theme !== "cuebook_dark") {
    errors.push(issue("THEME", "$.theme", "Unsupported theme."));
  }
  const lineage = isDict(payload.lineage) ? payload.lineage : {};
  stringSet(lineage.input_artifact_refs, "$.lineage.input_artifact_refs", errors);
  stringSet(lineage.source_refs, "$.lineage.source_refs", errors);
  parseTime(lineage.decision_cutoff_at, "$.lineage.decision_cutoff_at", errors);
  if (!fullmatch("TLOGIC_[A-Za-z0-9_:-]{8,}", strOr(lineage.trade_logic_ref))) {
    errors.push(issue("TRADE_LOGIC_REF", "$.lineage.trade_logic_ref", "Invalid TradeLogicProfileV1 ref."));
  }
  const content = isDict(payload.content) ? payload.content : {};
  for (const key of ["category", "asset_label", "headline", "interpretation", "signal_label"]) {
    if (!nonempty(content[key])) {
      errors.push(issue("CONTENT_FIELD", `$.content.${key}`, `${key} is required.`));
    }
  }
  const tags = stringSet(content.strategy_tags, "$.content.strategy_tags", errors);
  if (!(tags.length >= 2 && tags.length <= 4)) {
    errors.push(issue("TRADE_LOGIC_TAGS", "$.content.strategy_tags", "Use two to four public strategy tags."));
  }
  tags.forEach((tag, index) => {
    if (PUBLIC_BACKEND_TERMS.some((term) => tag.toLowerCase().includes(term.toLowerCase()))) {
      errors.push(issue("PUBLIC_BACKEND_TERM", `$.content.strategy_tags[${index}]`, "Backend evidence-state terms cannot appear in public tags."));
    }
  });
  parseTime(content.signal_time, "$.content.signal_time", errors);
  if (content.signal_value !== null && content.signal_value !== undefined && !nonempty(content.signal_value)) {
    errors.push(issue("SIGNAL_VALUE", "$.content.signal_value", "Signal value must be null or non-empty."));
  }
  if (!["observed", "derived", "provisional", "unconfirmed"].includes(content.signal_status)) {
    errors.push(issue("SIGNAL_STATUS", "$.content.signal_status", "Unsupported signal status."));
  }
  if (content.watermark !== "Cuebook") {
    errors.push(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."));
  }
  const asset = isDict(payload.asset) ? payload.asset : {};
  const svgRef = asset.svg_ref;
  const contentHash = asset.content_hash;
  if (!nonempty(svgRef)) {
    errors.push(issue("SVG_REF", "$.asset.svg_ref", "SVG ref is required."));
  }
  if (!fullmatch("sha256:[a-f0-9]{64}", strOr(contentHash))) {
    errors.push(issue("CONTENT_HASH", "$.asset.content_hash", "Invalid content hash."));
  }
  if (assetRoot !== null && nonempty(svgRef)) {
    const assetPath = pyPathIsAbsolute(svgRef) ? pyPathStr(svgRef) : pyPathJoin(assetRoot, svgRef);
    let isFile = false;
    try {
      isFile = statSync(assetPath).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      errors.push(issue("ASSET_MISSING", "$.asset.svg_ref", `Asset does not exist: ${assetPath}.`));
    } else if (fullmatch("sha256:[a-f0-9]{64}", strOr(contentHash))) {
      const observed = `sha256:${sha256Hex(pyReadBytes(assetPath))}`;
      if (observed !== contentHash) {
        errors.push(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."));
      }
    }
  }
  validateQuality(payload.quality_report, state, errors);
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validate(payload, assetRoot = null) {
  if (isDict(payload) && payload.schema_version === "market-signal-v1") {
    return validateManifest(payload, assetRoot);
  }
  return validateSpec(payload);
}

function parseArgs(argv) {
  const usage = "usage: validate_market_signal.mjs [-h] [--asset-root ASSET_ROOT] artifact";
  const args = { artifact: null, assetRoot: null };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    } else if (arg === "--asset-root") {
      index += 1;
      if (index >= argv.length) {
        process.stderr.write(`${usage}\nvalidate_market_signal.mjs: error: argument --asset-root: expected one argument\n`);
        process.exit(2);
      }
      args.assetRoot = argv[index];
    } else if (arg.startsWith("--asset-root=")) {
      args.assetRoot = arg.slice("--asset-root=".length);
    } else if (arg.startsWith("-") && arg !== "-") {
      process.stderr.write(`${usage}\nvalidate_market_signal.mjs: error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    if (positionals.length === 0) {
      process.stderr.write(`${usage}\nvalidate_market_signal.mjs: error: the following arguments are required: artifact\n`);
    } else {
      process.stderr.write(`${usage}\nvalidate_market_signal.mjs: error: unrecognized arguments: ${positionals.slice(1).join(" ")}\n`);
    }
    process.exit(2);
  }
  args.artifact = positionals[0];
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let payload;
  try {
    payload = pyJsonLoads(pyReadText(args.artifact));
  } catch (error) {
    if (error instanceof PyOSError || error instanceof PyJSONDecodeError) {
      process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("LOAD", "$", error.message)], warnings: [] }, null, 2)}\n`);
      return 1;
    }
    throw error;
  }
  const result = validate(payload, args.assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  process.exit(main());
}

