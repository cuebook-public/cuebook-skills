import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderBatch, renderHtml } from "../scripts/render_frame_previews.mjs";

function candidate(index, template) {
  return {
    candidate_id: `FPREV_CAND_RENDER_${index}`,
    template_id: template,
    language: "zh-CN",
    subject: "BTC",
    horizon: "30 天",
    claim: index === 1 ? "抗跌正在变成相对强势" : index === 2 ? "压力没有击穿现货承接" : "资金迁移需要相对强势确认",
    evidence: "BTC 在风险资产承压阶段保持韧性",
    mechanism: "边际资金可能寻找全天候流动性",
    condition: "观察 BTC 相对纳指强弱",
    as_of_label: "Cuebook · 截至 2026-07-17",
    binding_refs: {
      claim: `BIND_CLAIM_${index}`,
      evidence: `BIND_EVIDENCE_${index}`,
      mechanism: `BIND_MECHANISM_${index}`,
      condition: `BIND_CONDITION_${index}`,
    },
  };
}

test("stable preview templates produce distinct network-free HTML", () => {
  const outputs = ["verdict", "proof", "system"].map((template, index) => renderHtml(candidate(index + 1, template)));
  for (const [index, html] of outputs.entries()) {
    assert.match(html, /data-cuebook-preview="fast-v1"/);
    assert.match(html, /data-cuebook-wordmark="v1"/);
    assert.match(html, new RegExp(`data-template-id="${["verdict", "proof", "system"][index]}"`));
    assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//u);
    assert.doesNotMatch(html, /__[A-Z_]+__/u);
  }
  assert.notEqual(outputs[0], outputs[1]);
  assert.notEqual(outputs[1], outputs[2]);
});

test("market copy is escaped before template insertion", () => {
  const item = candidate(1, "verdict");
  item.claim = "BTC <script>alert(1)</script>";
  const html = renderHtml(item);
  assert.doesNotMatch(html, /<script>alert/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
});

test("one batch command stages one or three HTML previews without derivative clutter", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-frame-preview-"));
  try {
    const report = await renderBatch({
      schema_version: "frame-preview-render-v1",
      font_css_path: null,
      candidates: [candidate(1, "verdict"), candidate(2, "proof"), candidate(3, "system")],
    }, temp, { htmlOnly: true });
    assert.equal(report.candidates.length, 3);
    assert.equal(report.mode, "html_only");
    for (const rendered of report.candidates) {
      const html = readFileSync(path.join(temp, rendered.html_ref), "utf8");
      assert.match(html, /data-cuebook-wordmark="v1"/);
      assert.equal(rendered.preview_ref, null);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("three-preview batches require all three stable templates", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "cuebook-frame-preview-"));
  try {
    await assert.rejects(() => renderBatch({
      schema_version: "frame-preview-render-v1",
      candidates: [candidate(1, "verdict"), candidate(2, "verdict"), candidate(3, "system")],
    }, temp, { htmlOnly: true }), /verdict, proof, and system/u);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
