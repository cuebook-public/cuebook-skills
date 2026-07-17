import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ASSET, stamp } from "../scripts/stamp_cuebook_wordmark.mjs";

test("stamps light background", () => {
  const [output, changed] = stamp("<style></style><main></main>", "light");
  assert.equal(changed, true);
  assert.match(output, /data-cuebook-wordmark="v1"/);
  assert.match(output, /color:#101411/);
  assert.match(output, /right:41px;bottom:34px/);
  const canonicalPathCount = (readFileSync(ASSET, "utf8").match(/<path /g) ?? []).length;
  assert.equal((output.match(/fill="currentColor"/g) ?? []).length, canonicalPathCount);
});

test("stamps dark background", () => {
  const [output] = stamp("<style></style><main></main>", "dark");
  assert.match(output, /color:#F2F3F4/);
});

test("stamp is idempotent", () => {
  const [once] = stamp("<style></style><main></main>", "light");
  const [twice, changed] = stamp(once, "light");
  assert.equal(changed, false);
  assert.equal(twice, once);
});

test("restamping for another background flips color", () => {
  const [light] = stamp("<style></style><main></main>", "light");
  const [dark, changed] = stamp(light, "dark");
  assert.equal(changed, true);
  assert.match(dark, /color:#F2F3F4/);
  assert.doesNotMatch(dark, /color:#101411/);
  assert.equal((dark.match(/data-cuebook-wordmark="v1"/g) ?? []).length, 1);
  const [again, changedAgain] = stamp(dark, "dark");
  assert.equal(changedAgain, false);
  assert.equal(again, dark);
});
