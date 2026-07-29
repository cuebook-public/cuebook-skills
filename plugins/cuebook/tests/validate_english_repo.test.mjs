import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

test("repository validation skips tracked files deleted in the working tree", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-english-gate-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    fs.writeFileSync(path.join(root, "kept.md"), "English only\n");
    fs.writeFileSync(path.join(root, "removed.md"), "English only\n");
    execFileSync("git", ["add", "kept.md", "removed.md"], { cwd: root });
    fs.rmSync(path.join(root, "removed.md"));
    const result = validateEnglishRepo(root);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.stats.tracked_file_count, 2);
    assert.equal(result.stats.text_file_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("root Simplified Chinese README is allowed but canonical source remains English-only", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-localized-docs-gate-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const han = String.fromCodePoint(0x4e2d);
    fs.writeFileSync(path.join(root, "README.zh-CN.md"), `${han}\n`);
    fs.writeFileSync(path.join(root, "SKILL.md"), `${han}\n`);
    execFileSync("git", ["add", "README.zh-CN.md", "SKILL.md"], { cwd: root });
    const result = validateEnglishRepo(root);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.map((item) => item.file), ["SKILL.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
