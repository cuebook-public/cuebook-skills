import assert from "node:assert/strict";
import test from "node:test";

import { validate } from "../scripts/validate_decision_context_request.mjs";

function request(overrides = {}) {
  return {
    schema_version: "decision-context-request.v2",
    goal_summary: "replay my last arc and challenge the new plan",
    analysis_requests: [
      { lens: "historical_reconstruction", subject_ref: "cuebook://decision/episodes/previous" },
      { lens: "current_context_challenge", subject_ref: "working-context://current-plan" },
    ],
    as_of: "2026-07-23T08:00:00Z",
    current_plan: {
      authority: "client_asserted_current",
      captured_at: "2026-07-23T07:59:00Z",
      thesis: "buying the dip again",
      invalidation: null,
      horizon: "2w",
    },
    ...overrides,
  };
}

test("accepts a bounded multi-lens request, including a non-English goal", () => {
  assert.deepEqual(validate(request()), { valid: true, errors: [] });
  // Multilingual goal text (escaped code points) is display-only input.
  assert.ok(validate(request({ goal_summary: "\u5e2e\u6211\u770b\u770b" })).valid);
});

test("rejects unknown lenses, oversized batches, and too many subjects", () => {
  assert.ok(
    !validate(
      request({
        analysis_requests: [{ lens: "load_everything", subject_ref: "cuebook://x" }],
      }),
    ).valid,
  );
  const five = Array.from({ length: 5 }, (_, index) => ({
    lens: "memory_inspection",
    subject_ref: `cuebook://decision/episodes/0000000${index}-0000-7000-8000-000000000000`,
  }));
  assert.ok(!validate(request({ analysis_requests: five })).valid);
  const subjects = ["a", "b", "c", "d"].map((key) => ({
    lens: "memory_inspection",
    subject_ref: `cuebook://decision/${key}`,
  }));
  const result = validate(request({ analysis_requests: subjects.slice(0, 4) }));
  assert.ok(result.errors.some((error) => error.code === "TOO_MANY_SUBJECTS"));
});

test("requires the client-asserted current plan for current-facing lenses", () => {
  const { current_plan: _omitted, ...withoutPlan } = request();
  const result = validate(withoutPlan);
  assert.ok(result.errors.some((error) => error.code === "MISSING_CURRENT_PLAN"));
});

test("rejects a current plan that is not marked client_asserted_current", () => {
  const result = validate(
    request({
      current_plan: {
        authority: "frozen_user_commitment",
        captured_at: "2026-07-23T07:59:00Z",
        thesis: "x",
        invalidation: null,
        horizon: null,
      },
    }),
  );
  assert.ok(!result.valid);
});

test("rejects duplicate lens+subject pairs", () => {
  const result = validate(
    request({
      analysis_requests: [
        { lens: "memory_inspection", subject_ref: "cuebook://decision/episodes/previous" },
        { lens: "memory_inspection", subject_ref: "cuebook://decision/episodes/previous" },
      ],
    }),
  );
  assert.ok(result.errors.some((error) => error.code === "DUPLICATE_LENS_SUBJECT"));
});
