import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_cuebook_plugin.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const target = path.join(tmpPath, "cuebook");
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true });
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
  const modules = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "cuebook-modules-v1.json"), "utf-8"),
  );
  assert.ok(modules.routing_rules.query_deliverables.includes("factual_chart"));
  assert.ok(modules.routing_rules.create_deliverables.includes("creator_viewpoint_graphic"));
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
      payload.queries[0].mcp_tools.push("save_creator_artifact");
    });
    assert.ok(codes(validate(root)).has("QUERY_WRITE_TOOL"));
  });
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
