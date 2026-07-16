#!/usr/bin/env python3
"""Build a validated, no-database example of the Cuebook creator workflow."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any


SKILLS = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = Path.home() / "outputs" / "cuebook-creator-workflow-example-20260714"


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()


def build_bundle(output_dir: Path) -> dict[str, Any]:
    feed_fixture = load_module("creator_feed_fixture", SKILLS / "normalize-cuebook-creator-feed" / "tests" / "test_validate_creator_feed.py")
    opportunity_fixture = load_module("opportunity_fixture", SKILLS / "select-cuebook-content-opportunities" / "tests" / "test_validate_content_opportunities.py")
    recipe_validator = load_module("recipe_validator", SKILLS / "compose-cuebook-content-recipe" / "scripts" / "validate_content_recipe.py")
    catalog_validator = load_module("catalog_validator", SKILLS / "compose-cuebook-content-recipe" / "scripts" / "validate_skill_catalog.py")
    workflow_fixture = load_module("workflow_fixture", SKILLS / "orchestrate-cuebook-creator-workflow" / "tests" / "test_validate_creator_workflow.py")
    history_fixture = load_module("history_fixture", SKILLS / "reconcile-market-content-history" / "tests" / "test_validate_content_history.py")
    feed_validator = load_module("creator_feed_validator", SKILLS / "normalize-cuebook-creator-feed" / "scripts" / "validate_creator_feed.py")
    opportunity_validator = load_module("opportunity_validator", SKILLS / "select-cuebook-content-opportunities" / "scripts" / "validate_content_opportunities.py")
    workflow_validator = load_module("workflow_validator", SKILLS / "orchestrate-cuebook-creator-workflow" / "scripts" / "validate_creator_workflow.py")
    history_validator = load_module("history_validator", SKILLS / "reconcile-market-content-history" / "scripts" / "validate_content_history.py")

    feed = feed_fixture.base_feed()
    opportunities = opportunity_fixture.base_set()
    recipe = workflow_fixture.workflow_recipe()
    workflow = workflow_fixture.base_run()
    history = history_fixture.base_ledger()
    catalog = json.loads((SKILLS / "compose-cuebook-content-recipe" / "references" / "skill-catalog-v1.json").read_text(encoding="utf-8"))

    artifact_hashes = {"ART_feed": digest(feed), "ART_ops": digest(opportunities), "ART_recipe": digest(recipe)}
    for artifact in workflow["artifact_registry"]:
        if artifact["artifact_id"] in artifact_hashes:
            artifact["content_hash"] = artifact_hashes[artifact["artifact_id"]]

    results = {
        "skill-catalog-v1.json": catalog_validator.validate(catalog),
        "creator-feed-v1.json": feed_validator.validate(feed),
        "content-opportunity-set-v1.json": opportunity_validator.validate(opportunities, feed),
        "content-recipe-v1.json": recipe_validator.validate(recipe, feed, opportunities, catalog),
        "creator-workflow-run-v1.json": workflow_validator.validate(workflow, opportunities, recipe, catalog),
        "content-history-ledger-v1.json": history_validator.validate(history),
    }
    invalid = {name: result for name, result in results.items() if not result["valid"]}
    if invalid:
        raise RuntimeError(json.dumps(invalid, ensure_ascii=False, indent=2))

    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts = {
        "skill-catalog-v1.json": catalog,
        "creator-feed-v1.json": feed,
        "content-opportunity-set-v1.json": opportunities,
        "content-recipe-v1.json": recipe,
        "creator-workflow-run-v1.json": workflow,
        "content-history-ledger-v1.json": history,
    }
    manifest = {
        "scenario": "Example Corp Q2 source-only revision watch",
        "catalog_version": catalog["catalog_version"],
        "workflow_profile": "source_only_no_trade_viewpoint_visual",
        "database_required": False,
        "sequence": list(artifacts),
        "validation": {name: {"valid": True, "warnings": result["warnings"]} for name, result in results.items()},
        "artifact_hashes": {name: digest(value) for name, value in artifacts.items()},
    }
    for name, value in artifacts.items():
        (output_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", nargs="?", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = build_bundle(args.output_dir)
    print(json.dumps({"output_dir": str(args.output_dir), **manifest}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
