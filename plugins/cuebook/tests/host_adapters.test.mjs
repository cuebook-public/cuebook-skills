import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PLUGIN_ROOT, "..", "..");
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
    path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json"),
  );
  const claudeManifest = loadJson(
    path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"),
  );
  const mcp = loadJson(path.join(PLUGIN_ROOT, ".mcp.json"));
  const skillDirs = fs.readdirSync(path.join(PLUGIN_ROOT, "public-skills"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.equal(codexManifest.name, "cuebook");
  assert.equal(claudeManifest.name, "cuebook");
  assert.equal(codexManifest.skills, "./public-skills/");
  assert.equal(claudeManifest.skills, "./public-skills/");
  assert.equal(codexManifest.mcpServers, "./.mcp.json");
  assert.equal(claudeManifest.mcpServers, "./.mcp.json");
  assert.deepEqual(skillDirs, PUBLIC_SKILLS);
  for (const skillName of PUBLIC_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(PLUGIN_ROOT, "public-skills", skillName, "SKILL.md")),
      skillName,
    );
  }
  assert.deepEqual(Object.keys(mcp.mcpServers), ["cuebook"]);
  assert.equal(mcp.mcpServers.cuebook.url, "https://cuebook.app/mcp");
  assert.equal(
    mcp.mcpServers.cuebook.oauth_resource,
    "https://cuebook.app/mcp",
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
  assert.match(guide, /marketplace entry must resolve to `\.\/plugins\/cuebook`/u);
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
    /openclaw plugins install \.\/cuebook-skills\/plugins\/cuebook --force/u,
  );
  assert.match(guide, /openclaw gateway restart/u);
  assert.doesNotMatch(guide, /Copy the generated `skills\//u);
  assert.doesNotMatch(guide, /\*\*Surface:\*\* Two Agent Skills/u);
});

test("Hermes adapter installs, authenticates, and updates all public Skills", () => {
  const guide = readPlatform("hermes.md");

  assert.match(guide, /\*\*Surface:\*\* Three Agent Skills/u);
  for (const skillName of PUBLIC_SKILLS) {
    const source = `cuebook-public/cuebook-skills/skills/${skillName}`;
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
  assert.match(guide, /hermes mcp login cuebook/u);
  assert.match(guide, /fresh terminal/u);
  assert.match(guide, /hermes skills check/u);
  assert.match(guide, /hermes skills audit/u);
  assert.doesNotMatch(guide, /\*\*Surface:\*\* Two Agent Skills/u);
});

test("platform matrix distinguishes native, compatible-bundle, and direct-Skill adapters", () => {
  const matrix = readPlatform("README.md");

  assert.match(matrix, /Codex-compatible Cuebook bundle/u);
  assert.match(matrix, /Current CLI local bundle and MCP config verified/u);
  assert.match(matrix, /GitHub Skill paths \+ Hermes MCP config/u);
  assert.match(matrix, /`plugins\/cuebook\/` is the canonical portable Plugin root/u);
  assert.match(matrix, /exactly the three public entrypoints/u);
  assert.match(
    matrix,
    /major, permission, or capability-tier\s+change requires explicit review/u,
  );
  assert.match(matrix, /host-native update path once/u);
  assert.match(matrix, /without a second OAuth grant/u);
});
