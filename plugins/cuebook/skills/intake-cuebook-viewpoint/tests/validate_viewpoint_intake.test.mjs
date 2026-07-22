import test from "node:test";
import assert from "node:assert/strict";

import * as VALIDATOR from "../scripts/validate_viewpoint_intake.mjs";

function intake() {
  return {
    schema_version: "viewpoint-intake-v1",
    intake_id: "VINT_uso_20260716",
    state: "handed_back",
    raw_input: { text: "I think oil prices will rise soon because Hormuz is unstable", language: "en", received_at: "2026-07-16T10:00:00+08:00" },
    triage: { intent: "express_view", query_route: null, reason: "First-person directional judgment with a mechanism." },
    fields: {
      asset: { value: "asset:uso", display: "USO", candidates: [], provenance: "elicited" },
      pair_asset: null,
      direction: { value: "long", provenance: "stated" },
      horizon: {
        value: "14D",
        intent: { kind: "duration", value: 14, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
        provenance: "elicited",
      },
      price_anchor: { value: null, currency: null, kind: null, operator: null, provenance: "missing" },
      settlement: { family: "single_asset_direction", threshold_bps: "0", provenance: "policy_default" },
    },
    elicitation_log: [
      { round: 1, asked: ["asset", "horizon"], prompt_text: "Which asset should carry the view (USO / CL / XLE), and how long should it be tested—or should Cuebook suggest a horizon?", answered_verbatim: "USO, for two weeks" },
      { round: 2, asked: ["intuition"], prompt_text: "You mentioned Hormuz; which intuition matters most? If there is nothing more, say proceed with this.", answered_verbatim: "The risk premium will move before an actual supply interruption" },
    ],
    verification: {
      asset_resolution: { status: "pass", method: "search_assets", resolved_ref: "asset:uso", note: null },
      horizon_validity: { status: "pass", note: "14 calendar days within 1h-6mo bounds." },
      direction_consistency: { status: "pass", note: "Will rise matches long." },
      price_sanity: { status: "skipped", reference_price: null, deviation_pct: null, note: "No anchor requested." },
      target_direction: { status: "skipped", reference_price: null, note: "No target price." },
    },
    confirmation: { card_text: "USO · 14D · Bullish · Basis: Hormuz shipping risk", confirmed: true, confirmed_at: "2026-07-16T10:02:00+08:00" },
    handback: {
      target: "compile-cuebook-market-view-semantics",
      eligible: true,
      seed: {
        claim_gist: "Oil prices first absorb the Hormuz shipping risk premium",
        because_gist: "Tighter channel rules move rerouting and insurance costs first",
        asset_ref: "asset:uso",
        pair_asset_ref: null,
        direction: "long",
        horizon_intent: { kind: "duration", value: 14, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
        settlement_family: "single_asset_direction",
        threshold_bps: "0",
        target_price: null,
        target_operator: null,
      },
      blockers: [],
    },
  };
}

function codes(payload) {
  return new Set(VALIDATOR.validate(payload).errors.map((item) => item.code));
}

test("valid handed back intake", () => {
  const result = VALIDATOR.validate(intake());
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("three fields in one round is rejected", () => {
  const payload = intake();
  payload.elicitation_log[0].asked = ["asset", "horizon", "price_anchor"];
  assert.equal(VALIDATOR.validate(payload).valid, false);
});

test("creator may skip the one-round interview without blocking handback", () => {
  const payload = intake();
  payload.elicitation_log[1] = {
    round: 2,
    asked: ["news_signal", "intuition"],
    prompt_text: "Is there any news, signal, or intuition to preserve? Otherwise say proceed with this.",
    answered_verbatim: "Proceed with this",
  };
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("creation handback may delegate standard settlement to the downstream meaning lock", () => {
  const payload = intake();
  payload.fields.settlement = { family: null, threshold_bps: null, provenance: "missing" };
  payload.elicitation_log = payload.elicitation_log.filter((entry) => !entry.asked.includes("settlement"));
  payload.handback.target = "create-cuebook-content";
  Object.assign(payload.handback.seed, {
    settlement_family: null,
    threshold_bps: null,
    target_price: null,
    target_operator: null,
  });
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("creator interview must precede settlement and price questions", () => {
  const payload = intake();
  payload.elicitation_log[1].round = 3;
  payload.elicitation_log.push({
    round: 2,
    asked: ["price_anchor"],
    prompt_text: "Do you want a target price?",
    answered_verbatim: "No",
  });
  assert.ok(codes(payload).has("CREATOR_INTERVIEW_ORDER"));
});

test("standard single-asset deadline settlement needs no settlement prompt", () => {
  const payload = intake();
  assert.equal(payload.fields.horizon.intent.session_policy, "at_instant");
  assert.equal(payload.fields.settlement.provenance, "policy_default");
  assert.equal(payload.elicitation_log.some((entry) => entry.asked.includes("settlement")), false);
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("range requires and preserves the creator-confirmed symmetric terminal band", () => {
  const payload = intake();
  payload.fields.direction = { value: "range", provenance: "stated" };
  payload.fields.settlement = {
    family: "single_asset_range",
    threshold_bps: null,
    max_abs_move_bps: "500",
    provenance: "elicited",
  };
  payload.elicitation_log.push({
    round: 3,
    asked: ["range_band"],
    prompt_text: "At the deadline, what plus-or-minus range should count as not moving much?",
    answered_verbatim: "Plus or minus 5 percent.",
  });
  payload.confirmation.card_text = "USO · 14D · RANGE ±5% · terminal check";
  Object.assign(payload.handback.seed, {
    direction: "range",
    settlement_family: "single_asset_range",
    threshold_bps: null,
    max_abs_move_bps: "500",
  });

  let result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.fields.settlement.max_abs_move_bps = null;
  result = VALIDATOR.validate(payload);
  assert.ok(codes(payload).has("RANGE_BAND_REQUIRED"));
});

test("range band cannot be supplied as an unconfirmed policy default", () => {
  const payload = intake();
  payload.fields.direction = { value: "range", provenance: "stated" };
  payload.fields.settlement = {
    family: "single_asset_range",
    threshold_bps: null,
    max_abs_move_bps: "300",
    provenance: "policy_default",
  };
  Object.assign(payload.handback.seed, {
    direction: "range",
    settlement_family: "single_asset_range",
    threshold_bps: null,
    max_abs_move_bps: "300",
  });
  const found = codes(payload);
  assert.ok(found.has("RANGE_BAND_UNCONFIRMED"));
  assert.ok(found.has("RANGE_BAND_PROVENANCE"));
});

test("policy_default cannot select a target or pair family", () => {
  let payload = intake();
  payload.fields.settlement.family = "single_asset_price_target";
  assert.ok(codes(payload).has("SETTLEMENT_POLICY_DEFAULT"));

  payload = intake();
  payload.fields.horizon.intent.session_policy = "next_eligible_close";
  payload.handback.seed.horizon_intent.session_policy = "next_eligible_close";
  assert.ok(codes(payload).has("SETTLEMENT_POLICY_DEFAULT"));

  payload = intake();
  payload.fields.horizon.intent.unit = "market_session";
  payload.handback.seed.horizon_intent.unit = "market_session";
  assert.ok(codes(payload).has("SETTLEMENT_POLICY_DEFAULT"));

  payload = intake();
  payload.fields.direction.value = "relative";
  payload.handback.seed.direction = "relative";
  assert.ok(codes(payload).has("SETTLEMENT_POLICY_DEFAULT"));
});

test("creator interview cannot turn into a repeated questionnaire", () => {
  const payload = intake();
  payload.elicitation_log.push({
    round: 4,
    asked: ["news_signal"],
    prompt_text: "Any other signal?",
    answered_verbatim: "No",
  });
  assert.ok(codes(payload).has("CREATOR_INTERVIEW_ROUNDS"));
});

test("elicited field requires a logged round", () => {
  const payload = intake();
  payload.elicitation_log = [];
  assert.ok(codes(payload).has("ELICITED_WITHOUT_LOG"));
});

test("handback requires confirmation", () => {
  const payload = intake();
  payload.confirmation.confirmed = false;
  assert.ok(codes(payload).has("HANDBACK_UNCONFIRMED"));
});

test("settled state requires required fields and verification", () => {
  let payload = intake();
  payload.fields.direction = { value: null, provenance: "missing" };
  const found = codes(payload);
  assert.ok(found.has("REQUIRED_FIELD_MISSING"));

  payload = intake();
  payload.verification.asset_resolution.status = "unavailable";
  assert.ok(codes(payload).has("VERIFICATION_INCOMPLETE"));

  payload = intake();
  payload.fields.horizon.intent = null;
  assert.ok(codes(payload).has("HORIZON_NOT_STRUCTURED"));
});

test("horizon bounds one hour to six months", () => {
  let payload = intake();
  payload.fields.horizon.intent = { kind: "duration", value: 200, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" };
  assert.ok(codes(payload).has("HORIZON_BOUNDS"));

  payload = intake();
  payload.fields.horizon.intent = { kind: "instant", requested_settle_at: "2026-07-16T10:30:00+08:00", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" };
  assert.ok(codes(payload).has("HORIZON_BOUNDS"));

  payload = intake();
  payload.fields.horizon.intent = { kind: "duration", value: 48, unit: "hour", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" };
  assert.ok(!codes(payload).has("HORIZON_BOUNDS"));
});

test("Cue-informed horizon remains a proposal until the creator accepts it", () => {
  const payload = intake();
  payload.fields.horizon = {
    value: "through the August CPI release",
    intent: { kind: "instant", requested_settle_at: "2026-08-12T20:30:00+08:00", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
    provenance: "inferred_confirmed",
  };
  payload.handback.seed.horizon_intent = payload.fields.horizon.intent;
  payload.elicitation_log[0] = {
    round: 1,
    asked: ["asset", "horizon"],
    prompt_text: "Which asset carries the view, and should Cuebook suggest a horizon from its Cues and catalysts?",
    answered_verbatim: "USO. Yes—use the CPI date you proposed.",
  };
  let result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.elicitation_log[0].asked = ["asset"];
  assert.ok(codes(payload).has("ELICITED_WITHOUT_LOG"));

  payload.elicitation_log[0].asked = ["asset", "horizon"];
  payload.confirmation.confirmed = false;
  assert.ok(codes(payload).has("HANDBACK_UNCONFIRMED"));
});

test("new creator horizons reject market-session and next-close clocks", () => {
  let payload = intake();
  payload.fields.horizon.intent.session_policy = "next_eligible_close";
  payload.handback.seed.horizon_intent.session_policy = "next_eligible_close";
  assert.ok(codes(payload).has("HORIZON_CREATOR_CLOCK"));

  payload = intake();
  payload.fields.horizon.intent.unit = "market_session";
  payload.handback.seed.horizon_intent.unit = "market_session";
  assert.ok(codes(payload).has("HORIZON_CREATOR_CLOCK"));
});

test("long target below reference is a conflict", () => {
  const payload = intake();
  payload.fields.settlement = { family: "single_asset_price_target", threshold_bps: null, provenance: "elicited" };
  payload.fields.price_anchor = { value: 500.0, currency: "USD", kind: "target", operator: "gte", provenance: "stated" };
  payload.verification.target_direction = { status: "pass", reference_price: 550.0, note: "checked against get_market_state" };
  Object.assign(payload.handback.seed, { settlement_family: "single_asset_price_target", threshold_bps: null, target_price: 500.0, target_operator: "gte" });
  assert.ok(codes(payload).has("TARGET_DIRECTION_CONFLICT"));

  payload.fields.direction = { value: "short", provenance: "elicited" };
  payload.fields.price_anchor.operator = "lte";
  payload.handback.seed.direction = "short";
  payload.elicitation_log.push({ round: 4, asked: ["direction"], prompt_text: "500 is below the current 550 price—do you mean a short?", answered_verbatim: "Yes, short" });
  const found = codes(payload);
  assert.ok(!found.has("TARGET_DIRECTION_CONFLICT"));
});

test("target operator must match direction", () => {
  const payload = intake();
  payload.fields.price_anchor = { value: 90.0, currency: "USD", kind: "target", operator: "lte", provenance: "stated" };
  assert.ok(codes(payload).has("TARGET_OPERATOR_DIRECTION"));
});

test("pair family requires second asset", () => {
  const payload = intake();
  payload.fields.direction = { value: "relative", provenance: "stated" };
  payload.fields.settlement = { family: "pair_asset_direction", threshold_bps: "0", provenance: "elicited" };
  assert.ok(codes(payload).has("PAIR_ASSET_MISSING"));

  payload.fields.pair_asset = { value: "asset:xle", display: "XLE", candidates: [], provenance: "elicited" };
  payload.elicitation_log.push({ round: 4, asked: ["pair_asset"], prompt_text: "Relative to what?", answered_verbatim: "XLE" });
  assert.ok(!codes(payload).has("PAIR_ASSET_MISSING"));
});

test("relative view preserves expected winner, underperformer, and zero spread", () => {
  const payload = intake();
  payload.raw_input.text = "I think NVDA will outperform TSLA over the next two weeks";
  payload.fields.asset = { value: "asset:nvda", display: "NVDA", candidates: [], provenance: "stated" };
  payload.fields.pair_asset = { value: "asset:tsla", display: "TSLA", candidates: [], provenance: "stated" };
  payload.fields.direction = { value: "relative", provenance: "stated" };
  payload.fields.settlement = { family: "pair_asset_direction", threshold_bps: "0", provenance: "stated" };
  payload.verification.asset_resolution.resolved_ref = "asset:nvda";
  payload.confirmation.card_text = "NVDA over TSLA · 14D · hit when NVDA's return is higher";
  Object.assign(payload.handback.seed, {
    claim_gist: "NVDA should outperform TSLA",
    asset_ref: "asset:nvda",
    pair_asset_ref: "asset:tsla",
    direction: "relative",
    settlement_family: "pair_asset_direction",
    threshold_bps: "0",
  });

  let result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.fields.pair_asset.value = "NVDA";
  result = VALIDATOR.validate(payload);
  assert.ok(result.errors.some((error) => error.code === "PAIR_ASSETS_IDENTICAL"));
});

test("relative handback cannot reverse the creator-confirmed pair", () => {
  const payload = intake();
  payload.fields.asset = { value: "asset:nvda", display: "NVDA", candidates: [], provenance: "stated" };
  payload.fields.pair_asset = { value: "asset:tsla", display: "TSLA", candidates: [], provenance: "stated" };
  payload.fields.direction = { value: "relative", provenance: "stated" };
  payload.fields.settlement = { family: "pair_asset_direction", threshold_bps: "0", provenance: "stated" };
  Object.assign(payload.handback.seed, {
    asset_ref: "asset:tsla",
    pair_asset_ref: "asset:nvda",
    direction: "relative",
    settlement_family: "pair_asset_direction",
    threshold_bps: "0",
  });
  assert.ok(codes(payload).has("PAIR_HANDBACK_MISMATCH"));
});

function compoundIntake() {
  const payload = intake();
  payload.raw_input.text = "I think TSLA rises while NVDA stays within plus or minus five percent over two weeks";
  payload.fields.asset = { value: "asset:tsla", display: "TSLA", candidates: [], provenance: "stated" };
  payload.fields.pair_asset = { value: "asset:nvda", display: "NVDA", candidates: [], provenance: "stated" };
  payload.fields.direction = { value: "compound", provenance: "stated" };
  payload.fields.primary_direction = { value: "long", provenance: "stated" };
  payload.fields.pair_direction = { value: "range", provenance: "stated" };
  payload.fields.settlement = {
    family: "pair_asset_conditions",
    threshold_bps: "0",
    pair_threshold_bps: null,
    max_abs_move_bps: null,
    pair_max_abs_move_bps: "500",
    provenance: "elicited",
  };
  payload.elicitation_log.push({
    round: 3,
    asked: ["pair_range_band"],
    prompt_text: "At the deadline, what plus-or-minus range should count as NVDA not moving much?",
    answered_verbatim: "Plus or minus five percent.",
  });
  payload.verification.asset_resolution.resolved_ref = "asset:tsla";
  payload.confirmation.card_text = "TSLA rises AND NVDA stays within ±5% · 14D · both conditions must hold";
  Object.assign(payload.handback.seed, {
    claim_gist: "TSLA rises while NVDA stays quiet",
    asset_ref: "asset:tsla",
    pair_asset_ref: "asset:nvda",
    direction: "compound",
    primary_direction: "long",
    pair_direction: "range",
    settlement_family: "pair_asset_conditions",
    threshold_bps: "0",
    pair_threshold_bps: null,
    max_abs_move_bps: null,
    pair_max_abs_move_bps: "500",
  });
  return payload;
}

test("compound view preserves two independent conditions and requires both", () => {
  const payload = compoundIntake();
  let result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.fields.settlement.pair_max_abs_move_bps = null;
  assert.ok(codes(payload).has("PAIR_RANGE_BAND_REQUIRED"));
});

test("compound handback cannot drop or rewrite either leg", () => {
  const payload = compoundIntake();
  payload.handback.seed.pair_direction = "short";
  assert.ok(codes(payload).has("COMPOUND_HANDBACK_MISMATCH"));
});

test("two directional independent conditions reuse all-legs pair direction", () => {
  const payload = compoundIntake();
  payload.fields.pair_direction = { value: "short", provenance: "stated" };
  payload.fields.settlement = {
    family: "pair_asset_direction",
    threshold_bps: "0",
    pair_threshold_bps: "0",
    max_abs_move_bps: null,
    pair_max_abs_move_bps: null,
    provenance: "stated",
  };
  Object.assign(payload.handback.seed, {
    pair_direction: "short",
    settlement_family: "pair_asset_direction",
    pair_threshold_bps: "0",
    pair_max_abs_move_bps: null,
  });
  payload.elicitation_log = payload.elicitation_log.filter((entry) => !entry.asked.includes("pair_range_band"));
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.fields.settlement.family = "pair_asset_conditions";
  assert.ok(codes(payload).has("COMPOUND_FAMILY_MISMATCH"));
});

test("compound aliases cannot resolve to the same asset", () => {
  const payload = compoundIntake();
  payload.fields.pair_asset.value = "TSLA";
  assert.ok(codes(payload).has("PAIR_ASSETS_IDENTICAL"));
});

test("direction threshold must be explicit", () => {
  const payload = intake();
  payload.fields.settlement.threshold_bps = null;
  assert.ok(codes(payload).has("THRESHOLD_NOT_EXPLICIT"));
});

test("non settleable direction cannot carry family", () => {
  const payload = intake();
  payload.fields.direction = { value: "watch", provenance: "stated" };
  assert.ok(codes(payload).has("NON_SETTLEABLE_DIRECTION"));
});

test("blocked terminal requires reasons and no handback", () => {
  const payload = intake();
  payload.state = "blocked";
  payload.handback = { target: "none", eligible: false, seed: null, blockers: ["The user insists on a long view but the target is below the current price, so direction and target conflict"] };
  payload.confirmation = { card_text: null, confirmed: false, confirmed_at: null };
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  payload.handback.blockers = [];
  assert.ok(codes(payload).has("BLOCKED_WITHOUT_REASON"));
});

test("query only visitor is never forced into creation", () => {
  const payload = intake();
  payload.triage.intent = "query_only";
  assert.ok(codes(payload).has("QUERY_NOT_FORCED"));
});

test("query routed terminal is valid without fields", () => {
  const payload = intake();
  Object.assign(payload, { state: "query_routed" });
  payload.triage = { intent: "query_only", query_route: "query-cuebook", reason: "Pure lookup of USO stories." };
  payload.fields = {
    asset: { value: null, display: "USO", candidates: [], provenance: "missing" },
    pair_asset: null,
    direction: { value: null, provenance: "missing" },
    horizon: { value: null, intent: null, provenance: "missing" },
    price_anchor: { value: null, currency: null, kind: null, operator: null, provenance: "missing" },
    settlement: { family: null, threshold_bps: null, provenance: "missing" },
  };
  payload.elicitation_log = [];
  payload.verification = {
    asset_resolution: { status: "pending" },
    horizon_validity: { status: "pending" },
    direction_consistency: { status: "pending" },
    price_sanity: { status: "pending" },
    target_direction: { status: "pending" },
  };
  payload.confirmation = { card_text: null, confirmed: false, confirmed_at: null };
  payload.handback = { target: "none", eligible: false, seed: null, blockers: [] };
  const result = VALIDATOR.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("price anchor needs kind and sanity pairing", () => {
  let payload = intake();
  payload.fields.price_anchor = { value: 78.5, currency: "USD", kind: null, operator: null, provenance: "stated" };
  assert.ok(codes(payload).has("PRICE_ANCHOR_KIND"));

  payload = intake();
  payload.verification.price_sanity.status = "pass";
  assert.ok(codes(payload).has("PRICE_SANITY_WITHOUT_ANCHOR"));
});

test("eligible handback requires seed", () => {
  const payload = intake();
  payload.handback.seed = null;
  assert.ok(codes(payload).has("HANDBACK_SEED"));
});
