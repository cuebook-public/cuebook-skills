import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stage } from "../scripts/stage_noi_font_assets.mjs";

function withTemp(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-font-test-"));
  try { return run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function makeFonts(root, prefix = "NoiGrotesk") {
  for (const weight of ["Regular", "Medium", "Semibold", "Bold"]) {
    writeFileSync(path.join(root, `${prefix}-${weight}.ttf`), `font:${weight}`);
  }
}

test("evaluation stages original files and manifest", () => withTemp((root) => {
  const source = path.join(root, "Noi Grotesk Family TRIAL");
  const target = path.join(root, "artifact", "fonts");
  mkdirSync(source);
  makeFonts(source);
  const manifest = stage(source, target, { license_mode: "evaluation", license_ref: "EVAL_LOCAL_01" });
  assert.equal(manifest.release_eligible, false);
  assert.deepEqual(new Set(manifest.files.map((item) => item.weight)), new Set([400, 500, 600, 700]));
  assert.match(readFileSync(path.join(target, "cuebook-noi-fonts.css"), "utf8"), /font-family: "Cuebook Noi"/);
  assert.equal(existsSync(path.join(target, "font-assets-v1.json")), true);
}));

test("production rejects Trial source", () => withTemp((root) => {
  const source = path.join(root, "TRIAL");
  mkdirSync(source);
  makeFonts(source);
  assert.throws(
    () => stage(source, path.join(root, "out"), { license_mode: "production", license_ref: "LICENSE_01" }),
    /rejects Trial/,
  );
}));

test("production licensed source is release eligible", () => withTemp((root) => {
  const source = path.join(root, "licensed-noi");
  mkdirSync(source);
  makeFonts(source);
  const manifest = stage(source, path.join(root, "out"), { license_mode: "production", license_ref: "LICENSE_01" });
  assert.equal(manifest.release_eligible, true);
  assert.equal(manifest.license_mode, "production");
}));
