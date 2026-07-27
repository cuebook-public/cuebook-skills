import { test } from "node:test";
import assert from "node:assert/strict";

import { inspectCreatorImageBytes } from "./inspect_creator_image.mjs";

function png(width, height, frameCount = null) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr];
  if (frameCount !== null) {
    const actl = Buffer.alloc(20);
    actl.writeUInt32BE(8, 0);
    actl.write("acTL", 4, "ascii");
    actl.writeUInt32BE(frameCount, 8);
    chunks.push(actl);
  }
  return Buffer.concat(chunks);
}

function jpeg(width, height) {
  const bytes = Buffer.alloc(23);
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x0b, 0x08], 0);
  bytes.writeUInt16BE(height, 11);
  bytes.writeUInt16BE(width, 13);
  return bytes;
}

function orientedJpeg(width, height, orientation) {
  const app1 = Buffer.alloc(36);
  app1.set([0xff, 0xe1], 0);
  app1.writeUInt16BE(34, 2);
  app1.write("Exif\0\0", 4, "binary");
  app1.write("II", 10, "ascii");
  app1.writeUInt16LE(42, 12);
  app1.writeUInt32LE(8, 14);
  app1.writeUInt16LE(1, 18);
  app1.writeUInt16LE(0x0112, 20);
  app1.writeUInt16LE(3, 22);
  app1.writeUInt32LE(1, 24);
  app1.writeUInt16LE(orientation, 28);

  const sof = Buffer.alloc(13);
  sof.set([0xff, 0xc0, 0x00, 0x0b, 0x08], 0);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof]);
}

function webp(width, height, animated = false) {
  const chunks = [];
  const vp8x = Buffer.alloc(18);
  vp8x.write("VP8X", 0, "ascii");
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = animated ? 0x02 : 0;
  vp8x.writeUIntLE(width - 1, 12, 3);
  vp8x.writeUIntLE(height - 1, 15, 3);
  chunks.push(vp8x);
  if (animated) {
    for (let index = 0; index < 2; index += 1) {
      const anmf = Buffer.alloc(8);
      anmf.write("ANMF", 0, "ascii");
      chunks.push(anmf);
    }
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

test("keeps a native PNG unchanged", () => {
  const report = inspectCreatorImageBytes(png(1170, 2532), "portrait.png");
  assert.equal(report.valid, true);
  assert.equal(report.mime_type, "image/png");
  assert.equal(report.width, 1170);
  assert.equal(report.height, 2532);
  assert.equal(report.frame_count, 1);
  assert.equal(report.transform, "none");
  assert.equal(report.aspect_ratio_policy, "preserve");
  assert.match(report.image_sha256, /^sha256:[a-f0-9]{64}$/u);
});

test("accepts JPEG and WebP native dimensions", () => {
  const jpegReport = inspectCreatorImageBytes(jpeg(1080, 1350), "post.jpg");
  assert.equal(jpegReport.valid, true);
  assert.deepEqual(
    [jpegReport.mime_type, jpegReport.width, jpegReport.height],
    ["image/jpeg", 1080, 1350],
  );

  const webpReport = inspectCreatorImageBytes(webp(2048, 1024), "wide.webp");
  assert.equal(webpReport.valid, true);
  assert.deepEqual(
    [webpReport.mime_type, webpReport.width, webpReport.height],
    ["image/webp", 2048, 1024],
  );
});

test("reports canonical display dimensions for an EXIF-oriented JPEG", () => {
  const report = inspectCreatorImageBytes(
    orientedJpeg(4032, 3024, 6),
    "camera-landscape-pixels.jpg",
  );
  assert.equal(report.valid, true);
  assert.deepEqual([report.width, report.height, report.source_orientation], [3024, 4032, 6]);
  assert.equal(report.transform, "none");
});

test("rejects animation and unsafe dimensions without rewriting bytes", () => {
  const animated = inspectCreatorImageBytes(webp(800, 600, true), "animated.webp");
  assert.equal(animated.valid, false);
  assert.ok(animated.errors.some((error) => error.code === "IMAGE_FRAMES"));

  const oversized = inspectCreatorImageBytes(png(8192, 8192), "oversized.png");
  assert.equal(oversized.valid, false);
  assert.ok(oversized.errors.some((error) => error.code === "IMAGE_DIMENSIONS"));
  assert.equal(oversized.transform, "none");
});
