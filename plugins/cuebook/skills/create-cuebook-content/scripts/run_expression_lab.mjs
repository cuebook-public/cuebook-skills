#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runFastPreviewJob } from "./run_fast_preview.mjs";
import { CANONICAL_FORMULA } from "./run_lens_preview.mjs";

const AS_OF = "2026-07-18T23:59:00Z";
const CREATED_AT = "2026-07-19T09:00:00Z";
const OBSERVATION_START = "2026-06-20T00:00:00Z";
const DECLARED_AT = "2026-07-19T09:00:00Z";
const HORIZON_END = "2026-08-18T09:00:00Z";

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function bars(ticker, closes) {
  return closes.map((close, index) => {
    const prior = index === 0 ? close * 0.997 : closes[index - 1];
    const open = prior + (close - prior) * 0.36;
    const high = Math.max(open, close) * 1.008;
    const low = Math.min(open, close) * 0.992;
    return {
      openTime: new Date(Date.UTC(2026, 5, 20 + index)).toISOString(),
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume: String(1_000_000 + index * 28_700 + (index % 5) * 91_000),
    };
  });
}

function marketLeg({ ticker, displayName = ticker, assetClass = "equity", ref, closes, assetId }) {
  return {
    ticker,
    display_name: displayName,
    asset_id: assetId,
    asset_class: assetClass,
    result_ref: ref,
    market_state: { price: closes.at(-1).toFixed(4), observedAt: AS_OF },
    candles: {
      data: { ticker, interval: "1d", bars: bars(ticker, closes), nextCursor: null },
      meta: { asOf: AS_OF, truncated: false },
    },
  };
}

function binding(caseId, role) {
  return `BIND_LAB_${caseId.toUpperCase()}_${role.toUpperCase()}`;
}

function candidateId(caseId) {
  return `FPREV_CAND_LAB_${caseId.toUpperCase()}_001`;
}

function meaningLock({ caseId, title, body, subject, direction, claim, mechanism, nextWatch, mode }) {
  const settleable = mode === "market" && ["long", "short"].includes(direction);
  const requiredBeats = mode === "lens"
    ? ["tested_observation", "mechanism", "future_check", "component_anatomy"]
    : mode === "market"
      ? ["price_context", "tested_observation", "mechanism", "future_check", ...(settleable ? ["settlement_clock"] : [])]
      : ["argument_structure", "mechanism", "future_check"];
  return {
    lock_id: `MLOCK_LAB_${caseId.toUpperCase()}_001`,
    status: "creator_confirmed",
    confirmed_at: "2026-07-19T08:59:00Z",
    title,
    body,
    subject,
    direction,
    horizon: "next 30 days",
    claim,
    mechanism,
    next_watch: nextWatch,
    settlement: settleable ? {
      mode: "standard_direction",
      family: "single_asset_direction",
      asset_ref: `asset:${subject.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
      direction,
      requested_settle_at: HORIZON_END,
      session_policy: "at_instant",
      threshold_bps: "0",
      success_condition: direction === "long" ? "above_publication_baseline" : "below_publication_baseline",
    } : {
      mode: mode === "lens" ? "non_settleable" : "not_applicable",
      reason: mode === "lens"
        ? "A creator-owned Lens is not one canonical single-asset contract."
        : "This expression is exploratory or relative rather than a single-asset direction contract.",
    },
    visual_intent: {
      summary: "Retain the decision-useful evidence, creator logic, and dated future check in one mobile image.",
      required_beats: requiredBeats,
    },
  };
}

function marketCase({
  caseId,
  prompt,
  persona,
  title,
  body,
  subject,
  direction,
  claim,
  mechanism,
  nextWatch,
  observation,
  implication,
  countercase,
  readerJob,
  relationship,
  grammar,
  composition,
  surface,
  mainTransform,
  supportTransform = "none",
  chartStyle = "line",
  primary,
  benchmark = null,
  observationKind,
  observationThreshold = 0,
  annotations = [],
  futureBeats = null,
}) {
  const primaryRef = primary.ref;
  const resultRefs = benchmark ? [primaryRef, benchmark.ref] : [primaryRef];
  const mainBindingIds = (() => {
    if (["indexed_return", "drawdown"].includes(mainTransform) && benchmark) {
      return [binding(caseId, "main_primary"), binding(caseId, "main_benchmark")];
    }
    return [binding(caseId, "main")];
  })();
  const supportBindingIds = (() => {
    if (supportTransform === "none") return [];
    if (["indexed_return", "drawdown"].includes(supportTransform) && benchmark) {
      return [binding(caseId, "support_primary"), binding(caseId, "support_benchmark")];
    }
    return [binding(caseId, "support")];
  })();
  const observationBinding = binding(caseId, "observation");
  const geometryBindings = [
    ...mainBindingIds,
    ...supportBindingIds,
    ...annotations.map((item) => item.binding_id),
  ];
  const defaultFuture = [
    {
      role: "checkpoint",
      label: "First check whether the relationship persists",
      criterion: "The 5D relationship keeps the same direction",
      at: "2026-08-02T09:00:00Z",
      state: "conditional",
      binding_id: binding(caseId, "checkpoint"),
      source_refs: [],
    },
    {
      role: "confirmation",
      label: "Then determine whether a new regime is forming",
      criterion: "The 20D structure confirms the regime",
      at: HORIZON_END,
      state: "conditional",
      binding_id: binding(caseId, "confirmation"),
      source_refs: [],
    },
  ];
  return {
    meta: { case_id: caseId, prompt, persona, expected_capability: "market_expression" },
    job: {
      schema_version: "frame-market-preview-job",
      preview: {
        preview_id: `FPREV_LAB_${caseId.toUpperCase()}_001`,
        state: "conditional",
        created_at: CREATED_AT,
        creator_view: {
          original_text: prompt,
          subject,
          direction,
          observation_window: "2026-06-20 to 2026-07-19",
          horizon: "next 30 days",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
        meaning_lock: meaningLock({ caseId, title, body, subject, direction, claim, mechanism, nextWatch, mode: "market" }),
        query_binding: {
          required: true,
          status: "executed",
          bundle_refs: [`QRY_LAB_${caseId.toUpperCase()}`],
          result_refs: resultRefs,
          as_of: AS_OF,
          warnings: ["synthetic evaluation fixture"],
          unavailable_capabilities: [],
        },
        candidates: [{
          candidate_id: candidateId(caseId),
          angle: readerJob === "mechanism" ? "mechanism" : readerJob === "proof" ? "evidence" : "conviction",
          frame: { title, body },
          evidence_refs: resultRefs,
        }],
      },
      expressions: [{
        candidate_id: candidateId(caseId),
        creator_signal: {
          origin: "direct_prompt",
          interview_text: null,
          adoption_state: "not_needed",
        },
        text_image_division: {
          title_job: "memorable_judgment",
          body_job: "evidence_and_mechanism",
          image_job: benchmark ? "comparison_and_time" : "evidence_and_time",
        },
        reader_job: readerJob,
        analytic_relationship: relationship,
        grammar,
        composition,
        surface,
        subject_label: subject,
        horizon_label: "30D VIEW",
        data_status: "synthetic_fixture",
        data_as_of: AS_OF,
        source_label: "synthetic evaluation series",
        argument: {
          claim: {
            text: claim,
            state: "creator_view",
            binding_id: binding(caseId, "claim"),
            source_refs: [],
          },
          observation: {
            text: observation,
            state: "derived",
            binding_id: observationBinding,
            source_refs: resultRefs,
          },
          mechanism: {
            text: mechanism,
            state: "creator_view",
            binding_id: binding(caseId, "mechanism"),
            source_refs: [],
          },
          implication: {
            text: implication,
            state: "conditional",
            binding_id: binding(caseId, "implication"),
            source_refs: [],
          },
          countercase: countercase ? {
            text: countercase,
            state: "conditional",
            binding_id: binding(caseId, "countercase"),
            source_refs: [],
          } : null,
        },
        observation_test: {
          kind: observationKind,
          statement: observation,
          threshold: observationThreshold,
          supports_binding_ids: [observationBinding, ...geometryBindings],
          source_refs: resultRefs,
        },
        time: {
          observation_start: OBSERVATION_START,
          declared_at: DECLARED_AT,
          horizon_end: HORIZON_END,
          future_mode: "conditional_lanes",
          timezone: "UTC",
        },
        market: {
          main_transform: mainTransform,
          support_transform: supportTransform,
          main_binding_ids: mainBindingIds,
          support_binding_ids: supportBindingIds,
          chart_style: chartStyle,
          rolling_window: 5,
          show_volume: false,
          primary: marketLeg(primary),
          benchmark: benchmark ? marketLeg(benchmark) : null,
        },
        annotations,
        future_beats: futureBeats ?? defaultFuture,
      }],
    },
  };
}

function creatorOnlyCase({
  caseId,
  prompt,
  persona,
  title,
  body,
  subject,
  direction = "watch",
  claim,
  observation,
  mechanism,
  implication,
  countercase,
  nextWatch,
  grammar,
  composition,
  surface,
  readerJob,
  relationship,
  futureBeats,
}) {
  return {
    meta: { case_id: caseId, prompt, persona, expected_capability: "market_expression" },
    job: {
      schema_version: "frame-market-preview-job",
      preview: {
        preview_id: `FPREV_LAB_${caseId.toUpperCase()}_001`,
        state: "conditional",
        created_at: CREATED_AT,
        creator_view: {
          original_text: prompt,
          subject,
          direction,
          observation_window: "creator's current observation",
          horizon: "next 30 days",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
        meaning_lock: meaningLock({ caseId, title, body, subject, direction, claim, mechanism, nextWatch, mode: "creator_only" }),
        query_binding: {
          required: false,
          status: "not_required",
          bundle_refs: [],
          result_refs: [],
          as_of: null,
          warnings: [],
          unavailable_capabilities: [],
        },
        candidates: [{
          candidate_id: candidateId(caseId),
          angle: readerJob === "mechanism" ? "mechanism" : "conviction",
          frame: { title, body },
          evidence_refs: [],
        }],
      },
      expressions: [{
        candidate_id: candidateId(caseId),
        creator_signal: {
          origin: "direct_prompt",
          interview_text: null,
          adoption_state: "not_needed",
        },
        text_image_division: {
          title_job: "memorable_judgment",
          body_job: grammar === "scenario_lanes" ? "scenario_and_watch" : "mechanism_and_horizon",
          image_job: grammar === "scenario_lanes" ? "scenario_and_time" : "mechanism_and_time",
        },
        reader_job: readerJob,
        analytic_relationship: relationship,
        grammar,
        composition,
        surface,
        subject_label: subject,
        horizon_label: "30D VIEW",
        data_status: "creator_only",
        data_as_of: null,
        source_label: "creator inference",
        argument: {
          claim: { text: claim, state: "creator_view", binding_id: binding(caseId, "claim"), source_refs: [] },
          observation: { text: observation, state: "creator_view", binding_id: binding(caseId, "observation"), source_refs: [] },
          mechanism: { text: mechanism, state: "creator_view", binding_id: binding(caseId, "mechanism"), source_refs: [] },
          implication: { text: implication, state: "conditional", binding_id: binding(caseId, "implication"), source_refs: [] },
          countercase: countercase ? { text: countercase, state: "conditional", binding_id: binding(caseId, "countercase"), source_refs: [] } : null,
        },
        observation_test: null,
        time: {
          observation_start: OBSERVATION_START,
          declared_at: DECLARED_AT,
          horizon_end: HORIZON_END,
          future_mode: "conditional_lanes",
          timezone: "UTC",
        },
        market: null,
        annotations: [],
        future_beats: futureBeats,
      }],
    },
  };
}

function lensCase({
  caseId,
  prompt,
  persona,
  title,
  body,
  subject,
  direction,
  claim,
  observation,
  mechanism,
  implication,
  countercase,
  nextWatch,
  grammar,
  composition,
  surface,
  lensName,
  components,
  observationKind,
  futureBeats,
  limitations,
}) {
  const refs = components.map((component) => component.ref);
  const lensComponents = components.map((component, index) => ({
    leg: {
      ticker: component.ticker,
      display_name: component.displayName ?? component.ticker,
      asset_id: component.assetId,
      asset_class: component.assetClass ?? "equity",
      result_ref: component.ref,
      candles: {
        data: { ticker: component.ticker, interval: "1d", bars: bars(component.ticker, component.closes), nextCursor: null },
        meta: { asOf: AS_OF, truncated: false },
      },
    },
    weight: component.weight,
    side: component.side,
    inclusion_reason: component.reason,
    origin: component.origin ?? (index % 2 ? "cuebook_discovered" : "creator_named"),
    binding_id: binding(caseId, `component_${component.ticker}`),
  }));
  return {
    meta: { case_id: caseId, prompt, persona, expected_capability: "creator_lens" },
    job: {
      schema_version: "frame-lens-preview-job",
      preview: {
        preview_id: `FPREV_LAB_${caseId.toUpperCase()}_001`,
        state: "conditional",
        created_at: CREATED_AT,
        creator_view: {
          original_text: prompt,
          subject,
          direction,
          observation_window: "2026-06-20 to 2026-07-19",
          horizon: "next 30 days",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
        meaning_lock: meaningLock({ caseId, title, body, subject, direction, claim, mechanism, nextWatch, mode: "lens" }),
        query_binding: {
          required: true,
          status: "executed",
          bundle_refs: [`QRY_LAB_${caseId.toUpperCase()}`],
          result_refs: refs,
          as_of: AS_OF,
          warnings: ["synthetic evaluation fixture"],
          unavailable_capabilities: [],
        },
        candidate: {
          candidate_id: candidateId(caseId),
          angle: "evidence",
          frame: { title, body },
          evidence_refs: refs,
        },
      },
      expression: {
        candidate_id: candidateId(caseId),
        creator_signal: { origin: "direct_prompt", interview_text: null, adoption_state: "not_needed" },
        text_image_division: {
          title_job: "memorable_judgment",
          body_job: "evidence_and_mechanism",
          image_job: grammar === "long_short_lens" ? "comparison_and_time" : "evidence_and_time",
        },
        reader_job: grammar === "long_short_lens" ? "comparison" : "proof",
        analytic_relationship: grammar === "long_short_lens" ? "long_short_spread" : "basket_breadth",
        grammar,
        composition,
        surface,
        subject_label: subject,
        horizon_label: "30D VIEW",
        data_status: "synthetic_fixture",
        data_as_of: AS_OF,
        source_label: "synthetic evaluation series",
        argument: {
          claim: { text: claim, state: "creator_view", binding_id: binding(caseId, "claim"), source_refs: [] },
          observation: { text: observation, state: "derived", binding_id: binding(caseId, "observation"), source_refs: refs },
          mechanism: { text: mechanism, state: "creator_view", binding_id: binding(caseId, "mechanism"), source_refs: [] },
          implication: { text: implication, state: "conditional", binding_id: binding(caseId, "implication"), source_refs: [] },
          countercase: { text: countercase, state: "conditional", binding_id: binding(caseId, "countercase"), source_refs: [] },
        },
        observation_test: {
          kind: observationKind,
          statement: observation,
          threshold: 0,
          supports_binding_ids: [binding(caseId, "observation"), binding(caseId, "curve"), binding(caseId, "contributions")],
          source_refs: refs,
        },
        time: {
          observation_start: OBSERVATION_START,
          declared_at: DECLARED_AT,
          horizon_end: HORIZON_END,
          timezone: "UTC",
        },
        lens: {
          lens_id: `LENS_LAB_${caseId.toUpperCase()}`,
          name: lensName,
          label_kind: grammar,
          selection_mode: "pre_registered",
          universe_frozen_at: "2026-06-19T23:59:00Z",
          base_value: 100,
          weighting: "equal",
          rebalance: "none",
          formula: CANONICAL_FORMULA,
          components: lensComponents,
          limitations,
          curve_binding_id: binding(caseId, "curve"),
          contribution_binding_id: binding(caseId, "contributions"),
        },
        future_beats: futureBeats,
      },
    },
  };
}

function beat(caseId, role, label, criterion, at) {
  return {
    role,
    label,
    criterion,
    at,
    state: "conditional",
    binding_id: binding(caseId, role),
    source_refs: [],
  };
}

const btc = [100, 101, 99, 102, 103, 102, 105, 106, 104, 108, 110, 109, 112, 113, 111, 115, 117, 116, 119, 120, 118, 122, 125, 123, 127, 129, 128, 132, 135];
const spy = [100, 101, 100, 100.5, 99.7, 100.2, 99.4, 98.8, 99.1, 98.2, 97.7, 98.4, 97.3, 96.9, 97.6, 96.8, 96.2, 95.9, 96.6, 95.5, 95.2, 94.7, 95.1, 94.4, 94.1, 93.8, 94.2, 93.5, 93.1];

const cases = [
  marketCase({
    caseId: "btc_rotation",
    prompt: "The harder US equities fall, the more BTC refuses to follow. I think capital is starting to treat it as another risk outlet.",
    persona: "intuitive crypto trader",
    title: "BTC's refusal to fall is becoming a choice",
    body: "BTC outperformed SPY over the same window. My intuition is that supply remains, but persistent demand is giving BTC independence. Over the next 30 days, I will first watch whether relative resilience persists and then whether it turns into an upside move.",
    subject: "BTC",
    direction: "long",
    claim: "Resilience is turning BTC into a new risk outlet",
    mechanism: "Persistent demand may be absorbing supply from risk assets",
    nextWatch: "relative resilience and the 20-day price structure",
    observation: "BTC outperformed SPY over the same window",
    implication: "First watch resilience persist, then wait for an upside price move",
    countercase: "If 5-day relative strength turns negative, the inference loses support",
    readerJob: "proof",
    relationship: "change_over_time",
    grammar: "curve_story",
    composition: "curve_stage",
    surface: "paper_signal",
    mainTransform: "raw_price",
    supportTransform: "relative_spread",
    chartStyle: "candles",
    primary: { ticker: "BTC", displayName: "Bitcoin", assetClass: "crypto", ref: "RES_LAB_BTC", closes: btc, assetId: 1 },
    benchmark: { ticker: "SPY", displayName: "S&P 500 ETF", assetClass: "equity", ref: "RES_LAB_SPY", closes: spy, assetId: 2 },
    observationKind: "primary_outperformed_benchmark",
    futureBeats: [
      beat("btc_rotation", "checkpoint", "Relative resilience persists", "5D BTC strength versus SPY > 0", "2026-08-02T09:00:00Z"),
      beat("btc_rotation", "confirmation", "Resilience becomes a price breakout", "BTC makes a 20D high", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "drawdown_defense",
    prompt: "BTC was not the fastest riser in this risk-asset selloff, but it fell less and recovered faster.",
    persona: "risk-focused trader",
    title: "Real strength starts with how an asset absorbs a drawdown",
    body: "BTC's maximum drawdown was shallower than QQQ's over the same window. I am not chasing the biggest gain; I am watching recovery after a stress test. Over the next 30 days, strength deserves to persist only if recovery remains faster.",
    subject: "BTC / QQQ",
    direction: "outperform",
    claim: "The strength gap is hiding in post-drawdown recovery",
    mechanism: "A shallower loss path requires less new demand to recover",
    nextWatch: "time for each curve to return from trough to prior high",
    observation: "BTC's maximum drawdown was shallower than QQQ's",
    implication: "Next, watch whether recovery speed remains faster",
    countercase: "A deeper new BTC low would erase the defensive advantage",
    readerJob: "comparison",
    relationship: "deviation",
    grammar: "drawdown_recovery",
    composition: "divergence_field",
    surface: "midnight",
    mainTransform: "drawdown",
    primary: { ticker: "BTC", displayName: "Bitcoin", assetClass: "crypto", ref: "RES_LAB_BTC_DD", closes: [100, 104, 107, 110, 106, 108, 112, 115, 111, 114, 118, 121, 117, 120, 124, 127, 125, 129, 132, 128, 131, 135, 138, 136, 140, 143, 141, 145, 148], assetId: 3 },
    benchmark: { ticker: "QQQ", displayName: "Nasdaq 100 ETF", assetClass: "equity", ref: "RES_LAB_QQQ_DD", closes: [100, 106, 111, 116, 101, 94, 90, 93, 97, 100, 103, 106, 108, 110, 112, 113, 114, 115, 116, 114, 115, 117, 118, 119, 120, 121, 122, 123, 124], assetId: 4 },
    observationKind: "primary_drawdown_shallower",
    futureBeats: [
      beat("drawdown_defense", "checkpoint", "BTC still recovers before QQQ", "BTC recovery bars < QQQ", "2026-08-02T09:00:00Z"),
      beat("drawdown_defense", "confirmation", "Defensive strength becomes trend strength", "BTC makes a 20D high first", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "semis_divergence",
    prompt: "Semiconductors are rising together, but I think the real cycle gap is starting to split away from the index.",
    persona: "relative-value researcher",
    title: "The same AI narrative no longer produces the same return",
    body: "TSM outperformed SOXX over the same window. I think order conversion is replacing sector beta, and leaders will separate from the index first. Over the next 30 days, I will watch whether the return gap keeps widening.",
    subject: "TSM / SOXX",
    direction: "outperform",
    claim: "Sector beta is giving way to execution differences",
    mechanism: "Order conversion should appear first in the return gap between leaders and the index",
    nextWatch: "TSM's cumulative return spread versus SOXX",
    observation: "TSM outperformed SOXX over the same window",
    implication: "If the gap widens, stock selection will outweigh the sector trade",
    countercase: "If the spread falls below zero, the divergence view is not established",
    readerJob: "comparison",
    relationship: "relative_value",
    grammar: "relative_divergence",
    composition: "divergence_field",
    surface: "warm_editorial",
    mainTransform: "indexed_return",
    primary: { ticker: "TSM", displayName: "TSMC", assetClass: "equity", ref: "RES_LAB_TSM", closes: [100, 101, 103, 102, 105, 108, 107, 110, 113, 112, 116, 118, 117, 121, 123, 122, 126, 129, 128, 132, 135, 134, 138, 141, 140, 145, 147, 149, 153], assetId: 5 },
    benchmark: { ticker: "SOXX", displayName: "Semiconductor ETF", assetClass: "equity", ref: "RES_LAB_SOXX", closes: [100, 101, 102, 101, 103, 104, 103, 105, 106, 105, 107, 108, 107, 109, 110, 109, 111, 112, 111, 113, 114, 113, 115, 116, 115, 117, 118, 117, 119], assetId: 6 },
    observationKind: "primary_outperformed_benchmark",
    futureBeats: [
      beat("semis_divergence", "checkpoint", "The return gap keeps expanding", "TSM-SOXX 5D return spread > 0", "2026-08-02T09:00:00Z"),
      beat("semis_divergence", "confirmation", "Execution differences outweigh sector beta", "20D return spread makes a window high", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "gold_corr_break",
    prompt: "Gold no longer looks like an accessory to risk assets. I want to see whether it is decoupling from technology stocks.",
    persona: "cross-asset macro trader",
    title: "Gold's change is relational, not merely directional",
    body: "The recent rolling correlation between GLD and QQQ turned negative. I think pricing is moving from shared liquidity toward different macro variables. Over the next 30 days, I will watch whether negative correlation persists across more sessions.",
    subject: "GLD / QQQ",
    direction: "watch",
    claim: "Gold is breaking away from technology's rhythm",
    mechanism: "Real rates and risk appetite may be pricing separately",
    nextWatch: "whether 5-day rolling correlation stays negative",
    observation: "Recent rolling correlation between GLD and QQQ turned negative",
    implication: "Persistent negative correlation would make gold a distinct risk expression",
    countercase: "If correlation stabilizes above zero, the decoupling was noise",
    readerJob: "comparison",
    relationship: "correlation",
    grammar: "correlation_shift",
    composition: "editorial_split",
    surface: "cool_mono",
    mainTransform: "rolling_correlation",
    primary: { ticker: "GLD", displayName: "Gold ETF", assetClass: "commodity", ref: "RES_LAB_GLD", closes: [100, 100.5, 101.5, 101, 102, 103, 102.5, 103.5, 104.5, 104, 105, 106, 105.5, 106.5, 107.5, 108.5, 106.8, 108.8, 107, 109, 107.2, 109.1, 107.3, 109.4, 107.5, 109.7, 107.8, 110, 108.1], assetId: 7 },
    benchmark: { ticker: "QQQ", displayName: "Nasdaq 100 ETF", assetClass: "equity", ref: "RES_LAB_QQQ_CORR", closes: [100, 101, 103, 102, 104, 106, 105, 107, 109, 108, 110, 112, 111, 113, 115, 114, 116, 118, 117, 119, 121, 120, 122, 124, 123, 125, 127, 126, 128], assetId: 8 },
    observationKind: "correlation_below",
    futureBeats: [
      beat("gold_corr_break", "checkpoint", "Decoupling persists across more sessions", "5D correlation remains < 0", "2026-08-02T09:00:00Z"),
      beat("gold_corr_break", "confirmation", "Different macro variables take control", "20D correlation confirms below zero", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "earnings_fade",
    prompt: "The stock jumped on earnings and then gave back gains every day. I do not think the market accepted the answer.",
    persona: "event-driven trader",
    title: "Earnings set a high, but the market withheld confirmation",
    body: "NVDA's cumulative return turned negative after the earnings window. I think the first reaction came from expectation inertia, while the fade reflects repricing. Over the next 30 days, I will watch whether price can reclaim the event-day range.",
    subject: "NVDA",
    direction: "short",
    claim: "The spike was not confirmation; the fade exposed the disagreement",
    mechanism: "Expectation inertia lifted price first, then persistent selling repriced it",
    nextWatch: "whether the event-day range can be reclaimed",
    observation: "NVDA's cumulative return turned negative after earnings",
    implication: "Failure to reclaim the event range keeps weakness intact",
    countercase: "A move back above the event high invalidates the fade thesis",
    readerJob: "event",
    relationship: "event_reaction",
    grammar: "event_window",
    composition: "timeline_rail",
    surface: "paper_signal",
    mainTransform: "raw_price",
    primary: { ticker: "NVDA", displayName: "NVIDIA", assetClass: "equity", ref: "RES_LAB_NVDA", closes: [100, 101, 100, 102, 103, 102, 104, 105, 104, 106, 107, 108, 109, 111, 118, 116, 114, 113, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101], assetId: 9 },
    observationKind: "primary_negative_after_event",
    annotations: [{
      kind: "event",
      label: "earnings release",
      occurred_at: "2026-07-04T00:00:00Z",
      value: null,
      state: "reported",
      binding_id: binding("earnings_fade", "event"),
      source_refs: ["RES_LAB_NVDA"],
    }],
    futureBeats: [
      beat("earnings_fade", "checkpoint", "Price has not reclaimed the event range", "5D close < event-day midpoint", "2026-08-02T09:00:00Z"),
      beat("earnings_fade", "confirmation", "The fade confirms repricing", "20D return remains < 0", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "threshold_trigger",
    prompt: "If COIN holds my structural level, I will treat it as a second leg; otherwise it is only a rebound.",
    persona: "trigger-based trader",
    title: "This is not blind bullishness; it is waiting for a gate",
    body: "COIN's latest observation remains above the 210 structural line. I think this level separates a rebound from a new trend. Over the next 30 days, a second leg exists only if price holds and expands above it.",
    subject: "COIN",
    direction: "long",
    claim: "210 is not a target; it separates two market regimes",
    mechanism: "Holding the structural line can turn profit-taking pressure into trend confirmation",
    nextWatch: "time above 210 and a new high",
    observation: "COIN's latest observation remains above the 210 structural line",
    implication: "A hold plus a new high would establish the second leg",
    countercase: "A daily close back below 210 would reduce the breakout to a rebound",
    readerJob: "trigger",
    relationship: "trigger_state",
    grammar: "threshold_regime",
    composition: "threshold_field",
    surface: "midnight",
    mainTransform: "raw_price",
    primary: { ticker: "COIN", displayName: "Coinbase", assetClass: "equity", ref: "RES_LAB_COIN", closes: [180, 184, 182, 188, 191, 189, 195, 199, 196, 203, 207, 204, 211, 214, 212, 218, 221, 219, 225, 228, 226, 232, 235, 231, 238, 241, 239, 244, 247], assetId: 10 },
    observationKind: "latest_above_threshold",
    observationThreshold: 210,
    annotations: [{
      kind: "threshold",
      label: "trend confirmation line 210",
      occurred_at: null,
      value: 210,
      state: "creator_view",
      binding_id: binding("threshold_trigger", "threshold"),
      source_refs: [],
    }],
    futureBeats: [
      beat("threshold_trigger", "checkpoint", "The structural line continues to hold", "daily close > 210 for 5D", "2026-08-02T09:00:00Z"),
      beat("threshold_trigger", "confirmation", "The second leg is confirmed", "COIN makes a 20D high", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "macro_scenarios",
    prompt: "I do not think rate cuts are inherently bullish. The key is whether they rescue liquidity or confirm weaker growth.",
    persona: "conditional macro trader",
    title: "The same rate cut can lead to two markets",
    body: "I care less about the cut itself than the state of growth and credit when it happens. Over the next 30 days, better liquidity with stable credit benefits risk assets; weaker growth and credit makes the cut look like confirmation.",
    subject: "rate-cut trade",
    claim: "Growth and credit determine what lower rates mean",
    observation: "The market initially translates every cut as bullish",
    mechanism: "Liquidity, growth, and credit can route the same policy toward different outcomes",
    implication: "Identify the type of cut before choosing a risk direction",
    countercase: "If growth and credit remain stable, the recession branch recedes",
    nextWatch: "whether credit spreads and growth expectations deteriorate together",
    grammar: "scenario_lanes",
    composition: "scenario_field",
    surface: "warm_editorial",
    readerJob: "scenario",
    relationship: "scenario_payoff",
    futureBeats: [
      beat("macro_scenarios", "confirmation", "Liquidity improves while credit stays stable", "credit spreads do not widen over 10D", "2026-08-02T09:00:00Z"),
      beat("macro_scenarios", "checkpoint", "Growth is revised lower but credit has not stalled", "growth expectations fall for 2 consecutive weeks", "2026-08-10T09:00:00Z"),
      beat("macro_scenarios", "invalidation", "Credit and growth deteriorate together", "credit spreads break a 20D high", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "shipping_spine",
    prompt: "If Red Sea risk persists, I do not want to watch oil alone. Insurance and freight may move first, then transmit into inventory.",
    persona: "supply-chain thinker",
    title: "The first move in Red Sea risk may not be oil",
    body: "I am watching insurance and freight before inventory and income statements. Over the next 30 days, first check whether premiums and spot freight rise together, then whether replenishment cycles are forced longer.",
    subject: "Red Sea supply chain",
    claim: "Insurance and freight may move before oil",
    observation: "My starting observation is that logistics friction is lengthening",
    mechanism: "Risk premiums enter freight first, then inventory through delivery times",
    implication: "Look for the first price signal in insurance and spot freight",
    countercase: "If premiums and freight do not respond, the transmission lacks its first step",
    nextWatch: "insurance rates, spot freight, and delivery times",
    grammar: "causal_spine",
    composition: "causal_spine",
    surface: "cool_mono",
    readerJob: "mechanism",
    relationship: "causal_transmission",
    futureBeats: [
      beat("shipping_spine", "checkpoint", "Insurance and spot freight respond first", "both indicators rise over 10D", "2026-08-02T09:00:00Z"),
      beat("shipping_spine", "confirmation", "Delivery times begin to lengthen", "industry delivery times confirm higher", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "ai_capex_balance",
    prompt: "I think AI capital spending may be near a peak even though orders are still strong. Both can be true.",
    persona: "contrarian fundamental researcher",
    title: "Strong orders do not rule out a capital-spending peak",
    body: "My disagreement is that backlog and new budgets run on different clocks. Over the next 30 days, support comes from order conversion, while the countercase is whether new budgets and delivery times weaken first.",
    subject: "AI capital spending",
    claim: "Strong orders and a capital-spending peak can coexist",
    observation: "The current backlog still provides strong support",
    mechanism: "Order conversion lags new budgets, so the cycles are not synchronized",
    implication: "Separate backlog conversion from incremental budgets",
    countercase: "If new budgets keep rising, move the peak thesis later",
    nextWatch: "new budgets, delivery times, and order growth",
    grammar: "evidence_balance",
    composition: "evidence_balance",
    surface: "paper_signal",
    readerJob: "mechanism",
    relationship: "causal_transmission",
    futureBeats: [
      beat("ai_capex_balance", "checkpoint", "Orders continue to convert", "order growth stays positive for 2 weeks", "2026-08-02T09:00:00Z"),
      beat("ai_capex_balance", "invalidation", "New budgets are revised higher", "budget guidance confirms an increase", HORIZON_END),
    ],
  }),
  lensCase({
    caseId: "ai_capex_lens",
    prompt: "Do not use NVIDIA alone to represent AI. I want a group of proxies that shows whether capital spending is still broadening.",
    persona: "fundamental researcher using a custom observation index",
    title: "The truth about AI investment cannot rest on one company",
    body: "The AI infrastructure proxy Lens is above its 100 baseline in the frozen window. I think demand is still spreading from compute into networking and power. Over the next 30 days, I will watch breadth and reassess if a key link weakens first.",
    subject: "AI CAPEX",
    direction: "long",
    claim: "The real signal is demand spreading from chips into full infrastructure",
    observation: "The AI infrastructure proxy Lens is above its 100 baseline in the frozen window",
    mechanism: "I read synchronized strength as continued breadth in capital spending",
    implication: "First watch breadth persist, then whether demand keeps spilling outward",
    countercase: "If networking or power proxies weaken first, the broadening thesis loses support",
    nextWatch: "synchronized breadth across compute, networking, and power proxies",
    grammar: "creator_lens",
    composition: "lens_anatomy",
    surface: "paper_signal",
    lensName: "AI Capex Breadth Lens",
    observationKind: "lens_positive",
    components: [
      { ticker: "NVDA", ref: "RES_LAB_LENS_NVDA", closes: [100, 102, 101, 104, 106, 105, 109, 112, 111, 115, 118, 117, 121, 124, 123, 128, 131, 130, 135, 138, 137, 142, 146, 145, 150, 153, 152, 157, 161], weight: 0.25, side: "long", reason: "core proxy for compute demand", assetId: 201 },
      { ticker: "AVGO", ref: "RES_LAB_LENS_AVGO", closes: [100, 101, 102, 104, 103, 106, 108, 107, 110, 112, 111, 114, 116, 115, 118, 120, 119, 122, 124, 123, 126, 128, 127, 130, 132, 131, 134, 136, 138], weight: 0.25, side: "long", reason: "custom silicon and network connectivity", assetId: 202 },
      { ticker: "ANET", ref: "RES_LAB_LENS_ANET", closes: [100, 101, 100, 102, 103, 102, 105, 106, 105, 108, 109, 108, 111, 112, 111, 114, 115, 114, 117, 118, 117, 120, 121, 120, 123, 124, 123, 126, 128], weight: 0.25, side: "long", reason: "proxy for cluster-network expansion", assetId: 203 },
      { ticker: "VRT", ref: "RES_LAB_LENS_VRT", closes: [100, 100.5, 101, 102, 101.5, 103, 104, 103.5, 105, 106, 105.5, 107, 108, 107.5, 109, 110, 109.5, 111, 112, 111.5, 113, 114, 113.5, 115, 116, 115.5, 117, 118, 119], weight: 0.25, side: "long", reason: "data-center power and cooling", assetId: 204 },
    ],
    limitations: ["A proxy basket is not the same as company orders", "Fees, dividends, and trading costs are excluded"],
    futureBeats: [
      beat("ai_capex_lens", "confirmation", "Broadening persists", "20D Lens remains > 100", "2026-08-02T09:00:00Z"),
      beat("ai_capex_lens", "invalidation", "A key link weakens first", "Lens falls below 100 for 5D", HORIZON_END),
    ],
  }),
  lensCase({
    caseId: "quality_long_short",
    prompt: "I want to express that the market is rewarding cash-flow quality and punishing leverage, but I need more than a slogan.",
    persona: "factor and relative-value trader",
    title: "The market may be repricing balance sheets",
    body: "The quality long/short Lens is above its 100 baseline in the frozen window. I think cash-flow resilience is outweighing high-leverage beta. Over the next 30 days, I will watch whether the spread expands and abandon the inference if it falls below baseline.",
    subject: "QUALITY SPREAD",
    direction: "outperform",
    claim: "This is not defense; balance sheets are beginning to create a return gap",
    observation: "The quality long/short Lens is above its 100 baseline in the frozen window",
    mechanism: "I read the spread as a rising discount for financing fragility",
    implication: "If the spread persists, quality should continue to beat high-leverage beta",
    countercase: "If the Lens falls below 100, the quality premium is not established",
    nextWatch: "return contribution and financing pressure on both sleeves",
    grammar: "long_short_lens",
    composition: "contribution_stage",
    surface: "midnight",
    lensName: "Quality Balance-Sheet Lens",
    observationKind: "long_short_positive",
    components: [
      { ticker: "MSFT", ref: "RES_LAB_LS_MSFT", closes: [100, 101, 102, 101, 103, 104, 105, 104, 106, 107, 108, 107, 109, 110, 111, 110, 112, 113, 114, 113, 115, 116, 117, 116, 118, 119, 120, 121, 123], weight: 1 / 3, side: "long", reason: "proxy for cash-flow stability", assetId: 211 },
      { ticker: "GOOGL", ref: "RES_LAB_LS_GOOGL", closes: [100, 100.5, 101, 102, 101.5, 103, 104, 103.5, 105, 106, 105.5, 107, 108, 107.5, 109, 110, 109.5, 111, 112, 111.5, 113, 114, 113.5, 115, 116, 115.5, 117, 118, 119], weight: 1 / 3, side: "long", reason: "net cash and earnings resilience", assetId: 212 },
      { ticker: "META", ref: "RES_LAB_LS_META", closes: [100, 101, 100.5, 102, 103, 102.5, 104, 105, 104.5, 106, 107, 106.5, 108, 109, 108.5, 110, 111, 110.5, 112, 113, 112.5, 114, 115, 114.5, 116, 117, 116.5, 118, 120], weight: 1 / 3, side: "long", reason: "high-margin cash-flow proxy", assetId: 213 },
      { ticker: "CHTR", ref: "RES_LAB_LS_CHTR", closes: [100, 99, 100, 98, 97, 98, 96, 95, 96, 94, 93, 94, 92, 91, 92, 90, 89, 90, 88, 87, 88, 86, 85, 86, 84, 83, 84, 82, 81], weight: -1 / 3, side: "short", reason: "high-leverage financing sensitivity", assetId: 214 },
      { ticker: "WBD", ref: "RES_LAB_LS_WBD", closes: [100, 99.5, 99, 98.5, 99, 97.5, 97, 96.5, 97, 95.5, 95, 94.5, 95, 93.5, 93, 92.5, 93, 91.5, 91, 90.5, 91, 89.5, 89, 88.5, 89, 87.5, 87, 86.5, 86], weight: -1 / 3, side: "short", reason: "debt burden and transition pressure", assetId: 215 },
      { ticker: "CCL", ref: "RES_LAB_LS_CCL", closes: [100, 100.5, 99, 99.5, 98, 98.5, 97, 97.5, 96, 96.5, 95, 95.5, 94, 94.5, 93, 93.5, 92, 92.5, 91, 91.5, 90, 90.5, 89, 89.5, 88, 88.5, 87, 87.5, 86], weight: -1 / 3, side: "short", reason: "capital intensity and refinancing sensitivity", assetId: 216 },
    ],
    limitations: ["Example components are not investment advice", "No sector-neutral or trading-cost adjustment"],
    futureBeats: [
      beat("quality_long_short", "confirmation", "The quality spread keeps expanding", "20D Lens makes a window high", "2026-08-02T09:00:00Z"),
      beat("quality_long_short", "invalidation", "The quality premium disappears", "Lens falls below 100 for 5D", HORIZON_END),
    ],
  }),
];

const capabilityGaps = [
  {
    case_id: "options_clock",
    prompt: "I think earnings volatility is underpriced and want to express a long straddle, but the image must also make time decay understandable.",
    missing: ["option_contract_resolution", "payoff_curve", "theta_clock", "event_volatility_context"],
  },
];

async function main() {
  const root = path.resolve(process.argv[2] ?? path.join(process.cwd(), "pretrade-expression-lab"));
  mkdirSync(root, { recursive: true });
  const results = [];
  for (const item of cases) {
    const caseRoot = path.join(root, item.meta.case_id);
    mkdirSync(caseRoot, { recursive: true });
    writeJson(path.join(caseRoot, "job.json"), item.job);
    const started = performance.now();
    const { preview, report } = await runFastPreviewJob(item.job, path.join(caseRoot, "output"));
    const candidate = preview.candidates[0];
    const rendered = report.renders[0];
    results.push({
      ...item.meta,
      duration_ms: Math.round(performance.now() - started),
      title: candidate.frame.title,
      body: candidate.frame.body,
      grammar: item.job.expression?.grammar ?? item.job.expressions[0].grammar,
      composition: item.job.expression?.composition ?? item.job.expressions[0].composition,
      surface: item.job.expression?.surface ?? item.job.expressions[0].surface,
      design_family: rendered.design_family,
      narrative_placement: rendered.narrative_placement,
      display_system: rendered.display_system,
      design_fingerprint: rendered.design_fingerprint,
      image: path.relative(root, path.join(caseRoot, "output", rendered.image_ref)),
      mobile_display: rendered.audit.mobile_display,
      attention_signature: rendered.audit.attention_signature,
      master_audit: rendered.audit,
      alt_text: candidate.frame.alt_text,
      observation_evaluation: rendered.observation_evaluation,
    });
  }
  const designDiversity = {
    design_family_count: new Set(results.map((item) => item.design_family)).size,
    narrative_placement_count: new Set(results.map((item) => item.narrative_placement)).size,
    surface_count: new Set(results.map((item) => item.surface)).size,
    display_system_count: new Set(results.map((item) => item.display_system)).size,
    fingerprint_count: new Set(results.map((item) => item.design_fingerprint)).size,
  };
  designDiversity.passed = designDiversity.design_family_count >= 9
    && designDiversity.narrative_placement_count >= 8
    && designDiversity.surface_count >= 4
    && designDiversity.display_system_count >= 4
    && designDiversity.fingerprint_count === results.length;
  if (!designDiversity.passed) throw new Error(`Art-direction diversity gate failed: ${JSON.stringify(designDiversity)}`);
  const mobileAttention = {
    attention_signature_count: new Set(results.map((item) => item.attention_signature)).size,
    master_audits_passed: results.every((item) => item.master_audit.valid && item.master_audit.single_master),
    maximum_essential_copy_groups: Math.max(...results.map((item) => item.master_audit.essential_copy_groups)),
    minimum_essential_font_floor: Math.min(...results.map((item) => item.master_audit.essential_font_floor)),
    minimum_secondary_font_floor: Math.min(...results.map((item) => item.master_audit.secondary_font_floor)),
    publication_master_count: results.filter((item) => item.master_audit.single_master).length,
  };
  mobileAttention.passed = mobileAttention.master_audits_passed
    && mobileAttention.attention_signature_count >= 9
    && mobileAttention.maximum_essential_copy_groups <= 3
    && mobileAttention.minimum_essential_font_floor >= 20
    && mobileAttention.minimum_secondary_font_floor >= 16
    && mobileAttention.publication_master_count === results.length;
  if (!mobileAttention.passed) throw new Error(`Mobile attention gate failed: ${JSON.stringify(mobileAttention)}`);
  const manifest = {
    schema_version: "cuebook-pretrade-expression-lab",
    generated_at: new Date().toISOString(),
    data_notice: "All market series are synthetic evaluation fixtures and are not publishable.",
    cases: results,
    design_diversity: designDiversity,
    mobile_attention: mobileAttention,
    capability_gaps: capabilityGaps,
  };
  writeJson(path.join(root, "manifest.json"), manifest);
  process.stdout.write(`${JSON.stringify({ root, rendered: results.length, capability_gaps: capabilityGaps.length }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
