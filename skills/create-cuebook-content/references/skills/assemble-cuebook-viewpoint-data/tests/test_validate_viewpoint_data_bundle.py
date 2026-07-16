#!/usr/bin/env python3
"""Regression tests for ViewpointDataBundleV1."""

from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_viewpoint_data_bundle.py"
SPEC = importlib.util.spec_from_file_location("viewpoint_data_validator", SCRIPT)
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)
validate = module.validate


def base_bundle() -> dict:
    return {
        "schema_version": "viewpoint-data-bundle-v1",
        "bundle_id": "VDATA_benchmark01",
        "revision": 1,
        "state": "ready",
        "temporal_mode": "declaration",
        "lineage": {
            "expression_plan_ref": "CEXP_benchmark01@r1",
            "meaning_fingerprint": f"sha256:{'a' * 64}",
            "research_pack_ref": "RESEARCH_benchmark01",
            "input_artifact_refs": ["CEXP_benchmark01@r1", "MSERIES_benchmark01"],
            "decision_cutoff_at": "2026-07-14T08:00:00Z",
            "as_of": "2026-07-14T08:00:00Z",
        },
        "request": {
            "grammar": "binary_level",
            "visual_job": "Show whether price is holding the creator's explicit level.",
            "required_kinds": ["ohlcv"],
            "fallback_modes": ["qualitative", "key_numbers"],
        },
        "instruments": [{
            "instrument_id": "INS_primary",
            "entity_ref": "ENTITY_000660",
            "symbol": "000660",
            "venue": "XKRX",
            "currency": "KRW",
            "role": "primary",
            "mapping_source_ref": "ENTITYMAP_000660",
            "mapping_limitation": None,
        }],
        "series": [{
            "series_id": "SER_ohlcv",
            "kind": "ohlcv",
            "label": "SK Hynix daily",
            "instrument_refs": ["INS_primary"],
            "unit": "KRW",
            "interval": "1d",
            "timezone": "Asia/Seoul",
            "source_ref": "KRX_000660_daily",
            "formula_ref": None,
            "points": [
                {"t": "2026-07-13T06:30:00Z", "state": "sealed", "source_ref": "KRX_bar_0713", "available_at": "2026-07-13T06:31:00Z", "o": 1900000, "h": 1920000, "l": 1810000, "c": 1845000, "v": 1000},
                {"t": "2026-07-14T06:30:00Z", "state": "sealed", "source_ref": "KRX_bar_0714", "available_at": "2026-07-14T06:31:00Z", "o": 1800000, "h": 1930000, "l": 1678000, "c": 1913000, "v": 1600},
            ],
        }],
        "key_values": [],
        "events": [],
        "levels": [],
        "formulas": [],
        "requirements": [{
            "requirement_id": "REQ_ohlcv",
            "expression_plan_requirement_ref": "CEXP_benchmark01@r1#/data_requirements/D1",
            "kind": "ohlcv",
            "request_class": "market_series",
            "required": True,
            "material_to_claim": False,
            "expression_surfaces": ["visual"],
            "status": "available",
            "resolved_refs": ["SER_ohlcv"],
            "missing_reason": None,
            "fallback": None,
        }],
        "render_payload": {
            "mode": "series",
            "series_refs": ["SER_ohlcv"],
            "value_refs": [],
            "event_refs": [],
            "level_refs": [],
            "formula_refs": [],
        },
        "quality_report": {
            "decision": "ready",
            "hard_failures": [],
            "warnings": [],
            "checks": ["cutoff", "ohlcv", "source", "requirements"],
            "counts": {"instruments": 1, "series": 1, "key_values": 0, "events": 0, "levels": 0, "formulas": 0, "requirements": 1, "missing_required": 0},
        },
    }


def expression_plan() -> dict:
    return {
        "plan_id": "CEXP_benchmark01",
        "revision": 1,
        "meaning_fingerprint": {"fingerprint_sha256": f"sha256:{'a' * 64}"},
        "data_requirements": [{
            "id": "D1",
            "kind": "series",
            "request_class": "market_series",
            "required": True,
            "material_to_claim": False,
            "expression_surfaces": ["visual"],
        }],
    }


def sourced_event(*, role: str = "news", source_type: str = "issuer") -> dict:
    return {
        "event_id": "EV_catalyst",
        "label": "Issuer announces the dated catalyst",
        "at": "2026-07-14T05:00:00Z",
        "available_at": "2026-07-14T05:01:00Z",
        "source_ref": "SRC_issuer_announcement",
        "publisher_or_issuer": "Example Issuer",
        "source_type": source_type,
        "source_url": "https://example.com/announcement",
        "supported_fact_refs": ["FACT_catalyst"],
        "role": role,
    }


def explicit_level() -> dict:
    return {
        "level_id": "LVL_trigger",
        "label": "Creator trigger",
        "instrument_ref": "INS_primary",
        "value": 1900000,
        "unit": "KRW",
        "kind": "trigger",
        "source_ref": "SRC_creator_level",
        "fact_refs": ["FACT_creator_level"],
        "observed_at": "2026-07-14T06:30:00Z",
        "available_at": "2026-07-14T06:31:00Z",
        "explicit": True,
    }


def key_value(value_id: str, instrument_ref: str, *, valuation: bool = False) -> dict:
    return {
        "value_id": value_id,
        "label": "Forward P/E" if valuation else "Comparable metric",
        "instrument_refs": [instrument_ref],
        "numeric_value": 12.0,
        "display_value": "12.0x",
        "unit": "x",
        "as_of": "2026-07-14T06:30:00Z",
        "available_at": "2026-07-14T06:31:00Z",
        "source_ref": f"SRC_{value_id}",
        "evidence_kind": "reported",
        "formula_ref": None,
        "role": "comparison",
        "valuation_basis": {
            "metric_name": "P/E",
            "numerator": "price per share",
            "denominator": "forward earnings per share",
            "denominator_value": 100.0,
            "period_basis": "forward",
            "accounting_basis": "issuer guidance basis",
            "currency_treatment": "same-currency per-share ratio",
            "share_class": "common shares",
            "comparability_notes": "Compared on the same forward period.",
        } if valuation else None,
    }


def evidence_object(shape: str, payload: dict, *, state: str = "observed", formula_ref: str | None = None, source_refs: list[str] | None = None) -> dict:
    return {
        "evidence_id": f"EOBJ_{shape}",
        "shape": shape,
        "label": shape.replace("_", " ").title(),
        "state": state,
        "as_of": "2026-07-14T07:30:00Z",
        "available_at": "2026-07-14T07:31:00Z",
        "source_refs": source_refs or [f"SRC_{shape}"],
        "formula_ref": formula_ref,
        "payload": payload,
    }


def bundle_with_evidence(obj: dict, *, request_class: str = "qualitative_evidence") -> dict:
    item = base_bundle()
    obj = copy.deepcopy(obj)
    shape = obj["shape"]
    item["evidence_objects"] = [obj]
    item["request"]["required_kinds"] = [shape]
    item["requirements"][0].update({
        "kind": shape,
        "request_class": request_class,
        "resolved_refs": [obj["evidence_id"]],
    })
    item["render_payload"].update({
        "mode": "evidence",
        "series_refs": [],
        "evidence_object_refs": [obj["evidence_id"]],
    })
    item["quality_report"]["counts"]["evidence_objects"] = 1
    return item


def codes(result: dict) -> set[str]:
    return {item["code"] for item in result["errors"]}


def main() -> None:
    cases = 0

    schema_path = SCRIPT.parents[1] / "references" / "viewpoint-data-bundle-v1.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    requirement_fields = set(schema["$defs"]["requirement"]["required"])
    assert {"expression_plan_requirement_ref", "request_class", "material_to_claim", "expression_surfaces"}.issubset(requirement_fields)
    assert {"publisher_or_issuer", "source_type", "source_url", "supported_fact_refs"}.issubset(schema["$defs"]["event"]["required"])
    assert {"instrument_ref", "source_ref", "fact_refs", "explicit"}.issubset(schema["$defs"]["level"]["required"])
    cases += 1

    result = validate(base_bundle(), expression_plan=expression_plan())
    assert result["valid"], result
    cases += 1

    item = base_bundle()
    item["state"] = item["quality_report"]["decision"] = "conditional"
    item["series"] = []
    item["requirements"][0].update({
        "status": "missing", "resolved_refs": [], "missing_reason": "OHLCV was not supplied.",
        "fallback": {"mode": "qualitative", "grammar": "binary_level", "reason": "Show the explicit level and two paths without candles."},
    })
    item["render_payload"].update({"mode": "qualitative", "series_refs": []})
    item["quality_report"]["counts"].update({"series": 0, "missing_required": 1})
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item = base_bundle()
    item["series"][0]["points"][0]["h"] = 1800000
    assert "OHLC_HIGH" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["series"][0]["points"][1]["available_at"] = "2026-07-14T08:01:00Z"
    assert "POST_CUTOFF_DATA" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["key_values"].append({
        "value_id": "VAL_derived", "label": "Return", "numeric_value": 2.0,
        "instrument_refs": ["INS_primary"],
        "display_value": "+2.0%", "unit": "%", "as_of": "2026-07-14T06:30:00Z",
        "available_at": "2026-07-14T06:31:00Z", "source_ref": "derived:return",
        "evidence_kind": "derived", "formula_ref": None, "role": "driver",
        "valuation_basis": None,
    })
    item["quality_report"]["counts"]["key_values"] = 1
    assert "VALUE_FORMULA_REQUIRED" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["formulas"].append({
        "formula_id": "FORM_return", "label": "Return", "expression": "close / base - 1",
        "input_refs": ["SER_missing"], "output_unit": "%", "window": "1d",
        "normalization": "none", "limitations": ["Requires aligned closes."],
    })
    item["quality_report"]["counts"]["formulas"] = 1
    assert "UNKNOWN_FORMULA_INPUT" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["render_payload"].update({"mode": "key_numbers", "series_refs": [], "value_refs": []})
    assert "KEY_NUMBER_MODE_EMPTY" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["series"][0]["points"][0]["state"] = "forming"
    assert "FORMING_NOT_LAST" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["state"] = item["quality_report"]["decision"] = "conditional"
    item["series"] = []
    item["requirements"][0].update({"status": "missing", "resolved_refs": [], "missing_reason": "No data", "fallback": None})
    item["render_payload"].update({"mode": "qualitative", "series_refs": []})
    item["quality_report"]["counts"].update({"series": 0, "missing_required": 1})
    assert "MISSING_WITHOUT_FALLBACK" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["quality_report"]["counts"]["series"] = 99
    assert "COUNTS" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["instruments"][0].update({"role": "proxy", "mapping_limitation": None})
    assert "PROXY_LIMITATION" in codes(validate(item))
    cases += 1

    item = base_bundle()
    second = copy.deepcopy(item["series"][0])
    second.update({"series_id": "SER_comparator", "unit": "USD"})
    item["series"].append(second)
    item["render_payload"]["series_refs"].append("SER_comparator")
    item["quality_report"]["counts"]["series"] = 2
    assert "COMPARISON_BASIS" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["requirements"][0]["expression_plan_requirement_ref"] = "CEXP_other@r1#/data_requirements/D1"
    assert "UPSTREAM_REQUIREMENT_REF" in codes(validate(item))
    cases += 1

    item = base_bundle()
    plan = expression_plan()
    item["requirements"][0]["material_to_claim"] = True
    assert "UPSTREAM_REQUIREMENT_MISMATCH" in codes(validate(item, expression_plan=plan))
    cases += 1

    item = base_bundle()
    plan = expression_plan()
    plan["data_requirements"].append({
        "id": "D2", "kind": "qualitative", "request_class": "news_anchor",
        "required": True, "material_to_claim": True, "expression_surfaces": ["text"],
    })
    assert "UPSTREAM_REQUIREMENT_COVERAGE" in codes(validate(item, expression_plan=plan))
    cases += 1

    material_classes = {
        "news_anchor": "event",
        "valuation_metric": "key_value",
        "comparison_metric": "key_value",
        "price_level": "level",
        "settlement_reference": "event",
    }
    for request_class, kind in material_classes.items():
        item = base_bundle()
        item["state"] = item["quality_report"]["decision"] = "conditional"
        item["request"]["required_kinds"] = [kind]
        item["requirements"][0].update({
            "kind": kind,
            "request_class": request_class,
            "material_to_claim": True,
            "status": "missing",
            "resolved_refs": [],
            "missing_reason": "The material request could not be resolved.",
            "fallback": {"mode": "qualitative", "grammar": "binary_level", "reason": "Attempt a generic fallback."},
        })
        item["quality_report"]["counts"]["missing_required"] = 1
        result = validate(item)
        assert "MATERIAL_REQUEST_FALLBACK" in codes(result), (request_class, result)
        assert "MATERIAL_REQUEST_STATE" in codes(result), (request_class, result)
        cases += 1

    item = base_bundle()
    item["state"] = item["quality_report"]["decision"] = "blocked"
    item["quality_report"]["hard_failures"] = ["material_comparison_degraded"]
    item["requirements"][0].update({
        "request_class": "comparison_metric",
        "material_to_claim": True,
        "status": "degraded",
        "missing_reason": "Only one side of the comparator was available.",
        "fallback": {"mode": "qualitative", "grammar": "binary_level", "reason": "Replace the comparator with prose."},
    })
    result = validate(item)
    assert "MATERIAL_REQUEST_DEGRADED" in codes(result)
    assert "MATERIAL_REQUEST_FALLBACK" in codes(result)
    cases += 1

    item = base_bundle()
    item["state"] = item["quality_report"]["decision"] = "blocked"
    item["quality_report"]["hard_failures"] = ["material_price_level_missing"]
    item["quality_report"]["counts"]["missing_required"] = 1
    item["request"]["required_kinds"] = ["level"]
    item["requirements"][0].update({
        "kind": "level",
        "request_class": "price_level",
        "material_to_claim": True,
        "status": "missing",
        "resolved_refs": [],
        "missing_reason": "The creator's exact level was not supplied.",
        "fallback": None,
    })
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item = base_bundle()
    item["series"] = []
    item["render_payload"].update({"mode": "qualitative", "series_refs": []})
    item["events"] = [sourced_event()]
    item["request"]["required_kinds"] = ["event"]
    item["requirements"][0].update({
        "kind": "event", "request_class": "news_anchor", "material_to_claim": True,
        "resolved_refs": ["EV_catalyst"],
    })
    item["render_payload"]["event_refs"] = ["EV_catalyst"]
    item["quality_report"]["counts"].update({"series": 0, "events": 1})
    result = validate(item)
    assert result["valid"], result
    cases += 1

    omitted = copy.deepcopy(item)
    omitted["render_payload"]["event_refs"] = []
    assert "MATERIAL_RENDER_OMISSION" in codes(validate(omitted))
    cases += 1

    item["events"][0]["source_url"] = None
    assert "NEWS_EVIDENCE" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["series"] = []
    item["render_payload"].update({"mode": "qualitative", "series_refs": []})
    item["events"] = [sourced_event()]
    item["request"]["required_kinds"] = ["event"]
    item["requirements"][0].update({
        "kind": "event",
        "request_class": "news_anchor",
        "material_to_claim": True,
        "expression_surfaces": ["text"],
        "resolved_refs": ["EV_catalyst"],
    })
    item["quality_report"]["counts"].update({"series": 0, "events": 1})
    plan = expression_plan()
    plan["data_requirements"][0].update({
        "kind": "qualitative",
        "request_class": "news_anchor",
        "material_to_claim": True,
        "expression_surfaces": ["text"],
    })
    result = validate(item, expression_plan=plan)
    assert result["valid"], result
    assert item["render_payload"]["event_refs"] == []
    cases += 1

    item = base_bundle()
    event = sourced_event()
    del event["source_ref"]
    item["events"] = [event]
    item["quality_report"]["counts"]["events"] = 1
    assert {"MISSING_FIELD", "EVENT_SOURCE"}.issubset(codes(validate(item)))
    cases += 1

    item = base_bundle()
    item["levels"] = [explicit_level()]
    item["request"]["required_kinds"] = ["level"]
    item["requirements"][0].update({
        "kind": "level", "request_class": "price_level", "material_to_claim": True,
        "resolved_refs": ["LVL_trigger"],
    })
    item["render_payload"]["level_refs"] = ["LVL_trigger"]
    item["quality_report"]["counts"]["levels"] = 1
    result = validate(item)
    assert result["valid"], result
    cases += 1

    del item["levels"][0]["source_ref"]
    result = validate(item)
    assert "MISSING_FIELD" in codes(result)
    assert "PRICE_LEVEL_EVIDENCE" in codes(result)
    cases += 1

    item = base_bundle()
    item["key_values"] = [key_value("VAL_valuation", "INS_primary", valuation=True)]
    item["request"]["required_kinds"] = ["key_value"]
    item["requirements"][0].update({
        "kind": "key_value", "request_class": "valuation_metric", "material_to_claim": True,
        "resolved_refs": ["VAL_valuation"],
    })
    item["render_payload"]["value_refs"] = ["VAL_valuation"]
    item["quality_report"]["counts"]["key_values"] = 1
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["key_values"][0]["valuation_basis"]["denominator_value"] = -1.0
    assert "PE_NOT_MEANINGFUL" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["instruments"].append({
        "instrument_id": "INS_comparator", "entity_ref": "ENTITY_comparator",
        "symbol": "CMP", "venue": "XKRX", "currency": "KRW", "role": "comparator",
        "mapping_source_ref": "ENTITYMAP_comparator", "mapping_limitation": None,
    })
    item["key_values"] = [
        key_value("VAL_primary", "INS_primary"),
        key_value("VAL_comparator", "INS_comparator"),
    ]
    item["request"]["required_kinds"] = ["key_value"]
    item["requirements"][0].update({
        "kind": "key_value", "request_class": "comparison_metric", "material_to_claim": True,
        "resolved_refs": ["VAL_primary", "VAL_comparator"],
    })
    item["render_payload"]["value_refs"] = ["VAL_primary", "VAL_comparator"]
    item["quality_report"]["counts"].update({"instruments": 2, "key_values": 2})
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["key_values"][1]["as_of"] = "2026-07-13T06:30:00Z"
    assert "COMPARISON_TIME_BASIS" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["events"] = [sourced_event(role="deadline", source_type="exchange")]
    item["levels"] = [explicit_level()]
    item["request"]["required_kinds"] = ["event"]
    item["requirements"][0].update({
        "kind": "event", "request_class": "settlement_reference", "material_to_claim": True,
        "resolved_refs": ["EV_catalyst", "LVL_trigger"],
    })
    item["render_payload"].update({"event_refs": ["EV_catalyst"], "level_refs": ["LVL_trigger"]})
    item["quality_report"]["counts"].update({"events": 1, "levels": 1})
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["events"][0]["role"] = "news"
    assert "SETTLEMENT_EVIDENCE" in codes(validate(item))
    cases += 1

    item = base_bundle()
    item["events"] = [sourced_event(role="policy", source_type="regulator")]
    item["request"]["required_kinds"] = ["event"]
    item["requirements"][0].update({
        "kind": "event", "request_class": "official_event", "material_to_claim": False,
        "resolved_refs": ["EV_catalyst"],
    })
    item["quality_report"]["counts"]["events"] = 1
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["events"][0]["source_type"] = "publisher"
    assert "OFFICIAL_EVENT_EVIDENCE" in codes(validate(item))
    cases += 1

    schema_shapes = set(schema["$defs"]["evidenceShape"]["enum"])
    assert schema_shapes == module.EVIDENCE_SHAPES
    expression_registry = json.loads(
        (SCRIPT.parents[2] / "direct-cuebook-viewpoint-visual" / "references" / "viewpoint-expression-registry-v1.json").read_text(encoding="utf-8")
    )
    assert schema_shapes.issubset(set(expression_registry["evidence_shapes"]))
    assert "unit" in expression_registry["evidence_contracts"]["quantile_scenarios"]["required_fields"]
    assert "declared_total" in expression_registry["evidence_contracts"]["quantified_flow"]["required_fields"]
    assert "evidence_objects" not in schema["required"]
    assert "evidence_object_refs" not in schema["$defs"]["renderPayload"]["required"]
    payload_refs = {
        clause["then"]["properties"]["payload"]["$ref"]
        for clause in schema["$defs"]["evidenceObject"]["allOf"]
        if "payload" in clause["then"]["properties"]
    }
    assert len(payload_refs) == len(schema_shapes)
    assert all(schema_ref.startswith("#/$defs/") for schema_ref in payload_refs)
    cases += 1

    news_a = sourced_event()
    news_b = copy.deepcopy(news_a)
    news_b.update({
        "event_id": "EV_followup",
        "label": "Independent outlet confirms the dated catalyst",
        "source_ref": "SRC_independent_confirmation",
        "publisher_or_issuer": "Independent Publisher",
        "source_type": "publisher",
        "source_url": "https://example.net/confirmation",
        "supported_fact_refs": ["FACT_confirmation"],
    })
    obj = evidence_object(
        "news_cluster",
        {
            "cluster_id": "NCLUSTER_catalyst",
            "event_refs": ["EV_catalyst", "EV_followup"],
            "cluster_method": "same entity, event time, and supported fact",
            "unique_source_count": 2,
        },
        state="derived",
        source_refs=["SRC_issuer_announcement", "SRC_independent_confirmation"],
    )
    item = bundle_with_evidence(obj, request_class="news_anchor")
    item["events"] = [news_a, news_b]
    item["quality_report"]["counts"]["events"] = 2
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["unique_source_count"] = 3
    assert "NEWS_CLUSTER_SOURCE_COUNT" in codes(validate(item))
    cases += 1

    distribution = evidence_object(
        "distribution_sample",
        {
            "observations": [-4.0, -1.0, 0.5, 2.0, 3.5, 7.0],
            "n": 6,
            "observation_unit": "five-session event return",
            "unit": "%",
            "window": "five completed sessions after each event",
            "population": "comparable issuer announcements since 2024",
            "weights": "equal",
            "quartile_method": "linear interpolation",
            "whisker_rule": "1.5 IQR",
            "outlier_policy": "show raw outliers",
        },
    )
    item = bundle_with_evidence(distribution, request_class="market_series")
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["n"] = 99
    assert "DISTRIBUTION_N" in codes(validate(item))
    cases += 1

    quantile = evidence_object(
        "quantile_scenarios",
        {
            "cutoff": "2026-07-14T08:00:00Z",
            "horizon": "five completed sessions",
            "quantile_levels": [0.1, 0.5, 0.9],
            "quantile_values": [
                {"t": "2026-07-15T20:00:00Z", "values": [90.0, 100.0, 112.0]},
                {"t": "2026-07-20T20:00:00Z", "values": [84.0, 102.0, 121.0]},
            ],
            "unit": "USD",
            "model_or_method": "historical event-conditioned bootstrap",
            "model_vintage": "MODEL_event_bootstrap@2026-07-14",
            "calibration": "rolling two-year out-of-sample coverage",
        },
        state="modeled",
        formula_ref="FORM_quantiles",
    )
    item = bundle_with_evidence(quantile, request_class="market_series")
    item["formulas"] = [{
        "formula_id": "FORM_quantiles",
        "label": "Event-conditioned quantiles",
        "expression": "quantile(bootstrapped_return_paths)",
        "input_refs": ["SER_ohlcv"],
        "output_unit": "USD",
        "window": "five sessions",
        "normalization": "cutoff close = 100%",
        "limitations": ["Historical event paths may not represent the next event."],
    }]
    item["render_payload"]["formula_refs"] = ["FORM_quantiles"]
    item["quality_report"]["counts"]["formulas"] = 1
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["quantile_values"][0]["values"] = [90.0, 113.0, 112.0]
    assert "QUANTILE_CROSSING" in codes(validate(item))
    cases += 1

    part_to_whole = evidence_object(
        "part_to_whole",
        {
            "parts": [{"label": "Core", "value": 55.0}, {"label": "Growth", "value": 35.0}],
            "denominator": 100.0,
            "unit": "%",
            "basis": "reported revenue mix",
            "residual": 10.0,
        },
    )
    item = bundle_with_evidence(part_to_whole, request_class="comparison_metric")
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["residual"] = 5.0
    assert "PART_RECONCILIATION" in codes(validate(item))
    cases += 1

    bridge = evidence_object(
        "additive_components",
        {
            "start": 100.0,
            "components": [{"label": "pricing", "value": 12.0}, {"label": "volume", "value": -4.0}],
            "end": 110.0,
            "unit": "index points",
            "period": "Q2 to Q3",
            "residual": 2.0,
        },
        state="observed",
    )
    item = bundle_with_evidence(bridge, request_class="market_series")
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["end"] = 111.0
    assert "BRIDGE_RECONCILIATION" in codes(validate(item))
    cases += 1

    flow = evidence_object(
        "quantified_flow",
        {
            "edges": [
                {"origin": "Cash", "destination": "SMH", "value": 45.0},
                {"origin": "Cash", "destination": "DRAM", "value": 35.0},
            ],
            "unit": "% of allocation",
            "window": "creator allocation at publication",
            "residual": 20.0,
            "declared_total": 100.0,
        },
        state="observed",
    )
    item = bundle_with_evidence(flow, request_class="market_series")
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["declared_total"] = 110.0
    assert "FLOW_RECONCILIATION" in codes(validate(item))
    cases += 1

    categories = evidence_object(
        "ordered_categories",
        {
            "items": [
                {"label": "Catalyst", "state": "observed", "source_refs": ["SRC_catalyst"]},
                {"label": "Revenue revision", "state": "conditional", "source_refs": ["SRC_estimates"]},
                {"label": "Price confirmation", "state": "conditional", "source_refs": ["SRC_market"]},
            ],
            "order_basis": "creator's stated confirmation sequence",
        },
        source_refs=["SRC_catalyst", "SRC_estimates", "SRC_market"],
    )
    item = bundle_with_evidence(categories)
    result = validate(item)
    assert result["valid"], result
    cases += 1

    payoff = evidence_object(
        "payoff_series",
        {
            "instrument_terms": [{
                "instrument_ref": "INS_primary",
                "instrument_type": "put",
                "side": "long",
                "strike": 100.0,
                "expiry": "2026-07-31T20:00:00Z",
                "quantity": 1.0,
                "premium": 4.0,
            }],
            "underlying_domain": {"min": 70.0, "max": 130.0, "unit": "USD"},
            "calculation_method": {
                "basis": "terminal_payoff",
                "model": None,
                "assumptions": ["Exercise and assignment costs are excluded."],
            },
            "values": [
                {"underlying": 70.0, "payoff": 26.0},
                {"underlying": 100.0, "payoff": -4.0},
                {"underlying": 130.0, "payoff": -4.0},
            ],
            "unit": "USD per contract share",
        },
        state="modeled",
        formula_ref="FORM_payoff",
    )
    item = bundle_with_evidence(payoff, request_class="market_series")
    item["formulas"] = [{
        "formula_id": "FORM_payoff",
        "label": "Long put terminal payoff",
        "expression": "max(strike - underlying, 0) - premium",
        "input_refs": ["SER_ohlcv"],
        "output_unit": "USD per contract share",
        "window": "at expiry",
        "normalization": "one option contract share",
        "limitations": ["Terminal payoff excludes pre-expiry volatility and time value."],
    }]
    item["render_payload"]["formula_refs"] = ["FORM_payoff"]
    item["quality_report"]["counts"]["formulas"] = 1
    result = validate(item)
    assert result["valid"], result
    cases += 1

    item["evidence_objects"][0]["payload"]["values"][2]["underlying"] = 90.0
    assert "PAYOFF_ORDER" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    item["requirements"][0]["material_to_claim"] = True
    item["render_payload"]["evidence_object_refs"] = []
    assert "MATERIAL_RENDER_OMISSION" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    item["request"]["required_kinds"] = ["quantified_flow"]
    item["requirements"][0]["kind"] = "quantified_flow"
    assert "EVIDENCE_KIND_MISMATCH" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(categories)
    item["evidence_objects"][0]["source_refs"] = ["SRC_catalyst", "SRC_estimates"]
    assert "NESTED_SOURCE_CLOSURE" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    item["evidence_objects"][0]["available_at"] = "2026-07-14T08:01:00Z"
    assert "POST_CUTOFF_DATA" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    item["evidence_objects"][0]["as_of"] = "2026-07-14T08:01:00Z"
    assert "EVIDENCE_AFTER_AS_OF" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    item["render_payload"]["evidence_object_refs"] = ["EOBJ_missing"]
    assert "UNKNOWN_RENDER_REF" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(distribution, request_class="market_series")
    del item["quality_report"]["counts"]["evidence_objects"]
    assert "COUNTS" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(payoff, request_class="market_series")
    item["formulas"] = [{
        "formula_id": "FORM_payoff",
        "label": "Long put terminal payoff",
        "expression": "max(strike - underlying, 0) - premium",
        "input_refs": ["SER_ohlcv"],
        "output_unit": "USD per contract share",
        "window": "at expiry",
        "normalization": "one option contract share",
        "limitations": ["Terminal payoff excludes pre-expiry volatility and time value."],
    }]
    item["render_payload"]["formula_refs"] = ["FORM_payoff"]
    item["quality_report"]["counts"]["formulas"] = 1
    item["evidence_objects"][0]["payload"]["strike"] = 100.0
    assert "UNKNOWN_FIELD" in codes(validate(item))
    cases += 1

    item["evidence_objects"][0]["payload"].pop("strike")
    item["evidence_objects"][0]["payload"]["calculation_method"] = {
        "basis": "pre_expiry_pnl",
        "model": None,
        "assumptions": [],
    }
    assert "PAYOFF_PRICING_MODEL" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(bridge, request_class="market_series")
    item["evidence_objects"][0]["state"] = "derived"
    assert "EVIDENCE_FORMULA_REQUIRED" in codes(validate(item))
    cases += 1

    item = bundle_with_evidence(payoff, request_class="market_series")
    item["formulas"] = [{
        "formula_id": "FORM_payoff",
        "label": "Long put terminal payoff",
        "expression": "max(strike - underlying, 0) - premium",
        "input_refs": ["SER_ohlcv"],
        "output_unit": "USD per contract share",
        "window": "at expiry",
        "normalization": "one option contract share",
        "limitations": ["Terminal payoff excludes pre-expiry volatility and time value."],
    }]
    item["quality_report"]["counts"]["formulas"] = 1
    item["evidence_objects"][0]["payload"]["instrument_terms"][0]["expiry"] = None
    assert "PAYOFF_OPTION_TERMS" in codes(validate(item))
    cases += 1

    print(f"ok: {cases} viewpoint data bundle cases")


class ViewpointDataBundleRegressionTests(unittest.TestCase):
    def test_regression_matrix(self) -> None:
        main()


if __name__ == "__main__":
    main()
