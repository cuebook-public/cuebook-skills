#!/usr/bin/env node
// Validate effect-first routing across Query, TradingView, Frame, and Paper.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/cuebook-intent-v1.schema.json", import.meta.url), "utf-8"),
);

const ROUTES = Object.freeze({
  query: { module: "query", effects: ["read_only"], artifacts: ["answer", "comparison", "source_bundle", "data_table", "factual_chart", "history_view"], gates: [] },
  tradingview_observation: { module: "query", effects: ["reversible_local"], artifacts: ["tradingview_observation"], gates: [] },
  tradingview_focused_capture: { module: "query", effects: ["local_artifact"], artifacts: ["tradingview_focused_capture"], gates: [] },
  frame_native_preview: { module: "create", effects: ["local_artifact"], artifacts: ["frame_preview"], gates: ["expression"] },
  frame_attributed_snapshot_preview: { module: "create", effects: ["local_artifact"], artifacts: ["frame_preview"], gates: ["expression", "snapshot_pixel_use"] },
  frame_publication: { module: "create", effects: ["public_write"], artifacts: ["frame_publication"], gates: ["publication"], dependencyBranches: ["frame_native_preview", "frame_attributed_snapshot_preview"] },
  tradingview_canvas: { module: "create", effects: ["local_persistent_write"], artifacts: ["tradingview_canvas"], gates: ["drawing_plan"] },
  frame_correction: { module: "create", effects: ["public_write"], artifacts: ["frame_correction"], gates: ["publication"] },
  frame_withdrawal: { module: "create", effects: ["destructive_write"], artifacts: ["frame_withdrawal"], gates: ["withdrawal_consent"] },
});

const WRITE_EFFECTS = new Set(["local_persistent_write", "public_write", "destructive_write"]);

function issue(code, path, message) {
  return { code, path, message };
}

export function validate(payload) {
  const errors = validateInstance(payload, SCHEMA);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors };
  }

  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const stepIds = steps.map((step) => step?.step_id).filter(Boolean);
  if (stepIds.length !== new Set(stepIds).size) {
    errors.push(issue("DUPLICATE_STEP_ID", "$.steps", "Intent step IDs must be unique."));
  }

  const prior = new Map();
  steps.forEach((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) return;
    const path = `$.steps[${index}]`;
    const route = ROUTES[step.branch];
    if (route) {
      if (step.module !== route.module) {
        errors.push(issue("ROUTE_MODULE", `${path}.module`, `${step.branch} must route through ${route.module}.`));
      }
      if (!route.effects.includes(step.effect)) {
        errors.push(issue("ROUTE_EFFECT", `${path}.effect`, `${step.branch} cannot use effect ${step.effect}.`));
      }
      if (!route.artifacts.includes(step.artifact)) {
        errors.push(issue("ROUTE_ARTIFACT", `${path}.artifact`, `${step.branch} cannot produce ${step.artifact}.`));
      }
      const gates = new Set(Array.isArray(step.confirmation_gates) ? step.confirmation_gates : []);
      for (const gate of route.gates) {
        if (!gates.has(gate)) {
          errors.push(issue("MISSING_CONFIRMATION_GATE", `${path}.confirmation_gates`, `${step.branch} requires ${gate}.`));
        }
      }
      const extraGates = [...gates].filter((gate) => !route.gates.includes(gate));
      if (extraGates.length) {
        errors.push(issue("EXTRA_CONFIRMATION_GATE", `${path}.confirmation_gates`, `${step.branch} has unrelated confirmation gates: ${extraGates.join(", ")}.`));
      }
      if (route.dependencyBranches) {
        const dependencies = (Array.isArray(step.depends_on) ? step.depends_on : []).map((id) => prior.get(id)).filter(Boolean);
        if (!dependencies.some((dependency) => route.dependencyBranches.includes(dependency.branch))) {
          errors.push(issue("MISSING_ROUTE_DEPENDENCY", `${path}.depends_on`, `${step.branch} requires a prior ${route.dependencyBranches.join(" or ")} step.`));
        }
      }
    }

    for (const dependencyId of Array.isArray(step.depends_on) ? step.depends_on : []) {
      if (!prior.has(dependencyId)) {
        errors.push(issue("INVALID_STEP_DEPENDENCY", `${path}.depends_on`, `Dependency ${dependencyId} must name an earlier step.`));
      }
    }
    if (WRITE_EFFECTS.has(step.effect) && step.explicitness !== "explicit") {
      errors.push(issue("WRITE_NOT_EXPLICIT", `${path}.explicitness`, "Persistent, private, public, and destructive writes require explicit user intent."));
    }
    if (step.step_id) prior.set(step.step_id, step);
  });

  if (payload.defaulted_to_query) {
    const [step] = steps;
    const validDefault = steps.length === 1
      && step?.branch === "query"
      && step?.module === "query"
      && step?.artifact === "answer"
      && step?.effect === "read_only"
      && step?.explicitness === "ambiguous"
      && Array.isArray(step?.confirmation_gates)
      && step.confirmation_gates.length === 0;
    if (!validDefault) {
      errors.push(issue("UNSAFE_AMBIGUOUS_DEFAULT", "$.defaulted_to_query", "Ambiguous intent may default only to one read-only Query answer step."));
    }
  } else if (steps.some((step) => step?.explicitness === "ambiguous")) {
    errors.push(issue("AMBIGUOUS_WITHOUT_DEFAULT", "$.steps", "Ambiguous routing must declare defaulted_to_query and remain read-only."));
  }

  return { valid: errors.length === 0, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_cuebook_intent.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf-8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
