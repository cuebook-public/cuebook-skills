#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_research_pack import validate  # noqa: E402


def base_pack() -> dict:
    return {
        "schema_version": "research-pack-v1",
        "brief": {
            "subject": "Example Corp Q2 earnings",
            "assets": ["EXM"],
            "question": "Did the quarter change the earnings path?",
            "decision_use": "investment_research",
            "horizon": "next two quarters",
            "as_of": "2026-07-14T12:00:00+00:00",
            "freshness_window": "24h",
        },
        "source_register": [
            {
                "id": "S1",
                "title": "Example Corp reports second-quarter 2026 results",
                "url": "https://example.com/ir/q2-results",
                "publisher": "Example Corp",
                "source_type": "company_release",
                "published_at": "2026-07-14T10:00:00+00:00",
                "observed_at": "2026-07-14T10:05:00+00:00",
                "access": "public",
                "fact_refs": ["F1", "F5"],
            },
            {
                "id": "S2",
                "url": "https://consensus.example.com/exm",
                "publisher": "Consensus Data",
                "source_type": "consensus_data",
                "published_at": None,
                "observed_at": "2026-07-14T09:55:00+00:00",
                "access": "authorized",
            },
            {
                "id": "S3",
                "url": "https://market.example.com/exm",
                "publisher": "Market Data",
                "source_type": "market_data",
                "published_at": None,
                "observed_at": "2026-07-14T11:00:00+00:00",
                "access": "authorized",
            },
        ],
        "fact_ledger": [
            {
                "id": "F1",
                "claim": "Q2 revenue was 105 million dollars.",
                "evidence_class": "source",
                "source_ids": ["S1"],
                "as_of": "2026-07-14T10:00:00+00:00",
                "freshness": "current",
                "confidence": "high",
                "basis": "reported GAAP",
                "period": "Q2 2026",
            },
            {
                "id": "F2",
                "claim": "Revenue consensus was 100 million dollars.",
                "evidence_class": "source",
                "source_ids": ["S2"],
                "as_of": "2026-07-14T09:55:00+00:00",
                "freshness": "current",
                "confidence": "high",
                "basis": "consensus",
                "period": "Q2 2026",
            },
            {
                "id": "F3",
                "claim": "Shares rose 4 percent in the event window.",
                "evidence_class": "verified-live",
                "source_ids": ["S3"],
                "as_of": "2026-07-14T11:00:00+00:00",
                "freshness": "current",
                "confidence": "high",
                "basis": "close-to-11:00 ET",
                "period": "event window",
            },
            {
                "id": "F4",
                "claim": "The revenue result cleared the published bar.",
                "evidence_class": "derived",
                "source_ids": ["S1", "S2"],
                "as_of": "2026-07-14T10:05:00+00:00",
                "freshness": "current",
                "confidence": "high",
                "basis": "F1 minus F2",
                "period": "Q2 2026",
            },
            {
                "id": "F5",
                "claim": "Prior-period revenue was 96 million dollars.",
                "evidence_class": "source",
                "source_ids": ["S1"],
                "as_of": "2026-07-14T10:00:00+00:00",
                "freshness": "current",
                "confidence": "high",
                "basis": "reported GAAP",
                "period": "Q1 2026",
            },
        ],
        "comparator_table": [
            {
                "metric": "Revenue",
                "period": "Q2 2026",
                "actual": 105,
                "consensus": 100,
                "prior": 96,
                "unit": "USD millions",
                "basis": "GAAP",
                "evidence_ids": ["F1", "F2", "F5"],
                "value_evidence": {
                    "actual": ["F1"],
                    "consensus": ["F2"],
                    "prior": ["F5"],
                },
                "interpretation": "Five percent above consensus and up from the prior period.",
            }
        ],
        "market_context": {
            "price_reaction": [
                {
                    "asset": "EXM",
                    "window": "pre-release close to 11:00 ET",
                    "return_pct": 4.0,
                    "benchmark": "SPY",
                    "benchmark_return_pct": 0.5,
                    "excess_return_pct": 3.5,
                    "as_of": "2026-07-14T11:00:00+00:00",
                    "data_delay": "15 minutes",
                    "evidence_ids": ["F3"],
                }
            ],
            "positioning": [],
            "liquidity": [],
            "valuation": [
                {
                    "subject": "Example Corp common equity",
                    "label": "Forward revenue multiple",
                    "value_state": "numeric",
                    "value": 5.2,
                    "unit": "x",
                    "numerator": "common-equity market capitalization",
                    "denominator": "forward twelve-month revenue",
                    "period": "forward twelve months",
                    "accounting_basis": "GAAP revenue consensus",
                    "currency_treatment": "USD numerator and denominator; no FX translation",
                    "share_class": "EXM common shares",
                    "comparability": "comparable",
                    "as_of": "2026-07-14T11:00:00+00:00",
                    "data_delay": "15 minutes",
                    "source_refs": ["S1", "S3"],
                    "evidence_ids": ["F1", "F3"],
                    "not_meaningful_reason": None,
                }
            ],
        },
        "thesis": {
            "stance": "positive",
            "claim": "The quarter supports a higher near-term revenue path, with valuation still the main counterweight.",
            "horizon": "next two quarters",
            "confidence": "medium",
            "mechanisms": [
                {
                    "step": 1,
                    "claim": "Revenue above consensus can lift forward estimates if guidance confirms it.",
                    "status": "derived",
                    "evidence_ids": ["F1", "F2", "F4"],
                }
            ],
            "forced_actors": ["analysts carrying the prior revenue path"],
            "evidence_ids": ["F1", "F2", "F3", "F4"],
            "counterevidence_ids": ["F3"],
            "invalidation": "Forward guidance fails to move above the prior Street path.",
        },
        "scenarios": [
            {
                "name": "confirmation",
                "condition": "Guidance and revisions rise after the report.",
                "path": "The revenue surprise becomes an estimate-revision story.",
                "signposts": ["positive 30-day revisions", "price holds excess return"],
                "invalidation": "Revisions stay flat or turn down.",
                "evidence_ids": ["F1", "F2", "F3"],
            },
            {
                "name": "fade",
                "condition": "The beat is timing or mix and guidance stays unchanged.",
                "path": "The initial price reaction fades without a model change.",
                "signposts": ["flat guidance", "lost event-day gap"],
                "invalidation": "Consensus revisions broaden higher.",
                "evidence_ids": ["F1", "F2", "F3"],
            },
        ],
        "catalysts": [
            {
                "event": "Updated consensus estimates",
                "expected_at": None,
                "evidence_ids": ["F1", "F2"],
            }
        ],
        "gaps": ["Forward guidance was not supplied in the fixture."],
        "quality_report": {
            "decision": "ready",
            "hard_failures": [],
            "warnings": [],
            "checks": [],
            "data_freshness": "current",
            "source_coverage": {
                "primary_source_present": True,
                "live_market_data_present": True,
                "independent_sources": 3,
            },
        },
    }


def error_codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["errors"]}


def warning_codes(result: dict) -> set[str]:
    return {entry["code"] for entry in result["warnings"]}


def main() -> None:
    cases = 0

    result = validate(base_pack())
    assert result["valid"], result
    cases += 1

    item = base_pack()
    item["source_register"].append(copy.deepcopy(item["source_register"][0]))
    assert "DUPLICATE_SOURCE_ID" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["fact_ledger"][0]["source_ids"] = ["S99"]
    assert "UNKNOWN_SOURCE_REF" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["fact_ledger"][2]["as_of"] = None
    assert "FACT_TIMESTAMP_REQUIRED" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["comparator_table"][0]["consensus"] = None
    item["comparator_table"][0]["prior"] = None
    item["comparator_table"][0]["evidence_ids"] = ["F1"]
    item["comparator_table"][0]["value_evidence"]["consensus"] = []
    item["comparator_table"][0]["value_evidence"]["prior"] = []
    result = validate(item)
    assert result["valid"] and "COMPARATOR_THIN" in warning_codes(result)
    cases += 1

    item = base_pack()
    item["quality_report"]["hard_failures"] = ["source asset mismatch"]
    assert "HARD_FAILURE_STATE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["brief"]["decision_use"] = "trade_watch"
    assert "TRADE_LIQUIDITY_MISSING" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["thesis"]["counterevidence_ids"] = []
    assert "READY_WITHOUT_COUNTEREVIDENCE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["scenarios"][0]["evidence_ids"] = ["F99"]
    assert "UNKNOWN_FACT_REF" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["quality_report"]["source_coverage"]["independent_sources"] = 2
    assert "SOURCE_COVERAGE_MISMATCH" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["quality_report"]["decision"] = "blocked"
    item["quality_report"]["hard_failures"] = ["source asset mismatch"]
    assert validate(item)["valid"]
    cases += 1

    item = base_pack()
    item["source_register"][0]["source_type"] = "model_consensus"
    assert "SOURCE_TYPE_VALUE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["thesis"]["confidence"] = "certain"
    assert "THESIS_CONFIDENCE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["url"] = None
    item["source_register"][0]["locator"] = "user-provided attachment 1"
    item["source_register"][0]["source_type"] = "user_supplied"
    item["source_register"][0].pop("title")
    item["source_register"][0].pop("fact_refs")
    item["quality_report"]["source_coverage"]["primary_source_present"] = False
    assert validate(item)["valid"]
    cases += 1

    item = base_pack()
    item["source_register"][0]["url"] = None
    assert "SOURCE_LOCATOR" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["thesis"]["evidence_ids"] = ["F4"]
    assert "READY_WITHOUT_SOURCED_THESIS" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["fact_ledger"][0]["freshness"] = "stale"
    assert "DATA_FRESHNESS_MISMATCH" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["fact_ledger"].append({
        "id": "F6",
        "claim": "The market was already pricing a perfect quarter.",
        "evidence_class": "hypothesis",
        "source_ids": [],
        "as_of": None,
        "freshness": "unknown",
        "confidence": "low",
        "basis": "Cuebook consensusRead",
        "period": "Q2 2026",
    })
    item["comparator_table"][0]["consensus"] = "perfect quarter"
    item["comparator_table"][0]["evidence_ids"] = ["F1", "F5", "F6"]
    item["comparator_table"][0]["value_evidence"]["consensus"] = ["F6"]
    item["quality_report"]["data_freshness"] = "mixed"
    assert "COMPARATOR_EVIDENCE_CLASS" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][1]["title"] = "Example Corp consensus snapshot"
    assert validate(item)["valid"]
    cases += 1

    item = base_pack()
    item["source_register"][0].pop("title")
    assert "EVENT_ANCHOR_TITLE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["title"] = 123
    assert "EVENT_ANCHOR_TITLE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["url"] = None
    item["source_register"][0]["locator"] = "authorized release copy"
    assert "EVENT_ANCHOR_URL" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["access"] = "authorized"
    assert "EVENT_ANCHOR_ACCESS" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["published_at"] = None
    assert "EVENT_ANCHOR_PUBLISHED_AT" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["published_at"] = "yesterday"
    assert "EVENT_ANCHOR_PUBLISHED_AT" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["publisher"] = 123
    assert "EVENT_ANCHOR_PUBLISHER" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["fact_refs"] = []
    assert "EVENT_ANCHOR_FACT_REFS" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["fact_refs"] = ["F99"]
    assert "UNKNOWN_FACT_REF" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["fact_refs"] = ["F2"]
    assert "EVENT_ANCHOR_FACT_LINK" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["source_register"][0]["source_type"] = "reputable_news"
    item["quality_report"]["source_coverage"]["primary_source_present"] = False
    assert validate(item)["valid"]
    cases += 1

    valuation_text_fields = (
        "subject",
        "label",
        "unit",
        "numerator",
        "denominator",
        "period",
        "accounting_basis",
        "currency_treatment",
        "share_class",
    )
    for key in valuation_text_fields:
        item = base_pack()
        item["market_context"]["valuation"][0].pop(key)
        assert "VALUATION_FIELD" in error_codes(validate(item)), key
        cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["subject"] = 123
    assert "VALUATION_FIELD" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["as_of"] = "today"
    assert "VALUATION_AS_OF" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["value_state"] = "estimated"
    assert "VALUATION_VALUE_STATE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["comparability"] = "maybe"
    assert "VALUATION_COMPARABILITY" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["source_refs"] = []
    assert "VALUATION_SOURCE_REQUIRED" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["source_refs"] = ["S99"]
    assert "UNKNOWN_SOURCE_REF" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["value"] = "5.2"
    assert "VALUATION_NUMERIC_VALUE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    valuation = item["market_context"]["valuation"][0]
    valuation.update({
        "label": "Trailing P/E",
        "value_state": "N/M",
        "value": None,
        "numerator": "common-equity market capitalization",
        "denominator": "trailing attributable net income",
        "period": "trailing twelve months",
        "comparability": "not_comparable",
        "not_meaningful_reason": "Trailing attributable net income is non-positive.",
    })
    assert validate(item)["valid"]
    cases += 1

    item = base_pack()
    valuation = item["market_context"]["valuation"][0]
    valuation.update({"value_state": "N/M", "value": None, "comparability": "not_comparable"})
    valuation.pop("not_meaningful_reason")
    assert "VALUATION_NM_REASON" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    valuation = item["market_context"]["valuation"][0]
    valuation.update({
        "value_state": "N/M",
        "comparability": "not_comparable",
        "not_meaningful_reason": "The denominator is non-positive.",
    })
    valuation.pop("value")
    assert "VALUATION_VALUE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    valuation = item["market_context"]["valuation"][0]
    valuation.update({
        "value_state": "N/M",
        "comparability": "not_comparable",
        "not_meaningful_reason": "The denominator is non-positive.",
    })
    assert "VALUATION_NM_VALUE" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    item["market_context"]["valuation"][0]["not_meaningful_reason"] = "Unexpected reason"
    assert "VALUATION_NM_REASON" in error_codes(validate(item))
    cases += 1

    item = base_pack()
    valuation = item["market_context"]["valuation"][0]
    valuation.update({
        "value_state": "N/M",
        "value": None,
        "comparability": "comparable",
        "not_meaningful_reason": "The denominator is non-positive.",
    })
    assert "VALUATION_NM_COMPARABILITY" in error_codes(validate(item))
    cases += 1

    print(f"ok: {cases} research pack cases")


class ResearchPackRegressionTests(unittest.TestCase):
    def test_regression_matrix(self) -> None:
        main()


if __name__ == "__main__":
    main()
