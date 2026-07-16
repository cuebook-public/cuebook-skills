from __future__ import annotations

import copy
import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "validate_release_bundle.py"
SPEC = importlib.util.spec_from_file_location("validate_release_bundle", SCRIPT_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


HASH_A = "sha256:" + "a" * 64
HASH_B = "sha256:" + "b" * 64


def release_item(item_id: str = "release_item_x") -> dict:
    return {
        "release_item_id": item_id,
        "artifact": {
            "ref": "artifact://post/one",
            "schema_version": "post-v1",
            "content_hash": HASH_A,
            "publication_state": "ready",
            "selected_variant": "x",
        },
        "platform": "x",
        "account_ref": "account:x:main",
        "execution_mode": "manual_handoff",
        "capability": {
            "status": "unverified",
            "checked_at": None,
            "official_source_url": None,
            "adapter_id": None,
            "supports": {"create": False, "draft": False, "schedule": False, "edit": False, "delete": False, "status": False},
        },
        "policy": {
            "decision": "ready",
            "checked_at": "2026-07-14T02:00:00Z",
            "source_urls": ["https://docs.x.com/x-api/posts/create-post"],
            "notes": "Current platform policy checked.",
        },
        "approvals": {
            "content": {"status": "approved", "approved_by": "user:owner", "approved_at": "2026-07-14T03:01:00Z"},
            "release": {"status": "approved", "approved_by": "user:owner", "approved_at": "2026-07-14T03:02:00Z"},
        },
        "schedule": {"publish_at": None, "timezone": None, "embargo_until": None, "expires_at": None},
        "payload": {"payload_hash": HASH_B, "preview_ref": "preview://post/one", "asset_refs": []},
        "depends_on": [],
        "idempotency_key": None,
        "manual_handoff": {
            "required": True,
            "handoff_ref": "handoff://post/one",
            "checklist": ["Open the final preview.", "Confirm the account and visible disclosures."],
        },
        "rollback": {"mode": "manual", "edit_supported": True, "delete_supported": True, "notes": "Use the native platform controls."},
        "preflight": {"status": "pass", "checks": ["Final payload frozen."], "repairs": []},
    }


def base_artifact() -> dict:
    return {
        "schema_version": "release-bundle.v1",
        "release_id": "release_0123456789abcdef",
        "prepared_at": "2026-07-14T03:00:00Z",
        "operation": "prepare_only",
        "program_ref": "content_program_0123456789abcdef",
        "items": [release_item()],
        "quality_report": {"scores": {}, "hard_failures": [], "revisions": []},
        "release_state": "ready",
    }


def bind_settlement_protocol(artifact: dict, claim_state: str = "frozen", formula_state: str = "frozen") -> None:
    claim_hash = "c" * 64
    artifact["items"][0]["artifact"]["settlement_claim"] = {
        "ref": "SETTLE_uso20260714_terminal",
        "schema_version": "settlement-claim-v1",
        "canonical_hash": claim_hash,
        "state": claim_state,
    }
    artifact["items"][0]["artifact"]["settlement_formula"] = {
        "ref": "FORMULA_uso20260714_terminal",
        "schema_version": "settlement-formula-v1",
        "canonical_hash": "d" * 64,
        "claim_ref": "SETTLE_uso20260714_terminal",
        "claim_hash": claim_hash,
        "state": formula_state,
    }


def make_x_api(item: dict) -> None:
    item["execution_mode"] = "api_direct"
    item["capability"] = {
        "status": "verified",
        "checked_at": "2026-07-14T02:00:00Z",
        "official_source_url": "https://docs.x.com/x-api/posts/create-post",
        "adapter_id": "x-api-v2-create",
        "supports": {"create": True, "draft": False, "schedule": False, "edit": True, "delete": True, "status": True},
    }
    item["idempotency_key"] = "release-x-0123456789"
    item["manual_handoff"] = {"required": False, "handoff_ref": None, "checklist": []}
    item["rollback"] = {"mode": "api", "edit_supported": True, "delete_supported": True, "notes": "Adapter exposes edit and delete."}


class ValidateReleaseBundleTests(unittest.TestCase):
    def result(self, artifact: dict) -> dict:
        return VALIDATOR.validate(artifact)

    def assert_valid(self, artifact: dict) -> dict:
        result = self.result(artifact)
        self.assertTrue(result["valid"], result["errors"])
        return result

    def test_valid_ready_manual_handoff(self) -> None:
        result = self.assert_valid(base_artifact())
        self.assertEqual(result["computed_release_state"], "ready")

    def test_valid_ready_with_frozen_settlement_protocol(self) -> None:
        artifact = base_artifact()
        bind_settlement_protocol(artifact)
        self.assert_valid(artifact)

    def test_unfrozen_settlement_claim_blocks_release(self) -> None:
        artifact = base_artifact()
        bind_settlement_protocol(artifact, claim_state="ready")
        result = self.result(artifact)
        self.assertIn("SETTLEMENT_CLAIM_NOT_FROZEN", {entry["code"] for entry in result["blockers"]})
        self.assertEqual(result["computed_release_state"], "blocked")

    def test_settlement_claim_without_formula_blocks_release(self) -> None:
        artifact = base_artifact()
        bind_settlement_protocol(artifact)
        del artifact["items"][0]["artifact"]["settlement_formula"]
        result = self.result(artifact)
        self.assertIn("SETTLEMENT_FORMULA_REQUIRED", {entry["code"] for entry in result["blockers"]})

    def test_settlement_formula_must_link_exact_claim_hash(self) -> None:
        artifact = base_artifact()
        bind_settlement_protocol(artifact)
        artifact["items"][0]["artifact"]["settlement_formula"]["claim_hash"] = "e" * 64
        result = self.result(artifact)
        self.assertIn("SETTLEMENT_PROTOCOL_HASH_MISMATCH", {entry["code"] for entry in result["errors"]})

    def test_valid_ready_website_handoff_has_discovery_preflights(self) -> None:
        artifact = base_artifact()
        release = artifact["items"][0]
        release.update(
            {
                "platform": "website",
                "account_ref": "site:cuebook:main",
                "web_discovery_gate": {
                    "seo_pack_ref": "seo_pack_1111111111111111",
                    "seo_state": "pass",
                    "geo_pack_ref": "geo_pack_1111111111111111",
                    "geo_state": "pass",
                },
            }
        )
        release["policy"].update(
            {"source_urls": ["https://example.com/publishing-policy"], "notes": "Owned-site publishing policy checked."}
        )
        self.assert_valid(artifact)

    def test_website_release_cannot_skip_seo_preflight(self) -> None:
        artifact = base_artifact()
        release = artifact["items"][0]
        release["platform"] = "website"
        release["preflight"] = {"status": "block", "checks": [], "repairs": ["Run Cuebook SEO preflight."]}
        artifact["release_state"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("WEB_DISCOVERY_GATE", {entry["code"] for entry in result["blockers"]})

    def test_pending_release_approval_is_valid_needs_approval(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["approvals"]["release"] = {"status": "pending", "approved_by": None, "approved_at": None}
        artifact["release_state"] = "needs_approval"
        result = self.assert_valid(artifact)
        self.assertEqual(result["computed_release_state"], "needs_approval")

    def test_known_content_blocker_is_valid_blocked_bundle(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["artifact"]["publication_state"] = "conditional"
        artifact["items"][0]["preflight"] = {"status": "block", "checks": [], "repairs": ["Resolve the upstream content gate."]}
        artifact["release_state"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("ARTIFACT_NOT_READY", {entry["code"] for entry in result["blockers"]})

    def test_valid_ready_x_api_bundle(self) -> None:
        artifact = base_artifact()
        make_x_api(artifact["items"][0])
        self.assert_valid(artifact)

    def test_unverified_api_capability_is_valid_when_blocked(self) -> None:
        artifact = base_artifact()
        make_x_api(artifact["items"][0])
        artifact["items"][0]["capability"].update({"status": "unverified", "checked_at": None, "official_source_url": None, "adapter_id": None})
        artifact["items"][0]["preflight"] = {"status": "block", "checks": [], "repairs": ["Verify official account capability."]}
        artifact["release_state"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("CAPABILITY_UNVERIFIED", {entry["code"] for entry in result["blockers"]})

    def test_secret_and_fake_receipt_fields_are_invalid(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["token"] = "do-not-store"
        artifact["items"][0]["external_id"] = "123"
        codes = {entry["code"] for entry in self.result(artifact)["errors"]}
        self.assertIn("SECRET_FIELD", codes)
        self.assertIn("FAKE_RECEIPT", codes)

    def test_duplicate_idempotency_is_invalid(self) -> None:
        artifact = base_artifact()
        first = artifact["items"][0]
        make_x_api(first)
        second = copy.deepcopy(first)
        second["release_item_id"] = "release_item_second"
        artifact["items"].append(second)
        codes = {entry["code"] for entry in self.result(artifact)["errors"]}
        self.assertIn("DUPLICATE_IDEMPOTENCY", codes)

    def test_expired_schedule_is_a_blocker(self) -> None:
        artifact = base_artifact()
        make_x_api(artifact["items"][0])
        artifact["items"][0]["execution_mode"] = "api_scheduled"
        artifact["items"][0]["capability"]["supports"]["schedule"] = True
        artifact["items"][0]["schedule"] = {
            "publish_at": "2026-07-15T03:00:00Z",
            "timezone": "Asia/Shanghai",
            "embargo_until": None,
            "expires_at": "2026-07-15T02:00:00Z",
        }
        artifact["items"][0]["preflight"] = {"status": "block", "checks": [], "repairs": ["Move publication before expiry."]}
        artifact["release_state"] = "blocked"
        result = self.assert_valid(artifact)
        self.assertIn("EXPIRY_ORDER", {entry["code"] for entry in result["blockers"]})

    def test_release_approval_cannot_precede_content_approval(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["approvals"]["release"]["approved_at"] = "2026-07-14T03:00:30Z"
        self.assertIn("APPROVAL_ORDER", {entry["code"] for entry in self.result(artifact)["errors"]})

    def test_dependency_cycle_is_invalid(self) -> None:
        artifact = base_artifact()
        second = release_item("release_item_second")
        artifact["items"][0]["depends_on"] = ["release_item_second"]
        second["depends_on"] = ["release_item_x"]
        artifact["items"].append(second)
        self.assertIn("DEPENDENCY_CYCLE", {entry["code"] for entry in self.result(artifact)["errors"]})

    def test_passing_preflight_cannot_hide_policy_blocker(self) -> None:
        artifact = base_artifact()
        artifact["items"][0]["policy"]["decision"] = "conditional"
        artifact["release_state"] = "blocked"
        self.assertIn("PREFLIGHT_INCONSISTENT", {entry["code"] for entry in self.result(artifact)["errors"]})


if __name__ == "__main__":
    unittest.main()
