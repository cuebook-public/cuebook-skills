#!/usr/bin/env node
// Build self-contained public skill bundles for generic Agent Skills clients.
//
// The source tree is a plugin: skills invoke each other with `$skill-name` and
// share plugin-level assets through `../../assets/...`. Generic clients that
// copy one skill directory would break those references, and clients that load
// every directory would pay startup metadata cost for internal capabilities.
//
// This builder packages each public entrypoint (`assets/plugin-index-v1.json`
// `public_entrypoints`) as one spec-conformant, self-contained skill:
//
// - the transitive `$skill-name` closure is bundled as non-discoverable
//   `references/modules/<name>.md` documents plus sibling resource directories;
// - referenced plugin assets are copied to `assets/plugin/` and paths rewritten;
// - `$skill-name` tokens are rewritten to bundle-root-relative module paths;
// - the shared `validate_json_schema.mjs` helper is vendored next to every
//   validator that imports it through the plugin-root scripts directory;
// - the result is checked against the Agent Skills format rules before writing
//   the release manifest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_REF_SOURCE = "\\.\\./\\.\\./assets/([A-Za-z0-9._/-]+)";
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;
// ESM shared-validator import used by plugin skill scripts.
const MJS_SHIM_IMPORT = "../../../scripts/validate_json_schema.mjs";
const MJS_SHIM_LOCAL = "./validate_json_schema.mjs";
const EXCLUDED_DIR_NAMES = new Set(["__pycache__", ".pytest_cache", "tests"]);
const MODULE_EXCLUDED_DIR_NAMES = new Set([...EXCLUDED_DIR_NAMES, "agents"]);
// Cross-repository compatibility fixtures remain in source control for tests,
// but are not runtime instructions and must not anchor creator behavior.
const EXCLUDED_RUNTIME_FILE_NAMES = new Set([
  "run_expression_lab.mjs",
  "skill-assembly-golden.json",
  "validate_frame_draft_assembly.mjs",
]);
const ENTRYPOINT_RUNTIME_RESOURCES = new Map([
  ["create-cuebook-content", [
    ["direct-cuebook-viewpoint-visual", "assets/cuebook-wordmark.svg"],
    ["direct-cuebook-viewpoint-visual", "scripts/audit_finished_bitmap.mjs"],
    ["direct-cuebook-viewpoint-visual", "scripts/capture_html_viewpoint.cjs"],
    ["direct-cuebook-viewpoint-visual", "scripts/stamp_cuebook_wordmark.mjs"],
    ["render-cuebook-thesis-chart", "scripts/rasterize_thesis_chart.cjs"],
  ]],
]);
const MODULE_RESOURCE_DIRS = "references|scripts|templates|assets|evals|tests";
const PUBLIC_SKILL_LIMIT = 2;
const MIN_DISCOVERY_REDUCTION_PERCENT = 60;
const FAST_PREVIEW_BYTE_LIMIT = 110_000;
const PUBLISH_LANE_BYTE_LIMIT = 40_000;
const FAST_PREVIEW_FILES = [
  "SKILL.md",
  "references/frame.schema.json",
  "references/frame-market-preview-job.schema.json",
  "references/frame-lens-preview-job.schema.json",
  "references/frame-expression-system.md",
  "references/frame-art-direction.md",
  "references/frame-feed-attention.md",
  "references/modules/query-cuebook.md",
  "references/modules/query-cuebook/references/cuebook-query-request-v1.schema.json",
  "references/modules/query-cuebook/references/cuebook-query-bundle-v1.schema.json",
];
const PUBLISH_LANE_FILES = [
  "references/frame-publish-workflow.md",
];

export function issue(code, issuePath, message) {
  return { code, path: issuePath, message };
}

function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// Recursive glob for files with the given suffix, sorted by full path like
// Python's sorted(Path.rglob(...)).
function rglob(root, suffix) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith(suffix)) found.push(target);
    }
  };
  walk(root);
  return found.sort();
}

export function copySkillDir(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: (src) => (
      !EXCLUDED_DIR_NAMES.has(path.basename(src))
      && !EXCLUDED_RUNTIME_FILE_NAMES.has(path.basename(src))
      && !/\.test\.(?:mjs|cjs)$/u.test(path.basename(src))
    ),
  });
}

export function copyModuleResources(source, target) {
  const sourceSkill = path.resolve(source, "SKILL.md");
  fs.cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: (src) => (
      path.resolve(src) !== sourceSkill
      && !MODULE_EXCLUDED_DIR_NAMES.has(path.basename(src))
      && !EXCLUDED_RUNTIME_FILE_NAMES.has(path.basename(src))
      && !/\.test\.(?:mjs|cjs)$/u.test(path.basename(src))
    ),
  });
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function skillRefPattern(skillNames) {
  const alternatives = [...skillNames]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`\\$(${alternatives})\\b`, "g");
}

export function skillResourceRefPattern(skillNames) {
  const alternatives = [...skillNames]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`\\$(${alternatives})/((?:${MODULE_RESOURCE_DIRS})/[A-Za-z0-9][A-Za-z0-9._/@+%-]*)`, "g");
}

export function findClosure(pluginRoot, entry, skillNames) {
  const pattern = skillRefPattern(skillNames);
  const explicitRuntimeResources = new Set(
    (ENTRYPOINT_RUNTIME_RESOURCES.get(entry) ?? []).map(([skill, resource]) => `${skill}/${resource}`),
  );
  const seen = [];
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    if (seen.includes(current)) continue;
    seen.push(current);
    for (const md of rglob(path.join(pluginRoot, "skills", current), ".md")) {
      for (const match of fs.readFileSync(md, "utf-8").matchAll(pattern)) {
        if (!seen.includes(match[1])) queue.push(match[1]);
      }
    }
    // A bundled script can import a sibling capability without spelling its
    // public Skill token in Markdown. Keep that executable closure alongside
    // the prose closure so a self-contained release cannot ship a latent
    // ERR_MODULE_NOT_FOUND.
    const currentRoot = path.join(pluginRoot, "skills", current);
    const scriptFiles = [
      ...rglob(currentRoot, ".mjs"),
      ...rglob(currentRoot, ".cjs"),
      ...rglob(currentRoot, ".js"),
    ];
    for (const script of scriptFiles) {
      const text = fs.readFileSync(script, "utf-8");
      const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](\.\.?\/[^"']+)["']/gu;
      for (const match of text.matchAll(importPattern)) {
        const resolved = path.resolve(path.dirname(script), match[1]);
        const relative = path.relative(path.join(pluginRoot, "skills"), resolved);
        const portableRelative = relative.split(path.sep).join("/");
        const importedSkill = relative.split(path.sep)[0];
        if (
          skillNames.has(importedSkill)
          && !explicitRuntimeResources.has(portableRelative)
          && !seen.includes(importedSkill)
        ) queue.push(importedSkill);
      }
    }
  }
  return seen;
}

export function writeModuleDoc(sourceSkill, target, moduleName) {
  const raw = fs.readFileSync(sourceSkill, "utf-8");
  let body = raw.replace(FRONTMATTER_PATTERN, "").trimStart();
  body = body
    .split("\n")
    .filter((line) => (
      !/`tests\//u.test(line)
      && !/`scripts\/[^`]+\.test\.(?:mjs|cjs)`/u.test(line)
    ))
    .join("\n");
  const localResourcePattern = new RegExp(
    `(?<![/A-Za-z0-9._@+%-])(${MODULE_RESOURCE_DIRS})/`,
    "g",
  );
  body = body.replace(
    localResourcePattern,
    `references/modules/${moduleName}/$1/`,
  );
  const note = [
    "<!-- Generated internal module: not a public Agent Skill. -->",
    `> Module resources are rooted at \`references/modules/${moduleName}/\` from the public Skill directory.`,
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${note}${body}`);
}

const relativeToBundle = (bundleRoot, target) => (
  path.relative(bundleRoot, target).split(path.sep).join("/")
);

export function rewriteMarkdown(md, bundleRoot, skillNames, usedAssets) {
  let text = fs.readFileSync(md, "utf-8");

  text = text.replace(new RegExp(ASSET_REF_SOURCE, "g"), (_match, asset) => {
    usedAssets.add(asset);
    return relativeToBundle(bundleRoot, path.join(bundleRoot, "assets", "plugin", asset));
  });
  text = text.replace(skillResourceRefPattern(skillNames), (_match, name, resource) => {
    const moduleRoot = name === path.basename(bundleRoot)
      ? bundleRoot
      : path.join(bundleRoot, "references", "modules", name);
    return relativeToBundle(bundleRoot, path.join(moduleRoot, resource));
  });
  text = text.replace(skillRefPattern(skillNames), (_match, name) => {
    if (name === path.basename(bundleRoot)) {
      return "SKILL.md";
    }
    return relativeToBundle(
      bundleRoot,
      path.join(bundleRoot, "references", "modules", `${name}.md`),
    );
  });
  fs.writeFileSync(md, text);
}

// Vendor the shared validator next to a bundled ESM script and rewrite the
// plugin-root import to load the sibling copy.
export function vendorSharedValidator(script, sharedHelper) {
  let text = fs.readFileSync(script, "utf-8");
  if (!text.includes(MJS_SHIM_IMPORT)) return false;
  text = text.replaceAll(MJS_SHIM_IMPORT, MJS_SHIM_LOCAL);
  fs.writeFileSync(script, text);
  fs.copyFileSync(sharedHelper, path.join(path.dirname(script), path.basename(sharedHelper)));
  return true;
}

// Public entrypoint scripts live one directory shallower than they did in the
// plugin tree. Rewrite direct sibling-skill imports into the vendored closure.
export function rewriteEntrypointSkillImports(script, bundleRoot, skillNames) {
  if (path.dirname(script) !== path.join(bundleRoot, "scripts")) return false;
  let text = fs.readFileSync(script, "utf-8");
  const original = text;
  text = text.replace(/(["'])\.\.\/\.\.\/([a-z0-9]+(?:-[a-z0-9]+)*)\//g, (match, quote, skillName) => {
    if (!skillNames.has(skillName) || skillName === path.basename(bundleRoot)) return match;
    return `${quote}../references/modules/${skillName}/`;
  });
  if (text === original) return false;
  fs.writeFileSync(script, text);
  return true;
}

export function parseFrontmatter(skillMd) {
  const match = fs.readFileSync(skillMd, "utf-8").match(FRONTMATTER_PATTERN);
  if (!match) return {};
  const fields = {};
  for (const line of match[1].split("\n")) {
    if (![" ", "\t", "#"].includes(line.slice(0, 1)) && line.includes(":")) {
      const separator = line.indexOf(":");
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return fields;
}

export function checkBundle(bundleRoot, skillNames) {
  const errors = [];
  const bundleName = path.basename(bundleRoot);
  const front = parseFrontmatter(path.join(bundleRoot, "SKILL.md"));
  const name = front.name ?? "";
  const description = front.description ?? "";
  const discoveredSkillDocs = rglob(bundleRoot, "SKILL.md")
    .filter((candidate) => path.basename(candidate) === "SKILL.md");
  if (
    discoveredSkillDocs.length !== 1
    || path.resolve(discoveredSkillDocs[0] ?? "") !== path.resolve(bundleRoot, "SKILL.md")
  ) {
    errors.push(issue(
      "NESTED_SKILL_DISCOVERY",
      bundleName,
      "A public bundle must contain exactly one root SKILL.md; internal capabilities are module documents.",
    ));
  }
  if (name !== bundleName) {
    errors.push(issue("BUNDLE_NAME", `${bundleName}/SKILL.md`, "Frontmatter name must match the bundle directory."));
  }
  if (!/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(name || "-")) {
    errors.push(issue("BUNDLE_NAME_FORMAT", `${bundleName}/SKILL.md`, "Name must be lowercase alphanumerics and single hyphens."));
  }
  const descriptionLength = [...description].length;
  if (!(descriptionLength >= 1 && descriptionLength <= 1024)) {
    errors.push(issue("BUNDLE_DESCRIPTION", `${bundleName}/SKILL.md`, "Description must be 1-1024 characters."));
  }
  const refPattern = skillRefPattern(skillNames);
  for (const md of rglob(bundleRoot, ".md")) {
    const rel = path.relative(bundleRoot, md);
    const text = fs.readFileSync(md, "utf-8");
    if (/\.\.\/\.\.\/assets\/(?!plugin\/)/.test(text)) {
      errors.push(issue("UNRESOLVED_ASSET_REF", `${bundleName}/${rel}`, "Bundle still references plugin-level assets."));
    }
    if (text.search(refPattern) !== -1) {
      errors.push(issue("UNRESOLVED_SKILL_REF", `${bundleName}/${rel}`, "Bundle still contains a $skill-name invocation token."));
    }
    if (/SKILL\.md\/(?:references|scripts|templates|assets|evals|tests)\//u.test(text)) {
      errors.push(issue("BROKEN_SKILL_RESOURCE_REF", `${bundleName}/${rel}`, "Bundle resource path incorrectly descends through SKILL.md."));
    }
    if (/references\/skills\//u.test(text)) {
      errors.push(issue("LEGACY_SKILL_NEST", `${bundleName}/${rel}`, "Internal capabilities must use references/modules, never references/skills."));
    }
    const targetPattern = /\]\((?!https?:\/\/|mailto:)([^)#\s]+)/g;
    for (const match of text.matchAll(targetPattern)) {
      const target = path.resolve(path.dirname(md), match[1]);
      if (!fs.existsSync(target)) {
        errors.push(issue("BROKEN_LINK", `${bundleName}/${rel}`, `Linked file does not exist: ${match[1]}`));
      }
    }
  }
  const scriptFiles = [
    ...rglob(bundleRoot, ".mjs"),
    ...rglob(bundleRoot, ".cjs"),
    ...rglob(bundleRoot, ".js"),
  ];
  for (const script of scriptFiles) {
    const rel = path.relative(bundleRoot, script);
    const text = fs.readFileSync(script, "utf-8");
    const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["'](\.\.?\/[^"']+)["']/gu;
    for (const match of text.matchAll(importPattern)) {
      const requested = match[1];
      const target = path.resolve(path.dirname(script), requested);
      const candidates = [
        target,
        `${target}.mjs`,
        `${target}.cjs`,
        `${target}.js`,
        `${target}.json`,
        path.join(target, "index.mjs"),
        path.join(target, "index.cjs"),
        path.join(target, "index.js"),
      ];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        errors.push(issue(
          "BROKEN_SCRIPT_IMPORT",
          `${bundleName}/${rel}`,
          `Relative script import does not exist: ${requested}`,
        ));
      }
    }
  }
  return errors;
}

function metadataBytes(skillDocs) {
  return skillDocs.reduce((total, skillDoc) => {
    const front = parseFrontmatter(skillDoc);
    return total + Buffer.byteLength(`${front.name ?? ""}\n${front.description ?? ""}\n`, "utf-8");
  }, 0);
}

function buildDiscoveryBudget(pluginRoot, outputDir, entrypoints, errors) {
  const legacySkillDocs = rglob(path.join(pluginRoot, "skills"), "SKILL.md")
    .filter((candidate) => path.basename(candidate) === "SKILL.md");
  const publicSkillDocs = rglob(outputDir, "SKILL.md")
    .filter((candidate) => path.basename(candidate) === "SKILL.md");
  const expected = entrypoints
    .map((entry) => path.resolve(outputDir, entry, "SKILL.md"))
    .sort();
  const actual = publicSkillDocs.map((candidate) => path.resolve(candidate)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(issue(
      "PUBLIC_SKILL_SURFACE",
      path.relative(pluginRoot, outputDir) || ".",
      `Release discovery must expose only ${entrypoints.join(" and ")}.`,
    ));
  }
  if (entrypoints.length !== PUBLIC_SKILL_LIMIT || publicSkillDocs.length !== PUBLIC_SKILL_LIMIT) {
    errors.push(issue(
      "PUBLIC_SKILL_COUNT",
      path.relative(pluginRoot, outputDir) || ".",
      `Codex release surface must contain exactly ${PUBLIC_SKILL_LIMIT} public Skills.`,
    ));
  }
  const legacyBytes = metadataBytes(legacySkillDocs);
  const publicBytes = metadataBytes(publicSkillDocs);
  const reductionPercent = legacyBytes === 0
    ? 0
    : Number(((1 - (publicBytes / legacyBytes)) * 100).toFixed(1));
  if (reductionPercent < MIN_DISCOVERY_REDUCTION_PERCENT) {
    errors.push(issue(
      "DISCOVERY_INPUT_BUDGET",
      path.relative(pluginRoot, outputDir) || ".",
      `Public discovery metadata must fall by at least ${MIN_DISCOVERY_REDUCTION_PERCENT}%.`,
    ));
  }
  return {
    legacy_skill_count: legacySkillDocs.length,
    public_skill_count: publicSkillDocs.length,
    legacy_metadata_bytes: legacyBytes,
    public_metadata_bytes: publicBytes,
    reduction_percent: reductionPercent,
    minimum_reduction_percent: MIN_DISCOVERY_REDUCTION_PERCENT,
  };
}

function buildInputBudget(outputDir, errors, { files, limit, code, label }) {
  const bundleRoot = path.join(outputDir, "create-cuebook-content");
  let cumulativeBytes = 0;
  for (const relativePath of files) {
    const target = path.join(bundleRoot, relativePath);
    if (!fs.existsSync(target)) {
      errors.push(issue(
        `${code}_FILE`,
        `create-cuebook-content/${relativePath}`,
        `${label} instruction or contract file is missing.`,
      ));
      continue;
    }
    cumulativeBytes += fs.statSync(target).size;
  }
  if (cumulativeBytes >= limit) {
    errors.push(issue(
      code,
      "create-cuebook-content",
      `${label} instruction and contract set must remain below ${limit} bytes.`,
    ));
  }
  return {
    files,
    cumulative_bytes: cumulativeBytes,
    maximum_bytes_exclusive: limit,
    within_budget: cumulativeBytes < limit,
  };
}

function buildFastPreviewBudget(outputDir, errors) {
  return buildInputBudget(outputDir, errors, {
    files: FAST_PREVIEW_FILES,
    limit: FAST_PREVIEW_BYTE_LIMIT,
    code: "FAST_PREVIEW_INPUT_BUDGET",
    label: "Fast-preview",
  });
}

function buildPublishLaneBudget(outputDir, errors) {
  return buildInputBudget(outputDir, errors, {
    files: PUBLISH_LANE_FILES,
    limit: PUBLISH_LANE_BYTE_LIMIT,
    code: "PUBLISH_LANE_INPUT_BUDGET",
    label: "On-demand publish-lane",
  });
}

export function build(pluginRootArg, outputDirArg) {
  const pluginRoot = path.resolve(pluginRootArg);
  const outputDir = path.resolve(outputDirArg);
  const index = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, "assets", "plugin-index-v1.json"), "utf-8"),
  );
  const entrypoints = [...(index.public_entrypoints ?? [])];
  const skillNames = new Set(
    fs.readdirSync(path.join(pluginRoot, "skills")).filter((name) => isDir(path.join(pluginRoot, "skills", name))),
  );
  const sharedHelper = path.join(pluginRoot, "scripts", "validate_json_schema.mjs");
  const errors = [];
  const bundles = [];

  for (const entry of entrypoints) {
    if (!skillNames.has(entry)) {
      errors.push(issue("UNKNOWN_ENTRYPOINT", entry, "Public entrypoint has no skill directory."));
      continue;
    }
    const bundleRoot = path.join(outputDir, entry);
    if (fs.existsSync(bundleRoot)) {
      fs.rmSync(bundleRoot, { recursive: true });
    }
    const closure = findClosure(pluginRoot, entry, skillNames);
    copySkillDir(path.join(pluginRoot, "skills", entry), bundleRoot);
    for (const member of closure.slice(1)) {
      const source = path.join(pluginRoot, "skills", member);
      const modulesRoot = path.join(bundleRoot, "references", "modules");
      copyModuleResources(source, path.join(modulesRoot, member));
      writeModuleDoc(
        path.join(source, "SKILL.md"),
        path.join(modulesRoot, `${member}.md`),
        member,
      );
    }
    const runtimeResources = [];
    for (const [member, resource] of ENTRYPOINT_RUNTIME_RESOURCES.get(entry) ?? []) {
      const source = path.join(pluginRoot, "skills", member, resource);
      const target = path.join(bundleRoot, "references", "modules", member, resource);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      runtimeResources.push(`${member}/${resource}`);
    }

    const usedAssets = new Set();
    for (const md of rglob(bundleRoot, ".md")) {
      rewriteMarkdown(md, bundleRoot, skillNames, usedAssets);
    }
    for (const asset of [...usedAssets].sort()) {
      const source = path.join(pluginRoot, "assets", asset);
      const target = path.join(bundleRoot, "assets", "plugin", asset);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    const vendored = [];
    for (const script of rglob(bundleRoot, ".mjs")) {
      rewriteEntrypointSkillImports(script, bundleRoot, skillNames);
      if (vendorSharedValidator(script, sharedHelper)) {
        vendored.push(path.relative(bundleRoot, script));
      }
    }
    vendored.sort();
    const bundleErrors = checkBundle(bundleRoot, skillNames);
    errors.push(...bundleErrors);
    bundles.push({
      skill: entry,
      closure,
      bundled_internal_modules: closure.length - 1,
      bundled_runtime_resources: runtimeResources,
      plugin_assets: [...usedAssets].sort(),
      vendored_shared_validators: vendored,
      valid: !bundleErrors.length,
    });
  }

  const discoveryBudget = buildDiscoveryBudget(pluginRoot, outputDir, entrypoints, errors);
  const fastPreviewBudget = buildFastPreviewBudget(outputDir, errors);
  const publishLaneBudget = buildPublishLaneBudget(outputDir, errors);

  const manifest = {
    schema_version: "cuebook-release-skills-manifest-v2",
    catalog_version: index.catalog_version ?? null,
    plugin_version: index.plugin_version ?? null,
    discovery_budget: discoveryBudget,
    frame_fast_preview_budget: fastPreviewBudget,
    frame_publish_input_budget: publishLaneBudget,
    bundles,
    valid: !errors.length,
    errors,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "release-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((arg) => arg.startsWith("-"))) {
    process.stderr.write("usage: build_release_skills.mjs plugin_root output_dir\n");
    process.exit(2);
  }
  const manifest = build(args[0], args[1]);
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.exit(manifest.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main();
}
