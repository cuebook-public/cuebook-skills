from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "market_view_semantics_validator",
    ROOT / "scripts" / "validate_market_view_semantics.py",
)
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


BENCHMARK_SOURCE = "benchmark://cuebook/market-commentator-archetypes-v1"
BENCHMARK_IDS = ("S1", "X1", "X2_X3", "X4", "X5", "X6", "X7", "X8", "X9", "X10", "X11")
EXPECTED_MOVES = {
    "S1": "bad_news_absorption",
    "X1": "parallel_realities",
    "X2_X3": "category_reframing",
    "X4": "headline_vs_price",
    "X5": "policy_pivot",
    "X6": "capitulation_testimony",
    "X7": "event_crowding_unwind",
    "X8": "feedback_loop_explainer",
    "X9": "technical_meme_warning",
    "X10": "expectation_reset",
    "X11": "proprietary_factor_rotation",
}


def subject(case_id: str, name: str, label: str, subject_type: str) -> dict:
    return {
        "subject_id": f"subject:{case_id}:{name}",
        "label": label,
        "type": subject_type,
        "canonical_id": None,
        "venue": None,
        "source_unit_refs": [f"source:{case_id}"],
    }


def no_posture() -> dict:
    return {"explicitness": "none", "past": None, "now": None, "on_condition": None}


def no_horizon() -> dict:
    return {
        "kind": "unspecified",
        "precision": "none",
        "raw_text": None,
        "start_at": None,
        "end_at": None,
        "duration": None,
        "event_subject_ref": None,
    }


def event_horizon(raw_text: str, event_subject_ref: str) -> dict:
    return {
        "kind": "event_bound",
        "precision": "qualitative",
        "raw_text": raw_text,
        "start_at": None,
        "end_at": None,
        "duration": None,
        "event_subject_ref": event_subject_ref,
    }


def structural_horizon(raw_text: str) -> dict:
    return {
        "kind": "structural",
        "precision": "qualitative",
        "raw_text": raw_text,
        "start_at": None,
        "end_at": None,
        "duration": None,
        "event_subject_ref": None,
    }


def phase(
    action: str,
    claim_refs: list[str],
    *,
    trigger_refs: list[str] | None = None,
    trade_legs: list[dict] | None = None,
    condition_text: str | None = None,
) -> dict:
    return {
        "action": action,
        "claim_refs": claim_refs,
        "trigger_subject_refs": trigger_refs or [],
        "trade_legs": trade_legs or [],
        "condition_text": condition_text,
    }


def trade_leg(subject_ref: str, role: str, direction: str) -> dict:
    return {"subject_ref": subject_ref, "role": role, "direction": direction}


def no_resolution() -> dict:
    return {"explicitness": "none", "criterion": None, "deadline": None}


def causal_link(
    case_id: str,
    number: int,
    source_ref: str,
    target_ref: str,
    relation: str,
    claim_ref: str,
    loop_id: str | None = None,
) -> dict:
    return {
        "link_id": f"link:{case_id}:{number}",
        "from_subject_ref": source_ref,
        "to_subject_ref": target_ref,
        "relation": relation,
        "claim_refs": [claim_ref],
        "certainty": "likely",
        "loop_id": loop_id,
    }


def make_artifact(
    case_id: str,
    author: str,
    primitive: str,
    claim_text: str,
    speech_act: str,
    rhetorical_move: str,
    subjects: list[dict],
    *,
    evidence_basis: str = "reported_source",
    evidence_breadth: str = "instrument",
    certainty: str = "likely",
    completeness: str = "complete",
) -> dict:
    source_id = f"source:{case_id}"
    source_speaker_id = f"speaker:source:{case_id}"
    creator_id = "speaker:current_creator"
    claim_id = f"claim:{case_id}:primary"
    incomplete = completeness != "complete"
    return {
        "schema_version": "market-view-semantics-v1",
        "semantics_id": f"MVSEM_BENCH_{case_id}_20260714",
        "revision": 1,
        "state": "conditional" if incomplete else "ready",
        "lineage": {
            "input_artifact_refs": [f"benchmark:{case_id}"],
            "source_document_refs": [BENCHMARK_SOURCE],
            "compiled_at": "2026-07-14T12:00:00+08:00",
        },
        "speakers": [
            {
                "speaker_id": source_speaker_id,
                "label": author,
                "role": "source_author",
                "source_unit_refs": [source_id],
            },
            {
                "speaker_id": creator_id,
                "label": "Current Cuebook creator",
                "role": "current_creator",
                "source_unit_refs": [],
            },
        ],
        "current_creator_ref": creator_id,
        "source_units": [
            {
                "source_unit_id": source_id,
                "locator": f"{BENCHMARK_SOURCE}#{case_id}",
                "role": "primary_view",
                "primitive": primitive,
                "speaker_ref": source_speaker_id,
                "completeness": completeness,
                "claim_refs": [claim_id],
                "notes": "Benchmark corpus-card paraphrase.",
            }
        ],
        "source_completeness": {
            "overall": "incomplete" if incomplete else "complete",
            "missing_context": ["Source text is truncated."] if incomplete else [],
        },
        "subjects": subjects,
        "claims": [
            {
                "claim_id": claim_id,
                "role": "primary",
                "text": claim_text,
                "source_unit_refs": [source_id],
                "subject_refs": [item["subject_id"] for item in subjects],
                "speech_act": speech_act,
                "rhetorical_move": rhetorical_move,
                "ownership": {
                    "mode": "source_only",
                    "origin_speaker_ref": source_speaker_id,
                    "creator_adoption": "reported",
                    "surface_voice": "source_third_person",
                },
                "certainty": certainty,
                "evidence_scope": {
                    "basis": evidence_basis,
                    "breadth": evidence_breadth,
                    "subject_refs": [item["subject_id"] for item in subjects],
                    "limitations": [],
                },
            }
        ],
        "primary_claim_ref": claim_id,
        "causal_links": [],
        "feedback_loops": [],
        "posture": no_posture(),
        "horizon": no_horizon(),
        "proprietary_signal": None,
        "resolution": no_resolution(),
        "quality_report": {
            "decision": "conditional" if incomplete else "ready",
            "warnings": ["Source unit is truncated; preserve the incomplete boundary."] if incomplete else [],
            "hard_failures": [],
        },
    }


def benchmark_artifacts() -> dict[str, dict]:
    artifacts: dict[str, dict] = {}

    s1_subjects = [
        subject("S1", "btc", "Bitcoin", "crypto_asset"),
        subject("S1", "etf_outflows", "Bitcoin ETF outflows", "flow"),
        subject("S1", "strategy_sales", "Strategy treasury sales", "flow"),
        subject("S1", "seller_exhaustion", "Marginal seller exhaustion", "market_state"),
    ]
    s1 = make_artifact(
        "S1",
        "Salsatekila",
        "flow_positioning",
        "The source treats a price rise after record selling and bad news as evidence that forced sellers were absorbed and dip buying is attractive.",
        "trade_recommendation",
        "bad_news_absorption",
        s1_subjects,
        evidence_basis="multi_source_synthesis",
    )
    s1_claim = s1["primary_claim_ref"]
    s1["posture"] = {
        "explicitness": "implicit",
        "past": None,
        "now": phase(
            "buy_dips",
            [s1_claim],
            trade_legs=[trade_leg("subject:S1:btc", "primary", "buy")],
        ),
        "on_condition": None,
    }
    artifacts["S1"] = s1

    x1_subjects = [
        subject("X1", "stock_trader", "Levered Korean stock trader", "person"),
        subject("X1", "crypto_holder", "ETH holder", "person"),
        subject("X1", "korean_leverage", "Korean equity leverage", "flow"),
        subject("X1", "eth", "Ether", "crypto_asset"),
    ]
    x1 = make_artifact(
        "X1",
        "0xVeryBigOrange",
        "social_sentiment",
        "The source contrasts one levered stock trader's wipeout with one ETH holder's gains as two anecdotal market realities.",
        "market_observation",
        "parallel_realities",
        x1_subjects,
        evidence_basis="reported_source",
        evidence_breadth="cohort",
        certainty="possible",
    )
    x1["claims"][0]["evidence_scope"]["limitations"] = ["Anecdotal contrast; not market-wide evidence."]
    artifacts["X1"] = x1

    x2_subjects = [
        subject("X2_X3", "robinhood_chain", "Robinhood Chain", "technology"),
        subject("X2_X3", "tokenized_securities", "Tokenized stocks and ETFs", "concept"),
        subject("X2_X3", "hood", "Robinhood Markets equity", "equity"),
    ]
    x2 = make_artifact(
        "X2_X3",
        "0xVeryBigOrange",
        "structural_thesis",
        "The source reframes Robinhood Chain from another L2 into onchain securities-market infrastructure with HOOD as the value-capture leg.",
        "category_reframe",
        "category_reframing",
        x2_subjects,
        evidence_basis="reported_source",
        evidence_breadth="structural",
    )
    source_id = "source:X2_X3"
    support_id = "claim:X2_X3:hood"
    x2["claims"].append(
        {
            "claim_id": support_id,
            "role": "supporting",
            "text": "The source expresses a bullish HOOD trade intent as the equity value-capture leg.",
            "source_unit_refs": [source_id],
            "subject_refs": ["subject:X2_X3:hood"],
            "speech_act": "trade_intent",
            "rhetorical_move": "category_reframing",
            "ownership": copy.deepcopy(x2["claims"][0]["ownership"]),
            "certainty": "likely",
            "evidence_scope": {
                "basis": "reported_source",
                "breadth": "instrument",
                "subject_refs": ["subject:X2_X3:hood"],
                "limitations": ["Regulatory and token-holder-rights caveats remain unresolved."],
            },
        }
    )
    x2["source_units"][0]["claim_refs"].append(support_id)
    x2["posture"] = {
        "explicitness": "implicit",
        "past": None,
        "now": phase(
            "long",
            [support_id],
            trade_legs=[trade_leg("subject:X2_X3:hood", "primary", "long")],
        ),
        "on_condition": None,
    }
    x2["horizon"] = structural_horizon("Onchain securities infrastructure adoption")
    artifacts["X2_X3"] = x2

    x4_subjects = [
        subject("X4", "brent", "Brent crude", "commodity"),
        subject("X4", "wti", "WTI crude", "commodity"),
        subject("X4", "spread", "Brent/WTI spread", "metric"),
        subject("X4", "hormuz", "Hormuz escalation", "event"),
    ]
    x4 = make_artifact(
        "X4",
        "Phyrex",
        "market_data",
        "The source reads the modest oil open as muted war pricing and would short Brent if the Brent/WTI spread widens to the stated threshold.",
        "conditional_trade",
        "headline_vs_price",
        x4_subjects,
        evidence_basis="market_data",
        evidence_breadth="cross_asset",
    )
    x4_claim = x4["primary_claim_ref"]
    x4["posture"] = {
        "explicitness": "explicit",
        "past": None,
        "now": None,
        "on_condition": phase(
            "short",
            [x4_claim],
            trigger_refs=["subject:X4:spread"],
            trade_legs=[trade_leg("subject:X4:brent", "primary", "short")],
            condition_text="If the Brent/WTI spread reaches the source's threshold.",
        ),
    }
    x4["horizon"] = event_horizon("If the spread widens enough", "subject:X4:spread")
    x4["resolution"] = {
        "explicitness": "partial",
        "criterion": {
            "text": "Brent/WTI spread reaches the stated threshold.",
            "status": "explicit",
            "claim_refs": [x4_claim],
        },
        "deadline": None,
    }
    artifacts["X4"] = x4

    x5_subjects = [
        subject("X5", "kospi", "Korean equities", "index"),
        subject("X5", "memory", "Memory semiconductor sector", "sector"),
        subject("X5", "leveraged_etfs", "Leveraged ETF liquidation", "flow"),
        subject("X5", "policy_tightening", "Korean leverage-ETF tightening", "policy"),
    ]
    x5 = make_artifact(
        "X5",
        "Leto Bao",
        "flow_positioning",
        "The source expects Korean and memory-sector weakness to persist until policy tightens leveraged ETFs and purges excess leverage.",
        "forecast",
        "policy_pivot",
        x5_subjects,
        evidence_basis="inference",
        evidence_breadth="sector",
    )
    x5["horizon"] = event_horizon("Until Korean policy tightens leveraged ETFs", "subject:X5:policy_tightening")
    x5["causal_links"] = [
        causal_link("X5", 1, "subject:X5:leveraged_etfs", "subject:X5:memory", "amplifies", x5["primary_claim_ref"]),
    ]
    artifacts["X5"] = x5

    x6_subjects = [
        subject("X6", "trader", "Liquidated retail trader", "person"),
        subject("X6", "liquidation", "Personal liquidation", "event"),
        subject("X6", "korean_semis", "Korean semiconductor trade", "sector"),
    ]
    x6 = make_artifact(
        "X6",
        "silverfang88",
        "social_sentiment",
        "The source is a personal loss confession and is preserved as an individual capitulation witness, not a market model.",
        "sentiment_witness",
        "capitulation_testimony",
        x6_subjects,
        evidence_basis="firsthand_witness",
        evidence_breadth="individual",
        certainty="certain",
    )
    x6["claims"][0]["evidence_scope"]["limitations"] = ["One trader cannot establish market breadth."]
    artifacts["X6"] = x6

    x7_subjects = [
        subject("X7", "hynix", "SK Hynix", "equity"),
        subject("X7", "adr_event", "US listing or ADR access event", "event"),
        subject("X7", "pre_event_crowding", "Pre-event crowding", "flow"),
        subject("X7", "event_sellers_exit", "Event-trade seller exhaustion", "event"),
    ]
    x7 = make_artifact(
        "X7",
        "Michael Liu",
        "official_event",
        "The source explains the post-access selloff as a crowded event trade that was bought before the catalyst and unwound when it arrived.",
        "causal_explanation",
        "event_crowding_unwind",
        x7_subjects,
        evidence_basis="reported_source",
        evidence_breadth="instrument",
    )
    x7["horizon"] = event_horizon("After event-trade holders finish exiting", "subject:X7:event_sellers_exit")
    x7["causal_links"] = [
        causal_link("X7", 1, "subject:X7:pre_event_crowding", "subject:X7:event_sellers_exit", "precedes", x7["primary_claim_ref"]),
    ]
    artifacts["X7"] = x7

    x8_subjects = [
        subject("X8", "price_decline", "KOSPI and mega-cap price decline", "market_state"),
        subject("X8", "margin_calls", "Margin calls", "flow"),
        subject("X8", "forced_selling", "Forced selling", "flow"),
        subject("X8", "foreign_outflows", "Foreign investor outflows", "flow"),
    ]
    x8 = make_artifact(
        "X8",
        "pipizhu_eth",
        "flow_positioning",
        "The source declares a reinforcing spiral in which price declines trigger margin calls, forced selling deepens the decline, and foreign outflows add pressure.",
        "causal_explanation",
        "feedback_loop_explainer",
        x8_subjects,
        evidence_basis="multi_source_synthesis",
        evidence_breadth="sector",
    )
    x8_claim = x8["primary_claim_ref"]
    loop_id = "loop:X8:leverage_spiral"
    x8["causal_links"] = [
        causal_link("X8", 1, "subject:X8:price_decline", "subject:X8:margin_calls", "triggers", x8_claim, loop_id),
        causal_link("X8", 2, "subject:X8:margin_calls", "subject:X8:forced_selling", "causes", x8_claim, loop_id),
        causal_link("X8", 3, "subject:X8:forced_selling", "subject:X8:price_decline", "amplifies", x8_claim, loop_id),
        causal_link("X8", 4, "subject:X8:foreign_outflows", "subject:X8:price_decline", "amplifies", x8_claim),
    ]
    x8["feedback_loops"] = [
        {
            "loop_id": loop_id,
            "label": "Price-leverage forced-selling spiral",
            "polarity": "reinforcing",
            "declaration": "explicit",
            "link_refs": ["link:X8:1", "link:X8:2", "link:X8:3"],
            "claim_refs": [x8_claim],
        }
    ]
    artifacts["X8"] = x8

    x9_subjects = [
        subject("X9", "hynix", "SK Hynix", "equity"),
        subject("X9", "key_level", "Watched technical level", "metric"),
        subject("X9", "gap_fill", "Gap-fill risk", "market_state"),
        subject("X9", "levered_traders", "Levered Korean traders", "cohort"),
    ]
    x9 = make_artifact(
        "X9",
        "Citrini",
        "technical_structure",
        "The source uses a technical-analysis joke to warn that failure at a watched level could turn gap-fill risk into a liquidation event.",
        "risk_warning",
        "technical_meme_warning",
        x9_subjects,
        evidence_basis="market_data",
        evidence_breadth="instrument",
        certainty="possible",
    )
    x9["horizon"] = event_horizon("If the watched level fails", "subject:X9:key_level")
    x9["resolution"] = {
        "explicitness": "partial",
        "criterion": {
            "text": "SK Hynix holds or loses the watched technical level.",
            "status": "explicit",
            "claim_refs": [x9["primary_claim_ref"]],
        },
        "deadline": None,
    }
    artifacts["X9"] = x9

    x10_subjects = [
        subject("X10", "hynix", "SK Hynix", "equity"),
        subject("X10", "estimate_cut", "KIS expectation cut", "event"),
        subject("X10", "expectation_gap", "Consensus expectation gap", "metric"),
        subject("X10", "hbm_contracts", "HBM locked-price contracts", "concept"),
        subject("X10", "repricing", "Profit-elasticity repricing", "market_state"),
    ]
    x10 = make_artifact(
        "X10",
        "Wang Buai",
        "sell_side_expectation",
        "The source argues that strong results still triggered a repricing because perfection was embedded and HBM contracts capped upside elasticity.",
        "valuation_judgment",
        "expectation_reset",
        x10_subjects,
        evidence_basis="multi_source_synthesis",
        evidence_breadth="instrument",
    )
    x10["horizon"] = structural_horizon("Long-term HBM contract and margin structure")
    x10["causal_links"] = [
        causal_link("X10", 1, "subject:X10:estimate_cut", "subject:X10:repricing", "triggers", x10["primary_claim_ref"]),
        causal_link("X10", 2, "subject:X10:hbm_contracts", "subject:X10:repricing", "causes", x10["primary_claim_ref"]),
    ]
    artifacts["X10"] = x10

    x11_subjects = [
        subject("X11", "hynix", "SK Hynix", "equity"),
        subject("X11", "mu", "Micron", "equity"),
        subject("X11", "memory_leverage_ratio", "Memory leverage ratio", "signal"),
        subject("X11", "leveraged_etf_volume", "Leveraged ETF trading volume", "metric"),
        subject("X11", "underlying_volume", "Underlying equity trading volume", "metric"),
        subject("X11", "korea_local", "Korea-local market segment", "venue"),
    ]
    x11 = make_artifact(
        "X11",
        "Leto Bao",
        "proprietary_factor",
        "The source reports rotating from SK Hynix to Micron because a proprietary leverage-volume ratio showed a more fragile Korean holder base.",
        "trade_report",
        "proprietary_factor_rotation",
        x11_subjects,
        evidence_basis="proprietary_model",
        evidence_breadth="cross_asset",
        completeness="truncated",
    )
    x11_claim = x11["primary_claim_ref"]
    x11["posture"] = {
        "explicitness": "explicit",
        "past": phase(
            "rotate",
            [x11_claim],
            trade_legs=[
                trade_leg("subject:X11:hynix", "from_leg", "sell"),
                trade_leg("subject:X11:mu", "to_leg", "buy"),
            ],
        ),
        "now": None,
        "on_condition": None,
    }
    x11["proprietary_signal"] = {
        "signal_subject_ref": "subject:X11:memory_leverage_ratio",
        "name": "Memory leverage ratio",
        "replicability": "partial",
        "formula": {
            "operator": "ratio",
            "expression": "leveraged_etf_volume / underlying_equity_volume",
            "output_unit": "ratio",
            "inputs": [
                {
                    "input_id": "input:X11:numerator",
                    "subject_ref": "subject:X11:leveraged_etf_volume",
                    "role": "numerator",
                    "unit": "shares traded",
                    "transformation": None,
                },
                {
                    "input_id": "input:X11:denominator",
                    "subject_ref": "subject:X11:underlying_volume",
                    "role": "denominator",
                    "unit": "shares traded",
                    "transformation": None,
                },
            ],
        },
        "segmentation": ["Korea-local", "global or ADR"],
        "source_unit_refs": ["source:X11"],
        "claim_refs": [x11_claim],
    }
    artifacts["X11"] = x11

    return artifacts


def error_codes(result: dict) -> set[str]:
    return {item["code"] for item in result["errors"]}


class MarketViewSemanticsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.artifacts = benchmark_artifacts()

    def test_schema_is_strict_and_named(self):
        schema = json.loads((ROOT / "references" / "market-view-semantics-v1.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["title"], "MarketViewSemanticsV1")
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["schema_version"]["const"], "market-view-semantics-v1")

    def test_all_eleven_benchmark_archetypes_validate(self):
        self.assertEqual(tuple(self.artifacts), BENCHMARK_IDS)
        self.assertEqual(len(self.artifacts), 11)
        for case_id, payload in self.artifacts.items():
            with self.subTest(case_id=case_id):
                result = VALIDATOR.validate(payload)
                self.assertTrue(result["valid"], result["errors"])
                primary = next(claim for claim in payload["claims"] if claim["claim_id"] == payload["primary_claim_ref"])
                self.assertEqual(primary["rhetorical_move"], EXPECTED_MOVES[case_id])

    def test_source_only_cannot_use_current_creator_first_person(self):
        payload = copy.deepcopy(self.artifacts["S1"])
        payload["claims"][0]["ownership"]["surface_voice"] = "current_creator_first_person"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("SOURCE_ONLY_CREATOR_VOICE", error_codes(result))

    def test_non_trade_speech_act_allows_none_posture(self):
        payload = self.artifacts["X6"]
        self.assertEqual(payload["posture"]["explicitness"], "none")
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])

    def test_trade_speech_act_requires_posture(self):
        payload = copy.deepcopy(self.artifacts["S1"])
        payload["posture"] = no_posture()
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("TRADE_POSTURE_REQUIRED", error_codes(result))

    def test_sentiment_witness_cannot_imply_market_breadth(self):
        payload = copy.deepcopy(self.artifacts["X6"])
        payload["claims"][0]["evidence_scope"]["breadth"] = "market_wide"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("SENTIMENT_BREADTH", error_codes(result))

    def test_cycle_requires_loop_id(self):
        payload = copy.deepcopy(self.artifacts["X8"])
        payload["causal_links"][1]["loop_id"] = None
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("CYCLE_LOOP_ID", error_codes(result))

    def test_declared_loop_must_actually_cycle(self):
        payload = copy.deepcopy(self.artifacts["X8"])
        payload["causal_links"][2]["to_subject_ref"] = "subject:X8:foreign_outflows"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("LOOP_NOT_CYCLIC", error_codes(result))

    def test_explicit_settlement_requires_criterion_and_deadline(self):
        payload = copy.deepcopy(self.artifacts["X4"])
        payload["resolution"]["explicitness"] = "explicit"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("EXPLICIT_SETTLEMENT", error_codes(result))

    def test_explicit_settlement_accepts_both_explicit_fields(self):
        payload = copy.deepcopy(self.artifacts["X4"])
        payload["resolution"] = {
            "explicitness": "explicit",
            "criterion": {
                "text": "Brent official close is below the stated level.",
                "status": "explicit",
                "claim_refs": [payload["primary_claim_ref"]],
            },
            "deadline": {
                "raw_text": "At the 2026-07-17 close",
                "normalized_at": "2026-07-17T16:00:00+01:00",
                "status": "explicit",
                "claim_refs": [payload["primary_claim_ref"]],
            },
        }
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])

    def test_trigger_subject_is_not_silently_a_trade_leg(self):
        conditional = self.artifacts["X4"]["posture"]["on_condition"]
        self.assertEqual(conditional["trigger_subject_refs"], ["subject:X4:spread"])
        self.assertEqual([leg["subject_ref"] for leg in conditional["trade_legs"]], ["subject:X4:brent"])

    def test_on_condition_requires_trigger_subject(self):
        payload = copy.deepcopy(self.artifacts["X4"])
        payload["posture"]["on_condition"]["trigger_subject_refs"] = []
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("CONDITION_TRIGGER", error_codes(result))

    def test_ratio_formula_requires_numerator_and_denominator(self):
        payload = copy.deepcopy(self.artifacts["X11"])
        payload["proprietary_signal"]["formula"]["inputs"][1]["role"] = "term"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("RATIO_INPUTS", error_codes(result))

    def test_truncated_source_stays_incomplete(self):
        payload = self.artifacts["X11"]
        self.assertEqual(payload["source_units"][0]["completeness"], "truncated")
        self.assertEqual(payload["source_completeness"]["overall"], "incomplete")
        result = VALIDATOR.validate(payload)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("SOURCE_INCOMPLETE", {item["code"] for item in result["warnings"]})

    def test_completeness_aggregate_cannot_be_upgraded(self):
        payload = copy.deepcopy(self.artifacts["X11"])
        payload["source_completeness"]["overall"] = "complete"
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("COMPLETENESS_AGGREGATE", error_codes(result))

    def test_event_bound_horizon_requires_event_subject(self):
        payload = copy.deepcopy(self.artifacts["X5"])
        payload["horizon"]["event_subject_ref"] = None
        result = VALIDATOR.validate(payload)
        self.assertFalse(result["valid"])
        self.assertIn("HORIZON_EVENT", error_codes(result))


if __name__ == "__main__":
    unittest.main()
