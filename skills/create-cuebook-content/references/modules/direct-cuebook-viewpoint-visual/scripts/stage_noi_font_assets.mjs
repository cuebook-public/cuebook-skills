#!/usr/bin/env node
// Stage original Noi font files for a network-free Cuebook render.
//
// Port of stage_noi_font_assets.py; manifest shape, CSS text, error messages,
// and CLI JSON output are contract.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEIGHTS = { regular: 400, medium: 500, semibold: 600, bold: 700 };
const EXTENSIONS = { ".otf": "opentype", ".ttf": "truetype", ".woff": "woff", ".woff2": "woff2" };

// RuntimeError analog so main() can mirror Python's `except (OSError, RuntimeError)`.
export class RuntimeError extends Error {}

export function digest(filePath) {
  return "sha256:" + createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

// str(PurePosixPath(value)) normalization (argparse type=Path arguments).
function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

// PurePath.parts component count for the sort key.
function partsCount(value) {
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  return value.startsWith("/") ? parts.length + 1 : parts.length;
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

export function find_weight(source, weight) {
  const candidates = [];
  for (const filePath of walkFiles(source)) {
    let isFile;
    try {
      isFile = statSync(filePath).isFile();
    } catch {
      isFile = false;
    }
    const suffix = path.extname(filePath).toLowerCase();
    if (!isFile || !(suffix in EXTENSIONS)) continue;
    const stemRaw = path.basename(filePath, path.extname(filePath));
    const stem = stemRaw.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (stem.includes(weight) && !stem.includes("italic")) candidates.push(filePath);
  }
  if (!candidates.length) {
    throw new RuntimeError(`Missing upright Noi ${weight} font in ${pathStr(source)}.`);
  }
  candidates.sort((a, b) => {
    const ka = [partsCount(a), path.basename(a).length, a];
    const kb = [partsCount(b), path.basename(b).length, b];
    for (let i = 0; i < 3; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  return candidates[0];
}

export function stage(source, target, { license_mode, license_ref }) {
  let isDir = false;
  try {
    isDir = statSync(source).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    throw new RuntimeError(`Font source directory does not exist: ${pathStr(source)}`);
  }
  const selected = {};
  for (const weight of Object.keys(WEIGHTS)) selected[weight] = find_weight(source, weight);
  if (license_mode === "production" && [pathStr(source), ...Object.values(selected)].some((item) => item.toLowerCase().includes("trial"))) {
    throw new RuntimeError("Production mode rejects Trial font paths and filenames.");
  }
  if (license_mode === "production" && (license_ref.trim().length < 6 || /trial|eval/i.test(license_ref))) {
    throw new RuntimeError("Production mode requires an opaque non-evaluation license_ref.");
  }

  mkdirSync(target, { recursive: true });
  const records = [];
  const faces = [];
  for (const [weight, numericWeight] of Object.entries(WEIGHTS)) {
    const sourcePath = selected[weight];
    const suffix = path.extname(sourcePath).toLowerCase();
    const outputName = `cuebook-noi-${weight}${suffix}`;
    const outputPath = path.join(target, outputName);
    if (!existsSync(outputPath) || digest(outputPath) !== digest(sourcePath)) copyFileSync(sourcePath, outputPath);
    records.push({
      weight: numericWeight,
      style: "normal",
      ref: outputName,
      sha256: digest(outputPath),
      source_name: path.basename(sourcePath),
      source_sha256: digest(sourcePath),
    });
    faces.push([
      "@font-face {",
      '  font-family: "Cuebook Noi";',
      `  src: url("./${outputName}") format("${EXTENSIONS[suffix]}");`,
      "  font-style: normal;",
      `  font-weight: ${numericWeight};`,
      "  font-display: block;",
      "}",
    ].join("\n"));
  }

  const cssPath = path.join(target, "cuebook-noi-fonts.css");
  writeFileSync(cssPath, faces.join("\n\n") + "\n", "utf-8");
  const manifest = {
    schema_version: "cuebook-font-assets-v1",
    font_profile_id: "cuebook-noi-v1",
    family_alias: "Cuebook Noi",
    license_mode,
    license_ref,
    release_eligible: license_mode === "production",
    css_ref: path.basename(cssPath),
    css_sha256: digest(cssPath),
    files: records,
  };
  const manifestPath = path.join(target, "font-assets-v1.json");
  const temporary = path.join(target, `.${path.basename(manifestPath)}.${process.pid}.tmp`);
  writeFileSync(temporary, pyJsonDumpsIndent(manifest) + "\n", "utf-8");
  renameSync(temporary, manifestPath);
  return manifest;
}

// json.dumps(value, ensure_ascii=False, indent=2)
function pyJsonString(value) {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

function pyJsonDumpsIndent(value, depth = 0) {
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return pyJsonString(value);
  const pad = "\n" + "  ".repeat(depth + 1);
  const endPad = "\n" + "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[${value.map((item) => pad + pyJsonDumpsIndent(item, depth + 1)).join(",")}${endPad}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return "{}";
  return `{${keys.map((key) => `${pad}${pyJsonString(key)}: ${pyJsonDumpsIndent(value[key], depth + 1)}`).join(",")}${endPad}}`;
}

function main(argv) {
  let licenseMode = null;
  let licenseRef = null;
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--license-mode") {
      licenseMode = argv[(i += 1)];
    } else if (arg.startsWith("--license-mode=")) {
      licenseMode = arg.slice("--license-mode=".length);
    } else if (arg === "--license-ref") {
      licenseRef = argv[(i += 1)];
    } else if (arg.startsWith("--license-ref=")) {
      licenseRef = arg.slice("--license-ref=".length);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 2 || !["evaluation", "production"].includes(licenseMode) || licenseRef === null || licenseRef === undefined) {
    process.stderr.write("usage: stage_noi_font_assets.mjs source target --license-mode {evaluation,production} --license-ref LICENSE_REF\n");
    return 2;
  }
  const [source, target] = positionals;
  let manifest;
  try {
    manifest = stage(pathStr(source), pathStr(target), { license_mode: licenseMode, license_ref: licenseRef });
  } catch (error) {
    if (!(error instanceof RuntimeError) && typeof error?.code !== "string") throw error;
    process.stdout.write(pyJsonDumpsIndent({ ok: false, error: String(error.message) }) + "\n");
    return 1;
  }
  process.stdout.write(pyJsonDumpsIndent({ ok: true, target: pathStr(target), manifest }) + "\n");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
