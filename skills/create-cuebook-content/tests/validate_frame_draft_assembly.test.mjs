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
      title: "USO 30 天偏多：霍尔木兹运输风险先入价",
      body: "航道规则收紧，绕行与保险成本先动。\n\n油价计入运输风险溢价。",
      language: "zh",
      disclosures: { ai_assistance: "assisted" },
      media: [
        { rendition_role: "publication", sha256: "sha256:" + "a".repeat(64), alt_text: "USO 偏多观点图" },
        { rendition_role: "compact", sha256: "sha256:" + "b".repeat(64), alt_text: "USO 观点紧凑图" },
        { rendition_role: "og", sha256: "sha256:" + "c".repeat(64), alt_text: "USO 分享卡" },
      ],
    },
    settlement_intent: {
      schema_version: "settlement-intent.v1",
      family: "single_asset_direction",
      claim_text: "USO 30 天内跑出正收益",
      observation_policy_id: "launch-us-equity-v1",
      horizon: { kind: "duration", value: 30, unit: "calendar_day", creator_timezone: "Asia/Shanghai", session_policy: "next_eligible_close" },
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
      compact_preview_ref: "selected/viewpoint-622.png",
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
        body: "航道规则收紧，绕行与保险成本先动。",
        close: "油价计入运输风险溢价。",
      },
      visual: {
        direction_ref: selectedDirectionId,
        html_ref: "selected/viewpoint.html",
        preview_ref: "selected/viewpoint-2488.png",
        compact_preview_ref: "selected/viewpoint-622.png",
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
      { kind: "compact_622", ref: "viewpoint-622.png", width: 622, height: 264, sha256: payload.frame_draft.media[1].sha256, pixel_sha256: `sha256:${"2".repeat(64)}` },
      { kind: "og", ref: "og-1200x630.png", width: 1200, height: 630, sha256: payload.frame_draft.media[2].sha256, pixel_sha256: `sha256:${"3".repeat(64)}` },
    ],
  };
  return { candidateSet, directionSet, captureReport };
}

test("valid assembly", () => {
  const result = V.validate(assembly());
  assert.ok(result.valid, JSON.stringify(result.errors));
});

test("public requires og and intent", () => {
  let payload = assembly();
  payload.frame_draft.media = payload.frame_draft.media.slice(0, 2);
  assert.ok(codes(payload).has("OG_REQUIRED"));
  payload = assembly();
  payload.settlement_intent = null;
  assert.ok(codes(payload).has("INTENT_REQUIRED"));
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

test("cross-repository assembly and registered binding golden validates", () => {
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
