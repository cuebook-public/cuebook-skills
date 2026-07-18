#!/usr/bin/env node
// Build a validated, no-database example of the Cuebook creator workflow.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate as validateCatalog } from "../../compose-cuebook-content-recipe/scripts/validate_skill_catalog.mjs";
import { validate as validateRecipe } from "../../compose-cuebook-content-recipe/scripts/validate_content_recipe.mjs";
import { validate as validateHistory } from "../../reconcile-market-content-history/scripts/validate_content_history.mjs";
import { validate as validateFeed } from "../../normalize-cuebook-creator-feed/scripts/validate_creator_feed.mjs";
import { validate as validateOpportunities } from "../../select-cuebook-content-opportunities/scripts/validate_content_opportunities.mjs";
import { validate as validateWorkflow } from "./validate_creator_workflow.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skills = path.resolve(scriptDir, "..", "..");
const fixtureDir = path.resolve(scriptDir, "..", "tests", "fixtures", "example");
export const DEFAULT_OUTPUT = path.join(os.homedir(), "outputs", "cuebook-creator-workflow-example-20260714");

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

export function canonical_bytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

export function digest(value) {
  return `sha256:${createHash("sha256").update(canonical_bytes(value)).digest("hex")}`;
}

const loadJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function build_bundle(outputDir) {
  const feed = loadJson(path.join(fixtureDir, "creator-feed-v1.json"));
  const opportunities = loadJson(path.join(fixtureDir, "content-opportunity-set-v1.json"));
  const recipe = loadJson(path.join(fixtureDir, "content-recipe-v1.json"));
  const workflow = loadJson(path.join(fixtureDir, "creator-workflow-run-v1.json"));
  const history = loadJson(path.join(fixtureDir, "content-history-ledger-v1.json"));
  const catalog = loadJson(path.join(skills, "compose-cuebook-content-recipe", "references", "skill-catalog-v1.json"));

  const artifactHashes = { ART_feed: digest(feed), ART_ops: digest(opportunities), ART_recipe: digest(recipe) };
  for (const artifact of workflow.artifact_registry) {
    if (artifactHashes[artifact.artifact_id]) artifact.content_hash = artifactHashes[artifact.artifact_id];
  }

  const results = {
    "skill-catalog-v1.json": validateCatalog(catalog),
    "creator-feed-v1.json": validateFeed(feed),
    "content-opportunity-set-v1.json": validateOpportunities(opportunities, feed),
    "content-recipe-v1.json": validateRecipe(recipe, feed, opportunities, catalog),
    "creator-workflow-run-v1.json": validateWorkflow(workflow, opportunities, recipe, catalog),
    "content-history-ledger-v1.json": validateHistory(history),
  };
  const invalid = Object.fromEntries(Object.entries(results).filter(([, result]) => !result.valid));
  if (Object.keys(invalid).length) throw new Error(JSON.stringify(invalid, null, 2));

  mkdirSync(outputDir, { recursive: true });
  const artifacts = {
    "skill-catalog-v1.json": catalog,
    "creator-feed-v1.json": feed,
    "content-opportunity-set-v1.json": opportunities,
    "content-recipe-v1.json": recipe,
    "creator-workflow-run-v1.json": workflow,
    "content-history-ledger-v1.json": history,
  };
  const manifest = {
    scenario: "Example Corp Q2 source-only revision watch",
    catalog_version: catalog.catalog_version,
    workflow_profile: "source_only_no_trade_viewpoint_visual",
    database_required: false,
    sequence: Object.keys(artifacts),
    validation: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, { valid: true, warnings: result.warnings }])),
    artifact_hashes: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, digest(value)])),
  };
  for (const [name, value] of Object.entries(artifacts)) writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main(argv) {
  if (argv.length > 1 || argv.includes("-h") || argv.includes("--help")) {
    if (argv.includes("-h") || argv.includes("--help")) {
      process.stdout.write("usage: build_example_bundle.mjs [output_dir]\n");
      return 0;
    }
    process.stderr.write("usage: build_example_bundle.mjs [output_dir]\n");
    return 2;
  }
  const outputDir = argv[0] ?? DEFAULT_OUTPUT;
  const manifest = build_bundle(outputDir);
  process.stdout.write(`${JSON.stringify({ output_dir: outputDir, ...manifest }, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
