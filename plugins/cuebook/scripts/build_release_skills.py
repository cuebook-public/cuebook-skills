#!/usr/bin/env python3
"""Build self-contained public skill bundles for generic Agent Skills clients.

The source tree is a plugin: skills invoke each other with ``$skill-name`` and
share plugin-level assets through ``../../assets/...``. Generic clients that
copy one skill directory would break those references, and clients that load
every directory would pay startup metadata cost for internal capabilities.

This builder packages each public entrypoint (``assets/plugin-index-v1.json``
``public_entrypoints``) as one spec-conformant, self-contained skill:

- the transitive ``$skill-name`` closure is bundled under ``references/skills/``;
- referenced plugin assets are copied to ``assets/plugin/`` and paths rewritten;
- ``$skill-name`` tokens are rewritten to bundle-relative SKILL.md paths;
- the shared ``validate_json_schema.py`` helper is vendored next to every
  validator that imports it through the plugin-root shim;
- the result is checked against the Agent Skills format rules before writing
  the release manifest.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from os.path import relpath
from pathlib import Path
from typing import Any


ASSET_REF_PATTERN = re.compile(r"\.\./\.\./assets/([A-Za-z0-9._/-]+)")
FRONTMATTER_PATTERN = re.compile(r"\A---\n(.*?)\n---\n", re.S)
PLUGIN_SHIM_ROOT = "PLUGIN_ROOT = Path(__file__).resolve().parents[3]"
PLUGIN_SHIM_INSERT = 'sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))'
EXCLUDED_DIR_NAMES = {"__pycache__", ".pytest_cache"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def copy_skill_dir(source: Path, target: Path) -> None:
    shutil.copytree(
        source,
        target,
        ignore=shutil.ignore_patterns(*EXCLUDED_DIR_NAMES),
    )


def skill_ref_pattern(skill_names: set[str]) -> re.Pattern[str]:
    alternatives = "|".join(re.escape(name) for name in sorted(skill_names, key=len, reverse=True))
    return re.compile(rf"\$({alternatives})\b")


def find_closure(plugin_root: Path, entry: str, skill_names: set[str]) -> list[str]:
    pattern = skill_ref_pattern(skill_names)
    seen: list[str] = []
    queue = [entry]
    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.append(current)
        for md in sorted((plugin_root / "skills" / current).rglob("*.md")):
            for match in pattern.finditer(md.read_text(encoding="utf-8")):
                if match.group(1) not in seen:
                    queue.append(match.group(1))
    return seen


def rewrite_markdown(md: Path, bundle_root: Path, skill_names: set[str], used_assets: set[str]) -> None:
    text = md.read_text(encoding="utf-8")
    base = md.parent

    def asset_target(match: re.Match[str]) -> str:
        used_assets.add(match.group(1))
        return relpath(bundle_root / "assets" / "plugin" / match.group(1), base)

    def skill_target(match: re.Match[str]) -> str:
        name = match.group(1)
        if name == bundle_root.name:
            return relpath(bundle_root / "SKILL.md", base)
        return relpath(bundle_root / "references" / "skills" / name / "SKILL.md", base)

    text = ASSET_REF_PATTERN.sub(asset_target, text)
    text = skill_ref_pattern(skill_names).sub(skill_target, text)
    md.write_text(text, encoding="utf-8")


def vendor_shared_validator(script: Path, shared_helper: Path) -> bool:
    text = script.read_text(encoding="utf-8")
    if PLUGIN_SHIM_ROOT not in text:
        return False
    text = text.replace(PLUGIN_SHIM_ROOT, "PLUGIN_ROOT = Path(__file__).resolve().parent")
    text = text.replace(PLUGIN_SHIM_INSERT, "sys.path.insert(0, str(PLUGIN_ROOT))")
    script.write_text(text, encoding="utf-8")
    shutil.copy2(shared_helper, script.parent / shared_helper.name)
    return True


def parse_frontmatter(skill_md: Path) -> dict[str, str]:
    match = FRONTMATTER_PATTERN.match(skill_md.read_text(encoding="utf-8"))
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if line[:1] not in {" ", "\t", "#"} and ":" in line:
            key, _, value = line.partition(":")
            fields[key.strip()] = value.strip()
    return fields


def check_bundle(bundle_root: Path, skill_names: set[str]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    front = parse_frontmatter(bundle_root / "SKILL.md")
    name = front.get("name", "")
    description = front.get("description", "")
    if name != bundle_root.name:
        errors.append(issue("BUNDLE_NAME", f"{bundle_root.name}/SKILL.md", "Frontmatter name must match the bundle directory."))
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name or "-"):
        errors.append(issue("BUNDLE_NAME_FORMAT", f"{bundle_root.name}/SKILL.md", "Name must be lowercase alphanumerics and single hyphens."))
    if not 1 <= len(description) <= 1024:
        errors.append(issue("BUNDLE_DESCRIPTION", f"{bundle_root.name}/SKILL.md", "Description must be 1-1024 characters."))
    ref_pattern = skill_ref_pattern(skill_names)
    for md in sorted(bundle_root.rglob("*.md")):
        rel = md.relative_to(bundle_root)
        text = md.read_text(encoding="utf-8")
        if re.search(r"\.\./\.\./assets/(?!plugin/)", text):
            errors.append(issue("UNRESOLVED_ASSET_REF", f"{bundle_root.name}/{rel}", "Bundle still references plugin-level assets."))
        if ref_pattern.search(text):
            errors.append(issue("UNRESOLVED_SKILL_REF", f"{bundle_root.name}/{rel}", "Bundle still contains a $skill-name invocation token."))
        target_pattern = re.compile(r"\]\((?!https?://|mailto:)([^)#\s]+)")
        for match in target_pattern.finditer(text):
            target = (md.parent / match.group(1)).resolve()
            if not target.exists():
                errors.append(issue("BROKEN_LINK", f"{bundle_root.name}/{rel}", f"Linked file does not exist: {match.group(1)}"))
    return errors


def build(plugin_root: Path, output_dir: Path) -> dict[str, Any]:
    plugin_root = plugin_root.resolve()
    output_dir = output_dir.resolve()
    index = json.loads((plugin_root / "assets" / "plugin-index-v1.json").read_text(encoding="utf-8"))
    entrypoints = list(index.get("public_entrypoints") or [])
    skill_names = {path.name for path in (plugin_root / "skills").iterdir() if path.is_dir()}
    shared_helper = plugin_root / "scripts" / "validate_json_schema.py"
    errors: list[dict[str, str]] = []
    bundles: list[dict[str, Any]] = []

    for entry in entrypoints:
        if entry not in skill_names:
            errors.append(issue("UNKNOWN_ENTRYPOINT", entry, "Public entrypoint has no skill directory."))
            continue
        bundle_root = output_dir / entry
        if bundle_root.exists():
            shutil.rmtree(bundle_root)
        closure = find_closure(plugin_root, entry, skill_names)
        copy_skill_dir(plugin_root / "skills" / entry, bundle_root)
        for member in closure[1:]:
            copy_skill_dir(plugin_root / "skills" / member, bundle_root / "references" / "skills" / member)

        used_assets: set[str] = set()
        for md in sorted(bundle_root.rglob("*.md")):
            rewrite_markdown(md, bundle_root, skill_names, used_assets)
        for asset in sorted(used_assets):
            source = plugin_root / "assets" / asset
            target = bundle_root / "assets" / "plugin" / asset
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        vendored = sorted(
            str(script.relative_to(bundle_root))
            for script in bundle_root.rglob("*.py")
            if vendor_shared_validator(script, shared_helper)
        )
        bundle_errors = check_bundle(bundle_root, skill_names)
        errors.extend(bundle_errors)
        bundles.append({
            "skill": entry,
            "closure": closure,
            "bundled_internal_skills": len(closure) - 1,
            "plugin_assets": sorted(used_assets),
            "vendored_shared_validators": vendored,
            "valid": not bundle_errors,
        })

    manifest = {
        "schema_version": "cuebook-release-skills-manifest-v1",
        "catalog_version": index.get("catalog_version"),
        "plugin_version": index.get("plugin_version"),
        "bundles": bundles,
        "valid": not errors,
        "errors": errors,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "release-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin_root", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    manifest = build(args.plugin_root, args.output_dir)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    raise SystemExit(0 if manifest["valid"] else 1)


if __name__ == "__main__":
    main()
