import copy
import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_settlement_formula.py"
SPEC = importlib.util.spec_from_file_location("settlement_formula_validator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)

USO_INSTRUMENT = "11111111-1111-4111-8111-111111111111"
USO_PERIOD = "11111111-1111-4111-8111-222222222222"
BTC_INSTRUMENT = "22222222-2222-4222-8222-111111111111"
BTC_PERIOD = "22222222-2222-4222-8222-222222222222"
NVDA_INSTRUMENT = "33333333-3333-4333-8333-111111111111"
NVDA_PERIOD = "33333333-3333-4333-8333-222222222222"


def expr(op, *args, value=None, ref=None, window=None):
    return {"op": op, "args": list(args), "value": value, "ref": ref, "window": window}


def evaluate_expression(node, values):
    op = node["op"]
    args = node.get("args", [])
    if op == "literal":
        return Decimal(str(node["value"]))
    if op == "var":
        return Decimal(str(values[node["ref"]]))
    resolved = [evaluate_expression(item, values) for item in args]
    if op == "add":
        return resolved[0] + resolved[1]
    if op == "sub":
        return resolved[0] - resolved[1]
    if op == "mul":
        return resolved[0] * resolved[1]
    if op == "div":
        return resolved[0] / resolved[1]
    if op == "gt":
        return resolved[0] > resolved[1]
    if op == "gte":
        return resolved[0] >= resolved[1]
    if op == "lt":
        return resolved[0] < resolved[1]
    if op == "lte":
        return resolved[0] <= resolved[1]
    if op == "and":
        return all(resolved)
    raise AssertionError(f"Unsupported test operator: {op}")


def variable(
    var_id,
    symbol,
    metric="official_close",
    interval="1d",
    unit="USD",
    sealed=True,
    instrument_ref=USO_INSTRUMENT,
):
    return {
        "id": var_id,
        "symbol": symbol,
        "kind": "market_observation",
        "value_type": "number",
        "unit": unit,
        "source_ref": "source:cuebook-market-series",
        "instrument_ref": instrument_ref,
        "metric": metric,
        "interval": interval,
        "timezone": "America/New_York",
        "session": "regular",
        "sealed_only": sealed,
        "parameters": {},
    }


def fixed_entry(price, observed_at, symbol_period_id, provider_symbol):
    return {
        "mode": "fixed_snapshot",
        "price": price,
        "observed_at": observed_at,
        "source": "candle_close",
        "market_session": "regular",
        "symbol_period_id": symbol_period_id,
        "provider_symbol": provider_symbol,
        "observation_ref": f"market_latest_prices:{symbol_period_id}",
        "capture_ref": None,
    }


def execution_leg(
    leg_id,
    asset_id,
    instrument_id,
    period_id,
    ticker,
    entry_price,
    exit_variable_ref,
    direction,
    target=None,
):
    return {
        "leg_id": leg_id,
        "role": "primary" if leg_id == "A" else "comparator",
        "asset_id": asset_id,
        "provider_instrument_id": instrument_id,
        "canonical_ticker": ticker,
        "provider": "polygon",
        "quote_currency": "USD",
        "direction": direction,
        "entry": fixed_entry(entry_price, "2026-07-14T20:00:00Z", period_id, ticker.upper()),
        "exit_variable_ref": exit_variable_ref,
        "target": target,
    }


def fixed_clock():
    return {
        "starts_at": "2026-07-14T20:00:00Z",
        "settle_at": "2026-07-17T20:00:00Z",
        "end_event_ref": None,
        "interval": "1d",
        "timezone": "America/New_York",
        "session": "regular",
        "outcome_source": "warm_candle",
        "selection": "first_eligible_at_or_after",
        "origin": "provider_official",
        "adjustment": "adjusted",
        "max_observation_delay_seconds": 345600,
    }


def base_formula():
    item = {
        "schema_version": "settlement-formula-v1",
        "formula_id": "FORMULA_uso20260717",
        "revision": 1,
        "state": "ready",
        "lineage": {
            "claim_ref": "SETTLE_uso20260714",
            "claim_hash": "1" * 64,
            "canonical_hash": None,
        },
        "subject": {
            "instrument_id": USO_INSTRUMENT,
            "ticker": "USO",
            "direction": "long",
        },
        "execution_profile": {
            "engine": "cuebook_settlement_v1",
            "formula_family": "single_asset_price_target",
            "aggregation": "single",
            "legs": [
                execution_leg(
                    "A",
                    101,
                    USO_INSTRUMENT,
                    USO_PERIOD,
                    "uso",
                    "108.70",
                    "VAR_END_CLOSE",
                    "long",
                    {"metric": "price", "operator": "gt", "value": "117.79", "unit": "USD"},
                )
            ],
            "clock": fixed_clock(),
            "direction_threshold_bps": None,
            "long_short": None,
        },
        "variables": [variable("VAR_END_CLOSE", "P_H")],
        "activation": {
            "mode": "immediate",
            "window_start": None,
            "window_end": None,
            "end_event_ref": None,
            "expression": None,
            "captures": [],
        },
        "outcome": {
            "observation_mode": "at_datetime",
            "observed_at": "2026-07-17T20:00:00Z",
            "window_start": None,
            "window_end": None,
            "event_ref": None,
            "expression": None,
        },
        "invalidation": None,
        "lifecycle": {
            "initial_state": "active",
            "activation_state": "active",
            "terminal_states": ["succeeded", "failed", "manual_review"],
            "untriggered_result": "no_score",
            "tie_result": "failed",
            "invalidated_result": "failed",
        },
        "resolution": {
            "primary_source_refs": ["source:arca-history"],
            "fallback_source_refs": ["source:nasdaq-history"],
            "zero_division_policy": "not_applicable",
            "missing_data_policy": "fallback_source",
            "precision": 8,
            "rounding_mode": "none",
            "observation_order": "official_sequence",
        },
        "public_math": {
            "activation_formula": "",
            "success_formula": "",
            "failure_formula": "",
            "one_line": "USO 到期官方收盘 > 117.79 USD 时成功。",
        },
        "quality_report": {"decision": "ready", "warnings": [], "missing_fields": []},
    }
    item["outcome"]["expression"] = MODULE.canonical_execution_expression(item["execution_profile"])
    item["public_math"].update(MODULE.render_public_math(item))
    return item


def btc_triggered_formula():
    item = base_formula()
    item["formula_id"] = "FORMULA_btchalving2026"
    item["lineage"].update({"claim_ref": "SETTLE_btchalving2026", "claim_hash": "2" * 64})
    item["subject"].update({"instrument_id": BTC_INSTRUMENT, "ticker": "BTC"})
    close = variable("VAR_CLOSE", "P_t", interval="1d", instrument_ref=BTC_INSTRUMENT)
    close.update({"timezone": "UTC", "session": "continuous", "source_ref": "source:cuebook-btc-utc-d1"})
    volume = variable("VAR_VOLUME", "V_t", metric="volume", interval="1d", unit="BTC", instrument_ref=BTC_INSTRUMENT)
    volume.update({"timezone": "UTC", "session": "continuous", "source_ref": "source:cuebook-btc-utc-d1"})
    end_close = variable("VAR_END_CLOSE", "P_H", interval="1d", instrument_ref=BTC_INSTRUMENT)
    end_close.update({"timezone": "UTC", "session": "continuous", "source_ref": "source:cuebook-btc-utc-d1"})
    item["variables"] = [close, volume, end_close]
    price_gate = expr("gt", expr("var", ref="VAR_CLOSE"), expr("literal", value=65000))
    volume_mean = expr("mean", expr("var", ref="VAR_VOLUME"), window={"lookback": 20, "include_current": False})
    volume_ratio = expr("div", expr("var", ref="VAR_VOLUME"), volume_mean)
    volume_gate = expr("gte", volume_ratio, expr("literal", value=1))
    item["activation"] = {
        "mode": "first_true",
        "window_start": "2026-07-15T00:00:00Z",
        "window_end": None,
        "end_event_ref": "EVENT_btc-halving-next",
        "expression": expr("and", price_gate, volume_gate),
        "captures": [{
            "id": "CAP_TRIGGER_CLOSE",
            "symbol": "P_tau",
            "variable_ref": "VAR_CLOSE",
            "mode": "value_at_activation",
        }],
    }
    item["execution_profile"] = {
        "engine": "cuebook_settlement_v1",
        "formula_family": "single_asset_direction",
        "aggregation": "single",
        "legs": [{
            "leg_id": "A",
            "role": "primary",
            "asset_id": 202,
            "provider_instrument_id": BTC_INSTRUMENT,
            "canonical_ticker": "btc",
            "provider": "coinbase",
            "quote_currency": "USD",
            "direction": "long",
            "entry": {
                "mode": "activation_capture",
                "price": None,
                "observed_at": None,
                "source": None,
                "market_session": None,
                "symbol_period_id": None,
                "provider_symbol": None,
                "observation_ref": None,
                "capture_ref": "CAP_TRIGGER_CLOSE",
            },
            "exit_variable_ref": "VAR_END_CLOSE",
            "target": None,
        }],
        "clock": {
            "starts_at": "2026-07-15T00:00:00Z",
            "settle_at": None,
            "end_event_ref": "EVENT_btc-halving-next",
            "interval": "1d",
            "timezone": "UTC",
            "session": "continuous",
            "outcome_source": "warm_candle",
            "selection": "first_sealed_after_event",
            "origin": "provider_official",
            "adjustment": "unadjusted",
            "max_observation_delay_seconds": 86400,
        },
        "direction_threshold_bps": 0,
        "long_short": None,
    }
    item["outcome"] = {
        "observation_mode": "first_sealed_bar_after_event",
        "observed_at": None,
        "window_start": None,
        "window_end": None,
        "event_ref": "EVENT_btc-halving-next",
        "expression": MODULE.canonical_execution_expression(item["execution_profile"]),
    }
    item["lifecycle"].update({
        "initial_state": "pending_activation",
        "terminal_states": ["succeeded", "failed", "expired_untriggered", "manual_review"],
    })
    item["resolution"].update({
        "primary_source_refs": ["source:cuebook-btc-utc-d1", "source:bitcoin-chain"],
        "fallback_source_refs": ["source:coinbase-btc-usd-d1"],
        "zero_division_policy": "manual_review",
        "observation_order": "event_time",
    })
    item["public_math"]["one_line"] = "BTC 日线站上 65,000 且成交量不低于前 20 日均量后生效；下次减半后首根完整日线高于触发收盘价则成功。"
    item["public_math"].update(MODULE.render_public_math(item))
    return item


def single_direction_formula():
    item = base_formula()
    profile = item["execution_profile"]
    profile.update({
        "formula_family": "single_asset_direction",
        "direction_threshold_bps": 30,
    })
    profile["legs"][0]["target"] = None
    item["outcome"]["expression"] = MODULE.canonical_execution_expression(profile)
    item["public_math"].update(MODULE.render_public_math(item))
    return item


def pair_price_targets_formula():
    item = base_formula()
    profile = item["execution_profile"]
    profile.update({"formula_family": "pair_asset_price_targets", "aggregation": "all"})
    profile["legs"].append(
        execution_leg(
            "B",
            303,
            NVDA_INSTRUMENT,
            NVDA_PERIOD,
            "nvda",
            "210.00",
            "VAR_B_END_CLOSE",
            "long",
            {"metric": "price", "operator": "gte", "value": "220.00", "unit": "USD"},
        )
    )
    item["variables"].append(
        variable("VAR_B_END_CLOSE", "P_B,H", instrument_ref=NVDA_INSTRUMENT)
    )
    item["outcome"]["expression"] = MODULE.canonical_execution_expression(profile)
    item["public_math"].update(MODULE.render_public_math(item))
    return item


def pair_direction_formula():
    item = pair_price_targets_formula()
    profile = item["execution_profile"]
    profile.update({
        "formula_family": "pair_asset_direction",
        "direction_threshold_bps": 30,
    })
    for leg in profile["legs"]:
        leg["target"] = None
    item["outcome"]["expression"] = MODULE.canonical_execution_expression(profile)
    item["public_math"].update(MODULE.render_public_math(item))
    return item


def long_short_formula():
    item = pair_price_targets_formula()
    profile = item["execution_profile"]
    profile.update({
        "formula_family": "pair_asset_direction",
        "aggregation": "long_short",
        "direction_threshold_bps": None,
        "long_short": {
            "long_leg_id": "A",
            "short_leg_id": "B",
            "operator": "gt",
            "margin_bps": 0,
            "weighting": "equal_notional",
            "return_basis": "simple_price_return",
            "endpoint_alignment": "same_session_close",
            "max_entry_skew_seconds": 300,
            "fx_policy": "same_quote_currency",
        },
    })
    profile["legs"][0].update({"direction": "long", "target": None})
    profile["legs"][1].update({"direction": "short", "target": None})
    item["subject"]["direction"] = "outperform"
    item["outcome"]["expression"] = MODULE.canonical_execution_expression(profile)
    item["public_math"].update(MODULE.render_public_math(item))
    return item


class SettlementFormulaTests(unittest.TestCase):
    def test_valid_immediate_terminal_formula(self):
        item = base_formula()
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["public_math"]["success_formula"], "(P_H > 117.79)")

    def test_valid_triggered_halving_formula(self):
        item = btc_triggered_formula()
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("mean_20(V_t,excluding_current)", result["public_math"]["activation_formula"])
        self.assertEqual(result["public_math"]["success_formula"], "((((P_H / P_tau) - 1) * 10000) > 0)")

    def test_all_four_frozen_formula_families_are_valid(self):
        cases = [
            single_direction_formula(),
            base_formula(),
            pair_direction_formula(),
            pair_price_targets_formula(),
        ]
        self.assertEqual(
            {item["execution_profile"]["formula_family"] for item in cases},
            MODULE.FORMULA_FAMILIES,
        )
        for item in cases:
            item["state"] = "frozen"
            item["lineage"]["canonical_hash"] = MODULE.canonical_hash(item)
            result = MODULE.validate(item)
            self.assertTrue(result["valid"], (item["execution_profile"]["formula_family"], result["errors"]))

    def test_pair_target_compiles_to_all_legs(self):
        item = pair_price_targets_formula()
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("AND", result["public_math"]["success_formula"])
        self.assertIn("P_B,H >= 220", result["public_math"]["success_formula"])

    def test_long_short_pair_compares_synchronized_returns(self):
        item = long_short_formula()
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("P_H / 108.7", result["public_math"]["success_formula"])
        self.assertIn("P_B,H / 210", result["public_math"]["success_formula"])

    def test_long_short_pair_can_win_when_both_assets_fall(self):
        item = long_short_formula()
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        expression = item["outcome"]["expression"]
        self.assertTrue(evaluate_expression(expression, {
            "VAR_END_CLOSE": "106.526",
            "VAR_B_END_CLOSE": "199.5",
        }))

    def test_long_short_pair_requires_one_long_and_one_short(self):
        item = long_short_formula()
        item["execution_profile"]["legs"][1]["direction"] = "long"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("LONG_SHORT_SIDE", {entry["code"] for entry in result["errors"]})

    def test_execution_profile_and_ast_cannot_disagree(self):
        item = single_direction_formula()
        item["outcome"]["expression"]["args"][1]["value"] = "31"
        item["public_math"].update(MODULE.render_public_math(item))
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("EXECUTION_EXPRESSION_MISMATCH", {entry["code"] for entry in result["errors"]})

    def test_frozen_price_fields_use_decimal_strings(self):
        item = base_formula()
        item["execution_profile"]["legs"][0]["target"]["value"] = 117.79
        item["outcome"]["expression"] = MODULE.canonical_execution_expression(item["execution_profile"])
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("TARGET_VALUE", {entry["code"] for entry in result["errors"]})

    def test_subject_must_bind_to_primary_db_instrument(self):
        item = base_formula()
        item["subject"]["instrument_id"] = NVDA_INSTRUMENT
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("SUBJECT_BINDING", {entry["code"] for entry in result["errors"]})

    def test_exit_variable_must_match_frozen_clock(self):
        item = base_formula()
        item["variables"][0]["timezone"] = "UTC"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("EXIT_CLOCK_ALIGNMENT", {entry["code"] for entry in result["errors"]})

    def test_unknown_variable_is_rejected(self):
        item = base_formula()
        item["outcome"]["expression"]["args"][0]["ref"] = "VAR_UNKNOWN"
        item["public_math"].update(MODULE.render_public_math(item))
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("REFERENCE_SHAPE", {entry["code"] for entry in result["errors"]})

    def test_ready_formula_requires_sealed_market_observations(self):
        item = base_formula()
        item["variables"][0]["sealed_only"] = False
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("UNSEALED_VARIABLE", {entry["code"] for entry in result["errors"]})

    def test_untriggered_conditional_view_is_not_scored_as_failure(self):
        item = btc_triggered_formula()
        item["lifecycle"]["untriggered_result"] = "failed"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("UNTRIGGERED_SCORE", {entry["code"] for entry in result["errors"]})

    def test_same_activation_requires_aligned_market_bars(self):
        item = btc_triggered_formula()
        next(entry for entry in item["variables"] if entry["id"] == "VAR_VOLUME")["interval"] = "4h"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("ACTIVATION_ALIGNMENT", {entry["code"] for entry in result["errors"]})

    def test_public_math_is_deterministic(self):
        item = base_formula()
        item["public_math"]["success_formula"] = "P_H maybe above 117.79"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("PUBLIC_MATH_MISMATCH", {entry["code"] for entry in result["errors"]})

    def test_frozen_formula_requires_matching_hash(self):
        item = base_formula()
        item["state"] = "frozen"
        item["lineage"]["canonical_hash"] = MODULE.canonical_hash(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

        item["subject"]["ticker"] = "WRONG"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("CANONICAL_HASH", {entry["code"] for entry in result["errors"]})


if __name__ == "__main__":
    unittest.main()
