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
// - the transitive `$skill-name` closure is bundled under `references/skills/`;
// - referenced plugin assets are copied to `assets/plugin/` and paths rewritten;
// - `$skill-name` tokens are rewritten to bundle-relative SKILL.md paths;
// - the shared `validate_json_schema.mjs` helper is vendored next to every
//   validator that imports it through the plugin-root scripts directory
//   (legacy `validate_json_schema.py` sys.path shims are vendored the same
//   way while the .py -> .mjs migration is in flight);
// - the result is checked against the Agent Skills format rules before writing
//   the release manifest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSET_REF_SOURCE = "\\.\\./\\.\\./assets/([A-Za-z0-9._/-]+)";
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n/;
// Legacy Python shared-validator shim (still handled while .py sources exist).
const PLUGIN_SHIM_ROOT = "PLUGIN_ROOT = Path(__file__).resolve().parents[3]";
const PLUGIN_SHIM_INSERT = 'sys.path.insert(0, str(PLUGIN_ROOT / "scripts"))';
// ESM shared-validator import used by plugin skill scripts.
const MJS_SHIM_IMPORT = "../../../scripts/validate_json_schema.mjs";
const MJS_SHIM_LOCAL = "./validate_json_schema.mjs";
const EXCLUDED_DIR_NAMES = new Set(["__pycache__", ".pytest_cache"]);

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
    filter: (src) => !EXCLUDED_DIR_NAMES.has(path.basename(src)),
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

export function findClosure(pluginRoot, entry, skillNames) {
  const pattern = skillRefPattern(skillNames);
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
  }
  return seen;
}

export function rewriteMarkdown(md, bundleRoot, skillNames, usedAssets) {
  let text = fs.readFileSync(md, "utf-8");
  const base = path.dirname(md);

  text = text.replace(new RegExp(ASSET_REF_SOURCE, "g"), (_match, asset) => {
    usedAssets.add(asset);
    return path.relative(base, path.join(bundleRoot, "assets", "plugin", asset));
  });
  text = text.replace(skillRefPattern(skillNames), (_match, name) => {
    if (name === path.basename(bundleRoot)) {
      return path.relative(base, path.join(bundleRoot, "SKILL.md"));
    }
    return path.relative(base, path.join(bundleRoot, "references", "skills", name, "SKILL.md"));
  });
  fs.writeFileSync(md, text);
}

// Vendor the shared validator next to a bundled script. `.py` scripts use the
// legacy sys.path shim; `.mjs` scripts import the shared module relative to
// the plugin root. Both are rewritten to load the vendored sibling copy.
export function vendorSharedValidator(script, sharedHelper) {
  let text = fs.readFileSync(script, "utf-8");
  if (script.endsWith(".py")) {
    if (!text.includes(PLUGIN_SHIM_ROOT)) return false;
    text = text.replaceAll(PLUGIN_SHIM_ROOT, "PLUGIN_ROOT = Path(__file__).resolve().parent");
    text = text.replaceAll(PLUGIN_SHIM_INSERT, "sys.path.insert(0, str(PLUGIN_ROOT))");
  } else {
    if (!text.includes(MJS_SHIM_IMPORT)) return false;
    text = text.replaceAll(MJS_SHIM_IMPORT, MJS_SHIM_LOCAL);
  }
  fs.writeFileSync(script, text);
  fs.copyFileSync(sharedHelper, path.join(path.dirname(script), path.basename(sharedHelper)));
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
    const targetPattern = /\]\((?!https?:\/\/|mailto:)([^)#\s]+)/g;
    for (const match of text.matchAll(targetPattern)) {
      const target = path.resolve(path.dirname(md), match[1]);
      if (!fs.existsSync(target)) {
        errors.push(issue("BROKEN_LINK", `${bundleName}/${rel}`, `Linked file does not exist: ${match[1]}`));
      }
    }
  }
  return errors;
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
  const sharedHelpers = {
    ".py": path.join(pluginRoot, "scripts", "validate_json_schema.py"),
    ".mjs": path.join(pluginRoot, "scripts", "validate_json_schema.mjs"),
  };
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
      copySkillDir(path.join(pluginRoot, "skills", member), path.join(bundleRoot, "references", "skills", member));
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
    for (const script of [...rglob(bundleRoot, ".py"), ...rglob(bundleRoot, ".mjs")]) {
      const helper = sharedHelpers[script.endsWith(".py") ? ".py" : ".mjs"];
      if (vendorSharedValidator(script, helper)) {
        vendored.push(path.relative(bundleRoot, script));
      }
    }
    vendored.sort();
    const bundleErrors = checkBundle(bundleRoot, skillNames);
    errors.push(...bundleErrors);
    bundles.push({
      skill: entry,
      closure,
      bundled_internal_skills: closure.length - 1,
      plugin_assets: [...usedAssets].sort(),
      vendored_shared_validators: vendored,
      valid: !bundleErrors.length,
    });
  }

  const manifest = {
    schema_version: "cuebook-release-skills-manifest-v1",
    catalog_version: index.catalog_version ?? null,
    plugin_version: index.plugin_version ?? null,
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
