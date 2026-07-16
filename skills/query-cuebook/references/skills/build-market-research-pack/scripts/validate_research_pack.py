#!/usr/bin/env python3
"""Validate deterministic ResearchPackV1 invariants and cross-references."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


REQUIRED_ROOT = {
    "schema_version",
    "brief",
    "source_register",
    "fact_ledger",
    "comparator_table",
    "market_context",
    "thesis",
    "scenarios",
    "catalysts",
    "gaps",
    "quality_report",
}
DECISION_USES = {"public_content", "investment_research", "trade_watch", "risk_review"}
EVIDENCE_CLASSES = {"source", "verified-live", "derived", "hypothesis"}
FRESHNESS = {"current", "stale", "unknown"}
CONFIDENCE = {"low", "medium", "high"}
STANCES = {"positive", "negative", "mixed", "watch", "no-view"}
ACCESS = {"public", "authorized"}
DATA_FRESHNESS = {"current", "stale", "mixed", "unknown"}
SOURCE_TYPES = {
    "official_filing",
    "company_release",
    "official_data",
    "exchange",
    "market_data",
    "consensus_data",
    "transcript",
    "reputable_news",
    "specialist_research",
    "social",
    "user_supplied",
}
PRIMARY_SOURCE_TYPES = {
    "official_filing",
    "company_release",
    "official_data",
    "exchange",
    "transcript",
}
LIVE_SOURCE_TYPES = {"market_data", "exchange", "official_data", "consensus_data"}
EVENT_ANCHOR_SOURCE_TYPES = {"company_release", "reputable_news"}
CONTEXT_SECTIONS = {"price_reaction", "positioning", "liquidity", "valuation"}
VALUATION_VALUE_STATES = {"numeric", "N/M"}
VALUATION_COMPARABILITY = {"comparable", "not_comparable", "not_applicable"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_datetime(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def is_public_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def add_bad_refs(
    errors: list[dict[str, str]],
    refs: Any,
    allowed: set[str],
    path: str,
    kind: str,
) -> None:
    if not isinstance(refs, list):
        errors.append(issue(f"{kind}_REFS_TYPE", path, f"{kind.lower()} references must be an array."))
        return
    for ref in refs:
        if not isinstance(ref, str) or ref not in allowed:
            errors.append(issue(f"UNKNOWN_{kind}_REF", path, f"Unknown {kind.lower()} reference: {ref!r}."))


def validate(item: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(item, dict):
        return {
            "valid": False,
            "errors": [issue("ROOT_TYPE", "$", "ResearchPackV1 must be an object.")],
            "warnings": [],
        }

    for key in sorted(REQUIRED_ROOT - set(item)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(item) - REQUIRED_ROOT):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if item.get("schema_version") != "research-pack-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected research-pack-v1."))

    brief = item.get("brief")
    if not isinstance(brief, dict):
        errors.append(issue("BRIEF_TYPE", "$.brief", "brief must be an object."))
        brief = {}
    if brief.get("decision_use") not in DECISION_USES:
        errors.append(issue("DECISION_USE", "$.brief.decision_use", "Unsupported decision use."))
    for key in ("subject", "question", "horizon", "as_of", "freshness_window"):
        if not str(brief.get(key) or "").strip():
            errors.append(issue("BRIEF_FIELD", f"$.brief.{key}", f"{key} is required."))
    if not isinstance(brief.get("assets"), list):
        errors.append(issue("ASSETS_TYPE", "$.brief.assets", "assets must be an array."))

    sources = item.get("source_register")
    if not isinstance(sources, list):
        errors.append(issue("SOURCE_REGISTER_TYPE", "$.source_register", "source_register must be an array."))
        sources = []
    source_ids: set[str] = set()
    source_types: dict[str, str] = {}
    publishers: set[str] = set()
    source_fact_refs: list[tuple[str, str, Any, bool]] = []
    for index, source in enumerate(sources):
        path = f"$.source_register[{index}]"
        if not isinstance(source, dict):
            errors.append(issue("SOURCE_TYPE", path, "Source entry must be an object."))
            continue
        source_id = str(source.get("id") or "").strip()
        if not source_id:
            errors.append(issue("SOURCE_ID", f"{path}.id", "Source ID is required."))
        elif source_id in source_ids:
            errors.append(issue("DUPLICATE_SOURCE_ID", f"{path}.id", f"Duplicate source ID {source_id}."))
        source_ids.add(source_id)
        source_type = str(source.get("source_type") or "")
        source_types[source_id] = source_type
        publisher = str(source.get("publisher") or "").strip().lower()
        if publisher:
            publishers.add(publisher)
        for key in ("publisher", "source_type", "observed_at", "access"):
            if not str(source.get(key) or "").strip():
                errors.append(issue("SOURCE_FIELD", f"{path}.{key}", f"{key} is required."))
        if not str(source.get("url") or "").strip() and not str(source.get("locator") or "").strip():
            errors.append(issue("SOURCE_LOCATOR", path, "Source requires a URL or an authorized locator."))
        if source_type and source_type not in SOURCE_TYPES:
            errors.append(issue("SOURCE_TYPE_VALUE", f"{path}.source_type", "Unsupported source type."))
        access = source.get("access")
        if access and access not in ACCESS:
            errors.append(issue("SOURCE_ACCESS", f"{path}.access", "Unsupported access boundary."))
        title = source.get("title")
        if title is not None and not is_nonempty_string(title):
            errors.append(issue("SOURCE_TITLE", f"{path}.title", "Source title must be non-empty when supplied."))
        is_event_anchor = source_type in EVENT_ANCHOR_SOURCE_TYPES
        if is_event_anchor:
            if not is_nonempty_string(title):
                errors.append(issue("EVENT_ANCHOR_TITLE", f"{path}.title", "News and company-release anchors require a title."))
            if not is_public_http_url(source.get("url")):
                errors.append(issue("EVENT_ANCHOR_URL", f"{path}.url", "News and company-release anchors require a public HTTP(S) URL."))
            if access != "public":
                errors.append(issue("EVENT_ANCHOR_ACCESS", f"{path}.access", "News and company-release anchors must be public."))
            if not is_nonempty_string(source.get("publisher")):
                errors.append(issue("EVENT_ANCHOR_PUBLISHER", f"{path}.publisher", "News and company-release anchors require a publisher."))
            if not is_datetime(source.get("published_at")):
                errors.append(issue("EVENT_ANCHOR_PUBLISHED_AT", f"{path}.published_at", "News and company-release anchors require an ISO date-time published_at."))
            fact_refs = source.get("fact_refs")
            if not isinstance(fact_refs, list) or not strings(fact_refs):
                errors.append(issue("EVENT_ANCHOR_FACT_REFS", f"{path}.fact_refs", "News and company-release anchors require fact refs."))
            elif len(fact_refs) != len(set(strings(fact_refs))) or len(strings(fact_refs)) != len(fact_refs):
                errors.append(issue("EVENT_ANCHOR_FACT_REFS", f"{path}.fact_refs", "Anchor fact refs must be unique non-empty strings."))
        if is_event_anchor or "fact_refs" in source:
            source_fact_refs.append((path, source_id, source.get("fact_refs"), is_event_anchor))

    facts = item.get("fact_ledger")
    if not isinstance(facts, list):
        errors.append(issue("FACT_LEDGER_TYPE", "$.fact_ledger", "fact_ledger must be an array."))
        facts = []
    fact_ids: set[str] = set()
    fact_classes: dict[str, str] = {}
    fact_freshness: set[str] = set()
    fact_source_ids: dict[str, set[str]] = {}
    for index, fact in enumerate(facts):
        path = f"$.fact_ledger[{index}]"
        if not isinstance(fact, dict):
            errors.append(issue("FACT_TYPE", path, "Fact entry must be an object."))
            continue
        fact_id = str(fact.get("id") or "").strip()
        if not fact_id:
            errors.append(issue("FACT_ID", f"{path}.id", "Fact ID is required."))
        elif fact_id in fact_ids:
            errors.append(issue("DUPLICATE_FACT_ID", f"{path}.id", f"Duplicate fact ID {fact_id}."))
        fact_ids.add(fact_id)
        evidence_class = fact.get("evidence_class")
        fact_classes[fact_id] = str(evidence_class or "")
        if evidence_class not in EVIDENCE_CLASSES:
            errors.append(issue("EVIDENCE_CLASS", f"{path}.evidence_class", "Unsupported evidence class."))
        if fact.get("freshness") not in FRESHNESS:
            errors.append(issue("FRESHNESS", f"{path}.freshness", "Unsupported freshness state."))
        else:
            fact_freshness.add(fact["freshness"])
        if fact.get("confidence") not in CONFIDENCE:
            errors.append(issue("FACT_CONFIDENCE", f"{path}.confidence", "Unsupported fact confidence."))
        if not str(fact.get("claim") or "").strip():
            errors.append(issue("FACT_CLAIM", f"{path}.claim", "Fact claim is required."))
        refs = fact.get("source_ids")
        fact_source_ids[fact_id] = set(strings(refs))
        add_bad_refs(errors, refs, source_ids, f"{path}.source_ids", "SOURCE")
        if evidence_class in {"source", "verified-live"} and not strings(refs):
            errors.append(issue("FACT_SOURCE_REQUIRED", f"{path}.source_ids", "Source and live facts require a source."))
        if (evidence_class == "verified-live" or fact.get("freshness") == "current") and not fact.get("as_of"):
            errors.append(issue("FACT_TIMESTAMP_REQUIRED", f"{path}.as_of", "Current and live facts require as_of."))
        if evidence_class == "verified-live" and strings(refs):
            if not any(source_types.get(ref) in LIVE_SOURCE_TYPES for ref in refs):
                warnings.append(issue("LIVE_SOURCE_CLASS", f"{path}.source_ids", "Live fact lacks a market, exchange, official, or consensus data source."))
        if evidence_class in {"derived", "hypothesis"} and not strings(refs):
            warnings.append(issue("UNGROUNDED_INFERENCE", f"{path}.source_ids", "Inference has no registered source inputs."))

    for source_path, source_id, refs, is_event_anchor in source_fact_refs:
        ref_path = f"{source_path}.fact_refs"
        add_bad_refs(errors, refs, fact_ids, ref_path, "FACT")
        if is_event_anchor:
            for ref in strings(refs):
                if source_id not in fact_source_ids.get(ref, set()):
                    errors.append(issue("EVENT_ANCHOR_FACT_LINK", ref_path, f"Fact {ref!r} does not cite source {source_id!r}."))

    comparators = item.get("comparator_table")
    if not isinstance(comparators, list):
        errors.append(issue("COMPARATOR_TYPE", "$.comparator_table", "comparator_table must be an array."))
        comparators = []
    for index, comparator in enumerate(comparators):
        path = f"$.comparator_table[{index}]"
        if not isinstance(comparator, dict):
            errors.append(issue("COMPARATOR_ENTRY", path, "Comparator must be an object."))
            continue
        evidence_ids = comparator.get("evidence_ids")
        add_bad_refs(errors, evidence_ids, fact_ids, f"{path}.evidence_ids", "FACT")
        value_evidence = comparator.get("value_evidence")
        all_value_refs: set[str] = set()
        if not isinstance(value_evidence, dict):
            errors.append(issue("COMPARATOR_VALUE_EVIDENCE", f"{path}.value_evidence", "Comparator requires value-level evidence."))
        else:
            for value_name in ("actual", "consensus", "prior"):
                refs = value_evidence.get(value_name)
                ref_path = f"{path}.value_evidence.{value_name}"
                add_bad_refs(errors, refs, fact_ids, ref_path, "FACT")
                valid_refs = strings(refs)
                all_value_refs.update(valid_refs)
                if comparator.get(value_name) is not None:
                    if not valid_refs:
                        errors.append(issue("COMPARATOR_VALUE_SOURCE", ref_path, f"Populated {value_name} requires evidence."))
                    elif any(fact_classes.get(ref) not in {"source", "verified-live"} for ref in valid_refs):
                        errors.append(issue("COMPARATOR_EVIDENCE_CLASS", ref_path, f"Populated {value_name} must use sourced or verified-live facts."))
                elif valid_refs:
                    warnings.append(issue("COMPARATOR_NULL_EVIDENCE", ref_path, f"Null {value_name} should not retain evidence references."))
        if set(strings(evidence_ids)) != all_value_refs:
            errors.append(issue("COMPARATOR_EVIDENCE_MISMATCH", f"{path}.evidence_ids", "Comparator evidence_ids must equal the union of value_evidence references."))
        values_present = sum(comparator.get(key) is not None for key in ("actual", "consensus", "prior"))
        if values_present < 2:
            warnings.append(issue("COMPARATOR_THIN", path, "Comparator has fewer than two populated reference values."))

    context = item.get("market_context")
    if not isinstance(context, dict):
        errors.append(issue("MARKET_CONTEXT_TYPE", "$.market_context", "market_context must be an object."))
        context = {}
    for section in sorted(CONTEXT_SECTIONS):
        entries = context.get(section)
        if not isinstance(entries, list):
            errors.append(issue("CONTEXT_SECTION", f"$.market_context.{section}", "Context section must be an array."))
            continue
        for index, entry in enumerate(entries):
            path = f"$.market_context.{section}[{index}]"
            if not isinstance(entry, dict):
                errors.append(issue("CONTEXT_ENTRY", path, "Market context entry must be an object."))
                continue
            add_bad_refs(errors, entry.get("evidence_ids"), fact_ids, f"{path}.evidence_ids", "FACT")
            if not entry.get("as_of"):
                errors.append(issue("CONTEXT_TIMESTAMP", f"{path}.as_of", "Market context requires as_of."))
            if not str(entry.get("data_delay") or "").strip():
                errors.append(issue("DATA_DELAY", f"{path}.data_delay", "Market context requires data_delay."))
            if section == "valuation":
                for key in (
                    "subject",
                    "label",
                    "unit",
                    "numerator",
                    "denominator",
                    "period",
                    "accounting_basis",
                    "currency_treatment",
                    "share_class",
                ):
                    if not is_nonempty_string(entry.get(key)):
                        errors.append(issue("VALUATION_FIELD", f"{path}.{key}", f"Valuation metric requires {key}."))
                if not is_datetime(entry.get("as_of")):
                    errors.append(issue("VALUATION_AS_OF", f"{path}.as_of", "Valuation metric requires an ISO date-time as_of."))
                value_state = entry.get("value_state")
                if value_state not in VALUATION_VALUE_STATES:
                    errors.append(issue("VALUATION_VALUE_STATE", f"{path}.value_state", "Valuation value_state must be numeric or N/M."))
                comparability = entry.get("comparability")
                if comparability not in VALUATION_COMPARABILITY:
                    errors.append(issue("VALUATION_COMPARABILITY", f"{path}.comparability", "Unsupported valuation comparability state."))
                source_refs = entry.get("source_refs")
                add_bad_refs(errors, source_refs, source_ids, f"{path}.source_refs", "SOURCE")
                if not strings(source_refs):
                    errors.append(issue("VALUATION_SOURCE_REQUIRED", f"{path}.source_refs", "Valuation metrics require source refs."))
                elif len(source_refs) != len(set(strings(source_refs))) or len(strings(source_refs)) != len(source_refs):
                    errors.append(issue("VALUATION_SOURCE_REFS", f"{path}.source_refs", "Valuation source refs must be unique non-empty strings."))
                if "not_meaningful_reason" not in entry:
                    errors.append(issue("VALUATION_NM_REASON", f"{path}.not_meaningful_reason", "Valuation metrics must carry not_meaningful_reason."))
                if "value" not in entry:
                    errors.append(issue("VALUATION_VALUE", f"{path}.value", "Valuation metrics must carry value, using null for N/M."))
                reason = entry.get("not_meaningful_reason")
                if value_state == "numeric":
                    if not is_finite_number(entry.get("value")):
                        errors.append(issue("VALUATION_NUMERIC_VALUE", f"{path}.value", "Numeric valuation state requires a finite number."))
                    if reason is not None:
                        errors.append(issue("VALUATION_NM_REASON", f"{path}.not_meaningful_reason", "Numeric valuation state requires a null N/M reason."))
                elif value_state == "N/M":
                    if entry.get("value") is not None:
                        errors.append(issue("VALUATION_NM_VALUE", f"{path}.value", "N/M valuation state requires a null numeric value."))
                    if not is_nonempty_string(reason):
                        errors.append(issue("VALUATION_NM_REASON", f"{path}.not_meaningful_reason", "N/M valuation state requires a reason."))
                    if comparability == "comparable":
                        errors.append(issue("VALUATION_NM_COMPARABILITY", f"{path}.comparability", "An N/M metric cannot be marked comparable."))

    thesis = item.get("thesis")
    if not isinstance(thesis, dict):
        errors.append(issue("THESIS_TYPE", "$.thesis", "thesis must be an object."))
        thesis = {}
    for key in ("claim", "horizon", "invalidation"):
        if not str(thesis.get(key) or "").strip():
            errors.append(issue("THESIS_FIELD", f"$.thesis.{key}", f"{key} is required."))
    if thesis.get("stance") not in STANCES:
        errors.append(issue("THESIS_STANCE", "$.thesis.stance", "Unsupported thesis stance."))
    if thesis.get("confidence") not in CONFIDENCE:
        errors.append(issue("THESIS_CONFIDENCE", "$.thesis.confidence", "Unsupported thesis confidence."))
    add_bad_refs(errors, thesis.get("evidence_ids"), fact_ids, "$.thesis.evidence_ids", "FACT")
    add_bad_refs(errors, thesis.get("counterevidence_ids"), fact_ids, "$.thesis.counterevidence_ids", "FACT")
    mechanisms = thesis.get("mechanisms")
    if not isinstance(mechanisms, list):
        errors.append(issue("MECHANISMS_TYPE", "$.thesis.mechanisms", "mechanisms must be an array."))
    else:
        for index, mechanism in enumerate(mechanisms):
            path = f"$.thesis.mechanisms[{index}]"
            if not isinstance(mechanism, dict):
                errors.append(issue("MECHANISM_ENTRY", path, "Mechanism must be an object."))
                continue
            add_bad_refs(errors, mechanism.get("evidence_ids"), fact_ids, f"{path}.evidence_ids", "FACT")

    scenarios = item.get("scenarios")
    if not isinstance(scenarios, list):
        errors.append(issue("SCENARIOS_TYPE", "$.scenarios", "scenarios must be an array."))
        scenarios = []
    for index, scenario in enumerate(scenarios):
        path = f"$.scenarios[{index}]"
        if not isinstance(scenario, dict):
            errors.append(issue("SCENARIO_ENTRY", path, "Scenario must be an object."))
            continue
        add_bad_refs(errors, scenario.get("evidence_ids"), fact_ids, f"{path}.evidence_ids", "FACT")
        if not str(scenario.get("invalidation") or "").strip():
            errors.append(issue("SCENARIO_INVALIDATION", f"{path}.invalidation", "Scenario requires invalidation."))

    catalysts = item.get("catalysts")
    if not isinstance(catalysts, list):
        errors.append(issue("CATALYSTS_TYPE", "$.catalysts", "catalysts must be an array."))
    else:
        for index, catalyst in enumerate(catalysts):
            path = f"$.catalysts[{index}]"
            if not isinstance(catalyst, dict):
                errors.append(issue("CATALYST_ENTRY", path, "Catalyst must be an object."))
                continue
            add_bad_refs(errors, catalyst.get("evidence_ids"), fact_ids, f"{path}.evidence_ids", "FACT")

    quality = item.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."))
        quality = {}
    decision = quality.get("decision")
    if decision not in {"ready", "conditional", "blocked"}:
        errors.append(issue("QUALITY_DECISION", "$.quality_report.decision", "Unsupported quality decision."))
    if quality.get("data_freshness") not in DATA_FRESHNESS:
        errors.append(issue("QUALITY_FRESHNESS", "$.quality_report.data_freshness", "Unsupported data freshness."))
    hard_failures = strings(quality.get("hard_failures"))
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.quality_report", "Hard failures require a blocked decision."))
    if decision == "ready" and (not sources or not facts):
        errors.append(issue("READY_WITHOUT_EVIDENCE", "$.quality_report.decision", "Ready packs require sources and facts."))
    if decision == "ready" and not any(
        fact_classes.get(ref) in {"source", "verified-live"} for ref in strings(thesis.get("evidence_ids"))
    ):
        errors.append(issue("READY_WITHOUT_SOURCED_THESIS", "$.thesis.evidence_ids", "A ready thesis requires sourced or verified-live evidence."))
    if decision == "ready" and thesis.get("stance") in {"positive", "negative", "mixed"}:
        if not strings(thesis.get("counterevidence_ids")):
            errors.append(issue("READY_WITHOUT_COUNTEREVIDENCE", "$.thesis.counterevidence_ids", "A ready directional thesis requires counterevidence."))
        if len(scenarios) < 2:
            errors.append(issue("READY_WITHOUT_SCENARIOS", "$.scenarios", "A ready directional thesis requires at least two scenarios."))
    if decision == "ready" and brief.get("decision_use") == "trade_watch" and not context.get("liquidity"):
        errors.append(issue("TRADE_LIQUIDITY_MISSING", "$.market_context.liquidity", "A ready trade watch requires liquidity context."))

    computed_primary = any(source_types.get(source_id) in PRIMARY_SOURCE_TYPES for source_id in source_ids)
    computed_live = any(source_types.get(source_id) in LIVE_SOURCE_TYPES for source_id in source_ids)
    computed_freshness = "unknown" if not fact_freshness else next(iter(fact_freshness)) if len(fact_freshness) == 1 else "mixed"
    if quality.get("data_freshness") in DATA_FRESHNESS and quality.get("data_freshness") != computed_freshness:
        errors.append(issue("DATA_FRESHNESS_MISMATCH", "$.quality_report.data_freshness", f"Expected {computed_freshness!r} from the fact ledger."))
    coverage = quality.get("source_coverage")
    if not isinstance(coverage, dict):
        errors.append(issue("SOURCE_COVERAGE_TYPE", "$.quality_report.source_coverage", "source_coverage must be an object."))
    else:
        expected = {
            "primary_source_present": computed_primary,
            "live_market_data_present": computed_live,
            "independent_sources": len(publishers),
        }
        for key, value in expected.items():
            if coverage.get(key) != value:
                errors.append(issue("SOURCE_COVERAGE_MISMATCH", f"$.quality_report.source_coverage.{key}", f"Expected {value!r}."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def validate_payload(payload: Any) -> list[dict[str, Any]] | dict[str, Any]:
    return [validate(item) for item in payload] if isinstance(payload, list) else validate(payload)


def all_valid(result: Iterable[dict[str, Any]] | dict[str, Any]) -> bool:
    rows = result if isinstance(result, list) else [result]
    return all(row["valid"] for row in rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Cuebook ResearchPackV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="ResearchPackV1 JSON or array; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    result = validate_payload(json.loads(raw))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if all_valid(result) else 1)


if __name__ == "__main__":
    main()
