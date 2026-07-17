#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_research_pack.mjs";

function basePack() {
  return {
    schema_version: "research-pack-v1",
    brief: {
      subject: "Example Corp Q2 earnings",
      assets: ["EXM"],
      question: "Did the quarter change the earnings path?",
      decision_use: "investment_research",
      horizon: "next two quarters",
      as_of: "2026-07-14T12:00:00+00:00",
      freshness_window: "24h",
    },
    source_register: [
      {
        id: "S1",
        title: "Example Corp reports second-quarter 2026 results",
        url: "https://example.com/ir/q2-results",
        publisher: "Example Corp",
        source_type: "company_release",
        published_at: "2026-07-14T10:00:00+00:00",
        observed_at: "2026-07-14T10:05:00+00:00",
        access: "public",
        fact_refs: ["F1", "F5"],
      },
      {
        id: "S2",
        url: "https://consensus.example.com/exm",
        publisher: "Consensus Data",
        source_type: "consensus_data",
        published_at: null,
        observed_at: "2026-07-14T09:55:00+00:00",
        access: "authorized",
      },
      {
        id: "S3",
        url: "https://market.example.com/exm",
        publisher: "Market Data",
        source_type: "market_data",
        published_at: null,
        observed_at: "2026-07-14T11:00:00+00:00",
        access: "authorized",
      },
    ],
    fact_ledger: [
      {
        id: "F1",
        claim: "Q2 revenue was 105 million dollars.",
        evidence_class: "source",
        source_ids: ["S1"],
        as_of: "2026-07-14T10:00:00+00:00",
        freshness: "current",
        confidence: "high",
        basis: "reported GAAP",
        period: "Q2 2026",
      },
      {
        id: "F2",
        claim: "Revenue consensus was 100 million dollars.",
        evidence_class: "source",
        source_ids: ["S2"],
        as_of: "2026-07-14T09:55:00+00:00",
        freshness: "current",
        confidence: "high",
        basis: "consensus",
        period: "Q2 2026",
      },
      {
        id: "F3",
        claim: "Shares rose 4 percent in the event window.",
        evidence_class: "verified-live",
        source_ids: ["S3"],
        as_of: "2026-07-14T11:00:00+00:00",
        freshness: "current",
        confidence: "high",
        basis: "close-to-11:00 ET",
        period: "event window",
      },
      {
        id: "F4",
        claim: "The revenue result cleared the published bar.",
        evidence_class: "derived",
        source_ids: ["S1", "S2"],
        as_of: "2026-07-14T10:05:00+00:00",
        freshness: "current",
        confidence: "high",
        basis: "F1 minus F2",
        period: "Q2 2026",
      },
      {
        id: "F5",
        claim: "Prior-period revenue was 96 million dollars.",
        evidence_class: "source",
        source_ids: ["S1"],
        as_of: "2026-07-14T10:00:00+00:00",
        freshness: "current",
        confidence: "high",
        basis: "reported GAAP",
        period: "Q1 2026",
      },
    ],
    comparator_table: [
      {
        metric: "Revenue",
        period: "Q2 2026",
        actual: 105,
        consensus: 100,
        prior: 96,
        unit: "USD millions",
        basis: "GAAP",
        evidence_ids: ["F1", "F2", "F5"],
        value_evidence: {
          actual: ["F1"],
          consensus: ["F2"],
          prior: ["F5"],
        },
        interpretation: "Five percent above consensus and up from the prior period.",
      },
    ],
    market_context: {
      price_reaction: [
        {
          asset: "EXM",
          window: "pre-release close to 11:00 ET",
          return_pct: 4.0,
          benchmark: "SPY",
          benchmark_return_pct: 0.5,
          excess_return_pct: 3.5,
          as_of: "2026-07-14T11:00:00+00:00",
          data_delay: "15 minutes",
          evidence_ids: ["F3"],
        },
      ],
      positioning: [],
      liquidity: [],
      valuation: [
        {
          subject: "Example Corp common equity",
          label: "Forward revenue multiple",
          value_state: "numeric",
          value: 5.2,
          unit: "x",
          numerator: "common-equity market capitalization",
          denominator: "forward twelve-month revenue",
          period: "forward twelve months",
          accounting_basis: "GAAP revenue consensus",
          currency_treatment: "USD numerator and denominator; no FX translation",
          share_class: "EXM common shares",
          comparability: "comparable",
          as_of: "2026-07-14T11:00:00+00:00",
          data_delay: "15 minutes",
          source_refs: ["S1", "S3"],
          evidence_ids: ["F1", "F3"],
          not_meaningful_reason: null,
        },
      ],
    },
    thesis: {
      stance: "positive",
      claim: "The quarter supports a higher near-term revenue path, with valuation still the main counterweight.",
      horizon: "next two quarters",
      confidence: "medium",
      mechanisms: [
        {
          step: 1,
          claim: "Revenue above consensus can lift forward estimates if guidance confirms it.",
          status: "derived",
          evidence_ids: ["F1", "F2", "F4"],
        },
      ],
      forced_actors: ["analysts carrying the prior revenue path"],
      evidence_ids: ["F1", "F2", "F3", "F4"],
      counterevidence_ids: ["F3"],
      invalidation: "Forward guidance fails to move above the prior Street path.",
    },
    scenarios: [
      {
        name: "confirmation",
        condition: "Guidance and revisions rise after the report.",
        path: "The revenue surprise becomes an estimate-revision story.",
        signposts: ["positive 30-day revisions", "price holds excess return"],
        invalidation: "Revisions stay flat or turn down.",
        evidence_ids: ["F1", "F2", "F3"],
      },
      {
        name: "fade",
        condition: "The beat is timing or mix and guidance stays unchanged.",
        path: "The initial price reaction fades without a model change.",
        signposts: ["flat guidance", "lost event-day gap"],
        invalidation: "Consensus revisions broaden higher.",
        evidence_ids: ["F1", "F2", "F3"],
      },
    ],
    catalysts: [
      {
        event: "Updated consensus estimates",
        expected_at: null,
        evidence_ids: ["F1", "F2"],
      },
    ],
    gaps: ["Forward guidance was not supplied in the fixture."],
    quality_report: {
      decision: "ready",
      hard_failures: [],
      warnings: [],
      checks: [],
      data_freshness: "current",
      source_coverage: {
        primary_source_present: true,
        live_market_data_present: true,
        independent_sources: 3,
      },
    },
  };
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

function warningCodes(result) {
  return new Set(result.warnings.map((entry) => entry.code));
}

function main() {
  let cases = 0;

  let result = validate(basePack());
  assert.ok(result.valid, JSON.stringify(result));
  cases += 1;

  let item = basePack();
  item.source_register.push(structuredClone(item.source_register[0]));
  assert.ok(errorCodes(validate(item)).has("DUPLICATE_SOURCE_ID"));
  cases += 1;

  item = basePack();
  item.fact_ledger[0].source_ids = ["S99"];
  assert.ok(errorCodes(validate(item)).has("UNKNOWN_SOURCE_REF"));
  cases += 1;

  item = basePack();
  item.fact_ledger[2].as_of = null;
  assert.ok(errorCodes(validate(item)).has("FACT_TIMESTAMP_REQUIRED"));
  cases += 1;

  item = basePack();
  item.comparator_table[0].consensus = null;
  item.comparator_table[0].prior = null;
  item.comparator_table[0].evidence_ids = ["F1"];
  item.comparator_table[0].value_evidence.consensus = [];
  item.comparator_table[0].value_evidence.prior = [];
  result = validate(item);
  assert.ok(result.valid && warningCodes(result).has("COMPARATOR_THIN"));
  cases += 1;

  item = basePack();
  item.quality_report.hard_failures = ["source asset mismatch"];
  assert.ok(errorCodes(validate(item)).has("HARD_FAILURE_STATE"));
  cases += 1;

  item = basePack();
  item.brief.decision_use = "trade_watch";
  assert.ok(errorCodes(validate(item)).has("TRADE_LIQUIDITY_MISSING"));
  cases += 1;

  item = basePack();
  item.thesis.counterevidence_ids = [];
  assert.ok(errorCodes(validate(item)).has("READY_WITHOUT_COUNTEREVIDENCE"));
  cases += 1;

  item = basePack();
  item.scenarios[0].evidence_ids = ["F99"];
  assert.ok(errorCodes(validate(item)).has("UNKNOWN_FACT_REF"));
  cases += 1;

  item = basePack();
  item.quality_report.source_coverage.independent_sources = 2;
  assert.ok(errorCodes(validate(item)).has("SOURCE_COVERAGE_MISMATCH"));
  cases += 1;

  item = basePack();
  item.quality_report.decision = "blocked";
  item.quality_report.hard_failures = ["source asset mismatch"];
  assert.ok(validate(item).valid);
  cases += 1;

  item = basePack();
  item.source_register[0].source_type = "model_consensus";
  assert.ok(errorCodes(validate(item)).has("SOURCE_TYPE_VALUE"));
  cases += 1;

  item = basePack();
  item.debug = true;
  assert.ok(errorCodes(validate(item)).has("UNKNOWN_ROOT_FIELD"));
  cases += 1;

  item = basePack();
  item.thesis.confidence = "certain";
  assert.ok(errorCodes(validate(item)).has("THESIS_CONFIDENCE"));
  cases += 1;

  item = basePack();
  item.source_register[0].url = null;
  item.source_register[0].locator = "user-provided attachment 1";
  item.source_register[0].source_type = "user_supplied";
  delete item.source_register[0].title;
  delete item.source_register[0].fact_refs;
  item.quality_report.source_coverage.primary_source_present = false;
  assert.ok(validate(item).valid);
  cases += 1;

  item = basePack();
  item.source_register[0].url = null;
  assert.ok(errorCodes(validate(item)).has("SOURCE_LOCATOR"));
  cases += 1;

  item = basePack();
  item.thesis.evidence_ids = ["F4"];
  assert.ok(errorCodes(validate(item)).has("READY_WITHOUT_SOURCED_THESIS"));
  cases += 1;

  item = basePack();
  item.fact_ledger[0].freshness = "stale";
  assert.ok(errorCodes(validate(item)).has("DATA_FRESHNESS_MISMATCH"));
  cases += 1;

  item = basePack();
  item.fact_ledger.push({
    id: "F6",
    claim: "The market was already pricing a perfect quarter.",
    evidence_class: "hypothesis",
    source_ids: [],
    as_of: null,
    freshness: "unknown",
    confidence: "low",
    basis: "Cuebook consensusRead",
    period: "Q2 2026",
  });
  item.comparator_table[0].consensus = "perfect quarter";
  item.comparator_table[0].evidence_ids = ["F1", "F5", "F6"];
  item.comparator_table[0].value_evidence.consensus = ["F6"];
  item.quality_report.data_freshness = "mixed";
  assert.ok(errorCodes(validate(item)).has("COMPARATOR_EVIDENCE_CLASS"));
  cases += 1;

  item = basePack();
  item.source_register[1].title = "Example Corp consensus snapshot";
  assert.ok(validate(item).valid);
  cases += 1;

  item = basePack();
  delete item.source_register[0].title;
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_TITLE"));
  cases += 1;

  item = basePack();
  item.source_register[0].title = 123;
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_TITLE"));
  cases += 1;

  item = basePack();
  item.source_register[0].url = null;
  item.source_register[0].locator = "authorized release copy";
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_URL"));
  cases += 1;

  item = basePack();
  item.source_register[0].access = "authorized";
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_ACCESS"));
  cases += 1;

  item = basePack();
  item.source_register[0].published_at = null;
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_PUBLISHED_AT"));
  cases += 1;

  item = basePack();
  item.source_register[0].published_at = "yesterday";
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_PUBLISHED_AT"));
  cases += 1;

  item = basePack();
  item.source_register[0].publisher = 123;
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_PUBLISHER"));
  cases += 1;

  item = basePack();
  item.source_register[0].fact_refs = [];
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_FACT_REFS"));
  cases += 1;

  item = basePack();
  item.source_register[0].fact_refs = ["F99"];
  assert.ok(errorCodes(validate(item)).has("UNKNOWN_FACT_REF"));
  cases += 1;

  item = basePack();
  item.source_register[0].fact_refs = ["F2"];
  assert.ok(errorCodes(validate(item)).has("EVENT_ANCHOR_FACT_LINK"));
  cases += 1;

  item = basePack();
  item.source_register[0].source_type = "reputable_news";
  item.quality_report.source_coverage.primary_source_present = false;
  assert.ok(validate(item).valid);
  cases += 1;

  const valuationTextFields = [
    "subject",
    "label",
    "unit",
    "numerator",
    "denominator",
    "period",
    "accounting_basis",
    "currency_treatment",
    "share_class",
  ];
  for (const key of valuationTextFields) {
    item = basePack();
    delete item.market_context.valuation[0][key];
    assert.ok(errorCodes(validate(item)).has("VALUATION_FIELD"), key);
    cases += 1;
  }

  item = basePack();
  item.market_context.valuation[0].subject = 123;
  assert.ok(errorCodes(validate(item)).has("VALUATION_FIELD"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].as_of = "today";
  assert.ok(errorCodes(validate(item)).has("VALUATION_AS_OF"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].value_state = "estimated";
  assert.ok(errorCodes(validate(item)).has("VALUATION_VALUE_STATE"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].comparability = "maybe";
  assert.ok(errorCodes(validate(item)).has("VALUATION_COMPARABILITY"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].source_refs = [];
  assert.ok(errorCodes(validate(item)).has("VALUATION_SOURCE_REQUIRED"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].source_refs = ["S99"];
  assert.ok(errorCodes(validate(item)).has("UNKNOWN_SOURCE_REF"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].value = "5.2";
  assert.ok(errorCodes(validate(item)).has("VALUATION_NUMERIC_VALUE"));
  cases += 1;

  item = basePack();
  let valuation = item.market_context.valuation[0];
  Object.assign(valuation, {
    label: "Trailing P/E",
    value_state: "N/M",
    value: null,
    numerator: "common-equity market capitalization",
    denominator: "trailing attributable net income",
    period: "trailing twelve months",
    comparability: "not_comparable",
    not_meaningful_reason: "Trailing attributable net income is non-positive.",
  });
  assert.ok(validate(item).valid);
  cases += 1;

  item = basePack();
  valuation = item.market_context.valuation[0];
  Object.assign(valuation, { value_state: "N/M", value: null, comparability: "not_comparable" });
  delete valuation.not_meaningful_reason;
  assert.ok(errorCodes(validate(item)).has("VALUATION_NM_REASON"));
  cases += 1;

  item = basePack();
  valuation = item.market_context.valuation[0];
  Object.assign(valuation, {
    value_state: "N/M",
    comparability: "not_comparable",
    not_meaningful_reason: "The denominator is non-positive.",
  });
  delete valuation.value;
  assert.ok(errorCodes(validate(item)).has("VALUATION_VALUE"));
  cases += 1;

  item = basePack();
  valuation = item.market_context.valuation[0];
  Object.assign(valuation, {
    value_state: "N/M",
    comparability: "not_comparable",
    not_meaningful_reason: "The denominator is non-positive.",
  });
  assert.ok(errorCodes(validate(item)).has("VALUATION_NM_VALUE"));
  cases += 1;

  item = basePack();
  item.market_context.valuation[0].not_meaningful_reason = "Unexpected reason";
  assert.ok(errorCodes(validate(item)).has("VALUATION_NM_REASON"));
  cases += 1;

  item = basePack();
  valuation = item.market_context.valuation[0];
  Object.assign(valuation, {
    value_state: "N/M",
    value: null,
    comparability: "comparable",
    not_meaningful_reason: "The denominator is non-positive.",
  });
  assert.ok(errorCodes(validate(item)).has("VALUATION_NM_COMPARABILITY"));
  cases += 1;

  console.log(`ok: ${cases} research pack cases`);
}

test("regression matrix", () => {
  main();
});
