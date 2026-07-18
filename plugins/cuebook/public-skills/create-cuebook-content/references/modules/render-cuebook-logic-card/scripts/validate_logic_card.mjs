#!/usr/bin/env node
// Validate LogicCardV1 lineage, grammar, asset integrity, and state.
// Port of validate_logic_card.py; error codes, paths, messages, JSON output,
// and exit status are contract.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { pyFromIsoformat, pyStrip } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

const GRAMMARS = new Set(["causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison"]);
const ROOT_FIELDS = new Set([
  "schema_version", "card_id", "argument_ref", "grammar", "state",
  "generated_at", "theme", "dimensions", "lineage", "content", "asset",
  "quality_report",
]);

export function issue(code, path, message) {
  return { code, path, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function strOrEmpty(value) {
  if (!pyTruthy(value)) return "";
  if (typeof value === "string") return value;
  if (value === true) return "True";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function nonempty(value) {
  return typeof value === "string" && pyStrip(value) !== "";
}

export function parseTime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = pyFromIsoformat(value.replaceAll("Z", "+00:00"));
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

export function stringList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) {
      errors.push(issue("STRING_LIST_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
      return;
    }
    result.push(item);
  });
  if (result.length !== new Set(result).size) {
    errors.push(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."));
  }
  return result;
}

export function validate(payload, argument = null, assetRoot = null) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }

  for (const key of [...ROOT_FIELDS].filter((field) => !Object.hasOwn(payload, field)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(payload).filter((field) => !ROOT_FIELDS.has(field)).sort()) {
    errors.push(issue("UNKNOWN_FIELD", `$.${key}`, "Unknown root field."));
  }

  if (payload.schema_version !== "logic-card-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected logic-card-v1."));
  }
  if (!/^LOGICCARD_[A-Za-z0-9_:-]{8,}$/.test(strOrEmpty(payload.card_id))) {
    errors.push(issue("CARD_ID", "$.card_id", "Invalid logic card ID."));
  }
  const argumentRef = payload.argument_ref;
  if (!/^VARG_[A-Za-z0-9_:-]{8,}$/.test(strOrEmpty(argumentRef))) {
    errors.push(issue("ARGUMENT_REF", "$.argument_ref", "Invalid visual argument reference."));
  }
  const grammar = payload.grammar;
  if (!GRAMMARS.has(grammar)) {
    errors.push(issue("GRAMMAR", "$.grammar", "Unsupported logic-card grammar."));
  }
  const state = payload.state;
  if (!new Set(["draft", "conditional", "ready", "frozen"]).has(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported logic-card state."));
  }
  parseTime(payload.generated_at, "$.generated_at", errors);
  if (!new Set(["cuebook_light", "cuebook_dark"]).has(payload.theme)) {
    errors.push(issue("THEME", "$.theme", "Unsupported Cuebook theme."));
  }

  let dimensions = payload.dimensions;
  if (!isObject(dimensions)) {
    errors.push(issue("DIMENSIONS", "$.dimensions", "Dimensions must be an object."));
    dimensions = {};
  }
  for (const [key, lower, upper] of [["width", 640, 2400], ["height", 360, 1600]]) {
    const value = dimensions[key];
    if (!Number.isInteger(value) || typeof value === "boolean" || value < lower || value > upper) {
      errors.push(issue("DIMENSION_VALUE", `$.dimensions.${key}`, `${key} must be ${lower}-${upper}.`));
    }
  }

  let lineage = payload.lineage;
  if (!isObject(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
    lineage = {};
  }
  const inputArgumentRef = lineage.input_argument_ref;
  if (inputArgumentRef !== argumentRef) {
    errors.push(issue("ARGUMENT_LINEAGE", "$.lineage.input_argument_ref", "Input argument ref must match argument_ref."));
  }
  const nodeRefs = stringList(lineage.node_refs, "$.lineage.node_refs", errors);
  const metricRefs = stringList(lineage.metric_refs, "$.lineage.metric_refs", errors);
  const sourceRefs = stringList(lineage.source_refs, "$.lineage.source_refs", errors);
  if (!nodeRefs.length) {
    errors.push(issue("NODE_LINEAGE", "$.lineage.node_refs", "A logic card must preserve at least one argument node."));
  }
  const settlementClaimRef = lineage.settlement_claim_ref;
  if (settlementClaimRef !== null && settlementClaimRef !== undefined && !nonempty(settlementClaimRef)) {
    errors.push(issue("SETTLEMENT_LINEAGE", "$.lineage.settlement_claim_ref", "Settlement ref must be null or non-empty."));
  }

  let content = payload.content;
  if (!isObject(content)) {
    errors.push(issue("CONTENT", "$.content", "Content must be an object."));
    content = {};
  }
  for (const key of ["headline", "thesis"]) {
    if (!nonempty(content[key])) {
      errors.push(issue("CONTENT_FIELD", `$.content.${key}`, `${key} is required.`));
    }
  }
  const settlementLine = content.settlement_line;
  if (settlementLine !== null && settlementLine !== undefined && !nonempty(settlementLine)) {
    errors.push(issue("SETTLEMENT_LINE", "$.content.settlement_line", "Settlement line must be null or non-empty."));
  }
  if (content.watermark !== "Cuebook") {
    errors.push(issue("WATERMARK", "$.content.watermark", "Cuebook watermark is required."));
  }

  let asset = payload.asset;
  if (!isObject(asset)) {
    errors.push(issue("ASSET", "$.asset", "Asset must be an object."));
    asset = {};
  }
  const svgRef = asset.svg_ref;
  if (!nonempty(svgRef)) {
    errors.push(issue("SVG_REF", "$.asset.svg_ref", "SVG reference is required."));
  }
  const contentHash = asset.content_hash;
  if (!/^sha256:[a-f0-9]{64}$/.test(strOrEmpty(contentHash))) {
    errors.push(issue("CONTENT_HASH", "$.asset.content_hash", "Expected sha256:<64 lowercase hex characters>."));
  }
  if (assetRoot !== null && assetRoot !== undefined && nonempty(svgRef)) {
    const svgPath = isAbsolute(svgRef) ? svgRef : resolve(String(assetRoot), svgRef);
    if (!existsSync(svgPath) || !statSync(svgPath).isFile()) {
      errors.push(issue("ASSET_MISSING", "$.asset.svg_ref", `Asset does not exist: ${svgPath}.`));
    } else if (/^sha256:[a-f0-9]{64}$/.test(strOrEmpty(contentHash))) {
      const observedHash = `sha256:${createHash("sha256").update(readFileSync(svgPath)).digest("hex")}`;
      if (observedHash !== contentHash) {
        errors.push(issue("ASSET_HASH", "$.asset.content_hash", "SVG bytes do not match content_hash."));
      }
    }
  }

  let quality = payload.quality_report;
  if (!isObject(quality)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    quality = {};
  }
  const decision = quality.decision;
  if (!new Set(["ready", "conditional", "blocked"]).has(decision)) {
    errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  }
  const qualityWarnings = stringList(quality.warnings, "$.quality_report.warnings", errors);
  const hardFailures = stringList(quality.hard_failures, "$.quality_report.hard_failures", errors);
  if (hardFailures.length && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked quality."));
  }
  if (state === "conditional" && (decision !== "conditional" || !qualityWarnings.length)) {
    errors.push(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional cards require a warning and conditional quality."));
  }
  if (new Set(["ready", "frozen"]).has(state) && (decision !== "ready" || qualityWarnings.length || hardFailures.length)) {
    errors.push(issue("READY_STATE", "$.quality_report", "Ready or frozen cards require clean ready quality."));
  }
  if (decision === "blocked" && !hardFailures.length) {
    errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked quality requires a hard failure."));
  }

  if (argument !== null && argument !== undefined) {
    if (argument.argument_id !== argumentRef) {
      errors.push(issue("ARGUMENT_MISMATCH", "$.argument_ref", "Manifest does not reference the supplied argument."));
    }
    const visual = isObject(argument.visual) ? argument.visual : {};
    const allowed = new Set([visual.recommended_grammar, ...(visual.alternative_grammars ?? [])]);
    if (!allowed.has(grammar)) {
      errors.push(issue("UNDECLARED_GRAMMAR", "$.grammar", "Grammar is neither recommended nor declared as an alternative."));
    }
    if (visual.theme !== payload.theme) {
      errors.push(issue("THEME_MISMATCH", "$.theme", "Card theme must match the visual argument."));
    }
    if (argument.state !== state) {
      errors.push(issue("STATE_MISMATCH", "$.state", "Card state must match the visual argument."));
    }
    const frame = isObject(argument.frame) ? argument.frame : {};
    if (content.headline !== frame.headline) {
      errors.push(issue("HEADLINE_MISMATCH", "$.content.headline", "Headline must remain bound to the argument."));
    }
    if (content.thesis !== frame.thesis) {
      errors.push(issue("THESIS_MISMATCH", "$.content.thesis", "Thesis must remain bound to the argument."));
    }

    const graph = isObject(argument.graph) ? argument.graph : {};
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const metrics = Array.isArray(argument.metrics) ? argument.metrics : [];
    const argumentNodes = new Set(nodes.filter(isObject).map((item) => item.id));
    const argumentMetrics = new Set(metrics.filter(isObject).map((item) => item.id));
    const argumentSources = new Set();
    for (const item of nodes.filter(isObject)) {
      for (const ref of item.source_refs ?? []) argumentSources.add(ref);
    }
    for (const item of metrics.filter(isObject)) {
      if (nonempty(item.source_ref)) argumentSources.add(item.source_ref);
    }
    if (!nodeRefs.every((ref) => argumentNodes.has(ref))) {
      errors.push(issue("UNKNOWN_NODE_REF", "$.lineage.node_refs", "Card references a node outside the argument."));
    }
    if (!metricRefs.every((ref) => argumentMetrics.has(ref))) {
      errors.push(issue("UNKNOWN_METRIC_REF", "$.lineage.metric_refs", "Card references a metric outside the argument."));
    }
    if (!sourceRefs.every((ref) => argumentSources.has(ref))) {
      errors.push(issue("UNKNOWN_SOURCE_REF", "$.lineage.source_refs", "Card references a source outside the argument."));
    }

    const settlement = isObject(argument.settlement) ? argument.settlement : {};
    if (settlement.settleable) {
      if (settlementClaimRef !== settlement.claim_ref || !nonempty(settlementLine)) {
        errors.push(issue("SETTLEMENT_BINDING", "$.lineage.settlement_claim_ref", "Settleable cards must preserve claim ref and visible rule."));
      }
    } else if ((settlementClaimRef !== null && settlementClaimRef !== undefined) || (settlementLine !== null && settlementLine !== undefined)) {
      errors.push(issue("NON_SETTLEABLE_BINDING", "$.content.settlement_line", "Non-settleable cards cannot add a settlement rule."));
    }
  }

  if (state === "conditional") {
    warnings.push(issue("CONDITIONAL_PREVIEW", "$.state", "Preview is useful for editing but cannot be frozen yet."));
  }
  return { valid: errors.length === 0, errors, warnings };
}

function parseArgs(argv) {
  let manifest = null;
  let argument = null;
  let skipAssetCheck = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--argument") argument = argv[++index];
    else if (token === "--skip-asset-check") skipAssetCheck = true;
    else if (!manifest) manifest = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (!manifest) throw new Error("the following arguments are required: manifest");
  return { manifest, argument, skipAssetCheck };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: validate_logic_card.mjs manifest [--argument ARGUMENT] [--skip-asset-check]\nvalidate_logic_card.mjs: error: ${error.message}\n`);
    return 2;
  }
  let payload;
  let argument;
  try {
    payload = JSON.parse(readFileSync(args.manifest, "utf8"));
    argument = args.argument ? JSON.parse(readFileSync(args.argument, "utf8")) : null;
  } catch (error) {
    const result = { valid: false, errors: [issue("READ", "$", error.message)], warnings: [] };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 1;
  }
  const assetRoot = args.skipAssetCheck ? null : dirname(resolve(args.manifest));
  const result = validate(payload, argument, assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
