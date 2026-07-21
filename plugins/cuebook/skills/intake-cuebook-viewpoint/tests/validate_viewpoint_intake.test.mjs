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
        value: "30D",
        intent: { kind: "duration", value: 30, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
        provenance: "elicited",
      },
      price_anchor: { value: null, currency: null, kind: null, operator: null, provenance: "missing" },
      settlement: { family: "single_asset_direction", threshold_bps: "0", provenance: "policy_default" },
    },
    elicitation_log: [
      { round: 1, asked: ["asset", "horizon"], prompt_text: "Which asset should carry the view (USO / CL / XLE), and for how long (48H / 30D / 90D)?", answered_verbatim: "USO, about one month" },
      { round: 2, asked: ["intuition"], prompt_text: "You mentioned Hormuz; which intuition matters most? If there is nothing more, say proceed with this.", answered_verbatim: "The risk premium will move before an actual supply interruption" },
    ],
    verification: {
      asset_resolution: { status: "pass", method: "search_assets", resolved_ref: "asset:uso", note: null },
      horizon_validity: { status: "pass", note: "30 calendar days within 1h-6mo bounds." },
      direction_consistency: { status: "pass", note: "Will rise matches long." },
      price_sanity: { status: "skipped", reference_price: null, deviation_pct: null, note: "No anchor requested." },
      target_direction: { status: "skipped", reference_price: null, note: "No target price." },
    },
    confirmation: { card_text: "USO · 30D · Bullish · Basis: Hormuz shipping risk", confirmed: true, confirmed_at: "2026-07-16T10:02:00+08:00" },
    handback: {
      target: "compile-cuebook-market-view-semantics",
      eligible: true,
      seed: {
        claim_gist: "Oil prices first absorb the Hormuz shipping risk premium",
        because_gist: "Tighter channel rules move rerouting and insurance costs first",
        asset_ref: "asset:uso",
        pair_asset_ref: null,
        direction: "long",
        horizon_intent: { kind: "duration", value: 30, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
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
