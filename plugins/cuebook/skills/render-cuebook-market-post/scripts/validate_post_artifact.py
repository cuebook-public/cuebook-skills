#!/usr/bin/env python3
"""Validate deterministic PostV1 publication invariants."""

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
    "drafts",
    "draft_evidence",
    "watch_items",
    "quality_report",
    "publication_state",
}
OPTIONAL = {"assisted_discovery"}
PLATFORMS = {"x", "telegram", "xhs", "buy_side_note"}
RESEARCH_DECISIONS = {"ready", "conditional", "blocked", None}
EVIDENCE_CLASSES = {"source", "verified-live", "derived", "hypothesis"}
FRESHNESS = {"current", "stale", "unknown"}
CONTENT_CLASSES = {"market_commentary", "financial_education", "investment_analysis", "product_marketing", "personalized_advice"}
TEMPORAL_MODES = {"realtime", "historical_replay", "evergreen"}
STATE_RANK = {"ready": 0, "conditional": 1, "blocked": 2}
BANNED_PUBLIC_PHRASES = (
    "值得关注的是",
    "从机制上看",
    "核心逻辑在于",
    "传导路径",
    "验证路径",
)
INTERNAL_MARKERS = (
    "SOURCE_ASSET_MISMATCH",
    "PROXY_BRIDGE_MISSING",
    "projection-rejected",
    "gate-v1",
    "post-v1",
)
CONDITIONAL_MARKERS_ZH = ("如果", "要是", "除非", "仍需", "还要看", "取决于", "一旦", "能否", "是否", "待确认", "可能", "观察")
CONDITIONAL_MARKERS_EN = re.compile(r"\b(if|unless|may|might|could|depends?|watch|conditional|needs? confirmation)\b", re.I)
HISTORICAL_MARKERS = ("历史", "复盘", "截至", "当时", "historical", "replay", "as of")
SELF_CORRECTION_PHRASES = (
    "认错",
    "哪里看错",
    "什么情况算看错",
    "错了怎么办",
)
CUEBOOK_WORKFLOW_PATTERNS = (
    re.compile(r"cuebook.{0,40}(?:帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色|写(?:出|成)?|建议|让我|给我|替我|完成)", re.I),
    re.compile(r"(?:放进|用|通过|经过|借助|帮|补(?:全|充)?|完善|启发|协助|生成|改写|润色).{0,40}cuebook", re.I),
    re.compile(r"\bcuebook\b.{0,48}\b(?:helped?|completed?|improved?|inspired?|generated?|drafted?|rewrote|suggested?)\b", re.I),
    re.compile(r"\b(?:used?|put|through|with)\b.{0,48}\bcuebook\b", re.I),
)
ACTION_PATTERNS = (
    re.compile(r"(?:^|[。！!?；;\n])\s*(?:买|买入|卖|卖出|做多|做空|开仓|平仓)\s*\d+(?:\.\d+)?\s*(?:股|手|张|枚|份|个)", re.I),
    re.compile(r"(?:建议|你可以|你应当|你应该|直接|现在|立刻|马上|请).{0,16}(?:买入|卖出|做多|做空|开仓|平仓|仓位|杠杆|止损|止盈)", re.I),
    re.compile(r"(?:^|[.!?;\n])\s*(?:buy|sell|short|go long)\s+\d+(?:\.\d+)?\s*(?:shares?|contracts?|lots?)", re.I),
    re.compile(r"\b(?:you should|i recommend|right now).{0,24}\b(?:buy|sell|short|go long|position size|leverage|stop[- ]?loss)\b", re.I),
    re.compile(r"(?:助记词|私钥|API\s*secret|secret\s*key|seed\s*phrase)", re.I),
)
THESIS_REF = re.compile(r"^THESIS_[a-z0-9]{8,64}@r[1-9][0-9]*$")
EXPRESSION_REF = re.compile(r"^CEXP_[A-Za-z0-9_:-]{8,}@r[1-9][0-9]*$")
CANONICAL_HASH = re.compile(r"^sha256:[a-f0-9]{64}$")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty_drafts(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {key: text.strip() for key, text in value.items() if isinstance(text, str) and text.strip()}


def has_conditional_marker(text: str) -> bool:
    return any(marker in text for marker in CONDITIONAL_MARKERS_ZH) or bool(CONDITIONAL_MARKERS_EN.search(text))


def contains_cuebook_workflow_narration(text: str) -> bool:
    return any(pattern.search(text) for pattern in CUEBOOK_WORKFLOW_PATTERNS)


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = value.strip()[:-1] + "+00:00" if value.strip().endswith("Z") else value.strip()
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate(item: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(item, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "PostV1 must be an object.")], "warnings": []}

    for key in sorted(REQUIRED - set(item)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(item) - REQUIRED - OPTIONAL):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if item.get("schema_version") != "post-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected post-v1."))

    lineage = item.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object."))
        lineage = {}
    if not str(lineage.get("artifact_id") or "").startswith("POST_"):
        errors.append(issue("ARTIFACT_ID", "$.lineage.artifact_id", "Post artifact ID must use POST_* prefix."))
    program_ref = lineage.get("program_ref")
    content_item_ref = lineage.get("content_item_ref")
    if bool(program_ref) != bool(content_item_ref):
        errors.append(issue("PROGRAM_ITEM_LINEAGE", "$.lineage", "program_ref and content_item_ref must be set together."))
    for key in ("opportunity_refs", "input_artifact_refs"):
        value = lineage.get(key)
        if not isinstance(value, list) or len(value) != len(set(value or [])):
            errors.append(issue("LINEAGE_REFS", f"$.lineage.{key}", f"{key} must be a unique array."))
    input_refs = lineage.get("input_artifact_refs") if isinstance(lineage.get("input_artifact_refs"), list) else []
    thesis_refs = [ref for ref in input_refs if isinstance(ref, str) and THESIS_REF.fullmatch(ref)]
    thesis_binding = lineage.get("thesis_binding")
    if thesis_refs and not isinstance(thesis_binding, dict):
        errors.append(issue("THESIS_BINDING_REQUIRED", "$.lineage.thesis_binding", "A thesis-derived post requires its versioned ref and canonical hash."))
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
        errors.append(issue("EXPRESSION_BINDING_REQUIRED", "$.lineage.expression_binding", "An expression-plan-derived post requires its versioned plan ref and locked meaning fingerprint."))
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
    platforms = brief.get("platforms")
    if not isinstance(platforms, list) or any(platform not in PLATFORMS for platform in platforms):
        errors.append(issue("PLATFORMS", "$.brief.platforms", "platforms contains an unsupported value."))
    content_class = brief.get("content_class")
    temporal_mode = brief.get("temporal_mode")
    if content_class not in CONTENT_CLASSES:
        errors.append(issue("CONTENT_CLASS", "$.brief.content_class", "Unsupported content class."))
    if temporal_mode not in TEMPORAL_MODES:
        errors.append(issue("TEMPORAL_MODE", "$.brief.temporal_mode", "Unsupported temporal mode."))

    gate = item.get("gate")
    if not isinstance(gate, dict):
        errors.append(issue("GATE_TYPE", "$.gate", "gate must be an object."))
        gate = {}
    decision = gate.get("decision")
    if decision not in {"pass", "caution", "reject"}:
        errors.append(issue("GATE_DECISION", "$.gate.decision", "Expected pass, caution, or reject."))

    research_decision = item.get("research_decision")
    if research_decision not in RESEARCH_DECISIONS:
        errors.append(issue("RESEARCH_DECISION", "$.research_decision", "Expected ready, conditional, blocked, or null."))
    research_pack_ref = str(brief.get("research_pack_ref") or "").strip()
    if research_pack_ref and research_decision is None:
        errors.append(issue("RESEARCH_DECISION_REQUIRED", "$.research_decision", "A referenced research pack requires its quality decision."))
    if research_decision is not None and not research_pack_ref:
        errors.append(issue("RESEARCH_REFERENCE_REQUIRED", "$.brief.research_pack_ref", "A research decision requires a stable pack reference or digest."))

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
    if not isinstance(policy.get("rules_checked"), list) or not isinstance(policy.get("repairs"), list):
        errors.append(issue("POLICY_FIELDS", "$.policy_gate", "rules_checked and repairs must be arrays."))

    disclosure = item.get("disclosure_state")
    if not isinstance(disclosure, dict):
        errors.append(issue("DISCLOSURE_TYPE", "$.disclosure_state", "disclosure_state must be an object."))
        disclosure = {}
    if disclosure.get("position_status") not in {"declared", "no_position", "unknown", "not_required"}:
        errors.append(issue("POSITION_STATUS", "$.disclosure_state.position_status", "Unsupported position state."))
    if disclosure.get("commercial_status") not in {"declared", "none", "unknown", "not_required"}:
        errors.append(issue("COMMERCIAL_STATUS", "$.disclosure_state.commercial_status", "Unsupported commercial state."))
    if disclosure.get("identity_status") not in {"verified", "declared", "unknown", "not_required"}:
        errors.append(issue("IDENTITY_STATUS", "$.disclosure_state.identity_status", "Unsupported identity state."))
    if disclosure.get("ai_assistance_status") not in {"disclosed", "not_disclosed", "unknown", "not_required"}:
        errors.append(issue("AI_ASSISTANCE_STATUS", "$.disclosure_state.ai_assistance_status", "Unsupported AI-assistance state."))
    if not isinstance(disclosure.get("public_disclosures"), list):
        errors.append(issue("PUBLIC_DISCLOSURES", "$.disclosure_state.public_disclosures", "public_disclosures must be an array."))

    checked_at = parse_time(policy.get("checked_at"))
    brief_as_of = parse_time(brief.get("as_of"))
    if policy_decision == "ready":
        if checked_at is None or brief_as_of is None:
            errors.append(issue("POLICY_TIME", "$.policy_gate.checked_at", "Ready policy requires parseable checked_at and brief.as_of."))
        elif (brief_as_of - checked_at).total_seconds() > 30 * 86400:
            errors.append(issue("POLICY_STALE", "$.policy_gate.checked_at", "Policy older than 30 days cannot support ready publication."))

    drafts = item.get("drafts")
    if not isinstance(drafts, dict) or not PLATFORMS.issubset(drafts):
        errors.append(issue("DRAFT_FIELDS", "$.drafts", "All PostV1 draft fields must be present."))
        drafts = drafts if isinstance(drafts, dict) else {}
    live_drafts = nonempty_drafts(drafts)
    state = item.get("publication_state")
    gate_state = {"pass": "ready", "caution": "conditional", "reject": "blocked"}.get(decision)
    rank = STATE_RANK
    route_state = "blocked" if route_abstain else None
    candidates = [candidate for candidate in (gate_state, research_decision, route_state, policy_decision) if candidate in rank]
    expected_state = max(candidates, key=rank.get) if candidates else None
    if expected_state and state != expected_state:
        errors.append(issue("PUBLICATION_STATE", "$.publication_state", f"Gate and research decisions require {expected_state}."))
    if expected_state == "blocked" and live_drafts:
        errors.append(issue("BLOCKED_HAS_DRAFT", "$.drafts", "Blocked artifacts cannot contain public drafts."))
    if expected_state in {"ready", "conditional"} and platforms and not any(platform in live_drafts for platform in platforms):
        errors.append(issue("REQUESTED_DRAFT_MISSING", "$.drafts", "No requested platform has a draft."))
    if content_class == "personalized_advice" and (state != "blocked" or live_drafts):
        errors.append(issue("PERSONALIZED_ADVICE", "$.brief.content_class", "Personalized advice requires a blocked artifact with no drafts."))
    if state == "ready":
        if disclosure.get("commercial_status") == "unknown":
            errors.append(issue("COMMERCIAL_DISCLOSURE_UNKNOWN", "$.disclosure_state.commercial_status", "Ready finance content requires a known commercial relationship."))
        if content_class in {"market_commentary", "investment_analysis", "product_marketing"} and disclosure.get("position_status") == "unknown":
            errors.append(issue("POSITION_DISCLOSURE_UNKNOWN", "$.disclosure_state.position_status", "Ready market content requires a known position state."))

    ledger = item.get("fact_ledger")
    if not isinstance(ledger, list):
        errors.append(issue("LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array."))
        ledger = []
    seen_ids: set[str] = set()
    current_fact_count = 0
    for index, fact in enumerate(ledger):
        path = f"$.fact_ledger[{index}]"
        if not isinstance(fact, dict):
            errors.append(issue("FACT_TYPE", path, "Ledger item must be an object."))
            continue
        fact_id = str(fact.get("id") or "").strip()
        if not fact_id:
            errors.append(issue("FACT_ID", f"{path}.id", "Fact ID is required."))
        elif fact_id in seen_ids:
            errors.append(issue("DUPLICATE_FACT_ID", f"{path}.id", f"Duplicate fact ID {fact_id}."))
        seen_ids.add(fact_id)
        if not str(fact.get("claim") or "").strip():
            errors.append(issue("FACT_CLAIM", f"{path}.claim", "Fact claim is required."))
        evidence_class = fact.get("evidence_class")
        if evidence_class not in EVIDENCE_CLASSES:
            errors.append(issue("EVIDENCE_CLASS", f"{path}.evidence_class", "Unsupported evidence class."))
        freshness = fact.get("freshness")
        if freshness not in FRESHNESS:
            errors.append(issue("FRESHNESS", f"{path}.freshness", "Unsupported freshness state."))
        elif freshness == "current":
            current_fact_count += 1
        if evidence_class == "verified-live" and not str(fact.get("source_url") or "").strip():
            errors.append(issue("LIVE_SOURCE", f"{path}.source_url", "Verified live facts require a source URL."))
        if (evidence_class == "verified-live" or freshness == "current") and not str(fact.get("as_of") or "").strip():
            errors.append(issue("LIVE_TIMESTAMP", f"{path}.as_of", "Current or verified live facts require as_of."))

    assisted = item.get("assisted_discovery")
    assisted_mode = None
    public_attribution = False
    if assisted is not None:
        if not isinstance(assisted, dict):
            errors.append(issue("ASSISTED_DISCOVERY_TYPE", "$.assisted_discovery", "assisted_discovery must be an object or null."))
            assisted = {}
        assisted_mode = assisted.get("mode")
        public_attribution = assisted.get("public_attribution") is True
        if assisted_mode not in {"none", "cuebook_assisted"}:
            errors.append(issue("ASSISTED_DISCOVERY_MODE", "$.assisted_discovery.mode", "Unsupported assisted-discovery mode."))
        if assisted_mode == "cuebook_assisted":
            for key in ("creator_seed", "cuebook_contribution", "creator_judgment", "final_trade_idea"):
                if not str(assisted.get(key) or "").strip():
                    errors.append(issue("ASSISTED_DISCOVERY_FIELD", f"$.assisted_discovery.{key}", f"{key} is required in cuebook_assisted mode."))
            if assisted.get("idea_delta") not in {"unchanged", "strengthened", "weakened", "narrowed", "conditionalized", "reversed", "abandoned"}:
                errors.append(issue("ASSISTED_IDEA_DELTA", "$.assisted_discovery.idea_delta", "cuebook_assisted mode requires a valid idea_delta."))
            fact_refs = assisted.get("fact_refs")
            if not isinstance(fact_refs, list) or not fact_refs:
                errors.append(issue("ASSISTED_FACT_REFS", "$.assisted_discovery.fact_refs", "Cuebook contribution requires at least one supporting fact reference."))
            elif any(not isinstance(ref, str) or ref not in seen_ids for ref in fact_refs):
                errors.append(issue("ASSISTED_UNKNOWN_FACT", "$.assisted_discovery.fact_refs", "Cuebook contribution references an unknown fact."))
        if public_attribution:
            errors.append(issue("PUBLIC_ASSISTANCE_ATTRIBUTION", "$.assisted_discovery.public_attribution", "Cuebook assistance provenance must remain internal."))

    draft_evidence = item.get("draft_evidence")
    if not isinstance(draft_evidence, dict) or not PLATFORMS.issubset(draft_evidence):
        errors.append(issue("DRAFT_EVIDENCE_FIELDS", "$.draft_evidence", "All platform evidence fields must be present."))
        draft_evidence = {}
    for platform in sorted(PLATFORMS):
        refs = draft_evidence.get(platform)
        path = f"$.draft_evidence.{platform}"
        if not isinstance(refs, list):
            errors.append(issue("DRAFT_EVIDENCE_TYPE", path, "Draft evidence must be an array of fact IDs."))
            continue
        valid_refs = [ref for ref in refs if isinstance(ref, str) and ref in seen_ids]
        if len(valid_refs) != len(refs):
            errors.append(issue("UNKNOWN_DRAFT_FACT", path, "Draft evidence contains an unknown fact ID."))
        if platform in live_drafts and not valid_refs:
            errors.append(issue("DRAFT_EVIDENCE_MISSING", path, "A non-empty draft requires at least one fact ID."))
        if platform not in live_drafts and valid_refs:
            warnings.append(issue("DRAFT_EVIDENCE_WITHOUT_DRAFT", path, "Empty draft retains evidence references."))

    angle = item.get("angle")
    if not isinstance(angle, dict) or not isinstance(angle.get("profile_rule_ids"), list):
        errors.append(issue("PROFILE_RULE_IDS", "$.angle.profile_rule_ids", "profile_rule_ids must be an array."))

    public_text = "\n".join(live_drafts.values())
    if contains_cuebook_workflow_narration(public_text):
        errors.append(issue("PUBLIC_CUEBOOK_NARRATION", "$.drafts", "Public drafts must express the market view directly and keep Cuebook workflow narration internal."))
    lowered_public_text = public_text.lower()
    for phrase in SELF_CORRECTION_PHRASES:
        if phrase.lower() in lowered_public_text:
            errors.append(issue("PUBLIC_SELF_CORRECTION_HEADING", "$.drafts", f"Remove self-correction workflow language: {phrase}"))
    if temporal_mode == "realtime" and ledger and current_fact_count == 0:
        errors.append(issue("REALTIME_WITHOUT_CURRENT_FACT", "$.brief.temporal_mode", "Realtime post requires at least one current fact."))
    if temporal_mode == "historical_replay" and not any(marker.lower() in public_text.lower() for marker in HISTORICAL_MARKERS):
        errors.append(issue("HISTORICAL_LABEL", "$.drafts", "Historical replay must be visibly labeled."))
    for phrase in BANNED_PUBLIC_PHRASES:
        if phrase in public_text:
            warnings.append(issue("AI_PHRASE", "$.drafts", f"Review stock phrase: {phrase}"))
    for marker in INTERNAL_MARKERS:
        if marker in public_text:
            errors.append(issue("INTERNAL_MARKER", "$.drafts", f"Internal marker leaked into public copy: {marker}"))
    for platform, draft in live_drafts.items():
        if expected_state == "conditional" and not has_conditional_marker(draft):
            errors.append(issue("CONDITIONAL_WORDING", f"$.drafts.{platform}", "Conditional drafts must name uncertainty, a condition, or a confirmation check."))
        if any(pattern.search(draft) for pattern in ACTION_PATTERNS):
            errors.append(issue("ACTION_BOUNDARY", f"$.drafts.{platform}", "Draft crosses into personalized orders, sizing, leverage, or credential handling."))
    if len(re.findall(r"不是.{0,30}而是", public_text)) > 1:
        warnings.append(issue("REPEATED_CONTRAST", "$.drafts", "Repeated 不是...而是 framing reads formulaic."))

    quality = item.get("quality_report")
    if not isinstance(quality, dict) or not {"scores", "hard_failures", "revisions"}.issubset(quality):
        errors.append(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."))
    elif quality.get("hard_failures") and state != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report.hard_failures", "Hard failures require blocked state."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Cuebook PostV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="PostV1 JSON or array; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    payload = json.loads(raw)
    output = [validate(item) for item in payload] if isinstance(payload, list) else validate(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    results = output if isinstance(output, list) else [output]
    raise SystemExit(0 if all(result["valid"] for result in results) else 1)


if __name__ == "__main__":
    main()
