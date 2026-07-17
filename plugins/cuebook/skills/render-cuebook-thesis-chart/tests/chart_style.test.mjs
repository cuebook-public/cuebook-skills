import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { audit } from "../scripts/audit_chart_svg.mjs";

function auditSvg(body) {
  const root = mkdtempSync(path.join(os.tmpdir(), "cuebook-chart-audit-"));
  try {
    const file = path.join(root, "chart.svg");
    writeFileSync(file, body);
    return audit(file);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("accepts clean feed SVG", () => {
  const result = auditSvg('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" data-style-profile="cuebook_feed_v1" font-variant-numeric="tabular-nums" letter-spacing="0"><title>Chart</title><desc>Claim</desc><text id="public-title"><tspan>观点标题</tspan></text><text>Cuebook</text></svg>');
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("rejects feed internal state and gradient", () => {
  const result = auditSvg('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" data-style-profile="cuebook_feed_v1" font-variant-numeric="tabular-nums" letter-spacing="0"><linearGradient id="g"/><text id="public-title"><tspan>观点</tspan></text><text>CONDITIONAL Cuebook OHLCV Cuebook</text></svg>');
  assert.equal(result.valid, false);
  const codes = new Set(result.errors.map((entry) => entry.code));
  assert.ok(codes.has("DECORATIVE_EFFECT"));
  assert.ok(codes.has("FEED_LEAKAGE"));
});
