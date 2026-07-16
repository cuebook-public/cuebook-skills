from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "creator_expression_validator",
    ROOT / "scripts" / "validate_creator_expression_plan.py",
)
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


ARCHETYPES = [
    {
        "id": "S1",
        "engine": "reaction_test",
        "visual_grammar": "reaction_test",
        "argument_grammar": "causal_chain",
        "data_kinds": ["series"],
        "claim": "BTC held firm after a concentrated bad-news cluster, supporting a buy-the-dip setup.",
        "mechanism": "Known forced selling loses impact when the marginal seller is exhausted.",
        "trade_intent": "conditional",
        "action": "Buy BTC dips only if price keeps absorbing the disclosed selling.",
        "direction": "bullish",
        "comparator": None,
        "register": "desk",
    },
    {
        "id": "X1",
        "engine": "parallel_contrast",
        "visual_grammar": "parallel_contrast",
        "argument_grammar": "comparison",
        "data_kinds": ["qualitative"],
        "claim": "Korean equities and spot crypto produced opposite household outcomes during the same market window.",
        "mechanism": "Leverage and asset selection split one macro period into sharply different balance-sheet outcomes.",
        "trade_intent": "none",
        "action": None,
        "direction": "none",
        "comparator": "spot crypto",
        "register": "cinematic",
    },
    {
        "id": "X2_X3",
        "engine": "category_reframe",
        "visual_grammar": "category_reframe",
        "argument_grammar": "comparison",
        "data_kinds": ["qualitative"],
        "claim": "Robinhood Chain is better evaluated as tokenized-market infrastructure than as a generic L2.",
        "mechanism": "Composable tokenized securities could shift value from a product feature to a market-infrastructure layer.",
        "trade_intent": "conditional",
        "action": "Prefer HOOD exposure only if tokenized-stock value capture remains with the company.",
        "direction": "bullish",
        "comparator": "generic L2",
        "register": "explainer",
        "frame": "这不是一条普通新链，而是对代币化市场基础设施的重估。",
    },
    {
        "id": "X4",
        "engine": "reaction_test",
        "visual_grammar": "relative_value_trigger",
        "argument_grammar": "comparison",
        "data_kinds": ["key_numbers"],
        "claim": "The Brent/WTI spread is the cleaner expression when geopolitical headlines outrun the oil open.",
        "mechanism": "Brent carries more direct exposure to the shipping-risk premium than WTI.",
        "trade_intent": "conditional",
        "action": "Short Brent against WTI only after the spread reaches the stated trigger.",
        "direction": "underperform",
        "comparator": "WTI",
        "register": "desk",
    },
    {
        "id": "X5",
        "engine": "forced_flow_loop",
        "visual_grammar": "policy_pivot",
        "argument_grammar": "causal_chain",
        "data_kinds": ["qualitative"],
        "claim": "Korean memory weakness can feed on leverage until policy or flow conditions change.",
        "mechanism": "Falling prices force levered holders to sell, creating another round of price pressure.",
        "trade_intent": "observe_only",
        "action": "Watch for Korean policy tightening and leverage-flow stabilization.",
        "direction": "neutral",
        "comparator": None,
        "register": "strategist",
    },
    {
        "id": "X6",
        "engine": "sentiment_witness",
        "visual_grammar": "sentiment_witness",
        "argument_grammar": "evidence_balance",
        "data_kinds": ["qualitative"],
        "claim": "A liquidation confession is a sentiment witness, not standalone market evidence.",
        "mechanism": "Personal capitulation can reveal holder stress but cannot establish a market turn without corroboration.",
        "trade_intent": "none",
        "action": None,
        "direction": "none",
        "comparator": None,
        "register": "research_memo",
        "authorship_mode": "source_transformation",
    },
    {
        "id": "X7",
        "engine": "event_unwind",
        "visual_grammar": "event_unwind",
        "argument_grammar": "price_timeline",
        "data_kinds": ["qualitative"],
        "claim": "A widely anticipated access event can unwind after pre-event buyers become sellers.",
        "mechanism": "Crowded pre-positioning exhausts the event-day buyer base and creates post-event supply.",
        "trade_intent": "conditional",
        "action": "Wait for event sellers to finish before considering a long.",
        "direction": "bullish",
        "comparator": None,
        "register": "desk",
        "analogy": True,
    },
    {
        "id": "X8",
        "engine": "forced_flow_loop",
        "visual_grammar": "feedback_loop",
        "argument_grammar": "causal_chain",
        "data_kinds": ["qualitative"],
        "claim": "Index concentration, leverage liquidation, and foreign outflows can reinforce one another.",
        "mechanism": "Mega-cap selling weakens the index, triggers forced sales, and further damages confidence.",
        "trade_intent": "none",
        "action": None,
        "direction": "neutral",
        "comparator": None,
        "register": "explainer",
    },
    {
        "id": "X9",
        "engine": "binary_level",
        "visual_grammar": "binary_level",
        "argument_grammar": "price_timeline",
        "data_kinds": ["key_numbers"],
        "claim": "SK Hynix has two near-term paths around one explicit chart level.",
        "mechanism": "A break of the shared focal level can turn chart structure into forced positioning.",
        "trade_intent": "observe_only",
        "action": "Watch the explicit level for a hold or a gap-fill cascade.",
        "direction": "range",
        "comparator": None,
        "register": "meme",
    },
    {
        "id": "X10",
        "engine": "expectation_ladder",
        "visual_grammar": "expectation_gap",
        "argument_grammar": "metric_thesis",
        "data_kinds": ["key_numbers"],
        "claim": "Strong earnings can sell off when expectations require near-perfect upside elasticity.",
        "mechanism": "A small miss against elevated consensus can reset the multiple even while absolute growth remains strong.",
        "trade_intent": "none",
        "action": None,
        "direction": "neutral",
        "comparator": None,
        "register": "explainer",
        "analogy": True,
    },
    {
        "id": "X11",
        "engine": "derived_signal",
        "visual_grammar": "factor_rotation",
        "argument_grammar": "comparison",
        "data_kinds": ["key_numbers"],
        "claim": "A leverage-volume ratio can favor a cleaner memory proxy over the crowded local leg.",
        "mechanism": "High levered-vehicle activity relative to underlying volume signals a fragile holder base.",
        "trade_intent": "explicit",
        "action": "Rotate memory exposure toward MU and away from the more crowded Korean leg.",
        "direction": "outperform",
        "comparator": "SK Hynix",
        "register": "research_memo",
    },
]

EXPECTED_VIEWPOINT_VISUAL_MAP = {
    "S1": "reaction_test",
    "X1": "parallel_contrast",
    "X2_X3": "category_reframe",
    "X4": "relative_value_trigger",
    "X5": "policy_pivot",
    "X6": "sentiment_witness",
    "X7": "event_unwind",
    "X8": "feedback_loop",
    "X9": "binary_level",
    "X10": "expectation_gap",
    "X11": "factor_rotation",
}

PRIMARY_VISUAL_JOB = {
    "S1": "trigger_watch",
    "X1": "relative_comparison",
    "X2_X3": "mechanism_path",
    "X4": "relative_comparison",
    "X5": "cycle_map",
    "X6": "evidence_proof",
    "X7": "trigger_watch",
    "X8": "cycle_map",
    "X9": "scenario_range",
    "X10": "evidence_proof",
    "X11": "relative_comparison",
}

PROOF_VISUAL_JOB = {
    "S1": "trigger_watch",
    "X1": "relative_comparison",
    "X2_X3": "evidence_proof",
    "X4": "relative_comparison",
    "X5": "evidence_proof",
    "X6": "evidence_proof",
    "X7": "trigger_watch",
    "X8": "evidence_proof",
    "X9": "trigger_watch",
    "X10": "evidence_proof",
    "X11": "relative_comparison",
}

SYSTEM_VISUAL_JOB = {
    "S1": "mechanism_path",
    "X1": "mechanism_path",
    "X2_X3": "mechanism_path",
    "X4": "scenario_range",
    "X5": "cycle_map",
    "X6": "mechanism_path",
    "X7": "scenario_range",
    "X8": "cycle_map",
    "X9": "scenario_range",
    "X10": "mechanism_path",
    "X11": "flow_map",
}

EVIDENCE_SHAPE_BY_DATA_KIND = {
    "qualitative": "qualitative_relation",
    "key_numbers": "point_metric",
    "series": "ordered_series",
}

QUERY_ROUTE_BY_REQUEST_CLASS = {
    "qualitative_evidence": ("market_evidence", ["search_assets", "search_news"]),
    "valuation_metric": ("fundamental_metrics", ["search_assets", "list_filings"]),
    "market_series": ("market_series", ["search_assets", "get_candles"]),
}


def archetype(case_id: str) -> dict:
    return next(item for item in ARCHETYPES if item["id"] == case_id)


def make_plan(case: dict) -> dict:
    slug = case["id"].replace("/", "_")
    semantics_ref = f"MVSEM_{slug}_20260714"
    source_ref = f"source:reverse-engineering:{slug}"
    claim_ref = f"CLAIM_{slug}"
    fact_ref = f"FACT_{slug}"
    trade_intent = case["trade_intent"]
    action_kind = VALIDATOR.ACTION_BY_TRADE_INTENT[trade_intent]

    primitives = [
        {
            "id": "P1",
            "kind": case["engine"],
            "purpose": "Carry the source mechanism without changing its claim, direction, or certainty.",
            "semantic_claim_refs": [claim_ref],
            "analogy": None,
        }
    ]
    if case.get("analogy"):
        primitives.append(
            {
                "id": f"P{len(primitives) + 1}",
                "kind": "analogy",
                "purpose": "Use a familiar structure to make the transmission path legible.",
                "semantic_claim_refs": [claim_ref],
                "analogy": {
                    "source_domain": "familiar event structure",
                    "target_domain": "current market setup",
                    "mapping": [
                        {
                            "source_element": "front-run catalyst",
                            "target_element": "pre-positioned market event",
                        }
                    ],
                    "breakpoint": "The analogy stops where market access, holder rights, or liquidity structure differs.",
                },
            }
        )
    if trade_intent != "none":
        primitives.append(
            {
                "id": f"P{len(primitives) + 1}",
                "kind": "decision",
                "purpose": "State only the source-owned action and its existing boundary.",
                "semantic_claim_refs": [claim_ref],
                "analogy": None,
            }
        )
    primitives.append(
        {
            "id": f"P{len(primitives) + 1}",
            "kind": "caveat",
            "purpose": "Keep the limiting condition visible before the close.",
            "semantic_claim_refs": [claim_ref],
            "analogy": None,
        }
    )

    authorship_mode = case.get("authorship_mode", "creator_original")
    if authorship_mode == "source_transformation":
        creator_seed = {"text": None, "preserved": False, "claim_refs": []}
        source_view_owner = {
            "owner_type": "external_creator",
            "owner_ref": "source-author:silverfang88",
            "public_label": "silverfang88",
        }
        idea_delta = "Turn the attributed loss account into a sentiment-only expression without adopting its biography."
        public_attribution_required = True
        public_attribution_line = "Source view by silverfang88; independently analyzed and rewritten."
    else:
        creator_seed = {
            "text": f"Creator seed for {slug}: {case['claim']}",
            "preserved": True,
            "claim_refs": [claim_ref],
        }
        source_view_owner = {
            "owner_type": "current_creator",
            "owner_ref": "creator:current",
            "public_label": "current creator",
        }
        idea_delta = None
        public_attribution_required = False
        public_attribution_line = None

    fingerprint = {
        "source_semantics_sha256": "sha256:" + "a" * 64,
        "canonical_claim": case["claim"],
        "claim_type": "sentiment_evidence" if case["engine"] == "sentiment_witness" else ("relative_view" if case["visual_grammar"] in {"parallel_contrast", "relative_value_trigger", "factor_rotation"} else "explanation"),
        "primary_subject": slug,
        "comparator": case["comparator"],
        "direction": case["direction"],
        "horizon": "near term" if trade_intent != "none" else None,
        "mechanism": case["mechanism"],
        "trade_intent": trade_intent,
        "settlement_intent": "none",
        "action": case["action"],
        "claim_refs": [claim_ref],
        "supporting_fact_refs": [fact_ref],
        "required_caveats": ["Do not exceed the source's evidence, ownership, or action boundary."],
        "creator_owned_experience_refs": [],
        "fingerprint_sha256": "sha256:" + "0" * 64,
    }
    fingerprint["fingerprint_sha256"] = VALIDATOR.calculate_fingerprint_hash(fingerprint)

    action_section = {
        "mode": "omit" if trade_intent == "none" else "include",
        "action_kind": action_kind,
        "purpose": None if trade_intent == "none" else "State the bounded source action without expanding it.",
        "semantic_refs": [] if trade_intent == "none" else [claim_ref],
        "max_characters": 0 if trade_intent == "none" else 100,
        "omission_reason": "source_has_no_trade_intent" if trade_intent == "none" else None,
    }
    data_requirements = [
        {
            "id": f"D{index}",
            "kind": kind,
            "request_class": {"qualitative": "qualitative_evidence", "key_numbers": "valuation_metric", "series": "market_series"}[kind],
            "purpose": f"Supply the {kind.replace('_', ' ')} needed by the primary visual grammar.",
            "required": True,
            "material_to_claim": False,
            "expression_surfaces": ["visual"],
            "status": "available",
            "fact_refs": [fact_ref],
            "source_refs": [source_ref],
        }
        for index, kind in enumerate(case["data_kinds"], start=1)
    ]

    plan = {
        "schema_version": "creator-expression-plan-v1",
        "plan_id": f"CEXP_{slug}_EXPRESSION_20260714",
        "revision": 1,
        "state": "ready",
        "lineage": {
            "input_artifact_refs": [semantics_ref],
            "market_view_semantics_ref": semantics_ref,
            "research_pack_ref": None,
            "trading_thesis_ref": None,
            "trade_logic_profile_ref": None,
            "profile_ref": None,
            "source_refs": [source_ref],
            "decision_cutoff_at": "2026-07-14T08:27:00Z",
        },
        "meaning_fingerprint": fingerprint,
        "semantic_lock": {
            "locked": True,
            "authorship_locked": True,
            "fingerprint_sha256": fingerprint["fingerprint_sha256"],
            "allowed_transformations": ["compress", "reorder", "translate", "format", "visualize"],
            "forbidden_transformations": [
                "change_claim",
                "change_direction",
                "change_horizon",
                "add_trade",
                "add_settlement",
                "remove_caveat",
                "upgrade_certainty",
                "reassign_authorship",
            ],
            "downstream_verification_required": True,
        },
        "authorship_assistance": {
            "mode": authorship_mode,
            "creator_seed": creator_seed,
            "source_view_owner": source_view_owner,
            "cuebook_additions": [],
            "creator_accepted_addition_ids": [],
            "creator_rejected_addition_ids": [],
            "idea_delta": idea_delta,
            "public_attribution_required": public_attribution_required,
            "public_attribution_line": public_attribution_line,
        },
        "narrative": {
            "primary_engine": case["visual_grammar"],
            "frame": case.get("frame", case["claim"]),
            "primitives": primitives,
        },
        "voice_spec": {
            "language": "en",
            "register": case["register"],
            "energy": 3,
            "conviction": 3,
            "technicality": 3,
            "emotionality": 2 if case["engine"] != "parallel_contrast" else 4,
            "compression": 4,
            "sentence_rhythm": "mixed",
            "humor": "meme" if case["engine"] == "binary_level" else "none",
            "first_person_stance": "avoid" if authorship_mode == "source_transformation" else "allowed",
            "first_person_experience": "forbidden",
            "technical_terms": "define_once",
            "rhetorical_devices": ["analogy"] if case.get("analogy") else (["contrast"] if case["engine"] in {"parallel_contrast", "category_reframe"} else []),
            "profile_rule_refs": [],
            "anti_ai_language": {
                "enabled": True,
                "banned_stock_phrases": ["值得关注的是", "核心逻辑在于", "从机制上看"],
                "max_not_a_but_b_frames": 1,
                "repeated_openings_allowed": False,
            },
        },
        "data_requirements": data_requirements,
        "text_blueprint": {
            "format": "channel_neutral",
            "public_tags": ["market structure", "causal path"],
            "max_total_characters": 900,
            "data_requirement_refs": [],
            "hook": {
                "mode": "include",
                "purpose": "Open with the decision-driving tension.",
                "semantic_refs": [claim_ref],
                "max_characters": 80,
                "omission_reason": None,
            },
            "proof": {
                "mode": "include",
                "purpose": "Present the source-linked fact on its stated basis.",
                "semantic_refs": [fact_ref],
                "max_characters": 160,
                "omission_reason": None,
            },
            "mechanism": {
                "mode": "include",
                "purpose": "Connect the fact to the preserved market mechanism.",
                "semantic_refs": [claim_ref],
                "max_characters": 180,
                "omission_reason": None,
            },
            "action": action_section,
            "caveat": {
                "mode": "include",
                "purpose": "State the source limit before the close.",
                "semantic_refs": [claim_ref],
                "max_characters": 100,
                "omission_reason": None,
            },
            "close": {
                "mode": "include",
                "purpose": "Return to the claim without adding a recommendation.",
                "semantic_refs": [claim_ref],
                "max_characters": 80,
                "omission_reason": None,
            },
        },
        "visual_plan": {
            "intent": {
                "job": PRIMARY_VISUAL_JOB[case["id"]],
                "reader_question": "What is the decision-driving market judgment?",
                "primary_message": case["claim"],
                "reader_takeaway": "See the mechanism and its limiting condition on one screen.",
                "candidate_jobs": [
                    {
                        "family": "fast_read",
                        "job": "conviction_snapshot",
                        "reader_question": "What does the creator believe?",
                        "evidence_shapes": ["creator_judgment"],
                        "requirement_refs": [],
                    },
                    {
                        "family": "proof",
                        "job": PROOF_VISUAL_JOB[case["id"]],
                        "reader_question": "What is the strongest sourced proof?",
                        "evidence_shapes": list(dict.fromkeys(EVIDENCE_SHAPE_BY_DATA_KIND[kind] for kind in case["data_kinds"])),
                        "requirement_refs": [item["id"] for item in data_requirements],
                    },
                    {
                        "family": "system",
                        "job": SYSTEM_VISUAL_JOB[case["id"]],
                        "reader_question": "How does the market mechanism unfold?",
                        "evidence_shapes": ["qualitative_relation"],
                        "requirement_refs": [],
                    },
                ],
                "target_evidence_shapes": list(
                    dict.fromkeys(
                        ["creator_judgment"]
                        + [EVIDENCE_SHAPE_BY_DATA_KIND[kind] for kind in case["data_kinds"]]
                        + ["qualitative_relation"]
                    )
                ),
            },
            "grammar": {
                "primary": case["visual_grammar"],
                "alternatives": [],
                "argument_grammar": case.get("argument_grammar"),
                "rationale": "The grammar matches the source's decision structure and available data.",
            },
            "data_requirement_refs": [item["id"] for item in data_requirements],
            "execution_route": {
                "route_registry_ref": "visual-intent-route-registry-v1",
                "route_registry_sha256": VALIDATOR.VISUAL_ROUTE_REGISTRY_SHA256,
                "route_id": "viewpoint_static",
                "query_requests": [
                    {
                        "requirement_ref": item["id"],
                        "capability_id": QUERY_ROUTE_BY_REQUEST_CLASS[item["request_class"]][0],
                        "tool_ids": QUERY_ROUTE_BY_REQUEST_CLASS[item["request_class"]][1],
                        "run_policy": "reuse_or_query_gap",
                    }
                    for item in data_requirements
                ],
                "skill_path_ids": [
                    "query-cuebook",
                    "assemble-cuebook-viewpoint-data",
                    "direct-cuebook-viewpoint-visual",
                    "render-cuebook-viewpoint-visual",
                ],
                "primary_renderer_skill_id": "render-cuebook-viewpoint-visual",
                "detail_renderer_skill_id": None,
                "resume_policy": "resume_from_latest_valid_artifact",
                "route_sha256": "sha256:" + "0" * 64,
            },
            "fallback": {
                "trigger": "none",
                "strategy": "none",
                "applies_to_requirement_refs": [],
                "preserves_fingerprint": True,
                "prohibited_substitutions": [
                    "invent_metric",
                    "proxy_without_bridge",
                    "anecdote_as_market_fact",
                    "decorative_chart",
                ],
            },
            "image_text_budget": {
                "unit": "characters",
                "title_max": 30,
                "subtitle_max": 72,
                "node_label_max": 24,
                "callout_max": 44,
                "source_line_max": 100,
                "max_nodes": 6,
                "max_callouts": 3,
                "total_max": 260,
            },
        },
        "settlement_eligibility": {
            "status": "ineligible",
            "reason_codes": ["source_intent_absent"],
            "claim_ref": None,
            "requirements": {
                "metric": False,
                "operator": False,
                "threshold": False,
                "deadline": False,
                "authoritative_source": False,
            },
            "missing_requirements": [],
            "downstream_route": None,
        },
        "source_style_firewall": {
            "source_attribution_required": True,
            "factual_claims_require_refs": True,
            "fact_interpretation_separated": True,
            "anecdote_policy": "sentiment_only" if case["engine"] == "sentiment_witness" else "not_present",
            "unverified_anecdote_as_proof": False,
            "first_person_experience": {
                "mode": "forbid",
                "allowed_claim_refs": [],
            },
            "living_creator_imitation": False,
            "signature_phrasing_reuse": False,
            "sentence_sequence_copy": False,
            "identity_impersonation": False,
            "original_composition_required": True,
            "max_verbatim_words": 12,
            "public_backend_terms_allowed": False,
        },
        "quality_report": {
            "decision": "ready",
            "warnings": [],
            "hard_failures": [],
        },
    }
    plan["visual_plan"]["execution_route"]["route_sha256"] = VALIDATOR.calculate_visual_route_hash(plan["visual_plan"])
    return plan


def refresh_fingerprint(plan: dict) -> None:
    fingerprint = plan["meaning_fingerprint"]
    fingerprint["fingerprint_sha256"] = VALIDATOR.calculate_fingerprint_hash(fingerprint)
    plan["semantic_lock"]["fingerprint_sha256"] = fingerprint["fingerprint_sha256"]


def refresh_visual_route(plan: dict) -> None:
    plan["visual_plan"]["execution_route"]["route_sha256"] = VALIDATOR.calculate_visual_route_hash(plan["visual_plan"])


def result_codes(result: dict) -> set[str]:
    return {item["code"] for item in result["errors"]}


class CreatorExpressionPlanTests(unittest.TestCase):
    def test_schema_declares_authorship_and_all_primitives(self):
        schema = json.loads((ROOT / "references" / "creator-expression-plan-v1.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["title"], "CreatorExpressionPlanV1")
        self.assertIn("authorship_assistance", schema["required"])
        primitive_values = set(schema["$defs"]["primitiveKind"]["enum"])
        self.assertEqual(primitive_values, VALIDATOR.PRIMITIVE_KINDS)
        visual_values = set(schema["$defs"]["viewpointVisualGrammar"]["enum"])
        self.assertEqual(visual_values, set(EXPECTED_VIEWPOINT_VISUAL_MAP.values()))
        self.assertEqual(set(schema["$defs"]["dataRequirement"]["properties"]["kind"]["enum"]), {"qualitative", "key_numbers", "series"})
        self.assertIn("data_requirements", schema["required"])
        self.assertIn("expression_surfaces", schema["$defs"]["dataRequirement"]["required"])
        fallback_values = set(schema["properties"]["visual_plan"]["properties"]["fallback"]["properties"]["strategy"]["enum"])
        self.assertTrue({"qualitative", "key_numbers", "series"}.issubset(fallback_values))
        self.assertIn("execution_route", schema["properties"]["visual_plan"]["required"])
        registry = json.loads((ROOT / "references" / "visual-intent-route-registry-v1.json").read_text(encoding="utf-8"))
        self.assertEqual(registry["schema_version"], "visual-intent-route-registry-v1")
        self.assertEqual(registry, VALIDATOR.VISUAL_ROUTE_REGISTRY)
        self.assertEqual({item["route_id"] for item in registry["routes"]}, set(VALIDATOR.VISUAL_ROUTE_SPECS))
        self.assertEqual(set(registry["evidence_shapes"]), VALIDATOR.EVIDENCE_SHAPES)
        self.assertEqual(
            {item["capability_id"]: set(item["tool_ids"]) for item in registry["query_capabilities"]},
            VALIDATOR.QUERY_CAPABILITY_TOOLS,
        )
        self.assertEqual(
            {item["capability_id"]: set(item["request_classes"]) for item in registry["query_capabilities"]},
            VALIDATOR.QUERY_CAPABILITY_REQUEST_CLASSES,
        )
        self.assertEqual(set(schema["$defs"]["visualCandidateJob"]["enum"]), VALIDATOR.VISUAL_CANDIDATE_JOBS)
        self.assertEqual(set(schema["$defs"]["evidenceShape"]["enum"]), VALIDATOR.EVIDENCE_SHAPES)
        direction_registry = json.loads(
            (ROOT.parent / "direct-cuebook-viewpoint-visual" / "references" / "viewpoint-expression-registry-v1.json").read_text(encoding="utf-8")
        )
        jobs_by_family = {
            family: {item["job_id"] for item in direction_registry["candidate_jobs"] if item["family"] == family}
            for family in registry["candidate_families"]
        }
        self.assertEqual(jobs_by_family, {family: set(jobs) for family, jobs in registry["candidate_families"].items()})
        self.assertEqual(set(direction_registry["evidence_shapes"]), set(registry["evidence_shapes"]))

    def test_all_11_reverse_engineered_archetypes_validate(self):
        self.assertEqual(len(ARCHETYPES), 11)
        covered_primitives: set[str] = set()
        for case in ARCHETYPES:
            with self.subTest(corpus_card=case["id"]):
                plan = make_plan(case)
                result = VALIDATOR.validate(plan)
                self.assertTrue(result["valid"], result["errors"])
                self.assertEqual(plan["visual_plan"]["grammar"]["primary"], EXPECTED_VIEWPOINT_VISUAL_MAP[case["id"]])
                self.assertEqual(plan["narrative"]["primary_engine"], plan["visual_plan"]["grammar"]["primary"])
                covered_primitives.update(item["kind"] for item in plan["narrative"]["primitives"])
        self.assertEqual(covered_primitives, VALIDATOR.PRIMITIVE_KINDS)

    def test_argument_grammar_is_optional_and_cannot_replace_unified_engine(self):
        plan = make_plan(archetype("X4"))
        del plan["visual_plan"]["grammar"]["argument_grammar"]
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])

        broken = copy.deepcopy(plan)
        broken["visual_plan"]["grammar"]["primary"] = "comparison"
        result = VALIDATOR.validate(broken)
        self.assertIn("VISUAL_GRAMMAR", result_codes(result))

        mismatched = copy.deepcopy(plan)
        mismatched["visual_plan"]["grammar"]["primary"] = "reaction_test"
        result = VALIDATOR.validate(mismatched)
        self.assertIn("TEXT_VISUAL_ENGINE_MISMATCH", result_codes(result))

    def test_semantic_lock_rejects_fingerprint_mutation(self):
        plan = make_plan(archetype("S1"))
        plan["meaning_fingerprint"]["canonical_claim"] = "A different claim."
        result = VALIDATOR.validate(plan)
        self.assertIn("FINGERPRINT_HASH_MISMATCH", result_codes(result))

    def test_no_trade_sentiment_case_cannot_gain_action_or_settlement(self):
        plan = make_plan(archetype("X6"))
        plan["text_blueprint"]["action"] = {
            "mode": "include",
            "action_kind": "trade",
            "purpose": "Buy the asset.",
            "semantic_refs": ["CLAIM_X6"],
            "max_characters": 60,
            "omission_reason": None,
        }
        plan["narrative"]["primitives"].insert(
            -1,
            {
                "id": "P3",
                "kind": "decision",
                "purpose": "Add a buy decision.",
                "semantic_claim_refs": ["CLAIM_X6"],
                "analogy": None,
            },
        )
        plan["settlement_eligibility"].update(
            {
                "status": "candidate",
                "reason_codes": ["directional_view"],
                "downstream_route": "compile-cuebook-settlement-claim",
            }
        )
        result = VALIDATOR.validate(plan)
        codes = result_codes(result)
        self.assertIn("NO_TRADE_ACTION", codes)
        self.assertIn("SOURCE_TRADE_ABSENT", codes)
        self.assertIn("NO_SETTLEMENT", codes)

    def test_source_transformation_cannot_relabel_external_trade(self):
        plan = make_plan(archetype("X6"))
        plan["meaning_fingerprint"].update(
            {
                "trade_intent": "explicit",
                "action": "Buy the market.",
            }
        )
        refresh_fingerprint(plan)
        result = VALIDATOR.validate(plan)
        self.assertIn("SOURCE_OWNER_RELABEL", result_codes(result))

    def test_analogy_requires_mapping_and_breakpoint(self):
        plan = make_plan(archetype("X7"))
        analogy = next(item for item in plan["narrative"]["primitives"] if item["kind"] == "analogy")
        analogy["analogy"]["mapping"] = []
        analogy["analogy"]["breakpoint"] = ""
        result = VALIDATOR.validate(plan)
        codes = result_codes(result)
        self.assertIn("ANALOGY_MAPPING", codes)
        self.assertIn("ANALOGY_FIELD", codes)

    def test_public_tags_require_two_to_four_and_ban_backend_terms(self):
        plan = make_plan(archetype("S1"))
        plan["text_blueprint"]["public_tags"] = ["observed"]
        result = VALIDATOR.validate(plan)
        codes = result_codes(result)
        self.assertIn("STRING_MIN", codes)
        self.assertIn("PUBLIC_BACKEND_TERM", codes)

    def test_image_text_budget_is_hard_capped(self):
        plan = make_plan(archetype("X10"))
        plan["visual_plan"]["image_text_budget"]["title_max"] = 49
        plan["visual_plan"]["image_text_budget"]["total_max"] = 321
        result = VALIDATOR.validate(plan)
        self.assertGreaterEqual(sum(item["code"] == "INTEGER_RANGE" for item in result["errors"]), 2)

    def test_missing_visual_data_uses_meaning_preserving_fallback(self):
        plan = make_plan(archetype("S1"))
        for requirement in plan["data_requirements"]:
            requirement.update({"status": "missing", "fact_refs": [], "source_refs": []})
        plan["data_requirements"].append(
            {
                "id": "D2",
                "kind": "qualitative",
                "request_class": "qualitative_evidence",
                "purpose": "Use the source-linked event sequence when the series is unavailable.",
                "required": False,
                "material_to_claim": False,
                "expression_surfaces": ["visual"],
                "status": "available",
                "fact_refs": ["FACT_S1"],
                "source_refs": ["source:reverse-engineering:S1"],
            }
        )
        plan["visual_plan"]["data_requirement_refs"].append("D2")
        plan["visual_plan"]["execution_route"]["query_requests"].append(
            {
                "requirement_ref": "D2",
                "capability_id": "market_evidence",
                "tool_ids": ["search_assets", "search_news"],
                "run_policy": "reuse_or_query_gap",
            }
        )
        refresh_visual_route(plan)
        plan["visual_plan"]["fallback"].update(
            {
                "trigger": "missing_required_data",
                "strategy": "qualitative",
                "applies_to_requirement_refs": ["D1"],
            }
        )
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])

    def test_material_creator_premise_cannot_disappear_into_fallback(self):
        plan = make_plan(archetype("S1"))
        requirement = plan["data_requirements"][0]
        requirement.update(
            {
                "kind": "qualitative",
                "request_class": "news_anchor",
                "material_to_claim": True,
                "status": "missing",
                "fact_refs": [],
                "source_refs": [],
            }
        )
        plan["data_requirements"].append(
            {
                "id": "D2",
                "kind": "qualitative",
                "request_class": "qualitative_evidence",
                "purpose": "Retain only the unsupported creator judgment as an internal preview.",
                "required": False,
                "material_to_claim": False,
                "expression_surfaces": ["visual"],
                "status": "available",
                "fact_refs": ["FACT_S1"],
                "source_refs": ["source:reverse-engineering:S1"],
            }
        )
        plan["visual_plan"]["data_requirement_refs"].append("D2")
        plan["visual_plan"]["fallback"].update(
            {
                "trigger": "missing_required_data",
                "strategy": "qualitative",
                "applies_to_requirement_refs": ["D1"],
            }
        )
        result = VALIDATOR.validate(plan)
        codes = result_codes(result)
        self.assertIn("MATERIAL_REQUEST_FALLBACK", codes)
        self.assertIn("MATERIAL_REQUEST_STATE", codes)

    def test_missing_material_news_can_only_be_recorded_as_blocked(self):
        plan = make_plan(archetype("S1"))
        plan["data_requirements"][0].update(
            {
                "kind": "qualitative",
                "request_class": "news_anchor",
                "material_to_claim": True,
                "status": "missing",
                "fact_refs": [],
                "source_refs": [],
            }
        )
        plan["visual_plan"]["execution_route"]["query_requests"][0].update(
            {
                "capability_id": "market_evidence",
                "tool_ids": ["search_assets", "search_news"],
            }
        )
        for candidate in plan["visual_plan"]["intent"]["candidate_jobs"]:
            candidate["requirement_refs"] = ["D1"]
        refresh_visual_route(plan)
        plan["state"] = "blocked"
        plan["quality_report"] = {
            "decision": "blocked",
            "warnings": [],
            "hard_failures": ["material_news_anchor_missing"],
        }
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])

    def test_all_nondegradable_material_classes_reject_fallback(self):
        request_kinds = {
            "news_anchor": "qualitative",
            "valuation_metric": "key_numbers",
            "comparison_metric": "key_numbers",
            "price_level": "key_numbers",
            "settlement_reference": "qualitative",
        }
        for request_class, kind in request_kinds.items():
            with self.subTest(request_class=request_class):
                plan = make_plan(archetype("S1"))
                plan["data_requirements"][0].update(
                    {
                        "kind": kind,
                        "request_class": request_class,
                        "material_to_claim": True,
                        "status": "missing",
                        "fact_refs": [],
                        "source_refs": [],
                    }
                )
                plan["data_requirements"].append(
                    {
                        "id": "D2",
                        "kind": "qualitative",
                        "request_class": "qualitative_evidence",
                        "purpose": "Supply an optional qualitative preview.",
                        "required": False,
                        "material_to_claim": False,
                        "expression_surfaces": ["visual"],
                        "status": "available",
                        "fact_refs": ["FACT_S1"],
                        "source_refs": ["source:reverse-engineering:S1"],
                    }
                )
                plan["visual_plan"]["data_requirement_refs"].append("D2")
                plan["visual_plan"]["fallback"].update(
                    {
                        "trigger": "missing_required_data",
                        "strategy": "qualitative",
                        "applies_to_requirement_refs": ["D1"],
                    }
                )
                result = VALIDATOR.validate(plan)
                self.assertIn("MATERIAL_REQUEST_FALLBACK", result_codes(result))
                self.assertIn("MATERIAL_REQUEST_STATE", result_codes(result))

    def test_text_only_material_premise_is_first_class(self):
        plan = make_plan(archetype("S1"))
        plan["data_requirements"][0].update(
            {
                "kind": "qualitative",
                "request_class": "news_anchor",
                "purpose": "Name the creator's source-linked catalyst in text without forcing it into the visual.",
                "material_to_claim": True,
                "expression_surfaces": ["text"],
            }
        )
        plan["text_blueprint"]["data_requirement_refs"] = ["D1"]
        plan["visual_plan"]["data_requirement_refs"] = []
        plan["visual_plan"]["execution_route"]["query_requests"] = []
        for candidate in plan["visual_plan"]["intent"]["candidate_jobs"]:
            candidate["requirement_refs"] = []
        plan["visual_plan"]["intent"]["candidate_jobs"][1]["evidence_shapes"] = ["creator_judgment"]
        plan["visual_plan"]["intent"]["target_evidence_shapes"] = ["creator_judgment", "qualitative_relation"]
        refresh_visual_route(plan)
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(plan["visual_plan"]["data_requirement_refs"], [])

    def test_visual_intent_locks_three_jobs_tools_and_resume_path(self):
        plan = make_plan(archetype("X11"))
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])
        intent = plan["visual_plan"]["intent"]
        self.assertEqual({item["family"] for item in intent["candidate_jobs"]}, {"fast_read", "proof", "system"})
        self.assertIn(intent["job"], {item["job"] for item in intent["candidate_jobs"]})
        route = plan["visual_plan"]["execution_route"]
        self.assertEqual(route["skill_path_ids"], VALIDATOR.VISUAL_ROUTE_SPECS["viewpoint_static"]["skill_path_ids"])
        self.assertEqual(route["resume_policy"], "resume_from_latest_valid_artifact")

    def test_visual_query_route_requires_exact_requirement_coverage_and_tool(self):
        plan = make_plan(archetype("S1"))
        plan["visual_plan"]["execution_route"]["query_requests"] = []
        result = VALIDATOR.validate(plan)
        self.assertIn("VISUAL_QUERY_REQUIREMENT_COVERAGE", result_codes(result))

        plan = make_plan(archetype("S1"))
        plan["visual_plan"]["execution_route"]["query_requests"][0]["tool_ids"] = ["search_assets", "get_market_state"]
        refresh_visual_route(plan)
        result = VALIDATOR.validate(plan)
        self.assertIn("VISUAL_QUERY_TOOLS", result_codes(result))

    def test_visual_intent_route_hash_detects_downstream_reclassification(self):
        plan = make_plan(archetype("X2_X3"))
        plan["visual_plan"]["intent"]["candidate_jobs"][2]["job"] = "cycle_map"
        result = VALIDATOR.validate(plan)
        self.assertIn("VISUAL_ROUTE_HASH", result_codes(result))

    def test_ohlcv_evidence_requires_thesis_chart_detail_route(self):
        plan = make_plan(archetype("S1"))
        plan["visual_plan"]["intent"]["candidate_jobs"][1]["evidence_shapes"] = ["ohlcv_series"]
        plan["visual_plan"]["intent"]["target_evidence_shapes"] = ["creator_judgment", "ohlcv_series", "qualitative_relation"]
        refresh_visual_route(plan)
        result = VALIDATOR.validate(plan)
        self.assertIn("OHLCV_RENDERER_ROUTE", result_codes(result))

        plan["visual_plan"]["execution_route"].update(
            {
                "route_id": "viewpoint_static_plus_thesis_chart",
                "skill_path_ids": VALIDATOR.VISUAL_ROUTE_SPECS["viewpoint_static_plus_thesis_chart"]["skill_path_ids"],
                "detail_renderer_skill_id": "render-cuebook-thesis-chart",
            }
        )
        refresh_visual_route(plan)
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])

    def test_request_class_rejects_incompatible_data_mode(self):
        plan = make_plan(archetype("S1"))
        plan["data_requirements"][0].update(
            {"kind": "qualitative", "request_class": "valuation_metric"}
        )
        result = VALIDATOR.validate(plan)
        self.assertIn("REQUEST_CLASS_KIND", result_codes(result))

    def test_invented_first_person_experience_is_rejected(self):
        plan = make_plan(archetype("X11"))
        plan["narrative"]["frame"] = "I rotated my portfolio after I saw this ratio spike."
        result = VALIDATOR.validate(plan)
        self.assertIn("INVENTED_FIRST_PERSON_EXPERIENCE", result_codes(result))

    def test_cuebook_assisted_contract_records_all_addition_decisions(self):
        plan = make_plan(archetype("S1"))
        authorship = plan["authorship_assistance"]
        authorship.update(
            {
                "mode": "cuebook_assisted",
                "cuebook_additions": [
                    {"id": "CA1", "kind": "evidence", "summary": "Added the dated selling evidence.", "support_refs": ["FACT_S1"]},
                    {"id": "CA2", "kind": "connection", "summary": "Connected absorption to seller exhaustion.", "support_refs": ["CLAIM_S1"]},
                    {"id": "CA3", "kind": "countercase", "summary": "Added the risk that demand fades.", "support_refs": ["FACT_S1"]},
                    {"id": "CA4", "kind": "rule", "summary": "Kept action behind the source trigger.", "support_refs": ["CLAIM_S1"]},
                ],
                "creator_accepted_addition_ids": ["CA1", "CA2", "CA4"],
                "creator_rejected_addition_ids": ["CA3"],
                "idea_delta": "The seed became a bounded trade idea with evidence, a causal bridge, and a retained trigger.",
                "public_attribution_required": False,
                "public_attribution_line": None,
            }
        )
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual({item["kind"] for item in authorship["cuebook_additions"]}, {"evidence", "connection", "countercase", "rule"})

        public_attribution = copy.deepcopy(plan)
        public_attribution["authorship_assistance"].update({
            "public_attribution_required": True,
            "public_attribution_line": "Cuebook 帮我完善了交易想法。",
        })
        result = VALIDATOR.validate(public_attribution)
        self.assertIn("CUEBOOK_ASSISTANCE_INTERNAL", result_codes(result))

        public_narration = copy.deepcopy(plan)
        public_narration["narrative"]["frame"] = "Cuebook 帮我补全了这笔交易。"
        result = VALIDATOR.validate(public_narration)
        self.assertIn("PUBLIC_CUEBOOK_NARRATION", result_codes(result))

        source_label = copy.deepcopy(plan)
        source_label["narrative"]["frame"] = "数据来源：Cuebook；交易判断仍由创作者提出。"
        result = VALIDATOR.validate(source_label)
        self.assertTrue(result["valid"], result["errors"])

        broken = copy.deepcopy(plan)
        broken["authorship_assistance"]["creator_rejected_addition_ids"] = []
        result = VALIDATOR.validate(broken)
        self.assertIn("ADDITION_DECISION_COVERAGE", result_codes(result))

    def test_anti_ai_language_bans_stock_phrases_and_repeated_reframe(self):
        plan = make_plan(archetype("S1"))
        plan["narrative"]["frame"] = "值得关注的是，这不是价格噪音而是结构变化。"
        plan["visual_plan"]["intent"]["primary_message"] = "这不是短期波动而是长期重估。"
        result = VALIDATOR.validate(plan)
        codes = result_codes(result)
        self.assertIn("AI_STOCK_PHRASE", codes)
        self.assertIn("REPEATED_NOT_A_BUT_B", codes)

    def test_settlement_candidate_is_routed_without_invention(self):
        plan = make_plan(archetype("S1"))
        plan["meaning_fingerprint"]["settlement_intent"] = "candidate"
        refresh_fingerprint(plan)
        plan["settlement_eligibility"] = {
            "status": "candidate",
            "reason_codes": ["source_requests_measurable_followup"],
            "claim_ref": None,
            "requirements": {
                "metric": True,
                "operator": True,
                "threshold": False,
                "deadline": False,
                "authoritative_source": True,
            },
            "missing_requirements": ["threshold", "deadline"],
            "downstream_route": "compile-cuebook-settlement-claim",
        }
        result = VALIDATOR.validate(plan)
        self.assertTrue(result["valid"], result["errors"])


if __name__ == "__main__":
    unittest.main()
