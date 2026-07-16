#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {pathToFileURL} = require("url");
const {chromium} = require("playwright");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
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

const input = process.argv[2];
const outputDir = process.argv[3];
const rawTimes = process.argv[4];
if (!input || !outputDir || !rawTimes) {
  fail("Usage: node capture_motion_keyframes.cjs <url-or-html> <output-dir> <ms,ms,...> [--width=720] [--height=420]");
}

const option = (name, fallback) => {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? Number(value.slice(prefix.length)) : fallback;
};
const width = option("width", 720);
const height = option("height", 420);
const times = rawTimes.split(",").map(Number);
if (!times.length || times.some((value) => !Number.isFinite(value) || value < 0)) fail("Keyframe times must be non-negative milliseconds.");
if (new Set(times).size !== times.length) fail("Keyframe times must be unique.");

const source = /^https?:\/\//.test(input) ? input : pathToFileURL(path.resolve(input)).href;
fs.mkdirSync(outputDir, {recursive: true});

(async () => {
  const executablePath = browserExecutable();
  const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
  const pageErrors = [];
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});

  for (const timeMs of times) {
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(source, {waitUntil: "networkidle"});
    await page.waitForFunction(() => window.__cuebookReady === true && typeof window.__cuebookSetTime === "function", null, {timeout: 15000});
    const root = page.locator('[data-cuebook-motion-root="true"]').first();
    await root.waitFor({state: "visible"});
    await page.evaluate((value) => window.__cuebookSetTime(value), timeMs);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))));
    await page.waitForTimeout(60);
    const ref = path.join(outputDir, `frame-${String(Math.round(timeMs)).padStart(5, "0")}.png`);
    await page.screenshot({path: ref, fullPage: false});
    process.stdout.write(`${ref}\n`);
    await page.close();
  }

  await context.close();
  await browser.close();
  if (pageErrors.length) fail(`Page errors:\n${pageErrors.join("\n")}`);
})().catch((error) => fail(error.stack || error.message));
