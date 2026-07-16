#!/usr/bin/env python3
"""Validate TradingThesisV1 integrity, precommitment, and safety invariants."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED_ROOT = {
    "schema_version",
    "thesis_id",
    "revision",
    "lifecycle_state",
    "timestamps",
    "author",
    "lineage",
    "market",
    "claim",
    "evidence_ledger",
    "reasoning",
    "setup",
    "resolution",
    "disclosure",
    "relations",
    "quality_report",
}
OPTIONAL_ROOT = {"idea_provenance"}
THESIS_ID = re.compile(r"^THESIS_[a-z0-9]{8,64}$")
THESIS_REF = re.compile(r"^THESIS_[a-z0-9]{8,64}@r[1-9][0-9]*$")
HASH = re.compile(r"^sha256:[a-f0-9]{64}$")
STATES = {"draft", "conditional", "ready", "frozen"}
DIRECTIONS = {"long", "short", "neutral", "conditional"}
RELATIONSHIPS = {"direct", "supported_proxy", "watch_only"}
EVIDENCE_CLASSES = {"source", "verified_live", "derived", "hypothesis"}
EVIDENCE_ROLES = {"supports", "challenges", "context"}
SCORE_MODES = {"binary_accuracy", "brier", "directional_accuracy", "return", "excess_return"}
PUBLIC_STATES = {"ready", "frozen"}
REFERENCE_BASES = {"last_trade", "last_close", "midpoint", "nav", "official_close", "official_settlement", "spot", "other"}
MARKET_STATES = {"regular", "pre", "after", "overnight", "closed", "continuous", "unknown"}
ACTION_STATES = {"enter_now", "wait_for_trigger", "observe_only", "hold", "avoid", "exit"}
IDEA_MODES = {"creator_led", "cuebook_assisted", "cuebook_generated"}
IDEA_DELTAS = {"unchanged", "strengthened", "weakened", "narrowed", "conditionalized", "reversed", "abandoned"}
CONTRIBUTION_KINDS = {"evidence", "connection", "countercase", "market_context", "settlement_rule"}
INSTRUCTION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(?:buy|sell)\s+now\b",
        r"\b(?:place|submit)\s+(?:a\s+)?(?:market|limit|stop)?\s*order\b",
        r"\b(?:all[ -]?in|api key|password|seed phrase)\b",
        r"\b[2-9][0-9]*x\s+leverage\b",
        r"(?:立即买入|立即卖出|直接下单|梭哈|满仓|助记词|API\s*密钥|账户密码)",
        r"(?:加|使用)\s*[2-9][0-9]*\s*倍杠杆",
    )
]


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def array(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def strings(value: Any) -> list[str]:
    return [item for item in array(value) if isinstance(item, str) and item]


def parse_time(value: Any, path: str, errors: list[dict[str, str]], required: bool = True) -> datetime | None:
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value:
        errors.append(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("TIME_FORMAT", path, "Invalid ISO timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("TIMEZONE_REQUIRED", path, "Timestamp must include a timezone."))
        return None
    return parsed


def add_bad_refs(
    errors: list[dict[str, str]], refs: Any, allowed: set[str], path: str, code: str
) -> None:
    if not isinstance(refs, list):
        errors.append(issue("REFS_TYPE", path, "References must be an array."))
        return
    for ref in refs:
        if not isinstance(ref, str) or ref not in allowed:
            errors.append(issue(code, path, f"Unknown evidence reference: {ref!r}."))


def canonical_hash(payload: dict[str, Any]) -> str:
    declaration = copy.deepcopy(payload)
    lineage = declaration.get("lineage")
    if isinstance(lineage, dict):
        lineage["canonical_hash"] = None
    encoded = json.dumps(
        declaration,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def walk_text(value: Any, path: str = "$") -> list[tuple[str, str]]:
    output: list[tuple[str, str]] = []
    if isinstance(value, str):
        output.append((path, value))
    elif isinstance(value, dict):
        for key, child in value.items():
            output.extend(walk_text(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            output.extend(walk_text(child, f"{path}[{index}]"))
    return output


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {
            "valid": False,
            "errors": [issue("ROOT_TYPE", "$", "TradingThesisV1 must be an object.")],
            "warnings": [],
        }

    for key in sorted(REQUIRED_ROOT - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - REQUIRED_ROOT - OPTIONAL_ROOT):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "trading-thesis-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected trading-thesis-v1."))
    thesis_id = payload.get("thesis_id")
    if not isinstance(thesis_id, str) or not THESIS_ID.fullmatch(thesis_id):
        errors.append(issue("THESIS_ID", "$.thesis_id", "Invalid thesis ID."))
    revision = payload.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        errors.append(issue("REVISION", "$.revision", "revision must be a positive integer."))
    state = payload.get("lifecycle_state")
    if state not in STATES:
        errors.append(issue("LIFECYCLE_STATE", "$.lifecycle_state", "Unsupported declaration state."))

    timestamps = obj(payload.get("timestamps"))
    created = parse_time(timestamps.get("created_at"), "$.timestamps.created_at", errors)
    updated = parse_time(timestamps.get("updated_at"), "$.timestamps.updated_at", errors)
    as_of = parse_time(timestamps.get("as_of"), "$.timestamps.as_of", errors)
    cutoff = parse_time(timestamps.get("decision_cutoff_at"), "$.timestamps.decision_cutoff_at", errors)
    activated = parse_time(timestamps.get("activated_at"), "$.timestamps.activated_at", errors, required=False)
    expires = parse_time(timestamps.get("expires_at"), "$.timestamps.expires_at", errors, required=False)
    if created and updated and created > updated:
        errors.append(issue("TIMESTAMP_ORDER", "$.timestamps.updated_at", "updated_at precedes created_at."))
    if as_of and updated and as_of > updated:
        errors.append(issue("AS_OF_AFTER_UPDATE", "$.timestamps.as_of", "as_of cannot follow updated_at."))
    if cutoff and updated and cutoff > updated:
        errors.append(issue("CUTOFF_AFTER_UPDATE", "$.timestamps.decision_cutoff_at", "Decision cutoff cannot follow updated_at."))
    if activated and cutoff and activated < cutoff:
        errors.append(issue("ACTIVATION_BEFORE_CUTOFF", "$.timestamps.activated_at", "Activation cannot precede the decision cutoff."))
    if expires and (activated or cutoff) and expires <= (activated or cutoff):
        errors.append(issue("EXPIRY_ORDER", "$.timestamps.expires_at", "Expiry must follow activation or cutoff."))

    author = obj(payload.get("author"))
    if not str(author.get("creator_ref") or "").strip():
        errors.append(issue("CREATOR_REF", "$.author.creator_ref", "creator_ref is required."))
    if author.get("author_type") not in {"human", "ai", "hybrid"}:
        errors.append(issue("AUTHOR_TYPE", "$.author.author_type", "Unsupported author type."))

    lineage = obj(payload.get("lineage"))
    source_artifacts = strings(lineage.get("source_artifact_refs"))
    if state in PUBLIC_STATES and not source_artifacts:
        errors.append(issue("SOURCE_LINEAGE_REQUIRED", "$.lineage.source_artifact_refs", "Ready declarations require source lineage."))
    previous = lineage.get("previous_revision_ref")
    root_ref = lineage.get("root_thesis_ref")
    for value, path in ((previous, "$.lineage.previous_revision_ref"), (root_ref, "$.lineage.root_thesis_ref")):
        if value is not None and (not isinstance(value, str) or not THESIS_REF.fullmatch(value)):
            errors.append(issue("THESIS_REF", path, "Invalid versioned thesis reference."))
    if isinstance(revision, int) and revision > 1 and not previous:
        errors.append(issue("PREVIOUS_REVISION_REQUIRED", "$.lineage.previous_revision_ref", "Revision 2+ requires previous_revision_ref."))
    if revision == 1 and previous is not None:
        errors.append(issue("FIRST_REVISION_PREVIOUS", "$.lineage.previous_revision_ref", "Revision 1 cannot have a previous revision."))
    stored_hash = lineage.get("canonical_hash")
    if state == "frozen":
        if not isinstance(stored_hash, str) or not HASH.fullmatch(stored_hash):
            errors.append(issue("CANONICAL_HASH_REQUIRED", "$.lineage.canonical_hash", "Frozen declaration requires a SHA-256 canonical hash."))
        elif stored_hash != canonical_hash(payload):
            errors.append(issue("CANONICAL_HASH_MISMATCH", "$.lineage.canonical_hash", "Stored hash does not match the declaration."))
    elif stored_hash is not None:
        errors.append(issue("PREMATURE_CANONICAL_HASH", "$.lineage.canonical_hash", "Only frozen declarations carry a canonical hash."))

    market = obj(payload.get("market"))
    for key in ("instrument_id", "display_name", "venue"):
        if not str(market.get(key) or "").strip():
            errors.append(issue("MARKET_FIELD", f"$.market.{key}", f"{key} is required."))
    direction = market.get("direction")
    relationship = market.get("relationship")
    if direction not in DIRECTIONS:
        errors.append(issue("DIRECTION", "$.market.direction", "Unsupported direction."))
    if relationship not in RELATIONSHIPS:
        errors.append(issue("RELATIONSHIP", "$.market.relationship", "Unsupported market relationship."))
    if relationship == "supported_proxy":
        if not str(market.get("projection_gate_ref") or "").strip():
            errors.append(issue("PROXY_GATE_REQUIRED", "$.market.projection_gate_ref", "Supported proxy requires a projection gate reference."))
        if not str(market.get("proxy_reason") or "").strip():
            errors.append(issue("PROXY_REASON_REQUIRED", "$.market.proxy_reason", "Supported proxy requires a causal bridge."))
    if state in PUBLIC_STATES and relationship == "watch_only" and direction in {"long", "short"}:
        errors.append(issue("WATCH_ONLY_DIRECTIONAL", "$.market.relationship", "A ready directional thesis cannot use a watch-only mapping."))

    claim = obj(payload.get("claim"))
    for key in ("statement", "why_now", "horizon"):
        if not str(claim.get(key) or "").strip():
            errors.append(issue("CLAIM_FIELD", f"$.claim.{key}", f"{key} is required."))
    if claim.get("confidence") not in {"low", "medium", "high"}:
        errors.append(issue("CONFIDENCE", "$.claim.confidence", "Unsupported confidence."))
    probability = claim.get("probability")
    if probability is not None and (isinstance(probability, bool) or not isinstance(probability, (int, float)) or not 0 <= probability <= 1):
        errors.append(issue("PROBABILITY", "$.claim.probability", "Probability must be between 0 and 1."))
    if probability is not None and not str(claim.get("probability_basis") or "").strip():
        errors.append(issue("PROBABILITY_BASIS", "$.claim.probability_basis", "A probability requires a stated basis."))

    evidence_items = payload.get("evidence_ledger")
    if not isinstance(evidence_items, list):
        errors.append(issue("EVIDENCE_TYPE", "$.evidence_ledger", "evidence_ledger must be an array."))
        evidence_items = []
    evidence_ids: set[str] = set()
    evidence_roles: dict[str, str] = {}
    evidence_classes: dict[str, str] = {}
    for index, evidence in enumerate(evidence_items):
        path = f"$.evidence_ledger[{index}]"
        if not isinstance(evidence, dict):
            errors.append(issue("EVIDENCE_ENTRY", path, "Evidence entry must be an object."))
            continue
        evidence_id = evidence.get("id")
        if not isinstance(evidence_id, str) or not re.fullmatch(r"E[1-9][0-9]*", evidence_id):
            errors.append(issue("EVIDENCE_ID", f"{path}.id", "Invalid evidence ID."))
            continue
        if evidence_id in evidence_ids:
            errors.append(issue("DUPLICATE_EVIDENCE_ID", f"{path}.id", "Evidence IDs must be unique."))
        evidence_ids.add(evidence_id)
        evidence_class = evidence.get("evidence_class")
        role = evidence.get("role")
        evidence_classes[evidence_id] = str(evidence_class or "")
        evidence_roles[evidence_id] = str(role or "")
        if evidence_class not in EVIDENCE_CLASSES:
            errors.append(issue("EVIDENCE_CLASS", f"{path}.evidence_class", "Unsupported evidence class."))
        if role not in EVIDENCE_ROLES:
            errors.append(issue("EVIDENCE_ROLE", f"{path}.role", "Unsupported evidence role."))
        if not str(evidence.get("claim") or "").strip():
            errors.append(issue("EVIDENCE_CLAIM", f"{path}.claim", "Evidence claim is required."))
        evidence_time = parse_time(evidence.get("as_of"), f"{path}.as_of", errors, required=False)
        if evidence_class in {"source", "verified_live"}:
            if not str(evidence.get("source_ref") or "").strip():
                errors.append(issue("EVIDENCE_SOURCE_REQUIRED", f"{path}.source_ref", "Sourced evidence requires source_ref."))
            if evidence_time is None:
                errors.append(issue("EVIDENCE_TIME_REQUIRED", f"{path}.as_of", "Sourced evidence requires as_of."))
        if evidence.get("freshness") == "current" and evidence_time is None:
            errors.append(issue("CURRENT_EVIDENCE_TIME", f"{path}.as_of", "Current evidence requires as_of."))
        if evidence_time and cutoff and evidence_time > cutoff:
            errors.append(issue("EVIDENCE_AFTER_CUTOFF", f"{path}.as_of", "Evidence observed after the decision cutoff cannot support this declaration."))

    idea_provenance = payload.get("idea_provenance")
    if idea_provenance is not None:
        provenance = obj(idea_provenance)
        mode = provenance.get("mode")
        if mode not in IDEA_MODES:
            errors.append(issue("IDEA_MODE", "$.idea_provenance.mode", "Unsupported idea provenance mode."))
        if provenance.get("idea_delta") not in IDEA_DELTAS:
            errors.append(issue("IDEA_DELTA", "$.idea_provenance.idea_delta", "Unsupported idea delta."))
        for key in ("creator_decision", "final_trade_idea"):
            if not str(provenance.get(key) or "").strip():
                errors.append(issue("IDEA_PROVENANCE_FIELD", f"$.idea_provenance.{key}", f"{key} is required."))
        contributions = provenance.get("cuebook_contributions")
        if not isinstance(contributions, list):
            errors.append(issue("IDEA_CONTRIBUTIONS_TYPE", "$.idea_provenance.cuebook_contributions", "Cuebook contributions must be an array."))
            contributions = []
        if mode == "cuebook_assisted":
            if not str(provenance.get("creator_seed") or "").strip():
                errors.append(issue("CREATOR_SEED_REQUIRED", "$.idea_provenance.creator_seed", "Cuebook-assisted mode requires the creator's actual seed idea."))
            if not contributions:
                errors.append(issue("CUEBOOK_CONTRIBUTION_REQUIRED", "$.idea_provenance.cuebook_contributions", "Cuebook-assisted mode requires at least one attributable contribution."))
        if mode == "creator_led" and contributions:
            errors.append(issue("CREATOR_LED_CONTRIBUTION", "$.idea_provenance.cuebook_contributions", "Creator-led mode cannot attribute contributions to Cuebook."))
        if provenance.get("public_attribution") is True and mode != "cuebook_assisted":
            errors.append(issue("PUBLIC_ATTRIBUTION_MODE", "$.idea_provenance.public_attribution", "Public Cuebook attribution requires cuebook_assisted mode."))
        for index, contribution in enumerate(contributions):
            path = f"$.idea_provenance.cuebook_contributions[{index}]"
            if not isinstance(contribution, dict):
                errors.append(issue("IDEA_CONTRIBUTION_TYPE", path, "Contribution must be an object."))
                continue
            if contribution.get("kind") not in CONTRIBUTION_KINDS:
                errors.append(issue("IDEA_CONTRIBUTION_KIND", f"{path}.kind", "Unsupported Cuebook contribution kind."))
            if not str(contribution.get("summary") or "").strip():
                errors.append(issue("IDEA_CONTRIBUTION_SUMMARY", f"{path}.summary", "Contribution summary is required."))
            add_bad_refs(errors, contribution.get("evidence_refs"), evidence_ids, f"{path}.evidence_refs", "UNKNOWN_IDEA_EVIDENCE_REF")

    reasoning = obj(payload.get("reasoning"))
    support_refs = reasoning.get("supporting_evidence_refs")
    challenge_refs = reasoning.get("counterevidence_refs")
    add_bad_refs(errors, support_refs, evidence_ids, "$.reasoning.supporting_evidence_refs", "UNKNOWN_SUPPORT_REF")
    add_bad_refs(errors, challenge_refs, evidence_ids, "$.reasoning.counterevidence_refs", "UNKNOWN_COUNTER_REF")
    for ref in strings(support_refs):
        if evidence_roles.get(ref) != "supports":
            errors.append(issue("SUPPORT_ROLE_MISMATCH", "$.reasoning.supporting_evidence_refs", f"{ref} is not supporting evidence."))
    for ref in strings(challenge_refs):
        if evidence_roles.get(ref) != "challenges":
            errors.append(issue("COUNTER_ROLE_MISMATCH", "$.reasoning.counterevidence_refs", f"{ref} is not challenging evidence."))

    mechanisms = reasoning.get("mechanisms")
    if not isinstance(mechanisms, list):
        errors.append(issue("MECHANISMS_TYPE", "$.reasoning.mechanisms", "mechanisms must be an array."))
        mechanisms = []
    mechanism_steps: set[int] = set()
    for index, mechanism in enumerate(mechanisms):
        path = f"$.reasoning.mechanisms[{index}]"
        if not isinstance(mechanism, dict):
            errors.append(issue("MECHANISM_ENTRY", path, "Mechanism must be an object."))
            continue
        step = mechanism.get("step")
        if not isinstance(step, int) or isinstance(step, bool) or step < 1 or step in mechanism_steps:
            errors.append(issue("MECHANISM_STEP", f"{path}.step", "Mechanism steps must be unique positive integers."))
        mechanism_steps.add(step)
        add_bad_refs(errors, mechanism.get("evidence_refs"), evidence_ids, f"{path}.evidence_refs", "UNKNOWN_MECHANISM_REF")

    scenarios = reasoning.get("scenarios")
    if not isinstance(scenarios, list):
        errors.append(issue("SCENARIOS_TYPE", "$.reasoning.scenarios", "scenarios must be an array."))
        scenarios = []
    scenario_ids: set[str] = set()
    for index, scenario in enumerate(scenarios):
        path = f"$.reasoning.scenarios[{index}]"
        if not isinstance(scenario, dict):
            errors.append(issue("SCENARIO_ENTRY", path, "Scenario must be an object."))
            continue
        scenario_id = scenario.get("id")
        if not isinstance(scenario_id, str) or not re.fullmatch(r"SC[1-9][0-9]*", scenario_id) or scenario_id in scenario_ids:
            errors.append(issue("SCENARIO_ID", f"{path}.id", "Scenario IDs must be unique and use SC<number>."))
        scenario_ids.add(str(scenario_id))
        add_bad_refs(errors, scenario.get("evidence_refs"), evidence_ids, f"{path}.evidence_refs", "UNKNOWN_SCENARIO_REF")

    setup = obj(payload.get("setup"))
    observation = obj(setup.get("reference_observation"))
    observation_time = parse_time(observation.get("observed_at"), "$.setup.reference_observation.observed_at", errors, required=False)
    if observation_time and cutoff and observation_time > cutoff:
        errors.append(issue("OBSERVATION_AFTER_CUTOFF", "$.setup.reference_observation.observed_at", "Reference observation follows the decision cutoff."))
    if state in PUBLIC_STATES and (observation.get("value") is None or not observation_time or not str(observation.get("source_ref") or "").strip()):
        errors.append(issue("REFERENCE_OBSERVATION_REQUIRED", "$.setup.reference_observation", "Ready declarations require a sourced, timestamped reference observation."))
    if observation.get("observation_basis") not in REFERENCE_BASES:
        errors.append(issue("REFERENCE_OBSERVATION_BASIS", "$.setup.reference_observation.observation_basis", "Reference observation must preserve its quote type."))
    if observation.get("market_state") not in MARKET_STATES:
        errors.append(issue("REFERENCE_MARKET_STATE", "$.setup.reference_observation.market_state", "Reference observation must preserve the market state."))
    action_state = setup.get("action_state")
    if action_state not in ACTION_STATES:
        errors.append(issue("ACTION_STATE", "$.setup.action_state", "Unsupported action state."))
    trigger_condition = str(setup.get("trigger_condition") or "").strip()
    if action_state == "wait_for_trigger" and not trigger_condition:
        errors.append(issue("TRIGGER_REQUIRED", "$.setup.trigger_condition", "wait_for_trigger requires an explicit trigger condition."))
    if action_state == "wait_for_trigger" and state in PUBLIC_STATES:
        errors.append(issue("CONDITIONAL_NOT_ACTIVATED", "$.lifecycle_state", "A thesis waiting for a trigger remains conditional until a lifecycle event activates it."))
    if action_state in {"observe_only", "avoid"} and state in PUBLIC_STATES and direction in {"long", "short"}:
        errors.append(issue("ACTION_DIRECTION_CONFLICT", "$.setup.action_state", "Observe-only or avoid intent cannot be published as an active directional call."))
    if not str(setup.get("entry_condition") or "").strip():
        errors.append(issue("ENTRY_CONDITION", "$.setup.entry_condition", "A conditional setup description is required."))
    if not str(setup.get("invalidation") or "").strip():
        errors.append(issue("INVALIDATION", "$.setup.invalidation", "A falsifier is required."))
    for index, catalyst in enumerate(array(setup.get("catalysts"))):
        if isinstance(catalyst, dict):
            add_bad_refs(errors, catalyst.get("evidence_refs"), evidence_ids, f"$.setup.catalysts[{index}].evidence_refs", "UNKNOWN_CATALYST_REF")

    resolution = obj(payload.get("resolution"))
    resolution_status = resolution.get("status")
    if resolution_status not in {"complete", "incomplete", "not_applicable"}:
        errors.append(issue("RESOLUTION_STATUS", "$.resolution.status", "Unsupported resolution status."))
    window_start = parse_time(resolution.get("window_start"), "$.resolution.window_start", errors, required=False)
    window_end = parse_time(resolution.get("window_end"), "$.resolution.window_end", errors, required=False)
    score_modes = set(strings(resolution.get("score_modes")))
    if score_modes - SCORE_MODES:
        errors.append(issue("SCORE_MODE", "$.resolution.score_modes", "Unsupported score mode."))
    if resolution_status == "complete":
        for key in ("evaluation_kind", "metric", "operator", "observation_basis", "data_source_ref", "timezone", "adjustments_policy"):
            if resolution.get(key) in {None, "", "none"}:
                errors.append(issue("RESOLUTION_FIELD", f"$.resolution.{key}", f"Complete resolution requires {key}."))
        if not window_start or not window_end:
            errors.append(issue("RESOLUTION_WINDOW", "$.resolution", "Complete resolution requires start and end timestamps."))
        if not score_modes:
            errors.append(issue("RESOLUTION_SCORE_REQUIRED", "$.resolution.score_modes", "Complete resolution requires at least one score mode."))
    elif state in PUBLIC_STATES:
        errors.append(issue("RESOLUTION_INCOMPLETE", "$.resolution.status", "Ready and frozen declarations require a complete resolution contract."))
    else:
        warnings.append(issue("RESOLUTION_INCOMPLETE", "$.resolution.status", "Resolution contract is not complete."))
    if window_start and cutoff and window_start < cutoff:
        errors.append(issue("RESOLUTION_BEFORE_CUTOFF", "$.resolution.window_start", "Resolution window cannot start before the decision cutoff."))
    if window_start and window_end and window_end <= window_start:
        errors.append(issue("RESOLUTION_WINDOW_ORDER", "$.resolution.window_end", "Resolution window end must follow its start."))

    threshold = obj(resolution.get("threshold"))
    kind = resolution.get("evaluation_kind")
    metric = resolution.get("metric")
    operator = resolution.get("operator")
    target = threshold.get("target_value")
    lower = threshold.get("lower_bound")
    upper = threshold.get("upper_bound")
    if resolution_status == "complete":
        if kind == "price_target":
            if metric not in {"spot_price", "official_settlement_price"} or operator not in {"gt", "gte", "lt", "lte"} or not isinstance(target, (int, float)) or isinstance(target, bool):
                errors.append(issue("PRICE_TARGET_CONTRACT", "$.resolution", "Price target needs a price metric, directional operator, and numeric target."))
        elif kind == "directional_return":
            if metric != "total_return_pct" or operator not in {"gt", "gte", "lt", "lte"} or not isinstance(target, (int, float)) or isinstance(target, bool):
                errors.append(issue("DIRECTIONAL_RETURN_CONTRACT", "$.resolution", "Directional return needs total_return_pct and a numeric threshold."))
        elif kind == "relative_performance":
            if metric != "excess_return_pct" or operator not in {"gt", "gte", "lt", "lte"} or not isinstance(target, (int, float)) or isinstance(target, bool):
                errors.append(issue("RELATIVE_CONTRACT", "$.resolution", "Relative performance needs excess_return_pct and a numeric threshold."))
            if not str(resolution.get("benchmark_ref") or "").strip():
                errors.append(issue("BENCHMARK_REQUIRED", "$.resolution.benchmark_ref", "Relative performance requires a benchmark."))
        elif kind == "event_occurrence":
            if metric != "event_status" or operator not in {"occurred", "not_occurred"}:
                errors.append(issue("EVENT_CONTRACT", "$.resolution", "Event resolution requires event_status and an occurrence operator."))
        elif kind == "range":
            if metric != "range_value" or operator != "between" or not isinstance(lower, (int, float)) or not isinstance(upper, (int, float)) or isinstance(lower, bool) or isinstance(upper, bool) or lower >= upper:
                errors.append(issue("RANGE_CONTRACT", "$.resolution", "Range resolution requires ordered numeric bounds."))
        else:
            errors.append(issue("EVALUATION_KIND", "$.resolution.evaluation_kind", "Complete resolution needs a supported evaluation kind."))
    if "brier" in score_modes and probability is None:
        errors.append(issue("BRIER_PROBABILITY_REQUIRED", "$.claim.probability", "Brier scoring requires a probability."))
    if "excess_return" in score_modes and kind != "relative_performance":
        errors.append(issue("EXCESS_RETURN_CONTRACT", "$.resolution.score_modes", "excess_return scoring requires relative_performance."))
    if resolution.get("ambiguity_policy") == "fallback_source" and not strings(resolution.get("fallback_source_refs")):
        errors.append(issue("FALLBACK_SOURCE_REQUIRED", "$.resolution.fallback_source_refs", "Fallback policy requires a fallback source."))
    if kind in {"price_target", "directional_return", "relative_performance"}:
        if direction == "long" and operator in {"lt", "lte"}:
            errors.append(issue("DIRECTION_RESOLUTION_CONFLICT", "$.resolution.operator", "Long direction conflicts with a downside pass operator."))
        if direction == "short" and operator in {"gt", "gte"}:
            errors.append(issue("DIRECTION_RESOLUTION_CONFLICT", "$.resolution.operator", "Short direction conflicts with an upside pass operator."))

    if state in PUBLIC_STATES and direction in {"long", "short"}:
        sourced_support = [ref for ref in strings(support_refs) if evidence_classes.get(ref) in {"source", "verified_live"}]
        if not sourced_support:
            errors.append(issue("SOURCED_SUPPORT_REQUIRED", "$.reasoning.supporting_evidence_refs", "Directional thesis requires sourced supporting evidence."))
        if not strings(challenge_refs):
            errors.append(issue("COUNTEREVIDENCE_REQUIRED", "$.reasoning.counterevidence_refs", "Directional thesis requires challenging evidence."))
        if len(scenarios) < 2:
            errors.append(issue("SCENARIOS_REQUIRED", "$.reasoning.scenarios", "Directional thesis requires at least two scenarios."))
        if not mechanisms:
            errors.append(issue("MECHANISM_REQUIRED", "$.reasoning.mechanisms", "Directional thesis requires a mechanism."))

    disclosure = obj(payload.get("disclosure"))
    if disclosure.get("visibility") == "public" and state in PUBLIC_STATES:
        for key in ("position_status", "commercial_status", "identity_status", "ai_assistance_status"):
            if disclosure.get(key) in {None, "unknown"}:
                errors.append(issue("PUBLIC_DISCLOSURE_REQUIRED", f"$.disclosure.{key}", "Public declaration requires a known disclosure state."))
        if author.get("author_type") in {"ai", "hybrid"} and disclosure.get("ai_assistance_status") not in {"assisted", "generated"}:
            errors.append(issue("AI_DISCLOSURE_REQUIRED", "$.disclosure.ai_assistance_status", "AI or hybrid authorship must be disclosed."))
        if author.get("author_type") == "ai" and disclosure.get("identity_status") != "ai_identity":
            errors.append(issue("AI_IDENTITY_REQUIRED", "$.disclosure.identity_status", "AI author requires an AI identity disclosure."))

    for text_path, text_value in walk_text(payload):
        if any(pattern.search(text_value) for pattern in INSTRUCTION_PATTERNS):
            errors.append(issue("EXECUTION_INSTRUCTION", text_path, "Thesis contains an order, leverage, sizing, or credential instruction."))
            break

    quality = obj(payload.get("quality_report"))
    counts = obj(quality.get("counts"))
    expected_counts = {
        "evidence": len(evidence_items),
        "supporting": len(strings(support_refs)),
        "challenging": len(strings(challenge_refs)),
        "mechanisms": len(mechanisms),
        "scenarios": len(scenarios),
    }
    if counts != expected_counts:
        errors.append(issue("QUALITY_COUNTS", "$.quality_report.counts", f"Expected counts {expected_counts}."))
    structural_error_count = len(errors)
    expected_decision = "blocked" if structural_error_count else ("conditional" if state in {"draft", "conditional"} or warnings else "ready")
    if quality.get("decision") != expected_decision:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", f"Expected {expected_decision}."))
    if state in PUBLIC_STATES and not errors:
        for key in ("evidence_decision", "resolution_decision", "publication_decision"):
            if quality.get(key) != "ready":
                errors.append(issue("QUALITY_SUBDECISION", f"$.quality_report.{key}", "Ready declaration requires ready subdecisions."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--print-canonical-hash", action="store_true")
    args = parser.parse_args()
    payload = json.loads(args.json_file.read_text(encoding="utf-8"))
    if args.print_canonical_hash:
        if not isinstance(payload, dict):
            raise SystemExit("TradingThesisV1 must be an object.")
        print(canonical_hash(payload))
        return
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
