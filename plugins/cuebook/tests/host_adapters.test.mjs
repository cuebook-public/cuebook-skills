import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");
const RUNTIME_ROOT = path.join(REPOSITORY_ROOT, "plugins", "runtime", "cuebook");
const PLATFORM_ROOT = path.join(PLUGIN_ROOT, "platforms");
const PUBLIC_SKILLS = [
  "author-cuebook-skill",
  "create-cuebook-content",
  "query-cuebook",
];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readPlatform(name) {
  return fs.readFileSync(path.join(PLATFORM_ROOT, name), "utf-8");
}

test("Codex, Claude, and OpenClaw share one canonical portable plugin root", () => {
  const codexManifest = loadJson(
    path.join(RUNTIME_ROOT, ".codex-plugin", "plugin.json"),
  );
  const claudeManifest = loadJson(
    path.join(RUNTIME_ROOT, ".claude-plugin", "plugin.json"),
  );
  const mcp = loadJson(path.join(RUNTIME_ROOT, ".mcp.json"));
  const distributionChannel = loadJson(
    path.join(PLUGIN_ROOT, "distribution-channel-v1.json"),
  );
  const skillDirs = fs.readdirSync(path.join(RUNTIME_ROOT, "skills"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(codexManifest.name, "cuebook");
  assert.equal(claudeManifest.name, "cuebook");
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(claudeManifest.skills, "./skills/");
  assert.equal(codexManifest.mcpServers, "./.mcp.json");
  assert.equal(claudeManifest.mcpServers, "./.mcp.json");
  assert.deepEqual(skillDirs, PUBLIC_SKILLS);
  for (const skillName of PUBLIC_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(RUNTIME_ROOT, "skills", skillName, "SKILL.md")),
      skillName,
    );
  }
  assert.deepEqual(Object.keys(mcp.mcpServers), ["cuebook"]);
  assert.equal(mcp.mcpServers.cuebook.url, distributionChannel.mcp_url);
  assert.equal(
    mcp.mcpServers.cuebook.oauth_resource,
    distributionChannel.mcp_url,
  );
  assert.equal(mcp.mcpServers.cuebook.headers, undefined);
});

test("OpenClaw adapter uses the compatible bundle lifecycle", () => {
  const guide = readPlatform("openclaw.md");

  assert.match(guide, /\*\*Surface:\*\* One compatible bundle with three Agent Skills/u);
  assert.match(
    guide,
    /openclaw plugins install cuebook[\s\\]+--marketplace cuebook-public\/cuebook-skills/u,
  );
  assert.match(guide, /marketplace entry must resolve to `\.\/plugins\/runtime\/cuebook`/u);
  assert.match(guide, /openclaw plugins inspect cuebook --json/u);
  assert.match(guide, /openclaw skills list --json/u);
  assert.match(guide, /Bundle discovery proves that the MCP descriptor shipped/u);
  assert.match(guide, /unsupported or incomplete bundle transport/u);
  assert.match(guide, /"transport":"streamable-http"/u);
  assert.match(guide, /"auth":"oauth"/u);
  assert.match(guide, /"supportsParallelToolCalls":false/u);
  assert.match(guide, /openclaw mcp login cuebook/u);
  assert.match(guide, /openclaw mcp doctor cuebook --probe/u);
  assert.match(guide, /openclaw plugins update cuebook --dry-run/u);
  assert.match(guide, /skips `plugins update` for a local-path source/u);
  assert.match(
    guide,
    /openclaw plugins install \.\/cuebook-skills\/plugins\/runtime\/cuebook --force/u,
  );
  assert.match(guide, /openclaw gateway restart/u);
  assert.doesNotMatch(guide, /Copy the generated `skills\//u);
  assert.doesNotMatch(guide, /\*\*Surface:\*\* Two Agent Skills/u);
});

test("Hermes adapter installs, authenticates, and updates all public Skills", () => {
  const guide = readPlatform("hermes.md");
  const distribution = loadJson(path.join(PLUGIN_ROOT, "distribution-channel-v1.json"));

  assert.match(guide, /\*\*Surface:\*\* Three Agent Skills/u);
  for (const skillName of PUBLIC_SKILLS) {
    const source = `${distribution.skills_base_url}/${skillName}`;
    assert.ok(guide.includes(`hermes skills inspect ${source}`), skillName);
    assert.ok(guide.includes(`hermes skills install ${source}`), skillName);
    assert.ok(guide.includes(`hermes skills update ${skillName}`), skillName);
    assert.ok(
      fs.existsSync(path.join(REPOSITORY_ROOT, "skills", skillName, "SKILL.md")),
      skillName,
    );
  }
  assert.match(guide, /auth: oauth/u);
  assert.match(guide, /supports_parallel_tool_calls: false/u);
  assert.match(guide, /HERMES_DASHBOARD_SESSION_TOKEN/u);
  assert.match(guide, /HERMES_DASHBOARD_PUBLIC_URL/u);
  assert.match(guide, /127\.0\.0\.1:9119/u);
  assert.match(guide, /plugins install cuebook-public\/cuebook-skills\/plugins\/hermes\/cuebook-auth --enable/u);
  assert.match(guide, /\/cuebook-auth/u);
  assert.match(guide, /hermes mcp login cuebook/u);
  assert.match(guide, /hermes skills check/u);
  assert.match(guide, /hermes skills audit/u);
  assert.match(guide, /copies a repository subdirectory without its parent `\.git`/u);
  assert.match(guide, /--force --enable/u);
  assert.match(guide, /foreground, long-lived process and its command does not\s+return/u);
  assert.match(guide, /X-Hermes-Session-Token/u);
  assert.match(guide, /api\/mcp\/servers/u);
  assert.doesNotMatch(guide, /^hermes plugins update cuebook-auth$/mu);
  assert.ok(
    fs.existsSync(path.join(REPOSITORY_ROOT, "plugins", "hermes", "cuebook-auth", "plugin.yaml")),
  );
  assert.doesNotMatch(guide, /\*\*Surface:\*\* Two Agent Skills/u);
});

test("installation entrypoint and platform matrix govern every host adapter", () => {
  const install = fs.readFileSync(path.join(PLUGIN_ROOT, "INSTALL.md"), "utf-8");
  const matrix = readPlatform("README.md");

  assert.match(matrix, /Codex-compatible Cuebook bundle/u);
  assert.match(matrix, /Current CLI local bundle and MCP config verified/u);
  assert.match(matrix, /Well-known Skill bundles \+ Hermes OAuth bridge/u);
  assert.match(matrix, /`plugins\/runtime\/cuebook\/` is the canonical portable Plugin root/u);
  assert.match(matrix, /exactly the three public entrypoints/u);
  assert.match(
    matrix,
    /major, permission, or capability-tier\s+change requires explicit review/u,
  );
  assert.match(install, /host-native update path once/u);
  assert.match(install, /without a second OAuth grant/u);
  assert.match(install, /Ordinary user quick path/u);
  assert.match(install, /package_inventory_defect/u);
  assert.match(
    install,
    /not\s+an instruction to inspect, switch, or modify the Git branch/u,
  );
  assert.match(install, /Live verification gate \(maintainers only\)/u);
});
