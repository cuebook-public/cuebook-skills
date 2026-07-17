import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SETTLEMENT_CONFIRMATION_FIELDS,
  SETTLEMENT_ELIGIBILITY_FIELDS,
  WEIGHTS,
  visibleCharCount,
} from "../scripts/validate_publish_candidate_set.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = join(here, "..");
const wordmark = readFileSync(
  join(skillRoot, "..", "direct-cuebook-viewpoint-visual", "assets", "cuebook-wordmark.svg"),
  "utf8",
).trim()
  .replace(
    "<svg ",
    '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ',
  )
  .replaceAll('fill="#F2F3F4"', 'fill="currentColor"');

export const FINGERPRINT = `sha256:${"a".repeat(64)}`;

export function launchHtml() {
  return `<style>main{font-family:"Cuebook Noi","PingFang SC",sans-serif}.cuebook-wordmark{right:41px;bottom:34px;width:136px;height:26px;color:#101411}</style><main data-cuebook-visual-contract="launch-v1" data-entry-role="claim" data-color-system="semantic-v1" data-palette-family="quiet-cobalt" data-palette-strategy="thesis_native" data-palette-preset="quiet-cobalt" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json"><h1 data-role="claim" data-visual-level="1">观点</h1><div data-role="evidence" data-visual-level="2" data-color-role="observed"></div>${wordmark}</main>`;
}

export function quality() {
  const values = {
    claim_fidelity: 9.2,
    compression: 9.0,
    human_voice: 8.8,
    evidence_integrity: 9.3,
    visual_craft: 9.0,
    three_second: 9.1,
  };
  const score = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + values[key] * weight, 0);
  values.weighted_score = Math.round((score + Number.EPSILON) * 1_000) / 1_000;
  values.verdict = "pass";
  return values;
}

export function evidenceAnchor(requestClass = "news_anchor") {
  const anchor = {
    anchor_id: "EVA_HOOD_CHAIN",
    request_class: requestClass,
    kind: "company_release",
    title: "Robinhood launches tokenized-stock infrastructure",
    publisher: "Robinhood",
    url: "https://newsroom.aboutrobinhood.com/",
    published_at: "2026-07-01T12:00:00Z",
    as_of: "2026-07-14T08:27:00Z",
    fact_refs: ["F1"],
  };
  if (new Set(["valuation_metric", "comparison_metric"]).has(requestClass)) {
    Object.assign(anchor, {
      kind: "estimate_data",
      published_at: null,
      metric: {
        name: "Forward P/E",
        basis: "NTM diluted EPS, calendarized to 2027",
        value_state: "numeric",
        value: 27.4,
        unit: "x",
        comparison_subject: requestClass === "comparison_metric" ? "COIN" : null,
        not_meaningful_reason: null,
      },
    });
  } else if (requestClass === "price_level") {
    Object.assign(anchor, {
      kind: "market_data",
      published_at: null,
      price_observation: {
        instrument_ref: "INS_HOOD_XNAS",
        value: 106.03,
        unit: "USD",
        observed_at: "2026-07-14T20:00:00Z",
        observation_basis: "official_close",
        market_session: "regular",
      },
    });
  } else if (requestClass === "market_series") {
    Object.assign(anchor, {
      kind: "market_data",
      published_at: null,
      market_series: {
        series_ref: "SER_HOOD_D1_CLOSE",
        instrument_refs: ["INS_HOOD_XNAS"],
        metric: "official_close",
        interval: "1d",
        window_start: "2026-06-16T20:00:00Z",
        window_end: "2026-07-14T20:00:00Z",
        timezone: "America/New_York",
        observation_basis: "sealed regular-session daily bars",
      },
    });
  } else if (requestClass === "settlement_reference") {
    Object.assign(anchor, {
      kind: "market_data",
      published_at: null,
      settlement_reference: {
        claim_ref: "SETTLE_HOOD_CHAIN_20260715",
        eligibility_fields: [...SETTLEMENT_ELIGIBILITY_FIELDS].sort(),
      },
    });
  }
  return anchor;
}

export function candidate(index, label, angle, headline, body, close) {
  const copy = {
    headline,
    body,
    close,
    tags: ["事件驱动", "预期修正", "直接做多"],
    visible_char_count: 0,
  };
  copy.visible_char_count = visibleCharCount(copy);
  return {
    candidate_id: `PUBCAND_HOOD_${index}`,
    label,
    angle,
    meaning_fingerprint: FINGERPRINT,
    post_ref: `POST_HOOD_${index}`,
    copy,
    visual: {
      direction_ref: `VDIR_HOOD_${index}`,
      html_ref: `candidate-${index}/viewpoint.html`,
      preview_ref: `candidate-${index}/viewpoint.png`,
      compact_preview_ref: `candidate-${index}/viewpoint-622.png`,
      visible_char_count: 2,
      alt_text: `HOOD candidate ${index}`,
    },
    evidence_anchors: [evidenceAnchor()],
    settlement: {
      claim_ref: "SETTLE_HOOD_CHAIN_20260715",
      one_line: "HOOD 看多｜截至 2026-08-14｜到期常规收盘 > 113.45 USD｜待确认",
      state: "needs_confirmation",
    },
    public_disclosures: ["由 Cuebook 协助核验公开信息"],
    quality: quality(),
  };
}

export function baseSet() {
  return {
    schema_version: "publish-candidate-set-v1",
    candidate_set_id: "PUBSET_HOOD_CHAIN_20260715",
    revision: 1,
    state: "ready_for_selection",
    lineage: {
      expression_plan_ref: "CEXP_HOOD_CHAIN_20260715@r1",
      fingerprint_sha256: FINGERPRINT,
      input_artifact_refs: ["RESEARCH_HOOD_CHAIN", "VDSET_HOOD_CHAIN"],
      settlement_claim_ref: "SETTLE_HOOD_CHAIN_20260715",
    },
    generation_policy: {
      candidate_count: 3,
      autonomous: true,
      user_iteration_required: false,
      calibration_owner: "skills",
      fallback_policy: "degrade_then_omit",
      linked_evidence_policy: "required_when_material",
      retry_limit: 2,
      copy_budget: {
        headline_max: 32,
        body_max: 220,
        close_max: 56,
        total_max: 300,
        paragraph_max: 4,
        hard_number_max: 3,
      },
      visual_visible_char_max: 120,
    },
    shared_view: {
      ticker: "HOOD",
      direction: "long",
      horizon: "30 days",
      claim: "Robinhood Chain may earn HOOD a financial-infrastructure re-rating.",
      caveat: "Usage, monetization, token rights, and jurisdiction remain material constraints.",
      material_evidence: {
        requirements: [{
          requirement_id: "D1",
          request_class: "news_anchor",
          required_anchor_ids: ["EVA_HOOD_CHAIN"],
        }],
      },
      settlement_eligibility: {
        status: "eligible",
        requirements: {
          metric: true,
          operator: true,
          threshold: true,
          deadline: true,
          authoritative_source: true,
        },
        missing_requirements: [],
      },
    },
    calibration: {
      research: "ready",
      market_data: "ready",
      semantics: "ready",
      policy: "ready",
      visual: "ready",
      settlement: "degraded",
      repairs: ["Kept the 7% APY attached to USDG lending."],
    },
    candidates: [
      candidate(1, "直给版", "conviction", "我先看多 HOOD 30 天", "Robinhood Chain 已经上线。市场接下来会开始重估它手里的全球分发和链上金融入口。", "财报拿不出真实使用，我撤回这次估值换挡。"),
      candidate(2, "数据版", "evidence", "一条链，带着现成的分发", "Robinhood 已经握有大规模客户和平台资产。链上股票若开始形成交易、抵押和结算闭环，HOOD 的收入边界会被重新打开。", "下一次财报，先看使用，再谈想象。"),
      candidate(3, "催化版", "catalyst", "主网上线，只完成了第一半", "前半段是产品发布，后半段是交易量、钱包活跃和收入。市场现在交易的是后半段能不能出现。", "我给 HOOD 一个财报前后的多头窗口。"),
    ],
    selection: {
      selected_candidate_id: null,
      selection_receipt_ref: null,
      content_confirmed: false,
      settlement_confirmed: false,
      settlement_confirmation_fields: [],
    },
    quality_report: {
      decision: "ready_for_selection",
      warnings: ["Settlement remains proposed."],
      hard_failures: [],
    },
  };
}

export function bindMaterialAnchor(item, requestClass, suppliedAnchor = null) {
  const anchor = structuredClone(suppliedAnchor ?? evidenceAnchor(requestClass));
  item.shared_view.material_evidence.requirements = [{
    requirement_id: "D1",
    request_class: requestClass,
    required_anchor_ids: [anchor.anchor_id],
  }];
  for (const candidateItem of item.candidates) {
    candidateItem.evidence_anchors = [structuredClone(anchor)];
  }
}

export function confirmSelection(item, { settlement = false } = {}) {
  item.state = "selected";
  item.quality_report.decision = "selected";
  Object.assign(item.selection, {
    selected_candidate_id: item.candidates[0].candidate_id,
    selection_receipt_ref: "SEL_HOOD_20260715",
    content_confirmed: true,
    settlement_confirmed: settlement,
    settlement_confirmation_fields: settlement ? [...SETTLEMENT_CONFIRMATION_FIELDS].sort() : [],
  });
  if (settlement) {
    for (const candidateItem of item.candidates) candidateItem.settlement.state = "frozen";
  }
}
