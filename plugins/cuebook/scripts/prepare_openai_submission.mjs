#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validate } from "./validate_cuebook_plugin.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const PUBLIC_SKILLS = ["query-cuebook", "create-cuebook-content", "author-cuebook-skill"];
const SUBMISSION_FILES = [
  "README.md",
  "listing.json",
  "test-cases.json",
  "tool-annotations.json",
  "reviewer-runbook.md",
  "release-notes.md",
];
const HAN = /\p{Script=Han}/u;

export class SubmissionValidationError extends Error {
  constructor(issues) {
    super("OpenAI submission packet is invalid.");
    this.issues = issues;
  }
}

function json(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(target);
    }
  };
  visit(root);
  return files;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export function validateOpenAiSubmission(rootArg = REPO_ROOT) {
  const root = path.resolve(rootArg);
  const issues = [];
  const add = (file, message) => issues.push({ file, message });
  const pluginRoot = path.join(root, "plugins", "cuebook");
  const submissionRoot = path.join(root, "submission", "openai");
  const pluginResult = validate(pluginRoot);
  if (!pluginResult.valid) {
    for (const issue of pluginResult.errors) add(issue.path ?? "plugins/cuebook", issue.message);
  }

  for (const file of SUBMISSION_FILES) {
    const target = path.join(submissionRoot, file);
    if (!existsSync(target)) {
      add(`submission/openai/${file}`, "Required submission file is missing.");
      continue;
    }
    if (HAN.test(readFileSync(target, "utf8"))) {
      add(`submission/openai/${file}`, "Submission-facing content must be English-only.");
    }
  }

  let manifest;
  let listing;
  let cases;
  try {
    manifest = json(path.join(pluginRoot, ".codex-plugin", "plugin.json"));
    listing = json(path.join(submissionRoot, "listing.json"));
    cases = json(path.join(submissionRoot, "test-cases.json"));
  } catch (error) {
    add("submission/openai", `Cannot parse JSON: ${error.message}`);
  }

  if (manifest && listing) {
    const prompts = manifest.interface?.defaultPrompt ?? [];
    if (prompts.length !== 3 || prompts.some((prompt) => HAN.test(prompt))) {
      add("plugins/cuebook/.codex-plugin/plugin.json", "Provide exactly three English starter prompts.");
    }
    if (JSON.stringify(prompts) !== JSON.stringify(listing.starter_prompts)) {
      add("submission/openai/listing.json", "Starter prompts must match the Plugin manifest.");
    }
    const expectedUrls = {
      privacyPolicyURL: listing.urls?.privacy_policy,
      termsOfServiceURL: listing.urls?.terms_of_service,
      websiteURL: listing.urls?.website,
    };
    for (const [field, expected] of Object.entries(expectedUrls)) {
      if (!expected?.startsWith("https://") || manifest.interface?.[field] !== expected) {
        add("plugins/cuebook/.codex-plugin/plugin.json", `${field} must match the HTTPS listing URL.`);
      }
    }
    if (listing.urls?.support !== "https://cuebook.xyz/support") {
      add("submission/openai/listing.json", "Support must use the production Cuebook support page.");
    }
    if (listing.integration?.production_mcp_url !== "https://cuebook.xyz/mcp") {
      add("submission/openai/listing.json", "MCP URL must use the production review endpoint.");
    }
    if (listing.integration?.real_money_trading !== false) {
      add("submission/openai/listing.json", "Real-money trading must be explicitly false.");
    }
    if ((listing.assets?.screenshots ?? []).length !== 0) {
      add("submission/openai/listing.json", "Do not submit screenshots for a plugin with no embedded UI.");
    }
  }

  if (cases) {
    if (!Array.isArray(cases.positive) || cases.positive.length !== 5) {
      add("submission/openai/test-cases.json", "Exactly five positive test cases are required.");
    }
    if (!Array.isArray(cases.negative) || cases.negative.length !== 3) {
      add("submission/openai/test-cases.json", "Exactly three negative test cases are required.");
    }
    const ids = [...(cases.positive ?? []), ...(cases.negative ?? [])].map((item) => item.id);
    if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id)) {
      add("submission/openai/test-cases.json", "Test case ids must be unique non-empty strings.");
    }
  }

  const publicRoot = path.join(pluginRoot, "public-skills");
  const skillDirs = readdirSync(publicRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(publicRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(skillDirs) !== JSON.stringify([...PUBLIC_SKILLS].sort())) {
    add("plugins/cuebook/public-skills", `Expected only ${PUBLIC_SKILLS.join(" and ")} as public Skills.`);
  }

  if (issues.length > 0) throw new SubmissionValidationError(issues);
  return { valid: true, public_skills: PUBLIC_SKILLS, positive_cases: 5, negative_cases: 3 };
}

export function prepareOpenAiSubmission(rootArg = REPO_ROOT, outputArg) {
  const root = path.resolve(rootArg);
  const validation = validateOpenAiSubmission(root);
  const version = json(path.join(root, "package.json")).version;
  const output = path.resolve(outputArg ?? path.join(root, "dist", "openai-submission"));
  const stage = path.join(output, "skills");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  for (const skill of PUBLIC_SKILLS) {
    cpSync(
      path.join(root, "plugins", "cuebook", "public-skills", skill),
      path.join(stage, skill),
      { recursive: true, dereference: true },
    );
  }
  for (const file of SUBMISSION_FILES) {
    cpSync(path.join(root, "submission", "openai", file), path.join(output, file));
  }
  cpSync(path.join(root, "plugins", "cuebook", "assets", "icon.png"), path.join(output, "logo.png"));

  const archiveName = `cuebook-skills-${version}.zip`;
  const archive = path.join(output, archiveName);
  const zipped = spawnSync("zip", ["-X", "-q", "-r", archive, ...PUBLIC_SKILLS], {
    cwd: stage,
    encoding: "utf8",
  });
  if (zipped.status !== 0) {
    throw new Error(`zip failed: ${zipped.stderr || zipped.error?.message || "unknown error"}`);
  }

  const fileDigests = Object.fromEntries(
    walkFiles(stage).map((file) => [path.relative(stage, file).split(path.sep).join("/"), sha256(file)]),
  );
  const manifest = {
    plugin: "cuebook",
    version,
    public_skills: PUBLIC_SKILLS,
    skill_file_count: Object.keys(fileDigests).length,
    skill_files_sha256: fileDigests,
    archive: archiveName,
    archive_sha256: sha256(archive),
    reviewer_cases: { positive: 5, negative: 3 },
  };
  writeFileSync(
    path.join(output, "submission-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { ...validation, output, archive, archive_sha256: manifest.archive_sha256 };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    process.stderr.write("usage: prepare_openai_submission.mjs [--check]\n");
    process.exitCode = 2;
    return;
  }
  const result = args[0] === "--check" ? validateOpenAiSubmission(REPO_ROOT) : prepareOpenAiSubmission(REPO_ROOT);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    for (const issue of error.issues ?? []) {
      process.stderr.write(`- ${issue.file}: ${issue.message}\n`);
    }
    process.exitCode = 1;
  }
}
