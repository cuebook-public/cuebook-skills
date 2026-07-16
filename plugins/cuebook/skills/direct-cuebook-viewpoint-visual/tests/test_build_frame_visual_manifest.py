from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("manifest_builder", ROOT / "scripts" / "build_frame_visual_manifest.py")
BUILDER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(BUILDER)


def capture_report(with_og: bool = False) -> dict:
    outputs = [
        {"kind": "full", "ref": "viewpoint-2488.png", "width": 2488, "height": 1056, "sha256": "sha256:" + "a" * 64, "pixel_sha256": "sha256:" + "d" * 64},
        {"kind": "compact_622", "ref": "viewpoint-622.png", "width": 622, "height": 264, "sha256": "sha256:" + "b" * 64, "pixel_sha256": "sha256:" + "e" * 64},
    ]
    if with_og:
        outputs.append({"kind": "og", "ref": "og-1200x630.png", "width": 1200, "height": 630, "sha256": "sha256:" + "c" * 64, "pixel_sha256": "sha256:" + "f" * 64})
    return {"derivatives": outputs}


def render_audit(valid: bool = True) -> dict:
    return {"valid": valid, "profile_version": "render-audit-wide-v1", "audited_at": "2026-07-17T00:00:00.000Z"}


def direction_set() -> dict:
    return {
        "bindings": [
            {"binding_id": "BIND_VIEW", "label": "creator view", "state": "creator_view", "source_refs": ["MVS_1"], "material_to_claim": True, "selected_for_display": True},
            {"binding_id": "BIND_HIDDEN", "label": "unused", "state": "observed", "source_refs": ["F_2"], "material_to_claim": False, "selected_for_display": False},
        ]
    }


class ManifestBuilderTests(unittest.TestCase):
    def build(self, *, with_og: bool = False, audit_valid: bool = True, license_mode: str = "production", alt: dict | None = None):
        with TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "font-assets-v1.json"
            fonts.write_text(json.dumps({"profile": "cuebook-noi-v1", "license_mode": license_mode, "files": []}))
            alt_text = alt if alt is not None else {"publication": "USO 30 天偏多的观点图", "compact": "USO 观点紧凑图", "og": "USO 分享卡"}
            return BUILDER.build(capture_report(with_og=with_og), render_audit(audit_valid), direction_set(), fonts, alt_text)

    def test_builds_manifest_with_stable_jcs_hash(self) -> None:
        manifest, errors = self.build(with_og=True)
        self.assertEqual(errors, [])
        self.assertEqual(manifest["schema_version"], "frame-visual-manifest-v1")
        self.assertEqual(set(manifest["role_hashes"]), {"publication", "compact", "og"})
        self.assertEqual(manifest["role_hashes"]["publication"], "sha256:" + "d" * 64)
        self.assertEqual(
            manifest["capture_audit"],
            {"decision": "ready", "status": "passed", "profile_version": "render-audit-wide-v1", "audited_at": "2026-07-17T00:00:00.000Z"},
        )
        self.assertEqual(len(manifest["source_bindings"]), 1)
        first = BUILDER.jcs_sha256(manifest)
        second = BUILDER.jcs_sha256(json.loads(json.dumps(manifest)))
        self.assertEqual(first, second)
        self.assertRegex(first, r"^sha256:[0-9a-f]{64}$")

    def test_missing_compact_blocks_manifest(self) -> None:
        report = capture_report()
        report["derivatives"] = [o for o in report["derivatives"] if o["kind"] != "compact_622"]
        with TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "fonts.json"
            fonts.write_text(json.dumps({"profile": "cuebook-noi-v1", "license_mode": "production"}))
            manifest, errors = BUILDER.build(report, render_audit(), direction_set(), fonts, {"publication": "x"})
        self.assertIsNone(manifest)
        self.assertIn("ROLE_MISSING", {e["code"] for e in errors})

    def test_byte_hash_cannot_stand_in_for_pixel_hash(self) -> None:
        report = capture_report()
        for output in report["derivatives"]:
            output.pop("pixel_sha256")
        with TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "fonts.json"
            fonts.write_text(json.dumps({"profile": "cuebook-noi-v1", "license_mode": "production"}))
            manifest, errors = BUILDER.build(report, render_audit(), direction_set(), fonts, {"publication": "x", "compact": "y"})
        self.assertIsNone(manifest)
        self.assertIn("PIXEL_HASH_MISSING", {e["code"] for e in errors})

    def test_duplicate_pixel_hashes_block_manifest(self) -> None:
        report = capture_report()
        report["derivatives"][1]["pixel_sha256"] = report["derivatives"][0]["pixel_sha256"]
        with TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "fonts.json"
            fonts.write_text(json.dumps({"profile": "cuebook-noi-v1", "license_mode": "production"}))
            manifest, errors = BUILDER.build(report, render_audit(), direction_set(), fonts, {"publication": "x", "compact": "y"})
        self.assertIsNone(manifest)
        self.assertIn("ROLE_HASH_DUPLICATE", {e["code"] for e in errors})

    def test_audit_without_metadata_blocks_manifest(self) -> None:
        with TemporaryDirectory() as tmp:
            fonts = Path(tmp) / "fonts.json"
            fonts.write_text(json.dumps({"profile": "cuebook-noi-v1", "license_mode": "production"}))
            manifest, errors = BUILDER.build(capture_report(), {"valid": True}, direction_set(), fonts, {"publication": "x", "compact": "y"})
        self.assertIsNone(manifest)
        self.assertIn("AUDIT_METADATA_MISSING", {e["code"] for e in errors})

    def test_failed_audit_blocks_manifest(self) -> None:
        manifest, errors = self.build(audit_valid=False)
        self.assertIsNone(manifest)
        self.assertIn("AUDIT_NOT_PASSED", {e["code"] for e in errors})

    def test_trial_fonts_block_manifest(self) -> None:
        manifest, errors = self.build(license_mode="evaluation")
        self.assertIsNone(manifest)
        self.assertIn("TRIAL_FONTS", {e["code"] for e in errors})

    def test_missing_alt_text_blocks_manifest(self) -> None:
        manifest, errors = self.build(alt={"publication": "有"})
        self.assertIsNone(manifest)
        self.assertIn("ALT_TEXT_MISSING", {e["code"] for e in errors})

    def test_numbers_are_rejected_from_jcs(self) -> None:
        with self.assertRaises(ValueError):
            BUILDER.jcs_sha256({"ratio": 0.5})


if __name__ == "__main__":
    unittest.main()
