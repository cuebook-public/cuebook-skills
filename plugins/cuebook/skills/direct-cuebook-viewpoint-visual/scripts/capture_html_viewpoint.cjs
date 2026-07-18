#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const zlib = require("zlib");

function sha256(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function chromiumPlatformArgs(platform = process.platform) {
  return platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (_error) {
    throw new Error("Playwright is required for deterministic viewpoint capture. Run `npm ci` from the repository root.");
  }
}

function pngDimensions(file) {
  const data = fs.readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature) || data.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`Not a valid PNG: ${file}`);
  }
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upperLeft);
  if (dl <= du && dl <= dul) return left;
  return du <= dul ? up : upperLeft;
}

function paintStats(file) {
  const data = fs.readFileSync(file);
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
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
    throw new Error(`Unsupported Chromium PNG encoding: ${file}`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  let previous = Buffer.alloc(rowBytes);
  let nearBlack = 0;
  let painted = 0;
  let reference = null;
  for (let y = 0; y < height; y += 1) {
    const start = y * (rowBytes + 1);
    const filter = raw[start];
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
    if (reference === null) reference = [row[0], row[1], row[2]];
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      if (row[pixel] <= 4 && row[pixel + 1] <= 4 && row[pixel + 2] <= 4) nearBlack += 1;
      if (Math.max(
        Math.abs(row[pixel] - reference[0]),
        Math.abs(row[pixel + 1] - reference[1]),
        Math.abs(row[pixel + 2] - reference[2]),
      ) >= 12) painted += 1;
    }
    previous = row;
  }
  return {
    nearBlackRatio: nearBlack / (width * height),
    paintedRatio: painted / (width * height),
  };
}

// Canonical RGBA pixel hash: sha256 over the packed straight-alpha RGBA
// stream (width * height * 4 bytes, row stride width * 4, top-to-bottom).
// No dimensions, headers, ICC/EXIF/XMP data, or padding enter the preimage.
// Must stay byte-identical to the Frame backend's sharp/libvips decode of the
// same PNG (hashCanonicalRgbaPixelStream).
function canonicalRgbaPixelSha256(file) {
  const data = fs.readFileSync(file);
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
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
    throw new Error(`Unsupported Chromium PNG encoding for pixel hashing: ${file}`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const hash = crypto.createHash("sha256");
  let previous = Buffer.alloc(rowBytes);
  const rgbaRow = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y += 1) {
    const start = y * (rowBytes + 1);
    const filter = raw[start];
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
    if (channels === 4) hash.update(row);
    else {
      for (let x = 0; x < width; x += 1) {
        rgbaRow[x * 4] = row[x * 3];
        rgbaRow[x * 4 + 1] = row[x * 3 + 1];
        rgbaRow[x * 4 + 2] = row[x * 3 + 2];
        rgbaRow[x * 4 + 3] = 0xff;
      }
      hash.update(rgbaRow);
    }
    previous = row;
  }
  return `sha256:${hash.digest("hex")}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function capture(browser, htmlPath, width, height, scaleFactor, output, allowDark) {
  fs.rmSync(output, { force: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scaleFactor,
    colorScheme: "light",
  });
  try {
    await context.route(/^https?:\/\//u, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await page.screenshot({
      path: output,
      type: "png",
      animations: "disabled",
      caret: "hide",
      omitBackground: false,
    });
  } finally {
    await context.close();
  }
  const expectedWidth = width * scaleFactor;
  const expectedHeight = height * scaleFactor;
  if (!fs.existsSync(output) || fs.statSync(output).size <= 1000) {
    throw new Error(`Playwright did not produce a stable ${expectedWidth}x${expectedHeight} PNG.`);
  }
  const dimensions = pngDimensions(output);
  if (dimensions[0] !== expectedWidth || dimensions[1] !== expectedHeight) {
    throw new Error(`Expected ${expectedWidth}x${expectedHeight}, received ${dimensions.join("x")}.`);
  }
  const paint = paintStats(output);
  if (!allowDark && paint.nearBlackRatio > 0.4) {
    throw new Error(`Chromium returned an incompletely painted light-theme PNG: ${output}`);
  }
  if (paint.paintedRatio < 0.006) {
    throw new Error(`Chromium returned a visually blank viewpoint PNG (${(paint.paintedRatio * 100).toFixed(2)}% painted): ${output}`);
  }
  return paint;
}

async function captureReliable(browser, htmlPath, width, height, scaleFactor, output, allowDark) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await capture(browser, htmlPath, width, height, scaleFactor, output, allowDark);
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw lastError;
}

function readNetworkFreeHtml(htmlPath, requiredWidth, requiredHeight) {
  if (!fs.existsSync(htmlPath)) throw new Error(`HTML does not exist: ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, "utf8");
  if (
    !html.includes("data-cuebook-viewpoint")
    || !html.includes(`data-width="${requiredWidth}"`)
    || !html.includes(`data-height="${requiredHeight}"`)
  ) {
    throw new Error(`HTML does not satisfy the ${requiredWidth} x ${requiredHeight} Cuebook canvas contract.`);
  }
  if (/(?:src|href)=["']https?:\/\//i.test(html)) throw new Error("Direction HTML must be network-free.");
  return html;
}

async function captureViewpoint(htmlArg, outputArg, browserOverride = null, ogHtmlArg = null, options = {}) {
  const htmlPath = path.resolve(htmlArg);
  const outputDir = path.resolve(outputArg);
  const html = readNetworkFreeHtml(htmlPath, 1244, 528);
  const ogHtmlPath = ogHtmlArg ? path.resolve(ogHtmlArg) : null;
  let ogAllowDark = false;
  if (ogHtmlPath) {
    const ogHtml = readNetworkFreeHtml(ogHtmlPath, 1200, 630);
    ogAllowDark = /data-theme=["']dark["']/i.test(ogHtml);
  }
  const allowDark = /data-theme=["']dark["']/i.test(html);
  const browserPath = browserOverride || browserExecutable();
  if (!browserPath) throw new Error("No supported Chromium executable found.");
  fs.mkdirSync(outputDir, { recursive: true });
  const full = path.join(outputDir, "viewpoint-2488.png");
  const compact = path.join(outputDir, "viewpoint-622.png");
  const og = path.join(outputDir, "og-1200x630.png");
  if (options.fullOnly === true) fs.rmSync(compact, { force: true });
  const startedAt = Date.now();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [...chromiumPlatformArgs(), "--font-render-hinting=none"],
  });
  try {
    const fullOnly = options.fullOnly === true;
    const captures = [captureReliable(browser, htmlPath, 1244, 528, 2, full, allowDark)];
    if (!fullOnly) captures.push(captureReliable(browser, htmlPath, 622, 264, 1, compact, allowDark));
    if (ogHtmlPath) captures.push(captureReliable(browser, ogHtmlPath, 1200, 630, 1, og, ogAllowDark));
    const captured = await Promise.all(captures);
    const fullPaint = captured[0];
    const compactPaint = fullOnly ? null : captured[1];
    const ogPaint = ogHtmlPath ? captured[fullOnly ? 1 : 2] : null;
    const derivatives = [
      { kind: "full", ref: path.basename(full), width: 2488, height: 1056, sha256: sha256(fs.readFileSync(full)), pixel_sha256: canonicalRgbaPixelSha256(full), painted_ratio: Number(fullPaint.paintedRatio.toFixed(6)) },
    ];
    if (!fullOnly) derivatives.push({ kind: "compact_622", ref: path.basename(compact), width: 622, height: 264, sha256: sha256(fs.readFileSync(compact)), pixel_sha256: canonicalRgbaPixelSha256(compact), painted_ratio: Number(compactPaint.paintedRatio.toFixed(6)) });
    if (ogHtmlPath) {
      derivatives.push({ kind: "og", ref: path.basename(og), source: path.basename(ogHtmlPath), width: 1200, height: 630, sha256: sha256(fs.readFileSync(og)), pixel_sha256: canonicalRgbaPixelSha256(og), painted_ratio: Number(ogPaint.paintedRatio.toFixed(6)) });
    }
    const report = {
      schema_version: "viewpoint-html-capture-v1",
      source: path.basename(htmlPath),
      source_sha256: sha256(fs.readFileSync(htmlPath)),
      og_source: ogHtmlPath ? path.basename(ogHtmlPath) : null,
      og_source_sha256: ogHtmlPath ? sha256(fs.readFileSync(ogHtmlPath)) : null,
      capture_mode: fullOnly ? "full_only" : "parallel_sizes",
      duration_ms: Date.now() - startedAt,
      derivatives,
    };
    fs.writeFileSync(path.join(outputDir, "capture-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    return { outputDir, report };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fullOnly = args.includes("--full-only");
  const positionals = args.filter((arg) => arg !== "--full-only");
  const [htmlArg, outputArg, ogArg] = positionals;
  if (!htmlArg || !outputArg || positionals.length > 3 || (fullOnly && ogArg)) throw new Error("Usage: capture_html_viewpoint.cjs <direction.html> <output-dir> [og-1200x630.html] [--full-only]");
  const result = await captureViewpoint(htmlArg, outputArg, null, ogArg || null, { fullOnly });
  process.stdout.write(`${result.outputDir}\n`);
}

module.exports = {
  browserExecutable,
  canonicalRgbaPixelSha256,
  captureViewpoint,
  chromiumPlatformArgs,
  paintStats,
  pngDimensions,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
