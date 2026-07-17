#!/usr/bin/env node
// Validate ViewpointMotionSpecV1 structure and Cuebook motion invariants.

import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { issue, pyrepr } from "../../../scripts/validate_json_schema.mjs";

const ROOT_FIELDS = new Set([
  "schema_version", "motion_spec_id", "state", "input_refs",
  "selected_visual_direction_ref", "message", "bindings", "form",
  "hero", "beats", "runtime", "accessibility", "outputs", "quality_report",
]);
const ROLES = new Set(["hook", "evidence", "mechanism", "reaction", "view", "settlement", "hold"]);
const PRIMITIVES = new Set(["reveal", "draw_path", "count", "focus_pull", "track", "morph", "pulse", "connect", "split", "settle"]);
const BINDING_KINDS = new Set(["creator_judgment", "fact", "metric", "series", "level", "event", "deadline", "quote", "relationship", "instrument"]);
const BINDING_STATES = new Set(["observed", "reported", "derived", "conditional", "creator_view"]);

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Python `str(x.get(k) or "")` used as an ID candidate: falsy values become "",
// and str() of any non-string value can never match the ID regexes below.
function idCandidate(value) {
  return typeof value === "string" ? value : "";
}

// Python `hero.get("binding_refs") or []` followed by iteration.
function pyIterable(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [...value];
  if (isDict(value)) return Object.keys(value);
  return [];
}

function listEquals(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i]);
}

export function validate(payload) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Expected an object.")], warnings: [] };
  }

  const payloadKeys = new Set(Object.keys(payload));
  for (const key of [...payloadKeys].filter((k) => !ROOT_FIELDS.has(k)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  for (const key of [...ROOT_FIELDS].filter((k) => !payloadKeys.has(k)).sort()) {
    errors.push(issue("MISSING_ROOT_FIELD", `$.${key}`, "Required root field is missing."));
  }

  if (payload.schema_version !== "viewpoint-motion-spec-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-motion-spec-v1."));
  }
  if (!/^VMSPEC_[A-Za-z0-9_:-]{8,}$/.test(idCandidate(payload.motion_spec_id))) {
    errors.push(issue("MOTION_SPEC_ID", "$.motion_spec_id", "Expected VMSPEC_* ID."));
  }
  if (!["draft", "keyframed", "approved"].includes(payload.state)) {
    errors.push(issue("STATE", "$.state", "Unsupported state."));
  }
  if (!/^VDIR_[A-Za-z0-9_:-]{6,}$/.test(idCandidate(payload.selected_visual_direction_ref))) {
    errors.push(issue("VISUAL_DIRECTION_REF", "$.selected_visual_direction_ref", "Expected selected VDIR_* reference."));
  }

  const inputRefs = payload.input_refs;
  if (!Array.isArray(inputRefs) || inputRefs.length < 2 || inputRefs.length !== new Set(inputRefs).size) {
    errors.push(issue("INPUT_REFS", "$.input_refs", "At least two unique input refs are required."));
  }

  let bindings = payload.bindings;
  const bindingMap = new Map();
  if (!Array.isArray(bindings) || bindings.length === 0) {
    errors.push(issue("BINDINGS", "$.bindings", "At least one binding is required."));
    bindings = [];
  }
  bindings.forEach((binding, index) => {
    const path = `$.bindings[${index}]`;
    if (!isDict(binding)) {
      errors.push(issue("BINDING_TYPE", path, "Binding must be an object."));
      return;
    }
    const bindingId = idCandidate(binding.binding_id);
    if (!/^BIND_[A-Za-z0-9_:-]{4,}$/.test(bindingId)) {
      errors.push(issue("BINDING_ID", `${path}.binding_id`, "Expected BIND_* ID."));
    } else if (bindingMap.has(bindingId)) {
      errors.push(issue("DUPLICATE_BINDING", `${path}.binding_id`, "Binding IDs must be unique."));
    } else {
      bindingMap.set(bindingId, binding);
    }
    if (!BINDING_KINDS.has(binding.kind)) {
      errors.push(issue("BINDING_KIND", `${path}.kind`, "Unsupported binding kind."));
    }
    if (!BINDING_STATES.has(binding.state)) {
      errors.push(issue("BINDING_STATE", `${path}.state`, "Unsupported binding state."));
    }
    if (!nonempty(binding.label)) {
      errors.push(issue("BINDING_LABEL", `${path}.label`, "Binding label is required."));
    }
    const sources = binding.source_refs;
    if (!Array.isArray(sources) || sources.length === 0 || sources.length !== new Set(sources).size) {
      errors.push(issue("BINDING_SOURCES", `${path}.source_refs`, "Unique source refs are required."));
    }
    const value = binding.value;
    if (typeof value === "number" && !Number.isFinite(value)) {
      errors.push(issue("NONFINITE_VALUE", `${path}.value`, "Binding values must be finite."));
    }
  });

  const hero = isDict(payload.hero) ? payload.hero : {};
  if (hero.observed_geometry !== "solid" || hero.conditional_geometry !== "dashed") {
    errors.push(issue("GEOMETRY_SEMANTICS", "$.hero", "Observed geometry must be solid and conditional geometry dashed."));
  }
  for (const ref of pyIterable(hero.binding_refs)) {
    if (!bindingMap.has(ref)) {
      errors.push(issue("UNKNOWN_HERO_BINDING", "$.hero.binding_refs", `Unknown binding ${pyrepr(ref)}.`));
    }
  }

  const runtime = isDict(payload.runtime) ? payload.runtime : {};
  let duration = runtime.duration_ms;
  if (runtime.framework !== "react" || runtime.animation_library !== "motion/react") {
    errors.push(issue("RUNTIME", "$.runtime", "Runtime must be React with motion/react."));
  }
  if (runtime.timebase !== "deterministic_ms" || runtime.supports_external_time !== true) {
    errors.push(issue("DETERMINISTIC_TIME", "$.runtime", "Deterministic external time is required."));
  }
  if (runtime.loop !== false || runtime.in_view_once !== true) {
    errors.push(issue("FEED_PLAYBACK", "$.runtime", "Feed motion must play once and never loop."));
  }
  if (!Number.isInteger(duration) || !(duration >= 2400 && duration <= 12000)) {
    errors.push(issue("DURATION", "$.runtime.duration_ms", "Duration must be 2400-12000ms."));
    duration = 0;
  }
  if (![25, 30, 60].includes(runtime.fps)) {
    errors.push(issue("FPS", "$.runtime.fps", "FPS must be 25, 30, or 60."));
  }

  const accessibility = isDict(payload.accessibility) ? payload.accessibility : {};
  if (accessibility.reduced_motion !== "static_poster" || accessibility.audio_default !== false) {
    errors.push(issue("ACCESSIBILITY", "$.accessibility", "Reduced motion must use the static poster and Feed audio must default off."));
  }

  let beats = payload.beats;
  if (!Array.isArray(beats) || !(beats.length >= 4 && beats.length <= 7)) {
    errors.push(issue("BEAT_COUNT", "$.beats", "Motion requires 4-7 beats."));
    beats = [];
  }
  const seenBeats = new Set();
  let previousStart = -1;
  const keyframeRefs = [];
  beats.forEach((beat, index) => {
    const path = `$.beats[${index}]`;
    if (!isDict(beat)) {
      errors.push(issue("BEAT_TYPE", path, "Beat must be an object."));
      return;
    }
    const beatId = idCandidate(beat.beat_id);
    if (!/^BEAT_[A-Za-z0-9_:-]{4,}$/.test(beatId)) {
      errors.push(issue("BEAT_ID", `${path}.beat_id`, "Expected BEAT_* ID."));
    } else if (seenBeats.has(beatId)) {
      errors.push(issue("DUPLICATE_BEAT", `${path}.beat_id`, "Beat IDs must be unique."));
    }
    seenBeats.add(beatId);
    const role = beat.role;
    if (!ROLES.has(role)) {
      errors.push(issue("BEAT_ROLE", `${path}.role`, "Unsupported beat role."));
    }
    const start = beat.start_ms;
    const end = beat.end_ms;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      errors.push(issue("BEAT_TIMING", path, "Beat timing must satisfy 0 <= start < end."));
    } else {
      if (start < previousStart) {
        errors.push(issue("BEAT_ORDER", `${path}.start_ms`, "Beats must be ordered by start time."));
      }
      previousStart = start;
      if (duration && end > duration) {
        errors.push(issue("BEAT_AFTER_DURATION", `${path}.end_ms`, "Beat exceeds runtime duration."));
      }
    }
    let refs = beat.binding_refs;
    if (!Array.isArray(refs) || refs.length === 0) {
      errors.push(issue("BEAT_BINDINGS", `${path}.binding_refs`, "Each beat needs at least one binding."));
      refs = [];
    }
    for (const ref of refs) {
      if (!bindingMap.has(ref)) {
        errors.push(issue("UNKNOWN_BEAT_BINDING", `${path}.binding_refs`, `Unknown binding ${pyrepr(ref)}.`));
      }
    }
    const primitives = beat.motion_primitives;
    if (!Array.isArray(primitives) || primitives.length === 0 || primitives.length > 3 || primitives.some((item) => !PRIMITIVES.has(item))) {
      errors.push(issue("MOTION_PRIMITIVES", `${path}.motion_primitives`, "Use 1-3 supported motion primitives."));
    }
    const keyframe = beat.keyframe_ref;
    if (typeof keyframe !== "string" || !keyframe.endsWith(".png") || keyframe.startsWith("/")) {
      errors.push(issue("KEYFRAME_REF", `${path}.keyframe_ref`, "Keyframe ref must be a relative PNG path."));
    } else {
      keyframeRefs.push(keyframe);
    }
    if (role === "settlement") {
      const settlementKinds = new Set(refs.map((ref) => {
        const bound = bindingMap.get(ref);
        return bound ? bound.kind : undefined;
      }));
      if (!settlementKinds.has("deadline") && !settlementKinds.has("level")) {
        errors.push(issue("SETTLEMENT_BINDING", path, "Settlement beat requires a deadline or level binding."));
      }
    }
  });

  if (beats.length > 0) {
    const firstStart = beats[0].start_ms;
    const lastEnd = beats[beats.length - 1].end_ms;
    if (Number.isInteger(firstStart) && firstStart > 150) {
      errors.push(issue("LATE_FIRST_BEAT", "$.beats[0].start_ms", "The first beat must begin within 150ms."));
    }
    if (duration && Number.isInteger(lastEnd) && lastEnd < duration - 50) {
      errors.push(issue("MISSING_FINAL_HOLD", "$.beats[-1].end_ms", "The last beat must reach the final frame."));
    }
    const last = beats[beats.length - 1];
    if (last.role !== "hold") {
      errors.push(issue("FINAL_ROLE", "$.beats[-1].role", "The final beat must be a readable hold."));
    } else if (Number.isInteger(last.start_ms) && Number.isInteger(last.end_ms) && last.end_ms - last.start_ms < 450) {
      errors.push(issue("SHORT_FINAL_HOLD", "$.beats[-1]", "Final hold must last at least 450ms."));
    }
  }

  const outputs = isDict(payload.outputs) ? payload.outputs : {};
  if ((outputs.poster_ref ?? null) !== (accessibility.poster_ref ?? null)) {
    errors.push(issue("POSTER_MISMATCH", "$.outputs.poster_ref", "Output and accessibility poster refs must match."));
  }
  const outputKeyframes = outputs.keyframe_refs;
  if (!listEquals(outputKeyframes, keyframeRefs)) {
    errors.push(issue("KEYFRAME_LIST_MISMATCH", "$.outputs.keyframe_refs", "Output keyframes must match beat keyframes in order."));
  }
  const componentRef = outputs.component_ref;
  if (typeof componentRef !== "string" || componentRef.startsWith("/") || !componentRef.endsWith(".tsx")) {
    errors.push(issue("COMPONENT_REF", "$.outputs.component_ref", "Component ref must be a relative TSX path."));
  }

  const quality = isDict(payload.quality_report) ? payload.quality_report : {};
  // Python iterated a set literal here; we use the source-listed order deterministically.
  const scoreNames = ["semantic_continuity", "keyframe_readability", "data_integrity", "motion_craft", "reduced_motion", "weighted_score"];
  for (const name of scoreNames) {
    const value = quality[name];
    if (typeof value !== "number" || !(value >= 0 && value <= 10)) {
      errors.push(issue("QUALITY_SCORE", `$.quality_report.${name}`, "Quality score must be 0-10."));
    }
  }
  let hardFailures = quality.hard_failures;
  if (!Array.isArray(hardFailures)) {
    errors.push(issue("HARD_FAILURES", "$.quality_report.hard_failures", "hard_failures must be an array."));
    hardFailures = [];
  }
  if (payload.state === "approved") {
    if (quality.verdict !== "pass" || hardFailures.length > 0) {
      errors.push(issue("APPROVED_QUALITY", "$.quality_report", "Approved motion requires pass verdict and no hard failures."));
    }
    for (const name of ["semantic_continuity", "keyframe_readability", "data_integrity", "reduced_motion"]) {
      const value = quality[name];
      if (typeof value === "number" && value < 7) {
        errors.push(issue("APPROVED_SCORE", `$.quality_report.${name}`, "Approved motion requires critical scores >= 7."));
      }
    }
  }
  if (quality.verdict === "pass" && typeof quality.weighted_score === "number" && quality.weighted_score < 7.5) {
    warnings.push(issue("LOW_PASS_SCORE", "$.quality_report.weighted_score", "Pass score is below the recommended 7.5 threshold."));
  }

  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const prog = basename(process.argv[1] || "validate_viewpoint_motion_spec.mjs");
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(`usage: ${prog} [-h] path\n\npositional arguments:\n  path\n\noptions:\n  -h, --help  show this help message and exit\n`);
    process.exit(0);
  }
  if (args.length < 1) {
    process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: the following arguments are required: path\n`);
    process.exit(2);
  }
  if (args.length > 1) {
    process.stderr.write(`usage: ${prog} [-h] path\n${prog}: error: unrecognized arguments: ${args.slice(1).join(" ")}\n`);
    process.exit(2);
  }
  const payload = JSON.parse(readFileSync(args[0], "utf-8"));
  const result = validate(payload);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  main();
}
