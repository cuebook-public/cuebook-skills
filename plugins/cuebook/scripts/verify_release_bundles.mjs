#!/usr/bin/env node

// Rebuild release bundles in an isolated temporary directory and compare them
// byte-for-byte with the checked-in working copies. Unlike `git diff`, this
// works before a release commit exists and ignores unrelated user changes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "./build_release_skills.mjs";
import { buildRuntimeBundle } from "./build_runtime_bundle.mjs";

function filesUnder(root) {
  const files = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) files.push(path.relative(root, target).split(path.sep).join("/"));
    }
  };
  walk(root);
  return files.sort();
}

export function compareTrees(expectedRootArg, actualRootArg) {
  const expectedRoot = path.resolve(expectedRootArg);
  const actualRoot = path.resolve(actualRootArg);
  const expectedFiles = filesUnder(expectedRoot);
  const actualFiles = filesUnder(actualRoot);
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedSet.has(file));
  const changed = expectedFiles.filter((file) => (
    actualSet.has(file)
    && !fs.readFileSync(path.join(expectedRoot, file)).equals(fs.readFileSync(path.join(actualRoot, file)))
  ));
  return { valid: missing.length === 0 && extra.length === 0 && changed.length === 0, missing, extra, changed };
}

export function verifyReleaseBundles(rootArg) {
  const root = path.resolve(rootArg);
  const pluginRoot = path.join(root, "plugins/cuebook");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-release-verify-"));
  try {
    const expectedSkills = path.join(tempRoot, "skills");
    const skillsManifest = build(pluginRoot, expectedSkills);
    const expectedRuntime = path.join(tempRoot, "cuebook-runtime");
    const runtimeBundle = buildRuntimeBundle(pluginRoot, expectedRuntime);
    const results = [
      {
        target: "skills",
        manifest_valid: skillsManifest.valid,
        ...compareTrees(expectedSkills, path.join(root, "skills")),
      },
      {
        target: "plugins/runtime/cuebook",
        manifest_valid: runtimeBundle.valid,
        ...compareTrees(
          expectedRuntime,
          path.join(root, "plugins", "runtime", "cuebook"),
        ),
      },
    ];
    return { valid: results.every((result) => result.manifest_valid && result.valid), results };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = verifyReleaseBundles(root);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
