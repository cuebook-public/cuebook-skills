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
      label: "先检查这条关系是否延续",
      criterion: "5D 关系保持同方向",
      at: "2026-08-02T09:00:00Z",
      state: "conditional",
      binding_id: binding(caseId, "checkpoint"),
      source_refs: [],
    },
    {
      role: "confirmation",
      label: "再判断是否进入新状态",
      criterion: "20D 结构得到确认",
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
          observation_window: "2026-06-20 至 2026-07-19",
          horizon: "未来 30 天",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
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
        source_label: "合成评测序列",
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
          observation_window: "创作者当前观察",
          horizon: "未来 30 天",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
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
        source_label: "创作者推演",
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
          observation_window: "2026-06-20 至 2026-07-19",
          horizon: "未来 30 天",
          claim,
          mechanism,
          next_watch: nextWatch,
        },
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
        source_label: "合成评测序列",
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
    prompt: "美股越跌 BTC 越不肯跌，我觉得资金开始把它当成另一个风险出口。",
    persona: "直觉型加密交易者",
    title: "BTC 的不跌，正在变成一种选择",
    body: "同期 BTC 相对 SPY 更强。我的直觉是抛压仍在，但持续承接让它获得了独立性；未来 30 天，先看相对韧性能否延续，再看它是否转成上冲。",
    subject: "BTC",
    direction: "long",
    claim: "抗跌正在把 BTC 推向新的风险出口",
    mechanism: "持续承接可能正在吸收风险资产的抛压",
    nextWatch: "相对韧性与 20 日价格结构",
    observation: "同期 BTC 相对 SPY 更强",
    implication: "先看韧性延续，再等它转成价格上冲",
    countercase: "若 5 日相对强弱转负，这条推演失去支点",
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
      beat("btc_rotation", "checkpoint", "相对韧性继续保持", "5D 相对 SPY 强弱 > 0", "2026-08-02T09:00:00Z"),
      beat("btc_rotation", "confirmation", "韧性转成价格突破", "BTC 创 20D 新高", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "drawdown_defense",
    prompt: "这轮风险资产下杀里，BTC 不是涨得最快，但它跌得浅、修得快。",
    persona: "风险管理型交易者",
    title: "真正的强势，先看它怎么承受下跌",
    body: "同期 BTC 的最大回撤浅于 QQQ。我的重点不是追涨幅，而是观察压力测试后的修复能力；未来 30 天，如果修复速度继续领先，强势才有资格延续。",
    subject: "BTC / QQQ",
    direction: "outperform",
    claim: "这轮强弱差，藏在回撤后的修复里",
    mechanism: "更浅的亏损路径降低了恢复所需的新增买盘",
    nextWatch: "两条曲线从谷底回到前高所需的时间",
    observation: "同期 BTC 的最大回撤浅于 QQQ",
    implication: "下一步看修复速度能否继续领先",
    countercase: "若 BTC 出现更深的新低，防守优势就不存在",
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
      beat("drawdown_defense", "checkpoint", "BTC 仍先于 QQQ 修复", "BTC 修复根数 < QQQ", "2026-08-02T09:00:00Z"),
      beat("drawdown_defense", "confirmation", "防守优势变成趋势优势", "BTC 先创 20D 新高", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "semis_divergence",
    prompt: "半导体都在涨，但我觉得真正的景气差开始从指数里裂开了。",
    persona: "相对价值研究者",
    title: "同一条 AI 叙事，已经不是同一种收益",
    body: "同期 TSM 相对 SOXX 更强。我的判断是订单兑现正在取代板块贝塔，领先者会先从指数中脱离；未来 30 天，看这条收益差能否继续扩大。",
    subject: "TSM / SOXX",
    direction: "outperform",
    claim: "板块贝塔正在让位于兑现差异",
    mechanism: "订单兑现会先反映在龙头与指数的收益差",
    nextWatch: "TSM 相对 SOXX 的累计收益差",
    observation: "同期 TSM 相对 SOXX 更强",
    implication: "收益差若继续扩大，选股逻辑会压过板块逻辑",
    countercase: "若收益差回到零轴下方，分化判断暂不成立",
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
      beat("semis_divergence", "checkpoint", "收益差继续扩张", "TSM-SOXX 5D 收益差 > 0", "2026-08-02T09:00:00Z"),
      beat("semis_divergence", "confirmation", "兑现差异压过板块贝塔", "20D 收益差创观察期新高", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "gold_corr_break",
    prompt: "黄金最近不像风险资产的附庸了，我想看它是不是开始和科技股脱钩。",
    persona: "跨资产宏观交易者",
    title: "黄金的变化，不是涨跌，是关系变了",
    body: "GLD 与 QQQ 的近期滚动相关性已转负。我的判断是定价主线正从共同流动性转向不同宏观变量；未来 30 天，看负相关能否跨过更多交易日。",
    subject: "GLD / QQQ",
    direction: "watch",
    claim: "黄金正在摆脱科技股的共同节奏",
    mechanism: "真实利率与风险偏好可能开始分开定价",
    nextWatch: "5 日滚动相关性是否持续为负",
    observation: "GLD 与 QQQ 的近期滚动相关性已转负",
    implication: "若负相关延续，黄金会成为不同的风险表达",
    countercase: "若相关性重新稳定转正，脱钩只是短噪音",
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
      beat("gold_corr_break", "checkpoint", "脱钩跨过更多交易日", "5D 相关性持续 < 0", "2026-08-02T09:00:00Z"),
      beat("gold_corr_break", "confirmation", "不同宏观变量开始主导", "20D 相关性确认转负", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "earnings_fade",
    prompt: "这只票财报当天冲高，但后面每天都在吐回去，我觉得市场并没有接受那份答案。",
    persona: "事件驱动交易者",
    title: "财报给了高点，市场却没有给确认",
    body: "财报窗口后 NVDA 的累计收益转负。我的判断是第一反应来自预期惯性，后续回吐才是市场重新定价；未来 30 天，看它能否收复事件日区间。",
    subject: "NVDA",
    direction: "short",
    claim: "冲高不是确认，回吐才暴露真实分歧",
    mechanism: "预期惯性先推高价格，持续卖盘随后重新定价",
    nextWatch: "事件日区间能否被重新收复",
    observation: "财报窗口后 NVDA 的累计收益转负",
    implication: "不能收复事件区间，弱势就仍在延续",
    countercase: "若价格重新站回事件高点，回吐逻辑失效",
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
      label: "财报发布",
      occurred_at: "2026-07-04T00:00:00Z",
      value: null,
      state: "reported",
      binding_id: binding("earnings_fade", "event"),
      source_refs: ["RES_LAB_NVDA"],
    }],
    futureBeats: [
      beat("earnings_fade", "checkpoint", "价格仍未收复事件区间", "5D 收盘 < 事件日中枢", "2026-08-02T09:00:00Z"),
      beat("earnings_fade", "confirmation", "回吐被确认为重新定价", "20D 收益保持 < 0", HORIZON_END),
    ],
  }),
  marketCase({
    caseId: "threshold_trigger",
    prompt: "COIN 只要守住我看的结构线，我就把它当成第二段行情，不守就只是反弹。",
    persona: "触发条件型交易者",
    title: "这不是看涨，是等市场跨过一道门",
    body: "COIN 最新观察值仍在 210 结构线之上。我的想法是这条线区分反弹与新趋势；未来 30 天，只有继续守住并扩张，第二段行情才成立。",
    subject: "COIN",
    direction: "long",
    claim: "210 不是目标，是行情性质的分界线",
    mechanism: "站稳结构线会把获利盘压力转成趋势确认",
    nextWatch: "210 上方的持续时间和新高",
    observation: "COIN 最新观察值仍在 210 结构线之上",
    implication: "守住并形成新高，第二段行情才成立",
    countercase: "若日线重新跌破 210，这次突破只算反弹",
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
      label: "趋势确认线 210",
      occurred_at: null,
      value: 210,
      state: "creator_view",
      binding_id: binding("threshold_trigger", "threshold"),
      source_refs: [],
    }],
    futureBeats: [
      beat("threshold_trigger", "checkpoint", "结构线继续守住", "日线连续 5D > 210", "2026-08-02T09:00:00Z"),
      beat("threshold_trigger", "confirmation", "第二段行情得到确认", "COIN 创 20D 新高", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "macro_scenarios",
    prompt: "我不觉得降息天然利多，关键是它到底在救流动性还是确认增长坏了。",
    persona: "条件推演型宏观交易者",
    title: "同一次降息，可以通向两种市场",
    body: "我关注的不是降息本身，而是它发生时增长与信用的状态。未来 30 天，如果流动性改善而信用不坏，风险资产受益；如果增长和信用同时转弱，降息更像确认。",
    subject: "降息交易",
    claim: "利率下降的含义，要由增长和信用决定",
    observation: "我看到市场把所有降息都先翻译成利多",
    mechanism: "流动性、增长和信用会把同一政策导向不同结果",
    implication: "先辨认降息类型，再决定风险方向",
    countercase: "若增长和信用都稳定，衰退分支暂时退出",
    nextWatch: "信用利差与增长预期是否同步恶化",
    grammar: "scenario_lanes",
    composition: "scenario_field",
    surface: "warm_editorial",
    readerJob: "scenario",
    relationship: "scenario_payoff",
    futureBeats: [
      beat("macro_scenarios", "confirmation", "流动性改善，信用仍稳定", "信用利差 10D 不扩大", "2026-08-02T09:00:00Z"),
      beat("macro_scenarios", "checkpoint", "增长下修但信用尚未失速", "增长预期连续 2 周下修", "2026-08-10T09:00:00Z"),
      beat("macro_scenarios", "invalidation", "信用与增长同步恶化", "信用利差突破 20D 高位", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "shipping_spine",
    prompt: "如果红海风险继续，我不想只看油价，我觉得先动的可能是保险和运价，然后才传到库存。",
    persona: "产业链思考者",
    title: "红海风险真正的第一跳，可能不在油价",
    body: "我更关注保险与运价先于库存和利润表变化。未来 30 天，先看保费和即期运价是否同步抬升，再看补库存周期是否被迫拉长。",
    subject: "红海供应链",
    claim: "第一跳可能是保险和运价，而不是油价",
    observation: "我的观察起点是物流摩擦正在延长",
    mechanism: "风险保费先进入运价，再通过交付周期进入库存",
    implication: "价格信号应先从保险和即期运价寻找",
    countercase: "若保费和运价都不响应，传导链缺少第一跳",
    nextWatch: "保险费率、即期运价和交付周期",
    grammar: "causal_spine",
    composition: "causal_spine",
    surface: "cool_mono",
    readerJob: "mechanism",
    relationship: "causal_transmission",
    futureBeats: [
      beat("shipping_spine", "checkpoint", "保险与即期运价先响应", "两项指标 10D 同向上行", "2026-08-02T09:00:00Z"),
      beat("shipping_spine", "confirmation", "交付周期开始拉长", "行业交付周期确认上升", HORIZON_END),
    ],
  }),
  creatorOnlyCase({
    caseId: "ai_capex_balance",
    prompt: "我觉得 AI 资本开支快见顶了，但现在订单还很好，这两件事可能同时成立。",
    persona: "反共识基本面研究者",
    title: "订单还强，不代表资本开支没有见顶",
    body: "我的分歧点是订单存量与新增预算并不在同一个时钟上。未来 30 天，支持面看订单兑现，反面看新增预算和交付周期是否先转弱。",
    subject: "AI 资本开支",
    claim: "订单强与资本开支见顶可以同时成立",
    observation: "当前订单存量仍然提供强支撑",
    mechanism: "订单兑现滞后于新增预算，两个周期并不同步",
    implication: "要把存量兑现和增量预算分开观察",
    countercase: "若新增预算继续上修，见顶判断需要后移",
    nextWatch: "新增预算、交付周期和订单增速",
    grammar: "evidence_balance",
    composition: "evidence_balance",
    surface: "paper_signal",
    readerJob: "mechanism",
    relationship: "causal_transmission",
    futureBeats: [
      beat("ai_capex_balance", "checkpoint", "订单继续兑现", "订单增速 2 周不转负", "2026-08-02T09:00:00Z"),
      beat("ai_capex_balance", "invalidation", "新增预算重新上修", "预算指引确认上调", HORIZON_END),
    ],
  }),
  lensCase({
    caseId: "ai_capex_lens",
    prompt: "不要只拿英伟达代表 AI，我想找一组能看出资本开支是不是还在扩散的代理。",
    persona: "自定义观察指标的基本面研究者",
    title: "AI 投资的真相，不能只看一家公司",
    body: "AI 基建代理 Lens 在冻结窗口内高于基准 100。我的判断是需求仍从算力向网络与电力扩散；未来 30 天，看广度是否保持，任何关键环节先转弱都要重估。",
    subject: "AI CAPEX",
    direction: "long",
    claim: "真正的信号，是需求从芯片走向整条基础设施",
    observation: "AI 基建代理 Lens 在冻结窗口内高于基准 100",
    mechanism: "我把同步走强理解为资本开支广度仍在扩散",
    implication: "先看广度保持，再看需求能否继续外溢",
    countercase: "若网络或电力代理率先转弱，扩散叙事失去支点",
    nextWatch: "算力、网络与电力代理的同步广度",
    grammar: "creator_lens",
    composition: "lens_anatomy",
    surface: "paper_signal",
    lensName: "AI Capex Breadth Lens",
    observationKind: "lens_positive",
    components: [
      { ticker: "NVDA", ref: "RES_LAB_LENS_NVDA", closes: [100, 102, 101, 104, 106, 105, 109, 112, 111, 115, 118, 117, 121, 124, 123, 128, 131, 130, 135, 138, 137, 142, 146, 145, 150, 153, 152, 157, 161], weight: 0.25, side: "long", reason: "算力需求的核心代理", assetId: 201 },
      { ticker: "AVGO", ref: "RES_LAB_LENS_AVGO", closes: [100, 101, 102, 104, 103, 106, 108, 107, 110, 112, 111, 114, 116, 115, 118, 120, 119, 122, 124, 123, 126, 128, 127, 130, 132, 131, 134, 136, 138], weight: 0.25, side: "long", reason: "定制芯片与网络连接", assetId: 202 },
      { ticker: "ANET", ref: "RES_LAB_LENS_ANET", closes: [100, 101, 100, 102, 103, 102, 105, 106, 105, 108, 109, 108, 111, 112, 111, 114, 115, 114, 117, 118, 117, 120, 121, 120, 123, 124, 123, 126, 128], weight: 0.25, side: "long", reason: "集群网络扩张代理", assetId: 203 },
      { ticker: "VRT", ref: "RES_LAB_LENS_VRT", closes: [100, 100.5, 101, 102, 101.5, 103, 104, 103.5, 105, 106, 105.5, 107, 108, 107.5, 109, 110, 109.5, 111, 112, 111.5, 113, 114, 113.5, 115, 116, 115.5, 117, 118, 119], weight: 0.25, side: "long", reason: "数据中心电力与散热", assetId: 204 },
    ],
    limitations: ["代理篮子不等于企业订单", "未计入费用、股息与交易成本"],
    futureBeats: [
      beat("ai_capex_lens", "confirmation", "扩散广度继续保持", "20D Lens 保持 > 100", "2026-08-02T09:00:00Z"),
      beat("ai_capex_lens", "invalidation", "关键环节率先转弱", "Lens 跌破 100 并保持 5D", HORIZON_END),
    ],
  }),
  lensCase({
    caseId: "quality_long_short",
    prompt: "我想表达市场开始奖励现金流质量、惩罚高杠杆，但不要只给我一句空话。",
    persona: "因子与相对价值交易者",
    title: "市场可能正在重新给资产负债表定价",
    body: "质量多空 Lens 在冻结窗口内高于基准 100。我的判断是现金流韧性正在压过高杠杆弹性；未来 30 天，看收益差是否继续扩张，若重新跌破基准则退出这条推演。",
    subject: "QUALITY SPREAD",
    direction: "outperform",
    claim: "这不是防守，是资产负债表开始产生收益差",
    observation: "质量多空 Lens 在冻结窗口内高于基准 100",
    mechanism: "我把收益差理解为市场开始提高融资脆弱性的折价",
    implication: "若差值延续，质量会继续压过高杠杆弹性",
    countercase: "若 Lens 重新跌破 100，质量溢价暂未形成",
    nextWatch: "多空两侧的收益贡献与融资压力",
    grammar: "long_short_lens",
    composition: "contribution_stage",
    surface: "midnight",
    lensName: "Quality Balance-Sheet Lens",
    observationKind: "long_short_positive",
    components: [
      { ticker: "MSFT", ref: "RES_LAB_LS_MSFT", closes: [100, 101, 102, 101, 103, 104, 105, 104, 106, 107, 108, 107, 109, 110, 111, 110, 112, 113, 114, 113, 115, 116, 117, 116, 118, 119, 120, 121, 123], weight: 1 / 3, side: "long", reason: "现金流稳定性代理", assetId: 211 },
      { ticker: "GOOGL", ref: "RES_LAB_LS_GOOGL", closes: [100, 100.5, 101, 102, 101.5, 103, 104, 103.5, 105, 106, 105.5, 107, 108, 107.5, 109, 110, 109.5, 111, 112, 111.5, 113, 114, 113.5, 115, 116, 115.5, 117, 118, 119], weight: 1 / 3, side: "long", reason: "净现金与利润韧性", assetId: 212 },
      { ticker: "META", ref: "RES_LAB_LS_META", closes: [100, 101, 100.5, 102, 103, 102.5, 104, 105, 104.5, 106, 107, 106.5, 108, 109, 108.5, 110, 111, 110.5, 112, 113, 112.5, 114, 115, 114.5, 116, 117, 116.5, 118, 120], weight: 1 / 3, side: "long", reason: "高利润率现金流代理", assetId: 213 },
      { ticker: "CHTR", ref: "RES_LAB_LS_CHTR", closes: [100, 99, 100, 98, 97, 98, 96, 95, 96, 94, 93, 94, 92, 91, 92, 90, 89, 90, 88, 87, 88, 86, 85, 86, 84, 83, 84, 82, 81], weight: -1 / 3, side: "short", reason: "高杠杆融资敏感代理", assetId: 214 },
      { ticker: "WBD", ref: "RES_LAB_LS_WBD", closes: [100, 99.5, 99, 98.5, 99, 97.5, 97, 96.5, 97, 95.5, 95, 94.5, 95, 93.5, 93, 92.5, 93, 91.5, 91, 90.5, 91, 89.5, 89, 88.5, 89, 87.5, 87, 86.5, 86], weight: -1 / 3, side: "short", reason: "债务负担与转型压力", assetId: 215 },
      { ticker: "CCL", ref: "RES_LAB_LS_CCL", closes: [100, 100.5, 99, 99.5, 98, 98.5, 97, 97.5, 96, 96.5, 95, 95.5, 94, 94.5, 93, 93.5, 92, 92.5, 91, 91.5, 90, 90.5, 89, 89.5, 88, 88.5, 87, 87.5, 86], weight: -1 / 3, side: "short", reason: "资本密集与再融资敏感", assetId: 216 },
    ],
    limitations: ["样例成分不代表投资建议", "未做行业中性与交易成本调整"],
    futureBeats: [
      beat("quality_long_short", "confirmation", "质量收益差继续扩张", "20D Lens 创观察期新高", "2026-08-02T09:00:00Z"),
      beat("quality_long_short", "invalidation", "质量溢价重新消失", "Lens 跌破 100 并保持 5D", HORIZON_END),
    ],
  }),
];

const capabilityGaps = [
  {
    case_id: "options_clock",
    prompt: "我觉得财报波动定价太低，想表达买跨式，但图里也要让人看懂时间损耗。",
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
    publication_master_count: results.filter((item) => item.master_audit.single_master).length,
  };
  mobileAttention.passed = mobileAttention.master_audits_passed
    && mobileAttention.attention_signature_count >= 9
    && mobileAttention.maximum_essential_copy_groups <= 2
    && mobileAttention.minimum_essential_font_floor >= 22
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
