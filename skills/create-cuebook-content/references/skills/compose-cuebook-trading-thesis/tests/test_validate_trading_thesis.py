#!/usr/bin/env python3
from __future__ import annotations

import copy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_trading_thesis import canonical_hash, validate  # noqa: E402


def base_thesis() -> dict:
    return {
        "schema_version": "trading-thesis-v1",
        "thesis_id": "THESIS_hormuz01",
        "revision": 1,
        "lifecycle_state": "ready",
        "timestamps": {
            "created_at": "2026-07-14T09:30:00+08:00",
            "updated_at": "2026-07-14T10:00:00+08:00",
            "as_of": "2026-07-14T10:00:00+08:00",
            "decision_cutoff_at": "2026-07-14T10:00:00+08:00",
            "activated_at": "2026-07-14T10:01:00+08:00",
            "expires_at": "2026-08-14T16:00:00+08:00",
        },
        "author": {"creator_ref": "CREATOR_demo", "author_type": "hybrid"},
        "lineage": {
            "source_artifact_refs": ["research-pack-v1:hormuz-uso"],
            "root_thesis_ref": None,
            "previous_revision_ref": None,
            "canonical_hash": None,
        },
        "market": {
            "instrument_id": "USO:ARCX",
            "display_name": "United States Oil Fund",
            "ticker": "USO",
            "asset_class": "etf",
            "venue": "ARCX",
            "quote_currency": "USD",
            "direction": "long",
            "relationship": "direct",
            "projection_gate_ref": "gate:hormuz-uso",
            "proxy_reason": None,
        },
        "claim": {
            "statement": "USO is likely to close at or above 119.83 before the resolution window ends.",
            "why_now": "Shipping risk is repricing prompt oil while the market still discounts a prolonged disruption.",
            "horizon": "one month",
            "confidence": "medium",
            "probability": 0.62,
            "probability_basis": "Scenario-weighted assessment from the cited shipping and market observations.",
        },
        "idea_provenance": {
            "mode": "cuebook_assisted",
            "creator_seed": "Shipping disruption may create a tradable oil risk premium.",
            "cuebook_contributions": [
                {
                    "kind": "countercase",
                    "summary": "Cuebook added partial tanker passage as evidence against an immediate full-disruption trade.",
                    "evidence_refs": ["E2"],
                },
                {
                    "kind": "settlement_rule",
                    "summary": "Cuebook converted the view into a dated USO threshold with an explicit fallback source.",
                    "evidence_refs": ["E3"],
                },
            ],
            "creator_decision": "Keep the long view while requiring persistent restrictions and prompt-spread strength.",
            "idea_delta": "conditionalized",
            "final_trade_idea": "A conditional USO long thesis that fails if shipping and prompt spreads normalize.",
            "public_attribution": True,
        },
        "evidence_ledger": [
            {
                "id": "E1",
                "claim": "Verified prompt oil prices rose after the disruption risk increased.",
                "evidence_class": "verified_live",
                "source_ref": "source:market-data-1",
                "as_of": "2026-07-14T09:55:00+08:00",
                "freshness": "current",
                "role": "supports",
            },
            {
                "id": "E2",
                "claim": "Available tanker traffic data still shows partial passage through the strait.",
                "evidence_class": "source",
                "source_ref": "source:shipping-1",
                "as_of": "2026-07-14T09:40:00+08:00",
                "freshness": "current",
                "role": "challenges",
            },
            {
                "id": "E3",
                "claim": "USO was observed at 108.70 before the cutoff.",
                "evidence_class": "verified_live",
                "source_ref": "source:uso-quote-1",
                "as_of": "2026-07-14T09:59:00+08:00",
                "freshness": "current",
                "role": "context",
            },
        ],
        "reasoning": {
            "mechanisms": [
                {
                    "step": 1,
                    "claim": "Higher disruption probability raises the prompt crude risk premium and flows into USO exposure.",
                    "status": "derived",
                    "evidence_refs": ["E1", "E2"],
                }
            ],
            "supporting_evidence_refs": ["E1"],
            "counterevidence_refs": ["E2"],
            "gaps": ["Duration of any shipping interruption remains uncertain."],
            "scenarios": [
                {
                    "id": "SC1",
                    "label": "Disruption persists",
                    "condition": "Verified traffic restrictions continue for at least five sessions.",
                    "expected_path": "Prompt oil retains a risk premium and USO approaches the threshold.",
                    "signposts": ["Tanker counts", "Prompt spreads"],
                    "invalidation": "Traffic normalizes and prompt spreads retrace.",
                    "evidence_refs": ["E1", "E2"],
                },
                {
                    "id": "SC2",
                    "label": "Rapid normalization",
                    "condition": "Passage normalizes within two sessions.",
                    "expected_path": "The risk premium fades and the target is unlikely to resolve true.",
                    "signposts": ["Tanker counts", "Official notices"],
                    "invalidation": "Restrictions broaden despite normalization notices.",
                    "evidence_refs": ["E2"],
                },
            ],
        },
        "setup": {
            "reference_observation": {
                "value": 108.70,
                "unit": "USD",
                "observed_at": "2026-07-14T09:59:00+08:00",
                "observation_basis": "last_trade",
                "market_state": "regular",
                "source_ref": "source:uso-quote-1",
            },
            "action_state": "enter_now",
            "entry_condition": "The view becomes active only while verified shipping restrictions and prompt-spread strength persist.",
            "trigger_condition": None,
            "catalysts": [
                {
                    "event": "Next official shipping-status update",
                    "expected_at": "2026-07-16T12:00:00+08:00",
                    "evidence_refs": ["E2"],
                }
            ],
            "invalidation": "Verified passage normalizes for three sessions while prompt crude gives back the disruption premium.",
        },
        "resolution": {
            "status": "complete",
            "evaluation_kind": "price_target",
            "metric": "official_settlement_price",
            "operator": "gte",
            "threshold": {
                "target_value": 119.83,
                "lower_bound": None,
                "upper_bound": None,
                "unit": "USD",
            },
            "observation_basis": "official_settlement",
            "window_start": "2026-07-14T10:01:00+08:00",
            "window_end": "2026-08-14T16:00:00+08:00",
            "data_source_ref": "source:exchange-settlement-1",
            "benchmark_ref": None,
            "fallback_source_refs": ["source:licensed-market-data-1"],
            "timezone": "America/New_York",
            "adjustments_policy": "Use split-adjusted prices; symbol changes preserve the same instrument ID.",
            "ambiguity_policy": "fallback_source",
            "score_modes": ["binary_accuracy", "brier", "directional_accuracy", "return"],
        },
        "disclosure": {
            "visibility": "public",
            "position_status": "none",
            "position_text": None,
            "commercial_status": "none",
            "commercial_text": None,
            "identity_status": "verified",
            "ai_assistance_status": "assisted",
            "public_disclosures": ["AI assisted the evidence organization and drafting."],
        },
        "relations": {"supports": [], "challenges": [], "forks": [], "supersedes": []},
        "quality_report": {
            "decision": "ready",
            "evidence_decision": "ready",
            "resolution_decision": "ready",
            "publication_decision": "ready",
            "hard_failures": [],
            "warnings": [],
            "checks": ["cutoff", "evidence", "countercase", "resolution", "disclosure"],
            "counts": {"evidence": 3, "supporting": 1, "challenging": 1, "mechanisms": 1, "scenarios": 2},
        },
    }


def codes(result: dict, key: str = "errors") -> set[str]:
    return {entry["code"] for entry in result[key]}


def main() -> None:
    cases = 0
    item = base_thesis(); result = validate(item); assert result["valid"], result; cases += 1

    item = base_thesis(); item["debug"] = True
    assert "UNKNOWN_ROOT_FIELD" in codes(validate(item)); cases += 1

    item = base_thesis(); item["evidence_ledger"][0]["as_of"] = "2026-07-14T10:01:00+08:00"
    assert "EVIDENCE_AFTER_CUTOFF" in codes(validate(item)); cases += 1

    item = base_thesis(); item["reasoning"]["mechanisms"][0]["evidence_refs"] = ["E99"]
    assert "UNKNOWN_MECHANISM_REF" in codes(validate(item)); cases += 1

    item = base_thesis(); item["reasoning"]["counterevidence_refs"] = []; item["quality_report"]["counts"]["challenging"] = 0
    assert "COUNTEREVIDENCE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["reasoning"]["scenarios"] = item["reasoning"]["scenarios"][:1]; item["quality_report"]["counts"]["scenarios"] = 1
    assert "SCENARIOS_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["status"] = "incomplete"
    assert "RESOLUTION_INCOMPLETE" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["window_end"] = item["resolution"]["window_start"]
    assert "RESOLUTION_WINDOW_ORDER" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["metric"] = "event_status"
    assert "PRICE_TARGET_CONTRACT" in codes(validate(item)); cases += 1

    item = base_thesis(); item["claim"]["probability_basis"] = None
    assert "PROBABILITY_BASIS" in codes(validate(item)); cases += 1

    item = base_thesis(); item["claim"]["probability"] = None; item["claim"]["probability_basis"] = None
    assert "BRIER_PROBABILITY_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["evaluation_kind"] = "relative_performance"; item["resolution"]["metric"] = "excess_return_pct"; item["resolution"]["benchmark_ref"] = None; item["resolution"]["score_modes"] = ["binary_accuracy", "excess_return"]
    assert "BENCHMARK_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["market"]["relationship"] = "supported_proxy"; item["market"]["projection_gate_ref"] = None; item["market"]["proxy_reason"] = None
    result = validate(item); assert {"PROXY_GATE_REQUIRED", "PROXY_REASON_REQUIRED"} <= codes(result); cases += 1

    item = base_thesis(); item["market"]["relationship"] = "watch_only"
    assert "WATCH_ONLY_DIRECTIONAL" in codes(validate(item)); cases += 1

    item = base_thesis(); item["disclosure"]["position_status"] = "unknown"
    assert "PUBLIC_DISCLOSURE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["disclosure"]["ai_assistance_status"] = "none"
    assert "AI_DISCLOSURE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["setup"]["entry_condition"] = "立即买入并加五倍杠杆"
    assert "EXECUTION_INSTRUCTION" in codes(validate(item)); cases += 1

    item = base_thesis(); item["revision"] = 2
    assert "PREVIOUS_REVISION_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["lifecycle_state"] = "frozen"
    assert "CANONICAL_HASH_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["lifecycle_state"] = "frozen"; item["lineage"]["canonical_hash"] = canonical_hash(item)
    result = validate(item); assert result["valid"], result; cases += 1

    item["claim"]["statement"] = "Tampered after freeze."
    assert "CANONICAL_HASH_MISMATCH" in codes(validate(item)); cases += 1

    item = base_thesis(); item["quality_report"]["counts"]["evidence"] = 99
    assert "QUALITY_COUNTS" in codes(validate(item)); cases += 1

    item = base_thesis(); item["quality_report"]["decision"] = "conditional"
    assert "QUALITY_DECISION" in codes(validate(item)); cases += 1

    item = base_thesis(); item["evidence_ledger"].append(copy.deepcopy(item["evidence_ledger"][0])); item["quality_report"]["counts"]["evidence"] = 4
    assert "DUPLICATE_EVIDENCE_ID" in codes(validate(item)); cases += 1

    item = base_thesis(); item["evidence_ledger"][0]["source_ref"] = None
    assert "EVIDENCE_SOURCE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["setup"]["reference_observation"]["observed_at"] = "2026-07-14T10:02:00+08:00"
    assert "OBSERVATION_AFTER_CUTOFF" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["fallback_source_refs"] = []
    assert "FALLBACK_SOURCE_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["resolution"]["operator"] = "lte"
    assert "DIRECTION_RESOLUTION_CONFLICT" in codes(validate(item)); cases += 1

    item = base_thesis(); item["idea_provenance"]["cuebook_contributions"][0]["evidence_refs"] = ["E99"]
    assert "UNKNOWN_IDEA_EVIDENCE_REF" in codes(validate(item)); cases += 1

    item = base_thesis(); item["idea_provenance"]["creator_seed"] = None
    assert "CREATOR_SEED_REQUIRED" in codes(validate(item)); cases += 1

    item = base_thesis(); item["setup"]["reference_observation"]["observation_basis"] = None
    assert "REFERENCE_OBSERVATION_BASIS" in codes(validate(item)); cases += 1

    item = base_thesis(); item["setup"]["action_state"] = "wait_for_trigger"; item["setup"]["trigger_condition"] = None
    result = validate(item); assert {"TRIGGER_REQUIRED", "CONDITIONAL_NOT_ACTIVATED"} <= codes(result); cases += 1

    print(f"ok: {cases} trading thesis cases")


if __name__ == "__main__":
    main()
