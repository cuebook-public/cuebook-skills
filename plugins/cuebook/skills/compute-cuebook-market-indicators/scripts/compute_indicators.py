#!/usr/bin/env python3
"""Compute deterministic IndicatorPackV1 values from ThesisChartDataV1."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


KINDS = {
    "return_pct",
    "relative_strength_pct",
    "sma_distance_pct",
    "ema_distance_pct",
    "rsi",
    "atr_pct",
    "volume_ratio",
    "drawdown_pct",
    "vwap_distance_pct",
    "breakout_distance_pct",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_request(payload: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["Request must be a JSON object."]
    if payload.get("schema_version") != "indicator-request-v1":
        errors.append("schema_version must be indicator-request-v1.")
    if not re.fullmatch(r"INDREQ_[A-Za-z0-9_:-]{8,}", str(payload.get("request_id") or "")):
        errors.append("request_id is invalid.")
    for key in ("source_ref", "source_path", "primary_series_ref"):
        if not isinstance(payload.get(key), str) or not payload.get(key, "").strip():
            errors.append(f"{key} is required.")
    benchmark = payload.get("benchmark_series_ref")
    if benchmark is not None and (not isinstance(benchmark, str) or not benchmark.strip()):
        errors.append("benchmark_series_ref must be null or a non-empty string.")
    if not isinstance(payload.get("include_forming"), bool):
        errors.append("include_forming must be boolean.")
    indicators = payload.get("indicators")
    if not isinstance(indicators, list) or not indicators:
        errors.append("indicators must be a non-empty array.")
        return errors
    ids: set[str] = set()
    for index, item in enumerate(indicators):
        if not isinstance(item, dict):
            errors.append(f"indicators[{index}] must be an object.")
            continue
        indicator_id = item.get("id")
        if not isinstance(indicator_id, str) or not re.fullmatch(r"I[1-9][0-9]*", indicator_id):
            errors.append(f"indicators[{index}].id must use I<number>.")
        elif indicator_id in ids:
            errors.append(f"indicators[{index}].id must be unique.")
        else:
            ids.add(indicator_id)
        if item.get("kind") not in KINDS:
            errors.append(f"indicators[{index}].kind is unsupported.")
        lookback = item.get("lookback_bars")
        if lookback is not None and (not isinstance(lookback, int) or lookback < 1):
            errors.append(f"indicators[{index}].lookback_bars must be null or positive.")
    return errors


def selected_points(series: dict[str, Any], include_forming: bool) -> list[dict[str, Any]]:
    points = [item for item in series.get("points", []) if isinstance(item, dict)]
    if not include_forming:
        points = [item for item in points if item.get("state") == "sealed"]
    return sorted(points, key=lambda item: str(item.get("observed_at") or ""))


def ema(values: list[float], period: int) -> float:
    alpha = 2.0 / (period + 1.0)
    current = sum(values[:period]) / period
    for value in values[period:]:
        current = value * alpha + current * (1.0 - alpha)
    return current


def rsi(values: list[float], period: int) -> float:
    deltas = [current - previous for previous, current in zip(values, values[1:])]
    window = deltas[-period:]
    gains = sum(max(value, 0.0) for value in window) / period
    losses = sum(max(-value, 0.0) for value in window) / period
    if losses == 0:
        return 100.0 if gains > 0 else 50.0
    relative_strength = gains / losses
    return 100.0 - 100.0 / (1.0 + relative_strength)


def result_state(points: list[dict[str, Any]]) -> str:
    states = {str(item.get("state") or "unavailable") for item in points[-1:]}
    if not states:
        return "unavailable"
    if len(states) > 1:
        return "mixed"
    state = next(iter(states))
    return state if state in {"sealed", "forming"} else "unavailable"


def insufficient(item: dict[str, Any], series_refs: list[str], formula: str, source_ref: str) -> dict[str, Any]:
    return {
        "id": item["id"],
        "kind": item["kind"],
        "series_refs": series_refs,
        "lookback_bars": item.get("lookback_bars"),
        "value": None,
        "unit": "%" if item["kind"] != "volume_ratio" else "x",
        "observed_at": None,
        "bar_state": "unavailable",
        "formula": formula,
        "status": "insufficient_data",
        "source_ref": source_ref,
    }


def compute_one(
    item: dict[str, Any],
    series_map: dict[str, dict[str, Any]],
    primary_ref: str,
    benchmark_ref: str | None,
    include_forming: bool,
    source_ref: str,
) -> dict[str, Any]:
    kind = item["kind"]
    lookback = item.get("lookback_bars")
    requested_ref = item.get("series_ref") or primary_ref
    primary = series_map.get(requested_ref)
    if primary is None:
        return insufficient(item, [requested_ref], "series unavailable", source_ref)
    points = selected_points(primary, include_forming)
    closes = [float(point["close"]) for point in points if point.get("close") is not None]
    state = result_state(points)
    observed_at = points[-1].get("observed_at") if points else None
    status = "provisional" if state in {"forming", "mixed"} else "ready"
    series_refs = [requested_ref]
    value: float | None = None
    unit = "%"
    formula = ""

    if kind == "return_pct":
        formula = "(latest_close / explicit_baseline - 1) * 100"
        if points:
            baseline = float(primary["baseline"]["value"])
            value = (closes[-1] / baseline - 1.0) * 100.0
    elif kind == "relative_strength_pct":
        formula = "primary_return_from_baseline - benchmark_return_from_baseline"
        if benchmark_ref is None or benchmark_ref not in series_map:
            return insufficient(item, [primary_ref], formula, source_ref)
        primary = series_map[primary_ref]
        benchmark = series_map[benchmark_ref]
        primary_points = selected_points(primary, include_forming)
        benchmark_points = selected_points(benchmark, include_forming)
        series_refs = [primary_ref, benchmark_ref]
        if not primary_points or not benchmark_points:
            return insufficient(item, series_refs, formula, source_ref)
        p_return = (float(primary_points[-1]["close"]) / float(primary["baseline"]["value"]) - 1.0) * 100.0
        b_return = (float(benchmark_points[-1]["close"]) / float(benchmark["baseline"]["value"]) - 1.0) * 100.0
        value = p_return - b_return
        observed_at = max(str(primary_points[-1]["observed_at"]), str(benchmark_points[-1]["observed_at"]))
        states = {str(primary_points[-1].get("state")), str(benchmark_points[-1].get("state"))}
        state = next(iter(states)) if len(states) == 1 else "mixed"
        status = "provisional" if "forming" in states or state == "mixed" else "ready"
    elif kind == "sma_distance_pct":
        period = lookback or 20
        formula = f"(latest_close / SMA({period}) - 1) * 100"
        if len(closes) >= period:
            average = sum(closes[-period:]) / period
            value = (closes[-1] / average - 1.0) * 100.0
    elif kind == "ema_distance_pct":
        period = lookback or 20
        formula = f"(latest_close / EMA({period}) - 1) * 100"
        if len(closes) >= period:
            value = (closes[-1] / ema(closes, period) - 1.0) * 100.0
    elif kind == "rsi":
        period = lookback or 14
        formula = f"RSI({period}) from close-to-close changes"
        unit = "index"
        if len(closes) >= period + 1:
            value = rsi(closes, period)
    elif kind == "atr_pct":
        period = lookback or 14
        formula = f"ATR({period}) / latest_close * 100"
        if len(points) >= period + 1:
            true_ranges: list[float] = []
            for previous, current in zip(points[-(period + 1) :], points[-period:]):
                high = float(current["high"])
                low = float(current["low"])
                previous_close = float(previous["close"])
                true_ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
            value = sum(true_ranges) / period / closes[-1] * 100.0
    elif kind == "volume_ratio":
        period = lookback or 20
        formula = f"latest_volume / previous_{period}_bar_average_volume"
        unit = "x"
        volumes = [float(point["volume"]) for point in points if point.get("volume") is not None]
        if len(volumes) >= period + 1:
            previous_average = sum(volumes[-(period + 1) : -1]) / period
            value = volumes[-1] / previous_average if previous_average else None
    elif kind == "drawdown_pct":
        period = lookback or 20
        formula = f"(latest_close / highest_close_{period} - 1) * 100"
        if len(closes) >= period:
            value = (closes[-1] / max(closes[-period:]) - 1.0) * 100.0
    elif kind == "vwap_distance_pct":
        formula = "(latest_close / latest_vwap - 1) * 100"
        if points and points[-1].get("vwap") not in {None, 0, 0.0}:
            value = (float(points[-1]["close"]) / float(points[-1]["vwap"]) - 1.0) * 100.0
    elif kind == "breakout_distance_pct":
        period = lookback or 20
        formula = f"(latest_close / previous_{period}_bar_high - 1) * 100"
        if len(points) >= period + 1:
            previous_high = max(float(point["high"]) for point in points[-(period + 1) : -1])
            value = (float(points[-1]["close"]) / previous_high - 1.0) * 100.0

    if value is None or not math.isfinite(value):
        return insufficient(item, series_refs, formula, source_ref)
    return {
        "id": item["id"],
        "kind": kind,
        "series_refs": series_refs,
        "lookback_bars": lookback,
        "value": round(value, 8),
        "unit": unit,
        "observed_at": observed_at,
        "bar_state": state,
        "formula": formula,
        "status": status,
        "source_ref": source_ref,
    }


def build_pack(request: dict[str, Any], chart_data: dict[str, Any]) -> dict[str, Any]:
    source_series = chart_data.get("series")
    if not isinstance(source_series, list) or not source_series:
        raise ValueError("Chart data has no series.")
    series_map = {str(item.get("id")): item for item in source_series if isinstance(item, dict)}
    primary_ref = request["primary_series_ref"]
    benchmark_ref = request.get("benchmark_series_ref")
    if primary_ref not in series_map:
        raise ValueError(f"Unknown primary series {primary_ref}.")
    if benchmark_ref is not None and benchmark_ref not in series_map:
        raise ValueError(f"Unknown benchmark series {benchmark_ref}.")
    intervals = {str(item.get("observed_interval")) for item in source_series}
    if len(intervals) != 1:
        raise ValueError(f"Mixed source intervals are not allowed: {sorted(intervals)}")
    interval = next(iter(intervals))
    results = [
        compute_one(
            item,
            series_map,
            primary_ref,
            benchmark_ref,
            request["include_forming"],
            request["source_ref"],
        )
        for item in request["indicators"]
    ]
    warnings: list[str] = []
    if any(item["status"] == "provisional" for item in results):
        warnings.append("One or more indicators use a forming bar and remain provisional.")
    if any(item["status"] == "insufficient_data" for item in results):
        warnings.append("One or more requested indicators lack sufficient source history.")
    decision = "conditional" if warnings else "ready"
    suffix = re.sub(r"[^A-Za-z0-9_:-]", "", request["request_id"].removeprefix("INDREQ_"))
    return {
        "schema_version": "indicator-pack-v1",
        "pack_id": f"INDPACK_{suffix}",
        "request_ref": request["request_id"],
        "source_ref": request["source_ref"],
        "computed_at": iso_now(),
        "interval": interval,
        "include_forming": request["include_forming"],
        "results": results,
        "quality_report": {"decision": decision, "warnings": warnings, "hard_failures": []},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        request = json.loads(args.request.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Unable to read request: {exc}", file=sys.stderr)
        return 1
    errors = validate_request(request)
    if errors:
        print(json.dumps({"valid": False, "errors": errors}, indent=2), file=sys.stderr)
        return 1
    try:
        chart_data = json.loads(Path(request["source_path"]).read_text(encoding="utf-8"))
        pack = build_pack(request, chart_data)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Indicator computation failed: {exc}", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(pack, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
