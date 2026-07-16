#!/usr/bin/env python3
"""Validate Cuebook packaging and the one-way Query -> Create boundary."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_json_schema import validate_instance


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(plugin_root: Path) -> dict[str, Any]:
    errors: list[dict[str, str]] = []

    def check(condition: bool, code: str, path: str, message: str) -> None:
        if not condition:
            errors.append({"code": code, "path": path, "message": message})

    assets_root = plugin_root / "assets"
    manifest = load(plugin_root / ".codex-plugin" / "plugin.json")
    mcp_config = load(plugin_root / ".mcp.json")
    index = load(assets_root / "plugin-index-v1.json")
    module_map = load((assets_root / index["module_map_ref"]).resolve())
    query_menu = load((assets_root / index["query_menu_ref"]).resolve())
    creation_menu = load((assets_root / index["creation_menu_ref"]).resolve())
    capability_map = load((assets_root / index["mcp_capability_map_ref"]).resolve())
    catalog_path = (assets_root / index["canonical_catalog_ref"]).resolve()
    catalog = load(catalog_path)

    for artifact_name, payload, schema_name in (
        ("cuebook-modules-v1.json", module_map, "cuebook-modules-v1.schema.json"),
        ("query-menu-v1.json", query_menu, "query-menu-v1.schema.json"),
        ("creation-menu-v1.json", creation_menu, "creation-menu-v1.schema.json"),
        ("mcp-capability-map-v1.json", capability_map, "mcp-capability-map-v1.schema.json"),
    ):
        schema = load(assets_root / schema_name)
        for schema_error in validate_instance(payload, schema):
            errors.append({
                "code": schema_error["code"],
                "path": f"{artifact_name}:{schema_error['path']}",
                "message": schema_error["message"],
            })

    skill_dirs = {
        path.parent.name
        for path in (plugin_root / "skills").glob("*/SKILL.md")
    }
    catalog_skills = {
        item["skill_id"]: item
        for item in catalog.get("skills", [])
        if isinstance(item, dict) and isinstance(item.get("skill_id"), str)
    }
    modules = {
        item["module_id"]: item
        for item in module_map.get("modules", [])
        if isinstance(item, dict) and isinstance(item.get("module_id"), str)
    }
    tool_items = [
        *capability_map.get("available_tools", []),
        *capability_map.get("required_tools", []),
    ]
    tools = {
        item["tool"]: item
        for item in tool_items
        if isinstance(item, dict) and isinstance(item.get("tool"), str)
    }
    available_tools = {
        item.get("tool")
        for item in capability_map.get("available_tools", [])
        if isinstance(item, dict)
    }
    required_tools = {
        item.get("tool")
        for item in capability_map.get("required_tools", [])
        if isinstance(item, dict)
    }

    check(manifest.get("name") == "cuebook", "PLUGIN_NAME", "plugin.json.name", "Unexpected plugin name.")
    manifest_version = str(manifest.get("version") or "").split("+", 1)[0]
    check(
        manifest_version == index.get("plugin_version"),
        "PLUGIN_VERSION",
        "plugin-index-v1.json.plugin_version",
        "Plugin index and manifest release versions differ.",
    )
    catalog_version = catalog.get("catalog_version")
    for name, payload in (
        ("plugin-index-v1.json", index),
        ("cuebook-modules-v1.json", module_map),
        ("query-menu-v1.json", query_menu),
        ("creation-menu-v1.json", creation_menu),
    ):
        check(
            payload.get("catalog_version") == catalog_version,
            "CATALOG_VERSION",
            f"{name}.catalog_version",
            "Artifact and canonical catalog versions differ.",
        )
    check(
        index.get("skill_count") == len(skill_dirs),
        "SKILL_COUNT",
        "plugin-index-v1.json.skill_count",
        "Declared skill count differs from packaged Skill directories.",
    )
    check(
        skill_dirs == set(catalog_skills),
        "CATALOG_SKILL_SET",
        "skill-catalog-v1.json.skills",
        "Catalog and packaged Skill sets differ.",
    )

    expected_modules = {"query", "create"}
    check(set(modules) == expected_modules, "MODULE_SET", "cuebook-modules-v1.json.modules", "Cuebook requires exactly query and create modules.")
    query = modules.get("query", {})
    create = modules.get("create", {})
    check(module_map.get("default_module") == "query", "DEFAULT_MODULE", "cuebook-modules-v1.json.default_module", "Query must be the safe default module.")
    check(query.get("access") == "read_only", "QUERY_ACCESS", "modules.query.access", "Query must remain read-only.")
    check(query.get("may_invoke") == [], "QUERY_DEPENDENCY", "modules.query.may_invoke", "Query cannot invoke another module.")
    check(create.get("access") == "compose_with_authorized_writes", "CREATE_ACCESS", "modules.create.access", "Create must use the creation access profile.")
    check(create.get("may_invoke") == ["query"], "CREATE_DEPENDENCY", "modules.create.may_invoke", "Create may invoke Query and no other module.")
    check(query.get("menu_ref") == index.get("query_menu_ref"), "QUERY_MENU_REF", "modules.query.menu_ref", "Query menu ref must match the plugin index.")
    check(create.get("menu_ref") == index.get("creation_menu_ref"), "CREATION_MENU_REF", "modules.create.menu_ref", "Creation menu ref must match the plugin index.")
    routing = module_map.get("routing_rules", {})
    check(routing.get("read_intents_route_to") == "query", "READ_ROUTE", "routing_rules.read_intents_route_to", "Read intents must route to Query.")
    check(routing.get("creation_intents_route_to") == "create", "CREATE_ROUTE", "routing_rules.creation_intents_route_to", "Creation intents must route to Create.")
    check(routing.get("ambiguous_intents_route_to") == "query", "AMBIGUOUS_ROUTE", "routing_rules.ambiguous_intents_route_to", "Ambiguous intents must default to Query.")
    check(
        set(routing.get("query_deliverables", [])) == {"answer", "comparison", "source_bundle", "data_table", "factual_chart", "history_view"},
        "QUERY_DELIVERABLES",
        "routing_rules.query_deliverables",
        "Read-only views, including factual charts, must belong to Query.",
    )
    check(
        set(routing.get("create_deliverables", [])) == {"market_post", "creator_viewpoint_graphic", "settlement_protocol", "release_bundle", "publishing_candidates"},
        "CREATE_DELIVERABLES",
        "routing_rules.create_deliverables",
        "Create must be limited to creator-facing publishing deliverables.",
    )
    check(routing.get("query_may_invoke_create") is False, "QUERY_CREATE_EDGE", "routing_rules.query_may_invoke_create", "Query cannot invoke Create.")
    check(routing.get("create_may_invoke_query") is True, "CREATE_QUERY_EDGE", "routing_rules.create_may_invoke_query", "Create must be allowed to invoke Query.")

    module_skill_sets: dict[str, set[str]] = {}
    for module_id, module in modules.items():
        refs = set(module.get("skill_refs", []))
        module_skill_sets[module_id] = refs
        entrypoint = module.get("entrypoint_skill")
        check(entrypoint in refs, "MODULE_ENTRYPOINT", f"modules.{module_id}.entrypoint_skill", "Module entrypoint must belong to its own module.")
        for skill_id in refs:
            check(skill_id in skill_dirs, "MODULE_SKILL_REF", f"modules.{module_id}.skill_refs", f"Unknown Skill {skill_id}.")
    query_skills = module_skill_sets.get("query", set())
    create_skills = module_skill_sets.get("create", set())
    check(not query_skills & create_skills, "MODULE_SKILL_OVERLAP", "cuebook-modules-v1.json.modules", "A Skill can belong to only one module.")
    check(query_skills | create_skills == skill_dirs, "MODULE_SKILL_COVERAGE", "cuebook-modules-v1.json.modules", "Every packaged Skill must belong to one module.")
    skill_owner = {
        skill_id: module_id
        for module_id, refs in module_skill_sets.items()
        for skill_id in refs
    }
    for skill_id in sorted(query_skills):
        body = (plugin_root / "skills" / skill_id / "SKILL.md").read_text(encoding="utf-8")
        invoked_skills = set(re.findall(r"\$([a-z0-9-]+)", body))
        for invoked_skill in invoked_skills:
            check(
                skill_owner.get(invoked_skill) != "create",
                "QUERY_SKILL_EDGE",
                f"skills/{skill_id}/SKILL.md",
                f"Query Skill {skill_id} cannot invoke Create Skill {invoked_skill}.",
            )

    module_entrypoints = index.get("module_entrypoints", {})
    check(module_entrypoints == {"query": query.get("entrypoint_skill"), "create": create.get("entrypoint_skill")}, "INDEX_MODULE_ENTRYPOINTS", "plugin-index-v1.json.module_entrypoints", "Plugin index entrypoints must match the module map.")
    check(index.get("default_entrypoint") == query.get("entrypoint_skill"), "INDEX_DEFAULT_ENTRYPOINT", "plugin-index-v1.json.default_entrypoint", "Query must be the default plugin entrypoint.")
    for skill_id in index.get("public_entrypoints", []):
        check(skill_id in skill_dirs, "PUBLIC_ENTRYPOINT", f"public_entrypoints.{skill_id}", "Public entrypoint is not packaged.")
    check(
        index.get("public_entrypoints") == [query.get("entrypoint_skill"), create.get("entrypoint_skill")],
        "PUBLIC_ENTRYPOINT_SET",
        "plugin-index-v1.json.public_entrypoints",
        "Only Query and Create may be public plugin entrypoints.",
    )
    check(
        {query.get("entrypoint_skill"), create.get("entrypoint_skill")} <= set(index.get("public_entrypoints", [])),
        "MODULE_PUBLIC_ENTRYPOINTS",
        "plugin-index-v1.json.public_entrypoints",
        "Both module entrypoints must be public.",
    )

    check(query_menu.get("module_id") == "query", "QUERY_MENU_MODULE", "query-menu-v1.json.module_id", "Query menu must belong to Query.")
    for query_index, item in enumerate(query_menu.get("queries", [])):
        base = f"query-menu-v1.json.queries[{query_index}]"
        for skill_id in item.get("skill_refs", []):
            check(skill_id in query_skills, "QUERY_MENU_SKILL", f"{base}.skill_refs", f"Query menu cannot invoke non-query Skill {skill_id}.")
        for tool_name in item.get("mcp_tools", []):
            tool = tools.get(tool_name)
            check(tool is not None, "QUERY_MENU_TOOL", f"{base}.mcp_tools", f"Unknown MCP tool {tool_name}.")
            if tool is not None:
                check(tool.get("module") == "query" and tool.get("access") == "read", "QUERY_WRITE_TOOL", f"{base}.mcp_tools", f"Query cannot use {tool_name} because it is not a read-only Query tool.")

    check(creation_menu.get("module_id") == "create", "CREATION_MENU_MODULE", "creation-menu-v1.json.module_id", "Creation menu must belong to Create.")
    for step_index, step in enumerate(creation_menu.get("steps", [])):
        for option_index, option in enumerate(step.get("options", [])):
            base = f"creation-menu-v1.json.steps[{step_index}].options[{option_index}]"
            for skill_id in option.get("skill_refs", []):
                check(skill_id in create_skills | query_skills, "CREATION_MENU_SKILL", f"{base}.skill_refs", f"Unknown Skill {skill_id}.")
            for tool_name in option.get("mcp_tools", []):
                tool = tools.get(tool_name)
                check(tool is not None, "CREATION_MENU_TOOL", f"{base}.mcp_tools", f"Unknown MCP tool {tool_name}.")
                if tool is not None:
                    allowed = tool.get("module") == "create" or (
                        tool.get("module") == "query" and "query" in create.get("may_invoke", [])
                    )
                    check(allowed, "CREATION_TOOL_EDGE", f"{base}.mcp_tools", f"Create cannot invoke MCP tool {tool_name} through the declared module graph.")
                    check(tool.get("access") == "read", "CREATION_MENU_WRITE_TOOL", f"{base}.mcp_tools", "Creation choices may request Query data but cannot perform writes.")
            option_tools = set(option.get("mcp_tools", []))
            if option_tools & required_tools:
                check(option.get("availability") == "backend_required", "MENU_BACKEND_AVAILABILITY", f"{base}.availability", "Options using required MCP tools must be marked backend_required.")

    expected_write_gates = {
        "save_creator_artifact": {"explicit_user_approval", "artifact_hash", "idempotency_key"},
        "register_settlement_claim": {"explicit_user_approval", "claim_hash", "formula_hash", "idempotency_key"},
        "publish_release": {"explicit_user_approval", "release_approval", "exact_artifact_hash", "idempotency_key"},
    }
    write_actions = creation_menu.get("write_actions", [])
    check(len(write_actions) == len(expected_write_gates), "WRITE_ACTION_COUNT", "creation-menu-v1.json.write_actions", "Creation menu must declare every authorized write separately from creation choices.")
    for action_index, action in enumerate(write_actions):
        base = f"creation-menu-v1.json.write_actions[{action_index}]"
        tool_name = action.get("mcp_tool")
        tool = tools.get(tool_name)
        check(tool_name in expected_write_gates, "WRITE_ACTION_TOOL", f"{base}.mcp_tool", f"Unexpected write tool {tool_name}.")
        if tool is not None:
            check(tool.get("module") == "create" and tool.get("access") in {"write", "external_write"}, "WRITE_ACTION_ACCESS", f"{base}.mcp_tool", "Write action must reference a Create write tool.")
        check(set(action.get("required_gates", [])) == expected_write_gates.get(tool_name, set()), "WRITE_ACTION_GATES", f"{base}.required_gates", "Write action approval, hash, and idempotency gates are incomplete.")

    check(not (available_tools & required_tools), "DUPLICATE_TOOL_PHASE", "mcp-capability-map-v1.json", "A tool cannot be both available and required.")
    rules = capability_map.get("module_rules", {})
    check(rules.get("query") == {"allowed_access": ["read"], "may_invoke": []}, "QUERY_TOOL_RULE", "module_rules.query", "Query MCP rules must allow read only.")
    check(rules.get("create") == {"allowed_access": ["write", "external_write"], "may_invoke": ["query"]}, "CREATE_TOOL_RULE", "module_rules.create", "Create owns writes and may invoke Query for reads.")
    skill_to_module = skill_owner
    release_rules = capability_map.get("release_rules", {})
    for rule_name in (
        "server_enforces_authorization_scopes",
        "query_scope_cannot_call_write_tools",
        "write_tools_require_idempotency_key",
        "write_tools_require_explicit_approval",
    ):
        check(release_rules.get(rule_name) is True, "RUNTIME_ENFORCEMENT", f"release_rules.{rule_name}", "Runtime enforcement rule must be enabled.")
    for tool_name, tool in tools.items():
        module_id = tool.get("module")
        access = tool.get("access")
        allowed_access = set(rules.get(module_id, {}).get("allowed_access", []))
        check(access in allowed_access, "TOOL_ACCESS_MODULE", f"tools.{tool_name}", f"Tool access {access!r} is invalid for module {module_id!r}.")
        expected_scope = "cuebook.query" if module_id == "query" else ("cuebook.publish" if access == "external_write" else "cuebook.create.write")
        check(tool.get("authorization_scope") == expected_scope, "TOOL_AUTH_SCOPE", f"tools.{tool_name}.authorization_scope", f"Tool must require {expected_scope}.")
        for skill_id in tool.get("used_by", []):
            owner = skill_to_module.get(skill_id)
            check(owner is not None, "TOOL_SKILL_REF", f"tools.{tool_name}.used_by", f"Unknown Skill {skill_id}.")
            if owner is not None:
                allowed = owner == module_id or module_id in modules.get(owner, {}).get("may_invoke", [])
                check(allowed, "TOOL_MODULE_EDGE", f"tools.{tool_name}.used_by", f"{owner} Skill {skill_id} cannot use {module_id} tool {tool_name}.")
                if module_id == "query":
                    check(owner == "query", "CREATE_DIRECT_READ", f"tools.{tool_name}.used_by", f"Create Skill {skill_id} must consume QueryBundleV1 instead of calling Query tool {tool_name} directly.")

    for skill_id in query_skills:
        surface = catalog_skills.get(skill_id, {}).get("ui", {}).get("surface")
        check(surface in {"query", "library", "internal"}, "QUERY_CATALOG_SURFACE", f"catalog.skills.{skill_id}.ui.surface", "Query Skills cannot live on a Create or admin surface.")
    for skill_id in create_skills:
        surface = catalog_skills.get(skill_id, {}).get("ui", {}).get("surface")
        check(surface != "query", "CREATE_CATALOG_SURFACE", f"catalog.skills.{skill_id}.ui.surface", "Create Skills cannot live on the Query surface.")

    configured = mcp_config.get("mcpServers", {}).get("cuebook", {})
    check(configured.get("url") == capability_map.get("server", {}).get("url"), "MCP_URL", ".mcp.json", "MCP config and capability map URLs differ.")
    check(configured.get("oauth_resource") == configured.get("url"), "MCP_OAUTH_RESOURCE", ".mcp.json", "Cuebook OAuth resource must match its MCP URL.")
    check("publish_release" not in available_tools, "PUBLISH_PHASE", "mcp-capability-map-v1.json", "External publishing cannot be marked available before the R2 connector exists.")

    return {
        "valid": not errors,
        "errors": errors,
        "stats": {
            "skill_count": len(skill_dirs),
            "catalog_version": catalog_version,
            "module_skill_counts": {key: len(value) for key, value in sorted(module_skill_sets.items())},
            "query_type_count": len(query_menu.get("queries", [])),
            "creation_step_count": len(creation_menu.get("steps", [])),
            "available_mcp_tools": sorted(name for name in available_tools if name),
            "required_mcp_tools": sorted(name for name in required_tools if name),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("plugin_root", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    result = validate(args.plugin_root.resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["valid"] else 1)


if __name__ == "__main__":
    main()
