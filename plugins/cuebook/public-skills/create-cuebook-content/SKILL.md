---
name: create-cuebook-content
description: "Turn a user's market idea or selected Cuebook material into one creator-owned Frame: a sharp title, reasoned body, and one mobile-first editorial image. Use for drafting, redesigning, or publishing a viewpoint. Ask at most one optional heuristic question, use Cuebook evidence first, keep observation separate from interpretation, and never fabricate a future path, fake an official index, trade, or publish before confirmation."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses the connected Cuebook MCP server for current claims and may use one bounded authorized Web fallback when Cuebook leaves a material gap. Node.js 18+ and local Chromium/Chrome are required for deterministic rendering.
---

# Create Cuebook Content

Make the creator feel that their idea was understood, sharpened, and expressed beyond what they could have assembled alone. A visible Frame is always one title, one body, and one paired image. Evidence lineage, hashes, scopes, upload progress, receipts, consent, and workflow state stay backstage.

## Connection Gate

Run this gate before the interview, research, or rendering. Assume the plugin's install-time host authentication is complete; this Skill does not own OAuth or connection repair.

1. Use the host-installed `cuebook` MCP connector and call `get_frame_capabilities` once as the normal Create preflight. A normal MCP result is the only runtime readiness proof. Cache that result for this task and reuse it at publication; do not make a routine second capabilities call.
2. If the Tool is absent, cannot be called, interrupts for authentication, or returns a token, reconnect, or transport failure, preserve the creator's request and stop before interviewing or rendering. Say that the Cuebook install-time connection is not ready and ask the creator to complete the plugin README setup, then retry the preserved request in one later task.
3. Do not enumerate generic MCP resources, inspect connector internals, run a CLI login, implement OAuth discovery or DCR, exchange tokens, create a custom client, store credentials in task files, open another task, or retry automatically. Do not diagnose a local marketplace plugin through ChatGPT or public plugin management.
4. If the plugin was installed in the current task, finish its install-time authentication and open one new task before creation. Do not reinstall from inside Create.
5. Missing write or publish actions do not block a local preview after the preflight succeeds. Refresh capabilities only when the cached result did not advertise a required write, is no longer valid after a long-lived task, or the server explicitly reports capability change; otherwise proceed from the cached result.

## Route

- Default to **Fast Preview**. Do not build release contracts before the creator sees the result.
- Enter **Selection Freeze** only after the creator chooses the preview or asks to continue with the sole recommendation.
- Enter **Publish** only after explicit publication intent. Read [Frame Publish Workflow](references/frame-publish-workflow.md) at that point, not during preview.
- If an upstream system provides a frozen commitment, evidence refs, mechanism path, and render-safe projection, consume them as truth. Improve expression and design without re-deciding the asset, direction, horizon, or facts. A layout reroll never reopens the thesis.

## Fast Preview

1. Extract the subject, direction, observation window, future horizon, claim, proposed mechanism, and next observable. Keep the observation window (“what behavior was noticed?”) separate from the horizon (“when should the view be revisited?”). Treat the creator's view as material to strengthen, not a claim to debunk before helping.
2. Run the one-round interview below before querying. If the creator skips it, continue immediately and do not reduce the result.
3. Resolve each named asset once through the connected Cuebook MCP server, then call the smallest relevant read subset through `references/modules/query-cuebook.md`. Use the client policy in `assets/plugin/mcp-capability-map-v1.json`; it is a routing aid, never a security boundary. For price, trend, relative strength, or dated horizons, retrieve candles and current market state together. Label any assistant-chosen comparator explicitly. For a custom basket or long/short expression, resolve 3–8 transparent components and retrieve their smallest compatible candle window in parallel. Do not request a public basket, DAG, or metric Tool; local deterministic code calculates the Creator Lens. `get_reasoning_graph` is not a default creator read.
4. Run one bounded Cuebook evidence phase: one parallel batch plus at most one dependency follow-up for an already identified filing, event, disclosure, prediction market, or news cluster. Reuse a compatible fresh bundle. When a material gap remains and Web research is authorized, use one targeted Web batch with at most three searches and three primary or authoritative sources. Never loop between Cuebook and Web.
5. Type meaning honestly. A price path or measured relationship is observed or derived; a reported event is reported; the creator's causal bridge remains creator-owned unless a source directly establishes it; future conditions remain conditional. An executable observation test must support the exact factual sentence in the body and bind to the exact visible geometry. A source ref alone is not proof. If evidence conflicts with the premise, say so plainly and let the creator choose; do not silently rewrite the idea into a correction lesson.
6. Read [Frame Expression System](references/frame-expression-system.md), [Frame Art Direction](references/frame-art-direction.md), and [Frame Feed Attention](references/frame-feed-attention.md). Build a [market preview job](references/frame-market-preview-job.schema.json) for curves, relative paths, drawdown/recovery, correlation, event windows, thresholds, scenarios, causal paths, or evidence tension. Build a [Lens preview job](references/frame-lens-preview-job.schema.json) only for a transparent Creator Lens or long/short Lens. Pass frozen raw data into the runner; do not ask the model to calculate or sketch market curves.
7. Run one stable command. It validates, calculates, composes, rasterizes one publication image, and writes the public Frame:

```bash
node scripts/run_fast_preview.mjs frame-preview-job.json ./preview-output
```

8. Present `frame.json` immediately when it passes. Its public contract is exactly:

```json
{
  "title": "...",
  "body": "...",
  "image_ref": "...",
  "alt_text": "..."
}
```

Do not add a public `state`, version, candidate id, evidence bundle, hash, score, source count, scope, upload status, receipt, consent field, backend enum, or canonical web link. During preview, explain any blocker in ordinary language rather than leaking internal status. After a valid publication receipt, say exactly “已发布，去 Cuebook App 看。” and stop: do not call `get_frame`, open or curl a web page, inspect page HTML or metadata, or present `canonical_url`. After a withdrawal say “已撤回.” Audit details remain internal unless the creator asks.

## One-Round Heuristic Interview

- Reflect the distinctive kernel tentatively: 「我听到的不是单纯的 ___，而是 ___。」 Keep it specific, supportive, and easy to correct.
- Ask one high-leverage question about the thinnest link: `anomaly`, `causal_bridge`, `why_now`, `next_footprint`, `blind_spot`, or `voice_lock`. One optional concrete-memory deepener may sit in the same turn.
- Offer two or three tentative footholds only to help language emerge: 「更像 A、B，还是你看到的另一种力量？」 Never turn unprovided actors, events, or mechanisms into facts unless the creator adopts them and evidence supports them.
- Do not dump categories such as news, signals, intuition, proof, invalidation, and price. The question should feel like an interview that helps the idea become more itself, not an examination.
- `直接做`, `就按这个做`, `就这些`, `没有更多`, an equivalent refusal, or an initial request not to ask closes it immediately. Do not ask again, mention missing context, or delay creation.
- This interview always precedes any price-target question. Fast Preview needs no target price. For an eligible single-asset `long` or `short` Frame, publication defaults to the standard deadline rule below and requires no separate settlement interview. Ask for a price only when the creator explicitly requests a price-target override.

For the BTC example, a useful prompt is: 「你抓到的可能不只是 BTC 看涨，而是美股泄压时，BTC 的不跌本身正在变成资金选择。这个反常更像资金提前换仓，还是持续买盘在吸收抛压？有没有哪个盘面瞬间或消息让你第一次有这个感觉？就按这个做也可以，我会直接生成。」

## Content And Image Contract

- Title owns the memorable judgment. Body opens with the strongest tested observation, develops the creator's causal chain in concrete language, and closes on the horizon plus one confirming or weakening observation. Use three to five short paragraphs and normally 260–700 visible Chinese characters (roughly 120–300 English words); finish sooner when the idea is genuinely simple, but never compress a real mechanism into a slogan. Image contributes the relationship, time structure, creator interpretation, and next check. Never paste the body into the canvas or repeat the title as an image headline.
- Give the body enough room to answer three reader questions: what changed, why the creator thinks it matters, and what should become visible by the deadline. Distinguish observed facts from the creator's inference without turning the prose into a fact-check, risk form, or research memo. Keep supporting details that move the reasoning; remove generic context and repeated caveats.
- Make the first paragraph a complete Feed lead that can stand alone when the App truncates the rest. Put the deeper mechanism and future check in the following short paragraphs, so a longer body improves detail without increasing image density or weakening the fast-scroll hook.
- Choose idea topology before layout, and layout before surface. Use rich geometry only when it answers the argument: price/indexed curve, relative spread, drawdown/recovery, rolling correlation, event reaction, threshold, causal transmission, scenario branch, Lens anatomy, or long/short contribution.
- Show unresolved future time with a clock, checkpoint, event, confirmation, invalidation, or scenario branch. Never draw a fabricated future price path, projected candle, decorative outcome arrow, or uncalibrated probability fan.
- Render exactly one 2488 × 1056 publication PNG, authored against a 622 × 264 mobile display box and rasterized at 4x. It is the same image used in Feed and detail views. Keep at most two reader-essential copy groups and a 22 px display-size type floor; verify the finished bitmap directly from pixels. Do not create or present an HTML preview, and do not render, upload, bind, or present separate compact, web, thumbnail, or OG files.
- Use one dominant geometry, at most two essential copy groups, minimal provenance, and one future check. Keep source, as-of time, and transform honest and legible. Synthetic fixtures are visibly non-publishable and can never masquerade as market observations.
- Preserve Cuebook identity while varying reading direction, chart share, geometry, narrative placement, type system, material, density, and light/dark tone. Three requested alternatives must differ in grammar, composition, design family, narrative placement, and grayscale silhouette—not only color.
- Emotional value is precision: make the creator's non-obvious intuition feel seen and publication-ready. Do not add generic praise, hype, certainty, or engagement bait.
- Alt text must describe the selected candidate's actual geometry. Never reuse a price-curve description for a scenario, drawdown, or Lens image.

## Quality And Latency

The runner must verify creator ownership, numerical source support, text-image division, future-time integrity, stable bindings, accessible SVG, exact dimensions, decodable and materially painted PNGs, copy fit, and collision-free mobile rendering. Retry only the failed query, copy, or raster stage.

- Warm target: 30–60 seconds for one complete Frame. A cold connector or browser start may take up to 120 seconds.
- Use one asset-resolution step, one batched Cuebook phase, one optional bounded Web batch, one copy pass, and one runner invocation.
- After selection, use the direct Fast Publish lane: one call per required mutation, one signed PUT, and only the declared media-status polling. An uncertain mutation transport may be replayed once with the same key and identical payload; never retry a domain rejection or probe with alternate payloads.
- Do not reread the whole repository, inspect renderer source, rebuild valid stages, create a local OAuth client, or run release packaging before selection.
- When a valid title, body, and image exist, show them before any freeze or publish work.

After the Frame, add one short handoff outside the creative: name a specific strength in the creator's idea, say what Cuebook concretely supported or structured, identify Web supplementation separately, and suggest one useful next observation. Keep it specific, not promotional.

## Controlled Variation

Default to one strongest preview. If the creator asks “再来一版” or “换个感觉,” freeze the claim, adopted interview signal, exact tested observation, evidence refs, observation window, horizon, direction, and fact typing. Do not call Cuebook or Web again for a layout-only reroll.

Change one truthful expressive route and avoid the last two design or attention fingerprints when an equally truthful route exists. Return one new variant at a time; return three only when explicitly requested. Say the new emphasis in one phrase and offer “锁定这版.” Stop offering variants when the creator is satisfied. A changed idea, premise, horizon, direction, or settlement meaning creates a new meaning lock.

## Selection Freeze

After selection, freeze the exact title, body, image, creator meaning, evidence refs, and image bytes. Never silently rewrite them. An ordinary one-preview publication uses the direct Fast Publish lane in [Frame Publish Workflow](references/frame-publish-workflow.md): reuse the validated `FramePreviewV1` candidate and its frozen 2488 × 1056 PNG, then create only the raster audit, hashes, visual manifest, settlement intent, assembly, and binding required by Frame. Do not reconstruct `PostV1`, `VisualDirectionSetV1`, `PublishCandidateSetV1`, a workflow DAG, a release bundle, or an HTML page merely to publish an already selected preview.

Invoke `references/modules/orchestrate-cuebook-creator-workflow.md` only for an explicit three-alternative batch, correction workflow, reproducibility audit, or another advanced request whose output genuinely needs those contracts. In the ordinary lane, treat the selected PNG as `finished_bitmap`; HTML and font files are unnecessary and must not become a publication dependency. Reuse the frozen PNG as the sole publication master and do not produce release derivatives.

Read [Frame Publish Workflow](references/frame-publish-workflow.md) before upload or publication. Keep internal wire type names, hashes, mutation keys, and server states inside that workflow—not in the creator-facing Frame.

Ordinary publication uses `prepare_frame_publish` → `publish_frame`; correction follows its matching prepare → publish pair without separate action consent. Withdrawals alone retain first-party consent and consent-status polling.

### Standard Deadline Settlement

- For every eligible new single-asset `long` or `short` Frame, use one asset-neutral rule: freeze the exact creator-owned deadline, then compare the latest completed provider-official price observation at or before it with the server-captured publication baseline. `long` succeeds above the baseline; `short` succeeds below it; equality is flat. Encode every new horizon with `session_policy: "at_instant"` and freeze `threshold_bps: "0"` internally, regardless of whether the asset is crypto, equity, ETF, or index.
- Do not ask whether the asset is continuous, exchange-traded, in regular hours, after hours, on a market day, or at the next eligible close. Those are internal observation-source concerns. Never offer `next_eligible_close` as a creator choice for a new Frame.
- When the preview already makes the asset, direction, and horizon clear, the creator's explicit “publish this” confirms the selected content and this standard rule together. Do not ask a second settlement-confirmation question or restate a form of fields.
- Ask another question only for a missing asset, direction, or horizon, or when the creator explicitly requests a target-price or pair-settlement override. If the deployed backend does not yet advertise the standard deadline policy for that asset, stop before publication rather than silently reverting to a trading-session rule.
- Keep the server-selected observation source, baseline capture, grace period, sealing, adjustments, and audit metadata backstage. The Skill never weakens OAuth, scope, prepared-hash, publish-token, idempotency, or transaction checks to save time.

## Non-Negotiable Boundaries

- Never place a trade, silently publish, or create social-platform variants. This Skill creates Frame only.
- Never print mutable current or entry price in a pre-publish image without a backend quote or entry lock. Prefer `BTC · 30D LONG`; historical axes and explicitly accepted settlement levels may remain when bound.
- A comparison chart is not a pair settlement. Mixed session families such as equal-notional BTC/QQQ currently degrade to single-asset settlement or block explicitly.
- A creator-defined basket is a Creator Lens, never an official index. Show components, weights, origin, formula, and limitations in the expanded view; disclose retrospective selection bias when the basket was assembled after the observation window began.
- The public artifact is [Frame](references/frame.schema.json). Internal preview and release contracts remain available for lineage and backend compatibility but are never the product surface.
