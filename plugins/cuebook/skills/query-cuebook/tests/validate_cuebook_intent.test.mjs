import test from "node:test";
import assert from "node:assert/strict";

import { validate } from "../scripts/validate_cuebook_intent.mjs";

function step(overrides = {}) {
  return {
    step_id: "STEP_query",
    module: "query",
    branch: "query",
    artifact: "answer",
    effect: "read_only",
    explicitness: "explicit",
    confirmation_gates: [],
    depends_on: [],
    ...overrides,
  };
}

function intent(steps, overrides = {}) {
  return {
    schema_version: "cuebook-intent-v1",
    intent_id: "INTENT_test",
    raw_text: "Inspect this chart and turn the approved result into a Frame.",
    defaulted_to_query: false,
    steps,
    ...overrides,
  };
}

test("routes a mixed TradingView snapshot and Frame publication in dependency order", () => {
  const payload = intent([
    step({ step_id: "STEP_observe", branch: "tradingview_observation", artifact: "tradingview_observation", effect: "reversible_local" }),
    step({ step_id: "STEP_capture", branch: "tradingview_focused_capture", artifact: "tradingview_focused_capture", effect: "local_artifact", depends_on: ["STEP_observe"] }),
    step({ step_id: "STEP_preview", module: "create", branch: "frame_attributed_snapshot_preview", artifact: "frame_preview", effect: "local_artifact", confirmation_gates: ["expression", "snapshot_pixel_use"], depends_on: ["STEP_capture"] }),
    step({ step_id: "STEP_publish", module: "create", branch: "frame_publication", artifact: "frame_publication", effect: "public_write", confirmation_gates: ["publication"], depends_on: ["STEP_preview"] }),
  ]);
  assert.deepEqual(validate(payload), { valid: true, errors: [] });
});

test("ambiguous requests default to one read-only Query answer", () => {
  const payload = intent([
    step({ explicitness: "ambiguous" }),
  ], { defaulted_to_query: true, raw_text: "\u5e2e\u6211\u770b\u770b" });
  assert.ok(validate(payload).valid);

  payload.steps.push(step({ step_id: "STEP_publish", module: "create", branch: "frame_publication", artifact: "frame_publication", effect: "public_write", explicitness: "ambiguous", confirmation_gates: ["publication"] }));
  const codes = new Set(validate(payload).errors.map((error) => error.code));
  assert.ok(codes.has("UNSAFE_AMBIGUOUS_DEFAULT"));
  assert.ok(codes.has("WRITE_NOT_EXPLICIT"));
});

test("rejects publication without a prior preview and rejects invented gates", () => {
  const payload = intent([
    step({ step_id: "STEP_publish", module: "create", branch: "frame_publication", artifact: "frame_publication", effect: "public_write", confirmation_gates: ["publication", "paper_placement"] }),
  ]);
  const codes = new Set(validate(payload).errors.map((error) => error.code));
  assert.ok(codes.has("MISSING_ROUTE_DEPENDENCY"));
  assert.ok(codes.has("EXTRA_CONFIRMATION_GATE"));
});

test("rejects forward dependencies and implicit writes", () => {
  const payload = intent([
    step({ step_id: "STEP_canvas", module: "create", branch: "tradingview_canvas", artifact: "tradingview_canvas", effect: "local_persistent_write", explicitness: "implied", confirmation_gates: ["drawing_plan"], depends_on: ["STEP_later"] }),
    step({ step_id: "STEP_later" }),
  ]);
  const codes = new Set(validate(payload).errors.map((error) => error.code));
  assert.ok(codes.has("INVALID_STEP_DEPENDENCY"));
  assert.ok(codes.has("WRITE_NOT_EXPLICIT"));
});
