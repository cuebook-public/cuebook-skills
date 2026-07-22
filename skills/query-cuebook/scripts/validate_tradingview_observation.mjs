#!/usr/bin/env node
// Validate Cuebook's bounded, local-only TradingView research handoff.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/tradingview-observation-v1.schema.json", import.meta.url), "utf8"),
);
const POLICY = JSON.parse(
  readFileSync(new URL("../references/tradingview-tool-policy-v1.json", import.meta.url), "utf8"),
);
const RESEARCH_POLICY = JSON.parse(
  readFileSync(new URL("../references/tradingview-research-policy-v1.json", import.meta.url), "utf8"),
);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function issue(code, path, message) {
  return { code, path, message };
}

export function validatePolicy(policy = POLICY) {
  const errors = [];
  const classes = isObject(policy.classes) ? policy.classes : {};
  const entries = Object.entries(classes).flatMap(([policyClass, tools]) => (
    Array.isArray(tools) ? tools.map((tool) => ({ policyClass, tool })) : []
  ));
  const toolNames = entries.map(({ tool }) => tool);
  const duplicates = [...new Set(toolNames.filter((tool, index) => toolNames.indexOf(tool) !== index))].sort();
  if (duplicates.length) {
    errors.push(issue("POLICY_DUPLICATE_TOOL", "$.classes", `Tools must appear in exactly one class: ${duplicates.join(", ")}.`));
  }
  if (toolNames.length !== policy.upstream?.tool_count) {
    errors.push(issue("POLICY_TOOL_COUNT", "$.upstream.tool_count", `Expected ${policy.upstream?.tool_count ?? "declared"} unique classified Tools, found ${toolNames.length}.`));
  }
  const known = new Set(toolNames);
  for (const tool of policy.default_research_allowlist ?? []) {
    if (!known.has(tool)) errors.push(issue("POLICY_UNKNOWN_DEFAULT", "$.default_research_allowlist", `Unknown default Tool: ${tool}.`));
    if (!(classes.bounded_read ?? []).includes(tool)) {
      errors.push(issue("POLICY_DEFAULT_CLASS", "$.default_research_allowlist", `Default Tool must be bounded_read: ${tool}.`));
    }
  }
  return { valid: !errors.length, errors };
}

function policyLookup(policy = POLICY) {
  return new Map(Object.entries(policy.classes).flatMap(([policyClass, tools]) => (
    tools.map((tool) => [tool, policyClass])
  )));
}

export function validate(payload) {
  const errors = validateInstance(payload, SCHEMA);
  if (!isObject(payload)) return { valid: false, errors };
  errors.push(...validatePolicy().errors, ...validatePolicy(RESEARCH_POLICY).errors);

  const connectorPolicies = {
    desktop: POLICY,
    research: RESEARCH_POLICY,
  };
  const calls = Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
  const callRefs = new Set();
  let successfulReversibleCall = false;

  calls.forEach((call, index) => {
    if (!isObject(call)) return;
    const path = `$.tool_calls[${index}]`;
    if (callRefs.has(call.call_ref)) errors.push(issue("DUPLICATE_CALL_REF", `${path}.call_ref`, "Tool call refs must be unique."));
    callRefs.add(call.call_ref);
    const connectorPolicy = connectorPolicies[call.connector];
    if (!connectorPolicy) {
      errors.push(issue("UNKNOWN_TRADINGVIEW_CONNECTOR", `${path}.connector`, `Unknown TradingView connector: ${call.connector}.`));
      return;
    }
    const expectedClass = policyLookup(connectorPolicy).get(call.tool);
    if (!expectedClass) {
      errors.push(issue("UNKNOWN_TRADINGVIEW_TOOL", `${path}.tool`, `Tool is not in the audited TradingView inventory: ${call.tool}.`));
      return;
    }
    if (call.policy_class !== expectedClass) {
      errors.push(issue("TOOL_POLICY_CLASS", `${path}.policy_class`, `${call.tool} must use policy class ${expectedClass}.`));
    }
    const allowedClasses = new Set(connectorPolicy.cuebook_bridge_policy.allowed_classes);
    const explicitClasses = new Set(connectorPolicy.cuebook_bridge_policy.explicit_intent_required_classes);
    if (!allowedClasses.has(expectedClass)) {
      errors.push(issue("TOOL_BLOCKED_FROM_BRIDGE", `${path}.tool`, `${call.tool} is not callable from the Cuebook research bridge.`));
    }
    if (explicitClasses.has(expectedClass) && !call.user_confirmed) {
      errors.push(issue("TOOL_REQUIRES_INTENT", `${path}.user_confirmed`, `${call.tool} requires explicit creator intent.`));
    }
    if (call.connector === "research" && call.effect !== "external_research") {
      errors.push(issue("RESEARCH_TOOL_EFFECT", `${path}.effect`, "Research-provider Tools must use external_research effect."));
    }
    if (call.connector === "desktop" && call.status === "success" && expectedClass === "reversible_session") successfulReversibleCall = true;
  });
  const researchCalls = calls.filter((call) => isObject(call) && call.connector === "research");
  if (researchCalls.length > RESEARCH_POLICY.cuebook_bridge_policy.max_calls_per_request) {
    errors.push(issue("RESEARCH_CALL_LIMIT", "$.tool_calls", `At most ${RESEARCH_POLICY.cuebook_bridge_policy.max_calls_per_request} targeted research-provider calls are allowed per request.`));
  }
  const researchClassByTool = policyLookup(RESEARCH_POLICY);
  const discoveryCalls = researchCalls.filter((call) => researchClassByTool.get(call.tool) === "on_demand_discovery");
  if (discoveryCalls.length > RESEARCH_POLICY.cuebook_bridge_policy.max_discovery_calls_per_request) {
    errors.push(issue("DISCOVERY_CALL_LIMIT", "$.tool_calls", `At most ${RESEARCH_POLICY.cuebook_bridge_policy.max_discovery_calls_per_request} on-demand scanner is allowed per request.`));
  }

  const identity = isObject(payload.identity) ? payload.identity : {};
  if (identity.mapping_status === "exact") {
    if (!identity.cuebook_asset_ref || !identity.tradingview_symbol) {
      errors.push(issue("EXACT_IDENTITY", "$.identity", "An exact mapping requires both Cuebook and TradingView asset refs."));
    }
    if (identity.proxy_confirmed) errors.push(issue("EXACT_PROXY_FLAG", "$.identity.proxy_confirmed", "An exact mapping is not a proxy."));
  }
  if (identity.mapping_status === "user_confirmed_proxy" && !identity.proxy_confirmed) {
    errors.push(issue("UNCONFIRMED_PROXY", "$.identity.proxy_confirmed", "A proxy mapping requires creator confirmation."));
  }
  if (["ambiguous", "unresolved"].includes(identity.mapping_status) && identity.proxy_confirmed) {
    errors.push(issue("UNRESOLVED_PROXY_FLAG", "$.identity.proxy_confirmed", "Ambiguous or unresolved identity cannot be marked confirmed."));
  }

  const session = isObject(payload.session) ? payload.session : {};
  if (successfulReversibleCall && !payload.request?.explicit_tradingview_intent) {
    errors.push(issue("REVERSIBLE_WITHOUT_INTENT", "$.request.explicit_tradingview_intent", "Successful chart staging requires explicit TradingView intent."));
  }
  if (successfulReversibleCall && !session.changed) {
    errors.push(issue("REVERSIBLE_WITHOUT_CHANGE", "$.session.changed", "A successful reversible Tool call must record a changed session."));
  }
  if (session.restore_mode === "restored" && !session.restoration_verified) {
    errors.push(issue("RESTORE_NOT_VERIFIED", "$.session.restoration_verified", "Restored chart state must be verified."));
  }
  if (session.restore_mode === "preserved_by_user" && !session.preserve_confirmed) {
    errors.push(issue("PRESERVE_NOT_CONFIRMED", "$.session.preserve_confirmed", "Keeping a changed chart state requires creator confirmation."));
  }
  if (session.restore_mode === "not_changed" && session.changed) {
    errors.push(issue("RESTORE_MODE_MISMATCH", "$.session.restore_mode", "A changed session cannot use not_changed."));
  }

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const findingRefs = new Set();
  findings.forEach((finding, index) => {
    if (!isObject(finding)) return;
    if (findingRefs.has(finding.finding_ref)) {
      errors.push(issue("DUPLICATE_FINDING_REF", `$.findings[${index}].finding_ref`, "Finding refs must be unique."));
    }
    findingRefs.add(finding.finding_ref);
    for (const ref of finding.source_call_refs ?? []) {
      if (!callRefs.has(ref)) errors.push(issue("UNKNOWN_FINDING_CALL", `$.findings[${index}].source_call_refs`, `Unknown Tool call ref: ${ref}.`));
    }
  });

  const artifacts = Array.isArray(payload.local_artifacts) ? payload.local_artifacts : [];
  artifacts.forEach((artifact, index) => {
    if (!isObject(artifact)) return;
    if (!callRefs.has(artifact.source_call_ref)) {
      errors.push(issue("UNKNOWN_ARTIFACT_CALL", `$.local_artifacts[${index}].source_call_ref`, `Unknown Tool call ref: ${artifact.source_call_ref}.`));
      return;
    }
    const sourceCall = calls.find((call) => call.call_ref === artifact.source_call_ref);
    if (sourceCall?.connector !== "desktop" || sourceCall?.tool !== "capture_screenshot") {
      errors.push(issue("ARTIFACT_SOURCE_TOOL", `$.local_artifacts[${index}].source_call_ref`, "A TradingView image artifact must come from capture_screenshot."));
    }
    if (/^https?:\/\//iu.test(artifact.locator ?? "")) {
      errors.push(issue("ARTIFACT_NOT_LOCAL", `$.local_artifacts[${index}].locator`, "A TradingView image artifact must remain on the local filesystem."));
    }
    if (artifact.kind === "chart_screenshot" && !/^TVFOCUS_[A-Za-z0-9_-]+$/u.test(artifact.focus_capture_ref ?? "")) {
      errors.push(issue("FOCUS_CAPTURE_REQUIRED", `$.local_artifacts[${index}].focus_capture_ref`, "A chart screenshot requires a validated focused-capture record."));
    }
  });

  const bridge = isObject(payload.publication_bridge) ? payload.publication_bridge : {};
  for (const ref of bridge.creator_hypothesis_refs ?? []) {
    if (!findingRefs.has(ref)) errors.push(issue("UNKNOWN_HYPOTHESIS_REF", "$.publication_bridge.creator_hypothesis_refs", `Unknown finding ref: ${ref}.`));
  }
  if (bridge.status === "ready_from_cuebook_sources" && !(bridge.cuebook_result_refs?.length > 0)) {
    errors.push(issue("FRAME_WITHOUT_CUEBOOK_SOURCE", "$.publication_bridge.cuebook_result_refs", "A ready Frame bridge requires at least one Cuebook-backed result ref."));
  }
  if (bridge.status === "requires_cuebook_rerender" && !(bridge.warnings?.length > 0)) {
    errors.push(issue("RERENDER_WITHOUT_WARNING", "$.publication_bridge.warnings", "A required Cuebook rerender must explain the local-only boundary."));
  }

  if (payload.state === "complete" && calls.some((call) => call.status !== "success")) {
    errors.push(issue("COMPLETE_WITH_FAILED_CALL", "$.state", "A complete observation cannot contain unavailable or failed calls."));
  }
  if (payload.state === "blocked" && findings.length) {
    errors.push(issue("BLOCKED_WITH_FINDINGS", "$.findings", "A blocked observation cannot present findings."));
  }
  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_tradingview_observation.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
