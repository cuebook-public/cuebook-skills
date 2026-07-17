#!/usr/bin/env node
// Validate ViewpointIntakeV1.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/viewpoint-intake-v1.schema.json", import.meta.url), "utf-8"),
);

const REQUIRED_FIELDS = ["asset", "direction", "horizon"];
const SETTLED_STATES = ["verified", "handed_back"];
const CAPTURED_PROVENANCE = ["stated", "elicited", "inferred_confirmed"];
const PASSING_PRICE_STATUSES = ["pass", "warn", "skipped", "unavailable"];
const PASSING_TARGET_STATUSES = ["pass", "skipped", "unavailable"];
const SETTLEABLE_DIRECTIONS = ["long", "short", "relative"];
const PAIR_FAMILIES = ["pair_asset_direction", "pair_asset_price_targets"];
const TARGET_FAMILIES = ["single_asset_price_target", "pair_asset_price_targets"];
const DIRECTION_FAMILIES = ["single_asset_direction", "pair_asset_direction"];
const HORIZON_MIN_HOURS = 1;
const HORIZON_MAX_HOURS = 24 * 183; // six months
const HORIZON_UNIT_MAX = { hour: HORIZON_MAX_HOURS, calendar_day: 183, market_session: 130 };

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

// Python str() for JSON values (only ever feeds the ISO parser here).
function pystr(value) {
  if (value === undefined || value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
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

export function horizon_bounds_error(intent, receivedAt) {
  const kind = get(intent, "kind");
  if (kind === "duration") {
    const value = get(intent, "value");
    const unit = get(intent, "unit");
    if (!Number.isInteger(value) || !Object.hasOwn(HORIZON_UNIT_MAX, unit)) {
      return "Duration horizon needs an integer value and a supported unit.";
    }
    if (unit === "hour" && value < HORIZON_MIN_HOURS) {
      return "Horizon must be at least one hour.";
    }
    if (value > HORIZON_UNIT_MAX[unit]) {
      return `Horizon exceeds six months (${unit} max ${HORIZON_UNIT_MAX[unit]}).`;
    }
    return null;
  }
  if (kind === "instant") {
    let settle;
    let received;
    try {
      settle = fromisoformat(pystr(get(intent, "requested_settle_at")).replaceAll("Z", "+00:00"));
      received = fromisoformat(pystr(receivedAt).replaceAll("Z", "+00:00"));
    } catch (error) {
      if (!(error instanceof ValueError)) throw error;
      return "Instant horizon timestamps must be ISO 8601.";
    }
    const hours = dtSubSeconds(settle, received) / 3600;
    if (hours < HORIZON_MIN_HOURS) {
      return "Horizon must be at least one hour after received_at.";
    }
    if (hours > HORIZON_MAX_HOURS) {
      return "Horizon exceeds six months after received_at.";
    }
    return null;
  }
  return "Horizon intent must be duration or instant.";
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function validate(payload) {
  if (!isDict(payload)) {
    return { valid: false, errors: [issue("ROOT_TYPE", "$", "Viewpoint intake must be an object.")] };
  }
  const errors = validateInstance(payload, SCHEMA);

  const state = get(payload, "state");
  const triage = isDict(get(payload, "triage")) ? get(payload, "triage") : {};
  const fields = isDict(get(payload, "fields")) ? get(payload, "fields") : {};
  const log = Array.isArray(get(payload, "elicitation_log")) ? get(payload, "elicitation_log") : [];
  const verification = isDict(get(payload, "verification")) ? get(payload, "verification") : {};
  const confirmation = isDict(get(payload, "confirmation")) ? get(payload, "confirmation") : {};
  const handback = isDict(get(payload, "handback")) ? get(payload, "handback") : {};

  const rounds = log.filter((entry) => isDict(entry)).map((entry) => get(entry, "round"));
  if (rounds.length !== new Set(rounds).size) {
    errors.push(issue("ELICIT_ROUND_DUPLICATE", "$.elicitation_log", "Each elicitation round number must be unique."));
  }

  const creatorContextFields = new Set(["news_signal", "intuition"]);
  const releaseFields = new Set(["settlement", "price_anchor"]);
  const creatorInterviewEntries = log.filter((entry) => {
    const asked = isDict(entry) && Array.isArray(get(entry, "asked")) ? get(entry, "asked") : [];
    return asked.some((name) => creatorContextFields.has(name));
  });
  if (creatorInterviewEntries.length > 1) {
    errors.push(issue("CREATOR_INTERVIEW_ROUNDS", "$.elicitation_log", "Offer creator context once; an answer or skip closes the interview."));
  }
  for (const entry of creatorInterviewEntries) {
    const asked = get(entry, "asked");
    if (asked.some((name) => !creatorContextFields.has(name))) {
      errors.push(issue("CREATOR_INTERVIEW_FOCUS", "$.elicitation_log", "Keep the optional creator interview separate from rigid fields, settlement, and price."));
    }
  }
  const creatorInterviewRound = creatorInterviewEntries.length ? get(creatorInterviewEntries[0], "round") : null;
  const firstReleaseRound = log.reduce((found, entry) => {
    const asked = isDict(entry) && Array.isArray(get(entry, "asked")) ? get(entry, "asked") : [];
    if (!asked.some((name) => releaseFields.has(name))) return found;
    const round = get(entry, "round");
    return found === null || round < found ? round : found;
  }, null);
  if (creatorInterviewRound !== null && firstReleaseRound !== null && creatorInterviewRound >= firstReleaseRound) {
    errors.push(issue("CREATOR_INTERVIEW_ORDER", "$.elicitation_log", "Creator news, signal, and intuition context must be invited before settlement or price."));
  }

  const askedFields = new Set();
  for (const entry of log) {
    if (isDict(entry)) {
      const asked = truthy(get(entry, "asked")) ? get(entry, "asked") : [];
      for (const item of asked) askedFields.add(item);
    }
  }
  for (const name of ["asset", "direction", "horizon", "price_anchor"]) {
    const field = isDict(get(fields, name)) ? get(fields, name) : {};
    if (["elicited", "inferred_confirmed"].includes(get(field, "provenance")) && !askedFields.has(name)) {
      errors.push(issue("ELICITED_WITHOUT_LOG", `$.fields.${name}`, "An elicited or confirmed-inference field needs a matching elicitation_log entry; never fill a field the user did not address."));
    }
  }

  if (get(triage, "intent") === "query_only" && !["query_routed", "abandoned"].includes(state)) {
    errors.push(issue("QUERY_NOT_FORCED", "$.state", "A query-only visitor is routed to query-cuebook or leaves; intake never forces creation."));
  }
  if (state === "query_routed") {
    if (!["query_only", "mixed"].includes(get(triage, "intent"))) {
      errors.push(issue("QUERY_ROUTE_INTENT", "$.triage.intent", "query_routed requires query_only or mixed intent."));
    }
    if (get(triage, "query_route") !== "query-cuebook") {
      errors.push(issue("QUERY_ROUTE_TARGET", "$.triage.query_route", "query_routed must name the query-cuebook route."));
    }
    if (get(handback, "target") !== "none") {
      errors.push(issue("QUERY_ROUTE_HANDBACK", "$.handback.target", "A query route hands nothing to creation."));
    }
  }

  const directionValue = isDict(get(fields, "direction")) ? get(truthy(get(fields, "direction")) ? get(fields, "direction") : {}, "value") : null;
  const settlement = isDict(get(fields, "settlement")) ? get(fields, "settlement") : {};
  const family = get(settlement, "family");
  const pairAsset = isDict(get(fields, "pair_asset")) ? get(fields, "pair_asset") : null;
  let priceAnchor = isDict(get(fields, "price_anchor")) ? get(fields, "price_anchor") : {};

  if (family !== null && !SETTLEABLE_DIRECTIONS.includes(directionValue)) {
    errors.push(issue("NON_SETTLEABLE_DIRECTION", "$.fields.settlement.family", "avoid/watch/explain/neutral views cannot carry a settlement family; they can only be stored."));
  }
  if (directionValue === "relative" && family !== null && !PAIR_FAMILIES.includes(family)) {
    errors.push(issue("RELATIVE_NEEDS_PAIR", "$.fields.settlement.family", "A relative view settles as a confirmed two-asset pair family."));
  }
  if (PAIR_FAMILIES.includes(family)) {
    if (!truthy(pairAsset) || [null, ""].includes(get(pairAsset, "value")) || !CAPTURED_PROVENANCE.includes(get(pairAsset, "provenance"))) {
      errors.push(issue("PAIR_ASSET_MISSING", "$.fields.pair_asset", "Pair settlement families require a captured second asset."));
    }
  } else if (truthy(pairAsset) && ![null, ""].includes(get(pairAsset, "value"))) {
    errors.push(issue("PAIR_ASSET_UNEXPECTED", "$.fields.pair_asset", "A single-asset family cannot carry a second asset."));
  }
  if (DIRECTION_FAMILIES.includes(family) && [null, ""].includes(get(settlement, "threshold_bps"))) {
    errors.push(issue("THRESHOLD_NOT_EXPLICIT", "$.fields.settlement.threshold_bps", "Direction families freeze an explicit threshold; a default of 0 must still be stated as \"0\"."));
  }
  if (TARGET_FAMILIES.includes(family) && get(priceAnchor, "value") === null) {
    errors.push(issue("TARGET_PRICE_MISSING", "$.fields.price_anchor.value", "Price-target families require a captured target price."));
  }

  const operator = get(priceAnchor, "operator");
  if (operator !== null && ["long", "short"].includes(directionValue)) {
    if (directionValue === "long" && !["gt", "gte"].includes(operator)) {
      errors.push(issue("TARGET_OPERATOR_DIRECTION", "$.fields.price_anchor.operator", "A long target uses gt/gte."));
    }
    if (directionValue === "short" && !["lt", "lte"].includes(operator)) {
      errors.push(issue("TARGET_OPERATOR_DIRECTION", "$.fields.price_anchor.operator", "A short target uses lt/lte."));
    }
  }

  const targetDirection = isDict(get(verification, "target_direction")) ? get(verification, "target_direction") : {};
  const referencePrice = get(targetDirection, "reference_price");
  const targetValue = get(priceAnchor, "value");
  if (
    get(targetDirection, "status") === "pass"
    && typeof referencePrice === "number"
    && typeof targetValue === "number"
    && ["long", "short"].includes(directionValue)
  ) {
    const conflict = (directionValue === "long" && targetValue <= referencePrice) || (
      directionValue === "short" && targetValue >= referencePrice
    );
    if (conflict) {
      errors.push(issue("TARGET_DIRECTION_CONFLICT", "$.verification.target_direction", `A ${directionValue} target of ${pystr(targetValue)} against reference ${pystr(referencePrice)} contradicts the direction; ask whether the user means the opposite side, and block if unresolved.`));
    }
  }

  if (state === "blocked") {
    if (get(handback, "eligible") === true || ![null, "none"].includes(get(handback, "target"))) {
      errors.push(issue("BLOCKED_HANDBACK", "$.handback", "A blocked intake hands nothing back."));
    }
    if (!truthy(get(handback, "blockers"))) {
      errors.push(issue("BLOCKED_WITHOUT_REASON", "$.handback.blockers", "A blocked intake states its blockers."));
    }
  }

  if (SETTLED_STATES.includes(state)) {
    for (const name of REQUIRED_FIELDS) {
      const field = isDict(get(fields, name)) ? get(fields, name) : {};
      if ([null, ""].includes(get(field, "value")) || !CAPTURED_PROVENANCE.includes(get(field, "provenance"))) {
        errors.push(issue("REQUIRED_FIELD_MISSING", `$.fields.${name}`, `State ${state} requires ${name} with stated, elicited, or confirmed-inference provenance.`));
      }
    }
    const horizon = isDict(get(fields, "horizon")) ? get(fields, "horizon") : {};
    const intent = isDict(get(horizon, "intent")) ? get(horizon, "intent") : null;
    if (intent === null) {
      errors.push(issue("HORIZON_NOT_STRUCTURED", "$.fields.horizon.intent", "A settled horizon carries a HorizonIntentV1-compatible intent."));
    } else {
      const rawInput = truthy(get(payload, "raw_input")) ? get(payload, "raw_input") : {};
      const receivedAt = get(rawInput, "received_at", "");
      const boundsError = horizon_bounds_error(intent, receivedAt);
      if (truthy(boundsError)) {
        errors.push(issue("HORIZON_BOUNDS", "$.fields.horizon.intent", boundsError));
      }
    }
    if (!CAPTURED_PROVENANCE.includes(get(settlement, "provenance")) && family !== null) {
      errors.push(issue("SETTLEMENT_PROVENANCE", "$.fields.settlement", "A chosen settlement family needs stated, elicited, or confirmed-inference provenance."));
    }
    for (const [check, allowed] of [
      ["asset_resolution", ["pass"]],
      ["horizon_validity", ["pass"]],
      ["direction_consistency", ["pass"]],
      ["price_sanity", PASSING_PRICE_STATUSES],
      ["target_direction", PASSING_TARGET_STATUSES],
    ]) {
      const status = isDict(get(verification, check)) ? get(truthy(get(verification, check)) ? get(verification, check) : {}, "status") : null;
      if (!allowed.includes(status)) {
        errors.push(issue("VERIFICATION_INCOMPLETE", `$.verification.${check}`, `State ${state} requires ${check} status in ${pyrepr(allowed.slice().sort())}; found ${pyrepr(status)}.`));
      }
    }
  }

  const assetResolution = isDict(get(verification, "asset_resolution")) ? get(verification, "asset_resolution") : {};
  if (get(assetResolution, "status") === "pass" && !truthy(get(assetResolution, "resolved_ref"))) {
    errors.push(issue("ASSET_RESOLUTION_REF", "$.verification.asset_resolution.resolved_ref", "A passing asset resolution names the canonical ref it resolved."));
  }

  priceAnchor = isDict(get(fields, "price_anchor")) ? get(fields, "price_anchor") : {};
  const priceSanity = isDict(get(verification, "price_sanity")) ? get(verification, "price_sanity") : {};
  if (get(priceAnchor, "value") !== null && !truthy(get(priceAnchor, "kind"))) {
    errors.push(issue("PRICE_ANCHOR_KIND", "$.fields.price_anchor.kind", "A price anchor declares entry, trigger, or reference."));
  }
  if (get(priceAnchor, "value") === null && ![null, "skipped", "pending"].includes(get(priceSanity, "status"))) {
    errors.push(issue("PRICE_SANITY_WITHOUT_ANCHOR", "$.verification.price_sanity.status", "Without a price anchor, price sanity is skipped or pending."));
  }

  if (state === "handed_back") {
    if (get(confirmation, "confirmed") !== true) {
      errors.push(issue("HANDBACK_UNCONFIRMED", "$.confirmation.confirmed", "Hand back requires the user-confirmed recap card."));
    }
    if ([null, "none"].includes(get(handback, "target"))) {
      errors.push(issue("HANDBACK_TARGET", "$.handback.target", "Hand back names a creation or storage target."));
    }
    if (get(handback, "eligible") !== true) {
      errors.push(issue("HANDBACK_INELIGIBLE", "$.handback.eligible", "Hand back requires an eligible payload."));
    }
  }
  if (get(handback, "eligible") === true && !isDict(get(handback, "seed"))) {
    errors.push(issue("HANDBACK_SEED", "$.handback.seed", "An eligible handback carries a seed."));
  }

  return { valid: !errors.length, errors };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write("usage: validate_viewpoint_intake.mjs json_file\n");
    process.exit(2);
  }
  const result = validate(JSON.parse(readFileSync(args[0], "utf-8")));
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
