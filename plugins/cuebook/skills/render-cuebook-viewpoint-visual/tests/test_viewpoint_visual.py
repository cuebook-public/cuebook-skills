from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import re
import shutil
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEST_TMP = ROOT / ".test-tmp"
TEST_TMP.mkdir(exist_ok=True)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VALIDATOR = load_module("viewpoint_visual_validator_test", ROOT / "scripts" / "validate_viewpoint_visual.py")
RENDERER = load_module("viewpoint_visual_renderer_test", ROOT / "scripts" / "render_viewpoint_visual.py")
FINALIZER = load_module("viewpoint_visual_finalizer_test", ROOT / "scripts" / "finalize_wide_viewpoint.py")

SOURCES = [f"source:test:{index}" for index in range(1, 10)]


def empty_data() -> dict:
    return {key: [] for key in ("series", "values", "levels", "events", "nodes", "edges", "rails", "stages")}


def base_spec(grammar: str, mode: str) -> dict:
    return {
        "schema_version": "viewpoint-visual-spec-v1",
        "spec_id": f"VVSPEC_{grammar.replace('_', '')}20260714",
        "revision": 1,
        "state": "ready",
        "grammar": grammar,
        "payload_mode": mode,
        "visual_job": VALIDATOR.GRAMMAR_JOBS[grammar],
        "lineage": {
            "input_artifact_refs": ["POST_viewpoint20260714"],
            "source_refs": SOURCES,
            "decision_cutoff_at": "2026-07-14T09:00:00Z",
        },
        "frame": {
            "headline": "The market is telling a different story",
            "observation": "The explicit evidence changes how I frame the trade.",
            "observed_at": "2026-07-14T08:30:00Z",
            "strategy_tags": ["event test", "relative value", "short horizon", "risk check"],
            "alt_text": "A compact Cuebook visual presents the creator judgment and its explicit evidence relationship.",
        },
        "data": empty_data(),
        "render": {
            "layout": "landscape",
            "width": 720,
            "height": 420,
            "theme": "cuebook_accessible_light",
            "watermark": "Cuebook",
            "generated_at": "2026-07-14T09:01:00Z",
        },
        "quality_report": {"decision": "ready", "warnings": [], "hard_failures": []},
    }


def rail(
    identifier: str,
    role: str,
    label: str,
    detail: str,
    *,
    display_value: str | None = None,
    numeric_value: float | None = None,
    unit: str | None = None,
    shape: str = "circle",
    path_kind: str = "solid",
    source: str = SOURCES[0],
    formula: str | None = None,
) -> dict:
    return {
        "id": identifier,
        "label": label,
        "detail": detail,
        "role": role,
        "display_value": display_value,
        "numeric_value": numeric_value,
        "unit": unit,
        "formula": formula,
        "source_refs": [source],
        "shape": shape,
        "path_kind": path_kind,
    }


def node(identifier: str, role: str, label: str, shape: str, source: str, path_kind: str = "solid") -> dict:
    return {
        "id": identifier,
        "label": label,
        "role": role,
        "source_refs": [source],
        "shape": shape,
        "path_kind": path_kind,
    }


def edge(identifier: str, source_id: str, target_id: str, relation: str, source: str, path_kind: str = "solid", label: str | None = None) -> dict:
    return {
        "id": identifier,
        "from": source_id,
        "to": target_id,
        "relation": relation,
        "label": label,
        "source_refs": [source],
        "path_kind": path_kind,
    }


def value(identifier: str, role: str, label: str, display: str, number: float, unit: str, source: str, shape: str, formula: str | None = None) -> dict:
    return {
        "id": identifier,
        "label": label,
        "role": role,
        "display_value": display,
        "numeric_value": number,
        "unit": unit,
        "as_of": "2026-07-14T08:20:00Z",
        "source_ref": source,
        "shape": shape,
        "formula": formula,
    }


def observed_series(identifier: str, role: str, label: str, values: list[float], source: str, unit: str = "%") -> dict:
    times = ["2026-07-14T05:00:00Z", "2026-07-14T06:00:00Z", "2026-07-14T07:00:00Z", "2026-07-14T08:00:00Z"]
    return {
        "id": identifier,
        "label": label,
        "role": role,
        "data_kind": "observed",
        "unit": unit,
        "source_ref": source,
        "points": [{"x": timestamp, "y": number, "source_ref": None} for timestamp, number in zip(times, values)],
    }


def grammar_spec(grammar: str) -> dict:
    if grammar == "reaction_test":
        spec = base_spec(grammar, "qualitative")
        spec["frame"].update(
            {
                "headline": "Bad news landed, but price barely moved",
                "observation": "Pressure increased while the tape stayed muted.",
                "alt_text": "Two rails compare rising bad-news pressure with a muted reported price response.",
            }
        )
        spec["data"]["rails"] = [
            rail("R1", "pressure", "Bad-news pressure", "Warnings intensified", shape="triangle", source=SOURCES[0]),
            rail("R2", "response", "Price response", "The reported move stayed muted", shape="circle", source=SOURCES[1]),
        ]
        return spec
    if grammar == "parallel_contrast":
        spec = base_spec(grammar, "key_numbers")
        spec["frame"].update(
            {
                "headline": "Savings utility is not the same bet as spot ETH",
                "observation": "Reported outcomes belong on parallel rails, not a fake chart.",
                "alt_text": "Parallel rails compare a reported five-times five-year savings outcome with the spot ETH experience.",
            }
        )
        spec["data"]["rails"] = [
            rail("R1", "primary", "Five-year savings", "Reported savings outcome", display_value="5x", numeric_value=5, unit="x", shape="circle", source=SOURCES[0]),
            rail("R2", "comparison", "Spot ETH experience", "Reported spot exposure", display_value="spot ETH", shape="square", source=SOURCES[1]),
        ]
        return spec
    if grammar == "category_reframe":
        spec = base_spec(grammar, "qualitative")
        spec["data"]["nodes"] = [
            node("N1", "frame_from", "Token beta proxy", "square", SOURCES[0]),
            node("N2", "frame_to", "Savings network", "circle", SOURCES[1]),
        ]
        spec["data"]["edges"] = [edge("E1", "N1", "N2", "reframes", SOURCES[2], label="new frame")]
        return spec
    if grammar == "relative_value_trigger":
        spec = base_spec(grammar, "key_numbers")
        spec["data"]["values"] = [value("V1", "spread", "Pair spread", "1.2pp", 1.2, "pp", SOURCES[0], "circle")]
        spec["data"]["levels"] = [
            {
                "id": "L1",
                "label": "Activation level",
                "role": "trigger",
                "display_value": "1.0pp",
                "numeric_value": 1.0,
                "unit": "pp",
                "relation": "above",
                "relation_label": "Trigger cleared",
                "source_ref": SOURCES[1],
            }
        ]
        return spec
    if grammar == "policy_pivot":
        spec = base_spec(grammar, "qualitative")
        spec["data"]["nodes"] = [
            node("N1", "policy_before", "Inflation first", "square", SOURCES[0]),
            node("N2", "policy_after", "Growth protection", "circle", SOURCES[1], "conditional"),
        ]
        spec["data"]["edges"] = [edge("E1", "N1", "N2", "pivots", SOURCES[2], "conditional", "stance turns")]
        spec["data"]["events"] = [{"id": "EVT1", "label": "Policy meeting", "occurred_at": "2026-07-14T07:00:00Z", "source_ref": SOURCES[3]}]
        return spec
    if grammar == "sentiment_witness":
        spec = base_spec(grammar, "key_numbers")
        spec["data"]["rails"] = [
            rail("R1", "baseline", "Prior sentiment", "Earlier survey reading", display_value="42", numeric_value=42, unit="index", shape="square", source=SOURCES[0]),
            rail("R2", "witness", "Current witness", "Latest survey reading", display_value="68", numeric_value=68, unit="index", shape="circle", source=SOURCES[1]),
        ]
        return spec
    if grammar == "event_unwind":
        spec = base_spec(grammar, "qualitative")
        spec["frame"].update(
            {
                "headline": "The event trade moves from pre-buy to patience",
                "observation": "Crowding exited on the event; the next leg waits for supply.",
                "alt_text": "A three-stage timeline moves from crowded pre-buy to event-day exit, then a dashed future path to waiting for sellers.",
            }
        )
        spec["data"]["stages"] = [
            {
                "id": "T1", "label": "Crowded pre-buy", "detail": "Positioning built early", "role": "pre_event",
                "occurred_at": None, "display_value": None, "numeric_value": None, "unit": None,
                "source_refs": [SOURCES[0]], "shape": "square", "path_kind": "solid",
            },
            {
                "id": "T2", "label": "Event-day exit", "detail": "Holders sold the release", "role": "event_day",
                "occurred_at": "2026-07-14T07:00:00Z", "display_value": None, "numeric_value": None, "unit": None,
                "source_refs": [SOURCES[1]], "shape": "triangle", "path_kind": "solid",
            },
            {
                "id": "T3", "label": "Wait for sellers", "detail": "Re-entry waits for supply", "role": "next_step",
                "occurred_at": None, "display_value": None, "numeric_value": None, "unit": None,
                "source_refs": [SOURCES[2]], "shape": "circle", "path_kind": "future",
            },
        ]
        return spec
    if grammar == "feedback_loop":
        spec = base_spec(grammar, "mixed")
        spec["data"]["nodes"] = [
            node("N1", "loop", "Shock hits flows", "circle", SOURCES[0]),
            node("N2", "loop", "Flows hit price", "square", SOURCES[1]),
            node("N3", "loop", "Price hits mood", "diamond", SOURCES[2], "conditional"),
        ]
        spec["data"]["edges"] = [
            edge("E1", "N1", "N2", "reinforces", SOURCES[3]),
            edge("E2", "N2", "N3", "reinforces", SOURCES[4], "conditional"),
            edge("E3", "N3", "N1", "reinforces", SOURCES[5], "conditional"),
        ]
        spec["data"]["values"] = [
            value("V1", "shock_primary", "Event shock", "-15.37%", -15.37, "%", SOURCES[6], "triangle"),
            value("V2", "shock_secondary", "Index move", "about -9%", -9, "%", SOURCES[7], "square"),
        ]
        return spec
    if grammar == "binary_level":
        spec = base_spec(grammar, "key_numbers")
        spec["data"]["values"] = [value("V1", "current", "Current price", "$101", 101, "USD", SOURCES[0], "circle")]
        spec["data"]["levels"] = [
            {
                "id": "L1", "label": "Decision level", "role": "threshold", "display_value": "$100",
                "numeric_value": 100, "unit": "USD", "relation": "above", "relation_label": "Level still holds",
                "source_ref": SOURCES[1],
            }
        ]
        return spec
    if grammar == "expectation_gap":
        spec = base_spec(grammar, "key_numbers")
        spec["data"]["values"] = [
            value("V1", "expected", "Expected", "100", 100, "index", SOURCES[0], "square"),
            value("V2", "actual", "Actual", "92", 92, "index", SOURCES[1], "circle"),
            value("V3", "gap", "Gap", "-8", -8, "index", SOURCES[2], "triangle", "actual - expected"),
        ]
        return spec
    if grammar == "factor_rotation":
        spec = base_spec(grammar, "qualitative")
        spec["data"]["rails"] = [
            rail("R1", "from", "Market input", "One common return window", shape="square", source=SOURCES[0]),
            rail(
                "R2",
                "to",
                "Rotation formula",
                "Compare the same window",
                shape="circle",
                path_kind="conditional",
                source=SOURCES[1],
                formula="cash-flow return - duration return",
            ),
        ]
        return spec
    raise AssertionError(grammar)


def series_spec(grammar: str) -> dict:
    spec = base_spec(grammar, "series")
    if grammar == "reaction_test":
        spec["data"]["series"] = [observed_series("S1", "reaction", "Tape", [0.0, -1.2, -0.4, -0.2], SOURCES[0])]
        spec["data"]["events"] = [{"id": "EVT1", "label": "News landed", "occurred_at": "2026-07-14T06:30:00Z", "source_ref": SOURCES[1]}]
    elif grammar == "parallel_contrast":
        spec["data"]["series"] = [
            observed_series("S1", "primary", "Primary", [0, 1, 3, 4], SOURCES[0]),
            observed_series("S2", "comparison", "Comparator", [0, 0.5, 1, 1.5], SOURCES[1]),
        ]
    elif grammar == "sentiment_witness":
        spec["data"]["series"] = [observed_series("S1", "witness", "Sentiment", [40, 44, 55, 68], SOURCES[0], "index")]
    elif grammar == "event_unwind":
        spec["data"]["series"] = [observed_series("S1", "unwind", "Event path", [100, 120, 130, 112], SOURCES[0], "index")]
        spec["data"]["events"] = [{"id": "EVT1", "label": "Event day", "occurred_at": "2026-07-14T06:00:00Z", "source_ref": SOURCES[1]}]
    elif grammar == "factor_rotation":
        spec["data"]["series"] = [
            observed_series("S1", "primary", "Cash flow", [0, 1, 2, 4], SOURCES[0]),
            observed_series("S2", "comparison", "Duration", [0, -0.5, -1, -2], SOURCES[1]),
        ]
    elif grammar == "binary_level":
        spec["data"]["series"] = [
            observed_series("S1", "level_test", "Price path", [1_820_000, 1_860_000, 1_840_000, 1_910_000], SOURCES[0], "KRW")
        ]
        spec["data"]["levels"] = [
            {
                "id": "L1", "label": "Decision level", "role": "threshold", "display_value": "KRW 1.85m",
                "numeric_value": 1_850_000, "unit": "KRW", "relation": "above", "relation_label": "Level reclaimed",
                "source_ref": SOURCES[1],
            }
        ]
    else:
        raise AssertionError(grammar)
    return spec


def contrast_ratio(foreground: str, background: str) -> float:
    def luminance(color: str) -> float:
        channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
        linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

    first, second = luminance(foreground), luminance(background)
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)


def browser_available() -> bool:
    candidates = [
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/chromium"),
    ]
    return shutil.which("node") is not None and any(path.is_file() for path in candidates)


class ViewpointVisualTests(unittest.TestCase):
    def test_all_eleven_grammars_validate_and_render(self):
        for grammar in VALIDATOR.GRAMMAR_JOBS:
            with self.subTest(grammar=grammar), tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
                spec = grammar_spec(grammar)
                validation = VALIDATOR.validate_spec(spec)
                self.assertTrue(validation["valid"], validation["errors"])
                result = RENDERER.render(spec, Path(directory), rasterize=False)
                manifest_validation = VALIDATOR.validate_manifest(result["manifest"], Path(directory))
                self.assertTrue(manifest_validation["valid"], manifest_validation["errors"])
                self.assertEqual(result["manifest"]["grammar"], grammar)

    def test_s1_qualitative_reaction_uses_rails_without_curve(self):
        spec = grammar_spec("reaction_test")
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertEqual(svg.count('data-rail="'), 2)
            self.assertNotIn("<polyline", svg)
            self.assertIn("Bad-news pressure", svg)
            self.assertIn("Price response", svg)

    def test_x1_reported_outcomes_use_key_number_rails(self):
        spec = grammar_spec("parallel_contrast")
        self.assertTrue(VALIDATOR.validate_spec(spec)["valid"])
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn("5x", svg)
            self.assertIn("Spot ETH experience", svg)
            self.assertNotIn("<polyline", svg)

    def test_x7_event_timeline_dashes_explicit_future_path(self):
        spec = grammar_spec("event_unwind")
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            visible_text = " ".join(text.strip() for text in ET.fromstring(svg).itertext() if text.strip())
            self.assertEqual(svg.count('data-stage="'), 3)
            self.assertIn("Wait for sellers", visible_text)
            self.assertIn('stroke-dasharray="8 7"', svg)
            self.assertNotIn("<polyline", svg)

    def test_x7_qualitative_timeline_does_not_invent_event_time(self):
        spec = grammar_spec("event_unwind")
        spec["data"]["stages"][1]["occurred_at"] = None
        validation = VALIDATOR.validate_spec(spec)
        self.assertTrue(validation["valid"], validation["errors"])
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertNotIn("14 JUL / 07:00", svg)

    def test_series_modes_keep_quantitative_gates(self):
        for grammar in ("reaction_test", "parallel_contrast", "sentiment_witness", "event_unwind", "factor_rotation", "binary_level"):
            with self.subTest(grammar=grammar):
                result = VALIDATOR.validate_spec(series_spec(grammar))
                self.assertTrue(result["valid"], result["errors"])

        unsynchronized = series_spec("parallel_contrast")
        unsynchronized["data"]["series"][1]["points"][1]["x"] = "2026-07-14T06:05:00Z"
        result = VALIDATOR.validate_spec(unsynchronized)
        self.assertIn("SYNCHRONIZED_SERIES", {item["code"] for item in result["errors"]})

        not_unwound = series_spec("event_unwind")
        not_unwound["data"]["series"][0]["points"][-1]["y"] = 135
        result = VALIDATOR.validate_spec(not_unwound)
        self.assertIn("UNWIND_ARITHMETIC", {item["code"] for item in result["errors"]})

    def test_qualitative_mode_rejects_numeric_payload(self):
        spec = grammar_spec("reaction_test")
        spec["data"]["rails"][0].update({"display_value": "5x", "numeric_value": 5, "unit": "x"})
        result = VALIDATOR.validate_spec(spec)
        self.assertIn("QUALITATIVE_NUMERIC_DATA", {item["code"] for item in result["errors"]})

    def test_x8_mixed_feedback_keeps_shocks_beside_one_loop(self):
        spec = grammar_spec("feedback_loop")
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn("-15.37%", svg)
            self.assertIn("about -9%", svg)
            self.assertEqual(svg.count('data-node="'), 3)
            self.assertEqual(result["manifest"]["payload_mode"], "mixed")

    def test_x9_series_binary_level_draws_real_path_and_level(self):
        spec = series_spec("binary_level")
        validation = VALIDATOR.validate_spec(spec)
        self.assertTrue(validation["valid"], validation["errors"])
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertIn("<polyline", svg)
            self.assertIn('data-level="L1"', svg)
            self.assertIn("KRW 1.85m", svg)

    def test_two_series_endpoint_labels_stay_inside_canvas(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(series_spec("parallel_contrast"), Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            self.assertEqual(svg.count('<text x="540.0"'), 2)
            self.assertNotIn('<text x="558.0"', svg)

    def test_x9_level_and_endpoint_labels_use_separate_anchors(self):
        spec = series_spec("binary_level")
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            root = ET.fromstring(result["svg_path"].read_text(encoding="utf-8"))
            texts = list(root.iter("{http://www.w3.org/2000/svg}text"))
            level_text = next(item for item in texts if "Decision level" in "".join(item.itertext()))
            endpoint_text = next(item for item in texts if "Price path" in "".join(item.itertext()))
            self.assertEqual(level_text.attrib["text-anchor"], "start")
            self.assertEqual(endpoint_text.attrib["text-anchor"], "end")
            self.assertLess(float(level_text.attrib["x"]), float(endpoint_text.attrib["x"]))

    def test_x11_qualitative_factor_rotation_renders_formula_without_value(self):
        spec = grammar_spec("factor_rotation")
        self.assertFalse(spec["data"]["values"])
        self.assertTrue(all(item["numeric_value"] is None for item in spec["data"]["rails"]))
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(spec, Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            visible_text = " ".join(text.strip() for text in ET.fromstring(svg).itertext() if text.strip())
            self.assertIn("cash-flow return - duration return", visible_text)

    def test_accessibility_scale_tokens_and_straight_geometry(self):
        allowed_colors = set(RENDERER.COLORS.values())
        for grammar in VALIDATOR.GRAMMAR_JOBS:
            with self.subTest(grammar=grammar), tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
                result = RENDERER.render(grammar_spec(grammar), Path(directory), rasterize=False)
                svg = result["svg_path"].read_text(encoding="utf-8")
                self.assertIn('role="img"', svg)
                self.assertIn('aria-labelledby="vv-title vv-desc"', svg)
                self.assertIn("<title id=", svg)
                self.assertIn("<desc id=", svg)
                self.assertNotIn("<linearGradient", svg)
                self.assertNotRegex(svg, r'<path[^>]+data-series=')
                for series_mark in re.findall(r'<polyline[^>]+data-series="[^"]+"[^>]*>', svg):
                    self.assertIn('data-interpolation="none"', series_mark)
                self.assertNotIn("source:test", svg)
                self.assertNotRegex(svg, r">(?:ready|conditional|future|blocked|settlement)<")
                font_sizes = [int(value) for value in re.findall(r'font-size="(\d+)"', svg)]
                self.assertTrue(font_sizes)
                self.assertGreaterEqual(min(font_sizes), 22)
                colors = set(re.findall(r"#[0-9A-Fa-f]{6}", svg))
                self.assertTrue(colors <= allowed_colors, colors - allowed_colors)

    def test_editorial_v2_uses_distinct_unframed_compositions(self):
        signatures = {
            "reaction_test": 'stroke-width="7.0"',
            "parallel_contrast": 'x1="360.0" y1="228.0"',
            "category_reframe": 'data-edge="E1"',
            "relative_value_trigger": "Trigger cleared",
            "policy_pivot": 'data-event="EVT1"',
            "sentiment_witness": 'x1="342.0" y1="238.0"',
            "event_unwind": 'data-stage="T3"',
            "feedback_loop": 'data-role="causal-loop"',
            "binary_level": 'data-level="L1"',
            "expectation_gap": 'font-size="50"',
            "factor_rotation": 'x1="292.0" y1="290.0"',
        }
        for grammar, signature in signatures.items():
            with self.subTest(grammar=grammar), tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
                result = RENDERER.render(grammar_spec(grammar), Path(directory), rasterize=False)
                svg = result["svg_path"].read_text(encoding="utf-8")
                root = ET.fromstring(svg)
                self.assertEqual(root.attrib["data-design-language"], "cuebook-editorial-signal-v2")
                self.assertEqual(root.attrib["data-composition"], grammar)
                self.assertIn(signature, svg)
                self.assertLessEqual(svg.count("<rect"), 5)
                self.assertNotRegex(svg, r'<rect[^>]+data-(?:rail|node|stage)=')

    def test_canonical_wordmark_is_the_final_visual_layer(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(grammar_spec("parallel_contrast"), Path(directory), rasterize=False)
            svg = result["svg_path"].read_text(encoding="utf-8")
            match = re.search(r'<g data-cuebook-wordmark="v1".*?>(.*?)</g>\s*</svg>', svg, flags=re.S)
            self.assertIsNotNone(match)
            self.assertIn('transform="translate(625 388)"', svg)
            self.assertEqual(re.findall(r'<path d="([^"]+)"', match.group(1)), RENDERER.WORDMARK_PATHS)
            self.assertEqual(match.group(1).count('fill="currentColor"'), len(RENDERER.WORDMARK_PATHS))
            self.assertNotRegex(svg, r'<text[^>]*>.*?(?:Cuebook|>C<).*?</text>')

    def test_text_tokens_meet_small_text_contrast(self):
        text_keys = ("ink", "muted", "positive", "comparison", "negative", "highlight_ink")
        for surface in ("canvas", "surface"):
            for key in text_keys:
                with self.subTest(surface=surface, text=key):
                    self.assertGreaterEqual(contrast_ratio(RENDERER.COLORS[key], RENDERER.COLORS[surface]), 4.5)

    def test_svg_and_manifest_are_deterministic(self):
        spec = grammar_spec("parallel_contrast")
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as first, tempfile.TemporaryDirectory(dir=TEST_TMP) as second:
            one = RENDERER.render(spec, Path(first), rasterize=False)
            two = RENDERER.render(copy.deepcopy(spec), Path(second), rasterize=False)
            self.assertEqual(one["svg_path"].read_bytes(), two["svg_path"].read_bytes())
            self.assertEqual(one["manifest"], two["manifest"])

    def test_wide_manifest_contract_uses_launch_dimensions_and_html_source(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(grammar_spec("parallel_contrast"), Path(directory), rasterize=False)
            manifest = copy.deepcopy(result["manifest"])
            placeholder_hash = "sha256:" + "1" * 64
            manifest.update(
                {
                    "render_profile": "wide_2680",
                    "spec_ref": "VDIR_parallelcontrast20260714",
                    "grammar": "event_transmission",
                    "visual_job": "render_selected_direction",
                    "dimensions": {"width": 2680, "height": 1056},
                    "theme": "quiet-cobalt",
                }
            )
            manifest["asset"] = {
                "html": {"ref": "direction.html", "sha256": placeholder_hash},
                "svg": None,
                "font_manifest": {"ref": "fonts/font-assets-v1.json", "sha256": placeholder_hash},
                "png_derivatives": [
                    {"kind": "full", "ref": "viewpoint-2680.png", "width": 2680, "height": 1056, "sha256": placeholder_hash},
                    {"kind": "compact_670", "ref": "viewpoint-670.png", "width": 670, "height": 264, "sha256": placeholder_hash},
                ],
                "derivative_bundle_hash": placeholder_hash,
            }
            validation = VALIDATOR.validate_manifest(manifest)
            self.assertTrue(validation["valid"], validation["errors"])

            manifest["dimensions"] = {"width": 720, "height": 420}
            invalid = VALIDATOR.validate_manifest(manifest)
            self.assertIn("DIMENSIONS", {item["code"] for item in invalid["errors"]})

    def test_wide_finalizer_binds_selected_html_and_both_pngs(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            root = Path(directory)
            wordmark = (ROOT.parent / "direct-cuebook-viewpoint-visual" / "assets" / "cuebook-wordmark.svg").read_text(encoding="utf-8")
            wordmark = wordmark.replace(
                "<svg ",
                '<svg data-cuebook-wordmark="v1" data-role="brand" ',
                1,
            ).replace('fill="#F2F3F4"', 'fill="currentColor"')
            fonts = root / "fonts"
            fonts.mkdir()
            font_records = []
            for weight, label in ((400, "regular"), (500, "medium"), (600, "semibold"), (700, "bold")):
                font_path = fonts / f"cuebook-noi-{label}.otf"
                font_path.write_bytes(f"licensed-font-{weight}".encode())
                font_records.append({
                    "weight": weight,
                    "style": "normal",
                    "ref": font_path.name,
                    "sha256": "sha256:" + hashlib.sha256(font_path.read_bytes()).hexdigest(),
                    "source_name": f"NoiGrotesk-{label}.otf",
                    "source_sha256": "sha256:" + hashlib.sha256(font_path.read_bytes()).hexdigest(),
                })
            font_css = '@font-face{font-family:"Cuebook Noi";src:url("./cuebook-noi-regular.otf") format("opentype");font-weight:400}\n'
            (fonts / "cuebook-noi-fonts.css").write_text(font_css, encoding="utf-8")
            font_manifest = {
                "schema_version": "cuebook-font-assets-v1",
                "font_profile_id": "cuebook-noi-v1",
                "family_alias": "Cuebook Noi",
                "license_mode": "production",
                "license_ref": "LICENSE_TEST_01",
                "release_eligible": True,
                "css_ref": "cuebook-noi-fonts.css",
                "css_sha256": "sha256:" + hashlib.sha256(font_css.encode()).hexdigest(),
                "files": font_records,
            }
            font_manifest_bytes = (json.dumps(font_manifest, ensure_ascii=False, indent=2) + "\n").encode()
            (fonts / "font-assets-v1.json").write_bytes(font_manifest_bytes)
            html = f'<link rel="stylesheet" href="./fonts/cuebook-noi-fonts.css"><main data-cuebook-visual-contract="launch-v1" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json">{wordmark}</main>'
            (root / "direction.html").write_text(html, encoding="utf-8")

            def fake_png(width: int, height: int) -> bytes:
                return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", width, height)

            full = fake_png(2680, 1056)
            compact = fake_png(670, 264)
            (root / "viewpoint-2680.png").write_bytes(full)
            (root / "viewpoint-670.png").write_bytes(compact)
            html_hash = "sha256:" + hashlib.sha256(html.encode("utf-8")).hexdigest()
            full_hash = "sha256:" + hashlib.sha256(full).hexdigest()
            compact_hash = "sha256:" + hashlib.sha256(compact).hexdigest()
            capture = {
                "schema_version": "viewpoint-html-capture-v1",
                "source_sha256": html_hash,
                "derivatives": [
                    {"kind": "full", "ref": "viewpoint-2680.png", "width": 2680, "height": 1056, "sha256": full_hash, "painted_ratio": 0.08},
                    {"kind": "compact_670", "ref": "viewpoint-670.png", "width": 670, "height": 264, "sha256": compact_hash, "painted_ratio": 0.10},
                ],
            }
            (root / "capture.json").write_text(json.dumps(capture), encoding="utf-8")
            direction_set = {
                "direction_set_id": "VDSET_finalizer20260715",
                "state": "selected",
                "input_refs": ["CEXP_finalizer20260715"],
                "message": {
                    "claim": "坏消息落地，价格仍然跌不动",
                    "because": "卖压增加，价格反应却变轻",
                    "implication": "把回调视为观察多头承接的窗口",
                    "direction": "long",
                },
                "bindings": [
                    {"binding_id": "BIND_FACT", "kind": "fact", "value": None, "source_refs": ["source:test:fact"]},
                    {"binding_id": "BIND_VIEW", "kind": "creator_judgment", "value": None, "source_refs": ["source:test:view"]},
                ],
                "logic_progression": {"pattern": "event_transmission"},
                "directions": [{
                    "direction_id": "VDIR_finalizer20260715",
                    "binding_refs": ["BIND_FACT", "BIND_VIEW"],
                    "html_ref": "direction.html",
                    "preview_ref": "viewpoint-2680.png",
                    "compact_preview_ref": "viewpoint-670.png",
                    "capture_report_ref": "capture.json",
                    "route": "claim_first",
                    "layout_system": {"color_system": {"preset_id": "quiet-cobalt"}},
                }],
                "selected_direction_id": "VDIR_finalizer20260715",
            }
            manifest = FINALIZER.build_manifest(
                direction_set,
                root,
                observed_at="2026-07-15T07:00:00Z",
                decision_cutoff_at="2026-07-15T07:00:00Z",
                generated_at="2026-07-15T07:01:00Z",
            )
            validation = VALIDATOR.validate_manifest(manifest, root)
            self.assertTrue(validation["valid"], validation["errors"])
            self.assertEqual(manifest["render_profile"], "wide_2680")
            self.assertEqual(manifest["theme"], "quiet-cobalt")
            self.assertEqual(manifest["asset"]["font_manifest"]["ref"], "fonts/font-assets-v1.json")
            self.assertEqual({item["kind"] for item in manifest["asset"]["png_derivatives"]}, {"full", "compact_670"})

    def test_asset_hash_tampering_is_detected(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(grammar_spec("binary_level"), Path(directory), rasterize=False)
            result["svg_path"].write_text("tampered", encoding="utf-8")
            validation = VALIDATOR.validate_manifest(result["manifest"], Path(directory))
            self.assertIn("ASSET_HASH", {item["code"] for item in validation["errors"]})

    def test_rehashed_noncanonical_wordmark_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(grammar_spec("binary_level"), Path(directory), rasterize=False)
            svg_path = result["svg_path"]
            svg_path.write_text(svg_path.read_text(encoding="utf-8").replace("M6.61403", "M6.7", 1), encoding="utf-8")
            result["manifest"]["asset"]["svg"]["sha256"] = "sha256:" + hashlib.sha256(svg_path.read_bytes()).hexdigest()
            validation = VALIDATOR.validate_manifest(result["manifest"], Path(directory))
            self.assertIn("WORDMARK_PATHS", {item["code"] for item in validation["errors"]})

    @unittest.skipUnless(browser_available(), "Node and Chromium are required for derivative integration.")
    def test_atomic_full_and_360_png_derivative_hashes(self):
        with tempfile.TemporaryDirectory(dir=TEST_TMP) as directory:
            result = RENDERER.render(grammar_spec("parallel_contrast"), Path(directory), rasterize=True)
            derivatives = result["manifest"]["asset"]["png_derivatives"]
            self.assertEqual({item["kind"] for item in derivatives}, {"full", "compact_360"})
            self.assertIsNotNone(result["manifest"]["asset"]["derivative_bundle_hash"])
            self.assertEqual(len({Path(item["ref"]).parent for item in derivatives}), 1)
            validation = VALIDATOR.validate_manifest(result["manifest"], Path(directory))
            self.assertTrue(validation["valid"], validation["errors"])


def tearDownModule() -> None:
    shutil.rmtree(TEST_TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
