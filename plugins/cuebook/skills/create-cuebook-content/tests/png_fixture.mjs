import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const cache = new Map();

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

export function validPaintedPng(width = 1866, height = 1200, variant = 1) {
  const key = `${width}x${height}:${variant}`;
  if (cache.has(key)) return cache.get(key);
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
  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  cache.set(key, png);
  return png;
}
