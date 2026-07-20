#!/usr/bin/env node
// Freeze a selected VisualDirectionSetV1 direction as a wide ViewpointVisualV1.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path, { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validate as validateDirectionSet } from "../../direct-cuebook-viewpoint-visual/scripts/validate_visual_direction_set.mjs";
import { validateManifest } from "./validate_viewpoint_visual.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = resolve(here, "..");

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function sha256Bytes(data) {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function resolvedRoot(assetRoot) {
  try {
    return realpathSync(assetRoot);
  } catch {
    return resolve(assetRoot);
  }
}

export function safeAssetPath(assetRoot, ref, { base = null } = {}) {
  if (path.isAbsolute(ref) || ref.split("/").includes("..")) throw new Error(`Unsafe artifact-local asset ref: ${ref}`);
  const root = resolvedRoot(assetRoot);
  const lexical = resolve(base ?? assetRoot, ref);
  let candidate;
  try {
    candidate = realpathSync(lexical);
  } catch {
    candidate = lexical;
  }
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Asset ref escapes the artifact root: ${ref}`);
  return candidate;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function productionFontManifest(htmlText, assetRoot) {
  const attribute = (name) => {
    const match = new RegExp(`\\b${escapeRegex(name)}=["']([^"']+)["']`, "iu").exec(htmlText);
    if (!match) throw new Error(`Selected HTML is missing ${name}.`);
    return match[1];
  };
  if (attribute("data-font-profile") !== "cuebook-noi-v1") throw new Error("Selected HTML must use the cuebook-noi-v1 font profile.");
  if (attribute("data-font-license-mode") !== "production") throw new Error("Final publication requires production font license mode.");
  const manifestRef = attribute("data-font-manifest-ref");
  const manifestPath = safeAssetPath(assetRoot, manifestRef);
  if (!isFile(manifestPath)) throw new Error(`Font manifest is missing: ${manifestPath}`);
  const manifestBytes = readFileSync(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error(`Font manifest is invalid JSON: ${manifestPath}`);
  }
  if (manifest.schema_version !== "cuebook-font-assets-v1" || manifest.font_profile_id !== "cuebook-noi-v1") throw new Error("Font manifest does not bind the Cuebook Noi profile.");
  const licenseRef = String(manifest.license_ref || "");
  if (manifest.license_mode !== "production" || manifest.release_eligible !== true) throw new Error("Font manifest is not release-eligible production material.");
  if ([...licenseRef].length < 6 || /trial|eval/iu.test(licenseRef)) throw new Error("Production font manifest needs an opaque non-evaluation license_ref.");
  const cssRef = String(manifest.css_ref || ""), cssPath = safeAssetPath(assetRoot, cssRef, { base: dirname(manifestPath) });
  if (!isFile(cssPath) || sha256Bytes(readFileSync(cssPath)) !== manifest.css_sha256) throw new Error("Font CSS is missing or does not match the manifest hash.");
  const expectedCssRef = path.posix.join(path.posix.dirname(manifestRef), cssRef);
  if (!new RegExp(`href=["'](?:\\./)?${escapeRegex(expectedCssRef)}["']`, "iu").test(htmlText)) throw new Error("Selected HTML does not load the CSS bound by its font manifest.");
  const files = manifest.files;
  const weights = Array.isArray(files) ? new Set(files.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)).map((item) => item.weight)) : new Set();
  if (!Array.isArray(files) || weights.size !== 4 || ![400, 500, 600, 700].every((weight) => weights.has(weight))) throw new Error("Font manifest must bind upright Noi weights 400, 500, 600, and 700.");
  for (const item of files) {
    const ref = String(item.ref || ""), sourceName = String(item.source_name || "");
    if (/trial/iu.test(ref + sourceName)) throw new Error("Production font manifest cannot reference Trial font assets.");
    const fontPath = safeAssetPath(assetRoot, ref, { base: dirname(manifestPath) });
    if (!isFile(fontPath) || sha256Bytes(readFileSync(fontPath)) !== item.sha256) throw new Error(`Font asset is missing or does not match its manifest hash: ${ref}`);
  }
  return [manifestRef, manifestBytes];
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function selectedDirection(directionSet) {
  if (directionSet.state !== "selected") throw new Error("VisualDirectionSetV1 must be selected before finalization.");
  const selectedId = directionSet.selected_direction_id;
  for (const direction of directionSet.directions ?? []) if (direction.direction_id === selectedId) return direction;
  throw new Error("Selected direction does not resolve inside VisualDirectionSetV1.");
}

export function payloadMode(bindings) {
  const kinds = new Set(bindings.map((item) => item.kind));
  const hasSeries = kinds.has("series");
  const hasKeyNumbers = ["metric", "level"].some((kind) => kinds.has(kind)) || bindings.some((item) => typeof item.value === "number");
  const hasQualitative = [...kinds].some((kind) => !new Set(["series", "metric", "level"]).has(kind));
  if (hasSeries && (hasKeyNumbers || hasQualitative)) return "mixed";
  if (hasSeries) return "series";
  if (hasKeyNumbers) return "key_numbers";
  return "qualitative";
}

export function buildManifest(directionSet, assetRoot, { observedAt, decisionCutoffAt, generatedAt, state = "frozen" }) {
  const direction = selectedDirection(directionSet);
  const bindingIds = new Set(direction.binding_refs ?? []);
  const bindings = (directionSet.bindings ?? []).filter((item) => bindingIds.has(item.binding_id));
  if (!bindings.length) throw new Error("Selected direction has no resolved bindings.");
  const htmlPath = join(assetRoot, direction.html_ref), fullPath = join(assetRoot, direction.preview_ref), capturePath = join(assetRoot, direction.capture_report_ref);
  for (const filePath of [htmlPath, fullPath, capturePath]) if (!isFile(filePath)) throw new Error(`Required selected-direction asset is missing: ${filePath}`);

  const htmlBytes = readFileSync(htmlPath);
  const [fontManifestRef, fontManifestBytes] = productionFontManifest(new TextDecoder("utf-8", { fatal: true }).decode(htmlBytes), assetRoot);
  const fullBytes = readFileSync(fullPath);
  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const captureByKind = Object.fromEntries((capture.derivatives ?? []).filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)).map((item) => [item.kind, item]));
  const expected = {
    full: [direction.preview_ref, 2488, 1056, sha256Bytes(fullBytes)],
  };
  if (capture.source_sha256 !== sha256Bytes(htmlBytes)) throw new Error("Capture report does not bind the selected HTML bytes.");
  for (const [kind, [, width, height, digest]] of Object.entries(expected)) {
    const item = captureByKind[kind];
    if (item === null || typeof item !== "object" || Array.isArray(item) || item.width !== width || item.height !== height || item.sha256 !== digest) throw new Error(`Capture report does not bind the ${kind} derivative.`);
    if (typeof item.painted_ratio !== "number" || item.painted_ratio < 0.006) throw new Error(`Capture report marks the ${kind} derivative as visually blank.`);
  }

  const sourceRefs = unique(bindings.flatMap((binding) => (binding.source_refs ?? []).map(String)));
  if (!sourceRefs.length) throw new Error("Selected direction bindings do not retain source refs.");
  const message = directionSet.message, grammar = directionSet.logic_progression.pattern, colorSystem = direction.layout_system.color_system, directionId = direction.direction_id;
  const visualSuffix = directionId.startsWith("VDIR_") ? directionId.slice("VDIR_".length) : directionId;
  const htmlDigest = sha256Bytes(htmlBytes), tags = unique([String(message.direction), String(direction.route)]);
  const refsByKind = Object.fromEntries(["series", "metric", "level", "event"].map((kind) => [kind, bindings.filter((item) => item.kind === kind).map((item) => item.binding_id)]));
  return {
    schema_version: "viewpoint-visual-v1",
    visual_id: `VVIS_${visualSuffix}_${htmlDigest.slice(-12)}`,
    render_profile: "wide_2488",
    spec_ref: directionId,
    grammar,
    payload_mode: payloadMode(bindings),
    visual_job: "render_selected_direction",
    state,
    generated_at: generatedAt,
    dimensions: { width: 2488, height: 1056 },
    theme: colorSystem.preset_id,
    lineage: {
      input_artifact_refs: unique([directionSet.direction_set_id, ...directionSet.input_refs]),
      source_refs: sourceRefs,
      series_refs: refsByKind.series,
      value_refs: refsByKind.metric,
      level_refs: refsByKind.level,
      event_refs: refsByKind.event,
      node_refs: [],
      edge_refs: [],
      rail_refs: [],
      stage_refs: [],
      decision_cutoff_at: decisionCutoffAt,
    },
    content: {
      headline: message.claim,
      observation: message.because,
      observed_at: observedAt,
      strategy_tags: tags,
      alt_text: `${message.claim}. ${message.because}. ${message.implication}.`,
      watermark: "Cuebook",
    },
    asset: {
      html: { ref: direction.html_ref, sha256: htmlDigest },
      svg: null,
      font_manifest: { ref: fontManifestRef, sha256: sha256Bytes(fontManifestBytes) },
      png_derivatives: Object.entries(expected).map(([kind, [ref, width, height, digest]]) => ({ kind, ref, width, height, sha256: digest })),
      derivative_bundle_hash: sha256Bytes(fullBytes),
    },
    quality_report: { decision: "ready", warnings: [], hard_failures: [] },
  };
}

export function atomicWrite(pathName, payload) {
  mkdirSync(dirname(pathName), { recursive: true });
  const temporary = join(dirname(pathName), `.${basename(pathName)}.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  renameSync(temporary, pathName);
}

function parseCli(argv) {
  const result = { directionSet: null, assetRoot: null, observedAt: null, decisionCutoffAt: null, generatedAt: null, state: "frozen", output: null };
  const keys = { "--asset-root": "assetRoot", "--observed-at": "observedAt", "--decision-cutoff-at": "decisionCutoffAt", "--generated-at": "generatedAt", "--state": "state", "--output": "output" };
  for (let index = 0; index < argv.length; index += 1) {
    if (Object.hasOwn(keys, argv[index])) {
      result[keys[argv[index]]] = argv[index + 1] ?? null;
      index += 1;
    } else if (result.directionSet === null) result.directionSet = argv[index];
  }
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseCli(argv);
  let output;
  try {
    if ([args.directionSet, args.assetRoot, args.observedAt, args.decisionCutoffAt, args.generatedAt, args.output].some((item) => item === null)) throw new Error("direction_set, asset timestamps, and output are required");
    if (!new Set(["ready", "frozen"]).has(args.state)) throw new Error("state must be ready or frozen");
    const directionSet = JSON.parse(readFileSync(args.directionSet, "utf8"));
    const directionErrors = validateDirectionSet(directionSet, args.assetRoot);
    if (directionErrors.length) throw new Error(`Invalid VisualDirectionSetV1: ${directionErrors.map((item) => `${item.code}: ${item.message}`).join("; ")}`);
    const manifest = buildManifest(directionSet, args.assetRoot, { observedAt: args.observedAt, decisionCutoffAt: args.decisionCutoffAt, generatedAt: args.generatedAt, state: args.state });
    const validation = validateManifest(manifest, args.assetRoot);
    if (!validation.valid) throw new Error(`Final ViewpointVisualV1 failed validation: ${validation.errors.map((item) => `${item.code}: ${item.message}`).join("; ")}`);
    atomicWrite(args.output, manifest);
    output = { ok: true, manifest: args.output, visual_id: manifest.visual_id };
  } catch (error) {
    output = { ok: false, error: error.message };
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
