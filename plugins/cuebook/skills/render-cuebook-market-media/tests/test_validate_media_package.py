from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "validate_media_package.py"
SPEC = importlib.util.spec_from_file_location("validate_media_package", SCRIPT_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


def base_artifact() -> dict:
    return {
        "schema_version": "media-package.v1",
        "lineage": {"artifact_id": "MEDIA_kospi_xhs", "program_ref": None, "content_item_ref": None, "opportunity_refs": ["OPP_kospi"], "input_artifact_refs": ["ART_gate", "ART_route"]},
        "brief": {
            "channel": "xiaohongshu",
            "format": "carousel_note",
            "delivery_mode": "draft",
            "content_class": "investment_analysis",
            "temporal_mode": "realtime",
            "language": "zh-CN",
            "as_of": "2026-07-14T10:00:00Z",
            "reader": "market reader",
            "decision_use": "understand the event",
            "target_community": None,
            "target_duration_seconds": None,
            "account_qualification": "unknown",
            "research_pack_ref": None,
            "profile_ref": None,
            "media_format_ref": "media_format_test",
        },
        "gate": {"decision": "pass", "checks": [], "repairs": []},
        "research_decision": None,
        "policy_gate": {
            "decision": "conditional",
            "checked_at": "2026-07-14T09:00:00Z",
            "rules_checked": [
                {"rule_id": "xhs.finance-qualification", "status": "caution", "detail": "Qualification is unknown.", "source_url": "https://example.com/policy"}
            ],
            "repairs": ["Confirm account qualification before publication."],
        },
        "disclosure_state": {
            "position_status": "unknown",
            "position_text": None,
            "commercial_status": "unknown",
            "commercial_text": None,
            "identity_status": "unknown",
            "ai_assistance_status": "unknown",
            "public_disclosures": ["仅为公开市场信息整理，不构成个性化投资建议。"],
        },
        "route": {"schema_version": "route-v1", "taxonomy_version": "market-narrative-v2", "cue_id": "cue-kospi", "event_type": "price-action", "event_confidence": 0.667, "candidates": [{"event_type": "price-action", "score": 4.0}], "reasoning_lenses": ["actor-forced"], "render_shape": "carousel", "required_context": [], "hard_numbers": [], "abstain": False, "abstain_reason": ""},
        "fact_ledger": [
            {"id": "F1", "claim": "KOSPI triggered a market halt.", "evidence_class": "verified-live", "source_url": "https://example.com/source", "as_of": "2026-07-14T08:00:00Z", "freshness": "current"},
            {"id": "F2", "claim": "Forced deleveraging may amplify the move.", "evidence_class": "hypothesis", "source_url": "", "as_of": "", "freshness": "unknown"},
        ],
        "angle": {"tension": "fundamentals versus forced flow", "forced_actor": "leveraged holders", "why_selected": "Supported by the halt and liquidation context.", "profile_rule_ids": [], "media_rule_ids": ["media.xhs.unit-card"]},
        "asset_plan": [
            {"id": "media_asset_chart", "type": "chart", "origin": "generated", "reuse_allowed": True, "direction": "Original event timeline with source label.", "source_url": None, "fact_ids": ["F1"]}
        ],
        "package": {
            "kind": "carousel_note",
            "cover": {"headline": "韩股这次先看被迫卖盘", "subhead": "熔断之后，谁还在降杠杆", "visual_direction": "Original timeline, no copied screenshots.", "asset_ids": ["media_asset_chart"]},
            "cards": [
                {"index": 1, "role": "context", "headline": "发生了什么", "body": "市场触发熔断，先把时间和来源摆清楚。", "visual_direction": "Event marker.", "fact_ids": ["F1"], "asset_ids": ["media_asset_chart"]},
                {"index": 2, "role": "next_observable", "headline": "接下来还要看", "body": "杠杆资金是否继续收缩，决定这轮波动还有多少惯性；下一组成交与融资数据是关键。", "visual_direction": "Next-observable checklist.", "fact_ids": ["F1", "F2"], "asset_ids": ["media_asset_chart"]},
            ],
            "caption": "先留意被迫去杠杆有没有停。",
            "tags": ["韩股", "存储"],
            "disclosures": ["仅为公开市场信息整理，不构成个性化投资建议。"],
        },
        "watch_items": ["financing balance"],
        "quality_report": {"scores": {}, "hard_failures": [], "revisions": []},
        "publication_state": "conditional",
    }


class ValidateMediaPackageTests(unittest.TestCase):
    def assert_valid(self, artifact: dict) -> None:
        result = VALIDATOR.validate(artifact)
        self.assertTrue(result["valid"], result["errors"])

    def error_codes(self, artifact: dict) -> set[str]:
        return {entry["code"] for entry in VALIDATOR.validate(artifact)["errors"]}

    def test_valid_conditional_xhs_carousel(self) -> None:
        self.assert_valid(base_artifact())

    def test_unknown_xhs_qualification_cannot_be_ready(self) -> None:
        artifact = base_artifact()
        artifact["policy_gate"]["decision"] = "ready"
        artifact["publication_state"] = "ready"
        self.assertIn("QUALIFICATION_UNKNOWN", self.error_codes(artifact))

    def test_seeking_alpha_allows_only_blocked_internal_outline(self) -> None:
        artifact = base_artifact()
        artifact["brief"].update({"channel": "seeking_alpha", "format": "article_outline", "delivery_mode": "internal_outline", "account_qualification": "not_required"})
        artifact["policy_gate"] = {
            "decision": "blocked",
            "checked_at": "2026-07-14T09:00:00Z",
            "rules_checked": [{"rule_id": "sa.ai-submission", "status": "block", "detail": "AI submission prohibited.", "source_url": "https://about.seekingalpha.com/article-submission-guidelines"}],
            "repairs": ["User independently authors any submission."],
        }
        artifact["package"] = {
            "kind": "article_outline",
            "title": "Memory cycle outline",
            "dek": "Internal research structure only.",
            "sections": [
                {"role": "thesis", "heading": "Thesis", "notes": "State the supported change.", "fact_ids": ["F1"], "asset_ids": []},
                {"role": "risk", "heading": "Risk", "notes": "Test the forced-flow hypothesis.", "fact_ids": ["F2"], "asset_ids": []},
            ],
            "disclosures": ["Internal outline; not a submission."],
            "source_links": ["https://example.com/source"],
        }
        artifact["publication_state"] = "blocked"
        self.assert_valid(artifact)

        broken = copy.deepcopy(artifact)
        broken["brief"]["format"] = "long_form_article"
        broken["brief"]["delivery_mode"] = "publish_ready"
        broken["package"]["kind"] = "long_form_article"
        self.assertIn("SA_AI_BOUNDARY", self.error_codes(broken))

    def test_reddit_requires_named_current_community_rules(self) -> None:
        artifact = base_artifact()
        artifact["brief"].update({"channel": "reddit", "format": "community_post", "delivery_mode": "publish_ready", "content_class": "market_commentary", "target_community": "r/stocks", "account_qualification": "not_required"})
        artifact["policy_gate"] = {"decision": "ready", "checked_at": "2026-07-14T09:00:00Z", "rules_checked": [], "repairs": []}
        artifact["package"] = {"kind": "community_post", "community": "stocks", "community_rules_url": "", "rules_checked_at": "", "flair": "Discussion", "title": "Is forced selling driving this move?", "body": "The halt is observable. The flow explanation still needs financing data.", "fact_ids": ["F1", "F2"], "reply_plan": ["Answer source questions and update the thesis if financing data disagrees."]}
        artifact["asset_plan"] = []
        artifact["publication_state"] = "ready"
        codes = self.error_codes(artifact)
        self.assertTrue({"REDDIT_RULES_URL", "REDDIT_RULES_TIME", "REDDIT_RULE_CHECK"}.issubset(codes))

    def test_short_video_timing_and_asset_rights(self) -> None:
        artifact = base_artifact()
        artifact["brief"].update({"channel": "douyin", "format": "short_video", "delivery_mode": "publish_ready", "content_class": "financial_education", "target_duration_seconds": 20, "account_qualification": "declared"})
        artifact["policy_gate"] = {"decision": "ready", "checked_at": "2026-07-14T09:00:00Z", "rules_checked": [{"rule_id": "douyin.finance", "status": "pass", "detail": "Checked.", "source_url": "https://example.com/policy"}], "repairs": []}
        artifact["asset_plan"] = [{"id": "media_asset_clip", "type": "video", "origin": "source-reference-only", "reuse_allowed": False, "direction": "Reference only.", "source_url": "https://example.com/clip", "fact_ids": ["F1"]}]
        artifact["package"] = {
            "kind": "short_video",
            "duration_seconds": 20,
            "hook": "熔断以后，先看谁还在卖。",
            "beats": [
                {"index": 1, "start_second": 1, "end_second": 5, "role": "hook", "voiceover": "先看熔断。", "on_screen_text": "市场熔断", "visual_direction": "Timeline", "fact_ids": ["F1"], "asset_ids": ["media_asset_clip"]},
                {"index": 2, "start_second": 4, "end_second": 22, "role": "condition", "voiceover": "还要看融资数据。", "on_screen_text": "观察融资", "visual_direction": "Checklist", "fact_ids": ["F2"], "asset_ids": ["media_asset_clip"]},
            ],
            "caption": "观察去杠杆是否结束。",
            "tags": ["市场教育"],
            "disclosures": [],
        }
        artifact["publication_state"] = "ready"
        codes = self.error_codes(artifact)
        self.assertTrue({"BEAT_START", "BEAT_TIMING", "ASSET_RIGHTS"}.issubset(codes))

    def test_personalized_advice_is_blocked(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["content_class"] = "personalized_advice"
        artifact["policy_gate"]["decision"] = "blocked"
        artifact["publication_state"] = "blocked"
        artifact["asset_plan"] = []
        artifact["package"] = {"kind": "blocked", "reason": "The request asks for personalized orders and sizing."}
        self.assert_valid(artifact)

    def test_unknown_facts_and_formulaic_action_language_fail(self) -> None:
        artifact = base_artifact()
        artifact["package"]["cards"][0]["fact_ids"] = ["F404"]
        artifact["package"]["cards"][1]["body"] = "你应该立刻买入并加杠杆。"
        codes = self.error_codes(artifact)
        self.assertIn("UNKNOWN_FACT", codes)
        self.assertIn("ACTION_BOUNDARY", codes)

    def test_stale_publish_policy_cannot_be_ready(self) -> None:
        artifact = base_artifact()
        artifact["brief"].update({"delivery_mode": "publish_ready", "content_class": "financial_education", "account_qualification": "declared"})
        artifact["policy_gate"]["decision"] = "ready"
        artifact["policy_gate"]["checked_at"] = "2026-05-01T00:00:00Z"
        artifact["publication_state"] = "ready"
        self.assertIn("POLICY_STALE", self.error_codes(artifact))

    def test_realtime_package_requires_a_current_fact(self) -> None:
        artifact = base_artifact()
        for fact in artifact["fact_ledger"]:
            fact["freshness"] = "stale"
        self.assertIn("REALTIME_WITHOUT_CURRENT_FACT", self.error_codes(artifact))

    def test_historical_replay_requires_visible_label(self) -> None:
        artifact = base_artifact()
        artifact["brief"]["temporal_mode"] = "historical_replay"
        artifact["package"]["caption"] = "观察去杠杆是否结束。"
        self.assertIn("HISTORICAL_LABEL", self.error_codes(artifact))

        artifact["package"]["caption"] = "历史复盘：观察去杠杆是否结束。"
        self.assert_valid(artifact)

    def test_ready_analysis_requires_known_position_and_commercial_state(self) -> None:
        artifact = base_artifact()
        artifact["brief"].update({"delivery_mode": "publish_ready", "account_qualification": "verified"})
        artifact["policy_gate"]["decision"] = "ready"
        artifact["gate"]["decision"] = "pass"
        artifact["publication_state"] = "ready"
        codes = self.error_codes(artifact)
        self.assertIn("POSITION_DISCLOSURE_UNKNOWN", codes)
        self.assertIn("COMMERCIAL_DISCLOSURE_UNKNOWN", codes)

    def test_route_abstention_blocks_public_package(self) -> None:
        artifact = base_artifact()
        artifact["route"].update({"event_type": "unknown", "event_confidence": 0.0, "candidates": [], "reasoning_lenses": [], "hard_numbers": [], "abstain": True, "abstain_reason": "no-supported-event-type"})
        codes = self.error_codes(artifact)
        self.assertIn("PUBLICATION_STATE", codes)
        self.assertIn("BLOCKED_HAS_PACKAGE", codes)

    def test_thesis_input_requires_canonical_binding(self) -> None:
        artifact = base_artifact()
        artifact["lineage"]["input_artifact_refs"].append("THESIS_hormuzwatch01@r1")
        self.assertIn("THESIS_BINDING_REQUIRED", self.error_codes(artifact))

    def test_valid_thesis_binding_is_accepted(self) -> None:
        artifact = base_artifact()
        artifact["lineage"]["input_artifact_refs"].append("THESIS_hormuzwatch01@r1")
        artifact["lineage"]["thesis_binding"] = {
            "thesis_ref": "THESIS_hormuzwatch01@r1",
            "canonical_hash": f"sha256:{'b' * 64}",
        }
        self.assert_valid(artifact)

    def test_thesis_binding_must_resolve_to_input_and_hash(self) -> None:
        artifact = base_artifact()
        artifact["lineage"]["thesis_binding"] = {
            "thesis_ref": "THESIS_hormuzwatch01@r1",
            "canonical_hash": "bad",
        }
        codes = self.error_codes(artifact)
        self.assertIn("THESIS_BINDING_LINEAGE", codes)
        self.assertIn("THESIS_HASH", codes)

    def test_expression_input_requires_locked_binding(self) -> None:
        artifact = base_artifact()
        artifact["lineage"]["input_artifact_refs"].append("CEXP_kospiflow01@r1")
        self.assertIn("EXPRESSION_BINDING_REQUIRED", self.error_codes(artifact))

    def test_expression_and_visual_asset_lineage_are_accepted(self) -> None:
        artifact = base_artifact()
        artifact["lineage"]["input_artifact_refs"].extend(["CEXP_kospiflow01@r1", "VVIS_kospiflow01"])
        artifact["lineage"]["expression_binding"] = {
            "plan_ref": "CEXP_kospiflow01@r1",
            "fingerprint_sha256": f"sha256:{'c' * 64}",
        }
        artifact["asset_plan"][0]["artifact_ref"] = "VVIS_kospiflow01"
        self.assert_valid(artifact)

    def test_visual_asset_ref_must_resolve_to_lineage(self) -> None:
        artifact = base_artifact()
        artifact["asset_plan"][0]["artifact_ref"] = "VVIS_missing"
        self.assertIn("ASSET_ARTIFACT_LINEAGE", self.error_codes(artifact))


if __name__ == "__main__":
    unittest.main()
