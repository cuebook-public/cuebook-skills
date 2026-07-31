#!/usr/bin/env node
// Turn one validated official TradingView snapshot into an audited Frame master.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";
import { auditFinishedBitmap } from "../references/modules/direct-cuebook-viewpoint-visual/scripts/audit_finished_bitmap.mjs";
import { stamp } from "../references/modules/direct-cuebook-viewpoint-visual/scripts/stamp_cuebook_wordmark.mjs";
import { validate as validateFocusedCapture } from "../references/modules/query-cuebook/scripts/validate_tradingview_focused_capture.mjs";

const require = createRequire(import.meta.url);
const { captureViewpoint, pngDimensions } = require("../references/modules/direct-cuebook-viewpoint-visual/scripts/capture_html_viewpoint.cjs");

const JOB_SCHEMA = JSON.parse(readFileSync(new URL("../references/tradingview-attributed-frame-job-v1.schema.json", import.meta.url), "utf8"));
const TARGET_WIDTH = 1866;
const TARGET_HEIGHT = 1200;
const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT;

function inside(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function resolveInside(root, ref, label) {
  const target = path.resolve(root, ref);
  if (!inside(root, target)) throw new Error(`${label} escaped the asset root.`);
  return target;
}

function resolveDeclared(root, locator) {
  return path.resolve(path.isAbsolute(locator) ? locator : path.join(root, locator));
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildSnapshotHtml(snapshotPath, theme) {
  const background = theme === "dark" ? "#111018" : "#F2F3F4";
  const source = htmlEscape(pathToFileURL(snapshotPath).href);
  const base = `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${background}}
main{position:relative;width:1244px;height:800px;overflow:hidden;background:${background}}
.tradingview-snapshot{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
</style></head><body><main data-cuebook-viewpoint data-width="1244" data-height="800" data-theme="${theme}" data-source-kind="official-tradingview-snapshot"><img class="tradingview-snapshot" src="${source}" alt=""></main></body></html>`;
  return stamp(base, theme)[0];
}

export async function runAttributedSnapshotFrame(job, assetRoot, outputDir, overrides = {}) {
  const schemaErrors = validateInstance(job, JOB_SCHEMA);
  if (schemaErrors.length) throw new Error(`Invalid TradingView attributed Frame job: ${JSON.stringify(schemaErrors)}`);

  const suppliedRoot = path.resolve(assetRoot);
  const root = realpathSync(suppliedRoot);
  const relativeOutput = path.relative(suppliedRoot, path.resolve(outputDir));
  if (relativeOutput === ".." || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
    throw new Error("Output directory must stay inside the asset root.");
  }
  const out = path.resolve(root, relativeOutput);
  mkdirSync(out, { recursive: true });

  const focusPath = resolveInside(root, job.focused_capture_ref, "focused_capture_ref");
  const snapshotPath = resolveInside(root, job.snapshot_ref, "snapshot_ref");
  const focus = JSON.parse(readFileSync(focusPath, "utf8"));
  const focusValidation = validateFocusedCapture(focus);
  if (!focusValidation.valid) throw new Error(`Focused capture is not publishable: ${JSON.stringify(focusValidation.errors)}`);
  if (focus.frame_bridge?.mode !== "attributed_finished_bitmap") throw new Error("Focused capture did not select attributed_finished_bitmap.");
  if (focus.source?.method !== "tradingview_snapshot") throw new Error("Only an official TradingView snapshot can enter this path.");
  if (realpathSync(resolveDeclared(root, focus.source.locator)) !== realpathSync(snapshotPath)) {
    throw new Error("snapshot_ref does not match the snapshot bound by the focused capture.");
  }

  const [sourceWidth, sourceHeight] = pngDimensions(snapshotPath);
  if (sourceWidth !== focus.source.width || sourceHeight !== focus.source.height) {
    throw new Error("Snapshot dimensions do not match the focused-capture source binding.");
  }
  const aspectDelta = Math.abs(sourceWidth / sourceHeight - TARGET_ASPECT) / TARGET_ASPECT;
  if (aspectDelta > 0.03) {
    throw new Error("Official snapshot aspect ratio is too far from 1.56:1; recapture the focused chart instead of padding, stretching, or cropping it blindly.");
  }

  const publicationPath = path.join(out, "publication.png");
  const htmlPath = path.join(out, "attributed-snapshot.html");
  const auditPath = path.join(out, "raster-audit.json");
  const resultPath = path.join(out, "attributed-frame-result.json");
  for (const target of [publicationPath, htmlPath, auditPath, resultPath]) {
    if (existsSync(target)) throw new Error(`Refusing to overwrite existing output: ${target}`);
  }
  if (resolveDeclared(root, focus.frame_bridge.publication_master.locator) !== publicationPath) {
    throw new Error("Output publication path does not match the focused-capture publication master binding.");
  }

  writeFileSync(htmlPath, buildSnapshotHtml(snapshotPath, job.theme), "utf8");
  const capture = overrides.captureViewpoint ?? captureViewpoint;
  await capture(htmlPath, out);
  const capturedPath = path.join(out, "viewpoint-1866.png");
  if (!existsSync(capturedPath)) throw new Error("Frame capture did not produce viewpoint-1866.png.");
  renameSync(capturedPath, publicationPath);

  const mutablePrice = focus.quality.mutable_price_visible ? "backend_locked" : "absent";
  const backendPriceLockRef = focus.frame_bridge.publication_master.backend_price_lock_ref;
  const auditRequest = {
    schema_version: "frame-finished-bitmap-audit-request-v1",
    audited_at: job.audited_at,
    renditions: { publication: { ref: "publication.png" } },
    image_review: {
      reviewer: job.image_review.reviewer,
      reviewed_at: job.image_review.reviewed_at,
      legibility: job.image_review.legibility,
      collision: job.image_review.collision,
      imagery_policy: job.image_review.imagery_policy,
      imagery_result: job.image_review.imagery_result,
      mutable_price: mutablePrice,
      backend_price_lock_ref: backendPriceLockRef,
    },
  };
  const audit = auditFinishedBitmap(auditRequest, out);
  writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  if (!audit.valid) throw new Error(`Finished bitmap audit failed: ${JSON.stringify(audit.errors)}`);

  const derivative = audit.derivatives.find((item) => item.kind === "full");
  const result = {
    schema_version: "tradingview-attributed-frame-result-v1",
    valid: true,
    publication_ref: path.relative(root, publicationPath),
    publication_sha256: derivative.sha256,
    publication_pixel_sha256: derivative.pixel_sha256,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    raster_audit_ref: path.relative(root, auditPath),
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function main(argv) {
  const input = argv[0];
  let assetRoot = null;
  let outputDir = null;
  for (let index = 1; index < argv.length; index += 2) {
    if (argv[index] === "--asset-root") assetRoot = argv[index + 1];
    else if (argv[index] === "--output-dir") outputDir = argv[index + 1];
    else throw new Error(`Unrecognized argument ${argv[index]}.`);
  }
  if (!input || !assetRoot || !outputDir) {
    throw new Error("Usage: build_tradingview_attributed_frame.mjs job.json --asset-root DIR --output-dir DIR");
  }
  const result = await runAttributedSnapshotFrame(JSON.parse(readFileSync(input, "utf8")), assetRoot, outputDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
