import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { validate } from "../scripts/validate_market_view_semantics.mjs";

const BENCHMARK_SOURCE = "benchmark://cuebook/market-commentator-archetypes-v1";
const BENCHMARK_IDS = ["S1", "X1", "X2_X3", "X4", "X5", "X6", "X7", "X8", "X9", "X10", "X11"];
const EXPECTED_MOVES = {
  S1: "bad_news_absorption",
  X1: "parallel_realities",
  X2_X3: "category_reframing",
  X4: "headline_vs_price",
  X5: "policy_pivot",
  X6: "capitulation_testimony",
  X7: "event_crowding_unwind",
  X8: "feedback_loop_explainer",
  X9: "technical_meme_warning",
  X10: "expectation_reset",
  X11: "proprietary_factor_rotation",
};

function subject(caseId, name, label, subjectType) {
  return {
    subject_id: `subject:${caseId}:${name}`,
    label,
    type: subjectType,
    canonical_id: null,
    venue: null,
    source_unit_refs: [`source:${caseId}`],
  };
}

function noPosture() {
  return { explicitness: "none", past: null, now: null, on_condition: null };
}

function noHorizon() {
  return {
    kind: "unspecified",
    precision: "none",
    raw_text: null,
    start_at: null,
    end_at: null,
    duration: null,
    event_subject_ref: null,
  };
}

function eventHorizon(rawText, eventSubjectRef) {
  return {
    kind: "event_bound",
    precision: "qualitative",
    raw_text: rawText,
    start_at: null,
    end_at: null,
    duration: null,
    event_subject_ref: eventSubjectRef,
  };
}

function structuralHorizon(rawText) {
  return {
    kind: "structural",
    precision: "qualitative",
    raw_text: rawText,
    start_at: null,
    end_at: null,
    duration: null,
    event_subject_ref: null,
  };
}

function phase(action, claimRefs, { triggerRefs = null, tradeLegs = null, conditionText = null } = {}) {
  return {
    action,
    claim_refs: claimRefs,
    trigger_subject_refs: triggerRefs || [],
    trade_legs: tradeLegs || [],
    condition_text: conditionText,
  };
}

function tradeLeg(subjectRef, role, direction) {
  return { subject_ref: subjectRef, role, direction };
}

function noResolution() {
  return { explicitness: "none", criterion: null, deadline: null };
}

function causalLink(caseId, number, sourceRef, targetRef, relation, claimRef, loopId = null) {
  return {
    link_id: `link:${caseId}:${number}`,
    from_subject_ref: sourceRef,
    to_subject_ref: targetRef,
    relation,
    claim_refs: [claimRef],
    certainty: "likely",
    loop_id: loopId,
  };
}

function makeArtifact(
  caseId,
  author,
  primitive,
  claimText,
  speechAct,
  rhetoricalMove,
  subjects,
  {
    evidenceBasis = "reported_source",
    evidenceBreadth = "instrument",
    certainty = "likely",
    completeness = "complete",
  } = {},
) {
  const sourceId = `source:${caseId}`;
  const sourceSpeakerId = `speaker:source:${caseId}`;
  const creatorId = "speaker:current_creator";
  const claimId = `claim:${caseId}:primary`;
  const incomplete = completeness !== "complete";
  return {
    schema_version: "market-view-semantics-v1",
    semantics_id: `MVSEM_BENCH_${caseId}_20260714`,
    revision: 1,
    state: incomplete ? "conditional" : "ready",
    lineage: {
      input_artifact_refs: [`benchmark:${caseId}`],
      source_document_refs: [BENCHMARK_SOURCE],
      compiled_at: "2026-07-14T12:00:00+08:00",
    },
    speakers: [
      {
        speaker_id: sourceSpeakerId,
        label: author,
        role: "source_author",
        source_unit_refs: [sourceId],
      },
      {
        speaker_id: creatorId,
        label: "Current Cuebook creator",
        role: "current_creator",
        source_unit_refs: [],
      },
    ],
    current_creator_ref: creatorId,
    source_units: [
      {
        source_unit_id: sourceId,
        locator: `${BENCHMARK_SOURCE}#${caseId}`,
        role: "primary_view",
        primitive,
        speaker_ref: sourceSpeakerId,
        completeness,
        claim_refs: [claimId],
        notes: "Benchmark corpus-card paraphrase.",
      },
    ],
    source_completeness: {
      overall: incomplete ? "incomplete" : "complete",
      missing_context: incomplete ? ["Source text is truncated."] : [],
    },
    subjects,
    claims: [
      {
        claim_id: claimId,
        role: "primary",
        text: claimText,
        source_unit_refs: [sourceId],
        subject_refs: subjects.map((item) => item.subject_id),
        speech_act: speechAct,
        rhetorical_move: rhetoricalMove,
        ownership: {
          mode: "source_only",
          origin_speaker_ref: sourceSpeakerId,
          creator_adoption: "reported",
          surface_voice: "source_third_person",
        },
        certainty,
        evidence_scope: {
          basis: evidenceBasis,
          breadth: evidenceBreadth,
          subject_refs: subjects.map((item) => item.subject_id),
          limitations: [],
        },
      },
    ],
    primary_claim_ref: claimId,
    causal_links: [],
    feedback_loops: [],
    posture: noPosture(),
    horizon: noHorizon(),
    proprietary_signal: null,
    resolution: noResolution(),
    quality_report: {
      decision: incomplete ? "conditional" : "ready",
      warnings: incomplete ? ["Source unit is truncated; preserve the incomplete boundary."] : [],
      hard_failures: [],
    },
  };
}

function benchmarkArtifacts() {
  const artifacts = {};

  const s1Subjects = [
    subject("S1", "btc", "Bitcoin", "crypto_asset"),
    subject("S1", "etf_outflows", "Bitcoin ETF outflows", "flow"),
    subject("S1", "strategy_sales", "Strategy treasury sales", "flow"),
    subject("S1", "seller_exhaustion", "Marginal seller exhaustion", "market_state"),
  ];
  const s1 = makeArtifact(
    "S1",
    "Salsatekila",
    "flow_positioning",
    "The source treats a price rise after record selling and bad news as evidence that forced sellers were absorbed and dip buying is attractive.",
    "trade_recommendation",
    "bad_news_absorption",
    s1Subjects,
    { evidenceBasis: "multi_source_synthesis" },
  );
  const s1Claim = s1.primary_claim_ref;
  s1.posture = {
    explicitness: "implicit",
    past: null,
    now: phase("buy_dips", [s1Claim], { tradeLegs: [tradeLeg("subject:S1:btc", "primary", "buy")] }),
    on_condition: null,
  };
  artifacts.S1 = s1;

  const x1Subjects = [
    subject("X1", "stock_trader", "Levered Korean stock trader", "person"),
    subject("X1", "crypto_holder", "ETH holder", "person"),
    subject("X1", "korean_leverage", "Korean equity leverage", "flow"),
    subject("X1", "eth", "Ether", "crypto_asset"),
  ];
  const x1 = makeArtifact(
    "X1",
    "0xVeryBigOrange",
    "social_sentiment",
    "The source contrasts one levered stock trader's wipeout with one ETH holder's gains as two anecdotal market realities.",
    "market_observation",
    "parallel_realities",
    x1Subjects,
    { evidenceBasis: "reported_source", evidenceBreadth: "cohort", certainty: "possible" },
  );
  x1.claims[0].evidence_scope.limitations = ["Anecdotal contrast; not market-wide evidence."];
  artifacts.X1 = x1;

  const x2Subjects = [
    subject("X2_X3", "robinhood_chain", "Robinhood Chain", "technology"),
    subject("X2_X3", "tokenized_securities", "Tokenized stocks and ETFs", "concept"),
    subject("X2_X3", "hood", "Robinhood Markets equity", "equity"),
  ];
  const x2 = makeArtifact(
    "X2_X3",
    "0xVeryBigOrange",
    "structural_thesis",
    "The source reframes Robinhood Chain from another L2 into onchain securities-market infrastructure with HOOD as the value-capture leg.",
    "category_reframe",
    "category_reframing",
    x2Subjects,
    { evidenceBasis: "reported_source", evidenceBreadth: "structural" },
  );
  const sourceId = "source:X2_X3";
  const supportId = "claim:X2_X3:hood";
  x2.claims.push({
    claim_id: supportId,
    role: "supporting",
    text: "The source expresses a bullish HOOD trade intent as the equity value-capture leg.",
    source_unit_refs: [sourceId],
    subject_refs: ["subject:X2_X3:hood"],
    speech_act: "trade_intent",
    rhetorical_move: "category_reframing",
    ownership: structuredClone(x2.claims[0].ownership),
    certainty: "likely",
    evidence_scope: {
      basis: "reported_source",
      breadth: "instrument",
      subject_refs: ["subject:X2_X3:hood"],
      limitations: ["Regulatory and token-holder-rights caveats remain unresolved."],
    },
  });
  x2.source_units[0].claim_refs.push(supportId);
  x2.posture = {
    explicitness: "implicit",
    past: null,
    now: phase("long", [supportId], { tradeLegs: [tradeLeg("subject:X2_X3:hood", "primary", "long")] }),
    on_condition: null,
  };
  x2.horizon = structuralHorizon("Onchain securities infrastructure adoption");
  artifacts.X2_X3 = x2;

  const x4Subjects = [
    subject("X4", "brent", "Brent crude", "commodity"),
    subject("X4", "wti", "WTI crude", "commodity"),
    subject("X4", "spread", "Brent/WTI spread", "metric"),
    subject("X4", "hormuz", "Hormuz escalation", "event"),
  ];
  const x4 = makeArtifact(
    "X4",
    "Phyrex",
    "market_data",
    "The source reads the modest oil open as muted war pricing and would short Brent if the Brent/WTI spread widens to the stated threshold.",
    "conditional_trade",
    "headline_vs_price",
    x4Subjects,
    { evidenceBasis: "market_data", evidenceBreadth: "cross_asset" },
  );
  const x4Claim = x4.primary_claim_ref;
  x4.posture = {
    explicitness: "explicit",
    past: null,
    now: null,
    on_condition: phase("short", [x4Claim], {
      triggerRefs: ["subject:X4:spread"],
      tradeLegs: [tradeLeg("subject:X4:brent", "primary", "short")],
      conditionText: "If the Brent/WTI spread reaches the source's threshold.",
    }),
  };
  x4.horizon = eventHorizon("If the spread widens enough", "subject:X4:spread");
  x4.resolution = {
    explicitness: "partial",
    criterion: {
      text: "Brent/WTI spread reaches the stated threshold.",
      status: "explicit",
      claim_refs: [x4Claim],
    },
    deadline: null,
  };
  artifacts.X4 = x4;

  const x5Subjects = [
    subject("X5", "kospi", "Korean equities", "index"),
    subject("X5", "memory", "Memory semiconductor sector", "sector"),
    subject("X5", "leveraged_etfs", "Leveraged ETF liquidation", "flow"),
    subject("X5", "policy_tightening", "Korean leverage-ETF tightening", "policy"),
  ];
  const x5 = makeArtifact(
    "X5",
    "Leto Bao",
    "flow_positioning",
    "The source expects Korean and memory-sector weakness to persist until policy tightens leveraged ETFs and purges excess leverage.",
    "forecast",
    "policy_pivot",
    x5Subjects,
    { evidenceBasis: "inference", evidenceBreadth: "sector" },
  );
  x5.horizon = eventHorizon("Until Korean policy tightens leveraged ETFs", "subject:X5:policy_tightening");
  x5.causal_links = [
    causalLink("X5", 1, "subject:X5:leveraged_etfs", "subject:X5:memory", "amplifies", x5.primary_claim_ref),
  ];
  artifacts.X5 = x5;

  const x6Subjects = [
    subject("X6", "trader", "Liquidated retail trader", "person"),
    subject("X6", "liquidation", "Personal liquidation", "event"),
    subject("X6", "korean_semis", "Korean semiconductor trade", "sector"),
  ];
  const x6 = makeArtifact(
    "X6",
    "silverfang88",
    "social_sentiment",
    "The source is a personal loss confession and is preserved as an individual capitulation witness, not a market model.",
    "sentiment_witness",
    "capitulation_testimony",
    x6Subjects,
    { evidenceBasis: "firsthand_witness", evidenceBreadth: "individual", certainty: "certain" },
  );
  x6.claims[0].evidence_scope.limitations = ["One trader cannot establish market breadth."];
  artifacts.X6 = x6;

  const x7Subjects = [
    subject("X7", "hynix", "SK Hynix", "equity"),
    subject("X7", "adr_event", "US listing or ADR access event", "event"),
    subject("X7", "pre_event_crowding", "Pre-event crowding", "flow"),
    subject("X7", "event_sellers_exit", "Event-trade seller exhaustion", "event"),
  ];
  const x7 = makeArtifact(
    "X7",
    "Michael Liu",
    "official_event",
    "The source explains the post-access selloff as a crowded event trade that was bought before the catalyst and unwound when it arrived.",
    "causal_explanation",
    "event_crowding_unwind",
    x7Subjects,
    { evidenceBasis: "reported_source", evidenceBreadth: "instrument" },
  );
  x7.horizon = eventHorizon("After event-trade holders finish exiting", "subject:X7:event_sellers_exit");
  x7.causal_links = [
    causalLink("X7", 1, "subject:X7:pre_event_crowding", "subject:X7:event_sellers_exit", "precedes", x7.primary_claim_ref),
  ];
  artifacts.X7 = x7;

  const x8Subjects = [
    subject("X8", "price_decline", "KOSPI and mega-cap price decline", "market_state"),
    subject("X8", "margin_calls", "Margin calls", "flow"),
    subject("X8", "forced_selling", "Forced selling", "flow"),
    subject("X8", "foreign_outflows", "Foreign investor outflows", "flow"),
  ];
  const x8 = makeArtifact(
    "X8",
    "pipizhu_eth",
    "flow_positioning",
    "The source declares a reinforcing spiral in which price declines trigger margin calls, forced selling deepens the decline, and foreign outflows add pressure.",
    "causal_explanation",
    "feedback_loop_explainer",
    x8Subjects,
    { evidenceBasis: "multi_source_synthesis", evidenceBreadth: "sector" },
  );
  const x8Claim = x8.primary_claim_ref;
  const loopId = "loop:X8:leverage_spiral";
  x8.causal_links = [
    causalLink("X8", 1, "subject:X8:price_decline", "subject:X8:margin_calls", "triggers", x8Claim, loopId),
    causalLink("X8", 2, "subject:X8:margin_calls", "subject:X8:forced_selling", "causes", x8Claim, loopId),
    causalLink("X8", 3, "subject:X8:forced_selling", "subject:X8:price_decline", "amplifies", x8Claim, loopId),
    causalLink("X8", 4, "subject:X8:foreign_outflows", "subject:X8:price_decline", "amplifies", x8Claim),
  ];
  x8.feedback_loops = [
    {
      loop_id: loopId,
      label: "Price-leverage forced-selling spiral",
      polarity: "reinforcing",
      declaration: "explicit",
      link_refs: ["link:X8:1", "link:X8:2", "link:X8:3"],
      claim_refs: [x8Claim],
    },
  ];
  artifacts.X8 = x8;

  const x9Subjects = [
    subject("X9", "hynix", "SK Hynix", "equity"),
    subject("X9", "key_level", "Watched technical level", "metric"),
    subject("X9", "gap_fill", "Gap-fill risk", "market_state"),
    subject("X9", "levered_traders", "Levered Korean traders", "cohort"),
  ];
  const x9 = makeArtifact(
    "X9",
    "Citrini",
    "technical_structure",
    "The source uses a technical-analysis joke to warn that failure at a watched level could turn gap-fill risk into a liquidation event.",
    "risk_warning",
    "technical_meme_warning",
    x9Subjects,
    { evidenceBasis: "market_data", evidenceBreadth: "instrument", certainty: "possible" },
  );
  x9.horizon = eventHorizon("If the watched level fails", "subject:X9:key_level");
  x9.resolution = {
    explicitness: "partial",
    criterion: {
      text: "SK Hynix holds or loses the watched technical level.",
      status: "explicit",
      claim_refs: [x9.primary_claim_ref],
    },
    deadline: null,
  };
  artifacts.X9 = x9;

  const x10Subjects = [
    subject("X10", "hynix", "SK Hynix", "equity"),
    subject("X10", "estimate_cut", "KIS expectation cut", "event"),
    subject("X10", "expectation_gap", "Consensus expectation gap", "metric"),
    subject("X10", "hbm_contracts", "HBM locked-price contracts", "concept"),
    subject("X10", "repricing", "Profit-elasticity repricing", "market_state"),
  ];
  const x10 = makeArtifact(
    "X10",
    "Wang Buai",
    "sell_side_expectation",
    "The source argues that strong results still triggered a repricing because perfection was embedded and HBM contracts capped upside elasticity.",
    "valuation_judgment",
    "expectation_reset",
    x10Subjects,
    { evidenceBasis: "multi_source_synthesis", evidenceBreadth: "instrument" },
  );
  x10.horizon = structuralHorizon("Long-term HBM contract and margin structure");
  x10.causal_links = [
    causalLink("X10", 1, "subject:X10:estimate_cut", "subject:X10:repricing", "triggers", x10.primary_claim_ref),
    causalLink("X10", 2, "subject:X10:hbm_contracts", "subject:X10:repricing", "causes", x10.primary_claim_ref),
  ];
  artifacts.X10 = x10;

  const x11Subjects = [
    subject("X11", "hynix", "SK Hynix", "equity"),
    subject("X11", "mu", "Micron", "equity"),
    subject("X11", "memory_leverage_ratio", "Memory leverage ratio", "signal"),
    subject("X11", "leveraged_etf_volume", "Leveraged ETF trading volume", "metric"),
    subject("X11", "underlying_volume", "Underlying equity trading volume", "metric"),
    subject("X11", "korea_local", "Korea-local market segment", "venue"),
  ];
  const x11 = makeArtifact(
    "X11",
    "Leto Bao",
    "proprietary_factor",
    "The source reports rotating from SK Hynix to Micron because a proprietary leverage-volume ratio showed a more fragile Korean holder base.",
    "trade_report",
    "proprietary_factor_rotation",
    x11Subjects,
    { evidenceBasis: "proprietary_model", evidenceBreadth: "cross_asset", completeness: "truncated" },
  );
  const x11Claim = x11.primary_claim_ref;
  x11.posture = {
    explicitness: "explicit",
    past: phase("rotate", [x11Claim], {
      tradeLegs: [
        tradeLeg("subject:X11:hynix", "from_leg", "sell"),
        tradeLeg("subject:X11:mu", "to_leg", "buy"),
      ],
    }),
    now: null,
    on_condition: null,
  };
  x11.proprietary_signal = {
    signal_subject_ref: "subject:X11:memory_leverage_ratio",
    name: "Memory leverage ratio",
    replicability: "partial",
    formula: {
      operator: "ratio",
      expression: "leveraged_etf_volume / underlying_equity_volume",
      output_unit: "ratio",
      inputs: [
        {
          input_id: "input:X11:numerator",
          subject_ref: "subject:X11:leveraged_etf_volume",
          role: "numerator",
          unit: "shares traded",
          transformation: null,
        },
        {
          input_id: "input:X11:denominator",
          subject_ref: "subject:X11:underlying_volume",
          role: "denominator",
          unit: "shares traded",
          transformation: null,
        },
      ],
    },
    segmentation: ["Korea-local", "global or ADR"],
    source_unit_refs: ["source:X11"],
    claim_refs: [x11Claim],
  };
  artifacts.X11 = x11;

  return artifacts;
}

function errorCodes(result) {
  return new Set(result.errors.map((item) => item.code));
}

test("schema is strict and named", () => {
  const schema = JSON.parse(
    readFileSync(new URL("../references/market-view-semantics-v1.schema.json", import.meta.url), "utf-8"),
  );
  assert.equal(schema.title, "MarketViewSemanticsV1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema_version.const, "market-view-semantics-v1");
});

test("all eleven benchmark archetypes validate", async (t) => {
  const artifacts = benchmarkArtifacts();
  assert.deepEqual(Object.keys(artifacts), BENCHMARK_IDS);
  assert.equal(Object.keys(artifacts).length, 11);
  for (const [caseId, payload] of Object.entries(artifacts)) {
    await t.test(`case_id=${caseId}`, () => {
      const result = validate(payload);
      assert.ok(result.valid, JSON.stringify(result.errors));
      const primary = payload.claims.find((claim) => claim.claim_id === payload.primary_claim_ref);
      assert.equal(primary.rhetorical_move, EXPECTED_MOVES[caseId]);
    });
  }
});

test("source_only cannot use current creator first person", () => {
  const payload = structuredClone(benchmarkArtifacts().S1);
  payload.claims[0].ownership.surface_voice = "current_creator_first_person";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("SOURCE_ONLY_CREATOR_VOICE"));
});

test("non trade speech act allows none posture", () => {
  const payload = benchmarkArtifacts().X6;
  assert.equal(payload.posture.explicitness, "none");
  const result = validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("trade speech act requires posture", () => {
  const payload = structuredClone(benchmarkArtifacts().S1);
  payload.posture = noPosture();
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("TRADE_POSTURE_REQUIRED"));
});

test("sentiment witness cannot imply market breadth", () => {
  const payload = structuredClone(benchmarkArtifacts().X6);
  payload.claims[0].evidence_scope.breadth = "market_wide";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("SENTIMENT_BREADTH"));
});

test("cycle requires loop id", () => {
  const payload = structuredClone(benchmarkArtifacts().X8);
  payload.causal_links[1].loop_id = null;
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("CYCLE_LOOP_ID"));
});

test("declared loop must actually cycle", () => {
  const payload = structuredClone(benchmarkArtifacts().X8);
  payload.causal_links[2].to_subject_ref = "subject:X8:foreign_outflows";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("LOOP_NOT_CYCLIC"));
});

test("explicit settlement requires criterion and deadline", () => {
  const payload = structuredClone(benchmarkArtifacts().X4);
  payload.resolution.explicitness = "explicit";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("EXPLICIT_SETTLEMENT"));
});

test("explicit settlement accepts both explicit fields", () => {
  const payload = structuredClone(benchmarkArtifacts().X4);
  payload.resolution = {
    explicitness: "explicit",
    criterion: {
      text: "Brent official close is below the stated level.",
      status: "explicit",
      claim_refs: [payload.primary_claim_ref],
    },
    deadline: {
      raw_text: "At the 2026-07-17 close",
      normalized_at: "2026-07-17T16:00:00+01:00",
      status: "explicit",
      claim_refs: [payload.primary_claim_ref],
    },
  };
  const result = validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("trigger subject is not silently a trade leg", () => {
  const conditional = benchmarkArtifacts().X4.posture.on_condition;
  assert.deepEqual(conditional.trigger_subject_refs, ["subject:X4:spread"]);
  assert.deepEqual(conditional.trade_legs.map((leg) => leg.subject_ref), ["subject:X4:brent"]);
});

test("on_condition requires trigger subject", () => {
  const payload = structuredClone(benchmarkArtifacts().X4);
  payload.posture.on_condition.trigger_subject_refs = [];
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("CONDITION_TRIGGER"));
});

test("ratio formula requires numerator and denominator", () => {
  const payload = structuredClone(benchmarkArtifacts().X11);
  payload.proprietary_signal.formula.inputs[1].role = "term";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("RATIO_INPUTS"));
});

test("truncated source stays incomplete", () => {
  const payload = benchmarkArtifacts().X11;
  assert.equal(payload.source_units[0].completeness, "truncated");
  assert.equal(payload.source_completeness.overall, "incomplete");
  const result = validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.ok(new Set(result.warnings.map((item) => item.code)).has("SOURCE_INCOMPLETE"));
});

test("completeness aggregate cannot be upgraded", () => {
  const payload = structuredClone(benchmarkArtifacts().X11);
  payload.source_completeness.overall = "complete";
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("COMPLETENESS_AGGREGATE"));
});

test("event bound horizon requires event subject", () => {
  const payload = structuredClone(benchmarkArtifacts().X5);
  payload.horizon.event_subject_ref = null;
  const result = validate(payload);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("HORIZON_EVENT"));
});
