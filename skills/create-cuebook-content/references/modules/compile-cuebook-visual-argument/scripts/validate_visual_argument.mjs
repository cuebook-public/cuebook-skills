#!/usr/bin/env node
// Validate VisualArgumentV1 graph, provenance, grammar, settlement, and state.
// Port of validate_visual_argument.py; error codes, paths, message formats, and
// JSON output shape are contract and must stay byte-compatible with the Python
// original.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const GRAMMARS = new Set(["causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison", "price_timeline"]);
const JOB_GRAMMAR = new Map([
  ["explain_cause", "causal_chain"],
  ["show_metrics", "metric_thesis"],
  ["map_scenarios", "scenario_tree"],
  ["weigh_evidence", "evidence_balance"],
  ["compare_assets", "comparison"],
  ["show_price_path", "price_timeline"],
]);

export function issue(code, path, message) {
  return { code, path, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Python truthiness for JSON values (None/False/0/""/[]/{} are falsy).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// str(value or "") as used by the Python original ahead of regex full matches.
// Non-string values are rendered so they can never match the ID patterns,
// mirroring Python's str() of non-string JSON values.
function strOrEmpty(value) {
  if (!pyTruthy(value)) return "";
  if (typeof value === "string") return value;
  if (value === true) return "True";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function fullmatch(pattern, value) {
  return pattern.test(strOrEmpty(value));
}

export function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
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

// Time portion of ISO-8601 in extended (HH[:MM[:SS[.ffff]]]) or compact
// (HH[MM[SS[.ffff]]]) form; fractions accept "." or "," and any digit count,
// truncated to microseconds like datetime.fromisoformat.
const TIME_EXTENDED = /^(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/;
const TIME_COMPACT = /^(\d{2})(\d{2})(?:(\d{2})(?:[.,](\d+))?)?$/;

function parseTimeOfDay(text) {
  const match = TIME_EXTENDED.exec(text) ?? TIME_COMPACT.exec(text);
  if (!match) return null;
  const [, hour, minute, second, fraction] = match;
  return {
    hour: Number(hour),
    minute: Number(minute ?? "0"),
    second: Number(second ?? "0"),
    fractionUs: fraction ? Number(fraction.slice(0, 6).padEnd(6, "0")) : 0,
  };
}

// Mirrors datetime.fromisoformat acceptance (Python 3.11+): calendar date in
// extended or compact form, any single separator character, extended/compact
// time, optional UTC offset, hour 24 wrapping to midnight. ISO week dates and
// fractional offset seconds are not supported.
function parseIsoDatetime(normalized) {
  let dateText;
  let rest;
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    dateText = normalized.slice(0, 10);
    rest = normalized.slice(10);
  } else if (/^\d{8}/.test(normalized)) {
    dateText = normalized.slice(0, 8);
    rest = normalized.slice(8);
  } else {
    return null;
  }
  const digits = dateText.replaceAll("-", "");
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  let time = { hour: 0, minute: 0, second: 0, fractionUs: 0 };
  let offsetMinutes = null;
  if (rest.length) {
    rest = rest.slice(1); // Any single character is accepted as the separator.
    let tzIndex = -1;
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "+" || rest[i] === "-") {
        tzIndex = i;
        break;
      }
    }
    time = parseTimeOfDay(tzIndex === -1 ? rest : rest.slice(0, tzIndex));
    if (time === null) return null;
    if (tzIndex !== -1) {
      const offset = parseTimeOfDay(rest.slice(tzIndex + 1));
      if (offset === null || offset.fractionUs !== 0) return null;
      if (offset.hour >= 24 || offset.minute >= 60 || offset.second >= 60) return null;
      const sign = rest[tzIndex] === "-" ? -1 : 1;
      offsetMinutes = sign * (offset.hour * 60 + offset.minute + offset.second / 60);
    }
  }
  let wrapMs = 0;
  if (time.hour === 24 && time.minute === 0 && time.second === 0 && time.fractionUs === 0) {
    time = { hour: 0, minute: 0, second: 0, fractionUs: 0 };
    wrapMs = 86400000;
  }
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(time.hour, time.minute, time.second, 0);
  const valid =
    year >= 1 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    time.hour < 24 &&
    time.minute < 60 &&
    time.second < 60;
  if (!valid) return null;
  return { epochMs: probe.getTime() + wrapMs + time.fractionUs / 1000, offsetMinutes };
}

// Returns the timestamp as (possibly fractional) milliseconds since the epoch,
// or null. Mirrors parse_time in the Python original: aware datetimes only.
export function parseTime(value, path, errors, nullable = false) {
  if ((value === null || value === undefined) && nullable) return null;
  if (!nonempty(value)) {
    errors.push(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."));
    return null;
  }
  const parsed = parseIsoDatetime(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("DATETIME", path, "Invalid ISO-8601 datetime."));
    return null;
  }
  if (parsed.offsetMinutes === null) {
    errors.push(issue("DATETIME_TZ", path, "Datetime must include a timezone."));
    return null;
  }
  return parsed.epochMs - parsed.offsetMinutes * 60000;
}

export function hasDirectedCycle(nodeIds, edges) {
  const adjacency = new Map();
  for (const nodeId of nodeIds) adjacency.set(nodeId, []);
  for (const [source, target] of edges) {
    if (adjacency.has(source)) adjacency.get(source).push(target);
  }
  const visiting = new Set();
  const visited = new Set();

  function visit(nodeId) {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const target of adjacency.get(nodeId)) {
      if (adjacency.has(target) && visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const nodeId of nodeIds) {
    if (visit(nodeId)) return true;
  }
  return false;
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) {
    return { valid: false, errors: [issue("ROOT", "$", "Expected a JSON object.")], warnings: [] };
  }

  if (payload.schema_version !== "visual-argument-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected visual-argument-v1."));
  }
  if (!fullmatch(/^VARG_[A-Za-z0-9_:-]{8,}$/, payload.argument_id)) {
    errors.push(issue("ARGUMENT_ID", "$.argument_id", "Invalid visual argument ID."));
  }
  const revision = payload.revision;
  // Python isinstance(x, int) admits booleans; True compares equal to 1.
  if (!(Number.isInteger(revision) || typeof revision === "boolean") || revision < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }
  const state = payload.state;
  if (!new Set(["draft", "conditional", "ready", "frozen"]).has(state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }

  let lineage = payload.lineage;
  if (!isObject(lineage)) {
    errors.push(issue("LINEAGE", "$.lineage", "Lineage must be an object."));
    lineage = {};
  }
  const inputRefs = stringList(lineage.input_artifact_refs, "$.lineage.input_artifact_refs", errors);
  if (!inputRefs.length) {
    errors.push(issue("INPUT_REFS", "$.lineage.input_artifact_refs", "At least one input artifact is required."));
  }
  for (const key of ["post_ref", "creator_intent_ref", "thesis_ref", "research_pack_ref", "settlement_claim_ref"]) {
    const value = lineage[key];
    if (!(value === null || value === undefined) && !nonempty(value)) {
      errors.push(issue("LINEAGE_REF", `$.lineage.${key}`, "Reference must be null or non-empty."));
    }
    if (nonempty(value) && !inputRefs.includes(value)) {
      errors.push(issue("LINEAGE_INPUT", `$.lineage.${key}`, "Lineage ref must appear in input_artifact_refs."));
    }
  }
  const cutoff = parseTime(lineage.decision_cutoff_at, "$.lineage.decision_cutoff_at", errors);

  let subject = payload.subject;
  if (!isObject(subject)) {
    errors.push(issue("SUBJECT", "$.subject", "Subject must be an object."));
    subject = {};
  }
  const primary = subject.primary;
  if (!isObject(primary)) {
    errors.push(issue("PRIMARY", "$.subject.primary", "Primary instrument is required."));
  } else {
    for (const key of ["instrument_id", "ticker", "display_name"]) {
      if (!nonempty(primary[key])) {
        errors.push(issue("INSTRUMENT_FIELD", `$.subject.primary.${key}`, `${key} is required.`));
      }
    }
  }
  const benchmark = subject.benchmark;
  if (!(benchmark === null || benchmark === undefined)) {
    if (!isObject(benchmark)) {
      errors.push(issue("BENCHMARK", "$.subject.benchmark", "Benchmark must be null or an instrument."));
    } else {
      for (const key of ["instrument_id", "ticker", "display_name"]) {
        if (!nonempty(benchmark[key])) {
          errors.push(issue("BENCHMARK_FIELD", `$.subject.benchmark.${key}`, `${key} is required.`));
        }
      }
    }
  }
  const direction = subject.direction;
  if (!new Set(["long", "short", "outperform", "underperform", "range", "neutral", "custom"]).has(direction)) {
    errors.push(issue("DIRECTION", "$.subject.direction", "Unsupported direction."));
  }
  const horizon = parseTime(subject.horizon_end, "$.subject.horizon_end", errors, true);
  if (cutoff !== null && horizon !== null && horizon <= cutoff) {
    errors.push(issue("HORIZON_ORDER", "$.subject.horizon_end", "Horizon must be after the decision cutoff."));
  }
  if ((direction === "outperform" || direction === "underperform") && !isObject(benchmark)) {
    errors.push(issue("RELATIVE_BENCHMARK", "$.subject.benchmark", "Relative direction requires a benchmark."));
  }

  let frame = payload.frame;
  if (!isObject(frame)) {
    errors.push(issue("FRAME", "$.frame", "Frame must be an object."));
    frame = {};
  }
  for (const key of ["headline", "thesis"]) {
    if (!nonempty(frame[key])) {
      errors.push(issue("FRAME_FIELD", `$.frame.${key}`, `${key} is required.`));
    }
  }
  const creatorText = frame.creator_text;
  const creatorTextIsNull = creatorText === null || creatorText === undefined;
  if (!creatorTextIsNull && !nonempty(creatorText)) {
    errors.push(issue("CREATOR_TEXT", "$.frame.creator_text", "Creator text must be null or non-empty."));
  }
  if (!creatorTextIsNull && frame.creator_text_preserved !== true) {
    errors.push(issue("CREATOR_TEXT_PRESERVED", "$.frame.creator_text_preserved", "Creator text must remain verbatim."));
  }
  if (!(frame.cuebook_contribution === null || frame.cuebook_contribution === undefined) && !nonempty(frame.cuebook_contribution)) {
    errors.push(issue("CUEBOOK_CONTRIBUTION", "$.frame.cuebook_contribution", "Cuebook contribution must be null or non-empty."));
  }
  const visualJob = frame.visual_job;
  if (!JOB_GRAMMAR.has(visualJob)) {
    errors.push(issue("VISUAL_JOB", "$.frame.visual_job", "Unsupported visual job."));
  }

  let graph = payload.graph;
  if (!isObject(graph)) {
    errors.push(issue("GRAPH", "$.graph", "Graph must be an object."));
    graph = {};
  }
  let nodes = graph.nodes;
  if (!Array.isArray(nodes) || !(2 <= nodes.length && nodes.length <= 14)) {
    errors.push(issue("NODES", "$.graph.nodes", "Expected two to fourteen nodes."));
    nodes = [];
  }
  const nodeIds = new Set();
  const nodeKinds = new Set();
  const metricLinks = [];
  nodes.forEach((node, index) => {
    const path = `$.graph.nodes[${index}]`;
    if (!isObject(node)) {
      errors.push(issue("NODE", path, "Node must be an object."));
      return;
    }
    const nodeId = node.id;
    if (!fullmatch(/^N[1-9][0-9]*$/, nodeId)) {
      errors.push(issue("NODE_ID", `${path}.id`, "Node ID must use N<number>."));
    } else if (nodeIds.has(nodeId)) {
      errors.push(issue("NODE_ID_UNIQUE", `${path}.id`, "Node IDs must be unique."));
    } else {
      nodeIds.add(nodeId);
    }
    const kind = node.kind;
    if (!new Set(["event", "evidence", "mechanism", "actor_action", "market_effect", "metric", "condition", "countercase", "invalidation", "settlement"]).has(kind)) {
      errors.push(issue("NODE_KIND", `${path}.kind`, "Unsupported node kind."));
    } else {
      nodeKinds.add(kind);
    }
    if (!nonempty(node.label) || Array.from(node.label).length > 80) {
      errors.push(issue("NODE_LABEL", `${path}.label`, "Node label must be 1-80 characters."));
    }
    const status = node.status;
    if (!new Set(["observed", "derived", "conditional", "unresolved"]).has(status)) {
      errors.push(issue("NODE_STATUS", `${path}.status`, "Unsupported node status."));
    }
    const factRefs = stringList(node.fact_refs, `${path}.fact_refs`, errors);
    const sourceRefs = stringList(node.source_refs, `${path}.source_refs`, errors);
    if (status === "observed" && (!factRefs.length || !sourceRefs.length)) {
      errors.push(issue("OBSERVED_PROVENANCE", path, "Observed nodes require fact and source refs."));
    }
    if (status === "derived" && !factRefs.length) {
      errors.push(issue("DERIVED_PROVENANCE", path, "Derived nodes require supporting fact refs."));
    }
    const metricRef = node.metric_ref;
    if (kind === "metric") {
      if (!nonempty(metricRef)) {
        errors.push(issue("METRIC_NODE_REF", `${path}.metric_ref`, "Metric node requires metric_ref."));
      } else {
        metricLinks.push([path, metricRef]);
      }
    } else if (!(metricRef === null || metricRef === undefined)) {
      errors.push(issue("NON_METRIC_REF", `${path}.metric_ref`, "Only metric nodes may carry metric_ref."));
    }
  });

  let edges = graph.edges;
  if (!Array.isArray(edges) || !(1 <= edges.length && edges.length <= 20)) {
    errors.push(issue("EDGES", "$.graph.edges", "Expected one to twenty edges."));
    edges = [];
  }
  const edgeIds = new Set();
  const edgePairs = [];
  const connected = new Set();
  const relations = new Set();
  edges.forEach((edge, index) => {
    const path = `$.graph.edges[${index}]`;
    if (!isObject(edge)) {
      errors.push(issue("EDGE", path, "Edge must be an object."));
      return;
    }
    const edgeId = edge.id;
    if (!fullmatch(/^E[1-9][0-9]*$/, edgeId)) {
      errors.push(issue("EDGE_ID", `${path}.id`, "Edge ID must use E<number>."));
    } else if (edgeIds.has(edgeId)) {
      errors.push(issue("EDGE_ID_UNIQUE", `${path}.id`, "Edge IDs must be unique."));
    } else {
      edgeIds.add(edgeId);
    }
    const source = edge.from;
    const target = edge.to;
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      errors.push(issue("EDGE_NODE_REF", path, "Edge endpoints must reference known nodes."));
    } else if (source === target) {
      errors.push(issue("SELF_EDGE", path, "Self edges are not allowed."));
    } else {
      edgePairs.push([source, target]);
      connected.add(source);
      connected.add(target);
    }
    const relation = edge.relation;
    if (!new Set(["causes", "enables", "pressures", "confirms", "challenges", "conditions", "settles", "compares"]).has(relation)) {
      errors.push(issue("EDGE_RELATION", `${path}.relation`, "Unsupported relation."));
    } else {
      relations.add(relation);
    }
    if (!new Set(["observed", "inferred", "hypothesis"]).has(edge.certainty)) {
      errors.push(issue("EDGE_CERTAINTY", `${path}.certainty`, "Unsupported certainty."));
    }
  });
  const isolated = [...nodeIds].filter((nodeId) => !connected.has(nodeId)).sort();
  if (isolated.length) {
    // Mirrors Python's f"{sorted(node_ids - connected)}" list repr.
    errors.push(issue("ISOLATED_NODE", "$.graph", `Disconnected nodes: [${isolated.map((nodeId) => `'${nodeId}'`).join(", ")}].`));
  }
  if (hasDirectedCycle(nodeIds, edgePairs)) {
    errors.push(issue("GRAPH_CYCLE", "$.graph.edges", "Compact visual argument graph must be acyclic."));
  }

  let metrics = payload.metrics;
  if (!Array.isArray(metrics) || metrics.length > 8) {
    errors.push(issue("METRICS", "$.metrics", "Metrics must be an array with at most eight items."));
    metrics = [];
  }
  const metricIds = new Set();
  metrics.forEach((metric, index) => {
    const path = `$.metrics[${index}]`;
    if (!isObject(metric)) {
      errors.push(issue("METRIC", path, "Metric must be an object."));
      return;
    }
    const metricId = metric.id;
    if (!fullmatch(/^M[1-9][0-9]*$/, metricId) || metricIds.has(metricId)) {
      errors.push(issue("METRIC_ID", `${path}.id`, "Metric IDs must be unique M<number> values."));
    } else {
      metricIds.add(metricId);
    }
    for (const key of ["label", "display_value", "source_ref"]) {
      if (!nonempty(metric[key])) {
        errors.push(issue("METRIC_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    if (!new Set(["primary", "benchmark", "context"]).has(metric.subject_ref)) {
      errors.push(issue("METRIC_SUBJECT", `${path}.subject_ref`, "Metric subject must be primary, benchmark, or context."));
    }
    const metricTime = parseTime(metric.as_of, `${path}.as_of`, errors, true);
    if (cutoff !== null && metricTime !== null && metricTime > cutoff && metric.status !== "provisional") {
      errors.push(issue("POST_CUTOFF_METRIC", `${path}.as_of`, "Post-cutoff metric must remain provisional tracking evidence."));
    }
    if (!new Set(["verified", "provisional", "estimated"]).has(metric.status)) {
      errors.push(issue("METRIC_STATUS", `${path}.status`, "Unsupported metric status."));
    }
  });
  for (const [path, metricRef] of metricLinks) {
    if (!metricIds.has(metricRef)) {
      errors.push(issue("UNKNOWN_METRIC_REF", `${path}.metric_ref`, "Metric node references an unknown metric."));
    }
  }

  let levels = payload.levels;
  if (!Array.isArray(levels) || levels.length > 6) {
    errors.push(issue("LEVELS", "$.levels", "Levels must be an array with at most six items."));
    levels = [];
  }
  const levelIds = new Set();
  levels.forEach((level, index) => {
    const path = `$.levels[${index}]`;
    if (!isObject(level)) {
      errors.push(issue("LEVEL", path, "Level must be an object."));
      return;
    }
    const levelId = level.id;
    if (!fullmatch(/^L[1-9][0-9]*$/, levelId) || levelIds.has(levelId)) {
      errors.push(issue("LEVEL_ID", `${path}.id`, "Level IDs must be unique L<number> values."));
    } else {
      levelIds.add(levelId);
    }
    if (!new Set(["baseline", "target", "trigger", "invalidation", "range_lower", "range_upper"]).has(level.kind)) {
      errors.push(issue("LEVEL_KIND", `${path}.kind`, "Unsupported level kind."));
    }
    if (typeof level.value !== "number") {
      errors.push(issue("LEVEL_VALUE", `${path}.value`, "Level value must be numeric."));
    }
    for (const key of ["unit", "source_ref"]) {
      if (!nonempty(level[key])) {
        errors.push(issue("LEVEL_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    parseTime(level.observed_at, `${path}.observed_at`, errors, true);
    if (!new Set(["explicit", "derived"]).has(level.status)) {
      errors.push(issue("LEVEL_STATUS", `${path}.status`, "Unsupported level status."));
    }
  });

  let scenarios = payload.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length > 5) {
    errors.push(issue("SCENARIOS", "$.scenarios", "Scenarios must be an array with at most five items."));
    scenarios = [];
  }
  const scenarioIds = new Set();
  scenarios.forEach((scenario, index) => {
    const path = `$.scenarios[${index}]`;
    if (!isObject(scenario)) {
      errors.push(issue("SCENARIO", path, "Scenario must be an object."));
      return;
    }
    const scenarioId = scenario.id;
    if (!fullmatch(/^SC[1-9][0-9]*$/, scenarioId) || scenarioIds.has(scenarioId)) {
      errors.push(issue("SCENARIO_ID", `${path}.id`, "Scenario IDs must be unique SC<number> values."));
    } else {
      scenarioIds.add(scenarioId);
    }
    for (const key of ["label", "condition", "outcome"]) {
      if (!nonempty(scenario[key])) {
        errors.push(issue("SCENARIO_FIELD", `${path}.${key}`, `${key} is required.`));
      }
    }
    if (!new Set(["bull", "base", "bear", "risk"]).has(scenario.stance)) {
      errors.push(issue("SCENARIO_STANCE", `${path}.stance`, "Unsupported scenario stance."));
    }
    stringList(scenario.fact_refs, `${path}.fact_refs`, errors);
  });

  let settlement = payload.settlement;
  if (!isObject(settlement)) {
    errors.push(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."));
    settlement = {};
  }
  const settleable = settlement.settleable;
  if (typeof settleable !== "boolean") {
    errors.push(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."));
  }
  const deadline = parseTime(settlement.deadline_at, "$.settlement.deadline_at", errors, true);
  if (pyTruthy(settleable)) {
    if (!["claim_ref", "condition"].every((key) => nonempty(settlement[key])) || deadline === null) {
      errors.push(issue("SETTLEMENT_CONTRACT", "$.settlement", "Settleable argument requires claim ref, deadline, and condition."));
    }
    if (!new Set(["draft", "needs_confirmation", "ready", "frozen"]).has(settlement.state)) {
      errors.push(issue("SETTLEMENT_STATE", "$.settlement.state", "Settleable argument has invalid settlement state."));
    }
    if ((lineage.settlement_claim_ref ?? null) !== (settlement.claim_ref ?? null)) {
      errors.push(issue("SETTLEMENT_LINEAGE", "$.settlement.claim_ref", "Settlement claim must match lineage."));
    }
    if (horizon !== null && deadline !== null && horizon !== deadline) {
      errors.push(issue("SETTLEMENT_HORIZON", "$.settlement.deadline_at", "Settlement deadline must match subject horizon."));
    }
  } else {
    if (settlement.state !== "not_applicable" || ["claim_ref", "deadline_at", "condition"].some((key) => !(settlement[key] === null || settlement[key] === undefined))) {
      errors.push(issue("NON_SETTLEABLE", "$.settlement", "Non-settleable argument must use null fields and not_applicable state."));
    }
  }

  let visual = payload.visual;
  if (!isObject(visual)) {
    errors.push(issue("VISUAL", "$.visual", "Visual recommendation must be an object."));
    visual = {};
  }
  const grammar = visual.recommended_grammar;
  if (!GRAMMARS.has(grammar)) {
    errors.push(issue("GRAMMAR", "$.visual.recommended_grammar", "Unsupported visual grammar."));
  }
  const alternatives = stringList(visual.alternative_grammars, "$.visual.alternative_grammars", errors);
  if (alternatives.some((item) => !GRAMMARS.has(item))) {
    errors.push(issue("ALTERNATIVE_GRAMMAR", "$.visual.alternative_grammars", "Unsupported alternative grammar."));
  }
  if (alternatives.includes(grammar)) {
    errors.push(issue("DUPLICATE_GRAMMAR", "$.visual.alternative_grammars", "Primary grammar cannot also be an alternative."));
  }
  if (JOB_GRAMMAR.has(visualJob) && grammar !== JOB_GRAMMAR.get(visualJob)) {
    errors.push(issue("JOB_GRAMMAR_MISMATCH", "$.visual.recommended_grammar", "Visual grammar must match the stated visual job."));
  }
  if (!nonempty(visual.rationale)) {
    errors.push(issue("VISUAL_RATIONALE", "$.visual.rationale", "Grammar rationale is required."));
  }
  if (!new Set(["cuebook_light", "cuebook_dark"]).has(visual.theme)) {
    errors.push(issue("VISUAL_THEME", "$.visual.theme", "Unsupported Cuebook theme."));
  }

  if (grammar === "causal_chain" && !((nodeKinds.has("event") || nodeKinds.has("evidence")) && nodeKinds.has("mechanism") && nodeKinds.has("market_effect"))) {
    errors.push(issue("CAUSAL_GRAMMAR", "$.graph.nodes", "Causal chain requires evidence/event, mechanism, and market effect nodes."));
  }
  if (grammar === "metric_thesis" && metrics.length < 2) {
    errors.push(issue("METRIC_GRAMMAR", "$.metrics", "Metric thesis requires at least two metrics."));
  }
  if (grammar === "scenario_tree" && scenarios.length < 2) {
    errors.push(issue("SCENARIO_GRAMMAR", "$.scenarios", "Scenario tree requires at least two scenarios."));
  }
  if (grammar === "evidence_balance" && (!nodeKinds.has("countercase") || !(nodeKinds.has("evidence") || nodeKinds.has("event")) || !relations.has("challenges"))) {
    errors.push(issue("EVIDENCE_GRAMMAR", "$.graph", "Evidence balance requires evidence, countercase, and a challenges edge."));
  }
  if (grammar === "comparison" && !isObject(benchmark)) {
    errors.push(issue("COMPARISON_GRAMMAR", "$.subject.benchmark", "Comparison visual requires a comparison instrument."));
  }
  if (grammar === "price_timeline" && (!levels.length || !pyTruthy(settleable))) {
    errors.push(issue("PRICE_GRAMMAR", "$.visual.recommended_grammar", "Price timeline requires explicit levels and a settlement contract."));
  }

  let quality = payload.quality_report;
  if (!isObject(quality)) {
    errors.push(issue("QUALITY", "$.quality_report", "Quality report must be an object."));
    quality = {};
  }
  const decision = quality.decision;
  const qualityWarnings = stringList(quality.warnings, "$.quality_report.warnings", errors);
  const hardFailures = stringList(quality.hard_failures, "$.quality_report.hard_failures", errors);
  if (hardFailures.length && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."));
  }
  if (state === "conditional" && (decision !== "conditional" || !qualityWarnings.length)) {
    errors.push(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional state requires a conditional decision and warning."));
  }
  if ((state === "ready" || state === "frozen") && (decision !== "ready" || qualityWarnings.length || hardFailures.length)) {
    errors.push(issue("READY_STATE", "$.quality_report", "Ready or frozen state requires clean ready quality."));
  }
  if (decision === "blocked" && !hardFailures.length) {
    errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked decision requires a hard failure."));
  }

  if (nodes.some((node) => isObject(node) && (node.status === "conditional" || node.status === "unresolved"))) {
    warnings.push(issue("CONDITIONAL_LOGIC", "$.graph.nodes", "Visual contains conditional or unresolved logic and must preserve its visual state."));
  }
  return { valid: !errors.length, errors, warnings };
}

export function main(argv = process.argv.slice(2)) {
  const prog = basename(process.argv[1] ?? "validate_visual_argument.mjs");
  const positional = argv.filter((arg) => arg !== "-h" && arg !== "--help");
  if (argv.length !== positional.length) {
    process.stdout.write(`usage: ${prog} [-h] path\n\nValidate VisualArgumentV1 graph, provenance, grammar, settlement, and state.\n`);
    return 0;
  }
  if (positional.length !== 1) {
    const detail = positional.length === 0 ? "the following arguments are required: path" : `unrecognized arguments: ${positional.slice(1).join(" ")}`;
    process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: ${detail}\n`);
    return 2;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(positional[0], "utf-8"));
  } catch (exc) {
    process.stdout.write(`${JSON.stringify({ valid: false, errors: [issue("READ", "$", String(exc.message ?? exc))], warnings: [] }, null, 2)}\n`);
    return 1;
  }
  const result = validate(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.valid ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
