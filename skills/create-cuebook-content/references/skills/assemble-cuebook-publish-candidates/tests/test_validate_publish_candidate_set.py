import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_publish_candidate_set.py"
SCHEMA = Path(__file__).parents[1] / "references" / "publish-candidate-set-v1.schema.json"
WORDMARK = (Path(__file__).resolve().parents[2] / "direct-cuebook-viewpoint-visual" / "assets" / "cuebook-wordmark.svg").read_text(encoding="utf-8").strip().replace(
    "<svg ",
    '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ',
    1,
).replace('fill="#F2F3F4"', 'fill="currentColor"')
SPEC = importlib.util.spec_from_file_location("candidate_validator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


FINGERPRINT = "sha256:" + "a" * 64


def launch_html() -> str:
    return f'<style>main{{font-family:"Cuebook Noi","PingFang SC",sans-serif}}.cuebook-wordmark{{right:41px;bottom:34px;width:136px;height:26px;color:#101411}}</style><main data-cuebook-visual-contract="launch-v1" data-entry-role="claim" data-color-system="semantic-v1" data-palette-family="quiet-cobalt" data-palette-strategy="thesis_native" data-palette-preset="quiet-cobalt" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json"><h1 data-role="claim" data-visual-level="1">观点</h1><div data-role="evidence" data-visual-level="2" data-color-role="observed"></div>{WORDMARK}</main>'


def quality():
    values = {
        "claim_fidelity": 9.2,
        "compression": 9.0,
        "human_voice": 8.8,
        "evidence_integrity": 9.3,
        "visual_craft": 9.0,
        "three_second": 9.1,
    }
    values["weighted_score"] = round(sum(values[key] * weight for key, weight in MODULE.WEIGHTS.items()), 3)
    values["verdict"] = "pass"
    return values


def evidence_anchor(request_class="news_anchor"):
    anchor = {
        "anchor_id": "EVA_HOOD_CHAIN",
        "request_class": request_class,
        "kind": "company_release",
        "title": "Robinhood launches tokenized-stock infrastructure",
        "publisher": "Robinhood",
        "url": "https://newsroom.aboutrobinhood.com/",
        "published_at": "2026-07-01T12:00:00Z",
        "as_of": "2026-07-14T08:27:00Z",
        "fact_refs": ["F1"],
    }
    if request_class in {"valuation_metric", "comparison_metric"}:
        anchor.update({
            "kind": "estimate_data",
            "published_at": None,
            "metric": {
                "name": "Forward P/E",
                "basis": "NTM diluted EPS, calendarized to 2027",
                "value_state": "numeric",
                "value": 27.4,
                "unit": "x",
                "comparison_subject": "COIN" if request_class == "comparison_metric" else None,
                "not_meaningful_reason": None,
            },
        })
    elif request_class == "price_level":
        anchor.update({
            "kind": "market_data",
            "published_at": None,
            "price_observation": {
                "instrument_ref": "INS_HOOD_XNAS",
                "value": 106.03,
                "unit": "USD",
                "observed_at": "2026-07-14T20:00:00Z",
                "observation_basis": "official_close",
                "market_session": "regular",
            },
        })
    elif request_class == "market_series":
        anchor.update({
            "kind": "market_data",
            "published_at": None,
            "market_series": {
                "series_ref": "SER_HOOD_D1_CLOSE",
                "instrument_refs": ["INS_HOOD_XNAS"],
                "metric": "official_close",
                "interval": "1d",
                "window_start": "2026-06-16T20:00:00Z",
                "window_end": "2026-07-14T20:00:00Z",
                "timezone": "America/New_York",
                "observation_basis": "sealed regular-session daily bars",
            },
        })
    elif request_class == "settlement_reference":
        anchor.update({
            "kind": "market_data",
            "published_at": None,
            "settlement_reference": {
                "claim_ref": "SETTLE_HOOD_CHAIN_20260715",
                "eligibility_fields": sorted(MODULE.SETTLEMENT_ELIGIBILITY_FIELDS),
            },
        })
    return anchor


def candidate(index, label, angle, headline, body, close):
    copy_block = {
        "headline": headline,
        "body": body,
        "close": close,
        "tags": ["事件驱动", "预期修正", "直接做多"],
        "visible_char_count": 0,
    }
    copy_block["visible_char_count"] = MODULE.visible_char_count(copy_block)
    return {
        "candidate_id": f"PUBCAND_HOOD_{index}",
        "label": label,
        "angle": angle,
        "meaning_fingerprint": FINGERPRINT,
        "post_ref": f"POST_HOOD_{index}",
        "copy": copy_block,
        "visual": {
            "direction_ref": f"VDIR_HOOD_{index}",
            "html_ref": f"candidate-{index}/viewpoint.html",
            "preview_ref": f"candidate-{index}/viewpoint.png",
            "compact_preview_ref": f"candidate-{index}/viewpoint-622.png",
            "visible_char_count": 2,
            "alt_text": f"HOOD candidate {index}",
        },
        "evidence_anchors": [evidence_anchor()],
        "settlement": {
            "claim_ref": "SETTLE_HOOD_CHAIN_20260715",
            "one_line": "HOOD 看多｜截至 2026-08-14｜到期常规收盘 > 113.45 USD｜待确认",
            "state": "needs_confirmation",
        },
        "public_disclosures": ["由 Cuebook 协助核验公开信息"],
        "quality": quality(),
    }


def base_set():
    return {
        "schema_version": "publish-candidate-set-v1",
        "candidate_set_id": "PUBSET_HOOD_CHAIN_20260715",
        "revision": 1,
        "state": "ready_for_selection",
        "lineage": {
            "expression_plan_ref": "CEXP_HOOD_CHAIN_20260715@r1",
            "fingerprint_sha256": FINGERPRINT,
            "input_artifact_refs": ["RESEARCH_HOOD_CHAIN", "VDSET_HOOD_CHAIN"],
            "settlement_claim_ref": "SETTLE_HOOD_CHAIN_20260715",
        },
        "generation_policy": {
            "candidate_count": 3,
            "autonomous": True,
            "user_iteration_required": False,
            "calibration_owner": "skills",
            "fallback_policy": "degrade_then_omit",
            "linked_evidence_policy": "required_when_material",
            "retry_limit": 2,
            "copy_budget": {
                "headline_max": 32,
                "body_max": 220,
                "close_max": 56,
                "total_max": 300,
                "paragraph_max": 4,
                "hard_number_max": 3,
            },
            "visual_visible_char_max": 120,
        },
        "shared_view": {
            "ticker": "HOOD",
            "direction": "long",
            "horizon": "30 days",
            "claim": "Robinhood Chain may earn HOOD a financial-infrastructure re-rating.",
            "caveat": "Usage, monetization, token rights, and jurisdiction remain material constraints.",
            "material_evidence": {
                "requirements": [{
                    "requirement_id": "D1",
                    "request_class": "news_anchor",
                    "required_anchor_ids": ["EVA_HOOD_CHAIN"],
                }],
            },
            "settlement_eligibility": {
                "status": "eligible",
                "requirements": {
                    "metric": True,
                    "operator": True,
                    "threshold": True,
                    "deadline": True,
                    "authoritative_source": True,
                },
                "missing_requirements": [],
            },
        },
        "calibration": {
            "research": "ready",
            "market_data": "ready",
            "semantics": "ready",
            "policy": "ready",
            "visual": "ready",
            "settlement": "degraded",
            "repairs": ["Kept the 7% APY attached to USDG lending."],
        },
        "candidates": [
            candidate(1, "直给版", "conviction", "我先看多 HOOD 30 天", "Robinhood Chain 已经上线。市场接下来会开始重估它手里的全球分发和链上金融入口。", "财报拿不出真实使用，我撤回这次估值换挡。"),
            candidate(2, "数据版", "evidence", "一条链，带着现成的分发", "Robinhood 已经握有大规模客户和平台资产。链上股票若开始形成交易、抵押和结算闭环，HOOD 的收入边界会被重新打开。", "下一次财报，先看使用，再谈想象。"),
            candidate(3, "催化版", "catalyst", "主网上线，只完成了第一半", "前半段是产品发布，后半段是交易量、钱包活跃和收入。市场现在交易的是后半段能不能出现。", "我给 HOOD 一个财报前后的多头窗口。"),
        ],
        "selection": {
            "selected_candidate_id": None,
            "selection_receipt_ref": None,
            "content_confirmed": False,
            "settlement_confirmed": False,
            "settlement_confirmation_fields": [],
        },
        "quality_report": {"decision": "ready_for_selection", "warnings": ["Settlement remains proposed."], "hard_failures": []},
    }


def bind_material_anchor(item, request_class, anchor=None):
    anchor = copy.deepcopy(anchor or evidence_anchor(request_class))
    item["shared_view"]["material_evidence"]["requirements"] = [{
        "requirement_id": "D1",
        "request_class": request_class,
        "required_anchor_ids": [anchor["anchor_id"]],
    }]
    for candidate_item in item["candidates"]:
        candidate_item["evidence_anchors"] = [copy.deepcopy(anchor)]


def confirm_selection(item, *, settlement=False):
    item["state"] = "selected"
    item["quality_report"]["decision"] = "selected"
    item["selection"].update({
        "selected_candidate_id": item["candidates"][0]["candidate_id"],
        "selection_receipt_ref": "SEL_HOOD_20260715",
        "content_confirmed": True,
        "settlement_confirmed": settlement,
        "settlement_confirmation_fields": sorted(MODULE.SETTLEMENT_CONFIRMATION_FIELDS) if settlement else [],
    })
    if settlement:
        for candidate_item in item["candidates"]:
            candidate_item["settlement"]["state"] = "frozen"


class CandidateSetTests(unittest.TestCase):
    def test_valid_ready_set(self):
        result = MODULE.validate(base_set())
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["stats"]["candidate_count"], 3)

    def test_valid_ready_set_without_settlement(self):
        item = base_set()
        item["lineage"]["settlement_claim_ref"] = None
        item["shared_view"]["settlement_eligibility"] = {
            "status": "ineligible",
            "requirements": {field: False for field in MODULE.SETTLEMENT_ELIGIBILITY_FIELDS},
            "missing_requirements": [],
        }
        item["calibration"]["settlement"] = "not_applicable"
        for candidate_item in item["candidates"]:
            candidate_item["settlement"] = {"claim_ref": None, "one_line": None, "state": "not_applicable"}
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_requires_three_candidates(self):
        item = base_set()
        item["candidates"].pop()
        result = MODULE.validate(item)
        self.assertIn("CANDIDATE_COUNT", {entry["code"] for entry in result["errors"]})

    def test_angles_are_distinct(self):
        item = base_set()
        item["candidates"][1]["angle"] = "conviction"
        result = MODULE.validate(item)
        self.assertIn("DUPLICATE_ANGLE", {entry["code"] for entry in result["errors"]})

    def test_fingerprint_cannot_drift(self):
        item = base_set()
        item["candidates"][0]["meaning_fingerprint"] = "sha256:" + "b" * 64
        result = MODULE.validate(item)
        self.assertIn("FINGERPRINT_MISMATCH", {entry["code"] for entry in result["errors"]})

    def test_copy_budget_is_hard(self):
        item = base_set()
        item["candidates"][0]["copy"]["body"] = "长" * 280
        item["candidates"][0]["copy"]["visible_char_count"] = MODULE.visible_char_count(item["candidates"][0]["copy"])
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("COPY_BUDGET_EXCEEDED", codes)
        self.assertIn("TOTAL_COPY_BUDGET", codes)

    def test_char_count_is_verified(self):
        item = base_set()
        item["candidates"][0]["copy"]["visible_char_count"] += 1
        result = MODULE.validate(item)
        self.assertIn("CHAR_COUNT", {entry["code"] for entry in result["errors"]})

    def test_stock_ai_phrase_is_rejected(self):
        item = base_set()
        item["candidates"][0]["copy"]["body"] = "值得关注的是，Robinhood Chain 已经上线。"
        item["candidates"][0]["copy"]["visible_char_count"] = MODULE.visible_char_count(item["candidates"][0]["copy"])
        result = MODULE.validate(item)
        self.assertIn("PUBLIC_LANGUAGE", {entry["code"] for entry in result["errors"]})

    def test_settlement_is_shared(self):
        item = base_set()
        item["candidates"][2]["settlement"]["one_line"] = "HOOD 看多｜另一个期限"
        result = MODULE.validate(item)
        self.assertIn("SETTLEMENT_DRIFT", {entry["code"] for entry in result["errors"]})

    def test_material_news_anchor_is_required_in_every_candidate(self):
        item = base_set()
        item["candidates"][1]["evidence_anchors"] = []
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("MATERIAL_ANCHOR_MISSING", codes)
        self.assertIn("EVIDENCE_ANCHOR_DRIFT", codes)

    def test_low_quality_candidate_is_not_exposed(self):
        item = base_set()
        item["candidates"][1]["quality"]["human_voice"] = 6.0
        item["candidates"][1]["quality"]["weighted_score"] = round(sum(item["candidates"][1]["quality"][key] * weight for key, weight in MODULE.WEIGHTS.items()), 3)
        item["candidates"][1]["quality"]["verdict"] = "reject"
        result = MODULE.validate(item)
        self.assertIn("FAILED_CANDIDATE_EXPOSED", {entry["code"] for entry in result["errors"]})

    def test_assets_can_be_checked(self):
        item = base_set()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for candidate_item in item["candidates"]:
                for key in ("preview_ref", "compact_preview_ref"):
                    path = root / candidate_item["visual"][key]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b"png")
                html = root / candidate_item["visual"]["html_ref"]
                html.write_text(launch_html(), encoding="utf-8")
            self.assertTrue(MODULE.validate(item, root)["valid"])
            (root / item["candidates"][0]["visual"]["preview_ref"]).unlink()
            result = MODULE.validate(item, root)
            self.assertIn("VISUAL_MISSING", {entry["code"] for entry in result["errors"]})

    def test_assets_require_launch_visual_contract(self):
        item = base_set()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for candidate_item in item["candidates"]:
                for key in ("preview_ref", "compact_preview_ref"):
                    path = root / candidate_item["visual"][key]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b"png")
                html = root / candidate_item["visual"]["html_ref"]
                html.write_text(launch_html(), encoding="utf-8")
            broken = root / item["candidates"][0]["visual"]["html_ref"]
            broken.write_text("<main>观点</main>", encoding="utf-8")
            result = MODULE.validate(item, root)
            self.assertIn("VISUAL_LAUNCH_CONTRACT", {entry["code"] for entry in result["errors"]})

    def test_ready_set_cannot_preselect(self):
        item = base_set()
        item["selection"]["selected_candidate_id"] = item["candidates"][0]["candidate_id"]
        result = MODULE.validate(item)
        self.assertIn("PRESELECTED", {entry["code"] for entry in result["errors"]})

    def test_settlement_confirmation_needs_all_visible_fields(self):
        item = base_set()
        item["selection"]["settlement_confirmed"] = True
        item["selection"]["settlement_confirmation_fields"] = ["subject", "direction"]
        result = MODULE.validate(item)
        self.assertIn("SETTLEMENT_CONFIRMATION", {entry["code"] for entry in result["errors"]})

    def test_schema_replaces_coarse_material_flags(self):
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        material = schema["properties"]["shared_view"]["properties"]["material_evidence"]
        self.assertEqual(set(material["properties"]), {"requirements"})
        request_classes = set(schema["$defs"]["requestClass"]["enum"])
        self.assertEqual(request_classes, MODULE.MATERIAL_REQUEST_CLASSES)
        confirmation_fields = set(schema["$defs"]["settlementConfirmationField"]["enum"])
        self.assertEqual(confirmation_fields, MODULE.SETTLEMENT_CONFIRMATION_FIELDS)
        self.assertNotIn("source", confirmation_fields)

    def test_old_coarse_material_flags_are_rejected(self):
        item = base_set()
        item["shared_view"]["material_evidence"] = {
            "news_required": True,
            "metric_required": False,
            "required_anchor_ids": ["EVA_HOOD_CHAIN"],
        }
        result = MODULE.validate(item)
        self.assertIn("MATERIAL_EVIDENCE_FIELDS", {entry["code"] for entry in result["errors"]})

    def test_all_material_request_classes_are_supported(self):
        for request_class in sorted(MODULE.MATERIAL_REQUEST_CLASSES):
            with self.subTest(request_class=request_class):
                item = base_set()
                bind_material_anchor(item, request_class)
                result = MODULE.validate(item)
                self.assertTrue(result["valid"], result["errors"])

    def test_typed_material_requirements_can_coexist(self):
        item = base_set()
        requirements = []
        anchors = []
        for index, request_class in enumerate(sorted(MODULE.MATERIAL_REQUEST_CLASSES), start=1):
            anchor = evidence_anchor(request_class)
            anchor["anchor_id"] = f"EVA_TYPED_{index}"
            anchors.append(anchor)
            requirements.append({
                "requirement_id": f"D{index}",
                "request_class": request_class,
                "required_anchor_ids": [anchor["anchor_id"]],
            })
        item["shared_view"]["material_evidence"]["requirements"] = requirements
        for candidate_item in item["candidates"]:
            candidate_item["evidence_anchors"] = copy.deepcopy(anchors)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_metric_anchor_accepts_explicit_not_meaningful(self):
        item = base_set()
        anchor = evidence_anchor("valuation_metric")
        anchor["metric"].update({
            "value_state": "N/M",
            "value": None,
            "not_meaningful_reason": "Attributable earnings are non-positive.",
        })
        bind_material_anchor(item, "valuation_metric", anchor)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_metric_anchor_requires_basis_and_numeric_or_nm_value(self):
        item = base_set()
        anchor = evidence_anchor("valuation_metric")
        anchor["metric"].pop("basis")
        bind_material_anchor(item, "valuation_metric", anchor)
        result = MODULE.validate(item)
        self.assertIn("EVIDENCE_METRIC_FIELDS", {entry["code"] for entry in result["errors"]})

    def test_price_anchor_requires_observation_basis(self):
        item = base_set()
        anchor = evidence_anchor("price_level")
        anchor["price_observation"].pop("observation_basis")
        bind_material_anchor(item, "price_level", anchor)
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("EVIDENCE_PRICE_FIELDS", codes)
        self.assertIn("EVIDENCE_PRICE_BASIS", codes)

    def test_material_news_requires_published_at(self):
        item = base_set()
        anchor = evidence_anchor("news_anchor")
        anchor["published_at"] = None
        bind_material_anchor(item, "news_anchor", anchor)
        result = MODULE.validate(item)
        self.assertIn("MATERIAL_NEWS_PUBLISHED_AT", {entry["code"] for entry in result["errors"]})

    def test_required_anchor_type_cannot_drift(self):
        item = base_set()
        item["candidates"][1]["evidence_anchors"][0]["request_class"] = "official_event"
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("MATERIAL_ANCHOR_TYPE", codes)
        self.assertIn("EVIDENCE_ANCHOR_DRIFT", codes)

    def test_selected_content_can_leave_settlement_unconfirmed(self):
        item = base_set()
        confirm_selection(item)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_ready_set_cannot_freeze_settlement(self):
        item = base_set()
        for candidate_item in item["candidates"]:
            candidate_item["settlement"]["state"] = "frozen"
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("SETTLEMENT_PREMATURE_FREEZE", codes)
        self.assertIn("SETTLEMENT_STATE", codes)

    def test_explicit_selection_and_settlement_confirmation_can_freeze(self):
        item = base_set()
        confirm_selection(item, settlement=True)
        result = MODULE.validate(item)
        self.assertTrue(result["valid"], result["errors"])

    def test_confirmation_uses_eligibility_field_names(self):
        item = base_set()
        confirm_selection(item, settlement=True)
        fields = item["selection"]["settlement_confirmation_fields"]
        fields.remove("authoritative_source")
        fields.append("source")
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("SETTLEMENT_CONFIRMATION_FIELDS", codes)
        self.assertIn("SETTLEMENT_CONFIRMATION", codes)

    def test_bound_claim_requires_complete_eligibility(self):
        item = base_set()
        item["shared_view"]["settlement_eligibility"]["requirements"]["operator"] = False
        result = MODULE.validate(item)
        codes = {entry["code"] for entry in result["errors"]}
        self.assertIn("SETTLEMENT_ELIGIBILITY_MISMATCH", codes)
        self.assertIn("SETTLEMENT_ELIGIBILITY", codes)


if __name__ == "__main__":
    unittest.main()
