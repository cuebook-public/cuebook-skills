#!/usr/bin/env node
// Validate CommunitySkillSubmissionV1: the local structural pre-check for one
// community skill package submission. The server enforces the same package
// rules byte-for-byte; this validator exists so a creator sees every rejection
// before a submission is spent.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/community-skill-submission-v1.schema.json", import.meta.url), "utf-8"),
);

export const MAX_PACKAGE_FILES = 40;
export const MAX_ZIP_BYTES = 524_288; // 512 KiB
export const MAX_SUMMARY_CHARS = 280;
export const MAX_DESCRIPTION_CHARS = 1024;
const ALLOWED_REFERENCE_PATTERN = /^references\/[^\n]+\.(?:md|json)$/u;
const PATH_SEGMENT_FORBIDDEN = new Set(["", ".", ".."]);

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code, path, message) {
  return { code, path, message };
}

// One package path, checked the way the server checks it: relative, forward
// slashes only, no empty or dot segments, and inside the allowed shape.
function pathIssues(path, index) {
  const errors = [];
  const where = `$.package.files[${index}].path`;
  if (path.includes("\\")) {
    errors.push(issue("PACKAGE_PATH_SEPARATOR", where, `Backslash separators are rejected: ${pyrepr(path)}.`));
    return errors;
  }
  if (path.startsWith("/")) {
    errors.push(issue("PACKAGE_PATH_ABSOLUTE", where, `Absolute paths are rejected: ${pyrepr(path)}.`));
    return errors;
  }
  const segments = path.split("/");
  if (segments.some((segment) => PATH_SEGMENT_FORBIDDEN.has(segment))) {
    errors.push(issue("PACKAGE_PATH_ESCAPE", where, `Empty or dot path segments are rejected: ${pyrepr(path)}.`));
    return errors;
  }
  if (path === "SKILL.md") return errors;
  if (!ALLOWED_REFERENCE_PATTERN.test(path)) {
    errors.push(issue(
      "PACKAGE_PATH_SHAPE",
      where,
      `Only the root SKILL.md plus references/**/*.md and references/**/*.json ship: ${pyrepr(path)}.`,
    ));
  }
  return errors;
}

export function validateSubmission(payload) {
  const errors = [...validateInstance(payload, SCHEMA)];
  if (errors.length > 0 || !isDict(payload)) {
    return { valid: false, errors, stats: {} };
  }

  const files = payload.package.files;
  const paths = files.map((file) => file.path);

  for (const [index, path] of paths.entries()) {
    errors.push(...pathIssues(path, index));
  }

  const exact = new Set(paths);
  if (exact.size !== paths.length) {
    errors.push(issue("PACKAGE_PATH_DUPLICATE", "$.package.files", "Duplicate package paths are rejected."));
  }
  const folded = new Set(paths.map((path) => path.toLowerCase()));
  if (folded.size !== exact.size) {
    errors.push(issue("PACKAGE_PATH_CASEFOLD", "$.package.files", "Paths that collide when case-folded are rejected."));
  }

  const skillDocCount = paths.filter((path) => path === "SKILL.md").length;
  if (skillDocCount !== 1) {
    errors.push(issue(
      "PACKAGE_SKILL_DOC",
      "$.package.files",
      `Exactly one root SKILL.md is required; found ${skillDocCount}.`,
    ));
  }

  if (!(Number.isInteger(payload.package.zip_bytes) && payload.package.zip_bytes >= 1 && payload.package.zip_bytes <= MAX_ZIP_BYTES)) {
    errors.push(issue(
      "PACKAGE_ZIP_SIZE",
      "$.package.zip_bytes",
      `Zip size must be 1..${MAX_ZIP_BYTES} bytes.`,
    ));
  }
  for (const [index, file] of files.entries()) {
    if (!(Number.isInteger(file.bytes) && file.bytes >= 0)) {
      errors.push(issue("PACKAGE_FILE_BYTES", `$.package.files[${index}].bytes`, "File byte size must be a non-negative integer."));
    }
  }

  const manifest = payload.manifest;
  if ([...manifest.summary].length > MAX_SUMMARY_CHARS) {
    errors.push(issue("MANIFEST_SUMMARY_LENGTH", "$.manifest.summary", `Summary must stay at or under ${MAX_SUMMARY_CHARS} characters.`));
  }
  if ([...manifest.description].length > MAX_DESCRIPTION_CHARS) {
    errors.push(issue("MANIFEST_DESCRIPTION_LENGTH", "$.manifest.description", `Description must stay at or under ${MAX_DESCRIPTION_CHARS} characters.`));
  }

  if (payload.confirmation.card_confirmed !== true) {
    errors.push(issue(
      "CARD_NOT_CONFIRMED",
      "$.confirmation.card_confirmed",
      "The manifest card must be explicitly confirmed before begin_skill_publish.",
    ));
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      file_count: paths.length,
      zip_bytes: payload.package.zip_bytes,
      declared_tier: manifest.declared_tier,
      slug: manifest.slug,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_community_skill_submission.mjs community-skill-submission-v1.json\n");
    process.exit(2);
  }
  const payload = JSON.parse(readFileSync(args[0], "utf-8"));
  const result = validateSubmission(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
