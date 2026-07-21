import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  prepareOpenAiSubmission,
  validateOpenAiSubmission,
} from "../scripts/prepare_openai_submission.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("OpenAI submission packet has two Skills and exactly 5/3 reviewer cases", () => {
  assert.deepEqual(validateOpenAiSubmission(ROOT), {
    valid: true,
    public_skills: ["query-cuebook", "create-cuebook-content"],
    positive_cases: 5,
    negative_cases: 3,
  });
});

test("OpenAI submission build emits a hashed two-Skill archive", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-openai-submission-"));
  try {
    const result = prepareOpenAiSubmission(ROOT, temp);
    const manifest = JSON.parse(readFileSync(path.join(temp, "submission-manifest.json"), "utf8"));
    assert.equal(result.archive_sha256, manifest.archive_sha256);
    assert.deepEqual(manifest.public_skills, ["query-cuebook", "create-cuebook-content"]);
    assert.equal(manifest.reviewer_cases.positive, 5);
    assert.equal(manifest.reviewer_cases.negative, 3);
    assert.ok(manifest.skill_file_count > 2);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
