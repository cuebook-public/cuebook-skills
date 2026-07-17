import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EVIDENCE_SHAPES, validate } from "../scripts/validate_viewpoint_data_bundle.mjs";
import {
  baseBundle,
  bundleWithEvidence,
  evidenceObject,
  explicitLevel,
  expressionPlan,
  keyValue,
  sourcedEvent,
} from "./viewpoint_data_fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, "..");

function codes(result) {
  return new Set(result.errors.map((item) => item.code));
}

function assertCode(result, code) {
  assert.ok(codes(result).has(code), `${code} missing from ${JSON.stringify(result.errors)}`);
}

function assertValid(item, plan = null) {
  const result = validate(item, { expressionPlan: plan });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}

test("schema retains typed provenance and requirement fields", () => {
  const schema = JSON.parse(readFileSync(join(skillRoot, "references", "viewpoint-data-bundle-v1.schema.json"), "utf8"));
  const requirementFields = new Set(schema.$defs.requirement.required);
  for (const field of ["expression_plan_requirement_ref", "request_class", "material_to_claim", "expression_surfaces"]) assert.ok(requirementFields.has(field));
  const eventFields = new Set(schema.$defs.event.required);
  for (const field of ["publisher_or_issuer", "source_type", "source_url", "supported_fact_refs"]) assert.ok(eventFields.has(field));
  const levelFields = new Set(schema.$defs.level.required);
  for (const field of ["instrument_ref", "source_ref", "fact_refs", "explicit"]) assert.ok(levelFields.has(field));
});

test("base bundle is valid with expression plan", () => assertValid(baseBundle(), expressionPlan()));

test("conditional qualitative fallback is valid", () => {
  const item = baseBundle();
  item.state = item.quality_report.decision = "conditional";
  item.series = [];
  Object.assign(item.requirements[0], {
    status: "missing",
    resolved_refs: [],
    missing_reason: "OHLCV was not supplied.",
    fallback: { mode: "qualitative", grammar: "binary_level", reason: "Show the explicit level and two paths without candles." },
  });
  Object.assign(item.render_payload, { mode: "qualitative", series_refs: [] });
  Object.assign(item.quality_report.counts, { series: 0, missing_required: 1 });
  assertValid(item);
});

test("OHLC high must dominate", () => {
  const item = baseBundle();
  item.series[0].points[0].h = 1800000;
  assertCode(validate(item), "OHLC_HIGH");
});

test("declaration rejects post-cutoff availability", () => {
  const item = baseBundle();
  item.series[0].points[1].available_at = "2026-07-14T08:01:00Z";
  assertCode(validate(item), "POST_CUTOFF_DATA");
});

test("derived value requires formula", () => {
  const item = baseBundle();
  item.key_values.push({
    value_id: "VAL_derived",
    label: "Return",
    numeric_value: 2.0,
    instrument_refs: ["INS_primary"],
    display_value: "+2.0%",
    unit: "%",
    as_of: "2026-07-14T06:30:00Z",
    available_at: "2026-07-14T06:31:00Z",
    source_ref: "derived:return",
    evidence_kind: "derived",
    formula_ref: null,
    role: "driver",
    valuation_basis: null,
  });
  item.quality_report.counts.key_values = 1;
  assertCode(validate(item), "VALUE_FORMULA_REQUIRED");
});

test("formula inputs must resolve", () => {
  const item = baseBundle();
  item.formulas.push({
    formula_id: "FORM_return",
    label: "Return",
    expression: "close / base - 1",
    input_refs: ["SER_missing"],
    output_unit: "%",
    window: "1d",
    normalization: "none",
    limitations: ["Requires aligned closes."],
  });
  item.quality_report.counts.formulas = 1;
  assertCode(validate(item), "UNKNOWN_FORMULA_INPUT");
});

test("key-number render mode needs values", () => {
  const item = baseBundle();
  Object.assign(item.render_payload, { mode: "key_numbers", series_refs: [], value_refs: [] });
  assertCode(validate(item), "KEY_NUMBER_MODE_EMPTY");
});

test("forming point must be last", () => {
  const item = baseBundle();
  item.series[0].points[0].state = "forming";
  assertCode(validate(item), "FORMING_NOT_LAST");
});

test("missing required degradable data needs fallback", () => {
  const item = baseBundle();
  item.state = item.quality_report.decision = "conditional";
  item.series = [];
  Object.assign(item.requirements[0], { status: "missing", resolved_refs: [], missing_reason: "No data", fallback: null });
  Object.assign(item.render_payload, { mode: "qualitative", series_refs: [] });
  Object.assign(item.quality_report.counts, { series: 0, missing_required: 1 });
  assertCode(validate(item), "MISSING_WITHOUT_FALLBACK");
});

test("quality counts must be exact", () => {
  const item = baseBundle();
  item.quality_report.counts.series = 99;
  assertCode(validate(item), "COUNTS");
});

test("proxy needs mapping limitation", () => {
  const item = baseBundle();
  Object.assign(item.instruments[0], { role: "proxy", mapping_limitation: null });
  assertCode(validate(item), "PROXY_LIMITATION");
});

test("rendered comparison series need compatible basis", () => {
  const item = baseBundle();
  const second = structuredClone(item.series[0]);
  Object.assign(second, { series_id: "SER_comparator", unit: "USD" });
  item.series.push(second);
  item.render_payload.series_refs.push("SER_comparator");
  item.quality_report.counts.series = 2;
  assertCode(validate(item), "COMPARISON_BASIS");
});

test("upstream requirement must point into lineage plan", () => {
  const item = baseBundle();
  item.requirements[0].expression_plan_requirement_ref = "CEXP_other@r1#/data_requirements/D1";
  assertCode(validate(item), "UPSTREAM_REQUIREMENT_REF");
});

test("supplied plan metadata must match", () => {
  const item = baseBundle();
  item.requirements[0].material_to_claim = true;
  assertCode(validate(item, { expressionPlan: expressionPlan() }), "UPSTREAM_REQUIREMENT_MISMATCH");
});

test("supplied plan required requests must be covered", () => {
  const item = baseBundle();
  const plan = expressionPlan();
  plan.data_requirements.push({
    id: "D2",
    kind: "qualitative",
    request_class: "news_anchor",
    required: true,
    material_to_claim: true,
    expression_surfaces: ["text"],
  });
  assertCode(validate(item, { expressionPlan: plan }), "UPSTREAM_REQUIREMENT_COVERAGE");
});

test("material request classes cannot fallback or remain conditional", () => {
  const materialClasses = {
    news_anchor: "event",
    valuation_metric: "key_value",
    comparison_metric: "key_value",
    price_level: "level",
    settlement_reference: "event",
  };
  for (const [requestClass, kind] of Object.entries(materialClasses)) {
    const item = baseBundle();
    item.state = item.quality_report.decision = "conditional";
    item.request.required_kinds = [kind];
    Object.assign(item.requirements[0], {
      kind,
      request_class: requestClass,
      material_to_claim: true,
      status: "missing",
      resolved_refs: [],
      missing_reason: "The material request could not be resolved.",
      fallback: { mode: "qualitative", grammar: "binary_level", reason: "Attempt a generic fallback." },
    });
    item.quality_report.counts.missing_required = 1;
    const result = validate(item);
    assertCode(result, "MATERIAL_REQUEST_FALLBACK");
    assertCode(result, "MATERIAL_REQUEST_STATE");
  }
});

test("material comparison cannot degrade", () => {
  const item = baseBundle();
  item.state = item.quality_report.decision = "blocked";
  item.quality_report.hard_failures = ["material_comparison_degraded"];
  Object.assign(item.requirements[0], {
    request_class: "comparison_metric",
    material_to_claim: true,
    status: "degraded",
    missing_reason: "Only one side of the comparator was available.",
    fallback: { mode: "qualitative", grammar: "binary_level", reason: "Replace the comparator with prose." },
  });
  const result = validate(item);
  assertCode(result, "MATERIAL_REQUEST_DEGRADED");
  assertCode(result, "MATERIAL_REQUEST_FALLBACK");
});

test("blocked material price gap can omit fallback", () => {
  const item = baseBundle();
  item.state = item.quality_report.decision = "blocked";
  item.quality_report.hard_failures = ["material_price_level_missing"];
  item.quality_report.counts.missing_required = 1;
  item.request.required_kinds = ["level"];
  Object.assign(item.requirements[0], {
    kind: "level",
    request_class: "price_level",
    material_to_claim: true,
    status: "missing",
    resolved_refs: [],
    missing_reason: "The creator's exact level was not supplied.",
    fallback: null,
  });
  assertValid(item);
});

test("material news event is valid and must render on visual surface", () => {
  const item = baseBundle();
  item.series = [];
  Object.assign(item.render_payload, { mode: "qualitative", series_refs: [] });
  item.events = [sourcedEvent()];
  item.request.required_kinds = ["event"];
  Object.assign(item.requirements[0], { kind: "event", request_class: "news_anchor", material_to_claim: true, resolved_refs: ["EV_catalyst"] });
  item.render_payload.event_refs = ["EV_catalyst"];
  Object.assign(item.quality_report.counts, { series: 0, events: 1 });
  assertValid(item);
  const omitted = structuredClone(item);
  omitted.render_payload.event_refs = [];
  assertCode(validate(omitted), "MATERIAL_RENDER_OMISSION");
  item.events[0].source_url = null;
  assertCode(validate(item), "NEWS_EVIDENCE");
});

test("text-only material news need not render", () => {
  const item = baseBundle();
  item.series = [];
  Object.assign(item.render_payload, { mode: "qualitative", series_refs: [] });
  item.events = [sourcedEvent()];
  item.request.required_kinds = ["event"];
  Object.assign(item.requirements[0], {
    kind: "event",
    request_class: "news_anchor",
    material_to_claim: true,
    expression_surfaces: ["text"],
    resolved_refs: ["EV_catalyst"],
  });
  Object.assign(item.quality_report.counts, { series: 0, events: 1 });
  const plan = expressionPlan();
  Object.assign(plan.data_requirements[0], { kind: "qualitative", request_class: "news_anchor", material_to_claim: true, expression_surfaces: ["text"] });
  assertValid(item, plan);
  assert.deepEqual(item.render_payload.event_refs, []);
});

test("event source is structurally required", () => {
  const item = baseBundle();
  const event = sourcedEvent();
  delete event.source_ref;
  item.events = [event];
  item.quality_report.counts.events = 1;
  const result = validate(item);
  assertCode(result, "MISSING_FIELD");
  assertCode(result, "EVENT_SOURCE");
});

test("explicit material level is valid and source-linked", () => {
  const item = baseBundle();
  item.levels = [explicitLevel()];
  item.request.required_kinds = ["level"];
  Object.assign(item.requirements[0], { kind: "level", request_class: "price_level", material_to_claim: true, resolved_refs: ["LVL_trigger"] });
  item.render_payload.level_refs = ["LVL_trigger"];
  item.quality_report.counts.levels = 1;
  assertValid(item);
  delete item.levels[0].source_ref;
  const result = validate(item);
  assertCode(result, "MISSING_FIELD");
  assertCode(result, "PRICE_LEVEL_EVIDENCE");
});

test("valuation metadata and P/E meaningfulness are enforced", () => {
  const item = baseBundle();
  item.key_values = [keyValue("VAL_valuation", "INS_primary", { valuation: true })];
  item.request.required_kinds = ["key_value"];
  Object.assign(item.requirements[0], { kind: "key_value", request_class: "valuation_metric", material_to_claim: true, resolved_refs: ["VAL_valuation"] });
  item.render_payload.value_refs = ["VAL_valuation"];
  item.quality_report.counts.key_values = 1;
  assertValid(item);
  item.key_values[0].valuation_basis.denominator_value = -1.0;
  assertCode(validate(item), "PE_NOT_MEANINGFUL");
});

test("comparison metrics need aligned instruments and times", () => {
  const item = baseBundle();
  item.instruments.push({
    instrument_id: "INS_comparator",
    entity_ref: "ENTITY_comparator",
    symbol: "CMP",
    venue: "XKRX",
    currency: "KRW",
    role: "comparator",
    mapping_source_ref: "ENTITYMAP_comparator",
    mapping_limitation: null,
  });
  item.key_values = [keyValue("VAL_primary", "INS_primary"), keyValue("VAL_comparator", "INS_comparator")];
  item.request.required_kinds = ["key_value"];
  Object.assign(item.requirements[0], { kind: "key_value", request_class: "comparison_metric", material_to_claim: true, resolved_refs: ["VAL_primary", "VAL_comparator"] });
  item.render_payload.value_refs = ["VAL_primary", "VAL_comparator"];
  Object.assign(item.quality_report.counts, { instruments: 2, key_values: 2 });
  assertValid(item);
  item.key_values[1].as_of = "2026-07-13T06:30:00Z";
  assertCode(validate(item), "COMPARISON_TIME_BASIS");
});

test("settlement reference needs official deadline and value or level", () => {
  const item = baseBundle();
  item.events = [sourcedEvent({ role: "deadline", sourceType: "exchange" })];
  item.levels = [explicitLevel()];
  item.request.required_kinds = ["event"];
  Object.assign(item.requirements[0], { kind: "event", request_class: "settlement_reference", material_to_claim: true, resolved_refs: ["EV_catalyst", "LVL_trigger"] });
  Object.assign(item.render_payload, { event_refs: ["EV_catalyst"], level_refs: ["LVL_trigger"] });
  Object.assign(item.quality_report.counts, { events: 1, levels: 1 });
  assertValid(item);
  item.events[0].role = "news";
  assertCode(validate(item), "SETTLEMENT_EVIDENCE");
});

test("official event must use official source type", () => {
  const item = baseBundle();
  item.events = [sourcedEvent({ role: "policy", sourceType: "regulator" })];
  item.request.required_kinds = ["event"];
  Object.assign(item.requirements[0], { kind: "event", request_class: "official_event", material_to_claim: false, resolved_refs: ["EV_catalyst"] });
  item.quality_report.counts.events = 1;
  assertValid(item);
  item.events[0].source_type = "publisher";
  assertCode(validate(item), "OFFICIAL_EVENT_EVIDENCE");
});

const distribution = evidenceObject("distribution_sample", {
  observations: [-4.0, -1.0, 0.5, 2.0, 3.5, 7.0],
  n: 6,
  observation_unit: "five-session event return",
  unit: "%",
  window: "five completed sessions after each event",
  population: "comparable issuer announcements since 2024",
  weights: "equal",
  quartile_method: "linear interpolation",
  whisker_rule: "1.5 IQR",
  outlier_policy: "show raw outliers",
});

const quantile = evidenceObject("quantile_scenarios", {
  cutoff: "2026-07-14T08:00:00Z",
  horizon: "five completed sessions",
  quantile_levels: [0.1, 0.5, 0.9],
  quantile_values: [
    { t: "2026-07-15T20:00:00Z", values: [90.0, 100.0, 112.0] },
    { t: "2026-07-20T20:00:00Z", values: [84.0, 102.0, 121.0] },
  ],
  unit: "USD",
  model_or_method: "historical event-conditioned bootstrap",
  model_vintage: "MODEL_event_bootstrap@2026-07-14",
  calibration: "rolling two-year out-of-sample coverage",
}, { state: "modeled", formulaRef: "FORM_quantiles" });

const partToWhole = evidenceObject("part_to_whole", {
  parts: [{ label: "Core", value: 55.0 }, { label: "Growth", value: 35.0 }],
  denominator: 100.0,
  unit: "%",
  basis: "reported revenue mix",
  residual: 10.0,
});

const bridge = evidenceObject("additive_components", {
  start: 100.0,
  components: [{ label: "pricing", value: 12.0 }, { label: "volume", value: -4.0 }],
  end: 110.0,
  unit: "index points",
  period: "Q2 to Q3",
  residual: 2.0,
});

const flow = evidenceObject("quantified_flow", {
  edges: [
    { origin: "Cash", destination: "SMH", value: 45.0 },
    { origin: "Cash", destination: "DRAM", value: 35.0 },
  ],
  unit: "% of allocation",
  window: "creator allocation at publication",
  residual: 20.0,
  declared_total: 100.0,
});

const categories = evidenceObject("ordered_categories", {
  items: [
    { label: "Catalyst", state: "observed", source_refs: ["SRC_catalyst"] },
    { label: "Revenue revision", state: "conditional", source_refs: ["SRC_estimates"] },
    { label: "Price confirmation", state: "conditional", source_refs: ["SRC_market"] },
  ],
  order_basis: "creator's stated confirmation sequence",
}, { sourceRefs: ["SRC_catalyst", "SRC_estimates", "SRC_market"] });

const payoff = evidenceObject("payoff_series", {
  instrument_terms: [{
    instrument_ref: "INS_primary",
    instrument_type: "put",
    side: "long",
    strike: 100.0,
    expiry: "2026-07-31T20:00:00Z",
    quantity: 1.0,
    premium: 4.0,
  }],
  underlying_domain: { min: 70.0, max: 130.0, unit: "USD" },
  calculation_method: {
    basis: "terminal_payoff",
    model: null,
    assumptions: ["Exercise and assignment costs are excluded."],
  },
  values: [
    { underlying: 70.0, payoff: 26.0 },
    { underlying: 100.0, payoff: -4.0 },
    { underlying: 130.0, payoff: -4.0 },
  ],
  unit: "USD per contract share",
}, { state: "modeled", formulaRef: "FORM_payoff" });

function quantileFormula() {
  return {
    formula_id: "FORM_quantiles",
    label: "Event-conditioned quantiles",
    expression: "quantile(bootstrapped_return_paths)",
    input_refs: ["SER_ohlcv"],
    output_unit: "USD",
    window: "five sessions",
    normalization: "cutoff close = 100%",
    limitations: ["Historical event paths may not represent the next event."],
  };
}

function payoffFormula() {
  return {
    formula_id: "FORM_payoff",
    label: "Long put terminal payoff",
    expression: "max(strike - underlying, 0) - premium",
    input_refs: ["SER_ohlcv"],
    output_unit: "USD per contract share",
    window: "at expiry",
    normalization: "one option contract share",
    limitations: ["Terminal payoff excludes pre-expiry volatility and time value."],
  };
}

test("schema and expression registry cover every evidence shape", () => {
  const schema = JSON.parse(readFileSync(join(skillRoot, "references", "viewpoint-data-bundle-v1.schema.json"), "utf8"));
  const schemaShapes = new Set(schema.$defs.evidenceShape.enum);
  assert.deepEqual(schemaShapes, EVIDENCE_SHAPES);
  const registry = JSON.parse(readFileSync(join(skillRoot, "..", "direct-cuebook-viewpoint-visual", "references", "viewpoint-expression-registry-v1.json"), "utf8"));
  for (const shape of schemaShapes) assert.ok(new Set(registry.evidence_shapes).has(shape));
  assert.ok(registry.evidence_contracts.quantile_scenarios.required_fields.includes("unit"));
  assert.ok(registry.evidence_contracts.quantified_flow.required_fields.includes("declared_total"));
  assert.equal(schema.required.includes("evidence_objects"), false);
  assert.equal(schema.$defs.renderPayload.required.includes("evidence_object_refs"), false);
  const payloadRefs = new Set(schema.$defs.evidenceObject.allOf.filter((clause) => Object.hasOwn(clause.then.properties, "payload")).map((clause) => clause.then.properties.payload.$ref));
  assert.equal(payloadRefs.size, schemaShapes.size);
  assert.ok([...payloadRefs].every((schemaRef) => schemaRef.startsWith("#/$defs/")));
});

test("news cluster validates source provenance and count", () => {
  const newsA = sourcedEvent();
  const newsB = structuredClone(newsA);
  Object.assign(newsB, {
    event_id: "EV_followup",
    label: "Independent outlet confirms the dated catalyst",
    source_ref: "SRC_independent_confirmation",
    publisher_or_issuer: "Independent Publisher",
    source_type: "publisher",
    source_url: "https://example.net/confirmation",
    supported_fact_refs: ["FACT_confirmation"],
  });
  const object = evidenceObject("news_cluster", {
    cluster_id: "NCLUSTER_catalyst",
    event_refs: ["EV_catalyst", "EV_followup"],
    cluster_method: "same entity, event time, and supported fact",
    unique_source_count: 2,
  }, { state: "derived", sourceRefs: ["SRC_issuer_announcement", "SRC_independent_confirmation"] });
  const item = bundleWithEvidence(object, { requestClass: "news_anchor" });
  item.events = [newsA, newsB];
  item.quality_report.counts.events = 2;
  assertValid(item);
  item.evidence_objects[0].payload.unique_source_count = 3;
  assertCode(validate(item), "NEWS_CLUSTER_SOURCE_COUNT");
});

test("distribution sample validates observation count", () => {
  const item = bundleWithEvidence(distribution, { requestClass: "market_series" });
  assertValid(item);
  item.evidence_objects[0].payload.n = 99;
  assertCode(validate(item), "DISTRIBUTION_N");
});

test("quantile scenarios validate formula and non-crossing rows", () => {
  const item = bundleWithEvidence(quantile, { requestClass: "market_series" });
  item.formulas = [quantileFormula()];
  item.render_payload.formula_refs = ["FORM_quantiles"];
  item.quality_report.counts.formulas = 1;
  assertValid(item);
  item.evidence_objects[0].payload.quantile_values[0].values = [90.0, 113.0, 112.0];
  assertCode(validate(item), "QUANTILE_CROSSING");
});

test("part-to-whole reconciles denominator", () => {
  const item = bundleWithEvidence(partToWhole, { requestClass: "comparison_metric" });
  assertValid(item);
  item.evidence_objects[0].payload.residual = 5.0;
  assertCode(validate(item), "PART_RECONCILIATION");
});

test("additive components reconcile bridge", () => {
  const item = bundleWithEvidence(bridge, { requestClass: "market_series" });
  assertValid(item);
  item.evidence_objects[0].payload.end = 111.0;
  assertCode(validate(item), "BRIDGE_RECONCILIATION");
});

test("quantified flow reconciles total", () => {
  const item = bundleWithEvidence(flow, { requestClass: "market_series" });
  assertValid(item);
  item.evidence_objects[0].payload.declared_total = 110.0;
  assertCode(validate(item), "FLOW_RECONCILIATION");
});

test("ordered categories validate nested source closure", () => {
  const item = bundleWithEvidence(categories);
  assertValid(item);
  item.evidence_objects[0].source_refs = ["SRC_catalyst", "SRC_estimates"];
  assertCode(validate(item), "NESTED_SOURCE_CLOSURE");
});

test("payoff series validates order and strict payload shape", () => {
  const item = bundleWithEvidence(payoff, { requestClass: "market_series" });
  item.formulas = [payoffFormula()];
  item.render_payload.formula_refs = ["FORM_payoff"];
  item.quality_report.counts.formulas = 1;
  assertValid(item);
  item.evidence_objects[0].payload.values[2].underlying = 90.0;
  assertCode(validate(item), "PAYOFF_ORDER");

  const unknown = bundleWithEvidence(payoff, { requestClass: "market_series" });
  unknown.formulas = [payoffFormula()];
  unknown.render_payload.formula_refs = ["FORM_payoff"];
  unknown.quality_report.counts.formulas = 1;
  unknown.evidence_objects[0].payload.strike = 100.0;
  assertCode(validate(unknown), "UNKNOWN_FIELD");
});

test("material structured evidence must be rendered", () => {
  const item = bundleWithEvidence(distribution, { requestClass: "market_series" });
  item.requirements[0].material_to_claim = true;
  item.render_payload.evidence_object_refs = [];
  assertCode(validate(item), "MATERIAL_RENDER_OMISSION");
});

test("structured requirement shape must match resolved object", () => {
  const item = bundleWithEvidence(distribution, { requestClass: "market_series" });
  item.request.required_kinds = ["quantified_flow"];
  item.requirements[0].kind = "quantified_flow";
  assertCode(validate(item), "EVIDENCE_KIND_MISMATCH");
});

test("structured evidence respects cutoff and as-of", () => {
  const postCutoff = bundleWithEvidence(distribution, { requestClass: "market_series" });
  postCutoff.evidence_objects[0].available_at = "2026-07-14T08:01:00Z";
  assertCode(validate(postCutoff), "POST_CUTOFF_DATA");
  const afterAsOf = bundleWithEvidence(distribution, { requestClass: "market_series" });
  afterAsOf.evidence_objects[0].as_of = "2026-07-14T08:01:00Z";
  assertCode(validate(afterAsOf), "EVIDENCE_AFTER_AS_OF");
});

test("render refs and evidence counts must resolve exactly", () => {
  const unknown = bundleWithEvidence(distribution, { requestClass: "market_series" });
  unknown.render_payload.evidence_object_refs = ["EOBJ_missing"];
  assertCode(validate(unknown), "UNKNOWN_RENDER_REF");
  const badCounts = bundleWithEvidence(distribution, { requestClass: "market_series" });
  delete badCounts.quality_report.counts.evidence_objects;
  assertCode(validate(badCounts), "COUNTS");
});

test("pre-expiry payoff requires pricing model", () => {
  const item = bundleWithEvidence(payoff, { requestClass: "market_series" });
  item.formulas = [payoffFormula()];
  item.render_payload.formula_refs = ["FORM_payoff"];
  item.quality_report.counts.formulas = 1;
  item.evidence_objects[0].payload.calculation_method = { basis: "pre_expiry_pnl", model: null, assumptions: [] };
  assertCode(validate(item), "PAYOFF_PRICING_MODEL");
});

test("derived bridge requires formula", () => {
  const item = bundleWithEvidence(bridge, { requestClass: "market_series" });
  item.evidence_objects[0].state = "derived";
  assertCode(validate(item), "EVIDENCE_FORMULA_REQUIRED");
});

test("option payoff terms require expiry", () => {
  const item = bundleWithEvidence(payoff, { requestClass: "market_series" });
  item.formulas = [payoffFormula()];
  item.quality_report.counts.formulas = 1;
  item.evidence_objects[0].payload.instrument_terms[0].expiry = null;
  assertCode(validate(item), "PAYOFF_OPTION_TERMS");
});

export {
  bridge,
  categories,
  distribution,
  flow,
  partToWhole,
  payoff,
  payoffFormula,
  quantile,
  quantileFormula,
};
