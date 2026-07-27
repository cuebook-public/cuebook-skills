#!/usr/bin/env node
// Inspect a creator-supplied publication image without resizing or re-encoding it.
//
// This is intentionally a small client-side metadata/hash step. Cuebook remains
// authoritative for malware scanning, full decoding, metadata removal,
// moderation, canonicalization, and upload-integrity checks.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "frame-creator-image-inspection-v1";
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_EDGE = 8192;

function issue(code, message) {
  return { code, message };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function exifOrientation(bytes) {
  const prefix = bytes.subarray(0, 6).toString("binary");
  const tiffOffset = prefix === "Exif\u0000\u0000" ? 6 : 0;
  if (tiffOffset + 8 > bytes.length) return 1;
  const byteOrder = bytes.subarray(tiffOffset, tiffOffset + 2).toString("ascii");
  if (byteOrder !== "II" && byteOrder !== "MM") return 1;
  const littleEndian = byteOrder === "II";
  const read16 = (offset) => {
    if (offset < 0 || offset + 2 > bytes.length) return null;
    return littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  };
  const read32 = (offset) => {
    if (offset < 0 || offset + 4 > bytes.length) return null;
    return littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  };
  if (read16(tiffOffset + 2) !== 42) return 1;
  const firstIfdRelative = read32(tiffOffset + 4);
  if (firstIfdRelative === null) return 1;
  const firstIfd = tiffOffset + firstIfdRelative;
  const entryCount = read16(firstIfd);
  if (entryCount === null || entryCount > 4096) return 1;
  for (let index = 0; index < entryCount; index += 1) {
    const entry = firstIfd + 2 + index * 12;
    if (entry + 12 > bytes.length) return 1;
    if (read16(entry) !== 0x0112 || read16(entry + 2) !== 3 || read32(entry + 4) !== 1) {
      continue;
    }
    const orientation = read16(entry + 8);
    return orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

function orientedDimensions(width, height, orientation) {
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function inspectPng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    bytes.length < 33
    || !bytes.subarray(0, 8).equals(signature)
    || bytes.toString("ascii", 12, 16) !== "IHDR"
  ) return null;

  let frameCount = 1;
  let orientation = 1;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > bytes.length) break;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL" && length >= 8) frameCount = bytes.readUInt32BE(offset + 8);
    if (type === "eXIf") {
      orientation = exifOrientation(bytes.subarray(offset + 8, offset + 8 + length));
    }
    offset = next;
    if (type === "IEND") break;
  }
  const dimensions = orientedDimensions(
    bytes.readUInt32BE(16),
    bytes.readUInt32BE(20),
    orientation,
  );
  return {
    mime_type: "image/png",
    ...dimensions,
    source_orientation: orientation,
    frame_count: frameCount,
  };
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let orientation = 1;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (marker === 0xe1) {
      orientation = exifOrientation(bytes.subarray(offset + 2, offset + length));
    }
    if (startOfFrameMarkers.has(marker) && length >= 7) {
      const dimensions = orientedDimensions(
        bytes.readUInt16BE(offset + 5),
        bytes.readUInt16BE(offset + 3),
        orientation,
      );
      return {
        mime_type: "image/jpeg",
        ...dimensions,
        source_orientation: orientation,
        frame_count: 1,
      };
    }
    offset += length;
  }
  throw new Error("JPEG dimensions were not found.");
}

function inspectWebp(bytes) {
  if (
    bytes.length < 30
    || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 12) !== "WEBP"
  ) return null;

  let dimensions = null;
  let frameCount = 0;
  let orientation = 1;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const next = payload + length + (length % 2);
    if (payload + length > bytes.length) break;
    if (type === "VP8X" && length >= 10) {
      dimensions = {
        width: uint24le(bytes, payload + 4) + 1,
        height: uint24le(bytes, payload + 7) + 1,
      };
    } else if (type === "VP8 " && length >= 10) {
      const signatureOffset = payload + 3;
      if (
        bytes[signatureOffset] === 0x9d
        && bytes[signatureOffset + 1] === 0x01
        && bytes[signatureOffset + 2] === 0x2a
      ) {
        dimensions = {
          width: bytes.readUInt16LE(signatureOffset + 3) & 0x3fff,
          height: bytes.readUInt16LE(signatureOffset + 5) & 0x3fff,
        };
      }
    } else if (type === "VP8L" && length >= 5 && bytes[payload] === 0x2f) {
      dimensions = {
        width: 1 + bytes[payload + 1] + ((bytes[payload + 2] & 0x3f) << 8),
        height: 1
          + (bytes[payload + 2] >> 6)
          + (bytes[payload + 3] << 2)
          + ((bytes[payload + 4] & 0x0f) << 10),
      };
    } else if (type === "ANMF") {
      frameCount += 1;
    } else if (type === "EXIF") {
      orientation = exifOrientation(bytes.subarray(payload, payload + length));
    }
    offset = next;
  }
  if (!dimensions) throw new Error("WebP dimensions were not found.");
  return {
    mime_type: "image/webp",
    ...orientedDimensions(dimensions.width, dimensions.height, orientation),
    source_orientation: orientation,
    frame_count: Math.max(frameCount, 1),
  };
}

export function inspectCreatorImageBytes(bytes, filename = "creator-image") {
  const errors = [];
  let image = null;
  try {
    image = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
  } catch (error) {
    errors.push(issue("IMAGE_HEADER", error.message));
  }
  if (!image && errors.length === 0) {
    errors.push(issue("IMAGE_FORMAT", "Use a PNG, JPEG, or WebP image."));
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    errors.push(issue("IMAGE_BYTES", "The image must be non-empty and no larger than 12 MiB."));
  }
  if (image) {
    if (
      image.width < 1
      || image.height < 1
      || image.width > MAX_EDGE
      || image.height > MAX_EDGE
      || image.width * image.height > MAX_PIXELS
    ) {
      errors.push(issue(
        "IMAGE_DIMENSIONS",
        "The native image must be at most 8192 px on either edge and 16 megapixels total.",
      ));
    }
    if (image.frame_count !== 1) {
      errors.push(issue("IMAGE_FRAMES", "Animated or multi-frame images are not accepted."));
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    source_kind: "creator_image",
    filename: path.basename(filename),
    valid: errors.length === 0,
    errors,
    mime_type: image?.mime_type ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
    source_orientation: image?.source_orientation ?? null,
    frame_count: image?.frame_count ?? null,
    byte_size: bytes.length,
    image_sha256: sha256(bytes),
    transform: "none",
    aspect_ratio_policy: "preserve",
  };
}

export function inspectCreatorImage(filePath) {
  return inspectCreatorImageBytes(readFileSync(filePath), filePath);
}

function main(argv) {
  const filePath = argv[0];
  const outputIndex = argv.indexOf("--out");
  const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : null;
  if (!filePath || (outputIndex >= 0 && !outputPath)) {
    throw new Error("Usage: inspect_creator_image.mjs IMAGE [--out inspection.json]");
  }
  const report = inspectCreatorImage(filePath);
  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, encoded, "utf8");
  process.stdout.write(encoded);
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}
