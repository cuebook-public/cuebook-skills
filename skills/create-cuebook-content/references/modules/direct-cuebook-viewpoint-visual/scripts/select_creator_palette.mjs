#!/usr/bin/env node
// Select three creator- and thesis-adaptive Cuebook palette presets.
//
// Port of select_creator_palette.py. Selection order, scores (Python round()
// half-to-even at two decimals, serialized as Python floats, e.g. "8.0"), and
// the JSON output are contract.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = path.join(SCRIPT_DIR, "..", "references", "creator-palette-presets-v1.json");
export const STRATEGIES = ["creator_native", "thesis_native", "contrast_variant"];

// Marks a value that Python holds as float so JSON serialization can render
// integral values as "8.0" the way json.dumps does.
class PyFloat {
  constructor(value) {
    this.value = value;
  }
}

// Python round(x, 2): correctly-rounded to two decimals, ties to even, applied
// to the exact binary value of the double.
export function pyRound2(x) {
  if (!Number.isFinite(x)) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const rawExponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let exponent;
  if (rawExponent === 0) {
    exponent = -1074;
  } else {
    mantissa |= 0x10000000000000n;
    exponent = rawExponent - 1075;
  }
  // |x| * 100 == numerator / denominator exactly.
  let numerator;
  let denominator;
  if (exponent >= 0) {
    numerator = mantissa * (1n << BigInt(exponent)) * 100n;
    denominator = 1n;
  } else {
    numerator = mantissa * 100n;
    denominator = 1n << BigInt(-exponent);
  }
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;
  if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) {
    quotient += 1n;
  }
  const magnitude = Number(quotient) / 100;
  return negative ? -magnitude : magnitude;
}

// repr(float) for the two-decimal score values this module produces.
function formatPyFloat(value) {
  if (Object.is(value, -0)) return "-0.0";
  if (Number.isInteger(value)) return `${value}.0`;
  return String(value);
}

// json.dumps(value, ensure_ascii=False, indent=2) with PyFloat support.
function pyJsonString(value) {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

function pyJsonDumpsIndent(value, depth = 0) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value instanceof PyFloat) return formatPyFloat(value.value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pyJsonString(value);
  const pad = "\n" + "  ".repeat(depth + 1);
  const endPad = "\n" + "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[${value.map((item) => pad + pyJsonDumpsIndent(item, depth + 1)).join(",")}${endPad}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  return `{${keys.map((key) => `${pad}${pyJsonString(key)}: ${pyJsonDumpsIndent(value[key], depth + 1)}`).join(",")}${endPad}}`;
}

function _number(value, fallback = 3) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : fallback;
}

function _range_fit(value, bounds) {
  const [low, high] = bounds;
  if (low <= value && value <= high) return 2.0;
  return Math.max(0.0, 2.0 - Math.min(Math.abs(value - low), Math.abs(value - high)));
}

function _slug_list(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).filter((item) => typeof item === "string" && item);
}

export function derive_profile(brief) {
  const registers = new Set(["desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"]);
  const register = registers.has(brief.register) ? brief.register : "strategist";
  const energy = _number(brief.energy);
  const conviction = _number(brief.conviction);
  const technicality = _number(brief.technicality);
  const emotionality = _number(brief.emotionality);
  const compression = _number(brief.compression);
  const contrast = energy + conviction >= 8 ? "high" : energy + conviction <= 4 ? "soft" : "balanced";
  let chroma;
  if (energy >= 4 && emotionality >= 3) chroma = "vivid";
  else if (emotionality <= 2 || (energy <= 2 && emotionality <= 3)) chroma = "restrained";
  else chroma = "balanced";
  const temperature = register === "confessional" ? "warm" : register === "desk" || register === "research_memo" ? "cool" : "neutral";
  const surfaceBias = (register === "meme" || register === "cinematic") && energy >= 4
    ? "dark"
    : register === "research_memo" || register === "confessional"
      ? "light"
      : "mixed";
  return {
    source: Object.hasOwn(brief, "profile_source") ? brief.profile_source : "voice_spec",
    source_ref: brief.profile_ref ?? null,
    register,
    energy,
    conviction,
    technicality,
    emotionality,
    compression,
    contrast,
    chroma,
    neutral_temperature: temperature,
    surface_bias: surfaceBias,
    signature_palette_id: brief.signature_palette_id ?? null,
    recent_palette_ids: _slug_list(brief.recent_palette_ids),
  };
}

function _scores(preset, profile, brief) {
  let creator = preset.register_fit.includes(profile.register) ? 5.0 : 0.0;
  creator += _range_fit(profile.energy, preset.energy_range);
  creator += _range_fit(profile.technicality, preset.technicality_range);
  creator += _range_fit(profile.emotionality, preset.emotionality_range);
  creator += profile.contrast === preset.contrast ? 1.5 : 0.0;
  creator += profile.chroma === preset.chroma ? 1.5 : 0.0;
  creator += profile.neutral_temperature === preset.neutral_temperature ? 1.0 : 0.0;

  const contentMode = Object.hasOwn(brief, "content_mode") ? brief.content_mode : "mechanism";
  const evidenceMode = Object.hasOwn(brief, "evidence_mode") ? brief.evidence_mode : "causal_path";
  let thesis = preset.content_fit.includes(contentMode) ? 6.0 : 0.0;
  thesis += preset.evidence_fit.includes(evidenceMode) ? 3.0 : 0.0;
  if ((brief.direction === "short" || brief.direction === "avoid") && (preset.preset_id === "event-coral" || preset.preset_id === "macro-crimson")) {
    thesis += 1.0;
  }
  if (profile.recent_palette_ids.includes(preset.preset_id)) {
    creator -= 6.0;
    thesis -= 6.0;
  }
  return [creator, thesis];
}

function _diversity(preset, chosen) {
  if (!chosen.length) return 0.0;
  let score = 0.0;
  score += chosen.every((item) => item.surface !== preset.surface) ? 1.0 : 0.0;
  score += chosen.every((item) => item.neutral_temperature !== preset.neutral_temperature) ? 0.75 : 0.0;
  score += chosen.every((item) => item.chroma !== preset.chroma) ? 0.75 : 0.0;
  score += chosen.every((item) => item.contrast !== preset.contrast) ? 0.5 : 0.0;
  return score;
}

function _credible_contrast(preset, profile) {
  if (profile.chroma === "restrained" && preset.chroma === "vivid") return false;
  if (profile.contrast === "soft" && preset.contrast === "high") return false;
  if (profile.surface_bias === "light" && preset.surface === "dark") return false;
  return true;
}

// Python max(iterable, key=...): first item with the lexicographically largest key tuple.
function pyMaxByKey(items, keyFn) {
  let best = null;
  let bestKey = null;
  for (const item of items) {
    const key = keyFn(item);
    if (best === null || tupleGreater(key, bestKey)) {
      best = item;
      bestKey = key;
    }
  }
  return best;
}

function tupleGreater(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return a.length > b.length;
}

export function select(brief, registry = null) {
  registry = registry || JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const presets = registry !== null && typeof registry === "object" && !Array.isArray(registry) ? registry.presets : null;
  if (!Array.isArray(presets) || presets.length < 3) {
    throw new Error("Palette registry requires at least three presets.");
  }
  const byId = new Map(presets.map((item) => [item.preset_id, item]));
  if (byId.size !== presets.length) {
    throw new Error("Palette preset IDs must be unique.");
  }

  const profile = derive_profile(brief);
  const scored = new Map(presets.map((item) => [item.preset_id, _scores(item, profile, brief)]));
  const chosen = [];
  const results = [];

  const signature = profile.signature_palette_id;
  let creatorPick;
  if (signature !== null && byId.has(signature)) {
    creatorPick = byId.get(String(signature));
  } else {
    creatorPick = pyMaxByKey(presets, (item) => [scored.get(item.preset_id)[0], scored.get(item.preset_id)[1], -presets.indexOf(item)]);
  }
  chosen.push(creatorPick);
  const [creatorScore, creatorThesis] = scored.get(creatorPick.preset_id);
  results.push({
    strategy: "creator_native",
    preset_id: creatorPick.preset_id,
    score: new PyFloat(pyRound2(creatorScore + creatorThesis * 0.25)),
    reason: "Matches the creator's voice, energy, and information density" + (signature === creatorPick.preset_id ? " while preserving the signature color" : ""),
  });

  let remaining = presets.filter((item) => item.preset_id !== creatorPick.preset_id);
  const thesisPick = pyMaxByKey(remaining, (item) => [
    scored.get(item.preset_id)[1] + scored.get(item.preset_id)[0] * 0.35,
    -presets.indexOf(item),
  ]);
  chosen.push(thesisPick);
  const [thesisCreator, thesisScore] = scored.get(thesisPick.preset_id);
  results.push({
    strategy: "thesis_native",
    preset_id: thesisPick.preset_id,
    score: new PyFloat(pyRound2(thesisScore + thesisCreator * 0.25)),
    reason: `Matches ${Object.hasOwn(brief, "content_mode") ? brief.content_mode : "mechanism"} content with the ${Object.hasOwn(brief, "evidence_mode") ? brief.evidence_mode : "causal_path"} evidence structure`,
  });

  remaining = remaining.filter((item) => item.preset_id !== thesisPick.preset_id);
  const credibleRemaining = remaining.filter((item) => _credible_contrast(item, profile));
  if (credibleRemaining.length) remaining = credibleRemaining;
  const contrastPick = pyMaxByKey(remaining, (item) => [
    (scored.get(item.preset_id)[0] + scored.get(item.preset_id)[1]) * 0.75 + _diversity(item, chosen),
    -presets.indexOf(item),
  ]);
  const [contrastCreator, contrastThesis] = scored.get(contrastPick.preset_id);
  results.push({
    strategy: "contrast_variant",
    preset_id: contrastPick.preset_id,
    score: new PyFloat(pyRound2((contrastCreator + contrastThesis) * 0.75 + _diversity(contrastPick, chosen))),
    reason: "Changes surface, color temperature, or saturation to provide a credible contrast option",
  });

  return {
    schema_version: "creator-palette-selection-v1",
    creator_visual_profile: profile,
    content_mode: Object.hasOwn(brief, "content_mode") ? brief.content_mode : "mechanism",
    evidence_mode: Object.hasOwn(brief, "evidence_mode") ? brief.evidence_mode : "causal_path",
    direction: Object.hasOwn(brief, "direction") ? brief.direction : "explain",
    selections: results,
  };
}

// str(PurePosixPath(value)) normalization for argparse type=Path arguments.
function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

function main(argv) {
  let output = null;
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      output = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1 || output === undefined) {
    process.stderr.write("usage: select_creator_palette.mjs input [--output OUTPUT]\n");
    return 2;
  }
  const payload = JSON.parse(readFileSync(pathStr(positionals[0]), "utf-8"));
  const result = select(payload);
  const rendered = pyJsonDumpsIndent(result) + "\n";
  if (output) {
    writeFileSync(pathStr(output), rendered, "utf-8");
  } else {
    process.stdout.write(rendered);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
