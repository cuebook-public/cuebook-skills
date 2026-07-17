#!/usr/bin/env node
// Validate CreatorWorkflowRunV1 DAG, state, artifact, and approval invariants.
// Port of validate_creator_workflow.py; error codes, paths, message formats, and
// the JSON output shape are contract and stay byte-compatible with the original.

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_FIELDS = new Set(["schema_version", "workflow_id", "feed_ref", "opportunity_set_ref", "recipe_ref", "catalog_version", "query_bundle_refs", "selected_opportunity_refs", "mode", "created_at", "as_of", "ruleset_version", "state", "nodes", "artifact_registry", "approvals", "state_events", "blockers", "quality_report"]);
const CAPABILITIES = new Map([
  ["normalize_feed", ["normalize-cuebook-creator-feed", "CreatorFeedV1"]],
  ["compose_recipe", ["compose-cuebook-content-recipe", "ContentRecipeV1"]],
  ["select_opportunities", ["select-cuebook-content-opportunities", "ContentOpportunitySetV1"]],
  ["validate_projection", ["validate-cuebook-projection", "GateV1"]],
  ["route_narrative", ["route-cuebook-narrative", "RouteV1"]],
  ["query_cuebook", ["query-cuebook", "CuebookQueryBundleV1"]],
  ["build_research_pack", ["build-market-research-pack", "ResearchPackV1"]],
  ["plan_content_program", ["plan-market-content-program", "ContentProgramV1"]],
  ["render_market_post", ["render-cuebook-market-post", "PostV1"]],
  ["render_market_media", ["render-cuebook-market-media", "MediaPackageV1"]],
  ["compile_settlement_claim", ["compile-cuebook-settlement-claim", "SettlementClaimV1"]],
  ["compile_settlement_formula", ["compile-cuebook-settlement-formula", "SettlementFormulaV1"]],
  ["prepare_release", ["prepare-market-content-release", "ReleaseBundleV1"]],
  ["publish_external", [null, "PublicationReceiptV1"]],
  ["reconcile_history", ["reconcile-market-content-history", "ContentHistoryLedgerV1"]],
]);
const MODES = new Set(["plan_only", "single", "batch", "event_lifecycle", "postmortem", "correction"]);
const NODE_STATES = new Set(["pending", "ready", "running", "completed", "blocked", "skipped", "deferred"]);
const CATALOG_VERSION = "1.27.0";
const GATE_SUMMARY_FIELDS = new Set(["quality_decision", "artifact_state", "unresolved_material_request_count"]);
const GATE_ARTIFACT_RULES = new Map([
  ["CuebookQueryBundleV1", {
    quality_decisions: new Set(["ready", "conditional", "blocked"]),
    artifact_states: new Set(["ready", "conditional", "blocked"]),
    ready_decisions: new Set(["ready"]),
    ready_states: new Set(["ready"]),
  }],
  ["ResearchPackV1", {
    quality_decisions: new Set(["ready", "conditional", "blocked"]),
    artifact_states: new Set(["ready", "conditional", "blocked"]),
    ready_decisions: new Set(["ready"]),
    ready_states: new Set(["ready"]),
  }],
  ["CreatorExpressionPlanV1", {
    quality_decisions: new Set(["ready", "conditional", "blocked"]),
    artifact_states: new Set(["draft", "conditional", "ready", "frozen"]),
    ready_decisions: new Set(["ready"]),
    ready_states: new Set(["ready", "frozen"]),
  }],
  ["ViewpointDataBundleV1", {
    quality_decisions: new Set(["ready", "conditional", "blocked"]),
    artifact_states: new Set(["ready", "conditional", "blocked"]),
    ready_decisions: new Set(["ready"]),
    ready_states: new Set(["ready"]),
  }],
  ["PublishCandidateSetV1", {
    quality_decisions: new Set(["ready_for_selection", "selected", "blocked"]),
    artifact_states: new Set(["draft", "ready_for_selection", "selected", "blocked"]),
    ready_decisions: new Set(["ready_for_selection", "selected"]),
    ready_states: new Set(["ready_for_selection", "selected"]),
  }],
]);
const GATED_DOWNSTREAM_CONTRACTS = new Set([
  "PostV1",
  "MediaPackageV1",
  "VisualDirectionSetV1",
  "ViewpointVisualV1",
  "ThesisChartV1",
  "ViewpointMotionSpecV1",
  "ViewpointMotionV1",
  "LogicCardV1",
  "MarketFigureV1",
  "MarketSignalV1",
  "ViewpointCardV1",
  "PublishCandidateSetV1",
  "ReleaseBundleV1",
]);

// ---------------------------------------------------------------------------
// Python-parity helpers (repr formatting, truthiness, set/dict semantics).

export function issue(code, path, message) {
  return { code, path, message };
}

function pyrepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
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
    return `{${Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`).join(", ")}}`;
  }
  return String(value);
}

function pystr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyTruthy(value) {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function pyStrOr(value) {
  return pyTruthy(value) ? pystr(value) : "";
}

function getOr(obj, key, fallback) {
  return Object.hasOwn(obj, key) ? obj[key] : fallback;
}

// `value or []` for values iterated as lists.
function orList(value) {
  if (!pyTruthy(value)) return [];
  return Array.isArray(value) || typeof value === "string" ? value : [];
}

function pyEq(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => pyEq(item, b[index]));
  }
  if (isDict(a) && isDict(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && pyEq(a[key], b[key]));
  }
  return false;
}

const pyNe = (a, b) => !pyEq(a, b);

function pyIncludes(list, value) {
  for (const item of list) if (pyEq(item, value)) return true;
  return false;
}

function setKey(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return `num:${Number(value)}`;
  if (typeof value === "string") return `str:${value}`;
  return null;
}

class PyDict {
  constructor() { this.m = new Map(); }
  set(key, value) {
    const k = setKey(key);
    if (k === null) throw new TypeError(`unhashable type: ${pyrepr(key)}`);
    if (this.m.has(k)) this.m.get(k)[1] = value;
    else this.m.set(k, [key, value]);
  }
  has(key) {
    const k = setKey(key);
    return k !== null && this.m.has(k);
  }
  get(key) {
    const k = setKey(key);
    const entry = k === null ? undefined : this.m.get(k);
    return entry === undefined ? undefined : entry[1];
  }
  keys() { return [...this.m.values()].map((entry) => entry[0]); }
  values() { return [...this.m.values()].map((entry) => entry[1]); }
  entries() { return [...this.m.values()]; }
  get size() { return this.m.size; }
}

function pySet(iterable = []) {
  const set = new PyDict();
  for (const item of iterable) {
    if (setKey(item) === null) throw new TypeError(`unhashable type: ${pyrepr(item)}`);
    if (!set.has(item)) set.set(item, item);
  }
  return set;
}

const ISO_RE = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
  "(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?" +
  "(?:([+-])(\\d{2}):?(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?)?)?$",
);

function daysInMonth(year, month) {
  return [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function parseIso(value) {
  const match = ISO_RE.exec(value);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss, frac, sign, oh, om, os, ofrac] = match;
  const year = Number(y); const month = Number(mo); const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const hour = hh === undefined ? 0 : Number(hh);
  const minute = mm === undefined ? 0 : Number(mm);
  const second = ss === undefined ? 0 : Number(ss);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const micro = frac === undefined ? 0 : Number(frac.padEnd(6, "0").slice(0, 6));
  let offsetMicro = null;
  if (sign !== undefined) {
    const offsetHour = Number(oh); const offsetMinute = Number(om);
    const offsetSecond = os === undefined ? 0 : Number(os);
    const offsetFrac = ofrac === undefined ? 0 : Number(ofrac.padEnd(6, "0").slice(0, 6));
    if (offsetMinute > 59 || offsetSecond > 59) return null;
    offsetMicro = (sign === "-" ? -1 : 1) * (((offsetHour * 60 + offsetMinute) * 60 + offsetSecond) * 1e6 + offsetFrac);
    if (Math.abs(offsetMicro) >= 24 * 3600 * 1e6) return null;
  }
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, 0);
  const epochMicro = utc.getTime() * 1000 + micro - (offsetMicro ?? 0);
  return { epochMicro, hasOffset: offsetMicro !== null };
}

export function parse_time(value, path, errors, nullable = false) {
  if ((value === null || value === undefined) && nullable) return null;
  if (typeof value !== "string" || value === "") {
    errors.push(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."));
    return null;
  }
  const parsed = parseIso(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("TIME_FORMAT", path, "Invalid ISO timestamp."));
    return null;
  }
  if (!parsed.hasOffset) {
    errors.push(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."));
    return null;
  }
  return parsed.epochMicro;
}

export function has_path(nodes, start, target, seen = null) {
  if (pyEq(start, target)) return true;
  const visited = seen === null ? new Set() : seen;
  const key = setKey(start);
  if (visited.has(key) || !nodes.has(start)) return false;
  visited.add(key);
  const dependencies = getOr(nodes.get(start), "depends_on", []);
  for (const dep of (Array.isArray(dependencies) || typeof dependencies === "string" ? dependencies : [])) {
    if (has_path(nodes, dep, target, new Set(visited))) return true;
  }
  return false;
}

export function gate_summary_is_ready(artifact_type, summary) {
  const rules = GATE_ARTIFACT_RULES.get(artifact_type);
  if (rules === undefined || !isDict(summary)) return false;
  const unresolved = summary.unresolved_material_request_count;
  return (
    rules.ready_decisions.has(summary.quality_decision)
    && rules.ready_states.has(summary.artifact_state)
    && typeof unresolved === "number"
    && Number.isInteger(unresolved)
    && unresolved === 0
  );
}

export function validate(payload, opportunities = null, recipe = null, catalog = null) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "CreatorWorkflowRunV1 must be an object.")], warnings: [] };
  }
  for (const key of [...ROOT_FIELDS].filter((field) => !Object.hasOwn(payload, field)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(payload).filter((field) => !ROOT_FIELDS.has(field)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "creator-workflow-run-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected creator-workflow-run-v1."));
  }
  if (!/^WF_[a-z0-9]{8,64}$/.test(pyStrOr(payload.workflow_id))) {
    errors.push(issue("WORKFLOW_ID", "$.workflow_id", "Invalid workflow ID."));
  }
  if (!/^RECIPE_[a-z0-9]{8,64}$/.test(pyStrOr(payload.recipe_ref))) {
    errors.push(issue("RECIPE_REF", "$.recipe_ref", "Invalid recipe reference."));
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pyStrOr(payload.catalog_version))) {
    errors.push(issue("CATALOG_VERSION", "$.catalog_version", "Catalog version must use semantic versioning."));
  } else if (payload.catalog_version !== CATALOG_VERSION) {
    errors.push(issue("CATALOG_VERSION_UNSUPPORTED", "$.catalog_version", `CreatorWorkflowRunV1 currently requires catalog ${CATALOG_VERSION}.`));
  }
  const mode = payload.mode;
  if (!MODES.has(mode)) {
    errors.push(issue("MODE", "$.mode", "Unsupported workflow mode."));
  }
  const created = parse_time(payload.created_at, "$.created_at", errors);
  const as_of = parse_time(payload.as_of, "$.as_of", errors);
  if (created !== null && as_of !== null && created > as_of) {
    warnings.push(issue("CREATED_AFTER_AS_OF", "$.created_at", "created_at is after as_of."));
  }
  if (pyStrOr(payload.ruleset_version).trim() === "") {
    errors.push(issue("RULESET", "$.ruleset_version", "ruleset_version is required."));
  }

  let selected_refs = payload.selected_opportunity_refs;
  if (!Array.isArray(selected_refs) || selected_refs.length !== pySet(pyTruthy(selected_refs) ? selected_refs : []).size) {
    errors.push(issue("SELECTED_REFS", "$.selected_opportunity_refs", "Selected opportunity refs must be a unique array."));
    selected_refs = [];
  }
  if (mode === "single" && selected_refs.length !== 1) {
    errors.push(issue("SINGLE_CARDINALITY", "$.selected_opportunity_refs", "single mode requires exactly one selected opportunity."));
  }
  if (mode === "batch" && selected_refs.length < 2) {
    errors.push(issue("BATCH_CARDINALITY", "$.selected_opportunity_refs", "batch mode requires at least two selected opportunities."));
  }
  if (mode !== "plan_only" && selected_refs.length === 0) {
    errors.push(issue("OPPORTUNITY_REQUIRED", "$.selected_opportunity_refs", "Active mode requires selected opportunities."));
  }
  if (opportunities !== null && opportunities !== undefined) {
    if (!isDict(opportunities) || opportunities.schema_version !== "content-opportunity-set-v1") {
      errors.push(issue("OPPORTUNITY_SET_TYPE", "$opportunities", "Expected ContentOpportunitySetV1."));
    } else {
      if (pyNe(payload.opportunity_set_ref, opportunities.opportunity_set_id)) {
        errors.push(issue("OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Opportunity set reference does not match."));
      }
      const candidates = getOr(opportunities, "candidates", []);
      const known = pySet((Array.isArray(candidates) ? candidates : []).filter((entry) => isDict(entry) && entry.decision === "selected").map((entry) => entry.opportunity_id));
      for (const ref of selected_refs) {
        if (!known.has(ref)) {
          errors.push(issue("UNKNOWN_SELECTED_OPPORTUNITY", "$.selected_opportunity_refs", `${pyrepr(ref)} is not selected in the supplied set.`));
        }
      }
    }
  }

  let recipe_selection_mode = null;
  let recipe_resolved_skills = pySet();
  const recipe_version_pins = new PyDict();
  if (recipe !== null && recipe !== undefined) {
    if (!isDict(recipe) || recipe.schema_version !== "content-recipe-v1") {
      errors.push(issue("RECIPE_TYPE", "$recipe", "Expected ContentRecipeV1."));
    } else {
      if (pyNe(payload.recipe_ref, recipe.recipe_id)) {
        errors.push(issue("RECIPE_REF_MISMATCH", "$.recipe_ref", "Workflow recipe reference does not match."));
      }
      if (pyNe(payload.catalog_version, recipe.catalog_version)) {
        errors.push(issue("RECIPE_CATALOG_MISMATCH", "$.catalog_version", "Workflow and recipe catalog versions differ."));
      }
      if (pyNe(payload.feed_ref, recipe.feed_ref)) {
        errors.push(issue("RECIPE_FEED_MISMATCH", "$.feed_ref", "Workflow and recipe feed references differ."));
      }
      if (!(recipe.opportunity_set_ref === null || recipe.opportunity_set_ref === undefined) && pyNe(payload.opportunity_set_ref, recipe.opportunity_set_ref)) {
        errors.push(issue("RECIPE_OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Workflow and recipe opportunity-set references differ."));
      }
      const recipe_execution = isDict(recipe.execution) ? recipe.execution : {};
      if (pyNe(mode, recipe_execution.mode)) {
        errors.push(issue("RECIPE_MODE_MISMATCH", "$.mode", "Workflow mode differs from the recipe."));
      }
      recipe_resolved_skills = pySet(orList(recipe_execution.resolved_skill_ids));
      for (const pin of orList(recipe_execution.version_pins)) {
        if (isDict(pin) && typeof pin.skill_id === "string" && typeof pin.version === "string") {
          recipe_version_pins.set(pin.skill_id, pin.version);
        }
      }
      recipe_selection_mode = recipe.selection_mode;
      const anchor = isDict(recipe.anchor) ? recipe.anchor : {};
      if (recipe_selection_mode === "opportunity_first" && !pyIncludes(selected_refs, anchor.opportunity_ref)) {
        errors.push(issue("RECIPE_ANCHOR_MISMATCH", "$.selected_opportunity_refs", "Selected opportunities must include the recipe anchor."));
      }
      if (recipe.state === "blocked" || recipe.state === "archived") {
        errors.push(issue("RECIPE_NOT_EXECUTABLE", "$recipe.state", "Blocked or archived recipes cannot execute."));
      }
    }
  }

  const catalog_skills = new PyDict();
  const catalog_extensions = new PyDict();
  if (catalog !== null && catalog !== undefined) {
    if (!isDict(catalog) || catalog.schema_version !== "skill-catalog-v1") {
      errors.push(issue("CATALOG_TYPE", "$catalog", "Expected SkillCatalogV1."));
    } else {
      if (pyNe(payload.catalog_version, catalog.catalog_version)) {
        errors.push(issue("WORKFLOW_CATALOG_MISMATCH", "$.catalog_version", "Workflow must pin the supplied catalog version."));
      }
      const catalogSkillEntries = getOr(catalog, "skills", []);
      for (const entry of (Array.isArray(catalogSkillEntries) ? catalogSkillEntries : [])) {
        if (isDict(entry)) catalog_skills.set(entry.skill_id, entry);
      }
      const catalogExtensionEntries = getOr(catalog, "extension_points", []);
      for (const entry of (Array.isArray(catalogExtensionEntries) ? catalogExtensionEntries : [])) {
        if (isDict(entry)) catalog_extensions.set(entry.extension_point, entry);
      }
    }
  }
  const recipe_extensions = new PyDict();
  for (const entry of (isDict(recipe) ? (Array.isArray(getOr(recipe, "extensions", [])) ? getOr(recipe, "extensions", []) : []) : [])) {
    if (isDict(entry)) recipe_extensions.set(entry.extension_point, entry);
  }

  let nodes_raw = payload.nodes;
  if (!Array.isArray(nodes_raw)) {
    errors.push(issue("NODES_TYPE", "$.nodes", "nodes must be an array."));
    nodes_raw = [];
  }
  const nodes = new PyDict();
  const node_paths = new PyDict();
  const capabilities = new PyDict();
  const dynamic_catalog_nodes = new PyDict();
  const catalog_node_entries = new PyDict();
  for (const [index, node] of nodes_raw.entries()) {
    const path = `$.nodes[${index}]`;
    if (!isDict(node)) {
      errors.push(issue("NODE_TYPE", path, "Node must be an object."));
      continue;
    }
    const node_id = pyStrOr(node.node_id);
    if (!node_id.startsWith("NODE_")) {
      errors.push(issue("NODE_ID", `${path}.node_id`, "Expected NODE_* ID."));
    }
    if (nodes.has(node_id)) {
      errors.push(issue("DUPLICATE_NODE", `${path}.node_id`, "Duplicate node ID."));
    }
    nodes.set(node_id, node);
    node_paths.set(node_id, path);
    const capability = node.capability;
    let expected_skill;
    let expected_contract;
    let expected_execution;
    if (CAPABILITIES.has(capability)) {
      [expected_skill, expected_contract] = CAPABILITIES.get(capability);
      expected_execution = capability === "publish_external" ? "external" : "installed";
    } else if (typeof capability === "string" && capability.startsWith("catalog:")) {
      const capability_name = capability.slice("catalog:".length);
      const candidates = catalog_skills.values().filter((entry) => pyIncludes(orList(entry.capabilities), capability_name));
      const matching = candidates.filter((entry) => pyEq(entry.skill_id, node.skill_name));
      if (catalog_skills.size === 0) {
        errors.push(issue("CATALOG_CAPABILITY_WITHOUT_CATALOG", `${path}.capability`, "Catalog capabilities require SkillCatalogV1."));
        continue;
      }
      if (matching.length !== 1) {
        errors.push(issue("CATALOG_CAPABILITY_RESOLUTION", `${path}.capability`, "Catalog capability must resolve to the node skill exactly once."));
        continue;
      }
      const dynamic_catalog_entry = matching[0];
      dynamic_catalog_nodes.set(node_id, dynamic_catalog_entry);
      expected_skill = dynamic_catalog_entry.skill_id;
      expected_contract = dynamic_catalog_entry.output_contract;
      expected_execution = dynamic_catalog_entry.execution;
    } else if (typeof capability === "string" && capability.startsWith("extension:")) {
      const extension_point = capability.slice("extension:".length).replaceAll("-", "_");
      const extension_entry = catalog_extensions.get(extension_point);
      if (extension_entry === undefined) {
        errors.push(issue("EXTENSION_CAPABILITY_UNKNOWN", `${path}.capability`, "Extension capability is absent from the catalog."));
        continue;
      }
      if (!recipe_extensions.has(extension_point)) {
        errors.push(issue("EXTENSION_NOT_CONFIGURED", `${path}.capability`, "Recipe does not configure this extension point."));
      }
      expected_skill = null;
      expected_contract = extension_entry.contract;
      expected_execution = "external";
    } else {
      errors.push(issue("CAPABILITY", `${path}.capability`, "Unsupported capability."));
      continue;
    }
    if (!capabilities.has(capability)) capabilities.set(capability, []);
    capabilities.get(capability).push(node_id);
    if (pyNe(node.skill_name, expected_skill)) {
      errors.push(issue("SKILL_OWNER", `${path}.skill_name`, `Expected ${pyrepr(expected_skill)}.`));
    }
    const skill_version = node.skill_version;
    if (expected_skill === null || expected_skill === undefined) {
      if (!(skill_version === null || skill_version === undefined)) {
        errors.push(issue("EXTERNAL_SKILL_VERSION", `${path}.skill_version`, "External publisher has no local skill version."));
      }
    } else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(pyStrOr(skill_version))) {
      errors.push(issue("SKILL_VERSION", `${path}.skill_version`, "Installed nodes require a semantic skill version."));
    }
    const is_query_boundary = capability === "query_cuebook";
    if (recipe_resolved_skills.size > 0 && pyTruthy(expected_skill) && !recipe_resolved_skills.has(expected_skill) && !is_query_boundary) {
      errors.push(issue("NODE_SKILL_NOT_RESOLVED", `${path}.skill_name`, "Node skill is not present in the recipe resolution."));
    }
    if (recipe_version_pins.size > 0 && pyTruthy(expected_skill) && !is_query_boundary && pyNe(recipe_version_pins.get(expected_skill), skill_version)) {
      errors.push(issue("NODE_RECIPE_VERSION_MISMATCH", `${path}.skill_version`, "Node skill version differs from the recipe pin."));
    }
    if (catalog_skills.size > 0 && pyTruthy(expected_skill)) {
      const catalog_entry = catalog_skills.get(expected_skill);
      if (catalog_entry === undefined) {
        errors.push(issue("NODE_SKILL_NOT_CATALOGED", `${path}.skill_name`, "Node skill is absent from the pinned catalog."));
      } else if (pyNe(skill_version, catalog_entry.version)) {
        errors.push(issue("NODE_SKILL_VERSION_MISMATCH", `${path}.skill_version`, "Node skill version differs from the catalog."));
      } else {
        catalog_node_entries.set(node_id, catalog_entry);
      }
    }
    if (pyNe(node.output_contract, expected_contract)) {
      errors.push(issue("OUTPUT_CONTRACT", `${path}.output_contract`, `Expected ${pystr(expected_contract)}.`));
    }
    const availability = node.availability;
    if ((expected_execution === "external" || expected_execution === "deferred") && !(availability === "external" || availability === "deferred")) {
      errors.push(issue("EXTERNAL_AVAILABILITY", `${path}.availability`, "External or deferred capability cannot claim local installation."));
    }
    if (expected_execution === "installed" && availability !== "installed") {
      errors.push(issue("INSTALLED_AVAILABILITY", `${path}.availability`, "Installed catalog capability must be installed."));
    }
    const state = node.state;
    if (!NODE_STATES.has(state)) {
      errors.push(issue("NODE_STATE", `${path}.state`, "Unsupported node state."));
    }
    if ((state === "blocked" || state === "skipped" || state === "deferred") && pyStrOr(node.reason).trim() === "") {
      errors.push(issue("STATE_REASON", `${path}.reason`, `${pystr(state)} node requires a reason.`));
    }
    if (state === "completed" && !pyTruthy(node.artifact_refs)) {
      errors.push(issue("COMPLETED_WITHOUT_ARTIFACT", `${path}.artifact_refs`, "Completed node requires an artifact."));
    }
    if (state !== "completed" && pyTruthy(node.artifact_refs) && state !== "blocked") {
      warnings.push(issue("ARTIFACT_ON_INCOMPLETE_NODE", `${path}.artifact_refs`, "Incomplete node carries artifacts; verify partial-output semantics."));
    }
    const opportunity_refs = node.opportunity_refs;
    if (!Array.isArray(opportunity_refs)) {
      errors.push(issue("NODE_OPPORTUNITY_REFS", `${path}.opportunity_refs`, "opportunity_refs must be an array."));
    } else {
      for (const ref of opportunity_refs) {
        if (!pyIncludes(selected_refs, ref)) {
          errors.push(issue("UNKNOWN_NODE_OPPORTUNITY", `${path}.opportunity_refs`, `Unknown selected opportunity ${pyrepr(ref)}.`));
        }
      }
    }
    for (const key of ["depends_on", "input_artifact_refs", "artifact_refs"]) {
      if (!Array.isArray(node[key])) {
        errors.push(issue("NODE_REFS", `${path}.${key}`, `${key} must be an array.`));
      }
    }
  }

  for (const [node_id, node] of nodes.entries()) {
    const path = node_paths.get(node_id);
    for (const dep of orList(node.depends_on)) {
      if (!nodes.has(dep)) {
        errors.push(issue("UNKNOWN_DEPENDENCY", `${path}.depends_on`, `Unknown dependency ${pyrepr(dep)}.`));
      } else if (pyEq(dep, node_id) || has_path(nodes, dep, node_id)) {
        errors.push(issue("DEPENDENCY_CYCLE", `${path}.depends_on`, "Dependency graph contains a cycle."));
      }
    }
    if (node.state === "completed") {
      for (const dep of orList(node.depends_on)) {
        if (nodes.has(dep) && !(nodes.get(dep).state === "completed" || nodes.get(dep).state === "skipped")) {
          errors.push(issue("COMPLETED_BEFORE_DEPENDENCY", path, `Dependency ${pystr(dep)} is not completed or skipped.`));
        }
      }
    }
    const catalog_entry = catalog_node_entries.get(node_id);
    if (catalog_entry !== undefined && pyTruthy(catalog_entry)) {
      for (const required_skill of getOr(catalog_entry, "requires_all", [])) {
        const provider_nodes = nodes.entries().filter(([, candidate]) => pyEq(candidate.skill_name, required_skill)).map(([candidate_id]) => candidate_id);
        if (provider_nodes.length === 0 || !provider_nodes.some((provider_node) => has_path(nodes, node_id, provider_node))) {
          errors.push(issue("CATALOG_DEPENDENCY_MISSING", `${path}.depends_on`, `Catalog dependency ${pyrepr(required_skill)} is not an ancestor.`));
        }
      }
    }
  }

  if (recipe_resolved_skills.size > 0 && catalog_skills.size > 0) {
    const node_skill_names = pySet(nodes.values().filter((node) => pyTruthy(node.skill_name)).map((node) => node.skill_name));
    for (const skill_id of recipe_resolved_skills.keys().sort()) {
      const entry = catalog_skills.get(skill_id);
      if (!pyTruthy(entry ?? null) || skill_id === "orchestrate-cuebook-creator-workflow") {
        continue;
      }
      if (pyIncludes(orList(entry.supported_modes), mode) && !node_skill_names.has(skill_id)) {
        errors.push(issue("RESOLVED_SKILL_NODE_MISSING", "$.nodes", `Resolved runtime skill ${pyrepr(skill_id)} has no workflow node.`));
      }
    }
  }

  const require_capability = (name) => {
    if (!capabilities.has(name)) {
      errors.push(issue("REQUIRED_CAPABILITY", "$.nodes", `Mode ${pystr(mode)} requires ${pystr(name)}.`));
    }
  };

  if (mode !== "plan_only") {
    for (const capability of ["normalize_feed", "compose_recipe", "select_opportunities", "validate_projection", "route_narrative"]) {
      require_capability(capability);
    }
    if (recipe_resolved_skills.size > 0) {
      for (const [capability, [skill_name]] of CAPABILITIES) {
        if (pyTruthy(skill_name) && recipe_resolved_skills.has(skill_name)) {
          require_capability(capability);
        }
      }
    } else {
      for (const capability of ["build_research_pack", "render_market_post", "prepare_release"]) {
        require_capability(capability);
      }
    }
  }
  if (mode === "batch" || mode === "event_lifecycle") {
    require_capability("plan_content_program");
  }
  if (mode === "postmortem" || mode === "correction") {
    require_capability("reconcile_history");
  }

  const depends_on_capability = (node, capability) => orList(node.depends_on).length > 0
    && [...orList(node.depends_on)].some((dep) => nodes.has(dep) && nodes.get(dep).capability === capability);

  const nodes_for_skill = (skill_name) => nodes.entries().filter(([, node]) => pyEq(node.skill_name, skill_name)).map(([node_id]) => node_id);

  const related = (left_id, right_id) => {
    const left_refs = pySet(orList(nodes.get(left_id).opportunity_refs));
    const right_refs = pySet(orList(nodes.get(right_id).opportunity_refs));
    return left_refs.size === 0 || right_refs.size === 0 || left_refs.keys().some((ref) => right_refs.has(ref));
  };

  const has_related_skill_ancestor = (node_id, skill_name) => {
    const providers = nodes_for_skill(skill_name).filter((provider_id) => related(node_id, provider_id));
    return providers.length > 0 && providers.some((provider_id) => has_path(nodes, node_id, provider_id));
  };

  for (const [node_id, node] of nodes.entries()) {
    const path = node_paths.get(node_id);
    const capability = node.capability;
    if (capability === "select_opportunities" && !depends_on_capability(node, "normalize_feed")) {
      errors.push(issue("ORDER_SELECT", `${path}.depends_on`, "Selection must depend on normalization."));
    }
    if (capability === "compose_recipe") {
      if (!depends_on_capability(node, "normalize_feed")) {
        errors.push(issue("ORDER_RECIPE", `${path}.depends_on`, "Recipe composition must depend on normalization."));
      }
      if (recipe_selection_mode === "opportunity_first" && !depends_on_capability(node, "select_opportunities")) {
        errors.push(issue("ORDER_RECIPE_AFTER_SELECTION", `${path}.depends_on`, "opportunity_first recipe must depend on selection."));
      }
    }
    if (capability === "select_opportunities" && (recipe_selection_mode === "ingredient_first" || recipe_selection_mode === "preset_auto") && !depends_on_capability(node, "compose_recipe")) {
      errors.push(issue("ORDER_SELECTION_AFTER_RECIPE", `${path}.depends_on`, "Ingredient-first and automatic presets constrain selection through the recipe."));
    }
    if (capability === "validate_projection") {
      if (!depends_on_capability(node, "select_opportunities") || !depends_on_capability(node, "compose_recipe")) {
        errors.push(issue("ORDER_GATE", `${path}.depends_on`, "Projection gate must depend on selection and the resolved recipe."));
      }
    }
    if (capability === "route_narrative" && !depends_on_capability(node, "validate_projection")) {
      errors.push(issue("ORDER_ROUTE", `${path}.depends_on`, "Narrative route must depend on projection validation."));
    }
    if (capability === "build_research_pack") {
      if (!depends_on_capability(node, "validate_projection") || !depends_on_capability(node, "route_narrative")) {
        errors.push(issue("ORDER_RESEARCH", `${path}.depends_on`, "Research must depend on both gate and route."));
      }
    }
    if (capability === "plan_content_program" && !depends_on_capability(node, "build_research_pack")) {
      errors.push(issue("ORDER_PROGRAM", `${path}.depends_on`, "Program planning must depend on research."));
    }
    if (capability === "render_market_post" || capability === "render_market_media") {
      if (!has_related_skill_ancestor(node_id, "plan-cuebook-creator-expression")) {
        errors.push(issue("ORDER_RENDER", `${path}.depends_on`, "Render must descend from the shared creator expression plan."));
      }
      if (capabilities.has("plan_content_program") && !depends_on_capability(node, "plan_content_program")) {
        errors.push(issue("ORDER_RENDER_PROGRAM", `${path}.depends_on`, "Render must depend on the program when one exists."));
      }
    }
    if (capability === "compile_settlement_claim") {
      if (!has_related_skill_ancestor(node_id, "plan-cuebook-creator-expression")) {
        errors.push(issue("ORDER_SETTLEMENT_EXPRESSION", `${path}.depends_on`, "Settlement compilation must descend from the locked creator expression plan."));
      }
    }
    if (capability === "prepare_release") {
      const render_node_ids = pySet();
      for (const [candidate_id, candidate] of nodes.entries()) {
        if (
          candidate.capability === "render_market_post" || candidate.capability === "render_market_media"
          || pyEq(getOr(catalog_node_entries.get(candidate_id) ?? {}, "category_id", null), "category-rendering")
          || candidate.capability === "extension:custom-renderer"
        ) {
          render_node_ids.set(candidate_id, candidate_id);
        }
      }
      if (![...orList(node.depends_on)].some((dep) => render_node_ids.has(dep))) {
        errors.push(issue("ORDER_RELEASE_RENDER", `${path}.depends_on`, "Release must depend on a render node."));
      }
      for (const settlement_node of capabilities.get("compile_settlement_claim") ?? []) {
        if (!has_path(nodes, node_id, settlement_node)) {
          errors.push(issue("ORDER_RELEASE_SETTLEMENT", `${path}.depends_on`, `Release must include settlement claim ${pystr(settlement_node)}.`));
        }
      }
      for (const formula_node of capabilities.get("compile_settlement_formula") ?? []) {
        if (!has_path(nodes, node_id, formula_node)) {
          errors.push(issue("ORDER_RELEASE_FORMULA", `${path}.depends_on`, `Release must include settlement formula ${pystr(formula_node)}.`));
        }
      }
      for (const render_node_id of render_node_ids.keys()) {
        if (!has_path(nodes, node_id, render_node_id)) {
          errors.push(issue("ORDER_RELEASE_CATALOG_RENDER", `${path}.depends_on`, `Release must descend from catalog renderer ${pystr(render_node_id)}.`));
        }
      }
    }
    if (capability === "publish_external" && !depends_on_capability(node, "prepare_release")) {
      errors.push(issue("ORDER_PUBLISH", `${path}.depends_on`, "Publisher must depend on release preparation."));
    }
  }

  const semantics_nodes = nodes_for_skill("compile-cuebook-market-view-semantics");
  const expression_nodes = nodes_for_skill("plan-cuebook-creator-expression");
  const data_nodes = nodes_for_skill("assemble-cuebook-viewpoint-data");
  const direction_nodes = nodes_for_skill("direct-cuebook-viewpoint-visual");
  const visual_nodes = nodes_for_skill("render-cuebook-viewpoint-visual");
  const motion_spec_nodes = nodes_for_skill("direct-cuebook-viewpoint-motion");
  const motion_nodes = nodes_for_skill("render-cuebook-viewpoint-motion");
  const post_nodes = nodes_for_skill("render-cuebook-market-post");
  const settlement_nodes = nodes_for_skill("compile-cuebook-settlement-claim");
  const formula_nodes = nodes_for_skill("compile-cuebook-settlement-formula");
  const downstream_nodes = [...nodes_for_skill("render-cuebook-market-media"), ...nodes_for_skill("assemble-cuebook-viewpoint-card")];

  for (const semantics_node of semantics_nodes) {
    const related_research = (capabilities.get("build_research_pack") ?? []).filter((candidate) => related(semantics_node, candidate));
    if (related_research.length > 0 && !related_research.some((candidate) => has_path(nodes, semantics_node, candidate))) {
      errors.push(issue("ORDER_SEMANTICS_INPUT", `${node_paths.get(semantics_node)}.depends_on`, "Semantics must descend from the available research pack or use a direct creator input."));
    }
  }

  for (const expression_node of expression_nodes) {
    if (!has_related_skill_ancestor(expression_node, "compile-cuebook-market-view-semantics")) {
      errors.push(issue("ORDER_EXPRESSION_SEMANTICS", `${node_paths.get(expression_node)}.depends_on`, "Expression planning must descend from market-view semantics."));
    }
    for (const optional_skill of ["classify-cuebook-trading-logic", "compose-cuebook-trading-thesis"]) {
      for (const optional_node of nodes_for_skill(optional_skill)) {
        if (related(expression_node, optional_node) && !has_path(nodes, expression_node, optional_node)) {
          errors.push(issue("ORDER_EXPRESSION_ENRICHMENT", `${node_paths.get(expression_node)}.depends_on`, `Expression must include optional enrichment node ${pystr(optional_node)}.`));
        }
      }
    }
  }

  for (const data_node of data_nodes) {
    if (!has_related_skill_ancestor(data_node, "plan-cuebook-creator-expression")) {
      errors.push(issue("ORDER_DATA_EXPRESSION", `${node_paths.get(data_node)}.depends_on`, "Viewpoint data must descend from the shared expression plan."));
    }
  }

  for (const direction_node of direction_nodes) {
    if (!has_related_skill_ancestor(direction_node, "plan-cuebook-creator-expression") || !has_related_skill_ancestor(direction_node, "assemble-cuebook-viewpoint-data")) {
      errors.push(issue("ORDER_VISUAL_DIRECTION", `${node_paths.get(direction_node)}.depends_on`, "Visual direction must descend from the shared expression plan and viewpoint data."));
    }
  }

  for (const visual_node of visual_nodes) {
    if (!has_related_skill_ancestor(visual_node, "plan-cuebook-creator-expression") || !has_related_skill_ancestor(visual_node, "assemble-cuebook-viewpoint-data") || !has_related_skill_ancestor(visual_node, "direct-cuebook-viewpoint-visual")) {
      errors.push(issue("ORDER_VISUAL_BRIDGE", `${node_paths.get(visual_node)}.depends_on`, "The unified visual must descend from expression, viewpoint data, and an approved visual direction set."));
    }
  }

  for (const motion_spec_node of motion_spec_nodes) {
    if (!has_related_skill_ancestor(motion_spec_node, "render-cuebook-viewpoint-visual")) {
      errors.push(issue("ORDER_MOTION_DIRECTION", `${node_paths.get(motion_spec_node)}.depends_on`, "Motion direction must descend from the approved static viewpoint visual."));
    }
  }

  for (const motion_node of motion_nodes) {
    if (!has_related_skill_ancestor(motion_node, "direct-cuebook-viewpoint-motion") || !has_related_skill_ancestor(motion_node, "render-cuebook-viewpoint-visual")) {
      errors.push(issue("ORDER_MOTION_RENDER", `${node_paths.get(motion_node)}.depends_on`, "Motion render must descend from its motion spec and static poster visual."));
    }
  }

  for (const data_node of data_nodes) {
    for (const post_node of post_nodes) {
      if (related(data_node, post_node) && (has_path(nodes, data_node, post_node) || has_path(nodes, post_node, data_node))) {
        errors.push(issue("PARALLEL_BRANCH_ORDER", "$.nodes", "Post text and viewpoint data must remain parallel children of the expression plan."));
      }
    }
  }

  for (const formula_node of formula_nodes) {
    const related_claims = settlement_nodes.filter((candidate) => related(formula_node, candidate));
    if (related_claims.length === 0 || !related_claims.some((candidate) => has_path(nodes, formula_node, candidate))) {
      errors.push(issue("ORDER_SETTLEMENT_FORMULA", `${node_paths.get(formula_node)}.depends_on`, "Settlement formula must descend from its settlement claim."));
    }
  }

  for (const downstream_node of downstream_nodes) {
    for (const prerequisite_skill of ["render-cuebook-market-post", "render-cuebook-viewpoint-visual", "render-cuebook-viewpoint-motion", "compile-cuebook-settlement-claim"]) {
      const providers = nodes_for_skill(prerequisite_skill).filter((provider) => related(downstream_node, provider));
      if (providers.length > 0 && !providers.some((provider) => has_path(nodes, downstream_node, provider))) {
        errors.push(issue("ORDER_DOWNSTREAM_ASSEMBLY", `${node_paths.get(downstream_node)}.depends_on`, `Downstream media/card must descend from ${pystr(prerequisite_skill)}.`));
      }
    }
  }

  let artifacts_raw = payload.artifact_registry;
  if (!Array.isArray(artifacts_raw)) {
    errors.push(issue("ARTIFACTS_TYPE", "$.artifact_registry", "artifact_registry must be an array."));
    artifacts_raw = [];
  }
  const artifacts = new PyDict();
  const artifact_paths = new PyDict();
  const hashes = new Set();
  for (const [index, artifact] of artifacts_raw.entries()) {
    const path = `$.artifact_registry[${index}]`;
    if (!isDict(artifact)) {
      errors.push(issue("ARTIFACT_TYPE", path, "Artifact must be an object."));
      continue;
    }
    const artifact_id = pyStrOr(artifact.artifact_id);
    if (!artifact_id.startsWith("ART_")) {
      errors.push(issue("ARTIFACT_ID", `${path}.artifact_id`, "Expected ART_* ID."));
    }
    if (artifacts.has(artifact_id)) {
      errors.push(issue("DUPLICATE_ARTIFACT", `${path}.artifact_id`, "Duplicate artifact ID."));
    }
    artifacts.set(artifact_id, artifact);
    artifact_paths.set(artifact_id, path);
    const artifact_type = artifact.artifact_type;
    const content_hash = pyStrOr(artifact.content_hash);
    if (!/^sha256:[a-f0-9]{64}$/.test(content_hash)) {
      errors.push(issue("ARTIFACT_HASH", `${path}.content_hash`, "Invalid artifact hash."));
    }
    if (hashes.has(content_hash)) {
      warnings.push(issue("DUPLICATE_ARTIFACT_HASH", `${path}.content_hash`, "Multiple artifact IDs share one payload hash."));
    }
    hashes.add(content_hash);
    const producer = artifact.producer_node_ref;
    if (!nodes.has(producer)) {
      errors.push(issue("UNKNOWN_PRODUCER", `${path}.producer_node_ref`, "Artifact producer does not resolve."));
    } else if (!pyIncludes(orList(nodes.get(producer).artifact_refs), artifact_id)) {
      errors.push(issue("PRODUCER_LINK", `${path}.producer_node_ref`, "Producer node does not register this artifact."));
    }
    parse_time(artifact.created_at, `${path}.created_at`, errors);
    const gate_rules = GATE_ARTIFACT_RULES.get(artifact_type);
    if (gate_rules !== undefined) {
      const summary = artifact.gate_summary;
      if (!isDict(summary)) {
        errors.push(issue("GATE_SUMMARY_REQUIRED", `${path}.gate_summary`, `${pystr(artifact_type)} requires an inline gate summary.`));
        continue;
      }
      for (const key of [...GATE_SUMMARY_FIELDS].filter((field) => !Object.hasOwn(summary, field)).sort()) {
        errors.push(issue("GATE_SUMMARY_FIELD_REQUIRED", `${path}.gate_summary.${key}`, "Required gate-summary field is missing."));
      }
      for (const key of Object.keys(summary).filter((field) => !GATE_SUMMARY_FIELDS.has(field)).sort()) {
        errors.push(issue("UNKNOWN_GATE_SUMMARY_FIELD", `${path}.gate_summary.${key}`, "Unknown gate-summary field."));
      }
      const decision = summary.quality_decision;
      const artifact_state = summary.artifact_state;
      const unresolved = summary.unresolved_material_request_count;
      if (!gate_rules.quality_decisions.has(decision)) {
        errors.push(issue("GATE_QUALITY_DECISION", `${path}.gate_summary.quality_decision`, `Unsupported quality decision for ${pystr(artifact_type)}.`));
      }
      if (!gate_rules.artifact_states.has(artifact_state)) {
        errors.push(issue("GATE_ARTIFACT_STATE", `${path}.gate_summary.artifact_state`, `Unsupported artifact state for ${pystr(artifact_type)}.`));
      }
      if (!(typeof unresolved === "number" && Number.isInteger(unresolved)) || unresolved < 0) {
        errors.push(issue("UNRESOLVED_MATERIAL_REQUEST_COUNT", `${path}.gate_summary.unresolved_material_request_count`, "Expected a non-negative integer."));
      }
      if ((artifact_type === "CuebookQueryBundleV1" || artifact_type === "ResearchPackV1" || artifact_type === "ViewpointDataBundleV1") && pyNe(decision, artifact_state)) {
        errors.push(issue("GATE_SUMMARY_STATE_MISMATCH", `${path}.gate_summary`, `${pystr(artifact_type)} quality decision and normalized state must match.`));
      }
      if (artifact_type === "CreatorExpressionPlanV1") {
        const valid_expression_pair = (
          artifact_state === "draft"
          || (decision === "conditional" && artifact_state === "conditional")
          || (decision === "ready" && (artifact_state === "ready" || artifact_state === "frozen"))
        );
        if (!valid_expression_pair) {
          errors.push(issue("GATE_SUMMARY_STATE_MISMATCH", `${path}.gate_summary`, "Expression quality decision and artifact state are inconsistent."));
        }
      }
      if (artifact_type === "PublishCandidateSetV1" && artifact_state !== "draft" && pyNe(decision, artifact_state)) {
        errors.push(issue("GATE_SUMMARY_STATE_MISMATCH", `${path}.gate_summary`, "Candidate-set quality decision must match its non-draft state."));
      }
    }
  }

  let query_bundle_refs = payload.query_bundle_refs;
  if (!Array.isArray(query_bundle_refs)) {
    errors.push(issue("QUERY_BUNDLE_REFS_TYPE", "$.query_bundle_refs", "query_bundle_refs must be an array."));
    query_bundle_refs = [];
  }
  for (const ref of query_bundle_refs) {
    if (!artifacts.has(ref)) {
      errors.push(issue("UNKNOWN_QUERY_BUNDLE", "$.query_bundle_refs", `Unknown query bundle artifact ${pyrepr(ref)}.`));
    } else if (artifacts.get(ref).artifact_type !== "CuebookQueryBundleV1") {
      errors.push(issue("QUERY_BUNDLE_CONTRACT", "$.query_bundle_refs", `Artifact ${pyrepr(ref)} is not CuebookQueryBundleV1.`));
    }
  }

  for (const [node_id, node] of nodes.entries()) {
    const path = node_paths.get(node_id);
    for (const ref of orList(node.input_artifact_refs)) {
      if (!artifacts.has(ref)) {
        errors.push(issue("UNKNOWN_INPUT_ARTIFACT", `${path}.input_artifact_refs`, `Unknown artifact ${pyrepr(ref)}.`));
      } else {
        const producer = artifacts.get(ref).producer_node_ref;
        if (nodes.has(producer) && !has_path(nodes, node_id, producer)) {
          errors.push(issue("INPUT_PRODUCER_NOT_DEPENDENCY", `${path}.input_artifact_refs`, `Producer ${pyrepr(producer)} is not a dependency ancestor.`));
        }
      }
    }
    for (const ref of orList(node.artifact_refs)) {
      if (!artifacts.has(ref)) {
        errors.push(issue("UNKNOWN_OUTPUT_ARTIFACT", `${path}.artifact_refs`, `Unknown artifact ${pyrepr(ref)}.`));
      } else if (pyNe(artifacts.get(ref).artifact_type, node.output_contract)) {
        errors.push(issue("ARTIFACT_CONTRACT_MISMATCH", `${path}.artifact_refs`, "Artifact type does not match node output contract."));
      }
    }
    if (node.capability === "publish_external" && node.state === "completed") {
      if (![...orList(node.artifact_refs)].some((ref) => artifacts.has(ref) && artifacts.get(ref).artifact_type === "PublicationReceiptV1")) {
        errors.push(issue("PUBLISH_WITHOUT_RECEIPT", path, "Completed publication requires PublicationReceiptV1."));
      }
    }
  }

  const is_gated_downstream = (node_id, node) => {
    const catalog_entry = catalog_node_entries.get(node_id) ?? {};
    const capability = pyStrOr(node.capability);
    return (
      GATED_DOWNSTREAM_CONTRACTS.has(node.output_contract)
      || catalog_entry.category_id === "category-rendering"
      || capability.startsWith("catalog:render-")
      || (capability.startsWith("extension:") && capability.includes("render"))
    );
  };

  const transitive_input_artifacts = (node) => {
    const found = new Set();
    const foundValues = [];
    const pending = [...orList(node.input_artifact_refs)];
    while (pending.length > 0) {
      const artifact_id = pending.pop();
      const key = setKey(artifact_id);
      if (found.has(key)) continue;
      found.add(key);
      foundValues.push(artifact_id);
      const artifact = artifacts.get(artifact_id);
      if (artifact !== undefined && pyTruthy(artifact)) {
        pending.push(...orList(artifact.input_artifact_refs));
      }
    }
    return found;
  };

  for (const [node_id, node] of nodes.entries()) {
    if (!is_gated_downstream(node_id, node)) continue;
    const consumed_artifacts = transitive_input_artifacts(node);
    const unsafe_upstream = [];
    for (const [artifact_id, artifact] of artifacts.entries()) {
      const artifact_type = artifact.artifact_type;
      const producer = artifact.producer_node_ref;
      if (
        GATE_ARTIFACT_RULES.has(artifact_type)
        && (artifact.status === "current" || consumed_artifacts.has(setKey(artifact_id)))
        && nodes.has(producer)
        && pyNe(producer, node_id)
        && related(node_id, producer)
        && has_path(nodes, node_id, producer)
        && !gate_summary_is_ready(artifact_type, artifact.gate_summary)
      ) {
        unsafe_upstream.push(artifact_id);
      }
    }
    if (unsafe_upstream.length > 0 && (node.state === "ready" || node.state === "running" || node.state === "completed")) {
      const code = node.state === "completed" ? "COMPLETED_WITH_UNRESOLVED_UPSTREAM_GATE" : "ADVANCED_WITH_UNRESOLVED_UPSTREAM_GATE";
      errors.push(issue(code, `${node_paths.get(node_id)}.state`, `Node must be blocked; upstream artifact gates are unresolved: ${pyrepr([...unsafe_upstream].sort())}.`));
    }
    if (node.output_contract === "PublishCandidateSetV1" && node.state === "completed") {
      const unsafe_outputs = [...orList(node.artifact_refs)].filter((ref) => (
        artifacts.has(ref)
        && artifacts.get(ref).artifact_type === "PublishCandidateSetV1"
        && !gate_summary_is_ready("PublishCandidateSetV1", artifacts.get(ref).gate_summary)
      ));
      if (unsafe_outputs.length > 0) {
        errors.push(issue("COMPLETED_CANDIDATE_GATE_NOT_READY", `${node_paths.get(node_id)}.state`, `Candidate node must be blocked until its output is selectable: ${pyrepr([...unsafe_outputs].sort())}.`));
      }
    }
  }

  let approvals_raw = payload.approvals;
  if (!Array.isArray(approvals_raw)) {
    errors.push(issue("APPROVALS_TYPE", "$.approvals", "approvals must be an array."));
    approvals_raw = [];
  }
  const approved_release_artifacts = pySet();
  const approval_ids = pySet();
  for (const [index, approval] of approvals_raw.entries()) {
    const path = `$.approvals[${index}]`;
    if (!isDict(approval)) {
      errors.push(issue("APPROVAL_TYPE", path, "Approval must be an object."));
      continue;
    }
    const approval_id = pyStrOr(approval.approval_id);
    if (approval_ids.has(approval_id)) {
      errors.push(issue("DUPLICATE_APPROVAL", `${path}.approval_id`, "Duplicate approval ID."));
    }
    approval_ids.set(approval_id, approval_id);
    const decision = approval.decision;
    const decided_at = parse_time(approval.decided_at, `${path}.decided_at`, errors, true);
    if (decision === "pending" && decided_at !== null) {
      errors.push(issue("PENDING_DECIDED_AT", `${path}.decided_at`, "Pending approval cannot have decided_at."));
    }
    if (decision !== "pending" && decided_at === null) {
      errors.push(issue("DECISION_TIME", `${path}.decided_at`, "Decided approval requires decided_at."));
    }
    let versions = approval.artifact_versions;
    if (!Array.isArray(versions) || versions.length === 0) {
      errors.push(issue("APPROVAL_VERSIONS", `${path}.artifact_versions`, "Approval requires artifact versions."));
      versions = [];
    }
    for (const version of versions) {
      if (!isDict(version)) {
        errors.push(issue("APPROVAL_VERSION_TYPE", `${path}.artifact_versions`, "Approval version must be an object."));
        continue;
      }
      const ref = version.artifact_ref;
      const artifact = artifacts.get(ref);
      let version_matches_current = false;
      if (artifact === undefined) {
        errors.push(issue("UNKNOWN_APPROVAL_ARTIFACT", `${path}.artifact_versions`, `Unknown artifact ${pyrepr(ref)}.`));
      } else if (pyNe(version.content_hash, artifact.content_hash)) {
        errors.push(issue("APPROVAL_HASH_MISMATCH", `${path}.artifact_versions`, "Approval hash no longer matches current registry payload."));
      } else if (decision === "approved" && artifact.status !== "current") {
        errors.push(issue("APPROVED_STALE_ARTIFACT", `${path}.artifact_versions`, "Approved artifact is superseded or invalidated."));
      } else {
        version_matches_current = true;
      }
      if (approval.gate === "release" && decision === "approved" && version_matches_current && artifact !== undefined && pyTruthy(artifact) && artifact.artifact_type === "ReleaseBundleV1") {
        approved_release_artifacts.set(ref, ref);
      }
    }
  }

  let events_raw = payload.state_events;
  if (!Array.isArray(events_raw)) {
    errors.push(issue("EVENTS_TYPE", "$.state_events", "state_events must be an array."));
    events_raw = [];
  }
  const events_by_node = new PyDict();
  const event_ids = pySet();
  for (const [index, event] of events_raw.entries()) {
    const path = `$.state_events[${index}]`;
    if (!isDict(event)) {
      errors.push(issue("EVENT_TYPE", path, "State event must be an object."));
      continue;
    }
    const event_id = pyStrOr(event.event_id);
    if (event_ids.has(event_id)) {
      errors.push(issue("DUPLICATE_EVENT", `${path}.event_id`, "Duplicate state event ID."));
    }
    event_ids.set(event_id, event_id);
    const node_ref = event.node_ref;
    if (!nodes.has(node_ref)) {
      errors.push(issue("UNKNOWN_EVENT_NODE", `${path}.node_ref`, "Event node does not resolve."));
      continue;
    }
    const occurred = parse_time(event.occurred_at, `${path}.occurred_at`, errors);
    if (occurred !== null) {
      if (!events_by_node.has(node_ref)) events_by_node.set(node_ref, []);
      events_by_node.get(node_ref).push([occurred, event, path]);
    }
  }
  for (const [node_id, node] of nodes.entries()) {
    const events = [...(events_by_node.get(node_id) ?? [])].sort((left, right) => left[0] - right[0]);
    if (events.length === 0) {
      errors.push(issue("NODE_EVENT_REQUIRED", node_paths.get(node_id), "Every node requires at least one state event."));
      continue;
    }
    let previous = null;
    for (const [, event, path] of events) {
      if (pyNe(event.from_state, previous)) {
        errors.push(issue("EVENT_CHAIN", path, `Expected from_state ${pyrepr(previous)}.`));
      }
      previous = event.to_state === undefined ? null : event.to_state;
    }
    if (pyNe(previous, node.state)) {
      errors.push(issue("EVENT_STATE_MISMATCH", node_paths.get(node_id), "Folded event state does not match node state."));
    }
  }

  let blockers_raw = payload.blockers;
  if (!Array.isArray(blockers_raw)) {
    errors.push(issue("BLOCKERS_TYPE", "$.blockers", "blockers must be an array."));
    blockers_raw = [];
  }
  const blocker_nodes = pySet();
  const blocker_ids = pySet();
  for (const [index, blocker] of blockers_raw.entries()) {
    const path = `$.blockers[${index}]`;
    if (!isDict(blocker)) {
      errors.push(issue("BLOCKER_TYPE", path, "Blocker must be an object."));
      continue;
    }
    if (blocker_ids.has(blocker.blocker_id)) {
      errors.push(issue("DUPLICATE_BLOCKER", `${path}.blocker_id`, "Duplicate blocker ID."));
    }
    blocker_ids.set(blocker.blocker_id, blocker.blocker_id);
    if (!nodes.has(blocker.node_ref)) {
      errors.push(issue("UNKNOWN_BLOCKER_NODE", `${path}.node_ref`, "Blocker node does not resolve."));
    }
    if (pyTruthy(blocker.blocking)) {
      blocker_nodes.set(blocker.node_ref, blocker.node_ref);
    }
  }
  for (const [node_id, node] of nodes.entries()) {
    if (node.state === "blocked" && !blocker_nodes.has(node_id)) {
      errors.push(issue("BLOCKED_WITHOUT_BLOCKER", node_paths.get(node_id), "Blocked node requires a blocking record."));
    }
  }

  const workflow_state = payload.state;
  const release_artifacts = pySet();
  for (const node of nodes.values()) {
    if (node.capability === "prepare_release" && node.state === "completed") {
      for (const ref of orList(node.artifact_refs)) {
        if (artifacts.has(ref) && artifacts.get(ref).status === "current") release_artifacts.set(ref, ref);
      }
    }
  }
  if (workflow_state === "ready_for_handoff") {
    if (isDict(recipe) && recipe.state !== "valid") {
      errors.push(issue("HANDOFF_WITH_CONDITIONAL_RECIPE", "$.state", "Ready handoff requires a valid recipe revision."));
    }
    if (release_artifacts.size === 0) {
      errors.push(issue("HANDOFF_WITHOUT_RELEASE", "$.state", "ready_for_handoff requires a current completed ReleaseBundleV1."));
    }
    if (!release_artifacts.keys().some((ref) => approved_release_artifacts.has(ref))) {
      errors.push(issue("HANDOFF_WITHOUT_APPROVAL", "$.state", "Current release bundle lacks release approval."));
    }
    if (nodes.values().some((node) => node.state === "blocked" && pyTruthy(node.blocking))) {
      errors.push(issue("HANDOFF_WITH_BLOCKER", "$.state", "Blocking nodes prevent handoff."));
    }
    const unfinished = nodes.entries().filter(([, node]) => pyTruthy(node.blocking) && !(node.state === "completed" || node.state === "skipped")).map(([node_id]) => node_id);
    if (unfinished.length > 0) {
      errors.push(issue("HANDOFF_WITH_UNFINISHED", "$.state", `Blocking nodes unfinished: ${pyrepr(unfinished)}.`));
    }
  }
  if (workflow_state === "complete") {
    const unfinished = nodes.entries().filter(([, node]) => pyTruthy(node.blocking) && !(node.state === "completed" || node.state === "skipped")).map(([node_id]) => node_id);
    if (unfinished.length > 0) {
      errors.push(issue("COMPLETE_WITH_UNFINISHED", "$.state", `Blocking nodes unfinished: ${pyrepr(unfinished)}.`));
    }
    if (capabilities.has("publish_external") && !capabilities.get("publish_external").some((node_id) => nodes.get(node_id).state === "completed")) {
      errors.push(issue("COMPLETE_WITHOUT_PUBLICATION", "$.state", "Complete workflow with publisher node requires verified publication."));
    }
  }
  if (workflow_state === "planned" && mode !== "plan_only" && nodes.values().some((node) => !(node.state === "pending" || node.state === "deferred"))) {
    warnings.push(issue("PLANNED_WITH_PROGRESS", "$.state", "Run is marked planned after nodes advanced."));
  }
  if (workflow_state === "blocked" && blocker_nodes.size === 0) {
    errors.push(issue("BLOCKED_WITHOUT_BLOCKERS", "$.state", "Blocked workflow requires a blocking record."));
  }

  let quality = payload.quality_report;
  if (!isDict(quality)) {
    errors.push(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."));
    quality = {};
  }
  let hard_failures = quality.hard_failures;
  if (!Array.isArray(hard_failures)) {
    errors.push(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hard_failures = [];
  }
  if (hard_failures.length > 0 && quality.decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_STATE", "$.quality_report.decision", "Hard failures require blocked."));
  }
  const countState = (state) => nodes_raw.filter((node) => isDict(node) && node.state === state).length;
  const expected_counts = {
    nodes: nodes_raw.length,
    completed: countState("completed"),
    blocked: countState("blocked"),
    deferred: countState("deferred"),
    artifacts: artifacts_raw.length,
    approvals_pending: approvals_raw.filter((approval) => isDict(approval) && approval.decision === "pending").length,
  };
  if (pyNe(quality.counts, expected_counts)) {
    errors.push(issue("COUNTS", "$.quality_report.counts", `Expected exact counts ${pyrepr(expected_counts)}.`));
  }
  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const prog = basename(fileURLToPath(import.meta.url));
  const usage = `usage: ${prog} [-h] [--opportunities OPPORTUNITIES] [--recipe RECIPE] [--catalog CATALOG] json_file`;
  const options = { opportunities: null, recipe: null, catalog: null };
  const positionals = [];
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage + "\n");
      return;
    }
    const optionMatch = /^--(opportunities|recipe|catalog)(?:=(.*))?$/.exec(arg);
    if (optionMatch) {
      let value = optionMatch[2];
      if (value === undefined) {
        index += 1;
        if (index >= argv.length) {
          process.stderr.write(`${usage}\n${prog}: error: argument --${optionMatch[1]}: expected one argument\n`);
          process.exitCode = 2;
          return;
        }
        value = argv[index];
      }
      options[optionMatch[1]] = value;
    } else if (arg.startsWith("--")) {
      process.stderr.write(`${usage}\n${prog}: error: unrecognized arguments: ${arg}\n`);
      process.exitCode = 2;
      return;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    process.stderr.write(`${usage}\n${prog}: error: ${positionals.length === 0 ? "the following arguments are required: json_file" : `unrecognized arguments: ${positionals.slice(1).join(" ")}`}\n`);
    process.exitCode = 2;
    return;
  }
  const load = (path) => (path ? JSON.parse(readFileSync(path, "utf-8")) : null);
  const result = validate(load(positionals[0]), load(options.opportunities), load(options.recipe), load(options.catalog));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.valid ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
