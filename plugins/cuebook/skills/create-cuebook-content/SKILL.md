---
name: create-cuebook-content
description: "Turn a user's market idea or selected Cuebook material into one creator-owned Frame: a sharp title, reasoned body, and one mobile-first editorial image. Use for drafting, redesigning, or publishing a viewpoint. Once the asset is known, use relevant aligned or contrasting Cuebook Cues as optional thinking anchors, help the creator complete rather than defend their inference, reconcile factual claims with bounded evidence, and lock the exact idea, copy, settlement, and visual intent before rendering. Never fabricate a future path, fake an official index, trade, or publish before confirmation."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses the connected Cuebook MCP server plus one bounded authorized Web lane for material current claims. Node.js 18+ and local Chromium/Chrome are required for deterministic rendering.
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

- Default to **Meaning Lock → Visual Preview**. Do not render pixels or build release contracts before the creator confirms the exact idea, copy, and settlement summary.
- Enter **Meaning Lock** after research and before rendering. Enter **Selection Freeze** only after the creator sees and chooses the rendered Frame.
- Enter **Publish** only after explicit publication intent. Read [Frame Publish Workflow](references/frame-publish-workflow.md) at that point, not during preview.
- If an upstream system provides a frozen commitment, evidence refs, mechanism path, and render-safe projection, consume them as truth. Improve expression and design without re-deciding the asset, direction, horizon, or facts. A layout reroll never reopens the thesis.

## Fast Preview

1. Extract the subject, direction, observation window, future horizon, claim, proposed mechanism, and next observable. Keep the observation window (“what behavior was noticed?”) separate from the horizon (“when should the view be revisited?”). Treat the creator's view as material to strengthen, not a claim to debunk before helping.
2. Resolve each named asset once through the connected Cuebook MCP server. If the asset is missing or ambiguous, ask only the minimum rigid question needed to resolve it; do not begin an open-ended interview first.
3. Once the asset is known, start one shared read plan. Include `list_asset_cues`, and use `get_cues` only for at most two selected details in the single allowed dependency follow-up. Start the smallest market-state, candle, news, event, filing, or positioning reads needed by the creator's actual premise in the same phase. When material current public facts are involved, start one bounded authoritative Web batch without waiting for either lane to fail first. Execute independent reads concurrently when the host permits. Use at most three Web searches and three primary or authoritative sources; never loop between lanes.
4. Run the Cue-assisted interview below from that read set. If the creator skips it, continue immediately and do not reduce the result. A relevant Cue may deepen the creator's mechanism, reveal a contrasting world, suggest a comparator or next footprint, or introduce a new index/Lens idea; it never chooses the creator's asset, direction, horizon, or conviction.
5. For price, trend, relative strength, or dated horizons, retrieve candles and current market state together. Label any assistant-chosen comparator explicitly. For a custom basket or long/short expression, resolve 3–8 transparent components and retrieve their smallest compatible candle window in parallel. Do not request a public basket, DAG, or metric Tool; local deterministic code calculates the Creator Lens. `get_reasoning_graph` is not a default creator read.
6. Keep source routing backstage. Never narrate a failed search, retry, provider coverage gap, “Cuebook did not have this,” “Web had to supplement it,” or which lane found a fact. Present the reconciled logic and supported result. If a material factual sentence remains unresolved across all authorized evidence, say only that reliable support is not yet sufficient and ask whether to omit it or restate it as the creator's inference. Preserve missing capability classes internally for later data-source coverage work.
7. Type meaning honestly without forcing every useful thought through a proof gate. A price path or measured relationship is observed or derived; a reported event is reported; another creator's Cue is a published viewpoint; the current creator's causal bridge, analogy, scenario, intuition, or expectation may remain a creator-owned hypothesis; future conditions remain conditional. Evidence is required for a factual sentence, not for the creator to own a clearly framed inference. An executable observation test must support the exact factual sentence in the body and bind to the exact visible geometry. A source ref or popular Cue is not proof. If objective evidence materially contradicts a factual premise, show the conflict and let the creator choose; do not turn an unproven mechanism into a correction lesson or silently rewrite the idea.
8. Run the optional Idea Completion Check below, then draft the exact title, body, asset, direction, deadline, standard success rule, and one-sentence visual intent. Present this compact **Meaning Lock** without an image. For a standard single-asset view, show only the human rule—such as “COIN · short · 30D · below the publication baseline at the deadline succeeds”—not sessions, provider selection, grace periods, schemas, or auth. Ask “按这版出图吗？” The creator may edit any field. Do not render, rasterize, upload, or register media until the creator confirms this exact package.
9. After confirmation, read [Frame Expression System](references/frame-expression-system.md), [Frame Art Direction](references/frame-art-direction.md), and [Frame Feed Attention](references/frame-feed-attention.md). Build a [market preview job](references/frame-market-preview-job.schema.json) for curves, relative paths, drawdown/recovery, correlation, event windows, thresholds, scenarios, causal paths, or evidence tension. Build a [Lens preview job](references/frame-lens-preview-job.schema.json) only for a transparent Creator Lens or long/short Lens. The job must carry the confirmed meaning lock; pass frozen raw data into the runner and never ask the model to calculate or sketch market curves.
10. Run one stable command. It rejects an absent, unconfirmed, or mismatched meaning lock before it calculates, composes, rasterizes one publication image, and writes the public Frame:

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

Do not add a public `state`, version, candidate id, evidence bundle, hash, score, source count, scope, upload status, receipt, consent field, backend enum, or canonical web link. During preview, explain any blocker in ordinary language rather than leaking internal status. After a valid publication receipt, stop the publication network flow: do not call `get_frame`, open or curl a web page, inspect page HTML or metadata, or present `canonical_url`. Give the creator a warm handoff instead:

- Start with a natural success line such as “已经替你发布好了，去 Cuebook App 看看吧。” Do not expose receipt language. Then add one short, creator-specific sentence naming the non-obvious kernel, mechanism, or why-now preserved from the confirmed Meaning Lock. Make the recognition concrete; never use generic praise, hype, certainty, or engagement bait.
- End with at most one optional question. Prefer inviting the creator to share the finished idea from the Cuebook App with another AI for a fresh judgment. Depending on context, the single invitation may instead ask for another signal or intuition, or—only for an eligible directional single-asset idea when the Paper tools are available—offer to record the idea as a **simulated Paper Trade** for later review. Omit the Paper option for non-directional or non-settleable content.
- The App owns the share action and share entry; ordinary publication never does. When the creator chooses the App share UI, use this one-sentence copy: “这是 Cuebook Agent 帮我完善并记录的交易想法，想听听你怎么判断；请用 Cuebook 打开，尚未连接时按提示安装并连接：<Cuebook 分享入口>” Generate the entry from the exact versioned Frame ref in the validated publication receipt, binding both `frame_id` and `release_id` (or one opaque token that resolves to that exact pair), never `frame_id` alone or a later-current release. Do not expose raw identifiers, fabricate an entry, or repurpose `canonical_url`; if the App share UI is unavailable, omit the share invitation.
- The offer is not authorization. Do not call `preview_paper_order` or `place_paper_order`, infer size, price, or order type, or create a simulated position until the creator explicitly opts in. After opt-in, gather any required order terms, show the Paper order preview, and obtain explicit placement intent before `place_paper_order`.

Keep the handoff to two or three short sentences. For example: “已经替你发布好了，去 Cuebook App 看看吧。你这条观点最有辨识度的是「___」，这条判断已经完整保留下来了。要不要在 App 里把它分享给另一个 AI，听听一个不同判断？” After a withdrawal say “已撤回.” Audit details remain internal unless the creator asks.

## Cue-Assisted One-Round Interview

- Reflect the distinctive kernel tentatively: 「我听到的不是单纯的 ___，而是 ___。」 Keep it specific, supportive, and easy to correct.
- From the asset's relevant, time-legible Cue set, select at most two non-duplicative thought anchors: normally one `aligned` Cue that deepens mechanism or why-now and one `contrasting` or `adjacent` Cue that exposes another regime, actor, comparator, or next footprint. Use fewer when relevance is weak. An older Cue may serve as a dated analogy or prior, never as current state. Never use Cue popularity, count, rank, or agreement as proof or social pressure.
- Briefly paraphrase the selected Cues as other published viewpoints, with their source refs retained internally. Do not quote signature language, imitate another creator, or present a Cue as fact or consensus. Ask one high-leverage question about the thinnest link: `anomaly`, `causal_bridge`, `why_now`, `next_footprint`, `blind_spot`, or `voice_lock`.
- Let Cues serve as footholds, not answers: 「一条同向 Cue 把重点放在 A，另一条相反 Cue 担心 B。你更想沿哪条线继续推，还是都不是？」 One optional concrete-memory deepener may sit in the same turn. Never attribute a suggested explanation to the creator unless they adopt it.
- Do not dump categories such as news, signals, intuition, proof, invalidation, and price. The question should feel like an interview that helps the idea become more itself, not an examination.
- Record Cue-derived additions as `evidence`, `connection`, `countercase`, or `rule` with acceptance or rejection. Only adopted additions enter the Meaning Lock. Unadopted Cues remain external context and never become the creator's first-person view.
- `直接做`, `就按这个做`, `就这些`, `没有更多`, an equivalent refusal, or an initial request not to ask closes Cue interviewing immediately. Do not mention missing context, lower quality, or delay creation.
- This interview always precedes any price-target question. A visual preview needs no target price. For an eligible single-asset `long` or `short` Frame, derive the standard deadline rule below and include its one-line human summary in the pre-render Meaning Lock. Ask for a price only when the creator explicitly requests a price-target override.

For the BTC example, a useful prompt is: 「你抓到的可能不只是 BTC 看涨，而是美股泄压时，BTC 的不跌本身正在变成资金选择。Cuebook 里一条同向 Cue 把它理解成持续买盘吸收抛压，另一条相反 Cue 认为只要风险资产再度同步去杠杆，这种抗跌就可能消失。你更想沿‘资金提前换仓’还是‘承接尚未松动’继续推？都不是也可以，就按你原来的判断做。」

## Optional Idea Completion Check

- After the creator's provisional view is clear and before drafting the Meaning Lock, inspect only the already retrieved Cues for one or two **non-overlapping points the creator has not considered**. Useful additions are a missing actor, causal bridge, comparator, next footprint, regime condition, or honest countercase—not generic risk warnings.
- Surface them once as optional inference: 「这条推演还可以补两个角度：A；B。要加哪一个？都不加就按你现在这版。」 They do not need to be facts when clearly framed as hypotheses. Any factual premise inside them still needs its own support.
- Omit this check when no Cue adds material value, the creator's view is already complete, the creator skipped interviewing, or the creator asked to proceed directly. Never repeat it, never make adoption a quality gate, and never reopen it after Meaning Lock confirmation.

## Meaning Lock Before Render

Present one compact text-only decision before spending time on pixels:

```text
标题：...
正文：...
交易定义：SPCX · 做多 · 180 天
到期判定：到期前最新官方完成价高于发布基准价即命中
图片任务：用“破发价格锚点 + 四层基础设施能力 + 180D 检查”表达，不画未来价格路径

按这版出图吗？
```

- This is one combined confirmation of creator meaning, public copy, deadline settlement, and visual job—not a risk questionnaire or backend form.
- `直接做` skips the optional interview, not this lock. The creator must see the exact copy and human settlement rule before the first render.
- Build the standard settlement intent and validate its asset, direction, exact deadline, `at_instant` policy, and zero-bps rule internally before presenting the lock. Do not wait until upload or draft creation to discover a missing or unsupported settlement.
- After confirmation, give the lock a stable internal ref and pass it unchanged to the preview runner. The renderer must reject missing confirmation or any mismatch in title, body, subject, direction, horizon, deadline, claim, mechanism, next watch, settlement, or required visual beats.
- A visual-only reroll reuses the lock. Any semantic or settlement change returns to this text decision and invalidates dependent pixels. The final “发布” authorizes the external write of the already confirmed and rendered Frame; it does not silently accept a changed rule.

## Content And Image Contract

- Title owns the memorable judgment. Body opens with the strongest tested observation, develops the creator's causal chain in concrete language, and closes on the horizon plus one confirming or weakening observation. Use three to five short paragraphs and normally 260–700 visible Chinese characters (roughly 120–300 English words); finish sooner when the idea is genuinely simple, but never compress a real mechanism into a slogan. Image contributes the relationship, time structure, creator interpretation, and next check. Never paste the body into the canvas or repeat the title as an image headline.
- Give the body enough room to answer three reader questions: what changed, why the creator thinks it matters, and what should become visible by the deadline. Distinguish observed facts from the creator's inference without turning the prose into a fact-check, risk form, or research memo. Keep supporting details that move the reasoning; remove generic context and repeated caveats.
- Make the first paragraph a complete Feed lead that can stand alone when the App truncates the rest. Put the deeper mechanism and future check in the following short paragraphs, so a longer body improves detail without increasing image density or weakening the fast-scroll hook.
- Choose idea topology before layout, and layout before surface. Use rich geometry only when it answers the argument: price/indexed curve, relative spread, drawdown/recovery, rolling correlation, event reaction, threshold, causal transmission, scenario branch, Lens anatomy, or long/short contribution.
- Show unresolved future time with a clock, checkpoint, event, confirmation, invalidation, or scenario branch. Never draw a fabricated future price path, projected candle, decorative outcome arrow, or uncalibrated probability fan.
- Render exactly one 2488 × 1056 publication PNG, authored against a 622 × 264 mobile display box and rasterized at 4x. It is the same image used in Feed and detail views. Use at most three reader-essential groups: judgment, evidence/mechanism, and future/settlement. Primary copy is at least 20 px and secondary essential labels at least 16 px at display size. Verify the finished bitmap directly from pixels. Do not create or present an HTML preview, and do not render, upload, bind, or present separate compact, web, thumbnail, or OG files.
- Preserve a three-layer information spine: **orientation** (asset, direction, horizon), **proof and logic** (one dominant geometry, one or two decision-useful numbers, and the creator's mechanism), and **future resolution** (one confirmation, invalidation, or settlement clock). A chart cannot be an unlabeled decorative curve. When price is material, show a frozen historical price anchor, dated official close, reference level, interval return, drawdown, or spread value. Never label it current price, entry price, or the server-captured publication baseline before that baseline exists.
- Use minimal provenance but enough data semantics to understand the geometry. Keep the source family, as-of date, transform, and any material historical reference level legible. Synthetic fixtures are visibly non-publishable and can never masquerade as market observations.
- Preserve Cuebook identity while varying reading direction, chart share, geometry, narrative placement, type system, material, density, and light/dark tone. Generate and present one image at a time. A later visual-only reroll must take a materially different truthful route—not merely a new color—while preserving the same Meaning Lock.
- Emotional value is precision: make the creator's non-obvious intuition feel seen and publication-ready. Do not add generic praise, hype, certainty, or engagement bait.
- Alt text must describe the selected candidate's actual geometry. Never reuse a price-curve description for a scenario, drawdown, or Lens image.

## Quality And Latency

The runner must verify creator ownership, numerical source support, text-image division, future-time integrity, stable bindings, accessible SVG, exact dimensions, decodable and materially painted PNGs, copy fit, and collision-free mobile rendering. Retry only the failed query, copy, or raster stage.

- Warm target: 30–60 seconds for one complete Frame. A cold connector or browser start may take up to 120 seconds.
- Use one asset-resolution step, one shared evidence plan, one batched Cuebook lane plus one bounded authoritative Web lane when material, one reconciliation pass, one Meaning Lock confirmation, and one runner invocation.
- After selection, use the direct Fast Publish lane: one call per required mutation, one signed PUT, and only the declared media-status polling. An uncertain mutation transport may be replayed once with the same key and identical payload; never retry a domain rejection or probe with alternate payloads.
- Do not reread the whole repository, inspect renderer source, rebuild valid stages, create a local OAuth client, or run release packaging before selection.
- When a valid title, body, and image exist, show the complete Frame and ask only for publication or a visual/copy change. A changed title, body, asset, direction, horizon, settlement meaning, or material premise invalidates the old Meaning Lock and any dependent pixels.

After the Frame, add one short handoff outside the creative: name a specific strength in the creator's idea, say how Cuebook combined market data, disclosures, and public evidence into a clearer structure, and suggest one useful next observation. Do not provide provider-by-provider coverage accounting. Keep it specific, not promotional.

## Controlled Variation

Default to one strongest preview. If the creator asks “再来一版” or “换个感觉,” reuse the confirmed Meaning Lock: title, body, claim, adopted interview signal, exact tested observation, evidence refs, observation window, horizon, direction, settlement, visual requirements, and fact typing. Do not call Cuebook or Web again for a layout-only reroll.

Change one truthful expressive route and avoid the last two design or attention fingerprints when an equally truthful route exists. Return exactly one new variant at a time, even when the creator wants to explore a range; never turn the response into a gallery. Say the new emphasis in one phrase and offer “锁定这版.” Stop offering variants when the creator is satisfied. A changed idea, premise, horizon, direction, or settlement meaning creates a new meaning lock.

## Selection Freeze

After selection, freeze the exact title, body, image, creator meaning, evidence refs, and image bytes. Never silently rewrite them. An ordinary one-preview publication uses the direct Fast Publish lane in [Frame Publish Workflow](references/frame-publish-workflow.md): reuse the validated `FramePreviewV1` candidate and its frozen 2488 × 1056 PNG, then create only the raster audit, hashes, visual manifest, settlement intent, assembly, and binding required by Frame. Do not reconstruct `PostV1`, `VisualDirectionSetV1`, `PublishCandidateSetV1`, a workflow DAG, a release bundle, or an HTML page merely to publish an already selected preview.

Invoke `$orchestrate-cuebook-creator-workflow` only for a correction, reproducibility audit, or another internal advanced deliverable that genuinely consumes those contracts. It must not create a public multi-image gallery. In the ordinary lane, treat the selected PNG as `finished_bitmap`; HTML and font files are unnecessary and must not become a publication dependency. Reuse the frozen PNG as the sole publication master and do not produce release derivatives.

Read [Frame Publish Workflow](references/frame-publish-workflow.md) before upload or publication. Keep internal wire type names, hashes, mutation keys, and server states inside that workflow—not in the creator-facing Frame.

Ordinary publication uses `prepare_frame_publish` → `publish_frame`; correction follows its matching prepare → publish pair without separate action consent. Withdrawals alone retain first-party consent and consent-status polling.

### Standard Deadline Settlement

- For every eligible new single-asset `long` or `short` Frame, use one asset-neutral rule: freeze the exact creator-owned deadline, then compare the latest completed provider-official price observation at or before it with the server-captured publication baseline. `long` succeeds above the baseline; `short` succeeds below it; equality is flat. Encode every new horizon with `session_policy: "at_instant"` and freeze `threshold_bps: "0"` internally, regardless of whether the asset is crypto, equity, ETF, or index.
- This policy-derived standard requires no separate settlement interview. Its one-line human rule is part of the combined pre-render Meaning Lock with the exact copy and visual intent.
- Do not ask whether the asset is continuous, exchange-traded, in regular hours, after hours, on a market day, or at the next eligible close. Those are internal observation-source concerns. Never offer `next_eligible_close` as a creator choice for a new Frame.
- Confirm this standard rule once inside the pre-render Meaning Lock. After the complete rendered Frame is shown, the creator's explicit “publish this” authorizes only the write of that unchanged lock. Do not ask a second settlement question or restate a backend form.
- Ask another question only for a missing asset, direction, or horizon, or when the creator explicitly requests a target-price or pair-settlement override. If the deployed backend does not yet advertise the standard deadline policy for that asset, stop before publication rather than silently reverting to a trading-session rule.
- Keep the server-selected observation source, baseline capture, grace period, sealing, adjustments, and audit metadata backstage. The Skill never weakens OAuth, scope, prepared-hash, publish-token, idempotency, or transaction checks to save time.

## Non-Negotiable Boundaries

- Never place a trade, silently publish, or create social-platform variants. This Skill creates Frame only.
- Never print mutable current or entry price in a pre-publish image without a backend quote or entry lock. Prefer `BTC · 30D LONG`; historical axes and explicitly accepted settlement levels may remain when bound.
- A comparison chart is not a pair settlement. Mixed session families such as equal-notional BTC/QQQ currently degrade to single-asset settlement or block explicitly.
- A creator-defined basket is a Creator Lens, never an official index. Show components, weights, origin, formula, and limitations in the expanded view; disclose retrospective selection bias when the basket was assembled after the observation window began.
- The public artifact is [Frame](references/frame.schema.json). Internal preview and release contracts remain available for lineage and backend compatibility but are never the product surface.
