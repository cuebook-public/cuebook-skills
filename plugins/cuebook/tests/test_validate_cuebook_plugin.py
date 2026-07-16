from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "cuebook_plugin_validator",
    PLUGIN_ROOT / "scripts" / "validate_cuebook_plugin.py",
)
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(VALIDATOR)


def codes(result: dict) -> set[str]:
    return {error["code"] for error in result["errors"]}


def copied_plugin(tmp_path: Path) -> Path:
    target = tmp_path / "cuebook"
    shutil.copytree(PLUGIN_ROOT, target)
    return target


def rewrite(path: Path, mutate) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    mutate(payload)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_valid_plugin_package() -> None:
    result = VALIDATOR.validate(PLUGIN_ROOT)
    assert result["valid"], result
    assert result["stats"]["module_skill_counts"] == {"create": 28, "query": 11}
    modules = json.loads((PLUGIN_ROOT / "assets" / "cuebook-modules-v1.json").read_text(encoding="utf-8"))
    assert "factual_chart" in modules["routing_rules"]["query_deliverables"]
    assert "creator_viewpoint_graphic" in modules["routing_rules"]["create_deliverables"]


def test_query_cannot_invoke_create(tmp_path: Path) -> None:
    root = copied_plugin(tmp_path)
    path = root / "assets" / "cuebook-modules-v1.json"
    rewrite(path, lambda payload: payload["modules"][0].update({"may_invoke": ["create"]}))
    assert "QUERY_DEPENDENCY" in codes(VALIDATOR.validate(root))


def test_query_menu_rejects_write_tool(tmp_path: Path) -> None:
    root = copied_plugin(tmp_path)
    path = root / "assets" / "query-menu-v1.json"
    rewrite(path, lambda payload: payload["queries"][0]["mcp_tools"].append("save_creator_artifact"))
    assert "QUERY_WRITE_TOOL" in codes(VALIDATOR.validate(root))


def test_skills_cannot_belong_to_both_modules(tmp_path: Path) -> None:
    root = copied_plugin(tmp_path)
    path = root / "assets" / "cuebook-modules-v1.json"
    rewrite(path, lambda payload: payload["modules"][0]["skill_refs"].append("create-cuebook-content"))
    assert "MODULE_SKILL_OVERLAP" in codes(VALIDATOR.validate(root))


def test_query_skill_cannot_invoke_create_skill(tmp_path: Path) -> None:
    root = copied_plugin(tmp_path)
    path = root / "skills" / "query-cuebook" / "SKILL.md"
    path.write_text(path.read_text(encoding="utf-8") + "\nInvoke $create-cuebook-content.\n", encoding="utf-8")
    assert "QUERY_SKILL_EDGE" in codes(VALIDATOR.validate(root))
