#!/usr/bin/env node
// Validate Cuebook VisualDirectionSetV1 artifacts and optional HTML previews.
//
// Port of validate_visual_direction_set.py. Error codes, paths, message
// wording, error ordering, and the JSON output shape are contract.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { audit_html, pyJsonDumps, pyrepr, pyreprList } from "./lint_launch_viewpoint_html.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const PALETTE_REGISTRY_PATH = path.join(SCRIPT_DIR, "..", "references", "creator-palette-presets-v1.json");
const PALETTE_PRESETS = {};
for (const item of JSON.parse(readFileSync(PALETTE_REGISTRY_PATH, "utf-8")).presets) {
  PALETTE_PRESETS[item.preset_id] = item;
}
const EXPRESSION_REGISTRY_PATH = path.join(SCRIPT_DIR, "..", "references", "viewpoint-expression-registry-v1.json");
const EXPRESSION_REGISTRY = JSON.parse(readFileSync(EXPRESSION_REGISTRY_PATH, "utf-8"));
const CANDIDATE_FAMILIES = new Set(EXPRESSION_REGISTRY.candidate_families);
const CANDIDATE_JOBS = {};
for (const item of EXPRESSION_REGISTRY.candidate_jobs) CANDIDATE_JOBS[item.job_id] = item;
const EVIDENCE_SHAPES = new Set(EXPRESSION_REGISTRY.evidence_shapes);
const EXPRESSION_GRAMMARS = {};
for (const item of EXPRESSION_REGISTRY.grammars) EXPRESSION_GRAMMARS[item.grammar_id] = item;
const MARKET_RELATIONSHIPS = {};
for (const item of EXPRESSION_REGISTRY.market_relationships) MARKET_RELATIONSHIPS[item.relationship_id] = item;
const ARGUMENT_ARCHETYPES = {};
for (const item of EXPRESSION_REGISTRY.argument_archetypes) ARGUMENT_ARCHETYPES[item.archetype_id] = item;
const COMPOSITION_ARCHETYPES = {};
for (const item of EXPRESSION_REGISTRY.composition_archetypes) COMPOSITION_ARCHETYPES[item.composition_id] = item;
const FINANCE_TRANSFORMS = new Set(EXPRESSION_REGISTRY.finance_transforms);
const BASELINE_POLICIES = new Set(EXPRESSION_REGISTRY.baseline_policies);
const CHART_DECISIONS = new Set(EXPRESSION_REGISTRY.chart_decisions);
const RENDERER_ROUTES = new Set(["directed_html", "render-cuebook-thesis-chart"]);
const AXIS_INTEGRITY_MODES = new Set(["time_scaled", "ordinal_gap_marked", "uniform_true"]);

const WEIGHTS = {
  concept: 0.20,
  three_second: 0.20,
  hierarchy: 0.15,
  data_integrity: 0.15,
  color_logic: 0.10,
  craft: 0.10,
  originality: 0.05,
  anti_default: 0.05,
};
const INTERNAL_TERMS = [
  "needs_creator_confirmation",
  "evidence_count",
  "quality_report",
  "settlement_claim_v1",
  "workflow_state",
];
const DESIGN_LOGICS = new Set(["product_native", "benchmark_transfer", "content_native"]);
const HIERARCHY_ROLES = new Set(["claim", "reason", "evidence", "implication", "context", "brand"]);
const GRIDS = new Set(["single_axis", "editorial_split", "asymmetric_stage", "comparison_field", "timeline_band", "radial_field", "distribution_field", "network_field", "calendar_field", "instrument_field", "freeform"]);
const ALIGNMENTS = new Set(["left", "centered", "split", "mixed"]);
const DENSITIES = new Set(["quiet", "balanced", "dense"]);
const DATA_ROLES = new Set(["hero", "support", "none"]);
const ENTRY_ROLES = new Set(["claim", "evidence", "condition"]);
const SEMANTIC_COLOR_ROLES = new Set(["positive", "negative", "observed", "catalyst", "conditional", "comparison", "risk"]);
const SURFACE_MODES = new Set(["light", "dark", "split"]);
const PALETTE_STRATEGIES = new Set(["creator_native", "thesis_native", "contrast_variant"]);
const PALETTE_TOKENS = new Set(["accent-a", "accent-b", "accent-c", "risk"]);
const REDUNDANT_CUES = new Set(["type", "position", "label", "shape", "stroke", "solid_dashed", "area"]);
const DESIGN_MODES = new Set(["compose", "redesign_preserve", "redesign_overhaul"]);
const TONES = new Set(["urgent", "skeptical", "calm", "analytical", "contrarian", "promotional"]);
const PROFILE_SOURCES = new Set(["voice_spec", "commentator_profile", "creator_visual_corpus", "creator_text", "cuebook_default"]);
const PROFILE_REGISTERS = new Set(["desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"]);
const BINDING_KINDS = new Set(["creator_judgment", "fact", "metric", "series", "level", "event", "quote", "relationship", "instrument"]);
const BINDING_STATES = new Set(["observed", "reported", "derived", "conditional", "creator_view"]);
const FACTUAL_BINDING_KINDS = new Set([...BINDING_KINDS].filter((kind) => kind !== "creator_judgment"));
const REQUEST_CLASSES = new Set([
  "creator_judgment",
  "qualitative_evidence",
  "news_anchor",
  "official_event",
  "valuation_metric",
  "comparison_metric",
  "market_series",
  "price_level",
  "settlement_reference",
]);
const UPSTREAM_REQUEST_CLASSES = new Set([...REQUEST_CLASSES].filter((item) => item !== "creator_judgment"));
const LOGIC_PATTERNS = new Set(["reaction_test", "event_transmission", "expectation_revision", "valuation_reframe", "relative_value", "cycle_rotation", "flow_pressure", "technical_trigger", "scenario_branch", "strategy_ladder", "custom"]);
const LOGIC_ROLES = new Set(["context", "event", "evidence", "mechanism", "actor_action", "tension", "judgment", "market_effect", "trade_implication", "catalyst", "condition", "invalidation"]);
const LOGIC_STATES = new Set(["observed", "reported", "derived", "creator_view", "conditional"]);
const LOGIC_RELATIONS = new Set(["causes", "enables", "pressures", "confirms", "challenges", "conditions", "compares", "leads_to", "invalidates"]);
const SUPPORT_LOGIC_ROLES = new Set(["context", "event", "evidence", "mechanism", "actor_action", "tension", "catalyst", "condition"]);
const CONCLUSION_LOGIC_ROLES = new Set(["judgment", "market_effect", "trade_implication", "condition", "invalidation"]);
const ROUTE_ENTRY_ROLES = {
  claim_first: new Set(["judgment", "market_effect", "trade_implication"]),
  evidence_first: new Set(["context", "event", "evidence", "tension", "catalyst"]),
  reasoning_first: new Set(["mechanism", "actor_action", "tension"]),
  strategy_first: new Set(["trade_implication", "condition", "invalidation"]),
};
const PREFLIGHT_KEYS = new Set([
  "copy_audited",
  "compact_readable",
  "anti_default_checked",
  "layout_signature_unique",
  "source_bindings_complete",
  "logic_route_complete",
  "shape_system_consistent",
  "typography_craft_checked",
  "optical_alignment_checked",
  "hierarchy_survives_grayscale",
  "semantic_color_checked",
]);

// ---------------------------------------------------------------------------
// Python parity helpers.

const PY_SPACE_CLASS = "\\t\\n\\x0b\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_SPACE_CLASS}]+|[${PY_SPACE_CLASS}]+$`, "g");

function pyStrip(value) {
  return value.replace(PY_STRIP_RE, "");
}

function cpLen(value) {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

function trimLen(value) {
  return cpLen(pyStrip(value));
}

function cpCompare(a, b) {
  const ita = a[Symbol.iterator]();
  const itb = b[Symbol.iterator]();
  for (;;) {
    const na = ita.next();
    const nb = itb.next();
    if (na.done && nb.done) return 0;
    if (na.done) return -1;
    if (nb.done) return 1;
    const ca = na.value.codePointAt(0);
    const cb = nb.value.codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
}

function pySorted(iterable) {
  return [...iterable].sort(cpCompare);
}

// Python str() for interpolated values (None -> "None").
function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function isSubset(subset, container) {
  const has = container instanceof Set ? (item) => container.has(item) : (item) => container.includes(item);
  for (const item of subset) if (!has(item)) return false;
  return true;
}

function setDifference(a, b) {
  const out = new Set();
  for (const item of a) if (!b.has(item)) out.add(item);
  return out;
}

function setIntersects(a, b) {
  const has = b instanceof Set ? (item) => b.has(item) : (item) => b.includes(item);
  for (const item of a) if (has(item)) return true;
  return false;
}

function setEquals(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function uniqueSize(items) {
  return new Set(items).size;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// format(x, ".2f"): exact decimal rounding of the double, ties to even.
function pyFormat2f(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const rawExponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let exponent;
  if (rawExponent === 0) {
    exponent = -1074;
  } else {
    mantissa |= 0x10000000000000n;
    exponent = rawExponent - 1075;
  }
  let numerator;
  let denominator;
  if (exponent >= 0) {
    numerator = mantissa * (1n << BigInt(exponent)) * 100n;
    denominator = 1n;
  } else {
    numerator = mantissa * 100n;
    denominator = 1n << BigInt(-exponent);
  }
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;
  if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) {
    quotient += 1n;
  }
  const text = `${quotient / 100n}.${(quotient % 100n).toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

// Path.resolve() analog: absolute, symlinks resolved for the existing prefix.
function pyResolve(value) {
  const resolvePrefix = (absolute) => {
    try {
      return realpathSync(absolute);
    } catch {
      const parent = path.dirname(absolute);
      if (parent === absolute) return absolute;
      return path.join(resolvePrefix(parent), path.basename(absolute));
    }
  };
  return resolvePrefix(path.resolve(value));
}

// `resolved_root in resolved_child.parents` (proper ancestor).
function isProperAncestor(root, child) {
  const rel = path.relative(root, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

export function issue(code, path_, message) {
  return { code, path: path_, message };
}

export function valid_ref(ref) {
  if (typeof ref !== "string" || !ref || ref.startsWith("/") || ref.startsWith("~")) return false;
  return !ref.split("/").filter((item) => item !== "" && item !== ".").includes("..");
}

export function finite_number(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function sha256_file(filePath) {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

export function png_dimensions(filePath) {
  const data = readFileSync(filePath);
  if (
    data.length < 24
    || !data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || data.subarray(12, 16).toString("latin1") !== "IHDR"
  ) {
    return null;
  }
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

export function read_json_file(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export function valid_short_string_list(value) {
  return (
    Array.isArray(value)
    && value.length <= 6
    && value.length === uniqueSize(value)
    && value.every((item) => typeof item === "string" && trimLen(item) >= 2 && trimLen(item) <= 100)
  );
}

export function validate_expression_grammar(grammarId, evidenceShapes, proofBindingKinds, recipeDataRefs, path_) {
  const errors = [];
  const grammar = EXPRESSION_GRAMMARS[grammarId];
  if (grammar === undefined) {
    return [issue("EXPRESSION_GRAMMAR", path_, `Unknown expression grammar: ${pyrepr(grammarId)}.`)];
  }

  const requiredShapeSets = (grammar.required_shape_sets ?? []).map((items) => new Set(items));
  if (!requiredShapeSets.length || !requiredShapeSets.some((required) => isSubset(required, evidenceShapes))) {
    const expected = requiredShapeSets.map((items) => pySorted(items));
    errors.push(issue("EXPRESSION_SHAPE_COMPATIBILITY", path_, `${grammarId} requires one evidence-shape set from ${pyreprList(expected)}.`));
  }

  const proofKindSet = new Set(proofBindingKinds);
  const requiredKindSets = (grammar.required_binding_kind_sets ?? []).map((items) => new Set(items));
  if (requiredKindSets.length && !requiredKindSets.some((required) => isSubset(required, proofKindSet))) {
    const expected = requiredKindSets.map((items) => pySorted(items));
    errors.push(issue("EXPRESSION_BINDING_KINDS", path_, `${grammarId} requires one proof-binding kind set from ${pyreprList(expected)}.`));
  }
  for (const [kind, minimum] of Object.entries(grammar.minimum_kind_counts ?? {})) {
    if (proofBindingKinds.filter((item) => item === kind).length < minimum) {
      errors.push(issue("EXPRESSION_BINDING_COUNT", path_, `${grammarId} requires at least ${minimum} ${kind} proof bindings.`));
    }
  }
  const minimumProofs = Object.hasOwn(grammar, "minimum_proof_bindings") ? grammar.minimum_proof_bindings : 1;
  if (proofBindingKinds.length < minimumProofs) {
    errors.push(issue("EXPRESSION_PROOF_COUNT", path_, `${grammarId} requires at least ${minimumProofs} proof bindings.`));
  }
  if (grammar.requires_data_requirement === true && !recipeDataRefs.size) {
    errors.push(issue("EXPRESSION_DATA_REQUIRED", path_, `${grammarId} requires a declared data-requirement ref.`));
  }
  return errors;
}

export function validate(payload, assetRoot = null, { require_expression_recipes = false, require_finance_route = false } = {}) {
  const errors = [];
  if (!isObject(payload)) {
    return [issue("ROOT", "$", "Expected an object.")];
  }
  if (payload.schema_version !== "visual-direction-set-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected visual-direction-set-v1."));
  }
  if (!/^VDSET_[A-Za-z0-9_:-]{8,}$/.test(pyStr(payload.direction_set_id || ""))) {
    errors.push(issue("DIRECTION_SET_ID", "$.direction_set_id", "Invalid direction-set ID."));
  }

  const state = payload.state === undefined ? null : payload.state;
  if (!["draft", "previewed", "selected"].includes(state)) {
    errors.push(issue("STATE", "$.state", "State must be draft, previewed, or selected."));
  }

  const inputRefsValue = payload.input_refs;
  let inputRefs;
  if (
    !Array.isArray(inputRefsValue)
    || !inputRefsValue.length
    || !inputRefsValue.every((ref) => typeof ref === "string" && trimLen(ref) >= 3)
    || inputRefsValue.length !== uniqueSize(inputRefsValue)
  ) {
    errors.push(issue("INPUT_REFS", "$.input_refs", "At least one unique upstream input ref is required."));
    inputRefs = new Set();
  } else {
    inputRefs = new Set(inputRefsValue);
  }

  const declaredRefSets = new Map([["input_refs", inputRefs]]);
  for (const key of ["fact_refs", "data_requirement_refs"]) {
    const value = payload[key];
    if (
      !Array.isArray(value)
      || !value.every((ref) => typeof ref === "string" && pyStrip(ref))
      || value.length !== uniqueSize(value)
    ) {
      errors.push(issue("UPSTREAM_REFS", `$.${key}`, `${key} must be a unique array of declared upstream refs.`));
      declaredRefSets.set(key, new Set());
    } else {
      declaredRefSets.set(key, new Set(value));
    }
  }
  const refOwners = new Map();
  for (const [key, refs] of declaredRefSets) {
    for (const ref of refs) {
      if (!refOwners.has(ref)) refOwners.set(ref, []);
      refOwners.get(ref).push(key);
    }
  }

  const intentLock = payload.intent_lock === undefined ? null : payload.intent_lock;
  let intentRelationship = null;
  let intentEvidenceShapes = new Set();
  let intentRendererRoute = null;
  let intentFinanceTransform = null;
  let intentBaselinePolicy = null;
  let intentChartDecision = null;
  if (intentLock === null) {
    if (require_finance_route) {
      errors.push(issue("FINANCE_INTENT_LOCK", "$.intent_lock", "Strict finance generation requires one immutable set-level intent lock."));
    }
  } else if (!isObject(intentLock)) {
    errors.push(issue("FINANCE_INTENT_LOCK", "$.intent_lock", "Intent lock must be an object."));
  } else {
    for (const [key, maximum] of [["reader_job", 120], ["reader_question", 160], ["compact_fallback", 180]]) {
      const value = intentLock[key];
      if (typeof value !== "string" || !(trimLen(value) >= 3 && trimLen(value) <= maximum)) {
        errors.push(issue("FINANCE_INTENT_TEXT", `$.intent_lock.${key}`, `${key} must be a concise non-empty string.`));
      }
    }
    intentRelationship = pyStr(intentLock.analytic_relationship || "");
    if (!(intentRelationship in MARKET_RELATIONSHIPS)) {
      errors.push(issue("FINANCE_INTENT_RELATIONSHIP", "$.intent_lock.analytic_relationship", "Use a registered analytic relationship."));
      intentRelationship = null;
    }
    const shapesValue = intentLock.evidence_shape_refs;
    if (
      !Array.isArray(shapesValue)
      || !(shapesValue.length >= 1 && shapesValue.length <= 8)
      || !shapesValue.every((item) => typeof item === "string")
      || shapesValue.length !== uniqueSize(shapesValue)
      || !isSubset(new Set(shapesValue), EVIDENCE_SHAPES)
    ) {
      errors.push(issue("FINANCE_INTENT_SHAPES", "$.intent_lock.evidence_shape_refs", "Use one to eight unique registered evidence shapes."));
    } else {
      intentEvidenceShapes = new Set(shapesValue);
    }
    intentFinanceTransform = pyStr(intentLock.finance_transform || "");
    if (!FINANCE_TRANSFORMS.has(intentFinanceTransform)) {
      errors.push(issue("FINANCE_TRANSFORM", "$.intent_lock.finance_transform", "Use a registered finance transform."));
      intentFinanceTransform = null;
    }
    intentBaselinePolicy = pyStr(intentLock.baseline_policy || "");
    if (!BASELINE_POLICIES.has(intentBaselinePolicy)) {
      errors.push(issue("BASELINE_POLICY", "$.intent_lock.baseline_policy", "Use a registered baseline policy."));
      intentBaselinePolicy = null;
    }
    intentChartDecision = pyStr(intentLock.chart_decision || "");
    if (!CHART_DECISIONS.has(intentChartDecision)) {
      errors.push(issue("CHART_DECISION", "$.intent_lock.chart_decision", "Use a registered chart decision."));
      intentChartDecision = null;
    }
    intentRendererRoute = pyStr(intentLock.renderer_route || "");
    if (!RENDERER_ROUTES.has(intentRendererRoute)) {
      errors.push(issue("INTENT_RENDERER", "$.intent_lock.renderer_route", "Use a registered renderer route."));
      intentRendererRoute = null;
    }
    const basis = intentLock.comparison_basis;
    const expectedBasisKeys = new Set(["unit", "currency", "period", "benchmark", "normalization"]);
    if (!isObject(basis) || !setEquals(new Set(Object.keys(basis)), expectedBasisKeys) || !Object.values(basis).every((value) => value === null || typeof value === "string")) {
      errors.push(issue("COMPARISON_BASIS", "$.intent_lock.comparison_basis", "Declare unit, currency, period, benchmark, and normalization as strings or null."));
    }
    if (intentChartDecision === "diagram" && intentBaselinePolicy !== "none") {
      errors.push(issue("INTENT_ENCODING", "$.intent_lock", "A qualitative diagram must use baseline_policy none."));
    }
    if (intentChartDecision === "full_ohlcv" && intentRendererRoute !== "render-cuebook-thesis-chart") {
      errors.push(issue("INTENT_RENDERER", "$.intent_lock", "Full OHLCV must route to render-cuebook-thesis-chart."));
    }
  }
  const ambiguousRefs = pySorted([...refOwners.entries()].filter(([, owners]) => owners.length > 1).map(([ref]) => ref));
  if (ambiguousRefs.length) {
    errors.push(issue("UPSTREAM_REF_AMBIGUOUS", "$", `Upstream refs must belong to one namespace: ${pyreprList(ambiguousRefs)}`));
  }
  const factRefs = declaredRefSets.get("fact_refs");
  const dataRequirementRefs = declaredRefSets.get("data_requirement_refs");
  const declaredSourceRefs = new Set();
  for (const refs of declaredRefSets.values()) for (const ref of refs) declaredSourceRefs.add(ref);

  let designVariance = null;
  let visualDensity = null;
  let recentPaletteIds = new Set();
  let signaturePaletteId = null;
  const designRead = payload.design_read;
  if (!isObject(designRead)) {
    errors.push(issue("DESIGN_READ", "$.design_read", "A static Design Read is required before layout."));
  } else {
    const statement = designRead.statement;
    if (typeof statement !== "string" || !(trimLen(statement) >= 20 && trimLen(statement) <= 300)) {
      errors.push(issue("DESIGN_READ_FIELD", "$.design_read.statement", "Design Read statement must be 20-300 characters."));
    }
    const mode = designRead.mode;
    if (!DESIGN_MODES.has(mode)) {
      errors.push(issue("DESIGN_READ_FIELD", "$.design_read.mode", "Unsupported design mode."));
    }
    for (const [key, minimum, maximum] of [["audience", 3, 120], ["design_language", 3, 120]]) {
      const value = designRead[key];
      if (typeof value !== "string" || !(trimLen(value) >= minimum && trimLen(value) <= maximum)) {
        errors.push(issue("DESIGN_READ_FIELD", `$.design_read.${key}`, `${key} must be ${minimum}-${maximum} characters.`));
      }
    }
    if (!TONES.has(designRead.tone)) {
      errors.push(issue("DESIGN_READ_FIELD", "$.design_read.tone", "Unsupported visual tone."));
    }
    if (designRead.reading_context !== "feed_static_3_second") {
      errors.push(issue("DESIGN_READ_FIELD", "$.design_read.reading_context", "Expected feed_static_3_second."));
    }
    const variance = designRead.design_variance;
    const densityDial = designRead.visual_density;
    if (!isInt(variance) || !(variance >= 1 && variance <= 10)) {
      errors.push(issue("DESIGN_DIAL", "$.design_read.design_variance", "Design variance must be an integer from 1 to 10."));
    } else {
      designVariance = variance;
    }
    if (!isInt(densityDial) || !(densityDial >= 1 && densityDial <= 10)) {
      errors.push(issue("DESIGN_DIAL", "$.design_read.visual_density", "Visual density must be an integer from 1 to 10."));
    } else {
      visualDensity = densityDial;
    }
    const visualProfile = designRead.creator_visual_profile;
    if (!isObject(visualProfile)) {
      errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile", "A derived creator visual profile is required."));
    } else {
      if (!PROFILE_SOURCES.has(visualProfile.source)) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.source", "Unsupported creator visual profile source."));
      }
      const sourceRef = visualProfile.source_ref === undefined ? null : visualProfile.source_ref;
      if (sourceRef !== null && (typeof sourceRef !== "string" || !(trimLen(sourceRef) >= 3 && trimLen(sourceRef) <= 160))) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.source_ref", "Profile source ref must be null or 3-160 characters."));
      }
      if (!PROFILE_REGISTERS.has(visualProfile.register)) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.register", "Unsupported creator register."));
      }
      for (const key of ["energy", "conviction", "technicality", "emotionality", "compression"]) {
        const value = visualProfile[key];
        if (!isInt(value) || !(value >= 1 && value <= 5)) {
          errors.push(issue("CREATOR_VISUAL_PROFILE", `$.design_read.creator_visual_profile.${key}`, `${key} must be an integer from 1 to 5.`));
        }
      }
      for (const [key, allowed] of [
        ["contrast", new Set(["soft", "balanced", "high"])],
        ["chroma", new Set(["restrained", "balanced", "vivid"])],
        ["neutral_temperature", new Set(["cool", "neutral", "warm"])],
        ["surface_bias", new Set(["light", "dark", "mixed"])],
      ]) {
        if (!allowed.has(visualProfile[key])) {
          errors.push(issue("CREATOR_VISUAL_PROFILE", `$.design_read.creator_visual_profile.${key}`, `Unsupported ${key}.`));
        }
      }
      const signature = visualProfile.signature_palette_id === undefined ? null : visualProfile.signature_palette_id;
      if (signature !== null && !(typeof signature === "string" && signature in PALETTE_PRESETS)) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.signature_palette_id", "Signature palette must resolve in the preset registry."));
      } else {
        signaturePaletteId = signature;
      }
      const recent = visualProfile.recent_palette_ids;
      if (!Array.isArray(recent) || recent.length > 6 || recent.length !== uniqueSize(recent) || !recent.every((item) => typeof item === "string" && item in PALETTE_PRESETS)) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.recent_palette_ids", "Recent palettes must be up to six unique registered preset IDs."));
      } else {
        recentPaletteIds = new Set(recent);
      }
      const visualContextRefs = visualProfile.visual_context_refs;
      if (!Array.isArray(visualContextRefs) || visualContextRefs.length > 6 || visualContextRefs.length !== uniqueSize(visualContextRefs) || !visualContextRefs.every((item) => typeof item === "string" && trimLen(item) >= 3 && trimLen(item) <= 180)) {
        errors.push(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.visual_context_refs", "Visual context refs must be up to six unique refs."));
      }
      if (visualProfile.source === "creator_visual_corpus" && (!Array.isArray(visualContextRefs) || !visualContextRefs.length)) {
        errors.push(issue("CREATOR_VISUAL_CONTEXT", "$.design_read.creator_visual_profile.visual_context_refs", "creator_visual_corpus requires at least one visual context ref."));
      }
    }
    let preserve = designRead.preserve;
    let retire = designRead.retire;
    if (!valid_short_string_list(preserve)) {
      errors.push(issue("DESIGN_READ_LIST", "$.design_read.preserve", "Preserve must contain up to six unique short strings."));
      preserve = [];
    }
    if (!valid_short_string_list(retire)) {
      errors.push(issue("DESIGN_READ_LIST", "$.design_read.retire", "Retire must contain up to six unique short strings."));
      retire = [];
    }
    if (mode === "redesign_preserve" && !preserve.length) {
      errors.push(issue("PRESERVE_REQUIRED", "$.design_read.preserve", "Preserve mode must name at least one trait to keep."));
    }
    if (mode === "redesign_overhaul" && !retire.length) {
      errors.push(issue("RETIRE_REQUIRED", "$.design_read.retire", "Overhaul mode must name at least one pattern to retire."));
    }
  }

  const message = payload.message;
  if (!isObject(message)) {
    errors.push(issue("MESSAGE", "$.message", "Message must be an object."));
  } else {
    for (const [key, maximum] of [["claim", 80], ["because", 140], ["implication", 120]]) {
      const value = message[key];
      if (typeof value !== "string" || trimLen(value) < 2 || cpLen(value) > maximum) {
        errors.push(issue("MESSAGE_FIELD", `$.message.${key}`, `${key} must be 2-${maximum} characters.`));
      }
    }
    if (!["long", "short", "relative", "avoid", "watch", "explain", "neutral"].includes(message.direction)) {
      errors.push(issue("MESSAGE_DIRECTION", "$.message.direction", "Unsupported direction."));
    }
    const assets = message.asset_refs;
    if (!Array.isArray(assets) || !assets.length) {
      errors.push(issue("MESSAGE_ASSETS", "$.message.asset_refs", "At least one asset is required."));
    }
  }

  let bindings = payload.bindings;
  const bindingIds = new Set();
  const bindingStates = new Map();
  const bindingKinds = new Map();
  const selectedMaterialBindingIds = new Set();
  if (!Array.isArray(bindings) || !bindings.length) {
    errors.push(issue("BINDINGS", "$.bindings", "At least one binding is required."));
    bindings = [];
  }
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const path_ = `$.bindings[${index}]`;
    if (!isObject(binding)) {
      errors.push(issue("BINDING", path_, "Binding must be an object."));
      continue;
    }
    const bindingId = binding.binding_id === undefined ? null : binding.binding_id;
    if (!/^BIND_[A-Za-z0-9_:-]{4,}$/.test(pyStr(bindingId || ""))) {
      errors.push(issue("BINDING_ID", `${path_}.binding_id`, "Invalid binding ID."));
    } else if (bindingIds.has(bindingId)) {
      errors.push(issue("BINDING_DUPLICATE", `${path_}.binding_id`, "Binding IDs must be unique."));
    } else {
      bindingIds.add(bindingId);
      bindingStates.set(pyStr(bindingId), pyStr(binding.state || ""));
    }
    const kind = binding.kind;
    if (!BINDING_KINDS.has(kind)) {
      errors.push(issue("BINDING_KIND", `${path_}.kind`, "Unsupported binding kind."));
    } else if (typeof bindingId === "string" && bindingIds.has(bindingId)) {
      bindingKinds.set(bindingId, pyStr(kind));
    }
    const label = binding.label;
    if (typeof label !== "string" || !(trimLen(label) >= 1 && trimLen(label) <= 160)) {
      errors.push(issue("BINDING_LABEL", `${path_}.label`, "Binding label must be 1-160 characters."));
    }
    const stateValue = binding.state;
    if (!BINDING_STATES.has(stateValue)) {
      errors.push(issue("BINDING_STATE", `${path_}.state`, "Unsupported binding state."));
    }
    let refs = binding.source_refs;
    if (
      !Array.isArray(refs)
      || !refs.length
      || !refs.every((ref) => typeof ref === "string" && pyStrip(ref))
      || refs.length !== uniqueSize(refs)
    ) {
      errors.push(issue("BINDING_SOURCES", `${path_}.source_refs`, "Every binding needs unique non-empty upstream refs."));
      refs = [];
    }
    const unknownSources = pySorted(setDifference(new Set(refs), declaredSourceRefs));
    if (unknownSources.length) {
      errors.push(issue("BINDING_SOURCE_LINEAGE", `${path_}.source_refs`, `Binding refs are not declared by input_refs, fact_refs, or data_requirement_refs: ${pyreprList(unknownSources)}`));
    }
    if (FACTUAL_BINDING_KINDS.has(kind) && refs.length && !refs.some((ref) => factRefs.has(ref) || dataRequirementRefs.has(ref))) {
      errors.push(issue("BINDING_FACT_LINEAGE", `${path_}.source_refs`, "Factual and derived bindings need a declared fact or data-requirement ref."));
    }
    const requestClass = binding.request_class;
    if (!REQUEST_CLASSES.has(requestClass)) {
      errors.push(issue("BINDING_REQUEST_CLASS", `${path_}.request_class`, "Binding request_class must match the upstream expression-plan vocabulary."));
    } else if ((kind === "creator_judgment") !== (requestClass === "creator_judgment")) {
      errors.push(issue("BINDING_REQUEST_CLASS", `${path_}.request_class`, "Only creator-judgment bindings may use creator_judgment request class."));
    }
    const materialToClaim = binding.material_to_claim;
    if (typeof materialToClaim !== "boolean") {
      errors.push(issue("BINDING_MATERIALITY", `${path_}.material_to_claim`, "Binding material_to_claim must be boolean."));
    }
    const selectedForDisplay = binding.selected_for_display;
    if (typeof selectedForDisplay !== "boolean") {
      errors.push(issue("BINDING_SELECTION", `${path_}.selected_for_display`, "Binding selected_for_display must be boolean."));
    }
    if (selectedForDisplay === true && UPSTREAM_REQUEST_CLASSES.has(requestClass) && !refs.some((ref) => dataRequirementRefs.has(ref))) {
      errors.push(issue("BINDING_REQUIREMENT_LINEAGE", `${path_}.source_refs`, "A selected upstream request must resolve to a declared data requirement ref."));
    }
    if (typeof bindingId === "string" && bindingIds.has(bindingId) && materialToClaim === true && selectedForDisplay === true) {
      selectedMaterialBindingIds.add(pyStr(bindingId));
    }
  }

  const selectedMaterialEventBindingIds = new Set(
    [...selectedMaterialBindingIds].filter((bindingId) => bindingKinds.get(bindingId) === "event"),
  );

  const logicSteps = new Map();
  let logicSpine = [];
  const logicLinkPairs = new Set();
  const logicProgression = payload.logic_progression;
  if (!isObject(logicProgression)) {
    errors.push(issue("LOGIC_PROGRESSION", "$.logic_progression", "A source-linked logic progression is required before layout."));
  } else {
    if (!LOGIC_PATTERNS.has(logicProgression.pattern)) {
      errors.push(issue("LOGIC_PATTERN", "$.logic_progression.pattern", "Unsupported logic progression pattern."));
    }
    let steps = logicProgression.steps;
    if (!Array.isArray(steps) || !(steps.length >= 3 && steps.length <= 6)) {
      errors.push(issue("LOGIC_STEPS", "$.logic_progression.steps", "Use three to six logic steps."));
      steps = [];
    }
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const path_ = `$.logic_progression.steps[${index}]`;
      if (!isObject(step)) {
        errors.push(issue("LOGIC_STEP", path_, "Logic step must be an object."));
        continue;
      }
      const stepId = step.step_id === undefined ? null : step.step_id;
      if (!/^LSTEP_[A-Za-z0-9_:-]{3,}$/.test(pyStr(stepId || ""))) {
        errors.push(issue("LOGIC_STEP_ID", `${path_}.step_id`, "Invalid logic step ID."));
        continue;
      }
      if (logicSteps.has(stepId)) {
        errors.push(issue("LOGIC_STEP_DUPLICATE", `${path_}.step_id`, "Logic step IDs must be unique."));
        continue;
      }
      logicSteps.set(pyStr(stepId), step);
      if (!LOGIC_ROLES.has(step.role)) {
        errors.push(issue("LOGIC_STEP_ROLE", `${path_}.role`, "Unsupported logic step role."));
      }
      const stepState = step.state;
      if (!LOGIC_STATES.has(stepState)) {
        errors.push(issue("LOGIC_STEP_STATE", `${path_}.state`, "Unsupported logic step state."));
      }
      const textValue = step.text;
      if (typeof textValue !== "string" || !(trimLen(textValue) >= 2 && trimLen(textValue) <= 120)) {
        errors.push(issue("LOGIC_STEP_TEXT", `${path_}.text`, "Logic step text must be 2-120 characters."));
      }
      let stepRefs = step.binding_refs;
      if (!Array.isArray(stepRefs) || !(stepRefs.length >= 1 && stepRefs.length <= 4) || stepRefs.length !== uniqueSize(stepRefs)) {
        errors.push(issue("LOGIC_STEP_BINDINGS", `${path_}.binding_refs`, "Use one to four unique binding refs."));
        stepRefs = [];
      }
      const unknownRefs = setDifference(new Set(stepRefs), bindingIds);
      if (unknownRefs.size) {
        errors.push(issue("LOGIC_STEP_BINDINGS", `${path_}.binding_refs`, `Unknown binding refs: ${pyreprList(pySorted(unknownRefs))}`));
      }
      const expectedStates = {
        observed: new Set(["observed"]),
        reported: new Set(["reported", "observed"]),
        derived: new Set(["derived"]),
        creator_view: new Set(["creator_view"]),
        conditional: new Set(["conditional", "creator_view"]),
      }[pyStr(stepState)] ?? new Set();
      if (stepRefs.length && expectedStates.size && !stepRefs.some((ref) => expectedStates.has(bindingStates.get(pyStr(ref))))) {
        errors.push(issue("LOGIC_STEP_STATE_BINDING", `${path_}.state`, "Step state must be supported by at least one compatible binding state."));
      }
    }

    const roles = new Set([...logicSteps.values()].map((step) => pyStr(step.role)));
    if (logicSteps.size && !setIntersects(roles, SUPPORT_LOGIC_ROLES)) {
      errors.push(issue("LOGIC_SUPPORT", "$.logic_progression.steps", "Logic progression needs a supporting event, evidence, mechanism, tension, catalyst, or condition."));
    }
    if (logicSteps.size && !setIntersects(roles, CONCLUSION_LOGIC_ROLES)) {
      errors.push(issue("LOGIC_CONCLUSION", "$.logic_progression.steps", "Logic progression needs a judgment, market effect, trade implication, condition, or invalidation."));
    }

    let links = logicProgression.links;
    const adjacency = new Map();
    const undirected = new Map();
    for (const stepId of logicSteps.keys()) {
      adjacency.set(stepId, new Set());
      undirected.set(stepId, new Set());
    }
    if (!Array.isArray(links) || !(links.length >= 2 && links.length <= 8)) {
      errors.push(issue("LOGIC_LINKS", "$.logic_progression.links", "Use two to eight directed logic links."));
      links = [];
    }
    for (let index = 0; index < links.length; index += 1) {
      const link = links[index];
      const path_ = `$.logic_progression.links[${index}]`;
      if (!isObject(link)) {
        errors.push(issue("LOGIC_LINK", path_, "Logic link must be an object."));
        continue;
      }
      const source = pyStr(link.from_step_id || "");
      const target = pyStr(link.to_step_id || "");
      const pair = `${source}\x00${target}`;
      if (!logicSteps.has(source) || !logicSteps.has(target)) {
        errors.push(issue("LOGIC_LINK_REF", path_, "Logic links must reference declared steps."));
        continue;
      }
      if (source === target) {
        errors.push(issue("LOGIC_LINK_SELF", path_, "Logic links cannot point to the same step."));
        continue;
      }
      if (logicLinkPairs.has(pair)) {
        errors.push(issue("LOGIC_LINK_DUPLICATE", path_, "Logic links must be unique."));
        continue;
      }
      logicLinkPairs.add(pair);
      adjacency.get(source).add(target);
      undirected.get(source).add(target);
      undirected.get(target).add(source);
      if (!LOGIC_RELATIONS.has(link.relation)) {
        errors.push(issue("LOGIC_RELATION", `${path_}.relation`, "Unsupported logic relation."));
      }
    }

    const visiting = new Set();
    const visited = new Set();
    const hasCycle = (node) => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const nextNode of adjacency.get(node) ?? new Set()) {
        if (hasCycle(nextNode)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    let cycle = false;
    for (const stepId of logicSteps.keys()) {
      if (!visited.has(stepId) && hasCycle(stepId)) {
        cycle = true;
        break;
      }
    }
    if (cycle) {
      errors.push(issue("LOGIC_CYCLE", "$.logic_progression.links", "Compact public logic must be acyclic."));
    }
    if (logicSteps.size) {
      const connected = new Set();
      const pending = [logicSteps.keys().next().value];
      while (pending.length) {
        const current = pending.pop();
        if (connected.has(current)) continue;
        connected.add(current);
        for (const neighbor of undirected.get(current) ?? new Set()) {
          if (!connected.has(neighbor)) pending.push(neighbor);
        }
      }
      if (!setEquals(connected, new Set(logicSteps.keys()))) {
        errors.push(issue("LOGIC_DISCONNECTED", "$.logic_progression.links", "All logic steps must belong to one connected argument."));
      }
    }

    const spine = logicProgression.public_spine_step_ids;
    if (!Array.isArray(spine) || !(spine.length >= 3 && spine.length <= 5) || spine.length !== uniqueSize(spine)) {
      errors.push(issue("LOGIC_SPINE", "$.logic_progression.public_spine_step_ids", "Use three to five unique public spine steps."));
    } else {
      logicSpine = spine.map((item) => pyStr(item));
      if (!logicSpine.every((item) => logicSteps.has(item))) {
        errors.push(issue("LOGIC_SPINE_REF", "$.logic_progression.public_spine_step_ids", "Public spine references undeclared steps."));
      }
      for (let index = 0; index + 1 < logicSpine.length; index += 1) {
        const source = logicSpine[index];
        const target = logicSpine[index + 1];
        if (!logicLinkPairs.has(`${source}\x00${target}`)) {
          errors.push(issue("LOGIC_SPINE_LINK", "$.logic_progression.public_spine_step_ids", `Missing direct link ${source} -> ${target}.`));
        }
      }
      const spineRoles = new Set(logicSpine.map((stepId) => pyStr((logicSteps.get(stepId) ?? {}).role)));
      if (!setIntersects(spineRoles, SUPPORT_LOGIC_ROLES) || !setIntersects(spineRoles, CONCLUSION_LOGIC_ROLES)) {
        errors.push(issue("LOGIC_SPINE_ROLES", "$.logic_progression.public_spine_step_ids", "Public spine must contain support and conclusion roles."));
      }
    }

    const messageMap = logicProgression.message_step_map;
    const expectedMapKeys = new Set(["claim_step_id", "because_step_id", "implication_step_id"]);
    if (!isObject(messageMap) || !setEquals(new Set(Object.keys(messageMap)), expectedMapKeys)) {
      errors.push(issue("LOGIC_MESSAGE_MAP", "$.logic_progression.message_step_map", "Map claim, because, and implication to logic steps."));
    } else {
      const mapped = ["claim_step_id", "because_step_id", "implication_step_id"].map((key) => pyStr(messageMap[key]));
      if (uniqueSize(mapped) !== 3 || !mapped.every((item) => logicSpine.includes(item))) {
        errors.push(issue("LOGIC_MESSAGE_MAP", "$.logic_progression.message_step_map", "Message mappings must be three distinct public spine steps."));
      }
      const expectedRoles = [
        new Set(["judgment", "market_effect", "trade_implication"]),
        SUPPORT_LOGIC_ROLES,
        CONCLUSION_LOGIC_ROLES,
      ];
      const mapKeys = ["claim_step_id", "because_step_id", "implication_step_id"];
      for (let index = 0; index < mapKeys.length; index += 1) {
        const stepId = mapped[index];
        const allowed = expectedRoles[index];
        if (logicSteps.has(stepId) && !allowed.has(logicSteps.get(stepId).role)) {
          errors.push(issue("LOGIC_MESSAGE_ROLE", `$.logic_progression.message_step_map.${mapKeys[index]}`, "Mapped logic step has an incompatible role."));
        }
      }
    }
  }

  let directions = payload.directions;
  if (!Array.isArray(directions) || ![1, 3].includes(directions.length)) {
    errors.push(issue("DIRECTION_COUNT", "$.directions", "Use one selected direction or three preview directions."));
    directions = [];
  } else if (directions.length === 1 && state !== "selected") {
    errors.push(issue("DIRECTION_COUNT", "$.directions", "A single release-grade direction is valid only after selection."));
  }
  const directionIds = new Set();
  const htmlRefs = new Set();
  const previewRefs = new Set();
  const captureReportRefs = new Set();
  const renderAuditRefs = new Set();
  const renderedLayoutFingerprints = new Set();
  const skeletons = new Set();
  const routes = new Set();
  const designLogics = new Set();
  const layoutSignatures = new Set();
  const layoutGrids = new Set();
  const layoutAlignments = new Set();
  const layoutDensities = new Set();
  const paletteFamilies = new Set();
  const paletteStrategies = new Set();
  const presetIds = new Set();
  const paletteChoices = [];
  const candidateJobs = new Set();
  const candidateFamilies = new Set();
  const primaryGrammars = new Set();
  const evidenceShapeSignatures = new Set();
  let expressionRecipeCount = 0;
  let financeRouteCount = 0;
  const compositionArchetypes = new Set();
  const scores = new Map();

  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index];
    const path_ = `$.directions[${index}]`;
    if (!isObject(direction)) {
      errors.push(issue("DIRECTION", path_, "Direction must be an object."));
      continue;
    }
    const rendererMode = direction.renderer_mode ?? "cuebook_template";
    if (!new Set(["cuebook_template", "finished_bitmap"]).has(rendererMode)) {
      errors.push(issue("RENDERER_MODE", `${path_}.renderer_mode`, "Use cuebook_template or finished_bitmap."));
    }
    const directionId = direction.direction_id === undefined ? null : direction.direction_id;
    if (!/^VDIR_[A-Za-z0-9_:-]{6,}$/.test(pyStr(directionId || ""))) {
      errors.push(issue("DIRECTION_ID", `${path_}.direction_id`, "Invalid direction ID."));
    } else if (directionIds.has(directionId)) {
      errors.push(issue("DIRECTION_DUPLICATE", `${path_}.direction_id`, "Direction IDs must be unique."));
    } else {
      directionIds.add(directionId);
    }
    const designLogic = direction.design_logic;
    if (!DESIGN_LOGICS.has(designLogic)) {
      errors.push(issue("DESIGN_LOGIC", `${path_}.design_logic`, "Use product_native, benchmark_transfer, or content_native."));
    } else {
      designLogics.add(pyStr(designLogic));
    }
    const anchor = direction.design_anchor;
    const expectedAnchorKind = {
      product_native: "cuebook_product",
      benchmark_transfer: "verified_benchmark",
      content_native: "content_motif",
    }[pyStr(designLogic)];
    if (!isObject(anchor)) {
      errors.push(issue("DESIGN_ANCHOR", `${path_}.design_anchor`, "A structured design anchor is required."));
    } else {
      const anchorSourceKind = anchor.source_kind === undefined ? null : anchor.source_kind;
      if (anchorSourceKind !== (expectedAnchorKind === undefined ? null : expectedAnchorKind)) {
        errors.push(issue("DESIGN_ANCHOR_KIND", `${path_}.design_anchor.source_kind`, `${pyStr(designLogic)} requires ${pyStr(expectedAnchorKind)}.`));
      }
      const sourceRef = anchor.source_ref;
      if (typeof sourceRef !== "string" || !(trimLen(sourceRef) >= 3 && trimLen(sourceRef) <= 300)) {
        errors.push(issue("DESIGN_ANCHOR_REF", `${path_}.design_anchor.source_ref`, "Design anchor needs a concrete source ref."));
      }
      if (designLogic === "benchmark_transfer") {
        if (typeof sourceRef !== "string" || !/^https:\/\//.test(sourceRef)) {
          errors.push(issue("BENCHMARK_REF", `${path_}.design_anchor.source_ref`, "Benchmark transfer requires a verified HTTPS source."));
        }
        const verifiedAt = anchor.verified_at;
        if (typeof verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(verifiedAt)) {
          errors.push(issue("BENCHMARK_VERIFIED_AT", `${path_}.design_anchor.verified_at`, "Benchmark transfer requires an ISO-8601 verification time."));
        }
      } else if (anchor.verified_at !== null && anchor.verified_at !== undefined) {
        errors.push(issue("DESIGN_ANCHOR_VERIFIED_AT", `${path_}.design_anchor.verified_at`, "Only benchmark transfer records verified_at."));
      }
      const principle = anchor.transferred_principle;
      if (typeof principle !== "string" || !(trimLen(principle) >= 8 && trimLen(principle) <= 240)) {
        errors.push(issue("DESIGN_ANCHOR_PRINCIPLE", `${path_}.design_anchor.transferred_principle`, "Name the structural principle carried into the direction."));
      }
      const excluded = anchor.excluded_surface_traits;
      if (!Array.isArray(excluded) || !(excluded.length >= 1 && excluded.length <= 6) || excluded.length !== uniqueSize(excluded) || !excluded.every((item) => typeof item === "string" && trimLen(item) >= 2 && trimLen(item) <= 100)) {
        errors.push(issue("DESIGN_ANCHOR_EXCLUSIONS", `${path_}.design_anchor.excluded_surface_traits`, "Name one to six surface traits that are intentionally not copied."));
      }
    }

    let grid = null;
    let alignment = null;
    let density = null;
    let entryRole = null;
    let paletteFamily = null;
    let paletteStrategy = null;
    let presetId = null;
    const layout = direction.layout_system;
    if (!isObject(layout)) {
      errors.push(issue("LAYOUT_SYSTEM", `${path_}.layout_system`, "A complete layout system is required."));
    } else {
      let hierarchy = layout.hierarchy;
      if (
        !Array.isArray(hierarchy)
        || !(hierarchy.length >= 2 && hierarchy.length <= 5)
        || hierarchy.length !== uniqueSize(hierarchy)
        || !isSubset(new Set(hierarchy), HIERARCHY_ROLES)
        || !hierarchy.includes("claim")
        || !setIntersects(new Set(hierarchy), new Set(["reason", "evidence", "implication"]))
      ) {
        errors.push(issue("LAYOUT_HIERARCHY", `${path_}.layout_system.hierarchy`, "Hierarchy needs claim plus at least one reason, evidence, or implication."));
        hierarchy = [];
      }
      grid = layout.grid === undefined ? null : layout.grid;
      alignment = layout.alignment === undefined ? null : layout.alignment;
      density = layout.density === undefined ? null : layout.density;
      entryRole = layout.entry_role === undefined ? null : layout.entry_role;
      const dataRole = layout.data_role === undefined ? null : layout.data_role;
      if (!ENTRY_ROLES.has(entryRole)) {
        errors.push(issue("LAYOUT_ENTRY_ROLE", `${path_}.layout_system.entry_role`, "Entry role must be claim, evidence, or condition."));
      }
      for (const [key, value, allowed] of [
        ["grid", grid, GRIDS],
        ["alignment", alignment, ALIGNMENTS],
        ["density", density, DENSITIES],
        ["data_role", dataRole, DATA_ROLES],
      ]) {
        if (!allowed.has(value)) {
          errors.push(issue("LAYOUT_FIELD", `${path_}.layout_system.${key}`, `Unsupported layout ${key}.`));
        }
      }
      if (GRIDS.has(grid)) layoutGrids.add(pyStr(grid));
      if (ALIGNMENTS.has(alignment)) layoutAlignments.add(pyStr(alignment));
      if (DENSITIES.has(density)) layoutDensities.add(pyStr(density));
      const typeScale = layout.type_scale;
      if (!isObject(typeScale)) {
        errors.push(issue("TYPE_SCALE", `${path_}.layout_system.type_scale`, "A numeric type scale is required."));
      } else {
        const hero = typeScale.hero_px_canvas;
        const body = typeScale.body_px_canvas;
        const meta = typeScale.meta_px_canvas;
        const ratio = typeScale.hero_body_ratio;
        if (!finite_number(hero) || !(hero >= 64 && hero <= 120)) {
          errors.push(issue("TYPE_SCALE_VALUE", `${path_}.layout_system.type_scale.hero_px_canvas`, "Hero type must be 64-120px on the 1244px authoring canvas."));
        }
        if (!finite_number(body) || !(body >= 28 && body <= 52)) {
          errors.push(issue("TYPE_SCALE_VALUE", `${path_}.layout_system.type_scale.body_px_canvas`, "Body type must be 28-52px on the 1244px authoring canvas."));
        }
        if (!finite_number(meta) || !(meta >= 18 && meta <= 30)) {
          errors.push(issue("TYPE_SCALE_VALUE", `${path_}.layout_system.type_scale.meta_px_canvas`, "Meta type must be 18-30px on the 1244px authoring canvas."));
        }
        if (!finite_number(ratio) || !(ratio >= 1.5 && ratio <= 5)) {
          errors.push(issue("TYPE_SCALE_VALUE", `${path_}.layout_system.type_scale.hero_body_ratio`, "Hero/body ratio must be 1.5-5."));
        } else if (finite_number(hero) && finite_number(body) && Math.abs(ratio - hero / body) > 0.08) {
          errors.push(issue("TYPE_SCALE_RATIO", `${path_}.layout_system.type_scale.hero_body_ratio`, "Reported ratio must match hero_px_canvas / body_px_canvas."));
        }
      }
      const craft = layout.craft_system;
      if (!isObject(craft)) {
        errors.push(issue("CRAFT_SYSTEM", `${path_}.layout_system.craft_system`, "A typography, surface, compact, and optical craft system is required."));
      } else {
        if (!["system", "brand", "creator"].includes(craft.type_family_mode)) {
          errors.push(issue("CRAFT_TYPE_FAMILY", `${path_}.layout_system.craft_system.type_family_mode`, "Unsupported type family mode."));
        }
        const claimWeight = craft.claim_weight;
        if (!isInt(claimWeight) || !(claimWeight >= 500 && claimWeight <= 900)) {
          errors.push(issue("CRAFT_CLAIM_WEIGHT", `${path_}.layout_system.craft_system.claim_weight`, "Claim weight must be 500-900."));
        }
        const claimLineHeight = craft.claim_line_height;
        if (!finite_number(claimLineHeight) || !(claimLineHeight >= 1 && claimLineHeight <= 1.25)) {
          errors.push(issue("CRAFT_LINE_HEIGHT", `${path_}.layout_system.craft_system.claim_line_height`, "Claim line height must be 1-1.25."));
        }
        if (craft.claim_wrap !== "balance" || craft.number_style !== "tabular-nums") {
          errors.push(issue("CRAFT_TYPOGRAPHY", `${path_}.layout_system.craft_system`, "Claims use balance and numbers use tabular-nums."));
        }
        for (const key of ["max_type_sizes", "max_weights"]) {
          const value = craft[key];
          if (!isInt(value) || !(value >= 2 && value <= 4)) {
            errors.push(issue("CRAFT_TYPE_LIMIT", `${path_}.layout_system.craft_system.${key}`, "Use two to four declared values."));
          }
        }
        if (!["sharp", "soft", "concentric", "mixed_documented"].includes(craft.radius_rule)) {
          errors.push(issue("CRAFT_RADIUS", `${path_}.layout_system.craft_system.radius_rule`, "Unsupported radius rule."));
        }
        if (!["whitespace", "divider", "shadow", "mixed"].includes(craft.surface_separation)) {
          errors.push(issue("CRAFT_SURFACE", `${path_}.layout_system.craft_system.surface_separation`, "Unsupported surface separation rule."));
        }
        const optical = craft.optical_priority;
        if (typeof optical !== "string" || !(trimLen(optical) >= 8 && trimLen(optical) <= 180)) {
          errors.push(issue("CRAFT_OPTICAL", `${path_}.layout_system.craft_system.optical_priority`, "Name the detail receiving optical priority."));
        }
        if (craft.phone_scale_mode !== "fixed_master") {
          errors.push(issue("CRAFT_PHONE_SCALE_MODE", `${path_}.layout_system.craft_system.phone_scale_mode`, "Phone display must scale the fixed publication master."));
        }
        const phoneType = craft.phone_type_scale;
        if (!isObject(phoneType)) {
          errors.push(issue("CRAFT_PHONE_TYPE", `${path_}.layout_system.craft_system.phone_type_scale`, "Effective phone-display type scale is required."));
        } else {
          for (const [key, minimum, maximum] of [["hero_px_622", 32, 60], ["body_px_622", 14, 26], ["meta_px_622", 11, 18]]) {
            const value = phoneType[key];
            if (!finite_number(value) || !(value >= minimum && value <= maximum)) {
              errors.push(issue("CRAFT_PHONE_TYPE", `${path_}.layout_system.craft_system.phone_type_scale.${key}`, `${key} must be ${minimum}-${maximum}px.`));
            }
          }
        }
      }
      const colorSystem = layout.color_system;
      if (!isObject(colorSystem)) {
        errors.push(issue("COLOR_SYSTEM", `${path_}.layout_system.color_system`, "A semantic color system is required."));
      } else {
        paletteFamily = colorSystem.palette_family === undefined ? null : colorSystem.palette_family;
        if (typeof paletteFamily !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/.test(paletteFamily) || cpLen(paletteFamily) > 64) {
          errors.push(issue("PALETTE_FAMILY", `${path_}.layout_system.color_system.palette_family`, "Palette family must be a short lowercase hyphenated slug."));
        } else {
          paletteFamilies.add(paletteFamily);
        }
        paletteStrategy = colorSystem.palette_strategy === undefined ? null : colorSystem.palette_strategy;
        if (!PALETTE_STRATEGIES.has(paletteStrategy)) {
          errors.push(issue("PALETTE_STRATEGY", `${path_}.layout_system.color_system.palette_strategy`, "Use creator_native, thesis_native, or contrast_variant."));
        } else {
          paletteStrategies.add(paletteStrategy);
        }
        presetId = colorSystem.preset_id === undefined ? null : colorSystem.preset_id;
        if (!(typeof presetId === "string" && presetId in PALETTE_PRESETS)) {
          errors.push(issue("PALETTE_PRESET", `${path_}.layout_system.color_system.preset_id`, "Palette preset must resolve in creator-palette-presets-v1.json."));
        } else {
          presetIds.add(presetId);
          if (paletteFamily !== presetId) {
            errors.push(issue("PALETTE_FAMILY_PRESET", `${path_}.layout_system.color_system.palette_family`, "Palette family must equal the registered preset ID."));
          }
          if (PALETTE_STRATEGIES.has(paletteStrategy)) {
            paletteChoices.push([paletteStrategy, presetId]);
          }
        }
        const selectionReason = colorSystem.selection_reason;
        if (typeof selectionReason !== "string" || !(trimLen(selectionReason) >= 8 && trimLen(selectionReason) <= 180)) {
          errors.push(issue("PALETTE_REASON", `${path_}.layout_system.color_system.selection_reason`, "Palette selection reason must be 8-180 characters."));
        }
        const surface = colorSystem.surface;
        if (!SURFACE_MODES.has(surface)) {
          errors.push(issue("COLOR_SURFACE", `${path_}.layout_system.color_system.surface`, "Surface must be light, dark, or split."));
        } else if (typeof presetId === "string" && presetId in PALETTE_PRESETS && surface !== PALETTE_PRESETS[presetId].surface) {
          errors.push(issue("PALETTE_SURFACE", `${path_}.layout_system.color_system.surface`, "Surface must match the registered palette preset."));
        }
        let semanticRoles = colorSystem.semantic_roles;
        if (
          !Array.isArray(semanticRoles)
          || !(semanticRoles.length >= 1 && semanticRoles.length <= 3)
          || semanticRoles.length !== uniqueSize(semanticRoles)
          || !isSubset(new Set(semanticRoles), SEMANTIC_COLOR_ROLES)
        ) {
          errors.push(issue("COLOR_ROLES", `${path_}.layout_system.color_system.semantic_roles`, "Use one to three unique supported semantic color roles."));
          semanticRoles = [];
        }
        const dominantRole = colorSystem.dominant_role;
        if (!semanticRoles.includes(dominantRole)) {
          errors.push(issue("COLOR_DOMINANT", `${path_}.layout_system.color_system.dominant_role`, "Dominant color role must be one of the declared semantic roles."));
        }
        const roleColorMap = colorSystem.role_color_map;
        if (
          !isObject(roleColorMap)
          || !setEquals(new Set(Object.keys(roleColorMap)), new Set(semanticRoles))
          || !Object.values(roleColorMap).every((token) => PALETTE_TOKENS.has(token))
        ) {
          errors.push(issue("COLOR_ROLE_MAP", `${path_}.layout_system.color_system.role_color_map`, "Map every declared semantic role to accent-a, accent-b, accent-c, or risk."));
        }
        const redundantCues = colorSystem.redundant_cues;
        if (
          !Array.isArray(redundantCues)
          || !(redundantCues.length >= 1 && redundantCues.length <= 4)
          || redundantCues.length !== uniqueSize(redundantCues)
          || !isSubset(new Set(redundantCues), REDUNDANT_CUES)
        ) {
          errors.push(issue("COLOR_REDUNDANCY", `${path_}.layout_system.color_system.redundant_cues`, "Color needs one to four supported redundant cues."));
        }
      }
      const responsiveRule = layout.responsive_rule;
      if (typeof responsiveRule !== "string" || !(trimLen(responsiveRule) >= 8 && trimLen(responsiveRule) <= 240)) {
        errors.push(issue("RESPONSIVE_RULE", `${path_}.layout_system.responsive_rule`, "Explain how hierarchy survives at 622 x 264."));
      }
      const signature = pyJsonDumps(
        { hierarchy, grid, alignment, density },
        { ensureAscii: true, sortKeys: true },
      );
      if (layoutSignatures.has(signature)) {
        errors.push(issue("LAYOUT_DUPLICATE", `${path_}.layout_system`, "Directions must use different hierarchy, grid, alignment, or density."));
      }
      layoutSignatures.add(signature);
    }
    const route = direction.route;
    if (!["claim_first", "evidence_first", "reasoning_first", "strategy_first", "freeform"].includes(route)) {
      errors.push(issue("ROUTE", `${path_}.route`, "Unsupported visual route."));
    } else {
      routes.add(pyStr(route));
    }
    const routeRequiredBindings = new Set();
    const compactRequiredBindings = new Set();
    let visibleSteps = [];
    let compactSteps = [];
    const logicRoute = direction.logic_route;
    if (!isObject(logicRoute)) {
      errors.push(issue("LOGIC_ROUTE", `${path_}.logic_route`, "Every direction must project the shared logic progression."));
    } else {
      const entryStepId = pyStr(logicRoute.entry_step_id || "");
      const visibleStepsValue = logicRoute.visible_step_ids;
      const compactStepsValue = logicRoute.compact_step_ids;
      for (const [key, value, maximum] of [["visible_step_ids", visibleStepsValue, 6], ["compact_step_ids", compactStepsValue, 5]]) {
        if (!Array.isArray(value) || !(value.length >= 3 && value.length <= maximum) || value.length !== uniqueSize(value)) {
          errors.push(issue("LOGIC_ROUTE_STEPS", `${path_}.logic_route.${key}`, `${key} must contain three to ${maximum} unique steps.`));
        }
      }
      if (Array.isArray(visibleStepsValue)) {
        visibleSteps = visibleStepsValue.map((item) => pyStr(item));
        if (!logicSteps.has(entryStepId) || !visibleSteps.length || entryStepId !== visibleSteps[0]) {
          errors.push(issue("LOGIC_ROUTE_ENTRY", `${path_}.logic_route.entry_step_id`, "Entry step must be the first declared visible step."));
        }
        if (!visibleSteps.every((item) => logicSteps.has(item))) {
          errors.push(issue("LOGIC_ROUTE_REF", `${path_}.logic_route.visible_step_ids`, "Visible route references undeclared logic steps."));
        }
        if (logicSpine.length) {
          const interior = new Set(logicSpine.slice(1, -1));
          if (!visibleSteps.includes(logicSpine[0]) || !visibleSteps.includes(logicSpine[logicSpine.length - 1]) || !visibleSteps.some((item) => interior.has(item))) {
            errors.push(issue("LOGIC_ROUTE_BRIDGE", `${path_}.logic_route.visible_step_ids`, "Visible route must keep the spine start, an interior bridge, and the conclusion."));
          }
        }
        for (const stepId of visibleSteps) {
          for (const ref of (logicSteps.get(stepId) ?? {}).binding_refs ?? []) {
            routeRequiredBindings.add(pyStr(ref));
          }
        }
      }
      if (Array.isArray(compactStepsValue)) {
        compactSteps = compactStepsValue.map((item) => pyStr(item));
        if (!compactSteps.every((item) => logicSteps.has(item))) {
          errors.push(issue("LOGIC_ROUTE_REF", `${path_}.logic_route.compact_step_ids`, "Compact route references undeclared logic steps."));
        }
        if (visibleSteps.length && !compactSteps.every((item) => visibleSteps.includes(item))) {
          errors.push(issue("LOGIC_ROUTE_COMPACT", `${path_}.logic_route.compact_step_ids`, "Compact route must be a subset of the full visible route."));
        }
        if (logicSpine.length) {
          const interior = new Set(logicSpine.slice(1, -1));
          if (!compactSteps.includes(logicSpine[0]) || !compactSteps.includes(logicSpine[logicSpine.length - 1]) || !compactSteps.some((item) => interior.has(item))) {
            errors.push(issue("LOGIC_ROUTE_BRIDGE", `${path_}.logic_route.compact_step_ids`, "Compact route must keep support, an interior bridge, and the conclusion."));
          }
        }
        for (const stepId of compactSteps) {
          for (const ref of (logicSteps.get(stepId) ?? {}).binding_refs ?? []) {
            compactRequiredBindings.add(pyStr(ref));
          }
        }
      }
      const entryRoleName = pyStr((logicSteps.get(entryStepId) ?? {}).role || "");
      if (typeof route === "string" && route in ROUTE_ENTRY_ROLES && !ROUTE_ENTRY_ROLES[route].has(entryRoleName)) {
        errors.push(issue("LOGIC_ROUTE_COMPATIBILITY", `${path_}.logic_route.entry_step_id`, `${route} cannot enter from role ${pyrepr(entryRoleName)}.`));
      }
    }

    let proofRefs = new Set();
    let marketRelationship = null;
    let argumentArchetype = null;
    let compositionArchetype = null;
    const expressionRecipe = direction.expression_recipe === undefined ? null : direction.expression_recipe;
    if (expressionRecipe === null) {
      if (require_expression_recipes) {
        errors.push(issue("EXPRESSION_RECIPE", `${path_}.expression_recipe`, "Strict generation requires a task- and evidence-bound expression recipe."));
      }
    } else if (!isObject(expressionRecipe)) {
      errors.push(issue("EXPRESSION_RECIPE", `${path_}.expression_recipe`, "Every direction needs a task- and evidence-bound expression recipe."));
    } else {
      expressionRecipeCount += 1;
      const candidateJob = expressionRecipe.candidate_job === undefined ? null : expressionRecipe.candidate_job;
      const jobProfile = CANDIDATE_JOBS[pyStr(candidateJob)];
      if (jobProfile === undefined) {
        errors.push(issue("EXPRESSION_JOB", `${path_}.expression_recipe.candidate_job`, "Unsupported candidate communication job."));
      } else {
        candidateJobs.add(pyStr(candidateJob));
        candidateFamilies.add(pyStr(jobProfile.family));
      }

      const evidenceShapesValue = expressionRecipe.evidence_shapes;
      let evidenceShapes;
      if (
        !Array.isArray(evidenceShapesValue)
        || !(evidenceShapesValue.length >= 1 && evidenceShapesValue.length <= 4)
        || !evidenceShapesValue.every((item) => typeof item === "string")
        || evidenceShapesValue.length !== uniqueSize(evidenceShapesValue)
        || !isSubset(new Set(evidenceShapesValue), EVIDENCE_SHAPES)
      ) {
        errors.push(issue("EXPRESSION_SHAPES", `${path_}.expression_recipe.evidence_shapes`, "Use one to four unique registered evidence shapes."));
        evidenceShapes = new Set();
      } else {
        evidenceShapes = new Set(evidenceShapesValue.map((item) => pyStr(item)));
        evidenceShapeSignatures.add(pySorted(evidenceShapes).join("\x00"));
        if (intentEvidenceShapes.size && !isSubset(evidenceShapes, intentEvidenceShapes)) {
          errors.push(issue("FINANCE_INTENT_DRIFT", `${path_}.expression_recipe.evidence_shapes`, "Direction widens the evidence shapes beyond the set-level intent lock."));
        }
      }

      const primaryGrammar = pyStr(expressionRecipe.primary_grammar || "");
      const supportGrammarsValue = expressionRecipe.support_grammars;
      if (!(primaryGrammar in EXPRESSION_GRAMMARS)) {
        errors.push(issue("EXPRESSION_GRAMMAR", `${path_}.expression_recipe.primary_grammar`, "Use a registered primary expression grammar."));
      } else {
        primaryGrammars.add(primaryGrammar);
        if (jobProfile !== undefined && !jobProfile.primary_grammars.includes(primaryGrammar)) {
          errors.push(issue("EXPRESSION_JOB_GRAMMAR", `${path_}.expression_recipe.primary_grammar`, `${pyStr(candidateJob)} cannot use ${primaryGrammar} as its primary grammar.`));
        }
      }
      let supportGrammars;
      if (
        !Array.isArray(supportGrammarsValue)
        || supportGrammarsValue.length > 2
        || !supportGrammarsValue.every((item) => typeof item === "string")
        || supportGrammarsValue.length !== uniqueSize(supportGrammarsValue)
        || !supportGrammarsValue.every((item) => item in EXPRESSION_GRAMMARS)
        || supportGrammarsValue.includes(primaryGrammar)
      ) {
        errors.push(issue("EXPRESSION_SUPPORT_GRAMMARS", `${path_}.expression_recipe.support_grammars`, "Use up to two unique registered support grammars distinct from the primary grammar."));
        supportGrammars = [];
      } else {
        supportGrammars = supportGrammarsValue.map((item) => pyStr(item));
      }
      if (primaryGrammar in EXPRESSION_GRAMMARS && intentRendererRoute !== null) {
        const grammarRenderer = pyStr(EXPRESSION_GRAMMARS[primaryGrammar].renderer_route || "");
        if (grammarRenderer !== intentRendererRoute) {
          errors.push(issue("FINANCE_INTENT_RENDERER", `${path_}.expression_recipe.primary_grammar`, `Grammar routes to ${grammarRenderer}, not locked renderer ${intentRendererRoute}.`));
        }
      }

      const axisIntegrity = expressionRecipe.axis_integrity === undefined ? null : expressionRecipe.axis_integrity;
      const orderedAxisGrammars = pySorted(
        [...new Set([primaryGrammar, ...supportGrammars])].filter((grammarId) => (EXPRESSION_GRAMMARS[grammarId] ?? {}).ordered_axis),
      );
      if (axisIntegrity !== null && !AXIS_INTEGRITY_MODES.has(axisIntegrity)) {
        errors.push(issue("AXIS_INTEGRITY", `${path_}.expression_recipe.axis_integrity`, `Use one of ${pyreprList(pySorted(AXIS_INTEGRITY_MODES))}.`));
      } else if (orderedAxisGrammars.length && axisIntegrity === null) {
        errors.push(issue("AXIS_INTEGRITY", `${path_}.expression_recipe.axis_integrity`, `Grammars ${pyreprList(orderedAxisGrammars)} order instruments on a dated axis; declare how unequal gaps stay honest (time_scaled, ordinal_gap_marked, or uniform_true).`));
      }

      const routeValues = {
        market_relationship: expressionRecipe.market_relationship,
        argument_archetype: expressionRecipe.argument_archetype,
        composition_archetype: expressionRecipe.composition_archetype,
      };
      const routePresent = Object.values(routeValues).map((value) => typeof value === "string" && Boolean(pyStrip(value)));
      if (!routePresent.every(Boolean)) {
        if (require_finance_route || routePresent.some(Boolean)) {
          errors.push(issue("FINANCE_ROUTE", `${path_}.expression_recipe`, "Finance generation requires market_relationship, argument_archetype, and composition_archetype together."));
        }
      } else {
        marketRelationship = pyStr(routeValues.market_relationship);
        argumentArchetype = pyStr(routeValues.argument_archetype);
        compositionArchetype = pyStr(routeValues.composition_archetype);
        const relationshipProfile = MARKET_RELATIONSHIPS[marketRelationship];
        const archetypeProfile = ARGUMENT_ARCHETYPES[argumentArchetype];
        const compositionProfile = COMPOSITION_ARCHETYPES[compositionArchetype];
        if (relationshipProfile === undefined) {
          errors.push(issue("MARKET_RELATIONSHIP", `${path_}.expression_recipe.market_relationship`, "Use a registered market relationship."));
        }
        if (archetypeProfile === undefined) {
          errors.push(issue("ARGUMENT_ARCHETYPE", `${path_}.expression_recipe.argument_archetype`, "Use a registered trading argument archetype."));
        }
        if (compositionProfile === undefined) {
          errors.push(issue("COMPOSITION_ARCHETYPE", `${path_}.expression_recipe.composition_archetype`, "Use a registered composition archetype."));
        }
        if (relationshipProfile !== undefined && archetypeProfile !== undefined) {
          if (!archetypeProfile.preferred_relationships.includes(marketRelationship)) {
            errors.push(issue("FINANCE_ROUTE_COMPATIBILITY", `${path_}.expression_recipe`, `${argumentArchetype} does not support market relationship ${marketRelationship}.`));
          }
          const selectedGrammars = new Set([primaryGrammar, ...supportGrammars]);
          if (jobProfile !== undefined && jobProfile.family !== "fast_read") {
            if (!setIntersects(selectedGrammars, relationshipProfile.preferred_grammars)) {
              errors.push(issue("RELATIONSHIP_GRAMMAR", `${path_}.expression_recipe.primary_grammar`, `Selected grammars do not express market relationship ${marketRelationship}.`));
            }
            if (!setIntersects(selectedGrammars, archetypeProfile.preferred_grammars)) {
              errors.push(issue("ARCHETYPE_GRAMMAR", `${path_}.expression_recipe.primary_grammar`, `Selected grammars do not express argument archetype ${argumentArchetype}.`));
            }
          }
        }
        if (relationshipProfile !== undefined && archetypeProfile !== undefined && compositionProfile !== undefined) {
          financeRouteCount += 1;
          compositionArchetypes.add(compositionArchetype);
        }
        if (intentRelationship !== null && marketRelationship !== intentRelationship) {
          errors.push(issue("FINANCE_INTENT_DRIFT", `${path_}.expression_recipe.market_relationship`, `Direction uses ${marketRelationship}, but intent lock requires ${intentRelationship}.`));
        }
      }

      const proofRefsValue = expressionRecipe.proof_binding_refs;
      if (
        !Array.isArray(proofRefsValue)
        || !proofRefsValue.length
        || proofRefsValue.length !== uniqueSize(proofRefsValue)
        || !proofRefsValue.every((item) => typeof item === "string")
      ) {
        errors.push(issue("EXPRESSION_PROOF_REFS", `${path_}.expression_recipe.proof_binding_refs`, "Use one or more unique proof binding refs."));
        proofRefs = new Set();
      } else {
        proofRefs = new Set(proofRefsValue);
        const unknownProofRefs = pySorted(setDifference(proofRefs, bindingIds));
        if (unknownProofRefs.length) {
          errors.push(issue("EXPRESSION_PROOF_REFS", `${path_}.expression_recipe.proof_binding_refs`, `Unknown proof bindings: ${pyreprList(unknownProofRefs)}.`));
        }
        const missingSelectedProofs = pySorted(setDifference(selectedMaterialBindingIds, proofRefs));
        if (missingSelectedProofs.length) {
          errors.push(issue("EXPRESSION_MATERIAL_PROOF", `${path_}.expression_recipe.proof_binding_refs`, `Expression recipe omits selected material bindings: ${pyreprList(missingSelectedProofs)}.`));
        }
      }

      const recipeDataRefsValue = expressionRecipe.data_requirement_refs;
      let recipeDataRefs;
      if (
        !Array.isArray(recipeDataRefsValue)
        || recipeDataRefsValue.length !== uniqueSize(recipeDataRefsValue)
        || !recipeDataRefsValue.every((item) => typeof item === "string" && pyStrip(item))
      ) {
        errors.push(issue("EXPRESSION_DATA_REFS", `${path_}.expression_recipe.data_requirement_refs`, "Recipe data refs must be a unique array."));
        recipeDataRefs = new Set();
      } else {
        recipeDataRefs = new Set(recipeDataRefsValue);
        const unknownDataRefs = pySorted(setDifference(recipeDataRefs, dataRequirementRefs));
        if (unknownDataRefs.length) {
          errors.push(issue("EXPRESSION_DATA_REFS", `${path_}.expression_recipe.data_requirement_refs`, `Recipe data refs are undeclared: ${pyreprList(unknownDataRefs)}.`));
        }
      }

      const proofBindingKinds = [...proofRefs].filter((ref) => bindingKinds.has(ref)).map((ref) => bindingKinds.get(ref));
      if (evidenceShapes.size) {
        const selectedGrammarIds = [primaryGrammar, ...supportGrammars];
        const allowedRecipeShapes = new Set();
        for (const grammarId of selectedGrammarIds) {
          const grammarProfile = EXPRESSION_GRAMMARS[grammarId] ?? {};
          for (const shape of grammarProfile.optional_shapes ?? []) allowedRecipeShapes.add(shape);
          for (const requiredShapeSet of grammarProfile.required_shape_sets ?? []) {
            for (const shape of requiredShapeSet) allowedRecipeShapes.add(shape);
          }
        }
        const unsupportedShapes = pySorted(setDifference(evidenceShapes, allowedRecipeShapes));
        if (unsupportedShapes.length) {
          errors.push(issue("EXPRESSION_SHAPE_EXCESS", `${path_}.expression_recipe.evidence_shapes`, `Selected grammars do not encode evidence shapes: ${pyreprList(unsupportedShapes)}.`));
        }
        for (const grammarId of selectedGrammarIds) {
          if (grammarId) {
            errors.push(...validate_expression_grammar(
              grammarId,
              evidenceShapes,
              proofBindingKinds,
              recipeDataRefs,
              `${path_}.expression_recipe`,
            ));
          }
        }
      }

      for (const key of ["composition_rule", "fit_reason"]) {
        const value = expressionRecipe[key];
        if (typeof value !== "string" || !(trimLen(value) >= 12 && trimLen(value) <= 240)) {
          errors.push(issue("EXPRESSION_TEXT", `${path_}.expression_recipe.${key}`, `${key} must be 12-240 characters.`));
        }
      }
    }

    const skeleton = pyStrip(pyStr(direction.spatial_skeleton || "").toLowerCase().replace(/[^a-z0-9]+/g, " "));
    if (!skeleton) {
      errors.push(issue("SKELETON", `${path_}.spatial_skeleton`, "A spatial skeleton is required."));
    } else if (skeletons.has(skeleton)) {
      errors.push(issue("SKELETON_DUPLICATE", `${path_}.spatial_skeleton`, "Directions must use different spatial skeletons."));
    }
    skeletons.add(skeleton);

    let usedRefs = direction.binding_refs;
    if (
      !Array.isArray(usedRefs)
      || !usedRefs.length
      || !usedRefs.every((ref) => typeof ref === "string")
      || usedRefs.length !== uniqueSize(usedRefs)
    ) {
      errors.push(issue("DIRECTION_BINDINGS", `${path_}.binding_refs`, "A direction must use unique binding refs."));
      usedRefs = [];
    }
    for (const ref of usedRefs) {
      if (!bindingIds.has(ref)) {
        errors.push(issue("UNKNOWN_BINDING", `${path_}.binding_refs`, `Unknown binding ref: ${ref}`));
      }
    }
    const usedRefSet = new Set(usedRefs);
    const recipeOnlyBindings = setDifference(proofRefs, usedRefSet);
    if (recipeOnlyBindings.size) {
      errors.push(issue("EXPRESSION_DIRECTION_BINDINGS", `${path_}.expression_recipe.proof_binding_refs`, `Proof bindings must also appear in direction.binding_refs: ${pyreprList(pySorted(recipeOnlyBindings))}`));
    }
    const missingRouteBindings = setDifference(routeRequiredBindings, usedRefSet);
    if (missingRouteBindings.size) {
      errors.push(issue("LOGIC_ROUTE_BINDINGS", `${path_}.binding_refs`, `Direction is missing logic-route bindings: ${pyreprList(pySorted(missingRouteBindings))}`));
    }
    const missingMaterialBindings = setDifference(selectedMaterialBindingIds, usedRefSet);
    if (missingMaterialBindings.size) {
      errors.push(issue("MATERIAL_BINDING_OMITTED", `${path_}.binding_refs`, `Direction omits selected material display bindings: ${pyreprList(pySorted(missingMaterialBindings))}`));
    }
    const missingMaterialRoute = setDifference(selectedMaterialBindingIds, routeRequiredBindings);
    if (missingMaterialRoute.size) {
      errors.push(issue("MATERIAL_BINDING_ROUTE", `${path_}.logic_route.visible_step_ids`, `Visible route omits selected material display bindings: ${pyreprList(pySorted(missingMaterialRoute))}`));
    }
    const missingMaterialCompact = setDifference(selectedMaterialBindingIds, compactRequiredBindings);
    if (missingMaterialCompact.size) {
      errors.push(issue("MATERIAL_BINDING_COMPACT_ROUTE", `${path_}.logic_route.compact_step_ids`, `Compact route omits selected material display bindings: ${pyreprList(pySorted(missingMaterialCompact))}`));
    }

    const preflight = direction.preflight;
    if (!isObject(preflight) || !setEquals(new Set(Object.keys(preflight)), PREFLIGHT_KEYS)) {
      errors.push(issue("PREFLIGHT", `${path_}.preflight`, `All ${PREFLIGHT_KEYS.size} kernel pre-flight checks are required.`));
    } else {
      for (const key of pySorted(PREFLIGHT_KEYS)) {
        const value = preflight[key];
        if (typeof value !== "boolean") {
          errors.push(issue("PREFLIGHT_VALUE", `${path_}.preflight.${key}`, "Pre-flight values must be boolean."));
        } else if ((state === "previewed" || state === "selected") && value !== true) {
          errors.push(issue("PREFLIGHT_INCOMPLETE", `${path_}.preflight.${key}`, "Previewed and selected directions must pass every pre-flight check."));
        }
      }
    }

    const htmlRef = direction.html_ref === undefined ? null : direction.html_ref;
    const previewRef = direction.preview_ref === undefined ? null : direction.preview_ref;
    const captureReportRef = direction.capture_report_ref === undefined ? null : direction.capture_report_ref;
    const renderAuditRef = direction.render_audit_ref === undefined ? null : direction.render_audit_ref;
    if (rendererMode === "cuebook_template") {
      if (!valid_ref(htmlRef) || !pyStr(htmlRef).endsWith(".html")) {
        errors.push(issue("ASSET_REF", `${path_}.html_ref`, "Template mode needs a safe relative HTML ref."));
      } else if (htmlRefs.has(htmlRef)) {
        errors.push(issue("ASSET_REF_DUPLICATE", `${path_}.html_ref`, "Each template direction needs distinct HTML."));
      } else {
        htmlRefs.add(htmlRef);
      }
    } else if (htmlRef !== null) {
      errors.push(issue("BITMAP_HTML_UNEXPECTED", `${path_}.html_ref`, "finished_bitmap must use null because original HTML is not required or verified."));
    }
    for (const [key, ref, seen] of [
      ["preview_ref", previewRef, previewRefs],
    ]) {
      if (!valid_ref(ref)) {
        errors.push(issue("ASSET_REF", `${path_}.${key}`, "Asset refs must be safe relative paths."));
      } else if (seen.has(ref)) {
        errors.push(issue("ASSET_REF_DUPLICATE", `${path_}.${key}`, "Each direction needs a distinct asset."));
      } else {
        seen.add(ref);
      }
    }
    const reportRefs = rendererMode === "finished_bitmap"
      ? [["capture_report_ref", captureReportRef, captureReportRefs]]
      : [["capture_report_ref", captureReportRef, captureReportRefs], ["render_audit_ref", renderAuditRef, renderAuditRefs]];
    for (const [key, ref, seen] of reportRefs) {
      if (ref === null && state === "draft") continue;
      if (!valid_ref(ref) || !pyStr(ref).endsWith(".json")) {
        errors.push(issue("REPORT_REF", `${path_}.${key}`, "Previewed directions need a safe relative JSON report ref."));
      } else if (seen.has(ref)) {
        errors.push(issue("REPORT_REF_DUPLICATE", `${path_}.${key}`, "Each direction needs a distinct report."));
      } else {
        seen.add(pyStr(ref));
      }
    }
    if (rendererMode === "finished_bitmap" && renderAuditRef !== null) {
      errors.push(issue("BITMAP_RENDER_AUDIT_UNEXPECTED", `${path_}.render_audit_ref`, "finished_bitmap uses one frame-raster-audit-v1 report and no DOM render audit."));
    }

    const critique = direction.critique;
    if (!isObject(critique)) {
      errors.push(issue("CRITIQUE", `${path_}.critique`, "Critique is required."));
      continue;
    }
    let calculated = 0.0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      let value = critique[key];
      if (typeof value !== "number" || !Number.isFinite(value) || !(value >= 0 && value <= 10)) {
        errors.push(issue("CRITIQUE_SCORE", `${path_}.critique.${key}`, "Score must be finite and between 0 and 10."));
        value = 0;
      }
      calculated += value * weight;
    }
    const reported = critique.weighted_score;
    if (typeof reported !== "number" || Math.abs(reported - calculated) > 0.06) {
      errors.push(issue("WEIGHTED_SCORE", `${path_}.critique.weighted_score`, `Expected ${pyFormat2f(calculated)}.`));
    }
    if (directionId) {
      scores.set(pyStr(directionId), calculated);
    }
    const verdict = critique.verdict;
    if ((critique.data_integrity ?? 0) < 8 && verdict !== "reject") {
      errors.push(issue("INTEGRITY_VERDICT", `${path_}.critique.verdict`, "Data integrity below 8 requires reject."));
    }
    if (((critique.concept ?? 0) < 7 || (critique.three_second ?? 0) < 7 || (critique.hierarchy ?? 0) < 7) && verdict === "pass") {
      errors.push(issue("CLARITY_VERDICT", `${path_}.critique.verdict`, "Concept, three-second, or hierarchy score below 7 cannot pass."));
    }
    if ((critique.color_logic ?? 0) < 7 && verdict === "pass") {
      errors.push(issue("COLOR_VERDICT", `${path_}.critique.verdict`, "Color logic below 7 cannot pass."));
    }
    if ((critique.anti_default ?? 0) < 7 && verdict === "pass") {
      errors.push(issue("ANTI_DEFAULT_VERDICT", `${path_}.critique.verdict`, "Anti-default score below 7 cannot pass."));
    }

    if (rendererMode === "cuebook_template" && assetRoot !== null && valid_ref(htmlRef)) {
      const htmlPath = pyResolve(path.join(assetRoot, pyStr(htmlRef)));
      if (!isProperAncestor(pyResolve(assetRoot), htmlPath)) {
        errors.push(issue("ASSET_ESCAPE", `${path_}.html_ref`, "HTML escaped the asset root."));
      } else if ((state === "previewed" || state === "selected") && !isFile(htmlPath)) {
        errors.push(issue("HTML_MISSING", `${path_}.html_ref`, `Missing HTML: ${htmlRef}`));
      } else if (isFile(htmlPath)) {
        const html = readFileSync(htmlPath, "utf-8");
        if (!html.includes("data-cuebook-viewpoint") || !html.includes(`data-direction-id="${pyStr(directionId)}"`)) {
          errors.push(issue("HTML_CONTRACT", `${path_}.html_ref`, "HTML canvas or direction ID is missing."));
        }
        const launchAudit = audit_html(html);
        for (const launchError of launchAudit.errors) {
          errors.push(issue(`HTML_${launchError.code}`, `${path_}.html_ref`, launchError.message));
        }
        const expectedAttrs = {
          "design-variance": designVariance,
          "visual-density": visualDensity,
          "layout-grid": grid,
          "entry-role": entryRole,
          "palette-family": paletteFamily,
          "palette-strategy": paletteStrategy,
          "palette-preset": presetId,
          "color-system": "semantic-v1",
          "market-relationship": marketRelationship,
          "argument-archetype": argumentArchetype,
          "composition-archetype": compositionArchetype,
          "finance-transform": intentFinanceTransform,
          "baseline-policy": intentBaselinePolicy,
          "chart-decision": intentChartDecision,
        };
        for (const [attr, value] of Object.entries(expectedAttrs)) {
          if (value !== null && value !== undefined && !new RegExp(`data-${attr}=["']${escapeRegExp(pyStr(value))}["']`).test(html)) {
            errors.push(issue("HTML_DESIGN_READ", `${path_}.html_ref`, `HTML is missing data-${attr}=${pyStr(value)}.`));
          }
        }
        if (/(?:src|href)=["']https?:\/\//i.test(html)) {
          errors.push(issue("EXTERNAL_ASSET", `${path_}.html_ref`, "Direction HTML must be network-free."));
        }
        const lower = html.toLowerCase();
        for (const term of INTERNAL_TERMS) {
          if (lower.includes(term)) {
            errors.push(issue("INTERNAL_TEXT", `${path_}.html_ref`, `Internal term leaked: ${term}`));
          }
        }
        const htmlBindingRefs = new Set((launchAudit.stats ?? {}).visible_binding_refs || []);
        const missing = pySorted(setDifference(usedRefSet, htmlBindingRefs));
        if (missing.length) {
          errors.push(issue("HTML_BINDING", `${path_}.html_ref`, `HTML is missing visible, relevant bindings: ${pyreprList(missing)}`));
        }
        const htmlLogicSteps = new Set((launchAudit.stats ?? {}).visible_logic_step_ids || []);
        const missingLogicSteps = pySorted(setDifference(new Set(visibleSteps), htmlLogicSteps));
        if (missingLogicSteps.length) {
          errors.push(issue("HTML_LOGIC_ROUTE", `${path_}.html_ref`, `HTML is missing visible, relevant logic steps: ${pyreprList(missingLogicSteps)}`));
        }
      }
    }
    if (assetRoot !== null && (state === "previewed" || state === "selected")) {
      const previewPaths = new Map();
      for (const [key, ref] of [["preview_ref", previewRef]]) {
        if (valid_ref(ref)) {
          const previewPath = pyResolve(path.join(assetRoot, pyStr(ref)));
          if (!isFile(previewPath)) {
            errors.push(issue("PREVIEW_MISSING", `${path_}.${key}`, `Missing preview: ${ref}`));
          } else {
            previewPaths.set(key, previewPath);
            const expectedDimensions = [2488, 1056];
            const dimensions = png_dimensions(previewPath);
            if (dimensions === null || dimensions[0] !== expectedDimensions[0] || dimensions[1] !== expectedDimensions[1]) {
              errors.push(issue("PREVIEW_FORMAT", `${path_}.${key}`, `Expected a valid ${expectedDimensions[0]} x ${expectedDimensions[1]} PNG.`));
            }
          }
        }
      }

      const capturePath = valid_ref(captureReportRef) ? pyResolve(path.join(assetRoot, pyStr(captureReportRef))) : null;
      const captureReport = capturePath && isFile(capturePath) ? read_json_file(capturePath) : null;
      if (rendererMode === "cuebook_template") {
        const htmlPath = valid_ref(htmlRef) ? pyResolve(path.join(assetRoot, pyStr(htmlRef))) : null;
        const htmlSha = htmlPath && isFile(htmlPath) ? sha256_file(htmlPath) : null;
        if (!isObject(captureReport)) {
          errors.push(issue("CAPTURE_REPORT", `${path_}.capture_report_ref`, "Missing or invalid capture report."));
        } else {
          if (captureReport.schema_version !== "viewpoint-html-capture-v1" || (captureReport.source_sha256 === undefined ? null : captureReport.source_sha256) !== htmlSha) {
            errors.push(issue("CAPTURE_REPORT_SOURCE", `${path_}.capture_report_ref`, "Capture report must match the current HTML hash."));
          }
          const derivatives = captureReport.derivatives;
          const byKind = new Map();
          if (Array.isArray(derivatives)) {
            for (const item of derivatives) {
              if (isObject(item)) byKind.set(item.kind === undefined ? null : item.kind, item);
            }
          }
          for (const kind of byKind.keys()) {
            if (kind !== "full") errors.push(issue("CAPTURE_REPORT_ROLE", `${path_}.capture_report_ref`, "Capture report must contain only the publication master."));
          }
          for (const [key, kind, dimensions] of [["preview_ref", "full", [2488, 1056]]]) {
            const derivative = byKind.get(kind);
            const previewPath = previewPaths.get(key);
            if (!isObject(derivative) || derivative.width !== dimensions[0] || derivative.height !== dimensions[1]) {
              errors.push(issue("CAPTURE_REPORT_DERIVATIVE", `${path_}.capture_report_ref`, `Capture report is missing ${kind}.`));
            } else if (previewPath !== undefined && derivative.sha256 !== sha256_file(previewPath)) {
              errors.push(issue("CAPTURE_REPORT_HASH", `${path_}.capture_report_ref`, `Capture hash does not match ${key}.`));
            }
            const paintedRatio = isObject(derivative) ? (derivative.painted_ratio === undefined ? null : derivative.painted_ratio) : null;
            if (!finite_number(paintedRatio) || paintedRatio < 0.006) {
              errors.push(issue("CAPTURE_REPORT_BLANK", `${path_}.capture_report_ref`, `${kind} must report at least 0.6% materially painted pixels.`));
            }
          }
        }

        const auditPath = valid_ref(renderAuditRef) ? pyResolve(path.join(assetRoot, pyStr(renderAuditRef))) : null;
        const renderAudit = auditPath && isFile(auditPath) ? read_json_file(auditPath) : null;
        if (!isObject(renderAudit)) {
          errors.push(issue("RENDER_AUDIT", `${path_}.render_audit_ref`, "Missing or invalid rendered geometry audit."));
        } else {
          if (renderAudit.schema_version !== "viewpoint-render-audit-v1" || (renderAudit.source_sha256 === undefined ? null : renderAudit.source_sha256) !== htmlSha) {
            errors.push(issue("RENDER_AUDIT_SOURCE", `${path_}.render_audit_ref`, "Rendered audit must match the current HTML hash."));
          }
          if (renderAudit.valid !== true || !(Array.isArray(renderAudit.errors) && renderAudit.errors.length === 0)) {
            errors.push(issue("RENDER_AUDIT_FAILED", `${path_}.render_audit_ref`, "Rendered audit contains geometry, contrast, typography, or compact-layout failures."));
          }
          const fingerprint = renderAudit.layout_fingerprint_sha256 === undefined ? null : renderAudit.layout_fingerprint_sha256;
          if (!/^sha256:[a-f0-9]{64}$/.test(pyStr(fingerprint || ""))) {
            errors.push(issue("RENDER_LAYOUT_FINGERPRINT", `${path_}.render_audit_ref`, "Rendered audit needs a layout fingerprint."));
          } else if (renderedLayoutFingerprints.has(fingerprint)) {
            errors.push(issue("RENDER_LAYOUT_DUPLICATE", `${path_}.render_audit_ref`, "Rendered directions share the same coarse role geometry."));
          } else {
            renderedLayoutFingerprints.add(pyStr(fingerprint));
          }
          const viewportReports = renderAudit.viewports;
          const viewportMap = new Map();
          if (Array.isArray(viewportReports)) {
            for (const item of viewportReports) {
              if (isObject(item)) {
                viewportMap.set(`${typeof item.width}:${String(item.width)}|${typeof item.height}:${String(item.height)}`, item);
              }
            }
          }
          const viewportExpectations = [
            [[1244, 528], visibleSteps, usedRefSet],
            [[622, 264], compactSteps, new Set([...compactRequiredBindings, ...selectedMaterialBindingIds])],
          ];
          for (const [dimensions, expectedSteps, expectedBindings] of viewportExpectations) {
            const viewportReport = viewportMap.get(`number:${dimensions[0]}|number:${dimensions[1]}`);
            if (!isObject(viewportReport) || viewportReport.valid !== true) {
              errors.push(issue("RENDER_AUDIT_VIEWPORT", `${path_}.render_audit_ref`, `Missing passed audit for ${dimensions[0]} x ${dimensions[1]}.`));
              continue;
            }
            const missingSteps = pySorted(setDifference(new Set(expectedSteps), new Set(viewportReport.logic_step_ids || [])));
            if (missingSteps.length) {
              errors.push(issue("RENDER_AUDIT_LOGIC", `${path_}.render_audit_ref`, `${dimensions[0]}px render hides required logic steps: ${pyreprList(missingSteps)}`));
            }
            const missingBindings = pySorted(setDifference(expectedBindings, new Set(viewportReport.binding_refs || [])));
            if (missingBindings.length) {
              errors.push(issue("RENDER_AUDIT_BINDING", `${path_}.render_audit_ref`, `${dimensions[0]}px render hides required bindings: ${pyreprList(missingBindings)}`));
            }
          }
        }
      } else if (!isObject(captureReport)) {
        errors.push(issue("RASTER_AUDIT", `${path_}.capture_report_ref`, "Missing or invalid finished-bitmap raster audit."));
      } else {
        if (
          captureReport.schema_version !== "frame-raster-audit-v1"
          || captureReport.profile_version !== "frame-raster-audit-v1"
          || captureReport.source_kind !== "finished_bitmap"
          || captureReport.font_profile?.profile !== "embedded-pixels-v1"
          || captureReport.font_profile?.verification !== "not_asserted"
        ) {
          errors.push(issue("RASTER_AUDIT_PROFILE", `${path_}.capture_report_ref`, "Finished bitmap audit must use honest frame-raster-audit-v1 and embedded-pixels-v1 profiles."));
        }
        const review = captureReport.image_review;
        if (
          captureReport.valid !== true
          || !Array.isArray(captureReport.errors)
          || captureReport.errors.length !== 0
          || review?.review_method !== "image_inspection"
          || review?.legibility !== "pass"
          || review?.collision !== "pass"
          || review?.imagery_result !== "pass"
          || !["absent", "backend_locked"].includes(review?.mutable_price)
        ) {
          errors.push(issue("RASTER_AUDIT_FAILED", `${path_}.capture_report_ref`, "Finished bitmap must pass bound image-level legibility, collision, imagery, and mutable-price review."));
        }
        const byKind = new Map();
        for (const item of Array.isArray(captureReport.derivatives) ? captureReport.derivatives : []) {
          if (isObject(item)) byKind.set(item.kind, item);
        }
        for (const kind of byKind.keys()) {
          if (kind !== "full") errors.push(issue("RASTER_AUDIT_ROLE", `${path_}.capture_report_ref`, "Raster audit must contain only the publication master."));
        }
        for (const [key, kind, role, dimensions] of [["preview_ref", "full", "publication", [2488, 1056]]]) {
          const derivative = byKind.get(kind);
          const previewPath = previewPaths.get(key);
          if (!isObject(derivative) || derivative.width !== dimensions[0] || derivative.height !== dimensions[1]) {
            errors.push(issue("RASTER_AUDIT_DERIVATIVE", `${path_}.capture_report_ref`, `Raster audit is missing ${kind}.`));
          } else if (previewPath !== undefined && derivative.sha256 !== sha256_file(previewPath)) {
            errors.push(issue("RASTER_AUDIT_HASH", `${path_}.capture_report_ref`, `Raster audit hash does not match ${key}.`));
          }
          if (!/^sha256:[a-f0-9]{64}$/.test(pyStr(derivative?.pixel_sha256 || ""))) {
            errors.push(issue("RASTER_AUDIT_PIXEL_HASH", `${path_}.capture_report_ref`, `${kind} needs a canonical RGBA8 pixel hash.`));
          }
          if (!finite_number(derivative?.painted_ratio) || derivative.painted_ratio < 0.006) {
            errors.push(issue("RASTER_AUDIT_BLANK", `${path_}.capture_report_ref`, `${kind} must report at least 0.6% materially painted pixels.`));
          }
          if (review?.reviewed_role_sha256?.[role] !== derivative?.sha256) {
            errors.push(issue("RASTER_REVIEW_BINDING", `${path_}.capture_report_ref`, `Image review must bind the exact encoded ${role} PNG hash.`));
          }
        }
      }
    }
  }

  if (directions.length === 3 && !setEquals(designLogics, DESIGN_LOGICS)) {
    errors.push(issue("DESIGN_LOGIC_COVERAGE", "$.directions", "Directions must include product_native, benchmark_transfer, and content_native exactly once."));
  }
  if (directions.length === 3 && expressionRecipeCount > 0 && expressionRecipeCount < 3) {
    errors.push(issue("EXPRESSION_RECIPE_PARTIAL", "$.directions", "Expression recipes must be absent for all legacy directions or present for all three."));
  }
  if (expressionRecipeCount === 3) {
    if (!setEquals(candidateFamilies, CANDIDATE_FAMILIES)) {
      errors.push(issue("EXPRESSION_FAMILY_COVERAGE", "$.directions", "Directions must include exactly one fast-read, proof, and system communication job."));
    }
    if (candidateJobs.size !== 3) {
      errors.push(issue("EXPRESSION_JOB_DIVERSITY", "$.directions", "Three directions need three distinct communication jobs."));
    }
    if (primaryGrammars.size !== 3) {
      errors.push(issue("EXPRESSION_GRAMMAR_DIVERSITY", "$.directions", "Three directions need three distinct primary expression grammars."));
    }
    if (evidenceShapeSignatures.size < 2) {
      errors.push(issue("EXPRESSION_SHAPE_DIVERSITY", "$.directions", "Three directions need at least two distinct evidence-shape signatures."));
    }
    if (selectedMaterialEventBindingIds.size >= 3 && !candidateJobs.has("news_synthesis")) {
      errors.push(issue("NEWS_SYNTHESIS_REQUIRED", "$.directions", "Three or more selected material news events require one news-synthesis system candidate."));
    }
  }
  if (directions.length === 3 && financeRouteCount > 0 && financeRouteCount < 3) {
    errors.push(issue("FINANCE_ROUTE_PARTIAL", "$.directions", "Finance route fields must be present and valid for all three directions or omitted for legacy artifacts."));
  }
  if (require_finance_route && financeRouteCount !== directions.length) {
    errors.push(issue("FINANCE_ROUTE_COVERAGE", "$.directions", "Strict finance generation requires a complete route for every retained direction."));
  }
  if (financeRouteCount === 3) {
    if (compositionArchetypes.size !== 3) {
      errors.push(issue("COMPOSITION_DIVERSITY", "$.directions", "Three directions need three distinct composition archetypes."));
    }
    const editorialCount = directions.filter((direction) => isObject(direction) && isObject(direction.expression_recipe) && direction.expression_recipe.composition_archetype === "editorial_statement").length;
    if (editorialCount > 1) {
      errors.push(issue("EDITORIAL_STATEMENT_CAP", "$.directions", "At most one direction may use the editorial_statement composition archetype."));
    }
  }
  if (directions.length === 3 && designVariance !== null && designVariance >= 7) {
    const structuralVariance = Boolean(
      setIntersects(layoutGrids, new Set(["asymmetric_stage", "comparison_field", "freeform"]))
      || setIntersects(layoutAlignments, new Set(["split", "mixed"])),
    );
    if (!structuralVariance) {
      errors.push(issue("DESIGN_VARIANCE_UNDERDELIVERED", "$.directions", "High design variance requires at least one meaningfully asymmetric, comparison, split, mixed, or freeform direction."));
    }
  }
  if (visualDensity !== null && visualDensity <= 3 && layoutDensities.has("dense")) {
    errors.push(issue("DENSITY_DIAL_MISMATCH", "$.directions", "Visual density 1-3 cannot produce a dense direction."));
  }
  if (visualDensity !== null && visualDensity >= 8 && layoutDensities.has("quiet")) {
    errors.push(issue("DENSITY_DIAL_MISMATCH", "$.directions", "Visual density 8-10 cannot produce a quiet direction."));
  }
  if (directions.length === 3 && !setEquals(paletteStrategies, PALETTE_STRATEGIES)) {
    errors.push(issue("PALETTE_STRATEGY_COVERAGE", "$.directions", "Directions must include creator_native, thesis_native, and contrast_variant exactly once."));
  }
  if (directions.length === 3 && (presetIds.size !== 3 || paletteFamilies.size !== 3)) {
    errors.push(issue("PALETTE_DIVERSITY", "$.directions", "Three sibling directions must use three distinct registered palette presets."));
  }
  for (const [strategy, presetId] of paletteChoices) {
    if (recentPaletteIds.has(presetId) && !(strategy === "creator_native" && presetId === signaturePaletteId)) {
      errors.push(issue("PALETTE_RECENT_REPEAT", "$.directions", `Recent palette ${pyrepr(presetId)} may repeat only as an explicit creator signature.`));
    }
  }

  if (directions.length === 3 && !routes.has("claim_first")) {
    errors.push(issue("ROUTE_COVERAGE", "$.directions", "One claim-first direction is required."));
  }
  if (directions.length === 3 && !setIntersects(routes, new Set(["evidence_first", "reasoning_first", "strategy_first", "freeform"]))) {
    errors.push(issue("ROUTE_COVERAGE", "$.directions", "At least one non-claim route is required."));
  }

  const selected = payload.selected_direction_id === undefined ? null : payload.selected_direction_id;
  const reason = payload.selection_reason;
  if (state === "selected") {
    if (!directionIds.has(selected)) {
      errors.push(issue("SELECTION", "$.selected_direction_id", "Selected direction must exist."));
    } else if ((scores.has(pyStr(selected)) ? scores.get(pyStr(selected)) : 0) < 7.5) {
      errors.push(issue("SELECTION_SCORE", "$.selected_direction_id", "Selected direction must score at least 7.5."));
    }
    if (typeof reason !== "string" || trimLen(reason) < 4) {
      errors.push(issue("SELECTION_REASON", "$.selection_reason", "Selected state requires a reason."));
    }
  } else if (selected !== null) {
    errors.push(issue("SELECTION_STATE", "$.selected_direction_id", "Only selected state may select a direction."));
  }

  return errors;
}

// str(PurePosixPath(value)) normalization for argparse type=Path arguments.
function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

function main(argv) {
  let assetRoot = null;
  let requireExpressionRecipes = false;
  let requireFinanceRoute = false;
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--asset-root") {
      assetRoot = argv[(i += 1)];
    } else if (arg.startsWith("--asset-root=")) {
      assetRoot = arg.slice("--asset-root=".length);
    } else if (arg === "--require-expression-recipes") {
      requireExpressionRecipes = true;
    } else if (arg === "--require-finance-route") {
      requireFinanceRoute = true;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1 || assetRoot === undefined) {
    process.stderr.write("usage: validate_visual_direction_set.mjs input [--asset-root ASSET_ROOT] [--require-expression-recipes] [--require-finance-route]\n");
    return 2;
  }
  const payload = JSON.parse(readFileSync(pathStr(positionals[0]), "utf-8"));
  const errors = validate(payload, assetRoot === null ? null : pathStr(assetRoot), {
    require_expression_recipes: requireExpressionRecipes,
    require_finance_route: requireFinanceRoute,
  });
  const result = { ok: errors.length === 0, errors };
  process.stdout.write(pyJsonDumps(result, { indent: 2 }) + "\n");
  return errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
