---
name: create-cuebook-content
description: "Turn a market idea or selected Cuebook material into one creator-owned Frame with a sharp title, reasoned body, and mobile-first image. Use for directional, range, relative-performance, two-condition, or explicitly requested rights-cleared TradingView-snapshot viewpoints. Also use to place a selected idea, level, zone, checkpoint, or note on a separately connected TradingView chart. Frame and canvas transfer are separate confirmed outputs. Never fabricate a future path, silently choose a proxy, trade, or publish before confirmation."
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Uses the connected Cuebook MCP server plus one bounded authorized Web lane. Optional, separately installed tradingview_desktop and tradingview_research connectors add local research and confirmed canvas transfer. Node.js 18+ and local Chromium/Chrome are required for deterministic Frame rendering.
---

# Create Cuebook Content

Cuebook Agent turns a raw market intuition into a thought the creator can see, share, and revisit without taking authorship away. A visible Frame is always one title, one body, and one paired image. Evidence lineage, hashes, scopes, upload progress, receipts, consent, and workflow state stay backstage.

## Cuebook Context

Stay in Cuebook unless the creator explicitly asks for another Skill. Keep routing backstage.

For explicit TradingView use, inspection reads `$query-cuebook/references/tradingview-workbench.md`; a requested chart image also reads `$query-cuebook/references/tradingview-focused-capture.md`; chart writing reads `references/tradingview-canvas-transfer.md`. Never install or configure either connector here.

## Creator Experience

Behave like an attentive editor with excellent market memory, not a workflow engine. The creator should feel one continuous lift from a rough intuition to a thought they are proud to revisit.

- Begin with the non-obvious kernel of what the creator noticed. Reflect it tentatively and specifically, so correction feels easy.
- When a material foothold exists, normally offer one compact thought-anchor exchange even for a publishable idea. Ask one useful question and, only if its answer exposes a consequential thin link, one short follow-up. Never use a checklist; skip on request or when no anchor helps. A settleable idea still needs a creator-stated or creator-accepted horizon.
- Weave in the smallest useful Cuebook memory—a dated relationship, relevant Cue, comparator, missing actor, mechanism, or next footprint—as a thinking foothold rather than a lesson or test.
- Once the thought is ready, show the exact title and body, then fold its direction, deadline rule, and visual idea into a short natural recap. Ask whether that expression feels right and offer to draw it. Do not present a form.
- Make one relationship visible that prose alone would hide. The image is the payoff, not a decorated summary.
- After publication, recognize what became clearer and return the creator warmly to Cuebook App, where the idea can be shared or revisited.

Never announce a gate, stage, lock, workflow, preflight, evidence lane, provider, retry, schema, tool name, capability list, hash, or receipt. Do not expose internal capitalized process labels. The satisfying moment is specific recognition plus a useful connection the creator did not have to assemble alone.

## Quiet Readiness Check

Before a Frame conversation begins, silently call `get_frame_capabilities` once through the host-installed `cuebook` MCP connector. A normal MCP result is the only runtime readiness proof. Cache it for this task and reuse it at publication; do not make a routine second call. Canvas-only work uses Query identity and its own readiness instead.

- Only an explicit host authentication signal—`not_logged_in`, `AuthorizationRequired`, an expired or revoked credential, or a scope step-up—justifies asking for sign-in. Say it naturally in the user's language and keep it to at most two short sentences.
- If the connector or entrypoint is absent, do not infer an account problem. If a call fails with an HTTP request, transport-send, DNS, TLS, proxy, socket, or timeout error, do not infer authentication. Preserve the request and say Cuebook is temporarily unreachable; make clear that reinstalling or logging in again is unnecessary. Any normal Cuebook result already returned in the task is decisive evidence that the connector loaded.
- Never mention the README, missing actions, Tool names, MCP internals, resources, fabrication, or process labels. Do not run a CLI login from this Skill, implement OAuth/DCR, exchange tokens, create a custom client, store credentials, open another task, or retry automatically.
- A successful readiness result permits local preview. Refresh only for a missing required write, a long-lived task, or an explicit capability change.

## Internal Orchestration

- Consume Query's validated `CuebookIntentV1`; execute its ordered, explicitly gated Create steps.
- Route TradingView reads to Query, native Frames to Fast Preview, a rights-cleared official snapshot to Attributed Snapshot, and only explicit chart writes to the canvas-transfer reference. For Frame plus canvas, select the Frame before separately confirming its drawing plan.
- Resolve only rigid gaps, research once, then recap copy, deadline meaning, and visual intent. Time, any terminal ± band, and every two-asset leg are creator-owned; never preset them.
- After the creator sees the rendered Frame, preserve the chosen copy, meaning, evidence, settlement, and image bytes unchanged.
- Publish only after explicit publication intent. Read [Frame Publish Workflow](references/frame-publish-workflow.md) at that point, not during preview.
- If an upstream system provides a frozen commitment, evidence refs, mechanism path, and render-safe projection, consume them as truth. Improve expression and design without re-deciding the asset, direction, horizon, or facts. A layout reroll never reopens the thesis.

## Attributed TradingView Snapshot

Read [Attributed TradingView Snapshot](references/tradingview-attributed-snapshot.md) only after the creator selects snapshot pixels. It is the sole TradingView-pixel route; every failed condition falls back to native rerender.

## Fast Preview

This is the native Frame path. A creator may adopt a TradingView foothold, but every visible curve or number is rebuilt from eligible Cuebook results—never TradingView pixels, data, or Pine.

1. Extract subject, asset conditions, observation window, horizon, claim, mechanism, and next observable. Creator time is authoritative. “Flat” may be `range`; “A beats B” is relative performance; “A rises while B stays quiet” is compound. Clarify whether ambiguous “better” means return by the deadline.
2. Resolve every named subject with Query's exact-identity rule. Never replace it with a proxy or fuzzy candidate; a proxy is a different idea the creator must choose. Only settlement legs require `frameSettlement: true`; `paperTrade: false` is irrelevant. An unavailable leg stops before pixels or publication. Relative and compound views require two distinct same-session-family assets.
3. Resolve horizon ownership before the shared read. If supplied, keep it. If missing, ask: “How long should this view be tested—or would you like Cuebook to suggest a horizon from the relevant Cues and catalysts?” If the idea may be `range`, also resolve one ambiguity naturally: “By ‘not moving much,’ do you mean it finishes within a range at the deadline, or never leaves that range along the way?” Frame can settle only the first. Never silently substitute an endpoint test for a whole-window barrier.
4. Share one `list_asset_cues` plus selected details and the smallest market/evidence read; add one bounded authoritative Web batch when needed. Offer at most two timing or range proposals only when requested. The creator accepts the exact horizon and any `±X%` before copy, pixels, settlement, or publication.
5. Surface the strongest anchor and ask one choose/reject/reshape question. One follow-up is allowed only for a consequential link that changes copy or image. Never exceed two interview questions or reread unless the asset or factual premise changes. Continue when no anchor helps or the creator opts out. A Cue may inform requested timing help; it never finalizes a creator choice.
6. Retrieve candles and market state together. Any two-asset view uses synchronized baseline-relative geometry; a custom 3–8 component basket remains a transparent Creator Lens. Never request a public basket, DAG, or reasoning graph.
7. Keep routing backstage. Present reconciled logic, never provider gaps. If a material fact remains unsupported, ask whether to omit it or frame it as creator inference.
8. Type meaning honestly: relationships are observed/derived, events reported, Cues other creators' views, future conditions conditional, and the creator's causal bridge may remain a creator-owned hypothesis. A source ref or popular Cue is not proof. Evidence supports facts and visible geometry; it does not gate a clearly framed opinion.
9. Draft exact copy, assets, conditions, deadline, success rule, and visual intent. Relative compares returns. Compound states both rules with an explicit AND and says both must hold; directional equality is flat. End with “Does this capture your idea? If so, I will make the image.” Render only after confirmation.
10. After confirmation, read [Frame Expression System](references/frame-expression-system.md), [Frame Art Direction](references/frame-art-direction.md), and [Frame Feed Attention](references/frame-feed-attention.md). Use a [market preview job](references/frame-market-preview-job.schema.json) for market geometry or a [Lens preview job](references/frame-lens-preview-job.schema.json) only for a transparent Creator/long-short Lens. Carry the confirmed draft in `meaning_lock`, pass frozen raw data, and never ask the model to calculate curves.
11. Run one stable command. It rejects an absent, unconfirmed, or mismatched internal confirmation before it calculates, composes, rasterizes one publication image, and writes the public Frame:

```bash
node scripts/run_fast_preview.mjs frame-preview-job.json ./preview-output
```

12. Present `frame.json` immediately when it passes. Its public contract is exactly:

```json
{
  "title": "...",
  "body": "...",
  "image_ref": "...",
  "alt_text": "..."
}
```

Do not add public workflow, version, ids, evidence bundles, hashes, scores, scopes, receipts, consent, backend enums, or web links. Explain blockers plainly. Add one short reveal sentence naming the creator's edge and the connection Cuebook made visible; never use generic praise or promotion.

After `complete_frame_publish` returns success, follow the **Public Surface** section in [Frame Publish Workflow](references/frame-publish-workflow.md). Stop immediately: no receipt parsing, reconciliation, `get_frame`, web-page readback, `canonical_url`, or extra verification.

## Conversation Heuristics

- Reflect the distinctive kernel tentatively: “What I hear is not simply ___; it is ___.” Keep it specific, supportive, and easy to correct.
- The default interview budget is one thought-anchor question. A second and final question is allowed only when the first answer exposes a thin link that changes reasoning or the visual. Never exceed two interview questions. Both use the shared read; the follow-up does not start another Cuebook or Web read, so never turn the follow-up into another research round.
- Use `list_asset_cues` to select at most two non-duplicative thought anchors: normally one `aligned` Cue for mechanism/why-now and one `contrasting` or `adjacent` Cue for another regime, actor, comparator, or footprint. Do not dump categories. Older Cues are dated analogies, never current state; popularity, count, rank, or agreement is never proof.
- Paraphrase them as other published viewpoints and retain refs. Never quote signature language, imitate a creator, or present a Cue as fact or consensus. Ask about the thinnest link: `anomaly`, `causal_bridge`, `why_now`, `next_footprint`, `blind_spot`, or `voice_lock`.
- Let Cues be footholds, not answers. One concrete-memory deepener may share the turn; never attribute an explanation until adopted.
- When timing help is explicit, offer at most two mechanism- or catalyst-linked horizons. Selection requires acceptance, and a stated horizon stays closed unless the creator reopens it.
- Record Cue-derived additions as `evidence`, `connection`, `countercase`, or `rule` with acceptance or rejection. Only adopted additions enter the confirmed draft. Unadopted Cues remain external context and never become the creator's first-person view.
- `go ahead`, `use my original idea`, `that is all`, `nothing more`, equivalent refusal, or an initial no-questions request closes Cue interviewing immediately. Do not follow up, imply lower quality, or delay.
- Never ask merely because an interview section exists. Derive zero-bps long/short and relative rules; range needs an accepted band. Ask for a price only for an explicit price-target override, or a relative margin only when the creator requests one.

## Optional New Angle

Offer at most one unrequested angle when it makes the creator's own mechanism, countercase, timing, or visual materially clearer. Omit the addition when no Cue adds material value. Keep it tentative; only adopted additions enter the confirmed draft.

## Creator Voice Polish

Before showing title and body, silently polish them in the same drafting pass. Return only polished copy; never expose an audit or start another Tool, research, or model round.

- Preserve asset, direction, horizon, numbers, fact typing, adopted Cues, settlement, and clear phrasing. For creator-owned views, default the body to first person with one or two natural ownership markers (“I think,” “my read,” “I am watching”); avoid repetitive “I,” and honor an explicit third-person preference. First person owns judgment, mechanism, and next watch—it never invents a position, trade, expertise, access, lived experience, slang, humor, uncertainty, or conviction.
- Return the public title, body, and alt text as clean plain text. During this same polish, remove Markdown wrappers such as `**...**`; carry emphasis through phrasing and paragraph rhythm instead.
- Rewrite clusters of AI tells, not isolated words or punctuation: inflated significance, promotional hype, vague authority, signposting, filler, generic conclusions, forced triads, repeated `not A but B`, slogan-like aphorisms, stacked punchlines, and uniform cadence.
- Prefer concrete actors, verbs, numbers, and dates. Weave sourced facts into the creator's argument. Never expose bracketed evidence labels, report scaffolding such as “observation,” “media report,” or “author judgment,” “author inference,” “this view selects long,” or observation/verification/invalidation checklists. Fold useful facts, attribution, judgment, and the next watch into the natural argument instead. Keep sourced fact, creator inference, and another creator's Cue distinct through attribution, not visible taxonomy. If polish changes meaning or attribution, restore the confirmed meaning.
- Treat uncertainty as changing confidence, not confessing error. Ban public “invalidation,” “falsification,” “I was wrong,” “prove me wrong,” and locale equivalents. If material, say “I will look again if…,” “this loses support if…,” or “what matters by then is…”; omit it when the horizon, rule, or image already holds that tension.
- Let the idea choose its shape: two uneven paragraphs may carry one mechanism, while a layered view may need four to seven. Vary openings, paragraph weight, sentence rhythm, and endings; never impose one observation → mechanism → risk → deadline cadence.

## Confirm The Expression Before Rendering

Before spending time on pixels, present the proposed Frame as editorial copy followed by one natural recap—not a process card or trading form:

```text
Title: ...

Body: ...

I will record this SPCX long through January 17, the date you chose; it counts as a hit if SPCX is above the publication baseline then. The image will emphasize the issue-price anchor, four infrastructure layers, and that checkpoint without drawing a falsely certain future path.

Does this capture your idea? If so, I will make the image.
```

For range, the recap is equally plain: “I will record BTC through August 14; it counts as a hit if it finishes within the ±X% range you confirmed. Moves outside that band before then do not decide the result.” Replace X with the accepted value.

For relative: “I will record NVDA against TSLA through August 14; it counts as a hit if NVDA's return from publication is higher, even if both fall.” This is a viewpoint contract, not two orders.

For compound: “I will record TSLA rising and NVDA finishing within ±5% through August 14. Both conditions must hold; if TSLA is unchanged and NVDA stays in range, the result is flat.” Preserve the creator's actual assets and conditions.

- This one confirmation covers copy, meaning, creator-owned horizon, human settlement rule, and visual intent. `go ahead` may skip the optional interview, never this preview decision.
- Validate exact assets, deadline, directions/spread, compound legs, and bands before proposing. Freeze the confirmed package; the runner rejects any semantic mismatch. A visual-only reroll reuses it, while a semantic change invalidates its pixels.
- A later “publish” authorizes only the external write of that confirmed, rendered Frame; it cannot accept a changed rule.

## Content And Image Contract

- Title owns the judgment. Body starts with a complete Feed lead and uses only what the reasoning needs—usually two to seven paragraphs and roughly 160–1,100 visible Chinese characters (70–450 English words), as limits rather than targets. Never imitate the previous Frame's length. Image adds relationship, time, interpretation, and next check; it does not paste the body or repeat the title.
- Say what changed and why it matters. Use a deadline or next observable only when useful. End on an implication, tension, catalyst, quiet watch, or chosen horizon—not a mandatory risk disclosure. Distinguish fact from inference without sounding like a fact-check, confession, form, or memo.
- Make the first paragraph useful when truncated. Vary later paragraph count and weight; mix short and developed blocks instead of equal ones.
- Choose topology before layout: price/indexed curve, relative spread, drawdown, correlation, event, threshold, causal path, scenario, or Lens.
- Show unresolved time with a clock, checkpoint, event, watch, or branch. Internal invalidation may stay structured; public labels remain neutral reasons to reassess, never demands to admit error. Never fabricate a future path, candle, outcome arrow, or probability fan.
- Render exactly one 2488 × 1056 publication PNG, authored against a 622 × 264 mobile display box and rasterized at 4x. It is the same image used in Feed and detail views. Use at most three reader-essential groups: judgment, evidence/mechanism, and future/settlement. Primary copy is at least 20 px and secondary essential labels at least 16 px at display size. Verify the finished bitmap directly from pixels. Do not create or present an HTML preview, and do not render, upload, bind, or present separate compact, web, thumbnail, or OG files.
- Preserve a three-layer information spine: **orientation** (asset, direction, horizon), **proof and logic** (one dominant geometry, one or two decision-useful numbers, and the creator's mechanism), and **future resolution** (one confirmation, watch condition, open branch, or settlement clock). A chart cannot be an unlabeled decorative curve. When price is material, show a frozen historical price anchor, dated official close, reference level, interval return, drawdown, or spread value. Never label it current price, entry price, or the server-captured publication baseline before that baseline exists.
- A range visual must make `ASSET · RANGE ±X% · TO DATE` and the terminal band/checkpoint legible. It may show historical compression, realized movement, support/resistance, or a future band, but never fabricate a future price path or imply that interim breaches are being settled.
- A relative visual must make `A > B · TO DATE` legible, normalize both legs to the same dated baseline, and show the return spread plus terminal comparison—not two raw-price lines on one axis.
- A compound visual must make both independent rules and their `AND` join legible. Use synchronized baseline-relative geometry; combine a directional curve with a terminal band when needed, and keep “both conditions must hold” visible without turning the image into a form.
- Use minimal provenance but enough data semantics to understand the geometry. Keep the source family, as-of date, transform, and any material historical reference level legible. Synthetic fixtures are visibly non-publishable and can never masquerade as market observations.
- Preserve Cuebook identity while varying reading direction, chart share, geometry, narrative placement, type system, material, density, and light/dark tone. Generate and present one image at a time. A later visual-only reroll must take a materially different truthful route—not merely a new color—while preserving the same confirmed proposal.
- Emotional value is precision: make the creator's non-obvious intuition feel seen and publication-ready. Do not add generic praise, hype, certainty, or engagement bait.
- Alt text must describe the selected candidate's actual geometry. Never reuse a price-curve description for a scenario, drawdown, or Lens image.

## Quality And Latency

The runner must verify creator ownership, numerical source support, text-image division, future-time integrity, stable bindings, accessible SVG, exact dimensions, decodable and materially painted PNGs, copy fit, and collision-free mobile rendering. Retry only the failed query, copy, or raster stage.

- Warm target: 30–60 seconds from a ready connector to one complete Frame; a cold connector or browser start may take up to 120 seconds. Treat these as an engineering budget, never a promise or a reason to narrate waiting.
- Use one asset resolution, one shared evidence plan, one Cuebook batch plus one bounded authoritative Web batch when material, one reconciliation, this bounded interview, one text confirmation, and one runner invocation.
- After selection, publish in three remote steps: reserve the frozen image, signed PUT, then one high-level completion call. Reuse the runner's hash and size; after publication intent, do not reconfirm, rerun, audit, rebuild, prepare, poll, validate a receipt, reconcile, or read back. Replay uncertain transport once with the same key and payload; never retry domain rejection or alternate shapes.
- Do not reread the whole repository, inspect renderer source, rebuild valid stages, create a local OAuth client, or run release packaging before selection.
- When a valid title, body, and image exist, show the complete Frame and ask only for publication or a visual/copy change. A changed title, body, asset, direction, horizon, settlement meaning, or material premise invalidates the old confirmation and any dependent pixels.

After the Frame, give the one-sentence reveal: the preserved edge, visible connection, and useful future watch. Never provide provider coverage accounting or claim invisible value.

## Controlled Variation

Default to one strongest preview. If the creator asks for another version or a different visual direction, reuse the confirmed proposal: title, body, claim, adopted interview signal, exact tested observation, evidence refs, observation window, horizon, direction, settlement, visual requirements, and fact typing. Do not call Cuebook or Web again for a layout-only reroll.

Change one truthful expressive route and avoid the last two design or attention fingerprints when an equally truthful route exists. Return exactly one new variant at a time, even when the creator wants to explore a range; never turn the response into a gallery. Say the new emphasis in one phrase and ask whether this is the one. Stop offering variants when the creator is satisfied. A changed idea, premise, horizon, direction, or settlement meaning requires a new text confirmation.

## After The Creator Chooses

Freeze the selected title, body, meaning, evidence, and image bytes. Reuse the validated candidate, sole 2488 × 1056 PNG, hash, and byte size in the three-step [Frame Publish Workflow](references/frame-publish-workflow.md); let `complete_frame_publish` finish the server-owned work. Do not rebuild a graph, release bundle, HTML page, raster audit, manifest, contract, draft, or prepare payload.

Corrections and withdrawals use only their dedicated server actions. The ordinary selected PNG is already the finished publication master; no gallery, HTML, font file, or derivative is required. Keep wire types, hashes, mutation keys, and server states backstage.

Ordinary initial publication uses `complete_frame_publish`. Correction follows its matching prepare → publish pair without separate action consent. Withdrawals alone retain first-party consent and consent-status polling.

### Exact-Deadline Settlement

- Every eligible Frame uses the creator's exact `at_instant` deadline. The server freezes publication snapshot(s) and later selects the latest completed official observation(s) at or before it, regardless of market hours.
- `long` hits above the baseline and `short` below it; equality is flat. Freeze `threshold_bps: "0"` without a separate settlement interview.
- `range` is distinct from neutral: it hits when the absolute terminal return is less than or equal to the creator-confirmed `max_abs_move_bps`. Require an explicit `±X%`; never supply 3%, 5%, or any other preset. If help was requested, propose at most two bands from the existing shared read and require acceptance. An interim move outside the band followed by a return inside still hits.
- Treat “A will beat B” as relative: it compiles to equal-notional long A / short B and hits when `return(A) - return(B)` exceeds zero or an explicit creator margin. Both may rise or fall. Require two distinct same-session-family assets; no percentage question is needed for ordinary outperformance.
- Compound A-and-B evaluates two independent conditions at one deadline. Both must hit; any miss is miss, missing data is no_data only when neither leg misses, and directional equality is flat. If either leg is range, freeze its creator-confirmed ± band. Atomic direction legs use zero bps; require two distinct same-session-family assets.
- If the creator means “never leaves the band,” explain that Frame currently settles the endpoint only. Let them accept endpoint range or keep the thought non-settleable; never fake barrier monitoring.
- Confirm the human rule once before rendering. “Publish this” then writes it unchanged. Ask only for a missing asset, direction, horizon, range band, or explicit target/margin; never offer session counts or next-close rules.
- Keep OAuth, scopes, idempotency, tokens, and transaction checks intact; speed comes from the three-step server-owned publish lane, not weaker authority.

## Non-Negotiable Boundaries

- Never trade, silently publish, or create social variants. Public Cuebook content remains Frame; a separately confirmed TradingView projection is local workspace state, never Frame media.
- Never print mutable current or entry price in a pre-publish image without a backend quote or entry lock. Use the actual creator-owned clock, for example `BTC · TO AUG 14 · LONG`; historical axes and explicitly accepted settlement levels may remain when bound.
- A comparison becomes relative or compound settlement only after the creator confirms its meaning. Mixed session families such as BTC/QQQ still degrade to one asset or block explicitly.
- A creator-defined basket is a Creator Lens, never an official index. Show components, weights, origin, formula, and limitations in the expanded view; disclose retrospective selection bias when the basket was assembled after the observation window began.
- The public artifact is [Frame](references/frame.schema.json). Internal preview and release contracts remain available for lineage and backend compatibility but are never the product surface.
