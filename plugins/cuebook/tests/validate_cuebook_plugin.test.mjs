import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHANNEL_BOUND_PLATFORM_GUIDES,
  collectDistributionIssues,
  configureDistributionChannel,
} from "../scripts/configure_distribution_channel.mjs";
import { buildRuntimeBundle } from "../scripts/build_runtime_bundle.mjs";
import { validate } from "../scripts/validate_cuebook_plugin.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");
const RUNTIME_ROOT = path.join(REPOSITORY_ROOT, "plugins", "runtime", "cuebook");
const HERMES_PLUGIN_ROOT = path.join(REPOSITORY_ROOT, "plugins", "hermes");

function runtimeRootFor(sourceRoot) {
  return path.resolve(sourceRoot, "..", "runtime", "cuebook");
}

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function withTmpPath(fn) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-plugin-test-"));
  try {
    return fn(tmpPath);
  } finally {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

function copiedPlugin(tmpPath) {
  const target = path.join(tmpPath, "plugins", "cuebook");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true });
  fs.mkdirSync(path.dirname(runtimeRootFor(target)), { recursive: true });
  fs.cpSync(RUNTIME_ROOT, runtimeRootFor(target), { recursive: true });
  fs.cpSync(HERMES_PLUGIN_ROOT, path.join(tmpPath, "plugins", "hermes"), { recursive: true });
  return target;
}

function rewrite(filePath, mutate) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  mutate(payload);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
}

test("valid plugin package", () => {
  const result = validate(PLUGIN_ROOT);
  assert.ok(result.valid, JSON.stringify(result));
  assert.deepEqual(result.stats.module_skill_counts, { create: 27, query: 11 });
  assert.equal(result.stats.standalone_entrypoint_count, 1);
  assert.equal(result.stats.public_skill_count, 3);
  assert.ok(result.stats.discovery_reduction_percent >= 60);
  assert.ok(result.stats.frame_fast_preview_bytes < 112_000);
  assert.ok(result.stats.frame_publish_input_bytes < 40_000);
  assert.equal(result.stats.platform_guide_count, 10);
  const modules = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "cuebook-modules-v1.json"), "utf-8"),
  );
  assert.ok(modules.routing_rules.query_deliverables.includes("factual_chart"));
  assert.ok(modules.routing_rules.create_deliverables.includes("creator_viewpoint_graphic"));
  assert.equal(
    modules.routing_rules.community_skill_submission_intents_route_to,
    "author-cuebook-skill",
  );
  assert.deepEqual(modules.standalone_entrypoints, ["author-cuebook-skill"]);
  assert.ok(!modules.modules.find((item) => item.module_id === "create").skill_refs.includes("author-cuebook-skill"));
});

test("community package submission remains structurally separate from Create", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.modules.find((item) => item.module_id === "create").skill_refs.push("author-cuebook-skill");
    });
    assert.ok(codes(validate(root)).has("STANDALONE_MODULE_OVERLAP"));
  });

  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.routing_rules.community_skill_submission_intents_route_to = "create";
    });
    assert.ok(codes(validate(root)).has("COMMUNITY_SUBMISSION_ROUTE"));
  });

  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.available_tools
        .find((item) => item.tool === "search_news")
        .used_by.push("author-cuebook-skill");
    });
    assert.ok(codes(validate(root)).has("TOOL_MODULE_EDGE"));
  });
});

test("Claude Code marketplace explicitly exposes only the three self-contained Skills", () => {
  const repositoryRoot = REPOSITORY_ROOT;
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, ".claude-plugin", "marketplace.json"), "utf-8"),
  );
  assert.equal(marketplace.name, "cuebook");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "cuebook");
  assert.equal(marketplace.plugins[0].source, "./plugins/runtime/cuebook");
  assert.equal(marketplace.plugins[0].strict, true);
  assert.ok(
    fs.existsSync(path.join(repositoryRoot, marketplace.plugins[0].source, ".claude-plugin", "plugin.json")),
  );
  assert.ok(
    fs.existsSync(path.join(repositoryRoot, marketplace.plugins[0].source, ".mcp.json")),
  );
  assert.equal(marketplace.plugins[0].skills, undefined);
  assert.equal(marketplace.plugins[0].mcpServers, undefined);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(RUNTIME_ROOT, ".claude-plugin", "plugin.json"), "utf-8"),
  );
  const expectedVersion = JSON.parse(
    fs.readFileSync(path.resolve(PLUGIN_ROOT, "..", "..", "package.json"), "utf-8"),
  ).version;
  assert.equal(marketplace.plugins[0].version, expectedVersion);
  assert.equal(manifest.name, "cuebook");
  assert.equal(manifest.version.split("+")[0], expectedVersion);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
});

test("runtime compatibility metadata is versioned once and vendored into every public Skill", () => {
  const runtime = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "runtime-compatibility-v1.json"), "utf8"),
  );
  const index = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "plugin-index-v1.json"), "utf8"),
  );
  const release = JSON.parse(
    fs.readFileSync(path.join(RUNTIME_ROOT, "skills", "release-manifest.json"), "utf8"),
  );
  assert.equal(runtime.plugin_version, index.plugin_version);
  assert.equal(runtime.catalog_version, index.catalog_version);
  assert.equal(runtime.updates.actor, "host");
  assert.equal(runtime.updates.agent_exposure, "metadata_only");
  assert.equal(runtime.hosts.openclaw.bundle_http_mcp_runtime, "host_override_required");
  for (const bundle of release.bundles) {
    assert.match(bundle.content_sha256, /^[0-9a-f]{64}$/u);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(
            RUNTIME_ROOT,
            "skills",
            bundle.skill,
            "assets",
            "plugin",
            "runtime-compatibility-v1.json",
          ),
          "utf8",
        ),
      ),
      runtime,
    );
  }
});

test("Hermes well-known index is complete and schema-bound", () => {
  const index = JSON.parse(
    fs.readFileSync(path.join(RUNTIME_ROOT, "skills", "index.json"), "utf8"),
  );
  const pluginIndex = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "plugin-index-v1.json"), "utf8"),
  );
  assert.equal(
    pluginIndex.hermes_skills_index_schema_ref,
    "./hermes-skills-index-v1.schema.json",
  );
  assert.deepEqual(
    index.skills.map((skill) => skill.name),
    pluginIndex.public_entrypoints,
  );
  for (const skill of index.skills) {
    assert.ok(skill.files.includes("SKILL.md"), skill.name);
    assert.match(skill.content_sha256, /^[0-9a-f]{64}$/u, skill.name);
  }

  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const indexPath = path.join(runtimeRootFor(root), "skills", "index.json");
    rewrite(indexPath, (payload) => {
      payload.skills[0].files.pop();
    });
    assert.ok(codes(validate(root)).has("HERMES_INDEX_FILE_SET"));
  });
});

test("platform guides are English, channel-pinned, and explicit about live evidence", () => {
  const platformsRoot = path.join(PLUGIN_ROOT, "platforms");
  const install = fs.readFileSync(path.join(PLUGIN_ROOT, "INSTALL.md"), "utf-8");
  const distribution = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "distribution-channel-v1.json"), "utf8"),
  );
  const selectedEndpoint = distribution.mcp_url;
  const otherEndpoint = selectedEndpoint === "https://cuebook.app/mcp"
    ? "https://cuebook.xyz/mcp"
    : "https://cuebook.app/mcp";
  const guideNames = fs.readdirSync(platformsRoot)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  assert.equal(guideNames.length, 10);
  const index = fs.readFileSync(path.join(platformsRoot, "README.md"), "utf-8");
  assert.match(index, /stable main \/ production: https:\/\/cuebook\.app\/mcp/u);
  assert.match(index, /dev \/ development:\s+https:\/\/cuebook\.xyz\/mcp/u);
  assert.match(index, /\(\.\.\/INSTALL\.md\)/u);
  assert.doesNotMatch(index, /[\u3400-\u9fff]/u);
  assert.match(install, /\(distribution-channel-v1\.json\)/u);
  assert.match(install, /\(platforms\/README\.md\)/u);
  assert.match(install, /login is pending/u);
  assert.match(install, /approval belongs to the user/u);
  assert.match(install, /one smallest useful read/u);
  assert.doesNotMatch(install, /[\u3400-\u9fff]/u);
  for (const guideName of guideNames) {
    const guide = fs.readFileSync(path.join(platformsRoot, guideName), "utf-8");
    if (CHANNEL_BOUND_PLATFORM_GUIDES.includes(guideName)) {
      assert.ok(guide.includes(selectedEndpoint), guideName);
      assert.ok(!guide.includes(otherEndpoint), guideName);
    } else {
      assert.match(guide, /https:\/\/cuebook\.app\/mcp/u, guideName);
      assert.match(guide, /https:\/\/cuebook\.xyz\/mcp/u, guideName);
    }
    assert.match(guide, /\*\*Live status:\*\*/u, guideName);
    assert.match(guide, /live verification gate/u, guideName);
    assert.match(guide, /\(\.\.\/INSTALL\.md#live-verification-gate\)/u, guideName);
    assert.doesNotMatch(guide, /[\u3400-\u9fff]/u, guideName);
    assert.ok(index.includes(`(${guideName})`), guideName);
    assert.ok(install.includes(`(platforms/${guideName})`), guideName);
  }
});

test("plugin and repository readmes route AI-led installation to the canonical entrypoint", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const repositoryReadme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8");
  const chineseReadme = fs.readFileSync(
    path.join(repositoryRoot, "README.zh-CN.md"),
    "utf-8",
  );
  const pluginReadme = fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf-8");

  assert.match(repositoryReadme, /\(plugins\/cuebook\/INSTALL\.md\)/u);
  assert.match(chineseReadme, /\(plugins\/cuebook\/INSTALL\.md\)/u);
  assert.match(pluginReadme, /\(INSTALL\.md\)/u);
});

test("repository header links every named host badge to its platform guide", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8");
  const badges = new Map([
    ["Codex", "codex.md"],
    ["Claude Code", "claude-code.md"],
    ["Cursor", "cursor.md"],
    ["Hermes", "hermes.md"],
    ["OpenClaw", "openclaw.md"],
    ["Claude", "claude-desktop.md"],
    ["ChatGPT", "chatgpt.md"],
    ["Grok", "grok.md"],
  ]);
  for (const [label, guide] of badges) {
    assert.ok(
      readme.includes(
        `<a href="plugins/cuebook/platforms/${guide}"><img alt="${label}"`,
      ),
      label,
    );
  }
});

test("platform validation rejects a missing host guide", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    fs.rmSync(path.join(root, "platforms", "grok.md"));
    assert.ok(codes(validate(root)).has("PLATFORM_DOC_SET"));
  });
});

test("platform validation rejects a missing canonical installation entrypoint", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    fs.rmSync(path.join(root, "INSTALL.md"));
    assert.ok(codes(validate(root)).has("INSTALL_ENTRYPOINT"));
  });
});

test("platform validation rejects a host guide that bypasses the canonical gate", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "platforms", "grok.md");
    fs.writeFileSync(
      filePath,
      fs.readFileSync(filePath, "utf-8")
        .replace("../INSTALL.md#live-verification-gate", "README.md#live-verification-gate"),
    );
    assert.ok(codes(validate(root)).has("PLATFORM_VERIFICATION_GATE"));
  });
});

test("platform validation rejects endpoint drift", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const distribution = JSON.parse(
      fs.readFileSync(path.join(root, "distribution-channel-v1.json"), "utf8"),
    );
    const filePath = path.join(root, "platforms", "cursor.md");
    fs.writeFileSync(
      filePath,
      fs.readFileSync(filePath, "utf-8").replaceAll(distribution.mcp_url, "https://example.com/mcp"),
    );
    assert.ok(codes(validate(root)).has("PLATFORM_MCP_ENDPOINT"));
  });

  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const distribution = JSON.parse(
      fs.readFileSync(path.join(root, "distribution-channel-v1.json"), "utf8"),
    );
    const filePath = path.join(root, "platforms", "hermes.md");
    fs.writeFileSync(
      filePath,
      fs.readFileSync(filePath, "utf-8").replaceAll(
        distribution.skills_base_url,
        "https://example.com/.well-known/skills",
      ),
    );
    assert.ok(
      collectDistributionIssues(tmpPath).some((issue) => issue.file.endsWith("platforms/hermes.md")),
    );
  });
});

test("distribution channels generate one internally consistent OAuth resource", () => {
  withTmpPath((tmpPath) => {
    const pluginRoot = path.join(tmpPath, "plugins", "cuebook");
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    fs.cpSync(PLUGIN_ROOT, pluginRoot, { recursive: true });
    fs.cpSync(HERMES_PLUGIN_ROOT, path.join(tmpPath, "plugins", "hermes"), { recursive: true });

    const development = configureDistributionChannel(tmpPath, "development");
    buildRuntimeBundle(pluginRoot, runtimeRootFor(pluginRoot));
    assert.equal(development.channel, "development");
    assert.deepEqual(collectDistributionIssues(tmpPath, "development"), []);
    assert.ok(validate(pluginRoot).valid);
    const devMcp = JSON.parse(
      fs.readFileSync(path.join(runtimeRootFor(pluginRoot), ".mcp.json"), "utf8"),
    );
    assert.equal(devMcp.mcpServers.cuebook.url, "https://cuebook.xyz/mcp");
    assert.equal(devMcp.mcpServers.cuebook.oauth_resource, "https://cuebook.xyz/mcp");
    for (const guideName of CHANNEL_BOUND_PLATFORM_GUIDES) {
      const guide = fs.readFileSync(path.join(pluginRoot, "platforms", guideName), "utf8");
      assert.match(guide, /https:\/\/cuebook\.xyz\/mcp/u, guideName);
      assert.doesNotMatch(guide, /https:\/\/cuebook\.app\/mcp/u, guideName);
    }
    assert.match(
      fs.readFileSync(path.join(pluginRoot, "platforms", "hermes.md"), "utf8"),
      /https:\/\/cuebook\.xyz\/\.well-known\/skills\/query-cuebook/u,
    );
    assert.match(
      fs.readFileSync(
        path.join(tmpPath, "plugins", "hermes", "cuebook-auth", "__init__.py"),
        "utf8",
      ),
      /_OFFICIAL_MCP_URL = "https:\/\/cuebook\.xyz\/mcp"/u,
    );
    const schemaPath = path.join(pluginRoot, "assets", "creation-menu-v1.schema.json");
    assert.equal(JSON.parse(fs.readFileSync(schemaPath, "utf8")).$id, "https://cuebook.xyz/schemas/creation-menu-v1.schema.json");

    const production = configureDistributionChannel(tmpPath, "production");
    buildRuntimeBundle(pluginRoot, runtimeRootFor(pluginRoot));
    assert.equal(production.channel, "production");
    assert.deepEqual(collectDistributionIssues(tmpPath, "production"), []);
    assert.ok(validate(pluginRoot).valid);
    const prodMcp = JSON.parse(
      fs.readFileSync(path.join(runtimeRootFor(pluginRoot), ".mcp.json"), "utf8"),
    );
    assert.equal(prodMcp.mcpServers.cuebook.url, "https://cuebook.app/mcp");
    assert.equal(prodMcp.mcpServers.cuebook.oauth_resource, "https://cuebook.app/mcp");
    for (const guideName of CHANNEL_BOUND_PLATFORM_GUIDES) {
      const guide = fs.readFileSync(path.join(pluginRoot, "platforms", guideName), "utf8");
      assert.match(guide, /https:\/\/cuebook\.app\/mcp/u, guideName);
      assert.doesNotMatch(guide, /https:\/\/cuebook\.xyz\/mcp/u, guideName);
    }
    assert.match(
      fs.readFileSync(path.join(pluginRoot, "platforms", "hermes.md"), "utf8"),
      /https:\/\/cuebook\.app\/\.well-known\/skills\/query-cuebook/u,
    );
    assert.match(
      fs.readFileSync(
        path.join(tmpPath, "plugins", "hermes", "cuebook-auth", "__init__.py"),
        "utf8",
      ),
      /_OFFICIAL_MCP_URL = "https:\/\/cuebook\.app\/mcp"/u,
    );
    assert.equal(JSON.parse(fs.readFileSync(schemaPath, "utf8")).$id, "https://cuebook.app/schemas/creation-menu-v1.schema.json");
  });
});

test("platform guides describe all three public Agent Skills", () => {
  const platformsRoot = path.join(PLUGIN_ROOT, "platforms");
  for (const guideName of fs.readdirSync(platformsRoot).filter((name) => name.endsWith(".md"))) {
    const guide = fs.readFileSync(path.join(platformsRoot, guideName), "utf8");
    assert.doesNotMatch(guide, /\bTwo (?:self-contained )?(?:Cuebook )?Agent Skills\b/u, guideName);
    assert.doesNotMatch(guide, /\bthe two (?:JavaScript-backed )?Cuebook Agent Skills\b/u, guideName);
  }
});

test("distribution validation rejects channel and connector drift", () => {
  withTmpPath((tmpPath) => {
    const pluginRoot = path.join(tmpPath, "plugins", "cuebook");
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    fs.cpSync(PLUGIN_ROOT, pluginRoot, { recursive: true });
    fs.cpSync(HERMES_PLUGIN_ROOT, path.join(tmpPath, "plugins", "hermes"), { recursive: true });
    fs.mkdirSync(path.dirname(runtimeRootFor(pluginRoot)), { recursive: true });
    fs.cpSync(RUNTIME_ROOT, runtimeRootFor(pluginRoot), { recursive: true });
    rewrite(path.join(pluginRoot, "runtime-template", ".mcp.json"), (payload) => {
      payload.mcpServers.cuebook.url = "https://example.com/mcp";
    });
    buildRuntimeBundle(pluginRoot, runtimeRootFor(pluginRoot));
    rewrite(path.join(pluginRoot, "assets", "creation-menu-v1.schema.json"), (payload) => {
      payload.$id = "https://cuebook.xyz/schemas/creation-menu-v1.schema.json";
    });
    assert.ok(collectDistributionIssues(tmpPath, "production").length > 0);
    assert.ok(codes(validate(pluginRoot)).has("DISTRIBUTION_CHANNEL"));
  });

  withTmpPath((tmpPath) => {
    const pluginRoot = path.join(tmpPath, "plugins", "cuebook");
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    fs.cpSync(PLUGIN_ROOT, pluginRoot, { recursive: true });
    fs.cpSync(HERMES_PLUGIN_ROOT, path.join(tmpPath, "plugins", "hermes"), { recursive: true });
    configureDistributionChannel(tmpPath, "production");
    const bridgePath = path.join(tmpPath, "plugins", "hermes", "cuebook-auth", "__init__.py");
    fs.writeFileSync(
      bridgePath,
      fs.readFileSync(bridgePath, "utf8")
        .replace("https://cuebook.app/mcp", "https://cuebook.xyz/mcp"),
    );
    assert.ok(
      collectDistributionIssues(tmpPath, "production")
        .some((issue) => issue.file === "plugins/hermes/cuebook-auth/__init__.py"),
    );
  });
});

test("Claude Code plugin cannot expose the internal Skill tree", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(
      runtimeRootFor(root),
      ".claude-plugin",
      "plugin.json",
    );
    rewrite(filePath, (payload) => {
      payload.skills = "./internal-skills/";
    });
    assert.ok(codes(validate(root)).has("CLAUDE_PLUGIN_PUBLIC_SKILL_ROOT"));
  });
});

test("frontmatter descriptions with YAML mapping punctuation are quoted", () => {
  const skillsRoot = path.join(PLUGIN_ROOT, "skills");
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    const line = text.split("\n").find((candidate) => candidate.startsWith("description: "));
    assert.ok(line, skillPath);
    const value = line.slice("description: ".length);
    if (!value.includes(": ")) continue;
    assert.ok(
      (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")),
      skillPath,
    );
  }
});

test("public entrypoints distinguish authentication, discovery, and transport failures", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  for (const [name, text] of [["create", create], ["query", query]]) {
    assert.ok(text.indexOf("## Quiet Readiness Check") >= 0, name);
    assert.match(text, /normal MCP result is the only runtime readiness proof/u, name);
    assert.match(text, /Only an explicit host authentication signal/u, name);
    assert.match(text, /not_logged_in/u, name);
    assert.match(text, /do not infer an account problem/u, name);
    assert.match(text, /do not infer authentication/u, name);
    assert.match(text, /transport-send, DNS, TLS, proxy, socket, or timeout/u, name);
    assert.match(text, /reinstalling or logging in again is unnecessary/u, name);
    assert.match(text, /Any normal Cuebook result already returned in the task is decisive evidence/u, name);
    assert.match(text, /Do not run a CLI login from this Skill/u, name);
    assert.match(text, /Never mention the README, missing actions, Tool names/u, name);
    assert.match(text, /at most two short sentences/u, name);
    assert.doesNotMatch(text, /returns a token, reconnect, or transport failure/u, name);
    assert.doesNotMatch(text, /## Connection Gate/u, name);
    assert.doesNotMatch(text, /host pauses for OAuth/u, name);
    assert.doesNotMatch(text, /normal connector continuation/u, name);
    assert.doesNotMatch(text, /host OAuth initiation per user action/u, name);
  }
  assert.ok(create.indexOf("## Quiet Readiness Check") < create.indexOf("## Fast Preview"));
  assert.match(create, /silently call `get_frame_capabilities` once/u);
  assert.ok(query.indexOf("## Quiet Readiness Check") < query.indexOf("## Routing"));
  assert.match(query, /Silently run the smallest required Cuebook read/u);
  assert.doesNotMatch(create, /## Meaning Lock|## Selection Freeze/u);
});

test("connected creator identity stays server-bound across Frame and community publication", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const author = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "author-cuebook-skill", "SKILL.md"),
    "utf-8",
  );
  const authorSchema = fs.readFileSync(
    path.join(
      PLUGIN_ROOT,
      "skills",
      "author-cuebook-skill",
      "references",
      "community-skill-submission-v1.schema.json",
    ),
    "utf-8",
  );

  assert.match(create, /`get_frame_capabilities` intentionally has no identity fields/u);
  assert.match(create, /Any normal result, including in a new task, uses the OAuth-bound server user/u);
  assert.match(create, /never ask for or accept an account name, `@handle`, or identity confirmation/u);
  assert.match(create, /Never apply community SKILL\.md package-submission rules to ordinary content/u);
  assert.match(author, /explicit creator-authored package submission with a root `SKILL\.md`/u);
  assert.match(author, /Submission identity follows the current Cuebook OAuth grant/u);
  assert.match(author, /Never ask the creator for an account name, `@handle`, or account confirmation/u);
  assert.match(author, /Never add a handle to the local submission record or tool input/u);
  assert.doesNotMatch(authorSchema, /creator_handle/u);
});

test("Codex install docs authenticate once before the first Cuebook task", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"), "utf-8"),
  );
  const docs = [
    fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "platforms", "codex.md"), "utf-8"),
  ];
  for (const text of docs) {
    assert.match(text, /background test task/u);
    assert.match(text, /codex mcp list --json/u);
    assert.match(text, /codex mcp login cuebook/u);
    assert.match(text, /not_logged_in/u);
    assert.match(text, /browser approval/iu);
    assert.match(text, /approval belongs to the user/iu);
    assert.match(text, /login is pending|login while that attempt is pending/iu);
    assert.match(text, /does not\s+guarantee.*browser/isu);
    assert.match(text, /normal MCP result/u);
    assert.match(text, /Tool discovery alone/u);
    assert.match(text, /read-only/u);
    assert.doesNotMatch(text, /first Cuebook (?:request|call) may open a browser/iu);
    assert.doesNotMatch(text, /normal connector continuation/u);
  }
  assert.match(docs[0], /After installation and authentication are complete, fully restart the host before testing/u);
  assert.match(docs[2], /Authentication belongs to installation/u);
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
});

test("Codex update docs distinguish Git marketplaces from local checkouts", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const docs = [
    fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "platforms", "codex.md"), "utf-8"),
  ];
  for (const text of docs) {
    assert.match(text, /Git-backed marketplace/u);
    assert.match(text, /local checkout/u);
    assert.match(text, /skip .*marketplace upgrade/isu);
    assert.match(text, /codex plugin add cuebook@cuebook/u);
    assert.match(text, /codex mcp list --json/u);
  }
});

test("plugin discovery points only at the three generated public Skills", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(RUNTIME_ROOT, ".codex-plugin", "plugin.json"), "utf-8"),
  );
  assert.equal(manifest.skills, "./skills/");
  const publicRoot = path.join(RUNTIME_ROOT, "skills");
  const skillDocs = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === "SKILL.md") skillDocs.push(path.relative(publicRoot, target));
    }
  };
  walk(publicRoot);
  assert.deepEqual(skillDocs.sort(), [
    "author-cuebook-skill/SKILL.md",
    "create-cuebook-content/SKILL.md",
    "query-cuebook/SKILL.md",
  ]);
});

test("active, planned, and superseded tool surfaces stay separate", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const active = new Set([...payload.available_tools, ...payload.required_tools].map((item) => item.tool));
  assert.equal(payload.required_tools.length, 18);
  assert.deepEqual(new Set(payload.planned_tools.map((item) => item.tool)), new Set([
    "get_creator_feed",
    "compute_market_metrics",
    "publish_release",
    "get_publication_receipt",
  ]));
  for (const tool of payload.planned_tools) assert.ok(!active.has(tool.tool));
  for (const tool of ["resolve_settlement_binding", "save_creator_artifact", "register_settlement_claim"]) {
    assert.ok(!active.has(tool));
    assert.ok(!payload.planned_tools.some((item) => item.tool === tool));
  }
});

test("creator fast policy keeps graph deep and Web fallback bounded", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const policy = payload.skill_tool_policy;
  assert.ok(!policy.creator_fast_allowlist.includes("get_reasoning_graph"));
  assert.ok(policy.deep_only.includes("get_reasoning_graph"));
  assert.ok(policy.creator_fast_allowlist.includes("list_asset_cues"));
  assert.ok(policy.creator_fast_allowlist.includes("get_cues"));
  assert.deepEqual(policy.web_fallback, {
    trigger: "material_gap_after_cuebook_batch",
    max_batches: 1,
    max_queries: 3,
    max_sources: 3,
    source_preference: "primary_or_authoritative",
    required_lineage_fields: ["retrieved_via", "retrieved_at", "locator"],
    unsupported_claim_policy: "creator_hypothesis_or_omit",
  });
});

test("creator guidance uses Cues as optional thought anchors rather than proof", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  const intake = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "intake-cuebook-viewpoint", "SKILL.md"),
    "utf-8",
  );
  const combined = `${create}\n${query}\n${intake}`;
  assert.match(create, /## Conversation Heuristics/u);
  assert.match(create, /## Optional New Angle/u);
  assert.match(combined, /one `aligned` Cue/iu);
  assert.match(combined, /contrasting.*adjacent/iu);
  assert.match(combined, /not proof/iu);
  assert.match(combined, /creator-owned hypothesis/iu);
  assert.match(create, /Only adopted additions enter the frozen draft/iu);
  assert.match(create, /The default interview budget is one thought-anchor question/iu);
  assert.match(create, /A second and final question is allowed only when/iu);
  assert.match(create, /never turn the follow-up into another research round/iu);
  assert.match(combined, /never treats another published view as proof, consensus, or creator adoption/iu);
});

test("creator voice polish is local, silent, and meaning preserving", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  assert.match(create, /## Creator Voice Polish/u);
  assert.match(create, /same drafting pass/u);
  assert.match(create, /default the body to first person/u);
  assert.match(create, /one or two natural ownership markers/u);
  assert.match(create, /never invents a position, trade, expertise, access, lived experience/u);
  assert.match(create, /never expose bracketed evidence labels/iu);
  assert.match(create, /not visible taxonomy/iu);
  assert.match(create, /Keep sourced fact, creator inference, and another creator's Cue distinct/u);
  assert.match(create, /If polish changes meaning or attribution, restore the intended meaning/u);
  assert.doesNotMatch(create, /Humanizer|second rewrite pass|draft audit final/iu);
});

test("terminal range requires creator-accepted time and symmetric band", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const settlement = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-settlement-authoring.md"),
    "utf-8",
  );
  const intake = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "intake-cuebook-viewpoint", "SKILL.md"),
    "utf-8",
  );
  assert.match(create, /Frame Settlement Authoring/u);
  assert.match(settlement, /`range` is distinct from neutral/iu);
  assert.match(settlement, /Require an explicit `±X%`/u);
  assert.match(settlement, /never supply 3%, 5%, or\s+another preset/iu);
  assert.match(settlement, /absolute terminal return is less than or equal/iu);
  assert.match(intake, /whole-window barrier/iu);
  assert.match(intake, /range.*exact symmetric band/iu);
});

test("relative view keeps natural language outside and a frozen long-short spread inside", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const settlement = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-settlement-authoring.md"),
    "utf-8",
  );
  const intake = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "intake-cuebook-viewpoint", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  assert.match(intake, /A's return should beat B's by the deadline/u);
  assert.match(create, /“A beats B” is relative/u);
  assert.match(settlement, /equal-notional long A \/ short B/iu);
  assert.match(settlement, /Both may rise or fall/u);
  assert.match(create, /two distinct same-session-family assets/u);
  assert.match(publish, /pair_asset_ref/u);
  assert.match(publish, /spread_threshold_bps\?/u);
  assert.match(publish, /outperform\|underperform/u);
});

test("public entrypoints route silently and ask once with an editable primary label", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  const author = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "author-cuebook-skill", "SKILL.md"),
    "utf-8",
  );
  const architecture = fs.readFileSync(path.join(PLUGIN_ROOT, "ARCHITECTURE.md"), "utf-8");

  assert.match(create, /complete Frame: exact title, body, one editable\s+localized primary analysis label when supported, actual image or poster/iu);
  assert.match(create, /Do not present a form or add a separate tag or pre-render confirmation/iu);
  assert.match(create, /primary is the most distinctive supported lens/iu);
  assert.match(create, /A clear yes, “publish,” or equivalent reply both selects the displayed\s+copy-to-image pair and authorizes publication/iu);
  assert.match(publish, /A label-only change never causes research, rewriting, rendering, media\s+staging, or a separate confirmation/iu);
  assert.match(publish, /both names the replacement and explicitly says to publish/iu);
  assert.doesNotMatch(create, /## Confirm The Expression Before Rendering/u);
  assert.match(author, /without announcing an entrypoint, branch, workflow, stage/iu);
  assert.match(author, /one cohesive review, then ask one direct\s+question/iu);
  assert.match(author, /Do not ask again or narrate reservation, upload, and\s+completion steps/iu);
  assert.match(architecture, /implementation boundary, not a conversational menu/iu);
  assert.match(architecture, /internal branches silently/iu);
});

test("Frame publication chooses one natural closing action", () => {
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  const memory = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "memory-proposal-discipline.md"),
    "utf-8",
  );
  assert.match(publish, /Choose exactly one natural end action/iu);
  assert.match(publish, /propose that\s+single candidate and offer nothing else/iu);
  assert.match(memory, /one natural closing action/iu);
  assert.match(memory, /do not also offer\s+sharing, Paper Trade, another signal/iu);
});

test("published Frame projection states all-legs conjunction without a website detour", () => {
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  assert.match(query, /derive one plain settlement sentence from the frozen formula/iu);
  assert.match(query, /`all_legs` joins every leg with explicit AND/iu);
  assert.match(query, /every condition must hold/iu);
  assert.doesNotMatch(query, /canonical URL/iu);
});

test("query cannot invoke create", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.modules[0].may_invoke = ["create"];
    });
    assert.ok(codes(validate(root)).has("QUERY_DEPENDENCY"));
  });
});

test("query menu rejects write tool", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "query-menu-v1.json");
    rewrite(filePath, (payload) => {
      payload.queries[0].mcp_tools.push("publish_frame");
    });
    assert.ok(codes(validate(root)).has("QUERY_WRITE_TOOL"));
  });
});

test("search_news and paper preview scopes match the backend", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const active = new Map([...payload.available_tools, ...payload.required_tools].map((item) => [item.tool, item]));
  assert.equal(active.get("search_news").authorization_scope, "read:public");
  assert.equal(active.get("preview_paper_order").authorization_scope, "cuebook.paper.trade");
});

test("skills cannot belong to both modules", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.modules[0].skill_refs.push("create-cuebook-content");
    });
    assert.ok(codes(validate(root)).has("MODULE_SKILL_OVERLAP"));
  });
});

test("query skill cannot invoke create skill", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "query-cuebook", "SKILL.md");
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf-8") + "\nInvoke $create-cuebook-content.\n");
    assert.ok(codes(validate(root)).has("QUERY_SKILL_EDGE"));
  });
});

test("public Cuebook entrypoints keep external Skill routing backstage", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "query-cuebook", "SKILL.md");
    const source = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, source.replace("Keep routing backstage", "Explain the routing"));
    assert.ok(codes(validate(root)).has("CUEBOOK_CONTEXT_BOUNDARY"));
  });
});

test("asset resolution cannot turn fuzzy candidates into exact tickers or catalog absence", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "query-cuebook", "SKILL.md");
    const source = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, source.replace("ranked candidates, not an existence verdict", "resolved assets"));
    assert.ok(codes(validate(root)).has("ASSET_EXACT_MATCH_BOUNDARY"));
  });
});

test("asset resolution keeps capability gaps separate and forbids implicit proxies", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "create-cuebook-content", "SKILL.md");
    const source = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, source.replace("a proxy is a different idea", "a proxy is close enough"));
    assert.ok(codes(validate(root)).has("ASSET_EXACT_MATCH_BOUNDARY"));
  });
});

test("TradingView stays optional behind the two public Cuebook entrypoints", () => {
  const mcp = JSON.parse(fs.readFileSync(path.join(RUNTIME_ROOT, ".mcp.json"), "utf-8"));
  assert.deepEqual(Object.keys(mcp.mcpServers), ["cuebook"]);
  const desktop = JSON.parse(fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "references", "tradingview-tool-policy-v1.json"),
    "utf-8",
  ));
  const research = JSON.parse(fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "references", "tradingview-research-policy-v1.json"),
    "utf-8",
  ));
  assert.equal(Object.values(desktop.classes).flat().length, 84);
  assert.equal(new Set(Object.values(desktop.classes).flat()).size, 84);
  assert.equal(Object.values(research.classes).flat().length, 37);
  assert.equal(new Set(Object.values(research.classes).flat()).size, 37);
  assert.equal(desktop.frame_policy.official_attributed_snapshot_finished_bitmap_allowed, true);
  assert.equal(desktop.frame_policy.raw_capture_requires_focus_contract, true);
  assert.equal(desktop.frame_policy.minimum_attribution_effective_px, 13);
  for (const relative of [
    ["query-cuebook", "references", "tradingview-workbench.md"],
    ["query-cuebook", "scripts", "validate_tradingview_observation.mjs"],
    ["query-cuebook", "references", "tradingview-focused-capture.md"],
    ["query-cuebook", "scripts", "validate_tradingview_focused_capture.mjs"],
    ["create-cuebook-content", "references", "tradingview-canvas-transfer.md"],
    ["create-cuebook-content", "scripts", "validate_tradingview_canvas_transfer.mjs"],
  ]) {
    assert.ok(fs.existsSync(path.join(RUNTIME_ROOT, "skills", ...relative)), relative.join("/"));
  }
});

test("TradingView canvas policy cannot reintroduce clear-all or Frame pixels", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "create-cuebook-content", "references", "tradingview-canvas-tool-policy-v1.json");
    rewrite(filePath, (payload) => {
      payload.lifecycle.clear_all_allowed = true;
      payload.lifecycle.direct_frame_pixel_reuse_allowed = true;
    });
    assert.ok(codes(validate(root)).has("TRADINGVIEW_CANVAS_POLICY"));
  });
});

test("Cuebook package cannot silently install an optional TradingView server", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(runtimeRootFor(root), ".mcp.json");
    rewrite(filePath, (payload) => {
      payload.mcpServers.tradingview_desktop = { command: "node", args: ["/tmp/server.js"] };
    });
    assert.ok(codes(validate(root)).has("MCP_SERVER_SET"));
  });
});

test("TradingView observations cannot become direct Frame inputs", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "query-cuebook", "SKILL.md");
    const source = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, source.replace("restricted and never a direct Frame input", "ready for direct Frame upload"));
    assert.ok(codes(validate(root)).has("TRADINGVIEW_SKILL_BOUNDARY"));
  });
});

test("TradingView focused snapshot policy cannot lose density or attribution gates", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const policyPath = path.join(root, "skills", "query-cuebook", "references", "tradingview-tool-policy-v1.json");
    rewrite(policyPath, (payload) => {
      payload.frame_policy.raw_capture_requires_focus_contract = false;
      payload.frame_policy.minimum_attribution_effective_px = 1;
    });
    assert.ok(codes(validate(root)).has("TRADINGVIEW_DESKTOP_POLICY"));

    const createPath = path.join(root, "skills", "create-cuebook-content", "SKILL.md");
    fs.writeFileSync(createPath, fs.readFileSync(createPath, "utf-8").replace("## Attributed TradingView Snapshot", "## Snapshot"));
    assert.ok(codes(validate(root)).has("TRADINGVIEW_SKILL_BOUNDARY"));
  });
});

test("declared TradingView Frame route keeps its executable runner", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    fs.rmSync(path.join(root, "skills", "create-cuebook-content", "scripts", "build_tradingview_attributed_frame.mjs"));
    assert.ok(codes(validate(root)).has("TRADINGVIEW_FRAME_RUNNER"));
  });
});

test("Frame MCP tool set cannot lose a frozen operation", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools = payload.required_tools.filter((item) => item.tool !== "publish_frame");
    });
    assert.ok(codes(validate(root)).has("FRAME_TOOL_SET"));
  });
});

test("Frame MCP contract rejects independent media retrieval", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      const status = payload.required_tools.find((item) => ["get_frame_media", "get_frame_media_status"].includes(item.tool));
      status.tool = "get_frame_media";
    });
    assert.ok(codes(validate(root)).has("FRAME_MEDIA_TOOL"));
  });
});

test("Frame MCP tools retain their least-privilege scopes", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools.find((item) => item.tool === "publish_frame").authorization_scope = "cuebook.frame.write";
    });
    assert.ok(codes(validate(root)).has("FRAME_TOOL_SCOPE"));
  });
});

test("create_frame_draft requires assembly plus registered binding", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools.find((item) => item.tool === "create_frame_draft").input_contract = "FrameDraftV1";
    });
    assert.ok(codes(validate(root)).has("FRAME_DRAFT_INPUT"));
  });
});

test("Frame publication flow cannot become pull-based", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.frame_publication_flow = {
        ...(payload.frame_publication_flow ?? {}),
        image_transport: "download_then_publish",
      };
    });
    assert.ok(codes(validate(root)).has("FRAME_FLOW_CONTRACT"));
  });
});

test("Frame releases are immutable and MCP exposes only initial and correction flows", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const flow = payload.frame_publication_flow;
  assert.deepEqual(flow.initial_publish_sequence, [
    "begin_frame_media_upload",
    "https_put_publication_master",
    "complete_frame_media_upload",
    "complete_frame_publish",
  ]);
  assert.deepEqual(flow.correction_publish_sequence, [
    "prepare_frame_correction_publish",
    "publish_frame_correction",
  ]);
  assert.equal(Object.hasOwn(flow, "withdraw_sequence"), false);
  assert.equal(Object.hasOwn(flow, "action_consent_usage"), false);
  assert.equal(flow.publish_success_source, "successful_complete_frame_publish_result");
  assert.equal(flow.creator_link_policy, "never_present_canonical_url");
  assert.equal(flow.explicit_frame_query_tool, "get_frame");
  assert.equal(flow.automatic_post_publish_readback, false);
  assert.deepEqual(flow.author_controls, {
    mcp_managed: false,
    app_hide_show: true,
    app_delete_window_seconds: 3600,
  });
  assert.ok(!flow.initial_publish_sequence.includes("get_frame"));
  assert.ok(!flow.correction_publish_sequence.includes("get_frame"));
  assert.deepEqual(
    payload.required_tools
      .filter((tool) => tool.phase === "frame_phase_b")
      .map((tool) => tool.tool)
      .sort(),
    [
      "begin_frame_media_upload",
      "complete_frame_media_upload",
      "complete_frame_publish",
      "create_frame_correction_draft",
      "create_frame_draft",
      "get_frame",
      "get_frame_capabilities",
      "get_frame_draft",
      "get_frame_media_status",
      "list_child_frames",
      "preflight_frame_publish",
      "prepare_frame_correction_publish",
      "prepare_frame_publish",
      "publish_child_frame",
      "publish_frame",
      "publish_frame_correction",
      "register_frame_visual_manifest",
      "update_frame_draft",
    ],
  );
});

test("creation menu exposes atomic initial publication without the legacy draft lane", () => {
  const menu = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "creation-menu-v1.json"), "utf-8"),
  );
  assert.deepEqual(
    menu.write_actions.map((action) => action.mcp_tool),
    ["complete_frame_publish"],
  );
  assert.deepEqual(menu.write_actions[0].required_gates, [
    "explicit_user_approval",
    "uploaded_publication_master",
    "idempotency_key",
  ]);
});

test("Frame creator flow never reads back or presents a canonical web link after publish", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  const orchestrator = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "orchestrate-cuebook-creator-workflow", "SKILL.md"),
    "utf-8",
  );
  const combined = `${create}\n${publish}\n${orchestrator}`;
  assert.equal(combined.includes("→ `get_frame` readback"), false);
  assert.equal(combined.includes("verify through `get_frame`"), false);
  assert.equal(combined.includes("On successful readback"), false);
  assert.equal(combined.includes("unless the creator explicitly requests technical diagnostics"), false);
  assert.doesNotMatch(combined, /structurally valid `FramePublicationReceiptV1`/u);
  assert.doesNotMatch(combined, /validate the publish receipt/iu);
  assert.doesNotMatch(combined, /receipt's exact `frame_id \+ release_id`/u);
  assert.match(combined, /successful `complete_frame_publish` result is final success/u);
  assert.match(combined, /do not parse or validate a receipt/iu);
  assert.match(combined, /Do not restate the copy or settlement, ask\s+“confirm publish\?” again/iu);
  assert.match(combined, /do not run reconciliation/iu);
  assert.match(combined, /idea is published.*Cuebook App/isu);
  assert.match(combined, /Never show a web URL/iu);
  assert.equal(combined.includes("say exactly 'Published. Open the Cuebook App.' and stop"), false);
  assert.equal(combined.includes("Return only 'Published. Open the Cuebook App.'"), false);
  assert.match(combined, /creator-specific/iu);
  assert.match(
    combined,
    /Cuebook Agent helped me develop and record this market idea.*your judgment.*Cuebook share entry/isu,
  );
  assert.match(combined, /App owns the just-published Frame binding/iu);
  assert.match(combined, /App, not the Skill or publication flow, owns sharing/iu);
  assert.match(combined, /another AI/iu);
  assert.match(combined, /simulated Paper Trade/iu);
  assert.match(combined, /explicit opt-in/iu);
  assert.match(combined, /preview_paper_order/iu);
  assert.match(combined, /explicit placement intent/iu);
});

test("creator journey feels editorial without exposing a fixed flow", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8");
  assert.match(create, /## Creator Experience/u);
  assert.match(create, /Behave like an attentive editor/iu);
  assert.match(create, /one continuous lift/u);
  assert.match(create, /smallest useful Cuebook memory/u);
  assert.match(create, /normally offer one compact thought-anchor exchange/u);
  assert.match(create, /one short follow-up/u);
  assert.match(create, /Never exceed two interview questions/u);
  assert.match(create, /Do not present a form/u);
  assert.match(create, /connection Cuebook made visible/u);
  assert.match(create, /Never announce a gate, stage, lock, workflow/iu);
  assert.doesNotMatch(create, /\*\*Lock\.\*\*|## Meaning Lock|## Selection Freeze/u);
  assert.match(readme, /The Cuebook Experience/u);
  assert.match(readme, /without taking authorship away/u);
  assert.match(readme, /Internal Tool calls, providers, retries, hashes, and publication mechanics remain backstage/u);
  assert.match(readme, /shows one complete Frame.*actual image or Artifact poster/isu);
  assert.match(readme, /there is no earlier copy-only confirmation/iu);
});

test("creator owns the horizon and Cuebook timing help remains opt-in", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const intake = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "intake-cuebook-viewpoint", "SKILL.md"),
    "utf-8",
  );
  const settlement = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-settlement-authoring.md"),
    "utf-8",
  );
  const schema = JSON.parse(fs.readFileSync(
    path.join(
      PLUGIN_ROOT,
      "skills",
      "intake-cuebook-viewpoint",
      "references",
      "viewpoint-intake-v1.schema.json",
    ),
    "utf-8",
  ));
  const combined = `${create}\n${intake}\n${settlement}`;
  assert.match(combined, /There is no default duration/iu);
  assert.match(combined, /creator-stated horizon always outranks Cuebook inference/iu);
  assert.match(combined, /How long should this view be tested.*Cuebook to suggest a horizon/isu);
  assert.match(combined, /one or two.*proposals/isu);
  assert.match(combined, /must accept or edit/iu);
  assert.match(combined, /A Cue may inform requested timing help; it never finalizes a creator choice/iu);
  assert.match(combined, /accepts every\s+economic term before it enters the complete preview/iu);
  assert.doesNotMatch(combined, /48H \/ 30D \/ 90D/u);
  assert.doesNotMatch(create, /Prefer `BTC · 30D LONG`/u);

  const duration = schema.properties.fields.properties.horizon.properties.intent.oneOf[0];
  const instant = schema.properties.fields.properties.horizon.properties.intent.oneOf[1];
  assert.deepEqual(duration.properties.unit.enum, ["hour", "calendar_day"]);
  assert.equal(duration.properties.session_policy.const, "at_instant");
  assert.equal(instant.properties.session_policy.const, "at_instant");

  const codex = JSON.parse(fs.readFileSync(
    path.join(RUNTIME_ROOT, ".codex-plugin", "plugin.json"),
    "utf-8",
  ));
  assert.ok(codex.interface.defaultPrompt.some((prompt) => /ask for my horizon|help me choose/iu.test(prompt)));
  assert.ok(codex.interface.defaultPrompt.every((prompt) => !/\b30[- ]day|\b30D\b/iu.test(prompt)));
});

test("ordinary one-preview publish does not reconstruct the advanced release graph", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  assert.match(create, /let `complete_frame_publish` finish the server-owned work/u);
  assert.match(publish, /## Stage At Preview, Publish In One Call/u);
  assert.match(publish, /Do not reread design references/u);
  assert.match(publish, /only completion call for a new Frame/u);
  assert.match(publish, /`complete_frame_media_upload`/u);
  assert.doesNotMatch(
    publish,
    /`(?:get_frame_media_status|register_frame_visual_manifest|create_frame_draft|get_frame_draft|update_frame_draft|prepare_frame_publish|publish_frame)`/u,
  );
  assert.match(publish, /including before market open, after market close, on weekends/u);
  assert.match(publish, /never waits for a trading session/u);
  assert.match(publish, /Never tell the creator to return when the market opens/u);
  assert.match(publish, /replay it at most once with the same idempotency key/u);
  assert.match(publish, /Do not probe alternate payload shapes/u);
});

test("Frame publish contract carries structural settlement and auxiliary reasoning metadata", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const flow = payload.frame_publication_flow;
  assert.deepEqual(flow.prepared_publish_required_fields, [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
  ]);
  assert.deepEqual(flow.prepared_correction_publish_required_fields, [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
    "base_release_id",
    "expected_economic_hash",
  ]);
  assert.equal(Object.hasOwn(flow, "prepared_publish_omitted_fields"), false);
  assert.equal(Object.hasOwn(flow, "publish_input_omitted_fields"), false);
  assert.equal(flow.native_image_uploads, true);
  assert.deepEqual(flow.accepted_mime_types, ["image/png", "image/jpeg", "image/webp"]);
  assert.equal(flow.creator_image_policy, "preserve_native_dimensions_and_aspect_ratio");
  assert.equal(flow.external_artifacts, true);
  assert.equal(flow.artifact_hosting_policy, "provider_hosted_url_with_immutable_publication_poster");
  assert.equal(flow.artifact_settlement_independence, true);
  assert.equal(flow.subject_assets_policy, "discovery_only_independent_from_settlement");
  assert.deepEqual(flow.settlement_semantics, {
    non_settling: "none_with_subject_assets_and_no_economic_contract",
    directional: "long_or_short_with_zero_bps_at_exact_deadline",
    terminal_range: "range_with_creator_confirmed_max_abs_move_bps_at_exact_deadline",
    relative_outperformance:
      "two_distinct_same_session_assets_with_equal_notional_return_spread_at_exact_deadline",
    compound_conditions:
      "two_distinct_same_session_assets_with_independent_all_legs_conditions_at_exact_deadline",
  });
  assert.deepEqual(flow.settlement_input, {
    envelope: "settlement",
    non_settling: "{mode:none}",
    market: "{mode:market,settle_at,timezone,claim_text,rule}",
    rule_kinds: ["single_direction", "single_range", "relative", "compound"],
  });
  assert.deepEqual(flow.reasoning_tags, {
    schema_version: "frame-reasoning-tags.v1",
    mode: "agent_inferred",
    frontend_managed: false,
    release_bound: true,
    max_primary: 1,
    max_secondary: 2,
    values: [
      "fundamental",
      "technical",
      "macro_event",
      "flow_positioning",
      "sentiment_narrative",
      "risk_management",
    ],
    child_only_values: ["retrospective"],
    honest_empty: true,
    included_in_content_hash: false,
    included_in_economic_hash: false,
  });
  const tools = new Map(payload.required_tools.map((tool) => [tool.tool, tool]));
  assert.equal(tools.get("complete_frame_publish").input_contract, "CompleteFramePublishV2");
  assert.equal(tools.get("preflight_frame_publish").input_contract, "PreflightFramePublishV2");
});

test("Frame capability map targets the finalized 18-Tool v3 backend contract", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  assert.deepEqual(payload.frame_publication_flow.wire_golden, {
    contract_version: "frame-mcp-phase-b-v3",
    tool_count: 18,
    sync_status: "synced",
    tool_manifest_sha256:
      "sha256:416dd4950a9bcbcdc2c73ed9728f7d817ba1d7a574c50b19bbdf88051d648bad",
    schema_catalog_sha256:
      "sha256:f4b5adb8349bbde80aa0a9d13b9859e4486b15dbf589c5149115ad2bbf731091",
  });
});

test("Frame review keeps retrospective child-only and author-owned", () => {
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(
      PLUGIN_ROOT,
      "skills",
      "create-cuebook-content",
      "references",
      "frame-publish-workflow.md",
    ),
    "utf-8",
  );
  assert.match(query, /After resolution or deadline, offer one review question once/);
  assert.match(query, /Only its author may route an append to Create/);
  assert.match(publish, /frame-child-reasoning-tags\.v1/);
  assert.match(publish, /child-only `retrospective`/);
  assert.match(publish, /Only the parent author may append/);
  assert.match(publish, /no\s+independent image, Artifact, Settlement, or child-of-child path/);
});

test("Frame flow rejects reintroduced publish consent", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      const sequence = payload.frame_publication_flow.initial_publish_sequence;
      sequence.splice(sequence.indexOf("complete_frame_publish"), 0, "get_frame_action_consent");
    });
    assert.ok(codes(validate(root)).has("FRAME_FLOW_CONTRACT"));
  });
});

test("Frame contract rejects a reintroduced withdrawal action", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      const removedTool = structuredClone(
        payload.required_tools.find((tool) => tool.tool === "publish_frame"),
      );
      removedTool.tool = "withdraw_frame";
      payload.required_tools.push(removedTool);
      payload.frame_publication_flow.withdraw_sequence = ["withdraw_frame"];
    });
    assert.ok(codes(validate(root)).has("FRAME_WITHDRAWAL_REMOVED"));
  });
});

test("Frame entry skills keep author controls in App and revisions in Correction or a new Frame", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  const orchestrate = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "orchestrate-cuebook-creator-workflow", "SKILL.md"),
    "utf-8",
  );
  const combined = `${create}\n${query}\n${orchestrate}`;
  assert.match(create, /Ordinary initial publication uses `complete_frame_publish`/u);
  assert.match(orchestrate, /complete_frame_publish/u);
  assert.match(combined, /Published releases are immutable/iu);
  assert.match(combined, /MCP has no hide, delete, or management/iu);
  assert.match(combined, /App[\s\S]*hide\/show[\s\S]*first hour/iu);
  assert.match(combined, /Correction[\s\S]*new Frame/iu);
  assert.doesNotMatch(
    combined,
    /\b(?:get_frame_action_consent|prepare_frame_withdraw|withdraw_frame|frame_withdrawal|withdrawal_consent)\b/u,
  );
  assert.doesNotMatch(create, /prepare → first-party consent bound to `prepared_hash` → publish/u);
});

test("Skill instructions cannot reintroduce get_frame_media", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "create-cuebook-content", "SKILL.md");
    fs.writeFileSync(filePath, `${fs.readFileSync(filePath, "utf-8")}\nCall \`get_frame_media\` to fetch the image.\n`);
    assert.ok(codes(validate(root)).has("FRAME_SKILL_MEDIA_PULL"));
  });
});
