#!/usr/bin/env node
// Render one recommended Frame preview, or three explicitly requested previews,
// from stable Cuebook templates in one bounded batch. Preview rendering produces
// only the 2488 x 1056 image; compact and OG derivatives belong to selection freeze.

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stamp } from "../references/skills/direct-cuebook-viewpoint-visual/scripts/stamp_cuebook_wordmark.mjs";

const require = createRequire(import.meta.url);
const captureScript = fileURLToPath(new URL("../references/skills/direct-cuebook-viewpoint-visual/scripts/capture_html_viewpoint.cjs", import.meta.url));
const { captureViewpoint } = require(captureScript);
const TEMPLATE = readFileSync(new URL("../assets/frame-preview-template.html", import.meta.url), "utf8");
const TEMPLATE_IDS = new Set(["verdict", "proof", "system"]);
const BINDING_PATTERN = /^BIND_[A-Za-z0-9_:-]{4,}$/;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requireText(candidate, field, maximum) {
  const value = candidate[field];
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > maximum) {
    throw new Error(`${field} must be non-empty and at most ${maximum} visible characters.`);
  }
  return value.trim();
}

function requireBinding(candidate, field) {
  const value = candidate.binding_refs?.[field];
  if (typeof value !== "string" || !BINDING_PATTERN.test(value)) {
    throw new Error(`binding_refs.${field} must be a BIND_ reference.`);
  }
  return escapeHtml(value);
}

function beat(label, copy, role, binding, extraClass = "") {
  return `<section class="beat ${extraClass}" data-role="${role}" data-visual-level="3" data-binding-ref="${binding}"><span class="label">${label}</span><span class="copy">${copy}</span></section>`;
}

function layout(candidate) {
  const claim = escapeHtml(requireText(candidate, "claim", 44));
  const evidence = escapeHtml(requireText(candidate, "evidence", 60));
  const mechanism = escapeHtml(requireText(candidate, "mechanism", 60));
  const condition = escapeHtml(requireText(candidate, "condition", 40));
  const bindings = {
    claim: requireBinding(candidate, "claim"),
    evidence: requireBinding(candidate, "evidence"),
    mechanism: requireBinding(candidate, "mechanism"),
    condition: requireBinding(candidate, "condition"),
  };
  if (candidate.template_id === "verdict") {
    return `<section class="verdict"><h1 class="claim" data-role="claim" data-visual-level="1" data-binding-ref="${bindings.claim}">${claim}</h1><div class="rail">${beat("OBSERVED", evidence, "evidence", bindings.evidence)}${beat("MECHANISM", mechanism, "evidence", bindings.mechanism)}${beat("NEXT", condition, "condition", bindings.condition, "condition")}</div></section>`;
  }
  if (candidate.template_id === "proof") {
    return `<section class="proof"><h1 class="claim" data-role="claim" data-visual-level="1" data-binding-ref="${bindings.claim}">${claim}</h1><div class="field" data-visual-level="2"><span class="label">OBSERVED SIGNAL</span><div class="evidence" data-role="evidence" data-visual-level="2" data-binding-ref="${bindings.evidence}">${evidence}</div><div class="mechanism" data-role="evidence" data-visual-level="3" data-binding-ref="${bindings.mechanism}">${mechanism}<br><span class="condition" data-role="condition" data-binding-ref="${bindings.condition}">${condition}</span></div></div></section>`;
  }
  return `<section class="system"><h1 class="claim" data-role="claim" data-visual-level="1" data-binding-ref="${bindings.claim}">${claim}</h1><div class="chain"><section class="node" data-role="evidence" data-visual-level="2" data-binding-ref="${bindings.evidence}"><span class="label">OBSERVED</span><span class="copy">${evidence}</span></section><div class="arrow">→</div><section class="node" data-role="evidence" data-visual-level="2" data-binding-ref="${bindings.mechanism}"><span class="label">MECHANISM</span><span class="copy">${mechanism}</span></section><div class="arrow">→</div><section class="node" data-role="condition" data-visual-level="2" data-binding-ref="${bindings.condition}"><span class="label">NEXT</span><span class="copy condition">${condition}</span></section></div></section>`;
}

function localFontLink(fontCssPath) {
  if (fontCssPath === null || fontCssPath === undefined || fontCssPath === "") return "";
  const resolved = path.resolve(String(fontCssPath));
  if (!existsSync(resolved)) throw new Error(`Cached font CSS does not exist: ${resolved}`);
  return `<link rel="stylesheet" href="${escapeHtml(pathToFileURL(resolved).href)}">`;
}

export function renderHtml(candidate, { fontCssPath = null } = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Candidate must be an object.");
  if (!TEMPLATE_IDS.has(candidate.template_id)) throw new Error("template_id must be verdict, proof, or system.");
  if (typeof candidate.candidate_id !== "string" || !/^FPREV_CAND_[A-Za-z0-9_:-]{4,}$/.test(candidate.candidate_id)) {
    throw new Error("candidate_id must match FPREV_CAND_<id>.");
  }
  const replacements = new Map([
    ["__LANG__", escapeHtml(candidate.language || "zh-CN")],
    ["__DOCUMENT_TITLE__", escapeHtml(requireText(candidate, "claim", 44))],
    ["__FONT_LINK__", localFontLink(fontCssPath)],
    ["__TEMPLATE_ID__", candidate.template_id],
    ["__DIRECTION_ID__", escapeHtml(candidate.candidate_id)],
    ["__SUBJECT__", escapeHtml(requireText(candidate, "subject", 24))],
    ["__HORIZON__", escapeHtml(requireText(candidate, "horizon", 24))],
    ["__AS_OF__", escapeHtml(requireText(candidate, "as_of_label", 48))],
    ["__LAYOUT__", layout(candidate)],
  ]);
  let html = TEMPLATE;
  for (const [token, value] of replacements) html = html.replaceAll(token, value);
  const [stamped] = stamp(html, "light");
  if (/__[A-Z_]+__/u.test(stamped)) throw new Error("Unresolved preview template token.");
  if (/(?:src|href)=["']https?:\/\//iu.test(stamped)) throw new Error("Frame preview HTML must be network-free.");
  return stamped;
}

export async function renderBatch(payload, outputDir, { htmlOnly = false, capture = captureViewpoint } = {}) {
  if (!payload || payload.schema_version !== "frame-preview-render-v1") throw new Error("Expected frame-preview-render-v1 input.");
  if (!Array.isArray(payload.candidates) || ![1, 3].includes(payload.candidates.length)) {
    throw new Error("Preview render input must contain one or three candidates.");
  }
  const ids = new Set(payload.candidates.map((candidate) => candidate.candidate_id));
  if (ids.size !== payload.candidates.length) throw new Error("Preview candidate IDs must be unique.");
  if (payload.candidates.length === 3 && new Set(payload.candidates.map((candidate) => candidate.template_id)).size !== 3) {
    throw new Error("A three-preview batch must use verdict, proof, and system once each.");
  }
  const root = path.resolve(outputDir);
  mkdirSync(root, { recursive: true });
  const startedAt = Date.now();
  const staged = payload.candidates.map((candidate) => {
    const candidateDir = path.join(root, candidate.candidate_id);
    mkdirSync(candidateDir, { recursive: true });
    const htmlPath = path.join(candidateDir, "frame-preview.html");
    writeFileSync(htmlPath, renderHtml(candidate, { fontCssPath: payload.font_css_path ?? null }), "utf8");
    return { candidate, candidateDir, htmlPath };
  });
  const captures = htmlOnly
    ? staged.map(() => null)
    : await Promise.all(staged.map((item) => capture(item.htmlPath, item.candidateDir, null, null, { fullOnly: true })));
  const candidates = staged.map((item, index) => {
    const htmlRef = path.relative(root, item.htmlPath).split(path.sep).join("/");
    const record = { candidate_id: item.candidate.candidate_id, template_id: item.candidate.template_id, html_ref: htmlRef };
    if (htmlOnly) return { ...record, preview_ref: null, width: null, height: null, sha256: null, pixel_sha256: null };
    const derivative = captures[index].report.derivatives[0];
    return {
      ...record,
      preview_ref: path.relative(root, path.join(item.candidateDir, derivative.ref)).split(path.sep).join("/"),
      width: derivative.width,
      height: derivative.height,
      sha256: derivative.sha256,
      pixel_sha256: derivative.pixel_sha256,
    };
  });
  const report = {
    schema_version: "frame-preview-render-report-v1",
    template_version: "frame-preview-templates-v1",
    mode: htmlOnly ? "html_only" : "full_only",
    duration_ms: Date.now() - startedAt,
    candidates,
  };
  writeFileSync(path.join(root, "frame-preview-render-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const htmlOnly = args.includes("--html-only");
  const positionals = args.filter((arg) => arg !== "--html-only");
  if (positionals.length !== 2) {
    process.stderr.write("usage: render_frame_previews.mjs input.json output-dir [--html-only]\n");
    process.exit(2);
  }
  const payload = JSON.parse(readFileSync(positionals[0], "utf8"));
  const report = await renderBatch(payload, positionals[1], { htmlOnly });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
