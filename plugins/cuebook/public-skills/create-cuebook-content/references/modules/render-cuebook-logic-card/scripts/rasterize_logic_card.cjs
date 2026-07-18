#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) {
    throw new Error("Usage: rasterize_logic_card.cjs <logic-card.svg> <logic-card.png>");
  }
  const input = path.resolve(inputArg);
  const output = path.resolve(outputArg);
  if (!fs.existsSync(input)) {
    throw new Error(`SVG does not exist: ${input}`);
  }

  const browserCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--font-render-hinting=none"],
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await page.waitForTimeout(500);
    await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1200, height: 760 },
      omitBackground: false,
    });
    await page.waitForTimeout(150);
    await page.screenshot({
      path: output,
      clip: { x: 0, y: 0, width: 1200, height: 760 },
      omitBackground: false,
    });
  } finally {
    await browser.close();
  }
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
