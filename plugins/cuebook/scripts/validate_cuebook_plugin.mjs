#!/usr/bin/env node
// Validate Cuebook packaging and the one-way Query -> Create boundary.

import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance, pyrepr } from "./validate_json_schema.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const CUEBOOK_MCP_URL = "https://cuebook.xyz/mcp";

const PLATFORM_GUIDES = new Set([
  "chatgpt.md",
  "claude-code.md",
  "claude-desktop.md",
  "codex.md",
  "cursor.md",
  "generic-agent-skills.md",
  "generic-mcp.md",
  "grok.md",
  "hermes.md",
  "openclaw.md",
]);

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

function findNamedFiles(root, fileName) {
  const found = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === fileName) found.push(target);
    }
  };
  walk(root);
  return found.sort();
}

const setEq = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));
const intersects = (a, b) => [...a].some((item) => b.has(item));
const isSubset = (a, b) => [...a].every((item) => b.has(item));

const FRAME_TOOL_SCOPES = new Map([
  ["get_frame_capabilities", "read:public"],
  ["begin_frame_media_upload", "cuebook.frame.write"],
  ["complete_frame_publish", "cuebook.frame.publish"],
  ["preflight_frame_publish", "cuebook.frame.publish"],
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
  ["preview_paper_order", "cuebook.paper.trade"],
  ["list_paper_orders", "cuebook.paper.read"],
  ["place_paper_order", "cuebook.paper.trade"],
  ["close_paper_position", "cuebook.paper.trade"],
]);

// Personal decision memory (user-memory PR3/PR4): read tools carry the
// dedicated read scope; the single proposal tool carries propose (read is a
// server-side prerequisite). No manage scope may ever appear here.
const MEMORY_TOOL_SCOPES = new Map([
  ["get_decision_context", "cuebook.memory.read"],
  ["list_memory_items", "cuebook.memory.read"],
  ["propose_memory", "cuebook.memory.propose"],
  ["get_interest_profile", "cuebook.memory.read"],
]);

// Community skill marketplace: the submission pair carries the dedicated
// one-time cuebook.community.publish consent; the catalog reads stay public.
const COMMUNITY_TOOL_SCOPES = new Map([
  ["begin_skill_publish", "cuebook.community.publish"],
  ["complete_skill_publish", "cuebook.community.publish"],
]);

// The community catalog is submission metadata, not market data: the author
// entry may read it directly instead of consuming a QueryBundleV1.
const COMMUNITY_CATALOG_READ_TOOLS = new Set([
  "list_community_skills",
  "get_community_skill",
]);

const PLANNED_TOOLS = new Set([
  "get_creator_feed",
  "compute_market_metrics",
  "publish_release",
  "get_publication_receipt",
]);

const SUPERSEDED_TOOLS = new Set([
  "resolve_settlement_binding",
  "save_creator_artifact",
  "register_settlement_claim",
]);

const CREATOR_FAST_TOOLS = new Set([
  "search_assets",
  "get_market_state",
  "list_asset_cues",
  "get_cues",
  "search_news",
  "get_candles",
  "list_market_calendar",
  "get_positioning",
  "list_asset_events",
]);

const FOCUSED_ON_DEMAND_TOOLS = new Set([
  "list_filings",
  "list_asset_disclosures",
  "get_news_cluster",
  "list_prediction_markets",
  "list_market_briefings",
  "get_decision_context",
  "list_memory_items",
  "get_interest_profile",
]);

const DEEP_ONLY_TOOLS = new Set([
  "list_themes",
  "get_cues_detail",
  "get_reasoning_graph",
  "list_settlements",
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
  explicit_frame_query_tool: "get_frame",
  automatic_post_publish_readback: false,
  publish_success_source: "successful_complete_frame_publish_result",
  creator_link_policy: "never_present_canonical_url",
  published_visual_semantics: "one_visual_attached_to_frame_release",
  client_upload_roles: ["publication"],
  capture_profiles: { publication: { width: 1866, height: 1200 } },
  delivery_resize_policy: "frontend_or_edge_transformation_only",
  forbidden_tools: [...FORBIDDEN_FRAME_MEDIA_TOOLS],
  initial_publish_sequence: [
    "begin_frame_media_upload",
    "https_put_publication_master",
    "complete_frame_media_upload",
    "complete_frame_publish",
  ],
  initial_settlement_modes: {
    directional: "long_or_short_with_zero_bps_at_exact_deadline",
    terminal_range: "range_with_creator_confirmed_max_abs_move_bps_at_exact_deadline",
    relative_outperformance:
      "two_distinct_same_session_assets_with_equal_notional_return_spread_at_exact_deadline",
    compound_conditions:
      "two_distinct_same_session_assets_with_independent_all_legs_conditions_at_exact_deadline",
  },
  correction_publish_sequence: [
    "prepare_frame_correction_publish",
    "publish_frame_correction",
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
    tool_manifest_sha256: "107f0c7753a89b9185152f0f4707f632c9f22101ae33ce3bedccd36eed55a0b5",
    schema_catalog_sha256: "5aba76bf1fcbf4f85105e6423c42565b17a5fb696aa5dd18395bf31570f98b9c",
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

  const platformsRoot = path.join(pluginRoot, "platforms");
  const platformIndexPath = path.join(platformsRoot, "README.md");
  const platformIndex = existsSync(platformIndexPath)
    ? readFileSync(platformIndexPath, "utf-8")
    : "";
  const platformGuideFiles = new Set(
    existsSync(platformsRoot)
      ? readdirSync(platformsRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
        .map((entry) => entry.name)
      : [],
  );
  check(
    setEq(platformGuideFiles, PLATFORM_GUIDES),
    "PLATFORM_DOC_SET",
    "platforms",
    "Platform documentation must contain exactly the ten supported host guides plus its README index.",
  );
  check(
    platformIndex.includes(CUEBOOK_MCP_URL),
    "PLATFORM_MCP_ENDPOINT",
    "platforms/README.md",
    "The platform matrix must name the canonical Cuebook MCP endpoint.",
  );
  check(
    !/[\u3400-\u9fff]/u.test(platformIndex),
    "PLATFORM_DOC_LANGUAGE",
    "platforms/README.md",
    "Public platform documentation must remain English-only.",
  );
  for (const guideName of PLATFORM_GUIDES) {
    const guidePath = path.join(platformsRoot, guideName);
    if (!existsSync(guidePath)) continue;
    const guide = readFileSync(guidePath, "utf-8");
    check(
      guide.includes(CUEBOOK_MCP_URL),
      "PLATFORM_MCP_ENDPOINT",
      `platforms/${guideName}`,
      "Every host guide must name the same canonical Cuebook MCP endpoint.",
    );
    check(
      /\*\*Live status:\*\*/u.test(guide),
      "PLATFORM_LIVE_STATUS",
      `platforms/${guideName}`,
      "Every host guide must distinguish live verification status from package or protocol compatibility.",
    );
    check(
      guide.includes("live verification gate"),
      "PLATFORM_VERIFICATION_GATE",
      `platforms/${guideName}`,
      "Every host guide must route to the shared evidence-based live verification gate.",
    );
    check(
      !/[\u3400-\u9fff]/u.test(guide),
      "PLATFORM_DOC_LANGUAGE",
      `platforms/${guideName}`,
      "Public platform documentation must remain English-only.",
    );
    check(
      platformIndex.includes(`(${guideName})`),
      "PLATFORM_INDEX_LINK",
      "platforms/README.md",
      `The platform matrix must link ${guideName}.`,
    );
  }

  const claudeManifestPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  check(
    existsSync(claudeManifestPath),
    "CLAUDE_PLUGIN_MANIFEST",
    ".claude-plugin/plugin.json",
    "Claude Code distribution requires a native plugin manifest.",
  );
  if (existsSync(claudeManifestPath)) {
    const claudeManifest = load(claudeManifestPath);
    check(claudeManifest.name === "cuebook", "CLAUDE_PLUGIN_NAME", ".claude-plugin/plugin.json.name", "Unexpected Claude Code plugin name.");
    check(
      claudeManifest.skills === "./public-skills/",
      "CLAUDE_PLUGIN_PUBLIC_SKILL_ROOT",
      ".claude-plugin/plugin.json.skills",
      "Claude Code must discover only the two generated public Skills.",
    );
    check(
      claudeManifest.mcpServers === "./.mcp.json",
      "CLAUDE_PLUGIN_MCP_CONFIG",
      ".claude-plugin/plugin.json.mcpServers",
      "Claude Code must reuse the canonical plugin MCP configuration.",
    );
    check(
      claudeManifest.version === String(manifest.version ?? "").split("+")[0],
      "CLAUDE_PLUGIN_VERSION_DRIFT",
      ".claude-plugin/plugin.json.version",
      "Claude Code and Codex manifests must share the same release version.",
    );
  }

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
  const plannedToolItems = (capabilityMap.planned_tools ?? []).filter(isDict);
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
  const plannedTools = new Set(plannedToolItems.map((item) => norm(item.tool)));
  const frameTools = new Set(
    (capabilityMap.required_tools ?? [])
      .filter((item) => isDict(item) && item.phase === "frame_phase_b")
      .map((item) => norm(item.tool)),
  );

  check(
    setEq(frameTools, new Set(FRAME_TOOL_SCOPES.keys())),
    "FRAME_TOOL_SET",
    "mcp-capability-map-v1.json.required_tools",
    "Frame MCP must expose the fast initial publication Tool plus the compatible upload, draft, correction, withdrawal-consent, and full-Frame operations.",
  );
  check(
    setEq(requiredTools, frameTools),
    "REQUIRED_TOOL_SET",
    "mcp-capability-map-v1.json.required_tools",
    "Active required tools must contain only the current 19-Tool Frame family.",
  );
  check(
    setEq(plannedTools, PLANNED_TOOLS),
    "PLANNED_TOOL_SET",
    "mcp-capability-map-v1.json.planned_tools",
    "Only the four explicitly unimplemented capabilities may remain planned.",
  );
  check(
    !intersects(new Set(tools.keys()), plannedTools),
    "PLANNED_TOOL_ACTIVE",
    "mcp-capability-map-v1.json",
    "Planned tools are documentation only and cannot appear in active available or required tools.",
  );
  check(
    !intersects(new Set([...tools.keys(), ...plannedTools]), SUPERSEDED_TOOLS),
    "SUPERSEDED_TOOL_PRESENT",
    "mcp-capability-map-v1.json",
    "Superseded settlement and legacy write tools must be absent from the capability catalog.",
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

  const skillToolPolicy = capabilityMap.skill_tool_policy ?? {};
  const creatorFastTools = new Set(skillToolPolicy.creator_fast_allowlist ?? []);
  const focusedTools = new Set(skillToolPolicy.focused_on_demand ?? []);
  const deepTools = new Set(skillToolPolicy.deep_only ?? []);
  check(setEq(creatorFastTools, CREATOR_FAST_TOOLS), "CREATOR_FAST_TOOL_SET", "mcp-capability-map-v1.json.skill_tool_policy.creator_fast_allowlist", "Fast creator routing must stay on the small approved Cuebook read surface.");
  check(setEq(focusedTools, FOCUSED_ON_DEMAND_TOOLS), "FOCUSED_TOOL_SET", "mcp-capability-map-v1.json.skill_tool_policy.focused_on_demand", "Focused reads must remain explicit and on demand.");
  check(setEq(deepTools, DEEP_ONLY_TOOLS), "DEEP_TOOL_SET", "mcp-capability-map-v1.json.skill_tool_policy.deep_only", "Graph, themes, detail, and settlement history must remain deep-only.");
  check(!intersects(creatorFastTools, focusedTools) && !intersects(creatorFastTools, deepTools) && !intersects(focusedTools, deepTools), "SKILL_TOOL_POLICY_OVERLAP", "mcp-capability-map-v1.json.skill_tool_policy", "Fast, focused, and deep Skill tool sets must be disjoint.");
  for (const toolName of [...creatorFastTools, ...focusedTools, ...deepTools]) {
    const tool = tools.get(toolName);
    check(availableTools.has(toolName) && tool?.module === "query" && tool?.access === "read", "SKILL_TOOL_POLICY_ACTIVE", `skill_tool_policy.${toolName}`, "Skill retrieval policy may name only active read-only Query tools.");
  }
  check(deepTools.has("get_reasoning_graph") && !creatorFastTools.has("get_reasoning_graph"), "REASONING_GRAPH_ROUTE", "mcp-capability-map-v1.json.skill_tool_policy", "The reasoning graph must never enter the default creator fast path.");
  check(
    deepEqualPy(skillToolPolicy.web_fallback, {
      trigger: "material_gap_after_cuebook_batch",
      max_batches: 1,
      max_queries: 3,
      max_sources: 3,
      source_preference: "primary_or_authoritative",
      required_lineage_fields: ["retrieved_via", "retrieved_at", "locator"],
      unsupported_claim_policy: "creator_hypothesis_or_omit",
    }),
    "WEB_FALLBACK_POLICY",
    "mcp-capability-map-v1.json.skill_tool_policy.web_fallback",
    "Web fallback must remain one bounded, source-attributed batch after a Cuebook evidence gap.",
  );

  check(manifest.name === "cuebook", "PLUGIN_NAME", "plugin.json.name", "Unexpected plugin name.");
  check(
    manifest.skills === "./public-skills/",
    "PLUGIN_PUBLIC_SKILL_ROOT",
    "plugin.json.skills",
    "Codex must discover only the generated public-skills directory.",
  );
  const publicSkillsRoot = path.join(pluginRoot, "public-skills");
  const publicSkillDocs = findNamedFiles(publicSkillsRoot, "SKILL.md");
  const publicSkillIds = new Set(
    existsSync(publicSkillsRoot)
      ? readdirSync(publicSkillsRoot, { withFileTypes: true })
        .filter((entry) => (
          entry.isDirectory()
          && existsSync(path.join(publicSkillsRoot, entry.name, "SKILL.md"))
        ))
        .map((entry) => entry.name)
      : [],
  );
  const expectedPublicSkillIds = new Set((index.public_entrypoints ?? []).map(norm));
  check(
    publicSkillDocs.length === 3,
    "PLUGIN_PUBLIC_SKILL_COUNT",
    "public-skills",
    "The Codex plugin release must expose exactly three SKILL.md files.",
  );
  check(
    setEq(publicSkillIds, expectedPublicSkillIds),
    "PLUGIN_PUBLIC_SKILL_SET",
    "public-skills",
    "Only query-cuebook, create-cuebook-content, and author-cuebook-skill may be public Codex Skills.",
  );
  check(
    publicSkillDocs.every((skillDoc) => (
      path.dirname(path.relative(publicSkillsRoot, skillDoc)).split(path.sep).length === 1
    )),
    "PLUGIN_NESTED_SKILL",
    "public-skills",
    "Internal capabilities must be references/modules/*.md, never nested SKILL.md files.",
  );
  for (const skillId of expectedPublicSkillIds) {
    const sourceSkillPath = path.join(pluginRoot, "skills", skillId, "SKILL.md");
    const sourceSkill = existsSync(sourceSkillPath) ? readFileSync(sourceSkillPath, "utf-8") : "";
    check(
      sourceSkill.includes("## Cuebook Context")
        && sourceSkill.includes("unless the creator explicitly asks for another Skill")
        && sourceSkill.includes("Keep routing backstage"),
      "CUEBOOK_CONTEXT_BOUNDARY",
      `skills/${skillId}/SKILL.md`,
      "Every public Cuebook entrypoint must remain self-contained by default and keep Skill routing backstage.",
    );
  }
  const querySource = readFileSync(path.join(pluginRoot, "skills", "query-cuebook", "SKILL.md"), "utf-8");
  const createSource = readFileSync(path.join(pluginRoot, "skills", "create-cuebook-content", "SKILL.md"), "utf-8");
  check(
    querySource.includes("ranked candidates, not an existence verdict")
      && querySource.includes("`matchType: exact`")
      && querySource.includes("do not claim Cuebook has no knowledge")
      && querySource.includes("Never substitute a fuzzy candidate")
      && querySource.includes("nearest carrier")
      && querySource.includes("operation gap, not an identity gap")
      && createSource.includes("Query's exact-identity rule")
      && createSource.includes("a proxy is a different idea")
      && createSource.includes("Only settlement legs require `frameSettlement: true`"),
    "ASSET_EXACT_MATCH_BOUNDARY",
    "skills/query-cuebook/SKILL.md",
    "Named assets must bind an exact identity; capability gaps cannot erase identity, and fuzzy candidates or proxies cannot become substitutes.",
  );

  const tradingviewFiles = {
    desktopPolicy: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-tool-policy-v1.json"),
    researchPolicy: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-research-policy-v1.json"),
    observationSchema: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-observation-v1.schema.json"),
    observationValidator: path.join(pluginRoot, "skills", "query-cuebook", "scripts", "validate_tradingview_observation.mjs"),
    workbench: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-workbench.md"),
    focusedCaptureSchema: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-focused-capture-v1.schema.json"),
    focusedCaptureValidator: path.join(pluginRoot, "skills", "query-cuebook", "scripts", "validate_tradingview_focused_capture.mjs"),
    focusedCaptureWorkflow: path.join(pluginRoot, "skills", "query-cuebook", "references", "tradingview-focused-capture.md"),
    canvasPolicy: path.join(pluginRoot, "skills", "create-cuebook-content", "references", "tradingview-canvas-tool-policy-v1.json"),
    canvasSchema: path.join(pluginRoot, "skills", "create-cuebook-content", "references", "tradingview-canvas-transfer-v1.schema.json"),
    canvasValidator: path.join(pluginRoot, "skills", "create-cuebook-content", "scripts", "validate_tradingview_canvas_transfer.mjs"),
    canvasWorkflow: path.join(pluginRoot, "skills", "create-cuebook-content", "references", "tradingview-canvas-transfer.md"),
    setupGuide: path.join(pluginRoot, "references", "tradingview-optional-connectors.md"),
  };
  check(
    Object.values(tradingviewFiles).every((filePath) => existsSync(filePath)),
    "TRADINGVIEW_BRIDGE_FILES",
    "skills/query-cuebook",
    "The optional TradingView observation and canvas contracts must ship as internal resources behind the two public Skills.",
  );
  const desktopPolicy = existsSync(tradingviewFiles.desktopPolicy) ? load(tradingviewFiles.desktopPolicy) : {};
  const researchPolicy = existsSync(tradingviewFiles.researchPolicy) ? load(tradingviewFiles.researchPolicy) : {};
  const canvasPolicy = existsSync(tradingviewFiles.canvasPolicy) ? load(tradingviewFiles.canvasPolicy) : {};
  const focusedCaptureSource = existsSync(tradingviewFiles.focusedCaptureWorkflow)
    ? readFileSync(tradingviewFiles.focusedCaptureWorkflow, "utf-8")
    : "";
  const policyInventory = (policy) => Object.values(policy.classes ?? {}).flatMap((items) => Array.isArray(items) ? items : []);
  const desktopInventory = policyInventory(desktopPolicy);
  const researchInventory = policyInventory(researchPolicy);
  check(
    desktopPolicy.upstream?.tool_count === 84
      && desktopInventory.length === 84
      && new Set(desktopInventory).size === 84
      && desktopPolicy.frame_policy?.direct_screenshot_upload_allowed === false
      && desktopPolicy.frame_policy?.official_attributed_snapshot_finished_bitmap_allowed === true
      && desktopPolicy.frame_policy?.raw_capture_requires_focus_contract === true
      && desktopPolicy.frame_policy?.minimum_attribution_effective_px === 13
      && desktopPolicy.frame_policy?.cuebook_data_rerender_required_for_unattributed_or_unlicensed_capture === true,
    "TRADINGVIEW_DESKTOP_POLICY",
    "skills/query-cuebook/references/tradingview-tool-policy-v1.json",
    "The audited 84-Tool Desktop inventory must remain complete and unique; raw captures stay local while only an attributed, focused, audited official snapshot may reach Frame.",
  );
  check(
    researchPolicy.upstream?.tool_count === 37
      && researchInventory.length === 37
      && new Set(researchInventory).size === 37
      && (researchPolicy.classes?.excluded_synthesis ?? []).includes("multi_agent_analysis")
      && researchPolicy.interpretation_policy?.allow_final_recommendation_fields === false,
    "TRADINGVIEW_RESEARCH_POLICY",
    "skills/query-cuebook/references/tradingview-research-policy-v1.json",
    "The audited 37-Tool research inventory must remain complete and exclude opaque recommendation synthesis.",
  );
  const canvasAllowed = new Set(Object.values(canvasPolicy.allowed_tools ?? {}).flatMap((items) => Array.isArray(items) ? items : []));
  check(
    canvasAllowed.has("draw_shape")
      && canvasAllowed.has("draw_remove_one")
      && !canvasAllowed.has("draw_clear")
      && (canvasPolicy.explicitly_blocked_tools ?? []).includes("draw_clear")
      && canvasPolicy.lifecycle?.cleanup_only_created_entity_ids === true
      && canvasPolicy.lifecycle?.clear_all_allowed === false
      && canvasPolicy.lifecycle?.direct_frame_pixel_reuse_allowed === false,
    "TRADINGVIEW_CANVAS_POLICY",
    "skills/create-cuebook-content/references/tradingview-canvas-tool-policy-v1.json",
    "Canvas transfer must require exact confirmed drawings, preserve existing entities, and block clear-all or direct Frame pixel reuse.",
  );
  const queryBundleSchemaPath = path.join(pluginRoot, "skills", "query-cuebook", "references", "cuebook-query-bundle-v1.schema.json");
  const queryBundleSchema = existsSync(queryBundleSchemaPath) ? load(queryBundleSchemaPath) : {};
  const retrievalMethods = queryBundleSchema.properties?.source_register?.items?.properties?.retrieved_via?.enum ?? [];
  check(
    retrievalMethods.includes("tradingview_desktop_mcp")
      && retrievalMethods.includes("tradingview_research_mcp")
      && querySource.includes("restricted and never a direct Frame input")
      && createSource.includes("canvas-transfer reference")
      && createSource.includes("never TradingView pixels, data, or Pine")
      && createSource.includes("## Attributed TradingView Snapshot")
      && createSource.includes("official snapshot")
      && focusedCaptureSource.includes('region: "chart"')
      && focusedCaptureSource.includes("attributed_finished_bitmap")
      && focusedCaptureSource.includes("13 px"),
    "TRADINGVIEW_SKILL_BOUNDARY",
    "skills/query-cuebook/SKILL.md",
    "TradingView must remain optional and read-only in Query; raw captures stay restricted, while Create may use only a focused, attributed, rights-reviewed finished bitmap or native rerender.",
  );
  const tradingviewPublicFiles = [
    path.join(pluginRoot, "public-skills", "query-cuebook", "references", "tradingview-workbench.md"),
    path.join(pluginRoot, "public-skills", "query-cuebook", "scripts", "validate_tradingview_observation.mjs"),
    path.join(pluginRoot, "public-skills", "query-cuebook", "references", "tradingview-focused-capture.md"),
    path.join(pluginRoot, "public-skills", "query-cuebook", "references", "tradingview-focused-capture-v1.schema.json"),
    path.join(pluginRoot, "public-skills", "query-cuebook", "scripts", "validate_tradingview_focused_capture.mjs"),
    path.join(pluginRoot, "public-skills", "create-cuebook-content", "references", "tradingview-canvas-transfer.md"),
    path.join(pluginRoot, "public-skills", "create-cuebook-content", "scripts", "validate_tradingview_canvas_transfer.mjs"),
    path.join(pluginRoot, "public-skills", "create-cuebook-content", "references", "modules", "query-cuebook", "references", "tradingview-workbench.md"),
    path.join(pluginRoot, "public-skills", "create-cuebook-content", "references", "modules", "query-cuebook", "references", "tradingview-focused-capture.md"),
    path.join(pluginRoot, "public-skills", "create-cuebook-content", "references", "modules", "query-cuebook", "scripts", "validate_tradingview_focused_capture.mjs"),
  ];
  check(
    tradingviewPublicFiles.every((filePath) => existsSync(filePath)),
    "TRADINGVIEW_PUBLIC_BUNDLE",
    "public-skills",
    "Both generated public bundles must carry their conditional TradingView references and validators without exposing a third Skill.",
  );
  const publicReleaseManifestPath = path.join(publicSkillsRoot, "release-manifest.json");
  check(
    existsSync(publicReleaseManifestPath),
    "PLUGIN_RELEASE_MANIFEST",
    "public-skills/release-manifest.json",
    "Generated public Skill manifest is missing.",
  );
  const publicReleaseManifest = existsSync(publicReleaseManifestPath)
    ? load(publicReleaseManifestPath)
    : {};
  check(
    publicReleaseManifest.schema_version === "cuebook-release-skills-manifest-v2",
    "PLUGIN_RELEASE_MANIFEST_VERSION",
    "public-skills/release-manifest.json.schema_version",
    "Public Skill manifest must use the module-based v2 release contract.",
  );
  check(
    (publicReleaseManifest.discovery_budget ?? {}).reduction_percent >= 60,
    "PLUGIN_DISCOVERY_BUDGET",
    "public-skills/release-manifest.json.discovery_budget",
    "Public Skill discovery metadata must be at least 60% smaller than the legacy source surface.",
  );
  check(
    (publicReleaseManifest.frame_fast_preview_budget ?? {}).cumulative_bytes < 112_000,
    "PLUGIN_FAST_PREVIEW_BUDGET",
    "public-skills/release-manifest.json.frame_fast_preview_budget",
    "Fast Frame preview instruction and contract input must stay below 112k bytes.",
  );
  check(
    (publicReleaseManifest.frame_publish_input_budget ?? {}).cumulative_bytes < 40_000,
    "PLUGIN_PUBLISH_INPUT_BUDGET",
    "public-skills/release-manifest.json.frame_publish_input_budget",
    "On-demand Frame publication input must stay below 40k bytes.",
  );
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
    setEq(new Set(routing.query_deliverables ?? []), new Set(["answer", "comparison", "source_bundle", "data_table", "factual_chart", "history_view", "tradingview_observation", "tradingview_focused_capture", "creation_handoff"])),
    "QUERY_DELIVERABLES",
    "routing_rules.query_deliverables",
    "Read-only views, including factual charts, must belong to Query.",
  );
  check(
    setEq(new Set(routing.create_deliverables ?? []), new Set(["market_post", "creator_viewpoint_graphic", "settlement_protocol", "release_bundle", "publishing_candidates", "attributed_snapshot_frame", "tradingview_canvas"])),
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
    deepEqualPy(index.public_entrypoints, [
      norm(query.entrypoint_skill),
      norm(create.entrypoint_skill),
      "author-cuebook-skill",
    ]),
    "PUBLIC_ENTRYPOINT_SET",
    "plugin-index-v1.json.public_entrypoints",
    "Only Query, Create, and the community submission entry may be public plugin entrypoints.",
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
    const optionalConnectors = item.optional_connectors ?? [];
    check(
      item.availability === "optional_connector" ? optionalConnectors.length > 0 : optionalConnectors.length === 0,
      "QUERY_OPTIONAL_CONNECTOR",
      `${base}.optional_connectors`,
      "Optional Query routes must name their connector, and ordinary routes cannot carry one.",
    );
    if (item.availability === "optional_connector") {
      check((item.mcp_tools ?? []).length === 0, "QUERY_OPTIONAL_TOOL_MAP", `${base}.mcp_tools`, "Optional connectors are runtime-discovered and cannot masquerade as Cuebook MCP tools.");
    }
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
      const optionalConnectors = option.optional_connectors ?? [];
      check(
        option.availability === "optional_connector" ? optionalConnectors.length > 0 : optionalConnectors.length === 0,
        "CREATION_OPTIONAL_CONNECTOR",
        `${base}.optional_connectors`,
        "Optional creation routes must name their connector, and ordinary routes cannot carry one.",
      );
      if (option.availability === "optional_connector") {
        check((option.mcp_tools ?? []).length === 0, "CREATION_OPTIONAL_TOOL_MAP", `${base}.mcp_tools`, "Optional connectors are runtime-discovered and cannot masquerade as Cuebook MCP tools.");
      }
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

  const queryById = new Map((queryMenu.queries ?? []).map((item) => [item.query_id, item]));
  for (const queryId of ["tradingview_inspect", "tradingview_capture"]) {
    check(queryById.get(queryId)?.availability === "optional_connector", "TRADINGVIEW_QUERY_ROUTE", `query-menu-v1.json.queries.${queryId}`, "TradingView inspection and focus capture must remain reachable as optional Query routes.");
  }
  const creationOptions = new Map(
    (creationMenu.steps ?? []).flatMap((step) => (step.options ?? []).map((option) => [option.option_id, option])),
  );
  for (const optionId of ["tradingview_attributed_snapshot"]) {
    check(creationOptions.get(optionId)?.availability === "optional_connector", "TRADINGVIEW_CREATE_ROUTE", `creation-menu-v1.json.options.${optionId}`, "Attributed snapshots and canvas transfer must remain reachable as optional Create routes.");
  }
  for (const [relativePath, code] of [
    ["skills/query-cuebook/references/cuebook-intent-v1.schema.json", "CUEBOOK_INTENT_SCHEMA"],
    ["skills/query-cuebook/scripts/validate_cuebook_intent.mjs", "CUEBOOK_INTENT_VALIDATOR"],
    ["skills/create-cuebook-content/references/tradingview-attributed-frame-job-v1.schema.json", "TRADINGVIEW_FRAME_JOB"],
    ["skills/create-cuebook-content/references/tradingview-attributed-snapshot.md", "TRADINGVIEW_FRAME_GUIDE"],
    ["skills/create-cuebook-content/scripts/build_tradingview_attributed_frame.mjs", "TRADINGVIEW_FRAME_RUNNER"],
  ]) {
    check(existsSync(path.join(pluginRoot, relativePath)), code, relativePath, "A declared TradingView route is missing its executable contract or runtime resource.");
  }

  const expectedWriteGates = new Map([
    ["complete_frame_publish", new Set(["explicit_user_approval", "uploaded_publication_master", "idempotency_key"])],
    ["withdraw_frame", new Set(["explicit_user_approval", "first_party_consent", "prepared_hash", "idempotency_key"])],
  ]);
  const writeActions = creationMenu.write_actions ?? [];
  check(writeActions.length === expectedWriteGates.size, "WRITE_ACTION_COUNT", "creation-menu-v1.json.write_actions", "Creation menu must expose only atomic initial publication and withdrawal actions.");
  writeActions.forEach((action, actionIndex) => {
    const base = `creation-menu-v1.json.write_actions[${actionIndex}]`;
    const toolName = action.mcp_tool;
    const tool = tools.get(toolName);
    check(expectedWriteGates.has(toolName), "WRITE_ACTION_TOOL", `${base}.mcp_tool`, `Unexpected write tool ${toolName}.`);
    if (tool !== undefined) {
      check(tool.module === "create" && ["write", "external_write"].includes(tool.access), "WRITE_ACTION_ACCESS", `${base}.mcp_tool`, "Write action must reference a Create write tool.");
    }
    check(setEq(new Set(action.required_gates ?? []), expectedWriteGates.get(toolName) ?? new Set()), "WRITE_ACTION_GATES", `${base}.required_gates`, "Frame action intent, binding, authorization, and idempotency gates are incomplete.");
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
      ?? MEMORY_TOOL_SCOPES.get(toolName)
      ?? COMMUNITY_TOOL_SCOPES.get(toolName)
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
        if (moduleId === "query" && !COMMUNITY_CATALOG_READ_TOOLS.has(toolName)) check(owner === "query", "CREATE_DIRECT_READ", `tools.${toolName}.used_by`, `Create Skill ${skillId} must consume QueryBundleV1 instead of calling Query tool ${toolName} directly.`);
      }
    }
  }

  for (const tool of plannedToolItems) {
    const toolName = norm(tool.tool);
    const allowedAccess = new Set((((rules[tool.module]) ?? {}).allowed_access ?? []).map(norm));
    check(allowedAccess.has(norm(tool.access)), "PLANNED_TOOL_ACCESS", `planned_tools.${toolName}`, "Planned tool access must still match its owning module.");
    for (const skillId of tool.used_by ?? []) {
      const owner = skillToModule.get(skillId);
      check(owner !== undefined, "PLANNED_TOOL_SKILL_REF", `planned_tools.${toolName}.used_by`, `Unknown Skill ${skillId}.`);
      if (owner !== undefined) {
        const allowed = owner === tool.module || ((modules.get(owner) ?? {}).may_invoke ?? []).includes(tool.module);
        check(allowed, "PLANNED_TOOL_MODULE_EDGE", `planned_tools.${toolName}.used_by`, `${owner} Skill ${skillId} cannot use planned ${tool.module} tool ${toolName}.`);
      }
    }
  }

  for (const skillId of ["create-cuebook-content", "query-cuebook"]) {
    const body = readFileSync(path.join(pluginRoot, "skills", skillId, "SKILL.md"), "utf-8");
    check(
      !/\bget_frame_media\b/u.test(body),
      "FRAME_SKILL_MEDIA_PULL",
      `skills/${skillId}/SKILL.md`,
      "Skill instructions must not call or reintroduce standalone Frame media retrieval; use owner-only status receipts during upload and end publication on the validated publish receipt.",
    );
    for (const toolName of [...SUPERSEDED_TOOLS, ...PLANNED_TOOLS]) {
      check(!new RegExp(`\\b${toolName}\\b`, "u").test(body), "PUBLIC_SKILL_NONCALLABLE_TOOL", `skills/${skillId}/SKILL.md`, `Public entrypoint must not route to non-callable tool ${toolName}.`);
    }
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
  check(
    setEq(new Set(Object.keys(mcpConfig.mcpServers ?? {})), new Set(["cuebook"])),
    "MCP_SERVER_SET",
    ".mcp.json.mcpServers",
    "Cuebook ships only its own MCP server; optional TradingView connectors belong to creator-owned host configuration.",
  );
  check(deepEqualPy(configured.url, (capabilityMap.server ?? {}).url), "MCP_URL", ".mcp.json", "MCP config and capability map URLs differ.");
  check(deepEqualPy(configured.oauth_resource, configured.url), "MCP_OAUTH_RESOURCE", ".mcp.json", "Cuebook OAuth resource must match its MCP URL.");
  check(plannedTools.has("publish_release") && !tools.has("publish_release"), "PUBLISH_PHASE", "mcp-capability-map-v1.json", "Future non-Frame publishing must remain planned and non-callable.");

  return {
    valid: !errors.length,
    errors,
    stats: {
      skill_count: skillDirs.size,
      public_skill_count: publicSkillDocs.length,
      discovery_reduction_percent: norm(
        (publicReleaseManifest.discovery_budget ?? {}).reduction_percent,
      ),
      frame_fast_preview_bytes: norm(
        (publicReleaseManifest.frame_fast_preview_budget ?? {}).cumulative_bytes,
      ),
      frame_publish_input_bytes: norm(
        (publicReleaseManifest.frame_publish_input_budget ?? {}).cumulative_bytes,
      ),
      catalog_version: norm(catalogVersion),
      module_skill_counts: Object.fromEntries(
        [...moduleSkillSets.keys()].sort().map((key) => [key, moduleSkillSets.get(key).size]),
      ),
      query_type_count: (queryMenu.queries ?? []).length,
      creation_step_count: (creationMenu.steps ?? []).length,
      available_mcp_tools: [...availableTools].filter(Boolean).sort(),
      required_mcp_tools: [...requiredTools].filter(Boolean).sort(),
      planned_mcp_tools: [...plannedTools].filter(Boolean).sort(),
      platform_guide_count: platformGuideFiles.size,
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
