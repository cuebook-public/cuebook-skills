#!/usr/bin/env node
// Validate ViewpointCardV1 structure, lineage, ownership, and state invariants.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function issue(code, path, message) {
  return { code, path, message };
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function pyInt(value) {
  return typeof value === "boolean" || (typeof value === "number" && Number.isInteger(value));
}

function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

function orEmpty(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return "";
  if (Array.isArray(value) && value.length === 0) return "";
  if (isDict(value) && Object.keys(value).length === 0) return "";
  return value;
}

export function stringList(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."));
    return [];
  }
  const result = [];
  value.forEach((item, index) => {
    if (!nonempty(item)) errors.push(issue("STRING_LIST_ITEM", `${path}[${index}]`, "Expected a non-empty string."));
    else result.push(item);
  });
  if (result.length !== new Set(result).size) errors.push(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."));
  return result;
}

export function parseDatetime(value, path, errors) {
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const normalized = value.replaceAll("Z", "+00:00");
  const timezoneAware = /(?:[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:\.\d{1,6})?)?)$/.test(normalized);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (!timezoneAware) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };

  if (payload.schema_version !== "viewpoint-card-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-card-v1."));
  if (!/^VIEWCARD_[A-Za-z0-9_:-]{8,}$/.test(pyStr(orEmpty(payload.card_id)))) errors.push(issue("CARD_ID", "$.card_id", "Invalid viewpoint card ID."));
  if (!pyInt(payload.revision) || Number(payload.revision ?? 0) < 1) errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  const state = payload.state;
  if (!["draft", "conditional", "ready", "frozen"].includes(state)) errors.push(issue("STATE", "$.state", "Unsupported card state."));

  let lineage = payload.lineage;
  if (!isDict(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
    lineage = {};
  }
  const inputRefs = stringList(lineage.input_artifact_refs, "$.lineage.input_artifact_refs", errors);
  if (inputRefs.length === 0) errors.push(issue("INPUT_REF_REQUIRED", "$.lineage.input_artifact_refs", "At least one input artifact is required."));
  for (const key of ["creator_intent_ref", "thesis_ref", "post_ref", "viewpoint_visual_ref", "logic_card_ref", "market_figure_ref", "chart_ref", "indicator_pack_ref", "settlement_claim_ref"]) {
    const value = lineage[key];
    if (key === "creator_intent_ref" && !nonempty(value)) errors.push(issue("CREATOR_INTENT_REF", `$.lineage.${key}`, "Creator intent reference is required."));
    else if (value !== null && value !== undefined && !nonempty(value)) errors.push(issue("LINEAGE_REF", `$.lineage.${key}`, "Reference must be null or a non-empty string."));
    if (nonempty(value) && !inputRefs.includes(value)) errors.push(issue("LINEAGE_INPUT_MISSING", `$.lineage.${key}`, "Every lineage reference must also appear in input_artifact_refs."));
  }

  let creator = payload.creator;
  if (!isDict(creator)) {
    errors.push(issue("CREATOR", "$.creator", "Creator must be an object."));
    creator = {};
  }
  for (const key of ["creator_ref", "display_name"]) {
    if (!nonempty(creator[key])) errors.push(issue("CREATOR_FIELD", `$.creator.${key}`, `${key} is required.`));
  }
  if (creator.handle !== null && creator.handle !== undefined && !nonempty(creator.handle)) errors.push(issue("CREATOR_HANDLE", "$.creator.handle", "Handle must be null or a non-empty string."));
  if (!["human", "ai", "hybrid"].includes(creator.author_type)) errors.push(issue("AUTHOR_TYPE", "$.creator.author_type", "Unsupported author type."));
  if (creator.decision_owner !== "creator") errors.push(issue("DECISION_OWNER", "$.creator.decision_owner", "The creator must remain the decision owner."));

  let header = payload.header;
  if (!isDict(header)) {
    errors.push(issue("HEADER", "$.header", "Header must be an object."));
    header = {};
  }
  for (const key of ["instrument_id", "ticker", "direction_label", "status_label"]) {
    if (!nonempty(header[key])) errors.push(issue("HEADER_FIELD", `$.header.${key}`, `${key} is required.`));
  }
  const direction = header.direction;
  if (!["long", "short", "outperform", "underperform", "range", "neutral", "observe", "custom"].includes(direction)) errors.push(issue("DIRECTION", "$.header.direction", "Unsupported direction."));
  const deadlineAt = header.deadline_at;
  const deadlineLabel = header.deadline_label;
  if (deadlineAt !== null && deadlineAt !== undefined) parseDatetime(deadlineAt, "$.header.deadline_at", errors);
  if (deadlineLabel !== null && deadlineLabel !== undefined && !nonempty(deadlineLabel)) errors.push(issue("DEADLINE_LABEL", "$.header.deadline_label", "Deadline label must be null or a non-empty string."));
  const benchmarkTicker = header.benchmark_ticker;
  const benchmarkId = header.benchmark_instrument_id;
  if (["outperform", "underperform"].includes(direction) && (!nonempty(benchmarkTicker) || !nonempty(benchmarkId))) errors.push(issue("RELATIVE_BENCHMARK", "$.header", "Relative cards require a benchmark instrument and ticker."));
  for (const [key, value] of [["benchmark_ticker", benchmarkTicker], ["benchmark_instrument_id", benchmarkId]]) {
    if (value !== null && value !== undefined && !nonempty(value)) errors.push(issue("BENCHMARK_FIELD", `$.header.${key}`, "Benchmark must be null or a non-empty string."));
  }

  let thesis = payload.thesis;
  if (!isDict(thesis)) {
    errors.push(issue("THESIS", "$.thesis", "Thesis must be an object."));
    thesis = {};
  }
  for (const key of ["headline", "body", "creator_text"]) {
    if (!nonempty(thesis[key])) errors.push(issue("THESIS_FIELD", `$.thesis.${key}`, `${key} is required.`));
  }
  if (thesis.creator_text_preserved !== true) errors.push(issue("CREATOR_TEXT_PRESERVATION", "$.thesis.creator_text_preserved", "Creator text must be preserved verbatim."));
  if (thesis.content_ref !== null && thesis.content_ref !== undefined && !nonempty(thesis.content_ref)) errors.push(issue("CONTENT_REF", "$.thesis.content_ref", "Content ref must be null or a non-empty string."));

  let blocks = payload.blocks;
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 12) {
    errors.push(issue("BLOCKS", "$.blocks", "Expected one to twelve blocks."));
    blocks = [];
  }
  const blockIds = new Set();
  const blockOrders = [];
  const byKind = new Map();
  const blockStates = [];
  const allowedKinds = new Set(["creator_text", "news", "viewpoint_visual", "logic_card", "market_figure", "chart", "indicator", "metric", "countercase", "settlement"]);
  blocks.forEach((block, index) => {
    const path = `$.blocks[${index}]`;
    if (!isDict(block)) {
      errors.push(issue("BLOCK", path, "Block must be an object."));
      return;
    }
    const blockId = block.id;
    if (!/^B[1-9][0-9]*$/.test(pyStr(orEmpty(blockId)))) errors.push(issue("BLOCK_ID", `${path}.id`, "Block ID must use B<number>."));
    else if (blockIds.has(blockId)) errors.push(issue("BLOCK_ID_UNIQUE", `${path}.id`, "Block IDs must be unique."));
    else blockIds.add(blockId);
    const order = block.order;
    if (!pyInt(order) || Number(order) < 1) errors.push(issue("BLOCK_ORDER", `${path}.order`, "Block order must be a positive integer."));
    else blockOrders.push(Number(order));
    const kind = block.kind;
    if (!allowedKinds.has(kind)) errors.push(issue("BLOCK_KIND", `${path}.kind`, "Unsupported block kind."));
    else {
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(block);
    }
    if (!["supports", "challenges", "context", "settles"].includes(block.role)) errors.push(issue("BLOCK_ROLE", `${path}.role`, "Unsupported block role."));
    const blockState = block.state;
    if (!["ready", "conditional", "blocked"].includes(blockState)) errors.push(issue("BLOCK_STATE", `${path}.state`, "Unsupported block state."));
    else blockStates.push(blockState);
    for (const key of ["title", "summary"]) {
      if (!nonempty(block[key])) errors.push(issue("BLOCK_FIELD", `${path}.${key}`, `${key} is required.`));
    }
    const artifactRef = block.artifact_ref;
    if (artifactRef !== null && artifactRef !== undefined && !nonempty(artifactRef)) errors.push(issue("BLOCK_ARTIFACT_REF", `${path}.artifact_ref`, "Artifact ref must be null or a non-empty string."));
    const factRefs = stringList(block.fact_refs, `${path}.fact_refs`, errors);
    const sourceRefs = stringList(block.source_refs, `${path}.source_refs`, errors);
    if (kind === "news" && (factRefs.length === 0 || sourceRefs.length === 0)) errors.push(issue("NEWS_PROVENANCE", path, "News blocks require fact and source references."));
    const expectedRef = {
      viewpoint_visual: lineage.viewpoint_visual_ref,
      logic_card: lineage.logic_card_ref,
      market_figure: lineage.market_figure_ref,
      chart: lineage.chart_ref,
      indicator: lineage.indicator_pack_ref,
      settlement: lineage.settlement_claim_ref,
    }[kind];
    if (["viewpoint_visual", "logic_card", "market_figure", "chart", "indicator", "settlement"].includes(kind) && (!nonempty(expectedRef) || artifactRef !== expectedRef)) {
      errors.push(issue("BLOCK_LINEAGE_REF", `${path}.artifact_ref`, `${kind} block must reference its matching lineage artifact.`));
    }
    if (kind === "settlement" && block.role !== "settles") errors.push(issue("SETTLEMENT_ROLE", `${path}.role`, "Settlement block must use the settles role."));
  });

  const sortedOrders = [...blockOrders].sort((a, b) => a - b);
  const expectedOrders = Array.from({ length: blocks.length }, (_, index) => index + 1);
  if (blockOrders.length > 0 && JSON.stringify(sortedOrders) !== JSON.stringify(expectedOrders)) errors.push(issue("BLOCK_ORDER_CONTIGUOUS", "$.blocks", "Block orders must be unique and contiguous from 1."));
  const creatorBlocks = byKind.get("creator_text") ?? [];
  if (creatorBlocks.length !== 1) errors.push(issue("CREATOR_TEXT_BLOCK", "$.blocks", "Exactly one creator_text block is required."));
  else if (creatorBlocks[0].summary !== thesis.creator_text) errors.push(issue("CREATOR_TEXT_CHANGED", "$.blocks", "Creator text block must exactly match thesis.creator_text."));
  for (const kind of ["viewpoint_visual", "logic_card", "market_figure", "chart", "indicator"]) {
    if ((byKind.get(kind) ?? []).length > 1) errors.push(issue("COMPACT_BLOCK_LIMIT", "$.blocks", `Compact cards allow at most one ${kind} block.`));
  }

  let settlement = payload.settlement;
  if (!isDict(settlement)) {
    errors.push(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."));
    settlement = {};
  }
  const settleable = settlement.settleable;
  if (typeof settleable !== "boolean") errors.push(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."));
  const settlementState = settlement.state;
  if (!["not_applicable", "draft", "needs_confirmation", "ready", "frozen"].includes(settlementState)) errors.push(issue("SETTLEMENT_STATE", "$.settlement.state", "Unsupported settlement state."));
  if (settleable) {
    if (deadlineAt === null || deadlineAt === undefined || !nonempty(deadlineLabel)) errors.push(issue("SETTLEMENT_DEADLINE", "$.header", "A settleable card requires a deadline and public deadline label."));
    if (!nonempty(settlement.claim_ref) || !nonempty(settlement.one_line)) errors.push(issue("SETTLEMENT_CONTRACT", "$.settlement", "Settleable cards require a claim ref and one-line rule."));
    if (settlementState === "not_applicable") errors.push(issue("SETTLEMENT_APPLICABILITY", "$.settlement.state", "Settleable card cannot be not_applicable."));
    if ((byKind.get("settlement") ?? []).length !== 1) errors.push(issue("SETTLEMENT_BLOCK", "$.blocks", "Settleable cards require exactly one settlement block."));
    if (["outperform", "underperform"].includes(direction) && nonempty(benchmarkTicker) && !pyStr(orEmpty(settlement.one_line)).includes(benchmarkTicker)) errors.push(issue("SETTLEMENT_BENCHMARK", "$.settlement.one_line", "Relative settlement line must name the benchmark ticker."));
  } else if (settlementState !== "not_applicable") errors.push(issue("NON_SETTLEABLE_STATE", "$.settlement.state", "Non-settleable cards must use not_applicable."));

  let disclosures = payload.disclosures;
  if (!isDict(disclosures)) {
    errors.push(issue("DISCLOSURES", "$.disclosures", "Disclosures must be an object."));
    disclosures = {};
  }
  const disclosureValues = {
    position_status: new Set(["known", "none", "unknown"]),
    commercial_status: new Set(["known", "none", "unknown"]),
    identity_status: new Set(["known", "unknown"]),
    ai_assistance_status: new Set(["disclosed", "not_used", "unknown"]),
  };
  for (const [key, allowed] of Object.entries(disclosureValues)) {
    if (!allowed.has(disclosures[key])) errors.push(issue("DISCLOSURE_FIELD", `$.disclosures.${key}`, `Unsupported ${key}.`));
  }
  stringList(disclosures.public_lines, "$.disclosures.public_lines", errors);

  let quality = payload.quality_report;
  if (!isDict(quality)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    quality = {};
  }
  const decision = quality.decision;
  if (!["ready", "conditional", "blocked"].includes(decision)) errors.push(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."));
  const qualityWarnings = stringList(quality.warnings, "$.quality_report.warnings", errors);
  const hardFailures = stringList(quality.hard_failures, "$.quality_report.hard_failures", errors);
  if (hardFailures.length > 0 && decision !== "blocked") errors.push(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."));
  if (blockStates.includes("blocked") && decision !== "blocked") errors.push(issue("BLOCKED_BLOCK_CARD", "$.quality_report.decision", "A blocked block blocks the card."));
  if (blockStates.includes("conditional") && ["ready", "frozen"].includes(state)) errors.push(issue("CONDITIONAL_BLOCK_CARD", "$.state", "A conditional block prevents a ready or frozen card."));
  if (state === "conditional" && (decision !== "conditional" || qualityWarnings.length === 0)) errors.push(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional cards require a conditional decision and warning."));
  if (["ready", "frozen"].includes(state)) {
    if (decision !== "ready" || qualityWarnings.length > 0 || hardFailures.length > 0) errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen cards require clean ready quality."));
    if ([disclosures.position_status, disclosures.commercial_status, disclosures.identity_status, disclosures.ai_assistance_status].some((value) => value === "unknown")) errors.push(issue("READY_DISCLOSURES", "$.disclosures", "Ready or frozen cards require resolved disclosures."));
    if (settleable && !["ready", "frozen"].includes(settlementState)) errors.push(issue("READY_SETTLEMENT", "$.settlement.state", "Ready or frozen settleable cards require ready settlement."));
  }
  if (decision === "blocked" && hardFailures.length === 0 && !blockStates.includes("blocked")) errors.push(issue("BLOCKED_WITHOUT_CAUSE", "$.quality_report", "Blocked decision requires a hard failure or blocked block."));

  if (state === "conditional") warnings.push(issue("CONDITIONAL_PREVIEW", "$.state", "Preview is usable for editing but cannot be frozen or published yet."));
  return { valid: errors.length === 0, errors, warnings };
}

function parseArgs(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write("usage: validate_viewpoint_card.mjs [-h] path\n");
    process.exit(0);
  }
  if (argv.length !== 1) {
    process.stderr.write("usage: validate_viewpoint_card.mjs [-h] path\n");
    process.exit(2);
  }
  return argv[0];
}

function main() {
  const path = parseArgs(process.argv.slice(2));
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("READ", "$", error.message)], warnings: [] }, null, 2)}\n`);
    return 1;
  }
  const result = validate(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();

if (isMain) process.exit(main());
