import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManifest } from "../scripts/finalize_wide_viewpoint.mjs";
import {
  COLORS,
  WORDMARK_PATHS,
  render,
  renderSvg,
} from "../scripts/render_viewpoint_visual.mjs";
import {
  GRAMMAR_JOBS,
  validateManifest,
  validateSpec,
} from "../scripts/validate_viewpoint_visual.mjs";
import {
  createWideFinalizerFixture,
  grammarSpec,
  seriesSpec,
} from "./viewpoint_visual_fixtures.mjs";

function withTempDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "cuebook-viewpoint-visual-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function resultCodes(result) {
  return new Set(result.errors.map((item) => item.code));
}

function assertValid(result) {
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
}

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground), second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("all eleven grammars validate, render, and produce valid manifests", () => {
  for (const grammar of Object.keys(GRAMMAR_JOBS)) {
    const spec = grammarSpec(grammar);
    assertValid(validateSpec(spec));
    withTempDirectory((directory) => {
      const result = render(spec, directory, { rasterize: false });
      assertValid(validateManifest(result.manifest, directory));
      assert.equal(result.manifest.grammar, grammar);
    });
  }
});

test("qualitative reaction uses rails without a curve", () => {
  const svg = renderSvg(grammarSpec("reaction_test"));
  assert.equal(svg.match(/data-rail="/gu)?.length, 2);
  assert.ok(!svg.includes("<polyline"));
  assert.ok(svg.includes("Bad-news pressure"));
  assert.ok(svg.includes("Price response"));
});

test("reported outcomes use key-number rails", () => {
  const spec = grammarSpec("parallel_contrast"), svg = renderSvg(spec);
  assertValid(validateSpec(spec));
  assert.ok(svg.includes("5x"));
  assert.ok(svg.includes("Spot ETH experience"));
  assert.ok(!svg.includes("<polyline"));
});

test("event timeline marks only the explicit future path", () => {
  const svg = renderSvg(grammarSpec("event_unwind"));
  assert.equal(svg.match(/data-stage="/gu)?.length, 3);
  assert.ok(svg.includes("Wait for sellers"));
  assert.ok(svg.includes('stroke-dasharray="8 7"'));
  assert.ok(!svg.includes("<polyline"));
  const withoutTime = grammarSpec("event_unwind");
  withoutTime.data.stages[1].occurred_at = null;
  assertValid(validateSpec(withoutTime));
  assert.ok(!renderSvg(withoutTime).includes("14 JUL / 07:00"));
});

test("series modes retain quantitative gates", () => {
  for (const grammar of ["reaction_test", "parallel_contrast", "sentiment_witness", "event_unwind", "factor_rotation", "binary_level"]) assertValid(validateSpec(seriesSpec(grammar)));
  const unsynchronized = seriesSpec("parallel_contrast");
  unsynchronized.data.series[1].points[1].x = "2026-07-14T06:05:00Z";
  assert.ok(resultCodes(validateSpec(unsynchronized)).has("SYNCHRONIZED_SERIES"));
  const notUnwound = seriesSpec("event_unwind");
  notUnwound.data.series[0].points.at(-1).y = 135;
  assert.ok(resultCodes(validateSpec(notUnwound)).has("UNWIND_ARITHMETIC"));
});

test("qualitative mode rejects numeric payload", () => {
  const spec = grammarSpec("reaction_test");
  Object.assign(spec.data.rails[0], { display_value: "5x", numeric_value: 5, unit: "x" });
  assert.ok(resultCodes(validateSpec(spec)).has("QUALITATIVE_NUMERIC_DATA"));
});

test("mixed feedback keeps both shocks beside one loop", () => {
  const spec = grammarSpec("feedback_loop"), svg = renderSvg(spec);
  assert.ok(svg.includes("-15.37%"));
  assert.ok(svg.includes("about -9%"));
  assert.equal(svg.match(/data-node="/gu)?.length, 3);
  assert.equal(spec.payload_mode, "mixed");
});

test("series binary level draws a real path and separate anchors", () => {
  const spec = seriesSpec("binary_level"), svg = renderSvg(spec);
  assertValid(validateSpec(spec));
  assert.ok(svg.includes("<polyline"));
  assert.ok(svg.includes('data-level="L1"'));
  assert.ok(svg.includes("KRW 1.85m"));
  const levelText = /<text ([^>]+)>[^<]*<tspan[^>]*>Decision level/u.exec(svg);
  const endpointText = /<text ([^>]+)>[^<]*<tspan[^>]*>Price path/u.exec(svg);
  assert.ok(levelText?.[1].includes('text-anchor="start"'), levelText?.[0]);
  assert.ok(endpointText?.[1].includes('text-anchor="end"'), endpointText?.[0]);
});

test("two-series endpoint labels stay inside the canvas", () => {
  const svg = renderSvg(seriesSpec("parallel_contrast"));
  assert.equal(svg.match(/<text x="540\.0"/gu)?.length, 2);
  assert.ok(!svg.includes('<text x="558.0"'));
});

test("qualitative factor rotation renders formula without invented value", () => {
  const spec = grammarSpec("factor_rotation");
  assert.equal(spec.data.values.length, 0);
  assert.ok(spec.data.rails.every((item) => item.numeric_value === null));
  assert.ok(renderSvg(spec).includes("cash-flow return - duration return"));
});

test("SVG output enforces accessibility, token, and straight-series contracts", () => {
  const allowedColors = new Set(Object.values(COLORS));
  for (const grammar of Object.keys(GRAMMAR_JOBS)) {
    const svg = renderSvg(grammarSpec(grammar));
    assert.ok(svg.includes('role="img"'));
    assert.ok(svg.includes('aria-labelledby="vv-title vv-desc"'));
    assert.ok(svg.includes("<title id="));
    assert.ok(svg.includes("<desc id="));
    assert.ok(!svg.includes("<linearGradient"));
    assert.doesNotMatch(svg, /<path[^>]+data-series=/u);
    for (const match of svg.matchAll(/<polyline[^>]+data-series="[^"]+"[^>]*>/gu)) assert.ok(match[0].includes('data-interpolation="none"'));
    assert.ok(!svg.includes("source:test"));
    assert.doesNotMatch(svg, />(?:ready|conditional|future|blocked|settlement)</u);
    const fontSizes = [...svg.matchAll(/font-size="(\d+)"/gu)].map((match) => Number(match[1]));
    assert.ok(fontSizes.length && Math.min(...fontSizes) >= 22);
    const colors = new Set([...svg.matchAll(/#[0-9A-Fa-f]{6}/gu)].map((match) => match[0]));
    assert.ok([...colors].every((color) => allowedColors.has(color)), JSON.stringify([...colors].filter((color) => !allowedColors.has(color))));
  }
});

test("editorial compositions remain distinct and unframed", () => {
  const signatures = {
    reaction_test: 'stroke-width="7.0"',
    parallel_contrast: 'x1="360.0" y1="228.0"',
    category_reframe: 'data-edge="E1"',
    relative_value_trigger: "Trigger cleared",
    policy_pivot: 'data-event="EVT1"',
    sentiment_witness: 'x1="342.0" y1="238.0"',
    event_unwind: 'data-stage="T3"',
    feedback_loop: 'data-role="causal-loop"',
    binary_level: 'data-level="L1"',
    expectation_gap: 'font-size="50"',
    factor_rotation: 'x1="292.0" y1="290.0"',
  };
  for (const [grammar, signature] of Object.entries(signatures)) {
    const svg = renderSvg(grammarSpec(grammar));
    assert.ok(svg.includes('data-design-language="cuebook-editorial-signal-v2"'));
    assert.ok(svg.includes(`data-composition="${grammar}"`));
    assert.ok(svg.includes(signature), grammar);
    assert.ok((svg.match(/<rect/gu) ?? []).length <= 5, grammar);
    assert.doesNotMatch(svg, /<rect[^>]+data-(?:rail|node|stage)=/u);
  }
});

test("canonical wordmark is the final visual layer", () => {
  const svg = renderSvg(grammarSpec("parallel_contrast"));
  const match = /<g data-cuebook-wordmark="v1".*?>(.*?)<\/g>\s*<\/svg>/su.exec(svg);
  assert.ok(match);
  assert.ok(svg.includes('transform="translate(625 388)"'));
  const paths = [...match[1].matchAll(/<path d="([^"]+)"/gu)].map((item) => item[1]);
  assert.deepEqual(paths, WORDMARK_PATHS);
  assert.equal(match[1].match(/fill="currentColor"/gu)?.length, WORDMARK_PATHS.length);
  assert.doesNotMatch(svg, /<text[^>]*>.*?(?:Cuebook|>C<).*?<\/text>/su);
});

test("text tokens meet small-text contrast", () => {
  for (const surface of ["canvas", "surface"]) for (const key of ["ink", "muted", "positive", "comparison", "negative", "highlight_ink"]) assert.ok(contrastRatio(COLORS[key], COLORS[surface]) >= 4.5, `${surface}:${key}`);
});

test("SVG and manifest rendering are deterministic", () => {
  const spec = grammarSpec("parallel_contrast");
  assert.equal(renderSvg(spec), renderSvg(structuredClone(spec)));
  withTempDirectory((first) => withTempDirectory((second) => {
    const one = render(spec, first, { rasterize: false }), two = render(structuredClone(spec), second, { rasterize: false });
    assert.deepEqual(one.manifest, two.manifest);
    assert.deepEqual(readFileSync(one.svg_path), readFileSync(two.svg_path));
  }));
});

test("wide manifest contract uses launch dimensions and HTML source", () => {
  withTempDirectory((directory) => {
    const manifest = structuredClone(render(grammarSpec("parallel_contrast"), directory, { rasterize: false }).manifest);
    const placeholderHash = `sha256:${"1".repeat(64)}`;
    Object.assign(manifest, { render_profile: "wide_2488", spec_ref: "VDIR_parallelcontrast20260714", grammar: "event_transmission", visual_job: "render_selected_direction", dimensions: { width: 2488, height: 1056 }, theme: "quiet-cobalt" });
    manifest.asset = {
      html: { ref: "direction.html", sha256: placeholderHash },
      svg: null,
      font_manifest: { ref: "fonts/font-assets-v1.json", sha256: placeholderHash },
      png_derivatives: [
        { kind: "full", ref: "viewpoint-2488.png", width: 2488, height: 1056, sha256: placeholderHash },
        { kind: "compact_622", ref: "viewpoint-622.png", width: 622, height: 264, sha256: placeholderHash },
      ],
      derivative_bundle_hash: placeholderHash,
    };
    assertValid(validateManifest(manifest));
    manifest.dimensions = { width: 720, height: 420 };
    assert.ok(resultCodes(validateManifest(manifest)).has("DIMENSIONS"));
  });
});

test("wide finalizer binds selected HTML, production fonts, and both PNGs", () => {
  withTempDirectory((directory) => {
    const { directionSet } = createWideFinalizerFixture(directory);
    const manifest = buildManifest(directionSet, directory, { observedAt: "2026-07-15T07:00:00Z", decisionCutoffAt: "2026-07-15T07:00:00Z", generatedAt: "2026-07-15T07:01:00Z" });
    assertValid(validateManifest(manifest, directory));
    assert.equal(manifest.render_profile, "wide_2488");
    assert.equal(manifest.theme, "quiet-cobalt");
    assert.equal(manifest.asset.font_manifest.ref, "fonts/font-assets-v1.json");
    assert.deepEqual(new Set(manifest.asset.png_derivatives.map((item) => item.kind)), new Set(["full", "compact_622"]));
  });
});

test("asset hash tampering is detected", () => {
  withTempDirectory((directory) => {
    const result = render(grammarSpec("binary_level"), directory, { rasterize: false });
    writeFileSync(result.svg_path, "tampered", "utf8");
    assert.ok(resultCodes(validateManifest(result.manifest, directory)).has("ASSET_HASH"));
  });
});

test("rehashed noncanonical wordmark is rejected", () => {
  withTempDirectory((directory) => {
    const result = render(grammarSpec("binary_level"), directory, { rasterize: false });
    const tampered = readFileSync(result.svg_path, "utf8").replace("M6.61403", "M6.7");
    writeFileSync(result.svg_path, tampered, "utf8");
    result.manifest.asset.svg.sha256 = `sha256:${createHash("sha256").update(tampered).digest("hex")}`;
    assert.ok(resultCodes(validateManifest(result.manifest, directory)).has("WORDMARK_PATHS"));
  });
});

test("renderer stays byte-compatible with migration goldens", () => {
  const golden = new Map([
    ["reaction_test", "47d95451a7ec6b23c0e5318939fc01fec942869e4185017950ed6fdc96aadd6c"],
    ["parallel_contrast", "29589f98ccee8f9064aa3a1ba6ea0f7417e99470c7852ca3ed6f392f84573a2e"],
    ["category_reframe", "cbf8a1bbc854f7bd0be1ce0e091ff3986ee8c4f92a0e15d7f8804680af221225"],
    ["relative_value_trigger", "7a2c4b12db6b0f99e9b86389c1f3dc331404a07eda53506e9c51c14e0a7528d8"],
    ["policy_pivot", "5341c3e939f456733302a6466caeb93f255483001f6d809efb57bacf53108c8f"],
    ["sentiment_witness", "5f04d7723a7e3bc1fe488c6159e5ba2c9a78729a98aba1917772df130f8463e1"],
    ["event_unwind", "de2ee83183d8ced25ea929a4115dfaa0809a38d88e2fdde657d9f35557add26a"],
    ["feedback_loop", "0999eb172a88cd9a93e0ce57857d92146a8c87a7568ba26251e5c8370c23ae23"],
    ["binary_level", "455cf1599b0e9ff889dfe85ea59731543a0c9c2409c2f0e9d776c23f3358686e"],
    ["expectation_gap", "9c99a2757cc1579ef9f9ebbd974924b37401295134bad9b5a7a78a1a258f08f0"],
    ["factor_rotation", "09c5176b494d98cba95876012e940570e70d026deaf20d4e0616cbdd881e972c"],
  ]);
  for (const [grammar, expected] of golden) assert.equal(createHash("sha256").update(renderSvg(grammarSpec(grammar))).digest("hex"), expected, grammar);
  const seriesGolden = new Map([
    ["reaction_test", "a4db2e7ebdda63907f1b6120a9ce8702fec026685f6442b693ae259bfe4b2455"],
    ["parallel_contrast", "61d3d08be08b025df9ab6ff2e644dc8c941b65639deac683a191aafcd34b7028"],
    ["sentiment_witness", "dc6a6937f05bc403f9c2bf9c101ed516f68e4e8a23792b79e216431c6ff6f92b"],
    ["event_unwind", "016898f9bad887213ba96d48e8c47149a01bf2671daa124525e5741b8a19be2d"],
    ["factor_rotation", "a2af55c34eb372a95732b227fe735cf61a70028c7c60c09b07a0c9ee90cb6635"],
    ["binary_level", "a7cf19847420e930375c428f33d4a217df22d5e7100ea85e20e983fbb7a68931"],
  ]);
  for (const [grammar, expected] of seriesGolden) assert.equal(createHash("sha256").update(renderSvg(seriesSpec(grammar))).digest("hex"), expected, `${grammar}:series`);
});

const browserAvailable = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].some(existsSync);

test("rasterizer writes the atomic full and compact derivative pair", { skip: !browserAvailable }, () => {
  withTempDirectory((directory) => {
    const result = render(grammarSpec("parallel_contrast"), directory, { rasterize: true });
    assert.deepEqual(new Set(result.manifest.asset.png_derivatives.map((item) => item.kind)), new Set(["full", "compact_360"]));
    assert.ok(result.manifest.asset.derivative_bundle_hash);
    assertValid(validateManifest(result.manifest, directory));
  });
});
