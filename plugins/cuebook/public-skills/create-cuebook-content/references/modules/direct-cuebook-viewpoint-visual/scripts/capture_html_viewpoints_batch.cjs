#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { browserExecutable, captureViewpoint } = require("./capture_html_viewpoint.cjs");

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function resolveFrom(base, value) {
  if (typeof value !== "string" || !value) throw new Error("Each job needs non-empty html and output_dir fields.");
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

async function main() {
  const [manifestArg] = process.argv.slice(2);
  if (!manifestArg) throw new Error("Usage: capture_html_viewpoints_batch.cjs <manifest.json>");
  const manifestPath = path.resolve(manifestArg);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.jobs) || manifest.jobs.length < 1 || manifest.jobs.length > 12) {
    throw new Error("Manifest jobs must contain 1-12 capture jobs.");
  }
  const concurrency = Number.isInteger(manifest.concurrency) ? manifest.concurrency : 3;
  if (concurrency < 1 || concurrency > 4) throw new Error("Concurrency must be 1-4.");
  const base = path.dirname(manifestPath);
  const jobs = manifest.jobs.map((job) => ({
    html: resolveFrom(base, job.html),
    outputDir: resolveFrom(base, job.output_dir),
  }));
  if (new Set(jobs.map((job) => job.outputDir)).size !== jobs.length) throw new Error("Output directories must be unique.");
  const browser = browserExecutable();
  if (!browser) throw new Error("No supported Chromium executable found.");
  const startedAt = Date.now();
  const results = await mapLimit(jobs, concurrency, (job) => captureViewpoint(job.html, job.outputDir, browser));
  process.stdout.write(`${JSON.stringify({
    schema_version: "viewpoint-html-batch-capture-v1",
    duration_ms: Date.now() - startedAt,
    jobs: results.map((result) => ({ output_dir: result.outputDir, duration_ms: result.report.duration_ms })),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
