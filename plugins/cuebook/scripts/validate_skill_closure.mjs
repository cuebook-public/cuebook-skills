#!/usr/bin/env node
// Validate that every Cuebook skill invocation and local Markdown resource
// reference closes over files shipped by the plugin.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXCLUDED_DIRS = new Set([".git", "node_modules", "__pycache__", ".pytest_cache"]);
const INLINE_RESOURCE_PATTERN = /(?:^|[\s("'=])((?:\.\/)?(?:references|scripts|templates|assets|evals|tests)\/[A-Za-z0-9][A-Za-z0-9._/@+%-]*|\.\.\/\.\.\/assets\/[A-Za-z0-9][A-Za-z0-9._/@+%-]*)/gu;
const MARKDOWN_LINK_PATTERN = /!?\[[^\]\n]*\]\(([^)\n]+)\)/gu;
const SKILL_REF_PATTERN = /\$([a-z][a-z0-9-]*)\b/gu;
const SKILL_RESOURCE_PATTERN = /\$([a-z][a-z0-9-]*)\/((?:references|scripts|templates|assets|evals|tests)\/[A-Za-z0-9][A-Za-z0-9._/@+%-]*)/gu;

export const RETIRED_SKILL_IDS = new Set([
  "optimize-cuebook-market-geo",
  "optimize-cuebook-market-seo",
]);

function walkFiles(root, predicate = () => true) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && predicate(target)) found.push(target);
    }
  };
  walk(root);
  return found.sort();
}

function lineAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function cleanTarget(raw) {
  let target = raw.trim();
  if (target.startsWith("<")) {
    const close = target.indexOf(">");
    target = close === -1 ? target.slice(1) : target.slice(1, close);
  } else {
    target = target.split(/\s+/u)[0];
  }
  target = target.replace(/[.,;:!?]+$/u, "");
  const separator = target.search(/[?#]/u);
  if (separator !== -1) target = target.slice(0, separator);
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function localMarkdownTarget(raw) {
  const target = cleanTarget(raw);
  if (!target || target.startsWith("#") || path.isAbsolute(target)) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) return null;
  return target;
}

function resourceCandidates(markdownPath, skillRoot, reference, kind) {
  const fromMarkdown = path.resolve(path.dirname(markdownPath), reference);
  if (kind === "markdown_link") return [fromMarkdown];
  if (kind === "skill_resource") return [path.resolve(skillRoot, reference)];
  if (path.dirname(markdownPath) === skillRoot) return [fromMarkdown];
  const fromSkillRoot = path.resolve(skillRoot, reference);
  return fromMarkdown === fromSkillRoot ? [fromMarkdown] : [fromMarkdown, fromSkillRoot];
}

function checkResource({ allowedRoot, errors, kind, markdownPath, pluginRoot, reference, skillRoot }) {
  const displayPath = path.relative(pluginRoot, markdownPath);
  const candidates = resourceCandidates(markdownPath, skillRoot, reference, kind);
  const safeCandidates = candidates.filter((candidate) => within(allowedRoot, candidate));
  if (!safeCandidates.length) {
    errors.push({
      code: "RESOURCE_ESCAPE",
      path: `${displayPath}:${reference}`,
      message: `Local resource leaves the packaged plugin: ${reference}`,
    });
    return;
  }
  const existing = safeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    errors.push({
      code: "MISSING_RESOURCE",
      path: `${displayPath}:${reference}`,
      message: `Referenced local resource does not exist: ${reference}`,
    });
    return;
  }
  const realTarget = fs.realpathSync(existing);
  if (!within(allowedRoot, realTarget)) {
    errors.push({
      code: "RESOURCE_ESCAPE",
      path: `${displayPath}:${reference}`,
      message: `Local resource resolves outside the packaged plugin: ${reference}`,
    });
  }
}

export function validateSkillClosure(pluginRootArg) {
  const pluginRoot = fs.realpathSync(path.resolve(pluginRootArg));
  const skillsRoot = path.join(pluginRoot, "skills");
  const errors = [];
  const skillEntries = fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const skillNames = new Set();

  for (const entry of skillEntries) {
    const skillMd = path.join(skillsRoot, entry.name, "SKILL.md");
    if (RETIRED_SKILL_IDS.has(entry.name)) {
      errors.push({
        code: "RETIRED_SKILL_DIR",
        path: `skills/${entry.name}`,
        message: `Retired skill must not be packaged: ${entry.name}`,
      });
    }
    if (!fs.existsSync(skillMd)) {
      errors.push({
        code: "MISSING_SKILL_MD",
        path: `skills/${entry.name}`,
        message: "Skill directory must contain SKILL.md.",
      });
      continue;
    }
    skillNames.add(entry.name);
  }

  let markdownFileCount = 0;
  let resourceRefCount = 0;
  let skillRefCount = 0;
  for (const skillName of [...skillNames].sort()) {
    const skillRoot = path.join(skillsRoot, skillName);
    for (const markdownPath of walkFiles(skillRoot, (target) => target.endsWith(".md"))) {
      markdownFileCount += 1;
      const text = fs.readFileSync(markdownPath, "utf8");
      const relativePath = path.relative(pluginRoot, markdownPath);

      for (const match of text.matchAll(SKILL_RESOURCE_PATTERN)) {
        resourceRefCount += 1;
        const invoked = match[1];
        if (!skillNames.has(invoked) || RETIRED_SKILL_IDS.has(invoked)) continue;
        checkResource({
          allowedRoot: pluginRoot,
          errors,
          kind: "skill_resource",
          markdownPath,
          pluginRoot,
          reference: path.join("skills", invoked, cleanTarget(match[2])),
          skillRoot: pluginRoot,
        });
      }

      for (const match of text.matchAll(SKILL_REF_PATTERN)) {
        skillRefCount += 1;
        const invoked = match[1];
        const location = `${relativePath}:${lineAt(text, match.index)}`;
        if (RETIRED_SKILL_IDS.has(invoked)) {
          errors.push({
            code: "RETIRED_SKILL_REF",
            path: location,
            message: `Retired skill must not be invoked: ${invoked}`,
          });
        } else if (!skillNames.has(invoked)) {
          errors.push({
            code: "UNKNOWN_SKILL_REF",
            path: location,
            message: `Unknown skill invocation: ${invoked}`,
          });
        }
      }

      const seenResources = new Set();
      for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
        const reference = localMarkdownTarget(match[1]);
        if (!reference) continue;
        const key = `markdown_link:${reference}`;
        if (seenResources.has(key)) continue;
        seenResources.add(key);
        resourceRefCount += 1;
        checkResource({
          allowedRoot: pluginRoot,
          errors,
          kind: "markdown_link",
          markdownPath,
          pluginRoot,
          reference,
          skillRoot,
        });
      }

      for (const codeMatch of text.matchAll(/`([^`\n]+)`/gu)) {
        for (const resourceMatch of codeMatch[1].matchAll(INLINE_RESOURCE_PATTERN)) {
          const reference = cleanTarget(resourceMatch[1]);
          const key = `inline_code:${reference}`;
          if (!reference || seenResources.has(key)) continue;
          seenResources.add(key);
          resourceRefCount += 1;
          checkResource({
            allowedRoot: pluginRoot,
            errors,
            kind: "inline_code",
            markdownPath,
            pluginRoot,
            reference,
            skillRoot,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      skill_count: skillNames.size,
      markdown_file_count: markdownFileCount,
      resource_ref_count: resourceRefCount,
      skill_ref_count: skillRefCount,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args[0] ?? "").startsWith("-")) {
    process.stderr.write("usage: validate_skill_closure.mjs [plugin_root]\n");
    process.exit(2);
  }
  const pluginRoot = path.resolve(args[0] ?? path.resolve(SCRIPT_DIR, ".."));
  const result = validateSkillClosure(pluginRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
