#!/usr/bin/env node
// Stable preview entrypoint. Route by meaning, not by renderer generation.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runLensPreviewJob } from "./run_lens_preview.mjs";
import { runMarketPreviewJob } from "./run_market_preview.mjs";

const ROUTES = Object.freeze({
  "frame-market-preview-job": runMarketPreviewJob,
  "frame-lens-preview-job": runLensPreviewJob,
});

export async function runFastPreviewJob(job, outputDir, dependencies = {}) {
  const run = ROUTES[job?.schema_version];
  if (!run) {
    const accepted = Object.keys(ROUTES).join(" or ");
    throw new Error(`Unsupported Frame preview job. Expected ${accepted}.`);
  }
  return run(job, outputDir, dependencies);
}

async function main() {
  const [input, outputDir] = process.argv.slice(2);
  if (!input || !outputDir || process.argv.length !== 4) {
    process.stderr.write("usage: run_fast_preview.mjs frame-preview-job.json output-dir\n");
    process.exitCode = 2;
    return;
  }
  const job = JSON.parse(readFileSync(input, "utf8"));
  const result = await runFastPreviewJob(job, outputDir);
  process.stdout.write(`${JSON.stringify(result.frame, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
