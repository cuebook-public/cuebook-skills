import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "audit_rendered_viewpoint.cjs");
const require = createRequire(import.meta.url);
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
let playwrightAvailable = true;
try {
  require.resolve("playwright");
} catch {
  playwrightAvailable = false;
}
const canAudit = playwrightAvailable && browsers.some(existsSync);

function html(extraCss = "") {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f7f9fc;color:#11151b}
main{position:relative;width:1244px;height:528px;transform-origin:top left;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums}
.claim,.evidence,.condition{position:absolute;letter-spacing:0}
.claim{left:74px;top:48px;width:1040px;font-size:96px;line-height:1.08;font-weight:750;text-wrap:balance}
.evidence{left:78px;top:244px;width:800px;font-size:44px;line-height:1.2;font-weight:650}
.condition{left:78px;top:340px;width:600px;font-size:40px;line-height:1.25;font-weight:650}
@media(max-width:1000px){main{transform:scale(.5)}}
${extraCss}
</style></head><body>
<main data-cuebook-viewpoint data-width="1244" data-height="528">
  <h1 class="claim" data-role="claim" data-visual-level="1" data-logic-step-id="LSTEP_CLAIM" data-essential-copy-group="claim">HOOD Rerating Window</h1>
  <div class="evidence" data-role="evidence" data-visual-level="2" data-logic-step-id="LSTEP_MECH" data-binding-ref="BIND_MECH" data-essential-copy-group="proof">Distribution meets settlement</div>
  <div class="condition" data-role="condition" data-visual-level="3" data-logic-step-id="LSTEP_ACTION" data-essential-copy-group="future">Watch usage and revenue</div>
</main></body></html>`;
}

function audit(source) {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-render-audit-test-"));
  const htmlPath = path.join(temp, "viewpoint.html");
  const output = path.join(temp, "audit");
  writeFileSync(htmlPath, source);
  const completed = spawnSync(process.execPath, [script, htmlPath, output], {
    encoding: "utf8",
    env: process.env,
  });
  const report = JSON.parse(readFileSync(path.join(output, "render-audit.json"), "utf8"));
  rmSync(temp, { recursive: true, force: true });
  return [completed, report];
}

const opts = { skip: !canAudit, timeout: 30_000 };
const codes = (report, key = "errors") => new Set(report[key].map((item) => item.code));

test("valid publication master at full and phone display scale", opts, () => {
  const [completed, report] = audit(html());
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.profile, "wide");
  assert.equal(report.profile_version, "render-audit-wide-v1");
  assert.match(report.audited_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.match(report.layout_fingerprint_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.viewports.map((item) => item.logic_step_ids), Array(2).fill(["LSTEP_ACTION", "LSTEP_CLAIM", "LSTEP_MECH"]));
  assert.deepEqual(report.viewports.map((item) => item.binding_refs), Array(2).fill(["BIND_MECH"]));
});

test("hidden binding is not rendered evidence", opts, () => {
  const [completed, report] = audit(html(".evidence{opacity:0}"));
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("BINDING_HIDDEN"));
  assert.deepEqual(report.viewports.map((item) => item.binding_refs), [[], []]);
});

test("phone-scale attention, font, and brand safe zone are measured", opts, () => {
  const source = html(".condition{left:1135px;top:475px;font-size:16px}.extra{position:absolute;left:900px;top:400px;font-size:40px}")
    .replace("</main>", '<span class="extra" data-essential-copy-group="extra">extra</span></main>');
  const [completed, report] = audit(source);
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("MIN_FONT"));
  assert.ok(codes(report).has("BRAND_SAFE_ZONE"));
  assert.ok(codes(report).has("PHONE_ESSENTIAL_FONT"));
  assert.ok(codes(report).has("PHONE_COPY_GROUPS"));
});

test("phone audit scales the same master without responsive reflow", opts, () => {
  const source = html().replace(
    "@media(max-width:1000px){main{transform:scale(.5)}}",
    "@media(max-width:1000px){main{width:622px;height:264px;transform:none}.claim{left:26px;top:18px;width:570px;font-size:48px}.evidence{left:26px;top:126px;width:480px;font-size:22px}.condition{left:410px;top:202px;width:90px;font-size:18px}}",
  ).replace("Watch usage and revenue", "Hold");
  const [completed, report] = audit(source);
  assert.equal(completed.status, 0, JSON.stringify(report.errors));
  const phone = report.viewports.find((item) => item.width === 622);
  assert.equal(phone.display_scale, 0.5);
  assert.equal(phone.transform_scale, 0.5);
  assert.equal(phone.contract_scale, 0.5);
});

test("declared Noi profile requires loaded face", opts, () => {
  const source = html().replace(
    "data-cuebook-viewpoint data-width",
    'data-cuebook-viewpoint data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json" data-width',
  ).replace("font-family:-apple-system,BlinkMacSystemFont,sans-serif", 'font-family:"Cuebook Noi",sans-serif');
  const [completed, report] = audit(source);
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("NOI_FONT_NOT_LOADED"));
  assert.deepEqual(report.viewports.map((item) => item.font_profile), ["cuebook-noi-v1", "cuebook-noi-v1"]);
});

test("text crossing border line fails unless allowed", opts, () => {
  const bracket = html(".bracket{position:absolute;left:700px;top:430px;width:130px;height:20px;border-right:2px solid #223;border-bottom:2px solid #223}.bracket span{position:absolute;left:100px;top:0;font-size:24px;white-space:nowrap}")
    .replace("</main>", '<div class="bracket" data-role="evidence" data-visual-level="3"><span>+13.4% vs est</span></div></main>');
  let [completed, report] = audit(bracket);
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("TEXT_BORDER_COLLISION"));
  [completed, report] = audit(bracket.replace('data-role="evidence" data-visual-level="3"', 'data-role="evidence" data-visual-level="3" data-overlap-ok="true"'));
  assert.equal(completed.status, 0, JSON.stringify(report.errors));
});

test("display-scale value restatement fails unless allowed", opts, () => {
  const restated = html().replace("HOOD Rerating Window", "Floor >$600M").replace("Distribution meets settlement", "$600M+ lifts baseline");
  let [completed, report] = audit(restated);
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("VALUE_RESTATED"));
  [completed, report] = audit(restated.replace('data-role="evidence" data-visual-level="2"', 'data-role="evidence" data-visual-level="2" data-value-restate-ok="true"'));
  assert.equal(completed.status, 0, JSON.stringify(report.errors));
});

test("small value restatement is warning", opts, () => {
  const source = html(".claim{font-size:36px}.condition{font-size:36px}").replace("HOOD Rerating Window", "Inventory is 9B above expectations").replace("Watch usage and revenue", "Invalidation: the 9B gap closes");
  const [completed, report] = audit(source);
  assert.equal(completed.status, 0, JSON.stringify(report.errors));
  assert.ok(codes(report, "warnings").has("VALUE_RESTATED"));
});

test("proof-led composition needs evidence field", opts, () => {
  const source = html(".claim{left:50px;top:40px;width:360px;font-size:48px}.evidence{left:420px;top:50px;width:820px;height:360px;font-size:36px}.condition{left:50px;top:260px;width:300px;font-size:36px}")
    .replace("data-cuebook-viewpoint data-width", 'data-cuebook-viewpoint data-market-relationship="deviation" data-argument-archetype="forecast_surprise" data-composition-archetype="chart_stage" data-finance-transform="delta" data-baseline-policy="zero" data-chart-decision="chart" data-width');
  let [completed, report] = audit(source);
  assert.equal(completed.status, 0, JSON.stringify(report.errors));
  assert.ok(report.viewports[0].layout_metrics.evidence_area_ratio >= 0.28);
  [completed, report] = audit(source.replace("width:820px;height:360px", "width:300px;height:100px"));
  assert.notEqual(completed.status, 0);
  assert.ok(codes(report).has("PROOF_EVIDENCE_AREA"));
});
