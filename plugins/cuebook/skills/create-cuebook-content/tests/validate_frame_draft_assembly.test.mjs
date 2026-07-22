import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as V from "../scripts/validate_frame_draft_assembly.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assembly() {
  return {
    schema_version: "frame-draft-assembly-v1",
    idempotency_key: "0198a5b0-1111-7000-8000-000000000001",
    assembled_at: "2026-07-16T20:00:00+08:00",
    frame_draft: {
      kind: "market_view",
      visibility: "public",
      title: "USO Bullish for 30 Days: Hormuz Shipping Risk Prices In First",
      body: "Tighter channel rules move rerouting and insurance costs first.\n\nOil prices absorb a shipping risk premium.",
      language: "en",
      disclosures: { ai_assistance: "assisted" },
      media: [
        { rendition_role: "publication", sha256: "sha256:" + "a".repeat(64), alt_text: "Bullish USO viewpoint visual" },
      ],
    },
    settlement_intent: {
      schema_version: "settlement-intent.v1",
      family: "single_asset_direction",
      claim_text: "USO posts a positive return within 30 days",
      observation_policy_id: "launch-us-equity-v1",
      horizon: { kind: "duration", value: 30, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "at_instant" },
      leg: { asset_ref: "asset:uso", direction: "long", threshold_bps: "0" },
    },
    lineage: { intake_ref: "VINT_uso_20260716", direction_set_ref: "VDSET_uso_1", visual_manifest_sha256: "sha256:" + "d".repeat(64) },
  };
}

function codes(payload) {
  return new Set(V.validate(payload).errors.map((e) => e.code));
}

function visualManifestFor(payload) {
  const roles = payload.frame_draft.media.map((item) => item.rendition_role);
  return {
    schema_version: "frame-visual-manifest-v1",
    role_hashes: Object.fromEntries(roles.map((role, index) => [role, `sha256:${String(index + 1).repeat(64)}`])),
    alt_text_by_role: Object.fromEntries(payload.frame_draft.media.map((item) => [item.rendition_role, item.alt_text])),
  };
}

function handoffFor(payload) {
  const selectedDirectionId = "VDIR_uso_selected_1";
  const directionSet = {
    schema_version: "visual-direction-set-v1",
    direction_set_id: payload.lineage.direction_set_ref,
    state: "selected",
    selected_direction_id: selectedDirectionId,
    bindings: [
      { binding_id: "BIND_USO_VIEW", selected_for_display: true },
      { binding_id: "BIND_USO_HIDDEN", selected_for_display: false },
    ],
    directions: [{
      direction_id: selectedDirectionId,
      html_ref: "selected/viewpoint.html",
      preview_ref: "selected/viewpoint-2488.png",
      binding_refs: ["BIND_USO_VIEW"],
      preflight: { copy_audited: true, compact_readable: true, source_bindings_complete: true },
      critique: { verdict: "pass" },
    }],
  };
  const fingerprint = `sha256:${"9".repeat(64)}`;
  const candidateSet = {
    schema_version: "publish-candidate-set-v1",
    candidate_set_id: "PUBSET_USO_SELECTED_1",
    state: "selected",
    lineage: {
      fingerprint_sha256: fingerprint,
      input_artifact_refs: [directionSet.direction_set_id],
      settlement_claim_ref: "SETTLE_USO_30D",
    },
    selection: {
      selected_candidate_id: "PUBCAND_USO_SELECTED_1",
      selection_receipt_ref: "SEL_USO_SELECTED_1",
      content_confirmed: true,
      settlement_confirmed: true,
    },
    candidates: [{
      candidate_id: "PUBCAND_USO_SELECTED_1",
      meaning_fingerprint: fingerprint,
      copy: {
        headline: payload.frame_draft.title,
        body: "Tighter channel rules move rerouting and insurance costs first.",
        close: "Oil prices absorb a shipping risk premium.",
      },
      visual: {
        direction_ref: selectedDirectionId,
        html_ref: "selected/viewpoint.html",
        preview_ref: "selected/viewpoint-2488.png",
        alt_text: payload.frame_draft.media[0].alt_text,
      },
      frame: {
        title: payload.frame_draft.title,
        body: payload.frame_draft.body,
        image_ref: "selected/viewpoint-2488.png",
        alt_text: payload.frame_draft.media[0].alt_text,
      },
      settlement: { state: "frozen" },
      quality: { verdict: "pass" },
    }],
  };
  const captureReport = {
    schema_version: "viewpoint-html-capture-v1",
    source: "viewpoint.html",
    source_sha256: `sha256:${"8".repeat(64)}`,
    derivatives: [
      { kind: "full", ref: "viewpoint-2488.png", width: 2488, height: 1056, sha256: payload.frame_draft.media[0].sha256, pixel_sha256: `sha256:${"1".repeat(64)}` },
    ],
  };
  return { candidateSet, directionSet, captureReport };
}

function finishedBitmapHandoffFor(payload) {
  const handoff = handoffFor(payload);
  const direction = handoff.directionSet.directions[0];
  direction.renderer_mode = "finished_bitmap";
  direction.html_ref = null;
  const visual = handoff.candidateSet.candidates[0].visual;
  visual.renderer_mode = "finished_bitmap";
  visual.html_ref = null;
  handoff.captureReport = {
    schema_version: "frame-raster-audit-v1",
    profile_version: "frame-raster-audit-v1",
    source_kind: "finished_bitmap",
    font_profile: { profile: "embedded-pixels-v1", verification: "not_asserted" },
    audited_at: "2026-07-18T10:00:00.000Z",
    valid: true,
    errors: [],
    image_review: {
      review_method: "image_inspection",
      legibility: "pass",
      collision: "pass",
      imagery_result: "pass",
      mutable_price: "absent",
      reviewed_role_sha256: Object.fromEntries(payload.frame_draft.media.map((item) => [item.rendition_role, item.sha256])),
    },
    derivatives: handoff.captureReport.derivatives,
  };
  return handoff;
}

test("valid assembly", () => {
  const result = V.validate(assembly());
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.equal(assembly().settlement_intent.horizon.session_policy, "at_instant");
});

test("terminal range assembly requires the confirmed symmetric band", () => {
  const payload = assembly();
  payload.settlement_intent = {
    ...payload.settlement_intent,
    family: "single_asset_range",
    claim_text: "USO finishes within 5% of its publication baseline at the deadline",
    leg: { asset_ref: "asset:uso", direction: "range", max_abs_move_bps: "500" },
  };
  let result = V.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));

  delete payload.settlement_intent.leg.max_abs_move_bps;
  assert.ok(codes(payload).has("RANGE_BAND_REQUIRED"));
});

test("direct Fast Publish accepts preview and candidate refs without an optional generation handoff", () => {
  const payload = assembly();
  payload.lineage.intake_ref = "FPREV_USO_20260716";
  payload.lineage.direction_set_ref = "FPREV_USO_20260716#FPREV_CAND_USO_LONG";
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: payload.lineage.visual_manifest_sha256,
  };
  const result = V.validate(payload, binding, visualManifestFor(payload));
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("legacy next-eligible-close assembly remains readable", () => {
  const payload = assembly();
  payload.settlement_intent.horizon.session_policy = "next_eligible_close";
  const result = V.validate(payload);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("public requires one publication master and intent", () => {
  let payload = assembly();
  payload.frame_draft.media = [];
  assert.ok(codes(payload).has("MEDIA_ROLE_MISSING"));
  payload = assembly();
  payload.settlement_intent = null;
  assert.ok(codes(payload).has("INTENT_REQUIRED"));
});

test("legacy rendition roles are rejected", () => {
  const payload = assembly();
  payload.frame_draft.media.push({ rendition_role: "compact", sha256: `sha256:${"b".repeat(64)}`, alt_text: "legacy" });
  assert.ok(codes(payload).has("MEDIA_ROLE"));
});

test("horizon bounds enforced", () => {
  const payload = assembly();
  payload.settlement_intent.horizon.value = 200;
  assert.ok(codes(payload).has("HORIZON_BOUNDS"));
});

test("threshold and target rules", () => {
  let payload = assembly();
  delete payload.settlement_intent.leg.threshold_bps;
  assert.ok(codes(payload).has("THRESHOLD_NOT_EXPLICIT"));

  payload = assembly();
  Object.assign(payload.settlement_intent, {
    family: "single_asset_price_target",
    leg: { asset_ref: "asset:uso", direction: "long", target: { operator: "lte", price: "90" } },
  });
  assert.ok(codes(payload).has("TARGET_OPERATOR_DIRECTION"));
});

test("equal notional pair rules", () => {
  const payload = assembly();
  Object.assign(payload.settlement_intent, {
    family: "pair_asset_direction",
    aggregate: { mode: "equal_notional_long_short", spread_threshold_bps: "0" },
    legs: [
      { asset_ref: "asset:uso", direction: "long" },
      { asset_ref: "asset:xle", direction: "long" },
    ],
  });
  delete payload.settlement_intent.leg;
  assert.ok(codes(payload).has("PAIR_LONG_SHORT"));
});

test("media alt text and idempotency", () => {
  let payload = assembly();
  payload.frame_draft.media[0].alt_text = " ";
  assert.ok(codes(payload).has("MEDIA_ALT_TEXT"));
  payload = assembly();
  payload.idempotency_key = "not-a-uuid";
  assert.ok(codes(payload).has("IDEMPOTENCY_KEY"));
  payload = assembly();
  // A generic UUIDv4 is a valid UUID but not time-ordered; the backend
  // accepts only UUIDv7 and the assembly validator must match it.
  payload.idempotency_key = "0198a5b0-1111-4000-8000-000000000001";
  assert.ok(codes(payload).has("IDEMPOTENCY_KEY"));
});

test("manifest lineage required", () => {
  const payload = assembly();
  payload.lineage.visual_manifest_sha256 = "sha256:short";
  assert.ok(codes(payload).has("LINEAGE_MANIFEST"));
});

test("legacy cross-repository assembly and registered binding golden validates", () => {
  const golden = JSON.parse(readFileSync(path.join(ROOT, "references", "skill-assembly-golden.json"), "utf8"));
  const result = V.validate(golden.assembly, golden.binding, visualManifestFor(golden.assembly));
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("registered binding must match the assembly manifest lineage", () => {
  const payload = assembly();
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: `sha256:${"e".repeat(64)}`,
  };
  const result = V.validate(payload, binding, visualManifestFor(payload));
  assert.ok(new Set(result.errors.map((error) => error.code)).has("BINDING_MANIFEST_MISMATCH"));
});

test("visual manifest alt text is authoritative", () => {
  const payload = assembly();
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: payload.lineage.visual_manifest_sha256,
  };
  const manifest = visualManifestFor(payload);
  manifest.alt_text_by_role.publication = "different alt text";
  const result = V.validate(payload, binding, manifest);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("ALT_TEXT_MANIFEST_MISMATCH"));
});

test("selected content and visual capture form one valid Frame handoff", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  const result = V.validate(payload, null, null, handoff);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("finished bitmap handoff needs no HTML or verified font claim", () => {
  const payload = assembly();
  const handoff = finishedBitmapHandoffFor(payload);
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: payload.lineage.visual_manifest_sha256,
  };
  const manifest = visualManifestFor(payload);
  manifest.font_profile = { profile: "embedded-pixels-v1", manifest_sha256: `sha256:${"7".repeat(64)}` };
  const result = V.validate(payload, binding, manifest, handoff);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("finished bitmap handoff blocks a pending image review", () => {
  const payload = assembly();
  const handoff = finishedBitmapHandoffFor(payload);
  handoff.captureReport.image_review.collision = "pending";
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("RASTER_AUDIT_FAILED"));
});

test("registered handoff preserves both image hash chains", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: payload.lineage.visual_manifest_sha256,
  };
  const result = V.validate(payload, binding, visualManifestFor(payload), handoff);
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("Frame handoff rejects unconfirmed settlement semantics", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  handoff.candidateSet.selection.settlement_confirmed = false;
  handoff.candidateSet.candidates[0].settlement.state = "needs_confirmation";
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("SETTLEMENT_NOT_CONFIRMED"));
});

test("Frame handoff rejects copy drift after candidate selection", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  payload.frame_draft.body = "A later rewrite that the user never selected.";
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("ASSEMBLY_COPY_MISMATCH"));
});

test("Frame handoff rejects public projection drift", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  handoff.candidateSet.candidates[0].frame.body = "A different public body.";
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("FRAME_PROJECTION_MISMATCH"));
});

test("Frame handoff rejects a different visual direction", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  handoff.candidateSet.candidates[0].visual.direction_ref = "VDIR_other_selection";
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("CANDIDATE_DIRECTION_MISMATCH"));
});

test("Frame handoff rejects encoded PNG hash drift", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  handoff.captureReport.derivatives[0].sha256 = `sha256:${"e".repeat(64)}`;
  const result = V.validate(payload, null, null, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("CAPTURE_ENCODED_HASH_MISMATCH"));
});

test("registered Frame handoff rejects canonical pixel hash drift", () => {
  const payload = assembly();
  const handoff = handoffFor(payload);
  const binding = {
    media_asset_id: "0198a5b0-2222-7000-8000-000000000002",
    visual_manifest_id: "0198a5b0-3333-7000-8000-000000000003",
    visual_manifest_sha256: payload.lineage.visual_manifest_sha256,
  };
  const manifest = visualManifestFor(payload);
  manifest.role_hashes.publication = `sha256:${"f".repeat(64)}`;
  const result = V.validate(payload, binding, manifest, handoff);
  assert.ok(new Set(result.errors.map((error) => error.code)).has("CAPTURE_PIXEL_HASH_MISMATCH"));
});
