#!/usr/bin/env node
// Validate no-side-effect ReleaseBundleV1 artifacts.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = new Set(["schema_version", "release_id", "prepared_at", "operation", "program_ref", "items", "quality_report", "release_state"]);
const EXECUTION_MODES = new Set(["manual_handoff", "platform_draft", "api_direct", "api_scheduled"]);
const SECRET_KEYS = new Set(["token", "access_token", "refresh_token", "cookie", "cookies", "password", "secret", "api_key", "app_secret", "client_secret", "authorization"]);
const RECEIPT_KEYS = new Set(["external_id", "external_url", "published_at", "platform_receipt", "post_id"]);
const OFFICIAL_HOSTS = {
  x: new Set(["docs.x.com", "developer.x.com"]),
  telegram: new Set(["core.telegram.org"]),
  reddit: new Set(["reddit.com", "www.reddit.com", "redditinc.com", "support.reddithelp.com"]),
  douyin: new Set(["open.douyin.com", "95152.douyin.com"]),
  xiaohongshu: new Set(["xiaohongshu.com", "www.xiaohongshu.com", "school.xiaohongshu.com", "open.xiaohongshu.com"]),
};
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}

function strOrEmpty(value) {
  return pyTruthy(value) ? String(value) : "";
}

function pyListRepr(values) {
  return `[${values.map((value) => `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`).join(", ")}]`;
}

export function issue(code, path, message) {
  return { code, path, message };
}

export function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let candidate = value.trim();
  if (candidate.endsWith("Z")) candidate = `${candidate.slice(0, -1)}+00:00`;
  if (!/(?:[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:\.\d{1,6})?)?)$/.test(candidate)) candidate += "Z";
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? null : parsed;
}

export function hostIsOfficial(platform, url) {
  if (typeof url !== "string" || !(url.startsWith("https://") || url.startsWith("http://"))) return false;
  try {
    return (OFFICIAL_HOSTS[platform] ?? new Set()).has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function walkKeys(value, path = "$") {
  const found = [];
  if (isDict(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const child = `${path}.${key}`;
      found.push([String(key).toLowerCase(), child]);
      found.push(...walkKeys(entry, child));
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => found.push(...walkKeys(entry, `${path}[${index}]`)));
  }
  return found;
}

export function findCycle(nodes, edges) {
  const state = new Map([...nodes].map((node) => [node, 0]));
  const stack = [];
  function visit(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dependency of edges.get(node) ?? new Set()) {
      if (!state.has(dependency)) continue;
      if (state.get(dependency) === 1) return [...stack.slice(stack.indexOf(dependency)), dependency];
      if (state.get(dependency) === 0) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  }
  for (const node of [...nodes].sort()) {
    if (state.get(node) === 0) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function validateApproval(value, path, errors) {
  if (!isDict(value)) {
    errors.push(issue("APPROVAL_TYPE", path, "Approval must be an object."));
    return [null, null];
  }
  const status = value.status;
  if (!["pending", "approved", "rejected", "not_required"].includes(status)) errors.push(issue("APPROVAL_STATUS", `${path}.status`, "Unsupported approval status."));
  const approver = value.approved_by;
  const approvedAt = parseTime(value.approved_at);
  if (status === "approved") {
    if (!strOrEmpty(approver).trim()) errors.push(issue("APPROVER_REQUIRED", `${path}.approved_by`, "Approved state requires an approver reference."));
    if (approvedAt === null) errors.push(issue("APPROVAL_TIME", `${path}.approved_at`, "Approved state requires a parseable timestamp."));
  } else if ((approver !== null && approver !== undefined) || (value.approved_at !== null && value.approved_at !== undefined)) {
    errors.push(issue("APPROVAL_METADATA", path, "Only approved state may carry approver and approval time."));
  }
  return [status, approvedAt];
}

export function validate(item) {
  const errors = [];
  const warnings = [];
  const blockers = [];
  if (!isDict(item)) return { valid: false, errors: [issue("ROOT_TYPE", "$", "ReleaseBundleV1 must be an object.")], warnings: [] };

  for (const key of [...REQUIRED].filter((candidate) => !(candidate in item)).sort()) errors.push(issue("MISSING_FIELD", `$.${key}`, "Required field is missing."));
  if (item.schema_version !== "release-bundle.v1") errors.push(issue("SCHEMA_VERSION", "$.schema_version", "Expected release-bundle.v1."));
  if (!/^release_[a-f0-9]{16}$/.test(strOrEmpty(item.release_id))) errors.push(issue("RELEASE_ID", "$.release_id", "release_id must contain a stable 16-character lowercase hex suffix."));
  const preparedAt = parseTime(item.prepared_at);
  if (preparedAt === null) errors.push(issue("PREPARED_AT", "$.prepared_at", "prepared_at must be a parseable timestamp."));
  if (item.operation !== "prepare_only") errors.push(issue("OPERATION", "$.operation", "This skill may only prepare; operation must be prepare_only."));

  for (const [key, path] of walkKeys(item)) {
    if (SECRET_KEYS.has(key)) errors.push(issue("SECRET_FIELD", path, "Credentials and private signing material cannot enter a release bundle."));
    if (RECEIPT_KEYS.has(key)) errors.push(issue("FAKE_RECEIPT", path, "Publication receipt fields cannot appear before external execution."));
  }

  let itemsRaw = item.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    errors.push(issue("ITEMS", "$.items", "items must be a non-empty array."));
    itemsRaw = [];
  }

  const entries = new Map();
  const edges = new Map();
  const idempotencyKeys = new Set();
  let hasBlocker = false;
  let hasPending = false;

  itemsRaw.forEach((entry, index) => {
    const path = `$.items[${index}]`;
    let itemBlocker = false;
    if (!isDict(entry)) {
      errors.push(issue("ITEM_TYPE", path, "Release item must be an object."));
      hasBlocker = true;
      return;
    }
    const itemId = strOrEmpty(entry.release_item_id).trim();
    if (!/^release_item_[A-Za-z0-9_-]+$/.test(itemId)) errors.push(issue("ITEM_ID", `${path}.release_item_id`, "release_item_id must use the release_item_ prefix."));
    else if (entries.has(itemId)) errors.push(issue("DUPLICATE_ITEM_ID", `${path}.release_item_id`, `Duplicate release item ID ${itemId}.`));
    entries.set(itemId, entry);

    let artifact = entry.artifact;
    if (!isDict(artifact)) {
      errors.push(issue("ARTIFACT", `${path}.artifact`, "artifact must be an object."));
      artifact = {};
    }
    if (!HASH_PATTERN.test(strOrEmpty(artifact.content_hash))) errors.push(issue("ARTIFACT_HASH", `${path}.artifact.content_hash`, "Artifact requires a SHA-256 hash."));
    if (artifact.publication_state !== "ready") {
      blockers.push(issue("ARTIFACT_NOT_READY", `${path}.artifact.publication_state`, "Only ready artifacts may enter an executable release."));
      itemBlocker = true;
    }
    const settlementClaim = artifact.settlement_claim;
    if (settlementClaim !== null && settlementClaim !== undefined) {
      if (!isDict(settlementClaim)) {
        errors.push(issue("SETTLEMENT_CLAIM_REF", `${path}.artifact.settlement_claim`, "settlement_claim must be an object or null."));
        itemBlocker = true;
      } else {
        if (!/^SETTLE_[A-Za-z0-9_-]{8,}$/.test(strOrEmpty(settlementClaim.ref))) {
          errors.push(issue("SETTLEMENT_CLAIM_REF", `${path}.artifact.settlement_claim.ref`, "Settlement claim reference is invalid."));
          itemBlocker = true;
        }
        if (settlementClaim.schema_version !== "settlement-claim-v1") {
          errors.push(issue("SETTLEMENT_CLAIM_SCHEMA", `${path}.artifact.settlement_claim.schema_version`, "Expected settlement-claim-v1."));
          itemBlocker = true;
        }
        if (!/^[a-f0-9]{64}$/.test(strOrEmpty(settlementClaim.canonical_hash))) {
          blockers.push(issue("SETTLEMENT_CLAIM_HASH", `${path}.artifact.settlement_claim.canonical_hash`, "A frozen settlement claim requires its canonical hash."));
          itemBlocker = true;
        }
        if (settlementClaim.state !== "frozen") {
          blockers.push(issue("SETTLEMENT_CLAIM_NOT_FROZEN", `${path}.artifact.settlement_claim.state`, "A release can bind only a frozen settlement claim."));
          itemBlocker = true;
        }
      }
    }
    const settlementFormula = artifact.settlement_formula;
    if (settlementClaim !== null && settlementClaim !== undefined && (settlementFormula === null || settlementFormula === undefined)) {
      blockers.push(issue("SETTLEMENT_FORMULA_REQUIRED", `${path}.artifact.settlement_formula`, "A settlement claim must ship with its frozen executable formula."));
      itemBlocker = true;
    }
    if (settlementFormula !== null && settlementFormula !== undefined && (settlementClaim === null || settlementClaim === undefined)) {
      errors.push(issue("SETTLEMENT_CLAIM_REQUIRED", `${path}.artifact.settlement_claim`, "A settlement formula must remain linked to its human-readable claim."));
      itemBlocker = true;
    }
    if (settlementFormula !== null && settlementFormula !== undefined) {
      if (!isDict(settlementFormula)) {
        errors.push(issue("SETTLEMENT_FORMULA_REF", `${path}.artifact.settlement_formula`, "settlement_formula must be an object or null."));
        itemBlocker = true;
      } else {
        if (!/^FORMULA_[A-Za-z0-9_-]{8,}$/.test(strOrEmpty(settlementFormula.ref))) {
          errors.push(issue("SETTLEMENT_FORMULA_REF", `${path}.artifact.settlement_formula.ref`, "Settlement formula reference is invalid."));
          itemBlocker = true;
        }
        if (settlementFormula.schema_version !== "settlement-formula-v1") {
          errors.push(issue("SETTLEMENT_FORMULA_SCHEMA", `${path}.artifact.settlement_formula.schema_version`, "Expected settlement-formula-v1."));
          itemBlocker = true;
        }
        if (!/^[a-f0-9]{64}$/.test(strOrEmpty(settlementFormula.canonical_hash))) {
          blockers.push(issue("SETTLEMENT_FORMULA_HASH", `${path}.artifact.settlement_formula.canonical_hash`, "A frozen settlement formula requires its canonical hash."));
          itemBlocker = true;
        }
        if (settlementFormula.state !== "frozen") {
          blockers.push(issue("SETTLEMENT_FORMULA_NOT_FROZEN", `${path}.artifact.settlement_formula.state`, "A release can bind only a frozen settlement formula."));
          itemBlocker = true;
        }
        if (isDict(settlementClaim)) {
          if (settlementFormula.claim_ref !== settlementClaim.ref) {
            errors.push(issue("SETTLEMENT_PROTOCOL_REF_MISMATCH", `${path}.artifact.settlement_formula.claim_ref`, "Formula claim_ref must match the bound settlement claim."));
            itemBlocker = true;
          }
          if (settlementFormula.claim_hash !== settlementClaim.canonical_hash) {
            errors.push(issue("SETTLEMENT_PROTOCOL_HASH_MISMATCH", `${path}.artifact.settlement_formula.claim_hash`, "Formula claim_hash must match the bound settlement claim hash."));
            itemBlocker = true;
          }
        }
      }
    }

    let payload = entry.payload;
    if (!isDict(payload)) {
      errors.push(issue("PAYLOAD", `${path}.payload`, "payload must be an object."));
      payload = {};
    }
    if (!HASH_PATTERN.test(strOrEmpty(payload.payload_hash))) errors.push(issue("PAYLOAD_HASH", `${path}.payload.payload_hash`, "Frozen payload requires a SHA-256 hash."));
    if (!strOrEmpty(payload.preview_ref).trim()) errors.push(issue("PREVIEW_REF", `${path}.payload.preview_ref`, "A human-reviewable preview reference is required."));
    let assetRefs = payload.asset_refs;
    if (!Array.isArray(assetRefs)) {
      errors.push(issue("ASSET_REFS", `${path}.payload.asset_refs`, "asset_refs must be an array."));
      assetRefs = [];
    }
    const assetIds = new Set();
    assetRefs.forEach((asset, assetIndex) => {
      const assetPath = `${path}.payload.asset_refs[${assetIndex}]`;
      if (!isDict(asset)) {
        errors.push(issue("ASSET_REF", assetPath, "Asset reference must be an object."));
        itemBlocker = true;
        return;
      }
      const assetId = strOrEmpty(asset.asset_id);
      if (!assetId || assetIds.has(assetId)) errors.push(issue("ASSET_ID", `${assetPath}.asset_id`, "Asset IDs must be non-empty and unique per item."));
      assetIds.add(assetId);
      if (asset.rights !== "reusable") {
        blockers.push(issue("ASSET_RIGHTS", `${assetPath}.rights`, "Release assets require explicit reusable rights."));
        itemBlocker = true;
      }
      if (!HASH_PATTERN.test(strOrEmpty(asset.content_hash))) {
        blockers.push(issue("ASSET_HASH", `${assetPath}.content_hash`, "Release assets require a SHA-256 hash."));
        itemBlocker = true;
      }
    });

    const platform = strOrEmpty(entry.platform);
    const mode = entry.execution_mode;
    if (!EXECUTION_MODES.has(mode)) {
      errors.push(issue("EXECUTION_MODE", `${path}.execution_mode`, "Unsupported execution mode."));
      itemBlocker = true;
    }

    let capability = entry.capability;
    if (!isDict(capability)) {
      errors.push(issue("CAPABILITY", `${path}.capability`, "capability must be an object."));
      capability = {};
    }
    const capabilityStatus = capability.status;
    const capabilityTime = parseTime(capability.checked_at);
    const capabilityUrl = capability.official_source_url;
    const adapterId = strOrEmpty(capability.adapter_id).trim();
    const supports = isDict(capability.supports) ? capability.supports : {};
    const automated = ["platform_draft", "api_direct", "api_scheduled"].includes(mode);
    if (platform === "website") {
      const discovery = entry.web_discovery_gate;
      if (!isDict(discovery)) {
        blockers.push(issue("WEB_DISCOVERY_GATE", `${path}.web_discovery_gate`, "Owned-web release requires Cuebook SEO and optional GEO preflight references."));
        itemBlocker = true;
      } else {
        if (discovery.seo_state !== "pass" || !/^seo_pack_[a-f0-9]{16}$/.test(strOrEmpty(discovery.seo_pack_ref))) {
          blockers.push(issue("WEBSITE_SEO_PREFLIGHT", `${path}.web_discovery_gate`, "Owned-web release requires a passing MarketSEOPackV1 preflight."));
          itemBlocker = true;
        }
        const geoState = discovery.geo_state;
        const geoRef = discovery.geo_pack_ref;
        if (geoState === "pass" && !/^geo_pack_[a-f0-9]{16}$/.test(strOrEmpty(geoRef))) {
          errors.push(issue("WEBSITE_GEO_REF", `${path}.web_discovery_gate.geo_pack_ref`, "A passing GEO state requires a MarketGEOPackV1 reference."));
          itemBlocker = true;
        }
        if (geoState === "not_requested" && geoRef !== null && geoRef !== undefined) {
          errors.push(issue("WEBSITE_GEO_UNUSED_REF", `${path}.web_discovery_gate.geo_pack_ref`, "geo_pack_ref must be null when GEO was not requested."));
          itemBlocker = true;
        }
        if (["conditional", "blocked"].includes(geoState)) {
          blockers.push(issue("WEBSITE_GEO_PREFLIGHT", `${path}.web_discovery_gate.geo_state`, "A requested GEO module must pass before release readiness."));
          itemBlocker = true;
        }
      }
      if (automated) {
        blockers.push(issue("WEBSITE_MANUAL_DEFAULT", `${path}.execution_mode`, "Website and CMS execution defaults to manual handoff until an owned adapter and its official capability are modeled."));
        itemBlocker = true;
      }
    } else if (Object.hasOwn(entry, "web_discovery_gate")) {
      errors.push(issue("WEB_DISCOVERY_SCOPE", `${path}.web_discovery_gate`, "web_discovery_gate applies only to owned-web releases."));
      itemBlocker = true;
    }
    if (automated) {
      if (capabilityStatus !== "verified") {
        blockers.push(issue("CAPABILITY_UNVERIFIED", `${path}.capability.status`, "Automated execution requires verified account capability."));
        itemBlocker = true;
      }
      if (capabilityTime === null) {
        blockers.push(issue("CAPABILITY_TIME", `${path}.capability.checked_at`, "Automated execution requires a capability check timestamp."));
        itemBlocker = true;
      } else if (preparedAt !== null && preparedAt - capabilityTime > 30 * 86400 * 1000) {
        blockers.push(issue("CAPABILITY_STALE", `${path}.capability.checked_at`, "Capability check older than 30 days cannot support release."));
        itemBlocker = true;
      }
      if (!hostIsOfficial(platform, capabilityUrl)) {
        blockers.push(issue("CAPABILITY_SOURCE", `${path}.capability.official_source_url`, "Automated execution requires current official platform documentation."));
        itemBlocker = true;
      }
      if (!adapterId) {
        blockers.push(issue("ADAPTER_REQUIRED", `${path}.capability.adapter_id`, "Automated execution requires a named adapter."));
        itemBlocker = true;
      }
      const requiredSupport = mode === "platform_draft" ? "draft" : mode === "api_scheduled" ? "schedule" : "create";
      if (supports[requiredSupport] !== true) {
        blockers.push(issue("CAPABILITY_OPERATION", `${path}.capability.supports.${requiredSupport}`, `Capability does not support ${requiredSupport}.`));
        itemBlocker = true;
      }
      if (mode === "api_scheduled" && supports.create !== true) {
        blockers.push(issue("CAPABILITY_CREATE", `${path}.capability.supports.create`, "Scheduled execution also requires create support."));
        itemBlocker = true;
      }
    }
    if (platform === "seeking_alpha" && mode !== "manual_handoff") {
      blockers.push(issue("SEEKING_ALPHA_MODE", `${path}.execution_mode`, "Seeking Alpha cannot use an automated release mode for AI-assisted content."));
      itemBlocker = true;
    }
    if (platform === "xiaohongshu" && automated && !hostIsOfficial("xiaohongshu", capabilityUrl)) {
      blockers.push(issue("XHS_MANUAL_DEFAULT", `${path}.execution_mode`, "Xiaohongshu defaults to manual handoff until an official account-specific publishing capability is verified."));
      itemBlocker = true;
    }

    let policy = entry.policy;
    if (!isDict(policy)) {
      errors.push(issue("POLICY", `${path}.policy`, "policy must be an object."));
      policy = {};
    }
    if (policy.decision !== "ready") {
      blockers.push(issue("POLICY_NOT_READY", `${path}.policy.decision`, "Conditional or blocked policy cannot support release."));
      itemBlocker = true;
    }
    const policyTime = parseTime(policy.checked_at);
    if (policyTime === null) {
      blockers.push(issue("POLICY_TIME", `${path}.policy.checked_at`, "A policy check timestamp is required."));
      itemBlocker = true;
    } else if (preparedAt !== null && preparedAt - policyTime > 30 * 86400 * 1000) {
      blockers.push(issue("POLICY_STALE", `${path}.policy.checked_at`, "Policy check older than 30 days cannot support release."));
      itemBlocker = true;
    }
    const sourceUrls = policy.source_urls;
    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0 || sourceUrls.some((url) => !(String(url).startsWith("https://") || String(url).startsWith("http://")))) {
      blockers.push(issue("POLICY_SOURCES", `${path}.policy.source_urls`, "Policy snapshot requires at least one source URL."));
      itemBlocker = true;
    }

    let approvals = entry.approvals;
    if (!isDict(approvals)) {
      errors.push(issue("APPROVALS", `${path}.approvals`, "approvals must contain content and release approval."));
      approvals = {};
    }
    const [contentStatus, contentTime] = validateApproval(approvals.content, `${path}.approvals.content`, errors);
    const [releaseStatus, releaseTime] = validateApproval(approvals.release, `${path}.approvals.release`, errors);
    if (contentStatus === "rejected" || releaseStatus === "rejected") {
      blockers.push(issue("APPROVAL_REJECTED", `${path}.approvals`, "Rejected content or release approval blocks execution."));
      itemBlocker = true;
    } else if (contentStatus !== "approved" || releaseStatus !== "approved") hasPending = true;
    if (contentTime !== null && releaseTime !== null && releaseTime < contentTime) {
      errors.push(issue("APPROVAL_ORDER", `${path}.approvals.release.approved_at`, "Release approval cannot precede content approval."));
      itemBlocker = true;
    }

    let schedule = entry.schedule;
    if (!isDict(schedule)) {
      errors.push(issue("SCHEDULE", `${path}.schedule`, "schedule must be an object."));
      schedule = {};
    }
    const publishAt = parseTime(schedule.publish_at);
    const embargoUntil = parseTime(schedule.embargo_until);
    const expiresAt = parseTime(schedule.expires_at);
    const hasScheduleValue = ["publish_at", "embargo_until", "expires_at"].some((key) => schedule[key] !== null && schedule[key] !== undefined);
    if (hasScheduleValue && !strOrEmpty(schedule.timezone).trim()) {
      errors.push(issue("SCHEDULE_TIMEZONE", `${path}.schedule.timezone`, "Scheduled or expiring items require a timezone."));
      itemBlocker = true;
    }
    for (const [field, parsed] of [["publish_at", publishAt], ["embargo_until", embargoUntil], ["expires_at", expiresAt]]) {
      if (schedule[field] !== null && schedule[field] !== undefined && parsed === null) {
        errors.push(issue("SCHEDULE_TIME", `${path}.schedule.${field}`, `${field} must be parseable or null.`));
        itemBlocker = true;
      }
    }
    if (mode === "api_scheduled" && publishAt === null) {
      errors.push(issue("PUBLISH_AT_REQUIRED", `${path}.schedule.publish_at`, "api_scheduled requires publish_at."));
      itemBlocker = true;
    }
    if (publishAt !== null && preparedAt !== null && publishAt <= preparedAt) {
      blockers.push(issue("PUBLISH_IN_PAST", `${path}.schedule.publish_at`, "publish_at must follow prepared_at."));
      itemBlocker = true;
    }
    if (publishAt !== null && embargoUntil !== null && publishAt < embargoUntil) {
      blockers.push(issue("EMBARGO_ORDER", `${path}.schedule.publish_at`, "publish_at cannot precede embargo_until."));
      itemBlocker = true;
    }
    if (publishAt !== null && expiresAt !== null && publishAt >= expiresAt) {
      blockers.push(issue("EXPIRY_ORDER", `${path}.schedule.expires_at`, "Content must publish before it expires."));
      itemBlocker = true;
    }

    const idempotency = entry.idempotency_key;
    if (automated) {
      if (typeof idempotency !== "string" || idempotency.trim().length < 12) {
        blockers.push(issue("IDEMPOTENCY_REQUIRED", `${path}.idempotency_key`, "Automated execution requires a stable idempotency key of at least 12 characters."));
        itemBlocker = true;
      } else if (idempotencyKeys.has(idempotency)) {
        errors.push(issue("DUPLICATE_IDEMPOTENCY", `${path}.idempotency_key`, "Idempotency keys must be unique within a bundle."));
        itemBlocker = true;
      } else idempotencyKeys.add(idempotency);
    } else if (idempotency !== null && idempotency !== undefined) warnings.push(issue("UNUSED_IDEMPOTENCY", `${path}.idempotency_key`, "Manual handoff does not require an API idempotency key."));

    let handoff = entry.manual_handoff;
    if (!isDict(handoff)) {
      errors.push(issue("MANUAL_HANDOFF", `${path}.manual_handoff`, "manual_handoff must be an object."));
      handoff = {};
    }
    if (mode === "manual_handoff") {
      if (handoff.required !== true || !strOrEmpty(handoff.handoff_ref).trim() || !pyTruthy(handoff.checklist)) {
        blockers.push(issue("HANDOFF_PACKAGE", `${path}.manual_handoff`, "Manual mode requires a handoff reference and checklist."));
        itemBlocker = true;
      }
    } else if (handoff.required !== false) errors.push(issue("HANDOFF_MODE", `${path}.manual_handoff.required`, "Automated modes must set manual_handoff.required to false."));

    let rollback = entry.rollback;
    if (!isDict(rollback)) {
      errors.push(issue("ROLLBACK", `${path}.rollback`, "rollback must be an object."));
      rollback = {};
    }
    if (mode === "manual_handoff" && !["manual", "none"].includes(rollback.mode)) {
      errors.push(issue("ROLLBACK_MODE", `${path}.rollback.mode`, "Manual handoff cannot claim API rollback."));
      itemBlocker = true;
    }
    if (automated && rollback.mode === "api") {
      if (pyTruthy(rollback.edit_supported) && supports.edit !== true) {
        errors.push(issue("ROLLBACK_EDIT", `${path}.rollback.edit_supported`, "Rollback claims edit support that capability does not provide."));
        itemBlocker = true;
      }
      if (pyTruthy(rollback.delete_supported) && supports.delete !== true) {
        errors.push(issue("ROLLBACK_DELETE", `${path}.rollback.delete_supported`, "Rollback claims delete support that capability does not provide."));
        itemBlocker = true;
      }
    }

    const preflight = entry.preflight;
    if (!isDict(preflight) || !["pass", "caution", "block"].includes(preflight.status)) {
      errors.push(issue("PREFLIGHT", `${path}.preflight`, "preflight must have pass, caution, or block status."));
      itemBlocker = true;
    } else if (preflight.status !== "pass") {
      blockers.push(issue("PREFLIGHT_NOT_READY", `${path}.preflight.status`, "Only passing preflight can support release."));
      itemBlocker = true;
    } else if (itemBlocker) errors.push(issue("PREFLIGHT_INCONSISTENT", `${path}.preflight.status`, "Preflight cannot pass while another release blocker is present."));

    let dependencies = entry.depends_on;
    if (!Array.isArray(dependencies)) {
      errors.push(issue("DEPENDENCIES", `${path}.depends_on`, "depends_on must be an array."));
      dependencies = [];
    }
    edges.set(itemId, new Set(dependencies.filter((value) => typeof value === "string")));
    hasBlocker ||= itemBlocker;
  });

  const itemIds = new Set(entries.keys());
  for (const [itemId, dependencies] of edges) {
    const unknown = [...dependencies].filter((dependency) => !itemIds.has(dependency)).sort();
    if (unknown.length > 0) {
      errors.push(issue("UNKNOWN_DEPENDENCY", `$.items[${itemId}].depends_on`, `Unknown dependencies: ${pyListRepr(unknown)}.`));
      hasBlocker = true;
    }
    if (dependencies.has(itemId)) {
      errors.push(issue("SELF_DEPENDENCY", `$.items[${itemId}].depends_on`, "A release item cannot depend on itself."));
      hasBlocker = true;
    }
  }
  const cycle = findCycle(itemIds, edges);
  if (cycle) {
    errors.push(issue("DEPENDENCY_CYCLE", "$.items", `Dependency cycle: ${cycle.join(" -> ")}`));
    hasBlocker = true;
  }

  const quality = item.quality_report;
  if (!isDict(quality) || !["scores", "hard_failures", "revisions"].every((key) => Object.hasOwn(quality, key))) errors.push(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."));
  else if (pyTruthy(quality.hard_failures)) {
    blockers.push(issue("QUALITY_HARD_FAILURE", "$.quality_report.hard_failures", "Quality hard failures block release."));
    hasBlocker = true;
  }

  const expectedState = hasBlocker ? "blocked" : hasPending ? "needs_approval" : "ready";
  if (item.release_state !== expectedState) errors.push(issue("RELEASE_STATE", "$.release_state", `Bundle conditions require ${expectedState}.`));
  return { valid: errors.length === 0, errors, blockers, warnings, computed_release_state: expectedState };
}

async function readInput(path) {
  if (path) return readFileSync(path, "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write("usage: validate_release_bundle.mjs [-h] [json_file]\n");
    return 0;
  }
  if (argv.length > 1) {
    process.stderr.write("usage: validate_release_bundle.mjs [-h] [json_file]\n");
    return 2;
  }
  const payload = JSON.parse(await readInput(argv[0]));
  const output = Array.isArray(payload) ? payload.map(validate) : validate(payload);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  const results = Array.isArray(output) ? output : [output];
  return results.every((result) => result.valid) ? 0 : 1;
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();

if (isMain) process.exit(await main());
