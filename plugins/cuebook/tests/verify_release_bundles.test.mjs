import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compareTrees, verifyReleaseBundles } from "../scripts/verify_release_bundles.mjs";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function withTrees(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-release-tree-test-"));
  const expected = path.join(root, "expected");
  const actual = path.join(root, "actual");
  fs.mkdirSync(path.join(expected, "nested"), { recursive: true });
  fs.mkdirSync(path.join(actual, "nested"), { recursive: true });
  try {
    return fn({ expected, actual });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("tree comparison reports changed, missing, and extra generated files", () => {
  withTrees(({ expected, actual }) => {
    fs.writeFileSync(path.join(expected, "same.txt"), "same\n");
    fs.writeFileSync(path.join(actual, "same.txt"), "same\n");
    fs.writeFileSync(path.join(expected, "nested/changed.txt"), "expected\n");
    fs.writeFileSync(path.join(actual, "nested/changed.txt"), "actual\n");
    fs.writeFileSync(path.join(expected, "missing.txt"), "missing\n");
    fs.writeFileSync(path.join(actual, "extra.txt"), "extra\n");
    assert.deepEqual(compareTrees(expected, actual), {
      valid: false,
      missing: ["missing.txt"],
      extra: ["extra.txt"],
      changed: ["nested/changed.txt"],
    });
  });
});

test("checked-in bundles match an isolated rebuild", () => {
  const result = verifyReleaseBundles(REPOSITORY_ROOT);
  assert.ok(result.valid, JSON.stringify(result));
  assert.deepEqual(result.results.map((item) => item.target), [
    "skills",
    "plugins/cuebook/public-skills",
  ]);
});
