// Port of test_validate_projection.py: replays references/db-regression-cases.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { validate } from "./validate_projection.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cases = JSON.parse(readFileSync(join(root, "references", "db-regression-cases.json"), "utf-8"));

for (const item of cases) {
  test(item.name, () => {
    const result = validate(item.cue);
    const expected = item.expected;
    const codes = new Set(result.checks.map((check) => check.code));
    assert.equal(
      result.decision,
      expected.decision,
      `${item.name}: decision ${result.decision} != ${expected.decision} (${JSON.stringify([...codes].sort())})`,
    );
    for (const code of expected.codes ?? []) {
      assert.ok(codes.has(code), `${item.name}: missing ${code}; got ${JSON.stringify([...codes].sort())}`);
    }
  });
}
