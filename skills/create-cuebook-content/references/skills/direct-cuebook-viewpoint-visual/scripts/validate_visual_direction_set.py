#!/usr/bin/env python3
"""Validate Cuebook VisualDirectionSetV1 artifacts and optional HTML previews."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lint_launch_viewpoint_html import audit_html  # noqa: E402


PALETTE_REGISTRY_PATH = Path(__file__).resolve().parents[1] / "references" / "creator-palette-presets-v1.json"
PALETTE_PRESETS = {
    item["preset_id"]: item
    for item in json.loads(PALETTE_REGISTRY_PATH.read_text(encoding="utf-8"))["presets"]
}
EXPRESSION_REGISTRY_PATH = Path(__file__).resolve().parents[1] / "references" / "viewpoint-expression-registry-v1.json"
EXPRESSION_REGISTRY = json.loads(EXPRESSION_REGISTRY_PATH.read_text(encoding="utf-8"))
CANDIDATE_FAMILIES = set(EXPRESSION_REGISTRY["candidate_families"])
CANDIDATE_JOBS = {item["job_id"]: item for item in EXPRESSION_REGISTRY["candidate_jobs"]}
EVIDENCE_SHAPES = set(EXPRESSION_REGISTRY["evidence_shapes"])
EXPRESSION_GRAMMARS = {item["grammar_id"]: item for item in EXPRESSION_REGISTRY["grammars"]}
MARKET_RELATIONSHIPS = {item["relationship_id"]: item for item in EXPRESSION_REGISTRY["market_relationships"]}
ARGUMENT_ARCHETYPES = {item["archetype_id"]: item for item in EXPRESSION_REGISTRY["argument_archetypes"]}
COMPOSITION_ARCHETYPES = {item["composition_id"]: item for item in EXPRESSION_REGISTRY["composition_archetypes"]}
FINANCE_TRANSFORMS = set(EXPRESSION_REGISTRY["finance_transforms"])
BASELINE_POLICIES = set(EXPRESSION_REGISTRY["baseline_policies"])
CHART_DECISIONS = set(EXPRESSION_REGISTRY["chart_decisions"])
RENDERER_ROUTES = {"directed_html", "render-cuebook-thesis-chart"}
AXIS_INTEGRITY_MODES = {"time_scaled", "ordinal_gap_marked", "uniform_true"}

WEIGHTS = {
    "concept": 0.20,
    "three_second": 0.20,
    "hierarchy": 0.15,
    "data_integrity": 0.15,
    "color_logic": 0.10,
    "craft": 0.10,
    "originality": 0.05,
    "anti_default": 0.05,
}
INTERNAL_TERMS = (
    "needs_creator_confirmation",
    "evidence_count",
    "quality_report",
    "settlement_claim_v1",
    "workflow_state",
)
DESIGN_LOGICS = {"product_native", "benchmark_transfer", "content_native"}
HIERARCHY_ROLES = {"claim", "reason", "evidence", "implication", "context", "brand"}
GRIDS = {"single_axis", "editorial_split", "asymmetric_stage", "comparison_field", "timeline_band", "radial_field", "distribution_field", "network_field", "calendar_field", "instrument_field", "freeform"}
ALIGNMENTS = {"left", "centered", "split", "mixed"}
DENSITIES = {"quiet", "balanced", "dense"}
DATA_ROLES = {"hero", "support", "none"}
ENTRY_ROLES = {"claim", "evidence", "condition"}
SEMANTIC_COLOR_ROLES = {"positive", "negative", "observed", "catalyst", "conditional", "comparison", "risk"}
SURFACE_MODES = {"light", "dark", "split"}
PALETTE_STRATEGIES = {"creator_native", "thesis_native", "contrast_variant"}
PALETTE_TOKENS = {"accent-a", "accent-b", "accent-c", "risk"}
REDUNDANT_CUES = {"type", "position", "label", "shape", "stroke", "solid_dashed", "area"}
DESIGN_MODES = {"compose", "redesign_preserve", "redesign_overhaul"}
TONES = {"urgent", "skeptical", "calm", "analytical", "contrarian", "promotional"}
PROFILE_SOURCES = {"voice_spec", "commentator_profile", "creator_visual_corpus", "creator_text", "cuebook_default"}
PROFILE_REGISTERS = {"desk", "explainer", "strategist", "cinematic", "confessional", "meme", "research_memo"}
BINDING_KINDS = {"creator_judgment", "fact", "metric", "series", "level", "event", "quote", "relationship", "instrument"}
BINDING_STATES = {"observed", "reported", "derived", "conditional", "creator_view"}
FACTUAL_BINDING_KINDS = BINDING_KINDS - {"creator_judgment"}
REQUEST_CLASSES = {
    "creator_judgment",
    "qualitative_evidence",
    "news_anchor",
    "official_event",
    "valuation_metric",
    "comparison_metric",
    "market_series",
    "price_level",
    "settlement_reference",
}
UPSTREAM_REQUEST_CLASSES = REQUEST_CLASSES - {"creator_judgment"}
LOGIC_PATTERNS = {"reaction_test", "event_transmission", "expectation_revision", "valuation_reframe", "relative_value", "cycle_rotation", "flow_pressure", "technical_trigger", "scenario_branch", "strategy_ladder", "custom"}
LOGIC_ROLES = {"context", "event", "evidence", "mechanism", "actor_action", "tension", "judgment", "market_effect", "trade_implication", "catalyst", "condition", "invalidation"}
LOGIC_STATES = {"observed", "reported", "derived", "creator_view", "conditional"}
LOGIC_RELATIONS = {"causes", "enables", "pressures", "confirms", "challenges", "conditions", "compares", "leads_to", "invalidates"}
SUPPORT_LOGIC_ROLES = {"context", "event", "evidence", "mechanism", "actor_action", "tension", "catalyst", "condition"}
CONCLUSION_LOGIC_ROLES = {"judgment", "market_effect", "trade_implication", "condition", "invalidation"}
ROUTE_ENTRY_ROLES = {
    "claim_first": {"judgment", "market_effect", "trade_implication"},
    "evidence_first": {"context", "event", "evidence", "tension", "catalyst"},
    "reasoning_first": {"mechanism", "actor_action", "tension"},
    "strategy_first": {"trade_implication", "condition", "invalidation"},
}
PREFLIGHT_KEYS = {
    "copy_audited",
    "compact_readable",
    "anti_default_checked",
    "layout_signature_unique",
    "source_bindings_complete",
    "logic_route_complete",
    "shape_system_consistent",
    "typography_craft_checked",
    "optical_alignment_checked",
    "hierarchy_survives_grayscale",
    "semantic_color_checked",
}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def valid_ref(ref: Any) -> bool:
    if not isinstance(ref, str) or not ref or ref.startswith(("/", "~")):
        return False
    return ".." not in Path(ref).parts


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def sha256_file(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def png_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def read_json_file(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def valid_short_string_list(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) <= 6
        and len(value) == len(set(value))
        and all(isinstance(item, str) and 2 <= len(item.strip()) <= 100 for item in value)
    )


def validate_expression_grammar(
    grammar_id: str,
    evidence_shapes: set[str],
    proof_binding_kinds: list[str],
    recipe_data_refs: set[str],
    path: str,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    grammar = EXPRESSION_GRAMMARS.get(grammar_id)
    if grammar is None:
        return [issue("EXPRESSION_GRAMMAR", path, f"Unknown expression grammar: {grammar_id!r}.")]

    required_shape_sets = [set(items) for items in grammar.get("required_shape_sets", [])]
    if not required_shape_sets or not any(required.issubset(evidence_shapes) for required in required_shape_sets):
        expected = [sorted(items) for items in required_shape_sets]
        errors.append(issue("EXPRESSION_SHAPE_COMPATIBILITY", path, f"{grammar_id} requires one evidence-shape set from {expected}."))

    proof_kind_set = set(proof_binding_kinds)
    required_kind_sets = [set(items) for items in grammar.get("required_binding_kind_sets", [])]
    if required_kind_sets and not any(required.issubset(proof_kind_set) for required in required_kind_sets):
        expected = [sorted(items) for items in required_kind_sets]
        errors.append(issue("EXPRESSION_BINDING_KINDS", path, f"{grammar_id} requires one proof-binding kind set from {expected}."))
    for kind, minimum in grammar.get("minimum_kind_counts", {}).items():
        if proof_binding_kinds.count(kind) < minimum:
            errors.append(issue("EXPRESSION_BINDING_COUNT", path, f"{grammar_id} requires at least {minimum} {kind} proof bindings."))
    minimum_proofs = grammar.get("minimum_proof_bindings", 1)
    if len(proof_binding_kinds) < minimum_proofs:
        errors.append(issue("EXPRESSION_PROOF_COUNT", path, f"{grammar_id} requires at least {minimum_proofs} proof bindings."))
    if grammar.get("requires_data_requirement") is True and not recipe_data_refs:
        errors.append(issue("EXPRESSION_DATA_REQUIRED", path, f"{grammar_id} requires a declared data-requirement ref."))
    return errors


def validate(
    payload: Any,
    asset_root: Path | None = None,
    *,
    require_expression_recipes: bool = False,
    require_finance_route: bool = False,
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    if not isinstance(payload, dict):
        return [issue("ROOT", "$", "Expected an object.")]
    if payload.get("schema_version") != "visual-direction-set-v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected visual-direction-set-v1."))
    if not re.fullmatch(r"VDSET_[A-Za-z0-9_:-]{8,}", str(payload.get("direction_set_id") or "")):
        errors.append(issue("DIRECTION_SET_ID", "$.direction_set_id", "Invalid direction-set ID."))

    state = payload.get("state")
    if state not in {"draft", "previewed", "selected"}:
        errors.append(issue("STATE", "$.state", "State must be draft, previewed, or selected."))

    input_refs_value = payload.get("input_refs")
    if (
        not isinstance(input_refs_value, list)
        or not input_refs_value
        or not all(isinstance(ref, str) and len(ref.strip()) >= 3 for ref in input_refs_value)
        or len(input_refs_value) != len(set(input_refs_value))
    ):
        errors.append(issue("INPUT_REFS", "$.input_refs", "At least one unique upstream input ref is required."))
        input_refs: set[str] = set()
    else:
        input_refs = set(input_refs_value)

    declared_ref_sets: dict[str, set[str]] = {"input_refs": input_refs}
    for key in ("fact_refs", "data_requirement_refs"):
        value = payload.get(key)
        if (
            not isinstance(value, list)
            or not all(isinstance(ref, str) and ref.strip() for ref in value)
            or len(value) != len(set(value))
        ):
            errors.append(issue("UPSTREAM_REFS", f"$.{key}", f"{key} must be a unique array of declared upstream refs."))
            declared_ref_sets[key] = set()
        else:
            declared_ref_sets[key] = set(value)
    ref_owners: dict[str, list[str]] = {}
    for key, refs in declared_ref_sets.items():
        for ref in refs:
            ref_owners.setdefault(ref, []).append(key)

    intent_lock = payload.get("intent_lock")
    intent_relationship: str | None = None
    intent_evidence_shapes: set[str] = set()
    intent_renderer_route: str | None = None
    intent_finance_transform: str | None = None
    intent_baseline_policy: str | None = None
    intent_chart_decision: str | None = None
    if intent_lock is None:
        if require_finance_route:
            errors.append(issue("FINANCE_INTENT_LOCK", "$.intent_lock", "Strict finance generation requires one immutable set-level intent lock."))
    elif not isinstance(intent_lock, dict):
        errors.append(issue("FINANCE_INTENT_LOCK", "$.intent_lock", "Intent lock must be an object."))
    else:
        for key, maximum in (("reader_job", 120), ("reader_question", 160), ("compact_fallback", 180)):
            value = intent_lock.get(key)
            if not isinstance(value, str) or not 3 <= len(value.strip()) <= maximum:
                errors.append(issue("FINANCE_INTENT_TEXT", f"$.intent_lock.{key}", f"{key} must be a concise non-empty string."))
        intent_relationship = str(intent_lock.get("analytic_relationship") or "")
        if intent_relationship not in MARKET_RELATIONSHIPS:
            errors.append(issue("FINANCE_INTENT_RELATIONSHIP", "$.intent_lock.analytic_relationship", "Use a registered analytic relationship."))
            intent_relationship = None
        shapes_value = intent_lock.get("evidence_shape_refs")
        if (
            not isinstance(shapes_value, list)
            or not 1 <= len(shapes_value) <= 8
            or not all(isinstance(item, str) for item in shapes_value)
            or len(shapes_value) != len(set(shapes_value))
            or not set(shapes_value).issubset(EVIDENCE_SHAPES)
        ):
            errors.append(issue("FINANCE_INTENT_SHAPES", "$.intent_lock.evidence_shape_refs", "Use one to eight unique registered evidence shapes."))
        else:
            intent_evidence_shapes = set(shapes_value)
        intent_finance_transform = str(intent_lock.get("finance_transform") or "")
        if intent_finance_transform not in FINANCE_TRANSFORMS:
            errors.append(issue("FINANCE_TRANSFORM", "$.intent_lock.finance_transform", "Use a registered finance transform."))
            intent_finance_transform = None
        intent_baseline_policy = str(intent_lock.get("baseline_policy") or "")
        if intent_baseline_policy not in BASELINE_POLICIES:
            errors.append(issue("BASELINE_POLICY", "$.intent_lock.baseline_policy", "Use a registered baseline policy."))
            intent_baseline_policy = None
        intent_chart_decision = str(intent_lock.get("chart_decision") or "")
        if intent_chart_decision not in CHART_DECISIONS:
            errors.append(issue("CHART_DECISION", "$.intent_lock.chart_decision", "Use a registered chart decision."))
            intent_chart_decision = None
        intent_renderer_route = str(intent_lock.get("renderer_route") or "")
        if intent_renderer_route not in RENDERER_ROUTES:
            errors.append(issue("INTENT_RENDERER", "$.intent_lock.renderer_route", "Use a registered renderer route."))
            intent_renderer_route = None
        basis = intent_lock.get("comparison_basis")
        expected_basis_keys = {"unit", "currency", "period", "benchmark", "normalization"}
        if not isinstance(basis, dict) or set(basis) != expected_basis_keys or not all(value is None or isinstance(value, str) for value in basis.values()):
            errors.append(issue("COMPARISON_BASIS", "$.intent_lock.comparison_basis", "Declare unit, currency, period, benchmark, and normalization as strings or null."))
        if intent_chart_decision == "diagram" and intent_baseline_policy != "none":
            errors.append(issue("INTENT_ENCODING", "$.intent_lock", "A qualitative diagram must use baseline_policy none."))
        if intent_chart_decision == "full_ohlcv" and intent_renderer_route != "render-cuebook-thesis-chart":
            errors.append(issue("INTENT_RENDERER", "$.intent_lock", "Full OHLCV must route to render-cuebook-thesis-chart."))
    ambiguous_refs = sorted(ref for ref, owners in ref_owners.items() if len(owners) > 1)
    if ambiguous_refs:
        errors.append(issue("UPSTREAM_REF_AMBIGUOUS", "$", f"Upstream refs must belong to one namespace: {ambiguous_refs}"))
    fact_refs = declared_ref_sets["fact_refs"]
    data_requirement_refs = declared_ref_sets["data_requirement_refs"]
    declared_source_refs = set().union(*declared_ref_sets.values())

    design_variance: int | None = None
    visual_density: int | None = None
    recent_palette_ids: set[str] = set()
    signature_palette_id: str | None = None
    design_read = payload.get("design_read")
    if not isinstance(design_read, dict):
        errors.append(issue("DESIGN_READ", "$.design_read", "A static Design Read is required before layout."))
    else:
        statement = design_read.get("statement")
        if not isinstance(statement, str) or not 20 <= len(statement.strip()) <= 300:
            errors.append(issue("DESIGN_READ_FIELD", "$.design_read.statement", "Design Read statement must be 20-300 characters."))
        mode = design_read.get("mode")
        if mode not in DESIGN_MODES:
            errors.append(issue("DESIGN_READ_FIELD", "$.design_read.mode", "Unsupported design mode."))
        for key, minimum, maximum in (("audience", 3, 120), ("design_language", 3, 120)):
            value = design_read.get(key)
            if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
                errors.append(issue("DESIGN_READ_FIELD", f"$.design_read.{key}", f"{key} must be {minimum}-{maximum} characters."))
        if design_read.get("tone") not in TONES:
            errors.append(issue("DESIGN_READ_FIELD", "$.design_read.tone", "Unsupported visual tone."))
        if design_read.get("reading_context") != "feed_static_3_second":
            errors.append(issue("DESIGN_READ_FIELD", "$.design_read.reading_context", "Expected feed_static_3_second."))
        variance = design_read.get("design_variance")
        density_dial = design_read.get("visual_density")
        if not isinstance(variance, int) or isinstance(variance, bool) or not 1 <= variance <= 10:
            errors.append(issue("DESIGN_DIAL", "$.design_read.design_variance", "Design variance must be an integer from 1 to 10."))
        else:
            design_variance = variance
        if not isinstance(density_dial, int) or isinstance(density_dial, bool) or not 1 <= density_dial <= 10:
            errors.append(issue("DESIGN_DIAL", "$.design_read.visual_density", "Visual density must be an integer from 1 to 10."))
        else:
            visual_density = density_dial
        visual_profile = design_read.get("creator_visual_profile")
        if not isinstance(visual_profile, dict):
            errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile", "A derived creator visual profile is required."))
        else:
            if visual_profile.get("source") not in PROFILE_SOURCES:
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.source", "Unsupported creator visual profile source."))
            source_ref = visual_profile.get("source_ref")
            if source_ref is not None and (not isinstance(source_ref, str) or not 3 <= len(source_ref.strip()) <= 160):
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.source_ref", "Profile source ref must be null or 3-160 characters."))
            if visual_profile.get("register") not in PROFILE_REGISTERS:
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.register", "Unsupported creator register."))
            for key in ("energy", "conviction", "technicality", "emotionality", "compression"):
                value = visual_profile.get(key)
                if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 5:
                    errors.append(issue("CREATOR_VISUAL_PROFILE", f"$.design_read.creator_visual_profile.{key}", f"{key} must be an integer from 1 to 5."))
            for key, allowed in (
                ("contrast", {"soft", "balanced", "high"}),
                ("chroma", {"restrained", "balanced", "vivid"}),
                ("neutral_temperature", {"cool", "neutral", "warm"}),
                ("surface_bias", {"light", "dark", "mixed"}),
            ):
                if visual_profile.get(key) not in allowed:
                    errors.append(issue("CREATOR_VISUAL_PROFILE", f"$.design_read.creator_visual_profile.{key}", f"Unsupported {key}."))
            signature = visual_profile.get("signature_palette_id")
            if signature is not None and signature not in PALETTE_PRESETS:
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.signature_palette_id", "Signature palette must resolve in the preset registry."))
            else:
                signature_palette_id = signature
            recent = visual_profile.get("recent_palette_ids")
            if not isinstance(recent, list) or len(recent) > 6 or len(recent) != len(set(recent)) or not all(item in PALETTE_PRESETS for item in recent):
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.recent_palette_ids", "Recent palettes must be up to six unique registered preset IDs."))
            else:
                recent_palette_ids = set(recent)
            visual_context_refs = visual_profile.get("visual_context_refs")
            if not isinstance(visual_context_refs, list) or len(visual_context_refs) > 6 or len(visual_context_refs) != len(set(visual_context_refs)) or not all(isinstance(item, str) and 3 <= len(item.strip()) <= 180 for item in visual_context_refs):
                errors.append(issue("CREATOR_VISUAL_PROFILE", "$.design_read.creator_visual_profile.visual_context_refs", "Visual context refs must be up to six unique refs."))
            if visual_profile.get("source") == "creator_visual_corpus" and not visual_context_refs:
                errors.append(issue("CREATOR_VISUAL_CONTEXT", "$.design_read.creator_visual_profile.visual_context_refs", "creator_visual_corpus requires at least one visual context ref."))
        preserve = design_read.get("preserve")
        retire = design_read.get("retire")
        if not valid_short_string_list(preserve):
            errors.append(issue("DESIGN_READ_LIST", "$.design_read.preserve", "Preserve must contain up to six unique short strings."))
            preserve = []
        if not valid_short_string_list(retire):
            errors.append(issue("DESIGN_READ_LIST", "$.design_read.retire", "Retire must contain up to six unique short strings."))
            retire = []
        if mode == "redesign_preserve" and not preserve:
            errors.append(issue("PRESERVE_REQUIRED", "$.design_read.preserve", "Preserve mode must name at least one trait to keep."))
        if mode == "redesign_overhaul" and not retire:
            errors.append(issue("RETIRE_REQUIRED", "$.design_read.retire", "Overhaul mode must name at least one pattern to retire."))

    message = payload.get("message")
    if not isinstance(message, dict):
        errors.append(issue("MESSAGE", "$.message", "Message must be an object."))
    else:
        for key, maximum in (("claim", 80), ("because", 140), ("implication", 120)):
            value = message.get(key)
            if not isinstance(value, str) or len(value.strip()) < 2 or len(value) > maximum:
                errors.append(issue("MESSAGE_FIELD", f"$.message.{key}", f"{key} must be 2-{maximum} characters."))
        if message.get("direction") not in {"long", "short", "relative", "avoid", "watch", "explain", "neutral"}:
            errors.append(issue("MESSAGE_DIRECTION", "$.message.direction", "Unsupported direction."))
        assets = message.get("asset_refs")
        if not isinstance(assets, list) or not assets:
            errors.append(issue("MESSAGE_ASSETS", "$.message.asset_refs", "At least one asset is required."))

    bindings = payload.get("bindings")
    binding_ids: set[str] = set()
    binding_states: dict[str, str] = {}
    binding_kinds: dict[str, str] = {}
    selected_material_binding_ids: set[str] = set()
    if not isinstance(bindings, list) or not bindings:
        errors.append(issue("BINDINGS", "$.bindings", "At least one binding is required."))
        bindings = []
    for index, binding in enumerate(bindings):
        path = f"$.bindings[{index}]"
        if not isinstance(binding, dict):
            errors.append(issue("BINDING", path, "Binding must be an object."))
            continue
        binding_id = binding.get("binding_id")
        if not re.fullmatch(r"BIND_[A-Za-z0-9_:-]{4,}", str(binding_id or "")):
            errors.append(issue("BINDING_ID", f"{path}.binding_id", "Invalid binding ID."))
        elif binding_id in binding_ids:
            errors.append(issue("BINDING_DUPLICATE", f"{path}.binding_id", "Binding IDs must be unique."))
        else:
            binding_ids.add(binding_id)
            binding_states[str(binding_id)] = str(binding.get("state") or "")
        kind = binding.get("kind")
        if kind not in BINDING_KINDS:
            errors.append(issue("BINDING_KIND", f"{path}.kind", "Unsupported binding kind."))
        elif isinstance(binding_id, str) and binding_id in binding_ids:
            binding_kinds[binding_id] = str(kind)
        label = binding.get("label")
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= 160:
            errors.append(issue("BINDING_LABEL", f"{path}.label", "Binding label must be 1-160 characters."))
        state_value = binding.get("state")
        if state_value not in BINDING_STATES:
            errors.append(issue("BINDING_STATE", f"{path}.state", "Unsupported binding state."))
        refs = binding.get("source_refs")
        if (
            not isinstance(refs, list)
            or not refs
            or not all(isinstance(ref, str) and ref.strip() for ref in refs)
            or len(refs) != len(set(refs))
        ):
            errors.append(issue("BINDING_SOURCES", f"{path}.source_refs", "Every binding needs unique non-empty upstream refs."))
            refs = []
        unknown_sources = sorted(set(refs) - declared_source_refs)
        if unknown_sources:
            errors.append(issue("BINDING_SOURCE_LINEAGE", f"{path}.source_refs", f"Binding refs are not declared by input_refs, fact_refs, or data_requirement_refs: {unknown_sources}"))
        if kind in FACTUAL_BINDING_KINDS and refs and not set(refs).intersection(fact_refs | data_requirement_refs):
            errors.append(issue("BINDING_FACT_LINEAGE", f"{path}.source_refs", "Factual and derived bindings need a declared fact or data-requirement ref."))
        request_class = binding.get("request_class")
        if request_class not in REQUEST_CLASSES:
            errors.append(issue("BINDING_REQUEST_CLASS", f"{path}.request_class", "Binding request_class must match the upstream expression-plan vocabulary."))
        elif (kind == "creator_judgment") != (request_class == "creator_judgment"):
            errors.append(issue("BINDING_REQUEST_CLASS", f"{path}.request_class", "Only creator-judgment bindings may use creator_judgment request class."))
        material_to_claim = binding.get("material_to_claim")
        if not isinstance(material_to_claim, bool):
            errors.append(issue("BINDING_MATERIALITY", f"{path}.material_to_claim", "Binding material_to_claim must be boolean."))
        selected_for_display = binding.get("selected_for_display")
        if not isinstance(selected_for_display, bool):
            errors.append(issue("BINDING_SELECTION", f"{path}.selected_for_display", "Binding selected_for_display must be boolean."))
        if selected_for_display is True and request_class in UPSTREAM_REQUEST_CLASSES and not set(refs).intersection(data_requirement_refs):
            errors.append(issue("BINDING_REQUIREMENT_LINEAGE", f"{path}.source_refs", "A selected upstream request must resolve to a declared data requirement ref."))
        if isinstance(binding_id, str) and binding_id in binding_ids and material_to_claim is True and selected_for_display is True:
            selected_material_binding_ids.add(str(binding_id))

    selected_material_event_binding_ids = {
        binding_id for binding_id in selected_material_binding_ids if binding_kinds.get(binding_id) == "event"
    }

    logic_steps: dict[str, dict[str, Any]] = {}
    logic_spine: list[str] = []
    logic_link_pairs: set[tuple[str, str]] = set()
    logic_progression = payload.get("logic_progression")
    if not isinstance(logic_progression, dict):
        errors.append(issue("LOGIC_PROGRESSION", "$.logic_progression", "A source-linked logic progression is required before layout."))
    else:
        if logic_progression.get("pattern") not in LOGIC_PATTERNS:
            errors.append(issue("LOGIC_PATTERN", "$.logic_progression.pattern", "Unsupported logic progression pattern."))
        steps = logic_progression.get("steps")
        if not isinstance(steps, list) or not 3 <= len(steps) <= 6:
            errors.append(issue("LOGIC_STEPS", "$.logic_progression.steps", "Use three to six logic steps."))
            steps = []
        for index, step in enumerate(steps):
            path = f"$.logic_progression.steps[{index}]"
            if not isinstance(step, dict):
                errors.append(issue("LOGIC_STEP", path, "Logic step must be an object."))
                continue
            step_id = step.get("step_id")
            if not re.fullmatch(r"LSTEP_[A-Za-z0-9_:-]{3,}", str(step_id or "")):
                errors.append(issue("LOGIC_STEP_ID", f"{path}.step_id", "Invalid logic step ID."))
                continue
            if step_id in logic_steps:
                errors.append(issue("LOGIC_STEP_DUPLICATE", f"{path}.step_id", "Logic step IDs must be unique."))
                continue
            logic_steps[str(step_id)] = step
            if step.get("role") not in LOGIC_ROLES:
                errors.append(issue("LOGIC_STEP_ROLE", f"{path}.role", "Unsupported logic step role."))
            step_state = step.get("state")
            if step_state not in LOGIC_STATES:
                errors.append(issue("LOGIC_STEP_STATE", f"{path}.state", "Unsupported logic step state."))
            text_value = step.get("text")
            if not isinstance(text_value, str) or not 2 <= len(text_value.strip()) <= 120:
                errors.append(issue("LOGIC_STEP_TEXT", f"{path}.text", "Logic step text must be 2-120 characters."))
            step_refs = step.get("binding_refs")
            if not isinstance(step_refs, list) or not 1 <= len(step_refs) <= 4 or len(step_refs) != len(set(step_refs)):
                errors.append(issue("LOGIC_STEP_BINDINGS", f"{path}.binding_refs", "Use one to four unique binding refs."))
                step_refs = []
            unknown_refs = set(step_refs) - binding_ids
            if unknown_refs:
                errors.append(issue("LOGIC_STEP_BINDINGS", f"{path}.binding_refs", f"Unknown binding refs: {sorted(unknown_refs)}"))
            expected_states = {
                "observed": {"observed"},
                "reported": {"reported", "observed"},
                "derived": {"derived"},
                "creator_view": {"creator_view"},
                "conditional": {"conditional", "creator_view"},
            }.get(str(step_state), set())
            if step_refs and expected_states and not any(binding_states.get(str(ref)) in expected_states for ref in step_refs):
                errors.append(issue("LOGIC_STEP_STATE_BINDING", f"{path}.state", "Step state must be supported by at least one compatible binding state."))

        roles = {str(step.get("role")) for step in logic_steps.values()}
        if logic_steps and not roles.intersection(SUPPORT_LOGIC_ROLES):
            errors.append(issue("LOGIC_SUPPORT", "$.logic_progression.steps", "Logic progression needs a supporting event, evidence, mechanism, tension, catalyst, or condition."))
        if logic_steps and not roles.intersection(CONCLUSION_LOGIC_ROLES):
            errors.append(issue("LOGIC_CONCLUSION", "$.logic_progression.steps", "Logic progression needs a judgment, market effect, trade implication, condition, or invalidation."))

        links = logic_progression.get("links")
        adjacency: dict[str, set[str]] = {step_id: set() for step_id in logic_steps}
        undirected: dict[str, set[str]] = {step_id: set() for step_id in logic_steps}
        if not isinstance(links, list) or not 2 <= len(links) <= 8:
            errors.append(issue("LOGIC_LINKS", "$.logic_progression.links", "Use two to eight directed logic links."))
            links = []
        for index, link in enumerate(links):
            path = f"$.logic_progression.links[{index}]"
            if not isinstance(link, dict):
                errors.append(issue("LOGIC_LINK", path, "Logic link must be an object."))
                continue
            source = str(link.get("from_step_id") or "")
            target = str(link.get("to_step_id") or "")
            pair = (source, target)
            if source not in logic_steps or target not in logic_steps:
                errors.append(issue("LOGIC_LINK_REF", path, "Logic links must reference declared steps."))
                continue
            if source == target:
                errors.append(issue("LOGIC_LINK_SELF", path, "Logic links cannot point to the same step."))
                continue
            if pair in logic_link_pairs:
                errors.append(issue("LOGIC_LINK_DUPLICATE", path, "Logic links must be unique."))
                continue
            logic_link_pairs.add(pair)
            adjacency[source].add(target)
            undirected[source].add(target)
            undirected[target].add(source)
            if link.get("relation") not in LOGIC_RELATIONS:
                errors.append(issue("LOGIC_RELATION", f"{path}.relation", "Unsupported logic relation."))

        visiting: set[str] = set()
        visited: set[str] = set()

        def has_cycle(node: str) -> bool:
            if node in visiting:
                return True
            if node in visited:
                return False
            visiting.add(node)
            if any(has_cycle(next_node) for next_node in adjacency.get(node, set())):
                return True
            visiting.remove(node)
            visited.add(node)
            return False

        if any(has_cycle(step_id) for step_id in logic_steps if step_id not in visited):
            errors.append(issue("LOGIC_CYCLE", "$.logic_progression.links", "Compact public logic must be acyclic."))
        if logic_steps:
            connected: set[str] = set()
            pending = [next(iter(logic_steps))]
            while pending:
                current = pending.pop()
                if current in connected:
                    continue
                connected.add(current)
                pending.extend(undirected.get(current, set()) - connected)
            if connected != set(logic_steps):
                errors.append(issue("LOGIC_DISCONNECTED", "$.logic_progression.links", "All logic steps must belong to one connected argument."))

        spine = logic_progression.get("public_spine_step_ids")
        if not isinstance(spine, list) or not 3 <= len(spine) <= 5 or len(spine) != len(set(spine)):
            errors.append(issue("LOGIC_SPINE", "$.logic_progression.public_spine_step_ids", "Use three to five unique public spine steps."))
        else:
            logic_spine = [str(item) for item in spine]
            if not set(logic_spine).issubset(logic_steps):
                errors.append(issue("LOGIC_SPINE_REF", "$.logic_progression.public_spine_step_ids", "Public spine references undeclared steps."))
            for source, target in zip(logic_spine, logic_spine[1:]):
                if (source, target) not in logic_link_pairs:
                    errors.append(issue("LOGIC_SPINE_LINK", "$.logic_progression.public_spine_step_ids", f"Missing direct link {source} -> {target}."))
            spine_roles = {str(logic_steps.get(step_id, {}).get("role")) for step_id in logic_spine}
            if not spine_roles.intersection(SUPPORT_LOGIC_ROLES) or not spine_roles.intersection(CONCLUSION_LOGIC_ROLES):
                errors.append(issue("LOGIC_SPINE_ROLES", "$.logic_progression.public_spine_step_ids", "Public spine must contain support and conclusion roles."))

        message_map = logic_progression.get("message_step_map")
        if not isinstance(message_map, dict) or set(message_map) != {"claim_step_id", "because_step_id", "implication_step_id"}:
            errors.append(issue("LOGIC_MESSAGE_MAP", "$.logic_progression.message_step_map", "Map claim, because, and implication to logic steps."))
        else:
            mapped = [str(message_map[key]) for key in ("claim_step_id", "because_step_id", "implication_step_id")]
            if len(set(mapped)) != 3 or not set(mapped).issubset(logic_spine):
                errors.append(issue("LOGIC_MESSAGE_MAP", "$.logic_progression.message_step_map", "Message mappings must be three distinct public spine steps."))
            expected_roles = (
                {"judgment", "market_effect", "trade_implication"},
                SUPPORT_LOGIC_ROLES,
                CONCLUSION_LOGIC_ROLES,
            )
            for key, step_id, allowed in zip(("claim_step_id", "because_step_id", "implication_step_id"), mapped, expected_roles):
                if step_id in logic_steps and logic_steps[step_id].get("role") not in allowed:
                    errors.append(issue("LOGIC_MESSAGE_ROLE", f"$.logic_progression.message_step_map.{key}", "Mapped logic step has an incompatible role."))

    directions = payload.get("directions")
    if not isinstance(directions, list) or len(directions) != 3:
        errors.append(issue("DIRECTION_COUNT", "$.directions", "Exactly three directions are required."))
        directions = []
    direction_ids: set[str] = set()
    html_refs: set[str] = set()
    preview_refs: set[str] = set()
    compact_preview_refs: set[str] = set()
    capture_report_refs: set[str] = set()
    render_audit_refs: set[str] = set()
    rendered_layout_fingerprints: set[str] = set()
    skeletons: set[str] = set()
    routes: set[str] = set()
    design_logics: set[str] = set()
    layout_signatures: set[str] = set()
    layout_grids: set[str] = set()
    layout_alignments: set[str] = set()
    layout_densities: set[str] = set()
    palette_families: set[str] = set()
    palette_strategies: set[str] = set()
    preset_ids: set[str] = set()
    palette_choices: list[tuple[str, str]] = []
    candidate_jobs: set[str] = set()
    candidate_families: set[str] = set()
    primary_grammars: set[str] = set()
    evidence_shape_signatures: set[tuple[str, ...]] = set()
    expression_recipe_count = 0
    finance_route_count = 0
    composition_archetypes: set[str] = set()
    scores: dict[str, float] = {}

    for index, direction in enumerate(directions):
        path = f"$.directions[{index}]"
        if not isinstance(direction, dict):
            errors.append(issue("DIRECTION", path, "Direction must be an object."))
            continue
        direction_id = direction.get("direction_id")
        if not re.fullmatch(r"VDIR_[A-Za-z0-9_:-]{6,}", str(direction_id or "")):
            errors.append(issue("DIRECTION_ID", f"{path}.direction_id", "Invalid direction ID."))
        elif direction_id in direction_ids:
            errors.append(issue("DIRECTION_DUPLICATE", f"{path}.direction_id", "Direction IDs must be unique."))
        else:
            direction_ids.add(direction_id)
        design_logic = direction.get("design_logic")
        if design_logic not in DESIGN_LOGICS:
            errors.append(issue("DESIGN_LOGIC", f"{path}.design_logic", "Use product_native, benchmark_transfer, or content_native."))
        else:
            design_logics.add(str(design_logic))
        anchor = direction.get("design_anchor")
        expected_anchor_kind = {
            "product_native": "cuebook_product",
            "benchmark_transfer": "verified_benchmark",
            "content_native": "content_motif",
        }.get(str(design_logic))
        if not isinstance(anchor, dict):
            errors.append(issue("DESIGN_ANCHOR", f"{path}.design_anchor", "A structured design anchor is required."))
        else:
            if anchor.get("source_kind") != expected_anchor_kind:
                errors.append(issue("DESIGN_ANCHOR_KIND", f"{path}.design_anchor.source_kind", f"{design_logic} requires {expected_anchor_kind}."))
            source_ref = anchor.get("source_ref")
            if not isinstance(source_ref, str) or not 3 <= len(source_ref.strip()) <= 300:
                errors.append(issue("DESIGN_ANCHOR_REF", f"{path}.design_anchor.source_ref", "Design anchor needs a concrete source ref."))
            if design_logic == "benchmark_transfer":
                if not isinstance(source_ref, str) or not re.match(r"https://", source_ref):
                    errors.append(issue("BENCHMARK_REF", f"{path}.design_anchor.source_ref", "Benchmark transfer requires a verified HTTPS source."))
                verified_at = anchor.get("verified_at")
                if not isinstance(verified_at, str) or not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$", verified_at):
                    errors.append(issue("BENCHMARK_VERIFIED_AT", f"{path}.design_anchor.verified_at", "Benchmark transfer requires an ISO-8601 verification time."))
            elif anchor.get("verified_at") is not None:
                errors.append(issue("DESIGN_ANCHOR_VERIFIED_AT", f"{path}.design_anchor.verified_at", "Only benchmark transfer records verified_at."))
            principle = anchor.get("transferred_principle")
            if not isinstance(principle, str) or not 8 <= len(principle.strip()) <= 240:
                errors.append(issue("DESIGN_ANCHOR_PRINCIPLE", f"{path}.design_anchor.transferred_principle", "Name the structural principle carried into the direction."))
            excluded = anchor.get("excluded_surface_traits")
            if not isinstance(excluded, list) or not 1 <= len(excluded) <= 6 or len(excluded) != len(set(excluded)) or not all(isinstance(item, str) and 2 <= len(item.strip()) <= 100 for item in excluded):
                errors.append(issue("DESIGN_ANCHOR_EXCLUSIONS", f"{path}.design_anchor.excluded_surface_traits", "Name one to six surface traits that are intentionally not copied."))

        grid: Any = None
        alignment: Any = None
        density: Any = None
        entry_role: Any = None
        palette_family: Any = None
        palette_strategy: Any = None
        preset_id: Any = None
        layout = direction.get("layout_system")
        if not isinstance(layout, dict):
            errors.append(issue("LAYOUT_SYSTEM", f"{path}.layout_system", "A complete layout system is required."))
        else:
            hierarchy = layout.get("hierarchy")
            if (
                not isinstance(hierarchy, list)
                or not 2 <= len(hierarchy) <= 5
                or len(hierarchy) != len(set(hierarchy))
                or not set(hierarchy).issubset(HIERARCHY_ROLES)
                or "claim" not in hierarchy
                or not set(hierarchy).intersection({"reason", "evidence", "implication"})
            ):
                errors.append(issue("LAYOUT_HIERARCHY", f"{path}.layout_system.hierarchy", "Hierarchy needs claim plus at least one reason, evidence, or implication."))
                hierarchy = []
            grid = layout.get("grid")
            alignment = layout.get("alignment")
            density = layout.get("density")
            entry_role = layout.get("entry_role")
            data_role = layout.get("data_role")
            if entry_role not in ENTRY_ROLES:
                errors.append(issue("LAYOUT_ENTRY_ROLE", f"{path}.layout_system.entry_role", "Entry role must be claim, evidence, or condition."))
            for key, value, allowed in (
                ("grid", grid, GRIDS),
                ("alignment", alignment, ALIGNMENTS),
                ("density", density, DENSITIES),
                ("data_role", data_role, DATA_ROLES),
            ):
                if value not in allowed:
                    errors.append(issue("LAYOUT_FIELD", f"{path}.layout_system.{key}", f"Unsupported layout {key}."))
            if grid in GRIDS:
                layout_grids.add(str(grid))
            if alignment in ALIGNMENTS:
                layout_alignments.add(str(alignment))
            if density in DENSITIES:
                layout_densities.add(str(density))
            type_scale = layout.get("type_scale")
            if not isinstance(type_scale, dict):
                errors.append(issue("TYPE_SCALE", f"{path}.layout_system.type_scale", "A numeric type scale is required."))
            else:
                hero = type_scale.get("hero_px_canvas")
                body = type_scale.get("body_px_canvas")
                meta = type_scale.get("meta_px_canvas")
                ratio = type_scale.get("hero_body_ratio")
                if not finite_number(hero) or not 64 <= float(hero) <= 120:
                    errors.append(issue("TYPE_SCALE_VALUE", f"{path}.layout_system.type_scale.hero_px_canvas", "Hero type must be 64-120px on the 1340px authoring canvas."))
                if not finite_number(body) or not 28 <= float(body) <= 52:
                    errors.append(issue("TYPE_SCALE_VALUE", f"{path}.layout_system.type_scale.body_px_canvas", "Body type must be 28-52px on the 1340px authoring canvas."))
                if not finite_number(meta) or not 18 <= float(meta) <= 30:
                    errors.append(issue("TYPE_SCALE_VALUE", f"{path}.layout_system.type_scale.meta_px_canvas", "Meta type must be 18-30px on the 1340px authoring canvas."))
                if not finite_number(ratio) or not 1.5 <= float(ratio) <= 5:
                    errors.append(issue("TYPE_SCALE_VALUE", f"{path}.layout_system.type_scale.hero_body_ratio", "Hero/body ratio must be 1.5-5."))
                elif finite_number(hero) and finite_number(body) and abs(float(ratio) - float(hero) / float(body)) > 0.08:
                    errors.append(issue("TYPE_SCALE_RATIO", f"{path}.layout_system.type_scale.hero_body_ratio", "Reported ratio must match hero_px_canvas / body_px_canvas."))
            craft = layout.get("craft_system")
            if not isinstance(craft, dict):
                errors.append(issue("CRAFT_SYSTEM", f"{path}.layout_system.craft_system", "A typography, surface, compact, and optical craft system is required."))
            else:
                if craft.get("type_family_mode") not in {"system", "brand", "creator"}:
                    errors.append(issue("CRAFT_TYPE_FAMILY", f"{path}.layout_system.craft_system.type_family_mode", "Unsupported type family mode."))
                claim_weight = craft.get("claim_weight")
                if not isinstance(claim_weight, int) or isinstance(claim_weight, bool) or not 500 <= claim_weight <= 900:
                    errors.append(issue("CRAFT_CLAIM_WEIGHT", f"{path}.layout_system.craft_system.claim_weight", "Claim weight must be 500-900."))
                claim_line_height = craft.get("claim_line_height")
                if not finite_number(claim_line_height) or not 1 <= float(claim_line_height) <= 1.25:
                    errors.append(issue("CRAFT_LINE_HEIGHT", f"{path}.layout_system.craft_system.claim_line_height", "Claim line height must be 1-1.25."))
                if craft.get("claim_wrap") != "balance" or craft.get("number_style") != "tabular-nums":
                    errors.append(issue("CRAFT_TYPOGRAPHY", f"{path}.layout_system.craft_system", "Claims use balance and numbers use tabular-nums."))
                for key in ("max_type_sizes", "max_weights"):
                    value = craft.get(key)
                    if not isinstance(value, int) or isinstance(value, bool) or not 2 <= value <= 4:
                        errors.append(issue("CRAFT_TYPE_LIMIT", f"{path}.layout_system.craft_system.{key}", "Use two to four declared values."))
                if craft.get("radius_rule") not in {"sharp", "soft", "concentric", "mixed_documented"}:
                    errors.append(issue("CRAFT_RADIUS", f"{path}.layout_system.craft_system.radius_rule", "Unsupported radius rule."))
                if craft.get("surface_separation") not in {"whitespace", "divider", "shadow", "mixed"}:
                    errors.append(issue("CRAFT_SURFACE", f"{path}.layout_system.craft_system.surface_separation", "Unsupported surface separation rule."))
                optical = craft.get("optical_priority")
                if not isinstance(optical, str) or not 8 <= len(optical.strip()) <= 180:
                    errors.append(issue("CRAFT_OPTICAL", f"{path}.layout_system.craft_system.optical_priority", "Name the detail receiving optical priority."))
                if craft.get("compact_mode") not in {"reflow", "recompose"}:
                    errors.append(issue("CRAFT_COMPACT_MODE", f"{path}.layout_system.craft_system.compact_mode", "Compact output must reflow or recompose; scale-only is not supported."))
                compact_type = craft.get("compact_type_scale")
                if not isinstance(compact_type, dict):
                    errors.append(issue("CRAFT_COMPACT_TYPE", f"{path}.layout_system.craft_system.compact_type_scale", "Compact type scale is required."))
                else:
                    for key, minimum, maximum in (("hero_px_670", 32, 60), ("body_px_670", 14, 26), ("meta_px_670", 11, 18)):
                        value = compact_type.get(key)
                        if not finite_number(value) or not minimum <= float(value) <= maximum:
                            errors.append(issue("CRAFT_COMPACT_TYPE", f"{path}.layout_system.craft_system.compact_type_scale.{key}", f"{key} must be {minimum}-{maximum}px."))
            color_system = layout.get("color_system")
            if not isinstance(color_system, dict):
                errors.append(issue("COLOR_SYSTEM", f"{path}.layout_system.color_system", "A semantic color system is required."))
            else:
                palette_family = color_system.get("palette_family")
                if not isinstance(palette_family, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+){1,5}", palette_family) or len(palette_family) > 64:
                    errors.append(issue("PALETTE_FAMILY", f"{path}.layout_system.color_system.palette_family", "Palette family must be a short lowercase hyphenated slug."))
                else:
                    palette_families.add(palette_family)
                palette_strategy = color_system.get("palette_strategy")
                if palette_strategy not in PALETTE_STRATEGIES:
                    errors.append(issue("PALETTE_STRATEGY", f"{path}.layout_system.color_system.palette_strategy", "Use creator_native, thesis_native, or contrast_variant."))
                else:
                    palette_strategies.add(palette_strategy)
                preset_id = color_system.get("preset_id")
                if preset_id not in PALETTE_PRESETS:
                    errors.append(issue("PALETTE_PRESET", f"{path}.layout_system.color_system.preset_id", "Palette preset must resolve in creator-palette-presets-v1.json."))
                else:
                    preset_ids.add(preset_id)
                    if palette_family != preset_id:
                        errors.append(issue("PALETTE_FAMILY_PRESET", f"{path}.layout_system.color_system.palette_family", "Palette family must equal the registered preset ID."))
                    if palette_strategy in PALETTE_STRATEGIES:
                        palette_choices.append((palette_strategy, preset_id))
                selection_reason = color_system.get("selection_reason")
                if not isinstance(selection_reason, str) or not 8 <= len(selection_reason.strip()) <= 180:
                    errors.append(issue("PALETTE_REASON", f"{path}.layout_system.color_system.selection_reason", "Palette selection reason must be 8-180 characters."))
                surface = color_system.get("surface")
                if surface not in SURFACE_MODES:
                    errors.append(issue("COLOR_SURFACE", f"{path}.layout_system.color_system.surface", "Surface must be light, dark, or split."))
                elif preset_id in PALETTE_PRESETS and surface != PALETTE_PRESETS[preset_id]["surface"]:
                    errors.append(issue("PALETTE_SURFACE", f"{path}.layout_system.color_system.surface", "Surface must match the registered palette preset."))
                semantic_roles = color_system.get("semantic_roles")
                if (
                    not isinstance(semantic_roles, list)
                    or not 1 <= len(semantic_roles) <= 3
                    or len(semantic_roles) != len(set(semantic_roles))
                    or not set(semantic_roles).issubset(SEMANTIC_COLOR_ROLES)
                ):
                    errors.append(issue("COLOR_ROLES", f"{path}.layout_system.color_system.semantic_roles", "Use one to three unique supported semantic color roles."))
                    semantic_roles = []
                dominant_role = color_system.get("dominant_role")
                if dominant_role not in semantic_roles:
                    errors.append(issue("COLOR_DOMINANT", f"{path}.layout_system.color_system.dominant_role", "Dominant color role must be one of the declared semantic roles."))
                role_color_map = color_system.get("role_color_map")
                if (
                    not isinstance(role_color_map, dict)
                    or set(role_color_map) != set(semantic_roles)
                    or not all(token in PALETTE_TOKENS for token in role_color_map.values())
                ):
                    errors.append(issue("COLOR_ROLE_MAP", f"{path}.layout_system.color_system.role_color_map", "Map every declared semantic role to accent-a, accent-b, accent-c, or risk."))
                redundant_cues = color_system.get("redundant_cues")
                if (
                    not isinstance(redundant_cues, list)
                    or not 1 <= len(redundant_cues) <= 4
                    or len(redundant_cues) != len(set(redundant_cues))
                    or not set(redundant_cues).issubset(REDUNDANT_CUES)
                ):
                    errors.append(issue("COLOR_REDUNDANCY", f"{path}.layout_system.color_system.redundant_cues", "Color needs one to four supported redundant cues."))
            responsive_rule = layout.get("responsive_rule")
            if not isinstance(responsive_rule, str) or not 8 <= len(responsive_rule.strip()) <= 240:
                errors.append(issue("RESPONSIVE_RULE", f"{path}.layout_system.responsive_rule", "Explain how hierarchy survives at 670 x 264."))
            signature = json.dumps(
                {"hierarchy": hierarchy, "grid": grid, "alignment": alignment, "density": density},
                ensure_ascii=True,
                sort_keys=True,
            )
            if signature in layout_signatures:
                errors.append(issue("LAYOUT_DUPLICATE", f"{path}.layout_system", "Directions must use different hierarchy, grid, alignment, or density."))
            layout_signatures.add(signature)
        route = direction.get("route")
        if route not in {"claim_first", "evidence_first", "reasoning_first", "strategy_first", "freeform"}:
            errors.append(issue("ROUTE", f"{path}.route", "Unsupported visual route."))
        else:
            routes.add(str(route))
        route_required_bindings: set[str] = set()
        compact_required_bindings: set[str] = set()
        visible_steps: list[str] = []
        compact_steps: list[str] = []
        logic_route = direction.get("logic_route")
        if not isinstance(logic_route, dict):
            errors.append(issue("LOGIC_ROUTE", f"{path}.logic_route", "Every direction must project the shared logic progression."))
        else:
            entry_step_id = str(logic_route.get("entry_step_id") or "")
            visible_steps_value = logic_route.get("visible_step_ids")
            compact_steps_value = logic_route.get("compact_step_ids")
            for key, value, maximum in (("visible_step_ids", visible_steps_value, 6), ("compact_step_ids", compact_steps_value, 5)):
                if not isinstance(value, list) or not 3 <= len(value) <= maximum or len(value) != len(set(value)):
                    errors.append(issue("LOGIC_ROUTE_STEPS", f"{path}.logic_route.{key}", f"{key} must contain three to {maximum} unique steps."))
            if isinstance(visible_steps_value, list):
                visible_steps = [str(item) for item in visible_steps_value]
                if entry_step_id not in logic_steps or not visible_steps or entry_step_id != visible_steps[0]:
                    errors.append(issue("LOGIC_ROUTE_ENTRY", f"{path}.logic_route.entry_step_id", "Entry step must be the first declared visible step."))
                if not set(visible_steps).issubset(logic_steps):
                    errors.append(issue("LOGIC_ROUTE_REF", f"{path}.logic_route.visible_step_ids", "Visible route references undeclared logic steps."))
                if logic_spine:
                    interior = set(logic_spine[1:-1])
                    if logic_spine[0] not in visible_steps or logic_spine[-1] not in visible_steps or not set(visible_steps).intersection(interior):
                        errors.append(issue("LOGIC_ROUTE_BRIDGE", f"{path}.logic_route.visible_step_ids", "Visible route must keep the spine start, an interior bridge, and the conclusion."))
                for step_id in visible_steps:
                    route_required_bindings.update(str(ref) for ref in logic_steps.get(step_id, {}).get("binding_refs", []))
            if isinstance(compact_steps_value, list):
                compact_steps = [str(item) for item in compact_steps_value]
                if not set(compact_steps).issubset(logic_steps):
                    errors.append(issue("LOGIC_ROUTE_REF", f"{path}.logic_route.compact_step_ids", "Compact route references undeclared logic steps."))
                if visible_steps and not set(compact_steps).issubset(set(visible_steps)):
                    errors.append(issue("LOGIC_ROUTE_COMPACT", f"{path}.logic_route.compact_step_ids", "Compact route must be a subset of the full visible route."))
                if logic_spine:
                    interior = set(logic_spine[1:-1])
                    if logic_spine[0] not in compact_steps or logic_spine[-1] not in compact_steps or not set(compact_steps).intersection(interior):
                        errors.append(issue("LOGIC_ROUTE_BRIDGE", f"{path}.logic_route.compact_step_ids", "Compact route must keep support, an interior bridge, and the conclusion."))
                for step_id in compact_steps:
                    compact_required_bindings.update(str(ref) for ref in logic_steps.get(step_id, {}).get("binding_refs", []))
            entry_role_name = str(logic_steps.get(entry_step_id, {}).get("role") or "")
            if route in ROUTE_ENTRY_ROLES and entry_role_name not in ROUTE_ENTRY_ROLES[str(route)]:
                errors.append(issue("LOGIC_ROUTE_COMPATIBILITY", f"{path}.logic_route.entry_step_id", f"{route} cannot enter from role {entry_role_name!r}."))

        proof_refs: set[str] = set()
        market_relationship: str | None = None
        argument_archetype: str | None = None
        composition_archetype: str | None = None
        expression_recipe = direction.get("expression_recipe")
        if expression_recipe is None:
            if require_expression_recipes:
                errors.append(issue("EXPRESSION_RECIPE", f"{path}.expression_recipe", "Strict generation requires a task- and evidence-bound expression recipe."))
        elif not isinstance(expression_recipe, dict):
            errors.append(issue("EXPRESSION_RECIPE", f"{path}.expression_recipe", "Every direction needs a task- and evidence-bound expression recipe."))
        else:
            expression_recipe_count += 1
            candidate_job = expression_recipe.get("candidate_job")
            job_profile = CANDIDATE_JOBS.get(str(candidate_job))
            if job_profile is None:
                errors.append(issue("EXPRESSION_JOB", f"{path}.expression_recipe.candidate_job", "Unsupported candidate communication job."))
            else:
                candidate_jobs.add(str(candidate_job))
                candidate_families.add(str(job_profile["family"]))

            evidence_shapes_value = expression_recipe.get("evidence_shapes")
            if (
                not isinstance(evidence_shapes_value, list)
                or not 1 <= len(evidence_shapes_value) <= 4
                or not all(isinstance(item, str) for item in evidence_shapes_value)
                or len(evidence_shapes_value) != len(set(evidence_shapes_value))
                or not set(evidence_shapes_value).issubset(EVIDENCE_SHAPES)
            ):
                errors.append(issue("EXPRESSION_SHAPES", f"{path}.expression_recipe.evidence_shapes", "Use one to four unique registered evidence shapes."))
                evidence_shapes: set[str] = set()
            else:
                evidence_shapes = set(str(item) for item in evidence_shapes_value)
                evidence_shape_signatures.add(tuple(sorted(evidence_shapes)))
                if intent_evidence_shapes and not evidence_shapes.issubset(intent_evidence_shapes):
                    errors.append(issue("FINANCE_INTENT_DRIFT", f"{path}.expression_recipe.evidence_shapes", "Direction widens the evidence shapes beyond the set-level intent lock."))

            primary_grammar = str(expression_recipe.get("primary_grammar") or "")
            support_grammars_value = expression_recipe.get("support_grammars")
            if primary_grammar not in EXPRESSION_GRAMMARS:
                errors.append(issue("EXPRESSION_GRAMMAR", f"{path}.expression_recipe.primary_grammar", "Use a registered primary expression grammar."))
            else:
                primary_grammars.add(primary_grammar)
                if job_profile is not None and primary_grammar not in set(job_profile["primary_grammars"]):
                    errors.append(issue("EXPRESSION_JOB_GRAMMAR", f"{path}.expression_recipe.primary_grammar", f"{candidate_job} cannot use {primary_grammar} as its primary grammar."))
            if (
                not isinstance(support_grammars_value, list)
                or len(support_grammars_value) > 2
                or not all(isinstance(item, str) for item in support_grammars_value)
                or len(support_grammars_value) != len(set(support_grammars_value))
                or not set(support_grammars_value).issubset(EXPRESSION_GRAMMARS)
                or primary_grammar in support_grammars_value
            ):
                errors.append(issue("EXPRESSION_SUPPORT_GRAMMARS", f"{path}.expression_recipe.support_grammars", "Use up to two unique registered support grammars distinct from the primary grammar."))
                support_grammars: list[str] = []
            else:
                support_grammars = [str(item) for item in support_grammars_value]
            if primary_grammar in EXPRESSION_GRAMMARS and intent_renderer_route is not None:
                grammar_renderer = str(EXPRESSION_GRAMMARS[primary_grammar].get("renderer_route") or "")
                if grammar_renderer != intent_renderer_route:
                    errors.append(issue("FINANCE_INTENT_RENDERER", f"{path}.expression_recipe.primary_grammar", f"Grammar routes to {grammar_renderer}, not locked renderer {intent_renderer_route}."))

            axis_integrity = expression_recipe.get("axis_integrity")
            ordered_axis_grammars = sorted(
                grammar_id
                for grammar_id in {primary_grammar, *support_grammars}
                if EXPRESSION_GRAMMARS.get(grammar_id, {}).get("ordered_axis")
            )
            if axis_integrity is not None and axis_integrity not in AXIS_INTEGRITY_MODES:
                errors.append(issue("AXIS_INTEGRITY", f"{path}.expression_recipe.axis_integrity", f"Use one of {sorted(AXIS_INTEGRITY_MODES)}."))
            elif ordered_axis_grammars and axis_integrity is None:
                errors.append(issue("AXIS_INTEGRITY", f"{path}.expression_recipe.axis_integrity", f"Grammars {ordered_axis_grammars} order instruments on a dated axis; declare how unequal gaps stay honest (time_scaled, ordinal_gap_marked, or uniform_true)."))

            route_values = {
                "market_relationship": expression_recipe.get("market_relationship"),
                "argument_archetype": expression_recipe.get("argument_archetype"),
                "composition_archetype": expression_recipe.get("composition_archetype"),
            }
            route_present = [isinstance(value, str) and bool(value.strip()) for value in route_values.values()]
            if not all(route_present):
                if require_finance_route or any(route_present):
                    errors.append(issue("FINANCE_ROUTE", f"{path}.expression_recipe", "Finance generation requires market_relationship, argument_archetype, and composition_archetype together."))
            else:
                market_relationship = str(route_values["market_relationship"])
                argument_archetype = str(route_values["argument_archetype"])
                composition_archetype = str(route_values["composition_archetype"])
                relationship_profile = MARKET_RELATIONSHIPS.get(market_relationship)
                archetype_profile = ARGUMENT_ARCHETYPES.get(argument_archetype)
                composition_profile = COMPOSITION_ARCHETYPES.get(composition_archetype)
                if relationship_profile is None:
                    errors.append(issue("MARKET_RELATIONSHIP", f"{path}.expression_recipe.market_relationship", "Use a registered market relationship."))
                if archetype_profile is None:
                    errors.append(issue("ARGUMENT_ARCHETYPE", f"{path}.expression_recipe.argument_archetype", "Use a registered trading argument archetype."))
                if composition_profile is None:
                    errors.append(issue("COMPOSITION_ARCHETYPE", f"{path}.expression_recipe.composition_archetype", "Use a registered composition archetype."))
                if relationship_profile is not None and archetype_profile is not None:
                    if market_relationship not in set(archetype_profile["preferred_relationships"]):
                        errors.append(issue("FINANCE_ROUTE_COMPATIBILITY", f"{path}.expression_recipe", f"{argument_archetype} does not support market relationship {market_relationship}."))
                    selected_grammars = {primary_grammar, *support_grammars}
                    if job_profile is not None and job_profile["family"] != "fast_read":
                        if not selected_grammars.intersection(relationship_profile["preferred_grammars"]):
                            errors.append(issue("RELATIONSHIP_GRAMMAR", f"{path}.expression_recipe.primary_grammar", f"Selected grammars do not express market relationship {market_relationship}."))
                        if not selected_grammars.intersection(archetype_profile["preferred_grammars"]):
                            errors.append(issue("ARCHETYPE_GRAMMAR", f"{path}.expression_recipe.primary_grammar", f"Selected grammars do not express argument archetype {argument_archetype}."))
                if relationship_profile is not None and archetype_profile is not None and composition_profile is not None:
                    finance_route_count += 1
                    composition_archetypes.add(composition_archetype)
                if intent_relationship is not None and market_relationship != intent_relationship:
                    errors.append(issue("FINANCE_INTENT_DRIFT", f"{path}.expression_recipe.market_relationship", f"Direction uses {market_relationship}, but intent lock requires {intent_relationship}."))

            proof_refs_value = expression_recipe.get("proof_binding_refs")
            if (
                not isinstance(proof_refs_value, list)
                or not proof_refs_value
                or len(proof_refs_value) != len(set(proof_refs_value))
                or not all(isinstance(item, str) for item in proof_refs_value)
            ):
                errors.append(issue("EXPRESSION_PROOF_REFS", f"{path}.expression_recipe.proof_binding_refs", "Use one or more unique proof binding refs."))
                proof_refs: set[str] = set()
            else:
                proof_refs = set(proof_refs_value)
                unknown_proof_refs = sorted(proof_refs - binding_ids)
                if unknown_proof_refs:
                    errors.append(issue("EXPRESSION_PROOF_REFS", f"{path}.expression_recipe.proof_binding_refs", f"Unknown proof bindings: {unknown_proof_refs}."))
                missing_selected_proofs = sorted(selected_material_binding_ids - proof_refs)
                if missing_selected_proofs:
                    errors.append(issue("EXPRESSION_MATERIAL_PROOF", f"{path}.expression_recipe.proof_binding_refs", f"Expression recipe omits selected material bindings: {missing_selected_proofs}."))

            recipe_data_refs_value = expression_recipe.get("data_requirement_refs")
            if (
                not isinstance(recipe_data_refs_value, list)
                or len(recipe_data_refs_value) != len(set(recipe_data_refs_value))
                or not all(isinstance(item, str) and item.strip() for item in recipe_data_refs_value)
            ):
                errors.append(issue("EXPRESSION_DATA_REFS", f"{path}.expression_recipe.data_requirement_refs", "Recipe data refs must be a unique array."))
                recipe_data_refs: set[str] = set()
            else:
                recipe_data_refs = set(recipe_data_refs_value)
                unknown_data_refs = sorted(recipe_data_refs - data_requirement_refs)
                if unknown_data_refs:
                    errors.append(issue("EXPRESSION_DATA_REFS", f"{path}.expression_recipe.data_requirement_refs", f"Recipe data refs are undeclared: {unknown_data_refs}."))

            proof_binding_kinds = [binding_kinds[ref] for ref in proof_refs if ref in binding_kinds]
            if evidence_shapes:
                selected_grammar_ids = [primary_grammar, *support_grammars]
                allowed_recipe_shapes: set[str] = set()
                for grammar_id in selected_grammar_ids:
                    grammar_profile = EXPRESSION_GRAMMARS.get(grammar_id, {})
                    allowed_recipe_shapes.update(grammar_profile.get("optional_shapes", []))
                    for required_shape_set in grammar_profile.get("required_shape_sets", []):
                        allowed_recipe_shapes.update(required_shape_set)
                unsupported_shapes = sorted(evidence_shapes - allowed_recipe_shapes)
                if unsupported_shapes:
                    errors.append(issue("EXPRESSION_SHAPE_EXCESS", f"{path}.expression_recipe.evidence_shapes", f"Selected grammars do not encode evidence shapes: {unsupported_shapes}."))
                for grammar_id in selected_grammar_ids:
                    if grammar_id:
                        errors.extend(validate_expression_grammar(
                            grammar_id,
                            evidence_shapes,
                            proof_binding_kinds,
                            recipe_data_refs,
                            f"{path}.expression_recipe",
                        ))

            for key in ("composition_rule", "fit_reason"):
                value = expression_recipe.get(key)
                if not isinstance(value, str) or not 12 <= len(value.strip()) <= 240:
                    errors.append(issue("EXPRESSION_TEXT", f"{path}.expression_recipe.{key}", f"{key} must be 12-240 characters."))

        skeleton = re.sub(r"[^a-z0-9]+", " ", str(direction.get("spatial_skeleton") or "").lower()).strip()
        if not skeleton:
            errors.append(issue("SKELETON", f"{path}.spatial_skeleton", "A spatial skeleton is required."))
        elif skeleton in skeletons:
            errors.append(issue("SKELETON_DUPLICATE", f"{path}.spatial_skeleton", "Directions must use different spatial skeletons."))
        skeletons.add(skeleton)

        used_refs = direction.get("binding_refs")
        if (
            not isinstance(used_refs, list)
            or not used_refs
            or not all(isinstance(ref, str) for ref in used_refs)
            or len(used_refs) != len(set(used_refs))
        ):
            errors.append(issue("DIRECTION_BINDINGS", f"{path}.binding_refs", "A direction must use unique binding refs."))
            used_refs = []
        for ref in used_refs:
            if ref not in binding_ids:
                errors.append(issue("UNKNOWN_BINDING", f"{path}.binding_refs", f"Unknown binding ref: {ref}"))
        recipe_only_bindings = proof_refs - set(used_refs)
        if recipe_only_bindings:
            errors.append(issue("EXPRESSION_DIRECTION_BINDINGS", f"{path}.expression_recipe.proof_binding_refs", f"Proof bindings must also appear in direction.binding_refs: {sorted(recipe_only_bindings)}"))
        missing_route_bindings = route_required_bindings - set(used_refs)
        if missing_route_bindings:
            errors.append(issue("LOGIC_ROUTE_BINDINGS", f"{path}.binding_refs", f"Direction is missing logic-route bindings: {sorted(missing_route_bindings)}"))
        missing_material_bindings = selected_material_binding_ids - set(used_refs)
        if missing_material_bindings:
            errors.append(issue("MATERIAL_BINDING_OMITTED", f"{path}.binding_refs", f"Direction omits selected material display bindings: {sorted(missing_material_bindings)}"))
        missing_material_route = selected_material_binding_ids - route_required_bindings
        if missing_material_route:
            errors.append(issue("MATERIAL_BINDING_ROUTE", f"{path}.logic_route.visible_step_ids", f"Visible route omits selected material display bindings: {sorted(missing_material_route)}"))
        missing_material_compact = selected_material_binding_ids - compact_required_bindings
        if missing_material_compact:
            errors.append(issue("MATERIAL_BINDING_COMPACT_ROUTE", f"{path}.logic_route.compact_step_ids", f"Compact route omits selected material display bindings: {sorted(missing_material_compact)}"))

        preflight = direction.get("preflight")
        if not isinstance(preflight, dict) or set(preflight) != PREFLIGHT_KEYS:
            errors.append(issue("PREFLIGHT", f"{path}.preflight", f"All {len(PREFLIGHT_KEYS)} kernel pre-flight checks are required."))
        else:
            for key in sorted(PREFLIGHT_KEYS):
                value = preflight.get(key)
                if not isinstance(value, bool):
                    errors.append(issue("PREFLIGHT_VALUE", f"{path}.preflight.{key}", "Pre-flight values must be boolean."))
                elif state in {"previewed", "selected"} and value is not True:
                    errors.append(issue("PREFLIGHT_INCOMPLETE", f"{path}.preflight.{key}", "Previewed and selected directions must pass every pre-flight check."))

        html_ref = direction.get("html_ref")
        preview_ref = direction.get("preview_ref")
        compact_preview_ref = direction.get("compact_preview_ref")
        capture_report_ref = direction.get("capture_report_ref")
        render_audit_ref = direction.get("render_audit_ref")
        for key, ref, seen in (
            ("html_ref", html_ref, html_refs),
            ("preview_ref", preview_ref, preview_refs),
            ("compact_preview_ref", compact_preview_ref, compact_preview_refs),
        ):
            if not valid_ref(ref):
                errors.append(issue("ASSET_REF", f"{path}.{key}", "Asset refs must be safe relative paths."))
            elif ref in seen:
                errors.append(issue("ASSET_REF_DUPLICATE", f"{path}.{key}", "Each direction needs a distinct asset."))
            else:
                seen.add(ref)
        for key, ref, seen in (
            ("capture_report_ref", capture_report_ref, capture_report_refs),
            ("render_audit_ref", render_audit_ref, render_audit_refs),
        ):
            if ref is None and state == "draft":
                continue
            if not valid_ref(ref) or not str(ref).endswith(".json"):
                errors.append(issue("REPORT_REF", f"{path}.{key}", "Previewed directions need a safe relative JSON report ref."))
            elif ref in seen:
                errors.append(issue("REPORT_REF_DUPLICATE", f"{path}.{key}", "Each direction needs a distinct report."))
            else:
                seen.add(str(ref))

        critique = direction.get("critique")
        if not isinstance(critique, dict):
            errors.append(issue("CRITIQUE", f"{path}.critique", "Critique is required."))
            continue
        calculated = 0.0
        for key, weight in WEIGHTS.items():
            value = critique.get(key)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0 <= value <= 10:
                errors.append(issue("CRITIQUE_SCORE", f"{path}.critique.{key}", "Score must be finite and between 0 and 10."))
                value = 0
            calculated += float(value) * weight
        reported = critique.get("weighted_score")
        if not isinstance(reported, (int, float)) or abs(float(reported) - calculated) > 0.06:
            errors.append(issue("WEIGHTED_SCORE", f"{path}.critique.weighted_score", f"Expected {calculated:.2f}."))
        if direction_id:
            scores[str(direction_id)] = calculated
        verdict = critique.get("verdict")
        if critique.get("data_integrity", 0) < 8 and verdict != "reject":
            errors.append(issue("INTEGRITY_VERDICT", f"{path}.critique.verdict", "Data integrity below 8 requires reject."))
        if (critique.get("concept", 0) < 7 or critique.get("three_second", 0) < 7 or critique.get("hierarchy", 0) < 7) and verdict == "pass":
            errors.append(issue("CLARITY_VERDICT", f"{path}.critique.verdict", "Concept, three-second, or hierarchy score below 7 cannot pass."))
        if critique.get("color_logic", 0) < 7 and verdict == "pass":
            errors.append(issue("COLOR_VERDICT", f"{path}.critique.verdict", "Color logic below 7 cannot pass."))
        if critique.get("anti_default", 0) < 7 and verdict == "pass":
            errors.append(issue("ANTI_DEFAULT_VERDICT", f"{path}.critique.verdict", "Anti-default score below 7 cannot pass."))

        if asset_root is not None and valid_ref(html_ref):
            html_path = (asset_root / str(html_ref)).resolve()
            if asset_root.resolve() not in html_path.parents:
                errors.append(issue("ASSET_ESCAPE", f"{path}.html_ref", "HTML escaped the asset root."))
            elif state in {"previewed", "selected"} and not html_path.is_file():
                errors.append(issue("HTML_MISSING", f"{path}.html_ref", f"Missing HTML: {html_ref}"))
            elif html_path.is_file():
                html = html_path.read_text(encoding="utf-8")
                if "data-cuebook-viewpoint" not in html or f'data-direction-id="{direction_id}"' not in html:
                    errors.append(issue("HTML_CONTRACT", f"{path}.html_ref", "HTML canvas or direction ID is missing."))
                launch_audit = audit_html(html)
                for launch_error in launch_audit["errors"]:
                    errors.append(issue(f"HTML_{launch_error['code']}", f"{path}.html_ref", launch_error["message"]))
                expected_attrs = {
                    "design-variance": design_variance,
                    "visual-density": visual_density,
                    "layout-grid": grid,
                    "entry-role": entry_role,
                    "palette-family": palette_family,
                    "palette-strategy": palette_strategy,
                    "palette-preset": preset_id,
                    "color-system": "semantic-v1",
                    "market-relationship": market_relationship,
                    "argument-archetype": argument_archetype,
                    "composition-archetype": composition_archetype,
                    "finance-transform": intent_finance_transform,
                    "baseline-policy": intent_baseline_policy,
                    "chart-decision": intent_chart_decision,
                }
                for attr, value in expected_attrs.items():
                    if value is not None and not re.search(rf"data-{attr}=[\"']{re.escape(str(value))}[\"']", html):
                        errors.append(issue("HTML_DESIGN_READ", f"{path}.html_ref", f"HTML is missing data-{attr}={value}."))
                if re.search(r"(?:src|href)=[\"']https?://", html, flags=re.I):
                    errors.append(issue("EXTERNAL_ASSET", f"{path}.html_ref", "Direction HTML must be network-free."))
                lower = html.lower()
                for term in INTERNAL_TERMS:
                    if term in lower:
                        errors.append(issue("INTERNAL_TEXT", f"{path}.html_ref", f"Internal term leaked: {term}"))
                html_binding_refs = set(launch_audit.get("stats", {}).get("visible_binding_refs") or [])
                missing = set(used_refs) - html_binding_refs
                if missing:
                    errors.append(issue("HTML_BINDING", f"{path}.html_ref", f"HTML is missing visible, relevant bindings: {sorted(missing)}"))
                html_logic_steps = set(launch_audit.get("stats", {}).get("visible_logic_step_ids") or [])
                missing_logic_steps = set(visible_steps) - html_logic_steps
                if missing_logic_steps:
                    errors.append(issue("HTML_LOGIC_ROUTE", f"{path}.html_ref", f"HTML is missing visible, relevant logic steps: {sorted(missing_logic_steps)}"))
        if asset_root is not None and state in {"previewed", "selected"}:
            preview_paths: dict[str, Path] = {}
            for key, ref in (("preview_ref", preview_ref), ("compact_preview_ref", compact_preview_ref)):
                if valid_ref(ref):
                    preview_path = (asset_root / str(ref)).resolve()
                    if not preview_path.is_file():
                        errors.append(issue("PREVIEW_MISSING", f"{path}.{key}", f"Missing preview: {ref}"))
                    else:
                        preview_paths[key] = preview_path
                        expected_dimensions = (2680, 1056) if key == "preview_ref" else (670, 264)
                        dimensions = png_dimensions(preview_path)
                        if dimensions != expected_dimensions:
                            errors.append(issue("PREVIEW_FORMAT", f"{path}.{key}", f"Expected a valid {expected_dimensions[0]} x {expected_dimensions[1]} PNG."))

            html_path = (asset_root / str(html_ref)).resolve() if valid_ref(html_ref) else None
            html_sha = sha256_file(html_path) if html_path and html_path.is_file() else None
            capture_path = (asset_root / str(capture_report_ref)).resolve() if valid_ref(capture_report_ref) else None
            capture_report = read_json_file(capture_path) if capture_path and capture_path.is_file() else None
            if not isinstance(capture_report, dict):
                errors.append(issue("CAPTURE_REPORT", f"{path}.capture_report_ref", "Missing or invalid capture report."))
            else:
                if capture_report.get("schema_version") != "viewpoint-html-capture-v1" or capture_report.get("source_sha256") != html_sha:
                    errors.append(issue("CAPTURE_REPORT_SOURCE", f"{path}.capture_report_ref", "Capture report must match the current HTML hash."))
                derivatives = capture_report.get("derivatives")
                by_kind = {item.get("kind"): item for item in derivatives if isinstance(item, dict)} if isinstance(derivatives, list) else {}
                for key, kind, dimensions in (("preview_ref", "full", (2680, 1056)), ("compact_preview_ref", "compact_670", (670, 264))):
                    derivative = by_kind.get(kind)
                    preview_path = preview_paths.get(key)
                    if not isinstance(derivative, dict) or derivative.get("width") != dimensions[0] or derivative.get("height") != dimensions[1]:
                        errors.append(issue("CAPTURE_REPORT_DERIVATIVE", f"{path}.capture_report_ref", f"Capture report is missing {kind}."))
                    elif preview_path is not None and derivative.get("sha256") != sha256_file(preview_path):
                        errors.append(issue("CAPTURE_REPORT_HASH", f"{path}.capture_report_ref", f"Capture hash does not match {key}."))
                    painted_ratio = derivative.get("painted_ratio") if isinstance(derivative, dict) else None
                    if not finite_number(painted_ratio) or float(painted_ratio) < 0.006:
                        errors.append(issue("CAPTURE_REPORT_BLANK", f"{path}.capture_report_ref", f"{kind} must report at least 0.6% materially painted pixels."))

            audit_path = (asset_root / str(render_audit_ref)).resolve() if valid_ref(render_audit_ref) else None
            render_audit = read_json_file(audit_path) if audit_path and audit_path.is_file() else None
            if not isinstance(render_audit, dict):
                errors.append(issue("RENDER_AUDIT", f"{path}.render_audit_ref", "Missing or invalid rendered geometry audit."))
            else:
                if render_audit.get("schema_version") != "viewpoint-render-audit-v1" or render_audit.get("source_sha256") != html_sha:
                    errors.append(issue("RENDER_AUDIT_SOURCE", f"{path}.render_audit_ref", "Rendered audit must match the current HTML hash."))
                if render_audit.get("valid") is not True or render_audit.get("errors") != []:
                    errors.append(issue("RENDER_AUDIT_FAILED", f"{path}.render_audit_ref", "Rendered audit contains geometry, contrast, typography, or compact-layout failures."))
                fingerprint = render_audit.get("layout_fingerprint_sha256")
                if not re.fullmatch(r"sha256:[a-f0-9]{64}", str(fingerprint or "")):
                    errors.append(issue("RENDER_LAYOUT_FINGERPRINT", f"{path}.render_audit_ref", "Rendered audit needs a layout fingerprint."))
                elif fingerprint in rendered_layout_fingerprints:
                    errors.append(issue("RENDER_LAYOUT_DUPLICATE", f"{path}.render_audit_ref", "Rendered directions share the same coarse role geometry."))
                else:
                    rendered_layout_fingerprints.add(str(fingerprint))
                viewport_reports = render_audit.get("viewports")
                viewport_map = {(item.get("width"), item.get("height")): item for item in viewport_reports if isinstance(item, dict)} if isinstance(viewport_reports, list) else {}
                viewport_expectations = (
                    ((1340, 528), visible_steps, set(used_refs)),
                    ((670, 264), compact_steps, compact_required_bindings | selected_material_binding_ids),
                )
                for dimensions, expected_steps, expected_bindings in viewport_expectations:
                    viewport_report = viewport_map.get(dimensions)
                    if not isinstance(viewport_report, dict) or viewport_report.get("valid") is not True:
                        errors.append(issue("RENDER_AUDIT_VIEWPORT", f"{path}.render_audit_ref", f"Missing passed audit for {dimensions[0]} x {dimensions[1]}."))
                        continue
                    missing_steps = set(expected_steps) - set(viewport_report.get("logic_step_ids") or [])
                    if missing_steps:
                        errors.append(issue("RENDER_AUDIT_LOGIC", f"{path}.render_audit_ref", f"{dimensions[0]}px render hides required logic steps: {sorted(missing_steps)}"))
                    missing_bindings = expected_bindings - set(viewport_report.get("binding_refs") or [])
                    if missing_bindings:
                        errors.append(issue("RENDER_AUDIT_BINDING", f"{path}.render_audit_ref", f"{dimensions[0]}px render hides required bindings: {sorted(missing_bindings)}"))

    if design_logics != DESIGN_LOGICS:
        errors.append(issue("DESIGN_LOGIC_COVERAGE", "$.directions", "Directions must include product_native, benchmark_transfer, and content_native exactly once."))
    if 0 < expression_recipe_count < 3:
        errors.append(issue("EXPRESSION_RECIPE_PARTIAL", "$.directions", "Expression recipes must be absent for all legacy directions or present for all three."))
    if expression_recipe_count == 3:
        if candidate_families != CANDIDATE_FAMILIES:
            errors.append(issue("EXPRESSION_FAMILY_COVERAGE", "$.directions", "Directions must include exactly one fast-read, proof, and system communication job."))
        if len(candidate_jobs) != 3:
            errors.append(issue("EXPRESSION_JOB_DIVERSITY", "$.directions", "Three directions need three distinct communication jobs."))
        if len(primary_grammars) != 3:
            errors.append(issue("EXPRESSION_GRAMMAR_DIVERSITY", "$.directions", "Three directions need three distinct primary expression grammars."))
        if len(evidence_shape_signatures) < 2:
            errors.append(issue("EXPRESSION_SHAPE_DIVERSITY", "$.directions", "Three directions need at least two distinct evidence-shape signatures."))
        if len(selected_material_event_binding_ids) >= 3 and "news_synthesis" not in candidate_jobs:
            errors.append(issue("NEWS_SYNTHESIS_REQUIRED", "$.directions", "Three or more selected material news events require one news-synthesis system candidate."))
    if 0 < finance_route_count < 3:
        errors.append(issue("FINANCE_ROUTE_PARTIAL", "$.directions", "Finance route fields must be present and valid for all three directions or omitted for legacy artifacts."))
    if require_finance_route and finance_route_count != 3:
        errors.append(issue("FINANCE_ROUTE_COVERAGE", "$.directions", "Strict finance generation requires three complete finance routes."))
    if finance_route_count == 3:
        if len(composition_archetypes) != 3:
            errors.append(issue("COMPOSITION_DIVERSITY", "$.directions", "Three directions need three distinct composition archetypes."))
        if sum(1 for direction in directions if isinstance(direction, dict) and isinstance(direction.get("expression_recipe"), dict) and direction["expression_recipe"].get("composition_archetype") == "editorial_statement") > 1:
            errors.append(issue("EDITORIAL_STATEMENT_CAP", "$.directions", "At most one direction may use the editorial_statement composition archetype."))
    if design_variance is not None and design_variance >= 7:
        structural_variance = bool(
            layout_grids.intersection({"asymmetric_stage", "comparison_field", "freeform"})
            or layout_alignments.intersection({"split", "mixed"})
        )
        if not structural_variance:
            errors.append(issue("DESIGN_VARIANCE_UNDERDELIVERED", "$.directions", "High design variance requires at least one meaningfully asymmetric, comparison, split, mixed, or freeform direction."))
    if visual_density is not None and visual_density <= 3 and "dense" in layout_densities:
        errors.append(issue("DENSITY_DIAL_MISMATCH", "$.directions", "Visual density 1-3 cannot produce a dense direction."))
    if visual_density is not None and visual_density >= 8 and "quiet" in layout_densities:
        errors.append(issue("DENSITY_DIAL_MISMATCH", "$.directions", "Visual density 8-10 cannot produce a quiet direction."))
    if palette_strategies != PALETTE_STRATEGIES:
        errors.append(issue("PALETTE_STRATEGY_COVERAGE", "$.directions", "Directions must include creator_native, thesis_native, and contrast_variant exactly once."))
    if len(preset_ids) != 3 or len(palette_families) != 3:
        errors.append(issue("PALETTE_DIVERSITY", "$.directions", "Three sibling directions must use three distinct registered palette presets."))
    for strategy, preset_id in palette_choices:
        if preset_id in recent_palette_ids and not (strategy == "creator_native" and preset_id == signature_palette_id):
            errors.append(issue("PALETTE_RECENT_REPEAT", "$.directions", f"Recent palette {preset_id!r} may repeat only as an explicit creator signature."))

    if "claim_first" not in routes:
        errors.append(issue("ROUTE_COVERAGE", "$.directions", "One claim-first direction is required."))
    if not routes.intersection({"evidence_first", "reasoning_first", "strategy_first", "freeform"}):
        errors.append(issue("ROUTE_COVERAGE", "$.directions", "At least one non-claim route is required."))

    selected = payload.get("selected_direction_id")
    reason = payload.get("selection_reason")
    if state == "selected":
        if selected not in direction_ids:
            errors.append(issue("SELECTION", "$.selected_direction_id", "Selected direction must exist."))
        elif scores.get(str(selected), 0) < 7.5:
            errors.append(issue("SELECTION_SCORE", "$.selected_direction_id", "Selected direction must score at least 7.5."))
        if not isinstance(reason, str) or len(reason.strip()) < 4:
            errors.append(issue("SELECTION_REASON", "$.selection_reason", "Selected state requires a reason."))
    elif selected is not None:
        errors.append(issue("SELECTION_STATE", "$.selected_direction_id", "Only selected state may select a direction."))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--asset-root", type=Path)
    parser.add_argument("--require-expression-recipes", action="store_true")
    parser.add_argument("--require-finance-route", action="store_true")
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    errors = validate(
        payload,
        args.asset_root,
        require_expression_recipes=args.require_expression_recipes,
        require_finance_route=args.require_finance_route,
    )
    result = {"ok": not errors, "errors": errors}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
