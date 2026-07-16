#!/usr/bin/env python3
"""Validate VisualArgumentV1 graph, provenance, grammar, settlement, and state."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


GRAMMARS = {"causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison", "price_timeline"}
JOB_GRAMMAR = {
    "explain_cause": "causal_chain",
    "show_metrics": "metric_thesis",
    "map_scenarios": "scenario_tree",
    "weigh_evidence": "evidence_balance",
    "compare_assets": "comparison",
    "show_price_path": "price_timeline",
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def string_list(value: Any, path: str, errors: list[dict[str, str]]) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."))
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_LIST_ITEM", f"{path}[{index}]", "Expected a non-empty string."))
            continue
        result.append(item)
    if len(result) != len(set(result)):
        errors.append(issue("STRING_LIST_UNIQUE", path, "Strings must be unique."))
    return result


def parse_time(value: Any, path: str, errors: list[dict[str, str]], nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if not nonempty(value):
        errors.append(issue("DATETIME", path, "Expected a timezone-aware ISO-8601 datetime."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("DATETIME", path, "Invalid ISO-8601 datetime."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("DATETIME_TZ", path, "Datetime must include a timezone."))
        return None
    return parsed


def has_directed_cycle(node_ids: set[str], edges: list[tuple[str, str]]) -> bool:
    adjacency = {node_id: [] for node_id in node_ids}
    for source, target in edges:
        if source in adjacency:
            adjacency[source].append(target)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        for target in adjacency[node_id]:
            if target in adjacency and visit(target):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return any(visit(node_id) for node_id in node_ids)


def validate(payload: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT", "$", "Expected a JSON object.")], "warnings": []}

    if payload.get("schema_version") != "visual-argument-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected visual-argument-v1."))
    if not re.fullmatch(r"VARG_[A-Za-z0-9_:-]{8,}", str(payload.get("argument_id") or "")):
        errors.append(issue("ARGUMENT_ID", "$.argument_id", "Invalid visual argument ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "Revision must be a positive integer."))
    state = payload.get("state")
    if state not in {"draft", "conditional", "ready", "frozen"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))

    lineage = payload.get("lineage")
    if not isinstance(lineage, dict):
        errors.append(issue("LINEAGE", "$.lineage", "Lineage must be an object."))
        lineage = {}
    input_refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors)
    if not input_refs:
        errors.append(issue("INPUT_REFS", "$.lineage.input_artifact_refs", "At least one input artifact is required."))
    for key in ("post_ref", "creator_intent_ref", "thesis_ref", "research_pack_ref", "settlement_claim_ref"):
        value = lineage.get(key)
        if value is not None and not nonempty(value):
            errors.append(issue("LINEAGE_REF", f"$.lineage.{key}", "Reference must be null or non-empty."))
        if nonempty(value) and value not in input_refs:
            errors.append(issue("LINEAGE_INPUT", f"$.lineage.{key}", "Lineage ref must appear in input_artifact_refs."))
    cutoff = parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)

    subject = payload.get("subject")
    if not isinstance(subject, dict):
        errors.append(issue("SUBJECT", "$.subject", "Subject must be an object."))
        subject = {}
    primary = subject.get("primary")
    if not isinstance(primary, dict):
        errors.append(issue("PRIMARY", "$.subject.primary", "Primary instrument is required."))
    else:
        for key in ("instrument_id", "ticker", "display_name"):
            if not nonempty(primary.get(key)):
                errors.append(issue("INSTRUMENT_FIELD", f"$.subject.primary.{key}", f"{key} is required."))
    benchmark = subject.get("benchmark")
    if benchmark is not None:
        if not isinstance(benchmark, dict):
            errors.append(issue("BENCHMARK", "$.subject.benchmark", "Benchmark must be null or an instrument."))
        else:
            for key in ("instrument_id", "ticker", "display_name"):
                if not nonempty(benchmark.get(key)):
                    errors.append(issue("BENCHMARK_FIELD", f"$.subject.benchmark.{key}", f"{key} is required."))
    direction = subject.get("direction")
    if direction not in {"long", "short", "outperform", "underperform", "range", "neutral", "custom"}:
        errors.append(issue("DIRECTION", "$.subject.direction", "Unsupported direction."))
    horizon = parse_time(subject.get("horizon_end"), "$.subject.horizon_end", errors, nullable=True)
    if cutoff and horizon and horizon <= cutoff:
        errors.append(issue("HORIZON_ORDER", "$.subject.horizon_end", "Horizon must be after the decision cutoff."))
    if direction in {"outperform", "underperform"} and not isinstance(benchmark, dict):
        errors.append(issue("RELATIVE_BENCHMARK", "$.subject.benchmark", "Relative direction requires a benchmark."))

    frame = payload.get("frame")
    if not isinstance(frame, dict):
        errors.append(issue("FRAME", "$.frame", "Frame must be an object."))
        frame = {}
    for key in ("headline", "thesis"):
        if not nonempty(frame.get(key)):
            errors.append(issue("FRAME_FIELD", f"$.frame.{key}", f"{key} is required."))
    creator_text = frame.get("creator_text")
    if creator_text is not None and not nonempty(creator_text):
        errors.append(issue("CREATOR_TEXT", "$.frame.creator_text", "Creator text must be null or non-empty."))
    if creator_text is not None and frame.get("creator_text_preserved") is not True:
        errors.append(issue("CREATOR_TEXT_PRESERVED", "$.frame.creator_text_preserved", "Creator text must remain verbatim."))
    if frame.get("cuebook_contribution") is not None and not nonempty(frame.get("cuebook_contribution")):
        errors.append(issue("CUEBOOK_CONTRIBUTION", "$.frame.cuebook_contribution", "Cuebook contribution must be null or non-empty."))
    visual_job = frame.get("visual_job")
    if visual_job not in JOB_GRAMMAR:
        errors.append(issue("VISUAL_JOB", "$.frame.visual_job", "Unsupported visual job."))

    graph = payload.get("graph")
    if not isinstance(graph, dict):
        errors.append(issue("GRAPH", "$.graph", "Graph must be an object."))
        graph = {}
    nodes = graph.get("nodes")
    if not isinstance(nodes, list) or not 2 <= len(nodes) <= 14:
        errors.append(issue("NODES", "$.graph.nodes", "Expected two to fourteen nodes."))
        nodes = []
    node_ids: set[str] = set()
    node_kinds: set[str] = set()
    metric_links: list[tuple[str, str]] = []
    for index, node in enumerate(nodes):
        path = f"$.graph.nodes[{index}]"
        if not isinstance(node, dict):
            errors.append(issue("NODE", path, "Node must be an object."))
            continue
        node_id = node.get("id")
        if not re.fullmatch(r"N[1-9][0-9]*", str(node_id or "")):
            errors.append(issue("NODE_ID", f"{path}.id", "Node ID must use N<number>."))
        elif node_id in node_ids:
            errors.append(issue("NODE_ID_UNIQUE", f"{path}.id", "Node IDs must be unique."))
        else:
            node_ids.add(node_id)
        kind = node.get("kind")
        if kind not in {"event", "evidence", "mechanism", "actor_action", "market_effect", "metric", "condition", "countercase", "invalidation", "settlement"}:
            errors.append(issue("NODE_KIND", f"{path}.kind", "Unsupported node kind."))
        else:
            node_kinds.add(kind)
        if not nonempty(node.get("label")) or len(str(node.get("label") or "")) > 80:
            errors.append(issue("NODE_LABEL", f"{path}.label", "Node label must be 1-80 characters."))
        status = node.get("status")
        if status not in {"observed", "derived", "conditional", "unresolved"}:
            errors.append(issue("NODE_STATUS", f"{path}.status", "Unsupported node status."))
        fact_refs = string_list(node.get("fact_refs"), f"{path}.fact_refs", errors)
        source_refs = string_list(node.get("source_refs"), f"{path}.source_refs", errors)
        if status == "observed" and (not fact_refs or not source_refs):
            errors.append(issue("OBSERVED_PROVENANCE", path, "Observed nodes require fact and source refs."))
        if status == "derived" and not fact_refs:
            errors.append(issue("DERIVED_PROVENANCE", path, "Derived nodes require supporting fact refs."))
        metric_ref = node.get("metric_ref")
        if kind == "metric":
            if not nonempty(metric_ref):
                errors.append(issue("METRIC_NODE_REF", f"{path}.metric_ref", "Metric node requires metric_ref."))
            else:
                metric_links.append((path, metric_ref))
        elif metric_ref is not None:
            errors.append(issue("NON_METRIC_REF", f"{path}.metric_ref", "Only metric nodes may carry metric_ref."))

    edges = graph.get("edges")
    if not isinstance(edges, list) or not 1 <= len(edges) <= 20:
        errors.append(issue("EDGES", "$.graph.edges", "Expected one to twenty edges."))
        edges = []
    edge_ids: set[str] = set()
    edge_pairs: list[tuple[str, str]] = []
    connected: set[str] = set()
    relations: set[str] = set()
    for index, edge in enumerate(edges):
        path = f"$.graph.edges[{index}]"
        if not isinstance(edge, dict):
            errors.append(issue("EDGE", path, "Edge must be an object."))
            continue
        edge_id = edge.get("id")
        if not re.fullmatch(r"E[1-9][0-9]*", str(edge_id or "")):
            errors.append(issue("EDGE_ID", f"{path}.id", "Edge ID must use E<number>."))
        elif edge_id in edge_ids:
            errors.append(issue("EDGE_ID_UNIQUE", f"{path}.id", "Edge IDs must be unique."))
        else:
            edge_ids.add(edge_id)
        source, target = edge.get("from"), edge.get("to")
        if source not in node_ids or target not in node_ids:
            errors.append(issue("EDGE_NODE_REF", path, "Edge endpoints must reference known nodes."))
        elif source == target:
            errors.append(issue("SELF_EDGE", path, "Self edges are not allowed."))
        else:
            edge_pairs.append((source, target))
            connected.update((source, target))
        relation = edge.get("relation")
        if relation not in {"causes", "enables", "pressures", "confirms", "challenges", "conditions", "settles", "compares"}:
            errors.append(issue("EDGE_RELATION", f"{path}.relation", "Unsupported relation."))
        else:
            relations.add(relation)
        if edge.get("certainty") not in {"observed", "inferred", "hypothesis"}:
            errors.append(issue("EDGE_CERTAINTY", f"{path}.certainty", "Unsupported certainty."))
    if node_ids - connected:
        errors.append(issue("ISOLATED_NODE", "$.graph", f"Disconnected nodes: {sorted(node_ids - connected)}."))
    if has_directed_cycle(node_ids, edge_pairs):
        errors.append(issue("GRAPH_CYCLE", "$.graph.edges", "Compact visual argument graph must be acyclic."))

    metrics = payload.get("metrics")
    if not isinstance(metrics, list) or len(metrics) > 8:
        errors.append(issue("METRICS", "$.metrics", "Metrics must be an array with at most eight items."))
        metrics = []
    metric_ids: set[str] = set()
    for index, metric in enumerate(metrics):
        path = f"$.metrics[{index}]"
        if not isinstance(metric, dict):
            errors.append(issue("METRIC", path, "Metric must be an object."))
            continue
        metric_id = metric.get("id")
        if not re.fullmatch(r"M[1-9][0-9]*", str(metric_id or "")) or metric_id in metric_ids:
            errors.append(issue("METRIC_ID", f"{path}.id", "Metric IDs must be unique M<number> values."))
        else:
            metric_ids.add(metric_id)
        for key in ("label", "display_value", "source_ref"):
            if not nonempty(metric.get(key)):
                errors.append(issue("METRIC_FIELD", f"{path}.{key}", f"{key} is required."))
        if metric.get("subject_ref") not in {"primary", "benchmark", "context"}:
            errors.append(issue("METRIC_SUBJECT", f"{path}.subject_ref", "Metric subject must be primary, benchmark, or context."))
        metric_time = parse_time(metric.get("as_of"), f"{path}.as_of", errors, nullable=True)
        if cutoff and metric_time and metric_time > cutoff and metric.get("status") != "provisional":
            errors.append(issue("POST_CUTOFF_METRIC", f"{path}.as_of", "Post-cutoff metric must remain provisional tracking evidence."))
        if metric.get("status") not in {"verified", "provisional", "estimated"}:
            errors.append(issue("METRIC_STATUS", f"{path}.status", "Unsupported metric status."))
    for path, metric_ref in metric_links:
        if metric_ref not in metric_ids:
            errors.append(issue("UNKNOWN_METRIC_REF", f"{path}.metric_ref", "Metric node references an unknown metric."))

    levels = payload.get("levels")
    if not isinstance(levels, list) or len(levels) > 6:
        errors.append(issue("LEVELS", "$.levels", "Levels must be an array with at most six items."))
        levels = []
    level_ids: set[str] = set()
    for index, level in enumerate(levels):
        path = f"$.levels[{index}]"
        if not isinstance(level, dict):
            errors.append(issue("LEVEL", path, "Level must be an object."))
            continue
        level_id = level.get("id")
        if not re.fullmatch(r"L[1-9][0-9]*", str(level_id or "")) or level_id in level_ids:
            errors.append(issue("LEVEL_ID", f"{path}.id", "Level IDs must be unique L<number> values."))
        else:
            level_ids.add(level_id)
        if level.get("kind") not in {"baseline", "target", "trigger", "invalidation", "range_lower", "range_upper"}:
            errors.append(issue("LEVEL_KIND", f"{path}.kind", "Unsupported level kind."))
        if not isinstance(level.get("value"), (int, float)) or isinstance(level.get("value"), bool):
            errors.append(issue("LEVEL_VALUE", f"{path}.value", "Level value must be numeric."))
        for key in ("unit", "source_ref"):
            if not nonempty(level.get(key)):
                errors.append(issue("LEVEL_FIELD", f"{path}.{key}", f"{key} is required."))
        parse_time(level.get("observed_at"), f"{path}.observed_at", errors, nullable=True)
        if level.get("status") not in {"explicit", "derived"}:
            errors.append(issue("LEVEL_STATUS", f"{path}.status", "Unsupported level status."))

    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) > 5:
        errors.append(issue("SCENARIOS", "$.scenarios", "Scenarios must be an array with at most five items."))
        scenarios = []
    scenario_ids: set[str] = set()
    for index, scenario in enumerate(scenarios):
        path = f"$.scenarios[{index}]"
        if not isinstance(scenario, dict):
            errors.append(issue("SCENARIO", path, "Scenario must be an object."))
            continue
        scenario_id = scenario.get("id")
        if not re.fullmatch(r"SC[1-9][0-9]*", str(scenario_id or "")) or scenario_id in scenario_ids:
            errors.append(issue("SCENARIO_ID", f"{path}.id", "Scenario IDs must be unique SC<number> values."))
        else:
            scenario_ids.add(scenario_id)
        for key in ("label", "condition", "outcome"):
            if not nonempty(scenario.get(key)):
                errors.append(issue("SCENARIO_FIELD", f"{path}.{key}", f"{key} is required."))
        if scenario.get("stance") not in {"bull", "base", "bear", "risk"}:
            errors.append(issue("SCENARIO_STANCE", f"{path}.stance", "Unsupported scenario stance."))
        string_list(scenario.get("fact_refs"), f"{path}.fact_refs", errors)

    settlement = payload.get("settlement")
    if not isinstance(settlement, dict):
        errors.append(issue("SETTLEMENT", "$.settlement", "Settlement must be an object."))
        settlement = {}
    settleable = settlement.get("settleable")
    if not isinstance(settleable, bool):
        errors.append(issue("SETTLEABLE", "$.settlement.settleable", "settleable must be boolean."))
    deadline = parse_time(settlement.get("deadline_at"), "$.settlement.deadline_at", errors, nullable=True)
    if settleable:
        if not all(nonempty(settlement.get(key)) for key in ("claim_ref", "condition")) or deadline is None:
            errors.append(issue("SETTLEMENT_CONTRACT", "$.settlement", "Settleable argument requires claim ref, deadline, and condition."))
        if settlement.get("state") not in {"draft", "needs_confirmation", "ready", "frozen"}:
            errors.append(issue("SETTLEMENT_STATE", "$.settlement.state", "Settleable argument has invalid settlement state."))
        if lineage.get("settlement_claim_ref") != settlement.get("claim_ref"):
            errors.append(issue("SETTLEMENT_LINEAGE", "$.settlement.claim_ref", "Settlement claim must match lineage."))
        if horizon and deadline and horizon != deadline:
            errors.append(issue("SETTLEMENT_HORIZON", "$.settlement.deadline_at", "Settlement deadline must match subject horizon."))
    else:
        if settlement.get("state") != "not_applicable" or any(settlement.get(key) is not None for key in ("claim_ref", "deadline_at", "condition")):
            errors.append(issue("NON_SETTLEABLE", "$.settlement", "Non-settleable argument must use null fields and not_applicable state."))

    visual = payload.get("visual")
    if not isinstance(visual, dict):
        errors.append(issue("VISUAL", "$.visual", "Visual recommendation must be an object."))
        visual = {}
    grammar = visual.get("recommended_grammar")
    if grammar not in GRAMMARS:
        errors.append(issue("GRAMMAR", "$.visual.recommended_grammar", "Unsupported visual grammar."))
    alternatives = string_list(visual.get("alternative_grammars"), "$.visual.alternative_grammars", errors)
    if any(item not in GRAMMARS for item in alternatives):
        errors.append(issue("ALTERNATIVE_GRAMMAR", "$.visual.alternative_grammars", "Unsupported alternative grammar."))
    if grammar in alternatives:
        errors.append(issue("DUPLICATE_GRAMMAR", "$.visual.alternative_grammars", "Primary grammar cannot also be an alternative."))
    if visual_job in JOB_GRAMMAR and grammar != JOB_GRAMMAR[visual_job]:
        errors.append(issue("JOB_GRAMMAR_MISMATCH", "$.visual.recommended_grammar", "Visual grammar must match the stated visual job."))
    if not nonempty(visual.get("rationale")):
        errors.append(issue("VISUAL_RATIONALE", "$.visual.rationale", "Grammar rationale is required."))
    if visual.get("theme") not in {"cuebook_light", "cuebook_dark"}:
        errors.append(issue("VISUAL_THEME", "$.visual.theme", "Unsupported Cuebook theme."))

    if grammar == "causal_chain" and not ({"event", "evidence"} & node_kinds and "mechanism" in node_kinds and "market_effect" in node_kinds):
        errors.append(issue("CAUSAL_GRAMMAR", "$.graph.nodes", "Causal chain requires evidence/event, mechanism, and market effect nodes."))
    if grammar == "metric_thesis" and len(metrics) < 2:
        errors.append(issue("METRIC_GRAMMAR", "$.metrics", "Metric thesis requires at least two metrics."))
    if grammar == "scenario_tree" and len(scenarios) < 2:
        errors.append(issue("SCENARIO_GRAMMAR", "$.scenarios", "Scenario tree requires at least two scenarios."))
    if grammar == "evidence_balance" and ("countercase" not in node_kinds or not ({"evidence", "event"} & node_kinds) or "challenges" not in relations):
        errors.append(issue("EVIDENCE_GRAMMAR", "$.graph", "Evidence balance requires evidence, countercase, and a challenges edge."))
    if grammar == "comparison" and not isinstance(benchmark, dict):
        errors.append(issue("COMPARISON_GRAMMAR", "$.subject.benchmark", "Comparison visual requires a comparison instrument."))
    if grammar == "price_timeline" and (not levels or not settleable):
        errors.append(issue("PRICE_GRAMMAR", "$.visual.recommended_grammar", "Price timeline requires explicit levels and a settlement contract."))

    quality = payload.get("quality_report")
    if not isinstance(quality, dict):
        errors.append(issue("QUALITY", "$.quality_report", "Quality report must be an object."))
        quality = {}
    decision = quality.get("decision")
    quality_warnings = string_list(quality.get("warnings"), "$.quality_report.warnings", errors)
    hard_failures = string_list(quality.get("hard_failures"), "$.quality_report.hard_failures", errors)
    if hard_failures and decision != "blocked":
        errors.append(issue("HARD_FAILURE_DECISION", "$.quality_report.decision", "Hard failures require blocked decision."))
    if state == "conditional" and (decision != "conditional" or not quality_warnings):
        errors.append(issue("CONDITIONAL_STATE", "$.quality_report", "Conditional state requires a conditional decision and warning."))
    if state in {"ready", "frozen"} and (decision != "ready" or quality_warnings or hard_failures):
        errors.append(issue("READY_STATE", "$.quality_report", "Ready or frozen state requires clean ready quality."))
    if decision == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked decision requires a hard failure."))

    if any(node.get("status") in {"conditional", "unresolved"} for node in nodes if isinstance(node, dict)):
        warnings.append(issue("CONDITIONAL_LOGIC", "$.graph.nodes", "Visual contains conditional or unresolved logic and must preserve its visual state."))
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    try:
        payload = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"valid": False, "errors": [issue("READ", "$", str(exc))], "warnings": []}, ensure_ascii=False, indent=2))
        return 1
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
