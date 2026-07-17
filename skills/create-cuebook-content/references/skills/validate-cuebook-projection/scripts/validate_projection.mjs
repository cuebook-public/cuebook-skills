#!/usr/bin/env node
// Port of validate_projection.py; output shapes, codes, and messages are contract.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { argv, exit, stdout, stderr } from "node:process";

// --- Python-compatible helpers -------------------------------------------------

// Python's re module treats \b, \w, and \d as Unicode-aware; JavaScript's are
// ASCII-only. Rewrite those tokens so behavior matches CPython on CJK text.
const WORD = "\\p{L}\\p{N}_";
function pyRegex(pattern, flags = "") {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === "b" && !inClass) {
        out += `(?:(?<![${WORD}])(?=[${WORD}])|(?<=[${WORD}])(?![${WORD}]))`;
        i += 1;
        continue;
      }
      if (next === "w") {
        out += inClass ? WORD : `[${WORD}]`;
        i += 1;
        continue;
      }
      if (next === "d") {
        out += "\\p{Nd}";
        i += 1;
        continue;
      }
      out += ch + (next ?? "");
      i += 1;
      continue;
    }
    if (ch === "[" && !inClass) inClass = true;
    else if (ch === "]" && inClass) inClass = false;
    out += ch;
  }
  return new RegExp(out, flags.includes("u") ? flags : `${flags}u`);
}

function escapeRe(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
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

// Python str() for the scalar JSON values that reach text blobs.
function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

function cpSlice(text, end) {
  return [...text].slice(0, end).join("");
}

function cpLen(text) {
  return [...text].length;
}

const setUnion = (a, b) => new Set([...a, ...b]);
const setIntersect = (a, b) => new Set([...a].filter((item) => b.has(item)));
const setDiff = (a, b) => new Set([...a].filter((item) => !b.has(item)));
const isDisjoint = (a, b) => ![...a].some((item) => b.has(item));
const sortedList = (iterable) => [...iterable].sort();

// --- ISO datetime handling (datetime.fromisoformat parity) ---------------------

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(year, month) {
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

const ISO_RE = new RegExp(
  "^(\\d{4})-(\\d{2})-(\\d{2})" +
    "(?:[Tt ](\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?|(\\d{2})(?:(\\d{2})(?:[.,](\\d+))?)?)?" +
    "(?:([zZ])|([+-])(\\d{2})(?::(\\d{2})(?::(\\d{2}))?|(\\d{2})(?:(\\d{2}))?)?)?" +
    ")?$",
);

// Returns {y, mo, d, h, mi, s, us, offsetSec (seconds or null when naive)} or null.
function parseIso(text) {
  const match = ISO_RE.exec(text);
  if (!match) return null;
  const [, ys, mos, ds, h1, mi1, s1, f1, mi2, s2, f2, zulu, sign, oh, om1, os1, om2, os2] = match;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  const h = h1 === undefined ? 0 : Number(h1);
  const mi = Number(mi1 ?? mi2 ?? 0);
  const s = Number(s1 ?? s2 ?? 0);
  const frac = f1 ?? f2;
  const us = frac === undefined ? 0 : Number(frac.padEnd(6, "0").slice(0, 6));
  if (h > 23 || mi > 59 || s > 59) return null;
  let offsetSec = null;
  if (zulu !== undefined) offsetSec = 0;
  else if (sign !== undefined) {
    const offH = Number(oh);
    const offM = Number(om1 ?? om2 ?? 0);
    const offS = Number(os1 ?? os2 ?? 0);
    if (offM > 59 || offS > 59) return null;
    const total = offH * 3600 + offM * 60 + offS;
    if (total >= 24 * 3600) return null;
    offsetSec = sign === "-" ? -total : total;
  }
  return { y, mo, d, h, mi, s, us, offsetSec };
}

function epochUs(parts) {
  const offset = parts.offsetSec ?? 0;
  return (
    BigInt(Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s)) * 1000n +
    BigInt(parts.us) -
    BigInt(offset) * 1000000n
  );
}

function pad(value, width) {
  return String(value).padStart(width, "0");
}

// datetime.isoformat() for a timezone-aware value.
function isoformat(parts) {
  let out = `${pad(parts.y, 4)}-${pad(parts.mo, 2)}-${pad(parts.d, 2)}T${pad(parts.h, 2)}:${pad(parts.mi, 2)}:${pad(parts.s, 2)}`;
  if (parts.us) out += `.${pad(parts.us, 6)}`;
  const offset = parts.offsetSec ?? 0;
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  out += `${sign}${pad(Math.floor(abs / 3600), 2)}:${pad(Math.floor((abs % 3600) / 60), 2)}`;
  if (abs % 60) out += `:${pad(abs % 60, 2)}`;
  return out;
}

// parse_time(): naive timestamps are treated as UTC; invalid input returns null.
export function parseTime(value) {
  if (!truthy(value) || typeof value !== "string") return null;
  const parts = parseIso(value.replaceAll("Z", "+00:00"));
  if (parts === null) return null;
  if (parts.offsetSec === null) parts.offsetSec = 0;
  return { parts, us: epochUs(parts) };
}

// --- Domain constants -----------------------------------------------------------

const BROAD_ASSETS = new Set(["SPY", "QQQ", "IWM", "DIA", "RSP", "VTI"]);
const MACRO_TERMS = pyRegex("\\b(fed|cpi|inflation|rates?|yields?|dollar|liquidity|recession|jobs|payroll|oil|war|sanctions?|volatility)\\b", "i");
const NARROW_TERMS = pyRegex("\\b(fcc|satellite|tourism|ev discount|subsidy|approval|contract|price target|product launch|merger)\\b", "i");
const ANALYST_TERMS = pyRegex("\\b(price target|raises? target|lowers? target|analyst|maintains? (?:buy|sell|hold|overweight|underweight|outperform)|reiterates? (?:buy|sell|hold)|upgrades? .{0,60} to|downgrades? .{0,60} to)\\b", "i");
const MODEL_TERMS = pyRegex("\\b(eps|ebitda|revenue|guidance|margin|bookings|arr|fcf|free cash flow|tam|market share|adoption|product cycle|sell[- ]?through)\\b", "i");
const IDENTITY_STOPWORDS = new Set([
  "after", "ahead", "analyst", "climbs", "company", "cuts", "downside",
  "earnings", "forecast", "growth", "guidance", "impact", "investors",
  "market", "merger", "overlooks", "price", "prices", "raises", "revenue",
  "risk", "rises", "shares", "slide", "still", "stock", "surge", "target",
  "underestimates", "underpricing", "upside", "why",
]);

// --- Card helpers ---------------------------------------------------------------

function field(obj, ...names) {
  for (const name of names) {
    const value = obj?.[name];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function values(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(...values(item));
    return out;
  }
  if (typeof value === "object") {
    const out = [];
    for (const key of ["content", "text", "title", "note", "url", "occurred_at", "observed_at", "created_at"]) {
      if (value[key] !== null && value[key] !== undefined) out.push(...values(value[key]));
    }
    if (out.length) return out;
    for (const item of Object.values(value)) out.push(...values(item));
    return out;
  }
  return [pyStr(value)];
}

function clean(text) {
  return text.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function ticker(value) {
  return pyStr(truthy(value) ? value : "").toUpperCase().replace(/[^A-Z0-9.:-]/gu, "");
}

function assetRecords(card) {
  let raw = field(card, "assets", "cue_assets");
  raw = truthy(raw) ? raw : [];
  if (!Array.isArray(raw) && typeof raw === "object") raw = [raw];
  if (!Array.isArray(raw)) raw = [];
  const records = raw
    .filter((item) => item !== null && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({ ...item }));
  const direct = field(card, "asset", "lead_asset", "symbol");
  if (
    truthy(direct) &&
    !records.some((item) => ticker(field(item, "ticker", "canonical_ticker", "canonicalTicker", "symbol")) === ticker(direct))
  ) {
    records.unshift({ symbol: direct });
  }
  return records;
}

function cardAssets(card) {
  const out = new Set();
  for (const item of assetRecords(card)) {
    const value = field(item, "ticker", "canonical_ticker", "canonicalTicker", "symbol");
    if (truthy(ticker(value))) out.add(ticker(value));
  }
  return out;
}

function assetAliases(card) {
  const aliases = new Set([...cardAssets(card)].map((item) => item.toLowerCase()));
  for (const item of assetRecords(card)) {
    for (const key of ["name", "display_name", "displayName"]) {
      if (truthy(item[key])) aliases.add(clean(pyStr(item[key])).toLowerCase());
    }
    for (const alias of values(item.aliases)) aliases.add(clean(alias).toLowerCase());
  }
  return new Set([...aliases].filter((item) => truthy(item)));
}

function descriptiveAliases(card) {
  const aliases = new Set();
  for (const item of assetRecords(card)) {
    for (const key of ["name", "display_name", "displayName"]) {
      if (truthy(item[key])) aliases.add(clean(pyStr(item[key])).toLowerCase());
    }
    for (const alias of values(item.aliases)) aliases.add(clean(alias).toLowerCase());
  }
  const cAssets = cardAssets(card);
  return new Set([...aliases].filter((item) => truthy(item) && !cAssets.has(ticker(item))));
}

function sourceObjects(card) {
  const objects = [];
  for (const key of ["source_content", "sourceContent", "evidence", "source_events", "sourceEvents"]) {
    const value = card[key];
    if (Array.isArray(value)) objects.push(...value);
    else if (value !== null && value !== undefined) objects.push(value);
  }
  return objects;
}

function sourceParts(card) {
  return values(sourceObjects(card)).map((part) => clean(part)).filter((part) => truthy(part));
}

function walkNamed(value, names) {
  const found = [];
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (names.has(key)) found.push(item);
      found.push(...walkNamed(item, names));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) found.push(...walkNamed(item, names));
  }
  return found;
}

function sourceUrls(card) {
  const text = sourceParts(card).join(" ");
  return sortedList(new Set(text.match(/https?:\/\/[^\s"'<>]+/gu) ?? []));
}

function sourceTickers(card) {
  const text = sourceParts(card).join(" ");
  const found = new Set();
  for (const pattern of [
    pyRegex("/quote/([A-Za-z0-9.\\-]+)", "g"),
    pyRegex("\\b(?:NASDAQ|NYSE|NYSEARCA|AMEX|ARCA|OTC)\\s*:\\s*(?:<[^>]+>)*([A-Z][A-Z0-9.]{0,7})", "g"),
    pyRegex("\\$([A-Z]{1,6})\\b", "g"),
  ]) {
    for (const match of text.matchAll(pattern)) found.add(ticker(match[1]).replaceAll("-", "."));
  }
  const named = new Set(["tickers", "ticker", "symbols", "symbol", "canonicalTicker", "canonical_ticker"]);
  for (const raw of walkNamed(sourceObjects(card), named)) {
    for (const item of values(raw)) {
      const normalized = ticker(item);
      if (normalized.length >= 1 && normalized.length <= 8) found.add(normalized);
    }
  }
  return new Set([...found].filter((item) => truthy(item)));
}

function narrativeText(card) {
  const parts = [];
  for (const name of ["title", "bottom_line", "bottomLine", "overread_note", "overreadNote", "asset_mechanism", "assetMechanism", "transmission_chain", "transmissionChain"]) {
    parts.push(...values(card[name]));
  }
  return clean(parts.join(" "));
}

function bridgeText(card) {
  const parts = [];
  for (const name of ["title", "asset_mechanism", "assetMechanism", "mechanism_note", "transmission_chain", "transmissionChain"]) {
    parts.push(...values(card[name]));
  }
  return clean(parts.join(" ")).toLowerCase();
}

function identityTerms(text) {
  let tokens = [...clean(text).matchAll(/[A-Za-z][A-Za-z0-9&.-]*/gu)].map((match) => match[0].toLowerCase());
  tokens = tokens.filter((token) => !IDENTITY_STOPWORDS.has(token));
  const bigrams = new Set();
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const left = tokens[i];
    const right = tokens[i + 1];
    if (left.length > 2 && right.length > 2) bigrams.add(`${left} ${right}`);
  }
  const proper = new Set();
  for (const match of clean(text).matchAll(pyRegex("\\b(?:[A-Z][a-z]{3,}|[A-Z][a-z]+[A-Z][A-Za-z]+)\\b", "g"))) {
    if (!IDENTITY_STOPWORDS.has(match[0].toLowerCase())) proper.add(match[0].toLowerCase());
  }
  return [bigrams, proper];
}

function titleSourceIdentityMatch(card, sourceText) {
  const title = pyStr(truthy(field(card, "title", "bottom_line", "bottomLine")) ? field(card, "title", "bottom_line", "bottomLine") : "");
  const [titleBigrams, titleProper] = identityTerms(title);
  const [sourceBigrams, sourceProper] = identityTerms(sourceText);
  return setIntersect(titleBigrams, sourceBigrams).size > 0 || setIntersect(titleProper, sourceProper).size > 0;
}

const MATERIAL_NUMBER = pyRegex("(?<![A-Za-z])(?:[$€£¥]?\\d+(?:\\.\\d+)?\\s?(?:%|pp|bps|[BMK]|亿|万))(?![A-Za-z])", "gi");

function materiallyNumbered(text) {
  const out = new Set();
  for (const match of text.matchAll(MATERIAL_NUMBER)) {
    out.add(match[0].replace(/\s+/gu, "").toUpperCase());
  }
  return out;
}

const TIME_PREFIX = pyRegex("^\\d{4}-\\d{2}-\\d{2}T");

function observedTimes(card) {
  const named = new Set(["occurred_at", "occurredAt", "observed_at", "observedAt", "created_at", "createdAt"]);
  const items = walkNamed(sourceObjects(card), named);
  items.push(field(card, "occurred_at", "occurredAt", "published_at", "publishedAt"));
  const out = new Set();
  for (const value of items) {
    for (const item of values(value)) {
      if (TIME_PREFIX.test(item)) out.add(item);
    }
  }
  return sortedList(out);
}

function directions(card) {
  const raw = [field(card, "direction", "lead_direction", "leadDirection")];
  for (const item of assetRecords(card)) raw.push(field(item, "direction"));
  raw.push(...walkNamed(card.model_meta, new Set(["direction", "fragment_direction", "fragmentDirection"])));
  const normalized = new Set();
  for (const value of raw) {
    for (const item of values(value)) normalized.add(item.toLowerCase());
  }
  return setIntersect(normalized, new Set(["up", "down"]));
}

function aliasSearch(alias, text) {
  const pattern = new RegExp(`(?<![${WORD}])${escapeRe(alias)}(?![${WORD}])`, "iu");
  return pattern.test(text);
}

// --- Validation -----------------------------------------------------------------

export function validate(card, asOf = null) {
  const checks = [];
  const repairs = [];
  const unsupported = [];
  const derived = [];
  const facts = sourceParts(card).slice(0, 3);
  const cAssets = cardAssets(card);
  const sAssets = sourceTickers(card);
  const aliases = assetAliases(card);
  const descriptive = descriptiveAliases(card);
  const sourceText = sourceParts(card).join(" ");
  const story = narrativeText(card);
  const bridge = bridgeText(card);
  const directness = pyStr(truthy(field(card, "directness")) ? field(card, "directness") : "direct").toLowerCase();
  let match = "unverified";

  const add = (code, severity, message, evidence, repair = null) => {
    checks.push({ code, severity, message, evidence });
    if (repair && !repairs.includes(repair)) repairs.push(repair);
  };

  if (!truthy(sourceText) && !sourceUrls(card).length) {
    add("SOURCE_MISSING", "caution", "No attributable source text or URL is attached.", [], "Fetch the primary or closest attributable source.");
  }

  if (directions(card).size > 1) {
    add("DIRECTION_CONFLICT", "reject", "Cue, fragment, or asset directions disagree.", sortedList(directions(card)), "Resolve the direction before routing or writing.");
  }

  if (directness === "direct") {
    if (sAssets.size && isDisjoint(cAssets, sAssets)) {
      let bodyNamesTarget = [...descriptive].some((alias) => cpLen(alias) > 2 && aliasSearch(alias, sourceText));
      const analystContext = ANALYST_TERMS.test(`${sourceText} ${story}`);
      bodyNamesTarget = bodyNamesTarget || (!analystContext && titleSourceIdentityMatch(card, sourceText));
      if (bodyNamesTarget) {
        match = "match";
        add("SOURCE_METADATA_CONFLICT", "caution", "Source metadata cites another ticker while the body names the selected underlying.", [`card=${sortedList(cAssets).join(",")}`, `source=${sortedList(sAssets).join(",")}`], "Repair the provider URL or entity metadata before publication.");
      } else {
        match = "mismatch";
        add("SOURCE_ASSET_MISMATCH", "reject", "Direct evidence cites a different ticker from the Cuebook asset.", [`card=${sortedList(cAssets).join(",")}`, `source=${sortedList(sAssets).join(",")}`], "Replace the evidence or map the cue to the cited asset.");
      }
    } else if (sAssets.size) {
      match = "match";
    } else if (cAssets.size) {
      const mentionsAlias = [...aliases].some((alias) => cpLen(alias) > 1 && aliasSearch(alias, sourceText));
      if (mentionsAlias || titleSourceIdentityMatch(card, sourceText) || (setIntersect(cAssets, BROAD_ASSETS).size > 0 && MACRO_TERMS.test(`${sourceText} ${story}`))) {
        match = "match";
      } else if (truthy(sourceText)) {
        add("SOURCE_ASSET_UNVERIFIED", "caution", "The source has no resolvable ticker or asset alias.", sortedList(cAssets), "Attach source entity metadata or an asset alias.");
      }
    }
  } else {
    match = "proxy";
    const targetNamed = [...aliases].some((alias) => cpLen(alias) > 1 && aliasSearch(alias, bridge));
    const descriptiveNamed = [...descriptive].some((alias) => cpLen(alias) > 2 && aliasSearch(alias, bridge));
    const chain = field(card, "transmission_chain", "transmissionChain");
    const sourceDiffers = Boolean(sAssets.size && isDisjoint(cAssets, sAssets));
    if (!truthy(chain) || !targetNamed || (sourceDiffers && !descriptiveNamed)) {
      match = "mismatch";
      add("PROXY_BRIDGE_MISSING", "reject", "The proxy bridge does not explicitly reach the selected asset.", [`asset=${sortedList(cAssets).join(",")}`, cpSlice(bridge, 240)], "Name the target asset and explain who reprices what.");
    } else if (directness === "speculative_proxy" || directness === "watch_only") {
      add("SPECULATIVE_PROXY", "caution", "The Cuebook relationship is explicitly speculative or watch-only.", [directness], "Publish only as a watch or debate with a falsifier.");
    }
  }

  if (setIntersect(cAssets, BROAD_ASSETS).size > 0 && NARROW_TERMS.test(`${sourceText} ${story}`) && !MACRO_TERMS.test(`${sourceText} ${story}`)) {
    match = "mismatch";
    add("BROAD_INDEX_OVERREACH", "reject", "A narrow event is being forced into a broad index asset.", sortedList(cAssets), "Use the cited company, a sector ETF, or add a market-wide bridge.");
  }

  if (ANALYST_TERMS.test(`${sourceText} ${story}`) && !MODEL_TERMS.test(`${sourceText} ${story}`)) {
    add("TARGET_ONLY", "caution", "The analyst action has no model-line or operating reason.", [cpSlice(clean(sourceText), 240)], "Add the estimate change, model reason, consensus gap, or price-reaction divergence.");
  }

  const extraNumbers = setDiff(materiallyNumbered(story), materiallyNumbered(sourceText));
  if (extraNumbers.size) {
    unsupported.push(...sortedList(extraNumbers));
    add("UNSUPPORTED_NUMBER", "caution", "The narrative introduces a material number absent from its evidence.", sortedList(extraNumbers), "Source or remove the unsupported number.");
  }

  const lowerStory = story.toLowerCase();
  const lowerSource = sourceText.toLowerCase();
  let mechanismIssue = null;
  if (/cash flow risk|overleverag|credit downgrade/u.test(lowerStory) && !/cash flow|free cash flow|revenue|leverage|credit downgrade/u.test(lowerSource)) {
    mechanismIssue = "cash-flow or leverage claim";
  }
  if (/operational synerg|market share/u.test(lowerStory) && !/synerg|market share/u.test(lowerSource)) {
    mechanismIssue = "synergy or market-share claim";
  }
  if (mechanismIssue) {
    unsupported.push(mechanismIssue);
    add("UNSUPPORTED_MECHANISM", "caution", "The narrative adds a mechanism that the evidence does not establish.", [mechanismIssue], "Add operating or financial evidence, or soften the claim.");
  } else if (truthy(story) && truthy(sourceText) && story !== sourceText) {
    derived.push(cpSlice(clean(story), 320));
  }

  if (
    pyRegex("\\breiterates?\\b").test(lowerSource) &&
    pyRegex("\\b(upside|underpric|underestimat)\\b").test(lowerStory) &&
    !pyRegex("\\b(raises?|increases?|above consensus|beats?)\\b").test(lowerSource)
  ) {
    add("UNCHANGED_GUIDANCE_OVERREAD", "caution", "Unchanged guidance does not by itself establish fresh upside.", [cpSlice(clean(sourceText), 240)], "Compare the range with consensus and prior guidance.");
  }

  const times = observedTimes(card);
  const parsed = times.map((value) => parseTime(value)).filter((item) => item !== null);
  if (asOf && parsed.length) {
    let newest = parsed[0];
    for (const item of parsed.slice(1)) {
      if (item.us > newest.us) newest = item;
    }
    if (asOf.us - newest.us > 30n * 86400n * 1000000n) {
      add("STALE_EVENT", "caution", "The newest attached evidence is more than 30 days old.", [isoformat(newest.parts)], "Refresh the source and current market context.");
    }
  }

  const decision = checks.some((item) => item.severity === "reject") ? "reject" : checks.length ? "caution" : "pass";
  return {
    schema_version: "gate-v1",
    cue_id: pyStr(truthy(field(card, "id", "cue_id", "cueId")) ? field(card, "id", "cue_id", "cueId") : ""),
    decision,
    publishable: decision === "pass",
    checks,
    source_asset: { card_assets: sortedList(cAssets), source_assets: sortedList(sAssets), match },
    claim_basis: { sourced_facts: facts, derived_claims: derived, unsupported_claims: unsupported },
    repairs,
    closer_assets: sortedList(setDiff(sAssets, cAssets)),
    provenance: { source_urls: sourceUrls(card), observed_at: times },
  };
}

// --- CLI ------------------------------------------------------------------------

function parseArgs(args) {
  const parsed = { json_file: null, as_of: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--as-of") {
      if (i + 1 >= args.length) usageError("argument --as-of: expected one argument");
      parsed.as_of = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--as-of=")) {
      parsed.as_of = arg.slice("--as-of=".length);
    } else if (arg === "-h" || arg === "--help") {
      stdout.write("usage: validate_projection.mjs [-h] [--as-of AS_OF] [json_file]\n");
      exit(0);
    } else if (arg.startsWith("-") && arg !== "-") {
      usageError(`unrecognized arguments: ${arg}`);
    } else if (parsed.json_file === null) {
      parsed.json_file = arg;
    } else {
      usageError(`unrecognized arguments: ${arg}`);
    }
  }
  return parsed;
}

function usageError(message) {
  stderr.write(`usage: validate_projection.mjs [-h] [--as-of AS_OF] [json_file]\nvalidate_projection.mjs: error: ${message}\n`);
  exit(2);
}

function main() {
  const args = parseArgs(argv.slice(2));
  const raw = args.json_file ? readFileSync(args.json_file, "utf-8") : readFileSync(0, "utf-8");
  const payload = JSON.parse(raw);
  const asOf = args.as_of ? parseTime(args.as_of) : null;
  const output = Array.isArray(payload) ? payload.map((item) => validate(item, asOf)) : validate(payload, asOf);
  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
