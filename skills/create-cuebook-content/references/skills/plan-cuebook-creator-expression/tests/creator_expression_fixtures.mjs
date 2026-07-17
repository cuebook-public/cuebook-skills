import {
  ACTION_BY_TRADE_INTENT,
  VISUAL_ROUTE_REGISTRY_SHA256,
  calculateFingerprintHash,
  calculateVisualRouteHash,
} from "../scripts/validate_creator_expression_plan.mjs";

export const ARCHETYPES = [
  {
    id: "S1",
    engine: "reaction_test",
    visualGrammar: "reaction_test",
    argumentGrammar: "causal_chain",
    dataKinds: ["series"],
    claim: "BTC held firm after a concentrated bad-news cluster, supporting a buy-the-dip setup.",
    mechanism: "Known forced selling loses impact when the marginal seller is exhausted.",
    tradeIntent: "conditional",
    action: "Buy BTC dips only if price keeps absorbing the disclosed selling.",
    direction: "bullish",
    comparator: null,
    register: "desk",
  },
  {
    id: "X1",
    engine: "parallel_contrast",
    visualGrammar: "parallel_contrast",
    argumentGrammar: "comparison",
    dataKinds: ["qualitative"],
    claim: "Korean equities and spot crypto produced opposite household outcomes during the same market window.",
    mechanism: "Leverage and asset selection split one macro period into sharply different balance-sheet outcomes.",
    tradeIntent: "none",
    action: null,
    direction: "none",
    comparator: "spot crypto",
    register: "cinematic",
  },
  {
    id: "X2_X3",
    engine: "category_reframe",
    visualGrammar: "category_reframe",
    argumentGrammar: "comparison",
    dataKinds: ["qualitative"],
    claim: "Robinhood Chain is better evaluated as tokenized-market infrastructure than as a generic L2.",
    mechanism: "Composable tokenized securities could shift value from a product feature to a market-infrastructure layer.",
    tradeIntent: "conditional",
    action: "Prefer HOOD exposure only if tokenized-stock value capture remains with the company.",
    direction: "bullish",
    comparator: "generic L2",
    register: "explainer",
    frame: "这不是一条普通新链，而是对代币化市场基础设施的重估。",
  },
  {
    id: "X4",
    engine: "reaction_test",
    visualGrammar: "relative_value_trigger",
    argumentGrammar: "comparison",
    dataKinds: ["key_numbers"],
    claim: "The Brent/WTI spread is the cleaner expression when geopolitical headlines outrun the oil open.",
    mechanism: "Brent carries more direct exposure to the shipping-risk premium than WTI.",
    tradeIntent: "conditional",
    action: "Short Brent against WTI only after the spread reaches the stated trigger.",
    direction: "underperform",
    comparator: "WTI",
    register: "desk",
  },
  {
    id: "X5",
    engine: "forced_flow_loop",
    visualGrammar: "policy_pivot",
    argumentGrammar: "causal_chain",
    dataKinds: ["qualitative"],
    claim: "Korean memory weakness can feed on leverage until policy or flow conditions change.",
    mechanism: "Falling prices force levered holders to sell, creating another round of price pressure.",
    tradeIntent: "observe_only",
    action: "Watch for Korean policy tightening and leverage-flow stabilization.",
    direction: "neutral",
    comparator: null,
    register: "strategist",
  },
  {
    id: "X6",
    engine: "sentiment_witness",
    visualGrammar: "sentiment_witness",
    argumentGrammar: "evidence_balance",
    dataKinds: ["qualitative"],
    claim: "A liquidation confession is a sentiment witness, not standalone market evidence.",
    mechanism: "Personal capitulation can reveal holder stress but cannot establish a market turn without corroboration.",
    tradeIntent: "none",
    action: null,
    direction: "none",
    comparator: null,
    register: "research_memo",
    authorshipMode: "source_transformation",
  },
  {
    id: "X7",
    engine: "event_unwind",
    visualGrammar: "event_unwind",
    argumentGrammar: "price_timeline",
    dataKinds: ["qualitative"],
    claim: "A widely anticipated access event can unwind after pre-event buyers become sellers.",
    mechanism: "Crowded pre-positioning exhausts the event-day buyer base and creates post-event supply.",
    tradeIntent: "conditional",
    action: "Wait for event sellers to finish before considering a long.",
    direction: "bullish",
    comparator: null,
    register: "desk",
    analogy: true,
  },
  {
    id: "X8",
    engine: "forced_flow_loop",
    visualGrammar: "feedback_loop",
    argumentGrammar: "causal_chain",
    dataKinds: ["qualitative"],
    claim: "Index concentration, leverage liquidation, and foreign outflows can reinforce one another.",
    mechanism: "Mega-cap selling weakens the index, triggers forced sales, and further damages confidence.",
    tradeIntent: "none",
    action: null,
    direction: "neutral",
    comparator: null,
    register: "explainer",
  },
  {
    id: "X9",
    engine: "binary_level",
    visualGrammar: "binary_level",
    argumentGrammar: "price_timeline",
    dataKinds: ["key_numbers"],
    claim: "SK Hynix has two near-term paths around one explicit chart level.",
    mechanism: "A break of the shared focal level can turn chart structure into forced positioning.",
    tradeIntent: "observe_only",
    action: "Watch the explicit level for a hold or a gap-fill cascade.",
    direction: "range",
    comparator: null,
    register: "meme",
  },
  {
    id: "X10",
    engine: "expectation_ladder",
    visualGrammar: "expectation_gap",
    argumentGrammar: "metric_thesis",
    dataKinds: ["key_numbers"],
    claim: "Strong earnings can sell off when expectations require near-perfect upside elasticity.",
    mechanism: "A small miss against elevated consensus can reset the multiple even while absolute growth remains strong.",
    tradeIntent: "none",
    action: null,
    direction: "neutral",
    comparator: null,
    register: "explainer",
    analogy: true,
  },
  {
    id: "X11",
    engine: "derived_signal",
    visualGrammar: "factor_rotation",
    argumentGrammar: "comparison",
    dataKinds: ["key_numbers"],
    claim: "A leverage-volume ratio can favor a cleaner memory proxy over the crowded local leg.",
    mechanism: "High levered-vehicle activity relative to underlying volume signals a fragile holder base.",
    tradeIntent: "explicit",
    action: "Rotate memory exposure toward MU and away from the more crowded Korean leg.",
    direction: "outperform",
    comparator: "SK Hynix",
    register: "research_memo",
  },
];

export const EXPECTED_VIEWPOINT_VISUAL_MAP = new Map([
  ["S1", "reaction_test"],
  ["X1", "parallel_contrast"],
  ["X2_X3", "category_reframe"],
  ["X4", "relative_value_trigger"],
  ["X5", "policy_pivot"],
  ["X6", "sentiment_witness"],
  ["X7", "event_unwind"],
  ["X8", "feedback_loop"],
  ["X9", "binary_level"],
  ["X10", "expectation_gap"],
  ["X11", "factor_rotation"],
]);

const PRIMARY_VISUAL_JOB = new Map([
  ["S1", "trigger_watch"], ["X1", "relative_comparison"], ["X2_X3", "mechanism_path"],
  ["X4", "relative_comparison"], ["X5", "cycle_map"], ["X6", "evidence_proof"],
  ["X7", "trigger_watch"], ["X8", "cycle_map"], ["X9", "scenario_range"],
  ["X10", "evidence_proof"], ["X11", "relative_comparison"],
]);

const PROOF_VISUAL_JOB = new Map([
  ["S1", "trigger_watch"], ["X1", "relative_comparison"], ["X2_X3", "evidence_proof"],
  ["X4", "relative_comparison"], ["X5", "evidence_proof"], ["X6", "evidence_proof"],
  ["X7", "trigger_watch"], ["X8", "evidence_proof"], ["X9", "trigger_watch"],
  ["X10", "evidence_proof"], ["X11", "relative_comparison"],
]);

const SYSTEM_VISUAL_JOB = new Map([
  ["S1", "mechanism_path"], ["X1", "mechanism_path"], ["X2_X3", "mechanism_path"],
  ["X4", "scenario_range"], ["X5", "cycle_map"], ["X6", "mechanism_path"],
  ["X7", "scenario_range"], ["X8", "cycle_map"], ["X9", "scenario_range"],
  ["X10", "mechanism_path"], ["X11", "flow_map"],
]);

const EVIDENCE_SHAPE_BY_DATA_KIND = new Map([
  ["qualitative", "qualitative_relation"],
  ["key_numbers", "point_metric"],
  ["series", "ordered_series"],
]);

const QUERY_ROUTE_BY_REQUEST_CLASS = new Map([
  ["qualitative_evidence", ["market_evidence", ["search_assets", "search_news"]]],
  ["valuation_metric", ["fundamental_metrics", ["search_assets", "list_filings"]]],
  ["market_series", ["market_series", ["search_assets", "get_candles"]]],
]);

const unique = (values) => [...new Set(values)];

export function archetype(caseId) {
  return ARCHETYPES.find((item) => item.id === caseId);
}

export function makePlan(corpusCase) {
  const slug = corpusCase.id.replaceAll("/", "_");
  const semanticsRef = `MVSEM_${slug}_20260714`;
  const sourceRef = `source:reverse-engineering:${slug}`;
  const claimRef = `CLAIM_${slug}`;
  const factRef = `FACT_${slug}`;
  const tradeIntent = corpusCase.tradeIntent;
  const primitives = [{
    id: "P1",
    kind: corpusCase.engine,
    purpose: "Carry the source mechanism without changing its claim, direction, or certainty.",
    semantic_claim_refs: [claimRef],
    analogy: null,
  }];
  if (corpusCase.analogy) {
    primitives.push({
      id: `P${primitives.length + 1}`,
      kind: "analogy",
      purpose: "Use a familiar structure to make the transmission path legible.",
      semantic_claim_refs: [claimRef],
      analogy: {
        source_domain: "familiar event structure",
        target_domain: "current market setup",
        mapping: [{ source_element: "front-run catalyst", target_element: "pre-positioned market event" }],
        breakpoint: "The analogy stops where market access, holder rights, or liquidity structure differs.",
      },
    });
  }
  if (tradeIntent !== "none") {
    primitives.push({
      id: `P${primitives.length + 1}`,
      kind: "decision",
      purpose: "State only the source-owned action and its existing boundary.",
      semantic_claim_refs: [claimRef],
      analogy: null,
    });
  }
  primitives.push({
    id: `P${primitives.length + 1}`,
    kind: "caveat",
    purpose: "Keep the limiting condition visible before the close.",
    semantic_claim_refs: [claimRef],
    analogy: null,
  });

  const authorshipMode = corpusCase.authorshipMode ?? "creator_original";
  const sourceTransformation = authorshipMode === "source_transformation";
  const creatorSeed = sourceTransformation
    ? { text: null, preserved: false, claim_refs: [] }
    : { text: `Creator seed for ${slug}: ${corpusCase.claim}`, preserved: true, claim_refs: [claimRef] };
  const sourceViewOwner = sourceTransformation
    ? { owner_type: "external_creator", owner_ref: "source-author:silverfang88", public_label: "silverfang88" }
    : { owner_type: "current_creator", owner_ref: "creator:current", public_label: "current creator" };

  const fingerprint = {
    source_semantics_sha256: `sha256:${"a".repeat(64)}`,
    canonical_claim: corpusCase.claim,
    claim_type: corpusCase.engine === "sentiment_witness"
      ? "sentiment_evidence"
      : new Set(["parallel_contrast", "relative_value_trigger", "factor_rotation"]).has(corpusCase.visualGrammar)
        ? "relative_view"
        : "explanation",
    primary_subject: slug,
    comparator: corpusCase.comparator,
    direction: corpusCase.direction,
    horizon: tradeIntent !== "none" ? "near term" : null,
    mechanism: corpusCase.mechanism,
    trade_intent: tradeIntent,
    settlement_intent: "none",
    action: corpusCase.action,
    claim_refs: [claimRef],
    supporting_fact_refs: [factRef],
    required_caveats: ["Do not exceed the source's evidence, ownership, or action boundary."],
    creator_owned_experience_refs: [],
    fingerprint_sha256: `sha256:${"0".repeat(64)}`,
  };
  fingerprint.fingerprint_sha256 = calculateFingerprintHash(fingerprint);

  const dataRequirements = corpusCase.dataKinds.map((kind, index) => ({
    id: `D${index + 1}`,
    kind,
    request_class: new Map([
      ["qualitative", "qualitative_evidence"],
      ["key_numbers", "valuation_metric"],
      ["series", "market_series"],
    ]).get(kind),
    purpose: `Supply the ${kind.replaceAll("_", " ")} needed by the primary visual grammar.`,
    required: true,
    material_to_claim: false,
    expression_surfaces: ["visual"],
    status: "available",
    fact_refs: [factRef],
    source_refs: [sourceRef],
  }));

  const plan = {
    schema_version: "creator-expression-plan-v1",
    plan_id: `CEXP_${slug}_EXPRESSION_20260714`,
    revision: 1,
    state: "ready",
    lineage: {
      input_artifact_refs: [semanticsRef],
      market_view_semantics_ref: semanticsRef,
      research_pack_ref: null,
      trading_thesis_ref: null,
      trade_logic_profile_ref: null,
      profile_ref: null,
      source_refs: [sourceRef],
      decision_cutoff_at: "2026-07-14T08:27:00Z",
    },
    meaning_fingerprint: fingerprint,
    semantic_lock: {
      locked: true,
      authorship_locked: true,
      fingerprint_sha256: fingerprint.fingerprint_sha256,
      allowed_transformations: ["compress", "reorder", "translate", "format", "visualize"],
      forbidden_transformations: [
        "change_claim", "change_direction", "change_horizon", "add_trade", "add_settlement",
        "remove_caveat", "upgrade_certainty", "reassign_authorship",
      ],
      downstream_verification_required: true,
    },
    authorship_assistance: {
      mode: authorshipMode,
      creator_seed: creatorSeed,
      source_view_owner: sourceViewOwner,
      cuebook_additions: [],
      creator_accepted_addition_ids: [],
      creator_rejected_addition_ids: [],
      idea_delta: sourceTransformation
        ? "Turn the attributed loss account into a sentiment-only expression without adopting its biography."
        : null,
      public_attribution_required: sourceTransformation,
      public_attribution_line: sourceTransformation
        ? "Source view by silverfang88; independently analyzed and rewritten."
        : null,
    },
    narrative: {
      primary_engine: corpusCase.visualGrammar,
      frame: corpusCase.frame ?? corpusCase.claim,
      primitives,
    },
    voice_spec: {
      language: "en",
      register: corpusCase.register,
      energy: 3,
      conviction: 3,
      technicality: 3,
      emotionality: corpusCase.engine === "parallel_contrast" ? 4 : 2,
      compression: 4,
      sentence_rhythm: "mixed",
      humor: corpusCase.engine === "binary_level" ? "meme" : "none",
      first_person_stance: sourceTransformation ? "avoid" : "allowed",
      first_person_experience: "forbidden",
      technical_terms: "define_once",
      rhetorical_devices: corpusCase.analogy
        ? ["analogy"]
        : new Set(["parallel_contrast", "category_reframe"]).has(corpusCase.engine) ? ["contrast"] : [],
      profile_rule_refs: [],
      anti_ai_language: {
        enabled: true,
        banned_stock_phrases: ["值得关注的是", "核心逻辑在于", "从机制上看"],
        max_not_a_but_b_frames: 1,
        repeated_openings_allowed: false,
      },
    },
    data_requirements: dataRequirements,
    text_blueprint: {
      format: "channel_neutral",
      public_tags: ["market structure", "causal path"],
      max_total_characters: 900,
      data_requirement_refs: [],
      hook: {
        mode: "include", purpose: "Open with the decision-driving tension.", semantic_refs: [claimRef],
        max_characters: 80, omission_reason: null,
      },
      proof: {
        mode: "include", purpose: "Present the source-linked fact on its stated basis.", semantic_refs: [factRef],
        max_characters: 160, omission_reason: null,
      },
      mechanism: {
        mode: "include", purpose: "Connect the fact to the preserved market mechanism.", semantic_refs: [claimRef],
        max_characters: 180, omission_reason: null,
      },
      action: {
        mode: tradeIntent === "none" ? "omit" : "include",
        action_kind: ACTION_BY_TRADE_INTENT.get(tradeIntent),
        purpose: tradeIntent === "none" ? null : "State the bounded source action without expanding it.",
        semantic_refs: tradeIntent === "none" ? [] : [claimRef],
        max_characters: tradeIntent === "none" ? 0 : 100,
        omission_reason: tradeIntent === "none" ? "source_has_no_trade_intent" : null,
      },
      caveat: {
        mode: "include", purpose: "State the source limit before the close.", semantic_refs: [claimRef],
        max_characters: 100, omission_reason: null,
      },
      close: {
        mode: "include", purpose: "Return to the claim without adding a recommendation.", semantic_refs: [claimRef],
        max_characters: 80, omission_reason: null,
      },
    },
    visual_plan: {
      intent: {
        job: PRIMARY_VISUAL_JOB.get(corpusCase.id),
        reader_question: "What is the decision-driving market judgment?",
        primary_message: corpusCase.claim,
        reader_takeaway: "See the mechanism and its limiting condition on one screen.",
        candidate_jobs: [
          {
            family: "fast_read", job: "conviction_snapshot",
            reader_question: "What does the creator believe?", evidence_shapes: ["creator_judgment"], requirement_refs: [],
          },
          {
            family: "proof", job: PROOF_VISUAL_JOB.get(corpusCase.id),
            reader_question: "What is the strongest sourced proof?",
            evidence_shapes: unique(corpusCase.dataKinds.map((kind) => EVIDENCE_SHAPE_BY_DATA_KIND.get(kind))),
            requirement_refs: dataRequirements.map((item) => item.id),
          },
          {
            family: "system", job: SYSTEM_VISUAL_JOB.get(corpusCase.id),
            reader_question: "How does the market mechanism unfold?",
            evidence_shapes: ["qualitative_relation"], requirement_refs: [],
          },
        ],
        target_evidence_shapes: unique([
          "creator_judgment",
          ...corpusCase.dataKinds.map((kind) => EVIDENCE_SHAPE_BY_DATA_KIND.get(kind)),
          "qualitative_relation",
        ]),
      },
      grammar: {
        primary: corpusCase.visualGrammar,
        alternatives: [],
        argument_grammar: corpusCase.argumentGrammar,
        rationale: "The grammar matches the source's decision structure and available data.",
      },
      data_requirement_refs: dataRequirements.map((item) => item.id),
      execution_route: {
        route_registry_ref: "visual-intent-route-registry-v1",
        route_registry_sha256: VISUAL_ROUTE_REGISTRY_SHA256,
        route_id: "viewpoint_static",
        query_requests: dataRequirements.map((item) => {
          const [capabilityId, toolIds] = QUERY_ROUTE_BY_REQUEST_CLASS.get(item.request_class);
          return {
            requirement_ref: item.id,
            capability_id: capabilityId,
            tool_ids: [...toolIds],
            run_policy: "reuse_or_query_gap",
          };
        }),
        skill_path_ids: [
          "query-cuebook", "assemble-cuebook-viewpoint-data", "direct-cuebook-viewpoint-visual",
          "render-cuebook-viewpoint-visual",
        ],
        primary_renderer_skill_id: "render-cuebook-viewpoint-visual",
        detail_renderer_skill_id: null,
        resume_policy: "resume_from_latest_valid_artifact",
        route_sha256: `sha256:${"0".repeat(64)}`,
      },
      fallback: {
        trigger: "none",
        strategy: "none",
        applies_to_requirement_refs: [],
        preserves_fingerprint: true,
        prohibited_substitutions: [
          "invent_metric", "proxy_without_bridge", "anecdote_as_market_fact", "decorative_chart",
        ],
      },
      image_text_budget: {
        unit: "characters",
        title_max: 30,
        subtitle_max: 72,
        node_label_max: 24,
        callout_max: 44,
        source_line_max: 100,
        max_nodes: 6,
        max_callouts: 3,
        total_max: 260,
      },
    },
    settlement_eligibility: {
      status: "ineligible",
      reason_codes: ["source_intent_absent"],
      claim_ref: null,
      requirements: {
        metric: false, operator: false, threshold: false, deadline: false, authoritative_source: false,
      },
      missing_requirements: [],
      downstream_route: null,
    },
    source_style_firewall: {
      source_attribution_required: true,
      factual_claims_require_refs: true,
      fact_interpretation_separated: true,
      anecdote_policy: corpusCase.engine === "sentiment_witness" ? "sentiment_only" : "not_present",
      unverified_anecdote_as_proof: false,
      first_person_experience: { mode: "forbid", allowed_claim_refs: [] },
      living_creator_imitation: false,
      signature_phrasing_reuse: false,
      sentence_sequence_copy: false,
      identity_impersonation: false,
      original_composition_required: true,
      max_verbatim_words: 12,
      public_backend_terms_allowed: false,
    },
    quality_report: { decision: "ready", warnings: [], hard_failures: [] },
  };
  refreshVisualRoute(plan);
  return plan;
}

export function refreshFingerprint(plan) {
  const fingerprint = plan.meaning_fingerprint;
  fingerprint.fingerprint_sha256 = calculateFingerprintHash(fingerprint);
  plan.semantic_lock.fingerprint_sha256 = fingerprint.fingerprint_sha256;
}

export function refreshVisualRoute(plan) {
  plan.visual_plan.execution_route.route_sha256 = calculateVisualRouteHash(plan.visual_plan);
}

export function resultCodes(result) {
  return new Set(result.errors.map((item) => item.code));
}
