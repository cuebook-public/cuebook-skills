#!/usr/bin/env node
// Validate ContentProgramV1 topology, routing, and measurement invariants.
// Port of validate_content_program.py; error codes, paths, messages, JSON
// output shape, and exit codes are contract and stay byte-compatible with the
// Python original.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = new Set([
  "schema_version",
  "program_id",
  "generated_at",
  "brief",
  "topology",
  "items",
  "release_strategy",
  "measurement_plan",
  "quality_report",
]);
const TOPOLOGIES = new Set(["single", "anchor_and_derivatives", "serial", "event_lifecycle", "community_loop", "evergreen_series"]);
const STRATEGIES = new Set(["single_channel", "staggered", "synchronized", "anchor_then_derivatives", "event_triggered"]);
const RENDERERS = new Set(["compact_text", "structured_media", "manual_authoring"]);
const COMPACT_TEXT_PLATFORMS = new Set(["x", "telegram", "xiaohongshu", "buy_side"]);
const STRUCTURED_MEDIA_PLATFORMS = new Set(["generic", "website", "reddit", "xiaohongshu", "douyin", "seeking_alpha"]);
// Python \b is Unicode-aware; emulate its word boundary with letter/digit/_
// lookarounds so CJK neighbours suppress matches exactly like re does.
const HYPE_PATTERN = /(?<![\p{L}\p{N}_])(?:viral|guaranteed reach|best posting time)(?![\p{L}\p{N}_])|爆款|保证流量|最佳发布时间/iu;

export function issue(code, path, message) {
  return { code, path, message };
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Python truthiness for JSON values (None/False/0/""/[]/{} are falsy).
function pyTruthy(value) {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function orElse(value, fallback) {
  return pyTruthy(value) ? value : fallback;
}

// Reproduce Python repr() for the JSON value types that appear in messages.
function pyrepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const hasSingle = value.includes("'");
    const hasDouble = value.includes('"');
    const quote = hasSingle && !hasDouble ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyrepr).join(", ")}]`;
  if (typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`);
    return `{${parts.join(", ")}}`;
  }
  return String(value);
}

function pyStr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

// Python == structural equality for JSON values.
function pyEq(a, b) {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === nb) return true;
  if (typeof na !== typeof nb) return false;
  if (Array.isArray(na) && Array.isArray(nb)) {
    return na.length === nb.length && na.every((item, index) => pyEq(item, nb[index]));
  }
  if (isDict(na) && isDict(nb)) {
    const ka = Object.keys(na);
    const kb = Object.keys(nb);
    if (ka.length !== kb.length) return false;
    return ka.every((key) => Object.hasOwn(nb, key) && pyEq(na[key], nb[key]));
  }
  return false;
}

// json.dumps(value, ensure_ascii=False) with default ", "/": " separators.
function pyJsonDumps(value) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pyJsonDumps).join(", ")}]`;
  return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`).join(", ")}}`;
}

function daysInMonth(year, month) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function utcEpochUs(year, month, day, hour, minute, second, micro) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime() * 1000 + micro;
}

function parseClock(text) {
  const m = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?|(\d{2})(?:(\d{2})(?:[.,](\d+))?)?)?$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? m[5] ?? "0");
  const s = Number(m[3] ?? m[6] ?? "0");
  const frac = m[4] ?? m[7] ?? "";
  const us = frac ? Number(frac.slice(0, 6).padEnd(6, "0")) : 0;
  return { h, mi, s, us };
}

// Emulate datetime.fromisoformat() for the formats Cuebook artifacts use.
// Returns {us, hasTz} (microseconds since epoch, naive read as UTC) or null.
function parseIsoDatetime(value) {
  if (typeof value !== "string") return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  let rest;
  if (m) {
    rest = value.slice(10);
  } else {
    m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    rest = value.slice(8);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  if (rest === "") return { us: utcEpochUs(year, month, day, 0, 0, 0, 0), hasTz: false };
  const timeText = rest.slice(1);
  if (timeText === "") return null;
  let tzIndex = -1;
  for (let index = 0; index < timeText.length; index += 1) {
    const ch = timeText[index];
    if (ch === "Z" || ch === "z" || ch === "+" || ch === "-") {
      tzIndex = index;
      break;
    }
  }
  const clockText = tzIndex === -1 ? timeText : timeText.slice(0, tzIndex);
  const tzText = tzIndex === -1 ? null : timeText.slice(tzIndex);
  const clock = parseClock(clockText);
  if (!clock || clock.h > 23 || clock.mi > 59 || clock.s > 59) return null;
  let offsetUs = 0;
  let hasTz = false;
  if (tzText !== null) {
    hasTz = true;
    if (tzText === "Z" || tzText === "z") {
      offsetUs = 0;
    } else {
      const sign = tzText[0] === "-" ? -1 : 1;
      const offset = parseClock(tzText.slice(1));
      if (!offset || offset.mi > 59 || offset.s > 59) return null;
      offsetUs = sign * (((offset.h * 60 + offset.mi) * 60 + offset.s) * 1e6 + offset.us);
      if (Math.abs(offsetUs) >= 24 * 3600 * 1e6) return null;
    }
  }
  const us = utcEpochUs(year, month, day, clock.h, clock.mi, clock.s, clock.us) - offsetUs;
  return { us, hasTz };
}

function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const candidate = text.endsWith("Z") ? text.slice(0, -1) + "+00:00" : text;
  const parsed = parseIsoDatetime(candidate);
  if (parsed === null) return null;
  return parsed;
}

function findCycle(nodes, edges) {
  const state = new Map([...nodes].map((node) => [node, 0]));
  const stack = [];

  function visit(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dependency of edges.get(node) ?? new Set()) {
      if (!state.has(dependency)) continue;
      if (state.get(dependency) === 1) {
        const start = stack.indexOf(dependency);
        return [...stack.slice(start), dependency];
      }
      if (state.get(dependency) === 0) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  }

  for (const node of [...nodes].sort()) {
    if (state.get(node) === 0) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function validate(item) {
  const errors = [];
  const warnings = [];
  if (!isDict(item)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "ContentProgramV1 must be an object.")], warnings: [] };
  }

  const itemKeys = new Set(Object.keys(item));
  for (const key of [...REQUIRED].filter((entry) => !itemKeys.has(entry)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  if (item.schema_version !== "content-program.v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-program.v1."));
  }
  if (!/^content_program_[a-f0-9]{16}$/.test(pyStr(orElse(item.program_id, "")))) {
    errors.push(issue("PROGRAM_ID", "$.program_id", "program_id must contain a stable 16-character lowercase hex suffix."));
  }
  if (parseTime(item.generated_at) === null) {
    errors.push(issue("GENERATED_AT", "$.generated_at", "generated_at must be a parseable timestamp."));
  }

  let brief = item.brief;
  if (!isDict(brief)) {
    errors.push(issue("BRIEF_TYPE", "$.brief", "brief must be an object."));
    brief = {};
  }
  const sourceRefsRaw = brief.source_refs;
  const sourceRefs = Array.isArray(sourceRefsRaw)
    ? new Set(sourceRefsRaw.filter((value) => typeof value === "string" && value.trim()))
    : new Set();
  if (!sourceRefs.size) {
    errors.push(issue("SOURCE_BOUNDARY", "$.brief.source_refs", "A content program requires at least one stable source reference."));
  }
  const requestedRaw = brief.requested_platforms;
  const requested = Array.isArray(requestedRaw)
    ? new Set(requestedRaw.filter((value) => typeof value === "string" && value.trim()))
    : new Set();
  if (!requested.size) {
    errors.push(issue("REQUESTED_PLATFORMS", "$.brief.requested_platforms", "At least one requested platform is required."));
  }
  const horizonStart = parseTime(brief.horizon_start);
  const horizonEnd = parseTime(brief.horizon_end);
  if (pyTruthy(brief.horizon_start) && horizonStart === null) {
    errors.push(issue("HORIZON_START", "$.brief.horizon_start", "horizon_start must be parseable or null."));
  }
  if (pyTruthy(brief.horizon_end) && horizonEnd === null) {
    errors.push(issue("HORIZON_END", "$.brief.horizon_end", "horizon_end must be parseable or null."));
  }
  if (horizonStart && horizonEnd && horizonEnd.us <= horizonStart.us) {
    errors.push(issue("HORIZON_ORDER", "$.brief.horizon_end", "horizon_end must follow horizon_start."));
  }

  let topology = item.topology;
  if (!isDict(topology)) {
    errors.push(issue("TOPOLOGY_TYPE", "$.topology", "topology must be an object."));
    topology = {};
  }
  const topologyMode = topology.mode;
  if (!TOPOLOGIES.has(topologyMode)) {
    errors.push(issue("TOPOLOGY_MODE", "$.topology.mode", "Unsupported topology mode."));
  }

  let itemsRaw = item.items;
  if (!Array.isArray(itemsRaw) || !itemsRaw.length) {
    errors.push(issue("ITEMS", "$.items", "items must be a non-empty array."));
    itemsRaw = [];
  }

  const items = new Map();
  const edges = new Map();
  const duplicateKeys = new Map();
  itemsRaw.forEach((entry, index) => {
    const path = `$.items[${index}]`;
    if (!isDict(entry)) {
      errors.push(issue("ITEM_TYPE", path, "Each content item must be an object."));
      return;
    }
    const itemId = pyStr(orElse(entry.item_id, "")).trim();
    if (!/^content_item_[A-Za-z0-9_-]+$/.test(itemId)) {
      errors.push(issue("ITEM_ID", `${path}.item_id`, "item_id must use the content_item_ prefix."));
    } else if (items.has(itemId)) {
      errors.push(issue("DUPLICATE_ITEM_ID", `${path}.item_id`, `Duplicate item ID ${itemId}.`));
    }
    items.set(itemId, entry);
    const platform = entry.platform;
    const renderer = entry.renderer;
    if (!requested.has(platform)) {
      errors.push(issue("PLATFORM_SCOPE", `${path}.platform`, "Item platform is outside brief.requested_platforms."));
    }
    if (!RENDERERS.has(renderer)) {
      errors.push(issue("RENDERER_VALUE", `${path}.renderer`, "renderer must name a stable rendering capability, not an implementation skill."));
    }
    if (renderer === "compact_text" && !COMPACT_TEXT_PLATFORMS.has(platform)) {
      errors.push(issue("RENDERER_ROUTE", `${path}.renderer`, `Compact text rendering does not own ${pyrepr(platform)}.`));
    }
    if (renderer === "structured_media" && !STRUCTURED_MEDIA_PLATFORMS.has(platform)) {
      errors.push(issue("RENDERER_ROUTE", `${path}.renderer`, `Structured media rendering does not own ${pyrepr(platform)}.`));
    }
    if (platform === "reddit" && !pyStr(orElse(entry.target_context, "")).trim()) {
      errors.push(issue("COMMUNITY_CONTEXT", `${path}.target_context`, "Reddit planning requires a named community."));
    }
    if (entry.wording_reuse_allowed !== false) {
      errors.push(issue("WORDING_REUSE", `${path}.wording_reuse_allowed`, "Cross-channel wording reuse must remain false."));
    }
    const entrySources = entry.source_refs;
    if (!Array.isArray(entrySources) || !entrySources.length) {
      errors.push(issue("ITEM_SOURCE_REFS", `${path}.source_refs`, "Each item requires bounded source references."));
    } else if (entrySources.some((ref) => !sourceRefs.has(ref))) {
      errors.push(issue("UNKNOWN_SOURCE_REF", `${path}.source_refs`, "Item source_refs must be declared in brief.source_refs."));
    }
    if (!pyStr(orElse(entry.editorial_job, "")).trim()) {
      errors.push(issue("EDITORIAL_JOB", `${path}.editorial_job`, "Each item needs one explicit editorial job."));
    }
    let dependencies = entry.depends_on;
    if (!Array.isArray(dependencies)) {
      errors.push(issue("DEPENDENCY_TYPE", `${path}.depends_on`, "depends_on must be an array."));
      dependencies = [];
    }
    edges.set(itemId, new Set(dependencies.filter((value) => typeof value === "string")));
    const dedupeKey = JSON.stringify([
      pyStr(platform),
      pyStr(entry.format),
      pyStr(orElse(entry.target_context, "")),
      pyStr(orElse(entry.editorial_job, "")).trim().toLowerCase(),
    ]);
    if (duplicateKeys.has(dedupeKey)) {
      warnings.push(issue("DUPLICATE_EDITORIAL_JOB", path, `This item duplicates the job of ${duplicateKeys.get(dedupeKey)}.`));
    } else {
      duplicateKeys.set(dedupeKey, itemId);
    }
  });

  const itemIds = new Set(items.keys());
  for (const [itemId, entry] of items) {
    const parent = entry.parent_item_id === undefined ? null : entry.parent_item_id;
    if (parent !== null && !itemIds.has(parent)) {
      errors.push(issue("UNKNOWN_PARENT", `$.items[${itemId}].parent_item_id`, "parent_item_id does not exist."));
    }
    if (pyEq(parent, itemId)) {
      errors.push(issue("SELF_PARENT", `$.items[${itemId}].parent_item_id`, "An item cannot parent itself."));
    }
    const itemEdges = edges.get(itemId) ?? new Set();
    const unknownDependencies = [...itemEdges].filter((value) => !itemIds.has(value));
    if (unknownDependencies.length) {
      errors.push(issue("UNKNOWN_DEPENDENCY", `$.items[${itemId}].depends_on`, `Unknown dependencies: ${pyrepr(unknownDependencies.sort())}.`));
    }
    if (itemEdges.has(itemId)) {
      errors.push(issue("SELF_DEPENDENCY", `$.items[${itemId}].depends_on`, "An item cannot depend on itself."));
    }
  }

  const cycle = findCycle(itemIds, edges);
  if (cycle) {
    errors.push(issue("DEPENDENCY_CYCLE", "$.items", "Dependency cycle: " + cycle.join(" -> ")));
  }

  const anchorId = topology.anchor_item_id === undefined ? null : topology.anchor_item_id;
  if (topologyMode === "single" && items.size !== 1) {
    errors.push(issue("SINGLE_COUNT", "$.items", "single topology requires exactly one item."));
  }
  if (topologyMode === "anchor_and_derivatives") {
    if (!items.has(anchorId) || (items.get(anchorId) ?? {}).role !== "anchor") {
      errors.push(issue("ANCHOR_REQUIRED", "$.topology.anchor_item_id", "anchor_and_derivatives requires a valid anchor-role item."));
    }
    if (items.size < 2 || ![...items.values()].some((entry) => pyEq(entry.parent_item_id, anchorId))) {
      errors.push(issue("DERIVATIVE_REQUIRED", "$.items", "anchor_and_derivatives requires at least one child of the anchor."));
    }
  } else if (anchorId !== null) {
    warnings.push(issue("UNUSED_ANCHOR", "$.topology.anchor_item_id", "Only anchor_and_derivatives uses anchor_item_id."));
  }
  if (topologyMode === "serial" && items.size < 2) {
    errors.push(issue("SERIAL_COUNT", "$.items", "serial topology requires at least two items."));
  }
  if (topologyMode === "event_lifecycle") {
    if (parseTime(topology.event_expiry) === null) {
      errors.push(issue("EVENT_EXPIRY", "$.topology.event_expiry", "event_lifecycle requires a parseable event expiry."));
    }
    if (![...items.values()].some((entry) => ["update", "recap"].includes(entry.role))) {
      errors.push(issue("EVENT_UPDATE", "$.items", "event_lifecycle requires an update or recap item."));
    }
  }
  if (topologyMode === "community_loop") {
    const roles = new Set([...items.values()].map((entry) => entry.role));
    if (!["discussion", "reply"].every((role) => roles.has(role))) {
      errors.push(issue("COMMUNITY_LOOP_ROLES", "$.items", "community_loop requires discussion and reply roles."));
    }
    if ([...items.values()].some((entry) => !pyStr(orElse(entry.target_context, "")).trim())) {
      errors.push(issue("COMMUNITY_LOOP_CONTEXT", "$.items", "Every community-loop item needs target_context."));
    }
  }
  if (topologyMode === "evergreen_series") {
    if (items.size < 2) {
      errors.push(issue("EVERGREEN_COUNT", "$.items", "evergreen_series requires at least two items."));
    }
    if ([...items.values()].some((entry) => entry.temporal_mode !== "evergreen")) {
      errors.push(issue("EVERGREEN_TEMPORAL_MODE", "$.items", "Every evergreen-series item must use temporal_mode evergreen."));
    }
  }

  let strategy = item.release_strategy;
  if (!isDict(strategy)) {
    errors.push(issue("RELEASE_STRATEGY", "$.release_strategy", "release_strategy must be an object."));
    strategy = {};
  }
  const strategyMode = strategy.mode;
  if (!STRATEGIES.has(strategyMode)) {
    errors.push(issue("RELEASE_STRATEGY_MODE", "$.release_strategy.mode", "Unsupported release strategy."));
  }
  let relativeOrder = strategy.relative_order;
  if (!Array.isArray(relativeOrder) || relativeOrder.length !== new Set(relativeOrder).size) {
    errors.push(issue("RELATIVE_ORDER", "$.release_strategy.relative_order", "relative_order must contain unique item IDs."));
    relativeOrder = [];
  }
  const relativeSet = new Set(relativeOrder);
  const orderCoverageMatches = relativeSet.size === itemIds.size && [...relativeSet].every((value) => itemIds.has(value));
  if (!orderCoverageMatches) {
    errors.push(issue("RELATIVE_ORDER_COVERAGE", "$.release_strategy.relative_order", "relative_order must contain every item exactly once."));
  }
  const positions = new Map(relativeOrder.map((value, index) => [value, index]));
  for (const [itemId, dependencies] of edges) {
    for (const dependency of dependencies) {
      if (positions.has(itemId) && positions.has(dependency) && positions.get(dependency) >= positions.get(itemId)) {
        errors.push(issue("RELATIVE_ORDER_DEPENDENCY", "$.release_strategy.relative_order", `${dependency} must precede ${itemId}.`));
      }
    }
  }
  if (strategyMode === "synchronized" && [...edges.values()].some((value) => value.size)) {
    errors.push(issue("SYNCHRONIZED_DEPENDENCY", "$.release_strategy.mode", "Dependent items cannot use synchronized release."));
  }
  if (topologyMode === "anchor_and_derivatives" && strategyMode === "anchor_then_derivatives" && positions.has(anchorId)) {
    if (positions.get(anchorId) !== 0) {
      errors.push(issue("ANCHOR_ORDER", "$.release_strategy.relative_order", "The anchor must be first."));
    }
  }

  let measurement = item.measurement_plan;
  if (!isDict(measurement)) {
    errors.push(issue("MEASUREMENT_PLAN", "$.measurement_plan", "measurement_plan must be an object."));
    measurement = {};
  }
  const questionIds = new Set();
  orElse(measurement.questions, []).forEach((question, index) => {
    const path = `$.measurement_plan.questions[${index}]`;
    if (!isDict(question)) {
      errors.push(issue("MEASUREMENT_QUESTION", path, "Measurement question must be an object."));
      return;
    }
    const questionId = pyStr(orElse(question.question_id, ""));
    if (questionIds.has(questionId)) {
      errors.push(issue("DUPLICATE_QUESTION_ID", `${path}.question_id`, "Measurement question IDs must be unique."));
    }
    questionIds.add(questionId);
    const refs = question.item_ids;
    if (!Array.isArray(refs) || refs.some((ref) => !itemIds.has(ref))) {
      errors.push(issue("MEASUREMENT_ITEM_REF", `${path}.item_ids`, "Measurement item_ids must reference planned items."));
    }
  });
  const windowLabels = new Set();
  orElse(measurement.windows, []).forEach((window, index) => {
    const path = `$.measurement_plan.windows[${index}]`;
    if (!isDict(window)) {
      errors.push(issue("MEASUREMENT_WINDOW", path, "Measurement window must be an object."));
      return;
    }
    const label = pyStr(orElse(window.label, ""));
    if (windowLabels.has(label)) {
      errors.push(issue("DUPLICATE_WINDOW", `${path}.label`, "Measurement window labels must be unique."));
    }
    windowLabels.add(label);
  });

  const publicText = pyJsonDumps(item);
  if (HYPE_PATTERN.test(publicText)) {
    warnings.push(issue("PERFORMANCE_PROMISE", "$", "Remove unsupported virality, reach, or best-time claims."));
  }
  const quality = item.quality_report;
  if (!isDict(quality) || !["scores", "hard_failures", "revisions"].every((key) => Object.hasOwn(quality, key))) {
    errors.push(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."));
  }

  return { valid: !errors.length, errors, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  const positional = [];
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write("usage: validate_content_program.mjs [-h] [json_file]\n");
      process.exit(0);
    }
    if (arg.startsWith("--") && arg.length > 2) {
      process.stderr.write(`error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    }
    positional.push(arg);
  }
  if (positional.length > 1) {
    process.stderr.write(`error: unrecognized arguments: ${positional.slice(1).join(" ")}\n`);
    process.exit(2);
  }
  const raw = positional.length ? readFileSync(positional[0], "utf-8") : readFileSync(0, "utf-8");
  const payload = JSON.parse(raw);
  const output = Array.isArray(payload) ? payload.map((entry) => validate(entry)) : validate(payload);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  const results = Array.isArray(output) ? output : [output];
  process.exit(results.every((result) => result.valid) ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
