import test from "node:test";
import assert from "node:assert/strict";

import { validate, validatePolicy } from "../scripts/validate_tradingview_observation.mjs";

function observation() {
  return {
    schema_version: "tradingview-observation-v1",
    observation_id: "TVOBS_btc_daily",
    state: "complete",
    observed_at: "2026-07-22T10:00:00+08:00",
    request: {
      raw_text: "Use my TradingView BTC chart to review momentum before we make a Frame.",
      purpose: "frame_support",
      asset_input: "BTC",
      timeframe: "D",
      time_window: "90d",
      explicit_tradingview_intent: true
    },
    identity: {
      mapping_status: "exact",
      cuebook_asset_ref: "asset:btc",
      tradingview_symbol: "COINBASE:BTCUSD",
      venue: "COINBASE",
      currency: "USD",
      instrument_type: "spot",
      proxy_confirmed: false
    },
    session: {
      initial_state: {symbol: "COINBASE:BTCUSD", timeframe: "D", chart_type: "Candles"},
      final_state: {symbol: "COINBASE:BTCUSD", timeframe: "D", chart_type: "Candles"},
      changed: false,
      restore_mode: "not_changed",
      restoration_verified: false,
      preserve_confirmed: false
    },
    tool_calls: [
      {call_ref: "TVCALL_health", connector: "desktop", tool: "tv_health_check", policy_class: "bounded_read", effect: "read_only", user_confirmed: false, status: "success"},
      {call_ref: "TVCALL_state", connector: "desktop", tool: "chart_get_state", policy_class: "bounded_read", effect: "read_only", user_confirmed: false, status: "success"},
      {call_ref: "TVCALL_values", connector: "desktop", tool: "data_get_study_values", policy_class: "bounded_read", effect: "read_only", user_confirmed: false, status: "success"},
      {call_ref: "TVCALL_shot", connector: "desktop", tool: "capture_screenshot", policy_class: "local_artifact", effect: "local_artifact", user_confirmed: true, status: "success"}
    ],
    findings: [
      {
        finding_ref: "TVFIND_momentum",
        kind: "indicator",
        summary: "The creator's visible momentum stack is diverging from the latest price swing.",
        source_call_refs: ["TVCALL_values", "TVCALL_shot"],
        as_of: "2026-07-22T10:00:00+08:00",
        freshness: "current",
        classification: "creator_interpretation"
      }
    ],
    local_artifacts: [
      {artifact_ref: "TVART_chart", kind: "chart_screenshot", locator: "/tmp/tradingview-chart.png", source_call_ref: "TVCALL_shot", focus_capture_ref: "TVFOCUS_btc_daily", usage_rights: "local_analysis_only"}
    ],
    publication_bridge: {
      status: "requires_cuebook_rerender",
      direct_upload_allowed: false,
      raw_data_reuse_allowed: false,
      pine_ip_reuse_allowed: false,
      creator_hypothesis_refs: ["TVFIND_momentum"],
      cuebook_result_refs: [],
      warnings: ["Rebuild every visible curve from Cuebook-backed candles before rendering the Frame."]
    },
    warnings: []
  };
}

test("the audited desktop policy classifies all 84 upstream tools exactly once", () => {
  assert.deepEqual(validatePolicy(), {valid: true, errors: []});
});

test("the audited research policy classifies all 37 upstream tools exactly once", async () => {
  const {readFile} = await import("node:fs/promises");
  const policy = JSON.parse(await readFile(new URL("../references/tradingview-research-policy-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(validatePolicy(policy), {valid: true, errors: []});
});

test("a bounded local TradingView observation is valid", () => {
  assert.equal(validate(observation()).valid, true);
});

test("TradingView pixels and raw data can never become direct Frame media", () => {
  const item = observation();
  item.publication_bridge.direct_upload_allowed = true;
  assert.equal(validate(item).valid, false);
});

test("persistent and security-sensitive tools are blocked from Cuebook research", () => {
  for (const [tool, policyClass] of [["alert_create", "persistent_user_state"], ["ui_evaluate", "security_sensitive"]]) {
    const item = observation();
    item.tool_calls.push({call_ref: `TVCALL_${tool}`, connector: "desktop", tool, policy_class: policyClass, effect: policyClass, user_confirmed: true, status: "success"});
    assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("TOOL_BLOCKED_FROM_BRIDGE"));
  }
});

test("reversible chart staging requires intent and verified restoration", () => {
  const item = observation();
  item.tool_calls.push({call_ref: "TVCALL_symbol", connector: "desktop", tool: "chart_set_symbol", policy_class: "reversible_session", effect: "reversible_session", user_confirmed: true, status: "success"});
  item.session.changed = true;
  item.session.restore_mode = "restored";
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("RESTORE_NOT_VERIFIED"));
  item.session.restoration_verified = true;
  assert.equal(validate(item).valid, true);
});

test("selected network enrichment can add a bounded technical foothold", () => {
  const item = observation();
  item.tool_calls.push({call_ref: "TVCALL_mtf", connector: "research", tool: "multi_timeframe_analysis", policy_class: "selected_enrichment", effect: "external_research", user_confirmed: false, status: "success"});
  item.findings.push({
    finding_ref: "TVFIND_mtf",
    kind: "derived",
    summary: "The provider's computed timeframes disagree, so the setup is not yet aligned.",
    source_call_refs: ["TVCALL_mtf"],
    as_of: "2026-07-22T10:00:00+08:00",
    freshness: "current",
    classification: "derived"
  });
  assert.equal(validate(item).valid, true);
});

test("opaque recommendation synthesis is excluded", () => {
  const item = observation();
  item.tool_calls.push({call_ref: "TVCALL_agents", connector: "research", tool: "multi_agent_analysis", policy_class: "excluded_synthesis", effect: "external_research", user_confirmed: true, status: "success"});
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("TOOL_BLOCKED_FROM_BRIDGE"));
});

test("network research stays within one compact batch", () => {
  const item = observation();
  for (const [index, tool] of ["coin_analysis", "multi_timeframe_analysis", "volume_confirmation_analysis", "stock_options_chain"].entries()) {
    item.tool_calls.push({call_ref: `TVCALL_research_${index}`, connector: "research", tool, policy_class: "selected_enrichment", effect: "external_research", user_confirmed: false, status: "success"});
  }
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("RESEARCH_CALL_LIMIT"));

  const discovery = observation();
  for (const [index, tool] of ["top_gainers", "volume_breakout_scanner"].entries()) {
    discovery.tool_calls.push({call_ref: `TVCALL_discovery_${index}`, connector: "research", tool, policy_class: "on_demand_discovery", effect: "external_research", user_confirmed: true, status: "success"});
  }
  assert.ok(new Set(validate(discovery).errors.map((error) => error.code)).has("DISCOVERY_CALL_LIMIT"));
});

test("TradingView screenshots remain local artifacts", () => {
  const item = observation();
  item.local_artifacts[0].locator = "https://example.com/chart.png";
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("ARTIFACT_NOT_LOCAL"));
});

test("chart screenshots require a high-density focused-capture record", () => {
  const item = observation();
  item.local_artifacts[0].focus_capture_ref = null;
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("FOCUS_CAPTURE_REQUIRED"));
});

test("a proxy must be explicitly accepted", () => {
  const item = observation();
  item.identity.mapping_status = "user_confirmed_proxy";
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("UNCONFIRMED_PROXY"));
  item.identity.proxy_confirmed = true;
  assert.equal(validate(item).valid, true);
});

test("Frame readiness requires independent Cuebook-backed result refs", () => {
  const item = observation();
  item.publication_bridge.status = "ready_from_cuebook_sources";
  item.publication_bridge.warnings = [];
  assert.ok(new Set(validate(item).errors.map((error) => error.code)).has("FRAME_WITHOUT_CUEBOOK_SOURCE"));
  item.publication_bridge.cuebook_result_refs = ["RES_btc_candles"];
  assert.equal(validate(item).valid, true);
});
