#!/usr/bin/env node
// Validate query binding and candidate invariants for CuebookCreationBundleV1.

import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr, canonicalJson } from "../../../scripts/validate_json_schema.mjs";
import * as QUERY_VALIDATOR from "../../query-cuebook/scripts/validate_query_bundle.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/cuebook-creation-bundle-v1.schema.json", import.meta.url), "utf-8"),
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

export function query_bundle_hash(payload) {
  const canonical = canonicalJson(payload);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

export function validate(payload, queryBundle = null) {
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Creation bundle must be an object.")] };
  }
  const errors = validateInstance(payload, SCHEMA);
  if (get(payload, "schema_version") !== "cuebook-creation-bundle-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected cuebook-creation-bundle-v1."));
  }
  if (get(payload, "module_id") !== "create") {
    errors.push(issue("MODULE_ID", "$.module_id", "Creation bundle must identify the create module."));
  }

  const request = isDict(get(payload, "creator_request")) ? get(payload, "creator_request") : {};
  const binding = isDict(get(payload, "query_binding")) ? get(payload, "query_binding") : {};
  const material = get(request, "material_current_claims") === true;
  const required = get(binding, "required") === true;
  const status = get(binding, "status");
  const queryRef = get(binding, "query_bundle_ref");
  const queryHash = get(binding, "query_bundle_hash");
  const queryState = get(binding, "query_state");
  const freshness = get(binding, "freshness");
  const resultRefs = Array.isArray(get(binding, "result_refs")) ? get(binding, "result_refs") : [];

  if (material && !required) {
    errors.push(issue("MATERIAL_QUERY_REQUIRED", "$.query_binding.required", "Material current claims require a query binding."));
  }
  if (required && !["reused", "executed", "unavailable"].includes(status)) {
    errors.push(issue("QUERY_STATUS", "$.query_binding.status", "Required query must be reused, executed, or unavailable."));
  }
  if (
    ["reused", "executed"].includes(status)
    && (
      !truthy(queryRef)
      || !truthy(queryHash)
      || !resultRefs.length
      || !truthy(get(binding, "as_of"))
      || !["complete", "partial"].includes(queryState)
      || !["fresh", "accepted_stale"].includes(freshness)
    )
  ) {
    errors.push(issue("QUERY_LINEAGE", "$.query_binding", "Reused or executed query requires a hash, result refs, usable query state, freshness, and as-of time."));
  }
  if (["reused", "executed"].includes(status) && queryBundle == null) {
    errors.push(issue("QUERY_BUNDLE_REQUIRED", "$.query_binding", "Bound creation must be validated against the referenced QueryBundleV1."));
  }
  if (["reused", "executed"].includes(status) && queryBundle != null) {
    const queryResult = QUERY_VALIDATOR.validate(queryBundle);
    for (const queryError of queryResult.errors) {
      errors.push(issue("QUERY_BUNDLE_INVALID", queryError.path, `${queryError.code}: ${queryError.message}`));
    }
    if (isDict(queryBundle)) {
      const queryResults = get(queryBundle, "results", []);
      const knownResults = new Set(
        (Array.isArray(queryResults) ? queryResults : [])
          .filter((item) => isDict(item) && get(item, "status") !== "unavailable")
          .map((item) => get(item, "result_id")),
      );
      if (queryRef !== get(queryBundle, "query_id")) {
        errors.push(issue("QUERY_REF_MISMATCH", "$.query_binding.query_bundle_ref", "Query ref does not match the supplied bundle."));
      }
      if (queryHash !== query_bundle_hash(queryBundle)) {
        errors.push(issue("QUERY_HASH_MISMATCH", "$.query_binding.query_bundle_hash", "Query bundle hash does not match canonical content."));
      }
      if (queryState !== get(queryBundle, "state")) {
        errors.push(issue("QUERY_STATE_MISMATCH", "$.query_binding.query_state", "Bound query state differs from the supplied bundle."));
      }
      if (get(binding, "as_of") !== get(queryBundle, "as_of")) {
        errors.push(issue("QUERY_AS_OF_MISMATCH", "$.query_binding.as_of", "Bound query cutoff differs from the supplied bundle."));
      }
      const missingRefs = [...new Set(resultRefs)].filter((ref) => !knownResults.has(ref));
      if (missingRefs.length) {
        errors.push(issue("QUERY_RESULT_MISMATCH", "$.query_binding.result_refs", `Unknown or unavailable query result refs: ${pyrepr(missingRefs.slice().sort())}.`));
      }
    }
  }
  if (status === "not_required" && (required || truthy(queryRef) || truthy(queryHash) || resultRefs.length || queryState !== "not_applicable")) {
    errors.push(issue("NOT_REQUIRED_BINDING", "$.query_binding", "Not-required query binding cannot carry query lineage."));
  }
  if (status === "unavailable" && (truthy(queryRef) || truthy(queryHash) || resultRefs.length || queryState !== "blocked")) {
    errors.push(issue("UNAVAILABLE_BINDING", "$.query_binding", "Unavailable query must be blocked and cannot claim reusable lineage."));
  }

  const candidates = Array.isArray(get(payload, "candidate_refs")) ? get(payload, "candidate_refs") : [];
  const candidateSetRef = get(payload, "candidate_set_ref");

  const state = get(payload, "state");
  const quality = isDict(get(payload, "quality_report")) ? get(payload, "quality_report") : {};
  const hardFailures = Array.isArray(get(quality, "hard_failures")) ? get(quality, "hard_failures") : [];
  if (state === "ready" && (hardFailures.length || status === "unavailable")) {
    errors.push(issue("READY_STATE", "$.state", "Ready creation cannot have hard failures or unavailable required query."));
  }
  if (state === "ready" && queryState === "partial") {
    errors.push(issue("READY_WITH_PARTIAL_QUERY", "$.state", "A partial query can produce only conditional creation."));
  }
  if (["ready", "conditional"].includes(state) && (![1, 3].includes(candidates.length) || candidates.length !== new Set(candidates).size || !truthy(candidateSetRef))) {
    errors.push(issue("CANDIDATE_COUNT", "$.candidate_refs", "Frozen creation requires one selected candidate or three explicitly requested unique candidates."));
  }
  if (state === "blocked" && !hardFailures.length) {
    errors.push(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked creation requires a hard failure."));
  }
  if (state === "blocked" && (candidates.length || truthy(candidateSetRef))) {
    errors.push(issue("BLOCKED_CANDIDATES", "$.candidate_refs", "Blocked creation cannot contain publishable candidates."));
  }
  if (status === "unavailable" && state !== "blocked") {
    errors.push(issue("UNAVAILABLE_QUERY_BLOCKS", "$.state", "Unavailable required query must block creation."));
  }
  const stanceSource = get(request, "stance_source");
  const adoptedRefs = Array.isArray(get(request, "adopted_claim_refs")) ? get(request, "adopted_claim_refs") : [];
  if (stanceSource !== "creator_seed" && get(request, "authorship_mode") !== "cuebook_generated") {
    if (get(request, "adoption_confirmed") !== true || !adoptedRefs.length) {
      errors.push(issue("SOURCE_STANCE_ADOPTION", "$.creator_request", "A sourced stance must be explicitly adopted before it can be written as the creator's view."));
    }
  }
  const requestedOutputs = truthy(get(request, "requested_outputs")) ? get(request, "requested_outputs") : [];
  if (["ready", "conditional"].includes(state) && (!requestedOutputs.includes("text") || !requestedOutputs.includes("visual"))) {
    errors.push(issue("FRAME_OUTPUT_REQUIRED", "$.creator_request.requested_outputs", "Ready Cuebook creation requires both Frame text and one paired visual."));
  }
  if (truthy(get(payload, "release_bundle_ref")) && !requestedOutputs.includes("release")) {
    errors.push(issue("UNREQUESTED_RELEASE", "$.release_bundle_ref", "Release bundle requires a release output request."));
  }
  if (truthy(get(payload, "settlement_claim_ref")) && !requestedOutputs.includes("settlement")) {
    errors.push(issue("UNREQUESTED_SETTLEMENT", "$.settlement_claim_ref", "Settlement claim requires a settlement output request."));
  }
  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  const positionals = [];
  let queryBundlePath = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--query-bundle") {
      i += 1;
      if (i >= args.length) {
        process.stderr.write("usage: validate_creation_bundle.mjs json_file [--query-bundle QUERY_BUNDLE]\n");
        process.exit(2);
      }
      queryBundlePath = args[i];
    } else if (arg.startsWith("--query-bundle=")) {
      queryBundlePath = arg.slice("--query-bundle=".length);
    } else if (arg.startsWith("-")) {
      process.stderr.write("usage: validate_creation_bundle.mjs json_file [--query-bundle QUERY_BUNDLE]\n");
      process.exit(2);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    process.stderr.write("usage: validate_creation_bundle.mjs json_file [--query-bundle QUERY_BUNDLE]\n");
    process.exit(2);
  }
  const queryBundle = queryBundlePath ? JSON.parse(readFileSync(queryBundlePath, "utf-8")) : null;
  const result = validate(JSON.parse(readFileSync(positionals[0], "utf-8")), queryBundle);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
