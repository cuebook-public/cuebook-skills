#!/usr/bin/env python3
"""Validate MarketGEOPackV1 evidence, sample integrity, and readiness."""

from __future__ import annotations

import argparse
import ipaddress
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REQUIRED_ROOT = {
    "schema_version",
    "pack_id",
    "input_hash",
    "ruleset_version",
    "generated_at",
    "mode",
    "brief",
    "source_register",
    "seo_eligibility",
    "entity_graph",
    "fact_cards",
    "question_map",
    "answer_units",
    "citation_map",
    "crawler_access",
    "measurement_plan",
    "observations",
    "sample_summary",
    "issues",
    "quality_report",
    "readiness",
}
MODES = {"plan", "preflight", "monitor_plan", "sample_review"}
OBSERVED_SOURCE_KINDS = {
    "official_guidance",
    "page_observation",
    "authorized_platform_sample",
    "manual_platform_sample",
    "synthetic_sample",
}
SAMPLE_SOURCE_KINDS = {"authorized_platform_sample", "manual_platform_sample", "synthetic_sample"}
REAL_SAMPLE_MODES = {"manual_real", "authorized_api", "browser_assisted_with_permission"}
REQUIRED_SAMPLE_FIELDS = {"engine", "prompt_id", "sampled_at", "raw_evidence_ref", "answer_hash", "review_state"}
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


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    blockers: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if not isinstance(payload, dict):
        return {
            "valid": False,
            "errors": [issue("ROOT_TYPE", "$", "MarketGEOPackV1 must be an object.")],
            "blockers": [],
            "warnings": [],
            "computed_readiness": "blocked",
        }

    for key in sorted(REQUIRED_ROOT - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - REQUIRED_ROOT):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    for path, key in walk_keys(payload):
        errors.append(issue("SECRET_FIELD", path, f"Secret-like field {key!r} cannot enter a GEO artifact."))

    if payload.get("schema_version") != "market-geo-pack.v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected market-geo-pack.v1."))
    if not re.fullmatch(r"geo_pack_[a-f0-9]{16}", str(payload.get("pack_id") or "")):
        errors.append(issue("PACK_ID", "$.pack_id", "pack_id must have a stable 16-character lowercase hex suffix."))
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(payload.get("input_hash") or "")):
        errors.append(issue("INPUT_HASH", "$.input_hash", "input_hash must be a SHA-256 reference."))
    if not re.fullmatch(r"cuebook-market-geo/[0-9]+\.[0-9]+\.[0-9]+", str(payload.get("ruleset_version") or "")):
        errors.append(issue("RULESET_VERSION", "$.ruleset_version", "ruleset_version must identify the deterministic Cuebook GEO ruleset."))
    if parse_time(payload.get("generated_at")) is None:
        errors.append(issue("GENERATED_AT", "$.generated_at", "generated_at must be a parseable timestamp."))
    mode = payload.get("mode")
    if mode not in MODES:
        errors.append(issue("MODE", "$.mode", "Unsupported GEO mode."))

    brief = payload.get("brief") if isinstance(payload.get("brief"), dict) else {}
    if not brief:
        errors.append(issue("BRIEF", "$.brief", "brief must be an object."))
    source_values = brief.get("source_refs")
    source_refs = {value for value in source_values if isinstance(value, str) and value.strip()} if isinstance(source_values, list) else set()
    sample_values = brief.get("sample_refs")
    sample_refs = {value for value in sample_values if isinstance(value, str) and value.strip()} if isinstance(sample_values, list) else set()
    engine_values = brief.get("engines")
    engines = {value for value in engine_values if isinstance(value, str) and value.strip()} if isinstance(engine_values, list) else set()
    if not source_refs:
        errors.append(issue("SOURCE_BOUNDARY", "$.brief.source_refs", "At least one stable source reference is required."))
    if not engines:
        errors.append(issue("ENGINES", "$.brief.engines", "At least one named answer engine or surface is required."))
    if not str(brief.get("research_pack_ref") or "").strip():
        errors.append(issue("RESEARCH_PACK_REF", "$.brief.research_pack_ref", "Cuebook GEO requires a ResearchPackV1 reference."))
    if brief.get("personalized_advice_allowed") is not False:
        errors.append(issue("ADVICE_BOUNDARY", "$.brief.personalized_advice_allowed", "Personalized investment advice must remain disabled."))
    if brief.get("target_url") is not None and not public_http_url(brief.get("target_url")):
        errors.append(issue("URL_SAFETY", "$.brief.target_url", "target_url must be a public HTTP(S) URL."))
    if mode == "preflight" and not str(brief.get("artifact_ref") or "").strip():
        errors.append(issue("ARTIFACT_REF", "$.brief.artifact_ref", "preflight mode requires a final artifact reference."))

    temporal_mode = brief.get("temporal_mode")
    as_of = parse_time(brief.get("as_of"))
    if brief.get("as_of") is not None and as_of is None:
        errors.append(issue("AS_OF", "$.brief.as_of", "as_of must be a parseable timestamp or null."))
    if temporal_mode in {"realtime", "historical_replay"} and as_of is None:
        blockers.append(issue("TEMPORAL_AS_OF", "$.brief.as_of", "Time-sensitive market knowledge requires as_of."))

    source_raw = payload.get("source_register")
    if not isinstance(source_raw, list) or not source_raw:
        errors.append(issue("SOURCE_REGISTER", "$.source_register", "source_register must be a non-empty array."))
        source_raw = []
    sources: dict[str, dict[str, Any]] = {}
    fact_ids: set[str] = set()
    for index, source in enumerate(source_raw):
        path = f"$.source_register[{index}]"
        if not isinstance(source, dict):
            errors.append(issue("SOURCE_TYPE", path, "Source record must be an object."))
            continue
        source_id = str(source.get("source_id") or "")
        if source_id in sources:
            errors.append(issue("DUPLICATE_SOURCE_ID", f"{path}.source_id", f"Duplicate source ID {source_id}."))
        sources[source_id] = source
        if source.get("source_ref") not in source_refs:
            errors.append(issue("UNKNOWN_SOURCE_REF", f"{path}.source_ref", "source_ref must be declared in brief.source_refs."))
        if not str(source.get("source_locator") or "").strip():
            errors.append(issue("SOURCE_LOCATOR", f"{path}.source_locator", "Every source needs a stable locator into the source or evidence artifact."))
        kind = source.get("kind")
        observed_at = parse_time(source.get("observed_at"))
        if source.get("observed_at") is not None and observed_at is None:
            errors.append(issue("SOURCE_TIME", f"{path}.observed_at", "observed_at must be parseable or null."))
        if kind in OBSERVED_SOURCE_KINDS and observed_at is None:
            errors.append(issue("OBSERVATION_TIME", f"{path}.observed_at", f"{kind} requires an observation timestamp."))
        source_facts = {value for value in source.get("fact_ids") or [] if isinstance(value, str) and value.strip()}
        if kind == "research_fact" and not source_facts:
            errors.append(issue("RESEARCH_FACT_IDS", f"{path}.fact_ids", "research_fact sources require upstream fact IDs."))
        if kind == "research_fact":
            fact_ids.update(source_facts)
            if temporal_mode == "realtime" and source.get("freshness") != "current":
                blockers.append(issue("STALE_REALTIME_FACT", f"{path}.freshness", "Realtime GEO units cannot rely on stale or unknown research facts."))
        if kind in SAMPLE_SOURCE_KINDS:
            evidence_ref = source.get("evidence_ref")
            if not evidence_ref or evidence_ref not in sample_refs:
                errors.append(issue("SAMPLE_EVIDENCE_REF", f"{path}.evidence_ref", "Platform sample sources require a declared raw sample reference."))

    def uncovered_facts(facts: set[str], source_ids: set[str]) -> set[str]:
        covered: set[str] = set()
        for source_id in source_ids:
            source = sources.get(source_id, {})
            if source.get("kind") == "research_fact":
                covered.update(source.get("fact_ids") or [])
        return facts - covered

    seo = payload.get("seo_eligibility") if isinstance(payload.get("seo_eligibility"), dict) else {}
    if seo.get("seo_pack_ref") != brief.get("seo_pack_ref"):
        errors.append(issue("SEO_PACK_REF", "$.seo_eligibility.seo_pack_ref", "SEO eligibility must reference the same SEO pack as brief."))
    if seo.get("state") == "pass" and not seo.get("seo_pack_ref"):
        errors.append(issue("SEO_PASS_PROVENANCE", "$.seo_eligibility.seo_pack_ref", "SEO pass requires a MarketSEOPackV1 reference."))
    if seo.get("state") == "blocked":
        blockers.append(issue("SEO_ELIGIBILITY_BLOCKED", "$.seo_eligibility.state", "Blocked normal search eligibility blocks GEO readiness."))

    graph = payload.get("entity_graph") if isinstance(payload.get("entity_graph"), dict) else {}
    entities_raw = graph.get("entities")
    if not isinstance(entities_raw, list) or not entities_raw:
        errors.append(issue("ENTITIES", "$.entity_graph.entities", "At least one canonical entity is required."))
        entities_raw = []
    entities: dict[str, dict[str, Any]] = {}
    for index, entity in enumerate(entities_raw):
        path = f"$.entity_graph.entities[{index}]"
        if not isinstance(entity, dict):
            errors.append(issue("ENTITY_TYPE", path, "Entity must be an object."))
            continue
        entity_id = str(entity.get("entity_id") or "")
        if entity_id in entities:
            errors.append(issue("DUPLICATE_ENTITY_ID", f"{path}.entity_id", f"Duplicate entity ID {entity_id}."))
        entities[entity_id] = entity
        entity_facts = set(entity.get("fact_ids") or [])
        entity_sources = set(entity.get("source_ids") or [])
        if not entity_facts or not entity_sources:
            errors.append(issue("ENTITY_EVIDENCE", path, "Every canonical entity requires fact and source IDs."))
        unknown_facts = entity_facts - fact_ids
        unknown_sources = entity_sources - set(sources)
        if unknown_facts:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(unknown_facts)}."))
        if unknown_sources:
            errors.append(issue("UNKNOWN_SOURCE_ID", f"{path}.source_ids", f"Unknown source IDs: {sorted(unknown_sources)}."))
        uncovered = uncovered_facts(entity_facts, entity_sources)
        if uncovered:
            errors.append(issue("FACT_SOURCE_MISMATCH", path, f"Entity fact IDs lack a referenced research source: {sorted(uncovered)}."))

    relations_raw = graph.get("relations")
    if not isinstance(relations_raw, list):
        errors.append(issue("RELATIONS", "$.entity_graph.relations", "relations must be an array."))
        relations_raw = []
    relation_ids: set[str] = set()
    for index, relation in enumerate(relations_raw):
        path = f"$.entity_graph.relations[{index}]"
        if not isinstance(relation, dict):
            errors.append(issue("RELATION_TYPE", path, "Relation must be an object."))
            continue
        relation_id = str(relation.get("relation_id") or "")
        if relation_id in relation_ids:
            errors.append(issue("DUPLICATE_RELATION_ID", f"{path}.relation_id", f"Duplicate relation ID {relation_id}."))
        relation_ids.add(relation_id)
        for field in ("subject_entity_id", "object_entity_id"):
            if relation.get(field) not in entities:
                errors.append(issue("RELATION_ENTITY_REF", f"{path}.{field}", "Relation endpoint does not exist."))
        relation_facts = set(relation.get("fact_ids") or [])
        relation_sources = set(relation.get("source_ids") or [])
        if relation.get("status") in {"verified", "derived"} and (not relation_facts or not relation_sources):
            errors.append(issue("RELATION_EVIDENCE", path, "Verified and derived relations require fact and source IDs."))
        if relation_facts - fact_ids:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(relation_facts - fact_ids)}."))
        if relation_sources - set(sources):
            errors.append(issue("UNKNOWN_SOURCE_ID", f"{path}.source_ids", f"Unknown source IDs: {sorted(relation_sources - set(sources))}."))
        uncovered = uncovered_facts(relation_facts, relation_sources)
        if uncovered and relation.get("status") in {"verified", "derived"}:
            errors.append(issue("FACT_SOURCE_MISMATCH", path, f"Relation fact IDs lack a referenced research source: {sorted(uncovered)}."))

    cards_raw = payload.get("fact_cards")
    if not isinstance(cards_raw, list) or not cards_raw:
        errors.append(issue("FACT_CARDS", "$.fact_cards", "At least one fact card is required."))
        cards_raw = []
    card_ids: set[str] = set()
    for index, card in enumerate(cards_raw):
        path = f"$.fact_cards[{index}]"
        if not isinstance(card, dict):
            errors.append(issue("FACT_CARD_TYPE", path, "Fact card must be an object."))
            continue
        card_id = str(card.get("card_id") or "")
        if card_id in card_ids:
            errors.append(issue("DUPLICATE_FACT_CARD_ID", f"{path}.card_id", f"Duplicate fact-card ID {card_id}."))
        card_ids.add(card_id)
        card_facts = set(card.get("fact_ids") or [])
        card_sources = set(card.get("source_ids") or [])
        if not card_facts or not card_sources:
            errors.append(issue("FACT_CARD_EVIDENCE", path, "Every fact card requires fact and source IDs."))
        if card_facts - fact_ids:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(card_facts - fact_ids)}."))
        if card_sources - set(sources):
            errors.append(issue("UNKNOWN_SOURCE_ID", f"{path}.source_ids", f"Unknown source IDs: {sorted(card_sources - set(sources))}."))
        uncovered = uncovered_facts(card_facts, card_sources)
        if uncovered:
            errors.append(issue("FACT_SOURCE_MISMATCH", path, f"Fact-card IDs lack a referenced research source: {sorted(uncovered)}."))
        if card.get("as_of") is not None and parse_time(card.get("as_of")) is None:
            errors.append(issue("FACT_CARD_TIME", f"{path}.as_of", "Fact-card as_of must be parseable or null."))
        expected_scope = {"realtime": "current_as_of", "historical_replay": "historical_replay", "evergreen": "evergreen"}.get(temporal_mode)
        if expected_scope and card.get("temporal_scope") != expected_scope:
            errors.append(issue("FACT_CARD_TEMPORAL_SCOPE", f"{path}.temporal_scope", f"{temporal_mode} requires {expected_scope}."))
        if temporal_mode == "realtime" and (parse_time(card.get("as_of")) is None or card.get("freshness") != "current"):
            blockers.append(issue("CURRENT_FACT_CARD", path, "Realtime fact cards require current freshness and as_of."))

    questions_raw = payload.get("question_map")
    if not isinstance(questions_raw, list) or not questions_raw:
        errors.append(issue("QUESTION_MAP", "$.question_map", "At least one question is required."))
        questions_raw = []
    questions: dict[str, dict[str, Any]] = {}
    for index, question in enumerate(questions_raw):
        path = f"$.question_map[{index}]"
        if not isinstance(question, dict):
            errors.append(issue("QUESTION_TYPE", path, "Question must be an object."))
            continue
        question_id = str(question.get("question_id") or "")
        if question_id in questions:
            errors.append(issue("DUPLICATE_QUESTION_ID", f"{path}.question_id", f"Duplicate question ID {question_id}."))
        questions[question_id] = question
        required_facts = set(question.get("required_fact_ids") or [])
        if question.get("status") in {"observed", "derived"} and not required_facts:
            errors.append(issue("QUESTION_FACTS", f"{path}.required_fact_ids", "Observed and derived questions require fact IDs."))
        if required_facts - fact_ids:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.required_fact_ids", f"Unknown fact IDs: {sorted(required_facts - fact_ids)}."))

    units_raw = payload.get("answer_units")
    if not isinstance(units_raw, list) or not units_raw:
        errors.append(issue("ANSWER_UNITS", "$.answer_units", "At least one answer unit is required."))
        units_raw = []
    unit_ids: set[str] = set()
    for index, unit in enumerate(units_raw):
        path = f"$.answer_units[{index}]"
        if not isinstance(unit, dict):
            errors.append(issue("ANSWER_UNIT_TYPE", path, "Answer unit must be an object."))
            continue
        unit_id = str(unit.get("unit_id") or "")
        if unit_id in unit_ids:
            errors.append(issue("DUPLICATE_ANSWER_UNIT_ID", f"{path}.unit_id", f"Duplicate answer-unit ID {unit_id}."))
        unit_ids.add(unit_id)
        question_refs = set(unit.get("question_ids") or [])
        unit_facts = set(unit.get("fact_ids") or [])
        unit_sources = set(unit.get("source_ids") or [])
        if not unit_facts or not unit_sources:
            errors.append(issue("ANSWER_UNIT_EVIDENCE", path, "Every answer unit requires fact and source IDs."))
        if question_refs - set(questions):
            errors.append(issue("ANSWER_UNIT_QUESTION_REF", f"{path}.question_ids", f"Unknown question IDs: {sorted(question_refs - set(questions))}."))
        if unit_facts - fact_ids:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(unit_facts - fact_ids)}."))
        if unit_sources - set(sources):
            errors.append(issue("UNKNOWN_SOURCE_ID", f"{path}.source_ids", f"Unknown source IDs: {sorted(unit_sources - set(sources))}."))
        uncovered = uncovered_facts(unit_facts, unit_sources)
        if uncovered:
            errors.append(issue("FACT_SOURCE_MISMATCH", path, f"Answer-unit fact IDs lack a referenced research source: {sorted(uncovered)}."))
        expected_label = {"realtime": "current_as_of", "historical_replay": "historical_replay", "evergreen": "evergreen"}.get(temporal_mode)
        if expected_label and unit.get("temporal_label") != expected_label:
            errors.append(issue("ANSWER_UNIT_TEMPORAL_LABEL", f"{path}.temporal_label", f"{temporal_mode} requires {expected_label}."))

    citations_raw = payload.get("citation_map")
    if not isinstance(citations_raw, list) or not citations_raw:
        errors.append(issue("CITATION_MAP", "$.citation_map", "At least one citation-support record is required."))
        citations_raw = []
    citations: dict[str, dict[str, Any]] = {}
    partial_citation = False
    for index, citation in enumerate(citations_raw):
        path = f"$.citation_map[{index}]"
        if not isinstance(citation, dict):
            errors.append(issue("CITATION_TYPE", path, "Citation record must be an object."))
            continue
        citation_id = str(citation.get("citation_id") or "")
        if citation_id in citations:
            errors.append(issue("DUPLICATE_CITATION_ID", f"{path}.citation_id", f"Duplicate citation ID {citation_id}."))
        citations[citation_id] = citation
        citation_facts = set(citation.get("fact_ids") or [])
        citation_sources = set(citation.get("source_ids") or [])
        if citation.get("support") in {"direct", "partial"} and (not citation_facts or not citation_sources):
            errors.append(issue("CITATION_EVIDENCE", path, "Direct and partial support require fact and source IDs."))
        if citation_facts - fact_ids:
            errors.append(issue("UNKNOWN_FACT_REF", f"{path}.fact_ids", f"Unknown fact IDs: {sorted(citation_facts - fact_ids)}."))
        if citation_sources - set(sources):
            errors.append(issue("UNKNOWN_SOURCE_ID", f"{path}.source_ids", f"Unknown source IDs: {sorted(citation_sources - set(sources))}."))
        uncovered = uncovered_facts(citation_facts, citation_sources)
        if uncovered and citation.get("support") in {"direct", "partial"}:
            errors.append(issue("FACT_SOURCE_MISMATCH", path, f"Citation fact IDs lack a referenced research source: {sorted(uncovered)}."))
        if citation.get("support") == "partial":
            partial_citation = True
        if citation.get("support") == "unsupported":
            blockers.append(issue("UNSUPPORTED_CITATION", path, "Unsupported public claim blocks readiness."))

    crawler_raw = payload.get("crawler_access")
    if not isinstance(crawler_raw, list):
        errors.append(issue("CRAWLER_ACCESS", "$.crawler_access", "crawler_access must be an array."))
        crawler_raw = []
    crawler_keys: set[tuple[str, str]] = set()
    engine_policies: dict[str, list[str]] = {engine: [] for engine in engines}
    for index, crawler in enumerate(crawler_raw):
        path = f"$.crawler_access[{index}]"
        if not isinstance(crawler, dict):
            errors.append(issue("CRAWLER_TYPE", path, "Crawler record must be an object."))
            continue
        engine = str(crawler.get("engine") or "")
        key = (engine, str(crawler.get("crawler") or ""))
        if key in crawler_keys:
            errors.append(issue("DUPLICATE_CRAWLER", path, f"Duplicate crawler record {key}."))
        crawler_keys.add(key)
        if engine not in engines:
            errors.append(issue("CRAWLER_ENGINE_SCOPE", f"{path}.engine", "Crawler engine is outside brief.engines."))
        else:
            engine_policies[engine].append(str(crawler.get("policy") or ""))
        policy = crawler.get("policy")
        if policy != "unknown":
            if parse_time(crawler.get("checked_at")) is None:
                errors.append(issue("CRAWLER_CHECK_TIME", f"{path}.checked_at", "Observed crawler policy requires a timestamp."))
            if not public_http_url(crawler.get("official_source_url")):
                errors.append(issue("CRAWLER_OFFICIAL_SOURCE", f"{path}.official_source_url", "Observed crawler policy requires a public official source URL."))
            if crawler.get("observed_source_id") not in sources:
                errors.append(issue("CRAWLER_SOURCE_REF", f"{path}.observed_source_id", "Observed crawler policy requires a source-register reference."))
    crawler_unknown = False
    for engine, policies in engine_policies.items():
        if not policies or ("allowed" not in policies and "not_applicable" not in policies):
            if policies and all(policy == "blocked" for policy in policies):
                blockers.append(issue("CRAWLER_BLOCKED", "$.crawler_access", f"All recorded retrieval paths for {engine} are blocked."))
            else:
                crawler_unknown = True

    measurement = payload.get("measurement_plan") if isinstance(payload.get("measurement_plan"), dict) else {}
    prompts_raw = measurement.get("prompts")
    if not isinstance(prompts_raw, list):
        errors.append(issue("PROMPTS", "$.measurement_plan.prompts", "prompts must be an array."))
        prompts_raw = []
    if mode in {"monitor_plan", "sample_review"} and not prompts_raw:
        errors.append(issue("MONITOR_PROMPTS", "$.measurement_plan.prompts", f"{mode} requires versioned prompts."))
    prompts: dict[str, dict[str, Any]] = {}
    for index, prompt in enumerate(prompts_raw):
        path = f"$.measurement_plan.prompts[{index}]"
        if not isinstance(prompt, dict):
            errors.append(issue("PROMPT_TYPE", path, "Prompt must be an object."))
            continue
        prompt_id = str(prompt.get("prompt_id") or "")
        if prompt_id in prompts:
            errors.append(issue("DUPLICATE_PROMPT_ID", f"{path}.prompt_id", f"Duplicate prompt ID {prompt_id}."))
        prompts[prompt_id] = prompt
        if prompt.get("engine") not in engines:
            errors.append(issue("PROMPT_ENGINE_SCOPE", f"{path}.engine", "Prompt engine is outside brief.engines."))
        if prompt.get("question_id") not in questions:
            errors.append(issue("PROMPT_QUESTION_REF", f"{path}.question_id", "Prompt question does not exist."))
    if mode in {"monitor_plan", "sample_review"}:
        missing_fields = REQUIRED_SAMPLE_FIELDS - set(measurement.get("required_sample_fields") or [])
        if missing_fields:
            errors.append(issue("SAMPLE_FIELDS", "$.measurement_plan.required_sample_fields", f"Missing required sample fields: {sorted(missing_fields)}."))

    observations_raw = payload.get("observations")
    if not isinstance(observations_raw, list):
        errors.append(issue("OBSERVATIONS", "$.observations", "observations must be an array."))
        observations_raw = []
    if mode != "sample_review" and observations_raw:
        errors.append(issue("OBSERVATION_MODE", "$.observations", "Only sample_review may contain observations."))
    if mode == "sample_review" and not observations_raw:
        blockers.append(issue("SAMPLES_MISSING", "$.observations", "sample_review requires supplied sample observations."))
    observations: dict[str, dict[str, Any]] = {}
    structurally_valid_samples = 0
    synthetic_seen = False
    for index, observation in enumerate(observations_raw):
        path = f"$.observations[{index}]"
        if not isinstance(observation, dict):
            errors.append(issue("OBSERVATION_TYPE", path, "Observation must be an object."))
            continue
        observation_id = str(observation.get("observation_id") or "")
        if observation_id in observations:
            errors.append(issue("DUPLICATE_OBSERVATION_ID", f"{path}.observation_id", f"Duplicate observation ID {observation_id}."))
        observations[observation_id] = observation
        local_valid = True
        if observation.get("engine") not in engines:
            errors.append(issue("OBSERVATION_ENGINE_SCOPE", f"{path}.engine", "Observation engine is outside brief.engines."))
            local_valid = False
        if observation.get("prompt_id") not in prompts:
            errors.append(issue("OBSERVATION_PROMPT_REF", f"{path}.prompt_id", "Observation prompt does not exist."))
            local_valid = False
        if parse_time(observation.get("sampled_at")) is None:
            errors.append(issue("OBSERVATION_TIME", f"{path}.sampled_at", "Observation sampled_at must be parseable."))
            local_valid = False
        if observation.get("raw_evidence_ref") not in sample_refs:
            errors.append(issue("OBSERVATION_RAW_EVIDENCE", f"{path}.raw_evidence_ref", "Observation requires a declared raw sample reference."))
            local_valid = False
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(observation.get("answer_hash") or "")):
            errors.append(issue("ANSWER_HASH", f"{path}.answer_hash", "answer_hash must be SHA-256."))
            local_valid = False
        unknown_entities = set(observation.get("mentioned_entity_ids") or []) - set(entities)
        if unknown_entities:
            errors.append(issue("OBSERVATION_ENTITY_REF", f"{path}.mentioned_entity_ids", f"Unknown entity IDs: {sorted(unknown_entities)}."))
            local_valid = False
        unknown_citations = set(observation.get("evaluated_citation_ids") or []) - set(citations)
        if unknown_citations:
            errors.append(issue("OBSERVATION_CITATION_REF", f"{path}.evaluated_citation_ids", f"Unknown citation IDs: {sorted(unknown_citations)}."))
            local_valid = False
        for url_index, url in enumerate(observation.get("citation_urls") or []):
            if not public_http_url(url):
                errors.append(issue("CITATION_URL", f"{path}.citation_urls[{url_index}]", "Citation URL must be public HTTP(S)."))
                local_valid = False
        if observation.get("review_state") != "manual_verified":
            local_valid = False
        if observation.get("sample_mode") == "synthetic_replay":
            synthetic_seen = True
        if local_valid:
            structurally_valid_samples += 1

    summary = payload.get("sample_summary") if isinstance(payload.get("sample_summary"), dict) else {}
    total_samples = len(observations_raw)
    invalid_samples = total_samples - structurally_valid_samples
    if summary.get("total_samples") != total_samples:
        errors.append(issue("SAMPLE_TOTAL", "$.sample_summary.total_samples", f"Expected {total_samples}."))
    if summary.get("valid_samples") != structurally_valid_samples:
        errors.append(issue("SAMPLE_VALID", "$.sample_summary.valid_samples", f"Expected {structurally_valid_samples}."))
    if summary.get("invalid_samples") != invalid_samples:
        errors.append(issue("SAMPLE_INVALID", "$.sample_summary.invalid_samples", f"Expected {invalid_samples}."))
    metric_ids: set[str] = set()
    for index, metric in enumerate(summary.get("metrics") or []):
        path = f"$.sample_summary.metrics[{index}]"
        if not isinstance(metric, dict):
            errors.append(issue("METRIC_TYPE", path, "Sample metric must be an object."))
            continue
        metric_id = str(metric.get("metric_id") or "")
        if metric_id in metric_ids:
            errors.append(issue("DUPLICATE_METRIC_ID", f"{path}.metric_id", f"Duplicate metric ID {metric_id}."))
        metric_ids.add(metric_id)
        numerator = metric.get("numerator")
        denominator = metric.get("denominator")
        value = metric.get("value")
        if not isinstance(numerator, int) or not isinstance(denominator, int) or numerator < 0 or denominator < 0:
            errors.append(issue("METRIC_COUNTS", path, "Metric numerator and denominator must be non-negative integers."))
            continue
        if numerator > denominator or denominator > structurally_valid_samples:
            errors.append(issue("METRIC_DENOMINATOR", path, "Require numerator <= denominator <= valid_samples."))
        expected_value = None if denominator == 0 else numerator / denominator
        if expected_value is None and value is not None:
            errors.append(issue("METRIC_VALUE", f"{path}.value", "Zero denominator requires null value."))
        if expected_value is not None and (not isinstance(value, (int, float)) or not math.isclose(float(value), expected_value, rel_tol=1e-9, abs_tol=1e-9)):
            errors.append(issue("METRIC_VALUE", f"{path}.value", f"Expected numerator/denominator = {expected_value}."))

    issues_raw = payload.get("issues")
    if not isinstance(issues_raw, list):
        errors.append(issue("ISSUES", "$.issues", "issues must be an array."))
        issues_raw = []
    issue_ids: set[str] = set()
    for index, finding in enumerate(issues_raw):
        path = f"$.issues[{index}]"
        if not isinstance(finding, dict):
            errors.append(issue("ISSUE_TYPE", path, "Issue must be an object."))
            continue
        issue_id = str(finding.get("issue_id") or "")
        if issue_id in issue_ids:
            errors.append(issue("DUPLICATE_ISSUE_ID", f"{path}.issue_id", f"Duplicate issue ID {issue_id}."))
        issue_ids.add(issue_id)
        unknown_sources = set(finding.get("evidence_source_ids") or []) - set(sources)
        if unknown_sources:
            errors.append(issue("ISSUE_SOURCE_REF", f"{path}.evidence_source_ids", f"Unknown source IDs: {sorted(unknown_sources)}."))
        if finding.get("severity") == "block":
            blockers.append(issue("BLOCKING_ISSUE", path, str(finding.get("action") or "Blocking GEO issue.")))

    quality = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    upstream_state = quality.get("upstream_research_state")
    sample_integrity = quality.get("sample_integrity")
    hard_failures = quality.get("hard_failures") if isinstance(quality.get("hard_failures"), list) else []
    unknowns = quality.get("unknowns") if isinstance(quality.get("unknowns"), list) else []
    if total_samples == 0:
        computed_integrity = "no_samples"
    elif synthetic_seen and all(observation.get("sample_mode") == "synthetic_replay" for observation in observations_raw if isinstance(observation, dict)):
        computed_integrity = "synthetic_only"
    elif structurally_valid_samples == total_samples:
        computed_integrity = "verified"
    elif structurally_valid_samples > 0:
        computed_integrity = "partial"
    else:
        computed_integrity = "invalid"
    if sample_integrity != computed_integrity:
        errors.append(issue("SAMPLE_INTEGRITY", "$.quality_report.sample_integrity", f"Observations compute to {computed_integrity}."))
    if upstream_state == "blocked":
        blockers.append(issue("UPSTREAM_RESEARCH_BLOCKED", "$.quality_report.upstream_research_state", "Blocked research cannot produce a ready GEO pack."))
    if mode == "sample_review" and computed_integrity == "invalid":
        blockers.append(issue("INVALID_SAMPLES", "$.quality_report.sample_integrity", "No valid reviewed sample remains."))
    for index, failure in enumerate(hard_failures):
        blockers.append(issue("HARD_FAILURE", f"$.quality_report.hard_failures[{index}]", str(failure)))

    conditional = False
    if mode in {"plan", "monitor_plan"}:
        conditional = True
    if seo.get("state") != "pass":
        conditional = True
    if crawler_unknown or partial_citation:
        conditional = True
    if upstream_state == "conditional" or unknowns:
        conditional = True
    if computed_integrity in {"partial", "synthetic_only"}:
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
    parser = argparse.ArgumentParser(description="Validate MarketGEOPackV1 artifacts")
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
