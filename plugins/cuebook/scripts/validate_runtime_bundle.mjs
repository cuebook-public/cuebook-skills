#!/usr/bin/env node

// Validate the host-resolved Cuebook install surface, not merely the source
// manifests that intend to describe it. A conventional `skills/` directory is
// additive in Codex and Claude Code, so the runtime root must physically
// contain only the three generated public entrypoints.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RUNTIME_ASSETS,
  RUNTIME_ROOT_ENTRIES,
} from "./build_runtime_bundle.mjs";

export const PUBLIC_SKILLS = Object.freeze([
  "author-cuebook-skill",
  "create-cuebook-content",
  "query-cuebook",
]);

function load(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function namedFiles(root, fileName) {
  const found = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && entry.name === fileName) found.push(target);
    }
  };
  walk(root);
  return found.sort();
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const baseVersion = (version) => String(version ?? "").split("+")[0];

export function validateRuntimeBundle(runtimeRootArg, options = {}) {
  const runtimeRoot = path.resolve(runtimeRootArg);
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? path.join(runtimeRoot, "..", "..", ".."),
  );
  const sourceRoot = path.resolve(
    options.sourceRoot ?? path.join(repositoryRoot, "plugins", "cuebook"),
  );
  const issues = [];
  const add = (code, issuePath, message) => {
    issues.push({ code, path: issuePath, message });
  };

  const rootEntries = fs.existsSync(runtimeRoot)
    ? fs.readdirSync(runtimeRoot).sort()
    : [];
  if (!same(rootEntries, RUNTIME_ROOT_ENTRIES)) {
    add(
      "RUNTIME_ROOT_SURFACE",
      path.relative(repositoryRoot, runtimeRoot),
      `Runtime root must contain only ${RUNTIME_ROOT_ENTRIES.join(", ")}.`,
    );
  }

  const skillsRoot = path.join(runtimeRoot, "skills");
  const skillDirs = fs.existsSync(skillsRoot)
    ? fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => (
        entry.isDirectory()
        && fs.existsSync(path.join(skillsRoot, entry.name, "SKILL.md"))
      ))
      .map((entry) => entry.name)
      .sort()
    : [];
  if (!same(skillDirs, PUBLIC_SKILLS)) {
    add(
      "RUNTIME_SKILL_SET",
      `${path.relative(repositoryRoot, runtimeRoot)}/skills`,
      `Host discovery must expose only ${PUBLIC_SKILLS.join(", ")}.`,
    );
  }
  const discoveredSkillDocs = namedFiles(skillsRoot, "SKILL.md");
  const expectedSkillDocs = PUBLIC_SKILLS
    .map((skill) => path.join(skillsRoot, skill, "SKILL.md"))
    .sort();
  if (!same(discoveredSkillDocs, expectedSkillDocs)) {
    add(
      "RUNTIME_DISCOVERABLE_SKILLS",
      `${path.relative(repositoryRoot, runtimeRoot)}/skills`,
      "Runtime bundles must contain exactly three root SKILL.md files and no nested discoverable modules.",
    );
  }

  const sourceSkillDocs = namedFiles(path.join(sourceRoot, "skills"), "SKILL.md");
  if (sourceSkillDocs.length <= PUBLIC_SKILLS.length) {
    add(
      "SOURCE_RUNTIME_SEPARATION",
      path.relative(repositoryRoot, sourceRoot),
      "The L2a source tree must remain separate from the sanitized host runtime.",
    );
  }
  if (sourceSkillDocs.some((file) => file.startsWith(`${runtimeRoot}${path.sep}`))) {
    add(
      "SOURCE_SKILL_LEAK",
      path.relative(repositoryRoot, runtimeRoot),
      "Internal source modules must not live under the host runtime root.",
    );
  }

  let codex = {};
  let claude = {};
  let mcp = {};
  let distribution = {};
  try {
    codex = load(path.join(runtimeRoot, ".codex-plugin", "plugin.json"));
    claude = load(path.join(runtimeRoot, ".claude-plugin", "plugin.json"));
    mcp = load(path.join(runtimeRoot, ".mcp.json"));
    distribution = load(path.join(runtimeRoot, "distribution-channel-v1.json"));
  } catch (error) {
    add(
      "RUNTIME_MANIFEST_READ",
      path.relative(repositoryRoot, runtimeRoot),
      `Cannot read runtime metadata: ${error.message}`,
    );
  }
  for (const [host, manifest] of [["Codex", codex], ["Claude", claude]]) {
    if (
      manifest.name !== "cuebook"
      || manifest.skills !== "./skills/"
      || manifest.mcpServers !== "./.mcp.json"
    ) {
      add(
        "RUNTIME_HOST_MANIFEST",
        `${path.relative(repositoryRoot, runtimeRoot)}/.${host.toLowerCase()}-plugin/plugin.json`,
        `${host} must use the runtime skills directory and canonical MCP descriptor.`,
      );
    }
  }
  if (baseVersion(codex.version) !== baseVersion(claude.version)) {
    add(
      "RUNTIME_VERSION_DRIFT",
      path.relative(repositoryRoot, runtimeRoot),
      "Codex and Claude runtime manifests must share one base version.",
    );
  }

  const servers = mcp.mcpServers ?? {};
  const cuebook = servers.cuebook ?? {};
  if (
    !same(Object.keys(servers), ["cuebook"])
    || cuebook.url !== distribution.mcp_url
    || cuebook.oauth_resource !== distribution.mcp_url
  ) {
    add(
      "RUNTIME_MCP_SURFACE",
      `${path.relative(repositoryRoot, runtimeRoot)}/.mcp.json`,
      "Runtime must contain one cuebook MCP server aligned with its distribution channel.",
    );
  }

  for (const asset of RUNTIME_ASSETS) {
    if (!fs.existsSync(path.join(runtimeRoot, "assets", asset))) {
      add(
        "RUNTIME_ASSET",
        `${path.relative(repositoryRoot, runtimeRoot)}/assets/${asset}`,
        "Required runtime asset is missing.",
      );
    }
  }

  let codexMarketplace = {};
  let claudeMarketplace = {};
  try {
    codexMarketplace = load(
      path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"),
    );
    claudeMarketplace = load(
      path.join(repositoryRoot, ".claude-plugin", "marketplace.json"),
    );
  } catch (error) {
    add(
      "RUNTIME_MARKETPLACE_READ",
      path.relative(repositoryRoot, runtimeRoot),
      `Cannot read host marketplaces: ${error.message}`,
    );
  }
  const codexEntry = codexMarketplace.plugins?.find(
    (entry) => entry.name === "cuebook",
  );
  const claudeEntry = claudeMarketplace.plugins?.find(
    (entry) => entry.name === "cuebook",
  );
  if (codexEntry?.source?.path !== "./plugins/runtime/cuebook") {
    add(
      "CODEX_RUNTIME_SOURCE",
      ".agents/plugins/marketplace.json",
      "Codex marketplace must install the sanitized runtime root.",
    );
  }
  if (
    claudeEntry?.source !== "./plugins/runtime/cuebook"
    || claudeEntry?.strict !== true
  ) {
    add(
      "CLAUDE_RUNTIME_SOURCE",
      ".claude-plugin/marketplace.json",
      "Claude marketplace must install the sanitized runtime root with its manifest authoritative.",
    );
  }
  for (const field of ["skills", "mcpServers"]) {
    if (claudeEntry?.[field] !== undefined) {
      add(
        "CLAUDE_MARKETPLACE_COMPONENT_OVERRIDE",
        `.claude-plugin/marketplace.json.plugins.cuebook.${field}`,
        "Claude component paths belong to the shared runtime manifest, not a host-specific override.",
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats: {
      runtime_skill_count: skillDirs.length,
      runtime_skill_docs: discoveredSkillDocs.length,
      source_skill_docs: sourceSkillDocs.length,
      mcp_server_count: Object.keys(servers).length,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    process.stderr.write(
      "usage: validate_runtime_bundle.mjs runtime_root\n",
    );
    process.exitCode = 2;
    return;
  }
  const result = validateRuntimeBundle(args[0]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
) {
  main();
}
