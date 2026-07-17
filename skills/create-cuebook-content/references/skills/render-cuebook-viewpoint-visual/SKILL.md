---
name: render-cuebook-viewpoint-visual
description: Render an explicit creator market judgment as a readable Cuebook Feed visual. Default to an approved HTML-native VisualDirectionSetV1 direction so typography, hierarchy, composition, curves, numbers, causal logic, timelines, comparisons, and strategy maps can adapt to the actual thesis. Use the deterministic ViewpointVisualSpecV1 SVG renderer only for locked batch-compatible grammar output. Do not research missing inputs, invent market data, expose workflow or settlement backend text, or replace a full OHLC chart.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires Node.js 18+ with Playwright plus a local Chromium/Chrome executable for capture, render, and audit scripts. Local filesystem only; no network access at render time.
---

# Render Cuebook Viewpoint Visual

Turn an approved visual direction into the exact 2488 x 1056 publication image and a 622 x 264 preview. Author the HTML at 1244 x 528 and use a 2x capture for the publication raster. Visual form is flexible; market meaning and source fidelity are not.

## Route Selection

### Default: directed HTML

Use this route when the visual will appear in the creator Feed, the user asks for better design, or the thesis does not fit a rigid diagram.

1. Require a selected `VisualDirectionSetV1`. If it does not exist, run `../direct-cuebook-viewpoint-visual/SKILL.md` first and inspect its three real previews.
2. Open the selected HTML and confirm its `data-binding-ref` values match the selected direction. When the expression recipe uses a news cluster, distribution, fan, composition, bridge, measured flow, ordered categories, or payoff curve, resolve its proof binding to a validated `EOBJ_*` in `ViewpointDataBundleV1.render_payload.evidence_object_refs` before rendering.
3. Freeze the selected direction's `expression_recipe`, `layout_system`, concept, reading order, spatial skeleton, `form_from_content`, `cuebook-noi-v1` font profile, and approved font weights. A legacy V1 direction may omit `expression_recipe`; never add one during finalization. Final polish may fix craft defects but cannot choose a new communication job, evidence shape, primary grammar, grid, hierarchy, type scale, density, reading axis, or font profile.
4. Require production `data-font-license-mode`, an artifact-local `fonts/font-assets-v1.json` from the director Skill's staging script, and the canonical `data-cuebook-wordmark="v1"` SVG in the bottom-right safe zone. Trial files may be used for local evaluation but are never release-eligible. If polish changed the HTML, rerun `../direct-cuebook-viewpoint-visual/scripts/stamp_cuebook_wordmark.mjs` as the last mutation, followed by its launch linter.
5. Capture both output sizes with `../direct-cuebook-viewpoint-visual/scripts/capture_html_viewpoint.cjs`; `viewpoint-2488.png` must be exactly 2488 x 1056 and `viewpoint-622.png` exactly 622 x 264, matching the direction's `preview_ref` and `compact_preview_ref`.
6. Inspect both PNGs and run the director Skill's rendered audit. Confirm at least one `Cuebook Noi` face loaded, all visible non-brand copy leads with the approved stack, and CJK fallback did not change hierarchy or wrapping. Re-run the Cuebook visual critique after any typography, spacing, or composition change. Return to the layout Skill when the approved structure itself needs revision.
7. Run `scripts/finalize_wide_viewpoint.mjs` to emit `ViewpointVisualV1` with `render_profile: wide_2488`, the selected `VDIR_` ref, HTML hash, production font-manifest hash, full PNG hash, compact PNG hash, palette preset, argument pattern, and source bindings. Freeze that manifest in the release artifact.

```bash
node scripts/finalize_wide_viewpoint.mjs visual-direction-set-v1.json \
  --asset-root . \
  --observed-at 2026-07-15T07:00:00Z \
  --decision-cutoff-at 2026-07-15T07:00:00Z \
  --generated-at 2026-07-15T07:01:00Z \
  --output viewpoint-visual-v1.json
```

The renderer may freely use editorial typography, CSS Grid, absolute composition, inline SVG for sourced curves, and CSS geometry for qualitative relationships. It may not alter data or argument semantics.

### Compatibility: deterministic SVG

Use this route only when an upstream system explicitly provides the legacy 720 x 420 `ViewpointVisualSpecV1`, a stable batch template is required, or historical output must remain byte-deterministic. Legacy SVG output is not the launch publication raster; place it inside a directed 2488 x 1056 composition before publishing.

1. Read `references/visual-grammar-reference.md` and `references/cuebook-editorial-signal-v2.md`.
2. Select one supported grammar and payload mode.
3. Validate and render with the existing scripts.
4. The renderer appends the exact canonical wordmark paths as the final SVG layer at the shared bottom-right geometry.
5. Emit `ViewpointVisualV1` with `render_profile: legacy_720`. Treat the 11 compositions as compatibility templates, not the default creative ceiling.

```bash
node scripts/validate_viewpoint_visual.mjs viewpoint-visual-spec-v1.json
node scripts/render_viewpoint_visual.mjs viewpoint-visual-spec-v1.json --output-dir ./viewpoint-visual
node scripts/validate_viewpoint_visual.mjs ./viewpoint-visual/viewpoint-visual-v1.json --asset-root ./viewpoint-visual
```

## Public Image Contract

- A reader at 622px must identify the claim before the taxonomy, source, or brand.
- Show claim, strongest reason, and implication in that order. One of those may be conveyed entirely by the visual.
- Use one dominant visual idea and at most two supports.
- Bind every displayed market fact, number, date, level, event, and ordered series.
- Use a sourced price or market curve when it genuinely proves the point. Do not add a sparkline by default.
- Use direct labels instead of legends when space allows.
- Observed and reported paths are solid. Conditional and future paths are dashed.
- Use only the canonical Cuebook wordmark at `right: 41px; bottom: 34px; width: 136px; height: 26px` on the authoring canvas. Do not type it, redraw it, add a `C` badge, or build a dashboard header.
- Keep settlement prose outside the image unless a deadline or threshold is the thesis itself.
- Do not show source counts, workflow states, evidence labels, confidence badges, or database field names.

## Full Chart Boundary

Route to `../render-cuebook-thesis-chart/SKILL.md` when OHLC, volume, multiple indicators, entry/invalidation/target geometry, or settlement tracking is the main evidence. A full chart can then become the hero primitive inside a directed composition; do not redraw it as a decorative line.

## Hard Gates

- Reject missing or non-finite quantitative inputs.
- Reject unsourced ordered curves, dates, values, levels, and events.
- Reject any selected expression recipe that fails its grammar's data gate, including unsourced quantiles, distributions, composition denominators, additive bridges, synchronized comparisons, or quantified flows.
- Reject advanced geometry built from loose labels or prose when no matching validated `EOBJ_*` is present in the selected data payload.
- Reject a selected direction whose three-second, concept, or data-integrity gate failed.
- Reject clipped text, unresolved placeholders, external network assets, and layouts that fail either the 1244 x 528 audit or the 622 x 264 preview.
- Reject missing or silently substituted Cuebook Noi, production HTML that references Trial assets, or any remote font dependency.
- Reject benchmark leakage: Robinhood logos, Capsule Sans, Nib, proprietary neon, product chrome, source illustrations, or copied module proportions.
- Reject a final render whose grid, hierarchy, type scale, density, or reading order differs from the selected layout.
- Reject a final render missing the canonical bottom-right wordmark or carrying a textual substitute.
- Never change upstream judgment or data to improve composition.

## Resources

- `../direct-cuebook-viewpoint-visual/SKILL.md`: default art-direction and three-preview workflow.
- `../direct-cuebook-viewpoint-visual/assets/cuebook-wordmark.svg`: single canonical brand source used by both HTML and compatibility SVG routes.
- `../direct-cuebook-viewpoint-visual/references/typography-benchmark-profiles-v1.json`: launch font profile and benchmark brand-distance contract.
- `../direct-cuebook-viewpoint-visual/scripts/stage_noi_font_assets.mjs`: artifact-local font staging and hashed license-mode manifest.
- `references/viewpoint-visual-spec-v1.schema.json`: deterministic compatibility input.
- `references/viewpoint-visual-v1.schema.json`: unified launch and compatibility output manifest; `wide_2488` is the publication profile.
- `references/cuebook-visual-tokens-v1.json`: shared Cuebook tokens.
- `references/cuebook-editorial-signal-v2.md`: legacy 11-composition language.
- `scripts/render_viewpoint_visual.mjs`: deterministic SVG compatibility renderer.
- `scripts/finalize_wide_viewpoint.mjs`: deterministic selected-direction finalizer for the launch profile.
- `scripts/rasterize_viewpoint_visual.cjs`: deterministic SVG derivative publisher.
