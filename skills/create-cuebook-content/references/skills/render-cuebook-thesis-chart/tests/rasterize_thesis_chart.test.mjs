import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const { hasLightCanvas, isHealthy, nearBlackRatio } = require("../scripts/rasterize_thesis_chart.cjs");

function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  return Buffer.concat([length, Buffer.from(type, "ascii"), payload, Buffer.alloc(4)]);
}

function rgbPng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("self-contained PNG health check rejects a black tile on a light canvas", () => {
  const black = rgbPng(4, 3, [0, 0, 0]);
  const white = rgbPng(4, 3, [255, 255, 255]);
  assert.equal(nearBlackRatio(black), 1);
  assert.equal(nearBlackRatio(white), 0);
  assert.equal(isHealthy(black, true), false);
  assert.equal(isHealthy(white, true), true);
  assert.equal(isHealthy(black, false), true);
});

test("light-canvas detection follows the rendered SVG background", () => {
  assert.equal(hasLightCanvas('<svg><rect width="1200" height="560" fill="#FCFCFA"/></svg>'), true);
  assert.equal(hasLightCanvas('<svg><rect width="1200" height="560" fill="#171918"/></svg>'), false);
});
