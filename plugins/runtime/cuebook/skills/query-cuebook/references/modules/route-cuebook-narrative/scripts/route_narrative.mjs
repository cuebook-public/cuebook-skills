#!/usr/bin/env node
// Port of route_narrative.py; output shapes, codes, and messages are contract.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { argv, exit, stdout, stderr } from "node:process";

const TAXONOMY_VERSION = "market-narrative-v2";

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

const EVENT_PATTERNS = {
  "technical-level": ["\\b(?:20|50|100|200)[- ]day\\b", "\\bdma\\b", "moving average", "break(?:down|out)", "day low", "gap (?:fill|risk)", "\u8dcc\u7834", "\u5747\u7ebf", "\u65b0\u4f4e", "\u652f\u6491\u4f4d"],
  "prediction-market": ["polymarket", "kalshi", "prediction market", "implied probability", "\\bodds\\b", "\u9884\u6d4b\u5e02\u573a", "\u9690\u542b\u6982\u7387"],
  "mechanical-flow": ["index (?:addition|inclusion|reconstitution)", "added to .*index", "russell", "buyback", "repurchase", "share issuance", "secondary offering", "unlock", "\u6307\u6570\u7eb3\u5165", "\u56de\u8d2d", "\u589e\u53d1", "\u89e3\u7981"],
  "credit-financing": ["senior (?:secured |unsecured )?notes", "\\bbonds?\\b", "refinanc", "coupon", "maturit", "debt issuance", "credit spread", "\u4fe1\u7528\u503a", "\u503a\u5238", "\u518d\u878d\u8d44"],
  "company-guidance": ["guidance", "outlook", "expects? .*\\b(?:revenue|ebitda|eps)\\b", "reiterates? .*\\b(?:revenue|ebitda|eps)\\b", "\u4e1a\u7ee9\u6307\u5f15", "\u6536\u5165\u6307\u5f15"],
  "earnings-result": ["quarterly results", "earnings (?:beat|miss)", "reported (?:eps|revenue)", "\u8d22\u62a5", "\u76c8\u5229.*(?:\u4e0a\u5347|\u4e0b\u964d)"],
  "inventory-print": ["storage .* (?:vs|versus)", "inventory .* (?:vs|versus)", "cpi .* (?:vs|versus)", "\u5e93\u5b58", "\u50a8\u91cf"],
  "macro-policy": ["\\bfed\\b", "fomc", "core cpi", "inflation", "rate (?:cut|hike)", "treasury yield", "\u592e\u884c", "\u901a\u80c0", "\u964d\u606f", "\u52a0\u606f"],
  "analyst-action": ["price target", "raises? target", "lowers? target", "analyst", "upgrades? .{0,50} to", "downgrades? .{0,50} to", "\u76ee\u6807\u4ef7", "\u8bc4\u7ea7\u4e0a\u8c03", "\u8bc4\u7ea7\u4e0b\u8c03"],
  "government-contract": ["government contract", "contract award", "procurement", "awarded .*contract", "\u653f\u5e9c\u5408\u540c", "\u4e2d\u6807"],
  "deal-event": ["merger approval", "merger closes?", "shareholder approval", "closing conditions", "\u5e76\u8d2d\u83b7\u6279", "\u5408\u5e76\u5b8c\u6210"],
  "legal-regulatory": ["lawsuit", "sues?", "regulator", "regulatory approval", "antitrust", "oig", "micar", "\u8bc9\u8bbc", "\u76d1\u7ba1", "\u53cd\u5784\u65ad"],
  "geopolitical-risk": ["hormuz", "shipping route", "safe passage", "military strike", "war", "sanction", "brent", "wti", "\u6218\u4e89", "\u5236\u88c1", "\u822a\u8fd0"],
  "capital-investment": ["\\$?\\d+(?:\\.\\d+)?[BMK]? investment", "capital expenditure", "capex", "\u6295\u8d44\u8ba1\u5212", "\u8d44\u672c\u5f00\u652f"],
  "operating-data": ["shipments?", "deliveries", "same-store", "subscribers?", "daily active", "\u540c\u6bd4", "\u73af\u6bd4", "\u51fa\u8d27"],
  "crowded-positioning": ["liquidat", "crowded", "unwind", "leveraged", "margin call", "circuit breaker", "\u7206\u4ed3", "\u6760\u6746", "\u7194\u65ad", "\u62e5\u6324"],
  "social-sentiment": ["lost .*savings", "blew up", "worst summer", "pain", "fomo", "\u4e8f\u6389", "\u65e0\u6cd5\u7ffb\u8eab", "\u5f7b\u5e95\u5931\u8d25"],
  "product-strategy": ["product cycle", "\\btam\\b", "adoption", "platform strategy", "category expansion", "knowledge ownership", "\u4ea7\u54c1\u5468\u671f", "\u6e17\u900f\u7387", "\u5e02\u573a\u7a7a\u95f4"],
  "price-action": ["stock (?:is )?(?:up|down)", "shares? (?:rise|fall)", "risk-off", "price dislocation", "\u80a1\u4ef7.*(?:\u4e0a\u6da8|\u4e0b\u8dcc)", "\u66b4\u6da8", "\u66b4\u8dcc"],
};

const PRIORITY = Object.keys(EVENT_PATTERNS);
const DEFAULTS = {
  "technical-level": [["forced-flow"], "tape-first", "tape", ["level", "distance_pct", "volume", "atr", "reclaim_condition"]],
  "prediction-market": [["probability-positioning", "crowding-unwind"], "number-first", "prediction_market", ["probability", "delta", "volume", "depth", "resolution_time"]],
  "mechanical-flow": [["forced-flow"], "actor-first", "flow", ["expected_flow", "float", "adv", "effective_date", "execution"]],
  "credit-financing": [["cashflow-credit"], "debate", "credit", ["principal", "coupon", "maturity", "cash", "fcf", "leverage"]],
  "company-guidance": [["model-revision"], "number-first", "estimates", ["new_range", "prior_range", "consensus", "revision_breadth", "price_reaction"]],
  "earnings-result": [["model-revision"], "number-first", "estimates", ["actual", "consensus", "guide", "margin", "price_reaction"]],
  "inventory-print": [["model-revision"], "number-first", "macro_print", ["actual", "consensus", "prior", "next_release", "spot_reaction"]],
  "macro-policy": [["risk-premium"], "source-first", "macro", ["rates", "yields", "dollar", "futures", "breadth"]],
  "analyst-action": [["model-revision"], "judgment-first", "estimates", ["rating", "target", "model_reason", "consensus_gap", "price_reaction"]],
  "government-contract": [["model-revision", "event-completion"], "number-first", "contract", ["contract_value", "duration", "revenue_share", "margin", "start_date"]],
  "deal-event": [["event-completion"], "event-first", "deal", ["close_date", "remaining_conditions", "spread", "consideration"]],
  "legal-regulatory": [["legal-overhang", "event-completion"], "event-first", "legal", ["jurisdiction", "remedy", "timeline", "financial_exposure"]],
  "geopolitical-risk": [["risk-premium"], "source-first", "macro", ["spot", "futures_curve", "volatility", "freight", "insurance"]],
  "capital-investment": [["cashflow-credit", "model-revision"], "number-first", "capex", ["amount", "funding", "timeline", "returns", "cashflow_impact"]],
  "operating-data": [["model-revision"], "number-first", "operations", ["actual", "prior", "consensus", "mix", "price_reaction"]],
  "crowded-positioning": [["crowding-unwind"], "actor-first", "positioning", ["oi", "funding", "borrow", "liquidations", "volume"]],
  "social-sentiment": [["sentiment-pain", "crowding-unwind"], "anecdote-first", "positioning", ["price_move", "leverage", "liquidations", "breadth"]],
  "product-strategy": [["tam-duration"], "judgment-first", "product", ["sell_through", "retention", "attach_rate", "competition", "next_guide"]],
  "price-action": [["forced-flow"], "tape-first", "tape", ["price_move", "volume", "level", "atr", "catalyst"]],
  unknown: [[], "source-first", "source", ["primary_source", "event_time", "asset_link"]],
};

// Python float marker so json output keeps trailing ".0" on integral floats.
class PyFloat {
  constructor(value) {
    this.value = value;
  }
}

function pyFloatRepr(value) {
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return `${value}.0`;
  return String(value);
}

// json.dumps(x, ensure_ascii=False, indent=2) with PyFloat support.
function pyDumps(value, level = 0) {
  const pad = "  ".repeat(level);
  const childPad = "  ".repeat(level + 1);
  if (value instanceof PyFloat) return pyFloatRepr(value.value);
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((item) => childPad + pyDumps(item, level + 1));
    return `[\n${items.join(",\n")}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  const items = entries.map(([key, item]) => `${childPad}${JSON.stringify(key)}: ${pyDumps(item, level + 1)}`);
  return `{\n${items.join(",\n")}\n${pad}}`;
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

function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

function values(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(...values(item));
    return out;
  }
  if (typeof value === "object") {
    const preferred = [];
    for (const key of ["content", "text", "title", "note"]) {
      if (truthy(value[key])) preferred.push(value[key]);
    }
    const source = preferred.length ? preferred : Object.values(value);
    const out = [];
    for (const item of source) out.push(...values(item));
    return out;
  }
  return [pyStr(value)];
}

function field(card, ...names) {
  for (const name of names) {
    const value = card?.[name];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function blob(card, names) {
  const parts = [];
  for (const name of names) parts.push(...values(card[name]));
  return parts.join(" ").replace(/\s+/gu, " ").trim();
}

function scoreEvents(card) {
  const source = blob(card, ["source_content", "sourceContent", "source_events", "sourceEvents", "evidence"]);
  const story = blob(card, ["title", "bottom_line", "bottomLine", "asset_mechanism", "assetMechanism", "overread_note", "overreadNote"]);
  const metadata = blob(card, ["observable_type", "observableType", "category_tag", "categoryTag"]);
  const scores = new Map();
  const bump = (event, amount) => scores.set(event, (scores.get(event) ?? 0) + amount);
  for (const [event, patterns] of Object.entries(EVENT_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = pyRegex(pattern, "i");
      if (regex.test(source)) bump(event, 2.0);
      if (regex.test(story)) bump(event, 1.0);
      if (regex.test(metadata)) bump(event, 0.25);
    }
  }
  return [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]),
  );
}

const HARD_NUMBER = pyRegex("(?<![A-Za-z])[$€£¥]?\\d+(?:\\.\\d+)?\\s?(?:%|pp|bps|[BMK]|\u4ebf|\u4e07)(?![A-Za-z])", "gi");

function hardNumbers(card) {
  const text = blob(card, ["source_content", "sourceContent", "source_events", "sourceEvents", "evidence", "title", "bottom_line", "bottomLine"]);
  const seen = [];
  for (const match of text.matchAll(HARD_NUMBER)) {
    const item = match[0].replace(/\s+/gu, "");
    if (!seen.includes(item)) seen.push(item);
  }
  return seen.slice(0, 8);
}

// round(min(0.98, top / (top + 2.0)), 3): toFixed correctly rounds the binary
// double the same way CPython's round() does for the values reachable here.
function round3(value) {
  return Number(value.toFixed(3));
}

export function route(card, gate = null) {
  gate = gate ?? card.gate ?? card.validation ?? null;
  const cue = card.cue !== null && typeof card.cue === "object" && !Array.isArray(card.cue) ? card.cue : card;
  const cueId = pyStr(truthy(field(cue, "id", "cue_id", "cueId")) ? field(cue, "id", "cue_id", "cueId") : "");
  if (gate !== null && typeof gate === "object" && !Array.isArray(gate) && gate.decision === "reject") {
    return { schema_version: "route-v1", taxonomy_version: TAXONOMY_VERSION, cue_id: cueId, event_type: "unknown", event_confidence: new PyFloat(0.0), candidates: [], reasoning_lenses: [], render_shape: "source-first", required_context: [], hard_numbers: [], abstain: true, abstain_reason: "projection-rejected" };
  }
  const ranked = scoreEvents(cue);
  const event = ranked.length ? ranked[0][0] : "unknown";
  const top = ranked.length ? ranked[0][1] : 0.0;
  const confidence = ranked.length ? round3(Math.min(0.98, top / (top + 2.0))) : 0.0;
  const [defaultLenses, shape, kind, fields] = DEFAULTS[event];
  const story = blob(cue, ["title", "bottom_line", "bottomLine", "asset_mechanism", "assetMechanism"]);
  const lenses = [...defaultLenses];
  const directness = pyStr(truthy(field(cue, "directness")) ? field(cue, "directness") : "direct");
  if ((directness === "supported_proxy" || directness === "speculative_proxy") && !lenses.includes("proxy-transmission")) {
    lenses.push("proxy-transmission");
  }
  if (
    (event === "analyst-action" || event === "product-strategy") &&
    pyRegex("\\b(structural|category|product cycle|tam|duration)\\b", "i").test(story) &&
    !lenses.includes("tam-duration")
  ) {
    lenses.push("tam-duration");
  }
  return {
    schema_version: "route-v1",
    taxonomy_version: TAXONOMY_VERSION,
    cue_id: cueId,
    event_type: event,
    event_confidence: new PyFloat(confidence),
    candidates: ranked.slice(0, 3).map(([name, score]) => ({ event_type: name, score: new PyFloat(score) })),
    reasoning_lenses: lenses,
    render_shape: shape,
    required_context: [{ kind, fields, why: `Confirm or invalidate the ${event} read before writing.` }],
    hard_numbers: hardNumbers(cue),
    abstain: event === "unknown",
    abstain_reason: event === "unknown" ? "no-supported-event-type" : "",
  };
}

function usageError(message) {
  stderr.write(`usage: route_narrative.mjs [-h] [json_file]\nroute_narrative.mjs: error: ${message}\n`);
  exit(2);
}

function parseArgs(args) {
  const parsed = { json_file: null };
  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      stdout.write("usage: route_narrative.mjs [-h] [json_file]\n");
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

function main() {
  const args = parseArgs(argv.slice(2));
  const raw = args.json_file ? readFileSync(args.json_file, "utf-8") : readFileSync(0, "utf-8");
  const payload = JSON.parse(raw);
  const output = Array.isArray(payload) ? payload.map((item) => route(item)) : route(payload);
  stdout.write(`${pyDumps(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
