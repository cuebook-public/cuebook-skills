#!/usr/bin/env node
// Validate the lightweight creator-facing FramePreviewV1 contract.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(readFileSync(new URL("../references/frame-preview-v1.schema.json", import.meta.url), "utf8"));
const SELECTABLE_STATES = new Set(["ready", "conditional", "selected"]);
const COMPLETE_QUERY_STATES = new Set(["reused", "executed"]);
const REQUIRED_CHECKS = new Set(["creator_ownership", "source_binding", "copy_fit", "image_render"]);
const PUBLIC_PROCESS_TERMS = [
  "小红书", "Reddit", "reddit", "Telegram", "telegram", "Twitter", "twitter", "推文", "thread", "caption",
  "工作流", "候选集", "质量评分", "证据账本", "query bundle", "research pack", "settlement object",
];
const CORRECTION_FIRST_TERMS = ["我认错", "哪里认错", "错了怎么办"];

function issue(code, issuePath, message) {
  return { code, path: issuePath, message };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePng(ref) {
  return typeof ref === "string"
    && ref.endsWith(".png")
    && !path.isAbsolute(ref)
    && !ref.split(/[\\/]/u).includes("..");
}

function pngDimensions(file) {
  const data = readFileSync(file);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length < 24 || !data.subarray(0, 8).equals(signature) || data.toString("ascii", 12, 16) !== "IHDR") return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function sha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

export function validate(payload, assetRoot = null) {
  if (!isObject(payload)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "Frame preview must be an object.")] };
  const errors = validateInstance(payload, SCHEMA);
  const state = payload.state;
  const generation = isObject(payload.generation) ? payload.generation : {};
  const expectedCount = generation.candidate_count;
  if (generation.mode === "recommended_one" && expectedCount !== 1) {
    errors.push(issue("GENERATION_MODE", "$.generation", "recommended_one requires candidate_count 1."));
  }
  if (generation.mode === "requested_three" && expectedCount !== 3) {
    errors.push(issue("GENERATION_MODE", "$.generation", "requested_three requires candidate_count 3."));
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (SELECTABLE_STATES.has(state) && candidates.length !== expectedCount) {
    errors.push(issue("CANDIDATE_COUNT", "$.candidates", "Selectable preview must match the requested candidate count."));
  }
  if (state === "blocked" && candidates.length) {
    errors.push(issue("BLOCKED_CANDIDATES", "$.candidates", "Blocked preview cannot expose partial candidates."));
  }

  const binding = isObject(payload.query_binding) ? payload.query_binding : {};
  const bundleRefs = Array.isArray(binding.bundle_refs) ? binding.bundle_refs : [];
  const resultRefs = Array.isArray(binding.result_refs) ? binding.result_refs : [];
  if (binding.required === true && SELECTABLE_STATES.has(state) && !COMPLETE_QUERY_STATES.has(binding.status) && binding.status !== "partial") {
    errors.push(issue("QUERY_REQUIRED", "$.query_binding.status", "A current market preview needs a usable Cuebook query binding."));
  }
  if (COMPLETE_QUERY_STATES.has(binding.status) || binding.status === "partial") {
    if (!bundleRefs.length || !resultRefs.length || typeof binding.as_of !== "string") {
      errors.push(issue("QUERY_LINEAGE", "$.query_binding", "Usable Cuebook query status requires bundle refs, result refs, and as_of."));
    }
  }
  if (binding.status === "not_required" && (binding.required !== false || bundleRefs.length || resultRefs.length || binding.as_of !== null)) {
    errors.push(issue("QUERY_NOT_REQUIRED", "$.query_binding", "A not-required query cannot carry query lineage."));
  }
  if (binding.status === "partial" && state === "ready") {
    errors.push(issue("PARTIAL_QUERY", "$.state", "A partial query can produce only a conditional preview."));
  }
  if (binding.status === "unavailable" && state !== "blocked") {
    errors.push(issue("QUERY_UNAVAILABLE", "$.state", "Unavailable required Cuebook data blocks the preview instead of inviting fabrication."));
  }

  const ids = new Set();
  const imageRefs = new Set();
  const frames = new Set();
  const angles = new Set();
  const templates = new Set();
  const knownResults = new Set(resultRefs);
  candidates.forEach((candidate, index) => {
    const candidatePath = `$.candidates[${index}]`;
    if (!isObject(candidate)) return;
    if (ids.has(candidate.candidate_id)) errors.push(issue("DUPLICATE_CANDIDATE", `${candidatePath}.candidate_id`, "Candidate IDs must be unique."));
    ids.add(candidate.candidate_id);
    angles.add(candidate.angle);
    templates.add(candidate.template_id);
    const frame = isObject(candidate.frame) ? candidate.frame : {};
    const publicCopy = `${frame.title ?? ""}\n${frame.body ?? ""}`;
    for (const term of [...PUBLIC_PROCESS_TERMS, ...CORRECTION_FIRST_TERMS]) {
      if (publicCopy.includes(term)) errors.push(issue("PUBLIC_LANGUAGE", `${candidatePath}.frame`, `Remove non-Frame or correction-first term ${JSON.stringify(term)}.`));
    }
    const normalizedFrame = publicCopy.replace(/\s+/gu, " ").trim();
    if (frames.has(normalizedFrame)) errors.push(issue("DUPLICATE_FRAME", `${candidatePath}.frame`, "Requested alternatives need genuinely different expression."));
    frames.add(normalizedFrame);
    if (!safeRelativePng(frame.image_ref)) errors.push(issue("IMAGE_REF", `${candidatePath}.frame.image_ref`, "Use one safe relative PNG reference."));
    else if (imageRefs.has(frame.image_ref)) errors.push(issue("DUPLICATE_IMAGE", `${candidatePath}.frame.image_ref`, "Each preview candidate needs its paired image."));
    else imageRefs.add(frame.image_ref);
    const evidenceRefs = Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs : [];
    if (binding.required === true && (COMPLETE_QUERY_STATES.has(binding.status) || binding.status === "partial") && !evidenceRefs.length) {
      errors.push(issue("SOURCE_BINDING", `${candidatePath}.evidence_refs`, "A material current-market preview must bind at least one Cuebook result."));
    }
    const missingEvidence = evidenceRefs.filter((ref) => !knownResults.has(ref));
    if (missingEvidence.length) errors.push(issue("EVIDENCE_REF", `${candidatePath}.evidence_refs`, "Candidate evidence refs must resolve through the frozen Cuebook query binding."));
    const checks = new Set(Array.isArray(candidate.quality_checks) ? candidate.quality_checks : []);
    if (checks.size !== REQUIRED_CHECKS.size || [...REQUIRED_CHECKS].some((check) => !checks.has(check))) {
      errors.push(issue("PREVIEW_CHECKS", `${candidatePath}.quality_checks`, "Run only the four lightweight preview checks."));
    }
    if (assetRoot !== null && safeRelativePng(frame.image_ref)) {
      const root = path.resolve(String(assetRoot));
      const file = path.resolve(root, frame.image_ref);
      if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file) || !statSync(file).isFile()) {
        errors.push(issue("IMAGE_MISSING", `${candidatePath}.frame.image_ref`, "Preview PNG does not exist under the asset root."));
      } else {
        const dimensions = pngDimensions(file);
        if (!dimensions || dimensions[0] !== 2488 || dimensions[1] !== 1056) {
          errors.push(issue("IMAGE_DIMENSIONS", `${candidatePath}.frame.image_ref`, "Fast preview must be exactly 2488 x 1056."));
        }
        if (candidate.image_sha256 !== sha256(file)) errors.push(issue("IMAGE_HASH", `${candidatePath}.image_sha256`, "Preview PNG hash does not match the paired image."));
      }
    }
  });

  if (generation.mode === "requested_three" && (angles.size !== 3 || templates.size !== 3)) {
    errors.push(issue("THREE_WAY_VARIATION", "$.candidates", "Three requested previews must use conviction/evidence/mechanism and verdict/proof/system once each."));
  }

  const selection = isObject(payload.selection) ? payload.selection : {};
  if (state === "selected") {
    if (selection.confirmed !== true || !ids.has(selection.selected_candidate_id)) {
      errors.push(issue("SELECTION", "$.selection", "Selected preview must confirm one candidate from this preview."));
    }
  } else if (selection.confirmed !== false || selection.selected_candidate_id !== null) {
    errors.push(issue("SELECTION", "$.selection", "Only selected state may carry a confirmed candidate."));
  }
  const blockers = Array.isArray(payload.blockers) ? payload.blockers : [];
  if (state === "blocked" && !blockers.length) errors.push(issue("BLOCKERS", "$.blockers", "Blocked preview needs at least one blocker."));
  if (state !== "blocked" && blockers.length) errors.push(issue("BLOCKERS", "$.blockers", "Non-blocked preview cannot carry blockers."));
  return { valid: errors.length === 0, errors };
}

function main() {
  const args = process.argv.slice(2);
  let assetRoot = null;
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--asset-root") assetRoot = args[(index += 1)];
    else if (arg.startsWith("--asset-root=")) assetRoot = arg.slice("--asset-root=".length);
    else if (arg.startsWith("-")) {
      process.stderr.write("usage: validate_frame_preview.mjs preview.json [--asset-root DIR]\n");
      process.exit(2);
    } else positionals.push(arg);
  }
  if (positionals.length !== 1 || assetRoot === undefined) {
    process.stderr.write("usage: validate_frame_preview.mjs preview.json [--asset-root DIR]\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(positionals[0], "utf8")), assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main();
