import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { audit_html } from "../scripts/lint_launch_viewpoint_html.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function validHtml() {
  const wordmark = readFileSync(path.join(root, "assets", "cuebook-wordmark.svg"), "utf8").trim()
    .replace("<svg ", '<svg class="cuebook-wordmark" data-cuebook-wordmark="v1" data-role="brand" ')
    .replaceAll('fill="#F2F3F4"', 'fill="currentColor"');
  return `<style>main{font-family:"Cuebook Noi","PingFang SC",sans-serif}.claim{text-wrap:balance}[data-binding-ref]{font-variant-numeric:tabular-nums}.cuebook-wordmark{position:absolute;right:41px;bottom:34px;width:136px;height:26px;color:#101411}</style><main data-cuebook-visual-contract="launch-v1" data-entry-role="claim" data-color-system="semantic-v1" data-palette-family="quiet-cobalt" data-palette-strategy="creator_native" data-palette-preset="quiet-cobalt" data-font-profile="cuebook-noi-v1" data-font-license-mode="production" data-font-manifest-ref="fonts/font-assets-v1.json"><div data-role="context" data-visual-level="4">HOOD · 30天</div><h1 class="claim" data-role="claim" data-visual-level="1">我押HOOD拿到基础设施溢价</h1><div data-role="evidence" data-visual-level="2" data-color-role="observed" data-binding-ref="BIND_FACT">2770万客户 · 3770亿美元资产</div><div data-role="condition" data-visual-level="3" data-color-role="catalyst">财报看使用与收入</div>${wordmark}</main>`;
}

const codes = (result) => new Set(result.errors.map((item) => item.code));

test("valid launch visual", () => assert.equal(audit_html(validHtml()).valid, true));
test("reports visible relevant binding refs", () => assert.deepEqual(audit_html(validHtml()).stats.visible_binding_refs, ["BIND_FACT"]));

const mutations = [
  ["hidden binding", (source) => source.replace("</main>", '<i hidden data-binding-ref="BIND_HIDDEN">hidden fact</i></main>'), "BINDING_HIDDEN"],
  ["binding hidden by CSS class", (source) => source.replace("</style>", ".ghost{display:none}</style>").replace("</main>", '<span class="ghost" data-role="evidence" data-visual-level="4" data-binding-ref="BIND_GHOST">ghost fact</span></main>'), "BINDING_HIDDEN"],
  ["binding on arbitrary node", (source) => source.replace("</main>", '<i data-binding-ref="BIND_META">metadata</i></main>'), "BINDING_CONTEXT"],
  ["empty bound role", (source) => source.replace("</main>", '<i data-role="context" data-visual-level="4" data-binding-ref="BIND_EMPTY"></i></main>'), "BINDING_EMPTY"],
  ["manual claim break", (source) => source.replace("拿到", "<br>拿到"), "CLAIM_MANUAL_BREAK"],
  ["unscoped disclosure", (source) => source.replace("</main>", "<small>股东权利有限</small></main>"), "UNSCOPED_TEXT"],
  ["generated copy", (source) => source.replace("</style>", '.x:after{content:"7.29财报"}</style>'), "GENERATED_COPY"],
  ["excess copy", (source) => source.replace("财报看使用与收入", "财".repeat(30)), "ROLE_BUDGET"],
  ["canonical wordmark required", (source) => source.replace(' data-cuebook-wordmark="v1"', ""), "WORDMARK_REQUIRED"],
  ["visible brand text", (source) => source.replace("</main>", '<div data-role="brand">Cuebook</div></main>'), "BRAND_TEXT"],
  ["modified wordmark path", (source) => source.replace("M6.61403", "M6.7"), "WORDMARK_PATHS"],
  ["visible group requires visual level", (source) => source.replace(' data-visual-level="4"', ""), "VISUAL_LEVEL_REQUIRED"],
  ["single level-one group", (source) => source.replace('data-visual-level="2"', 'data-visual-level="1"'), "VISUAL_ENTRY"],
  ["known color role", (source) => source.replace('data-color-role="observed"', 'data-color-role="decorative"'), "UNKNOWN_COLOR_ROLE"],
  ["palette strategy required", (source) => source.replace(' data-palette-strategy="creator_native"', ""), "PALETTE_STRATEGY"],
  ["registered palette preset required", (source) => source.replace('data-palette-preset="quiet-cobalt"', 'data-palette-preset="made-up-palette"'), "PALETTE_PRESET"],
  ["Noi font profile required", (source) => source.replace(' data-font-profile="cuebook-noi-v1"', ""), "FONT_PROFILE"],
  ["production rejects Trial font", (source) => source.replace("</style>", '@font-face{font-family:"Cuebook Noi";src:url("./fonts/NoiGroteskTrial-Regular.ttf")}</style>'), "TRIAL_FONT_RELEASE"],
  ["safe font manifest ref required", (source) => source.replace(' data-font-manifest-ref="fonts/font-assets-v1.json"', ""), "FONT_MANIFEST_REF"],
  ["benchmark font rejected", (source) => source.replace('"Cuebook Noi"', '"Cuebook Noi","Capsule Sans"'), "BENCHMARK_FONT"],
  ["tabular numbers required", (source) => source.replace("font-variant-numeric:tabular-nums", "font-variant-numeric:normal"), "TABULAR_NUMBERS"],
];

for (const [name, mutate, expected] of mutations) {
  test(name, () => assert.ok(codes(audit_html(mutate(validHtml()))).has(expected)));
}

test("hidden binding is excluded from visible refs", () => {
  const source = validHtml().replace("</main>", '<i hidden data-binding-ref="BIND_HIDDEN">hidden fact</i></main>');
  assert.equal(audit_html(source).stats.visible_binding_refs.includes("BIND_HIDDEN"), false);
});

test("visible bound SVG geometry is accepted", () => {
  const source = validHtml().replace("</main>", '<svg data-role="evidence" data-visual-level="3" data-logic-step-id="LSTEP_CURVE" data-binding-ref="BIND_CURVE"><path d="M0 4L20 4"/></svg></main>');
  const result = audit_html(source);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.stats.visible_binding_refs.includes("BIND_CURVE"));
});

test("unbound decorative HTML and SVG are accepted", () => {
  const source = validHtml().replace("</main>", '<span class="decoration" aria-hidden="true"></span><svg aria-hidden="true"><path d="M0 0L8 8"/></svg></main>');
  assert.equal(audit_html(source).valid, true);
});

test("compact verdict plus implication claim fits", () => {
  const source = validHtml().replace("我押HOOD拿到基础设施溢价", "库存超预期，七日偏空；供给宽松继续压制价格");
  assert.equal(codes(audit_html(source)).has("ROLE_BUDGET"), false);
});

test("evaluation allows local Trial font", () => {
  const source = validHtml().replace('data-font-license-mode="production"', 'data-font-license-mode="evaluation"')
    .replace("</style>", '@font-face{font-family:"Cuebook Noi";src:url("./fonts/NoiGroteskTrial-Regular.ttf")}</style>');
  const result = audit_html(source);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
