#!/usr/bin/env node
// Validate the read-only and lineage invariants of CuebookQueryBundleV1.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr } from "./validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/cuebook-query-bundle-v1.schema.json", import.meta.url), "utf-8"),
);

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Mirror Python dict.get: default null stands in for None (missing keys).
function get(obj, key, dflt = null) {
  if (!isDict(obj)) throw new TypeError(`'${typeof obj}' object has no attribute 'get'`);
  return Object.hasOwn(obj, key) ? obj[key] : dflt;
}

// Python truthiness for JSON values.
function truthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function validate(payload) {
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Query bundle must be an object.")] };
  }
  const errors = validateInstance(payload, SCHEMA);
  if (get(payload, "schema_version") !== "cuebook-query-bundle-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected cuebook-query-bundle-v1."));
  }
  if (get(payload, "module_id") !== "query") {
    errors.push(issue("MODULE_ID", "$.module_id", "Query bundle must identify the query module."));
  }
  if (get(payload, "read_only") !== true) {
    errors.push(issue("READ_ONLY", "$.read_only", "Cuebook query output must remain read-only."));
  }

  const results = Array.isArray(get(payload, "results")) ? get(payload, "results") : [];
  const sources = Array.isArray(get(payload, "source_register")) ? get(payload, "source_register") : [];
  const resultIds = results.filter((item) => isDict(item)).map((item) => get(item, "result_id"));
  const sourceIds = sources.filter((item) => isDict(item)).map((item) => get(item, "source_ref"));
  if (resultIds.length !== new Set(resultIds).size) {
    errors.push(issue("DUPLICATE_RESULT", "$.results", "Result IDs must be unique."));
  }
  if (sourceIds.length !== new Set(sourceIds).size) {
    errors.push(issue("DUPLICATE_SOURCE", "$.source_register", "Source refs must be unique."));
  }
  const knownSources = new Set(sourceIds);
  const webSources = sources.filter((item) => isDict(item) && get(item, "retrieved_via") === "authorized_web");
  for (const [index, source] of sources.entries()) {
    if (!isDict(source)) continue;
    if (get(source, "retrieved_via") === "authorized_web" && !/^https?:\/\//u.test(String(get(source, "locator", "")))) {
      errors.push(issue("WEB_SOURCE_LOCATOR", `$.source_register[${index}].locator`, "Authorized Web sources require a public HTTP(S) locator."));
    }
    if (get(source, "retrieved_via") === "local_derivation" && get(source, "source_type") !== "calculation") {
      errors.push(issue("DERIVATION_SOURCE_TYPE", `$.source_register[${index}].source_type`, "Local derivations must use source_type calculation."));
    }
  }

  const retrieval = isDict(get(payload, "retrieval_report")) ? get(payload, "retrieval_report") : {};
  const webBatches = get(retrieval, "web_batches", 0);
  const webQueries = get(retrieval, "web_queries", 0);
  const declaredWebRefs = Array.isArray(get(retrieval, "web_source_refs")) ? get(retrieval, "web_source_refs") : [];
  const actualWebRefs = webSources.map((source) => get(source, "source_ref"));
  if (new Set(declaredWebRefs).size !== new Set(actualWebRefs).size || declaredWebRefs.some((ref) => !actualWebRefs.includes(ref))) {
    errors.push(issue("WEB_SOURCE_LINEAGE", "$.retrieval_report.web_source_refs", "Web source refs must exactly match source_register entries retrieved via authorized_web."));
  }
  if (webBatches === 0 && (webQueries !== 0 || declaredWebRefs.length)) {
    errors.push(issue("WEB_BATCH_STATE", "$.retrieval_report", "A zero-batch Web report cannot carry queries or Web source refs."));
  }
  if (webBatches === 1 && !(Number.isInteger(webQueries) && webQueries >= 1 && webQueries <= 3)) {
    errors.push(issue("WEB_BATCH_STATE", "$.retrieval_report.web_queries", "One bounded Web batch requires one to three targeted queries."));
  }
  if (get(payload, "request")?.depth === "quick" && get(retrieval, "cuebook_batches", 0) > 1) {
    errors.push(issue("QUICK_CUEBOOK_BATCHES", "$.retrieval_report.cuebook_batches", "Quick retrieval permits at most one Cuebook batch after asset resolution."));
  }

  results.forEach((item, index) => {
    if (!isDict(item)) {
      errors.push(issue("RESULT_TYPE", `$.results[${index}]`, "Result must be an object."));
      return;
    }
    const sourceRefs = truthy(get(item, "source_refs")) ? get(item, "source_refs") : [];
    const missing = [...new Set(sourceRefs)].filter((ref) => !knownSources.has(ref));
    if (missing.length) {
      errors.push(issue("UNKNOWN_SOURCE_REF", `$.results[${index}].source_refs`, `Unknown source refs: ${pyrepr(missing.slice().sort())}.`));
    }
  });

  const handoff = isDict(get(payload, "creation_handoff")) ? get(payload, "creation_handoff") : {};
  const handoffRefs = truthy(get(handoff, "result_refs")) ? get(handoff, "result_refs") : [];
  const resultIdSet = new Set(resultIds);
  const missingResults = [...new Set(handoffRefs)].filter((ref) => !resultIdSet.has(ref));
  if (missingResults.length) {
    errors.push(issue("UNKNOWN_HANDOFF_RESULT", "$.creation_handoff.result_refs", `Unknown result refs: ${pyrepr(missingResults.slice().sort())}.`));
  }
  if (truthy(get(handoff, "eligible")) && !truthy(get(handoff, "result_refs"))) {
    errors.push(issue("EMPTY_HANDOFF", "$.creation_handoff", "Eligible creation handoff requires at least one result ref."));
  }
  const statusByResult = new Map();
  for (const item of results) {
    if (isDict(item)) statusByResult.set(get(item, "result_id"), get(item, "status"));
  }
  const unavailableHandoff = [...handoffRefs].filter((resultRef) => statusByResult.get(resultRef) === "unavailable");
  if (unavailableHandoff.length) {
    errors.push(issue("UNAVAILABLE_HANDOFF", "$.creation_handoff.result_refs", `Unavailable results cannot enter creation: ${pyrepr(unavailableHandoff)}.`));
  }

  const state = get(payload, "state");
  const quality = isDict(get(payload, "quality_report")) ? get(payload, "quality_report") : {};
  const hardFailures = Array.isArray(get(quality, "hard_failures")) ? get(quality, "hard_failures") : [];
  const unavailable = Array.isArray(get(payload, "unavailable_capabilities")) ? get(payload, "unavailable_capabilities") : [];
  if (state === "complete" && (hardFailures.length || unavailable.length || !results.length)) {
    errors.push(issue("COMPLETE_STATE", "$.state", "Complete query requires results and no hard failures or unavailable capabilities."));
  }
  const warnings = Array.isArray(get(quality, "warnings")) ? get(quality, "warnings") : [];
  const usableResults = results.filter((item) => isDict(item) && ["available", "conditional"].includes(get(item, "status")));
  if (state === "partial" && (!usableResults.length || !(warnings.length || unavailable.length))) {
    errors.push(issue("PARTIAL_STATE", "$.state", "Partial query requires at least one usable result and an explicit warning or unavailable capability."));
  }
  if (state === "blocked" && !hardFailures.length) {
    errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked query requires a hard failure."));
  }
  if (state === "blocked" && (truthy(get(handoff, "eligible")) || truthy(get(handoff, "result_refs")))) {
    errors.push(issue("BLOCKED_HANDOFF", "$.creation_handoff", "Blocked query cannot hand results to creation."));
  }
  if (!truthy(get(handoff, "eligible")) && truthy(get(handoff, "result_refs"))) {
    errors.push(issue("INELIGIBLE_HANDOFF", "$.creation_handoff", "Ineligible creation handoff cannot carry result refs."));
  }
  if (unavailable.length && state === "complete") {
    errors.push(issue("UNAVAILABLE_COMPLETE", "$.unavailable_capabilities", "Unavailable capabilities require partial or blocked state."));
  }
  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_query_bundle.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf-8")));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
