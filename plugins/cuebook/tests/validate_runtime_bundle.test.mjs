import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateRuntimeBundle } from "../scripts/validate_runtime_bundle.mjs";
import { buildRuntimeBundle } from "../scripts/build_runtime_bundle.mjs";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const RUNTIME_ROOT = path.join(
  REPOSITORY_ROOT,
  "plugins",
  "runtime",
  "cuebook",
);

test("host runtime exposes exactly three Skills and one MCP server", () => {
  const result = validateRuntimeBundle(RUNTIME_ROOT);
  assert.ok(result.valid, JSON.stringify(result));
  assert.deepEqual(result.stats, {
    runtime_skill_count: 3,
    runtime_skill_docs: 3,
    source_skill_docs: 39,
    mcp_server_count: 1,
  });
});

test("runtime builder cannot overwrite or contain its source root", () => {
  const sourceRoot = path.join(REPOSITORY_ROOT, "plugins", "cuebook");
  assert.throws(
    () => buildRuntimeBundle(sourceRoot, sourceRoot),
    /must be separate from/u,
  );
  assert.throws(
    () => buildRuntimeBundle(
      path.join(sourceRoot, "skills"),
      path.join(REPOSITORY_ROOT, "plugins"),
    ),
    /must be separate from/u,
  );
});

test("host runtime rejects an internal Skill leaking into conventional discovery", () => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "cuebook-runtime-inventory-"),
  );
  const runtimeRoot = path.join(
    temporaryRoot,
    "plugins",
    "runtime",
    "cuebook",
  );
  try {
    fs.mkdirSync(path.dirname(runtimeRoot), { recursive: true });
    fs.cpSync(RUNTIME_ROOT, runtimeRoot, { recursive: true });
    fs.mkdirSync(path.join(temporaryRoot, "plugins", "cuebook"), {
      recursive: true,
    });
    fs.cpSync(
      path.join(REPOSITORY_ROOT, "plugins", "cuebook", "skills"),
      path.join(temporaryRoot, "plugins", "cuebook", "skills"),
      { recursive: true },
    );
    for (const relativePath of [
      ".agents/plugins/marketplace.json",
      ".claude-plugin/marketplace.json",
    ]) {
      const target = path.join(temporaryRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(REPOSITORY_ROOT, relativePath), target);
    }
    const leakedSkill = path.join(
      runtimeRoot,
      "skills",
      "internal-capability",
      "SKILL.md",
    );
    fs.mkdirSync(path.dirname(leakedSkill), { recursive: true });
    fs.writeFileSync(leakedSkill, "---\nname: internal-capability\n---\n");

    const result = validateRuntimeBundle(runtimeRoot);
    const codes = new Set(result.issues.map((issue) => issue.code));
    assert.equal(result.valid, false);
    assert.ok(codes.has("RUNTIME_SKILL_SET"));
    assert.ok(codes.has("RUNTIME_DISCOVERABLE_SKILLS"));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
