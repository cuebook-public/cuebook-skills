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
    assert.ok(!manifest.frame_publish_input_budget.files.includes("assets/plugin/mcp-capability-map-v1.json"));
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

test("create bundle closure keeps only the fast front door and query dependencies", () => {
  withTmpPath((tmpPath) => {
    const manifest = buildRelease(tmpPath);
    const create = manifest.bundles.find((bundle) => bundle.skill === "create-cuebook-content");
    assert.ok(create.closure.includes("query-cuebook"));
    assert.ok(!create.closure.includes("orchestrate-cuebook-creator-workflow"));
    assert.ok(!create.closure.includes("compile-cuebook-settlement-formula"));
    assert.ok(!create.closure.includes("direct-cuebook-viewpoint-visual"));
    assert.ok(!create.closure.includes("intake-cuebook-viewpoint"));
  });
});

test("release bundles exclude cross-repository compatibility goldens from runtime context", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    assert.equal(
      fs.existsSync(path.join(
        tmpPath,
        "release",
        "create-cuebook-content",
        "references",
        "skill-assembly-golden.json",
      )),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(
        tmpPath,
        "release",
        "create-cuebook-content",
        "scripts",
        "run_expression_lab.mjs",
      )),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(
        tmpPath,
        "release",
        "create-cuebook-content",
        "scripts",
        "validate_frame_draft_assembly.mjs",
      )),
      false,
    );
  });
});

test("runtime bundles omit the development capability catalog and old initial-publish route", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    for (const skill of ["query-cuebook", "create-cuebook-content"]) {
      assert.equal(fs.existsSync(path.join(
        tmpPath,
        "release",
        skill,
        "assets",
        "plugin",
        "mcp-capability-map-v1.json",
      )), false);
    }
    const workflow = fs.readFileSync(path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references",
      "frame-publish-workflow.md",
    ), "utf-8");
    assert.match(workflow, /Initial Publish: Three Steps/u);
    assert.match(workflow, /only completion call for a new Frame/u);
    assert.doesNotMatch(
      workflow,
      /`(?:complete_frame_media_upload|get_frame_media_status|register_frame_visual_manifest|create_frame_draft|get_frame_draft|update_frame_draft|prepare_frame_publish|publish_frame)`/u,
    );
  });
});

test("create bundle keeps bounded conversation heuristics before any price override", () => {
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
    assert.match(text, /Ask for a price only for an explicit price-target override/u);
    assert.match(text, /Derive zero-bps long\/short and relative rules/u);
    assert.match(text, /Omit the addition when no Cue adds material value/u);
    assert.match(text, /The default interview budget is one thought-anchor question/u);
    assert.match(text, /Never exceed two interview questions/u);
    assert.match(text, /does not start another Cuebook or Web read/u);
  });
});

test("create bundle polishes creator voice without semantic drift or another pass", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    const newAngle = text.indexOf("## Optional New Angle");
    const polish = text.indexOf("## Creator Voice Polish");
    const confirmation = text.indexOf("## Confirm The Expression Before Rendering");
    assert.ok(polish > newAngle, skillPath);
    assert.ok(confirmation > polish, skillPath);
    assert.match(text, /silently polish.*in the same drafting pass/u);
    assert.match(text, /never expose an audit or start another Tool, research, or model round/u);
    assert.match(text, /default the body to first person/u);
    assert.match(text, /one or two natural ownership markers/u);
    assert.match(text, /never expose bracketed evidence labels/iu);
    assert.match(text, /not visible taxonomy/u);
    assert.match(text, /Rewrite clusters of AI tells, not isolated words or punctuation/u);
    assert.match(text, /If polish changes meaning or attribution, restore the confirmed meaning/u);
  });
});

test("create bundle keeps terminal range creator-owned and visually explicit", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    assert.match(text, /`range` is distinct from neutral/iu);
    assert.match(text, /creator-confirmed `max_abs_move_bps`/u);
    assert.match(text, /never supply 3%, 5%, or any other preset/iu);
    assert.match(text, /whole-window barrier/iu);
    assert.match(text, /ASSET · RANGE ±X% · TO DATE/u);
    assert.match(text, /interim move outside the band followed by a return inside still hits/iu);
  });
});

test("create bundle turns relative language into a two-asset outperformance contract", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    assert.match(text, /Treat “A will beat B” as relative/u);
    assert.match(text, /equal-notional long A \/ short B/iu);
    assert.match(text, /return\(A\) - return\(B\)/u);
    assert.match(text, /Both may rise or fall/u);
    assert.match(text, /A > B · TO DATE/u);
    assert.match(text, /not two orders/u);
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
    assert.ok(payload.cases.every((item) => item.example_interview.toLowerCase().includes("if there is nothing more")));
    const cueCases = payload.cases.filter((item) => Array.isArray(item.cue_scaffolds));
    assert.ok(cueCases.length >= 2);
    for (const item of cueCases) {
      assert.ok(item.cue_scaffolds.length > 0 && item.cue_scaffolds.length <= 2);
      assert.ok(item.cue_scaffolds.some((cue) => cue.relation === "aligned"));
      assert.ok(item.cue_scaffolds.some((cue) => ["contrasting", "adjacent"].includes(cue.relation)));
      assert.match(item.example_completion_check, /keep|current version/iu);
    }

    const skillPath = path.join(tmpPath, "release", "create-cuebook-content", "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    for (const route of routes) assert.match(text, new RegExp(`\\b${route}\\b`, "u"));
    assert.match(text, /Do not dump categories/u);
    assert.match(text, /list_asset_cues/u);
    assert.match(text, /at most two non-duplicative thought anchors/u);
    assert.match(text, /A second and final question is allowed only when/u);
    assert.match(text, /never turn the follow-up into another research round/u);
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

test("minimal visual runtime resources resolve without their legacy module docs", () => {
  withTmpPath((tmpPath) => {
    buildRelease(tmpPath);
    const renderScript = path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "scripts",
      "render_market_expression.mjs",
    );
    const validateScript = path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "scripts",
      "validate_frame_preview.mjs",
    );
    assert.match(
      fs.readFileSync(renderScript, "utf8"),
      /references\/modules\/direct-cuebook-viewpoint-visual\/assets\/cuebook-wordmark\.svg/u,
    );
    assert.match(
      fs.readFileSync(validateScript, "utf8"),
      /references\/modules\/direct-cuebook-viewpoint-visual\/scripts\/capture_html_viewpoint\.cjs/u,
    );
    for (const resource of [
      "assets/cuebook-wordmark.svg",
      "scripts/capture_html_viewpoint.cjs",
    ]) {
      const target = path.resolve(
        tmpPath,
        "release",
        "create-cuebook-content",
        "references/modules/direct-cuebook-viewpoint-visual",
        resource,
      );
      assert.ok(fs.existsSync(target), target);
    }
    assert.ok(fs.existsSync(path.resolve(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references/modules/render-cuebook-thesis-chart/scripts/rasterize_thesis_chart.cjs",
    )));
    assert.equal(fs.existsSync(path.join(
      tmpPath,
      "release",
      "create-cuebook-content",
      "references/modules/direct-cuebook-viewpoint-visual.md",
    )), false);
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

test("advanced creator workflow scripts stay outside the runtime bundle", () => {
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
    assert.equal(fs.existsSync(script), false);
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
