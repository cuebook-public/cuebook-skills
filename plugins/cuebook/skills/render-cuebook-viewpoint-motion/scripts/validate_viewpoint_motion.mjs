#!/usr/bin/env node
/** Validate ViewpointMotionV1 manifest and optional local asset hashes. */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pyrepr } from "../../../scripts/validate_json_schema.mjs";

const ROOT_FIELDS = new Set([
  "schema_version", "motion_id", "spec_ref", "state", "framework", "animation_library",
  "dimensions", "timebase", "duration_ms", "fps", "lineage", "asset", "accessibility", "quality_report",
]);
const HASH_RE = /^sha256:[a-f0-9]{64}$/;

const issue = (code, issuePath, message) => ({ code, path: issuePath, message });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function validRelativeRef(value, suffixes) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && suffixes.some((suffix) => value.endsWith(suffix));
}

export function validate(payload, assetRoot = null) {
  const errors = [];
  const warnings = [];
  if (!isObject(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Expected an object.")], warnings: [] };
  }
  for (const key of Object.keys(payload).filter((key) => !ROOT_FIELDS.has(key)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  for (const key of [...ROOT_FIELDS].filter((key) => !Object.hasOwn(payload, key)).sort()) {
    errors.push(issue("MISSING_ROOT_FIELD", `$.${key}`, "Required root field is missing."));
  }

  if (payload.schema_version !== "viewpoint-motion-v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-motion-v1."));
  if (!/^VMOTION_[A-Za-z0-9_:-]{8,}$/.test(String(payload.motion_id || ""))) errors.push(issue("MOTION_ID", "$.motion_id", "Expected VMOTION_* ID."));
  if (!/^VMSPEC_[A-Za-z0-9_:-]{8,}$/.test(String(payload.spec_ref || ""))) errors.push(issue("SPEC_REF", "$.spec_ref", "Expected VMSPEC_* reference."));
  if (!["draft", "ready", "frozen"].includes(payload.state)) errors.push(issue("STATE", "$.state", "Unsupported state."));
  if (payload.framework !== "react" || payload.animation_library !== "motion/react") errors.push(issue("RUNTIME", "$", "Expected React with motion/react."));
  if (payload.timebase !== "deterministic_ms") errors.push(issue("TIMEBASE", "$.timebase", "Expected deterministic_ms."));
  let duration = payload.duration_ms;
  if (!Number.isInteger(duration) || duration < 2400 || duration > 12000) {
    errors.push(issue("DURATION", "$.duration_ms", "Duration must be 2400-12000ms."));
    duration = 0;
  }
  if (![25, 30, 60].includes(payload.fps)) errors.push(issue("FPS", "$.fps", "FPS must be 25, 30, or 60."));

  const dimensions = isObject(payload.dimensions) ? payload.dimensions : {};
  const expectedDimensions = { width: 720, height: 420, compact_width: 360, compact_height: 210 };
  if (JSON.stringify(dimensions) !== JSON.stringify(expectedDimensions)) errors.push(issue("DIMENSIONS", "$.dimensions", "Expected 720x420 and 360x210 dimensions."));

  const assets = isObject(payload.asset) ? payload.asset : {};
  const refs = [];
  const component = isObject(assets.component) ? assets.component : {};
  const poster = isObject(assets.poster) ? assets.poster : {};
  if (!validRelativeRef(component.ref, [".tsx"])) errors.push(issue("COMPONENT_REF", "$.asset.component.ref", "Expected relative TSX component ref."));
  else refs.push(["$.asset.component", component.ref, String(component.sha256 || "")]);
  if (!validRelativeRef(poster.ref, [".png"])) errors.push(issue("POSTER_REF", "$.asset.poster.ref", "Expected relative PNG poster ref."));
  else refs.push(["$.asset.poster", poster.ref, String(poster.sha256 || "")]);

  let keyframes = assets.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length < 4 || keyframes.length > 7) {
    errors.push(issue("KEYFRAME_COUNT", "$.asset.keyframes", "Expected 4-7 keyframes."));
    keyframes = [];
  }
  let previous = -1;
  const seenTimes = new Set();
  for (const [index, frame] of keyframes.entries()) {
    const framePath = `$.asset.keyframes[${index}]`;
    if (!isObject(frame)) {
      errors.push(issue("KEYFRAME_TYPE", framePath, "Keyframe must be an object."));
      continue;
    }
    const atMs = frame.at_ms;
    if (!Number.isInteger(atMs) || atMs < 0 || (duration && atMs > duration)) {
      errors.push(issue("KEYFRAME_TIME", `${framePath}.at_ms`, "Keyframe time must lie inside duration."));
    } else {
      if (atMs <= previous || seenTimes.has(atMs)) errors.push(issue("KEYFRAME_ORDER", `${framePath}.at_ms`, "Keyframe times must be strictly increasing."));
      previous = atMs;
      seenTimes.add(atMs);
    }
    if (!validRelativeRef(frame.ref, [".png"])) errors.push(issue("KEYFRAME_REF", `${framePath}.ref`, "Expected relative PNG keyframe ref."));
    else refs.push([framePath, frame.ref, String(frame.sha256 || "")]);
  }
  if (keyframes.length) {
    const first = keyframes[0]?.at_ms;
    const last = keyframes.at(-1)?.at_ms;
    if (Number.isInteger(first) && first > 150) errors.push(issue("FIRST_FRAME", "$.asset.keyframes[0].at_ms", "First keyframe must be within 150ms."));
    if (duration && Number.isInteger(last) && last < duration - 50) errors.push(issue("FINAL_FRAME", "$.asset.keyframes[-1].at_ms", "Final keyframe must capture the final hold."));
  }

  let videos = assets.videos;
  if (!Array.isArray(videos) || videos.length > 2) {
    errors.push(issue("VIDEOS", "$.asset.videos", "videos must contain zero to two derivatives."));
    videos = [];
  }
  const seenFormats = new Set();
  for (const [index, video] of videos.entries()) {
    const videoPath = `$.asset.videos[${index}]`;
    if (!isObject(video) || !["mp4", "webm"].includes(video.format)) {
      errors.push(issue("VIDEO_FORMAT", videoPath, "Video format must be mp4 or webm."));
      continue;
    }
    const format = video.format;
    if (seenFormats.has(format)) errors.push(issue("DUPLICATE_VIDEO_FORMAT", `${videoPath}.format`, "Video formats must be unique."));
    seenFormats.add(format);
    if (!validRelativeRef(video.ref, [`.${format}`])) errors.push(issue("VIDEO_REF", `${videoPath}.ref`, "Video ref extension must match format."));
    else refs.push([videoPath, video.ref, String(video.sha256 || "")]);
  }

  for (const [refPath, ref, expectedHash] of refs) {
    if (!HASH_RE.test(expectedHash)) {
      errors.push(issue("ASSET_HASH", `${refPath}.sha256`, "Expected sha256:<64 lowercase hex>."));
      continue;
    }
    if (assetRoot !== null) {
      const root = path.resolve(assetRoot);
      const candidate = path.resolve(root, ref);
      const relative = path.relative(root, candidate);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        errors.push(issue("ASSET_ESCAPE", `${refPath}.ref`, "Asset ref escapes asset root."));
        continue;
      }
      if (!existsSync(candidate) || !statSync(candidate).isFile()) {
        errors.push(issue("ASSET_MISSING", `${refPath}.ref`, `Missing asset ${pyrepr(ref)}.`));
        continue;
      }
      const actual = `sha256:${createHash("sha256").update(readFileSync(candidate)).digest("hex")}`;
      if (actual !== expectedHash) errors.push(issue("ASSET_HASH_MISMATCH", `${refPath}.sha256`, `Hash mismatch for ${pyrepr(ref)}.`));
    }
  }

  const accessibility = isObject(payload.accessibility) ? payload.accessibility : {};
  if (accessibility.reduced_motion_verified !== true || accessibility.autoplay_audio !== false) errors.push(issue("ACCESSIBILITY", "$.accessibility", "Reduced motion must be verified and autoplay audio disabled."));

  const quality = isObject(payload.quality_report) ? payload.quality_report : {};
  const passFields = ["first_frame", "decisive_frame", "final_frame", "compact_readability", "data_integrity"];
  for (const name of passFields) {
    if (!["pass", "fail"].includes(quality[name])) errors.push(issue("QUALITY_FIELD", `$.quality_report.${name}`, "Expected pass or fail."));
  }
  if (!Number.isInteger(quality.console_errors) || quality.console_errors < 0) errors.push(issue("CONSOLE_ERRORS", "$.quality_report.console_errors", "Expected a non-negative integer."));
  let hardFailures = quality.hard_failures;
  if (!Array.isArray(hardFailures)) {
    errors.push(issue("HARD_FAILURES", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hardFailures = [];
  }
  if (["ready", "frozen"].includes(payload.state)) {
    if (quality.decision !== "ready" || hardFailures.length || quality.console_errors !== 0) errors.push(issue("READY_QUALITY", "$.quality_report", "Ready or frozen motion needs ready decision, zero console errors, and no hard failures."));
    for (const name of passFields) {
      if (quality[name] !== "pass") errors.push(issue("READY_GATE", `$.quality_report.${name}`, "All critical gates must pass."));
    }
  }
  if (!videos.length) warnings.push(issue("NO_VIDEO_DERIVATIVE", "$.asset.videos", "No video derivative is present; React motion remains publishable in Cuebook."));
  return { valid: errors.length === 0, errors, warnings };
}

function usageError(message) {
  process.stderr.write(`usage: validate_viewpoint_motion.mjs [-h] [--asset-root ASSET_ROOT] path\nvalidate_viewpoint_motion.mjs: error: ${message}\n`);
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  let inputPath = null;
  let assetRoot = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write("usage: validate_viewpoint_motion.mjs [-h] [--asset-root ASSET_ROOT] path\n");
      return;
    }
    if (arg === "--asset-root") {
      if (index + 1 >= args.length) usageError("argument --asset-root: expected one argument");
      assetRoot = args[++index];
    } else if (arg.startsWith("-")) usageError(`unrecognized arguments: ${arg}`);
    else if (inputPath === null) inputPath = arg;
    else usageError(`unrecognized arguments: ${arg}`);
  }
  if (inputPath === null) usageError("the following arguments are required: path");
  const result = validate(JSON.parse(readFileSync(inputPath, "utf8")), assetRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
