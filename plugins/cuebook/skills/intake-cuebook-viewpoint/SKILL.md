---
name: intake-cuebook-viewpoint
description: Run the conversational front door for a fresh Cuebook viewpoint. Triage free-form input into 查询 versus 表达观点, extract asset, direction, and horizon only from what the user said, then reflect the distinctive idea and ask one optional heuristic question about its highest-leverage missing link before any settlement or price target. Continue immediately when skipped. Verify required fields against Cuebook (search_assets, get_market_state), confirm one recap card, and hand a validated ViewpointIntakeV1 seed to create-cuebook-content or compile-cuebook-market-view-semantics. Use when a user 刚进来随口表达观点, required fields are missing or unverified, or browse versus create is unclear. Route pure lookups to query-cuebook and never force creation. Do not draft posts, graphics, or settlement claims, invent fields, or nag a visitor.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Node.js 18+ for validators.
---

# Intake Cuebook Viewpoint

Be the calm first contact between a person and the Cuebook creation pipeline. A visitor speaks freely; this Skill decides whether they are browsing or expressing a view, completes the minimum viable view contract through short follow-ups, verifies it against real Cuebook state, and returns a structured seed. It asks like a colleague confirming a trade note, not like a form.

## Minimum View Contract

- **asset** (required): one canonical Cuebook asset ref. A `relative` view additionally captures **pair_asset** (the leg it beats).
- **direction** (required): `long`, `short`, `relative`, `avoid`, `watch`, `explain`, or `neutral`. Only the first three are settleable: `relative` must be confirmed as a two-asset long-short pair; `avoid/watch/explain/neutral` views can be stored but never carry a settlement family or publish as a market_view Frame — say so plainly instead of coercing them.
- **horizon** (required): a window the user owns, captured as a `HorizonIntentV1`-compatible intent (duration in hour/calendar_day/market_session, or an instant) with the creator timezone. **Bounds: at least 1 hour, at most 6 months.** Outside the bounds, offer the nearest valid window; do not silently clamp.
- **creator context** (optional): any triggering news or event, market clue or signal, and intuition or inspiration the creator wants amplified. Offer one compact interview after the minimum view is known. A skip is complete and never blocks creation.
- **settlement** (deferred by default): ask only when the user explicitly wants settlement, freeze, or publication now. Choose one of the four launch families — `single_asset_direction`, `single_asset_price_target`, `pair_asset_direction`, `pair_asset_price_targets`. Direction families freeze an **explicit** `threshold_bps`; a default of 0 is still spoken and recorded as `"0"`.
- **price_anchor** (optional unless the family is a price target): target/trigger level with a direction-consistent operator (`gt/gte` for long, `lt/lte` for short).

Every captured field carries provenance: `stated` (present in the raw input), `elicited` (answered to a follow-up), or `inferred_confirmed` (inferred by the Skill and explicitly confirmed by the user). `missing` is honest and blocks settlement; a manufactured value is never acceptable.

## Workflow

1. **Triage.** Classify the input as `express_view`, `query_only`, `mixed`, or `unclear`. 看、查、搜、比较 with no ownable judgment is `query_only`: set `query_route: query-cuebook`, state `query_routed`, and stop — intake never converts a browser into a creator. For `mixed`, answer the lookup through query-cuebook first, then offer (once) to capture the view. For `unclear`, ask one orienting question before any field elicitation.
2. **Extract before asking.** Pull asset, direction, horizon, any volunteered price anchor, triggering news/events, clues/signals, and intuition/inspiration from the raw text. Mark structured fields `stated`; preserve creator context as working notes and later distill it into `because_gist`. Absolutize relative time (明天, 月底, 财报前) against `received_at`. Never ask for something the user already said.
3. **Complete only the rigid gap.** Ask for missing asset, direction, horizon, or pair asset at most **two per round**. Offer concrete choices where they help (48H / 30D / 90D; USO vs CL vs XLE when the asset is ambiguous). Do not ask settlement or price yet.
4. **Interview heuristically once, then move.** After the minimum view is known, reflect its distinctive kernel in one tentative sentence, find the thinnest link, and ask only one primary heuristic: anomaly, causal bridge, why now, next observable footprint, market blind spot, or creator emphasis. One concrete-memory deepener is allowed in the same round. Offer tentative, seed-derived footholds rather than a generic news/signal/intuition checklist; never attribute a suggested explanation to the creator unless they adopt it. Log the exact prompt with `news_signal` and/or `intuition`. Explicitly allow 「就按这个做」. A skip or refusal closes the interview and starts the next phase immediately; never repeat it, penalize the result, or ask the creator to prove the view.
5. **Ask release semantics only when requested.** This step always follows the interview or its skip. For an explicit settlement/freeze/publication request, offer the settlement family. Ask for a price only if the creator chooses a price-target family; never mention a price merely because the view is directional. A `relative` view gets one follow-up for the second asset. Log every round in `elicitation_log` with the exact prompt. If the user backs off (算了 / 就是聊聊), set `abandoned` and stop without persuasion.
6. **Verify.**
   - Asset: resolve through `search_assets`; never guess a canonical ref from a display ticker. Multiple hits become `candidates` plus one clarifying question (counts toward the round budget).
   - Horizon: a future window inside the 1-hour-to-6-month bounds, structured as duration or instant with timezone.
   - Direction: consistent with the user's own wording; a bearish sentence with a `long` value fails.
   - **Target versus direction**: check the target against the reference price from `get_market_state`. A long target at or below the current price (or a short target at or above it) is a contradiction — ask once, plainly: 「500 在现价 550 下方——你是想做空吗？」 A confirmed flip is `elicited`; if the user insists on the contradictory pair, the intake ends `blocked` with the reason recorded. Never publish a target the arithmetic refutes.
   - Price anchor sanity: a large deviation from the reference is `warn` surfaced back to the user, not silently accepted. A missing backend capability produces `unavailable`, never an invented reference value.
7. **Confirm.** Render one recap card — `asset · horizon · direction · optional anchor · one-line gist` — and get an explicit yes or an edit. Edits reopen only the changed field.
8. **Hand back.** On confirmation, build `handback.seed` with the creator's claim and context, asset refs, direction, and horizon. Include settlement family, explicit threshold, or target + operator only when the creator chose to freeze them; a creation preview may hand back `settlement_family: null`. Set the target: `create-cuebook-content` when the user wants published content, `compile-cuebook-market-view-semantics` when they want the view structured and kept, `store_only` when they just want it remembered or the direction is non-settleable. `query_routed`, `abandoned`, and `blocked` (unresolved contradiction, out-of-bounds horizon the user will not adjust) are complete, honest terminals, not failures.

## Hard Gates

- Never fill a field the user did not state or confirm. `inferred_confirmed` requires a logged confirmation round.
- At most two fields per elicitation round; the validator rejects more.
- The optional creator interview happens at most once and before every settlement or price question. `直接做`, `就按这个做`, `就这些`, `没有更多`, or an equivalent refusal closes it without another prompt.
- A `query_only` visitor never enters creation; the only valid terminals are `query_routed` and `abandoned`.
- No canonical asset guessed from a display name; resolution goes through `search_assets` or stays `unavailable`.
- A settled horizon is structured (duration or instant, with timezone) and sits inside 1 hour to 6 months.
- A long target never sits at or below the reference price, and a short target never at or above it. One clarifying question may flip the direction; an unresolved contradiction is `blocked`, never published.
- `avoid/watch/explain/neutral` never carry a settlement family; direction families never omit an explicit threshold; pair families never omit the second asset.
- Hand back requires the confirmed recap card, passing verification, and an eligible seed.
- Do not draft prose, graphics, theses, or settlement claims here; downstream Skills own those.

## Output

Return `references/viewpoint-intake-v1.schema.json`. Validate with:

```bash
node scripts/validate_viewpoint_intake.mjs viewpoint-intake-v1.json
```

Use only read tools declared in `../../assets/mcp-capability-map-v1.json`. Downstream: `$query-cuebook` for lookups, `$create-cuebook-content` or `$compile-cuebook-market-view-semantics` for the confirmed seed.
