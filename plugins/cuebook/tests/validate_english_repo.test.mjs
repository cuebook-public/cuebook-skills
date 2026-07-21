import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  findDisallowedCjkCharacters,
  validateEnglishRepo,
} from "../scripts/validate_english_repo.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("plain English and textual Unicode escapes pass", () => {
  assert.deepEqual(findDisallowedCjkCharacters("English only: \\u4e2d"), []);
});

test("CJK characters are reported with location and codepoint", () => {
  const han = String.fromCodePoint(0x4e2d);
  assert.deepEqual(findDisallowedCjkCharacters(`first line\nA${han}B`, "sample.md"), [
    {
      file: "sample.md",
      line: 2,
      column: 2,
      codepoint: "U+4E2D",
    },
  ]);
});

test("all tracked repository text is English-only", () => {
  const result = validateEnglishRepo(REPO_ROOT);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(result.stats.text_file_count > 100);
});
