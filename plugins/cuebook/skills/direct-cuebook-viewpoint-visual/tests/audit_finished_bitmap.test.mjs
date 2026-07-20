import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { auditFinishedBitmap } from "../scripts/audit_finished_bitmap.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function writePng(file, width, height, variant) {
  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (rowBytes + 1);
    raw[start] = 0;
    raw.fill(242 - variant, start + 1, start + 1 + rowBytes);
    const painted = Math.max(1, Math.ceil(width * 0.01));
    for (let x = 0; x < painted; x += 1) {
      const pixel = start + 1 + x * 3;
      raw[pixel] = 20 + variant;
      raw[pixel + 1] = 70 + variant;
      raw[pixel + 2] = 150 + variant;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

function request() {
  return {
    schema_version: "frame-finished-bitmap-audit-request-v1",
    audited_at: "2026-07-18T10:00:00.000Z",
    renditions: {
      publication: { ref: "publication.png" },
    },
    image_review: {
      reviewer: "model",
      reviewed_at: "2026-07-18T10:00:00.000Z",
      legibility: "pass",
      collision: "pass",
      imagery_policy: "no_external_untrusted",
      imagery_result: "pass",
      mutable_price: "absent",
      backend_price_lock_ref: null,
    },
  };
}

function withBitmaps(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-finished-bitmap-"));
  try {
    writePng(path.join(root, "publication.png"), 2488, 1056, 1);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("audits one publication master without HTML or font files", () => withBitmaps((root) => {
  const report = auditFinishedBitmap(request(), root);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.schema_version, "frame-raster-audit-v1");
  assert.deepEqual(report.font_profile, { profile: "embedded-pixels-v1", verification: "not_asserted" });
  assert.deepEqual(report.derivatives.map((item) => item.kind), ["full"]);
  assert.ok(report.derivatives.every((item) => /^sha256:[a-f0-9]{64}$/.test(item.pixel_sha256)));
}));

test("rejects legacy authoring rendition roles", () => withBitmaps((root) => {
  const input = request();
  input.renditions.compact = { ref: "publication.png" };
  const report = auditFinishedBitmap(input, root);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.code === "ROLE_UNKNOWN"));
}));

test("blocks a mutable price claim that has no backend lock", () => withBitmaps((root) => {
  const input = request();
  input.image_review.mutable_price = "backend_locked";
  const report = auditFinishedBitmap(input, root);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.code === "MUTABLE_PRICE_LOCK"));
}));

test("blocks failed image-level legibility review", () => withBitmaps((root) => {
  const input = request();
  input.image_review.legibility = "pending";
  const report = auditFinishedBitmap(input, root);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.code === "LEGIBILITY_REVIEW"));
}));
