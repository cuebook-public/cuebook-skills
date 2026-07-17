import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, parseFrontmatter, skillRefPattern } from "../scripts/build_release_skills.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTmpPath(fn) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-release-test-"));
  try {
    return fn(tmpPath);
  } finally {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

function buildRelease(tmpPath) {
  return build(PLUGIN_ROOT, path.join(tmpPath, "release"));
}

function rglobMd(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith(".md")) found.push(target);
    }
  };
  walk(root);
  return found;
}

test("builds every public entrypoint as valid bundle", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    assert.ok(manifest.valid, JSON.stringify(manifest.errors));
    const built = new Set(manifest.bundles.map((bundle) => bundle.skill));
    assert.deepEqual(built, new Set(["query-cuebook", "create-cuebook-content"]));
    assert.ok(manifest.bundles.every((bundle) => bundle.valid));
  });
});

test("create bundle closure includes front door and query", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    const create = manifest.bundles.find((bundle) => bundle.skill === "create-cuebook-content");
    assert.ok(create.closure.includes("intake-cuebook-viewpoint"));
    assert.ok(create.closure.includes("query-cuebook"));
  });
});

test("bundles contain no plugin-level references", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    const skillNames = new Set(
      fs
        .readdirSync(path.join(PLUGIN_ROOT, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
    const pattern = skillRefPattern(skillNames);
    for (const bundle of manifest.bundles) {
      const bundleRoot = path.join(tmpPath, "release", bundle.skill);
      for (const md of rglobMd(bundleRoot)) {
        const text = fs.readFileSync(md, "utf-8");
        assert.ok(!/\.\.\/\.\.\/assets\/(?!plugin\/)/.test(text), md);
        assert.ok(text.search(pattern) === -1, md);
        assert.ok(!/SKILL\.md\/(?:assets|references|scripts)\//u.test(text), md);
      }
    }
  });
});

test("cross-skill resource references resolve inside bundled skill directories", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const skillMd = path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references",
      "skills",
      "render-cuebook-viewpoint-visual",
      "SKILL.md",
    );
    const text = fs.readFileSync(skillMd, "utf8");
    assert.match(text, /\.\.\/direct-cuebook-viewpoint-visual\/assets\/cuebook-wordmark\.svg/u);
    assert.doesNotMatch(text, /SKILL\.md\/(?:assets|references|scripts)\//u);
    const resource = path.resolve(path.dirname(skillMd), "../direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg");
    assert.ok(fs.existsSync(resource), resource);
  });
});

test("vendored validators import without plugin tree", () => {
  withTmpPath((tmpPath) => {
    const bundled = [
      path.join(tmpPath, "release", "query-cuebook", "scripts", "validate_query_bundle"),
      path.join(
        tmpPath, "release", "create-cuebook-content", "references", "skills",
        "intake-cuebook-viewpoint", "scripts", "validate_viewpoint_intake",
      ),
    ];
    buildRelease(tmpPath);
    for (const stem of bundled) {
      const script = `${stem}.mjs`;
      const helper = path.join(path.dirname(script), "validate_json_schema.mjs");
      assert.ok(fs.existsSync(script), script);
      assert.ok(fs.existsSync(helper), path.dirname(script));
      const completed = spawnSync(process.execPath, [script, "--help"], { encoding: "utf-8" });
      // --help exit codes are not contractual; assert the vendored import
      // graph resolved instead.
      assert.ok(completed.status !== null, completed.stderr);
      assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/.test(completed.stderr ?? ""), completed.stderr);
    }
  });
});

test("bundle frontmatter follows agent skills spec", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    for (const name of ["query-cuebook", "create-cuebook-content"]) {
      const front = parseFrontmatter(path.join(tmpPath, "release", name, "SKILL.md"));
      assert.equal(front.name, name);
      assert.ok(front.description.length >= 1 && front.description.length <= 1024);
      assert.ok(front.license);
      assert.ok(front.compatibility);
    }
  });
});
