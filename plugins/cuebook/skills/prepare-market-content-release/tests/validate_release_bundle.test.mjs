import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_release_bundle.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/base-release-bundle.json"), "utf8"));
const baseArtifact = () => structuredClone(fixture);
const errorCodes = (result) => new Set(result.errors.map((entry) => entry.code));
const blockerCodes = (result) => new Set(result.blockers.map((entry) => entry.code));

function bindSettlementProtocol(artifact, claimState = "frozen", formulaState = "frozen") {
  const claimHash = "c".repeat(64);
  artifact.items[0].artifact.settlement_claim = {
    ref: "SETTLE_uso20260714_terminal", schema_version: "settlement-claim-v1", canonical_hash: claimHash, state: claimState,
  };
  artifact.items[0].artifact.settlement_formula = {
    ref: "FORMULA_uso20260714_terminal", schema_version: "settlement-formula-v1", canonical_hash: "d".repeat(64),
    claim_ref: "SETTLE_uso20260714_terminal", claim_hash: claimHash, state: formulaState,
  };
}

function makeXApi(item) {
  item.execution_mode = "api_direct";
  item.capability = {
    status: "verified", checked_at: "2026-07-14T02:00:00Z", official_source_url: "https://docs.x.com/x-api/posts/create-post",
    adapter_id: "x-api-v2-create", supports: { create: true, draft: false, schedule: false, edit: true, delete: true, status: true },
  };
  item.idempotency_key = "release-x-0123456789";
  item.manual_handoff = { required: false, handoff_ref: null, checklist: [] };
  item.rollback = { mode: "api", edit_supported: true, delete_supported: true, notes: "Adapter exposes edit and delete." };
}

function assertValid(artifact) {
  const result = validate(artifact);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  return result;
}

test("valid ready manual handoff", () => assert.equal(assertValid(baseArtifact()).computed_release_state, "ready"));

test("valid ready with frozen settlement protocol", () => {
  const artifact = baseArtifact(); bindSettlementProtocol(artifact); assertValid(artifact);
});

test("unfrozen settlement claim blocks release", () => {
  const artifact = baseArtifact(); bindSettlementProtocol(artifact, "ready");
  const result = validate(artifact);
  assert.ok(blockerCodes(result).has("SETTLEMENT_CLAIM_NOT_FROZEN"));
  assert.equal(result.computed_release_state, "blocked");
});

test("settlement claim without formula blocks release", () => {
  const artifact = baseArtifact(); bindSettlementProtocol(artifact); delete artifact.items[0].artifact.settlement_formula;
  assert.ok(blockerCodes(validate(artifact)).has("SETTLEMENT_FORMULA_REQUIRED"));
});

test("settlement formula must link exact claim hash", () => {
  const artifact = baseArtifact(); bindSettlementProtocol(artifact); artifact.items[0].artifact.settlement_formula.claim_hash = "e".repeat(64);
  assert.ok(errorCodes(validate(artifact)).has("SETTLEMENT_PROTOCOL_HASH_MISMATCH"));
});

test("valid ready website handoff has discovery preflights", () => {
  const artifact = baseArtifact(); const release = artifact.items[0];
  Object.assign(release, { platform: "website", account_ref: "site:cuebook:main", web_discovery_gate: {
    seo_pack_ref: "seo_pack_1111111111111111", seo_state: "pass", geo_pack_ref: "geo_pack_1111111111111111", geo_state: "pass",
  }});
  Object.assign(release.policy, { source_urls: ["https://example.com/publishing-policy"], notes: "Owned-site publishing policy checked." });
  assertValid(artifact);
});

test("website release cannot skip SEO preflight", () => {
  const artifact = baseArtifact(); const release = artifact.items[0];
  release.platform = "website"; release.preflight = { status: "block", checks: [], repairs: ["Run Cuebook SEO preflight."] }; artifact.release_state = "blocked";
  assert.ok(blockerCodes(assertValid(artifact)).has("WEB_DISCOVERY_GATE"));
});

test("pending release approval is valid needs approval", () => {
  const artifact = baseArtifact(); artifact.items[0].approvals.release = { status: "pending", approved_by: null, approved_at: null }; artifact.release_state = "needs_approval";
  assert.equal(assertValid(artifact).computed_release_state, "needs_approval");
});

test("known content blocker is valid blocked bundle", () => {
  const artifact = baseArtifact(); artifact.items[0].artifact.publication_state = "conditional";
  artifact.items[0].preflight = { status: "block", checks: [], repairs: ["Resolve the upstream content gate."] }; artifact.release_state = "blocked";
  assert.ok(blockerCodes(assertValid(artifact)).has("ARTIFACT_NOT_READY"));
});

test("valid ready X API bundle", () => {
  const artifact = baseArtifact(); makeXApi(artifact.items[0]); assertValid(artifact);
});

test("unverified API capability is valid when blocked", () => {
  const artifact = baseArtifact(); makeXApi(artifact.items[0]);
  Object.assign(artifact.items[0].capability, { status: "unverified", checked_at: null, official_source_url: null, adapter_id: null });
  artifact.items[0].preflight = { status: "block", checks: [], repairs: ["Verify official account capability."] }; artifact.release_state = "blocked";
  assert.ok(blockerCodes(assertValid(artifact)).has("CAPABILITY_UNVERIFIED"));
});

test("secret and fake receipt fields are invalid", () => {
  const artifact = baseArtifact(); artifact.items[0].token = "do-not-store"; artifact.items[0].external_id = "123";
  const codes = errorCodes(validate(artifact)); assert.ok(codes.has("SECRET_FIELD")); assert.ok(codes.has("FAKE_RECEIPT"));
});

test("duplicate idempotency is invalid", () => {
  const artifact = baseArtifact(); const first = artifact.items[0]; makeXApi(first);
  const second = structuredClone(first); second.release_item_id = "release_item_second"; artifact.items.push(second);
  assert.ok(errorCodes(validate(artifact)).has("DUPLICATE_IDEMPOTENCY"));
});

test("expired schedule is a blocker", () => {
  const artifact = baseArtifact(); makeXApi(artifact.items[0]); const item = artifact.items[0];
  item.execution_mode = "api_scheduled"; item.capability.supports.schedule = true;
  item.schedule = { publish_at: "2026-07-15T03:00:00Z", timezone: "Asia/Shanghai", embargo_until: null, expires_at: "2026-07-15T02:00:00Z" };
  item.preflight = { status: "block", checks: [], repairs: ["Move publication before expiry."] }; artifact.release_state = "blocked";
  assert.ok(blockerCodes(assertValid(artifact)).has("EXPIRY_ORDER"));
});

test("release approval cannot precede content approval", () => {
  const artifact = baseArtifact(); artifact.items[0].approvals.release.approved_at = "2026-07-14T03:00:30Z";
  assert.ok(errorCodes(validate(artifact)).has("APPROVAL_ORDER"));
});

test("dependency cycle is invalid", () => {
  const artifact = baseArtifact(); const second = structuredClone(artifact.items[0]); second.release_item_id = "release_item_second";
  artifact.items[0].depends_on = ["release_item_second"]; second.depends_on = ["release_item_x"]; artifact.items.push(second);
  assert.ok(errorCodes(validate(artifact)).has("DEPENDENCY_CYCLE"));
});

test("passing preflight cannot hide policy blocker", () => {
  const artifact = baseArtifact(); artifact.items[0].policy.decision = "conditional"; artifact.release_state = "blocked";
  assert.ok(errorCodes(validate(artifact)).has("PREFLIGHT_INCONSISTENT"));
});

export { baseArtifact, bindSettlementProtocol, makeXApi };
