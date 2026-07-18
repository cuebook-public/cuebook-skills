#!/usr/bin/env node
// Build the frame visual manifest that binds rendered viewpoint media to its lineage.
//
// The manifest is the handshake between the visual Skill and the Frame backend:
// per-role rendition hashes, the rendered-audit verdict, the source bindings the
// image displays, the font profile, and per-role alt text. `role_hashes` bind
// canonical RGBA8 pixels, while FrameDraftAssemblyV1 binds encoded PNG bytes;
// the backend verifies both independent hash chains and stores the manifest JCS hash.
//
// All scalar values are strings or booleans so the JCS hash is stable across
// languages; floats are rejected. Port of build_frame_visual_manifest.py; the
// JCS form, error codes, and JSON output are cross-language contract.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "frame-visual-manifest-v1";
const CAPTURE_KIND_TO_ROLE = { full: "publication", compact_622: "compact", og: "og" };
const REQUIRED_ROLES = ["publication", "compact"];
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RENDERER_MODES = new Set(["cuebook_template", "finished_bitmap"]);
const EMBEDDED_PIXEL_PROFILE = { profile: "embedded-pixels-v1", verification: "not_asserted" };

// Code-point ordering, matching Python sorted() on str.
function cpCompare(a, b) {
  const ita = a[Symbol.iterator]();
  const itb = b[Symbol.iterator]();
  for (;;) {
    const na = ita.next();
    const nb = itb.next();
    if (na.done && nb.done) return 0;
    if (na.done) return -1;
    if (nb.done) return 1;
    const ca = na.value.codePointAt(0);
    const cb = nb.value.codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
}

// json.dumps(str, ensure_ascii=False): short escapes, control chars as \uXXXX,
// U+2028/U+2029 left untouched (unlike JSON.stringify).
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

// Python str() for the values interpolated below (None -> "None").
function pyStr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

export function canonical_jcs(value) {
  if (typeof value === "string") return pyJsonString(value);
  if (value === null || value === undefined) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    throw new Error("manifest scalars must be strings or booleans; numbers break cross-language JCS stability");
  }
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonical_jcs(item)).join(",") + "]";
  }
  if (typeof value === "object") {
    const parts = [];
    for (const key of Object.keys(value).sort(cpCompare)) {
      parts.push(`${pyJsonString(key)}:${canonical_jcs(value[key])}`);
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`unsupported manifest value type: ${typeof value}`);
}

export function jcs_sha256(value) {
  return `sha256:${createHash("sha256").update(Buffer.from(canonical_jcs(value), "utf-8")).digest("hex")}`;
}

export function issue(code, message) {
  return { code, message };
}

export function build(captureReport, renderAudit, directionSet, fontsManifestPath, altTextByRole) {
  const errors = [];

  let selectedDirection = null;
  if (directionSet.state !== "selected") {
    errors.push(issue("DIRECTION_NOT_SELECTED", "Visual manifest creation requires a selected VisualDirectionSetV1."));
  } else {
    selectedDirection = (directionSet.directions ?? []).find((item) => item?.direction_id === directionSet.selected_direction_id) ?? null;
    if (selectedDirection === null) {
      errors.push(issue("DIRECTION_NOT_SELECTED", "selected_direction_id must resolve inside VisualDirectionSetV1."));
    }
  }

  const rendererMode = selectedDirection?.renderer_mode ?? "cuebook_template";
  if (!RENDERER_MODES.has(rendererMode)) {
    errors.push(issue("RENDERER_MODE", "Use cuebook_template or finished_bitmap."));
  }

  if (selectedDirection !== null) {
    const preflight = selectedDirection.preflight;
    if (preflight === null || typeof preflight !== "object" || Array.isArray(preflight) || !Object.values(preflight).length || Object.values(preflight).some((value) => value !== true)) {
      errors.push(issue("DIRECTION_PREFLIGHT", "Every selected-direction preflight gate must pass before a Frame manifest is built."));
    }
    if (selectedDirection.critique?.verdict !== "pass") {
      errors.push(issue("DIRECTION_QUALITY", "The selected visual direction must carry a passing critique verdict."));
    }

    if (rendererMode === "cuebook_template") {
      if (captureReport.schema_version !== "viewpoint-html-capture-v1" || captureReport.source !== path.basename(selectedDirection.html_ref ?? "")) {
        errors.push(issue("CAPTURE_SOURCE_MISMATCH", "Template capture report must bind the selected direction HTML."));
      }
      if (!SHA256_PATTERN.test(captureReport.source_sha256 ?? "")) {
        errors.push(issue("CAPTURE_SOURCE_MISMATCH", "Template capture report must carry the selected HTML sha256."));
      }
      if (renderAudit?.schema_version !== "viewpoint-render-audit-v1" || renderAudit.source_sha256 !== captureReport.source_sha256) {
        errors.push(issue("AUDIT_SOURCE_MISMATCH", "Rendered audit and capture report must bind the same selected HTML bytes."));
      }
    } else {
      if (selectedDirection.html_ref !== null && selectedDirection.html_ref !== undefined) {
        errors.push(issue("BITMAP_HTML_UNEXPECTED", "finished_bitmap must not claim an original HTML source."));
      }
      if (captureReport.schema_version !== "frame-raster-audit-v1" || captureReport.source_kind !== "finished_bitmap") {
        errors.push(issue("RASTER_AUDIT_MISMATCH", "finished_bitmap requires frame-raster-audit-v1."));
      }
      const review = captureReport.image_review;
      if (
        captureReport.valid !== true
        || !Array.isArray(captureReport.errors)
        || captureReport.errors.length !== 0
        || review?.legibility !== "pass"
        || review?.collision !== "pass"
        || review?.imagery_result !== "pass"
        || !["absent", "backend_locked"].includes(review?.mutable_price)
      ) {
        errors.push(issue("RASTER_AUDIT_FAILED", "Finished bitmap must pass bound legibility, collision, imagery, and mutable-price image review."));
      }
      const reviewedRoleHashes = review?.reviewed_role_sha256;
      for (const derivative of captureReport.derivatives ?? []) {
        const role = CAPTURE_KIND_TO_ROLE[derivative?.kind];
        if (role && reviewedRoleHashes?.[role] !== derivative.sha256) {
          errors.push(issue("RASTER_REVIEW_BINDING", `Image review must bind the exact encoded ${role} PNG hash.`));
        }
      }
    }

    const derivatives = new Map((captureReport.derivatives ?? []).filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)).map((item) => [item.kind, item]));
    const selectedRefs = [
      ["full", selectedDirection.preview_ref, 2488, 1056],
      ["compact_622", selectedDirection.compact_preview_ref, 622, 264],
    ];
    for (const [kind, selectedRef, width, height] of selectedRefs) {
      const derivative = derivatives.get(kind);
      if (derivative?.ref !== path.basename(selectedRef ?? "")) {
        errors.push(issue("CAPTURE_REF_MISMATCH", `Capture ${kind} derivative must be the selected direction asset.`));
      }
      if (derivative?.width !== width || derivative?.height !== height) {
        errors.push(issue("CAPTURE_DIMENSIONS", `Capture ${kind} derivative must be ${width} x ${height}.`));
      }
    }
    const og = derivatives.get("og");
    if (og !== undefined && (og.width !== 1200 || og.height !== 630)) {
      errors.push(issue("CAPTURE_DIMENSIONS", "Capture og derivative must be 1200 x 630."));
    }
  }

  const roleHashes = {};
  for (const output of captureReport.derivatives ?? []) {
    const role = CAPTURE_KIND_TO_ROLE[pyStr(output.kind)];
    if (!role) continue;
    // role_hashes carry canonical RGBA pixel hashes, never encoded PNG byte
    // hashes; the backend re-verifies pixels after its own normalization.
    const pixel = output.pixel_sha256;
    if (typeof pixel !== "string" || !SHA256_PATTERN.test(pixel)) {
      errors.push(issue("PIXEL_HASH_MISSING", `Capture derivative ${pyStr(output.kind)} lacks a canonical RGBA pixel_sha256; re-capture with the current capture script.`));
      continue;
    }
    roleHashes[role] = pixel;
  }
  for (const role of REQUIRED_ROLES) {
    if (!(role in roleHashes)) {
      errors.push(issue("ROLE_MISSING", `Capture report has no ${role} rendition; the backend blocks publication without it.`));
    }
  }
  if (new Set(Object.values(roleHashes)).size !== Object.keys(roleHashes).length) {
    errors.push(issue("ROLE_HASH_DUPLICATE", "Each capture role must bind distinct normalized pixels; two renditions decoded to identical pixels."));
  }

  const audit = rendererMode === "finished_bitmap" ? captureReport : renderAudit;
  if (audit?.valid !== true) {
    errors.push(issue("AUDIT_NOT_PASSED", "Selected renderer audit must be valid before a manifest is issued."));
  }
  let profileVersion = audit?.profile_version;
  let auditedAt = audit?.audited_at;
  if (typeof profileVersion !== "string" || !profileVersion.trim() || typeof auditedAt !== "string" || !auditedAt.trim()) {
    errors.push(issue("AUDIT_METADATA_MISSING", "Rendered audit must carry profile_version and audited_at; re-audit with the current audit script."));
    profileVersion = pyStr(profileVersion || "");
    auditedAt = pyStr(auditedAt || "");
  }
  const captureAudit = {
    decision: audit?.valid === true ? "ready" : "blocked",
    status: audit?.valid === true ? "passed" : "failed",
    profile_version: profileVersion,
    audited_at: auditedAt,
  };

  const sourceBindings = [];
  const selectedBindingIds = new Set(selectedDirection?.binding_refs ?? []);
  for (const binding of directionSet.bindings ?? []) {
    if (selectedBindingIds.has(binding.binding_id) && binding.selected_for_display === true) {
      const refs = binding.source_refs || [];
      sourceBindings.push({
        ref: refs.length ? pyStr(refs[0]) : pyStr(binding.binding_id),
        binding_id: pyStr(binding.binding_id),
        sha256: jcs_sha256({ binding_id: pyStr(binding.binding_id), label: pyStr(binding.label), source_refs: refs.map((r) => pyStr(r)) }),
      });
    }
  }
  if (!sourceBindings.length) {
    errors.push(issue("NO_SOURCE_BINDINGS", "A publishable visual carries at least one selected display binding."));
  }

  let fontProfile = null;
  if (rendererMode === "finished_bitmap") {
    fontProfile = {
      profile: EMBEDDED_PIXEL_PROFILE.profile,
      manifest_sha256: jcs_sha256(EMBEDDED_PIXEL_PROFILE),
    };
  } else {
    try {
      const fontsManifestBytes = readFileSync(fontsManifestPath);
      const fonts = JSON.parse(fontsManifestBytes.toString("utf-8"));
      const profile = pyStr(fonts.profile || fonts.font_profile || "cuebook-noi-v1");
      fontProfile = { profile, manifest_sha256: `sha256:${createHash("sha256").update(fontsManifestBytes).digest("hex")}` };
      if (pyStr(fonts.license_mode) === "evaluation") {
        errors.push(issue("TRIAL_FONTS", "Evaluation/Trial fonts cannot enter a publishable manifest."));
      }
    } catch {
      errors.push(issue("FONTS_MANIFEST_UNREADABLE", `Cannot read fonts manifest at ${fontsManifestPath}.`));
      fontProfile = null;
    }
  }

  for (const role of Object.keys(roleHashes)) {
    const text = Object.hasOwn(altTextByRole, role) ? altTextByRole[role] : "";
    if (!text || !String(text).trim()) {
      errors.push(issue("ALT_TEXT_MISSING", `Role ${role} needs non-empty alt text.`));
    }
  }

  if (errors.length) return [null, errors];

  const altText = {};
  for (const role of Object.keys(roleHashes).sort(cpCompare)) altText[role] = altTextByRole[role];
  const manifest = {
    schema_version: SCHEMA_VERSION,
    role_hashes: roleHashes,
    capture_audit: captureAudit,
    source_bindings: sourceBindings,
    font_profile: fontProfile,
    alt_text_by_role: altText,
  };
  return [manifest, []];
}

// json.dumps(value, ensure_ascii=False, indent=2)
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

// str(PurePosixPath(value)) normalization for argparse type=Path arguments.
function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

function main(argv) {
  const spec = {
    "--capture-report": "capture_report",
    "--render-audit": "render_audit",
    "--direction-set": "direction_set",
    "--fonts-manifest": "fonts_manifest",
    "--alt-text": "alt_text",
    "--out": "out",
  };
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (!(flag in spec)) {
      process.stderr.write(`build_frame_visual_manifest.mjs: error: unrecognized arguments: ${arg}\n`);
      process.exit(2);
    }
    const value = eq === -1 ? argv[(i += 1)] : arg.slice(eq + 1);
    if (value === undefined) {
      process.stderr.write(`build_frame_visual_manifest.mjs: error: argument ${flag}: expected one argument\n`);
      process.exit(2);
    }
    args[spec[flag]] = value;
  }
  const alwaysRequired = ["capture_report", "direction_set", "alt_text", "out"];
  const missing = alwaysRequired.filter((name) => !(name in args));
  if (missing.length) {
    process.stderr.write(`build_frame_visual_manifest.mjs: error: the following arguments are required: ${missing.map((name) => `--${name.replace(/_/g, "-")}`).join(", ")}\n`);
    process.exit(2);
  }

  const directionSet = JSON.parse(readFileSync(pathStr(args.direction_set), "utf-8"));
  const selectedDirection = (directionSet.directions ?? []).find((item) => item?.direction_id === directionSet.selected_direction_id);
  const rendererMode = selectedDirection?.renderer_mode ?? "cuebook_template";
  if (rendererMode === "cuebook_template" && (!args.render_audit || !args.fonts_manifest)) {
    process.stderr.write("build_frame_visual_manifest.mjs: error: cuebook_template requires --render-audit and --fonts-manifest\n");
    process.exit(2);
  }
  const [manifest, errors] = build(
    JSON.parse(readFileSync(pathStr(args.capture_report), "utf-8")),
    args.render_audit ? JSON.parse(readFileSync(pathStr(args.render_audit), "utf-8")) : null,
    directionSet,
    args.fonts_manifest ? pathStr(args.fonts_manifest) : null,
    JSON.parse(readFileSync(pathStr(args.alt_text), "utf-8")),
  );
  if (manifest === null) {
    process.stdout.write(pyJsonDumpsIndent({ valid: false, errors }) + "\n");
    process.exit(1);
  }
  writeFileSync(pathStr(args.out), pyJsonDumpsIndent(manifest) + "\n", "utf-8");
  process.stdout.write(pyJsonDumpsIndent({ valid: true, manifest_ref: pathStr(args.out), manifest_sha256: jcs_sha256(manifest) }) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
