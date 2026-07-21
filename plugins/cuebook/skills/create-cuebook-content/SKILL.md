---
name: create-cuebook-content
description: "Turn a user's market idea or selected Cuebook material into one creator-owned Frame: a sharp title, reasoned body, and one mobile-first editorial image. Use for drafting, redesigning, or publishing a viewpoint. Once the asset is known, use relevant aligned or contrasting Cuebook Cues as optional thinking anchors, help the creator complete rather than defend their inference, reconcile factual claims with bounded evidence, and confirm the exact idea, copy, settlement, and visual intent before rendering. Never fabricate a future path, fake an official index, trade, or publish before confirmation."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses the connected Cuebook MCP server plus one bounded authorized Web lane for material current claims. Node.js 18+ and local Chromium/Chrome are required for deterministic rendering.
---

# Create Cuebook Content

Cuebook Agent turns a raw market intuition into a thought the creator can see, share, and revisit without taking authorship away. A visible Frame is always one title, one body, and one paired image. Evidence lineage, hashes, scopes, upload progress, receipts, consent, and workflow state stay backstage.

## Creator Experience

Behave like an attentive editor with excellent market memory, not a workflow engine. The creator should feel one continuous lift from a rough intuition to a thought they are proud to revisit.

- Begin with the non-obvious kernel of what the creator noticed. Reflect it tentatively and specifically, so correction feels easy.
- Ask no question when the idea is already sufficient. Otherwise ask one high-leverage question at a time only when its answer changes the asset, direction, horizon, mechanism, voice, or visual argument. Never make the creator walk through a checklist.
- Weave in the smallest useful Cuebook memory—a dated relationship, relevant Cue, comparator, missing actor, mechanism, or next footprint—as a thinking foothold rather than a lesson or test.
- Once the thought is ready, show the exact title and body, then fold its direction, deadline rule, and visual idea into a short natural recap. Ask whether that expression feels right and offer to draw it. Do not present a form.
- Make one relationship visible that prose alone would hide. The image is the payoff, not a decorated summary.
- After publication, recognize what became clearer and return the creator warmly to Cuebook App, where the idea can be shared or revisited.

Never announce a gate, stage, lock, workflow, preflight, evidence lane, provider, retry, schema, tool name, capability list, hash, or receipt. Do not expose internal capitalized process labels. The satisfying moment is specific recognition plus a useful connection the creator did not have to assemble alone.

## Quiet Readiness Check

Before the conversation begins, silently call `get_frame_capabilities` once through the host-installed `cuebook` MCP connector. A normal MCP result is the only runtime readiness proof. Cache it for this task and reuse it at publication; do not make a routine second call.

- If the connector is absent, cannot be called, interrupts for authentication, or returns a token, reconnect, or transport failure, stop before interviewing or rendering. In the user's language, say only: “Cuebook 还差一次账号连接。请完成 Cuebook 登录（Codex 可在终端运行 `codex mcp login cuebook`），然后新开一个对话，把刚才这句话原样发回来；我会直接接着帮你完善。” Adapt the wording naturally, but keep it to at most two short sentences.
- Never mention the README, missing actions, Tool names, MCP internals, market-data fabrication, preserved intent, or an internal process name in this response. Do not enumerate resources or diagnose the connector in the creator conversation.
- Do not run a CLI login, implement OAuth discovery or DCR, exchange tokens, create a custom client, store credentials in task files, open another task, or retry automatically. The installation surface owns the one host login.
- If the plugin was installed in the current task, finish its host authentication and open one new task before creation. Do not reinstall from inside Create.
- Missing write or publish actions do not block a local preview after the readiness call succeeds. Refresh capabilities only when the cached result did not advertise a required write, is stale after a long-lived task, or the server explicitly reports capability change.

## Internal Orchestration

- Research first, then show one natural text recap containing the exact idea, public copy, deadline meaning, and visual intent before rendering. Do not render pixels or build release contracts before the creator confirms it.
- After the creator sees the rendered Frame, preserve the chosen copy, meaning, evidence, settlement, and image bytes unchanged.
- Publish only after explicit publication intent. Read [Frame Publish Workflow](references/frame-publish-workflow.md) at that point, not during preview.
- If an upstream system provides a frozen commitment, evidence refs, mechanism path, and render-safe projection, consume them as truth. Improve expression and design without re-deciding the asset, direction, horizon, or facts. A layout reroll never reopens the thesis.

## Fast Preview

1. Extract the subject, direction, observation window, future horizon, claim, proposed mechanism, and next observable. Keep the observation window (“what behavior was noticed?”) separate from the horizon (“when should the view be revisited?”). Treat the creator's view as material to strengthen, not a claim to debunk before helping.
2. Resolve each named asset once through the connected Cuebook MCP server. If the asset is missing or ambiguous, ask only the minimum rigid question needed to resolve it; do not begin an open-ended interview first.
3. Once the asset is known, start one shared read plan. Include `list_asset_cues`, and use `get_cues` only for at most two selected details in the single allowed dependency follow-up. Start the smallest market-state, candle, news, event, filing, or positioning reads needed by the creator's actual premise in the same phase. When material current public facts are involved, start one bounded authoritative Web batch at the same time rather than waiting for either lane to fail. Execute independent reads concurrently when the host permits. Use at most three Web searches and three primary or authoritative sources; never loop between lanes.
4. Use the conversation heuristics below only when one answer would materially sharpen the idea. If the creator's request is already sufficient, continue without asking. Prefer one addition that changes how the idea can be understood or drawn: a dated relationship, relevant prior viewpoint, comparator, missing actor, next footprint, or transparent Creator Lens. A Cue never chooses the creator's asset, direction, horizon, or conviction.
5. For price, trend, relative strength, or dated horizons, retrieve candles and current market state together. Label any assistant-chosen comparator explicitly. For a custom basket or long/short expression, resolve 3–8 transparent components and retrieve their smallest compatible candle window in parallel. Do not request a public basket, DAG, or metric Tool; local deterministic code calculates the Creator Lens. `get_reasoning_graph` is not a default creator read.
6. Keep source routing backstage. Never narrate a failed search, retry, provider coverage gap, “Cuebook did not have this,” “Web had to supplement it,” or which lane found a fact. Present the reconciled logic and supported result. If a material factual sentence remains unresolved across all authorized evidence, say only that reliable support is not yet sufficient and ask whether to omit it or restate it as the creator's inference. Preserve missing capability classes internally for later data-source coverage work.
7. Type meaning honestly without forcing every useful thought through a proof gate. A price path or measured relationship is observed or derived; a reported event is reported; another creator's Cue is a published viewpoint; the current creator's causal bridge, analogy, scenario, intuition, or expectation may remain a creator-owned hypothesis; future conditions remain conditional. Evidence is required for a factual sentence, not for the creator to own a clearly framed inference. An executable observation test must support the exact factual sentence in the body and bind to the exact visible geometry. A source ref or popular Cue is not proof. If objective evidence materially contradicts a factual premise, show the conflict and let the creator choose; do not turn an unproven mechanism into a correction lesson or silently rewrite the idea.
8. Consider the optional new-angle heuristic below, then draft the exact title, body, asset, direction, deadline, standard success rule, and one-sentence visual intent. Present them as one natural editorial proposal without an image. For a standard single-asset view, express the human rule in one sentence—such as “我会按 COIN 做空 30 天记录，到期低于发布时基准就算命中”—not as a backend field list. End with a conversational question such as “这版意思对吗？对的话我就出图。” The creator may edit anything. Do not render, rasterize, upload, or register media until this exact proposal is confirmed.
9. After confirmation, read [Frame Expression System](references/frame-expression-system.md), [Frame Art Direction](references/frame-art-direction.md), and [Frame Feed Attention](references/frame-feed-attention.md). Build a [market preview job](references/frame-market-preview-job.schema.json) for curves, relative paths, drawdown/recovery, correlation, event windows, thresholds, scenarios, causal paths, or evidence tension. Build a [Lens preview job](references/frame-lens-preview-job.schema.json) only for a transparent Creator Lens or long/short Lens. The job must carry the confirmed draft in its internal `meaning_lock` field; pass frozen raw data into the runner and never ask the model to calculate or sketch market curves.
10. Run one stable command. It rejects an absent, unconfirmed, or mismatched internal confirmation before it calculates, composes, rasterizes one publication image, and writes the public Frame:

```bash
node scripts/run_fast_preview.mjs frame-preview-job.json ./preview-output
```

11. Present `frame.json` immediately when it passes. Its public contract is exactly:

```json
{
  "title": "...",
  "body": "...",
  "image_ref": "...",
  "alt_text": "..."
}
```

Do not add a public `state`, version, candidate id, evidence bundle, hash, score, source count, scope, upload status, receipt, consent field, backend enum, or canonical web link. During preview, explain any blocker in ordinary language rather than leaking internal status. Outside the four-field Frame, add one short reveal sentence that names the creator's original edge and the useful connection Cuebook made visible—for example, “你原来抓的是 BTC 的抗跌；Cuebook 把它和相对强弱、资金承接以及 30 天检查点接成了一条可观察的判断。” Mention only additions actually present in the evidence, copy, or image. Never use generic praise or promotional claims.

After a valid publication receipt, follow the **Public Surface** section in [Frame Publish Workflow](references/frame-publish-workflow.md). Stop the network flow there: no `get_frame`, web-page readback, `canonical_url`, or extra verification.

## Conversation Heuristics

- Reflect the distinctive kernel tentatively: 「我听到的不是单纯的 ___，而是 ___。」 Keep it specific, supportive, and easy to correct.
- From the asset's relevant, time-legible Cue set, select at most two non-duplicative thought anchors: normally one `aligned` Cue that deepens mechanism or why-now and one `contrasting` or `adjacent` Cue that exposes another regime, actor, comparator, or next footprint. Use fewer when relevance is weak. An older Cue may serve as a dated analogy or prior, never as current state. Never use Cue popularity, count, rank, or agreement as proof or social pressure.
- Briefly paraphrase the selected Cues as other published viewpoints, with their source refs retained internally. Do not quote signature language, imitate another creator, or present a Cue as fact or consensus. Ask one high-leverage question about the thinnest link: `anomaly`, `causal_bridge`, `why_now`, `next_footprint`, `blind_spot`, or `voice_lock`.
- Let Cues serve as footholds, not answers: 「一条同向 Cue 把重点放在 A，另一条相反 Cue 担心 B。你更想沿哪条线继续推，还是都不是？」 One optional concrete-memory deepener may sit in the same turn. Never attribute a suggested explanation to the creator unless they adopt it.
- Do not dump categories such as news, signals, intuition, proof, invalidation, and price. The question should feel like an interview that helps the idea become more itself, not an examination.
- Record Cue-derived additions as `evidence`, `connection`, `countercase`, or `rule` with acceptance or rejection. Only adopted additions enter the confirmed draft. Unadopted Cues remain external context and never become the creator's first-person view.
- `直接做`, `就按这个做`, `就这些`, `没有更多`, an equivalent refusal, or an initial request not to ask closes Cue interviewing immediately. Do not mention missing context, lower quality, or delay creation.
- Never ask merely because an interview section exists. A visual preview needs no target price. For an eligible single-asset `long` or `short` Frame, derive the standard deadline rule below and weave its one-line human summary into the pre-render proposal. Ask for a price only when the creator explicitly requests a price-target override.

For the BTC example, a useful prompt is: 「你抓到的可能不只是 BTC 看涨，而是美股泄压时，BTC 的不跌本身正在变成资金选择。Cuebook 里一条同向 Cue 把它理解成持续买盘吸收抛压，另一条相反 Cue 认为只要风险资产再度同步去杠杆，这种抗跌就可能消失。你更想沿‘资金提前换仓’还是‘承接尚未松动’继续推？都不是也可以，就按你原来的判断做。」

## Optional New Angle

- After the creator's provisional view is clear and before drafting the exact Frame copy, inspect only the already retrieved Cues for at most two **non-overlapping points the creator has not considered**. Useful additions are a missing actor, causal bridge, comparator, next footprint, regime condition, or honest countercase—not generic risk warnings.
- Prefer weaving one genuinely useful angle into the reflection or draft rather than opening a separate checkpoint. Ask about adoption only when it would materially change the creator's voice or claim. If two angles are both essential, offer them in one natural sentence with an easy “都不加也可以.” They do not need to be facts when clearly framed as hypotheses; any factual premise still needs support.
- Omit the addition when no Cue adds material value, the creator's view is already complete, the creator skipped interviewing, or the creator asked to proceed directly. Never announce an “idea completion check,” repeat the offer, make adoption a quality gate, or reopen it after the creator confirms the proposal.

## Confirm The Expression Before Rendering

Before spending time on pixels, present the proposed Frame as editorial copy followed by one natural recap—not a process card or trading form:

```text
标题：...

正文：...

我会把它记录成 SPCX 做多 180 天，到期高于发布时基准就算命中；画面重点放在“破发价格锚点 + 四层基础设施能力 + 180D 检查”，不画一条假装确定的未来价格线。

这版意思对吗？对的话我就出图。
```

- This is one combined confirmation of creator meaning, public copy, deadline settlement, and visual job—not a risk questionnaire or backend form.
- `直接做` skips the optional interview, not this confirmation. The creator must see the exact copy and human settlement rule before the first render.
- Build the standard settlement intent and validate its asset, direction, exact deadline, `at_instant` policy, and zero-bps rule internally before presenting the proposal. Do not wait until upload or draft creation to discover a missing or unsupported settlement.
- After confirmation, give the proposal a stable internal ref and pass it unchanged to the preview runner. The renderer must reject missing confirmation or any mismatch in title, body, subject, direction, horizon, deadline, claim, mechanism, next watch, settlement, or required visual beats.
- A visual-only reroll reuses the confirmed proposal. Any semantic or settlement change returns to the text decision and invalidates dependent pixels. The final “发布” authorizes the external write of the already confirmed and rendered Frame; it does not silently accept a changed rule.

## Content And Image Contract

- Title owns the memorable judgment. Body opens with the strongest tested observation, develops the creator's causal chain in concrete language, and closes on the horizon plus one confirming or weakening observation. Use three to five short paragraphs and normally 260–700 visible Chinese characters (roughly 120–300 English words); finish sooner when the idea is genuinely simple, but never compress a real mechanism into a slogan. Image contributes the relationship, time structure, creator interpretation, and next check. Never paste the body into the canvas or repeat the title as an image headline.
- Give the body enough room to answer three reader questions: what changed, why the creator thinks it matters, and what should become visible by the deadline. Distinguish observed facts from the creator's inference without turning the prose into a fact-check, risk form, or research memo. Keep supporting details that move the reasoning; remove generic context and repeated caveats.
- Make the first paragraph a complete Feed lead that can stand alone when the App truncates the rest. Put the deeper mechanism and future check in the following short paragraphs, so a longer body improves detail without increasing image density or weakening the fast-scroll hook.
- Choose idea topology before layout, and layout before surface. Use rich geometry only when it answers the argument: price/indexed curve, relative spread, drawdown/recovery, rolling correlation, event reaction, threshold, causal transmission, scenario branch, Lens anatomy, or long/short contribution.
- Show unresolved future time with a clock, checkpoint, event, confirmation, invalidation, or scenario branch. Never draw a fabricated future price path, projected candle, decorative outcome arrow, or uncalibrated probability fan.
- Render exactly one 2488 × 1056 publication PNG, authored against a 622 × 264 mobile display box and rasterized at 4x. It is the same image used in Feed and detail views. Use at most three reader-essential groups: judgment, evidence/mechanism, and future/settlement. Primary copy is at least 20 px and secondary essential labels at least 16 px at display size. Verify the finished bitmap directly from pixels. Do not create or present an HTML preview, and do not render, upload, bind, or present separate compact, web, thumbnail, or OG files.
- Preserve a three-layer information spine: **orientation** (asset, direction, horizon), **proof and logic** (one dominant geometry, one or two decision-useful numbers, and the creator's mechanism), and **future resolution** (one confirmation, invalidation, or settlement clock). A chart cannot be an unlabeled decorative curve. When price is material, show a frozen historical price anchor, dated official close, reference level, interval return, drawdown, or spread value. Never label it current price, entry price, or the server-captured publication baseline before that baseline exists.
- Use minimal provenance but enough data semantics to understand the geometry. Keep the source family, as-of date, transform, and any material historical reference level legible. Synthetic fixtures are visibly non-publishable and can never masquerade as market observations.
- Preserve Cuebook identity while varying reading direction, chart share, geometry, narrative placement, type system, material, density, and light/dark tone. Generate and present one image at a time. A later visual-only reroll must take a materially different truthful route—not merely a new color—while preserving the same confirmed proposal.
- Emotional value is precision: make the creator's non-obvious intuition feel seen and publication-ready. Do not add generic praise, hype, certainty, or engagement bait.
- Alt text must describe the selected candidate's actual geometry. Never reuse a price-curve description for a scenario, drawdown, or Lens image.

## Quality And Latency

The runner must verify creator ownership, numerical source support, text-image division, future-time integrity, stable bindings, accessible SVG, exact dimensions, decodable and materially painted PNGs, copy fit, and collision-free mobile rendering. Retry only the failed query, copy, or raster stage.

- Warm target: 30–60 seconds from a ready connector to one complete Frame; a cold connector or browser start may take up to 120 seconds. Treat these as an engineering budget, never a promise or a reason to narrate waiting.
- Use one asset-resolution step, one shared evidence plan, one batched Cuebook lane plus one bounded authoritative Web lane when material, one reconciliation pass, one natural text confirmation, and one runner invocation.
- After selection, publish through exactly three remote steps: reserve the frozen image upload, perform one signed PUT, then call the high-level completion Tool once. The preview runner already emitted the PNG hash and byte size; do not run another local command, image audit, manifest build, draft build, prepare call, status poll, or readback after the creator confirms publication. An uncertain mutation transport may be replayed once with the same key and identical payload; never retry a domain rejection or probe with alternate payloads.
- Do not reread the whole repository, inspect renderer source, rebuild valid stages, create a local OAuth client, or run release packaging before selection.
- When a valid title, body, and image exist, show the complete Frame and ask only for publication or a visual/copy change. A changed title, body, asset, direction, horizon, settlement meaning, or material premise invalidates the old confirmation and any dependent pixels.

After the Frame, use the one-sentence reveal described above. It should let the creator feel exactly what became clearer: the edge Cuebook preserved, the relationship or Cue it added, and the future observation now worth watching. Do not provide provider-by-provider coverage accounting or claim value that is not visible in the result.

## Controlled Variation

Default to one strongest preview. If the creator asks “再来一版” or “换个感觉,” reuse the confirmed proposal: title, body, claim, adopted interview signal, exact tested observation, evidence refs, observation window, horizon, direction, settlement, visual requirements, and fact typing. Do not call Cuebook or Web again for a layout-only reroll.

Change one truthful expressive route and avoid the last two design or attention fingerprints when an equally truthful route exists. Return exactly one new variant at a time, even when the creator wants to explore a range; never turn the response into a gallery. Say the new emphasis in one phrase and ask whether this is the one. Stop offering variants when the creator is satisfied. A changed idea, premise, horizon, direction, or settlement meaning requires a new text confirmation.

## After The Creator Chooses

After selection, freeze the exact title, body, image, creator meaning, evidence refs, and image bytes. Never silently rewrite them. An ordinary one-preview publication uses the three-step lane in [Frame Publish Workflow](references/frame-publish-workflow.md): reuse the validated `FramePreviewV1` candidate, its sole 2488 × 1056 PNG, and the hash and byte size the runner already emitted. Reserve the upload, PUT those bytes once, and let `complete_frame_publish` finish the server-owned work. Do not reconstruct a post, direction set, candidate set, workflow graph, release bundle, HTML page, raster audit, manifest, settlement contract, draft assembly, or prepare payload merely to publish an already selected preview.

Invoke `$orchestrate-cuebook-creator-workflow` only for a correction, reproducibility audit, or another internal advanced deliverable that genuinely consumes those contracts. It must not create a public multi-image gallery. In the ordinary lane, the selected PNG is already the sole finished publication master; HTML, font files, and release derivatives are neither required nor generated.

Read [Frame Publish Workflow](references/frame-publish-workflow.md) before upload or publication. Keep internal wire type names, hashes, mutation keys, and server states inside that workflow—not in the creator-facing Frame.

Ordinary initial publication uses `complete_frame_publish`. Correction follows its matching prepare → publish pair without separate action consent. Withdrawals alone retain first-party consent and consent-status polling.

### Standard Deadline Settlement

- For every eligible new single-asset `long` or `short` Frame, use one asset-neutral rule: freeze the exact creator-owned deadline, then compare the latest completed provider-official price observation at or before it with the Cuebook price snapshot frozen at publication. That starting snapshot is the same value Cuebook can already display—a fresh realtime observation when available, otherwise the latest completed close or sole stored observation—not a second market-hours eligibility test. `long` succeeds above the baseline; `short` succeeds below it; equality is flat. Encode every new horizon with `session_policy: "at_instant"` and freeze `threshold_bps: "0"` internally, regardless of whether the asset is crypto, equity, ETF, or index.
- This policy-derived standard requires no separate settlement interview. Its one-line human rule is woven into the combined pre-render proposal with the exact copy and visual intent.
- Do not ask whether the asset is continuous, exchange-traded, in regular hours, after hours, on a market day, or at the next eligible close. Those are internal observation-source concerns. Never offer `next_eligible_close` as a creator choice for a new Frame.
- Confirm this standard rule once inside the pre-render proposal. After the complete rendered Frame is shown, the creator's explicit “publish this” authorizes only the write of that unchanged proposal. Do not ask a second settlement question or restate a backend form.
- Ask another question only for a missing asset, direction, or horizon, or when the creator explicitly requests a target-price or pair-settlement override. If the deployed backend does not yet advertise the standard deadline policy for that asset, stop before publication rather than silently reverting to a trading-session rule.
- Keep the server-selected observation source, baseline capture, grace period, sealing, adjustments, and audit metadata backstage. The Skill never weakens OAuth, scope, prepared-hash, publish-token, idempotency, or transaction checks to save time.

## Non-Negotiable Boundaries

- Never place a trade, silently publish, or create social-platform variants. This Skill creates Frame only.
- Never print mutable current or entry price in a pre-publish image without a backend quote or entry lock. Prefer `BTC · 30D LONG`; historical axes and explicitly accepted settlement levels may remain when bound.
- A comparison chart is not a pair settlement. Mixed session families such as equal-notional BTC/QQQ currently degrade to single-asset settlement or block explicitly.
- A creator-defined basket is a Creator Lens, never an official index. Show components, weights, origin, formula, and limitations in the expanded view; disclose retrospective selection bias when the basket was assembled after the observation window began.
- The public artifact is [Frame](references/frame.schema.json). Internal preview and release contracts remain available for lineage and backend compatibility but are never the product surface.
