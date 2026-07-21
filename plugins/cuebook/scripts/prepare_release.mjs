#!/usr/bin/env node

// Prepare one reviewable Cuebook Skills release. This script updates the
// canonical version surfaces and generated Skill bundles, but intentionally
// never commits, tags, pushes, publishes a GitHub Release, deploys, or touches
// MCP/OAuth state.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "./build_release_skills.mjs";

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CODEX_BUILD = /^\d{14}$/u;

const VERSION_FILES = {
  package: "package.json",
  lock: "package-lock.json",
  index: "plugins/cuebook/assets/plugin-index-v1.json",
  codex: "plugins/cuebook/.codex-plugin/plugin.json",
  claude: "plugins/cuebook/.claude-plugin/plugin.json",
  claudeMarketplace: ".claude-plugin/marketplace.json",
};

const PINNED_INSTALL_DOCS = [
  "README.md",
  "plugins/cuebook/README.md",
  "plugins/cuebook/platforms/codex.md",
  "plugins/cuebook/platforms/claude-code.md",
];

const GENERATED_MANIFESTS = [
  "skills/release-manifest.json",
  "plugins/cuebook/public-skills/release-manifest.json",
];

export class ReleasePreparationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ReleasePreparationError";
    this.issues = issues;
  }
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function baseVersion(version) {
  return String(version ?? "").split("+")[0];
}

function compareStableSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function latestChangelogVersion(text) {
  return text.match(/^## (\d+\.\d+\.\d+) — \d{4}-\d{2}-\d{2}$/mu)?.[1] ?? null;
}

function versionRefs(text) {
  return [
    ...text.matchAll(/(?:--ref v|cuebook-public\/cuebook-skills@v)(\d+\.\d+\.\d+)/gu),
  ].map((match) => match[1]);
}

export function collectReleaseIssues(rootArg) {
  const root = path.resolve(rootArg);
  const issues = [];
  const add = (file, message) => issues.push({ file, message });

  let packageJson;
  try {
    packageJson = readJson(root, VERSION_FILES.package);
  } catch (error) {
    add(VERSION_FILES.package, `Cannot read release version: ${error.message}`);
    return issues;
  }
  const version = String(packageJson.version ?? "");
  if (!STABLE_SEMVER.test(version)) {
    add(VERSION_FILES.package, "Release version must be stable semantic versioning (x.y.z). ");
    return issues;
  }

  const checks = [
    [VERSION_FILES.lock, () => {
      const payload = readJson(root, VERSION_FILES.lock);
      return payload.version === version && payload.packages?.[""]?.version === version;
    }, "Root and package-lock workspace versions differ."],
    [VERSION_FILES.index, () => readJson(root, VERSION_FILES.index).plugin_version === version, "Plugin index version differs."],
    [VERSION_FILES.codex, () => baseVersion(readJson(root, VERSION_FILES.codex).version) === version, "Codex manifest version differs."],
    [VERSION_FILES.claude, () => baseVersion(readJson(root, VERSION_FILES.claude).version) === version, "Claude manifest version differs."],
    [VERSION_FILES.claudeMarketplace, () => {
      const payload = readJson(root, VERSION_FILES.claudeMarketplace);
      return payload.plugins?.length === 1 && baseVersion(payload.plugins[0].version) === version;
    }, "Claude marketplace version differs."],
  ];
  for (const [file, check, message] of checks) {
    try {
      if (!check()) add(file, message);
    } catch (error) {
      add(file, `Cannot validate version: ${error.message}`);
    }
  }

  try {
    const codexVersion = String(readJson(root, VERSION_FILES.codex).version ?? "");
    if (!new RegExp(`^${version.replaceAll(".", "\\.")}\\+codex\\.\\d{14}$`, "u").test(codexVersion)) {
      add(VERSION_FILES.codex, "Codex manifest must include +codex.YYYYMMDDHHMMSS build metadata.");
    }
  } catch {
    // The manifest read error is already reported above.
  }

  for (const file of PINNED_INSTALL_DOCS) {
    try {
      const refs = versionRefs(fs.readFileSync(path.join(root, file), "utf8"));
      if (refs.length === 0 || refs.some((item) => item !== version)) {
        add(file, `Pinned install refs must all be v${version}.`);
      }
    } catch (error) {
      add(file, `Cannot validate pinned install ref: ${error.message}`);
    }
  }

  try {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
    for (const expected of [
      `releases/tag/v${version}`,
      `Release v${version}`,
      `release-v${version}`,
      `npm run release:prepare -- ${version}`,
    ]) {
      if (!readme.includes(expected)) add("README.md", `Missing release badge value: ${expected}`);
    }
  } catch {
    // The README read error is already reported by the install-ref check.
  }

  try {
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    if (latestChangelogVersion(changelog) !== version) {
      add("CHANGELOG.md", `Latest released section must be ${version}.`);
    }
    if (!/^## Unreleased\s*$/mu.test(changelog)) {
      add("CHANGELOG.md", "Keep an Unreleased section above the latest release.");
    }
  } catch (error) {
    add("CHANGELOG.md", `Cannot validate changelog: ${error.message}`);
  }

  for (const file of GENERATED_MANIFESTS) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    try {
      if (readJson(root, file).plugin_version !== version) {
        add(file, "Generated Skill bundle version differs; rebuild the release bundles.");
      }
    } catch (error) {
      add(file, `Cannot validate generated release manifest: ${error.message}`);
    }
  }

  return issues;
}

export function assertReleaseConsistent(rootArg) {
  const issues = collectReleaseIssues(rootArg);
  if (issues.length > 0) {
    throw new ReleasePreparationError("Release metadata is inconsistent.", issues);
  }
  return { valid: true, issues: [] };
}

function replaceReleaseRefs(text, version) {
  return text
    .replaceAll(/releases\/tag\/v\d+\.\d+\.\d+/gu, `releases/tag/v${version}`)
    .replaceAll(/Release v\d+\.\d+\.\d+/gu, `Release v${version}`)
    .replaceAll(/release-v\d+\.\d+\.\d+/gu, `release-v${version}`)
    .replaceAll(/npm run release:prepare -- \d+\.\d+\.\d+/gu, `npm run release:prepare -- ${version}`)
    .replaceAll(/--ref v\d+\.\d+\.\d+/gu, `--ref v${version}`)
    .replaceAll(/cuebook-public\/cuebook-skills@v\d+\.\d+\.\d+/gu, `cuebook-public/cuebook-skills@v${version}`);
}

function releaseChangelog(text, version, date) {
  const marker = "## Unreleased";
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new ReleasePreparationError("CHANGELOG.md needs an Unreleased section before release preparation.");
  }
  const notesStart = start + marker.length;
  const nextHeading = text.slice(notesStart).search(/\n## \d+\.\d+\.\d+ — /u);
  if (nextHeading < 0) {
    throw new ReleasePreparationError("CHANGELOG.md needs a prior released section after Unreleased.");
  }
  const boundary = notesStart + nextHeading;
  const notes = text.slice(notesStart, boundary).trim();
  if (!/^- /mu.test(notes)) {
    throw new ReleasePreparationError("Unreleased must contain at least one release-note bullet.");
  }
  return `${text.slice(0, start)}## Unreleased\n\n## ${version} — ${date}\n\n${notes}\n${text.slice(boundary)}`;
}

export function prepareRelease(rootArg, options) {
  const root = path.resolve(rootArg);
  const version = String(options?.version ?? "");
  const date = String(options?.date ?? "");
  const codexBuild = String(options?.codexBuild ?? "");
  if (!STABLE_SEMVER.test(version)) {
    throw new ReleasePreparationError("New release version must use stable semantic versioning (x.y.z).");
  }
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ReleasePreparationError("Release date must use YYYY-MM-DD.");
  }
  if (!CODEX_BUILD.test(codexBuild)) {
    throw new ReleasePreparationError("Codex build must use YYYYMMDDHHMMSS.");
  }

  const packageJson = readJson(root, VERSION_FILES.package);
  const current = String(packageJson.version ?? "");
  if (!STABLE_SEMVER.test(current) || compareStableSemver(version, current) <= 0) {
    throw new ReleasePreparationError(`Release version ${version} must be greater than current ${current}.`);
  }

  const writes = new Map();
  packageJson.version = version;
  writes.set(VERSION_FILES.package, jsonText(packageJson));

  const lock = readJson(root, VERSION_FILES.lock);
  lock.version = version;
  if (!lock.packages?.[""]) {
    throw new ReleasePreparationError("package-lock.json is missing packages[\"\"].");
  }
  lock.packages[""].version = version;
  writes.set(VERSION_FILES.lock, jsonText(lock));

  const index = readJson(root, VERSION_FILES.index);
  index.plugin_version = version;
  writes.set(VERSION_FILES.index, jsonText(index));

  const codex = readJson(root, VERSION_FILES.codex);
  codex.version = `${version}+codex.${codexBuild}`;
  writes.set(VERSION_FILES.codex, jsonText(codex));

  const claude = readJson(root, VERSION_FILES.claude);
  claude.version = version;
  writes.set(VERSION_FILES.claude, jsonText(claude));

  const claudeMarketplace = readJson(root, VERSION_FILES.claudeMarketplace);
  if (claudeMarketplace.plugins?.length !== 1 || claudeMarketplace.plugins[0].name !== "cuebook") {
    throw new ReleasePreparationError("Claude marketplace must contain exactly one Cuebook plugin entry.");
  }
  claudeMarketplace.plugins[0].version = version;
  writes.set(VERSION_FILES.claudeMarketplace, jsonText(claudeMarketplace));

  for (const file of PINNED_INSTALL_DOCS) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const updated = replaceReleaseRefs(text, version);
    if (!versionRefs(updated).includes(version)) {
      throw new ReleasePreparationError(`${file} is missing a replaceable pinned install ref.`);
    }
    writes.set(file, updated);
  }

  const rootReadme = writes.get("README.md");
  for (const expected of [
    `releases/tag/v${version}`,
    `Release v${version}`,
    `release-v${version}`,
    `npm run release:prepare -- ${version}`,
  ]) {
    if (!rootReadme.includes(expected)) {
      throw new ReleasePreparationError(`README.md is missing a replaceable release badge value: ${expected}`);
    }
  }

  writes.set(
    "CHANGELOG.md",
    releaseChangelog(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version, date),
  );

  // All transformations are computed and validated before the first write.
  for (const [file, text] of writes) fs.writeFileSync(path.join(root, file), text, "utf8");
  return { previous_version: current, version, date, codex_build: codexBuild, files: [...writes.keys()] };
}

function utcBuildStamp(now = new Date()) {
  return now.toISOString().replaceAll(/[-:TZ.]/gu, "").slice(0, 14);
}

function parseArgs(argv) {
  const options = { check: false, date: new Date().toISOString().slice(0, 10), codexBuild: utcBuildStamp() };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--date") options.date = argv[++index];
    else if (arg === "--codex-build") options.codexBuild = argv[++index];
    else if (arg.startsWith("-")) throw new ReleasePreparationError(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (options.check) {
    if (positional.length !== 0) throw new ReleasePreparationError("--check does not accept a version.");
  } else if (positional.length !== 1) {
    throw new ReleasePreparationError("usage: prepare_release.mjs VERSION [--date YYYY-MM-DD] [--codex-build YYYYMMDDHHMMSS]");
  }
  return { ...options, version: positional[0] };
}

function printIssues(error) {
  process.stderr.write(`${error.message}\n`);
  for (const issue of error.issues ?? []) process.stderr.write(`- ${issue.file}: ${issue.message}\n`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    assertReleaseConsistent(root);
    process.stdout.write(`${JSON.stringify({ valid: true, version: readJson(root, VERSION_FILES.package).version }, null, 2)}\n`);
    return;
  }

  const prepared = prepareRelease(root, options);
  const outputs = [path.join(root, "skills"), path.join(root, "plugins/cuebook/public-skills")];
  const manifests = outputs.map((output) => build(path.join(root, "plugins/cuebook"), output));
  if (manifests.some((manifest) => !manifest.valid)) {
    throw new ReleasePreparationError("Generated Skill bundles failed validation.", manifests.flatMap((item) => item.errors));
  }
  assertReleaseConsistent(root);
  process.stdout.write(`${JSON.stringify({ ...prepared, generated_bundles: outputs, next: "Review the diff, then run npm run release:verify. This command did not commit, tag, push, publish, or deploy." }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    main();
  } catch (error) {
    printIssues(error);
    process.exitCode = 1;
  }
}
