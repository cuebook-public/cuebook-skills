#!/usr/bin/env node
// Validate ContentRecipeV1 composition, references, and skill resolution.
// Port of validate_content_recipe.py; error codes, paths, message formats, and
// the JSON output shape are contract and stay byte-compatible with the original.

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_FIELDS = new Set([
  "schema_version", "recipe_id", "revision", "state", "catalog_version", "created_at",
  "updated_at", "as_of", "decision_cutoff_at", "feed_ref", "opportunity_set_ref",
  "selection_mode", "preset_ref", "anchor", "ingredients", "preparation", "flavor",
  "plating", "execution", "extensions", "validation_report",
]);
const INGREDIENT_FIELDS = new Map([
  ["news_refs", ["news", "NEWS_"]],
  ["calendar_refs", ["calendar_events", "CAL_"]],
  ["narrative_refs", ["narratives", "NAR_"]],
  ["trade_idea_refs", ["trade_ideas", "IDEA_"]],
  ["trade_history_refs", ["trade_history", "TRADE_"]],
]);
const CHANNEL_FORMATS = new Map([
  ["frame", new Set(["publish_candidate_set"])],
  ["x", new Set(["short_post", "thread"])],
  ["telegram", new Set(["short_post", "long_post"])],
  ["xiaohongshu", new Set(["caption", "carousel"])],
  ["reddit", new Set(["post", "comment"])],
  ["owned_web", new Set(["article", "brief"])],
  ["seeking_alpha_internal", new Set(["article_outline"])],
  ["buy_side_note", new Set(["note"])],
  ["short_video", new Set(["script"])],
  ["douyin", new Set(["short_video_script"])],
  ["generic", new Set(["text", "viewpoint_card", "publish_candidate_set"])],
]);
const COMPACT_CHANNELS = new Set(["frame", "x", "telegram", "buy_side_note", "generic"]);
const MEDIA_CHANNELS = new Set(["xiaohongshu", "reddit", "owned_web", "seeking_alpha_internal", "short_video", "douyin"]);
const BASE_REQUIRED_SKILLS = [
  "normalize-cuebook-creator-feed",
  "compose-cuebook-content-recipe",
  "select-cuebook-content-opportunities",
  "validate-cuebook-projection",
  "route-cuebook-narrative",
  "build-market-research-pack",
  "compile-cuebook-market-view-semantics",
  "plan-cuebook-creator-expression",
  "orchestrate-cuebook-creator-workflow",
];

// ---------------------------------------------------------------------------
// Python-parity helpers (repr formatting, truthiness, set/dict semantics).

export function issue(code, path, message) {
  return { code, path, message };
}

// Python repr() for JSON-compatible values interpolated with !r.
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

// Python str() as used in plain f-string interpolation.
function pystr(value) {
  return typeof value === "string" ? value : pyrepr(value);
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Python truthiness for JSON values.
function pyTruthy(value) {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

// str(x or "")
function pyStrOr(value) {
  return pyTruthy(value) ? pystr(value) : "";
}

// dict.get(key, default): default applies only when the key is absent.
function getOr(obj, key, fallback) {
  return Object.hasOwn(obj, key) ? obj[key] : fallback;
}

// Python == for JSON values (deep, key-order-insensitive).
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

// list membership with Python equality.
function pyIncludes(list, value) {
  for (const item of list) if (pyEq(item, value)) return true;
  return false;
}

// Hash key reproducing Python set/dict semantics for JSON scalars
// (True == 1, 1 == 1.0). Returns null for unhashable values.
function setKey(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return `num:${Number(value)}`;
  if (typeof value === "string") return `str:${value}`;
  return null;
}

// Python dict keyed by arbitrary scalars; preserves first key and insertion order.
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

// Python set built from an iterable. Iteration follows insertion order
// (a documented, deterministic stand-in for Python's hash order).
function pySet(iterable = []) {
  const set = new PyDict();
  for (const item of iterable) {
    if (setKey(item) === null) throw new TypeError(`unhashable type: ${pyrepr(item)}`);
    if (!set.has(item)) set.set(item, item);
  }
  return set;
}

function pySetDiff(left, right) {
  return left.keys().filter((item) => !right.has(item));
}

// datetime.fromisoformat(value.replace("Z", "+00:00")) acceptance; returns a
// comparable epoch-microsecond number, or null after recording an error.
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

export function unique_list(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(issue("ARRAY_REQUIRED", path, "Expected an array."));
    return [];
  }
  let unhashable = false;
  const seen = new Set();
  let duplicates = false;
  for (const item of value) {
    const key = setKey(item);
    if (key === null) { unhashable = true; break; }
    if (seen.has(key)) duplicates = true;
    seen.add(key);
  }
  if (unhashable) errors.push(issue("SCALAR_REFS", path, "Array values must be scalar references."));
  else if (duplicates) errors.push(issue("DUPLICATE_REF", path, "Array values must be unique."));
  return value;
}

export function required_skills(payload) {
  const required = pySet(BASE_REQUIRED_SKILLS);
  const plating = isDict(payload.plating) ? payload.plating : {};
  const outputs = Array.isArray(plating.outputs) ? plating.outputs : [];
  const channels = pySet(outputs.filter(isDict).map((item) => item.channel));
  const formats = pySet(outputs.filter(isDict).map((item) => item.format));
  const execution = isDict(payload.execution) ? payload.execution : {};
  const mode = execution.mode;
  if (channels.keys().some((channel) => COMPACT_CHANNELS.has(channel))) required.set("render-cuebook-market-post", "render-cuebook-market-post");
  if (channels.keys().some((channel) => MEDIA_CHANNELS.has(channel))) required.set("render-cuebook-market-media", "render-cuebook-market-media");
  if (formats.has("viewpoint_card")) {
    for (const skill of ["render-cuebook-viewpoint-visual", "assemble-cuebook-viewpoint-card"]) required.set(skill, skill);
  }
  if (formats.has("publish_candidate_set")) {
    for (const skill of ["render-cuebook-market-post", "direct-cuebook-viewpoint-visual", "assemble-cuebook-publish-candidates"]) required.set(skill, skill);
  }
  let total_units = 0;
  for (const item of outputs) {
    if (!isDict(item)) continue;
    const count = item.count;
    if (!(typeof count === "boolean" || (typeof count === "number" && Number.isInteger(count)))) continue;
    total_units += item.format === "publish_candidate_set" ? 1 : Number(count);
  }
  if (outputs.length > 1 || total_units > 1 || plating.bundle_strategy !== "independent" || mode === "batch" || mode === "event_lifecycle") {
    required.set("plan-market-content-program", "plan-market-content-program");
  }
  if (plating.deliverable_mode === "release_candidates") required.set("prepare-market-content-release", "prepare-market-content-release");
  if (mode === "postmortem" || mode === "correction") required.set("reconcile-market-content-history", "reconcile-market-content-history");
  return required;
}

export function validate(payload, feed = null, opportunities = null, catalog = null) {
  const errors = [];
  const warnings = [];
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "ContentRecipeV1 must be an object.")], warnings: [] };
  }

  for (const key of [...ROOT_FIELDS].filter((field) => !Object.hasOwn(payload, field)).sort()) {
    errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  }
  for (const key of Object.keys(payload).filter((field) => !ROOT_FIELDS.has(field)).sort()) {
    errors.push(issue("UNKNOWN_ROOT_FIELD", `$.${key}`, "Unknown root field."));
  }
  if (payload.schema_version !== "content-recipe-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected content-recipe-v1."));
  }
  if (!/^RECIPE_[a-z0-9]{8,64}$/.test(pyStrOr(payload.recipe_id))) {
    errors.push(issue("RECIPE_ID", "$.recipe_id", "Invalid recipe ID."));
  }
  const revision = payload.revision;
  const revisionIsInt = typeof revision === "boolean" || (typeof revision === "number" && Number.isInteger(revision));
  if (!revisionIsInt || Number(revision) < 1) {
    errors.push(issue("REVISION", "$.revision", "Revision must be a positive integer."));
  }

  const created = parse_time(payload.created_at, "$.created_at", errors);
  const updated = parse_time(payload.updated_at, "$.updated_at", errors);
  const as_of = parse_time(payload.as_of, "$.as_of", errors);
  const cutoff = parse_time(payload.decision_cutoff_at, "$.decision_cutoff_at", errors);
  if (created !== null && updated !== null && created > updated) {
    errors.push(issue("REVISION_TIME", "$.updated_at", "updated_at cannot precede created_at."));
  }
  if (cutoff !== null && as_of !== null && cutoff > as_of) {
    errors.push(issue("CUTOFF_AFTER_AS_OF", "$.decision_cutoff_at", "Decision cutoff cannot be after as_of."));
  }

  let ingredients = payload.ingredients;
  if (!isDict(ingredients)) {
    errors.push(issue("INGREDIENTS_TYPE", "$.ingredients", "ingredients must be an object."));
    ingredients = {};
  }
  const ingredient_refs = new Map();
  const all_refs = [];
  for (const field of INGREDIENT_FIELDS.keys()) {
    const refs = unique_list(ingredients[field], `$.ingredients.${field}`, errors);
    ingredient_refs.set(field, refs);
    all_refs.push(...refs);
  }
  const history_use = ingredients.history_use;
  if (ingredient_refs.get("trade_history_refs").length > 0 && history_use === "none") {
    errors.push(issue("HISTORY_USE_REQUIRED", "$.ingredients.history_use", "Selected trade history requires an explicit permitted use."));
  }
  if (ingredient_refs.get("trade_history_refs").length === 0 && !(history_use === "none" || history_use === null || history_use === undefined)) {
    errors.push(issue("HISTORY_USE_WITHOUT_RECORDS", "$.ingredients.history_use", "History use requires selected trade-history records."));
  }

  let flavor = payload.flavor;
  if (!isDict(flavor)) {
    errors.push(issue("FLAVOR_TYPE", "$.flavor", "flavor must be an object."));
    flavor = {};
  }
  const authorship_mode = getOr(flavor, "authorship_mode", "creator_led");
  const assistance_attribution = getOr(flavor, "assistance_attribution", "none");
  if (!(authorship_mode === "creator_led" || authorship_mode === "cuebook_assisted" || authorship_mode === "cuebook_generated")) {
    errors.push(issue("AUTHORSHIP_MODE", "$.flavor.authorship_mode", "Unsupported authorship mode."));
  }
  if (!(assistance_attribution === "none" || assistance_attribution === "disclosure_only")) {
    errors.push(issue("ASSISTANCE_ATTRIBUTION", "$.flavor.assistance_attribution", "Unsupported assistance attribution mode."));
  }

  let anchor = payload.anchor;
  if (!isDict(anchor)) {
    errors.push(issue("ANCHOR_TYPE", "$.anchor", "anchor must be an object."));
    anchor = {};
  }
  const mode = payload.selection_mode;
  const primary_ref = anchor.primary_ref;
  const opportunity_ref = anchor.opportunity_ref;
  if (mode === "ingredient_first") {
    if (!(opportunity_ref === null || opportunity_ref === undefined)) {
      errors.push(issue("INGREDIENT_FIRST_OPPORTUNITY", "$.anchor.opportunity_ref", "ingredient_first resolves an opportunity later."));
    }
    if (!pyIncludes(all_refs, primary_ref)) {
      errors.push(issue("PRIMARY_INGREDIENT", "$.anchor.primary_ref", "Primary ingredient must be one of the selected records."));
    }
  } else if (mode === "opportunity_first") {
    if (!pyTruthy(opportunity_ref) || !pyTruthy(payload.opportunity_set_ref)) {
      errors.push(issue("OPPORTUNITY_ANCHOR_REQUIRED", "$.anchor.opportunity_ref", "opportunity_first requires a selected opportunity and set."));
    }
  } else if (mode === "preset_auto") {
    if (!pyTruthy(payload.preset_ref)) {
      errors.push(issue("PRESET_REQUIRED", "$.preset_ref", "preset_auto requires a preset."));
    }
  } else {
    errors.push(issue("SELECTION_MODE", "$.selection_mode", "Unsupported selection mode."));
  }
  if (payload.state === "valid" && all_refs.length === 0) {
    errors.push(issue("VALID_WITHOUT_INGREDIENTS", "$.ingredients", "A valid recipe requires resolved ingredients."));
  }

  let execution = payload.execution;
  if (!isDict(execution)) {
    errors.push(issue("EXECUTION_TYPE", "$.execution", "execution must be an object."));
    execution = {};
  }
  const selected_skills = unique_list(execution.selected_skill_ids, "$.execution.selected_skill_ids", errors);
  const resolved_skills = unique_list(execution.resolved_skill_ids, "$.execution.resolved_skill_ids", errors);
  const selected_set = pySet(selected_skills);
  const resolved_set = pySet(resolved_skills);
  if (!selected_set.keys().every((skill) => resolved_set.has(skill))) {
    errors.push(issue("SELECTED_SKILL_UNRESOLVED", "$.execution.resolved_skill_ids", "Every selected skill must be present in the resolved set."));
  }
  const missing_required = pySetDiff(required_skills(payload), resolved_set).sort();
  if (missing_required.length > 0) {
    errors.push(issue("REQUIRED_SKILL_MISSING", "$.execution.resolved_skill_ids", `Missing required skills: ${pyrepr(missing_required)}.`));
  }
  let pins = execution.version_pins;
  if (!Array.isArray(pins)) {
    errors.push(issue("VERSION_PINS_TYPE", "$.execution.version_pins", "version_pins must be an array."));
    pins = [];
  }
  const pin_ids = pySet();
  pins.forEach((pin, index) => {
    const path = `$.execution.version_pins[${index}]`;
    if (!isDict(pin)) {
      errors.push(issue("VERSION_PIN_TYPE", path, "Version pin must be an object."));
      return;
    }
    const skill_id = pin.skill_id;
    if (pin_ids.has(skill_id)) {
      errors.push(issue("DUPLICATE_VERSION_PIN", `${path}.skill_id`, "Skill version pins must be unique."));
    }
    pin_ids.set(skill_id, skill_id);
    if (!resolved_set.has(skill_id)) {
      errors.push(issue("PIN_UNRESOLVED_SKILL", path, "A version pin must reference a resolved skill."));
    }
  });
  const missing_pin_ids = pySetDiff(resolved_set, pin_ids).sort();
  if (missing_pin_ids.length > 0) {
    errors.push(issue("MISSING_VERSION_PIN", "$.execution.version_pins", `Resolved runtime skills require exactly one version pin: ${pyrepr(missing_pin_ids)}.`));
  }

  let plating = payload.plating;
  if (!isDict(plating)) {
    errors.push(issue("PLATING_TYPE", "$.plating", "plating must be an object."));
    plating = {};
  }
  let outputs = plating.outputs;
  if (!Array.isArray(outputs) || outputs.length === 0) {
    errors.push(issue("OUTPUT_REQUIRED", "$.plating.outputs", "At least one output is required."));
    outputs = [];
  }
  const output_ids = pySet();
  const custom_channels = pySet();
  outputs.forEach((output, index) => {
    const path = `$.plating.outputs[${index}]`;
    if (!isDict(output)) {
      errors.push(issue("OUTPUT_TYPE", path, "Output must be an object."));
      return;
    }
    const output_id = output.output_id;
    if (output_ids.has(output_id)) {
      errors.push(issue("DUPLICATE_OUTPUT_ID", `${path}.output_id`, "Output IDs must be unique."));
    }
    output_ids.set(output_id, output_id);
    const channel = output.channel;
    const fmt = output.format;
    if (typeof channel === "string" && channel.startsWith("custom:")) {
      custom_channels.set(channel, channel);
    } else if (!CHANNEL_FORMATS.has(channel) || !CHANNEL_FORMATS.get(channel).has(fmt)) {
      errors.push(issue("CHANNEL_FORMAT", path, `Unsupported ${pyrepr(channel)}/${pyrepr(fmt)} combination.`));
    }
  });
  if (outputs.some((item) => isDict(item) && item.channel === "seeking_alpha_internal")) {
    if (plating.deliverable_mode !== "drafts") {
      errors.push(issue("SEEKING_ALPHA_INTERNAL_ONLY", "$.plating.deliverable_mode", "Seeking Alpha support is limited to an internal outline."));
    }
  }

  const exec_mode = execution.mode;
  if (exec_mode === "postmortem") {
    if (ingredient_refs.get("trade_history_refs").length === 0 || history_use !== "postmortem") {
      errors.push(issue("POSTMORTEM_HISTORY_REQUIRED", "$.ingredients", "Postmortem mode requires selected history with postmortem use."));
    }
  }
  if (exec_mode === "batch" && all_refs.length < 2 && mode !== "preset_auto") {
    warnings.push(issue("THIN_BATCH", "$.ingredients", "Batch mode has fewer than two selected ingredients."));
  }

  if (feed !== null && feed !== undefined) {
    if (!isDict(feed) || feed.schema_version !== "creator-feed-v1") {
      errors.push(issue("FEED_TYPE", "$feed", "Expected CreatorFeedV1."));
    } else {
      if (pyNe(payload.feed_ref, feed.feed_id)) {
        errors.push(issue("FEED_REF_MISMATCH", "$.feed_ref", "Recipe feed reference does not match."));
      }
      const anchor_entities = pySet(pyTruthy(anchor.entity_refs) ? anchor.entity_refs : []);
      const selected_news_clusters = pySet();
      for (const [field, [collection_name]] of INGREDIENT_FIELDS) {
        const collection = getOr(feed, collection_name, []);
        const records = new PyDict();
        for (const item of (Array.isArray(collection) ? collection : [])) {
          if (isDict(item)) records.set(item.id, item);
        }
        for (const ref of ingredient_refs.get(field)) {
          const path = `$.ingredients.${field}`;
          const record = records.get(ref);
          if (record === undefined) {
            errors.push(issue("UNKNOWN_INGREDIENT", path, `Unknown ${pystr(collection_name)} record ${pyrepr(ref)}.`));
            continue;
          }
          if (record.record_status !== "active") {
            errors.push(issue("INACTIVE_INGREDIENT", path, `${pyrepr(ref)} is not active.`));
          }
          const available = parse_time(record.available_at, `$feed.${pystr(collection_name)}.${pystr(ref)}.available_at`, errors);
          if (available !== null && cutoff !== null && available > cutoff) {
            errors.push(issue("POST_CUTOFF_INGREDIENT", path, `${pyrepr(ref)} was unavailable at the decision cutoff.`));
          }
          const record_entities = pySet(pyTruthy(record.entity_refs) ? record.entity_refs : []);
          if (anchor_entities.size > 0 && record_entities.size > 0 && !anchor_entities.keys().some((entity) => record_entities.has(entity))) {
            warnings.push(issue("ENTITY_SPREAD", path, `${pyrepr(ref)} does not share an anchor entity; verify the proxy bridge.`));
          }
          if (field === "news_refs") {
            const cluster = record.cluster_id;
            if (selected_news_clusters.has(cluster)) {
              errors.push(issue("DUPLICATE_NEWS_CLUSTER", path, "Multiple selected news items share one cluster."));
            }
            selected_news_clusters.set(cluster, cluster);
          }
          if (field === "trade_history_refs") {
            if (record.public_reuse_permission === "private" || record.public_reuse_permission === "unknown") {
              errors.push(issue("HISTORY_REUSE_BLOCKED", path, `${pyrepr(ref)} is not authorized for this recipe.`));
            }
            if ((history_use === "postmortem" || history_use === "calibration") && record.trade_type === "executed" && record.execution_verification !== "broker_reconciled") {
              errors.push(issue("HISTORY_UNRECONCILED", path, `${pyrepr(ref)} cannot support performance language.`));
            }
          }
        }
      }
    }
  }

  if (opportunities !== null && opportunities !== undefined) {
    if (!isDict(opportunities) || opportunities.schema_version !== "content-opportunity-set-v1") {
      errors.push(issue("OPPORTUNITY_SET_TYPE", "$opportunities", "Expected ContentOpportunitySetV1."));
    } else {
      if (pyNe(payload.opportunity_set_ref, opportunities.opportunity_set_id)) {
        errors.push(issue("OPPORTUNITY_SET_MISMATCH", "$.opportunity_set_ref", "Recipe opportunity-set reference does not match."));
      }
      const candidates = getOr(opportunities, "candidates", []);
      const selected = pySet((Array.isArray(candidates) ? candidates : []).filter((item) => isDict(item) && item.decision === "selected").map((item) => item.opportunity_id));
      if (pyTruthy(opportunity_ref) && !selected.has(opportunity_ref)) {
        errors.push(issue("UNKNOWN_SELECTED_OPPORTUNITY", "$.anchor.opportunity_ref", "Anchor is not selected in the supplied opportunity set."));
      }
    }
  }

  const extensionsValue = payload.extensions;
  if (catalog !== null && catalog !== undefined) {
    if (!isDict(catalog) || catalog.schema_version !== "skill-catalog-v1") {
      errors.push(issue("CATALOG_TYPE", "$catalog", "Expected SkillCatalogV1."));
    } else {
      if (pyNe(payload.catalog_version, catalog.catalog_version)) {
        errors.push(issue("CATALOG_VERSION_MISMATCH", "$.catalog_version", "Recipe must pin the supplied catalog version."));
      }
      const catalogSkillsRaw = getOr(catalog, "skills", []);
      const catalog_skills = new PyDict();
      for (const item of (Array.isArray(catalogSkillsRaw) ? catalogSkillsRaw : [])) {
        if (isDict(item)) catalog_skills.set(item.skill_id, item);
      }
      for (const skill_id of resolved_set.keys()) {
        const entry = catalog_skills.get(skill_id);
        if (entry === undefined) {
          errors.push(issue("UNKNOWN_RESOLVED_SKILL", "$.execution.resolved_skill_ids", `Unknown catalog skill ${pyrepr(skill_id)}.`));
        } else if (entry.status === "deprecated" || entry.status === "disabled") {
          errors.push(issue("UNAVAILABLE_RESOLVED_SKILL", "$.execution.resolved_skill_ids", `Unavailable skill ${pyrepr(skill_id)}.`));
        } else if (!pyIncludes(pyTruthy(entry.supported_modes) ? entry.supported_modes : [], execution.mode) && skill_id !== "orchestrate-cuebook-creator-workflow") {
          errors.push(issue("SKILL_MODE_UNSUPPORTED", "$.execution.resolved_skill_ids", `${pyrepr(skill_id)} does not support mode ${pyrepr(execution.mode)}.`));
        }
        if (entry !== undefined) {
          const missing_dependencies = pySetDiff(pySet(pyTruthy(entry.requires_all) ? entry.requires_all : []), resolved_set).sort();
          if (missing_dependencies.length > 0) {
            errors.push(issue(
              "RESOLVED_DEPENDENCY_MISSING",
              "$.execution.resolved_skill_ids",
              `Resolved skill ${pyrepr(skill_id)} is missing dependencies: ${pyrepr(missing_dependencies)}.`,
            ));
          }
        }
      }
      for (const skill_id of selected_set.keys()) {
        const entry = catalog_skills.get(skill_id);
        if (entry !== undefined && !pyTruthy(entry.user_selectable)) {
          errors.push(issue("SKILL_NOT_USER_SELECTABLE", "$.execution.selected_skill_ids", `${pyrepr(skill_id)} is automatic or internal.`));
        }
      }
      const extensionList = pyTruthy(extensionsValue) ? extensionsValue : [];
      const custom_renderer_extensions = (Array.isArray(extensionList) ? extensionList : []).filter((extension) => isDict(extension) && extension.extension_point === "custom_renderer");
      const custom_extension_configured = custom_renderer_extensions.length > 0;
      for (const channel of custom_channels.keys()) {
        const renderer_ids = [];
        for (const [skill_id, entry] of catalog_skills.entries()) {
          if (pyIncludes(pyTruthy(entry.supported_channels) ? entry.supported_channels : [], channel) && !(entry.status === "deprecated" || entry.status === "disabled")) {
            renderer_ids.push(skill_id);
          }
        }
        if (renderer_ids.length > 0 && !renderer_ids.some((skill_id) => resolved_set.has(skill_id))) {
          errors.push(issue("CUSTOM_RENDERER_SKILL_MISSING", "$.execution.resolved_skill_ids", `Resolve one catalog renderer for ${pyrepr(channel)}: ${pyrepr([...renderer_ids].sort())}.`));
        }
        if (renderer_ids.length === 0 && !custom_extension_configured) {
          errors.push(issue("CUSTOM_RENDERER_REQUIRED", "$.extensions", `No catalog skill or custom_renderer extension handles ${pyrepr(channel)}.`));
        }
        if (renderer_ids.length === 0 && custom_extension_configured && !custom_renderer_extensions.some((extension) => pyTruthy(extension.required))) {
          errors.push(issue("CUSTOM_RENDERER_NOT_REQUIRED", "$.extensions", "A renderer needed for a selected custom output must be marked required."));
        }
      }
      const catalog_versions = new PyDict();
      for (const [skill_id, entry] of catalog_skills.entries()) catalog_versions.set(skill_id, entry.version);
      pins.forEach((pin, index) => {
        if (isDict(pin) && catalog_versions.has(pin.skill_id) && pyNe(pin.version, catalog_versions.get(pin.skill_id))) {
          errors.push(issue("SKILL_VERSION_MISMATCH", `$.execution.version_pins[${index}]`, "Pinned skill version differs from the catalog."));
        }
      });
      const presetsRaw = getOr(catalog, "presets", []);
      const presets = new PyDict();
      for (const item of (Array.isArray(presetsRaw) ? presetsRaw : [])) {
        if (isDict(item)) presets.set(item.preset_id, item);
      }
      const preset_ref = payload.preset_ref;
      if (pyTruthy(preset_ref) && !presets.has(preset_ref)) {
        errors.push(issue("UNKNOWN_PRESET", "$.preset_ref", "Preset does not exist in the supplied catalog."));
      } else if (presets.has(preset_ref)) {
        const preset = presets.get(preset_ref);
        const limits = getOr(preset, "ingredient_limits", {});
        for (const field of INGREDIENT_FIELDS.keys()) {
          const limit = isDict(limits) ? limits[field] : undefined;
          if (isDict(limit) && ingredient_refs.get(field).length > Number(getOr(limit, "max", 10 ** 9))) {
            errors.push(issue("PRESET_INGREDIENT_MAX", `$.ingredients.${field}`, "Selection exceeds the preset limit."));
          }
          if (isDict(limit) && ingredient_refs.get(field).length < Number(getOr(limit, "min", 0))) {
            const target = payload.state === "valid" ? errors : warnings;
            target.push(issue("PRESET_INGREDIENT_MIN", `$.ingredients.${field}`, "Selection is below the preset minimum."));
          }
        }
        const presetRequired = getOr(preset, "required_skill_ids", []);
        const missing_preset_skills = pySetDiff(pySet(Array.isArray(presetRequired) ? presetRequired : []), resolved_set);
        if (missing_preset_skills.length > 0) {
          errors.push(issue("PRESET_SKILL_MISSING", "$.execution.resolved_skill_ids", `Missing preset skills: ${pyrepr(missing_preset_skills.sort())}.`));
        }
      }
      const extensionPointsRaw = getOr(catalog, "extension_points", []);
      const known_extension_points = pySet((Array.isArray(extensionPointsRaw) ? extensionPointsRaw : []).filter(isDict).map((item) => item.extension_point));
      (Array.isArray(extensionList) ? extensionList : []).forEach((extension, index) => {
        if (isDict(extension) && !known_extension_points.has(extension.extension_point)) {
          errors.push(issue("UNKNOWN_EXTENSION_POINT", `$.extensions[${index}].extension_point`, "Extension point is not registered."));
        }
      });
    }
  } else if (custom_channels.size > 0) {
    const extensionList = pyTruthy(extensionsValue) ? extensionsValue : [];
    const custom_renderer_extensions = (Array.isArray(extensionList) ? extensionList : []).filter((extension) => isDict(extension) && extension.extension_point === "custom_renderer");
    if (custom_renderer_extensions.length === 0) {
      errors.push(issue("CUSTOM_RENDERER_REQUIRED", "$.extensions", "Custom channels require a registered renderer extension when no catalog is supplied."));
    } else if (!custom_renderer_extensions.some((extension) => pyTruthy(extension.required))) {
      errors.push(issue("CUSTOM_RENDERER_NOT_REQUIRED", "$.extensions", "A renderer needed for a selected custom output must be marked required."));
    }
  }

  let extensions = payload.extensions;
  if (!Array.isArray(extensions)) {
    errors.push(issue("EXTENSIONS_TYPE", "$.extensions", "extensions must be an array."));
    extensions = [];
  }
  const extension_ids = pySet();
  extensions.forEach((extension, index) => {
    if (!isDict(extension)) {
      errors.push(issue("EXTENSION_TYPE", `$.extensions[${index}]`, "Extension must be an object."));
      return;
    }
    if (extension_ids.has(extension.extension_id)) {
      errors.push(issue("DUPLICATE_EXTENSION", `$.extensions[${index}].extension_id`, "Extension IDs must be unique."));
    }
    extension_ids.set(extension.extension_id, extension.extension_id);
  });

  let report = payload.validation_report;
  if (!isDict(report)) {
    errors.push(issue("VALIDATION_REPORT_TYPE", "$.validation_report", "validation_report must be an object."));
    report = {};
  }
  let hard_failures = report.hard_failures;
  if (!Array.isArray(hard_failures)) {
    errors.push(issue("HARD_FAILURES_TYPE", "$.validation_report.hard_failures", "hard_failures must be an array."));
    hard_failures = [];
  }
  const decision = report.decision;
  const state = payload.state;
  if (hard_failures.length > 0 && decision !== "blocked") {
    errors.push(issue("HARD_FAILURE_STATE", "$.validation_report.decision", "Hard failures require blocked."));
  }
  if (state === "valid" && decision !== "ready") {
    errors.push(issue("VALID_STATE_DECISION", "$.validation_report.decision", "A valid recipe requires a ready decision."));
  }
  if (state === "conditional" && decision !== "conditional") {
    errors.push(issue("CONDITIONAL_STATE_DECISION", "$.validation_report.decision", "A conditional recipe requires a conditional decision."));
  }
  if (state === "blocked" && decision !== "blocked") {
    errors.push(issue("BLOCKED_STATE_DECISION", "$.validation_report.decision", "A blocked recipe requires a blocked decision."));
  }
  if (mode === "preset_auto" && all_refs.length === 0 && state === "valid") {
    errors.push(issue("AUTO_PRESET_UNRESOLVED", "$.state", "An unresolved automatic preset must remain conditional."));
  }
  const expected_counts = {
    news: ingredient_refs.get("news_refs").length,
    calendar_events: ingredient_refs.get("calendar_refs").length,
    narratives: ingredient_refs.get("narrative_refs").length,
    trade_ideas: ingredient_refs.get("trade_idea_refs").length,
    trade_history: ingredient_refs.get("trade_history_refs").length,
    outputs: outputs.length,
    selected_skills: selected_skills.length,
    resolved_skills: resolved_skills.length,
    extensions: extensions.length,
  };
  if (pyNe(report.counts, expected_counts)) {
    errors.push(issue("COUNTS", "$.validation_report.counts", `Expected exact counts ${pyrepr(expected_counts)}.`));
  }

  return { valid: errors.length === 0, errors, warnings };
}

function main() {
  const prog = basename(fileURLToPath(import.meta.url));
  const usage = `usage: ${prog} [-h] [--feed FEED] [--opportunities OPPORTUNITIES] [--catalog CATALOG] json_file`;
  const options = { feed: null, opportunities: null, catalog: null };
  const positionals = [];
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage + "\n");
      return;
    }
    const optionMatch = /^--(feed|opportunities|catalog)(?:=(.*))?$/.exec(arg);
    if (optionMatch) {
      let value = optionMatch[2];
      if (value === undefined) {
        index += 1;
        if (index >= argv.length) {
          process.stderr.write(`${usage}\n${prog}: error: argument --${optionMatch[1]}: expected one argument\n`);
          process.exitCode = 2;
          return;
        }
        value = argv[index];
      }
      options[optionMatch[1]] = value;
    } else if (arg.startsWith("--")) {
      process.stderr.write(`${usage}\n${prog}: error: unrecognized arguments: ${arg}\n`);
      process.exitCode = 2;
      return;
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1) {
    process.stderr.write(`${usage}\n${prog}: error: ${positionals.length === 0 ? "the following arguments are required: json_file" : `unrecognized arguments: ${positionals.slice(1).join(" ")}`}\n`);
    process.exitCode = 2;
    return;
  }
  const load = (path) => (path ? JSON.parse(readFileSync(path, "utf-8")) : null);
  const result = validate(load(positionals[0]), load(options.feed), load(options.opportunities), load(options.catalog));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.valid ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
