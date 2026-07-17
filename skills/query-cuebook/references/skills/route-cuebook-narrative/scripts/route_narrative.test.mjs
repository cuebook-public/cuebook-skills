import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { route } from "./route_narrative.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(path.join(skillRoot, "references", "route-regression-cases.json"), "utf8"));

test(`all ${cases.length} route regression cases`, async (t) => {
  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      assert.equal(route(fixture.cue).event_type, fixture.expected);
    });
  }
});
