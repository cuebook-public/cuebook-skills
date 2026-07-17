---
name: create-cuebook-content
description: Turn a user's market idea or selected Cuebook material into a creator-owned Frame with one title, body, and paired image. After inferring subject, direction, and horizon, reflect the distinctive idea and ask one optional heuristic question chosen from anomaly, causal transmission, timing, next footprint, market blind spot, or creator voice. Ask before any price target; a skip proceeds immediately. Default to one fast preview and generate three only on request. Use Cuebook for material current claims, preserve the user's judgment, and defer settlement, upload, consent, and publication until selection. Never create social-platform variants, silently publish or trade, fabricate query results, build OAuth, or present a source view as the user's without adoption.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for current market claims; degrades to a conditional or blocked preview, never invented values, when tools are unavailable. Node.js 18+ with Playwright and local Chromium/Chrome for deterministic preview rendering.
---

# Create Cuebook Content

Make the creator's idea clearer, sharper, and more visually legible. The visible creative is always one title, one body, and one paired image. Keep Cuebook evidence, ownership, warnings, settlement semantics, hashes, and workflow state backstage.

## Default: Fast Preview

Use `preview_fast` unless the user explicitly asks to freeze, upload, or publish an already selected Frame.

1. Preserve the user's original wording and extract subject, direction, horizon, claim, proposed mechanism, and next observable in memory. Ask for subject, direction, or horizon only when it cannot be inferred safely. Treat the user's view as the idea to improve, not a claim to debunk before helping.
2. Run the **One-Round Heuristic Interview** below before querying, generating, or asking anything about price or settlement. Preserve the exact answer in working context and distill useful parts into the claim, mechanism, evidence search, next watch, and visual argument.
3. Use the plugin-provided `cuebook` MCP connection. Resolve the asset once, then issue the smallest independent reads concurrently through `$query-cuebook`. Reuse a compatible fresh query bundle or cache entry. Do not scan generic MCP resources repeatedly, implement OAuth/DCR, exchange tokens, or create a local HTTP client. If the host reports unauthorized, request the host's normal Cuebook reconnect once and resume from the frozen request.
4. For material current news, prices, positioning, valuation, market series, comparators, or settlement premises, bind one `CuebookQueryBundleV1`. Batch compatible reads after asset resolution and freeze only the result refs actually used. A partial usable bundle yields a conditional preview; unavailable material data blocks the preview instead of triggering web-search substitution or invented values.
5. Build one compact `FramePreviewV1` directly. Do **not** materialize CreatorFeedV1, ContentOpportunitySetV1, ContentRecipeV1, ResearchPackV1, MarketViewSemanticsV1, CreatorExpressionPlanV1, ViewpointDataBundleV1, PostV1, VisualDirectionSetV1, PublishCandidateSetV1, a workflow DAG, settlement formula, or release bundle before the creator sees the preview. Use those contracts only after selection or for an explicitly requested advanced workflow.
6. Generate the title and body in one model pass. Default to one recommended candidate. Produce three only when the user explicitly requests alternatives; generate all three copy variants in one batch from the same meaning lock. Keep the creator's viewpoint, Cuebook-supported observation, and proposed mechanism distinct internally but fluent in public copy.
7. Render the paired image with the stable `verdict`, `proof`, or `system` template through `scripts/render_frame_previews.mjs`. One candidate uses the best-fitting template; an explicit three-candidate request uses all three once. Render only the 2488 x 1056 publication preview at this stage. Do not hand-author HTML, copy fonts into every task, render compact/OG derivatives, or run release audits before selection. A host-approved shared Noi font cache may be referenced; otherwise use the preview fallback and stage production fonts during selection freeze.
8. Run only four preview checks: creator ownership, source binding, copy fit, and successful image render. Validate with `scripts/validate_frame_preview.mjs`. Return the title, body, and image immediately when they pass. Internal packaging must never delay an already valid preview.
9. Add one short handoff outside the Frame: name a specific strength in the creator's idea, say what Cuebook concretely helped support or structure, and suggest one useful next observation. Do not use generic praise or a marketing slogan.

## One-Round Heuristic Interview

- Extract everything already supplied; never ask the creator to repeat it. Start with one tentative reflection that names the idea's distinctive kernel: 「我听到的不是单纯的 ___，而是 ___。」 Keep it specific, supportive, and easy to correct. This reflection is understanding, not a new fact or a verdict.
- Diagnose the thinnest link and choose **one** heuristic: `anomaly` when something expected did not happen; `causal_bridge` when a catalyst lacks a transmission path or first mover; `why_now` when timing is unexplained; `next_footprint` when the idea lacks an observable confirmation; `blind_spot` when the creator's differentiated edge is implicit; `voice_lock` when the reasoning is already complete but its most important emphasis is unclear.
- Ask one primary question and, only when useful, one concrete-memory deepener in the same turn. Offer two or three seed-derived footholds with tentative language such as 「更像 A、B，还是你看到的另一种力量？」 This should help the creator discover language for an intuition, not choose from a forced menu. Never invent a specific event or present an unprovided actor or mechanism as known; broad plausible footholds must remain explicit possibilities and cannot travel forward unless the creator adopts them.
- Do not dump categories such as 「有什么新闻、线索、signal、直觉？」 and do not ask for proof, invalidation, or a defense of the view. News, interviews, chart moments, flows, and felt anomalies are possible answers, not a questionnaire.
- For the BTC example, prefer: 「你抓到的可能不只是 BTC 看涨，而是美股泄压时，BTC 的不跌本身正在变成资金选择。这个反常更像资金提前换仓，还是持续买盘在吸收抛压？有没有哪个盘面瞬间或消息让你第一次有这个感觉？」 Then state that 「就按这个做」 moves directly into generation.
- The interview is optional. `直接做`, `就按这个做`, `就这些`, `没有更多`, an equivalent refusal, or an initial request not to ask questions closes it immediately. Do not ask again, reduce the result, mention missing context, or delay the Cuebook query and preview.
- Use creator-supplied news as a search lead until Cuebook verifies it; use clues and signals as candidate evidence beats; use intuition as the creator's hypothesis, angle, or visual mechanism. Suggested footholds remain assistant hypotheses unless the creator adopts them. Preserve authorship and never silently convert inference into observed fact.
- This interview always precedes any price-target or settlement question. Fast Preview requires no target price. Ask for a price only after the creator explicitly chooses a price-target settlement during a later freeze or publication phase.

```bash
node scripts/render_frame_previews.mjs frame-preview-render-v1.json ./preview-output
node scripts/validate_frame_preview.mjs frame-preview-v1.json --asset-root ./preview-output
```

## Preview Latency Contract

- Warm target: return one complete Frame in 90-180 seconds; never plan more than five minutes of preview work.
- Start the generation clock when the creator answers or skips the optional interview; human response time is not pipeline latency.
- Use at most one asset-resolution step, one batched query phase, one copy generation pass, one template-render batch, and one lightweight validation pass.
- Cache canonical asset resolution, compatible query bundles by hash and freshness, stable templates, browser discovery, and the host-approved font location.
- Retry only the failed query, copy, or image candidate. Never restart the full chain.
- If a valid title, body, and image exist, show them before doing any selection-freeze or publication work.

## Selection Freeze

Run this phase only after the user selects a preview or asks to continue with the sole recommended preview.

1. Freeze the exact selected title, body, image, creator view, query refs, and image byte hash. Do not rewrite them silently.
2. Run `$orchestrate-cuebook-creator-workflow` from the selected preview, materializing only contracts required for the chosen Frame. Skip feed normalization, opportunity selection, recipe composition, program planning, and multi-candidate calibration unless the user explicitly requested those features.
3. Use `$assemble-cuebook-publish-candidates` only to convert the selected preview into release lineage; do not regenerate unselected siblings. Compile settlement claim/formula only when the user explicitly chose a settleable format and accepted every required field.
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

Publish only after explicit user intent and only through the frozen Frame MCP sequence in `../../assets/mcp-capability-map-v1.json`:

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
