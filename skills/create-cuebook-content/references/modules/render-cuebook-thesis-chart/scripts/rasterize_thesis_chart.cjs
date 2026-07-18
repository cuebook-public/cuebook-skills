#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const zlib = require("zlib");
const { chromium } = require("playwright");

function hasLightCanvas(svgText) {
  const canvasMatch = svgText.match(
    /<rect\b(?=[^>]*\bwidth="\d+(?:\.\d+)?")(?=[^>]*\bheight="\d+(?:\.\d+)?")[^>]*\bfill="#([0-9a-f]{6})"/i,
  );
  if (!canvasMatch) return false;
  const hex = canvasMatch[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.78;
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upperLeft);
  if (dl <= du && dl <= dul) return left;
  return du <= dul ? up : upperLeft;
}

function nearBlackRatio(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Screenshot is not a PNG.");
  }
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      interlace = payload[12];
    } else if (type === "IDAT") compressed.push(payload);
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error("Unsupported Chromium PNG encoding.");
  }
  const channels = colorType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  if (raw.length !== height * (rowBytes + 1)) throw new Error("Unexpected PNG scanline length.");
  let previous = Buffer.alloc(rowBytes);
  let blackPixels = 0;
  for (let y = 0; y < height; y += 1) {
    const start = y * (rowBytes + 1);
    const filter = raw[start];
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}.`);
    const row = Buffer.alloc(rowBytes);
    for (let index = 0; index < rowBytes; index += 1) {
      const encoded = raw[start + 1 + index];
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      row[index] = (encoded + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      if (row[pixel] < 5 && row[pixel + 1] < 5 && row[pixel + 2] < 5) blackPixels += 1;
    }
    previous = row;
  }
  return blackPixels / (width * height);
}

function isHealthy(buffer, lightCanvas) {
  if (!lightCanvas) return true;
  return nearBlackRatio(buffer) < 0.08;
}

async function rasterizeSvg(inputArg, outputArg, options = {}) {
  if (!inputArg || !outputArg) {
    throw new Error("Usage: rasterize_thesis_chart.cjs <chart.svg> <chart.png>");
  }
  const input = path.resolve(inputArg);
  const output = path.resolve(outputArg);
  if (!fs.existsSync(input)) throw new Error(`SVG does not exist: ${input}`);
  const svgText = fs.readFileSync(input, "utf8");
  const sizeMatch = svgText.match(/<svg[^>]+width="(\d+)"[^>]+height="(\d+)"/i);
  if (!sizeMatch) throw new Error("SVG width and height are required.");
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  const executablePath = options.executablePath ?? candidates.find((candidate) => fs.existsSync(candidate));
  const browserType = options.chromium ?? chromium;
  const browser = await browserType.launch({
    headless: true,
    args: ["--font-render-hinting=none"],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    const lightCanvas = hasLightCanvas(svgText);
    let buffer = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.waitForTimeout(180 * (attempt + 1));
      const candidate = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width, height },
        omitBackground: false,
      });
      if (isHealthy(candidate, lightCanvas)) {
        buffer = candidate;
        break;
      }
      await page.reload({ waitUntil: "load" });
    }
    if (!buffer) throw new Error("PNG failed the black-tile health check after three attempts.");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, buffer);
  } finally {
    await browser.close();
  }
  return output;
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  process.stdout.write(`${await rasterizeSvg(inputArg, outputArg)}\n`);
}

module.exports = { hasLightCanvas, isHealthy, nearBlackRatio, rasterizeSvg };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
