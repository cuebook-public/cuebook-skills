import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_media_package.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures/base-media-package.json"), "utf8"));
const baseArtifact = () => structuredClone(fixture);
const errorCodes = (artifact) => new Set(validate(artifact).errors.map((entry) => entry.code));
const assertValid = (artifact) => { const result = validate(artifact); assert.equal(result.valid, true, JSON.stringify(result.errors)); };

test("valid conditional XHS carousel", () => assertValid(baseArtifact()));

test("unknown XHS qualification cannot be ready", () => {
  const artifact = baseArtifact(); artifact.policy_gate.decision = "ready"; artifact.publication_state = "ready";
  assert.ok(errorCodes(artifact).has("QUALIFICATION_UNKNOWN"));
});

function seekingAlphaArtifact() {
  const artifact = baseArtifact();
  Object.assign(artifact.brief, { channel: "seeking_alpha", format: "article_outline", delivery_mode: "internal_outline", account_qualification: "not_required" });
  artifact.policy_gate = { decision: "blocked", checked_at: "2026-07-14T09:00:00Z", rules_checked: [{ rule_id: "sa.ai-submission", status: "block", detail: "AI submission prohibited.", source_url: "https://about.seekingalpha.com/article-submission-guidelines" }], repairs: ["User independently authors any submission."] };
  artifact.package = { kind: "article_outline", title: "Memory cycle outline", dek: "Internal research structure only.", sections: [
    { role: "thesis", heading: "Thesis", notes: "State the supported change.", fact_ids: ["F1"], asset_ids: [] },
    { role: "risk", heading: "Risk", notes: "Test the forced-flow hypothesis.", fact_ids: ["F2"], asset_ids: [] },
  ], disclosures: ["Internal outline; not a submission."], source_links: ["https://example.com/source"] };
  artifact.publication_state = "blocked"; return artifact;
}

test("Seeking Alpha allows only blocked internal outline", () => {
  const artifact = seekingAlphaArtifact(); assertValid(artifact);
  const broken = structuredClone(artifact); broken.brief.format = "long_form_article"; broken.brief.delivery_mode = "publish_ready"; broken.package.kind = "long_form_article";
  assert.ok(errorCodes(broken).has("SA_AI_BOUNDARY"));
});

test("Reddit requires named current community rules", () => {
  const artifact = baseArtifact(); Object.assign(artifact.brief, { channel: "reddit", format: "community_post", delivery_mode: "publish_ready", content_class: "market_commentary", target_community: "r/stocks", account_qualification: "not_required" });
  artifact.policy_gate = { decision: "ready", checked_at: "2026-07-14T09:00:00Z", rules_checked: [], repairs: [] };
  artifact.package = { kind: "community_post", community: "stocks", community_rules_url: "", rules_checked_at: "", flair: "Discussion", title: "Is forced selling driving this move?", body: "The halt is observable. The flow explanation still needs financing data.", fact_ids: ["F1", "F2"], reply_plan: ["Answer source questions and update the thesis if financing data disagrees."] };
  artifact.asset_plan = []; artifact.publication_state = "ready";
  const codes = errorCodes(artifact); for (const code of ["REDDIT_RULES_URL", "REDDIT_RULES_TIME", "REDDIT_RULE_CHECK"]) assert.ok(codes.has(code));
});

test("short-video timing and asset rights", () => {
  const artifact = baseArtifact(); Object.assign(artifact.brief, { channel: "douyin", format: "short_video", delivery_mode: "publish_ready", content_class: "financial_education", target_duration_seconds: 20, account_qualification: "declared" });
  artifact.policy_gate = { decision: "ready", checked_at: "2026-07-14T09:00:00Z", rules_checked: [{ rule_id: "douyin.finance", status: "pass", detail: "Checked.", source_url: "https://example.com/policy" }], repairs: [] };
  artifact.asset_plan = [{ id: "media_asset_clip", type: "video", origin: "source-reference-only", reuse_allowed: false, direction: "Reference only.", source_url: "https://example.com/clip", fact_ids: ["F1"] }];
  artifact.package = { kind: "short_video", duration_seconds: 20, hook: "After the circuit breaker, watch who is still selling.", beats: [
    { index: 1, start_second: 1, end_second: 5, role: "hook", voiceover: "Start with the circuit breaker.", on_screen_text: "MARKET CIRCUIT BREAKER", visual_direction: "Timeline", fact_ids: ["F1"], asset_ids: ["media_asset_clip"] },
    { index: 2, start_second: 4, end_second: 22, role: "condition", voiceover: "Financing data still matters.", on_screen_text: "WATCH FINANCING", visual_direction: "Checklist", fact_ids: ["F2"], asset_ids: ["media_asset_clip"] },
  ], caption: "Watch whether deleveraging has ended.", tags: ["market education"], disclosures: [] };
  artifact.publication_state = "ready"; const codes = errorCodes(artifact); for (const code of ["BEAT_START", "BEAT_TIMING", "ASSET_RIGHTS"]) assert.ok(codes.has(code));
});

test("personalized advice is blocked", () => {
  const artifact = baseArtifact(); artifact.brief.content_class = "personalized_advice"; artifact.policy_gate.decision = "blocked"; artifact.publication_state = "blocked"; artifact.asset_plan = []; artifact.package = { kind: "blocked", reason: "The request asks for personalized orders and sizing." };
  assertValid(artifact);
});

test("unknown facts and formulaic action language fail", () => {
  const artifact = baseArtifact(); artifact.package.cards[0].fact_ids = ["F404"]; artifact.package.cards[1].body = "You should buy immediately and add leverage.";
  const codes = errorCodes(artifact); assert.ok(codes.has("UNKNOWN_FACT")); assert.ok(codes.has("ACTION_BOUNDARY"));
});

test("stale publish policy cannot be ready", () => {
  const artifact = baseArtifact(); Object.assign(artifact.brief, { delivery_mode: "publish_ready", content_class: "financial_education", account_qualification: "declared" }); artifact.policy_gate.decision = "ready"; artifact.policy_gate.checked_at = "2026-05-01T00:00:00Z"; artifact.publication_state = "ready";
  assert.ok(errorCodes(artifact).has("POLICY_STALE"));
});

test("realtime package requires a current fact", () => {
  const artifact = baseArtifact(); for (const fact of artifact.fact_ledger) fact.freshness = "stale"; assert.ok(errorCodes(artifact).has("REALTIME_WITHOUT_CURRENT_FACT"));
});

test("historical replay requires visible label", () => {
  const artifact = baseArtifact(); artifact.brief.temporal_mode = "historical_replay"; artifact.package.caption = "Watch whether deleveraging has ended."; assert.ok(errorCodes(artifact).has("HISTORICAL_LABEL"));
  artifact.package.caption = "Historical replay: watch whether deleveraging has ended."; assertValid(artifact);
});

test("ready analysis requires known position and commercial state", () => {
  const artifact = baseArtifact(); Object.assign(artifact.brief, { delivery_mode: "publish_ready", account_qualification: "verified" }); artifact.policy_gate.decision = "ready"; artifact.gate.decision = "pass"; artifact.publication_state = "ready";
  const codes = errorCodes(artifact); assert.ok(codes.has("POSITION_DISCLOSURE_UNKNOWN")); assert.ok(codes.has("COMMERCIAL_DISCLOSURE_UNKNOWN"));
});

test("route abstention blocks public package", () => {
  const artifact = baseArtifact(); Object.assign(artifact.route, { event_type: "unknown", event_confidence: 0, candidates: [], reasoning_lenses: [], hard_numbers: [], abstain: true, abstain_reason: "no-supported-event-type" });
  const codes = errorCodes(artifact); assert.ok(codes.has("PUBLICATION_STATE")); assert.ok(codes.has("BLOCKED_HAS_PACKAGE"));
});

test("thesis input requires canonical binding", () => {
  const artifact = baseArtifact(); artifact.lineage.input_artifact_refs.push("THESIS_hormuzwatch01@r1"); assert.ok(errorCodes(artifact).has("THESIS_BINDING_REQUIRED"));
});

test("valid thesis binding is accepted", () => {
  const artifact = baseArtifact(); artifact.lineage.input_artifact_refs.push("THESIS_hormuzwatch01@r1"); artifact.lineage.thesis_binding = { thesis_ref: "THESIS_hormuzwatch01@r1", canonical_hash: `sha256:${"b".repeat(64)}` }; assertValid(artifact);
});

test("thesis binding resolves to input and hash", () => {
  const artifact = baseArtifact(); artifact.lineage.thesis_binding = { thesis_ref: "THESIS_hormuzwatch01@r1", canonical_hash: "bad" }; const codes = errorCodes(artifact); assert.ok(codes.has("THESIS_BINDING_LINEAGE")); assert.ok(codes.has("THESIS_HASH"));
});

test("expression input requires locked binding", () => {
  const artifact = baseArtifact(); artifact.lineage.input_artifact_refs.push("CEXP_kospiflow01@r1"); assert.ok(errorCodes(artifact).has("EXPRESSION_BINDING_REQUIRED"));
});

test("expression and visual asset lineage are accepted", () => {
  const artifact = baseArtifact(); artifact.lineage.input_artifact_refs.push("CEXP_kospiflow01@r1", "VVIS_kospiflow01"); artifact.lineage.expression_binding = { plan_ref: "CEXP_kospiflow01@r1", fingerprint_sha256: `sha256:${"c".repeat(64)}` }; artifact.asset_plan[0].artifact_ref = "VVIS_kospiflow01"; assertValid(artifact);
});

test("visual asset ref resolves to lineage", () => {
  const artifact = baseArtifact(); artifact.asset_plan[0].artifact_ref = "VVIS_missing"; assert.ok(errorCodes(artifact).has("ASSET_ARTIFACT_LINEAGE"));
});

export { baseArtifact, seekingAlphaArtifact };
