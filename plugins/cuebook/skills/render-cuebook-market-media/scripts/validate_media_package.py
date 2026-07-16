#!/usr/bin/env python3
"""Validate deterministic MediaPackageV1 evidence, policy, rights, and timing invariants."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED = {
    "schema_version",
    "lineage",
    "brief",
    "gate",
    "research_decision",
    "policy_gate",
    "disclosure_state",
    "route",
    "fact_ledger",
    "angle",
    "asset_plan",
    "package",
    "watch_items",
    "quality_report",
    "publication_state",
}
CHANNEL_FORMATS = {
    "generic_long_form": {"article_outline", "long_form_article"},
    "seeking_alpha": {"article_outline"},
    "reddit": {"community_post", "community_comment"},
    "xiaohongshu": {"carousel_note"},
    "douyin": {"short_video"},
}
CONTENT_CLASSES = {"market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice"}
RESEARCH_DECISIONS = {"ready", "conditional", "blocked", None}
EVIDENCE_CLASSES = {"source", "verified-live", "derived", "hypothesis"}
FRESHNESS = {"current", "stale", "unknown"}
STATE_RANK = {"ready": 0, "conditional": 1, "blocked": 2}
BANNED_PUBLIC_PHRASES = ("值得关注的是", "从机制上看", "核心逻辑在于", "传导路径", "验证路径")
INTERNAL_MARKERS = ("SOURCE_ASSET_MISMATCH", "PROXY_BRIDGE_MISSING", "projection-rejected", "gate-v1", "media-package.v1")
CONDITIONAL_MARKERS_ZH = ("如果", "要是", "除非", "仍需", "还要看", "取决于", "一旦", "能否", "是否", "待确认", "可能", "观察")
CONDITIONAL_MARKERS_EN = re.compile(r"\b(if|unless|may|might|could|depends?|watch|conditional|needs? confirmation)\b", re.I)
HISTORICAL_MARKERS = ("历史", "复盘", "截至", "当时", "historical", "replay", "as of")
ACTION_PATTERNS = (
    re.compile(r"(?:建议|你可以|你应当|你应该|直接|现在|立刻|马上|请).{0,20}(?:买入|卖出|做多|做空|开仓|平仓|仓位|杠杆|止损|止盈)", re.I),
    re.compile(r"(?:^|[。！!?；;\n])\s*(?:买|买入|卖|卖出|做多|做空|开仓|平仓)\s*\d+(?:\.\d+)?\s*(?:股|手|张|枚|份|个)", re.I),
    re.compile(r"\b(?:you should|i recommend|right now).{0,28}\b(?:buy|sell|short|go long|position size|leverage|stop[- ]?loss)\b", re.I),
    re.compile(r"(?:助记词|私钥|API\s*secret|secret\s*key|seed\s*phrase)", re.I),
)
THESIS_REF = re.compile(r"^THESIS_[a-z0-9]{8,64}@r[1-9][0-9]*$")
EXPRESSION_REF = re.compile(r"^CEXP_[A-Za-z0-9_:-]{8,}@r[1-9][0-9]*$")
CANONICAL_HASH = re.compile(r"^sha256:[a-f0-9]{64}$")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_community(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text[2:] if text.startswith("r/") else text


def has_conditional_marker(text: str) -> bool:
    return any(marker in text for marker in CONDITIONAL_MARKERS_ZH) or bool(CONDITIONAL_MARKERS_EN.search(text))


def collect_strings(value: Any) -> list[str]:
    result: list[str] = []
    if isinstance(value, str):
        result.append(value)
    elif isinstance(value, list):
        for entry in value:
            result.extend(collect_strings(entry))
    elif isinstance(value, dict):
        for key, entry in value.items():
            if key not in {"source_url", "source_links", "community_rules_url", "thread_url"}:
                result.extend(collect_strings(entry))
    return result


def expected_state(gate_decision: Any, research_decision: Any, policy_decision: Any, route_abstain: bool = False) -> str | None:
    gate_state = {"pass": "ready", "caution": "conditional", "reject": "blocked"}.get(gate_decision)
    route_state = "blocked" if route_abstain else None
    candidates = [state for state in (gate_state, research_decision, policy_decision, route_state) if state in STATE_RANK]
    return max(candidates, key=STATE_RANK.get) if candidates else None


def validate(item: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(item, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "MediaPackageV1 must be an object.")], "warnings": []}

    for key in sorted(REQUIRED - set(item)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    if item.get("schema_version") != "media-package.v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected media-package.v1."))

    lineage = item.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object."))
        lineage = {}
    if not str(lineage.get("artifact_id") or "").startswith("MEDIA_"):
        errors.append(issue("ARTIFACT_ID", "$.lineage.artifact_id", "Media artifact ID must use MEDIA_* prefix."))
    if bool(lineage.get("program_ref")) != bool(lineage.get("content_item_ref")):
        errors.append(issue("PROGRAM_ITEM_LINEAGE", "$.lineage", "program_ref and content_item_ref must be set together."))
    for key in ("opportunity_refs", "input_artifact_refs"):
        value = lineage.get(key)
        if not isinstance(value, list) or len(value) != len(set(value or [])):
            errors.append(issue("LINEAGE_REFS", f"$.lineage.{key}", f"{key} must be a unique array."))
    input_refs = lineage.get("input_artifact_refs") if isinstance(lineage.get("input_artifact_refs"), list) else []
    thesis_refs = [ref for ref in input_refs if isinstance(ref, str) and THESIS_REF.fullmatch(ref)]
    thesis_binding = lineage.get("thesis_binding")
    if thesis_refs and not isinstance(thesis_binding, dict):
        errors.append(issue("THESIS_BINDING_REQUIRED", "$.lineage.thesis_binding", "A thesis-derived media package requires its versioned ref and canonical hash."))
    if thesis_binding is not None:
        if not isinstance(thesis_binding, dict):
            errors.append(issue("THESIS_BINDING_TYPE", "$.lineage.thesis_binding", "thesis_binding must be an object or null."))
        else:
            bound_ref = thesis_binding.get("thesis_ref")
            bound_hash = thesis_binding.get("canonical_hash")
            if not isinstance(bound_ref, str) or not THESIS_REF.fullmatch(bound_ref):
                errors.append(issue("THESIS_REF", "$.lineage.thesis_binding.thesis_ref", "Invalid versioned thesis reference."))
            elif bound_ref not in input_refs:
                errors.append(issue("THESIS_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound thesis must appear in input_artifact_refs."))
            if not isinstance(bound_hash, str) or not CANONICAL_HASH.fullmatch(bound_hash):
                errors.append(issue("THESIS_HASH", "$.lineage.thesis_binding.canonical_hash", "Invalid thesis canonical hash."))

    expression_refs = [ref for ref in input_refs if isinstance(ref, str) and EXPRESSION_REF.fullmatch(ref)]
    expression_binding = lineage.get("expression_binding")
    if expression_refs and not isinstance(expression_binding, dict):
        errors.append(issue("EXPRESSION_BINDING_REQUIRED", "$.lineage.expression_binding", "An expression-plan-derived media package requires its versioned plan ref and locked meaning fingerprint."))
    if expression_binding is not None:
        if not isinstance(expression_binding, dict):
            errors.append(issue("EXPRESSION_BINDING_TYPE", "$.lineage.expression_binding", "expression_binding must be an object or null."))
        else:
            plan_ref = expression_binding.get("plan_ref")
            fingerprint = expression_binding.get("fingerprint_sha256")
            if not isinstance(plan_ref, str) or not EXPRESSION_REF.fullmatch(plan_ref):
                errors.append(issue("EXPRESSION_REF", "$.lineage.expression_binding.plan_ref", "Invalid versioned expression-plan reference."))
            elif plan_ref not in input_refs:
                errors.append(issue("EXPRESSION_BINDING_LINEAGE", "$.lineage.input_artifact_refs", "Bound expression plan must appear in input_artifact_refs."))
            if not isinstance(fingerprint, str) or not CANONICAL_HASH.fullmatch(fingerprint):
                errors.append(issue("EXPRESSION_FINGERPRINT", "$.lineage.expression_binding.fingerprint_sha256", "Invalid locked meaning fingerprint."))

    brief = item.get("brief")
    if not isinstance(brief, dict):
        errors.append(issue("BRIEF_TYPE", "$.brief", "brief must be an object."))
        brief = {}
    channel = brief.get("channel")
    media_format = brief.get("format")
    delivery_mode = brief.get("delivery_mode")
    content_class = brief.get("content_class")
    temporal_mode = brief.get("temporal_mode")
    qualification = brief.get("account_qualification")
    if channel not in CHANNEL_FORMATS:
        errors.append(issue("CHANNEL", "$.brief.channel", "Unsupported channel."))
    elif media_format not in CHANNEL_FORMATS[channel]:
        errors.append(issue("CHANNEL_FORMAT", "$.brief.format", f"{media_format!r} is not supported for {channel}."))
    if delivery_mode not in {"internal_outline", "draft", "publish_ready"}:
        errors.append(issue("DELIVERY_MODE", "$.brief.delivery_mode", "Unsupported delivery mode."))
    if content_class not in CONTENT_CLASSES:
        errors.append(issue("CONTENT_CLASS", "$.brief.content_class", "Unsupported content class."))
    if temporal_mode not in {"realtime", "historical_replay", "evergreen"}:
        errors.append(issue("TEMPORAL_MODE", "$.brief.temporal_mode", "Expected realtime, historical_replay, or evergreen."))
    if qualification not in {"verified", "declared", "unknown", "not_required"}:
        errors.append(issue("QUALIFICATION", "$.brief.account_qualification", "Unsupported qualification state."))

    package = item.get("package")
    if not isinstance(package, dict):
        errors.append(issue("PACKAGE_TYPE", "$.package", "package must be an object."))
        package = {}
    kind = package.get("kind")
    if kind not in {"blocked", "article_outline", "long_form_article", "community_post", "community_comment", "carousel_note", "short_video"}:
        errors.append(issue("PACKAGE_KIND", "$.package.kind", "Unsupported package kind."))
    if kind != "blocked" and media_format and kind != media_format:
        errors.append(issue("FORMAT_KIND", "$.package.kind", "Package kind must match brief.format."))

    gate = item.get("gate")
    if not isinstance(gate, dict):
        errors.append(issue("GATE_TYPE", "$.gate", "gate must be an object."))
        gate = {}
    gate_decision = gate.get("decision")
    if gate_decision not in {"pass", "caution", "reject"}:
        errors.append(issue("GATE_DECISION", "$.gate.decision", "Expected pass, caution, or reject."))

    research_decision = item.get("research_decision")
    research_ref = str(brief.get("research_pack_ref") or "").strip()
    if research_decision not in RESEARCH_DECISIONS:
        errors.append(issue("RESEARCH_DECISION", "$.research_decision", "Expected ready, conditional, blocked, or null."))
    if research_ref and research_decision is None:
        errors.append(issue("RESEARCH_DECISION_REQUIRED", "$.research_decision", "A referenced research pack requires its quality decision."))
    if research_decision is not None and not research_ref:
        errors.append(issue("RESEARCH_REFERENCE_REQUIRED", "$.brief.research_pack_ref", "A research decision requires a stable pack reference."))

    route = item.get("route")
    route_abstain = False
    required_route = {
        "schema_version", "taxonomy_version", "cue_id", "event_type", "event_confidence",
        "candidates", "reasoning_lenses", "render_shape", "required_context", "hard_numbers",
        "abstain", "abstain_reason",
    }
    if not isinstance(route, dict):
        errors.append(issue("ROUTE_TYPE", "$.route", "route must be a complete RouteV1 object."))
        route = {}
    for key in sorted(required_route - set(route)):
        errors.append(issue("ROUTE_FIELD", f"$.route.{key}", "Complete RouteV1 field is required."))
    if route.get("schema_version") != "route-v1" or route.get("taxonomy_version") != "market-narrative-v2":
        errors.append(issue("ROUTE_VERSION", "$.route", "Embedded route must be route-v1 / market-narrative-v2."))
    confidence = route.get("event_confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
        errors.append(issue("ROUTE_CONFIDENCE", "$.route.event_confidence", "Route confidence must be between 0 and 1."))
    for key in ("candidates", "reasoning_lenses", "required_context", "hard_numbers"):
        if not isinstance(route.get(key), list):
            errors.append(issue("ROUTE_ARRAY", f"$.route.{key}", f"{key} must be an array."))
    route_abstain = route.get("abstain") is True
    if route.get("abstain") not in {True, False}:
        errors.append(issue("ROUTE_ABSTAIN_TYPE", "$.route.abstain", "abstain must be boolean."))
    if route_abstain and not str(route.get("abstain_reason") or "").strip():
        errors.append(issue("ROUTE_ABSTAIN_REASON", "$.route.abstain_reason", "Abstention requires a reason."))
    if route.get("event_type") == "unknown" and not route_abstain:
        errors.append(issue("ROUTE_UNKNOWN_NOT_ABSTAIN", "$.route", "Unknown event type must abstain."))

    policy = item.get("policy_gate")
    if not isinstance(policy, dict):
        errors.append(issue("POLICY_TYPE", "$.policy_gate", "policy_gate must be an object."))
        policy = {}
    policy_decision = policy.get("decision")
    if policy_decision not in STATE_RANK:
        errors.append(issue("POLICY_DECISION", "$.policy_gate.decision", "Expected ready, conditional, or blocked."))
    rules_checked = policy.get("rules_checked")
    if not isinstance(rules_checked, list):
        errors.append(issue("POLICY_RULES", "$.policy_gate.rules_checked", "rules_checked must be an array."))
        rules_checked = []
    rule_by_id = {rule.get("rule_id"): rule for rule in rules_checked if isinstance(rule, dict)}

    state = item.get("publication_state")
    expected = expected_state(gate_decision, research_decision, policy_decision, route_abstain)
    if expected and state != expected:
        errors.append(issue("PUBLICATION_STATE", "$.publication_state", f"Gate, research, and policy decisions require {expected}."))

    seeking_alpha_outline = channel == "seeking_alpha" and delivery_mode == "internal_outline" and kind == "article_outline"
    if channel == "seeking_alpha":
        if not seeking_alpha_outline:
            errors.append(issue("SA_AI_BOUNDARY", "$.brief", "Seeking Alpha targets may only return an internal article outline."))
        if policy_decision != "blocked" or state != "blocked":
            errors.append(issue("SA_PUBLICATION_BLOCK", "$.policy_gate.decision", "AI-assisted Seeking Alpha publication must remain blocked."))
        sa_rule = rule_by_id.get("sa.ai-submission")
        if not isinstance(sa_rule, dict) or sa_rule.get("status") != "block":
            errors.append(issue("SA_POLICY_RULE", "$.policy_gate.rules_checked", "Record the Seeking Alpha AI submission block."))

    if content_class == "personalized_advice":
        if policy_decision != "blocked" or state != "blocked" or kind != "blocked":
            errors.append(issue("PERSONALIZED_ADVICE", "$.brief.content_class", "Personalized advice requires a blocked package."))

    if channel in {"xiaohongshu", "douyin"} and content_class in {"investment_analysis", "product_marketing"} and qualification == "unknown":
        if policy_decision == "ready":
            errors.append(issue("QUALIFICATION_UNKNOWN", "$.policy_gate.decision", "Unknown finance qualification cannot produce ready professional analysis or marketing."))

    disclosure = item.get("disclosure_state")
    if not isinstance(disclosure, dict):
        errors.append(issue("DISCLOSURE_STATE", "$.disclosure_state", "disclosure_state must be an object."))
        disclosure = {}
    position_status = disclosure.get("position_status")
    commercial_status = disclosure.get("commercial_status")
    identity_status = disclosure.get("identity_status")
    ai_status = disclosure.get("ai_assistance_status")
    public_disclosures = disclosure.get("public_disclosures")
    if position_status not in {"declared", "no_position", "unknown", "not_required"}:
        errors.append(issue("POSITION_STATUS", "$.disclosure_state.position_status", "Unsupported position disclosure state."))
    if commercial_status not in {"declared", "none", "unknown", "not_required"}:
        errors.append(issue("COMMERCIAL_STATUS", "$.disclosure_state.commercial_status", "Unsupported commercial disclosure state."))
    if identity_status not in {"verified", "declared", "unknown", "not_required"}:
        errors.append(issue("IDENTITY_STATUS", "$.disclosure_state.identity_status", "Unsupported identity disclosure state."))
    if ai_status not in {"disclosed", "not_disclosed", "unknown", "not_required"}:
        errors.append(issue("AI_ASSISTANCE_STATUS", "$.disclosure_state.ai_assistance_status", "Unsupported AI-assistance disclosure state."))
    if not isinstance(public_disclosures, list):
        errors.append(issue("PUBLIC_DISCLOSURES", "$.disclosure_state.public_disclosures", "public_disclosures must be an array."))
        public_disclosures = []
    if state == "ready":
        if commercial_status == "unknown":
            errors.append(issue("COMMERCIAL_DISCLOSURE_UNKNOWN", "$.disclosure_state.commercial_status", "Ready finance media requires a known commercial-relationship state."))
        if content_class in {"market_commentary", "investment_analysis", "product_marketing"} and position_status == "unknown":
            errors.append(issue("POSITION_DISCLOSURE_UNKNOWN", "$.disclosure_state.position_status", "Ready commentary, analysis, or marketing requires a known position state."))
        if channel in {"xiaohongshu", "douyin"} and content_class in {"investment_analysis", "product_marketing"} and identity_status == "unknown":
            errors.append(issue("IDENTITY_DISCLOSURE_UNKNOWN", "$.disclosure_state.identity_status", "Ready professional finance media requires a known identity-disclosure state."))
        if content_class != "personalized_advice" and not public_disclosures:
            warnings.append(issue("PUBLIC_DISCLOSURE_EMPTY", "$.disclosure_state.public_disclosures", "Confirm whether visible position, commercial, identity, or AI disclosures are required."))

    checked_at = parse_time(policy.get("checked_at"))
    as_of = parse_time(brief.get("as_of"))
    if delivery_mode == "publish_ready":
        if checked_at is None:
            errors.append(issue("POLICY_CHECK_REQUIRED", "$.policy_gate.checked_at", "Publish-ready media requires a policy check timestamp."))
        elif as_of is None:
            errors.append(issue("BRIEF_AS_OF", "$.brief.as_of", "Publish-ready media requires a parseable as_of timestamp."))
        else:
            age_days = (as_of - checked_at).total_seconds() / 86400
            if age_days > 30 and policy_decision == "ready":
                errors.append(issue("POLICY_STALE", "$.policy_gate.checked_at", "A policy check older than 30 days cannot support ready publication."))
            elif age_days > 30:
                warnings.append(issue("POLICY_STALE", "$.policy_gate.checked_at", "Refresh the policy check before publication."))

    if channel == "reddit" and kind in {"community_post", "community_comment"}:
        target = normalize_community(brief.get("target_community"))
        actual = normalize_community(package.get("community"))
        if not target or target != actual:
            errors.append(issue("REDDIT_COMMUNITY", "$.package.community", "Package community must match the named target community."))
        if not str(package.get("community_rules_url") or "").startswith(("http://", "https://")):
            errors.append(issue("REDDIT_RULES_URL", "$.package.community_rules_url", "A current community rules URL is required."))
        if parse_time(package.get("rules_checked_at")) is None:
            errors.append(issue("REDDIT_RULES_TIME", "$.package.rules_checked_at", "A parseable community rules check time is required."))
        community_rule = rule_by_id.get("reddit.community-rules")
        if not isinstance(community_rule, dict) or community_rule.get("status") != "pass":
            errors.append(issue("REDDIT_RULE_CHECK", "$.policy_gate.rules_checked", "Record a passing named-community rule check."))

    if expected == "blocked" and kind != "blocked" and not seeking_alpha_outline:
        errors.append(issue("BLOCKED_HAS_PACKAGE", "$.package", "Blocked artifacts cannot contain a public package."))
    if expected in {"ready", "conditional"} and kind == "blocked":
        errors.append(issue("UNEXPECTED_BLOCK", "$.package", "A non-blocked state requires the requested package."))

    ledger = item.get("fact_ledger")
    if not isinstance(ledger, list):
        errors.append(issue("LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array."))
        ledger = []
    fact_ids: set[str] = set()
    current_fact_count = 0
    for index, fact in enumerate(ledger):
        path = f"$.fact_ledger[{index}]"
        if not isinstance(fact, dict):
            errors.append(issue("FACT_TYPE", path, "Fact must be an object."))
            continue
        fact_id = str(fact.get("id") or "").strip()
        if not fact_id:
            errors.append(issue("FACT_ID", f"{path}.id", "Fact ID is required."))
        elif fact_id in fact_ids:
            errors.append(issue("DUPLICATE_FACT_ID", f"{path}.id", f"Duplicate fact ID {fact_id}."))
        fact_ids.add(fact_id)
        if fact.get("evidence_class") not in EVIDENCE_CLASSES:
            errors.append(issue("EVIDENCE_CLASS", f"{path}.evidence_class", "Unsupported evidence class."))
        if fact.get("freshness") not in FRESHNESS:
            errors.append(issue("FRESHNESS", f"{path}.freshness", "Unsupported freshness state."))
        elif fact.get("freshness") == "current":
            current_fact_count += 1
        if not str(fact.get("claim") or "").strip():
            errors.append(issue("FACT_CLAIM", f"{path}.claim", "Fact claim is required."))
        if fact.get("evidence_class") == "verified-live" and not str(fact.get("source_url") or "").strip():
            errors.append(issue("LIVE_SOURCE", f"{path}.source_url", "Verified-live facts require a source URL."))
        if (fact.get("evidence_class") == "verified-live" or fact.get("freshness") == "current") and not str(fact.get("as_of") or "").strip():
            errors.append(issue("LIVE_TIMESTAMP", f"{path}.as_of", "Current or verified-live facts require as_of."))

    def check_fact_refs(refs: Any, path: str, required: bool = True) -> None:
        if not isinstance(refs, list):
            errors.append(issue("FACT_REFS_TYPE", path, "fact_ids must be an array."))
            return
        if required and not refs:
            errors.append(issue("FACT_REFS_EMPTY", path, "A content unit requires at least one fact ID."))
        if any(not isinstance(ref, str) or ref not in fact_ids for ref in refs):
            errors.append(issue("UNKNOWN_FACT", path, "fact_ids contains an unknown fact ID."))

    asset_plan = item.get("asset_plan")
    if not isinstance(asset_plan, list):
        errors.append(issue("ASSET_PLAN_TYPE", "$.asset_plan", "asset_plan must be an array."))
        asset_plan = []
    assets: dict[str, dict[str, Any]] = {}
    for index, asset in enumerate(asset_plan):
        path = f"$.asset_plan[{index}]"
        if not isinstance(asset, dict):
            errors.append(issue("ASSET_TYPE", path, "Asset plan entry must be an object."))
            continue
        asset_id = str(asset.get("id") or "").strip()
        if not asset_id or asset_id in assets:
            errors.append(issue("ASSET_ID", f"{path}.id", "Asset ID must be non-empty and unique."))
        assets[asset_id] = asset
        check_fact_refs(asset.get("fact_ids"), f"{path}.fact_ids", required=False)
        artifact_ref = asset.get("artifact_ref")
        if artifact_ref is not None:
            if not isinstance(artifact_ref, str) or not artifact_ref.strip():
                errors.append(issue("ASSET_ARTIFACT_REF", f"{path}.artifact_ref", "artifact_ref must be null or a non-empty string."))
            elif artifact_ref not in input_refs:
                errors.append(issue("ASSET_ARTIFACT_LINEAGE", f"{path}.artifact_ref", "A generated artifact used as media must also appear in lineage.input_artifact_refs."))
        origin = asset.get("origin")
        reuse_allowed = asset.get("reuse_allowed")
        if origin == "source-reference-only" and reuse_allowed is not False:
            errors.append(issue("REFERENCE_ASSET_REUSE", f"{path}.reuse_allowed", "Source-reference-only assets cannot be marked reusable."))

    referenced_asset_ids: set[str] = set()

    def check_asset_refs(refs: Any, path: str) -> None:
        if not isinstance(refs, list):
            errors.append(issue("ASSET_REFS_TYPE", path, "asset_ids must be an array."))
            return
        for ref in refs:
            if not isinstance(ref, str) or ref not in assets:
                errors.append(issue("UNKNOWN_ASSET", path, "asset_ids contains an unknown asset ID."))
            else:
                referenced_asset_ids.add(ref)

    if kind in {"article_outline", "long_form_article"}:
        sections = package.get("sections")
        if not isinstance(sections, list) or len(sections) < 2:
            errors.append(issue("ARTICLE_SECTIONS", "$.package.sections", "Article packages require at least two sections."))
        else:
            text_field = "notes" if kind == "article_outline" else "body"
            for index, section in enumerate(sections):
                path = f"$.package.sections[{index}]"
                if not isinstance(section, dict) or not str(section.get(text_field) or "").strip():
                    errors.append(issue("ARTICLE_SECTION", path, f"Section requires {text_field}."))
                    continue
                check_fact_refs(section.get("fact_ids"), f"{path}.fact_ids")
                check_asset_refs(section.get("asset_ids"), f"{path}.asset_ids")
    elif kind in {"community_post", "community_comment"}:
        check_fact_refs(package.get("fact_ids"), "$.package.fact_ids")
    elif kind == "carousel_note":
        cards = package.get("cards")
        if not isinstance(cards, list) or len(cards) < 2:
            errors.append(issue("CARDS", "$.package.cards", "Carousel requires at least two cards."))
        else:
            indices = [card.get("index") for card in cards if isinstance(card, dict)]
            if indices != list(range(1, len(cards) + 1)):
                errors.append(issue("CARD_ORDER", "$.package.cards", "Card indices must be contiguous and ordered from 1."))
            for index, card in enumerate(cards):
                path = f"$.package.cards[{index}]"
                if not isinstance(card, dict):
                    errors.append(issue("CARD_TYPE", path, "Card must be an object."))
                    continue
                check_fact_refs(card.get("fact_ids"), f"{path}.fact_ids")
                check_asset_refs(card.get("asset_ids"), f"{path}.asset_ids")
        cover = package.get("cover")
        if not isinstance(cover, dict):
            errors.append(issue("COVER", "$.package.cover", "Carousel cover is required."))
        else:
            check_asset_refs(cover.get("asset_ids"), "$.package.cover.asset_ids")
        if not asset_plan:
            errors.append(issue("VISUAL_ASSET_PLAN", "$.asset_plan", "Carousel packages require an asset plan."))
    elif kind == "short_video":
        duration = package.get("duration_seconds")
        beats = package.get("beats")
        if not isinstance(duration, (int, float)) or isinstance(duration, bool) or duration <= 0:
            errors.append(issue("VIDEO_DURATION", "$.package.duration_seconds", "Video duration must be positive."))
            duration = 0
        if not isinstance(beats, list) or len(beats) < 2:
            errors.append(issue("VIDEO_BEATS", "$.package.beats", "Short video requires at least two beats."))
        else:
            indices = [beat.get("index") for beat in beats if isinstance(beat, dict)]
            if indices != list(range(1, len(beats) + 1)):
                errors.append(issue("BEAT_ORDER", "$.package.beats", "Beat indices must be contiguous and ordered from 1."))
            previous_end = 0.0
            for index, beat in enumerate(beats):
                path = f"$.package.beats[{index}]"
                if not isinstance(beat, dict):
                    errors.append(issue("BEAT_TYPE", path, "Beat must be an object."))
                    continue
                start = beat.get("start_second")
                end = beat.get("end_second")
                if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or isinstance(start, bool) or isinstance(end, bool):
                    errors.append(issue("BEAT_TIMING", path, "Beat timing must be numeric."))
                else:
                    if index == 0 and start != 0:
                        errors.append(issue("BEAT_START", f"{path}.start_second", "First beat must start at 0."))
                    if start < previous_end or end <= start or end > duration:
                        errors.append(issue("BEAT_TIMING", path, "Beats must be ordered, non-overlapping, positive, and inside duration."))
                    previous_end = end
                if not any(str(beat.get(field) or "").strip() for field in ("voiceover", "on_screen_text", "visual_direction")):
                    errors.append(issue("BEAT_EMPTY", path, "Beat needs voiceover, on-screen text, or visual direction."))
                check_fact_refs(beat.get("fact_ids"), f"{path}.fact_ids")
                check_asset_refs(beat.get("asset_ids"), f"{path}.asset_ids")
        if not asset_plan:
            errors.append(issue("VIDEO_ASSET_PLAN", "$.asset_plan", "Short-video packages require an asset plan."))

    if delivery_mode == "publish_ready":
        for asset_id in referenced_asset_ids:
            asset = assets[asset_id]
            if asset.get("reuse_allowed") is not True or asset.get("origin") == "source-reference-only":
                errors.append(issue("ASSET_RIGHTS", f"$.asset_plan[{asset_id}]", "Every referenced publish-ready asset requires explicit reusable rights."))

    disclosures = package.get("disclosures") if isinstance(package, dict) else None
    if kind in {"long_form_article", "article_outline", "carousel_note", "short_video"} and content_class in {"investment_analysis", "product_marketing"}:
        if not isinstance(disclosures, list) or not any(str(value).strip() for value in disclosures):
            errors.append(issue("DISCLOSURE_REQUIRED", "$.package.disclosures", "Investment analysis or marketing requires a visible disclosure."))

    angle = item.get("angle")
    if not isinstance(angle, dict) or not isinstance(angle.get("profile_rule_ids"), list) or not isinstance(angle.get("media_rule_ids"), list):
        errors.append(issue("ANGLE_RULE_IDS", "$.angle", "Angle must report profile_rule_ids and media_rule_ids."))

    public_text = "\n".join(collect_strings(package))
    if temporal_mode == "realtime" and ledger and current_fact_count == 0:
        errors.append(issue("REALTIME_WITHOUT_CURRENT_FACT", "$.brief.temporal_mode", "Realtime media requires at least one fact explicitly marked current."))
    if temporal_mode == "historical_replay" and not any(marker.lower() in public_text.lower() for marker in HISTORICAL_MARKERS):
        errors.append(issue("HISTORICAL_LABEL", "$.package", "Historical replay must be visibly labeled in public copy."))
    for phrase in BANNED_PUBLIC_PHRASES:
        if phrase in public_text:
            warnings.append(issue("AI_PHRASE", "$.package", f"Review stock phrase: {phrase}"))
    for marker in INTERNAL_MARKERS:
        if marker in public_text:
            errors.append(issue("INTERNAL_MARKER", "$.package", f"Internal marker leaked into public copy: {marker}"))
    if len(re.findall(r"不是.{0,30}而是", public_text)) > 1:
        warnings.append(issue("REPEATED_CONTRAST", "$.package", "Repeated 不是...而是 framing reads formulaic."))
    if any(pattern.search(public_text) for pattern in ACTION_PATTERNS):
        errors.append(issue("ACTION_BOUNDARY", "$.package", "Package crosses into personalized orders, sizing, leverage, or credential handling."))
    if expected == "conditional" and kind != "blocked" and not has_conditional_marker(public_text):
        errors.append(issue("CONDITIONAL_WORDING", "$.package", "Conditional packages must name uncertainty, a condition, or a confirmation check."))

    quality = item.get("quality_report")
    if not isinstance(quality, dict) or not {"scores", "hard_failures", "revisions"}.issubset(quality):
        errors.append(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."))
    elif quality.get("hard_failures") and state != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report.hard_failures", "Hard failures require blocked state."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate MediaPackageV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="MediaPackageV1 JSON or array; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    payload = json.loads(raw)
    output = [validate(entry) for entry in payload] if isinstance(payload, list) else validate(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    results = output if isinstance(output, list) else [output]
    raise SystemExit(0 if all(result["valid"] for result in results) else 1)


if __name__ == "__main__":
    main()
