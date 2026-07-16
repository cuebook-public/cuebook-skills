#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORDMARK = (ROOT / "assets" / "cuebook-wordmark.svg").read_text(encoding="utf-8").strip().replace(
    "<svg ",
    '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ',
    1,
).replace('fill="#F2F3F4"', 'fill="currentColor"')
SPEC = importlib.util.spec_from_file_location("direction_validator", ROOT / "scripts" / "validate_visual_direction_set.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


def critique(score: float = 8.0) -> dict:
    return {
        "concept": score,
        "three_second": score,
        "hierarchy": score,
        "data_integrity": score,
        "color_logic": score,
        "craft": score,
        "originality": score,
        "anti_default": score,
        "weighted_score": score,
        "verdict": "pass" if score >= 7.5 else "revise",
        "revision": "Tighten the final annotation.",
    }


def base_payload(state: str = "draft") -> dict:
    directions = []
    for index, route in enumerate(("claim_first", "evidence_first", "reasoning_first"), start=1):
        design_logic = ("product_native", "benchmark_transfer", "content_native")[index - 1]
        hierarchy = (
            ["claim", "evidence", "implication"],
            ["evidence", "claim", "implication"],
            ["reason", "claim", "implication"],
        )[index - 1]
        grid = ("single_axis", "editorial_split", "asymmetric_stage")[index - 1]
        alignment = ("left", "split", "mixed")[index - 1]
        density = ("balanced", "balanced", "quiet")[index - 1]
        entry_role = ("claim", "evidence", "claim")[index - 1]
        color_system = (
            {"palette_family": "quiet-cobalt", "palette_strategy": "creator_native", "preset_id": "quiet-cobalt", "selection_reason": "Matches the calm analytical creator voice.", "surface": "light", "semantic_roles": ["positive", "observed"], "dominant_role": "positive", "role_color_map": {"positive": "accent-b", "observed": "accent-a"}, "redundant_cues": ["type", "label"]},
            {"palette_family": "event-coral", "palette_strategy": "thesis_native", "preset_id": "event-coral", "selection_reason": "Matches the event and catalyst evidence structure.", "surface": "light", "semantic_roles": ["observed", "catalyst"], "dominant_role": "observed", "role_color_map": {"observed": "accent-b", "catalyst": "accent-c"}, "redundant_cues": ["area", "label"]},
            {"palette_family": "macro-crimson", "palette_strategy": "contrast_variant", "preset_id": "macro-crimson", "selection_reason": "Offers a credible split-surface contrast variant.", "surface": "split", "semantic_roles": ["observed", "conditional"], "dominant_role": "conditional", "role_color_map": {"observed": "accent-b", "conditional": "accent-c"}, "redundant_cues": ["position", "solid_dashed"]},
        )[index - 1]
        type_scale = (
            {"hero_px_canvas": 96, "body_px_canvas": 44, "meta_px_canvas": 24, "hero_body_ratio": 2.18},
            {"hero_px_canvas": 88, "body_px_canvas": 40, "meta_px_canvas": 22, "hero_body_ratio": 2.20},
            {"hero_px_canvas": 104, "body_px_canvas": 44, "meta_px_canvas": 24, "hero_body_ratio": 2.36},
        )[index - 1]
        directions.append({
            "direction_id": f"VDIR_TEST_0{index}",
            "design_logic": design_logic,
            "design_anchor": (
                {"source_kind": "cuebook_product", "source_ref": "Cuebook static viewpoint system", "verified_at": None, "transferred_principle": "Use one dominant claim and a quiet direct proof.", "excluded_surface_traits": ["dashboard chrome"]},
                {"source_kind": "verified_benchmark", "source_ref": "https://example.com/editorial-reference", "verified_at": "2026-07-15T12:00:00+08:00", "transferred_principle": "Transfer the unequal editorial split, not the source brand surface.", "excluded_surface_traits": ["source palette", "source typography"]},
                {"source_kind": "content_motif", "source_ref": "BIND_REL_01", "verified_at": None, "transferred_principle": "Turn pressure absorption into the organizing spatial tension.", "excluded_surface_traits": ["generic stock chart"]},
            )[index - 1],
            "layout_system": {
                "hierarchy": hierarchy,
                "entry_role": entry_role,
                "grid": grid,
                "alignment": alignment,
                "density": density,
                "type_scale": type_scale,
                "craft_system": {
                    "type_family_mode": "system", "claim_weight": 750, "claim_line_height": 1.08,
                    "claim_wrap": "balance", "number_style": "tabular-nums", "max_type_sizes": 4,
                    "max_weights": 3, "radius_rule": ("soft", "sharp", "concentric")[index - 1],
                    "surface_separation": ("whitespace", "divider", "mixed")[index - 1],
                    "optical_priority": ("claim wrap and proof alignment", "comparison seam and evidence lockup", "causal path terminal alignment")[index - 1],
                    "compact_mode": ("reflow", "recompose", "reflow")[index - 1],
                    "compact_type_scale": {"hero_px_670": type_scale["hero_px_canvas"] / 2, "body_px_670": type_scale["body_px_canvas"] / 2, "meta_px_670": max(11, type_scale["meta_px_canvas"] / 2)},
                },
                "color_system": color_system,
                "data_role": "support",
                "responsive_rule": "Preserve the first three beats and stack support below the hero at 670px.",
            },
            "route": route,
            "logic_route": (
                {"entry_step_id": "LSTEP_CLAIM", "visible_step_ids": ["LSTEP_CLAIM", "LSTEP_OBS", "LSTEP_MECH", "LSTEP_ACTION"], "compact_step_ids": ["LSTEP_CLAIM", "LSTEP_OBS", "LSTEP_MECH", "LSTEP_ACTION"]},
                {"entry_step_id": "LSTEP_OBS", "visible_step_ids": ["LSTEP_OBS", "LSTEP_MECH", "LSTEP_CLAIM", "LSTEP_ACTION"], "compact_step_ids": ["LSTEP_OBS", "LSTEP_MECH", "LSTEP_CLAIM", "LSTEP_ACTION"]},
                {"entry_step_id": "LSTEP_MECH", "visible_step_ids": ["LSTEP_MECH", "LSTEP_OBS", "LSTEP_CLAIM", "LSTEP_ACTION"], "compact_step_ids": ["LSTEP_MECH", "LSTEP_OBS", "LSTEP_CLAIM", "LSTEP_ACTION"]},
            )[index - 1],
            "expression_recipe": (
                {
                    "candidate_job": "conviction_snapshot",
                    "market_relationship": "causal_transmission",
                    "argument_archetype": "event_driven",
                    "composition_archetype": "editorial_statement",
                    "evidence_shapes": ["creator_judgment", "qualitative_relation"],
                    "primary_grammar": "editorial_statement",
                    "support_grammars": [],
                    "proof_binding_refs": ["BIND_VIEW_01", "BIND_OBS_01", "BIND_REL_01", "BIND_ACTION_01"],
                    "data_requirement_refs": ["D1"],
                    "composition_rule": "Let the judgment dominate while one tension interrupts the reading path.",
                    "fit_reason": "This is the quickest truthful reading of the creator's reaction view.",
                },
                {
                    "candidate_job": "evidence_proof",
                    "market_relationship": "causal_transmission",
                    "argument_archetype": "event_driven",
                    "composition_archetype": "comparison_axis",
                    "evidence_shapes": ["qualitative_relation"],
                    "primary_grammar": "tension_field",
                    "support_grammars": [],
                    "proof_binding_refs": ["BIND_VIEW_01", "BIND_OBS_01", "BIND_REL_01", "BIND_ACTION_01"],
                    "data_requirement_refs": ["D1"],
                    "composition_rule": "Place pressure and muted response on one unequal comparison field.",
                    "fit_reason": "The pressure-response contradiction is the strongest available proof shape.",
                },
                {
                    "candidate_job": "mechanism_path",
                    "market_relationship": "causal_transmission",
                    "argument_archetype": "event_driven",
                    "composition_archetype": "transmission_gate",
                    "evidence_shapes": ["causal_graph"],
                    "primary_grammar": "causal_chain",
                    "support_grammars": [],
                    "proof_binding_refs": ["BIND_VIEW_01", "BIND_OBS_01", "BIND_REL_01", "BIND_ACTION_01"],
                    "data_requirement_refs": ["D1"],
                    "composition_rule": "Move from observed pressure through absorption to the creator's action.",
                    "fit_reason": "A connected mechanism path explains why the muted reaction matters for the trade.",
                },
            )[index - 1],
            "concept": f"A distinct direction number {index} built from the thesis.",
            "form_from_content": f"The spatial form comes from relationship {index} in the source view.",
            "hero_primitive": ("statement", "contrast", "causal_path")[index - 1],
            "support_primitives": ["action_line"],
            "reading_order": hierarchy,
            "spatial_skeleton": ("oversized type interrupted by pressure", "asymmetric collision around one seam", "diagonal processional to action")[index - 1],
            "html_ref": f"direction-{index}.html",
            "preview_ref": f"direction-{index}.png",
            "compact_preview_ref": f"direction-{index}-670.png",
            "capture_report_ref": None,
            "render_audit_ref": None,
            "binding_refs": ["BIND_VIEW_01", "BIND_OBS_01", "BIND_REL_01", "BIND_ACTION_01"],
            "preflight": {
                "copy_audited": True,
                "compact_readable": True,
                "anti_default_checked": True,
                "layout_signature_unique": True,
                "source_bindings_complete": True,
                "logic_route_complete": True,
                "shape_system_consistent": True,
                "typography_craft_checked": True,
                "optical_alignment_checked": True,
                "hierarchy_survives_grayscale": True,
                "semantic_color_checked": True,
            },
            "critique": critique(8.0 + index / 10),
        })
    selected = directions[0]["direction_id"] if state == "selected" else None
    return {
        "schema_version": "visual-direction-set-v1",
        "direction_set_id": "VDSET_TEST_20260715",
        "state": state,
        "input_refs": ["MVS_TEST_01"],
        "fact_refs": ["FACT_TEST_01"],
        "data_requirement_refs": ["D1"],
        "intent_lock": {
            "reader_job": "Explain why a muted reaction matters for the trade",
            "reader_question": "How can heavier pressure and a lighter response change the BTC view?",
            "analytic_relationship": "causal_transmission",
            "evidence_shape_refs": ["creator_judgment", "qualitative_relation", "causal_graph"],
            "finance_transform": "causal_path",
            "comparison_basis": {"unit": None, "currency": None, "period": None, "benchmark": None, "normalization": None},
            "baseline_policy": "none",
            "chart_decision": "diagram",
            "renderer_route": "directed_html",
            "compact_fallback": "Keep one observed pressure, one mechanism, and the creator judgment.",
        },
        "design_read": {
            "statement": "Reading this as a fast-scanning BTC reaction view for active traders with a skeptical editorial language.",
            "mode": "compose",
            "audience": "active traders scanning the Cuebook Feed",
            "tone": "skeptical",
            "design_language": "high-contrast editorial reaction test",
            "reading_context": "feed_static_3_second",
            "design_variance": 8,
            "visual_density": 5,
            "creator_visual_profile": {
                "source": "voice_spec", "source_ref": "PLAN_TEST_01", "register": "strategist",
                "energy": 3, "conviction": 4, "technicality": 4, "emotionality": 2, "compression": 4,
                "contrast": "balanced", "chroma": "restrained", "neutral_temperature": "neutral",
                "surface_bias": "mixed", "signature_palette_id": None, "recent_palette_ids": [],
                "visual_context_refs": [],
            },
            "preserve": [],
            "retire": ["generic dashboard header", "decorative sparkline"],
        },
        "message": {
            "claim": "坏消息落地，价格仍然跌不动",
            "because": "卖压增加，价格反应却变轻",
            "implication": "把回调视为观察多头承接的窗口",
            "direction": "long",
            "asset_refs": ["BTC"],
            "horizon": None,
        },
        "bindings": [
            {"binding_id": "BIND_VIEW_01", "kind": "creator_judgment", "label": "坏消息砸不动 BTC", "state": "creator_view", "source_refs": ["MVS_TEST_01"], "request_class": "creator_judgment", "material_to_claim": True, "selected_for_display": False},
            {"binding_id": "BIND_OBS_01", "kind": "fact", "label": "卖压增加", "state": "observed", "source_refs": ["FACT_TEST_01", "D1"], "request_class": "qualitative_evidence", "material_to_claim": True, "selected_for_display": True},
            {"binding_id": "BIND_REL_01", "kind": "relationship", "label": "卖压更重，价格反应更轻", "state": "derived", "source_refs": ["FACT_TEST_01"], "request_class": "qualitative_evidence", "material_to_claim": True, "selected_for_display": False},
            {"binding_id": "BIND_ACTION_01", "kind": "creator_judgment", "label": "观察多头承接", "state": "creator_view", "source_refs": ["MVS_TEST_01"], "request_class": "creator_judgment", "material_to_claim": False, "selected_for_display": False},
        ],
        "logic_progression": {
            "pattern": "reaction_test",
            "steps": [
                {"step_id": "LSTEP_OBS", "role": "evidence", "state": "observed", "text": "卖压增加", "binding_refs": ["BIND_OBS_01"]},
                {"step_id": "LSTEP_MECH", "role": "tension", "state": "derived", "text": "价格反应却变轻", "binding_refs": ["BIND_REL_01"]},
                {"step_id": "LSTEP_CLAIM", "role": "judgment", "state": "creator_view", "text": "坏消息落地，价格仍然跌不动", "binding_refs": ["BIND_VIEW_01"]},
                {"step_id": "LSTEP_ACTION", "role": "trade_implication", "state": "creator_view", "text": "观察多头承接", "binding_refs": ["BIND_ACTION_01"]},
            ],
            "links": [
                {"from_step_id": "LSTEP_OBS", "to_step_id": "LSTEP_MECH", "relation": "pressures"},
                {"from_step_id": "LSTEP_MECH", "to_step_id": "LSTEP_CLAIM", "relation": "confirms"},
                {"from_step_id": "LSTEP_CLAIM", "to_step_id": "LSTEP_ACTION", "relation": "leads_to"},
            ],
            "public_spine_step_ids": ["LSTEP_OBS", "LSTEP_MECH", "LSTEP_CLAIM", "LSTEP_ACTION"],
            "message_step_map": {"claim_step_id": "LSTEP_CLAIM", "because_step_id": "LSTEP_MECH", "implication_step_id": "LSTEP_ACTION"},
        },
        "directions": directions,
        "selected_direction_id": selected,
        "selection_reason": "The claim-first direction survives thumbnail scale best." if selected else None,
    }


class DirectionSetTests(unittest.TestCase):
    def test_valid_draft(self) -> None:
        self.assertEqual(VALIDATOR.validate(base_payload()), [])

    def test_schema_requires_upstream_lineage_and_binding_classification(self) -> None:
        schema = json.loads((ROOT / "references" / "visual-direction-set-v1.schema.json").read_text(encoding="utf-8"))
        self.assertTrue({"fact_refs", "data_requirement_refs"}.issubset(schema["required"]))
        binding = schema["properties"]["bindings"]["items"]
        self.assertTrue({"request_class", "material_to_claim", "selected_for_display"}.issubset(binding["required"]))
        direction = schema["properties"]["directions"]["items"]
        self.assertIn("expression_recipe", direction["properties"])

    def test_expression_recipe_is_required(self) -> None:
        payload = base_payload()
        payload["directions"][0].pop("expression_recipe")
        codes = {item["code"] for item in VALIDATOR.validate(payload, require_expression_recipes=True)}
        self.assertIn("EXPRESSION_RECIPE", codes)

    def test_legacy_set_without_expression_recipes_remains_readable(self) -> None:
        payload = base_payload()
        for direction in payload["directions"]:
            direction.pop("expression_recipe")
        self.assertEqual(VALIDATOR.validate(payload), [])
        strict_codes = {item["code"] for item in VALIDATOR.validate(payload, require_expression_recipes=True)}
        self.assertIn("EXPRESSION_RECIPE", strict_codes)

    def test_partial_expression_recipe_coverage_is_rejected(self) -> None:
        payload = base_payload()
        payload["directions"][0].pop("expression_recipe")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("EXPRESSION_RECIPE_PARTIAL", codes)

    def test_expression_registry_matches_schema_enums(self) -> None:
        schema = json.loads((ROOT / "references" / "visual-direction-set-v1.schema.json").read_text(encoding="utf-8"))
        registry = json.loads((ROOT / "references" / "viewpoint-expression-registry-v1.json").read_text(encoding="utf-8"))
        recipe = schema["properties"]["directions"]["items"]["properties"]["expression_recipe"]["properties"]
        self.assertEqual({item["job_id"] for item in registry["candidate_jobs"]}, set(recipe["candidate_job"]["enum"]))
        self.assertEqual({item["grammar_id"] for item in registry["grammars"]}, set(recipe["primary_grammar"]["enum"]))
        self.assertEqual(set(registry["evidence_shapes"]), set(recipe["evidence_shapes"]["items"]["enum"]))
        self.assertEqual(set(registry["evidence_shapes"]), set(registry["evidence_contracts"]))
        self.assertEqual({item["relationship_id"] for item in registry["market_relationships"]}, set(recipe["market_relationship"]["enum"]))
        self.assertEqual({item["archetype_id"] for item in registry["argument_archetypes"]}, set(recipe["argument_archetype"]["enum"]))
        self.assertEqual({item["composition_id"] for item in registry["composition_archetypes"]}, set(recipe["composition_archetype"]["enum"]))
        intent = schema["properties"]["intent_lock"]["properties"]
        self.assertEqual(set(registry["finance_transforms"]), set(intent["finance_transform"]["enum"]))
        self.assertEqual(set(registry["baseline_policies"]), set(intent["baseline_policy"]["enum"]))
        self.assertEqual(set(registry["chart_decisions"]), set(intent["chart_decision"]["enum"]))
        for contract in registry["evidence_contracts"].values():
            self.assertTrue(contract["required_fields"])
            self.assertTrue(contract["geometry_channels"])
            self.assertTrue(contract["compact_fallback"])
            self.assertTrue(contract["integrity"])

    def test_strict_finance_route_is_required_and_structurally_diverse(self) -> None:
        payload = base_payload()
        self.assertEqual(VALIDATOR.validate(payload, require_finance_route=True), [])
        payload["directions"][0]["expression_recipe"].pop("market_relationship")
        codes = {item["code"] for item in VALIDATOR.validate(payload, require_finance_route=True)}
        self.assertIn("FINANCE_ROUTE", codes)
        self.assertIn("FINANCE_ROUTE_COVERAGE", codes)

    def test_intent_lock_prevents_analytic_drift(self) -> None:
        payload = base_payload()
        payload["directions"][1]["expression_recipe"]["market_relationship"] = "deviation"
        codes = {item["code"] for item in VALIDATOR.validate(payload, require_finance_route=True)}
        self.assertIn("FINANCE_INTENT_DRIFT", codes)

        payload = base_payload()
        payload.pop("intent_lock")
        codes = {item["code"] for item in VALIDATOR.validate(payload, require_finance_route=True)}
        self.assertIn("FINANCE_INTENT_LOCK", codes)

    def test_malformed_expression_lists_do_not_crash_validator(self) -> None:
        payload = base_payload()
        payload["directions"][0]["expression_recipe"]["support_grammars"] = [{}]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("EXPRESSION_SUPPORT_GRAMMARS", codes)

    def test_primary_and_support_grammars_can_combine_evidence_shapes(self) -> None:
        payload = base_payload()
        recipe = payload["directions"][1]["expression_recipe"]
        recipe["evidence_shapes"] = ["qualitative_relation", "creator_judgment"]
        recipe["support_grammars"] = ["editorial_statement"]
        expression_codes = {item["code"] for item in VALIDATOR.validate(payload) if item["code"].startswith("EXPRESSION_")}
        self.assertEqual(expression_codes, set())

    def test_three_candidate_families_are_required(self) -> None:
        payload = base_payload()
        payload["directions"][2]["expression_recipe"]["candidate_job"] = "trigger_watch"
        payload["directions"][2]["expression_recipe"]["primary_grammar"] = "threshold_band"
        payload["directions"][2]["expression_recipe"]["evidence_shapes"] = ["ordered_series", "level"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("EXPRESSION_FAMILY_COVERAGE", codes)

    def test_primary_expression_grammars_must_differ(self) -> None:
        payload = base_payload()
        payload["directions"][1]["expression_recipe"]["primary_grammar"] = "editorial_statement"
        payload["directions"][1]["expression_recipe"]["candidate_job"] = "conviction_snapshot"
        payload["directions"][1]["expression_recipe"]["evidence_shapes"] = ["creator_judgment", "qualitative_relation"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("EXPRESSION_GRAMMAR_DIVERSITY", codes)

    def test_fan_chart_requires_quantile_scenarios_and_data(self) -> None:
        payload = base_payload()
        recipe = payload["directions"][2]["expression_recipe"]
        recipe.update({"candidate_job": "scenario_range", "primary_grammar": "fan_quantiles", "evidence_shapes": ["ordered_series"], "data_requirement_refs": []})
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("EXPRESSION_SHAPE_COMPATIBILITY", codes)
        self.assertIn("EXPRESSION_DATA_REQUIRED", codes)

    def test_news_heavy_view_requires_news_synthesis_candidate(self) -> None:
        payload = base_payload()
        for index in range(3):
            payload["bindings"].append({
                "binding_id": f"BIND_EVENT_0{index + 1}", "kind": "event", "label": f"material event {index + 1}",
                "state": "reported", "source_refs": ["D1"], "request_class": "news_anchor",
                "material_to_claim": True, "selected_for_display": True,
            })
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("NEWS_SYNTHESIS_REQUIRED", codes)

    def test_binding_sources_must_resolve_upstream(self) -> None:
        payload = base_payload()
        payload["bindings"][1]["source_refs"].append("FACT_UNDECLARED")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("BINDING_SOURCE_LINEAGE", codes)

    def test_binding_must_carry_request_class_and_materiality(self) -> None:
        for field, code in (("request_class", "BINDING_REQUEST_CLASS"), ("material_to_claim", "BINDING_MATERIALITY"), ("selected_for_display", "BINDING_SELECTION")):
            with self.subTest(field=field):
                payload = base_payload()
                payload["bindings"][1].pop(field)
                codes = {item["code"] for item in VALIDATOR.validate(payload)}
                self.assertIn(code, codes)

    def test_selected_request_needs_data_requirement_lineage(self) -> None:
        payload = base_payload()
        payload["bindings"][1]["source_refs"] = ["FACT_TEST_01"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("BINDING_REQUIREMENT_LINEAGE", codes)

    def test_every_direction_keeps_selected_material_binding(self) -> None:
        for request_class in ("news_anchor", "valuation_metric", "comparison_metric", "price_level"):
            with self.subTest(request_class=request_class):
                payload = base_payload()
                payload["bindings"][1]["request_class"] = request_class
                payload["directions"][0]["binding_refs"].remove("BIND_OBS_01")
                codes = {item["code"] for item in VALIDATOR.validate(payload)}
                self.assertIn("MATERIAL_BINDING_OMITTED", codes)

    def test_compact_route_keeps_selected_material_binding(self) -> None:
        payload = base_payload()
        payload["directions"][0]["logic_route"]["compact_step_ids"].remove("LSTEP_OBS")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("MATERIAL_BINDING_COMPACT_ROUTE", codes)

    def test_duplicate_skeleton_is_rejected(self) -> None:
        payload = base_payload()
        payload["directions"][1]["spatial_skeleton"] = payload["directions"][0]["spatial_skeleton"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("SKELETON_DUPLICATE", codes)

    def test_design_read_is_required(self) -> None:
        payload = base_payload()
        payload.pop("design_read")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("DESIGN_READ", codes)

    def test_preserve_mode_names_traits_to_keep(self) -> None:
        payload = base_payload()
        payload["design_read"]["mode"] = "redesign_preserve"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PRESERVE_REQUIRED", codes)

    def test_unknown_binding_is_rejected(self) -> None:
        payload = base_payload()
        payload["directions"][0]["binding_refs"].append("BIND_MISSING")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("UNKNOWN_BINDING", codes)

    def test_layout_system_is_required(self) -> None:
        payload = base_payload()
        payload["directions"][0].pop("layout_system")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("LAYOUT_SYSTEM", codes)

    def test_duplicate_layout_is_rejected(self) -> None:
        payload = base_payload()
        payload["directions"][1]["layout_system"] = copy.deepcopy(payload["directions"][0]["layout_system"])
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("LAYOUT_DUPLICATE", codes)

    def test_all_three_design_logics_are_required(self) -> None:
        payload = base_payload()
        payload["directions"][1]["design_logic"] = "product_native"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("DESIGN_LOGIC_COVERAGE", codes)

    def test_type_scale_ratio_must_match_sizes(self) -> None:
        payload = base_payload()
        payload["directions"][0]["layout_system"]["type_scale"]["hero_body_ratio"] = 4.0
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("TYPE_SCALE_RATIO", codes)

    def test_semantic_color_system_is_required(self) -> None:
        payload = base_payload()
        payload["directions"][0]["layout_system"].pop("color_system")
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("COLOR_SYSTEM", codes)

    def test_sibling_directions_need_palette_diversity(self) -> None:
        payload = base_payload()
        for direction in payload["directions"]:
            direction["layout_system"]["color_system"]["palette_family"] = "quiet-cobalt"
            direction["layout_system"]["color_system"]["preset_id"] = "quiet-cobalt"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PALETTE_DIVERSITY", codes)

    def test_all_three_palette_strategies_are_required(self) -> None:
        payload = base_payload()
        payload["directions"][1]["layout_system"]["color_system"]["palette_strategy"] = "creator_native"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PALETTE_STRATEGY_COVERAGE", codes)

    def test_palette_preset_must_be_registered(self) -> None:
        payload = base_payload()
        colors = payload["directions"][0]["layout_system"]["color_system"]
        colors["palette_family"] = "made-up-palette"
        colors["preset_id"] = "made-up-palette"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PALETTE_PRESET", codes)

    def test_recent_palette_requires_explicit_signature(self) -> None:
        payload = base_payload()
        payload["design_read"]["creator_visual_profile"]["recent_palette_ids"] = ["quiet-cobalt"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PALETTE_RECENT_REPEAT", codes)

    def test_high_variance_requires_structural_variance(self) -> None:
        payload = base_payload()
        for direction, grid, alignment in zip(
            payload["directions"],
            ("single_axis", "editorial_split", "timeline_band"),
            ("left", "centered", "left"),
        ):
            direction["layout_system"]["grid"] = grid
            direction["layout_system"]["alignment"] = alignment
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("DESIGN_VARIANCE_UNDERDELIVERED", codes)

    def test_density_dial_rejects_dense_quiet_output(self) -> None:
        payload = base_payload()
        payload["design_read"]["visual_density"] = 2
        payload["directions"][0]["layout_system"]["density"] = "dense"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("DENSITY_DIAL_MISMATCH", codes)

    def test_logic_progression_must_be_connected(self) -> None:
        payload = base_payload()
        payload["logic_progression"]["links"].pop()
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("LOGIC_DISCONNECTED", codes)

    def test_message_map_needs_distinct_spine_steps(self) -> None:
        payload = base_payload()
        payload["logic_progression"]["message_step_map"]["because_step_id"] = "LSTEP_CLAIM"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("LOGIC_MESSAGE_MAP", codes)

    def test_compact_route_cannot_drop_the_reasoning_bridge(self) -> None:
        payload = base_payload()
        payload["directions"][0]["logic_route"]["compact_step_ids"] = ["LSTEP_OBS", "LSTEP_ACTION", "LSTEP_UNKNOWN"]
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("LOGIC_ROUTE_BRIDGE", codes)

    def test_benchmark_transfer_requires_a_verified_source(self) -> None:
        payload = base_payload()
        payload["directions"][1]["design_anchor"]["source_ref"] = "unverified reference"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("BENCHMARK_REF", codes)

    def test_compact_mode_cannot_be_scale_only(self) -> None:
        payload = base_payload()
        payload["directions"][0]["layout_system"]["craft_system"]["compact_mode"] = "scale_only"
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("CRAFT_COMPACT_MODE", codes)

    def test_previewed_direction_requires_complete_preflight(self) -> None:
        payload = base_payload("previewed")
        payload["directions"][0]["preflight"]["copy_audited"] = False
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("PREFLIGHT_INCOMPLETE", codes)

    def test_low_anti_default_score_cannot_pass(self) -> None:
        payload = base_payload()
        payload["directions"][0]["critique"] = critique(8.0)
        payload["directions"][0]["critique"]["anti_default"] = 6.0
        payload["directions"][0]["critique"]["weighted_score"] = 7.9
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("ANTI_DEFAULT_VERDICT", codes)

    def test_low_color_logic_score_cannot_pass(self) -> None:
        payload = base_payload()
        payload["directions"][0]["critique"] = critique(8.0)
        payload["directions"][0]["critique"]["color_logic"] = 6.0
        payload["directions"][0]["critique"]["weighted_score"] = 7.8
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("COLOR_VERDICT", codes)

    def test_selected_direction_must_clear_score(self) -> None:
        payload = base_payload("selected")
        payload["directions"][0]["critique"] = critique(7.0)
        codes = {item["code"] for item in VALIDATOR.validate(payload)}
        self.assertIn("SELECTION_SCORE", codes)

    def test_previewed_html_must_bind_declared_items(self) -> None:
        payload = base_payload("previewed")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index, direction in enumerate(payload["directions"], start=1):
                grid = direction["layout_system"]["grid"]
                entry_role = direction["layout_system"]["entry_role"]
                palette_family = direction["layout_system"]["color_system"]["palette_family"]
                palette_strategy = direction["layout_system"]["color_system"]["palette_strategy"]
                palette_preset = direction["layout_system"]["color_system"]["preset_id"]
                claim_level = "2" if entry_role == "evidence" else "1"
                evidence_level = "1" if entry_role == "evidence" else "2"
                mechanism_binding = ' data-binding-ref="BIND_REL_01"' if index != 2 else ""
                hidden_binding = '<i hidden data-binding-ref="BIND_REL_01"></i>' if index == 2 else ""
                evidence = (
                    f'<span data-role="evidence" data-visual-level="{evidence_level}" data-color-role="observed">'
                    '<span data-logic-step-id="LSTEP_OBS" data-binding-ref="BIND_OBS_01">证据</span>'
                    f'<span data-logic-step-id="LSTEP_MECH"{mechanism_binding}>机制</span></span>'
                )
                (root / direction["html_ref"]).write_text(
                    f'<style>.claim{{text-wrap:balance}}[data-binding-ref]{{font-variant-numeric:tabular-nums}}.cuebook-wordmark{{right:41px;bottom:34px;width:136px;height:26px;color:#101411}}</style><main data-cuebook-viewpoint data-width="1340" data-height="528" data-cuebook-visual-contract="launch-v1" data-direction-id="{direction["direction_id"]}" '
                    f'data-design-variance="8" data-visual-density="5" data-layout-grid="{grid}" data-entry-role="{entry_role}" data-color-system="semantic-v1" data-palette-family="{palette_family}" data-palette-strategy="{palette_strategy}" data-palette-preset="{palette_preset}"><h1 class="claim" data-role="claim" data-visual-level="{claim_level}" data-logic-step-id="LSTEP_CLAIM" data-binding-ref="BIND_VIEW_01">观点判断</h1>{evidence}<span data-role="condition" data-visual-level="3" data-logic-step-id="LSTEP_ACTION" data-binding-ref="BIND_ACTION_01">行动</span>{hidden_binding}{WORDMARK}</main>',
                    encoding="utf-8",
                )
                (root / direction["preview_ref"]).write_bytes(b"preview")
                (root / direction["compact_preview_ref"]).write_bytes(b"compact preview")
            codes = {item["code"] for item in VALIDATOR.validate(payload, root)}
            self.assertIn("HTML_BINDING", codes)
            self.assertIn("HTML_BINDING_HIDDEN", codes)


if __name__ == "__main__":
    unittest.main()
