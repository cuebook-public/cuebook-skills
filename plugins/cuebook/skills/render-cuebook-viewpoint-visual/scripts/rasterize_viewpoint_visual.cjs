#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const zlib = require("zlib");

const CANVAS = "#FCFCFA";

function sha256(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
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
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function pngPaintStats(file) {
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
    } else if (type === "IDAT") {
      compressed.push(payload);
    }
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(`Unsupported Chromium PNG encoding: ${file}`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  if (raw.length !== (rowBytes + 1) * height) throw new Error(`Unexpected PNG scanline length: ${file}`);

  let previous = Buffer.alloc(rowBytes);
  let nearBlackPixels = 0;
  let nearBlackRows = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    const filter = raw[rowOffset];
    const row = Buffer.alloc(rowBytes);
    for (let index = 0; index < rowBytes; index += 1) {
      const encoded = raw[rowOffset + 1 + index];
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}: ${file}`);
      row[index] = (encoded + predictor) & 0xff;
    }
    let rowNearBlack = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = x * channels;
      if (row[pixel] <= 4 && row[pixel + 1] <= 4 && row[pixel + 2] <= 4) rowNearBlack += 1;
    }
    nearBlackPixels += rowNearBlack;
    if (rowNearBlack / width > 0.8) nearBlackRows += 1;
    previous = row;
  }
  return { nearBlackRatio: nearBlackPixels / (width * height), nearBlackRows };
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
    throw new Error("Playwright is required for deterministic viewpoint rasterization. Run `npm ci` from the repository root.");
  }
}

function htmlFor(svgText, width, height) {
  return [
    "<!doctype html>",
    '<meta charset="utf-8">',
    "<style>",
    `html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${CANVAS}}`,
    `svg{display:block;width:${width}px!important;height:${height}px!important}`,
    "</style>",
    svgText,
  ].join("\n");
}

async function renderPng(browser, svgText, width, height, output, workDir) {
  const htmlPath = path.join(workDir, `render-${width}.html`);
  fs.writeFileSync(htmlPath, htmlFor(svgText, width, height), "utf8");
  fs.rmSync(output, { force: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
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
  if (!fs.existsSync(output) || fs.statSync(output).size <= 100) {
    throw new Error(`Playwright did not produce a stable ${width}x${height} PNG.`);
  }
  const dimensions = pngDimensions(output);
  if (dimensions[0] !== width || dimensions[1] !== height) {
    throw new Error(`Expected ${width}x${height}, received ${dimensions[0]}x${dimensions[1]}: ${output}`);
  }
  const paint = pngPaintStats(output);
  if (paint.nearBlackRatio > 0.02 || paint.nearBlackRows > 2) {
    throw new Error(`Chromium produced an incompletely painted PNG: ${output}`);
  }
}

function safeRelative(from, target) {
  const relative = path.relative(from, target).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Derivative must remain inside the manifest directory: ${target}`);
  }
  return relative;
}

function atomicWriteJson(file, payload) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  const descriptor = fs.openSync(temporary, "w", 0o644);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

async function main() {
  const [svgArg, manifestArg] = process.argv.slice(2);
  if (!svgArg || !manifestArg) {
    throw new Error("Usage: rasterize_viewpoint_visual.cjs <viewpoint-visual.svg> <viewpoint-visual-v1.json>");
  }
  const svgPath = path.resolve(svgArg);
  const manifestPath = path.resolve(manifestArg);
  if (!fs.existsSync(svgPath)) throw new Error(`SVG does not exist: ${svgPath}`);
  if (!fs.existsSync(manifestPath)) throw new Error(`Manifest does not exist: ${manifestPath}`);
  const browserPath = browserExecutable();
  if (!browserPath) throw new Error("Node is available, but no supported Chromium executable was found.");

  const manifestDir = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schema_version !== "viewpoint-visual-v1") throw new Error("Expected a ViewpointVisualV1 manifest.");
  const svgBytes = fs.readFileSync(svgPath);
  const svgHash = sha256(svgBytes);
  if (manifest.asset?.svg?.sha256 !== svgHash) throw new Error("SVG bytes do not match the manifest hash.");
  if (!/<svg\b[^>]*\brole="img"/i.test(svgBytes.toString("utf8"))) throw new Error("Accessible SVG role is missing.");

  const derivativesRoot = path.join(manifestDir, "derivatives");
  fs.mkdirSync(derivativesRoot, { recursive: true });
  const nonce = `${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const bundleStage = path.join(derivativesRoot, `.bundle-${nonce}`);
  const workDir = path.join(manifestDir, `.raster-work-${nonce}`);
  fs.mkdirSync(bundleStage);
  fs.mkdirSync(workDir);

  let browser = null;
  try {
    const { chromium } = loadPlaywright();
    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: [...chromiumPlatformArgs(), "--font-render-hinting=none"],
    });
    const fullStage = path.join(bundleStage, "viewpoint-visual.png");
    const compactStage = path.join(bundleStage, "viewpoint-visual-360.png");
    const svgText = svgBytes.toString("utf8");
    await renderPng(browser, svgText, 720, 420, fullStage, workDir);
    await renderPng(browser, svgText, 360, 210, compactStage, workDir);

    const fullBytes = fs.readFileSync(fullStage);
    const compactBytes = fs.readFileSync(compactStage);
    const fullHash = sha256(fullBytes);
    const compactHash = sha256(compactBytes);
    const bundleHash = sha256(Buffer.concat([fullBytes, compactBytes]));
    const bundleName = bundleHash.slice("sha256:".length, "sha256:".length + 20);
    const finalDir = path.join(derivativesRoot, bundleName);
    if (fs.existsSync(finalDir)) {
      fs.rmSync(bundleStage, { recursive: true, force: true });
    } else {
      fs.renameSync(bundleStage, finalDir);
    }

    const fullPath = path.join(finalDir, "viewpoint-visual.png");
    const compactPath = path.join(finalDir, "viewpoint-visual-360.png");
    if (sha256(fs.readFileSync(fullPath)) !== fullHash || sha256(fs.readFileSync(compactPath)) !== compactHash) {
      throw new Error("Published derivative bundle does not match staged hashes.");
    }
    manifest.asset.png_derivatives = [
      {
        kind: "full",
        ref: safeRelative(manifestDir, fullPath),
        width: 720,
        height: 420,
        sha256: fullHash,
      },
      {
        kind: "compact_360",
        ref: safeRelative(manifestDir, compactPath),
        width: 360,
        height: 210,
        sha256: compactHash,
      },
    ];
    manifest.asset.derivative_bundle_hash = bundleHash;
    atomicWriteJson(manifestPath, manifest);
    process.stdout.write(`${manifestPath}\n`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      fs.rmSync(bundleStage, { recursive: true, force: true });
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

module.exports = { chromiumPlatformArgs };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
