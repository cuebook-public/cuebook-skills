import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "capture_html_viewpoint.cjs");
const require = createRequire(import.meta.url);
const { chromiumPlatformArgs } = require(script);
const browsers = [
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
const canCapture = browsers.some(existsSync);

test("Linux Chromium capture uses CI-safe process flags", () => {
  assert.deepEqual(chromiumPlatformArgs("linux"), ["--no-sandbox", "--disable-dev-shm-usage"]);
  assert.deepEqual(chromiumPlatformArgs("darwin"), []);
});

function html(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1244px;height:528px;overflow:hidden;background:#f7f8fa;color:#111418}
main{position:relative;width:1244px;height:528px;overflow:hidden;transform-origin:top left}
.claim{position:absolute;left:72px;top:58px;width:850px;font:800 86px/1.06 -apple-system,sans-serif}
.proof{position:absolute;left:76px;top:290px;width:720px;font:650 38px/1.2 -apple-system,sans-serif;color:#315fd0}
.field{position:absolute;right:60px;top:48px;width:290px;height:382px;background:#dce5ff;border-left:16px solid #315fd0}
@media(max-width:1000px){html,body{width:622px;height:264px}main{transform:scale(.5)}}
</style></head><body><main data-cuebook-viewpoint data-width="1244" data-height="528">${content}</main></body></html>`;
}

function dimensions(file) {
  const data = readFileSync(file);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function capture(source) {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-capture-test-"));
  const sourcePath = path.join(temp, "direction.html");
  const output = path.join(temp, "capture");
  writeFileSync(sourcePath, source);
  const completed = spawnSync(process.execPath, [script, sourcePath, output], { encoding: "utf8" });
  return { temp, output, completed };
}

test("rejects uniform blank canvas", { skip: !canCapture }, () => {
  const { temp, completed } = capture(html(""));
  try {
    assert.notEqual(completed.status, 0);
    assert.match(completed.stderr, /visually blank viewpoint PNG/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("captures one publication master", { skip: !canCapture }, () => {
  const source = html('<h1 class="claim">HOOD 进入重估窗口</h1><div class="proof">交易、分发与结算开始合流</div><div class="field"></div>');
  const { temp, output, completed } = capture(source);
  try {
    assert.equal(completed.status, 0, completed.stderr);
    assert.deepEqual(dimensions(path.join(output, "viewpoint-2488.png")), [2488, 1056]);
    assert.equal(existsSync(path.join(output, "viewpoint-622.png")), false);
    assert.equal(existsSync(path.join(output, "og-1200x630.png")), false);
    const report = JSON.parse(readFileSync(path.join(output, "capture-report.json"), "utf8"));
    for (const derivative of report.derivatives) {
      assert.match(derivative.pixel_sha256, /^sha256:[0-9a-f]{64}$/);
      assert.notEqual(derivative.pixel_sha256, derivative.sha256);
    }
    assert.equal(report.capture_mode, "publication_master");
    assert.deepEqual(report.derivatives.map((item) => item.kind), ["full"]);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
