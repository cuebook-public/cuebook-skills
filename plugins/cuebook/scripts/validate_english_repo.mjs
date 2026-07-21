#!/usr/bin/env node
// Keep every tracked, human-readable repository file English-only.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const DISALLOWED_CJK_PATTERN = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffee]/gu;

function isBinary(buffer) {
  return buffer.includes(0);
}

export function findDisallowedCjkCharacters(text, file = "<text>") {
  const matches = [];
  let line = 1;
  let lineStart = 0;

  for (const match of text.matchAll(DISALLOWED_CJK_PATTERN)) {
    while (true) {
      const nextNewline = text.indexOf("\n", lineStart);
      if (nextNewline === -1 || nextNewline >= match.index) break;
      line += 1;
      lineStart = nextNewline + 1;
    }

    matches.push({
      file,
      line,
      column: match.index - lineStart + 1,
      codepoint: `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
    });
  }

  return matches;
}

export function validateEnglishRepo(repoRoot = DEFAULT_REPO_ROOT) {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  const errors = [];
  let textFileCount = 0;

  for (const relativePath of tracked) {
    const buffer = readFileSync(path.join(repoRoot, relativePath));
    if (isBinary(buffer)) continue;
    textFileCount += 1;
    errors.push(...findDisallowedCjkCharacters(buffer.toString("utf8"), relativePath));
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      tracked_file_count: tracked.length,
      text_file_count: textFileCount,
    },
  };
}

function main() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT;
  const result = validateEnglishRepo(repoRoot);

  if (!result.valid) {
    console.error("English-only repository validation failed:");
    for (const error of result.errors) {
      console.error(`- ${error.file}:${error.line}:${error.column} (${error.codepoint})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `English-only repository validation passed (${result.stats.text_file_count} text files).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
