#!/usr/bin/env node
// Audit finished publication PNGs without pretending their HTML or fonts are available.
//
// This is a creator-side release preflight, not a replacement for the Frame
// service's authoritative malware, decode, metadata, and upload hash checks.
// It binds an actual image review to exact encoded bytes and canonical RGBA8
// pixels so an external bitmap can use the existing Frame visual manifest.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const captureHelpers = require("./capture_html_viewpoint.cjs");
const { canonicalRgbaPixelSha256, paintStats, pngDimensions } = captureHelpers;

const REQUEST_SCHEMA = "frame-finished-bitmap-audit-request-v1";
const REPORT_SCHEMA = "frame-raster-audit-v1";
const PROFILE = "frame-raster-audit-v1";
const FONT_PROFILE = "embedded-pixels-v1";
const ROLE_SPECS = {
  publication: { kind: "full", width: 2488, height: 1056 },
  compact: { kind: "compact_622", width: 622, height: 264 },
  og: { kind: "og", width: 1200, height: 630 },
};
const REQUIRED_ROLES = ["publication", "compact"];
const SAFE_REF = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\0]+\.png$/i;
const BACKEND_LOCK_REF = /^(?:quote-lock|entry-lock):[A-Za-z0-9._:-]{8,}$/;

function issue(code, path_, message) {
  return { code, path: path_, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function parseIso(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function auditFinishedBitmap(request, assetRoot) {
  const errors = [];
  if (!isObject(request) || request.schema_version !== REQUEST_SCHEMA) {
    return {
      schema_version: REPORT_SCHEMA,
      profile_version: PROFILE,
      source_kind: "finished_bitmap",
      font_profile: { profile: FONT_PROFILE, verification: "not_asserted" },
      audited_at: "",
      valid: false,
      errors: [issue("REQUEST_SCHEMA", "$.schema_version", `Expected ${REQUEST_SCHEMA}.`)],
      image_review: null,
      derivatives: [],
    };
  }

  const root = path.resolve(assetRoot);
  const renditions = isObject(request.renditions) ? request.renditions : {};
  const roles = Object.keys(renditions);
  for (const role of REQUIRED_ROLES) {
    if (!Object.hasOwn(renditions, role)) {
      errors.push(issue("ROLE_MISSING", `$.renditions.${role}`, `${role} is required.`));
    }
  }
  for (const role of roles) {
    if (!Object.hasOwn(ROLE_SPECS, role)) {
      errors.push(issue("ROLE_UNKNOWN", `$.renditions.${role}`, `Unsupported rendition role ${role}.`));
    }
  }

  const review = isObject(request.image_review) ? request.image_review : {};
  const auditedAt = request.audited_at ?? review.reviewed_at ?? "";
  if (!parseIso(auditedAt)) errors.push(issue("AUDITED_AT", "$.audited_at", "audited_at must be an ISO date-time."));
  if (!parseIso(review.reviewed_at)) errors.push(issue("IMAGE_REVIEW_TIME", "$.image_review.reviewed_at", "Image review needs an ISO date-time."));
  if (!["model", "human"].includes(review.reviewer)) errors.push(issue("IMAGE_REVIEWER", "$.image_review.reviewer", "Image review must identify a model or human reviewer."));
  if (review.legibility !== "pass") errors.push(issue("LEGIBILITY_REVIEW", "$.image_review.legibility", "Every rendition must pass image-level legibility review."));
  if (review.collision !== "pass") errors.push(issue("COLLISION_REVIEW", "$.image_review.collision", "Every rendition must pass image-level clipping and collision review."));
  if (!["no_external_untrusted", "not_required"].includes(review.imagery_policy) || review.imagery_result !== "pass") {
    errors.push(issue("IMAGERY_REVIEW", "$.image_review", "Declare the applicable imagery policy and a passing visual review result."));
  }
  if (!["absent", "backend_locked"].includes(review.mutable_price)) {
    errors.push(issue("MUTABLE_PRICE_REVIEW", "$.image_review.mutable_price", "mutable_price must be absent or backend_locked."));
  } else if (review.mutable_price === "backend_locked") {
    if (!BACKEND_LOCK_REF.test(review.backend_price_lock_ref ?? "")) {
      errors.push(issue("MUTABLE_PRICE_LOCK", "$.image_review.backend_price_lock_ref", "A displayed current/entry price needs an actual backend quote-lock or entry-lock ref."));
    }
  } else if (review.backend_price_lock_ref !== null) {
    errors.push(issue("MUTABLE_PRICE_LOCK", "$.image_review.backend_price_lock_ref", "Use null when no mutable current/entry price is displayed."));
  }

  const derivatives = [];
  const reviewedRoleSha256 = {};
  for (const role of roles.filter((item) => Object.hasOwn(ROLE_SPECS, item)).sort()) {
    const item = renditions[role];
    const ref = isObject(item) ? item.ref : null;
    if (typeof ref !== "string" || !SAFE_REF.test(ref)) {
      errors.push(issue("RENDITION_REF", `$.renditions.${role}.ref`, "Use a safe relative PNG ref."));
      continue;
    }
    const target = path.resolve(root, ref);
    if (!inside(root, target)) {
      errors.push(issue("RENDITION_ESCAPE", `$.renditions.${role}.ref`, "Rendition escaped the asset root."));
      continue;
    }
    try {
      const bytes = readFileSync(target);
      const dimensions = pngDimensions(target);
      const expected = ROLE_SPECS[role];
      if (dimensions[0] !== expected.width || dimensions[1] !== expected.height) {
        errors.push(issue("RENDITION_DIMENSIONS", `$.renditions.${role}.ref`, `${role} must be exactly ${expected.width} x ${expected.height}.`));
        continue;
      }
      const paint = paintStats(target);
      if (!Number.isFinite(paint.paintedRatio) || paint.paintedRatio < 0.006) {
        errors.push(issue("RENDITION_BLANK", `$.renditions.${role}.ref`, `${role} must contain at least 0.6% materially painted pixels.`));
      }
      const encodedHash = sha256(bytes);
      reviewedRoleSha256[role] = encodedHash;
      derivatives.push({
        kind: expected.kind,
        ref: path.basename(ref),
        width: expected.width,
        height: expected.height,
        sha256: encodedHash,
        pixel_sha256: canonicalRgbaPixelSha256(target),
        painted_ratio: Number(paint.paintedRatio.toFixed(6)),
      });
    } catch (error) {
      errors.push(issue("RENDITION_PNG", `$.renditions.${role}.ref`, `Cannot decode supported PNG pixels: ${error.message}`));
    }
  }

  if (new Set(derivatives.map((item) => item.sha256)).size !== derivatives.length) {
    errors.push(issue("ENCODED_HASH_DUPLICATE", "$.renditions", "Each rendition role must bind distinct PNG bytes."));
  }
  if (new Set(derivatives.map((item) => item.pixel_sha256)).size !== derivatives.length) {
    errors.push(issue("PIXEL_HASH_DUPLICATE", "$.renditions", "Each rendition role must bind distinct canonical pixels."));
  }

  return {
    schema_version: REPORT_SCHEMA,
    profile_version: PROFILE,
    source_kind: "finished_bitmap",
    font_profile: { profile: FONT_PROFILE, verification: "not_asserted" },
    audited_at: auditedAt,
    valid: errors.length === 0,
    errors,
    image_review: {
      reviewer: review.reviewer ?? null,
      reviewed_at: review.reviewed_at ?? null,
      review_method: "image_inspection",
      legibility: review.legibility ?? null,
      collision: review.collision ?? null,
      imagery_policy: review.imagery_policy ?? null,
      imagery_result: review.imagery_result ?? null,
      mutable_price: review.mutable_price ?? null,
      backend_price_lock_ref: review.backend_price_lock_ref ?? null,
      reviewed_role_sha256: reviewedRoleSha256,
    },
    derivatives,
  };
}

function main(argv) {
  const input = argv[0];
  let assetRoot = null;
  let out = null;
  for (let index = 1; index < argv.length; index += 2) {
    if (argv[index] === "--asset-root") assetRoot = argv[index + 1];
    else if (argv[index] === "--out") out = argv[index + 1];
    else throw new Error(`Unrecognized argument ${argv[index]}.`);
  }
  if (!input || !assetRoot || !out) {
    throw new Error("Usage: audit_finished_bitmap.mjs request.json --asset-root DIR --out raster-audit.json");
  }
  const report = auditFinishedBitmap(JSON.parse(readFileSync(input, "utf8")), assetRoot);
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ valid: report.valid, report_ref: out, errors: report.errors }, null, 2)}\n`);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}
