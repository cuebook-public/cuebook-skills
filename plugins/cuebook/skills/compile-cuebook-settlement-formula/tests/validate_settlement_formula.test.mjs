import test from "node:test";
import assert from "node:assert/strict";

import {
  FORMULA_FAMILIES,
  canonical_execution_expression,
  canonical_hash,
  render_public_math,
  validate,
} from "../scripts/validate_settlement_formula.mjs";

const USO_INSTRUMENT = "11111111-1111-4111-8111-111111111111";
const USO_PERIOD = "11111111-1111-4111-8111-222222222222";
const BTC_INSTRUMENT = "22222222-2222-4222-8222-111111111111";
const NVDA_INSTRUMENT = "33333333-3333-4333-8333-111111111111";
const NVDA_PERIOD = "33333333-3333-4333-8333-222222222222";

function expr(op, args = [], { value = null, ref = null, window = null } = {}) {
  return { op, args, value, ref, window };
}

function evaluateExpression(node, values) {
  const op = node.op;
  const args = node.args ?? [];
  if (op === "literal") return Number(node.value);
  if (op === "var") return Number(values[node.ref]);
  const resolved = args.map((item) => evaluateExpression(item, values));
  if (op === "add") return resolved[0] + resolved[1];
  if (op === "sub") return resolved[0] - resolved[1];
  if (op === "mul") return resolved[0] * resolved[1];
  if (op === "div") return resolved[0] / resolved[1];
  if (op === "gt") return resolved[0] > resolved[1];
  if (op === "gte") return resolved[0] >= resolved[1];
  if (op === "lt") return resolved[0] < resolved[1];
  if (op === "lte") return resolved[0] <= resolved[1];
  if (op === "and") return resolved.every((item) => item);
  throw new Error(`Unsupported test operator: ${op}`);
}

function variable(varId, symbol, {
  metric = "official_close",
  interval = "1d",
  unit = "USD",
  sealed = true,
  instrumentRef = USO_INSTRUMENT,
} = {}) {
  return {
    id: varId,
    symbol,
    kind: "market_observation",
    value_type: "number",
    unit,
    source_ref: "source:cuebook-market-series",
    instrument_ref: instrumentRef,
    metric,
    interval,
    timezone: "America/New_York",
    session: "regular",
    sealed_only: sealed,
    parameters: {},
  };
}

function fixedEntry(price, observedAt, symbolPeriodId, providerSymbol) {
  return {
    mode: "fixed_snapshot",
    price,
    observed_at: observedAt,
    source: "candle_close",
    market_session: "regular",
    symbol_period_id: symbolPeriodId,
    provider_symbol: providerSymbol,
    observation_ref: `market_latest_prices:${symbolPeriodId}`,
    capture_ref: null,
  };
}

function executionLeg(legId, assetId, instrumentId, periodId, ticker, entryPrice, exitVariableRef, direction, target = null) {
  return {
    leg_id: legId,
    role: legId === "A" ? "primary" : "comparator",
    asset_id: assetId,
    provider_instrument_id: instrumentId,
    canonical_ticker: ticker,
    provider: "polygon",
    quote_currency: "USD",
    direction,
    entry: fixedEntry(entryPrice, "2026-07-14T20:00:00Z", periodId, ticker.toUpperCase()),
    exit_variable_ref: exitVariableRef,
    target,
  };
}

function fixedClock() {
  return {
    starts_at: "2026-07-14T20:00:00Z",
    settle_at: "2026-07-17T20:00:00Z",
    end_event_ref: null,
    interval: "1d",
    timezone: "America/New_York",
    session: "regular",
    outcome_source: "warm_candle",
    selection: "first_eligible_at_or_after",
    origin: "provider_official",
    adjustment: "adjusted",
    max_observation_delay_seconds: 345600,
  };
}

function baseFormula() {
  const item = {
    schema_version: "settlement-formula-v1",
    formula_id: "FORMULA_uso20260717",
    revision: 1,
    state: "ready",
    lineage: {
      claim_ref: "SETTLE_uso20260714",
      claim_hash: "1".repeat(64),
      canonical_hash: null,
    },
    subject: {
      instrument_id: USO_INSTRUMENT,
      ticker: "USO",
      direction: "long",
    },
    execution_profile: {
      engine: "cuebook_settlement_v1",
      formula_family: "single_asset_price_target",
      aggregation: "single",
      legs: [
        executionLeg(
          "A",
          101,
          USO_INSTRUMENT,
          USO_PERIOD,
          "uso",
          "108.70",
          "VAR_END_CLOSE",
          "long",
          { metric: "price", operator: "gt", value: "117.79", unit: "USD" },
        ),
      ],
      clock: fixedClock(),
      direction_threshold_bps: null,
      long_short: null,
    },
    variables: [variable("VAR_END_CLOSE", "P_H")],
    activation: {
      mode: "immediate",
      window_start: null,
      window_end: null,
      end_event_ref: null,
      expression: null,
      captures: [],
    },
    outcome: {
      observation_mode: "at_datetime",
      observed_at: "2026-07-17T20:00:00Z",
      window_start: null,
      window_end: null,
      event_ref: null,
      expression: null,
    },
    invalidation: null,
    lifecycle: {
      initial_state: "active",
      activation_state: "active",
      terminal_states: ["succeeded", "failed", "manual_review"],
      untriggered_result: "no_score",
      tie_result: "failed",
      invalidated_result: "failed",
    },
    resolution: {
      primary_source_refs: ["source:arca-history"],
      fallback_source_refs: ["source:nasdaq-history"],
      zero_division_policy: "not_applicable",
      missing_data_policy: "fallback_source",
      precision: 8,
      rounding_mode: "none",
      observation_order: "official_sequence",
    },
    public_math: {
      activation_formula: "",
      success_formula: "",
      failure_formula: "",
      one_line: "USO 到期官方收盘 > 117.79 USD 时成功。",
    },
    quality_report: { decision: "ready", warnings: [], missing_fields: [] },
  };
  item.outcome.expression = canonical_execution_expression(item.execution_profile);
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function btcTriggeredFormula() {
  const item = baseFormula();
  item.formula_id = "FORMULA_btchalving2026";
  Object.assign(item.lineage, { claim_ref: "SETTLE_btchalving2026", claim_hash: "2".repeat(64) });
  Object.assign(item.subject, { instrument_id: BTC_INSTRUMENT, ticker: "BTC" });
  const close = variable("VAR_CLOSE", "P_t", { interval: "1d", instrumentRef: BTC_INSTRUMENT });
  Object.assign(close, { timezone: "UTC", session: "continuous", source_ref: "source:cuebook-btc-utc-d1" });
  const volume = variable("VAR_VOLUME", "V_t", { metric: "volume", interval: "1d", unit: "BTC", instrumentRef: BTC_INSTRUMENT });
  Object.assign(volume, { timezone: "UTC", session: "continuous", source_ref: "source:cuebook-btc-utc-d1" });
  const endClose = variable("VAR_END_CLOSE", "P_H", { interval: "1d", instrumentRef: BTC_INSTRUMENT });
  Object.assign(endClose, { timezone: "UTC", session: "continuous", source_ref: "source:cuebook-btc-utc-d1" });
  item.variables = [close, volume, endClose];
  const priceGate = expr("gt", [expr("var", [], { ref: "VAR_CLOSE" }), expr("literal", [], { value: 65000 })]);
  const volumeMean = expr("mean", [expr("var", [], { ref: "VAR_VOLUME" })], { window: { lookback: 20, include_current: false } });
  const volumeRatio = expr("div", [expr("var", [], { ref: "VAR_VOLUME" }), volumeMean]);
  const volumeGate = expr("gte", [volumeRatio, expr("literal", [], { value: 1 })]);
  item.activation = {
    mode: "first_true",
    window_start: "2026-07-15T00:00:00Z",
    window_end: null,
    end_event_ref: "EVENT_btc-halving-next",
    expression: expr("and", [priceGate, volumeGate]),
    captures: [{
      id: "CAP_TRIGGER_CLOSE",
      symbol: "P_tau",
      variable_ref: "VAR_CLOSE",
      mode: "value_at_activation",
    }],
  };
  item.execution_profile = {
    engine: "cuebook_settlement_v1",
    formula_family: "single_asset_direction",
    aggregation: "single",
    legs: [{
      leg_id: "A",
      role: "primary",
      asset_id: 202,
      provider_instrument_id: BTC_INSTRUMENT,
      canonical_ticker: "btc",
      provider: "coinbase",
      quote_currency: "USD",
      direction: "long",
      entry: {
        mode: "activation_capture",
        price: null,
        observed_at: null,
        source: null,
        market_session: null,
        symbol_period_id: null,
        provider_symbol: null,
        observation_ref: null,
        capture_ref: "CAP_TRIGGER_CLOSE",
      },
      exit_variable_ref: "VAR_END_CLOSE",
      target: null,
    }],
    clock: {
      starts_at: "2026-07-15T00:00:00Z",
      settle_at: null,
      end_event_ref: "EVENT_btc-halving-next",
      interval: "1d",
      timezone: "UTC",
      session: "continuous",
      outcome_source: "warm_candle",
      selection: "first_sealed_after_event",
      origin: "provider_official",
      adjustment: "unadjusted",
      max_observation_delay_seconds: 86400,
    },
    direction_threshold_bps: 0,
    long_short: null,
  };
  item.outcome = {
    observation_mode: "first_sealed_bar_after_event",
    observed_at: null,
    window_start: null,
    window_end: null,
    event_ref: "EVENT_btc-halving-next",
    expression: canonical_execution_expression(item.execution_profile),
  };
  Object.assign(item.lifecycle, {
    initial_state: "pending_activation",
    terminal_states: ["succeeded", "failed", "expired_untriggered", "manual_review"],
  });
  Object.assign(item.resolution, {
    primary_source_refs: ["source:cuebook-btc-utc-d1", "source:bitcoin-chain"],
    fallback_source_refs: ["source:coinbase-btc-usd-d1"],
    zero_division_policy: "manual_review",
    observation_order: "event_time",
  });
  item.public_math.one_line = "BTC 日线站上 65,000 且成交量不低于前 20 日均量后生效；下次减半后首根完整日线高于触发收盘价则成功。";
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function singleDirectionFormula() {
  const item = baseFormula();
  const profile = item.execution_profile;
  Object.assign(profile, {
    formula_family: "single_asset_direction",
    direction_threshold_bps: 30,
  });
  profile.legs[0].target = null;
  item.outcome.expression = canonical_execution_expression(profile);
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function pairPriceTargetsFormula() {
  const item = baseFormula();
  const profile = item.execution_profile;
  Object.assign(profile, { formula_family: "pair_asset_price_targets", aggregation: "all" });
  profile.legs.push(
    executionLeg(
      "B",
      303,
      NVDA_INSTRUMENT,
      NVDA_PERIOD,
      "nvda",
      "210.00",
      "VAR_B_END_CLOSE",
      "long",
      { metric: "price", operator: "gte", value: "220.00", unit: "USD" },
    ),
  );
  item.variables.push(variable("VAR_B_END_CLOSE", "P_B,H", { instrumentRef: NVDA_INSTRUMENT }));
  item.outcome.expression = canonical_execution_expression(profile);
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function pairDirectionFormula() {
  const item = pairPriceTargetsFormula();
  const profile = item.execution_profile;
  Object.assign(profile, {
    formula_family: "pair_asset_direction",
    direction_threshold_bps: 30,
  });
  for (const leg of profile.legs) leg.target = null;
  item.outcome.expression = canonical_execution_expression(profile);
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function longShortFormula() {
  const item = pairPriceTargetsFormula();
  const profile = item.execution_profile;
  Object.assign(profile, {
    formula_family: "pair_asset_direction",
    aggregation: "long_short",
    direction_threshold_bps: null,
    long_short: {
      long_leg_id: "A",
      short_leg_id: "B",
      operator: "gt",
      margin_bps: 0,
      weighting: "equal_notional",
      return_basis: "simple_price_return",
      endpoint_alignment: "same_session_close",
      max_entry_skew_seconds: 300,
      fx_policy: "same_quote_currency",
    },
  });
  Object.assign(profile.legs[0], { direction: "long", target: null });
  Object.assign(profile.legs[1], { direction: "short", target: null });
  item.subject.direction = "outperform";
  item.outcome.expression = canonical_execution_expression(profile);
  Object.assign(item.public_math, render_public_math(item));
  return item;
}

function errorCodes(result) {
  return new Set(result.errors.map((entry) => entry.code));
}

test("valid immediate terminal formula", () => {
  const item = baseFormula();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.equal(result.public_math.success_formula, "(P_H > 117.79)");
});

test("valid triggered halving formula", () => {
  const item = btcTriggeredFormula();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.ok(result.public_math.activation_formula.includes("mean_20(V_t,excluding_current)"));
  assert.equal(result.public_math.success_formula, "((((P_H / P_tau) - 1) * 10000) > 0)");
});

test("all four frozen formula families are valid", () => {
  const cases = [
    singleDirectionFormula(),
    baseFormula(),
    pairDirectionFormula(),
    pairPriceTargetsFormula(),
  ];
  assert.deepEqual(
    new Set(cases.map((item) => item.execution_profile.formula_family)),
    FORMULA_FAMILIES,
  );
  for (const item of cases) {
    item.state = "frozen";
    item.lineage.canonical_hash = canonical_hash(item);
    const result = validate(item);
    assert.ok(result.valid, JSON.stringify([item.execution_profile.formula_family, result.errors]));
  }
});

test("pair target compiles to all legs", () => {
  const item = pairPriceTargetsFormula();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.ok(result.public_math.success_formula.includes("AND"));
  assert.ok(result.public_math.success_formula.includes("P_B,H >= 220"));
});

test("long short pair compares synchronized returns", () => {
  const item = longShortFormula();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.ok(result.public_math.success_formula.includes("P_H / 108.7"));
  assert.ok(result.public_math.success_formula.includes("P_B,H / 210"));
});

test("long short pair can win when both assets fall", () => {
  const item = longShortFormula();
  const result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));
  const expression = item.outcome.expression;
  assert.ok(evaluateExpression(expression, {
    VAR_END_CLOSE: "106.526",
    VAR_B_END_CLOSE: "199.5",
  }));
});

test("long short pair requires one long and one short", () => {
  const item = longShortFormula();
  item.execution_profile.legs[1].direction = "long";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("LONG_SHORT_SIDE"));
});

test("execution profile and ast cannot disagree", () => {
  const item = singleDirectionFormula();
  item.outcome.expression.args[1].value = "31";
  Object.assign(item.public_math, render_public_math(item));
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("EXECUTION_EXPRESSION_MISMATCH"));
});

test("frozen price fields use decimal strings", () => {
  const item = baseFormula();
  item.execution_profile.legs[0].target.value = 117.79;
  item.outcome.expression = canonical_execution_expression(item.execution_profile);
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("TARGET_VALUE"));
});

test("subject must bind to primary db instrument", () => {
  const item = baseFormula();
  item.subject.instrument_id = NVDA_INSTRUMENT;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("SUBJECT_BINDING"));
});

test("exit variable must match frozen clock", () => {
  const item = baseFormula();
  item.variables[0].timezone = "UTC";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("EXIT_CLOCK_ALIGNMENT"));
});

test("unknown variable is rejected", () => {
  const item = baseFormula();
  item.outcome.expression.args[0].ref = "VAR_UNKNOWN";
  Object.assign(item.public_math, render_public_math(item));
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("REFERENCE_SHAPE"));
});

test("ready formula requires sealed market observations", () => {
  const item = baseFormula();
  item.variables[0].sealed_only = false;
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("UNSEALED_VARIABLE"));
});

test("untriggered conditional view is not scored as failure", () => {
  const item = btcTriggeredFormula();
  item.lifecycle.untriggered_result = "failed";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("UNTRIGGERED_SCORE"));
});

test("same activation requires aligned market bars", () => {
  const item = btcTriggeredFormula();
  item.variables.find((entry) => entry.id === "VAR_VOLUME").interval = "4h";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("ACTIVATION_ALIGNMENT"));
});

test("public math is deterministic", () => {
  const item = baseFormula();
  item.public_math.success_formula = "P_H maybe above 117.79";
  const result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("PUBLIC_MATH_MISMATCH"));
});

test("frozen formula requires matching hash", () => {
  const item = baseFormula();
  item.state = "frozen";
  item.lineage.canonical_hash = canonical_hash(item);
  let result = validate(item);
  assert.ok(result.valid, JSON.stringify(result.errors));

  item.subject.ticker = "WRONG";
  result = validate(item);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).has("CANONICAL_HASH"));
});
