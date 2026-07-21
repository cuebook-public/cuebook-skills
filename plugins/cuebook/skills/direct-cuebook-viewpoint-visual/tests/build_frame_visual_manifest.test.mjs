import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { build, jcs_sha256 } from "../scripts/build_frame_visual_manifest.mjs";

const captureReport = () => ({
  schema_version: "viewpoint-html-capture-v1",
  source: "viewpoint.html",
  source_sha256: `sha256:${"9".repeat(64)}`,
  derivatives: [
    { kind: "full", ref: "viewpoint-2488.png", width: 2488, height: 1056, sha256: `sha256:${"a".repeat(64)}`, pixel_sha256: `sha256:${"d".repeat(64)}` },
  ],
});
const renderAudit = (valid = true) => ({
  schema_version: "viewpoint-render-audit-v1",
  source_sha256: `sha256:${"9".repeat(64)}`,
  valid,
  profile_version: "render-audit-wide-v1",
  audited_at: "2026-07-17T00:00:00.000Z",
});
const rasterAudit = () => ({
  schema_version: "frame-raster-audit-v1",
  profile_version: "frame-raster-audit-v1",
  source_kind: "finished_bitmap",
  font_profile: { profile: "embedded-pixels-v1", verification: "not_asserted" },
  audited_at: "2026-07-17T00:00:00.000Z",
  valid: true,
  errors: [],
  image_review: {
    review_method: "image_inspection",
    legibility: "pass",
    collision: "pass",
    imagery_result: "pass",
    mutable_price: "absent",
    reviewed_role_sha256: {
      publication: `sha256:${"a".repeat(64)}`,
    },
  },
  derivatives: captureReport().derivatives,
});
const directionSet = (rendererMode = "cuebook_template") => ({
  state: "selected",
  selected_direction_id: "VDIR_SELECTED",
  directions: [{
    direction_id: "VDIR_SELECTED",
    renderer_mode: rendererMode,
    html_ref: rendererMode === "finished_bitmap" ? null : "viewpoint.html",
    preview_ref: "viewpoint-2488.png",
    binding_refs: ["BIND_VIEW"],
    preflight: { copy_audited: true, compact_readable: true, source_bindings_complete: true },
    critique: { verdict: "pass" },
  }],
  bindings: [
    { binding_id: "BIND_VIEW", label: "creator view", state: "creator_view", source_refs: ["MVS_1"], material_to_claim: true, selected_for_display: true },
    { binding_id: "BIND_OTHER", label: "other direction", state: "observed", source_refs: ["F_2"], material_to_claim: false, selected_for_display: true },
  ],
});

function invoke({ auditValid = true, licenseMode = "production", alt = null, report = null, audit = null, rendererMode = "cuebook_template" } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-manifest-test-"));
  try {
    const fonts = path.join(root, "font-assets-v1.json");
    writeFileSync(fonts, JSON.stringify({ profile: "cuebook-noi-v1", license_mode: licenseMode, files: [] }));
    return build(
      report ?? captureReport(),
      audit ?? renderAudit(auditValid),
      directionSet(rendererMode),
      rendererMode === "finished_bitmap" ? null : fonts,
      alt ?? { publication: "Bullish USO 30-day viewpoint visual" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const errorCodes = (errors) => new Set(errors.map((entry) => entry.code));

test("builds manifest with stable JCS hash", () => {
  const [manifest, errors] = invoke();
  assert.deepEqual(errors, []);
  assert.equal(manifest.schema_version, "frame-visual-manifest-v1");
  assert.deepEqual(Object.keys(manifest.role_hashes), ["publication"]);
  assert.equal(manifest.role_hashes.publication, `sha256:${"d".repeat(64)}`);
  assert.deepEqual(manifest.capture_audit, { decision: "ready", status: "passed", profile_version: "render-audit-wide-v1", audited_at: "2026-07-17T00:00:00.000Z" });
  assert.equal(manifest.source_bindings.length, 1);
  assert.equal(manifest.source_bindings[0].binding_id, "BIND_VIEW");
  const first = jcs_sha256(manifest);
  assert.equal(first, jcs_sha256(structuredClone(manifest)));
  assert.match(first, /^sha256:[0-9a-f]{64}$/);
});

test("finished bitmap builds the same wire manifest without HTML or font files", () => {
  const [manifest, errors] = invoke({
    rendererMode: "finished_bitmap",
    report: rasterAudit(),
    audit: null,
  });
  assert.deepEqual(errors, []);
  assert.equal(manifest.schema_version, "frame-visual-manifest-v1");
  assert.deepEqual(manifest.capture_audit, {
    decision: "ready",
    status: "passed",
    profile_version: "frame-raster-audit-v1",
    audited_at: "2026-07-17T00:00:00.000Z",
  });
  assert.equal(manifest.font_profile.profile, "embedded-pixels-v1");
  assert.match(manifest.font_profile.manifest_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(manifest.role_hashes), ["publication"]);
});

test("finished bitmap cannot claim a verified font or skip image review", () => {
  const report = rasterAudit();
  report.image_review.legibility = "pending";
  const [manifest, errors] = invoke({ rendererMode: "finished_bitmap", report, audit: null });
  assert.equal(manifest, null);
  assert.ok(errorCodes(errors).has("RASTER_AUDIT_FAILED"));
});

test("finished bitmap review is bound to exact rendition bytes", () => {
  const report = rasterAudit();
  report.image_review.reviewed_role_sha256.publication = `sha256:${"8".repeat(64)}`;
  const [manifest, errors] = invoke({ rendererMode: "finished_bitmap", report });
  assert.equal(manifest, null);
  assert.ok(errorCodes(errors).has("RASTER_REVIEW_BINDING"));
});

const failures = [
  ["missing publication", () => {
    const report = captureReport();
    report.derivatives = [];
    return invoke({ report, alt: { publication: "x" } });
  }, "ROLE_MISSING"],
  ["missing pixel hashes", () => {
    const report = captureReport();
    for (const item of report.derivatives) delete item.pixel_sha256;
    return invoke({ report, alt: { publication: "x" } });
  }, "PIXEL_HASH_MISSING"],
  ["legacy rendition role", () => {
    const report = captureReport();
    report.derivatives.push({ kind: "compact_622", ref: "viewpoint-622.png", width: 622, height: 264, sha256: `sha256:${"b".repeat(64)}`, pixel_sha256: `sha256:${"e".repeat(64)}` });
    return invoke({ report, alt: { publication: "x" } });
  }, "ROLE_UNEXPECTED"],
  ["audit metadata missing", () => invoke({ audit: { valid: true }, alt: { publication: "x" } }), "AUDIT_METADATA_MISSING"],
  ["failed audit", () => invoke({ auditValid: false }), "AUDIT_NOT_PASSED"],
  ["Trial fonts", () => invoke({ licenseMode: "evaluation" }), "TRIAL_FONTS"],
  ["missing alt text", () => invoke({ alt: {} }), "ALT_TEXT_MISSING"],
  ["direction not selected", () => {
    const selected = directionSet();
    selected.state = "previewed";
    const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-manifest-test-"));
    try {
      const fonts = path.join(root, "font-assets-v1.json");
      writeFileSync(fonts, JSON.stringify({ profile: "cuebook-noi-v1", license_mode: "production", files: [] }));
      return build(captureReport(), renderAudit(), selected, fonts, { publication: "x" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, "DIRECTION_NOT_SELECTED"],
  ["capture from another visual", () => {
    const report = captureReport();
    report.source = "other.html";
    return invoke({ report, alt: { publication: "x" } });
  }, "CAPTURE_SOURCE_MISMATCH"],
  ["audit from another visual", () => {
    const audit = renderAudit();
    audit.source_sha256 = `sha256:${"8".repeat(64)}`;
    return invoke({ audit, alt: { publication: "x" } });
  }, "AUDIT_SOURCE_MISMATCH"],
  ["capture derivative from another direction", () => {
    const report = captureReport();
    report.derivatives[0].ref = "other-2488.png";
    return invoke({ report, alt: { publication: "x" } });
  }, "CAPTURE_REF_MISMATCH"],
];

for (const [name, run, expected] of failures) {
  test(name, () => {
    const [manifest, errors] = run();
    assert.equal(manifest, null);
    assert.ok(errorCodes(errors).has(expected));
  });
}

test("JCS rejects numbers", () => assert.throws(() => jcs_sha256({ ratio: 0.5 }), /number|Numbers/i));
