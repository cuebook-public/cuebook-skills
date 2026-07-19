---
name: create-cuebook-content
description: Turn a user's market idea or selected Cuebook material into one creator-owned Frame: a sharp title, concise body, and one mobile-first editorial image. Use for drafting, redesigning, or publishing a viewpoint. Ask at most one optional heuristic question, use Cuebook evidence first, keep observation separate from interpretation, and never fabricate a future path, fake an official index, trade, or publish before confirmation.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses the connected Cuebook MCP server for current claims and may use one bounded authorized Web fallback when Cuebook leaves a material gap. Node.js 18+ and local Chromium/Chrome are required for deterministic rendering.
---

# Create Cuebook Content

Make the creator feel that their idea was understood, sharpened, and expressed beyond what they could have assembled alone. A visible Frame is always one title, one body, and one paired image. Evidence lineage, hashes, scopes, upload progress, receipts, consent, and workflow state stay backstage.

## Route

- Default to **Fast Preview**. Do not build release contracts before the creator sees the result.
- Enter **Selection Freeze** only after the creator chooses the preview or asks to continue with the sole recommendation.
- Enter **Publish** only after explicit publication intent. Read [Frame Publish Workflow](references/frame-publish-workflow.md) at that point, not during preview.
- If an upstream system provides a frozen commitment, evidence refs, mechanism path, and render-safe projection, consume them as truth. Improve expression and design without re-deciding the asset, direction, horizon, or facts. A layout reroll never reopens the thesis.

## Fast Preview

1. Extract the subject, direction, observation window, future horizon, claim, proposed mechanism, and next observable. Keep the observation window (“what behavior was noticed?”) separate from the horizon (“when should the view be revisited?”). Treat the creator's view as material to strengthen, not a claim to debunk before helping.
2. Run the one-round interview below before querying. If the creator skips it, continue immediately and do not reduce the result.
3. Resolve each named asset once through the connected Cuebook MCP server, then call the smallest relevant read subset through `$query-cuebook`. Use the client policy in `../../assets/mcp-capability-map-v1.json`; it is a routing aid, never a security boundary. For price, trend, relative strength, or dated horizons, retrieve candles and current market state together. Label any assistant-chosen comparator explicitly. For a custom basket or long/short expression, resolve 3–8 transparent components and retrieve their smallest compatible candle window in parallel. Do not request a public basket, DAG, or metric Tool; local deterministic code calculates the Creator Lens. `get_reasoning_graph` is not a default creator read.
4. Run one bounded Cuebook evidence phase: one parallel batch plus at most one dependency follow-up for an already identified filing, event, disclosure, prediction market, or news cluster. Reuse a compatible fresh bundle. When a material gap remains and Web research is authorized, use one targeted Web batch with at most three searches and three primary or authoritative sources. Never loop between Cuebook and Web.
5. Type meaning honestly. A price path or measured relationship is observed or derived; a reported event is reported; the creator's causal bridge remains creator-owned unless a source directly establishes it; future conditions remain conditional. An executable observation test must support the exact factual sentence in the body and bind to the exact visible geometry. A source ref alone is not proof. If evidence conflicts with the premise, say so plainly and let the creator choose; do not silently rewrite the idea into a correction lesson.
6. Read [Frame Expression System](references/frame-expression-system.md), [Frame Art Direction](references/frame-art-direction.md), and [Frame Feed Attention](references/frame-feed-attention.md). Build a [market preview job](references/frame-market-preview-job.schema.json) for curves, relative paths, drawdown/recovery, correlation, event windows, thresholds, scenarios, causal paths, or evidence tension. Build a [Lens preview job](references/frame-lens-preview-job.schema.json) only for a transparent Creator Lens or long/short Lens. Pass frozen raw data into the runner; do not ask the model to calculate or sketch market curves.
7. Run one stable command. It validates, calculates, composes, rasterizes the publication and compact images in parallel, and writes the public Frame:

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

Do not add a public `state`, version, candidate id, evidence bundle, hash, score, source count, scope, upload status, receipt, consent field, or backend enum. During preview, explain any blocker in ordinary language rather than leaking internal status. After an action, the only user-facing state phrases are concise confirmations such as “已发布” or “已撤回”; readback and audit details remain internal unless the creator asks.

## One-Round Heuristic Interview

- Reflect the distinctive kernel tentatively: 「我听到的不是单纯的 ___，而是 ___。」 Keep it specific, supportive, and easy to correct.
- Ask one high-leverage question about the thinnest link: `anomaly`, `causal_bridge`, `why_now`, `next_footprint`, `blind_spot`, or `voice_lock`. One optional concrete-memory deepener may sit in the same turn.
- Offer two or three tentative footholds only to help language emerge: 「更像 A、B，还是你看到的另一种力量？」 Never turn unprovided actors, events, or mechanisms into facts unless the creator adopts them and evidence supports them.
- Do not dump categories such as news, signals, intuition, proof, invalidation, and price. The question should feel like an interview that helps the idea become more itself, not an examination.
- `直接做`, `就按这个做`, `就这些`, `没有更多`, an equivalent refusal, or an initial request not to ask closes it immediately. Do not ask again, mention missing context, or delay creation.
- This interview always precedes any price-target or settlement question. Fast Preview needs no target price. Ask for a price only after the creator explicitly chooses a price-target settlement.

For the BTC example, a useful prompt is: 「你抓到的可能不只是 BTC 看涨，而是美股泄压时，BTC 的不跌本身正在变成资金选择。这个反常更像资金提前换仓，还是持续买盘在吸收抛压？有没有哪个盘面瞬间或消息让你第一次有这个感觉？就按这个做也可以，我会直接生成。」

## Content And Image Contract

- Title owns the memorable judgment. Body opens with the tested observation, then carries the creator's mechanism and horizon. Image contributes the relationship, time structure, creator interpretation, and next check. Never paste the body into the canvas or repeat the title as an image headline.
- Choose idea topology before layout, and layout before surface. Use rich geometry only when it answers the argument: price/indexed curve, relative spread, drawdown/recovery, rolling correlation, event reaction, threshold, causal transmission, scenario branch, Lens anatomy, or long/short contribution.
- Show unresolved future time with a clock, checkpoint, event, confirmation, invalidation, or scenario branch. Never draw a fabricated future price path, projected candle, decorative outcome arrow, or uncalibrated probability fan.
- Render one detailed 2488 × 1056 publication image and one independently composed 622 × 264 mobile image from the same meaning lock. The compact image is not a downscale: use one dominant geometry, at most two essential copy groups, a 22 px essential-type floor, minimal provenance, and one future check. Present it first for phone/feed use.
- Keep source, as-of time, and transform legible in the publication view. Compact provenance may be minimal but must remain honest. Synthetic fixtures are visibly non-publishable and can never masquerade as market observations.
- Preserve Cuebook identity while varying reading direction, chart share, geometry, narrative placement, type system, material, density, and light/dark tone. Three requested alternatives must differ in grammar, composition, design family, narrative placement, and grayscale silhouette—not only color.
- Emotional value is precision: make the creator's non-obvious intuition feel seen and publication-ready. Do not add generic praise, hype, certainty, or engagement bait.
- Alt text must describe the selected candidate's actual geometry. Never reuse a price-curve description for a scenario, drawdown, or Lens image.

## Quality And Latency

The runner must verify creator ownership, numerical source support, text-image division, future-time integrity, stable bindings, accessible SVG, exact dimensions, decodable and materially painted PNGs, copy fit, and collision-free mobile rendering. Retry only the failed query, copy, or raster stage.

- Warm target: 30–60 seconds for one complete Frame. A cold connector or browser start may take up to 120 seconds.
- Use one asset-resolution step, one batched Cuebook phase, one optional bounded Web batch, one copy pass, and one runner invocation.
- Do not reread the whole repository, inspect renderer source, rebuild valid stages, create a local OAuth client, or run release packaging before selection.
- When a valid title, body, and image exist, show them before any freeze or publish work.

After the Frame, add one short handoff outside the creative: name a specific strength in the creator's idea, say what Cuebook concretely supported or structured, identify Web supplementation separately, and suggest one useful next observation. Keep it specific, not promotional.

## Controlled Variation

Default to one strongest preview. If the creator asks “再来一版” or “换个感觉,” freeze the claim, adopted interview signal, exact tested observation, evidence refs, observation window, horizon, direction, and fact typing. Do not call Cuebook or Web again for a layout-only reroll.

Change one truthful expressive route and avoid the last two design or attention fingerprints when an equally truthful route exists. Return one new variant at a time; return three only when explicitly requested. Say the new emphasis in one phrase and offer “锁定这版.” Stop offering variants when the creator is satisfied. A changed idea, premise, horizon, direction, or settlement meaning creates a new meaning lock.

## Selection Freeze

After selection, freeze the exact title, body, image, creator meaning, evidence refs, and image bytes. Never silently rewrite them. Run `$orchestrate-cuebook-creator-workflow` only now and materialize only the contracts needed for the chosen Frame. Produce derivatives without redesigning approved pixels. `finished_bitmap` is the default for a selected Fast Preview; HTML and font files are optional provenance and never a publication gate. Use `cuebook_template` only when the selected design is intentionally re-rendered from licensed template assets.

Read [Frame Publish Workflow](references/frame-publish-workflow.md) before upload or publication. Keep internal wire type names, hashes, mutation keys, and server states inside that workflow—not in the creator-facing Frame.

Ordinary publication uses `prepare_frame_publish` → `publish_frame`; correction follows its matching prepare → publish pair without separate action consent. Withdrawals alone retain first-party consent and consent-status polling.

## Non-Negotiable Boundaries

- Never place a trade, silently publish, or create social-platform variants. This Skill creates Frame only.
- Never print mutable current or entry price in a pre-publish image without a backend quote or entry lock. Prefer `BTC · 30D LONG`; historical axes and explicitly accepted settlement levels may remain when bound.
- A comparison chart is not a pair settlement. Mixed session families such as equal-notional BTC/QQQ currently degrade to single-asset settlement or block explicitly.
- A creator-defined basket is a Creator Lens, never an official index. Show components, weights, origin, formula, and limitations in the expanded view; disclose retrospective selection bias when the basket was assembled after the observation window began.
- The public artifact is [Frame](references/frame.schema.json). Internal preview and release contracts remain available for lineage and backend compatibility but are never the product surface.
