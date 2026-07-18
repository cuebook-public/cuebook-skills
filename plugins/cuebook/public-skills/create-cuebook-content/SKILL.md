---
name: create-cuebook-content
description: Turn a user's market idea or selected Cuebook material into a creator-owned Frame with one title, body, and paired image. Separate the historical observation window from any future horizon, route price/trend/relative claims to a sourced market chart and qualitative mechanisms to a logic card, and ask one optional high-leverage heuristic question before generation. A skip proceeds immediately. Default to one fast preview and generate three only on request. Use Cuebook for material current claims, preserve the user's judgment, and defer settlement, upload, and publication until selection. Never create social-platform variants, silently publish or trade, fabricate query results, build OAuth, or present a source view as the user's without adoption.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses a connected Cuebook MCP server first for current market claims and may use one bounded authorized Web fallback when Cuebook leaves a material evidence gap. Degrades to a conditional or blocked preview, never invented values. Node.js 18+ with Playwright and local Chromium/Chrome for deterministic preview rendering.
---

# Create Cuebook Content

Make the creator's idea clearer, sharper, and more visually legible. The visible creative is always one title, one body, and one paired image. Keep Cuebook evidence, ownership, warnings, settlement semantics, hashes, and workflow state backstage.

## Default: Fast Preview

Use `preview_fast` unless the user explicitly asks to freeze, upload, or publish an already selected Frame.

1. Preserve the user's original wording and extract subject, direction, **observation window**, future horizon, claim, proposed mechanism, and next observable in memory. The observation window answers “what recent behavior did the creator notice?”; the horizon answers “by when should the forward view be revisited?” Never collapse them into one period. Ask for subject, direction, or horizon only when it cannot be inferred safely. If “最近” is vague, use the smallest honest standard window supported by the retrieved series, label its exact dates, and compare one nearby standard window before making a broad trend claim. Treat the user's view as the idea to improve, not a claim to debunk before helping.
2. Run the **One-Round Heuristic Interview** below before querying, generating, or asking anything about price or settlement. Preserve the exact answer in working context and distill useful parts into the claim, mechanism, evidence search, next watch, and visual argument.
3. Use the plugin-provided `cuebook` MCP connection and the client-side `skill_tool_policy` in `assets/plugin/mcp-capability-map-v1.json`. Resolve each named asset once, then issue only the smallest relevant subset of `creator_fast_allowlist` concurrently through `references/modules/query-cuebook.md`. For price path, trend, relative strength, volume, or a dated horizon, retrieve `get_candles` plus the latest `get_market_state`; when the creator names a broad market, use an explicit transparent proxy only after labeling it as the assistant's comparator choice (for example SPY for broad U.S. equities, QQQ only for Nasdaq/technology). Reuse a compatible fresh query bundle or cache entry. Do not call Paper, Frame mutation, correction, withdrawal, or deep-research tools during preview; `get_reasoning_graph` is never a default creator read. Do not scan generic MCP resources repeatedly, inspect renderer source, implement OAuth/DCR, exchange tokens, or create a local HTTP client. If the host reports unauthorized, request the host's normal Cuebook reconnect once and resume from the frozen request.
4. For material current news, prices, positioning, valuation, market series, comparators, or settlement premises, bind one `CuebookQueryBundleV1`. Run at most one bounded Cuebook batch after asset resolution and freeze only the result refs actually used. Keep the observed series factual; keep causal language such as “资金回流” as the creator's hypothesis unless a retrieved source directly supports it. If the batch leaves a material evidence gap and the runtime authorizes Web research, run at most one targeted Web batch with no more than three searches and three primary or authoritative sources. Record every source's `retrieved_via`, locator, and retrieval time; never loop between Cuebook and Web. A partial usable bundle yields a conditional preview. If neither source path supports a factual premise, keep it explicitly as the creator's hypothesis or omit it; block only when the unsupported fact is indispensable to the requested Frame.
5. For the default one-candidate path, build one compact [FramePreviewFastJobV1](references/frame-preview-fast-job-v1.schema.json), then run `scripts/run_fast_preview.mjs` once to compile, render, hash, and validate the final `FramePreviewV1`. Pass raw frozen Cuebook candle envelopes into the job; do not make the model hand-normalize OHLCV or reconstruct chart schemas. An explicit three-alternative request is the only exception: generate the three copy/logic-template records in one pass, render them together with `scripts/render_frame_previews.mjs`, and validate one requested-three `FramePreviewV1`. Do **not** materialize CreatorFeedV1, ContentOpportunitySetV1, ContentRecipeV1, ResearchPackV1, MarketViewSemanticsV1, CreatorExpressionPlanV1, ViewpointDataBundleV1, PostV1, VisualDirectionSetV1, PublishCandidateSetV1, a workflow DAG, settlement formula, or release bundle before the creator sees the preview. Use those contracts only after selection or for an explicitly requested advanced workflow.
6. Generate the title and body in one model pass. Default to one recommended candidate. Produce three only when the user explicitly requests alternatives; generate all three copy variants in one batch from the same meaning lock. Keep the creator's viewpoint, source-supported observation, and proposed mechanism distinct internally but fluent in public copy.
7. For the default candidate, choose exactly one visual route. Use the sourced `references/modules/render-cuebook-thesis-chart.md` route for price path, trend, relative performance, volume, event reaction, or a dated forward horizon when usable series exist. Use the stable `verdict`, `proof`, or `system` logic-card route for a qualitative mechanism, creator intuition, or a material-data gap. Let the claim being evaluated choose the chart axis: “30 天后 BTC 高于现在” is a single-price thesis even when SPY is supporting context; use a relative chart only when the creator's evaluated claim is BTC-versus-SPY outperformance. Never settle a directional claim from a relative-return axis. A relative chart proves only observed relative performance; it never proves the causal flow hypothesis. A single-price thesis chart may show the declaration and horizon clock, but never an invented future path. An explicit three-alternative request uses the three stable logic templates once each from the same meaning lock. Render only 2488 x 1056 publication previews at this stage. Do not hand-author HTML/SVG, copy fonts into every task, render compact/OG derivatives, or run release audits before selection.
8. The runner performs only four preview checks: creator ownership, source binding, copy fit, and successful image render. Return the title, body, and image immediately when they pass. Do not reopen renderer code, rerun the whole chain after a local render retry, or let internal packaging delay an already valid preview.
9. Add one short handoff outside the Frame: name a specific strength in the creator's idea, say what Cuebook concretely supported or structured, identify any Web supplementation separately, and suggest one useful next observation. Do not use generic praise or a marketing slogan.

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
node scripts/run_fast_preview.mjs frame-preview-fast-job-v1.json ./preview-output
```

## Preview Latency Contract

- Warm target: return one complete Frame in 30-60 seconds. A cold connector/browser start may take up to 120 seconds; never let optional enrichment push a preview toward five minutes.
- Start the generation clock when the creator answers or skips the optional interview; human response time is not pipeline latency.
- Use at most one asset-resolution step, one batched Cuebook query phase, one optional bounded Web fallback batch, one copy generation pass, and one deterministic runner invocation. After the tools respond, data adaptation plus image rendering should normally stay under 10 seconds.
- Cache canonical asset resolution, compatible query bundles by hash and freshness, stable templates, browser discovery, and the host-approved font location.
- Retry only the failed query, copy, or image stage. Never restart the full chain, reread schemas to reconstruct a job, or regenerate valid copy because rasterization retried.
- If a valid title, body, and image exist, show them before doing any selection-freeze or publication work.

## Selection Freeze

Run this phase only after the user selects a preview or asks to continue with the sole recommended preview.

1. Freeze the exact selected title, body, image, creator view, query refs, and image byte hash. Do not rewrite them silently.
2. Run `references/modules/orchestrate-cuebook-creator-workflow.md` from the selected preview, materializing only contracts required for the chosen Frame. Skip feed normalization, opportunity selection, recipe composition, program planning, and multi-candidate calibration unless the user explicitly requested those features.
3. Use `references/modules/assemble-cuebook-publish-candidates.md` only to convert the selected preview into release lineage; do not regenerate unselected siblings. Compile settlement claim/formula only when the user explicitly chose a settleable format and accepted every required field.
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

`get_frame_capabilities` → begin each media upload → signed HTTPS PUT → complete each media upload → poll owner-only `get_frame_media_status` → `register_frame_visual_manifest` → create/update draft with assembly plus registered binding → `prepare_frame_publish` → `publish_frame` with the returned `prepared_hash` and `publish_token` → `get_frame` readback.

- Never pull image bytes back through MCP, browse a display URL, use a standalone media-retrieval operation, or fall back to base64.
- Give every mutation its own fresh lowercase UUIDv7. Replay the same key only with the identical payload.
- A prepared initial publish requires `prepared_hash`, `publish_token`, `publish_token_expires_at`, and `preview`. It never returns `consent_request_id`, `consent_url`, or `consent_expires_at`; never request or poll `get_frame_action_consent` for ordinary publication.
- The active `cuebook.frame.publish` OAuth grant and the first-party publish action authorize initial and correction publication. Inside the publish transaction, the server recomputes `prepared_hash` and revalidates the credential, credential family, grant, client, user, scope, policy, and token.
- If a required capability is absent, stop at the latest completed phase without a legacy write fallback.
- Corrections use `prepare_frame_correction_publish` → `publish_frame_correction` with no separate consent request. The prepared correction additionally requires `base_release_id` and `expected_economic_hash`, and its publish input also omits `consent_request_id`.
- Withdrawals alone retain `prepare_frame_withdraw` → first-party consent → `get_frame_action_consent` polling → `withdraw_frame`.

After manifest registration, repeat the assembly validator with `--binding` and `--visual-manifest` before draft creation.

## Creator Experience

- Optimize the creator's intended judgment before adding caveats. Evidence may strengthen, connect, narrow, or condition it.
- If fresh Cuebook data materially contradicts the view, state the conflict plainly and let the creator choose; never silently replace the idea or turn the result into a correction lesson.
- The body carries the hook, judgment, and concise causal read. The image carries two to four reasoning beats, sourced observation or clearly labeled creator hypothesis, and the observation window, horizon, or accepted settlement marker when material.
- Never fabricate a future price path. A mechanism may remain labeled as the creator's hypothesis.
- Show no tags, labels, source counts, scores, evidence ledgers, settlement panels, disclosures, or workflow state beside the creative.

## Outputs

- Fast preview: return `FramePreviewV1` from `references/frame-preview-v1.schema.json` and render only `candidate.frame.title`, `candidate.frame.body`, and `candidate.frame.image_ref`; attach `alt_text` to the image.
- Selected/frozen creation: return `CuebookCreationBundleV1` from `references/cuebook-creation-bundle-v1.schema.json` and validate it with `scripts/validate_creation_bundle.mjs`.
- Cross-repository Frame compatibility: keep `references/skill-assembly-golden.json` byte-compatible with the backend fixture.
