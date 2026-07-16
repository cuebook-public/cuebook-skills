from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "release_builder",
    PLUGIN_ROOT / "scripts" / "build_release_skills.py",
)
BUILDER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(BUILDER)


def build(tmp_path: Path) -> dict:
    return BUILDER.build(PLUGIN_ROOT, tmp_path / "release")


def test_builds_every_public_entrypoint_as_valid_bundle(tmp_path: Path) -> None:
    manifest = build(tmp_path)
    assert manifest["valid"], manifest["errors"]
    built = {bundle["skill"] for bundle in manifest["bundles"]}
    assert built == {"query-cuebook", "create-cuebook-content"}
    assert all(bundle["valid"] for bundle in manifest["bundles"])


def test_create_bundle_closure_includes_front_door_and_query(tmp_path: Path) -> None:
    manifest = build(tmp_path)
    create = next(bundle for bundle in manifest["bundles"] if bundle["skill"] == "create-cuebook-content")
    assert "intake-cuebook-viewpoint" in create["closure"]
    assert "query-cuebook" in create["closure"]


def test_bundles_contain_no_plugin_level_references(tmp_path: Path) -> None:
    manifest = build(tmp_path)
    skill_names = {path.name for path in (PLUGIN_ROOT / "skills").iterdir() if path.is_dir()}
    pattern = BUILDER.skill_ref_pattern(skill_names)
    for bundle in manifest["bundles"]:
        bundle_root = tmp_path / "release" / bundle["skill"]
        for md in bundle_root.rglob("*.md"):
            text = md.read_text(encoding="utf-8")
            assert not re.search(r"\.\./\.\./assets/(?!plugin/)", text), md
            assert not pattern.search(text), md


def test_vendored_validators_import_without_plugin_tree(tmp_path: Path) -> None:
    build(tmp_path)
    bundled = [
        tmp_path / "release" / "query-cuebook" / "scripts" / "validate_query_bundle.py",
        tmp_path / "release" / "create-cuebook-content" / "references" / "skills"
        / "intake-cuebook-viewpoint" / "scripts" / "validate_viewpoint_intake.py",
    ]
    for script in bundled:
        assert script.exists(), script
        assert (script.parent / "validate_json_schema.py").exists(), script.parent
        completed = subprocess.run(
            [sys.executable, str(script), "--help"],
            capture_output=True,
            text=True,
            check=False,
        )
        assert completed.returncode == 0, completed.stderr


def test_bundle_frontmatter_follows_agent_skills_spec(tmp_path: Path) -> None:
    build(tmp_path)
    for name in ("query-cuebook", "create-cuebook-content"):
        front = BUILDER.parse_frontmatter(tmp_path / "release" / name / "SKILL.md")
        assert front["name"] == name
        assert 1 <= len(front["description"]) <= 1024
        assert front.get("license")
        assert front.get("compatibility")
