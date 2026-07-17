#!/usr/bin/env node
// Validate SkillCatalogV1 dependencies, UI exposure, and maintenance metadata.
// Port of validate_skill_catalog.py; error codes, paths, message formats, and
// the JSON output shape are contract and stay byte-compatible with the original.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SKILLS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT_FIELDS = new Set(["schema_version", "catalog_id", "catalog_version", "generated_at", "default_locale", "categories", "skills", "presets", "extension_points", "maintenance_policy"]);
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CHANNEL_FORMATS = new Map([
  ["x", new Set(["short_post", "thread"])], ["telegram", new Set(["short_post", "long_post"])],
  ["xiaohongshu", new Set(["caption", "carousel"])], ["reddit", new Set(["post", "comment"])],
  ["owned_web", new Set(["article", "brief"])], ["seeking_alpha_internal", new Set(["article_outline"])],
  ["buy_side_note", new Set(["note"])], ["short_video", new Set(["script"])], ["douyin", new Set(["short_video_script"])],
  ["generic", new Set(["text", "viewpoint_card", "publish_candidate_set"])],
]);

// ---------------------------------------------------------------------------
// Python-parity helpers (repr formatting, truthiness, set/dict semantics).

export function issue(code, path, message) {
  return { code, path, message };
}

function pyrepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyrepr).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`).join(", ")}}`;
  }
  return String(value);
}

function pystr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyTruthy(value) {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function pyStrOr(value) {
  return pyTruthy(value) ? pystr(value) : "";
}

function getOr(obj, key, fallback) {
  return Object.hasOwn(obj, key) ? obj[key] : fallback;
}

function pyEq(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => pyEq(item, b[index]));
  }
  if (isDict(a) && isDict(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && pyEq(a[key], b[key]));
  }
  return false;
}

const pyNe = (a, b) => !pyEq(a, b);

function pyIncludes(list, value) {
  for (const item of list) if (pyEq(item, value)) return true;
  return false;
}

function setKey(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return `num:${Number(value)}`;
  if (typeof value === "string") return `str:${value}`;
  return null;
}

class PyDict {
  constructor() { this.m = new Map(); }
  set(key, value) {
    const k = setKey(key);
    if (k === null) throw new TypeError(`unhashable type: ${pyrepr(key)}`);
    if (this.m.has(k)) this.m.get(k)[1] = value;
    else this.m.set(k, [key, value]);
  }
  has(key) {
    const k = setKey(key);
    return k !== null && this.m.has(k);
  }
  get(key) {
    const k = setKey(key);
    const entry = k === null ? undefined : this.m.get(k);
    return entry === undefined ? undefined : entry[1];
  }
  keys() { return [...this.m.values()].map((entry) => entry[0]); }
  values() { return [...this.m.values()].map((entry) => entry[1]); }
  entries() { return [...this.m.values()]; }
  get size() { return this.m.size; }
}

function pySet(iterable = []) {
  const set = new PyDict();
  for (const item of iterable) {
    if (setKey(item) === null) throw new TypeError(`unhashable type: ${pyrepr(item)}`);
    if (!set.has(item)) set.set(item, item);
  }
  return set;
}

const ISO_RE = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
  "(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?" +
  "(?:([+-])(\\d{2}):?(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?)?)?$",
);

function daysInMonth(year, month) {
  return [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function parseIso(value) {
  const match = ISO_RE.exec(value);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss, frac, sign, oh, om, os, ofrac] = match;
  const year = Number(y); const month = Number(mo); const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const hour = hh === undefined ? 0 : Number(hh);
  const minute = mm === undefined ? 0 : Number(mm);
  const second = ss === undefined ? 0 : Number(ss);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const micro = frac === undefined ? 0 : Number(frac.padEnd(6, "0").slice(0, 6));
  let offsetMicro = null;
  if (sign !== undefined) {
    const offsetHour = Number(oh); const offsetMinute = Number(om);
    const offsetSecond = os === undefined ? 0 : Number(os);
    const offsetFrac = ofrac === undefined ? 0 : Number(ofrac.padEnd(6, "0").slice(0, 6));
    if (offsetMinute > 59 || offsetSecond > 59) return null;
    offsetMicro = (sign === "-" ? -1 : 1) * (((offsetHour * 60 + offsetMinute) * 60 + offsetSecond) * 1e6 + offsetFrac);
    if (Math.abs(offsetMicro) >= 24 * 3600 * 1e6) return null;
  }
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, 0);
  const epochMicro = utc.getTime() * 1000 + micro - (offsetMicro ?? 0);
  return { epochMicro, hasOffset: offsetMicro !== null };
}

export function parse_time(value, path, errors) {
  if (typeof value !== "string" || value === "") {
    errors.push(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."));
    return null;
  }
  const parsed = parseIso(value.replaceAll("Z", "+00:00"));
  if (parsed === null) {
    errors.push(issue("TIME_FORMAT", path, "Invalid ISO timestamp."));
    return null;
  }
  if (!parsed.hasOffset) {
    errors.push(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."));
    return null;
  }
  return parsed.epochMicro;
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// str(PurePosixPath(...)).name equivalent.
function pathName(path) {
  return basename(path.replace(/\/+$/, ""));
}

export function has_cycle(skills) {
  const visiting = new Set();
  const visited = new Set();

  function visit(skill_id) {
    if (visiting.has(skill_id)) return true;
    if (visited.has(skill_id)) return false;
    visiting.add(skill_id);
    const entry = skills.get(skill_id);
    const dependencies = entry === undefined ? [] : getOr(entry, "requires_all", []);
    for (const dependency of (Array.isArray(dependencies) || typeof dependencies === "string" ? dependencies : [])) {
      if (skills.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(skill_id);
    visited.add(skill_id);
    return false;
  }

  for (const skill_id of skills.keys()) {
    if (visit(skill_id)) return true;
  }
  return false;
}

export function validate(payload, check_files = true, skills_root = null) {
  const errors = [];
  const warnings = [];
  const skillsRoot = pyTruthy(skills_root) ? skills_root : DEFAULT_SKILLS_ROOT;

  const local_path = (locator) => (isAbsolute(locator) ? locator : join(skillsRoot, locator));

  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "SkillCatalogV1 must be an object.")], warnings: [] };
  }
  for (const key of [...ROOT_FIELDS].filter((field) => !Object.hasOwn(payload, field)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(payload).filter((field) => !ROOT_FIELDS.has(field)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "skill-catalog-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected skill-catalog-v1."));
  }
  if (!SEMVER.test(pyStrOr(payload.catalog_version))) {
    errors.push(issue("CATALOG_VERSION", "$.catalog_version", "Catalog version must be semantic versioning."));
  }
  parse_time(payload.generated_at, "$.generated_at", errors);

  let categories_raw = payload.categories;
  if (!Array.isArray(categories_raw) || categories_raw.length === 0) {
    errors.push(issue("CATEGORIES_TYPE", "$.categories", "categories must be a non-empty array."));
    categories_raw = [];
  }
  const category_ids = pySet();
  const category_orders = pySet();
  categories_raw.forEach((category, index) => {
    const path = `$.categories[${index}]`;
    if (!isDict(category)) {
      errors.push(issue("CATEGORY_TYPE", path, "Category must be an object."));
      return;
    }
    const category_id = category.category_id;
    const order = category.order;
    if (category_ids.has(category_id)) {
      errors.push(issue("DUPLICATE_CATEGORY", `${path}.category_id`, "Category IDs must be unique."));
    }
    category_ids.set(category_id, category_id);
    if (category_orders.has(order)) {
      errors.push(issue("DUPLICATE_CATEGORY_ORDER", `${path}.order`, "Category order values must be unique."));
    }
    category_orders.set(order, order);
  });

  let policy = payload.maintenance_policy;
  if (!isDict(policy)) {
    errors.push(issue("MAINTENANCE_POLICY_TYPE", "$.maintenance_policy", "maintenance_policy must be an object."));
    policy = {};
  }

  let skills_raw = payload.skills;
  if (!Array.isArray(skills_raw) || skills_raw.length === 0) {
    errors.push(issue("SKILLS_TYPE", "$.skills", "skills must be a non-empty array."));
    skills_raw = [];
  }
  const skills = new PyDict();
  const skill_paths = new PyDict();
  const ui_orders = pySet();
  skills_raw.forEach((skill, index) => {
    const path = `$.skills[${index}]`;
    if (!isDict(skill)) {
      errors.push(issue("SKILL_TYPE", path, "Skill entry must be an object."));
      return;
    }
    const skill_id = pyStrOr(skill.skill_id);
    if (skills.has(skill_id)) {
      errors.push(issue("DUPLICATE_SKILL", `${path}.skill_id`, "Skill IDs must be unique."));
    }
    skills.set(skill_id, skill);
    skill_paths.set(skill_id, path);
    if (!SEMVER.test(pyStrOr(skill.version))) {
      errors.push(issue("SKILL_VERSION", `${path}.version`, "Skill version must use semantic versioning."));
    }
    if (!category_ids.has(skill.category_id)) {
      errors.push(issue("UNKNOWN_CATEGORY", `${path}.category_id`, "Skill category does not resolve."));
    }
    const visibility = skill.visibility;
    const selectable = skill.user_selectable;
    const ui = isDict(skill.ui) ? skill.ui : {};
    if (visibility === "selectable" && selectable !== true) {
      errors.push(issue("SELECTABLE_FLAG", `${path}.user_selectable`, "Selectable visibility requires user_selectable true."));
    }
    if (visibility !== "selectable" && selectable !== false) {
      errors.push(issue("INTERNAL_SELECTABLE", `${path}.user_selectable`, "Automatic and internal skills cannot be user selectable."));
    }
    if (visibility === "selectable" && ui.control_type === "hidden") {
      errors.push(issue("SELECTABLE_HIDDEN", `${path}.ui.control_type`, "Selectable skills require a visible control."));
    }
    if ((visibility === "automatic" || visibility === "internal") && ui.control_type !== "hidden") {
      errors.push(issue("AUTOMATIC_VISIBLE_CONTROL", `${path}.ui.control_type`, "Automatic and internal skills use hidden controls."));
    }
    if (visibility === "internal" && ui.surface !== "internal") {
      errors.push(issue("INTERNAL_SURFACE", `${path}.ui.surface`, "Internal skills belong on the internal surface."));
    }
    const order = ui.order;
    if (ui_orders.has(order)) {
      errors.push(issue("DUPLICATE_UI_ORDER", `${path}.ui.order`, "Skill UI order values must be unique."));
    }
    ui_orders.set(order, order);
    const maintenance = isDict(skill.maintenance) ? skill.maintenance : {};
    parse_time(maintenance.last_verified_at, `${path}.maintenance.last_verified_at`, errors);
    if ((skill.status === "stable" || skill.status === "beta" || skill.status === "experimental") && pyNe(maintenance.stability, skill.status)) {
      errors.push(issue("STABILITY_MISMATCH", `${path}.maintenance.stability`, "Maintenance stability must match active status."));
    }
    if ((skill.status === "deprecated" || skill.status === "disabled") && pyTruthy(skill.default_enabled)) {
      errors.push(issue("UNAVAILABLE_DEFAULT", `${path}.default_enabled`, "Unavailable skills cannot be enabled by default."));
    }
    if (skill.status === "deprecated" && !pyTruthy(skill.replaced_by)) {
      warnings.push(issue("DEPRECATED_WITHOUT_REPLACEMENT", `${path}.replaced_by`, "Deprecated skill has no replacement."));
    }
    const channels = skill.supported_channels;
    if (Array.isArray(channels) && pyIncludes(channels, "all") && channels.length > 1) {
      errors.push(issue("ALL_CHANNELS_MIXED", `${path}.supported_channels`, "Use all alone or list concrete channels."));
    }
    if (skill.execution === "installed") {
      const skill_path = maintenance.skill_path;
      if (typeof skill_path !== "string") {
        errors.push(issue("INSTALLED_PATH", `${path}.maintenance.skill_path`, "Installed skill requires a local path."));
      } else if (check_files) {
        const directory = local_path(skill_path);
        if (!isDir(directory) || pathName(directory) !== skill_id || !isFile(join(directory, "SKILL.md"))) {
          errors.push(issue("SKILL_PATH_INVALID", `${path}.maintenance.skill_path`, "Skill path must contain a matching SKILL.md directory."));
        }
      }
    }
    for (const [key, required] of [["schema_refs", policy.require_schema], ["validator_refs", policy.require_validator], ["test_refs", policy.require_tests]]) {
      const value = maintenance[key];
      if (pyTruthy(required) && (value === null || value === undefined || (Array.isArray(value) && value.length === 0))) {
        errors.push(issue("MAINTENANCE_ARTIFACT_REQUIRED", `${path}.maintenance.${key}`, `${key} is required.`));
      }
      const refs = Array.isArray(value) ? value : [];
      if (check_files) {
        for (const ref of refs) {
          if (!isFile(local_path(ref))) {
            errors.push(issue("MAINTENANCE_ARTIFACT_MISSING", `${path}.maintenance.${key}`, `Missing file ${pyrepr(ref)}.`));
          }
        }
      }
    }
  });

  for (const [skill_id, skill] of skills.entries()) {
    const path = skill_paths.get(skill_id);
    let dependencies = skill.requires_all;
    if (!Array.isArray(dependencies)) {
      errors.push(issue("DEPENDENCIES_TYPE", `${path}.requires_all`, "requires_all must be an array."));
      dependencies = [];
    } else if (pySet(dependencies).size !== dependencies.length) {
      errors.push(issue("DUPLICATE_DEPENDENCY", `${path}.requires_all`, "Dependencies must be unique."));
    }
    const input_contracts = Array.isArray(skill.input_contracts) ? skill.input_contracts : [];
    for (const dependency of dependencies) {
      if (pyEq(dependency, skill_id)) {
        errors.push(issue("SELF_DEPENDENCY", `${path}.requires_all`, "Skill cannot depend on itself."));
      } else if (!skills.has(dependency)) {
        errors.push(issue("UNKNOWN_DEPENDENCY", `${path}.requires_all`, `Unknown skill ${pyrepr(dependency)}.`));
      } else {
        const dependency_contract = skills.get(dependency).output_contract;
        if (!pyIncludes(input_contracts, dependency_contract)) {
          errors.push(issue(
            "DEPENDENCY_CONTRACT_MISSING",
            `${path}.input_contracts`,
            `Dependency ${pyrepr(dependency)} provides ${pyrepr(dependency_contract)}, which is not accepted as input.`,
          ));
        }
      }
    }
    const replacement = skill.replaced_by;
    if (pyTruthy(replacement) && !skills.has(replacement)) {
      errors.push(issue("UNKNOWN_REPLACEMENT", `${path}.replaced_by`, "Replacement skill does not resolve."));
    }
  }
  if (has_cycle(skills)) {
    errors.push(issue("DEPENDENCY_CYCLE", "$.skills", "Skill dependency graph contains a cycle."));
  }

  let presets_raw = payload.presets;
  if (!Array.isArray(presets_raw)) {
    errors.push(issue("PRESETS_TYPE", "$.presets", "presets must be an array."));
    presets_raw = [];
  }
  const preset_ids = pySet();
  presets_raw.forEach((preset, index) => {
    const path = `$.presets[${index}]`;
    if (!isDict(preset)) {
      errors.push(issue("PRESET_TYPE", path, "Preset must be an object."));
      return;
    }
    const preset_id = preset.preset_id;
    if (preset_ids.has(preset_id)) {
      errors.push(issue("DUPLICATE_PRESET", `${path}.preset_id`, "Preset IDs must be unique."));
    }
    preset_ids.set(preset_id, preset_id);
    const limits = isDict(preset.ingredient_limits) ? preset.ingredient_limits : {};
    for (const [field, bounds] of Object.entries(limits)) {
      if (isDict(bounds) && Number(getOr(bounds, "min", 0)) > Number(getOr(bounds, "max", 0))) {
        errors.push(issue("INGREDIENT_RANGE", `${path}.ingredient_limits.${field}`, "Minimum cannot exceed maximum."));
      }
    }
    const required = pySet(pyTruthy(preset.required_skill_ids) ? preset.required_skill_ids : []);
    const optional = pySet(pyTruthy(preset.optional_skill_ids) ? preset.optional_skill_ids : []);
    const default_mode = preset.default_execution_mode;
    const analysis_lenses = pySet(pyTruthy(preset.default_analysis_lenses) ? preset.default_analysis_lenses : []);
    if (required.keys().some((skill_id) => optional.has(skill_id))) {
      errors.push(issue("PRESET_SKILL_OVERLAP", path, "Required and optional skill sets must be disjoint."));
    }
    const unionSkills = [...required.keys(), ...optional.keys().filter((skill_id) => !required.has(skill_id))];
    for (const skill_id of unionSkills) {
      if (!skills.has(skill_id)) {
        errors.push(issue("UNKNOWN_PRESET_SKILL", path, `Unknown skill ${pyrepr(skill_id)}.`));
      } else if (skills.get(skill_id).status === "deprecated" || skills.get(skill_id).status === "disabled") {
        errors.push(issue("UNAVAILABLE_PRESET_SKILL", path, `Preset references unavailable skill ${pyrepr(skill_id)}.`));
      }
    }
    for (const skill_id of required.keys()) {
      const entry = skills.get(skill_id) ?? {};
      const supported_modes = pySet(pyTruthy(entry.supported_modes) ? entry.supported_modes : []);
      if (skills.has(skill_id) && !supported_modes.has(default_mode)) {
        errors.push(issue("PRESET_MODE_UNSUPPORTED", path, `Required skill ${pyrepr(skill_id)} does not support mode ${pyrepr(default_mode)}.`));
      }
    }
    if (analysis_lenses.has("resolution-contract") && !required.has("compose-cuebook-trading-thesis")) {
      errors.push(issue("PRESET_THESIS_PROTOCOL_REQUIRED", path, "A resolution-contract preset requires the trading-thesis composer."));
    }
    const settleable = analysis_lenses.has("resolution-contract") || analysis_lenses.has("settlement-claim");
    if (settleable && !required.has("compile-cuebook-settlement-claim")) {
      errors.push(issue("PRESET_SETTLEMENT_COMPILER_REQUIRED", path, "A settlement-claim or resolution-contract preset requires the settlement-claim compiler."));
    }
    if (settleable && !required.has("compile-cuebook-settlement-formula")) {
      errors.push(issue("PRESET_SETTLEMENT_FORMULA_REQUIRED", path, "A settleable preset requires the executable settlement-formula compiler."));
    }
    const outputs = Array.isArray(preset.default_outputs) ? preset.default_outputs : [];
    const channels = pySet();
    const formats = pySet();
    outputs.forEach((output, output_index) => {
      if (!isDict(output)) {
        errors.push(issue("PRESET_OUTPUT_TYPE", `${path}.default_outputs[${output_index}]`, "Preset output must be an object."));
        return;
      }
      const channel = output.channel;
      const fmt = output.format;
      channels.set(channel, channel);
      formats.set(fmt, fmt);
      if (typeof channel === "string" && channel.startsWith("custom:")) {
        const renderer_ids = [];
        for (const [skill_id, entry] of skills.entries()) {
          if (pyIncludes(pyTruthy(entry.supported_channels) ? entry.supported_channels : [], channel)) renderer_ids.push(skill_id);
        }
        if (renderer_ids.length === 0 || !renderer_ids.some((skill_id) => required.has(skill_id))) {
          errors.push(issue("PRESET_CUSTOM_RENDERER", `${path}.default_outputs[${output_index}]`, "Custom preset channel requires a catalog renderer in required_skill_ids."));
        }
      } else if (!CHANNEL_FORMATS.has(channel) || !CHANNEL_FORMATS.get(channel).has(fmt)) {
        errors.push(issue("PRESET_CHANNEL_FORMAT", `${path}.default_outputs[${output_index}]`, "Unsupported channel/format pair."));
      }
    });
    if (channels.keys().some((channel) => channel === "x" || channel === "telegram" || channel === "buy_side_note" || channel === "generic") && !required.has("render-cuebook-market-post")) {
      errors.push(issue("PRESET_POST_RENDERER", path, "Preset requires the compact-text renderer."));
    }
    if (formats.has("viewpoint_card")) {
      if (!required.has("assemble-cuebook-viewpoint-card")) {
        errors.push(issue("PRESET_VIEWPOINT_ASSEMBLER", path, "Viewpoint-card preset requires the card assembler."));
      }
      if (!required.has("render-cuebook-viewpoint-visual")) {
        errors.push(issue("PRESET_VIEWPOINT_VISUAL", path, "Viewpoint-card preset requires the unified viewpoint visual."));
      }
    }
    if (channels.keys().some((channel) => ["xiaohongshu", "reddit", "owned_web", "seeking_alpha_internal", "short_video", "douyin"].includes(channel)) && !required.has("render-cuebook-market-media")) {
      errors.push(issue("PRESET_MEDIA_RENDERER", path, "Preset requires the media renderer."));
    }
    if (outputs.length > 1 && !required.has("plan-market-content-program")) {
      errors.push(issue("PRESET_PROGRAM_REQUIRED", path, "Multi-output preset requires content-program planning."));
    }
  });

  let extension_points = payload.extension_points;
  if (!Array.isArray(extension_points)) {
    errors.push(issue("EXTENSION_POINTS_TYPE", "$.extension_points", "extension_points must be an array."));
    extension_points = [];
  }
  const seen_extension_points = pySet();
  extension_points.forEach((extension, index) => {
    const path = `$.extension_points[${index}]`;
    if (!isDict(extension)) {
      errors.push(issue("EXTENSION_POINT_TYPE", path, "Extension point must be an object."));
      return;
    }
    const key = extension.extension_point;
    if (seen_extension_points.has(key)) {
      errors.push(issue("DUPLICATE_EXTENSION_POINT", `${path}.extension_point`, "Extension points must be unique."));
    }
    seen_extension_points.set(key, key);
  });

  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const prog = basename(fileURLToPath(import.meta.url));
  const usage = `usage: ${prog} [-h] [--skip-file-checks] [--skills-root SKILLS_ROOT] json_file`;
  let skipFileChecks = false;
  let skillsRoot = DEFAULT_SKILLS_ROOT;
  const positionals = [];
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage + "\n");
      return;
    }
    if (arg === "--skip-file-checks") {
      skipFileChecks = true;
      continue;
    }
    const optionMatch = /^--skills-root(?:=(.*))?$/.exec(arg);
    if (optionMatch) {
      let value = optionMatch[1];
      if (value === undefined) {
        index += 1;
        if (index >= argv.length) {
          process.stderr.write(`${usage}\n${prog}: error: argument --skills-root: expected one argument\n`);
          process.exitCode = 2;
          return;
        }
        value = argv[index];
      }
      skillsRoot = value;
      continue;
    }
    if (arg.startsWith("--")) {
      process.stderr.write(`${usage}\n${prog}: error: unrecognized arguments: ${arg}\n`);
      process.exitCode = 2;
      return;
    }
    positionals.push(arg);
  }
  if (positionals.length !== 1) {
    process.stderr.write(`${usage}\n${prog}: error: ${positionals.length === 0 ? "the following arguments are required: json_file" : `unrecognized arguments: ${positionals.slice(1).join(" ")}`}\n`);
    process.exitCode = 2;
    return;
  }
  const payload = JSON.parse(readFileSync(positionals[0], "utf-8"));
  const result = validate(payload, !skipFileChecks, skillsRoot);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.valid ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
