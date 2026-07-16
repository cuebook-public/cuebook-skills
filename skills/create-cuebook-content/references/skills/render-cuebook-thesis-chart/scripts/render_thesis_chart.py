#!/usr/bin/env python3
"""Fetch Cuebook OHLCV and render a thesis-aware SVG plus data provenance."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from validate_thesis_chart import validate


THEMES = {
    "cuebook_dark": {
        "background": "#171918",
        "plot": "#171918",
        "grid": "#343835",
        "text": "#F5F6F2",
        "muted": "#A5AAA6",
        "primary": "#22B58A",
        "benchmark": "#F3C84B",
        "context": "#6D8EFF",
        "danger": "#EE6B73",
        "future": "#242725",
        "panel": "#202321",
        "white": "#FFFFFF",
    },
    "cuebook_light": {
        "background": "#FCFCFA",
        "plot": "#FCFCFA",
        "grid": "#E5E9E5",
        "text": "#151815",
        "muted": "#737A75",
        "primary": "#12A97B",
        "benchmark": "#F1BE28",
        "context": "#5577D9",
        "danger": "#DF5967",
        "future": "#FFF8E4",
        "panel": "#FFFDF5",
        "white": "#FFFFFF",
    },
}
STYLE_PROFILES = {
    "cuebook_feed_v1": {
        "outer_radius": 8,
        "grid_rows": 4,
        "show_state_label": False,
        "show_provenance_footer": False,
        "show_guide": False,
        "annotation_limit": 4,
    },
    "cuebook_detail_v1": {
        "outer_radius": 8,
        "grid_rows": 5,
        "show_state_label": True,
        "show_provenance_footer": True,
        "show_guide": True,
        "annotation_limit": 8,
    },
}
COLORS = THEMES["cuebook_dark"]
X_LAYOUT: dict[str, Any] | None = None


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def http_json(url: str, retries: int = 4) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "CuebookThesisChart/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # pragma: no cover - network path varies by runtime
            last_error = exc
            time.sleep(0.5 * (attempt + 1))
    try:
        output = subprocess.check_output(
            ["curl", "-sS", "--retry", "4", "--retry-all-errors", "--retry-delay", "1", url],
            text=True,
            timeout=40,
        )
        return json.loads(output)
    except Exception as exc:  # pragma: no cover - fallback path varies by runtime
        raise RuntimeError(f"Market-data request failed: {last_error}; curl fallback: {exc}") from exc


def fetch_cuebook_series(spec: dict[str, Any], series: dict[str, Any]) -> dict[str, Any]:
    provider = series["provider"]
    endpoint = provider["endpoint"]
    horizon_value = spec["time"].get("horizon_end")
    query_end = parse_dt(horizon_value) if horizon_value else parse_dt(spec["time"]["declared_at"])
    payload = {
        "json": {
            "assetId": series["asset_id"],
            "interval": provider["requested_interval"],
            "from": parse_dt(spec["time"]["context_start"]).date().isoformat(),
            "to": query_end.date().isoformat(),
        }
    }
    url = f"{endpoint}?input={urllib.parse.quote(json.dumps(payload, separators=(',', ':')))}"
    response = http_json(url)
    try:
        body = response["result"]["data"]["json"]
        bars = body["bars"]
    except (KeyError, TypeError) as exc:
        raise RuntimeError(f"Unexpected Cuebook market.candles response for {series['ticker']}: {response}") from exc
    if not isinstance(bars, list) or not bars:
        raise RuntimeError(f"Cuebook returned no bars for {series['ticker']}.")

    returned_tickers = {str(bar.get("canonicalTicker") or "").upper() for bar in bars}
    if series["ticker"].upper() not in returned_tickers:
        raise RuntimeError(
            f"Ticker mismatch for {series['ticker']}: provider returned {sorted(returned_tickers)}."
        )
    intervals = {str(bar.get("interval") or "") for bar in bars if bar.get("interval")}
    observed_interval = sorted(intervals)[0] if len(intervals) == 1 else ",".join(sorted(intervals))
    baseline_clock = parse_dt(series["baseline"]["observed_at"])
    points: list[dict[str, Any]] = []
    for bar in bars:
        try:
            open_time = datetime.fromtimestamp(int(bar["openTime"]) / 1000, tz=timezone.utc)
            close = float(bar["close"])
        except (KeyError, TypeError, ValueError):
            continue
        state = str(bar.get("state") or "unknown")
        if state == "forming" and bar.get("lastEventTime"):
            observed_at = datetime.fromtimestamp(int(bar["lastEventTime"]) / 1000, tz=timezone.utc)
        elif observed_interval == "1d" and spec["time"]["market_session"] != "continuous":
            observed_at = open_time.replace(
                hour=baseline_clock.hour,
                minute=baseline_clock.minute,
                second=baseline_clock.second,
                microsecond=baseline_clock.microsecond,
            )
        else:
            observed_at = open_time
        baseline = float(series["baseline"]["value"])
        transformation = series["transformation"]
        if transformation == "raw_price":
            derived = close
        elif transformation == "return_from_baseline":
            derived = (close / baseline - 1.0) * 100.0
        elif transformation == "normalized_index":
            derived = close / baseline * 100.0
        else:
            raise RuntimeError("excess_return requires a precomputed single series and is not fetched directly.")
        points.append(
            {
                "observed_at": iso_utc(observed_at),
                "open_time": iso_utc(open_time),
                "open": float(bar["open"]) if bar.get("open") is not None else None,
                "high": float(bar["high"]) if bar.get("high") is not None else None,
                "low": float(bar["low"]) if bar.get("low") is not None else None,
                "close": close,
                "volume": float(bar["volume"]) if bar.get("volume") is not None else None,
                "vwap": float(bar["vwap"]) if bar.get("vwap") is not None else None,
                "state": state,
                "derived_value": derived,
                "last_event_time": (
                    iso_utc(datetime.fromtimestamp(int(bar["lastEventTime"]) / 1000, tz=timezone.utc))
                    if bar.get("lastEventTime")
                    else None
                ),
            }
        )
    points.sort(key=lambda item: item["observed_at"])
    if len(points) > spec["time"]["bar_limit"]:
        points = points[-spec["time"]["bar_limit"] :]
    sealed = [item for item in points if item["state"] == "sealed"]
    forming = [item for item in points if item["state"] == "forming"]
    return {
        "id": series["id"],
        "ticker": series["ticker"],
        "role": series["role"],
        "transformation": series["transformation"],
        "baseline": series["baseline"],
        "source_url": url,
        "requested_interval": provider["requested_interval"],
        "observed_interval": observed_interval or None,
        "coverage_status": body.get("coverageStatus", "unknown"),
        "provider_id": str(provider.get("name") or "Cuebook"),
        "venue": None,
        "currency": series.get("baseline", {}).get("unit"),
        "timezone": spec.get("time", {}).get("timezone"),
        "calendar_ref": None,
        "session": spec.get("time", {}).get("market_session"),
        "quote_basis": series.get("baseline", {}).get("observation_basis"),
        "adjustment_basis": "unknown",
        "source_as_of": provider.get("as_of"),
        "license_scope": "unknown",
        "quality_flags": [],
        "latest_sealed_open_time": body.get("latestSealedOpenTime"),
        "forming_open_time": body.get("formingOpenTime"),
        "sealed_through": sealed[-1]["observed_at"] if sealed else None,
        "forming_as_of": forming[-1]["last_event_time"] if forming else None,
        "points": points,
    }


def load_canonical_series(
    spec: dict[str, Any], series: dict[str, Any], batch: dict[str, Any]
) -> dict[str, Any]:
    """Map a database-exported MarketSeriesBatchV1 leg into renderer data."""
    if batch.get("schema_version") != "market-series-batch-v1":
        raise RuntimeError("--market-data must use schema_version market-series-batch-v1.")
    rows = batch.get("series")
    if not isinstance(rows, list):
        raise RuntimeError("MarketSeriesBatchV1.series must be an array.")
    matches = [item for item in rows if isinstance(item, dict) and item.get("series_ref") == series["id"]]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one market-data series for {series['id']}; found {len(matches)}.")
    row = matches[0]
    if str(row.get("ticker") or "").upper() != series["ticker"].upper():
        raise RuntimeError(
            f"Ticker mismatch for {series['id']}: spec={series['ticker']}, data={row.get('ticker')}."
        )
    if row.get("instrument_id") != series["instrument_id"]:
        raise RuntimeError(
            f"Instrument mismatch for {series['id']}: spec={series['instrument_id']}, data={row.get('instrument_id')}."
        )
    interval = row.get("interval")
    if not isinstance(interval, str) or not interval.strip():
        raise RuntimeError(f"Market data for {series['id']} has no interval.")
    coverage = row.get("coverage_status")
    if coverage not in {"complete", "partial", "unavailable", "unknown"}:
        raise RuntimeError(f"Market data for {series['id']} has invalid coverage_status.")
    source_ref = row.get("source_ref")
    if not isinstance(source_ref, str) or not source_ref.strip():
        raise RuntimeError(f"Market data for {series['id']} has no source_ref.")

    context_start = parse_dt(spec["time"]["context_start"])
    horizon_value = spec["time"].get("horizon_end")
    horizon_end = parse_dt(horizon_value) if horizon_value else parse_dt(spec["time"]["declared_at"])
    baseline = float(series["baseline"]["value"])
    points: list[dict[str, Any]] = []
    for index, bar in enumerate(row.get("bars") or []):
        if not isinstance(bar, dict):
            raise RuntimeError(f"Market data {series['id']} bar {index} must be an object.")
        try:
            open_time = parse_dt(bar["open_time"])
            observed_at = parse_dt(bar["observed_at"])
            open_value = float(bar["open"])
            high = float(bar["high"])
            low = float(bar["low"])
            close = float(bar["close"])
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(f"Market data {series['id']} bar {index} has invalid OHLC or time fields.") from exc
        if observed_at < context_start or observed_at > horizon_end:
            continue
        if high < max(open_value, close) or low > min(open_value, close) or low > high:
            raise RuntimeError(f"Market data {series['id']} bar {index} violates OHLC bounds.")
        state = bar.get("state")
        if state not in {"sealed", "forming"}:
            raise RuntimeError(f"Market data {series['id']} bar {index} has invalid state.")
        last_event_time = bar.get("last_event_time")
        if state == "forming" and not isinstance(last_event_time, str):
            raise RuntimeError(f"Forming bar {series['id']}[{index}] requires last_event_time.")
        if last_event_time is not None:
            parse_dt(last_event_time)
        transformation = series["transformation"]
        if transformation == "raw_price":
            derived = close
        elif transformation == "return_from_baseline":
            derived = (close / baseline - 1.0) * 100.0
        elif transformation == "normalized_index":
            derived = close / baseline * 100.0
        else:
            raise RuntimeError("excess_return requires a precomputed single series and is not loaded directly.")
        points.append(
            {
                "observed_at": iso_utc(observed_at),
                "open_time": iso_utc(open_time),
                "open": open_value,
                "high": high,
                "low": low,
                "close": close,
                "volume": float(bar["volume"]) if bar.get("volume") is not None else None,
                "vwap": float(bar["vwap"]) if bar.get("vwap") is not None else None,
                "state": state,
                "derived_value": derived,
                "last_event_time": iso_utc(parse_dt(last_event_time)) if last_event_time else None,
            }
        )
    points.sort(key=lambda item: item["observed_at"])
    observed_times = [item["observed_at"] for item in points]
    if len(observed_times) != len(set(observed_times)):
        raise RuntimeError(f"Market data for {series['id']} contains duplicate observed_at values.")
    if not points:
        raise RuntimeError(f"Market data for {series['id']} has no bars inside the chart window.")
    if len(points) > spec["time"]["bar_limit"]:
        points = points[-spec["time"]["bar_limit"] :]
    sealed = [item for item in points if item["state"] == "sealed"]
    forming = [item for item in points if item["state"] == "forming"]
    return {
        "id": series["id"],
        "ticker": series["ticker"],
        "role": series["role"],
        "transformation": series["transformation"],
        "baseline": series["baseline"],
        "source_url": source_ref,
        "requested_interval": series["provider"]["requested_interval"],
        "observed_interval": interval,
        "coverage_status": coverage,
        "provider_id": row.get("provider_id"),
        "venue": row.get("venue"),
        "currency": row.get("currency"),
        "timezone": row.get("timezone"),
        "calendar_ref": row.get("calendar_ref"),
        "session": row.get("session"),
        "quote_basis": row.get("quote_basis"),
        "adjustment_basis": row.get("adjustment_basis"),
        "source_as_of": row.get("source_as_of"),
        "license_scope": row.get("license_scope"),
        "quality_flags": row.get("quality_flags") or [],
        "latest_sealed_open_time": sealed[-1]["open_time"] if sealed else None,
        "forming_open_time": forming[-1]["open_time"] if forming else None,
        "sealed_through": sealed[-1]["observed_at"] if sealed else None,
        "forming_as_of": forming[-1]["last_event_time"] if forming else None,
        "points": points,
    }


def x_scale(value: datetime, start: datetime, end: datetime, left: float, right: float) -> float:
    if X_LAYOUT and X_LAYOUT.get("mode") == "decision_split":
        declared = X_LAYOUT["declared"]
        horizon = X_LAYOUT["horizon"]
        split = left + float(X_LAYOUT["ratio"]) * (right - left)
        if value <= declared:
            span = max((declared - start).total_seconds(), 1.0)
            ratio = (value - start).total_seconds() / span
            return left + min(max(ratio, 0.0), 1.0) * (split - left)
        span = max((horizon - declared).total_seconds(), 1.0)
        ratio = (value - declared).total_seconds() / span
        return split + min(max(ratio, 0.0), 1.0) * (right - split)
    span = max((end - start).total_seconds(), 1.0)
    return left + (value - start).total_seconds() / span * (right - left)


def y_scale(value: float, low: float, high: float, top: float, bottom: float) -> float:
    span = max(high - low, 1e-9)
    return bottom - (value - low) / span * (bottom - top)


def fmt_value(value: float, axis: str) -> str:
    if axis in {"return_pct", "excess_return_pct"}:
        return f"{value:+.2f}%"
    if abs(value) >= 1000:
        return f"{value:,.0f}"
    return f"{value:.2f}"


def previous_volume_averages(
    points: list[dict[str, Any]], window: int
) -> list[tuple[dict[str, Any], float]]:
    """Return a prior-bar rolling average so the current bar cannot lift its own benchmark."""
    history: list[float] = []
    result: list[tuple[dict[str, Any], float]] = []
    for point in points:
        volume = point.get("volume")
        if volume is None:
            continue
        if history:
            sample = history[-window:]
            result.append((point, sum(sample) / len(sample)))
        if point.get("state") == "sealed":
            history.append(float(volume))
    return result


def text_units(value: str) -> float:
    total = 0.0
    for char in value:
        if char.isspace():
            total += 0.34
        elif ord(char) > 127:
            total += 1.0
        elif char in "ilI1.,:;'|":
            total += 0.32
        elif char in "MW@%":
            total += 0.9
        else:
            total += 0.58
    return total


def ellipsize(value: str, max_units: float) -> str:
    value = " ".join(value.split())
    if text_units(value) <= max_units:
        return value
    result: list[str] = []
    for char in value:
        if text_units("".join(result) + char + "...") > max_units:
            break
        result.append(char)
    return "".join(result).rstrip() + "..."


def wrap_text(value: str, max_units: float, max_lines: int = 2) -> list[str]:
    remaining = " ".join(value.split())
    lines: list[str] = []
    while remaining and len(lines) < max_lines:
        if text_units(remaining) <= max_units:
            lines.append(remaining)
            remaining = ""
            break
        consumed: list[str] = []
        last_space = -1
        for index, char in enumerate(remaining):
            if char.isspace():
                last_space = index
            if text_units("".join(consumed) + char) > max_units:
                break
            consumed.append(char)
        cut = len(consumed)
        if 0 < last_space < cut and cut - last_space < 12:
            cut = last_space
        cut = max(cut, 1)
        lines.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip()
    if remaining and lines:
        lines[-1] = ellipsize(lines[-1] + remaining, max_units)
    return lines or [""]


def short_date(value: datetime, locale: str) -> str:
    if locale == "zh-CN":
        return f"{value.month}/{value.day}"
    return value.strftime("%b %d")


def path_for(points: list[dict[str, Any]], start: datetime, end: datetime, left: float, right: float, top: float, bottom: float, y_low: float, y_high: float) -> str:
    commands: list[str] = []
    for index, point in enumerate(points):
        x = x_scale(parse_dt(point["observed_at"]), start, end, left, right)
        y = y_scale(float(point["derived_value"]), y_low, y_high, top, bottom)
        commands.append(f"{'M' if index == 0 else 'L'} {x:.2f} {y:.2f}")
    return " ".join(commands)


def series_color(role: str) -> str:
    return {
        "primary": COLORS["primary"],
        "benchmark": COLORS["benchmark"],
        "context": COLORS["context"],
    }.get(role, COLORS["white"])


def render_svg(spec: dict[str, Any], fetched: list[dict[str, Any]]) -> str:
    global COLORS, X_LAYOUT
    render = spec["render"]
    COLORS = THEMES.get(render.get("theme", "cuebook_dark"), THEMES["cuebook_dark"])
    profile_name = render.get("style_profile") or (
        "cuebook_detail_v1" if render.get("show_settlement_panel") else "cuebook_feed_v1"
    )
    profile = STYLE_PROFILES[profile_name]
    locale = render.get("locale", "zh-CN")
    show_state = render.get("show_state_label", profile["show_state_label"])
    show_provenance = render.get("show_provenance_footer", profile["show_provenance_footer"])
    show_guide = render.get("show_guide", profile["show_guide"])
    show_volume = bool(render.get("show_volume", False))
    volume_window = int(render.get("volume_average_window", 20))
    width = render["width"]
    height = render["height"]
    left = 72.0 if width <= 900 else 84.0
    right = float(width - (32 if width <= 900 else 40))

    all_points = [point for series in fetched for point in series["points"]]
    if not all_points:
        raise RuntimeError("No chart points available.")
    x_values = [parse_dt(point["observed_at"]) for point in all_points]
    start = min(min(x_values), parse_dt(spec["time"]["context_start"]))
    declared = parse_dt(spec["time"]["declared_at"])
    horizon_value = spec["time"].get("horizon_end")
    horizon = parse_dt(horizon_value) if horizon_value else max(max(x_values), declared)
    end = max(max(x_values), horizon)
    latest_observed = max(x_values)
    timeline_layout = render.get("timeline_layout", "continuous_time")
    X_LAYOUT = {
        "mode": timeline_layout,
        "declared": declared,
        "horizon": horizon,
        "ratio": render.get("decision_split_ratio", 0.68),
    }

    annotation_rank = {
        "target": 0,
        "trigger": 0,
        "invalidation": 0,
        "range_lower": 0,
        "range_upper": 0,
        "event": 1,
        "expiry": 2,
        "declaration": 3,
        "baseline": 4,
        "note": 5,
    }
    annotations = list(spec["annotations"])
    if len(annotations) > profile["annotation_limit"]:
        selected = sorted(
            enumerate(annotations),
            key=lambda pair: (annotation_rank.get(pair[1].get("kind"), 9), pair[0]),
        )[: profile["annotation_limit"]]
        selected_ids = {item[1]["id"] for item in selected}
        visible_annotations = [item for item in annotations if item["id"] in selected_ids]
    else:
        visible_annotations = annotations

    primary_fetched = next((item for item in fetched if item["role"] == "primary"), fetched[0])
    primary_spec = next((item for item in spec["series"] if item["role"] == "primary"), spec["series"][0])
    latest_primary = max(primary_fetched["points"], key=lambda item: parse_dt(item["observed_at"]))
    metric_width = 220.0 if len(fetched) == 1 else 0.0
    title_size = 24 if width <= 900 else 27
    title_available = max(right - left - metric_width - 18, 280)
    title_lines = wrap_text(render["title"], title_available / title_size, 2)
    title_y = 43.0
    title_line_height = 30.0
    subtitle_y = title_y + (len(title_lines) - 1) * title_line_height + 30.0
    subtitle_units = max((title_available / 14.5), 22)
    subtitle = ellipsize(render["subtitle"], subtitle_units)
    legend_y = subtitle_y + 29.0
    top = legend_y + 24.0 if len(fetched) > 1 else subtitle_y + 31.0
    footer_rows = int(show_provenance) + int(show_guide)
    bottom = float(height - 58 - footer_rows * 19)
    if bottom - top < 150:
        raise RuntimeError("Chart height is too small for the selected title and style profile.")
    if show_volume and len(fetched) != 1:
        raise RuntimeError("Volume panels require exactly one market series.")
    volume_points = (
        [
            point
            for point in fetched[0]["points"]
            if point.get("volume") is not None
            and (point.get("state") != "forming" or render["show_forming_bar"])
        ]
        if show_volume
        else []
    )
    if show_volume and not volume_points:
        raise RuntimeError("show_volume is enabled, but the selected series has no volume data.")
    if show_volume:
        volume_height = min(max((bottom - top) * 0.24, 58.0), 76.0)
        volume_gap = 15.0
        price_bottom = bottom - volume_height - volume_gap
        volume_top = price_bottom + volume_gap
        if price_bottom - top < 120:
            raise RuntimeError("Chart height is too small for a readable price and volume split.")
    else:
        price_bottom = bottom
        volume_top = bottom

    values = [float(point["derived_value"]) for point in all_points]
    if render.get("chart_type") == "candles":
        values.extend(
            float(point[key])
            for point in all_points
            for key in ("high", "low")
            if point.get(key) is not None
        )
    for annotation in visible_annotations:
        if annotation["kind"] not in {"target", "trigger", "invalidation", "range_lower", "range_upper"}:
            continue
        value = annotation.get("value")
        if not isinstance(value, (int, float)):
            continue
        if render["y_axis"] == "price":
            values.append(float(value))
        else:
            series = next((item for item in spec["series"] if item["id"] == annotation.get("series_ref")), None)
            if series:
                values.append((float(value) / float(series["baseline"]["value"]) - 1.0) * 100.0)
    if render["y_axis"] in {"return_pct", "excess_return_pct"}:
        values.append(0.0)
    y_low, y_high = min(values), max(values)
    padding = max(
        (y_high - y_low) * 0.13,
        0.8 if render["y_axis"] != "price" else max(abs(y_high) * 0.01, 0.5),
    )
    y_low -= padding
    y_high += padding

    pieces: list[str] = []
    pieces.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="chart-title chart-desc" data-style-profile="{profile_name}" font-family="-apple-system, BlinkMacSystemFont, PingFang SC, Noto Sans CJK SC, sans-serif" font-variant-numeric="tabular-nums" letter-spacing="0">'
    )
    pieces.append(f'<title id="chart-title">{escape(render["title"])}</title>')
    pieces.append(f'<desc id="chart-desc">{escape(spec["claim"]["statement"])}</desc>')
    pieces.append(f'<metadata id="cuebook-chart-style">{profile_name}</metadata>')
    pieces.append(
        f'<rect width="{width}" height="{height}" rx="{profile["outer_radius"]}" fill="{COLORS["background"]}"/>'
    )
    pieces.append(
        f'<rect x="{left}" y="{top:.2f}" width="{right-left:.2f}" height="{bottom-top:.2f}" fill="{COLORS["plot"]}"/>'
    )
    if render["future_region"] and horizon > declared:
        future_start = declared if timeline_layout == "decision_split" else latest_observed
        future_x = x_scale(future_start, start, end, left, right)
        pieces.append(
            f'<rect x="{future_x:.2f}" y="{top:.2f}" width="{max(right-future_x, 0):.2f}" height="{bottom-top:.2f}" fill="{COLORS["future"]}" opacity="0.82"/>'
        )
        unresolved_x = x_scale(max(latest_observed, declared), start, end, left, right)
        if unresolved_x < right:
            pieces.append(
                f'<rect x="{unresolved_x:.2f}" y="{top:.2f}" width="{right-unresolved_x:.2f}" height="{bottom-top:.2f}" fill="{COLORS["future"]}" opacity="0.42"/>'
            )

    title_spans = []
    for index, line in enumerate(title_lines):
        dy = "0" if index == 0 else str(title_line_height)
        title_spans.append(f'<tspan x="{left}" dy="{dy}">{escape(line)}</tspan>')
    pieces.append(
        f'<text id="public-title" x="{left}" y="{title_y:.2f}" fill="{COLORS["text"]}" font-size="{title_size}" font-weight="650">{"".join(title_spans)}</text>'
    )
    pieces.append(
        f'<text x="{left}" y="{subtitle_y:.2f}" fill="{COLORS["muted"]}" font-size="14">{escape(subtitle)}</text>'
    )

    if len(fetched) == 1:
        metric_value = float(
            latest_primary.get("close")
            if render.get("chart_type") == "candles" and latest_primary.get("close") is not None
            else latest_primary["derived_value"]
        )
        metric_color = COLORS["primary"]
        delta_label = ""
        if render["y_axis"] == "price":
            baseline = float(primary_spec["baseline"]["value"])
            delta = (metric_value / baseline - 1.0) * 100.0
            metric_color = COLORS["primary"] if delta >= 0 else COLORS["danger"]
            delta_label = f"{delta:+.2f}%"
        elif metric_value < 0:
            metric_color = COLORS["danger"]
        state_label = ""
        if latest_primary.get("state") == "forming":
            state_label = "形成中" if locale == "zh-CN" else "forming"
        detail_label = " · ".join(item for item in (delta_label, state_label) if item)
        metric_caption = "最新" if locale == "zh-CN" else "Latest"
        pieces.append(
            f'<text x="{right}" y="30" text-anchor="end" fill="{COLORS["muted"]}" font-size="12">{escape(metric_caption)} · {escape(str(primary_fetched.get("observed_interval") or "?"))}</text>'
        )
        pieces.append(
            f'<text x="{right}" y="57" text-anchor="end" fill="{metric_color}" font-size="23" font-weight="700">{escape(fmt_value(metric_value, render["y_axis"]))}</text>'
        )
        if detail_label:
            pieces.append(
                f'<text x="{right}" y="78" text-anchor="end" fill="{metric_color}" font-size="12" font-weight="600">{escape(detail_label)}</text>'
            )
    if show_state:
        status = "CONDITIONAL" if spec["state"] == "conditional" else spec["state"].upper()
        pieces.append(
            f'<text x="{right}" y="16" text-anchor="end" fill="{COLORS["benchmark"]}" font-size="10" font-weight="650">{escape(status)}</text>'
        )

    if len(fetched) > 1:
        legend_x = left
        for fetched_series in fetched:
            color = series_color(fetched_series["role"])
            legend_label = f"{fetched_series['ticker']} · {fetched_series.get('observed_interval') or '?'}"
            pieces.append(
                f'<line x1="{legend_x}" y1="{legend_y:.2f}" x2="{legend_x+20}" y2="{legend_y:.2f}" stroke="{color}" stroke-width="3.5" stroke-linecap="round"/>'
            )
            pieces.append(
                f'<text x="{legend_x+29}" y="{legend_y+5:.2f}" fill="{COLORS["text"]}" font-size="13" font-weight="600">{escape(legend_label)}</text>'
            )
            legend_x += max(118.0, text_units(legend_label) * 8.0 + 48.0)

    grid_rows = int(profile["grid_rows"])
    for index in range(grid_rows):
        ratio = index / max(grid_rows - 1, 1)
        y = top + ratio * (price_bottom - top)
        value = y_high - ratio * (y_high - y_low)
        pieces.append(
            f'<line x1="{left}" y1="{y:.2f}" x2="{right}" y2="{y:.2f}" stroke="{COLORS["grid"]}" stroke-width="1"/>'
        )
        pieces.append(
            f'<text x="{left-10}" y="{y+4:.2f}" text-anchor="end" fill="{COLORS["muted"]}" font-size="11">{escape(fmt_value(value, render["y_axis"]))}</text>'
        )
    if render["y_axis"] in {"return_pct", "excess_return_pct"} and y_low <= 0 <= y_high:
        zero_y = y_scale(0, y_low, y_high, top, price_bottom)
        pieces.append(
            f'<line x1="{left}" y1="{zero_y:.2f}" x2="{right}" y2="{zero_y:.2f}" stroke="{COLORS["muted"]}" stroke-width="1.3" opacity="0.72"/>'
        )

    if show_volume:
        volume_chart_top = volume_top + 18.0
        volume_max = max(float(point["volume"]) for point in volume_points)
        average_points = previous_volume_averages(volume_points, volume_window)
        if average_points:
            volume_max = max(volume_max, max(value for _, value in average_points))
        volume_max = max(volume_max * 1.08, 1.0)
        bar_width = max(2.5, min(10.0, (right - left) / max(len(volume_points), 10) * 0.58))
        latest_sealed = next(
            (point for point in reversed(volume_points) if point.get("state") == "sealed"),
            None,
        )
        latest_ratio: float | None = None
        if latest_sealed is not None:
            latest_index = volume_points.index(latest_sealed)
            previous = [
                float(point["volume"])
                for point in volume_points[:latest_index]
                if point.get("state") == "sealed" and point.get("volume") is not None
            ][-volume_window:]
            if previous:
                latest_ratio = float(latest_sealed["volume"]) / (sum(previous) / len(previous))
        volume_label = f"成交量 · 前{volume_window}根均量" if locale == "zh-CN" else f"Volume · prior {volume_window}-bar average"
        pieces.append(f'<g id="volume-panel" data-average-window="{volume_window}">')
        pieces.append(
            f'<line x1="{left}" y1="{volume_top:.2f}" x2="{right}" y2="{volume_top:.2f}" stroke="{COLORS["grid"]}" stroke-width="1"/>'
        )
        pieces.append(
            f'<text x="{left}" y="{volume_top+11:.2f}" fill="{COLORS["muted"]}" font-size="10.5" font-weight="600">{escape(volume_label)}</text>'
        )
        if latest_ratio is not None:
            ratio_copy = (
                f"最新封盘 {latest_ratio:.2f}×均量"
                if locale == "zh-CN"
                else f"Last sealed {latest_ratio:.2f}× average"
            )
            ratio_color = COLORS["primary"] if latest_ratio >= 1.0 else COLORS["muted"]
            pieces.append(
                f'<text id="volume-ratio" x="{right}" y="{volume_top+11:.2f}" text-anchor="end" fill="{ratio_color}" font-size="10.5" font-weight="650">{escape(ratio_copy)}</text>'
            )
        for point in volume_points:
            x = x_scale(parse_dt(point["observed_at"]), start, end, left, right)
            volume = float(point["volume"])
            y = y_scale(volume, 0.0, volume_max, volume_chart_top, bottom)
            open_value = point.get("open")
            close_value = point.get("close")
            rising = open_value is None or close_value is None or float(close_value) >= float(open_value)
            color = COLORS["primary"] if rising else COLORS["danger"]
            forming = point.get("state") == "forming"
            dash_attr = ' stroke-dasharray="3 2"' if forming else ""
            pieces.append(
                f'<rect class="volume-bar" x="{x-bar_width/2:.2f}" y="{y:.2f}" width="{bar_width:.2f}" height="{max(bottom-y, 1.0):.2f}" rx="0.8" fill="{COLORS["plot"] if forming else color}" fill-opacity="{0.0 if forming else 0.42}" stroke="{color}" stroke-width="{1.1 if forming else 0.0}"{dash_attr}/>'
            )
        if len(average_points) >= 2:
            commands = []
            for index, (point, average) in enumerate(average_points):
                x = x_scale(parse_dt(point["observed_at"]), start, end, left, right)
                y = y_scale(average, 0.0, volume_max, volume_chart_top, bottom)
                commands.append(f"{'M' if index == 0 else 'L'} {x:.2f} {y:.2f}")
            pieces.append(
                f'<path id="volume-average" d="{" ".join(commands)}" fill="none" stroke="{COLORS["context"]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>'
            )
        pieces.append("</g>")

    axis_y = bottom + 24
    if timeline_layout == "decision_split":
        context_mid = start + (declared - start) * 0.52
        for moment, anchor in ((start, "start"), (context_mid, "middle")):
            x = x_scale(moment, start, end, left, right)
            pieces.append(
                f'<text x="{x:.2f}" y="{axis_y:.2f}" text-anchor="{anchor}" fill="{COLORS["muted"]}" font-size="11">{short_date(moment, locale)}</text>'
            )
        split_x = x_scale(declared, start, end, left, right)
        publish_label = f"发布 {short_date(declared, locale)}" if locale == "zh-CN" else f"Published {short_date(declared, locale)}"
        expiry_label = f"结算 {short_date(horizon, locale)}" if locale == "zh-CN" else f"Settle {short_date(horizon, locale)}"
        pieces.append(
            f'<text x="{split_x+7:.2f}" y="{axis_y:.2f}" text-anchor="start" fill="{COLORS["benchmark"]}" font-size="11" font-weight="650">{escape(publish_label)}</text>'
        )
        pieces.append(
            f'<text x="{right:.2f}" y="{axis_y:.2f}" text-anchor="end" fill="{COLORS["benchmark"]}" font-size="11" font-weight="650">{escape(expiry_label)}</text>'
        )
    else:
        for index in range(4):
            ratio = index / 3
            moment = start + (end - start) * ratio
            x = left + ratio * (right - left)
            anchor = "start" if index == 0 else "end" if index == 3 else "middle"
            pieces.append(
                f'<text x="{x:.2f}" y="{axis_y:.2f}" text-anchor="{anchor}" fill="{COLORS["muted"]}" font-size="11">{short_date(moment, locale)}</text>'
            )

    vertical_annotations = [
        item
        for item in visible_annotations
        if item["kind"] in {"event", "declaration", "baseline", "expiry"} and item.get("observed_at")
    ]
    vertical_label_slots: dict[str, int] = {}
    placed_verticals: list[tuple[float, int]] = []
    for annotation in sorted(vertical_annotations, key=lambda item: parse_dt(item["observed_at"])):
        x = x_scale(parse_dt(annotation["observed_at"]), start, end, left, right)
        occupied = {slot for other_x, slot in placed_verticals if abs(other_x - x) < 105}
        slot = next((candidate for candidate in range(4) if candidate not in occupied), 0)
        vertical_label_slots[annotation["id"]] = slot
        placed_verticals.append((x, slot))

    for annotation in visible_annotations:
        kind = annotation["kind"]
        color = COLORS["danger"] if kind in {"invalidation", "range_lower"} else COLORS["benchmark"]
        if kind in {"event", "declaration", "baseline", "expiry"} and annotation.get("observed_at"):
            at = parse_dt(annotation["observed_at"])
            if start <= at <= end:
                x = x_scale(at, start, end, left, right)
                dash = "6 6" if kind == "expiry" else "3 5"
                pieces.append(
                    f'<line x1="{x:.2f}" y1="{top:.2f}" x2="{x:.2f}" y2="{bottom:.2f}" stroke="{color}" stroke-width="1.4" stroke-dasharray="{dash}"/>'
                )
                if not (timeline_layout == "decision_split" and kind in {"declaration", "expiry"}):
                    anchor = "end" if x > (left + right) / 2 else "start"
                    dx = -7 if anchor == "end" else 7
                    label_y = price_bottom - 10 - vertical_label_slots.get(annotation["id"], 0) * 19
                    pieces.append(
                        f'<text x="{x+dx:.2f}" y="{label_y:.2f}" text-anchor="{anchor}" fill="{color}" font-size="11" font-weight="600">{escape(annotation["label"])}</text>'
                    )
        elif kind in {"target", "trigger", "invalidation", "range_lower", "range_upper"} and isinstance(annotation.get("value"), (int, float)):
            chart_value = float(annotation["value"])
            if render["y_axis"] != "price":
                series = next((item for item in spec["series"] if item["id"] == annotation.get("series_ref")), None)
                if not series:
                    continue
                chart_value = (chart_value / float(series["baseline"]["value"]) - 1.0) * 100.0
            y = y_scale(chart_value, y_low, y_high, top, price_bottom)
            pieces.append(
                f'<line x1="{left}" y1="{y:.2f}" x2="{right}" y2="{y:.2f}" stroke="{color}" stroke-width="1.4" stroke-dasharray="7 6"/>'
            )
            label = annotation["label"]
            label_width = min(max(text_units(label) * 7.2 + 18, 70), 190)
            if timeline_layout == "decision_split":
                split_x = x_scale(declared, start, end, left, right)
                label_x = split_x + 10
                label_width = min(label_width, max(right - label_x - 6, 70))
                text_x = label_x + 9
                text_anchor = "start"
            elif kind == "trigger":
                label_x = left + 3
                text_x = label_x + 9
                text_anchor = "start"
            else:
                label_x = right - label_width - 3
                text_x = right - 10
                text_anchor = "end"
            label_y = min(max(y - 22, top + 4), price_bottom - 23)
            pieces.append(
                f'<rect x="{label_x:.2f}" y="{label_y:.2f}" width="{label_width:.2f}" height="20" rx="3" fill="{COLORS["plot"]}" stroke="{color}" stroke-width="0.8"/>'
            )
            pieces.append(
                f'<text x="{text_x:.2f}" y="{label_y+14:.2f}" text-anchor="{text_anchor}" fill="{color}" font-size="11" font-weight="650">{escape(ellipsize(label, max((label_width-16)/7.2, 8)))}</text>'
            )

    for fetched_series in fetched:
        color = series_color(fetched_series["role"])
        ticker = fetched_series["ticker"]
        sealed = [point for point in fetched_series["points"] if point["state"] != "forming"]
        forming = [point for point in fetched_series["points"] if point["state"] == "forming"]
        if render.get("chart_type") == "candles":
            visible_points = [
                point
                for point in fetched_series["points"]
                if point["state"] != "forming" or render["show_forming_bar"]
            ]
            history_count = max(sum(parse_dt(point["observed_at"]) <= declared for point in visible_points), 10)
            history_right = x_scale(declared, start, end, left, right) if timeline_layout == "decision_split" else right
            candle_width = max(3.5, min(13.0, (history_right - left) / history_count * 0.58))
            for point in visible_points:
                x = x_scale(parse_dt(point["observed_at"]), start, end, left, right)
                open_value = float(point["open"])
                close_value = float(point["close"])
                high_value = float(point["high"])
                low_value = float(point["low"])
                candle_color = COLORS["primary"] if close_value >= open_value else COLORS["danger"]
                wick_top = y_scale(high_value, y_low, y_high, top, price_bottom)
                wick_bottom = y_scale(low_value, y_low, y_high, top, price_bottom)
                body_top = y_scale(max(open_value, close_value), y_low, y_high, top, price_bottom)
                body_bottom = y_scale(min(open_value, close_value), y_low, y_high, top, price_bottom)
                body_height = max(body_bottom - body_top, 2.0)
                forming_style = point["state"] == "forming"
                dash_attr = ' stroke-dasharray="3 2"' if forming_style else ""
                pieces.append(
                    f'<line x1="{x:.2f}" y1="{wick_top:.2f}" x2="{x:.2f}" y2="{wick_bottom:.2f}" stroke="{candle_color}" stroke-width="1.4" opacity="{0.68 if forming_style else 1}"{dash_attr}/>'
                )
                pieces.append(
                    f'<rect x="{x-candle_width/2:.2f}" y="{body_top:.2f}" width="{candle_width:.2f}" height="{body_height:.2f}" rx="1" fill="{COLORS["plot"] if forming_style else candle_color}" stroke="{candle_color}" stroke-width="1.6"{dash_attr}/>'
                )
        else:
            if len(sealed) >= 2:
                pieces.append(
                    f'<path d="{path_for(sealed, start, end, left, right, top, price_bottom, y_low, y_high)}" fill="none" stroke="{color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
                )
                final_sealed = sealed[-1]
                final_x = x_scale(parse_dt(final_sealed["observed_at"]), start, end, left, right)
                final_y = y_scale(float(final_sealed["derived_value"]), y_low, y_high, top, price_bottom)
                pieces.append(f'<circle cx="{final_x:.2f}" cy="{final_y:.2f}" r="3.5" fill="{color}"/>')
            elif sealed:
                point = sealed[0]
                x = x_scale(parse_dt(point["observed_at"]), start, end, left, right)
                y = y_scale(float(point["derived_value"]), y_low, y_high, top, price_bottom)
                pieces.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4" fill="{color}"/>')
            if forming and render["show_forming_bar"]:
                forming_point = forming[-1]
                segment = ([sealed[-1]] if sealed else []) + [forming_point]
                if len(segment) == 2:
                    pieces.append(
                        f'<path d="{path_for(segment, start, end, left, right, top, price_bottom, y_low, y_high)}" fill="none" stroke="{color}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>'
                    )
                x = x_scale(parse_dt(forming_point["observed_at"]), start, end, left, right)
                y = y_scale(float(forming_point["derived_value"]), y_low, y_high, top, price_bottom)
                pieces.append(
                    f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4.5" fill="{COLORS["plot"]}" stroke="{color}" stroke-width="2.5"/>'
                )
                if len(fetched) > 1:
                    label = f"{ticker} {fmt_value(float(forming_point['derived_value']), render['y_axis'])}"
                    anchor = "end" if x > right - 140 else "start"
                    dx = -9 if anchor == "end" else 9
                    pieces.append(
                        f'<text x="{x+dx:.2f}" y="{y-9:.2f}" text-anchor="{anchor}" fill="{color}" font-size="12" font-weight="650">{escape(label)}</text>'
                    )

    if timeline_layout == "decision_split" and render.get("show_settlement_panel", False):
        split_x = x_scale(declared, start, end, left, right)
        panel_x = split_x + 12
        panel_width = max(right - panel_x - 8, 120)
        panel_y = price_bottom - 84
        pieces.append(
            f'<rect x="{panel_x:.2f}" y="{panel_y:.2f}" width="{panel_width:.2f}" height="70" rx="6" fill="{COLORS["panel"]}" stroke="{COLORS["benchmark"]}" stroke-width="1"/>'
        )
        panel_title = f"结算条件 · {horizon.date().isoformat()}" if locale == "zh-CN" else f"Settlement · {horizon.date().isoformat()}"
        pieces.append(
            f'<text x="{panel_x+12:.2f}" y="{panel_y+21:.2f}" fill="{COLORS["benchmark"]}" font-size="11" font-weight="700">{escape(panel_title)}</text>'
        )
        success_lines = wrap_text(render["success_label"], max(panel_width / 12.0, 12), 2)
        for index, line in enumerate(success_lines):
            pieces.append(
                f'<text x="{panel_x+12:.2f}" y="{panel_y+44+index*17:.2f}" fill="{COLORS["text"]}" font-size="11" font-weight="600">{escape(line)}</text>'
            )

    if render.get("watermark", True):
        mark_x = left + 12
        mark_y = price_bottom - 14
        pieces.append(
            f'<rect x="{mark_x:.2f}" y="{mark_y-15:.2f}" width="20" height="20" rx="4" fill="{COLORS["muted"]}" opacity="0.13"/>'
        )
        pieces.append(
            f'<text x="{mark_x+10:.2f}" y="{mark_y:.2f}" text-anchor="middle" fill="{COLORS["text"]}" font-size="12" font-weight="800" opacity="0.18">C</text>'
        )
        pieces.append(
            f'<text x="{mark_x+28:.2f}" y="{mark_y:.2f}" fill="{COLORS["text"]}" font-size="18" font-weight="700" opacity="0.11">Cuebook</text>'
        )

    footer_lines: list[str] = []
    source_intervals = ", ".join(f"{item['ticker']} {item['observed_interval'] or '?'}" for item in fetched)
    if show_provenance:
        footer_lines.append(f"Cuebook OHLCV · {source_intervals}")
    if show_guide:
        if locale == "zh-CN":
            footer_lines.append("实体/实线：已封盘 · 空心虚线：形成中 · 淡黄区：待结算")
        elif render.get("chart_type") == "candles":
            footer_lines.append("Solid candle: sealed · hollow/dashed: forming · pale area: unresolved")
        else:
            footer_lines.append("Solid: sealed · dashed/hollow: forming · pale area: unresolved")
    first_footer_y = height - 18 * len(footer_lines)
    for index, line in enumerate(footer_lines):
        pieces.append(
            f'<text x="{left}" y="{first_footer_y+index*18:.2f}" fill="{COLORS["muted"]}" font-size="11">{escape(line)}</text>'
        )
    pieces.append("</svg>")
    return "\n".join(pieces)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--market-data",
        type=Path,
        help="Optional MarketSeriesBatchV1 exported by Cuebook's own OHLCV database.",
    )
    args = parser.parse_args()
    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Unable to read chart spec: {exc}", file=sys.stderr)
        return 1
    result = validate(spec)
    if not result["valid"]:
        print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    market_batch: dict[str, Any] | None = None
    if args.market_data:
        try:
            market_batch = json.loads(args.market_data.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Unable to read market-data batch: {exc}", file=sys.stderr)
            return 1

    fetched_at = datetime.now(timezone.utc)
    fetched: list[dict[str, Any]] = []
    try:
        for series in spec["series"]:
            if market_batch is not None:
                fetched.append(load_canonical_series(spec, series, market_batch))
            elif str(series["provider"]["name"]).lower() == "cuebook":
                fetched.append(fetch_cuebook_series(spec, series))
            else:
                raise RuntimeError(
                    f"No online adapter registered for provider {series['provider']['name']}; pass --market-data with MarketSeriesBatchV1."
                )
        observed_intervals = {item["observed_interval"] for item in fetched}
        interval_warnings = []
        if observed_intervals != {spec["time"]["observed_interval"]}:
            interval_warnings.append(
                f"Spec observed_interval={spec['time']['observed_interval']}; provider returned {sorted(str(item) for item in observed_intervals)}."
            )
        provenance = {
            "schema_version": "thesis-chart-data-v1",
            "chart_id": spec["chart_id"],
            "fetched_at": iso_utc(fetched_at),
            "preferred_interval": spec["time"]["preferred_interval"],
            "declared_observed_interval": spec["time"]["observed_interval"],
            "provider_observed_intervals": sorted(str(item) for item in observed_intervals),
            "input_mode": "market-series-batch" if market_batch is not None else "provider-fetch",
            "source_fetched_at": market_batch.get("fetched_at") if market_batch is not None else None,
            "interval_warnings": interval_warnings,
            "series": fetched,
        }
        svg = render_svg(spec, fetched)
    except Exception as exc:
        print(f"Chart rendering failed: {exc}", file=sys.stderr)
        return 1

    args.output_dir.mkdir(parents=True, exist_ok=True)
    svg_path = args.output_dir / "chart.svg"
    data_path = args.output_dir / "chart-data.json"
    svg_path.write_text(svg, encoding="utf-8")
    data_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"chart": str(svg_path), "data": str(data_path)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
