---
name: create-cuebook-content
description: Create a Cuebook Frame from a user's market idea or selected Cuebook material: one title, body, and paired editorial image. Use for requests to draft, make, or publish a viewpoint Frame. Ask at most one optional heuristic question, use Cuebook evidence first, separate observed history from the future horizon, and compile the creator's judgment, mechanism, analytical relationship, curve or scenario, and layout into one sourced graphic. Default to one preview; make three structurally different alternatives only on request. Never fabricate future paths, create social-platform variants, trade, or publish before confirmation.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses a connected Cuebook MCP server first for current market claims and may use one bounded authorized Web fallback when Cuebook leaves a material evidence gap. Degrades to a conditional or blocked preview, never invented values. Node.js 18+ with Playwright and local Chromium/Chrome for deterministic preview rendering.
---

# Create Cuebook Content

Make the creator's idea clearer, sharper, and more visually legible. The visible creative is always one title, one body, and one paired image. Keep Cuebook evidence, ownership, warnings, settlement semantics, hashes, and workflow state backstage.

## Default: Fast Preview

Use `preview_fast` unless the user explicitly asks to freeze, upload, or publish an already selected Frame.

1. Preserve the user's original wording and extract subject, direction, **observation window**, future horizon, claim, proposed mechanism, and next observable in memory. The observation window answers “what recent behavior did the creator notice?”; the horizon answers “by when should the forward view be revisited?” Never collapse them into one period. Ask for subject, direction, or horizon only when it cannot be inferred safely. If “最近” is vague, use the smallest honest standard window supported by the retrieved series, label its exact dates, and compare one nearby standard window before making a broad trend claim. Treat the user's view as the idea to improve, not a claim to debunk before helping.
2. Run the **One-Round Heuristic Interview** below before querying, generating, or asking anything about price or settlement. Preserve the exact answer in working context and distill useful parts into the claim, mechanism, evidence search, next watch, and visual argument.
3. Use the plugin-provided `cuebook` MCP connection and the client-side `skill_tool_policy` in `../../assets/mcp-capability-map-v1.json`. Resolve each named asset once, then issue only the smallest relevant subset of `creator_fast_allowlist` concurrently through `$query-cuebook`. For price path, trend, relative strength, volume, or a dated horizon, retrieve `get_candles` plus the latest `get_market_state`; when the creator names a broad market, use an explicit transparent proxy only after labeling it as the assistant's comparator choice (for example SPY for broad U.S. equities, QQQ only for Nasdaq/technology). One `focused_on_demand` follow-up inside the same bounded query phase is allowed only when an already identified filing, disclosure, prediction market, briefing, or news cluster is material to the chosen visual; do not widen the topic or delay an already sufficient preview. Reuse a compatible fresh query bundle or cache entry. Do not call Paper, Frame mutation, correction, withdrawal, or deep-research tools during preview; `get_reasoning_graph` is never a default creator read. Do not scan generic MCP resources repeatedly, inspect renderer source, implement OAuth/DCR, exchange tokens, or create a local HTTP client. If the host reports unauthorized, request the host's normal Cuebook reconnect once and resume from the frozen request.
4. For material current news, prices, positioning, valuation, market series, comparators, or settlement premises, bind one `CuebookQueryBundleV1`. Run one bounded Cuebook query phase after asset resolution: one parallel fast batch plus at most one dependency follow-up for an already identified object. Freeze only the result refs actually used. Keep the observed series factual; keep causal language such as “资金回流” as the creator's hypothesis unless a retrieved source directly supports it. If that phase leaves a material evidence gap and the runtime authorizes Web research, run at most one targeted Web batch with no more than three searches and three primary or authoritative sources. Record every source's `retrieved_via`, locator, and retrieval time; never loop between Cuebook and Web. A partial usable bundle yields a conditional preview. If neither source path supports a factual premise, keep it explicitly as the creator's hypothesis or omit it; block only when the unsupported fact is indispensable to the requested Frame.
5. Read [Frame Expression System V2](references/frame-expression-system-v2.md), then build one [FramePreviewFastJobV2](references/frame-preview-fast-job-v2.schema.json). Preserve the exact heuristic answer in `creator_signal`; type each public beat as observed, reported, derived, creator-owned, or conditional; give every visible beat and geometry a distinct stable binding. Set `data_status` honestly: `frozen_observed` for real Cuebook results, `synthetic_fixture` only for visibly non-publishable tests, or `creator_only` for a curve-free argument. Pass raw frozen Cuebook candle envelopes into the job so the deterministic runner—not the model—compiles return, relative-spread, drawdown, rolling-correlation, volume-ratio, annotations, and future-time geometry. For every market grammar, add one executable `observation_test` whose statement exactly matches the observed sentence and whose bindings point to the visible evidence geometry. Run `scripts/run_fast_preview.mjs` once to validate, compile, render, hash, and return the compatible `FramePreviewV1`. V1 input remains compatibility-only. Do **not** materialize CreatorFeedV1, ContentOpportunitySetV1, ContentRecipeV1, ResearchPackV1, MarketViewSemanticsV1, CreatorExpressionPlanV1, ViewpointDataBundleV1, PostV1, VisualDirectionSetV1, PublishCandidateSetV1, a workflow DAG, settlement formula, or release bundle before the creator sees the preview.
6. Generate title, body, typed argument, visual relationship, and one recommended composition in one model pass from the same meaning lock. Title makes the memorable judgment. Body opens with the exact tested observation, then carries the creator's mechanism and horizon. Image adds the evidence relationship, time boundary, and next observable. Do not repeat the title verbatim in the image or paste the body onto the canvas. Alt text is generated from the selected grammar and geometry; never clone it between candidates. Produce three only when explicitly requested; generate all three in one job and require different primary grammars, compositions, and at least two surface families while preserving one creator judgment and evidence set.
7. Choose the analytical relationship before the chart or layout. Use `curve_story`, `relative_divergence`, `drawdown_recovery`, `correlation_shift`, `event_window`, or `threshold_regime` when frozen series honestly supports the reader question; use `scenario_lanes`, `causal_spine`, or `evidence_balance` for qualitative or conditional logic. A future higher-price claim stays on its own asset axis even when a benchmark appears in a separate support panel; relative geometry proves observed comparison, never capital-flow causality or pair settlement. Show future time with an empty clock, reported catalyst, checkpoint, condition, invalidation, or scenario lane—never a fabricated future price path or uncalibrated fan. Give every future beat a checkable criterion and date; scenario lanes must include both a confirmation-side and an invalidation branch. Render only 2488 x 1056 publication previews before selection; no hand-authored HTML/SVG, compact/OG derivatives, font staging, or release audit.
8. The runner must actually verify the four preview gates: creator ownership; exact source coverage plus a passing numerical observation test; text-image division, axis, and future-condition compatibility; and a fully decodable, materially painted, accessible image with visible source/as-of/transform definition and every binding present. Return title, body, and image immediately when they pass. Retry only the failed query, copy, or image stage; do not reopen renderer code or rebuild the chain after a local raster retry.
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
node scripts/run_fast_preview.mjs frame-preview-fast-job-v2.json ./preview-output
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
2. Run `$orchestrate-cuebook-creator-workflow` from the selected preview, materializing only contracts required for the chosen Frame. Skip feed normalization, opportunity selection, recipe composition, program planning, and multi-candidate calibration unless the user explicitly requested those features.
3. Use `$assemble-cuebook-publish-candidates` only to convert the selected preview into release lineage; do not regenerate unselected siblings. Compile settlement claim/formula only when the user explicitly chose a settleable format and accepted every required field.
4. Freeze one honest renderer mode before producing derivatives:
   - `cuebook_template`: re-render the selected direction with licensed production Noi fonts; retain optional HTML/font provenance and run DOM typography, collision, binding, capture, alt-text, byte-hash, canonical-pixel-hash, and manifest checks.
   - `finished_bitmap`: use this for an external/already-finished bitmap and by default for a selected Fast Expression V2 raster so the approved pixels are not silently redesigned. Original HTML and production Noi files are not required and never block publication. Produce or retain exact publication, compact, and visibility-required OG PNGs, inspect every image for legibility, clipping/collision, and obvious external/untrusted imagery under the applicable policy, then run `frame-raster-audit-v1` for dimensions plus encoded-byte and canonical RGBA8 pixel hashes. Record `embedded-pixels-v1` with font verification not asserted. Backend malware, decode, EXIF/metadata, and upload-hash checks remain authoritative and are not replaced by this preflight.
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
- The title carries the memorable judgment. The body carries one calculated observation followed by the creator's mechanism, intuition, and horizon. The image carries one primary evidence relationship, at most one support panel, two to four connected reasoning/time beats, and clearly distinct observed versus creator-owned or conditional geometry. It visibly states source, as-of date, and transform basis.
- Prefer rich curves that answer the argument—indexed comparison, relative spread, drawdown/recovery, rolling correlation, event reaction, threshold state, or volume confirmation—over a decorative price line. A more complex curve is allowed only when its inputs, basis, and local derivation are explicit.
- Never fabricate a future price path. A mechanism may remain labeled as the creator's hypothesis.
- Until Cuebook returns a real backend quote/entry lock, do not print a mutable current or entry price inside a pre-publish image. Prefer relative thesis copy such as `BTC · 30D LONG`; historical axes and explicitly accepted target/settlement levels may remain when properly bound.
- A comparison chart is not automatically a pair-settlement contract. In particular, BTC/QQQ equal-notional settlement mixes continuous and scheduled session families and is currently unsupported. If the creator asks to settle it, explicitly offer single-BTC settlement or block; never silently claim pair settlement.
- Show no tags, labels, source counts, scores, evidence ledgers, settlement panels, disclosures, or workflow state beside the creative.

## Outputs

- Fast preview: return `FramePreviewV1` from `references/frame-preview-v1.schema.json` and render only `candidate.frame.title`, `candidate.frame.body`, and `candidate.frame.image_ref`; attach `alt_text` to the image.
- Selected/frozen creation: return `CuebookCreationBundleV1` from `references/cuebook-creation-bundle-v1.schema.json` and validate it with `scripts/validate_creation_bundle.mjs`.
- Cross-repository Frame compatibility: keep `references/skill-assembly-golden.json` byte-compatible with the backend fixture.
