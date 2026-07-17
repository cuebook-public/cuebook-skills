#!/usr/bin/env node
// Validate Cuebook packaging and the one-way Query -> Create boundary.

import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr } from "./validate_json_schema.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function load(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Mirror Python: dict.get misses become None (null), never undefined.
function norm(value) {
  return value === undefined ? null : value;
}

function rep(value) {
  return pyrepr(norm(value));
}

// Python == over JSON values: dict order-insensitive, list order-sensitive.
function deepEqualPy(a, b) {
  a = norm(a);
  b = norm(b);
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqualPy(item, b[index]));
  }
  if (isDict(a) && isDict(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((key) => Object.hasOwn(b, key) && deepEqualPy(a[key], b[key]));
  }
  return false;
}

const setEq = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));
const intersects = (a, b) => [...a].some((item) => b.has(item));
const isSubset = (a, b) => [...a].every((item) => b.has(item));

const FRAME_TOOL_SCOPES = new Map([
  ["get_frame_capabilities", "read:public"],
  ["begin_frame_media_upload", "cuebook.frame.write"],
  ["complete_frame_media_upload", "cuebook.frame.write"],
  ["get_frame_media_status", "cuebook.frame.write"],
  ["register_frame_visual_manifest", "cuebook.frame.write"],
  ["create_frame_draft", "cuebook.frame.write"],
  ["get_frame_draft", "cuebook.frame.read"],
  ["update_frame_draft", "cuebook.frame.write"],
  ["prepare_frame_publish", "cuebook.frame.publish"],
  ["get_frame_action_consent", "cuebook.frame.publish"],
  ["publish_frame", "cuebook.frame.publish"],
  ["get_frame", "read:public"],
  ["create_frame_correction_draft", "cuebook.frame.write"],
  ["prepare_frame_correction_publish", "cuebook.frame.publish"],
  ["publish_frame_correction", "cuebook.frame.publish"],
  ["prepare_frame_withdraw", "cuebook.frame.publish"],
  ["withdraw_frame", "cuebook.frame.publish"],
]);

const PAPER_TOOL_SCOPES = new Map([
  ["get_paper_portfolio", "cuebook.paper.read"],
  ["preview_paper_order", "cuebook.paper.read"],
  ["list_paper_orders", "cuebook.paper.read"],
  ["place_paper_order", "cuebook.paper.trade"],
  ["close_paper_position", "cuebook.paper.trade"],
]);

const FORBIDDEN_FRAME_MEDIA_TOOLS = new Set([
  "get_frame_media",
  "list_frame_media",
  "publish_frame_image",
  "share_frame_to_agent",
]);

const FRAME_PUBLICATION_FLOW = {
  image_transport: "signed_https_upload_only",
  skill_may_pull_media: false,
  status_tool: "get_frame_media_status",
  status_returns: "processing_and_hash_receipts_only",
  published_read_tool: "get_frame",
  published_visual_semantics: "one_visual_attached_to_frame_release",
  forbidden_tools: [...FORBIDDEN_FRAME_MEDIA_TOOLS],
  initial_publish_sequence: [
    "get_frame_capabilities",
    "begin_frame_media_upload",
    "https_put_each_role",
    "complete_frame_media_upload",
    "get_frame_media_status",
    "register_frame_visual_manifest",
    "create_or_update_frame_draft",
    "prepare_frame_publish",
    "publish_frame",
    "get_frame",
  ],
  correction_publish_sequence: [
    "prepare_frame_correction_publish",
    "publish_frame_correction",
    "get_frame",
  ],
  withdraw_sequence: [
    "prepare_frame_withdraw",
    "first_party_consent",
    "get_frame_action_consent",
    "withdraw_frame",
  ],
  publish_authorization: "active_frame_publish_grant_and_first_party_publish_action",
  action_consent_usage: "withdrawal_only",
  prepared_publish_required_fields: [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
  ],
  prepared_correction_publish_required_fields: [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
    "base_release_id",
    "expected_economic_hash",
  ],
  prepared_publish_omitted_fields: [
    "consent_request_id",
    "consent_url",
    "consent_expires_at",
  ],
  publish_input_omitted_fields: ["consent_request_id"],
  wire_golden: {
    tool_manifest_sha256: "bf4464c25623d9d44dd16f08dbb51a9cbb91e3062c813ed1c3941403d65289a2",
    schema_catalog_sha256: "ba0729ca77e4b44864850a1fed1346f2fa758c646e4e6c63993cae26c326e4fa",
  },
  mutation_idempotency: "distinct_lowercase_uuidv7_per_command",
  replay_policy: "same_key_same_payload_returns_receipt_changed_payload_conflict",
};

export function validate(pluginRoot) {
  const errors = [];

  const check = (condition, code, errorPath, message) => {
    if (!condition) errors.push({ code, path: errorPath, message });
  };

  const assetsRoot = path.join(pluginRoot, "assets");
  const manifest = load(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
  const mcpConfig = load(path.join(pluginRoot, ".mcp.json"));
  const index = load(path.join(assetsRoot, "plugin-index-v1.json"));
  const moduleMap = load(path.resolve(assetsRoot, index.module_map_ref));
  const queryMenu = load(path.resolve(assetsRoot, index.query_menu_ref));
  const creationMenu = load(path.resolve(assetsRoot, index.creation_menu_ref));
  const capabilityMap = load(path.resolve(assetsRoot, index.mcp_capability_map_ref));
  const catalogPath = path.resolve(assetsRoot, index.canonical_catalog_ref);
  const catalog = load(catalogPath);

  for (const [artifactName, payload, schemaName] of [
    ["cuebook-modules-v1.json", moduleMap, "cuebook-modules-v1.schema.json"],
    ["query-menu-v1.json", queryMenu, "query-menu-v1.schema.json"],
    ["creation-menu-v1.json", creationMenu, "creation-menu-v1.schema.json"],
    ["mcp-capability-map-v1.json", capabilityMap, "mcp-capability-map-v1.schema.json"],
  ]) {
    const schema = load(path.join(assetsRoot, schemaName));
    for (const schemaError of validateInstance(payload, schema)) {
      errors.push({
        code: schemaError.code,
        path: `${artifactName}:${schemaError.path}`,
        message: schemaError.message,
      });
    }
  }

  const skillsRoot = path.join(pluginRoot, "skills");
  const skillDirs = new Set(
    readdirSync(skillsRoot).filter((name) => existsSync(path.join(skillsRoot, name, "SKILL.md"))),
  );
  const catalogSkills = new Map();
  for (const item of catalog.skills ?? []) {
    if (isDict(item) && typeof item.skill_id === "string") catalogSkills.set(item.skill_id, item);
  }
  const modules = new Map();
  for (const item of moduleMap.modules ?? []) {
    if (isDict(item) && typeof item.module_id === "string") modules.set(item.module_id, item);
  }
  const toolItems = [
    ...(capabilityMap.available_tools ?? []),
    ...(capabilityMap.required_tools ?? []),
  ];
  const tools = new Map();
  for (const item of toolItems) {
    if (isDict(item) && typeof item.tool === "string") tools.set(item.tool, item);
  }
  const availableTools = new Set(
    (capabilityMap.available_tools ?? []).filter(isDict).map((item) => norm(item.tool)),
  );
  const requiredTools = new Set(
    (capabilityMap.required_tools ?? []).filter(isDict).map((item) => norm(item.tool)),
  );
  const frameTools = new Set(
    (capabilityMap.required_tools ?? [])
      .filter((item) => isDict(item) && item.phase === "frame_phase_b")
      .map((item) => norm(item.tool)),
  );

  check(
    setEq(frameTools, new Set(FRAME_TOOL_SCOPES.keys())),
    "FRAME_TOOL_SET",
    "mcp-capability-map-v1.json.required_tools",
    "Frame Phase B must expose exactly the frozen upload, draft, publish, correction, withdrawal-consent, and full-Frame read operations.",
  );
  check(
    !intersects(new Set(tools.keys()), FORBIDDEN_FRAME_MEDIA_TOOLS),
    "FRAME_MEDIA_TOOL",
    "mcp-capability-map-v1.json.required_tools",
    "Frame images are upload-only Skill inputs and release attachments; standalone media retrieval, browsing, publishing, and sharing tools are forbidden.",
  );
  check(
    deepEqualPy(capabilityMap.frame_publication_flow, FRAME_PUBLICATION_FLOW),
    "FRAME_FLOW_CONTRACT",
    "mcp-capability-map-v1.json.frame_publication_flow",
    "Frame publication must remain signed-upload-only; ordinary and correction publishing go directly from prepare to publish, while only withdrawal uses first-party action consent.",
  );
  check(
    tools.get("create_frame_draft")?.input_contract === "FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1",
    "FRAME_DRAFT_INPUT",
    "mcp-capability-map-v1.json.required_tools.create_frame_draft.input_contract",
    "create_frame_draft must receive the Skill assembly plus the registered server binding, never a bare FrameDraftV1.",
  );

  check(manifest.name === "cuebook", "PLUGIN_NAME", "plugin.json.name", "Unexpected plugin name.");
  const manifestVersion = String(manifest.version || "").split("+")[0];
  check(
    manifestVersion === index.plugin_version,
    "PLUGIN_VERSION",
    "plugin-index-v1.json.plugin_version",
    "Plugin index and manifest release versions differ.",
  );
  const catalogVersion = catalog.catalog_version;
  for (const [name, payload] of [
    ["plugin-index-v1.json", index],
    ["cuebook-modules-v1.json", moduleMap],
    ["query-menu-v1.json", queryMenu],
    ["creation-menu-v1.json", creationMenu],
  ]) {
    check(
      deepEqualPy(payload.catalog_version, catalogVersion),
      "CATALOG_VERSION",
      `${name}.catalog_version`,
      "Artifact and canonical catalog versions differ.",
    );
  }
  check(
    index.skill_count === skillDirs.size,
    "SKILL_COUNT",
    "plugin-index-v1.json.skill_count",
    "Declared skill count differs from packaged Skill directories.",
  );
  check(
    setEq(skillDirs, new Set(catalogSkills.keys())),
    "CATALOG_SKILL_SET",
    "skill-catalog-v1.json.skills",
    "Catalog and packaged Skill sets differ.",
  );

  const expectedModules = new Set(["query", "create"]);
  check(setEq(new Set(modules.keys()), expectedModules), "MODULE_SET", "cuebook-modules-v1.json.modules", "Cuebook requires exactly query and create modules.");
  const query = modules.get("query") ?? {};
  const create = modules.get("create") ?? {};
  check(moduleMap.default_module === "query", "DEFAULT_MODULE", "cuebook-modules-v1.json.default_module", "Query must be the safe default module.");
  check(query.access === "read_only", "QUERY_ACCESS", "modules.query.access", "Query must remain read-only.");
  check(deepEqualPy(query.may_invoke, []), "QUERY_DEPENDENCY", "modules.query.may_invoke", "Query cannot invoke another module.");
  check(create.access === "compose_with_authorized_writes", "CREATE_ACCESS", "modules.create.access", "Create must use the creation access profile.");
  check(deepEqualPy(create.may_invoke, ["query"]), "CREATE_DEPENDENCY", "modules.create.may_invoke", "Create may invoke Query and no other module.");
  check(deepEqualPy(query.menu_ref, index.query_menu_ref), "QUERY_MENU_REF", "modules.query.menu_ref", "Query menu ref must match the plugin index.");
  check(deepEqualPy(create.menu_ref, index.creation_menu_ref), "CREATION_MENU_REF", "modules.create.menu_ref", "Creation menu ref must match the plugin index.");
  const routing = moduleMap.routing_rules ?? {};
  check(routing.read_intents_route_to === "query", "READ_ROUTE", "routing_rules.read_intents_route_to", "Read intents must route to Query.");
  check(routing.creation_intents_route_to === "create", "CREATE_ROUTE", "routing_rules.creation_intents_route_to", "Creation intents must route to Create.");
  check(routing.ambiguous_intents_route_to === "query", "AMBIGUOUS_ROUTE", "routing_rules.ambiguous_intents_route_to", "Ambiguous intents must default to Query.");
  check(
    setEq(new Set(routing.query_deliverables ?? []), new Set(["answer", "comparison", "source_bundle", "data_table", "factual_chart", "history_view"])),
    "QUERY_DELIVERABLES",
    "routing_rules.query_deliverables",
    "Read-only views, including factual charts, must belong to Query.",
  );
  check(
    setEq(new Set(routing.create_deliverables ?? []), new Set(["market_post", "creator_viewpoint_graphic", "settlement_protocol", "release_bundle", "publishing_candidates"])),
    "CREATE_DELIVERABLES",
    "routing_rules.create_deliverables",
    "Create must be limited to creator-facing publishing deliverables.",
  );
  check(routing.query_may_invoke_create === false, "QUERY_CREATE_EDGE", "routing_rules.query_may_invoke_create", "Query cannot invoke Create.");
  check(routing.create_may_invoke_query === true, "CREATE_QUERY_EDGE", "routing_rules.create_may_invoke_query", "Create must be allowed to invoke Query.");

  // Where Python iterated set(skill_refs), JS Sets keep first-occurrence
  // order; error ordering inside these loops is normalized to that order.
  const moduleSkillSets = new Map();
  for (const [moduleId, module] of modules) {
    const refs = new Set(module.skill_refs ?? []);
    moduleSkillSets.set(moduleId, refs);
    const entrypoint = module.entrypoint_skill;
    check(refs.has(entrypoint), "MODULE_ENTRYPOINT", `modules.${moduleId}.entrypoint_skill`, "Module entrypoint must belong to its own module.");
    for (const skillId of refs) {
      check(skillDirs.has(skillId), "MODULE_SKILL_REF", `modules.${moduleId}.skill_refs`, `Unknown Skill ${skillId}.`);
    }
  }
  const querySkills = moduleSkillSets.get("query") ?? new Set();
  const createSkills = moduleSkillSets.get("create") ?? new Set();
  check(!intersects(querySkills, createSkills), "MODULE_SKILL_OVERLAP", "cuebook-modules-v1.json.modules", "A Skill can belong to only one module.");
  check(setEq(new Set([...querySkills, ...createSkills]), skillDirs), "MODULE_SKILL_COVERAGE", "cuebook-modules-v1.json.modules", "Every packaged Skill must belong to one module.");
  const skillOwner = new Map();
  for (const [moduleId, refs] of moduleSkillSets) {
    for (const skillId of refs) skillOwner.set(skillId, moduleId);
  }
  for (const skillId of [...querySkills].sort()) {
    const body = readFileSync(path.join(pluginRoot, "skills", skillId, "SKILL.md"), "utf-8");
    const invokedSkills = new Set([...body.matchAll(/\$([a-z0-9-]+)/g)].map((match) => match[1]));
    for (const invokedSkill of invokedSkills) {
      check(
        skillOwner.get(invokedSkill) !== "create",
        "QUERY_SKILL_EDGE",
        `skills/${skillId}/SKILL.md`,
        `Query Skill ${skillId} cannot invoke Create Skill ${invokedSkill}.`,
      );
    }
  }

  const moduleEntrypoints = index.module_entrypoints ?? {};
  check(deepEqualPy(moduleEntrypoints, { query: norm(query.entrypoint_skill), create: norm(create.entrypoint_skill) }), "INDEX_MODULE_ENTRYPOINTS", "plugin-index-v1.json.module_entrypoints", "Plugin index entrypoints must match the module map.");
  check(deepEqualPy(index.default_entrypoint, query.entrypoint_skill), "INDEX_DEFAULT_ENTRYPOINT", "plugin-index-v1.json.default_entrypoint", "Query must be the default plugin entrypoint.");
  for (const skillId of index.public_entrypoints ?? []) {
    check(skillDirs.has(skillId), "PUBLIC_ENTRYPOINT", `public_entrypoints.${skillId}`, "Public entrypoint is not packaged.");
  }
  check(
    deepEqualPy(index.public_entrypoints, [norm(query.entrypoint_skill), norm(create.entrypoint_skill)]),
    "PUBLIC_ENTRYPOINT_SET",
    "plugin-index-v1.json.public_entrypoints",
    "Only Query and Create may be public plugin entrypoints.",
  );
  check(
    isSubset(
      new Set([norm(query.entrypoint_skill), norm(create.entrypoint_skill)]),
      new Set((index.public_entrypoints ?? []).map(norm)),
    ),
    "MODULE_PUBLIC_ENTRYPOINTS",
    "plugin-index-v1.json.public_entrypoints",
    "Both module entrypoints must be public.",
  );

  check(queryMenu.module_id === "query", "QUERY_MENU_MODULE", "query-menu-v1.json.module_id", "Query menu must belong to Query.");
  (queryMenu.queries ?? []).forEach((item, queryIndex) => {
    const base = `query-menu-v1.json.queries[${queryIndex}]`;
    for (const skillId of item.skill_refs ?? []) {
      check(querySkills.has(skillId), "QUERY_MENU_SKILL", `${base}.skill_refs`, `Query menu cannot invoke non-query Skill ${skillId}.`);
    }
    for (const toolName of item.mcp_tools ?? []) {
      const tool = tools.get(toolName);
      check(tool !== undefined, "QUERY_MENU_TOOL", `${base}.mcp_tools`, `Unknown MCP tool ${toolName}.`);
      if (tool !== undefined) {
        check(tool.module === "query" && tool.access === "read", "QUERY_WRITE_TOOL", `${base}.mcp_tools`, `Query cannot use ${toolName} because it is not a read-only Query tool.`);
      }
    }
  });

  check(creationMenu.module_id === "create", "CREATION_MENU_MODULE", "creation-menu-v1.json.module_id", "Creation menu must belong to Create.");
  (creationMenu.steps ?? []).forEach((step, stepIndex) => {
    (step.options ?? []).forEach((option, optionIndex) => {
      const base = `creation-menu-v1.json.steps[${stepIndex}].options[${optionIndex}]`;
      for (const skillId of option.skill_refs ?? []) {
        check(createSkills.has(skillId) || querySkills.has(skillId), "CREATION_MENU_SKILL", `${base}.skill_refs`, `Unknown Skill ${skillId}.`);
      }
      for (const toolName of option.mcp_tools ?? []) {
        const tool = tools.get(toolName);
        check(tool !== undefined, "CREATION_MENU_TOOL", `${base}.mcp_tools`, `Unknown MCP tool ${toolName}.`);
        if (tool !== undefined) {
          const allowed = tool.module === "create" || (
            tool.module === "query" && (create.may_invoke ?? []).includes("query")
          );
          check(allowed, "CREATION_TOOL_EDGE", `${base}.mcp_tools`, `Create cannot invoke MCP tool ${toolName} through the declared module graph.`);
          check(tool.access === "read", "CREATION_MENU_WRITE_TOOL", `${base}.mcp_tools`, "Creation choices may request Query data but cannot perform writes.");
        }
      }
      const optionTools = new Set((option.mcp_tools ?? []).map(norm));
      if (intersects(optionTools, requiredTools)) {
        check(option.availability === "backend_required", "MENU_BACKEND_AVAILABILITY", `${base}.availability`, "Options using required MCP tools must be marked backend_required.");
      }
    });
  });

  const expectedWriteGates = new Map([
    ["save_creator_artifact", new Set(["explicit_user_approval", "artifact_hash", "idempotency_key"])],
    ["register_settlement_claim", new Set(["explicit_user_approval", "claim_hash", "formula_hash", "idempotency_key"])],
    ["publish_release", new Set(["explicit_user_approval", "release_approval", "exact_artifact_hash", "idempotency_key"])],
  ]);
  const writeActions = creationMenu.write_actions ?? [];
  check(writeActions.length === expectedWriteGates.size, "WRITE_ACTION_COUNT", "creation-menu-v1.json.write_actions", "Creation menu must declare every authorized write separately from creation choices.");
  writeActions.forEach((action, actionIndex) => {
    const base = `creation-menu-v1.json.write_actions[${actionIndex}]`;
    const toolName = action.mcp_tool;
    const tool = tools.get(toolName);
    check(expectedWriteGates.has(toolName), "WRITE_ACTION_TOOL", `${base}.mcp_tool`, `Unexpected write tool ${toolName}.`);
    if (tool !== undefined) {
      check(tool.module === "create" && ["write", "external_write"].includes(tool.access), "WRITE_ACTION_ACCESS", `${base}.mcp_tool`, "Write action must reference a Create write tool.");
    }
    check(setEq(new Set(action.required_gates ?? []), expectedWriteGates.get(toolName) ?? new Set()), "WRITE_ACTION_GATES", `${base}.required_gates`, "Write action approval, hash, and idempotency gates are incomplete.");
  });

  check(!intersects(availableTools, requiredTools), "DUPLICATE_TOOL_PHASE", "mcp-capability-map-v1.json", "A tool cannot be both available and required.");
  const rules = capabilityMap.module_rules ?? {};
  check(deepEqualPy(rules.query, { allowed_access: ["read"], may_invoke: [] }), "QUERY_TOOL_RULE", "module_rules.query", "Query MCP rules must allow read only.");
  check(deepEqualPy(rules.create, { allowed_access: ["read", "write", "external_write"], may_invoke: ["query"] }), "CREATE_TOOL_RULE", "module_rules.create", "Create owns writes, may perform narrow operational reads, and may invoke Query for market reads.");
  const skillToModule = skillOwner;
  const releaseRules = capabilityMap.release_rules ?? {};
  for (const ruleName of [
    "server_enforces_authorization_scopes",
    "query_scope_cannot_call_write_tools",
    "write_tools_require_idempotency_key",
    "write_tools_require_explicit_approval",
    "frame_images_are_upload_only",
    "frame_media_status_returns_receipts_only",
    "frame_get_returns_one_attached_visual",
    "frame_mutations_use_distinct_uuidv7_keys",
    "frame_publish_action_authorizes_publish",
    "frame_publish_recomputes_prepared_hash_and_revalidates_authority",
    "frame_withdraw_requires_first_party_consent",
  ]) {
    check(releaseRules[ruleName] === true, "RUNTIME_ENFORCEMENT", `release_rules.${ruleName}`, "Runtime enforcement rule must be enabled.");
  }
  for (const [toolName, tool] of tools) {
    const moduleId = tool.module;
    const access = tool.access;
    const allowedAccess = new Set((((rules[moduleId]) ?? {}).allowed_access ?? []).map(norm));
    check(allowedAccess.has(norm(access)), "TOOL_ACCESS_MODULE", `tools.${toolName}`, `Tool access ${rep(access)} is invalid for module ${rep(moduleId)}.`);
    const expectedScope = FRAME_TOOL_SCOPES.get(toolName)
      ?? PAPER_TOOL_SCOPES.get(toolName)
      ?? (availableTools.has(toolName) && moduleId === "query"
        ? "read:public"
        : (moduleId === "query" ? "cuebook.query" : (access === "external_write" ? "cuebook.publish" : "cuebook.create.write")));
    check(tool.authorization_scope === expectedScope, "TOOL_AUTH_SCOPE", `tools.${toolName}.authorization_scope`, `Tool must require ${expectedScope}.`);
    if (FRAME_TOOL_SCOPES.has(toolName)) {
      check(tool.authorization_scope === expectedScope, "FRAME_TOOL_SCOPE", `tools.${toolName}.authorization_scope`, `Frame Tool ${toolName} must require ${expectedScope}.`);
    }
    for (const skillId of tool.used_by ?? []) {
      const owner = skillToModule.get(skillId);
      check(owner !== undefined, "TOOL_SKILL_REF", `tools.${toolName}.used_by`, `Unknown Skill ${skillId}.`);
      if (owner !== undefined) {
        const allowed = owner === moduleId || ((modules.get(owner) ?? {}).may_invoke ?? []).includes(moduleId);
        check(allowed, "TOOL_MODULE_EDGE", `tools.${toolName}.used_by`, `${owner} Skill ${skillId} cannot use ${moduleId} tool ${toolName}.`);
        if (moduleId === "query") {
          const isPublishedFrameVerification = toolName === "get_frame" && skillId === "create-cuebook-content";
          check(owner === "query" || isPublishedFrameVerification, "CREATE_DIRECT_READ", `tools.${toolName}.used_by`, `Create Skill ${skillId} must consume QueryBundleV1 instead of calling Query tool ${toolName} directly.`);
        }
      }
    }
  }

  for (const skillId of ["create-cuebook-content", "query-cuebook"]) {
    const body = readFileSync(path.join(pluginRoot, "skills", skillId, "SKILL.md"), "utf-8");
    check(
      !/\bget_frame_media\b/u.test(body),
      "FRAME_SKILL_MEDIA_PULL",
      `skills/${skillId}/SKILL.md`,
      "Skill instructions must not call or reintroduce standalone Frame media retrieval; use owner-only status receipts during upload and get_frame after publish.",
    );
  }

  for (const skillId of querySkills) {
    const surface = (((catalogSkills.get(skillId) ?? {}).ui) ?? {}).surface;
    check(["query", "library", "internal"].includes(surface), "QUERY_CATALOG_SURFACE", `catalog.skills.${skillId}.ui.surface`, "Query Skills cannot live on a Create or admin surface.");
  }
  for (const skillId of createSkills) {
    const surface = (((catalogSkills.get(skillId) ?? {}).ui) ?? {}).surface;
    check(surface !== "query", "CREATE_CATALOG_SURFACE", `catalog.skills.${skillId}.ui.surface`, "Create Skills cannot live on the Query surface.");
  }

  const configured = ((mcpConfig.mcpServers ?? {}).cuebook) ?? {};
  check(deepEqualPy(configured.url, (capabilityMap.server ?? {}).url), "MCP_URL", ".mcp.json", "MCP config and capability map URLs differ.");
  check(deepEqualPy(configured.oauth_resource, configured.url), "MCP_OAUTH_RESOURCE", ".mcp.json", "Cuebook OAuth resource must match its MCP URL.");
  check(!availableTools.has("publish_release"), "PUBLISH_PHASE", "mcp-capability-map-v1.json", "External publishing cannot be marked available before the R2 connector exists.");

  return {
    valid: !errors.length,
    errors,
    stats: {
      skill_count: skillDirs.size,
      catalog_version: norm(catalogVersion),
      module_skill_counts: Object.fromEntries(
        [...moduleSkillSets.keys()].sort().map((key) => [key, moduleSkillSets.get(key).size]),
      ),
      query_type_count: (queryMenu.queries ?? []).length,
      creation_step_count: (creationMenu.steps ?? []).length,
      available_mcp_tools: [...availableTools].filter(Boolean).sort(),
      required_mcp_tools: [...requiredTools].filter(Boolean).sort(),
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] ?? "").startsWith("-")) {
    process.stderr.write("usage: validate_cuebook_plugin.mjs [plugin_root]\n");
    process.exit(2);
  }
  const pluginRoot = path.resolve(args[0] ?? path.resolve(SCRIPT_DIR, ".."));
  const result = validate(pluginRoot);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
