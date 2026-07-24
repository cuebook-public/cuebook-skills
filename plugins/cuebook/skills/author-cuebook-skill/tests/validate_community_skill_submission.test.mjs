import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DESCRIPTION_CHARS,
  MAX_PACKAGE_FILES,
  MAX_SUMMARY_CHARS,
  MAX_ZIP_BYTES,
  validateSubmission,
} from "../scripts/validate_community_skill_submission.mjs";

function baseSubmission() {
  return {
    schema_version: "community-skill-submission-v1",
    creator_handle: "vito",
    package: {
      files: [
        { path: "SKILL.md", bytes: 2048 },
        { path: "references/playbook.md", bytes: 4096 },
        { path: "references/levels.json", bytes: 512 },
      ],
      zip_bytes: 8192,
      zip_sha256: "a".repeat(64),
    },
    manifest: {
      slug: "breakout-playbook",
      display_name: "Breakout Playbook",
      summary: "A structured breakout checklist for session opens.",
      description: "Walks a creator through a breakout checklist before they commit a view.",
      version: "1.0.0",
      declared_tier: "t1",
      tier_reasoning: "References Cuebook read tools only.",
      license: "MIT",
    },
    confirmation: { card_confirmed: true, confirmed_at: "2026-07-24T09:00:00Z" },
  };
}

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

test("valid submission record passes with stats", () => {
  const result = validateSubmission(baseSubmission());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.stats, {
    file_count: 3,
    zip_bytes: 8192,
    declared_tier: "t1",
    slug: "breakout-playbook",
  });
});

test("exported limits match the package contract", () => {
  assert.equal(MAX_PACKAGE_FILES, 40);
  assert.equal(MAX_ZIP_BYTES, 524_288);
  assert.equal(MAX_SUMMARY_CHARS, 280);
  assert.equal(MAX_DESCRIPTION_CHARS, 1024);
});

test("missing root SKILL.md is rejected", () => {
  const payload = baseSubmission();
  payload.package.files = payload.package.files.filter((file) => file.path !== "SKILL.md");
  assert.ok(codes(validateSubmission(payload)).has("PACKAGE_SKILL_DOC"));
});

test("a second SKILL.md outside the root is rejected as shape, nested SKILL.md included", () => {
  const payload = baseSubmission();
  payload.package.files.push({ path: "docs/SKILL.md", bytes: 10 });
  assert.ok(codes(validateSubmission(payload)).has("PACKAGE_PATH_SHAPE"));
});

test("scripts, binaries, and images are rejected", () => {
  for (const path of ["scripts/run.mjs", "references/logo.png", "references/tool.py", "SKILL.md.bak"]) {
    const payload = baseSubmission();
    payload.package.files.push({ path, bytes: 10 });
    assert.ok(codes(validateSubmission(payload)).has("PACKAGE_PATH_SHAPE"), path);
  }
});

test("path escapes are rejected before shape checks", () => {
  const cases = [
    ["references/../secrets.md", "PACKAGE_PATH_ESCAPE"],
    ["references//double.md", "PACKAGE_PATH_ESCAPE"],
    ["/etc/passwd", "PACKAGE_PATH_ABSOLUTE"],
    ["references\\windows.md", "PACKAGE_PATH_SEPARATOR"],
  ];
  for (const [path, expected] of cases) {
    const payload = baseSubmission();
    payload.package.files.push({ path, bytes: 10 });
    assert.ok(codes(validateSubmission(payload)).has(expected), path);
  }
});

test("duplicate and case-fold-colliding paths are rejected", () => {
  const duplicated = baseSubmission();
  duplicated.package.files.push({ path: "references/playbook.md", bytes: 1 });
  assert.ok(codes(validateSubmission(duplicated)).has("PACKAGE_PATH_DUPLICATE"));

  const folded = baseSubmission();
  folded.package.files.push({ path: "references/Playbook.md", bytes: 1 });
  const result = validateSubmission(folded);
  assert.ok(codes(result).has("PACKAGE_PATH_CASEFOLD"));
  assert.ok(!codes(result).has("PACKAGE_PATH_DUPLICATE"));
});

test("file count above the cap is rejected by the schema", () => {
  const payload = baseSubmission();
  for (let index = 0; index < MAX_PACKAGE_FILES; index += 1) {
    payload.package.files.push({ path: `references/extra-${index}.md`, bytes: 1 });
  }
  assert.ok(codes(validateSubmission(payload)).has("SCHEMA_MAX_ITEMS"));
});

test("zip size above 512 KiB is rejected", () => {
  const payload = baseSubmission();
  payload.package.zip_bytes = MAX_ZIP_BYTES + 1;
  assert.ok(codes(validateSubmission(payload)).has("PACKAGE_ZIP_SIZE"));
});

test("zip hash must be 64 lowercase hex characters", () => {
  const payload = baseSubmission();
  payload.package.zip_sha256 = "A".repeat(64);
  assert.ok(codes(validateSubmission(payload)).has("SCHEMA_PATTERN"));
});

test("slug rules reject short, uppercase, and double-hyphen slugs", () => {
  for (const slug of ["ab", "Breakout", "breakout--playbook", "-breakout", "breakout-", "a".repeat(41)]) {
    const payload = baseSubmission();
    payload.manifest.slug = slug;
    assert.ok(codes(validateSubmission(payload)).has("SCHEMA_PATTERN"), slug);
  }
});

test("summary and description length caps are enforced", () => {
  const longSummary = baseSubmission();
  longSummary.manifest.summary = "s".repeat(MAX_SUMMARY_CHARS + 1);
  assert.ok(codes(validateSubmission(longSummary)).has("MANIFEST_SUMMARY_LENGTH"));

  const longDescription = baseSubmission();
  longDescription.manifest.description = "d".repeat(MAX_DESCRIPTION_CHARS + 1);
  assert.ok(codes(validateSubmission(longDescription)).has("MANIFEST_DESCRIPTION_LENGTH"));
});

test("version must be plain semver", () => {
  for (const version of ["1.0", "v1.0.0", "1.0.0-beta.1", "01.0.0"]) {
    const payload = baseSubmission();
    payload.manifest.version = version;
    assert.ok(codes(validateSubmission(payload)).has("SCHEMA_PATTERN"), version);
  }
});

test("declared tier and license stay inside their closed sets", () => {
  const tier = baseSubmission();
  tier.manifest.declared_tier = "t3";
  assert.ok(codes(validateSubmission(tier)).has("SCHEMA_ENUM"));

  const license = baseSubmission();
  license.manifest.license = "GPL-3.0";
  assert.ok(codes(validateSubmission(license)).has("SCHEMA_ENUM"));
});

test("an unconfirmed card blocks the submission record", () => {
  const payload = baseSubmission();
  payload.confirmation.card_confirmed = false;
  assert.ok(codes(validateSubmission(payload)).has("CARD_NOT_CONFIRMED"));
});

test("unknown fields are rejected", () => {
  const payload = baseSubmission();
  payload.manifest.homepage = "https://example.com";
  assert.ok(codes(validateSubmission(payload)).has("SCHEMA_ADDITIONAL_PROPERTY"));
});
