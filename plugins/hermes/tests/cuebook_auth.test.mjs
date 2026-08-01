import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";


const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_ROOT, "..", "..", "..");


test("Hermes Cuebook OAuth bridge unit suite passes", () => {
  const result = spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", "plugins/hermes/tests", "-p", "test_*.py"],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
