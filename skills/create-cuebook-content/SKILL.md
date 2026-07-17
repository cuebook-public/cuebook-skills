---
name: create-cuebook-content
description: Turn a user's market idea or selected Cuebook material into a creator-owned Frame with one title, one body, and one paired image. Default to one best fast preview; generate three choices only when the user explicitly asks for alternatives. Use Cuebook data for material current claims, preserve the user's judgment, improve its expression, and defer release-grade contracts, compact/OG renders, settlement freezing, upload, consent, and publication until the user selects and confirms. Do not create X, Xiaohongshu, Reddit, Telegram, thread, caption, or other social-platform variants; do not silently publish, place trades, fabricate query results, build a custom OAuth client, or present a source opinion as the user's own without explicit adoption.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for current market claims; degrades to a conditional or blocked preview, never invented values, when tools are unavailable. Node.js 18+ with Playwright and local Chromium/Chrome for deterministic preview rendering.
---

# Create Cuebook Content

Make the creator's idea clearer, sharper, and more visually legible. The visible creative is always one title, one body, and one paired image. Keep Cuebook evidence, ownership, warnings, settlement semantics, hashes, and workflow state backstage.

## Default: Fast Preview

Use `preview_fast` unless the user explicitly asks to freeze, upload, or publish an already selected Frame.

1. Preserve the user's original wording and extract subject, direction, horizon, claim, proposed mechanism, and next observable in memory. Ask only when subject, direction, or horizon cannot be inferred safely. Treat the user's view as the idea to improve, not a claim to debunk before helping.
2. Use the plugin-provided `cuebook` MCP connection. Resolve the asset once, then issue the smallest independent reads concurrently through `references/skills/query-cuebook/SKILL.md`. Reuse a compatible fresh query bundle or cache entry. Do not scan generic MCP resources repeatedly, implement OAuth/DCR, exchange tokens, or create a local HTTP client. If the host reports unauthorized, request the host's normal Cuebook reconnect once and resume from the frozen request.
3. For material current news, prices, positioning, valuation, market series, comparators, or settlement premises, bind one `CuebookQueryBundleV1`. Batch compatible reads after asset resolution and freeze only the result refs actually used. A partial usable bundle yields a conditional preview; unavailable material data blocks the preview instead of triggering web-search substitution or invented values.
4. Build one compact `FramePreviewV1` directly. Do **not** materialize CreatorFeedV1, ContentOpportunitySetV1, ContentRecipeV1, ResearchPackV1, MarketViewSemanticsV1, CreatorExpressionPlanV1, ViewpointDataBundleV1, PostV1, VisualDirectionSetV1, PublishCandidateSetV1, a workflow DAG, settlement formula, or release bundle before the creator sees the preview. Use those contracts only after selection or for an explicitly requested advanced workflow.
5. Generate the title and body in one model pass. Default to one recommended candidate. Produce three only when the user explicitly requests alternatives; generate all three copy variants in one batch from the same meaning lock. Keep the creator's viewpoint, Cuebook-supported observation, and proposed mechanism distinct internally but fluent in public copy.
6. Render the paired image with the stable `verdict`, `proof`, or `system` template through `scripts/render_frame_previews.mjs`. One candidate uses the best-fitting template; an explicit three-candidate request uses all three once. Render only the 2488 x 1056 publication preview at this stage. Do not hand-author HTML, copy fonts into every task, render compact/OG derivatives, or run release audits before selection. A host-approved shared Noi font cache may be referenced; otherwise use the preview fallback and stage production fonts during selection freeze.
7. Run only four preview checks: creator ownership, source binding, copy fit, and successful image render. Validate with `scripts/validate_frame_preview.mjs`. Return the title, body, and image immediately when they pass. Internal packaging must never delay an already valid preview.
8. Add one short handoff outside the Frame: name a specific strength in the creator's idea, say what Cuebook concretely helped support or structure, and suggest one useful next observation. Do not use generic praise or a marketing slogan.

```bash
node scripts/render_frame_previews.mjs frame-preview-render-v1.json ./preview-output
node scripts/validate_frame_preview.mjs frame-preview-v1.json --asset-root ./preview-output
```

## Preview Latency Contract

- Warm target: return one complete Frame in 90-180 seconds; never plan more than five minutes of preview work.
- Use at most one asset-resolution step, one batched query phase, one copy generation pass, one template-render batch, and one lightweight validation pass.
- Cache canonical asset resolution, compatible query bundles by hash and freshness, stable templates, browser discovery, and the host-approved font location.
- Retry only the failed query, copy, or image candidate. Never restart the full chain.
- If a valid title, body, and image exist, show them before doing any selection-freeze or publication work.

## Selection Freeze

Run this phase only after the user selects a preview or asks to continue with the sole recommended preview.

1. Freeze the exact selected title, body, image, creator view, query refs, and image byte hash. Do not rewrite them silently.
2. Run `references/skills/orchestrate-cuebook-creator-workflow/SKILL.md` from the selected preview, materializing only contracts required for the chosen Frame. Skip feed normalization, opportunity selection, recipe composition, program planning, and multi-candidate calibration unless the user explicitly requested those features.
3. Use `references/skills/assemble-cuebook-publish-candidates/SKILL.md` only to convert the selected preview into release lineage; do not regenerate unselected siblings. Compile settlement claim/formula only when the user explicitly chose a settleable format and accepted every required field.
4. Re-render only the selected direction with production Noi fonts. Reuse a validated shared font cache when available; otherwise stage fonts once. Produce compact and, for public/unlisted visibility, OG derivatives. Then run full typography, collision, binding, alt-text, byte-hash, canonical-pixel-hash, capture, and manifest checks.
5. Assemble `FrameDraftAssemblyV1 + FrameDraftAssemblyBindingV1` only after the selected content and all required media roles are frozen. The assembly's media hashes are encoded PNG byte hashes; manifest `role_hashes` are canonical RGBA8 pixel hashes.

Before upload, validate the selected handoff:

```bash
node scripts/validate_frame_draft_assembly.mjs assembly.json \
  --candidate-set publish-candidate-set-v1.json \
  --direction-set visual-direction-set-v1.json \
  --capture-report capture-report.json
```

## Publish

Publish only after explicit user intent and only through the frozen Frame MCP sequence in `assets/plugin/mcp-capability-map-v1.json`:

`get_frame_capabilities` → begin each media upload → signed HTTPS PUT → complete each media upload → poll owner-only `get_frame_media_status` → `register_frame_visual_manifest` → create/update draft with assembly plus registered binding → prepare → first-party consent bound to `prepared_hash` → publish → `get_frame` readback.

- Never pull image bytes back through MCP, browse a display URL, use a standalone media-retrieval operation, or fall back to base64.
- Give every mutation its own fresh lowercase UUIDv7. Replay the same key only with the identical payload.
- If a required capability is absent, stop at the latest completed phase without a legacy write fallback.
- Corrections and withdrawals use their dedicated prepare → first-party consent → execute flows.

After manifest registration, repeat the assembly validator with `--binding` and `--visual-manifest` before draft creation.

## Creator Experience

- Optimize the creator's intended judgment before adding caveats. Evidence may strengthen, connect, narrow, or condition it.
- If fresh Cuebook data materially contradicts the view, state the conflict plainly and let the creator choose; never silently replace the idea or turn the result into a correction lesson.
- The body carries the hook, judgment, and concise causal read. The image carries two to four reasoning beats, observed evidence or trend, and the observation window, horizon, or accepted settlement marker when material.
- Never fabricate a future price path. A mechanism may remain labeled as the creator's hypothesis.
- Show no tags, labels, source counts, scores, evidence ledgers, settlement panels, disclosures, or workflow state beside the creative.

## Outputs

- Fast preview: return `FramePreviewV1` from `references/frame-preview-v1.schema.json` and render only `candidate.frame.title`, `candidate.frame.body`, and `candidate.frame.image_ref`; attach `alt_text` to the image.
- Selected/frozen creation: return `CuebookCreationBundleV1` from `references/cuebook-creation-bundle-v1.schema.json` and validate it with `scripts/validate_creation_bundle.mjs`.
- Cross-repository Frame compatibility: keep `references/skill-assembly-golden.json` byte-compatible with the backend fixture.
