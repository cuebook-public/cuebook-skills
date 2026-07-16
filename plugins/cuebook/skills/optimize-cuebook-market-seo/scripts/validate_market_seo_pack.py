#!/usr/bin/env python3
"""Validate MarketSEOPackV1 references, safety, and readiness invariants."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REQUIRED_ROOT = {
    "schema_version",
    "pack_id",
    "generated_at",
    "input_hash",
    "ruleset_version",
    "mode",
    "brief",
    "evidence_register",
    "query_map",
    "page_plan",
    "technical_gate",
    "structured_data_plan",
    "recommendations",
    "quality_report",
    "readiness",
}
MODES = {"plan", "preflight", "audit", "drift"}
OBSERVED_KINDS = {
    "page_observation",
    "official_guidance",
    "authorized_search_data",
    "authorized_analytics",
}
CRITICAL_AREAS = {
    "status_http",
    "robots",
    "indexability",
    "canonical",
    "internal_discovery",
    "initial_html",
}
SECRET_KEY = re.compile(r"(?:^|_)(?:token|cookie|password|secret|api_key|authorization|private_key)(?:$|_)", re.I)
AMBIGUOUS_NUMERIC_HOST = re.compile(r"^(?:0x[0-9a-f]+|0[0-7]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|0[0-7]+|[0-9]+)){0,3}$", re.I)


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def walk_keys(value: Any, path: str = "$") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if SECRET_KEY.search(str(key)):
                found.append((child_path, str(key)))
            found.extend(walk_keys(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(walk_keys(child, f"{path}[{index}]"))
    return found


def public_http_url(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    host = parsed.hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
        return False
    if host.startswith("metadata.") or host.endswith(".internal"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return AMBIGUOUS_NUMERIC_HOST.fullmatch(host) is None
    return not any(
        (
            address.is_private,
            address.is_loopback,
            address.is_link_local,
            address.is_multicast,
            address.is_reserved,
            address.is_unspecified,
        )
    )


def find_cycle(nodes: set[str], edges: dict[str, set[str]]) -> list[str] | None:
    state = {node: 0 for node in nodes}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for dependency in edges.get(node, set()):
            if dependency not in state:
                continue
            if state[dependency] == 1:
                start = stack.index(dependency)
                return stack[start:] + [dependency]
            if state[dependency] == 0:
                cycle = visit(dependency)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for node in sorted(nodes):
        if state[node] == 0:
            cycle = visit(node)
            if cycle:
                return cycle
    return None


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    blockers: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if not isinstance(payload, dict):
        return {
            "valid": False,
            "errors": [issue("ROOT_TYPE", "$", "MarketSEOPackV1 must be an object.")],
            "blockers": [],
            "warnings": [],
            "computed_readiness": "blocked",
        }

    for key in sorted(REQUIRED_ROOT - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - REQUIRED_ROOT):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    for path, key in walk_keys(payload):
        errors.append(issue("SECRET_FIELD", path, f"Secret-like field {key!r} cannot enter an SEO artifact."))

    if payload.get("schema_version") != "market-seo-pack.v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-seo-pack.v1."))
    if not re.fullmatch(r"seo_pack_[a-f0-9]{16}", str(payload.get("pack_id") or "")):
        errors.append(issue("PACK_ID", "$.pack_id", "pack_id must have a stable 16-character lowercase hex suffix."))
    if parse_time(payload.get("generated_at")) is None:
        errors.append(issue("GENERATED_AT", "$.generated_at", "generated_at must be a parseable timestamp."))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(payload.get("input_hash") or "")):
        errors.append(issue("INPUT_HASH", "$.input_hash", "input_hash must be a lowercase SHA-256 reference for the normalized input."))
    if not re.fullmatch(r"cuebook-market-seo/[0-9]+\.[0-9]+\.[0-9]+", str(payload.get("ruleset_version") or "")):
        errors.append(issue("RULESET_VERSION", "$.ruleset_version", "ruleset_version must identify the deterministic Cuebook SEO ruleset."))
    mode = payload.get("mode")
    if mode not in MODES:
        errors.append(issue("MODE", "$.mode", "Unsupported SEO mode."))

    brief = payload.get("brief") if isinstance(payload.get("brief"), dict) else {}
    if not brief:
        errors.append(issue("BRIEF", "$.brief", "brief must be an object."))
    source_values = brief.get("source_refs")
    source_refs = {value for value in source_values if isinstance(value, str) and value.strip()} if isinstance(source_values, list) else set()
    if not source_refs:
        errors.append(issue("SOURCE_BOUNDARY", "$.brief.source_refs", "At least one stable source reference is required."))
    if not str(brief.get("research_pack_ref") or "").strip():
        errors.append(issue("RESEARCH_PACK_REF", "$.brief.research_pack_ref", "Cuebook SEO requires a ResearchPackV1 reference."))

    for field in ("target_url", "canonical_url"):
        value = brief.get(field)
        if value is not None and not public_http_url(value):
            errors.append(issue("URL_SAFETY", f"$.brief.{field}", "URL must be a public HTTP(S) target without credentials or private-address forms."))
    if mode in {"preflight", "audit", "drift"}:
        if not brief.get("target_url"):
            errors.append(issue("TARGET_URL", "$.brief.target_url", f"{mode} mode requires a target URL."))
        if not brief.get("canonical_url"):
            errors.append(issue("CANONICAL_URL", "$.brief.canonical_url", f"{mode} mode requires an observed canonical URL."))

    temporal_mode = brief.get("temporal_mode")
    as_of = parse_time(brief.get("as_of"))
    expires_at = parse_time(brief.get("expires_at"))
    if brief.get("as_of") is not None and as_of is None:
        errors.append(issue("AS_OF", "$.brief.as_of", "as_of must be a parseable timestamp or null."))
    if brief.get("expires_at") is not None and expires_at is None:
        errors.append(issue("EXPIRES_AT", "$.brief.expires_at", "expires_at must be a parseable timestamp or null."))
    if temporal_mode in {"realtime", "historical_replay"} and as_of is None:
        blockers.append(issue("TEMPORAL_AS_OF", "$.brief.as_of", "Time-sensitive market content requires as_of."))
    if temporal_mode == "realtime":
        if expires_at is None:
            blockers.append(issue("EVENT_EXPIRY", "$.brief.expires_at", "Realtime market content requires an expiry or refresh boundary."))
        elif as_of and expires_at <= as_of:
            errors.append(issue("EXPIRY_ORDER", "$.brief.expires_at", "expires_at must follow as_of."))

    evidence_raw = payload.get("evidence_register")
    if not isinstance(evidence_raw, list) or not evidence_raw:
        errors.append(issue("EVIDENCE_REGISTER", "$.evidence_register", "evidence_register must be a non-empty array."))
        evidence_raw = []
    evidence: dict[str, dict[str, Any]] = {}
    fact_ids: set[str] = set()
    page_observation_count = 0
    for index, entry in enumerate(evidence_raw):
        path = f"$.evidence_register[{index}]"
        if not isinstance(entry, dict):
            errors.append(issue("EVIDENCE_TYPE", path, "Evidence record must be an object."))
            continue
        evidence_id = str(entry.get("evidence_id") or "")
        if evidence_id in evidence:
            errors.append(issue("DUPLICATE_EVIDENCE_ID", f"{path}.evidence_id", f"Duplicate evidence ID {evidence_id}."))
        evidence[evidence_id] = entry
        if entry.get("source_ref") not in source_refs:
            errors.append(issue("UNKNOWN_SOURCE_REF", f"{path}.source_ref", "Evidence source_ref must be declared in brief.source_refs."))
        kind = entry.get("kind")
        observation_mode = entry.get("observation_mode")
        source_locator = entry.get("source_locator")
        content_hash = entry.get("content_hash")
        observed_at = parse_time(entry.get("observed_at"))
        if entry.get("observed_at") is not None and observed_at is None:
            errors.append(issue("EVIDENCE_TIME", f"{path}.observed_at", "observed_at must be parseable or null."))
        if kind in OBSERVED_KINDS and observed_at is None:
            errors.append(issue("OBSERVATION_TIME", f"{path}.observed_at", f"{kind} requires an observation timestamp."))
        if kind == "page_observation":
            if observation_mode not in {"supplied_artifact", "raw_html", "rendered_dom", "manual_observation"}:
                errors.append(issue("PAGE_OBSERVATION_MODE", f"{path}.observation_mode", "Page observations need an explicit supplied, raw, rendered, or manual mode."))
            if not isinstance(source_locator, str) or not source_locator.strip():
                errors.append(issue("PAGE_OBSERVATION_LOCATOR", f"{path}.source_locator", "Page observations need a stable artifact or snapshot locator."))
            if not re.fullmatch(r"[a-f0-9]{64}", str(content_hash or "")):
                errors.append(issue("PAGE_OBSERVATION_HASH", f"{path}.content_hash", "Page observations need a lowercase SHA-256 content hash."))
        elif content_hash is not None and not re.fullmatch(r"[a-f0-9]{64}", str(content_hash)):
            errors.append(issue("EVIDENCE_CONTENT_HASH", f"{path}.content_hash", "content_hash must be null or a lowercase SHA-256 digest."))
        values = entry.get("fact_ids")
        entry_facts = {value for value in values if isinstance(value, str) and value.strip()} if isinstance(values, list) else set()
        if kind == "research_fact" and not entry_facts:
            errors.append(issue("RESEARCH_FACT_IDS", f"{path}.fact_ids", "research_fact evidence requires upstream fact IDs."))
        if kind == "page_observation":
            page_observation_count += 1
        if kind == "research_fact":
            fact_ids.update(entry_facts)
        if temporal_mode == "realtime" and kind == "research_fact" and entry.get("freshness") != "current":
            blockers.append(issue("STALE_REALTIME_FACT", f"{path}.freshness", "Realtime pages cannot rely on stale or unknown research facts."))
    if mode == "drift" and page_observation_count < 2:
        errors.append(issue("DRIFT_OBSERVATIONS", "$.evidence_register", "drift mode requires comparable baseline and current page observations."))

    page_plan = payload.get("page_plan") if isinstance(payload.get("page_plan"), dict) else {}
    sections_raw = page_plan.get("sections")
    if not isinstance(sections_raw, list) or not sections_raw:
        errors.append(issue("SECTIONS", "$.page_plan.sections", "At least one planned section is required."))
        sections_raw = []
    sections: dict[str, dict[str, Any]] = {}
    for index, section in enumerate(sections_raw):
        path = f"$.page_plan.sections[{index}]"
        if not isinstance(section, dict):
            errors.append(issue("SECTION_TYPE", path, "Section must be an object."))
            continue
        section_id = str(section.get("section_id") or "")
        if section_id in sections:
            errors.append(issue("DUPLICATE_SECTION_ID", f"{path}.section_id", f"Duplicate section ID {section_id}."))
        sections[section_id] = section
        section_facts = set(section.get("fact_ids") or [])
        if not section_facts:
            errors.append(issue("SECTION_FACTS", f"{path}.fact_ids", "Every market-content section needs upstream fact bindings."))
        unknown_facts = section_facts - fact_ids
        if unknown_facts:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(unknown_facts)}."))
        unknown_evidence = set(section.get("evidence_ids") or []) - set(evidence)
        if unknown_evidence:
            errors.append(issue("UNKNOWN_EVIDENCE_REF", f"{path}.evidence_ids", f"Unknown evidence IDs: {sorted(unknown_evidence)}."))
        expected_label = {"realtime": "current_as_of", "historical_replay": "historical_replay", "evergreen": "evergreen"}.get(temporal_mode)
        if expected_label and section.get("temporal_label") != expected_label:
            errors.append(issue("TEMPORAL_LABEL", f"{path}.temporal_label", f"{temporal_mode} content requires {expected_label}."))

    queries_raw = payload.get("query_map")
    if not isinstance(queries_raw, list) or not queries_raw:
        errors.append(issue("QUERY_MAP", "$.query_map", "query_map must be a non-empty array."))
        queries_raw = []
    queries: dict[str, dict[str, Any]] = {}
    for index, query in enumerate(queries_raw):
        path = f"$.query_map[{index}]"
        if not isinstance(query, dict):
            errors.append(issue("QUERY_TYPE", path, "Query record must be an object."))
            continue
        query_id = str(query.get("query_id") or "")
        if query_id in queries:
            errors.append(issue("DUPLICATE_QUERY_ID", f"{path}.query_id", f"Duplicate query ID {query_id}."))
        queries[query_id] = query
        query_evidence = set(query.get("evidence_ids") or [])
        unknown = query_evidence - set(evidence)
        if unknown:
            errors.append(issue("UNKNOWN_EVIDENCE_REF", f"{path}.evidence_ids", f"Unknown evidence IDs: {sorted(unknown)}."))
        if query.get("evidence_state") == "observed":
            supported = any(evidence.get(ref, {}).get("kind") != "hypothesis" for ref in query_evidence)
            if not supported:
                errors.append(issue("OBSERVED_QUERY_EVIDENCE", f"{path}.evidence_ids", "Observed queries require non-hypothesis evidence."))
        if query.get("target_section_id") not in sections:
            errors.append(issue("QUERY_SECTION_REF", f"{path}.target_section_id", "Query target section does not exist."))
        volume = query.get("volume")
        volume_ref = query.get("volume_source_evidence_id")
        if volume is not None:
            source = evidence.get(str(volume_ref) or "", {})
            if source.get("kind") != "authorized_search_data":
                errors.append(issue("VOLUME_PROVENANCE", f"{path}.volume_source_evidence_id", "Numeric search volume requires authorized_search_data evidence."))
        elif volume_ref is not None:
            errors.append(issue("VOLUME_REF_WITHOUT_VALUE", f"{path}.volume_source_evidence_id", "Volume evidence must be null when volume is null."))
    if page_plan.get("primary_query_id") not in queries:
        errors.append(issue("PRIMARY_QUERY_REF", "$.page_plan.primary_query_id", "primary_query_id must reference query_map."))
    for section_id, section in sections.items():
        unknown = set(section.get("query_ids") or []) - set(queries)
        if unknown:
            errors.append(issue("SECTION_QUERY_REF", f"$.page_plan.sections[{section_id}].query_ids", f"Unknown query IDs: {sorted(unknown)}."))

    technical = payload.get("technical_gate") if isinstance(payload.get("technical_gate"), dict) else {}
    checks_raw = technical.get("checks")
    if not isinstance(checks_raw, list) or not checks_raw:
        errors.append(issue("TECHNICAL_CHECKS", "$.technical_gate.checks", "At least one technical check is required."))
        checks_raw = []
    check_ids: set[str] = set()
    area_states: dict[str, str] = {}
    for index, check in enumerate(checks_raw):
        path = f"$.technical_gate.checks[{index}]"
        if not isinstance(check, dict):
            errors.append(issue("TECHNICAL_CHECK_TYPE", path, "Technical check must be an object."))
            continue
        check_id = str(check.get("check_id") or "")
        if check_id in check_ids:
            errors.append(issue("DUPLICATE_CHECK_ID", f"{path}.check_id", f"Duplicate check ID {check_id}."))
        check_ids.add(check_id)
        area = str(check.get("area") or "")
        if area in area_states:
            errors.append(issue("DUPLICATE_CHECK_AREA", f"{path}.area", f"Area {area} may appear only once."))
        area_states[area] = str(check.get("state") or "")
        unknown = set(check.get("evidence_ids") or []) - set(evidence)
        if unknown:
            errors.append(issue("UNKNOWN_EVIDENCE_REF", f"{path}.evidence_ids", f"Unknown evidence IDs: {sorted(unknown)}."))
        state = check.get("state")
        observed_at = parse_time(check.get("observed_at"))
        if check.get("observed_at") is not None and observed_at is None:
            errors.append(issue("CHECK_TIME", f"{path}.observed_at", "observed_at must be parseable or null."))
        if mode != "plan" and state != "unknown" and (observed_at is None or not check.get("evidence_ids")):
            errors.append(issue("CHECK_PROVENANCE", path, "Observed technical states require timestamped evidence."))

    critical_states = {area: area_states.get(area) for area in CRITICAL_AREAS}
    if any(state == "block" for state in critical_states.values()):
        computed_eligibility = "blocked"
    elif any(state in {None, "unknown"} for state in critical_states.values()):
        computed_eligibility = "unknown"
    elif any(state == "caution" for state in critical_states.values()):
        computed_eligibility = "conditional"
    else:
        computed_eligibility = "pass"
    if technical.get("eligibility") != computed_eligibility:
        errors.append(issue("TECHNICAL_ELIGIBILITY", "$.technical_gate.eligibility", f"Technical checks compute to {computed_eligibility}."))
    if computed_eligibility == "blocked":
        blockers.append(issue("TECHNICAL_BLOCK", "$.technical_gate", "A search eligibility-floor check is blocked."))

    structured_raw = payload.get("structured_data_plan")
    if not isinstance(structured_raw, list):
        errors.append(issue("STRUCTURED_DATA_PLAN", "$.structured_data_plan", "structured_data_plan must be an array."))
        structured_raw = []
    structured_ids: set[str] = set()
    for index, entry in enumerate(structured_raw):
        path = f"$.structured_data_plan[{index}]"
        if not isinstance(entry, dict):
            errors.append(issue("STRUCTURED_DATA_TYPE", path, "Structured-data entry must be an object."))
            continue
        entry_id = str(entry.get("entry_id") or "")
        if entry_id in structured_ids:
            errors.append(issue("DUPLICATE_STRUCTURED_DATA_ID", f"{path}.entry_id", f"Duplicate structured-data ID {entry_id}."))
        structured_ids.add(entry_id)
        visible_facts = set(entry.get("visible_fact_ids") or [])
        if not visible_facts:
            errors.append(issue("STRUCTURED_DATA_VISIBLE_FACTS", f"{path}.visible_fact_ids", "Structured data requires visible upstream fact IDs."))
        unknown_facts = visible_facts - fact_ids
        if unknown_facts:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.visible_fact_ids", f"Unknown fact IDs: {sorted(unknown_facts)}."))
        unknown_evidence = set(entry.get("evidence_ids") or []) - set(evidence)
        if unknown_evidence:
            errors.append(issue("UNKNOWN_EVIDENCE_REF", f"{path}.evidence_ids", f"Unknown evidence IDs: {sorted(unknown_evidence)}."))
        if entry.get("state") == "validated" and not entry.get("validation_ref"):
            errors.append(issue("STRUCTURED_DATA_VALIDATION", f"{path}.validation_ref", "Validated structured data requires a validation reference."))

    recommendations_raw = payload.get("recommendations")
    if not isinstance(recommendations_raw, list):
        errors.append(issue("RECOMMENDATIONS", "$.recommendations", "recommendations must be an array."))
        recommendations_raw = []
    recommendations: dict[str, dict[str, Any]] = {}
    edges: dict[str, set[str]] = {}
    unresolved_p0 = False
    for index, recommendation in enumerate(recommendations_raw):
        path = f"$.recommendations[{index}]"
        if not isinstance(recommendation, dict):
            errors.append(issue("RECOMMENDATION_TYPE", path, "Recommendation must be an object."))
            continue
        recommendation_id = str(recommendation.get("recommendation_id") or "")
        if recommendation_id in recommendations:
            errors.append(issue("DUPLICATE_RECOMMENDATION_ID", f"{path}.recommendation_id", f"Duplicate recommendation ID {recommendation_id}."))
        recommendations[recommendation_id] = recommendation
        evidence_refs = set(recommendation.get("evidence_ids") or [])
        if not evidence_refs:
            errors.append(issue("RECOMMENDATION_EVIDENCE", f"{path}.evidence_ids", "Every recommendation requires evidence."))
        unknown = evidence_refs - set(evidence)
        if unknown:
            errors.append(issue("UNKNOWN_EVIDENCE_REF", f"{path}.evidence_ids", f"Unknown evidence IDs: {sorted(unknown)}."))
        edges[recommendation_id] = set(recommendation.get("depends_on") or [])
        if recommendation.get("priority") == "P0" and recommendation.get("state") not in {"done", "rejected"}:
            unresolved_p0 = True
    recommendation_ids = set(recommendations)
    for recommendation_id, dependencies in edges.items():
        unknown = dependencies - recommendation_ids
        if unknown:
            errors.append(issue("UNKNOWN_RECOMMENDATION_DEPENDENCY", f"$.recommendations[{recommendation_id}].depends_on", f"Unknown dependencies: {sorted(unknown)}."))
        if recommendation_id in dependencies:
            errors.append(issue("SELF_RECOMMENDATION_DEPENDENCY", f"$.recommendations[{recommendation_id}].depends_on", "Recommendation cannot depend on itself."))
    cycle = find_cycle(recommendation_ids, edges)
    if cycle:
        errors.append(issue("RECOMMENDATION_CYCLE", "$.recommendations", "Recommendation dependency cycle: " + " -> ".join(cycle)))
    if mode != "plan" and unresolved_p0:
        blockers.append(issue("UNRESOLVED_P0", "$.recommendations", "An unresolved P0 recommendation blocks readiness."))

    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    upstream_state = quality.get("upstream_research_state")
    spam_risk = quality.get("spam_risk")
    hard_failures = quality.get("hard_failures") if isinstance(quality.get("hard_failures"), list) else []
    unknowns = quality.get("unknowns") if isinstance(quality.get("unknowns"), list) else []
    if upstream_state == "blocked":
        blockers.append(issue("UPSTREAM_RESEARCH_BLOCKED", "$.quality_report.upstream_research_state", "Blocked research cannot produce a ready SEO pack."))
    if spam_risk == "block":
        blockers.append(issue("SPAM_RISK", "$.quality_report.spam_risk", "Scaled-content or search-manipulation risk blocks readiness."))
    for index, failure in enumerate(hard_failures):
        blockers.append(issue("HARD_FAILURE", f"$.quality_report.hard_failures[{index}]", str(failure)))

    conditional = False
    if mode == "plan":
        conditional = True
    if computed_eligibility != "pass":
        conditional = True
    if upstream_state == "conditional" or spam_risk == "caution" or unknowns:
        conditional = True
    if blockers:
        computed_readiness = "blocked"
    elif conditional:
        computed_readiness = "conditional"
    else:
        computed_readiness = "ready"
    if payload.get("readiness") != computed_readiness:
        errors.append(issue("READINESS", "$.readiness", f"Artifact conditions require {computed_readiness}."))

    return {
        "valid": not errors,
        "errors": errors,
        "blockers": blockers,
        "warnings": warnings,
        "computed_readiness": computed_readiness,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate MarketSEOPackV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="JSON file; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    payload = json.loads(raw)
    output = [validate(item) for item in payload] if isinstance(payload, list) else validate(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    results = output if isinstance(output, list) else [output]
    raise SystemExit(0 if all(result["valid"] for result in results) else 1)


if __name__ == "__main__":
    main()
