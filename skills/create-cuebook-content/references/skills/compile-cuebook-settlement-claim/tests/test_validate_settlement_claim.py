import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_settlement_claim.py"
SPEC = importlib.util.spec_from_file_location("settlement_validator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def base_claim():
    item = {
        "schema_version": "settlement-claim-v1",
        "claim_id": "SETTLE_uso20260714",
        "revision": 1,
        "state": "ready",
        "lineage": {
            "source_content_refs": ["POST_hormuz_x"],
            "thesis_ref": None,
            "canonical_hash": None,
        },
        "extraction": {
            "mode": "explicit",
            "explicit_fields": ["subject.ticker", "direction", "clock.window_end", "success.conditions.C1"],
            "inferred_fields": ["subject.instrument_id"],
            "proposed_fields": [],
            "confirmed_fields": [],
            "missing_fields": [],
        },
        "subject": {
            "instrument_id": "USO:ARCX",
            "ticker": "USO",
            "display_name": "United States Oil Fund",
            "asset_class": "etf",
            "venue": "ARCX",
            "quote_currency": "USD",
        },
        "direction": "long",
        "claim_text": "USO will finish the window above the July 13 official close.",
        "intent": {
            "action_state": "enter_now",
            "trigger_condition_ref": None,
            "entry_price_rule": "publication_baseline",
        },
        "baseline": {
            "value": 117.79,
            "unit": "USD",
            "observed_at": "2026-07-13T20:00:00Z",
            "observation_basis": "official_close",
            "market_state": "closed",
            "data_source_ref": "source:arca-history",
        },
        "clock": {
            "declared_at": "2026-07-14T04:30:00Z",
            "window_start": "2026-07-14T13:30:00Z",
            "window_end": "2026-07-17T20:00:00Z",
            "timezone": "America/New_York",
            "market_session": "regular",
        },
        "success": {
            "logic": "all",
            "conditions": [{
                "id": "C1",
                "subject_ref": "primary",
                "kind": "terminal_value",
                "metric": "official_close",
                "operator": "gt",
                "target": {"value": 117.79, "lower_bound": None, "upper_bound": None, "unit": "USD", "value_source": "baseline"},
                "observation_mode": "at_expiry",
                "window_start": None,
                "window_end": None,
                "data_source_ref": "source:arca-history",
                "benchmark_ref": None,
                "event_ref": None,
                "description": "At expiry, USO official regular-session close is above 117.79 USD.",
            }],
        },
        "failure": {
            "mode": "complement_at_expiry",
            "conditions": [],
            "text": "The claim fails if the official close at expiry is at or below 117.79 USD.",
        },
        "resolution": {
            "primary_source_ref": "source:arca-history",
            "fallback_source_refs": ["source:nasdaq-history"],
            "adjustments_policy": "Use split-adjusted prices and preserve the economic threshold across symbol changes.",
            "ambiguity_policy": "fallback_source",
            "score_modes": ["binary_accuracy", "directional_accuracy", "return"],
        },
        "public_view": {
            "settlement_summary": "USO is successful if its official regular-session close at the deadline is above 117.79 USD; otherwise it fails.",
            "one_line": "",
            "status_label": "待结算",
        },
        "quality_report": {"decision": "ready", "warnings": [], "missing_fields": []},
    }
    item["public_view"]["one_line"] = MODULE.render_one_line(item)
    return item


class SettlementClaimTests(unittest.TestCase):
    def test_valid_terminal_claim(self):
        result = MODULE.validate(base_claim())
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["generated_one_line"], "USO 看多｜截至 2026-07-17｜到期常规收盘 > 117.79 USD｜待结算")

    def test_window_barrier(self):
        item = base_claim()
        condition = item["success"]["conditions"][0]
        condition.update({"kind": "window_barrier", "operator": "gte", "observation_mode": "any_in_window"})
        condition["target"].update({"value": 119.83, "value_source": "explicit_target"})
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("期间任一常规收盘 >= 119.83 USD", result["generated_one_line"])

    def test_unconfirmed_proposal_blocks_ready(self):
        item = base_claim()
        item["extraction"]["mode"] = "mixed"
        item["extraction"]["proposed_fields"] = ["clock.window_end"]
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("UNCONFIRMED_PROPOSAL", {entry["code"] for entry in result["errors"]})

    def test_needs_confirmation_allows_proposal(self):
        item = base_claim()
        item["state"] = "needs_confirmation"
        item["extraction"]["mode"] = "mixed"
        item["extraction"]["proposed_fields"] = ["clock.window_end"]
        item["quality_report"]["decision"] = "needs_confirmation"
        item["public_view"]["status_label"] = "待确认"
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_direction_conflict(self):
        item = base_claim()
        item["success"]["conditions"][0]["operator"] = "lt"
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("DIRECTION_CONFLICT", {entry["code"] for entry in result["errors"]})

    def test_baseline_after_declaration_is_rejected(self):
        item = base_claim()
        item["baseline"]["observed_at"] = "2026-07-14T05:00:00Z"
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("BASELINE_AFTER_DECLARATION", {entry["code"] for entry in result["errors"]})

    def test_live_baseline_preserves_quote_type(self):
        item = base_claim()
        item["baseline"].update({
            "observed_at": "2026-07-14T04:29:59Z",
            "observation_basis": "last_trade",
            "market_state": "pre",
            "data_source_ref": "source:live-quote",
        })
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_baseline_market_state_is_required(self):
        item = base_claim()
        item["baseline"].pop("market_state")
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("BASELINE_MARKET_STATE", {entry["code"] for entry in result["errors"]})

    def test_conditional_intent_requires_ordered_trigger(self):
        item = base_claim()
        item["intent"] = {
            "action_state": "wait_for_trigger",
            "trigger_condition_ref": "C1",
            "entry_price_rule": "publication_baseline",
        }
        outcome = copy.deepcopy(item["success"]["conditions"][0])
        outcome["id"] = "C2"
        outcome["description"] = "At expiry, USO remains above the publication baseline after the trigger."
        item["success"].update({"logic": "sequence", "conditions": [item["success"]["conditions"][0], outcome]})
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("条件看多", result["generated_one_line"])

        item["intent"]["trigger_condition_ref"] = "C2"
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("TRIGGER_SEQUENCE_ORDER", {entry["code"] for entry in result["errors"]})

    def test_triggered_regime_uses_protocol_event_horizon(self):
        item = base_claim()
        item["subject"].update({
            "instrument_id": "BTC-USD:SPOT",
            "ticker": "BTC",
            "display_name": "Bitcoin",
            "asset_class": "crypto",
            "venue": "AGGREGATED_SPOT",
        })
        item["claim_text"] = "A confirmed breakout activates a bullish view through the next Bitcoin halving."
        item["intent"] = {
            "action_state": "wait_for_trigger",
            "trigger_condition_ref": "C1",
            "entry_price_rule": "trigger_observation",
        }
        item["baseline"].update({
            "value": 64000,
            "observed_at": "2026-07-14T04:29:59Z",
            "observation_basis": "spot",
            "market_state": "continuous",
            "data_source_ref": "source:cuebook-btc-spot",
        })
        item["clock"].update({
            "window_end": None,
            "end_mode": "protocol_event",
            "end_event_ref": "EVENT_btc-halving-next",
            "end_event_label": "下一次 BTC 减半",
            "end_event_source_ref": "source:bitcoin-chain",
            "fallback_window_end": None,
            "market_session": "continuous",
        })
        item["success"] = {
            "logic": "sequence",
            "conditions": [
                {
                    "id": "C1",
                    "subject_ref": "primary",
                    "kind": "event",
                    "metric": "event_status",
                    "operator": "occurred",
                    "target": {"value": None, "lower_bound": None, "upper_bound": None, "unit": None, "value_source": "event"},
                    "observation_mode": "event_by_expiry",
                    "window_start": None,
                    "window_end": None,
                    "data_source_ref": "source:cuebook-btc-d1-signal-v1",
                    "benchmark_ref": None,
                    "event_ref": "SIGNAL_btc-d1-close-65000-volume-20",
                    "description": "日线收盘 > 65,000 且成交量 >= 前20个完整日均量",
                },
                {
                    "id": "C2",
                    "subject_ref": "primary",
                    "kind": "terminal_value",
                    "metric": "official_close",
                    "operator": "gt",
                    "target": {"value": None, "lower_bound": None, "upper_bound": None, "unit": "USD", "value_source": "trigger_observation"},
                    "observation_mode": "first_after_event",
                    "window_start": None,
                    "window_end": None,
                    "data_source_ref": "source:cuebook-btc-usd-utc-d1",
                    "benchmark_ref": None,
                    "event_ref": "EVENT_btc-halving-next",
                    "description": "The first sealed UTC daily close after the next halving is above the activation close.",
                },
            ],
        }
        item["failure"]["text"] = "The claim fails if the first sealed UTC daily close after the next halving is at or below the activation close."
        item["resolution"].update({
            "primary_source_ref": "source:cuebook-btc-usd-utc-d1",
            "fallback_source_refs": ["source:coinbase-btc-usd-d1"],
        })
        item["public_view"]["settlement_summary"] = "The signal activates the long view; success is measured against the activation close at the next halving."
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(
            result["generated_one_line"],
            "BTC 条件看多｜至下一次 BTC 减半｜日线收盘 > 65,000 且成交量 >= 前20个完整日均量 -> 事件后首次官方收盘 > 触发收盘价｜待结算",
        )

    def test_compound_all(self):
        item = base_claim()
        item["success"]["conditions"].append({
            "id": "C2",
            "subject_ref": "event:hormuz-traffic",
            "kind": "event",
            "metric": "event_status",
            "operator": "occurred",
            "target": {"value": None, "lower_bound": None, "upper_bound": None, "unit": None, "value_source": "event"},
            "observation_mode": "event_by_expiry",
            "window_start": None,
            "window_end": None,
            "data_source_ref": "source:maritime-advisory",
            "benchmark_ref": None,
            "event_ref": "EVENT_verified-traffic-restriction",
            "description": "到期前权威航运数据确认通航仍受限",
        })
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn(" 且 到期前权威航运数据确认通航仍受限", result["generated_one_line"])

    def test_relative_requires_benchmark(self):
        item = base_claim()
        item["direction"] = "outperform"
        condition = item["success"]["conditions"][0]
        condition.update({"kind": "relative_return", "metric": "excess_return_pct", "benchmark_ref": None})
        condition["target"].update({"value": 0, "unit": "%", "value_source": "benchmark"})
        item["resolution"]["score_modes"] = ["binary_accuracy", "excess_return"]
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertFalse(result["valid"])
        self.assertIn("RELATIVE_CONTRACT", {entry["code"] for entry in result["errors"]})

    def test_relative_one_line_names_benchmark(self):
        item = base_claim()
        item["direction"] = "outperform"
        condition = item["success"]["conditions"][0]
        condition.update({
            "kind": "relative_return",
            "metric": "excess_return_pct",
            "benchmark_ref": "benchmark:XLE:ARCX:last_close",
        })
        condition["target"].update({"value": 0, "unit": "%", "value_source": "benchmark"})
        item["resolution"]["score_modes"] = ["binary_accuracy", "excess_return"]
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("（相对 XLE）", result["generated_one_line"])

    def test_frozen_hash(self):
        item = base_claim()
        item["state"] = "frozen"
        item["public_view"]["status_label"] = "已冻结"
        item["public_view"]["one_line"] = MODULE.render_one_line(item)
        item["lineage"]["canonical_hash"] = MODULE.canonical_hash(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])
        changed = copy.deepcopy(item)
        changed["claim_text"] = "Changed after freeze."
        self.assertFalse(MODULE.validate(changed)["valid"])


if __name__ == "__main__":
    unittest.main()
