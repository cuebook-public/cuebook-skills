import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ReleasePreparationError,
  assertReleaseConsistent,
  collectReleaseIssues,
  prepareRelease,
} from "../scripts/prepare_release.mjs";

function json(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function text(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function fixture(root, { unreleased = "- Added one release feature." } = {}) {
  json(path.join(root, "package.json"), { name: "cuebook-skills", version: "0.6.0" });
  json(path.join(root, "package-lock.json"), {
    name: "cuebook-skills",
    version: "0.6.0",
    lockfileVersion: 3,
    packages: { "": { name: "cuebook-skills", version: "0.6.0" } },
  });
  json(path.join(root, "plugins/cuebook/assets/plugin-index-v1.json"), {
    plugin_version: "0.6.0",
    catalog_version: "1.29.0",
  });
  json(path.join(root, "plugins/cuebook/.codex-plugin/plugin.json"), {
    name: "cuebook",
    version: "0.6.0+codex.20260720133237",
  });
  json(path.join(root, "plugins/cuebook/.claude-plugin/plugin.json"), {
    name: "cuebook",
    version: "0.6.0",
  });
  json(path.join(root, ".claude-plugin/marketplace.json"), {
    name: "cuebook",
    plugins: [{ name: "cuebook", source: "./", version: "0.6.0", strict: false }],
  });
  text(
    path.join(root, "README.md"),
    "[Release v0.6.0](https://github.com/cuebook-public/cuebook-skills/releases/tag/v0.6.0)\nrelease-v0.6.0\n`--ref v0.6.0`\nnpm run release:prepare -- 0.6.0\n",
  );
  text(path.join(root, "plugins/cuebook/README.md"), "Use `--ref v0.6.0`.\n");
  text(path.join(root, "plugins/cuebook/platforms/codex.md"), "Pin `--ref v0.6.0`.\n");
  text(
    path.join(root, "plugins/cuebook/platforms/claude-code.md"),
    "Install `cuebook-public/cuebook-skills@v0.6.0`.\n",
  );
  text(
    path.join(root, "CHANGELOG.md"),
    `# Changelog\n\n## Unreleased\n\n${unreleased}\n\n## 0.6.0 — 2026-07-20\n\n- Previous release.\n`,
  );
}

function withFixture(options, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-release-version-"));
  try {
    fixture(root, options);
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("prepares every public version surface while preserving catalog version", () => {
  withFixture({}, (root) => {
    const result = prepareRelease(root, {
      version: "0.7.0",
      date: "2026-07-21",
      codexBuild: "20260721103045",
    });
    assert.equal(result.previous_version, "0.6.0");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version, "0.7.0");
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"))).packages[""].version, "0.7.0");
    const index = JSON.parse(fs.readFileSync(path.join(root, "plugins/cuebook/assets/plugin-index-v1.json")));
    assert.equal(index.plugin_version, "0.7.0");
    assert.equal(index.catalog_version, "1.29.0");
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "plugins/cuebook/.codex-plugin/plugin.json"))).version,
      "0.7.0+codex.20260721103045",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "plugins/cuebook/.claude-plugin/plugin.json"))).version,
      "0.7.0",
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/marketplace.json"))).plugins[0].version,
      "0.7.0",
    );
    assert.match(
      fs.readFileSync(path.join(root, "plugins/cuebook/platforms/claude-code.md"), "utf8"),
      /cuebook-skills@v0\.7\.0/u,
    );
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    assert.match(readme, /releases\/tag\/v0\.7\.0/u);
    assert.match(readme, /Release v0\.7\.0/u);
    assert.match(readme, /release-v0\.7\.0/u);
    assert.match(readme, /npm run release:prepare -- 0\.7\.0/u);
    assert.doesNotMatch(readme, /v0\.6\.0/u);
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    assert.match(changelog, /^## Unreleased\n\n## 0\.7\.0 — 2026-07-21$/mu);
    assert.match(changelog, /- Added one release feature\./u);
    assert.deepEqual(collectReleaseIssues(root), []);
    assert.deepEqual(assertReleaseConsistent(root), { valid: true, issues: [] });
  });
});

test("refuses a non-incrementing or unstable release version", () => {
  withFixture({}, (root) => {
    for (const version of ["0.6.0", "0.5.9", "0.7.0-beta.1", "v0.7.0"]) {
      assert.throws(
        () => prepareRelease(root, { version, date: "2026-07-21", codexBuild: "20260721103045" }),
        ReleasePreparationError,
      );
    }
  });
});

test("validates changelog notes before changing any file", () => {
  withFixture({ unreleased: "" }, (root) => {
    const packagePath = path.join(root, "package.json");
    const before = fs.readFileSync(packagePath, "utf8");
    assert.throws(
      () => prepareRelease(root, {
        version: "0.7.0",
        date: "2026-07-21",
        codexBuild: "20260721103045",
      }),
      /at least one release-note bullet/u,
    );
    assert.equal(fs.readFileSync(packagePath, "utf8"), before);
  });
});

test("release consistency detects pinned documentation and generated bundle drift", () => {
  withFixture({}, (root) => {
    json(path.join(root, "skills/release-manifest.json"), { plugin_version: "0.5.0" });
    text(path.join(root, "plugins/cuebook/README.md"), "Use `--ref v0.5.0`.\n");
    json(path.join(root, ".claude-plugin/marketplace.json"), {
      name: "cuebook",
      plugins: [{ name: "cuebook", source: "./", version: "0.5.0", strict: false }],
    });
    const issues = collectReleaseIssues(root);
    assert.ok(issues.some((issue) => issue.file === "plugins/cuebook/README.md"));
    assert.ok(issues.some((issue) => issue.file === "skills/release-manifest.json"));
    assert.ok(issues.some((issue) => issue.file === ".claude-plugin/marketplace.json"));
  });
});
