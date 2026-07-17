#!/usr/bin/env node
// Distill MediaCorpusV1 into evidence-backed MediaFormatV1.
//
// Port of distill_media_format.py; JSON output, message wording, and exit
// codes are contract and must stay byte-compatible with the Python original.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = "media-format.v1";

export function nowIso() {
  return new Date().toISOString().slice(0, 19) + "Z";
}

// --- Python parity helpers -------------------------------------------------

// Python truthiness for JSON values (empty containers are falsy).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Python len() counts code points, not UTF-16 units.
function codePointLength(text) {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

// Python string comparison (code points); identical to code-unit order for BMP.
function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Python tuple-of-strings comparison (element-wise, shorter prefix first).
function cmpArr(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const cmp = cmpStr(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return a.length - b.length;
}

// Exact reproduction of Python round(float, ndigits): round-half-even on the
// exact decimal expansion of the IEEE double, then nearest double back.
export function pyRound(value, ndigits) {
  if (!Number.isFinite(value) || Number.isInteger(value)) return value;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let exponent;
  if (exponentBits === 0) {
    exponent = 1 - 1075;
  } else {
    mantissa |= 1n << 52n;
    exponent = exponentBits - 1075;
  }
  const scaled = mantissa * 10n ** BigInt(ndigits);
  let quotient;
  if (exponent >= 0) {
    quotient = scaled << BigInt(exponent);
  } else {
    const denominator = 1n << BigInt(-exponent);
    quotient = scaled / denominator;
    const doubled = (scaled % denominator) * 2n;
    if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) {
      quotient += 1n;
    }
  }
  let digits = quotient.toString();
  if (digits.length <= ndigits) digits = "0".repeat(ndigits - digits.length + 1) + digits;
  const text = digits.slice(0, digits.length - ndigits) + "." + digits.slice(digits.length - ndigits);
  const result = Number(text);
  return negative ? -result : result;
}

// repr(float) for the value ranges this script emits (matches Python for
// magnitudes in [1e-4, 1e16); exponent notation is normalized defensively).
function pyFloatStr(value) {
  let text = String(value);
  if (text.includes("e") || text.includes("E")) {
    const [mantissa, exponent] = text.split(/[eE]/);
    const sign = exponent.startsWith("-") ? "-" : "+";
    let digits = exponent.replace(/^[+-]/, "");
    if (digits.length < 2) digits = "0" + digits;
    return `${mantissa}e${sign}${digits}`;
  }
  if (!text.includes(".")) text += ".0";
  return text;
}

// json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
function compactSortedJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : pyFloatStr(value);
  if (Array.isArray(value)) return `[${value.map(compactSortedJson).join(",")}]`;
  const keys = Object.keys(value).sort(cmpStr);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${compactSortedJson(value[key])}`).join(",")}}`;
}

export function shortId(prefix, value) {
  const raw = compactSortedJson(value);
  return `${prefix}_${createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16)}`;
}

// Output slots that hold Python floats (rendered "1.0", "0.5", ...); every
// other numeric slot holds a Python int. quality_gate checks[].value is a
// float except for the sample_size check, which passes len(items) through.
const FLOAT_KEYS = new Set([
  "share",
  "item_share",
  "coverage",
  "target_concentration",
  "structural_coverage",
  "asset_coverage",
  "interaction_coverage",
  "metrics_coverage",
  "median_position",
  "median_characters",
  "median_count",
  "median_asset_count",
  "median_duration_seconds",
  "median_interactions",
  "author_reply_share",
  "timing_coverage",
  "weight",
  "evidence_role_coverage",
  "source_link_coverage",
  "source_list_coverage",
  "disclosure_coverage",
  "visual_evidence_coverage",
  "community_context_coverage",
  "community_rules_coverage",
  "qualification_known_coverage",
  "content_class_known_coverage",
  "commercial_relationship_known_coverage",
  "ai_label_known_coverage",
  "identity_disclosure_known_coverage",
  "timed_disclosure_coverage",
]);

function floatSlot(key, parent) {
  if (FLOAT_KEYS.has(key)) return true;
  return key === "value" && typeof parent.name === "string" && parent.name !== "sample_size";
}

function encodeJson(value, depth, isFloat) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (isFloat || !Number.isInteger(value)) return pyFloatStr(value);
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  const pad = "  ".repeat(depth + 1);
  const closePad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const parts = value.map((entry) => pad + encodeJson(entry, depth + 1, false));
    return "[\n" + parts.join(",\n") + "\n" + closePad + "]";
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  const parts = entries.map(
    ([key, entry]) => `${pad}${JSON.stringify(key)}: ${encodeJson(entry, depth + 1, floatSlot(key, value))}`,
  );
  return "{\n" + parts.join(",\n") + "\n" + closePad + "}";
}

// json.dumps(value, ensure_ascii=False, indent=2) with Python int/float typing.
export function pyJsonDumps(value) {
  return encodeJson(value, 0, false);
}

function counterIncrement(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function listAppend(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// --- Distillation ----------------------------------------------------------

export function share(count, total) {
  return total ? pyRound(count / total, 4) : 0.0;
}

// statistics.median(values) rounded to 2 decimals, or null when empty.
export function median(values) {
  const data = [...values];
  if (!data.length) return null;
  data.sort((a, b) => a - b);
  const mid = data.length >> 1;
  const middle = data.length % 2 === 1 ? data[mid] : (data[mid - 1] + data[mid]) / 2;
  return pyRound(middle, 2);
}

export function distribution(values) {
  const list = [...values];
  const counts = new Map();
  for (const value of list) counterIncrement(counts, value);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
    .map(([name, count]) => ({ name, count, share: share(count, list.length) }));
}

export function validateCorpus(corpus) {
  if (!isPlainObject(corpus) || corpus.schema_version !== "media-corpus.v1") {
    throw new Error("Expected schema_version media-corpus.v1");
  }
  const items = corpus.items;
  if (!Array.isArray(items) || !items.length) {
    throw new Error("MediaCorpusV1 items must be non-empty");
  }
  const provenance = corpus.provenance;
  if (!isPlainObject(provenance) || !["public", "authorized"].includes(provenance.rights_basis)) {
    throw new Error("MediaCorpusV1 requires public or authorized provenance");
  }
  const required = [
    "id",
    "platform",
    "format",
    "sample_role",
    "packaging",
    "segments",
    "assets",
    "community",
    "interactions",
    "compliance",
    "metrics",
  ];
  items.forEach((item, index) => {
    if (!isPlainObject(item) || !required.every((key) => Object.hasOwn(item, key))) {
      throw new Error(`MediaCorpusV1 item ${index} is incomplete`);
    }
    if (!Array.isArray(item.segments) || !item.segments.length) {
      throw new Error(`MediaCorpusV1 item ${index} has no segments`);
    }
  });
  return items;
}

export function dominantTarget(items) {
  const counts = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.platform, item.format]);
    counterIncrement(counts, key);
  }
  const [platform, mediaFormat] = JSON.parse(
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || cmpArr(JSON.parse(a[0]), JSON.parse(b[0])),
    )[0][0],
  );
  const selected = items.filter((item) => item.platform === platform && item.format === mediaFormat);
  return [platform, mediaFormat, selected];
}

export function confidence(count, itemShare) {
  if (count >= 5 && itemShare >= 0.5) return "high";
  if (count >= 2 && itemShare >= 0.25) return "medium";
  return "low";
}

export function buildUnitMap(items) {
  const segmentCounts = new Map();
  const itemIds = new Map();
  const positions = new Map();
  const lengths = new Map();
  for (const item of items) {
    const segments = item.segments;
    const seenRoles = new Set();
    const denominator = Math.max(1, segments.length - 1);
    segments.forEach((segment, index) => {
      const role = segment.role;
      counterIncrement(segmentCounts, role);
      listAppend(positions, role, segments.length > 1 ? index / denominator : 0.0);
      listAppend(lengths, role, codePointLength(pyTruthy(segment.text) ? segment.text : ""));
      if (!seenRoles.has(role)) {
        listAppend(itemIds, role, item.id);
        seenRoles.add(role);
      }
    });
  }
  const entries = [];
  const ordered = [...segmentCounts.entries()].sort(
    (a, b) => itemIds.get(b[0]).length - itemIds.get(a[0]).length || cmpStr(a[0], b[0]),
  );
  for (const [role, count] of ordered) {
    const itemCount = itemIds.get(role).length;
    const itemShare = share(itemCount, items.length);
    entries.push({
      role,
      segment_count: count,
      item_count: itemCount,
      item_share: itemShare,
      median_position: median(positions.get(role)) || 0.0,
      median_characters: median(lengths.get(role)) || 0.0,
      confidence: confidence(itemCount, itemShare),
      evidence_item_ids: itemIds.get(role).slice(0, 8),
    });
  }
  return entries;
}

function edgeEntries(counter, total) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
    .map(([role, count]) => ({ role, count, share: share(count, total) }));
}

export function buildSequenceMap(items) {
  const openings = new Map();
  const endings = new Map();
  const paths = new Map();
  const evidence = new Map();
  for (const item of items) {
    const roles = item.segments.map((segment) => segment.role);
    counterIncrement(openings, roles[0]);
    counterIncrement(endings, roles[roles.length - 1]);
    const key = JSON.stringify(roles);
    const entry = paths.get(key);
    if (entry) entry.count += 1;
    else paths.set(key, { roles, count: 1 });
    const ids = evidence.get(key) ?? [];
    if (!evidence.has(key)) evidence.set(key, ids);
    if (ids.length < 8) ids.push(item.id);
  }
  const recurring = [...paths.values()]
    .sort((a, b) => b.count - a.count || cmpArr(a.roles, b.roles))
    .slice(0, 5)
    .map((path) => ({
      roles: [...path.roles],
      count: path.count,
      share: share(path.count, items.length),
      evidence_item_ids: evidence.get(JSON.stringify(path.roles)),
    }));
  return {
    openings: edgeEntries(openings, items.length),
    endings: edgeEntries(endings, items.length),
    recurring_paths: recurring,
  };
}

function fieldStats(items, field) {
  const values = items.map((item) => item.packaging[field]);
  const present = values.filter((value) => typeof value === "string" && value.trim());
  return {
    item_count: present.length,
    coverage: share(present.length, items.length),
    median_characters: median(present.map((value) => codePointLength(value))),
  };
}

export function buildPackagingMap(items) {
  const tagCounts = items.map((item) => (item.packaging.tags || []).length);
  const tagged = tagCounts.filter((count) => count > 0).length;
  return {
    title: fieldStats(items, "title"),
    subtitle: fieldStats(items, "subtitle"),
    cover_text: fieldStats(items, "cover_text"),
    tags: {
      item_count: tagged,
      coverage: share(tagged, items.length),
      median_count: median(tagCounts.filter((count) => count)),
    },
    flair: fieldStats(items, "flair"),
  };
}

function hasRole(item, roles) {
  return item.segments.some((segment) => roles.has(segment.role));
}

export function buildEvidenceMap(items) {
  const evidenceRoles = new Set(["evidence", "valuation", "risk", "invalidation"]);
  const visualTypes = new Set(["chart", "screenshot", "document"]);
  const linked = items.filter((item) => item.segments.some((segment) => pyTruthy(segment.source_urls))).length;
  const visual = items.filter((item) => item.assets.some((asset) => visualTypes.has(asset.type))).length;
  return {
    evidence_role_coverage: share(items.filter((item) => hasRole(item, evidenceRoles)).length, items.length),
    source_link_coverage: share(linked, items.length),
    source_list_coverage: share(items.filter((item) => hasRole(item, new Set(["source_list"]))).length, items.length),
    disclosure_coverage: share(items.filter((item) => hasRole(item, new Set(["disclosure"]))).length, items.length),
    visual_evidence_coverage: share(visual, items.length),
  };
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

export function ratioLabel(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  const divisor = gcd(width, height);
  const left = width / divisor;
  const right = height / divisor;
  if (left > 30 || right > 30) {
    const value = width / height;
    const common = [
      [1.0, "1:1"],
      [0.75, "3:4"],
      [0.5625, "9:16"],
      [1.7778, "16:9"],
      [1.3333, "4:3"],
    ];
    let best = common[0];
    for (const entry of common) {
      if (Math.abs(entry[0] - value) < Math.abs(best[0] - value)) best = entry;
    }
    return best[1];
  }
  return `${left}:${right}`;
}

function itemDurationMs(item) {
  const durations = item.assets.map((asset) => asset.duration_ms).filter((value) => Number.isInteger(value));
  const ends = item.segments.map((segment) => segment.end_ms).filter((value) => Number.isInteger(value));
  const values = [...durations, ...ends];
  return values.length ? Math.max(...values) : null;
}

export function buildMediaMap(items) {
  const typeCounts = new Map();
  const typeItems = new Map();
  const ratios = new Map();
  let timedItems = 0;
  const durations = [];
  for (const item of items) {
    if (
      item.segments.some(
        (segment) =>
          segment.start_ms !== null && segment.start_ms !== undefined &&
          segment.end_ms !== null && segment.end_ms !== undefined,
      )
    ) {
      timedItems += 1;
    }
    const duration = itemDurationMs(item);
    if (duration !== null) durations.push(duration / 1000);
    for (const asset of item.assets) {
      const assetType = asset.type;
      counterIncrement(typeCounts, assetType);
      const ids = typeItems.get(assetType) ?? new Set();
      if (!typeItems.has(assetType)) typeItems.set(assetType, ids);
      ids.add(item.id);
      const ratio = ratioLabel(asset.width, asset.height);
      if (ratio) counterIncrement(ratios, ratio);
    }
  }
  return {
    asset_types: [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
      .map(([assetType, count]) => ({
        type: assetType,
        count,
        item_count: typeItems.get(assetType).size,
        item_share: share(typeItems.get(assetType).size, items.length),
      })),
    median_asset_count: median(items.map((item) => item.assets.length)) || 0.0,
    median_duration_seconds: median(durations),
    aspect_ratios: [...ratios.entries()]
      .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
      .map(([ratio, count]) => ({ ratio, count })),
    timing_coverage: share(timedItems, items.length),
  };
}

export function buildInteractionMap(items) {
  const communityItems = items.filter((item) => pyTruthy(item.community));
  const rulesItems = communityItems.filter(
    (item) => pyTruthy(item.community.rules_url) && pyTruthy(item.community.rules_checked_at),
  );
  const interactionItems = items.filter((item) => pyTruthy(item.interactions));
  const allInteractions = items.flatMap((item) => item.interactions);
  const authorReplies = allInteractions.filter((interaction) => interaction.author_role === "author").length;
  const terms = new Map();
  for (const item of communityItems) {
    const audienceTerms = Object.hasOwn(item.community, "audience_terms") ? item.community.audience_terms : [];
    for (const term of audienceTerms) counterIncrement(terms, term);
  }
  return {
    community_context_coverage: share(communityItems.length, items.length),
    community_rules_coverage: share(rulesItems.length, items.length),
    interaction_coverage: share(interactionItems.length, items.length),
    median_interactions: median(items.map((item) => item.interactions.length)) || 0.0,
    author_reply_share: allInteractions.length ? share(authorReplies, allInteractions.length) : null,
    audience_terms: [...terms.entries()]
      .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
      .slice(0, 12)
      .map(([term]) => term),
  };
}

export function buildComplianceMap(items) {
  const known = (field, unknownValues) =>
    share(items.filter((item) => !unknownValues.has(item.compliance[field])).length, items.length);

  const disclosureItems = items.filter((item) => pyTruthy(item.compliance.disclosure_segment_ids));
  let timedDisclosures = 0;
  for (const item of disclosureItems) {
    const disclosureIds = new Set(item.compliance.disclosure_segment_ids ?? []);
    if (
      item.segments.some(
        (segment) =>
          disclosureIds.has(segment.id) &&
          segment.start_ms !== null && segment.start_ms !== undefined &&
          segment.end_ms !== null && segment.end_ms !== undefined,
      )
    ) {
      timedDisclosures += 1;
    }
  }
  return {
    qualification_known_coverage: known("account_qualification", new Set(["unknown"])),
    content_class_known_coverage: known("content_class", new Set(["unknown"])),
    commercial_relationship_known_coverage: known("commercial_relationship", new Set(["unknown"])),
    ai_label_known_coverage: known("ai_label", new Set(["unknown", "not_applicable"])),
    identity_disclosure_known_coverage: known("identity_disclosure", new Set(["unknown", "not_applicable"])),
    disclosure_coverage: share(disclosureItems.length, items.length),
    timed_disclosure_coverage: share(timedDisclosures, items.length),
  };
}

export function policyGuard(platform) {
  if (platform === "seeking_alpha") {
    return {
      status: "restricted",
      recheck_before_publish: true,
      rules: [
        { rule_id: "sa.ai-submission", effect: "block", requirement: "Do not produce AI-written or AI-edited copy for submission; internal structural analysis only.", source_url: "https://about.seekingalpha.com/article-submission-guidelines" },
        { rule_id: "sa.sources-disclosure", effect: "require", requirement: "Keep sourced facts, transparent valuation assumptions, risks, and position or relationship disclosure.", source_url: "https://about.seekingalpha.com/summary-editorial-policies" },
      ],
    };
  }
  if (platform === "reddit") {
    return {
      status: "conditional",
      recheck_before_publish: true,
      rules: [
        { rule_id: "reddit.community-rules", effect: "require", requirement: "Check the named subreddit's current rules, allowed sources, flair, and self-promotion policy.", source_url: "https://redditinc.com/policies/reddit-rules" },
        { rule_id: "reddit.no-manipulation", effect: "block", requirement: "Do not mass-post, coordinate votes, farm karma, or conceal a promotional relationship.", source_url: "https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam" },
      ],
    };
  }
  if (platform === "xiaohongshu") {
    return {
      status: "conditional",
      recheck_before_publish: true,
      rules: [
        { rule_id: "xhs.finance-qualification", effect: "require", requirement: "Check finance-account qualification, content identity, and commercial relationship before professional analysis or marketing.", source_url: "https://ad.xiaohongshu.com/next_help/docs/195c5fe505c71b4b0335a2fe0d61d8e0" },
        { rule_id: "xhs.no-personal-orders", effect: "block", requirement: "Do not provide personalized orders, sizing, leverage, or unsupported buy and sell levels.", source_url: "https://www.nbd.com.cn/articles/2026-06-04/4417782.html" },
      ],
    };
  }
  if (platform === "douyin") {
    return {
      status: "conditional",
      recheck_before_publish: true,
      rules: [
        { rule_id: "douyin.finance-qualification", effect: "require", requirement: "Check current finance qualification and whether the content is education, professional analysis, or marketing.", source_url: "https://95152.douyin.com/article/5561765854302017" },
        { rule_id: "douyin.no-personal-orders", effect: "block", requirement: "Do not provide personalized orders, sizing, leverage, or unsupported buy and sell levels.", source_url: "https://95152.douyin.com/article/5561765854302017" },
      ],
    };
  }
  return {
    status: "open",
    recheck_before_publish: true,
    rules: [
      { rule_id: "generic.live-policy-check", effect: "require", requirement: "Check the target publisher's current rules, rights, disclosures, and financial-content restrictions.", source_url: "" },
    ],
  };
}

export function safeToken(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

export function buildBridge(platform, mediaFormat, items, units, sequences, packaging, evidence, interaction) {
  const prefix = `media.${safeToken(platform)}.${safeToken(mediaFormat)}`;
  const rules = [];
  const allIds = items.map((item) => item.id).slice(0, 8);
  for (const unit of units) {
    if (unit.confidence === "low") continue;
    const position = unit.median_position <= 0.25 ? "opening" : unit.median_position >= 0.75 ? "ending" : "middle";
    rules.push({
      rule_id: `${prefix}.unit-${safeToken(unit.role)}`,
      kind: "unit",
      instruction: `Use a ${unit.role} unit most often in the ${position}; keep it as an abstract job, not copied wording.`,
      weight: unit.item_share,
      evidence_item_ids: unit.evidence_item_ids,
    });
  }
  sequences.recurring_paths.slice(0, 3).forEach((path, offset) => {
    if (path.count < 2) return;
    rules.push({
      rule_id: `${prefix}.sequence-${offset + 1}`,
      kind: "sequence",
      instruction: "Order unit jobs as " + path.roles.join(" -> ") + "; change the wording and examples.",
      weight: path.share,
      evidence_item_ids: path.evidence_item_ids,
    });
  });
  for (const field of ["title", "subtitle", "cover_text", "flair"]) {
    const stats = packaging[field];
    if (stats.coverage >= 0.5) {
      rules.push({
        rule_id: `${prefix}.package-${safeToken(field)}`,
        kind: "packaging",
        instruction: `Include ${field.replaceAll("_", " ")} as a distinct packaging field; do not reuse sample phrasing.`,
        weight: stats.coverage,
        evidence_item_ids: allIds,
      });
    }
  }
  if (evidence.source_link_coverage >= 0.25 || evidence.source_list_coverage >= 0.25) {
    rules.push({
      rule_id: `${prefix}.evidence-placement`,
      kind: "evidence",
      instruction: "Reserve an explicit source placement and bind every material claim to the renderer fact ledger.",
      weight: Math.max(evidence.source_link_coverage, evidence.source_list_coverage),
      evidence_item_ids: allIds,
    });
  }
  if (interaction.interaction_coverage >= 0.25) {
    rules.push({
      rule_id: `${prefix}.interaction-followup`,
      kind: "interaction",
      instruction: "Plan for substantive counterquestions, corrections, and author updates without engagement bait.",
      weight: interaction.interaction_coverage,
      evidence_item_ids: allIds,
    });
  }
  rules.push({
    rule_id: `${prefix}.constraint-originality`,
    kind: "constraint",
    instruction: "Use only abstract structure; do not copy signature phrases, identity cues, or source assets.",
    weight: 1.0,
    evidence_item_ids: allIds,
  });
  return { taxonomy_version: "media-bridge-v1", rules };
}

export function qualityGate(items, allItems, mediaFormat, media, interaction) {
  const checks = [];

  const add = (name, status, value, threshold, detail) => {
    checks.push({ name, status, value: pyRound(value, 4), threshold, detail });
  };

  add(
    "sample_size",
    items.length >= 8 ? "pass" : "caution",
    items.length,
    ">= 8 for stable format claims",
    items.length < 8 ? "Small samples remain provisional." : "Sample supports recurrence checks.",
  );
  const concentration = share(items.length, allItems.length);
  add(
    "target_concentration",
    concentration >= 0.8 ? "pass" : "caution",
    concentration,
    ">= 0.80",
    concentration < 0.8 ? "Split mixed platform and format samples." : "Dominant pair is sufficiently concentrated.",
  );
  const structural = share(
    items.filter((item) => new Set(item.segments.map((segment) => segment.role)).size >= 2).length,
    items.length,
  );
  add(
    "structural_coverage",
    structural >= 0.75 ? "pass" : "caution",
    structural,
    ">= 0.75 with two or more unit roles",
    structural < 0.75 ? "More granular sections, cards, or beats are needed." : "Most items preserve meaningful unit boundaries.",
  );
  const roles = new Set(items.map((item) => item.sample_role));
  const balanced = (roles.has("baseline") || roles.has("recent")) && roles.has("high_attention");
  add(
    "sample_frame",
    balanced ? "pass" : "caution",
    balanced ? 1.0 : 0.0,
    "ordinary plus high_attention",
    !balanced ? "Do not infer performance from a one-sided sample." : "Sample includes ordinary and high-attention material.",
  );
  if (["image_note", "short_video", "long_video", "podcast"].includes(mediaFormat)) {
    const assetCoverage = share(items.filter((item) => pyTruthy(item.assets)).length, items.length);
    add(
      "asset_coverage",
      assetCoverage >= 0.75 ? "pass" : "caution",
      assetCoverage,
      ">= 0.75",
      assetCoverage < 0.75 ? "Visual or audio format lacks asset manifests." : "Asset structure is broadly represented.",
    );
  }
  if (["short_video", "long_video", "podcast"].includes(mediaFormat)) {
    add(
      "timing_coverage",
      media.timing_coverage >= 0.75 ? "pass" : "caution",
      media.timing_coverage,
      ">= 0.75",
      media.timing_coverage < 0.75 ? "Timed beats are incomplete." : "Most items preserve timing.",
    );
  }
  if (["community_post", "community_comment"].includes(mediaFormat)) {
    add(
      "community_rules",
      interaction.community_rules_coverage >= 0.75 ? "pass" : "caution",
      interaction.community_rules_coverage,
      ">= 0.75",
      interaction.community_rules_coverage < 0.75 ? "Community rules and check times are incomplete." : "Community rules are represented.",
    );
  }
  const status = checks.some((check) => check.status === "caution") ? "caution" : "pass";
  const score = Math.max(0, 100 - 12 * checks.filter((check) => check.status === "caution").length);
  const reasons = checks.filter((check) => check.status !== "pass").map((check) => check.detail);
  return { status, score, reasons, checks };
}

export function distill(corpus) {
  const allItems = validateCorpus(corpus);
  const [platform, mediaFormat, items] = dominantTarget(allItems);
  const units = buildUnitMap(items);
  const sequences = buildSequenceMap(items);
  const packaging = buildPackagingMap(items);
  const evidence = buildEvidenceMap(items);
  const media = buildMediaMap(items);
  const interaction = buildInteractionMap(items);
  const compliance = buildComplianceMap(items);
  const metricsCoverage = share(items.filter((item) => item.metrics.available === true).length, items.length);
  const roles = new Set(items.map((item) => item.sample_role));
  const performanceAllowed =
    items.length >= 8 && metricsCoverage >= 0.8 && (roles.has("baseline") || roles.has("recent")) && roles.has("high_attention");
  const structuralCoverage = share(
    items.filter((item) => new Set(item.segments.map((segment) => segment.role)).size >= 2).length,
    items.length,
  );
  const assetCoverage = share(items.filter((item) => pyTruthy(item.assets)).length, items.length);
  const interactionCoverage = share(items.filter((item) => pyTruthy(item.interactions)).length, items.length);
  const generatedAt = nowIso();
  const result = {
    schema_version: SCHEMA_VERSION,
    format_id: shortId("media_format", [corpus.corpus_id ?? null, platform, mediaFormat, units.map((entry) => entry.role)]),
    generated_at: generatedAt,
    target: { platform, format: mediaFormat },
    corpus_summary: {
      corpus_id: pyTruthy(corpus.corpus_id) ? corpus.corpus_id : "unknown",
      items_total: allItems.length,
      items_analyzed: items.length,
      target_concentration: share(items.length, allItems.length),
      platform_distribution: distribution(allItems.map((item) => item.platform)),
      format_distribution: distribution(allItems.map((item) => item.format)),
      sample_role_distribution: distribution(items.map((item) => item.sample_role)),
      structural_coverage: structuralCoverage,
      asset_coverage: assetCoverage,
      interaction_coverage: interactionCoverage,
      metrics_coverage: metricsCoverage,
      performance_inference_allowed: performanceAllowed,
    },
    quality_gate: qualityGate(items, allItems, mediaFormat, media, interaction),
    unit_map: units,
    sequence_map: sequences,
    packaging_map: packaging,
    evidence_map: evidence,
    media_map: media,
    interaction_map: interaction,
    compliance_map: compliance,
    policy_guard: policyGuard(platform),
    cuebook_bridge: buildBridge(platform, mediaFormat, items, units, sequences, packaging, evidence, interaction),
  };
  return result;
}

// --- CLI -------------------------------------------------------------------

const PROG = "distill_media_format.mjs";
const USAGE = `usage: ${PROG} [-h] [--output OUTPUT] corpus\n`;

function usageError(message) {
  process.stderr.write(USAGE);
  process.stderr.write(`${PROG}: error: ${message}\n`);
  process.exit(2);
}

export function main() {
  const argv = process.argv.slice(2);
  const positionals = [];
  let output = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${USAGE}\nDistill MediaCorpusV1 into MediaFormatV1\n`);
      process.exit(0);
    } else if (arg === "--output") {
      if (i + 1 >= argv.length) usageError("argument --output: expected one argument");
      i += 1;
      output = argv[i];
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else if (arg.startsWith("-") && arg !== "-") {
      usageError(`unrecognized arguments: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  if (!positionals.length) usageError("the following arguments are required: corpus");
  if (positionals.length > 1) usageError(`unrecognized arguments: ${positionals.slice(1).join(" ")}`);
  const corpus = JSON.parse(readFileSync(positionals[0], "utf8"));
  const result = distill(corpus);
  const encoded = pyJsonDumps(result) + "\n";
  if (output) {
    writeFileSync(output, encoded);
  } else {
    process.stdout.write(encoded);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
