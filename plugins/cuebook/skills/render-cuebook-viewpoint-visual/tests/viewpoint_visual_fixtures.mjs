import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GRAMMAR_JOBS } from "../scripts/validate_viewpoint_visual.mjs";

export const SOURCES = Array.from({ length: 9 }, (_, index) => `source:test:${index + 1}`);

export function emptyData() {
  return Object.fromEntries(["series", "values", "levels", "events", "nodes", "edges", "rails", "stages"].map((key) => [key, []]));
}

export function baseSpec(grammar, mode) {
  return {
    schema_version: "viewpoint-visual-spec-v1",
    spec_id: `VVSPEC_${grammar.replaceAll("_", "")}20260714`,
    revision: 1,
    state: "ready",
    grammar,
    payload_mode: mode,
    visual_job: GRAMMAR_JOBS[grammar],
    lineage: {
      input_artifact_refs: ["POST_viewpoint20260714"],
      source_refs: SOURCES,
      decision_cutoff_at: "2026-07-14T09:00:00Z",
    },
    frame: {
      headline: "The market is telling a different story",
      observation: "The explicit evidence changes how I frame the trade.",
      observed_at: "2026-07-14T08:30:00Z",
      strategy_tags: ["event test", "relative value", "short horizon", "risk check"],
      alt_text: "A compact Cuebook visual presents the creator judgment and its explicit evidence relationship.",
    },
    data: emptyData(),
    render: {
      layout: "landscape",
      width: 720,
      height: 420,
      theme: "cuebook_accessible_light",
      watermark: "Cuebook",
      generated_at: "2026-07-14T09:01:00Z",
    },
    quality_report: { decision: "ready", warnings: [], hard_failures: [] },
  };
}

export function rail(identifier, role, label, detail, {
  displayValue = null,
  numericValue = null,
  unit = null,
  shape = "circle",
  pathKind = "solid",
  source = SOURCES[0],
  formula = null,
} = {}) {
  return {
    id: identifier,
    label,
    detail,
    role,
    display_value: displayValue,
    numeric_value: numericValue,
    unit,
    formula,
    source_refs: [source],
    shape,
    path_kind: pathKind,
  };
}

export function node(identifier, role, label, shape, source, pathKind = "solid") {
  return { id: identifier, label, role, source_refs: [source], shape, path_kind: pathKind };
}

export function edge(identifier, sourceId, targetId, relation, source, pathKind = "solid", label = null) {
  return { id: identifier, from: sourceId, to: targetId, relation, label, source_refs: [source], path_kind: pathKind };
}

export function value(identifier, role, label, display, number, unit, source, shape, formula = null) {
  return {
    id: identifier,
    label,
    role,
    display_value: display,
    numeric_value: number,
    unit,
    as_of: "2026-07-14T08:20:00Z",
    source_ref: source,
    shape,
    formula,
  };
}

export function observedSeries(identifier, role, label, values, source, unit = "%") {
  const times = ["2026-07-14T05:00:00Z", "2026-07-14T06:00:00Z", "2026-07-14T07:00:00Z", "2026-07-14T08:00:00Z"];
  return {
    id: identifier,
    label,
    role,
    data_kind: "observed",
    unit,
    source_ref: source,
    points: times.map((timestamp, index) => ({ x: timestamp, y: values[index], source_ref: null })),
  };
}

function event(identifier, label, occurredAt, source) {
  return { id: identifier, label, occurred_at: occurredAt, source_ref: source };
}

function level(identifier, role, label, displayValue, numericValue, unit, relation, relationLabel, source) {
  return {
    id: identifier,
    label,
    role,
    display_value: displayValue,
    numeric_value: numericValue,
    unit,
    relation,
    relation_label: relationLabel,
    source_ref: source,
  };
}

export function grammarSpec(grammar) {
  let spec;
  if (grammar === "reaction_test") {
    spec = baseSpec(grammar, "qualitative");
    Object.assign(spec.frame, {
      headline: "Bad news landed, but price barely moved",
      observation: "Pressure increased while the tape stayed muted.",
      alt_text: "Two rails compare rising bad-news pressure with a muted reported price response.",
    });
    spec.data.rails = [
      rail("R1", "pressure", "Bad-news pressure", "Warnings intensified", { shape: "triangle", source: SOURCES[0] }),
      rail("R2", "response", "Price response", "The reported move stayed muted", { shape: "circle", source: SOURCES[1] }),
    ];
  } else if (grammar === "parallel_contrast") {
    spec = baseSpec(grammar, "key_numbers");
    Object.assign(spec.frame, {
      headline: "Savings utility is not the same bet as spot ETH",
      observation: "Reported outcomes belong on parallel rails, not a fake chart.",
      alt_text: "Parallel rails compare a reported five-times five-year savings outcome with the spot ETH experience.",
    });
    spec.data.rails = [
      rail("R1", "primary", "Five-year savings", "Reported savings outcome", { displayValue: "5x", numericValue: 5, unit: "x", shape: "circle", source: SOURCES[0] }),
      rail("R2", "comparison", "Spot ETH experience", "Reported spot exposure", { displayValue: "spot ETH", shape: "square", source: SOURCES[1] }),
    ];
  } else if (grammar === "category_reframe") {
    spec = baseSpec(grammar, "qualitative");
    spec.data.nodes = [node("N1", "frame_from", "Token beta proxy", "square", SOURCES[0]), node("N2", "frame_to", "Savings network", "circle", SOURCES[1])];
    spec.data.edges = [edge("E1", "N1", "N2", "reframes", SOURCES[2], "solid", "new frame")];
  } else if (grammar === "relative_value_trigger") {
    spec = baseSpec(grammar, "key_numbers");
    spec.data.values = [value("V1", "spread", "Pair spread", "1.2pp", 1.2, "pp", SOURCES[0], "circle")];
    spec.data.levels = [level("L1", "trigger", "Activation level", "1.0pp", 1, "pp", "above", "Trigger cleared", SOURCES[1])];
  } else if (grammar === "policy_pivot") {
    spec = baseSpec(grammar, "qualitative");
    spec.data.nodes = [node("N1", "policy_before", "Inflation first", "square", SOURCES[0]), node("N2", "policy_after", "Growth protection", "circle", SOURCES[1], "conditional")];
    spec.data.edges = [edge("E1", "N1", "N2", "pivots", SOURCES[2], "conditional", "stance turns")];
    spec.data.events = [event("EVT1", "Policy meeting", "2026-07-14T07:00:00Z", SOURCES[3])];
  } else if (grammar === "sentiment_witness") {
    spec = baseSpec(grammar, "key_numbers");
    spec.data.rails = [
      rail("R1", "baseline", "Prior sentiment", "Earlier survey reading", { displayValue: "42", numericValue: 42, unit: "index", shape: "square", source: SOURCES[0] }),
      rail("R2", "witness", "Current witness", "Latest survey reading", { displayValue: "68", numericValue: 68, unit: "index", shape: "circle", source: SOURCES[1] }),
    ];
  } else if (grammar === "event_unwind") {
    spec = baseSpec(grammar, "qualitative");
    Object.assign(spec.frame, {
      headline: "The event trade moves from pre-buy to patience",
      observation: "Crowding exited on the event; the next leg waits for supply.",
      alt_text: "A three-stage timeline moves from crowded pre-buy to event-day exit, then a dashed future path to waiting for sellers.",
    });
    spec.data.stages = [
      { id: "T1", label: "Crowded pre-buy", detail: "Positioning built early", role: "pre_event", occurred_at: null, display_value: null, numeric_value: null, unit: null, source_refs: [SOURCES[0]], shape: "square", path_kind: "solid" },
      { id: "T2", label: "Event-day exit", detail: "Holders sold the release", role: "event_day", occurred_at: "2026-07-14T07:00:00Z", display_value: null, numeric_value: null, unit: null, source_refs: [SOURCES[1]], shape: "triangle", path_kind: "solid" },
      { id: "T3", label: "Wait for sellers", detail: "Re-entry waits for supply", role: "next_step", occurred_at: null, display_value: null, numeric_value: null, unit: null, source_refs: [SOURCES[2]], shape: "circle", path_kind: "future" },
    ];
  } else if (grammar === "feedback_loop") {
    spec = baseSpec(grammar, "mixed");
    spec.data.nodes = [node("N1", "loop", "Shock hits flows", "circle", SOURCES[0]), node("N2", "loop", "Flows hit price", "square", SOURCES[1]), node("N3", "loop", "Price hits mood", "diamond", SOURCES[2], "conditional")];
    spec.data.edges = [edge("E1", "N1", "N2", "reinforces", SOURCES[3]), edge("E2", "N2", "N3", "reinforces", SOURCES[4], "conditional"), edge("E3", "N3", "N1", "reinforces", SOURCES[5], "conditional")];
    spec.data.values = [value("V1", "shock_primary", "Event shock", "-15.37%", -15.37, "%", SOURCES[6], "triangle"), value("V2", "shock_secondary", "Index move", "about -9%", -9, "%", SOURCES[7], "square")];
  } else if (grammar === "binary_level") {
    spec = baseSpec(grammar, "key_numbers");
    spec.data.values = [value("V1", "current", "Current price", "$101", 101, "USD", SOURCES[0], "circle")];
    spec.data.levels = [level("L1", "threshold", "Decision level", "$100", 100, "USD", "above", "Level still holds", SOURCES[1])];
  } else if (grammar === "expectation_gap") {
    spec = baseSpec(grammar, "key_numbers");
    spec.data.values = [value("V1", "expected", "Expected", "100", 100, "index", SOURCES[0], "square"), value("V2", "actual", "Actual", "92", 92, "index", SOURCES[1], "circle"), value("V3", "gap", "Gap", "-8", -8, "index", SOURCES[2], "triangle", "actual - expected")];
  } else if (grammar === "factor_rotation") {
    spec = baseSpec(grammar, "qualitative");
    spec.data.rails = [
      rail("R1", "from", "Market input", "One common return window", { shape: "square", source: SOURCES[0] }),
      rail("R2", "to", "Rotation formula", "Compare the same window", { shape: "circle", pathKind: "conditional", source: SOURCES[1], formula: "cash-flow return - duration return" }),
    ];
  } else throw new Error(`Unsupported grammar: ${grammar}`);
  return spec;
}

export function seriesSpec(grammar) {
  const spec = baseSpec(grammar, "series");
  if (grammar === "reaction_test") {
    spec.data.series = [observedSeries("S1", "reaction", "Tape", [0, -1.2, -0.4, -0.2], SOURCES[0])];
    spec.data.events = [event("EVT1", "News landed", "2026-07-14T06:30:00Z", SOURCES[1])];
  } else if (grammar === "parallel_contrast") {
    spec.data.series = [observedSeries("S1", "primary", "Primary", [0, 1, 3, 4], SOURCES[0]), observedSeries("S2", "comparison", "Comparator", [0, 0.5, 1, 1.5], SOURCES[1])];
  } else if (grammar === "sentiment_witness") spec.data.series = [observedSeries("S1", "witness", "Sentiment", [40, 44, 55, 68], SOURCES[0], "index")];
  else if (grammar === "event_unwind") {
    spec.data.series = [observedSeries("S1", "unwind", "Event path", [100, 120, 130, 112], SOURCES[0], "index")];
    spec.data.events = [event("EVT1", "Event day", "2026-07-14T06:00:00Z", SOURCES[1])];
  } else if (grammar === "factor_rotation") spec.data.series = [observedSeries("S1", "primary", "Cash flow", [0, 1, 2, 4], SOURCES[0]), observedSeries("S2", "comparison", "Duration", [0, -0.5, -1, -2], SOURCES[1])];
  else if (grammar === "binary_level") {
    spec.data.series = [observedSeries("S1", "level_test", "Price path", [1_820_000, 1_860_000, 1_840_000, 1_910_000], SOURCES[0], "KRW")];
    spec.data.levels = [level("L1", "threshold", "Decision level", "KRW 1.85m", 1_850_000, "KRW", "above", "Level reclaimed", SOURCES[1])];
  } else throw new Error(`Unsupported series grammar: ${grammar}`);
  return spec;
}

const sha256 = (data) => `sha256:${createHash("sha256").update(data).digest("hex")}`;

export function fakePng(width, height) {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

export function createWideFinalizerFixture(root) {
  const wordmarkPath = fileURLToPath(new URL("../../direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg", import.meta.url));
  const wordmark = readFileSync(wordmarkPath, "utf8")
    .replace("<svg ", '<svg data-cuebook-wordmark="v1" data-role="brand" ')
    .replaceAll('fill="#F2F3F4"', 'fill="currentColor"');
  const fonts = join(root, "fonts");
  mkdirSync(fonts, { recursive: true });
  const fontRecords = [];
  for (const [weight, label] of [[400, "regular"], [500, "medium"], [600, "semibold"], [700, "bold"]]) {
    const bytes = Buffer.from(`licensed-font-${weight}`), fileName = `cuebook-noi-${label}.otf`;
    writeFileSync(join(fonts, fileName), bytes);
    fontRecords.push({ weight, style: "normal", ref: fileName, sha256: sha256(bytes), source_name: `NoiGrotesk-${label}.otf`, source_sha256: sha256(bytes) });
  }
  const fontCss = '@font-face{font-family:"Cuebook Noi";src:url("./cuebook-noi-regular.otf") format("opentype");font-weight:400}\n';
  writeFileSync(join(fonts, "cuebook-noi-fonts.css"), fontCss, "utf8");
  const fontManifest = {
    schema_version: "cuebook-font-assets-v1",
    font_profile_id: "cuebook-noi-v1",
    family_alias: "Cuebook Noi",
    license_mode: "production",
    license_ref: "LICENSE_TEST_01",
    release_eligible: true,
    css_ref: "cuebook-noi-fonts.css",
    css_sha256: sha256(Buffer.from(fontCss)),
    files: fontRecords,
  };
  const fontManifestBytes = Buffer.from(`${JSON.stringify(fontManifest, null, 2)}\n`);
  writeFileSync(join(fonts, "font-assets-v1.json"), fontManifestBytes);
  const html = `<link rel="stylesheet" href="./fonts/cuebook-noi-fonts.css"><main data-cuebook-visual-contract="launch-v1" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json">${wordmark}</main>`;
  writeFileSync(join(root, "direction.html"), html, "utf8");
  const full = fakePng(2488, 1056), compact = fakePng(622, 264);
  writeFileSync(join(root, "viewpoint-2488.png"), full);
  writeFileSync(join(root, "viewpoint-622.png"), compact);
  const capture = {
    schema_version: "viewpoint-html-capture-v1",
    source_sha256: sha256(Buffer.from(html)),
    derivatives: [
      { kind: "full", ref: "viewpoint-2488.png", width: 2488, height: 1056, sha256: sha256(full), painted_ratio: 0.08 },
      { kind: "compact_622", ref: "viewpoint-622.png", width: 622, height: 264, sha256: sha256(compact), painted_ratio: 0.10 },
    ],
  };
  writeFileSync(join(root, "capture.json"), JSON.stringify(capture), "utf8");
  const directionSet = {
    direction_set_id: "VDSET_finalizer20260715",
    state: "selected",
    input_refs: ["CEXP_finalizer20260715"],
    message: {
      claim: "坏消息落地，价格仍然跌不动",
      because: "卖压增加，价格反应却变轻",
      implication: "把回调视为观察多头承接的窗口",
      direction: "long",
    },
    bindings: [
      { binding_id: "BIND_FACT", kind: "fact", value: null, source_refs: ["source:test:fact"] },
      { binding_id: "BIND_VIEW", kind: "creator_judgment", value: null, source_refs: ["source:test:view"] },
    ],
    logic_progression: { pattern: "event_transmission" },
    directions: [{
      direction_id: "VDIR_finalizer20260715",
      binding_refs: ["BIND_FACT", "BIND_VIEW"],
      html_ref: "direction.html",
      preview_ref: "viewpoint-2488.png",
      compact_preview_ref: "viewpoint-622.png",
      capture_report_ref: "capture.json",
      route: "claim_first",
      layout_system: { color_system: { preset_id: "quiet-cobalt" } },
    }],
    selected_direction_id: "VDIR_finalizer20260715",
  };
  return { directionSet, html, full, compact, fontManifestBytes };
}
