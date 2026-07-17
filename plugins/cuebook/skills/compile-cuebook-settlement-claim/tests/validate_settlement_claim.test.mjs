import test from "node:test";
import assert from "node:assert/strict";

import {
  validate,
  render_one_line as renderOneLine,
  canonical_hash as canonicalHash,
} from "../scripts/validate_settlement_claim.mjs";

function baseClaim() {
  const item = {
    schema_version: "settlement-claim-v1",
    claim_id: "SETTLE_uso20260714",
    revision: 1,
    state: "ready",
    lineage: {
      source_content_refs: ["POST_hormuz_x"],
      thesis_ref: null,
      canonical_hash: null,
    },
    extraction: {
      mode: "explicit",
      explicit_fields: ["subject.ticker", "direction", "clock.window_end", "success.conditions.C1"],
      inferred_fields: ["subject.instrument_id"],
      proposed_fields: [],
      confirmed_fields: [],
      missing_fields: [],
    },
    subject: {
      instrument_id: "USO:ARCX",
      ticker: "USO",
      display_name: "United States Oil Fund",
      asset_class: "etf",
      venue: "ARCX",
      quote_currency: "USD",
    },
    direction: "long",
    claim_text: "USO will finish the window above the July 13 official close.",
    intent: {
      action_state: "enter_now",
      trigger_condition_ref: null,
      entry_price_rule: "publication_baseline",
    },
    baseline: {
      value: 117.79,
      unit: "USD",
      observed_at: "2026-07-13T20:00:00Z",
      observation_basis: "official_close",
      market_state: "closed",
      data_source_ref: "source:arca-history",
    },
    clock: {
      declared_at: "2026-07-14T04:30:00Z",
      window_start: "2026-07-14T13:30:00Z",
      window_end: "2026-07-17T20:00:00Z",
      timezone: "America/New_York",
      market_session: "regular",
    },
    success: {
      logic: "all",
      conditions: [{
        id: "C1",
        subject_ref: "primary",
        kind: "terminal_value",
        metric: "official_close",
        operator: "gt",
        target: { value: 117.79, lower_bound: null, upper_bound: null, unit: "USD", value_source: "baseline" },
        observation_mode: "at_expiry",
        window_start: null,
        window_end: null,
        data_source_ref: "source:arca-history",
        benchmark_ref: null,
        event_ref: null,
        description: "At expiry, USO official regular-session close is above 117.79 USD.",
      }],
    },
    failure: {
      mode: "complement_at_expiry",
      conditions: [],
      text: "The claim fails if the official close at expiry is at or below 117.79 USD.",
    },
    resolution: {
      primary_source_ref: "source:arca-history",
      fallback_source_refs: ["source:nasdaq-history"],
      adjustments_policy: "Use split-adjusted prices and preserve the economic threshold across symbol changes.",
      ambiguity_policy: "fallback_source",
      score_modes: ["binary_accuracy", "directional_accuracy", "return"],
    },
    public_view: {
      settlement_summary: "USO is successful if its official regular-session close at the deadline is above 117.79 USD; otherwise it fails.",
      one_line: "",
      status_label: "待结算",
    },
    quality_report: { decision: "ready", warnings: [], missing_fields: [] },
  };
  item.public_view.one_line = renderOneLine(item);
  return item;
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

test("valid terminal claim", () => {
  const result = validate(baseClaim());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.generated_one_line, "USO 看多｜截至 2026-07-17｜到期常规收盘 > 117.79 USD｜待结算");
});

test("window barrier", () => {
  const item = baseClaim();
  const condition = item.success.conditions[0];
  Object.assign(condition, { kind: "window_barrier", operator: "gte", observation_mode: "any_in_window" });
  Object.assign(condition.target, { value: 119.83, value_source: "explicit_target" });
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.generated_one_line.includes("期间任一常规收盘 >= 119.83 USD"));
});

test("unconfirmed proposal blocks ready", () => {
  const item = baseClaim();
  item.extraction.mode = "mixed";
  item.extraction.proposed_fields = ["clock.window_end"];
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("UNCONFIRMED_PROPOSAL"));
});

test("needs confirmation allows proposal", () => {
  const item = baseClaim();
  item.state = "needs_confirmation";
  item.extraction.mode = "mixed";
  item.extraction.proposed_fields = ["clock.window_end"];
  item.quality_report.decision = "needs_confirmation";
  item.public_view.status_label = "待确认";
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("direction conflict", () => {
  const item = baseClaim();
  item.success.conditions[0].operator = "lt";
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("DIRECTION_CONFLICT"));
});

test("baseline after declaration is rejected", () => {
  const item = baseClaim();
  item.baseline.observed_at = "2026-07-14T05:00:00Z";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("BASELINE_AFTER_DECLARATION"));
});

test("live baseline preserves quote type", () => {
  const item = baseClaim();
  Object.assign(item.baseline, {
    observed_at: "2026-07-14T04:29:59Z",
    observation_basis: "last_trade",
    market_state: "pre",
    data_source_ref: "source:live-quote",
  });
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("baseline market state is required", () => {
  const item = baseClaim();
  delete item.baseline.market_state;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("BASELINE_MARKET_STATE"));
});

test("conditional intent requires ordered trigger", () => {
  const item = baseClaim();
  item.intent = {
    action_state: "wait_for_trigger",
    trigger_condition_ref: "C1",
    entry_price_rule: "publication_baseline",
  };
  const outcome = structuredClone(item.success.conditions[0]);
  outcome.id = "C2";
  outcome.description = "At expiry, USO remains above the publication baseline after the trigger.";
  Object.assign(item.success, { logic: "sequence", conditions: [item.success.conditions[0], outcome] });
  item.public_view.one_line = renderOneLine(item);
  let result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.generated_one_line.includes("条件看多"));

  item.intent.trigger_condition_ref = "C2";
  item.public_view.one_line = renderOneLine(item);
  result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("TRIGGER_SEQUENCE_ORDER"));
});

test("triggered regime uses protocol event horizon", () => {
  const item = baseClaim();
  Object.assign(item.subject, {
    instrument_id: "BTC-USD:SPOT",
    ticker: "BTC",
    display_name: "Bitcoin",
    asset_class: "crypto",
    venue: "AGGREGATED_SPOT",
  });
  item.claim_text = "A confirmed breakout activates a bullish view through the next Bitcoin halving.";
  item.intent = {
    action_state: "wait_for_trigger",
    trigger_condition_ref: "C1",
    entry_price_rule: "trigger_observation",
  };
  Object.assign(item.baseline, {
    value: 64000,
    observed_at: "2026-07-14T04:29:59Z",
    observation_basis: "spot",
    market_state: "continuous",
    data_source_ref: "source:cuebook-btc-spot",
  });
  Object.assign(item.clock, {
    window_end: null,
    end_mode: "protocol_event",
    end_event_ref: "EVENT_btc-halving-next",
    end_event_label: "下一次 BTC 减半",
    end_event_source_ref: "source:bitcoin-chain",
    fallback_window_end: null,
    market_session: "continuous",
  });
  item.success = {
    logic: "sequence",
    conditions: [
      {
        id: "C1",
        subject_ref: "primary",
        kind: "event",
        metric: "event_status",
        operator: "occurred",
        target: { value: null, lower_bound: null, upper_bound: null, unit: null, value_source: "event" },
        observation_mode: "event_by_expiry",
        window_start: null,
        window_end: null,
        data_source_ref: "source:cuebook-btc-d1-signal-v1",
        benchmark_ref: null,
        event_ref: "SIGNAL_btc-d1-close-65000-volume-20",
        description: "日线收盘 > 65,000 且成交量 >= 前20个完整日均量",
      },
      {
        id: "C2",
        subject_ref: "primary",
        kind: "terminal_value",
        metric: "official_close",
        operator: "gt",
        target: { value: null, lower_bound: null, upper_bound: null, unit: "USD", value_source: "trigger_observation" },
        observation_mode: "first_after_event",
        window_start: null,
        window_end: null,
        data_source_ref: "source:cuebook-btc-usd-utc-d1",
        benchmark_ref: null,
        event_ref: "EVENT_btc-halving-next",
        description: "The first sealed UTC daily close after the next halving is above the activation close.",
      },
    ],
  };
  item.failure.text = "The claim fails if the first sealed UTC daily close after the next halving is at or below the activation close.";
  Object.assign(item.resolution, {
    primary_source_ref: "source:cuebook-btc-usd-utc-d1",
    fallback_source_refs: ["source:coinbase-btc-usd-d1"],
  });
  item.public_view.settlement_summary = "The signal activates the long view; success is measured against the activation close at the next halving.";
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(
    result.generated_one_line,
    "BTC 条件看多｜至下一次 BTC 减半｜日线收盘 > 65,000 且成交量 >= 前20个完整日均量 -> 事件后首次官方收盘 > 触发收盘价｜待结算",
  );
});

test("compound all", () => {
  const item = baseClaim();
  item.success.conditions.push({
    id: "C2",
    subject_ref: "event:hormuz-traffic",
    kind: "event",
    metric: "event_status",
    operator: "occurred",
    target: { value: null, lower_bound: null, upper_bound: null, unit: null, value_source: "event" },
    observation_mode: "event_by_expiry",
    window_start: null,
    window_end: null,
    data_source_ref: "source:maritime-advisory",
    benchmark_ref: null,
    event_ref: "EVENT_verified-traffic-restriction",
    description: "到期前权威航运数据确认通航仍受限",
  });
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.generated_one_line.includes(" 且 到期前权威航运数据确认通航仍受限"));
});

test("relative requires benchmark", () => {
  const item = baseClaim();
  item.direction = "outperform";
  const condition = item.success.conditions[0];
  Object.assign(condition, { kind: "relative_return", metric: "excess_return_pct", benchmark_ref: null });
  Object.assign(condition.target, { value: 0, unit: "%", value_source: "benchmark" });
  item.resolution.score_modes = ["binary_accuracy", "excess_return"];
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("RELATIVE_CONTRACT"));
});

test("relative one line names benchmark", () => {
  const item = baseClaim();
  item.direction = "outperform";
  const condition = item.success.conditions[0];
  Object.assign(condition, {
    kind: "relative_return",
    metric: "excess_return_pct",
    benchmark_ref: "benchmark:XLE:ARCX:last_close",
  });
  Object.assign(condition.target, { value: 0, unit: "%", value_source: "benchmark" });
  item.resolution.score_modes = ["binary_accuracy", "excess_return"];
  item.public_view.one_line = renderOneLine(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.generated_one_line.includes("（相对 XLE）"));
});

test("frozen hash", () => {
  const item = baseClaim();
  item.state = "frozen";
  item.public_view.status_label = "已冻结";
  item.public_view.one_line = renderOneLine(item);
  item.lineage.canonical_hash = canonicalHash(item);
  const result = validate(item);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const changed = structuredClone(item);
  changed.claim_text = "Changed after freeze.";
  assert.equal(validate(changed).valid, false);
});
