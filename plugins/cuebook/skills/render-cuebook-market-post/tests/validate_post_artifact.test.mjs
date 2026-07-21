import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_post_artifact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/base-post.json"), "utf8"));
const base = () => structuredClone(fixture);
const allCodes = (result) => new Set([...result.errors, ...result.warnings].map((item) => item.code));

test("valid base PostV1", () => assert.equal(validate(base()).valid, true));

function codeTest(name, code, mutate) {
  test(name, () => {
    const item = base(); mutate(item);
    const result = validate(item);
    assert.ok(allCodes(result).has(code), JSON.stringify(result));
  });
}

codeTest("blocked post cannot retain a draft", "BLOCKED_HAS_DRAFT", (item) => { item.gate.decision = "reject"; item.publication_state = "blocked"; });
codeTest("verified live fact needs a source", "LIVE_SOURCE", (item) => { item.fact_ledger[0].evidence_class = "verified-live"; item.fact_ledger[0].source_url = ""; });
codeTest("fact IDs are unique", "DUPLICATE_FACT_ID", (item) => item.fact_ledger.push(structuredClone(item.fact_ledger[0])));
codeTest("gate state binds publication state", "PUBLICATION_STATE", (item) => { item.gate.decision = "caution"; });
codeTest("internal marker cannot leak", "INTERNAL_MARKER", (item) => { item.drafts.frame = "SOURCE_ASSET_MISMATCH"; });
codeTest("stock AI phrase is warned", "AI_PHRASE", (item) => { item.drafts.frame = "It is worth noting that the next data release still matters."; });
codeTest("social platform draft fields are rejected", "DRAFT_FIELDS", (item) => { item.drafts.x = item.drafts.frame; });
codeTest("Frame is the only public surface", "PLATFORMS", (item) => { item.brief.platforms = ["x"]; });

test("conditional research decision can be valid", () => {
  const item = base(); item.research_decision = "conditional"; item.brief.research_pack_ref = "pack:conditional-valid"; item.publication_state = "conditional";
  assert.equal(validate(item).valid, true);
});

codeTest("research decision binds publication state", "PUBLICATION_STATE", (item) => { item.research_decision = "conditional"; item.brief.research_pack_ref = "pack:conditional-state"; });
codeTest("blocked research rejects live draft", "BLOCKED_HAS_DRAFT", (item) => { item.research_decision = "blocked"; item.brief.research_pack_ref = "pack:block-test"; item.publication_state = "blocked"; });
codeTest("research pack requires decision", "RESEARCH_DECISION_REQUIRED", (item) => { item.brief.research_pack_ref = "pack:missing-decision"; });
codeTest("conditional draft names uncertainty", "CONDITIONAL_WORDING", (item) => { item.gate.decision = "caution"; item.publication_state = "conditional"; item.drafts.frame = "The inventory surprise confirms a decline, so the conclusion is definitive."; });
codeTest("personalized action boundary", "ACTION_BOUNDARY", (item) => { item.drafts.frame = "Buy 100 shares with a stop at 90."; });
codeTest("draft must retain evidence", "DRAFT_EVIDENCE_MISSING", (item) => { item.draft_evidence.frame = []; });

test("abstaining route blocks publication and draft", () => {
  const item = base(); Object.assign(item.route, { event_type: "unknown", event_confidence: 0, candidates: [], reasoning_lenses: [], hard_numbers: [], abstain: true, abstain_reason: "no-supported-event-type" });
  const codes = allCodes(validate(item)); assert.ok(codes.has("PUBLICATION_STATE")); assert.ok(codes.has("BLOCKED_HAS_DRAFT"));
});

codeTest("route requires abstain field", "ROUTE_FIELD", (item) => { delete item.route.abstain; });
codeTest("program and item lineage travel together", "PROGRAM_ITEM_LINEAGE", (item) => { item.lineage.program_ref = "PROGRAM_1"; });
codeTest("thesis ref requires binding", "THESIS_BINDING_REQUIRED", (item) => item.lineage.input_artifact_refs.push("THESIS_hormuzwatch01@r1"));

test("valid thesis binding", () => {
  const item = base(); item.lineage.input_artifact_refs.push("THESIS_hormuzwatch01@r1"); item.lineage.thesis_binding = { thesis_ref: "THESIS_hormuzwatch01@r1", canonical_hash: `sha256:${"a".repeat(64)}` };
  assert.equal(validate(item).valid, true);
});

test("invalid thesis binding reports lineage and hash", () => {
  const item = base(); item.lineage.thesis_binding = { thesis_ref: "THESIS_hormuzwatch01@r1", canonical_hash: "bad" };
  const codes = allCodes(validate(item)); assert.ok(codes.has("THESIS_BINDING_LINEAGE")); assert.ok(codes.has("THESIS_HASH"));
});

codeTest("expression ref requires binding", "EXPRESSION_BINDING_REQUIRED", (item) => item.lineage.input_artifact_refs.push("CEXP_hormuzwatch01@r1"));

test("valid expression binding", () => {
  const item = base(); item.lineage.input_artifact_refs.push("CEXP_hormuzwatch01@r1"); item.lineage.expression_binding = { plan_ref: "CEXP_hormuzwatch01@r1", fingerprint_sha256: `sha256:${"b".repeat(64)}` };
  assert.equal(validate(item).valid, true);
});

test("invalid expression binding reports lineage and fingerprint", () => {
  const item = base(); item.lineage.expression_binding = { plan_ref: "CEXP_hormuzwatch01@r1", fingerprint_sha256: "bad" };
  const codes = allCodes(validate(item)); assert.ok(codes.has("EXPRESSION_BINDING_LINEAGE")); assert.ok(codes.has("EXPRESSION_FINGERPRINT"));
});

codeTest("ready post resolves position disclosure", "POSITION_DISCLOSURE_UNKNOWN", (item) => { item.disclosure_state.position_status = "unknown"; });
codeTest("ready policy snapshot stays current", "POLICY_STALE", (item) => { item.policy_gate.checked_at = "2026-05-01T00:00:00Z"; });
codeTest("Cuebook workflow narration stays private", "PUBLIC_CUEBOOK_NARRATION", (item) => { item.drafts.frame = "I put the inventory move into Cuebook and then checked positioning and the next data release."; });

test("Cuebook may appear as a data source", () => {
  const item = base(); item.drafts.frame = "Data source: Cuebook. Inventory exceeded expectations, leaving less room for the bull case today. The next release still needs to show whether inventory recedes.";
  assert.equal(validate(item).valid, true);
});

function assistedItem() {
  const item = base(); item.assisted_discovery = {
    mode: "cuebook_assisted", creator_seed: "Above-expected inventory may suppress the rebound.", cuebook_contribution: "Cuebook added crowded positioning and the next data confirmation point.",
    creator_judgment: "Keep the bearish view but express it as a conditional observation.", idea_delta: "conditionalized", final_trade_idea: "The bearish view holds if the next inventory release is again above expectations.",
    fact_refs: ["F1"], public_attribution: false,
  }; item.drafts.frame = "After inventory exceeded expectations, crowded positioning made the rebound harder. If the next reading rises again, the bearish view holds."; return item;
}

test("valid internal assisted-discovery provenance", () => assert.equal(validate(assistedItem()).valid, true));

test("assisted discovery rejects unknown fact", () => {
  const item = assistedItem(); item.assisted_discovery.fact_refs = ["F99"]; assert.ok(allCodes(validate(item)).has("ASSISTED_UNKNOWN_FACT"));
});

test("assistance attribution stays internal", () => {
  const item = base(); item.assisted_discovery = {
    mode: "cuebook_assisted", creator_seed: "Above-expected inventory may suppress the rebound.", cuebook_contribution: "Cuebook added the next confirmation point.",
    creator_judgment: "Keep the conditional bearish view.", idea_delta: "conditionalized", final_trade_idea: "Reassess after the next release confirms it.", fact_refs: ["F1"], public_attribution: true,
  }; assert.ok(allCodes(validate(item)).has("PUBLIC_ASSISTANCE_ATTRIBUTION"));
});

codeTest("self-correction heading is rejected", "PUBLIC_SELF_CORRECTION_HEADING", (item) => { item.drafts.frame = "Inventory beat expectations. What would prove me wrong: the next reading falls."; });

export { assistedItem, base };
