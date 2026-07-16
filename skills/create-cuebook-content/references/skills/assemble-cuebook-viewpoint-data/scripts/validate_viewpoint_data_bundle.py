#!/usr/bin/env python3
"""Validate ViewpointDataBundleV1 cutoff, references, data geometry, and fallbacks."""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_REQUIRED_FIELDS = {
    "schema_version", "bundle_id", "revision", "state", "temporal_mode",
    "lineage", "request", "instruments", "series", "key_values", "events",
    "levels", "formulas", "requirements", "render_payload", "quality_report",
}
ROOT_FIELDS = ROOT_REQUIRED_FIELDS | {"evidence_objects"}
REQUEST_CLASSES = {
    "qualitative_evidence",
    "news_anchor",
    "official_event",
    "valuation_metric",
    "comparison_metric",
    "market_series",
    "price_level",
    "settlement_reference",
}
NON_DEGRADABLE_MATERIAL_CLASSES = {
    "news_anchor",
    "valuation_metric",
    "comparison_metric",
    "price_level",
    "settlement_reference",
}
EXPRESSION_SURFACES = {"text", "visual"}
SERIES_KINDS = {
    "ohlcv", "price", "return", "spread", "flow", "estimate",
    "fundamental", "factor", "positioning", "volume",
}
EVIDENCE_SHAPES = {
    "news_cluster",
    "distribution_sample",
    "quantile_scenarios",
    "part_to_whole",
    "additive_components",
    "quantified_flow",
    "ordered_categories",
    "payoff_series",
}
DATA_KINDS = SERIES_KINDS | {"key_value", "event", "level", "formula"} | EVIDENCE_SHAPES
DATA_KINDS_BY_REQUEST_CLASS = {
    "qualitative_evidence": DATA_KINDS,
    "news_anchor": {"event", "news_cluster"},
    "official_event": {"event"},
    "valuation_metric": {"key_value"},
    "comparison_metric": SERIES_KINDS | {
        "key_value", "distribution_sample", "part_to_whole",
        "additive_components", "quantified_flow", "ordered_categories",
        "payoff_series",
    },
    "market_series": SERIES_KINDS | {
        "distribution_sample", "quantile_scenarios", "additive_components",
        "quantified_flow", "payoff_series",
    },
    "price_level": {"level"},
    "settlement_reference": {"event", "key_value", "level"},
}
SOURCE_TYPES = {
    "issuer", "regulator", "exchange", "government", "filing",
    "newswire", "publisher", "market_data", "creator_source",
}
OFFICIAL_SOURCE_TYPES = {"issuer", "regulator", "exchange", "government", "filing"}
EVENT_ROLES = {
    "catalyst", "decision_cutoff", "deadline", "news", "policy",
    "earnings", "listing", "trade_action",
}
LEVEL_KINDS = {
    "support", "resistance", "trigger", "invalidation", "target",
    "benchmark", "range_boundary",
}
EVENT_FIELDS = {
    "event_id", "label", "at", "available_at", "source_ref",
    "publisher_or_issuer", "source_type", "source_url",
    "supported_fact_refs", "role",
}
LEVEL_FIELDS = {
    "level_id", "label", "instrument_ref", "value", "unit", "kind",
    "source_ref", "fact_refs", "observed_at", "available_at", "explicit",
}
EVIDENCE_OBJECT_FIELDS = {
    "evidence_id", "shape", "label", "state", "as_of", "available_at",
    "source_refs", "formula_ref", "payload",
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def string_list(
    value: Any,
    path: str,
    errors: list[dict[str, str]],
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> list[str]:
    if not isinstance(value, list):
        errors.append(issue("STRING_LIST", path, "Expected an array of unique non-empty strings."))
        return []
    clean: list[str] = []
    for position, item in enumerate(value):
        if not nonempty(item):
            errors.append(issue("STRING_ITEM", f"{path}[{position}]", "Expected a non-empty string."))
        else:
            clean.append(item.strip())
    if len(clean) != len(set(clean)):
        errors.append(issue("STRING_UNIQUE", path, "Strings must be unique."))
    if len(clean) < minimum:
        errors.append(issue("STRING_MIN", path, f"Expected at least {minimum} item(s)."))
    if maximum is not None and len(clean) > maximum:
        errors.append(issue("STRING_MAX", path, f"Expected at most {maximum} item(s)."))
    return clean


def validate_shape(
    value: dict[str, Any],
    path: str,
    required: set[str],
    allowed: set[str],
    errors: list[dict[str, str]],
) -> None:
    for key in sorted(required - set(value)):
        errors.append(issue("MISSING_FIELD", f"{path}.{key}", "Required field is missing."))
    for key in sorted(set(value) - allowed):
        errors.append(issue("UNKNOWN_FIELD", f"{path}.{key}", "Unknown field."))


def parse_time(value: Any, path: str, errors: list[dict[str, str]]) -> datetime | None:
    if not isinstance(value, str) or not value:
        errors.append(issue("TIME_REQUIRED", path, "Timezone-aware ISO timestamp required."))
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        errors.append(issue("TIME_FORMAT", path, "Invalid ISO timestamp."))
        return None
    if parsed.tzinfo is None:
        errors.append(issue("TIMEZONE_REQUIRED", path, "Timestamp must include timezone."))
        return None
    return parsed


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def numeric_list(value: Any, path: str, errors: list[dict[str, str]], *, minimum: int = 1) -> list[float]:
    if not isinstance(value, list):
        errors.append(issue("NUMBER_LIST", path, "Expected an array of finite numbers."))
        return []
    clean: list[float] = []
    for position, item in enumerate(value):
        if not finite(item):
            errors.append(issue("NUMBER_ITEM", f"{path}[{position}]", "Expected a finite number."))
        else:
            clean.append(float(item))
    if len(clean) < minimum:
        errors.append(issue("NUMBER_MIN", path, f"Expected at least {minimum} number(s)."))
    return clean


def reconciles(left: float, right: float) -> bool:
    return math.isclose(left, right, rel_tol=1e-6, abs_tol=1e-9)


def validate_evidence_object(
    item: dict[str, Any],
    path: str,
    *,
    event_index: dict[str, dict[str, Any]],
    instrument_index: dict[str, dict[str, Any]],
    formula_index: dict[str, dict[str, Any]],
    request_grammar: str,
    bundle_as_of: datetime | None,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
) -> tuple[datetime | None, str | None]:
    validate_shape(item, path, EVIDENCE_OBJECT_FIELDS, EVIDENCE_OBJECT_FIELDS, errors)
    shape = item.get("shape")
    if shape not in EVIDENCE_SHAPES:
        errors.append(issue("EVIDENCE_SHAPE", f"{path}.shape", "Unsupported structured evidence shape."))
        shape = None
    if not nonempty(item.get("label")):
        errors.append(issue("EVIDENCE_LABEL", f"{path}.label", "Evidence label is required."))
    state = item.get("state")
    if state not in {"observed", "derived", "modeled", "conditional"}:
        errors.append(issue("EVIDENCE_STATE", f"{path}.state", "Unsupported evidence state."))
    object_as_of = parse_time(item.get("as_of"), f"{path}.as_of", errors)
    if object_as_of and bundle_as_of and object_as_of > bundle_as_of:
        errors.append(issue("EVIDENCE_AFTER_AS_OF", f"{path}.as_of", "Evidence as_of cannot be after the bundle as_of."))
    available = parse_time(item.get("available_at"), f"{path}.available_at", errors)
    source_refs = string_list(item.get("source_refs"), f"{path}.source_refs", errors, minimum=1)
    formula_ref = item.get("formula_ref")
    if formula_ref is not None and formula_ref not in formula_index:
        errors.append(issue("UNKNOWN_FORMULA", f"{path}.formula_ref", f"Unknown formula {formula_ref!r}."))
    if shape in {"quantile_scenarios", "payoff_series"} and formula_ref not in formula_index:
        errors.append(issue("EVIDENCE_FORMULA_REQUIRED", f"{path}.formula_ref", f"{shape} requires a declared formula."))
    if state in {"derived", "modeled"} and shape in {
        "distribution_sample", "part_to_whole", "additive_components", "quantified_flow"
    } and formula_ref not in formula_index:
        errors.append(issue("EVIDENCE_FORMULA_REQUIRED", f"{path}.formula_ref", f"Derived {shape} evidence requires a declared formula."))
    if shape == "quantile_scenarios" and state not in {"modeled", "conditional"}:
        errors.append(issue("QUANTILE_STATE", f"{path}.state", "Quantile scenarios must be labeled modeled or conditional."))

    payload = item.get("payload")
    if not isinstance(payload, dict):
        errors.append(issue("EVIDENCE_PAYLOAD", f"{path}.payload", "Evidence payload must be an object."))
        return available, shape

    def payload_shape(required: set[str]) -> None:
        validate_shape(payload, f"{path}.payload", required, required, errors)

    if shape == "news_cluster":
        fields = {"cluster_id", "event_refs", "cluster_method", "unique_source_count"}
        payload_shape(fields)
        for key in ("cluster_id", "cluster_method"):
            if not nonempty(payload.get(key)):
                errors.append(issue("NEWS_CLUSTER_FIELD", f"{path}.payload.{key}", f"{key} is required."))
        event_refs = string_list(payload.get("event_refs"), f"{path}.payload.event_refs", errors, minimum=2)
        resolved_events = [event_index[ref] for ref in event_refs if ref in event_index]
        for ref in event_refs:
            if ref not in event_index:
                errors.append(issue("NEWS_CLUSTER_EVENT", f"{path}.payload.event_refs", f"Unknown event {ref!r}."))
        qualifying = [
            event for event in resolved_events
            if nonempty(event.get("publisher_or_issuer"))
            and nonempty(event.get("source_url"))
            and bool(event.get("supported_fact_refs"))
        ]
        if len(qualifying) != len(resolved_events):
            errors.append(issue("NEWS_CLUSTER_PROVENANCE", f"{path}.payload.event_refs", "Every clustered event needs publisher, URL, and supported fact refs."))
        event_sources = {event.get("source_ref") for event in resolved_events if nonempty(event.get("source_ref"))}
        unique_source_count = payload.get("unique_source_count")
        if not isinstance(unique_source_count, int) or isinstance(unique_source_count, bool) or unique_source_count < 2:
            errors.append(issue("NEWS_CLUSTER_SOURCE_COUNT", f"{path}.payload.unique_source_count", "unique_source_count must be an integer of at least 2."))
        elif unique_source_count != len(event_sources):
            errors.append(issue("NEWS_CLUSTER_SOURCE_COUNT", f"{path}.payload.unique_source_count", "unique_source_count must equal the deduplicated event source count."))
        if not event_sources.issubset(set(source_refs)):
            errors.append(issue("NEWS_CLUSTER_SOURCE_REFS", f"{path}.source_refs", "Evidence source_refs must include every clustered event source."))

    elif shape == "distribution_sample":
        fields = {
            "observations", "n", "observation_unit", "unit", "window", "population",
            "weights", "quartile_method", "whisker_rule", "outlier_policy",
        }
        payload_shape(fields)
        observations = numeric_list(payload.get("observations"), f"{path}.payload.observations", errors, minimum=2)
        if payload.get("n") != len(observations):
            errors.append(issue("DISTRIBUTION_N", f"{path}.payload.n", "n must equal the number of observations."))
        for key in ("observation_unit", "unit", "window", "population", "weights", "quartile_method", "whisker_rule", "outlier_policy"):
            if not nonempty(payload.get(key)):
                errors.append(issue("DISTRIBUTION_FIELD", f"{path}.payload.{key}", f"{key} is required."))
        if request_grammar == "box_whisker" and len(observations) < 5:
            errors.append(issue("BOX_SAMPLE_TOO_SMALL", f"{path}.payload.observations", "A box-and-whisker view needs at least five observations."))
        elif request_grammar == "box_whisker" and len(observations) < 20:
            warnings.append(issue("BOX_SHOW_RAW_DOTS", f"{path}.payload.observations", "Show raw observations alongside a box summary when n is below 20."))

    elif shape == "quantile_scenarios":
        fields = {
            "cutoff", "horizon", "quantile_levels", "quantile_values", "unit",
            "model_or_method", "model_vintage", "calibration",
        }
        payload_shape(fields)
        quantile_cutoff = parse_time(payload.get("cutoff"), f"{path}.payload.cutoff", errors)
        for key in ("horizon", "unit", "model_or_method", "model_vintage", "calibration"):
            if not nonempty(payload.get(key)):
                errors.append(issue("QUANTILE_FIELD", f"{path}.payload.{key}", f"{key} is required."))
        levels = numeric_list(payload.get("quantile_levels"), f"{path}.payload.quantile_levels", errors, minimum=3)
        if levels and (levels != sorted(set(levels)) or levels[0] <= 0 or levels[-1] >= 1):
            errors.append(issue("QUANTILE_LEVELS", f"{path}.payload.quantile_levels", "Quantile levels must be unique, increasing, and strictly between 0 and 1."))
        rows = payload.get("quantile_values")
        if not isinstance(rows, list) or not rows:
            errors.append(issue("QUANTILE_VALUES", f"{path}.payload.quantile_values", "Quantile values require at least one future row."))
        else:
            prior_t: datetime | None = None
            for position, row in enumerate(rows):
                row_path = f"{path}.payload.quantile_values[{position}]"
                if not isinstance(row, dict):
                    errors.append(issue("QUANTILE_ROW", row_path, "Quantile row must be an object."))
                    continue
                validate_shape(row, row_path, {"t", "values"}, {"t", "values"}, errors)
                row_t = parse_time(row.get("t"), f"{row_path}.t", errors)
                values = numeric_list(row.get("values"), f"{row_path}.values", errors, minimum=len(levels) if levels else 1)
                if levels and len(values) != len(levels):
                    errors.append(issue("QUANTILE_WIDTH", f"{row_path}.values", "Each row must provide one value per quantile level."))
                if values and values != sorted(values):
                    errors.append(issue("QUANTILE_CROSSING", f"{row_path}.values", "Quantile values must be non-decreasing within each row."))
                if row_t and quantile_cutoff and row_t <= quantile_cutoff:
                    errors.append(issue("QUANTILE_BEFORE_CUTOFF", f"{row_path}.t", "Fan observations must begin after the declared cutoff."))
                if row_t and prior_t and row_t <= prior_t:
                    errors.append(issue("QUANTILE_TIME_ORDER", f"{row_path}.t", "Quantile row times must be strictly increasing."))
                if row_t:
                    prior_t = row_t

    elif shape == "part_to_whole":
        fields = {"parts", "denominator", "unit", "basis", "residual"}
        payload_shape(fields)
        parts = payload.get("parts")
        part_total = 0.0
        if not isinstance(parts, list) or len(parts) < 2:
            errors.append(issue("PARTS_REQUIRED", f"{path}.payload.parts", "Part-to-whole evidence needs at least two parts."))
        else:
            labels: list[str] = []
            for position, part in enumerate(parts):
                part_path = f"{path}.payload.parts[{position}]"
                if not isinstance(part, dict):
                    errors.append(issue("PART_TYPE", part_path, "Part must be an object."))
                    continue
                validate_shape(part, part_path, {"label", "value"}, {"label", "value"}, errors)
                if not nonempty(part.get("label")):
                    errors.append(issue("PART_LABEL", f"{part_path}.label", "Part label is required."))
                else:
                    labels.append(part["label"].strip())
                value = part.get("value")
                if not finite(value) or value < 0:
                    errors.append(issue("PART_VALUE", f"{part_path}.value", "Part value must be finite and non-negative."))
                else:
                    part_total += float(value)
            if len(labels) != len(set(labels)):
                errors.append(issue("PART_LABEL_UNIQUE", f"{path}.payload.parts", "Part labels must be unique."))
        denominator = payload.get("denominator")
        residual = payload.get("residual")
        if not finite(denominator) or denominator <= 0:
            errors.append(issue("PART_DENOMINATOR", f"{path}.payload.denominator", "denominator must be positive and finite."))
        if not finite(residual) or residual < 0:
            errors.append(issue("PART_RESIDUAL", f"{path}.payload.residual", "residual must be finite and non-negative."))
        if finite(denominator) and finite(residual) and not reconciles(part_total + float(residual), float(denominator)):
            errors.append(issue("PART_RECONCILIATION", f"{path}.payload", "Parts plus residual must reconcile to the denominator."))
        for key in ("unit", "basis"):
            if not nonempty(payload.get(key)):
                errors.append(issue("PART_FIELD", f"{path}.payload.{key}", f"{key} is required."))

    elif shape == "additive_components":
        fields = {"start", "components", "end", "unit", "period", "residual"}
        payload_shape(fields)
        components = payload.get("components")
        component_total = 0.0
        if not isinstance(components, list) or not components:
            errors.append(issue("COMPONENTS_REQUIRED", f"{path}.payload.components", "Additive evidence needs at least one component."))
        else:
            for position, component in enumerate(components):
                component_path = f"{path}.payload.components[{position}]"
                if not isinstance(component, dict):
                    errors.append(issue("COMPONENT_TYPE", component_path, "Component must be an object."))
                    continue
                validate_shape(component, component_path, {"label", "value"}, {"label", "value"}, errors)
                if not nonempty(component.get("label")):
                    errors.append(issue("COMPONENT_LABEL", f"{component_path}.label", "Component label is required."))
                if not finite(component.get("value")):
                    errors.append(issue("COMPONENT_VALUE", f"{component_path}.value", "Component value must be finite."))
                else:
                    component_total += float(component["value"])
        start, end, residual = payload.get("start"), payload.get("end"), payload.get("residual")
        for key, value in (("start", start), ("end", end), ("residual", residual)):
            if not finite(value):
                errors.append(issue("BRIDGE_VALUE", f"{path}.payload.{key}", f"{key} must be finite."))
        if all(finite(value) for value in (start, end, residual)) and not reconciles(float(start) + component_total + float(residual), float(end)):
            errors.append(issue("BRIDGE_RECONCILIATION", f"{path}.payload", "Start, components, and residual must reconcile to end."))
        for key in ("unit", "period"):
            if not nonempty(payload.get(key)):
                errors.append(issue("BRIDGE_FIELD", f"{path}.payload.{key}", f"{key} is required."))

    elif shape == "quantified_flow":
        fields = {"edges", "unit", "window", "residual", "declared_total"}
        payload_shape(fields)
        edges = payload.get("edges")
        edge_total = 0.0
        edge_keys: list[tuple[str, str]] = []
        if not isinstance(edges, list) or not edges:
            errors.append(issue("FLOW_EDGES", f"{path}.payload.edges", "Quantified flow needs at least one edge."))
        else:
            for position, edge in enumerate(edges):
                edge_path = f"{path}.payload.edges[{position}]"
                if not isinstance(edge, dict):
                    errors.append(issue("FLOW_EDGE_TYPE", edge_path, "Flow edge must be an object."))
                    continue
                validate_shape(edge, edge_path, {"origin", "destination", "value"}, {"origin", "destination", "value"}, errors)
                origin, destination = edge.get("origin"), edge.get("destination")
                if not nonempty(origin) or not nonempty(destination) or origin == destination:
                    errors.append(issue("FLOW_EDGE_ENDPOINT", edge_path, "Flow edge needs distinct origin and destination labels."))
                else:
                    edge_keys.append((origin.strip(), destination.strip()))
                value = edge.get("value")
                if not finite(value) or value < 0:
                    errors.append(issue("FLOW_EDGE_VALUE", f"{edge_path}.value", "Flow value must be finite and non-negative."))
                else:
                    edge_total += float(value)
            if len(edge_keys) != len(set(edge_keys)):
                errors.append(issue("FLOW_EDGE_UNIQUE", f"{path}.payload.edges", "Flow edges must be unique."))
        residual, declared_total = payload.get("residual"), payload.get("declared_total")
        if not finite(residual) or residual < 0:
            errors.append(issue("FLOW_RESIDUAL", f"{path}.payload.residual", "Flow residual must be finite and non-negative."))
        if not finite(declared_total) or declared_total < 0:
            errors.append(issue("FLOW_TOTAL", f"{path}.payload.declared_total", "Declared total must be finite and non-negative."))
        if finite(residual) and finite(declared_total) and not reconciles(edge_total + float(residual), float(declared_total)):
            errors.append(issue("FLOW_RECONCILIATION", f"{path}.payload", "Measured edges plus residual must reconcile to the declared total."))
        for key in ("unit", "window"):
            if not nonempty(payload.get(key)):
                errors.append(issue("FLOW_FIELD", f"{path}.payload.{key}", f"{key} is required."))

    elif shape == "ordered_categories":
        fields = {"items", "order_basis"}
        payload_shape(fields)
        if not nonempty(payload.get("order_basis")):
            errors.append(issue("CATEGORY_ORDER", f"{path}.payload.order_basis", "order_basis is required."))
        items = payload.get("items")
        if not isinstance(items, list) or len(items) < 2:
            errors.append(issue("CATEGORY_ITEMS", f"{path}.payload.items", "Ordered categories need at least two items."))
        else:
            labels: list[str] = []
            for position, category in enumerate(items):
                category_path = f"{path}.payload.items[{position}]"
                if not isinstance(category, dict):
                    errors.append(issue("CATEGORY_TYPE", category_path, "Category must be an object."))
                    continue
                fields = {"label", "state", "source_refs"}
                validate_shape(category, category_path, fields, fields, errors)
                if nonempty(category.get("label")):
                    labels.append(category["label"].strip())
                else:
                    errors.append(issue("CATEGORY_LABEL", f"{category_path}.label", "Category label is required."))
                if category.get("state") not in {"observed", "derived", "conditional"}:
                    errors.append(issue("CATEGORY_STATE", f"{category_path}.state", "Unsupported category state."))
                category_sources = string_list(category.get("source_refs"), f"{category_path}.source_refs", errors, minimum=1)
                if not set(category_sources).issubset(set(source_refs)):
                    errors.append(issue("NESTED_SOURCE_CLOSURE", f"{category_path}.source_refs", "Nested source refs must be declared by the evidence object."))
            if len(labels) != len(set(labels)):
                errors.append(issue("CATEGORY_LABEL_UNIQUE", f"{path}.payload.items", "Category labels must be unique."))

    elif shape == "payoff_series":
        fields = {
            "instrument_terms", "underlying_domain", "calculation_method", "values", "unit",
        }
        payload_shape(fields)
        terms = payload.get("instrument_terms")
        term_strikes: list[float] = []
        if not isinstance(terms, list) or not terms:
            errors.append(issue("PAYOFF_TERMS", f"{path}.payload.instrument_terms", "Payoff evidence needs at least one instrument term."))
        else:
            for position, term in enumerate(terms):
                term_path = f"{path}.payload.instrument_terms[{position}]"
                if not isinstance(term, dict):
                    errors.append(issue("PAYOFF_TERM_TYPE", term_path, "Instrument term must be an object."))
                    continue
                term_fields = {"instrument_ref", "instrument_type", "side", "strike", "expiry", "quantity", "premium"}
                validate_shape(term, term_path, term_fields, term_fields, errors)
                if term.get("instrument_ref") not in instrument_index:
                    errors.append(issue("PAYOFF_INSTRUMENT", f"{term_path}.instrument_ref", "Instrument term must resolve to a bundle instrument."))
                if term.get("instrument_type") not in {"equity", "future", "call", "put", "custom"}:
                    errors.append(issue("PAYOFF_INSTRUMENT_TYPE", f"{term_path}.instrument_type", "Unsupported payoff instrument type."))
                if term.get("side") not in {"long", "short"}:
                    errors.append(issue("PAYOFF_SIDE", f"{term_path}.side", "Payoff side must be long or short."))
                if term.get("strike") is not None and not finite(term.get("strike")):
                    errors.append(issue("PAYOFF_TERM_STRIKE", f"{term_path}.strike", "Term strike must be finite or null."))
                elif finite(term.get("strike")):
                    term_strikes.append(float(term["strike"]))
                if term.get("expiry") is not None:
                    parse_time(term.get("expiry"), f"{term_path}.expiry", errors)
                if term.get("instrument_type") in {"call", "put"} and (term.get("strike") is None or term.get("expiry") is None):
                    errors.append(issue("PAYOFF_OPTION_TERMS", term_path, "Option terms require both strike and expiry."))
                if not finite(term.get("quantity")) or term.get("quantity") == 0:
                    errors.append(issue("PAYOFF_TERM_QUANTITY", f"{term_path}.quantity", "Term quantity must be finite and non-zero."))
                if not finite(term.get("premium")) or term.get("premium") < 0:
                    errors.append(issue("PAYOFF_TERM_PREMIUM", f"{term_path}.premium", "Term premium must be finite and non-negative."))
        domain = payload.get("underlying_domain")
        if not isinstance(domain, dict):
            errors.append(issue("PAYOFF_DOMAIN", f"{path}.payload.underlying_domain", "Underlying domain must be an object."))
            domain_min = domain_max = None
        else:
            domain_fields = {"min", "max", "unit"}
            validate_shape(domain, f"{path}.payload.underlying_domain", domain_fields, domain_fields, errors)
            domain_min, domain_max = domain.get("min"), domain.get("max")
            if not finite(domain_min) or not finite(domain_max) or domain_min >= domain_max:
                errors.append(issue("PAYOFF_DOMAIN_RANGE", f"{path}.payload.underlying_domain", "Underlying domain needs finite min below max."))
            if not nonempty(domain.get("unit")):
                errors.append(issue("PAYOFF_DOMAIN_UNIT", f"{path}.payload.underlying_domain.unit", "Underlying domain unit is required."))
            for strike in term_strikes:
                if finite(domain_min) and finite(domain_max) and not domain_min <= strike <= domain_max:
                    errors.append(issue("PAYOFF_STRIKE_DOMAIN", f"{path}.payload.instrument_terms", "Every strike must lie inside the declared underlying domain."))
        method = payload.get("calculation_method")
        if not isinstance(method, dict):
            errors.append(issue("PAYOFF_METHOD", f"{path}.payload.calculation_method", "calculation_method must be an object."))
        else:
            method_fields = {"basis", "model", "assumptions"}
            validate_shape(method, f"{path}.payload.calculation_method", method_fields, method_fields, errors)
            basis = method.get("basis")
            if basis not in {"terminal_payoff", "pre_expiry_pnl"}:
                errors.append(issue("PAYOFF_BASIS", f"{path}.payload.calculation_method.basis", "Payoff basis must be terminal_payoff or pre_expiry_pnl."))
            model = method.get("model")
            if model is not None and not nonempty(model):
                errors.append(issue("PAYOFF_MODEL", f"{path}.payload.calculation_method.model", "model must be non-empty or null."))
            assumptions = string_list(method.get("assumptions"), f"{path}.payload.calculation_method.assumptions", errors)
            if basis == "pre_expiry_pnl" and (not nonempty(model) or not assumptions):
                errors.append(issue("PAYOFF_PRICING_MODEL", f"{path}.payload.calculation_method", "Pre-expiry PnL requires a pricing model and assumptions."))
        if not nonempty(payload.get("unit")):
            errors.append(issue("PAYOFF_TEXT_FIELD", f"{path}.payload.unit", "unit is required."))
        values = payload.get("values")
        if not isinstance(values, list) or len(values) < 2:
            errors.append(issue("PAYOFF_VALUES", f"{path}.payload.values", "Payoff evidence needs at least two calculated points."))
        else:
            prior_underlying: float | None = None
            for position, point in enumerate(values):
                point_path = f"{path}.payload.values[{position}]"
                if not isinstance(point, dict):
                    errors.append(issue("PAYOFF_POINT_TYPE", point_path, "Payoff point must be an object."))
                    continue
                validate_shape(point, point_path, {"underlying", "payoff"}, {"underlying", "payoff"}, errors)
                underlying, payoff = point.get("underlying"), point.get("payoff")
                if not finite(underlying) or not finite(payoff):
                    errors.append(issue("PAYOFF_POINT", point_path, "Payoff point values must be finite."))
                    continue
                if prior_underlying is not None and underlying <= prior_underlying:
                    errors.append(issue("PAYOFF_ORDER", f"{point_path}.underlying", "Underlying values must be strictly increasing."))
                prior_underlying = float(underlying)

    return available, shape


def unique_objects(
    items: Any,
    field: str,
    path: str,
    prefix: str,
    errors: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    if not isinstance(items, list):
        errors.append(issue("ARRAY_REQUIRED", path, "Expected an array."))
        return [], {}
    clean: list[dict[str, Any]] = []
    index: dict[str, dict[str, Any]] = {}
    for position, item in enumerate(items):
        item_path = f"{path}[{position}]"
        if not isinstance(item, dict):
            errors.append(issue("OBJECT_REQUIRED", item_path, "Expected an object."))
            continue
        ref = item.get(field)
        if not isinstance(ref, str) or not ref.startswith(prefix):
            errors.append(issue("ID_FORMAT", f"{item_path}.{field}", f"Expected {prefix}* ID."))
            continue
        if ref in index:
            errors.append(issue("DUPLICATE_ID", f"{item_path}.{field}", f"Duplicate ID {ref!r}."))
            continue
        clean.append(item)
        index[ref] = item
    return clean, index


def validate(payload: Any, *, expression_plan: Any | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ViewpointDataBundleV1 must be an object.")], "warnings": []}

    for key in sorted(ROOT_REQUIRED_FIELDS - set(payload)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    for key in sorted(set(payload) - ROOT_FIELDS):
        errors.append(issue("UNKNOWN_ROOT_FIELD", f"$.{key}", "Unknown root field."))
    if payload.get("schema_version") != "viewpoint-data-bundle-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected viewpoint-data-bundle-v1."))
    if not re.fullmatch(r"VDATA_[A-Za-z0-9_:-]{8,96}", str(payload.get("bundle_id") or "")):
        errors.append(issue("BUNDLE_ID", "$.bundle_id", "Invalid VDATA_* bundle ID."))
    if not isinstance(payload.get("revision"), int) or payload.get("revision", 0) < 1:
        errors.append(issue("REVISION", "$.revision", "revision must be a positive integer."))
    state = payload.get("state")
    if state not in {"ready", "conditional", "blocked"}:
        errors.append(issue("STATE", "$.state", "Unsupported state."))
    temporal_mode = payload.get("temporal_mode")
    if temporal_mode not in {"declaration", "tracking", "replay"}:
        errors.append(issue("TEMPORAL_MODE", "$.temporal_mode", "Unsupported temporal mode."))

    lineage = payload.get("lineage") if isinstance(payload.get("lineage"), dict) else {}
    if not lineage:
        errors.append(issue("LINEAGE_TYPE", "$.lineage", "lineage must be an object."))
    else:
        lineage_fields = {
            "expression_plan_ref", "meaning_fingerprint", "research_pack_ref",
            "input_artifact_refs", "decision_cutoff_at", "as_of",
        }
        validate_shape(lineage, "$.lineage", lineage_fields, lineage_fields, errors)
    expression_ref = lineage.get("expression_plan_ref")
    if not re.fullmatch(r"(?:CEXP|EXPR)_[A-Za-z0-9_:-]+@r[1-9][0-9]*", str(expression_ref or "")):
        errors.append(issue("EXPRESSION_REF", "$.lineage.expression_plan_ref", "Expression plan ref must be revision-qualified as CEXP_*@rN or EXPR_*@rN."))
    fingerprint = lineage.get("meaning_fingerprint")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(fingerprint or "")):
        errors.append(issue("MEANING_FINGERPRINT", "$.lineage.meaning_fingerprint", "Expected a sha256 fingerprint."))
    input_refs = string_list(lineage.get("input_artifact_refs"), "$.lineage.input_artifact_refs", errors, minimum=1)
    if isinstance(expression_ref, str) and expression_ref not in input_refs:
        errors.append(issue("EXPRESSION_INPUT_REF", "$.lineage.input_artifact_refs", "The revision-qualified expression plan ref must appear in input_artifact_refs."))
    cutoff = parse_time(lineage.get("decision_cutoff_at"), "$.lineage.decision_cutoff_at", errors)
    as_of = parse_time(lineage.get("as_of"), "$.lineage.as_of", errors)
    if cutoff and as_of and as_of < cutoff:
        errors.append(issue("AS_OF_BEFORE_CUTOFF", "$.lineage.as_of", "as_of cannot precede the decision cutoff."))

    request = payload.get("request") if isinstance(payload.get("request"), dict) else {}
    if not request:
        errors.append(issue("REQUEST_TYPE", "$.request", "request must be an object."))
    else:
        request_fields = {"grammar", "visual_job", "required_kinds", "fallback_modes"}
        validate_shape(request, "$.request", request_fields, request_fields, errors)
    if not str(request.get("grammar") or "").strip():
        errors.append(issue("GRAMMAR", "$.request.grammar", "grammar is required."))
    if not str(request.get("visual_job") or "").strip():
        errors.append(issue("VISUAL_JOB", "$.request.visual_job", "visual_job is required."))
    required_kinds = string_list(request.get("required_kinds"), "$.request.required_kinds", errors, minimum=1)
    if any(kind not in DATA_KINDS for kind in required_kinds):
        errors.append(issue("REQUIRED_KIND", "$.request.required_kinds", "required_kinds contains an unsupported primitive kind."))
    fallback_modes = string_list(request.get("fallback_modes"), "$.request.fallback_modes", errors)
    if any(mode not in {"qualitative", "key_numbers", "series", "mixed"} for mode in fallback_modes):
        errors.append(issue("FALLBACK_MODE", "$.request.fallback_modes", "fallback_modes contains an unsupported mode."))

    instruments, instrument_index = unique_objects(payload.get("instruments"), "instrument_id", "$.instruments", "INS_", errors)
    series, series_index = unique_objects(payload.get("series"), "series_id", "$.series", "SER_", errors)
    values, value_index = unique_objects(payload.get("key_values"), "value_id", "$.key_values", "VAL_", errors)
    events, event_index = unique_objects(payload.get("events"), "event_id", "$.events", "EV_", errors)
    levels, level_index = unique_objects(payload.get("levels"), "level_id", "$.levels", "LVL_", errors)
    formulas, formula_index = unique_objects(payload.get("formulas"), "formula_id", "$.formulas", "FORM_", errors)
    evidence_objects, evidence_object_index = unique_objects(
        payload.get("evidence_objects", []), "evidence_id", "$.evidence_objects", "EOBJ_", errors
    )
    requirements, requirement_index = unique_objects(payload.get("requirements"), "requirement_id", "$.requirements", "REQ_", errors)

    all_ids: dict[str, str] = {}
    for group_name, index in (
        ("instrument", instrument_index), ("series", series_index), ("value", value_index),
        ("event", event_index), ("level", level_index), ("formula", formula_index),
        ("evidence_object", evidence_object_index), ("requirement", requirement_index),
    ):
        for ref in index:
            if ref in all_ids:
                errors.append(issue("CROSS_TYPE_DUPLICATE_ID", "$", f"{ref!r} is both {all_ids[ref]} and {group_name}."))
            all_ids[ref] = group_name

    for position, instrument in enumerate(instruments):
        path = f"$.instruments[{position}]"
        for key in ("entity_ref", "symbol", "venue", "mapping_source_ref"):
            if not str(instrument.get(key) or "").strip():
                errors.append(issue("INSTRUMENT_FIELD", f"{path}.{key}", f"{key} is required."))
        if instrument.get("role") == "proxy" and not str(instrument.get("mapping_limitation") or "").strip():
            errors.append(issue("PROXY_LIMITATION", f"{path}.mapping_limitation", "A proxy requires an explicit mapping limitation."))

    timed_items: list[tuple[str, datetime | None]] = []
    for position, item in enumerate(series):
        path = f"$.series[{position}]"
        instrument_refs = string_list(item.get("instrument_refs"), f"{path}.instrument_refs", errors, minimum=1)
        for ref in instrument_refs:
            if ref not in instrument_index:
                errors.append(issue("UNKNOWN_INSTRUMENT", f"{path}.instrument_refs", f"Unknown instrument {ref!r}."))
        kind = item.get("kind")
        if kind not in SERIES_KINDS:
            errors.append(issue("SERIES_KIND", f"{path}.kind", "Unsupported series kind."))
        for key in ("label", "unit", "interval", "timezone", "source_ref"):
            if not nonempty(item.get(key)):
                errors.append(issue("SERIES_FIELD", f"{path}.{key}", f"{key} is required."))
        formula_ref = item.get("formula_ref")
        if kind in {"return", "spread", "factor"} and formula_ref not in formula_index:
            errors.append(issue("SERIES_FORMULA_REQUIRED", f"{path}.formula_ref", f"{kind} series requires a declared formula."))
        elif formula_ref is not None and formula_ref not in formula_index:
            errors.append(issue("UNKNOWN_FORMULA", f"{path}.formula_ref", f"Unknown formula {formula_ref!r}."))
        points = item.get("points")
        if not isinstance(points, list) or not points:
            errors.append(issue("POINTS_REQUIRED", f"{path}.points", "Series requires observed points."))
            continue
        prior_t: datetime | None = None
        seen_times: set[datetime] = set()
        for point_position, point in enumerate(points):
            point_path = f"{path}.points[{point_position}]"
            if not isinstance(point, dict):
                errors.append(issue("POINT_TYPE", point_path, "Point must be an object."))
                continue
            point_t = parse_time(point.get("t"), f"{point_path}.t", errors)
            available = parse_time(point.get("available_at"), f"{point_path}.available_at", errors)
            timed_items.append((f"{point_path}.available_at", available))
            if point_t and prior_t and point_t <= prior_t:
                errors.append(issue("POINT_ORDER", f"{point_path}.t", "Point times must be strictly increasing."))
            if point_t and point_t in seen_times:
                errors.append(issue("DUPLICATE_POINT_TIME", f"{point_path}.t", "Duplicate point time."))
            if point_t:
                prior_t = point_t
                seen_times.add(point_t)
                if as_of and point_t > as_of:
                    errors.append(issue("POINT_AFTER_AS_OF", f"{point_path}.t", "Observed point cannot be after bundle as_of."))
            if not str(point.get("source_ref") or "").strip():
                errors.append(issue("POINT_SOURCE", f"{point_path}.source_ref", "Point source is required."))
            if point.get("state") == "forming" and point_position != len(points) - 1:
                errors.append(issue("FORMING_NOT_LAST", f"{point_path}.state", "Only the final point may be forming."))
            if kind == "ohlcv":
                prices = {key: point.get(key) for key in ("o", "h", "l", "c")}
                if not all(finite(value) for value in prices.values()):
                    errors.append(issue("OHLC_REQUIRED", point_path, "OHLC series requires finite o, h, l, and c."))
                else:
                    if prices["h"] < max(prices.values()):
                        errors.append(issue("OHLC_HIGH", f"{point_path}.h", "High must be the maximum OHLC value."))
                    if prices["l"] > min(prices.values()):
                        errors.append(issue("OHLC_LOW", f"{point_path}.l", "Low must be the minimum OHLC value."))
                if "value" in point:
                    errors.append(issue("OHLC_VALUE_MIX", f"{point_path}.value", "OHLC points cannot also carry value."))
                if "v" in point and (not finite(point.get("v")) or point.get("v") < 0):
                    errors.append(issue("VOLUME", f"{point_path}.v", "Volume must be finite and non-negative."))
            else:
                if not finite(point.get("value")):
                    errors.append(issue("VALUE_REQUIRED", f"{point_path}.value", "Non-OHLC series requires a finite value."))
                if any(key in point for key in ("o", "h", "l", "c", "v")):
                    errors.append(issue("VALUE_OHLC_MIX", point_path, "Value points cannot carry OHLCV fields."))

    for position, item in enumerate(values):
        path = f"$.key_values[{position}]"
        value_fields = {
            "value_id", "label", "instrument_refs", "numeric_value", "display_value",
            "unit", "as_of", "available_at", "source_ref", "evidence_kind",
            "formula_ref", "role", "valuation_basis",
        }
        validate_shape(item, path, value_fields, value_fields, errors)
        for key in ("label", "display_value", "unit", "source_ref"):
            if not nonempty(item.get(key)):
                errors.append(issue("KEY_VALUE_FIELD", f"{path}.{key}", f"{key} is required."))
        instrument_refs = string_list(item.get("instrument_refs"), f"{path}.instrument_refs", errors, minimum=1)
        for ref in instrument_refs:
            if ref not in instrument_index:
                errors.append(issue("UNKNOWN_INSTRUMENT", f"{path}.instrument_refs", f"Unknown instrument {ref!r}."))
        numeric = item.get("numeric_value")
        if numeric is not None and not finite(numeric):
            errors.append(issue("KEY_VALUE_NUMERIC", f"{path}.numeric_value", "numeric_value must be finite or null."))
        if not str(item.get("display_value") or "").strip():
            errors.append(issue("DISPLAY_VALUE", f"{path}.display_value", "display_value is required."))
        if item.get("evidence_kind") not in {"observed", "reported", "derived", "analogy"}:
            errors.append(issue("EVIDENCE_KIND", f"{path}.evidence_kind", "Unsupported key-value evidence kind."))
        if item.get("role") not in {"driver", "comparison", "magnitude", "risk", "context"}:
            errors.append(issue("KEY_VALUE_ROLE", f"{path}.role", "Unsupported key-value role."))
        available = parse_time(item.get("available_at"), f"{path}.available_at", errors)
        parse_time(item.get("as_of"), f"{path}.as_of", errors)
        timed_items.append((f"{path}.available_at", available))
        formula_ref = item.get("formula_ref")
        if item.get("evidence_kind") == "derived" and formula_ref not in formula_index:
            errors.append(issue("VALUE_FORMULA_REQUIRED", f"{path}.formula_ref", "Derived values require a declared formula."))
        elif formula_ref is not None and formula_ref not in formula_index:
            errors.append(issue("UNKNOWN_FORMULA", f"{path}.formula_ref", f"Unknown formula {formula_ref!r}."))
        valuation_basis = item.get("valuation_basis")
        if valuation_basis is not None:
            valuation_fields = {
                "metric_name", "numerator", "denominator", "denominator_value",
                "period_basis", "accounting_basis", "currency_treatment",
                "share_class", "comparability_notes",
            }
            if not isinstance(valuation_basis, dict):
                errors.append(issue("VALUATION_BASIS_TYPE", f"{path}.valuation_basis", "valuation_basis must be an object or null."))
            else:
                validate_shape(valuation_basis, f"{path}.valuation_basis", valuation_fields, valuation_fields, errors)
                for key in ("metric_name", "numerator", "denominator", "accounting_basis", "currency_treatment", "share_class"):
                    if not nonempty(valuation_basis.get(key)):
                        errors.append(issue("VALUATION_BASIS_FIELD", f"{path}.valuation_basis.{key}", f"{key} is required."))
                if valuation_basis.get("period_basis") not in {"trailing", "forward", "current", "point_in_time", "not_applicable"}:
                    errors.append(issue("VALUATION_PERIOD", f"{path}.valuation_basis.period_basis", "Unsupported valuation period basis."))
                denominator_value = valuation_basis.get("denominator_value")
                if denominator_value is not None and not finite(denominator_value):
                    errors.append(issue("VALUATION_DENOMINATOR", f"{path}.valuation_basis.denominator_value", "denominator_value must be finite or null."))
                metric_name = str(valuation_basis.get("metric_name") or "").strip().lower().replace(" ", "")
                if metric_name in {"p/e", "pe", "price/earnings"} and finite(denominator_value) and denominator_value <= 0:
                    if numeric is not None or str(item.get("display_value") or "").strip().upper() != "N/M":
                        errors.append(issue("PE_NOT_MEANINGFUL", path, "P/E with non-positive earnings must use numeric_value null and display_value N/M."))

    for position, item in enumerate(events):
        path = f"$.events[{position}]"
        validate_shape(item, path, EVENT_FIELDS, EVENT_FIELDS, errors)
        if not nonempty(item.get("label")):
            errors.append(issue("EVENT_LABEL", f"{path}.label", "Event label is required."))
        parse_time(item.get("at"), f"{path}.at", errors)
        available = parse_time(item.get("available_at"), f"{path}.available_at", errors)
        timed_items.append((f"{path}.available_at", available))
        if not nonempty(item.get("source_ref")):
            errors.append(issue("EVENT_SOURCE", f"{path}.source_ref", "Event source is required."))
        if item.get("publisher_or_issuer") is not None and not nonempty(item.get("publisher_or_issuer")):
            errors.append(issue("EVENT_PUBLISHER", f"{path}.publisher_or_issuer", "Publisher or issuer must be non-empty or null."))
        if item.get("source_type") not in SOURCE_TYPES:
            errors.append(issue("EVENT_SOURCE_TYPE", f"{path}.source_type", "Unsupported event source type."))
        source_url = item.get("source_url")
        if source_url is not None and (not nonempty(source_url) or not re.fullmatch(r"https?://\S+", source_url)):
            errors.append(issue("EVENT_SOURCE_URL", f"{path}.source_url", "Event source URL must be an absolute HTTP(S) URL or null."))
        string_list(item.get("supported_fact_refs"), f"{path}.supported_fact_refs", errors)
        if item.get("role") not in EVENT_ROLES:
            errors.append(issue("EVENT_ROLE", f"{path}.role", "Unsupported event role."))

    for position, item in enumerate(levels):
        path = f"$.levels[{position}]"
        validate_shape(item, path, LEVEL_FIELDS, LEVEL_FIELDS, errors)
        for key in ("label", "unit", "source_ref"):
            if not nonempty(item.get(key)):
                errors.append(issue("LEVEL_FIELD", f"{path}.{key}", f"{key} is required."))
        if item.get("instrument_ref") not in instrument_index:
            errors.append(issue("LEVEL_INSTRUMENT", f"{path}.instrument_ref", "Level instrument_ref must resolve to an instrument."))
        if not finite(item.get("value")):
            errors.append(issue("LEVEL_VALUE", f"{path}.value", "Level value must be finite."))
        if item.get("kind") not in LEVEL_KINDS:
            errors.append(issue("LEVEL_KIND", f"{path}.kind", "Unsupported level kind."))
        string_list(item.get("fact_refs"), f"{path}.fact_refs", errors, minimum=1)
        if not isinstance(item.get("explicit"), bool):
            errors.append(issue("LEVEL_EXPLICIT", f"{path}.explicit", "Level explicit must be boolean."))
        parse_time(item.get("observed_at"), f"{path}.observed_at", errors)
        available = parse_time(item.get("available_at"), f"{path}.available_at", errors)
        timed_items.append((f"{path}.available_at", available))

    data_ids = set(series_index) | set(value_index) | set(event_index) | set(level_index)
    for position, item in enumerate(formulas):
        path = f"$.formulas[{position}]"
        input_refs = item.get("input_refs")
        if not isinstance(input_refs, list) or not input_refs:
            errors.append(issue("FORMULA_INPUTS", f"{path}.input_refs", "Formula requires input refs."))
            input_refs = []
        for ref in input_refs:
            if ref not in data_ids:
                errors.append(issue("UNKNOWN_FORMULA_INPUT", f"{path}.input_refs", f"Unknown formula input {ref!r}."))
        for key in ("expression", "output_unit", "window", "normalization"):
            if not str(item.get(key) or "").strip():
                errors.append(issue("FORMULA_FIELD", f"{path}.{key}", f"{key} is required."))
        limitations = item.get("limitations")
        if not isinstance(limitations, list) or not limitations:
            errors.append(issue("FORMULA_LIMITATIONS", f"{path}.limitations", "Formula requires at least one limitation."))

    for position, item in enumerate(evidence_objects):
        path = f"$.evidence_objects[{position}]"
        available, _ = validate_evidence_object(
            item,
            path,
            event_index=event_index,
            instrument_index=instrument_index,
            formula_index=formula_index,
            request_grammar=str(request.get("grammar") or ""),
            bundle_as_of=as_of,
            errors=errors,
            warnings=warnings,
        )
        timed_items.append((f"{path}.available_at", available))

    if temporal_mode == "declaration" and cutoff:
        for path, available in timed_items:
            if available and available > cutoff:
                errors.append(issue("POST_CUTOFF_DATA", path, "Declaration bundle cannot use data first available after the decision cutoff."))

    resolvable_ids = data_ids | set(formula_index) | set(evidence_object_index)
    missing_required = 0
    degraded_required = 0
    nondegradable_gap_count = 0
    material_visual_refs: set[str] = set()
    upstream_requirement_ids: dict[str, tuple[dict[str, Any], str]] = {}
    requirement_fields = {
        "requirement_id",
        "expression_plan_requirement_ref",
        "kind",
        "request_class",
        "required",
        "material_to_claim",
        "expression_surfaces",
        "status",
        "resolved_refs",
        "missing_reason",
        "fallback",
    }
    for position, item in enumerate(requirements):
        path = f"$.requirements[{position}]"
        validate_shape(item, path, requirement_fields, requirement_fields, errors)

        upstream_ref = item.get("expression_plan_requirement_ref")
        expected_prefix = f"{expression_ref}#/data_requirements/" if isinstance(expression_ref, str) else ""
        if not isinstance(upstream_ref, str) or not expected_prefix or not upstream_ref.startswith(expected_prefix):
            errors.append(issue("UPSTREAM_REQUIREMENT_REF", f"{path}.expression_plan_requirement_ref", "Requirement ref must point into lineage.expression_plan_ref#/data_requirements/."))
            upstream_id = None
        else:
            upstream_id = upstream_ref.removeprefix(expected_prefix)
            if not re.fullmatch(r"D[1-9][0-9]*", upstream_id):
                errors.append(issue("UPSTREAM_REQUIREMENT_REF", f"{path}.expression_plan_requirement_ref", "Upstream requirement fragment must end in a D* requirement ID."))
                upstream_id = None
            elif upstream_id in upstream_requirement_ids:
                errors.append(issue("UPSTREAM_REQUIREMENT_UNIQUE", f"{path}.expression_plan_requirement_ref", "Each expression-plan requirement may appear only once in a bundle."))
            else:
                upstream_requirement_ids[upstream_id] = (item, path)

        kind = item.get("kind")
        if kind not in DATA_KINDS:
            errors.append(issue("REQUIREMENT_KIND", f"{path}.kind", "Unsupported requirement primitive kind."))
        elif kind not in required_kinds:
            warnings.append(issue("UNREQUESTED_REQUIREMENT", f"{path}.kind", "Requirement kind is absent from request.required_kinds."))

        request_class = item.get("request_class")
        if request_class not in REQUEST_CLASSES:
            errors.append(issue("REQUEST_CLASS", f"{path}.request_class", "Unsupported request class."))
        elif kind in DATA_KINDS and kind not in DATA_KINDS_BY_REQUEST_CLASS[request_class]:
            errors.append(issue("REQUEST_CLASS_KIND", f"{path}.kind", f"{request_class} cannot be resolved as {kind}."))

        required_value = item.get("required")
        if not isinstance(required_value, bool):
            errors.append(issue("REQUIREMENT_REQUIRED", f"{path}.required", "required must be boolean."))
        required = required_value is True
        material_to_claim = item.get("material_to_claim")
        if not isinstance(material_to_claim, bool):
            errors.append(issue("REQUIREMENT_MATERIAL", f"{path}.material_to_claim", "material_to_claim must be boolean."))
        elif material_to_claim and not required:
            errors.append(issue("MATERIAL_MUST_BE_REQUIRED", path, "A material creator request must remain required."))
        surfaces = set(
            string_list(
                item.get("expression_surfaces"),
                f"{path}.expression_surfaces",
                errors,
                minimum=1,
                maximum=2,
            )
        )
        if not surfaces.issubset(EXPRESSION_SURFACES):
            errors.append(issue("EXPRESSION_SURFACE", f"{path}.expression_surfaces", "Expression surfaces must be text and/or visual."))

        refs = string_list(item.get("resolved_refs"), f"{path}.resolved_refs", errors)
        for ref in refs:
            if ref not in resolvable_ids:
                errors.append(issue("UNKNOWN_REQUIREMENT_REF", f"{path}.resolved_refs", f"Unknown resolved ref {ref!r}."))
        status = item.get("status")
        if status not in {"available", "degraded", "missing", "not_applicable"}:
            errors.append(issue("REQUIREMENT_STATUS", f"{path}.status", "Unsupported requirement status."))
        fallback = item.get("fallback")
        nondegradable = required and material_to_claim is True and request_class in NON_DEGRADABLE_MATERIAL_CLASSES
        if status in {"available", "degraded"} and not refs:
            errors.append(issue("AVAILABLE_WITHOUT_DATA", f"{path}.resolved_refs", f"{status} requirement needs resolved data."))
        if status == "available" and item.get("missing_reason") is not None:
            errors.append(issue("AVAILABLE_WITH_MISSING_REASON", f"{path}.missing_reason", "Available data cannot carry a missing reason."))
        if status == "available" and fallback is not None:
            errors.append(issue("AVAILABLE_WITH_FALLBACK", f"{path}.fallback", "Available data cannot carry a fallback."))
        if status == "available" and material_to_claim is True and "visual" in surfaces:
            material_visual_refs.update(ref for ref in refs if ref in resolvable_ids)
        if status == "missing":
            if not nonempty(item.get("missing_reason")):
                errors.append(issue("MISSING_REASON", f"{path}.missing_reason", "Missing requirement needs a reason."))
            if required:
                missing_required += 1
                if not nondegradable and not isinstance(fallback, dict):
                    errors.append(issue("MISSING_WITHOUT_FALLBACK", f"{path}.fallback", "Missing required data needs an allowed fallback or blocks the visual."))
        if status == "degraded" and required:
            degraded_required += 1
            if not nonempty(item.get("missing_reason")):
                errors.append(issue("DEGRADED_REASON", f"{path}.missing_reason", "Degraded required data needs a reason."))
        if status == "not_applicable" and required:
            errors.append(issue("REQUIRED_NOT_APPLICABLE", f"{path}.status", "A required item cannot be not_applicable."))
        if nondegradable and status in {"degraded", "missing", "not_applicable"}:
            nondegradable_gap_count += 1
        if nondegradable and status == "degraded":
            errors.append(issue("MATERIAL_REQUEST_DEGRADED", f"{path}.status", "Material news, valuation, comparator, price, and settlement requests cannot degrade."))
        if nondegradable and fallback is not None:
            errors.append(issue("MATERIAL_REQUEST_FALLBACK", f"{path}.fallback", "Material news, valuation, comparator, price, and settlement requests cannot fallback."))
        if isinstance(fallback, dict):
            fallback_fields = {"mode", "grammar", "reason"}
            validate_shape(fallback, f"{path}.fallback", fallback_fields, fallback_fields, errors)
            mode = fallback.get("mode")
            if mode not in fallback_modes:
                errors.append(issue("FALLBACK_NOT_ALLOWED", f"{path}.fallback.mode", "Fallback mode is not allowed by the expression plan."))
            if not nonempty(fallback.get("grammar")) or not nonempty(fallback.get("reason")):
                errors.append(issue("FALLBACK_FIELDS", f"{path}.fallback", "Fallback requires grammar and reason."))
        elif fallback is not None:
            errors.append(issue("FALLBACK_TYPE", f"{path}.fallback", "fallback must be an object or null."))

        resolved_events = [event_index[ref] for ref in refs if ref in event_index]
        resolved_values = [value_index[ref] for ref in refs if ref in value_index]
        resolved_levels = [level_index[ref] for ref in refs if ref in level_index]
        resolved_series = [series_index[ref] for ref in refs if ref in series_index]
        resolved_evidence = [evidence_object_index[ref] for ref in refs if ref in evidence_object_index]
        matching_evidence = [item for item in resolved_evidence if item.get("shape") == kind]
        if status in {"available", "degraded"} and kind in EVIDENCE_SHAPES and not matching_evidence:
            errors.append(issue("EVIDENCE_KIND_MISMATCH", f"{path}.resolved_refs", "A structured requirement must resolve an evidence object whose shape matches requirement.kind."))
        if status in {"available", "degraded"} and request_class == "news_anchor":
            qualifying_news = [
                event for event in resolved_events
                if event.get("role") in {"news", "catalyst"}
                and nonempty(event.get("publisher_or_issuer"))
                and nonempty(event.get("source_url"))
                and bool(event.get("supported_fact_refs"))
            ]
            qualifying_clusters = [item for item in matching_evidence if item.get("shape") == "news_cluster"]
            if not qualifying_news and not qualifying_clusters:
                errors.append(issue("NEWS_EVIDENCE", f"{path}.resolved_refs", "News anchors require a sourced news/catalyst event with publisher, URL, and supported fact refs."))
        if status in {"available", "degraded"} and request_class == "official_event":
            if not any(event.get("source_type") in OFFICIAL_SOURCE_TYPES and nonempty(event.get("source_url")) for event in resolved_events):
                errors.append(issue("OFFICIAL_EVENT_EVIDENCE", f"{path}.resolved_refs", "Official events require an issuer, regulator, exchange, government, or filing event with a source URL."))
        if status in {"available", "degraded"} and request_class == "valuation_metric":
            if not resolved_values or not all(isinstance(value.get("valuation_basis"), dict) for value in resolved_values):
                errors.append(issue("VALUATION_EVIDENCE", f"{path}.resolved_refs", "Valuation requests require key values with complete valuation_basis metadata."))
        if status in {"available", "degraded"} and request_class == "comparison_metric" and not matching_evidence:
            comparison_items = resolved_values + resolved_series
            instrument_refs = {
                ref
                for comparison_item in comparison_items
                for ref in comparison_item.get("instrument_refs", [])
                if ref in instrument_index
            }
            instrument_roles = {instrument_index[ref].get("role") for ref in instrument_refs}
            units = {comparison_item.get("unit") for comparison_item in comparison_items}
            if len(comparison_items) < 2 or len(instrument_refs) < 2 or not {"primary", "comparator"}.issubset(instrument_roles):
                errors.append(issue("COMPARISON_EVIDENCE", f"{path}.resolved_refs", "Comparator requests require at least two values or series bound to primary and comparator instruments."))
            if len(units) > 1:
                errors.append(issue("COMPARISON_UNIT", f"{path}.resolved_refs", "Comparator evidence requires compatible units or an explicit normalized result."))
            if resolved_values and resolved_series:
                errors.append(issue("COMPARISON_TYPE", f"{path}.resolved_refs", "Comparator evidence cannot mix raw key values and series without an explicit derived result."))
            if len({value.get("as_of") for value in resolved_values}) > 1 or len({series_item.get("interval") for series_item in resolved_series}) > 1:
                errors.append(issue("COMPARISON_TIME_BASIS", f"{path}.resolved_refs", "Comparator evidence requires aligned as-of times or intervals."))
        if status in {"available", "degraded"} and request_class == "market_series":
            market_shapes = {
                "distribution_sample", "quantile_scenarios", "additive_components",
                "quantified_flow", "payoff_series",
            }
            if not resolved_series and not ({item.get("shape") for item in matching_evidence} & market_shapes):
                errors.append(issue("MARKET_SERIES_EVIDENCE", f"{path}.resolved_refs", "Market-series requests require an observed series or a validated structured market object."))
        if status in {"available", "degraded"} and request_class == "price_level":
            if not resolved_levels or not all(level.get("explicit") is True and nonempty(level.get("source_ref")) for level in resolved_levels):
                errors.append(issue("PRICE_LEVEL_EVIDENCE", f"{path}.resolved_refs", "Price-level requests require explicit, source-linked levels."))
        if status in {"available", "degraded"} and request_class == "settlement_reference":
            official_deadline = any(
                event.get("role") == "deadline" and event.get("source_type") in OFFICIAL_SOURCE_TYPES
                for event in resolved_events
            )
            if not official_deadline or not (resolved_values or resolved_levels):
                errors.append(issue("SETTLEMENT_EVIDENCE", f"{path}.resolved_refs", "Settlement references require an official deadline event and a sourced value or level."))

    if nondegradable_gap_count and state != "blocked":
        errors.append(issue("MATERIAL_REQUEST_STATE", "$.state", "Unresolved material news, valuation, comparator, price, or settlement requests require a blocked bundle."))

    if expression_plan is not None:
        if not isinstance(expression_plan, dict):
            errors.append(issue("EXPRESSION_PLAN_TYPE", "$", "Expected expression plan input to be an object."))
        else:
            plan_id = expression_plan.get("plan_id")
            plan_revision = expression_plan.get("revision")
            expected_expression_ref = f"{plan_id}@r{plan_revision}"
            if expression_ref != expected_expression_ref:
                errors.append(issue("EXPRESSION_PLAN_REF_MISMATCH", "$.lineage.expression_plan_ref", "Bundle expression plan ref does not match the supplied plan ID and revision."))
            plan_fingerprint = (
                expression_plan.get("meaning_fingerprint", {}).get("fingerprint_sha256")
                if isinstance(expression_plan.get("meaning_fingerprint"), dict)
                else None
            )
            if fingerprint != plan_fingerprint:
                errors.append(issue("EXPRESSION_FINGERPRINT_MISMATCH", "$.lineage.meaning_fingerprint", "Bundle fingerprint does not match the supplied expression plan."))
            raw_plan_requirements = expression_plan.get("data_requirements")
            if not isinstance(raw_plan_requirements, list):
                errors.append(issue("EXPRESSION_REQUIREMENTS", "$", "Supplied expression plan has no data_requirements array."))
                raw_plan_requirements = []
            plan_requirements_by_id = {
                requirement.get("id"): requirement
                for requirement in raw_plan_requirements
                if isinstance(requirement, dict) and isinstance(requirement.get("id"), str)
            }
            missing_plan_requirement_ids = {
                requirement_id
                for requirement_id, requirement in plan_requirements_by_id.items()
                if requirement.get("required") is True and requirement_id not in upstream_requirement_ids
            }
            if missing_plan_requirement_ids:
                errors.append(issue("UPSTREAM_REQUIREMENT_COVERAGE", "$.requirements", f"Bundle omits required expression-plan requests: {sorted(missing_plan_requirement_ids)}."))
            for upstream_id, (bundle_requirement, bundle_path) in upstream_requirement_ids.items():
                plan_requirement = plan_requirements_by_id.get(upstream_id)
                if plan_requirement is None:
                    errors.append(issue("UNKNOWN_UPSTREAM_REQUIREMENT", f"{bundle_path}.expression_plan_requirement_ref", "Referenced requirement is absent from the supplied expression plan."))
                    continue
                for field in ("request_class", "material_to_claim", "required"):
                    if bundle_requirement.get(field) != plan_requirement.get(field):
                        errors.append(issue("UPSTREAM_REQUIREMENT_MISMATCH", f"{bundle_path}.{field}", f"{field} must exactly retain the supplied expression-plan requirement."))
                bundle_surfaces = bundle_requirement.get("expression_surfaces")
                plan_surfaces = plan_requirement.get("expression_surfaces")
                if set(bundle_surfaces if isinstance(bundle_surfaces, list) else []) != set(plan_surfaces if isinstance(plan_surfaces, list) else []):
                    errors.append(issue("UPSTREAM_REQUIREMENT_MISMATCH", f"{bundle_path}.expression_surfaces", "expression_surfaces must exactly retain the supplied expression-plan requirement."))

    render = payload.get("render_payload") if isinstance(payload.get("render_payload"), dict) else {}
    if not render:
        errors.append(issue("RENDER_PAYLOAD_TYPE", "$.render_payload", "render_payload must be an object."))
    render_mode = render.get("mode")
    if render_mode not in {"qualitative", "key_numbers", "series", "evidence", "mixed"}:
        errors.append(issue("RENDER_MODE", "$.render_payload.mode", "Unsupported render mode."))
    render_groups = {
        "series_refs": series_index, "value_refs": value_index, "event_refs": event_index,
        "level_refs": level_index, "formula_refs": formula_index,
        "evidence_object_refs": evidence_object_index,
    }
    selected_render_refs: set[str] = set()
    for key, index in render_groups.items():
        refs = render.get(key, []) if key == "evidence_object_refs" else render.get(key)
        if not isinstance(refs, list) or len(refs) != len(set(refs or [])):
            errors.append(issue("RENDER_REFS", f"$.render_payload.{key}", f"{key} must be a unique array."))
            continue
        for ref in refs:
            if ref not in index:
                errors.append(issue("UNKNOWN_RENDER_REF", f"$.render_payload.{key}", f"Unknown render ref {ref!r}."))
            else:
                selected_render_refs.add(ref)
    omitted_material_visual_refs = material_visual_refs - selected_render_refs
    if omitted_material_visual_refs:
        errors.append(issue("MATERIAL_RENDER_OMISSION", "$.render_payload", f"Render payload omits material visual evidence refs: {sorted(omitted_material_visual_refs)}."))
    if render_mode == "series" and not render.get("series_refs"):
        errors.append(issue("SERIES_MODE_EMPTY", "$.render_payload.series_refs", "Series mode requires a series."))
    if render_mode == "key_numbers" and not render.get("value_refs"):
        errors.append(issue("KEY_NUMBER_MODE_EMPTY", "$.render_payload.value_refs", "Key-number mode requires values."))
    if render_mode == "evidence" and not render.get("evidence_object_refs"):
        errors.append(issue("EVIDENCE_MODE_EMPTY", "$.render_payload.evidence_object_refs", "Evidence mode requires a structured evidence object."))
    if render_mode == "mixed":
        populated_groups = sum(bool(render.get(key)) for key in render_groups if key != "formula_refs")
        if populated_groups < 2:
            errors.append(issue("MIXED_MODE_INCOMPLETE", "$.render_payload", "Mixed mode requires at least two distinct evidence groups."))
    selected_series = [series_index[ref] for ref in render.get("series_refs") or [] if ref in series_index]
    if len(selected_series) > 1:
        units = {item.get("unit") for item in selected_series}
        intervals = {item.get("interval") for item in selected_series}
        if len(units) > 1 or len(intervals) > 1:
            errors.append(issue("COMPARISON_BASIS", "$.render_payload.series_refs", "Displayed comparison series require compatible unit and interval or an explicit normalized series."))

    report = payload.get("quality_report") if isinstance(payload.get("quality_report"), dict) else {}
    if not report:
        errors.append(issue("QUALITY_TYPE", "$.quality_report", "quality_report must be an object."))
    decision = report.get("decision")
    if decision != state:
        errors.append(issue("STATE_DECISION", "$.quality_report.decision", "Quality decision must equal bundle state."))
    hard_failures = report.get("hard_failures")
    if not isinstance(hard_failures, list):
        errors.append(issue("HARD_FAILURES_TYPE", "$.quality_report.hard_failures", "hard_failures must be an array."))
        hard_failures = []
    if hard_failures and state != "blocked":
        errors.append(issue("HARD_FAILURE_STATE", "$.state", "Hard failures require blocked state."))
    if state == "blocked" and not hard_failures:
        errors.append(issue("BLOCKED_WITHOUT_FAILURE", "$.quality_report.hard_failures", "Blocked state requires a hard failure."))
    if state == "ready" and (missing_required or degraded_required):
        errors.append(issue("READY_WITH_GAPS", "$.state", "Ready state cannot contain missing or degraded required data."))
    if missing_required and state == "ready":
        errors.append(issue("MISSING_REQUIRED_READY", "$.state", "Missing required data cannot be ready."))
    counts = report.get("counts")
    expected_counts = {
        "instruments": len(instruments), "series": len(series), "key_values": len(values),
        "events": len(events), "levels": len(levels), "formulas": len(formulas),
        "requirements": len(requirements), "missing_required": missing_required,
    }
    if "evidence_objects" in payload:
        expected_counts["evidence_objects"] = len(evidence_objects)
    if counts != expected_counts:
        errors.append(issue("COUNTS", "$.quality_report.counts", f"Expected exact counts {expected_counts}."))

    return {"valid": not errors, "errors": errors, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    parser.add_argument("--expression-plan", type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.json_file.read_text(encoding="utf-8"))
    expression_plan = json.loads(args.expression_plan.read_text(encoding="utf-8"))
    result = validate(payload, expression_plan=expression_plan)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
