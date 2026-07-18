#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { PNG } = require("pngjs");

function isHealthy(buffer) {
  const image = PNG.sync.read(buffer);
  let blackPixels = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index] < 5 && image.data[index + 1] < 5 && image.data[index + 2] < 5) blackPixels += 1;
  }
  return blackPixels / (image.width * image.height) < 0.08;
}

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

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) {
    throw new Error("Usage: rasterize_market_figure.cjs <market-figure.svg> <market-figure.png>");
  }
  const input = path.resolve(inputArg);
  const output = path.resolve(outputArg);
  if (!fs.existsSync(input)) {
    throw new Error(`SVG does not exist: ${input}`);
  }
  const svgText = fs.readFileSync(input, "utf8");
  const lightTheme = hasLightCanvas(svgText);
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
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({
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
    await page.waitForTimeout(500);
    await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height }, omitBackground: false });
    let buffer = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.waitForTimeout(150 * (attempt + 1));
      const candidate = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height }, omitBackground: false });
      if (isHealthy(candidate)) {
        buffer = candidate;
        break;
      }
      await page.reload({ waitUntil: "load" });
    }
    if (!buffer) throw new Error("Rasterized PNG failed the black-tile health check after three attempts.");
    fs.writeFileSync(output, buffer);
  } finally {
    await browser.close();
  }
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
