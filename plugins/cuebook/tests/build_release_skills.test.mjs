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
    assert.equal(manifest.discovery_budget.public_skill_count, 2);
    assert.ok(manifest.discovery_budget.reduction_percent >= 60);
    assert.ok(manifest.frame_fast_preview_budget.within_budget);
    assert.ok(manifest.frame_fast_preview_budget.cumulative_bytes < 110_000);
    assert.ok(manifest.frame_publish_input_budget.within_budget);
    assert.ok(manifest.frame_publish_input_budget.cumulative_bytes < 40_000);
    assert.ok(!manifest.frame_fast_preview_budget.files.includes("assets/plugin/mcp-capability-map-v1.json"));
    assert.ok(manifest.frame_publish_input_budget.files.includes("assets/plugin/mcp-capability-map-v1.json"));
  });
});

test("release discovery exposes exactly two root Skills and ordinary internal modules", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    const releaseRoot = path.join(tmpPath, "release");
    const skillDocs = rglobMd(releaseRoot)
      .filter((candidate) => path.basename(candidate) === "SKILL.md")
      .map((candidate) => path.relative(releaseRoot, candidate))
      .sort();
    assert.deepEqual(skillDocs, [
      "create-cuebook-content/SKILL.md",
      "query-cuebook/SKILL.md",
    ]);
    for (const bundle of manifest.bundles) {
      const modulesRoot = path.join(releaseRoot, bundle.skill, "references", "modules");
      const moduleDocs = fs.readdirSync(modulesRoot)
        .filter((name) => name.endsWith(".md"));
      assert.equal(moduleDocs.length, bundle.bundled_internal_modules);
      for (const moduleDoc of moduleDocs) {
        const text = fs.readFileSync(path.join(modulesRoot, moduleDoc), "utf-8");
        assert.doesNotMatch(text, /^---\n/u);
        assert.match(text, /Generated internal module: not a public Agent Skill/u);
      }
      assert.ok(!fs.existsSync(path.join(releaseRoot, bundle.skill, "references", "skills")));
    }
  });
});

test("create bundle closure keeps the fast front door and query without mandatory intake", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    const create = manifest.bundles.find((bundle) => bundle.skill === "create-cuebook-content");
    assert.ok(create.closure.includes("query-cuebook"));
    assert.ok(create.closure.includes("direct-cuebook-viewpoint-visual"));
    assert.ok(!create.closure.includes("intake-cuebook-viewpoint"));
  });
});

test("create bundle keeps optional conversation heuristics before any price override", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    const interview = text.indexOf("## Conversation Heuristics");
    const skip = text.indexOf("closes Cue interviewing immediately", interview);
    const price = text.indexOf("Never ask merely because an interview section exists", interview);
    const completion = text.indexOf("## Optional New Angle", interview);
    assert.ok(interview >= 0, skillPath);
    assert.ok(skip > interview, skillPath);
    assert.ok(price > skip, skillPath);
    assert.ok(completion > price, skillPath);
    assert.match(text, /Ask for a price only when the creator explicitly requests a price-target override/u);
    assert.match(text, /requires no separate settlement interview/u);
    assert.match(text, /Omit the addition when no Cue adds material value/u);
    assert.match(text, /If the creator's request is already sufficient, continue without asking/u);
  });
});

test("heuristic interview covers each missing-link route without a generic checklist", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const builtEval = path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "evals",
      "heuristic_interview_cases.json",
    );
    const payload = JSON.parse(fs.readFileSync(builtEval, "utf-8"));
    const routes = [...new Set(payload.cases.map((item) => item.expected_heuristic))].sort();
    assert.deepEqual(routes, ["anomaly", "blind_spot", "causal_bridge", "next_footprint", "voice_lock", "why_now"]);
    assert.ok(payload.cases.every((item) => item.example_interview.includes("没有更多就按这个做")));
    const cueCases = payload.cases.filter((item) => Array.isArray(item.cue_scaffolds));
    assert.ok(cueCases.length >= 2);
    for (const item of cueCases) {
      assert.ok(item.cue_scaffolds.length > 0 && item.cue_scaffolds.length <= 2);
      assert.ok(item.cue_scaffolds.some((cue) => cue.relation === "aligned"));
      assert.ok(item.cue_scaffolds.some((cue) => ["contrasting", "adjacent"].includes(cue.relation)));
      assert.match(item.example_completion_check, /不加/u);
    }

    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    for (const route of routes) assert.match(text, new RegExp(`\\b${route}\\b`, "u"));
    assert.match(text, /Do not dump categories/u);
    assert.match(text, /list_asset_cues/u);
    assert.match(text, /at most two non-duplicative thought anchors/u);
    assert.match(text, /A source ref or popular Cue is not proof/u);
    assert.match(text, /Only adopted additions enter the confirmed draft/u);
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
      "modules",
      "render-cuebook-viewpoint-visual.md",
    );
    const text = fs.readFileSync(skillMd, "utf8");
    assert.match(text, /references\/modules\/direct-cuebook-viewpoint-visual\/assets\/cuebook-wordmark\.svg/u);
    assert.doesNotMatch(text, /SKILL\.md\/(?:assets|references|scripts)\//u);
    const resource = path.resolve(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references/modules/direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg",
    );
    assert.ok(fs.existsSync(resource), resource);
  });
});

test("vendored validators import without plugin tree", () => {
  withTmpPath((tmpPath) => {
    const bundled = [
      path.join(tmpPath, "release", "query-cuebook", "scripts", "validate_query_bundle"),
      path.join(
        tmpPath, "release", "create-cuebook-content", "scripts", "validate_frame_preview",
      ),
      path.join(
        tmpPath, "release", "create-cuebook-content", "scripts", "run_fast_preview",
      ),
    ];
    buildRelease(tmpPath);
    for (const stem of bundled) {
      const script = `${stem}.mjs`;
      const helper = path.join(path.dirname(script), "validate_json_schema.mjs");
      assert.ok(fs.existsSync(script), script);
      assert.ok(fs.existsSync(helper), path.dirname(script));
      const completed = spawnSync(process.execPath, [script, "--help"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          NODE_PATH: path.resolve(PLUGIN_ROOT, "..", "..", "node_modules"),
        },
      });
      // --help exit codes are not contractual; assert the vendored import
      // graph resolved instead.
      assert.ok(completed.status !== null, completed.stderr);
      assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package/.test(completed.stderr ?? ""), completed.stderr);
    }
  });
});

test("every bundled relative script import resolves, including the creator workflow example", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    assert.ok(!manifest.errors.some((error) => error.code === "BROKEN_SCRIPT_IMPORT"), JSON.stringify(manifest.errors));
    const script = path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references",
      "modules",
      "orchestrate-cuebook-creator-workflow",
      "scripts",
      "build_example_bundle.mjs",
    );
    const completed = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(new URL(`file://${script}`).href)})`], {
      encoding: "utf-8",
      env: {
        ...process.env,
        NODE_PATH: path.resolve(PLUGIN_ROOT, "..", "..", "node_modules"),
      },
    });
    assert.equal(completed.status, 0, completed.stderr);
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
