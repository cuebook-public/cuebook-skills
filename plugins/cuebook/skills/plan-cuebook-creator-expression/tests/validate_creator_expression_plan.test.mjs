import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_SHAPES,
  PRIMITIVE_KINDS,
  QUERY_CAPABILITY_REQUEST_CLASSES,
  QUERY_CAPABILITY_TOOLS,
  VISUAL_CANDIDATE_JOBS,
  VISUAL_ROUTE_REGISTRY,
  VISUAL_ROUTE_SPECS,
  validate,
} from "../scripts/validate_creator_expression_plan.mjs";
import {
  ARCHETYPES,
  EXPECTED_VIEWPOINT_VISUAL_MAP,
  archetype,
  makePlan,
  refreshFingerprint,
  refreshVisualRoute,
  resultCodes,
} from "./creator_expression_fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const clone = (value) => structuredClone(value);
const assertValid = (plan) => {
  const result = validate(plan);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  return result;
};

test("schema declares authorship, registry mappings, and all primitives", () => {
  const schema = JSON.parse(readFileSync(join(here, "..", "references", "creator-expression-plan-v1.schema.json"), "utf8"));
  assert.equal(schema.title, "CreatorExpressionPlanV1");
  assert.ok(schema.required.includes("authorship_assistance"));
  assert.deepEqual(new Set(schema.$defs.primitiveKind.enum), PRIMITIVE_KINDS);
  assert.deepEqual(new Set(schema.$defs.viewpointVisualGrammar.enum), new Set(EXPECTED_VIEWPOINT_VISUAL_MAP.values()));
  assert.deepEqual(new Set(schema.$defs.dataRequirement.properties.kind.enum), new Set(["qualitative", "key_numbers", "series"]));
  assert.ok(schema.required.includes("data_requirements"));
  assert.ok(schema.$defs.dataRequirement.required.includes("expression_surfaces"));
  const fallbackValues = new Set(schema.properties.visual_plan.properties.fallback.properties.strategy.enum);
  assert.ok(["qualitative", "key_numbers", "series"].every((item) => fallbackValues.has(item)));
  assert.ok(schema.properties.visual_plan.required.includes("execution_route"));

  const registry = JSON.parse(readFileSync(join(here, "..", "references", "visual-intent-route-registry-v1.json"), "utf8"));
  assert.equal(registry.schema_version, "visual-intent-route-registry-v1");
  assert.deepEqual(registry, VISUAL_ROUTE_REGISTRY);
  assert.deepEqual(new Set(registry.routes.map((item) => item.route_id)), new Set(VISUAL_ROUTE_SPECS.keys()));
  assert.deepEqual(new Set(registry.evidence_shapes), EVIDENCE_SHAPES);
  assert.deepEqual(
    new Map(registry.query_capabilities.map((item) => [item.capability_id, new Set(item.tool_ids)])),
    QUERY_CAPABILITY_TOOLS,
  );
  assert.deepEqual(
    new Map(registry.query_capabilities.map((item) => [item.capability_id, new Set(item.request_classes)])),
    QUERY_CAPABILITY_REQUEST_CLASSES,
  );
  assert.deepEqual(new Set(schema.$defs.visualCandidateJob.enum), VISUAL_CANDIDATE_JOBS);
  assert.deepEqual(new Set(schema.$defs.evidenceShape.enum), EVIDENCE_SHAPES);

  const directionRegistry = JSON.parse(readFileSync(
    join(here, "..", "..", "direct-cuebook-viewpoint-visual", "references", "viewpoint-expression-registry-v1.json"),
    "utf8",
  ));
  const jobsByFamily = new Map(Object.keys(registry.candidate_families).map((family) => [
    family,
    new Set(directionRegistry.candidate_jobs.filter((item) => item.family === family).map((item) => item.job_id)),
  ]));
  assert.deepEqual(
    jobsByFamily,
    new Map(Object.entries(registry.candidate_families).map(([family, jobs]) => [family, new Set(jobs)])),
  );
  assert.deepEqual(new Set(directionRegistry.evidence_shapes), new Set(registry.evidence_shapes));
});

test("all 11 reverse-engineered archetypes validate", () => {
  assert.equal(ARCHETYPES.length, 11);
  const coveredPrimitives = new Set();
  for (const corpusCase of ARCHETYPES) {
    const plan = makePlan(corpusCase);
    assertValid(plan);
    assert.equal(plan.visual_plan.grammar.primary, EXPECTED_VIEWPOINT_VISUAL_MAP.get(corpusCase.id));
    assert.equal(plan.narrative.primary_engine, plan.visual_plan.grammar.primary);
    for (const item of plan.narrative.primitives) coveredPrimitives.add(item.kind);
  }
  assert.deepEqual(coveredPrimitives, PRIMITIVE_KINDS);
});

test("selection freeze may retain only the chosen visual job", () => {
  const plan = makePlan(archetype("S1"));
  const selected = plan.visual_plan.intent.candidate_jobs.find((item) => item.job === plan.visual_plan.intent.job);
  plan.visual_plan.intent.candidate_jobs = [selected];
  plan.visual_plan.intent.target_evidence_shapes = [...selected.evidence_shapes];
  refreshVisualRoute(plan);
  assertValid(plan);
});

test("visual planning rejects an accidental two-candidate middle state", () => {
  const plan = makePlan(archetype("S1"));
  plan.visual_plan.intent.candidate_jobs.pop();
  assert.ok(resultCodes(validate(plan)).has("VISUAL_CANDIDATE_JOBS"));
});

test("argument grammar is optional and cannot replace the unified engine", () => {
  const plan = makePlan(archetype("X4"));
  delete plan.visual_plan.grammar.argument_grammar;
  assertValid(plan);

  const broken = clone(plan);
  broken.visual_plan.grammar.primary = "comparison";
  assert.ok(resultCodes(validate(broken)).has("VISUAL_GRAMMAR"));

  const mismatched = clone(plan);
  mismatched.visual_plan.grammar.primary = "reaction_test";
  assert.ok(resultCodes(validate(mismatched)).has("TEXT_VISUAL_ENGINE_MISMATCH"));
});

test("semantic lock rejects fingerprint mutation", () => {
  const plan = makePlan(archetype("S1"));
  plan.meaning_fingerprint.canonical_claim = "A different claim.";
  assert.ok(resultCodes(validate(plan)).has("FINGERPRINT_HASH_MISMATCH"));
});

test("no-trade sentiment case cannot gain action or settlement", () => {
  const plan = makePlan(archetype("X6"));
  plan.text_blueprint.action = {
    mode: "include",
    action_kind: "trade",
    purpose: "Buy the asset.",
    semantic_refs: ["CLAIM_X6"],
    max_characters: 60,
    omission_reason: null,
  };
  plan.narrative.primitives.splice(-1, 0, {
    id: "P3",
    kind: "decision",
    purpose: "Add a buy decision.",
    semantic_claim_refs: ["CLAIM_X6"],
    analogy: null,
  });
  Object.assign(plan.settlement_eligibility, {
    status: "candidate",
    reason_codes: ["directional_view"],
    downstream_route: "compile-cuebook-settlement-claim",
  });
  const codes = resultCodes(validate(plan));
  for (const code of ["NO_TRADE_ACTION", "SOURCE_TRADE_ABSENT", "NO_SETTLEMENT"]) assert.ok(codes.has(code));
});

test("source transformation cannot relabel an external trade", () => {
  const plan = makePlan(archetype("X6"));
  Object.assign(plan.meaning_fingerprint, { trade_intent: "explicit", action: "Buy the market." });
  refreshFingerprint(plan);
  assert.ok(resultCodes(validate(plan)).has("SOURCE_OWNER_RELABEL"));
});

test("analogy requires a mapping and breakpoint", () => {
  const plan = makePlan(archetype("X7"));
  const analogy = plan.narrative.primitives.find((item) => item.kind === "analogy");
  analogy.analogy.mapping = [];
  analogy.analogy.breakpoint = "";
  const codes = resultCodes(validate(plan));
  assert.ok(codes.has("ANALOGY_MAPPING"));
  assert.ok(codes.has("ANALOGY_FIELD"));
});

test("public tags require two to four entries and ban backend terms", () => {
  const plan = makePlan(archetype("S1"));
  plan.text_blueprint.public_tags = ["observed"];
  const codes = resultCodes(validate(plan));
  assert.ok(codes.has("STRING_MIN"));
  assert.ok(codes.has("PUBLIC_BACKEND_TERM"));
});

test("image text budget is hard capped", () => {
  const plan = makePlan(archetype("X10"));
  plan.visual_plan.image_text_budget.title_max = 49;
  plan.visual_plan.image_text_budget.total_max = 321;
  assert.ok(validate(plan).errors.filter((item) => item.code === "INTEGER_RANGE").length >= 2);
});

test("missing visual data uses a meaning-preserving fallback", () => {
  const plan = makePlan(archetype("S1"));
  for (const requirement of plan.data_requirements) {
    Object.assign(requirement, { status: "missing", fact_refs: [], source_refs: [] });
  }
  plan.data_requirements.push({
    id: "D2",
    kind: "qualitative",
    request_class: "qualitative_evidence",
    purpose: "Use the source-linked event sequence when the series is unavailable.",
    required: false,
    material_to_claim: false,
    expression_surfaces: ["visual"],
    status: "available",
    fact_refs: ["FACT_S1"],
    source_refs: ["source:reverse-engineering:S1"],
  });
  plan.visual_plan.data_requirement_refs.push("D2");
  plan.visual_plan.execution_route.query_requests.push({
    requirement_ref: "D2",
    capability_id: "market_evidence",
    tool_ids: ["search_assets", "search_news"],
    run_policy: "reuse_or_query_gap",
  });
  refreshVisualRoute(plan);
  Object.assign(plan.visual_plan.fallback, {
    trigger: "missing_required_data",
    strategy: "qualitative",
    applies_to_requirement_refs: ["D1"],
  });
  assertValid(plan);
});

test("material creator premise cannot disappear into fallback", () => {
  const plan = makePlan(archetype("S1"));
  Object.assign(plan.data_requirements[0], {
    kind: "qualitative",
    request_class: "news_anchor",
    material_to_claim: true,
    status: "missing",
    fact_refs: [],
    source_refs: [],
  });
  plan.data_requirements.push({
    id: "D2",
    kind: "qualitative",
    request_class: "qualitative_evidence",
    purpose: "Retain only the unsupported creator judgment as an internal preview.",
    required: false,
    material_to_claim: false,
    expression_surfaces: ["visual"],
    status: "available",
    fact_refs: ["FACT_S1"],
    source_refs: ["source:reverse-engineering:S1"],
  });
  plan.visual_plan.data_requirement_refs.push("D2");
  Object.assign(plan.visual_plan.fallback, {
    trigger: "missing_required_data",
    strategy: "qualitative",
    applies_to_requirement_refs: ["D1"],
  });
  const codes = resultCodes(validate(plan));
  assert.ok(codes.has("MATERIAL_REQUEST_FALLBACK"));
  assert.ok(codes.has("MATERIAL_REQUEST_STATE"));
});

test("missing material news can only be recorded as blocked", () => {
  const plan = makePlan(archetype("S1"));
  Object.assign(plan.data_requirements[0], {
    kind: "qualitative",
    request_class: "news_anchor",
    material_to_claim: true,
    status: "missing",
    fact_refs: [],
    source_refs: [],
  });
  Object.assign(plan.visual_plan.execution_route.query_requests[0], {
    capability_id: "market_evidence",
    tool_ids: ["search_assets", "search_news"],
  });
  for (const candidate of plan.visual_plan.intent.candidate_jobs) candidate.requirement_refs = ["D1"];
  refreshVisualRoute(plan);
  plan.state = "blocked";
  plan.quality_report = {
    decision: "blocked",
    warnings: [],
    hard_failures: ["material_news_anchor_missing"],
  };
  assertValid(plan);
});

test("all non-degradable material classes reject fallback", () => {
  const requestKinds = new Map([
    ["news_anchor", "qualitative"],
    ["valuation_metric", "key_numbers"],
    ["comparison_metric", "key_numbers"],
    ["price_level", "key_numbers"],
    ["settlement_reference", "qualitative"],
  ]);
  for (const [requestClass, kind] of requestKinds) {
    const plan = makePlan(archetype("S1"));
    Object.assign(plan.data_requirements[0], {
      kind,
      request_class: requestClass,
      material_to_claim: true,
      status: "missing",
      fact_refs: [],
      source_refs: [],
    });
    plan.data_requirements.push({
      id: "D2",
      kind: "qualitative",
      request_class: "qualitative_evidence",
      purpose: "Supply an optional qualitative preview.",
      required: false,
      material_to_claim: false,
      expression_surfaces: ["visual"],
      status: "available",
      fact_refs: ["FACT_S1"],
      source_refs: ["source:reverse-engineering:S1"],
    });
    plan.visual_plan.data_requirement_refs.push("D2");
    Object.assign(plan.visual_plan.fallback, {
      trigger: "missing_required_data",
      strategy: "qualitative",
      applies_to_requirement_refs: ["D1"],
    });
    const codes = resultCodes(validate(plan));
    assert.ok(codes.has("MATERIAL_REQUEST_FALLBACK"), requestClass);
    assert.ok(codes.has("MATERIAL_REQUEST_STATE"), requestClass);
  }
});

test("text-only material premise is first class", () => {
  const plan = makePlan(archetype("S1"));
  Object.assign(plan.data_requirements[0], {
    kind: "qualitative",
    request_class: "news_anchor",
    purpose: "Name the creator's source-linked catalyst in text without forcing it into the visual.",
    material_to_claim: true,
    expression_surfaces: ["text"],
  });
  plan.text_blueprint.data_requirement_refs = ["D1"];
  plan.visual_plan.data_requirement_refs = [];
  plan.visual_plan.execution_route.query_requests = [];
  for (const candidate of plan.visual_plan.intent.candidate_jobs) candidate.requirement_refs = [];
  plan.visual_plan.intent.candidate_jobs[1].evidence_shapes = ["creator_judgment"];
  plan.visual_plan.intent.target_evidence_shapes = ["creator_judgment", "qualitative_relation"];
  refreshVisualRoute(plan);
  assertValid(plan);
  assert.deepEqual(plan.visual_plan.data_requirement_refs, []);
});

test("visual intent locks three jobs, tools, and resume path", () => {
  const plan = makePlan(archetype("X11"));
  assertValid(plan);
  const intent = plan.visual_plan.intent;
  assert.deepEqual(new Set(intent.candidate_jobs.map((item) => item.family)), new Set(["fast_read", "proof", "system"]));
  assert.ok(new Set(intent.candidate_jobs.map((item) => item.job)).has(intent.job));
  const route = plan.visual_plan.execution_route;
  assert.deepEqual(route.skill_path_ids, VISUAL_ROUTE_SPECS.get("viewpoint_static").skill_path_ids);
  assert.equal(route.resume_policy, "resume_from_latest_valid_artifact");
});

test("visual query route requires exact requirement coverage and tools", () => {
  const missing = makePlan(archetype("S1"));
  missing.visual_plan.execution_route.query_requests = [];
  assert.ok(resultCodes(validate(missing)).has("VISUAL_QUERY_REQUIREMENT_COVERAGE"));

  const wrongTools = makePlan(archetype("S1"));
  wrongTools.visual_plan.execution_route.query_requests[0].tool_ids = ["search_assets", "get_market_state"];
  refreshVisualRoute(wrongTools);
  assert.ok(resultCodes(validate(wrongTools)).has("VISUAL_QUERY_TOOLS"));
});

test("visual intent route hash detects downstream reclassification", () => {
  const plan = makePlan(archetype("X2_X3"));
  plan.visual_plan.intent.candidate_jobs[2].job = "cycle_map";
  assert.ok(resultCodes(validate(plan)).has("VISUAL_ROUTE_HASH"));
});

test("OHLCV evidence requires the thesis-chart detail route", () => {
  const plan = makePlan(archetype("S1"));
  plan.visual_plan.intent.candidate_jobs[1].evidence_shapes = ["ohlcv_series"];
  plan.visual_plan.intent.target_evidence_shapes = ["creator_judgment", "ohlcv_series", "qualitative_relation"];
  refreshVisualRoute(plan);
  assert.ok(resultCodes(validate(plan)).has("OHLCV_RENDERER_ROUTE"));

  Object.assign(plan.visual_plan.execution_route, {
    route_id: "viewpoint_static_plus_thesis_chart",
    skill_path_ids: VISUAL_ROUTE_SPECS.get("viewpoint_static_plus_thesis_chart").skill_path_ids,
    detail_renderer_skill_id: "render-cuebook-thesis-chart",
  });
  refreshVisualRoute(plan);
  assertValid(plan);
});

test("request class rejects an incompatible data mode", () => {
  const plan = makePlan(archetype("S1"));
  Object.assign(plan.data_requirements[0], { kind: "qualitative", request_class: "valuation_metric" });
  assert.ok(resultCodes(validate(plan)).has("REQUEST_CLASS_KIND"));
});

test("invented first-person experience is rejected", () => {
  const plan = makePlan(archetype("X11"));
  plan.narrative.frame = "I rotated my portfolio after I saw this ratio spike.";
  assert.ok(resultCodes(validate(plan)).has("INVENTED_FIRST_PERSON_EXPERIENCE"));
});

test("Cuebook-assisted contract records all addition decisions", () => {
  const plan = makePlan(archetype("S1"));
  const authorship = plan.authorship_assistance;
  Object.assign(authorship, {
    mode: "cuebook_assisted",
    cuebook_additions: [
      { id: "CA1", kind: "evidence", summary: "Added the dated selling evidence.", support_refs: ["FACT_S1"] },
      { id: "CA2", kind: "connection", summary: "Connected absorption to seller exhaustion.", support_refs: ["CLAIM_S1"] },
      { id: "CA3", kind: "countercase", summary: "Added the risk that demand fades.", support_refs: ["FACT_S1"] },
      { id: "CA4", kind: "rule", summary: "Kept action behind the source trigger.", support_refs: ["CLAIM_S1"] },
    ],
    creator_accepted_addition_ids: ["CA1", "CA2", "CA4"],
    creator_rejected_addition_ids: ["CA3"],
    idea_delta: "The seed became a bounded trade idea with evidence, a causal bridge, and a retained trigger.",
    public_attribution_required: false,
    public_attribution_line: null,
  });
  assertValid(plan);
  assert.deepEqual(new Set(authorship.cuebook_additions.map((item) => item.kind)), new Set(["evidence", "connection", "countercase", "rule"]));

  const publicAttribution = clone(plan);
  Object.assign(publicAttribution.authorship_assistance, {
    public_attribution_required: true,
    public_attribution_line: "Cuebook helped me refine the trade idea.",
  });
  assert.ok(resultCodes(validate(publicAttribution)).has("CUEBOOK_ASSISTANCE_INTERNAL"));

  const publicNarration = clone(plan);
  publicNarration.narrative.frame = "Cuebook completed this trade idea for me.";
  assert.ok(resultCodes(validate(publicNarration)).has("PUBLIC_CUEBOOK_NARRATION"));

  const sourceLabel = clone(plan);
  sourceLabel.narrative.frame = "Data source: Cuebook; the trading judgment remains the creator's own.";
  assertValid(sourceLabel);

  const broken = clone(plan);
  broken.authorship_assistance.creator_rejected_addition_ids = [];
  assert.ok(resultCodes(validate(broken)).has("ADDITION_DECISION_COVERAGE"));
});

test("anti-AI language rejects stock phrases and repeated reframe", () => {
  const plan = makePlan(archetype("S1"));
  plan.narrative.frame = "It is worth noting that this is not price noise but a structural change.";
  plan.visual_plan.intent.primary_message = "This is not short-term volatility but a long-term rerating.";
  const codes = resultCodes(validate(plan));
  assert.ok(codes.has("AI_STOCK_PHRASE"));
  assert.ok(codes.has("REPEATED_NOT_A_BUT_B"));
});

test("settlement candidate is routed without invention", () => {
  const plan = makePlan(archetype("S1"));
  plan.meaning_fingerprint.settlement_intent = "candidate";
  refreshFingerprint(plan);
  plan.settlement_eligibility = {
    status: "candidate",
    reason_codes: ["source_requests_measurable_followup"],
    claim_ref: null,
    requirements: {
      metric: true,
      operator: true,
      threshold: false,
      deadline: false,
      authoritative_source: true,
    },
    missing_requirements: ["threshold", "deadline"],
    downstream_route: "compile-cuebook-settlement-claim",
  };
  assertValid(plan);
});
