#!/usr/bin/env node
// Validate CreatorSeedV1.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/creator-seed-v1.schema.json", import.meta.url), "utf-8"),
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

export function validate(payload) {
  const errors = validateInstance(payload, SCHEMA);
  if (isDict(payload) && get(payload, "stance_source") !== "creator_seed") {
    if (get(payload, "adoption_confirmed") !== true || !truthy(get(payload, "source_claim_refs"))) {
      errors.push({
        code: "SOURCE_STANCE_ADOPTION",
        path: "$.stance_source",
        message: "Cuebook or commentator stance requires explicit source refs and adoption confirmation.",
      });
    }
  }
  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_creator_seed.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf-8")));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
