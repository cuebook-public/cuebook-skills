#!/usr/bin/env node
// Validate the lightweight creator-facing FramePreviewV1 contract.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";

const require = createRequire(import.meta.url);
const captureHelpers = require(fileURLToPath(new URL(
  "../../direct-cuebook-viewpoint-visual/scripts/capture_html_viewpoint.cjs",
  import.meta.url,
)));
const { paintStats, pngDimensions } = captureHelpers;

const SCHEMA = JSON.parse(readFileSync(new URL("../references/frame-preview-v1.schema.json", import.meta.url), "utf8"));
const SELECTABLE_STATES = new Set(["ready", "conditional", "selected"]);
const COMPLETE_QUERY_STATES = new Set(["reused", "executed"]);
const REQUIRED_CHECKS = new Set(["creator_ownership", "source_binding", "copy_fit", "image_render"]);
const LOGIC_TEMPLATES = new Set(["verdict", "proof", "system"]);
const EDITORIAL_TEMPLATES = new Set([
  "curve_story", "relative_divergence", "drawdown_recovery", "correlation_shift", "event_window",
  "threshold_regime", "scenario_lanes", "causal_spine", "evidence_balance", "creator_lens", "long_short_lens",
]);
const PUBLIC_PROCESS_TERMS = [
  "\u5c0f\u7ea2\u4e66", "Reddit", "reddit", "Telegram", "telegram", "Twitter", "twitter", "\u63a8\u6587", "thread", "caption",
  "\u5de5\u4f5c\u6d41", "\u5019\u9009\u96c6", "\u8d28\u91cf\u8bc4\u5206", "\u8bc1\u636e\u8d26\u672c", "query bundle", "research pack", "settlement object",
];
const CORRECTION_FIRST_TERMS = ["\u6211\u8ba4\u9519", "\u54ea\u91cc\u8ba4\u9519", "\u9519\u4e86\u600e\u4e48\u529e"];

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
    errors.push(issue("QUERY_REQUIRED", "$.query_binding.status", "A current market preview needs a usable reconciled evidence binding."));
  }
  if (COMPLETE_QUERY_STATES.has(binding.status) || binding.status === "partial") {
    if (!bundleRefs.length || !resultRefs.length || typeof binding.as_of !== "string") {
      errors.push(issue("QUERY_LINEAGE", "$.query_binding", "Usable query status requires bundle refs, result refs, and as_of."));
    }
  }
  if (binding.status === "not_required" && (binding.required !== false || bundleRefs.length || resultRefs.length || binding.as_of !== null)) {
    errors.push(issue("QUERY_NOT_REQUIRED", "$.query_binding", "A not-required query cannot carry query lineage."));
  }
  if (binding.status === "partial" && state === "ready") {
    errors.push(issue("PARTIAL_QUERY", "$.state", "A partial query can produce only a conditional preview."));
  }
  if (binding.status === "unavailable" && state !== "blocked") {
    errors.push(issue("QUERY_UNAVAILABLE", "$.state", "Unavailable required evidence blocks the preview instead of inviting fabrication."));
  }

  const ids = new Set();
  const imageRefs = new Set();
  const frames = new Set();
  const knownResults = new Set(resultRefs);
  candidates.forEach((candidate, index) => {
    const candidatePath = `$.candidates[${index}]`;
    if (!isObject(candidate)) return;
    if (ids.has(candidate.candidate_id)) errors.push(issue("DUPLICATE_CANDIDATE", `${candidatePath}.candidate_id`, "Candidate IDs must be unique."));
    ids.add(candidate.candidate_id);
    if (candidate.visual_kind === "logic_card" && !LOGIC_TEMPLATES.has(candidate.template_id)) {
      errors.push(issue("VISUAL_ROUTE", `${candidatePath}.template_id`, "A logic card must use verdict, proof, or system."));
    }
    if (candidate.visual_kind === "market_chart" && candidate.template_id !== "thesis_chart") {
      errors.push(issue("VISUAL_ROUTE", `${candidatePath}.template_id`, "A market chart must use thesis_chart."));
    }
    if (candidate.visual_kind === "editorial_visual" && !EDITORIAL_TEMPLATES.has(candidate.template_id)) {
      errors.push(issue("VISUAL_ROUTE", `${candidatePath}.template_id`, "An editorial visual must use a registered fast-expression grammar."));
    }
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
      errors.push(issue("SOURCE_BINDING", `${candidatePath}.evidence_refs`, "A material current-market preview must bind at least one frozen query result."));
    }
    const missingEvidence = evidenceRefs.filter((ref) => !knownResults.has(ref));
    if (missingEvidence.length) errors.push(issue("EVIDENCE_REF", `${candidatePath}.evidence_refs`, "Candidate evidence refs must resolve through the frozen query binding."));
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
        try {
          const dimensions = pngDimensions(file);
          if (dimensions[0] !== 2488 || dimensions[1] !== 1056) {
            errors.push(issue("IMAGE_DIMENSIONS", `${candidatePath}.frame.image_ref`, "Fast preview must be exactly 2488 x 1056."));
          }
          const paint = paintStats(file);
          if (!Number.isFinite(paint.paintedRatio) || paint.paintedRatio < 0.006) {
            errors.push(issue("IMAGE_BLANK", `${candidatePath}.frame.image_ref`, "Fast preview must contain at least 0.6% materially painted pixels."));
          }
          if (!Number.isFinite(paint.nearBlackRatio) || paint.nearBlackRatio > 0.96) {
            errors.push(issue("IMAGE_BLACK", `${candidatePath}.frame.image_ref`, "Fast preview cannot be an incompletely painted black raster."));
          }
        } catch (error) {
          errors.push(issue("IMAGE_DECODE", `${candidatePath}.frame.image_ref`, `Fast preview must be a fully decodable PNG: ${error.message}`));
        }
        if (candidate.image_sha256 !== sha256(file)) errors.push(issue("IMAGE_HASH", `${candidatePath}.image_sha256`, "Preview PNG hash does not match the paired image."));
        if (candidate.image_byte_size !== statSync(file).size) errors.push(issue("IMAGE_SIZE", `${candidatePath}.image_byte_size`, "Preview PNG byte size does not match the paired image."));
      }
    }
  });

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
