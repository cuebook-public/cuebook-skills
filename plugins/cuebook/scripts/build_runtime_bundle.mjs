#!/usr/bin/env node

// Build the one host-installable Cuebook runtime root from the L2a source
// tree. The source root intentionally keeps the 39 internal capability
// modules under its conventional `skills/` directory; no host marketplace may
// point there. Codex, Claude Code, and OpenClaw all consume this sanitized
// output, whose conventional `skills/` directory contains only the three
// generated public entrypoints.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "./build_release_skills.mjs";

export const RUNTIME_ROOT_ENTRIES = Object.freeze([
  ".claude-plugin",
  ".codex-plugin",
  ".mcp.json",
  "assets",
  "distribution-channel-v1.json",
  "skills",
]);

export const RUNTIME_ASSETS = Object.freeze([
  "icon.png",
  "runtime-compatibility-v1.json",
  "runtime-compatibility-v1.schema.json",
]);

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true });
}

export function buildRuntimeBundle(sourceRootArg, runtimeRootArg) {
  const sourceRoot = path.resolve(sourceRootArg);
  const runtimeRoot = path.resolve(runtimeRootArg);
  const templateRoot = path.join(sourceRoot, "runtime-template");

  if (
    runtimeRoot === sourceRoot
    || sourceRoot.startsWith(`${runtimeRoot}${path.sep}`)
  ) {
    throw new Error(
      "Runtime output must be separate from, and must not contain, the source root.",
    );
  }

  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });

  copy(
    path.join(templateRoot, ".codex-plugin"),
    path.join(runtimeRoot, ".codex-plugin"),
  );
  copy(
    path.join(templateRoot, ".claude-plugin"),
    path.join(runtimeRoot, ".claude-plugin"),
  );
  copy(
    path.join(templateRoot, ".mcp.json"),
    path.join(runtimeRoot, ".mcp.json"),
  );
  copy(
    path.join(sourceRoot, "distribution-channel-v1.json"),
    path.join(runtimeRoot, "distribution-channel-v1.json"),
  );
  for (const asset of RUNTIME_ASSETS) {
    copy(
      path.join(sourceRoot, "assets", asset),
      path.join(runtimeRoot, "assets", asset),
    );
  }

  const skillManifest = build(sourceRoot, path.join(runtimeRoot, "skills"));
  const rootEntries = fs.readdirSync(runtimeRoot).sort();

  return {
    valid: skillManifest.valid
      && JSON.stringify(rootEntries) === JSON.stringify(RUNTIME_ROOT_ENTRIES),
    runtime_root: runtimeRoot,
    root_entries: rootEntries,
    expected_root_entries: RUNTIME_ROOT_ENTRIES,
    skill_manifest: skillManifest,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((arg) => arg.startsWith("-"))) {
    process.stderr.write(
      "usage: build_runtime_bundle.mjs source_root runtime_root\n",
    );
    process.exitCode = 2;
    return;
  }
  const result = buildRuntimeBundle(args[0], args[1]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
) {
  main();
}
