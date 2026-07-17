#!/usr/bin/env node
// Stamp the canonical Cuebook wordmark into a viewpoint HTML's bottom-right safe zone.
//
// Port of stamp_cuebook_wordmark.py; output JSON and behavior are contract.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ASSET = path.join(SCRIPT_DIR, "..", "assets", "cuebook-wordmark.svg");
const MARKER = 'data-cuebook-wordmark="v1"';

// Replace the first occurrence of a literal substring (no $-pattern semantics).
function replaceOnce(text, needle, replacement) {
  const index = text.indexOf(needle);
  if (index === -1) return text;
  return text.slice(0, index) + replacement + text.slice(index + needle.length);
}

export function stamp(html, background) {
  const color = background === "dark" ? "#F2F3F4" : "#101411";
  if (html.includes(MARKER)) {
    // Idempotent means converging on the requested state: re-stamping an
    // already-stamped file with the other background must flip the mark
    // color, or a dark rebrand silently keeps an invisible ink-on-ink mark.
    const wrong = background === "dark" ? "#101411" : "#F2F3F4";
    const needle = `color:${wrong};z-index:50`;
    if (html.includes(needle)) {
      return [replaceOnce(html, needle, `color:${color};z-index:50`), true];
    }
    return [html, false];
  }
  if (!html.includes("</style>") || !html.includes("</main>")) {
    throw new Error("Viewpoint HTML needs style and main closing tags.");
  }
  const css = `.cuebook-wordmark{position:absolute;right:41px;bottom:34px;width:136px;height:26px;color:${color};z-index:50;pointer-events:none}`;
  let svg = readFileSync(ASSET, "utf-8").trim();
  svg = replaceOnce(
    svg,
    "<svg ",
    '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" aria-label="Cuebook" ',
  ).split('fill="#F2F3F4"').join('fill="currentColor"');
  let output = replaceOnce(html, "</style>", `${css}\n</style>`);
  output = replaceOnce(output, "</main>", `  ${svg}\n</main>`);
  return [output, true];
}

// json.dumps(value, ensure_ascii=False) with Python's default separators.
function pyJsonDumpsCompact(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
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
  if (Array.isArray(value)) return `[${value.map(pyJsonDumpsCompact).join(", ")}]`;
  return `{${Object.entries(value).map(([k, v]) => `${pyJsonDumpsCompact(k)}: ${pyJsonDumpsCompact(v)}`).join(", ")}}`;
}

// str(PurePosixPath(value)) normalization for argparse type=Path arguments.
function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

function main(argv) {
  let background = "light";
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--background") {
      background = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--background=")) {
      background = arg.slice("--background=".length);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length !== 1 || !["light", "dark"].includes(background)) {
    process.stderr.write("usage: stamp_cuebook_wordmark.mjs html [--background {light,dark}]\n");
    return 2;
  }
  const htmlPath = pathStr(positionals[0]);
  const source = readFileSync(htmlPath, "utf-8");
  const [output, changed] = stamp(source, background);
  if (changed) writeFileSync(htmlPath, output, "utf-8");
  process.stdout.write(pyJsonDumpsCompact({ html: htmlPath, changed, background }) + "\n");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
