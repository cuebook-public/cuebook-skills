#!/usr/bin/env node
// Validate FrameDraftAssemblyV1 — the Skill-side package handed to the Frame backend.
//
// Bundles one FrameDraftV1-compatible draft, an optional SettlementIntentV1, the
// visual-manifest lineage, and the idempotency key. Mirrors the frozen core
// contracts (packages/core/src/frame/contracts.ts) so the assembly can be
// verified before any backend call.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The backend derives time-ordered dedupe state from the idempotency key, so a
// generic UUID (v4 etc.) is rejected: only UUIDv7 carries the required
// millisecond-ordered prefix. Mirrors uuidV7Schema in core frame assembly.
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const FAMILIES = ["single_asset_direction", "single_asset_price_target", "pair_asset_direction", "pair_asset_price_targets"];
const PAIR_FAMILIES = ["pair_asset_direction", "pair_asset_price_targets"];
const TARGET_FAMILIES = ["single_asset_price_target", "pair_asset_price_targets"];
const HORIZON_UNIT_MAX = { hour: 24 * 183, calendar_day: 183, market_session: 130 };
const MEDIA_ROLES = ["publication", "compact", "og"];

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

// Python str() for JSON values (objects fall back to a JSON rendering; such
// strings only feed regexes / set cardinality here, never the output).
function pystr(value) {
  if (value === undefined || value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

// Python str.strip() whitespace set.
const PY_WS = "\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "g");
function pystrip(value) {
  return value.replace(PY_STRIP, "");
}

class ValueError extends Error {}

const ISO_PATTERN = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
  "(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?" +
  "(?:([+-])(\\d{2}):(\\d{2})(?::(\\d{2}))?)?)?$",
);

// Subset of datetime.fromisoformat (Python 3.11+) covering the colon-separated
// forms Cuebook emits; returns { epochMs, aware }.
function fromisoformat(value) {
  const match = ISO_PATTERN.exec(value);
  if (!match) throw new ValueError(`Invalid isoformat string: ${value}`);
  const [, y, mo, d, hh, mm, ss, frac, sign, oh, om, os] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = hh === undefined ? 0 : Number(hh);
  const minute = mm === undefined ? 0 : Number(mm);
  const second = ss === undefined ? 0 : Number(ss);
  const microseconds = frac === undefined ? 0 : Number(frac.slice(0, 6).padEnd(6, "0"));
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) {
    throw new ValueError(`Invalid isoformat string: ${value}`);
  }
  const base = new Date(Date.UTC(2000, month - 1, day, hour, minute, second));
  base.setUTCFullYear(year);
  let epochMs = base.getTime() + microseconds / 1000;
  let aware = false;
  if (sign !== undefined) {
    const offsetMinutes = Number(oh) * 60 + Number(om) + (os === undefined ? 0 : Number(os) / 60);
    if (Number(oh) > 23 || Number(om) > 59 || (os !== undefined && Number(os) > 59)) {
      throw new ValueError(`Invalid isoformat string: ${value}`);
    }
    epochMs -= offsetMinutes * 60000 * (sign === "-" ? -1 : 1);
    aware = true;
  }
  return { epochMs, aware };
}

// datetime subtraction -> total seconds; mixing naive and aware raises like Python.
function dtSubSeconds(a, b) {
  if (a.aware !== b.aware) throw new TypeError("can't subtract offset-naive and offset-aware datetimes");
  return (a.epochMs - b.epochMs) / 1000;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function check_horizon(h, receivedAt, errors, path) {
  if (!isDict(h)) {
    errors.push(issue("HORIZON_SHAPE", path, "Horizon must be a HorizonIntentV1 object."));
    return;
  }
  const kind = get(h, "kind");
  if (kind === "duration") {
    const value = get(h, "value");
    const unit = get(h, "unit");
    if (!Number.isInteger(value) || value < 1 || !Object.hasOwn(HORIZON_UNIT_MAX, unit)) {
      errors.push(issue("HORIZON_SHAPE", path, "Duration needs positive integer value and supported unit."));
    } else if (value > HORIZON_UNIT_MAX[unit]) {
      errors.push(issue("HORIZON_BOUNDS", path, `Horizon exceeds six months (${unit} max ${HORIZON_UNIT_MAX[unit]}).`));
    }
  } else if (kind === "instant") {
    try {
      const settle = fromisoformat(pystr(get(h, "requested_settle_at")).replaceAll("Z", "+00:00"));
      const base = fromisoformat(pystr(receivedAt).replaceAll("Z", "+00:00"));
      const hours = dtSubSeconds(settle, base) / 3600;
      if (hours < 1 || hours > 24 * 183) {
        errors.push(issue("HORIZON_BOUNDS", path, "Instant horizon must sit 1 hour to 6 months after assembled_at."));
      }
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      errors.push(issue("HORIZON_SHAPE", path, "Instant horizon timestamps must be ISO 8601."));
    }
  } else {
    errors.push(issue("HORIZON_SHAPE", path, "Horizon kind must be duration or instant."));
  }
  if (!truthy(get(h, "creator_timezone")) || !["at_instant", "next_eligible_close"].includes(get(h, "session_policy"))) {
    errors.push(issue("HORIZON_SHAPE", path, "Horizon needs creator_timezone and session_policy."));
  }
}

export function check_leg(leg, needsTarget, needsThreshold, errors, path) {
  if (!isDict(leg)) {
    errors.push(issue("LEG_SHAPE", path, "Leg must be an object."));
    return;
  }
  if (!["long", "short"].includes(get(leg, "direction"))) {
    errors.push(issue("LEG_DIRECTION", path, "Leg direction must be long or short."));
  }
  if (!truthy(get(leg, "asset_ref"))) {
    errors.push(issue("LEG_ASSET", path, "Leg needs an asset_ref."));
  }
  if (needsThreshold) {
    const t = get(leg, "threshold_bps");
    if (typeof t !== "string" || !DECIMAL_PATTERN.test(t)) {
      errors.push(issue("THRESHOLD_NOT_EXPLICIT", path, "Direction legs freeze an explicit decimal-string threshold_bps (\"0\" counts)."));
    }
  }
  if (needsTarget) {
    const target = get(leg, "target");
    if (!isDict(target) || !["gt", "gte", "lt", "lte"].includes(get(target, "operator")) || typeof get(target, "price") !== "string" || !DECIMAL_PATTERN.test(pystr(get(target, "price")))) {
      errors.push(issue("TARGET_SHAPE", path, "Target legs need operator gt/gte/lt/lte and a decimal-string price."));
    } else if (get(leg, "direction") === "long" && !["gt", "gte"].includes(target.operator)) {
      errors.push(issue("TARGET_OPERATOR_DIRECTION", path, "A long target uses gt/gte."));
    } else if (get(leg, "direction") === "short" && !["lt", "lte"].includes(target.operator)) {
      errors.push(issue("TARGET_OPERATOR_DIRECTION", path, "A short target uses lt/lte."));
    }
  }
}

export function validate(payload, binding = null, visualManifest = null) {
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Assembly must be an object.")] };
  }
  const errors = [];
  if (get(payload, "schema_version") !== "frame-draft-assembly-v1") {
    errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected frame-draft-assembly-v1."));
  }
  if (!UUID_V7_PATTERN.test(pystr(get(payload, "idempotency_key", "")))) {
    errors.push(issue("IDEMPOTENCY_KEY", "$.idempotency_key", "A lowercase UUIDv7 idempotency key is required; other UUID versions are rejected."));
  }
  const assembledAt = pystr(get(payload, "assembled_at", ""));
  if (!assembledAt) {
    errors.push(issue("ASSEMBLED_AT", "$.assembled_at", "assembled_at ISO timestamp is required."));
  }

  const draft = isDict(get(payload, "frame_draft")) ? get(payload, "frame_draft") : {};
  if (get(draft, "kind") !== "market_view") {
    errors.push(issue("DRAFT_KIND", "$.frame_draft.kind", "Launch drafts are kind market_view."));
  }
  const visibility = get(draft, "visibility");
  if (!["private", "unlisted", "public"].includes(visibility)) {
    errors.push(issue("DRAFT_VISIBILITY", "$.frame_draft.visibility", "Visibility must be private, unlisted, or public."));
  }
  const title = pystr(get(draft, "title", ""));
  const body = pystr(get(draft, "body", ""));
  const titleLength = [...title].length;
  const bodyLength = [...body].length;
  if (!(titleLength >= 1 && titleLength <= 80)) {
    errors.push(issue("DRAFT_TITLE", "$.frame_draft.title", "Title is one clear judgment line, 1-80 characters."));
  }
  if (!(bodyLength >= 1 && bodyLength <= 2000)) {
    errors.push(issue("DRAFT_BODY", "$.frame_draft.body", "Body must be 1-2000 characters."));
  }
  if (!["none", "assisted", "generated"].includes(pystr(get(get(draft, "disclosures", {}), "ai_assistance")))) {
    errors.push(issue("DRAFT_DISCLOSURE", "$.frame_draft.disclosures.ai_assistance", "AI provenance disclosure is required."));
  }
  const media = Array.isArray(get(draft, "media")) ? get(draft, "media") : [];
  const roles = {};
  media.forEach((item, index) => {
    const role = isDict(item) ? get(item, "rendition_role") : null;
    if (!MEDIA_ROLES.includes(role)) {
      errors.push(issue("MEDIA_ROLE", `$.frame_draft.media[${index}]`, "Media roles are publication, compact, or og."));
      return;
    }
    roles[role] = item;
    if (!pystrip(pystr(get(item, "alt_text", "")))) {
      errors.push(issue("MEDIA_ALT_TEXT", `$.frame_draft.media[${index}]`, `Role ${role} needs non-empty alt_text.`));
    }
    if (!SHA_PATTERN.test(pystr(get(item, "sha256", "")))) {
      errors.push(issue("MEDIA_HASH", `$.frame_draft.media[${index}]`, "Each media item carries the exact encoded PNG byte sha256."));
    }
  });
  for (const required of ["publication", "compact"]) {
    if (!Object.hasOwn(roles, required)) {
      errors.push(issue("MEDIA_ROLE_MISSING", "$.frame_draft.media", `${required} rendition is required for every publication.`));
    }
  }
  if (["public", "unlisted"].includes(visibility) && !Object.hasOwn(roles, "og")) {
    errors.push(issue("OG_REQUIRED", "$.frame_draft.media", "Public and unlisted drafts require an independently composed og rendition."));
  }

  const lineage = isDict(get(payload, "lineage")) ? get(payload, "lineage") : {};
  if (!SHA_PATTERN.test(pystr(get(lineage, "visual_manifest_sha256", "")))) {
    errors.push(issue("LINEAGE_MANIFEST", "$.lineage.visual_manifest_sha256", "The frame-visual-manifest-v1 JCS hash is required."));
  }
  if (!truthy(get(lineage, "intake_ref"))) {
    errors.push(issue("LINEAGE_INTAKE", "$.lineage.intake_ref", "The ViewpointIntakeV1 ref is required."));
  }

  const intent = get(payload, "settlement_intent");
  if (intent === null) {
    if (["public", "unlisted"].includes(visibility)) {
      errors.push(issue("INTENT_REQUIRED", "$.settlement_intent", "A publishable market_view carries exactly one settlement intent."));
    }
  } else if (isDict(intent)) {
    const family = get(intent, "family");
    if (!FAMILIES.includes(family)) {
      errors.push(issue("INTENT_FAMILY", "$.settlement_intent.family", "Family must be one of the four launch families."));
    } else {
      check_horizon(get(intent, "horizon"), assembledAt, errors, "$.settlement_intent.horizon");
      const needsTarget = TARGET_FAMILIES.includes(family);
      const aggregateOrEmpty = truthy(get(intent, "aggregate", {})) ? get(intent, "aggregate", {}) : {};
      const needsThreshold = ["single_asset_direction", "pair_asset_direction"].includes(family) && get(aggregateOrEmpty, "mode") !== "equal_notional_long_short";
      const legs = PAIR_FAMILIES.includes(family) ? get(intent, "legs") : [get(intent, "leg")];
      if (PAIR_FAMILIES.includes(family) && (!Array.isArray(legs) || legs.length !== 2)) {
        errors.push(issue("LEG_COUNT", "$.settlement_intent.legs", "Pair families need exactly two legs."));
      } else {
        const legList = truthy(legs) ? legs : [];
        legList.forEach((leg, i) => {
          check_leg(leg, needsTarget, needsThreshold, errors, `$.settlement_intent.legs[${i}]`);
        });
        if (PAIR_FAMILIES.includes(family) && Array.isArray(legs) && legs.length === 2) {
          const refs = new Set(legs.filter((l) => isDict(l)).map((l) => pystr(get(truthy(l) ? l : {}, "asset_ref"))));
          if (refs.size !== 2) {
            errors.push(issue("PAIR_DISTINCT_ASSETS", "$.settlement_intent.legs", "Pair legs must reference two different assets."));
          }
          const aggregate = isDict(get(intent, "aggregate")) ? get(intent, "aggregate") : {};
          if (family === "pair_asset_direction" && get(aggregate, "mode") === "equal_notional_long_short") {
            const directions = legs.filter((l) => isDict(l)).map((l) => pystr(get(truthy(l) ? l : {}, "direction"))).sort();
            if (!(directions.length === 2 && directions[0] === "long" && directions[1] === "short")) {
              errors.push(issue("PAIR_LONG_SHORT", "$.settlement_intent.legs", "Equal-notional pairs need exactly one long and one short leg."));
            }
            const spread = get(aggregate, "spread_threshold_bps");
            if (typeof spread !== "string" || !DECIMAL_PATTERN.test(spread)) {
              errors.push(issue("THRESHOLD_NOT_EXPLICIT", "$.settlement_intent.aggregate", "Equal-notional pairs freeze an explicit spread_threshold_bps."));
            }
          }
        }
      }
    }
    if (!pystrip(pystr(get(intent, "claim_text", "")))) {
      errors.push(issue("INTENT_CLAIM", "$.settlement_intent.claim_text", "claim_text is required and freezes at publish."));
    }
  } else {
    errors.push(issue("INTENT_SHAPE", "$.settlement_intent", "Settlement intent must be an object or null."));
  }

  const hasBinding = binding !== null && binding !== undefined;
  const hasManifest = visualManifest !== null && visualManifest !== undefined;
  if (hasBinding !== hasManifest) {
    errors.push(issue("HANDOFF_INPUTS", "$", "Registered binding and visual manifest must be validated together before create_frame_draft."));
  } else if (hasBinding && hasManifest) {
    if (!isDict(binding)) {
      errors.push(issue("BINDING_SHAPE", "$.binding", "FrameDraftAssemblyBindingV1 must be an object."));
    } else {
      for (const field of ["media_asset_id", "visual_manifest_id"]) {
        if (!UUID_PATTERN.test(pystr(get(binding, field, "")))) {
          errors.push(issue("BINDING_ID", `$.binding.${field}`, `${field} must be a lowercase UUID returned by the Frame service.`));
        }
      }
      const bindingHash = pystr(get(binding, "visual_manifest_sha256", ""));
      if (!SHA_PATTERN.test(bindingHash)) {
        errors.push(issue("BINDING_MANIFEST_HASH", "$.binding.visual_manifest_sha256", "The registered binding must carry the visual manifest sha256."));
      } else if (bindingHash !== pystr(get(lineage, "visual_manifest_sha256", ""))) {
        errors.push(issue("BINDING_MANIFEST_MISMATCH", "$.binding.visual_manifest_sha256", "The registered binding hash must match assembly lineage."));
      }
    }

    if (!isDict(visualManifest)) {
      errors.push(issue("VISUAL_MANIFEST_SHAPE", "$.visual_manifest", "frame-visual-manifest-v1 must be an object."));
    } else {
      if (get(visualManifest, "schema_version") !== "frame-visual-manifest-v1") {
        errors.push(issue("VISUAL_MANIFEST_VERSION", "$.visual_manifest.schema_version", "Expected frame-visual-manifest-v1."));
      }
      const roleHashes = isDict(get(visualManifest, "role_hashes")) ? get(visualManifest, "role_hashes") : {};
      const manifestAlt = isDict(get(visualManifest, "alt_text_by_role")) ? get(visualManifest, "alt_text_by_role") : {};
      const assemblyRoles = new Set(Object.keys(roles));
      const hashRoles = new Set(Object.keys(roleHashes));
      const altRoles = new Set(Object.keys(manifestAlt));
      if (assemblyRoles.size !== hashRoles.size || [...assemblyRoles].some((role) => !hashRoles.has(role))) {
        errors.push(issue("VISUAL_MANIFEST_ROLES", "$.visual_manifest.role_hashes", "Manifest pixel-hash roles must exactly match assembly media roles."));
      }
      if (assemblyRoles.size !== altRoles.size || [...assemblyRoles].some((role) => !altRoles.has(role))) {
        errors.push(issue("VISUAL_MANIFEST_ALT_ROLES", "$.visual_manifest.alt_text_by_role", "Manifest alt-text roles must exactly match assembly media roles."));
      }
      const pixelHashes = [];
      for (const role of hashRoles) {
        const pixelHash = pystr(roleHashes[role]);
        if (!SHA_PATTERN.test(pixelHash)) {
          errors.push(issue("VISUAL_PIXEL_HASH", `$.visual_manifest.role_hashes.${role}`, "role_hashes must carry canonical RGBA8 pixel sha256 values."));
        } else {
          pixelHashes.push(pixelHash);
        }
      }
      if (new Set(pixelHashes).size !== pixelHashes.length) {
        errors.push(issue("VISUAL_PIXEL_HASH_DUPLICATE", "$.visual_manifest.role_hashes", "Each rendition role must bind distinct canonical pixels."));
      }
      for (const [role, item] of Object.entries(roles)) {
        if (Object.hasOwn(manifestAlt, role) && manifestAlt[role] !== get(item, "alt_text")) {
          errors.push(issue("ALT_TEXT_MANIFEST_MISMATCH", `$.frame_draft.media.${role}.alt_text`, "Assembly alt text must exactly match the authoritative visual manifest value."));
        }
      }
    }
  }

  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  const assemblyPath = args[0];
  let bindingPath = null;
  let visualManifestPath = null;
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--binding") bindingPath = value;
    else if (flag === "--visual-manifest") visualManifestPath = value;
    else {
      process.stderr.write("usage: validate_frame_draft_assembly.mjs assembly.json [--binding binding.json --visual-manifest manifest.json]\n");
      process.exit(2);
    }
  }
  if (!assemblyPath || assemblyPath.startsWith("-") || args.length % 2 === 0 || (bindingPath === null) !== (visualManifestPath === null)) {
    process.stderr.write("usage: validate_frame_draft_assembly.mjs assembly.json [--binding binding.json --visual-manifest manifest.json]\n");
    process.exit(2);
  }
  const result = validate(
    JSON.parse(readFileSync(assemblyPath, "utf-8")),
    bindingPath ? JSON.parse(readFileSync(bindingPath, "utf-8")) : null,
    visualManifestPath ? JSON.parse(readFileSync(visualManifestPath, "utf-8")) : null,
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
