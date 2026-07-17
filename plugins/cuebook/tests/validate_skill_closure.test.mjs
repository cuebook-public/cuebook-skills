import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateSkillClosure } from "../scripts/validate_skill_closure.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function withCopiedPlugin(callback) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-skill-closure-"));
  const target = path.join(temporary, "cuebook");
  try {
    fs.cpSync(PLUGIN_ROOT, target, { recursive: true });
    return callback(target);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function appendToEntrypoint(pluginRoot, text) {
  const skillMd = path.join(pluginRoot, "skills", "query-cuebook", "SKILL.md");
  fs.appendFileSync(skillMd, `\n${text}\n`);
}

test("all packaged skill references close", () => {
  const result = validateSkillClosure(PLUGIN_ROOT);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.stats.skill_count, 38);
  assert.ok(result.stats.markdown_file_count >= 100);
  assert.ok(result.stats.resource_ref_count > 100);
  assert.ok(result.stats.skill_ref_count > 30);
});

test("missing inline-code resource fails closure", () => {
  withCopiedPlugin((pluginRoot) => {
    appendToEntrypoint(pluginRoot, "Load `references/output-templates.md` before answering.");
    const result = validateSkillClosure(pluginRoot);
    assert.ok(codes(result).has("MISSING_RESOURCE"), JSON.stringify(result.errors, null, 2));
  });
});

test("broken relative Markdown link fails closure", () => {
  withCopiedPlugin((pluginRoot) => {
    appendToEntrypoint(pluginRoot, "Read [the missing contract](references/missing-contract.md).");
    assert.ok(codes(validateSkillClosure(pluginRoot)).has("MISSING_RESOURCE"));
  });
});

test("unknown skill invocation fails closure", () => {
  withCopiedPlugin((pluginRoot) => {
    appendToEntrypoint(pluginRoot, "Invoke $not-a-cuebook-skill.");
    assert.ok(codes(validateSkillClosure(pluginRoot)).has("UNKNOWN_SKILL_REF"));
  });
});

test("missing cross-skill resource fails closure", () => {
  withCopiedPlugin((pluginRoot) => {
    appendToEntrypoint(pluginRoot, "Load `$build-market-research-pack/references/not-shipped.md`.");
    assert.ok(codes(validateSkillClosure(pluginRoot)).has("MISSING_RESOURCE"));
  });
});

test("retired SEO and GEO skill invocations have a dedicated gate", () => {
  withCopiedPlugin((pluginRoot) => {
    appendToEntrypoint(
      pluginRoot,
      "Invoke $optimize-cuebook-market-seo or $optimize-cuebook-market-geo.",
    );
    const result = validateSkillClosure(pluginRoot);
    assert.equal(result.errors.filter((error) => error.code === "RETIRED_SKILL_REF").length, 2);
    assert.ok(!codes(result).has("UNKNOWN_SKILL_REF"));
  });
});

test("retired skill directories cannot return to the package", () => {
  withCopiedPlugin((pluginRoot) => {
    fs.mkdirSync(path.join(pluginRoot, "skills", "optimize-cuebook-market-geo"));
    assert.ok(codes(validateSkillClosure(pluginRoot)).has("RETIRED_SKILL_DIR"));
  });
});
