#!/usr/bin/env node
// Render VisualArgumentV1 into a Cuebook LogicCardV1 SVG bundle.
// Port of render_logic_card.py; SVG bytes and manifest semantics are contract.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validate as validateArgument } from "../../compile-cuebook-visual-argument/scripts/validate_visual_argument.mjs";
import {
  collapseWhitespace,
  displayWidth,
  htmlEscape,
  pad2,
  pyChars,
  pyFloatFixed,
  pyFromIsoformat,
  pyLen,
  pyLstrip,
  pyNowUtcIsoformat,
  pyRstrip,
} from "../../render-cuebook-market-signal/scripts/pycompat.mjs";
import { validate as validateLogicCard } from "./validate_logic_card.mjs";

export const WIDTH = 1200;
export const HEIGHT = 760;
export const GRAMMARS = new Set(["causal_chain", "metric_thesis", "scenario_tree", "evidence_balance", "comparison"]);

const PALETTES = {
  cuebook_light: {
    bg: "#F5F6F2", surface: "#FFFFFF", ink: "#11120F", muted: "#6C7069",
    line: "#D9DDD4", soft: "#ECEFE9", yellow: "#FFD217", yellow_soft: "#FFF6C7",
    green: "#0AA67A", green_soft: "#E5F6F0", red: "#DD5362", red_soft: "#FCE9EC",
    cyan: "#1596B2", cyan_soft: "#E6F5F8", black: "#10110F",
  },
  cuebook_dark: {
    bg: "#111310", surface: "#1A1D19", ink: "#F7F8F4", muted: "#A9AEA5",
    line: "#343933", soft: "#242923", yellow: "#FFD217", yellow_soft: "#3B3515",
    green: "#39C79A", green_soft: "#17382E", red: "#F07884", red_soft: "#42252A",
    cyan: "#50BED3", cyan_soft: "#17343B", black: "#090A09",
  },
};

const STATUS_META = {
  observed: ["OBSERVED", "cyan", "cyan_soft"],
  derived: ["DERIVED", "green", "green_soft"],
  conditional: ["TO VERIFY", "yellow", "yellow_soft"],
  unresolved: ["UNRESOLVED", "red", "red_soft"],
};
const KIND_LABELS = {
  event: "EVENT", evidence: "EVIDENCE", mechanism: "MECHANISM", actor_action: "CAPITAL ACTION",
  market_effect: "MARKET EFFECT", metric: "METRIC", condition: "CONDITION", countercase: "COUNTERCASE",
  invalidation: "REASSESS IF", settlement: "SETTLEMENT",
};
const GRAMMAR_LABELS = {
  causal_chain: "CAUSAL CHAIN", metric_thesis: "METRIC THESIS", scenario_tree: "SCENARIO TREE",
  evidence_balance: "EVIDENCE BALANCE", comparison: "RELATIVE COMPARISON",
};

function pyTruthy(value) {
  if (value === null || value === undefined || value === false || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function pystr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

export function esc(value) {
  return htmlEscape(pystr(value));
}

export function wrapText(value, maxUnits, maxLines) {
  const source = pyTruthy(value) ? pystr(value) : "";
  const text = pyRstrip(pyLstrip(collapseWhitespace(source)));
  if (!text) return [];
  const lines = [];
  let current = "";
  for (const char of pyChars(text)) {
    const candidate = current + char;
    if (current && displayWidth(candidate) > maxUnits) {
      lines.push(pyRstrip(current));
      current = pyLstrip(char);
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(pyRstrip(current));
  const consumed = lines.join("");
  const compactOriginal = text.replaceAll(" ", "");
  const compactConsumed = consumed.replaceAll(" ", "");
  if (pyLen(compactConsumed) < pyLen(compactOriginal) && lines.length) {
    let tail = lines.at(-1);
    while (tail && displayWidth(`${tail}…`) > maxUnits) {
      tail = pyChars(tail).slice(0, -1).join("");
    }
    lines[lines.length - 1] = `${pyRstrip(tail)}…`;
  }
  return lines.slice(0, maxLines);
}

export function textBlock(x, y, value, maxUnits, maxLines, size, lineHeight, fill, weight = 400, anchor = "start", family = null) {
  const lines = wrapText(value, maxUnits, maxLines);
  const font = family ?? "-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC','Microsoft YaHei',sans-serif";
  const xFixed = pyFloatFixed(x, 1);
  const tspans = lines.map((line, index) => `<tspan x="${xFixed}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`).join("");
  return `<text x="${xFixed}" y="${pyFloatFixed(y, 1)}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="0">${tspans}</text>`;
}

export function rect(x, y, width, height, fill, stroke = "none", radius = 7, strokeWidth = 1) {
  return `<rect x="${pyFloatFixed(x, 1)}" y="${pyFloatFixed(y, 1)}" width="${pyFloatFixed(width, 1)}" height="${pyFloatFixed(height, 1)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

export function pill(x, y, label, fill, ink, suppliedWidth = null) {
  const width = pyTruthy(suppliedWidth) ? suppliedWidth : Math.max(54, displayWidth(label) * 7 + 22);
  return rect(x, y, width, 28, fill, "none", 7) + textBlock(x + width / 2, y + 19, label, 20, 1, 13, 15, ink, 650, "middle");
}

export function dedupe(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value === "string" && value.trim() && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

export function nodeSources(nodes) {
  return dedupe(nodes.flatMap((node) => node.source_refs ?? []));
}

export function topologicalNodes(argument, candidates) {
  const candidateIds = new Set(candidates.map((node) => node.id));
  const indegree = new Map([...candidateIds].map((nodeId) => [nodeId, 0]));
  const adjacency = new Map([...candidateIds].map((nodeId) => [nodeId, []]));
  for (const edge of argument.graph.edges) {
    const source = edge.from;
    const target = edge.to;
    if (candidateIds.has(source) && candidateIds.has(target) && edge.relation !== "challenges") {
      adjacency.get(source).push(target);
      indegree.set(target, indegree.get(target) + 1);
    }
  }
  const queue = candidates.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered = [];
  while (queue.length) {
    const current = queue.shift();
    ordered.push(current);
    for (const target of adjacency.get(current)) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (ordered.length !== candidateIds.size) return candidates;
  const byId = new Map(candidates.map((node) => [node.id, node]));
  return ordered.map((nodeId) => byId.get(nodeId));
}

function commonOpen(argument, grammar, colors) {
  const sourceCount = nodeSources(argument.graph.nodes).concat(argument.metrics.map((item) => item.source_ref)).length;
  const statusLabel = { draft: "DRAFT", conditional: "TO CONFIRM", ready: "READY", frozen: "FROZEN" }[argument.state];
  const statusFill = new Set(["draft", "conditional"]).has(argument.state) ? colors.yellow_soft : colors.green_soft;
  const statusInk = new Set(["draft", "conditional"]).has(argument.state) ? colors.yellow : colors.green;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    "<defs>",
    `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${colors.muted}"/></marker>`,
    `<marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${colors.red}"/></marker>`,
    "</defs>",
    rect(0, 0, WIDTH, HEIGHT, colors.bg, "none", 0),
    rect(34, 28, 38, 38, colors.black, "none", 7),
    textBlock(53, 56, "C", 2, 1, 24, 26, colors.yellow, 800, "middle", "Georgia,serif"),
    textBlock(88, 56, `Cuebook View Logic · ${GRAMMAR_LABELS[grammar]}`, 40, 1, 17, 20, colors.ink, 700),
    pill(1014, 34, statusLabel, statusFill, statusInk, 112),
    textBlock(965, 55, `${sourceCount} sources`, 20, 1, 13, 16, colors.muted, 500, "end"),
    textBlock(56, 110, argument.frame.headline, 62, 2, 34, 42, colors.ink, 750),
    textBlock(56, 188, argument.frame.thesis, 100, 2, 18, 25, colors.muted, 450),
  ];
}

export function settlementLine(argument) {
  const settlement = argument.settlement;
  if (!settlement.settleable) return null;
  const deadline = pyFromIsoformat(settlement.deadline_at.replaceAll("Z", "+00:00"));
  const deadlineLabel = `${String(deadline.year).padStart(4, "0")}-${pad2(deadline.month)}-${pad2(deadline.day)} ${pad2(deadline.hour)}:${pad2(deadline.minute)} UTC`;
  const primary = argument.subject.primary.ticker;
  const benchmark = argument.subject.benchmark;
  const direction = argument.subject.direction;
  let readable;
  if (benchmark && new Set(["outperform", "underperform"]).has(direction)) {
    const operator = direction === "outperform" ? ">" : "<";
    readable = `${primary} return relative to ${benchmark.ticker} ${operator} 0%`;
  } else {
    readable = settlement.condition;
  }
  return `Through ${deadlineLabel} · Success: ${readable}`;
}

function commonFooter(argument, colors) {
  const line = settlementLine(argument);
  const parts = [];
  if (line) {
    parts.push(
      rect(56, 608, 1088, 96, colors.black, "none", 7),
      rect(56, 608, 8, 96, colors.yellow, "none", 7),
      textBlock(84, 640, "SETTLEABLE VIEW", 16, 1, 14, 16, colors.yellow, 700),
      textBlock(84, 674, line, 82, 2, 18, 23, "#FFFFFF", 600),
    );
  } else {
    parts.push(
      `<line x1="56" y1="624" x2="1144" y2="624" stroke="${colors.line}" stroke-width="1"/>`,
      textBlock(56, 657, "The view is still forming; continue testing it against observable conditions.", 70, 2, 17, 22, colors.muted, 500),
    );
  }
  parts.push(
    textBlock(56, 738, "Cuebook", 20, 1, 20, 22, colors.muted, 700),
    textBlock(1144, 738, "Sourced views · Explicit states · Verifiable at expiry", 60, 1, 13, 16, colors.muted, 500, "end"),
    "</svg>",
  );
  return parts;
}

function nodeCard(node, x, y, width, height, colors, order = null) {
  const [statusLabel, accentKey, softKey] = STATUS_META[node.status];
  const accent = colors[accentKey];
  const soft = colors[softKey];
  const parts = [
    rect(x, y, width, height, colors.surface, colors.line, 7),
    rect(x, y, 7, height, accent, "none", 7),
    textBlock(x + 24, y + 31, KIND_LABELS[node.kind], 14, 1, 13, 15, accent, 700),
    pill(x + width - 98, y + 13, statusLabel, soft, accent, 82),
    textBlock(x + 24, y + 73, node.label, Math.max(14, Math.trunc(((width - 64) * 2) / 20)), 3, 20, 27, colors.ink, 700),
  ];
  if (order !== null) parts.push(textBlock(x + width - 20, y + height - 18, `0${order}`, 4, 1, 12, 14, colors.muted, 650, "end"));
  return parts.join("");
}

function renderCausalChain(argument, colors) {
  const nodes = argument.graph.nodes;
  let main = nodes.filter((node) => !new Set(["countercase", "invalidation", "settlement", "condition"]).has(node.kind));
  main = topologicalNodes(argument, main).slice(0, 4);
  if (main.length < 3) throw new Error("causal_chain requires at least three renderable path nodes.");
  const challenge = nodes.filter((node) => new Set(["countercase", "invalidation", "condition"]).has(node.kind)).slice(0, 1);
  const gap = 28;
  const width = (1088 - gap * (main.length - 1)) / main.length;
  const y = 260;
  const height = 174;
  const parts = [];
  main.forEach((node, index) => {
    const x = 56 + index * (width + gap);
    if (index) {
      const previousX = 56 + (index - 1) * (width + gap);
      parts.push(`<line x1="${pyFloatFixed(previousX + width + 5, 1)}" y1="${y + 87}" x2="${pyFloatFixed(x - 7, 1)}" y2="${y + 87}" stroke="${colors.muted}" stroke-width="2" marker-end="url(#arrow)"/>`);
    }
    parts.push(nodeCard(node, x, y, width, height, colors, index + 1));
  });
  if (challenge.length) {
    const node = challenge[0];
    const targetId = argument.graph.edges.find((edge) => edge.from === node.id && new Set(["challenges", "conditions"]).has(edge.relation))?.to ?? main.at(-1).id;
    let targetIndex = main.findIndex((item) => item.id === targetId);
    if (targetIndex === -1) targetIndex = main.length - 1;
    const targetX = 56 + targetIndex * (width + gap) + width / 2;
    const challengeX = 584;
    const challengeWidth = 560;
    parts.push(
      `<path d="M ${pyFloatFixed(challengeX + challengeWidth / 2, 1)} 466 C ${pyFloatFixed(challengeX + challengeWidth / 2, 1)} 446, ${pyFloatFixed(targetX, 1)} 452, ${pyFloatFixed(targetX, 1)} 438" fill="none" stroke="${colors.yellow}" stroke-width="2" stroke-dasharray="7 6" marker-end="url(#arrow)"/>`,
      rect(challengeX, 466, challengeWidth, 110, colors.yellow_soft, colors.yellow, 7),
      textBlock(challengeX + 22, 494, "OTHER PATH / REASSESS", 30, 1, 13, 15, colors.yellow, 750),
      textBlock(challengeX + 22, 530, node.label, 48, 2, 18, 23, colors.ink, 650),
    );
  }
  const used = main.concat(challenge, nodes.filter((node) => node.kind === "settlement").slice(0, 1));
  return [parts, used, []];
}

function renderMetricThesis(argument, colors) {
  const metrics = argument.metrics.slice(0, 4);
  if (metrics.length < 2) throw new Error("metric_thesis requires at least two metrics.");
  const parts = [textBlock(56, 248, "THE NUMBERS THAT DECIDE THIS VIEW", 30, 1, 14, 17, colors.cyan, 750)];
  const gap = 18;
  const width = (1088 - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((metric, index) => {
    const x = 56 + index * (width + gap);
    const statusLabel = { verified: "VERIFIED", provisional: "FORMING", estimated: "ESTIMATED" }[metric.status];
    const accent = metric.status === "verified" ? colors.green : colors.yellow;
    const soft = metric.status === "verified" ? colors.green_soft : colors.yellow_soft;
    parts.push(
      rect(x, 270, width, 196, colors.surface, colors.line, 7),
      textBlock(x + 22, 304, metric.label, Math.max(16, Math.trunc(width / 10)), 2, 15, 20, colors.muted, 600),
      textBlock(x + 22, 366, metric.display_value, Math.max(12, Math.trunc(width / 14)), 2, 33, 38, colors.ink, 800),
      pill(x + 22, 414, statusLabel, soft, accent, 76),
    );
  });
  const challenge = argument.graph.nodes.filter((node) => new Set(["countercase", "invalidation"]).has(node.kind)).slice(0, 1);
  if (challenge.length) {
    parts.push(
      rect(56, 494, 1088, 82, colors.yellow_soft, colors.yellow, 7),
      textBlock(78, 524, "REASSESS IF", 16, 1, 13, 15, colors.yellow, 750),
      textBlock(190, 526, challenge[0].label, 78, 2, 18, 23, colors.ink, 600),
    );
  }
  const usedNodes = argument.graph.nodes.filter((node) => new Set(["market_effect", "countercase", "invalidation", "settlement"]).has(node.kind));
  return [parts, usedNodes, metrics];
}

function renderScenarioTree(argument, colors) {
  const scenarios = argument.scenarios.slice(0, 3);
  if (scenarios.length < 2) throw new Error("scenario_tree requires at least two scenarios.");
  const rootNodes = argument.graph.nodes.filter((node) => new Set(["event", "evidence", "condition"]).has(node.kind));
  const root = rootNodes.length ? rootNodes[0] : argument.graph.nodes[0];
  const parts = [
    rect(376, 244, 448, 94, colors.surface, colors.cyan, 7),
    textBlock(398, 274, "CURRENT SETUP", 14, 1, 13, 15, colors.cyan, 750),
    textBlock(398, 309, root.label, 38, 2, 19, 24, colors.ink, 700),
  ];
  const gap = 24;
  const width = (1088 - gap * (scenarios.length - 1)) / scenarios.length;
  const stanceMeta = {
    bull: ["BULL CASE", colors.green, colors.green_soft],
    base: ["BASE CASE", colors.cyan, colors.cyan_soft],
    bear: ["BEAR CASE", colors.red, colors.red_soft],
    risk: ["RISK CASE", colors.yellow, colors.yellow_soft],
  };
  scenarios.forEach((scenario, index) => {
    const x = 56 + index * (width + gap);
    const [label, accent, soft] = stanceMeta[scenario.stance];
    const center = x + width / 2;
    parts.push(
      `<line x1="600" y1="338" x2="${pyFloatFixed(center, 1)}" y2="378" stroke="${colors.line}" stroke-width="2" marker-end="url(#arrow)"/>`,
      rect(x, 388, width, 188, colors.surface, accent, 7),
      pill(x + 18, 404, label, soft, accent, 88),
      textBlock(x + 18, 454, scenario.condition, Math.max(20, Math.trunc(width / 10)), 2, 16, 21, colors.muted, 550),
      textBlock(x + 18, 514, scenario.outcome, Math.max(20, Math.trunc(width / 10)), 3, 18, 24, colors.ink, 700),
    );
  });
  const settlementNodes = argument.graph.nodes.filter((node) => node.kind === "settlement").slice(0, 1);
  return [parts, [root, ...settlementNodes], []];
}

function renderEvidenceBalance(argument, colors) {
  const nodes = argument.graph.nodes;
  const challenge = nodes.filter((node) => new Set(["countercase", "invalidation"]).has(node.kind) || node.status === "unresolved").slice(0, 3);
  const support = nodes.filter((node) => !challenge.includes(node) && node.kind !== "settlement").slice(0, 3);
  if (!support.length || !challenge.length) throw new Error("evidence_balance requires both supporting and challenging nodes.");
  const parts = [
    rect(56, 250, 524, 294, colors.green_soft, colors.green, 7),
    rect(620, 250, 524, 294, colors.yellow_soft, colors.yellow, 7),
    textBlock(80, 284, "SUPPORTING THE VIEW", 22, 1, 15, 18, colors.green, 750),
    textBlock(644, 284, "OTHER PATH / WHAT TO WATCH", 32, 1, 15, 18, colors.yellow, 750),
  ];
  support.forEach((node, index) => {
    const y = 330 + index * 66;
    parts.push(rect(80, y - 18, 10, 10, colors.green, "none", 5), textBlock(106, y, node.label, 38, 2, 17, 22, colors.ink, 600));
  });
  challenge.forEach((node, index) => {
    const y = 330 + index * 66;
    parts.push(rect(644, y - 18, 10, 10, colors.yellow, "none", 5), textBlock(670, y, node.label, 38, 2, 17, 22, colors.ink, 600));
  });
  parts.push(
    rect(348, 560, 504, 42, colors.black, "none", 7),
    textBlock(600, 587, argument.frame.thesis, 50, 1, 15, 18, "#FFFFFF", 650, "middle"),
  );
  const settlementNodes = nodes.filter((node) => node.kind === "settlement").slice(0, 1);
  return [parts, [...support, ...challenge, ...settlementNodes], []];
}

function renderComparison(argument, colors) {
  const benchmark = argument.subject.benchmark;
  if (!benchmark) throw new Error("comparison requires a named benchmark.");
  const metrics = argument.metrics.slice(0, 6);
  const hasPairs = metrics.some((metric) => metric.subject_ref === "primary") && metrics.some((metric) => metric.subject_ref === "benchmark");
  const compares = argument.graph.edges.some((edge) => edge.relation === "compares");
  if (!hasPairs && !compares) throw new Error("comparison requires paired metrics or an explicit compares edge.");
  const primary = argument.subject.primary;
  const parts = [
    rect(56, 250, 524, 326, colors.surface, colors.green, 7),
    rect(620, 250, 524, 326, colors.surface, colors.cyan, 7),
    textBlock(80, 292, primary.ticker, 14, 1, 27, 30, colors.green, 800),
    textBlock(80, 324, primary.display_name, 38, 1, 14, 17, colors.muted, 500),
    textBlock(644, 292, benchmark.ticker, 14, 1, 27, 30, colors.cyan, 800),
    textBlock(644, 324, benchmark.display_name, 38, 1, 14, 17, colors.muted, 500),
  ];
  for (const [side, x, accent] of [["primary", 80, colors.green], ["benchmark", 644, colors.cyan]]) {
    let sideMetrics = metrics.filter((metric) => metric.subject_ref === side).slice(0, 3);
    if (!sideMetrics.length) sideMetrics = metrics.filter((metric) => metric.subject_ref === "context").slice(0, 3);
    sideMetrics.forEach((metric, index) => {
      const y = 374 + index * 66;
      parts.push(
        textBlock(x, y, metric.label, 24, 1, 14, 17, colors.muted, 550),
        textBlock(x + 430, y, metric.display_value, 20, 1, 20, 23, accent, 800, "end"),
        `<line x1="${x}" y1="${y + 17}" x2="${x + 430}" y2="${y + 17}" stroke="${colors.line}" stroke-width="1"/>`,
      );
    });
  }
  const usedNodes = argument.graph.nodes.filter((node) => new Set(["market_effect", "countercase", "settlement"]).has(node.kind));
  return [parts, usedNodes, metrics];
}

const RENDERERS = new Map([
  ["causal_chain", renderCausalChain],
  ["metric_thesis", renderMetricThesis],
  ["scenario_tree", renderScenarioTree],
  ["evidence_balance", renderEvidenceBalance],
  ["comparison", renderComparison],
]);

export function render(argument, outputDir, grammar = null) {
  const validation = validateArgument(argument);
  if (!validation.valid) {
    const details = validation.errors.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw new Error(`Invalid VisualArgumentV1: ${details}`);
  }
  if (argument.quality_report.decision === "blocked") throw new Error("Blocked visual arguments cannot be rendered.");
  const selected = grammar ?? argument.visual.recommended_grammar;
  if (selected === "price_timeline") throw new Error("price_timeline must be rendered with render-cuebook-thesis-chart.");
  if (!GRAMMARS.has(selected)) throw new Error(`Unsupported logic-card grammar: ${selected}.`);
  const allowed = new Set([argument.visual.recommended_grammar, ...argument.visual.alternative_grammars]);
  if (!allowed.has(selected)) throw new Error(`Grammar ${selected} is not recommended or declared as an alternative.`);

  const theme = argument.visual.theme;
  const colors = PALETTES[theme];
  const parts = commonOpen(argument, selected, colors);
  const [body, usedNodes, usedMetrics] = RENDERERS.get(selected)(argument, colors);
  parts.push(...body, ...commonFooter(argument, colors));
  const svg = `${parts.join("\n")}\n`;

  mkdirSync(outputDir, { recursive: true });
  const svgPath = join(outputDir, "logic-card.svg");
  writeFileSync(svgPath, svg, "utf8");
  const contentHash = `sha256:${createHash("sha256").update(readFileSync(svgPath)).digest("hex")}`;
  const nodeRefs = dedupe(usedNodes.map((node) => node.id));
  const metricRefs = dedupe(usedMetrics.map((metric) => metric.id));
  const sourceRefs = dedupe(nodeSources(usedNodes).concat(usedMetrics.map((metric) => metric.source_ref)));
  const suffix = argument.argument_id.startsWith("VARG_") ? argument.argument_id.slice(5) : argument.argument_id;
  const manifest = {
    schema_version: "logic-card-v1",
    card_id: `LOGICCARD_${suffix}_r${argument.revision}_${selected}`,
    argument_ref: argument.argument_id,
    grammar: selected,
    state: argument.state,
    generated_at: pyNowUtcIsoformat().replace("+00:00", "Z"),
    theme,
    dimensions: { width: WIDTH, height: HEIGHT },
    lineage: {
      input_argument_ref: argument.argument_id,
      node_refs: nodeRefs,
      metric_refs: metricRefs,
      source_refs: sourceRefs,
      settlement_claim_ref: argument.settlement.claim_ref,
    },
    content: {
      headline: argument.frame.headline,
      thesis: argument.frame.thesis,
      settlement_line: settlementLine(argument),
      watermark: "Cuebook",
    },
    asset: { svg_ref: "logic-card.svg", content_hash: contentHash },
    quality_report: {
      decision: argument.quality_report.decision,
      warnings: [...argument.quality_report.warnings],
      hard_failures: [...argument.quality_report.hard_failures],
    },
  };
  const result = validateLogicCard(manifest, argument, outputDir);
  if (!result.valid) {
    const details = result.errors.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw new Error(`Rendered LogicCardV1 failed validation: ${details}`);
  }
  const manifestPath = join(outputDir, "logic-card-v1.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifest_path: manifestPath, svg_path: svgPath, manifestPath, svgPath };
}

function parseArgs(argv) {
  let argument = null;
  let grammar = null;
  let outputDir = null;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--grammar") grammar = argv[++index];
    else if (token === "--output-dir") outputDir = argv[++index];
    else if (!argument) argument = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (!argument || !outputDir) throw new Error("the following arguments are required: argument, --output-dir");
  if (grammar !== null && !new Set([...GRAMMARS, "price_timeline"]).has(grammar)) throw new Error(`invalid choice: '${grammar}'`);
  return { argument, grammar, outputDir };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`usage: render_logic_card.mjs argument [--grammar GRAMMAR] --output-dir OUTPUT_DIR\nrender_logic_card.mjs: error: ${error.message}\n`);
    return 2;
  }
  try {
    const argument = JSON.parse(readFileSync(args.argument, "utf8"));
    const result = render(argument, args.outputDir, args.grammar);
    process.stdout.write(`${JSON.stringify({ ok: true, grammar: result.manifest.grammar, state: result.manifest.state, manifest: result.manifestPath, svg: result.svgPath }, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
